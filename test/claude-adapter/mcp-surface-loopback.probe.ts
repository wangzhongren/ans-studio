// Explicit native proof for the V2 MCP P0 questions (role-mcp-install assessment §九.1): actual bundled
// CLI, HTTP restricted to 127.0.0.1, fake credentials, one local stdio fake MCP server (scratch fixture).
// Freezes: CLI spawn + child env keys, PreToolUse dispatch and mcp_server.source, hook-allow vs
// canUseTool consultation, mcpServerStatus shapes, alwaysLoad first-turn waiting, allowedTools entry form.
// No real gateway requests. Run separately: node test/claude-adapter/mcp-surface-loopback.probe.ts.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as SDK from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";
import type { RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";

const FAKE_KEY = "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL";
const fakeServerPath = fileURLToPath(new URL("./mcp-fake-stdio-server.probe.ts", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "ans-claude-mcp-surface-"));
const role: ResolvedRole = { id: "mcp-probe", kind: "project", cardText: "# MCP surface loopback fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };

type RequestRecord = {
  phase: string; index: number; arrivedAt: number; toolNames: string[]; hasProbeEcho: boolean;
  toolResults: { toolUseId: string; isError?: boolean; textHead: string }[];
};
type HookRecord = { phase: string; tool?: string; promptBound?: boolean; provenance?: { name: string; source: string }; inputKeys?: string[]; productionDecision?: string };
type CanUseToolRecord = { phase: string; toolName: string; provenance?: { name: string; source: string }; consulted: true; productionBehavior?: string };
type CatalogRecord = { phase: string; tools: string[]; servers: unknown[] };
type PhaseConfig = {
  name: string; broken?: boolean; delayMs?: number; hang?: boolean; alwaysLoad?: boolean; dropAutoBackground?: boolean; timeoutMs?: number;
  hookPolicy: "production" | "observe-then-allow" | "passthrough";
  canUseToolPolicy: "delegate" | "allow"; allowedToolsExtra: string[]; gateway: "text" | "tool-once"; prompts: number;
};
const phases: PhaseConfig[] = [
  { name: "baseline-connected", hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
  { name: "tool-call-production-hook", hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "tool-once", prompts: 1 },
  { name: "hook-allow-canuse-delegate", hookPolicy: "observe-then-allow", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "tool-once", prompts: 1 },
  { name: "hook-allow-canuse-allow", hookPolicy: "observe-then-allow", canUseToolPolicy: "allow", allowedToolsExtra: [], gateway: "tool-once", prompts: 1 },
  { name: "alwaysload-delay3s", delayMs: 3000, alwaysLoad: true, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 2 },
  { name: "default-delay3s", delayMs: 3000, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 2 },
  { name: "broken-command", broken: true, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
  { name: "allowedtools-server-level", hookPolicy: "passthrough", canUseToolPolicy: "delegate", allowedToolsExtra: ["mcp__probe"], gateway: "tool-once", prompts: 1 },
  { name: "allowedtools-tool-level", hookPolicy: "passthrough", canUseToolPolicy: "delegate", allowedToolsExtra: ["mcp__probe__echo"], gateway: "tool-once", prompts: 1 },
  // Negative control: hook abstains and no allowedTools entry names the probe tool -> the permission callback must decide.
  { name: "allowedtools-absent", hookPolicy: "passthrough", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "tool-once", prompts: 1 },
  // alwaysLoad discrimination beyond the 5s connect cap: server never answers initialize.
  { name: "alwaysload-hang", hang: true, alwaysLoad: true, timeoutMs: 90000, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
  { name: "default-hang", hang: true, timeoutMs: 90000, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
  // Isolation: drop ANS's CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS to separate its effect from alwaysLoad.
  // (Longer bound: find where a hanging connect finally releases the first request.)
  { name: "alwaysload-hang-no-ab", hang: true, alwaysLoad: true, dropAutoBackground: true, timeoutMs: 90000, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
  { name: "default-hang-no-ab", hang: true, dropAutoBackground: true, timeoutMs: 90000, hookPolicy: "production", canUseToolPolicy: "delegate", allowedToolsExtra: [], gateway: "text", prompts: 1 },
];

let phase = "boot";
let endpoint = "";
let gatewayMode: "text" | "tool-once" = "text";
let gatewayIndex = 0;
let gatewayFailure: unknown;
const requests: RequestRecord[] = [];
const hookRecords: HookRecord[] = [];
const canUseToolRecords: CanUseToolRecord[] = [];
const catalogs: CatalogRecord[] = [];
const cleanupNotes: string[] = [];
const phaseErrors: { phase: string; error: string }[] = [];
const statusSnapshots: { phase: string; at: number; entries: unknown[] }[] = [];

const limit = setTimeout(() => { gatewayFailure = new Error("mcp surface loopback probe exceeded 420s"); server.closeAllConnections(); server.close(); }, 420000);
const sse = (res: import("node:http").ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, "127.0.0.1");
    assert.equal(req.headers["x-api-key"], FAKE_KEY);
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (req.url?.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ input_tokens: 100 })); return; }
    if (!req.url?.startsWith("/v1/messages")) { res.writeHead(404); res.end(); return; }
    const tools = Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : [];
    const messages = Array.isArray(body.messages) ? body.messages as Array<Record<string, unknown>> : [];
    const toolResults: RequestRecord["toolResults"] = [];
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content as Array<Record<string, unknown>>) {
        if (block.type !== "tool_result") continue;
        const content = block.content;
        const resultText = typeof content === "string" ? content
          : Array.isArray(content) ? (content as Array<Record<string, unknown>>).filter((item) => item.type === "text").map((item) => String(item.text)).join("\n") : "";
        toolResults.push({ toolUseId: String(block.tool_use_id ?? ""), isError: block.is_error === true, textHead: resultText.slice(0, 160) });
      }
    }
    const toolNames = tools.map((tool) => String(tool.name));
    const index = gatewayIndex++;
    requests.push({ phase, index, arrivedAt: Date.now(), toolNames, hasProbeEcho: toolNames.includes("mcp__probe__echo"), toolResults });
    const id = `msg_mcp_loopback_${requests.length}`;
    const model = String(body.model ?? "claude-sonnet-4-6");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    let stopReason = "end_turn";
    if (gatewayMode === "tool-once" && index === 0) {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_mcp_loopback", name: "mcp__probe__echo", input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ text: "probe-input" }) } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      stopReason = "tool_use";
    } else {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `${phase} loopback completed` } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    }
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 10 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  } catch (error) { gatewayFailure = error; res.writeHead(500); res.end("loopback fixture error"); }
});

