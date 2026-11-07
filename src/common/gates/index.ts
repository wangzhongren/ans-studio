/**
 * 运行时派发/准入判定模块（`src/common/gates/`）—— E1 greenfield 实现。
 *
 * 依据（冻结输入，本文件写盘前复核）：
 * - E0.3 契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`
 *   （685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）
 *   §5（门控模块契约）、§2（依赖方向）、§10.2 D7/D9、§11 Q9/Q10。
 * - P1.6 方案 §4.4/§4.5/§11.1（判定规则与 P/N 矩阵）；团队计划 §4.4⑧/§6.5/§7.4–§7.5。
 * - P1 D-minimal 内联实现（只读 oracle，E2 前为权威）：`src/pipeline/orchestration/trunk-runtime.ts`
 *   `evaluateChiefDispatchParent`。本模块与其**行为等价**；不得反向 import 该文件。
 *
 * ## 门 API 冻结声明（变更走接口评审，不自行扩写）
 *
 * 输入（调用方已取得的只读事实；门不采集、不构造、不补造证据）：
 * - `host: DispatchParentHostFacts` —— 派发父会话 host 侧事实；
 * - `core: DispatchParentCoreFacts | undefined` —— Core 会话证据的字段级投影（Model 类型）；
 * - `hub: boolean` —— 仅影响 `creatorReports` 分支（与旧 `validParent`/`currentChiefResumeSource` 一致）。
 *
 * 输出：`DispatchParentDecision = { ok: true } | { ok: false; reasons: readonly DispatchParentReason[] }`。
 * `reasons` 只用于测试/诊断；对外回执不变（仍为 `trunk-verify-failed` + 现有文案）。
 *
 * reason 码为 18 项**闭集**（`DispatchParentReason`；与 P1 D-minimal 字符串层逐项一致）。
 * 新增/改名/删除走接口评审（E0.3 §5.3/§5.4）。
 *
 * ## 运行时分支（E0.3 §5.2；P1.6 §4.4 F15）
 *
 * 1. `claude`/`pi`：只走受限应用中介路径；
 * 2. `codex`：先走严格 native 路径（原条件 + `applicationMediation === undefined` 互斥 guard）；
 *    严格不成立时检查双路径歧义（observed + mediation verified ⇒ `application-mediation-ambiguous`），
 *    否则走受限应用中介路径（Codex 追加 native 事实存在且字面绑定）；
 * 3. `demo`：只走严格路径（现状不变；受限路径拒绝 demo）；
 * 4. 其它 runtime：`wrong-runtime`。
 *
 * ## 边界（E0.3 §5.4 / 角色边界 Section 1）
 *
 * - 只判定、不采集证据；不读注册表、不调用 Service/Provider/Pipeline、不做 I/O；
 * - 只 import `src/model/` 的公开类型；不 import 角色模块、引擎或 `src/common/门禁引擎/` 私有 common；
 * - 只被**派发父门/controller resume**消费；写/发布/stable-write/run-stop 门不得读取
 *   `applicationMediation`（INV-2）。本模块不把写路径/边界判定并入；
 * - 纯函数：无时钟、无随机数、无可变状态，不修改调用方数据；缺事实默认拒绝（fail-closed）。
 */
import type {
  RuntimeInputProvenanceV1,
  RuntimeKind,
  RuntimeSessionLifecycleFacts,
  RuntimeSessionToolSurfaceFacts,
} from "../../model/runtime.ts";

/** 派发父门 host 侧事实（P1.6 §4.3；只读事实，不授予写权）。 */
export interface DispatchParentHostFacts {
  parent: {
    roleId: "chief";
    runtime: RuntimeKind;
    sessionId: string;
    turnId: string;
    clientMessageId?: string;
    kind?: string;
    inputAccepted: true;
    settled: false;
  };
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
}

/**
 * 派发父门 Core 侧事实（只读；由 `inspectManagedRoleSessionEvidence` 结果按字段级投影传入）。
 * 只声明判定所需的最小面；`lifecycle`/`toolSurface` 使用 Model 冻结证据类型，不复制第二套字段。
 */
export interface DispatchParentCoreFacts {
  disposed: boolean;
  construction: string; // 只接受 "default-core"
  roleId?: string;
  runtime?: RuntimeKind;
  lifecycle?: RuntimeSessionLifecycleFacts;
  toolSurface?: RuntimeSessionToolSurfaceFacts;
  turnInput?: { turnId: string; provenance?: RuntimeInputProvenanceV1 };
}

/**
 * 派发父门拒绝原因码（18 项闭集；E0.3 §5.3）。语义见各分支实现与契约表。
 * 新增/改名走接口评审。
 */
export type DispatchParentReason =
  | "evidence-missing"
  | "disposed"
  | "not-default-core"
  | "evidence-identity-mismatch"
  | "wrong-runtime"
  | "tool-surface-unknown"
  | "custom-factory"
  | "application-mediation-ambiguous"
  | "application-mediation-unverified"
  | "native-builtin-present"
  | "registry-mismatch"
  | "turn-mismatch"
  | "stopped"
  | "no-active-dispatch"
  | "input-not-accepted"
  | "turn-settled"
  | "creator-reports-mismatch"
  | "parent-kind-invalid";

