// G-3 独立验证（测试角色）：Pi 适配器端到端（127.0.0.1 loopback 假服务器，零外网）——
//   1) 默认关/显式关（off、0）⇒ 逐字旧行为（请求体零声明、零 server_tool 诊断、零工具行）；
//   2) 开启 ⇒ 声明上 wire（尾部）＋恰一对 start/result 行＋查询/标题会话内可见＋URL query 被剥＋
//      **查询串/标题/加密诱饵在诊断落盘与事件流零泄漏**（spy 全量断言）；
//   3) 跨轮配对（id 关联、turnId 不串）与错误变体（自选 error_code）如实 denied、毁轮次？
//   4) 降级链：400 ⇒ 本轮如实失败＋降级恰一次＋此后（含第 2 轮）请求不再附声明且轮次正常完成；
//      纯函数面已覆盖 5xx/408/429 状码判定（见 pi-parse-verify.test.ts）。
// **不复用实施方断言**：夹具、SSE 素材、标记词、场景全部本文件独立构造。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRealPiRuntimeAdapter } from "../../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../../src/common/pi-adapter/timeout.ts";
import { SERVER_TOOL_ENV, type ServerToolDeclaration } from "../../../src/common/pi-adapter/server-tools.ts";
import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../../src/common/shared/diagnostics.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import type { SessionEvent } from "../../../src/model/runtime.ts";

const AUTH_ENV = "ANTHROPIC_AUTH_TOKEN";
if (!process.env[AUTH_ENV]) process.env[AUTH_ENV] = "g3-verify-placeholder-token";
const MODEL_ID = "g3-verify-model";

const DECL: ServerToolDeclaration = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
const QUERY = "独立对抗查询-ZX9";
const TITLE_A = "独立标题-ALPHA";
const TITLE_B = "独立标题-BETA";
const BAIT_ENCRYPTED = "对抗诱饵-ENCRYPTED-BLOB";
const URL_SECRET = "对抗参数-绝不外泄";
const PLAIN_URL = "https://verify.test/entry?token=" + URL_SECRET + "#frag";

const role: ResolvedRole = {
  id: "g3-verify-pi", kind: "project", cardText: "# G-3 验证角色",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
};

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

interface LoopResponse { status: number; sse?: unknown[]; json?: unknown }
interface Loopback { baseUrl: string; requests: Record<string, unknown>[]; close(): Promise<void> }

async function startLoopback(respond: (body: Record<string, unknown>, index: number) => LoopResponse): Promise<Loopback> {
  const requests: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { body = {}; }
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
  return { baseUrl: `http://127.0.0.1:${port}/`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/** env 作用域：把 ANS_PI_SERVER_TOOLS 设为定值再恢复（不与其他用例互污染）。 */
async function withEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env[SERVER_TOOL_ENV];
  if (value === undefined) delete process.env[SERVER_TOOL_ENV];
  else process.env[SERVER_TOOL_ENV] = value;
  try { return await run(); } finally {
    if (previous === undefined) delete process.env[SERVER_TOOL_ENV];
    else process.env[SERVER_TOOL_ENV] = previous;
  }
}

/** 诊断落盘作用域：临时目录 + flush 后读全量行。 */
async function withDiagnostics<T>(run: (readAll: () => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-g3-verify-diag-"));
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

const silentLogger = { stage() {}, trace() {}, traceEnabled: false };

let turnSeq = 0;
function makeAdapter(loopback: Loopback, extra: Record<string, unknown> = {}) {
  turnSeq = 0;
  return createRealPiRuntimeAdapter({
    runtime: "pi",
    projectRoot: process.cwd(),
    skillRoot: process.cwd(),
    tools: [],
    interactionGate: createInteractionGate(),
    currentTurnId: () => `g3-turn-${(turnSeq += 1)}`,
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

const hasDecl = (body: Record<string, unknown>): boolean => JSON.stringify(body["tools"] ?? []).includes("web_search_20250305");
const messageStart = () => ({ type: "message_start", message: { id: "msg_g3", type: "message", role: "assistant", model: MODEL_ID, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } });
const textBlock = (index: number, text: string): unknown[] => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index },
];
const endTurn = (usage?: unknown): unknown => ({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: usage ?? { output_tokens: 2 } });

/** 成功检索往返（独立标记词 + 加密诱饵 + 带参数 URL）。delta 形状给查询、start 形状给结果（两形状混用）。 */
const searchRoundTrip = (callId: string, query: string, title: string): unknown[] => [
  messageStart(),
  { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: callId, name: "web_search" } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query }) } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: callId, content: [
    { type: "web_search_result", title, url: PLAIN_URL, encrypted_content: BAIT_ENCRYPTED },
    { type: "web_search_result", title: TITLE_B, url: "https://verify.test/beta" },
  ] } },
  { type: "content_block_stop", index: 1 },
  ...textBlock(2, "检索完成。"),
  endTurn({ output_tokens: 3, server_tool_use: { web_search_requests: 1 } }),
  { type: "message_stop" },
];
const plainRoundTrip = (text: string): unknown[] => [messageStart(), ...textBlock(0, text), endTurn(), { type: "message_stop" }];

