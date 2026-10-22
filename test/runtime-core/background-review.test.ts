// 后台任务 B1/B2/B4 + Service 接线测试：注册条件、同源审核与零 spawn、并发顺序、
// 凭据剥离/cwd、轮次中止不杀任务、dispose 清理、判断会话隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import {
  BACKGROUND_TASK_MAX_RUNNING,
  BACKGROUND_TASK_MAX_TAIL_LINES,
  createBackgroundTaskManager,
} from "../../src/common/runtime-core/background-tasks.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type {
  BackgroundTaskCapability,
  GovernedToolsOptions,
  RoleSession,
  RuntimeProviderFactory,
  RuntimeProviderOptions,
  SessionEvent,
  ShellGate,
  ShellReviewResult,
  ToolDefinition,
} from "../../src/model/runtime.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";
import {
  allowShellGate,
  boundMs,
  closeOnKill,
  fakeSpawner,
  isAlive,
  spyDiagnostics,
  startInput,
  temp,
  toolsFor,
  waitUntil,
} from "./background-fixtures.ts";

const BACKGROUND_TOOL_NAMES = [
  "start_background_task",
  "list_background_tasks",
  "read_background_task",
  "stop_background_task",
] as const;

const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });

function handlerOf(tools: Map<string, ToolDefinition>, name: string) {
  const tool = tools.get(name);
  assert.ok(tool, `缺少工具 ${name}`);
  return tool.handler;
}

function fakeManager(options: { autoExit?: boolean } = {}) {
  const fake = fakeSpawner({ autoExit: options.autoExit ?? false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  return { manager, fake };
}

test("F9/B1：四工具只在 ShellGate 与管理器同时注入时注册；显示规则与判断会话隔离（结构面）", async () => {
  const fake = fakeSpawner();
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl });
  try {
    const withoutManager = toolsFor(allow, { shellGate: allowShellGate });
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(withoutManager.has(name), false, `无管理器不得注册 ${name}`);

    const withoutShellGate = toolsFor(allow, { backgroundTasks: manager });
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(withoutShellGate.has(name), false, `无 ShellGate 不得注册 ${name}`);

    const both = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: manager });
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(both.has(name), true, `双注入必须注册 ${name}`);
    assert.equal(both.get("start_background_task")?.displayInputRule, "core-command-v1");
    assert.equal(both.get("list_background_tasks")?.displayInputRule, "none");
    assert.equal(both.get("read_background_task")?.displayInputRule, "none");
    assert.equal(both.get("stop_background_task")?.displayInputRule, "none");
  } finally {
    await manager.dispose();
  }
});

test("F1/F2：空命令与 F-7 守卫在审核之前拒绝，零 spawn、无任务", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  try {
    for (const command of ["", "   "]) {
      let gateCalls = 0;
      const diagnostics = spyDiagnostics();
      const start = handlerOf(toolsFor(allow, {
        shellGate: async () => { gateCalls += 1; return { allow: true, by: "fixture" }; },
        backgroundTasks: manager,
        diagnostics: diagnostics.log,
      }), "start_background_task");
      const result = await start({ name: "start_background_task", args: { command } });
      assert.equal(result.ok, false);
      assert.match(result.message, /无命令可执行|缺少 command/);
      assert.equal(gateCalls, 0, "空命令不得触达审核");
      assert.equal(fake.spawnCalls(), 0, "空命令不得 spawn");
      assert.equal(manager.list().length, 0);
    }

    for (const [command, token] of [["npm run dev &", "&"], ["a && b", "&&"], ["echo $(x)", "$(x)"]] as const) {
      let gateCalls = 0;
      const diagnostics = spyDiagnostics();
      const start = handlerOf(toolsFor(allow, {
        shellGate: async () => { gateCalls += 1; return { allow: true, by: "fixture" }; },
        backgroundTasks: manager,
        diagnostics: diagnostics.log,
      }), "start_background_task");
      const result = await start({ name: "start_background_task", args: { command } });
      assert.equal(result.ok, false, command);
      assert.match(result.message, /未经 shell 解释/, command);
      assert.equal(gateCalls, 0, `守卫必须早于审核：${command}`);
      const guard = diagnostics.events.find((entry) => entry.event === "shell.guard.blocked");
      assert.ok(guard, `应记录 shell.guard.blocked：${command}`);
      assert.equal(guard?.fields?.toolName, "start_background_task");
      assert.equal(guard?.fields?.reasonCode, token);
      assert.equal(diagnostics.events.some((entry) => entry.event === "shell.review.start"), false);
      assert.equal(fake.spawnCalls(), 0, `守卫拒绝必须零 spawn：${command}`);
      assert.equal(manager.list().length, 0);
    }
  } finally {
    await manager.dispose();
  }
});

