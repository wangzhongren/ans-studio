// Public Service composition entry. Pipeline selects runtime and injects policy; Providers execute it.
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { RuntimeDeliveryError, RUNTIME_VIEW_IMAGE_POLICY, MODEL_REQUEST_RETRY_EXHAUSTED, isChiefDecisionExecutionContext, isRuntimeApplicationToolSurfaceFacts, isRuntimeNativeLifecycleFacts, isRuntimeNativeToolSurfaceFacts } from "../../model/runtime.ts";
import type { ResolvedRole } from "../../model/role.ts";
import type {
  GovernedToolsOptions, PromptInputEventDetail, PromptOptions, RoleSession, RuntimeAdapter, RuntimeKind, RuntimeProviderFactory,
  RuntimeProviderOptions, RuntimeReplayEntry, RuntimeSessionRecord, RuntimeTurnOutcome, SessionEvent, ShellGate, ToolCall, WriteGate,
  RuntimeLegacyHistoryProjectionInputV1, RuntimeLegacyHistoryProjectionV1, RuntimeSessionStorage,
  RuntimeSessionPersistence, RuntimeReportDraftV1, RuntimeReportSnapshotV1, RuntimeLiveReportDraftV1, RuntimeLiveReportViewV1,
  RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, RuntimeInputTextProjectionV1, RuntimeDeliveryReceiptV1,
  RuntimeReplayCheckpoint, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1,
  DeliveryReceiptQueryV1, RuntimePersistenceErrorCode, RuntimeDeliveryProgressV1,
  RuntimeReasoningEventDetailV1,
  NetworkGate,
  BackgroundTaskCapability,
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskSnapshot,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
  ViewImageFn,
  ChiefDecisionExecutionContext,
  RuntimeSessionLifecycleFacts, RuntimeOwnedProcessFact,
  RuntimeSessionToolSurfaceFacts,
  RuntimeNativeLifecycle, RuntimeNativeLifecycleFacts,
  RuntimeNativeToolSurfaceFacts,
  RuntimeNativeFactoryPreparation, RuntimeNativeFactoryPlanFacts, RuntimeRolePreparation, RuntimePreparedRoleToken,
  RuntimeCreationPlanFacts, RuntimeCoreRegistryFacts, RuntimeApprovalChainPlanFacts,
  RuntimeBlockedRoleCapabilityCallbacks, RuntimeBlockedRoleCapabilityFacts, RuntimeRoleCapabilityTool, InstallSkillFn,
  RuntimeCoreConstructionFacts, RuntimeCoreConstructionFailureRef,
} from "../../model/runtime.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import { inspectShellApproval, probeShellApproval, type FrozenShellApprovalFacts } from "../../common/shared/shell-approval-binding.ts";
import { buildChiefDecisionTools, buildGovernedTools, createDemoRuntimeAdapter, createRuntimeToolLifecycle, isFileEditReadProbe, inspectFileGateContext, loadBuiltinChiefWorkflow, type RuntimeToolLifecycle } from "../../provider/runtime/tools.ts";
import type { FileGateStage, FileGateFacts, WriteGateOperation } from "../../model/runtime.ts";
import { buildShellJudgeTools } from "../../common/runtime-core/shell-judge/tools.ts";
import { buildGovernanceJudgeTools } from "../../common/runtime-core/governance-judge/tools.ts";
import { createRuntimeSessionStore, readRuntimeSessionHistory as readStoredRuntimeSessionHistory } from "../../provider/runtime/session-store.ts";
import { createToolDisplayContext, jsonBytes } from "../../common/runtime-core/tool-display.ts";
import { listInstalledMcpServers } from "../../common/runtime-core/mcp-declarations.ts";
import { REPORT_LIMITS, makeReportSnapshot, canonicalJson, reportIdFor, validateProvenance, validateLivePresentation, projectLiveReport, projectHandbackInput, validAttemptId } from "../../common/runtime-core/report-provenance.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { DEFAULT_TURN_LAST_RESORT_MS, createInteractionGate, isAbortError, isTimeoutError, raceAbort, resolveRuntimeTimeouts, withPausableTimeout, withTimeout } from "../../common/runtime-core/timeout.ts";
import { isRequestFailureCode, requestTimeoutFailureFacts, requestTimeoutSummary } from "../../common/runtime-core/request-timeout.ts";
import { isNetworkOfflineFailure, networkOfflineFailureFacts, networkOfflineSummary } from "../../common/runtime-core/network-gate.ts";
import { REASONING_DIAGNOSTIC_SUMMARY, REASONING_EVENT_SUMMARY, resolveReasoningEffort } from "../../common/runtime-core/reasoning.ts";
import { createBackgroundTaskManager } from "../../common/runtime-core/background-tasks.ts";
import { beginGitHostAction, endGitHostAction, checkGitHostAction, recordGitHostInterruption } from "../../provider/trunk/public/trunk-store.ts";

export interface RuntimeSessionOptions extends Omit<GovernedToolsOptions, "currentTurnId" | "roleId" | "runtime" | "interactionGate" | "backgroundTasks" | "viewImagePolicy"> {
  runtime: RuntimeKind;
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** No persistence unless explicitly enabled; no eager .ans creation. */
  persistSession?: boolean;
  providerFactories?: Partial<Record<RuntimeKind, RuntimeProviderFactory>>;
  modelId?: string;
  baseUrl?: string;
  providerId?: string;
  apiKeyEnvVar?: string;
  /** 到点检查时限（历史字段名）：看护到点检查用，**不中止整轮**。 */
  promptTimeoutMs?: number;
  /** 整轮最后兜底（毫秒；缺省 1 小时）；测试/宿主可注入小值。 */
  turnLastResortMs?: number;
  constructTimeoutMs?: number;
  /**
   * P1（2026-10-30）请求级首字节时限（毫秒；缺省 90000，测试可注入小值）。
   * 到点 ⇒ 本轮 `failed`（errorCode `request-timeout-first-byte`）；1h 最后兜底语义不变。
   */
  requestFirstByteTimeoutMs?: number;
  /** P1 请求级流空闲时限（毫秒；缺省 300000，测试可注入小值）。 */
  requestIdleTimeoutMs?: number;
  /**
   * P2（2026-10-30）网络状态门（主进程 `net.isOnline` 权威 + 渲染/power 提示；Model 共享契约）。
   * 离线 ⇒ Claude 适配器对请求 deadline `pause()`（计时停走）；恢复 ⇒ `resume()`；
   * 离线超过 `networkRetryWindowMs` ⇒ 终态 failed（`network-offline-timeout`），不自动重放。
   * 缺省 ⇒ always-online（旧行为零变化；Pi/Codex 不消费）。
   */
  networkGate?: NetworkGate;
  /** P2 离线等待恢复窗口（毫秒；缺省 300000＝5min，测试/宿主可注入小值）。 */
  networkRetryWindowMs?: number;
  /**
   * P3（2026-10-30）**同回合 replay-safe 重试**：最多请求尝试次数（缺省 3＝首次 + 2 次重试；
   * 实现 clamp 到 1..3）。仅在本回合无文本/thinking/工具/客户交互、在线且失败属请求/流层时生效；
   * 不改变 1h 最后兜底/5min 看护/默认自动中止 0（Q2·Q3·Q11）。
   */
  requestAttemptMax?: number;
  /** P3 指数退避基数（毫秒；缺省 1000；单次上限 `requestRetryMaxDelayMs` 缺省 8000）。 */
  requestRetryBaseMs?: number;
  /** P3 单次退避上限（毫秒；缺省 8000）。 */
  requestRetryMaxDelayMs?: number;
  /** P3 单回合所有 attempt 的总预算（毫秒；缺省 600000＝10min）；超出不再重试，终态 failed。 */
  requestRetryBudgetMs?: number;
  /**
   * 纯展示文本段（见 `RuntimeProviderOptions.contextSections`）：由编排（C3）在会话绑定时注入；
   * 未定义 ⇒ 不下发字段（系统提示逐字不变）；空数组不在本层拼接，由适配器按「非空才拼」处理。
   */
  contextSections?: readonly string[];
  /** Trusted host-created separate real-chief context, never a tool argument or judge identity. */
  chiefDecisionContext?: ChiefDecisionExecutionContext;
  /** Demo-only script; no SDK and no fallback for another runtime. */
  script?: ToolCall[];
}

/** Pipeline may recognize only the actual Provider-issued edit/read probe for this exact gate path. No write authority. */
export function isRuntimeEditReadProbe(context: unknown, targetPath: string): boolean {
  return isFileEditReadProbe(context, targetPath);
}

/** Validate Provider's live invocation/path/operation/stage identity, then expose only ordinary copies. */
export function inspectRuntimeFileGateContext(context: unknown, targetPath: string, operation: WriteGateOperation, stage: FileGateStage): FileGateFacts | undefined {
  return inspectFileGateContext(context, targetPath, operation, stage);
}

/** Tool kind alone is insufficient for generic accepted/denied engine facts. */
function routeRuntimeDisplayEvent(event:SessionEvent,display:ReturnType<typeof createToolDisplayContext>,origin:"legacy-event"|"projected-event"):SessionEvent {
  const detail=event.detail&&typeof event.detail==='object'&&!Array.isArray(event.detail)?event.detail as Record<string,unknown>:{};
  const call=detail.call&&typeof detail.call==='object'&&!Array.isArray(detail.call)?detail.call as Record<string,unknown>:{};
  const namedTool=[detail.toolName,call.name].some(value=>typeof value==='string'&&value.trim().length>0);
  if(event.kind==='tool_call'||namedTool)return display.projectToolEvent({origin,event});
  const turnId=event.turnId??(typeof detail.turnId==='string'?detail.turnId:undefined);
  const safeDetail={...(turnId!==undefined?{turnId}:{}),...(['completed','failed','aborted','timed_out'].includes(String(detail.outcome))?{outcome:detail.outcome}:{})};
  return {kind:event.kind,summary:display.protectText(event.summary,16384).text,...(event.runtime!==undefined?{runtime:event.runtime}:{}),...(event.roleId!==undefined?{roleId:event.roleId}:{}),...(turnId!==undefined?{turnId}:{}),...(Object.keys(safeDetail).length?{detail:safeDetail}:{})};
}

/** Pipeline-facing history operation. ANS replay never establishes native model restoration. */
export async function readRuntimeSessionHistory(options: {
  projectRoot: string; roleId: string; runtime: RuntimeKind; credentialEnvNames?: readonly string[];
}): Promise<{ record?: RuntimeSessionRecord; entries: RuntimeReplayEntry[];reports?:RuntimeReportSnapshotV1[];reportErrors?:{reportId?:string;code:string}[] }> {
  const history = await readStoredRuntimeSessionHistory(options);
  const display = createToolDisplayContext({credentialEnvNames:options.credentialEnvNames});
  const reportHistory=await createRuntimeSessionStore(options).readReports!();
  const reports=reportHistory.reports.map(report=>({...report,summary:display.protectText(report.summary.text,16384,report.summary),evidence:report.evidence.map(item=>display.protectText(item.text,2048,item))}));
  return {...history,...(reports.length?{reports}:{}),...(reportHistory.reportErrors.length?{reportErrors:reportHistory.reportErrors}:{}), ...(history.record ? {record:{...history.record,...(history.record.contextWarning?{contextWarning:display.protectText(history.record.contextWarning,4096).text}:{})}} : {}), entries:history.entries.map(entry=>{
    if(entry.kind === "user") return {...entry,text:display.protectText(entry.text ?? "",16384).text};
    const event=entry.event!;
    if(event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied") return {...entry,event:routeRuntimeDisplayEvent(event,display,"legacy-event")};
    const detail=event.detail && typeof event.detail === "object" ? event.detail as Record<string,unknown> : {};
    // G-5：历史读取对 `detail.source==="reasoning"` 过**同一投影单点**（存量投影形＝幂等归一；
    // 手编/旧版原始事实＝同管道脱敏＋预算——回放面与实时面形状唯一）。
    const safeDetail = detail.source === "prompt-input" && typeof detail.text === "string" ? {...detail,text:display.protectText(detail.text,16384).text}
      : detail.source === "reasoning" ? {...display.projectReasoningDetail(detail as unknown as RuntimeReasoningEventDetailV1), ...(typeof detail.turnId === "string" ? {turnId: detail.turnId} : {})}
      : detail;
    return {...entry,event:{...event,summary:display.protectText(event.summary,16384).text,detail:safeDetail}};
  })};
}

/** Pure Model-value bridge for the existing native-only reader; no filesystem or SDK calls. */
export function projectRuntimeLegacyHistory(input: RuntimeLegacyHistoryProjectionInputV1): RuntimeLegacyHistoryProjectionV1 {
  return createToolDisplayContext({credentialEnvNames:input?.credentialEnvNames}).projectLegacyHistory(input);
}

/** Pure live report value: no store or SDK construction. */
export function projectRuntimeLiveHandback(draft:RuntimeLiveReportDraftV1,context?:{credentialEnvNames?:readonly string[]}):RuntimeLiveReportViewV1 {
  return projectLiveReport(draft,createToolDisplayContext({credentialEnvNames:context?.credentialEnvNames}).protectText);
}

async function defaultFactory(runtime: RuntimeKind): Promise<RuntimeProviderFactory> {
  if (runtime === "demo") return (options) => createDemoRuntimeAdapter(options);
  // Variable imports keep absent SDK adapters lazy during staged assembly.
  const modulePath = `../../provider/${runtime}/session.ts`;
  const module = await import(modulePath) as Record<string, unknown>;
  const name = runtime === "pi" ? "createPiRuntimeAdapter" : runtime === "codex" ? "createCodexRuntimeAdapter" : "createClaudeRuntimeAdapter";
  const factory = module[name];
  if (typeof factory !== "function") throw new Error(`${runtime} 提供方缺少公开工厂 ${name}`);
  return factory as RuntimeProviderFactory;
}

const coreRegistryInstance = randomUUID();
let coreRegistryRevision = 0;
const coreRootRevisions = new Map<string, number>();
type CoreRegistryEntry = { fact: RuntimeCoreRegistryFacts["entries"][number]; session?: RoleSession;
  construction?: () => RuntimeCoreConstructionFacts; revoke?: () => void };
const coreRegistry = new Map<string, CoreRegistryEntry>();
const constructionErrors = new WeakMap<object, { entry: CoreRegistryEntry; ref: RuntimeCoreConstructionFailureRef } | null>();
const constructionFailures = new Map<string, { entry: CoreRegistryEntry; ref: RuntimeCoreConstructionFailureRef }>();
const rolePreparations = new WeakMap<object, { entry: CoreRegistryEntry; planId: string }>();
function bindConstructionFailure(error: unknown, entry: CoreRegistryEntry): RuntimeCoreConstructionFailureRef | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const previous = constructionErrors.get(error);
  if (previous === null || previous && previous.entry !== entry) { constructionErrors.set(error, null); return undefined; }
  if (previous) return structuredClone(previous.ref);
  const ref: RuntimeCoreConstructionFailureRef = { source: "core-construction-failure", processInstanceId: coreRegistryInstance, entryId: entry.fact.id, failureId: randomUUID() };
  const binding = { entry, ref }; constructionErrors.set(error, binding); constructionFailures.set(ref.failureId, binding);
  return structuredClone(ref);
}
/** Same actual error identity only; no role/root/latest matching. */
export function inspectRuntimeConstructionFailure(error: unknown): RuntimeCoreConstructionFailureRef | undefined {
  const binding = error !== null && typeof error === "object" ? constructionErrors.get(error) : undefined;
  return binding ? structuredClone(binding.ref) : undefined;
}
/** Narrow cancellation of this actual preparation; copying plan JSON cannot revoke or issue evidence. */
export function discardRuntimeRolePreparation(prepared: RuntimeRolePreparation, error: unknown): RuntimeCoreConstructionFailureRef | undefined {
  const binding = prepared !== null && typeof prepared === "object" ? rolePreparations.get(prepared) : undefined;
  if (!binding || binding.entry.fact.planId !== binding.planId) return undefined;
  binding.entry.revoke?.(); return bindConstructionFailure(error, binding.entry);
}
export function recheckRuntimeConstructionFailure(ref: RuntimeCoreConstructionFailureRef): RuntimeCoreConstructionFacts | undefined {
  const binding = ref && typeof ref === "object" ? constructionFailures.get(ref.failureId) : undefined;
  if (!binding || ref.source !== binding.ref.source || ref.processInstanceId !== coreRegistryInstance || ref.entryId !== binding.ref.entryId) return undefined;
  const fact = binding.entry.construction?.(); return fact ? structuredClone(fact) : undefined;
}
function updateCoreRegistry(entry: CoreRegistryEntry, state: CoreRegistryEntry["fact"]["state"], reasons?: readonly string[]): void {
  const revision = (coreRootRevisions.get(entry.fact.projectRoot) ?? 0) + 1;
  coreRootRevisions.set(entry.fact.projectRoot, revision); coreRegistryRevision++;
  entry.fact = { ...entry.fact, state, rootRevision: revision, ...(reasons ? { reasons: [...reasons] } : {}) };
}
/** All actual Core preparations/binds, including judgers. No claim about other processes or native bypasses. */
export function inspectRuntimeCoreRegistry(): RuntimeCoreRegistryFacts {
  const entries = [...coreRegistry.values()].map(entry => {
      try {
        const lifecycle = entry.session?.inspectLifecycle?.();
        const toolSurface = entry.session && entry.fact.state === "active" ? entry.session.inspectToolSurface?.() : undefined;
        return structuredClone({ ...entry.fact, ...(entry.construction ? { construction: entry.construction() } : {}),
          ...(lifecycle ? { lifecycle } : {}), ...(toolSurface ? { toolSurface } : {}) }); }
      catch { return { ...entry.fact, reasons: [...entry.fact.reasons, "core-instance-inspection-failed"] }; }
    });
  return { source: "core-session-registry", processInstanceId: coreRegistryInstance, revision: coreRegistryRevision,
    coverage: "current-process-only", reasons: ["external-native-and-previous-process-history-not-covered"], entries };
}
async function withCoreOpenLease<T>(projectRoot: string, action: (assertHeld: () => void) => Promise<T>): Promise<T> {
  // One owner/provider coordinator, shared with Pipeline mutations; never a second lock or Interface callback.
  const lease = beginGitHostAction({ projectRoot, kind: "session-open" });
  if (!lease.ok) throw new Error(lease.code);
  const assertHeld = () => { const check = checkGitHostAction({ projectRoot, leaseId: lease.leaseId, kind: "session-open" });
    if (!check.ok) throw new Error(check.code); };
  try { return await action(assertHeld); } finally { endGitHostAction({ projectRoot, leaseId: lease.leaseId }); }
}
async function readCoreProtectionScope(projectRoot: string): Promise<{ state: "required" | "unmanaged" | "unknown"; revision: number }> {
  const port = await import("../../provider/trunk/public/trunk-store.ts") as unknown as {
    readGitHostProtectionRequirement?: (input: { projectRoot: string }) => Promise<{ state: "required" | "unmanaged" | "unknown"; revision: number }>;
  };
  try {
    const fact = await port.readGitHostProtectionRequirement?.({ projectRoot });
    if (fact && ["required", "unmanaged", "unknown"].includes(fact.state) && Number.isSafeInteger(fact.revision) && fact.revision >= 0)
      return { state: fact.state, revision: fact.revision };
  } catch { /* Missing/unreadable physical authority is not an unmanaged scope. */ }
  return { state: "unknown", revision: 0 };
}
/**
 * 2026-11-08（准入按操作审批，P1.3 §2.2.3/§2.3）：受保护范围下**注册了**这些工具才要求审批链/审计证据。
 * 原 `hasUnconfinedScriptTools`（「含 shell 即创建期拒绝」）已退役——不再产生
 * `required-scope-unconfined-script-tools`；证明对象改为「审批链与审计在装配期真实存在」。
 */
