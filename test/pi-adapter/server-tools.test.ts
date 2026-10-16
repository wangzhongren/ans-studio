// 服务端工具族（web_search/web_fetch）纯函数与扩展 handler 的单测。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 运行时**（本文件完全离线：纯函数 + 桩件扩展面）。
//
// 覆盖（对应提案 §五 测试计划）：
//   T1 配置解析（默认关/关闭值/形状逐字/未知 id 抛错/非法 max_uses 抛错/重复 id 抛错/空白容忍）；
//   T2 声明追加（尾部、幂等、非对象不动作）——wire 级真实参数捕获在 server-tools-wire.test.ts；
//   observer 状态机（调用/结果/错误变体/usage 两种来源/pause_turn/未知 stop_reason/加密诱饵不落地）；
//   扩展 handler（stub pi 面）：声明注入与会话级抑制、降级恰一次且判据全部满足才触发（防误判）、
//   行/诊断字段（**查询串不进诊断**）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGovernanceExtension } from "../../src/common/pi-adapter/real-adapter.ts";
import {
  appendServerToolDeclarations,
  createServerToolObserver,
  parseServerToolConfig,
  renderServerToolDegradedSummary,
  renderServerToolEnableNotice,
  requestRejectionStatus,
  SERVER_TOOL_ENV,
  SERVER_TOOL_PAUSED_SUMMARY,
  type ServerToolDeclaration,
  type ServerToolObservation,
} from "../../src/common/pi-adapter/server-tools.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";

const WEB_SEARCH_DECL: ServerToolDeclaration = { type: "web_search_20250305", name: "web_search", max_uses: 1 };

const sse = (data: unknown): unknown => data;

// —————————————————————— T1 配置解析 ——————————————————————

test("T1 配置解析：未设置/空/关闭值 ⇒ 关（默认）", () => {
  for (const env of [{}, { [SERVER_TOOL_ENV]: "" }, { [SERVER_TOOL_ENV]: "   " }, { [SERVER_TOOL_ENV]: "0" }, { [SERVER_TOOL_ENV]: "off" }, { [SERVER_TOOL_ENV]: "NONE" }]) {
    assert.deepEqual(parseServerToolConfig(env), { enabled: [] }, JSON.stringify(env));
  }
});

