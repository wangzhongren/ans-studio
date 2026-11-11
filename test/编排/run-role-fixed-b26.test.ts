// test/编排/run-role-fixed-b26.test.ts
// T3 B26（2026-11-11，编排）：RR23 失败修复——fixed A11 受派任务的写集不再走 legacy trunk
// `prepareAssignedTaskWriteScope`（其要求 runId，fixed 任务必然失败 ⇒ 空交集、worker 全部写入被拒）。
// 写集 = task.created.modulePaths（B21 派生）∩ 团队计划角色写集（resolveTaskGitScope 同一权威）；
// 文件精确、目录前缀；to 必须等于当前角色；无 modulePaths 的 fixed 任务与 legacy 形状保持现状。
//
// 全部为假件：不真跑 Git，不启动真实模型/Electron。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { appendBasisEvent, appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { BasisEvent, RuntimeAdapter, RoleSession, SessionEvent, WriteGate, WorkflowEvent } from "../../src/model/runtime.ts";

const FLOW = "snake";
const WORKFLOW = "wf-b26-writescope";
const AT = "2026-11-11T10:00:00.000Z";
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

const MODULES_DOC = [
  "---",
  "schema: project-modules/v2",
  "flowId: snake",
  "version: 1",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: 核心逻辑",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "  - id: assets",
  "    name: Assets",
  "    purpose: 静态资源",
  "    path: assets/",
  "    category: core",
  "    publicContract: assets/README.md",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "  - id: entry",
  "    name: Entry",
  "    purpose: 入口页",
  "    path: index.html",
  "    category: ui",
  "    publicContract: index.html",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Modules",
  "",
].join("\n");

const ROSTER_DOC = [
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
  "    modules: [core, assets]",
  "  - id: ui",
  "    displayName: UI",
  "    purpose: Entry",
  "    capability: HTML",
  "    modules: [entry]",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: 核心逻辑",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "  - id: assets",
  "    name: Assets",
  "    purpose: 静态资源",
  "    path: assets/",
  "    category: core",
  "    publicContract: assets/README.md",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "  - id: entry",
  "    name: Entry",
  "    purpose: 入口页",
  "    path: index.html",
  "    category: ui",
  "    publicContract: index.html",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Roster",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "management: [convener, impl, ui]",
  "modules:",
  "  - id: core",
  "    path: src/core/",
  "    roleId: impl",
  "  - id: assets",
  "    path: assets/",
  "    roleId: impl",
  "  - id: entry",
  "    path: index.html",
  "    roleId: ui",
  "roles:",
  "  - id: impl",
  "    modules: [core, assets]",
  "  - id: ui",
  "    modules: [entry]",
  "```",
  "",
].join("\n");

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
    "    modules: [core, assets]",
    "    writesets: [src/core/main.js, assets/note.txt]",
    "    dependsOn: []",
    "  - roleId: ui",
    "    modules: [entry]",
    "    writesets: [index.html]",
    "    dependsOn: []",
    "---",
    "# Team plan",
    "",
  ].join("\n");
}

