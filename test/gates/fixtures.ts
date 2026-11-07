// test/gates/fixtures.ts
// 门控模块（`src/common/gates/`）测试夹具：host/core 事实构造器 + 与 P1 D-minimal 差分的场景集合。
//
// 纪律：夹具只构造**调用方已取得**的只读事实（E0.3 §5.1/§5.4）；不采集证据、不打开会话、
// 不写项目文件、不跑真实模型。除 `mediary` 负例的显式伪造字段外，事实形状与 Model 类型一致。
//
// 依据：P1.6 §4.4/§11.1；B1 §3.2（P1–P7、N1–N28 判定层）；E0.3 §5；团队计划 §4.4⑧/§6.5。

import type { DispatchParentCoreFacts, DispatchParentHostFacts } from "../../src/common/gates/index.ts";
import type { RuntimeInputProvenanceV1, RuntimeKind } from "../../src/model/runtime.ts";

export const AT = "2026-11-07T00:00:00.000Z";
export const SESSION = "chief-session-1";
export const TURN = "turn-1";
/** 应用中介工厂按运行时的唯一映射（P1.6 §4.4）。 */
export const MEDIATION_FACTORY = { claude: "claude-sdk-mcp", pi: "pi-custom-tools", codex: "codex-chat" } as const;
export type MediatedRuntime = keyof typeof MEDIATION_FACTORY;

export type ToolSurface = NonNullable<DispatchParentCoreFacts["toolSurface"]>;
export type Mediation = NonNullable<ToolSurface["applicationMediation"]>;
export type Lifecycle = NonNullable<DispatchParentCoreFacts["lifecycle"]>;

/** host 侧事实（默认 chief/claude 的已接受未结算回合）。 */
export function makeHost(parentOverrides: Record<string, unknown> = {}, creatorReports?: unknown): DispatchParentHostFacts {
  const parent = { roleId: "chief", runtime: "claude", sessionId: SESSION, turnId: TURN, inputAccepted: true, settled: false, kind: "message", ...parentOverrides };
  return {
    parent: parent as DispatchParentHostFacts["parent"],
    ...(creatorReports !== undefined ? { creatorReports: creatorReports as DispatchParentHostFacts["creatorReports"] } : {}),
  };
}
export const hostFor = (runtime: RuntimeKind): DispatchParentHostFacts => makeHost({ runtime });

/** Core 生命周期事实（Model `RuntimeSessionLifecycleFacts` 完整形状；门只读 turn/stop/activeTools/native）。 */
export function makeLifecycle(overrides: Record<string, unknown> = {}): Lifecycle {
  return {
    sessionId: SESSION,
    roleId: "chief",
    runtime: "claude",
    turnId: TURN,
    stopRequested: false,
    status: "quiescent",
    providerFinished: true,
    activeTools: [{ id: "tool-1", name: "dispatch_task" }],
    processes: [],
    processCoverage: "complete",
    reasons: [],
    native: {
      instanceId: "native-1",
      roleId: "chief",
      runtime: "claude",
      status: "quiescent",
      promptState: "running",
      observedAt: AT,
      transport: { kind: "in-process", state: "idle" },
      activeTools: [],
      processes: [],
      processCoverage: "complete",
      reasons: [],
    },
    ...overrides,
  } as Lifecycle;
}

/** native tool-surface 事实（Codex 受限路径绑定用；adapter 报告面）。 */
export function makeNativeSurface(runtime: RuntimeKind, overrides: Record<string, unknown> = {}): NonNullable<ToolSurface["native"]> {
  return {
    source: "native-provider-tool-registry",
    nativeInstanceId: "native-1",
    roleId: "chief",
    runtime,
    factory: runtime === "codex" ? "codex-chat" : "unknown",
    status: "observed",
    observedAt: AT,
    appTools: ["dispatch_task", "read_file"],
    foreignMcpServers: [],
    nativeBuiltinTools: [],
    reasons: [],
    ...overrides,
  } as NonNullable<ToolSurface["native"]>;
}

