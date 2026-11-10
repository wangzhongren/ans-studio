// test/编排/workflow-state.test.ts
// T3「两条固定工作流路径」B0：B1 AC-08/AC-17/T-03——workflow 账本纯投影骨架。
// 覆盖：合法/非法转移、幂等键去重、坏事件计数、A10→A11 顺序（A10 未完成发 A11 ⇒ workflow-corrupt）、
// A12a/A12b 与 rework、stop 骨架、任务事件补充（A1 完成于任务创建）。

import test from "node:test";
import assert from "node:assert/strict";

import type {
  StageBlockedEvent,
  StageCompletedEvent,
  StageDispatchedEvent,
  StageRequestedEvent,
  StageReworkedEvent,
  TaskStateEvent,
  WorkflowClosedEvent,
  WorkflowEvent,
  WorkflowStage,
  WorkflowStartedEvent,
  WorkflowStopRequestedEvent,
  WorkflowStopUnconfirmedEvent,
} from "../../src/model/runtime.ts";
import {
  WORKFLOW_CORRUPT_CODE,
  deriveWorkflowView,
  nextStages,
} from "../../src/common/编排/workflow-state.ts";

const AT = "2026-11-10T10:00:00.000Z";
const WF = "wf-0123456789abcdef01234567";
const FLOW = "snake";
const D = "a".repeat(64);

function started(extra: Partial<WorkflowStartedEvent> = {}): WorkflowStartedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.started", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "客户新需求" }, sourceTaskId: "t-src",
    ...extra,
  };
}

function requested(stage: WorkflowStage, attempt = 1): StageRequestedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.requested", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-request:${WF}:${stage}:${attempt}`, stage, requestTaskId: `t-${stage}`, requestDigest: D, attempt,
  };
}

function dispatched(stage: WorkflowStage): StageDispatchedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.dispatched", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-dispatch:${WF}:${stage}:t-${stage}-task`, stage, taskId: `t-${stage}-task`, targetRoleId: "worker",
  };
}

function completed(stage: WorkflowStage): StageCompletedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.completed", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-complete:${WF}:${stage}:ref-${stage}`, stage,
    cause: { kind: "task-closed", ref: `t-${stage}` }, artifacts: [],
  };
}

function reworked(stage: WorkflowStage, reworkOf: WorkflowStage, attempt: number): StageReworkedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.reworked", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-rework:${WF}:${stage}:${attempt}`, stage, reworkOf, reason: "验收不通过", attempt,
  };
}

function stopRequested(stage: WorkflowStage): WorkflowStopRequestedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.stop-requested", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-stop:${WF}:${stage}:1`, stage, requestTaskId: `t-stop-${stage}`, reason: "客户停止", requestedBy: "chief",
  };
}

function stopUnconfirmed(stage: WorkflowStage): WorkflowStopUnconfirmedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.stop-unconfirmed", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-stop-unconfirmed:${WF}:${stage}:1`, stage, requestTaskId: `t-stop-${stage}`,
    missing: ["live session"],
  };
}

function closed(outcome: WorkflowClosedEvent["outcome"], reason = "客户停止"): WorkflowClosedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.closed", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-close:${WF}:${outcome}:${D}`, outcome, reason,
    stopEvidence: { requestClosed: true, operatorReported: true, openProductionTaskIds: [] },
  };
}

const A_STAGES: readonly WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];

function throughA10(): WorkflowEvent[] {
  const events: WorkflowEvent[] = [started()];
  for (const stage of A_STAGES) {
    events.push(requested(stage));
    events.push(completed(stage));
  }
  return events;
}

test("合法推进 A1→A10：逐阶段 requested+completed；A10 完成后 nextStages = A11/A12a", () => {
  const view = deriveWorkflowView(throughA10());
  assert.equal(view.blocked, undefined);
  assert.equal(view.stage, "A10");
  assert.equal(view.status, "completed");
  for (const stage of A_STAGES) assert.equal(view.stages[stage].status, "completed", stage);
  assert.deepEqual([...nextStages(view)], ["A11", "A12a"]);
});

test("A10 未完成发 A11 ⇒ workflow-corrupt（不猜、不推进）", () => {
  const events = throughA10();
  events.pop(); // 去掉 A10 completed
  events.push(requested("A11"));
  const view = deriveWorkflowView(events);
  assert.equal(view.blocked?.code, WORKFLOW_CORRUPT_CODE);
  assert.match(view.blocked?.summary ?? "", /stage\.requested 非法转移/);
  assert.deepEqual([...nextStages(view)], []);
  assert.notEqual(view.stages.A11.status, "requested");
});

