// Explicit native proof for the WebSearch capability bit: actual bundled CLI, HTTP restricted to
// 127.0.0.1, fake credentials, no real model and no external network.
// Run separately: node test/claude-adapter/web-search-loopback.probe.ts (90s bound).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as SDK from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RoleSession, SessionEvent, ToolEventDetailV1 } from "../../src/model/runtime.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";

const FAKE_KEY = "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL";
const root = await mkdtemp(join(tmpdir(), "ans-claude-web-search-loopback-"));
type RequestRecord = {
  phase: string; kind: "count_tokens" | "main" | "side-query" | "other";
  toolNames: string[]; hasWebSearchDeclaration: boolean; maxUses?: number;
  toolChoice?: unknown; beta?: string | null; messageCount?: number; firstUserText?: string;
};
const requests: RequestRecord[] = [];
const hookRecords: Array<{ phase: string; event: string; tool?: string; promptId?: string; decision?: string; updatedInput?: boolean }> = [];
const catalogs: Array<{ phase: string; tools: string[]; servers: string[] }> = [];
const cleanupNotes: string[] = [];
let phase = "boot";
let sideMode: "ok" | "fail" = "ok";
let mainTurns = 0;
let nativeQuery: SDK.Query | undefined;
let session: RoleSession | undefined;
let failure: unknown;
const limit = setTimeout(() => { nativeQuery?.close(); server.closeAllConnections(); server.close(); failure = new Error("web search loopback probe exceeded 90s"); }, 90000);
const sse = (res: import("node:http").ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, "127.0.0.1");
    assert.equal(req.headers["x-api-key"], FAKE_KEY);
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (req.url?.includes("count_tokens")) { requests.push({ phase, kind: "count_tokens", toolNames: [], hasWebSearchDeclaration: false }); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ input_tokens: 100 })); return; }
    if (!req.url?.startsWith("/v1/messages")) { requests.push({ phase, kind: "other", toolNames: [], hasWebSearchDeclaration: false }); res.writeHead(404); res.end(); return; }
    const tools = Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : [];
    const declaration = tools.find((tool) => tool.type === "web_search_20250305");
    const messages = Array.isArray(body.messages) ? body.messages as Array<Record<string, unknown>> : [];
    const first = messages[0];
    const firstUserText = first === undefined ? undefined
      : typeof first.content === "string" ? first.content
      : Array.isArray(first.content) ? (first.content as Array<Record<string, unknown>>).filter((block) => block.type === "text").map((block) => String(block.text)).join("\n") : undefined;
    requests.push({ phase, kind: declaration ? "side-query" : "main", toolNames: tools.map((tool) => String(tool.name)),
      hasWebSearchDeclaration: declaration !== undefined, maxUses: declaration ? declaration.max_uses as number : undefined,
      toolChoice: body.tool_choice ?? null, beta: typeof req.headers["anthropic-beta"] === "string" ? req.headers["anthropic-beta"] : null,
      messageCount: messages.length, firstUserText });
    if (declaration && sideMode === "fail") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fixture gateway rejects the server tool declaration" } }));
      return;
    }
    const mainIndex = declaration ? undefined : mainTurns++;
    const id = `msg_ws_loopback_${requests.length}`;
    const model = String(body.model ?? "claude-sonnet-4-6");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    let stopReason = "end_turn";
    if (declaration) {
      // Side query: server tool actually executed, mirroring the real API block family.
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_loopback", name: "web_search", input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: "ans loopback web search" }) } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      sse(res, "content_block_start", { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_loopback", content: [{ type: "web_search_result", title: "Loopback Evidence", url: "https://example.test/loopback", encrypted_content: "fixture-encrypted-content", page_age: null }] } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 1 });
      sse(res, "content_block_start", { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "fixture search summary" } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 2 });
    } else if (mainIndex === 0 && phase !== "control") {
      // First main request of an enabled phase: the model asks for WebSearch.
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_ws_loopback", name: "WebSearch", input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: "ans loopback web search" }) } });
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
  } catch (error) { failure = error; res.writeHead(500); res.end("loopback fixture error"); }
});
try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const role: ResolvedRole = { id: "web-search-probe", kind: "project", cardText: "# Web search loopback fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };

  const runPhase = async (phaseName: string, webSearch: boolean): Promise<SessionEvent[]> => {
    phase = phaseName;
    sideMode = phaseName === "side-query-fail" ? "fail" : "ok";
    mainTurns = 0;
    const adapter = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: () => ({ allowed: false, reason: "probe has no write effects", allowedByRoot: { project: [], skill: [] } }), modelId: "claude-sonnet-4-6", baseUrl: endpoint, constructTimeoutMs: 10000, turnLastResortMs: 15000,
      providerFactories: { claude: (config) => {
        assert.equal(config.toolDisplayMode, "required-v1");
        return createClaudeRuntimeAdapter({ ...config,
          tools: [{ name: "native_probe", description: "Loopback fixture only", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "native handler reached" }) }],
        }, { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY, ...(webSearch ? { ANS_CLAUDE_WEB_SEARCH: "1" } : {}) }, loadSdk: async () => ({ createSdkMcpServer: SDK.createSdkMcpServer, query: (params) => {
          const options = params.options!;
          const observedHooks: SDK.Options["hooks"] = {};
          for (const event of ["UserPromptSubmit", "PreToolUse"] as const) observedHooks[event] = options.hooks![event]!.map((matcher) => ({ ...matcher, hooks: matcher.hooks.map((hook) => async (input, id, context) => {
            const output = await hook(input, id, context);
            const specific = (output as SDK.SyncHookJSONOutput).hookSpecificOutput;
            if (input.hook_event_name !== "PreToolUse") hookRecords.push({ phase, event: input.hook_event_name });
            else hookRecords.push({ phase, event: "PreToolUse", tool: input.tool_name, promptId: input.prompt_id, ...(specific && "permissionDecision" in specific ? { decision: specific.permissionDecision } : {}), ...(specific && "updatedInput" in specific ? { updatedInput: !!specific.updatedInput } : { updatedInput: false }) });
            return output;
          }) }));
          const actual = SDK.query({ prompt: params.prompt, options: { ...options, hooks: observedHooks, env: { ...options.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" } } });
          nativeQuery = actual;
          const observed = (async function* () { for await (const message of actual) { if (message.type === "system" && message.subtype === "init") catalogs.push({ phase, tools: message.tools, servers: message.mcp_servers.map((server) => server.name) }); yield message; } })();
          return Object.assign(observed, { close: () => actual.close(), interrupt: () => actual.interrupt() }) as unknown as SDK.Query;
        } }) }); } }, });
    session = await adapter.bindRole(role);
    const rows: SessionEvent[] = [];
    const drain = (async () => { for await (const row of session!.events()) { rows.push(row); if (rows.filter((event) => event.kind === "settled").length === 1) break; } })();
    await session.prompt(webSearch ? "search the loopback" : "control turn without web search");
    if (failure) throw failure;
    await drain;
    try { await session.dispose(); } catch (error) {
      // Env-level cleanup race: the bundled CLI may still flush files into the temp config dir while
      // dispose() removes it (observed ENOTEMPTY, ~1/12 disposes). Recorded, not masked; not this feature's surface.
      if (error instanceof Error && /ENOTEMPTY|ENOENT/.test(error.message)) cleanupNotes.push(`${phaseName}: ${error.message}`);
      else throw error;
    }
    session = undefined;
    return rows;
  };

  const enabledRows = await runPhase("enabled", true);
  const failureRows = await runPhase("side-query-fail", true);
  const controlRows = await runPhase("control", false);
  if (failure) throw failure;

  const phaseRequests = (name: string) => requests.filter((record) => record.phase === name);
  const toolDetail = (row: SessionEvent) => row.detail as ToolEventDetailV1;
  const webSearchRows = (rows: SessionEvent[]) => rows.filter((row) => toolDetail(row).toolName === "WebSearch" && ["start", "result", "blocked"].includes(toolDetail(row).phase));
  const settledOutcome = (rows: SessionEvent[]) => (rows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome;

  // Enabled phase: side query declaration shape, ANS native event stream, hook dispatch.
  const enabledRequests = phaseRequests("enabled");
  const sideQueries = enabledRequests.filter((record) => record.kind === "side-query");
  // The CLI may issue one retry after an API error (observed: second attempt drops the dangerous-tool-use beta).
  assert.ok(sideQueries.length >= 1);
  for (const record of sideQueries) {
    assert.equal(record.maxUses, 8);
    assert.deepEqual(record.toolChoice, { type: "tool", name: "web_search" });
    assert.equal((record.beta ?? "").includes("web-search-2025-03-05"), false);
    assert.equal(record.messageCount, 1);
    assert.match(record.firstUserText ?? "", /Perform a web search for the query/);
  }
  assert.equal(enabledRequests.some((record) => record.kind === "main" && record.hasWebSearchDeclaration), false);
  const webSearchHooks = hookRecords.filter((record) => record.phase === "enabled" && record.event === "PreToolUse" && record.tool === "WebSearch");
  for (const record of webSearchHooks) { assert.equal(record.decision, "allow"); assert.equal(record.updatedInput, false); }
  for (const catalog of catalogs.filter((record) => record.phase === "enabled")) {
    assert.ok(catalog.tools.includes("WebSearch"));
    assert.ok(catalog.tools.includes("mcp__ans__native_probe"));
    assert.deepEqual(catalog.servers, ["ans"]);
  }
  const enabledTool = webSearchRows(enabledRows);
  assert.deepEqual(enabledTool.map((row) => toolDetail(row).phase), ["start", "result"]);
  assert.equal(enabledTool[0]!.kind, "tool_call");
  assert.equal(enabledTool[1]!.kind, "accepted");
  assert.equal(toolDetail(enabledTool[1]!).ok, true);
  assert.match(toolDetail(enabledTool[1]!).display!.resultText!.text, /Web search results for query: "ans loopback web search"/);
  assert.match(toolDetail(enabledTool[1]!).display!.resultText!.text, /https:\/\/example\.test\/loopback/);
  assert.equal(settledOutcome(enabledRows), "completed");

  // Failure phase: gateway rejection of the side query stays honest and does not kill the turn.
  const failureSideQueries = phaseRequests("side-query-fail").filter((record) => record.kind === "side-query");
  assert.ok(failureSideQueries.length >= 1);
  const failureTool = webSearchRows(failureRows);
  assert.deepEqual(failureTool.map((row) => toolDetail(row).phase), ["start", "result"]);
  assert.equal(failureTool[1]!.kind, "denied");
  assert.equal(toolDetail(failureTool[1]!).ok, false);
  assert.equal(settledOutcome(failureRows), "completed");

  // Control phase: capability bit off means no declaration, no side query, no search surface.
  const controlRequests = phaseRequests("control");
  assert.equal(controlRequests.filter((record) => record.kind === "side-query").length, 0);
  assert.equal(controlRequests.every((record) => !record.hasWebSearchDeclaration), true);
  assert.equal(webSearchRows(controlRows).length, 0);
  for (const catalog of catalogs.filter((record) => record.phase === "control")) assert.equal(catalog.tools.includes("WebSearch"), false);
  assert.equal(settledOutcome(controlRows), "completed");

  console.log(JSON.stringify({ bundledCli: "2.1.299", sdk: "0.3.299", webSearchHookDispatched: webSearchHooks.length, webSearchHookRecords: webSearchHooks,
    sideQueryCounts: { enabled: sideQueries.length, "side-query-fail": failureSideQueries.length },
    requests: requests.map((record) => ({ ...record, firstUserText: record.firstUserText === undefined || record.firstUserText.length <= 140 ? record.firstUserText : `${record.firstUserText.slice(0, 70)} … ${record.firstUserText.slice(-70)}` })),
    hookRecords, catalogs,
    enabledToolRows: enabledTool.map((row) => ({ kind: row.kind, detail: toolDetail(row) })),
    failureToolRows: failureTool.map((row) => ({ kind: row.kind, detail: toolDetail(row) })),
    controlSettled: settledOutcome(controlRows), cleanupNotes, externalApiCalls: 0, credentials: "fake-only" }, null, 2));
} finally {
  clearTimeout(limit);
  nativeQuery?.close();
  await session?.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