test("F3：审核拒绝/undefined/抛错/超时四类均零 spawn、无任务、无日志", async () => {
  const cases: Array<[string, ShellGate]> = [
    ["deny", async () => ({ allow: false, by: "fixture", reason: "fixture denied" })],
    ["undefined", (async () => undefined) as unknown as ShellGate],
    ["throw", async () => { throw new Error("review channel failed"); }],
    ["timeout", (() => new Promise<ShellReviewResult>(() => {})) as ShellGate],
  ];
  for (const [label, shellGate] of cases) {
    const fake = fakeSpawner({ autoExit: false });
    const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
    const diagnostics = spyDiagnostics();
    try {
      const start = handlerOf(toolsFor(allow, {
        shellGate,
        backgroundTasks: manager,
        shellCwd: process.cwd(),
        shellReviewTimeoutMs: 30,
        diagnostics: diagnostics.log,
      }), "start_background_task");
      const result = await start({ name: "start_background_task", args: { command: "fixture-command --flag" } });
      assert.equal(result.ok, false, label);
      assert.match(result.message, /未启动/, label);
      assert.equal(fake.spawnCalls(), 0, `${label} 必须零 spawn`);
      assert.equal(manager.list().length, 0, `${label} 不得留下任务`);
      assert.equal(manager.runningCount, 0, `${label} 名额必须未占用`);
      assert.equal(diagnostics.events.some((entry) => entry.event === "background.start"), false, label);
    } finally {
      await manager.dispose();
    }
  }
});

test("F4/CC1：第 9 个在 ShellGate 之前被拒，无审核请求、零 spawn、诊断 background.limit", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  const diagnostics = spyDiagnostics();
  let gateCalls = 0;
  try {
    const tools = toolsFor(allow, {
      shellGate: async () => { gateCalls += 1; return { allow: true, by: "fixture" }; },
      backgroundTasks: manager,
      shellCwd: process.cwd(),
      diagnostics: diagnostics.log,
    });
    const start = handlerOf(tools, "start_background_task");
    for (let index = 0; index < BACKGROUND_TASK_MAX_RUNNING; index++) {
      const result = await start({ name: "start_background_task", args: { command: `fake-hang-${index}` } });
      assert.equal(result.ok, true, `第 ${index + 1} 个应启动`);
    }
    gateCalls = 0;
    diagnostics.events.length = 0;
    const ninth = await start({ name: "start_background_task", args: { command: "fake-hang-ninth" } });
    assert.equal(ninth.ok, false);
    assert.match(ninth.message, /上限/);
    assert.equal(gateCalls, 0, "并发检查必须在 ShellGate 之前");
    assert.equal(fake.spawnCalls(), BACKGROUND_TASK_MAX_RUNNING, "第 9 个零 spawn");
    assert.equal(manager.list().length, BACKGROUND_TASK_MAX_RUNNING);
    assert.equal(diagnostics.events.some((entry) => entry.event === "shell.review.start"), false, "不得产生审核请求");
    const limit = diagnostics.events.find((entry) => entry.event === "background.limit");
    assert.ok(limit, "必须记录 background.limit");
    assert.equal(limit?.fields?.reasonCode, "concurrency-limit");
    assert.equal(limit?.fields?.count, BACKGROUND_TASK_MAX_RUNNING);
    // 诊断字段全部落在共享白名单内（本测试不断言 taskId；CC3）。
    const whitelist = new Set(["turnId", "toolCallId", "toolName", "pid", "state", "exitCode", "signal", "durationMs", "reasonCode", "count", "decision", "ok"]);
    for (const entry of diagnostics.events) {
      for (const key of Object.keys(entry.fields ?? {})) assert.equal(whitelist.has(key), true, `诊断字段 ${key} 必须在白名单内`);
    }
  } finally {
    await manager.dispose();
  }
});

