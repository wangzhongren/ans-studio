// test/编排/workflow-baseline.test.ts
// T3 B1（2026-11-10）：B1 AC-15/AC-16/AC-19、T-07/T-08——A9 basis.recorded + reviewRoleId + drift。
// 覆盖：团队计划结构校验/hash 入账；roster v4 review 角色绑定；baseline-document-* 失败面；
// path-b 只读快照（Q4：缺失不失败、不产生写权）；basis 漂移 fail-closed 并记 basis.drift。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendWorkflowEvent,
  readBasisLedger,
  recordBasis,
  verifyBasisForWorkflow,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const NOW = () => new Date("2026-11-10T10:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-baseline-"));
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
async function appendEvents(root: string, workflowId: string, events: WorkflowEvent[]): Promise<void> {
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

const BASE = { v: 1 as const, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1" as const, path: "A" as const };
function seedEvents(workflowId: string, throughStage: WorkflowStage): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  const stages: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];
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
  events.push({
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${throughStage}:1`, stage: throughStage,
    requestTaskId: `t-req-${throughStage}`, requestDigest: D, attempt: 1,
  });
  return events;
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

test("recordBasis：团队计划结构校验 + basis.recorded（reviewRoleId=roster review 角色）+ stage.completed A9", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, seedEvents(workflowId, "A9"));
    const { modulesSha, rosterSha } = await seedDocs(root);
    const plan = teamPlan(modulesSha, rosterSha);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);

    const recorded = await recordBasis({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-baseline-1",
      planPath: "docs/scheduling/snake-team-v1.md", planVersion: 1,
      repo: { state: "initialized", branch: "ans/task/" + workflowId, headOid: null, mainUnborn: true, initialBranch: "main", ignorePolicy: "ans-v1", gitignoreSha256: D },
      now: NOW,
    });
    assert.equal(recorded.ok, true, recorded.ok === false ? recorded.code : "");
    if (!recorded.ok) return;
    assert.equal(recorded.reviewRoleId, "qa-project", "roster roles[].review=true 优先于默认 verifier");
    assert.equal(recorded.stageCompleted, true);
    assert.match(recorded.basisId, /^bas-[a-f0-9]{24}$/);
    assert.ok(recorded.documents.some((doc) => doc.kind === "roster" && doc.sha256 === rosterSha));

    const ledger = await readBasisLedger(root);
    const basis = ledger.events.find((event) => event.kind === "basis.recorded");
    assert.ok(basis && basis.kind === "basis.recorded");
    if (basis?.kind === "basis.recorded") {
      assert.equal(basis.reviewRoleId, "qa-project");
      assert.equal(basis.teamPlan?.sha256, sha(plan));
      assert.equal(basis.repo?.state, "initialized");
    }
    // 重放：同幂等键返回原 basisId。
    const replay = await recordBasis({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-baseline-1",
      planPath: "docs/scheduling/snake-team-v1.md", planVersion: 1, now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.basisId, recorded.basisId);
    }
    // 关键门 drift：修改文档 ⇒ basis-drift（fail-closed）并记 basis.drift。
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\nchanged: true\n---\n");
    const drift = await verifyBasisForWorkflow({ projectRoot: root, workflowId, now: NOW });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "basis-drift");
    const afterDrift = await readBasisLedger(root);
    assert.ok(afterDrift.events.some((event) => event.kind === "basis.drift"));
  } finally {
    await cleanup(root);
  }
});

test("失败面：团队计划 roster hash 漂移 ⇒ baseline-team-plan-invalid；缺文档 ⇒ baseline-document-missing", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, seedEvents(workflowId, "A9"));
    const { modulesSha } = await seedDocs(root);
    await writeFile(root, "docs/scheduling/snake-team-v1.md", teamPlan(modulesSha, "c".repeat(64)));
    const invalid = await recordBasis({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-baseline-bad",
      planPath: "docs/scheduling/snake-team-v1.md", planVersion: 1, now: NOW,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "baseline-team-plan-invalid");

    const missingRoot = await tempRoot();
    try {
      const missingWorkflow = workflowIdFor(FLOW, "A", "t-src2", D);
      await appendEvents(missingRoot, missingWorkflow, seedEvents(missingWorkflow, "A9"));
      const missing = await recordBasis({
        projectRoot: missingRoot, flowId: FLOW, workflowId: missingWorkflow, operationId: "op-baseline-missing",
        planPath: "docs/scheduling/snake-team-v1.md", planVersion: 1, now: NOW,
      });
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.match(missing.code, /^baseline-(document-missing|roster-drift)$/);
    } finally {
      await cleanup(missingRoot);
    }
  } finally {
    await cleanup(root);
  }
});

test("path-b 只读快照（Q4）：缺失文档不失败、无 teamPlan、reviewRoleId 默认 verifier、不产生写权", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "B", "t-src", D);
    await appendEvents(root, workflowId, [{
      ...BASE, path: "B", kind: "workflow.started", workflowId, flowId: FLOW,
      idempotencyKey: `workflow-start:${FLOW}:B:t-src`, trigger: { by: "chief", reason: "path-b" }, sourceTaskId: "t-src",
    }]);
    // 只存在意图（其余治理文档缺失）——path-b 快照只收存在文档。
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\n---\n# Intent\n");
    const snapshot = await recordBasis({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-path-b-1", reason: "path-b", now: NOW,
    });
    assert.equal(snapshot.ok, true, snapshot.ok === false ? snapshot.code : "");
    if (!snapshot.ok) return;
    assert.equal(snapshot.reviewRoleId, "verifier");
    assert.equal(snapshot.stageCompleted, false);
    assert.deepEqual(snapshot.documents.map((doc) => doc.kind), ["intent"]);
    const ledger = await readBasisLedger(root);
    const basis = ledger.events.find((event) => event.kind === "basis.recorded");
    assert.ok(basis && basis.kind === "basis.recorded");
    if (basis?.kind === "basis.recorded") {
      assert.equal(basis.reason, "path-b");
      assert.equal(basis.teamPlan, null);
    }
  } finally {
    await cleanup(root);
  }
});
