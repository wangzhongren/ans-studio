// test/测试/runtime-dispatch-gate-integration.test.ts
// P1-D + X-G：跨层集成——运行时包装层（src/service/runtime/session.ts）→ 真实 managed 会话证据
// （src/pipeline/orchestration/run-role.ts）→ 派发父门（判定实现唯一来源 = src/common/gates/index.ts；
// src/pipeline/orchestration/trunk-runtime.ts 只 import 并在 controller resume / validParent 两处调用），
// 覆盖 Claude/Pi/Codex 的严格路径与受限应用中介路径、nativeInstanceId 字面绑定、双路径互斥、
// prepareRoleDispatch 前后两次 validParent 复检（N17）、creatorReports/hub、controller resume
// 共用 predicate，以及 N15（应用中介证据不放宽写/发布/停稳门）。
//
// X-G 迁移：`evaluateChiefDispatchParent` 与判定类型改从 `src/common/gates/index.ts` import；
// 不再从 trunk-runtime 导入任何判定函数/类型（其临时桥接将在本单元由编排移除，本测试不依赖它）。
//
// 依据：团队计划 §7.1/§7.2（P1-D）、§8.2–§8.4；方案 P1.6 §11.1（P/N）、§12.1–§12.2；
// B1 §2、§3.2（只取证，不判验收）。
//
// 纪律：
// - 不运行真实模型 / Electron / CDP；不写产品源码；不修改既有断言、不加 skip。
// - 关键生产门（包装层组合、managed 证据投影、派发父门、Service 准备入口）全部使用真实实现；
//   只替换模型/引擎（demo 脚本或 fake provider），与 B1 §2.2「脚本只可替模型决定」一致。
// - fake managed session 经真实 openRoleSession 注册；本文件只读消费其证据，不手工伪造 managed 注册表。
// - 包装层对 custom provider 的 provenance 是 custom-override（生产规则），因此 fake provider 的
//   managed 会话在派发父门上按 fail-closed 拒绝；受限路径的 verified 正例由真实
//   composeRuntimeApplicationMediation（包装层唯一组合规则）+ 真实 evaluateChiefDispatchParent 取证。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";

import {
  evaluateChiefDispatchParent,
  type DispatchParentCoreFacts,
  type DispatchParentHostFacts,
} from "../../src/common/gates/index.ts";
import {
  prepareRoleDispatch,
  prepareControllerResume,
} from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  openRoleSession,
  createRuntimeAdapterFactory,
  inspectManagedRoleSessionEvidence,
} from "../../src/pipeline/orchestration/run-role.ts";
import { composeRuntimeApplicationMediation, type RuntimeApplicationMediationCompositionInput } from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { reportIdFor } from "../../src/common/runtime-core/report-provenance.ts";
import { stableWriteDecision } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RuntimeApplicationToolSurfaceFacts,
  RuntimeKind,
  RuntimeNativeToolSurfaceFacts,
  RuntimeSessionToolSurfaceFacts,
} from "../../src/model/runtime.ts";

const AT = "2026-11-07T00:00:00.000Z";
const NATIVE = "native-itest";
const SESSION = "chief-session-itest";
const TURN = "chief-turn-itest";
const FACTORY = { claude: "claude-sdk-mcp", pi: "pi-custom-tools", codex: "codex-chat" } as const;
type MediatedRuntime = keyof typeof FACTORY;

