// test/测试/session-admission-approval-integration.test.ts
// D1 跨角色集成（2026-11-08「会话创建准入按操作审批」；设计 P1.3 §2.2–§2.5、§6.1；B1 v1 AC-1/4/5/6/7/11/12/13/14/18/22/27/30）。
//
// 覆盖（跨层、非模块单测重复）：
//   1. 受保护项目 + 注册 shell + 真实 `assemble*`/`createShellGate` + file sink：prepareRole observed+token、
//      bindPreparedRole 成功、`session.open.ready`、appTools 含 run_shell/start_background_task、plan.approvalChain。
//   2. 负例：裸函数 gate 无 binding ⇒ protected-scope-approval-chain-unproven（不 bind/无 ready）；
//      审计不可用（memory/custom/无 probe/真实 file sink 被边界拒）⇒ protected-scope-audit-unavailable；
//      custom factory/demo/unknown scope 仍拒。
//   3. run_shell/start_background_task 端到端（桩执行）：allow/deny/timeout、entry 区分、拒绝/超时零执行；
//      只读 Git gate allow 后经注入能力 match+execute（stub）执行、不 spawn；能力缺席/未命中 ⇒
//      readonly-git-runner-unavailable 且零执行；非 git 正常 spawn。
//   4. writeGuard 注入断言（AC-14/AC-30）：接 (a) 的装配路径携带 writeGuard；advisory/operatorOnly 下裸
//      Git 写被 writeGuard 硬拒（不咨询 (a)）；只读档不接 (a)、c=deny 即终结；后台入口 Git 拒绝（AC-22）。
//   5. PR #72 契约：含 shell 会话 strict surface 仍 unknown；approvalChain 只进创建准入，写/发布门不消费
//      应用中介证据；composeRuntimeApplicationMediation 语义不变。
//
// 纪律：不运行真实模型/Electron/CDP；不写产品源码；不修改既有断言、不加 skip、不使用 --test-force-exit；
// 执行全部为假件（门禁判定 + 桩执行/桩后台管理器），真实件为装配/Service/工具层/门禁引擎。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";

import {
  createShellGate,
  BRANCH_C_ALLOW,
  BRANCH_WRITE_GUARD_DENY,
} from "../../src/common/编排/shell-gate.ts";
import {
  createFileAuditSink,
  createMemoryAuditSink,
  buildShellAuditGate,
  SHELL_AUDIT_REL_PATH,
  type ShellAuditSink,
} from "../../src/common/编排/shell-audit.ts";
import {
  inspectShellApproval,
  probeShellApproval,
} from "../../src/common/shared/shell-approval-binding.ts";
import {
  classifyShell,
  defaultShellRules,
  matchReadonlyGit,
} from "../../src/service/gate/shell-rules.ts";
import {
  createRuntimeAdapter,
  composeRuntimeApplicationMediation,
} from "../../src/service/runtime/session.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import {
  createRuntimeAdapterFactory,
  openRoleSession,
  type RuntimeAdapterFactoryOptions,
} from "../../src/pipeline/orchestration/run-role.ts";
import {
  assembleOperatorShellGate,
  assembleProjectShellGate,
  assembleReadonlyShellGate,
} from "../../src/pipeline/orchestration/shell-arming.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { BoundaryEntry, BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectConfig, ResolvedRole } from "../../src/model/role.ts";
import type {
  BackgroundTaskCapability,
  BackgroundTaskSnapshot,
  GovernedToolsOptions,
  OperatorPrompt,
  ReadonlyGitCapability,
  ReadonlyGitExecutionFacts,
  ShellGate,
  ShellReviewRequest,
  ToolDefinition,
  WriteGate,
} from "../../src/model/runtime.ts";

// —————————————————————— 公共夹具 ——————————————————————

const SRC_ENTRY: BoundaryEntry = { root: "project", path: "src/thing.ts", kind: "file", purpose: "测试条目" };
const AUDIT_ENTRY: BoundaryEntry = { root: "project", path: "docs/audit/", kind: "conditional-directory", condition: "shell-gate", purpose: "shell 闸审计留痕" };

function roleBoundaryYaml(roleId: string): string {
  return [
    `role: ${roleId}`,
    "entries:",
    "  - kind: file",
    "    path: src/thing.ts",
    "    purpose: 测试条目",
    "  - kind: conditional-directory",
    "    path: docs/audit/",
    "    condition: shell-gate",
    "    root: project",
    "    purpose: shell 闸审计留痕",
    "",
  ].join("\n");
}