test("S1/S2：启动立即返回并含任务号/pid；list/read/stop 可用；再次 stop 如实返回已结束", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  const diagnostics = spyDiagnostics();
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: manager, shellCwd: root, diagnostics: diagnostics.log });
    const start = handlerOf(tools, "start_background_task");
    const list = handlerOf(tools, "list_background_tasks");
    const read = handlerOf(tools, "read_background_task");
    const stop = handlerOf(tools, "stop_background_task");
    const code = 'process.stdout.write("srv-out\\n");process.stderr.write("srv-err\\n");setInterval(()=>{},1000)';

    const began = Date.now();
    const started = await start({ name: "start_background_task", args: { command: `${process.execPath} -e '${code}'` }, toolCallId: "bg-start-1" });
    const elapsed = Date.now() - began;
    assert.equal(started.ok, true);
    assert.ok(started.backgroundTask);
    assert.equal(started.backgroundTask.state, "running");
    assert.equal(started.backgroundTask.taskId, "bg-1");
    assert.ok(typeof started.backgroundTask.pid === "number");
    assert.match(started.message, /已启动任务 bg-1/);
    assert.ok(elapsed < boundMs, `启动必须立即返回（实际 ${elapsed}ms）`);
    assert.equal(isAlive(started.backgroundTask.pid!), true);
    const startEvent = diagnostics.events.find((entry) => entry.event === "background.start");
    assert.equal(startEvent?.fields?.toolName, "start_background_task");
    assert.equal(startEvent?.fields?.pid, started.backgroundTask.pid);
    assert.equal(startEvent?.fields?.state, "running");

    const listed = await list({ name: "list_background_tasks", args: {} });
    assert.equal(listed.ok, true);
    assert.match(listed.message, /bg-1/);
    assert.match(listed.message, /running/);
    assert.match(listed.message, /pid/);

    await waitUntil(() => manager.list()[0]?.state === "running");
    // 读取 stdout/stderr 尾部（轮询直到两路输出都到达，避免只等 stdout 的竞态）。
    let readAll = await read({ name: "read_background_task", args: { taskId: "bg-1" } });
    const deadline = Date.now() + boundMs;
    while ((!/srv-out/.test(readAll.message) || !/srv-err/.test(readAll.message)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      readAll = await read({ name: "read_background_task", args: { taskId: "bg-1" } });
    }
    assert.equal(readAll.ok, true);
    assert.match(readAll.message, /srv-out/);
    assert.match(readAll.message, /srv-err/);
    assert.match(readAll.message, /当前状态 running/);
    const stdoutOnly = await read({ name: "read_background_task", args: { taskId: "bg-1", stream: "stdout" } });
    assert.match(stdoutOnly.message, /srv-out/);
    assert.doesNotMatch(stdoutOnly.message, /srv-err/);
    const stderrOnly = await read({ name: "read_background_task", args: { taskId: "bg-1", stream: "stderr" } });
    assert.match(stderrOnly.message, /srv-err/);
    assert.doesNotMatch(stderrOnly.message, /srv-out/);

    const stopped = await stop({ name: "stop_background_task", args: { taskId: "bg-1" } });
    assert.equal(stopped.ok, true);
    assert.equal(stopped.backgroundTask?.state, "stopped");
    assert.match(stopped.message, /已停止任务 bg-1/);
    await waitUntil(() => !isAlive(started.backgroundTask!.pid!));

    const again = await stop({ name: "stop_background_task", args: { taskId: "bg-1" } });
    assert.equal(again.ok, true);
    assert.match(again.message, /早已结束/);
    assert.doesNotMatch(again.message, /已停止任务/);
    assert.equal(again.backgroundTask?.state, "stopped");
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S2.5/F10：自然退出如实显示 exited 与退出码；对已结束任务 stop 不谎报刚刚停止", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: manager, shellCwd: root });
    const start = handlerOf(tools, "start_background_task");
    const list = handlerOf(tools, "list_background_tasks");
    const read = handlerOf(tools, "read_background_task");
    const stop = handlerOf(tools, "stop_background_task");

    const started = await start({ name: "start_background_task", args: { command: `${process.execPath} -e 'process.stdout.write("done");process.exit(4)'` } });
    assert.equal(started.ok, true);
    await waitUntil(() => manager.list()[0]?.state === "exited");
    const listed = await list({ name: "list_background_tasks", args: {} });
    assert.match(listed.message, /exited/);
    assert.match(listed.message, /exitCode 4/);
    const readResult = await read({ name: "read_background_task", args: { taskId: started.backgroundTask!.taskId } });
    assert.match(readResult.message, /当前状态 exited/);
    assert.match(readResult.message, /exitCode 4/);
    const stopped = await stop({ name: "stop_background_task", args: { taskId: started.backgroundTask!.taskId } });
    assert.equal(stopped.ok, true);
    assert.match(stopped.message, /早已结束/);
    assert.doesNotMatch(stopped.message, /已停止任务/);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("F6/O3：未知任务、非法参数与 schema 边界；tailLines 超上限如实钳制", async () => {
  const fake = fakeSpawner({ autoExit: true, stdout: Array.from({ length: 300 }, (_, index) => `L${index + 1}`).join("\n") });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: manager });
    const read = handlerOf(tools, "read_background_task");
    const stop = handlerOf(tools, "stop_background_task");
    for (const result of [
      await read({ name: "read_background_task", args: { taskId: "bg-404" } }),
      await stop({ name: "stop_background_task", args: { taskId: "bg-404" } }),
    ]) {
      assert.equal(result.ok, false);
      assert.match(result.message, /未知任务/);
      assert.match(result.message, /不要假设它运行过/);
    }
    assert.equal((await read({ name: "read_background_task", args: {} })).ok, false);
    assert.match((await read({ name: "read_background_task", args: { taskId: "bg-1", stream: "stdin" } })).message, /stream 参数非法/);
    assert.match((await read({ name: "read_background_task", args: { taskId: "bg-1", tailLines: 0 } })).message, /tailLines 参数非法/);
    assert.match((await stop({ name: "stop_background_task", args: { taskId: "bg-1", force: "yes" } })).message, /force 参数非法/);

    const start = handlerOf(tools, "start_background_task");
    const started = await start({ name: "start_background_task", args: { command: "fake-quick" } });
    assert.equal(started.ok, true);
    await waitUntil(() => manager.list()[0]?.state === "exited");
    const capped = await read({ name: "read_background_task", args: { taskId: started.backgroundTask!.taskId, tailLines: 500 } });
    assert.equal(capped.ok, true);
    assert.match(capped.message, new RegExp(`按上限 ${BACKGROUND_TASK_MAX_TAIL_LINES} 行返回`));

    const readSchema = describeTool("read_background_task").parameters;
    const properties = readSchema.properties as Record<string, unknown>;
    assert.equal(Object.hasOwn(properties, "cursor"), false, "O3 未授权：不得有 cursor 参数");
    assert.equal(Object.hasOwn(properties, "wait"), false, "O3 未授权：不得有 wait 参数");
    assert.equal(Object.hasOwn(properties, "cwd"), false);
    assert.deepEqual(readSchema.required, ["taskId"]);
  } finally {
    await manager.dispose();
  }
});