function hostFor(runtime: RuntimeKind, sessionId = SESSION, turnId = TURN, extra: Partial<DispatchParentHostFacts["parent"]> = {}): DispatchParentHostFacts {
  return { parent: { roleId: "chief", runtime, sessionId, turnId, inputAccepted: true, settled: false, kind: "message", ...extra } as DispatchParentHostFacts["parent"] };
}
function lifecycle(overrides: Record<string, unknown> = {}): NonNullable<DispatchParentCoreFacts["lifecycle"]> {
  return { turnId: TURN, stopRequested: false, activeTools: [{ name: "dispatch_task" }], native: { instanceId: NATIVE }, ...overrides } as unknown as NonNullable<DispatchParentCoreFacts["lifecycle"]>;
}
function applicationFact(overrides: Partial<RuntimeApplicationToolSurfaceFacts> = {}): RuntimeApplicationToolSurfaceFacts {
  return {
    source: "application-mediated-tool-surface", nativeInstanceId: NATIVE, roleId: "chief", runtime: "claude",
    factory: "claude-sdk-mcp", status: "observed", observedAt: AT,
    appTools: ["dispatch_task", "read_file"], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [], ...overrides,
  };
}
function nativeFact(overrides: Partial<RuntimeNativeToolSurfaceFacts> = {}): RuntimeNativeToolSurfaceFacts {
  return {
    source: "native-provider-tool-registry", nativeInstanceId: NATIVE, roleId: "chief", runtime: "codex",
    factory: "codex-chat", status: "observed", observedAt: AT,
    appTools: ["dispatch_task", "read_file"], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [], ...overrides,
  };
}
function composition(overrides: Partial<RuntimeApplicationMediationCompositionInput> = {}): RuntimeApplicationMediationCompositionInput {
  return {
    runtime: "claude", factoryProvenance: "default-production", disposed: false,
    strictReasons: ["native-tool-registry-binding-unverified"], roleId: "chief",
    nativeInstanceId: NATIVE, nativeLifecycleInstanceId: NATIVE,
    appTools: ["dispatch_task", "read_file"], configuredForeignMcpServers: [],
    applicationFact: () => applicationFact(), ...overrides,
  };
}
/**
 * 把包装层组合输出原样放进 Core 事实（只做字段搬运；不重写任何门条件）。
 * `strictStatus` 默认为 unknown：受限路径在生产包装层中只会于严格 status !== observed 时出现。
 */
