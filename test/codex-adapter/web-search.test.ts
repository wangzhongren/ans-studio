import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { DISABLED_NATIVE_FEATURES, settings, safetyConfig, safetyOverrides, effectiveConfig } from "../../src/common/codex-adapter/config.ts";
import { harness, options, role, collect, start, tick } from "./fixtures.ts";

const credentials = { CODEX_API_KEY: "fake-codex-key", PATH: process.env.PATH };

test("web search capability: default off, env whitelist, explicit option wins, invalid values rejected", () => {
  const base = options("/fixture", harness());
  assert.equal(settings(base, credentials).webSearch, false);
  assert.equal(settings(base, { ...credentials, ANS_CODEX_WEB_SEARCH: "on" }).webSearch, true);
  assert.equal(settings(base, { ...credentials, ANS_CODEX_WEB_SEARCH: " off " }).webSearch, false);
  assert.equal(settings(base, { ...credentials, ANS_CODEX_WEB_SEARCH: " " }).webSearch, false);
  for (const invalid of ["yes", "ON", "true", "1", "live", "disabled"]) {
    assert.throws(() => settings(base, { ...credentials, ANS_CODEX_WEB_SEARCH: invalid }), /ANS_CODEX_WEB_SEARCH must be on or off/);
  }
  assert.equal(settings(options("/fixture", harness(), { webSearch: false }), { ...credentials, ANS_CODEX_WEB_SEARCH: "on" }).webSearch, false);
  assert.equal(settings(options("/fixture", harness(), { webSearch: true }), { ...credentials, ANS_CODEX_WEB_SEARCH: "off" }).webSearch, true);
  assert.throws(() => settings(options("/fixture", harness(), { webSearch: "on" as unknown as boolean }), credentials), /invalid web search option/);
});

test("default-off posture is byte-identical; capability on moves all three pins together (no tools key)", () => {
  const features = Object.fromEntries(DISABLED_NATIVE_FEATURES.map(name => [name, false]));
  const offConfig = { features, sandbox_mode: "read-only", approval_policy: "never", approvals_reviewer: "user", web_search: "disabled", projects: { "/fixture": { trust_level: "untrusted" } } };
  assert.deepEqual(Object.keys(safetyConfig("/fixture")), ["features", "sandbox_mode", "approval_policy", "approvals_reviewer", "web_search", "projects"]);
  assert.deepEqual(safetyConfig("/fixture"), offConfig);
  assert.deepEqual(safetyConfig("/fixture", false), offConfig);
  assert.deepEqual(safetyConfig("/fixture", true), { ...offConfig, web_search: "live" });
  const offOverrides = [
    ...DISABLED_NATIVE_FEATURES.map(name => `features.${name}=false`),
    'sandbox_mode="read-only"', 'approval_policy="never"', 'approvals_reviewer="user"', 'web_search="disabled"', 'projects={"/fixture"={trust_level="untrusted"}}',
  ];
  assert.deepEqual(safetyOverrides("/fixture"), offOverrides);
  assert.deepEqual(safetyOverrides("/fixture", [], false), offOverrides);
  const onOverrides = safetyOverrides("/fixture", [], true);
  assert.deepEqual(onOverrides, offOverrides.map(value => value === 'web_search="disabled"' ? 'web_search="live"' : value));
  assert.equal(onOverrides.some(value => value.startsWith("tools.")), false);
  const readback = (mode: string) => ({ config: { features, sandbox_mode: "read-only", approval_policy: "never", web_search: mode, mcp_servers: {} } });
  assert.equal(effectiveConfig(readback("disabled")).enabled.length, 0);
  assert.equal(effectiveConfig(readback("live"), true).enabled.length, 0);
  assert.throws(() => effectiveConfig(readback("live")), /search restrictions were not applied/);
  assert.throws(() => effectiveConfig(readback("disabled"), true), /search restrictions were not applied/);
});

