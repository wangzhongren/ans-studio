import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, access, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { toClaudeSchema } from "../../src/common/claude-adapter/schema.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, ToolDefinition, SessionEvent, WriteGate } from "../../src/model/runtime.ts";

const role: ResolvedRole = { id: "claude-fixture", kind: "project", cardText: "# Claude fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
const allow: WriteGate = (path) => ({ allowed: true, matchedEntry: { kind: "file", root: "project", path, purpose: "fixture" } });
const deny: WriteGate = () => ({ allowed: false, reason: "outside fixture scope", allowedByRoot: { project: [], skill: [] } });
const gate = (): InteractionGate => {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const emit = () => { for (const listener of listeners) listener(waiting > 0); };
  return { begin() { waiting++; emit(); }, end() { waiting--; emit(); }, isWaiting: () => waiting > 0, onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
};
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret", CODEX_API_KEY: "fixture-codex-secret", CLAUDE_CODE_OAUTH_TOKEN: "fixture-oauth-secret", ANTHROPIC_AUTH_TOKEN: "fixture-auth-secret", CLAUDE_CODE_USE_BEDROCK: "1" };
type Script = (client: Client, options: Options, user: SDKUserMessage, queryIndex: number, rawCall: Client["callTool"]) => Promise<{ fail?: boolean; id?: string } | void>;

/** A real MCP Client/Server pair drives production registration, parsing and handlers; only query is fake. */
function fake(script: Script) {
  const configurations: Options[] = [];
  const users: SDKUserMessage[] = [];
  let loadCount = 0;
  let interrupts = 0;
  let closes = 0;
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const opts = options!;
    const queryIndex = configurations.push(opts) - 1;
    const client = new Client({ name: "claude-fixture", version: "1.0.0" });
    const server = opts.mcpServers!.ans;
    assert.equal(server.type, "sdk");
    const actualCallTool = client.callTool.bind(client);
    let nativePromptId: string | undefined;
    client.callTool = async (params, resultSchema, requestOptions) => {
      const toolUseId = randomUUID();
      const hook = opts.hooks!.PreToolUse![0]!.hooks[0]!;
      const result = await hook({ hook_event_name: "PreToolUse", prompt_id: nativePromptId, tool_name: `mcp__ans__${params.name}`, tool_input: params.arguments ?? {}, tool_use_id: toolUseId, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd!, mcp_server: { name: "ans", source: "sdk" } }, toolUseId, { signal: requestOptions?.signal ?? opts.abortController!.signal });
      const output = result as { hookSpecificOutput?: { permissionDecision?: string; updatedInput?: Record<string, unknown> } };
      if (output.hookSpecificOutput?.permissionDecision === "deny") return { content: [{ type: "text", text: "fixture hook denied" }], isError: true };
      return actualCallTool({ ...params, arguments: output.hookSpecificOutput?.updatedInput ?? params.arguments }, resultSchema, { ...requestOptions, timeout: server.timeout });
    };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = (async () => {
      if (server.type !== "sdk") throw new Error("wrong MCP config");
      await server.instance.connect(serverTransport);
      await client.connect(clientTransport);
    })();
    const nativeId = opts.resume ?? randomUUID();
    let closed = false;
    const generator = (async function* () {
      await connected;
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        users.push(user);
        nativePromptId = user.uuid;
        const promptText = typeof user.message.content === "string" ? user.message.content : user.message.content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await opts.hooks!.UserPromptSubmit![0]!.hooks[0]!({ hook_event_name: "UserPromptSubmit", prompt_id: nativePromptId, prompt: promptText, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd! }, undefined, { signal: opts.abortController!.signal });
        const result = await script(client, opts, user, queryIndex, (params, schema, requestOptions) => actualCallTool(params, schema, { ...requestOptions, timeout: server.timeout }));
        if (closed) break;
        yield { type: "result", subtype: result?.fail ? "error_during_execution" : "success", is_error: !!result?.fail, session_id: result?.id ?? nativeId, user_message_uuid: user.uuid } as SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() { interrupts++; },
      close() { closed = true; closes++; void connected.then(() => client.close()).catch(() => {}); },
    }) as unknown as Query;
  };
  return {
    configurations, users, get loadCount() { return loadCount; }, get interrupts() { return interrupts; }, get closes() { return closes; },
    dependencies: { env: environment, loadSdk: async () => { loadCount++; return { createSdkMcpServer, query }; }, loadZod: async () => z },
  };
}
const options = (root: string, tools: readonly ToolDefinition[], interactionGate = gate()): RuntimeProviderOptions => ({ runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate, currentTurnId: () => undefined, promptTimeoutMs: 1000 });
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-claude-test-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function collect(session: { events(): AsyncIterable<SessionEvent> }, until: number) {
  const output: SessionEvent[] = [];
  for await (const event of session.events()) { output.push(event); if (output.filter((row) => row.kind === "settled").length === until) return output; }
  return output;
}

test("SDK stays lazy through composition/bind; actual MCP schema/options isolate all native abilities and credentials", async () => fixture(async (root) => {
  const engine = fake(async (client, config, user) => {
    const listed = await client.listTools();
    const write = listed.tools.find((tool) => tool.name === "write_file")!;
    assert.deepEqual(write.inputSchema.required, ["path", "content"]);
    // MCP's JSON Schema encoder represents allow-anything as {}, equivalent to true.
    assert.deepEqual(write.inputSchema.additionalProperties, {});
    assert.deepEqual(config.tools, []);
    assert.deepEqual(config.settingSources, []);
    assert.equal(config.strictMcpConfig, true);
    assert.deepEqual(config.skills, []);
    assert.deepEqual(config.plugins, []);
    assert.deepEqual(config.extraArgs, { "disable-slash-commands": null });
    assert.deepEqual(config.settings, { disableAllHooks: true });
    assert.equal(config.persistSession, false);
    assert.equal(config.mcpServers!.ans.timeout, 2_147_483_647);
    assert.equal(config.env!.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS, "0");
    for (const key of ["CODEX_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK"]) assert.equal(config.env![key], undefined);
    assert.equal(config.env!.ANTHROPIC_API_KEY, environment.ANTHROPIC_API_KEY);
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const result = await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {}, tool_use_id: "x", session_id: "x", transcript_path: "x", cwd: root }, "x", { signal: new AbortController().signal });
    assert.equal((result as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
    const legitimate = { hook_event_name: "PreToolUse" as const, prompt_id: user.uuid, tool_name: "mcp__ans__write_file", tool_input: {}, tool_use_id: "x", session_id: "x", transcript_path: "x", cwd: root, mcp_server: { name: "ans", source: "sdk" as const } };
    const legitimateResult = await hook(legitimate, "x", { signal: new AbortController().signal }) as { hookSpecificOutput: { updatedInput: Record<string, unknown> } };
    assert.equal(typeof legitimateResult.hookSpecificOutput.updatedInput.__ans_call_context, "string");
    const forged = await hook({ ...legitimate, mcp_server: { name: "ans", source: "managed" } }, "x", { signal: new AbortController().signal });
    assert.equal((forged as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
    const permission = await config.canUseTool!("mcp__foreign__write", {}, { signal: new AbortController().signal, toolUseID: "foreign", requestId: "foreign" });
    assert.equal(permission?.behavior, "deny");
  });
  const adapter = createClaudeRuntimeAdapter(options(root, buildGovernedTools(deny)), engine.dependencies);
  await adapter.composeContext(role);
  const session = await adapter.bindRole(role);
  assert.equal(engine.loadCount, 0);
  await session.prompt("inspect");
  const nativeDirectory = engine.configurations[0]!.env!.CLAUDE_CONFIG_DIR!;
  assert.equal(engine.loadCount, 1);
  await assert.rejects(access(join(root, ".ans")));
  await session.dispose();
  await assert.rejects(access(nativeDirectory));
}));

test("schema preserves required/optional/union/nested object and rejects unsupported keywords", () => {
  const schema = toClaudeSchema({ type: "object", properties: { value: { anyOf: [{ type: "string" }, { type: "number" }] }, maybe: { type: "boolean" }, nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } }, required: ["value"], additionalProperties: true }, z);
  assert.equal(schema.safeParse({ value: 2, extension: "kept" }).success, true);
  assert.deepEqual(schema.parse({ value: 2, extension: "kept" }), { value: 2, extension: "kept" });
  assert.equal(schema.safeParse({ value: "x", nested: { id: "y" } }).success, true);
  assert.equal(schema.safeParse({ maybe: true }).success, false);
  assert.equal(schema.safeParse({ value: true }).success, false);
  assert.equal(schema.safeParse({ value: 1, nested: {} }).success, false);
  assert.equal(schema.safeParse({ value: 1, maybe: "bad" }).success, false);
  assert.throws(() => toClaudeSchema({ type: "object", patternProperties: {} }, z), /unsupported/);
  assert.throws(() => toClaudeSchema({ type: "object", required: ["unknown"] }, z), /required/);
  assert.throws(() => toClaudeSchema({ type: "object", properties: { invalid: { type: "unsupported-type" } } }, z), /unsupported JSON Schema type/);
});

test("actual MCP exposes union and nested required schema without losing optional/extra parameters", async () => fixture(async (root) => {
  let input: Record<string, unknown> | undefined;
  const tool: ToolDefinition = { name: "schema_probe", description: "fixture", inputSchema: { type: "object", properties: { value: { anyOf: [{ type: "string" }, { type: "number" }] }, optional: { type: "boolean" }, nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } }, required: ["value"], additionalProperties: true }, handler: async (call) => { input = call.args; return { ok: true, message: "probe" }; } };
  const engine = fake(async (client) => {
    const schema = (await client.listTools()).tools[0]!.inputSchema;
    assert.deepEqual(schema.required, ["value"]);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    // Actual SDK MCP encoder normalizes this disjoint union to JSON Schema's type array.
    assert.deepEqual(properties.value!.type, ["string", "number"]);
    assert.deepEqual(properties.nested!.required, ["id"]);
    assert.equal((await client.callTool({ name: "schema_probe", arguments: { value: true } })).isError, true);
    assert.equal((await client.callTool({ name: "schema_probe", arguments: { value: 1, nested: {} } })).isError, true);
    assert.equal((await client.callTool({ name: "schema_probe", arguments: { value: "text", extra: "retained" } })).isError, false);
  });
  const session = await createClaudeRuntimeAdapter(options(root, [tool]), engine.dependencies).bindRole(role);
  await session.prompt("probe schema");
  assert.deepEqual(input, { value: "text", extra: "retained" });
  await session.dispose();
}));

test("late old MCP callback after next prompt, replay/missing/unknown nonce all fail before effects", async () => fixture(async (root) => {
  let oldArguments: Record<string, unknown> | undefined;
  let oldPromptId: string | undefined;
  let index = 0;
  const engine = fake(async (client, config, user, _queryIndex, rawCall) => {
    if (index++ === 0) {
      const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
      oldPromptId = user.uuid;
      const original = await hook({ hook_event_name: "PreToolUse", prompt_id: oldPromptId, tool_name: "mcp__ans__write_file", tool_input: { path: "late.txt", content: "old request", __ans_call_context: "model-supplied-value" }, tool_use_id: "native-original-id", session_id: "fixture", transcript_path: "fixture", cwd: root, mcp_server: { name: "ans", source: "sdk" } }, "native-original-id", { signal: new AbortController().signal });
      oldArguments = (original as { hookSpecificOutput: { updatedInput: Record<string, unknown> } }).hookSpecificOutput.updatedInput;
      assert.notEqual(oldArguments.__ans_call_context, "model-supplied-value");
      return;
    }
    const lateHook = await config.hooks!.PreToolUse![0]!.hooks[0]!({ hook_event_name: "PreToolUse", prompt_id: oldPromptId, tool_name: "mcp__ans__write_file", tool_input: { path: "late-hook.txt", content: "old request" }, tool_use_id: "native-late-id", session_id: "fixture", transcript_path: "fixture", cwd: root, mcp_server: { name: "ans", source: "sdk" } }, "native-late-id", { signal: new AbortController().signal });
    assert.equal((lateHook as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
    assert.equal((await rawCall({ name: "write_file", arguments: oldArguments! })).isError, true);
    assert.equal((await rawCall({ name: "write_file", arguments: oldArguments! })).isError, true);
    assert.equal((await rawCall({ name: "write_file", arguments: { path: "missing.txt", content: "never" } })).isError, true);
    assert.equal((await rawCall({ name: "write_file", arguments: { path: "unknown.txt", content: "never", __ans_call_context: "unknown" } })).isError, true);
    assert.equal((await client.callTool({ name: "write_file", arguments: { path: "new.txt", content: "new turn" } })).isError, false);
  });
  const session = await createClaudeRuntimeAdapter(options(root, buildGovernedTools(allow, { writeRoot: root })), engine.dependencies).bindRole(role);
  await session.prompt("mint old request context but delay actual MCP arrival");
  await session.prompt("new explicit turn");
  for (const name of ["late.txt", "missing.txt", "unknown.txt"]) await assert.rejects(access(join(root, name)));
  assert.equal(await readFile(join(root, "new.txt"), "utf8"), "new turn");
  await session.dispose();
}));

test("reserved context supports additionalProperties false, never reaches core, and schema collision rejects", async () => fixture(async (root) => {
  let calls = 0;
  const schema = { type: "object", properties: { required: { type: "string" } }, required: ["required"], additionalProperties: false };
  const tool: ToolDefinition = { name: "strict_input", description: "fixture", inputSchema: schema, handler: async (call) => { assert.deepEqual(call.args, { required: "value" }); calls++; return { ok: true, message: "good" }; } };
  const engine = fake(async (client) => {
    const emitted = (await client.listTools()).tools[0]!.inputSchema;
    assert.equal(emitted.additionalProperties, false);
    assert.deepEqual(emitted.required, ["required"]);
    const result = await client.callTool({ name: "strict_input", arguments: { required: "value", __ans_call_context: "forged-model-token" } });
    assert.equal(result.isError, false);
    assert.equal((await client.callTool({ name: "strict_input", arguments: { required: "value", extra: true } })).isError, true);
  });
  const session = await createClaudeRuntimeAdapter(options(root, [tool]), engine.dependencies).bindRole(role);
  await session.prompt("strict schema");
  assert.equal(calls, 1);
  assert.deepEqual(tool.inputSchema, schema);
  await session.dispose();
  const colliding = { ...tool, inputSchema: { ...schema, properties: { ...schema.properties, __ans_call_context: { type: "string" } } } };
  const collision = await createClaudeRuntimeAdapter(options(root, [colliding]), engine.dependencies).bindRole(role);
  await assert.rejects(collision.prompt("reserved field"), /保留/);
  await collision.dispose();
}));

test("same text twice has unique wire identity; old/unknown/missing/duplicate UserPromptSubmit cannot borrow next turn", async () => fixture(async (root) => {
  let originalPrompt = "";
  let index = 0;
  let callCount = 0;
  const tool: ToolDefinition = { name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => { callCount++; return { ok: true, message: "done" }; } };
  const engine = fake(async (client, config, user) => {
    const wireText = user.message.content as string;
    assert.match(wireText, new RegExp(`^\\[ANS_INPUT_CONTEXT:${user.uuid}\\]\\n`));
    if (index++ === 0) { originalPrompt = wireText; return; }
    assert.notEqual(wireText, originalPrompt);
    assert.equal(wireText.split("\n").slice(1).join("\n"), "same customer text");
    const hook = config.hooks!.UserPromptSubmit![0]!.hooks[0]!;
    for (const prompt of [originalPrompt, "same customer text", `[ANS_INPUT_CONTEXT:${randomUUID()}]\nsame customer text`, wireText]) {
      const result = await hook({ hook_event_name: "UserPromptSubmit", prompt_id: randomUUID(), prompt, session_id: "fixture", transcript_path: "fixture", cwd: root }, undefined, { signal: new AbortController().signal });
      assert.equal((result as { decision: string }).decision, "block");
    }
    assert.equal((await client.callTool({ name: "probe", arguments: {} })).isError, false);
  });
  const session = await createClaudeRuntimeAdapter(options(root, [tool]), engine.dependencies).bindRole(role);
  await session.prompt("same customer text");
  await session.prompt("same customer text");
  assert.equal(callCount, 1);
  await session.dispose();
}));

test("auth/endpoint/model and redaction share construction-time env snapshot", async () => fixture(async (root) => {
  const supplied = { ...environment, ANS_CLAUDE_MODEL: "original-model", ANTHROPIC_BASE_URL: "https://original.example.test" };
  const engine = fake(async (client, config) => {
    assert.equal(config.env!.ANTHROPIC_API_KEY, "fixture-api-secret");
    assert.equal(config.env!.ANTHROPIC_BASE_URL, "https://original.example.test");
    assert.equal(config.model, "original-model");
    assert.equal(JSON.stringify(await client.callTool({ name: "probe", arguments: {} })).includes("fixture-api-secret"), false);
  });
  const adapter = createClaudeRuntimeAdapter(options(root, [{ name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "fixture-api-secret" }) }]), { ...engine.dependencies, env: supplied });
  supplied.ANTHROPIC_API_KEY = "new-profile-key";
  supplied.ANS_CLAUDE_MODEL = "new-model";
  supplied.ANTHROPIC_BASE_URL = "https://new.example.test";
  const session = await adapter.bindRole(role);
  await session.prompt("saved profile changed after adapter creation");
  await session.dispose();
}));

test("private wire marker echoed by tool/error never leaks into public events or messages", async () => fixture(async (root) => {
  let echoed = "";
  const engine = fake(async (client, _config, user) => {
    echoed = user.message.content as string;
    const result = await client.callTool({ name: "echo", arguments: {} });
    assert.equal(JSON.stringify(result).includes("ANS_INPUT_CONTEXT"), false);
    assert.match(JSON.stringify(result), /customer text/);
  });
  const session = await createClaudeRuntimeAdapter(options(root, [{ name: "echo", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: echoed }) }]), engine.dependencies).bindRole(role);
  const read = collect(session, 1);
  await session.prompt("customer text");
  assert.equal(JSON.stringify(await read).includes("ANS_INPUT_CONTEXT"), false);
  await session.dispose();
  const failing = fake(async (_client, _config, user) => { throw new Error(user.message.content as string); });
  const failure = await createClaudeRuntimeAdapter(options(root, []), failing.dependencies).bindRole(role);
  await assert.rejects(failure.prompt("customer error text"), (error: Error) => !error.message.includes("ANS_INPUT_CONTEXT") && error.message.includes("customer error text"));
  await failure.dispose();
}));

