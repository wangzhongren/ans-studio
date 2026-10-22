// 测试角色：后台任务 B1–B4 真实项目 + 真实模型端到端测试（2026-10-22 客户 wangzhongren 要求）。
//
// 装配路径：真实 Pipeline openRoleSession → 真实 Service createRuntimeAdapter（管理器/四工具/回合包装/
// dispose 接线）→ 默认 Pi 工厂 createPiRuntimeAdapter → Pi SDK → 真实客户网关。
// 唯一替身：ShellGate 的审批/分类通道（记录 argv 并返回 allow），用于让后台启动在无人值守脚本中通过审核；
// 其余（进程 spawn、日志缓冲、停止、dispose、真实模型工具调用）都是真实实现。
//
// 安全：凭据只从进程环境读取；本脚本不打印、不落盘环境文件或令牌。
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import type { ClassifyShellFn } from "../../../src/common/编排/shell-gate.ts";
import type { DiagnosticLog } from "../../../src/model/runtime.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

const TURN_TIMEOUT_MS = 180_000;
const TOOL_LATENCY_LIMIT_MS = 5_000;
const PROCESS_GONE_TIMEOUT_MS = 15_000;

// —————————————————————— 临时项目 ——————————————————————

interface TempProject {
  root: string;
  project: ProjectConfig;
  serverPath: string;
  statePath: string;
  cleanup: () => void;
}

const SERVER_JS = String.raw`
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("content-type", "text/plain");
  res.end("ans-e2e-ok");
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const state = { pid: process.pid, port: address.port, startedAt: Date.now() };
  fs.writeFileSync(path.join(__dirname, "server.state.json"), JSON.stringify(state));
  console.log("ANS_E2E_LISTENING http://127.0.0.1:" + address.port + " PID=" + process.pid);
  console.error("ANS_E2E_STDERR server ready");
});

process.on("SIGTERM", () => {
  console.log("ANS_E2E_SIGTERM closing");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
});

setInterval(() => {}, 1000);
`;

function makeTempProject(): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-e2e-bg-"));
  const dir = path.join(root, "角色卡", "dev");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "role-card.md"),
    [
      "# 角色 dev",
      "",
      "你是这个测试项目的开发工程师。项目根目录有 server.js，它是一个长期运行的开发服务器。",
      "需要启动服务器时，必须使用 start_background_task 工具，而不是 run_shell。",
      "服务器启动后不要等待它退出；用 list/read/stop 三个后台工具管理它。",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    ["role: dev", "entries:", "  - kind: file", "    path: server.js", "    purpose: 开发服务器", ""].join("\n"),
  );
  const serverPath = path.join(root, "server.js");
  fs.writeFileSync(serverPath, SERVER_JS);
  return {
    root,
    serverPath,
    statePath: path.join(root, "server.state.json"),
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { dev: { card: "角色卡/dev/role-card.md", boundary: "角色卡/dev/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: {
        path: "角色卡/dev/boundary.yaml",
        acceptance: { accepted: true, source: "test:e2e-real-model" },
      },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

// —————————————————————— 观测工具 ——————————————————————

interface ServerState { pid: number; port: number; startedAt: number }

function readServerState(statePath: string): ServerState | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<ServerState>;
    if (typeof parsed.pid === "number" && typeof parsed.port === "number") {
      return { pid: parsed.pid, port: parsed.port, startedAt: parsed.startedAt ?? 0 };
    }
  } catch { /* 尚未写出 */ }
  return undefined;
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function httpProbe(port: number, timeoutMs = 1500): Promise<{ ok: boolean; body?: string; error?: string }> {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/", timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ ok: response.statusCode === 200, body }));
    });
    request.on("timeout", () => request.destroy(new Error("http probe timeout")));
    request.on("error", (error) => resolve({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  });
}

function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = async (): Promise<void> => {
      if (await predicate()) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(() => void poll(), 100);
    };
    void poll();
  });
}

interface ToolFact {
  toolName: string;
  phase: "start" | "result" | "blocked";
  ok?: boolean;
  durationMs?: number;
  resultText?: string;
  summary: string;
}

