// test/编排/path-b-baseline.test.ts
// T3 B3（2026-11-10，编排）：B1 AC-10/AC-15/AC-16、T-07/T-12——路径 B 最小仓库准备与 B3 写集派生。
// 覆盖：preparePathBStart（既有仓库否则 b-repository-required、不自动 init、从当前 HEAD 建/复用分支、
// dirty 拒绝、basis.recorded(reason:"path-b") 只读快照不产生写权/不写团队计划/不弹卡）、
// derivePathBWriteSets（scope.files ∩ roster 模块属主；无 roster 用边界；越界/多属主 ⇒ b-change-scope-invalid；
// 治理文档 ⇒ b-change-scope-requires-rapporteur；.ans/角色卡 拒绝）、recordChangeScopeDecision（B2）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendWorkflowEvent,
  derivePathBWriteSets,
  preparePathBStart,
  readBasisLedger,
  readWorkflowLedger,
  recordChangeScopeDecision,
  taskBranchName,
  type BaselineGitPort,
  type BaselineGitRepositoryState,
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
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "B" as const };
const WORKFLOW = "wf-pathb000000000000000001";
function oid(fill: string): GitOid {
  return { objectFormat: "sha1", hex: fill.repeat(40) };
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-pathb-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function sha(text: string): string {
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

function seedPathB(workflowId: string, throughStage: WorkflowStage = "B1"): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:B:t-src`, trigger: { by: "chief", reason: "path-b" }, sourceTaskId: "t-src",
  }];
  const stages: WorkflowStage[] = throughStage === "B2" ? ["B1"] : [];
  for (const stage of stages) {
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
  if (throughStage === "B1") {
    events.push({
      ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
      idempotencyKey: `stage-request:${workflowId}:B1:1`, stage: "B1",
      requestTaskId: "t-req-B1", requestDigest: D, attempt: 1,
    });
  }
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
    state: "existing", branch: "main", baseOid: oid("4"), mainUnborn: false, initialBranch: "main", objectFormat: "sha1",
  };
  const branch = { branch: taskBranchName(workflowId), baseOid: oid("4"), reused: false };
  return {
    calls,
    async ensureRepository(request) {
      calls.push(`ensureRepository:${request.allowInit}`);
      const value = overrides.repository ?? repository;
      return isFailure(value) ? value : { ok: true, repository: value };
    },
    async ensureGitignore() {
      calls.push("ensureGitignore");
      const value = overrides.gitignore ?? { changed: true, committed: true, sha256: "c".repeat(64) };
      return isFailure(value) ? value : { ok: true, ...value };
    },
    async inspectWorktree() {
      calls.push("inspectWorktree");
      const value = overrides.worktree ?? { branch: "main", trackedChanges: 0, untracked: [] as string[] };
      return isFailure(value) ? value : { ok: true, ...value };
    },
    async prepareTaskBranch(request) {
      calls.push(`prepareTaskBranch:${request.base}:${request.allowReuse}`);
      const value = overrides.branch ?? branch;
      return isFailure(value) ? value : { ok: true, ...value };
    },
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
    "  - id: qa-project",
    "    displayName: Project QA",
    "    purpose: Independent review",
    "    capability: Review",
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

async function seedRoster(root: string): Promise<void> {
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# Intent\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\n---\n# Proposal\nintent: docs/product/snake-intent-v1.md\n");
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_DOC);
  await writeFile(root, "docs/proposals/snake-roster-v1.md", rosterDoc());
}

function boundaryMd(paths: readonly string[]): string {
  return [
    "# 边界",
    "",
    "## Section 1: 可修改文件与目录",
    "",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    ...paths.map((p) => `| 目录 | \`${p}\` | test |`),
    "",
  ].join("\n");
}

test("preparePathBStart：既有仓库（不自动 init）→ .gitignore→dirty→从 HEAD 建分支→ basis.recorded(reason:path-b) 只读快照", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedPathB(WORKFLOW));
    // 只存在意图文档：path-b 快照只收存在文档，不写团队计划、不产生写权。
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\n---\n");
    const port = fakeBaselinePort(WORKFLOW);
    const result = await preparePathBStart({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-pathb-1", port, now: NOW,
    });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (!result.ok) return;
    assert.equal(result.repository.state, "existing");
    assert.equal(result.repository.branch, taskBranchName(WORKFLOW));
    assert.equal(result.repository.mainUnborn, false);
    assert.deepEqual(port.calls, [
      "ensureRepository:false", "ensureGitignore", "inspectWorktree", "prepareTaskBranch:head:false",
    ]);
    const basisLedger = await readBasisLedger(root);
    const basis = basisLedger.events.find((event) => event.kind === "basis.recorded");
    assert.ok(basis && basis.kind === "basis.recorded");
    if (basis?.kind === "basis.recorded") {
      assert.equal(basis.reason, "path-b");
      assert.equal(basis.teamPlan, null);
      assert.equal(basis.repo?.state, "existing");
      assert.equal(basis.repo?.branch, taskBranchName(WORKFLOW));
      assert.equal(basis.repo?.baseOid, oid("4").hex);
      assert.deepEqual(basis.documents.map((doc) => doc.kind), ["intent"]);
    }
    // 不写团队计划、不弹卡（无 request.created）、B1 不因 path-b 准备而完成。
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stage, "B1");
    assert.equal(view.stages.B1.status, "requested");
    const tasks = await readTaskState(root);
    assert.equal(tasks.events.some((event) => event.kind === "request.created"), false);
  } finally {
    await cleanup(root);
  }
});

