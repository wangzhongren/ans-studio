// test/编排/workflow-stage-request.test.ts
// T3 B1（2026-11-10）：B1 AC-05/AC-06/AC-07、T-02——stage-request 原语/幂等/open 不变量/stop 停稳。
// 覆盖：确定性 workflowId、统一幂等键、sourceTaskId 缺失、重复请求 replay、open advance 收口、
// 非法转移拒绝（A10 未完成发 A11）、每项目单活动 fixed workflow、stop 流程（含 advance 收口与停稳不明）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendWorkflowEvent,
  confirmStop,
  closeTask,
  recordStageDispatch,
  requestStage,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const NOW = () => new Date("2026-11-10T10:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-stage-request-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function appendEvents(root: string, workflowId: string, events: WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

/** 合成 A1..A9 已完成的账本（用于 A10→A11 时序测试；事件形状合法、顺序合法）。 */
async function seedThroughA9(root: string, workflowId: string): Promise<void> {
  const base = { v: 1 as const, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1" as const, workflowId, flowId: FLOW, path: "A" as const };
  const events: WorkflowEvent[] = [{
    ...base, kind: "workflow.started", idempotencyKey: `workflow-start:${FLOW}:A:t-src`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  const stages: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
  for (const stage of stages) {
    events.push({
      ...base, kind: "stage.requested", idempotencyKey: `stage-request:${workflowId}:${stage}:1`,
      stage, requestTaskId: `t-req-${stage}`, requestDigest: D, attempt: 1,
    });
    events.push({
      ...base, kind: "stage.completed", idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`,
      stage, cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
    });
  }
  // A10 只 requested，不 completed（用于“A10 未完成发 A11 拒绝”）。
  events.push({
    ...base, kind: "stage.requested", idempotencyKey: `stage-request:${workflowId}:A10:1`,
    stage: "A10", requestTaskId: "t-req-A10", requestDigest: D, attempt: 1,
  });
  await appendEvents(root, workflowId, events);
}

test("首请求：workflowId 确定性、workflow.started + stage.requested + stage-request 任务；sourceTaskId 缺失拒绝", async () => {
  const root = await tempRoot();
  try {
    const missing = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A", requestDigest: digest("A1"), text: "推进 A1",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, "stage-request-source-missing");
      assert.deepEqual(missing.missing, ["sourceTaskId"]);
    }

    const first = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: digest("A1"), sourceTaskId: "t-chief-turn-1", text: "推进 A1（派产品写意图）", now: NOW,
    });
    assert.equal(first.ok, true, first.ok === false ? first.code : "");
    if (!first.ok) return;
    const expected = workflowIdFor(FLOW, "A", "t-chief-turn-1", digest("A1"));
    assert.equal(first.workflowId, expected);
    assert.match(first.workflowId, /^wf-[a-f0-9]{24}$/);
    assert.equal(first.idempotencyKey, `stage-request:${expected}:A1:1`);
    assert.equal(first.attempt, 1);
    assert.equal(first.workflowStarted, true);
    assert.equal(first.replay, false);

    const state = await readTaskState(root);
    const task = state.records.get(first.taskId);
    assert.ok(task?.created);
    assert.equal(task.created.workflowId, expected);
    assert.equal(task.created.taskKind, "stage-request");
    assert.equal(task.created.sideEffect, "read-only");
    assert.equal(task.created.workflowPath, "A");

    // 同一请求重放：返回原任务，不重复创建。
    const replay = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: digest("A1"), sourceTaskId: "t-chief-turn-1", text: "推进 A1（派产品写意图）", now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.taskId, first.taskId);
      assert.equal(replay.workflowStarted, false);
    }
    assert.equal((await readTaskState(root)).records.size, 1);
  } finally {
    await cleanup(root);
  }
});

test("首请求 workflowId 自报不符 ⇒ stage-request-invalid；非首阶段新建 ⇒ stage-transition-invalid", async () => {
  const root = await tempRoot();
  try {
    const wrongId = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A", workflowId: "wf-ffffffffffffffffffffffff",
      requestDigest: digest("A1"), sourceTaskId: "t-src", text: "x", now: NOW,
    });
    assert.equal(wrongId.ok, false);
    if (!wrongId.ok) assert.equal(wrongId.code, "stage-request-invalid");

    const wrongStage = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A4", workflowPath: "A",
      requestDigest: digest("A4"), sourceTaskId: "t-src", text: "x", now: NOW,
    });
    assert.equal(wrongStage.ok, false);
    if (!wrongStage.ok) assert.equal(wrongStage.code, "stage-transition-invalid");

    const noPath = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", requestDigest: digest("A1"), sourceTaskId: "t-src", text: "x", now: NOW,
    });
    assert.equal(noPath.ok, false);
    if (!noPath.ok) assert.equal(noPath.code, "stage-request-invalid");
  } finally {
    await cleanup(root);
  }
});

test("open advance 不变量：没收口前发下一请求 ⇒ stage-request-open；收口后允许推进（A1→A2）", async () => {
  const root = await tempRoot();
  try {
    const first = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: digest("A1"), sourceTaskId: "t-src", text: "推进 A1", now: NOW,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId: first.workflowId, stage: "A2",
      requestDigest: digest("A2"), sourceTaskId: "t-src", text: "推进 A2", now: NOW,
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "stage-request-open");

    // 收口 stage-request 任务（chief 是真实创建者；先有运营报告 done）。
    const a1Report = taskEvent("task.reported", { taskId: first.taskId, from: "convener", status: "done", summary: "A1 请求已受理" }, NOW);
    assert.equal((await appendTaskEvent(root, a1Report)).ok, true);
    const closed = await closeTask({
      projectRoot: root, operationId: "op-close-a1", taskId: first.taskId, outcome: "accepted", actorRoleId: "chief", now: NOW,
    });
    assert.equal(closed.ok, true, closed.ok === false ? closed.code : "");

    // A1 完成于目标任务创建（convener 派产品；投影由 task.created 补记）。
    const productTask = taskEvent("task.created", {
      taskId: "t-product-a1", from: "convener", to: "product", text: "写意图", sideEffect: "read-only",
      idempotencyKey: `work:${first.workflowId}:A1:product:1`, flowId: FLOW, workflowId: first.workflowId, stage: "A1",
    }, NOW);
    const appended = await appendTaskEvent(root, productTask);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    const dispatched = await recordStageDispatch({
      projectRoot: root, workflowId: first.workflowId, stage: "A1", taskId: "t-product-a1", targetRoleId: "product", now: NOW,
    });
    assert.equal(dispatched.ok, true, dispatched.ok === false ? dispatched.code : "");

    const next = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId: first.workflowId, stage: "A2",
      requestDigest: digest("A2"), sourceTaskId: "t-src", text: "推进 A2", now: NOW,
    });
    assert.equal(next.ok, true, next.ok === false ? next.code : "");
    if (next.ok) {
      assert.equal(next.attempt, 1);
      assert.equal(next.idempotencyKey, `stage-request:${first.workflowId}:A2:1`);
    }
  } finally {
    await cleanup(root);
  }
});

test("非法转移：A10 未完成发 A11 ⇒ stage-transition-invalid（AC-08）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedThroughA9(root, workflowId);
    const rejected = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId, stage: "A11",
      requestDigest: digest("A11"), sourceTaskId: "t-src", text: "推进 A11", now: NOW,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "stage-transition-invalid");
  } finally {
    await cleanup(root);
  }
});

test("A11 stage-request 创建 ⇒ stage.dispatched A11（§4.5）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedThroughA9(root, workflowId);
    // 补记 A10 completed（任命确认）+ A12a criteria 已先派（AC-09/G-1：实施前写标准）。
    await appendEvents(root, workflowId, [{
      v: 1, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1", kind: "stage.completed",
      workflowId, flowId: FLOW, path: "A", idempotencyKey: `stage-complete:${workflowId}:A10:appointment`,
      stage: "A10", cause: { kind: "appointment", ref: "req-a10" }, artifacts: [],
    }, {
      v: 1, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1", kind: "stage.dispatched",
      workflowId, flowId: FLOW, path: "A", idempotencyKey: `stage-dispatch:${workflowId}:A12a:t-criteria`,
      stage: "A12a", taskId: "t-criteria", targetRoleId: "verifier",
    }]);
    const request = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId, stage: "A11",
      requestDigest: digest("A11"), sourceTaskId: "t-src", text: "推进 A11（派实现）", now: NOW,
    });
    assert.equal(request.ok, true, request.ok === false ? request.code : "");
    if (!request.ok) return;
    const { readWorkflowLedger } = await import("../../src/common/编排/workflow-service.ts");
    const ledger = await readWorkflowLedger(root);
    const dispatched = ledger.events.find((event) =>
      event.kind === "stage.dispatched" && event.stage === "A11" && event.taskId === request.taskId);
    assert.ok(dispatched, "应写入 stage.dispatched A11");
  } finally {
    await cleanup(root);
  }
});

test("每项目至多一个活动 fixed workflow：不同 flow 新请求 ⇒ workflow-workspace-busy", async () => {
  const root = await tempRoot();
  try {
    const first = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: digest("A1"), sourceTaskId: "t-src", text: "推进 A1", now: NOW,
    });
    assert.equal(first.ok, true);
    const other = await requestStage({
      projectRoot: root, flowId: "other", stage: "A1", workflowPath: "A",
      requestDigest: digest("other-A1"), sourceTaskId: "t-src-2", text: "推进 other A1", now: NOW,
    });
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.code, "workflow-workspace-busy");
  } finally {
    await cleanup(root);
  }
});

test("stop 流程：先收口 open advance → stop 请求 → 停稳证据不足 ⇒ workflow-stop-unconfirmed；齐全 ⇒ workflow.closed stopped", async () => {
  const root = await tempRoot();
  try {
    const first = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: digest("A1"), sourceTaskId: "t-src", text: "推进 A1", now: NOW,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const premature = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId: first.workflowId, stage: "A1", workflowAction: "stop",
      requestDigest: digest("stop"), sourceTaskId: "t-src", text: "停止工作流", reason: "客户停止", now: NOW,
    });
    assert.equal(premature.ok, false);
    if (!premature.ok) assert.equal(premature.code, "stage-request-open");

    const a1Report = taskEvent("task.reported", { taskId: first.taskId, from: "convener", status: "done", summary: "A1 请求已受理" }, NOW);
    assert.equal((await appendTaskEvent(root, a1Report)).ok, true);
    const closedAdvance = await closeTask({
      projectRoot: root, operationId: "op-close-advance", taskId: first.taskId, outcome: "accepted", actorRoleId: "chief", now: NOW,
    });
    assert.equal(closedAdvance.ok, true);

    const stop = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId: first.workflowId, stage: "A1", workflowAction: "stop",
      requestDigest: digest("stop"), sourceTaskId: "t-src", text: "停止工作流", reason: "客户停止", now: NOW,
    });
    assert.equal(stop.ok, true, stop.ok === false ? stop.code : "");
    if (!stop.ok) return;
    assert.equal(stop.workflowAction, "stop");
    assert.equal(stop.idempotencyKey, `stage-stop:${first.workflowId}:A1:1`);

    // 停稳证据不足（请求未 closed、无运营报告）⇒ workflow.stop-unconfirmed，不写 stopped。
    const unconfirmed = await confirmStop({
      projectRoot: root, workflowId: first.workflowId, requestTaskId: stop.taskId, reason: "客户停止", now: NOW,
    });
    assert.equal(unconfirmed.ok, false);
    if (!unconfirmed.ok) {
      assert.equal(unconfirmed.code, "workflow-stop-unconfirmed");
      assert.ok((unconfirmed.missing ?? []).includes("request.closed"));
      assert.ok((unconfirmed.missing ?? []).includes("operator.report"));
    }

    // 运营停稳：运营报告（done/stopped）+ 关闭 stop 请求任务（chief 创建者收口）。
    const report = taskEvent("task.reported", {
      taskId: stop.taskId, from: "convener", status: "done", summary: "stopped",
    }, NOW);
    assert.equal((await appendTaskEvent(root, report)).ok, true);
    const closeStop = await closeTask({
      projectRoot: root, operationId: "op-close-stop", taskId: stop.taskId, outcome: "accepted", actorRoleId: "chief", now: NOW,
    });
    assert.equal(closeStop.ok, true, closeStop.ok === false ? closeStop.code : "");

    const confirmed = await confirmStop({
      projectRoot: root, workflowId: first.workflowId, requestTaskId: stop.taskId, reason: "客户停止", now: NOW,
    });
    assert.equal(confirmed.ok, true, confirmed.ok === false ? confirmed.code : "");
    if (confirmed.ok) assert.equal(confirmed.outcome, "stopped");

    const replay = await confirmStop({
      projectRoot: root, workflowId: first.workflowId, requestTaskId: stop.taskId, reason: "客户停止", now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);

    // 关闭后不再接受请求。
    const afterClose = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId: first.workflowId, stage: "A1",
      requestDigest: digest("again"), sourceTaskId: "t-src", text: "x", now: NOW,
    });
    assert.equal(afterClose.ok, false);
    if (!afterClose.ok) assert.equal(afterClose.code, "workflow-closed");
  } finally {
    await cleanup(root);
  }
});

test("AC-09/G-1：A12a criteria 未创建时发 A11 stage-request ⇒ stage-transition-invalid（实施前写标准）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedThroughA9(root, workflowId);
    await appendEvents(root, workflowId, [{
      v: 1, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1", kind: "stage.completed",
      workflowId, flowId: FLOW, path: "A", idempotencyKey: `stage-complete:${workflowId}:A10:appointment`,
      stage: "A10", cause: { kind: "appointment", ref: "req-a10" }, artifacts: [],
    }]);
    const rejected = await requestStage({
      projectRoot: root, flowId: FLOW, workflowId, stage: "A11",
      requestDigest: digest("A11"), sourceTaskId: "t-src", text: "推进 A11", now: NOW,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, "stage-transition-invalid");
      assert.match(rejected.message, /A12a criteria/);
    }
  } finally {
    await cleanup(root);
  }
});
