// G-3 独立验证（测试角色）：Pi 侧纯函数对抗——配置解析 fail-closed / 声明追加幂等 / 降级状码抽取 /
// 原始事件观测状态机。**不复用实施方断言**：全部输入与断言本文件独立构造（对照批准口径 ①②③④）。
//
// 运行：node --test "test/测试/g3-search-verify/pi-parse-verify.test.ts"（零网络）。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_TOOL_ENV,
  SERVER_TOOL_REGISTRY,
  parseServerToolConfig,
  appendServerToolDeclarations,
  requestRejectionStatus,
  renderServerToolDegradedSummary,
  renderServerToolEnableNotice,
  createServerToolObserver,
  SERVER_TOOL_PAUSED_SUMMARY,
} from "../../../src/common/pi-adapter/server-tools.ts";

const on = (value: string) => parseServerToolConfig({ [SERVER_TOOL_ENV]: value });

// ————————————————— ① 开关默认关/白名单：默认关（未设/空/关闭值/空白）逐面无启用项 —————————————————

test("默认关：未设置/空串/纯空白/0/off/none（大小写与空白变体）一律 {enabled:[]}", () => {
  for (const value of [undefined, "", "   ", "\t\n", "0", " off ", "OFF", "None", "NONE", " off\t"]) {
    const parsed = parseServerToolConfig(value === undefined ? {} : { [SERVER_TOOL_ENV]: value });
    assert.deepEqual(parsed, { enabled: [] }, `值=${JSON.stringify(value)}`);
  }
});

test("开启面：声明逐字形状（type/name/max_uses）——web_search 与客户探针形状对齐，web_fetch 同族", () => {
  assert.deepEqual(on("web_search"), { enabled: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }] });
  const both = on(" web_search:2 , web_fetch ");
  assert.deepEqual(both.enabled, [
    { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 },
  ]);
  assert.deepEqual(on("web_search:" + "7").enabled[0]!.max_uses, 7);
});

test("尾随逗号/多余分隔容忍且不产生半开项；重复 id 即便大小写不同也拒", () => {
  assert.deepEqual(on("web_search,").enabled.length, 1);
  assert.deepEqual(on(", ,web_search,, ").enabled.length, 1);
  assert.throws(() => on("web_search,web_search"), /重复/);
  assert.throws(() => on("web_search:2,web_search:3"), /重复/);
});

test("fail-closed 构造面：未知 id/非法 max_uses/空 id 一律抛错（绝不静默降级）", () => {
  for (const bad of [
    "bogus",
    "code_execution", // 批准口径②：首批缓——必须按未知 id 拒（不是静默放行）
    "web_searches",
    "WEB_SEARCH", // id 大小写不匹配即未知（fail-closed 另一侧：宁抛不错开）
    ":1",
  ]) {
    assert.throws(() => on(bad), /未知的服务端工具 id/, `值=${bad}`);
  }
  for (const bad of ["web_search:0", "web_search:-1", "web_search:1.5", "web_search:2x", "web_search:", "web_search:NaN", "web_search:0.5", "web_search:1:2"]) {
    assert.throws(() => on(bad), /max_uses 必须为正整数/, `值=${bad}`);
  }
  // 如实登记（备注项，非批准面缺口）：max_uses 用 Number() 解析，十六进制/科学计数法/前后带空格会被
  // 宽容接受为数值正整数（声明形状仍是正整数）——「非法值抛错」的字面口径在非十进制字面量上放行。
  assert.equal(on("web_search:0x2").enabled[0]!.max_uses, 2);
  assert.equal(on("web_search:1e2").enabled[0]!.max_uses, 100);
  // 未知 id 的错误必须给出可用清单（明确失败、可自纠）。
  try {
    on("code_execution");
    assert.fail("必须抛错");
  } catch (error) {
    assert.match(String(error instanceof Error ? error.message : error), /web_search/);
    assert.match(String(error instanceof Error ? error.message : error), /web_fetch/);
  }
});

