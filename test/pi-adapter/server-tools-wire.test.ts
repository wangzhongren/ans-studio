// 服务端工具族（web_search/web_fetch）的 wire 级与 loopback 端到端测试。
// 归属：Pi适配器角色测试目录。**不发任何外网请求**（T2 离线捕获参数；T3-T8 全走 127.0.0.1 loopback）。
//
// 覆盖（对应提案 §五 测试计划 T2-T8）：
//   T2 wire 级：真实 buildParams 捕获 → 声明追加在 tools 尾部、不引入 tool_removal/tool_addition；
//   T3 loopback 端到端：请求体含声明（尾部）＋ 恰一对 start/result 行（显示 profile 净化：URL query 被剥）
//      ＋ 加密诱饵绝不出现 ＋ 诊断 declare/call/usage（查询串不进诊断）＋ settled 恰一（X-1）；
//   T4 max_uses_exceeded：denied 行、非运行错误、outcome 正常；
//   T5 网关 400（路径 C）：本轮如实失败（既有口径）、降级恰一次、**此后请求不再附带声明**（会话可用）；
//   T6 pause_turn：如实行 + 诊断；
//   T7 默认关：请求体无声明追加、零 server_tool 诊断（逐字旧行为）；既有全量套件即回归网；
//   T8 usage 缺省兜底：诊断 state=from-blocks。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExplicitRuntime, createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { appendServerToolDeclarations, renderServerToolDegradedSummary, SERVER_TOOL_ENV, type ServerToolDeclaration } from "../../src/common/pi-adapter/server-tools.ts";
import { createToolDisplayContext } from "../../src/common/runtime-core/tool-display.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";
import { makeRole } from "./fixtures.ts";

const AUTH_ENV = "ANTHROPIC_AUTH_TOKEN";
if (!process.env[AUTH_ENV]) process.env[AUTH_ENV] = "server-tools-wire-placeholder-token";
const MODEL_ID = "search-model-x";
const WEB_SEARCH_DECL: ServerToolDeclaration = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
const QUERY_MARKER = "PROBE-QUERY-4711";
const ENCRYPTED_MARKER = "PROBE-BAIT-ENCRYPTED";
const BAIT_URL_QUERY = "PROBE-BAIT-QUERY";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

/** 环境变量开关的作用域夹具（保持其它用例零污染）。 */
async function withServerToolsEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env[SERVER_TOOL_ENV];
  if (value === undefined) delete process.env[SERVER_TOOL_ENV];
  else process.env[SERVER_TOOL_ENV] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[SERVER_TOOL_ENV];
    else process.env[SERVER_TOOL_ENV] = previous;
  }
}

/** 诊断落盘夹具：配置到临时目录；读取经 flush 后返回全部行。 */
async function withDiagnostics<T>(run: (readRows: () => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-server-tools-diag-"));
  configureDiagnostics({ directory: dir });
  try {
    return await run(async () => {
      await flushDiagnostics();
      return readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>));
    });
  } finally {
    await disposeDiagnostics();
    rmSync(dir, { recursive: true, force: true });
  }
}

// —————————————————————— loopback 服务器 ——————————————————————

interface LoopResponse {
  status: number;
  /** 按序写出的 SSE 事件（自动套 event/data 帧）。 */
  sse?: unknown[];
  /** 非 SSE 响应体（JSON）。 */
  json?: unknown;
}
interface Loopback {
  baseUrl: string;
  requests: Record<string, unknown>[];
  close(): Promise<void>;
}

