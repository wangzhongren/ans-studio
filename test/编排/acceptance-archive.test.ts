// test/编排/acceptance-archive.test.ts
// T3 B3（2026-11-10，编排）：B1 AC-09/AC-20、T-11——应用生成 docs/acceptance/<flowId>-acceptance-vN.md。
// 覆盖：版本随 report 递增、frontmatter 字段（flowId/workflowId/criteria/report path+sha256/结论/
// 幕僚决策/时间）、幂等 `acceptance:<wf>:<reportSha>`、同版本不同 report 不覆盖（acceptance-archive-failed）、
// 归档写失败 ⇒ acceptance-archive-failed 且阻塞 A12（A12b accepted 但无 A12 聚合）、
// 归档写入后 closeTask(A12b accepted + acceptanceArchive) ⇒ stage.completed A12 聚合。
// T3 B31（2026-11-11，RR26）：A12b 轻量验收——最后报告 blocked 时，仅当 accepted + 应用归档证据
// （acceptanceArchive）+ 非空幕僚决策 note 才允许收口/完成；其余阶段/缺归档/缺 note 仍 fail-closed。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  acceptanceIdempotencyKey,
  appendWorkflowEvent,
  archiveAcceptance,
  closeTask,
  findAcceptanceArchive,
  readWorkflowLedger,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const NOW = () => new Date(AT);
