/**
 * W4-R（2026-11-08「会话创建准入按操作审批」方案 P1.3 §2.4.3 / I0-4）只读 Git 路由测试。
 *
 * 覆盖：`run_shell` 在 gate 放行后按程序名（basename/去 .exe|.cmd|.bat/小写）路由 `git`：
 * 有能力且 `match(argv)` 命中 ⇒ `execute(match, budgets)`（结果映射为与 spawn 相同的工具回执，
 * **不 spawn**）；无能力/未命中 ⇒ `readonly-git-runner-unavailable` 且零执行、绝不回退通用 spawn；
 * 非 git 维持现状 spawn；后台入口不做只读 Git 路由；`roleId`（来自适配器 options，非模型输入）与
 * `entry` 透传到审核/执行后审计。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type {
  BackgroundTaskCapability,
  BackgroundTaskSnapshot,
  GovernedToolsOptions,
  ReadonlyGitCapability,
  ReadonlyGitExecutionFacts,
  ShellGate,
  ShellReviewRequest,
  ToolDefinition,
} from "../../src/model/runtime.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { allow, role } from "./fixtures.ts";

interface SpawnCounter { readonly count: number; restore(): void }

/** 计数 `node:child_process` 的真实 spawn（真实委托；只观察，不改变行为）。 */
function countSpawns(): SpawnCounter {
  const childProcess = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
  const original = childProcess.spawn;
  let count = 0;
  childProcess.spawn = ((...args: Parameters<typeof original>) => { count++; return original.apply(childProcess, args); }) as typeof original;
  syncBuiltinESMExports();
  return { get count() { return count; }, restore() { childProcess.spawn = original; syncBuiltinESMExports(); } };
}

const isGitProgram = (value: unknown) => typeof value === "string" && /(^|[\\/])git(\.exe|\.cmd|\.bat)?$/i.test(value);

interface GitCapabilityFixture {
  capability: ReadonlyGitCapability;
  matchCalls: readonly string[][];
  executeCalls: Array<{ match: object; budgets?: { timeoutMs?: number; outputLimit?: number } }>;
}

function readonlyGitFixture(execute?: (match: object, budgets?: { timeoutMs?: number; outputLimit?: number }) => Promise<ReadonlyGitExecutionFacts>): GitCapabilityFixture {
  const matchCalls: string[][] = [], executeCalls: GitCapabilityFixture["executeCalls"] = [];
  const capability: ReadonlyGitCapability = {
    match(argv) {
      matchCalls.push([...argv]);
      return isGitProgram(argv[0]) && argv[1] === "status" ? { id: "status", template: "status", paths: [] } : undefined;
    },
    async execute(match, budgets) {
      executeCalls.push({ match, ...(budgets !== undefined ? { budgets } : {}) });
      return execute ? execute(match, budgets) : { exitCode: 0, stdout: "## fixture-status\n", stderr: "" };
    },
  };
  return { capability, matchCalls, executeCalls };
}

