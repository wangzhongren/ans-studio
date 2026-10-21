// ANS-REASONING-LIGHT D1 / 验收 R1：真实安装 SDK、真实生产 handler、纯本地请求。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRealPiRuntimeAdapter, isThinkingParameterRejection,
  REASONING_COMPATIBILITY_ATTEMPT, REASONING_COMPATIBILITY_SUCCESS,
  type RealPiAdapterOptions,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate, withTimeout } from "../../src/common/pi-adapter/timeout.ts";
import type { SessionEvent, RoleSession, ToolDefinition } from "../../src/model/runtime.ts";
import { makeRole } from "./fixtures.ts";

// buildExplicitRuntime 复用 Anthropic provider 的真实认证入口；夹具必须自足，不能依赖启动命令补键。
const AUTH = "ANTHROPIC_AUTH_TOKEN";
const previousAuth = process.env[AUTH];
process.env[AUTH] = "local-placeholder-no-real-credential";
after(() => {
  if (previousAuth === undefined) delete process.env[AUTH];
  else process.env[AUTH] = previousAuth;
});
const log = { stage() {}, trace() {}, traceEnabled: false };
const unsupported = { error: { type: "invalid_request_error", code: "unsupported_parameter", param: "thinking", message: "thinking is not supported" } };
const plainError = { error: { type: "invalid_request_error", message: "unrelated upstream validation error" } };
function sse(tool = false): unknown[] {
  return [
    { type: "message_start", message: { id: "msg_local", type: "message", role: "assistant", model: "compat-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    ...(tool ? [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call_once", name: "probe_tool", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
    ] : [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "normal answer" } },
    ]),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } },
    { type: "message_stop" },
  ];
}
interface Capture { body: Record<string, unknown>; auth: string | undefined; url: string | undefined; }
interface Reply { status?: number; json?: unknown; text?: string; events?: unknown[]; hold?: Promise<void>; disconnect?: boolean; }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