const D = "a".repeat(64);
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const WORKFLOW = "wf-acceptance00000000000001";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-"));
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
function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: D, attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed-${stage}`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}
function seedA12bDispatched(workflowId: string): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"] as WorkflowStage[]) {
    events.push(requested(workflowId, stage));
    events.push(completed(workflowId, stage));
  }
  events.push({
    ...BASE, kind: "stage.dispatched", workflowId, flowId: FLOW,
    idempotencyKey: `stage-dispatch:${workflowId}:A12b:t-a12b`, stage: "A12b", taskId: "t-a12b", targetRoleId: "verifier",
  });
  return events;
}

test("归档版本随 report 递增（v2）且 frontmatter 完整；幂等 replay；同版本不同 report 不覆盖", async () => {
  const root = await tempRoot();
  try {
    const criteriaText = "# criteria v2\n";
    const reportText = "# report v2\n";
    await writeFile(root, "docs/quality/snake-criteria-v2.md", criteriaText);
    await writeFile(root, "docs/quality/snake-report-v2.md", reportText);
    const input = {
      projectRoot: root,
      flowId: FLOW,
      workflowId: WORKFLOW,
      criteriaPath: "docs/quality/snake-criteria-v2.md",
      reportPath: "docs/quality/snake-report-v2.md",
      conclusion: "通过",
      staffDecision: "验收通过，进入发布",
      now: NOW,
    };
    const archived = await archiveAcceptance(input);
    assert.equal(archived.ok, true, archived.ok === false ? archived.code : "");
    if (!archived.ok) return;
    assert.equal(archived.path, "docs/acceptance/snake-acceptance-v2.md");
    assert.equal(archived.version, 2);
    assert.equal(archived.replay, false);
    const text = await fs.readFile(path.join(root, "docs", "acceptance", "snake-acceptance-v2.md"), "utf8");
    assert.match(text, /^flowId: snake$/m);
    assert.match(text, new RegExp(`^workflowId: ${WORKFLOW}$`, "m"));
    assert.match(text, new RegExp(`^criteria: docs/quality/snake-criteria-v2\\.md$`, "m"));
    assert.match(text, new RegExp(`^criteriaSha256: ${sha(criteriaText)}$`, "m"));
    assert.match(text, new RegExp(`^report: docs/quality/snake-report-v2\\.md$`, "m"));
    assert.match(text, new RegExp(`^reportSha256: ${sha(reportText)}$`, "m"));
    assert.match(text, new RegExp(`^idempotencyKey: ${acceptanceIdempotencyKey(WORKFLOW, sha(reportText))}$`, "m"));
    assert.match(text, /^conclusion: "通过"$/m);
    assert.match(text, /^staffDecision: "验收通过，进入发布"$/m);
    assert.match(text, /^archivedAt: 2026-11-10T10:00:00\.000Z$/m);
    assert.match(text, /# 验收归档（snake v2）/);

    const replay = await archiveAcceptance(input);
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.path, archived.path);
    }

    await writeFile(root, "docs/quality/snake-report-v2.md", `${reportText}changed\n`);
    const conflict = await archiveAcceptance(input);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "acceptance-archive-failed");

    const found = await findAcceptanceArchive({ projectRoot: root, flowId: FLOW, workflowId: WORKFLOW });
    assert.ok(found !== undefined);
    if (found !== undefined) assert.equal(found.version, 2);
  } finally {
    await cleanup(root);
  }
});

test("归档写失败 ⇒ acceptance-archive-failed；缺归档时 A12b accepted 不聚合 A12（归档阻塞 A12）", async () => {
  const root = await tempRoot();
  try {
    await writeFile(root, "docs/quality/snake-criteria-v1.md", "# criteria\n");
    await writeFile(root, "docs/quality/snake-report-v1.md", "# report\n");
    // 让 docs/acceptance 成为文件 ⇒ mkdir/rename 失败。
    await writeFile(root, "docs/acceptance", "not a directory\n");
    const failed = await archiveAcceptance({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW,
      criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "通过", now: NOW,
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.code, "acceptance-archive-failed");

    // 无归档：A12b accepted 只完成 A12b，不产生 A12 聚合。
    await appendEvents(root, seedA12bDispatched(WORKFLOW));
    const created = taskEvent("task.created", {
      taskId: "t-a12b", from: "chief", to: "verifier", text: "验收报告", sideEffect: "docs",
      idempotencyKey: `review-report:${WORKFLOW}:tip:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A12b",
    }, NOW);
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b", from: "verifier", status: "done", summary: "验收通过",
    }, NOW))).ok, true);
    const closedWithoutArchive = await closeTask({
      projectRoot: root, operationId: "op-a12b-close-1", taskId: "t-a12b", outcome: "accepted", actorRoleId: "chief",
      evidence: { artifacts: [{ path: "docs/quality/snake-report-v1.md", sha256: sha("# report\n"), kind: "report" }] },
      now: NOW,
    });
    assert.equal(closedWithoutArchive.ok, true, closedWithoutArchive.ok === false ? closedWithoutArchive.code : "");
    if (closedWithoutArchive.ok) assert.equal(closedWithoutArchive.stageCompleted, true);
    let ledger = await readWorkflowLedger(root);
    let view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stages.A12b.status, "completed");
    assert.equal(view.stages.A12.status, "pending", "缺归档 ⇒ A12 不完成（阻塞）");
    assert.equal(ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A12"), false);
  } finally {
    await cleanup(root);
  }
});