test("T1 配置解析：声明形状与客户探针逐字对齐；缺省 max_uses=1", () => {
  const parsed = parseServerToolConfig({ [SERVER_TOOL_ENV]: "web_search" });
  assert.deepEqual(parsed.enabled, [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
  // 与客户 2026-10-16 探针请求体逐字一致（探针已证：网关 HTTP 200、服务端真实执行）。
  assert.equal(JSON.stringify(parsed.enabled[0]), '{"type":"web_search_20250305","name":"web_search","max_uses":1}');
});

test("T1 配置解析：id:max_uses 覆盖、多工具、空白容忍（web_fetch 在首批）", () => {
  const parsed = parseServerToolConfig({ [SERVER_TOOL_ENV]: " web_search : 3 , web_fetch " });
  assert.deepEqual(parsed.enabled, [
    { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 },
  ]);
  // 尾随逗号容忍（不产生半开状态）
  assert.deepEqual(parseServerToolConfig({ [SERVER_TOOL_ENV]: "web_search," }).enabled.length, 1);
});

test("T1 配置解析：未知 id（含未列入首批的 code_execution）⇒ 构造期抛错且给出可用清单", () => {
  for (const bad of ["bogus", "web_search,bogus", "code_execution", "Web_Search"]) {
    assert.throws(
      () => parseServerToolConfig({ [SERVER_TOOL_ENV]: bad }),
      (err: unknown) => {
        const message = (err as Error).message;
        assert.match(message, /未知的服务端工具 id/);
        assert.match(message, /web_search/);
        assert.match(message, /web_fetch/);
        return true;
      },
      bad,
    );
  }
});

test("T1 配置解析：非法 max_uses / 重复 id ⇒ 抛错（不静默半开）", () => {
  for (const bad of ["web_search:0", "web_search:-1", "web_search:1.5", "web_search:abc", "web_search:"]) {
    assert.throws(() => parseServerToolConfig({ [SERVER_TOOL_ENV]: bad }), /max_uses 必须为正整数/, bad);
  }
  assert.throws(() => parseServerToolConfig({ [SERVER_TOOL_ENV]: "web_search,web_search:2" }), /重复/);
});

// —————————————————————— T2 声明追加（纯核心；wire 级另测） ——————————————————————

test("声明追加：tools 缺失时创建、已有时**追加在尾部**且不改动入参", () => {
  const clientTool = { name: "read_file", description: "x", input_schema: { type: "object" } };
  const payload = { model: "m", tools: [clientTool], stream: true };
  const result = appendServerToolDeclarations(payload, [WEB_SEARCH_DECL]);
  assert.equal(result.changed, true);
  assert.equal(result.present, true);
  const tools = (result.payload as { tools: unknown[] }).tools;
  assert.equal(tools.length, 2);
  assert.deepEqual(tools[1], WEB_SEARCH_DECL, "声明必须在尾部（缓存前缀不受损）");
  assert.equal((payload as { tools: unknown[] }).tools.length, 1, "入参不得被改动");
  assert.equal((result.payload as { stream: boolean }).stream, true, "其余字段原样保留");

  const created = appendServerToolDeclarations({ model: "m" }, [WEB_SEARCH_DECL]);
  assert.deepEqual((created.payload as { tools: unknown[] }).tools, [WEB_SEARCH_DECL]);
});

test("声明追加：幂等（已含同 type 即跳过；重复调用不重复追加）", () => {
  const payload = { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] };
  const result = appendServerToolDeclarations(payload, [WEB_SEARCH_DECL]);
  assert.equal(result.changed, false);
  assert.equal(result.present, true);
  assert.equal(result.payload, payload, "未改动时必须返回原引用");

  const first = appendServerToolDeclarations({ tools: [] }, [WEB_SEARCH_DECL]);
  const second = appendServerToolDeclarations(first.payload, [WEB_SEARCH_DECL]);
  assert.equal(second.changed, false);
  assert.equal((second.payload as { tools: unknown[] }).tools.length, 1, "重复注入不产生重复声明");
});

test("声明追加：payload/ tools 非预期形状 ⇒ 不动作（present=false，如实不半改）", () => {
  for (const payload of [null, "x", 42, [], { tools: "junk" }, { tools: {} }]) {
    const result = appendServerToolDeclarations(payload, [WEB_SEARCH_DECL]);
    assert.equal(result.changed, false);
    assert.equal(result.present, false);
    assert.equal(result.payload, payload);
  }
  assert.deepEqual(appendServerToolDeclarations({ tools: [] }, []), { payload: { tools: [] }, changed: false, present: false });
});

// —————————————————————— 文案 ——————————————————————

test("启用行/降级行/pause 行文案（含「按次计费」与「外部不可信」口径；降级为路径 C 措辞）", () => {
  const notice = renderServerToolEnableNotice([WEB_SEARCH_DECL, { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 }]);
  assert.match(notice, /本会话已启用服务端工具：web_search（max_uses=1，按次计费）、web_fetch（max_uses=2，按次计费）/);
  assert.match(notice, /按次计费/);
  assert.match(notice, /外部、不可信/);
  assert.match(notice, new RegExp(SERVER_TOOL_ENV));
  const degraded = renderServerToolDegradedSummary(400);
  assert.match(degraded, /HTTP 400/);
  assert.match(degraded, /已停用服务端工具声明/);
  assert.match(degraded, /未自动重试/);
  assert.match(SERVER_TOOL_PAUSED_SUMMARY, /pause_turn/);
});

test("requestRejectionStatus：只认「拒绝类」状态前缀；408/429 与无前缀一律 undefined", () => {
  assert.equal(requestRejectionStatus('400 {"type":"error"}'), 400);
  assert.equal(requestRejectionStatus("500 unknown variant"), 500);
  assert.equal(requestRejectionStatus(" 404 not found"), 404);
  assert.equal(requestRejectionStatus("401 unauthorized"), 401);
  assert.equal(requestRejectionStatus("429 Rate limited"), undefined);
  assert.equal(requestRejectionStatus("408 Request timeout"), undefined);
  assert.equal(requestRejectionStatus("301 moved"), undefined);
  assert.equal(requestRejectionStatus("Connection error."), undefined);
  assert.equal(requestRejectionStatus("Anthropic stream ended without a stop reason"), undefined);
  assert.equal(requestRejectionStatus(""), undefined);
});

// —————————————————————— observer 状态机 ——————————————————————

const CALL_START = sse({ type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_A", name: "web_search", input: {} } });
const QUERY_MARKER = "PROBE-QUERY-4711";
const ENCRYPTED_MARKER = "PROBE-BAIT-ENCRYPTED";

function observeAll(events: unknown[]): ServerToolObservation[] {
  const observer = createServerToolObserver();
  const out: ServerToolObservation[] = [];
  for (const event of events) out.push(...observer.observe(event));
  return out;
}

function successFlow(): unknown[] {
  return [
    sse({ type: "message_start", message: { id: "m1", usage: { input_tokens: 10 } } }),
    CALL_START,
    sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: QUERY_MARKER }) } }),
    sse({ type: "content_block_stop", index: 0 }),
    sse({
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_A",
        content: [
          { type: "web_search_result", title: "TITLE-ALPHA", url: "https://example.test/alpha?token=SECRET#frag", encrypted_content: ENCRYPTED_MARKER },
          { type: "web_search_result", title: "TITLE-BETA", url: "https://example.test/beta" },
        ],
      },
    }),
    sse({ type: "content_block_stop", index: 1 }),
    sse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4, server_tool_use: { web_search_requests: 1 } } }),
    sse({ type: "message_stop" }),
  ];
}