/** 派发父门判定：通过或拒绝（含结构化 reason；仅供测试/诊断）。 */
export type DispatchParentDecision =
  | { ok: true }
  | { ok: false; reasons: readonly DispatchParentReason[] };

/** 应用中介工厂按运行时的唯一映射（P1.6 §4.4；只做一致性核对，不构造/不采集事实）。 */
const APPLICATION_MEDIATION_FACTORY = Object.freeze({
  claude: "claude-sdk-mcp",
  pi: "pi-custom-tools",
  codex: "codex-chat",
} as const);

function sameNameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftNames = new Set(left), rightNames = new Set(right);
  return leftNames.size === rightNames.size && [...leftNames].every(name => rightNames.has(name));
}

function activeDispatchToolName(core: DispatchParentCoreFacts): string | undefined {
  return core.lifecycle?.activeTools.find(tool => tool.name === "dispatch_task" || tool.name === "ans_dispatch_task")?.name;
}

/**
 * 严格路径与受限路径共用的身份/状态条件（disposed / default-core / chief / runtime 匹配）。
 * 顺序与 P1 D-minimal 内联实现的 `||` 链一致（runtime 在 toolSurface 检查之前）。
 */
function dispatchParentIdentityFailure(core: DispatchParentCoreFacts, host: DispatchParentHostFacts): DispatchParentReason | undefined {
  if (core.disposed) return "disposed";
  if (core.construction !== "default-core") return "not-default-core";
  if (core.roleId !== "chief") return "evidence-identity-mismatch";
  if (core.runtime !== host.parent.runtime) return "wrong-runtime";
  return undefined;
}

/**
 * 严格路径与受限路径共用的尾部条件（turn / stop / activeDispatch / inputAccepted / settled /
 * creatorReports / parent.kind）。两路径调用同一份实现，不复制第二份条件（D5/E3.8）。
 */
function dispatchParentTailFailure(core: DispatchParentCoreFacts, host: DispatchParentHostFacts, hub: boolean): DispatchParentReason | undefined {
  const parent = host.parent;
  if (core.lifecycle?.turnId !== parent.turnId) return "turn-mismatch";
  if (core.lifecycle?.stopRequested) return "stopped";
  if (activeDispatchToolName(core) === undefined) return "no-active-dispatch";
  if (parent.inputAccepted !== true) return "input-not-accepted";
  if (parent.settled !== false) return "turn-settled";
  if (host.creatorReports !== undefined) {
    const provenance = core.turnInput?.provenance, reports = host.creatorReports;
    if (!hub || !reports.length || reports.length > 16 || !provenance || provenance.kind !== "handback"
      || core.turnInput?.turnId !== parent.turnId || provenance.target.roleId !== "chief" || provenance.target.runtime !== core.runtime
      || provenance.reports.length !== reports.length || new Set(reports.map(report => report.taskId)).size !== reports.length)
      return "creator-reports-mismatch";
    const matched = reports.every(expected => provenance.reports.some(actual => actual.taskId === expected.taskId && actual.source.roleId === expected.roleId
      && actual.source.turnId === expected.turnId && actual.reportId === expected.reportId
      && ["submitted-report", "terminal-fallback"].includes(actual.origin) && ["completed", "blocked", "failed", "unreported", "aborted"].includes(actual.status)));
    return matched ? undefined : "creator-reports-mismatch";
  }
  return parent.kind !== undefined && parent.kind !== "message" ? "parent-kind-invalid" : undefined;
}

/**
 * 严格 native 路径：P1 D-minimal 原条件逐字保留 + `applicationMediation === undefined` 互斥 guard。
 * 条件集合与短路顺序与原内联实现一致（含 toolSurface 检查在 turn 检查之前的原顺序）。
 */
function strictNativeFailure(core: DispatchParentCoreFacts, host: DispatchParentHostFacts, hub: boolean): DispatchParentReason | undefined {
  const parent = host.parent, surface = core.toolSurface;
  const identity = dispatchParentIdentityFailure(core, host);
  if (identity !== undefined) return identity;
  if (surface?.status !== "observed") return "tool-surface-unknown";
  if (surface.sessionId !== parent.sessionId) return "evidence-identity-mismatch";
  if (surface.factoryProvenance === "custom-override") return "custom-factory";
  if (surface.applicationMediation !== undefined) return "application-mediation-ambiguous";
  return dispatchParentTailFailure(core, host, hub);
}

/**
 * 受限应用中介路径（仅 claude/pi/codex）：事实全部来自包装层组合，门只判定、不重新采集。
 * Codex 追加 native 事实存在且按 P1.6 §4.4 字面谓词绑定
 * （`native?.factory === "codex-chat" && native.nativeInstanceId === applicationMediation.nativeInstanceId`；
 * P1-A Amendment-1 已把 `applicationMediation.nativeInstanceId` 冻结为 verified 必填字段）：
 * 两侧实例 id 缺失/空串（伪造或旧事实）一律 fail-closed；另保留
 * `native.nativeInstanceId === lifecycle.native.instanceId` 作为附加防御——包装层保证 verified 时
 * 三者同值，且仅在 lifecycle native 证据在场时核对，不拒绝包装层合法 verified 事实。
 */
