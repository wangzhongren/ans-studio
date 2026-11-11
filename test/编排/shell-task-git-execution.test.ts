// test/编排/shell-task-git-execution.test.ts
// T3 B4.1（2026-11-10，编排）：AC-21 / T-09——fixed 任务级 Git 写的**执行路径**与写集解析。
//
// 覆盖：
//   · `createTaskGitCommitRunner`：固定 staged 检查 argv（`TASK_GIT_STAGED_INSPECTION_ARGV`）、
//     项目级锁贯穿 `git diff --cached` 检查与 commit、固定 commit argv、锁后释放；
//   · 锁占用（`git-critical-section-busy`，不排队/不检查/不提交）、分支不匹配（`git-branch-mismatch`，
//     不取锁）、staged 空/越界（不提交且释放）、检查异常释放后如实失败；
//   · `createTaskGitShellExecution`：add 经端口、commit 经 runner；匹配/伪造/越 scope 防御；
//   · `resolveTaskGitScope`：A 路径（basis.teamPlan → parseTeamPlan roleRows）、B 路径
//     （change.scope-decided → derivePathBWriteSets）、以及缺失/漂移/阶段/角色不匹配的 fail-closed。
//
// 全部为假件（不真跑 Git、不 spawn）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createTaskGitCommitRunner, type ShellTaskGitCommandFacts, type ShellTaskGitCommitPort } from "../../src/common/编排/shell-gate.ts";
import {
  createTaskGitShellExecution,
  resolveTaskGitScope,
  type TaskGitShellPort,
} from "../../src/pipeline/orchestration/run-role.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { TASK_GIT_STAGED_INSPECTION_ARGV } from "../../src/service/gate/shell-rules.ts";
import type { TaskGitScope } from "../../src/service/gate/shell-rules.ts";
import type { BasisEvent, WorkflowEvent } from "../../src/model/runtime.ts";

const FLOW = "snake";
const WORKFLOW = "wf-taskgit-0001";
const TASK_ID = "t-impl-0001";
const ROLE = "impl";
const AT = "2026-11-10T10:00:00.000Z";
const NOW = () => new Date(AT);
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const };
const SCOPE: TaskGitScope = {
  taskId: TASK_ID,
  workflowId: WORKFLOW,
  branch: `ans/task/${WORKFLOW}`,
  paths: ["src/impl/"],
};

function sha(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-taskgit-exec-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

// —————————————————————— 假端口（锁 + 调用记录 + 固定 argv 断言） ——————————————————————

interface FakePortState {
  calls: string[];
  lockOwner: string | undefined;
  staged: string[];
  branch: string;
  addFacts?: ShellTaskGitCommandFacts;
  commitFacts?: ShellTaskGitCommandFacts;
  inspectError?: string;
  commitError?: string;
}

function fakeState(overrides: Partial<FakePortState> = {}): FakePortState {
  return {
    calls: [],
    lockOwner: undefined,
    staged: ["src/impl/a.ts"],
    branch: SCOPE.branch,
    ...overrides,
  };
}

function fakePort(state: FakePortState): TaskGitShellPort {
  return {
    acquireCriticalSection(owner: string) {
      state.calls.push(`acquire:${owner}`);
      if (state.lockOwner !== undefined) return undefined;
      state.lockOwner = owner;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        state.calls.push(`release:${owner}`);
        if (state.lockOwner === owner) state.lockOwner = undefined;
      };
    },
    currentBranch() {
      state.calls.push("currentBranch");
      return state.branch;
    },
    add(paths) {
      state.calls.push(`add:${paths.join(",")}`);
      return state.addFacts ?? { exitCode: 0, stdout: "added", stderr: "" };
    },
    inspectStaged(argv) {
      state.calls.push(`inspect:${argv.join(" ")}:${state.lockOwner === undefined ? "unlocked" : "locked"}`);
      if (state.lockOwner === undefined) throw new Error("inspectStaged-called-outside-lock");
      if (state.inspectError !== undefined) throw new Error(state.inspectError);
      return state.staged;
    },
    commit(argv) {
      state.calls.push(`commit:${argv.join(" ")}:${state.lockOwner === undefined ? "unlocked" : "locked"}`);
      if (state.lockOwner === undefined) throw new Error("commit-called-outside-lock");
      if (state.commitError !== undefined) throw new Error(state.commitError);
      return state.commitFacts ?? { exitCode: 0, stdout: "[task abc] impl done", stderr: "" };
    },
  };
}