function coreFromMediation(runtime: MediatedRuntime, mediation: NonNullable<RuntimeSessionToolSurfaceFacts["applicationMediation"]>,
  overrides: { surface?: Record<string, unknown>; lifecycle?: Record<string, unknown>; core?: Record<string, unknown> } = {}): DispatchParentCoreFacts {
  const surface: NonNullable<DispatchParentCoreFacts["toolSurface"]> = {
    status: "unknown", sessionId: SESSION, factoryProvenance: "default-production", nativeToolRegistry: "unknown",
    appTools: ["dispatch_task", "read_file"], configuredForeignMcpServers: [],
    ...(runtime === "codex" ? { native: { factory: "codex-chat", nativeInstanceId: NATIVE } } : {}),
    applicationMediation: mediation, ...overrides.surface,
  } as unknown as NonNullable<DispatchParentCoreFacts["toolSurface"]>;
  return { disposed: false, construction: "default-core", roleId: "chief", runtime,
    lifecycle: lifecycle(overrides.lifecycle), toolSurface: surface, ...overrides.core } as DispatchParentCoreFacts;
}
function reasonsOf(core: DispatchParentCoreFacts | undefined, host: DispatchParentHostFacts, hub = true): readonly string[] {
  const decision = evaluateChiefDispatchParent({ host, core, hub });
  return decision.ok ? [] : decision.reasons;
}
function projectConfig(root: string): ProjectConfig {
  return { projectRoot: root, skillRoot: path.join(root, "skill-root"), roles: {}, governanceModel: "trio", builtInRoles: ["chief"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:trusted-host" } } };
}

// —————————————— 1. 包装层唯一组合规则 → 派发父门（三运行时） ——————————————

test("P1-D：Claude/Pi 无 native 证据但应用面 verified 通过；Codex 受控 shell 走受限路径（P4/P6/P7 的跨层判定）", () => {
  for (const runtime of ["claude", "pi"] as const) {
    const composed = composeRuntimeApplicationMediation(composition({ runtime, applicationFact: () => applicationFact({ runtime, factory: FACTORY[runtime] }) }));
    assert.ok(composed, `${runtime}: 严格 unknown（native 证据结构性缺失）+ 应用面 observed ⇒ verified`);
    assert.equal(composed.status, "verified");
    assert.equal(composed.kind, "application-mediated-unknown-native");
    assert.equal("native" in composed, false, "applicationMediation 不自带 native 事实");
    assert.equal(composed.nativeInstanceId, NATIVE, "Amendment-1：绑定实例 id 必填且等于绑定期值");
    const core = coreFromMediation(runtime, composed);
    assert.deepEqual(evaluateChiefDispatchParent({ host: hostFor(runtime), core, hub: true }), { ok: true }, `${runtime}: 派发父门通过`);
    // N15 跨层字段事实：组合只产出受限证据，严格 status / nativeToolRegistry 仍为 unknown（写门条件不成立）。
    assert.equal(core.toolSurface!.status, "unknown");
    assert.equal(core.toolSurface!.nativeToolRegistry, "unknown");
  }
  // Codex 严格 observed 路径：原条件成立时通过（生产包装层的真实默认 Codex 严格 observed 由既有
  // runtime-core/application-mediation.test.ts 的真实默认会话用例覆盖；此处取证 Core 事实的接线）。
  const strictCodex = {
    disposed: false, construction: "default-core", roleId: "chief", runtime: "codex", lifecycle: lifecycle(),
    toolSurface: { status: "observed", sessionId: SESSION, factoryProvenance: "default-production", nativeToolRegistry: "application-mediated",
      appTools: ["dispatch_task", "read_file"], configuredForeignMcpServers: [], native: { factory: "codex-chat", nativeInstanceId: NATIVE } },
  } as unknown as DispatchParentCoreFacts;
  assert.deepEqual(evaluateChiefDispatchParent({ host: hostFor("codex"), core: strictCodex, hub: true }), { ok: true }, "Codex 严格 observed 路径通过");
  // Codex 受控 shell：严格路径因 unmediated-execution-registered 为 unknown；受限路径要求 native 事实绑定。
  const shellTools = ["dispatch_task", "run_shell", "start_background_task", "read_file"];
  const composed = composeRuntimeApplicationMediation(composition({
    runtime: "codex", strictReasons: ["unmediated-execution-registered"], appTools: shellTools,
    nativeFact: nativeFact({ appTools: shellTools }), applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat", appTools: shellTools }),
  }));
  assert.ok(composed, "Codex 受控 shell：白名单 reason + native 绑定成立 ⇒ verified");
  const core = coreFromMediation("codex", composed, { surface: { appTools: shellTools } });
  assert.deepEqual(evaluateChiefDispatchParent({ host: hostFor("codex"), core, hub: true }), { ok: true }, "Codex 受限路径通过");
  assert.equal(core.toolSurface!.status, "unknown", "严格路径本身仍 unknown，不冒充 observed");
  // Codex 无 native 事实 ⇒ 组合不出证据（N14/N27）。
  assert.equal(composeRuntimeApplicationMediation(composition({ runtime: "codex", strictReasons: ["unmediated-execution-registered"], nativeFact: undefined,
    applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }) })), undefined);
});

test("P1-D：nativeInstanceId 字面绑定——组合值传入派发父门后逐字比对（P1-A Amendment-1/N27）", () => {
  const composed = composeRuntimeApplicationMediation(composition({ runtime: "codex", strictReasons: ["unmediated-execution-registered"], nativeFact: nativeFact(),
    applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }) }));
  assert.ok(composed);
  const bound = "native-literal-binding";
  const withBound = { ...composed, nativeInstanceId: bound };
  const base = coreFromMediation("codex", withBound, { surface: { native: { factory: "codex-chat", nativeInstanceId: bound } }, lifecycle: { native: { instanceId: bound } } });
  assert.deepEqual(evaluateChiefDispatchParent({ host: hostFor("codex"), core: base, hub: true }), { ok: true }, "两侧同值通过");
  for (const [label, core] of [
    ["native 事实异值", coreFromMediation("codex", withBound, { surface: { native: { factory: "codex-chat", nativeInstanceId: "native-other" } } })],
    ["native 事实空串", coreFromMediation("codex", withBound, { surface: { native: { factory: "codex-chat", nativeInstanceId: "" } } })],
    ["mediation 空串", coreFromMediation("codex", { ...composed, nativeInstanceId: "" }, { surface: { native: { factory: "codex-chat", nativeInstanceId: "" } } })],
    ["lifecycle 绑定异值", coreFromMediation("codex", withBound, { surface: { native: { factory: "codex-chat", nativeInstanceId: bound } }, lifecycle: { native: { instanceId: "native-lifecycle-other" } } })],
  ] as const) assert.deepEqual(reasonsOf(core, hostFor("codex")), ["tool-surface-unknown", "evidence-identity-mismatch"], label);
});

