// test/编排/workflow-close-intent.test.ts
// T3 B1（2026-11-10）：B1 AC-18/AC-09/AC-19/AC-24、T-04/T-08——fixed 收口/意图/激活/归档。
// 覆盖：closeTask v2（真实创建者/报告/幂等/不触 trunk）、A12b rework（MF-IR-1 方向）、
// prepareIntent/finalizeIntent（documentRefs 一次写入、intent entry、hash drift）、
// activateRoleDocumentsFixed（roster/提案决定/三文档 hash/role.activated/stage.completed A8）、
// archiveAcceptance（版本/幂等/不覆盖）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  activateRoleDocumentsFixed,
  appendWorkflowEvent,
  archiveAcceptance,
  closeTask,
  finalizeIntent,
  prepareIntent,
  requestStage,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import type { RequestResolvedEvent, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const NOW = () => new Date("2026-11-10T10:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-close-intent-"));
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
const BASE = { v: 1 as const, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1" as const, path: "A" as const };
function seedEvent(workflowId: string): WorkflowEvent[] {
  return [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
}
function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: D, attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage, ref = `seed-${stage}`): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:${ref}`, stage,
    cause: { kind: "seed", ref }, artifacts: [],
  };
}
function dispatched(workflowId: string, stage: WorkflowStage, taskId: string, targetRoleId = "verifier"): WorkflowEvent {
  return {
    ...BASE, kind: "stage.dispatched", workflowId, flowId: FLOW,
    idempotencyKey: `stage-dispatch:${workflowId}:${stage}:${taskId}`, stage, taskId, targetRoleId,
  };
}

test("closeTask v2：真实创建者/报告/幂等；accepted+evidence ⇒ stage.completed；不写 trunk/run", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"), requested(workflowId, "A2")]);
    const task = taskEvent("task.created", {
      taskId: "t-a2", from: "convener", to: "product", text: "写意图", sideEffect: "docs",
      idempotencyKey: `work:${workflowId}:A2:product:1`, flowId: FLOW, workflowId, stage: "A2",
    }, NOW);
    assert.equal((await appendTaskEvent(root, task)).ok, true);

    // 无报告 ⇒ accepted 收口拒绝。
    const noReport = await closeTask({
      projectRoot: root, operationId: "op-a2-close", taskId: "t-a2", outcome: "accepted", actorRoleId: "convener", now: NOW,
    });
    assert.equal(noReport.ok, false);
    if (!noReport.ok) assert.equal(noReport.code, "close-report-missing");

    const report = taskEvent("task.reported", { taskId: "t-a2", from: "product", status: "done", summary: "意图完成" }, NOW);
    assert.equal((await appendTaskEvent(root, report)).ok, true);

    // 错误创建者 ⇒ close-identity-invalid。
    const wrongActor = await closeTask({
      projectRoot: root, operationId: "op-a2-close", taskId: "t-a2", outcome: "accepted", actorRoleId: "chief", now: NOW,
    });
    assert.equal(wrongActor.ok, false);
    if (!wrongActor.ok) assert.equal(wrongActor.code, "close-identity-invalid");

    const closed = await closeTask({
      projectRoot: root, operationId: "op-a2-close", taskId: "t-a2", outcome: "accepted", actorRoleId: "convener",
      evidence: { artifacts: [{ path: "docs/product/snake-intent-v1.md", sha256: D, kind: "intent" }] }, now: NOW,
    });
    assert.equal(closed.ok, true, closed.ok === false ? closed.code : "");
    if (closed.ok) {
      assert.equal(closed.stageCompleted, true);
      assert.equal(closed.replay, false);
    }
    const replay = await closeTask({
      projectRoot: root, operationId: "op-a2-close", taskId: "t-a2", outcome: "accepted", actorRoleId: "convener", now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);

    const { readWorkflowLedger } = await import("../../src/common/编排/workflow-service.ts");
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A2"));
    // 不触 trunk/run：这些目录不存在。
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")));
    await assert.rejects(fs.stat(path.join(root, ".ans", "runs")));
  } finally {
    await cleanup(root);
  }
});

test("A12b rework（MF-IR-1）：closeTask(rework) 写 stage.reworked {stage:A11, reworkOf:A12b}", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    const stages: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"];
    const events: WorkflowEvent[] = seedEvent(workflowId);
    for (const stage of stages) {
      events.push(requested(workflowId, stage));
      events.push(completed(workflowId, stage));
    }
    events.push(dispatched(workflowId, "A12b", "t-a12b"));
    await appendEvents(root, workflowId, events);
    const task = taskEvent("task.created", {
      taskId: "t-a12b", from: "chief", to: "verifier", text: "验收报告", sideEffect: "docs",
      idempotencyKey: `review-report:${workflowId}:tip:1`, flowId: FLOW, workflowId, stage: "A12b",
    }, NOW);
    assert.equal((await appendTaskEvent(root, task)).ok, true);
    const report = taskEvent("task.reported", { taskId: "t-a12b", from: "verifier", status: "blocked", summary: "验收不通过" }, NOW);
    assert.equal((await appendTaskEvent(root, report)).ok, true);

    const closed = await closeTask({
      projectRoot: root, operationId: "op-a12b-rework", taskId: "t-a12b", outcome: "rework", actorRoleId: "chief",
      note: "验收不通过：补边界碰撞测试", now: NOW,
    });
    assert.equal(closed.ok, true, closed.ok === false ? closed.code : "");
    const { readWorkflowLedger } = await import("../../src/common/编排/workflow-service.ts");
    const ledger = await readWorkflowLedger(root);
    const reworked = ledger.events.find((event) => event.kind === "stage.reworked");
    assert.ok(reworked && reworked.kind === "stage.reworked");
    if (reworked?.kind === "stage.reworked") {
      assert.equal(reworked.stage, "A11");
      assert.equal(reworked.reworkOf, "A12b");
    }
    const view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
    assert.equal(view.stage, "A11");
    assert.equal(view.stages.A12b.status, "failed");
  } finally {
    await cleanup(root);
  }
});

test("prepareIntent/finalizeIntent：B24 入口门、documentRefs（含 version）一次写入、幂等 replay、不写 doc-freeze/trunk", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"),
      requested(workflowId, "A2"), completed(workflowId, "A2"),
    ]);
    const intentText = "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# Intent\n";
    await writeFile(root, "docs/product/snake-intent-v1.md", intentText);

    // B24.1（RR20 失败修复）：缺 docs/intents 入口 ⇒ prepare 即 fail-closed（不呈卡、不写 stage.requested A3）。
    const refused = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.code, "intent-entry-missing");
    await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\n---\n# Entry\n");
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(prepared.ok, true, prepared.ok === false ? prepared.code : "");
    if (!prepared.ok) return;
    assert.equal(prepared.path, "docs/product/snake-intent-v1.md");
    assert.equal(prepared.version, 1);
    assert.equal(prepared.sha256, sha(intentText));
    assert.deepEqual(prepared.documentRefs.map((ref) => ({ kind: ref.kind, path: ref.path, version: ref.version })), [
      { kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1 },
    ]);
    assert.match(prepared.marker, /ans-intent-evidence/);

    const decision: RequestResolvedEvent = {
      v: 1, at: "2026-11-10T10:05:00.000Z", kind: "request.resolved", requestId: "req-intent-1",
      cardKind: "intent-confirm", choice: "confirm", by: "customer", decisionId: "dec-intent-1",
      documentRefs: [{ kind: "intent", path: "docs/product/snake-intent-v1.md", sha256: sha(intentText) }],
    };
    const finalized = await finalizeIntent({ projectRoot: root, event: decision, workflowId, flowId: FLOW, now: NOW });
    assert.equal(finalized.ok, true, finalized.ok === false ? finalized.code : "");
    const replay = await finalizeIntent({ projectRoot: root, event: decision, workflowId, flowId: FLOW, now: NOW });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);

    // 意图被修改后再 finalize ⇒ intent-hash-drift（fail-closed）。
    await writeFile(root, "docs/product/snake-intent-v1.md", `${intentText}\n改动\n`);
    const drift = await finalizeIntent({ projectRoot: root, event: decision, workflowId, flowId: FLOW, now: NOW });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "intent-hash-drift");

    const { readWorkflowLedger } = await import("../../src/common/编排/workflow-service.ts");
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A3"));
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")));
    await assert.rejects(fs.stat(path.join(root, "docs", "doc-freezes.json")));
  } finally {
    await cleanup(root);
  }
});

const ROSTER_V4 = [
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

test("activateRoleDocumentsFixed：提案决定/名单/三文档 hash；hash 漂移拒绝；role.activated + A8 完成；不写 trunk", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    const events: WorkflowEvent[] = seedEvent(workflowId);
    for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7"] as WorkflowStage[]) {
      events.push(requested(workflowId, stage));
      events.push(completed(workflowId, stage));
    }
    events.push(requested(workflowId, "A8"));
    await appendEvents(root, workflowId, events);

    await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER_V4);
    const rosterSha = sha(ROSTER_V4);
    const docs = {
      card: { path: "角色卡/qa-project/role-card.md", sha256: "" },
      boundaryMd: { path: "角色卡/qa-project/boundary.md", sha256: "" },
      boundaryYaml: { path: "角色卡/qa-project/boundary.yaml", sha256: "" },
    };
    for (const [kind, rel] of [["card", docs.card.path], ["boundaryMd", docs.boundaryMd.path], ["boundaryYaml", docs.boundaryYaml.path]] as const) {
      const content = `# ${kind}\n`;
      await writeFile(root, rel, content);
      docs[kind].sha256 = sha(content);
    }
    const decision: RequestResolvedEvent = {
      v: 1, at: "2026-11-10T10:05:00.000Z", kind: "request.resolved", requestId: "req-proposal-1",
      cardKind: "proposal", choice: "accept", by: "customer", decisionId: "dec-proposal-1",
      selectedOptionIds: ["accept"],
      documentRefs: [{ kind: "roster", path: "docs/proposals/snake-roster-v1.md", sha256: rosterSha }],
    };
    assert.equal((await appendTaskEvent(root, decision)).ok, true);

    // hash 漂移：入参宣称的 hash 与实际字节不一致 ⇒ activation-hash-drift。
    const drift = await activateRoleDocumentsFixed({
      projectRoot: root, operationId: "op-activate-1", flowId: FLOW, workflowId,
      proposalDecisionId: "dec-proposal-1", targetRoleId: "qa-project",
      roster: { path: "docs/proposals/snake-roster-v1.md", sha256: rosterSha },
      documents: { ...docs, card: { ...docs.card, sha256: "b".repeat(64) } },
      now: NOW,
    });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "activation-hash-drift");

    const activated = await activateRoleDocumentsFixed({
      projectRoot: root, operationId: "op-activate-1", flowId: FLOW, workflowId,
      proposalDecisionId: "dec-proposal-1", targetRoleId: "qa-project",
      roster: { path: "docs/proposals/snake-roster-v1.md", sha256: rosterSha },
      documents: docs,
      now: NOW,
    });
    assert.equal(activated.ok, true, activated.ok === false ? activated.code : "");
    if (activated.ok) {
      assert.equal(activated.roleId, "qa-project");
      assert.equal(activated.replay, false);
      assert.equal(activated.stageCompleted, true, "唯一名单角色激活后 A8 应完成");
    }
    const { readWorkflowLedger } = await import("../../src/common/编排/workflow-service.ts");
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "role.activated" && event.roleId === "qa-project"));
    assert.ok(ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A8"));
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")));
  } finally {
    await cleanup(root);
  }
});

