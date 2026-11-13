// app/desktop/session/lifecycle/open.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.4 / §5 B7、附录 A lifecycle 组）：open/openInternal **逐字搬移**；openInternalUnsafe 按方案
// §3.4 的 8 个 builder 作**连续代码块**分解（源行映射与逐行等价论证见
// 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md §builder 分解）：
//   resolveWorkflowMode（1994–2060）/ reuseOrRebindEntry（2061–2134）/ loadAuthorization（2136–2193）/
//   assembleGovernanceCapabilities（2195–2301）/ assembleProjectCapabilities（2303–2542）/
//   assembleToolSurface（2543–2956）/ freezeBindings（2958–2980）/ postOpenWiring（2982–3063）。
// 原顺序/条件/工具注册 spread 顺序逐字保留；跨块局部变量提升为**单一** ctx 对象（OpenContext）。
// 主流程保留原前置校验（1986–1993）并顺序调用 builder。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import type { Acceptance, BoundarySection1 } from "../../../../src/model/boundary.ts";
import type { GovernanceModel, ProjectConfig, RoleDispatchPurpose } from "../../../../src/model/role.ts";
import { governanceRoleOf, isBuiltInGovernanceRoleId, resolveBoundary, trioGovernanceSource } from "../../../../src/service/boundary/resolve-boundary.ts";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ChiefDecisionExecutionContext, DecidePendingRequestFn, SelectRunChangeFn, CompleteTeamPlanFn, ActivateRoleDocumentsFn, CloseCreatedTaskFn, FixedCloseCreatedTaskFn, GitQueryFn, GitCandidateFn, GitPublishFn, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts, TaskWorkSourceRef } from "../../../../src/model/runtime.ts";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import { readRoleCapabilityProtectionScope, inspectRoleSessionOpenFailure, registerVersionedDocumentAfterWrite } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import { createRuntimeAdapterFactory, type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions, type RuntimeAdapterFactory } from "../../../../src/pipeline/orchestration/run-role.ts";
import type { RequestDownloadFn } from "../../../../src/model/download.ts";
import type {
  DownloadApprovalOutcome,
  DownloadApprovalPresenter,
  DownloadApprovalRequest,
  DownloadRequestOptions,
  DownloadRequestRuntime,
} from "../../../../src/pipeline/orchestration/download-request.ts";
import { buildDownloadCardRequest, createRequestDownloadCapability, toDownloadApprovalOutcome } from "../../download-request.ts";
import { appendTaskEvent, classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, readTaskState, redispatchCountOf, redispatchTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskCards, taskEvent, taskIdempotencyKey, taskReportStatusOf, type TaskCardView, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import {
  appendWorkflowEvent,
  closeTask as closeFixedWorkflowTask,
  completeTeamPlanFixed,
  executeReleaseMerge,
  finalizeIntent as finalizeFixedIntent,
  inspectAssignedTask as inspectWorkflowAssignedTask,
  prepareIntent as prepareFixedIntent,
  preparePathBStart as prepareFixedPathBStart,
  prepareReleaseMerge,
  readBasisLedger,
  readWorkflowLedger,
  rejectReleaseMerge,
  requestStage,
  verifyBasisForStage,
  verifyBasisForWorkflow,
  workflowIdFor,
  type CompleteTeamPlanFixedResult,
  type FixedCloseCreatedTaskToolInput,
  type ReleaseMergePreview,
  type WorkflowServiceFailure,
} from "../../../../src/common/编排/workflow-service.ts";
import {
  activeFixedWorkflowIdFor,
  dispatchFlowIdOf,
  ensureFixedPathStarted,
  isFixedPathEnabledForFlow,
  isFixedReleaseTriggerStage,
  markFixedProposalCardRequested,
  recordFixedPathBScopeDecisionForDispatch,
  recordFixedStageDispatchForTask,
  resolveFixedPathMode,
  resolveProjectFixedPanelMode,
  sessionWorkflowModeForChat,
  sessionWorkflowModeForTask,
  shouldRecordFixedStageDispatch,
  workflowModeForFlowResolver,
  type FixedReleaseTriggerStage,
  type WorkflowMode,
} from "../../workflow.ts";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../../src/common/shared/diagnostics.ts";
import { mainT } from "../../i18n.ts";
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { RequestRequirementChangeFn, RequestRequirementChangeInput, RequestRequirementChangeResult } from "../../../../src/model/runtime.ts";
import type { PlanEscalationFn, PlanEscalationInput, PlanEscalationResult } from "../../../../src/model/runtime.ts";
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../../../src/model/runtime.ts";
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, UninstallSkillFn, ReportHandbackMetadata } from "../../../../src/model/runtime.ts";
import type { InstallMcpFn, InstallMcpPayload, InstallMcpReceipt, UninstallMcpFn } from "../../../../src/model/runtime.ts";
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../../../src/pipeline/orchestration/shell-arming.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn, ChiefDecisionBasis, ChiefDecisionHost } from "../../customer-input.ts";
import { createViewImageDelivery } from "../../view-image.ts";
import { loadEffectiveConfig as defaultLoadEffectiveConfig, type ConfigSourceKind, type LoadConfigOptions, type LoadedConfig } from "../../../../src/common/shared/config-loader.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import { buildEffectiveProjectConfig } from "../../project.ts";
import type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  InternalSessionOpenRequest, ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget,
  OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult,
  WithdrawResult, RebuildSessionResult, RedeliverResult, DeliveryAssignment, DeliveryOrigin,
  ActualDispatchSource, ControllerDisposalLease, LiveSession, ControllerResumeDelivery, DeliveryItem,
  PersistedDeliveryItemV1, DeliveryQueueRestoreReport, InstallationCapabilityTool,
  InstallationEffectRefusalObservation, DesktopSessionInventoryFact, DesktopRunStopFact,
  DesktopControllerStopFact, DesktopProjectExecutionInventory,
} from "../contracts/session-types.ts";
import {
  shortenText, isAppTaskClientMessageId, APP_TASK_CLIENT_MESSAGE_ID_PREFIX, boundTurnText, filePrint,
  isAssistantTextEvent, shouldSuppressStarTaskReport,
} from "../shared/text.ts";
import {
  desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory,
  desktopSessionManagers as inventorySessionManagers,
  type SessionInventoryState,
} from "../shared/inventory.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import {
  handbackOwnerRoleId, chiefTaskRoleIdOf, dispatcherRoleIdOf, resolveProofFlowIds,
  findListingForFeedback, roleDisplayName, refreshListingNow,
} from "../shared/roles.ts";
import { contextInfo } from "../shared/session-views.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import {
  taskCreators, rememberTaskCreator, readTasks, isFixedTask, appendTaskStateResult, appendTaskState,
  recordTaskFailure, appendRoleActivity,
} from "../shared/tasks-store.ts";
import { beginSessionDisposeLease, buildFixedTaskGitSurface, createTurnGitRuntime, endSessionDisposeLease, gitContextFailure, noteSessionDisposeInterruption } from "../git-ports.ts";
import type { LifecycleHost } from "./host.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { OpenContext } from "./open-context.ts";

export class LifecycleOpen {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

