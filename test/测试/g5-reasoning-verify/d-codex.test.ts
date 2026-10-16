// test/测试/g5-reasoning-verify/d-codex.test.ts —— D 域：Codex 适配器接线（独立验证）。
//
// 验证对象：`src/provider/codex/{session,config,protocol}.ts`——settings 五值校验（越界装配前抛）、
// 单条 `-c` 注入（未设/off 零注入）、off 如实文案、reasoning 事件（完成态恰一行/文本优先级/双信号时长/
// 增量零行）、降级闸（恰一次＋重建＋同输入；负例四格＋跨轮不再）。
// **自建独立 engine 假**（不复用实施方 fixtures 的 FakeEngine）：逐帧原始控制（错轮帧/单信号/非字符串
// 摘要等对抗件均为实施方用例未覆盖类别）。

import test from "node:test";
import assert from "node:assert/strict";

import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import type { CodexEngineInput, CodexRpcConnection, CodexMcpModules } from "../../../src/provider/codex/session.ts";
import { DISABLED_NATIVE_FEATURES } from "../../../src/common/codex-adapter/config.ts";
import type { InteractionGate, ReasoningEffortV1, RoleSession, SessionEvent } from "../../../src/model/runtime.ts";
import { makeRole } from "./helpers.ts";

const REJECTION = '{"error":{"message":"Unsupported parameter: reasoning","type":"invalid_request_error"}}';

function fakeGate(): InteractionGate {
  return { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} };
}

async function mcpModules(): Promise<CodexMcpModules> {
  const [server, client, memory, types] = await Promise.all(["@modelcontextprotocol/sdk/server/index.js", "@modelcontextprotocol/sdk/client/index.js", "@modelcontextprotocol/sdk/inMemory.js", "@modelcontextprotocol/sdk/types.js"].map((name) => import(name)));
  return { Server: server.Server, Client: client.Client, InMemoryTransport: memory.InMemoryTransport, ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema };
}

/** 独立最小 app-server 假：只实现适配器真实消费的 RPC 面；通知面逐帧原样（测试全权控制）。 */
class Engine implements CodexRpcConnection {
  input: CodexEngineInput;
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  listeners = new Set<(method: string, params: unknown) => void>();
  threadId = "thread-g5";
  turn = 0;
  turnId = "";
  closed = false;
  constructor(input: CodexEngineInput) { this.input = input; }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "config/read") {
      const override = this.input.configOverrides.find((value) => value.startsWith("web_search="));
      const mode = /^web_search="([^"]*)"$/.exec(override ?? "")?.[1] ?? "disabled";
      return { config: { features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map((name) => [name, false])), sandbox_mode: "read-only", approval_policy: "never", web_search: mode, mcp_servers: {} } };
    }
    if (method === "thread/start") return { thread: { id: this.threadId }, sandbox: { type: "readOnly" }, approvalPolicy: "never" };
    if (method === "mcpServerStatus/list") return { data: [], nextCursor: null };
    if (method === "turn/start") { this.turn += 1; this.turnId = `native-turn-${this.turn}`; return { turn: { id: this.turnId, status: "inProgress" } }; }
    if (method === "turn/interrupt") { this.frame("turn/completed", { threadId: this.threadId, turn: { id: this.turnId, status: "interrupted" } }); return {}; }
    throw new Error(`unexpected RPC ${method}`);
  }
  notify() {}
  onNotification(listener: (method: string, params: unknown) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onServerRequest() {}
  async close() { this.closed = true; }
  frame(method: string, params: Record<string, unknown>) { for (const listener of this.listeners) listener(method, params); }
  /** item/started 与 item/completed 分开（原始帧控制——单信号/错序/错轮均由测试构造）。 */
  itemStarted(item: Record<string, unknown>, startedAtMs?: unknown) { this.frame("item/started", { threadId: this.threadId, turnId: this.turnId, item, ...(startedAtMs !== undefined ? { startedAtMs } : {}) }); }
  itemCompleted(item: Record<string, unknown>, completedAtMs?: unknown) { this.frame("item/completed", { threadId: this.threadId, turnId: this.turnId, item: { id: "rs-1", ...item }, ...(completedAtMs !== undefined ? { completedAtMs } : {}) }); }
  failTurn(message: string, willRetry = false) { this.frame("error", { threadId: this.threadId, turnId: this.turnId, error: { message }, willRetry }); }
  finish(status = "completed") { this.frame("turn/completed", { threadId: this.threadId, turn: { id: this.turnId, status } }); }
}

