import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, access, rm, symlink, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay, setImmediate as nextIO } from "node:timers/promises";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { createRuntimeAdapter, projectRuntimeLiveHandback } from "../../src/service/runtime/session.ts";
import { toClaudeSchema } from "../../src/common/claude-adapter/schema.ts";
import { buildShellJudgeTools, SHELL_JUDGE_TOOL_NAMES } from "../../src/common/runtime-core/shell-judge/tools.ts";
import { ALL_JUDGE_TOOL_NAMES, GOVERNANCE_JUDGE_TOOL_NAMES, buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, ToolDefinition, SessionEvent, WriteGate, ShellJudgeReadStats, RuntimeToolEventSource } from "../../src/model/runtime.ts";

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
type Script = (client: Client, options: Options, user: SDKUserMessage, queryIndex: number, rawCall: Client["callTool"]) => Promise<{ fail?: boolean; id?: string; resultText?: string; frames?: SDKMessage[] } | void>;

/** A real MCP Client/Server pair drives production registration, parsing and handlers; only query is fake. */
type FakeEngineBehavior = { interrupt?: () => Promise<void>; closeError?: Error };
function fake(script: Script, statuses: unknown[] | (() => Promise<unknown[]>) = [], behavior: FakeEngineBehavior = {}) {
  const configurations: Options[] = [];
  const users: SDKUserMessage[] = [];
  let loadCount = 0;
  let interrupts = 0;
  let closes = 0;
  let statusCalls = 0;
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
        for (const frame of result?.frames ?? []) yield frame;
        yield { type: "result", subtype: result?.fail ? "error_during_execution" : "success", is_error: !!result?.fail, session_id: result?.id ?? nativeId, user_message_uuid: user.uuid, ...(result?.resultText !== undefined ? { result: result.resultText } : {}) } as SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() { interrupts++; if (behavior.interrupt) await behavior.interrupt(); },
      close() { closed = true; closes++; void connected.then(() => client.close()).catch(() => {}); if (behavior.closeError) throw behavior.closeError; },
      async mcpServerStatus() { statusCalls++; return typeof statuses === "function" ? await statuses() : statuses; },
    }) as unknown as Query;
  };
  return {
    configurations, users, get loadCount() { return loadCount; }, get interrupts() { return interrupts; }, get closes() { return closes; }, get statusCalls() { return statusCalls; },
    dependencies: { env: environment, loadSdk: async () => { loadCount++; return { createSdkMcpServer, query }; }, loadZod: async () => z },
  };
}
// P3（2026-10-30）：本套件聚焦适配器既有语义，关闭 ANS 同回合重试（重试行为由
// test/claude-adapter/replay-safe-retry.test.ts 真实路径覆盖），避免既有失败/恢复用例被重试改变。
const options = (root: string, tools: readonly ToolDefinition[], interactionGate = gate()): RuntimeProviderOptions => ({ runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate, currentTurnId: () => undefined, requestAttemptMax: 1 });
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-claude-test-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function collect(session: { events(): AsyncIterable<SessionEvent> }, until: number) {
  const output: SessionEvent[] = [];
  for await (const event of session.events()) { output.push(event); if (output.filter((row) => row.kind === "settled").length === until) return output; }
  return output;
}
/** Synthesized SDK stream frames for pump tests; only the fields the adapter consumes are populated. */
const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;
const toolResultFrame = (toolUseId: string, content: unknown, isError: boolean): SDKMessage => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }] },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;
const probeTool = (): ToolDefinition => ({ name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe" }) });
const judgeStats = (): ShellJudgeReadStats => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
const judgeTools = (root: string, report: (raw: unknown) => void = () => {}, stats: ShellJudgeReadStats = judgeStats()): ToolDefinition[] =>
  buildShellJudgeTools({ projectRoot: root, report, stats });
const governanceJudgeTools = (root: string, report: (raw: unknown) => void = () => {}, stats: ShellJudgeReadStats = judgeStats()): ToolDefinition[] =>
  buildGovernanceJudgeTools({ projectRoot: root, report, stats });

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

// Real MCP/IO observation must not advance the explicitly controlled deadline clock.
async function untilIO(predicate: () => boolean): Promise<void> {
  const end = performance.now() + 2500;
  while (!predicate()) {
    if (performance.now() > end) throw new Error("Claude fixture IO observation timeout");
    await nextIO();
  }
}

test("InteractionGate pauses the last-resort deadline; answer returns and sequential write waits behind confirmation", { timeout: 10000 }, async (t) => fixture(async (root) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const interactionGate = gate();
  let answer: ((value: { outcome: "answered"; value: { confirmed: boolean } }) => void) | undefined;
  const tools = buildGovernedTools(allow, { writeRoot: root, interactionGate, customerInput: () => new Promise((resolve) => { answer = resolve; }) });
  const engine = fake(async (client) => {
    const confirmation = client.callTool({ name: "request_confirmation", arguments: { title: "confirm" } });
    const write = client.callTool({ name: "write_file", arguments: { path: "after.txt", content: "yes" } });
    await Promise.all([confirmation, write]);
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, tools, interactionGate), turnLastResortMs: 50 }, engine.dependencies).bindRole(role);
  const events: SessionEvent[] = [];
  const pump = (async () => { for await (const event of session.events()) events.push(event); })();
  try {
    const prompt = session.prompt("confirm then write");
    await untilIO(() => answer !== undefined);
    assert.equal(interactionGate.isWaiting(), true);
    t.mock.timers.tick(100); await nextIO();
    assert.equal(events.filter(event => event.kind === "settled").length, 0, "100ms logical customer wait does not consume the unchanged 50ms last-resort deadline");
    await assert.rejects(access(join(root, "after.txt")));
    answer!({ outcome: "answered", value: { confirmed: true } });
    await prompt;
    assert.equal(await readFile(join(root, "after.txt"), "utf8"), "yes");
    await untilIO(() => events.some(event => event.kind === "settled"));
    const terminals = events.filter(event => event.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0]!.detail as { outcome: string }).outcome, "completed");
  } finally { await session.dispose(); await pump; }
}));

test("inspect deadline never aborts; only the last resort ends the turn at 50ms outside customer waiting", { timeout: 10000 }, async (t) => fixture(async (root) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  let active = false;
  let release!: () => void;
  const work = new Promise<void>(resolve => { release = resolve; });
  const engine = fake(async () => { active = true; await work; });
  const session = await createClaudeRuntimeAdapter({ ...options(root, []), promptTimeoutMs: 10, turnLastResortMs: 50 }, engine.dependencies).bindRole(role);
  const events: SessionEvent[] = [];
  const pump = (async () => { for await (const event of session.events()) events.push(event); })();
  try {
    const rejected = assert.rejects(session.prompt("active without customer wait"), {
      name: "TimeoutError",
      message: "本轮运行超过最后兜底（50ms），已中止以免无限挂起。",
      label: "本轮最后兜底",
      code: "TURN_LAST_RESORT",
    });
    await untilIO(() => active);
    t.mock.timers.tick(9); await nextIO();
    assert.equal(events.filter(event => event.kind === "settled").length, 0);
    t.mock.timers.tick(1); await nextIO();
    assert.equal(events.filter(event => event.kind === "settled").length, 0, "10ms inspect deadline passed without aborting");
    t.mock.timers.tick(39); await nextIO();
    assert.equal(events.filter(event => event.kind === "settled").length, 0);
    t.mock.timers.tick(1); await rejected;
    await untilIO(() => events.some(event => event.kind === "settled"));
    const terminals = events.filter(event => event.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0]!.detail as { outcome: string }).outcome, "timed_out");
    assert.equal(terminals[0]!.summary, "Claude 本轮超过最后兜底（50ms），已中止");
    assert.equal(engine.closes, 1);
    assert.equal(engine.configurations[0]!.abortController!.signal.aborted, true);
  } finally { release(); await session.dispose(); await pump; }
}));

test("inspect deadline alone never aborts a progressing turn", async () => fixture(async (root) => {
  const engine = fake(async () => { await delay(60); });
  const session = await createClaudeRuntimeAdapter({ ...options(root, []), promptTimeoutMs: 10 }, engine.dependencies).bindRole(role);
  const read = collect(session, 1);
  await session.prompt("inspect only");
  const terminal = (await read).at(-1)!;
  assert.equal(terminal.kind, "settled");
  assert.equal((terminal.detail as { outcome: string }).outcome, "completed");
  assert.equal(terminal.summary, "Claude 本轮completed");
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

test("abort treats an already-closed query interrupt rejection as stopped, closes the engine and settles the turn", async () => fixture(async (root) => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => { release = resolve; });
  const engine = fake(async () => { await work; }, [], { interrupt: async () => { throw new Error("Query closed before response received"); } });
  const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
  try {
    const rejected = assert.rejects(session.prompt("stop me"), { name: "AbortError" });
    await untilIO(() => engine.users.length === 1);
    await session.abort!();
    await rejected;
    assert.equal(engine.interrupts, 1);
    assert.equal(engine.closes, 1);
    assert.equal(engine.configurations[0]!.abortController!.signal.aborted, true);
  } finally { release(); await session.dispose(); }
}));

test("abort still surfaces an interrupt rejection that is not the closed-query signal", async () => fixture(async (root) => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => { release = resolve; });
  const engine = fake(async () => { await work; }, [], { interrupt: async () => { throw new Error("interrupt transport broken"); } });
  const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
  try {
    const rejected = assert.rejects(session.prompt("stop me"), { name: "AbortError" });
    await untilIO(() => engine.users.length === 1);
    await assert.rejects(async () => { await session.abort!(); }, /interrupt transport broken/);
    await rejected;
    assert.equal(engine.interrupts, 1);
    assert.equal(engine.closes, 1);
  } finally { release(); await session.dispose(); }
}));

test("abort still surfaces a closeEngine teardown failure even when the query was already closed", async () => fixture(async (root) => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => { release = resolve; });
  const engine = fake(async () => { await work; }, [], { interrupt: async () => { throw new Error("Query closed before response received"); }, closeError: new Error("close boom") });
  const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
  try {
    const rejected = assert.rejects(session.prompt("stop me"), { name: "AbortError" });
    await untilIO(() => engine.users.length === 1);
    await assert.rejects(async () => { await session.abort!(); }, /close boom/);
    await rejected;
    assert.equal(engine.closes, 1);
  } finally { release(); await assert.rejects(session.dispose(), /close boom/); }
}));