/** 严格路径 tool-surface 事实（demo / Codex 严格 native）。 */
export function strictSurface(runtime: RuntimeKind, overrides: Record<string, unknown> = {}): ToolSurface {
  return {
    source: "core-provider-assembly",
    sessionId: SESSION,
    roleId: "chief",
    runtime,
    status: "observed",
    appTools: ["dispatch_task", "read_file"],
    configuredForeignMcpServers: [],
    factoryProvenance: runtime === "demo" ? "demo" : "default-production",
    nativeToolRegistry: "application-mediated",
    filesystemConfinement: "unknown",
    reasons: [],
    ...(runtime === "codex" ? { native: makeNativeSurface(runtime) } : {}),
    ...overrides,
  } as ToolSurface;
}

/** 受限应用中介事实（verified；包装层组合结果）。 */
export function makeMediation(runtime: MediatedRuntime, overrides: Record<string, unknown> = {}): Mediation {
  return {
    kind: "application-mediated-unknown-native",
    status: "verified",
    runtime,
    factory: MEDIATION_FACTORY[runtime],
    observedAt: AT,
    nativeInstanceId: "native-1",
    appTools: ["dispatch_task", "read_file"],
    foreignMcpServers: [],
    nativeBuiltinTools: [],
    reasons: [],
    ...overrides,
  } as Mediation;
}

/** 受限路径 tool-surface 事实（status unknown + applicationMediation）。 */
export function mediatedSurface(runtime: MediatedRuntime, surfaceOverrides: Record<string, unknown> = {}, mediationOverrides: Record<string, unknown> = {}): ToolSurface {
  return {
    source: "core-provider-assembly",
    sessionId: SESSION,
    roleId: "chief",
    runtime,
    status: "unknown",
    appTools: ["dispatch_task", "read_file"],
    configuredForeignMcpServers: [],
    factoryProvenance: "default-production",
    nativeToolRegistry: "unknown",
    filesystemConfinement: "unknown",
    reasons: [],
    ...(runtime === "codex" ? { native: makeNativeSurface(runtime) } : {}),
    applicationMediation: makeMediation(runtime, mediationOverrides),
    ...surfaceOverrides,
  } as ToolSurface;
}

/** 严格路径 Core 事实。 */
export function strictCore(runtime: RuntimeKind, surfaceOverrides: Record<string, unknown> = {}, coreOverrides: Record<string, unknown> = {}): DispatchParentCoreFacts {
  return {
    disposed: false,
    construction: "default-core",
    roleId: "chief",
    runtime,
    lifecycle: makeLifecycle(),
    toolSurface: strictSurface(runtime, surfaceOverrides),
    ...coreOverrides,
  } as DispatchParentCoreFacts;
}

/** 受限路径 Core 事实（claude/pi/codex）。 */
export function mediatedCore(runtime: MediatedRuntime, surfaceOverrides: Record<string, unknown> = {}, mediationOverrides: Record<string, unknown> = {},
  coreOverrides: Record<string, unknown> = {}): DispatchParentCoreFacts {
  return {
    disposed: false,
    construction: "default-core",
    roleId: "chief",
    runtime,
    lifecycle: makeLifecycle({ runtime }),
    toolSurface: mediatedSurface(runtime, surfaceOverrides, mediationOverrides),
    ...coreOverrides,
  } as DispatchParentCoreFacts;
}

export const display = (text: string) => ({ text, truncated: false, redacted: false });

