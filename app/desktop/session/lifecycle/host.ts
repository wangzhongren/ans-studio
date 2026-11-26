// app/desktop/session/lifecycle/host.ts
// B7（2026-11-13）：lifecycle 子模块的宿主接口（由 `Lifecycle`（./index.ts）实现）。
// 方法签名逐字取自门面 SessionManager 的现行声明（仅去可见性/async 修饰、默认参数改为可选——
// 调用语义由实现侧默认值保持）；状态访问器与门面同名同实例（方案 §3.6）。仅类型面，无运行时。
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import type { ChiefDecisionExecutionContext, DecidePendingRequestFn, SelectRunChangeFn, CompleteTeamPlanFn, ActivateRoleDocumentsFn, CloseCreatedTaskFn, FixedCloseCreatedTaskFn, GitQueryFn, GitCandidateFn, GitPublishFn, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts, TaskWorkSourceRef } from "../../../../src/model/runtime.ts";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { OrchestrationEvent, HandbackEvent } from "../../../../src/common/编排/handback.ts";
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
import {
  PROJECT_NOTE_BLOCKER_TEXT_MAX,
  PROJECT_NOTE_KEY_MAX,
  PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY,
  PROJECT_NOTE_NEXT_STEP_TEXT_MAX,
  PROJECT_NOTE_REFS_MAX,
  PROJECT_STATE_SCHEMA,
  VERSION_DECISION_SCHEMA,
  type ProjectNoteInput,
  type ProjectNoteResult,
  type ProjectStateDocKind,
  type ProjectStateToolResult,
  type ProjectStateView,
  type VersionDecisionErrorCode,
  type VersionDecisionDecidedBy,
  type VersionDecisionFacts,
  type VersionDecisionRequest,
  type VersionDecisionResult,
} from "../../../../src/model/project-state.ts";
import {
  appointmentStableWriteInputs,
  buildAmendmentItemCard,
  buildStableBoundaryRisk,
  buildStableWriteCard,
  buildVersionChangeCard,
  mergeAcknowledgements,
  toAmendmentItemOutcome,
  toStableWriteOutcome,
  toVersionChangeOutcome,
  validateStableWriteCardShape,
  type AmendmentItemPresentation,
  type StableWritePreview,
  type VersionChangeStack,
} from "../../version-change.ts";
import { formatDurationMs, type WatchdogObservation, type WatchdogProjectSnapshot } from "../../watchdog.ts";
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { PlanEscalationFn, PlanEscalationInput, PlanEscalationResult } from "../../../../src/model/runtime.ts";
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../../../src/model/runtime.ts";
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, UninstallSkillFn, ReportHandbackMetadata } from "../../../../src/model/runtime.ts";
import type { InstallMcpFn, InstallMcpPayload, InstallMcpReceipt, UninstallMcpFn } from "../../../../src/model/runtime.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn, ChiefDecisionBasis, ChiefDecisionHost } from "../../customer-input.ts";
import type { ProjectListing } from "../../../../src/service/role/resolve-role.ts";
import { loadEffectiveConfig as defaultLoadEffectiveConfig, type ConfigSourceKind, type LoadConfigOptions, type LoadedConfig } from "../../../../src/common/shared/config-loader.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
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
import type {
  PersistenceScope, PersistenceReply, PersistenceCapabilities, PersistenceValues, PersistenceUpdated,
} from "../contracts/persistence.ts";
import type {
  BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply,
  BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput,
  TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult,
  NativeProjectRegistration,
} from "../contracts/tasks.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import {
  desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory,
  desktopSessionManagers as inventorySessionManagers,
  type SessionInventoryState,
} from "../shared/inventory.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
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
import type { ObservedHandleRecord } from "./state.ts";

/** 管理器注册表元素（跨实例协调只读面；门面实例实现）。 */
export interface LifecycleManagerPeer {
  readonly runChangeOperations: Map<string, { plan: RunChangeHostPlan; controller: AbortController }>;
  readonly controllerDisposalOwners: Set<ControllerDisposalLease>;
}