async function seedFixedProject(root: string): Promise<void> {
  await writeFile(root, "角色卡/impl/role-card.md", "# 角色 impl\n");
  await writeFile(
    root,
    "角色卡/impl/boundary.yaml",
    "role: impl\nentries:\n  - kind: directory\n    path: src/core\n    root: project\n    purpose: 核心写区\n  - kind: directory\n    path: assets\n    root: project\n    purpose: 资源写区\n",
  );
  await writeFile(root, "角色卡/ui/role-card.md", "# 角色 ui\n");
  await writeFile(
    root,
    "角色卡/ui/boundary.yaml",
    "role: ui\nentries:\n  - kind: file\n    path: index.html\n    root: project\n    purpose: 入口写区\n",
  );
  await writeFile(root, "角色卡/governance-boundary.yaml", "role: governance\nentries: []\n");
  const modules = MODULES_DOC;
  const roster = ROSTER_DOC;
  const plan = teamPlan(sha(modules), sha(roster));
  await writeFile(root, "docs/proposals/snake-modules-v1.md", modules);
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
  const started: WorkflowEvent = {
    ...BASE, kind: "workflow.started", workflowId: WORKFLOW, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  };
  assert.equal((await appendWorkflowEvent(root, started)).ok, true);
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

interface TaskSeed {
  taskId: string;
  to: string;
  moduleId?: string;
  modulePaths?: string[];
  workflowId?: string;
  runId?: string;
  runState?: "draft" | "pinned" | "legacy";
}

async function seedTask(root: string, seed: TaskSeed): Promise<void> {
  const created = taskEvent("task.created", {
    taskId: seed.taskId,
    from: "convener",
    to: seed.to,
    text: "实现任务",
    sideEffect: "code",
    idempotencyKey: `work:${WORKFLOW}:A11:${seed.taskId}`,
    flowId: FLOW,
    ...(seed.workflowId !== undefined ? { workflowId: seed.workflowId } : {}),
    ...(seed.runId !== undefined ? { runId: seed.runId } : {}),
    ...(seed.runState !== undefined ? { runState: seed.runState } : {}),
    stage: "A11",
    ...(seed.moduleId !== undefined ? { moduleId: seed.moduleId } : {}),
    ...(seed.modulePaths !== undefined ? { modulePaths: seed.modulePaths } : {}),
  }, NOW);
  const appended = await appendTaskEvent(root, created);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

function projectOf(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {
      impl: { card: "角色卡/impl/role-card.md", boundary: "角色卡/impl/boundary.yaml" },
      ui: { card: "角色卡/ui/role-card.md", boundary: "角色卡/ui/boundary.yaml" },
    },
    builtInRoles: [],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:b26" } },
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

/** 打开 fixed 会话并返回捕获的写门禁（assignedTaskWritePaths 在会话打开时解析）。 */
async function openGate(root: string, roleId: string, taskId: string, writeSet: string[]): Promise<WriteGate> {
  let gate: WriteGate | undefined;
  const createAdapter = (writeGate: WriteGate): RuntimeAdapter => {
    gate = writeGate;
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
    roleId,
    project: projectOf(root),
    runtime: "pi",
    taskId,
    workflowMode: "fixed",
    scope: { writeSet, conditions: [] },
  }, { createAdapter });
  await handle.dispose();
  assert.ok(gate !== undefined, "写门禁应已捕获");
  return gate!;
}

async function decision(gate: WriteGate, root: string, rel: string): Promise<boolean> {
  const result = await gate(path.join(root, ...rel.split("/")));
  return result.allowed;
}

test("B26 fixed A11 写集：模块内（目录前缀/文件精确）允许，模块外拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-b26-scope-"));
  try {
    await seedFixedProject(root);
    await seedTask(root, { taskId: "t-impl-core", to: "impl", moduleId: "core", modulePaths: ["src/core/"], workflowId: WORKFLOW });
    await seedTask(root, { taskId: "t-ui-entry", to: "ui", moduleId: "entry", modulePaths: ["index.html"], workflowId: WORKFLOW });

    // impl：目录模块 src/core/ —— 模块内文件允许；同 scope 但模块外（assets）拒绝。
    const implGate = await openGate(root, "impl", "t-impl-core", ["src/core/main.js", "assets/note.txt"]);
    assert.equal(await decision(implGate, root, "src/core/main.js"), true, "目录模块前缀内的文件应允许");
    assert.equal(await decision(implGate, root, "assets/note.txt"), false, "模块外路径即使角色可写也应拒绝");

    // ui：文件模块 index.html —— 精确文件允许；目录模块外拒绝。
    const uiGate = await openGate(root, "ui", "t-ui-entry", ["index.html", "src/core/main.js"]);
    assert.equal(await decision(uiGate, root, "index.html"), true, "文件模块精确路径应允许");
    assert.equal(await decision(uiGate, root, "src/core/main.js"), false, "非本模块路径应拒绝");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("B26 fixed A11 写集：无 modulePaths 的 fixed 任务保持拒绝（不扩权）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-b26-nomodule-"));
  try {
    await seedFixedProject(root);
    await seedTask(root, { taskId: "t-impl-nomodule", to: "impl", workflowId: WORKFLOW });
    const gate = await openGate(root, "impl", "t-impl-nomodule", ["src/core/main.js"]);
    assert.equal(await decision(gate, root, "src/core/main.js"), false, "无 modulePaths 不得获得写集");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("B26 fixed A11 写集：task.to 与当前角色不一致 ⇒ 空集拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-b26-tomismatch-"));
  try {
    await seedFixedProject(root);
    await seedTask(root, { taskId: "t-ui-forged", to: "ui", moduleId: "core", modulePaths: ["src/core/"], workflowId: WORKFLOW });
    const gate = await openGate(root, "impl", "t-ui-forged", ["src/core/main.js"]);
    assert.equal(await decision(gate, root, "src/core/main.js"), false, "非受派人不得获得该任务写集");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("B26 fixed A11 写集：无 workflowId 的 legacy 形状仍走 legacy trunk 路径（不启用 fixed 分支）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-b26-legacy-"));
  try {
    await seedFixedProject(root);
    await seedTask(root, { taskId: "t-impl-legacy", to: "impl", moduleId: "core", modulePaths: ["src/core/"], runId: "run-b26-legacy", runState: "draft" });
    const gate = await openGate(root, "impl", "t-impl-legacy", ["src/core/main.js"]);
    // legacy 任务无 runId/trunk 事实 ⇒ 既有 prepareAssignedTaskWriteScope 失败 ⇒ 空集（旧行为不变）。
    assert.equal(await decision(gate, root, "src/core/main.js"), false, "legacy 形状不得因 modulePaths 获得 fixed 写集");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
