// 测试角色跨角色/真实入口验证：会话级后台任务 B1–B4（2026-10-22）。
//
// 路径：真实 Pipeline `openRoleSession` → 真实 Service `createRuntimeAdapter`（管理器创建、工具注册、
// 回合包装、dispose 接线）→ 替身 RuntimeAdapter（引擎）与真实只读档 ShellGate/判断会话构造。
// 不使用真实模型/API key；断言只基于当前候选实际运行结果。
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { openRoleSession, createRuntimeAdapterFactory } from "../../../src/pipeline/orchestration/run-role.ts";
import { createShellJudge } from "../../../src/common/编排/shell-judge.ts";
import { createRuntimeAdapter } from "../../../src/service/runtime/session.ts";
import { defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import type { ClassifyShellFn } from "../../../src/common/编排/shell-gate.ts";
import type { DiagnosticLog, ToolResult, WriteGate } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import {
  boundMs,
  callTool,
  createCapturingFactory as createHarness,
  diagnosticSpy,
  isAlive,
  makeTempProject as makeProject,
  nodeCommand,
  waitUntil,
  type TurnScript,
} from "./fixture.ts";

const BACKGROUND_TOOLS = [
  "start_background_task",
  "list_background_tasks",
  "read_background_task",
  "stop_background_task",
] as const;

async function openX(options: {
  scripts: TurnScript[];
  classify?: ClassifyShellFn;
  diagnostics?: DiagnosticLog;
  extraCredentialEnvVars?: string[];
}) {
  const temp = makeProject();
  const harness = createHarness(options.scripts);
  const audit = createMemoryAuditSink();
  const handle = await openRoleSession(
    {
      roleId: "X",
      runtime: "codex",
      project: temp.project,
      persistSession: false,
      ...(options.classify !== undefined
        ? {
            shellReadonly: {
              classifyShell: options.classify,
              rules: defaultShellRules(),
              auditSink: audit,
              timeoutMs: 5000,
            },
          }
        : {}),
    },
    {
      runtimeOptions: {
        providerFactories: { codex: harness.factory },
        persistSession: false,
        ...(options.diagnostics !== undefined ? { diagnostics: options.diagnostics } : {}),
        ...(options.extraCredentialEnvVars !== undefined
          ? { extraCredentialEnvVars: options.extraCredentialEnvVars }
          : {}),
      },
    },
  );
  return { temp, harness, handle, audit };
}

const allowClassify: ClassifyShellFn = () => "allow";

test("B1/S1/S2/S4：openRoleSession 真实装配下四工具可启动→跨轮存活→list/read/stop（含 cwd/凭据同源）", async () => {
  const credential = "ANS_QA_BG_CREDENTIAL";
  const previousCredential = process.env[credential];
  process.env[credential] = "qa-background-secret";
  const seenArgv: string[][] = [];
  const classify: ClassifyShellFn = (argv) => {
    seenArgv.push([...argv]);
    return "allow";
  };
  const code =
    'process.stdout.write("ENTRY-OUT\\n");process.stderr.write("ENTRY-ERR\\n");' +
    'process.stdout.write("CWD="+process.cwd()+"\\n");' +
    'process.stdout.write("CRED="+String(process.env.ANS_QA_BG_CREDENTIAL)+"\\n");' +
    "setInterval(()=>{},1000)";
  let started: ToolResult | undefined;
  let readResult: ToolResult | undefined;
  let listResult: ToolResult | undefined;
  let stopResult: ToolResult | undefined;
  let secondStop: ToolResult | undefined;
  const session = await openX({
    classify,
    extraCredentialEnvVars: [credential],
    scripts: [
      async (ctx) => {
        started = await callTool(ctx.tools, "start_background_task", { command: nodeCommand(code) });
      },
      async (ctx) => {
        listResult = await callTool(ctx.tools, "list_background_tasks");
        const taskId = started?.backgroundTask?.taskId ?? "";
        const deadline = Date.now() + boundMs;
        readResult = await callTool(ctx.tools, "read_background_task", { taskId });
        while (
          (!/ENTRY-OUT/.test(readResult.message) || !/ENTRY-ERR/.test(readResult.message))
          && Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          readResult = await callTool(ctx.tools, "read_background_task", { taskId });
        }
        stopResult = await callTool(ctx.tools, "stop_background_task", { taskId });
        secondStop = await callTool(ctx.tools, "stop_background_task", { taskId });
      },
    ],
  });
  try {
    const toolDefs = session.harness.tools();
    assert.equal(toolDefs.get("start_background_task")?.displayInputRule, "core-command-v1");
    for (const name of ["list_background_tasks", "read_background_task", "stop_background_task"]) {
      assert.equal(toolDefs.get(name)?.displayInputRule, "none", `${name} 显示规则必须为 none`);
    }
    const startSchema = toolDefs.get("start_background_task")!.inputSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    assert.deepEqual(startSchema.required, ["command"]);
    assert.equal(Object.hasOwn(startSchema.properties, "cwd"), false, "start 不得接受调用方指定 cwd（O3 之外）");
    const readSchema = toolDefs.get("read_background_task")!.inputSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    assert.deepEqual(readSchema.required, ["taskId"]);
    assert.equal(Object.hasOwn(readSchema.properties, "cursor"), false, "O3 未授权：无 cursor");
    assert.equal(Object.hasOwn(readSchema.properties, "wait"), false, "O3 未授权：无 wait");

    const began = Date.now();
    await session.handle.send("第一轮：启动后台任务");
    const elapsed = Date.now() - began;
    assert.equal(started?.ok, true, `启动应成功：${started?.message}`);
    assert.ok(started.backgroundTask !== undefined, "成功结果必须携带结构化任务事实");
    assert.equal(started.backgroundTask.state, "running");
    assert.equal(started.backgroundTask.taskId, "bg-1");
    assert.ok(typeof started.backgroundTask.pid === "number" && started.backgroundTask.pid > 0);
    assert.match(started.message, /已启动任务 bg-1/);
    assert.ok(elapsed < boundMs, `启动必须立即返回（实际 ${elapsed}ms）`);
    const pid = started.backgroundTask.pid!;
    assert.equal(isAlive(pid), true, "回合结束时后台进程必须仍存活（轮次结束不杀任务）");

    // 真实只读档 ShellGate 的审核请求确实拿到 splitCommand 解析后的 argv（与 run_shell 同源）。
    assert.equal(seenArgv.length, 1, "每次启动必须恰好经过一次审核");
    assert.equal(seenArgv[0]![0], process.execPath, "argv[0] 必须是程序本身（不经 shell）");
    assert.equal(seenArgv[0]![1], "-e");

    await session.handle.send("第二轮：读取并停止");
    assert.equal(listResult?.ok, true);
    assert.match(listResult.message, /bg-1/);
    assert.match(listResult.message, /running/);
    assert.match(listResult.message, /pid/);
    assert.equal(readResult?.ok, true);
    assert.match(readResult.message, /ENTRY-OUT/);
    assert.match(readResult.message, /ENTRY-ERR/);
    assert.match(readResult.message, /当前状态 running/);
    const cwdMatch = /CWD=(.+)/.exec(readResult.message);
    assert.ok(cwdMatch, "应读到子进程 cwd");
    const actual = realpathSync(cwdMatch[1]!.trim());
    const expected = realpathSync(session.temp.root);
    assert.equal(
      process.platform === "win32" ? actual.toLowerCase() : actual,
      process.platform === "win32" ? expected.toLowerCase() : expected,
      "后台进程 cwd 必须等于会话 shellCwd（项目根）",
    );
    assert.match(readResult.message, /CRED=undefined/, "后台进程环境必须剥离凭据");
    assert.doesNotMatch(readResult.message, /qa-background-secret/);

    assert.equal(stopResult?.ok, true, `停止应成功：${stopResult?.message}`);
    assert.equal(stopResult.backgroundTask?.state, "stopped");
    assert.match(stopResult.message, /已停止任务 bg-1/);
    assert.equal(secondStop?.ok, true);
    assert.match(secondStop.message, /早已结束/, "重复 stop 必须如实返回已结束");
    assert.doesNotMatch(secondStop.message, /已停止任务/, "重复 stop 不得谎称刚刚停止");
    await waitUntil(() => !isAlive(pid));
  } finally {
    await session.handle.dispose();
    if (previousCredential === undefined) delete process.env[credential];
    else process.env[credential] = previousCredential;
    session.temp.cleanup();
  }
});

test("F9：无 ShellGate 的项目角色会话在真实装配中看不到四后台工具（也没有 run_shell）", async () => {
  const session = await openX({ scripts: [async () => {}] });
  try {
    const tools = session.harness.tools();
    for (const name of BACKGROUND_TOOLS) {
      assert.equal(tools.has(name), false, `未注入 ShellGate 不得注册 ${name}`);
    }
    assert.equal(tools.has("run_shell"), false, "未注入 ShellGate 也不应有 run_shell");
    assert.equal(tools.has("write_file"), true, "普通受治理工具应正常存在（对照）");
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("F9：shellJudge 判断会话（createShellJudge 真实构造路径）不含四后台工具", async () => {
  const temp = makeProject();
  const harness = createHarness([async () => {}]);
  try {
    const judge = createShellJudge({
      project: temp.project,
      runtime: "codex",
      createAdapter: createRuntimeAdapterFactory(temp.project, "codex", {
        persistSession: false,
        providerFactories: { codex: harness.factory },
      }),
      timeoutMs: 5000,
      concurrency: 1,
    });
    const outcome = await judge({
      command: "fixture-command --flag",
      argv: ["fixture-command", "--flag"],
      cwd: temp.root,
      toolCallId: "qa-judge-1",
      roleId: "X",
      projectRoot: temp.root,
      runtime: "codex",
      policy: "project",
      tier: "review",
      reason: "qa",
    });
    const tools = harness.tools();
    for (const name of BACKGROUND_TOOLS) {
      assert.equal(tools.has(name), false, `判断会话不得注册 ${name}`);
    }
    assert.equal(tools.has("judge_read_file"), true, "判断会话应有 judge_read_file（对照）");
    assert.equal(tools.has("judge_list_dir"), true);
    assert.equal(tools.has("report_shell_judgement"), true);
    assert.equal(tools.has("run_shell"), false);
    assert.equal(outcome.verdict, "manual", "未交回结论必须如实归 manual（不伪造 allow/deny）");
  } finally {
    temp.cleanup();
  }
});

test("F9：governanceJudge 判断会话（Service 装配）不含四后台工具", async () => {
  const root = makeProject();
  const harness = createHarness([async () => {}]);
  const allow: WriteGate = (target) => ({
    allowed: true,
    matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" },
  });
  try {
    const role: ResolvedRole = {
      id: "judge-check",
      kind: "project",
      cardText: "# judge-check",
      boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
      boundarySource: "fixture",
      location: { card: "fixture", boundary: "fixture" },
    };
    const session = await createRuntimeAdapter({
      runtime: "codex",
      gate: allow,
      projectRoot: root.root,
      skillRoot: root.root,
      governanceJudge: {
        projectRoot: root.root,
        report() {},
        stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false },
      },
      providerFactories: { codex: harness.factory },
      persistSession: false,
    }).bindRole(role);
    await session.dispose();
    const tools = harness.tools();
    for (const name of BACKGROUND_TOOLS) {
      assert.equal(tools.has(name), false, `治理判断会话不得注册 ${name}`);
    }
    assert.equal(tools.has("report_governance_judgement"), true, "治理判断会话应有 report_governance_judgement");
    assert.equal(tools.has("run_shell"), false);
  } finally {
    root.cleanup();
  }
});

test("F4/CC1：第 9 个并发启动在 ShellGate 之前被拒——分类器零调用、零 spawn、无任务", async () => {
  const diagnostics = diagnosticSpy();
  let classifyCalls = 0;
  const classify: ClassifyShellFn = () => {
    classifyCalls += 1;
    return "allow";
  };
  const starts: ToolResult[] = [];
  let ninth: ToolResult | undefined;
  let reviewStartsAtNinth = -1;
  let listedDuringTurn = -1;
  const hangCode = "setInterval(()=>{},1000)";
  const session = await openX({
    classify,
    diagnostics: diagnostics.log,
    scripts: [
      async (ctx) => {
        for (let index = 0; index < 8; index += 1) {
          starts.push(
            await callTool(ctx.tools, "start_background_task", {
              command: nodeCommand(hangCode),
            }),
          );
        }
        reviewStartsAtNinth = diagnostics.events.filter((entry) => entry.event === "shell.review.start").length;
        ninth = await callTool(ctx.tools, "start_background_task", {
          command: nodeCommand(hangCode),
        });
        const listed = await callTool(ctx.tools, "list_background_tasks");
        listedDuringTurn = (listed.message.match(/^- bg-/gm) ?? []).length;
      },
    ],
  });
  try {
    await session.handle.send("并发上限");
    assert.equal(starts.filter((result) => result.ok).length, 8, "前 8 个应全部启动");
    assert.equal(ninth?.ok, false, "第 9 个必须被拒");
    assert.match(ninth!.message, /上限/);
    assert.equal(classifyCalls, 8, "第 9 个必须在 ShellGate 之前被拒：分类器不得被第 9 次调用");
    assert.equal(reviewStartsAtNinth, 8, "前 8 个各有一次审核请求");
    assert.equal(
      diagnostics.events.filter((entry) => entry.event === "shell.review.start").length,
      8,
      "第 9 个不得产生任何审核请求",
    );
    const limit = diagnostics.events.find((entry) => entry.event === "background.limit");
    assert.ok(limit, "必须记录 background.limit");
    assert.equal(limit?.fields?.reasonCode, "concurrency-limit");
    assert.equal(limit?.fields?.count, 8);
    assert.equal(listedDuringTurn, 8, "任务数不得被第 9 个突破");
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("F2/F3：真实只读档 ShellGate 分类 deny ⇒ 未启动、哨兵文件未创建、无任务", async () => {
  const temp = makeProject();
  let captured: ToolResult | undefined;
  let listed: ToolResult | undefined;
  const harness = createHarness([
    async (ctx) => {
      captured = await callTool(ctx.tools, "start_background_task", {
        command: nodeCommand('require("fs").writeFileSync("denied-sentinel.txt","spawned")'),
      });
      listed = await callTool(ctx.tools, "list_background_tasks");
    },
  ]);
  let classifyCalls = 0;
  const diagnostics = diagnosticSpy();
  const handle = await openRoleSession(
    {
      roleId: "X",
      runtime: "codex",
      project: temp.project,
      persistSession: false,
      shellReadonly: {
        classifyShell: () => {
          classifyCalls += 1;
          return "deny";
        },
        rules: defaultShellRules(),
        auditSink: createMemoryAuditSink(),
        timeoutMs: 5000,
      },
    },
    {
      runtimeOptions: {
        providerFactories: { codex: harness.factory },
        persistSession: false,
        diagnostics: diagnostics.log,
      },
    },
  );
  try {
    await handle.send("拒绝分支");
    assert.equal(captured?.ok, false);
    assert.match(captured.message, /未启动/);
    assert.match(captured.message, /审核拒绝|未返回明确的允许/);
    assert.equal(classifyCalls, 1, "必须经过真实审核链一次");
    assert.equal(existsSync(path.join(temp.root, "denied-sentinel.txt")), false, "审核拒绝必须零 spawn");
    assert.equal(
      diagnostics.events.some((entry) => entry.event === "background.start"),
      false,
      "拒绝不得记录 background.start",
    );
    assert.equal(listed?.ok, true);
    assert.match(listed.message, /没有后台任务/);
  } finally {
    await handle.dispose();
    temp.cleanup();
  }
});

test("F6：未知任务号经真实入口 read/stop 均明确「未知任务」", async () => {
  let readResult: ToolResult | undefined;
  let stopResult: ToolResult | undefined;
  const session = await openX({
    classify: allowClassify,
    scripts: [
      async (ctx) => {
        readResult = await callTool(ctx.tools, "read_background_task", { taskId: "bg-404" });
        stopResult = await callTool(ctx.tools, "stop_background_task", { taskId: "bg-404" });
      },
    ],
  });
  try {
    await session.handle.send("未知任务");
    for (const result of [readResult, stopResult]) {
      assert.equal(result?.ok, false);
      assert.match(result.message, /未知任务/);
      assert.match(result.message, /不要假设它运行过/);
    }
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("S2.3：日志超过 256 KiB 时工具读取标 truncated，只保留尾部且不返回损坏的多字节字符", async () => {
  const code =
    'process.stdout.write("汉".repeat(90000));process.stdout.write("\\nTAIL-END\\n")';
  let readResult: ToolResult | undefined;
  const session = await openX({
    classify: allowClassify,
    scripts: [
      async (ctx) => {
        const started = await callTool(ctx.tools, "start_background_task", { command: nodeCommand(code) });
        assert.equal(started.ok, true);
        const taskId = started.backgroundTask!.taskId;
        const deadline = Date.now() + boundMs;
        readResult = await callTool(ctx.tools, "read_background_task", { taskId, stream: "stdout", tailLines: 200 });
        while (!/当前状态 exited/.test(readResult.message) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          readResult = await callTool(ctx.tools, "read_background_task", { taskId, stream: "stdout", tailLines: 200 });
        }
      },
    ],
  });
  try {
    await session.handle.send("截断");
    assert.equal(readResult?.ok, true);
    assert.match(readResult.message, /当前状态 exited/);
    assert.match(readResult.message, /truncated/);
    assert.match(readResult.message, /TAIL-END/);
    assert.equal(readResult.message.includes("�"), false, "不得返回损坏的多字节字符");
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("B3/S2.4（Windows/POSIX）：stop 收掉整棵进程树（父进程与孙进程）", async () => {
  const parentCode =
    'const {spawn}=require("child_process");' +
    'const grand=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});' +
    'process.stdout.write("GRAND="+grand.pid+"\\n");' +
    "setInterval(()=>{},1000)";
  let grandPid = 0;
  let stopResult: ToolResult | undefined;
  let parentPid = 0;
  const session = await openX({
    classify: allowClassify,
    scripts: [
      async (ctx) => {
        const started = await callTool(ctx.tools, "start_background_task", { command: nodeCommand(parentCode) });
        assert.equal(started.ok, true);
        const taskId = started.backgroundTask!.taskId;
        parentPid = started.backgroundTask!.pid!;
        const deadline = Date.now() + boundMs;
        let read = await callTool(ctx.tools, "read_background_task", { taskId, stream: "stdout" });
        const match = /GRAND=(\d+)/.exec(read.message);
        while (match === null && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          read = await callTool(ctx.tools, "read_background_task", { taskId, stream: "stdout" });
          const retry = /GRAND=(\d+)/.exec(read.message);
          if (retry !== null) {
            grandPid = Number(retry[1]);
            break;
          }
        }
        if (match !== null) grandPid = Number(match[1]);
        assert.ok(grandPid > 0, "必须读到孙进程 pid");
        assert.equal(isAlive(grandPid), true, "孙进程应真实存活");
        stopResult = await callTool(ctx.tools, "stop_background_task", { taskId });
      },
    ],
  });
  try {
    await session.handle.send("进程树");
    assert.equal(stopResult?.ok, true, `停止应成功：${stopResult?.message}`);
    await waitUntil(() => !isAlive(parentPid), boundMs);
    await waitUntil(() => !isAlive(grandPid), boundMs);
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("S3/S4：回合中止不杀后台任务；dispose 幂等且清理运行中任务", async () => {
  const code = "setInterval(()=>{},1000)";
  let pid = 0;
  let listedAfterAbort: ToolResult | undefined;
  const session = await openX({
    classify: allowClassify,
    scripts: [
      async (ctx) => {
        const started = await callTool(ctx.tools, "start_background_task", { command: nodeCommand(code) });
        assert.equal(started.ok, true);
        pid = started.backgroundTask!.pid!;
        await ctx.waitForAbort();
      },
      async (ctx) => {
        listedAfterAbort = await callTool(ctx.tools, "list_background_tasks");
      },
    ],
  });
  try {
    const send = session.handle.send("长时间回合");
    await waitUntil(() => pid > 0 && session.harness.turnCount() === 1);
    assert.ok(session.handle.abort !== undefined, "openRoleSession 返回的句柄必须实现 abort");
    await session.handle.abort();
    await assert.rejects(send);
    assert.equal(isAlive(pid), true, "回合中止后后台任务必须仍存活");

    await session.handle.send("下一轮查看");
    assert.equal(listedAfterAbort?.ok, true);
    assert.match(listedAfterAbort.message, /bg-1/);
    assert.match(listedAfterAbort.message, /running/);

    const disposing = session.handle.dispose();
    const duplicate = session.handle.dispose();
    await disposing;
    await duplicate;
    await waitUntil(() => !isAlive(pid), boundMs);
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("F5：真实入口 spawn 失败不保留半成品任务，之后仍可正常启动", async () => {
  let failed: ToolResult | undefined;
  let listedAfterFailure: ToolResult | undefined;
  let recovered: ToolResult | undefined;
  const session = await openX({
    classify: allowClassify,
    scripts: [
      async (ctx) => {
        failed = await callTool(ctx.tools, "start_background_task", {
          command: "ans-qa-no-such-executable --flag",
        });
        listedAfterFailure = await callTool(ctx.tools, "list_background_tasks");
        recovered = await callTool(ctx.tools, "start_background_task", {
          command: nodeCommand("setInterval(()=>{},1000)"),
        });
      },
    ],
  });
  try {
    await session.handle.send("spawn 失败");
    assert.equal(failed?.ok, false, "spawn 失败必须如实失败");
    assert.match(failed.message, /未启动|进程启动失败/);
    assert.equal(listedAfterFailure?.ok, true);
    assert.match(listedAfterFailure.message, /没有后台任务/, "失败不得留下假任务");
    assert.equal(recovered?.ok, true, "失败之后名额释放，仍可正常启动");
    assert.ok((recovered.backgroundTask?.pid ?? 0) > 0);
  } finally {
    await session.handle.dispose();
    session.temp.cleanup();
  }
});

test("F7：终止预算内未观察 close ⇒ 工具如实 kill-timeout「可能仍在运行」，不谎称已停止", async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { buildGovernedTools } = await import("../../../src/provider/runtime/tools.ts");
  const { createBackgroundTaskManager } = await import("../../../src/common/runtime-core/background-tasks.ts");

  class HangChild extends EventEmitter {
    readonly pid = 424242;
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
  }
  const child = new HangChild();
  const diagnostics = diagnosticSpy();
  const manager = createBackgroundTaskManager({
    spawnImpl: (() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }) as never,
    // 模拟「终止信号未收口」：不产生 close 事件。
    killTreeImpl: (() => {}) as never,
    diagnostics: diagnostics.log,
  });
  const allow: WriteGate = (target) => ({
    allowed: true,
    matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" },
  });
  const tools = new Map(
    buildGovernedTools(allow, {
      shellGate: async () => ({ allow: true, by: "fixture" }),
      backgroundTasks: manager,
      shellCwd: process.cwd(),
      diagnostics: diagnostics.log,
    }).map((tool) => [tool.name, tool]),
  );
  try {
    const started = await callTool(tools, "start_background_task", { command: "fake-hang --forever" });
    assert.equal(started.ok, true);
    const began = Date.now();
    const stopped = await callTool(tools, "stop_background_task", {
      taskId: started.backgroundTask!.taskId,
    });
    const elapsed = Date.now() - began;
    assert.equal(stopped.ok, false);
    assert.equal(stopped.backgroundTask?.state, "kill-timeout");
    assert.ok(elapsed >= 1200, `必须真实等满终止预算（实际 ${elapsed}ms）`);
    assert.match(stopped.message, /可能仍在运行，请如实告知客户/);
    assert.doesNotMatch(stopped.message, /已停止任务/);
    assert.equal(
      diagnostics.events.some((entry) => entry.event === "background.stop.timeout"),
      true,
      "必须记录 background.stop.timeout",
    );
  } finally {
    await manager.dispose();
  }
});