test("A12a（criteria 可先派）→A11→A12b（report）→A12 聚合→A13 顺序合法", () => {
  const events = throughA10();
  events.push(dispatched("A12a")); // A10 completed ⇒ A12a 直派（chief→reviewRole，无 stage.requested）
  events.push(requested("A11")); // G-1：A12a 在办时允许推进 A11
  events.push(completed("A12a")); // criteria 可在实现期间完成
  events.push(dispatched("A11"));
  events.push(completed("A11"));
  events.push(dispatched("A12b")); // A11 completed ⇒ A12b 直派
  events.push(completed("A12b"));
  events.push(completed("A12")); // v1.3 §4.5：A12b accepted 后记录 stage.completed A12
  events.push(requested("A13"));
  const view = deriveWorkflowView(events);
  assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
  assert.equal(view.stages.A12a.status, "completed");
  assert.equal(view.stages.A11.status, "completed");
  assert.equal(view.stages.A12b.status, "completed");
  assert.equal(view.stages.A12.status, "completed");
  assert.equal(view.stage, "A13");
  assert.equal(view.status, "requested");
});

test("A12b rework 回 A11（reworkOf:A12b）：新 attempt 合法，触发阶段标记 failed", () => {
  const events = throughA10();
  events.push(dispatched("A12a"));
  events.push(requested("A11"));
  events.push(completed("A11"));
  events.push(dispatched("A12b"));
  events.push(completed("A12b"));
  events.push(reworked("A12b", "A11", 2));
  const view = deriveWorkflowView(events);
  assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
  assert.equal(view.stage, "A11");
  assert.equal(view.status, "pending");
  assert.equal(view.stages.A12b.status, "failed");
  assert.equal(view.stages.A11.attempt, 2);
  assert.deepEqual([...nextStages(view)], ["A11"]);
  const retried = deriveWorkflowView([...events, requested("A11", 2)]);
  assert.equal(retried.blocked, undefined);
  assert.equal(retried.stage, "A11");
  assert.equal(retried.status, "requested");
  assert.equal(retried.stages.A11.attempt, 2);
});

test("幂等键重复只计一次；形状非法事件计数跳过；身份不一致/缺失 started ⇒ workflow-corrupt", () => {
  const dup = completed("A2");
  const view = deriveWorkflowView([started(), requested("A1"), completed("A1"), requested("A2"), dup, dup]);
  assert.equal(view.blocked, undefined);
  assert.deepEqual(view.skippedEvents, { invalid: 0, duplicate: 1 });
  assert.equal(view.stages.A2.status, "completed");

  // 非法形状（坏 stage）本身被计数跳过，不影响其余事件。
  const badShape = { ...requested("A3"), stage: "A14" } as unknown as WorkflowEvent;
  const withBad = deriveWorkflowView([started(), requested("A1"), completed("A1"), badShape]);
  assert.equal(withBad.blocked, undefined);
  assert.deepEqual(withBad.skippedEvents, { invalid: 1, duplicate: 0 });

  // 关键事件缺失：空账本/只有坏行/首事件不是 workflow.started ⇒ corrupt。
  for (const events of [[], [badShape], [requested("A1")]] as WorkflowEvent[][]) {
    const corrupt = deriveWorkflowView(events);
    assert.equal(corrupt.blocked?.code, WORKFLOW_CORRUPT_CODE, JSON.stringify(events.length));
  }
  // 身份不一致 ⇒ corrupt。
  const mismatch = deriveWorkflowView([started(), requested("A1"), { ...completed("A1"), flowId: "other" }]);
  assert.equal(mismatch.blocked?.code, WORKFLOW_CORRUPT_CODE);
  assert.match(mismatch.blocked?.summary ?? "", /身份不一致/);
  // 重复 workflow.started（不同幂等键）⇒ corrupt。
  const duplicateStart = deriveWorkflowView([started(), { ...started(), idempotencyKey: "workflow-start:second" }]);
  assert.equal(duplicateStart.blocked?.code, WORKFLOW_CORRUPT_CODE);
});

