// 会话级后台任务管理器（B3）单元测试：状态机、并发/保留上限、环形日志、终止预算、dispose。
// 真实子进程覆盖启动/读取/自然退出/停止/dispose；受控 spawn 替身只用于无法用真实 SIGKILL 稳定复现的
// 分支（kill-timeout 未收口、并发/保留上限的快速批量任务），断言的是管理器真实计时与事件路径。
import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import {
  BACKGROUND_TASK_MAX_RETAINED,
  BACKGROUND_TASK_MAX_RUNNING,
  BACKGROUND_TASK_STREAM_LIMIT_BYTES,
  createBackgroundTaskManager,
} from "../../src/common/runtime-core/background-tasks.ts";
import type { BackgroundTaskCapability, BackgroundTaskState } from "../../src/model/runtime.ts";
import {
  boundMs,
  baseEnv,
  closeOnKill,
  fakeSpawner,
  isAlive,
  spyDiagnostics,
  startInput,
  temp,
  waitUntil,
  type KillImpl,
} from "./background-fixtures.ts";

function snapshotState(manager: BackgroundTaskCapability, taskId: string): BackgroundTaskState | undefined {
  return manager.list().find((task) => task.taskId === taskId)?.state;
}

test("S1/S2：真实子进程启动立即返回任务号与 pid；list/read 可见；stop 后 stopped 且进程消失", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    const code = 'process.stdout.write("boot-1\\n");process.stderr.write("warn-1\\n");setInterval(()=>{},1000)';
    const began = Date.now();
    const started = await manager.start(startInput(root, code));
    const elapsed = Date.now() - began;
    assert.equal(started.ok, true);
    assert.ok(started.ok);
    assert.equal(started.task.taskId, "bg-1");
    assert.equal(started.task.state, "running");
    assert.ok(typeof started.task.pid === "number" && started.task.pid > 0);
    assert.ok(elapsed < boundMs, `启动应在 spawn 确认后立即返回（实际 ${elapsed}ms）`);
    assert.equal(isAlive(started.task.pid!), true, "返回时进程必须真实存活");

    await waitUntil(() => {
      const read = manager.read("bg-1", { stream: "both", tailLines: 40 });
      return read?.stdout?.text.includes("boot-1") === true && read?.stderr?.text.includes("warn-1") === true;
    });

    const listed = manager.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.state, "running");
    assert.equal(listed[0]?.pid, started.task.pid);
    assert.match(listed[0]?.command ?? "", /setInterval/);

    const stopped = await manager.stop("bg-1");
    assert.equal(stopped.ok, true);
    assert.ok(stopped.ok);
    assert.equal(stopped.task.state, "stopped");
    assert.equal(stopped.alreadyEnded, false);
    await waitUntil(() => !isAlive(started.task.pid!));

    const again = await manager.stop("bg-1");
    assert.equal(again.ok, true);
    assert.ok(again.ok);
    assert.equal(again.alreadyEnded, true);
    assert.equal(again.task.state, "stopped");

    const after = manager.read("bg-1");
    assert.equal(after?.task.state, "stopped");
    assert.match(after?.stdout?.text ?? "", /boot-1/);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S2.5：自然退出显示 exited 与真实退出码；read 默认 40 行、上限 200（如实标 tailClamped）", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    const lines = Array.from({ length: 300 }, (_, index) => `line-${index + 1}`).join("\n");
    const code = `process.stdout.write(${JSON.stringify(lines)});process.exit(3)`;
    const started = await manager.start(startInput(root, code));
    assert.equal(started.ok, true);
    await waitUntil(() => snapshotState(manager, "bg-1") === "exited");

    const listed = manager.list()[0]!;
    assert.equal(listed.state, "exited");
    assert.equal(listed.exitCode, 3);
    assert.notEqual(listed.state, "stopped");

    const defaultRead = manager.read("bg-1");
    assert.equal(defaultRead?.tailLines, 40);
    assert.equal(defaultRead?.tailClamped, false);
    const defaultLines = defaultRead?.stdout?.text.split("\n") ?? [];
    assert.equal(defaultLines.length, 40);
    assert.equal(defaultLines.at(-1), "line-300");

    const capped = manager.read("bg-1", { tailLines: 500 });
    assert.equal(capped?.tailLines, 200);
    assert.equal(capped?.tailClamped, true);
    assert.equal(capped?.stdout?.text.split("\n").length, 200);

    const stdoutOnly = manager.read("bg-1", { stream: "stdout" });
    assert.ok(stdoutOnly?.stdout !== undefined);
    assert.equal(stdoutOnly?.stderr, undefined);
    const stderrOnly = manager.read("bg-1", { stream: "stderr" });
    assert.equal(stderrOnly?.stdout, undefined);
    assert.equal(stderrOnly?.stderr?.text, "");

    const stop = await manager.stop("bg-1");
    assert.equal(stop.ok, true);
    assert.ok(stop.ok);
    assert.equal(stop.alreadyEnded, true, "自然退出的任务再次 stop 必须如实返回已结束");
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S2.3：单路超过 256 KiB → truncated，仅保留尾部，且不返回损坏的多字节字符", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    // 3×256 KiB 的「汉」（每个 3 字节）跨过环形边界；尾标记必须保留，且不得出现 U+FFFD。
    const code = 'process.stdout.write("汉".repeat(90000));process.stdout.write("\\nTAIL-END\\n")';
    const started = await manager.start(startInput(root, code));
    assert.equal(started.ok, true);
    await waitUntil(() => snapshotState(manager, "bg-1") === "exited");
    const read = manager.read("bg-1", { stream: "stdout", tailLines: 200 });
    assert.equal(read?.stdout?.truncated, true, "超过缓冲必须标 truncated");
    assert.match(read?.stdout?.text ?? "", /TAIL-END/);
    assert.equal(read?.stdout?.text.includes("�"), false, "不得返回损坏的多字节字符");
    assert.ok(Buffer.byteLength(read?.stdout?.text ?? "", "utf8") <= BACKGROUND_TASK_STREAM_LIMIT_BYTES);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("F5：spawn 失败不保留半成品任务、名额释放，后续仍可启动", async () => {
  const root = await temp();
  const diagnostics = spyDiagnostics();
  const manager = createBackgroundTaskManager({ diagnostics: diagnostics.log });
  try {
    const failed = await manager.start({ command: "ans-no-such-background-executable", argv: ["ans-no-such-background-executable"], cwd: root, env: baseEnv() });
    assert.equal(failed.ok, false);
    assert.ok(!failed.ok);
    assert.equal(failed.reason, "spawn-failed");
    assert.equal(manager.list().length, 0, "启动失败不得留下假任务");
    assert.equal(manager.runningCount, 0, "失败必须释放名额");
    assert.equal(manager.read("bg-1"), undefined);
    assert.equal(diagnostics.events.some((entry) => entry.event === "background.exit"), false, "spawn 失败不得记录 background.exit");

    const started = await manager.start(startInput(root, "process.exit(0)"));
    assert.equal(started.ok, true);
    assert.equal(manager.list().length, 1, "失败之后仍可从 bg-1 正常启动");
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("F4/S6.1：并发上限 8，第 9 个被拒且名额不被突破", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  const input = { command: "fake-hang", argv: ["fake-hang"], cwd: process.cwd(), env: {} };
  try {
    for (let index = 0; index < BACKGROUND_TASK_MAX_RUNNING; index++) {
      const started = await manager.start(input);
      assert.equal(started.ok, true, `第 ${index + 1} 个应成功`);
    }
    assert.equal(manager.runningCount, BACKGROUND_TASK_MAX_RUNNING);
    const ninth = await manager.start(input);
    assert.equal(ninth.ok, false);
    assert.ok(!ninth.ok);
    assert.equal(ninth.reason, "limit");
    assert.equal(fake.spawnCalls(), BACKGROUND_TASK_MAX_RUNNING, "第 9 个必须零 spawn");
    assert.equal(manager.list().length, BACKGROUND_TASK_MAX_RUNNING);
    assert.equal(manager.runningCount, BACKGROUND_TASK_MAX_RUNNING);
  } finally {
    await manager.dispose();
  }
});

test("F4.4：并行 start 不会一起突破 8 个名额", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  const input = { command: "fake-parallel", argv: ["fake-parallel"], cwd: process.cwd(), env: {} };
  try {
    const results = await Promise.all(Array.from({ length: 10 }, () => manager.start(input)));
    assert.equal(results.filter((result) => result.ok).length, BACKGROUND_TASK_MAX_RUNNING);
    assert.equal(results.filter((result) => !result.ok && result.reason === "limit").length, 2);
    assert.equal(fake.spawnCalls(), BACKGROUND_TASK_MAX_RUNNING, "并行调用也不得 spawn 超过 8 个");
  } finally {
    await manager.dispose();
  }
});

test("S6.2：保留上限 32，最老已结束任务优先淘汰；运行中任务永不淘汰；淘汰任务号返回未知", async () => {
  const fake = fakeSpawner({ autoExitFrom: 1 });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  const input = { command: "fake-quick", argv: ["fake-quick"], cwd: process.cwd(), env: {} };
  try {
    // 第 1 个保持运行；其余快速自然退出。
    const running = await manager.start(input);
    assert.equal(running.ok, true);
    await waitUntil(() => manager.list().length === 1);
    for (let index = 2; index <= BACKGROUND_TASK_MAX_RETAINED + 1; index++) {
      const started = await manager.start(input);
      assert.equal(started.ok, true);
      const taskId = started.ok ? started.task.taskId : "";
      await waitUntil(() => snapshotState(manager, taskId) === "exited");
    }
    const tasks = manager.list();
    assert.equal(tasks.length, BACKGROUND_TASK_MAX_RETAINED, "保留任务数必须为 32");
    assert.equal(tasks.some((task) => task.taskId === "bg-1" && task.state === "running"), true, "运行中任务不得被淘汰");
    assert.equal(tasks.some((task) => task.taskId === "bg-2"), false, "最老的已结束任务 bg-2 应被淘汰");
    assert.equal(manager.read("bg-2"), undefined, "被淘汰的任务号读取必须为未知");
    assert.equal(manager.read("bg-1")?.task.state, "running");
  } finally {
    await manager.dispose();
  }
});

test("F7：终止预算内未观察到 close → kill-timeout；诊断 background.stop.timeout（证明真实等待到期）", async () => {
  const fake = fakeSpawner({ autoExit: false });
  // 前两次终止调用（SIGTERM、SIGKILL）不产生 close；dispose 的第三次才 close，避免遗留假进程。
  const diagnostics = spyDiagnostics();
  const managed = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill(3), diagnostics: diagnostics.log });
  try {
    const started = await managed.start({ command: "fake-ignore-term", argv: ["fake-ignore-term"], cwd: process.cwd(), env: {} });
    assert.equal(started.ok, true);
    const began = Date.now();
    const stopped = await managed.stop(started.ok ? started.task.taskId : "");
    const elapsed = Date.now() - began;
    assert.equal(stopped.ok, false);
    assert.ok(!stopped.ok);
    assert.equal(stopped.reason, "timeout");
    assert.equal(stopped.task?.state, "kill-timeout");
    assert.ok(elapsed >= 1200, `必须真实等到终止预算耗尽（实际 ${elapsed}ms，预算 250+1000ms）`);
    assert.match(stopped.message, /未观察到进程退出/);
    const timeoutEvent = diagnostics.events.find((entry) => entry.event === "background.stop.timeout");
    assert.ok(timeoutEvent, "必须记录 background.stop.timeout");
    assert.equal(typeof timeoutEvent?.fields?.pid, "number");
    assert.equal(timeoutEvent?.fields?.state, "kill-timeout");
    assert.equal(typeof timeoutEvent?.fields?.durationMs, "number");
  } finally {
    await managed.dispose();
  }
});