test("abort keeps normal interrupt behavior: interrupt runs once and the turn settles aborted", async () => fixture(async (root) => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => { release = resolve; });
  const engine = fake(async () => { await work; });
  const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
  try {
    const rejected = assert.rejects(session.prompt("stop me"), { name: "AbortError" });
    await untilIO(() => engine.users.length === 1);
    await session.abort!();
    await rejected;
    assert.equal(engine.interrupts, 1);
    assert.equal(engine.closes, 1);
  } finally { release(); await session.dispose(); }
}));

test("last-resort deadline emits timed_out once and disposal closes event stream", async () => fixture(async (root) => {
  const engine = fake(async () => { await delay(60); });
  const session = await createClaudeRuntimeAdapter({ ...options(root, []), turnLastResortMs: 15 }, engine.dependencies).bindRole(role);
  const read = collect(session, 1);
  await assert.rejects(session.prompt("timeout"), { name: "TimeoutError", label: "本轮最后兜底", code: "TURN_LAST_RESORT" });
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

test("required-v1 rejects each missing display capability before SDK load; profile registers bind snapshot only", async () => fixture(async (root) => {
  const engine = fake(async () => {});
  for (const missing of ["projectToolEvent", "registerToolDisplayProfile"] as const) {
    const config: RuntimeProviderOptions = { ...options(root, []), toolDisplayMode: "required-v1",
      projectToolEvent: () => { throw new Error("unused"); }, registerToolDisplayProfile: () => {} };
    delete config[missing];
    assert.throws(() => createClaudeRuntimeAdapter(config, engine.dependencies), /projector\/register/);
  }
  assert.equal(engine.loadCount, 0);
  const profiles: unknown[] = [];
  const env = { ...environment, CUSTOM_KEY: "fake-profile-original", EXTRA_KEY: "fake-extra-original", UNLISTED: "never-register" };
  const adapter = createClaudeRuntimeAdapter({ ...options(root, []), toolDisplayMode: "required-v1", apiKeyEnvVar: "CUSTOM_KEY",
    toolDisplayCredentialEnvNames: ["EXTRA_KEY"], projectToolEvent: () => { throw new Error("unused"); },
    registerToolDisplayProfile: (profile) => { profiles.push(profile); } }, { ...engine.dependencies, env });
  env.CUSTOM_KEY = "fake-profile-mutated";
  const session = await adapter.bindRole(role);
  assert.deepEqual(profiles, [{ apiKeyEnvVar: "CUSTOM_KEY", credentials: [{ name: "CUSTOM_KEY", value: "fake-profile-original" }, { name: "EXTRA_KEY", value: "fake-extra-original" }] }]);
  assert.equal(engine.loadCount, 0);
  await session.dispose();
}));

test("real Core projector receives actual args/rule/result execution while SDK content and opaque identities stay unchanged", async () => fixture(async (root) => {
  const sources: import("../../src/model/runtime.ts").RuntimeToolEventSource[] = [];
  const marker = "fixture-api-secret";
  const result = { ok: false, message: `failure ${marker} https://example.test/p?secret=query`, execution: { exitCode: 7, stdout: `out ${marker}`, stderr: "real stderr", error: "real process failure", stdoutTruncated: true } };
  const tool: ToolDefinition = { name: "run_shell", description: "fixture", inputSchema: { type: "object", properties: { command: { type: "string" }, content: { type: "string" } } }, displayInputRule: "core-command-v1",
    handler: async (call) => { assert.deepEqual(call.args, { command: `echo ${marker}`, content: "PRIVATE BODY" }); return result; } };
  const engine = fake(async (client) => {
    const received = await client.callTool({ name: "run_shell", arguments: { command: `echo ${marker}`, content: "PRIVATE BODY" } });
    assert.deepEqual(received.content, [{ type: "text", text: "failure [REDACTED] https://example.test/p?secret=query" }]);
    assert.equal(received.isError, true);
    assert.equal(JSON.stringify(received).includes("exitCode"), false);
  });
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow,
    providerFactories: { claude: (config) => createClaudeRuntimeAdapter({ ...config, tools: [tool],
      projectToolEvent: (source, redact) => { sources.push(source); return config.projectToolEvent!(source, redact); } }, engine.dependencies) } });
  const session = await service.bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("fixture original");
  const rows = await reading;
  const facts = sources.filter((source): source is import("../../src/model/runtime.ts").RuntimeToolEventFactsV1 => source.origin === "handler-start" || source.origin === "handler-result");
  assert.equal(facts.length, 2);
  assert.equal(facts[0]!.input!.rule, "core-command-v1");
  assert.deepEqual(facts[0]!.input!.args, { command: `echo ${marker}`, content: "PRIVATE BODY" });
  assert.equal(facts[1]!.origin, "handler-result");
  if (facts[1]!.origin === "handler-result") assert.deepEqual(facts[1]!.result, result);
  assert.ok(facts[0]!.toolCallId!.startsWith(`${facts[0]!.turnId}:`));
  const tools = rows.filter((row) => (row.detail as { phase?: string })?.phase);
  assert.equal(tools.length, 2);
  assert.equal(tools.some((row) => (row.detail as { phase: string }).phase === "blocked"), false);
  const detail = tools[1]!.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  assert.equal(detail.toolCallId, facts[0]!.toolCallId);
  assert.equal(detail.display!.process!.exitCode, 7);
  assert.equal(detail.display!.process!.stdout!.truncated, true);
  assert.equal(detail.display!.process!.stdout!.text, "out [REDACTED]");
  assert.equal(detail.display!.error!.text, "real process failure");
  assert.equal(JSON.stringify(detail.display).includes(marker), false);
  assert.equal(JSON.stringify(rows).includes("PRIVATE BODY"), false);
  assert.equal(JSON.stringify(rows).includes("__ans_call_context"), false);
  await session.dispose();
}));

test("actual handler thrown Error projects protected message, unknown throw stays opaque, model retains original generic failure", async () => fixture(async (root) => {
  for (const thrown of [new Error("error fixture-api-secret"), { secret: "UNKNOWN_PRIVATE_OBJECT" }]) {
    const engine = fake(async (client) => {
      const received = await client.callTool({ name: "explode", arguments: {} });
      assert.deepEqual(received.content, [{ type: "text", text: "explode 执行失败；ANS 治理能力未返回成功" }]);
      assert.equal(received.isError, true);
    });
    const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow,
      providerFactories: { claude: (config) => createClaudeRuntimeAdapter({ ...config, tools: [{ name: "explode", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => { throw thrown; } }] }, engine.dependencies) } });
    const session = await service.bindRole(role);
    const reading = collect(session, 1);
    await session.prompt("throw fixture");
    const rows = await reading;
    assert.equal(JSON.stringify(rows).includes("UNKNOWN_PRIVATE_OBJECT"), false);
    assert.equal(JSON.stringify(rows).includes("fixture-api-secret"), false);
    const result = rows.find((row) => (row.detail as { phase?: string })?.phase === "result")!;
    assert.equal(result.kind, "denied");
    if (thrown instanceof Error) assert.equal((result.detail as import("../../src/model/runtime.ts").ToolEventDetailV1).display!.error!.text, "error [REDACTED]");
    await session.dispose();
  }
}));

test("unknown and old PreToolUse never borrow active turn; real original hook denial alone is blocked", async () => fixture(async (root) => {
  let oldId: string | undefined;
  const engine = fake(async (_client, config, user) => {
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    for (const promptId of [undefined, "unknown-native", ...(oldId ? [oldId] : [])]) {
      const decision = await hook({ hook_event_name: "PreToolUse", prompt_id: promptId, tool_name: "Bash", tool_input: {}, tool_use_id: "unattributed", session_id: "fixture", transcript_path: "fixture", cwd: root }, undefined, { signal: new AbortController().signal });
      assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
    }
    if (!oldId) {
      await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "Bash", tool_input: {}, tool_use_id: "real-deny", session_id: "fixture", transcript_path: "fixture", cwd: root }, undefined, { signal: new AbortController().signal });
      oldId = user.uuid;
    }
  });
  const config = options(root, []);
  const sources: import("../../src/model/runtime.ts").RuntimeToolEventSource[] = [];
  const session = await createClaudeRuntimeAdapter({ ...config, projectToolEvent: (source) => {
    sources.push(source);
    if (source.origin === "diagnostic") return { kind: "message", summary: "safe", detail: { version: 1, source: "tool-display-diagnostic", code: source.code } };
    if (!("phase" in source)) throw new Error("unexpected fixture source");
    return { kind: "denied", summary: "safe blocked", turnId: source.turnId, detail: { toolName: source.toolName, toolCallId: source.toolCallId, phase: source.phase } };
  } }, engine.dependencies).bindRole(role);
  const reading = collect(session, 2);
  await session.prompt("one");
  await session.prompt("two");
  const rows = await reading;
  assert.equal(sources.filter((source) => source.origin === "governance-hook").length, 1);
  assert.equal(sources.filter((source) => source.origin === "diagnostic").length, 4);
  for (const row of rows.filter((row) => (row.detail as { code?: string })?.code === "CALL_CONTEXT_UNATTRIBUTED")) assert.equal(row.turnId, undefined);
  await session.dispose();
}));

test("projector failure yields only bounded diagnostic without changing tool result or successful turn", async () => fixture(async (root) => {
  const engine = fake(async (client) => {
    const received = await client.callTool({ name: "ok", arguments: {} });
    assert.deepEqual(received.content, [{ type: "text", text: "original tool content" }]);
    assert.equal(received.isError, false);
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, [{ name: "ok", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "original tool content" }) }]),
    projectToolEvent: () => { throw new Error("DO_NOT_LEAK_PROJECTION_ERROR"); } }, engine.dependencies).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("original");
  const rows = await reading;
  assert.equal(rows.filter((row) => (row.detail as { code?: string })?.code === "PROJECTION_FAILED").length, 2);
  assert.equal(rows.some((row) => row.kind === "denied" || row.kind === "accepted" || row.kind === "tool_call"), false);
  assert.equal(JSON.stringify(rows).includes("DO_NOT_LEAK"), false);
  assert.equal((rows.at(-1)!.detail as { outcome: string }).outcome, "completed");
  await session.dispose();
}));