const ALLOWED_DIAG_KEYS = new Set([
  "at", "level", "pid", "component", "event", "projectRoot", "roleId",
  "turnId", "toolCallId", "toolName", "path", "outcome", "durationMs", "timeoutMs", "ok",
  "errorType", "errorCode", "errorMessage", "requestId", "decision", "reasonCode",
  "state", "count", "queueDepth", "reportSource", "pid2", "sourceRoleId", "targetRoleId",
  "sessionId", "phase", "mode", "replayPlan", "rowCount", "firstRow", "lastRow",
  "visibleCount", "pendingCount", "exitCode", "signal", "authorizationSource",
  "attempt", "supported", "busy", "resumed", "contextSource", "eventKind", "url",
]);

// —————————————————————— 1) 默认关/显式关 ——————————————————————

test("隔离：ANS_PI_SERVER_TOOLS=off / 0（显式关）⇒ 请求体零声明、零 server_tool 诊断、零工具行（逐字旧行为）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  for (const value of ["off", "0"]) {
    await withEnv(value, async () => {
      await withDiagnostics(async (readAll) => {
        const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("普通应答。") }));
        try {
          const session = await makeAdapter(loopback).bindRole(role);
          await session.prompt("普通一轮");
          const events = await drain(session);

          assert.equal(loopback.requests.length, 1);
          const body = loopback.requests[0]!;
          assert.equal(hasDecl(body), false, `[${value}] 请求体不得含声明`);
          assert.equal(JSON.stringify(body).includes("web_search_20250305"), false);
          const tools = body["tools"];
          assert.ok(tools === undefined || (Array.isArray(tools) && tools.length === 0));
          assert.equal(events.some((event) => String(event.summary).includes("本会话已启用服务端工具")), false);
          assert.equal(events.filter((event) => event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied").length, 0);
          assert.deepEqual((await readAll()).filter((row) => String(row["event"]).startsWith("server_tool.")), []);
          const settled = events.filter((event) => event.kind === "settled");
          assert.equal(settled.length, 1);
          assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed");
        } finally { await loopback.close(); }
      });
    });
  }
});

test("构造期 fail-closed：未知 id（code_execution/伪造名）⇒ bindRole 抛错且抛错先于任何网络（loopback 零请求）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  for (const bad of ["code_execution", "frobnicator:2", "web_search:0"]) {
    await withEnv(bad, async () => {
      const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("不应到达。") }));
      try {
        await assert.rejects(makeAdapter(loopback).bindRole(role), /未知的服务端工具 id|max_uses 必须为正整数/, bad);
        assert.equal(loopback.requests.length, 0, `「${bad}」构造期失败不得发出任何请求`);
      } finally { await loopback.close(); }
    });
  }
});