async function startLoopback(respond: (body: Record<string, unknown>, index: number) => LoopResponse): Promise<Loopback> {
  const requests: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      } catch {
        body = {};
      }
      requests.push(body);
      const response = respond(body, requests.length - 1);
      if (response.sse !== undefined) {
        res.writeHead(response.status, { "content-type": "text/event-stream" });
        res.end(response.sse.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(JSON.stringify(response.json ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const silentLogger = { stage() {}, trace() {}, traceEnabled: false };

function makeAdapter(loopback: Loopback, extra: Record<string, unknown> = {}) {
  return createRealPiRuntimeAdapter({
    runtime: "pi",
    projectRoot: process.cwd(),
    skillRoot: process.cwd(),
    tools: [],
    interactionGate: createInteractionGate(),
    currentTurnId: () => undefined,
    config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: AUTH_ENV, contextWindow: 131072, contextWindowSource: "explicit" },
    logger: silentLogger,
    promptTimeoutMs: 30000,
    constructTimeoutMs: 60000,
    ...extra,
  } as never);
}

async function drain(session: { dispose(): Promise<void>; events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

/** 请求体是否携带 web_search 声明。 */
const requestHasDeclaration = (body: Record<string, unknown>): boolean => JSON.stringify(body["tools"] ?? []).includes('"web_search_20250305"');

// —————————————————————— SSE 脚本素材 ——————————————————————

const messageStart = (): unknown => ({ type: "message_start", message: { id: "msg_loop_1", type: "message", role: "assistant", model: MODEL_ID, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } });
const textBlock = (index: number, text: string): unknown[] => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index },
];
const messageDelta = (stopReason: string, usage?: unknown): unknown => ({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: usage ?? { output_tokens: 4 } });
const messageStop = (): unknown => ({ type: "message_stop" });

/** 含搜索往返的完整响应（调用块 → 结果块（含加密诱饵与带 query 的 URL）→ 文本 → usage 回传）。 */
const searchRoundTrip = (): unknown[] => [
  messageStart(),
  { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_A", name: "web_search", input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: QUERY_MARKER }) } },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_A",
      content: [
        { type: "web_search_result", title: "TITLE-ALPHA", url: `https://example.test/alpha?token=${BAIT_URL_QUERY}#frag`, encrypted_content: ENCRYPTED_MARKER },
        { type: "web_search_result", title: "TITLE-BETA", url: "https://example.test/beta" },
      ],
    },
  },
  { type: "content_block_stop", index: 1 },
  ...textBlock(2, "搜索完成。"),
  messageDelta("end_turn", { output_tokens: 5, server_tool_use: { web_search_requests: 1 } }),
  messageStop(),
];

const plainRoundTrip = (text: string): unknown[] => [messageStart(), ...textBlock(0, text), messageDelta("end_turn"), messageStop()];

// —————————————————————— bindRole 构造期：未知 id 抛错（任何网络之前） ——————————————————————

test("bindRole 构造期：未知 id（含 code_execution）⇒ 明确抛错且不发任何网络请求", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  for (const bad of ["bogus_tool", "web_search,code_execution"]) {
    await withServerToolsEnv(bad, async () => {
      const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("不应到达。") }));
      try {
        await assert.rejects(() => makeAdapter(loopback).bindRole(makeRole()), /未知的服务端工具 id/);
        assert.equal(loopback.requests.length, 0, `「${bad}」：构造期失败不得发出任何请求`);
      } finally {
        await loopback.close();
      }
    });
  }
});

// —————————————————————— T2 wire 级（离线捕获，不发网络） ——————————————————————

const TOOL_A = { name: "tool_a", description: "a", parameters: { type: "object", properties: {}, additionalProperties: true } };

test("T2 wire 级：真实 params 上追加声明——尾部、不引入 tool_removal/tool_addition、stream 标志不动", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { model } = await buildExplicitRuntime({ providerId: "ans-gateway", baseUrl: "https://gw.example.invalid/anthropic/", modelId: "gw-model-x", contextWindow: 32768, apiKeyEnvVar: AUTH_ENV } as never);
  const { anthropicMessagesApi } = await import("@earendil-works/pi-ai/api/anthropic-messages.lazy");
  let captured: Record<string, unknown> | undefined;
  const stream = anthropicMessagesApi().streamSimple(
    model as never,
    { messages: [{ role: "system", content: "base prompt", toolsAdded: [TOOL_A], timestamp: Date.now() }, { role: "user", content: "go", timestamp: Date.now() }] } as never,
    {
      apiKey: "test-key-not-real",
      onPayload: (params: unknown) => {
        captured = params as Record<string, unknown>;
        throw new Error("capture-stop"); // 捕获后立即中止：**不发任何网络请求**
      },
    } as never,
  );
  await stream.result().catch(() => {});
  assert.ok(captured !== undefined, "应已捕获请求参数");
  const toolsBefore = captured["tools"] as unknown[] | undefined;
  assert.ok(Array.isArray(toolsBefore), "应存在真实转换出的 tools 数组");
  assert.ok(toolsBefore.length >= 1, "至少应含一条客户端工具");
  assert.equal(JSON.stringify(captured).includes("web_search_20250305"), false, "追加前不得含服务端工具声明");

  const appended = appendServerToolDeclarations(captured, [WEB_SEARCH_DECL]);
  assert.equal(appended.changed, true);
  const toolsAfter = (appended.payload as { tools: unknown[] }).tools;
  assert.deepEqual(toolsAfter[toolsAfter.length - 1], WEB_SEARCH_DECL, "声明必须追加在 tools 尾部");
  assert.equal(toolsAfter.length, toolsBefore.length + 1);
  const afterText = JSON.stringify(appended.payload);
  assert.equal(afterText.includes('"tool_removal"'), false);
  assert.equal(afterText.includes('"tool_addition"'), false);
  assert.equal((appended.payload as { stream?: unknown }).stream, (captured as { stream?: unknown }).stream, "stream 标志原样透传（由 pi-ai 统一置 true）");
});