/** 项目角色夹具（worker；非治理角色名，确保走项目角色三层链）。 */
async function makeProject(prefix: string, options: { auditBoundary?: boolean } = {}): Promise<ProjectConfig> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const dir = path.join(root, "角色卡", "worker");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "role-card.md"), "# worker\n");
  const yaml = options.auditBoundary === false
    ? ["role: worker", "entries:", "  - kind: file", "    path: src/thing.ts", "    purpose: 测试条目", ""].join("\n")
    : roleBoundaryYaml("worker");
  await fsp.writeFile(path.join(dir, "boundary.yaml"), yaml);
  return {
    projectRoot: root,
    skillRoot: path.join(root, "skill-root"),
    roles: { worker: { card: "角色卡/worker/role-card.md", boundary: "角色卡/worker/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/worker/boundary.yaml", acceptance: { accepted: true, source: "test:d1" } },
  };
}

/** 构造受保护范围（合法 init-source；与 W2-R 夹具同形）。 */
async function markRequired(root: string): Promise<void> {
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = path.join(root, ".ans", "trunk", "initialization-sources");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${sourceId}.json`), JSON.stringify({
    schema: "repository-work-source/v1",
    kind: "customer-turn",
    sourceId,
    projectRoot: root,
  }));
}

function resolvedRole(id = "worker"): ResolvedRole {
  return {
    id,
    kind: "project",
    cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture",
    location: { card: "fixture", boundary: "fixture" },
  };
}

const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "d1-fixture" } });

const denyOperator = () => ({ outcome: "deny" as const, operatorId: "d1-客户", reason: "d1 fixture deny" });
const allowOperator = () => ({ outcome: "allow" as const, operatorId: "d1-客户" });

function codexOptions(): RuntimeAdapterFactoryOptions {
  return { baseUrl: "http://127.0.0.1:9/v1", modelId: "d1-fixture", apiKeyEnvVar: "ANS_D1_CODEX_KEY" };
}

/** Codex 默认工厂严格路径所需环境（假配置；不触网）。 */
async function withCodexEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_D1_CODEX_KEY"] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat";
  process.env.ANS_CODEX_WEB_SEARCH = "off";
  process.env.ANS_D1_CODEX_KEY = "fixture-not-a-real-key";
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

/** 诊断捕获（openRoleSession 的 session.open.* 事件）；返回执行结果与读到的全部事件名。 */
async function withDiagnostics<T>(fn: () => Promise<T>): Promise<{ value: T; events: string[] }> {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-d1-diagnostics-"));
  configureDiagnostics({ directory });
  const events: string[] = [];
  try {
    const value = await fn();
    await flushDiagnostics();
    for (const file of await fsp.readdir(directory)) {
      if (!/^ans-diagnostics-.*\.jsonl$/.test(file)) continue;
      const text = await fsp.readFile(path.join(directory, file), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try { events.push(String((JSON.parse(line) as { event?: unknown }).event)); } catch { /* 坏行跳过 */ }
      }
    }
    return { value, events };
  } finally {
    await disposeDiagnostics();
  }
}

/** 真实写目标守卫（与 run-role 同源 evaluateShellWriteTargets；空边界 ⇒ 裸 Git 一律命中硬拒）。 */
const EMPTY_BOUNDARY: BoundarySection1 = { entries: [], boundarySource: "<d1:no-boundary>", acceptance: { accepted: true, source: "test:d1" } };
function realWriteGuard(project: ProjectConfig) {
  return (request: { argv: readonly string[]; cwd: string; entry?: "run_shell" | "start_background_task" }) =>
    evaluateShellWriteTargets({
      argv: request.argv,
      cwd: request.cwd,
      entry: request.entry ?? "run_shell",
      projectRoot: project.projectRoot,
      skillRoot: project.skillRoot,
      boundary: EMPTY_BOUNDARY,
      checkWrite: () => ({ allowed: true }),
      forbiddenPrefixes: [],
    });
}

interface SpawnCounter { readonly count: number; restore(): void }
/** 计数 `node:child_process` 的真实 spawn（真实委托；只观察，不改变行为）。 */
function countSpawns(): SpawnCounter {
  const childProcess = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
  const original = childProcess.spawn;
  let count = 0;
  childProcess.spawn = ((...args: Parameters<typeof original>) => { count += 1; return original.apply(childProcess, args); }) as typeof original;
  syncBuiltinESMExports();
  return { get count() { return count; }, restore() { childProcess.spawn = original; syncBuiltinESMExports(); } };
}

function toolByName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

function fakeBackgroundManager(): { capability: BackgroundTaskCapability; starts: Array<{ command: string; argv: string[]; cwd: string; env: Record<string, string> }> } {
  const starts: Array<{ command: string; argv: string[]; cwd: string; env: Record<string, string> }> = [];
  const snapshot = (input: { command: string; argv: string[] }): BackgroundTaskSnapshot => ({
    taskId: "bg-d1", state: "running", pid: 4242, command: input.command, startedAt: new Date().toISOString(), durationMs: 0,
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

function readonlyGitFixture(execute?: (match: object, budgets?: { timeoutMs?: number; outputLimit?: number }) => Promise<ReadonlyGitExecutionFacts>): {
  capability: ReadonlyGitCapability;
  matchCalls: string[][];
  executeCalls: Array<{ match: object; budgets?: { timeoutMs?: number; outputLimit?: number } }>;
} {
  const matchCalls: string[][] = [];
  const executeCalls: Array<{ match: object; budgets?: { timeoutMs?: number; outputLimit?: number } }> = [];
  const capability: ReadonlyGitCapability = {
    match(argv) {
      matchCalls.push([...argv]);
      return matchReadonlyGit([...argv]);
    },
    async execute(match, budgets) {
      executeCalls.push({ match, ...(budgets !== undefined ? { budgets } : {}) });
      return execute !== undefined ? execute(match, budgets) : { exitCode: 0, stdout: "## d1-fixture-status\n", stderr: "" };
    },
  };
  return { capability, matchCalls, executeCalls };
}

// —————————————————————— 1. 受保护项目 + 真实装配 + file sink（AC-1 的跨层面） ——————————————————————

test("D1-1 受保护 + 注册 shell + 真实 assemble*/createShellGate + file sink：准入 observed/token、bind 成功、session.open.ready、appTools 含 shell、plan.approvalChain", async () => {
  await withCodexEnv(async () => {
    const project = await makeProject("ans-d1-admit-");
    await markRequired(project.projectRoot);
    try {
      const { events } = await withDiagnostics(async () => {
        const handle = await openRoleSession({
          roleId: "worker",
          runtime: "codex",
          project,
          autoRepin: false,
          shellOperatorChannel: denyOperator,
          shellArming: { pmRoleId: "worker", classifyShell, rules: defaultShellRules() },
        }, { runtimeOptions: codexOptions() });
        try {
          assert.equal(typeof handle.sessionId, "string", "session.open.ready 的会话必须有 id");
          const surface = handle.inspectToolSurface!();
          assert.ok(surface.appTools.includes("run_shell"), `appTools: ${surface.appTools.join(",")}`);
          assert.ok(surface.appTools.includes("start_background_task"));
          assert.equal(surface.status, "unknown", "PR #72 严格 surface 仍 unknown（准入不冒充 native observed）");
        } finally {
          await handle.dispose();
        }
      });
      // 诊断事件（dispose 后 flush 读取）：会话真实创建成功的可核事实。
      assert.ok(events.includes("session.open.start"), `diagnostics: ${events.join(",")}`);
      assert.ok(events.includes("session.open.ready"), `diagnostics: ${events.join(",")}`);

      // 同一真实装配（assembleProjectShellGate 产出、createShellGate 唯一登记、默认 file sink）上显式核对 plan 字段。
      const gate = await assembleProjectShellGate({
        project,
        pmRoleId: "worker",
        classifyShell,
        rules: defaultShellRules(),
        operatorChannel: denyOperator,
        auditFailurePolicy: "deny-non-readonly",
        sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "codex", codexOptions()) },
      });
      const facts = inspectShellApproval(gate);
      assert.ok(facts, "createShellGate 构造成功后必须已登记（唯一登记点）");
      assert.equal(facts.source, "orchestration-shell-gate");
      assert.equal(facts.version, 1);
      assert.equal(facts.projectRoot, project.projectRoot, "projectRoot 是准入绑定字段");
      assert.deepEqual(facts.audit, { sink: "file", durable: true, probe: "unknown", relPath: SHELL_AUDIT_REL_PATH });
      assert.equal((await probeShellApproval(gate))?.audit.probe, "ok", "真实 file sink 探针（含 refresh 一次重试）必须 ok");
      assert.equal(fs.existsSync(path.join(project.projectRoot, "docs", "audit")), false, "探针是纯判定：不写盘、不建目录");

      const adapter = createRuntimeAdapter({
        runtime: "codex",
        gate: allowGate,
        projectRoot: project.projectRoot,
        skillRoot: project.skillRoot,
        shellGate: gate,
        ...codexOptions(),
      });
      const prepared = await adapter.prepareRole!(resolvedRole("worker"));
      assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
      assert.ok(prepared.token, "observed 必须发 token");
      const chain = prepared.plan.approvalChain;
      assert.ok(chain, "plan.approvalChain 必须存在");
      assert.equal(chain.source, "orchestration-shell-gate");
      assert.equal(chain.mode, "rules-advisory", "项目三层链 advisory 缺省");
      assert.equal(chain.classifier, true);
      assert.equal(chain.rules, true);
      assert.equal(chain.pmAsk, true);
      assert.equal(chain.operatorChannel, true);
      assert.deepEqual(chain.audit, { sink: "file", durable: true, probe: "ok", relPath: SHELL_AUDIT_REL_PATH });
      assert.equal(chain.projectRoot, project.projectRoot);
      assert.equal(prepared.plan.factoryProvenance, "default-production");
      assert.equal(prepared.plan.native?.status, "observed", "Codex 严格 native 路径仍 observed");
      const session = await adapter.bindPreparedRole!(prepared.token!);
      try {
        const surface = session.inspectToolSurface!();
        assert.ok(surface.appTools.includes("run_shell"));
        assert.ok(surface.appTools.includes("start_background_task"));
      } finally {
        await session.dispose();
      }
    } finally {
      await fsp.rm(project.projectRoot, { recursive: true, force: true });
    }
  });
});

// —————————————————————— 2. 负例：无 binding / 审计不可用 / 既有拒绝保留 ——————————————————————

test("D1-2 裸函数 gate 无 binding ⇒ protected-scope-approval-chain-unproven；不 bind、无 session.open.ready、gate 零调用", async () => {
  await withCodexEnv(async () => {
    const project = await makeProject("ans-d1-unproven-");
    await markRequired(project.projectRoot);
    try {
      let gateCalls = 0;
      const rawGate: ShellGate = async () => { gateCalls += 1; return { allow: true, by: "d1-raw" }; };
      const adapter = createRuntimeAdapter({
        runtime: "codex", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot, shellGate: rawGate, ...codexOptions(),
      });
      const prepared = await adapter.prepareRole!(resolvedRole("worker"));
      assert.equal(prepared.plan.status, "unknown");
      assert.equal(prepared.token, undefined);
      assert.ok(prepared.plan.reasons.includes("protected-scope-approval-chain-unproven"));
      assert.equal(prepared.plan.reasons.includes("required-scope-unconfined-script-tools"), false, "退役 reason 不再产生");
      assert.equal("approvalChain" in prepared.plan, false);
      assert.equal(gateCalls, 0, "准入读取 binding 事实，不调用 gate 本身");
      await assert.rejects(adapter.bindRole(resolvedRole("worker")), /runtime-protected-scope-requires-verified-plan/);
      await assert.rejects(adapter.composeContext(resolvedRole("worker")), /runtime-protected-scope-requires-verified-plan/);

      // 经真实 openRoleSession 的拒绝语义（自定义 adapter 只用于注入禁得住的 raw gate；不 bind 即无会话）。
      let bindAttempted = false;
      const factory = (_gate: WriteGate): ReturnType<typeof createRuntimeAdapter> => {
        const inner = createRuntimeAdapter({
          runtime: "codex", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot, shellGate: rawGate, ...codexOptions(),
        });
        return {
          ...inner,
          async bindPreparedRole(token) { bindAttempted = true; return inner.bindPreparedRole!(token); },
          async bindRole(role) { bindAttempted = true; return inner.bindRole(role); },
        };
      };
      const { events } = await withDiagnostics(async () => {
        await assert.rejects(
          () => openRoleSession({ roleId: "worker", runtime: "codex", project, autoRepin: false, shellOperatorChannel: denyOperator }, { createAdapter: factory }),
          /runtime-creation-admission-unproven:protected-scope-approval-chain-unproven/,
        );
      });
      assert.equal(bindAttempted, false, "准入拒绝必须发生在 bind 之前");
      assert.ok(events.includes("session.open.start"));
      assert.equal(events.includes("session.open.ready"), false, "拒绝会话不得记录 session.open.ready");
    } finally {
      await fsp.rm(project.projectRoot, { recursive: true, force: true });
    }
  });
});

test("D1-3 审计不可用：memory/custom/无 probe/真实 file sink 被边界拒 ⇒ protected-scope-audit-unavailable（不创建）", async () => {
  await withCodexEnv(async () => {
    const project = await makeProject("ans-d1-audit-");
    await markRequired(project.projectRoot);
    const noAuditBoundaryProject = await makeProject("ans-d1-audit-denied-", { auditBoundary: false });
    await markRequired(noAuditBoundaryProject.projectRoot);
    try {
      const assemble = async (auditSink: ShellAuditSink | undefined, target = project) => assembleProjectShellGate({
        project: target,
        pmRoleId: "worker",
        classifyShell,
        rules: defaultShellRules(),
        operatorChannel: denyOperator,
        ...(auditSink !== undefined ? { auditSink } : {}),
        sessionDeps: { createAdapter: createRuntimeAdapterFactory(target, "codex", codexOptions()) },
      });
      const customSink: ShellAuditSink = { async append() { return { ok: true }; } };
      const cases: Array<[string, () => Promise<ShellGate>, ProjectConfig, string]> = [
        ["memory + durable:false", () => assemble(createMemoryAuditSink()), project, "protected-scope-audit-unavailable"],
        ["custom 无 describe/probe", () => assemble(customSink), project, "protected-scope-audit-unavailable"],
        ["真实 file sink 被边界拒绝（无 docs/audit 条件目录）", () => assemble(undefined, noAuditBoundaryProject), noAuditBoundaryProject, "protected-scope-audit-unavailable"],
      ];
      for (const [label, makeGate, target, expected] of cases) {
        const gate = await makeGate();
        const prepared = await createRuntimeAdapter({
          runtime: "codex", gate: allowGate, projectRoot: target.projectRoot, skillRoot: target.skillRoot, shellGate: gate, ...codexOptions(),
        }).prepareRole!(resolvedRole("worker"));
        assert.equal(prepared.plan.status, "unknown", label);
        assert.equal(prepared.token, undefined, label);
        assert.ok(prepared.plan.reasons.includes(expected), `${label}: ${JSON.stringify(prepared.plan.reasons)}`);
        assert.equal(prepared.plan.reasons.includes("protected-scope-approval-chain-unproven"), false, label);
        assert.equal("approvalChain" in prepared.plan, false, label);
      }
    } finally {
      await fsp.rm(project.projectRoot, { recursive: true, force: true });
      await fsp.rm(noAuditBoundaryProject.projectRoot, { recursive: true, force: true });
    }
  });
});

test("D1-4 既有拒绝保留：custom factory / demo / unknown scope 仍拒（reason 不变）", async () => {
  const project = await makeProject("ans-d1-legacy-");
  await markRequired(project.projectRoot);
  try {
    // demo：受保护范围仍按 protected-scope-default-native-plan-required 拒绝。
    const demo = await createRuntimeAdapter({ runtime: "demo", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot })
      .prepareRole!(resolvedRole("worker"));
    assert.equal(demo.plan.status, "unknown");
    assert.ok(demo.plan.reasons.includes("protected-scope-default-native-plan-required"));
    // custom factory：custom-override + 既有拒绝保留。
    const custom = await createRuntimeAdapter({
      runtime: "claude", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot,
      providerFactories: { claude: (options) => createDemoRuntimeAdapter(options) },
    }).prepareRole!(resolvedRole("worker"));
    assert.equal(custom.plan.status, "unknown");
    assert.equal(custom.plan.factoryProvenance, "custom-override");
    assert.ok(custom.plan.reasons.includes("protected-scope-default-native-plan-required"));
    assert.ok(custom.plan.reasons.includes("custom-provider-factory-unverified"));
    // unknown scope：项目根不可读 ⇒ runtime-protection-scope-unknown（不静默放行）。
    const missing = path.join(os.tmpdir(), `ans-d1-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const unknown = await createRuntimeAdapter({ runtime: "claude", gate: allowGate, projectRoot: missing, skillRoot: missing });
    const prepared = await unknown.prepareRole!(resolvedRole("worker"));
    assert.equal(prepared.plan.status, "unknown");
    assert.ok(prepared.plan.reasons.includes("runtime-protection-scope-unknown"));
    await assert.rejects(unknown.bindRole(resolvedRole("worker")), /runtime-protection-scope-unknown/);
  } finally {
    await fsp.rm(project.projectRoot, { recursive: true, force: true });
  }
});