test("missing dependency/API key and URL userinfo fail before query, explicit settings map to actual SDK options", async () => fixture(async (root) => {
  const engine = fake(async () => {});
  const missing = await createClaudeRuntimeAdapter(options(root, []), { ...engine.dependencies, env: { CLAUDE_CODE_OAUTH_TOKEN: "subscription-only" } }).bindRole(role);
  await assert.rejects(missing.prompt("requires API key"), /缺少 API key/);
  assert.equal(engine.configurations.length, 0);
  await missing.dispose();
  const dependency = await createClaudeRuntimeAdapter(options(root, []), { ...engine.dependencies, loadSdk: async () => { throw new Error("missing dependency fixture-api-secret"); } }).bindRole(role);
  await assert.rejects(dependency.prompt("missing SDK"), (error: Error) => error.message.includes("missing dependency") && !error.message.includes("fixture-api-secret"));
  await dependency.dispose();
  const userinfo = await createClaudeRuntimeAdapter({ ...options(root, []), baseUrl: "https://user:password@example.test" }, engine.dependencies).bindRole(role);
  await assert.rejects(userinfo.prompt("bad endpoint"), (error: Error) => error.message.includes("用户名或密码") && !error.message.includes("password"));
  await userinfo.dispose();
  const configured = fake(async (_client, config) => {
    assert.equal(config.model, "fixture-model");
    assert.equal(config.env!.ANTHROPIC_BASE_URL, "https://endpoint.example.test");
    assert.equal(config.env!.ANTHROPIC_API_KEY, "explicit-mapped-key");
  });
  const valid = await createClaudeRuntimeAdapter({ ...options(root, []), modelId: "fixture-model", apiKeyEnvVar: "ANS_TEST_KEY", baseUrl: "https://endpoint.example.test" }, { ...configured.dependencies, env: { ...environment, ANS_TEST_KEY: "explicit-mapped-key" } }).bindRole(role);
  await valid.prompt("mapped key");
  await valid.dispose();
}));