// `openRoleSession().events()` 的公开事件类型是编排的 `OrchestrationEvent`
// （`SessionEvent | HandbackEvent`）；handback 事件没有 `detail`，工具事实提取直接跳过。
type EventRecord = OrchestrationEvent & { __index: number };

function toolFacts(events: readonly OrchestrationEvent[]): ToolFact[] {
  const facts: ToolFact[] = [];
  for (const event of events) {
    if (event.kind === "handback") continue;
    const detail = event.detail as {
      toolName?: unknown; phase?: unknown; ok?: unknown;
      display?: { durationMs?: unknown; resultText?: { text?: unknown } };
    } | undefined;
    if (detail === undefined || typeof detail.toolName !== "string") continue;
    const phase = detail.phase === "start" || detail.phase === "blocked" || detail.phase === "result" ? detail.phase : "result";
    facts.push({
      toolName: detail.toolName,
      phase,
      ...(typeof detail.ok === "boolean" ? { ok: detail.ok } : {}),
      ...(typeof detail.display?.durationMs === "number" ? { durationMs: detail.display.durationMs } : {}),
      ...(typeof detail.display?.resultText?.text === "string" ? { resultText: detail.display.resultText.text } : {}),
      summary: event.summary,
    });
  }
  return facts;
}

function resultFacts(events: readonly OrchestrationEvent[], toolName: string): ToolFact[] {
  return toolFacts(events).filter((fact) => fact.toolName === toolName && fact.phase === "result");
}

function messageTexts(events: readonly OrchestrationEvent[]): string[] {
  return events.filter((event) => event.kind === "message").map((event) => event.summary);
}

// —————————————————————— 诊断收集 ——————————————————————

function diagnosticSpy(): { log: DiagnosticLog; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  return {
    events,
    log: {
      record(event, fields) { events.push({ event, fields }); },
      error(event, _error, fields) { events.push({ event, fields }); },
    },
  };
}

// —————————————————————— 断言记录 ——————————————————————

interface Assertion { id: string; pass: boolean; detail: string }
const assertions: Assertion[] = [];
function check(id: string, pass: boolean, detail: string): boolean {
  assertions.push({ id, pass, detail });
  return pass;
}

// —————————————————————— 主流程 ——————————————————————

