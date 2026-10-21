// D1：推理档位、恢复默认、off 前置修复、思考事实与默认/显式预算保护。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（内部动态 import；未安装则跳过）。
//
// 依据：客户 2026-10-16 批准 G-5；契约＝`src/model/runtime.ts`（ReasoningEffortV1／reasoningEffort／
// RuntimeReasoningFactsV1／RuntimeReasoningEventDetailV1）；探针定格＝`docs/fix/2026-10-16_probe_reasoning-wire.md`
// （A5 全档 wire＋R1 实锤／A6 丢弃复证＋part 事件可达／A7 400⇒恰 1 请求、prompt resolve、failed 终态）。
// 全离线：127.0.0.1 loopback anthropic-messages 假网关（请求体/头捕获；**零外网**）。
//
// D1：未设显式恢复同 SDK 新会话默认；off/low/medium/high 对应档；
// xhigh ⇒ "xhigh"（预算钳到 high=16384，档位语义保留）；off 前置＝克隆模型 thinkingLevelMap.off null→undefined。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildExplicitRuntime,
  createRealPiRuntimeAdapter,
  extractReasoningFacts,
  PI_1_1_0_DEFAULT_THINKING_LEVEL,
  REASONING_SUMMARY,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { createToolDisplayContext } from "../../src/common/runtime-core/tool-display.ts";
import type { ReasoningEffortV1, SessionEvent } from "../../src/model/runtime.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { makeRole } from "./fixtures.ts";

if (!process.env.ANTHROPIC_AUTH_TOKEN) process.env.ANTHROPIC_AUTH_TOKEN = "reasoning-test-placeholder-token";
const MODEL_ID = "reasoning-model-x";

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

const silentLogger = { stage() {}, trace() {}, traceEnabled: false };

// —————————————————————— loopback 假网关 ——————————————————————

interface Capture { body: Record<string, unknown>; headers: Record<string, string>; }
interface Loopback { baseUrl: string; captures: Capture[]; close(): Promise<void>; }

