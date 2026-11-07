// test/编排/trunk-dispatch-parent.test.ts
// P1-C（D-minimal）+ X-G：派发父门唯一纯函数 `evaluateChiefDispatchParent` 正负例矩阵 + 结构守卫。
//
// 依据：P1.6 §4.4/§4.5/§11.1（P1–P7、N1–N28 适用于本层的部分）；团队计划 §6.5/§7.2；
// B1 §3.2（只取证，不判验收）；E2 X-G（切换后判定实现唯一来源 = `src/common/gates/index.ts`）。
//
// 纪律：本文件只测纯函数与源码结构（不跑真实模型、不打开会话、不写项目文件）；
// 纯函数只判定、不采集证据——证据由包装层/适配器生产（P1-A/P1-B 证据，不在此复制）。
// 新增应用中介路径是预期行为差异；严格路径（Codex/demo）条件集合与短路顺序保持原样。
// 夹具只投影判定所需最小面（lifecycle/toolSurface）；Model 其余字段不参与判定，故以
// `as unknown as` 显式声明该测试投影（与 P1-C 原夹具语义一致，不是第二份事实生产）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  evaluateChiefDispatchParent,
  type DispatchParentCoreFacts,
  type DispatchParentHostFacts,
} from "../../src/common/gates/index.ts";
import type { RuntimeInputProvenanceV1, RuntimeKind } from "../../src/model/runtime.ts";

const AT = "2026-11-07T00:00:00.000Z";
const SESSION = "chief-session-1";
const TURN = "turn-1";
const FACTORY = { claude: "claude-sdk-mcp", pi: "pi-custom-tools", codex: "codex-chat" } as const;
type MediatedRuntime = keyof typeof FACTORY;

type ToolSurface = NonNullable<DispatchParentCoreFacts["toolSurface"]>;
type Mediation = NonNullable<ToolSurface["applicationMediation"]>;
type Lifecycle = NonNullable<DispatchParentCoreFacts["lifecycle"]>;

function makeHost(parentOverrides: Record<string, unknown> = {}, creatorReports?: unknown): DispatchParentHostFacts {
  const parent = { roleId: "chief", runtime: "claude", sessionId: SESSION, turnId: TURN, inputAccepted: true, settled: false, kind: "message", ...parentOverrides };
  return {
    parent: parent as DispatchParentHostFacts["parent"],
    ...(creatorReports !== undefined ? { creatorReports: creatorReports as DispatchParentHostFacts["creatorReports"] } : {}),
  };
}
const hostFor = (runtime: RuntimeKind) => makeHost({ runtime });

function makeLifecycle(overrides: Record<string, unknown> = {}): Lifecycle {
  return { turnId: TURN, stopRequested: false, activeTools: [{ name: "dispatch_task" }], native: { instanceId: "native-1" }, ...overrides } as unknown as Lifecycle;
}

/** 严格路径事实（demo 与 codex 共用；runtime 决定 factoryProvenance/native 是否需要）。 */
function strictCore(runtime: string, surfaceOverrides: Record<string, unknown> = {}, coreOverrides: Record<string, unknown> = {}): DispatchParentCoreFacts {
  const surface: ToolSurface = {
    status: "observed",
    sessionId: SESSION,
    factoryProvenance: runtime === "demo" ? "demo" : "default-production",
    nativeToolRegistry: "application-mediated",
    appTools: ["dispatch_task", "read_file"],
    configuredForeignMcpServers: [],
    ...(runtime === "codex" ? { native: { factory: "codex-chat", nativeInstanceId: "native-1" } } : {}),
    ...surfaceOverrides,
  } as unknown as ToolSurface;
  return { disposed: false, construction: "default-core", roleId: "chief", runtime: runtime as DispatchParentCoreFacts["runtime"],
    lifecycle: makeLifecycle(), toolSurface: surface, ...coreOverrides } as unknown as DispatchParentCoreFacts;
}