async function main(): Promise<void> {
  const runStartedAt = Date.now();
  const temp = makeTempProject();
  const diagnostics = diagnosticSpy();
  const classifyCalls: Array<{ at: number; argv: string[] }> = [];
  const classify: ClassifyShellFn = (argv) => {
    classifyCalls.push({ at: Date.now(), argv: [...argv] });
    return "allow"; // 唯一替身：审批/分类通道记录并放行（仅测试用）。
  };

  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  let iterator: AsyncIterator<OrchestrationEvent> | undefined;
  const events: EventRecord[] = [];
  let pumpDone = false;
  const pumpErrors: string[] = [];

  const startPump = (sessionHandle: NonNullable<typeof handle>): void => {
    iterator = sessionHandle.events()[Symbol.asyncIterator]();
    void (async () => {
      try {
        for (;;) {
          const next = await iterator!.next();
          if (next.done === true) return;
          events.push({ ...next.value, __index: events.length });
        }
      } catch (error) {
        pumpErrors.push(error instanceof Error ? error.message : String(error));
      } finally {
        pumpDone = true;
      }
    })();
  };

  const settleSeenSince = (fromIndex: number): boolean =>
    events.slice(fromIndex).some((event) => event.kind === "settled");

  interface TurnResult {
    label: string;
    elapsedMs: number;
    timedOut: boolean;
    error?: string;
    fromIndex: number;
    toIndex: number;
    events: OrchestrationEvent[];
    tools: ToolFact[];
    messages: string[];
  }

  const sendTurn = async (label: string, text: string): Promise<TurnResult> => {
    if (handle === undefined) throw new Error("会话未打开");
    const fromIndex = events.length;
    const startedAt = Date.now();
    let timedOut = false;
    let sendError: string | undefined;
    let timer: NodeJS.Timeout | undefined;

    const sendPromise = handle.send(text);
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), TURN_TIMEOUT_MS);
    });
    const outcome = await Promise.race([
      sendPromise.then(() => "sent" as const, (error) => {
        sendError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        return "failed" as const;
      }),
      timeout,
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (outcome === "timeout") {
      timedOut = true;
      try { await handle.abort?.(); } catch { /* 如实记录超时 */ }
      await Promise.race([sendPromise.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
    // 等 settled 事件（成功或超时后最多再给 5s）。
    await waitUntil(() => settleSeenSince(fromIndex), 5_000);
    const toIndex = events.length;
    const turnEvents = events.slice(fromIndex, toIndex);
    return {
      label,
      elapsedMs: Date.now() - startedAt,
      timedOut,
      ...(sendError !== undefined ? { error: sendError } : {}),
      fromIndex,
      toIndex,
      events: turnEvents,
      tools: toolFacts(turnEvents),
      messages: messageTexts(turnEvents),
    };
  };

  const emitTurn = (turn: TurnResult): void => {
    console.log(`\n=== TURN ${turn.label} ===`);
    console.log(JSON.stringify({
      elapsedMs: turn.elapsedMs,
      timedOut: turn.timedOut,
      ...(turn.error !== undefined ? { error: turn.error } : {}),
      eventCount: turn.events.length,
      toolCalls: turn.tools.map((fact) => ({
        toolName: fact.toolName,
        phase: fact.phase,
        ok: fact.ok,
        durationMs: fact.durationMs,
        resultText: fact.resultText?.slice(0, 2000),
        summary: fact.summary,
      })),
      messages: turn.messages,
    }, null, 2));
  };

  try {
    handle = await openRoleSession(
      {
        roleId: "dev",
        runtime: "pi",
        project: temp.project,
        persistSession: false,
        shellReadonly: {
          classifyShell: classify,
          rules: defaultShellRules(),
          auditSink: createMemoryAuditSink(),
          timeoutMs: 30_000,
        },
      },
      {
        runtimeOptions: {
          persistSession: false,
          diagnostics: diagnostics.log,
          constructTimeoutMs: 120_000,
          turnLastResortMs: TURN_TIMEOUT_MS,
        },
      },
    );
    startPump(handle);

    // —— 第 1 轮：真实模型调用 start_background_task ——
    const turn1 = await sendTurn(
      "1-start",
      [
        "请完成一个后台任务实验，严格按步骤操作：",
        "1. 调用工具 start_background_task，command 参数必须是：node server.js",
        "2. 工具返回后，在最终回复里报告任务号、pid 和状态。",
        "3. 不要调用 stop_background_task，也不要使用 run_shell。",
        "服务器是长期运行的开发服务器，启动后不要等待它退出。",
      ].join("\n"),
    );
    emitTurn(turn1);

    let startFacts = resultFacts(turn1.events, "start_background_task");
    let startFact = startFacts.find((fact) => fact.ok === true);
    // 模型限制重试（仅当这一轮没有产生任何 start 工具调用时，重试 1 次）。
    if (startFacts.length === 0) {
      const retry = await sendTurn(
        "1b-start-retry",
        "上一条指令没有被执行。现在只做一件事：调用 start_background_task，command 参数为：node server.js。不要调用 run_shell。",
      );
      emitTurn(retry);
      turn1.elapsedMs += retry.elapsedMs;
      turn1.timedOut = turn1.timedOut || retry.timedOut;
      startFacts = [...startFacts, ...resultFacts(retry.events, "start_background_task")];
      startFact = startFacts.find((fact) => fact.ok === true);
    }

    const taskId = startFact?.resultText === undefined ? undefined : /bg-\d+/.exec(startFact.resultText)?.[0];
    const startPid = startFact?.resultText === undefined ? undefined : Number(/pid\s*([0-9]+)/i.exec(startFact.resultText)?.[1] ?? NaN);
    check(
      "a1-start-tool-called",
      startFacts.length > 0,
      startFacts.length > 0 ? `模型调用了 start_background_task ${startFacts.length} 次` : "模型本轮未调用 start_background_task（重试 1 次后仍无）",
    );
    check(
      "a2-start-ok-taskid-pid-running",
      startFact?.ok === true && taskId !== undefined && Number.isFinite(startPid),
      startFact === undefined ? "无 start 结果事实" : `ok=${String(startFact.ok)} taskId=${taskId ?? "缺失"} pid=${String(startPid)} result=${(startFact.resultText ?? "").slice(0, 300)}`,
    );
    check(
      "a3-start-tool-fast",
      startFact?.durationMs !== undefined && startFact.durationMs < TOOL_LATENCY_LIMIT_MS,
      startFact?.durationMs === undefined ? "start 工具结果未携带 durationMs" : `start 工具耗时 ${startFact.durationMs}ms（阈值 <${TOOL_LATENCY_LIMIT_MS}ms）`,
    );

    // 以真实进程/端口核对：state 文件、pid 存活、HTTP 200。
    const state1 = readServerState(temp.statePath);
    const alive1 = state1 !== undefined && isAlive(state1.pid);
    const probe1 = state1 === undefined ? { ok: false, error: "state 文件缺失" } : await httpProbe(state1.port);
    check(
      "b1-turn-ended-while-server-running",
      !turn1.timedOut && alive1 && probe1.ok,
      `回合 timedOut=${String(turn1.timedOut)} state=${JSON.stringify(state1)} alive=${String(alive1)} http=${probe1.ok ? "200" : String(probe1.error)}`,
    );
    check(
      "a4-tool-pid-matches-server-pid",
      state1 !== undefined && Number.isFinite(startPid) && state1.pid === startPid,
      `工具 pid=${String(startPid)}，server.js 实际 pid=${String(state1?.pid)}`,
    );

    // —— 第 2 轮：list / read / stop（把任务号明确给模型，避免记忆误差）——
    let listFact: ToolFact | undefined;
    let readFact: ToolFact | undefined;
    let stopFact: ToolFact | undefined;
    if (taskId !== undefined && state1 !== undefined) {
      const turn2 = await sendTurn(
        "2-list-read-stop",
        [
          `后台任务 ${taskId} 正在运行，开发服务器的监听端口是 ${state1.port}。`,
          "请严格按顺序调用以下三个工具：",
          `1. list_background_tasks，确认列表里能看到 ${taskId}。`,
          `2. read_background_task，taskId 填 ${taskId}，stream 填 stdout，tailLines 填 40；在最终回复里引用日志中的监听地址/端口。`,
          `3. stop_background_task，taskId 填 ${taskId}；报告返回的最终状态。`,
          "只使用这三个后台任务工具，不要使用 run_shell。",
        ].join("\n"),
      );
      emitTurn(turn2);
      listFact = resultFacts(turn2.events, "list_background_tasks").find((fact) => fact.ok === true);
      readFact = resultFacts(turn2.events, "read_background_task").find((fact) => fact.ok === true);
      stopFact = resultFacts(turn2.events, "stop_background_task").find((fact) => fact.ok === true);
      check(
        "c1-list-shows-task-running",
        listFact?.resultText !== undefined && listFact.resultText.includes(taskId) && /running|运行中/.test(listFact.resultText),
        listFact?.resultText === undefined ? "模型未调用 list_background_tasks 或未成功" : listFact.resultText.slice(0, 500),
      );
      check(
        "c2-read-shows-real-log",
        readFact?.resultText !== undefined
          && readFact.resultText.includes(String(state1.port))
          && /running|运行中/.test(readFact.resultText),
        readFact?.resultText === undefined ? "模型未调用 read_background_task 或未成功" : readFact.resultText.slice(0, 800),
      );
      check(
        "d1-stop-reports-stopped",
        stopFact?.ok === true && stopFact.resultText !== undefined && /stopped|已停止/.test(stopFact.resultText),
        stopFact === undefined ? "模型未调用 stop_background_task 或未成功" : (stopFact.resultText ?? "").slice(0, 500),
      );
      const gone = await waitUntil(() => !isAlive(state1.pid), PROCESS_GONE_TIMEOUT_MS);
      const probeAfter = await httpProbe(state1.port);
      check(
        "d2-process-and-port-gone",
        gone && !probeAfter.ok,
        `pid ${state1.pid} alive=${String(isAlive(state1.pid))}；端口 ${state1.port} http=${probeAfter.ok ? "仍可访问" : String(probeAfter.error)}`,
      );
      check(
        "a5-review-channel-called-once-per-start",
        classifyCalls.length === startFacts.filter((fact) => fact.ok === true).length,
        `分类器调用 ${classifyCalls.length} 次；成功 start ${startFacts.filter((fact) => fact.ok === true).length} 次`,
      );
    } else {
      check("c1-list-shows-task-running", false, "前置条件缺失：没有任务号或服务器状态，无法执行第 2 轮");
      check("c2-read-shows-real-log", false, "前置条件缺失");
      check("d1-stop-reports-stopped", false, "前置条件缺失");
      check("d2-process-and-port-gone", false, "前置条件缺失");
    }

    // —— dispose 清理：再次启动后不 stop，直接 dispose，核对进程/端口消失 ——
    let state2: ServerState | undefined;
    let disposeOk = false;
    let disposeError: string | undefined;
    const turn3 = await sendTurn(
      "3-start-for-dispose",
      [
        "再启动一次开发服务器用于清理测试：",
        "1. 调用 start_background_task，command 参数必须是：node server.js",
        "2. 只报告任务号和 pid，不要调用 stop_background_task，也不要使用 run_shell。",
      ].join("\n"),
    );
    emitTurn(turn3);
    let startFacts3 = resultFacts(turn3.events, "start_background_task");
    if (startFacts3.length === 0) {
      const retry3 = await sendTurn(
        "3b-start-retry",
        "请只调用一次 start_background_task，command 参数为：node server.js。不要使用 run_shell，不要 stop。",
      );
      emitTurn(retry3);
      startFacts3 = resultFacts(retry3.events, "start_background_task");
    }
    const startFact3 = startFacts3.find((fact) => fact.ok === true);
    if (startFact3 !== undefined) {
      await waitUntil(() => readServerState(temp.statePath)?.pid !== state1?.pid && readServerState(temp.statePath) !== undefined, 10_000);
      state2 = readServerState(temp.statePath);
    }
    check(
      "e1-second-start-for-dispose",
      startFact3?.ok === true && state2 !== undefined && isAlive(state2.pid),
      startFact3 === undefined ? "模型未成功再次启动后台任务" : `pid=${String(state2?.pid)} alive=${String(state2 !== undefined && isAlive(state2.pid))}`,
    );
    if (state2 !== undefined) {
      try {
        await handle.dispose();
        disposeOk = true;
      } catch (error) {
        disposeError = error instanceof Error ? error.message : String(error);
      }
      const gone2 = await waitUntil(() => !isAlive(state2.pid), PROCESS_GONE_TIMEOUT_MS);
      const probe2 = await httpProbe(state2.port);
      check(
        "e2-dispose-kills-background-process",
        disposeOk && gone2 && !probe2.ok,
        `dispose=${disposeOk ? "ok" : `失败:${disposeError}`} pid ${state2.pid} alive=${String(isAlive(state2.pid))} 端口 http=${probe2.ok ? "仍可访问" : String(probe2.error)}`,
      );
    } else {
      check("e2-dispose-kills-background-process", false, "前置条件缺失：第二次启动未成功，无法验证 dispose 清理");
    }
  } catch (error) {
    check("run-completed", false, `运行异常：${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  } finally {
    try {
      await handle?.dispose();
    } catch (error) {
      check("dispose-final", false, `finally dispose 失败：${error instanceof Error ? error.message : String(error)}`);
    }
    void iterator?.return?.();
    await waitUntil(() => pumpDone, 2_000).catch(() => {});
    temp.cleanup();

    const bgDiagnostics = diagnostics.events.filter((entry) => entry.event.startsWith("background."));
    const summary = {
      elapsedMs: Date.now() - runStartedAt,
      assertions,
      allPassed: assertions.every((item) => item.pass),
      classifyCalls: classifyCalls.map((call) => ({ at: call.at, argv: call.argv })),
      diagnostics: {
        backgroundEvents: bgDiagnostics,
        allEvents: diagnostics.events.map((entry) => entry.event),
      },
      pumpErrors,
    };
    console.log("\n=== E2E_SUMMARY_BEGIN ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=== E2E_SUMMARY_END ===");
    if (!summary.allPassed) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("E2E_FATAL:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
