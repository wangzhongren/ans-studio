// E0 契约 §9.1/§9.2（delta P-1/P-2/P-3）：Pi 服务端工具启用即 fail-closed + legacy wrapper 条件转发。
// 归属：Pi适配器角色测试目录。
//
// 口径（全部离线，不跑真实模型、不发网络）：
// ① `ANS_PI_SERVER_TOOLS` 解析后非空 ⇒ `bindRole` **不提供** `inspectApplicationToolSurface`
//    （方法缺席；包装层 applicationMediation=unknown ⇒ 派发父门 fail-closed），只记内部诊断码
//    `pi-provider-server-tools-enabled-unverified`；默认关闭 ⇒ 事实与 P1-B 逐字一致（observed）。
// ② `wrapSession` 条件转发该可选方法：inner 有 ⇒ 绑定 inner 转发、结果逐字段一致；
//    inner 无 ⇒ 外壳保持缺失（不伪造）。
// 依赖隔离：不静态 import Pi 包；未安装时相关用例按既有惯例跳过。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isRuntimeApplicationToolSurfaceFacts,
  type RoleSession,
  type RuntimeApplicationToolSurfaceFacts,
  type SessionEvent,
  type ToolDefinition,
} from "../../src/model/runtime.ts";
import { createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { SERVER_TOOL_ENV } from "../../src/common/pi-adapter/server-tools.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { wrapSession } from "../../src/provider/pi/session.ts";
import { makeRole } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };
const config = resolvePiProviderConfig(
  { providerId: "e0-pi-delta", baseUrl: "https://e0-pi.invalid/", modelId: "e0-pi-model", apiKeyEnvVar: "E0_PI_FAKE", contextWindow: 32768 },
  { E0_PI_FAKE: "offline-placeholder" },
);

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

async function temp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "e0-pi-delta-"));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

/** `ANS_PI_SERVER_TOOLS` 的作用域夹具（保持其它用例零污染；与 server-tools-wire 同口径）。 */
async function withServerToolsEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env[SERVER_TOOL_ENV];
  if (value === undefined) delete process.env[SERVER_TOOL_ENV];
  else process.env[SERVER_TOOL_ENV] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[SERVER_TOOL_ENV];
    else process.env[SERVER_TOOL_ENV] = previous;
  }
}

/** 诊断落盘夹具：配置到临时目录；读取经 flush 后返回全部行。 */
async function withDiagnostics<T>(run: (readRows: () => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "e0-pi-diag-"));
  configureDiagnostics({ directory: dir });
  try {
    return await run(async () => {
      await flushDiagnostics();
      return readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>));
    });
  } finally {
    await disposeDiagnostics();
    rmSync(dir, { recursive: true, force: true });
  }
}

// —————————————————————— 真实 bindRole（faux 进程内模型） ——————————————————————

async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
  };
  return { dependencies };
}