test("archiveAcceptance：生成 docs/acceptance/<flow>-acceptance-vN.md；幂等 replay；不同 report hash 不覆盖", async () => {
  const root = await tempRoot();
  try {
    const criteriaText = "# criteria\n";
    const reportText = "# report\n";
    await writeFile(root, "docs/quality/snake-criteria-v1.md", criteriaText);
    await writeFile(root, "docs/quality/snake-report-v1.md", reportText);
    const input = {
      projectRoot: root, flowId: FLOW, workflowId: "wf-0123456789abcdef01234567",
      criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "通过", staffDecision: "验收通过，进入发布", now: NOW,
    };
    const archived = await archiveAcceptance(input);
    assert.equal(archived.ok, true, archived.ok === false ? archived.code : "");
    if (!archived.ok) return;
    assert.equal(archived.path, "docs/acceptance/snake-acceptance-v1.md");
    assert.equal(archived.version, 1);
    const text = await fs.readFile(path.join(root, "docs", "acceptance", "snake-acceptance-v1.md"), "utf8");
    assert.match(text, /reportSha256: [a-f0-9]{64}/);
    assert.match(text, /workflowId: wf-0123456789abcdef01234567/);

    const replay = await archiveAcceptance(input);
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);

    await writeFile(root, "docs/quality/snake-report-v1.md", `${reportText}changed\n`);
    const conflict = await archiveAcceptance(input);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "acceptance-archive-failed");
  } finally {
    await cleanup(root);
  }
});