const SHELL_ADMISSION_TOOLS: readonly string[] = ["run_shell", "start_background_task"];
const hasShellAdmissionTools = (names: readonly string[]) => SHELL_ADMISSION_TOOLS.some(name => names.includes(name));
/** 项目根规范化（纯字符串；Windows 大小写不敏感）：仅用于与 binding 登记事实比较，不做文件系统 I/O。 */
const canonicalProjectRoot = (value: string): string => {
  const resolved = resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};
/**
 * 审批链稳定白名单投影（§2.3.3）：只含模式/通道/审计 `file+durable+probe ok`/项目根，无时间戳/凭据/环境，
 * 可安全进入 plan 与 `configDigest`。调用方必须先确认 `audit` 三态与项目根，本函数不做策略判断。
 */
function projectApprovalChainFacts(facts: FrozenShellApprovalFacts & { projectRoot: string }): RuntimeApprovalChainPlanFacts {
  return {
    source: "orchestration-shell-gate",
    mode: facts.mode,
    classifier: facts.classifier,
    rules: facts.rules,
    pmAsk: facts.pmAsk,
    operatorChannel: facts.operatorChannel,
    takeGrant: facts.takeGrant,
    takeDirective: facts.takeDirective,
    routinePolicy: facts.routinePolicy,
    escalation: facts.escalation,
    audit: { sink: "file", durable: true, probe: "ok", ...(facts.audit.relPath !== undefined ? { relPath: facts.audit.relPath } : {}) },
    projectRoot: facts.projectRoot,
  };
}
/**
 * 审批链一致性判据（§2.2.4 绑定/执行期复核）：live 事实的稳定投影必须与计划中的投影逐字段一致。
 *
 * 防御性判据（复核 R6 / B1 AC-27）：端到端路径上 prepare→bind 之间替换 `shellGate` 会先被
 * `isCurrent()` 拦为 `runtime-prepared-configuration-changed`，本判据几乎不可达；因此按模块级判据
 * 直接测试本函数（`protected-scope-approval-chain-changed` 由绑定/执行期复核在异常路径抛出）。
 */
export function matchesRuntimeApprovalChain(
  live: RuntimeApprovalChainPlanFacts | undefined,
  planned: RuntimeApprovalChainPlanFacts | undefined,
): boolean {
  if (live === undefined || planned === undefined) return false;
  return live.source === planned.source && live.mode === planned.mode
    && live.classifier === planned.classifier && live.rules === planned.rules
    && live.pmAsk === planned.pmAsk && live.operatorChannel === planned.operatorChannel
    && live.takeGrant === planned.takeGrant && live.takeDirective === planned.takeDirective
    && live.routinePolicy === planned.routinePolicy && live.escalation === planned.escalation
    && live.audit.sink === planned.audit.sink && live.audit.durable === planned.audit.durable
    && live.audit.probe === planned.audit.probe && live.audit.relPath === planned.audit.relPath
    && canonicalProjectRoot(live.projectRoot) === canonicalProjectRoot(planned.projectRoot);
}
type ApprovalChainEvidence =
  | { kind: "verified"; chain: RuntimeApprovalChainPlanFacts }
  | { kind: "unproven" }
  | { kind: "audit-unavailable" };
/**
 * 读取一次审批链证据（§2.2.3）：`probeShellApproval` **无值入参**、探针由 binding 内部执行并冻结 memoize
 * （I0-3）；未登记/项目根不符 ⇒ unproven；已登记但 sink 非 file / 非持久 / probe 非 ok ⇒ audit-unavailable。
 */
async function readApprovalChainEvidence(gate: ShellGate | undefined, projectRoot: string): Promise<ApprovalChainEvidence> {
  if (typeof gate !== "function") return { kind: "unproven" };
  const facts = await probeShellApproval(gate);
  if (!facts || !facts.projectRoot || canonicalProjectRoot(facts.projectRoot) !== canonicalProjectRoot(projectRoot))
    return { kind: "unproven" };
  if (facts.audit.sink !== "file" || facts.audit.durable !== true || facts.audit.probe !== "ok")
    return { kind: "audit-unavailable" };
  return { kind: "verified", chain: projectApprovalChainFacts({ ...facts, projectRoot: facts.projectRoot }) };
}
/** Exact set equality of registry names (duplicates on the left are a mismatch). */
const sameNameSet = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && new Set(left).size === left.length && left.every(name => right.includes(name));
/**
 * P1.6 §4.4：受限应用中介路径的唯一 reason 白名单/阻断集（不另维护第二份；门模块回链本口径）。
 * 只允许与下列**包装层** reason 共存；任何其它 reason（含阻断集与未列入者）默认拒绝。
 */
const APPLICATION_MEDIATION_FACTORIES: Readonly<Record<"claude" | "pi" | "codex", "claude-sdk-mcp" | "pi-custom-tools" | "codex-chat">> = Object.freeze({
  claude: "claude-sdk-mcp" as const, pi: "pi-custom-tools" as const, codex: "codex-chat" as const,
});
const APPLICATION_MEDIATION_COEXISTING_REASONS: Readonly<Record<"claude" | "pi" | "codex", readonly string[]>> = Object.freeze({
  claude: Object.freeze(["native-tool-registry-binding-unverified"]),
  pi: Object.freeze(["native-tool-registry-binding-unverified"]),
  codex: Object.freeze(["unmediated-execution-registered"]),
});
/** Inputs of the wrapper's single application-mediation composition rule (P1.6 §4.4). */
export interface RuntimeApplicationMediationCompositionInput {
  runtime: RuntimeKind;
  factoryProvenance: "default-production" | "custom-override" | "demo";
  disposed: boolean;
  /** 包装层严格路径已计算出的 reasons；`length === 0` ⇔ 严格 status 已 observed。 */
  strictReasons: readonly string[];
  roleId: string;
  /** 绑定期捕获的 native 实例 id；必须与实时 `nativeLifecycle.instanceId` 一致。 */
  nativeInstanceId?: string;
  nativeLifecycleInstanceId?: string;
  appTools: readonly string[];
  configuredForeignMcpServers: readonly string[];
  nativeFact?: RuntimeNativeToolSurfaceFacts;
  /** 惰性读取适配器事实；只在构造门槛内调用一次，抛错按无证据处理。 */
  applicationFact?: () => unknown;
}
/**
 * 包装层构造 `applicationMediation` 的唯一规则（P1.6 §4.4「包装层构造 applicationMediation 的条件」）。
 * 返回 `undefined` 即该证据缺席（fail-closed：缺失/不匹配一律不放行）；只有全部条件成立才返回
 * `status:"verified"`。严格 `status` 已 observed 时不构造（避免双路径）；demo/custom factory/disposed
 * 不构造。本函数不改变严格路径的 `status`/`nativeToolRegistry`，也不被写/发布/停稳门消费。
 */
export function composeRuntimeApplicationMediation(input: RuntimeApplicationMediationCompositionInput):
  NonNullable<RuntimeSessionToolSurfaceFacts["applicationMediation"]> | undefined {
  if (input.runtime !== "claude" && input.runtime !== "pi" && input.runtime !== "codex") return undefined;
  const runtime = input.runtime, factory = APPLICATION_MEDIATION_FACTORIES[runtime];
  if (input.factoryProvenance !== "default-production" || input.disposed) return undefined;
  // 严格路径已 observed 时保持 applicationMediation 缺席，避免双路径歧义（§4.4 F15）。
  if (input.strictReasons.length === 0) return undefined;
  const allowed = APPLICATION_MEDIATION_COEXISTING_REASONS[runtime];
  // 任何未列入对应 runtime 白名单的 reason（含全部阻断 reason）默认拒绝。
  if (!input.strictReasons.every(reason => allowed.includes(reason))) return undefined;
  let fact: unknown;
  try { fact = input.applicationFact?.(); } catch { return undefined; }
  if (!isRuntimeApplicationToolSurfaceFacts(fact)) return undefined;
  if (fact.status !== "observed" || fact.reasons.length !== 0) return undefined;
  if (fact.factory !== factory || fact.runtime !== runtime || fact.roleId !== input.roleId) return undefined;
  if (!input.nativeInstanceId || input.nativeLifecycleInstanceId !== input.nativeInstanceId
    || fact.nativeInstanceId !== input.nativeInstanceId) return undefined;
  if (!sameNameSet(fact.appTools, input.appTools)
    || !sameNameSet(fact.foreignMcpServers, input.configuredForeignMcpServers)) return undefined;
  if (fact.nativeBuiltinTools.length !== 0) return undefined;
  if (runtime === "codex") {
    // Codex 追加：native 事实必须存在且绑定；chat 传输不支持外来 MCP ⇒ 配置非空即 fail-closed（N28/F19）。
    // `unmediated-execution-registered` 只允许来自 app 级受控 shell，不得来自 native builtin/foreign。
    if (!input.nativeFact || input.nativeFact.factory !== "codex-chat"
      || input.nativeFact.nativeInstanceId !== input.nativeInstanceId
      || input.nativeFact.nativeBuiltinTools.length !== 0) return undefined;
    if (input.configuredForeignMcpServers.length > 0 || fact.foreignMcpServers.length > 0) return undefined;
  }
  // Amendment-1：按 P1.6 §4.4 字面填入已绑定且已核对的 nativeInstanceId（上面恒等于
  // `fact.nativeInstanceId` 与 `input.nativeLifecycleInstanceId`）；不匹配已在门槛处 fail-closed。
  return { kind: "application-mediated-unknown-native", status: "verified", runtime, factory,
    observedAt: fact.observedAt, nativeInstanceId: input.nativeInstanceId, appTools: [...fact.appTools],
    foreignMcpServers: [...fact.foreignMcpServers], nativeBuiltinTools: [...fact.nativeBuiltinTools], reasons: [] };
}
const roleCapabilitySlots = [
  ["install_skill", "installSkill"], ["uninstall_skill", "uninstallSkill"],
  ["install_mcp", "installMcp"], ["uninstall_mcp", "uninstallMcp"],
] as const;
const blockedRoleCapabilities = new WeakMap<Function, RuntimeRoleCapabilityTool>();
/** Pure no-effect configuration factory. Deliberately has no old effect, permission or caller-proof parameter. */
export function createBlockedRoleCapabilityCallbacks(): RuntimeBlockedRoleCapabilityCallbacks {
  const make = (tool: RuntimeRoleCapabilityTool): InstallSkillFn => {
    const callback: InstallSkillFn = async () => ({ ok: false, reason: "effect-scope-unproven", message: `${tool}: blocked; effect scope is unproven` });
    blockedRoleCapabilities.set(callback, tool);
    return Object.freeze(callback);
  };
  return Object.freeze({ installSkill: make("install_skill"), uninstallSkill: make("uninstall_skill"),
    installMcp: make("install_mcp"), uninstallMcp: make("uninstall_mcp") });
}