test("Core strips C metadata before Claude and preserves exact SDK prompt/images while publishing safe display copy", async () => fixture(async (root) => {
  const modelText = "MODEL_SENTINEL fixture-api-secret https://example.test/p?secret=xyz";
  const images: import("../../src/model/runtime.ts").PromptImage[] = [{ type: "image", mimeType: "image/png", data: "AA==" }];
  let providerOptions: import("../../src/model/runtime.ts").PromptOptions | undefined;
  const engine = fake(async (_client, config, user) => {
    const content = user.message.content as Array<{ type: string; text?: string; source?: unknown }>;
    assert.equal(content[0]!.text!.split("\n").slice(1).join("\n"), modelText);
    assert.deepEqual(content[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "AA==" } });
    for (const name of ["inputPresentation", "inputProvenance", "onDeliveryProgress", "toolDisplayMode", "registerToolDisplayProfile", "projectToolEvent"]) assert.equal(name in config, false);
  });
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow, persistSession: true,
    providerFactories: { claude: (config) => {
      const adapter = createClaudeRuntimeAdapter(config, engine.dependencies);
      return { ...adapter, async bindRole(boundRole) { const inner = await adapter.bindRole(boundRole); const prompt = inner.prompt.bind(inner);
        inner.prompt = async (text, opts) => { providerOptions = opts; return prompt(text, opts); }; return inner; } };
    } } });
  const session = await service.bindRole(role);
  const reading = collect(session, 1);
  await session.prompt(modelText, { images, inputPresentation: { version: 1, kind: "handback-live", durability: "memory-only", reports: [projectRuntimeLiveHandback({ source: { roleId: "source" }, taskId: null, status: "completed", summary: "fixture safe report", evidence: [], at: new Date().toISOString() })] }, onDeliveryProgress: () => {} });
  assert.equal(providerOptions!.images, images);
  for (const name of ["inputPresentation", "inputProvenance", "onDeliveryProgress"]) assert.equal(name in providerOptions!, false);
  const rows = await reading;
  const input = rows.find((row) => (row.detail as { source?: string })?.source === "prompt-input")!;
  const detail = input.detail as import("../../src/model/runtime.ts").PromptInputEventDetail;
  assert.equal(detail.text.includes("fixture-api-secret"), false);
  assert.equal(detail.inputTextProjection!.modelInputRecorded, false);
  assert.equal(detail.inputTextProjection!.redacted, true);
  const saved = await session.persistence!.recordFinalReport({ source: { roleId: role.id, runtime: "claude", turnId: rows.at(-1)!.turnId! }, taskId: null,
    origin: "submitted-report", status: "completed", summary: "DURABLE_SENTINEL fixture-api-secret", evidence: [], at: new Date().toISOString() });
  assert.equal(saved.ok, true);
  if (!saved.ok) throw new Error("fixture report save failed");
  const durableReading = collect(session, 1);
  await session.prompt(modelText, { images, inputProvenance: { version: 1, kind: "handback", deliveryId: randomUUID(), attemptId: randomUUID(), target: { roleId: role.id, runtime: "claude" }, reports: [saved.report] }, onDeliveryProgress: () => {} });
  await durableReading;
  for (const name of ["inputPresentation", "inputProvenance", "onDeliveryProgress"]) assert.equal(name in providerOptions!, false);
  assert.equal(engine.users.length, 2);
  assert.equal(providerOptions!.images, images);
  await session.dispose();
}));

test("thin projected outlet never redacts supplied opaque identities or restores suppressed oversized identity", async () => fixture(async (root) => {
  let index = 0;
  const engine = fake(async (client) => { await client.callTool({ name: "identity", arguments: {} }); });
  const session = await createClaudeRuntimeAdapter({ ...options(root, [{ name: "identity", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "safe" }) }]),
    currentTurnId: () => "fixture-api-secret", projectToolEvent: (source, redact) => {
      assert.ok("phase" in source);
      if (!("phase" in source)) throw new Error("unexpected source");
      assert.equal(source.turnId, "fixture-api-secret");
      assert.ok(source.toolCallId!.startsWith("fixture-api-secret:"));
      assert.equal(redact!("fixture-api-secret"), "[REDACTED]");
      if (index++ === 0) return { kind: "tool_call", runtime: "claude", roleId: "fixture-api-secret", turnId: source.turnId, summary: "already safe", detail: { phase: "start", toolName: "fixture-api-secret", toolCallId: source.toolCallId } };
      return { kind: "message", summary: "fixed diagnostic", detail: { source: "tool-display-diagnostic", version: 1, code: "IDENTITY_TOO_LARGE" } };
    } }, engine.dependencies).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("identity fixture");
  const rows = await reading;
  const start = rows.find((row) => row.kind === "tool_call")!;
  assert.equal(start.turnId, "fixture-api-secret");
  assert.equal(start.roleId, "fixture-api-secret");
  assert.equal((start.detail as { toolName: string }).toolName, "fixture-api-secret");
  assert.ok((start.detail as { toolCallId: string }).toolCallId.startsWith("fixture-api-secret:"));
  const diagnostic = rows.find((row) => (row.detail as { code?: string })?.code === "IDENTITY_TOO_LARGE")!;
  assert.equal(diagnostic.turnId, undefined);
  assert.equal(diagnostic.roleId, undefined);
  await session.dispose();
}));

test("required production path displays real read ENOENT and Node shell output without parsing result messages", async () => fixture(async (root) => {
  const command = `node -e "process.stdout.write('actual out');process.stderr.write('actual err');process.exit(3)"`;
  const engine = fake(async (client) => {
    const read = await client.callTool({ name: "read_file", arguments: { path: "missing-file.txt" } });
    assert.equal(read.isError, true);
    const shell = await client.callTool({ name: "run_shell", arguments: { command } });
    assert.equal(shell.isError, true);
    assert.match(JSON.stringify(shell.content), /actual out/);
    assert.match(JSON.stringify(shell.content), /actual err/);
    assert.equal(JSON.stringify(shell).includes('"execution"'), false);
  });
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow, readRoot: root, shellCwd: root,
    shellGate: async () => ({ allow: true, by: "fixture" }), providerFactories: { claude: (config) => createClaudeRuntimeAdapter(config, engine.dependencies) } });
  const session = await service.bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("actual tools");
  const rows = await reading;
  const results = rows.filter((row) => (row.detail as { phase?: string })?.phase === "result").map((row) => row.detail as import("../../src/model/runtime.ts").ToolEventDetailV1);
  assert.equal(results.length, 2);
  const read = results.find((detail) => detail.toolName === "read_file")!;
  assert.equal(read.display!.target!.value.text, "missing-file.txt");
  assert.match(read.display!.error!.text, /ENOENT/);
  assert.equal(read.display!.process, undefined);
  const shell = results.find((detail) => detail.toolName === "run_shell")!;
  assert.equal(shell.display!.target!.value.text, command);
  assert.equal(shell.display!.process!.exitCode, 3);
  assert.equal(shell.display!.process!.stdout!.text, "actual out");
  assert.equal(shell.display!.process!.stderr!.text, "actual err");
  assert.equal(rows.some((row) => (row.detail as { phase?: string })?.phase === "blocked"), false);
  await session.dispose();
}));

test("web search capability bit off (default/explicit): tools/allowedTools keep the pre-existing surface, WebSearch stays hook-denied and frames stay unconsumed", async () => fixture(async (root) => {
  for (const value of [undefined, "0", "off"]) {
    const engine = fake(async (_client, config, user) => {
      assert.deepEqual(config.tools, []);
      assert.deepEqual(config.allowedTools, ["mcp__ans__probe"]);
      const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
      const decision = await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "WebSearch", tool_input: { query: "off" }, tool_use_id: "toolu_off", session_id: "fixture", transcript_path: "fixture", cwd: root }, "toolu_off", { signal: new AbortController().signal });
      assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
      // Frames that would drive native events when enabled must stay unconsumed while off.
      return { frames: [assistantFrame([{ type: "tool_use", id: "toolu_off", name: "WebSearch", input: { query: "off" } }]), toolResultFrame("toolu_off", [{ type: "text", text: "fixture denied result" }], true)] };
    });
    const dependencies = value === undefined ? engine.dependencies : { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: value } };
    const session = await createClaudeRuntimeAdapter(options(root, [probeTool()]), dependencies).bindRole(role);
    const reading = collect(session, 1);
    await session.prompt(`off ${String(value)}`);
    const rows = await reading;
    assert.deepEqual(rows.map((row) => row.kind), ["message", "denied", "settled"]);
    assert.equal((rows[0]!.detail as { source?: string; state?: string }).source, "system");
    assert.equal((rows[0]!.detail as { state?: string }).state, "configured");
    assert.equal((rows[1]!.detail as { toolName?: string }).toolName, "WebSearch");
    await session.dispose();
  }
}));