function harness() {
  const engines: Engine[] = [];
  return { engines, get engine() { return engines.at(-1)!; }, factory: async (input: CodexEngineInput): Promise<CodexRpcConnection> => { const engine = new Engine(input); engines.push(engine); return engine; } };
}

function options(root: string, engines: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
  return {
    runtime: "codex", projectRoot: root, skillRoot: root, tools: [],
    interactionGate: fakeGate(), currentTurnId: () => "ans-turn", modelId: "fixture-model",
    env: { CODEX_API_KEY: "g5-fake-key", PATH: process.env.PATH },
    engineFactory: engines.factory, mcpLoader: mcpModules, promptTimeoutMs: 15000, constructTimeoutMs: 15000,
    ...extra,
  } as never;
}

function collect(session: RoleSession): { entries: SessionEvent[]; done: Promise<void> } {
  const entries: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) entries.push(event); })();
  return { entries, done };
}

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) { if (Date.now() > deadline) throw new Error(`等待超时：${label}`); await new Promise((resolve) => setTimeout(resolve, 2)); }
}

async function beginTurn(session: RoleSession, engine: Engine, text = "fixture"): Promise<{ completion: Promise<void> }> {
  const before = engine.turn;
  const completion = session.prompt(text);
  void completion.catch(() => {});
  await until(() => engine.turn > before, "turn/start");
  return { completion };
}

const effortOverrides = (engine: Engine) => engine.input.configOverrides.filter((value) => value.startsWith("model_reasoning_effort"));
const reasoningRows = (entries: SessionEvent[]) => entries.filter((entry) => (entry.detail as { source?: string } | undefined)?.source === "reasoning");
const effortRows = (entries: SessionEvent[]) => entries.filter((entry) => (entry.detail as { source?: string } | undefined)?.source === "reasoning-effort");

// —————————————————————— ① settings 五值校验（越界装配前抛、零副作用） ——————————————————————

test("D1 五值校验：越界值（max/minimal/none/大小写/数字/空串）一律装配前抛错且零副作用；五合法值可装配", async () => {
  for (const bad of ["max", "minimal", "none", "High", "OFF", "off ", 42, "", true] as unknown[]) {
    const engines = harness();
    await assert.rejects(
      (async () => createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: bad as ReasoningEffortV1 })).bindRole(makeRole("R-D")))(),
      /Codex invalid reasoning effort option/,
      JSON.stringify(bad) + " 越界须抛",
    );
    assert.equal(engines.engines.length, 0, JSON.stringify(bad) + " 抛错在装配前（engineFactory 从未调用）");
  }
  for (const good of ["off", "low", "medium", "high", "xhigh"] as const) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: good })).bindRole(makeRole("R-D"));
    assert.equal(engines.engines.length, 1, good + " 合法可装配");
    await session.dispose();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
});

// —————————————————————— ② 单条 -c 注入 / off 零注入＋如实文案 ——————————————————————

test("D2 注入：四档恰一条独立顶层标量 `-c model_reasoning_effort=\"<值>\"`（不与 mcp_servers 同条）；未设/off 零注入", async () => {
  for (const effort of ["low", "medium", "high", "xhigh"] as const) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: effort })).bindRole(makeRole("R-D"));
    const hits = effortOverrides(engines.engine);
    assert.deepEqual(hits, [`model_reasoning_effort=${JSON.stringify(effort)}`], effort + " 恰一条");
    assert.equal(hits.length, 1);
    assert.equal(engines.engine.input.configOverrides.some((value) => value.includes("model_reasoning_effort") && value.startsWith("mcp_servers=")), false, "不与 mcp_servers 同条");
    await session.dispose();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  // 未设：零注入。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(makeRole("R-D"));
    assert.deepEqual(effortOverrides(engines.engine), [], "未设 ⇒ 零注入（逐字现状）");
    await session.dispose();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
});

