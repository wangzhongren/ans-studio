// test/编排/baseline-service.test.ts
// T3 B3（2026-11-10，编排）：B1 AC-15/AC-16/AC-19、T-07——A9 基线 3 件小事应用服务。
// 覆盖：complete_team_plan v4（legacy 字段拒绝/团队计划结构/文档 hash/预算）、Git 端口顺序
// （git init -b main → .gitignore+baseline commit → dirty → 任务分支）、basis.recorded(repo) + A9 完成、
// 失败码（baseline-git-init-failed/baseline-parent-repository-detected/baseline-repository-dirty/
// baseline-gitignore-dirty/baseline-branch-exists/baseline-document-budget/baseline-team-plan-invalid/
// baseline-legacy-field-forbidden）+ stage.blocked A9 + 无客户卡、幂等 replay、不触 trunk/runs。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendWorkflowEvent,
  completeTeamPlanFixed,
  readBasisLedger,
  readWorkflowLedger,
  taskBranchName,
  type BaselineGitPort,
  type BaselineGitRepositoryState,
  type BaselineGitReceipt,
  type WorkflowServiceFailure,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";
import type { GitOid } from "../../src/model/trunk.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const NOW = () => new Date(AT);
const D = "a".repeat(64);
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const WORKFLOW = "wf-baseline00000000000000001";
function oid(fill: string): GitOid {
  return { objectFormat: "sha1", hex: fill.repeat(40) };
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-baseline-svc-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
async function appendEvents(root: string, events: WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
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
    "  - id: qa-project",
    "    displayName: Project QA",
    "    purpose: Independent review",
    "    capability: Review",
    "    modules: [core]",
    "    review: true",
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
    "management: [convener, qa-project]",
    "modules:",
    "  - id: core",
    "    path: src/core/",
    "    roleId: qa-project",
    "roles:",
    "  - id: qa-project",
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
    "  - roleId: qa-project",
    "    modules: [core]",
    "    writesets: [src/core/]",
    "    dependsOn: []",
    "---",
    "# Team plan",
    "",
  ].join("\n");
}

async function seedDocs(root: string): Promise<{ modulesSha: string; rosterSha: string }> {
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# Intent\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\n---\n# Proposal\nintent: docs/product/snake-intent-v1.md\n");
  await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_DOC);
  const roster = rosterDoc();
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  return { modulesSha: sha(MODULES_DOC), rosterSha: sha(roster) };
}