test("注册表审计：恰两项且不含 code_execution；code_execution type 串不进注册表", () => {
  assert.deepEqual(SERVER_TOOL_REGISTRY.map((entry) => entry.id), ["web_search", "web_fetch"]);
  const typeList = SERVER_TOOL_REGISTRY.map((entry) => entry.type).join(",");
  assert.equal(typeList.includes("code_execution"), false);
});

// ————————————————— 启用行/降级行文案（含外部不可信提示；降级措辞如实） —————————————————

test("启用行文案：含各工具与 max_uses、按次计费、外部不可信提示、关闭路径", () => {
  const text = renderServerToolEnableNotice([{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
  for (const fragment of ["web_search", "max_uses=1", "按次计费", "不可信", SERVER_TOOL_ENV]) assert.ok(text.includes(fragment), fragment);
});

test("降级行文案：含 HTTP 状态、明示未自动重试/后续停用、绝不含响应体", () => {
  const text = renderServerToolDegradedSummary(503);
  assert.ok(text.includes("HTTP 503"));
  assert.ok(text.includes("不") && text.includes("重试"));
  const paused = SERVER_TOOL_PAUSED_SUMMARY;
  assert.ok(paused.includes("pause_turn") && paused.includes("本轮"));
});

// ————————————————— ③ 声明追加：尾部、幂等、不改原对象、失败面如实 —————————————————

const DECLS = [
  { type: "web_search_20250305", name: "web_search", max_uses: 1 },
  { type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 },
] as const;

test("追加：声明在 tools 尾部；返回新对象、原对象不动；tools 缺失时创建", () => {
  const original = { model: "m", tools: [{ name: "tool_a" }], stream: true };
  const snapshot = JSON.stringify(original);
  const result = appendServerToolDeclarations(original, DECLS);
  assert.equal(result.changed, true);
  assert.equal(result.present, true);
  assert.equal(JSON.stringify(original), snapshot, "不得改入参对象");
  const tools = (result.payload as { tools: unknown[] }).tools;
  assert.deepEqual(tools.slice(-2), DECLS.map((d) => ({ ...d })), "追加必须在尾部且字段形状逐字");
  assert.equal(tools.length, 3);

  const empty = appendServerToolDeclarations({ model: "m" }, DECLS.slice(0, 1));
  assert.deepEqual((empty.payload as { tools: unknown[] }).tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
});

test("幂等对抗：已含同 type 跳过（部分在场只补缺项）；二次追加零改动且还是原引用", () => {
  const once = appendServerToolDeclarations({ tools: [] }, DECLS).payload;
  const again = appendServerToolDeclarations(once, DECLS);
  assert.equal(again.changed, false);
  assert.equal(again.present, true);
  assert.equal(again.payload, once, "幂等时返回原引用（调用方透传）");

  const partial = appendServerToolDeclarations({ tools: [{ type: "web_search_20250305", name: "web_search" }] }, DECLS);
  assert.equal(partial.changed, true);
  const tools = (partial.payload as { tools: unknown[] }).tools;
  assert.equal(tools.length, 2);
  assert.equal((tools[0] as { name: string }).name, "web_search", "已有项不被改写");
});

test("对抗输入：非对象 payload / tools 非数组 / 数组 payload → 不动作（present=false、绝不半改）", () => {
  for (const evil of [null, undefined, 42, "tools", [DECLS[0]]]) {
    const result = appendServerToolDeclarations(evil, DECLS);
    assert.equal(result.changed, false, JSON.stringify(evil));
    assert.equal(result.present, false);
    assert.equal(result.payload, evil);
  }
  const badTools = appendServerToolDeclarations({ tools: "not-an-array" }, DECLS);
  assert.deepEqual(badTools, { payload: { tools: "not-an-array" }, changed: false, present: false });
});

// ————————————————— ④ 降级判定：只认拒绝类状态前缀，不读正文 —————————————————

test("requestRejectionStatus：>=400 且非 408/429 才认；取数字前缀、拒绝正文注入、3 位数严格", () => {
  assert.equal(requestRejectionStatus("400 Bad Request: body"), 400);
  assert.equal(requestRejectionStatus(" 503 upstream"), 503);
  assert.equal(requestRejectionStatus("500 something"), 500);
  assert.equal(requestRejectionStatus("404 x"), 404);
  assert.equal(requestRejectionStatus("408 timeout"), undefined);
  assert.equal(requestRejectionStatus("429 rate limited"), undefined);
  assert.equal(requestRejectionStatus("200 OK"), undefined);
  assert.equal(requestRejectionStatus("399"), undefined);
  assert.equal(requestRejectionStatus(""), undefined);
  assert.equal(requestRejectionStatus("fetch failed"), undefined);
  // 前缀严格：数字必须开头（含前导空白）——正文里出现的 400 不算。
  assert.equal(requestRejectionStatus("API Error: 400 something"), undefined);
  // 4 位数字不视作 3 位前缀（\b 约束）。
  assert.equal(requestRejectionStatus("4040 x"), undefined);
  assert.equal(requestRejectionStatus("1000"), undefined);
});

// ————————————————— 观测状态机：两形状容忍、配对、错误变体、usage 两来源、pause/未知停因 —————————————————

const observeAll = (observer: ReturnType<typeof createServerToolObserver>, events: unknown[]) => events.flatMap((event) => observer.observe(event));

test("形状一（start 即完整）：server_tool_use 内联 input + 结果块内联 content → 恰对 start/result、id 关联", () => {
  const observer = createServerToolObserver();
  const observations = observeAll(observer, [
    { type: "message_start", message: { usage: {} } },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "st_A", name: "web_search", input: { query: "Q-A" } } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "st_A", content: [{ type: "web_search_result", title: "T1", url: "https://ex.test/a?x=1", encrypted_content: "BAIT" }] } },
    { type: "content_block_stop", index: 1 },
    { type: "message_stop" },
  ]);
  const starts = observations.filter((o) => o.kind === "call-start");
  const results = observations.filter((o) => o.kind === "call-result");
  assert.equal(starts.length, 1);
  assert.equal(results.length, 1);
  assert.equal(starts[0]!.toolCallId, "st_A");
  assert.equal(results[0]!.toolCallId, "st_A");
  assert.equal(results[0]!.toolName, "web_search");
  assert.ok((results[0] as { message: string }).message.includes("查询「Q-A」"));
  assert.ok((results[0] as { message: string }).message.includes("T1"));
  assert.ok((results[0] as { message: string }).message.includes("https://ex.test/a?x=1"), "URL 原样进事件命令（剥 query 属显示层职责）");
  assert.equal(JSON.stringify(observations).includes("BAIT"), false, "encrypted_content 诱饵绝不进观测输出");
  const usage = observations.filter((o) => o.kind === "usage");
  assert.deepEqual(usage, [{ kind: "usage", toolName: "web_search", count: 1, state: "from-blocks" }]);
});

test("形状二（delta 增量）：input_json_delta 累积查询、结果 partial_json 增量解析；无结果块=无 result 命令", () => {
  const observer = createServerToolObserver();
  const observations = observeAll(observer, [
    { type: "message_start", message: {} },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "st_B", name: "web_search" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":' } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"Q-B"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "st_B" } },
    { type: "content_block_delta", index: 1, delta: { type: "partial_json", text: '' } },
    { type: "content_block_stop", index: 1 },
    { type: "message_stop" },
  ]);
  const results = observations.filter((o) => o.kind === "call-result");
  assert.equal(results.length, 1);
  assert.ok((results[0] as { message: string }).message.includes("查询「Q-B」"), "delta 累积的查询被解析进结果行");
  // 结果块无 content、partial_json 空 → 「内容未捕获」兜底（如实、不编造）
  assert.ok((results[0] as { message: string }).message.includes("未捕获"));
});

test("错误变体对抗：非 max_uses_exceeded 的错误码（大写归一、未知码占位）→ denied 命令", () => {
  const observer = createServerToolObserver();
  const observations = observeAll(observer, [
    { type: "message_start", message: {} },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "st_C", name: "web_search", input: { query: "Q" } } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "st_C", content: { type: "web_search_tool_result_error", error_code: "unavailable" } } },
    { type: "content_block_stop", index: 1 },
    { type: "message_stop" },
  ]);
  const denied = observations.filter((o) => o.kind === "call-denied");
  assert.equal(denied.length, 1);
  assert.equal((denied[0] as { errorCode: string }).errorCode, "UNAVAILABLE", "错误码大写归一");
  assert.ok((denied[0] as { message: string }).message.includes("非运行错误"));
  // 错误码缺失 → unknown_error 占位（不编造）
  const observer2 = createServerToolObserver();
  const denied2 = observeAll(observer2, [
    { type: "message_start", message: {} },
    { type: "content_block_start", index: 0, content_block: { type: "web_fetch_tool_result", tool_use_id: "st_D", content: { type: "web_fetch_tool_result_error" } } },
    { type: "content_block_stop", index: 0 },
  ]).filter((o) => o.kind === "call-denied");
  assert.equal((denied2[0] as { errorCode: string }).errorCode, "UNKNOWN_ERROR");
  assert.equal((denied2[0] as { toolName: string }).toolName, "web_fetch");
});