function adapterOptions(dir: string, tools: readonly ToolDefinition[]) {
  return {
    runtime: "pi" as const,
    projectRoot: dir,
    skillRoot: dir,
    tools,
    interactionGate: createInteractionGate(),
    currentTurnId: () => "e0-pi-turn",
    promptTimeoutMs: 5000,
    config,
    logger: log,
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

test("P-1：ANS_PI_SERVER_TOOLS 启用 ⇒ bindRole 不提供 inspectApplicationToolSurface（fail-closed），只记内部诊断码", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await withServerToolsEnv("web_search", async () => {
    await withDiagnostics(async (readRows) => {
      await temp(async (dir) => {
        const sdk = await engine();
        const session = await createRealPiRuntimeAdapter(adapterOptions(dir, [tool("ans_alpha")]), sdk.dependencies).bindRole(makeRole());
        try {
          assert.equal(session.inspectApplicationToolSurface, undefined, "启用服务端工具时方法必须缺席（不伪造 unknown fact）");
          assert.equal(Object.prototype.hasOwnProperty.call(session, "inspectApplicationToolSurface"), false, "方法必须缺席而非值为 undefined 的伪造属性");
          const rows = (await readRows()).filter((row) => row["event"] === "pi-provider-server-tools-enabled-unverified");
          assert.equal(rows.length, 1, "内部诊断码恰一条");
          assert.equal(rows[0]!["state"], "unverified");
          assert.equal(rows[0]!["count"], 1);
        } finally {
          await session.dispose();
        }
      });
    });
  });
});

test("P-1：默认关闭（未设置 ANS_PI_SERVER_TOOLS）⇒ 应用面事实与 P1-B 一致（observed）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await withServerToolsEnv(undefined, async () => {
    await temp(async (dir) => {
      const sdk = await engine();
      const injected = ["ans_alpha", "run_shell"];
      const session = await createRealPiRuntimeAdapter(adapterOptions(dir, injected.map(tool)), sdk.dependencies).bindRole(makeRole());
      try {
        const inspect = session.inspectApplicationToolSurface;
        assert.ok(inspect, "默认关闭时必须提供应用面事实");
        const fact = inspect();
        assert.equal(isRuntimeApplicationToolSurfaceFacts(fact), true, "事实必须通过冻结结构 guard");
        assert.deepEqual(fact, {
          source: "application-mediated-tool-surface",
          nativeInstanceId: session.nativeLifecycle!.instanceId,
          roleId: makeRole().id,
          runtime: "pi",
          factory: "pi-custom-tools",
          status: "observed",
          observedAt: fact.observedAt,
          appTools: injected,
          foreignMcpServers: [],
          nativeBuiltinTools: [],
          reasons: [],
        });
      } finally {
        await session.dispose();
      }
    });
  });
});

// —————————————————————— wrapSession 条件转发（无 Pi 依赖） ——————————————————————

const FACT: RuntimeApplicationToolSurfaceFacts = {
  source: "application-mediated-tool-surface",
  nativeInstanceId: "native-instance-1",
  roleId: "Pi适配器",
  runtime: "pi",
  factory: "pi-custom-tools",
  status: "observed",
  observedAt: "2026-11-07T00:00:00.000Z",
  appTools: ["ans_alpha"],
  foreignMcpServers: ["srv-a"],
  nativeBuiltinTools: [],
  reasons: [],
};

function emptyEvents(): AsyncIterable<SessionEvent> {
  return (async function* () {})();
}

test("P-2：wrapSession 在 inner 有 inspectApplicationToolSurface 时绑定转发，结果逐字段一致", () => {
  const inner = {
    fact: FACT,
    async prompt() {},
    events: emptyEvents,
    async dispose() {},
    inspectApplicationToolSurface(): RuntimeApplicationToolSurfaceFacts { return this.fact; },
  };
  const wrapper = wrapSession(makeRole(), inner, {});
  assert.equal(typeof wrapper.inspectApplicationToolSurface, "function", "有方法 ⇒ 外壳必须转发");
  const forwarded = wrapper.inspectApplicationToolSurface!();
  assert.deepEqual(forwarded, FACT, "转发结果与 inner 原事实逐字段一致");
  assert.equal(isRuntimeApplicationToolSurfaceFacts(forwarded), true);
  // 绑定接收者：inner 方法读 this.fact；未绑定调用会拿不到 this.fact。
  assert.equal(forwarded, inner.fact);
});

test("P-2：wrapSession 在 inner 无 inspectApplicationToolSurface 时保持缺失（不伪造）", () => {
  const inner: RoleSession = {
    async prompt() {},
    events: emptyEvents,
    async dispose() {},
  };
  const wrapper = wrapSession(makeRole(), inner, {});
  assert.equal(wrapper.inspectApplicationToolSurface, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(wrapper, "inspectApplicationToolSurface"), false, "无方法 ⇒ 属性必须缺失");
});
