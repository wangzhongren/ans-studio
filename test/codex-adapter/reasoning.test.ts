import test from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { isReasoningParamRejection } from "../../src/common/codex-adapter/protocol.ts";
import { REASONING_EVENT_SUMMARY } from "../../src/common/runtime-core/reasoning.ts";
import type { ReasoningEffortV1, SessionEvent } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, tick, until } from "./fixtures.ts";

// G-5 wave 2（Codex）：请求接线（四档 -c、off 零注入＋如实行）、推理事件面（A3 探针形状转正）、
// 降级链（保守识别＋恰一次去参数重发）。形状依据＝docs/change/2026-10-16-reasoning-surface-evidence。

const REJECTION = '{"error":{"message":"Unsupported parameter: reasoning","type":"invalid_request_error","param":"reasoning"}}';
const reasoningRows = (entries: SessionEvent[]) => entries.filter(entry => (entry.detail as { source?: string } | undefined)?.source === "reasoning");
const effortRows = (entries: SessionEvent[]) => entries.filter(entry => (entry.detail as { source?: string } | undefined)?.source === "reasoning-effort");

test("request wiring: unset injects nothing; four tiers inject one scalar override; off injects nothing with an honest row", async () => {
  const baseline = harness();
  const base = await createCodexRuntimeAdapter(options("/fixture", baseline)).bindRole(role);
  assert.equal(baseline.engine.input.configOverrides.some(value => value.startsWith("model_reasoning_effort")), false, "未设 ⇒ 零参数（逐字现状）");
  await base.dispose();
  for (const effort of ["low", "medium", "high", "xhigh"] as const) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: effort })).bindRole(role);
    const hits = engines.engine.input.configOverrides.filter(value => value.startsWith("model_reasoning_effort"));
    assert.deepEqual(hits, [`model_reasoning_effort=${JSON.stringify(effort)}`], `${effort} ⇒ 恰一条顶层标量覆盖`);
    await session.dispose();
  }
  const offEngines = harness();
  const offSession = await createCodexRuntimeAdapter(options("/fixture", offEngines, { reasoningEffort: "off" })).bindRole(role);
  const offEvents = collect(offSession);
  assert.equal(offEngines.engine.input.configOverrides.some(value => value.startsWith("model_reasoning_effort")), false, "off＝无该档 ⇒ 零注入");
  await offSession.dispose(); await offEvents.done;
  const rows = effortRows(offEvents.entries);
  assert.equal(rows.length, 1, "会话级恰一条如实说明");
  assert.equal(rows[0].summary, "Codex 平台无「关」档：未注入推理强度参数（维持平台默认，推理未关闭）");
  assert.equal(rows[0].turnId, undefined);
  assert.deepEqual(rows[0].detail, { version: 1, source: "reasoning-effort", reason: "off-unsupported" });
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
  assert.equal(events.entries.length, 1, "唯一事件＝settled");
});

test("rejection matcher is conservative: both anchors required", () => {
  assert.equal(isReasoningParamRejection(REJECTION), true);
  assert.equal(isReasoningParamRejection("Unknown field: effort"), true);
  assert.equal(isReasoningParamRejection("model unavailable"), false);
  assert.equal(isReasoningParamRejection("unsupported operation"), false);
  assert.equal(isReasoningParamRejection("reasoning timed out"), false, "无拒绝词 ⇒ 不识别（宁可少见降级）");
  assert.equal(isReasoningParamRejection(undefined), false);
});

test("gateway rejection degrades exactly once: reconnect without the param, same input, honest row; turn continues", async () => {
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(role);
  const events = collect(session);
  const first = await start(session, engines.engine);
  assert.deepEqual(engines.engine.input.configOverrides.filter(value => value.startsWith("model_reasoning_effort")), ['model_reasoning_effort="high"']);
  engines.engine.failTurn(REJECTION);
  await until(() => engines.engines.length === 2);
  const retried = engines.engine;
  assert.equal(retried.input.configOverrides.some(value => value.startsWith("model_reasoning_effort")), false, "去参数重发：新引擎零 effort 覆盖（其余逐字不变）");
  assert.deepEqual(retried.input.configOverrides.filter(value => value.startsWith("mcp_servers=")), engines.engines[0].input.configOverrides.filter(value => value.startsWith("mcp_servers=")), "其余覆盖逐字不变");
  await until(() => retried.requests.some(request => request.method === "turn/start"));
  const turnStart = retried.requests.find(request => request.method === "turn/start")!;
  assert.deepEqual((turnStart.params.input as Array<Record<string, unknown>>)[0], { type: "text", text: "fixture", text_elements: [] }, "同一输入重发");
  retried.finish();
  await first.completion; // 本轮继续（正常 resolve，不抛）
  await session.dispose(); await events.done;
  const rows = effortRows(events.entries);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].summary, "本网关不支持所设推理强度，本轮已按默认执行");
  assert.equal(rows[0].turnId, "ans-turn");
  assert.equal(events.entries.filter(entry => entry.kind === "settled").length, 1, "settled 恰一次");
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed");
});

test("degrade is bounded and conservative: rejected retry, unrelated failure, content-bearing turn and no-effort sessions never retry", async () => {
  // (a) 重发再被拒 ⇒ 如实失败、不再重连
  {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(role);
    const events = collect(session);
    const first = await start(session, engines.engine);
    engines.engine.failTurn(REJECTION);
    await until(() => engines.engines.length === 2);
    await until(() => engines.engine.requests.some(request => request.method === "turn/start"));
    engines.engine.failTurn(REJECTION);
    await assert.rejects(first.completion, /Unsupported parameter: reasoning/);
    await tick(50);
    assert.equal(engines.engines.length, 2, "恰一次：无第三次连接");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 1, "降级行仍恰一条");
    assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "failed");
  }
  // (b) 无推理锚的失败 ⇒ 不识别、不重发
  {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(role);
    const events = collect(session);
    const first = await start(session, engines.engine);
    engines.engine.failTurn("model unavailable");
    await assert.rejects(first.completion, /model unavailable/);
    await tick(50);
    assert.equal(engines.engines.length, 1, "保守：不识别不重发");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
  // (c) 已产出内容（agentMessage）后的拒绝 ⇒ 不降级（首请求闸）
  {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(role);
    const events = collect(session);
    const first = await start(session, engines.engine);
    engines.engine.message("partial output already delivered");
    await tick();
    engines.engine.failTurn(REJECTION);
    await assert.rejects(first.completion, /Unsupported parameter: reasoning/);
    await tick(50);
    assert.equal(engines.engines.length, 1);
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
  // (d) 未注入推理强度的会话 ⇒ 闸不开（同文案也不重发）
  {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
    const events = collect(session);
    const first = await start(session, engines.engine);
    engines.engine.failTurn(REJECTION);
    await assert.rejects(first.completion, /Unsupported parameter: reasoning/);
    await tick(50);
    assert.equal(engines.engines.length, 1);
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
});