/** 合法 handback provenance（creatorReports 分支）。 */
export function handbackProvenance(runtime: RuntimeKind, overrides: Record<string, unknown> = {}, reportOverrides: Record<string, unknown> = {}): RuntimeInputProvenanceV1 {
  return {
    version: 1,
    kind: "handback",
    deliveryId: "delivery-1",
    attemptId: "attempt-1",
    target: { roleId: "chief", runtime },
    reports: [{
      source: { roleId: "convener", runtime, turnId: "report-turn-1" },
      taskId: "task-1",
      origin: "submitted-report",
      status: "completed",
      summary: display("done"),
      evidence: [],
      evidenceOmitted: 0,
      version: 1,
      reportId: "report-1",
      at: AT,
      ...reportOverrides,
    }],
    ...overrides,
  } as RuntimeInputProvenanceV1;
}
export const creatorReports = [{ taskId: "task-1", roleId: "convener", reportId: "report-1", turnId: "report-turn-1" }];

export interface DifferentialScenario {
  readonly name: string;
  readonly host: DispatchParentHostFacts;
  readonly core: DispatchParentCoreFacts | undefined;
}

/**
 * 与 P1 D-minimal 内联实现逐字段/逐 reason 差分的场景集合。
 * 覆盖四个运行时分支、严格原条件、受限全条件、双路径歧义、Codex 字面绑定、
 * creatorReports、parent.kind、no-core 与其它 runtime；每个场景在 hub true/false 各求值一次。
 */
