// G-3 独立验证（测试角色）：Codex 适配器——纯函数（能力位/三钉/行映射）＋自建 fake engine 全链
// （声明随位同翻、回读 fail-closed、webSearch item→message 行、settled.searchCalls、网关拒声明轮次如实 failed）。
// **不复用实施方夹具/断言**：fake engine、角色、事件素材与断言全部本文件独立构造（对照批准口径 ①②③④）。
//
// 运行：node --test "test/测试/g3-search-verify/codex-websearch-verify.test.ts"（零网络；in-process 假 engine）。
import test from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import type { CodexEngineInput, CodexRpcConnection } from "../../../src/common/codex-adapter/protocol.ts";
import { webSearchRow } from "../../../src/common/codex-adapter/protocol.ts";
import { webSearchEnabled, settings, safetyConfig, safetyOverrides, effectiveConfig, DISABLED_NATIVE_FEATURES } from "../../../src/common/codex-adapter/config.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, SessionEvent } from "../../../src/model/runtime.ts";

const role: ResolvedRole = {
  id: "g3-verify-codex", kind: "project", cardText: "# G-3 Codex 验证",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
};
const gate = (): InteractionGate => ({ begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} });

// —————————————————————— 纯函数：能力位白名单 ——————————————————————

test("能力位白名单：缺省/空白/off=关；on=开；非法/大小写变体显式抛错（fail-closed，不静默）", () => {
  assert.equal(webSearchEnabled(undefined, undefined), false);
  assert.equal(webSearchEnabled(undefined, ""), false);
  assert.equal(webSearchEnabled(undefined, "   "), false);
  assert.equal(webSearchEnabled(undefined, "off"), false);
  assert.equal(webSearchEnabled(undefined, " off "), false);
  assert.equal(webSearchEnabled(undefined, "on"), true);
  for (const invalid of ["ON", "On", "yes", "1", "true", "live", "disabled", "0", "none"]) {
    assert.throws(() => webSearchEnabled(undefined, invalid), /on or off/, `值=${invalid}`);
  }
  assert.equal(webSearchEnabled(true, "off"), true);
  assert.equal(webSearchEnabled(false, "on"), false);
  assert.throws(() => webSearchEnabled("on" as unknown as boolean, "off"), /invalid web search option/);
  const env = { CODEX_API_KEY: "k", ANS_CODEX_MODEL: "m" };
  assert.equal(settings({ runtime: "codex" } as RuntimeProviderOptions, env).webSearch, false);
  assert.equal(settings({ runtime: "codex" } as RuntimeProviderOptions, { ...env, ANS_CODEX_WEB_SEARCH: "on" }).webSearch, true);
  assert.throws(() => settings({ runtime: "codex" } as RuntimeProviderOptions, { ...env, ANS_CODEX_WEB_SEARCH: "yes" }), /on or off/);
});

// —————————————————————— 纯函数：三钉与回读 ——————————————————————

test("三钉：默认关逐字节（键序/值全等）；开会三处同翻且格式与位置不变；回读期望双向 fail-closed", () => {
  const cwd = "/g3-verify";
  const features = Object.fromEntries(DISABLED_NATIVE_FEATURES.map((name) => [name, false]));
  assert.deepEqual(safetyConfig(cwd), { features, sandbox_mode: "read-only", approval_policy: "never", approvals_reviewer: "user", web_search: "disabled", projects: { [cwd]: { trust_level: "untrusted" } } });
  assert.deepEqual(safetyConfig(cwd, false), safetyConfig(cwd), "显式 false 与缺省逐字节等");
  assert.deepEqual(safetyConfig(cwd, true), { ...safetyConfig(cwd), web_search: "live" }, "开会只翻该值");
  const off = safetyOverrides(cwd);
  const on = safetyOverrides(cwd, [], true);
  assert.equal(off.length, on.length, "覆盖项数量不变");
  assert.deepEqual(on, off.map((value) => value === 'web_search="disabled"' ? 'web_search="live"' : value), "除 web_search 外逐字不动");
  assert.equal(on.includes('web_search="live"'), true);
  assert.equal(on.some((value) => value.startsWith("tools.")), false, "不夹带 [tools].web_search 键（T3 实证不用）");
  const readback = (mode: string) => ({ config: { features, sandbox_mode: "read-only", approval_policy: "never", web_search: mode, mcp_servers: {} } });
  assert.equal(effectiveConfig(readback("disabled")).enabled.length, 0);
  assert.equal(effectiveConfig(readback("live"), true).enabled.length, 0);
  assert.throws(() => effectiveConfig(readback("live")), /search restrictions/, "请求关、回读开 ⇒ 拒");
  assert.throws(() => effectiveConfig(readback("disabled"), true), /search restrictions/, "请求开、回读关 ⇒ 拒（被 requirements 压回也在此面）");
});

