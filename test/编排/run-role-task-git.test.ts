// test/编排/run-role-task-git.test.ts
// T3 B4.1（2026-11-10，编排）：run-role 接线——fixed 会话解析 taskGitScope → shell 闸明细分类（含
// write guard scope）→ `run_shell` 执行路径（ReadonlyGitCapability 的 task-git 分支）经 runTaskGitCommit。
//
// 覆盖：
//   · fixed + 真实受派任务 + 完整注入 ⇒ `capabilities.shellGate` 允许 `git add`/`git commit -m`，
//     审计行带 taskGit；`capabilities.readonlyGit` 的 add/commit 走注入端口（commit 经临界区门）；
//   · `git add -A`（write guard 硬拒）与越界 add 不执行；
//   · 无 taskGit 注入 / legacy 会话 ⇒ 任务级 Git 写一律拒、执行路径无 task-git 分支（旧行为逐字不变）。
//
// 全部为假件：不真跑 Git，不启动真实模型/Electron。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities, type TaskGitShellPort } from "../../src/pipeline/orchestration/run-role.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { classifyShell, classifyShellDetailed, defaultShellRules, TASK_GIT_STAGED_INSPECTION_ARGV } from "../../src/service/gate/shell-rules.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent, WriteGate } from "../../src/model/runtime.ts";
import { appendBasisEvent, appendWorkflowEvent, taskBranchName } from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import type { BasisEvent, WorkflowEvent } from "../../src/model/runtime.ts";

const FLOW = "snake";
const WORKFLOW = "wf-taskgit-integration";
const TASK_ID = "t-impl-int";
const ROLE = "impl";
const AT = "2026-11-10T10:00:00.000Z";
const NOW = () => new Date(AT);
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const };

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

function makeProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { [ROLE]: { card: `角色卡/${ROLE}/role-card.md`, boundary: `角色卡/${ROLE}/boundary.yaml` } },
    builtInRoles: ["su"],
    governanceBoundary: { path: `角色卡/${ROLE}/boundary.yaml`, acceptance: { accepted: true, source: "test:task-git" } },
  };
}

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

/** 真实受派任务 + A 路径账本/文档（团队计划 → basis.recorded）。 */
async function seedFixedProject(root: string): Promise<void> {
  await writeFile(root, `角色卡/${ROLE}/role-card.md`, `# 角色 ${ROLE}\n`);
  await writeFile(
    root,
    `角色卡/${ROLE}/boundary.yaml`,
    "role: impl\nentries:\n  - kind: directory\n    path: src/core\n    root: project\n    purpose: 实现写区\n",
  );
  const modules = MODULES_DOC;
  const roster = rosterDoc();
  const plan = teamPlan(sha(modules), sha(roster));
  await writeFile(root, "docs/proposals/snake-modules-v1.md", modules);
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
  const started: WorkflowEvent = {
    ...BASE, kind: "workflow.started", workflowId: WORKFLOW, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  };
  assert.equal((await appendWorkflowEvent(root, started)).ok, true);
  const created = taskEvent("task.created", {
    taskId: TASK_ID, from: "convener", to: ROLE, text: "实现任务", sideEffect: "code",
    idempotencyKey: `stage-request:${WORKFLOW}:A11:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A11",
  }, NOW);
  assert.equal((await appendTaskEvent(root, created)).ok, true);
  const basis: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${WORKFLOW}:seed`, basisId: `bas-${sha(WORKFLOW).slice(0, 24)}`,
    workflowId: WORKFLOW, flowId: FLOW,
    documents: [
      { kind: "modules", path: "docs/proposals/snake-modules-v1.md", version: 1, sha256: sha(modules), bytes: Buffer.byteLength(modules) },
      { kind: "roster", path: "docs/proposals/snake-roster-v1.md", version: 1, sha256: sha(roster), bytes: Buffer.byteLength(roster) },
    ],
    teamPlan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    reviewRoleId: "verifier", operationId: "op-basis", recordedBy: "application", reason: "baseline",
  };
  assert.equal((await appendBasisEvent(root, basis)).ok, true);
}

interface FakePortState {
  calls: string[];
  lockOwner: string | undefined;
  staged: string[];
  branch: string;
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
      return { exitCode: 0, stdout: "added", stderr: "" };
    },
    inspectStaged(argv) {
      state.calls.push(`inspect:${argv.join(" ")}:${state.lockOwner === undefined ? "unlocked" : "locked"}`);
      if (state.lockOwner === undefined) throw new Error("inspect-outside-lock");
      return state.staged;
    },
    commit(argv) {
      state.calls.push(`commit:${argv.join(" ")}:${state.lockOwner === undefined ? "unlocked" : "locked"}`);
      if (state.lockOwner === undefined) throw new Error("commit-outside-lock");
      return { exitCode: 0, stdout: "[task abc] ok", stderr: "" };
    },
  };
}

function fakeSession(): RoleSession {
  return {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        yield { kind: "settled", summary: "完成" } as SessionEvent;
      })();
    },
    async dispose(): Promise<void> {},
  };
}