test("D2b off：无该档——零注入＋会话级恰一行如实（不假装关闭）；未设会话零如实行", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "off" })).bindRole(makeRole("R-D"));
  const events = collect(session);
  assert.deepEqual(effortOverrides(engines.engine), [], "off ⇒ 零注入");
  await session.dispose();
  await events.done;
  const rows = effortRows(events.entries);
  assert.equal(rows.length, 1, "会话级恰一行");
  assert.equal(rows[0]!.summary, "Codex 平台无「关」档：未注入推理强度参数（维持平台默认，推理未关闭）", "如实文案（不假装关闭）");
  assert.deepEqual(rows[0]!.detail, { version: 1, source: "reasoning-effort", reason: "off-unsupported" });
  assert.equal(rows[0]!.turnId, undefined, "构造期行无轮次身份");
  // 未设对照：零如实行（逐字现状）。
  const baseline = harness();
  const baseSession = await createCodexRuntimeAdapter(options("/fixture", baseline)).bindRole(makeRole("R-D"));
  const baseEvents = collect(baseSession);
  await baseSession.dispose();
  await baseEvents.done;
  assert.equal(effortRows(baseEvents.entries).length, 0);
});

// —————————————————————— ③ reasoning 事件面（完成态恰一行 / 文本优先级 / 双信号时长 / 增量零行 / 错轮丢弃） ——————————————————————

