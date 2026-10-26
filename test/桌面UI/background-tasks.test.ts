// test/桌面UI/background-tasks.test.ts
// 后台任务面板纯逻辑（2026-10-25）：bridge mock、状态/日志/停止语义、轮询清理、入口徽标。

import test from "node:test";
import assert from "node:assert/strict";
import {
  backgroundRunningCount,
  backgroundStateView,
  backgroundStopFailureDetail,
  backgroundStopReducer,
  backgroundTaskKey,
  backgroundTaskRowDurationMs,
  formatBackgroundDuration,
  initialBackgroundStopUiState,
  loadBackgroundTaskLog,
  loadBackgroundTasks,
  startBackgroundTaskPolling,
  stopBackgroundTask,
  truncateBackgroundCommand,
} from "../../app/renderer/src/chat/background-tasks.ts";
import { useBackgroundTasksStore } from "../../app/renderer/src/stores/background-tasks-store.ts";
import { getDesktopBridge } from "../../app/renderer/src/lib/platform.ts";

const SNAPSHOT = {
  taskId: "task-1",
  state: "running",
  pid: 4321,
  command: "npm run dev -- --host 0.0.0.0",
  startedAt: "2026-10-25T06:00:00.000Z",
  durationMs: 1000,
  roleId: "liaison",
  runtime: "pi",
};

test("状态映射：running/exited/stopped/failed/kill-timeout 文案与类名", () => {
  const running = backgroundStateView("running");
  assert.equal(running.label, "运行中");
  assert.equal(running.className, "is-running");
  assert.equal(running.running, true);
  assert.equal(running.canStop, true);

  assert.equal(backgroundStateView("exited").label, "已退出");
  assert.equal(backgroundStateView("stopped").label, "已停止");
  assert.equal(backgroundStateView("failed").label, "启动失败");
  assert.equal(backgroundStateView("failed").className, "is-failed");

  const timeout = backgroundStateView("kill-timeout");
  assert.equal(timeout.label, "停止超时");
  assert.equal(timeout.className, "is-kill-timeout");
  assert.equal(timeout.running, false);
  assert.equal(timeout.canStop, true);
});

test("列表：ready/unavailable/empty/error 与运行中计数、角色名、时长", async () => {
  const now = Date.parse("2026-10-25T06:00:05.000Z");
  const bridge = {
    listBackgroundTasks: async () => ({
      ok: true,
      projectRoot: "p",
      runtime: "pi",
      unavailable: false,
      tasks: [
        SNAPSHOT,
        {
          ...SNAPSHOT,
          taskId: "task-2",
          state: "kill-timeout",
          pid: 99,
          startedAt: "2026-10-25T05:59:00.000Z",
          durationMs: 60000,
        },
      ],
    }),
  };
  const model = await loadBackgroundTasks(
    bridge,
    "p",
    "pi",
    "zh-CN",
    now,
    (roleId) => (roleId === "liaison" ? "主理" : roleId),
  );
  assert.equal(model.kind, "ready");
  if (model.kind !== "ready") return;
  assert.equal(model.tasks.length, 2);
  assert.equal(model.runningCount, 1);
  assert.equal(model.tasks[0].roleName, "主理");
  assert.equal(model.tasks[0].durationText, "0:05");
  assert.equal(model.tasks[1].stateLabel, "停止超时");
  assert.equal(model.tasks[1].canStop, true);
  assert.equal(model.tasks[1].exitCode, null);

  const unavailable = await loadBackgroundTasks(
    {
      listBackgroundTasks: async () => ({
        ok: true,
        tasks: [],
        unavailable: true,
      }),
    },
    "p",
    "pi",
  );
  assert.equal(unavailable.kind, "unavailable");

  const empty = await loadBackgroundTasks(
    {
      listBackgroundTasks: async () => ({
        ok: true,
        tasks: [],
        unavailable: false,
      }),
    },
    "p",
    "pi",
  );
  assert.equal(empty.kind, "ready");
  assert.equal(backgroundRunningCount(empty), 0);

  const missing = await loadBackgroundTasks(null, "p", "pi");
  assert.equal(missing.kind, "unavailable");

  const failed = await loadBackgroundTasks(
    { listBackgroundTasks: async () => ({ ok: false, error: "boom" }) },
    "p",
    "pi",
  );
  assert.equal(failed.kind, "error");
  if (failed.kind === "error") assert.equal(failed.detail, "boom");

  const thrown = await loadBackgroundTasks(
    {
      listBackgroundTasks: async () => {
        throw new Error("offline");
      },
    },
    "p",
    "pi",
  );
  assert.equal(thrown.kind, "error");
  if (thrown.kind === "error") assert.equal(thrown.detail, "offline");
});