// —————————————————————— 3. run_shell / start_background_task 端到端（桩执行） ——————————————————————

test("D1-5 run_shell/start_background_task 端到端：allow/deny/timeout、entry 区分、拒绝/超时零执行", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-d1-shell-"));
  try {
    const reviewRequests: ShellReviewRequest[] = [];
    const riskyGate = (outcome: () => unknown, timeoutMs?: number): ShellGate => {
      const gate = createShellGate({
        projectRoot: root,
        classifyShell: () => "risky",
        rules: { version: "4", readOnly: [], hardDenyPrograms: [], riskyPrograms: [], denyTokens: [] },
        audit: createMemoryAuditSink(),
        operatorChannel: (prompt: OperatorPrompt) => { void prompt; return outcome() as never; },
        ...(timeoutMs !== undefined ? { operatorTimeoutMs: timeoutMs } : {}),
      });
      return async (request) => { reviewRequests.push(request); return gate(request); };
    };
    const command = `${process.execPath} --version`;

    // allow ⇒ 执行（真实 spawn 恰一次）；entry/roleId 进入审核请求。
    {
      const counter = countSpawns();
      try {
        const tools = buildGovernedTools(allowGate, { shellGate: riskyGate(allowOperator), shellCwd: root, roleId: "worker" });
        const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command }, toolCallId: "d1-allow" });
        assert.equal(result.ok, true, result.message);
        assert.equal(counter.count, 1, "allow ⇒ 真实执行一次（桩命令 node --version）");
        assert.equal(reviewRequests.at(-1)!.entry, "run_shell");
        assert.equal(reviewRequests.at(-1)!.roleId, "worker", "roleId 来自适配器 options（非模型输入）");
      } finally { counter.restore(); }
    }
    // deny ⇒ 零执行。
    {
      const counter = countSpawns();
      try {
        const tools = buildGovernedTools(allowGate, { shellGate: riskyGate(denyOperator), shellCwd: root, roleId: "worker" });
        const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command }, toolCallId: "d1-deny" });
        assert.equal(result.ok, false);
        assert.match(result.message, /审核拒绝/);
        assert.equal(counter.count, 0, "deny ⇒ 零执行");
      } finally { counter.restore(); }
    }
    // timeout（通道不答 + operatorTimeoutMs）⇒ 零执行。
    {
      const counter = countSpawns();
      try {
        const gate = riskyGate(() => new Promise(() => undefined), 80);
        const tools = buildGovernedTools(allowGate, { shellGate: gate, shellCwd: root, roleId: "worker" });
        const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command }, toolCallId: "d1-timeout" });
        assert.equal(result.ok, false);
        assert.equal(counter.count, 0, "timeout ⇒ 零执行");
      } finally { counter.restore(); }
    }
    // 后台任务：entry 独立；allow 才 start；deny/timeout 不 start。
    {
      const manager = fakeBackgroundManager();
      const allowTools = buildGovernedTools(allowGate, { shellGate: riskyGate(allowOperator), shellCwd: root, roleId: "worker", backgroundTasks: manager.capability });
      const started = await toolByName(allowTools, "start_background_task").handler({ name: "start_background_task", args: { command } });
      assert.equal(started.ok, true, started.message);
      assert.equal(manager.starts.length, 1);
      assert.equal(reviewRequests.at(-1)!.entry, "start_background_task", "后台入口以独立 entry 进入审核");
      const denyManager = fakeBackgroundManager();
      const denyTools = buildGovernedTools(allowGate, { shellGate: riskyGate(denyOperator), shellCwd: root, roleId: "worker", backgroundTasks: denyManager.capability });
      const denied = await toolByName(denyTools, "start_background_task").handler({ name: "start_background_task", args: { command } });
      assert.equal(denied.ok, false);
      assert.equal(denyManager.starts.length, 0, "deny ⇒ 后台任务不启动");
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("D1-6 只读 Git 路由：命中经注入能力 match+execute（不 spawn）；能力缺席/未命中 ⇒ readonly-git-runner-unavailable；非 git 正常 spawn", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-d1-git-"));
  const counter = countSpawns();
  try {
    const realGate = createShellGate({ projectRoot: root, classifyShell, rules: defaultShellRules(), audit: createMemoryAuditSink() });
    const stubAllow: ShellGate = async () => ({ allow: true, by: "d1-stub" });
    // 1) 真实 gate 放行只读 Git + 注入能力 ⇒ match/execute，零 spawn。
    {
      const git = readonlyGitFixture();
      const tools = buildGovernedTools(allowGate, { shellGate: realGate, shellCwd: root, readonlyGit: git.capability, roleId: "worker", shellExecTimeoutMs: 2345 });
      const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "git status" } });
      assert.equal(result.ok, true, result.message);
      assert.equal(counter.count, 0, "只读 Git 绝不走通用 spawn");
      assert.deepEqual(git.matchCalls, [["git", "status"]]);
      assert.equal(git.executeCalls.length, 1);
      assert.deepEqual(git.executeCalls[0]!.match, matchReadonlyGit(["git", "status"]), "match 结果必须来自 Service 公共出口同一 matcher");
      assert.deepEqual(git.executeCalls[0]!.budgets, { timeoutMs: 2345, outputLimit: 1_048_576 });
      assert.equal((result.execution as { stdout?: string }).stdout, "## d1-fixture-status\n");
      assert.match(String(result.message), /只读 Git 白名单|固定 Git 传输/);
    }
    // 2) 能力缺席 ⇒ readonly-git-runner-unavailable，零 spawn。
    {
      const tools = buildGovernedTools(allowGate, { shellGate: stubAllow, shellCwd: root });
      const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "git status" } });
      assert.equal(result.ok, false);
      assert.match(String(result.message), /readonly-git-runner-unavailable/);
      assert.equal(counter.count, 0);
    }
    // 3) 能力存在但 argv 未命中（写形态）⇒ 同样 fail-closed，零 spawn、零 execute。
    {
      const git = readonlyGitFixture();
      const tools = buildGovernedTools(allowGate, { shellGate: stubAllow, shellCwd: root, readonlyGit: git.capability });
      const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "git commit -m x" } });
      assert.equal(result.ok, false);
      assert.match(String(result.message), /readonly-git-runner-unavailable/);
      assert.equal(git.executeCalls.length, 0);
      assert.equal(counter.count, 0, "未命中只读白名单也不得回退通用 spawn");
    }
    // 4) 真实 gate 对裸 Git 写硬拒（writeGuard 缺省时由分类器 c=deny 终结），零执行。
    {
      const git = readonlyGitFixture();
      const tools = buildGovernedTools(allowGate, { shellGate: realGate, shellCwd: root, readonlyGit: git.capability });
      const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "git commit -m x" } });
      assert.equal(result.ok, false);
      assert.match(String(result.message), /审核拒绝/);
      assert.equal(git.executeCalls.length, 0);
      assert.equal(counter.count, 0);
    }
    // 5) 非 git 命令维持现状 spawn（node --version 命中只读白名单 c-allow）。
    {
      const git = readonlyGitFixture();
      const tools = buildGovernedTools(allowGate, { shellGate: realGate, shellCwd: root, readonlyGit: git.capability });
      const result = await toolByName(tools, "run_shell").handler({ name: "run_shell", args: { command: "node --version" } });
      assert.equal(result.ok, true, result.message);
      assert.equal(counter.count, 1);
      assert.equal(git.matchCalls.length, 0, "非 git 程序不触碰只读 Git 能力");
    }
  } finally {
    counter.restore();
    await fsp.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— 4. writeGuard 注入断言（AC-14/AC-30/AC-22） ——————————————————————

test("D1-7 writeGuard 注入：接 (a) 装配路径硬拒裸 Git 写（不咨询审批）；只读档 c=deny 终结；后台入口 Git 拒绝", async () => {
  const project = await makeProject("ans-d1-writeguard-");
  try {
    const req = (command: string, argv: string[], extra: Record<string, unknown> = {}) => ({ command, argv, cwd: project.projectRoot, toolCallId: "d1-wg", ...extra });
    // 审批档（operatorOnly）：operator 纵容 allow 也救不了裸 Git 写——writeGuard 先 deny 且不咨询 (a)。
    {
      let operatorCalls = 0;
      const audit = createMemoryAuditSink();
      const gate = await assembleOperatorShellGate({
        project,
        operatorChannel: () => { operatorCalls += 1; return { outcome: "allow", operatorId: "d1-客户" }; },
        classifyShell,
        rules: defaultShellRules(),
        writeGuard: realWriteGuard(project),
        auditSink: audit,
      });
      const commit = await gate(req("git commit -m x", ["git", "commit", "-m", "x"]));
      assert.equal(commit.allow, false, "advisory/operatorOnly 不得把裸 Git 写交 (a) 放行");
      assert.equal(operatorCalls, 0, "writeGuard deny 先于 (a)");
      assert.equal(audit.records.at(-1)?.branch, BRANCH_WRITE_GUARD_DENY);
      // AC-22：后台入口不享受只读 Git pass。
      const background = await gate(req("git status", ["git", "status"], { entry: "start_background_task" }));
      assert.equal(background.allow, false);
      assert.equal(audit.records.at(-1)?.branch, BRANCH_WRITE_GUARD_DENY);
      const status = await gate(req("git status", ["git", "status"]));
      assert.equal(status.allow, true, "run_shell 只读 Git 前台 0 卡放行");
      assert.equal(audit.records.at(-1)?.branch, BRANCH_C_ALLOW);
      assert.equal(operatorCalls, 0);
    }
    // 项目三层链：同一硬地板（裸 Git 写被 writeGuard deny，不进入审批）。
    {
      let operatorCalls = 0;
      const gate = await assembleProjectShellGate({
        project,
        pmRoleId: "worker",
        operatorChannel: () => { operatorCalls += 1; return { outcome: "allow", operatorId: "d1-客户" }; },
        classifyShell,
        rules: defaultShellRules(),
        writeGuard: realWriteGuard(project),
        auditSink: createMemoryAuditSink(),
        sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "codex", codexOptions()) },
        openSession: async () => { throw new Error("d1: 不需要审读会话"); },
      });
      const push = await gate(req("git push", ["git", "push"]));
      assert.equal(push.allow, false);
      assert.equal(operatorCalls, 0, "writeGuard deny 不咨询 (a)");
      const status = await gate(req("git status", ["git", "status"]));
      assert.equal(status.allow, true);
    }
    // 只读档：不接 (a)、无 writeGuard；classifier c=deny 即终结（写形态拒绝、只读形态放行）。
    {
      const gate = await assembleReadonlyShellGate({ project, classifyShell, rules: defaultShellRules(), auditSink: createMemoryAuditSink() });
      const status = await gate(req("git status", ["git", "status"]));
      assert.equal(status.allow, true);
      const commit = await gate(req("git commit -m x", ["git", "commit", "-m", "x"]));
      assert.equal(commit.allow, false, "只读档 c=deny 终结（不依赖 writeGuard）");
      assert.match(String((commit as { reason?: string }).reason), /硬拒|只读|raw-git|deny/);
    }
    // 源码断言：run-role 的两条接 (a) 装配路径都注入 writeGuard；只读档不注入；受保护状态传 deny-non-readonly。
    const runRole = fs.readFileSync(path.join(process.cwd(), "src/pipeline/orchestration/run-role.ts"), "utf8");
    const operatorStart = runRole.indexOf("assembleOperatorShellGate({");
    assert.ok(operatorStart > 0);
    assert.match(runRole.slice(operatorStart, operatorStart + 900), /writeGuard: shellWriteGuard/, "审批档装配必须注入 writeGuard");
    const projectStart = runRole.indexOf("assembleProjectShellGate({");
    assert.ok(projectStart > 0);
    assert.match(runRole.slice(projectStart, projectStart + 1800), /writeGuard: shellWriteGuard/, "项目链装配必须注入 writeGuard");
    const readonlyStart = runRole.indexOf("assembleReadonlyShellGate({");
    assert.ok(readonlyStart > 0);
    assert.doesNotMatch(runRole.slice(readonlyStart, readonlyStart + 300), /writeGuard: shellWriteGuard/, "只读档不接 (a)");
    assert.equal((runRole.match(/auditFailurePolicy: roleCapabilityProtection\.state === "required" \? "deny-non-readonly" : "observe"/g) ?? []).length, 2, "两条接 (a) 装配路径按受保护状态传 auditFailurePolicy");
  } finally {
    await fsp.rm(project.projectRoot, { recursive: true, force: true });
  }
});

