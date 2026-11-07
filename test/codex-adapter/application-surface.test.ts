// P1-B（P1.6 §4.6 Codex 行）应用中介工具面事实测试。
// 断言「实际构造面 = 报告面」：报告的应用工具必须等于真实 Chat request 下发的 function 面
// （含受控 shell `run_shell`/`start_background_task`），且 native 事实缺失/身份不符/自身 unknown
// 一律 fail-closed；chat 传输无 MCP/native builtin。零外部调用（chatFetch 替身）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter, type CodexRuntimeAdapterOptions } from "../../src/provider/codex/session.ts";
import { composeRuntimeApplicationMediation } from "../../src/service/runtime/session.ts";
import {
  isRuntimeApplicationToolSurfaceFacts, isRuntimeNativeToolSurfaceFacts,
  type ToolDefinition,
} from "../../src/model/runtime.ts";
import { interactionGate, role } from "./fixtures.ts";

const TOOL_PREFIX = "ans_";

function tool(name: string): ToolDefinition {
  return { name, description: `${name} fixture`, inputSchema: { type: "object" }, async handler() { return { ok: true, message: `${name} executed` }; } };
}

function chatOptions(tools: ToolDefinition[], extra: Partial<CodexRuntimeAdapterOptions> = {}): CodexRuntimeAdapterOptions {
  return { runtime: "codex", wireApi: "chat", projectRoot: "/fixture", skillRoot: "/fixture",
    baseUrl: "http://127.0.0.1:1/v1", modelId: "application-surface-fixture",
    env: { CODEX_API_KEY: "fixture-only" }, tools, interactionGate: interactionGate(),
    currentTurnId: () => "application-surface-turn", ...extra };
}

interface ChatRequestBody { tools?: Array<{ function?: { name?: string } }> }

function reply(message: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ choices: [{ index: 0, message }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("application surface equals the actual Chat function registry including controlled shell tools", async () => {
  const requests: ChatRequestBody[] = [];
  const chatFetch = (async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(String(init?.body)) as ChatRequestBody);
    return reply({ role: "assistant", content: "application surface fixture completed" });
  }) as typeof fetch;
  const tools = [tool("probe"), tool("run_shell"), tool("start_background_task")];
  const session = await createCodexRuntimeAdapter(chatOptions(tools, { chatFetch })).bindRole(role);
  try {
    const native = session.inspectNativeToolSurface!();
    assert.ok(isRuntimeNativeToolSurfaceFacts(native));
    assert.equal(native.status, "observed");
    assert.deepEqual(native.appTools, ["probe", "run_shell", "start_background_task"]);

    const facts = session.inspectApplicationToolSurface!();
    assert.ok(isRuntimeApplicationToolSurfaceFacts(facts));
    assert.equal(facts.source, "application-mediated-tool-surface");
    assert.equal(facts.runtime, "codex"); assert.equal(facts.factory, "codex-chat");
    assert.equal(facts.status, "observed"); assert.deepEqual(facts.reasons, []);
    assert.equal(facts.nativeInstanceId, session.nativeLifecycle!.instanceId);
    assert.equal(facts.nativeInstanceId, native.nativeInstanceId);
    assert.equal(facts.roleId, role.id);
    assert.deepEqual(facts.appTools, ["probe", "run_shell", "start_background_task"]);
    assert.deepEqual(facts.foreignMcpServers, []);
    assert.deepEqual(facts.nativeBuiltinTools, []);

    // 实际构造面：真实 Chat request 下发的 function 面与报告面逐一对应。
    await session.prompt("exercise the declared application surface");
    assert.equal(requests.length, 1);
    const constructed = (requests[0]?.tools ?? []).map(entry => entry.function?.name);
    assert.deepEqual(constructed, ["ans_probe", "ans_run_shell", "ans_start_background_task"]);
    assert.deepEqual(facts.appTools, constructed.map(name => { assert.equal(name?.startsWith(TOOL_PREFIX), true); return name!.slice(TOOL_PREFIX.length); }));

    // 既有 native 事实逐字回归：同闭包、同实例、同实际 Map，不因新增应用面而改变。
    const after = session.inspectNativeToolSurface!();
    assert.ok(isRuntimeNativeToolSurfaceFacts(after));
    assert.equal(after.status, "observed"); assert.deepEqual(after.reasons, []);
    assert.equal(after.nativeInstanceId, facts.nativeInstanceId);
    assert.deepEqual(after.appTools, facts.appTools);
    assert.deepEqual(after.foreignMcpServers, []); assert.deepEqual(after.nativeBuiltinTools, []);

    // 消费者改写快照不能改写真实构造面。
    (facts.appTools as string[]).push("forged-tool");
    assert.deepEqual(session.inspectApplicationToolSurface!().appTools, ["probe", "run_shell", "start_background_task"]);
  } finally { await session.dispose(); }
});