test("actual shell tool deny prevents marker and allow returns actual command output", async () => fixture(async (root) => {
  const engine = fake(async (client) => {
    const result = await client.callTool({ name: "run_shell", arguments: { command: "printf bad > shell-marker.txt" } });
    assert.equal(result.isError, true);
  });
  const session = await createClaudeRuntimeAdapter(options(root, buildGovernedTools(allow, { shellCwd: root, shellGate: async () => ({ allow: false, by: "fixture", reason: "fixture denied" }) })), engine.dependencies).bindRole(role);
  await session.prompt("shell denied");
  await assert.rejects(access(join(root, "shell-marker.txt")));
  await session.dispose();
  const allowed = fake(async (client) => {
    const result = await client.callTool({ name: "run_shell", arguments: { command: "printf fixture-shell-output" } });
    assert.equal(result.isError, false);
    assert.match(JSON.stringify(result), /fixture-shell-output/);
  });
  const permitted = await createClaudeRuntimeAdapter(options(root, buildGovernedTools(allow, { shellCwd: root, shellGate: async () => ({ allow: true, by: "fixture" }) })), allowed.dependencies).bindRole(role);
  await permitted.prompt("shell allowed");
  await permitted.dispose();
}));

test("real MCP rejects missing write arguments, gate denial and gate throw produce zero effects", async () => fixture(async (root) => {
  for (const writeGate of [deny, (() => { throw new Error("fixture-api-secret"); }) as WriteGate]) {
    const engine = fake(async (client) => {
      const invalid = await client.callTool({ name: "write_file", arguments: { path: "outside/file.txt" } });
      assert.equal(invalid.isError, true);
      const denied = await client.callTool({ name: "write_file", arguments: { path: "outside/file.txt", content: "content" } });
      assert.equal(denied.isError, true);
      assert.equal(JSON.stringify(denied).includes("fixture-api-secret"), false);
    });
    const session = await createClaudeRuntimeAdapter(options(root, buildGovernedTools(writeGate, { writeRoot: root })), engine.dependencies).bindRole(role);
    await session.prompt("write denied");
    await session.dispose();
    await assert.rejects(access(join(root, "outside")));
  }
}));