test("D3 事件面：完成态恰一行；content 优先、仅摘要回退、全空/仅空串⇒omitted；非字符串项过滤；durationMs 仅双信号", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(makeRole("R-D"));
  const events = collect(session);
  const { completion } = await beginTurn(session, engines.engine);
  const engine = engines.engine;
  engine.itemStarted({ type: "reasoning", id: "r1", summary: [], content: [] }, 1000);
  engine.itemCompleted({ type: "reasoning", id: "r1", summary: ["s"], content: ["a", "b"] }, 2500);       // content 优先 + 双信号 1500
  engine.itemCompleted({ type: "reasoning", id: "r2", summary: ["s1", 42, null, "s2"], content: [] });     // 仅摘要（非串过滤）
  engine.itemCompleted({ type: "reasoning", id: "r3", summary: [], content: [] });                          // 全空 ⇒ omitted
  engine.itemCompleted({ type: "reasoning", id: "r4", summary: [], content: [""] });                        // 仅空串内容 ⇒ omitted
  engine.itemCompleted({ type: "reasoning", id: "r5", summary: [], content: "not-an-array" });              // 坏形状 content ⇒ 摘要回退（安全）
  engine.itemCompleted({ type: "reasoning", id: "r6", summary: [], content: ["only-completed"] }, 4000);    // 仅完成信号 ⇒ 无 durationMs
  engine.itemStarted({ type: "reasoning", id: "r7", summary: [], content: [] }, NaN);                       // 非法起点 ⇒ 无 durationMs
  engine.itemCompleted({ type: "reasoning", id: "r7", summary: [], content: ["nan-start"] }, 5000);
  engine.itemStarted({ type: "reasoning", id: "r8", summary: [], content: [] }, 6000);
  engine.itemCompleted({ type: "reasoning", id: "r8", summary: [], content: ["reversed"] }, 5500);          // 倒序 ⇒ clamp 0
  // 错轮帧：threadId/turnId 指向别处 ⇒ 必须丢弃（不产行）。
  engine.frame("item/completed", { threadId: engine.threadId, turnId: "someone-else", item: { id: "rx", type: "reasoning", summary: ["cross"], content: ["cross"] } });
  engine.frame("item/completed", { threadId: "other-thread", turnId: engine.turnId, item: { id: "ry", type: "reasoning", summary: ["cross2"], content: ["cross2"] } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  engine.finish();
  await completion;
  await session.dispose();
  await events.done;
  const rows = reasoningRows(events.entries);
  assert.equal(rows.length, 8, "恰八行（错轮帧零行）");
  const factsOf = (row: SessionEvent) => (row.detail as { reasoning: Record<string, unknown> }).reasoning;
  assert.deepEqual(factsOf(rows[0]!), { text: "a\nb", status: "complete", durationMs: 1500 }, "content 优先＋双信号时长");
  assert.deepEqual(factsOf(rows[1]!), { text: "s1\ns2", status: "complete" }, "仅摘要（非串项过滤后）");
  assert.deepEqual(factsOf(rows[2]!), { text: "", status: "omitted" }, "全空 ⇒ omitted");
  assert.deepEqual(factsOf(rows[3]!), { text: "", status: "omitted" }, "仅空串内容 ⇒ omitted（不装 complete）");
  assert.deepEqual(factsOf(rows[4]!), { text: "", status: "omitted" }, "坏形状 content ⇒ 摘要空回退 ⇒ omitted");
  assert.deepEqual(factsOf(rows[5]!), { text: "only-completed", status: "complete" }, "仅完成信号 ⇒ 不携带时长");
  assert.deepEqual(factsOf(rows[6]!), { text: "nan-start", status: "complete" }, "非法起点 ⇒ 不携带时长");
  assert.deepEqual(factsOf(rows[7]!), { text: "reversed", status: "complete", durationMs: 0 }, "倒序 clamp 到 0（真实信号，≥0）");
  assert.equal(entries_summary_ok(events.entries), true, "summary 位＝核心定格常量");
  function entries_summary_ok(entries: SessionEvent[]): boolean { return entries.filter((entry) => (entry.detail as { source?: string } | undefined)?.source === "reasoning").every((entry) => entry.summary === "已思考"); }
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed", "推理 item 不进隔离");
});

test("D3b 增量帧零行：三个 reasoning 增量方法只消费不产行、不误报工具行", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(makeRole("R-D"));
  const events = collect(session);
  const { completion } = await beginTurn(session, engines.engine);
  const engine = engines.engine;
  for (const method of ["item/reasoning/summaryPartAdded", "item/reasoning/summaryTextDelta", "item/reasoning/textDelta"]) {
    engine.frame(method, { threadId: engine.threadId, turnId: engine.turnId, itemId: "rs-1", delta: "帧", contentIndex: 0, summaryIndex: 0 });
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  engine.finish();
  await completion;
  await session.dispose();
  await events.done;
  assert.equal(reasoningRows(events.entries).length, 0, "增量帧不产行（完成态先行）");
  assert.equal(events.entries.filter((entry) => ["tool_call", "denied", "accepted"].includes(entry.kind)).length, 0, "不误报工具行");
  assert.equal(events.entries.length, 1, "唯一事件＝settled");
});

// —————————————————————— ④ 降级链 ——————————————————————

test("D4 降级正向：首请求被拒（产出前）⇒ 恰一次去参数重建重发（同输入、其余覆盖逐字不变）、本轮继续；降级行恰一", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
  const events = collect(session);
  const { completion } = await beginTurn(session, engines.engine, "同输入文本");
  const first = engines.engine;
  assert.deepEqual(effortOverrides(first), ['model_reasoning_effort="high"']);
  first.failTurn(REJECTION);
  await until(() => engines.engines.length === 2, "重连");
  const retried = engines.engine;
  assert.deepEqual(effortOverrides(retried), [], "去参数：新引擎零 effort 覆盖");
  // 其余覆盖逐字不变（同实例差一：provider 定义含随机 instanceId——逐条对齐除 effort 外的覆盖面）。
  const nonEffort = (engine: Engine) => engine.input.configOverrides.filter((value) => !value.startsWith("model_reasoning_effort") && !value.startsWith("model_providers."));
  assert.deepEqual(nonEffort(retried), nonEffort(first), "其余 -c 覆盖逐字不变（接口字段面）");
  await until(() => retried.requests.some((entry) => entry.method === "turn/start"), "重发 turn/start");
  const restarted = retried.requests.find((entry) => entry.method === "turn/start")!;
  assert.deepEqual(restarted.params.input, [{ type: "text", text: "同输入文本", text_elements: [] }], "同一输入重发");
  retried.finish();
  await completion; // 本轮继续（正常 resolve）
  await session.dispose();
  await events.done;
  const rows = effortRows(events.entries);
  assert.equal(rows.length, 1, "降级如实行恰一");
  assert.equal(rows[0]!.summary, "本网关不支持所设推理强度，本轮已按默认执行");
  assert.equal(rows[0]!.turnId, "ans-turn");
  assert.deepEqual((rows[0]!.detail as { reason?: string; source?: string }), { version: 1, source: "reasoning-effort", reason: "gateway-rejected" });
  assert.equal(events.entries.filter((entry) => entry.kind === "settled").length, 1, "settled 单点");
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed");
});