export function createRuntimeAdapter(options: RuntimeSessionOptions): RuntimeAdapter {
  const chiefDecision = options.chiefDecisionContext === undefined ? undefined : structuredClone(options.chiefDecisionContext);
  if (chiefDecision !== undefined && (!isChiefDecisionExecutionContext(chiefDecision)
    || options.decidePendingRequest === undefined || options.shellJudge !== undefined || options.governanceJudge !== undefined))
    throw new Error("Invalid or conflicting real-chief decision context");
  let chiefTurns = 0;
  if (!(RUNTIME_KINDS as readonly string[]).includes(options.runtime)) throw new Error(`未知运行时：${options.runtime}`);
  // 2026-10-18 双开关评审 §6.2：`shellJudge` 与 `governanceJudge` **恰一**——同时给出是配置错误，
  // 不静默择一（否则 shell 会话可能悄悄拿到治理工具，或反之）。
  if (options.shellJudge !== undefined && options.governanceJudge !== undefined) {
    throw new Error("shellJudge 与 governanceJudge 互斥：判断会话只能注入其中一种判断能力");
  }
  const providers = new Map<ResolvedRole, Promise<{
    adapter: RuntimeAdapter; options: RuntimeProviderOptions; display: ReturnType<typeof createToolDisplayContext>; backgroundTasks?: BackgroundTaskCapability; lifecycle: RuntimeToolLifecycle; factoryProvenance: "default-production" | "custom-override" | "demo"; initialAppTools: string[]; initialToolHandlers: RuntimeProviderOptions["tools"][number]["handler"][]; initialMcpServers: string[]; protectedGitRoots?: readonly string[]; registry: CoreRegistryEntry; prepareNative(): Promise<RuntimeNativeFactoryPreparation | undefined>; isCurrent(): boolean; setAdmissionGuard(guard: () => void): void; setTurn(id?: string, controller?: AbortController): void;
    roleCapabilityGuards(binding?: Pick<RuntimeBlockedRoleCapabilityFacts, "corePlanId" | "nativePlanId" | "nativeConfigDigest" | "sessionId">): RuntimeBlockedRoleCapabilityFacts | undefined;
    revoke(): void; beginContinuation(): () => void;
    setAdmittedPlan(plan: RuntimeCreationPlanFacts): void; verifyApprovalChainBinding(plan: RuntimeCreationPlanFacts | undefined): Promise<void>;
  }>>();
  const providerFor = (role: ResolvedRole) => {
    if (chiefDecision !== undefined && role.id !== "chief") throw new Error("Chief decision context requires trusted chief role");
    let provider = providers.get(role);
    if (provider) return provider;
    provider = (async () => {
      const registry: CoreRegistryEntry = { fact: { id: randomUUID(), projectRoot: resolve(options.projectRoot), rootRevision: 0,
        roleId: role.id, runtime: options.runtime, state: "preparing", reasons: [] } };
      coreRegistry.set(registry.fact.id, registry); updateCoreRegistry(registry, "preparing");
      const construction = { factoryEntered: false, nativeBindEntered: false, pending: 0, revoked: false, trustedPurePreparation: false };
      registry.construction = () => {
        const reasons: string[] = [];
        if (!construction.trustedPurePreparation) reasons.push("official-pure-preparation-unproven");
        if (!construction.revoked) reasons.push("preparation-not-revoked");
        if (construction.factoryEntered || construction.nativeBindEntered) reasons.push("effect-construction-boundary-entered");
        if (construction.pending) reasons.push("construction-continuation-pending");
        return { source: "core-construction-boundaries", status: registry.fact.sessionId ? "instance-bound" : reasons.length ? "possibly-started" : "never-started",
          factoryEntered: construction.factoryEntered, nativeBindEntered: construction.nativeBindEntered, pendingContinuations: construction.pending,
          preparedTokensRevoked: construction.revoked, reasons };
      };
      const publishConstruction = () => updateCoreRegistry(registry, registry.fact.state);
      const revoke = () => { construction.revoked = true; if (providers.get(role) === provider) providers.delete(role); publishConstruction(); };
      registry.revoke = revoke;
      const beginContinuation = () => { construction.pending++; publishConstruction(); let ended = false;
        return () => { if (!ended) { ended = true; construction.pending--; publishConstruction(); } }; };
      let turnId: string | undefined;
      let controller: AbortController | undefined;
      const interactionGate = createInteractionGate();
      const lifecycle = createRuntimeToolLifecycle();
      // Host-only defensive roots; the snapshot is not proof that discovery is complete.
      const protectedGitRoots = options.protectedGitRoots === undefined ? undefined : Object.freeze([...options.protectedGitRoots]);
      const roleCapabilityCallbacks = Object.fromEntries(roleCapabilitySlots.map(([, key]) => [key, options[key]])) as Partial<RuntimeBlockedRoleCapabilityCallbacks>;
      const display = createToolDisplayContext({credentialEnvNames:[...(options.extraCredentialEnvVars ?? []),...(options.apiKeyEnvVar ? [options.apiKeyEnvVar] : [])],requireProfile:true});
      const storage = options.persistSession && chiefDecision === undefined ? createRuntimeSessionStore({ projectRoot: options.projectRoot, roleId: role.id, runtime: options.runtime }) : undefined;
      const shellJudge = options.shellJudge;
      const governanceJudge = options.governanceJudge;
      const judgeTools = shellJudge ?? governanceJudge;
      // 后台任务管理器（2026-10-22 B1/B3）：只在**普通受治理会话**（走 buildGovernedTools）且注入了
      // `ShellGate` 时创建——与四工具注册同判据；判断会话不创建管理器（结构性看不到四工具）。
      // `RuntimeSessionOptions` 已 Omit `backgroundTasks`，外部调用方不能自行注入。
      const backgroundTasks = chiefDecision === undefined && judgeTools === undefined && options.shellGate !== undefined
        ? createBackgroundTaskManager({ diagnostics: options.diagnostics })
        : undefined;
      // 2026-10-27 同轮看图设计：按运行时策略决定 `view_image` 的交付方式（唯一开关＝
      // `RUNTIME_VIEW_IMAGE_POLICY[runtime].delivery`）。初始四项均 `next-turn` ⇒ 桌面能力原引用透传、
      // 工具行为零变化；翻为 `tool-result` 时**不再触达桌面能力**，工具结果直接带图（内联受理回执），
      // 同轮模式不依赖桌面能力实现。注册门不变：外部未注入 `viewImage` ⇒ 工具不注册（最强 fail-closed）。
      const viewImagePolicy = RUNTIME_VIEW_IMAGE_POLICY[options.runtime];
      const toolViewImage: ViewImageFn | undefined = options.viewImage === undefined
        ? undefined
        : viewImagePolicy.delivery === "tool-result"
          ? async () => ({ ok: true, mode: "tool-result" as const })
          : options.viewImage;
      try {
        const chiefWorkflow = role.id === "chief" && role.kind === "built-in-governance" && chiefDecision === undefined && judgeTools === undefined
          ? await loadBuiltinChiefWorkflow() : undefined;
        const contextSections = chiefWorkflow ? Object.freeze([...(options.contextSections ?? []),
          `## 应用内置 Chief workflow（非授权流程指导）\n${JSON.stringify({ sourceUrl: chiefWorkflow.sourceUrl, moduleUrl: chiefWorkflow.moduleUrl,
            resourceVersion: chiefWorkflow.version, sha256: chiefWorkflow.sha256, bytes: chiefWorkflow.bytes, applicationVersion: chiefWorkflow.applicationVersion })}\n\n${chiefWorkflow.text}`]) : options.contextSections;
        // 判断 agent：**能力注入，不是工具注入**——注入 `shellJudge` 时只走 `buildShellJudgeTools`
        // （恰三只只读工具）；注入 `governanceJudge` 时只走 `buildGovernanceJudgeTools`
        // （恰 `judge_read_file`/`judge_list_dir`/`report_governance_judgement`）。两者都**不得**走
        // `buildGovernedTools`（结构性隔离：判断会话不存在 write_file/edit_file/read_file/run_shell/
        // 客户交互/回交/派发/MCP 工具）。二者互斥在 createRuntimeAdapter 入口已检查。
        const sessionTools = chiefDecision !== undefined
          ? buildChiefDecisionTools(options.decidePendingRequest!, chiefDecision).map(tool => ({ ...tool, async handler(call: Parameters<typeof tool.handler>[0]) {
            const signal = controller?.signal;
            if (turnId === undefined || signal?.aborted) return { ok: false, message: "chief decision turn inactive or aborted" };
            return tool.handler({ ...call, signal: call.signal && signal ? AbortSignal.any([call.signal, signal]) : signal ?? call.signal });
          } }))
          : shellJudge !== undefined
          ? buildShellJudgeTools(shellJudge)
          : governanceJudge !== undefined
            ? buildGovernanceJudgeTools(governanceJudge)
            : buildGovernedTools(options.gate, {
              ...options,
              ...roleCapabilityCallbacks,
              protectedGitRoots,
              projectRoot: options.projectRoot,
              skillRoot: options.skillRoot,
              // 运行时也覆盖为 Service 自己的管理器（类型已 Omit；JS 调用方即便夹带同名字段也不会被采用）。
              backgroundTasks,
              // 图片策略同理由 Service 单一决定（RuntimeSessionOptions 已 Omit viewImagePolicy）。
              viewImage: toolViewImage,
              viewImagePolicy,
              readRoot: options.readRoot ?? options.projectRoot,
              writeRoot: options.writeRoot,
              shellCwd: options.shellCwd ?? options.projectRoot,
              extraCredentialEnvVars: [...(options.extraCredentialEnvVars ?? []), ...(options.apiKeyEnvVar ? [options.apiKeyEnvVar] : [])],
              roleId: role.id,
              currentTurnId: () => turnId,
              interactionGate,
            }, lifecycle).map((tool) => ({ ...tool, async handler(call: Parameters<typeof tool.handler>[0]) {
              const signal = controller?.signal;
              if (turnId === undefined || signal?.aborted) return { ok: false, message: `${tool.name}：本轮未运行或已中止，未执行` };
              return tool.handler({ ...call, signal: signal && call.signal ? AbortSignal.any([signal, call.signal]) : signal ?? call.signal });
            } }));
        const tools = sessionTools.map(tool => ({ ...tool, async handler(call: Parameters<typeof tool.handler>[0]) {
          const end = lifecycle.beginTool(tool.name, turnId);
          try { return await tool.handler(call); } finally { end(); }
        } }));
        // G-5：推理强度（wave 1 接线）——按运行时读 env（`ANS_CLAUDE/CODEX/PI_REASONING_EFFORT`）并
        // 归一（**纯读**，providerFor 每次重建即重读＝「改设置 ⇒ 下次开会话生效」沿既有语义）。非法值＝
        // **按未设处理**（本层不注入字段）＋诊断如实；**绝不因偏好值坏件拒开会话/毁轮次**（偏好不是
        // 承载件）。字段缺席交平台默认策略，不保证原生请求零参数；恢复默认与兼容由各适配器负责。
        const reasoningEffort = resolveReasoningEffort(options.runtime);
        if (reasoningEffort.state === "invalid") {
          try { options.diagnostics?.record("reasoning.effort.invalid", { mode: options.runtime, supported: false, reasonCode: "invalid-value" }); } catch { /* 诊断绝不能改变执行 */ }
        }
        const providerOptions: RuntimeProviderOptions = {
          runtime: options.runtime, projectRoot: options.projectRoot, skillRoot: options.skillRoot,
          tools, storage, interactionGate, currentTurnId: () => turnId,
          protectedGitRoots,
          toolDisplayMode:"required-v1", projectToolEvent:display.projectToolEvent, registerToolDisplayProfile:display.registerToolDisplayProfile, toolDisplayCredentialEnvNames:display.credentialEnvNames,
          modelId: options.modelId, baseUrl: options.baseUrl, providerId: options.providerId, apiKeyEnvVar: options.apiKeyEnvVar,
          // G-4 V2（wave A）：按角色读取 `docs/mcp/**` 声明并随会话注入（**纯读**——绝不建目录；坏件由
          // 读取器跳过＋诊断，绝不影响开会话）。适配器对 `installedMcpServers` 纯消费（装配/放行/呈现
          // 属各平台批次 P1–P3）；providerFor 每次重建即重读——「安装/卸载 ⇒ 下次开会话生效」。
          // 判断 agent 会话（shell judge 或治理 judge）：`judgeMode:true` ＋ `installedMcpServers:[]`——
          // 外来 MCP 一律不装配（PM 评审 §6.1；2026-10-18 双开关评审 §6.2 对两者一致；
          // Claude 适配器据此强制关闭 WebSearch/外来 MCP）。
          ...(judgeTools !== undefined || chiefDecision !== undefined
            ? { judgeMode: true as const, installedMcpServers: [] as const }
            : { installedMcpServers: listInstalledMcpServers(options.projectRoot, role.id) }),
          // G-5：仅 `set` 态注入字段；`unset`/`invalid` 保持字段缺席，交各平台默认策略。
          ...(reasoningEffort.state === "set" ? { reasoningEffort: reasoningEffort.effort } : {}),
          // Host non-authorizing context: Pipeline's existing matrix plus Service's single application Chief resource.
          // Adapters concatenate only; no workflow text becomes a gate input or an execution capability.
          ...(contextSections !== undefined ? { contextSections } : {}),
          ...resolveRuntimeTimeouts(options.runtime, options),
          // P1 请求级超时：宿主/测试注入才覆盖；缺省由适配器用 90s/300s（单一来源
          // `runtime-core/request-timeout.ts`）。Pi/Codex 不改超时语义（Q10）。
          ...(options.requestFirstByteTimeoutMs !== undefined ? { requestFirstByteTimeoutMs: options.requestFirstByteTimeoutMs } : {}),
          ...(options.requestIdleTimeoutMs !== undefined ? { requestIdleTimeoutMs: options.requestIdleTimeoutMs } : {}),
          // P2 网络状态门/恢复窗口：宿主（主进程 monitor）注入才生效；缺省 always-online。
          ...(options.networkGate !== undefined ? { networkGate: options.networkGate } : {}),
          ...(options.networkRetryWindowMs !== undefined ? { networkRetryWindowMs: options.networkRetryWindowMs } : {}),
          // P3 replay-safe 同回合重试：宿主/测试注入才覆盖；缺省由 Claude 适配器用 3 attempts/
          // 1s·2s 退避/10min 预算（Pi/Codex 不消费，本轮只回归）。
          ...(options.requestAttemptMax !== undefined ? { requestAttemptMax: options.requestAttemptMax } : {}),
          ...(options.requestRetryBaseMs !== undefined ? { requestRetryBaseMs: options.requestRetryBaseMs } : {}),
          ...(options.requestRetryMaxDelayMs !== undefined ? { requestRetryMaxDelayMs: options.requestRetryMaxDelayMs } : {}),
          ...(options.requestRetryBudgetMs !== undefined ? { requestRetryBudgetMs: options.requestRetryBudgetMs } : {}),
          ...(chiefDecision !== undefined ? { chiefDecisionContext: chiefDecision, requestAttemptMax: 1, requestRetryBudgetMs: chiefDecision.limits.timeoutMs,
            turnLastResortMs: chiefDecision.limits.timeoutMs, constructTimeoutMs: chiefDecision.limits.timeoutMs } : {}),
        };
        const factoryOverride = options.providerFactories?.[options.runtime];
        const factoryProvenance = factoryOverride !== undefined ? "custom-override" as const
          : options.runtime === "demo" ? "demo" as const : "default-production" as const;
        const initialAppTools = tools.map(tool => tool.name);
        const initialToolHandlers = tools.map(tool => tool.handler);
        const initialMcpServers = providerOptions.installedMcpServers?.map(server => server.name) ?? [];
        const factory = factoryOverride ?? (options.runtime === "demo"
          ? ((input: RuntimeProviderOptions) => createDemoRuntimeAdapter(input, options.script ?? [{ name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } }]))
          : await defaultFactory(options.runtime));
        if (typeof providerOptions.projectToolEvent !== "function" || typeof providerOptions.registerToolDisplayProfile !== "function") throw new Error("Core tool display capability missing");
        let actual: Promise<RuntimeAdapter> | undefined, nativePreparation: RuntimeNativeFactoryPreparation | undefined;
        let admittedScope: Awaited<ReturnType<typeof readCoreProtectionScope>> | undefined;
        // 2026-11-08（P1.3 §2.2.4）：受保护范围的执行/绑定准入计划。只在 `bindPreparedRole`/`composeContext`
        // 的 token 成立后由 `setAdmittedPlan` 设置（并与 planId/`isCurrent()` 一致），`ensureAdapter` 据此放行。
        let admittedPlan: RuntimeCreationPlanFacts | undefined;
        let assertAdmission: () => void = () => { throw new Error("runtime-core-admission-missing"); };
        const optionSnapshot = Object.entries(options), roleSnapshot = JSON.stringify(role);
        const isCurrent = () => !construction.revoked && Object.keys(options).length === optionSnapshot.length
          && optionSnapshot.every(([key, value]) => (options as unknown as Record<string, unknown>)[key] === value)
          && options.providerFactories?.[options.runtime] === factoryOverride && JSON.stringify(role) === roleSnapshot
          && providerOptions.tools.length === initialAppTools.length
          && providerOptions.tools.every((tool, index) => tool.name === initialAppTools[index] && tool.handler === initialToolHandlers[index])
          && (!nativePreparation || nativePreparation.isCurrent());
        const roleCapabilityGuards = (binding: Pick<RuntimeBlockedRoleCapabilityFacts, "corePlanId" | "nativePlanId" | "nativeConfigDigest" | "sessionId"> = {}): RuntimeBlockedRoleCapabilityFacts | undefined => {
          const registered = roleCapabilitySlots.filter(([tool]) => initialAppTools.includes(tool));
          if (!registered.length) return undefined;
          const guardedTools: RuntimeRoleCapabilityTool[] = [], unguardedTools: RuntimeRoleCapabilityTool[] = [], reasons: string[] = [];
          let drift = false;
          try { drift = JSON.stringify(role) !== roleSnapshot || providerOptions.tools.length !== initialAppTools.length
            || providerOptions.tools.some((tool, index) => tool.name !== initialAppTools[index] || tool.handler !== initialToolHandlers[index]); }
          catch { drift = true; }
          if (drift) reasons.push("role-or-core-registry-drift");
          for (const [tool, key] of registered) {
            const callback = roleCapabilityCallbacks[key];
            let current = false;
            try { current = options[key] === callback; } catch { /* Unreadable host binding stays unproven. */ }
            if (!drift && current && typeof callback === "function" && blockedRoleCapabilities.get(callback) === tool) guardedTools.push(tool);
            else { unguardedTools.push(tool); reasons.push(`${tool}-callback-identity-unverified`); }
          }
          return { source: "core-blocked-role-capability-callbacks", mechanism: "no-effect-rejection-v1", status: reasons.length ? "unknown" : "bound",
            roleId: registry.fact.roleId, runtime: registry.fact.runtime,
            registryDigest: createHash("sha256").update(JSON.stringify({ roleId: registry.fact.roleId, runtime: registry.fact.runtime, initialAppTools, guardedTools, unguardedTools })).digest("hex"),
            guardedTools, unguardedTools, reasons, ...binding };
        };
        const assertRoleCapabilityScope = (scope: Awaited<ReturnType<typeof readCoreProtectionScope>>) => {
          if (scope.state === "required" && roleCapabilityGuards()?.status === "unknown") throw new Error("required-scope-role-capability-effects-unproven");
        };
        /** Token 成立后登记准入计划：必须仍是当前配置/计划（否则视为配置已变，fail-closed）。 */
        const setAdmittedPlan = (plan: RuntimeCreationPlanFacts) => {
          if (!isCurrent() || registry.fact.planId !== plan.planId) throw new Error("runtime-prepared-configuration-changed");
          admittedPlan = plan;
        };
        /**
         * §2.2.4 绑定/执行期审批链复核：受保护 + 注册了 shell 工具时，重读 live binding（inspect/probe），
         * 要求存在、项目根一致（规范化比较）、`file+durable+probe ok`、稳定投影与计划一致；
         * 任一不符 ⇒ `protected-scope-approval-chain-changed`（防御性判据，见 `matchesRuntimeApprovalChain`）。
         */
        const verifyApprovalChainBinding = async (plan: RuntimeCreationPlanFacts | undefined): Promise<void> => {
          if (plan?.scopeProtection?.state !== "required" || !hasShellAdmissionTools(initialAppTools)) return;
          const gate = options.shellGate;
          if (typeof gate !== "function" || inspectShellApproval(gate) === undefined)
            throw new Error("protected-scope-approval-chain-changed");
          const evidence = await readApprovalChainEvidence(gate, options.projectRoot);
          if (evidence.kind !== "verified" || !matchesRuntimeApprovalChain(evidence.chain, plan.approvalChain))
            throw new Error("protected-scope-approval-chain-changed");
        };
        const ensureAdapter = () => actual ??= (async () => {
          const end = beginContinuation();
          try {
          if (construction.revoked) throw new Error("runtime-preparation-revoked");
          assertAdmission();
          const scope = await readCoreProtectionScope(options.projectRoot);
          // P1.3 §2.2.4：受保护范围只接受 token 成立的准入计划（admittedPlan）；unsupported/demo 在
          // prepareRole 即被 reason 拒绝，不会产生 token。
          if (scope.state === "unknown" || scope.state === "required" && !admittedPlan)
            throw new Error("runtime-protected-scope-requires-verified-plan");
          assertRoleCapabilityScope(scope);
          admittedScope = scope;
          updateCoreRegistry(registry, "creating", nativePreparation ? [] : ["legacy-bind-without-precreation-plan"]);
          if (nativePreparation) { if (!isCurrent() || !nativePreparation.adapter) throw new Error("runtime-prepared-configuration-changed"); return nativePreparation.adapter; }
          construction.factoryEntered = true; publishConstruction();
          return await (chiefDecision === undefined ? factory(providerOptions)
            : withTimeout(Promise.resolve(factory(providerOptions)), chiefDecision.limits.timeoutMs, "构造chief决策上下文"));
          } finally { end(); }
        })();
        const verifyScope = async () => { const scope = await readCoreProtectionScope(options.projectRoot);
          if (!admittedScope || scope.state === "unknown" || scope.state !== admittedScope.state || scope.revision !== admittedScope.revision)
            throw new Error("runtime-protection-scope-changed");
          assertRoleCapabilityScope(scope);
          // 2026-11-08（§2.2.4）：删除原 unconfined 检查；受保护范围复核审批链仍一致。
          if (scope.state === "required") {
            if (!admittedPlan) throw new Error("runtime-protected-scope-requires-verified-plan");
            await verifyApprovalChainBinding(admittedPlan);
          }
          if (construction.revoked) throw new Error("runtime-preparation-revoked");
          assertAdmission(); };
        const adapter: RuntimeAdapter = { async composeContext(boundRole) { const end = beginContinuation();
          try { const materialized = await ensureAdapter(); await verifyScope(); return await materialized.composeContext(boundRole); }
          catch (error) { revoke(); bindConstructionFailure(error, registry); updateCoreRegistry(registry, "failed", ["core-context-construction-failed"]); throw error; }
          finally { end(); } },
          async bindRole(boundRole) { const end = beginContinuation();
            try { const materialized = await ensureAdapter(); await verifyScope(); construction.nativeBindEntered = true; publishConstruction(); return await materialized.bindRole(boundRole); }
            finally { end(); } } };
        const prepareNative = async () => {
          const end = beginContinuation(); try {
          if (construction.revoked) throw new Error("runtime-preparation-revoked");
          if (nativePreparation && isCurrent()) return nativePreparation;
          if (actual || factoryProvenance !== "default-production" || options.runtime !== "codex") return undefined;
          const module = await import("../../provider/codex/session.ts") as unknown as {
            prepareCodexRuntimeAdapter?: import("../../model/runtime.ts").RuntimeNativeFactoryPlanner;
          };
          if (!module.prepareCodexRuntimeAdapter) return undefined;
          const prepared = await module.prepareCodexRuntimeAdapter(providerOptions, role);
          construction.trustedPurePreparation = !!prepared.adapter && prepared.facts.status === "observed" && prepared.facts.factory === "codex-chat"
            && prepared.facts.transport === "http" && prepared.facts.wire === "chat" && prepared.facts.foreignMcpServers.length === 0
            && prepared.facts.nativeBuiltinTools.length === 0 && prepared.facts.plannedProcesses.length === 0 && prepared.facts.reasons.length === 0;
          nativePreparation = prepared; return prepared;
          } finally { end(); }
        };
        return { adapter, display, options: providerOptions, backgroundTasks, lifecycle, factoryProvenance, initialAppTools, initialToolHandlers, initialMcpServers, protectedGitRoots, registry, prepareNative, isCurrent, roleCapabilityGuards,
          revoke, beginContinuation, setAdmittedPlan, verifyApprovalChainBinding,
          setAdmissionGuard(guard: () => void) { assertAdmission = guard; },
          setTurn(id?: string, nextController?: AbortController) { turnId = id; controller = nextController; } };
      } catch (error) {
        revoke(); bindConstructionFailure(error, registry);
        updateCoreRegistry(registry, "failed", ["core-preparation-failed-resource-coverage-unknown"]);
        // 构造/工厂失败也要释放管理器（生命周期与绑定会话对齐；dispose 幂等）。
        await backgroundTasks?.dispose();
        throw error;
      }
    })();
    providers.set(role, provider);
    return provider;
  };
  const preparedTokens = new WeakMap<object, { role: ResolvedRole; plan: RuntimeCreationPlanFacts; used: boolean; provider: Awaited<ReturnType<typeof providerFor>> }>();
  const bindRole = async (role: ResolvedRole, creationPlan: RuntimeCreationPlanFacts | undefined, assertHeld: () => void): Promise<RoleSession> => {
      const provider = await providerFor(role);
      provider.setAdmissionGuard(assertHeld);
      const storage = provider.options.storage;
      let previous: RuntimeSessionRecord | undefined;
      let inner: RoleSession;
      let constructed: RoleSession | undefined;
      const endAttempt = provider.beginContinuation();
      try {
        previous = await storage?.readLatest();
        inner = await withTimeout(provider.adapter.bindRole(role), provider.options.constructTimeoutMs ?? 120000, `${options.runtime} 建立角色会话`);
        constructed = inner;
        try { provider.display.assertReady(); } catch (error) { await inner.dispose(); throw error; }
        if (creationPlan?.native) {
          const actual = inner.inspectNativeToolSurface?.();
          if (!provider.isCurrent() || !isRuntimeNativeToolSurfaceFacts(actual)
            || actual.factoryPlan?.planId !== creationPlan.native.planId || actual.factoryPlan?.configDigest !== creationPlan.native.configDigest
            || actual.roleId !== role.id || actual.runtime !== options.runtime || actual.status !== "observed" || actual.factory !== "codex-chat"
            || actual.nativeInstanceId !== inner.nativeLifecycle?.instanceId || actual.foreignMcpServers.length || actual.nativeBuiltinTools.length
            || actual.appTools.length !== creationPlan.native.appTools.length || actual.appTools.some(name => !creationPlan.native!.appTools.includes(name))) {
            await inner.dispose(); throw new Error("runtime-native-factory-plan-binding-unverified");
          }
        }
      } catch (error) {
        provider.revoke(); bindConstructionFailure(error, provider.registry);
        updateCoreRegistry(provider.registry, "failed", ["core-construction-failed-resource-coverage-unknown"]);
        try { await constructed?.dispose(); } catch { /* Retain failed/unknown resource facts, never an empty success. */ }
        // bindRole / assertReady 失败也要释放管理器（后台任务生命周期与绑定会话对齐；dispose 幂等）。
        await provider.backgroundTasks?.dispose();
        throw error;
      } finally { endAttempt(); }
      let nativeLifecycle: RuntimeNativeLifecycle | undefined;
      let nativeInstanceId: string | undefined;
      try { nativeLifecycle = inner.nativeLifecycle; nativeInstanceId = nativeLifecycle?.instanceId; }
      catch { /* An unreadable hook remains unknown; do not infer no native processes. */ }
      providers.delete(role); // Each bound session owns its own turn/controller/tool closure.
      const queue = createEventQueue<SessionEvent>();
      const recordId = previous?.id ?? randomUUID();
      const sessionId = randomUUID();
      const createdAt = previous?.createdAt ?? new Date().toISOString();
      type Turn = { plan?:DeliveryPlan; id: string; controller: AbortController; outcome: RuntimeTurnOutcome; outcomeLocked?: boolean; terminal: () => void; terminalPromise: Promise<void>; abortPromise?: Promise<void>; cleanupFailed?: boolean; attempts?: number; replaySafe?: boolean; providerStarted?: boolean; providerFinished?: boolean; promptFinalized?: boolean; rawSettledAt?: string };
      let active: Turn | undefined;
      let latestTurn: Turn | undefined;
      let stopRequested = false;
      let stopSealed = false;
      let stopCleanupPending = 0;
      const stopCleanupErrors: string[] = [];
      const backgroundObserved = new Map<string, RuntimeOwnedProcessFact>();
      const backgroundClosed = new Set<string>();
      let disposed = false;
      let disposalReceipt: RuntimeSessionLifecycleFacts | undefined;
      let disposalConstraints: string[] | undefined;
      let disposalCleanupPending = false;
      let replayWritesPending = 0;
      let disposalFingerprint = "";
      let quarantined = false;
      let streamEnded = false;
      let pendingPersist = Promise.resolve();
      let persistenceError: unknown;
      let deliveryPreflight=false;
      const endedTurns=new Set<string>();
      const persistence=createPersistenceState({scope:{roleId:role.id,runtime:options.runtime},projectRoot:options.projectRoot,storage,display:provider.display,diagnostics:options.diagnostics,ended:endedTurns,disposed:()=>disposed,active:()=>!!active||deliveryPreflight,onDrain:()=>refreshDisposalEvidence()});
      const requestAbort = (turn: Turn): Promise<void> => {
        if (!turn.abortPromise) {
          turn.abortPromise = withTimeout(Promise.resolve().then(() => inner.abort?.()), 1000, "中止清理").catch((error) => {
            // 清理失败只用于诊断/事件：它不证明底层轮次还在运行，**不得**单独决定隔离。
            turn.cleanupFailed = true;
            throw error;
          });
        }
        return turn.abortPromise;
      };
      const collectLifecycle = (afterDisposal = false): RuntimeSessionLifecycleFacts => {
        const reasons: string[] = [];
        let unknown = false;
        let coverageUnknown = false;
        let toolFacts: ReturnType<RuntimeToolLifecycle["snapshot"]> = { activeTools: [], processes: [] };
        try { toolFacts = provider.lifecycle.snapshot(); }
        catch { reasons.push("tool-lifecycle-read-failed"); unknown = true; coverageUnknown = true; }
        if (disposed && !afterDisposal) { reasons.push("disposed-lifecycle-evidence-unavailable"); unknown = true; coverageUnknown = true; }
        if (provider.backgroundTasks && !disposed) {
          try {
            const tasks = provider.backgroundTasks.list();
            if (!Array.isArray(tasks)) throw new Error("background list unavailable");
            for (const task of tasks) {
              const exited = backgroundClosed.has(task.taskId) || task.state === "exited" || task.state === "stopped";
              backgroundObserved.set(task.taskId, { id: task.taskId, kind: "background", state: exited ? "exited" : task.state === "running" ? "running" : "unknown",
                treeStatus: "unknown", ...(task.pid !== undefined ? { pid: task.pid } : {}),
                ...(task.exitCode !== undefined ? { exitCode: task.exitCode } : {}), ...(task.signal ? { signal: task.signal } : {}) });
            }
            if (provider.backgroundTasks.runningCount > tasks.filter(task => task.state === "running" || task.state === "kill-timeout" || task.state === "failed").length) {
              reasons.push("background-start-not-yet-observed");
              coverageUnknown = true;
            }
          } catch { reasons.push("background-lifecycle-read-failed"); unknown = true; coverageUnknown = true; }
        }
        const processes = [...toolFacts.processes, ...backgroundObserved.values()];
        const activeTools = [...toolFacts.activeTools];
        let nativeFacts: RuntimeNativeLifecycleFacts | undefined;
        if (options.runtime !== "demo") {
          try {
            const native = nativeLifecycle?.inspect();
            if (!isRuntimeNativeLifecycleFacts(native) || !nativeInstanceId || native.instanceId !== nativeInstanceId
              || nativeLifecycle?.instanceId !== nativeInstanceId || native.roleId !== role.id || native.runtime !== options.runtime
              || (inner.nativeSessionId !== undefined && native.nativeSessionId !== inner.nativeSessionId)
              || (latestTurn?.providerStarted && native.coreTurnId !== latestTurn.id)) {
              reasons.push("native-provider-process-coverage-unavailable"); unknown = true; coverageUnknown = true;
            } else {
              nativeFacts = structuredClone(native);
              if (native.processCoverage !== "complete") coverageUnknown = true;
              if (native.transport.kind === "unknown" || native.transport.kind === "owned-process" && native.promptState !== "not-started"
                && !native.processes.some(process => process.kind === "native")) coverageUnknown = true;
              processes.push(...nativeFacts.processes); activeTools.push(...nativeFacts.activeTools);
              const promptProven = native.promptState === "settled" && !!native.settledAt
                || native.promptState === "not-started" && !latestTurn?.providerStarted;
              const transportProven = native.transport.kind !== "unknown" && (native.transport.state === "idle" || native.transport.state === "closed")
                && (native.transport.kind !== "owned-process" || native.promptState === "not-started"
                  || native.transport.state === "closed" && native.processes.some(process => process.kind === "native"));
              if (native.status !== "quiescent" || !promptProven || !transportProven || native.processCoverage !== "complete"
                || native.activeTools.length || native.processes.some(process => process.state !== "exited" || process.treeStatus !== "verified")
                || native.reasons.length) {
                reasons.push("native-provider-not-proven-quiescent", ...native.reasons.map(reason => `native:${reason}`)); unknown = true;
              }
            }
          } catch { reasons.push("native-provider-lifecycle-read-failed"); unknown = true; coverageUnknown = true; }
        }
        if (activeTools.length) reasons.push("active-tool-or-capability-work");
        if (processes.some(process => process.state !== "exited")) reasons.push("owned-process-not-exited");
        if (processes.some(process => process.treeStatus !== "verified")) reasons.push("process-tree-unverified");
        if (processes.some(process => process.state === "unknown" || (process.state === "exited" && process.treeStatus !== "verified"))) unknown = true;
        if (processes.some(process => process.state === "unknown" || process.treeStatus !== "verified")) coverageUnknown = true;
        const turn = latestTurn;
        if (turn?.providerStarted && !turn.providerFinished) reasons.push("provider-still-running");
        if (turn && !turn.promptFinalized) reasons.push("core-turn-not-drained");
        if (turn?.providerStarted && !turn.rawSettledAt) {
          reasons.push("real-provider-settled-not-observed");
          if (turn.providerFinished) unknown = true;
        }
        if (deliveryPreflight) reasons.push("delivery-preflight-in-flight");
        if (replayWritesPending) reasons.push("replay-write-pending");
        if (persistence.pendingWrites()) reasons.push("persistence-callback-in-flight");
        if (disposed && !streamEnded) reasons.push("provider-event-pump-not-drained");
        if (disposed && disposalCleanupPending) reasons.push("dispose-cleanup-pending");
        if (stopCleanupPending) reasons.push("stop-cleanup-pending");
        if (stopCleanupErrors.length) { reasons.push(...stopCleanupErrors); unknown = true; coverageUnknown = true; }
        return { sessionId, roleId: role.id, runtime: options.runtime, ...(turn ? { turnId: turn.id } : {}), stopRequested,
          status: reasons.length === 0 ? "quiescent" : unknown ? "unknown" : "stopping",
          ...(turn?.rawSettledAt ? { settledAt: turn.rawSettledAt, settledTurnId: turn.id } : {}),
          providerFinished: !turn?.providerStarted || turn.providerFinished === true,
          activeTools, processes, ...(nativeFacts ? { native: nativeFacts } : {}),
          // Coverage answers which owned programs are known, independently of whether this HTTP/Core turn has drained.
          processCoverage: coverageUnknown ? "unknown" : "complete", reasons };
      };
      function refreshDisposalEvidence(): void {
        if (!disposed || !disposalConstraints) return;
        const terminal = collectLifecycle(true), reasons = [...terminal.reasons, ...disposalConstraints];
        disposalReceipt = { ...terminal, ...(disposalConstraints.length ? { processCoverage: "unknown" as const } : {}),
          ...(reasons.length || terminal.status !== "quiescent" ? { status: "unknown" as const,
            reasons: [...reasons, "disposed-lifecycle-evidence-unavailable"] } : {}) };
        const fingerprint = JSON.stringify({ ...disposalReceipt, ...(disposalReceipt.native ? { native: { ...disposalReceipt.native, observedAt: undefined } } : {}) });
        provider.registry.fact = { ...provider.registry.fact, lifecycle: structuredClone(disposalReceipt) };
        if (fingerprint !== disposalFingerprint) { disposalFingerprint = fingerprint; updateCoreRegistry(provider.registry, provider.registry.fact.state); }
        // Unknown work retains its actual observer. Only a genuinely drained terminal instance can release it.
        if (disposalReceipt.status === "quiescent") delete provider.registry.session;
      }
      const inspectLifecycle = (): RuntimeSessionLifecycleFacts => { refreshDisposalEvidence(); return disposalReceipt ? structuredClone(disposalReceipt) : collectLifecycle(); };
      const emit = (inputEvent: SessionEvent, plan:DeliveryPlan|undefined=active?.plan, visible=true) => {
        let event = inputEvent.kind === "tool_call" || inputEvent.kind === "accepted" || inputEvent.kind === "denied" ? routeRuntimeDisplayEvent(inputEvent,provider.display,"projected-event") : inputEvent;
        // G-5 推理事实通道**单点**：`detail.source==="reasoning"` 的原始事实在此恰一次过核心投影
        // （脱敏＋预算，实现＝display context 的 projectReasoningDetail）——队列/持久化/桌面所见一律为
        // 投影形（或如实诊断形）；原始正文绝不外流。summary 定格为常量（承载语义全在 detail；杜绝
        // 未脱敏的随载荷文本借 summary 外流）；`turnId` 由 pump 并入 detail，投影后原样保留。
        const reasoningCarrier = event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) && (event.detail as { source?: unknown }).source === "reasoning" ? event.detail as Record<string, unknown> : undefined;
        if (reasoningCarrier) {
          const projected = provider.display.projectReasoningDetail(reasoningCarrier as unknown as RuntimeReasoningEventDetailV1);
          event = { ...event, summary: event.kind === "message" ? (projected.source === "reasoning" ? REASONING_EVENT_SUMMARY : REASONING_DIAGNOSTIC_SUMMARY) : event.summary, detail: { ...projected, ...(typeof reasoningCarrier.turnId === "string" ? { turnId: reasoningCarrier.turnId } : {}) } };
        }
        if(plan && event.kind==='message' && (event.detail as {source?:string}|undefined)?.source==='prompt-input' && jsonBytes(event)>REPORT_LIMITS.input)throw Error('PROVENANCE_TOO_LARGE');
        if(visible)queue.push(event);
        if(storage){
          let storedEvent=event;
          if(plan?.presentation && event.kind==='message' && (event.detail as {source?:string}|undefined)?.source==='prompt-input'){
            const {inputPresentation:_liveOnly,...detail}=event.detail as PromptInputEventDetail;
            storedEvent={...event,detail};
          }
          const entry=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:'event',event:storedEvent,turnId:storedEvent.turnId});
          replayWritesPending++;
          pendingPersist=pendingPersist.then(()=>{if(plan&&persistenceError)return;return storage.appendReplay([entry]);}).catch(error=>{persistenceError??=error;})
            .finally(()=>{replayWritesPending--;refreshDisposalEvidence();});
        }
      };
      const pump = (async () => {
        try {
          for await (const event of inner.events()) {
            const turn = active ?? (event.kind === "settled" ? latestTurn : undefined);
            if (!turn || (event.turnId && event.turnId !== turn.id)) continue;
            if (event.kind === "settled") {
              turn.rawSettledAt = new Date().toISOString();
              refreshDisposalEvidence();
              const detail = event.detail as { outcome?: unknown; attempts?: unknown; replaySafe?: unknown } | undefined;
              const outcome = detail?.outcome;
              if (!turn.outcomeLocked && ["failed", "aborted", "timed_out"].includes(String(outcome))) turn.outcome = outcome as RuntimeTurnOutcome;
              // P3：适配器 settled.detail 的 attempts/replaySafe 如实带入本层终态 detail
              // （成功但经过重试时也可见；失败时仍以错误结构化事实为准）。
              if (typeof detail?.attempts === "number" && Number.isFinite(detail.attempts)) turn.attempts = detail.attempts;
              if (typeof detail?.replaySafe === "boolean") turn.replaySafe = detail.replaySafe;
              turn.terminal();
            } else emit({ ...event, runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: {
              ...(event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? event.detail as Record<string, unknown> : event.detail === undefined ? {} : { value: event.detail }),
              turnId: turn.id,
            } });
          }
        } catch (error) {
          if (active) {
            if (!active.outcomeLocked) active.outcome = "failed";
            emit({ kind: "denied", summary: `事件流失败：${error instanceof Error ? error.message : String(error)}`, runtime: options.runtime, roleId: role.id, turnId: active.id });
          }
        } finally { streamEnded = true; active?.terminal(); refreshDisposalEvidence(); }
      })();
      const wrapper: RoleSession = {
        sessionId,
        inspectLifecycle,
        inspectToolSurface() {
          let appTools: string[] = [], configuredForeignMcpServers: string[] = [];
          const reasons: string[] = [];
          let native: RuntimeNativeToolSurfaceFacts | undefined;
          let nativeToolRegistry: "application-mediated" | "unknown" = "unknown";
          try {
            if (!Array.isArray(provider.options.tools) || !Array.isArray(provider.options.installedMcpServers)) throw new Error("registry unavailable");
            appTools = provider.options.tools.map(tool => tool.name);
            configuredForeignMcpServers = provider.options.installedMcpServers.map(server => server.name);
            if ([...appTools, ...configuredForeignMcpServers].some(name => typeof name !== "string" || !name.trim())) throw new Error("invalid registry name");
            if (!sameNameSet(appTools, provider.initialAppTools) || !sameNameSet(configuredForeignMcpServers, provider.initialMcpServers)) reasons.push("core-registry-changed-after-factory");
            if (provider.options.tools.some((tool, index) => tool.handler !== provider.initialToolHandlers[index])) reasons.push("core-tool-handler-changed-after-factory");
          } catch { reasons.push("core-registry-read-failed"); }
          if (options.runtime !== "demo") {
            try {
              const observed = inner.inspectNativeToolSurface?.();
              if (isRuntimeNativeToolSurfaceFacts(observed)) native = structuredClone(observed);
              if (provider.factoryProvenance !== "default-production") reasons.push("custom-provider-factory-unverified");
              if (!native || !nativeLifecycle || !nativeInstanceId || nativeLifecycle.instanceId !== nativeInstanceId
                || native.nativeInstanceId !== nativeInstanceId || native.roleId !== role.id || native.runtime !== options.runtime)
                reasons.push("native-tool-registry-binding-unverified");
              else {
                const lifecycle = nativeLifecycle.inspect();
                if (!isRuntimeNativeLifecycleFacts(lifecycle) || lifecycle.instanceId !== nativeInstanceId
                  || lifecycle.roleId !== role.id || lifecycle.runtime !== options.runtime || lifecycle.transport.kind !== "http"
                  || lifecycle.status === "unknown" || lifecycle.promptState === "unknown"
                  || lifecycle.processCoverage !== "complete" || lifecycle.processes.length > 0
                  || lifecycle.activeTools.some(tool => !appTools.includes(tool.name))) reasons.push("native-tool-execution-coverage-unverified");
                if (options.runtime !== "codex" || native.factory !== "codex-chat" || native.status !== "observed" || native.reasons.length)
                  reasons.push("native-production-tool-factory-unverified");
                if (!sameNameSet(native.appTools, appTools) || !sameNameSet(native.foreignMcpServers, configuredForeignMcpServers)) reasons.push("native-tool-registry-mismatch");
                if (native.nativeBuiltinTools.length || native.foreignMcpServers.length || configuredForeignMcpServers.length
                  || appTools.includes("run_shell") || appTools.includes("start_background_task")) reasons.push("unmediated-execution-registered");
                const coreWork = provider.lifecycle.snapshot();
                if (coreWork.processes.some(process => process.state !== "exited" || process.treeStatus !== "verified")
                  || (provider.backgroundTasks && (provider.backgroundTasks.runningCount !== 0
                    || provider.backgroundTasks.list().some(task => task.state !== "exited" && task.state !== "stopped")))) reasons.push("owned-execution-program-not-proven-stopped");
              }
            } catch { reasons.push("native-tool-surface-read-failed"); }
          }
          if (disposed) reasons.push("disposed-registry-not-current");
          const roleCapabilityGuards = provider.roleCapabilityGuards({ sessionId,
            ...(creationPlan ? { corePlanId: creationPlan.planId } : {}),
            ...(native?.factoryPlan ? { nativePlanId: native.factoryPlan.planId, nativeConfigDigest: native.factoryPlan.configDigest } : {}) });
          if (roleCapabilityGuards?.status === "unknown") reasons.push("role-capability-callback-guard-unverified");
          if (!reasons.length && native && provider.factoryProvenance === "default-production") nativeToolRegistry = "application-mediated";
          // P1.6 §4.4 包装层组合：仅严格 status !== observed（reasons 非空）且 claude/pi/codex +
          // default-production + 未 disposed 时尝试构造受限应用中介证据；否则字段缺席（fail-closed）。
          // 本字段不改变上面的 status/nativeToolRegistry 判定，也不被写/发布/停稳门读取。
          let liveNativeInstanceId: string | undefined;
          try { liveNativeInstanceId = nativeLifecycle?.instanceId; } catch { liveNativeInstanceId = undefined; }
          const applicationMediation = composeRuntimeApplicationMediation({
            runtime: options.runtime, factoryProvenance: provider.factoryProvenance, disposed, strictReasons: reasons,
            roleId: role.id, nativeInstanceId, nativeLifecycleInstanceId: liveNativeInstanceId,
            appTools, configuredForeignMcpServers, nativeFact: native,
            applicationFact: () => inner.inspectApplicationToolSurface?.(),
          });
          return { source: "core-provider-assembly", sessionId, roleId: role.id, runtime: options.runtime,
            status: reasons.length ? "unknown" : "observed", appTools, configuredForeignMcpServers,
            factoryProvenance: provider.factoryProvenance, nativeToolRegistry, filesystemConfinement: "unknown", reasons,
            ...(roleCapabilityGuards ? { roleCapabilityGuards } : {}),
            ...(applicationMediation ? { applicationMediation } : {}),
            ...(options.writeRoot !== undefined && !disposed && !reasons.includes("core-tool-handler-changed-after-factory")
              && !reasons.includes("core-registry-changed-after-factory") && !reasons.includes("core-registry-read-failed")
              && appTools.includes("write_file") && appTools.includes("edit_file") ? { fileWriteProtection: {
                mechanism: "canonical-roots-and-nlink-v1" as const, coveredTools: ["write_file", "edit_file"] as const,
                protectedGitRoots: [...(provider.protectedGitRoots ?? [])],
                rootDiscovery: provider.protectedGitRoots === undefined ? "not-provided" as const : "host-provided" as const,
                rootCoverage: "unknown" as const,
                limitations: ["path-based-checks-do-not-eliminate-TOCTOU", "host-root-coverage-not-proven", "other-write-capabilities-not-covered", "not-an-OS-sandbox"],
              } } : {}),
            ...(native ? { native } : {}) };
        },
        async stopAndInspect(input, signal) {
          const invalid = (reason: string): RuntimeSessionLifecycleFacts => ({ ...inspectLifecycle(), status: "unknown", reasons: [reason] });
          if (input.expectedSessionId !== sessionId) return invalid("session-identity-mismatch");
          if (input.expectedTurnId !== undefined && input.expectedTurnId !== latestTurn?.id) return invalid("turn-identity-mismatch");
          if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) return invalid("invalid-stop-budget");
          if (signal?.aborted) return invalid("stop-inspection-aborted");
          if (disposed) return disposalReceipt?.status === "quiescent" ? structuredClone(disposalReceipt) : invalid("disposed-lifecycle-evidence-unavailable");
          recordGitHostInterruption({ projectRoot: options.projectRoot, reason: "core-stop-requested", coreSessionId: sessionId });
          stopRequested = true; stopSealed = true;
          const turn = latestTurn;
          const observeCleanup = (work: Promise<unknown>, label: string): void => {
            stopCleanupPending++;
            void work.then(() => { stopCleanupPending--; refreshDisposalEvidence(); }, () => { stopCleanupPending--; stopCleanupErrors.push(label); refreshDisposalEvidence(); });
          };
          if (turn) {
            turn.controller.abort();
            if (!nativeLifecycle && inner.abort && turn.providerStarted && !turn.providerFinished) observeCleanup(requestAbort(turn), "provider-abort-cleanup-failed");
          }
          if (nativeLifecycle && options.runtime !== "demo") {
            try {
              if (!nativeInstanceId || nativeLifecycle.instanceId !== nativeInstanceId) return invalid("native-instance-identity-mismatch");
            } catch { return invalid("native-provider-lifecycle-read-failed"); }
            observeCleanup(Promise.resolve().then(() => nativeLifecycle!.stopAndInspect({ expectedInstanceId: nativeInstanceId!,
              ...(turn?.providerStarted ? { expectedCoreTurnId: turn.id } : {}), timeoutMs: input.timeoutMs }, signal)).then(result => {
              if (!isRuntimeNativeLifecycleFacts(result) || result.instanceId !== nativeInstanceId || result.roleId !== role.id
                || result.runtime !== options.runtime || (turn?.providerStarted && result.coreTurnId !== turn.id)) throw new Error("native stop returned unbound facts");
            }), "native-stop-facts-invalid-or-failed");
          }
          try { provider.lifecycle.stopOwnedProcesses(); } catch { stopCleanupErrors.push("owned-process-stop-failed"); }
          const stoppingBackgrounds = new Set<string>();
          const deadline = Date.now() + input.timeoutMs;
          for (;;) {
            if (provider.backgroundTasks) {
              try {
                const tasks = provider.backgroundTasks.list();
                if (!Array.isArray(tasks)) throw new Error("background list unavailable");
                for (const task of tasks) if (!stoppingBackgrounds.has(task.taskId)) {
                  stoppingBackgrounds.add(task.taskId);
                  observeCleanup(provider.backgroundTasks.stop(task.taskId).then(result => {
                    if (!result.ok) throw new Error("background stop not proven");
                    backgroundClosed.add(task.taskId);
                  }), "background-stop-not-proven");
                }
              } catch { return invalid("background-lifecycle-read-failed"); }
            }
            const facts = inspectLifecycle();
            if (facts.status === "quiescent") return facts;
            if (signal?.aborted) return { ...facts, status: "unknown", reasons: [...facts.reasons, "stop-inspection-aborted"] };
            if (Date.now() >= deadline) return { ...facts, status: "unknown", reasons: [...facts.reasons, "stop-drain-budget-exhausted"] };
            await new Promise<void>(resolve => setTimeout(resolve, Math.min(5, Math.max(1, deadline - Date.now()))));
          }
        },
        runtime: options.runtime, roleId: role.id, persistence:persistence.capability,
        get contextSource() { return inner.contextSource ?? (storage ? "fresh" : "in-memory"); },
        get nativeSessionId() { return inner.nativeSessionId; },
        get contextWarning() { return inner.contextWarning; },
        async prompt(text: string, promptOptions?: PromptOptions) {
          if (disposed) throw new Error("会话已关闭");
          if (stopSealed) throw new Error("会话已封闭停止，不再接受新轮次");
          if (active || quarantined || deliveryPreflight) throw new Error("上一轮仍在运行或中止清理中");
          if (chiefDecision !== undefined) {
            if (chiefTurns >= chiefDecision.limits.maxTurns) throw new Error("Chief decision turn budget exhausted");
            chiefTurns++;
          }
          let plan:DeliveryPlan|undefined;
          if(promptOptions?.inputProvenance||promptOptions?.inputPresentation){
            deliveryPreflight=true;
            try{plan=await persistence.prepare(promptOptions,text);}catch(error){
              if(error instanceof RuntimeDeliveryError)throw error;
              const id=promptOptions.inputProvenance??promptOptions.inputPresentation;
              if(id&&validAttemptId(id.deliveryId)&&validAttemptId(id.attemptId))throw new RuntimeDeliveryError('投递来源或显示内容无效，未调用Provider',{version:1,deliveryId:id.deliveryId,attemptId:id.attemptId,inputSaved:false,providerMayHaveStarted:false,history:storage?'failed':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:error instanceof Error&&['PROVENANCE_TOO_LARGE','TEXT_PROJECTION_FAILED','UNSUPPORTED_VERSION'].includes(error.message)?error.message as RuntimePersistenceErrorCode:'INVALID'});
              throw Object.assign(new Error('投递来源无效，未调用Provider'),{code:'INVALID'});
            }finally{deliveryPreflight=false;}
            if(disposed){persistence.dispose();throw new Error("会话已关闭");}
          }
          if (stopSealed) throw new Error("会话已封闭停止，不再接受新轮次");
          let terminal!: () => void;
          const terminalPromise = new Promise<void>((resolve) => { terminal = resolve; });
          const turn: Turn = { id: randomUUID(), controller: new AbortController(), outcome: "completed", terminal, terminalPromise };
          turn.plan=plan;
          persistence.attachTurn(plan,turn.id);
          active = turn;
          latestTurn = turn;
          provider.setTurn(turn.id, turn.controller);
          let underlyingFinished = false;
          let failure: unknown;
          let lastResortExpired = false;
          // P1：请求失败终态事实（仅在 outcome=failed 时填；最后兜底 timed_out 不填，T1 形状不变）。
          let requestFailureTimeout: ReturnType<typeof requestTimeoutFailureFacts>;
          // P2：网络离线超窗失败事实（errorCode `network-offline-timeout`；终态 failed，不自动重放）。
          let networkFailure: ReturnType<typeof networkOfflineFailureFacts>;
          let failureCode: string | undefined;
          let failureAttempts: number | undefined;
          let failureReplaySafe: boolean | undefined;
          let underlying: Promise<void> | undefined;
          try {
            persistenceError=undefined;
            promptOptions?.onTurnStarted?.({ turnId: turn.id, roleId: role.id, runtime: options.runtime });
            persistence.progress(plan,"turn-created",promptOptions);
            persistenceError=undefined;
            if(storage){const entry=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:"user",text:plan?.text??text,turnId:turn.id,...(plan?{inputTextProjection:plan.projection}:{}),...(plan?.provenance?{inputProvenance:plan.provenance}:{})});
              try{await storage.appendReplay([entry]);if(plan?.capture)plan.capture.receipt.inputSaved=true;}catch(error){if(plan)persistenceError=error;throw error;}
            }
            persistence.progress(plan,"input-saved",promptOptions);
            // A previously reported transient error is cleared after a real successful retry.
            persistenceError = undefined;
            if (turn.controller.signal.aborted) throw new Error("会话已中止");
            const imageCount = promptOptions?.images?.length ?? 0;
            const input: PromptInputEventDetail = { source: "prompt-input", text:plan?.text??text, ...(imageCount > 0 ? { imageCount } : {}), ...(plan?{inputTextProjection:plan.projection}:{}), ...(plan?.provenance?{inputProvenance:plan.provenance}:{}), ...(plan?.presentation?{inputPresentation:plan.presentation}:{}) };
            emit({ kind: "message", summary: plan?.summary ?? (imageCount > 0 ? `用户指令：${text}（附 ${imageCount} 张图片）` : `用户指令：${text}`), runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: { ...input, turnId: turn.id } });
            if(plan?.capture){
              await pendingPersist;
              if(persistenceError)throw persistenceError;
              if(storage){const boundary=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:'event',turnId:turn.id,event:{kind:'message',summary:'投递开始边界',runtime:options.runtime,roleId:role.id,turnId:turn.id,detail:{source:'delivery-boundary',version:1,deliveryId:plan.capture.receipt.deliveryId,attemptId:plan.capture.receipt.attemptId,turnId:turn.id,stage:'provider-may-start'}}});try{await storage.appendReplay([boundary]);}catch(error){persistenceError=error;throw error;}}
              if(turn.controller.signal.aborted)throw new Error('会话已中止');
              plan.capture.receipt.providerMayHaveStarted=true;
              persistence.progress(plan,'provider-may-start',promptOptions);
            }
            const nativeOptions=plan?(promptOptions?.images ? {images:promptOptions.images} : undefined):promptOptions;
            turn.providerStarted = true;
            underlying = Promise.resolve().then(() => inner.prompt(text, nativeOptions));
            // 隔离的唯一语义＝「底层 provider 轮次可能仍在运行」。只要底层已 settle（成功或失败），
            // 隔离即解除——与清理是否失败无关；清理失败仅保留为诊断/事件事实。底层永不 settle 时，
            // 隔离保持（fail-closed 不放宽）。
            const settleUnderlying = () => { underlyingFinished = true; turn.providerFinished = true; quarantined = false; refreshDisposalEvidence(); };
            underlying.then(settleUnderlying, settleUnderlying);
            const work = underlying.then(async () => { if (!streamEnded) await terminalPromise; });
            // 整轮上限＝最后兜底（客户裁定 2026-10-17）：promptTimeoutMs 仅属看护到点检查，**不再**用于 abort。
            // InteractionGate 暂停语义不变——确认卡等待期间按有效运行时间暂停计时。
            await withPausableTimeout(raceAbort(work, turn.controller.signal, "本轮运行"), provider.options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS, "本轮最后兜底", provider.options.interactionGate);
          } catch (error) {
            failure = error;
            // 只有本层「最后兜底」到点才用兜底文案；适配器自身的 timed_out 保持原摘要（不冒充兜底）。
            lastResortExpired = isTimeoutError(error) && (error as { label?: string }).label === "本轮最后兜底";
            if(plan?.capture && error instanceof Error && ["INVALID","PROVENANCE_TOO_LARGE","TEXT_PROJECTION_FAILED"].includes(error.message))plan.capture.receipt.code=error.message as RuntimePersistenceErrorCode;
            turn.outcome = isTimeoutError(error) ? "timed_out" : turn.controller.signal.aborted || isAbortError(error) ? "aborted" : "failed";
            turn.outcomeLocked = true;
            if (turn.outcome === "failed") {
              // P1：请求超时/请求失败的结构化事实（errorCode/attempts/replaySafe/timeoutKind）随终态 detail
              // 如实外推；客户可见 summary 只用人话，不含技术 code（code 留在 detail/诊断）。
              // P2：网络离线超窗错误同口径（errorCode `network-offline-timeout`）。
              requestFailureTimeout = requestTimeoutFailureFacts(error);
              networkFailure = isNetworkOfflineFailure(error) ? networkOfflineFailureFacts(error) : undefined;
              const record = error instanceof Error ? error as Error & { code?: unknown; attempts?: unknown; replaySafe?: unknown } : undefined;
              failureCode = typeof record?.code === "string" && (isRequestFailureCode(record.code) || isNetworkOfflineFailure(error)) ? record.code : undefined;
              failureAttempts = requestFailureTimeout?.attempts ?? networkFailure?.attempts ?? (typeof record?.attempts === "number" && Number.isFinite(record.attempts) ? record.attempts : undefined);
              failureReplaySafe = requestFailureTimeout?.replaySafe ?? networkFailure?.replaySafe ?? (typeof record?.replaySafe === "boolean" ? record.replaySafe : undefined);
            }
            turn.controller.abort();
            if (inner.abort && underlying !== undefined && !underlyingFinished && !(stopSealed && nativeLifecycle)) {
              try { await requestAbort(turn); }
              catch (abortError) { emit({ kind: "denied", summary: `中止清理失败：${abortError instanceof Error ? abortError.message : String(abortError)}`, runtime: options.runtime, roleId: role.id, turnId: turn.id }); }
            }
            quarantined = underlying !== undefined && !underlyingFinished;
          } finally {
            if(plan)deliveryPreflight=true;
            active = undefined;
            endedTurns.add(turn.id);
            provider.setTurn();
            // P3：重试耗尽 ≠ 网络失败；人话短报明说自动重试未成功（技术 code 只在 detail/诊断）。
            const retryExhausted = failureCode === MODEL_REQUEST_RETRY_EXHAUSTED;
            const event: SessionEvent = { kind: "settled", summary: turn.outcome === "completed" ? "会话结束" : turn.outcome === "aborted" ? "本轮已中止" : turn.outcome === "timed_out" ? (lastResortExpired ? "本轮超过最后兜底，已中止" : "本轮运行超时") : (networkFailure !== undefined ? networkOfflineSummary() : retryExhausted ? "本轮自动重试仍未成功，已结束。" : requestFailureTimeout !== undefined ? requestTimeoutSummary(requestFailureTimeout.timeoutKind) : "本轮运行失败"), runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: { turnId: turn.id, outcome: turn.outcome, ...(turn.outcome === "failed" && failureCode !== undefined ? { errorCode: failureCode, ...(failureAttempts !== undefined ? { attempts: failureAttempts } : {}), ...(failureReplaySafe !== undefined ? { replaySafe: failureReplaySafe } : {}), ...(requestFailureTimeout !== undefined ? { timeoutKind: requestFailureTimeout.timeoutKind } : {}) } : {}), ...(turn.outcome === "completed" && (turn.attempts ?? 1) > 1 ? { attempts: turn.attempts, ...(turn.replaySafe !== undefined ? { replaySafe: turn.replaySafe } : {}) } : {}) } };
            emit(event,plan,!plan);
            await pendingPersist;
            const record: RuntimeSessionRecord = { version: 1, id: recordId, roleId: role.id, runtime: options.runtime, contextSource: wrapper.contextSource ?? "fresh", nativeSessionId: wrapper.nativeSessionId, contextWarning: plan&&wrapper.contextWarning?provider.display.protectText(wrapper.contextWarning,4096).text:wrapper.contextWarning, createdAt, updatedAt: new Date().toISOString() };
            if(storage&&!persistenceError)try{await storage.saveSession(record);}catch(error){persistenceError=error;}
            await persistence.complete(plan,turn.outcome,record,persistenceError);
            persistence.progress(plan,"settled",promptOptions);
            if(plan){deliveryPreflight=false;queue.push(event);}
            turn.promptFinalized = true;
            refreshDisposalEvidence();
          }
          if(plan?.capture && (persistenceError||failure||plan.capture.receipt.history==='failed'))throw new RuntimeDeliveryError("本次投递未完成或历史未保存",plan.capture.receipt);
          if (persistenceError) throw persistenceError;
          if (failure) throw failure;
        },
        events: () => queue.stream,
        // 会话级后台任务访问面（2026-10-25，桌面展示用）：只转调 providerFor 创建的同一个管理器，
        // 不新建第二套状态；无管理器与会话关闭后的行为在方法内明确，且绝不重新创建管理器。
        // 管理器自身在 dispose 时已置 closed 并清空任务，这里的 disposed 前置检查让 dispose 开始后的
        // 调用也立即得到确定结果，不把清理中的任务当成仍可管理。
        listBackgroundTasks(): BackgroundTaskSnapshot[] {
          if (disposed) return [];
          return provider.backgroundTasks?.list() ?? [];
        },
        readBackgroundTask(taskId: string, readOptions?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined {
          if (disposed) return undefined;
          return provider.backgroundTasks?.read(taskId, readOptions);
        },
        async stopBackgroundTask(taskId: string, stopOptions?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult> {
          const manager = provider.backgroundTasks;
          if (disposed) return { ok: false, reason: "closed", message: "会话已关闭，未停止任何任务；后台任务已随会话清理，不要当它仍在运行或已由本次调用停止" };
          if (manager === undefined) return { ok: false, reason: "closed", message: "当前会话未启用后台任务能力（未注入 ShellGate 或属于判断会话），未停止任何任务" };
          return manager.stop(taskId, stopOptions);
        },
        ...(inner.abort ? { async abort() {
          if (!active) return;
          const turn = active;
          recordGitHostInterruption({ projectRoot: options.projectRoot, reason: "core-abort-requested", coreSessionId: sessionId });
          turn.controller.abort();
          await requestAbort(turn);
        } } : {}),
        async dispose() {
          if (disposed) return;
          // Capture discovery failures before the background manager can discard its live list.
          const beforeDisposal = collectLifecycle();
          const lostCoverage = beforeDisposal.reasons.filter(reason => ["tool-lifecycle-read-failed", "background-lifecycle-read-failed", "background-start-not-yet-observed"].includes(reason));
          if (provider.factoryProvenance === "custom-override") lostCoverage.push("custom-provider-disposal-coverage-unverified");
          disposalConstraints = lostCoverage;
          disposalCleanupPending = true;
          disposed = true;
          recordGitHostInterruption({ projectRoot: options.projectRoot, reason: "core-dispose-requested", coreSessionId: sessionId });
          updateCoreRegistry(provider.registry, "disposing");
          persistence.dispose();
          active?.controller.abort();
          try {
            try { await withTimeout(inner.dispose(), 1000, "关闭会话"); }
            finally { queue.close(); }
          } finally {
            // 会话关闭是后台任务的唯一清理点之一（另一个是显式 stop）：并行终止全部运行中任务，管理器失效。
            await provider.backgroundTasks?.dispose();
          }
          await pendingPersist;
          void pump;
          disposalCleanupPending = false;
          refreshDisposalEvidence();
          updateCoreRegistry(provider.registry, "disposed", ["dispose-is-not-a-quiescence-receipt"]);
        },
      };
      provider.registry.session = wrapper;
      provider.registry.fact = { ...provider.registry.fact, sessionId, ...(creationPlan ? { planId: creationPlan.planId } : {}) };
      updateCoreRegistry(provider.registry, "active", creationPlan ? [] : ["legacy-bind-without-precreation-plan"]);
      return wrapper;
  };
  const core: RuntimeAdapter = {
    async composeContext(role) {
      const scope = await readCoreProtectionScope(options.projectRoot);
      if (scope.state === "unknown") throw new Error("runtime-protection-scope-unknown");
      let prepared: RuntimeRolePreparation | undefined;
      if (scope.state === "required") {
        prepared = await core.prepareRole!(role);
        if (!prepared.token) { const error = new Error("runtime-protected-scope-requires-verified-plan"); discardRuntimeRolePreparation(prepared, error); throw error; }
      }
      return withCoreOpenLease(options.projectRoot, async assertHeld => {
        const provider = await providerFor(role);
        provider.setAdmissionGuard(assertHeld);
        if (prepared?.token) {
          // P1.3 §2.2.4：token 成立后设置 admittedPlan（与 planId/isCurrent 一致）并复核审批链；
          // prepare→compose 之间绑定变化 ⇒ protected-scope-approval-chain-changed。
          await provider.verifyApprovalChainBinding(prepared.plan);
          provider.setAdmittedPlan(prepared.plan);
        }
        const context = provider.adapter.composeContext(role);
        return chiefDecision === undefined ? context : withTimeout(Promise.resolve(context), chiefDecision.limits.timeoutMs, "准备chief决策上下文");
      });
    },
    async bindRole(role) {
      const scope = await readCoreProtectionScope(options.projectRoot);
      if (scope.state === "unknown") throw new Error("runtime-protection-scope-unknown");
      if (scope.state === "required") {
        const prepared = await core.prepareRole!(role);
        if (!prepared.token) { const error = new Error("runtime-protected-scope-requires-verified-plan"); discardRuntimeRolePreparation(prepared, error); throw error; }
        return core.bindPreparedRole!(prepared.token);
      }
      return withCoreOpenLease(options.projectRoot, assertHeld => bindRole(role, undefined, assertHeld));
    },
    async prepareRole(role): Promise<RuntimeRolePreparation> {
      const provider = await providerFor(role), reasons: string[] = [];
      const scopeProtection = await readCoreProtectionScope(options.projectRoot);
      if (scopeProtection.state === "unknown") reasons.push("runtime-protection-scope-unknown");
      let approvalChain: RuntimeApprovalChainPlanFacts | undefined;
      if (scopeProtection.state === "required") {
        // 保留：custom/demo（provenance≠default-production）继续拒绝。
        if (provider.factoryProvenance !== "default-production") reasons.push("protected-scope-default-native-plan-required");
        if (provider.roleCapabilityGuards()?.status === "unknown") reasons.push("required-scope-role-capability-effects-unproven");
        // P1.3 §2.2.3：受保护 + 注册了 shell 工具 ⇒ 审批链与审计必须在装配期已真实存在（fail-closed）。
        // 未登记（含传裸函数）/项目根不符 ⇒ approval-chain-unproven；sink 非持久 file 或探针非 ok ⇒ audit-unavailable。
        if (hasShellAdmissionTools(provider.initialAppTools)) {
          const evidence = await readApprovalChainEvidence(options.shellGate, options.projectRoot);
          if (evidence.kind === "unproven") reasons.push("protected-scope-approval-chain-unproven");
          else if (evidence.kind === "audit-unavailable") reasons.push("protected-scope-audit-unavailable");
          else approvalChain = evidence.chain;
        }
      }
      let native: RuntimeNativeFactoryPlanFacts | undefined;
      if (provider.factoryProvenance === "custom-override") reasons.push("custom-provider-factory-unverified");
      else if (options.runtime === "codex") {
        // P1.3 §2.2.3/§2.6：仅 Codex 保留原生工厂计划严格校验（原条件逐字保留）；claude/pi 不再
        // 产生 `native-factory-plan-*`（该证明对非 codex 结构性不可得，已取消为通用前提）。
        try {
          const prepared = await provider.prepareNative(), fact = prepared?.facts;
          if (fact && fact.source === "native-factory-plan" && typeof fact.planId === "string" && fact.planId.length > 0
            && typeof fact.configDigest === "string" && fact.configDigest.length === 64 && /^[a-f0-9]{64}$/.test(fact.configDigest)
            && fact.roleId === role.id && fact.runtime === options.runtime
            && [fact.appTools, fact.foreignMcpServers, fact.nativeBuiltinTools, fact.plannedProcesses, fact.reasons]
              .every(names => Array.isArray(names) && names.every(name => typeof name === "string" && name.length > 0))) {
            // Explicit allowlist projection. Never serialize arbitrary provider fields/options/environment.
            native = { source: "native-factory-plan", planId: fact.planId, configDigest: fact.configDigest, roleId: fact.roleId,
              runtime: fact.runtime, status: fact.status, factory: fact.factory, transport: fact.transport, wire: fact.wire,
              appTools: [...fact.appTools], foreignMcpServers: [...fact.foreignMcpServers], nativeBuiltinTools: [...fact.nativeBuiltinTools],
              plannedProcesses: [...fact.plannedProcesses], reasons: [...fact.reasons] };
            if (fact.status !== "observed" || fact.factory !== "codex-chat" || fact.transport !== "http" || fact.wire !== "chat"
              || fact.foreignMcpServers.length || fact.nativeBuiltinTools.length || fact.plannedProcesses.length || fact.reasons.length
              || !prepared?.adapter || !provider.isCurrent()
              || fact.appTools.length !== provider.initialAppTools.length || fact.appTools.some(name => !provider.initialAppTools.includes(name)))
              reasons.push("native-factory-plan-unverified");
          } else reasons.push("native-factory-plan-unavailable");
        } catch { reasons.push("native-factory-plan-preparation-failed"); }
      }
      if (!provider.isCurrent()) reasons.push("runtime-prepared-configuration-changed");
      const plan: RuntimeCreationPlanFacts = { source: "core-factory-plan", planId: randomUUID(), configDigest: "", roleId: role.id,
        runtime: options.runtime, projectRoot: resolve(options.projectRoot), factoryProvenance: provider.factoryProvenance,
        status: reasons.length ? "unknown" : "observed", scopeProtection, ...(native ? { native } : {}),
        ...(approvalChain ? { approvalChain } : {}), reasons };
      const roleCapabilityGuards = provider.roleCapabilityGuards({ corePlanId: plan.planId,
        ...(native ? { nativePlanId: native.planId, nativeConfigDigest: native.configDigest } : {}) });
      if (roleCapabilityGuards) plan.roleCapabilityGuards = roleCapabilityGuards;
      // 2026-11-08（§2.3.3）：审批链证据计入摘要——token 因此绑定 approvalChain（变化即换摘要）。
      plan.configDigest = createHash("sha256").update(JSON.stringify({ runtime: plan.runtime, roleId: plan.roleId,
        factoryProvenance: plan.factoryProvenance, appTools: provider.initialAppTools, native, roleCapabilityGuards, approvalChain })).digest("hex");
      provider.registry.fact = { ...provider.registry.fact, planId: plan.planId };
      updateCoreRegistry(provider.registry, "prepared", reasons);
      if (reasons.length) { const result = { plan: structuredClone(plan) }; rolePreparations.set(result, { entry: provider.registry, planId: plan.planId }); return result; }
      const token = Object.freeze({}) as RuntimePreparedRoleToken;
      preparedTokens.set(token, { role, plan, used: false, provider });
      const result = { plan: structuredClone(plan), token }; rolePreparations.set(result, { entry: provider.registry, planId: plan.planId }); return result;
    },
    async bindPreparedRole(token) {
      const prepared = token && typeof token === "object" ? preparedTokens.get(token) : undefined;
      if (!prepared || prepared.used) throw new Error("runtime-prepared-token-invalid-or-consumed");
      prepared.used = true;
      const provider = prepared.provider;
      try {
      if (!provider.isCurrent() || provider.registry.fact.planId !== prepared.plan.planId) throw new Error("runtime-prepared-configuration-changed");
      return await withCoreOpenLease(options.projectRoot, async assertHeld => {
        if (!provider.isCurrent() || provider.registry.fact.planId !== prepared.plan.planId) throw new Error("runtime-prepared-configuration-changed");
        const scope = await readCoreProtectionScope(options.projectRoot);
        if (scope.state === "unknown" || scope.state !== prepared.plan.scopeProtection?.state || scope.revision !== prepared.plan.scopeProtection.revision)
          throw new Error("runtime-protection-scope-changed");
        if (scope.state === "required" && provider.roleCapabilityGuards()?.status === "unknown") throw new Error("required-scope-role-capability-effects-unproven");
        // P1.3 §2.2.4：删除原 unconfined 检查；重读 live binding（inspect/probe），要求存在、项目根一致、
        // `file+durable+probe ok`、稳定投影与 plan.approvalChain 一致；否则 protected-scope-approval-chain-changed。
        await provider.verifyApprovalChainBinding(prepared.plan);
        provider.setAdmittedPlan(prepared.plan);
        return bindRole(prepared.role, prepared.plan, assertHeld);
      });
      } catch (error) { if (provider.registry.fact.planId === prepared.plan.planId) { provider.revoke(); bindConstructionFailure(error, provider.registry); } throw error; }
    },
  };
  return core;
}