test("P1-D：双路径互斥——observed + verified 拒绝；组合规则在严格 observed 时不产证据（N20/F15）", () => {
  assert.equal(composeRuntimeApplicationMediation(composition({ strictReasons: [] })), undefined, "严格路径已 observed ⇒ 包装层不构造 applicationMediation");
  const composed = composeRuntimeApplicationMediation(composition());
  assert.ok(composed);
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const core = coreFromMediation(runtime, composed, { surface: { status: "observed", nativeToolRegistry: "application-mediated" } });
    assert.deepEqual(reasonsOf(core, hostFor(runtime)), ["application-mediation-ambiguous"], `${runtime}: 双路径歧义`);
  }
});

test("P1-D：应用中介证据的负例经真实组合规则缺席，派发父门拒绝（N11/N12/N22/N23/N26）", () => {
  const cases: Array<[string, Partial<RuntimeApplicationMediationCompositionInput>]> = [
    ["native builtin（WebSearch）", { applicationFact: () => applicationFact({ nativeBuiltinTools: ["WebSearch"] }) }],
    ["appTools 与包装层注册表不一致", { appTools: ["dispatch_task"], applicationFact: () => applicationFact() }],
    ["外来 MCP 未枚举", { configuredForeignMcpServers: ["mcp-a"], applicationFact: () => applicationFact() }],
    ["外来 MCP 精确枚举（负例之外的对照）", { configuredForeignMcpServers: ["mcp-a"], applicationFact: () => applicationFact({ foreignMcpServers: ["mcp-a"] }) }],
    ["阻断 reason", { strictReasons: ["role-capability-callback-guard-unverified"] }],
    ["阻断 reason（registry 漂移）", { strictReasons: ["core-registry-changed-after-factory"] }],
    ["custom provider factory", { factoryProvenance: "custom-override" }],
    ["disposed", { disposed: true }],
    ["适配器事实 reasons 非空", { applicationFact: () => applicationFact({ reasons: ["web-search-enabled"] }) }],
    ["active dispatch 不在 appTools", { applicationFact: () => applicationFact({ appTools: ["read_file"] }), appTools: ["dispatch_task", "read_file"] }],
  ];
  for (const [label, overrides] of cases) {
    const composed = composeRuntimeApplicationMediation(composition(overrides));
    const exactForeign = label.includes("精确枚举");
    if (exactForeign) { assert.ok(composed, label); continue; }
    assert.equal(composed, undefined, label);
    // 证据缺席 ⇒ 门按 fail-closed 拒绝（不是 observed 冒充）。
    const core = coreFromMediation("claude", composed!, { surface: composed ? {} : { applicationMediation: undefined } });
    assert.ok(reasonsOf(core, hostFor("claude")).length > 0, label);
  }
  const exact = composeRuntimeApplicationMediation(composition({ configuredForeignMcpServers: ["mcp-a"], applicationFact: () => applicationFact({ foreignMcpServers: ["mcp-a"] }) }));
  assert.ok(exact);
  assert.deepEqual(evaluateChiefDispatchParent({ host: hostFor("claude"), core: coreFromMediation("claude", exact, { surface: { configuredForeignMcpServers: ["mcp-a"] } }), hub: true }), { ok: true });
});

// —————————————— 2. 真实 openRoleSession + 包装层：custom provider 一律 fail-closed ——————————————