test("web search capability bit on: builtin declared and auto-allowed only for the live bound turn, input never rewritten", async () => fixture(async (root) => {
  let firstPromptId: string | undefined;
  let turnIndex = 0;
  const engine = fake(async (_client, config, user) => {
    const index = turnIndex++;
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const call = (name: string, promptId: string | undefined, mcpServer?: { name: string; source: "sdk" }) => hook(
      { hook_event_name: "PreToolUse", prompt_id: promptId, tool_name: name, tool_input: { query: "fixture query" }, tool_use_id: "toolu_on", session_id: "fixture", transcript_path: "fixture", cwd: root, ...(mcpServer ? { mcp_server: mcpServer } : {}) },
      "toolu_on", { signal: new AbortController().signal });
    if (index === 0) {
      firstPromptId = user.uuid;
      assert.deepEqual(config.tools, ["WebSearch"]);
      assert.deepEqual(config.allowedTools, ["mcp__ans__probe", "WebSearch"]);
      const allowed = await call("WebSearch", user.uuid) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
      assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
      assert.equal("updatedInput" in allowed.hookSpecificOutput, false);
      assert.equal(JSON.stringify(allowed).includes("__ans_call_context"), false);
      for (const promptId of [undefined, "unknown-native"]) assert.equal(((await call("WebSearch", promptId)) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
      assert.equal(((await call("Bash", user.uuid)) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
      assert.equal(((await call("WebSearch", user.uuid, { name: "foreign", source: "sdk" })) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
      const ans = await call("mcp__ans__probe", user.uuid, { name: "ans", source: "sdk" }) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
      assert.equal(ans.hookSpecificOutput.permissionDecision, "allow");
      assert.equal(typeof ans.hookSpecificOutput.updatedInput!.__ans_call_context, "string");
      const permission = await config.canUseTool!("WebSearch", { query: "fixture query" }, { signal: new AbortController().signal, toolUseID: "toolu_on", requestId: "fixture" });
      assert.equal(permission?.behavior, "deny");
      return;
    }
    // A late WebSearch bound to the previous turn must not borrow the live turn.
    const late = await call("WebSearch", firstPromptId) as { hookSpecificOutput: { permissionDecision: string } };
    assert.equal(late.hookSpecificOutput.permissionDecision, "deny");
  });
  const session = await createClaudeRuntimeAdapter(options(root, [probeTool()]), { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: "1" } }).bindRole(role);
  const reading = collect(session, 2);
  await session.prompt("enable surfaces");
  await session.prompt("late web search");
  await reading;
  await session.dispose();
}));

test("web search on: native frames project one paired start/result per call; failure, unsupported content and budget text stay truthful and never fail the turn", async () => fixture(async (root) => {
  const searchText = 'Web search results for query: "ans governance"\nLinks: [Example](https://example.test/actual)\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.';
  const queries = ["ans governance", "gateway rejection", "no links", "budget"];
  const sources: import("../../src/model/runtime.ts").RuntimeToolEventSource[] = [];
  let turnIndex = 0;
  const engine = fake(async (_client, config, user) => {
    const index = turnIndex++;
    const id = `toolu_ws_${index}`;
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const decision = await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "WebSearch", tool_input: { query: queries[index] }, tool_use_id: id, session_id: "fixture", transcript_path: "fixture", cwd: root }, id, { signal: new AbortController().signal });
    assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "allow");
    const use = { type: "tool_use", id, name: "WebSearch", input: { query: queries[index] } };
    if (index === 0) return { frames: [assistantFrame([use]), toolResultFrame(id, [{ type: "text", text: searchText }], false)] };
    if (index === 1) return { frames: [assistantFrame([use]), toolResultFrame(id, "web-search-side-query-api-error: fixture gateway rejected the server tool declaration", true)] };
    if (index === 2) return { frames: [assistantFrame([use]), toolResultFrame(id, [{ type: "text", text: "No links found." }, { type: "image", source: { type: "base64", media_type: "image/png", data: "AA==" } }], false)] };
    return { frames: [assistantFrame([use, { type: "tool_use", id: "toolu_bash", name: "Bash", input: { command: "echo fixture" } }]), toolResultFrame(id, "Web search was not performed: this session's search budget is used up (200/200).", false)] };
  });
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, gate: allow,
    providerFactories: { claude: (config) => createClaudeRuntimeAdapter({ ...config,
      projectToolEvent: (source, redact) => { sources.push(source); return config.projectToolEvent!(source, redact); } },
      { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: "1" } }) } });
  const session = await service.bindRole(role);
  const reading = collect(session, 4);
  for (const text of ["one", "two", "three", "four"]) await session.prompt(text);
  const rows = await reading;
  const phases = (phase: string, id?: string) => rows.filter((row) => (row.detail as { phase?: string })?.phase === phase && (row.detail as { toolName?: string })?.toolName === "WebSearch" && (id === undefined || (row.detail as { toolCallId?: string }).toolCallId?.endsWith(`:${id}`)));
  assert.equal(phases("blocked").length, 0);
  assert.equal(phases("start").length, 4);
  assert.equal(phases("result").length, 4);
  const start = phases("start", "toolu_ws_0")[0]!;
  const success = phases("result", "toolu_ws_0")[0]!;
  const startDetail = start.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  const successDetail = success.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  assert.equal(start.kind, "tool_call");
  assert.equal(success.kind, "accepted");
  assert.equal(startDetail.toolCallId, `${start.turnId}:toolu_ws_0`);
  assert.equal(successDetail.toolCallId, startDetail.toolCallId);
  assert.equal(successDetail.turnId, startDetail.turnId);
  assert.equal(successDetail.ok, true);
  assert.equal(successDetail.status, "completed");
  assert.equal(startDetail.display!.target, undefined);
  assert.deepEqual(startDetail.display!.omissions, []);
  assert.match(successDetail.display!.resultText!.text, /Web search results for query: "ans governance"/);
  assert.match(successDetail.display!.resultText!.text, /https:\/\/example\.test\/actual/);
  const startFact = sources.find((source): source is Extract<import("../../src/model/runtime.ts").RuntimeToolEventFactsV1, { phase: "start" }> => source.origin === "native-start");
  assert.ok(startFact);
  assert.equal(startFact.toolName, "WebSearch");
  assert.deepEqual(startFact.input, { rule: "none", args: { query: "ans governance" } });
  const failure = phases("result", "toolu_ws_1")[0]!;
  const failureDetail = failure.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  assert.equal(failure.kind, "denied");
  assert.equal(failureDetail.ok, false);
  assert.equal(failureDetail.status, "failed");
  assert.match(failureDetail.display!.resultText!.text, /web-search-side-query-api-error/);
  assert.match(failureDetail.display!.error!.text, /fixture gateway rejected/);
  const partial = phases("result", "toolu_ws_2")[0]!;
  const partialDetail = partial.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  assert.equal(partial.kind, "accepted");
  assert.equal(partialDetail.display!.resultText!.text, "No links found.");
  assert.deepEqual(partialDetail.display!.omissions, ["unsupported-content"]);
  const budget = phases("result", "toolu_ws_3")[0]!;
  const budgetDetail = budget.detail as import("../../src/model/runtime.ts").ToolEventDetailV1;
  assert.equal(budget.kind, "accepted");
  assert.match(budgetDetail.display!.resultText!.text, /budget is used up/);
  assert.equal(rows.some((row) => (row.detail as { toolCallId?: string })?.toolCallId?.endsWith(":toolu_bash")), false);
  const settled = rows.filter((row) => row.kind === "settled");
  assert.equal(settled.length, 4);
  for (const row of settled) assert.equal((row.detail as { outcome: string }).outcome, "completed");
  await session.dispose();
}));

test("installed-skills section: non-empty splices the orchestration render verbatim; zero/broken stays the byte-identical old prompt and never fails the turn", async () => fixture(async (root) => {
  // Frozen G-1/G-4 texts re-typed independently here: any drift in the orchestration render must go red here too.
  const statusQuo = [role.cardText, `你始终绑定角色 ${role.id}。只能通过 mcp__ans__ 工具操作环境；所有写入、shell 和交互由 ANS 的注入能力判断。`, `当前角色边界：${JSON.stringify(role.boundary)}`].join("\n\n");
  const section = (entries: string[]) => [
    "## 本角色已安装技能（动手前先读，按序）",
    ...entries,
    "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。",
  ].join("\n");
  const line = (name: string, purpose: string, content: string) => `1. docs/skills/${name}/SKILL.md（用途：${purpose}；sha256:${createHash("sha256").update(Buffer.from(content)).digest("hex")}；安装于 2026-10-16）`;
  const registration = (purpose: string, roles = "claude-fixture") => ["# skill", `- 用途：${purpose}`, `- 适用角色：${roles}`, "- 状态：installed", "- 安装日期：2026-10-16", ""].join("\n");
  const put = async (name: string, installText: string, content?: string) => {
    await mkdir(join(root, "docs", "skills", name), { recursive: true });
    await writeFile(join(root, "docs", "skills", name, "install.md"), installText);
    if (content !== undefined) await writeFile(join(root, "docs", "skills", name, "SKILL.md"), content);
  };
  const runPrompt = async (): Promise<{ systemPrompt: string; settledOutcome: string }> => {
    const engine = fake(async () => undefined);
    const session = await createClaudeRuntimeAdapter(options(root, []), engine.dependencies).bindRole(role);
    const reading = collect(session, 1);
    await session.prompt("skills probe");
    const rows = await reading;
    await session.dispose();
    return { systemPrompt: engine.configurations[0]!.systemPrompt as string, settledOutcome: (rows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome };
  };
  const composePrompt = async (): Promise<string> => (await createClaudeRuntimeAdapter(options(root, []), fake(async () => undefined).dependencies).composeContext(role)).systemPrompt;

  // 1) Never installed: exactly the pre-G-4 assembly (no extra segment, no trailing newline).
  assert.equal((await runPrompt()).systemPrompt, statusQuo);
  assert.equal(await composePrompt(), statusQuo);

  // 2) Registered role hit: the render is spliced verbatim as one final segment (digest recomputed over the bytes).
  const tdd = "# TDD\n先写测试再改代码\n";
  await put("tdd-fix", registration("先写测试再改代码"), tdd);
  const withSection = await runPrompt();
  assert.equal(withSection.systemPrompt, `${statusQuo}\n\n${section([line("tdd-fix", "先写测试再改代码", tdd)])}`);
  assert.equal(withSection.systemPrompt.endsWith("\n"), false);
  assert.equal(await composePrompt(), withSection.systemPrompt);

  // 3) Broken entries only (unparseable registration, missing SKILL.md): zero rendering, and the turn still completes.
  await rm(join(root, "docs", "skills", "tdd-fix"), { recursive: true });
  await put("bad-fields", "# bad\n- 用途：缺字段\n");
  await put("no-skill", registration("内容缺失"));
  const broken = await runPrompt();
  assert.equal(broken.systemPrompt, statusQuo);
  assert.equal(broken.settledOutcome, "completed");

  // 4) A good entry next to bad ones renders exactly the good one.
  const good = "good content\n";
  await put("good-skill", registration("旁路好件"), good);
  assert.equal((await runPrompt()).systemPrompt, `${statusQuo}\n\n${section([line("good-skill", "旁路好件", good)])}`);
}));

test("installed MCP declarations assemble only when injected: launcher-wrapped command, env:NAME resolved, server-level allowedTools", async () => fixture(async (root) => {
  const launcherPath = fileURLToPath(new URL("../../src/common/claude-adapter/mcp-launcher.mjs", import.meta.url));
  await access(launcherPath); // plain on-disk file (electron-builder asar: false) — the spawned path must exist

  // Absent: the pre-P1 mcpServers/allowedTools surface is byte-identical.
  const base = fake(async () => undefined);
  const baseSession = await createClaudeRuntimeAdapter(options(root, [probeTool()]), base.dependencies).bindRole(role);
  const baseReading = collect(baseSession, 1);
  await baseSession.prompt("no installed");
  await baseReading;
  assert.deepEqual(Object.keys(base.configurations[0]!.mcpServers!), ["ans"]);
  assert.deepEqual(base.configurations[0]!.allowedTools, ["mcp__ans__probe"]);
  assert.equal(base.statusCalls, 0);
  await baseSession.dispose();

  // Injected: launcher-wrapped command; env:NAME expanded from the construction-time snapshot; a
  // missing reference target is omitted; alwaysLoad + finite timeout; server-level auto-allow.
  const engine = fake(async () => undefined);
  const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), installedMcpServers: [{
    name: "ext_tool", command: "/usr/bin/env", args: ["node", "-e", "0"],
    env: { LITERAL: "plain-value", FROM_ENV: "env:PROBE_REF", MISSING: "env:PROBE_ABSENT" },
  }] }, { ...engine.dependencies, env: { ...environment, PROBE_REF: "probe-ref-value" } }).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("installed");
  await reading;
  const config = engine.configurations[0]!;
  assert.deepEqual(config.mcpServers!.ext_tool, {
    type: "stdio", command: process.execPath, args: [launcherPath, "/usr/bin/env", "node", "-e", "0"],
    env: { LITERAL: "plain-value", FROM_ENV: "probe-ref-value", ANS_MCP_LAUNCHER_PASSTHROUGH: '["LITERAL","FROM_ENV"]' },
    alwaysLoad: true, timeout: 60000,
  });
  assert.equal(JSON.stringify(config.mcpServers!.ext_tool).includes("ELECTRON_RUN_AS_NODE"), false);
  assert.deepEqual(config.allowedTools, ["mcp__ans__probe", "mcp__ext_tool"]);
  assert.equal(config.strictMcpConfig, true);
  await session.dispose();
}));

