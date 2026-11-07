// 最小 Chat Completions 兼容传输（2026-10-27 客户补充约束）契约测试。
// 本地假 Chat Completions 服务（localhost、假凭据、零外部调用）：文本轮次、工具循环、
// 工具结果同轮附图（tool 消息 content 数组 + image_url data URL）、失败/非法载荷 fail-closed、
// 用户图片、abort 回滚、redact、chat 模式配置回退与不支持能力 fail-closed。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCodexRuntimeAdapter, prepareCodexRuntimeAdapter, type CodexRuntimeAdapterOptions } from "../../src/provider/codex/session.ts";
import { settings, chatCompletionsEndpoint } from "../../src/common/codex-adapter/config.ts";
import type { PromptImage, SessionEvent, ToolDefinition, ToolResult } from "../../src/model/runtime.ts";
import { isRuntimeNativeToolSurfaceFacts } from "../../src/model/runtime.ts";
import type { ChiefDecisionExecutionContext, DecidePendingRequestInput } from "../../src/model/runtime.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { role, harness, options, collect, until, interactionGate } from "./fixtures.ts";

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

const boundedChiefContext = (): ChiefDecisionExecutionContext => ({ roleId: "chief", executionId: "n5-owned-bounded-chief", mode: "bounded-decision",
  productionWriteAuthority: false, tools: ["decide_pending_request"], limits: { maxTurns: 1, timeoutMs: 5000, maxAttempts: 1 },
  request: { requestId: "n5-owned-request", baseDigest: "a".repeat(64), delegationRevision: 2, originRoleId: "convener", cardKind: "decision",
    question: "Goal: inspect this pending request without inventing customer approval", options: [{ id: "revise", label: "revise evidence" }], evidenceRefs: [] } });