test("S3：dispose 并行终止全部任务、幂等、清空任务并拒绝后续 start", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    const code = "setInterval(()=>{},1000)";
    const first = await manager.start(startInput(root, code));
    const second = await manager.start(startInput(root, code));
    assert.equal(first.ok && second.ok, true);
    const pids = [first.ok ? first.task.pid! : 0, second.ok ? second.task.pid! : 0];

    const disposing = manager.dispose();
    const duplicate = manager.dispose();
    assert.equal(disposing, duplicate, "dispose 必须幂等（同一 Promise）");
    await disposing;
    await waitUntil(() => pids.every((pid) => !isAlive(pid)), boundMs);

    assert.deepEqual(manager.list(), []);
    assert.equal(manager.read("bg-1"), undefined);
    const stopAfter = await manager.stop("bg-1");
    assert.equal(stopAfter.ok, false);
    assert.ok(!stopAfter.ok);
    assert.equal(stopAfter.reason, "closed");
    const after = await manager.start(startInput(root, "process.exit(0)"));
    assert.equal(after.ok, false);
    assert.ok(!after.ok);
    assert.equal(after.reason, "closed");
    assert.match(after.message, /会话已关闭，未启动/);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("F6：任务不跨管理器/会话可见（另一个管理器读/停旧任务号均为未知）", async () => {
  const root = await temp();
  const first = createBackgroundTaskManager();
  const second = createBackgroundTaskManager();
  try {
    const started = await first.start(startInput(root, "setInterval(()=>{},1000)"));
    assert.equal(started.ok, true);
    assert.equal(second.read("bg-1"), undefined);
    const stopped = await second.stop("bg-1");
    assert.equal(stopped.ok, false);
    assert.ok(!stopped.ok);
    assert.equal(stopped.reason, "unknown-task");
    assert.equal(first.list().length, 1, "另一个管理器不得影响原任务");
  } finally {
    await first.dispose();
    await second.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S3.1：dispose 并行发起终止（两个任务的终止信号在同一批同步发出）", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const killTimes: number[] = [];
  const killImpl = ((child: { emit: (event: string, code: number | null, signal: string) => void }) => {
    killTimes.push(Date.now());
    queueMicrotask(() => child.emit("close", null, "SIGTERM"));
  }) as unknown as KillImpl;
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: killImpl });
  const input = { command: "fake-dispose", argv: ["fake-dispose"], cwd: process.cwd(), env: {} };
  try {
    assert.equal((await manager.start(input)).ok, true);
    assert.equal((await manager.start(input)).ok, true);
    await manager.dispose();
    assert.equal(killTimes.length, 2);
    assert.ok(Math.abs(killTimes[1]! - killTimes[0]!) < 50, "dispose 必须在同一批并行发起终止，而不是串行等待");
  } finally {
    await manager.dispose();
  }
});

test("启动后运行错误 → failed（启动失败不建任务）", async () => {
  const fake = fakeSpawner({ errorAfterSpawn: "fixture post-spawn failure" });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  try {
    const started = await manager.start({ command: "fake-error", argv: ["fake-error"], cwd: process.cwd(), env: {} });
    assert.equal(started.ok, true);
    await waitUntil(() => snapshotState(manager, "bg-1") === "failed");
    assert.match(manager.list()[0]?.error ?? "", /post-spawn failure/);
  } finally {
    await manager.dispose();
  }
});