test("usage 两来源与去重：message_start 携带 from-usage；同响应重复回传同值只记一次；无回传才 from-blocks", () => {
  const observer = createServerToolObserver();
  const observations = observeAll(observer, [
    { type: "message_start", message: { usage: { server_tool_use: { web_search_requests: 1 } } } },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { server_tool_use: { web_search_requests: 1 } } },
    { type: "message_stop" },
  ]);
  const usage = observations.filter((o) => o.kind === "usage");
  assert.deepEqual(usage, [{ kind: "usage", toolName: "web_search", count: 1, state: "from-usage" }], "同值重复回传去重");
});

test("pause_turn 恰一次/响应内重置；未知 stop_reason 如实上报且不误报已知值", () => {
  const observer = createServerToolObserver();
  const first = observeAll(observer, [
    { type: "message_start", message: {} },
    { type: "message_delta", delta: { stop_reason: "pause_turn" }, usage: {} },
    { type: "message_delta", delta: { stop_reason: "pause_turn" }, usage: {} },
    { type: "message_stop" },
    { type: "message_start", message: {} },
    { type: "message_delta", delta: { stop_reason: "pause_turn" }, usage: {} },
    { type: "message_delta", delta: { stop_reason: "some_future_reason" }, usage: {} },
  ]);
  assert.equal(first.filter((o) => o.kind === "paused").length, 2, "每响应各恰一次");
  assert.deepEqual(first.filter((o) => o.kind === "unknown-stop-reason").map((o) => (o as { reason: string }).reason), ["some_future_reason"]);
  const known = observeAll(observer, [{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: {} }]);
  assert.deepEqual(known, [], "已知值不产生任何命令");
});

