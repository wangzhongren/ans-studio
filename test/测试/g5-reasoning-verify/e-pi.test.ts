// test/测试/g5-reasoning-verify/e-pi.test.ts —— E 域：Pi 适配器接线（独立验证）。
//
// 验证对象：`src/common/pi-adapter/{real-adapter,lifecycle}.ts`——off 前置修复（克隆模型 thinkingLevelMap.off
// 收窄；假关闭消除）、未设＝零调用（逐字现状路径）、R1 请求前修复（自证网关三窗放行；未设路径逐字现状）、
// 思考捕获（事实进事件面、text 行零改动）、降级（终态前消费、settled 单点、恰一次不二次）。
// 全离线：127.0.0.1 loopback 假网关（零外网）；用例独立构造（429 排除窗/中断守卫/三窗/自证网关均为
// 实施方用例未覆盖类别）。

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExplicitRuntime,
  createRealPiRuntimeAdapter,
  extractReasoningFacts,
  makeRolePrompt,
  REASONING_DEGRADED_SUMMARY,
  type ReasoningDegradeOptions,
  type PromptCapableSession,
} from "../../../src/common/pi-adapter/real-adapter.ts";
import { createTurnLifecycle } from "../../../src/common/pi-adapter/lifecycle.ts";
import { createInteractionGate } from "../../../src/common/pi-adapter/timeout.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../../src/common/shared/diagnostics.ts";
import type { ReasoningEffortV1, SessionEvent } from "../../../src/model/runtime.ts";
import { makeRole } from "./helpers.ts";

if (!process.env.ANTHROPIC_AUTH_TOKEN) process.env.ANTHROPIC_AUTH_TOKEN = "g5-verify-placeholder";
const MODEL_ID = "g5-verify-model";

const silentLogger = { stage() {}, trace() {}, traceEnabled: false };

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

// —————————————————————— loopback 假网关（自建） ——————————————————————

interface Capture { body: Record<string, unknown>; headers: Record<string, string>; }
interface Loopback { baseUrl: string; captures: Capture[]; close(): Promise<void>; }

