// 独立真实 SDK/CLI 验证：仅 localhost、临时目录和假 key，不注入兼容实现或修改模型目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as claudeSdk from "@anthropic-ai/claude-agent-sdk";
import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import { createRealPiRuntimeAdapter } from "../../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../../src/common/runtime-core/timeout.ts";
import type { RoleSession, SessionEvent } from "../../../src/model/runtime.ts";
import { makeRole, removeTempDirEventually } from "./helpers.ts";

type Body = Record<string, unknown>;
const FAKE_KEY = "ans-independent-localhost-placeholder";
async function gateway(reply: (body: Body, response: ServerResponse, index: number) => void) {
  const bodies: Body[] = [];
  const errors: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.socket.remoteAddress, "127.0.0.1");
      let raw = "";
      for await (const part of request) raw += part;
      if (request.url?.includes("count_tokens")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ input_tokens: 10 }));
        return;
      }
      const body = JSON.parse(raw) as Body;
      bodies.push(body);
      reply(body, response, bodies.length - 1);
    } catch (error) {
      errors.push(String(error));
      response.writeHead(500);
      response.end("independent fixture failed");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    bodies, errors, baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
function rejectField(response: ServerResponse, param: string) {
  response.writeHead(400, { "content-type": "application/json" });
  response.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "unsupported_parameter", param, message: `Unsupported parameter: ${param}` } }));
}
function event(response: ServerResponse, type: string, data: Body) {
  response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
}
function anthropicAnswer(response: ServerResponse, model: string, tool = false) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  event(response, "message_start", { message: { id: "msg-independent", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  event(response, "content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: "call-once", name: "probe_once", input: {} } : { type: "text", text: "" } });
  event(response, "content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: "{}" } : { type: "text_delta", text: "independent local completed" } });
  event(response, "content_block_stop", { index: 0 });
  event(response, "message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } });
  event(response, "message_stop", {});
  response.end();
}
function responsesAnswer(response: ServerResponse, model: string) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  const initial = { id: "resp-independent", object: "response", created_at: 1, status: "in_progress", model, output: [] };
  const item = { type: "message", id: "msg-independent", role: "assistant", status: "completed", content: [{ type: "output_text", text: "independent local completed", annotations: [] }] };
  event(response, "response.created", { response: initial });
  event(response, "response.output_item.added", { output_index: 0, item: { ...item, content: [] } });
  event(response, "response.output_item.done", { output_index: 0, item });
  event(response, "response.completed", { response: { ...initial, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  response.end();
}
function collect(session: RoleSession) {
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const value of session.events()) events.push(value); })();
  return { events, done };
}
function outcomes(events: SessionEvent[]) {
  return events.filter(value => value.kind === "settled").map(value => (value.detail as { outcome: string }).outcome);
}
function states(events: SessionEvent[], state: string) {
  return events.filter(value => {
    const detail = value.detail as { source?: string; state?: string } | undefined;
    return detail?.source === "system" && detail.state === state;
  });
}

test("独立真实 Claude：low 被拒后 HTTP 真正无 thinking/output_config，同任务及下一轮 completed", { timeout: 60000 }, async context => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-independent-claude-"));
  const server = await gateway((body, response) => {
    if (body.thinking !== undefined || body.output_config !== undefined) rejectField(response, body.output_config !== undefined ? "output_config.effort" : "thinking");
    else anthropicAnswer(response, String(body.model));
  });
  const savedEnvironment = { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY };
  const snapshot = JSON.stringify(savedEnvironment);
  const configurations: claudeSdk.Options[] = [];
  const options = { runtime: "claude" as const, projectRoot: root, skillRoot: root, modelId: "claude-sonnet-4-6", baseUrl: server.baseUrl, reasoningEffort: "low" as const, tools: [], interactionGate: createInteractionGate(), currentTurnId: () => "independent-claude", turnLastResortMs: 45000 };
  const session = await createClaudeRuntimeAdapter(options, {
    env: savedEnvironment,
    loadSdk: async () => ({
      createSdkMcpServer: claudeSdk.createSdkMcpServer,
      query(input) {
        configurations.push(input.options!);
        return claudeSdk.query({ ...input, options: { ...input.options, env: { ...input.options?.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" } } });
      },
    }),
  }).bindRole(makeRole("independent-claude"));
  const observed = collect(session);
  try {
    await session.prompt("independent first task");
    const afterFirst = server.bodies.length;
    await session.prompt("independent second task");
    assert.equal(configurations.length, 2);
    assert.equal(configurations[0]!.effort, "low");
    assert.equal(configurations[1]!.effort, undefined);
    assert.equal(configurations[1]!.thinking, undefined);
    assert.equal(configurations[1]!.env?.CLAUDE_CODE_EFFORT_LEVEL, "unset");
    assert.equal(configurations[1]!.env?.CLAUDE_CODE_DISABLE_THINKING, "1");
    assert.ok(server.bodies.some(body => (body.output_config as { effort?: string })?.effort === "low"));
    const compatible = server.bodies.slice(afterFirst - 1);
    assert.ok(compatible.length >= 2);
    assert.ok(compatible.every(body => body.thinking === undefined && body.output_config === undefined));
    assert.ok(server.bodies.every(body => body.model === options.modelId));
    assert.equal(options.reasoningEffort, "low");
    assert.equal(JSON.stringify(savedEnvironment), snapshot);
    assert.deepEqual(server.errors, []);
    context.diagnostic(JSON.stringify({ runtime: "claude", wire: server.bodies.map(body => ({ model: body.model, thinking: body.thinking ?? null, outputConfig: body.output_config ?? null })), configurations: configurations.map(config => ({ effort: config.effort ?? null, effortEnv: config.env?.CLAUDE_CODE_EFFORT_LEVEL ?? null, thinkingEnv: config.env?.CLAUDE_CODE_DISABLE_THINKING ?? null })) }));
  } finally {
    await session.dispose(); await observed.done;
    await server.close(); await removeTempDirEventually(root);
  }
  assert.deepEqual(outcomes(observed.events), ["completed", "completed"]);
  assert.equal(states(observed.events, "trying").length, 1);
  assert.equal(states(observed.events, "compatible").length, 1);
});

test("独立真实 Codex：目录内 gpt-5.5 仅拒 effort 字段必须真正去参，同任务及下一轮完成", { timeout: 60000 }, async context => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-independent-codex-"));
  const server = await gateway((body, response) => {
    if ((body.reasoning as { effort?: unknown })?.effort !== undefined) rejectField(response, "reasoning.effort");
    else responsesAnswer(response, String(body.model));
  });
  const options = { runtime: "codex" as const, projectRoot: root, skillRoot: root, modelId: "gpt-5.5", baseUrl: `${server.baseUrl}/v1`, reasoningEffort: "high" as const, tools: [], interactionGate: createInteractionGate(), currentTurnId: () => "independent-codex", turnLastResortMs: 45000, constructTimeoutMs: 15000, env: { PATH: process.env.PATH, CODEX_API_KEY: FAKE_KEY } };
  const session = await createCodexRuntimeAdapter(options).bindRole(makeRole("independent-codex"));
  const observed = collect(session);
  try {
    await session.prompt("ordinary endpoint accepts a request without effort");
    await session.prompt("same configuration next task");
    assert.deepEqual(server.bodies.map(body => (body.reasoning as { effort?: string })?.effort), ["high", undefined, undefined]);
    assert.ok(server.bodies.every(body => body.model === "gpt-5.5"));
    assert.equal(options.reasoningEffort, "high");
    assert.deepEqual(server.errors, []);
  } finally {
    await session.dispose(); await observed.done;
    context.diagnostic(JSON.stringify({ runtime: "codex", wire: server.bodies.map(body => ({ model: body.model, reasoning: body.reasoning ?? null })), outcomes: outcomes(observed.events) }));
    await server.close(); await removeTempDirEventually(root);
  }
  assert.deepEqual(outcomes(observed.events), ["completed", "completed"]);
  assert.equal(states(observed.events, "trying").length, 1);
  assert.equal(states(observed.events, "completed").length, 1);
});

test("独立真实 Pi：工具完成后下一请求兼容保留 tool_result，工具与原生 prompt 各执行一次", { timeout: 30000 }, async context => {
  const pi = await import("@earendil-works/pi-coding-agent");
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-independent-pi-"));
  let toolCalls = 0;
  let promptCalls = 0;
  const server = await gateway((body, response, index) => {
    if (index === 0) anthropicAnswer(response, String(body.model), true);
    else if (body.thinking !== undefined) rejectField(response, "thinking");
    else anthropicAnswer(response, String(body.model));
  });
  const authName = "ANTHROPIC_AUTH_TOKEN";
  const previous = process.env[authName];
  process.env[authName] = FAKE_KEY;
  const session = await createRealPiRuntimeAdapter({
    runtime: "pi", projectRoot: root, skillRoot: root, reasoningEffort: "high", interactionGate: createInteractionGate(), currentTurnId: () => "independent-pi",
    config: { providerId: "independent-local", baseUrl: server.baseUrl, modelId: "independent-model", apiKeyEnvVar: authName, contextWindow: 131072, contextWindowSource: "explicit" },
    logger: { stage() {}, trace() {}, traceEnabled: false },
    tools: [{ name: "probe_once", description: "Only increments a local counter", inputSchema: { type: "object", properties: {} }, async handler() { toolCalls++; return { ok: true, message: "independent tool result sentinel" }; } }],
  }, { loadPi: async () => ({ ...pi, async createAgentSession(input) {
    const created = await pi.createAgentSession(input);
    const original = created.session.prompt.bind(created.session);
    created.session.prompt = async (...args) => { promptCalls++; return original(...args); };
    return created;
  } }) }).bindRole(makeRole("independent-pi"));
  const observed = collect(session);
  try {
    await session.prompt("call the local counter once then answer");
    assert.equal(toolCalls, 1);
    assert.equal(promptCalls, 1);
    assert.equal(server.bodies.length, 3);
    assert.deepEqual(server.bodies[1]!.messages, server.bodies[2]!.messages, "兼容请求保留相同 user/history/tool_result");
    assert.match(JSON.stringify(server.bodies[2]!.messages), /independent tool result sentinel/);
    assert.equal(server.bodies[2]!.thinking, undefined);
    assert.deepEqual(server.errors, []);
    context.diagnostic(JSON.stringify({ runtime: "pi", promptCalls, toolCalls, wire: server.bodies.map(body => ({ model: body.model, thinking: body.thinking ?? null, toolResultPresent: JSON.stringify(body.messages).includes("independent tool result sentinel") })) }));
  } finally {
    await session.dispose(); await observed.done;
    if (previous === undefined) delete process.env[authName]; else process.env[authName] = previous;
    await server.close(); await removeTempDirEventually(root);
  }
  assert.deepEqual(outcomes(observed.events), ["completed"]);
  assert.equal(states(observed.events, "compatibility-attempt").length, 1);
  assert.equal(states(observed.events, "compatibility-confirmed").length, 1);
});