type FakeManaged = { handle: Awaited<ReturnType<typeof openRoleSession>>; evidence: NonNullable<ReturnType<typeof inspectManagedRoleSessionEvidence>> };
function fakeRoleSession(roleId: string, sessionId?: string) {
  return {
    ...(sessionId !== undefined ? { sessionId } : {}), contextSource: "in-memory" as const, roleId,
    async prompt(): Promise<void> {},
    events: (): AsyncIterable<never> => ({ async *[Symbol.asyncIterator]() {} }),
    async dispose(): Promise<void> {},
  };
}
async function openFakeManaged(runtime: RuntimeKind, root: string, mode: "official-wrapper" | "custom-adapter"): Promise<FakeManaged> {
  const project = projectConfig(root);
  const provider = (options: { registerToolDisplayProfile?: (profile: { credentials: string[] }) => void }) => ({
    async composeContext(role: { cardText: string }) { return { systemPrompt: role.cardText }; },
    async bindRole(role: {
      id: string;
    }) {
      options.registerToolDisplayProfile?.({ credentials: [] });
      return fakeRoleSession(role.id);
    },
  });
  const factory = mode === "official-wrapper"
    ? createRuntimeAdapterFactory(project, runtime, { providerFactories: { [runtime]: provider } })
    : () => ({
      async composeContext(role: { cardText: string }) { return { systemPrompt: role.cardText }; },
      async bindRole(role: { id: string }) { return fakeRoleSession(role.id, `custom-adapter-${runtime}`); },
    });
  const handle = await openRoleSession({ roleId: "chief", project, runtime, autoRepin: false }, { createAdapter: factory });
  assert.equal(typeof handle.sessionId, "string", "managed 句柄必须有可查询的会话 id");
  const evidence = inspectManagedRoleSessionEvidence({ projectRoot: root, sessionId: handle.sessionId! });
  assert.ok(evidence, "真实 openRoleSession 注册的 managed 证据必须可读");
  return { handle, evidence };
}

test("P1-D：真实包装层的 custom provider（custom-override）经 managed 证据投影后在派发父门 fail-closed（N2/N10）", async () => {
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-p1d-custom-${runtime}-`));
    const { handle, evidence } = await openFakeManaged(runtime, root, "official-wrapper");
    try {
      assert.equal(evidence.construction, "default-core", "official 工厂 ⇒ default-core");
      assert.equal(evidence.roleId, "chief");
      assert.equal(evidence.runtime, runtime);
      assert.equal(evidence.disposed, false);
      assert.equal(evidence.toolSurface?.factoryProvenance, "custom-override", "provider 替换在包装层记为 custom-override");
      assert.equal("applicationMediation" in (evidence.toolSurface ?? {}), false, "custom factory 不获得受限证据");
      const reasons = reasonsOf(evidence, hostFor(runtime, handle.sessionId!, "turn-not-active"));
      if (runtime === "codex") assert.deepEqual(reasons, ["tool-surface-unknown", "custom-factory"], "Codex 严格+受限两段均拒绝");
      else assert.deepEqual(reasons, ["custom-factory"], `${runtime}: 受限路径拒绝 custom factory`);
    } finally { await handle.dispose(); }
  }
});

test("P1-D：非 official 的自定义 adapter 经 managed 证据显示 custom-adapter，派发父门拒绝（N9 身份侧）", async () => {
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-p1d-customadapter-${runtime}-`));
    const { handle, evidence } = await openFakeManaged(runtime, root, "custom-adapter");
    try {
      assert.equal(evidence.construction, "custom-adapter");
      assert.deepEqual(reasonsOf(evidence, hostFor(runtime, handle.sessionId!, "turn-not-active")), ["not-default-core"]);
    } finally { await handle.dispose(); }
  }
});

// —————————————— 3. 真实 managed 会话：准备入口两次 validParent 复检（N17） ——————————————