function toolByName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find(candidate => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

function fakeBackgroundManager(): { capability: BackgroundTaskCapability; starts: Array<{ command: string; argv: string[]; cwd: string; env: Record<string, string> }> } {
  const starts: Array<{ command: string; argv: string[]; cwd: string; env: Record<string, string> }> = [];
  const snapshot = (input: { command: string; argv: string[] }): BackgroundTaskSnapshot => ({
    taskId: "bg-1", state: "running", pid: 4242, command: input.command, startedAt: new Date().toISOString(), durationMs: 0,
  });
  const capability: BackgroundTaskCapability = {
    runningCount: 0,
    async start(input) { starts.push(input); return { ok: true, task: snapshot(input) }; },
    list() { return []; },
    read() { return undefined; },
    async stop() { return { ok: true, task: snapshot({ command: "", argv: [] }), alreadyEnded: true }; },
    async dispose() { /* fixture */ },
  };
  return { capability, starts };
}

test("W4 只读 Git 命中 ⇒ execute(match, budgets)，回执与 spawn 同形且零 spawn", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-git-hit-")), counter = countSpawns();
  try {
    const git = readonlyGitFixture(), gateCalls: ShellReviewRequest[] = [];
    const gate: ShellGate = async request => { gateCalls.push(request); return { allow: true, by: "w4-fixture" }; };
    const tools = buildGovernedTools(allow, { shellGate: gate, shellCwd: root, readonlyGit: git.capability, shellExecTimeoutMs: 1234 });
    const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "git status --porcelain" }, toolCallId: "call-w4-1" });
    assert.equal(result.ok, true, result.message);
    assert.equal(counter.count, 0, "命中只读 Git 绝不走通用 spawn");
    assert.deepEqual(git.matchCalls, [["git", "status", "--porcelain"]], "match 收到完整 argv（含程序名）");
    assert.equal(git.executeCalls.length, 1);
    assert.deepEqual(git.executeCalls[0]!.budgets, { timeoutMs: 1234, outputLimit: 1_048_576 });
    assert.deepEqual(git.executeCalls[0]!.match, { id: "status", template: "status", paths: [] });
    assert.equal((result.execution as { exitCode?: number }).exitCode, 0);
    assert.equal((result.execution as { stdout?: string }).stdout, "## fixture-status\n");
    assert.match(result.message, /run_shell 已执行：git status --porcelain/);
    assert.match(result.message, /只读 Git 白名单/);
    assert.equal(gateCalls.length, 1);
    assert.equal(gateCalls[0]!.entry, "run_shell");
    assert.deepEqual(gateCalls[0]!.argv, ["git", "status", "--porcelain"]);
    // 程序名归一：带路径/扩展名/大小写仍路由只读 Git。
    for (const program of ["git.exe", "C:\\tools\\git.cmd", "GIT"]) {
      const variant = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: `${program} status` } });
      assert.equal(variant.ok, true, program);
    }
    assert.equal(git.executeCalls.length, 4);
    assert.equal(counter.count, 0);
  } finally { counter.restore(); }
});

test("W4 无能力/未命中 ⇒ readonly-git-runner-unavailable，零 spawn、零 execute、绝无通用回退", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-git-unavailable-")), counter = countSpawns();
  const gate: ShellGate = async () => ({ allow: true, by: "w4-fixture" });
  try {
    // 无能力
    const noCapability = buildGovernedTools(allow, { shellGate: gate, shellCwd: root });
    const missing = await toolByName(noCapability, "run_shell").handler({ name: "run_shell", args: { command: "git status" } });
    assert.equal(missing.ok, false);
    assert.match(missing.message, /readonly-git-runner-unavailable/);
    assert.match(missing.message, /git_query/);
    // 有能力但未命中（如 git commit）
    const git = readonlyGitFixture();
    const withCapability = buildGovernedTools(allow, { shellGate: gate, shellCwd: root, readonlyGit: git.capability });
    const miss = await toolByName(withCapability, "run_shell").handler({ name: "run_shell", args: { command: "git commit -m x" } });
    assert.equal(miss.ok, false);
    assert.match(miss.message, /readonly-git-runner-unavailable/);
    assert.equal(git.matchCalls.length, 1);
    assert.equal(git.executeCalls.length, 0);
    assert.equal(counter.count, 0, "未命中只读白名单也不得回退通用 spawn");
  } finally { counter.restore(); }
});

test("W4 审核先于路由：gate 拒绝 / F-7 守卫命中 ⇒ match/execute 均不调用、零 spawn", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-git-gate-")), counter = countSpawns();
  try {
    const git = readonlyGitFixture();
    const denyGate: ShellGate = async () => ({ allow: false, reason: "fixture deny", by: "w4-fixture" });
    const denied = await toolByName(buildGovernedTools(allow, { shellGate: denyGate, shellCwd: root, readonlyGit: git.capability }), "run_shell")
      .handler({ name: "run_shell", args: { command: "git status" } });
    assert.equal(denied.ok, false); assert.match(denied.message, /审核拒绝/);
    let gateCalls = 0;
    const guardGate: ShellGate = async () => { gateCalls++; return { allow: true, by: "w4-fixture" }; };
    const guarded = await toolByName(buildGovernedTools(allow, { shellGate: guardGate, shellCwd: root, readonlyGit: git.capability }), "run_shell")
      .handler({ name: "run_shell", args: { command: "git status | cat" } });
    assert.equal(guarded.ok, false);
    assert.equal(gateCalls, 0, "F-7 执行层守卫先于审核与路由");
    assert.equal(git.matchCalls.length, 0);
    assert.equal(git.executeCalls.length, 0);
    assert.equal(counter.count, 0);
  } finally { counter.restore(); }
});