test("bounded Chief default Core and Codex reach only the real decision handler through local HTTP", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-chief-n5-"));
  const saved = [process.env.ANS_CODEX_WIRE_API, process.env.ANS_N5_LOCAL_KEY];
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_N5_LOCAL_KEY = "n5-fixture-key";
  let nativeSpawns = 0;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", () => { nativeSpawns++; throw new Error("unexpected native execution"); });
  syncBuiltinESMExports(); t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const chief = { ...structuredClone(role), id: "chief", kind: "built-in-governance" as const, governanceFunction: "chief" as const };
  const context = boundedChiefContext();
  const args = { requestId: context.request.requestId, baseDigest: context.request.baseDigest, delegationRevision: context.request.delegationRevision, disposition: "revise", reason: "fixture evidence is incomplete" };
  const received: DecidePendingRequestInput[] = [];
  try {
    await withChat((_body, index, response) => {
      if (index === 0) return reply(response, { role: "assistant", tool_calls: [
        { id: "chief-1", type: "function", function: { name: "ans_decide_pending_request", arguments: JSON.stringify(args) } },
        { id: "chief-2", type: "function", function: { name: "ans_decide_pending_request", arguments: JSON.stringify(args) } },
        { id: "forbidden-shell", type: "function", function: { name: "ans_run_shell", arguments: '{}' } },
      ] });
      if (index === 1) return reply(response, { role: "assistant", content: "The fixture request remains pending." });
      response.writeHead(500); response.end("N5 script exhausted");
    }, async (baseUrl, requests) => {
      // The real Service selects its default Codex factory; only model HTTP replies are stubbed.
      const adapter = createRuntimeAdapter({ runtime: "codex", projectRoot: root, skillRoot: root, modelId: "n5-default-chief", baseUrl,
        apiKeyEnvVar: "ANS_N5_LOCAL_KEY", chiefDecisionContext: context,
        gate: () => ({ allowed: false, reason: "fixture deny", allowedByRoot: { project: [], skill: [] } }),
        decidePendingRequest: async input => { received.push(input); return { ok: false, requestId: input.requestId, status: "pending", errorCode: "fixture-not-approved", message: "No customer approval was produced" }; } });
      const composed = await adapter.composeContext(chief);
      assert.match(composed.systemPrompt, /实际 Chief 身份的独立有界决策会话/);
      assert.match(composed.systemPrompt, /Goal: inspect this pending request/);
      assert.equal(composed.systemPrompt.includes("本会话是只读判断会话"), false);
      assert.equal(composed.systemPrompt.includes("应用内置 Chief workflow"), false);
      const session = await adapter.bindRole(chief);
      try {
        await session.prompt("Process only the fixed Goal; preserve pending failures.");
        assert.equal(requests.length, 2); assert.equal(received.length, 1);
        assert.equal(session.roleId, "chief"); assert.deepEqual(received[0], args);
        assert.deepEqual(requests[0]!.tools?.map(spec => (spec.function as { name: string }).name), ["ans_decide_pending_request"]);
        const results = messagesOf(requests[1]).filter(message => message.role === "tool");
        assert.match(String(results.find(message => message.tool_call_id === "chief-1")?.content), /fixture-not-approved/);
        assert.match(String(results.find(message => message.tool_call_id === "chief-2")?.content), /attempt budget exhausted/);
        assert.match(String(results.find(message => message.tool_call_id === "forbidden-shell")?.content), /unregistered tool/);
        await assert.rejects(session.prompt("second turn"), /turn budget exhausted/);
        assert.equal(requests.length, 2); assert.equal(nativeSpawns, 0);
      } finally { await session.dispose(); }
    });
  } finally {
    if (saved[0] === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = saved[0];
    if (saved[1] === undefined) delete process.env.ANS_N5_LOCAL_KEY; else process.env.ANS_N5_LOCAL_KEY = saved[1];
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded Chief rejects wrong roles extra tools and missing host context before native construction", async () => {
  const engines = harness();
  const chief = { ...structuredClone(role), id: "chief", kind: "built-in-governance" as const, governanceFunction: "chief" as const };
  const decisionTool = { ...tool({ ok: false, message: "not executed" }), name: "decide_pending_request" };
  const opts = () => options("/fixture", engines, { judgeMode: true, chiefDecisionContext: boundedChiefContext(), tools: [decisionTool] });
  for (const wrongRole of [role, { ...chief, kind: "project" as const }, { ...chief, governanceFunction: undefined }]) {
    const adapter = createCodexRuntimeAdapter(opts());
    await assert.rejects(adapter.composeContext(wrongRole), /real built-in Chief role/);
    await assert.rejects(adapter.bindRole(wrongRole), /real built-in Chief role/);
    assert.equal(prepareCodexRuntimeAdapter(opts(), wrongRole).adapter, undefined);
  }
  assert.throws(() => createCodexRuntimeAdapter({ ...opts(), tools: [decisionTool, tool({ ok: true, message: "extra" })] }), /only decide_pending_request/);
  assert.throws(() => createCodexRuntimeAdapter({ ...opts(), chiefDecisionContext: undefined }), /frozen judge tool set/);
  assert.throws(() => createCodexRuntimeAdapter({ ...opts(), judgeMode: undefined }), /valid context/);
  const invalid = boundedChiefContext(); Object.assign(invalid, { productionWriteAuthority: true });
  assert.throws(() => createCodexRuntimeAdapter({ ...opts(), chiefDecisionContext: invalid }), /valid context/);
  assert.equal(engines.engines.length, 0);
});

test("native factory preparation has no effects and binds the same real Chat plan over local HTTP", async t => {
  let nativeSpawns = 0;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", () => { nativeSpawns++; throw new Error("unexpected native creation"); });
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-plan-tests-"));
  const secret = "private-plan-key-do-not-publish";
  let calls = 0;
  let registrations = 0;
  try {
    await withChat((_body, index, response) => {
      if (index === 0) return reply(response, { role: "assistant", tool_calls: [{ id: "prepared-call", type: "function", function: { name: "ans_probe", arguments: "{}" } }] });
      if (index === 1) return reply(response, { role: "assistant", content: "prepared completed" });
      response.writeHead(500); response.end("prepared fixture exhausted");
    }, async (baseUrl, requests) => {
      const opts: CodexRuntimeAdapterOptions = { runtime: "codex", wireApi: "chat", projectRoot: root, skillRoot: root,
        baseUrl, modelId: "prepared-default-chat", env: { CODEX_API_KEY: secret, PRIVATE_PLAN_VALUE: "unpublished-environment-value" },
        tools: [{ name: "probe", description: "fixture", inputSchema: { type: "object" }, async handler() { calls++; return { ok: true, message: "prepared handler" }; } }],
        registerToolDisplayProfile: () => { registrations++; }, interactionGate: interactionGate(), currentTurnId: () => "prepared-core-turn" };
      const before = await readdir(root, { recursive: true });
      const preparation = prepareCodexRuntimeAdapter(opts, role);
      assert.equal(nativeSpawns, 0); assert.equal(requests.length, 0); assert.equal(calls, 0);
      assert.equal(registrations, 0);
      assert.deepEqual(await readdir(root, { recursive: true }), before);
      assert.equal(preparation.facts.status, "observed"); assert.equal(preparation.facts.factory, "codex-chat");
      assert.equal(preparation.facts.transport, "http"); assert.equal(preparation.facts.wire, "chat");
      assert.deepEqual(preparation.facts.plannedProcesses, []); assert.deepEqual(preparation.facts.appTools, ["probe"]);
      assert.equal(preparation.isCurrent(), true); assert.ok(preparation.adapter);
      const serialized = JSON.stringify(preparation.facts);
      for (const forbidden of [secret, "CODEX_API_KEY", "PRIVATE_PLAN_VALUE", "unpublished-environment-value", createHash("sha256").update(secret).digest("hex")]) assert.equal(serialized.includes(forbidden), false);
      assert.equal(serialized.includes("adapter"), false); assert.equal(serialized.includes("isCurrent"), false);
      const session = await preparation.adapter.bindRole(role);
      assert.equal(registrations, 1);
      try {
        const surface = session.inspectNativeToolSurface!();
        assert.deepEqual(surface.factoryPlan, { planId: preparation.facts.planId, configDigest: preparation.facts.configDigest });
        assert.equal(surface.nativeInstanceId, session.nativeLifecycle!.instanceId);
        assert.equal(surface.status, "observed");
        await session.prompt("exercise prepared registry");
        assert.equal(requests.length, 2); assert.equal(calls, 1); assert.equal(nativeSpawns, 0);
        assert.deepEqual(requests[0]?.tools?.map(spec => (spec.function as { name: string }).name), ["ans_probe"]);
      } finally { await session.dispose(); }
      // Credential rotation does not change the public digest; it invalidates the private preparation.
      opts.env!.CODEX_API_KEY = "rotated-private-plan-key";
      assert.equal(preparation.isCurrent(), false);
      assert.equal(prepareCodexRuntimeAdapter(opts, role).facts.configDigest, preparation.facts.configDigest);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native factory preparation rejects role config registry and environment drift before creation", async t => {
  let nativeSpawns = 0;
  let registrationCalls = 0;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", () => { nativeSpawns++; throw new Error("unexpected native creation"); });
  syncBuiltinESMExports(); t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  await withChat((_body, _index, response) => { response.writeHead(500); response.end("unexpected HTTP creation"); }, async (baseUrl, requests) => {
    const mutations: Array<(opts: CodexRuntimeAdapterOptions, boundRole: typeof role) => void> = [
      opts => { opts.modelId = "changed-model"; }, opts => { opts.wireApi = "responses"; },
      opts => { opts.env!.CODEX_API_KEY = "rotated-secret"; }, opts => { opts.env!.ANS_CODEX_WIRE_API = "responses"; },
      opts => { opts.tools[0]!.name = "changed-name"; }, opts => { opts.tools[0]!.handler = async () => ({ ok: false, message: "changed handler" }); },
      (_opts, boundRole) => { boundRole.cardText += " changed-role"; },
    ];
    for (const mutate of mutations) {
      const boundRole = structuredClone(role);
      const opts: CodexRuntimeAdapterOptions = { runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture", baseUrl,
        modelId: "prepared-drift", env: { CODEX_API_KEY: "private-fixture-key" }, tools: [tool({ ok: true, message: "unused" })],
        registerToolDisplayProfile: () => { registrationCalls++; }, interactionGate: interactionGate(), currentTurnId: () => "prepared-drift-turn" };
      const preparation = prepareCodexRuntimeAdapter(opts, boundRole);
      assert.ok(preparation.adapter); mutate(opts, boundRole); assert.equal(preparation.isCurrent(), false);
      await assert.rejects(preparation.adapter.bindRole(boundRole), /prepared configuration is stale/);
    }
    assert.equal(requests.length, 0); assert.equal(nativeSpawns, 0); assert.equal(registrationCalls, 0);
  });
});

test("native factory preparation leaves unsupported branches unconstructed and follows actual judge overrides", async t => {
  let nativeSpawns = 0;
  let customCalls = 0;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", () => { nativeSpawns++; throw new Error("unexpected native creation"); });
  syncBuiltinESMExports(); t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  await withChat((_body, _index, response) => { response.writeHead(500); response.end("unexpected unsupported-branch HTTP"); }, async (baseUrl, requests) => {
  const base = (): CodexRuntimeAdapterOptions => ({ runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture",
    baseUrl, modelId: "prepare-unconstructed", env: { CODEX_API_KEY: "private-fixture-key" },
    tools: [tool({ ok: true, message: "unused" })], interactionGate: interactionGate(), currentTurnId: () => "prepare-unknown" });
  const cases: Array<Partial<CodexRuntimeAdapterOptions>> = [
    { wireApi: "responses" }, { webSearch: true }, { installedMcpServers: [{ name: "external", command: "must-not-start", args: [] }] },
    { engineFactory: async () => { customCalls++; throw new Error("must not construct"); } },
    { chatFetch: async () => { customCalls++; throw new Error("must not fetch"); } },
    { mcpLoader: async () => { customCalls++; throw new Error("must not load"); } }, { cliPath: "must-not-execute" },
  ];
  for (const extra of cases) {
    const preparation = prepareCodexRuntimeAdapter({ ...base(), ...extra }, role);
    assert.equal(preparation.facts.status, "unknown"); assert.equal(preparation.adapter, undefined);
  }
  const judge = base();
  judge.judgeMode = true; judge.webSearch = true; judge.installedMcpServers = [{ name: "external", command: "must-not-start", args: [] }];
  judge.tools = ["judge_read_file", "judge_list_dir", "report_shell_judgement"].map(name => ({ ...tool({ ok: true, message: "unused" }), name }));
  const preparedJudge = prepareCodexRuntimeAdapter(judge, role);
  assert.equal(preparedJudge.facts.status, "observed"); assert.deepEqual(preparedJudge.facts.foreignMcpServers, []);
  assert.deepEqual(preparedJudge.facts.plannedProcesses, []); assert.ok(preparedJudge.adapter);
  assert.equal(nativeSpawns, 0); assert.equal(customCalls, 0);
  assert.equal(requests.length, 0);
  });
});

test("native tool surface observes the default production Chat registry and rejects unregistered native commands over real HTTP", async t => {
  let nativeSpawns = 0;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", () => { nativeSpawns++; throw new Error("unexpected native execution"); });
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const calls: Array<Record<string, unknown>> = [];
  await withChat((_body, index, response) => {
    if (index === 0) return reply(response, { role: "assistant", content: null, tool_calls: [
      { id: "registered", type: "function", function: { name: "ans_probe", arguments: '{"value":7}' } },
      { id: "native-command", type: "function", function: { name: "exec_command", arguments: '{"command":"unexpected native command"}' } },
      { id: "unregistered-app-tool", type: "function", function: { name: "ans_run_shell", arguments: '{"command":"unexpected shell"}' } },
    ] });
    if (index === 1) return reply(response, { role: "assistant", content: "bounded fixture completed" });
    response.writeHead(500); response.end("fixture script exhausted");
  }, async (baseUrl, requests) => {
    // No engineFactory, chatFetch or providerFactories replacement: only the model HTTP response is local.
    const session = await createCodexRuntimeAdapter({ runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture",
      baseUrl, modelId: "native-registry-http-fixture", env: { CODEX_API_KEY: "fixture-only" }, tools: [tool({ ok: true, message: "registered handler" }, calls)],
      interactionGate: interactionGate(), currentTurnId: () => "registry-core-turn" }).bindRole(role);
    const events = collect(session);
    try {
      const facts = session.inspectNativeToolSurface!();
      assert.ok(isRuntimeNativeToolSurfaceFacts(facts));
      assert.equal(facts.source, "native-provider-tool-registry");
      assert.equal(facts.factory, "codex-chat"); assert.equal(facts.status, "observed");
      assert.equal(facts.factoryPlan, undefined, "legacy direct binds cannot invent a prepared plan");
      assert.equal(facts.nativeInstanceId, session.nativeLifecycle!.instanceId);
      assert.equal(facts.roleId, role.id); assert.equal(facts.runtime, "codex");
      assert.deepEqual(facts.appTools, ["probe"]); assert.deepEqual(facts.foreignMcpServers, []); assert.deepEqual(facts.nativeBuiltinTools, []);
      // A consumer mutating its snapshot cannot mutate the real dispatch registry.
      (facts.appTools as string[]).push("forged-native-command");
      assert.deepEqual(session.inspectNativeToolSurface!().appTools, ["probe"]);
      await session.prompt("exercise only the declared application tool");
      assert.equal(requests.length, 2); assert.equal(calls.length, 1); assert.equal((calls[0]?.args as Record<string, unknown>)?.value, 7);
      assert.deepEqual(requests[0]?.tools?.map(spec => (spec.function as { name: string }).name), ["ans_probe"]);
      const results = messagesOf(requests[1]).filter(message => message.role === "tool");
      assert.equal(results.length, 3);
      assert.match(String(results.find(message => message.tool_call_id === "native-command")?.content), /refused an unregistered tool/);
      assert.match(String(results.find(message => message.tool_call_id === "unregistered-app-tool")?.content), /refused an unregistered tool/);
      assert.equal(nativeSpawns, 0);
      assert.equal(session.inspectNativeToolSurface!().status, "observed");
    } finally { await session.dispose(); await events.done; }
    assert.equal(session.inspectNativeToolSurface!().status, "unknown");
    assert.ok(session.inspectNativeToolSurface!().reasons.includes("chat-session-disposed"));
    assert.equal(nativeSpawns, 0);
  });
});

test("native tool surface reports unknown for changed registry or a mismatched native instance", async () => {
  const boundTool = tool({ ok: true, message: "unused" });
  const session = await createCodexRuntimeAdapter({ runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture",
    baseUrl: "http://127.0.0.1:1/v1", modelId: "registry-no-request", env: { CODEX_API_KEY: "fixture-only" }, tools: [boundTool],
    interactionGate: interactionGate(), currentTurnId: () => "registry-core-turn" }).bindRole(role);
  try {
    assert.equal(session.inspectNativeToolSurface!().status, "observed");
    const originalHandler = boundTool.handler;
    boundTool.handler = async () => ({ ok: true, message: "changed handler" });
    assert.equal(session.inspectNativeToolSurface!().status, "unknown");
    assert.ok(session.inspectNativeToolSurface!().reasons.includes("chat-tool-registry-changed"));
    boundTool.handler = originalHandler;
    boundTool.name = "changed-name";
    assert.equal(session.inspectNativeToolSurface!().status, "unknown");
    boundTool.name = "probe";
    const lifecycle = session.nativeLifecycle;
    Object.defineProperty(session, "nativeLifecycle", { value: { ...lifecycle, instanceId: "wrong-instance" }, configurable: true });
    assert.equal(session.inspectNativeToolSurface!().status, "unknown");
    assert.ok(session.inspectNativeToolSurface!().reasons.includes("chat-native-identity-mismatch"));
    Object.defineProperty(session, "nativeLifecycle", { value: lifecycle, configurable: true });
    assert.equal(session.inspectNativeToolSurface!().status, "observed");
  } finally { await session.dispose(); }
});

test("chat native lifecycle observes a real HTTP body and retains the captured Core turn", async () => {
  await withChat((_body, _index, response) => reply(response, { role: "assistant", content: "settled" }), async baseUrl => {
    let coreTurn = "core-http-stop";
    const session = await bindChat(baseUrl, [], { currentTurnId: () => coreTurn });
    try {
      await session.prompt("hello");
      coreTurn = "later-turn";
      const lifecycle = session.nativeLifecycle!;
      const facts = await lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, expectedCoreTurnId: "core-http-stop", timeoutMs: 100 });
      assert.equal(facts.status, "quiescent");
      assert.equal(facts.promptState, "settled");
      assert.deepEqual(facts.transport, { kind: "http", state: "idle" });
      assert.equal(facts.coreTurnId, "core-http-stop");
      assert.equal(facts.processCoverage, "complete");
      assert.deepEqual(facts.processes, []);
      assert.ok(facts.settledAt);
      await assert.rejects(lifecycle.stopAndInspect({ expectedInstanceId: "old-instance", timeoutMs: 10 }), /instance mismatch/);
      await assert.rejects(lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, expectedCoreTurnId: "old-turn", timeoutMs: 10 }), /turn mismatch/);
    } finally { await session.dispose(); }
  });
});