export function differentialScenarios(): DifferentialScenario[] {
  const scenarios: DifferentialScenario[] = [];
  const add = (name: string, core: DispatchParentCoreFacts | undefined, host: DispatchParentHostFacts = makeHost()) => {
    scenarios.push({ name, host, core });
  };

  add("no-core", undefined);

  // ———— 严格路径：demo / codex ————
  add("demo/strict-pass", strictCore("demo"), hostFor("demo"));
  add("codex/strict-pass", strictCore("codex"), hostFor("codex"));
  for (const runtime of ["demo", "codex"] as const) {
    const host = hostFor(runtime);
    add(`${runtime}/strict-disposed`, { ...strictCore(runtime), disposed: true }, host);
    add(`${runtime}/strict-not-default-core`, { ...strictCore(runtime), construction: "custom-adapter" }, host);
    add(`${runtime}/strict-non-chief`, { ...strictCore(runtime), roleId: "convener" }, host);
    add(`${runtime}/strict-wrong-runtime`, { ...strictCore(runtime), runtime: runtime === "demo" ? "codex" : "demo" }, host);
    add(`${runtime}/strict-unknown-surface`, { ...strictCore(runtime), toolSurface: { ...strictSurface(runtime), status: "unknown" } }, host);
    add(`${runtime}/strict-session-mismatch`, strictCore(runtime, { sessionId: "other-session" }), host);
    add(`${runtime}/strict-custom-factory`, strictCore(runtime, { factoryProvenance: "custom-override" }), host);
    add(`${runtime}/strict-wrong-turn`, { ...strictCore(runtime), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, host);
    add(`${runtime}/strict-stopped`, { ...strictCore(runtime), lifecycle: makeLifecycle({ stopRequested: true }) }, host);
    add(`${runtime}/strict-no-dispatch`, { ...strictCore(runtime), lifecycle: makeLifecycle({ activeTools: [{ id: "tool-2", name: "read_file" }] }) }, host);
    add(`${runtime}/strict-ans-dispatch`, { ...strictCore(runtime), lifecycle: makeLifecycle({ activeTools: [{ id: "tool-1", name: "ans_dispatch_task" }] }) }, host);
    add(`${runtime}/strict-input-not-accepted`, strictCore(runtime), makeHost({ runtime, inputAccepted: false }));
    add(`${runtime}/strict-settled`, strictCore(runtime), makeHost({ runtime, settled: true }));
    add(`${runtime}/strict-kind-invalid`, strictCore(runtime), makeHost({ runtime, kind: "dispatch" }));
    add(`${runtime}/strict-kind-undefined`, strictCore(runtime), makeHost({ runtime, kind: undefined }));
    add(`${runtime}/strict-observed-with-mediation`, {
      ...strictCore(runtime), toolSurface: { ...strictSurface(runtime), applicationMediation: makeMediation("claude") },
    }, host);
    add(`${runtime}/strict-shell-app-tools`, strictCore(runtime, { appTools: ["dispatch_task", "run_shell", "start_background_task", "read_file"] }), host);
  }

  // demo 的 observed+verified 双路径歧义（受限路径拒绝 demo，但 N20 检查在 codex 分支才存在；demo 走严格）
  add("demo/observed-with-verified-mediation", {
    ...strictCore("demo"), toolSurface: { ...strictSurface("demo"), applicationMediation: makeMediation("claude") },
  }, hostFor("demo"));

  // ———— claude / pi：只走受限路径 ————
  for (const runtime of ["claude", "pi"] as const) {
    const host = hostFor(runtime);
    add(`${runtime}/mediated-pass`, mediatedCore(runtime), host);
    add(`${runtime}/mediated-ans-dispatch`, mediatedCore(runtime, {
      appTools: ["ans_dispatch_task", "read_file"],
      applicationMediation: makeMediation(runtime, { appTools: ["ans_dispatch_task", "read_file"] }),
    }), host);
    add(`${runtime}/mediated-shell-app-tools`, mediatedCore(runtime, {
      appTools: ["dispatch_task", "run_shell", "start_background_task", "read_file"],
      applicationMediation: makeMediation(runtime, { appTools: ["dispatch_task", "run_shell", "start_background_task", "read_file"] }),
    }), host);
    add(`${runtime}/mediated-foreign-mcp`, mediatedCore(runtime, {
      configuredForeignMcpServers: ["mcp-a", "mcp-b"],
      applicationMediation: makeMediation(runtime, { foreignMcpServers: ["mcp-a", "mcp-b"] }),
    }), host);
    add(`${runtime}/mediated-missing`, mediatedCore(runtime, { applicationMediation: undefined }), host);
    add(`${runtime}/mediated-status-unknown`, mediatedCore(runtime, {}, { status: "unknown" }), host);
    add(`${runtime}/mediated-wrong-kind`, mediatedCore(runtime, {}, { kind: "observed-native" }), host);
    add(`${runtime}/mediated-wrong-factory`, mediatedCore(runtime, {}, { factory: runtime === "claude" ? "pi-custom-tools" : "claude-sdk-mcp" }), host);
    add(`${runtime}/mediated-runtime-mismatch`, mediatedCore(runtime, {}, { runtime: runtime === "claude" ? "pi" : "claude" }), host);
    add(`${runtime}/mediated-reasons`, mediatedCore(runtime, {}, { reasons: ["role-capability-callback-guard-unverified"] }), host);
    add(`${runtime}/mediated-native-builtin`, mediatedCore(runtime, {}, { nativeBuiltinTools: ["WebSearch"] }), host);
    add(`${runtime}/mediated-native-registry`, mediatedCore(runtime, { nativeToolRegistry: "application-mediated" }), host);
    add(`${runtime}/mediated-app-tools-mismatch`, mediatedCore(runtime, {}, { appTools: ["read_file", "write_file"] }), host);
    add(`${runtime}/mediated-foreign-mismatch`, mediatedCore(runtime, { configuredForeignMcpServers: ["mcp-a"] }, { foreignMcpServers: [] }), host);
    add(`${runtime}/mediated-dispatch-not-in-app-tools`, mediatedCore(runtime, {}, { appTools: ["read_file"] }), host);
    add(`${runtime}/mediated-session-mismatch`, mediatedCore(runtime, { sessionId: "other-session" }), host);
    add(`${runtime}/mediated-custom-factory`, mediatedCore(runtime, { factoryProvenance: "custom-override" }), host);
    add(`${runtime}/mediated-demo-factory`, mediatedCore(runtime, { factoryProvenance: "demo" }), host);
    add(`${runtime}/mediated-disposed`, { ...mediatedCore(runtime), disposed: true }, host);
    add(`${runtime}/mediated-not-default-core`, { ...mediatedCore(runtime), construction: "custom-adapter" }, host);
    add(`${runtime}/mediated-non-chief`, { ...mediatedCore(runtime), roleId: "convener" }, host);
    add(`${runtime}/mediated-wrong-turn`, { ...mediatedCore(runtime), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, host);
    add(`${runtime}/mediated-stopped`, { ...mediatedCore(runtime), lifecycle: makeLifecycle({ stopRequested: true }) }, host);
    add(`${runtime}/mediated-no-dispatch`, { ...mediatedCore(runtime), lifecycle: makeLifecycle({ activeTools: [{ id: "tool-2", name: "read_file" }] }) }, host);
    add(`${runtime}/mediated-input-not-accepted`, mediatedCore(runtime), makeHost({ runtime, inputAccepted: false }));
    add(`${runtime}/mediated-settled`, mediatedCore(runtime), makeHost({ runtime, settled: true }));
    add(`${runtime}/mediated-kind-invalid`, mediatedCore(runtime), makeHost({ runtime, kind: "dispatch" }));
    add(`${runtime}/strict-pass`, strictCore(runtime), host); // claude/pi 的 observed-only（受限路径拒绝）
    add(`${runtime}/observed-verified-ambiguity`, mediatedCore(runtime, { status: "observed" }), host);
  }

  // ———— codex：严格优先 + 受限兜底 + 字面绑定 ————
  {
    const host = hostFor("codex");
    add("codex/mediated-pass", mediatedCore("codex"), host);
    add("codex/mediated-shell-pass", mediatedCore("codex", {
      appTools: ["dispatch_task", "run_shell", "read_file"],
      applicationMediation: makeMediation("codex", { appTools: ["dispatch_task", "run_shell", "read_file"] }),
    }), host);
    add("codex/strict-and-mediated-ambiguity", { ...strictCore("codex"), toolSurface: { ...strictSurface("codex"), applicationMediation: makeMediation("codex") } }, host);
    add("codex/mediated-observed-verified", mediatedCore("codex", { status: "observed" }), host);
    add("codex/mediated-native-missing", mediatedCore("codex", { native: undefined }), host);
    add("codex/mediated-native-wrong-factory", mediatedCore("codex", { native: makeNativeSurface("codex", { factory: "unknown" }) }), host);
    add("codex/mediated-native-instance-mismatch", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: "native-2" }) }), host);
    add("codex/mediated-binding-mismatch", mediatedCore("codex", {}, { nativeInstanceId: "native-2" }), host);
    add("codex/mediated-binding-missing", mediatedCore("codex", {}, { nativeInstanceId: undefined }), host);
    add("codex/mediated-binding-empty", mediatedCore("codex", {}, { nativeInstanceId: "" }), host);
    add("codex/mediated-native-instance-missing", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: undefined }) }), host);
    add("codex/mediated-both-instance-missing", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: undefined }) }, { nativeInstanceId: undefined }), host);
    add("codex/mediated-lifecycle-native-mismatch", mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ runtime: "codex", native: { ...makeLifecycle().native!, instanceId: "native-9" } }) }), host);
    add("codex/mediated-lifecycle-native-absent", mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ runtime: "codex", native: undefined }) }), host);
    add("codex/mediated-config-foreign", mediatedCore("codex", { configuredForeignMcpServers: ["mcp-a"] }), host);
    add("codex/mediated-reported-foreign", mediatedCore("codex", {}, { foreignMcpServers: ["mcp-a"] }), host);
    add("codex/mediated-demo-factory", mediatedCore("codex", { factoryProvenance: "demo" }), host);
    add("codex/mediated-wrong-turn", { ...mediatedCore("codex"), lifecycle: makeLifecycle({ runtime: "codex", turnId: "turn-2" }) }, host);
    add("codex/mediated-no-dispatch", { ...mediatedCore("codex"), lifecycle: makeLifecycle({ runtime: "codex", activeTools: [{ id: "tool-2", name: "read_file" }] }) }, host);
  }

  // ———— 其它 runtime：一律拒绝 ————
  add("mystery/strict-pass", { ...strictCore("demo"), runtime: "mystery" } as unknown as DispatchParentCoreFacts, makeHost({ runtime: "mystery" as RuntimeKind }));
  add("mystery/mediated", { ...mediatedCore("claude"), runtime: "mystery" } as unknown as DispatchParentCoreFacts, makeHost({ runtime: "mystery" as RuntimeKind }));

  // ———— creatorReports 分支（合法 + 各类不匹配；hub true/false 由测试层枚举） ————
  const demoReportsHost = makeHost({ runtime: "demo" }, creatorReports);
  const demoProvenanceCore = (provenance: unknown) => ({ ...strictCore("demo"), turnInput: { turnId: TURN, provenance } }) as DispatchParentCoreFacts;
  add("reports/valid", demoProvenanceCore(handbackProvenance("demo")), demoReportsHost);
  add("reports/missing-provenance", demoProvenanceCore(undefined), demoReportsHost);
  add("reports/wrong-kind", demoProvenanceCore(handbackProvenance("demo", { kind: "message" })), demoReportsHost);
  add("reports/wrong-source-turn", demoProvenanceCore(handbackProvenance("demo", {}, { source: { roleId: "convener", runtime: "demo", turnId: "other-turn" } })), demoReportsHost);
  add("reports/wrong-target-role", demoProvenanceCore(handbackProvenance("demo", { target: { roleId: "convener", runtime: "demo" } })), demoReportsHost);
  add("reports/wrong-target-runtime", demoProvenanceCore(handbackProvenance("demo", { target: { roleId: "chief", runtime: "pi" } })), demoReportsHost);
  add("reports/wrong-turn-input", { ...demoProvenanceCore(handbackProvenance("demo")), turnInput: { turnId: "turn-2", provenance: handbackProvenance("demo") } } as DispatchParentCoreFacts, demoReportsHost);
  add("reports/wrong-report-task", demoProvenanceCore(handbackProvenance("demo", {}, { taskId: "task-2" })), demoReportsHost);
  add("reports/wrong-report-role", demoProvenanceCore(handbackProvenance("demo", {}, { source: { roleId: "product", runtime: "demo", turnId: "report-turn-1" } })), demoReportsHost);
  add("reports/wrong-report-id", demoProvenanceCore(handbackProvenance("demo", {}, { reportId: "report-2" })), demoReportsHost);
  add("reports/wrong-origin", demoProvenanceCore(handbackProvenance("demo", {}, { origin: "terminal-fallback-other" })), demoReportsHost);
  add("reports/wrong-status", demoProvenanceCore(handbackProvenance("demo", {}, { status: "unknown-status" })), demoReportsHost);
  add("reports/empty-provenance", demoProvenanceCore(handbackProvenance("demo", { reports: [] })), demoReportsHost);
  add("reports/duplicate-task", demoProvenanceCore(handbackProvenance("demo")), makeHost({ runtime: "demo" }, [creatorReports[0]!, creatorReports[0]!]));
  add("reports/over-limit", demoProvenanceCore(handbackProvenance("demo")), makeHost({ runtime: "demo" }, new Array(17).fill(creatorReports[0])));
  add("reports/terminal-fallback", demoProvenanceCore(handbackProvenance("demo", {}, { origin: "terminal-fallback", status: "blocked" })), demoReportsHost);
  add("reports/kind-handback-with-reports", demoProvenanceCore(handbackProvenance("demo")), makeHost({ runtime: "demo", kind: "handback" }, creatorReports));

  return scenarios;
}

/** 场景标签（差分失败时定位用）。 */
export function scenarioLabel(scenario: DifferentialScenario, hub: boolean): string {
  return `${scenario.name} [hub=${hub}]`;
}
