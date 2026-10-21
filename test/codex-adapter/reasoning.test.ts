import test from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { reasoningRejection } from "../../src/common/codex-adapter/protocol.ts";
import { REASONING_EVENT_SUMMARY } from "../../src/common/runtime-core/reasoning.ts";
import type { ReasoningEffortV1, SessionEvent } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, tick, until } from "./fixtures.ts";

const FIELD = JSON.stringify({ error: { message: "Unsupported parameter: reasoning.effort", type: "invalid_request_error", code: "unsupported_parameter", param: "reasoning.effort" } });
const VALUE = JSON.stringify({ error: { message: "Invalid value: high", type: "invalid_request_error", code: "unsupported_value", param: "reasoning.effort" } });
const models = [{ model: "fixture-model", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] }];
const reasoningRows = (entries: SessionEvent[]) => entries.filter(entry => (entry.detail as { source?: string } | undefined)?.source === "reasoning");
const systemRows = (entries: SessionEvent[], state?: string) => entries.filter(entry => { const detail = entry.detail as { source?: string; state?: string } | undefined; return detail?.source === "system" && (state === undefined || detail.state === state); });
const turnRequests = (engine: ReturnType<typeof harness>["engine"]) => engine.requests.filter(request => request.method === "turn/start");

test("four efforts retain process and turn settings; off/unset stay absent and all configuration messages belong to active prompts", async () => {
  for (const effort of [undefined, "off", "low", "medium", "high", "xhigh"] as const) {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/tmp", engines, { reasoningEffort: effort })).bindRole(role);
    const events = collect(session);
    await tick(); assert.equal(events.entries.length, 0, "construction emits no configuration event");
    const expected = effort === "off" ? undefined : effort;
    assert.deepEqual(engines.engine.input.configOverrides.filter(value => value.startsWith("model_reasoning_effort")), expected ? [`model_reasoning_effort=${JSON.stringify(expected)}`] : []);
    const first = await start(session, engines.engine);
    assert.equal(turnRequests(engines.engine)[0].params.effort, expected);
    engines.engine.finish(); await first.completion;
    const second = await start(session, engines.engine); engines.engine.finish(); await second.completion;
    await session.dispose(); await events.done;
    assert.equal(systemRows(events.entries, "configured").length, 1);
    assert.equal(systemRows(events.entries)[0].turnId, "ans-turn");
    assert.match(systemRows(events.entries)[0].summary, /未验证/);
    if (effort === "off") assert.match(systemRows(events.entries)[0].summary, /不表示关闭/);
  }
});

test("invalid reasoning effort is rejected before any effect", async () => {
  const engines = harness();
  await assert.rejects(
    createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "max" as unknown as ReasoningEffortV1 })).bindRole(role),
    /invalid reasoning effort/);
  assert.equal(engines.engines.length, 0);
});

test("reasoning item projects facts: content preferred, summary-only fallback, omitted when empty; durationMs only from real signals", async () => {
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.reasoningItem({ summary: ["part one"], content: ["body line 1", "body line 2"] }, { startedAtMs: 1000, completedAtMs: 1500 });
  await tick();
  engines.engine.reasoningItem({ id: "rs-2", summary: ["only summary"], content: [] }, { startedAtMs: 2000, completedAtMs: 2000 });
  await tick();
  engines.engine.reasoningItem({ id: "rs-3", summary: [], content: [] }, { startedAtMs: 3000, completedAtMs: 3100 });
  await tick();
  engines.engine.reasoningItem({ id: "rs-4", summary: [], content: ["no start signal"] }, { completedAtMs: 4000 });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const rows = reasoningRows(events.entries);
  assert.equal(rows.length, 4, "一个完成态 item ⇒ 恰好一行事实");
  assert.deepEqual(rows[0].detail, { version: 1, source: "reasoning", reasoning: { text: "body line 1\nbody line 2", status: "complete", durationMs: 500 } });
  assert.equal(rows[0].summary, REASONING_EVENT_SUMMARY, "summary 位＝核心定格常量（Service 投影单点再强制覆盖）");
  assert.equal(rows[0].turnId, "ans-turn");
  assert.deepEqual((rows[1].detail as { reasoning: unknown }).reasoning, { text: "only summary", status: "complete", durationMs: 0 }, "仅摘要 ⇒ 平台给什么就是什么");
  assert.deepEqual((rows[2].detail as { reasoning: unknown }).reasoning, { text: "", status: "omitted", durationMs: 100 }, "全空 ⇒ omitted（如实不假装）");
  assert.deepEqual((rows[3].detail as { reasoning: unknown }).reasoning, { text: "no start signal", status: "complete" }, "无 item/started ⇒ 不携带 durationMs（绝不猜测）");
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed", "推理 item 不进隔离");
});