test("observer：调用 start→结果行（查询/标题/URL 白名单字段；加密诱饵与 URL 全文副本绝不出现）", () => {
  const observations = observeAll(successFlow());
  assert.deepEqual(observations.map((o) => o.kind), ["call-start", "call-result", "usage"]);
  const start = observations[0];
  assert.deepEqual(start, { kind: "call-start", toolName: "web_search", toolCallId: "srvtoolu_A" });
  const result = observations[1];
  assert.equal(result.kind, "call-result");
  if (result.kind !== "call-result") throw new Error("unreachable");
  assert.match(result.message, /查询「PROBE-QUERY-4711」/);
  assert.match(result.message, /→ 2 条结果/);
  assert.match(result.message, /TITLE-ALPHA — https:\/\/example\.test\/alpha\?token=SECRET#frag/);
  assert.match(result.message, /TITLE-BETA/);
  const usage = observations[2];
  assert.deepEqual(usage, { kind: "usage", toolName: "web_search", count: 1, state: "from-usage" });
  // 加密内容诱饵：observer 输出里绝不含（本模块代码不读该字段）。
  assert.equal(JSON.stringify(observations).includes(ENCRYPTED_MARKER), false);
});

test("observer：结果块错误变体（max_uses_exceeded）⇒ call-denied、非运行错误文案", () => {
  const observations = observeAll([
    sse({ type: "message_start", message: { id: "m1" } }),
    CALL_START,
    sse({ type: "content_block_stop", index: 0 }),
    sse({
      type: "content_block_start",
      index: 1,
      content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_A", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    }),
    sse({ type: "content_block_stop", index: 1 }),
    sse({ type: "message_stop" }),
  ]);
  const denied = observations.find((o) => o.kind === "call-denied");
  assert.ok(denied !== undefined);
  if (denied?.kind !== "call-denied") throw new Error("unreachable");
  assert.equal(denied.errorCode, "MAX_USES_EXCEEDED");
  assert.match(denied.message, /搜索次数已达上限（max_uses_exceeded）/);
  assert.match(denied.message, /非运行错误/);
});

test("observer：结果块 delta 增量形状容忍（start 无 content，delta 累积 JSON，stop 定形）", () => {
  const content = JSON.stringify([{ type: "web_search_result", title: "TITLE-GAMMA", url: "https://example.test/gamma" }]);
  const observations = observeAll([
    sse({ type: "message_start", message: { id: "m1" } }),
    CALL_START,
    sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: `{"query":"B"}` } }),
    sse({ type: "content_block_stop", index: 0 }),
    sse({ type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_A" } }),
    sse({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: content.slice(0, 20) } }),
    sse({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: content.slice(20) } }),
    sse({ type: "content_block_stop", index: 1 }),
    sse({ type: "message_stop" }),
  ]);
  const result = observations.find((o) => o.kind === "call-result");
  assert.ok(result !== undefined);
  if (result?.kind !== "call-result") throw new Error("unreachable");
  assert.match(result.message, /TITLE-GAMMA/);
  assert.match(result.message, /查询「B」/);
});