const decisionOf = (output: unknown): string | undefined => {
  const specific = (output as SDK.SyncHookJSONOutput | undefined)?.hookSpecificOutput;
  return specific && typeof specific === "object" && "permissionDecision" in specific ? String((specific as { permissionDecision?: unknown }).permissionDecision) : undefined;
};
const readRecords = async (recordDir: string): Promise<{ spawn: unknown; events: unknown[] }> => {
  try {
    const spawn = JSON.parse(await readFile(join(recordDir, "spawn.json"), "utf8")) as unknown;
    const events = (await readFile(join(recordDir, "events.jsonl"), "utf8")).trim().split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as unknown);
    return { spawn, events };
  } catch { return { spawn: undefined, events: [] }; } // broken-command phase never spawns
};

const runPhase = async (config: PhaseConfig): Promise<{ name: string; spawn: unknown; events: unknown[]; prompts: { turn: number; pushedAt: number }[]; statuses: unknown[][]; rows: { kind: string; phase?: string; toolName?: string }[]; settledOutcomes: string[] }> => {
  phase = config.name;
  gatewayMode = config.gateway;
  gatewayIndex = 0;
  const recordDir = join(root, `record-${config.name}`);
  const serverConfig: SDK.McpStdioServerConfig = config.broken
    ? { type: "stdio", command: "/nonexistent/ans-probe-missing-binary" }
    : { type: "stdio", command: process.execPath, args: [fakeServerPath], env: { FAKE_MCP_RECORD_DIR: recordDir, FAKE_MCP_DELAY_MS: String(config.delayMs ?? 0), FAKE_MCP_MODE: config.hang ? "hang" : "ok" }, ...(config.alwaysLoad ? { alwaysLoad: true } : {}) };
  const actualQueries: SDK.Query[] = [];
  const options = (projectRoot: string): RuntimeSessionOptions => ({ runtime: "claude", projectRoot, skillRoot: projectRoot, gate: () => ({ allowed: false, reason: "probe has no write effects", allowedByRoot: { project: [], skill: [] } }), modelId: "claude-sonnet-4-6", baseUrl: endpoint, constructTimeoutMs: 15000, promptTimeoutMs: config.timeoutMs ?? 25000,
    providerFactories: { claude: (input) => {
      assert.equal(input.toolDisplayMode, "required-v1");
      return createClaudeRuntimeAdapter({ ...input,
        tools: [{ name: "probe_tool", description: "Loopback fixture only", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe handler reached" }) }],
      }, { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY }, loadSdk: async () => ({ createSdkMcpServer: SDK.createSdkMcpServer, query: (params) => {
        const raw = params.options!;
        const observedHooks: SDK.Options["hooks"] = {};
        for (const event of ["UserPromptSubmit", "PreToolUse"] as const) observedHooks[event] = raw.hooks![event]!.map((matcher) => ({ ...matcher, hooks: matcher.hooks.map((hook) => async (input, id, context) => {
          if (input.hook_event_name !== "PreToolUse") return hook(input, id, context);
          const output = await hook(input, id, context);
          hookRecords.push({ phase: config.name, tool: input.tool_name, promptBound: !!input.prompt_id, provenance: input.mcp_server, inputKeys: input.tool_input !== null && typeof input.tool_input === "object" ? Object.keys(input.tool_input as object) : [], productionDecision: decisionOf(output) });
          if (input.tool_name.startsWith("mcp__probe__")) {
            if (config.hookPolicy === "observe-then-allow") return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
            if (config.hookPolicy === "passthrough") return {};
          }
          return output;
        }) }));
        const wrappedCanUseTool: SDK.CanUseTool = async (toolName, toolInput, canOptions) => {          const production = raw.canUseTool!;
          const result = await production(toolName, toolInput, canOptions);
          canUseToolRecords.push({ phase: config.name, toolName, provenance: canOptions.mcpServer, consulted: true, productionBehavior: result?.behavior });
          if (config.canUseToolPolicy === "allow") return { behavior: "allow", updatedInput: toolInput };
          return result;
        };
        const probeEnv: Record<string, string | undefined> = { ...raw.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" };
        if (config.dropAutoBackground) delete probeEnv.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS;
        const actual = SDK.query({ prompt: params.prompt, options: { ...raw,
          hooks: observedHooks, canUseTool: wrappedCanUseTool,
          allowedTools: [...(raw.allowedTools ?? []), ...config.allowedToolsExtra],
          mcpServers: { ...raw.mcpServers, probe: serverConfig },
          env: probeEnv,
        } });
        actualQueries.push(actual);
        const observed = (async function* () { for await (const message of actual) {
          if (message.type === "system" && message.subtype === "init") catalogs.push({ phase: config.name, tools: message.tools, servers: message.mcp_servers.map((entry) => ({ ...entry })) });
          yield message;
        } })();
        return Object.assign(observed, { close: () => actual.close(), interrupt: () => actual.interrupt(), mcpServerStatus: () => actual.mcpServerStatus() }) as unknown as SDK.Query;
      } }) });
    } },
  });
  const session = await createRuntimeAdapter(options(root)).bindRole(role);
  const rows: SessionEvent[] = [];
  const reading = (async () => { for await (const row of session.events()) { rows.push(row); if (rows.filter((event) => event.kind === "settled").length === config.prompts) break; } })();
  const prompts: { turn: number; pushedAt: number }[] = [];
  try {
    for (let turn = 0; turn < config.prompts; turn++) {
      const pushedAt = Date.now();
      prompts.push({ turn, pushedAt });
      await session.prompt(`${config.name} turn ${turn}`);
      if (gatewayFailure) throw gatewayFailure;
    }
    await reading;
    const statuses: unknown[][] = [];
    const query = actualQueries.at(-1)!;
    for (let attempt = 0; attempt < 8; attempt++) {
      const snapshot = await query.mcpServerStatus();
      statuses.push(snapshot.map((entry) => ({ ...entry })));
      statusSnapshots.push({ phase: config.name, at: Date.now(), entries: snapshot.map((entry) => ({ ...entry })) });
      if (snapshot.every((entry) => entry.status !== "pending")) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const records = await readRecords(recordDir);
    return { name: config.name, spawn: records.spawn, events: records.events, prompts, statuses, rows: rows.map((row) => ({ kind: row.kind, phase: (row.detail as { phase?: string } | undefined)?.phase, toolName: (row.detail as { toolName?: string } | undefined)?.toolName })), settledOutcomes: rows.filter((row) => row.kind === "settled").map((row) => (row.detail as { outcome: string }).outcome) };
  } finally {
    try { await session.dispose(); } catch (error) {
      // Known env-level cleanup race (G-3): the bundled CLI may still flush into the temp config dir.
      if (error instanceof Error && /ENOTEMPTY|ENOENT/.test(error.message)) cleanupNotes.push(`${config.name}: ${error.message}`);
      else phaseErrors.push({ phase: config.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
};

try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  endpoint = `http://127.0.0.1:${address.port}`;

  const phaseReports: Awaited<ReturnType<typeof runPhase>>[] = [];
  const selected = (process.env.PROBE_PHASES ?? "").split(",").filter((name) => name !== "");
  for (const config of selected.length > 0 ? phases.filter((entry) => selected.includes(entry.name)) : phases) {
    try {
      phaseReports.push(await runPhase(config));
    } catch (error) {
      phaseErrors.push({ phase: config.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const report = {
    fixture: { node: process.version, sdk: "0.3.299", bundledCli: "2.1.299", loopbackOnly: true, externalApiCalls: 0, credentials: "fake-only" },
    phases: phaseReports.map((entry) => ({ ...entry, requests: requests.filter((record) => record.phase === entry.name).map((record) => ({ ...record, arrivedAfterPromptMs: record.arrivedAt - (entry.prompts[0]?.pushedAt ?? record.arrivedAt) })) })),
    hookRecords, canUseToolRecords, catalogs, statusSnapshots, cleanupNotes, phaseErrors,
  };
  assert.equal(JSON.stringify(report).includes(FAKE_KEY), false);
  console.log(JSON.stringify(report, null, 2));
  if (phaseErrors.length > 0) { console.error(`phases not fully frozen: ${phaseErrors.map((entry) => entry.phase).join(", ")}`); process.exitCode = 1; }
} finally {
  clearTimeout(limit);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