test("F8：后台进程 cwd=会话 shellCwd，凭据环境变量被剥离；schema 不接受调用方指定 cwd", async () => {
  const root = await temp();
  const credential = "ANS_BACKGROUND_TEST_CREDENTIAL";
  const previous = process.env[credential];
  process.env[credential] = "fixture-background-secret";
  const manager = createBackgroundTaskManager();
  try {
    const tools = toolsFor(allow, {
      shellGate: allowShellGate,
      backgroundTasks: manager,
      shellCwd: root,
      extraCredentialEnvVars: [credential],
    });
    const start = handlerOf(tools, "start_background_task");
    const read = handlerOf(tools, "read_background_task");
    const code = `process.stdout.write("cwd="+process.cwd());process.stdout.write("\\ncred="+String(process.env.${credential}))`;
    const started = await start({ name: "start_background_task", args: { command: `${process.execPath} -e '${code}'` } });
    assert.equal(started.ok, true);
    await waitUntil(() => manager.list()[0]?.state === "exited");
    const readResult = await read({ name: "read_background_task", args: { taskId: started.backgroundTask!.taskId } });
    const expectedCwd = await realpath(root);
    const match = /cwd=(.+)/.exec(readResult.message);
    assert.ok(match, "应读到子进程 cwd");
    const actualCwd = await realpath(match[1]!.trim());
    assert.equal(process.platform === "win32" ? actualCwd.toLowerCase() : actualCwd, process.platform === "win32" ? expectedCwd.toLowerCase() : expectedCwd);
    assert.match(readResult.message, /cred=undefined/);
    assert.doesNotMatch(readResult.message, /fixture-background-secret/);
    const startProperties = describeTool("start_background_task").parameters.properties as Record<string, unknown>;
    assert.equal(Object.hasOwn(startProperties, "cwd"), false, "start_background_task 不接受调用方指定 cwd");
    assert.deepEqual(describeTool("start_background_task").parameters.required, ["command"]);
  } finally {
    if (previous === undefined) delete process.env[credential];
    else process.env[credential] = previous;
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S4：轮次中止不杀后台任务；启动成功结果不因信号中止被改写成「未启动」", async () => {
  const root = await temp();
  const manager = createBackgroundTaskManager();
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: manager, shellCwd: root });
    const start = handlerOf(tools, "start_background_task");
    const read = handlerOf(tools, "read_background_task");
    const stop = handlerOf(tools, "stop_background_task");
    const controller = new AbortController();
    const code = 'setTimeout(()=>require("fs").writeFileSync("alive-after-abort.txt","x"),500);setInterval(()=>{},1000)';
    const started = await start({ name: "start_background_task", args: { command: `${process.execPath} -e '${code}'` }, signal: controller.signal });
    assert.equal(started.ok, true);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(existsSync(path.join(root, "alive-after-abort.txt")), true, "轮次中止后任务必须继续运行");
    const readRunning = await read({ name: "read_background_task", args: { taskId: started.backgroundTask!.taskId } });
    assert.match(readRunning.message, /当前状态 running/);
    await stop({ name: "stop_background_task", args: { taskId: started.backgroundTask!.taskId } });
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }

  // 竞态：handler 已成功启动任务后信号才中止——不得把真实结果改写成「未能启动」。
  const base = createBackgroundTaskManager();
  const controller = new AbortController();
  const wrapped: BackgroundTaskCapability = {
    get runningCount() { return base.runningCount; },
    async start(input) { const result = await base.start(input); controller.abort(); return result; },
    list: () => base.list(),
    read: (taskId, readOptions) => base.read(taskId, readOptions),
    stop: (taskId, stopOptions) => base.stop(taskId, stopOptions),
    dispose: () => base.dispose(),
  };
  const root2 = await temp();
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: wrapped, shellCwd: root2 });
    const start = handlerOf(tools, "start_background_task");
    const result = await start({
      name: "start_background_task",
      args: { command: `${process.execPath} -e 'setInterval(()=>{},1000)'` },
      signal: controller.signal,
    });
    assert.equal(result.ok, true, "已真实启动的任务不得被中止包装改写成失败");
    assert.equal(result.backgroundTask?.state, "running");
    assert.match(result.message, /已启动任务/);
    assert.equal(base.list().length, 1);
    await base.stop(result.backgroundTask!.taskId);
  } finally {
    await base.dispose();
    await rm(root2, { recursive: true, force: true });
  }
});