test("adapter moves process overrides, thread config and readback expectation with the capability; readback mismatch fails closed", async () => {
  const engines = harness();
  const off = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  assert.ok(engines.engine.input.configOverrides.includes('web_search="disabled"'));
  const offThread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.equal((offThread.params.config as { web_search: string }).web_search, "disabled");
  await off.dispose();

  for (const extra of [
    { webSearch: true },
    { env: { ...credentials, OPENAI_API_KEY: "fake-openai-key", ANS_CODEX_WEB_SEARCH: "on" } },
  ]) {
    const enabled = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", enabled, extra)).bindRole(role);
    assert.ok(enabled.engine.input.configOverrides.includes('web_search="live"'));
    const thread = enabled.engine.requests.find(request => request.method === "thread/start")!;
    assert.equal((thread.params.config as { web_search: string }).web_search, "live");
    await session.dispose();
  }

  for (const [behavior, extra] of [
    [{ webSearchReadback: "disabled" }, { webSearch: true }],
    [{ webSearchReadback: "live" }, {}],
  ] as const) {
    const refused = harness(behavior);
    await assert.rejects(createCodexRuntimeAdapter(options("/fixture", refused, extra)).bindRole(role), /search restrictions were not applied/);
    assert.equal(refused.engines.length > 0, true);
    assert.equal(refused.engines.every(engine => engine.closed), true);
  }
});

test("webSearch item becomes one message row (real 0.162.1 payload shape) and settled carries searchCalls", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.webSearch({ id: "ws_probe_1", query: "controlled probe query", action: { type: "search", query: "controlled probe query", queries: null }, results: null });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const rows = events.entries.filter(event => event.kind === "message" && (event.detail as { source?: string } | undefined)?.source === "web-search");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].summary, "联网搜索：controlled probe query");
  assert.equal(rows[0].turnId, "ans-turn");
  assert.deepEqual(rows[0].detail, { version: 1, source: "web-search", itemId: "ws_probe_1", query: "controlled probe query", action: { type: "search" } });
  const settled = events.entries.filter(event => event.kind === "settled");
  assert.equal(settled.length, 1);
  assert.deepEqual(settled[0].detail, { outcome: "completed", searchCalls: 1 });
});

test("webSearch tolerance: missing or malformed fields keep the fallback row, never throw, never quarantine, results capped", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.webSearch({ id: "ws_no_query", query: undefined });
  engines.engine.webSearch({ id: "ws_empty_query", query: "" });
  engines.engine.webSearch({ id: "ws_unknown_action", query: "q2", action: { type: "openPageV2", url: 42 } });
  engines.engine.webSearch({ id: "ws_bad_action", query: "q3", action: "not-an-object" });
  engines.engine.webSearch({ id: "ws_null_results", query: "q4", results: null });
  engines.engine.webSearch({ id: "ws_bad_results", query: "q5", results: "nope" });
  engines.engine.webSearch({ id: undefined, query: "q6", results: [{ title: "T", url: "https://example.test/a", extra: 1 }, { snippet: "only" }, "text-entry"] });
  engines.engine.webSearch({ id: "ws_cap", query: "q7", results: Array.from({ length: 21 }, (_, index) => ({ title: `t${index}`, url: `https://example.test/${index}` })) });
  await tick();
  engines.engine.finish(); await turn.completion;
  const next = await start(session, engines.engine, "next");
  engines.engine.finish(); await next.completion; await session.dispose(); await events.done;
  const rows = events.entries.filter(event => event.kind === "message" && (event.detail as { source?: string } | undefined)?.source === "web-search");
  assert.deepEqual(rows.map(row => row.summary), ["联网搜索", "联网搜索", "联网搜索：q2", "联网搜索：q3", "联网搜索：q4", "联网搜索：q5", "联网搜索：q6", "联网搜索：q7"]);
  const details = rows.map(row => row.detail as Record<string, unknown>);
  assert.deepEqual(details[0], { version: 1, source: "web-search", itemId: "ws_no_query" });
  assert.deepEqual(details[1], { version: 1, source: "web-search", itemId: "ws_empty_query" });
  assert.deepEqual(details[2].action, { type: "openPageV2" });
  assert.equal("action" in details[3], false);
  assert.equal("results" in details[4], false);
  assert.equal("results" in details[5], false);
  assert.equal("itemId" in details[6], false);
  assert.deepEqual(details[6].results, [{ title: "T", url: "https://example.test/a" }, {}, {}]);
  assert.equal((details[7].results as unknown[]).length, 20);
  assert.equal(details[7].resultsTruncated, true);
  const settled = events.entries.filter(event => event.kind === "settled");
  assert.deepEqual(settled.map(event => (event.detail as { searchCalls?: number }).searchCalls), [8, undefined]);
});