test("installed MCP allow branch: name+dynamic source+live turn only, args pass unchanged, adversarials stay denied", async () => fixture(async (root) => {
  const engine = fake(async (_client, config, user) => {
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const decision = (result: Awaited<ReturnType<typeof hook>>) => (result as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision;
    const call = (toolName: string, promptId: string | undefined, mcpServer: { name: string; source: string } | undefined, input: unknown = { text: "model-input" }) => hook(
      { hook_event_name: "PreToolUse", prompt_id: promptId, tool_name: toolName, tool_input: input, tool_use_id: "toolu_ext", session_id: "fixture", transcript_path: "fixture", cwd: root, ...(mcpServer ? { mcp_server: mcpServer } : {}) },
      "toolu_ext", { signal: new AbortController().signal });
    const allowed = await call("mcp__ext__echo", user.uuid, { name: "ext", source: "dynamic" }) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
    assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
    assert.equal("updatedInput" in allowed.hookSpecificOutput, false);
    assert.equal(JSON.stringify(allowed).includes("__ans_call_context"), false);
    for (const [toolName, promptId, mcpServer] of [
      ["mcp__ext__echo", user.uuid, { name: "other", source: "dynamic" }],
      ["mcp__ext__echo", user.uuid, { name: "ext", source: "sdk" }],
      ["mcp__ext__echo", user.uuid, { name: "ext", source: "user" }],
      ["mcp__ext__echo", user.uuid, undefined],
      ["mcp__ext__echo", undefined, { name: "ext", source: "dynamic" }],
      ["mcp__ext__echo", "unknown-native", { name: "ext", source: "dynamic" }],
      ["mcp__extother__probe", user.uuid, { name: "ext", source: "dynamic" }],
      ["Bash", user.uuid, undefined],
      ["WebSearch", user.uuid, undefined],
    ] as Array<[string, string | undefined, { name: string; source: string } | undefined]>) {
      assert.equal(decision(await call(toolName, promptId, mcpServer)), "deny", `${toolName}/${mcpServer?.name ?? "none"}`);
    }
    // The ANS in-process branch is untouched.
    const ans = await call("mcp__ans__probe", user.uuid, { name: "ans", source: "sdk" }) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
    assert.equal(ans.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(typeof ans.hookSpecificOutput.updatedInput!.__ans_call_context, "string");
    return;
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), installedMcpServers: [{ name: "ext", command: "/bin/echo", args: [] }] }, engine.dependencies).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("allow branch");
  const rows = await reading;
  const starts = rows.filter((row) => row.kind === "tool_call" && (row.detail as { toolName?: string }).toolName === "mcp__ext__echo");
  assert.equal(starts.length, 1);
  assert.equal((starts[0]!.detail as { toolCallId: string }).toolCallId.endsWith(":toolu_ext"), true);
  await session.dispose();
}));

test("installed MCP frames pair start/result like WebSearch; unregistered late results stay unconsumed", async () => fixture(async (root) => {
  let turnIndex = 0;
  const engine = fake(async (_client, config, user) => {
    const index = turnIndex++;
    if (index === 0) {
      const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
      const result = await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "mcp__ext__echo", tool_input: { text: "pair-probe" }, tool_use_id: "toolu_ext_pair", session_id: "fixture", transcript_path: "fixture", cwd: root, mcp_server: { name: "ext", source: "dynamic" } }, "toolu_ext_pair", { signal: new AbortController().signal });
      assert.equal((result as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "allow");
      return { frames: [assistantFrame([{ type: "tool_use", id: "toolu_ext_pair", name: "mcp__ext__echo", input: { text: "pair-probe" } }]), toolResultFrame("toolu_ext_pair", [{ type: "text", text: "fake-echo:pair-probe" }], false)] };
    }
    // A late result whose call frame was never seen must never be consumed or attributed.
    return { frames: [toolResultFrame("toolu_ext_unknown", "late stray result", false)] };
  });
  const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), installedMcpServers: [{ name: "ext", command: "/bin/echo", args: [] }] }, engine.dependencies).bindRole(role);
  const reading = collect(session, 2);
  await session.prompt("native call");
  await session.prompt("stray result");
  const rows = await reading;
  const starts = rows.filter((row) => row.kind === "tool_call" && (row.detail as { toolName?: string }).toolName === "mcp__ext__echo");
  const results = rows.filter((row) => row.kind === "accepted");
  assert.equal(starts.length, 1);
  assert.equal(results.length, 1);
  assert.equal((results[0]!.detail as { toolCallId: string }).toolCallId, (starts[0]!.detail as { toolCallId: string }).toolCallId);
  assert.equal((starts[0]!.detail as { toolCallId: string }).toolCallId.endsWith(":toolu_ext_pair"), true);
  assert.equal(results[0]!.summary, "fake-echo:pair-probe");
  assert.equal(rows.some((row) => row.kind === "denied"), false);
  await session.dispose();
}));

test("installed MCP status pass: failed/needs-auth report one honest category line per engine; connected silent; status errors never fail the turn", async () => fixture(async (root) => {
  const statuses = [
    { name: "ext", status: "failed", error: "ENOENT: no such file or directory, posix_spawn 'stdio'" },
    { name: "authy", status: "needs-auth" },
    { name: "ext2", status: "connected", serverInfo: { name: "fake", version: "1.0.0" }, tools: [{ name: "echo" }] },
    { name: "ans", status: "connected", tools: [] },
  ];
  const installed = [{ name: "ext", command: "/bin/echo", args: [] }, { name: "authy", command: "/bin/echo", args: [] }, { name: "ext2", command: "/bin/echo", args: [] }];
  const engine = fake(async () => undefined, statuses);
  const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), installedMcpServers: installed }, engine.dependencies).bindRole(role);
  const reading = collect(session, 2);
  await session.prompt("one");
  await session.prompt("two");
  const rows = await reading;
  const messages = rows.filter((row) => row.kind === "message").map((row) => row.summary);
  assert.equal(messages.filter((message) => message === "已安装 MCP「ext」未连接：ENOENT").length, 1);
  assert.equal(messages.some((message) => message === "已安装 MCP「authy」未连接：needs-auth"), true);
  assert.equal(messages.some((message) => message.includes("ext2")), false);
  assert.equal(messages.some((message) => message.includes("posix_spawn")), false);
  assert.equal(engine.statusCalls, 1);
  await session.dispose();

  // A failing status query is swallowed; the turn still completes and reports nothing.
  const failing = fake(async () => undefined, () => { throw new Error("status query exploded"); });
  const failingSession = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), installedMcpServers: [installed[0]!] }, failing.dependencies).bindRole(role);
  const failingReading = collect(failingSession, 1);
  await failingSession.prompt("status failure");
  const failingRows = await failingReading;
  assert.equal((failingRows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome, "completed");
  assert.equal(failing.statusCalls, 1);
  await failingSession.dispose();
}));

test("reasoning effort wiring: unset keeps zero parameters; off maps to ThinkingDisabled; four levels map to EffortLevel", async () => fixture(async (root) => {
  const cases: Array<{ reasoningEffort?: RuntimeProviderOptions["reasoningEffort"]; thinking?: { type: string }; expectedEffort?: string }> = [
    {},
    { reasoningEffort: "off", thinking: { type: "disabled" } },
    { reasoningEffort: "low", expectedEffort: "low" },
    { reasoningEffort: "medium", expectedEffort: "medium" },
    { reasoningEffort: "high", expectedEffort: "high" },
    { reasoningEffort: "xhigh", expectedEffort: "xhigh" },
  ];
  for (const entry of cases) {
    const engine = fake(async () => undefined);
    const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), ...(entry.reasoningEffort !== undefined ? { reasoningEffort: entry.reasoningEffort } : {}) }, engine.dependencies).bindRole(role);
    const reading = collect(session, 1);
    await session.prompt("wiring");
    await reading;
    const config = engine.configurations[0]!;
    if (entry.thinking !== undefined) assert.deepEqual(config.thinking, entry.thinking);
    else assert.equal("thinking" in config, false, `unexpected thinking for ${String(entry.reasoningEffort)}`);
    if (entry.expectedEffort !== undefined) assert.equal(config.effort, entry.expectedEffort);
    else assert.equal("effort" in config, false, `unexpected effort for ${String(entry.reasoningEffort)}`);
    await session.dispose();
  }
}));