test("actual write/edit MCP handlers execute in call order even concurrent transport calls", async () => fixture(async (root) => {
  const engine = fake(async (client) => {
    const [written, edited] = await Promise.all([
      client.callTool({ name: "write_file", arguments: { path: "owned.txt", content: "old" } }),
      client.callTool({ name: "edit_file", arguments: { path: "owned.txt", old_string: "old", new_string: "new" } }),
    ]);
    assert.equal(written.isError, false); assert.equal(edited.isError, false);
  });
  const session = await createClaudeRuntimeAdapter(options(root, buildGovernedTools(allow, { writeRoot: root })), engine.dependencies).bindRole(role);
  await session.prompt("write then edit");
  assert.equal(await readFile(join(root, "owned.txt"), "utf8"), "new");
  await session.dispose();
}));

test("multiple input turns retain the same query and map images; exactly one settled has each turnId", async () => fixture(async (root) => {
  const engine = fake(async () => {});
  const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
  const read = collect(session, 2);
  await session.prompt("one");
  const nativeId = session.nativeSessionId;
  await session.prompt("two", { images: [{ type: "image", mimeType: "image/png", data: "ZmFrZQ==" }] });
  assert.equal(engine.configurations.length, 1);
  assert.equal(session.nativeSessionId, nativeId);
  assert.equal(session.contextSource, "in-memory");
  assert.equal(engine.users.length, 2);
  assert.equal((engine.users[1]!.message.content as Array<{ type: string }>)[1]!.type, "image");
  const results = (await read).filter((event) => event.kind === "settled");
  assert.equal(results.length, 2);
  assert.notEqual(results[0]!.turnId, results[1]!.turnId);
  for (const row of results) assert.deepEqual(row.detail, { outcome: "completed", turnId: row.turnId });
  await session.dispose();
}));