// —————————————————————— T3 loopback 端到端（成功往返） ——————————————————————

test("T3 loopback：声明上 wire（尾部）＋恰一对 start/result 行（URL query 被显示 profile 剥除）＋诊断计数类＋settled 恰一", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      const loopback = await startLoopback(() => ({ status: 200, sse: searchRoundTrip() }));
      try {
        const projector = createToolDisplayContext();
        const session = await makeAdapter(loopback, { projectToolEvent: projector.projectToolEvent }).bindRole(makeRole());
        await session.prompt("做一次搜索");
        const events = await drain(session);

        // ① 请求体：恰一个请求；声明在 tools 尾部；无外来块。
        assert.equal(loopback.requests.length, 1);
        const body = loopback.requests[0]!;
        const tools = body["tools"] as unknown[] | undefined;
        assert.ok(Array.isArray(tools) && tools.length === 1);
        assert.deepEqual(tools[0], WEB_SEARCH_DECL);
        const bodyText = JSON.stringify(body);
        assert.equal(bodyText.includes('"tool_removal"'), false);
        assert.equal(bodyText.includes('"tool_addition"'), false);

        // ② 恰一对 start/result 行；查询与标题在 resultText；URL query/fragment 被既有口径剥除。
        const starts = events.filter((event) => event.kind === "tool_call");
        const results = events.filter((event) => event.kind === "accepted");
        assert.equal(starts.length, 1);
        assert.equal(results.length, 1);
        const startDetail = starts[0]!.detail as Record<string, unknown>;
        assert.equal(startDetail["toolName"], "web_search");
        assert.equal(startDetail["toolCallId"], "srvtoolu_A");
        assert.equal(startDetail["phase"], "start");
        const resultDetail = results[0]!.detail as Record<string, unknown>;
        assert.equal(resultDetail["phase"], "result");
        assert.equal(resultDetail["ok"], true);
        const resultText = (resultDetail["display"] as { resultText: { text: string } }).resultText.text;
        assert.match(resultText, /TITLE-ALPHA/);
        assert.match(resultText, new RegExp(`查询「${QUERY_MARKER}」`));
        assert.match(resultText, /example\.test\/alpha/);
        assert.equal(resultText.includes(BAIT_URL_QUERY), false, "URL query 被显示 profile 剥除（既有防泄密口径）");
        assert.equal(resultText.includes("#frag"), false);

        // ③ 加密诱饵：事件流与诊断都不含（observer 不读该字段；归一化丢弃也不回放）。
        assert.equal(JSON.stringify(events).includes(ENCRYPTED_MARKER), false);

        // ④ 诊断：declare/call/usage（只计数类）；查询串与结果标题不进诊断。
        const rows = (await readRows()).filter((row) => String(row["event"]).startsWith("server_tool."));
        const names = rows.map((row) => String(row["event"]));
        assert.ok(names.includes("server_tool.declare"), names.join(","));
        assert.ok(names.includes("server_tool.call"));
        assert.ok(names.includes("server_tool.usage"));
        const usage = rows.find((row) => row["event"] === "server_tool.usage")!;
        assert.equal(usage["toolName"], "web_search");
        assert.equal(usage["count"], 1);
        assert.equal(usage["state"], "from-usage");
        assert.equal(typeof usage["turnId"], "string");
        const call = rows.find((row) => row["event"] === "server_tool.call")!;
        assert.equal(call["toolCallId"], "srvtoolu_A");
        assert.equal(call["count"], 1);
        const rowsText = JSON.stringify(rows);
        assert.equal(rowsText.includes(QUERY_MARKER), false, "查询串不进诊断落盘");
        assert.equal(rowsText.includes("TITLE-ALPHA"), false);
        assert.equal(rowsText.includes(ENCRYPTED_MARKER), false);

        // ⑤ 启用行在场；settled 恰一（X-1 回归）；助手文本仍走既有 message 行。
        assert.ok(events.some((event) => event.kind === "message" && String(event.summary).includes("本会话已启用服务端工具：web_search")));
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 1);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed");
        assert.ok(events.some((event) => event.kind === "message" && event.summary === "搜索完成。"));
      } finally {
        await loopback.close();
      }
    });
  });
});