test("chat native lifecycle keeps an abort-ignoring response body unknown until its actual return", async () => {
  let release!: (body: string) => void;
  let reading = false;
  const chatFetch = async () => ({ ok: true, text: () => { reading = true; return new Promise<string>(resolve => { release = resolve; }); } }) as Response;
  const session = await bindChat("http://unused.invalid/v1", [], { chatFetch, currentTurnId: () => "core-body" });
  const prompt = session.prompt("hello");
  try {
    await until(() => reading);
    const lifecycle = session.nativeLifecycle!;
    for (let repeat = 0; repeat < 2; repeat++) {
      const facts = await lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, timeoutMs: 10 });
      assert.equal(facts.status, "unknown"); assert.equal(facts.promptState, "running");
      assert.equal(facts.transport.state, "open");
      assert.ok(facts.reasons.includes("native-stop-timeout"));
    }
    release(JSON.stringify({ choices: [{ message: { content: "late body" } }] })); await prompt;
    const facts = await lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, timeoutMs: 100 });
    assert.equal(facts.status, "quiescent"); assert.equal(facts.promptState, "settled");
  } finally { release?.(JSON.stringify({ choices: [{ message: {} }] })); await prompt; await session.dispose(); }
});

test("chat native lifecycle does not hide a tool that ignores abort", async () => {
  let release!: () => void;
  let entered = false;
  const slow: ToolDefinition = { name: "probe", description: "fixture", inputSchema: { type: "object" }, async handler() {
    entered = true; await new Promise<void>(resolve => { release = resolve; }); return { ok: true, message: "late tool" };
  } };
  const chatFetch = async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: "slow-call", function: { name: "ans_probe", arguments: "{}" } }] } }] }));
  const session = await bindChat("http://unused.invalid/v1", [slow], { chatFetch });
  const prompt = session.prompt("hello");
  try {
    await until(() => entered);
    const lifecycle = session.nativeLifecycle!;
    const facts = await lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, timeoutMs: 10 });
    assert.equal(facts.status, "unknown");
    assert.equal(facts.activeTools[0]?.id, "slow-call");
    assert.ok(facts.reasons.includes("chat-tool-handler-running"));
    release(); await prompt;
    assert.equal((await lifecycle.stopAndInspect({ expectedInstanceId: lifecycle.instanceId, timeoutMs: 100 })).status, "quiescent");
  } finally { release?.(); await prompt; await session.dispose(); }
});