// —————————————————————— 2) 开启：成功往返 + 零泄漏 ——————————————————————

test("开启成功往返：声明尾部上 wire、恰一对 start/result、查询/标题会话内可见、URL query 剥除、诱饵零泄漏", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  await withEnv("web_search", async () => {
    await withDiagnostics(async (readAll) => {
      const loopback = await startLoopback(() => ({ status: 200, sse: searchRoundTrip("vtool_1", QUERY, TITLE_A) }));
      try {
        const projector = createToolDisplayContext();
        const session = await makeAdapter(loopback, { projectToolEvent: projector.projectToolEvent }).bindRole(role);
        await session.prompt("做一次独立检索");
        const events = await drain(session);

        // wire：恰一请求；声明在 tools 尾部且逐字；无 tool_removal/tool_addition。
        assert.equal(loopback.requests.length, 1);
        const body = loopback.requests[0]!;
        const tools = body["tools"] as unknown[];
        assert.ok(Array.isArray(tools) && tools.length === 1);
        assert.deepEqual(tools[0], DECL);
        const bodyText = JSON.stringify(body);
        assert.equal(bodyText.includes("tool_removal"), false);
        assert.equal(bodyText.includes("tool_addition"), false);
        assert.equal(body["stream"], true);

        // 行：恰一对（start/result），id 关联；查询与标题在显示结果文本；URL query/fragment 被剥除。
        const starts = events.filter((event) => event.kind === "tool_call");
        const results = events.filter((event) => event.kind === "accepted");
        assert.equal(starts.length, 1);
        assert.equal(results.length, 1);
        const sd = starts[0]!.detail as Record<string, unknown>;
        assert.equal(sd["toolName"], "web_search");
        assert.equal(sd["toolCallId"], "vtool_1");
        assert.equal(sd["phase"], "start");
        assert.equal((sd["display"] as { omissions: unknown[] }).omissions.length, 0);
        const rd = results[0]!.detail as Record<string, unknown>;
        assert.equal(rd["phase"], "result");
        assert.equal(rd["ok"], true);
        const resultText = (rd["display"] as { resultText: { text: string } }).resultText.text;
        assert.ok(resultText.includes(`查询「${QUERY}」`), "查询在结果行可见（会话内）");
        assert.ok(resultText.includes(TITLE_A), "首条结果标题在会话内可见");
        assert.ok(resultText.includes("https://verify.test/entry"), "URL host+path 可见");
        assert.equal(resultText.includes(URL_SECRET), false, "URL query 被显示 profile 剥除");
        assert.equal(resultText.includes("#frag"), false, "URL fragment 被剥除");
        // 备注项（既有显示层口径，非本批改动面；minimal repro 见证据 raw/cleanpatterns-url-greedy-repro.txt）：
        // cleanPatterns 的 URL 贪婪匹配 `https?://[^\s<>"']+` 把**与 URL 紧贴（无 ASCII 空白）的后续文本**一并
        // 吞掉并以归一 URL 替换——组内以「；」连接、URL 后无空格 ⇒ 第 2 条起标题被吞（丢文本、不泄文本）。
        // 本断言如实钉住当前可观察行为（实施记录未覆盖该交互；缺陷候选上报 PM，本角色不修）。
        assert.equal(resultText.includes(TITLE_B), false, "（备注）第 2 条标题被既有 URL 贪吃口径吞掉——如实登记");
        assert.ok(events.some((event) => event.kind === "message" && event.summary === "检索完成。"));

        // ③ 零泄漏（spy 全量断言）：事件流与诊断落盘都不含查询串/标题/加密诱饵/URL 秘密参数。
        const eventsText = JSON.stringify(events);
        for (const secret of [BAIT_ENCRYPTED, URL_SECRET]) assert.equal(eventsText.includes(secret), false, `事件流含 ${secret}`);
        const rows = await readAll();
        assert.equal(JSON.stringify(rows).includes(QUERY), false, "查询串绝不进诊断落盘");
        assert.equal(JSON.stringify(rows).includes(TITLE_A), false, "结果标题不进诊断落盘");
        assert.equal(JSON.stringify(rows).includes(BAIT_ENCRYPTED), false, "加密诱饵不进任何落盘");
        const serverRows = rows.filter((row) => String(row["event"]).startsWith("server_tool."));
        assert.deepEqual(serverRows.map((row) => row["event"]).sort(), ["server_tool.call", "server_tool.declare", "server_tool.usage"]);
        for (const row of serverRows) for (const key of Object.keys(row)) assert.ok(ALLOWED_DIAG_KEYS.has(key), `诊断出现白名单外字段：${key}`);
        const usage = serverRows.find((row) => row["event"] === "server_tool.usage")!;
        assert.deepEqual({ toolName: usage["toolName"], count: usage["count"], state: usage["state"] }, { toolName: "web_search", count: 1, state: "from-usage" });
        const call = serverRows.find((row) => row["event"] === "server_tool.call")!;
        assert.equal(call["toolCallId"], "vtool_1");

        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 1);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed");
      } finally { await loopback.close(); }
    });
  });
});