  private get activeRoleId(): string | null { return this.host.activeRoleId; }
  private set activeRoleId(value: string | null) { this.host.activeRoleId = value; }
  private get lastGovernanceRuntime(): Map<string, RuntimeKind> { return this.host.lastGovernanceRuntime; }
  private get loadEffectiveConfig(): (opts: LoadConfigOptions) => Promise<LoadedConfig> { return this.host.loadEffectiveConfig; }
  private get lruClock(): number { return this.host.lruClock; }
  private set lruClock(value: number) { this.host.lruClock = value; }
  private get openChains(): Map<string, Promise<void>> { return this.host.openChains; }
  private get rebuildChains(): Map<string, Promise<void>> { return this.host.rebuildChains; }
  private get selectionTargetRoleId(): string | null { return this.host.selectionTargetRoleId; }
  private set selectionTargetRoleId(value: string | null) { this.host.selectionTargetRoleId = value; }
  private get selectionVersion(): number { return this.host.selectionVersion; }
  private set selectionVersion(value: number) { this.host.selectionVersion = value; }
  private get sessions(): Map<string, LiveSession> { return this.host.sessions; }
  private afterAppointmentWriteApproved(...args: Parameters<LifecycleHost["afterAppointmentWriteApproved"]>): ReturnType<LifecycleHost["afterAppointmentWriteApproved"]> { return this.host.afterAppointmentWriteApproved(...args); }
  private afterStableWrite(...args: Parameters<LifecycleHost["afterStableWrite"]>): ReturnType<LifecycleHost["afterStableWrite"]> { return this.host.afterStableWrite(...args); }
  private appendRoleActivity(...args: Parameters<LifecycleHost["appendRoleActivity"]>): ReturnType<LifecycleHost["appendRoleActivity"]> { return this.host.appendRoleActivity(...args); }
  private applyMcpChange(...args: Parameters<LifecycleHost["applyMcpChange"]>): ReturnType<LifecycleHost["applyMcpChange"]> { return this.host.applyMcpChange(...args); }
  private applySkillChange(...args: Parameters<LifecycleHost["applySkillChange"]>): ReturnType<LifecycleHost["applySkillChange"]> { return this.host.applySkillChange(...args); }
  private closeCreatedTaskFixedForSession(...args: Parameters<LifecycleHost["closeCreatedTaskFixedForSession"]>): ReturnType<LifecycleHost["closeCreatedTaskFixedForSession"]> { return this.host.closeCreatedTaskFixedForSession(...args); }
  private completeTeamPlanFixedForHandle(...args: Parameters<LifecycleHost["completeTeamPlanFixedForHandle"]>): ReturnType<LifecycleHost["completeTeamPlanFixedForHandle"]> { return this.host.completeTeamPlanFixedForHandle(...args); }
  private completeTeamPlanForHandle(...args: Parameters<LifecycleHost["completeTeamPlanForHandle"]>): ReturnType<LifecycleHost["completeTeamPlanForHandle"]> { return this.host.completeTeamPlanForHandle(...args); }
  private consume(...args: Parameters<LifecycleHost["consume"]>): ReturnType<LifecycleHost["consume"]> { return this.host.consume(...args); }
  private contextInfo(...args: Parameters<LifecycleHost["contextInfo"]>): ReturnType<LifecycleHost["contextInfo"]> { return this.host.contextInfo(...args); }
  private contractCheckText(...args: Parameters<LifecycleHost["contractCheckText"]>): ReturnType<LifecycleHost["contractCheckText"]> { return this.host.contractCheckText(...args); }
  private currentSkillPaths(...args: Parameters<LifecycleHost["currentSkillPaths"]>): ReturnType<LifecycleHost["currentSkillPaths"]> { return this.host.currentSkillPaths(...args); }
  private deliveryIsStopped(...args: Parameters<LifecycleHost["deliveryIsStopped"]>): ReturnType<LifecycleHost["deliveryIsStopped"]> { return this.host.deliveryIsStopped(...args); }
  private deliveryLifecycle(...args: Parameters<LifecycleHost["deliveryLifecycle"]>): ReturnType<LifecycleHost["deliveryLifecycle"]> { return this.host.deliveryLifecycle(...args); }
  private disposeEntry(...args: Parameters<LifecycleHost["disposeEntry"]>): ReturnType<LifecycleHost["disposeEntry"]> { return this.host.disposeEntry(...args); }
  private disposeObservedHandle(...args: Parameters<LifecycleHost["disposeObservedHandle"]>): ReturnType<LifecycleHost["disposeObservedHandle"]> { return this.host.disposeObservedHandle(...args); }
  private docFormatText(...args: Parameters<LifecycleHost["docFormatText"]>): ReturnType<LifecycleHost["docFormatText"]> { return this.host.docFormatText(...args); }
  private drainAllQueuesFor(...args: Parameters<LifecycleHost["drainAllQueuesFor"]>): ReturnType<LifecycleHost["drainAllQueuesFor"]> { return this.host.drainAllQueuesFor(...args); }
  private drainQueue(...args: Parameters<LifecycleHost["drainQueue"]>): ReturnType<LifecycleHost["drainQueue"]> { return this.host.drainQueue(...args); }
  private emitDeliveryNote(...args: Parameters<LifecycleHost["emitDeliveryNote"]>): ReturnType<LifecycleHost["emitDeliveryNote"]> { return this.host.emitDeliveryNote(...args); }
  private enrichAppointmentWriteBoundaryCard(...args: Parameters<LifecycleHost["enrichAppointmentWriteBoundaryCard"]>): ReturnType<LifecycleHost["enrichAppointmentWriteBoundaryCard"]> { return this.host.enrichAppointmentWriteBoundaryCard(...args); }
  private evictBeyondLimit(...args: Parameters<LifecycleHost["evictBeyondLimit"]>): ReturnType<LifecycleHost["evictBeyondLimit"]> { return this.host.evictBeyondLimit(...args); }
  private evidenceCheckText(...args: Parameters<LifecycleHost["evidenceCheckText"]>): ReturnType<LifecycleHost["evidenceCheckText"]> { return this.host.evidenceCheckText(...args); }
  private findLiveRuntime(...args: Parameters<LifecycleHost["findLiveRuntime"]>): ReturnType<LifecycleHost["findLiveRuntime"]> { return this.host.findLiveRuntime(...args); }
  private inventoryChanged(...args: Parameters<LifecycleHost["inventoryChanged"]>): ReturnType<LifecycleHost["inventoryChanged"]> { return this.host.inventoryChanged(...args); }
  private mergeReportState(...args: Parameters<LifecycleHost["mergeReportState"]>): ReturnType<LifecycleHost["mergeReportState"]> { return this.host.mergeReportState(...args); }
  private noteWatchdogActivity(...args: Parameters<LifecycleHost["noteWatchdogActivity"]>): ReturnType<LifecycleHost["noteWatchdogActivity"]> { return this.host.noteWatchdogActivity(...args); }
  private notifyRoleState(...args: Parameters<LifecycleHost["notifyRoleState"]>): ReturnType<LifecycleHost["notifyRoleState"]> { return this.host.notifyRoleState(...args); }
  private openObservedRoleSession(...args: Parameters<LifecycleHost["openObservedRoleSession"]>): ReturnType<LifecycleHost["openObservedRoleSession"]> { return this.host.openObservedRoleSession(...args); }
  private persistenceScope(...args: Parameters<LifecycleHost["persistenceScope"]>): ReturnType<LifecycleHost["persistenceScope"]> { return this.host.persistenceScope(...args); }
  private profileRevision(...args: Parameters<LifecycleHost["profileRevision"]>): ReturnType<LifecycleHost["profileRevision"]> { return this.host.profileRevision(...args); }
  private projectNote(...args: Parameters<LifecycleHost["projectNote"]>): ReturnType<LifecycleHost["projectNote"]> { return this.host.projectNote(...args); }
  private projectStateTool(...args: Parameters<LifecycleHost["projectStateTool"]>): ReturnType<LifecycleHost["projectStateTool"]> { return this.host.projectStateTool(...args); }
  private queueDirectNotification(...args: Parameters<LifecycleHost["queueDirectNotification"]>): ReturnType<LifecycleHost["queueDirectNotification"]> { return this.host.queueDirectNotification(...args); }
  private rebuildIfBoundaryStale(...args: Parameters<LifecycleHost["rebuildIfBoundaryStale"]>): ReturnType<LifecycleHost["rebuildIfBoundaryStale"]> { return this.host.rebuildIfBoundaryStale(...args); }
  private redispatchTask(...args: Parameters<LifecycleHost["redispatchTask"]>): ReturnType<LifecycleHost["redispatchTask"]> { return this.host.redispatchTask(...args); }
  private refreshListingNow(...args: Parameters<LifecycleHost["refreshListingNow"]>): ReturnType<LifecycleHost["refreshListingNow"]> { return this.host.refreshListingNow(...args); }
  private refuseUnprovenInstallation(...args: Parameters<LifecycleHost["refuseUnprovenInstallation"]>): ReturnType<LifecycleHost["refuseUnprovenInstallation"]> { return this.host.refuseUnprovenInstallation(...args); }
  private rememberReceipt(...args: Parameters<LifecycleHost["rememberReceipt"]>): ReturnType<LifecycleHost["rememberReceipt"]> { return this.host.rememberReceipt(...args); }
  private reportPlanEscalation(...args: Parameters<LifecycleHost["reportPlanEscalation"]>): ReturnType<LifecycleHost["reportPlanEscalation"]> { return this.host.reportPlanEscalation(...args); }
  private requestVersionDecision(...args: Parameters<LifecycleHost["requestVersionDecision"]>): ReturnType<LifecycleHost["requestVersionDecision"]> { return this.host.requestVersionDecision(...args); }
  private resumeDelivery(...args: Parameters<LifecycleHost["resumeDelivery"]>): ReturnType<LifecycleHost["resumeDelivery"]> { return this.host.resumeDelivery(...args); }
  private roleActivityLogText(...args: Parameters<LifecycleHost["roleActivityLogText"]>): ReturnType<LifecycleHost["roleActivityLogText"]> { return this.host.roleActivityLogText(...args); }
  private roleStatusText(...args: Parameters<LifecycleHost["roleStatusText"]>): ReturnType<LifecycleHost["roleStatusText"]> { return this.host.roleStatusText(...args); }
  private routeDispatch(...args: Parameters<LifecycleHost["routeDispatch"]>): ReturnType<LifecycleHost["routeDispatch"]> { return this.host.routeDispatch(...args); }
  private runTaskIsFenced(...args: Parameters<LifecycleHost["runTaskIsFenced"]>): ReturnType<LifecycleHost["runTaskIsFenced"]> { return this.host.runTaskIsFenced(...args); }
  private selectRunChangeForHandle(...args: Parameters<LifecycleHost["selectRunChangeForHandle"]>): ReturnType<LifecycleHost["selectRunChangeForHandle"]> { return this.host.selectRunChangeForHandle(...args); }
  private send(...args: Parameters<LifecycleHost["send"]>): ReturnType<LifecycleHost["send"]> { return this.host.send(...args); }
  private sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return this.host.sessionKey(...args); }
  private sessionTailText(...args: Parameters<LifecycleHost["sessionTailText"]>): ReturnType<LifecycleHost["sessionTailText"]> { return this.host.sessionTailText(...args); }
  private terminateRoleRun(...args: Parameters<LifecycleHost["terminateRoleRun"]>): ReturnType<LifecycleHost["terminateRoleRun"]> { return this.host.terminateRoleRun(...args); }
  private withRequestLifecycle(...args: Parameters<LifecycleHost["withRequestLifecycle"]>): ReturnType<LifecycleHost["withRequestLifecycle"]> { return this.host.withRequestLifecycle(...args); }

  // —— open（B7 自 session.ts 逐字搬移）——
  async open(req: SessionOpenRequest): Promise<OpenResult> {
    const selectionVersion = ++this.selectionVersion;
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    this.selectionTargetRoleId = key;
    this.resumeDelivery(key);
    await this.rebuildChains.get(key);
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
    diagnostic.record("session.open.start");
    const result = await this.openInternal(req, true, selectionVersion);
    diagnostic.record("session.open.end", { ok: result.ok });
    if (!result.ok) diagnostic.error("session.open.failed", new Error(result.error || "会话开启失败"));
    return result;
  }

  // —— openInternal（B7 自 session.ts 逐字搬移）——
  async openInternal(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion): Promise<OpenResult> {
    if (req.taskId && this.runTaskIsFenced(req.projectRoot, req.taskId)) return { ok: false, error: "run-stop-host-fenced:原运行任务已暂停，未重新开启。" };
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    const lifecycle = this.deliveryLifecycle(key);
    const prev = this.openChains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail: Promise<void> = prev.then(() => gate);
    this.openChains.set(key, tail);
    this.inventoryChanged(req.projectRoot, "session-open-chain-queued");
    try {
      await prev;
      return await this.openInternalUnsafe(req, userInitiated, selectionVersion, false, lifecycle);
    } finally {
      release();
      if (this.openChains.get(key) === tail) this.openChains.delete(key); // 链尾清理（防泄漏）
      this.inventoryChanged(req.projectRoot, "session-open-chain-settled");
    }
  }

  // —— openInternalUnsafe（B7 builder 分解；主流程 1986–1993 + 8 连续块）——
  async openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion, internalReopen = false,
    lifecycle = this.deliveryLifecycle(this.sessionKey(req.projectRoot, req.roleId, req.runtime))): Promise<OpenResult> {
    if (!req.projectRoot || !req.roleId) {
      return { ok: false, error: mainT("main.session.missingProjectOrRole") };
    }
    if (!(RUNTIME_KINDS as readonly string[]).includes(req.runtime)) return { ok: false, error: mainT("main.common.unknownRuntime") };
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    const stopped = () => this.deliveryIsStopped(key) || this.deliveryLifecycle(key) !== lifecycle;
    const stoppedResult = (): OpenResult => ({ ok: false, error: "会话已停止，待投递消息已保留；请显式打开会话或重试投递。" });
    if (stopped()) return stoppedResult();
    const ctx = {
      req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult,
    } as OpenContext;
    const workflow = await this.resolveWorkflowMode(ctx);
    if (workflow !== undefined) return workflow;
    const reuse = await this.reuseOrRebindEntry(ctx);
    if (reuse !== undefined) return reuse;
    const authorization = await this.loadAuthorization(ctx);
    if (authorization !== undefined) return authorization;
    await this.assembleGovernanceCapabilities(ctx);
    this.assembleProjectCapabilities(ctx);
    const surface = await this.assembleToolSurface(ctx);
    if (surface !== undefined) return surface;
    const frozen = await this.freezeBindings(ctx);
    if (frozen !== undefined) return frozen;
    return await this.postOpenWiring(ctx);
  }

  /** resolveWorkflowMode：openInternalUnsafe 连续块（源 1994–2060；映射见 change 记录）。 */
  private async resolveWorkflowMode(ctx: OpenContext): Promise<OpenResult | undefined> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult } = ctx;
    // T3 B1（AC-12/AC-23）：会话级 workflow 模式按**输入任务的真实 flowId** 解析（与 run-role 同源；
    // single/su 不参与）。fixed 任务不使用 legacy trunk 的 assigned-task 绑定——否则在 fixed 任务
    // （无 runId）上会 fail-closed 为 `delivery-assignment-unavailable` 且永远到不了 fixed 注入面。
    // legacy/空任务路径逐字不变（模式解析失败 ⇒ legacy，不猜 fixed）。
    // T3 B6.1（2026-11-11）：**真实聊天入口**（无 taskId 的 trio 幕僚聊天）不再硬编码 legacy——按项目
    // 状态解析（空项目/纯新项目 ⇒ fixed；legacy 项目/在飞 run/显式 legacy/v1 ⇒ legacy；fail-closed）。
    // 依据 RR 失败根因 `fixed-path-not-activated-from-chief-chat`；有 taskId 仍按任务 flow（`sessionWorkflowModeForTask`）。
    // T3 B8.1（2026-11-11，RR3 根因 `fixed-dispatch-target-opened-legacy`）：固定派发/投递机在内部打开
    // 目标会话时可携带 `forcedWorkflowMode:"fixed"`——不再依赖聊天入口按项目状态的现场解析（混合项目
    // 「在飞 legacy run + fixed workflow」时聊天解析为 legacy；RR3 实测 convener 会话以 legacy 打开并
    // 收到 `request_stable_write`）。强制只在 trio 生效（固定路径为 trio 产品流程）；未携带时下面
    // task/chat 逻辑逐字不变。
    const listingGovernanceModel = this.deps.getListing(req.projectRoot)?.governanceModel ?? "single";
    const forcedSessionWorkflowMode: WorkflowMode | undefined =
      req.forcedWorkflowMode === "fixed" && listingGovernanceModel === "trio" ? "fixed" : undefined;
    const requestedSessionMode: WorkflowMode =
      forcedSessionWorkflowMode ??
      (listingGovernanceModel === "trio"
        ? req.taskId !== undefined
          ? await sessionWorkflowModeForTask(req.projectRoot, req.taskId)
          : await sessionWorkflowModeForChat(req.projectRoot)
        : "legacy");
    let requestedAssignment: DeliveryAssignment | undefined;
    if (req.taskId && requestedSessionMode !== "fixed") {
      const actual = await resolveDeliveryAssignment({ projectRoot: req.projectRoot, recipientRoleId: req.roleId, source: { kind: "assigned-task", taskId: req.taskId } });
      if (!actual.ok) return { ok: false, error: `${actual.code}:${actual.message}` };
      if (stopped()) return stoppedResult();
      requestedAssignment = actual.value;
    }
    // A worker's frozen document context and task-directory gate belong to one real assigned child.
    const previousTaskSession = this.sessions.get(key);
    if (req.taskId && (req.roleId === "verifier" || !isBuiltInGovernanceRoleId(req.roleId)) && previousTaskSession && previousTaskSession.assignedTaskId !== req.taskId) {
      if (previousTaskSession.busy || previousTaskSession.origins.running !== undefined)
        return { ok: false, error: "worker-task-session-busy：目标正在执行另一真实任务，保持排队。" };
      const disposed = await this.disposeEntry(key, previousTaskSession);
      if (disposed !== null) return { ok: false, error: disposed };
    }
    // T3 B8.1（2026-11-11，RR3）：fixed 任务的目标会话必须是 **fixed 会话**。既有条目若为 legacy 注入
    // （混合项目聊天解析/早期自动打开等），先安全关闭再按 fixed 新建；busy（含在跑 origin）或关闭失败 ⇒
    // fail-closed `fixed-session-rebind-blocked`——**绝不把 fixed 投递进 legacy 会话**（RR3 的 legacy
    // stable-write 卡）。该重绑只发生在 forced fixed 的内部打开上；用户/legacy 打开路径逐字不变。
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed 任务的目标会话还必须绑定
    // **本次真实任务**（`assignedTaskId`）——否则 run-role 的 handback intent 没有 taskId，
    // `submit_report` 以「任务关联未知」到达、`task.reported` 缺失、`close_created_task accepted`
    // 报 `close-report-missing`（RR5 实测 convener/product 全中）。既有 fixed 条目未绑定本次任务
    // （聊天打开/上一任务）时同样按 B8.1 口径安全重开；busy/关闭失败 ⇒ fail-closed。O-1 重建续段
    // （`internalReopen`）不参与任务重绑：其 taskId 取自被重建条目自身，不能反过来打断并发新会话。
    const forcedExisting = this.sessions.get(key);
    const fixedTaskRebindPending = forcedSessionWorkflowMode === "fixed" && !internalReopen
      && typeof req.taskId === "string" && req.taskId !== ""
      && forcedExisting !== undefined && forcedExisting.projectRoot === req.projectRoot
      && forcedExisting.sessionWorkflowMode === "fixed"
      && forcedExisting.assignedTaskId !== req.taskId;
    if (forcedSessionWorkflowMode === "fixed" && forcedExisting && forcedExisting.projectRoot === req.projectRoot
        && (forcedExisting.sessionWorkflowMode !== "fixed" || fixedTaskRebindPending)) {
      const rebindDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
      if (forcedExisting.busy || forcedExisting.origins.running !== undefined) {
        rebindDiagnostic.record("session.fixed-rebind.blocked", { reasonCode: "target-busy", previousWorkflowMode: forcedExisting.sessionWorkflowMode, taskBinding: fixedTaskRebindPending ? "different-task" : "not-fixed" });
        return { ok: false, error: "fixed-session-rebind-blocked：目标会话正在执行轮次，无法以本次固定任务重开（未向该会话投递，待其空闲后重试）。" };
      }
      const rebound = await this.disposeEntry(key, forcedExisting);
      if (rebound !== null) {
        rebindDiagnostic.record("session.fixed-rebind.blocked", { reasonCode: "close-failed", detail: rebound });
        return { ok: false, error: `fixed-session-rebind-blocked：目标旧会话关闭失败（${rebound}），未以固定模式重开。` };
      }
      rebindDiagnostic.record("session.fixed-rebind", { previousWorkflowMode: forcedExisting.sessionWorkflowMode, taskRebind: fixedTaskRebindPending });
    }
    ctx.forcedSessionWorkflowMode = forcedSessionWorkflowMode;
    ctx.requestedSessionMode = requestedSessionMode;
    ctx.requestedAssignment = requestedAssignment;
  }

  /** reuseOrRebindEntry：openInternalUnsafe 连续块（源 2061–2134；映射见 change 记录）。 */
  private async reuseOrRebindEntry(ctx: OpenContext): Promise<OpenResult | undefined> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, forcedSessionWorkflowMode, requestedSessionMode, requestedAssignment } = ctx;
    // B-2：该角色已有**同项目**的保活会话 → 续接（句柄与模型上下文原样保留）。
    const existing = this.sessions.get(key);
    if (existing && existing.projectRoot === req.projectRoot) {
      if (internalReopen) {
        // 重建链内的重开（见方法头注）：当前条目即并发方刚建好的新会话（或本链尚未 dispose 的防御路径）——
        // 按续接如实返回，不再触发任何 reopen 预检。
        existing.lastUsed = ++this.lruClock;
        if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key;
        this.notifyRoleState(req.projectRoot, req.roleId, req.runtime);
        this.noteWatchdogActivity(req.projectRoot, "session-open");
        return {
          ok: true,
          note: mainT("main.session.readyContinue"),
          config: existing.config,
          resumed: true,
          contextSource: "resumed",
          runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: existing.profileRevision,
        };
      }
      // O-1（2026-10-12）：续接前先查**边界快照**——陈旧 ⇒ 作废并按下方**新建**路径重开（历史按 D-1 恢复）；
      // 未陈旧 ⇒ 逐字续接（**绝不**误重开丢上下文）。在跑的轮次不打断（busy 时跳过，下一时机再查）。
      const rebuilt = await this.rebuildIfBoundaryStale(key, userInitiated, selectionVersion, forcedSessionWorkflowMode);
      if (rebuilt === undefined) {
        // 串行等待期间后台可能已替换旧条目，续接必须取当前句柄。
        const current = this.sessions.get(key);
        if (!current || current.projectRoot !== req.projectRoot) {
          return { ok: false, error: mainT("main.session.closedClickRole") };
        }
        current.lastUsed = ++this.lruClock;
        if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key;
        this.notifyRoleState(req.projectRoot, req.roleId, req.runtime); // 重载/续接恢复真实busy与队列，不另推导。
        let note = mainT("main.session.continuing");
        if (current.profileRevision !== this.profileRevision(req.runtime)) note = mainT("main.session.configAfterTurn");
        return {
          ok: true,
          note,
          config: current.config,
          resumed: true,
          contextSource: "resumed",
          runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: current.profileRevision,
        };
      }
      if (!rebuilt.reopened.ok) {
        return { ok: false, error: mainT("main.session.boundaryRebuildFailed", { detail: rebuilt.reopened.error ?? mainT("shared.common.unknownReason") }) };
      }
      return rebuilt.reopened;
    }
    // 同一个三元身份才可能复用；跨项目及跨引擎的句柄并存。
    if (existing) {
      await this.disposeEntry(key, existing);
    }

    let listing = this.deps.getListing(req.projectRoot);
    if (!listing) {
      return { ok: false, error: mainT("main.session.projectNotEnumerated") };
    }
    let role = listing.roles.find((r) => r.roleId === req.roleId);
    if (!role) {
      // **2026-10-18 真机竞态**：任命写卡后 `.ans`/角色表刷新期间，旧 listing 缓存可能还没有目标内置角色
      // （Convener 按新边界重建时 `open()` 报「未找到角色：convener」）。这里**强制刷新一次**共享缓存
      // （与界面 `listProject` 同一 `listProjectFn`）再查；仍找不到才如实报错。**只刷新一次、不循环**。
      const refreshed = await this.refreshListingNow(req.projectRoot);
      if (refreshed) {
        listing = this.deps.getListing(req.projectRoot);
        role = listing?.roles.find((r) => r.roleId === req.roleId);
      }
      if (!role || !listing) {
        return { ok: false, error: mainT("main.session.roleNotFound", { projectRoot: req.projectRoot, roleId: req.roleId }) };
      }
      createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).record(
        "session.open.stale-listing-refreshed",
        { refreshed },
      );
    }
    ctx.listing = listing;
    ctx.role = role;
  }

  /** loadAuthorization：openInternalUnsafe 连续块（源 2136–2193；映射见 change 记录）。 */
  private async loadAuthorization(ctx: OpenContext): Promise<OpenResult | undefined> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, listing, role, requestedSessionMode } = ctx;
    // ——— 授权模型：**有 `.ans` 优先用它（pin 生效）；无 `.ans` 才回退运行期同意** ———
    //
    // 判定链的**唯一实现在共享载入器** `src/common/shared/config-loader.ts`（pm 属主，本角色只读导入、
    // 不复制），并经 `project.ts::buildEffectiveProjectConfig` 收敛为**一处**（会话语义与界面只读判定共用，
    // 杜绝两处漂移）。三分支（载入器恒返回、不抛）：
    //  ① 有可用的 `.ans/project.json` → 用其 **pin-backed acceptance**（pin 生效、受 pin 约束，篡改即由
    //     门禁 `verifyPins` 判未接受 → 拒写）；
    //  ② **无** `.ans` → 载入器原样回退入参 fallback，即**运行期同意**（`DESKTOP_RUNTIME_CONSENT`，
    //     设计 §3.3 登记的两个非-pin 例外之一——理由见 project.ts 该常量注释）；
    //  ③ `.ans` 存在但**不可用** → 载入器 **fail-closed** 置为未接受、**绝不**回退运行期同意。
    //
    // ⚠️ 本函数随 `buildEffectiveProjectConfig` **一并采纳载入器给出的**项目治理边界路径
    // （`loaded.project.governanceBoundary.path`）——这是「**已 bootstrap 的项目里 su 按项目治理边界工作**」
    // 的前提；此前该路径被丢弃（恒空串）⇒ su 掉回内置未接受、拒一切写。修复后三条路径都正确：
    // 无 `.ans` 回退运行期同意 / 未 bootstrap（`!hasRoles`）走创世 / 已 bootstrap（`.ans` 有效）按项目治理边界。
    //
    // 角色表仍取门禁引擎的枚举结果（本层不另写解析，与左树同源）——载入器的 `project.roles` 只是 `.ans`
    // 分支的产物（`ans-invalid` 分支为空），桌面有意以**枚举角色**为准。
    const { project: baseProject, source } = await buildEffectiveProjectConfig(listing, {
      buildProjectConfig: this.deps.buildProjectConfig,
      loadEffectiveConfig: this.loadEffectiveConfig,
    });
    let project = baseProject;
    if (req.taskId && role.builtIn !== true && requestedSessionMode !== "fixed") {
      // legacy 项目角色的真实执行任务上下文（trunk run/冻结名单）；fixed 任务作用域属 B3（此处不猜）。
      const assigned = await inspectAssignedTask({ projectRoot: req.projectRoot, taskId: req.taskId, actorRoleId: req.roleId });
      if (!assigned.ok) return { ok: false, error: `${assigned.code}：${assigned.message ?? assigned.code}` };
      if (assigned.value.kind !== "execution") return { ok: false, error: "worker-task-context-unavailable：缺少实际执行任务绑定。" };
      const context = await readRunRoleContext({ projectRoot: req.projectRoot, runId: assigned.value.runId, roleId: req.roleId });
      if (!context.ok) return { ok: false, error: `${context.code}：${context.message}` };
      const taskScope = await prepareAssignedTaskWriteScope({ projectRoot: req.projectRoot, taskId: req.taskId, actorRoleId: req.roleId });
      if (!taskScope.ok) return { ok: false, error: `${taskScope.code}：${taskScope.message ?? taskScope.code}` };
      project = { ...project, documentContext: context.documentContext };
    }
    const config: EffectiveConfigInfo = {
      kind: source.kind,
      accepted: source.acceptance.accepted === true,
      acceptanceSource: source.acceptance.source,
      pinCount: source.acceptance.pin?.length ?? 0,
      reason: source.downgradeReason,
    };
    const boundary = role.boundary;
    const gitBinding: { handle?: RoleSessionHandle } = {};
    // B6（2026-11-13）：Git runtime 装配片段迁入 `session/git-ports.ts`（同一判定顺序/失败码/装配入参；
    // 上下文字段为原闭包自由变量，回调保持原求值时机与次数）。
    const currentGitRuntime = createTurnGitRuntime({
      key,
      gitBinding,
      projectRoot: req.projectRoot,
      roleId: req.roleId,
      sessions: this.sessions,
      deliveryIsStopped: (leaseKey) => this.deliveryIsStopped(leaseKey),
      runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId),
    });
    let routineShellPolicy: RoutineShellPolicy | undefined;
    if (role.builtIn !== true && config.accepted) {
      routineShellPolicy = { enabled: true, projectRoot: req.projectRoot, authorizationSource: "customer-delegated-routine-checks" };
    }
    ctx.project = project;
    ctx.config = config;
    ctx.boundary = boundary;
    ctx.gitBinding = gitBinding;
    ctx.currentGitRuntime = currentGitRuntime;
    ctx.routineShellPolicy = routineShellPolicy;
  }

  /** assembleGovernanceCapabilities：openInternalUnsafe 连续块（源 2195–2301；映射见 change 记录）。 */
  private async assembleGovernanceCapabilities(ctx: OpenContext): Promise<void> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, requestedSessionMode, project, role, config } = ctx;
    // ——— 三权（评审 §5.6）：能力按 `governanceFunction` 路由；single/su 旧行为逐字不变 ———
    //
    // 唯一数据来源＝门禁引擎注册表（经 `role.governanceFunction`/`builtIn` 表达，**不硬编码角色 id**）。
    // · legacyBuiltIn：single 模型下的内置治理角色（su）——保持旧能力集（派发/看护/安装）；
    // · schedule：trio 的 Convener——派发/看护/恢复提议；
    // · nomination：trio 的 Nominator——技能/MCP 安装；
    // · liaison：trio 的 Liaison——意图交接；proposal：Rapporteur——澄清 + 需求变更申请；
    // · verification：trio 的 Verifier——无附加能力。
    // **shell 不再按职能分档**（客户 2026-10-19 新规则）：全部内置治理角色统一审批档，见下方 `shellOperatorOnly`。
    const governanceModel: GovernanceModel = project.governanceModel ?? "single";
    const governanceFunction = role.governanceFunction;
    // T3（2026-11-10 两条固定工作流路径，B1 AC-12/AC-23）：会话级 workflow 模式（与 run-role 同口径：
    // 输入任务的真实 flowId ⇒ `workflowMode`；B6.1 起无任务的 trio 聊天按项目状态解析）。fixed 会话
    // **不注入** legacy 治理型 Git/流程能力（下方注入 gate）；single/su 与 legacy 会话的注入集合/顺序逐字不变。
    // 复用本函数前段的同一个解析结果（同一任务/项目事实；不引入项目级缓存）。
    const sessionWorkflowMode: WorkflowMode = governanceModel === "trio" ? requestedSessionMode : "legacy";
    const legacyOnlyCapabilitiesAllowed = sessionWorkflowMode !== "fixed";
    const legacyBuiltIn = role.builtIn === true && governanceFunction === undefined && governanceModel === "single";
    const canSchedule = governanceFunction === "schedule" || legacyBuiltIn;
    const canNominate = governanceFunction === "nomination" || legacyBuiltIn;

    // ——— 客户确认制交互（A-1/A-3/A-5）：**仅内置治理角色（su 或 trio 五人）**的会话注入客户交互通道 ———
    //
    // 判据 = 「本角色是内置治理角色」（`role.builtIn`，数据驱动、**不硬编码 "su"**）。注入 ⇒ 编排把本会话
    // 置为**确认制**（`request_confirmation`/`request_choice` 注册；gate 走「客户确认才发行 writeSet」）——
    // 「客户确定了才加、才落盘」。**普通角色的会话一律不注入**（无客户通道：工具不注册、gate 旧语义逐字
    // 不变）。通道未接（deps.customerInput 缺省）⇒ 不注入——**绝不**出现「没人问就放行」。
    // 2026-10-18 Lead 需求确认，2026-10-20 客户修正：Liaison（Lead / 主理）**需要** customerInput 发
    // `intent-confirm` 需求确认卡——**客户决策卡**；「替我决策」开关开启时判断 agent 可代批 `confirm`，
    // `revise` 仍交回客户。隔离由编排 `TRIO_CARD_KINDS.liaison = ["intent-confirm"]` 保证：
    // 其他治理卡在 Liaison 会话里**结构性拒绝**（不弹卡、declined），不占「一项目一卡」决定队列。
    // `intent-confirm` 不镜像（由 Lead 本人发）；single/su 旧行为不变。
    // trio 下客户作出决定后的 `customer.decision` 账本写入在编排的 `customerInput` 包装器内（评审 §5.7，
    // 桌面只接线、不另写一份）。
    const customerInput = role.builtIn === true ? this.deps.customerInput : undefined;

    // ——— 写盘确认的应用层兜底（客户 2026-10-25 新规则：「写自己角色权限内的路径，直接放行」）———
    // 预解析本会话的 Section 1 边界快照（含接受证据）：与 `openRoleSession` 内部的 `setupRole`
    // **同一解析源**（Service `resolveBoundary` → 门禁 `resolveBoundarySection`；入参是本会话同一份
    // `ProjectConfig`，`governanceBoundary` 的接受证据与开会话时一致）。customer-input 只在**呈现卡片/
    // 调用判断之前**用它对写盘确认做边界判定（`write-preauthorization.ts`；边界判定唯一来源仍是
    // 门禁 `resolveWrite`）。解析失败/非确认制会话 ⇒ 缺省 ⇒ 预授权不生效（保持既有卡片/判断路径；
    // fail-closed 方向不变——绝不「不知道边界就放行」）。
    let writeBoundary: BoundarySection1 | undefined;
    if (customerInput !== undefined) {
      try {
        writeBoundary = await resolveBoundary(req.roleId, project);
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "write-preauthorization.boundary.unavailable",
          error,
        );
        writeBoundary = undefined;
      }
    }

    // C 批（2026-10-28）：**删除决定卡镜像面**——申请卡只在来源角色会话/客户通道呈现，
    // 幕僚只收 `request.notified` 系统通知（不呈现第二张卡、不代答、不代决）。
    const mirrorRoleIdFor = (_request: CustomerInputRequest): string | undefined => undefined;

    // 2026-10-29（方案 v2.1/Topology v4.1）：派发能力给幕僚（主链/验收调度）、运营（实现任务/验收核对）
    // 与 single/su；目标矩阵由 `routeDispatch` → `evaluateDispatchPreflight` 机械执行。
    const canDispatch = governanceFunction === "chief" || governanceFunction === "schedule" || legacyBuiltIn;
    const dispatchBinding: { handle?: RoleSessionHandle } = {};
    // W6（B1 AC-6）：团队计划登记的宿主 run 绑定——handle 在开会话成功处与 gitBinding/dispatchBinding 同源定格。
    const planBinding: { handle?: RoleSessionHandle } = {};
    const dispatchTask: DispatchTaskFn | undefined = canDispatch ? (d, metadata) => {
      const entry = this.sessions.get(key), origin = entry?.origins.running;
      const source = entry?.handle === dispatchBinding.handle && origin &&
        (!metadata || metadata.turnId === origin.turnId && (!metadata.roleId || metadata.roleId === req.roleId) &&
          (!metadata.runtime || metadata.runtime === req.runtime)) ? { entry, origin } : undefined;
      return this.routeDispatch(req.projectRoot, req.runtime, req.roleId, d, source);
    } : undefined;
    // 2026-10-26 `view_image`（全部角色）：工具读取的图片作为**下一轮用户提示的图片附件**排队给**同一角色**。
    // 目标在开会话时定格（不认 `activeRoleId`，也不接受调用方改投）；投递经既有 `send` → 同一投递机——
    // 工具本轮内角色必然 busy ⇒ 按到达序入队，settle 后投递；直发失败/会话不可用如实回执。
    // 后台系统提示（`background:true`+`kind:"system"`）：不冒充客户消息、不抢 pane；`images` 原引用。
    const viewImage: ViewImageFn = createViewImageDelivery({
      target: { projectRoot: req.projectRoot, roleId: req.roleId, runtime: req.runtime },
      send: (text, opts, target, metadata) => this.send(text, opts, target, metadata),
    });
    // 2026-10-26 需求变更申请（request_requirement_change）：**仅统筹（schedule）与报告员（proposal）**
    // 会话注入（2026-10-26 客户纠正：审批卡由这两个角色发起/持有；其他内置治理角色、项目角色与
    // single/su 不注入——能力缺席 = 工具不注册 = 最强 fail-closed）。编排再按治理职能收口；本层只把
    // 项目根/发起角色/引擎补入后透传。**提交申请 ≠ 批准**：审批由客户/判断 agent 在 decision 卡上完成，
    // 主理不审批、只在批准后执行意图变更。
    const canInitiateRequirementChange = governanceFunction === "proposal" || governanceFunction === "schedule";
    // 2026-10-31（run-change 触发）：应用自有的 run-change 卡可经统筹/提案/幕僚任一在场的客户卡通道呈现
    // （会话选择顺序 convener → rapporteur → chief）。这只扩大**应用内**的发卡呈现面，不新增模型工具：
    // `request_requirement_change` 仍只注入 proposal/schedule（上面 canInitiateRequirementChange 未变）。
    const canPresentAppRunChange = canInitiateRequirementChange || governanceFunction === "chief";
    // 2026-11-04 trunk-amendment-model D1：每项目版本变更/冻结/stable 栈（Interface 注入；缺省 ⇒
    // 不注入 `stablePermitOf`、不接 appointment-write 钩子——旧行为，能力缺席 = fail-closed）。
    const versionChangeStack = this.deps.getVersionChangeStack?.(req.projectRoot);
    const direct = governanceModel === "trio" ? createDirectRoleRuntime({ projectRoot: req.projectRoot, actorRoleId: req.roleId, notifyDirect: input => this.queueDirectNotification(req.projectRoot, input) }) : undefined;
    const closeCreatedTask: CloseCreatedTaskFn | undefined = direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
      ? async (input, signal) => {
          const result = await direct.closeCreatedTask(input, signal);
          if (result.ok) void this.drainAllQueuesFor(req.projectRoot);
          return result;
        } : undefined;
    // T3 B3（AC-18/AC-20）：fixed 会话的 close_created_task v2 应用实现（身份由 run-role 绑定；
    // 证据由应用补入；legacy 会话不注入本键——run-role 只在 fixed 会话消费）。
    const closeCreatedTaskFixed: FixedCloseCreatedTaskFn | undefined =
      sessionWorkflowMode === "fixed" && direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
        ? async (input, signal) => this.closeCreatedTaskFixedForSession(req.projectRoot, req.roleId, input, signal)
        : undefined;
    ctx.governanceModel = governanceModel;
    ctx.governanceFunction = governanceFunction;
    ctx.sessionWorkflowMode = sessionWorkflowMode;
    ctx.legacyOnlyCapabilitiesAllowed = legacyOnlyCapabilitiesAllowed;
    ctx.legacyBuiltIn = legacyBuiltIn;
    ctx.canSchedule = canSchedule;
    ctx.canNominate = canNominate;
    ctx.customerInput = customerInput;
    ctx.writeBoundary = writeBoundary;
    ctx.mirrorRoleIdFor = mirrorRoleIdFor;
    ctx.canDispatch = canDispatch;
    ctx.dispatchBinding = dispatchBinding;
    ctx.planBinding = planBinding;
    ctx.dispatchTask = dispatchTask;
    ctx.viewImage = viewImage;
    ctx.canInitiateRequirementChange = canInitiateRequirementChange;
    ctx.canPresentAppRunChange = canPresentAppRunChange;
    ctx.versionChangeStack = versionChangeStack;
    ctx.direct = direct;
    ctx.closeCreatedTask = closeCreatedTask;
    ctx.closeCreatedTaskFixed = closeCreatedTaskFixed;
  }

  /** assembleProjectCapabilities：openInternalUnsafe 连续块（源 2303–2542；映射见 change 记录）。 */
  private assembleProjectCapabilities(ctx: OpenContext): void {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, role, project, governanceFunction, legacyBuiltIn, canNominate, versionChangeStack, direct, canInitiateRequirementChange, customerInput, sessionWorkflowMode } = ctx;
    // Batch 3.5（C1d/S5）：三提交能力的桌面实现——**只提交**，不批准/不发卡/不签发许可。
    // 角色门控：product/rapporteur → submitVersionChange；convener → submitRefactor + requestStableWrite；
    // 其他角色不注入（run-role 仍二次门控；工具不存在 = fail-closed）。身份以 req.roleId 强制，
    // 不信任模型/tool 载荷自报。
    const submitVersionChangeCapability: SubmitVersionChangeFn | undefined =
      versionChangeStack !== undefined && (req.roleId === "product" || req.roleId === "rapporteur")
        ? async (input, signal) => {
            try {
              return await versionChangeStack.submitVersionChange(
                { ...input, initiatorRoleId: req.roleId as "product" | "rapporteur" },
                signal,
              );
            } catch (error) {
              return {
                ok: false,
                errorCode: "vca-invalid",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const submitRefactorCapability: SubmitRefactorFn | undefined =
      versionChangeStack !== undefined && req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await versionChangeStack.submitRefactor({ ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "refactor-invalid",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    // 2026-11-05：方案升级报告（仅 convener；应用发行客户主权卡；不派发/不改需求或验收标准）。
    const reportPlanEscalationCapability: PlanEscalationFn | undefined =
      req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await this.reportPlanEscalation(req.projectRoot, { ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "plan-escalation-invalid" as const,
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const requestStableWriteCapability: RequestStableWriteFn | undefined =
      versionChangeStack !== undefined && req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await versionChangeStack.requestStableWrite({ ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "stable-write-write-failed",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const requestRequirementChange: RequestRequirementChangeFn | undefined =
      canInitiateRequirementChange && this.deps.requestRequirementChange !== undefined
        ? (input: RequestRequirementChangeInput) =>
            this.deps.requestRequirementChange!(req.projectRoot, req.roleId, req.runtime, input)
        : undefined;
    // G-2/W1（同处注入）：`role_status` / `session_tail` 两只读工具的桌面侧数据源。
    // B 批（2026-10-28）：chief 获得 role_status/session_tail（星形主链）与 role_activity_log。
    // D 批：运营不再有 role_status/session_tail；single/su 旧行为保留。
    const canObserve = legacyBuiltIn || governanceFunction === "chief";
    const roleStatus: RoleStatusFn | undefined =
      canObserve ? (query: RoleStatusPayload) => this.roleStatusText(req.projectRoot, query) : undefined;
    const contractCheck: ContractCheckFn | undefined =
      // B7.1：契约速查按**本会话**的 workflow 模式分流（fixed 视图不含 legacy run/pin 口径；
      // legacy/single 模式参数缺省路径逐字不变）。
      (input: ContractCheckInput) => this.contractCheckText(req.projectRoot, req.roleId, input, sessionWorkflowMode);
    // 2026-11-09（文档格式权威说明，方案 P1.2 §3.1/§4.1；B1 AC-9/AC-10）：`doc_format` 只读数据源——
    // **所有角色会话**（6 个内置治理角色 + 项目角色）与 `contractCheck` 同位无条件注入（项目角色走同一条
    // `openRoleSession` 路径，不依赖技能安装/动态 id 登记）。数据源 `docFormatText` 第一条语句静态早退到
    // 注册表（纯文本、零磁盘 IO、不读 run/项目/角色事实、不含角色差异）；`{ok,message}` 信封与 8 KiB
    // 防御性截断由运行时核心工具包装层统一生成（S1，与 `contract_check` 同型）。judge 会话（「替我审」/
    // 「替我决策」）与有界 Chief 决策会话**不经过**本输入对象（见各自独立构造），工具集逐字不变。
    const docFormat: DocFormatFn =
      (input: DocFormatInput) => this.docFormatText(req.projectRoot, req.roleId, input);
    const evidenceCheck: EvidenceCheckFn | undefined =
      (input: EvidenceCheckInput) => this.evidenceCheckText(req.projectRoot, req.roleId, input);
    const sessionTail: SessionTailFn | undefined =
      canObserve ? (query: SessionTailPayload) => this.sessionTailText(req.projectRoot, query) : undefined;
    const roleActivityLog: RoleActivityLogFn | undefined =
      governanceFunction === "chief"
        ? (query: RoleActivityLogPayload) => this.roleActivityLogText(req.projectRoot, query)
        : undefined;
    // B 批：终止/安全重派动作（只给幕僚）。工具层只转达载荷/回执；校验/执行/安全分类在本层。
    const terminateRoleRun: TerminateRoleRunFn | undefined =
      governanceFunction === "chief"
        ? async (payload) => {
            const runtime = this.findLiveRuntime(req.projectRoot, payload.roleId) ?? req.runtime;
            const caller = this.sessions.get(this.sessionKey(req.projectRoot, req.roleId, req.runtime));
            const callerOrigin = caller?.origins.running;
            return this.terminateRoleRun({
              projectRoot: req.projectRoot,
              roleId: payload.roleId,
              runtime,
              ...(payload.taskId !== undefined ? { taskId: payload.taskId } : {}),
            }, caller && caller.handle === ctx.handle && callerOrigin ? { entry: caller, origin: callerOrigin } : undefined);
          }
        : undefined;
    const redispatchTaskCapability: RedispatchTaskFn | undefined =
      governanceFunction === "chief"
        ? async (payload) => this.redispatchTask({
            projectRoot: req.projectRoot,
            taskId: payload.taskId,
            ...(payload.to !== undefined ? { to: payload.to } : {}),
          })
        : undefined;
    // 2026-11-02（全局任务状态/版本决策）：project_state 给全部内置治理角色（含旧 su）只读；
    // project_note / request_version_decision 只给 trio chief。未注入 ⇒ 工具不注册（fail-closed）。
    const projectStateCapability: ProjectStateFn | undefined =
      role.builtIn === true
        ? (query) => this.projectStateTool(req.projectRoot, req.roleId, query)
        : undefined;
    const projectNoteCapability: ProjectNoteFn | undefined =
      governanceFunction === "chief"
        ? (noteInput) => this.projectNote({ projectRoot: req.projectRoot, roleId: req.roleId, input: noteInput })
        : undefined;
    const requestVersionDecisionCapability: RequestVersionDecisionFn | undefined =
      governanceFunction === "chief"
        ? (versionInput, signal) => this.requestVersionDecision({
            projectRoot: req.projectRoot,
            roleId: req.roleId,
            runtime: req.runtime,
            request: versionInput,
            ...(signal !== undefined ? { signal } : {}),
          })
        : undefined;
    // G-4/I3（2026-10-16 客户批准；同 H-1/G-2 先例）：**技能安装/卸载能力**——评审 §5.6：仅
    // `governanceFunction === "nomination"`（Nominator）；single/su 保留旧行为。「未注入即不注册」=
    // 最强 fail-closed（项目角色零感知）。工具 handler 只把 `{roleId,name}` 载荷交进来；
    // 护栏/校验/激活/回执/系统行全在本层（`applySkillChange`）。
    const installationBinding: { handle?: RoleSessionHandle } = {};
    const scopedInstallation = (toolName: InstallationCapabilityTool): InstallSkillFn => {
      const bindingId = randomUUID();
      return async (payload, metadata) => {
        const boundHandle = installationBinding.handle;
        const entry = this.sessions.get(key);
        const origin = boundHandle && entry?.handle === boundHandle ? entry.origins.running : undefined;
        const stillCurrent = () => !!entry && !!origin && entry.handle === boundHandle && this.sessions.get(key) === entry &&
          entry.busy && entry.origins.running === origin && !origin.settled &&
          !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted &&
          (!metadata || metadata.turnId === origin.turnId && (!metadata.roleId || metadata.roleId === req.roleId) &&
            (!metadata.runtime || metadata.runtime === req.runtime));
        const stillUnmanaged = async () => {
          if (!stillCurrent()) return false;
          try {
            const scope = await readRoleCapabilityProtectionScope({ projectRoot: req.projectRoot });
            return scope.state === "unmanaged" && stillCurrent();
          } catch { return false; }
        };
        const refuse = () => this.refuseUnprovenInstallation(bindingId, toolName, req.projectRoot, req.roleId,
          req.runtime, boundHandle, metadata);
        if (!(await stillUnmanaged())) return refuse();
        const action = toolName === "uninstall_skill" || toolName === "uninstall_mcp" ? "uninstalled" : "installed";
        const result = toolName === "install_skill" || toolName === "uninstall_skill"
          ? await this.applySkillChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged)
          : await this.applyMcpChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged);
        return !result.ok && result.reason === "effect-scope-unproven" ? refuse() : result;
      };
    };
    // Fresh scope is only a compatibility selector; protected/unknown effects use Core's identity-bound gate.
    // Ordinary desktop observations never substitute for that authoritative callback binding.
    const installSkill: InstallSkillFn | undefined = canNominate ? scopedInstallation("install_skill") : undefined;
    const uninstallSkill: UninstallSkillFn | undefined = canNominate ? scopedInstallation("uninstall_skill") : undefined;
    // G-4 V2（2026-10-16 客户批准；同处注入）：**外来 MCP 安装/卸载能力**——与技能两工具**逐字同构**
    // （仅 nomination；「未注入即不注册」）；护栏/校验（声明）/激活/回执/系统行全在本层（`applyMcpChange`）。
    const installMcp: InstallMcpFn | undefined = canNominate ? scopedInstallation("install_mcp") : undefined;
    const uninstallMcp: UninstallMcpFn | undefined = canNominate ? scopedInstallation("uninstall_mcp") : undefined;

    // (a) 操作者确认通道（I-1 arm）：项目角色 → 编排装配 (c)/(b)/(a) 三层链；
    // **全部内置治理角色**（`role.builtIn === true`）→ 经下方 `shellOperatorOnly` 装配**审批档**。
    // 通道**每会话闭包绑定** roleId/projectRoot/runtime 与本轮 signal（裁决与卡片都按该会话归档）。
    const interactionState = { lifetime: new AbortController(), turn: new AbortController() };
    let shellOperatorChannel: OperatorChannelFn | undefined;
    if (this.deps.shellOperatorChannel) {
      const channel = this.deps.shellOperatorChannel;
      // **「替我审」metadata（PM 评审 §5.2/§6.5）**：`turnText` 与 `judge` 在**调用当刻**从活会话条目读取
      // （开关开/关由通道的 `isEnabled` 决定；这里只提供事实）。会话已销毁 ⇒ 两者皆缺省，通道回原 present。
      shellOperatorChannel = (prompt) => {
        const live = this.sessions.get(key);
        return channel(prompt, {
          roleId: req.roleId,
          projectRoot: req.projectRoot,
          runtime: req.runtime,
          signal: interactionState.turn.signal,
          ...(live?.lastUserText !== undefined ? { turnText: live.lastUserText } : {}),
          ...(live?.shellJudge !== undefined ? { judge: live.shellJudge } : {}),
        });
      };
    }

    // I-1 补丁（2026-10-12，客户重发授权）：**(c) 规则集实件**（`classifyShell` + `rules`）——仅**项目角色**
    // 走三层链（内置治理角色不自审）。缺省 ⇒ 编排对「规则集未注入」一律拒绝（fail-closed，绝不放宽）。
    const shellArming = role.builtIn === true ? undefined : this.deps.shellArming;

    // 2026-10-31（shell 判拒升级方案 v1.3 §4.6/§6.4）：**升级卡呈现端**——应用级 presenter（每窗口一个）+
    // **每会话信号包装**：并入会话生命周期（dispose/重建）与当前轮（stop/abort）中止信号，
    // 会话终止/重建/轮次中止时挂起升级卡即时失效（默认拒绝，fail-closed；方案 §9 不变量 1/AC-06）。
    // 缺省 ⇒ 不传 ⇒ 编排不创建 registry、升级工具不注册（能力缺席 = fail-closed）。
    const escalationPresenter = this.deps.shellEscalationPresenter;
    const shellEscalationPresenter: ShellEscalationPresentFn | undefined =
      escalationPresenter === undefined
        ? undefined
        : (request: ShellEscalationCardRequest, signal?: AbortSignal) => {
            const parts: AbortSignal[] = [interactionState.lifetime.signal, interactionState.turn.signal];
            if (signal !== undefined) parts.push(signal);
            return escalationPresenter(request, AbortSignal.any(parts));
          };

    // **内置治理角色审批档（客户裁定 2026-10-17；2026-10-19 新规则「所有角色都有 shell 权限，包括读写，
    // 以及任何需要命令的权限，只不过都要提交审批」扩至全部内置治理角色）**：**全部 `role.builtIn === true`
    // 的会话**（single 的 su 与 trio 五人）把 **(c) 实件 + (a) 通道**（均与项目角色同一份 deps 引用——单一
    // 来源、永不漂移）经 `shellOperatorOnly` 交给编排装配审批档：
    //   · (c)=allow（只读白名单）⇒ 直接放行、**0 卡**；
    //   · `risky`/`review`/`deny` ⇒ 客户/判断 agent 逐条审批（deny 也可被批准）；拒绝/超时/不可用 = 拒绝。
    // **缺件（deps.shellArming 或 deps.shellOperatorChannel 缺省）⇒ 不传 ⇒ 不 arm**（能力缺席 = fail-closed）。
    // 内置治理角色**绝不**同时注入旧只读档（`shellReadonly`）——编排对两档并存互斥拒绝；只读档桌面不再注入。
    const shellOperatorOnly =
      role.builtIn === true && this.deps.shellArming && shellOperatorChannel
        ? {
            classifyShell: this.deps.shellArming.classifyShell,
            rules: this.deps.shellArming.rules,
            operatorChannel: shellOperatorChannel,
          }
        : undefined;

    // pi 路径把 arm 接缝（shellGate，缺省 undefined = 不 arm）透传给编排的真实适配器工厂
    // （`createPiAdapterFactory(project, shellGate?)` 是编排已冻结的签名，此处不发明新形状）。
    // undefined ⇒ Pi 适配器不注册 run_shell（§7.5.1）。demo 路径无 shell 入口，与本接缝无关。
    ctx.submitVersionChangeCapability = submitVersionChangeCapability;
    ctx.submitRefactorCapability = submitRefactorCapability;
    ctx.reportPlanEscalationCapability = reportPlanEscalationCapability;
    ctx.requestStableWriteCapability = requestStableWriteCapability;
    ctx.requestRequirementChange = requestRequirementChange;
    ctx.roleStatus = roleStatus;
    ctx.contractCheck = contractCheck;
    ctx.docFormat = docFormat;
    ctx.evidenceCheck = evidenceCheck;
    ctx.sessionTail = sessionTail;
    ctx.roleActivityLog = roleActivityLog;
    ctx.terminateRoleRun = terminateRoleRun;
    ctx.redispatchTaskCapability = redispatchTaskCapability;
    ctx.projectStateCapability = projectStateCapability;
    ctx.projectNoteCapability = projectNoteCapability;
    ctx.requestVersionDecisionCapability = requestVersionDecisionCapability;
    ctx.installationBinding = installationBinding;
    ctx.installSkill = installSkill;
    ctx.uninstallSkill = uninstallSkill;
    ctx.installMcp = installMcp;
    ctx.uninstallMcp = uninstallMcp;
    ctx.interactionState = interactionState;
    ctx.shellOperatorChannel = shellOperatorChannel;
    ctx.shellArming = shellArming;
    ctx.shellEscalationPresenter = shellEscalationPresenter;
    ctx.shellOperatorOnly = shellOperatorOnly;
  }

  /** assembleToolSurface：openInternalUnsafe 连续块（源 2543–2956；映射见 change 记录）。 */
  private async assembleToolSurface(ctx: OpenContext): Promise<OpenResult | undefined> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, project, role, boundary, governanceModel, governanceFunction, sessionWorkflowMode, legacyOnlyCapabilitiesAllowed, customerInput, writeBoundary, mirrorRoleIdFor, dispatchTask, viewImage, canPresentAppRunChange, versionChangeStack, direct, closeCreatedTask, closeCreatedTaskFixed, submitVersionChangeCapability, submitRefactorCapability, reportPlanEscalationCapability, requestStableWriteCapability, requestRequirementChange, roleStatus, contractCheck, docFormat, evidenceCheck, sessionTail, roleActivityLog, terminateRoleRun, redispatchTaskCapability, projectStateCapability, projectNoteCapability, requestVersionDecisionCapability, installationBinding, installSkill, uninstallSkill, installMcp, uninstallMcp, interactionState, shellOperatorChannel, shellArming, shellEscalationPresenter, shellOperatorOnly, gitBinding, planBinding, routineShellPolicy, dispatchBinding, currentGitRuntime } = ctx;
    let createAdapter: RuntimeAdapterFactory;
    let profileRevision = this.profileRevision(req.runtime);
    try {
      await this.deps.prepareRuntimeProfile?.(req.runtime);
      profileRevision = this.profileRevision(req.runtime);
      // 2026-11-04 trunk-amendment-model D1：stable 写入的 **post-write 复核钩子**（F16）。
      // write/edit 成功后由运行时核心调用（同一 `versionedDocAfterWrite` 接缝，先保留既有 R9 登记语义）：
      // · 版本登记返回 false ⇒ 维持原回退语义；
      // · stable 路径且存在候选许可 ⇒ `completeWrite(actualSha)` 复核/消费/mini re-pin（桌面不写盘）。
      const baseAfterWrite = this.deps.runtimeOptions?.versionedDocAfterWrite;
      const stableAfterWrite =
        versionChangeStack === undefined
          ? undefined
          : async (absPath: string): Promise<boolean | void> => {
              if (baseAfterWrite !== undefined) {
                const registered = await baseAfterWrite(absPath);
                if (registered === false) return false;
              } else {
                const registered = await registerVersionedDocumentAfterWrite({
                  projectRoot: req.projectRoot,
                  absPath,
                  recordedBy: "app:session",
                });
                if (registered === false) return false;
              }
              await this.afterStableWrite(versionChangeStack, req.projectRoot, req.roleId, req.runtime, absPath);
              return true;
            };
      const sessionRuntimeOptions =
        stableAfterWrite === undefined
          ? this.deps.runtimeOptions
          : { ...this.deps.runtimeOptions, versionedDocAfterWrite: stableAfterWrite };
      if (this.deps.createRuntimeAdapterFactory) {
        createAdapter = this.deps.createRuntimeAdapterFactory(project, req.runtime, { ...sessionRuntimeOptions, shellGate: this.deps.shellGate });
      } else if (req.runtime === "pi") {
        createAdapter = this.deps.createPiAdapterFactory(project, this.deps.shellGate);
      } else if (req.runtime === "demo") {
        createAdapter = (gate) => this.deps.createDemoAdapter({ gate, boundary });
      } else {
        createAdapter = createRuntimeAdapterFactory(project, req.runtime, sessionRuntimeOptions);
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    // **「替我审」每会话判断闭包（PM 评审 §5.1/§6.3）**：用**同一份** `runtimeOptions` 与上面已构造的
    // `createAdapter` 工厂交给编排 `createShellJudge`（判断跟随请求会话引擎，不跨引擎）。构造失败 ⇒ 不注入
    // （能力缺席，通道回原 present——fail-closed，绝不擅自放行）。闭包随会话条目销毁一并清除。
    let shellJudge: ShellJudgeFn | undefined;
    if (this.deps.createShellJudge !== undefined) {
      try {
        shellJudge = this.deps.createShellJudge({
          project,
          runtime: req.runtime,
          runtimeOptions: this.deps.runtimeOptions,
          createAdapter,
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error("shell-judge.driver.failed", error);
        shellJudge = undefined;
      }
    }
    // **「替我审批/决策」每会话判断闭包（2026-10-18 双开关评审 §8.2）**：只在 trio 且本会话确实接入
    // 客户交互通道时构造（single/su 与 Liaison 不注入——不判断、不产生模型调用）。用**同一份**
    // `runtimeOptions` 与 `createAdapter`（判断跟随请求会话引擎，不跨引擎）。构造失败 ⇒ 不注入
    // （能力缺席，通道回落原卡——fail-closed）。闭包随会话条目销毁一并清除。
    // 2026-11-04（download-requests W-2）：下载能力可用的**项目角色**也要构造 judge 闭包（下载卡可到
    // 判断器），但**不改变** `customerInput` 注入判据——项目角色仍无 request_confirmation/request_choice。
    const takeDownloadDirective = this.deps.getDownloadDirectiveConsumer?.(req.projectRoot);
    const downloadCapable =
      this.deps.createDownloadRuntime !== undefined &&
      this.deps.downloadAppVersion !== undefined &&
      this.deps.customerInput !== undefined &&
      takeDownloadDirective !== undefined;
    let governanceJudge: GovernanceJudgeFn | undefined;
    if (governanceModel === "trio" && (customerInput !== undefined || downloadCapable) && this.deps.createGovernanceJudge !== undefined) {
      try {
        governanceJudge = this.deps.createGovernanceJudge({
          project,
          runtime: req.runtime,
          runtimeOptions: this.deps.runtimeOptions,
          createAdapter,
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error("governance-judge.driver.failed", error);
        governanceJudge = undefined;
      }
    }
    const chiefDecision: ChiefDecisionHost | undefined = governanceModel !== "trio" ? undefined : {
      prepare: async (request, metadata) => {
        if (this.deps.prepareChiefDecisionEvidence === undefined) throw new Error("幕僚决策材料准备能力不可用；保留请求等待接管");
        return this.deps.prepareChiefDecisionEvidence({ projectRoot: req.projectRoot, originRoleId: req.roleId, request, metadata });
      },
      execute: async (context, evidence, decidePendingRequest, signal) => {
        if (signal.aborted || interactionState.lifetime.signal.aborted) throw new Error("幕僚委托已撤销");
        // Independent handle, same trusted project/runtime adapter. Never enters the busy chief's queue.
        const boundedSignal = AbortSignal.any([signal, interactionState.lifetime.signal, AbortSignal.timeout(context.limits.timeoutMs)]);
        let handle: RoleSessionHandle | undefined;
        const stop = () => { void handle?.abort?.().catch(() => undefined); };
        let cancelled: (() => void) | undefined;
        const aborted = new Promise<never>((_, reject) => {
          cancelled = () => { stop(); reject(new Error("幕僚独立决策已取消或达到预算")); };
          boundedSignal.addEventListener("abort", cancelled, { once: true });
          if (boundedSignal.aborted) cancelled();
        });
        const opening = this.openObservedRoleSession({ roleId: "chief", project, runtime: req.runtime,
          chiefDecisionContext: context, decidePendingRequest }, { createAdapter });
        void opening.then(late => { if (boundedSignal.aborted && handle !== late) void this.disposeObservedHandle(late).catch(() => undefined); }, () => undefined);
        try {
          handle = await Promise.race([opening, aborted]);
          if (boundedSignal.aborted) throw new Error("幕僚委托已撤销");
          const consume = (async () => { for await (const _event of handle!.events()) { /* isolated decision stream */ } })();
          void consume.catch(() => undefined);
          await Promise.race([handle.send(JSON.stringify({ request: context.request, evidence })), aborted]);
        } finally {
          if (cancelled !== undefined) boundedSignal.removeEventListener("abort", cancelled);
          if (handle !== undefined) await this.disposeObservedHandle(handle);
        }
      },
    };
    // 客户卡通道路由上下文（客户交互通道与需求变更审批卡**共用同一份**构造）：judge 闭包与 turnText
    // 在调用当刻从活会话条目读取（会话已销毁 ⇒ 缺省，通道不判断）；`metadata` 由调用方原样透传。
    const buildCustomerInputContext = (
      request: CustomerInputRequest,
      extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string },
    ): Parameters<DesktopCustomerInputFn>[1] => {
      const mirrorRoleId = mirrorRoleIdFor(request);
      const live = this.sessions.get(key);
      const judge = live?.governanceJudge ?? governanceJudge;
      const turnText = live?.lastUserText;
      return {
        roleId: req.roleId,
        runtime: req.runtime,
        projectRoot: req.projectRoot,
        sessionSignal: interactionState.lifetime.signal,
        governanceModel,
        ...(mirrorRoleId !== undefined ? { mirrorRoleId } : {}),
        ...(judge !== undefined ? { governanceJudge: judge } : {}),
        ...(chiefDecision !== undefined ? { chiefDecision } : {}),
        ...(typeof turnText === "string" && turnText !== "" ? { turnText } : {}),
        // 写盘确认的应用层兜底（2026-10-25 客户新规则）：本会话的 Section 1 快照 +
        // resolveWrite 的 skill 根（同一份 ProjectConfig）。缺省 ⇒ 通道不做预授权判定。
        ...(writeBoundary !== undefined ? { writeBoundary, skillRoot: project.skillRoot } : {}),
        ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
        ...(extras?.acceptanceReport !== undefined ? { acceptanceReport: extras.acceptanceReport } : {}),
        ...(extras?.judgeNotice !== undefined ? { judgeNotice: extras.judgeNotice } : {}),
      };
    };
    // 2026-11-04 下载申请（download-requests C1/F2）：每会话一份 B1 运行时；presenter 复用窗口级
    // 原始客户通道 + `withRequestLifecycle`（request.* 只在卡片路径），`downloadId` 由 B1 生成。
    let downloadRuntime: DownloadRequestRuntime | undefined;
    let requestDownload: RequestDownloadFn | undefined;
    if (downloadCapable && this.deps.customerInput !== undefined && takeDownloadDirective !== undefined) {
      const windowCustomerInput = this.deps.customerInput;
      const manager = this.host;
      const presenter: DownloadApprovalPresenter = {
        async present(downloadRequest: DownloadApprovalRequest, hooks): Promise<DownloadApprovalOutcome> {
          const card = buildDownloadCardRequest(downloadRequest);
          const requestId = manager.requestIdFor(req.projectRoot, req.roleId, card.request, card.metadata);
          let presentedNotified = false;
          const notifyPresented = (): void => {
            if (presentedNotified) return;
            presentedNotified = true;
            try {
              hooks.onPresented({ requestId });
            } catch (error) {
              createDiagnosticLogger({ component: "desktop.download", projectRoot: req.projectRoot, roleId: req.roleId }).error(
                "download.presented-callback.failed",
                error,
              );
            }
          };
          const signals: AbortSignal[] = [];
          if (downloadRequest.signal !== undefined) signals.push(downloadRequest.signal);
          signals.push(interactionState.lifetime.signal);
          const signal = AbortSignal.any(signals);
          let outcome: CustomerInputOutcome | null | undefined;
          try {
            outcome = await manager.withRequestLifecycle(
              req.projectRoot,
              req.roleId,
              card.request,
              card.metadata,
              (request, context, metadata) => windowCustomerInput(request, context, metadata),
              (request, extras) => buildCustomerInputContext(request, extras),
              requestId,
              {
                signal,
                ...(card.judgeNotice !== undefined ? { judgeNotice: card.judgeNotice } : {}),
                onPresented: notifyPresented,
              },
            );
          } catch (error) {
            createDiagnosticLogger({ component: "desktop.download", projectRoot: req.projectRoot, roleId: req.roleId }).error(
              "download.card.failed",
              error,
            );
            return { decision: "unavailable", reason: "download-card-failed" };
          }
          return toDownloadApprovalOutcome(outcome);
        },
      };
      try {
        downloadRuntime = this.deps.createDownloadRuntime!({
          projectRoot: req.projectRoot,
          roleId: req.roleId,
          runtime: req.runtime,
          appVersion: this.deps.downloadAppVersion!,
          present: presenter,
          takeDownloadDirective,
        });
        requestDownload = createRequestDownloadCapability({
          runtime: downloadRuntime,
          runtimeKind: req.runtime,
          roleId: req.roleId,
          lifetimeSignal: interactionState.lifetime.signal,
          emitNotice: (summary) => this.emitDeliveryNote(req.projectRoot, req.runtime, req.roleId, req.roleId, summary),
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "download.runtime.failed",
          error,
        );
        downloadRuntime = undefined;
        requestDownload = undefined;
      }
    }
    let handle: RoleSessionHandle;
    try {
      // scope 传 undefined：聊天无预先任务，授权上界 = 角色边界本身（门禁引擎据此不做 F4 收窄）。
      //
      // **会话路径裁决（T30）：沿用 `openRoleSession` + `scope: undefined`，不改走 `openGovernanceSession`。**
      // 理由（§12.2）：创世的门口放在**边界选择层**（`genesisBootstrap`，由 `buildProjectConfig` 按
      // `hasRoles` 设），`scope` 保持 `undefined`（普通聊天）——本层只把「未 bootstrap」这一授权事实经
      // `genesisBootstrap` 交给门禁引擎。`openRoleSession` 本就是 `openGovernanceSession` 内部**同样经其
      // 开启会话**的**同一底层会话入口**（`govern-session.ts:170`），**不是第二套会话机制**。
      //
      // 更正（2026-10-12）：原 T30 理由已过时——「对空项目产出 `writeSet: []`、F4 精确匹配拒一切写，
      // 要让它表达 `scope: undefined` 须改它本身；且开会话前先经 `writeGovernanceSkeleton` 落骨架
      // （属 T32 待退役面）」**已全部失效**：预建骨架随 T32 退役（模块 `src/common/编排/bootstrap.ts`
      // 已删），引擎现于 `conditions`/`writeSet` 均空时把 scope 收窄为 `undefined`（权威表述见
      // `src/pipeline/orchestration/govern-session.ts` 的 `effectiveScope` 处，本层不复制）。
      // 桌面是否统一改走该入口：另行评估（更正记录见
      // `角色卡/桌面应用/docs/change/2026-10-12_change_session-comment-refresh.md`）。
      if (stopped()) return stoppedResult();
      handle = await this.openObservedRoleSession(
        {
          roleId: req.roleId,
          ...(req.taskId ? { taskId: req.taskId } : {}),
          runtime: req.runtime,
          project,
          // T3（2026-11-10 两条固定工作流路径，B1 AC-12）：run-role 在每次卡/任务/写门禁按实际 flowId
          // 现场解析模式（回调不缓存项目级单值；fixed 会话的模块 context/工具注入由 run-role 同源执行）。
          // single/su 会话不注入（旧行为逐字不变；固定路径为 trio 产品流程）。
          ...(governanceModel === "trio" ? { workflowModeForFlow: workflowModeForFlowResolver(req.projectRoot) } : {}),
          // T3 B6.1（2026-11-11）：fixed 会话另传**会话级常量**（run-role 的 `workflowMode` 优先级最高）——
          // 无 taskId 的 fixed 聊天（空项目首条客户消息）也能注入 fixed 模块 context/`chief-workflow-v2.md`/
          // fixed 工具面（RR 根因修复）。legacy/single 不传本键：per-flow `workflowModeForFlow` 现场解析与
          // 旧注入面逐字不变（常量 legacy 会吞掉混合项目的 per-flow 判定，故不做无条件传入）。
          ...(sessionWorkflowMode === "fixed" ? { workflowMode: sessionWorkflowMode } : {}),
          // T3 B4.2（2026-11-10，AC-21/T-09）：fixed 会话注入任务级 Git 写（分类器 + 真实端口）。
          // 仅「trio 项目 + 该任务真实 flow 解析为 fixed + 带真实 taskId」时注入；legacy/single 会话
          // 不传本字段（注入面/行为逐字不变）。桌面只给「实现」——**不传 scope/taskId 事实**：scope 由
          // 编排从 task.created + basis/`change.scope-decided` 解析（桌面不采信模型自报），不可解析 ⇒
          // 编排不注入 scope ⇒ `git add`/`git commit` 一律拒（fail-closed）。端口 `acquireCriticalSection`
          // 与 B3 发布合并共用同一把项目级锁（`acquireProjectGitCriticalSection` 同一实现）。
          ...(sessionWorkflowMode === "fixed" && req.taskId !== undefined
            ? { taskGit: buildFixedTaskGitSurface(req.projectRoot) }
            : {}),
          ...(routineShellPolicy ? { routineShellPolicy } : {}),
          // 客户交互通道（A-5）：仅内置治理角色（su / trio 三人）会话注入；Liaison 不注入（§4.3）。
          // **每会话闭包绑定 roleId**（请求本体不带角色标识——渲染侧据它把交互卡落到该角色的聊天流、
          // 点亮 B-3「等待你确认」）。**镜像面**（§6.1）：trio 治理决定卡额外带 `mirrorRoleId=主入口`，
          // 同一请求 id、同一份 pending、只答一次——不是第二个请求。普通角色逐字不传。
          ...(customerInput
            ? {
                customerInput: async (r: CustomerInputRequest, metadata?: CustomerInputMetadata) => {
                  // AC-13（D2）：stable boundary 确认卡——用 S7 API 检测 preview 正文扩大；
                  // 扩大 ⇒ 卡面横幅 + required acknowledgments；不可解析 ⇒ 不呈现、结构化拒绝。
                  let effectiveRequest = r;
                  if (versionChangeStack !== undefined && r.cardKind === "appointment-write") {
                    const enriched = await this.enrichAppointmentWriteBoundaryCard(
                      versionChangeStack,
                      req.projectRoot,
                      r,
                    );
                    if (enriched.kind === "reject") {
                      void this.appendRoleActivity(req.projectRoot, req.roleId, {
                        kind: "request.rejected",
                        summary: shortenSummary(enriched.reason, 200),
                        status: "not-presented",
                      });
                      this.emitDeliveryNote(req.projectRoot, req.runtime, req.roleId, req.roleId, enriched.reason);
                      return { outcome: "declined", notPresented: true, reason: enriched.reason };
                    }
                    effectiveRequest = enriched.request;
                  }
                  const outcome = await this.withRequestLifecycle(
                    req.projectRoot,
                    req.roleId,
                    effectiveRequest,
                    metadata,
                    (request, context, meta) => customerInput(request, context, meta),
                    (request, extras) => buildCustomerInputContext(request, extras),
                  );
                  // 2026-11-04 trunk-amendment-model D1 / F16 + D2/AC-13：appointment-write 确认后
                  // **只签发** role-card/boundary 的一次性 stable 许可（正文取自确认卡 preview 的逐路径正文）；
                  // 真实写入仍由角色 write_file/edit_file 经 run-role gate 执行——桌面无直接写盘路径。
                  // 扩大检测要求的 acknowledgments 未齐 ⇒ 不签发任何许可（fail-closed）。
                  if (versionChangeStack !== undefined && r.cardKind === "appointment-write") {
                    await this.afterAppointmentWriteApproved(
                      versionChangeStack,
                      req.projectRoot,
                      req.roleId,
                      req.runtime,
                      effectiveRequest,
                      outcome,
                    );
                  }
                  return outcome;
                },
              }
            : {}),
          // 2026-11-04 trunk-amendment-model D1：run-role gate 的同步候选许可（C2b 快照仍为判定权威）。
          // T3 B1（AC-23）：fixed 会话不注入 stable 许可（stable-write 机制 compat-only，默认路径不触达）。
          ...(versionChangeStack !== undefined && legacyOnlyCapabilitiesAllowed
            ? { stablePermitOf: (rel: string) => versionChangeStack.stablePermitOf(rel) }
            : {}),
          // Batch 3.5（C1d/S5）：三提交能力（角色门控在本层；run-role 二次门控；只提交不批准）。
          // T3 B1（AC-23）：fixed 会话不注入 legacy Git 治理三段式能力（注入面 = 最强 fail-closed）。
          ...(legacyOnlyCapabilitiesAllowed
            ? {
                gitQuery: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitQuery(input, signal) : gitContextFailure(input.operationId, current); },
                gitCandidate: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitCandidate(input, signal) : gitContextFailure(input.operationId, current); },
                gitPublish: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitPublish(input, signal) : gitContextFailure(input.operationId, current); },
              }
            : {}),
          ...(legacyOnlyCapabilitiesAllowed && direct !== undefined && req.roleId === "rapporteur" ? { selectRunChange: (input, signal) => input.mode === "continue-frozen"
            ? direct.selectRunChange(input, signal) : this.selectRunChangeForHandle(req.projectRoot, req.runtime, gitBinding.handle, input, signal) } : {}),
          // T3 B3（AC-15/AC-16）：fixed 会话的 `complete_team_plan` v4 走应用服务
          // （completeTeamPlanFixed + 真实 BaselineGitPort；git init/.gitignore/任务分支/dirty/basis）；
          // legacy 会话逐字保留 direct 实现（runId 绑定不变）。
          // B29（2026-11-11）：fixed 注入实现返回 **fixed 服务形状**（工具层按入参 workflowId+plan 分流到
          // B25 `fixedCompleteTeamPlanReceiptResult`）；注入位类型仍是 legacy `CompleteTeamPlanFn`（共享
          // 同一能力位），运行时形状由工具层校验——故此处显式断言，legacy 分支零改动。
          ...(direct !== undefined && req.roleId === "convener" ? {
            completeTeamPlan: sessionWorkflowMode === "fixed"
              ? ((input: Parameters<CompleteTeamPlanFn>[0], planSignal?: AbortSignal) =>
                  this.completeTeamPlanFixedForHandle(req.projectRoot, req.runtime, planBinding.handle, input, planSignal)) as unknown as CompleteTeamPlanFn
              : (input, signal) => this.completeTeamPlanForHandle(req.projectRoot, req.runtime, planBinding.handle, input, direct, signal),
          } : {}),
          ...(direct !== undefined && req.roleId === "nominator" ? { activateRoleDocuments: direct.activateRoleDocuments } : {}),
          ...(closeCreatedTask !== undefined ? { closeCreatedTask } : {}),
          // T3 B3（AC-18/AC-20）：fixed 会话的 `close_created_task` v2 应用实现（补 artifacts/branchTipOid/
          // acceptanceArchive 证据；A12b accepted 时应用生成 `docs/acceptance/*`）；legacy 不注入本键。
          ...(closeCreatedTaskFixed !== undefined ? { closeCreatedTaskFixed } : {}),
          ...(legacyOnlyCapabilitiesAllowed && submitVersionChangeCapability ? { submitVersionChange: submitVersionChangeCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && submitRefactorCapability ? { submitRefactor: submitRefactorCapability } : {}),
          ...(reportPlanEscalationCapability ? { reportPlanEscalation: reportPlanEscalationCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && requestStableWriteCapability ? { requestStableWrite: requestStableWriteCapability } : {}),
          // 2026-11-04 下载申请（W-1）：每会话能力；未注入 ⇒ 编排/运行时核心不注册 `request_download`。
          ...(requestDownload ? { requestDownload } : {}),
          // H-1：派发能力（仅 su 会话注入；契约字段名 `dispatchTask`——编排落地后由其转发给适配器）。
          ...(dispatchTask ? { dispatchTask } : {}),
          // 2026-10-26 view_image：全部角色会话注入（目标已定格＝本会话）；编排原样转交运行时核心。
          viewImage,
          // 2026-10-26 需求变更申请（request_requirement_change，仅统筹/提案会话注入；其余角色不注入）。
          // 「未注入即不注册」——编排再按 governanceFunction 收口。提交申请 ≠ 批准（审批在 decision 卡）。
          ...(requestRequirementChange ? { requestRequirementChange } : {}),
          // 2026-11-02（全局任务状态/版本决策）：三能力均「注入才注册」；project_state 给全部内置治理角色，
          // project_note / request_version_decision 仅 chief（编排 run-role 再按 trioSpec 收口）。
          ...(projectStateCapability ? { projectState: projectStateCapability } : {}),
          ...(projectNoteCapability ? { projectNote: projectNoteCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && requestVersionDecisionCapability ? { requestVersionDecision: requestVersionDecisionCapability } : {}),
          ...(roleStatus ? { roleStatus } : {}),
          contractCheck,
          // 2026-11-09（文档格式权威说明）：`doc_format` 只读数据源（与 `contractCheck` 相邻、无条件注入——
          // 内置治理角色与项目角色全员可读；编排按 `contractCheck` 同条件透传，未注入 ⇒ 工具不注册）。
          docFormat,
          evidenceCheck,
          ...(sessionTail ? { sessionTail } : {}),
          // B 批（2026-10-28）：幕僚的运行日志只读数据面（仅 chief 注入；其余角色拿不到 role_activity_log）。
          ...(roleActivityLog ? { roleActivityLog } : {}),
          // B 批：终止/安全重派动作（仅 chief；「未注入即不注册」）。
          ...(terminateRoleRun ? { terminateRoleRun } : {}),
          ...(redispatchTaskCapability ? { redispatchTask: redispatchTaskCapability } : {}),
          // G-4/I3：技能安装/卸载能力（**仅 su 会话注入**——「未注入即不注册」；编排透传字段落地前
          // 被其静默忽略，零行为影响；落地后即点亮两工具，见 change 文档的依赖登记）。
          ...(installSkill ? { installSkill } : {}),
          ...(uninstallSkill ? { uninstallSkill } : {}),
          // G-4 V2：外来 MCP 安装/卸载能力（同款注入与登记）。
          ...(installMcp ? { installMcp } : {}),
          ...(uninstallMcp ? { uninstallMcp } : {}),
          // I-1：(a) 操作者确认通道——**项目角色**走 (c)/(b)/(a) 三层链（与下方 `shellArming` 同备）。
          // 内置治理角色不走此字段（其 (a) 通道在 `shellOperatorOnly` 内，见下）。
          ...(role.builtIn !== true && shellOperatorChannel ? { shellOperatorChannel } : {}),
          // I-1 补丁（2026-10-12，客户重发授权）：(c) 实件（classifyShell + defaultShellRules）——与 (a)
          // 同处装配（缺它 ⇒ 编排对「规则集未注入」一律拒绝——真机曾据此如实报「环境无 shell」）。
          ...(shellArming ? { shellArming } : {}),
          // **内置治理角色审批档（客户 2026-10-17 裁定、2026-10-19 扩至全部内置治理角色）**：
          // `role.builtIn === true` 且 (c)+(a) 同备时给出；缺件不传 ⇒ 不 arm（fail-closed，绝不放宽）。
          ...(shellOperatorOnly ? { shellOperatorOnly } : {}),
          // **旧只读档（`shellReadonly`）桌面不再注入**：内置治理角色统一走上方审批档，两档并存编排互斥拒绝。
          // 2026-10-31（判拒升级方案 v1.3 §6.4）：升级卡 presenter（每会话信号包装；缺省不传）。
          ...(shellEscalationPresenter ? { shellEscalationPresenter } : {}),
        },
        { createAdapter },
      );
      installationBinding.handle = handle;
      dispatchBinding.handle = handle;
      gitBinding.handle = handle;
      planBinding.handle = handle;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    ctx.profileRevision = profileRevision;
    ctx.shellJudge = shellJudge;
    ctx.governanceJudge = governanceJudge;
    ctx.downloadRuntime = downloadRuntime;
    ctx.buildCustomerInputContext = buildCustomerInputContext;
    ctx.handle = handle;
  }

  /** freezeBindings：openInternalUnsafe 连续块（源 2958–2980；映射见 change 记录）。 */
  private async freezeBindings(ctx: OpenContext): Promise<OpenResult | undefined> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, handle, role, project } = ctx;
    if (stopped()) { await this.disposeObservedHandle(handle); return stoppedResult(); }

    // O-1：**边界快照指纹**定格（角色边界文件 + 项目治理边界文件（若有）+ `.ans/project.json`）——
    // 这些文件都参与**开会话时**的边界解析（`buildEffectiveProjectConfig` + 门禁 `resolveBoundarySection`）；
    // 任一处内容哈希变化 ⇒ 本会话持有的规则集已陈旧（`boundaryDiff` 检出后作废重建，绝不让活会话用旧边界）。
    const boundaryPaths: string[] = [];
    if (typeof role.boundaryPath === "string" && role.boundaryPath !== "") {
      boundaryPaths.push(path.resolve(req.projectRoot, role.boundaryPath));
    }
    const govRel =
      project.governanceBoundary && typeof project.governanceBoundary.path === "string" ? project.governanceBoundary.path : "";
    if (govRel !== "") boundaryPaths.push(path.isAbsolute(govRel) ? govRel : path.resolve(req.projectRoot, govRel));
    boundaryPaths.push(path.resolve(req.projectRoot, ".ans", "project.json")); // 恒查（缺失记 `<missing>`——pin 刷新即变）
    const boundaryPrints: Record<string, string> = {};
    for (const f of boundaryPaths) boundaryPrints[path.relative(req.projectRoot, f)] = await filePrint(f);
    // **G-4 裁定⑤（2026-10-16 客户批准）**：该角色「已安装技能」参与文件（`SKILL.md`＋`install.md`）纳入
    // 同一快照——安装/卸载/编辑技能后，本会话在**既有检查点**（发言/续接/投递/su settle 扫描）检出
    // 「已安装技能集合」变化 ⇒ 作废重建（在跑不打断）——`next-session` 语义由此收敛为 settle 即生效。
    // 零技能 ⇒ 空集（无新增路径；既有指纹语义逐字不变）；推导防御失败（读目录异常）⇒ 按零处理不入表
    // （检查时还会重推导——彼时若可读，集合差照常触发重建）。
    const skillPaths = (await this.currentSkillPaths(req.projectRoot, req.roleId)) ?? [];
    for (const f of skillPaths) boundaryPaths.push(f);
    for (const f of skillPaths) boundaryPrints[path.relative(req.projectRoot, f)] = await filePrint(f);
    ctx.boundaryPaths = boundaryPaths;
    ctx.boundaryPrints = boundaryPrints;
    ctx.skillPaths = skillPaths;
  }

  /** postOpenWiring：openInternalUnsafe 连续块（源 2982–3063；映射见 change 记录）。 */
  private async postOpenWiring(ctx: OpenContext): Promise<OpenResult> {
    const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, role, project, config, requestedAssignment, governanceModel, governanceFunction, sessionWorkflowMode, customerInput, canPresentAppRunChange, versionChangeStack, interactionState, profileRevision, shellJudge, governanceJudge, downloadRuntime, buildCustomerInputContext, canSchedule, handle, boundaryPaths, boundaryPrints, skillPaths } = ctx;
    if (stopped()) { await this.disposeObservedHandle(handle); return stoppedResult(); }
    const entry: LiveSession = {
      handle,
      // T3 B10.1（2026-11-11，RR5）：fixed 任务会话（convener/product/verifier 等内置角色同样）必须记录
      // 真实受派任务 id——目标会话重绑判定、投递机同任务判定与执行清单的会话任务事实都依赖它。
      // legacy 条件的旧语义逐字不变（内置治理角色仅 verifier 记录；fixed 会话例外）。
      ...(req.taskId && (role.builtIn !== true || req.roleId === "verifier" || sessionWorkflowMode === "fixed") ? { assignedTaskId: req.taskId } : {}),
      ...(requestedAssignment ? { boundAssignment: requestedAssignment } : {}),
      origins: { byTurn: new Map() },
      roleId: req.roleId, runtime: req.runtime, profileRevision, interactionState,
      projectRoot: req.projectRoot,
      config,
      sessionWorkflowMode,
      lastUsed: ++this.lruClock,
      busy: false,
      // F-5-opt1：确认制判据与 `customerInput` 注入判据同处定格（仅内置治理角色且通道已接）。
      confirmGated: customerInput !== undefined,
      boundaryPaths,
      boundaryPrints,
      skillPaths,
      ...(shellJudge !== undefined ? { shellJudge } : {}),
      ...(governanceJudge !== undefined ? { governanceJudge } : {}),
      ...(downloadRuntime !== undefined ? { downloadRuntime } : {}),
      // 需求变更审批卡通道（2026-10-26 客户纠正；2026-10-31 run-change 触发扩展）：绑定本会话客户卡上下文
      // （roleId/signal/judge/turnText）与 `onPresented`；`application:true` 的 run-change 卡不借用角色发行槽位，
      // 但呈现面按治理会话收口（统筹/提案/幕僚），其他角色/项目角色不构造该通道。
      ...(customerInput !== undefined && canPresentAppRunChange
        ? {
            requirementChangeCard: async (
              request: CustomerInputRequest,
              metadata?: CustomerInputMetadata,
              onPresented?: () => void,
            ): Promise<CustomerInputOutcome> =>
              (await customerInput(
                request,
                buildCustomerInputContext(request, {
                  ...(onPresented !== undefined ? { onPresented } : {}),
                }),
                metadata,
              )) ?? { outcome: "unavailable", reason: "客户卡通道未返回结果（fail-closed）" },
          }
        : {}),
      // 2026-11-02（版本决策）：chief 的**原始**客户卡上下文（不含 request.* 生命周期）——
      // 只由 `requestVersionDecision` 经 `withRequestLifecycle` 包装使用，避免第二套审计链。
      // 2026-11-04 trunk-amendment D1：应用自有的 VCA/逐项/stable 卡同样经它 + `withRequestLifecycle`
      // 呈现（与 run-change 同一会话选择面 convener→rapporteur→chief；客户本人，不进判断器/委托/指令）。
      ...(customerInput !== undefined && canPresentAppRunChange
        ? { governedCardContext: buildCustomerInputContext }
        : {}),
    };
    this.sessions.set(key, entry);
    // 2026-11-04 trunk-amendment D1：会话打开即预加载冻结快照/重建许可快照（best-effort；
    // 失败只诊断，`trunk:state`/`doc-freeze:list` 会如实给出 cacheHealth，不阻塞会话）。
    if (versionChangeStack !== undefined) {
      void versionChangeStack.ensureInitialized().catch((error) => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "version-change.init.failed",
          error,
        );
      });
    }
    // 评审 §5.6：只记录**回交主人**（trio=Convener；single=su）的 runtime——看护向主人投递时择路用。
    if (canSchedule || governanceFunction === "chief") this.lastGovernanceRuntime.set(req.projectRoot, req.runtime);
    entry.unsubscribePersistence = entry.handle.onPersistenceChange?.(change => {
      if (this.sessions.get(key) !== entry || change.scope.roleId !== entry.roleId || change.scope.runtime !== entry.runtime) return;
      if (change.kind === 'report-save') this.mergeReportState(entry, undefined, change.state, change.reportId);
      else if (change.receipt) this.rememberReceipt(entry, change.receipt);
      this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change });
    });
    if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key; // 后台自动开启不抢活动角色
    // 状态准确性 / L-1：开好即外推**真实状态快照**（busy=false + 该角色既有队列摘要）——徽标/队列行据此准确。
    this.notifyRoleState(req.projectRoot, req.roleId, req.runtime);
    this.consume(key, entry);
    // LRU：超出上限先淘汰**最久未用**者（dispose；其界面历史由渲染层自持、切回时恢复并如实提示）。
    await this.evictBeyondLimit(key); // 正在开启的这一个不淘汰（见方法注释）
    // 客户裁定（2026-10-13）：**常规「已开启与角色 X 的会话…」欢迎提示删除**——聊天流不摆常规提示
    // （真机每次开会话/切角色都出现，被客户点名）。**异常提示保留**：contextWarning（渲染侧按
    // contextSource 如实分支）、O-1 边界重建行、投递失败/受阻行等均不受影响。
    // 投递机（E-1/H-1）：本会话开好后，尝试放行积压的投递（目标=本角色的队列；为空则 no-op）。
    this.noteWatchdogActivity(req.projectRoot, "session-open"); // G-2/W3：会话开 = 真实活动
    void this.drainQueue(req.projectRoot, req.roleId, req.runtime);
    return { ok: true, config, resumed: false, runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: entry.profileRevision, ...this.contextInfo(handle) };
  }
}