test("plain text multi-turn HTTP history preserves each assistant once including reasoning without tool_calls", async () => {
  await withChat((_body, index, response) => reply(response, { role: "assistant", content: index === 0 ? "Which output format?" : "Confirmed PDF.", reasoning_content: `reasoning-${index}` }), async (baseUrl, requests) => {
    const session = await createCodexRuntimeAdapter({ runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture", baseUrl,
      modelId: "multi-turn-history", env: { CODEX_API_KEY: "fixture-only" }, tools: [], interactionGate: interactionGate(), currentTurnId: () => "history-turn" }).bindRole(role);
    try {
      await session.prompt("Prepare an output.");
      await session.prompt("PDF please.");
      assert.equal(requests.length, 2);
      const history = messagesOf(requests[1]);
      assert.deepEqual(history.map(message => message.role), ["system", "user", "assistant", "user"]);
      assert.equal(history[2]?.content, "Which output format?");
      assert.equal(history[2]?.reasoning_content, "reasoning-0");
      assert.equal(Object.hasOwn(history[2]!, "tool_calls"), false);
      assert.equal(history[3]?.content, "PDF please.");
    } finally { await session.dispose(); }
  });
});

for (const outcome of ["failed", "timed_out"] as const) test(`plain text multi-turn HTTP history rolls back ${outcome} turn and retains earlier assistant`, async () => {
  await withChat((_body, index, response) => {
    if (index === 1) { if (outcome === "failed") { response.writeHead(500); response.end("fixture failure"); } return; }
    reply(response, { role: "assistant", content: index === 0 ? "retained answer" : "recovered answer" });
  }, async (baseUrl, requests) => {
    const session = await bindChat(baseUrl, [], { turnLastResortMs: outcome === "timed_out" ? 100 : 5000 });
    try {
      await session.prompt("first successful user");
      await assert.rejects(session.prompt("discard failed user"), outcome === "failed" ? /HTTP 500/ : /最后兜底/);
      await session.prompt("recovery user");
      assert.equal(requests.length, 3);
      const history = messagesOf(requests[2]);
      assert.deepEqual(history.map(message => message.role), ["system", "user", "assistant", "user"]);
      assert.equal(history[1]?.content, "first successful user"); assert.equal(history[2]?.content, "retained answer");
      assert.equal(history[3]?.content, "recovery user");
      assert.equal(JSON.stringify(history).includes("discard failed user"), false);
    } finally { await session.dispose(); }
  });
});

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
