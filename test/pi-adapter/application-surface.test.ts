// P1-B（P1.6 §4.6 Pi 行）：应用中介工具面事实 `inspectApplicationToolSurface()`。
// 归属：Pi适配器角色测试目录。
//
// 口径（全部离线，不跑真实模型）：
// ① 报告面 = 实际构造面：appTools＝实际 customTools 名；foreignMcpServers＝实际注入 MCP 白名单；
//    nativeBuiltinTools＝实际 native builtin（生产路径固定 noTools:"builtin" ⇒ []）。
// ② 身份绑定：nativeInstanceId 恰等于同一会话 nativeLifecycle.instanceId。
// ③ fail-closed：无 bind/observation、或未提供实际构造面快照 ⇒ 不提供事实（方法缺席）。
// ④ 桩件接缝（makeRoleSession / RoleSessionDeps）与真实 bindRole（faux 进程内模型）两层都断言，
//    覆盖「实际构造面 = 报告面」（含非空外来 MCP）。
// 依赖隔离：不静态 import Pi 包；未安装时相关用例按既有惯例跳过。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isRuntimeApplicationToolSurfaceFacts,
  type InstalledMcpServerV1,
  type SessionEvent,
  type ToolDefinition,
} from "../../src/model/runtime.ts";
import {
  createRealPiRuntimeAdapter,
  makeRoleSession,
  type PromptCapableSession,
  type RoleSessionDeps,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { createEventQueue } from "../../src/common/pi-adapter/event-queue.ts";
import { makeRole } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };
const config = resolvePiProviderConfig(
  { providerId: "p1b-app-surface", baseUrl: "https://p1b.invalid/", modelId: "p1b-model", apiKeyEnvVar: "P1B_FAKE", contextWindow: 32768 },
  { P1B_FAKE: "offline-placeholder" },
);
const SERVER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "mcp-fixture-server.ts");
const INSTANCE = "native-instance-fixed";

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

async function temp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "p1b-app-surface-"));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

// —————————————————————— 1. makeRoleSession 桩件（无 Pi 依赖） ——————————————————————

function stubSession(): PromptCapableSession {
  return { async prompt() {}, async abort() {}, dispose() {} };
}

function makeDeps(overrides: Partial<RoleSessionDeps> = {}): RoleSessionDeps {
  return {
    session: stubSession(),
    promptMs: 30000,
    gate: createInteractionGate(),
    emit: () => {},
    log,
    queue: createEventQueue<SessionEvent>(),
    unsubscribe: () => {},
    ...overrides,
  };
}

test("fail-closed：无 observation/bind 或未提供实际构造面 ⇒ 不提供 inspectApplicationToolSurface", () => {
  const surface = { appTools: ["read_file"], foreignMcpServers: [], nativeBuiltinTools: [] };
  const observation = { roleId: "pi-role", nativeSessionId: "native-1", mcpTransports: [] };
  const cases: [string, Partial<RoleSessionDeps>][] = [
    ["无 observation、无构造面", {}],
    ["有构造面、无 observation（无 bind）", { applicationToolSurface: surface }],
    ["有 observation、无实际构造面快照", { nativeObservation: observation }],
  ];
  for (const [label, overrides] of cases) {
    assert.equal(makeRoleSession(makeDeps(overrides)).inspectApplicationToolSurface, undefined, label);
  }
});

test("桩件：报告面 = 实际构造面快照；nativeInstanceId 绑定同一 nativeLifecycle.instanceId", () => {
  const appTools = ["read_file", "write_file", "run_shell"];
  const foreignMcpServers = ["srv-a", "srv-b"];
  const roleSession = makeRoleSession(makeDeps({
    applicationToolSurface: { appTools, foreignMcpServers, nativeBuiltinTools: [] },
    nativeObservation: { roleId: "pi-role", nativeSessionId: "native-1", mcpTransports: [] },
  }));
  const fact = roleSession.inspectApplicationToolSurface!();
  assert.equal(isRuntimeApplicationToolSurfaceFacts(fact), true, "报告事实必须通过冻结结构 guard");
  assert.deepEqual(fact, {
    source: "application-mediated-tool-surface",
    nativeInstanceId: roleSession.nativeLifecycle!.instanceId,
    roleId: "pi-role",
    runtime: "pi",
    factory: "pi-custom-tools",
    status: "observed",
    observedAt: fact.observedAt,
    appTools,
    foreignMcpServers,
    nativeBuiltinTools: [],
    reasons: [],
  });
  assert.equal(fact.nativeInstanceId, roleSession.nativeLifecycle!.instanceId, "身份绑定同一实例");
  assert.ok(!Number.isNaN(Date.parse(fact.observedAt)), "observedAt 为可解析时间");

  // 返回值是副本：调用方改写返回值不影响下一次读取。
  (fact.appTools as string[]).push("tampered-return");
  (fact.foreignMcpServers as string[]).push("tampered-return");
  const again = roleSession.inspectApplicationToolSurface!();
  assert.deepEqual(again.appTools, appTools);
  assert.deepEqual(again.foreignMcpServers, foreignMcpServers);

  // 构造期快照：传入数组在 bind 后被改写也不让报告面漂移。
  appTools.push("late-mutation");
  foreignMcpServers.push("late-mutation");
  const snapshot = roleSession.inspectApplicationToolSurface!();
  assert.deepEqual(snapshot.appTools, ["read_file", "write_file", "run_shell"]);
  assert.deepEqual(snapshot.foreignMcpServers, ["srv-a", "srv-b"], "外来 MCP 精确枚举、不漂移");
});