test("thinking frames produce raw reasoning facts (complete/omitted), never adapter-redacted, duration never guessed", async () => fixture(async (root) => {
  const engine = fake(async () => ({
    frames: [assistantFrame([
      { type: "thinking", thinking: "raw chain of thought mentioning fixture-api-secret verbatim", signature: "sig-1" },
      { type: "redacted_thinking", data: "opaque-redacted" },
      { type: "thinking", thinking: "", signature: "sig-2" },
      { type: "text", text: "visible answer" },
    ])],
  }));
  const session = await createClaudeRuntimeAdapter(options(root, [probeTool()]), engine.dependencies).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("capture");
  const rows = await reading;
  const reasoning = rows.filter((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning");
  assert.equal(reasoning.length, 3);
  for (const row of reasoning) {
    assert.equal(row.kind, "message");
    assert.equal((row.detail as { version?: number }).version, 1);
    assert.equal(row.summary, "已思考");
  }
  const facts = reasoning.map((row) => (row.detail as { reasoning: { text: string; status: string } }).reasoning);
  assert.deepEqual(facts[0], { text: "raw chain of thought mentioning fixture-api-secret verbatim", status: "complete" });
  assert.deepEqual(facts[1], { text: "", status: "omitted" });
  assert.deepEqual(facts[2], { text: "", status: "omitted" });
  // The adapter must NOT pre-redact (the single projection point lives in the Service) and must not guess durations.
  assert.equal(facts[0]!.text.includes("fixture-api-secret"), true);
  for (const fact of facts) assert.equal("durationMs" in fact, false);
  assert.equal(rows.some((row) => row.kind === "message" && row.summary === "visible answer"), true);
  await session.dispose();
}));

const reasoningState = (row: SessionEvent) => (row.detail as { source?: string; state?: string } | undefined)?.source === "system" ? (row.detail as { state?: string }).state : undefined;
const reasoningRejected = "API Error: 400 fixture gateway rejects effort on this endpoint";

test("reasoning compatibility completes the task, uses child-only env, and is confirmed only after success", async () => fixture(async (root) => {
  const originalEnv = { effort: process.env.CLAUDE_CODE_EFFORT_LEVEL, thinking: process.env.CLAUDE_CODE_DISABLE_THINKING };
  for (const configured of [undefined, "off", "low"] as const) {
    const engine = fake(async (_client, _config, _user, queryIndex) => queryIndex === 0 ? {
      fail: true, resultText: reasoningRejected,
      frames: [{ type: "assistant", error: "invalid_request", message: { content: [{type: "text", text: reasoningRejected}] } } as SDKMessage],
    } : undefined);
    const providerOptions = { ...options(root, [probeTool()]), reasoningEffort: configured };
    const session = await createClaudeRuntimeAdapter(providerOptions, engine.dependencies).bindRole(role);
    const reading = collect(session, 2);
    await session.prompt("first with reasoning");
    await session.prompt("second turn");
    const rows = await reading;
    assert.equal(engine.configurations.length, 2);
    const compatible = engine.configurations[1]!;
    assert.equal("effort" in compatible, false);
    assert.equal("thinking" in compatible, false);
    assert.equal(compatible.env!.CLAUDE_CODE_EFFORT_LEVEL, "unset");
    assert.equal(compatible.env!.CLAUDE_CODE_DISABLE_THINKING, "1");
    assert.equal(engine.configurations[0]!.env!.CLAUDE_CODE_EFFORT_LEVEL, undefined);
    assert.equal(providerOptions.reasoningEffort, configured);
    assert.deepEqual(rows.map(reasoningState).filter(Boolean), ["configured", "request-error", "trying", "compatible"]);
    assert.ok(rows.findIndex(row => reasoningState(row) === "compatible") < rows.findIndex(row => row.kind === "settled"));
    assert.deepEqual(rows.filter(row => row.kind === "settled").map(row => (row.detail as {outcome:string}).outcome), ["completed", "completed"]);
    assert.equal(rows.some(row => row.summary.includes("API Error")), false);
    assert.equal(engine.users.length, 3);
    assert.deepEqual(engine.users[0]!.message, engine.users[1]!.message);
    assert.equal(engine.users[0]!.uuid, engine.users[1]!.uuid);
    await session.dispose();
    // Rebuilding the adapter re-applies the saved choice rather than inheriting compatibility.
    const fresh = fake(async () => undefined);
    const freshSession = await createClaudeRuntimeAdapter(providerOptions, fresh.dependencies).bindRole(role);
    await freshSession.prompt("new session");
    assert.equal(fresh.configurations[0]!.env!.CLAUDE_CODE_EFFORT_LEVEL, undefined);
    if (configured === "low") assert.equal(fresh.configurations[0]!.effort, "low");
    if (configured === "off") assert.deepEqual(fresh.configurations[0]!.thinking, {type: "disabled"});
    await freshSession.dispose();
  }
  assert.deepEqual({effort: process.env.CLAUDE_CODE_EFFORT_LEVEL, thinking: process.env.CLAUDE_CODE_DISABLE_THINKING}, originalEnv);
}));

test("only explicit parameter rejections enable reasoning compatibility", async () => fixture(async (root) => {
  const cases: Array<[string, boolean]> = [
    [reasoningRejected, true],
    ['API Error: 422 {"error":{"type":"invalid_request_error","param":"output_config.effort","message":"invalid value"}}', true],
    ['API Error: 400 {"error":{"type":"invalid_request_error","message":"thinking is not supported"}}', true],
    ['API Error: 400 {"error":{"type":"invalid_request_error","param":null,"message":"unsupported parameter: thinking"}}', true],
    ['API Error: 400 {"error":{"type":"invalid_request_error","param":"model","message":"unsupported effort for model"}}', false],
    ['API Error: 400 {"error":{"type":"authentication_error","param":"effort","message":"unsupported effort"}}', false],
    ["API Error: 400 unknown model named effort", false],
    ["API Error: 400 model is not supported for effort", false],
    ["API Error: 400 invalid request while processing effort", false],
    ["API Error: 400 unsupported output_config.format", false],
    ["API Error: 400 plain rate limit exceeded", false],
    ...[401, 403, 408, 429, 500, 503].map(status => [`API Error: ${status} unsupported effort`, false] as [string, boolean]),
    ["network connection reset: unsupported thinking", false],
  ];
  for (const [resultText, expected] of cases) {
    const engine = fake(async (_client, _config, _user, index) => index === 0 ? { fail: true, resultText } : undefined);
    const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), reasoningEffort: "low" }, engine.dependencies).bindRole(role);
    const reading = collect(session, 1);
    if (expected) await session.prompt("one input");
    else await assert.rejects(session.prompt("one input"), /失败/);
    const rows = await reading;
    assert.equal(engine.configurations.length, expected ? 2 : 1, resultText);
    assert.equal(rows.some(row => reasoningState(row) === "trying"), expected, resultText);
    assert.equal((rows.find(row => row.kind === "settled")!.detail as {outcome:string}).outcome, expected ? "completed" : "failed");
    await session.dispose();
  }
}));

test("failed or cancelled compatibility does not change the next turn's original request", async () => fixture(async (root) => {
  for (const mode of ["failure", "cancel", "timeout"] as const) {
    let compatibilityStarted!: () => void;
    const started = new Promise<void>(resolve => { compatibilityStarted = resolve; });
    const engine = fake(async (_client, config, _user, index) => {
      if (index === 0) return { fail: true, resultText: reasoningRejected };
      if (index === 1) {
        compatibilityStarted();
        if (mode === "failure") return {fail: true, resultText: "API Error: 500 fixture ordinary outage"};
        await new Promise<void>(resolve => config.abortController!.signal.addEventListener("abort", () => resolve(), {once:true}));
      }
      return undefined;
    });
    const session = await createClaudeRuntimeAdapter({ ...options(root, [probeTool()]), reasoningEffort: "low", turnLastResortMs: mode === "timeout" ? 80 : 1000 }, engine.dependencies).bindRole(role);
    const reading = collect(session, 2);
    const first = session.prompt("first input");
    const firstRejected = assert.rejects(first);
    await started;
    if (mode === "cancel") await session.abort!();
    await firstRejected;
    await session.prompt("next input");
    const rows = await reading;
    assert.equal(engine.configurations.length, 3, mode);
    assert.equal(engine.configurations[2]!.effort, "low", mode);
    assert.equal(engine.configurations[2]!.env!.CLAUDE_CODE_EFFORT_LEVEL, undefined, mode);
    assert.equal(engine.configurations[2]!.env!.CLAUDE_CODE_DISABLE_THINKING, undefined, mode);
    assert.equal(rows.some(row => reasoningState(row) === "compatible"), false, mode);
    const expectedOutcome = { failure: "failed", cancel: "aborted", timeout: "timed_out" }[mode];
    assert.deepEqual(rows.filter(row => row.kind === "settled").map(row => (row.detail as { outcome: string }).outcome), [expectedOutcome, "completed"]);
    await session.dispose();
  }
}));