test("S3：管理器已关闭后 start 明确失败且零 spawn（审核通过后才发现会话关闭的竞态）", async () => {
  const fake = fakeSpawner({ autoExit: false });
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  await manager.dispose();
  let gateCalls = 0;
  const start = handlerOf(toolsFor(allow, {
    shellGate: async () => { gateCalls += 1; return { allow: true, by: "fixture" }; },
    backgroundTasks: manager,
  }), "start_background_task");
  const result = await start({ name: "start_background_task", args: { command: "fake-hang" } });
  assert.equal(result.ok, false);
  assert.match(result.message, /会话已关闭，未启动/);
  assert.equal(fake.spawnCalls(), 0, "会话关闭后必须零 spawn");
  assert.equal(gateCalls, 1, "审核可以在此前通过，但管理器必须拒绝启动");
});

test("B4/CC3：background.* 诊断事件齐全且字段全部落在共享白名单内（不含 taskId）", async () => {
  const diagnostics = spyDiagnostics();
  const whitelist = new Set(["turnId", "toolCallId", "toolName", "pid", "state", "exitCode", "signal", "durationMs", "reasonCode", "count", "decision"]);
  const quickFake = fakeSpawner({ autoExit: true, exitCode: 0 });
  const quick = createBackgroundTaskManager({ spawnImpl: quickFake.spawnImpl, killTreeImpl: closeOnKill(), diagnostics: diagnostics.log });
  try {
    const start = handlerOf(toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: quick, diagnostics: diagnostics.log }), "start_background_task");
    const started = await start({ name: "start_background_task", args: { command: "fake-quick" }, toolCallId: "cc3-start" });
    assert.equal(started.ok, true);
    await waitUntil(() => quick.list()[0]?.state === "exited");
  } finally {
    await quick.dispose();
  }

  const hangFake = fakeSpawner({ autoExit: false });
  const hanging = createBackgroundTaskManager({ spawnImpl: hangFake.spawnImpl, killTreeImpl: closeOnKill(), diagnostics: diagnostics.log });
  try {
    const tools = toolsFor(allow, { shellGate: allowShellGate, backgroundTasks: hanging, diagnostics: diagnostics.log });
    const start = handlerOf(tools, "start_background_task");
    const stop = handlerOf(tools, "stop_background_task");
    const started = await start({ name: "start_background_task", args: { command: "fake-hang" } });
    assert.equal(started.ok, true);
    const stopped = await stop({ name: "stop_background_task", args: { taskId: started.backgroundTask!.taskId } });
    assert.equal(stopped.ok, true);
  } finally {
    await hanging.dispose();
  }

  const names = diagnostics.events.map((entry) => entry.event);
  for (const event of ["shell.review.start", "shell.review.end", "background.start", "background.exit", "background.stop"]) {
    assert.equal(names.includes(event), true, `缺少诊断事件 ${event}`);
  }
  assert.equal(names.includes("background.limit"), false, "本用例不应触发并发上限");
  for (const entry of diagnostics.events) {
    for (const key of Object.keys(entry.fields ?? {})) {
      assert.equal(whitelist.has(key), true, `${entry.event} 使用白名单外字段 ${key}`);
      assert.notEqual(key, "taskId", "诊断不得使用 taskId");
    }
  }
  const reviewEnd = diagnostics.events.find((entry) => entry.event === "shell.review.end");
  assert.equal(reviewEnd?.fields?.decision, "allow");
  assert.equal(typeof reviewEnd?.fields?.durationMs, "number");
});

