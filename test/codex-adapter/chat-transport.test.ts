// 最小 Chat Completions 兼容传输（2026-10-27 客户补充约束）契约测试。
// 本地假 Chat Completions 服务（localhost、假凭据、零外部调用）：文本轮次、工具循环、
// 工具结果同轮附图（tool 消息 content 数组 + image_url data URL）、失败/非法载荷 fail-closed、
// 用户图片、abort 回滚、redact、chat 模式配置回退与不支持能力 fail-closed。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { settings, chatCompletionsEndpoint } from "../../src/common/codex-adapter/config.ts";
import type { PromptImage, SessionEvent, ToolDefinition, ToolResult } from "../../src/model/runtime.ts";
import { role, harness, options, collect } from "./fixtures.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface ChatBody { model?: string; messages?: Array<Record<string, unknown>>; tools?: Array<Record<string, unknown>>; stream?: boolean }

async function withChat(
  handler: (body: ChatBody, index: number, response: ServerResponse) => void,
  run: (baseUrl: string, requests: ChatBody[]) => Promise<void>,
) {
  const requests: ChatBody[] = [];
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const part of request) raw += part;
    const body = JSON.parse(raw) as ChatBody;
    requests.push(body);
    handler(body, requests.length - 1, response);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}/v1`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function reply(response: ServerResponse, message: Record<string, unknown>) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion", choices: [{ index: 0, finish_reason: Array.isArray(message.tool_calls) ? "tool_calls" : "stop", message }] }));
}

async function bindChat(baseUrl: string, tools: ToolDefinition[], extra: Record<string, unknown> = {}) {
  return createCodexRuntimeAdapter(options("/fixture", harness(), {
    wireApi: "chat", baseUrl, modelId: "probe-model", tools, ...extra,
  })).bindRole(role);
}

const tool = (result: ToolResult, calls?: Array<Record<string, unknown>>): ToolDefinition => ({
  name: "probe", description: "fixture tool", inputSchema: { type: "object" },
  async handler(call) { calls?.push({ args: call.args, toolCallId: call.toolCallId }); return result; },
});

function messagesOf(body: ChatBody | undefined): Array<Record<string, unknown>> {
  assert.ok(body && Array.isArray(body.messages));
  return body.messages;
}

test("chat transport completes a plain text turn with system/user messages and exposed ans_ tools", async () => {
  await withChat((_body, _index, response) => reply(response, { role: "assistant", content: "hello from chat" }), async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, [tool({ ok: true, message: "unused" })]);
    const events = collect(session);
    await session.prompt("hi");
    await session.dispose();
    await events.done;
    assert.equal(requests.length, 1);
    const messages = messagesOf(requests[0]);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    assert.equal(messages[1]?.content, "hi");
    assert.equal(requests[0]?.model, "probe-model");
    assert.equal(requests[0]?.stream, false);
    const names = (requests[0]?.tools ?? []).map(entry => (entry.function as { name?: string } | undefined)?.name);
    assert.deepEqual(names, ["ans_probe"]);
    assert.ok(events.entries.some(event => event.kind === "message" && event.summary === "hello from chat"));
    assert.equal((events.entries.find(event => event.kind === "settled")?.detail as { outcome?: string }).outcome, "completed");
  });
});

test("chat transport executes tool calls, preserves reasoning_content and returns tool text", async () => {
  await withChat((body, index, response) => {
    if (index === 0) reply(response, { role: "assistant", content: null, reasoning_content: "reasoning-sentinel", tool_calls: [{ id: "call_fixture", type: "function", function: { name: "ans_probe", arguments: "{\"value\":7}" } }] });
    else reply(response, { role: "assistant", content: "final after tool" });
  }, async (baseUrl, requests) => {
    const calls: Array<Record<string, unknown>> = [];
    const session = await bindChat(baseUrl, [tool({ ok: true, message: "tool says hi" }, calls)]);
    const events = collect(session);
    await session.prompt("use the tool");
    await session.dispose();
    await events.done;
    assert.deepEqual(calls, [{ args: { value: 7 }, toolCallId: "call_fixture" }]);
    assert.equal(requests.length, 2);
    const messages = messagesOf(requests[1]);
    const assistant = messages.find(message => message.role === "assistant" && Array.isArray(message.tool_calls));
    assert.equal(assistant?.reasoning_content, "reasoning-sentinel");
    const toolMessage = messages.find(message => message.role === "tool");
    assert.equal(toolMessage?.tool_call_id, "call_fixture");
    assert.equal(toolMessage?.content, "tool says hi");
    assert.ok(events.entries.some(event => event.kind === "tool_call"));
    assert.ok(events.entries.some(event => event.kind === "accepted" && event.summary === "tool says hi"));
    assert.equal((events.entries.at(-1)?.detail as { outcome?: string }).outcome, "completed");
  });
});

test("chat transport maps same-turn tool result images to tool-message image_url data URLs", async () => {
  await withChat((_body, index, response) => {
    if (index === 0) reply(response, { role: "assistant", content: null, tool_calls: [{ id: "call_image", type: "function", function: { name: "ans_probe", arguments: "{}" } }] });
    else reply(response, { role: "assistant", content: "saw image" });
  }, async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, [tool({ ok: true, message: "attached", images: [{ type: "image", mimeType: "image/png", data: PNG }] })]);
    const events = collect(session);
    await session.prompt("look");
    await session.dispose();
    await events.done;
    const toolMessage = messagesOf(requests[1]).find(message => message.role === "tool");
    assert.deepEqual(toolMessage?.content, [
      { type: "text", text: "attached" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
    ]);
    // 图片字节绝不进入事件/诊断文本。
    assert.equal(JSON.stringify(events.entries).includes(PNG), false);
    assert.equal(JSON.stringify(events.entries).includes("data:image"), false);
  });
});

test("chat transport never attaches images for failed or invalid tool results", async () => {
  for (const [name, result, note] of [
    ["failed", { ok: false, message: "refused", images: [{ type: "image", mimeType: "image/png", data: PNG }] }, false],
    ["invalid-mime", { ok: true, message: "claimed", images: [{ type: "image", mimeType: "image/svg+xml", data: PNG }] }, true],
  ] as const) {
    await withChat((_body, index, response) => {
      if (index === 0) reply(response, { role: "assistant", content: null, tool_calls: [{ id: `call_${name}`, type: "function", function: { name: "ans_probe", arguments: "{}" } }] });
      else reply(response, { role: "assistant", content: "done" });
    }, async (baseUrl, requests) => {
      const session = await bindChat(baseUrl, [tool(result as ToolResult)]);
      const events = collect(session);
      await session.prompt("look");
      await session.dispose();
      await events.done;
      const toolMessage = messagesOf(requests[1]).find(message => message.role === "tool");
      assert.equal(typeof toolMessage?.content, "string", name);
      assert.equal(String(toolMessage?.content).includes("image_url"), false, name);
      assert.equal(messagesOf(requests[1]).some(message => Array.isArray(message.content)), false, name);
      if (note) assert.match(String(toolMessage?.content), /未向模型提供任何图片/, name);
    });
  }
});

test("chat transport sends user prompt images as user content image_url parts", async () => {
  await withChat((_body, _index, response) => reply(response, { role: "assistant", content: "ok" }), async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, []);
    const events = collect(session);
    await session.prompt("see this", { images: [{ type: "image", mimeType: "image/jpeg", data: "AAAAAQ==" }] });
    await session.dispose();
    await events.done;
    const user = messagesOf(requests[0]).find(message => message.role === "user");
    assert.deepEqual(user?.content, [
      { type: "text", text: "see this" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAAAQ==" } },
    ]);
  });
});

test("chat transport abort settles the turn and rolls back partial history", async () => {
  const held: ServerResponse[] = [];
  await withChat((_body, index, response) => {
    if (index === 0) { held.push(response); return; }
    reply(response, { role: "assistant", content: "after abort" });
  }, async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, []);
    const events = collect(session);
    const pending = session.prompt("hold");
    while (held.length === 0) await new Promise<void>(resolve => setImmediate(resolve));
    await session.abort!();
    await pending;
    await session.prompt("next");
    await session.dispose();
    await events.done;
    assert.equal((events.entries.find(event => event.kind === "settled")?.detail as { outcome?: string }).outcome, "aborted");
    assert.equal(requests.length, 2);
    const messages = messagesOf(requests[1]);
    // 被中止的 "hold" 轮已回滚；下一次请求只含 system + 新 user。
    assert.deepEqual(messages.map(message => message.role), ["system", "user"]);
    assert.equal(messages[1]?.content, "next");
  });
});

test("chat transport redacts tool text but never image bytes", async () => {
  const secret = "QUJDREVG";
  const data = `${secret}QUJD`;
  await withChat((_body, index, response) => {
    if (index === 0) reply(response, { role: "assistant", content: null, tool_calls: [{ id: "call_secret", type: "function", function: { name: "ans_probe", arguments: "{}" } }] });
    else reply(response, { role: "assistant", content: "done" });
  }, async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, [tool({ ok: true, message: `attached ${secret}`, images: [{ type: "image", mimeType: "image/png", data }] })], {
      env: { CODEX_API_KEY: secret, PATH: process.env.PATH },
    });
    const events = collect(session);
    await session.prompt("secret");
    await session.dispose();
    await events.done;
    const toolMessage = messagesOf(requests[1]).find(message => message.role === "tool");
    const parts = toolMessage?.content as Array<{ type: string; text?: string; image_url?: { url?: string } }>;
    assert.equal(parts[0]?.text, "attached [REDACTED]");
    assert.equal(parts[1]?.image_url?.url, `data:image/png;base64,${data}`);
    assert.equal(JSON.stringify(events.entries).includes(secret), false);
    assert.equal(JSON.stringify(events.entries).includes(data), false);
  });
});

test("chat mode fails closed for installed MCP servers and server-side web search", async () => {
  await assert.rejects(createCodexRuntimeAdapter(options("/fixture", harness(), {
    wireApi: "chat", baseUrl: "http://127.0.0.1:1/v1", modelId: "probe-model",
    installedMcpServers: [{ name: "fixture", command: process.execPath, args: [] }],
  })).bindRole(role), /does not support installed MCP servers/);
  await assert.rejects(createCodexRuntimeAdapter(options("/fixture", harness(), {
    wireApi: "chat", baseUrl: "http://127.0.0.1:1/v1", modelId: "probe-model", webSearch: true,
  })).bindRole(role), /does not support server-side web search/);
});

test("chat mode requires explicit Codex/OpenAI config and never auto-reads Pi env", () => {
  // 客户 2026-10-27 裁定：Pi 只能作临时测试配置；产品路径不得自动回退 Pi。
  const piEnv = { ANS_PI_BASE_URL: "https://pi.example/deepseek", ANS_PI_MODEL: "pi-model", ANTHROPIC_AUTH_TOKEN: "pi-token", PATH: process.env.PATH };
  assert.throws(() => settings({ runtime: "codex", wireApi: "chat" } as Parameters<typeof settings>[0], piEnv), /Codex requires ANS_CODEX_MODEL or modelId/);
  assert.throws(() => settings({ runtime: "codex", wireApi: "chat", modelId: "explicit-model" } as Parameters<typeof settings>[0], piEnv), /Codex requires an API key/);
  // 显式 Codex 配置正常；base 未给时走官方默认，而不是 Pi 基址。
  const codex = settings({ runtime: "codex", wireApi: "chat" } as Parameters<typeof settings>[0], { ...piEnv, ANS_CODEX_MODEL: "explicit-model", CODEX_API_KEY: "codex-key" });
  assert.equal(codex.model, "explicit-model");
  assert.equal(codex.keyName, "CODEX_API_KEY");
  assert.equal(codex.baseUrl, "https://api.openai.com/v1");
  assert.equal(codex.wireApi, "chat");
  // 临时测试可显式注入 Pi 基址/模型/凭据（不再经产品自动回退）。
  const injected = settings({ runtime: "codex", wireApi: "chat", modelId: "probe-model", baseUrl: piEnv.ANS_PI_BASE_URL, apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN" } as Parameters<typeof settings>[0], piEnv);
  assert.equal(injected.model, "probe-model");
  assert.equal(injected.baseUrl, "https://pi.example/deepseek");
  assert.equal(injected.keyName, "ANTHROPIC_AUTH_TOKEN");
  assert.equal(injected.wireApi, "chat");
  assert.equal(chatCompletionsEndpoint(injected.baseUrl), "https://pi.example/deepseek/v1/chat/completions");
  assert.equal(chatCompletionsEndpoint("https://api.openai.com/v1"), "https://api.openai.com/v1/chat/completions");
  assert.equal(chatCompletionsEndpoint("https://gateway.example/v1/chat/completions"), "https://gateway.example/v1/chat/completions");
});
