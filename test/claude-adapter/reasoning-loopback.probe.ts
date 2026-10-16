// G-5 wave 2 A-group probe (Claude): freeze how Options.thinking / Options.effort translate onto the
// wire, and how the bundled CLI reacts to a gateway 400 that rejects those parameters. Real bundled
// CLI, HTTP restricted to 127.0.0.1, fake credentials, mixed SSE content blocks (thinking +
// redacted_thinking + text). No real gateway requests.
// Run separately: node test/claude-adapter/reasoning-loopback.probe.ts.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as SDK from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";

const FAKE_KEY = "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL";
const root = await mkdtemp(join(tmpdir(), "ans-claude-reasoning-loopback-"));

type PhaseConfig = { name: string; thinking?: SDK.Options["thinking"]; effort?: SDK.Options["effort"]; model?: string; reject?: "thinking" | "effort"; emptyThinking?: boolean; timeoutMs?: number };
const phases: PhaseConfig[] = [
  { name: "control-unset" },
  { name: "thinking-disabled", thinking: { type: "disabled" } },
  { name: "thinking-enabled-budget", thinking: { type: "enabled", budgetTokens: 8000 } },
  { name: "thinking-enabled-budget-sonnet", thinking: { type: "enabled", budgetTokens: 8000 }, model: "claude-sonnet-4-6" },
  { name: "thinking-adaptive", thinking: { type: "adaptive" } },
  { name: "thinking-adaptive-display-omitted", thinking: { type: "adaptive", display: "omitted" } },
  { name: "effort-low", effort: "low" },
  { name: "effort-medium", effort: "medium" },
  { name: "effort-high", effort: "high" },
  { name: "effort-xhigh", effort: "xhigh" },
  { name: "effort-xhigh-sonnet", effort: "xhigh", model: "claude-sonnet-4-6" },
  { name: "capture-empty-thinking", emptyThinking: true },
  { name: "reject-thinking-400", thinking: { type: "enabled", budgetTokens: 8000 }, reject: "thinking", timeoutMs: 30000 },
  { name: "reject-effort-400", effort: "high", reject: "effort", timeoutMs: 30000 },
];

let phase = "boot";
let endpoint = "";
let rejectMode: "none" | "thinking" | "effort" = "none";
let rejections = 0;
let gatewayIndex = 0;
let gatewayFailure: unknown;
const requests: Array<Record<string, unknown>> = [];
const sse = (res: import("node:http").ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const limit = setTimeout(() => { gatewayFailure = new Error("reasoning loopback probe exceeded 180s"); server.closeAllConnections(); server.close(); }, 180000);
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, "127.0.0.1");
    assert.equal(req.headers["x-api-key"], FAKE_KEY);
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (req.url?.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ input_tokens: 100 })); return; }
    if (!req.url?.startsWith("/v1/messages")) { res.writeHead(404); res.end(); return; }
    const index = gatewayIndex++;
    requests.push({
      phase, index, arrivedAt: Date.now(),
      thinking: body.thinking ?? null,
      outputConfig: body.output_config ?? null,
      effortFlat: body.effort ?? null,
      maxTokens: body.max_tokens ?? null,
      bodyKeys: Object.keys(body).sort(),
      beta: typeof req.headers["anthropic-beta"] === "string" ? req.headers["anthropic-beta"] : null,
      model: body.model ?? null,
    });
    // Wall-clock release valve: never let a 400 loop run away (bounded diagnostics, not a fixture hang).
    const rejectThisCall = (rejectMode === "thinking" && body.thinking !== undefined)
      || (rejectMode === "effort" && ((body.output_config as { effort?: unknown } | null)?.effort !== undefined || body.effort !== undefined));
    if (rejectThisCall && rejections < 5) {
      rejections++;
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: `fixture gateway rejects ${rejectMode === "thinking" ? "thinking" : "effort"} on this endpoint` } }));
      return;
    }
    const id = `msg_reasoning_loopback_${requests.length}`;
    const model = String(body.model ?? "claude-sonnet-4-6");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    // Mixed blocks: one signed thinking block, one redacted_thinking block, then text.
    // capture-empty-thinking: the thinking block stays empty (a display-omitted-like shape).
    sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } });
    if (phase !== "capture-empty-thinking") sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "fixture chain of thought" } });
    sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "fixture-signature-value" } });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "content_block_start", { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "fixture-redacted-data" } });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 1 });
    sse(res, "content_block_start", { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } });
    sse(res, "content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: `${phase} loopback completed` } });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 2 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  } catch (error) { gatewayFailure = error; res.writeHead(500); res.end("loopback fixture error"); }
});