test("桩件：nativeBuiltinTools 如实上报（不硬编码为空）——启用即非空，供包装层 fail-closed", () => {
  const roleSession = makeRoleSession(makeDeps({
    applicationToolSurface: { appTools: ["read_file"], foreignMcpServers: [], nativeBuiltinTools: ["bash", "read"] },
    nativeObservation: { roleId: "pi-role", nativeSessionId: "native-1", mcpTransports: [] },
  }));
  const fact = roleSession.inspectApplicationToolSurface!();
  assert.deepEqual(fact.nativeBuiltinTools, ["bash", "read"], "实际启用的 builtin 必须如实报告，不得报空");
});

// —————————————————————— 2. 真实 bindRole（faux 进程内模型） ——————————————————————

async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  let constructed: Parameters<typeof pi.createAgentSession>[0] | undefined;
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => {
      const real = await import("@earendil-works/pi-coding-agent");
      return {
        ...real,
        async createAgentSession(input: Parameters<typeof real.createAgentSession>[0]) {
          constructed = input;
          const out = await real.createAgentSession(input);
          native = out.session;
          return out;
        },
      } as typeof real;
    },
  };
  return { ai, faux, dependencies, get native() { return native!; }, get constructed() { return constructed!; } };
}

function adapterOptions(dir: string, tools: readonly ToolDefinition[], mcpServers?: readonly InstalledMcpServerV1[]) {
  return {
    runtime: "pi" as const,
    projectRoot: dir,
    skillRoot: dir,
    tools,
    interactionGate: createInteractionGate(),
    currentTurnId: () => "p1b-turn",
    promptTimeoutMs: 5000,
    config,
    logger: log,
    ...(mcpServers !== undefined ? { installedMcpServers: mcpServers, mcpStartupWaitMs: 0 } : {}),
  };
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} fixture`,
    inputSchema: { type: "object", properties: {} },
    async handler() { return { ok: true, message: `${name} ok` }; },
  };
}

function stdioServer(name: string): InstalledMcpServerV1 {
  return { name, command: process.execPath, args: [SERVER_SCRIPT, `--name=${name}`, "--tools=echo"] };
}

test("真实 bindRole：appTools = 实际注入的 customTools 名；noTools=builtin ⇒ nativeBuiltinTools 为空", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const injected = ["ans_alpha", "write_file", "run_shell"];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, injected.map(tool)), sdk.dependencies).bindRole(makeRole());
    try {
      assert.equal(sdk.constructed.noTools, "builtin", "生产构造固定关闭 native builtin");
      assert.deepEqual(sdk.native.getActiveToolNames(), injected, "实际活动面 = 注入工具（构造期）");
      const fact = session.inspectApplicationToolSurface!();
      assert.deepEqual(fact.appTools, injected, "报告面 = 实际 customTools");
      assert.deepEqual(fact.appTools, sdk.native.getActiveToolNames(), "报告面 = 实际构造面");
      assert.deepEqual(fact.foreignMcpServers, [], "未配置外来 MCP ⇒ 精确空集");
      assert.deepEqual(fact.nativeBuiltinTools, [], "noTools=builtin ⇒ 实际 native builtin 为空");
      assert.equal(fact.nativeInstanceId, session.nativeLifecycle!.instanceId);
      assert.equal(fact.roleId, makeRole().id);
      assert.equal(fact.runtime, "pi");
      assert.equal(fact.factory, "pi-custom-tools");
      assert.equal(fact.status, "observed");
      assert.deepEqual(fact.reasons, []);
    } finally {
      await session.dispose();
    }
  });
});

test("真实 bindRole：foreignMcpServers 精确枚举实际注入的 MCP 白名单（允许非空）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const servers = [stdioServer("srv-a"), stdioServer("srv-b")];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, [tool("ans_alpha")], servers), sdk.dependencies).bindRole(makeRole());
    try {
      const fact = session.inspectApplicationToolSurface!();
      assert.deepEqual(fact.foreignMcpServers, ["srv-a", "srv-b"], "非空外来 MCP 精确枚举（原名，不静默省略）");
      assert.deepEqual(fact.appTools, ["ans_alpha"], "MCP 工具不属于应用注册面 appTools");
      assert.deepEqual(fact.nativeBuiltinTools, []);
      assert.equal(fact.nativeInstanceId, session.nativeLifecycle!.instanceId);
    } finally {
      await session.dispose();
    }
  });
});