test("W4 非 git 命令维持现状 spawn", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-nongit-")), counter = countSpawns();
  try {
    const git = readonlyGitFixture();
    const gate: ShellGate = async () => ({ allow: true, by: "w4-fixture" });
    const result = await toolByName(buildGovernedTools(allow, { shellGate: gate, shellCwd: root, readonlyGit: git.capability }), "run_shell")
      .handler({ name: "run_shell", args: { command: `${process.execPath} --version` } });
    assert.equal(result.ok, true, result.message);
    assert.equal(counter.count, 1);
    assert.match(String((result.execution as { stdout?: string }).stdout), /^v\d+/);
    assert.equal(git.matchCalls.length, 0, "非 git 程序不触碰只读 Git 能力");
  } finally { counter.restore(); }
});

test("W4 后台入口不做只读 Git 路由：命令仍交管理器 spawn，能力不经手", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-git-background-")), counter = countSpawns();
  try {
    const git = readonlyGitFixture(), manager = fakeBackgroundManager();
    const gateCalls: ShellReviewRequest[] = [];
    const gate: ShellGate = async request => { gateCalls.push(request); return { allow: true, by: "w4-fixture" }; };
    const tools = buildGovernedTools(allow, { shellGate: gate, shellCwd: root, readonlyGit: git.capability, backgroundTasks: manager.capability });
    const result = await toolByName(tools, "start_background_task").handler({ name: "start_background_task", args: { command: "git status" } });
    assert.equal(result.ok, true, result.message);
    assert.equal(gateCalls.length, 1);
    assert.equal(gateCalls[0]!.entry, "start_background_task");
    assert.deepEqual(manager.starts[0]!.argv, ["git", "status"], "后台入口保持既有 manager.start 路径（审核链负责拒绝）");
    assert.equal(git.matchCalls.length, 0);
    assert.equal(git.executeCalls.length, 0);
    assert.equal(counter.count, 0, "本用例中 manager 为桩件，真实 spawn 计数为 0");
  } finally { counter.restore(); }
});

test("W4 roleId（适配器 options，非模型输入）与 entry 透传审核与执行后审计", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-roleid-"));
  const reviewCalls: ShellReviewRequest[] = [];
  const denyGate: ShellGate = async request => { reviewCalls.push(request); return { allow: false, reason: "w4 fixture deny", by: "w4-fixture" }; };
  const options: GovernedToolsOptions = { roleId: "product", shellGate: denyGate, shellCwd: root };
  const tools = buildGovernedTools(allow, options);
  await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "touch x" } });
  assert.equal(reviewCalls[0]!.roleId, "product");
  assert.equal(reviewCalls[0]!.entry, "run_shell");
  // 模型输入不能提供 roleId（schema 只有 command；args 夹带也被忽略，角色仍取适配器 options）。
  await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "touch x", roleId: "forged-superuser" } });
  assert.equal(reviewCalls[1]!.roleId, "product");
  // 执行后审计同口径携带 roleId/entry（只读 Git 路径同样）。
  const git = readonlyGitFixture(), auditCalls: Array<{ request: ShellReviewRequest; outcome: unknown }> = [];
  const allowGate: ShellGate = async () => ({ allow: true, by: "w4-fixture" });
  const audited = buildGovernedTools(allow, { roleId: "product", shellGate: allowGate, shellCwd: root, readonlyGit: git.capability,
    shellPostAudit: (request, outcome) => { auditCalls.push({ request, outcome }); return { violations: [] }; } });
  const result = await toolByName(audited, "run_shell").handler({ name: "run_shell", args: { command: "git status" } });
  assert.equal(result.ok, true, result.message);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0]!.request.roleId, "product");
  assert.equal(auditCalls[0]!.request.entry, "run_shell");
  assert.deepEqual(auditCalls[0]!.outcome, { exitCode: 0 });
});