function restrictedApplicationMediationFailure(core: DispatchParentCoreFacts, host: DispatchParentHostFacts, hub: boolean): DispatchParentReason | undefined {
  const parent = host.parent, runtime = core.runtime, surface = core.toolSurface, mediation = surface?.applicationMediation;
  if (runtime !== "claude" && runtime !== "pi" && runtime !== "codex") return "wrong-runtime";
  const identity = dispatchParentIdentityFailure(core, host);
  if (identity !== undefined) return identity;
  if (surface?.status !== "unknown")
    return surface?.status === "observed" && mediation?.status === "verified" ? "application-mediation-ambiguous" : "tool-surface-unknown";
  if (surface.sessionId !== parent.sessionId) return "evidence-identity-mismatch";
  if (surface.factoryProvenance !== "default-production") return "custom-factory";
  if (surface.nativeToolRegistry !== "unknown") return "registry-mismatch";
  if (mediation?.kind !== "application-mediated-unknown-native" || mediation.status !== "verified") return "application-mediation-unverified";
  if (mediation.runtime !== runtime) return "evidence-identity-mismatch";
  if (mediation.factory !== APPLICATION_MEDIATION_FACTORY[runtime]) return "application-mediation-unverified";
  if (mediation.reasons.length !== 0) return "application-mediation-unverified";
  if (mediation.nativeBuiltinTools.length !== 0) return "native-builtin-present";
  if (!sameNameSet(mediation.appTools, surface.appTools)) return "registry-mismatch";
  if (!sameNameSet(mediation.foreignMcpServers, surface.configuredForeignMcpServers)) return "registry-mismatch";
  const activeTool = activeDispatchToolName(core);
  if (activeTool !== undefined && !mediation.appTools.includes(activeTool)) return "registry-mismatch";
  if (runtime === "codex") {
    // P1.6 §4.4 字面谓词（P1-A Amendment-1）：native 事实存在且与 applicationMediation 绑定同一实例。
    const native = surface.native, boundNativeInstanceId = mediation.nativeInstanceId;
    if (native?.factory !== "codex-chat"
      || typeof native.nativeInstanceId !== "string" || native.nativeInstanceId.length === 0
      || typeof boundNativeInstanceId !== "string" || boundNativeInstanceId.length === 0
      || native.nativeInstanceId !== boundNativeInstanceId) return "evidence-identity-mismatch";
    // 附加防御（字面谓词之外，不放宽跨证据绑定）：native 与实时 lifecycle 实例一致；
    // 仅在 lifecycle native 证据在场时核对（包装层保证 verified 时三者同值；证据缺席不据此拒绝）。
    const lifecycleNativeInstanceId = core.lifecycle?.native?.instanceId;
    if (typeof lifecycleNativeInstanceId === "string" && lifecycleNativeInstanceId.length > 0
      && native.nativeInstanceId !== lifecycleNativeInstanceId) return "evidence-identity-mismatch";
  }
  return dispatchParentTailFailure(core, host, hub);
}

/**
 * 派发父门**唯一**判定实现（E1 greenfield；与 P1 D-minimal 单函数行为等价）。纯函数：只接收已取得
 * 的事实并判定，不采集/不伪造证据，不读注册表、不调用 Service，也不被写/发布/停稳门消费。
 *
 * `hub` 只影响 creatorReports 分支，与旧 `validParent`（hub 变量）和
 * `currentChiefResumeSource`（恒 true）的行为逐条对应。
 *
 * E2 由编排把 `trunk-runtime.ts` 两处判定改调本函数（本模块不写旧引擎）；切换前旧内联实现保持权威。
 */
export function evaluateChiefDispatchParent(input: {
  host: DispatchParentHostFacts;
  core: DispatchParentCoreFacts | undefined;
  hub: boolean;
}): DispatchParentDecision {
  const { host, core, hub } = input;
  if (!core) return { ok: false, reasons: ["evidence-missing"] };
  if (core.runtime === "claude" || core.runtime === "pi") {
    const reason = restrictedApplicationMediationFailure(core, host, hub);
    return reason === undefined ? { ok: true } : { ok: false, reasons: [reason] };
  }
  if (core.runtime === "codex") {
    const strictReason = strictNativeFailure(core, host, hub);
    if (strictReason === undefined) return { ok: true };
    if (core.toolSurface?.status === "observed" && core.toolSurface.applicationMediation?.status === "verified")
      return { ok: false, reasons: ["application-mediation-ambiguous"] };
    const restrictedReason = restrictedApplicationMediationFailure(core, host, hub);
    if (restrictedReason === undefined) return { ok: true };
    return { ok: false, reasons: strictReason === restrictedReason ? [strictReason] : [strictReason, restrictedReason] };
  }
  if (core.runtime === "demo") {
    const reason = strictNativeFailure(core, host, hub);
    return reason === undefined ? { ok: true } : { ok: false, reasons: [reason] };
  }
  return { ok: false, reasons: ["wrong-runtime"] };
}