const LOCK_OWNER = `shell-commit:${TASK_ID}`;
const INSPECT_ARGV_TEXT = TASK_GIT_STAGED_INSPECTION_ARGV.join(" ");

/** 把执行端口适配为 `createTaskGitCommitRunner` 的提交端口（生产侧由 run-role 做同一适配）。 */
function commitPort(state: FakePortState): ShellTaskGitCommitPort {
  const port = fakePort(state);
  return {
    acquire: (owner) => port.acquireCriticalSection(owner),
    currentBranch: () => port.currentBranch(),
    inspectStaged: (argv) => port.inspectStaged(argv),
    commit: (argv, budgets) => port.commit(argv, budgets),
  };
}

// —————————————————————— ① createTaskGitCommitRunner：锁贯穿检查与提交 ——————————————————————

test("commit runner：固定 staged argv + 固定 commit argv；项目级锁贯穿检查与提交、锁后释放", async () => {
  const state = fakeState();
  const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
  const result = await runner.run(["git", "commit", "-m", "impl done"], { timeoutMs: 1234 });
  assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
  assert.deepEqual(state.calls, [
    "currentBranch",
    `acquire:${LOCK_OWNER}`,
    `inspect:${INSPECT_ARGV_TEXT}:locked`,
    "commit:git commit -m impl done:locked",
    `release:${LOCK_OWNER}`,
  ]);
  if (result.ok) {
    assert.deepEqual(result.stagedPaths, ["src/impl/a.ts"]);
    assert.equal(result.value.exitCode, 0);
  }
  assert.equal(state.lockOwner, undefined, "锁必须释放");
});