// —————————————————————— T4 max_uses_exceeded ——————————————————————

test("T4 loopback：网关以 max_uses_exceeded 优雅拒绝调用 → denied 行、非运行错误、outcome 不受影响", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      const eventsSse = [
        messageStart(),
        { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_B", name: "web_search", input: { query: "PROBE-QUERY-B" } } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_B", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } } },
        { type: "content_block_stop", index: 1 },
        ...textBlock(2, "已达上限。"),
        messageDelta("end_turn", { output_tokens: 3, server_tool_use: { web_search_requests: 2 } }),
        messageStop(),
      ];
      const loopback = await startLoopback(() => ({ status: 200, sse: eventsSse }));
      try {
        const session = await makeAdapter(loopback).bindRole(makeRole());
        await session.prompt("再搜一次");
        const events = await drain(session);
        const denied = events.filter((event) => event.kind === "denied");
        assert.equal(denied.length, 1);
        assert.match(String(denied[0]!.summary), /搜索次数已达上限（max_uses_exceeded）/);
        assert.match(String(denied[0]!.summary), /非运行错误/);
        assert.equal(events.filter((event) => event.kind === "accepted").length, 0);
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 1);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed", "max_uses_exceeded 绝不是轮次失败");
        const rows = (await readRows()).filter((row) => row["event"] === "server_tool.degraded");
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!["errorCode"], "MAX_USES_EXCEEDED");
        assert.equal(rows[0]!["ok"], false);
        assert.equal(rows[0]!["toolName"], "web_search");
      } finally {
        await loopback.close();
      }
    });
  });
});

// —————————————————————— T5 网关 400（路径 C） ——————————————————————

test("T5 loopback：网关 400 拒声明 → 本轮如实失败（既有口径）＋降级恰一次＋此后请求不再附带声明（会话可用）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      // 含声明的请求 → 400（带 JSON 错误体，含状态前缀 400）；无声明的请求 → 正常往返。
      const loopback = await startLoopback((body) =>
        requestHasDeclaration(body)
          ? { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "unsupported server tool declarations" } } }
          : { status: 200, sse: plainRoundTrip("已恢复。") },
      );
      try {
        const session = await makeAdapter(loopback).bindRole(makeRole());

        // 第 1 轮：如实失败（既有失败口径：denied「本轮模型运行失败」+ settled failed）。
        await session.prompt("第一轮");
        // 第 2 轮（同一会话）：声明已被停用 ⇒ 正常完成。
        await session.prompt("第二轮");
        const events = await drain(session);

        const declRequests = loopback.requests.filter(requestHasDeclaration);
        assert.equal(declRequests.length, 1, "恰一个请求携带过声明（第 1 轮）；降级后（含第 2 轮）不再附带");
        assert.ok(loopback.requests.length >= 2);
        assert.deepEqual(((declRequests[0]!["tools"] as unknown[])[0]), WEB_SEARCH_DECL);

        const degradedRows = events.filter((event) => event.kind === "message" && event.summary === renderServerToolDegradedSummary(400));
        assert.equal(degradedRows.length, 1, "降级行恰一次");
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 2, "settled 每轮恰一（X-1）");
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "failed", "第 1 轮如实失败（错在网关，既有口径不变）");
        assert.equal((settled[1]!.detail as Record<string, unknown>)["outcome"], "completed", "第 2 轮正常完成（不毁轮次、会话可用）");
        assert.ok(events.some((event) => event.kind === "message" && event.summary === "已恢复。"));

        const rows = (await readRows()).filter((row) => row["event"] === "server_tool.degraded");
        assert.deepEqual(rows.map((row) => ({ errorCode: row["errorCode"], state: row["state"] })), [{ errorCode: "GATEWAY_REJECTED_HTTP_400", state: "suppressed" }]);
        // 错误正文不落诊断（沿「只存错误类别」纪律）。
        assert.equal(JSON.stringify(rows).includes("unsupported server tool"), false);
      } finally {
        await loopback.close();
      }
    });
  });
});