async function openDispatchableChief(root: string, options: { scriptArgs?: Record<string, unknown>; provenance?: unknown } = {}) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = { dispatch: 0 };
  const handle = await openRoleSession({
    roleId: "chief", project: projectConfig(root), runtime: "demo", autoRepin: false,
    dispatchTask: async () => { calls.dispatch++; await gate; return { ok: true, message: "accepted" }; },
  }, { runtimeOptions: { writeRoot: root, script: [{ name: "dispatch_task", args: options.scriptArgs ?? { roleId: "convener", task: "Integration dispatch", flowId: "itest" } }] } });
  const sending = handle.send("Please dispatch", options.provenance === undefined ? undefined : { inputProvenance: options.provenance as never })
    .catch(error => { throw error instanceof Error ? error : new Error(String(error)); });
  let facts;
  for (let attempt = 0; attempt < 400; attempt++) {
    facts = handle.inspectLifecycle?.();
    if (facts?.activeTools.some(tool => tool.name === "dispatch_task")) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(facts?.activeTools.some(tool => tool.name === "dispatch_task"), "真实 demo 会话必须进入 dispatch_task 活跃轮次");
  assert.equal(typeof facts?.turnId, "string");
  return { handle, sending, release, calls, turnId: facts!.turnId! };
}

test("P1-D：prepareRoleDispatch 前后两次 validParent——Service 已执行后证据变化 ⇒ 第二次拒绝（N17）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-p1d-recheck-"));
  const session = await openDispatchableChief(root);
  try {
    const host = {
      registration: { source: "native-directory-selection" as const, selectionId: "itest-selection", selectedRoot: root, projectRoot: root, selectedAt: AT, listingGeneration: 1 },
      parent: { roleId: "chief" as const, runtime: "demo" as const, sessionId: session.handle.sessionId!, turnId: session.turnId, inputAccepted: true as const, settled: false as const, kind: "message" },
    };
    const pending = prepareRoleDispatch({ projectRoot: root, fromRoleId: "chief", targetRoleId: "convener", flowId: "itest", hostInitialization: host });
    // 等 Service 侧出现真实副作用（第一检查已通过、Service 已开始执行），再让活跃 tool 结束改变证据。
    const sources = path.join(root, ".ans", "trunk", "initialization-sources");
    let observed: string[] = [];
    for (let attempt = 0; attempt < 2000; attempt++) {
      observed = await fs.readdir(sources).catch(() => []);
      if (observed.length) break;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.ok(observed.length >= 1, "第一 validParent 必须已通过且 Service 写出初始化来源（否则无法证明是第二次复检拒绝）");
    assert.equal(session.calls.dispatch, 1, "派发工具在本轮实际执行了一次");
    session.release();
    const result = await pending;
    assert.equal(result.ok, false, "第二次 validParent 必须拒绝");
    assert.equal(result.code, "trunk-verify-failed");
    assert.match(result.message, /actual active accepted chief dispatch turn/, "拒绝必须来自派发父门而非 Service 业务错误");
  } finally {
    session.release(); await session.sending.catch(() => undefined); await session.handle.dispose();
  }
});

test("P1-D：creatorReports/hub——真实 managed 证据的 handback provenance 通过 hub；缺 provenance 拒绝（N19）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-p1d-reports-"));
  const source = { roleId: "convener", runtime: "demo" as const, turnId: "report-turn-itest" };
  const report = { version: 1 as const, reportId: reportIdFor(source), source, taskId: "task-itest", origin: "submitted-report" as const, status: "completed" as const,
    summary: { text: "Integration report", truncated: false, redacted: false }, evidence: [], evidenceOmitted: 0, at: AT };
  assert.equal(await createRuntimeSessionStore({ projectRoot: root, roleId: "convener", runtime: "demo" }).saveReport!(report), "saved");
  const provenance = { version: 1 as const, kind: "handback" as const, deliveryId: "11111111-1111-4111-8111-111111111111", attemptId: "22222222-2222-4222-8222-222222222222",
    target: { roleId: "chief", runtime: "demo" as const }, reports: [report] };
  const creatorReports = [{ taskId: "task-itest", roleId: "convener", reportId: report.reportId, turnId: "report-turn-itest" }];
  const session = await openDispatchableChief(root, { provenance });
  try {
    const evidence = inspectManagedRoleSessionEvidence({ projectRoot: root, sessionId: session.handle.sessionId! });
    assert.equal(evidence?.turnInput?.turnId, session.turnId, "managed 证据必须记录本轮 turnInput");
    assert.equal(evidence?.turnInput?.provenance?.reports.length, 1);
    const host = { ...hostFor("demo", session.handle.sessionId!, session.turnId, { kind: "handback" }), creatorReports };
    assert.deepEqual(evaluateChiefDispatchParent({ host, core: evidence, hub: true }), { ok: true }, "hub=true + 真实 provenance ⇒ 通过");
    assert.deepEqual(reasonsOf(evidence, host, false), ["creator-reports-mismatch"], "hub=false 时 creatorReports 不通过（旧 validParent 行为）");
    // host 的 creatorReports 与证据不一致 ⇒ 拒绝（跨层消费真实 turnInput，而不是 host 自报）。
    const forgedHost = { ...hostFor("demo", session.handle.sessionId!, session.turnId, { kind: "handback" }), creatorReports: [{ ...creatorReports[0]!, reportId: "not-the-report" }] };
    assert.deepEqual(reasonsOf(evidence, forgedHost, true), ["creator-reports-mismatch"]);
  } finally {
    session.release(); await session.sending.catch(() => undefined); await session.handle.dispose();
  }
});