// —————————————————————— 5. PR #72 契约与 approvalChain 消费面（AC-19/N15） ——————————————————————

test("D1-8 PR #72 契约：含 shell 会话 strict surface 仍 unknown；approvalChain/应用中介证据不被写/发布门消费", async () => {
  await withCodexEnv(async () => {
    const project = await makeProject("ans-d1-pr72-");
    await markRequired(project.projectRoot);
    try {
      const gate = await assembleProjectShellGate({
        project,
        pmRoleId: "worker",
        classifyShell,
        rules: defaultShellRules(),
        operatorChannel: denyOperator,
        sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "codex", codexOptions()) },
      });
      const adapter = createRuntimeAdapter({ runtime: "codex", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot, shellGate: gate, ...codexOptions() });
      const prepared = await adapter.prepareRole!(resolvedRole("worker"));
      assert.equal(prepared.plan.status, "observed");
      const session = await adapter.bindPreparedRole!(prepared.token!);
      try {
        const surface = session.inspectToolSurface!();
        assert.equal(surface.status, "unknown", "含 shell 会话的 strict toolSurface 仍 unknown（不冒充 observed）");
        assert.ok(surface.appTools.includes("run_shell"));
      } finally {
        await session.dispose();
      }
      // composeRuntimeApplicationMediation（包装层唯一组合规则）语义不变：严格 unknown + 应用面 observed ⇒ verified。
      const composed = composeRuntimeApplicationMediation({
        runtime: "codex", factoryProvenance: "default-production", disposed: false,
        strictReasons: ["unmediated-execution-registered"], roleId: "worker",
        nativeInstanceId: "d1-native", nativeLifecycleInstanceId: "d1-native",
        appTools: ["run_shell", "read_file"], configuredForeignMcpServers: [],
        nativeFact: { source: "native-provider-tool-registry", nativeInstanceId: "d1-native", roleId: "worker", runtime: "codex", factory: "codex-chat", status: "observed", observedAt: new Date(0).toISOString(), appTools: ["run_shell", "read_file"], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [] },
        applicationFact: () => ({ source: "application-mediated-tool-surface", nativeInstanceId: "d1-native", roleId: "worker", runtime: "codex", factory: "codex-chat", status: "observed", observedAt: new Date(0).toISOString(), appTools: ["run_shell", "read_file"], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [] }),
      });
      assert.ok(composed);
      assert.equal(composed.status, "verified");
      assert.equal(composed.kind, "application-mediated-unknown-native");
      // 消费面：写/发布/停稳门所在层不读 applicationMediation；approvalChain 只进创建准入。
      const trunkRuntime = fs.readFileSync(path.join(process.cwd(), "src/pipeline/orchestration/trunk-runtime.ts"), "utf8");
      assert.equal((trunkRuntime.match(/applicationMediation/g) ?? []).length, 0, "trunk-runtime 不消费 applicationMediation");
      assert.equal((trunkRuntime.match(/approvalChain/g) ?? []).length, 0, "Git 写/发布门不消费 approvalChain");
      const runRole = fs.readFileSync(path.join(process.cwd(), "src/pipeline/orchestration/run-role.ts"), "utf8");
      assert.equal((runRole.match(/applicationMediation/g) ?? []).length, 0, "run-role 不消费 applicationMediation");
      const sessionSource = fs.readFileSync(path.join(process.cwd(), "src/service/runtime/session.ts"), "utf8");
      const prepareStart = sessionSource.indexOf("async prepareRole");
      const bindStart = sessionSource.indexOf("async bindPreparedRole");
      assert.ok(prepareStart > 0 && bindStart > prepareStart, "准入函数可按符号定位");
      assert.ok(sessionSource.slice(prepareStart, bindStart).includes("approvalChain"), "approvalChain 在 prepareRole 准入内消费");
    } finally {
      await fsp.rm(project.projectRoot, { recursive: true, force: true });
    }
  });
});