/** lifecycle 子模块可见的宿主面：Lifecycle 实例实现（同实例、无第二份状态）。 */
export interface LifecycleHost {
  sessions: Map<string, LiveSession>;
  messageSeq: number;
  lruClock: number;
  activeRoleId: string | null;
  selectionVersion: number;
  selectionTargetRoleId: string | null;
  openChains: Map<string, Promise<void>>;
  observedHandles: Map<string, ObservedHandleRecord>;
  observedHandleIds: WeakMap<RoleSessionHandle, string>;
  lastGovernanceRuntime: Map<string, RuntimeKind>;
  profileRevisions: Map<RuntimeKind, number>;
  rebuildChains: Map<string, Promise<void>>;
  boundaryRefreshVersion: number;
  deliveryQueues: Map<string, DeliveryItem[]>;
  activeDeliveries: Map<string, DeliveryItem>;
  deliveredAppTaskIds: Set<string>;
  deliveredDeliveryKeys: Set<string>;
  stoppedDeliveryKeys: Set<string>;
  resumedDeliveryKeys: Set<string>;
  deliveryKeyStopVersions: Map<string, number>;
  deliveryStopVersion: number;
  deliveryStoppedAll: boolean;
  lastTurns: Map<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }>;
  lastAssistantText: Map<string, { turnId?: string; text: string }>;
  reportStates: Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }>;
  attemptStates: Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>;
  deferredRunChanges: Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>;
  runChangeOperations: Map<string, { plan: RunChangeHostPlan; controller: AbortController }>;
  inventoryPublicationErrors: Map<string, string>;
  loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  readonly maxLiveSessions: number;
  /**
   * 门面实例引用（逐字保留 `stop` 的跨实例协调语义：`manager !== this` 比较的是门面实例）。
   * 与 `managerId` 不同：这是对象身份，不是事实键。
   */
  readonly manager: LifecycleManagerPeer;
  activeEntry(): LiveSession | undefined;
  afterAppointmentWriteApproved(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    request: CustomerInputRequest,
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void>;
  afterStableWrite(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    absPath: string,
  ): Promise<void>;
  appTaskClientMessageId(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string;
  appTaskClientMessageIdFromSeed(seed: string): string;
  appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void>;
  applyMcpChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallMcpPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallMcpReceipt>;
  applySkillChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallSkillPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallSkillReceipt>;
  beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined;
  captureDeliveryOrigin(entry: LiveSession, event: OrchestrationEvent): DeliveryOrigin | undefined;
  closeCreatedTaskFixedForSession(
    projectRoot: string,
    actorRoleId: string,
    input: FixedCloseCreatedTaskToolInput,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof closeFixedWorkflowTask>>>;
  completeTeamPlanFixedForHandle(
    projectRoot: string,
    runtime: RuntimeKind,
    handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0],
    signal?: AbortSignal,
  ): Promise<CompleteTeamPlanFixedResult>;
  completeTeamPlanForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0], direct: { completeTeamPlan: CompleteTeamPlanFn },
    signal?: AbortSignal): Promise<Awaited<ReturnType<CompleteTeamPlanFn>>>;
  consume(key: string, entry: LiveSession): void;
  contextInfo(handle: RoleSessionHandle): Pick<OpenResult, "contextSource" | "contextWarning">;
  contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput, mode?: WorkflowMode): Promise<string>;
  currentSkillPaths(projectRoot: string, roleId: string): Promise<string[] | null>;
  deliveryIsStopped(key: string): boolean;
  deliveryLifecycle(key: string): string;
  displayHandback(event: HandbackEvent): DesktopOrchestrationEvent;
  disposeEntry(roleId: string, entry: LiveSession, heldLease?: ControllerDisposalLease): Promise<string | null>;
  disposeObservedHandle(handle: RoleSessionHandle, heldLease?: ControllerDisposalLease): Promise<void>;
  docFormatText(projectRoot: string, callerRoleId: string, input: DocFormatInput): Promise<string>;
  drainAllQueuesFor(projectRoot: string): Promise<void>;
  drainPiQueuesAcrossProjects(): Promise<void>;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  enrichAppointmentWriteBoundaryCard(
    stack: VersionChangeStack,
    projectRoot: string,
    request: CustomerInputRequest,
  ): Promise<{ kind: "pass"; request: CustomerInputRequest } | { kind: "reject"; reason: string }>;
  evictBeyondLimit(keepRoleId?: string): Promise<void>;
  evidenceCheckText(projectRoot: string, roleId: string, input: EvidenceCheckInput): Promise<string>;
  failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void;
  findListingForFeedback(projectRoot: string): ProjectListing | undefined;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  finishStopPersistence(result: StopResult): Promise<StopResult>;
  forceResetDeliveryState(entry: LiveSession, reasonCode: string): void;
  hasBusyRuntime(runtime: RuntimeKind): boolean;
  healStaleOrigin(entry: LiveSession, reasonCode: string): boolean;
  inventoryChanged(projectRoot: string, reason: string): void;
  isFixedTask(projectRoot: string, taskId: string | undefined): Promise<boolean>;
  isPrimarySession(entry: LiveSession): boolean;
  lookupGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
  ): GovernanceClientProjectionV1 | undefined;
  mergeReportState(entry: LiveSession, event?: HandbackEvent, update?: ReportSaveStateV1, updatedId?: string): void;
  mirrorGovernanceFeedback(
    projectRoot: string,
    runtime: RuntimeKind,
    roleId: string,
    options?: { flowIds?: readonly string[]; outcome?: RuntimeTurnOutcome },
  ): Promise<void>;
  noteWatchdogActivity(projectRoot: string, reason: string): void;
  notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void;
  now(): number;
  observeRoleEvent(projectRoot: string, roleId: string, event: OrchestrationEvent): void;
  observeWatchdog(projectRoot: string, observation: WatchdogObservation): void;
  open(req: SessionOpenRequest): Promise<OpenResult>;
  openInternal(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion?: number): Promise<OpenResult>;
  openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion?: number, internalReopen?: boolean, lifecycle?: string): Promise<OpenResult>;
  openObservedRoleSession(input: Parameters<SessionManagerDeps["openRoleSession"]>[0], deps: Parameters<SessionManagerDeps["openRoleSession"]>[1]): Promise<RoleSessionHandle>;
  ownsControllerDisposal(handle: RoleSessionHandle, lease: ControllerDisposalLease): boolean;
  pendingAppTaskDelivery(
    projectRoot: string,
    targetRoleId: string,
    runtime: RuntimeKind,
    clientMessageId: string,
  ): { queued: boolean; position?: number } | undefined;
  persistDeliveryQueues(): void;
  persistenceScope(entry: LiveSession): PersistenceScope;
  profileRevision(runtime: RuntimeKind): number;
  projectNote(input: { projectRoot: string; roleId: string; input: ProjectNoteInput }): Promise<ProjectNoteResult>;
  projectStateTool(projectRoot: string, roleId: string, query: { flowId?: string }): Promise<ProjectStateToolResult>;
  queueDirectNotification(projectRoot: string, input: { key: string; recipientRoleId: string; message: string;
    source: Extract<import("../../../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }> }): Promise<void>;
  queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string;
  queueRebuildWritePermitsNotice(sessionKey: string): void;
  readTasks(projectRoot: string): Promise<TaskReplay>;
  rebuildIfBoundaryStale(roleId: string, userInitiated: boolean, selectionVersion?: number, forcedWorkflowMode?: WorkflowMode): Promise<{ changed: string; reopened: OpenResult } | undefined>;
  rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult>;
  rebuildSessionUnsafe(key: string, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult>;
  redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult>;
  refreshListingNow(projectRoot: string): Promise<boolean>;
  refuseUnprovenInstallation(bindingId: string, toolName: InstallationCapabilityTool, projectRoot: string,
    actorRoleId: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, metadata?: ReportHandbackMetadata): InstallSkillReceipt;
  rememberAppTaskDelivered(clientMessageId: string | undefined): void;
  rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void;
  reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult>;
  requestIdFor(projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata?: CustomerInputMetadata): string;
  requestVersionDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: VersionDecisionRequest;
    signal?: AbortSignal;
  }): Promise<VersionDecisionResult>;
  resumeDeferredRunChanges(entry: LiveSession, origin: DeliveryOrigin): void;
  resumeDelivery(key: string): void;
  roleActivityLogText(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult>;
  roleStatusText(projectRoot: string, query: RoleStatusPayload): Promise<WatchdogToolResult>;
  routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt>;
  runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean;
  selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>>;
  send(text: string, opts?: PromptOptions, target?: SessionTarget, metadata?: SessionMessageMetadata): Promise<SendResult>;
  sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback?: boolean, handbackTaskId?: string,
    reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice?: boolean, controllerResume?: ControllerResumeDelivery): Promise<void>;
  sendFacts(entry: LiveSession, origin: DeliveryOrigin): Pick<SendResult, 'turnId' | 'clientMessageId' | 'inputAccepted' | 'outcome' | 'sessionCurrent'>;
  sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string;
  sessionTailText(projectRoot: string, query: SessionTailPayload): Promise<WatchdogToolResult>;
  targetKey(target: string | SessionTarget): string | undefined;
  terminateRoleRun(input: TerminateRoleRunInput, chiefSource?: ActualDispatchSource): Promise<TerminateRoleRunResult>;
  trimDeliveryOrigins(entry: LiveSession): void;
  withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: {
      notify?: "default" | "resolved-only" | "none";
      signal?: AbortSignal;
      /** 下载卡事实不可用时附在客户卡上的提示（其他卡种不传）。 */
      judgeNotice?: string;
      /** 卡片实际呈现（客户或 judge）后回调一次（下载 presenter 用它上报 requestId）。 */
      onPresented?: () => void;
    },
  ): Promise<CustomerInputOutcome | null | undefined>;
}