test("preparePathBStart：无仓库 ⇒ b-repository-required（不自动 init）；dirty ⇒ baseline-repository-dirty + stage.blocked B1", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedPathB(WORKFLOW));
    const noRepo = fakeBaselinePort(WORKFLOW, {
      repository: { ok: false, code: "b-repository-required", message: "路径 B 要求既有 Git 仓库（不自动 init）" },
    });
    const missing = await preparePathBStart({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-pathb-norepo", port: noRepo, now: NOW,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "b-repository-required");
    assert.deepEqual(noRepo.calls, ["ensureRepository:false"]);
    let ledger = await readWorkflowLedger(root);
    let view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.blocked?.code, "b-repository-required");

    const dirtyPort = fakeBaselinePort(WORKFLOW, {
      worktree: { branch: "main", trackedChanges: 1, untracked: ["scratch.txt"] },
    });
    const dirty = await preparePathBStart({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-pathb-dirty", port: dirtyPort, now: NOW,
    });
    assert.equal(dirty.ok, false);
    if (!dirty.ok) assert.equal(dirty.code, "baseline-repository-dirty");
    ledger = await readWorkflowLedger(root);
    view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.blocked?.code, "baseline-repository-dirty");
  } finally {
    await cleanup(root);
  }
});

test("derivePathBWriteSets：有 roster ⇒ scope.files ∩ 模块属主；越界/多义/治理写区拒绝", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedPathB(WORKFLOW));
    await seedRoster(root);
    const ok = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW,
      scopeFiles: ["src/core/ui.ts", "src/core/snake.ts", "src/core/ui.ts"],
    });
    assert.equal(ok.ok, true, ok.ok === false ? `${ok.code}: ${ok.message}` : "");
    if (ok.ok) {
      assert.equal(ok.source, "roster");
      assert.deepEqual(ok.writesets, [{ roleId: "qa-project", paths: ["src/core/snake.ts", "src/core/ui.ts"] }]);
    }
    const outside = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: ["lib/foo.ts"],
    });
    assert.equal(outside.ok, false);
    if (!outside.ok) assert.equal(outside.code, "b-change-scope-invalid");
    const ans = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: [".ans/state/workflows.jsonl"],
    });
    assert.equal(ans.ok, false);
    if (!ans.ok) assert.equal(ans.code, "b-change-scope-invalid");
    const roleCard = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: ["角色卡/qa-project/role-card.md"],
    });
    assert.equal(roleCard.ok, false);
    if (!roleCard.ok) assert.equal(roleCard.code, "b-change-scope-invalid");
    const empty = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: [],
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.code, "b-change-scope-invalid");
  } finally {
    await cleanup(root);
  }
});

test("derivePathBWriteSets：无 roster ⇒ 角色边界唯一属主；多属主/治理文档拒绝", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedPathB(WORKFLOW));
    await writeFile(root, "角色卡/impl/boundary.md", boundaryMd(["src/app/"]));
    const ok = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: ["src/app/main.ts"],
    });
    assert.equal(ok.ok, true, ok.ok === false ? `${ok.code}: ${ok.message}` : "");
    if (ok.ok) {
      assert.equal(ok.source, "boundary");
      assert.deepEqual(ok.writesets, [{ roleId: "impl", paths: ["src/app/main.ts"] }]);
    }
    await writeFile(root, "角色卡/qa/boundary.md", boundaryMd(["src/app/"]));
    const ambiguous = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: ["src/app/main.ts"],
    });
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.equal(ambiguous.code, "b-change-scope-invalid");

    await writeFile(root, "角色卡/impl/boundary.md", boundaryMd(["src/app/", "docs/contracts/"]));
    await fs.rm(path.join(root, "角色卡", "qa"), { recursive: true, force: true });
    const governance = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, scopeFiles: ["docs/contracts/snake-architecture-v2.md"],
    });
    assert.equal(governance.ok, false);
    if (!governance.ok) assert.equal(governance.code, "b-change-scope-requires-rapporteur");
  } finally {
    await cleanup(root);
  }
});

test("recordChangeScopeDecision：影响面 hash + 派生写集 → change.scope-decided（B2 完成，幂等）；越界拒绝", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedPathB(WORKFLOW, "B2"));
    await seedRoster(root);
    const impactText = "# 影响面\ncore 模块需要修复\n";
    await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", impactText);
    const result = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-scope-1",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "修复 core", files: ["src/core/snake.ts"], rationale: "bug" },
      requestTaskId: "t-req-B1", now: NOW,
    });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (result.ok) {
      assert.deepEqual(result.writesets, [{ roleId: "qa-project", paths: ["src/core/snake.ts"] }]);
      assert.equal(result.replay, false);
    }
    const ledger = await readWorkflowLedger(root);
    const scopeEvent = ledger.events.find((event) => event.kind === "change.scope-decided");
    assert.ok(scopeEvent && scopeEvent.kind === "change.scope-decided");
    if (scopeEvent?.kind === "change.scope-decided") {
      assert.equal(scopeEvent.decidedBy, "chief");
      assert.equal(scopeEvent.requestTaskId, "t-req-B1");
      assert.deepEqual(scopeEvent.effectiveWritesets, [{ roleId: "qa-project", paths: ["src/core/snake.ts"] }]);
    }
    const view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stage, "B2");
    assert.equal(view.stages.B2.status, "completed");
    const replay = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-scope-1",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "修复 core", files: ["src/core/snake.ts"], rationale: "bug" },
      requestTaskId: "t-req-B1", now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);

    const invalid = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-scope-bad",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "修复外部", files: ["lib/outside.ts"] },
      requestTaskId: "t-req-B1", now: NOW,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "b-change-scope-invalid");

    const drift = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW, operationId: "op-scope-drift",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: "b".repeat(64) },
      scope: { summary: "修复 core", files: ["src/core/snake.ts"] },
      requestTaskId: "t-req-B1", now: NOW,
    });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "b-change-scope-invalid");
  } finally {
    await cleanup(root);
  }
});
