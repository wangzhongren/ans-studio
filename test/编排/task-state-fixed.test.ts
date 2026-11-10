// test/编排/task-state-fixed.test.ts
// T3「两条固定工作流路径」B0：B1 AC-17/T-06 / v1.3 §7.1 MF-3——fixed `task.created` 豁免 run-required。
// 覆盖：fixed 放行（stage-request / 普通生产任务）、缺 workflowId 旧拒逐字保留、workflowId+runId 拒、
// 坏 stage/slug/workflowPath、workflowPath 仅首 stage-request、replay 读取新字段、收口/幂等查询。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TASKS_STATE_REL,
  appendTaskEvent,
  findTaskByIdempotencyKey,
  readTaskState,
  renderTaskCardLines,
  taskCardOf,
  taskEvent,
  taskStatusOf,
} from "../../src/common/编排/task-state.ts";
import type { TaskCreatedEvent, TaskStateEvent } from "../../src/model/runtime.ts";

const WF = "wf-0123456789abcdef01234567";
const AT = "2026-11-10T10:00:00.000Z";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-task-fixed-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function fixedTask(taskId: string, extra: Partial<TaskCreatedEvent> = {}): TaskCreatedEvent {
  return taskEvent("task.created", {
    taskId,
    from: "chief",
    to: "convener",
    text: "推进 A1 阶段",
    sideEffect: "read-only",
    idempotencyKey: `stage-request:${WF}:A1:1`,
    flowId: "snake",
    workflowId: WF,
    stage: "A1",
    taskKind: "stage-request",
    workflowPath: "A",
    ...extra,
  });
}

test("fixed task.created（workflowId）豁免 runId/runState；replay/taskCard 读取新字段且不回填 legacy", async () => {
  const root = await tempRoot();
  try {
    const appended = await appendTaskEvent(root, fixedTask("t-fixed-1"));
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    const record = state.records.get("t-fixed-1");
    assert.ok(record?.created);
    assert.equal(record.created.workflowId, WF);
    assert.equal(record.created.stage, "A1");
    assert.equal(record.created.taskKind, "stage-request");
    assert.equal(record.created.workflowPath, "A");
    assert.equal(record.created.runId, undefined);
    assert.equal(record.created.runState, undefined, "fixed 任务不得被回填 legacy runState");
    const card = taskCardOf(record);
    assert.ok(card);
    assert.equal(card.runState, undefined);
    assert.equal(card.runId, undefined);
    assert.equal(card.workflowId, WF);
    assert.equal(card.stage, "A1");
    assert.equal(card.taskKind, "stage-request");
    assert.equal(taskStatusOf(record), "created");
    const lines = renderTaskCardLines(card).join("\n");
    assert.match(lines, new RegExp(`工作流：${WF}（路径 A，stage A1，stage-request）`));
    assert.doesNotMatch(lines, /run：legacy/);
  } finally {
    await cleanup(root);
  }
});

test("fixed 普通生产任务可无 taskKind；无 workflowId 的旧 run-required 规则逐字保留（allowLegacyRun 不变）", async () => {
  const root = await tempRoot();
  try {
    const production = taskEvent("task.created", {
      taskId: "t-fixed-prod",
      from: "convener",
      to: "worker",
      text: "实现贪吃蛇模块",
      sideEffect: "code",
      idempotencyKey: `work:${WF}:A11:worker:1`,
      flowId: "snake",
      workflowId: WF,
      stage: "A11",
    });
    assert.equal((await appendTaskEvent(root, production)).ok, true);
    const legacy = taskEvent("task.created", {
      taskId: "t-legacy",
      from: "chief",
      to: "worker",
      text: "旧任务",
      sideEffect: "read-only",
      idempotencyKey: "legacy-key",
      flowId: "focus",
    });
    const rejected = await appendTaskEvent(root, legacy);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, "run-required");
      assert.match(rejected.message, /run-required/);
    }
    const historic = await appendTaskEvent(root, legacy, { allowLegacyRun: true });
    assert.equal(historic.ok, true);
    const state = await readTaskState(root);
    assert.equal(state.records.has("t-legacy"), true);
    assert.equal(state.records.get("t-legacy")?.created?.runState, "legacy");
    assert.equal(state.records.get("t-fixed-prod")?.created?.runState, undefined);
  } finally {
    await cleanup(root);
  }
});