test("application surface fails closed without bound native facts and stays out of the strict native path", async () => {
  const session = await createCodexRuntimeAdapter(chatOptions([tool("probe")])).bindRole(role);
  const nativeMethod = session.inspectNativeToolSurface!;
  try {
    assert.equal(session.inspectApplicationToolSurface!().status, "observed");
    // native 事实缺失：应用面不得冒充 observed（Codex 不允许无 native 证据走应用中介）。
    delete session.inspectNativeToolSurface;
    const missing = session.inspectApplicationToolSurface!();
    assert.equal(missing.status, "unknown");
    assert.ok(missing.reasons.includes("chat-native-surface-unavailable"));
    session.inspectNativeToolSurface = nativeMethod;

    // native 身份不符（生命周期实例漂移）：应用面 unknown；native 原判定也不变。
    const lifecycle = session.nativeLifecycle;
    Object.defineProperty(session, "nativeLifecycle", { value: { ...lifecycle, instanceId: "wrong-instance" }, configurable: true });
    const identity = session.inspectApplicationToolSurface!();
    assert.equal(identity.status, "unknown");
    assert.ok(identity.reasons.includes("chat-native-identity-mismatch"));
    assert.equal(session.inspectNativeToolSurface!().status, "unknown");
    assert.ok(session.inspectNativeToolSurface!().reasons.includes("chat-native-identity-mismatch"));
    Object.defineProperty(session, "nativeLifecycle", { value: lifecycle, configurable: true });
    assert.equal(session.inspectApplicationToolSurface!().status, "observed");
    assert.equal(session.inspectNativeToolSurface!().status, "observed");

    // native 事实自身 unknown / factory 不符：应用面同样 fail-closed。
    session.inspectNativeToolSurface = () => ({ ...nativeMethod(), status: "unknown", reasons: ["chat-tool-registry-changed"] });
    const unknownNative = session.inspectApplicationToolSurface!();
    assert.equal(unknownNative.status, "unknown");
    assert.ok(unknownNative.reasons.includes("chat-native-surface-unknown"));
    session.inspectNativeToolSurface = () => ({ ...nativeMethod(), factory: "unknown" });
    const wrongFactory = session.inspectApplicationToolSurface!();
    assert.equal(wrongFactory.status, "unknown");
    assert.ok(wrongFactory.reasons.includes("chat-native-identity-mismatch"));
    session.inspectNativeToolSurface = nativeMethod;
    assert.equal(session.inspectApplicationToolSurface!().status, "observed");
  } finally { await session.dispose(); }
  // disposed 后 native 事实 unknown ⇒ 应用面也不得提供 observed 事实。
  const disposed = session.inspectApplicationToolSurface!();
  assert.equal(disposed.status, "unknown");
  assert.ok(disposed.reasons.includes("chat-native-surface-unknown"));
});

test("configured foreign MCP is rejected before any Chat session can report a surface", async () => {
  // Codex chat 传输结构上不支持外来 MCP（provider/codex/session.ts 构造期 fail-closed）；
  // 应用面 `foreignMcpServers: []` 因此不是隐藏通道，配置非空时根本不会产生会话。
  const adapter = createCodexRuntimeAdapter(chatOptions([tool("probe")], {
    installedMcpServers: [{ name: "foreign", command: process.execPath, args: [] }],
  }));
  await assert.rejects(adapter.bindRole(role), /does not support installed MCP servers/);
});

test("real Chat application fact satisfies the frozen composition only with bound native facts", async () => {
  // 受控 shell 场景（P6/N16）：严格路径 reason 由包装层给出，应用面事实必须能被同一组合规则接受。
  const session = await createCodexRuntimeAdapter(chatOptions([tool("probe"), tool("run_shell")])).bindRole(role);
  try {
    const native = session.inspectNativeToolSurface!();
    const fact = session.inspectApplicationToolSurface!();
    assert.equal(native.status, "observed"); assert.equal(fact.status, "observed");
    const composition = (overrides: Record<string, unknown> = {}) => composeRuntimeApplicationMediation({
      runtime: "codex", factoryProvenance: "default-production", disposed: false,
      strictReasons: ["unmediated-execution-registered"], roleId: role.id,
      nativeInstanceId: session.nativeLifecycle!.instanceId,
      nativeLifecycleInstanceId: session.nativeLifecycle!.instanceId,
      appTools: ["probe", "run_shell"], configuredForeignMcpServers: [],
      nativeFact: native, applicationFact: () => fact, ...overrides,
    });
    const verified = composition();
    assert.ok(verified);
    assert.equal(verified.status, "verified"); assert.equal(verified.factory, "codex-chat");
    assert.deepEqual(verified.appTools, ["probe", "run_shell"]);
    assert.deepEqual(verified.foreignMcpServers, []); assert.deepEqual(verified.nativeBuiltinTools, []);
    assert.equal(composition({ nativeFact: undefined }), undefined, "N14/N27: no native evidence ⇒ no application path");
    assert.equal(composition({ strictReasons: ["native-tool-registry-binding-unverified"] }), undefined, "Codex whitelist only allows unmediated-execution-registered");
  } finally { await session.dispose(); }
});
