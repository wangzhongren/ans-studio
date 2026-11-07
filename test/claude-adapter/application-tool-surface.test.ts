// P1-B（P1.6 §4.6/§5.2/§12.1）：Claude 应用中介工具面事实的适配器接线测试。
// 只替换 SDK 传输（loadSdk/loadZod 桩件），不调用真实模型；断言「实际构造面 = 报告面」：
// appTools = 实际 registerTool 的 ANS 工具名，foreignMcpServers = 实际注入的 mcpServers 外来键，
// nativeBuiltinTools = 实际 tools 中的 native builtin（ANS_CLAUDE_WEB_SEARCH 启用时 WebSearch）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as z from "zod";
import type * as SDK from "@anthropic-ai/claude-agent-sdk";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { composeRuntimeApplicationMediation, type RuntimeApplicationMediationCompositionInput } from "../../src/service/runtime/session.ts";
import { isRuntimeApplicationToolSurfaceFacts } from "../../src/model/runtime.ts";
import type { InteractionGate, RuntimeProviderOptions, ToolDefinition } from "../../src/model/runtime.ts";
import type { ResolvedRole } from "../../src/model/role.ts";

const role: ResolvedRole = {
  id: "claude-surface-fixture", kind: "project", cardText: "# Claude surface fixture",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
};
const gate = (): InteractionGate => {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const emit = () => { for (const listener of listeners) listener(waiting > 0); };
  return { begin() { waiting++; emit(); }, end() { waiting--; emit(); }, isWaiting: () => waiting > 0,
    onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
};
const tool = (name: string, inputSchema: Record<string, unknown> = { type: "object", properties: { value: { type: "string" } } }): ToolDefinition => ({
  name, description: `${name} fixture`, inputSchema, handler: async () => ({ ok: true, message: `${name} ok` }),
});

type FakeSdk = {
  /** Actual Options objects the adapter passed to sdk.query (one per constructed engine). */
  configurations: SDK.Options[];
  /** Actual target names each per-engine stub ANS MCP server received through registerTool. */
  registrations: string[][];
  dependencies: { env: Record<string, string | undefined>; loadSdk: () => Promise<Pick<typeof SDK, "query" | "createSdkMcpServer">>; loadZod: () => Promise<typeof z> };
};
/** Only transport is fake: the adapter really builds Options/registers tools; the stub records both. */
function fakeSdk(extraEnv: Record<string, string | undefined> = {}): FakeSdk {
  const configurations: SDK.Options[] = [];
  const registrations: string[][] = [];
  const createSdkMcpServer = ((_config: unknown) => {
    const names: string[] = [];
    registrations.push(names);
    return {
      instance: { registerTool(name: string, _toolConfig: unknown, _handler: unknown) { names.push(name); } },
      timeout: 0,
    };
  }) as unknown as typeof SDK.createSdkMcpServer;
  const query = (({ prompt, options }: { prompt: string | AsyncIterable<SDK.SDKUserMessage>; options?: SDK.Options }) => {
    assert.ok(options);
    configurations.push(options);
    const generator = (async function* () {
      for await (const user of prompt as AsyncIterable<SDK.SDKUserMessage>) {
        const promptText = typeof user.message.content === "string"
          ? user.message.content
          : user.message.content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await options!.hooks!.UserPromptSubmit![0]!.hooks[0]!({
          hook_event_name: "UserPromptSubmit", prompt_id: user.uuid, prompt: promptText,
          session_id: "surface-fixture", transcript_path: "fixture", cwd: options!.cwd!,
        }, undefined, { signal: options!.abortController!.signal });
        yield { type: "result", subtype: "success", is_error: false,
          session_id: "surface-fixture", user_message_uuid: user.uuid } as SDK.SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() {},
      async mcpServerStatus() { return []; },
    }) as unknown as SDK.Query;
  }) as unknown as typeof SDK.query;
  return { configurations, registrations, dependencies: {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-surface-secret", ...extraEnv },
    loadSdk: async () => ({ query, createSdkMcpServer }),
    loadZod: async () => z,
  } };
}
const options = (root: string, tools: readonly ToolDefinition[], overrides: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions => ({
  runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate: gate(),
  currentTurnId: () => "surface-turn", requestAttemptMax: 1, ...overrides,
});
async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ans-claude-surface-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const prefixed = (names: readonly string[]): string[] => names.map((name) => `mcp__ans__${name}`);

test("application surface: default report equals the actually constructed ANS/foreign/WebSearch face", async () => fixture(async (root) => {
  const tools = [tool("read_file"), tool("write_file"), tool("run_shell"), tool("start_background_task")];
  const sdk = fakeSdk();
  const session = await createClaudeRuntimeAdapter(options(root, tools, {
    installedMcpServers: [
      { name: "ext-one", command: process.execPath, args: ["-e", "process.exit(0)"] },
      { name: "ext_two", command: process.execPath, args: ["-e", "process.exit(0)"] },
    ],
  }), sdk.dependencies).bindRole(role);
  try {
    // No engine has been constructed yet: no actual surface exists, so no observed fact is invented.
    const before = session.inspectApplicationToolSurface!();
    assert.equal(isRuntimeApplicationToolSurfaceFacts(before), true);
    assert.equal(before.status, "unknown");
    assert.deepEqual(before.appTools, []);
    assert.deepEqual(before.foreignMcpServers, []);
    assert.deepEqual(before.nativeBuiltinTools, []);
    assert.equal(before.nativeInstanceId, session.nativeLifecycle!.instanceId);

    await session.prompt("surface one");
    assert.equal(sdk.configurations.length, 1);
    const actual = sdk.configurations[0]!;
    const facts = session.inspectApplicationToolSurface!();
    assert.equal(isRuntimeApplicationToolSurfaceFacts(facts), true);
    assert.equal(facts.source, "application-mediated-tool-surface");
    assert.equal(facts.runtime, "claude");
    assert.equal(facts.factory, "claude-sdk-mcp");
    assert.equal(facts.status, "observed");
    assert.deepEqual(facts.reasons, []);
    assert.equal(facts.roleId, role.id);
    assert.equal(facts.nativeInstanceId, session.nativeLifecycle!.instanceId);
    assert.equal(Number.isFinite(Date.parse(facts.observedAt)), true);

    // ANS tools: report == actual registerTool targets == the tools/allowedTools construction input.
    assert.deepEqual(facts.appTools, tools.map((entry) => entry.name));
    assert.deepEqual(facts.appTools, sdk.registrations[0]);
    assert.deepEqual(actual.allowedTools, [...prefixed(facts.appTools), "mcp__ext-one", "mcp__ext_two"]);

    // Foreign MCP: report == actual injected mcpServers keys minus the adapter-owned `ans` server.
    assert.deepEqual(Object.keys(actual.mcpServers!), ["ans", "ext-one", "ext_two"]);
    assert.deepEqual(facts.foreignMcpServers, ["ext-one", "ext_two"]);

    // Native builtins: report == actual `tools` exactly (default off ⇒ empty; shell is an app tool).
    assert.equal(facts.nativeBuiltinTools.includes("run_shell"), false);
    assert.equal(facts.nativeBuiltinTools.includes("start_background_task"), false);
    assert.deepEqual(actual.tools, []);
    assert.deepEqual([...facts.nativeBuiltinTools], actual.tools);

    // Returned arrays are copies; callers cannot mutate the stored construction surface.
    (facts.appTools as string[]).push("tampered-tool");
    (facts.foreignMcpServers as string[]).push("tampered-server");
    (facts.nativeBuiltinTools as string[]).push("WebSearch");
    const again = session.inspectApplicationToolSurface!();
    assert.deepEqual(again.appTools, tools.map((entry) => entry.name));
    assert.deepEqual(again.foreignMcpServers, ["ext-one", "ext_two"]);
    assert.deepEqual(again.nativeBuiltinTools, []);
  } finally { await session.dispose(); }
}));

test("application surface: ANS_CLAUDE_WEB_SEARCH=1/on counts WebSearch as a native builtin, exactly as constructed", async () => fixture(async (root) => {
  for (const bit of ["1", "on", " ON "]) {
    const sdk = fakeSdk({ ANS_CLAUDE_WEB_SEARCH: bit });
    const session = await createClaudeRuntimeAdapter(options(root, [tool("probe")]), sdk.dependencies).bindRole(role);
    try {
      await session.prompt(`surface ${bit}`);
      const actual = sdk.configurations[0]!;
      const facts = session.inspectApplicationToolSurface!();
      assert.equal(isRuntimeApplicationToolSurfaceFacts(facts), true);
      assert.equal(facts.status, "observed", bit);
      assert.deepEqual(facts.appTools, ["probe"], bit);
      assert.deepEqual(facts.nativeBuiltinTools, ["WebSearch"], bit);
      assert.deepEqual(actual.tools, ["WebSearch"], bit);
      assert.deepEqual(facts.nativeBuiltinTools, actual.tools, bit);
      assert.deepEqual(actual.allowedTools, ["mcp__ans__probe", "WebSearch"], bit);
      assert.deepEqual(facts.foreignMcpServers, [], bit);
      assert.ok(sdk.registrations[0]!.includes("probe") && !sdk.registrations[0]!.includes("WebSearch"), bit);
    } finally { await session.dispose(); }
  }
}));

test("application surface: judge sessions force WebSearch off and keep the reported builtin face empty", async () => fixture(async (root) => {
  const judgeTools = [tool("judge_read_file"), tool("judge_list_dir"), tool("report_shell_judgement")];
  const sdk = fakeSdk({ ANS_CLAUDE_WEB_SEARCH: "1" });
  const session = await createClaudeRuntimeAdapter(options(root, judgeTools, { judgeMode: true }), sdk.dependencies).bindRole(role);
  try {
    await session.prompt("judge surface");
    const actual = sdk.configurations[0]!;
    const facts = session.inspectApplicationToolSurface!();
    assert.equal(isRuntimeApplicationToolSurfaceFacts(facts), true);
    assert.equal(facts.status, "observed");
    assert.deepEqual(facts.appTools, judgeTools.map((entry) => entry.name));
    assert.deepEqual(facts.foreignMcpServers, []);
    // The capability bit is ignored in judge mode: the actual `tools` face is empty and so is the fact.
    assert.deepEqual(actual.tools, []);
    assert.deepEqual(facts.nativeBuiltinTools, []);
    assert.deepEqual(actual.allowedTools, prefixed(facts.appTools));
    assert.equal(actual.disallowedTools!.includes("WebSearch"), true);
    assert.deepEqual(Object.keys(actual.mcpServers!), ["ans"]);
  } finally { await session.dispose(); }
}));

test("application surface: sessions bind to their own native instance; empty foreign config reports empty", async () => fixture(async (root) => {
  const sdk = fakeSdk();
  const adapter = createClaudeRuntimeAdapter(options(root, [tool("probe")]), sdk.dependencies);
  const first = await adapter.bindRole(role);
  const second = await adapter.bindRole(role);
  try {
    assert.notEqual(first.nativeLifecycle!.instanceId, second.nativeLifecycle!.instanceId);
    await first.prompt("first surface");
    await second.prompt("second surface");
    const firstFact = first.inspectApplicationToolSurface!();
    const secondFact = second.inspectApplicationToolSurface!();
    assert.equal(firstFact.nativeInstanceId, first.nativeLifecycle!.instanceId);
    assert.equal(secondFact.nativeInstanceId, second.nativeLifecycle!.instanceId);
    assert.notEqual(firstFact.nativeInstanceId, secondFact.nativeInstanceId);
    assert.equal(firstFact.roleId, role.id);
    assert.equal(firstFact.runtime, "claude");
    assert.equal(firstFact.factory, "claude-sdk-mcp");
    assert.deepEqual(firstFact.foreignMcpServers, []);
    assert.deepEqual(Object.keys(sdk.configurations[0]!.mcpServers!), ["ans"]);
    assert.deepEqual(sdk.configurations[0]!.allowedTools, ["mcp__ans__probe"]);
  } finally { await first.dispose(); await second.dispose(); }
}));

test("application surface: the frozen wrapper verifies the exact report only (WebSearch/drift fail closed)", async () => fixture(async (root) => {
  const sdk = fakeSdk();
  const session = await createClaudeRuntimeAdapter(options(root, [tool("probe")], {
    installedMcpServers: [{ name: "ext", command: process.execPath, args: ["-e", "process.exit(0)"] }],
  }), sdk.dependencies).bindRole(role);
  try {
    await session.prompt("compose");
    const instance = session.nativeLifecycle!.instanceId;
    const compose = (overrides: Partial<RuntimeApplicationMediationCompositionInput> = {}) => composeRuntimeApplicationMediation({
      runtime: "claude", factoryProvenance: "default-production", disposed: false,
      strictReasons: ["native-tool-registry-binding-unverified"], roleId: role.id,
      nativeInstanceId: instance, nativeLifecycleInstanceId: instance,
      appTools: ["probe"], configuredForeignMcpServers: ["ext"],
      applicationFact: () => session.inspectApplicationToolSurface!(), ...overrides,
    });
    const verified = compose();
    assert.equal(verified?.status, "verified");
    assert.deepEqual(verified?.appTools, ["probe"]);
    assert.deepEqual(verified?.foreignMcpServers, ["ext"]);
    assert.deepEqual(verified?.nativeBuiltinTools, []);
    assert.deepEqual(verified?.reasons, []);
    // A hidden/extra foreign server or a stale instance identity must fail closed.
    assert.equal(compose({ configuredForeignMcpServers: ["ext", "hidden"] }), undefined);
    assert.equal(compose({ nativeInstanceId: "other-instance" }), undefined);
  } finally { await session.dispose(); }

  // WebSearch counts as a native builtin; the application-mediation path must not verify (N22).
  const web = fakeSdk({ ANS_CLAUDE_WEB_SEARCH: "1" });
  const webSession = await createClaudeRuntimeAdapter(options(root, [tool("probe")]), web.dependencies).bindRole(role);
  try {
    await webSession.prompt("compose web");
    const instance = webSession.nativeLifecycle!.instanceId;
    assert.deepEqual(webSession.inspectApplicationToolSurface!().nativeBuiltinTools, ["WebSearch"]);
    assert.equal(composeRuntimeApplicationMediation({
      runtime: "claude", factoryProvenance: "default-production", disposed: false,
      strictReasons: ["native-tool-registry-binding-unverified"], roleId: role.id,
      nativeInstanceId: instance, nativeLifecycleInstanceId: instance,
      appTools: ["probe"], configuredForeignMcpServers: [],
      applicationFact: () => webSession.inspectApplicationToolSurface!(),
    }), undefined);
  } finally { await webSession.dispose(); }
}));

test("application surface: a tool registration failure never becomes an observed report", async () => fixture(async (root) => {
  // The second tool's schema is rejected after the first one already registered, so the engine never
  // constructs. The fact must stay unavailable instead of reporting the partial registration.
  const tools = [tool("registered_first"), tool("rejected_second", { type: "object", patternProperties: {} })];
  const sdk = fakeSdk();
  const session = await createClaudeRuntimeAdapter(options(root, tools), sdk.dependencies).bindRole(role);
  try {
    await assert.rejects(session.prompt("broken surface"));
    assert.equal(sdk.configurations.length, 0);
    assert.deepEqual(sdk.registrations[0], ["registered_first"]);
    const facts = session.inspectApplicationToolSurface!();
    assert.equal(isRuntimeApplicationToolSurfaceFacts(facts), true);
    assert.equal(facts.status, "unknown");
    assert.deepEqual(facts.appTools, []);
    assert.equal(facts.nativeInstanceId, session.nativeLifecycle!.instanceId);
  } finally { await session.dispose(); }
}));