// —————————————————————— 纯函数：webSearchRow 白名单投影 ——————————————————————

test("webSearchRow：只投影真实字段（白名单逐字全等）；多余字段不携带；容错不抛", () => {
  const rich = webSearchRow({
    type: "webSearch", id: "item-9", query: "查询-独立-CDX",
    action: { type: "openPage", url: "https://x.test/p?q=1", pattern: "片段", queries: ["a", "b"], ignored: "NO" },
    results: [{ title: "T1", url: "https://x.test/a", snippet: "NO-SNIPPET" }, null, ["NO"], 7, { title: 5, url: "https://x.test/b" }],
    status: "completed", extra: "NOT-PROJECTED",
  });
  assert.equal(rich.summary, "联网搜索：查询-独立-CDX");
  assert.deepEqual(rich.detail, {
    version: 1, source: "web-search", itemId: "item-9", query: "查询-独立-CDX",
    action: { type: "openPage", url: "https://x.test/p?q=1", pattern: "片段", queries: ["a", "b"] },
    results: [{ title: "T1", url: "https://x.test/a" }, {}, {}, {}, { url: "https://x.test/b" }],
  });
  // queries 混合类型 ⇒ 整体不投影（不半信）
  const mixed = webSearchRow({ query: "q", action: { type: "search", queries: ["a", 1] } });
  assert.deepEqual((mixed.detail as { action: Record<string, unknown> }).action, { type: "search" });
  // 缺 query/空 query ⇒ 保底摘要；空 id/非字符串 id 不携带
  assert.equal(webSearchRow({}).summary, "联网搜索");
  assert.equal((webSearchRow({ query: "" }).detail as Record<string, unknown>)["query"], undefined);
  assert.equal("itemId" in webSearchRow({ id: "" }).detail, false);
  assert.equal("itemId" in webSearchRow({ id: 42 }).detail, false);
  // action 非法（数组/字符串/无 type）⇒ 不携带 action
  for (const action of [[1], "s", {}, { type: "" }]) assert.equal("action" in webSearchRow({ action }).detail, false);
  // results 非数组 ⇒ 不携带
  assert.equal("results" in webSearchRow({ results: "nope" }).detail, false);
  // 21 条 ⇒ 截 20 + 显式标记（绝不静默截）；恰 20 条不标记
  const capped = webSearchRow({ results: Array.from({ length: 21 }, (_, index) => ({ title: `t${index}` })) });
  assert.equal((capped.detail["results"] as unknown[]).length, 20);
  assert.equal(capped.detail["resultsTruncated"], true);
  const exact = webSearchRow({ results: Array.from({ length: 20 }, () => ({})) });
  assert.equal("resultsTruncated" in exact.detail, false);
});

// —————————————————————— 自建 fake engine 全链 ——————————————————————

interface FakeEngine extends CodexRpcConnection {
  requests: { method: string; params: Record<string, unknown> }[];
  turnStarts: number;
  nativeTurnIds: string[];
  expectedWebSearch: string;
  emit(method: string, params: unknown): void;
  closedNow(): boolean;
}
function createEngine(readback?: (expected: string) => string): FakeEngine {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const listeners = new Set<(method: string, params: unknown) => void>();
  let turnStarts = 0;
  let closed = false;
  const engine: FakeEngine = {
    requests, turnStarts: 0, nativeTurnIds: [], expectedWebSearch: "disabled",
    async request(method, params) {
      requests.push({ method, params });
      if (method === "initialize") return {};
      if (method === "config/read") {
        // 回读从进程覆盖 (`-c web_search="…"`) 回显（缺省 disabled）；readback 钩子模拟 requirements/策略压回。
        return { config: { features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map((name) => [name, false])), sandbox_mode: "read-only", approval_policy: "never", web_search: readback ? readback(engine.expectedWebSearch) : engine.expectedWebSearch, mcp_servers: {} } };
      }
      if (method === "thread/start" || method === "thread/resume") return { approvalPolicy: "never", sandbox: { type: "readOnly" }, thread: { id: "g3-thread" } };
      if (method === "mcpServerStatus/list") return { data: [] };
      if (method === "turn/start") { turnStarts += 1; engine.turnStarts = turnStarts; const id = `g3-nturn-${turnStarts}`; engine.nativeTurnIds.push(id); return { turn: { id } }; }
      return {};
    },
    notify() {},
    onNotification(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onServerRequest() {},
    async close() { closed = true; },
    emit(method, params) { for (const listener of listeners) listener(method, params); },
    closedNow: () => closed,
  };
  return engine;
}