// C2 state remains bound to the actual Core session; no caller-selected persistence or paths.
interface DeliveryCapture {
  receipt: RuntimeDeliveryReceiptV1;
  entries: RuntimeReplayEntry[];
  checkpoint?:RuntimeReplayCheckpoint;
  record?:RuntimeSessionRecord;
  complete:boolean;
  retained:boolean;
  sequence:number;
  inFlight?:Promise<DeliverySaveResultV1>;
}
interface DeliveryPlan {
  capture?:DeliveryCapture;
  text:string;
  summary:string;
  projection:RuntimeInputTextProjectionV1;
  provenance?:RuntimeInputProvenanceV1;
  presentation?:RuntimeLiveHandbackPresentationV1;
}
function createPersistenceState(input:{
  scope:{roleId:string;runtime:RuntimeKind};projectRoot:string;storage?:RuntimeSessionStorage;
  display:ReturnType<typeof createToolDisplayContext>;diagnostics?:GovernedToolsOptions['diagnostics'];ended:Set<string>;disposed:()=>boolean;active:()=>boolean;
  onDrain?:()=>void;
}) {
  const {storage,scope,display}=input;
  const reports=new Map<string,{snapshot:RuntimeReportSnapshotV1;draftFingerprint:string;state:ReportSaveStateV1;inFlight?:Promise<ReportSaveResultV1>}>();
  const deliveries=new Map<string,DeliveryCapture>();
  const seen=new Map<string,Pick<RuntimeDeliveryReceiptV1,'deliveryId'|'turnId'|'inputSaved'|'providerMayHaveStarted'|'outcome'>>();
  const listeners=new Set<(event:RuntimePersistenceChangeV1)=>void>();
  const retained=new Map<string,{bytes:number;busy:()=>boolean;expire:()=>void}>();
  let used=0;
  const observerFailed=()=>{try{input.diagnostics?.record('persistence.observer.failed',{roleId:scope.roleId,runtime:scope.runtime,errorCode:'OBSERVER_FAILED'});}catch{/* diagnostics cannot change execution */}};
  const notify=(event:RuntimePersistenceChangeV1)=>{if(!input.disposed())for(const listener of listeners)try{listener(structuredClone(event));}catch{observerFailed();}};
  const drop=(key:string)=>{const item=retained.get(key);if(item){used-=item.bytes;retained.delete(key);}};
  const keep=(key:string,value:unknown,busy:()=>boolean,expire:()=>void):boolean=>{
    drop(key);const bytes=jsonBytes(value);const identifiers=jsonBytes([...seen]);
    for(const [old,item] of retained){if(used+bytes+identifiers<=REPORT_LIMITS.retention)break;if(item.busy())continue;drop(old);item.expire();}
    if(bytes>REPORT_LIMITS.retention||used+bytes+identifiers>REPORT_LIMITS.retention){expire();return false;}
    retained.set(key,{bytes,busy,expire});used+=bytes;return true;
  };
  const reportChange=(id:string,state:ReportSaveStateV1)=>notify({kind:'report-save',scope,reportId:id,state});
  const expiredReport=(reportId?:string):ReportSaveResultV1=>({ok:false,state:'expired',code:'SNAPSHOT_EXPIRED',...(reportId?{reportId}:{}),retryAvailable:false,message:'待保存报告快照已失效'});
  const saveReport=(reportId:string):Promise<ReportSaveResultV1>=>{
    const holder=reports.get(reportId);
    if(!/^[a-f0-9]{64}$/.test(reportId))return Promise.resolve({ok:false,state:'failed',code:'INVALID',retryAvailable:false,message:'报告ID无效'});
    if(input.disposed())return Promise.resolve(expiredReport(reportId));
    if(!storage)return Promise.resolve({ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',reportId,retryAvailable:false,message:'仅本次会话，报告未持久保存'});
    if(!holder)return Promise.resolve(expiredReport(reportId));
    if(holder.inFlight)return holder.inFlight;
    if(holder.state.state==='saved')return Promise.resolve({ok:true,state:'already-saved',report:structuredClone(holder.snapshot),retryAvailable:false});
    const work=(async():Promise<ReportSaveResultV1>=>{
      let result:ReportSaveResultV1;
      try{
        if(!storage?.saveReport)return {ok:false,state:'unsupported',code:'UNSUPPORTED',reportId,retryAvailable:false,message:'会话不支持报告保存'};
        const state=await storage.saveReport(holder.snapshot);
        holder.state={state:'saved',reportId,report:holder.snapshot,retryAvailable:false};
        result={ok:true,state,report:structuredClone(holder.snapshot),retryAvailable:false};
      }catch(error){
        const code=error instanceof Error&&error.message==='CONFLICT'?'CONFLICT':'PERSIST_FAILED';
        holder.state={state:'failed',code,reportId,report:holder.snapshot,retryAvailable:code==='PERSIST_FAILED'};
        result={ok:false,state:'failed',code,reportId,report:structuredClone(holder.snapshot),retryAvailable:code==='PERSIST_FAILED',message:code==='CONFLICT'?'已保存报告与本次最终快照冲突':'报告历史保存失败'};
      }
      reportChange(reportId,holder.state);return result;
    })();
    holder.inFlight=work;
    void work.finally(()=>{holder.inFlight=undefined;input.onDrain?.();});return work;
  };
  const rememberIdentity=(capture:DeliveryCapture)=>seen.set(capture.receipt.attemptId,{deliveryId:capture.receipt.deliveryId,turnId:capture.receipt.turnId,inputSaved:capture.receipt.inputSaved,providerMayHaveStarted:capture.receipt.providerMayHaveStarted,...(capture.receipt.outcome?{outcome:capture.receipt.outcome}:{})});
  const trimReceipts=()=>{const finished=[...deliveries.values()].filter(x=>x.complete);while(finished.length>REPORT_LIMITS.receipts){const old=finished.shift()!;rememberIdentity(old);drop('delivery:'+old.receipt.attemptId);deliveries.delete(old.receipt.attemptId);}};
  const cloneReceipt=(capture:DeliveryCapture)=>structuredClone(capture.receipt);
  const deliveryChange=(capture:DeliveryCapture,state:'saved'|'failed'|'expired'|'disabled')=>notify({kind:'delivery-history-save',scope,attemptId:capture.receipt.attemptId,state,receipt:cloneReceipt(capture),retryAvailable:capture.receipt.retryHistoryAvailable,...(capture.receipt.code?{code:capture.receipt.code}:{})});
  const remember=(capture:DeliveryCapture)=>keep('delivery:'+capture.receipt.attemptId,{entries:capture.entries,checkpoint:capture.checkpoint,record:capture.record,receipt:capture.receipt},()=>!!capture.inFlight||!capture.complete,()=>{
    capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.record=undefined;capture.receipt.retryHistoryAvailable=false;deliveryChange(capture,'expired');
  });
  const query=async(attemptId:string):Promise<DeliveryReceiptQueryV1>=>{
    if(input.disposed())return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    const known=deliveries.get(attemptId);if(known)return {state:'known',receipt:cloneReceipt(known)};
    if(!storage)return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    try{
      const entries=await storage.readReplay();
      const final=entries.filter(entry=>{const d=entry.event?.detail as Record<string,unknown>|undefined;return d?.source==='delivery-receipt'&&(d.receipt as RuntimeDeliveryReceiptV1|undefined)?.attemptId===attemptId;}).at(-1);
      if(final){const d=final.event!.detail as {version:number;receipt:RuntimeDeliveryReceiptV1};if(d.version!==1||!validReceipt(d.receipt)||d.receipt.turnId!==final.turnId||final.event?.runtime!==scope.runtime||final.event?.roleId!==scope.roleId)return {state:'unsupported',code:'UNSUPPORTED_VERSION',retryAvailable:false};return {state:'known',receipt:{...structuredClone(d.receipt),retryHistoryAvailable:false}};}
      const original=entries.find(entry=>entry.inputProvenance?.attemptId===attemptId);
      const boundary=entries.find(entry=>(entry.event?.detail as {source?:string;attemptId?:string}|undefined)?.source==='delivery-boundary'&&(entry.event?.detail as {attemptId?:string})?.attemptId===attemptId);
      if(original||boundary){const p=original?.inputProvenance??(boundary!.event!.detail as {deliveryId:string;version?:number});if(p.version!==1||!validAttemptId(p.deliveryId))return {state:'unsupported',code:'UNSUPPORTED_VERSION',retryAvailable:false};return {state:'known',receipt:{version:1,deliveryId:p.deliveryId,attemptId,turnId:original?.turnId??boundary?.turnId,inputSaved:!!original||!!boundary&&entries.some(entry=>entry.kind==='user'&&entry.turnId===boundary.turnId&&entry.inputTextProjection?.version===1),providerMayHaveStarted:true,history:'pending',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'RECEIPT_UNAVAILABLE'}};}
      return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    }catch{return {state:'unsupported',code:'REPLAY_DAMAGED',retryAvailable:false};}
  };
  const capability:RuntimeSessionPersistence=Object.freeze({
    mode:storage?'enabled':'disabled',scope:Object.freeze({...scope}),
    async recordFinalReport(draft:RuntimeReportDraftV1):Promise<ReportSaveResultV1>{
      if(input.disposed())return expiredReport('');
      if(!storage)return {ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',retryAvailable:false,message:'仅本次会话，报告未持久保存'};
      let snapshot:RuntimeReportSnapshotV1;
      try{if(draft?.source?.roleId!==scope.roleId||draft.source.runtime!==scope.runtime||!input.ended.has(draft.source.turnId))throw Error('INVALID');snapshot=makeReportSnapshot(draft,display.protectText);}
      catch{return {ok:false,state:'failed',code:'INVALID',retryAvailable:false,message:'报告来源或最终快照无效'};}
      const fingerprint=createHash('sha256').update(canonicalJson({source:{roleId:draft.source.roleId,runtime:draft.source.runtime,turnId:draft.source.turnId},taskId:draft.taskId,origin:draft.origin,status:draft.status,summary:draft.summary,evidence:draft.evidence,at:draft.at})).digest('hex');
      const existing=reports.get(snapshot.reportId);
      if(existing){if(existing.draftFingerprint!==fingerprint)return {ok:false,state:'failed',code:'CONFLICT',reportId:snapshot.reportId,retryAvailable:false,message:'同一源轮次最终报告冲突'};return saveReport(snapshot.reportId);}
      const holder={snapshot,draftFingerprint:fingerprint,state:{state:'failed' as const,reportId:snapshot.reportId,retryAvailable:true},inFlight:undefined as Promise<ReportSaveResultV1>|undefined};
      reports.set(snapshot.reportId,holder);
      const kept=keep('report:'+snapshot.reportId,snapshot,()=>!!holder.inFlight,()=>{reports.delete(snapshot.reportId);reportChange(snapshot.reportId,{state:'expired',code:'SNAPSHOT_EXPIRED',reportId:snapshot.reportId,retryAvailable:false});});
      if(!kept)return expiredReport(snapshot.reportId);return saveReport(snapshot.reportId);
    },
    retryReportPersistence(reportId:string){return saveReport(reportId);},
    async getReportPersistence(reportId:string):Promise<ReportSaveStateV1>{
      if(!/^[a-f0-9]{64}$/.test(reportId))return {state:'failed',code:'INVALID',retryAvailable:false};
      if(input.disposed())return {state:'expired',code:'SNAPSHOT_EXPIRED',reportId,retryAvailable:false};
      if(!storage)return {state:'disabled',code:'PERSISTENCE_DISABLED',reportId,retryAvailable:false};
      const holder=reports.get(reportId);if(holder)return structuredClone(holder.state);
      try{const saved=(await storage.readReports?.())?.reports.find(x=>x.reportId===reportId);if(saved)return {state:'saved',reportId,report:saved,retryAvailable:false};}catch{return {state:'failed',code:'PERSIST_FAILED',reportId,retryAvailable:false};}
      return {state:'expired',code:'SNAPSHOT_EXPIRED',reportId,retryAvailable:false};
    },
    getDeliveryReceipt:query,
    retryDeliveryHistoryPersistence(attemptId:string):Promise<DeliverySaveResultV1>{
      const capture=deliveries.get(attemptId);
      if(input.disposed()||!capture||!capture.retained)return Promise.resolve({ok:false,state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false,message:'待补保存历史材料已失效'});
      if(!storage)return Promise.resolve({ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',receipt:cloneReceipt(capture),retryAvailable:false,message:'仅本次会话，历史未持久保存'});
      if(capture.inFlight)return capture.inFlight;
      if(capture.receipt.history==='saved')return Promise.resolve({ok:true,state:'already-saved',receipt:cloneReceipt(capture)});
      if(!capture.complete||input.active()||!capture.checkpoint||!capture.receipt.retryHistoryAvailable)return Promise.resolve({ok:false,state:'failed',code:capture.receipt.code??'UNSUPPORTED',receipt:cloneReceipt(capture),retryAvailable:false,message:'这次历史不能安全自动补存'});
      const work=(async():Promise<DeliverySaveResultV1>=>{
        try{
          const finalReceipt={...capture.receipt,inputSaved:capture.entries.some(x=>x.kind==='user'),history:'saved' as const,retryHistoryAvailable:false};delete finalReceipt.code;
          const finalEntry:RuntimeReplayEntry={at:new Date().toISOString(),kind:'event',turnId:finalReceipt.turnId,entryId:`${finalReceipt.turnId}:receipt`,event:{kind:'message',summary:'投递历史保存状态',runtime:scope.runtime,roleId:scope.roleId,turnId:finalReceipt.turnId,detail:{source:'delivery-receipt',version:1,receipt:finalReceipt}}};
          const previousFinal=capture.entries.find(entry=>entry.entryId===finalEntry.entryId);
          const intendedFinal=previousFinal??finalEntry;
          if(!previousFinal)capture.entries.push(intendedFinal);
          const intended=capture.entries;
          if(!storage.repairReplayTail)throw Error('UNSUPPORTED');
          await storage.repairReplayTail(capture.checkpoint!,intended,capture.record);
          capture.entries=intended;capture.receipt=structuredClone((intendedFinal.event!.detail as {receipt:RuntimeDeliveryReceiptV1}).receipt);rememberIdentity(capture);remember(capture);deliveryChange(capture,'saved');return {ok:true,state:'saved',receipt:cloneReceipt(capture)};
        }catch(error){
          const code=error instanceof Error&&['REPLAY_DAMAGED','REPLAY_CHANGED','UNSUPPORTED'].includes(error.message)?error.message as RuntimePersistenceErrorCode:'PERSIST_FAILED';
          capture.receipt.code=code;capture.receipt.history='failed';capture.receipt.retryHistoryAvailable=code==='PERSIST_FAILED'&&capture.retained;
          if(code!=='PERSIST_FAILED')capture.receipt.retryDeliveryAllowed=false;
          deliveryChange(capture,'failed');return {ok:false,state:'failed',code,receipt:cloneReceipt(capture),retryAvailable:capture.receipt.retryHistoryAvailable,message:'历史补存未完成；未重新调用模型'};
        }
      })();capture.inFlight=work;void work.finally(()=>{capture.inFlight=undefined;input.onDrain?.();});return work;
    },
    onPersistenceChange(listener:(event:RuntimePersistenceChangeV1)=>void){if(!input.disposed())listeners.add(listener);return()=>{listeners.delete(listener);};},
  });
  return {
    capability,
    async prepare(promptOptions:PromptOptions|undefined,text:string):Promise<DeliveryPlan|undefined>{
      if(!promptOptions?.inputProvenance&&!promptOptions?.inputPresentation)return undefined;
      const supplied=promptOptions.inputProvenance??promptOptions.inputPresentation;
      if(supplied&&validAttemptId(supplied.attemptId)&&seen.has(supplied.attemptId)){
        const old=await query(supplied.attemptId);
        const duplicateCode=validAttemptId(supplied.deliveryId)&&supplied.target?.roleId===scope.roleId&&supplied.target?.runtime===scope.runtime?'ATTEMPT_ALREADY_STARTED' as const:'INVALID' as const;
        throw new RuntimeDeliveryError('同一投递尝试不可再次调用Provider',old.state==='known'?{...old.receipt,code:duplicateCode,retryDeliveryAllowed:false}:{version:1,...seen.get(supplied.attemptId)!,attemptId:supplied.attemptId,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:duplicateCode});
      }
      let provenance:RuntimeInputProvenanceV1|undefined;let presentation:RuntimeLiveHandbackPresentationV1|undefined;
      if(promptOptions.inputProvenance){
        provenance=validateProvenance(promptOptions.inputProvenance,scope);
        for(const snapshot of provenance.reports){const sourceStore=createRuntimeSessionStore({projectRoot:input.projectRoot,...snapshot.source});const sourceReports=await sourceStore.readReports!();const saved=sourceReports.reports.find(x=>x.reportId===snapshot.reportId);if(!saved||canonicalJson(saved)!==canonicalJson(snapshot))throw Error('INVALID');}
      }else presentation=validateLivePresentation(promptOptions.inputPresentation!,display.protectText);
      let safe:ReturnType<typeof projectHandbackInput>;try{safe=projectHandbackInput(text,display.protectText);}catch{throw Error('TEXT_PROJECTION_FAILED');}
      if(presentation?.target&&(presentation.target.roleId!==scope.roleId||presentation.target.runtime!==scope.runtime))throw Error('INVALID');
      const plan:DeliveryPlan={...safe,...(provenance?{provenance}:{}),...(presentation?{presentation}:{})};
      const attemptIdentity=provenance??(presentation?.attemptId?{deliveryId:presentation.deliveryId!,attemptId:presentation.attemptId}:undefined);
      if(attemptIdentity){
        let entries:RuntimeReplayEntry[]=[];let checkpoint:RuntimeReplayCheckpoint|undefined;
        try{if(storage){entries=await storage.readReplay();checkpoint=await storage.checkpointReplay?.();}}
        catch{throw new RuntimeDeliveryError('目标历史损坏，未调用Provider',{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:false,history:'failed',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'REPLAY_DAMAGED'});}
        if(entries.some(entry=>entry.inputProvenance&&entry.inputProvenance.version!==1||['delivery-boundary','delivery-receipt'].includes(String((entry.event?.detail as {source?:string}|undefined)?.source))&&(entry.event?.detail as {version?:number}).version!==1))throw Error('UNSUPPORTED_VERSION');
        if(seen.has(attemptIdentity.attemptId)||entries.some(x=>x.inputProvenance?.attemptId===attemptIdentity.attemptId||(x.event?.detail as {attemptId?:string;receipt?:RuntimeDeliveryReceiptV1}|undefined)?.attemptId===attemptIdentity.attemptId||(x.event?.detail as {receipt?:RuntimeDeliveryReceiptV1}|undefined)?.receipt?.attemptId===attemptIdentity.attemptId)){
          const old=await query(attemptIdentity.attemptId);throw new RuntimeDeliveryError('同一投递尝试不可再次调用Provider',old.state==='known'?{...old.receipt,code:'ATTEMPT_ALREADY_STARTED',retryDeliveryAllowed:false}:{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:true,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'ATTEMPT_ALREADY_STARTED'});
        }
        const identity={deliveryId:attemptIdentity.deliveryId,inputSaved:false,providerMayHaveStarted:false};
        const identifiers=jsonBytes([...seen,[attemptIdentity.attemptId,identity]]);
        for(const [key,item] of retained){if(used+identifiers<=REPORT_LIMITS.retention)break;if(item.busy())continue;drop(key);item.expire();}
        if(used+identifiers>REPORT_LIMITS.retention)throw Error('PROVENANCE_TOO_LARGE');
        seen.set(attemptIdentity.attemptId,identity);
        const capture:DeliveryCapture={receipt:{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:false,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false},entries:[],checkpoint,complete:false,retained:true,sequence:0};deliveries.set(attemptIdentity.attemptId,capture);plan.capture=capture;
      }
      return plan;
    },
    attachTurn(plan:DeliveryPlan|undefined,turnId:string){if(plan?.capture){plan.capture.receipt.turnId=turnId;rememberIdentity(plan.capture);}},
    captureEntry(plan:DeliveryPlan|undefined,entry:RuntimeReplayEntry):RuntimeReplayEntry{
      if(!plan?.capture)return entry;
      const capture=plan.capture;const safe=structuredClone({...entry,entryId:entry.entryId??`${capture.receipt.turnId}:${capture.sequence++}`});
      if(jsonBytes(safe)>REPORT_LIMITS.input){
        if(safe.kind==='user'||(safe.event?.detail as {source?:string}|undefined)?.source==='prompt-input')throw Error('PROVENANCE_TOO_LARGE');
        capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.receipt.retryHistoryAvailable=false;drop('delivery:'+capture.receipt.attemptId);return safe;
      }
      if(capture.retained){capture.entries.push(safe);remember(capture);}return safe;
    },
    pendingWrites(){return [...reports.values()].filter(holder=>holder.inFlight).length+[...deliveries.values()].filter(capture=>capture.inFlight).length;},
    progress(plan:DeliveryPlan|undefined,stage:RuntimeDeliveryProgressV1['stage'],opts:PromptOptions|undefined){if(plan?.capture)try{opts?.onDeliveryProgress?.({stage,receipt:cloneReceipt(plan.capture)});}catch{observerFailed();}},
    async complete(plan:DeliveryPlan|undefined,outcome:RuntimeTurnOutcome,record:RuntimeSessionRecord,error:unknown){
      const capture=plan?.capture;if(!capture)return;
      capture.complete=true;capture.record=record;capture.receipt.outcome=outcome;rememberIdentity(capture);
      if(!storage){capture.receipt.history='disabled';capture.receipt.retryHistoryAvailable=false;trimReceipts();return;}
      if(error){
        capture.receipt.history='failed';capture.receipt.code=error instanceof Error&&error.message==='PROVENANCE_TOO_LARGE'?'PROVENANCE_TOO_LARGE':'PERSIST_FAILED';
        capture.receipt.retryHistoryAvailable=capture.retained&&!!capture.checkpoint&&capture.receipt.code==='PERSIST_FAILED';
        try{await storage.readReplay();capture.receipt.retryDeliveryAllowed=!capture.receipt.providerMayHaveStarted&&capture.receipt.code==='PERSIST_FAILED';}catch{capture.receipt.code='REPLAY_DAMAGED';capture.receipt.retryHistoryAvailable=false;capture.receipt.retryDeliveryAllowed=false;}
      }else{
        capture.receipt.history='saved';capture.receipt.retryHistoryAvailable=false;
        const finalEntry:RuntimeReplayEntry={at:new Date().toISOString(),kind:'event',turnId:capture.receipt.turnId,entryId:`${capture.receipt.turnId}:receipt`,event:{kind:'message',summary:'投递历史保存状态',runtime:scope.runtime,roleId:scope.roleId,turnId:capture.receipt.turnId,detail:{source:'delivery-receipt',version:1,receipt:cloneReceipt(capture)}}};
        if(capture.retained)capture.entries.push(finalEntry);
        try{await storage.appendReplay([finalEntry]);}catch{capture.receipt.history='failed';capture.receipt.code='PERSIST_FAILED';capture.receipt.retryHistoryAvailable=capture.retained;}
      }
      remember(capture);deliveryChange(capture,capture.receipt.history==='saved'?'saved':'failed');
      trimReceipts();
    },
    dispose(){listeners.clear();for(const holder of reports.values())if(!holder.inFlight)holder.state={state:'expired',code:'SNAPSHOT_EXPIRED',reportId:holder.snapshot.reportId,retryAvailable:false};for(const capture of deliveries.values()){capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.receipt.retryHistoryAvailable=false;}retained.clear();used=0;},
  };
}
function validReceipt(value:unknown):value is RuntimeDeliveryReceiptV1{const r=value as RuntimeDeliveryReceiptV1;return !!r&&r.version===1&&validAttemptId(r.attemptId)&&validAttemptId(r.deliveryId)&&typeof r.turnId==='string'&&r.turnId.length>0&&Buffer.byteLength(r.turnId)<=4096&&typeof r.inputSaved==='boolean'&&typeof r.providerMayHaveStarted==='boolean'&&['pending','saved','failed','disabled'].includes(r.history)&&typeof r.retryHistoryAvailable==='boolean'&&typeof r.retryDeliveryAllowed==='boolean';}
