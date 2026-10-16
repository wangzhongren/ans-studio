// scratch 探针驱动：G-5 A5/A6（Pi 侧）——setThinkingLevel 全档 wire 捕获 ＋ R1 定格 ＋ thinking 丢弃复证。
// 归属：Pi适配器角色测试目录。**不是自动化测试**（`test/**/*.test.ts` glob 不选中本文件）；
// 测试文件不得引用本文件（测试角色钉；探针保持独立）。
//
// 纪律（沿 G-3/MCP 探针先例）：**纯本地**——"faux 网关"＝ 127.0.0.1 loopback anthropic-messages 假网关
// （捕获真实 wire 请求体/头；无任何外网出口）；不发真实网关请求。
//
// 用法：`node test/pi-adapter/reasoning-wire.probe.ts [OUTDIR]`
//
// 分项（对应评估 §七 A5/A6、§八 R1）：
//   A5：每档 setThinkingLevel（off/minimal/low/medium/high/xhigh/max）＋未设对照 ⇒ 捕获
//       thinking/budget_tokens/max_tokens/anthropic-beta 头；off→minimal 钳制复证（R6 前置）；
//       极端 contextWindow 边界（两档非法窗）⇒ R1（budget ≥ max_tokens 与 budget < 1024 两种非法形）定格。
//   A6：loopback SSE 送 thinking 块（+redacted 变体）⇒ 复证 extractMessageText 只收 text 丢弃 thinking；
//       并观察 message_update(part 事件) 是否可达（durationMs 真实信号可行性）。

import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";
import { makeRole } from "./fixtures.ts";

if (!process.env.ANTHROPIC_AUTH_TOKEN) process.env.ANTHROPIC_AUTH_TOKEN = "reasoning-wire-probe-placeholder";

const OUTDIR = process.argv[2] !== undefined && process.argv[2] !== "" ? process.argv[2] : undefined;
const result: Record<string, unknown> = {};
const silentLogger = { stage() {}, trace() {}, traceEnabled: false };

// —————————————————————— loopback 假网关（捕获请求体/头） ——————————————————————

interface Capture { body: Record<string, unknown>; headers: Record<string, string>; }
interface Loopback { baseUrl: string; captures: Capture[]; close(): Promise<void>; }

