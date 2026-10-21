// test/测试/g5-reasoning-verify/d-codex.test.ts —— D 域：Codex 适配器接线（独立验证）。
//
// 验证对象：`src/provider/codex/{session,config,protocol}.ts`——settings 五值校验（越界装配前抛）、
// 单条 `-c` 注入（未设/off 零注入）、off 如实文案、reasoning 事件（完成态恰一行/文本优先级/双信号时长/
// 增量零行）、D1 精确拒绝后的默认/去覆盖候选、真实 terminal 时序和失败后策略恢复。
// **自建独立 engine 假**（不复用实施方 fixtures 的 FakeEngine）：逐帧原始控制（错轮帧/单信号/非字符串
// 摘要等对抗件均为实施方用例未覆盖类别）。

import test from "node:test";
import assert from "node:assert/strict";

import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import type { CodexEngineInput, CodexRpcConnection, CodexMcpModules } from "../../../src/provider/codex/session.ts";
import { DISABLED_NATIVE_FEATURES } from "../../../src/common/codex-adapter/config.ts";
import type { InteractionGate, ReasoningEffortV1, RoleSession, SessionEvent } from "../../../src/model/runtime.ts";
import { makeRole } from "./helpers.ts";

const REJECTION = JSON.stringify({ error: { message: "Unsupported parameter: reasoning.effort", type: "invalid_request_error", code: "unsupported_parameter", param: "reasoning.effort" } });
const VALUE_REJECTION = JSON.stringify({ error: { message: "Unsupported value: high", type: "invalid_request_error", code: "unsupported_value", param: "reasoning.effort" } });

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
  readonly models: unknown[];
  constructor(input: CodexEngineInput, models: unknown[] = [], id = "thread-g5") { this.input = input; this.models = models; this.threadId = id; }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "model/list") return { data: this.models, nextCursor: null };
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
  failTurn(message: string, willRetry = false) {
    this.frame("error", { threadId: this.threadId, turnId: this.turnId, error: { message }, willRetry });
    if (!willRetry) this.frame("turn/completed", { threadId: this.threadId, turn: { id: this.turnId, status: "failed", error: { message } } });
  }
  finish(status = "completed") { this.frame("turn/completed", { threadId: this.threadId, turn: { id: this.turnId, status } }); }
}

function harness(models: unknown[] = []) {
  const engines: Engine[] = [];
  return { engines, get engine() { return engines.at(-1)!; }, factory: async (input: CodexEngineInput): Promise<CodexRpcConnection> => { const engine = new Engine(input, models, `thread-g5-${engines.length + 1}`); engines.push(engine); return engine; } };
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
const systemRows = (entries: SessionEvent[], state?: string) => entries.filter(entry => {
  const detail = entry.detail as { source?: string; state?: string } | undefined;
  return detail?.source === "system" && (state === undefined || detail.state === state);
});
const turnRequests = (engine: Engine) => engine.requests.filter(request => request.method === "turn/start");

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

test("D2b off 与未设不注入参数；配置提示只在 active prompt 内，不声称推理已关闭", async () => {
  for (const effort of ["off", undefined]) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: effort })).bindRole(makeRole("R-D"));
    const events = collect(session);
    assert.deepEqual(effortOverrides(engines.engine), []);
    assert.equal(events.entries.length, 0, "构造期不得发无轮次提示");
    const { completion } = await beginTurn(session, engines.engine);
    assert.equal(turnRequests(engines.engine)[0]!.params.effort, undefined);
    engines.engine.finish(); await completion;
    await session.dispose(); await events.done;
    const rows = systemRows(events.entries, "configured");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.turnId, "ans-turn");
    assert.match(rows[0]!.summary, /未验证/);
    if (effort === "off") assert.match(rows[0]!.summary, /不表示关闭/);
  }
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
  assert.equal(events.entries.filter(entry => (entry.detail as { source?: string } | undefined)?.source !== "system").length, 1, "除配置提示外唯一事件＝settled");
});

// D1: fake 只代替 RPC 传输；error 后真实 terminal 到达才可启动兼容 turn。
test("D4 字段拒绝后去覆盖重建：新 native ID、同输入、completed 后才提示成功", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
  const events = collect(session);
  try {
    const { completion } = await beginTurn(session, engines.engine, "同输入文本");
    const first = engines.engine;
    first.failTurn(REJECTION);
    await until(() => engines.engines.length === 2 && engines.engine.turn === 1, "新引擎兼容 turn/start");
    const retried = engines.engine;
    assert.deepEqual(effortOverrides(retried), []);
    const nonEffort = (engine: Engine) => engine.input.configOverrides.filter(value => !value.startsWith("model_reasoning_effort") && !value.startsWith("model_providers."));
    assert.deepEqual(nonEffort(retried), nonEffort(first));
    const restarted = turnRequests(retried)[0]!;
    assert.deepEqual(restarted.params.input, [{ type: "text", text: "同输入文本", text_elements: [] }]);
    assert.equal(restarted.params.threadId, retried.threadId);
    assert.notEqual(retried.threadId, first.threadId, "非持久首轮重建必须采用新 native ID");
    assert.equal(restarted.params.effort, undefined);
    assert.equal(systemRows(events.entries, "completed").length, 0, "尝试阶段不伪成功");
    retried.itemCompleted({ type: "agentMessage", text: "compatible answer" });
    retried.finish(); await completion;
  } finally { await session.dispose(); await events.done; }
  assert.equal(systemRows(events.entries, "trying").length, 1);
  assert.equal(systemRows(events.entries, "completed").length, 1);
  const answer = events.entries.findIndex(event => event.summary === "compatible answer");
  assert.ok(answer >= 0 && answer < events.entries.indexOf(systemRows(events.entries, "completed")[0]!));
  assert.deepEqual(events.entries.filter(event => event.kind === "settled").map(event => (event.detail as { outcome: string }).outcome), ["completed"]);
});