test("normal output and tool start forbid whole-turn reasoning replay", async () => fixture(async (root) => {
  for (const progress of ["text", "thinking", "ans", "ans-allowed", "mcp-started", "websearch-started"] as const) {
    let calls = 0;
    const engine = fake(async (client, config, user) => {
      let frames: SDKMessage[] | undefined;
      if (progress === "text" || progress === "thinking") {
        const block = progress === "text"
          ? { type: "text", text: "real partial answer" }
          : { type: "thinking", thinking: "real partial reasoning", signature: "fixture" };
        frames = [{ type: "assistant", message: { content: [block] } } as SDKMessage];
      } else if (progress === "ans") {
        await client.callTool({ name: "probe", arguments: {} });
      } else {
        const toolNames = { "ans-allowed": "mcp__ans__probe", "mcp-started": "mcp__external__probe", "websearch-started": "WebSearch" };
        const servers = { "ans-allowed": { name: "ans", source: "sdk" }, "mcp-started": { name: "external", source: "dynamic" }, "websearch-started": undefined };
        const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
        const result = await hook({
          hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: toolNames[progress],
          tool_input: {}, tool_use_id: "started", session_id: "fixture", transcript_path: "fixture", cwd: root,
          ...(servers[progress] ? { mcp_server: servers[progress] } : {}),
        }, undefined, { signal: config.abortController!.signal });
        assert.equal((result as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "allow");
      }
      return {fail:true,resultText:reasoningRejected,frames};
    });
    const tool = probeTool();
    tool.handler = async () => {
      calls++;
      return { ok: true, message: "called" };
    };
    const session = await createClaudeRuntimeAdapter({...options(root,[tool]),reasoningEffort:"low",installedMcpServers:[{name:"external",command:"fixture",args:[]}]},{...engine.dependencies,env:{...environment,ANS_CLAUDE_WEB_SEARCH:"1"}}).bindRole(role);
    const reading = collect(session,1);
    await assert.rejects(session.prompt("do work"),/失败/);
    const rows = await reading;
    assert.equal(engine.configurations.length,1,progress);
    assert.equal(engine.users.length,1,progress);
    assert.equal(calls,progress === "ans" ? 1 : 0,progress);
    assert.equal(rows.some(row => reasoningState(row) === "trying"),false,progress);
    await session.dispose();
  }
}));

test("judge mode registers exactly the three injected read-only tools, force-disables WebSearch/installed MCP, and denies every other call", async () => fixture(async (root) => {
  await writeFile(join(root, "README.md"), "# Judge fixture\n");
  await writeFile(join(root, ".env"), "TOP_SECRET=1\n");
  const reports: unknown[] = [];
  const stats = judgeStats();
  const tools = judgeTools(root, (raw) => { reports.push(raw); }, stats);
  assert.deepEqual(tools.map((tool) => tool.name), [...SHELL_JUDGE_TOOL_NAMES]);
  const storage = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "claude" });
  const engine = fake(async (client, config, user) => {
    // 结构面：内置工具面为空，allowedTools 只有三只 judge 工具，原生/网络工具显式禁用，
    // MCP 只有注入的 ans server；即便上游误传 installedMcpServers 也不装配。
    assert.deepEqual(config.tools, []);
    assert.deepEqual(config.allowedTools, SHELL_JUDGE_TOOL_NAMES.map((name) => `mcp__ans__${name}`));
    for (const native of ["Bash", "Write", "Edit", "Read", "WebSearch", "WebFetch", "Task"]) assert.equal(config.disallowedTools!.includes(native), true, native);
    assert.deepEqual(Object.keys(config.mcpServers!), ["ans"]);
    assert.equal(config.strictMcpConfig, true);
    assert.equal(config.persistSession, false);
    assert.match(config.systemPrompt as string, /只读判断会话/);
    assert.equal((config.systemPrompt as string).includes("已安装技能"), false);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), [...SHELL_JUDGE_TOOL_NAMES]);
    // 三只 judge 工具实际可用：读文件、列目录、结论原样回调（不做规范化）。
    const read = await client.callTool({ name: "judge_read_file", arguments: { path: "README.md" } });
    assert.equal(read.isError, false);
    assert.match(JSON.stringify(read.content), /# Judge fixture/);
    const list = await client.callTool({ name: "judge_list_dir", arguments: {} });
    assert.equal(list.isError, false);
    assert.match(JSON.stringify(list.content), /README\.md/);
    assert.equal(JSON.stringify(list.content).includes(".env"), false, "sensitive entries are never named");
    const verdict = { verdict: "deny", reason: "fixture raw", evidence: ["README.md"], alternative: { kind: "instruction", value: "fixture" }, extraneous: "kept-raw" };
    const report = await client.callTool({ name: "report_shell_judgement", arguments: verdict });
    assert.equal(report.isError, false);
    assert.deepEqual(reports, [verdict]);
    // 非 judge 工具不存在于 MCP 目录：调用被 hook/MCP 拒绝，结构性不可用。
    for (const name of ["write_file", "edit_file", "run_shell", "request_confirmation", "request_choice", "submit_report", "dispatch_task"]) {
      const result = await client.callTool({ name, arguments: {} });
      assert.equal(result.isError, true, name);
    }
    // PreToolUse 兜底：任何非三项名字（含外来 MCP、内置原生工具）一律 deny。
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const decision = async (toolName: string, mcpServer?: { name: string; source: "sdk" | "dynamic" }) => (await hook(
      { hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: toolName, tool_input: {}, tool_use_id: "toolu_judge", session_id: "fixture", transcript_path: "fixture", cwd: root, ...(mcpServer ? { mcp_server: mcpServer } : {}) },
      "toolu_judge", { signal: new AbortController().signal }) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision;
    for (const name of ["mcp__ans__write_file", "mcp__ans__run_shell", "mcp__ans__request_confirmation", "mcp__ext__echo", "Bash", "Write", "WebSearch", "WebFetch"]) assert.equal(await decision(name), "deny", name);
    assert.equal(await decision("mcp__ext__echo", { name: "ext", source: "dynamic" }), "deny");
    // 已注册 judge 工具仍走原 allow 分支（绑定活动轮 + 单次 call context）。
    const allowed = await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "mcp__ans__judge_read_file", tool_input: { path: "README.md" }, tool_use_id: "toolu_judge", session_id: "fixture", transcript_path: "fixture", cwd: root, mcp_server: { name: "ans", source: "sdk" } }, "toolu_judge", { signal: new AbortController().signal }) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
    assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(typeof allowed.hookSpecificOutput.updatedInput!.__ans_call_context, "string");
    // 敏感文件仍由运行时核心只读策略拒绝（判断模式不改变读取沙箱）。
    const denied = await client.callTool({ name: "judge_read_file", arguments: { path: ".env" } });
    assert.equal(denied.isError, true);
    assert.equal(JSON.stringify(denied.content).includes("TOP_SECRET"), false);
  });
  const session = await createClaudeRuntimeAdapter({
    ...options(root, tools), judgeMode: true,
    installedMcpServers: [{ name: "ext", command: "/bin/echo", args: [] }],
    storage,
  }, { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: "1" } }).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("judge fixture");
  await reading;
  assert.equal(stats.readCalls, 3);
  assert.equal(stats.deniedReads, 1);
  assert.equal(stats.budgetExceeded, false);
  // 判断会话不持久化：不使用注入 storage 的原生目录、不创建项目 .ans；临时配置根在 dispose 后清理。
  const configDirectory = engine.configurations[0]!.env!.CLAUDE_CONFIG_DIR!;
  assert.notEqual(configDirectory, storage.nativeDirectory);
  assert.equal(engine.configurations[0]!.persistSession, false);
  await session.dispose();
  await assert.rejects(access(join(root, ".ans")));
  await assert.rejects(access(configDirectory));
}));

test("governance judge mode registers exactly the three governance tools, force-disables WebSearch/installed MCP, and denies non-allowlisted calls", async () => fixture(async (root) => {
  await writeFile(join(root, "README.md"), "# Governance judge fixture\n");
  await writeFile(join(root, ".env"), "TOP_SECRET=1\n");
  const reports: unknown[] = [];
  const stats = judgeStats();
  const tools = governanceJudgeTools(root, (raw) => { reports.push(raw); }, stats);
  assert.deepEqual(tools.map((tool) => tool.name), [...GOVERNANCE_JUDGE_TOOL_NAMES]);
  // 并集只用于 allowlist：恰为 shell 三只 + report_governance_judgement（去重四只）。
  assert.deepEqual([...ALL_JUDGE_TOOL_NAMES].sort(), [...new Set([...SHELL_JUDGE_TOOL_NAMES, ...GOVERNANCE_JUDGE_TOOL_NAMES])].sort());
  const storage = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "claude" });
  const engine = fake(async (client, config, user) => {
    // 结构面与 shell judge 同款：内置工具面为空，allowedTools 只有治理三只，原生/网络工具显式禁用，
    // MCP 只有注入的 ans server；即便上游误传 installedMcpServers 也不装配。
    assert.deepEqual(config.tools, []);
    assert.deepEqual(config.allowedTools, GOVERNANCE_JUDGE_TOOL_NAMES.map((name) => `mcp__ans__${name}`));
    for (const native of ["Bash", "Write", "Edit", "Read", "WebSearch", "WebFetch", "Task"]) assert.equal(config.disallowedTools!.includes(native), true, native);
    assert.deepEqual(Object.keys(config.mcpServers!), ["ans"]);
    assert.equal(config.strictMcpConfig, true);
    assert.equal(config.persistSession, false);
    assert.match(config.systemPrompt as string, /只读判断会话/);
    assert.match(config.systemPrompt as string, /report_governance_judgement/);
    assert.equal((config.systemPrompt as string).includes("report_shell_judgement"), false);
    assert.equal((config.systemPrompt as string).includes("已安装技能"), false);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), [...GOVERNANCE_JUDGE_TOOL_NAMES]);
    // 三只治理 judge 工具实际可用：读/列复用 shell judge 沙箱，结论原样回调（不做规范化）。
    const read = await client.callTool({ name: "judge_read_file", arguments: { path: "README.md" } });
    assert.equal(read.isError, false);
    assert.match(JSON.stringify(read.content), /# Governance judge fixture/);
    const list = await client.callTool({ name: "judge_list_dir", arguments: {} });
    assert.equal(list.isError, false);
    assert.match(JSON.stringify(list.content), /README\.md/);
    assert.equal(JSON.stringify(list.content).includes(".env"), false, "sensitive entries are never named");
    // Delta-3（C 批）：通用 write 卡已删除；judge 回调夹具改用 appointment-write（approval 组）。
    const verdict = { verdict: "approve", group: "approval", cardKind: "appointment-write", selected: ["accept"], pathDecisions: [{ path: "docs/a.md", ok: true }], extraneous: "kept-raw" };
    const report = await client.callTool({ name: "report_governance_judgement", arguments: verdict });
    assert.equal(report.isError, false);
    assert.deepEqual(reports, [verdict]);
    // shell 的 report 工具不属于治理三件套：结构与 hook 双重拒绝。
    const shellReport = await client.callTool({ name: "report_shell_judgement", arguments: { verdict: "allow" } });
    assert.equal(shellReport.isError, true);
    for (const name of ["write_file", "edit_file", "run_shell", "request_confirmation", "request_choice", "submit_report", "dispatch_task"]) {
      const result = await client.callTool({ name, arguments: {} });
      assert.equal(result.isError, true, name);
    }
    // PreToolUse 兜底：非治理三项名字（含 shell report、写/shell、外来 MCP、内置原生/网络）一律 deny。
    const hook = config.hooks!.PreToolUse![0]!.hooks[0]!;
    const decision = async (toolName: string, mcpServer?: { name: string; source: "sdk" | "dynamic" }) => (await hook(
      { hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: toolName, tool_input: {}, tool_use_id: "toolu_governance", session_id: "fixture", transcript_path: "fixture", cwd: root, ...(mcpServer ? { mcp_server: mcpServer } : {}) },
      "toolu_governance", { signal: new AbortController().signal }) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision;
    for (const name of ["mcp__ans__write_file", "mcp__ans__run_shell", "mcp__ans__request_confirmation", "mcp__ans__report_shell_judgement", "mcp__ext__echo", "Bash", "Write", "WebSearch", "WebFetch"]) assert.equal(await decision(name), "deny", name);
    assert.equal(await decision("mcp__ext__echo", { name: "ext", source: "dynamic" }), "deny");
    // 已注册治理工具仍走原 allow 分支（绑定活动轮 + 单次 call context）。
    const allowed = await hook({ hook_event_name: "PreToolUse", prompt_id: user.uuid, tool_name: "mcp__ans__report_governance_judgement", tool_input: { verdict: "manual" }, tool_use_id: "toolu_governance", session_id: "fixture", transcript_path: "fixture", cwd: root, mcp_server: { name: "ans", source: "sdk" } }, "toolu_governance", { signal: new AbortController().signal }) as { hookSpecificOutput: { permissionDecision: string; updatedInput?: Record<string, unknown> } };
    assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(typeof allowed.hookSpecificOutput.updatedInput!.__ans_call_context, "string");
    // 敏感文件仍由运行时核心只读策略拒绝（判断模式不改变读取沙箱）。
    const denied = await client.callTool({ name: "judge_read_file", arguments: { path: ".env" } });
    assert.equal(denied.isError, true);
    assert.equal(JSON.stringify(denied.content).includes("TOP_SECRET"), false);
  });
  const session = await createClaudeRuntimeAdapter({
    ...options(root, tools), judgeMode: true,
    installedMcpServers: [{ name: "ext", command: "/bin/echo", args: [] }],
    storage,
  }, { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: "1" } }).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("governance judge fixture");
  await reading;
  assert.equal(stats.readCalls, 3);
  assert.equal(stats.deniedReads, 1);
  assert.equal(stats.budgetExceeded, false);
  const configDirectory = engine.configurations[0]!.env!.CLAUDE_CONFIG_DIR!;
  assert.notEqual(configDirectory, storage.nativeDirectory);
  assert.equal(engine.configurations[0]!.persistSession, false);
  await session.dispose();
  await assert.rejects(access(join(root, ".ans")));
  await assert.rejects(access(configDirectory));
}));