const blockShape = (block: Record<string, unknown>): Record<string, unknown> => {
  if (block.type === "thinking") return { type: "thinking", thinkingLen: typeof block.thinking === "string" ? block.thinking.length : -1, thinking: typeof block.thinking === "string" ? block.thinking.slice(0, 60) : undefined, hasSignature: typeof block.signature === "string", signatureLen: typeof block.signature === "string" ? block.signature.length : -1, keys: Object.keys(block).sort() };
  if (block.type === "redacted_thinking") return { type: "redacted_thinking", dataLen: typeof block.data === "string" ? block.data.length : -1, keys: Object.keys(block).sort() };
  if (block.type === "text") return { type: "text", textHead: typeof block.text === "string" ? block.text.slice(0, 80) : undefined };
  return { type: block.type, keys: Object.keys(block).sort() };
};

const runPhase = async (config: PhaseConfig) => {
  phase = config.name;
  rejectMode = config.reject ?? "none";
  rejections = 0;
  gatewayIndex = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 20000);
  const query = SDK.query({ prompt: `<${config.name}> fixture prompt`, options: {
    cwd: root, systemPrompt: "fixture system prompt",
    tools: [], allowedTools: [], mcpServers: {}, settingSources: [], strictMcpConfig: true,
    skills: [], plugins: [], settings: { disableAllHooks: true }, extraArgs: { "disable-slash-commands": null },
    persistSession: false, abortController: controller,
    ...(config.thinking ? { thinking: config.thinking } : {}),
    ...(config.effort ? { effort: config.effort } : {}),
    ...(config.model ? { model: config.model } : {}),
    env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_BASE_URL: endpoint,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" },
  } });
  const frames: Array<Record<string, unknown>> = [];
  let result: Record<string, unknown> | undefined;
  let streamError: string | undefined;
  try {
    for await (const message of query) {
      if (message.type === "assistant") frames.push({ kind: "assistant", blocks: (message.message.content as unknown as Array<Record<string, unknown>>).map(blockShape) });
      else if (message.type === "system") frames.push({ kind: "system", subtype: message.subtype, head: JSON.stringify(message).slice(0, 240) });
      else if (message.type === "result") result = { subtype: message.subtype, isError: message.is_error, textHead: typeof (message as { result?: unknown }).result === "string" ? (message as { result: string }).result.slice(0, 200) : undefined, numTurns: message.num_turns };
    }
  } catch (error) { streamError = error instanceof Error ? error.message.slice(0, 240) : String(error); }
  finally { clearTimeout(timer); try { query.close(); } catch { /* already closed */ } }
  return { name: config.name, requests: requests.filter((record) => record.phase === config.name), frames, result, streamError };
};

