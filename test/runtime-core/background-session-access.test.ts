// 会话级后台任务访问面（桌面任务面板展示用）：RuntimeSession 的 list/read/stop 只转调当前会话管理器。
// 覆盖：无管理器（含判断会话）、有管理器（选项钳制与未知任务）、dispose 后失效且不复活管理器。
// 这里不重复管理器内部的状态机/缓冲/终止预算用例（见 background-tasks.test.ts），只验证 Service 包装面。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import type { RoleSession, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent } from "../../src/model/runtime.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";
import { allowShellGate, boundMs, isAlive, waitUntil } from "./background-fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-background-access-"));

/** 受控 Provider：prompt 里执行测试给定的真实工具调用，再交 settled；工具仍是 Service 注入的那一份。 */
function toolsProvider(
  run: (options: RuntimeProviderOptions, session: RoleSession) => Promise<void> | void,
): RuntimeProviderFactory {
  return (options) => ({
    async composeContext() { return { systemPrompt: "fixture" }; },
    async bindRole() {
      registerControlledDisplayProfile(options);
      const queue = createEventQueue<SessionEvent>();
      const session: RoleSession = {
        contextSource: "in-memory",
        async prompt() {
          await run(options, session);
          queue.push({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
        },
        events: () => queue.stream,
        async dispose() { queue.close(); },
      };
      return session;
    },
  });
}

/** 真实短命后台进程的启动命令：先写标记再挂起，供 read 转发验证。 */
function backgroundCommand(marker: string): string {
  const code = `process.stdout.write('${marker}'); setInterval(() => {}, 1000);`;
  return `"${process.execPath}" -e ${JSON.stringify(code)}`;
}

test("无管理器：list 为空、read 未找到、stop 明确失败且不抛（含判断会话）", async () => {
  const root = await temp();
  const sessions: RoleSession[] = [];
  try {
    const plain = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, script: [] }).bindRole(role());
    sessions.push(plain);
    assert.equal(typeof plain.listBackgroundTasks, "function");
    assert.deepEqual(plain.listBackgroundTasks!(), []);
    assert.equal(plain.readBackgroundTask!("bg-1"), undefined);
    const failed = await plain.stopBackgroundTask!("bg-1");
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.reason, "closed");
      assert.match(failed.message, /后台任务/);
      assert.equal(failed.task, undefined);
    }

    // 判断会话即使注入了 ShellGate 也不创建管理器（与四工具注册条件同源）。
    const judge = await createRuntimeAdapter({
      runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: allowShellGate,
      shellJudge: { projectRoot: root, report() {}, stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false } },
      providerFactories: { codex: toolsProvider(() => {}) },
    }).bindRole(role("judge"));
    sessions.push(judge);
    assert.deepEqual(judge.listBackgroundTasks!(), []);
    assert.equal(judge.readBackgroundTask!("bg-1"), undefined);
    const judgeStop = await judge.stopBackgroundTask!("bg-1");
    assert.equal(judgeStop.ok, false);
    if (!judgeStop.ok) assert.equal(judgeStop.reason, "closed");
  } finally {
    for (const session of sessions) await session.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("有管理器：list/read/stop 与选项转调当前会话管理器", async () => {
  const root = await temp();
  const marker = "bg-access-marker";
  let session: RoleSession | undefined;
  try {
    session = await createRuntimeAdapter({
      runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, shellGate: allowShellGate,
      script: [{ name: "start_background_task", args: { command: backgroundCommand(marker) } }],
    }).bindRole(role());
    await session.prompt("start background task");

    const listed = session.listBackgroundTasks!();
    assert.equal(listed.length, 1);
    const task = listed[0]!;
    assert.equal(task.state, "running");
    assert.equal(task.command, backgroundCommand(marker));
    assert.equal(typeof task.pid, "number");

    await waitUntil(() => session!.readBackgroundTask!(task.taskId, { stream: "stdout" })?.stdout?.text.includes(marker) === true, boundMs);

    const defaultRead = session.readBackgroundTask!(task.taskId);
    assert.ok(defaultRead);
    assert.equal(defaultRead.tailLines, 40);
    assert.equal(defaultRead.tailClamped, false);
    assert.ok(defaultRead.stdout);
    assert.ok(defaultRead.stderr);

    const read = session.readBackgroundTask!(task.taskId, { stream: "stdout", tailLines: 5 });
    assert.ok(read);
    assert.equal(read.tailLines, 5);
    assert.equal(read.tailClamped, false);
    assert.ok(read.stdout?.text.includes(marker));
    assert.equal(read.stderr, undefined);

    const clamped = session.readBackgroundTask!(task.taskId, { stream: "stderr", tailLines: 999 });
    assert.ok(clamped);
    assert.equal(clamped.tailLines, 200);
    assert.equal(clamped.tailClamped, true);
    assert.equal(clamped.stdout, undefined);
    assert.ok(clamped.stderr);

    assert.equal(session.readBackgroundTask!("bg-404"), undefined);
    const unknown = await session.stopBackgroundTask!("bg-404");
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.reason, "unknown-task");

    const stopped = await session.stopBackgroundTask!(task.taskId, { force: true });
    assert.equal(stopped.ok, true);
    if (stopped.ok) {
      assert.equal(stopped.alreadyEnded, false);
      assert.equal(stopped.task.taskId, task.taskId);
      assert.equal(stopped.task.state, "stopped");
    }
    const after = session.listBackgroundTasks!();
    assert.equal(after.length, 1);
    assert.equal(after[0]!.state, "stopped");

    const again = await session.stopBackgroundTask!(task.taskId);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.alreadyEnded, true);
  } finally {
    await session?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("dispose 后：运行中任务终止，list/read/stop 明确失效且不复活管理器", async () => {
  const root = await temp();
  let pid: number | undefined;
  let session: RoleSession | undefined;
  try {
    const factory = toolsProvider(async (options) => {
      const start = options.tools.find((tool) => tool.name === "start_background_task");
      assert.ok(start);
      const result = await start.handler({ name: start.name, args: { command: backgroundCommand("bg-dispose-marker") } });
      assert.equal(result.ok, true);
      pid = result.backgroundTask?.pid;
    });
    session = await createRuntimeAdapter({
      runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: allowShellGate,
      providerFactories: { codex: factory },
    }).bindRole(role());
    await session.prompt("start background task");

    assert.equal(typeof pid, "number");
    const taskId = session.listBackgroundTasks!()[0]?.taskId;
    assert.ok(taskId);
    assert.equal(isAlive(pid!), true);

    await session.dispose();
    await waitUntil(() => !isAlive(pid!), boundMs);

    assert.deepEqual(session.listBackgroundTasks!(), []);
    assert.equal(session.readBackgroundTask!(taskId!), undefined);
    const stopped = await session.stopBackgroundTask!(taskId!);
    assert.equal(stopped.ok, false);
    if (!stopped.ok) {
      assert.equal(stopped.reason, "closed");
      assert.equal(stopped.task, undefined);
    }

    // 再次调用仍是关闭语义：不抛错，也不因调用而重建管理器/复活任务。
    assert.deepEqual(session.listBackgroundTasks!(), []);
    assert.equal(session.readBackgroundTask!(taskId!), undefined);
    assert.equal((await session.stopBackgroundTask!(taskId!)).ok, false);
  } finally {
    await session?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