test("对抗输入：非对象事件/未知类型/index 缺失/未知索引 delta → 空结果且不抛", () => {
  const observer = createServerToolObserver();
  for (const evil of [null, 42, "x", [], { type: "future_event" }, { type: "content_block_start" }, { type: "content_block_start", index: 1.5 }, { type: "content_block_delta", index: 9, delta: {} }, { type: "content_block_stop", index: 3 }]) {
    assert.deepEqual(observer.observe(evil), [], JSON.stringify(evil));
  }
});

test("备注对抗：message_start 回传 count=0、响应内确有调用块且无后续 usage ⇒ from-blocks 兜底被 0 条目抑制（如实登记）", () => {
  const observer = createServerToolObserver();
  const observations = observeAll(observer, [
    { type: "message_start", message: { usage: { server_tool_use: { web_search_requests: 0 } } } },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "s0", name: "web_search", input: { query: "q" } } },
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ]);
  // 现状：先记 from-usage count=0；message_stop 因 reportedUsage.has(toolName) 跳过本地兜底 ⇒ 实际发生的 1 次调用不计。
  // 面窄（网关须在 start 回传 0 且 delta 不再回传；正常网关在 delta 给最终计数），仅记账面、无行为/泄漏影响。
  assert.deepEqual(observations.filter((o) => o.kind === "usage"), [{ kind: "usage", toolName: "web_search", count: 0, state: "from-usage" }]);
});