test("错误变体对抗（自选 error_code=unavailable）：denied 如实、非运行错误、轮次 completed、诊断类别归一", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  await withEnv("web_search", async () => {
    await withDiagnostics(async (readAll) => {
      const sse = [
        messageStart(),
        { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "vtool_err", name: "web_search", input: { query: QUERY } } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "vtool_err", content: { type: "web_search_tool_result_error", error_code: "unavailable" } } },
        { type: "content_block_stop", index: 1 },
        ...textBlock(2, "已如实说明。"),
        endTurn({ output_tokens: 2, server_tool_use: { web_search_requests: 1 } }),
        { type: "message_stop" },
      ];
      const loopback = await startLoopback(() => ({ status: 200, sse }));
      try {
        const session = await makeAdapter(loopback).bindRole(role);
        await session.prompt("触发错误变体");
        const events = await drain(session);
        const denied = events.filter((event) => event.kind === "denied");
        assert.equal(denied.length, 1);
        assert.ok(String(denied[0]!.summary).includes("非运行错误"));
        assert.equal(events.filter((event) => event.kind === "accepted").length, 0);
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "completed", "错误变体绝不映射为轮次失败");
        const degraded = (await readAll()).filter((row) => row["event"] === "server_tool.degraded");
        assert.deepEqual(degraded.map((row) => ({ toolName: row["toolName"], errorCode: row["errorCode"], ok: row["ok"] })), [{ toolName: "web_search", errorCode: "UNAVAILABLE", ok: false }]);
      } finally { await loopback.close(); }
    });
  });
});

// —————————————————————— 3) 跨轮配对（id 关联、turnId 不串） ——————————————————————