test("observer：web_fetch 形状（start 内联 input.url；结果 content 为对象）⇒ 抓取行", () => {
  const observations = observeAll([
    sse({ type: "message_start", message: { id: "m1" } }),
    sse({ type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_F", name: "web_fetch", input: { url: "https://example.test/page" } } }),
    sse({ type: "content_block_stop", index: 0 }),
    sse({ type: "content_block_start", index: 1, content_block: { type: "web_fetch_tool_result", tool_use_id: "srvtoolu_F", content: { type: "web_fetch_result", url: "https://example.test/page", title: "PAGE-TITLE" } } }),
    sse({ type: "content_block_stop", index: 1 }),
    sse({ type: "message_stop" }),
  ]);
  const result = observations.find((o) => o.kind === "call-result");
  if (result?.kind !== "call-result") throw new Error("unreachable");
  assert.match(result.message, /抓取「https:\/\/example\.test\/page」/);
  assert.match(result.message, /页面内容已返回：PAGE-TITLE/);
});

test("observer：usage 缺省兜底 from-blocks（网关不回传 server_tool_use）", () => {
  const observations = observeAll([
    sse({ type: "message_start", message: { id: "m1" } }),
    CALL_START,
    sse({ type: "content_block_stop", index: 0 }),
    sse({ type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_A", content: [{ type: "web_search_result", title: "T", url: "https://example.test/t" }] } }),
    sse({ type: "content_block_stop", index: 1 }),
    sse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }),
    sse({ type: "message_stop" }),
  ]);
  const usage = observations.filter((o) => o.kind === "usage");
  assert.deepEqual(usage, [{ kind: "usage", toolName: "web_search", count: 1, state: "from-blocks" }]);
});

test("observer：pause_turn 恰一次 + 未知 stop_reason 如实记录", () => {
  const paused = observeAll([
    sse({ type: "message_start", message: { id: "m1" } }),
    sse({ type: "message_delta", delta: { stop_reason: "pause_turn" } }),
    sse({ type: "message_delta", delta: { stop_reason: "pause_turn" } }),
    sse({ type: "message_stop" }),
  ]);
  assert.deepEqual(paused, [{ kind: "paused" }]);
  const unknown = observeAll([sse({ type: "message_start", message: { id: "m1" } }), sse({ type: "message_delta", delta: { stop_reason: "totally_new_reason" } })]);
  assert.deepEqual(unknown, [{ kind: "unknown-stop-reason", reason: "totally_new_reason" }]);
});

test("observer：非识别输入一律空数组且不抛（O(1) 早退面）", () => {
  const observer = createServerToolObserver();
  for (const data of [null, undefined, "x", 42, [], {}, { type: "message_stop" }, { type: "content_block_start" }, { type: "content_block_delta", index: 9 }, { type: "unknown_event" }]) {
    assert.deepEqual(observer.observe(data), [], JSON.stringify(data));
  }
});

// —————————————————————— 扩展 handler（stub pi 面） ——————————————————————

interface Harness {
  hooks: Map<string, (event: any) => unknown>;
  events: SessionEvent[];
  records: Array<{ event: string; fields?: Record<string, unknown> }>;
}

function harness(serverTools?: { declarations: readonly ServerToolDeclaration[] }, projectToolEvent?: boolean): Harness {
  const hooks = new Map<string, (event: any) => unknown>();
  const events: SessionEvent[] = [];
  const records: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  buildGovernanceExtension(() => { throw new Error("no gate"); }, (event) => events.push(event), true, {
    currentTurnId: () => "turn-1",
    diagnostics: { record: (event, fields) => records.push({ event, fields }), error: (event, _error, fields) => records.push({ event, fields }) },
    ...(projectToolEvent ? { projectToolEvent: (source: any) => ({ kind: source.phase === "start" ? "tool_call" : "accepted", summary: `${source.toolName} ${source.phase}`, detail: { toolName: source.toolName, phase: source.phase, toolCallId: source.toolCallId, display: { version: 1, omissions: [], ...(source.input !== undefined ? { inputRule: source.input.rule } : {}), ...(source.result !== undefined ? { resultOk: source.result.ok } : {}) } } }) } : {}),
    ...(serverTools !== undefined ? { serverTools } : {}),
  }).factory({ on: (name: string, handler: (event: any) => unknown) => { hooks.set(name, handler); } } as never);
  return { hooks, events, records };
}

test("扩展：未传 serverTools ⇒ **零注册**（默认关零开销；行为逐字与旧版一致）", () => {
  const h = harness();
  for (const name of ["before_provider_request", "provider_stream_event"]) {
    assert.equal(h.hooks.has(name), false, name);
  }
  // message_end 的既有文本映射仍注册（旧行为）；不启用时我们的降级 handler 不注册（此处仅结构断言）。
  assert.equal(h.hooks.has("message_end"), true);
});

test("扩展：启用后 before_provider_request 注入声明（尾部/幂等/新请求重注入）；诊断零查询串", () => {
  const h = harness({ declarations: [WEB_SEARCH_DECL] });
  const clientTool = { name: "read_file", input_schema: { type: "object" } };
  const first = h.hooks.get("before_provider_request")!({ type: "before_provider_request", payload: { model: "m", tools: [clientTool], stream: true } }) as { tools: unknown[] };
  assert.equal(first.tools.length, 2);
  assert.deepEqual(first.tools[1], WEB_SEARCH_DECL);
  // 同一 payload 再次经过（幂等）：返回 undefined（透传原 payload）
  assert.equal(h.hooks.get("before_provider_request")!({ payload: first }), undefined);
  // 新请求（新 payload）重新注入——每请求一致是缓存前缀不受损的前提
  const second = h.hooks.get("before_provider_request")!({ payload: { model: "m", tools: [clientTool], stream: true } }) as { tools: unknown[] };
  assert.equal(second.tools.length, 2);
});

test("扩展：4xx 降级（路径 C）——判据全满足才触发、恰一次、此后请求不再附带声明", () => {
  const h = harness({ declarations: [WEB_SEARCH_DECL] });
  const before = h.hooks.get("before_provider_request")!;
  const messageEnd = h.hooks.get("message_end")!;

  // 请求 1：含声明 + error 收场 + 错误前缀 400 ⇒ 降级。
  assert.notEqual(before({ payload: { tools: [] } }), undefined);
  messageEnd({ message: { role: "assistant", stopReason: "error", errorMessage: '400 {"type":"error","error":{"message":"unsupported server tool"}}' } });
  const degraded = h.events.filter((event) => event.kind === "message" && String(event.summary).includes("已停用服务端工具声明"));
  assert.equal(degraded.length, 1, "降级行恰一次");
  const diag = h.records.filter((record) => record.event === "server_tool.degraded");
  assert.deepEqual(diag.map((record) => record.fields), [{ turnId: "turn-1", errorCode: "GATEWAY_REJECTED_HTTP_400", state: "suppressed" }]);

  // 重复的 message_end 不得二次降级。
  messageEnd({ message: { role: "assistant", stopReason: "error", errorMessage: "500 boom" } });
  assert.equal(h.events.filter((event) => event.kind === "message" && String(event.summary).includes("已停用服务端工具声明")).length, 1);

  // 后续请求：suppressed ⇒ 不再注入（返回 undefined）。
  assert.equal(before({ payload: { tools: [] } }), undefined);
});

test("扩展：降级防误判——未含声明 / 非 error 收场 / 错误无状态前缀 / 408/429 任一项都不降级；5xx 属拒绝类照降", () => {
  const degradeRows = (h: Harness): number => h.events.filter((event) => String(event.summary).includes("已停用服务端工具声明")).length;
  // 场景 A：错误消息无状态前缀（流内错误/包装错误——无法归属声明）⇒ 不降级
  {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: [] } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "Anthropic stream ended without a stop reason" } });
    assert.equal(degradeRows(h), 0);
  }
  // 场景 B：网络错误（无 HTTP 响应）⇒ 不降级
  {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: [] } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "Connection error." } });
    assert.equal(degradeRows(h), 0);
  }
  // 场景 C：本请求未携带声明（payload 形状不可注入）⇒ 不降级
  {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: "junk" } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "400 x" } });
    assert.equal(degradeRows(h), 0);
  }
  // 场景 D：stopReason 正常 ⇒ 不降级（错误前缀在场也一样）
  {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: [] } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "stop", errorMessage: "500 x" } });
    assert.equal(degradeRows(h), 0);
  }
  // 场景 E：408/429 属瞬时态（与声明无关）⇒ 不降级
  for (const errorMessage of ["408 Request timeout", "429 Rate limited"]) {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: [] } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage } });
    assert.equal(degradeRows(h), 0, errorMessage);
  }
  // 场景 F：5xx（「不认声明」历史案例形态——tool_removal 曾以 500 整段被拒）属拒绝类 ⇒ 降级
  {
    const h = harness({ declarations: [WEB_SEARCH_DECL] });
    h.hooks.get("before_provider_request")!({ payload: { tools: [] } });
    h.hooks.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "500 {\"detail\":\"unknown variant 'web_search_20250305'\"}" } });
    assert.equal(degradeRows(h), 1);
    assert.deepEqual(h.records.filter((record) => record.event === "server_tool.degraded").map((record) => record.fields), [{ turnId: "turn-1", errorCode: "GATEWAY_REJECTED_HTTP_500", state: "suppressed" }]);
  }
});