async function startLoopback(sseFor: (body: Record<string, unknown>, index: number) => unknown[]): Promise<Loopback> {
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
      const sse = sseFor(body, captures.length - 1);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}/`, captures, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const messageStart = (): unknown => ({ type: "message_start", message: { id: "msg_rw", type: "message", role: "assistant", model: "probe-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
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
const messageDelta = (): unknown => ({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });
const messageStop = (): unknown => ({ type: "message_stop" });
const plainRoundTrip = (text: string): unknown[] => [messageStart(), ...textBlock(0, text), messageDelta(), messageStop()];

/** 每支 A5 请求体的定型摘要（只取形状字段；无正文敏感面）。 */
function wireSummary(capture: Capture): Record<string, unknown> {
  const thinking = capture.body["thinking"] as Record<string, unknown> | undefined;
  return {
    thinking: thinking === undefined ? "（无 thinking 字段）" : { type: thinking["type"], budget_tokens: thinking["budget_tokens"], display: thinking["display"] },
    max_tokens: capture.body["max_tokens"],
    anthropicBeta: capture.headers["anthropic-beta"] ?? null,
    stream: capture.body["stream"],
  };
}

// —————————————————————— A5：全档 wire 捕获 ＋ R1 边界 ——————————————————————

async function sectionA5(): Promise<void> {
  console.log("\n[probe] ===== A5. setThinkingLevel 全档 wire 捕获 ＋ R1 边界 =====");
  const a5: Record<string, unknown> = {};
  result["a5"] = a5;

  // —— 主组：大 contextWindow，逐档捕获（含未设对照） ——
  {
    const loopback = await startLoopback(() => plainRoundTrip("a5"));
    const pi = await import("@earendil-works/pi-coding-agent");
    let native!: { setThinkingLevel: (level: string) => void; thinkingLevel: string };
    const dependencies = {
      loadPi: async () => ({ ...pi, async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) { const out = await pi.createAgentSession(input); native = out.session as never; return out; } } as typeof pi),
    };
    try {
      const session = await createRealPiRuntimeAdapter({
        runtime: "pi", projectRoot: process.cwd(), skillRoot: process.cwd(), tools: [],
        interactionGate: createInteractionGate(), currentTurnId: () => undefined,
        config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: "probe-model", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" },
        logger: silentLogger, promptTimeoutMs: 30000, constructTimeoutMs: 60000,
      } as never, dependencies as never).bindRole(makeRole());
      try {
        // 未设对照（现状：medium 隐式）。
        await session.prompt("control-unset");
        a5["unset(capture)"] = wireSummary(loopback.captures.at(-1)!);
        a5["unset.thinkingLevel"] = (native as never as { thinkingLevel: string }).thinkingLevel;

        const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
        for (const level of levels) {
          native.setThinkingLevel(level);
          await session.prompt(`level-${level}`);
          const effective = (native as never as { thinkingLevel: string }).thinkingLevel;
          a5[level] = { requested: level, effective, wire: wireSummary(loopback.captures.at(-1)!) };
          console.log(`[probe] A5 ${level}: 生效=${effective} ⇒ ${JSON.stringify(a5[level])}`);
        }
      } finally {
        await session.dispose();
      }
    } finally {
      await loopback.close();
    }
  }

  // —— R1 边界组：极端 contextWindow（两档非法窗） ——
  const boundary: Record<string, unknown> = {};
  a5["r1-boundary"] = boundary;
  for (const [label, contextWindow] of [["cw-5000", 5000], ["cw-5700", 5700], ["cw-6200", 6200]] as [string, number][]) {
    const loopback = await startLoopback(() => plainRoundTrip("r1"));
    const pi = await import("@earendil-works/pi-coding-agent");
    let native!: { setThinkingLevel: (level: string) => void };
    const dependencies = {
      loadPi: async () => ({ ...pi, async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) { const out = await pi.createAgentSession(input); native = out.session as never; return out; } } as typeof pi),
    };
    try {
      const session = await createRealPiRuntimeAdapter({
        runtime: "pi", projectRoot: process.cwd(), skillRoot: process.cwd(), tools: [],
        interactionGate: createInteractionGate(), currentTurnId: () => undefined,
        config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: "probe-model", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow, contextWindowSource: "explicit" },
        logger: silentLogger, promptTimeoutMs: 30000, constructTimeoutMs: 60000,
      } as never, dependencies as never).bindRole(makeRole());
      try {
        native.setThinkingLevel("high");
        await session.prompt(`r1-${label}`);
        const summary = wireSummary(loopback.captures.at(-1)!);
        const thinking = summary["thinking"] as { type?: string; budget_tokens?: number } | string;
        const maxTokens = summary["max_tokens"] as number;
        let verdict = "n/a";
        if (typeof thinking === "object" && thinking["type"] === "enabled") {
          const budget = thinking["budget_tokens"] as number;
          if (budget >= maxTokens) verdict = "非法：budget ≥ max_tokens";
          else if (budget < 1024) verdict = "非法：budget < 1024（API 下限）";
          else verdict = "合法";
        }
        boundary[label] = { contextWindow, wire: summary, verdict };
        console.log(`[probe] A5 R1 ${label}: max_tokens=${maxTokens} budget=${JSON.stringify(thinking)} ⇒ ${verdict}`);
      } finally {
        await session.dispose();
      }
    } finally {
      await loopback.close();
    }
  }
}

// —————————————————————— A6：thinking 丢弃复证 ＋ part 事件可达性 ——————————————————————

async function sectionA6(): Promise<void> {
  console.log("\n[probe] ===== A6. extractMessageText 丢弃 thinking 复证 ＋ message_update 可达性 =====");
  const a6: Record<string, unknown> = {};
  result["a6"] = a6;
  const THOUGHT = "PROBE-THOUGHT-SECRET-42";
  const ANSWER = "PROBE-ANSWER-TEXT";

  const loopback = await startLoopback(() => [
    messageStart(),
    ...thinkingBlock(0, THOUGHT),
    ...textBlock(1, ANSWER),
    messageDelta(),
    messageStop(),
  ]);
  const pi = await import("@earendil-works/pi-coding-agent");
  let native!: { subscribe: (fn: (event: { type: string; assistantMessageEvent?: { type?: string } }) => void) => () => void };
  const dependencies = {
    loadPi: async () => ({ ...pi, async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) { const out = await pi.createAgentSession(input); native = out.session as never; return out; } } as typeof pi),
  };
  try {
    const session = await createRealPiRuntimeAdapter({
      runtime: "pi", projectRoot: process.cwd(), skillRoot: process.cwd(), tools: [],
      interactionGate: createInteractionGate(), currentTurnId: () => undefined,
      config: { providerId: "ans-gateway", baseUrl: loopback.baseUrl, modelId: "probe-model", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" },
      logger: silentLogger, promptTimeoutMs: 30000, constructTimeoutMs: 60000,
    } as never, dependencies as never).bindRole(makeRole());

    const rawEventTypes: Record<string, number> = {};
    const partEventTypes: Record<string, number> = {};
    const unsub = native.subscribe((event) => {
      rawEventTypes[event.type] = (rawEventTypes[event.type] ?? 0) + 1;
      const part = event.assistantMessageEvent;
      if (part !== undefined && typeof part.type === "string") partEventTypes[part.type] = (partEventTypes[part.type] ?? 0) + 1;
    });
    try {
      await session.prompt("a6");
    } finally {
      const events = await drain(session);
      unsub();
      const summaries = events.map((e) => String(e.summary ?? ""));
      a6["roleEvents"] = events.map((e) => ({ kind: e.kind, summary: e.summary, detailSource: (e.detail as { source?: string } | undefined)?.source }));
      a6["thoughtInEvents"] = summaries.some((s) => s.includes(THOUGHT));
      a6["answerInEvents"] = summaries.some((s) => s.includes(ANSWER));
      a6["nativeRawEventTypes"] = rawEventTypes;
      a6["assistantPartEventTypes"] = partEventTypes;
      console.log("[probe] A6 role 事件:", JSON.stringify(a6["roleEvents"]));
      console.log("[probe] A6 思考正文是否出现在事件面:", a6["thoughtInEvents"], "；正文文本行在场:", a6["answerInEvents"]);
      console.log("[probe] A6 原生事件类型计数:", JSON.stringify(rawEventTypes));
      console.log("[probe] A6 part 事件计数（message_update.assistantMessageEvent）:", JSON.stringify(partEventTypes));
    }
  } finally {
    await loopback.close();
  }
}

async function drain(session: { dispose(): Promise<void>; events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

// —————————————————————— A7：网关 400（思考参数）后的行为（降级链设计前的事实） ——————————————————————

async function sectionA7(): Promise<void> {
  console.log("\n[probe] ===== A7. 网关因思考参数 400 后的行为（恰一次重发设计前置） =====");
  const a7: Record<string, unknown> = {};
  result["a7"] = a7;
  // 专用假网关：含 thinking ⇒ 400（JSON 错误体）；否则 200 SSE。
  const captures: { hasThinking: boolean }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { body = {}; }
      const hasThinking = body["thinking"] !== undefined;
      captures.push({ hasThinking });
      if (hasThinking) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "thinking: unsupported parameter for this model" } }));
        return;
      }
      const sse = plainRoundTrip("a7-ok");
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    const pi = await import("@earendil-works/pi-coding-agent");
    const dependencies = { loadPi: async () => pi as typeof pi };
    const session = await createRealPiRuntimeAdapter({
      runtime: "pi", projectRoot: process.cwd(), skillRoot: process.cwd(), tools: [],
      interactionGate: createInteractionGate(), currentTurnId: () => undefined,
      config: { providerId: "ans-gateway", baseUrl, modelId: "probe-model", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN", contextWindow: 131072, contextWindowSource: "explicit" },
      logger: silentLogger, promptTimeoutMs: 30000, constructTimeoutMs: 60000,
    } as never, dependencies as never).bindRole(makeRole());
    let promptOutcome = "resolved";
    try {
      await session.prompt("a7-p1");
    } catch (error) {
      promptOutcome = `rejected: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`;
    } finally {
      const events = await drain(session);
      a7["promptOutcome"] = promptOutcome;
      a7["requestCount"] = captures.length;
      a7["requestHasThinking"] = captures.map((c) => c.hasThinking);
      a7["events"] = events.map((e) => ({ kind: e.kind, summary: String(e.summary).slice(0, 160), outcome: (e.detail as { outcome?: string } | undefined)?.outcome }));
      console.log("[probe] A7 prompt 结果:", promptOutcome);
      console.log("[probe] A7 请求数:", captures.length, "（含 thinking）:", JSON.stringify(captures.map((c) => c.hasThinking)));
      console.log("[probe] A7 事件面:", JSON.stringify(a7["events"]));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main(): Promise<void> {
  console.log("[probe] G-5 A5/A6（纯本地 loopback；无外网出口）");
  await sectionA5();
  await sectionA6();
  await sectionA7();
  console.log("\n[probe] PROBE_RESULT " + JSON.stringify(result, null, 2));
  if (OUTDIR !== undefined) {
    mkdirSync(OUTDIR, { recursive: true });
    writeFileSync(join(OUTDIR, "reasoning-wire-result.json"), JSON.stringify(result, null, 2));
  }
}

await main();