test("W4 真实 Service 入口：run_shell 携带会话 roleId（demo 适配器闭环）", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-service-"));
  const calls: ShellReviewRequest[] = [];
  const gate: ShellGate = async request => { calls.push(request); return { allow: true, by: "w4-service-fixture" }; };
  const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, shellGate: gate,
    script: [{ name: "run_shell", args: { command: `${process.execPath} --version` } }] }).bindRole(role("worker"));
  try {
    assert.ok(session.inspectToolSurface!().appTools.includes("run_shell"));
    await session.prompt("exercise actual run_shell roleId passthrough");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.roleId, "worker");
    assert.equal(calls[0]!.entry, "run_shell");
  } finally { await session.dispose(); }
});

test("W4 真实 Service 入口：readonlyGit 注入可达（demo 适配器闭环，零 spawn）", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-service-git-")), counter = countSpawns();
  try {
    const git = readonlyGitFixture();
    const gate: ShellGate = async () => ({ allow: true, by: "w4-service-fixture" });
    const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, shellGate: gate,
      readonlyGit: git.capability, script: [{ name: "run_shell", args: { command: "git status" } }] }).bindRole(role("worker"));
    try {
      await session.prompt("exercise actual readonly git injection");
      assert.equal(git.matchCalls.length, 1);
      assert.equal(git.executeCalls.length, 1);
      assert.equal(counter.count, 0, "Service 注入的只读 Git 能力承接执行，零通用 spawn");
    } finally { await session.dispose(); }
  } finally { counter.restore(); }
});

test("W4 只读 Git 执行事实映射：超时/错误/抛错/非法回执与 spawn 分支同形", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w4-map-")), counter = countSpawns();
  try {
    const gate: ShellGate = async () => ({ allow: true, by: "w4-fixture" });
    const run = async (execute: () => Promise<ReadonlyGitExecutionFacts>) => {
      const git = readonlyGitFixture(execute);
      return toolByName(buildGovernedTools(allow, { shellGate: gate, shellCwd: root, readonlyGit: git.capability }), "run_shell")
        .handler({ name: "run_shell", args: { command: "git status" } });
    };
    const timedOut = await run(async () => ({ timedOut: true, timeoutMs: 5000, stdout: "partial", stderr: "" }));
    assert.equal(timedOut.ok, false); assert.equal((timedOut.execution as { timedOut?: boolean }).timedOut, true);
    assert.match(timedOut.message, /超时已终止（5000 ms）/);
    const failed = await run(async () => ({ error: "fixed transport failed", stdout: "", stderr: "" }));
    assert.equal(failed.ok, false); assert.match(failed.message, /执行失败（未能启动或运行）：fixed transport failed/);
    const thrown = await run(async () => { throw new Error("transport exploded"); });
    assert.equal(thrown.ok, false); assert.match(thrown.message, /只读 Git 固定传输.*transport exploded/);
    const malformed = await run((async () => null) as unknown as () => Promise<ReadonlyGitExecutionFacts>);
    assert.equal(malformed.ok, false); assert.match(malformed.message, /执行事实非法/);
    assert.equal(counter.count, 0);
  } finally { counter.restore(); }
});

test("W4 工具说明补充只读 Git 白名单与 git_query 指引（输入字段不变：run_shell 仍只有 command）", () => {
  const runShell = describeTool("run_shell");
  const parameters = runShell.parameters as { properties: Record<string, unknown>; additionalProperties?: boolean };
  assert.deepEqual(Object.keys(parameters.properties), ["command"]);
  assert.match(runShell.description, /只读子命令/);
  for (const sub of ["status", "log", "diff", "show", "rev-parse", "ls-files", "ls-tree", "merge-base", "blame", "cat-file"]) {
    assert.ok(runShell.description.includes(sub), sub);
  }
  assert.match(runShell.description, /git_query/);
  assert.match(runShell.description, /git_candidate/);
  assert.match(runShell.description, /git_publish/);
  assert.ok(Array.isArray(runShell.promptGuidelines) && runShell.promptGuidelines!.some(line => line.includes("git_query")));
  assert.match(describeTool("start_background_task").description, /后台入口不接受 `git` 命令/);
});