test("日志：stdout/stderr 区段、空态、tailClamped/truncated 提示", async () => {
  const bridge = {
    readBackgroundTask: async () => ({
      ok: true,
      result: {
        task: SNAPSHOT,
        tailLines: 40,
        tailClamped: true,
        stdout: { text: "out line\n", truncated: true },
        stderr: { text: "err line\n", truncated: false },
      },
    }),
  };
  const log = await loadBackgroundTaskLog(
    bridge,
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(log.kind, "ready");
  if (log.kind !== "ready") return;
  assert.deepEqual(
    log.streams.map((stream) => stream.label),
    ["标准输出", "标准错误"],
  );
  assert.equal(log.truncated, true);
  assert.equal(log.tailClamped, true);
  assert.equal(log.streams[0].truncated, true);
  assert.equal(log.empty, false);

  const empty = await loadBackgroundTaskLog(
    { readBackgroundTask: async () => ({ ok: true, result: { tailLines: 40, tailClamped: false } }) },
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(empty.kind, "ready");
  if (empty.kind === "ready") assert.equal(empty.empty, true);

  const failed = await loadBackgroundTaskLog(
    { readBackgroundTask: async () => ({ ok: false, error: "gone" }) },
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(failed.kind, "error");
  if (failed.kind === "error") assert.equal(failed.detail, "gone");

  const missing = await loadBackgroundTaskLog(
    {},
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(missing.kind, "error");
  if (missing.kind === "error") assert.equal(missing.detail, "后台任务服务不可用");
});

test("停止二次确认状态机：ask → start → settle；失败保留 detail", () => {
  assert.notEqual(
    backgroundTaskKey({ roleId: "liaison", taskId: "bg-1" }),
    backgroundTaskKey({ roleId: "convener", taskId: "bg-1" }),
  );
  let state = backgroundStopReducer(initialBackgroundStopUiState, {
    type: "ask",
    taskKey: "task-1",
  });
  assert.equal(state.confirmingTaskKey, "task-1");
  state = backgroundStopReducer(state, { type: "start", taskKey: "task-1" });
  assert.equal(state.confirmingTaskKey, null);
  assert.equal(state.stoppingTaskKey, "task-1");
  state = backgroundStopReducer(state, {
    type: "settle",
    taskKey: "task-1",
    detail: "停止超时",
  });
  assert.equal(state.stoppingTaskKey, null);
  assert.equal(state.errors["task-1"], "停止超时");
  state = backgroundStopReducer(state, { type: "ask", taskKey: "task-1" });
  assert.equal(state.errors["task-1"], undefined);
  state = backgroundStopReducer(state, {
    type: "settle",
    taskKey: "task-1",
  });
  assert.equal(state.errors["task-1"], undefined);
});

test("停止回执：timeout 明确「停止超时」，unavailable/unknown-task 分别说明", async () => {
  const timeout = await stopBackgroundTask(
    {
      stopBackgroundTask: async () => ({
        ok: false,
        reason: "timeout",
        message: "did not close",
      }),
    },
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(timeout.ok, false);
  if (timeout.ok === false) {
    assert.equal(timeout.reason, "timeout");
    assert.match(timeout.detail, /停止超时/);
    assert.equal(timeout.detail.includes("已停止"), false);
  }

  const unavailable = await stopBackgroundTask(
    {},
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(unavailable.ok, false);
  if (unavailable.ok === false) {
    assert.match(unavailable.detail, /后台任务服务不可用/);
  }

  const unknown = await stopBackgroundTask(
    {
      stopBackgroundTask: async () => ({
        ok: false,
        reason: "unknown-task",
        message: "task not found",
      }),
    },
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(unknown.ok, false);
  if (unknown.ok === false) assert.match(unknown.detail, /未知/);

  const success = await stopBackgroundTask(
    {
      stopBackgroundTask: async () => ({
        ok: true,
        task: { ...SNAPSHOT, state: "stopped" },
        alreadyEnded: false,
      }),
    },
    { projectRoot: "p", runtime: "pi", roleId: "liaison", taskId: "task-1" },
    "zh-CN",
  );
  assert.equal(success.ok, true);
  if (success.ok) assert.equal(success.task?.state, "stopped");
});

test("轮询：挂载立即拉一次、3s 间隔、清理调用 clearInterval", () => {
  let loads = 0;
  const scheduled: { handler: (() => void) | null } = { handler: null };
  let interval = 0;
  let cleared: unknown = null;
  const stop = startBackgroundTaskPolling(
    () => {
      loads += 1;
    },
    3000,
    (next, timeout) => {
      scheduled.handler = next;
      interval = timeout;
      return "timer-1";
    },
    (id) => {
      cleared = id;
    },
  );
  assert.equal(loads, 1);
  assert.equal(interval, 3000);
  scheduled.handler?.();
  assert.equal(loads, 2);
  stop();
  assert.equal(cleared, "timer-1");
});

test("window.desktop mock：新桥可用；旧 preload 缺方法降级 unavailable 不抛错", async () => {
  const host = globalThis as { window?: unknown };
  const previous = host.window;
  try {
    host.window = {
      desktop: {
        listBackgroundTasks: async () => ({
          ok: true,
          unavailable: false,
          tasks: [SNAPSHOT],
        }),
      },
    };
    const bridge = getDesktopBridge();
    assert.ok(bridge);
    const model = await loadBackgroundTasks(bridge, "p", "pi", "zh-CN");
    assert.equal(model.kind, "ready");
    if (model.kind === "ready") assert.equal(model.tasks.length, 1);

    host.window = { desktop: {} };
    const oldBridge = getDesktopBridge();
    assert.ok(oldBridge);
    const oldModel = await loadBackgroundTasks(oldBridge, "p", "pi", "zh-CN");
    assert.equal(oldModel.kind, "unavailable");
  } finally {
    if (previous === undefined) delete host.window;
    else host.window = previous;
  }
});

test("入口徽标：仅 ready 的运行中任务计数；store 收敛非法值", async () => {
  const ready = await loadBackgroundTasks(
    {
      listBackgroundTasks: async () => ({
        ok: true,
        unavailable: false,
        tasks: [
          { ...SNAPSHOT, taskId: "a", state: "running" },
          { ...SNAPSHOT, taskId: "b", state: "running" },
          { ...SNAPSHOT, taskId: "c", state: "exited" },
        ],
      }),
    },
    "p",
    "pi",
  );
  assert.equal(backgroundRunningCount(ready), 2);
  assert.equal(backgroundRunningCount({ kind: "loading" }), 0);
  assert.equal(backgroundRunningCount({ kind: "unavailable" }), 0);
  assert.equal(backgroundRunningCount({ kind: "error", detail: "x" }), 0);

  useBackgroundTasksStore.getState().setRunningCount(3);
  assert.equal(useBackgroundTasksStore.getState().runningCount, 3);
  useBackgroundTasksStore.getState().setRunningCount(-1);
  assert.equal(useBackgroundTasksStore.getState().runningCount, 0);
  useBackgroundTasksStore.getState().setRunningCount("bad");
  assert.equal(useBackgroundTasksStore.getState().runningCount, 0);
});

test("时长/命令格式：mm:ss / hh:mm:ss 与 80 字符截断", () => {
  assert.equal(formatBackgroundDuration(0), "0:00");
  assert.equal(formatBackgroundDuration(65_000), "1:05");
  assert.equal(formatBackgroundDuration(3_665_000), "1:01:05");
  assert.equal(truncateBackgroundCommand("short"), "short");
  const long = "x".repeat(120);
  const short = truncateBackgroundCommand(long);
  assert.equal(Array.from(short).length, 80);
  assert.equal(short.endsWith("…"), true);
});

test("运行中时长按 startedAt 实时计算；坏时间回退快照", () => {
  const now = Date.parse("2026-10-25T06:00:05.000Z");
  assert.equal(
    backgroundTaskRowDurationMs(
      { running: true, startedAt: "2026-10-25T06:00:00.000Z", durationMs: 1000 },
      now,
    ),
    5000,
  );
  assert.equal(
    backgroundTaskRowDurationMs(
      { running: true, startedAt: "bad", durationMs: 1234 },
      now,
    ),
    1234,
  );
  assert.equal(
    backgroundTaskRowDurationMs(
      { running: false, startedAt: "2026-10-25T06:00:00.000Z", durationMs: 1234 },
      now,
    ),
    1234,
  );
});

test("停止失败 detail 纯函数：timeout 不用「已停止」措辞", () => {
  assert.match(backgroundStopFailureDetail("timeout", "", "zh-CN"), /停止超时/);
  assert.match(backgroundStopFailureDetail("unavailable", "", "zh-CN"), /不可用/);
  assert.match(backgroundStopFailureDetail("unknown-task", "x", "zh-CN"), /未知/);
  assert.match(backgroundStopFailureDetail("closed", "session closed", "zh-CN"), /关闭/);
});