async function startLoopback(respond: (body: Record<string, unknown>, index: number) => { status: number; sse?: unknown[]; json?: unknown }): Promise<Loopback> {
  const captures: Capture[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { body = {}; }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : String(v ?? "");
      captures.push({ body, headers });
      const response = respond(body, captures.length - 1);
      if (response.sse !== undefined) {
        res.writeHead(response.status, { "content-type": "text/event-stream" });
        res.end(response.sse.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(JSON.stringify(response.json ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}/`, captures, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const messageStart = (): unknown => ({ type: "message_start", message: { id: "msg_r", type: "message", role: "assistant", model: MODEL_ID, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
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

// —————————————————————— 会话构造（捕获 native + extensionsResult） ——————————————————————

async function harness(settings: Record<string, unknown> = {}) {
  const pi = await import("@earendil-works/pi-coding-agent");
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  let constructed!: Parameters<typeof pi.createAgentSession>[0];
  let extensionsResult: Awaited<ReturnType<typeof pi.createAgentSession>>["extensionsResult"] | undefined;
  const dependencies = {
    loadPi: async () => ({
      ...pi,
      SettingsManager: { ...pi.SettingsManager, inMemory: (input: Parameters<typeof pi.SettingsManager.inMemory>[0]) => pi.SettingsManager.inMemory({ ...input, ...settings }) },
      async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
        constructed = input;
        const out = await pi.createAgentSession(input);
        native = out.session;
        extensionsResult = out.extensionsResult;
        return out;
      },
    } as typeof pi),
  };
  return {
    dependencies,
    get constructed() { return constructed; },
    get native() { return native!; },
    get extensionPaths() { return (extensionsResult?.extensions ?? []).map((x) => String(x.path)); },
  };
}

function adapterOptions(loopback: Loopback, extra: Record<string, unknown> = {}) {
  return {
    runtime: "pi",
    projectRoot: process.cwd(),
    skillRoot: process.cwd(),
    tools: [],
    interactionGate: createInteractionGate(),
    currentTurnId: () => undefined,
    config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" },
    logger: silentLogger,
    promptTimeoutMs: 30000,
    constructTimeoutMs: 60000,
    ...extra,
  } as never;
}

async function drain(session: { dispose(): Promise<void>; events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

async function withDiagnostics<T>(run: (readRows: () => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-reasoning-diag-"));
  configureDiagnostics({ directory: dir });
  try {
    return await run(async () => {
      await flushDiagnostics();
      return readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>));
    });
  } finally {
    await disposeDiagnostics();
    rmSync(dir, { recursive: true, force: true });
  }
}

// —————————————————————— ①②请求接线：全档 wire 捕获 ＋ 未设对照 ＋ off 前置 ——————————————————————

test("请求接线：默认 medium 与五档实际预算；默认也装配保护；off 真关闭", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  const cases: { effort?: ReasoningEffortV1; effective: string; wire: { type?: string; budget?: number }; beta: boolean }[] = [
    { effort: undefined, effective: "medium", wire: { type: "enabled", budget: 8192 }, beta: true },
    { effort: "off", effective: "off", wire: { type: "disabled" }, beta: false },
    { effort: "low", effective: "low", wire: { type: "enabled", budget: 2048 }, beta: true },
    { effort: "medium", effective: "medium", wire: { type: "enabled", budget: 8192 }, beta: true },
    { effort: "high", effective: "high", wire: { type: "enabled", budget: 16384 }, beta: true },
    { effort: "xhigh", effective: "xhigh", wire: { type: "enabled", budget: 16384 }, beta: true },
  ];
  for (const cell of cases) {
    const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("ok") }));
    const sdk = await harness();
    try {
      const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, cell.effort !== undefined ? { reasoningEffort: cell.effort } : {}), sdk.dependencies).bindRole(makeRole());
      try {
        await session.prompt(`cell-${String(cell.effort)}`);
        assert.equal(sdk.native.thinkingLevel, cell.effective, `effective（${String(cell.effort)}）`);
        const thinking = thinkingOf(loopback.captures.at(-1)!);
        assert.equal(thinking?.type, cell.wire.type, `wire thinking.type（${String(cell.effort)}）`);
        if (cell.wire.budget !== undefined) assert.equal(thinking?.budget_tokens, cell.wire.budget, `budget（${String(cell.effort)}）`);
        const beta = loopback.captures.at(-1)!.headers["anthropic-beta"] ?? "";
        assert.equal(beta.includes("interleaved-thinking"), cell.beta, `beta 头（${String(cell.effort)}）`);
        assert.ok(sdk.extensionPaths.includes("<inline:ans-reasoning>"), "默认和显式档均装配保护");
      } finally {
        await drain(session);
      }
    } finally {
      await loopback.close();
    }
  }
});

test("off 前置修复单元：克隆模型 thinkingLevelMap.off 收窄为 undefined ⇒ clamp 返回 off；修复前对照=minimal", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  const ai = await import("@earendil-works/pi-ai");
  const { model } = await buildExplicitRuntime({ providerId: "ans-gateway", baseUrl: "http://127.0.0.1:9/", modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" });
  assert.equal(model.thinkingLevelMap?.off, undefined, "克隆已收窄 off（null→undefined）");
  assert.equal(model.thinkingLevelMap?.xhigh, "xhigh", "xhigh 原样保留");
  assert.equal(ai.clampThinkingLevel(model, "off"), "off", "修复后 off 可用（真关闭）");
  const prefixModel = { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, off: null } };
  assert.equal(ai.clampThinkingLevel(prefixModel as never, "off"), "minimal", "修复前对照：off 被钳到 minimal＝假关闭");
});

// —————————————————————— R1：非法组合实锤后的请求前修复 ——————————————————————

/** 自证假网关：思考组合非法 ⇒ 400（并记录）；合法 ⇒ 200。 */
function strictReasoningGateway(): { respond: (body: Record<string, unknown>) => { status: number; sse?: unknown[]; json?: unknown } } {
  return {
    respond: (body) => {
      const thinking = body["thinking"] as Record<string, unknown> | undefined;
      const maxTokens = body["max_tokens"] as number;
      if (thinking !== undefined && thinking["type"] === "enabled") {
        const budget = thinking["budget_tokens"] as number;
        if (!(typeof budget === "number" && budget >= 1024 && budget < maxTokens)) {
          return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: `budget_tokens(${String(budget)}) must be >=1024 and < max_tokens(${String(maxTokens)})` } } };
        }
      }
      return { status: 200, sse: plainRoundTrip("r1-ok") };
    },
  };
}

test("R1 修复：contextWindow 钳到极小 ⇒ 请求前修复为合法组合（自证网关放行；诊断如实）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await withDiagnostics(async (readRows) => {
    for (const effort of [undefined, "high"] as const) for (const [cw, expectedState] of [[5000, "thinking-disabled"], [5700, "budget-clamped"]] as [number, string][]) {
      const gateway = strictReasoningGateway();
      const loopback = await startLoopback((body) => gateway.respond(body));
      const sdk = await harness();
      try {
        const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, { ...(effort ? { reasoningEffort: effort } : {}), config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: MODEL_ID, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: cw, contextWindowSource: "explicit" } }), sdk.dependencies).bindRole(makeRole());
        let events: SessionEvent[] = [];
        try { await session.prompt(`r1-${cw}`); } finally { events = await drain(session); }
        assert.equal(events.filter((e) => e.kind === "settled").length, 1);
        assert.equal((events.at(-1)!.detail as { outcome?: string }).outcome, "completed", `cw=${cw} 修复后应正常完成（若未修复必被自证网关 400）`);
        assert.ok(events.some(e => (e.detail as {source?: string; state?: string})?.source === "system" && (e.detail as {state?: string}).state === expectedState));
        const thinking = thinkingOf(loopback.captures.at(-1)!);
        const maxTokens = loopback.captures.at(-1)!.body["max_tokens"] as number;
        if (expectedState === "thinking-disabled") assert.equal(thinking?.type, "disabled", `cw=${cw} ⇒ 无合法 enabled 组合、改 disabled`);
        else {
          assert.equal(thinking?.type, "enabled");
          const budget = thinking!.budget_tokens!;
          assert.ok(budget >= 1024 && budget < maxTokens, `cw=${cw} ⇒ 预算钳入 [1024, max_tokens)`);
        }
      } finally {
        await loopback.close();
      }
    }
    const repaired = (await readRows()).filter((r) => r["event"] === "reasoning.repaired");
    assert.deepEqual(repaired.map((r) => r["state"]), ["thinking-disabled", "budget-clamped", "thinking-disabled", "budget-clamped"], "修复诊断如实（state 二形）");
  });
});

// —————————————————————— ③捕获与发射 ——————————————————————

test("思考捕获：complete 形态（正文＋真实时长信号）进事件面且过投影单点；redacted ⇒ omitted 空正文", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  const THOUGHT = "PROBE-THOUGHT-正文";
  const ANSWER = "PROBE-ANSWER";
  const loopback = await startLoopback(() => ({ status: 200, sse: [messageStart(), ...thinkingBlock(0, THOUGHT), ...textBlock(1, ANSWER), messageDelta(), messageStop()] }));
  const sdk = await harness();
  try {
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback), sdk.dependencies).bindRole(makeRole());
    await session.prompt("capture");
    const events = await drain(session);
    const reasoningRow = events.find((e) => (e.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.ok(reasoningRow, "思考事实行在场（未设也捕获——G-5 呈现面对 Pi 现状 medium 隐式路径同样生效）");
    assert.equal(reasoningRow!.summary, REASONING_SUMMARY);
    const detail = reasoningRow!.detail as { version?: number; source?: string; reasoning?: { text?: string; status?: string; durationMs?: unknown } };
    assert.equal(detail.version, 1);
    assert.equal(detail.reasoning?.text, THOUGHT, "正文逐字");
    assert.equal(detail.reasoning?.status, "complete");
    assert.equal(typeof detail.reasoning?.durationMs, "number", "真实 part 事件起止 ⇒ 携带时长");
    const projected = createToolDisplayContext().projectReasoningDetail(detail as never, undefined);
    assert.equal(projected.source, "reasoning");
    assert.equal((projected as { reasoning: { text: { text: string }; status: string } }).reasoning.text.text, THOUGHT, "投影单点接受且正文保真");
    assert.equal((projected as { reasoning: { status: string } }).reasoning.status, "complete");
    // 顺序：思考行先于正文行；既有 text 提取行为不变。
    const textRow = events.find((e) => e.kind === "message" && String(e.summary) === ANSWER);
    assert.ok(textRow, "正文文本行照旧");
    assert.ok(events.indexOf(reasoningRow!) < events.indexOf(textRow!));
  } finally {
    await loopback.close();
  }

  const redactedLoop = await startLoopback(() => ({ status: 200, sse: [messageStart(), ...redactedBlock(0, "ENC-DATA"), ...textBlock(1, "after"), messageDelta(), messageStop()] }));
  const sdk2 = await harness();
  try {
    const session = await createRealPiRuntimeAdapter(adapterOptions(redactedLoop), sdk2.dependencies).bindRole(makeRole());
    await session.prompt("capture-redacted");
    const events = await drain(session);
    const reasoningRow = events.find((e) => (e.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.ok(reasoningRow, "redacted 亦有事实行（发生过、如实不假装有正文）");
    const detail = reasoningRow!.detail as { reasoning?: { text?: string; status?: string } };
    assert.equal(detail.reasoning?.status, "omitted");
    assert.equal(detail.reasoning?.text, "", "omitted ⇒ 正文义务为空串");
  } finally {
    await redactedLoop.close();
  }
});

test("extractReasoningFacts 单元：缺失/完整/空正文/redacted 单块与混合", () => {
  const msg = (content: unknown[]): unknown => ({ role: "assistant", content });
  assert.equal(extractReasoningFacts(msg([{ type: "text", text: "t" }])), undefined, "无 thinking ⇒ undefined");
  assert.equal(extractReasoningFacts({ role: "user", content: [{ type: "thinking", thinking: "x" }] } as unknown), undefined, "非助手消息不取");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "a" }])), { text: "a", status: "complete" });
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "" }])), { text: "", status: "complete" }, "零长正文亦 complete");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "[Reasoning redacted]", redacted: true }])), { text: "", status: "omitted" }, "全 redacted ⇒ omitted 空正文");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "a" }, { type: "thinking", thinking: "b" }])), { text: "a\n\nb", status: "complete" }, "多块拼接");
  assert.deepEqual(extractReasoningFacts(msg([{ type: "thinking", thinking: "a" }, { type: "thinking", thinking: "r", redacted: true }])), { text: "a", status: "complete" }, "混合 ⇒ complete 只含可读块");
});


test("high→清空→恢复同一 native 会话：等于真实无历史 SDK 默认，历史保留", async () => {
  const pi = await import("@earendil-works/pi-coding-agent");
  const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("default-ok") }));
  const root = mkdtempSync(join(tmpdir(), "pi-reasoning-default-"));
  const storage = createRuntimeSessionStore({ projectRoot: root, runtime: "pi", roleId: makeRole().id });
  const sdk = await harness();
  const open = (effort?: ReasoningEffortV1) => createRealPiRuntimeAdapter(adapterOptions(loopback, { projectRoot: root, skillRoot: root, storage, ...(effort ? { reasoningEffort: effort } : {}) }), sdk.dependencies).bindRole(makeRole());
  try {
    const first = await open("high");
    const id = first.nativeSessionId;
    await first.prompt("saved high"); await first.dispose();
    const resumed = await open();
    try {
      assert.equal(resumed.nativeSessionId, id);
      assert.equal(resumed.contextSource, "resumed");
      assert.ok(sdk.native.messages.some(m => m.role === "user" && JSON.stringify(m).includes("saved high")));
      // 独立 SDK 构造：不传 thinkingLevel，也不调用 ANS 档位选择/setThinkingLevel。
      const control = await pi.createAgentSession({ ...sdk.constructed, sessionManager: pi.SessionManager.inMemory(root) });
      try {
        assert.equal(control.session.thinkingLevel, PI_1_1_0_DEFAULT_THINKING_LEVEL, "SDK 默认变更必须同步版本绑定常量");
        assert.equal(sdk.native.thinkingLevel, control.session.thinkingLevel);
      } finally { control.session.dispose(); }
      await resumed.prompt("after clearing");
      assert.deepEqual(loopback.captures.map(c => thinkingOf(c)?.budget_tokens), [16384, 8192]);
    } finally { await resumed.dispose(); }
  } finally { await loopback.close(); rmSync(root, { recursive: true, force: true }); }
});

test("默认优先级：显式 > SDK 模型设置 > SDK 全局设置 > 版本默认", async () => {
  const cells = [
    { settings: { defaultThinkingLevel: "low", modelThinkingLevels: { [`ans-gateway/${MODEL_ID}`]: "high" } }, effort: "off", expected: "off" },
    { settings: { defaultThinkingLevel: "low", modelThinkingLevels: { [`ans-gateway/${MODEL_ID}`]: "high" } }, expected: "high" },
    { settings: { defaultThinkingLevel: "low" }, expected: "low" },
    { settings: {}, expected: "medium" },
  ];
  for (const cell of cells) {
    const sdk = await harness(cell.settings);
    const loopback = await startLoopback(() => ({ status: 200, sse: plainRoundTrip("settings-ok") }));
    const session = await createRealPiRuntimeAdapter(adapterOptions(loopback, cell.effort ? { reasoningEffort: cell.effort } : {}), sdk.dependencies).bindRole(makeRole());
    try { assert.equal(sdk.native.thinkingLevel, cell.expected); await session.prompt("settings"); }
    finally { await session.dispose(); await loopback.close(); }
  }
});