/** 受限应用中介路径事实（claude/pi/codex）。 */
function mediatedCore(runtime: MediatedRuntime, surfaceOverrides: Record<string, unknown> = {}, mediationOverrides: Record<string, unknown> = {},
  coreOverrides: Record<string, unknown> = {}): DispatchParentCoreFacts {
  const mediation: Mediation = {
    kind: "application-mediated-unknown-native",
    status: "verified",
    runtime,
    factory: FACTORY[runtime],
    nativeInstanceId: "native-1",
    appTools: ["dispatch_task", "read_file"],
    foreignMcpServers: [],
    nativeBuiltinTools: [],
    reasons: [],
    ...mediationOverrides,
  } as unknown as Mediation;
  const surface: ToolSurface = {
    status: "unknown",
    sessionId: SESSION,
    factoryProvenance: "default-production",
    nativeToolRegistry: "unknown",
    appTools: ["dispatch_task", "read_file"],
    configuredForeignMcpServers: [],
    ...(runtime === "codex" ? { native: { factory: "codex-chat", nativeInstanceId: "native-1" } } : {}),
    applicationMediation: mediation,
    ...surfaceOverrides,
  } as unknown as ToolSurface;
  return { disposed: false, construction: "default-core", roleId: "chief", runtime,
    lifecycle: makeLifecycle(), toolSurface: surface, ...coreOverrides } as unknown as DispatchParentCoreFacts;
}

const evaluate = (core: DispatchParentCoreFacts | undefined, host = makeHost(), hub = true) =>
  evaluateChiefDispatchParent({ host, core, hub });
const reasonsOf = (core: DispatchParentCoreFacts | undefined, host = makeHost(), hub = true) => {
  const decision = evaluate(core, host, hub);
  return decision.ok ? [] : decision.reasons;
};

const display = (text: string) => ({ text, truncated: false, redacted: false });
function handbackProvenance(runtime: RuntimeKind, overrides: Record<string, unknown> = {}, reportOverrides: Record<string, unknown> = {}): RuntimeInputProvenanceV1 {
  return {
    version: 1, kind: "handback", deliveryId: "delivery-1", attemptId: "attempt-1",
    target: { roleId: "chief", runtime },
    reports: [{
      source: { roleId: "convener", runtime, turnId: "report-turn-1" }, taskId: "task-1", origin: "submitted-report",
      status: "completed", summary: display("done"), evidence: [], evidenceOmitted: 0, version: 1, reportId: "report-1", at: AT,
      ...reportOverrides,
    }],
    ...overrides,
  } as RuntimeInputProvenanceV1;
}
const creatorReports = [{ taskId: "task-1", roleId: "convener", reportId: "report-1", turnId: "report-turn-1" }];

// —————————————— 正向矩阵（P3/P4/P6/P7 的判定层证据） ——————————————

test("P1-C：demo 严格路径保持现状通过；Claude/Pi/Codex 受限应用中介路径通过（P3/P4/P6/P7 判定层）", () => {
  assert.deepEqual(evaluate(strictCore("demo"), hostFor("demo")), { ok: true }, "demo 只走严格路径，现状不变");
  assert.deepEqual(evaluate(strictCore("codex"), hostFor("codex")), { ok: true }, "Codex 严格 native 路径原条件成立时通过");
  for (const runtime of ["claude", "pi", "codex"] as const) {
    assert.deepEqual(evaluate(mediatedCore(runtime), hostFor(runtime)), { ok: true }, `${runtime}: 受限路径全部条件成立`);
  }
});

test("P1-C：活跃 dispatch 工具名必须在该运行时的 applicationMediation.appTools 中（P6/N16 正向侧）", () => {
  const appTools = ["ans_dispatch_task", "read_file"];
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const core = mediatedCore(runtime, { appTools }, { appTools }, { lifecycle: makeLifecycle({ activeTools: [{ name: "ans_dispatch_task" }] }) });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: ans_dispatch_task 与 dispatch_task 同权`);
  }
});

test("P1-C：受控 shell（run_shell/start_background_task）列在 appTools 时受限路径可通过（P6/N16）", () => {
  const appTools = ["dispatch_task", "run_shell", "start_background_task", "read_file"];
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const core = mediatedCore(runtime, { appTools }, { appTools });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: 受控 shell 只是应用面工具，不是 native builtin`);
  }
});