test("P1-D：controller resume 与 validParent 共用 predicate——有效证据到达 Service，证据变化后由门拒绝（P5）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-p1d-resume-"));
  const session = await openDispatchableChief(root);
  const resumeController = { taskId: "controller-task-itest", flowId: "itest", runId: "run-itest", reviewTaskId: "review-task-itest", reviewCloseOperationId: "close-op-itest" };
  const host = {
    registration: { source: "native-directory-selection" as const, selectionId: "itest-selection", selectedRoot: root, projectRoot: root, selectedAt: AT, listingGeneration: 1 },
    parent: { roleId: "chief" as const, runtime: "demo" as const, sessionId: session.handle.sessionId!, turnId: session.turnId, inputAccepted: true as const, settled: false as const, kind: "message" },
  };
  try {
    const viaService = await prepareControllerResume({ projectRoot: root, resumeController, hostInitialization: host });
    assert.equal(viaService.ok, false);
    assert.doesNotMatch(viaService.message ?? "", /Resume is not bound/, "门必须放行（拒绝来自 Service 业务校验，而不是父门）");
    assert.match(viaService.message ?? "", /actual Chief-created final review/);
    session.release();
    await session.sending.catch(() => undefined);
    const afterChange = await prepareControllerResume({ projectRoot: root, resumeController, hostInitialization: host });
    assert.equal(afterChange.ok, false);
    assert.match(afterChange.message ?? "", /Resume is not bound to the actual current Chief dispatch input/, "证据变化后共享 predicate 拒绝");
  } finally {
    session.release(); await session.sending.catch(() => undefined); await session.handle.dispose();
  }
});

// —————————————— 4. N15：应用中介证据不放宽写/发布/停稳门 ——————————————