test("D4b 精确默认档同线程继续；兼容失败/取消后下一轮仍用 high", async () => {
  const models = [{ model: "fixture-model", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] }];
  for (const result of ["completed", "failed", "cancelled"] as const) {
    const engines = harness(models);
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    try {
      const { completion } = await beginTurn(session, engines.engine, "first task");
      engines.engine.failTurn(VALUE_REJECTION);
      await until(() => engines.engine.turn === 2, "同线程默认档兼容");
      assert.equal(engines.engines.length, 1);
      assert.equal(turnRequests(engines.engine)[1]!.params.effort, "low");
      assert.deepEqual(turnRequests(engines.engine)[1]!.params.input, turnRequests(engines.engine)[0]!.params.input);
      if (result === "completed") { engines.engine.finish(); await completion; }
      else if (result === "failed") { engines.engine.failTurn("unexpected status 500"); await assert.rejects(completion, /500/); }
      else { await session.abort!(); await completion; }
      const next = await beginTurn(session, engines.engine, "next task");
      assert.equal(turnRequests(engines.engine).at(-1)!.params.effort, result === "completed" ? "low" : "high");
      engines.engine.finish(); await next.completion;
    } finally { await session.dispose(); await events.done; }
    assert.equal(systemRows(events.entries, "completed").length, result === "completed" ? 1 : 0);
    assert.deepEqual(events.entries.filter(event => event.kind === "settled").map(event => (event.detail as { outcome: string }).outcome), [result === "cancelled" ? "aborted" : result, "completed"]);
  }
});

test("D4c 精确字段也不得重放已有输出或已开始工具；普通错误与错误模型不兼容", async () => {
  const cases = [
    { error: "model unavailable" },
    { error: JSON.stringify({ error: { code: "unsupported_parameter", param: "model", message: "Unsupported parameter: reasoning.effort" } }) },
    { error: "Unsupported parameter: reasoning" },
    { error: REJECTION, output: "message" },
    { error: REJECTION, output: "delta" },
    { error: REJECTION, output: "mcpToolCall" },
    { error: REJECTION, output: "webSearch" },
    { error: REJECTION, output: "dynamicToolCall" },
    { error: REJECTION, unset: true },
  ];
  for (const cell of cases) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, cell.unset ? {} : { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
    const events = collect(session);
    try {
      const { completion } = await beginTurn(session, engines.engine);
      if (cell.output === "message") engines.engine.itemCompleted({ type: "agentMessage", text: "already visible" });
      else if (cell.output === "delta") engines.engine.frame("item/reasoning/textDelta", { threadId: engines.engine.threadId, turnId: engines.engine.turnId, itemId: "delta", delta: "visible", contentIndex: 0 });
      else if (cell.output) engines.engine.itemStarted({ type: cell.output, id: "started" });
      engines.engine.failTurn(cell.error);
      await assert.rejects(completion);
      assert.equal(engines.engines.length, 1, JSON.stringify(cell));
      assert.equal(engines.engine.turn, 1, "不得整轮重放");
    } finally { await session.dispose(); await events.done; }
    assert.equal(systemRows(events.entries, "trying").length, 0);
    assert.equal(systemRows(events.entries, "completed").length, 0);
  }
});

test("D4d 去覆盖仍失败：不伪成功、不无界重试，下一轮恢复原 high", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { reasoningEffort: "high" })).bindRole(makeRole("R-D"));
  const events = collect(session);
  try {
    const { completion } = await beginTurn(session, engines.engine);
    engines.engine.failTurn(REJECTION);
    await until(() => engines.engines.length === 2 && engines.engine.turn === 1, "去覆盖尝试");
    engines.engine.failTurn(REJECTION);
    await assert.rejects(completion, /reasoning/);
    assert.equal(engines.engines.length, 2);
    const next = await beginTurn(session, engines.engine, "retry original policy");
    assert.equal(turnRequests(engines.engine).at(-1)!.params.effort, "high");
    engines.engine.finish(); await next.completion;
  } finally { await session.dispose(); await events.done; }
  assert.equal(systemRows(events.entries, "trying").length, 1);
  assert.equal(systemRows(events.entries, "completed").length, 0);
  assert.deepEqual(events.entries.filter(event => event.kind === "settled").map(event => (event.detail as { outcome: string }).outcome), ["failed", "completed"]);
});