test("workflowId+runId/runState 出现即拒绝（写侧与读侧都 fail-closed）", async () => {
  const root = await tempRoot();
  try {
    for (const extra of [
      { runId: "run-20261030-focus-abcdef12" },
      { runState: "draft" as const },
      { runId: "run-20261030-focus-abcdef12", runState: "pinned" as const },
    ]) {
      const rejected = await appendTaskEvent(root, fixedTask("t-run", extra));
      assert.equal(rejected.ok, false, JSON.stringify(extra));
      if (!rejected.ok) assert.equal(rejected.code, "fixed-task-run-forbidden");
    }
    assert.equal((await readTaskState(root)).events.length, 0);
    // 读侧：账本里已有的 fixed+run 坏行 ⇒ 坏行计数、记录不重放（不猜）。
    const file = path.join(root, ...TASKS_STATE_REL.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    const badLine = JSON.stringify({
      v: 1, at: AT, kind: "task.created", taskId: "t-bad-run", from: "chief", to: "convener",
      text: "x", sideEffect: "read-only", idempotencyKey: "k-bad", flowId: "snake",
      workflowId: WF, stage: "A1", runId: "run-20261030-focus-abcdef12", runState: "pinned",
    });
    await fs.writeFile(file, `${badLine}\n`, "utf8");
    const read = await readTaskState(root);
    assert.equal(read.records.has("t-bad-run"), false);
    assert.ok(read.errors.some((error) => error.message.includes("runId")));
  } finally {
    await cleanup(root);
  }
});

test("坏 stage / 坏 workflowId slug / 坏 workflowPath / workflowId 缺 flowId 均拒绝", async () => {
  const root = await tempRoot();
  try {
    const cases: Array<[Partial<TaskCreatedEvent>, RegExp]> = [
      [{ stage: "A14" as never }, /stage 非法/],
      [{ stage: undefined }, /stage 非法/],
      [{ workflowId: "WF Bad" }, /workflowId 非法/],
      [{ workflowId: "" }, /workflowId 非法/],
      [{ workflowPath: "C" as never }, /workflowPath 非法/],
      [{ flowId: undefined }, /flowId/],
      [{ taskKind: "ordinary" }, /taskKind 非法/],
    ];
    for (const [extra, message] of cases) {
      const rejected = await appendTaskEvent(root, fixedTask("t-bad", extra));
      assert.equal(rejected.ok, false, JSON.stringify(extra));
      if (!rejected.ok) assert.match(rejected.message, message);
    }
    assert.equal((await readTaskState(root)).events.length, 0);
  } finally {
    await cleanup(root);
  }
});

test("workflowPath 仅首 stage-request：第二个 stage-request 携带即拒；生产任务携带亦拒；缺省可推进", async () => {
  const root = await tempRoot();
  try {
    assert.equal((await appendTaskEvent(root, fixedTask("t-a1"))).ok, true);
    const secondWithPath = await appendTaskEvent(root, fixedTask("t-a4", {
      stage: "A4",
      idempotencyKey: `stage-request:${WF}:A4:1`,
      workflowPath: "A",
    }));
    assert.equal(secondWithPath.ok, false);
    if (!secondWithPath.ok) assert.equal(secondWithPath.code, "workflow-path-not-first");
    const productionWithPath = await appendTaskEvent(root, fixedTask("t-prod-path", {
      stage: "A11",
      taskKind: undefined,
      idempotencyKey: `work:${WF}:A11:worker:1`,
    }));
    assert.equal(productionWithPath.ok, false);
    if (!productionWithPath.ok) assert.equal(productionWithPath.code, "workflow-path-not-stage-request");
    const second = await appendTaskEvent(root, fixedTask("t-a4-ok", {
      stage: "A4",
      idempotencyKey: `stage-request:${WF}:A4:1`,
      workflowPath: undefined,
    }));
    assert.equal(second.ok, true, second.ok === false ? second.message : "");
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0);
    assert.deepEqual([...state.records.keys()].sort(), ["t-a1", "t-a4-ok"]);
  } finally {
    await cleanup(root);
  }
});

test("收口/幂等查询：fixed 任务可被 task.closed 收口；findTaskByIdempotencyKey 读到新字段", async () => {
  const root = await tempRoot();
  try {
    const created = fixedTask("t-fixed-close");
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    const closed: TaskStateEvent = {
      v: 1,
      at: "2026-11-10T10:05:00.000Z",
      kind: "task.closed",
      taskId: "t-fixed-close",
      by: "chief",
      outcome: "accepted",
      note: "A1 请求完成",
    };
    assert.equal((await appendTaskEvent(root, closed)).ok, true);
    const state = await readTaskState(root);
    const record = state.records.get("t-fixed-close");
    assert.ok(record);
    assert.equal(taskStatusOf(record), "closed");
    assert.equal(record.closed?.outcome, "accepted");
    const found = findTaskByIdempotencyKey(state, created.idempotencyKey);
    assert.equal(found?.taskId, "t-fixed-close");
    assert.equal(found?.created?.workflowId, WF);
    assert.equal(found?.created?.stage, "A1");
    assert.equal(taskCardOf(record)?.closed?.outcome, "accepted");
  } finally {
    await cleanup(root);
  }
});