test("item/started webSearch is not mapped; settled without searches has no searchCalls key", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.event("item/started", { type: "webSearch", id: "ws_started", query: "q" });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  assert.equal(events.entries.filter(event => event.kind === "message" && (event.detail as { source?: string } | undefined)?.source === "web-search").length, 0);
  assert.deepEqual(events.entries.at(-1)!.detail, { outcome: "completed" });
});

test("search text and result URLs stay redacted and conservatively stripped in rows and details", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.webSearch({ id: "ws_redact", query: "token fake-codex-key https://example.test/search?q=private-topic&token=fake-codex-key", results: [{ title: "hit", url: "https://example.test/page?id=42" }] });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const serialized = JSON.stringify(events.entries);
  assert.equal(serialized.includes("fake-codex-key"), false);
  assert.equal(serialized.includes("q=private-topic"), false);
  assert.equal(serialized.includes("id=42"), false);
  const row = events.entries.find(event => event.kind === "message" && (event.detail as { source?: string } | undefined)?.source === "web-search")!;
  // config.redact strips the query string but keeps the path: https://example.test/search?… -> https://example.test/search
  assert.equal(row.summary, "联网搜索：token [REDACTED] https://example.test/search");
  assert.equal((row.detail as { query: string }).query, "token [REDACTED] https://example.test/search");
  assert.equal((row.detail as { results: Array<{ url: string }> }).results[0].url, "https://example.test/page");
});

test("config.redact shares the tool-display A-base URL boundary: full-width punctuation is no longer swallowed; redaction itself unchanged", () => {
  // 同批检查（2026-10-16，运行时核心）：与 `cleanPatterns` 同类贪婪模式（同一 `https?://[^\s<>"']+` 类）收窄
  // ——URL 紧贴全角标点（无 ASCII 空白）时不再把标点及其后文本吞入归一（旧行为：吞入 path/hash 并
  // percent-encode——诊断文本 mojibake/丢尾）。收窄＝排除集只增全角块，匹配后的归一逐字不变。
  const redact = settings(options("/fixture", harness()), credentials).redact;
  assert.equal(redact("https://user:pw@a.test/p?token=秘密#frag）后文"), "https://a.test/p#frag）后文", "userinfo/query 照剥、hash 保留（既有语义）、「）后文」完整");
  assert.equal(redact("请求 https://user:pw@a.test/p?token=秘密#frag）超时"), "请求 https://a.test/p#frag）超时");
  // 零泄漏不放松：CJK 查询值 + 全角分隔符紧贴——秘密仍剥除、分隔符后文本完整。
  assert.equal(redact("https://a.test/x?token=对抗参数-绝不外泄；后文"), "https://a.test/x；后文");
  // ASCII `;` 路径参数不回归（不在排除集内）。
  assert.equal(redact("https://a.test/p;jsessionid=abc"), "https://a.test/p;jsessionid=abc");
});

test("actual native process fixture accepts the web search on-posture and completes a governed turn", async t => {
  const fixture = fileURLToPath(new URL("./fixtures/native-cli.mjs", import.meta.url));
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", (...args: Parameters<typeof childProcess.spawn>) => {
    if (args[0] !== fixture) return originalSpawn(...args);
    return originalSpawn(process.execPath, [fixture, ...(args[1] as readonly string[])], args[2]);
  });
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const session = await createCodexRuntimeAdapter(options("/fixture", harness(), { webSearch: true, engineFactory: undefined, cliPath: fixture })).bindRole(role);
  const events = collect(session);
  try {
    await session.prompt("normal");
  } finally { await session.dispose(); await events.done; }
  assert.deepEqual(events.entries.filter(event => event.kind === "settled").at(0)?.detail, { outcome: "completed" });
});