test("扩展：provider_stream_event → 行 + 诊断（**查询串不进诊断**；非 anthropic-messages 早退）", () => {
  const h = harness({ declarations: [WEB_SEARCH_DECL] }, false);
  const stream = h.hooks.get("provider_stream_event")!;
  // 其它 api 早退
  stream({ api: "openai-responses", data: { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "x", name: "web_search", input: {} } } });
  assert.equal(h.events.length, 0);
  assert.equal(h.records.length, 0);

  for (const event of successFlow()) stream({ api: "anthropic-messages", data: event });
  const starts = h.events.filter((event) => event.kind === "tool_call");
  const results = h.events.filter((event) => event.kind === "accepted");
  assert.equal(starts.length, 1);
  assert.equal(results.length, 1);
  assert.match(String(results[0]?.summary), /TITLE-ALPHA/);
  assert.deepEqual(
    h.records.filter((record) => record.event.startsWith("server_tool.")).map((record) => [record.event, record.fields?.toolName ?? record.fields?.state ?? null]),
    [["server_tool.call", "web_search"], ["server_tool.usage", "web_search"]],
  );
  // 查询串（正文类）**不进诊断**；结果标题/URL 只进行（聊天流层）。
  const diagnosticsText = JSON.stringify(h.records);
  assert.equal(diagnosticsText.includes(QUERY_MARKER), false);
  assert.equal(diagnosticsText.includes("TITLE-ALPHA"), false);
  assert.equal(diagnosticsText.includes(ENCRYPTED_MARKER), false);
});