async function openFixed(options: {
  root: string;
  taskGit?: { classifyShellDetailed: typeof classifyShellDetailed; port: TaskGitShellPort };
}): Promise<AdapterCapabilities | undefined> {
  const project = makeProject(options.root);
  let captured: AdapterCapabilities | undefined;
  const createAdapter = (_gate: WriteGate, capabilities?: AdapterCapabilities): RuntimeAdapter => {
    captured = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        return fakeSession();
      },
    } as RuntimeAdapter;
  };
  const handle = await openRoleSession({
    roleId: ROLE,
    project,
    runtime: "pi",
    taskId: TASK_ID,
    workflowMode: "fixed",
    shellOperatorChannel: async () => ({ outcome: "deny" as const }),
    shellArming: {
      classifyShell,
      rules: defaultShellRules(),
      auditSink: createMemoryAuditSink(),
    },
    ...(options.taskGit !== undefined ? { taskGit: options.taskGit } : {}),
  }, { createAdapter });
  await handle.dispose();
  return captured;
}

test("fixed 会话 + 真实受派任务 + 完整注入：shell 闸允许 add/commit（taskGit 审计），执行路径经端口/临界区门", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-runrole-taskgit-"));
  try {
    await seedFixedProject(root);
    const state: FakePortState = {
      calls: [], lockOwner: undefined, staged: ["src/core/main.ts"], branch: taskBranchName(WORKFLOW),
    };
    const capabilities = await openFixed({
      root,
      taskGit: { classifyShellDetailed, port: fakePort(state) },
    });
    assert.ok(capabilities !== undefined);
    assert.ok(capabilities!.shellGate !== undefined, "project 角色 shell 闸应 arm");
    assert.ok(capabilities!.readonlyGit !== undefined);
    const gate = capabilities!.shellGate!;
    const readonly = capabilities!.readonlyGit!;

    // write guard 需要 taskGitScope：git add 放行（形状级）；分类器按同一 scope 放行。
    const addReview = await gate({ command: "git add src/core/main.ts", argv: ["git", "add", "src/core/main.ts"], cwd: root, toolCallId: "c-add", entry: "run_shell", roleId: ROLE });
    assert.equal(addReview.allow, true, addReview.allow === false ? addReview.reason : "");
    const addMatch = readonly.match(["git", "add", "src/core/main.ts"]);
    assert.ok(addMatch !== undefined, "执行路径应识别任务级 add");
    const addFacts = await readonly.execute(addMatch!);
    assert.equal(addFacts.exitCode, 0);
    assert.deepEqual(state.calls, ["add:src/core/main.ts"]);

    // commit：闸放行 → 执行路径经 runTaskGitCommit（同一把锁贯穿检查与提交）。
    const commitReview = await gate({ command: "git commit -m ok", argv: ["git", "commit", "-m", "ok"], cwd: root, toolCallId: "c-commit", entry: "run_shell", roleId: ROLE });
    assert.equal(commitReview.allow, true, commitReview.allow === false ? commitReview.reason : "");
    const commitMatch = readonly.match(["git", "commit", "-m", "ok"]);
    assert.ok(commitMatch !== undefined);
    const commitFacts = await readonly.execute(commitMatch!);
    assert.equal(commitFacts.exitCode, 0);
    assert.deepEqual(state.calls.slice(1), [
      "currentBranch",
      `acquire:shell-commit:${TASK_ID}`,
      `inspect:${TASK_GIT_STAGED_INSPECTION_ARGV.join(" ")}:locked`,
      "commit:git commit -m ok:locked",
      `release:shell-commit:${TASK_ID}`,
    ]);
    assert.equal(state.lockOwner, undefined);

    // write guard 硬地板：git add -A 不因任务级 scope 放行（flag 形态仍拒）。
    const flagged = await gate({ command: "git add -A", argv: ["git", "add", "-A"], cwd: root, toolCallId: "c-flag", entry: "run_shell", roleId: ROLE });
    assert.equal(flagged.allow, false);
    // 越界路径同样拒（write guard 与分类器同一 matcher）。
    const outside = await gate({ command: "git add other/x", argv: ["git", "add", "other/x"], cwd: root, toolCallId: "c-out", entry: "run_shell", roleId: ROLE });
    assert.equal(outside.allow, false);
    assert.equal(readonly.match(["git", "add", "-A"]), undefined);
    assert.equal(readonly.match(["git", "add", "other/x"]), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("无 taskGit 注入：fixed 会话任务级 Git 写一律拒；执行路径无 task-git 分支（只读 Git 路由不变）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-runrole-taskgit-"));
  try {
    await seedFixedProject(root);
    const capabilities = await openFixed({ root });
    assert.ok(capabilities !== undefined);
    const gate = capabilities!.shellGate!;
    const readonly = capabilities!.readonlyGit!;
    const addReview = await gate({ command: "git add src/core/main.ts", argv: ["git", "add", "src/core/main.ts"], cwd: root, toolCallId: "c-add2", entry: "run_shell", roleId: ROLE });
    assert.equal(addReview.allow, false, "无 task scope ⇒ 任务级 Git 写拒绝");
    const commitReview = await gate({ command: "git commit -m ok", argv: ["git", "commit", "-m", "ok"], cwd: root, toolCallId: "c-commit2", entry: "run_shell", roleId: ROLE });
    assert.equal(commitReview.allow, false);
    assert.equal(readonly.match(["git", "add", "src/core/main.ts"]), undefined);
    assert.equal(readonly.match(["git", "commit", "-m", "ok"]), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