function seedA9(workflowId: string): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"] as WorkflowStage[]) {
    events.push({
      ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
      idempotencyKey: `stage-request:${workflowId}:${stage}:1`, stage,
      requestTaskId: `t-req-${stage}`, requestDigest: D, attempt: 1,
    });
    events.push({
      ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
      idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
      cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
    });
  }
  events.push({
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:A9:1`, stage: "A9",
    requestTaskId: "t-req-A9", requestDigest: D, attempt: 1,
  });
  return events;
}

interface FakeBaselineOverrides {
  repository?: BaselineGitRepositoryState | WorkflowServiceFailure;
  gitignore?: { changed: boolean; committed: boolean; sha256: string } | WorkflowServiceFailure;
  worktree?: { branch: string; trackedChanges: number; untracked: string[] } | WorkflowServiceFailure;
  branch?: { branch: string; baseOid: GitOid | null; reused: boolean } | WorkflowServiceFailure;
}

function isFailure(value: unknown): value is WorkflowServiceFailure {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}

function fakeBaselinePort(workflowId: string, overrides: FakeBaselineOverrides = {}): BaselineGitPort & { calls: string[] } {
  const calls: string[] = [];
  const repository: BaselineGitRepositoryState = {
    state: "initialized", branch: "main", baseOid: null, mainUnborn: true, initialBranch: "main", objectFormat: "sha1",
  };
  const gitignore = { changed: true, committed: true, sha256: "c".repeat(64) };
  const worktree = { branch: "main", trackedChanges: 0, untracked: [] as string[] };
  const branch = { branch: taskBranchName(workflowId), baseOid: null, reused: false };
  return {
    calls,
    async ensureRepository(request) {
      calls.push(`ensureRepository:${request.allowInit}`);
      const value = overrides.repository ?? repository;
      return isFailure(value) ? value : { ok: true, repository: value };
    },
    async ensureGitignore() {
      calls.push("ensureGitignore");
      const value = overrides.gitignore ?? gitignore;
      return isFailure(value) ? value : { ok: true, ...value };
    },
    async inspectWorktree() {
      calls.push("inspectWorktree");
      const value = overrides.worktree ?? worktree;
      return isFailure(value) ? value : { ok: true, ...value };
    },
    async prepareTaskBranch(request) {
      calls.push(`prepareTaskBranch:${request.base}:${request.allowReuse}`);
      const value = overrides.branch ?? branch;
      return isFailure(value) ? value : { ok: true, ...value };
    },
  };
}

test("complete_team_plan v4：Git 顺序（init→gitignore→dirty→branch）→ basis.recorded(repo) → stage.completed A9；幂等 replay", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha, rosterSha } = await seedDocs(root);
    const plan = teamPlan(modulesSha, rosterSha);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
    const port = fakeBaselinePort(WORKFLOW);

    const result = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-plan-v4-1",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
      port, now: NOW,
    });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (!result.ok) return;
    assert.equal(result.stageCompleted, true);
    assert.equal(result.plan.sha256, sha(plan));
    assert.ok(result.basisId.startsWith("bas-"));
    assert.deepEqual(port.calls, [
      "ensureRepository:true", "ensureGitignore", "inspectWorktree", "prepareTaskBranch:main:false",
    ]);
    const git = result.git as BaselineGitReceipt | undefined;
    assert.ok(git !== undefined);
    if (git !== undefined) {
      assert.equal(git.state, "initialized");
      assert.equal(git.branch, taskBranchName(WORKFLOW));
      assert.equal(git.gitignoreSha256, "c".repeat(64));
      assert.equal(git.mainUnborn, true);
    }
    const basisLedger = await readBasisLedger(root);
    const basis = basisLedger.events.find((event) => event.kind === "basis.recorded");
    assert.ok(basis && basis.kind === "basis.recorded");
    if (basis?.kind === "basis.recorded") {
      assert.equal(basis.reason, "baseline");
      assert.equal(basis.repo?.state, "initialized");
      assert.equal(basis.repo?.branch, taskBranchName(WORKFLOW));
      assert.equal(basis.teamPlan?.sha256, sha(plan));
    }
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A9"));
    const view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stage, "A9");
    assert.equal(view.stages.A9.status, "completed");
    // 不触旧机制、不产生客户卡。
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")));
    await assert.rejects(fs.stat(path.join(root, ".ans", "runs")));
    const tasks = await readTaskState(root);
    assert.equal(tasks.events.some((event) => event.kind === "request.created"), false);

    const replay = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-plan-v4-1",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port, now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.basisId, result.basisId);
    }
  } finally {
    await cleanup(root);
  }
});

test("失败面：git init / 父仓库 / dirty / gitignore dirty / branch exists 按真实原因 fail-closed + stage.blocked A9；不写 basis", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha, rosterSha } = await seedDocs(root);
    const plan = teamPlan(modulesSha, rosterSha);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
    const cases: Array<{ name: string; overrides: FakeBaselineOverrides; code: string; callsAfter: string[] }> = [
      {
        name: "git init 失败",
        overrides: { repository: { ok: false, code: "baseline-git-init-failed", message: "EACCES" } },
        code: "baseline-git-init-failed",
        callsAfter: ["ensureRepository:true"],
      },
      {
        name: "父仓库",
        overrides: { repository: { ok: false, code: "baseline-parent-repository-detected", message: "在外部仓库内" } },
        code: "baseline-parent-repository-detected",
        callsAfter: ["ensureRepository:true"],
      },
      {
        name: "gitignore 被跟踪且 dirty",
        overrides: { gitignore: { ok: false, code: "baseline-gitignore-dirty", message: "不覆盖用户改动" } },
        code: "baseline-gitignore-dirty",
        callsAfter: ["ensureRepository:true", "ensureGitignore"],
      },
      {
        name: "工作区 dirty",
        overrides: { worktree: { branch: "main", trackedChanges: 2, untracked: [] } },
        code: "baseline-repository-dirty",
        callsAfter: ["ensureRepository:true", "ensureGitignore", "inspectWorktree"],
      },
      {
        name: "任务分支他属",
        overrides: { branch: { ok: false, code: "baseline-branch-exists", message: "同名分支存在" } },
        code: "baseline-branch-exists",
        callsAfter: ["ensureRepository:true", "ensureGitignore", "inspectWorktree", "prepareTaskBranch:main:false"],
      },
    ];
    for (const item of cases) {
      const port = fakeBaselinePort(WORKFLOW, item.overrides);
      const result = await completeTeamPlanFixed({
        projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: `op-${item.code}`,
        plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port, now: NOW,
      });
      assert.equal(result.ok, false, item.name);
      if (!result.ok) assert.equal(result.code, item.code, item.name);
      assert.deepEqual(port.calls, item.callsAfter, item.name);
      const basisLedger = await readBasisLedger(root);
      assert.equal(basisLedger.events.length, 0, `${item.name}：失败不写 basis`);
    }
    // 每次失败都留下 stage.blocked A9（code/summary/attempt）；可重试（blocked 不是终态）。
    const ledger = await readWorkflowLedger(root);
    const blocked = ledger.events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.blocked" }> =>
      event.kind === "stage.blocked" && event.stage === "A9");
    assert.ok(blocked.length >= 1);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.stage, "A9");
    assert.equal(view.status, "blocked");
    const last = blocked[blocked.length - 1]!;
    assert.equal(last.stage, "A9");
    assert.ok(last.attempt >= 1);
    assert.equal(typeof last.code, "string");
    assert.equal(typeof last.summary, "string");
  } finally {
    await cleanup(root);
  }
});

test("失败面：文档预算超限（单文件 >4 MiB）⇒ baseline-document-budget；Git 端口不被调用", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha, rosterSha } = await seedDocs(root);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", teamPlan(modulesSha, rosterSha));
    const huge = `${"x".repeat(4 * 1024 * 1024 + 1)}`;
    await writeFile(root, "docs/product/snake-intent-v1.md", huge);
    const port = fakeBaselinePort(WORKFLOW);
    const result = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-budget",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port, now: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "baseline-document-budget");
    assert.deepEqual(port.calls, [], "文档预算失败发生在 Git 准备之前");
  } finally {
    await cleanup(root);
  }
});

test("失败面：团队计划结构不合法 ⇒ baseline-team-plan-invalid；legacy 字段 runId/baseDigest ⇒ baseline-legacy-field-forbidden", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha } = await seedDocs(root);
    const badPlan = teamPlan(modulesSha, "b".repeat(64));
    await writeFile(root, "docs/scheduling/snake-team-v1.md", badPlan);
    const invalid = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-plan-bad",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port: fakeBaselinePort(WORKFLOW), now: NOW,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "baseline-team-plan-invalid");

    const legacyPort = fakeBaselinePort(WORKFLOW);
    const legacy = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-plan-legacy",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port: legacyPort,
      runId: "run-1", baseDigest: D, now: NOW,
    });
    assert.equal(legacy.ok, false);
    if (!legacy.ok) assert.equal(legacy.code, "baseline-legacy-field-forbidden");
    assert.deepEqual(legacyPort.calls, []);
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "stage.blocked" && event.stage === "A9" && event.code === "baseline-legacy-field-forbidden"));
  } finally {
    await cleanup(root);
  }
});

test("任务分支复用：basis 已记录该 workflow 的分支 ⇒ allowReuse=true（G-8 重试不死锁）", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha, rosterSha } = await seedDocs(root);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", teamPlan(modulesSha, rosterSha));
    // 先写一条该 workflow 拥有 ans/task/<wf> 的 basis 记录（G-8 归属证据）。
    const { appendBasisEvent } = await import("../../src/common/编排/workflow-service.ts");
    const seeded = await appendBasisEvent(root, {
      v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
      idempotencyKey: `baseline:${WORKFLOW}:prior`, basisId: `bas-${sha("prior").slice(0, 24)}`,
      workflowId: WORKFLOW, flowId: FLOW, documents: [], teamPlan: null,
      repo: { state: "initialized", branch: taskBranchName(WORKFLOW), baseOid: null, headOid: null, ignorePolicy: "ans-v1", gitignoreSha256: "c".repeat(64) },
      reviewRoleId: "verifier", operationId: "op-prior", recordedBy: "application", reason: "baseline",
    });
    assert.equal(seeded.ok, true);
    const port = fakeBaselinePort(WORKFLOW);
    const result = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-plan-reuse",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port, now: NOW,
    });
    assert.equal(result.ok, true, result.ok === false ? result.code : "");
    assert.ok(port.calls.includes("prepareTaskBranch:main:true"), JSON.stringify(port.calls));
  } finally {
    await cleanup(root);
  }
});

test("文档读取预算（AC-15/T-07）：32 文件上限与 8 MiB 总量上限（默认口径）", async () => {
  const { readBasisDocuments } = await import("../../src/common/编排/basis-guard.ts");
  const root = await tempRoot();
  try {
    const refs: Array<{ kind: string; path: string; version: number }> = [];
    for (let index = 0; index < 33; index += 1) {
      const rel = `docs/contracts/budget-${index}.md`;
      await writeFile(root, rel, "x");
      refs.push({ kind: "contract", path: rel, version: 1 });
    }
    const tooMany = await readBasisDocuments(root, refs);
    assert.equal(tooMany.ok, false);
    if (!tooMany.ok) assert.equal(tooMany.code, "basis-document-budget");
    // 总量 >8 MiB（单文件均 ≤4 MiB）。
    const chunk = "y".repeat(4 * 1024 * 1024);
    await writeFile(root, "docs/contracts/big-a.md", chunk);
    await writeFile(root, "docs/contracts/big-b.md", chunk);
    await writeFile(root, "docs/contracts/big-c.md", "!");
    const tooBig = await readBasisDocuments(root, [
      { kind: "contract", path: "docs/contracts/big-a.md", version: 1 },
      { kind: "contract", path: "docs/contracts/big-b.md", version: 1 },
      { kind: "contract", path: "docs/contracts/big-c.md", version: 1 },
    ]);
    assert.equal(tooBig.ok, false);
    if (!tooBig.ok) assert.equal(tooBig.code, "basis-document-budget");
    // 单文件 >4 MiB。
    const hugeFile = "z".repeat(4 * 1024 * 1024 + 1);
    await writeFile(root, "docs/contracts/huge.md", hugeFile);
    const tooLarge = await readBasisDocuments(root, [{ kind: "contract", path: "docs/contracts/huge.md", version: 1 }]);
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.code, "basis-document-budget");
  } finally {
    await cleanup(root);
  }
});

test("失败面：operationId 指向不同内容 ⇒ baseline-operation-conflict；非运营发起 ⇒ baseline-identity-invalid", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA9(WORKFLOW));
    const { modulesSha, rosterSha } = await seedDocs(root);
    const planV1 = teamPlan(modulesSha, rosterSha);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", planV1);
    const first = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-shared",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port: fakeBaselinePort(WORKFLOW), now: NOW,
    });
    assert.equal(first.ok, true, first.ok === false ? first.code : "");
    // 同 operationId + 新计划版本（不同幂等键）⇒ baseline-operation-conflict。
    const planV2 = planV1.replace("version: 1", "version: 2");
    await writeFile(root, "docs/scheduling/snake-team-v2.md", planV2);
    const conflict = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-shared",
      plan: { path: "docs/scheduling/snake-team-v2.md", version: 2 }, port: fakeBaselinePort(WORKFLOW), now: NOW,
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "baseline-operation-conflict");

    const identity = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-identity",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 }, port: fakeBaselinePort(WORKFLOW),
      actorRoleId: "chief", now: NOW,
    });
    assert.equal(identity.ok, false);
    if (!identity.ok) assert.equal(identity.code, "baseline-identity-invalid");
    const identityPort = fakeBaselinePort(WORKFLOW);
    const convener = await completeTeamPlanFixed({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-identity-ok",
      plan: { path: "docs/scheduling/snake-team-v2.md", version: 2 }, port: identityPort,
      actorRoleId: "convener", now: NOW,
    });
    assert.equal(convener.ok, true, convener.ok === false ? convener.code : "");
  } finally {
    await cleanup(root);
  }
});