test("SDK/result errors and handler exceptions redact secrets and fail honestly", async () => fixture(async (root) => {
  const tool: ToolDefinition = { name: "explode", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => { throw new Error("fixture-api-secret fixture-codex-secret"); } };
  const engine = fake(async (client) => {
    const result = await client.callTool({ name: "explode", arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result).includes("fixture-api-secret"), false);
    return { fail: true };
  });
  const session = await createClaudeRuntimeAdapter(options(root, [tool]), engine.dependencies).bindRole(role);
  const read = collect(session, 1);
  await assert.rejects(session.prompt("fail"), /失败/);
  const result = await read;
  assert.equal(JSON.stringify(result).includes("fixture-api-secret"), false);
  assert.equal((result.at(-1)!.detail as { outcome: string }).outcome, "failed");
  await session.dispose();
}));

test("InteractionGate pauses deadline; answer returns and sequential write waits behind confirmation", async () => fixture(async (root) => {
  const interactionGate = gate();
  let answer!: (value: { outcome: "answered"; value: { confirmed: boolean } }) => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  const tools = buildGovernedTools(allow, { writeRoot: root, interactionGate, customerInput: () => { entered(); return new Promise((resolve) => { answer = resolve; }); } });
  const engine = fake(async (client) => {
    const confirmation = client.callTool({ name: "request_confirmation", arguments: { title: "confirm" } });
    const write = client.callTool({ name: "write_file", arguments: { path: "after.txt", content: "yes" } });
    await Promise.all([confirmation, write]);
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, tools, interactionGate), promptTimeoutMs: 50 }, engine.dependencies).bindRole(role);
  const prompt = session.prompt("confirm then write");
  await waiting;
  await delay(100);
  await assert.rejects(access(join(root, "after.txt")));
  answer({ outcome: "answered", value: { confirmed: true } });
  await prompt;
  assert.equal(await readFile(join(root, "after.txt"), "utf8"), "yes");
  await session.dispose();
}));