test("P1-D：N15——写/发布/停稳门不消费 applicationMediation，受限证据不升级严格字段", async () => {
  const composed = composeRuntimeApplicationMediation(composition({ runtime: "pi", applicationFact: () => applicationFact({ runtime: "pi", factory: "pi-custom-tools" }) }));
  assert.ok(composed);
  // inspectInitializationProtection 只接受严格 observed + nativeToolRegistry application-mediated
  // （按符号取源码段，不绑定行号）；应用中介证据不会改变这两个字段（包装层返回 status unknown /
  // nativeToolRegistry unknown）。
  const surface: RuntimeSessionToolSurfaceFacts = { source: "core-provider-assembly", sessionId: SESSION, roleId: "chief", runtime: "pi",
    status: "unknown", appTools: ["dispatch_task", "read_file"], configuredForeignMcpServers: [], factoryProvenance: "default-production",
    nativeToolRegistry: "unknown", filesystemConfinement: "unknown", reasons: ["native-tool-registry-binding-unverified"], applicationMediation: composed };
  assert.notEqual(surface.status, "observed", "受限证据不把严格 status 升级为 observed");
  assert.notEqual(surface.nativeToolRegistry, "application-mediated", "受限证据不改写 nativeToolRegistry");
  // stable-write 的一次性许可判定没有应用中介证据入参（run-role.ts stable-write 段只读 factoryProvenance）；
  // 无许可时对 stable 文件一律拒绝，与是否存在 applicationMediation 无关。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-p1d-stable-"));
  const denied = stableWriteDecision({ projectRoot: root, relPath: "角色卡/chief/role-card.md", sha256: "a".repeat(64) });
  assert.equal(denied.allowed, false, "无一次性许可 ⇒ stable-write 拒绝（不因应用中介证据放行）");
  // 源码消费面：run-role.ts（stable-write/停稳门所在层）零引用；trunk-runtime.ts 的写门不读应用中介证据。
  const roleSource = await fs.readFile(path.join(process.cwd(), "src/pipeline/orchestration/run-role.ts"), "utf8");
  assert.equal((roleSource.match(/applicationMediation/g) ?? []).length, 0, "run-role.ts 不消费 applicationMediation");
  const trunkSource = await fs.readFile(path.join(process.cwd(), "src/pipeline/orchestration/trunk-runtime.ts"), "utf8");
  // X-G 结构守卫（与切换后结构一致；X-G temporary bridge 移除后同样成立）：
  // 判定实现唯一来源 = gates；trunk-runtime 只 import + 恰两处调用，无本地判定实现/本地判定类型。
  assert.match(trunkSource, /import\s*\{[^}]*\bevaluateChiefDispatchParent\b[^}]*\}\s*from\s*"\.\.\/\.\.\/common\/gates\/index\.ts"/,
    "trunk-runtime 必须从 src/common/gates/index.ts import 唯一判定实现");
  assert.equal((trunkSource.match(/evaluateChiefDispatchParent\(\{/g) ?? []).length, 2,
    "trunk-runtime 恰两处调用（controller resume hub:true + validParent hub 变量）");
  assert.doesNotMatch(trunkSource, /function\s+evaluateChiefDispatchParent\s*\(/, "trunk-runtime 不得保留本地判定实现");
  assert.doesNotMatch(trunkSource, /^\s*(?:export\s+)?(?:interface|type)\s+DispatchParent\w+/m, "trunk-runtime 不得本地声明 gates 判定类型（Host/Core/Decision/Reason）");
  for (const symbol of ["APPLICATION_MEDIATION_FACTORY", "sameNameSet", "activeDispatchToolName", "dispatchParentIdentityFailure",
    "dispatchParentTailFailure", "strictNativeFailure", "restrictedApplicationMediationFailure"]) {
    assert.equal((trunkSource.match(new RegExp(`\\b${symbol}\\b`, "g")) ?? []).length, 0, `trunk-runtime 不得保留内联实现 helper：${symbol}`);
  }
  // 判定层已整体移出 trunk-runtime：本文件 0 次引用应用中介证据（写/发布/停稳门不消费）。
  assert.equal((trunkSource.match(/applicationMediation/g) ?? []).length, 0, "trunk-runtime 不消费 applicationMediation");
  // 语义断言（保持）：inspectInitializationProtection 的写门仍要求严格 observed + application-mediated 注册表证据。
  const protectionStart = trunkSource.indexOf("async function inspectInitializationProtection");
  const protectionEnd = trunkSource.indexOf("export function createGitRoleRuntime", protectionStart);
  assert.ok(protectionStart > 0 && protectionEnd > protectionStart, "inspectInitializationProtection 源码段必须可按符号定位");
  const protectionSource = trunkSource.slice(protectionStart, protectionEnd);
  assert.match(protectionSource, /surface\.status !== "observed"/, "写/发布/停稳门仍要求严格 observed（N15 未放宽）");
  assert.match(protectionSource, /surface\.nativeToolRegistry !== "application-mediated"/, "写/发布/停稳门仍要求 application-mediated registry 证据（N15 未放宽）");
  assert.equal((protectionSource.match(/applicationMediation/g) ?? []).length, 0, "inspectInitializationProtection 不读应用中介证据");
});
