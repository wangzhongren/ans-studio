// Explicit native proof: actual bundled CLI, HTTP restricted to 127.0.0.1, fake credentials.
// Run separately: node test/claude-adapter/native-loopback.probe.ts (45s bound, no real model).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as SDK from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { InteractionGate, RoleSession, ToolExecutionCall } from "../../src/model/runtime.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";

const root = await mkdtemp(join(tmpdir(), "ans-claude-native-loopback-"));
const inputUuids: string[] = [];
const hooks: Array<{ event: string; promptId?: string; transportUuid?: string; tool?: string; source?: string; contextIssued?: boolean }> = [];
const catalogs: Array<{ tools: string[]; servers: string[] }> = [];
const calls: ToolExecutionCall[] = [];
const endpoints: string[] = [];
let nativeQuery: SDK.Query | undefined;
let session: RoleSession | undefined;
let requestIndex = 0;
let failure: unknown;
const limit = setTimeout(() => { nativeQuery?.close(); server.closeAllConnections(); server.close(); failure = new Error("native loopback probe exceeded 45s"); }, 45000);
const sse = (res: import("node:http").ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, "127.0.0.1");
    assert.equal(req.headers["x-api-key"], "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL");
    endpoints.push(req.url ?? "");
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (req.url?.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ input_tokens: 100 })); return; }
    if (!req.url?.startsWith("/v1/messages")) { res.writeHead(404); res.end(); return; }
    const index = requestIndex++;
    const tool = index % 2 === 0;
    const id = `msg_loopback_${index}`;
    const model = String(body.model ?? "claude-sonnet-4-6");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    if (tool) {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: `toolu_loopback_${index}`, name: "mcp__ans__native_probe", input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ probeTag: "fake-response-original" }) } });
    } else {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "native loopback completed" } });
    }
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  } catch (error) { failure = error; res.writeHead(500); res.end("loopback fixture error"); }
});
try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const role: ResolvedRole = { id: "native-probe", kind: "project", cardText: "# Native loopback fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
  const gate: InteractionGate = { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} };
  let turnNumber = 0;
  const adapter = createClaudeRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, interactionGate: gate, currentTurnId: () => `native-ans-turn-${++turnNumber}`, modelId: "claude-sonnet-4-6", baseUrl: endpoint, constructTimeoutMs: 10000, promptTimeoutMs: 15000,
    tools: [{ name: "native_probe", description: "Loopback fixture only", inputSchema: { type: "object", properties: { probeTag: { type: "string" } }, required: ["probeTag"], additionalProperties: false }, handler: async (call) => { calls.push(call); return { ok: true, message: "native handler reached" }; } }],
  }, { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL" }, loadSdk: async () => ({ createSdkMcpServer: SDK.createSdkMcpServer, query: (params) => {
    const options = params.options!;
    const observedHooks: SDK.Options["hooks"] = {};
    for (const event of ["UserPromptSubmit", "PreToolUse"] as const) observedHooks[event] = options.hooks![event]!.map((matcher) => ({ ...matcher, hooks: matcher.hooks.map((hook) => async (input, id, context) => {
      const output = await hook(input, id, context);
      const specific = (output as SDK.SyncHookJSONOutput).hookSpecificOutput;
      hooks.push({ event: input.hook_event_name, promptId: input.prompt_id, ...(input.hook_event_name === "UserPromptSubmit" ? { transportUuid: /^\[ANS_INPUT_CONTEXT:([^\]]+)\]\n/.exec(input.prompt)?.[1] } : {}), ...(input.hook_event_name === "PreToolUse" ? { tool: input.tool_name, source: input.mcp_server?.source } : {}), contextIssued: !!(specific && "updatedInput" in specific && typeof specific.updatedInput?.__ans_call_context === "string") });
      if (specific && "updatedInput" in specific && specific.updatedInput) specific.updatedInput = { ...specific.updatedInput, probeTag: "changed-by-native-hook" };
      return output;
    }) }));
    async function* inputs() { for await (const user of params.prompt as AsyncIterable<SDK.SDKUserMessage>) { inputUuids.push(user.uuid!); yield user; } }
    assert.equal(options.extraArgs?.bare, undefined);
    assert.deepEqual(options.settings, { disableAllHooks: true });
    const actual = SDK.query({ prompt: inputs(), options: { ...options, hooks: observedHooks, env: { ...options.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" } } });
    nativeQuery = actual;
    const observed = (async function* () { for await (const message of actual) { if (message.type === "system" && message.subtype === "init") catalogs.push({ tools: message.tools, servers: message.mcp_servers.map((server) => server.name) }); yield message; } })();
    return Object.assign(observed, { close: () => actual.close(), interrupt: () => actual.interrupt() }) as unknown as SDK.Query;
  } }) });
  session = await adapter.bindRole(role);
  await session.prompt("same loopback input text");
  await session.prompt("same loopback input text");
  if (failure) throw failure;
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.deepEqual(call.args, { probeTag: "changed-by-native-hook" }); assert.equal(call.signal?.aborted, true); }
  assert.equal(inputUuids.length, 2);
  const submits = hooks.filter((row) => row.event === "UserPromptSubmit");
  const tools = hooks.filter((row) => row.event === "PreToolUse");
  assert.equal(submits.length, 2);
  assert.equal(tools.length, 2);
  for (let index = 0; index < 2; index++) {
    assert.equal(submits[index]!.transportUuid, inputUuids[index]);
    assert.notEqual(submits[index]!.promptId, inputUuids[index]);
    assert.equal(tools[index]!.promptId, submits[index]!.promptId);
    assert.equal(tools[index]!.source, "sdk");
    assert.equal(tools[index]!.contextIssued, true);
  }
  // Bundled CLI emits init for each streaming input, so inspect both exact catalogs.
  assert.equal(catalogs.length, 2);
  for (const catalog of catalogs) {
    assert.deepEqual(catalog.tools, ["mcp__ans__native_probe"]);
    assert.deepEqual(catalog.servers, ["ans"]);
  }
  console.log(JSON.stringify({ bundledCli: "2.1.299", sdk: "0.3.299", inputUuids, hooks, catalogs, handlerArguments: calls.map((call) => call.args), handlerToolCallIds: calls.map((call) => call.toolCallId), endpoints, externalApiCalls: 0, credentials: "fake-only" }, null, 2));
} finally {
  clearTimeout(limit);
  nativeQuery?.close();
  await session?.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