test("stop pending confirmation cancels queued write and late answer cannot report/effect in a new turn", async () => fixture(async (root) => {
  const interactionGate = gate();
  let answer!: (value: { outcome: "answered"; value: { confirmed: boolean } }) => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  let reports = 0;
  const tools = buildGovernedTools(allow, { writeRoot: root, interactionGate, customerInput: () => { entered(); return new Promise((resolve) => { answer = resolve; }); }, reportHandback: () => { reports++; return { ok: true }; } });
  const engine = fake(async (client, _config, _user, index) => {
    if (index !== 0) return;
    await Promise.all([
      client.callTool({ name: "request_confirmation", arguments: { title: "confirm" } }),
      client.callTool({ name: "write_file", arguments: { path: "late.txt", content: "never" } }),
      client.callTool({ name: "submit_report", arguments: { status: "completed", summary: "never" } }),
    ]);
  });
  const session = await createClaudeRuntimeAdapter(options(root, tools, interactionGate), engine.dependencies).bindRole(role);
  const read = collect(session, 2);
  const prompt = session.prompt("wait");
  const rejected = assert.rejects(prompt, { name: "AbortError" });
  await waiting;
  await session.abort!();
  await rejected;
  await session.prompt("next explicit input");
  answer({ outcome: "answered", value: { confirmed: true } });
  await delay(30);
  assert.equal(reports, 0);
  await assert.rejects(access(join(root, "late.txt")));
  assert.equal(engine.interrupts, 1);
  const rows = (await read).filter((event) => event.kind === "settled");
  assert.equal((rows[0]!.detail as { outcome: string }).outcome, "aborted");
  assert.equal((rows[1]!.detail as { outcome: string }).outcome, "completed");
  await session.dispose();
}));

