// test/编排/task-state.test.ts
// B 批（2026-10-28）：`tasks.jsonl` 最小状态的编排单元验证。
// 覆盖：事件追加/重放/坏行跳过、任务状态机、幂等键与未收口去重、副作用分类只升不降、
// 轮转保留、任务卡固定字段（摘要≤200/证据≤5 由渲染侧）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TASKS_STATE_REL,
  appendTaskEvent,
  classifyTaskSideEffect,
  findOpenTaskByIdempotencyKey,
  newTaskId,
  normalizeTaskSideEffect,
  readTaskState,
  redispatchCountOf,
  redispatchTaskId,
  renderTaskCardLines,
  replayTaskEvents,
  shortenSummary,
  taskCardOf,
  taskEvent,
  taskIdempotencyKey,
  taskStatusOf,
  type TaskRecord,
} from "../../src/common/编排/task-state.ts";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-task-state-"));
}

function created(taskId: string, text = "实现功能", extra: Record<string, unknown> = {}) {
  return taskEvent("task.created", {
    taskId,
    from: "chief",
    to: "worker",
    text,
    sideEffect: "code",
    idempotencyKey: `key-${taskId}`,
    ...extra,
  }, () => new Date("2026-10-28T00:00:00.000Z"));
}

test("append/read/replay：事件按行落盘，状态机 created→delivered→reported→closed", async () => {
  const root = await tempRoot();
  try {
    const taskId = newTaskId(new Date("2026-10-28T01:00:00.000Z"));
    const events = [
      created(taskId),
      taskEvent("task.delivered", { taskId, to: "worker" }, () => new Date("2026-10-28T00:00:01.000Z")),
      taskEvent("task.reported", {
        taskId,
        from: "worker",
        status: "done",
        summary: "完成",
        evidence: ["src/x.ts"],
      }, () => new Date("2026-10-28T00:00:02.000Z")),
    ];
    for (const event of events) {
      const result = await appendTaskEvent(root, event);
      assert.equal(result.ok, true);
    }
    const read = await readTaskState(root);
    assert.equal(read.errors.length, 0);
    assert.equal(read.events.length, 3);
    const record = read.records.get(taskId)!;
    assert.equal(taskStatusOf(record), "reported");
    assert.equal(read.unclosed.length, 1);
    assert.equal(taskCardOf(record)?.lastReport?.status, "done");

    await appendTaskEvent(root, taskEvent("task.closed", { taskId, by: "chief", outcome: "accepted" }));
    const closed = await readTaskState(root);
    assert.equal(taskStatusOf(closed.records.get(taskId)!), "closed");
    assert.equal(closed.unclosed.length, 0);
    assert.equal(closed.records.get(taskId)!.closed?.outcome, "accepted");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("坏行跳过：JSON 坏行/缺字段行不阻塞，其他事件照常重放", async () => {
  const root = await tempRoot();
  try {
    const file = path.join(root, ...TASKS_STATE_REL.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    const good = JSON.stringify(created("t-good"));
    await fs.writeFile(file, `${good}\n{broken json\n${JSON.stringify({ v: 1, kind: "task.created", at: "2026-10-28T00:00:00.000Z", taskId: "x" })}\n`, "utf8");
    const read = await readTaskState(root);
    assert.equal(read.records.has("t-good"), true);
    assert.equal(read.errors.length, 2);
    assert.ok(read.errors.every((error) => error.line > 0));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("幂等键：显式键优先；缺省哈希稳定；同键未收口任务可查询，收口后放行", async () => {
  const base = { from: "chief", to: "worker", text: "同一个任务" };
  const a = taskIdempotencyKey(base);
  const b = taskIdempotencyKey({ ...base });
  assert.equal(a, b);
  assert.notEqual(a, taskIdempotencyKey({ ...base, text: "另一个任务" }));
  assert.equal(taskIdempotencyKey({ ...base, idempotencyKey: " explicit " }), "explicit");

  const replay = replayTaskEvents([created("t1", "同一个任务", { idempotencyKey: a })]);
  assert.equal(findOpenTaskByIdempotencyKey(replay, a)?.taskId, "t1");
  const closed = replayTaskEvents([
    created("t1", "同一个任务", { idempotencyKey: a }),
    taskEvent("task.closed", { taskId: "t1", by: "chief", outcome: "accepted" }),
  ]);
  assert.equal(findOpenTaskByIdempotencyKey(closed, a), undefined);
});

test("副作用分类：缺填/非法⇒unknown；应用只升不降", () => {
  assert.equal(normalizeTaskSideEffect("wrong"), "unknown");
  assert.equal(normalizeTaskSideEffect(undefined), "unknown");
  assert.equal(classifyTaskSideEffect(undefined, "打个招呼"), "unknown");
  assert.equal(classifyTaskSideEffect("read-only", "改 src/app.ts"), "code");
  assert.equal(classifyTaskSideEffect("docs", "更新 docs/a.md 并跑 npm run test"), "code");
  assert.equal(classifyTaskSideEffect("read-only", "git push origin main"), "external");
  assert.equal(classifyTaskSideEffect("read-only", "rm -rf temp/"), "destructive");
  // 已声明更高风险：文本无更高证据 ⇒ 不降。
  assert.equal(classifyTaskSideEffect("external", "更新文档"), "external");
  assert.equal(classifyTaskSideEffect("destructive", "只读检查"), "destructive");
  assert.equal(classifyTaskSideEffect("read-only", "只读检查"), "read-only");
});

test("重派链：新任务 retryOf 原任务；计数按链累计（首次尝试不计）", () => {
  const attempt1 = redispatchTaskId("t-1", 1);
  const attempt2 = redispatchTaskId("t-1", 2);
  assert.equal(attempt1, "t-1-r1");
  assert.equal(attempt2, "t-1-r2");
  const replay = replayTaskEvents([
    created("t-1"),
    taskEvent("task.redispatch", { taskId: "t-1-r1", retryOf: "t-1", to: "worker", reason: "stuck", safety: "safe" }),
    created("t-1-r1", "实现功能", { idempotencyKey: "key-t-1" }),
    taskEvent("task.redispatch", { taskId: "t-1-r2", retryOf: "t-1-r1", to: "worker", reason: "stuck", safety: "safe" }),
    created("t-1-r2", "实现功能", { idempotencyKey: "key-t-1" }),
  ]);
  assert.equal(redispatchCountOf(replay, "t-1"), 2);
  assert.equal(replay.records.get("t-1-r1")?.retryOf, "t-1");
  assert.equal(replay.records.get("t-1-r2")?.retryOf, "t-1-r1");
});

test("轮转：超过上限时当前文件转为 .1，旧文件后移，读取仍能重放全部任务", async () => {
  const root = await tempRoot();
  const oldMax = process.env.ANS_TASKS_MAX_BYTES;
  const oldRot = process.env.ANS_TASKS_ROTATIONS;
  process.env.ANS_TASKS_MAX_BYTES = "260";
  process.env.ANS_TASKS_ROTATIONS = "2";
  try {
    for (const id of ["t-a", "t-b", "t-c", "t-d", "t-e"]) {
      const result = await appendTaskEvent(root, created(id, `任务 ${id} ${"x".repeat(20)}`));
      assert.equal(result.ok, true);
    }
    const file = path.join(root, ...TASKS_STATE_REL.split("/"));
    const names = await fs.readdir(path.dirname(file));
    assert.ok(names.includes("tasks.jsonl"));
    assert.ok(names.includes("tasks.jsonl.1"));
    const read = await readTaskState(root);
    // 轮转保留最近 N 份；至少能读到最新任务，坏行数为 0。
    assert.ok(read.records.has("t-e"));
    assert.equal(read.errors.length, 0);
  } finally {
    if (oldMax === undefined) delete process.env.ANS_TASKS_MAX_BYTES; else process.env.ANS_TASKS_MAX_BYTES = oldMax;
    if (oldRot === undefined) delete process.env.ANS_TASKS_ROTATIONS; else process.env.ANS_TASKS_ROTATIONS = oldRot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("任务卡固定字段：摘要≤200、可选证据/期望产出/重派来源如实", () => {
  assert.equal([...shortenSummary("长".repeat(300))].length, 200);
  const record: TaskRecord = {
    taskId: "t-card",
    created: created("t-card", "实现 X", {
      expectedOutput: "src/x.ts 与测试",
      requestedEvidence: ["src/x.ts", "test/x.test.ts"],
      sideEffect: "code",
    }),
    reports: [],
    redispatches: [],
    retryOf: "t-old",
  };
  const card = taskCardOf(record)!;
  assert.equal(card.status, "created");
  const lines = renderTaskCardLines(card);
  const text = lines.join("\n");
  assert.match(text, /#t-card/);
  assert.match(text, /重派自 t-old/);
  assert.match(text, /目标角色：worker/);
  assert.match(text, /期望产出：src\/x\.ts 与测试/);
  assert.match(text, /可选证据：src\/x\.ts；test\/x\.test\.ts/);
  assert.match(text, /状态：created｜副作用：code/);
});

// ————————————————— 2026-10-29（方案 v2.1 §5.4，F2/F3/F9）：契约放宽与旧记录兼容 —————————————————

test("task.created.from 放宽到 chief/convener；flowId/stepId 可选且须为合法 slug；旧记录（无字段）可读", async () => {
  const root = await tempRoot();
  try {
    const fromConvener = taskEvent("task.created", {
      taskId: "t-convener",
      from: "convener",
      to: "implementer",
      text: "实现 X",
      sideEffect: "code",
      idempotencyKey: "key-convener",
      flowId: "focus",
      stepId: "implement",
      moduleId: "impl-core",
      moduleDirectory: "src/",
    }, () => new Date("2026-10-29T00:00:00.000Z"));
    const legacy = created("t-legacy");
    assert.equal((await appendTaskEvent(root, fromConvener)).ok, true);
    assert.equal((await appendTaskEvent(root, legacy)).ok, true);
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.records.get("t-convener")?.created?.from, "convener");
    assert.equal(state.records.get("t-convener")?.created?.stepId, "implement");
    assert.equal(state.records.get("t-convener")?.created?.flowId, "focus");
    assert.equal(state.records.get("t-convener")?.created?.moduleId, "impl-core");
    assert.equal(state.records.get("t-convener")?.created?.moduleDirectory, "src/");
    assert.equal(state.records.get("t-legacy")?.created?.from, "chief");

    // 非法 from / 非法 stepId / 非法模块 → 坏行（跳过但不阻塞其他行）。
    await fs.writeFile(
      path.join(root, TASKS_STATE_REL),
      [
        JSON.stringify({ ...fromConvener, taskId: "t-bad-from", from: "worker" }),
        JSON.stringify({ ...fromConvener, taskId: "t-bad-step", stepId: "Bad_Step" }),
        JSON.stringify({ ...fromConvener, taskId: "t-bad-module", moduleId: "X" }),
        JSON.stringify({ ...fromConvener, taskId: "t-bad-module-dir", moduleDirectory: "../src/" }),
        JSON.stringify(fromConvener),
      ].join("\n") + "\n",
      "utf8",
    );
    const bad = await readTaskState(root);
    assert.equal(bad.records.size, 1, "只有合法行进入重放");
    assert.equal(bad.errors.length, 4, JSON.stringify(bad.errors));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("task.closed.by 放宽到 chief/convener；request.resolved 名单 version/hash 校验（正整数/64 位 hex）", async () => {
  const root = await tempRoot();
  try {
    await appendTaskEvent(root, created("t-close"));
    assert.equal((await appendTaskEvent(root, taskEvent("task.closed", { taskId: "t-close", by: "convener", outcome: "accepted" }, () => new Date("2026-10-29T00:00:01.000Z")))).ok, true);
    await appendTaskEvent(root, {
      v: 1,
      at: "2026-10-29T00:00:02.000Z",
      kind: "request.created",
      requestId: "req-d3",
      flowId: "focus",
      sourceRoleId: "nominator",
      title: "D3",
      options: [{ id: "implementer", label: "implementer" }],
    });
    await appendTaskEvent(root, {
      v: 1,
      at: "2026-10-29T00:00:03.000Z",
      kind: "request.resolved",
      requestId: "req-d3",
      decisionId: "decision-req-d3",
      targetRoleIds: ["implementer"],
      rosterVersion: 2,
      rosterSha256: "b".repeat(64),
      by: "judge",
      choice: "implementer",
    });
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.records.get("t-close")?.closed?.by, "convener");
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.equal(resolved?.kind === "request.resolved" ? resolved.rosterVersion : undefined, 2);

    // 非法 roster 字段 → 坏行。
    await fs.writeFile(
      path.join(root, TASKS_STATE_REL),
      [
        JSON.stringify({ v: 1, at: "2026-10-29T00:00:04.000Z", kind: "request.resolved", requestId: "r1", rosterVersion: 0, by: "judge", choice: "x" }),
        JSON.stringify({ v: 1, at: "2026-10-29T00:00:05.000Z", kind: "request.resolved", requestId: "r2", rosterSha256: "XYZ", by: "judge", choice: "x" }),
      ].join("\n") + "\n",
      "utf8",
    );
    const bad = await readTaskState(root);
    assert.equal(bad.errors.length, 2, JSON.stringify(bad.errors));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