test("归档写入后 closeTask(A12b accepted + acceptanceArchive) ⇒ stage.completed A12 聚合（幂等）", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA12bDispatched(WORKFLOW));
    const criteriaText = "# criteria\n";
    const reportText = "# report\n";
    await writeFile(root, "docs/quality/snake-criteria-v1.md", criteriaText);
    await writeFile(root, "docs/quality/snake-report-v1.md", reportText);
    const archived = await archiveAcceptance({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW,
      criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "通过", staffDecision: "进入发布", now: NOW,
    });
    assert.equal(archived.ok, true, archived.ok === false ? archived.code : "");
    if (!archived.ok) return;

    const created = taskEvent("task.created", {
      taskId: "t-a12b", from: "chief", to: "verifier", text: "验收报告", sideEffect: "docs",
      idempotencyKey: `review-report:${WORKFLOW}:tip:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A12b",
    }, NOW);
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b", from: "verifier", status: "done", summary: "验收通过",
    }, NOW))).ok, true);
    const closed = await closeTask({
      projectRoot: root, operationId: "op-a12b-close-2", taskId: "t-a12b", outcome: "accepted", actorRoleId: "chief",
      evidence: {
        artifacts: [{ path: "docs/quality/snake-report-v1.md", sha256: sha(reportText), kind: "report" }],
        acceptanceArchive: { path: archived.path, sha256: archived.sha256 },
      },
      now: NOW,
    });
    assert.equal(closed.ok, true, closed.ok === false ? closed.code : "");
    const ledger = await readWorkflowLedger(root);
    const aggregate = ledger.events.find((event) => event.kind === "stage.completed" && event.stage === "A12");
    assert.ok(aggregate && aggregate.kind === "stage.completed");
    if (aggregate?.kind === "stage.completed") {
      assert.equal(aggregate.cause.kind, "acceptance-archive");
      assert.ok(aggregate.artifacts.some((artifact) => artifact.kind === "acceptance-archive" && artifact.path === archived.path));
    }
    const view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stage, "A12");
    assert.equal(view.stages.A12.status, "completed");
  } finally {
    await cleanup(root);
  }
});

// ———————————————— T3 B31（2026-11-11，RR26）：A12b 轻量验收 ————————————————

const LIGHTWEIGHT_NOTE = "acceptanceIntensity=lightweight；运行期未验证（静态证据接受）";

function a12bTask(taskId: string): ReturnType<typeof taskEvent> {
  return taskEvent("task.created", {
    taskId, from: "chief", to: "verifier", text: "验收报告", sideEffect: "docs",
    idempotencyKey: `review-report:${WORKFLOW}:${taskId}:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A12b",
  }, NOW);
}

test("B31 A12b 轻量验收：blocked 报告 + acceptanceArchive + 非空 note + accepted ⇒ A12b/A12 完成、note 留痕、幂等 replay", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA12bDispatched(WORKFLOW));
    const criteriaText = "# criteria\n";
    const reportText = "# report（运行期未验证）\n";
    await writeFile(root, "docs/quality/snake-criteria-v1.md", criteriaText);
    await writeFile(root, "docs/quality/snake-report-v1.md", reportText);
    const archived = await archiveAcceptance({
      projectRoot: root, flowId: FLOW, workflowId: WORKFLOW,
      criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "运行期未验证", staffDecision: LIGHTWEIGHT_NOTE, now: NOW,
    });
    assert.equal(archived.ok, true, archived.ok === false ? archived.code : "");
    if (!archived.ok) return;

    assert.equal((await appendTaskEvent(root, a12bTask("t-a12b-light"))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b-light", from: "verifier", status: "blocked", summary: "运行期未验证",
    }, NOW))).ok, true);

    const closed = await closeTask({
      projectRoot: root, operationId: "op-a12b-light", taskId: "t-a12b-light", outcome: "accepted", actorRoleId: "chief",
      note: LIGHTWEIGHT_NOTE,
      evidence: {
        artifacts: [{ path: "docs/quality/snake-report-v1.md", sha256: sha(reportText), kind: "report" }],
        acceptanceArchive: { path: archived.path, sha256: archived.sha256 },
      },
      now: NOW,
    });
    assert.equal(closed.ok, true, closed.ok === false ? `${closed.code}: ${closed.message}` : "");
    if (closed.ok) {
      assert.equal(closed.stageCompleted, true);
      assert.equal(closed.replay, false);
      assert.equal(closed.stage, "A12b");
    }

    const state = await readTaskState(root);
    assert.equal(state.records.get("t-a12b-light")?.closed?.outcome, "accepted");
    assert.equal(state.records.get("t-a12b-light")?.closed?.note, LIGHTWEIGHT_NOTE, "task.closed.note 保留幕僚决策标记");

    let ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A12b").length, 1);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A12").length, 1);
    assert.equal(
      ledger.events.some((event) => event.kind === "stage.blocked" && event.stage === "A12b"),
      false,
      "轻量验收不得再追加 stage.blocked",
    );
    const aggregate = ledger.events.find((event) => event.kind === "stage.completed" && event.stage === "A12");
    assert.ok(aggregate !== undefined && aggregate.kind === "stage.completed" && aggregate.cause.kind === "acceptance-archive");
    let view = deriveWorkflowView(ledger.events, state.events);
    assert.equal(view.stages.A12b.status, "completed");
    assert.equal(view.stages.A12.status, "completed");

    // 幂等 replay：返回原回执（原 eventId），不重复写阶段事件、不改 note。
    const replay = await closeTask({
      projectRoot: root, operationId: "op-a12b-light", taskId: "t-a12b-light", outcome: "accepted", actorRoleId: "chief",
      note: LIGHTWEIGHT_NOTE, now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.eventId, closed.ok ? closed.eventId : "");
      assert.equal(replay.stageCompleted, false);
    }
    ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A12b").length, 1);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A12").length, 1);
    view = deriveWorkflowView(ledger.events, (await readTaskState(root)).events);
    assert.equal(view.stages.A12.status, "completed");
  } finally {
    await cleanup(root);
  }
});