async function startLoopback(respond: (body: Record<string, unknown>, index: number) => { status: number; sse?: unknown[]; json?: unknown; headers?: Record<string, string> }): Promise<Loopback> {
  const captures: Capture[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { /* 非 JSON 面由网关自判 */ }
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value ?? "");
      captures.push({ body, headers });
      const response = respond(body, captures.length - 1);
      if (response.sse !== undefined) {
        res.writeHead(response.status, { "content-type": "text/event-stream", ...(response.headers ?? {}) });
        res.end(response.sse.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json", ...(response.headers ?? {}) });
      res.end(JSON.stringify(response.json ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}/`, captures, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const messageStart = (): unknown => ({ type: "message_start", message: { id: "msg-g5", type: "message", role: "assistant", model: MODEL_ID, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } });
const textBlock = (index: number, text: string): unknown[] => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index },
];
const thinkingBlock = (index: number, thinking: string): unknown[] => [
  { type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking } },
  { type: "content_block_stop", index },
];
const redactedBlock = (index: number, data: string): unknown[] => [
  { type: "content_block_start", index, content_block: { type: "redacted_thinking", data } },
  { type: "content_block_stop", index },
];
const messageDelta = (): unknown => ({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });
const messageStop = (): unknown => ({ type: "message_stop" });
const plainRoundTrip = (text: string): unknown[] => [messageStart(), ...textBlock(0, text), messageDelta(), messageStop()];
const thinkingOf = (capture: Capture): { type?: string; budget_tokens?: number } | undefined => capture.body["thinking"] as never;
const betaOf = (capture: Capture): string => capture.headers["anthropic-beta"] ?? "";

/** 严格自证网关：enabled 组合非法 ⇒ 400（并自记响应码）；合法（含 disabled/absent）⇒ 200。 */
function strictGateway(register: number[]) {
  return (body: Record<string, unknown>) => {
    const thinking = body["thinking"] as Record<string, unknown> | undefined;
    const maxTokens = body["max_tokens"] as number;
    if (thinking !== undefined && thinking["type"] === "enabled") {
      const budget = thinking["budget_tokens"];
      if (!(typeof budget === "number" && budget >= 1024 && budget < maxTokens)) {
        register.push(400);
        return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: `budget_tokens(${String(budget)}) must be >=1024 and < max_tokens(${String(maxTokens)})` } } };
      }
    }
    register.push(200);
    return { status: 200, sse: plainRoundTrip("gw-ok") };
  };
}

// —————————————————————— 会话夹具（捕获 native/扩展/档位调用） ——————————————————————

const projectRoots: string[] = [];
function tempProject(): string { const root = mkdtempSync(join(tmpdir(), "g5-e-")); projectRoots.push(root); return root; }

async function harness() {
  const pi = await import("@earendil-works/pi-coding-agent");
  let native: { thinkingLevel?: string; setThinkingLevel(level: string): void } | undefined;
  const setThinkingCalls: string[] = [];
  let extensionPaths: string[] = [];
  const dependencies = {
    loadPi: async () => ({
      ...pi,
      async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
        const out = await pi.createAgentSession(input);
        native = out.session as never;
        extensionPaths = (out.extensionsResult?.extensions ?? []).map((x) => String(x.path));
        const original = out.session.setThinkingLevel.bind(out.session);
        (out.session as { setThinkingLevel(level: string): void }).setThinkingLevel = (level: string) => { setThinkingCalls.push(level); original(level as never); };
        return out;
      },
    } as typeof pi),
  };
  return { dependencies, get native() { return native!; }, setThinkingCalls, get extensionPaths() { return extensionPaths; } };
}

function adapterOptions(loopback: Loopback, projectRoot: string, extra: Record<string, unknown> = {}) {
  return {
    runtime: "pi", projectRoot, skillRoot: projectRoot, tools: [],
    interactionGate: createInteractionGate(), currentTurnId: () => undefined,
    config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" },
    logger: silentLogger, promptTimeoutMs: 30000, constructTimeoutMs: 60000,
    ...extra,
  } as never;
}

async function drain(session: { dispose(): Promise<void>; events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

async function withDiagnostics<T>(run: (rows: () => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "g5-e-diag-"));
  configureDiagnostics({ directory: dir });
  try {
    return await run(async () => {
      await flushDiagnostics();
      return readdirSync(dir).filter((name) => name.endsWith(".jsonl")).flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>));
    });
  } finally { await disposeDiagnostics(); rmSync(dir, { recursive: true, force: true }); }
}

test.after(() => { for (const root of projectRoots) rmSync(root, { recursive: true, force: true }); });

// —————————————————————— ① off 前置修复（单元） ——————————————————————

test("E1 off 前置修复：克隆模型 thinkingLevelMap.off 由 null 收窄为 undefined（clamp 真返回 off）；修复前对照＝minimal 假关闭；xhigh 原样", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  const ai = await import("@earendil-works/pi-ai");
  const { model } = await buildExplicitRuntime({ providerId: "ans-gateway", baseUrl: "http://127.0.0.1:9/", modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" });
  assert.equal(model.thinkingLevelMap?.off, undefined, "收窄后 off 不再是 null（undefined＝该档可用）");
  assert.equal(model.thinkingLevelMap?.xhigh, "xhigh", "xhigh 映射原样保留（只动 off）");
  assert.equal(ai.clampThinkingLevel(model as never, "off"), "off", "修复后 off 直达（真关闭）");
  // 修复前对照：手工把 off 复原为 null（模板原形）——clamp 钳到 minimal＝假关闭（该行为已被修复消除）。
  const legacyModel = { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, off: null } };
  assert.equal(ai.clampThinkingLevel(legacyModel as never, "off"), "minimal", "修复前对照：off 被钳到 minimal（假关闭实锤）");
  assert.deepEqual(model.thinkingLevelMap, { ...model.thinkingLevelMap, off: undefined }, "除 off 外逐键原样");
});

// —————————————————————— ② 请求接线：未设零调用 / 显式五档 / off 真关闭 ——————————————————————

test("E2 请求接线：未设＝不调用 setThinkingLevel（medium 隐式原样）；显式档⇒恰一次调用且生效；off⇒wire disabled＋interleaved 头消失", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  const cells: Array<{ effort?: ReasoningEffortV1; calls: string[]; effective: string; wireType: string; budget?: number; beta: boolean }> = [
    { effort: undefined, calls: [], effective: "medium", wireType: "enabled", budget: 8192, beta: true },
    { effort: "medium", calls: ["medium"], effective: "medium", wireType: "enabled", budget: 8192, beta: true },
    { effort: "low", calls: ["low"], effective: "low", wireType: "enabled", budget: 2048, beta: true },
    { effort: "high", calls: ["high"], effective: "high", wireType: "enabled", budget: 16384, beta: true },
    { effort: "xhigh", calls: ["xhigh"], effective: "xhigh", wireType: "enabled", budget: 16384, beta: true },
    { effort: "off", calls: ["off"], effective: "off", wireType: "disabled", beta: false },
  ];
  for (const cell of cells) {
    const root = tempProject();
    const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("ok") }));
    const sdk = await harness();
    try {
      const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, cell.effort !== undefined ? { reasoningEffort: cell.effort } : {}), sdk.dependencies as never).bindRole(makeRole("R-E"));
      try {
        await session.prompt(`cell-${String(cell.effort)}`);
        assert.deepEqual(sdk.setThinkingCalls, cell.calls, `setThinkingLevel 调用（${String(cell.effort)}）`);
        assert.equal(sdk.native.thinkingLevel, cell.effective, `生效档位（${String(cell.effort)}）`);
        const capture = loopback.captures.at(-1)!;
        assert.equal(thinkingOf(capture)?.type, cell.wireType, `wire thinking.type（${String(cell.effort)}）`);
        if (cell.budget !== undefined) assert.equal(thinkingOf(capture)?.budget_tokens, cell.budget, `budget（${String(cell.effort)}）`);
        assert.equal(betaOf(capture).includes("interleaved-thinking"), cell.beta, `interleaved beta 头（${String(cell.effort)}）`);
        if (cell.effort === undefined) assert.deepEqual(sdk.extensionPaths, ["<inline:ans-governance>"], "未设 ⇒ 零 ans-reasoning 装配（逐字现状）");
        else assert.ok(sdk.extensionPaths.includes("<inline:ans-reasoning>"), "设档 ⇒ ans-reasoning 装配");
      } finally { await drain(session); }
    } finally { await loopback.close(); }
  }
});

// —————————————————————— ③ R1 请求前修复（自证网关三窗）＋未设路径逐字现状 ——————————————————————

test("E3 R1 修复（自证网关）：两修复窗（cw=5000 转 disabled / 5700 钳入合法区间）＋第三窗（9000：SDK 自合法或修复后合法）全部放行；修复诊断如实", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  await withDiagnostics(async (rows) => {
    for (const [cw, expected] of [[5000, "thinking-disabled"], [5700, "budget-clamped"], [9000, "any-legal"]] as Array<[number, string]>) {
      const register: number[] = [];
      const loopback = await startLoopback(strictGateway(register));
      const sdk = await harness();
      const root = tempProject();
      try {
        const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, { reasoningEffort: "high", config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: cw, contextWindowSource: "explicit" } }), sdk.dependencies as never).bindRole(makeRole("R-E"));
        let events: SessionEvent[] = [];
        try { await session.prompt(`r1-${cw}`); } finally { events = await drain(session); }
        assert.deepEqual(register, [200], `cw=${cw}：自证网关全程放行（非法组合必被 400）`);
        assert.equal((events.at(-1)!.detail as { outcome?: string }).outcome, "completed", `cw=${cw} 完成`);
        const capture = loopback.captures.at(-1)!;
        const maxTokens = capture.body["max_tokens"] as number;
        const thinking = thinkingOf(capture);
        if (expected === "thinking-disabled") {
          assert.equal(thinking?.type, "disabled", `cw=${cw}：无合法 enabled 组合 ⇒ 转 disabled（真关闭而非非法组合）`);
        } else {
          assert.equal(thinking?.type, "enabled", `cw=${cw}：enabled 保留`);
          const budget = thinking!.budget_tokens!;
          assert.ok(typeof budget === "number" && budget >= 1024 && budget < maxTokens, `cw=${cw}：预算∈[1024, max_tokens)（实得 ${String(budget)} / max ${String(maxTokens)}）`);
        }
      } finally { await loopback.close(); }
    }
    const repaired = (await rows()).filter((row) => row["event"] === "reasoning.repaired");
    assert.deepEqual(repaired.map((row) => row["state"]), ["thinking-disabled", "budget-clamped"], "修复诊断逐窗如实（两修复窗恰两条；9000 窗无需修复＝SDK 自合法）");
  });
});

test("E4 未设路径逐字现状（对照）：不注册修复扩展——同一 cw=5000 严格网关下 wire 原样（enabled）、如实失败；零修复诊断", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  await withDiagnostics(async (rows) => {
    const register: number[] = [];
    const loopback = await startLoopback(strictGateway(register));
    const sdk = await harness();
    const root = tempProject();
    try {
      const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, { config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 5000, contextWindowSource: "explicit" } }), sdk.dependencies as never).bindRole(makeRole("R-E"));
      let events: SessionEvent[] = [];
      try { await session.prompt("unset-cw5000"); } catch { /* 现状失败如实上抛 */ }
      events = await drain(session);
      assert.deepEqual(sdk.setThinkingCalls, [], "未设：零档位调用");
      assert.equal(loopback.captures.length, 1, "未设：恰一请求（无降级链、无重发）");
      assert.equal(thinkingOf(loopback.captures[0]!)?.type, "enabled", "未设路径 wire 原样（不修复、不越界——即便隐式组合非法，R1 原风险按注册件处置）");
      assert.ok(register.includes(400), "自证网关对隐式非法组合 400（现状如实）");
      assert.equal((events.at(-1)!.detail as { outcome?: string }).outcome, "failed", "未设失败如实收场（无降级行）");
      assert.equal(events.some((event) => String(event.summary) === REASONING_DEGRADED_SUMMARY), false);
      const repaired = (await rows()).filter((row) => row["event"] === "reasoning.repaired");
      assert.equal(repaired.length, 0, "未设会话零修复（修复只属显式设档会话）");
    } finally { await loopback.close(); }
  });
});

// —————————————————————— ④ 捕获与发射 ——————————————————————

test("E5 捕获：思考正文进事实（raw 形态、时长真实信号）、text 行零改动；thinking 先于 text；redacted⇒omitted；text-only 零推理行", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  const THINK = "G5-思维正文-甲";
  const ANSWER = "G5-正文答案-乙";
  const root = tempProject();
  const loopback = await startLoopback(() => ({ status: 200, sse: [messageStart(), ...thinkingBlock(0, THINK), ...textBlock(1, ANSWER), messageDelta(), messageStop()] }));
  const sdk = await harness();
  try {
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root), sdk.dependencies as never).bindRole(makeRole("R-E"));
    await session.prompt("capture");
    const events = await drain(session);
    const reasoningRows = events.filter((event) => (event.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.equal(reasoningRows.length, 1, "一条消息恰一行思考事实");
    const facts = (reasoningRows[0]!.detail as { version: number; reasoning: { text: unknown; status: string; durationMs?: unknown } });
    assert.equal(facts.version, 1);
    assert.equal(facts.reasoning.text, THINK, "正文逐字（raw 串——未经投影，投影单点在 Service）");
    assert.equal(typeof facts.reasoning.text, "string", "适配器不产出 DisplayTextV1（不预投影）");
    assert.equal(facts.reasoning.status, "complete");
    assert.equal(typeof facts.reasoning.durationMs, "number", "thinking_start/end 真实信号 ⇒ 携带时长");
    assert.equal(reasoningRows[0]!.summary, "已思考");
    const textRows = events.filter((event) => event.kind === "message" && String(event.summary) === ANSWER);
    assert.equal(textRows.length, 1, "正文 text 行照旧（零改动）");
    assert.ok(events.indexOf(reasoningRows[0]!) < events.indexOf(textRows[0]!), "思考行先于正文行");
  } finally { await loopback.close(); }

  // redacted 块 ⇒ omitted 空正文。
  const redactedLoop = await startLoopback(() => ({ status: 200, sse: [messageStart(), ...redactedBlock(0, "ENC"), ...textBlock(1, "after-redacted"), messageDelta(), messageStop()] }));
  const sdk2 = await harness();
  try {
    const session = await createRealPiRuntimeAdapter(adapterOptions(redactedLoop, root), sdk2.dependencies as never).bindRole(makeRole("R-E"));
    await session.prompt("capture-redacted");
    const events = await drain(session);
    const row = events.find((event) => (event.detail as { source?: string } | undefined)?.source === "reasoning")!;
    const facts = (row.detail as { reasoning: { text: string; status: string } }).reasoning;
    assert.equal(facts.status, "omitted");
    assert.equal(facts.text, "");
  } finally { await redactedLoop.close(); }

  // text-only ⇒ 零推理行（不发明）。
  const textLoop = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("only-text") }));
  const sdk3 = await harness();
  try {
    const session = await createRealPiRuntimeAdapter(adapterOptions(textLoop, root), sdk3.dependencies as never).bindRole(makeRole("R-E"));
    await session.prompt("capture-text-only");
    const events = await drain(session);
    assert.equal(events.filter((event) => (event.detail as { source?: string } | undefined)?.source === "reasoning").length, 0, "无 thinking 块 ⇒ 零推理行");
  } finally { await textLoop.close(); }
});

test("E5b extractReasoningFacts 对抗单元：坏形状/非串正文/非对象块/混合 redacted——不抛、如实", () => {
  const msg = (content: unknown): unknown => ({ role: "assistant", content });
  assert.equal(extractReasoningFacts({ role: "assistant", content: "string" } as unknown), undefined, "content 非数组 ⇒ undefined");
  assert.equal(extractReasoningFacts({ role: "assistant", content: null } as unknown), undefined);
  assert.equal(extractReasoningFacts(msg([null, 42, "x"])), undefined, "块非对象 ⇒ 跳过到底");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking" }])), { text: "", status: "complete" }, "缺 thinking 字段 ⇒ 零长 complete（非 omitted）");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: 42 }])), { text: "", status: "complete" }, "非串 thinking ⇒ 零长 complete");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "r1", redacted: true }, { type: "text", text: "t" }, { type: "thinking", thinking: "r2", redacted: true }])), { text: "", status: "omitted" }, "多块全 redacted ⇒ omitted");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "v1" }, { type: "thinking", thinking: "hidden", redacted: true }, { type: "thinking", thinking: "v2" }])), { text: "v1\n\nv2", status: "complete" }, "混合 ⇒ 只拼可读块");
  assert.equal(extractReasoningFacts("assistant" as unknown), undefined, "原始值不抛");
});

// —————————————————————— ⑤ 降级链（终态前消费 / settled 单点 / 恰一次不二次；429 排除；中断守卫） ——————————————————————

test("E6 降级：思考参数 400 ⇒ 恰一次去参数重发成功（通知行在 settled 前；后续轮次零参数）；诊断恰一", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  await withDiagnostics(async (rows) => {
    const loopback = await startLoopback((body) => body["thinking"] !== undefined
      ? { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "thinking: unsupported parameter for this model" } } }
      : { status: 200, sse: plainRoundTrip("degraded-ok") });
    const sdk = await harness();
    const root = tempProject();
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, { reasoningEffort: "high" }), sdk.dependencies as never).bindRole(makeRole("R-E"));
    let events: SessionEvent[] = [];
    try {
      await session.prompt("degrade-1");
      assert.equal(loopback.captures.length, 2, "恰一次重发");
      assert.ok(thinkingOf(loopback.captures[0]!) !== undefined, "首请求带思考参数");
      assert.equal("thinking" in loopback.captures[1]!.body, false, "重发请求已去思考参数（逐字）");
      await session.prompt("degrade-2");
      assert.equal(loopback.captures.length, 3, "次轮单请求");
      assert.equal("thinking" in loopback.captures[2]!.body, false, "后续轮次不再附带");
    } finally {
      events = await drain(session);
      await loopback.close();
    }
    const settled = events.filter((event) => event.kind === "settled");
    assert.equal(settled.length, 2, "settled 单点（每轮恰一——重发不新增终端）");
    assert.deepEqual(settled.map((event) => (event.detail as { outcome?: string }).outcome), ["completed", "completed"]);
    const notices = events.filter((event) => String(event.summary) === REASONING_DEGRADED_SUMMARY);
    assert.equal(notices.length, 1, "如实一行恰一");
    assert.equal((notices[0]!.detail as { source?: string }).source, "reasoning-degrade");
    assert.ok(events.indexOf(notices[0]!) < events.indexOf(settled[0]!), "终态前消费：通知行先于 settled");
    assert.ok(events.some((event) => event.kind === "message" && String(event.summary).includes("degraded-ok")), "重发结果进事件面");
    const degraded = (await rows()).filter((row) => row["event"] === "reasoning.degraded");
    assert.equal(degraded.length, 1, "诊断恰一");
    assert.equal(degraded[0]!["errorCode"], "GATEWAY_REJECTED_HTTP_400");
    assert.equal(degraded[0]!["state"], "retry-once");
  });
});

test("E6b 不二次：带/不带思考均 400 ⇒ 首轮恰 2 请求后如实失败；次轮 1 请求直失败；通知与诊断各一", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  await withDiagnostics(async (rows) => {
    const loopback = await startLoopback(() => ({ status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "upstream invalid" } } }));
    const sdk = await harness();
    const root = tempProject();
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, { reasoningEffort: "low" }), sdk.dependencies as never).bindRole(makeRole("R-E"));
    try {
      await session.prompt("n1");
      await session.prompt("n2");
      assert.equal(loopback.captures.length, 3, "首轮恰 2（原发＋一次重发）、次轮 1（不再重发）");
      assert.deepEqual(loopback.captures.map((capture) => "thinking" in capture.body), [true, false, false]);
      const events = await drain(session);
      assert.deepEqual(events.filter((event) => event.kind === "settled").map((event) => (event.detail as { outcome?: string }).outcome), ["failed", "failed"]);
      assert.equal(events.filter((event) => String(event.summary) === REASONING_DEGRADED_SUMMARY).length, 1, "通知恰一");
    } finally { await loopback.close(); }
    assert.equal((await rows()).filter((row) => row["event"] === "reasoning.degraded").length, 1, "诊断恰一（不二次）");
  });
});

test("E6c 429 排除窗：瞬时态不归拒绝类 ⇒ 零降级（SDK 层重试原样携带思考；ANS 不发去参数重发、无通知、无诊断）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装"); return; }
  await withDiagnostics(async (rows) => {
    const loopback = await startLoopback((body) => body["thinking"] !== undefined
      ? { status: 429, json: { type: "error", error: { type: "rate_limit_error", message: "429 rate limited" } }, headers: { "x-should-retry": "false" } }
      : { status: 200, sse: plainRoundTrip("late-ok") });
    const sdk = await harness();
    const root = tempProject();
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, root, { reasoningEffort: "high" }), sdk.dependencies as never).bindRole(makeRole("R-E"));
    try {
      await session.prompt("rate-limited");
      // SDK 自身对 429 有有限重试（其重试面不透传网关补丁头，此处不拦截）；关键判据＝**每个**请求都照带
      // 思考参数（ANS 零降级重发——去参数重发是本仓行为，SDK 重试不会发生）且无通知行。
      assert.ok(loopback.captures.length >= 1, "有请求发生");
      assert.ok(loopback.captures.every((capture) => "thinking" in capture.body), `ANS 不得发去参数重发（各捕获：${loopback.captures.map((capture) => "thinking" in capture.body).join(",")}）`);
      const events = await drain(session);
      assert.equal(events.filter((event) => String(event.summary) === REASONING_DEGRADED_SUMMARY).length, 0, "无通知行");
      assert.equal((events.at(-1)!.detail as { outcome?: string }).outcome, "failed");
    } finally { await loopback.close(); }
    assert.equal((await rows()).filter((row) => row["event"] === "reasoning.degraded").length, 0, "无降级诊断");
  });
});

test("E6d 中断守卫（stub 接缝）：轮次被显式锁定 ⇒ 即使检测位置位也不重发（终态前不越权）", async () => {
  // 自建 stub：一轮的 prompt 期间把 lifecycle 强制为 aborted（模拟逐字中止），检测位同时置位。
  const calls: string[] = [];
  const events: SessionEvent[] = [];
  const lifecycle = createTurnLifecycle((event) => events.push(event));
  let consumed = 0;
  const session: PromptCapableSession = {
    async prompt(text: string) { calls.push(text); lifecycle.fail("aborted", "ABORTED"); },
    async abort() {},
    dispose() {},
  };
  const degrade: ReasoningDegradeOptions = { consumeRetry: () => { consumed += 1; return true; }, suppress: () => { throw new Error("中断轮不得 suppress"); }, noticeText: REASONING_DEGRADED_SUMMARY };
  const prompt = makeRolePrompt({ session, promptMs: 5000, gate: createInteractionGate(), emit: (event) => events.push(event), log: silentLogger, finishOnReturn: true, lifecycle, reasoningDegrade: degrade });
  await prompt("aborted-mid-turn");
  assert.deepEqual(calls, ["aborted-mid-turn"], "恰一次（被锁定的轮次不重发）");
  assert.equal(consumed, 0, "守卫先行：被锁定 ⇒ 连消费询问都不发生（短路）");
  assert.equal(events.some((event) => String(event.summary) === REASONING_DEGRADED_SUMMARY), false, "零重发通知");
});