async function harness(respond: (capture: Capture, index: number) => Reply, options: { effort?: RealPiAdapterOptions["reasoningEffort"]; tools?: ToolDefinition[]; retries?: number; timeout?: number } = {}) {
  const pi = await import("@earendil-works/pi-coding-agent");
  const root = mkdtempSync(join(tmpdir(), "pi-compatibility-"));
  const captures: Capture[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { void (async () => {
      const capture = { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>, auth: req.headers.authorization, url: req.url };
      captures.push(capture);
      const reply = respond(capture, captures.length - 1);
      if (reply.hold) await reply.hold;
      if (reply.disconnect) { res.destroy(); return; }
      if (res.destroyed) return;
      if (reply.text !== undefined) {
        res.writeHead(reply.status ?? 400, { "content-type": "text/plain" });
        res.end(reply.text);
      } else if (reply.json !== undefined) {
        res.writeHead(reply.status ?? 400, { "content-type": "application/json", "retry-after-ms": "1" });
        res.end(JSON.stringify(reply.json));
      } else {
        res.writeHead(reply.status ?? 200, { "content-type": "text/event-stream" });
        res.end((reply.events ?? sse()).map(event => { const e = event as {type: string}; return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`; }).join(""));
      }
    })(); });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  let native!: Awaited<ReturnType<typeof pi.createAgentSession>>["session"];
  let nativePrompts = 0;
  let turn = 0;
  const dependencies = { loadPi: async () => ({
    ...pi,
    SettingsManager: { ...pi.SettingsManager, inMemory: (input: Parameters<typeof pi.SettingsManager.inMemory>[0]) => pi.SettingsManager.inMemory({ ...input, retry: { enabled: false, provider: { maxRetries: options.retries ?? 0, maxRetryDelayMs: 100 } } }) },
    async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
      const out = await pi.createAgentSession(input); native = out.session;
      const prompt = native.prompt.bind(native);
      native.prompt = async (...args) => { nativePrompts++; return prompt(...args); };
      return out;
    },
  } as typeof pi) };
  const sessions: { session: RoleSession; events: SessionEvent[]; collected: Promise<void> }[] = [];
  async function open(modelId = "compat-model") {
    const interactionGate = createInteractionGate();
    const session = await createRealPiRuntimeAdapter({
      runtime: "pi", projectRoot: root, skillRoot: root, tools: options.tools ?? [], interactionGate, currentTurnId: () => `turn-${turn}`,
      config: { providerId: "local-compat", baseUrl, modelId, apiKeyEnvVar: AUTH, contextWindow: 500000, contextWindowSource: "explicit" },
      logger: log, ...(options.effort ? { reasoningEffort: options.effort } : {}), ...(options.timeout ? { turnLastResortMs: options.timeout } : {}),
    }, dependencies).bindRole(makeRole());
    const events: SessionEvent[] = [];
    const collected = (async () => { for await (const event of session.events()) events.push(event); })();
    const entry = { session, events, collected }; sessions.push(entry);
    await new Promise<void>(r => setImmediate(r));
    assert.equal(events.filter(e => (e.detail as {source?: string})?.source === "system").length, 0, "构造阶段没有系统配置消息");
    return { ...entry, interactionGate, async prompt(text: string) { turn++; await session.prompt(text); await new Promise<void>(r => setImmediate(r)); } };
  }
  return { captures, open, get native() { return native; }, get nativePrompts() { return nativePrompts; }, async close() {
    for (const entry of sessions) { await entry.session.dispose(); await entry.collected; }
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); rmSync(root, { recursive: true, force: true });
  } };
}
const wireSummary = (captures: Capture[]) => captures.map(c => ({ model: c.body["model"], thinking: c.body["thinking"] ?? null, max_tokens: c.body["max_tokens"] }));
const thinking = (captures: Capture[]) => captures.map(c => c.body["thinking"] !== undefined);
const outcomes = (events: SessionEvent[]) => events.filter(e => e.kind === "settled").map(e => (e.detail as {outcome?: string}).outcome);
const countNotice = (events: SessionEvent[], text: string) => events.filter(e => e.summary === text).length;

for (const effort of [undefined, "off", "high"] as const) test(`明确拒绝：${String(effort)} 当前/后续轮完成，消息不重放，保存设置不变`, async (t) => {
  const h = await harness(c => c.body["thinking"] ? { json: unsupported } : {}, { effort });
  try {
    const run = await h.open();
    await run.prompt("one input"); await run.prompt("next input");
    assert.deepEqual(thinking(h.captures), [true, false, false]);
    assert.deepEqual(h.captures[0]!.body["messages"], h.captures[1]!.body["messages"]);
    assert.equal(h.nativePrompts, 2);
    assert.equal(h.native.messages.filter(m => m.role === "user").length, 2);
    assert.equal(h.native.thinkingLevel, effort ?? "medium");
    assert.deepEqual(outcomes(run.events), ["completed", "completed"]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_ATTEMPT), 1);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_SUCCESS), 1);
    const success = run.events.findIndex(e => e.summary === REASONING_COMPATIBILITY_SUCCESS);
    assert.ok(success > run.events.findIndex(e => e.summary === "normal answer"), "正常正文后才确认兼容");
    assert.ok(run.events.filter(e => String(e.summary).includes("兼容") || String(e.summary).includes("思考等级")).every(e => (e.detail as {source?: string}).source === "system"));
    assert.ok(!JSON.stringify(run.events).includes(process.env[AUTH]!));
    assert.equal(h.captures[0]!.auth, h.captures[1]!.auth);
    assert.equal(h.captures[0]!.url, h.captures[1]!.url);
    t.diagnostic(JSON.stringify({ wire: wireSummary(h.captures), nativePrompts: h.nativePrompts, userHistory: h.native.messages.filter(m => m.role === "user").length, outcomes: outcomes(run.events) }));
  } finally { await h.close(); }
});

test("已执行工具后请求拒绝：保留 tool_result，工具和用户输入均不重放", async (t) => {
  let effects = 0;
  const tool: ToolDefinition = { name: "probe_tool", description: "local counter", inputSchema: { type: "object", properties: {}, additionalProperties: false }, async handler() { effects++; return { ok: true, message: "counted once" }; } };
  const h = await harness((c, i) => i === 0 ? { events: sse(true) } : c.body["thinking"] ? { json: unsupported } : {}, { effort: "high", tools: [tool] });
  try {
    const run = await h.open(); await run.prompt("one task with a tool");
    assert.deepEqual(thinking(h.captures), [true, true, false]);
    assert.equal(effects, 1); assert.equal(h.nativePrompts, 1);
    assert.equal(h.native.messages.filter(m => m.role === "user").length, 1);
    assert.deepEqual(h.captures[1]!.body["messages"], h.captures[2]!.body["messages"]);
    assert.match(JSON.stringify(h.captures[2]!.body["messages"]), /tool_result/);
    assert.deepEqual(outcomes(run.events), ["completed"]);
    t.diagnostic(JSON.stringify({ wire: wireSummary(h.captures), toolEffects: effects, nativePrompts: h.nativePrompts, userHistory: h.native.messages.filter(m => m.role === "user").length }));
  } finally { await h.close(); }
});

test("SDK 传输重试：兼容请求遇到 500 仍去参，只切换一次", async (t) => {
  const h = await harness((_c, i) => i === 0 ? { json: unsupported } : i === 1 ? { status: 500, json: plainError } : {}, { effort: "high", retries: 1 });
  try {
    const run = await h.open(); await run.prompt("transport retry"); await run.prompt("after success");
    assert.deepEqual(thinking(h.captures), [true, false, false, false]);
    t.diagnostic(JSON.stringify({ wire: wireSummary(h.captures), outcomes: outcomes(run.events) }));
    assert.equal(h.nativePrompts, 2);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_ATTEMPT), 1);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_SUCCESS), 1);
    assert.deepEqual(outcomes(run.events), ["completed", "completed"]);
  } finally { await h.close(); }
});

test("兼容请求全部失败：不粘连下一轮，不伪报成功", async (t) => {
  const h = await harness((_c, i) => i === 0 ? { json: unsupported } : i <= 2 ? { status: 500, json: plainError } : {}, { effort: "high", retries: 1 });
  try {
    const run = await h.open(); await run.prompt("failed compatibility"); await run.prompt("retry original preference");
    assert.deepEqual(thinking(h.captures), [true, false, false, true]);
    t.diagnostic(JSON.stringify({ wire: wireSummary(h.captures), outcomes: outcomes(run.events) }));
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_SUCCESS), 0);
    assert.deepEqual(outcomes(run.events), ["failed", "completed"]);
  } finally { await h.close(); }
});

test("HTTP 200 但流报错：不能确认兼容；下一轮仍带原参数", async () => {
  const h = await harness((_c, i) => i === 0 ? { json: unsupported } : i === 1 ? { events: [{ type: "error", error: { type: "invalid_request_error", message: "stream rejected" } }] } : {}, { effort: "high" });
  try {
    const run = await h.open(); await run.prompt("bad stream"); await run.prompt("next");
    assert.deepEqual(thinking(h.captures), [true, false, true]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_SUCCESS), 0);
    assert.deepEqual(outcomes(run.events), ["failed", "completed"]);
  } finally { await h.close(); }
});

for (const status of [400, 401, 403, 408, 429, 500, 502]) test(`普通错误 ${status} 不改变下一轮参数`, async () => {
  const h = await harness((_c, i) => i === 0 ? { status, json: status === 400 ? plainError : unsupported } : {}, { effort: "high" });
  try {
    const run = await h.open(); await run.prompt("ordinary error"); await run.prompt("next");
    assert.deepEqual(thinking(h.captures), [true, true]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_ATTEMPT), 0);
    assert.deepEqual(outcomes(run.events), ["failed", "completed"]);
  } finally { await h.close(); }
});

for (const json of [
  { error: { code: "unsupported_parameter", param: "model", message: "thinking is not supported" } },
  { error: { code: "model_not_found", param: "thinking", message: "Unknown model" } },
  { error: { type: "invalid_request_error", message: "reasoning effort failed because model is unknown" } },
]) test(`无关参数/模型拒绝不误触发：${JSON.stringify(json)}`, async () => {
  const h = await harness((_c, i) => i === 0 ? { json } : {}, { effort: "high" });
  try {
    const run = await h.open(); await run.prompt("invalid model"); await run.prompt("next");
    assert.deepEqual(thinking(h.captures), [true, true]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_ATTEMPT), 0);
  } finally { await h.close(); }
});

test("连接中断不触发兼容，下一轮参数保持", async () => {
  const h = await harness((_c, i) => i === 0 ? { disconnect: true } : {}, { effort: "high" });
  try {
    const run = await h.open(); await run.prompt("disconnected"); await run.prompt("next");
    assert.deepEqual(thinking(h.captures), [true, true]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_ATTEMPT), 0);
    assert.deepEqual(outcomes(run.events), ["failed", "completed"]);
  } finally { await h.close(); }
});

for (const mode of ["abort", "timeout"] as const) test(`兼容待返回时 ${mode}：不确认、不重放，下轮恢复原参数`, async (t) => {
  const arrived = deferred(); const release = deferred(); const startup = deferred();
  const h = await harness((_c, i) => {
    if (i === 0) return { json: unsupported, ...(mode === "timeout" ? { hold: startup.promise } : {}) };
    if (i === 1) { arrived.resolve(); return { hold: release.promise }; }
    return {};
  }, { effort: "high", ...(mode === "timeout" ? { timeout: 100 } : {}) });
  let run: Awaited<ReturnType<typeof h.open>> | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    run = await h.open();
    // 本例测兼容请求等待期间的超时，不测前置建连速度。暂停前置阶段，抵达后仍用原100ms。
    // 首次拒绝刻意延迟200ms，确定性覆盖旧夹具“先超时、arrived永不兑现”的全量负载竞态。
    if (mode === "timeout") {
      run.interactionGate.begin();
      startupTimer = setTimeout(startup.resolve, 200);
    }
    const work = run.prompt("cancel this compatibility");
    // 立即捕获拒绝，避免等待 arrived 时 timeout 的 promise 成为未处理拒绝。
    const outcome = work.then(() => undefined, error => error);
    await withTimeout(Promise.race([
      arrived.promise,
      outcome.then(() => { throw new Error("兼容请求抵达前 prompt 已结束，夹具未进入待取消阶段"); }),
    ]), 10000, "等待兼容请求抵达");
    const waitingStartedAt = Date.now();
    run.interactionGate.end();
    if (mode === "abort") await run.session.abort!();
    const error = await withTimeout(outcome, 10000, "等待兼容请求取消或超时");
    if (mode === "timeout") {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "TimeoutError");
      assert.match(error.message, /最后兜底.*100ms/);
      assert.ok(Date.now() - waitingStartedAt >= 80, "兼容请求抵达后应实际等待100ms预算，而非提前超时");
      t.diagnostic("首次拒绝延迟200ms；兼容请求到达后恢复原100ms预算，真实最后兜底超时");
    }
    release.resolve();
    // 下一轮测策略恢复，不让前一轮特设的短预算变成机器负载断言；整体等待仍有独立上限。
    run.interactionGate.begin();
    try { await withTimeout(run.prompt("next after interruption"), 10000, "等待中断后恢复轮"); }
    finally { run.interactionGate.end(); }
    assert.deepEqual(thinking(h.captures), [true, false, true]);
    assert.equal(countNotice(run.events, REASONING_COMPATIBILITY_SUCCESS), 0);
    assert.deepEqual(outcomes(run.events), [mode === "abort" ? "aborted" : "timed_out", "completed"]);
  } finally {
    if (startupTimer) clearTimeout(startupTimer);
    startup.resolve(); release.resolve(); run?.interactionGate.end();
    try { await run?.session.abort?.(); } finally { await h.close(); }
  }
});

test("重建同端点会话/改变模型后重新尝试保存档位", async () => {
  const h = await harness(c => c.body["thinking"] ? { json: unsupported } : {}, { effort: "high" });
  try {
    const first = await h.open(); await first.prompt("first"); await first.session.dispose();
    const second = await h.open(); await second.prompt("rebuilt"); await second.session.dispose();
    const third = await h.open("changed-model"); await third.prompt("changed model");
    assert.deepEqual(thinking(h.captures), [true, false, true, false, true, false]);
    assert.equal(h.native.thinkingLevel, "high");
    assert.equal(h.captures[4]!.body["model"], "changed-model");
  } finally { await h.close(); }
});

test("明确文本拒绝格式与结构化 thinking 子参数白名单", () => {
  for (const message of ["thinking: unsupported parameter for this model", "thinking is not supported", "Unsupported parameter: 'thinking'", "thinking.budget_tokens: unsupported value"]) {
    assert.equal(isThinkingParameterRejection(400, { error: { type: "invalid_request_error", message } }), true, message);
  }
  assert.equal(isThinkingParameterRejection(422, { error: { code: "unsupported_value", param: "thinking.budget_tokens" } }), true);
  assert.equal(isThinkingParameterRejection(400, { error: { message: "budget_tokens must be >= 1024" } }), false);
});

test("无结构化 JSON 时仅明确 thinking 文本拒绝触发兼容", async () => {
  const h = await harness(c => c.body["thinking"] ? { text: "Unsupported parameter: 'thinking'" } : {}, { effort: "high" });
  try {
    const run = await h.open(); await run.prompt("text rejection");
    assert.deepEqual(thinking(h.captures), [true, false]);
    assert.deepEqual(outcomes(run.events), ["completed"]);
  } finally { await h.close(); }
});