test("D4b 负例四格：重发再拒不再重建；无锚不识别；已产出（含仅增量帧）不降级；未注入不降级", async () => {
  // 格 a：重发再拒 ⇒ 如实失败、engine 恰两台。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    const { completion } = await beginTurn(session, engines.engine);
    engines.engine.failTurn(REJECTION);
    await until(() => engines.engines.length === 2, "重连");
    await until(() => engines.engine.requests.some((entry) => entry.method === "turn/start"), "重发");
    engines.engine.failTurn(REJECTION);
    await assert.rejects(completion, /Unsupported parameter: reasoning/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engines.engines.length, 2, "恰一次：无第三台");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 1, "降级行仍恰一");
    assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "failed");
  }
  // 格 b：无锚（普通失败）⇒ 不识别不重发。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    const { completion } = await beginTurn(session, engines.engine);
    engines.engine.failTurn("model unavailable");
    await assert.rejects(completion, /model unavailable/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engines.engines.length, 1, "不识别不重发");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
  // 格 c1：已产出（agentMessage）后拒绝 ⇒ 闸关。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    const { completion } = await beginTurn(session, engines.engine);
    engines.engine.itemCompleted({ type: "agentMessage", text: "先出了一段" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    engines.engine.failTurn(REJECTION);
    await assert.rejects(completion, /Unsupported parameter: reasoning/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engines.engines.length, 1, "已产出 ⇒ 不重发");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
  // 格 c2（对抗增强，实施方未覆盖）：仅 reasoning **增量帧**也算「已产出」⇒ 不降级。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    const { completion } = await beginTurn(session, engines.engine);
    const engine = engines.engine;
    engine.frame("item/reasoning/textDelta", { threadId: engine.threadId, turnId: engine.turnId, itemId: "rd", delta: "半句", contentIndex: 0 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    engine.failTurn(REJECTION);
    await assert.rejects(completion, /Unsupported parameter: reasoning/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engines.engines.length, 1, "增量帧已产出 ⇒ 不重发（保守）");
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
  // 格 d：未注入 ⇒ 同文案也不重发。
  {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(makeRole("R-D"));
    const events = collect(session);
    const { completion } = await beginTurn(session, engines.engine);
    engines.engine.failTurn(REJECTION);
    await assert.rejects(completion, /Unsupported parameter: reasoning/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engines.engines.length, 1);
    await session.dispose(); await events.done;
    assert.equal(effortRows(events.entries).length, 0);
  }
});

test("D4c 降级后跨轮：次轮同文案再拒 ⇒ 闸已关（会话级恰一次，不再重发）；引擎沿用（零参数）", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "medium" })).bindRole(makeRole("R-D"));
  const events = collect(session);
  const { completion: first } = await beginTurn(session, engines.engine, "第一轮");
  engines.engine.failTurn(REJECTION);
  await until(() => engines.engines.length === 2, "重连");
  await until(() => engines.engine.requests.some((entry) => entry.method === "turn/start"), "重发");
  engines.engine.finish();
  await first;
  assert.equal(engines.engines.length, 2);
  // 次轮：同一（重发）引擎；注入面已零参数，且闸关。
  const { completion: second } = await beginTurn(session, engines.engine, "第二轮");
  engines.engine.failTurn(REJECTION);
  await assert.rejects(second, /Unsupported parameter: reasoning/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(engines.engines.length, 2, "次轮不再重发（恰一次＝会话级）");
  await session.dispose();
  await events.done;
  assert.equal(effortRows(events.entries).length, 1, "降级行会话级恰一");
  assert.deepEqual(events.entries.filter((entry) => entry.kind === "settled").map((entry) => (entry.detail as { outcome: string }).outcome), ["completed", "failed"]);
});