test("commit runner：staged 越界 ⇒ git-staged-outside-writeset，不提交且释放锁", async () => {
  const state = fakeState({ staged: ["other/x.ts"] });
  const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
  const result = await runner.run(["git", "commit", "-m", "x"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "git-staged-outside-writeset");
  assert.equal(state.calls.some((call) => call.startsWith("commit:")), false, "不得提交");
  assert.equal(state.calls.some((call) => call.startsWith(`release:${LOCK_OWNER}`)), true, "锁必须释放");
  assert.equal(state.lockOwner, undefined);
});

test("commit runner：staged 空 ⇒ git-staged-empty；治理写区 ⇒ git-staged-governance-path；均不提交", async () => {
  for (const item of [
    { staged: [] as string[], code: "git-staged-empty" },
    { staged: ["src/impl/a.ts", ".ans/state/workflows.jsonl"], code: "git-staged-governance-path" },
  ]) {
    const state = fakeState({ staged: item.staged });
    const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
    const result = await runner.run(["git", "commit", "-m", "x"]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, item.code);
    assert.equal(state.calls.some((call) => call.startsWith("commit:")), false);
    assert.equal(state.lockOwner, undefined);
  }
});

test("commit runner：项目级锁被占用 ⇒ git-critical-section-busy（不排队、不检查、不提交）", async () => {
  const state = fakeState({ lockOwner: "release-main:other" });
  const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
  const result = await runner.run(["git", "commit", "-m", "x"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "git-critical-section-busy");
  assert.deepEqual(state.calls, ["currentBranch", `acquire:${LOCK_OWNER}`]);
});

test("commit runner：当前分支 != 任务分支 ⇒ git-branch-mismatch（取锁前拒绝）", async () => {
  const state = fakeState({ branch: "main" });
  const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
  const result = await runner.run(["git", "commit", "-m", "x"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "git-branch-mismatch");
  assert.deepEqual(state.calls, ["currentBranch"]);
  assert.equal(state.lockOwner, undefined);
});

test("commit runner：staged 检查异常 ⇒ 释放锁后如实抛出（不伪装成功）", async () => {
  const state = fakeState({ inspectError: "staged-read-failed" });
  const runner = createTaskGitCommitRunner({ scope: SCOPE, port: commitPort(state) });
  await assert.rejects(() => runner.run(["git", "commit", "-m", "x"]), /staged-read-failed/);
  assert.equal(state.lockOwner, undefined, "异常路径也必须释放锁");
  assert.equal(state.calls.some((call) => call.startsWith("commit:")), false);
});

// —————————————————————— ② createTaskGitShellExecution：add / commit 路由与防御 ——————————————————————

test("execution add：match 命中（writeSet 内字面路径）⇒ 经端口执行，无锁/无 commit", async () => {
  const state = fakeState();
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  const match = execution.match(["git", "add", "src/impl/a.ts", "src/impl/b.ts"]);
  assert.ok(match !== undefined, "match 应命中");
  const facts = await execution.execute(match!);
  assert.equal(facts.exitCode, 0);
  assert.deepEqual(state.calls, ["add:src/impl/a.ts,src/impl/b.ts"]);
  assert.equal(state.lockOwner, undefined);
});

test("execution add：-A / 非字面 / 越界 / 治理写区在 match 即 undefined（不享受任务级放行）", async () => {
  const state = fakeState();
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  for (const argv of [
    ["git", "add", "-A"],
    ["git", "add", "./src/impl/a.ts"],
    ["git", "add", "other/x.ts"],
    ["git", "add", ".ans/x.json"],
    ["git", "push"],
  ]) {
    assert.equal(execution.match(argv), undefined, `${argv.join(" ")} 不应命中`);
  }
  assert.deepEqual(state.calls, []);
});

test("execution commit：match 命中 ⇒ execute 经 runTaskGitCommit（同一把锁贯穿检查与提交）", async () => {
  const state = fakeState();
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  const match = execution.match(["git", "commit", "-m", "impl done"]);
  assert.ok(match !== undefined);
  const facts = await execution.execute(match!);
  assert.equal(facts.exitCode, 0);
  assert.deepEqual(state.calls, [
    "currentBranch",
    `acquire:${LOCK_OWNER}`,
    `inspect:${INSPECT_ARGV_TEXT}:locked`,
    "commit:git commit -m impl done:locked",
    `release:${LOCK_OWNER}`,
  ]);
});

test("execution commit：临界区门失败 ⇒ 失败事实（含稳定码），不提交", async () => {
  const state = fakeState({ staged: ["other/x.ts"] });
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  const match = execution.match(["git", "commit", "-m", "x"]);
  assert.ok(match !== undefined);
  const facts = await execution.execute(match!);
  assert.match(facts.error ?? "", /git-staged-outside-writeset/);
  assert.equal(state.calls.some((call) => call.startsWith("commit:")), false);
});

test("execution commit：检查异常 ⇒ git-task-commit-failed（锁已释放）", async () => {
  const state = fakeState({ commitError: "commit-boom" });
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  const match = execution.match(["git", "commit", "-m", "x"]);
  assert.ok(match !== undefined);
  const facts = await execution.execute(match!);
  assert.match(facts.error ?? "", /git-task-commit-failed/);
  assert.equal(state.lockOwner, undefined);
});

test("execution：伪造 match（kind/分支/message/越 scope）防御性拒绝，不执行任何端口", async () => {
  const state = fakeState();
  const execution = createTaskGitShellExecution({ scope: SCOPE, port: fakePort(state) });
  const digest = "a".repeat(64);
  const cases: object[] = [
    { kind: "other", template: "add", match: { template: "add", paths: ["src/impl/a.ts"], taskId: TASK_ID, workflowId: WORKFLOW, branch: SCOPE.branch, argvDigest: digest } },
    { kind: "ans-task-git-shell/v1", template: "add", match: { template: "commit", paths: [], taskId: TASK_ID, workflowId: WORKFLOW, branch: SCOPE.branch, argvDigest: digest } },
    { kind: "ans-task-git-shell/v1", template: "add", match: { template: "add", paths: ["src/impl/a.ts"], taskId: TASK_ID, workflowId: WORKFLOW, branch: "ans/task/other", argvDigest: digest } },
    { kind: "ans-task-git-shell/v1", template: "commit", match: { template: "commit", paths: [], message: "", taskId: TASK_ID, workflowId: WORKFLOW, branch: SCOPE.branch, argvDigest: digest } },
  ];
  for (const forged of cases) {
    const facts = await execution.execute(forged);
    assert.equal(typeof facts.error, "string", JSON.stringify(forged));
    assert.equal(facts.stdout, "");
  }
  assert.deepEqual(state.calls, [], "伪造请求不得触达端口（锁/检查/提交/添加均无）");
});

// —————————————————————— ③ resolveTaskGitScope：A 路径 ——————————————————————

const MODULES_DOC = [
  "---",
  "schema: project-modules/v2",
  "flowId: snake",
  "version: 1",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: Core module",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Modules",
  "",
].join("\n");

function rosterDoc(): string {
  return [
    "---",
    "schema: project-roster/v4",
    "flowId: snake",
    "version: 1",
    "intent: docs/product/snake-intent-v1.md",
    "proposal: docs/proposals/snake-proposal-v1.md",
    "architecture: docs/contracts/snake-architecture-v1.md",
    "envBootstrap:",
    "  omitted: true",
    "  omissionReason: pure local text task",
    "roles:",
    "  - id: impl",
    "    displayName: Implementer",
    "    purpose: Implementation",
    "    capability: TS",
    "    modules: [core]",
    "modules:",
    "  - id: core",
    "    name: Core",
    "    purpose: Core module",
    "    path: src/core/",
    "    category: core",
    "    publicContract: src/core/index.ts",
    "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---",
    "# Roster",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "management: [convener, impl]",
    "modules:",
    "  - id: core",
    "    path: src/core/",
    "    roleId: impl",
    "roles:",
    "  - id: impl",
    "    modules: [core]",
    "```",
    "",
  ].join("\n");
}

async function appendEvents(root: string, events: WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

function startedEvent(pathValue: "A" | "B"): WorkflowEvent {
  return {
    ...BASE, kind: "workflow.started", workflowId: WORKFLOW, flowId: FLOW, path: pathValue,
    idempotencyKey: `workflow-start:${FLOW}:${pathValue}:t-src`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  };
}

async function seedTask(root: string, stage: "A11" | "B3" | "A12a", to = ROLE): Promise<void> {
  const created = taskEvent("task.created", {
    taskId: TASK_ID,
    from: "convener",
    to,
    text: "实现任务",
    sideEffect: "code",
    idempotencyKey: `stage-request:${WORKFLOW}:${stage}:1`,
    flowId: FLOW,
    workflowId: WORKFLOW,
    stage,
  }, NOW);
  assert.equal((await appendTaskEvent(root, created)).ok, true);
}

function teamPlan(modulesSha: string, rosterSha: string): string {
  return [
    "---",
    "schema: teamPlanSchema:3",
    "flowId: snake",
    "version: 1",
    "modules:",
    "  path: docs/proposals/snake-modules-v1.md",
    `  sha256: ${modulesSha}`,
    "roster:",
    "  path: docs/proposals/snake-roster-v1.md",
    `  sha256: ${rosterSha}`,
    "roleRows:",
    "  - roleId: impl",
    "    modules: [core]",
    "    writesets: [src/core/]",
    "    dependsOn: []",
    "---",
    "# Team plan",
    "",
  ].join("\n");
}

async function seedPathA(root: string): Promise<void> {
  const modules = MODULES_DOC;
  const roster = rosterDoc();
  const plan = teamPlan(sha(modules), sha(roster));
  await writeFile(root, "docs/proposals/snake-modules-v1.md", modules);
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
  const basis: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${WORKFLOW}:seed`,
    basisId: `bas-${sha(WORKFLOW).slice(0, 24)}`,
    workflowId: WORKFLOW,
    flowId: FLOW,
    documents: [
      { kind: "modules", path: "docs/proposals/snake-modules-v1.md", version: 1, sha256: sha(modules), bytes: Buffer.byteLength(modules) },
      { kind: "roster", path: "docs/proposals/snake-roster-v1.md", version: 1, sha256: sha(roster), bytes: Buffer.byteLength(roster) },
    ],
    teamPlan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    reviewRoleId: "verifier",
    operationId: "op-basis",
    recordedBy: "application",
    reason: "baseline",
  };
  const appended = await appendBasisEvent(root, basis);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

test("resolveTaskGitScope（A 路径）：真实受派任务 + basis.teamPlan → roleRows writesets/branch/taskId/workflowId", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, [startedEvent("A")]);
    await seedTask(root, "A11");
    await seedPathA(root);
    const result = await resolveTaskGitScope({ projectRoot: root, taskId: TASK_ID, roleId: ROLE });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (result.ok) {
      assert.deepEqual(result.scope, {
        taskId: TASK_ID,
        workflowId: WORKFLOW,
        branch: taskBranchName(WORKFLOW),
        paths: ["src/core/"],
      });
    }
  } finally {
    await cleanup(root);
  }
});

test("resolveTaskGitScope（A 路径）：团队计划字节漂移 ⇒ git-task-scope-invalid（basis-drift，fail-closed）", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, [startedEvent("A")]);
    await seedTask(root, "A11");
    await seedPathA(root);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", `${teamPlan(sha(MODULES_DOC), sha(rosterDoc()))}\ndrift\n`);
    const result = await resolveTaskGitScope({ projectRoot: root, taskId: TASK_ID, roleId: ROLE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "git-task-scope-invalid");
      assert.match(result.message, /basis-drift/);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————————————— ④ resolveTaskGitScope：B 路径 ——————————————————————

async function seedPathB(root: string): Promise<void> {
  await writeFile(
    root,
    "角色卡/impl/boundary.yaml",
    "role: impl\nentries:\n  - kind: directory\n    path: src/core\n    root: project\n    purpose: 实现写区\n",
  );
  const decided: WorkflowEvent = {
    ...BASE, kind: "change.scope-decided", workflowId: WORKFLOW, flowId: FLOW, path: "B",
    idempotencyKey: `scope:${WORKFLOW}:impact:digest`,
    impactReport: { path: "docs/quality/snake-impact-v1.md", sha256: "b".repeat(64) },
    scope: { summary: "B 变更范围", files: ["src/core/main.ts"] },
    effectiveWritesets: [{ roleId: ROLE, paths: ["src/core/main.ts"] }],
    decidedBy: "chief",
    requestTaskId: "t-b2-request",
  };
  await appendEvents(root, [startedEvent("B"), decided]);
}

test("resolveTaskGitScope（B 路径）：change.scope-decided → derivePathBWriteSets → 本角色写集", async () => {
  const root = await tempRoot();
  try {
    await seedTask(root, "B3");
    await seedPathB(root);
    const result = await resolveTaskGitScope({ projectRoot: root, taskId: TASK_ID, roleId: ROLE });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (result.ok) {
      assert.deepEqual(result.scope, {
        taskId: TASK_ID,
        workflowId: WORKFLOW,
        branch: taskBranchName(WORKFLOW),
        paths: ["src/core/main.ts"],
      });
    }
  } finally {
    await cleanup(root);
  }
});

test("resolveTaskGitScope（B 路径）：无 change.scope-decided ⇒ git-task-scope-missing；派生失败 ⇒ invalid", async () => {
  // 缺事件
  const root = await tempRoot();
  try {
    await seedTask(root, "B3");
    await appendEvents(root, [startedEvent("B")]);
    const missing = await resolveTaskGitScope({ projectRoot: root, taskId: TASK_ID, roleId: ROLE });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "git-task-scope-missing");
  } finally {
    await cleanup(root);
  }
  // 派生失败（scope.files 不在任何角色边界）
  const root2 = await tempRoot();
  try {
    await seedTask(root2, "B3");
    await writeFile(
      root2,
      "角色卡/impl/boundary.yaml",
      "role: impl\nentries:\n  - kind: directory\n    path: src/core\n    root: project\n    purpose: 实现写区\n",
    );
    const decided: WorkflowEvent = {
      ...BASE, kind: "change.scope-decided", workflowId: WORKFLOW, flowId: FLOW, path: "B",
      idempotencyKey: `scope:${WORKFLOW}:impact:digest`,
      impactReport: { path: "docs/quality/snake-impact-v1.md", sha256: "b".repeat(64) },
      scope: { summary: "越界范围", files: ["docs/other.md"] },
      effectiveWritesets: [{ roleId: ROLE, paths: ["docs/other.md"] }],
      decidedBy: "chief",
      requestTaskId: "t-b2-request",
    };
    await appendEvents(root2, [startedEvent("B"), decided]);
    const invalid = await resolveTaskGitScope({ projectRoot: root2, taskId: TASK_ID, roleId: ROLE });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.code, "git-task-scope-invalid");
      assert.match(invalid.message, /b-change-scope-invalid/);
    }
  } finally {
    await cleanup(root2);
  }
});

// —————————————————————— ⑤ resolveTaskGitScope：任务绑定 fail-closed ——————————————————————

test("resolveTaskGitScope：无任务/角色不匹配/阶段非 A11|B3/无 workflowId ⇒ 稳定码拒绝", async () => {
  // 无任务
  const root = await tempRoot();
  try {
    const missing = await resolveTaskGitScope({ projectRoot: root, taskId: TASK_ID, roleId: ROLE });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "git-task-scope-missing");
  } finally {
    await cleanup(root);
  }
  // 角色不匹配
  const root2 = await tempRoot();
  try {
    await appendEvents(root2, [startedEvent("A")]);
    await seedTask(root2, "A11", "other-role");
    const mismatch = await resolveTaskGitScope({ projectRoot: root2, taskId: TASK_ID, roleId: ROLE });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.code, "git-task-scope-invalid");
  } finally {
    await cleanup(root2);
  }
  // 阶段非实现提交阶段
  const root3 = await tempRoot();
  try {
    await appendEvents(root3, [startedEvent("A")]);
    await seedTask(root3, "A12a");
    const stage = await resolveTaskGitScope({ projectRoot: root3, taskId: TASK_ID, roleId: ROLE });
    assert.equal(stage.ok, false);
    if (!stage.ok) {
      assert.equal(stage.code, "git-task-scope-invalid");
      assert.match(stage.message, /A11\/B3/);
    }
  } finally {
    await cleanup(root3);
  }
  // 无 workflowId（legacy 任务）
  const root4 = await tempRoot();
  try {
    const created = taskEvent("task.created", {
      taskId: TASK_ID, from: "convener", to: ROLE, text: "legacy", sideEffect: "code",
      idempotencyKey: "legacy-task", flowId: FLOW,
    }, NOW);
    assert.equal((await appendTaskEvent(root4, created, { allowLegacyRun: true })).ok, true);
    const legacy = await resolveTaskGitScope({ projectRoot: root4, taskId: TASK_ID, roleId: ROLE });
    assert.equal(legacy.ok, false);
    if (!legacy.ok) assert.equal(legacy.code, "git-task-scope-missing");
  } finally {
    await cleanup(root4);
  }
});