const waitUntil = async (predicate: () => boolean, label: string, tries = 600) => {
  for (let i = 0; i < tries; i += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error("等待超时：" + label);
};

let ansSeq = 0;
function makeSession(engine: FakeEngine, extra: Record<string, unknown> = {}) {
  const inputs: CodexEngineInput[] = [];
  const adapter = createCodexRuntimeAdapter({
    runtime: "codex", projectRoot: process.cwd(), skillRoot: process.cwd(), tools: [],
    interactionGate: gate(), currentTurnId: () => `g3-ans-${(ansSeq += 1)}`,
    env: { PATH: process.env.PATH, CODEX_API_KEY: "g3-fake-key", ANS_CODEX_MODEL: "g3-model" },
    promptTimeoutMs: 5000,
    engineFactory: async (input: CodexEngineInput) => {
      inputs.push(input);
      engine.expectedWebSearch = /web_search="([^"]+)"/.exec(input.configOverrides.join(" "))?.[1] ?? "disabled";
      return engine;
    },
    ...extra,
  } as never);
  return { adapter, inputs };
}

function collector(session: { events(): AsyncIterable<SessionEvent> }) {
  const entries: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) entries.push(event); })();
  return { entries, done };
}

async function startTurn(prompt: (text: string) => Promise<void>, engine: FakeEngine) {
  const before = engine.turnStarts;
  const done = prompt("执行一轮").then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
  await waitUntil(() => engine.turnStarts > before, "turn/start");
  return { done, turnId: engine.nativeTurnIds[engine.nativeTurnIds.length - 1]! };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

// —————————————————————— 全链用例 ——————————————————————

test("全链（默认关）：进程覆盖 -c 与线程配置双落 disabled；turn/start 沙箱保持 readOnly+无网络；dispose 关停 engine", async () => {
  ansSeq = 0;
  const engine = createEngine();
  const { adapter, inputs } = makeSession(engine);
  const session = await adapter.bindRole(role);
  assert.ok(inputs[0]!.configOverrides.includes('web_search="disabled"'), "进程覆盖必须显式 disabled");
  const thread = engine.requests.find((request) => request.method === "thread/start")!;
  assert.equal((thread.params.config as Record<string, unknown>)["web_search"], "disabled");
  const turn = await startTurn(session.prompt.bind(session), engine);
  engine.emit("turn/completed", { threadId: "g3-thread", turn: { id: turn.turnId, status: "completed" } });
  assert.deepEqual(await turn.done, { ok: true });
  const turnStart = engine.requests.find((request) => request.method === "turn/start")!;
  assert.deepEqual(turnStart.params["sandboxPolicy"], { type: "readOnly", networkAccess: false }, "服务端搜索不需要本地网络——沙箱不放开");
  await session.dispose();
  assert.equal(engine.closedNow(), true);
});

test("全链（开）：env on 与 options 显式两路都使三钉同翻 live；webSearch item 产出行＋settled.searchCalls；逐轮计数、不隔离", async () => {
  ansSeq = 0;
  for (const extra of [
    { env: { PATH: process.env.PATH, CODEX_API_KEY: "g3-fake-key", ANS_CODEX_MODEL: "g3-model", ANS_CODEX_WEB_SEARCH: "on" } },
    { webSearch: true },
  ]) {
    const engine = createEngine();
    const { adapter, inputs } = makeSession(engine, extra);
    const session = await adapter.bindRole(role);
    assert.ok(inputs[0]!.configOverrides.includes('web_search="live"'), `进程覆盖必须 live：${JSON.stringify(extra)}`);
    const thread = engine.requests.find((request) => request.method === "thread/start")!;
    assert.equal((thread.params.config as Record<string, unknown>)["web_search"], "live");
    const events = collector(session);
    const turn1 = await startTurn(session.prompt.bind(session), engine);
    engine.emit("item/completed", { threadId: "g3-thread", turnId: turn1.turnId, item: { type: "webSearch", id: "ws_1", query: "独立验证搜索", action: { type: "search", query: "独立验证搜索", queries: null }, results: null } });
    await tick();
    engine.emit("turn/completed", { threadId: "g3-thread", turn: { id: turn1.turnId, status: "completed" } });
    assert.deepEqual(await turn1.done, { ok: true });
    const turn2 = await startTurn(session.prompt.bind(session), engine);
    engine.emit("item/completed", { threadId: "g3-thread", turnId: turn2.turnId, item: { type: "webSearch", id: "ws_2a", query: "第二轮-A", action: { type: "other" }, results: null } });
    engine.emit("item/completed", { threadId: "g3-thread", turnId: turn2.turnId, item: { type: "webSearch", id: "ws_2b", query: "第二轮-B", results: null } });
    await tick();
    engine.emit("turn/completed", { threadId: "g3-thread", turn: { id: turn2.turnId, status: "completed" } });
    assert.deepEqual(await turn2.done, { ok: true }, "搜索行绝不隔离会话");
    await session.dispose();
    await events.done;

    const rows = events.entries.filter((event) => event.kind === "message");
    assert.deepEqual(rows.map((row) => row.summary), ["联网搜索：独立验证搜索", "联网搜索：第二轮-A", "联网搜索：第二轮-B"]);
    assert.deepEqual(rows[0]!.detail, { version: 1, source: "web-search", itemId: "ws_1", query: "独立验证搜索", action: { type: "search" } });
    assert.equal(rows[1]!.turnId, rows[2]!.turnId, "同轮两行同 turnId");
    assert.notEqual(rows[0]!.turnId, rows[1]!.turnId, "跨轮 turnId 不串");
    const settled = events.entries.filter((event) => event.kind === "settled");
    assert.deepEqual(settled.map((event) => event.detail), [{ outcome: "completed", searchCalls: 1 }, { outcome: "completed", searchCalls: 2 }]);
  }
});

test("全链：零搜索轮 settled 不携带 searchCalls；item/started 不接（v1 最小面）；回读不符双向 fail-closed 且 engine 关停", async () => {
  ansSeq = 0;
  {
    const engine = createEngine();
    const { adapter } = makeSession(engine, { webSearch: true });
    const session = await adapter.bindRole(role);
    const events = collector(session);
    const turn = await startTurn(session.prompt.bind(session), engine);
    engine.emit("item/started", { threadId: "g3-thread", turnId: turn.turnId, item: { type: "webSearch", id: "ws_started", query: "不应成像" } });
    await tick();
    engine.emit("turn/completed", { threadId: "g3-thread", turn: { id: turn.turnId, status: "completed" } });
    await turn.done;
    await session.dispose();
    await events.done;
    assert.equal(events.entries.filter((event) => event.kind === "message").length, 0, "item/started 零映射");
    assert.deepEqual(events.entries.filter((event) => event.kind === "settled").map((event) => event.detail), [{ outcome: "completed" }], "零搜索轮不带 searchCalls 键");
  }
  {
    for (const [readback, extra] of [
      [() => "disabled", { webSearch: true }],
      [() => "live", {}],
    ] as const) {
      const engine = createEngine(readback);
      const { adapter } = makeSession(engine, extra);
      await assert.rejects(adapter.bindRole(role), /search restrictions/, `readback=${readback()} extra=${JSON.stringify(extra)}`);
      assert.equal(engine.closedNow(), true, "回读不符必须 fail-closed 并关停 engine");
    }
  }
});

test("全链：网关拒声明（error 通知）⇒ 本轮如实 failed 且 settled 如实；会话不隔离，下一轮正常；行文本与 URL 走既有脱敏", async () => {
  ansSeq = 0;
  const engine = createEngine();
  const { adapter } = makeSession(engine, { webSearch: true });
  const session = await adapter.bindRole(role);
  const events = collector(session);
  const turn1 = await startTurn(session.prompt.bind(session), engine);
  engine.emit("error", { threadId: "g3-thread", turnId: turn1.turnId, willRetry: false, error: { message: "gateway rejected web_search declaration" } });
  const result1 = await turn1.done;
  assert.equal(result1.ok, false, "本轮如实失败（prompt 抛错，既有口径）");
  const turn2 = await startTurn(session.prompt.bind(session), engine);
  engine.emit("item/completed", { threadId: "g3-thread", turnId: turn2.turnId, item: { type: "webSearch", id: "ws_redact", query: "token g3-fake-key https://x.test/search?q=private-topic", action: { type: "search" }, results: [{ title: "命中", url: "https://x.test/page?id=42" }] } });
  await tick();
  engine.emit("turn/completed", { threadId: "g3-thread", turn: { id: turn2.turnId, status: "completed" } });
  assert.deepEqual(await turn2.done, { ok: true });
  await session.dispose();
  await events.done;
  const allText = JSON.stringify(events.entries);
  assert.equal(allText.includes("g3-fake-key"), false, "凭据被既有脱敏管线剥除");
  assert.equal(allText.includes("q=private-topic"), false, "URL query 被既有保守裁剪");
  assert.equal(allText.includes("id=42"), false);
  const row = events.entries.find((event) => event.kind === "message")!;
  assert.equal(row.summary.includes("[REDACTED]"), true);
  assert.equal((row.detail as { results: Array<{ url: string }> }).results[0]!.url, "https://x.test/page");
  const settled = events.entries.filter((event) => event.kind === "settled");
  assert.deepEqual(settled[0]!.detail, { outcome: "failed", error: "gateway rejected web_search declaration" });
  assert.deepEqual(settled[1]!.detail, { outcome: "completed", searchCalls: 1 });
});