test("reasoning delta frames are consumed without rows and never mis-mapped", async () => {
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.reasoningDelta("item/reasoning/summaryPartAdded", { summaryIndex: 0 });
  engines.engine.reasoningDelta("item/reasoning/summaryTextDelta", { summaryIndex: 0, delta: "partial" });
  engines.engine.reasoningDelta("item/reasoning/textDelta", { contentIndex: 0, delta: "partial body" });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  assert.equal(reasoningRows(events.entries).length, 0, "增量帧不产行（完成态先行）");
  assert.equal(events.entries.filter(entry => entry.kind === "tool_call" || entry.kind === "denied" || entry.kind === "accepted").length, 0, "不误报为工具行");
  assert.equal(events.entries.filter(entry => (entry.detail as { source?: string } | undefined)?.source !== "system").length, 1, "推理增量仅消费，配置消息另计");
});

test("only precise effort rejections qualify; status/type/model and whole reasoning negatives win", () => {
  assert.equal(reasoningRejection(FIELD), "field"); assert.equal(reasoningRejection(VALUE), "value");
  assert.equal(reasoningRejection("Unknown field: effort"), "field");
  for (const error of ["Unknown model: reasoning-model", "reasoning unavailable", "Unsupported parameter: reasoning", { error: { message: "Unsupported parameter: reasoning.effort", param: "model", type: "invalid_request_error" } }, { error: { message: "Unsupported parameter: reasoning", param: "reasoning", type: "invalid_request_error" } }, { message: FIELD, codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 500 } } }]) assert.equal(reasoningRejection(error), undefined);
  for (const status of [401, 403, 408, 429, 500, 502, 503]) assert.equal(reasoningRejection({ status, message: FIELD }), undefined);
  assert.equal(reasoningRejection({ error: { param: "effort", type: "authentication_error", code: "unsupported_parameter" } }), undefined);
});

test("value rejection uses exact catalog default in same thread, commits only completed, and subsequent turns retain it", async () => {
  const h = harness({ mcpServers: [], models });
  const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role); const events = collect(s);
  const first = await start(s, h.engine); const native = s.nativeSessionId;
  h.engine.failTurn(VALUE); await until(() => h.engine.turns === 2);
  assert.equal(h.engines.length, 1); assert.equal(s.nativeSessionId, native);
  assert.equal(turnRequests(h.engine)[1].params.effort, "low");
  assert.equal(systemRows(events.entries, "completed").length, 0);
  h.engine.finish(); await first.completion;
  const next = await start(s, h.engine); assert.equal(turnRequests(h.engine).at(-1)!.params.effort, "low"); h.engine.finish(); await next.completion;
  await s.dispose(); await events.done;
  assert.equal(systemRows(events.entries, "completed").length, 1);
  assert.deepEqual(events.entries.filter(e => e.kind === "settled").map(e => (e.detail as { outcome: string }).outcome), ["completed", "completed"]);
});

test("field rejection rebuilds safe first turn, starts new thread, exposes new ID and sends no effort", async () => {
  const h = harness({ mcpServers: [] }); const originalFactory = h.factory;
  const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high", engineFactory: async input => { const engine = await originalFactory(input); engine.nativeId = `thread-${h.engines.length}`; return engine; } })).bindRole(role); const events = collect(s);
  const first = await start(s, h.engine); h.engine.failTurn(FIELD);
  await until(() => h.engines.length === 2 && h.engine.turns === 1);
  assert.equal(s.nativeSessionId, "thread-2"); assert.ok(h.engine.requests.some(r => r.method === "thread/start"));
  assert.equal(turnRequests(h.engine)[0].params.threadId, "thread-2"); assert.equal(turnRequests(h.engine)[0].params.effort, undefined);
  h.engine.finish(); await first.completion;
  const next = await start(s, h.engine); assert.equal(turnRequests(h.engine).at(-1)!.params.effort, undefined); h.engine.finish(); await next.completion;
  await s.dispose(); await events.done;
  assert.equal(systemRows(events.entries, "completed").length, 1);
});