test("active prompt deadline emits timed_out once and disposal closes event stream", async () => fixture(async (root) => {
  const engine = fake(async () => { await delay(60); });
  const session = await createClaudeRuntimeAdapter({ ...options(root, []), promptTimeoutMs: 15 }, engine.dependencies).bindRole(role);
  const read = collect(session, 1);
  await assert.rejects(session.prompt("timeout"), { name: "TimeoutError" });
  assert.equal(((await read).at(-1)!.detail as { outcome: string }).outcome, "timed_out");
  await session.dispose();
  await session.dispose();
  await assert.rejects(session.prompt("closed"), /关闭/);
}));

test("actual native resume succeeds only after matching successful SDK result; failed resume clears ID and next explicit input rebuilds", async () => fixture(async (root) => {
  const storage = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "claude" });
  const id = randomUUID();
  await storage.saveSession({ version: 1, id: randomUUID(), roleId: role.id, runtime: "claude", contextSource: "fresh", nativeSessionId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const engine = fake(async (_client, config, _user, index) => {
    assert.equal(config.env!.CLAUDE_CONFIG_DIR, storage.nativeDirectory);
    assert.equal(config.persistSession, true);
    return index === 0 ? { fail: true } : {};
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, []), storage }, engine.dependencies).bindRole(role);
  assert.equal(session.contextSource, "fresh");
  await assert.rejects(session.prompt("resume explicit input"), /失败/);
  assert.equal(engine.configurations[0]!.resume, id);
  assert.equal(session.nativeSessionId, undefined);
  assert.equal(session.contextSource, "recovered");
  assert.match(session.contextWarning!, /未自动重试/);
  await session.prompt("next explicit input");
  assert.equal(engine.configurations[1]!.resume, undefined);
  assert.equal(session.contextSource, "recovered");
  await session.dispose();
  const success = fake(async () => {});
  const resumed = await createClaudeRuntimeAdapter({ ...options(root, []), storage }, success.dependencies).bindRole(role);
  assert.equal(resumed.contextSource, "fresh");
  await resumed.prompt("resume succeeds");
  assert.equal(resumed.contextSource, "resumed");
  assert.equal(resumed.nativeSessionId, id);
  await resumed.dispose();
}));