test("跨轮配对：两轮各一次检索 ⇒ 每轮恰一对、turnId 归各自轮、结果文本各自对应（id 不串）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  await withEnv("web_search", async () => {
    const responses = [searchRoundTrip("vtool_r1", QUERY + "-1", TITLE_A + "-1"), searchRoundTrip("vtool_r2", QUERY + "-2", TITLE_A + "-2")];
    const loopback = await startLoopback((_body, index) => ({ status: 200, sse: responses[Math.min(index, 1)]! }));
    try {
      const projector = createToolDisplayContext();
      const session = await makeAdapter(loopback, { projectToolEvent: projector.projectToolEvent }).bindRole(role);
      await session.prompt("第一轮检索");
      await session.prompt("第二轮检索");
      const events = await drain(session);

      const rounds = new Map<string, { starts: SessionEvent[]; results: SessionEvent[] }>();
      for (const event of events) {
        const row = rounds.get(event.turnId ?? "") ?? { starts: [], results: [] };
        if (event.kind === "tool_call") row.starts.push(event);
        if (event.kind === "accepted") row.results.push(event);
        rounds.set(event.turnId ?? "", row);
      }
      const turn1 = rounds.get("g3-turn-1");
      const turn2 = rounds.get("g3-turn-2");
      assert.ok(turn1 && turn2, `轮次归属应恰为 g3-turn-1/2：${[...rounds.keys()].join(",")}`);
      assert.equal(turn1.starts.length, 1);
      assert.equal(turn1.results.length, 1);
      assert.equal(turn2.starts.length, 1);
      assert.equal(turn2.results.length, 1);
      assert.equal((turn1.starts[0]!.detail as Record<string, unknown>)["toolCallId"], "vtool_r1");
      assert.equal((turn2.starts[0]!.detail as Record<string, unknown>)["toolCallId"], "vtool_r2");
      const text1 = ((turn1.results[0]!.detail as Record<string, unknown>)["display"] as { resultText: { text: string } }).resultText.text;
      const text2 = ((turn2.results[0]!.detail as Record<string, unknown>)["display"] as { resultText: { text: string } }).resultText.text;
      assert.ok(text1.includes(QUERY + "-1") && text1.includes(TITLE_A + "-1") && !text1.includes(QUERY + "-2"), "第 1 轮结果只含第 1 轮事实");
      assert.ok(text2.includes(QUERY + "-2") && text2.includes(TITLE_A + "-2") && !text2.includes(QUERY + "-1"), "第 2 轮结果只含第 2 轮事实");
      assert.equal(events.filter((event) => event.kind === "settled").length, 2);
    } finally { await loopback.close(); }
  });
});

// —————————————————————— 4) 降级链（路径 C） ——————————————————————

test("降级链：网关对含声明请求回 400 ⇒ 本轮如实失败＋降级恰一次＋后续（含第 2 轮）不再附声明且轮次正常完成", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 pi-coding-agent"); return; }
  await withEnv("web_search", async () => {
    await withDiagnostics(async (readAll) => {
      const loopback = await startLoopback((body) =>
        hasDecl(body)
          ? { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "G3-VERIFY-BODY-绝不进诊断" } } }
          : { status: 200, sse: plainRoundTrip("已恢复正常。") },
      );
      try {
        const session = await makeAdapter(loopback).bindRole(role);
        await session.prompt("第一轮");
        await session.prompt("第二轮");
        const events = await drain(session);

        const declRequests = loopback.requests.filter((body) => hasDecl(body));
        assert.equal(declRequests.length, 1, "恰一个请求携带声明（第 1 轮）");
        assert.ok(loopback.requests.length >= 2, "降级后第 2 轮请求不得再带声明");
        assert.deepEqual((declRequests[0]!["tools"] as unknown[])[0], DECL);

        const degradedRows = events.filter((event) => event.kind === "message" && String(event.summary).includes("网关拒绝了包含服务端工具声明的请求（HTTP 400）"));
        assert.equal(degradedRows.length, 1, "降级行恰一次");
        assert.ok(String(degradedRows[0]!.summary).includes("未自动重试"));
        const settled = events.filter((event) => event.kind === "settled");
        assert.equal(settled.length, 2);
        assert.equal((settled[0]!.detail as Record<string, unknown>)["outcome"], "failed", "第 1 轮如实失败（既有口径）");
        assert.equal((settled[1]!.detail as Record<string, unknown>)["outcome"], "completed", "第 2 轮正常完成（会话可用、不自动剥离重试）");
        assert.ok(events.some((event) => event.kind === "message" && event.summary === "已恢复正常。"));

        const rows = await readAll();
        const degraded = rows.filter((row) => row["event"] === "server_tool.degraded");
        assert.deepEqual(degraded.map((row) => ({ errorCode: row["errorCode"], state: row["state"] })), [{ errorCode: "GATEWAY_REJECTED_HTTP_400", state: "suppressed" }], "降级诊断恰一次、只存类别");
        assert.equal(JSON.stringify(rows).includes("G3-VERIFY-BODY"), false, "响应体绝不落诊断");
      } finally { await loopback.close(); }
    });
  });
});