// —————————————————————— T6 pause_turn ——————————————————————

test("T6 loopback：pause_turn → 如实行 + 诊断；轮次按「stop」正常收尾", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      const loopback = await startLoopback(() => ({ status: 200, sse: [messageStart(), messageDelta("pause_turn", { output_tokens: 3 }), messageStop()] }));
      try {
        const session = await makeAdapter(loopback).bindRole(makeRole());
        await session.prompt("长任务");
        const events = await drain(session);
        assert.ok(events.some((event) => event.kind === "message" && String(event.summary).includes("pause_turn")));
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 1);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed");
        const rows = (await readRows()).filter((row) => row["event"] === "server_tool.paused");
        assert.deepEqual(rows.map((row) => row["reasonCode"]), ["pause_turn"]);
      } finally {
        await loopback.close();
      }
    });
  });
});

// —————————————————————— T7 默认关（请求体无 tools 追加） ——————————————————————

test("T7 loopback：未配置（默认关）→ 请求体无任何声明、零 server_tool 诊断、无启用行（逐字旧行为）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv(undefined, async () => {
    await withDiagnostics(async (readRows) => {
      const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("普通应答。") }));
      try {
        const session = await makeAdapter(loopback).bindRole(makeRole());
        await session.prompt("普通一轮");
        const events = await drain(session);
        const body = loopback.requests[0]!;
        assert.equal(requestHasDeclaration(body), false);
        assert.equal(JSON.stringify(body).includes("web_search_20250305"), false);
        const tools = body["tools"];
        assert.ok(tools === undefined || (Array.isArray(tools) && tools.length === 0), `无声明时 tools 应为空：${JSON.stringify(tools)}`);
        assert.equal(events.some((event) => String(event.summary).includes("本会话已启用服务端工具")), false);
        assert.equal(events.filter((event) => event.kind === "tool_call").length, 0);
        const rows = (await readRows()).filter((row) => String(row["event"]).startsWith("server_tool."));
        assert.deepEqual(rows, []);
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 1);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed");
      } finally {
        await loopback.close();
      }
    });
  });
});

// —————————————————————— T8 usage 缺省兜底 ——————————————————————

test("T8 loopback：网关不回传 usage.server_tool_use → 以成功调用块计数兜底（state=from-blocks）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      const eventsSse = [
        messageStart(),
        { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_C", name: "web_search", input: { query: "PROBE-QUERY-C" } } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_C", content: [{ type: "web_search_result", title: "TITLE-OMEGA", url: "https://example.test/omega" }] } },
        { type: "content_block_stop", index: 1 },
        ...textBlock(2, "完毕。"),
        // 关键：message_delta 不含 server_tool_use 计量。
        messageDelta("end_turn", { output_tokens: 3 }),
        messageStop(),
      ];
      const loopback = await startLoopback(() => ({ status: 200, sse: eventsSse }));
      try {
        const session = await makeAdapter(loopback).bindRole(makeRole());
        await session.prompt("统计一轮");
        await drain(session);
        const rows = (await readRows()).filter((row) => row["event"] === "server_tool.usage");
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!["state"], "from-blocks");
        assert.equal(rows[0]!["count"], 1);
        assert.equal(rows[0]!["toolName"], "web_search");
      } finally {
        await loopback.close();
      }
    });
  });
});