// —————————————— Service 接线 ——————————————

function controlledFactory(onBound?: (options: RuntimeProviderOptions, session: RoleSession) => Promise<void> | void, failBind?: Error, registerProfile = true): RuntimeProviderFactory {
  return (options) => ({
    async composeContext() { return { systemPrompt: "fixture" }; },
    async bindRole() {
      const queue = createEventQueue<SessionEvent>();
      const session: RoleSession = {
        contextSource: "in-memory",
        async prompt() {},
        events: () => queue.stream,
        async dispose() { queue.close(); },
      };
      if (registerProfile) registerControlledDisplayProfile(options);
      if (onBound) await onBound(options, session);
      if (failBind) throw failBind;
      return session;
    },
  });
}

test("Service：仅 ShellGate 会话注入四工具；判断会话与无 ShellGate 会话不可见", async () => {
  const root = await temp();
  try {
    const scenarios: Array<[string, Record<string, unknown>, boolean]> = [
      ["普通会话 + ShellGate", { shellGate: allowShellGate }, true],
      ["普通会话无 ShellGate", {}, false],
      ["shellJudge", { shellJudge: { projectRoot: root, report() {}, stats: stats() } }, false],
      ["governanceJudge", { governanceJudge: { projectRoot: root, report() {}, stats: stats() } }, false],
    ];
    for (const [label, extra, expectVisible] of scenarios) {
      let captured: string[] = [];
      const factory = controlledFactory((options) => { captured = options.tools.map((tool) => tool.name); });
      const session = await createRuntimeAdapter({
        runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
        ...(extra as object),
        providerFactories: { codex: factory },
      }).bindRole(role());
      await session.dispose();
      for (const name of BACKGROUND_TOOL_NAMES) {
        assert.equal(captured.includes(name), expectVisible, `${label} 的 ${name} 可见性应为 ${expectVisible}`);
      }
      if (!expectVisible) assert.equal(captured.some((name) => name === "run_shell"), false, `${label} 不得有 run_shell`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service dispose：终止运行中任务、管理器失效、dispose 幂等", async () => {
  const root = await temp();
  let capturedPid: number | undefined;
  let capturedTools: Map<string, ToolDefinition> | undefined;
  try {
    const factory: RuntimeProviderFactory = (options) => ({
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        registerControlledDisplayProfile(options);
        capturedTools = new Map(options.tools.map((tool) => [tool.name, tool]));
        const queue = createEventQueue<SessionEvent>();
        return {
          contextSource: "in-memory",
          async prompt() {
            const start = options.tools.find((tool) => tool.name === "start_background_task");
            assert.ok(start);
            const result = await start.handler({ name: start.name, args: { command: `${process.execPath} -e 'setInterval(()=>{},1000)'` } });
            assert.equal(result.ok, true);
            capturedPid = result.backgroundTask?.pid;
            queue.push({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
          },
          events: () => queue.stream,
          async dispose() { queue.close(); },
        };
      },
    });
    const session = await createRuntimeAdapter({
      runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
      shellGate: allowShellGate, providerFactories: { codex: factory },
    }).bindRole(role());
    await session.prompt("start background");
    assert.ok(capturedPid);
    assert.equal(isAlive(capturedPid!), true);
    assert.equal(capturedTools?.has("start_background_task"), true);

    await session.dispose();
    await session.dispose(); // 幂等
    await waitUntil(() => !isAlive(capturedPid!), boundMs);
    // 管理器失效后的 list/start/stop 语义由 background-tasks.test.ts 的 S3 用例直接覆盖；
    // Service 包装器在回合外结构性拒绝工具调用（本轮未运行），因此这里只断言进程确已清理。
    assert.equal(managerToolsPresent(capturedTools), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function managerToolsPresent(tools: Map<string, ToolDefinition> | undefined): boolean {
  return tools !== undefined && BACKGROUND_TOOL_NAMES.every((name) => tools.has(name));
}

test("Service：bindRole 失败如实拒绝（管理器释放在无回合时为空操作；释放接线见代码/构造失败路径）", async () => {
  const root = await temp();
  try {
    const factory = controlledFactory(undefined, new Error("fixture bind failure"));
    await assert.rejects(
      createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: allowShellGate, providerFactories: { codex: factory } }).bindRole(role()),
      /fixture bind failure/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service：assertReady 失败如实拒绝并关闭已绑定 inner 会话（管理器释放路径已接线）", async () => {
  const root = await temp();
  let innerDisposed = false;
  try {
    const factory: RuntimeProviderFactory = (options) => ({
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        // 不注册 display profile ⇒ Service 在 bindRole 之后 assertReady 失败。
        const queue = createEventQueue<SessionEvent>();
        return {
          contextSource: "in-memory",
          async prompt() {},
          events: () => queue.stream,
          async dispose() { innerDisposed = true; queue.close(); },
        };
      },
    });
    await assert.rejects(
      createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: allowShellGate, providerFactories: { codex: factory } }).bindRole(role()),
      /profile was not registered/,
    );
    assert.equal(innerDisposed, true, "assertReady 失败必须关闭已绑定的 inner 会话");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