test("P1-C：Claude/Pi 已配置外来 MCP 精确枚举且一致时通过（P7/N26 正向侧）", () => {
  for (const runtime of ["claude", "pi"] as const) {
    const foreign = ["mcp-a", "mcp-b"];
    const core = mediatedCore(runtime, { configuredForeignMcpServers: foreign }, { foreignMcpServers: foreign });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: 外来 MCP 精确枚举`);
  }
});

test("P1-C：creatorReports 只在 hub=true 时校验；合法 provenance 通过（P5/hub 行为）", () => {
  const core = { ...strictCore("demo"), turnInput: { turnId: TURN, provenance: handbackProvenance("demo") } } as DispatchParentCoreFacts;
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo" }, creatorReports), true), { ok: true }, "hub=true + 合法 provenance");
  assert.ok(reasonsOf(core, makeHost({ runtime: "demo" }, creatorReports), false).includes("creator-reports-mismatch"), "hub=false 时 creatorReports 分支拒绝（旧 validParent 行为）");
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo" }), false), { ok: true }, "未提供 creatorReports 时 hub 不影响结果");
});

test("P1-C：parent.kind 缺省或 message 通过；提供 creatorReports 时跳过 kind 检查（旧分支顺序）", () => {
  assert.deepEqual(evaluate(strictCore("demo"), makeHost({ runtime: "demo", kind: undefined })), { ok: true });
  assert.deepEqual(evaluate(strictCore("demo"), makeHost({ runtime: "demo", kind: "message" })), { ok: true });
  const report = { ...handbackProvenance("demo").reports[0]!, origin: "terminal-fallback" as const, status: "blocked" as const };
  const core = { ...strictCore("demo"), turnInput: { turnId: TURN, provenance: handbackProvenance("demo", { reports: [report] }) } } as DispatchParentCoreFacts;
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo", kind: "handback" }, creatorReports), true), { ok: true },
    "合法 creatorReports 分支提前返回，不再看 parent.kind（与旧实现一致）");
});

// —————————————— 严格路径原条件保留（P3；N1–N9/N18/N20 的严格侧） ——————————————

test("P1-C：严格路径原条件逐条保留（disposed/非默认核/非 chief/wrong runtime/unknown surface/session/factory/turn/stop/no dispatch/input/settled）", () => {
  const cases: Array<[string, DispatchParentCoreFacts, string]> = [
    ["disposed", { ...strictCore("codex"), disposed: true }, "disposed"],
    ["non-default-core", { ...strictCore("codex"), construction: "custom-adapter" }, "not-default-core"],
    ["non-chief", { ...strictCore("codex"), roleId: "convener" }, "evidence-identity-mismatch"],
    ["wrong-runtime", { ...strictCore("codex"), runtime: "demo" }, "wrong-runtime"],
    ["unknown-surface", { ...strictCore("codex"), toolSurface: { ...strictCore("codex").toolSurface!, status: "unknown" } }, "tool-surface-unknown"],    ["session-mismatch", { ...strictCore("codex"), toolSurface: { ...strictCore("codex").toolSurface!, sessionId: "other-session" } }, "evidence-identity-mismatch"],
    ["custom-factory", { ...strictCore("codex"), toolSurface: { ...strictCore("codex").toolSurface!, factoryProvenance: "custom-override" } }, "custom-factory"],
    ["wrong-turn", { ...strictCore("codex"), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, "turn-mismatch"],
    ["stopped", { ...strictCore("codex"), lifecycle: makeLifecycle({ stopRequested: true }) }, "stopped"],
    ["no-active-dispatch", { ...strictCore("codex"), lifecycle: makeLifecycle({ activeTools: [{ name: "read_file" }] }) }, "no-active-dispatch"],
  ];
  const host = hostFor("codex");
  for (const [label, core, reason] of cases) {
    assert.equal(reasonsOf(core, host)[0], reason, label);
  }
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", inputAccepted: false }))[0], "input-not-accepted");
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", settled: true }))[0], "turn-settled");
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", turnId: "turn-2" }))[0], "turn-mismatch");
});

test("P1-C：demo 只走严格路径——新应用中介路径拒绝 demo（N13）", () => {
  const core = mediatedCore("claude");
  const demoCore = { ...core, runtime: "demo", toolSurface: { ...core.toolSurface!, factoryProvenance: "demo", applicationMediation: undefined } } as DispatchParentCoreFacts;
  assert.deepEqual(reasonsOf(demoCore, hostFor("demo")), ["tool-surface-unknown"], "demo status 非 observed ⇒ 拒绝");
  const forged = { ...core, runtime: "demo" } as DispatchParentCoreFacts;
  assert.ok(reasonsOf(forged, hostFor("demo")).length > 0, "demo 永远不会被当作 claude/pi/codex 走受限路径");
});

test("P1-C：applicationMediation 与 observed 同时出现 ⇒ 双路径歧义拒绝（N20/F15）", () => {
  const forged = (runtime: string) => {
    const base = strictCore(runtime);
    return { ...base, toolSurface: { ...base.toolSurface!, applicationMediation: mediatedCore("claude").toolSurface!.applicationMediation } } as DispatchParentCoreFacts;
  };
  assert.deepEqual(reasonsOf(forged("codex"), hostFor("codex")), ["application-mediation-ambiguous"]);
  for (const runtime of ["claude", "pi", "demo"] as const) {
    assert.deepEqual(reasonsOf(forged(runtime), hostFor(runtime)), ["application-mediation-ambiguous"], `${runtime}: observed+verified 不允许双路径`);
  }
});

test("P1-C：其它 runtime 一律拒绝；core 缺失时拒绝（N1/N9 判定侧）", () => {
  assert.deepEqual(evaluate(undefined), { ok: false, reasons: ["evidence-missing"] });
  const unknown = { ...strictCore("demo"), runtime: "mystery" } as unknown as DispatchParentCoreFacts;
  assert.deepEqual(reasonsOf(unknown, makeHost({ runtime: "mystery" })), ["wrong-runtime"]);
});

// —————————————— 受限路径负例（N10–N12/N14/N21–N23/N25–N28） ——————————————

test("P1-C：受限路径逐条负例（N10/N21/N22/N23/N25/N27/N28）", () => {
  const claude = hostFor("claude");
  const surface = (overrides: Record<string, unknown>, mediation: Record<string, unknown> = {}) => mediatedCore("claude", overrides, mediation);
  const cases: Array<[string, DispatchParentCoreFacts, string]> = [
    ["missing-mediation", surface({ applicationMediation: undefined }), "application-mediation-unverified"],
    ["mediation-unknown", surface({}, { status: "unknown" }), "application-mediation-unverified"],
    ["mediation-wrong-kind", surface({}, { kind: "observed-native" }), "application-mediation-unverified"],
    ["mediation-wrong-factory", surface({}, { factory: "codex-chat" }), "application-mediation-unverified"],
    ["mediation-reasons", surface({}, { reasons: ["role-capability-callback-guard-unverified"] }), "application-mediation-unverified"],
    ["native-builtin", surface({}, { nativeBuiltinTools: ["WebSearch"] }), "native-builtin-present"],
    ["native-tool-registry", surface({ nativeToolRegistry: "application-mediated" }), "registry-mismatch"],
    ["app-tools-mismatch", surface({}, { appTools: ["read_file", "write_file"] }), "registry-mismatch"],
    ["foreign-mismatch", surface({ configuredForeignMcpServers: ["mcp-a"] }, { foreignMcpServers: [] }), "registry-mismatch"],
    ["dispatch-not-in-appTools", surface({}, { appTools: ["read_file"] }), "registry-mismatch"],
    ["session-mismatch", surface({ sessionId: "other-session" }), "evidence-identity-mismatch"],
    ["custom-factory", surface({ factoryProvenance: "custom-override" }), "custom-factory"],
    ["mediation-runtime-mismatch", surface({}, { runtime: "pi" }), "evidence-identity-mismatch"],
    ["wrong-role", { ...mediatedCore("claude"), roleId: "convener" }, "evidence-identity-mismatch"],
    ["wrong-runtime", mediatedCore("claude"), "wrong-runtime"],
    ["disposed", { ...mediatedCore("claude"), disposed: true }, "disposed"],
    ["non-default-core", { ...mediatedCore("claude"), construction: "custom-adapter" }, "not-default-core"],
    ["wrong-turn", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, "turn-mismatch"],
    ["stopped", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ stopRequested: true }) }, "stopped"],
    ["no-active-dispatch", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ activeTools: [{ name: "read_file" }] }) }, "no-active-dispatch"],
  ];
  for (const [label, core, reason] of cases) {
    const host = label === "wrong-runtime" ? hostFor("codex") : claude;
    assert.deepEqual(reasonsOf(core, host), [reason], label);
  }
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", inputAccepted: false })), ["input-not-accepted"]);
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", settled: true })), ["turn-settled"]);
});

test("P1-C：Codex 应用中介路径必须有 native 事实且绑定（N14/N27）", () => {
  const host = hostFor("codex");
  const withoutNative = mediatedCore("codex", { native: undefined });
  assert.deepEqual(reasonsOf(withoutNative, host), ["tool-surface-unknown", "evidence-identity-mismatch"], "native 缺失 ⇒ 拒绝");
  const wrongFactory = mediatedCore("codex", { native: { factory: "unknown", nativeInstanceId: "native-1" } });
  assert.deepEqual(reasonsOf(wrongFactory, host), ["tool-surface-unknown", "evidence-identity-mismatch"], "native.factory 非 codex-chat ⇒ 拒绝");
  const otherInstance = mediatedCore("codex", { native: { factory: "codex-chat", nativeInstanceId: "native-2" } });
  assert.deepEqual(reasonsOf(otherInstance, host), ["tool-surface-unknown", "evidence-identity-mismatch"], "nativeInstanceId 与 lifecycle.native.instanceId 不一致 ⇒ 拒绝");
});

test("P1-C Amendment-1：Codex 绑定按 P1.6 §4.4 字面谓词——字段同值通过，任一缺失/不一致拒绝（N14/N27）", () => {
  const host = hostFor("codex");
  assert.deepEqual(evaluate(mediatedCore("codex"), host), { ok: true },
    "native.nativeInstanceId === applicationMediation.nativeInstanceId（同值）⇒ 通过");
  assert.deepEqual(evaluate(mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ native: undefined }) }), host), { ok: true },
    "lifecycle native 证据缺席只跳过附加防御，不放宽字面谓词、也不拒绝合法 verified 事实");

  const cases: Array<[string, DispatchParentCoreFacts]> = [
    ["binding-mismatch", mediatedCore("codex", {}, { nativeInstanceId: "native-2" })],
    ["binding-missing", mediatedCore("codex", {}, { nativeInstanceId: undefined })],
    ["binding-empty", mediatedCore("codex", {}, { nativeInstanceId: "" })],
    ["native-instance-missing", mediatedCore("codex", { native: { factory: "codex-chat", nativeInstanceId: undefined } })],
    ["both-missing", mediatedCore("codex", { native: { factory: "codex-chat", nativeInstanceId: undefined } }, { nativeInstanceId: undefined })],
    ["lifecycle-native-mismatch", mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ native: { instanceId: "native-9" } }) })],
  ];
  for (const [label, core] of cases) {
    assert.deepEqual(reasonsOf(core, host), ["tool-surface-unknown", "evidence-identity-mismatch"], `${label} ⇒ 拒绝（fail-closed）`);
  }
});

test("P1-C：Codex 配置外来 MCP ⇒ fail-closed（N28/F19）", () => {
  const host = hostFor("codex");
  const configured = mediatedCore("codex", { configuredForeignMcpServers: ["mcp-a"] });
  assert.deepEqual(reasonsOf(configured, host), ["tool-surface-unknown", "registry-mismatch"], "配置非空但应用面 foreign [] ⇒ 不一致");
  const reported = mediatedCore("codex", {}, { foreignMcpServers: ["mcp-a"] });
  assert.deepEqual(reasonsOf(reported, host), ["tool-surface-unknown", "registry-mismatch"], "应用面自报外来 MCP 同样不一致");
});

// —————————————— Codex 双阶段：严格优先，受限兜底（P6/N16） ——————————————

test("P1-C：Codex 先走严格路径；严格路径不成立时才走受限路径，且严格路径本身仍 unknown（P6）", () => {
  const host = hostFor("codex");
  assert.deepEqual(evaluate(strictCore("codex"), host), { ok: true }, "严格路径成立即通过");
  const shell = mediatedCore("codex", { appTools: ["dispatch_task", "run_shell", "read_file"] }, { appTools: ["dispatch_task", "run_shell", "read_file"] });
  assert.deepEqual(evaluate(shell, host), { ok: true }, "严格 unknown（受控 shell）时受限路径通过");
  assert.equal(shell.toolSurface!.status, "unknown", "严格路径本身仍 unknown，不冒充 observed");
  // 受限路径也不成立时，两段原因都如实返回（去重）。
  const neither = { ...shell, lifecycle: makeLifecycle({ activeTools: [{ name: "read_file" }] }) };
  assert.deepEqual(reasonsOf(neither, host), ["tool-surface-unknown", "no-active-dispatch"]);
  const noNative = mediatedCore("codex", { native: undefined });
  assert.ok(reasonsOf(noNative, host).includes("evidence-identity-mismatch"), "native 缺失时不得走受限路径");
});

// —————————————— creatorReports 负例（N19） ——————————————

test("P1-C：creatorReports 数量/重复/角色/turn/reportId/origin/status 任一不匹配 ⇒ 拒绝（N19）", () => {
  const coreFor = (provenance: unknown) => ({ ...strictCore("demo"), turnInput: { turnId: TURN, provenance } }) as DispatchParentCoreFacts;
  const host = makeHost({ runtime: "demo" }, creatorReports);
  assert.deepEqual(evaluate(coreFor(handbackProvenance("demo")), host, true), { ok: true });
  const variants: Array<[string, unknown]> = [
    ["missing provenance", undefined],
    ["wrong kind", handbackProvenance("demo", { kind: "message" })],
    ["wrong source turn", handbackProvenance("demo", {}, { source: { roleId: "convener", runtime: "demo", turnId: "other-turn" } })],
    ["wrong target role", handbackProvenance("demo", { target: { roleId: "convener", runtime: "demo" } })],
    ["wrong report task", handbackProvenance("demo", {}, { taskId: "task-2" })],
    ["wrong report role", handbackProvenance("demo", {}, { source: { roleId: "product", runtime: "demo", turnId: "report-turn-1" } })],
    ["wrong reportId", handbackProvenance("demo", {}, { reportId: "report-2" })],
    ["wrong origin", handbackProvenance("demo", {}, { origin: "terminal-fallback-other" })],
    ["wrong status", handbackProvenance("demo", {}, { status: "unknown-status" })],
    ["report count mismatch", handbackProvenance("demo", { reports: [] })],
  ];
  for (const [label, provenance] of variants) {
    assert.deepEqual(reasonsOf(coreFor(provenance), host, true), ["creator-reports-mismatch"], label);
  }
  assert.deepEqual(reasonsOf(coreFor(handbackProvenance("demo")), makeHost({ runtime: "demo" }, [creatorReports[0]!, creatorReports[0]!]), true),
    ["creator-reports-mismatch"], "重复 taskId");
  assert.deepEqual(reasonsOf(coreFor(handbackProvenance("demo")), makeHost({ runtime: "demo" }, new Array(17).fill(creatorReports[0])), true),
    ["creator-reports-mismatch"], "超过 16 条");
  assert.deepEqual(reasonsOf(coreFor(handbackProvenance("demo", { target: { roleId: "chief", runtime: "pi" } })),
    host, true), ["creator-reports-mismatch"], "provenance.target.runtime 与 core.runtime 不一致");
});

// —————————————— parent.kind 负例（N18） ——————————————

test("P1-C：parent.kind 非 message（且无 creatorReports）⇒ 拒绝（N18）", () => {
  assert.deepEqual(reasonsOf(strictCore("demo"), makeHost({ runtime: "demo", kind: "handback" })), ["parent-kind-invalid"]);
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", kind: "dispatch" })), ["parent-kind-invalid"]);
});

// —————————————— TOCTOU：同一判定被两次调用，证据变化后第二次拒绝（N17） ——————————————

test("P1-C：TOCTOU 两次复检——证据在两次判定之间变化时第二次拒绝（N17）", () => {
  let current: DispatchParentCoreFacts = mediatedCore("claude");
  const recheck = () => evaluate(current, hostFor("claude"), true);
  assert.deepEqual(recheck(), { ok: true }, "第一次复检通过");
  current = { ...current, lifecycle: makeLifecycle({ turnId: "turn-2" }) };
  assert.deepEqual(recheck(), { ok: false, reasons: ["turn-mismatch"] }, "turn 变化 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  assert.deepEqual(recheck(), { ok: true }, "恢复证据后再次通过（每次读取当刻事实）");
  current = { ...current, disposed: true };
  assert.deepEqual(recheck(), { ok: false, reasons: ["disposed"] }, "dispose 变化 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  current = { ...current, toolSurface: { ...current.toolSurface!, nativeToolRegistry: "application-mediated" } };
  assert.deepEqual(recheck(), { ok: false, reasons: ["registry-mismatch"] }, "registry/evidence 漂移 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  current = { ...current, lifecycle: makeLifecycle({ stopRequested: true }) };
  assert.deepEqual(recheck(), { ok: false, reasons: ["stopped"] }, "stopRequested 变化 ⇒ 第二次拒绝");
});

// —————————————— 源码结构守卫（X-G 最终结构：gates 单实现、trunk 只消费、无本地实现/声明/桥接、N15） ——————————————

test("X-G：D5 单实现守卫（最终结构）——gates 唯一判定实现、trunk-runtime 只 import 并恰两处调用、无本地实现/声明/桥接、写/停稳门不读应用中介证据", async () => {
  const runtimeSource = await fs.readFile(path.join(process.cwd(), "src/pipeline/orchestration/trunk-runtime.ts"), "utf8");
  const gatesSource = await fs.readFile(path.join(process.cwd(), "src/common/gates/index.ts"), "utf8");
  // 1) 唯一判定实现在 gates 模块；trunk-runtime 不再有第二份判定实现（临时桥接删除后的最终结构）。
  assert.equal((gatesSource.match(/^export function evaluateChiefDispatchParent/gm) ?? []).length, 1, "gates 唯一导出的判定函数");
  assert.equal((runtimeSource.match(/function\s+evaluateChiefDispatchParent\s*\(/g) ?? []).length, 0, "trunk-runtime 无本地判定实现");
  // 2) trunk-runtime 只经 gates 判定：显式 import + 恰两处调用（validParent / currentChiefResumeSource）。
  assert.match(runtimeSource, /import\s*\{[^}]*\bevaluateChiefDispatchParent\b[^}]*\}\s*from\s*"\.\.\/\.\.\/common\/gates\/index\.ts"/,
    "trunk-runtime 从 gates 显式 import（实现 + 类型）");
  assert.equal((runtimeSource.match(/evaluateChiefDispatchParent\(\{/g) ?? []).length, 2, "恰好两处调用（validParent / currentChiefResumeSource）");
  assert.equal((runtimeSource.match(/return evaluateChiefDispatchParent\(\{ host: context, core, hub: true \}\)\.ok;/g) ?? []).length, 1,
    "currentChiefResumeSource：hub 恒 true");
  assert.equal((runtimeSource.match(/return evaluateChiefDispatchParent\(\{ host: context, core, hub \}\)\.ok;/g) ?? []).length, 1,
    "validParent：hub 变量原样透传");
  assert.equal((runtimeSource.match(/if \(!validParent\(\)\) return staleParent\(\);/g) ?? []).length, 1, "两次复检之一：Service 调用前");
  assert.equal((runtimeSource.match(/return validParent\(\) \? result : staleParent\(\);/g) ?? []).length, 1, "两次复检之二：Service 调用后");
  assert.equal((runtimeSource.match(/hub: true \}\)\.ok/g) ?? []).length, 1, "currentChiefResumeSource 恒传 hub:true");
  // 3) 无本地判定类型声明（`DispatchParent*` 家族及其桥接期 Chief 前缀变体）、无桥接再导出、无临时桥接标注/开关。
  assert.doesNotMatch(runtimeSource, /^\s*(?:export\s+)?(?:interface|type|class)\s+(?:Chief)?DispatchParent\w*/m,
    "trunk-runtime 无本地判定类型声明（`DispatchParent*` 家族及其桥接期 Chief 前缀变体）");
  assert.doesNotMatch(runtimeSource, /export\s*\{[^}]*\bevaluateChiefDispatchParent\b[^}]*\}\s*from/, "trunk-runtime 无桥接再导出");
  assert.equal((runtimeSource.match(/X-G temporary bridge/g) ?? []).length, 0, "临时桥接标注已移除");
  assert.equal((runtimeSource.match(/DISPATCH_GATE_IMPL/g) ?? []).length, 0, "三态演练临时开关已移除");
  // 4) 内联实现的 7 个 helper 与证据字段均已删除；证据字段只由 gates 内部消费（本文件 0 次）。
  for (const symbol of ["APPLICATION_MEDIATION_FACTORY", "sameNameSet", "activeDispatchToolName", "dispatchParentIdentityFailure",
    "dispatchParentTailFailure", "strictNativeFailure", "restrictedApplicationMediationFailure", "applicationMediation"]) {
    assert.equal((runtimeSource.match(new RegExp(`\\b${symbol}\\b`, "g")) ?? []).length, 0, `trunk-runtime 不得残留 ${symbol}`);
  }
  // 5) N15：写/停稳门（inspectInitializationProtection）仍只接受严格 observed；应用中介证据不进入写门。
  const protectionStart = runtimeSource.indexOf("async function inspectInitializationProtection");
  const protectionEnd = runtimeSource.indexOf("export function createGitRoleRuntime", protectionStart);
  assert.ok(protectionStart > 0 && protectionEnd > protectionStart, "写门段按函数符号可定位（inspectInitializationProtection → createGitRoleRuntime）");
  const protectionSource = runtimeSource.slice(protectionStart, protectionEnd);
  assert.ok(protectionSource.includes('surface.status !== "observed"'), "inspectInitializationProtection 仍只接受严格 observed（N15）");
  assert.ok(protectionSource.includes('surface.nativeToolRegistry !== "application-mediated"'), "写门仍要求 application-mediated 注册表证据（N15）");
  assert.equal((protectionSource.match(/applicationMediation/g) ?? []).length, 0, "inspectInitializationProtection 不读应用中介证据");
});