test("B31 轻量验收 fail-closed：A12b 缺归档/缺 note/空白 note ⇒ close-report-missing；非 A12b 阶段不放宽", async () => {
  const root = await tempRoot();
  try {
    await appendEvents(root, seedA12bDispatched(WORKFLOW));
    const reportText = "# report\n";
    await writeFile(root, "docs/quality/snake-report-v1.md", reportText);
    assert.equal((await appendTaskEvent(root, a12bTask("t-a12b-neg"))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b-neg", from: "verifier", status: "blocked", summary: "运行期未验证",
    }, NOW))).ok, true);

    const artifacts = [{ path: "docs/quality/snake-report-v1.md", sha256: sha(reportText), kind: "report" as const }];
    const acceptanceArchive = { path: "docs/acceptance/snake-acceptance-v1.md", sha256: D };
    const base = { projectRoot: root, taskId: "t-a12b-neg", outcome: "accepted" as const, actorRoleId: "chief", now: NOW };

    // 缺归档：即使 note 非空也不放宽。
    const noArchive = await closeTask({ ...base, operationId: "op-neg-1", note: LIGHTWEIGHT_NOTE, evidence: { artifacts } });
    assert.equal(noArchive.ok, false);
    if (!noArchive.ok) {
      assert.equal(noArchive.code, "close-report-missing");
      assert.match(noArchive.message, /acceptanceArchive/u, "消息应区分轻量验收前置（缺归档）");
    }
    // 缺 note：应用归档存在也不放宽（显式幕僚决策必需）。
    const noNote = await closeTask({ ...base, operationId: "op-neg-2", evidence: { artifacts, acceptanceArchive } });
    assert.equal(noNote.ok, false);
    if (!noNote.ok) {
      assert.equal(noNote.code, "close-report-missing");
      assert.match(noNote.message, /note/u, "消息应区分轻量验收前置（缺 note）");
    }
    // 空白 note 等同缺 note。
    const blankNote = await closeTask({ ...base, operationId: "op-neg-3", note: "   ", evidence: { artifacts, acceptanceArchive } });
    assert.equal(blankNote.ok, false);
    if (!blankNote.ok) assert.equal(blankNote.code, "close-report-missing");

    // 失败均未写 task.closed / 阶段事件（fail-closed）。
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-a12b-neg")?.closed, undefined);
    const ledgerAfterNegatives = await readWorkflowLedger(root);
    assert.equal(
      ledgerAfterNegatives.events.some((event) => event.kind === "stage.completed" && (event.stage === "A12b" || event.stage === "A12")),
      false,
      "轻量验收前置缺失时不得写 A12b/A12 完成",
    );

    // 非 A12b：A12a blocked + note + 归档 ⇒ 仍走通用门拒绝（轻量验收只限 A12b）。
    assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-a12a-neg", from: "chief", to: "verifier", text: "复验报告", sideEffect: "docs",
      idempotencyKey: `review-report:${WORKFLOW}:t-a12a-neg:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A12a",
    }, NOW))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12a-neg", from: "verifier", status: "blocked", summary: "运行期未验证",
    }, NOW))).ok, true);
    const nonA12b = await closeTask({
      projectRoot: root, operationId: "op-neg-a12a", taskId: "t-a12a-neg", outcome: "accepted", actorRoleId: "chief",
      note: LIGHTWEIGHT_NOTE, evidence: { artifacts, acceptanceArchive }, now: NOW,
    });
    assert.equal(nonA12b.ok, false);
    if (!nonA12b.ok) {
      assert.equal(nonA12b.code, "close-report-missing");
      assert.match(nonA12b.message, /status=done/u, "非 A12b 阶段仍要求 done 报告（不放宽）");
    }

    // 非 A12b：A2 blocked + note + 归档 ⇒ 同样拒绝。
    assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-a2-neg", from: "convener", to: "product", text: "意图", sideEffect: "docs",
      idempotencyKey: `work:${WORKFLOW}:A2:product:1`, flowId: FLOW, workflowId: WORKFLOW, stage: "A2",
    }, NOW))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a2-neg", from: "product", status: "blocked", summary: "阻塞",
    }, NOW))).ok, true);
    const a2 = await closeTask({
      projectRoot: root, operationId: "op-neg-a2", taskId: "t-a2-neg", outcome: "accepted", actorRoleId: "convener",
      note: LIGHTWEIGHT_NOTE, evidence: { artifacts, acceptanceArchive }, now: NOW,
    });
    assert.equal(a2.ok, false);
    if (!a2.ok) assert.equal(a2.code, "close-report-missing");
  } finally {
    await cleanup(root);
  }
});

test("B31 未放宽路径：A12b rework 与 blocked 报告的 rejected 收口不经 note/归档；legacy（无 workflowId）逐字拒绝", async () => {
  const root = await tempRoot();
  try {
    // A12b rework：blocked 报告 + 无 note/归档仍可返工（MF-IR-1 不变）。
    const workflowId = WORKFLOW;
    await appendEvents(root, seedA12bDispatched(workflowId));
    assert.equal((await appendTaskEvent(root, a12bTask("t-a12b-rework"))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b-rework", from: "verifier", status: "blocked", summary: "验收不通过",
    }, NOW))).ok, true);
    const reworked = await closeTask({
      projectRoot: root, operationId: "op-a12b-rework", taskId: "t-a12b-rework", outcome: "rework", actorRoleId: "chief",
      now: NOW,
    });
    assert.equal(reworked.ok, true, reworked.ok === false ? reworked.code : "");
    const ledger = await readWorkflowLedger(root);
    assert.ok(ledger.events.some((event) => event.kind === "stage.reworked" && event.reworkOf === "A12b"));

    // rejected：blocked 报告 + 无 note/归档仍可拒绝收口（不新增前置）。
    assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-a2-reject", from: "convener", to: "product", text: "意图", sideEffect: "docs",
      idempotencyKey: `work:${workflowId}:A2:product:reject`, flowId: FLOW, workflowId, stage: "A2",
    }, NOW))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a2-reject", from: "product", status: "blocked", summary: "阻塞",
    }, NOW))).ok, true);
    const rejected = await closeTask({
      projectRoot: root, operationId: "op-a2-reject", taskId: "t-a2-reject", outcome: "rejected", actorRoleId: "convener",
      now: NOW,
    });
    assert.equal(rejected.ok, true, rejected.ok === false ? rejected.code : "");

    // legacy（无 workflowId）：逐字拒绝，不进入 fixed 收口/轻量验收门。
    assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-legacy", from: "convener", to: "product", text: "legacy", sideEffect: "docs",
      idempotencyKey: "work:legacy:1",
    }, NOW))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-legacy", from: "product", status: "blocked", summary: "legacy",
    }, NOW))).ok, true);
    const legacy = await closeTask({
      projectRoot: root, operationId: "op-legacy", taskId: "t-legacy", outcome: "accepted", actorRoleId: "convener",
      note: LIGHTWEIGHT_NOTE, now: NOW,
    });
    assert.equal(legacy.ok, false);
    if (!legacy.ok) {
      assert.equal(legacy.code, "close-task-invalid");
      assert.match(legacy.message, /legacy/u);
    }
  } finally {
    await cleanup(root);
  }
});