test("stop 骨架：stop-requested ⇒ stopping；stop-unconfirmed ⇒ blocked；closed stopped 终态且 nextStages 空", () => {
  const base: WorkflowEvent[] = [started(), requested("A1")];
  const stopping = deriveWorkflowView([...base, stopRequested("A1")]);
  assert.equal(stopping.stopping, true);
  assert.equal(stopping.blocked, undefined);
  assert.deepEqual([...nextStages(stopping)], []);

  const unconfirmed = deriveWorkflowView([...base, stopRequested("A1"), stopUnconfirmed("A1")]);
  assert.equal(unconfirmed.blocked?.code, "workflow-stop-unconfirmed");
  assert.equal(unconfirmed.stopping, true);

  const stopped = deriveWorkflowView([...base, stopRequested("A1"), closed("stopped")]);
  assert.equal(stopped.closed?.outcome, "stopped");
  assert.equal(stopped.stopping, false);
  assert.equal(stopped.status, "completed");
  assert.deepEqual([...nextStages(stopped)], []);
  // 关闭后任何新事件 ⇒ corrupt（不猜后续推进）。
  const afterClose = deriveWorkflowView([...base, closed("delivered"), requested("A2")]);
  assert.equal(afterClose.blocked?.code, WORKFLOW_CORRUPT_CODE);
});

test("任务事件补充：fixed task.created 将 A1 标记完成（A1/A4/A7 完成于任务创建）", () => {
  const task: TaskStateEvent = {
    v: 1, at: AT, kind: "task.created", taskId: "t-a1-task", from: "chief", to: "product", text: "写意图",
    sideEffect: "read-only", idempotencyKey: `stage-request:${WF}:A1:1`, flowId: FLOW, workflowId: WF,
    stage: "A1", taskKind: "stage-request", workflowPath: "A",
  };
  const view = deriveWorkflowView([started()], [task]);
  assert.equal(view.stages.A1.status, "completed");
  assert.equal(view.stage, "A1");
  assert.equal(view.status, "completed");
  assert.deepEqual([...nextStages(view)], ["A2"]);
  // 非本 workflow 的任务不影响投影。
  const other = deriveWorkflowView([started()], [{ ...task, workflowId: "wf-ffffffffffffffffffffffff" }]);
  assert.equal(other.stages.A1.status, "pending");
});

test("B 路径骨架：B1→B2（scope-decided）→B3→B4；B2 rework 回 B1", () => {
  const bstart: WorkflowStartedEvent = { ...started(), path: "B", idempotencyKey: `workflow-start:${FLOW}:B:t-src` };
  const bReq = (stage: WorkflowStage): StageRequestedEvent => ({ ...requested(stage), path: "B" });
  const bDone = (stage: WorkflowStage): StageCompletedEvent => ({ ...completed(stage), path: "B" });
  const scope = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "change.scope-decided", workflowId: WF, flowId: FLOW, path: "B",
    idempotencyKey: `scope:${WF}:${D}:scope-1`, impactReport: { path: "角色卡/worker/docs/change/impact-v1.md", sha256: D },
    scope: { summary: "修 bug", files: ["src/a.ts"] }, effectiveWritesets: [{ roleId: "worker", paths: ["src/a.ts"] }],
    decidedBy: "chief", requestTaskId: "t-b2",
  } as WorkflowEvent;
  const view = deriveWorkflowView([
    bstart, bReq("B1"), bDone("B1"), scope, bReq("B3"), bDone("B3"), bReq("B4"),
  ]);
  assert.equal(view.blocked, undefined, view.blocked?.summary ?? "");
  assert.equal(view.stage, "B4");
  assert.equal(view.stages.B2.status, "completed");

  const rework = deriveWorkflowView([bstart, bReq("B1"), bDone("B1"), bReq("B2"), { ...reworked("B2", "B1", 2), path: "B" }]);
  assert.equal(rework.blocked, undefined, rework.blocked?.summary ?? "");
  assert.equal(rework.stage, "B1");
  assert.equal(rework.status, "pending");
});

test("stage.blocked 记录 code/summary 且不推进；未知阶段值不进入视图", () => {
  const blocked: StageBlockedEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.blocked", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-block:${WF}:A2:1:baseline-document-missing`, stage: "A2",
    code: "baseline-document-missing", summary: "缺少意图文档", attempt: 1,
  };
  const view = deriveWorkflowView([started(), requested("A1"), completed("A1"), requested("A2"), blocked]);
  assert.equal(view.blocked?.code, "baseline-document-missing");
  assert.equal(view.status, "blocked");
  assert.deepEqual([...nextStages(view)], ["A2"]);
  // 未 requested 的阶段被 blocked ⇒ 阶段不匹配 ⇒ corrupt。
  const illegal = deriveWorkflowView([started(), requested("A1"), completed("A1"), { ...blocked, stage: "A5" }]);
  assert.equal(illegal.blocked?.code, WORKFLOW_CORRUPT_CODE);
});