test("at most two distinct compatibility candidates: catalog default then absent effort, never a third", async () => {
  const h = harness({ mcpServers: [], models }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role); const events = collect(s);
  const first = await start(s, h.engine); h.engine.failTurn(VALUE); await until(() => h.engine.turns === 2);
  h.engine.failTurn(FIELD); await until(() => h.engines.length === 2 && h.engine.turns === 1);
  h.engine.failTurn(FIELD); await assert.rejects(first.completion, /Unsupported parameter/);
  assert.equal(h.engines.length, 2); assert.equal(h.engines.flatMap(turnRequests).length, 3);
  const next = await start(s, h.engine); assert.equal(turnRequests(h.engine).at(-1)!.params.effort, "high", "failed no-effort attempt restores original strategy explicitly"); h.engine.finish(); await next.completion;
  await s.dispose(); await events.done; assert.equal(systemRows(events.entries, "completed").length, 0);
});

test("failed, cancelled and timed-out default attempts do not stick to subsequent native requests", async () => {
  for (const failure of ["500", "cancel", "timeout"]) {
    const h = harness({ mcpServers: [], models }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high", turnLastResortMs: failure === "timeout" ? 100 : 10000 })).bindRole(role); const events = collect(s);
    const first = await start(s, h.engine); h.engine.failTurn(VALUE); await until(() => h.engine.turns === 2);
    if (failure === "500") { h.engine.failTurn("unexpected status 500: upstream unavailable"); await assert.rejects(first.completion, /500/); }
    else if (failure === "cancel") { await s.abort!(); await first.completion; }
    else await assert.rejects(first.completion, /最后兜底/);
    const next = await start(s, h.engine); assert.equal(turnRequests(h.engine).at(-1)!.params.effort, "high", failure); h.engine.finish(); await next.completion;
    await s.dispose(); await events.done; assert.equal(systemRows(events.entries, "completed").length, 0);
  }
});

test("ordinary failures, whole-object rejection and nonpersistent later turns never rebuild", async () => {
  for (const error of ["Unknown model: reasoning-model", "unexpected status 500: " + FIELD, JSON.stringify({ error: { param: "model", code: "unsupported_parameter", message: "Unsupported parameter: reasoning.effort" } }), "Unsupported parameter: reasoning"]) {
    const h = harness({ mcpServers: [], models }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role);
    const first = await start(s, h.engine); h.engine.failTurn(error); await assert.rejects(first.completion); assert.equal(h.engines.length, 1); assert.equal(h.engine.turns, 1); await s.dispose();
  }
  const h = harness({ mcpServers: [] }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role);
  const first = await start(s, h.engine); h.engine.finish(); await first.completion;
  const second = await start(s, h.engine); h.engine.failTurn(FIELD); await assert.rejects(second.completion); assert.equal(h.engines.length, 1); await s.dispose();
});

test("native tool starts and normal output forbid whole-turn replay", async () => {
  for (const type of ["mcpToolCall", "webSearch", "dynamicToolCall", "reasoning", "agentMessage"]) {
    const h = harness({ mcpServers: [], models }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role);
    const first = await start(s, h.engine); h.engine.event("item/started", { type, id: "started" }); await tick(); h.engine.failTurn(VALUE);
    await assert.rejects(first.completion); assert.equal(h.engine.turns, 1, type); assert.equal(h.engines.length, 1); await s.dispose();
  }
});

test("SDK retry notification does not trigger ANS compatibility", async () => {
  const h = harness({ mcpServers: [], models }); const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high" })).bindRole(role);
  const first = await start(s, h.engine); h.engine.failTurn(VALUE, true); await tick(); assert.equal(h.engine.turns, 1); h.engine.finish(); await first.completion; await s.dispose();
});

test("failed compatibility reconstruction reports its real error and quarantines the unconfirmed engine", async () => {
  const h = harness({ mcpServers: [] }); const factory = h.factory;
  const s = await createCodexRuntimeAdapter(options("/tmp", h, { reasoningEffort: "high", engineFactory: async input => {
    const engine = await factory(input);
    if (h.engines.length === 2) engine.behavior = { ...engine.behavior, configFails: true };
    return engine;
  } })).bindRole(role);
  const events = collect(s); const first = await start(s, h.engine); h.engine.failTurn(FIELD);
  await assert.rejects(first.completion, /config read failure/);
  await assert.rejects(s.prompt("cannot reuse ambiguous native state"), /quarantined/);
  assert.equal(h.engine.closed, true); await s.dispose(); await events.done;
  assert.equal(systemRows(events.entries, "completed").length, 0);
});