// Adapter-level closure (production assembly): env ANS_CLAUDE_REASONING_EFFORT → Service resolve →
// options.reasoningEffort → adapter spread → wire; the mixed SSE's thinking blocks arrive as projected
// reasoning rows (Service projection is the single redaction point).
const runAdapterPhase = async () => {
  phase = "adapter-wiring-high";
  rejectMode = "none"; rejections = 0; gatewayIndex = 0;
  process.env.ANS_CLAUDE_REASONING_EFFORT = "high";
  const role: ResolvedRole = { id: "reasoning-probe", kind: "project", cardText: "# Reasoning loopback fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root,
    gate: () => ({ allowed: false, reason: "probe has no write effects", allowedByRoot: { project: [], skill: [] } }),
    modelId: "claude-sonnet-4-6", baseUrl: endpoint, constructTimeoutMs: 15000, promptTimeoutMs: 20000,
    providerFactories: { claude: (input) => {
      assert.equal(input.reasoningEffort, "high"); // Service resolved the env into the neutral field
      return createClaudeRuntimeAdapter({ ...input,
        tools: [{ name: "probe_tool", description: "Loopback fixture only", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe handler reached" }) }],
      }, { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY }, loadSdk: async () => ({ createSdkMcpServer: SDK.createSdkMcpServer, query: (params) => {
        const raw = params.options!;
        return SDK.query({ prompt: params.prompt, options: { ...raw,
          env: { ...raw.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" },
        } }) as unknown as SDK.Query;
      } }) });
    } },
  });
  try {
    const session = await service.bindRole(role);
    const rows: SessionEvent[] = [];
    const reading = (async () => { for await (const row of session.events()) { rows.push(row); if (row.kind === "settled") break; } })();
    await session.prompt("adapter wiring turn");
    await reading;
    await session.dispose();
    return { name: phase, requests: requests.filter((record) => record.phase === "adapter-wiring-high"),
      rows: rows.map((row) => ({ kind: row.kind, summary: row.summary, detail: row.detail })),
      settled: (rows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome };
  } finally {
    delete process.env.ANS_CLAUDE_REASONING_EFFORT;
  }
};

try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  endpoint = `http://127.0.0.1:${address.port}`;

  const reports: Awaited<ReturnType<typeof runPhase>>[] = [];
  for (const config of phases) reports.push(await runPhase(config));
  const adapterReport = await runAdapterPhase();
  if (gatewayFailure) throw gatewayFailure;

  // Frozen wire facts (deterministic fixture; see doc §A1/A2). These pin the empirical baseline the
  // adapter mapping relies on; a CLI upgrade that changes them must turn this probe red.
  const byName = (name: string) => reports.find((report) => report.name === name)!;
  const wire = (name: string) => byName(name).requests[0]!;
  const outputEffort = (record: Record<string, unknown>) => (record.outputConfig as { effort?: string } | null)?.effort;
  // Adapter passes NOTHING in control: the CLI's own defaults still go out (adaptive thinking + effort medium).
  assert.deepEqual(wire("control-unset").thinking, { type: "adaptive", display: "updates" });
  assert.equal(outputEffort(wire("control-unset")), "medium");
  assert.equal(wire("control-unset").effortFlat, null);
  // disabled: the CLI drops the thinking field from the wire entirely.
  assert.equal(wire("thinking-disabled").thinking, null);
  // adaptive stays adaptive; the CLI sends its own display hint on the wire ("updates" observed —
  // Options.thinking.display:'omitted' is NOT propagated by this build; recorded, not asserted).
  assert.equal((wire("thinking-adaptive-display-omitted").thinking as { type?: string }).type, "adaptive");
  // effort rides through as output_config.effort; the flat effort field never appears.
  for (const value of ["low", "medium", "high", "xhigh"]) assert.equal(outputEffort(wire(`effort-${value}`)), value);
  // Model caps clamp on the wire: claude-sonnet-4-6 caps xhigh at high (CLI 2.1.299 catalog).
  assert.equal(outputEffort(wire("effort-xhigh-sonnet")), "high");
  for (const record of reports.flatMap((report) => report.requests)) assert.equal(record.effortFlat, null);
  // 400 behavior: the CLI retries (3 attempts observed) but NEVER drops the reasoning parameters
  // (it only strips the adaptive display hint after the first rejection), then surfaces the API error.
  const rejectThinking = byName("reject-thinking-400");
  assert.ok(rejectThinking.requests.length >= 2);
  assert.equal(rejectThinking.requests.every((record) => record.thinking !== null), true);
  assert.equal(rejectThinking.result?.isError, true);
  assert.match(String(rejectThinking.result?.textHead), /API Error: 400/);
  const rejectEffort = byName("reject-effort-400");
  assert.ok(rejectEffort.requests.length >= 2);
  assert.equal(rejectEffort.requests.every((record) => outputEffort(record) === "high"), true);
  assert.equal(rejectEffort.result?.isError, true);
  // Mixed-block capture: thinking arrives complete (text+signature); redacted arrives as data-only;
  // the empty block keeps type thinking with empty text.
  const shapes = (name: string) => byName(name).frames.filter((frame) => frame.kind === "assistant").flatMap((frame) => frame.blocks as Array<Record<string, unknown>>);
  const complete = shapes("control-unset");
  assert.equal(complete.some((shape) => shape.type === "thinking" && shape.thinking === "fixture chain of thought" && shape.hasSignature === true), true);
  assert.equal(complete.some((shape) => shape.type === "redacted_thinking"), true);
  assert.equal(shapes("capture-empty-thinking").some((shape) => shape.type === "thinking" && shape.thinkingLen === 0), true);
  // Adapter closure: env-driven xhigh rides to the wire; thinking blocks surface as projected rows.
  assert.equal(outputEffort(adapterReport.requests[0]!), "high");
  assert.equal(adapterReport.settled, "completed");
  const reasoningRows = adapterReport.rows.filter((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning");
  assert.equal(reasoningRows.length, 2);
  assert.deepEqual(reasoningRows.map((row) => (row.detail as { reasoning: { status: string } }).reasoning.status), ["complete", "omitted"]);
  assert.match((reasoningRows[0]!.detail as { reasoning: { text: { text: string } } }).reasoning.text.text, /fixture chain of thought/);
  for (const row of reasoningRows) assert.equal(row.summary, "已思考");

  const report = { fixture: { node: process.version, sdk: "0.3.299", bundledCli: "2.1.299", loopbackOnly: true, externalApiCalls: 0 }, reports, adapterReport };
  assert.equal(JSON.stringify(report).includes(FAKE_KEY), false);
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(limit);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