test("judge mode accepts either frozen triple but rejects mixed, partial, or extended judge tool sets", async () => fixture(async (root) => {
  const engine = fake(async () => undefined);
  const shell = judgeTools(root);
  const governance = governanceJudgeTools(root);
  // 两个冻结三件套都能通过工厂与 bind（不加载 SDK、不开 query）。
  for (const tools of [shell, governance]) {
    const session = await createClaudeRuntimeAdapter({ ...options(root, tools), judgeMode: true }, engine.dependencies).bindRole(role);
    await session.dispose();
  }
  const mixed = [governance[0]!, shell[2]!, governance[2]!];
  const duplicated = [governance[0]!, governance[0]!, governance[1]!];
  const union = [...shell, governance[2]!];
  for (const tools of [mixed, duplicated, governance.slice(0, 2), [...governance, probeTool()], union]) {
    assert.throws(() => createClaudeRuntimeAdapter({ ...options(root, tools), judgeMode: true }, engine.dependencies), /判断会话只接受/);
  }
  assert.equal(engine.loadCount, 0);
}));

test("judge mode rejects non-judge tool sets before SDK load and re-checks at bind", async () => fixture(async (root) => {
  const engine = fake(async () => undefined);
  for (const tools of [buildGovernedTools(deny), judgeTools(root).slice(0, 2), [probeTool()]]) {
    assert.throws(() => createClaudeRuntimeAdapter({ ...options(root, tools), judgeMode: true }, engine.dependencies), /判断会话只接受/);
  }
  assert.equal(engine.loadCount, 0);
  // options 在工厂与 bind 之间被误改：bind 再校验，仍零副作用。
  const config: RuntimeProviderOptions = { ...options(root, judgeTools(root)), judgeMode: true };
  const adapter = createClaudeRuntimeAdapter(config, engine.dependencies);
  (config as { tools: readonly ToolDefinition[] }).tools = buildGovernedTools(deny);
  await assert.rejects(adapter.bindRole(role), /判断会话只接受/);
  assert.equal(engine.loadCount, 0);
  // bind 之后、引擎构造之前被误改：prompt 在加载 SDK 前拒绝，仍零副作用。
  const lateConfig: RuntimeProviderOptions = { ...options(root, judgeTools(root)), judgeMode: true };
  const lateSession = await createClaudeRuntimeAdapter(lateConfig, engine.dependencies).bindRole(role);
  (lateConfig as { tools: readonly ToolDefinition[] }).tools = buildGovernedTools(deny);
  await assert.rejects(lateSession.prompt("late mutation"), /判断会话只接受/);
  assert.equal(engine.loadCount, 0);
  await lateSession.dispose();
}));

test("judge mode abort settles the turn through the unchanged lifecycle path", async () => fixture(async (root) => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => { release = resolve; });
  const engine = fake(async () => { await work; });
  const session = await createClaudeRuntimeAdapter({ ...options(root, judgeTools(root)), judgeMode: true }, engine.dependencies).bindRole(role);
  try {
    const rejected = assert.rejects(session.prompt("judge stop"), { name: "AbortError" });
    await untilIO(() => engine.users.length === 1);
    await session.abort!();
    await rejected;
    assert.equal(engine.interrupts, 1);
    assert.equal(engine.closes, 1);
  } finally { release(); await session.dispose(); }
}));

test("normal role sessions keep the pre-judge surface: no disallowedTools and the web search bit still honored", async () => fixture(async (root) => {
  const engine = fake(async (_client, config) => {
    assert.deepEqual(config.tools, ["WebSearch"]);
    assert.deepEqual(config.allowedTools, ["mcp__ans__probe", "WebSearch"]);
    assert.equal("disallowedTools" in config, false);
    assert.equal(config.persistSession, false);
  });
  const session = await createClaudeRuntimeAdapter(options(root, [probeTool()]), { ...engine.dependencies, env: { ...environment, ANS_CLAUDE_WEB_SEARCH: "1" } }).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("normal surface");
  await reading;
  await session.dispose();
}));

test("tool-result images ride the real MCP transport; failures and invalid payloads never attach images", async () => fixture(async (root) => {
  // 1×1 PNG（真实字节）与最小 JPEG SOI/EOI；适配器只映射、不重编码/不解码。
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const jpeg = "/9j/2Q==";
  const tool = (name: string, handler: ToolDefinition["handler"]): ToolDefinition => ({ name, description: "fixture", inputSchema: { type: "object", properties: {} }, handler });
  const tools: ToolDefinition[] = [
    tool("view_image_ok", async () => ({ ok: true, message: "图片已随本工具结果附上（同一轮可见）", images: [{ type: "image", data: png, mimeType: "image/png" }], imageDelivery: "tool-result" })),
    tool("view_image_multi", async () => ({ ok: true, message: "两张图片", images: [{ type: "image", data: png, mimeType: "image/png" }, { type: "image", data: jpeg, mimeType: "image/jpeg" }], imageDelivery: "tool-result" })),
    tool("view_image_fail", async () => ({ ok: false, message: "读取失败", images: [{ type: "image", data: png, mimeType: "image/png" }], imageDelivery: "tool-result" })),
    tool("view_image_invalid", async () => ({ ok: true, message: "已附上", images: [{ type: "image", data: "not base64!", mimeType: "image/png" }] })),
    tool("view_image_bad_mime", async () => ({ ok: true, message: "已附上", images: [{ type: "image", data: png, mimeType: "image/svg+xml" }] })),
    tool("view_image_mixed", async () => ({ ok: true, message: "已附上", images: [{ type: "image", data: png, mimeType: "image/png" }, { type: "image", data: "", mimeType: "image/png" }] })),
  ];
  const engine = fake(async (client) => {
    const ok = await client.callTool({ name: "view_image_ok", arguments: {} });
    assert.equal(ok.isError, false);
    // 文本与 image 块并列；data 与源字符串逐字相同（原引用、未重编码）。
    assert.deepEqual(ok.content, [
      { type: "text", text: "图片已随本工具结果附上（同一轮可见）" },
      { type: "image", data: png, mimeType: "image/png" },
    ]);
    const multi = await client.callTool({ name: "view_image_multi", arguments: {} });
    assert.equal(multi.isError, false);
    const multiContent = multi.content as Array<{ type: string; data?: string; mimeType?: string }>;
    assert.equal(multiContent.length, 3);
    assert.deepEqual(multiContent[1], { type: "image", data: png, mimeType: "image/png" });
    assert.deepEqual(multiContent[2], { type: "image", data: jpeg, mimeType: "image/jpeg" });
    const failed = await client.callTool({ name: "view_image_fail", arguments: {} });
    assert.equal(failed.isError, true);
    // 失败绝不附图（即使 payload 意外带 images）。
    assert.deepEqual(failed.content, [{ type: "text", text: "读取失败" }]);
    for (const name of ["view_image_invalid", "view_image_bad_mime", "view_image_mixed"]) {
      const invalid = await client.callTool({ name, arguments: {} });
      const invalidContent = invalid.content as Array<{ type: string; text?: string }>;
      assert.equal(invalid.isError, true, name);
      // 非法载荷整批不交付：只有诚实注记文本，没有任何 image 块。
      assert.equal(invalidContent.length, 1, name);
      assert.equal(invalidContent[0]!.type, "text", name);
      assert.match(invalidContent[0]!.text ?? "", /图片数据非法，未向模型提供任何图片/, name);
      assert.equal(JSON.stringify(invalid).includes(png), false, name);
      assert.equal(JSON.stringify(invalid).includes("not base64"), false, name);
    }
  });
  const sources: RuntimeToolEventSource[] = [];
  const adapterOptions: RuntimeProviderOptions = {
    ...options(root, tools),
    // 事件 facts 在投影前由适配器清洗：图片 base64 不得进入 projector/diagnostics。
    projectToolEvent: (source) => {
      sources.push(source);
      const phase = "phase" in source ? source.phase : "result";
      return { kind: "tool_call", summary: "fixture", detail: { toolName: "fixture", phase } };
    },
  };
  const session = await createClaudeRuntimeAdapter(adapterOptions, engine.dependencies).bindRole(role);
  const reading = collect(session, 1);
  await session.prompt("probe tool-result images");
  const rows = await reading;
  type HandlerResultSource = { toolName: string; result?: { ok: boolean; message: string; imageDelivery?: string } & Record<string, unknown> };
  const results = sources.filter((source) => source.origin === "handler-result") as unknown as HandlerResultSource[];
  assert.equal(results.length, tools.length);
  const byName = new Map(results.map((source) => [source.toolName, source]));
  const okFacts = byName.get("view_image_ok")!;
  assert.equal(okFacts.result!.ok, true);
  assert.equal(okFacts.result!["images"], undefined);
  assert.equal(okFacts.result!.imageDelivery, "tool-result");
  assert.equal(byName.get("view_image_fail")!.result!.ok, false);
  assert.equal(byName.get("view_image_fail")!.result!["images"], undefined);
  for (const name of ["view_image_invalid", "view_image_bad_mime", "view_image_mixed"]) {
    assert.equal(byName.get(name)!.result!.ok, false, name);
    assert.match(byName.get(name)!.result!.message, /图片数据非法，未向模型提供任何图片/, name);
  }
  // 会话事件与投影 facts 均不得出现图片字节（sentinel 断言）。
  const everything = JSON.stringify({ rows, sources });
  assert.equal(everything.includes(png), false);
  assert.equal(everything.includes(jpeg), false);
  assert.equal(everything.includes("not base64"), false);
  await session.dispose();
}));