test("扩展：projector 路径的行形状（native-start/native-result；input rule 为 none）", () => {
  const h = harness({ declarations: [WEB_SEARCH_DECL] }, true);
  const stream = h.hooks.get("provider_stream_event")!;
  for (const event of successFlow()) stream({ api: "anthropic-messages", data: event });
  const start = h.events.find((event) => event.kind === "tool_call")!;
  const display = (start.detail as any).display;
  assert.equal(display.inputRule, "none");
  const result = h.events.find((event) => event.kind === "accepted")!;
  assert.equal((result.detail as any).display.resultOk, true);
});

test("扩展：pause_turn → 如实行 + 诊断；unknown-stop-reason → 仅诊断", () => {
  const h = harness({ declarations: [WEB_SEARCH_DECL] });
  const stream = h.hooks.get("provider_stream_event")!;
  stream({ api: "anthropic-messages", data: sse({ type: "message_start", message: { id: "m1" } }) });
  stream({ api: "anthropic-messages", data: sse({ type: "message_delta", delta: { stop_reason: "pause_turn" } }) });
  assert.ok(h.events.some((event) => event.kind === "message" && event.summary === SERVER_TOOL_PAUSED_SUMMARY));
  assert.deepEqual(h.records.filter((record) => record.event === "server_tool.paused").map((record) => record.fields), [{ turnId: "turn-1", reasonCode: "pause_turn" }]);
  stream({ api: "anthropic-messages", data: sse({ type: "message_delta", delta: { stop_reason: "brand_new" } }) });
  assert.deepEqual(h.records.filter((record) => record.event === "server_tool.unknown_stop_reason").map((record) => record.fields), [{ turnId: "turn-1", reasonCode: "brand_new" }]);
});