test("native symlink and storage runtime mismatch fail before SDK query", async () => fixture(async (root) => {
  const storage = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "claude" });
  await storage.prepareNativeDirectory!();
  await rm(storage.nativeDirectory, { recursive: true });
  await symlink(root, storage.nativeDirectory);
  const engine = fake(async () => {});
  await assert.rejects(createClaudeRuntimeAdapter({ ...options(root, []), storage }, engine.dependencies).bindRole(role));
  assert.equal(engine.loadCount, 0);
  await assert.rejects(createClaudeRuntimeAdapter({ ...options(root, []), storage: { ...storage, runtime: "codex" } }, engine.dependencies).bindRole(role), /不匹配/);
}));

test("core Service receives real Claude MCP reports/dispatch receipts and saves replay with actual metadata", async () => fixture(async (root) => {
  let reportTurnId: string | undefined;
  let dispatched = 0;
  const engine = fake(async (client) => {
    const report = await client.callTool({ name: "submit_report", arguments: { status: "completed", summary: "done" } });
    assert.equal(report.isError, false);
    const dispatch = await client.callTool({ name: "dispatch_task", arguments: { roleId: "other", task: "explicit fixture task" } });
    assert.equal(dispatch.isError, true);
  });
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow, writeRoot: root, persistSession: true,
    reportHandback: (_payload, metadata) => { reportTurnId = metadata?.turnId; return { ok: true }; },
    dispatchTask: () => { dispatched++; return { ok: false, message: "fixture rejected" }; },
    providerFactories: { claude: (config) => createClaudeRuntimeAdapter(config, engine.dependencies) },
  });
  const session = await service.bindRole(role);
  const read = collect(session, 1);
  await session.prompt("real handlers and storage");
  const rows = await read;
  assert.equal(rows.filter((event) => event.kind === "settled").length, 1);
  assert.equal(reportTurnId, rows.at(-1)!.turnId);
  assert.equal(dispatched, 1);
  await session.dispose();
  const storage = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "claude" });
  const record = await storage.readLatest();
  assert.equal(record?.nativeSessionId, session.nativeSessionId);
  assert.equal(record?.contextSource, "fresh");
  assert.equal((await storage.readReplay()).filter((row) => row.event?.kind === "settled").length, 1);
}));
