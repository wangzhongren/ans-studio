// app/desktop/session/index.ts
// 桌面应用「会话」门面（B7 第二段从 app/desktop/session.ts 整体迁入；barrel 在 ../session.ts）。
// 模型说明（客户最终定稿 + 设计稿 §5.3）——原始文件说明逐字保留（仅折叠换行）：
// 桌面应用的「会话」装配（纯逻辑，不依赖 electron，可在 node 下单测）。 模型（客户最终定稿 + 设计稿 §5.3）： - **导入项目即授权**：用户经系统文件夹选择器导入项目，即为该项目下的角色授权； 之后左树点一个角色 → 立即开启与该角色的会话，**没有任何确认弹窗**。 - 用户对边界/acceptance **无感**：边界由门禁引擎静默执行，越界写入在聊天流里内联提示（不弹窗）。 - **授权来源分档（T13）**：项目带可用的 `.ans/project.json` → 优先用其 **pin-backed acceptance** （pin 生效、受 pin 约束）；**无** `.ans` → 回退运行期同意（导入即授权，登记的非-pin 例外）； `.ans` **存在但不可用** → fail-closed 未接受（**不回退**运行期同意），界面如实呈现。判定链的 唯一实现在共享模块 `src/common/shared/config-loader.ts`（只读导入，不复制）。 - 聊天是多轮的：会话经编排 openRoleSession 建立，send 反复调；同一角色重复点击 = 续接当前会话（不重建）。
// - **切换保留历史（B-2，2026-10-12 设计：路线 a「并存会话」）**：每角色各持一个保活句柄（`sessions` Map）, **切走不 stop、切回直接续**（句柄与模型上下文天然保留）；同时保活数上限 `MAX_LIVE_SESSIONS`（LRU， 淘汰者 dispose、界面侧历史由渲染层自持；**跳过 busy 与各项目主理 `primaryRoleId`**——主理会话不关闭）； 事件外推带 **`roleId` 信封**（多会话并存不串消息）； `stop(roleId)` **定向**关闭（缺省=全部，供换项目/退出）。
// - **回交自动投递 su 验收 + su 派发任务路由（E-1 / H-1，2026-10-12 设计；客户裁定全自动、无开关）**： E-1——某角色（≠su）的回交事件到达时，经编排的 `renderHandbackPrompt`（**单一来源**）自动投递进 su 的 会话；H-1——su 经适配器 `dispatch_task` 能力（`dispatchTask`，**仅 su 会话注入**）把任务路由进**目标角色** 的会话（文本 = 编排 `renderDispatchPrompt`（**单一来源**——G-1/A2 已收口删除本地副本）；G-1 必读块由 编排三件套（`extractDispatchReadPaths`/`planDispatchDelivery`/`renderDispatchPrompt`）产出，本层只接线）。 两者**共用一套投递机**：去重（回交=handbackKey 永不重投；派发=**队列期**窗口去重、送达即释放以保返工）+ 忙时排队（按序、绝不并发 send）+ 目标未开**自动开启** + 失败**如实系统行 + 保留待重试**（绝不静默丢）。 校验：`routeDispatch` 拒非本项目角色与内置治理角色（含 su 自身）——**如实回执给工具**，绝不静默。 CLI 前端的同等投递**不做**（一次性会话，另议——登记）。
// - **上下文来源（ANS-RUNTIME-V2r1）**：live reuse 是桌面 resumed；只有 handle 的实际原生恢复成功 才是桌面 recovered。恢复失败重建是 fresh + warning。ANS 回放/任意文件不能证明模型上下文恢复。 - scope 传 undefined（聊天无任务收窄）；判定仍由门禁引擎负责——写入照样实时被拦。 - **冷启动创世（设计 §10.1 / §12.2，任务 T30）**：未 bootstrap 的空项目上，`buildProjectConfig` 会按 `hasRoles === false` **带上 `genesisBootstrap`**；本层照常经 `openRoleSession` 以 `scope: undefined` 开启内置治理角色（su）——门禁引擎据 `genesisBootstrap` 对其返回「项目根」治理种子边界，于是 su 能写出 治理产物（`角色卡/…` / `docs/…` / `.ans/…`），而 `src/**` 仍被拒。**项目一有角色即不再带该字段** （切换在 `buildProjectConfig`，不在此处），su 随即回到普通聊天（项目边界治理）。
// - **客户确认制交互（A-1/A-3/A-5，2026-10-12）**：**仅内置治理角色（su，`role.builtIn`，数据驱动）**的会话 注入**客户交互通道**（`customer-input.ts` → 编排 `openRoleSession` 的入参 `customerInput`）：该会话进入 **确认制**——`request_confirmation` / `request_choice` 两工具注册、gate 走「**客户确认才发行 writeSet**」 （发行在编排 `common/编排/confirmed-writes.ts`，本层不复制）；**「客户确定了才加、才落盘」取代了旧收口** ——收口提议/确认/手动 finalize 已删，产物收尾由编排在 settle 后**自动**完成（本层不再有 finalize 面）。 普通角色会话**不注入**（无客户通道：两工具不注册、gate 旧语义逐字不变）。 - **内置治理角色审批档（客户裁定 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」； 客户新规则 2026-10-19「所有的角色，都应该有运行 shell 的权限，包括读写，以及任何的需要命令的权限， 只不过都要提交审批，按照原有的流程审批。
// 」）**： **全部内置治理角色**（`role.builtIn === true`——single 的 su 与 trio 五人 liaison/rapporteur/nominator/ convener/verifier）会话把 **(c) 规则集实件**（与项目角色**同一份** `deps.shellArming`——单一来源、永不漂移） 与 **(a) 操作者确认通道**（与项目角色同一份 `deps.shellOperatorChannel`）经 `shellOperatorOnly` 交给编排 `assembleOperatorShellGate` 装配**审批档** ShellGate ⇒ 内置治理角色的 `run_shell` **注册**： (c) 只读白名单直接放行 **0 卡**；`risky`/`review`/`deny` 一律交客户/判断 agent **逐条审批** （deny 也可被批准）。**不接 (b)**（不自审）；拒绝/超时/通道不可用 = 拒绝（fail-closed）。 shell 可读写、可执行任意命令，但其副作用**不受文件写门禁约束**——审批链是**唯一控制**。 旧只读档（`shellReadonly`）桌面**不再使用**（类型保留兼容；内置治理角色**绝不**注入只读档）。
// 缺件（`deps.shellArming` 或 `deps.shellOperatorChannel` 为 undefined）⇒ **不传** ⇒ 不 arm （能力缺席 = fail-closed，绝不放宽）。

import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../src/model/runtime.ts";
import path from "node:path";
import type { ChiefDecisionExecutionContext, DecidePendingRequestFn, SelectRunChangeFn, CompleteTeamPlanFn, ActivateRoleDocumentsFn, CloseCreatedTaskFn, FixedCloseCreatedTaskFn, GitQueryFn, GitCandidateFn, GitPublishFn, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts, TaskWorkSourceRef } from "../../../src/model/runtime.ts";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { DirectiveInterpretRequest, DirectiveInterpretResult, } from "../../../src/model/directive.ts";
import type { OrchestrationEvent, HandbackEvent } from "../../../src/common/编排/handback.ts";
import { renderHandbackPrompt, renderHandbackBatchPrompt, renderWorkReportPrompt, renderWorkReportBatchPrompt, handbackKey, extractDispatchReadPaths, planDispatchDelivery, type TaskHandback } from "../../../src/common/编排/handback.ts";
import { appendTaskEvent, classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, readTaskState, redispatchCountOf, redispatchTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskCards, taskEvent, taskIdempotencyKey, taskReportStatusOf, type TaskCardView, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { appendWorkflowEvent, closeTask as closeFixedWorkflowTask, completeTeamPlanFixed, executeReleaseMerge, finalizeIntent as finalizeFixedIntent, inspectAssignedTask as inspectWorkflowAssignedTask, prepareIntent as prepareFixedIntent, preparePathBStart as prepareFixedPathBStart, prepareReleaseMerge, readBasisLedger, readWorkflowLedger, rejectReleaseMerge, requestStage, verifyBasisForStage, verifyBasisForWorkflow, workflowIdFor, type CompleteTeamPlanFixedResult, type FixedCloseCreatedTaskToolInput, type ReleaseMergePreview, type WorkflowServiceFailure, } from "../../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView, canCompleteStage, type WorkflowView } from "../../../src/common/编排/workflow-state.ts";
import { activeFixedWorkflowIdFor, dispatchFlowIdOf, ensureFixedPathStarted, isFixedPathEnabledForFlow, isFixedReleaseTriggerStage, markFixedProposalCardRequested, recordFixedPathBScopeDecisionForDispatch, recordFixedStageDispatchForTask, resolveFixedPathMode, resolveProjectFixedPanelMode, sessionWorkflowModeForChat, sessionWorkflowModeForTask, shouldRecordFixedStageDispatch, workflowModeForFlowResolver, type FixedReleaseTriggerStage, type WorkflowMode, } from "../workflow.ts";
import { createDesktopBaselineGitPort, createDesktopReleaseGitPort, createDesktopTaskGitShellPort } from "../workflow-git.ts";
import { applyRunChange, buildRunChangeCard, closeRun, ensureDraftRun, findActiveRun, findNewerContractDocs, loadPinnedRoster, listRunManifestsResult, mapRunChangeAnswer, pinRun, pinnedDocsSummary, readRunManifest, validateRunManifest, verifyPinnedRun, RUN_PENDING_FLOW_ID, type NewerContractDoc, type RunManifest, type RunChangeMode } from "../../../src/common/编排/run-manifest.ts";
import { buildVersionDecisionCard, collectResolvedWithoutExecution, computeTargetVersions, mapVersionDecisionAnswer, planVersionDecisionExecution, supersededCloseReason, validateVersionDecisionContext, validateVersionDecisionRequest, versionDecisionAttempt, versionDecisionCardToRequest, versionDecisionRequestId, type VersionDecisionCardLabels, type VersionDecisionRequestSubject, } from "../../../src/common/编排/version-decision.ts";
import { PROJECT_NOTE_BLOCKER_TEXT_MAX, PROJECT_NOTE_KEY_MAX, PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY, PROJECT_NOTE_NEXT_STEP_TEXT_MAX, PROJECT_NOTE_REFS_MAX, PROJECT_STATE_SCHEMA, VERSION_DECISION_SCHEMA, type ProjectNoteInput, type ProjectNoteResult, type ProjectStateDocKind, type ProjectStateToolResult, type ProjectStateView, type VersionDecisionErrorCode, type VersionDecisionDecidedBy, type VersionDecisionFacts, type VersionDecisionRequest, type VersionDecisionResult, } from "../../../src/model/project-state.ts";
import { docsForFlow, formatMechanicalRejection, humanRejection, makeMechanicalRejection, technicalRejectionCode, type MechanicalRejection } from "../../../src/common/编排/mechanical-rejection.ts";
import { ENV_BOOTSTRAP_ROLE_ID, evaluateDispatchAuthorization, loadLatestRoster, reportTargetForTaskCreator, rosterRoleIds, type DispatchPreflightInput, type ProjectRoster, type RosterLoadResult, } from "../../../src/common/编排/workflow-preconditions.ts";
import { collectDispatchAdvisories, type DispatchAdvisory } from "../../../src/common/编排/dispatch-advisories.ts";
import type { StableWritePermit, StableWriteRecord, VersionChangeRecord } from "../../../src/model/version-change.ts";
import type { AmendmentItemOutcome, VcaCardOutcome, } from "../../../src/pipeline/orchestration/version-change-runtime.ts";
import type { StableWriteCardOutcome } from "../../../src/pipeline/orchestration/stable-write-runtime.ts";
import { appointmentStableWriteInputs, buildAmendmentItemCard, buildStableBoundaryRisk, buildStableWriteCard, buildVersionChangeCard, mergeAcknowledgements, toAmendmentItemOutcome, toStableWriteOutcome, toVersionChangeOutcome, validateStableWriteCardShape, type AmendmentItemPresentation, type StableWritePreview, type VersionChangeStack, } from "../version-change.ts";
import { formatDurationMs, type WatchdogObservation, type WatchdogProjectSnapshot } from "../watchdog.ts";
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../../src/model/runtime.ts";
import type { PlanEscalationFn, PlanEscalationInput, PlanEscalationResult } from "../../../src/model/runtime.ts";
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../../src/model/runtime.ts";
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, UninstallSkillFn, ReportHandbackMetadata } from "../../../src/model/runtime.ts";
import type { InstallMcpFn, InstallMcpPayload, InstallMcpReceipt, UninstallMcpFn } from "../../../src/model/runtime.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn, ChiefDecisionBasis, ChiefDecisionHost } from "../customer-input.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import { loadEffectiveConfig as defaultLoadEffectiveConfig, type ConfigSourceKind, type LoadConfigOptions, type LoadedConfig } from "../../../src/common/shared/config-loader.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest, InternalSessionOpenRequest, ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget, OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult, WithdrawResult, RebuildSessionResult, RedeliverResult, DeliveryAssignment, DeliveryOrigin, ActualDispatchSource, ControllerDisposalLease, LiveSession, ControllerResumeDelivery, DeliveryItem, PersistedDeliveryItemV1, DeliveryQueueRestoreReport, InstallationCapabilityTool, InstallationEffectRefusalObservation, DesktopSessionInventoryFact, DesktopRunStopFact, DesktopControllerStopFact, DesktopProjectExecutionInventory, } from "./contracts/session-types.ts";
import type { PersistenceScope, PersistenceReply, PersistenceCapabilities, PersistenceValues, PersistenceUpdated, } from "./contracts/persistence.ts";
import type { BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply, BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput, TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult, NativeProjectRegistration, } from "./contracts/tasks.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory, desktopSessionManagers as inventorySessionManagers, type SessionInventoryState, } from "./shared/inventory.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "./shared/keys.ts";
import { now } from "./shared/clock.ts";
import { handbackOwnerRoleId, chiefTaskRoleIdOf, dispatcherRoleIdOf, resolveProofFlowIds, findListingForFeedback, roleDisplayName, refreshListingNow, } from "./shared/roles.ts";
import { contextInfo } from "./shared/session-views.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { taskCreators, rememberTaskCreator, readTasks, isFixedTask, appendTaskStateResult, appendTaskState, recordTaskFailure, appendRoleActivity, } from "./shared/tasks-store.ts";
import { Evidence } from "./evidence.ts";
import { Persistence } from "./persistence.ts";
import { Tasks } from "./tasks.ts";
import { Diagnostics } from "./diagnostics.ts";
import { SessionEnv } from "./session-env.ts";
import { Delivery, type DrainClaimRecord } from "./delivery/queue.ts";
import { Cards } from "./cards/cards.ts";
import { VersionDecisions } from "./cards/version-decisions.ts";
import { AcceptanceFacts } from "./cards/acceptance-facts.ts";
import { RunChange } from "./run-change.ts";
import type { CardGateway, ControllerStopPort } from "./card-gateway.ts";
import { Handback } from "./handback.ts";
import { Dispatch } from "./dispatch.ts";
import { FixedWorkflowRoute, type FixedWorkflowPorts, type FixedWorkflowRefs } from "./fixed-workflow/route.ts";
import { FixedWorkflowCards } from "./fixed-workflow/cards.ts";
import { FixedWorkflowRelease } from "./fixed-workflow/release-merge.ts";
import { FixedWorkflowPanel } from "./fixed-workflow/panel.ts";
import type { FixedDispatchPort, HandbackSink } from "./contracts/ports.ts";
import { Lifecycle, type LifecyclePorts } from "./lifecycle/index.ts";
import type { LifecycleManagerPeer } from "./lifecycle/host.ts";

/** 同时**保活**的会话数上限（B-2 路线 a 的 LRU 上限；设计建议 3）。超出即淘汰**最久未用**者（dispose；界面侧历史由渲染层自持——切回时恢复并明示「模型上下文已重启」）。淘汰候选不含 busy 会话（P1-2），也不含各项目的主理（`primaryRoleId`，2026-10-26 客户指令）。 */
export const MAX_LIVE_SESSIONS = 3;

/** 会话管理器（B-2：**每角色一个保活句柄** + 上限 LRU）：点角色即开、多轮直发；**切走不 dispose、切回直接续**；超出 `MAX_LIVE_SESSIONS` 时淘汰最久未用者。 */
export class SessionManager {
  private get inventoryRegistration(): boolean { return this.lifecycle.state.inventoryRegistration; }
  private get managerId(): string { return this.lifecycle.state.managerId; }
  private get messageSeq(): number { return this.lifecycle.state.messageSeq; }
  private set messageSeq(value: number) { this.lifecycle.state.messageSeq = value; }
  private get lruClock(): number { return this.lifecycle.state.lruClock; }
  private set lruClock(value: number) { this.lifecycle.state.lruClock = value; }
  private get activeRoleId(): string | null { return this.lifecycle.state.activeRoleId; }
  private set activeRoleId(value: string | null) { this.lifecycle.state.activeRoleId = value; }
  private get selectionVersion(): number { return this.lifecycle.state.selectionVersion; }
  private set selectionVersion(value: number) { this.lifecycle.state.selectionVersion = value; }
  private get selectionTargetRoleId(): string | null { return this.lifecycle.state.selectionTargetRoleId; }
  private set selectionTargetRoleId(value: string | null) { this.lifecycle.state.selectionTargetRoleId = value; }
  private get openChains(): Map<string, Promise<void>> { return this.lifecycle.state.openChains; }
  private get observedHandles(): Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }> { return this.lifecycle.state.observedHandles; }
  private get observedHandleIds(): WeakMap<RoleSessionHandle, string> { return this.lifecycle.state.observedHandleIds; }
  private get lastGovernanceRuntime(): Map<string, RuntimeKind> { return this.lifecycle.state.lastGovernanceRuntime; }
  private readonly lifecycle: Lifecycle;
  // —— B5（2026-11-13）：run-change 状态（方案 §3.6 的 10 个字段）由 `./session/run-change.ts` 的 `RunChange` **单 owner 持有并创建**；门面仅保留**同一实例**访问器（方案 §4.3 兼容面：测试 cast 与 尚未迁出的生命周期/停止方法按原名访问），不造第二份状态。 ——
  private get runStopGeneration(): number { return this.runChange.state.runStopGeneration; }
  private set runStopGeneration(value: number) { this.runChange.state.runStopGeneration = value; }
  private get fencedRunTasks(): Map<string, Set<string>> { return this.runChange.state.fencedRunTasks; }
  private get fencedRuns(): Map<string, Set<string>> { return this.runChange.state.fencedRuns; }
  private get runStopFacts(): Map<string, { projectRoot: string; fact: DesktopRunStopFact }> { return this.runChange.state.runStopFacts; }
  private get controllerStopFacts(): Map<string, { projectRoot: string; fact: DesktopControllerStopFact }> { return this.runChange.state.controllerStopFacts; }
  private get controllerDisposalOwners(): Set<ControllerDisposalLease> { return this.runChange.state.controllerDisposalOwners; }
  private get deferredRunChanges(): Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }> { return this.runChange.state.deferredRunChanges; }
  private get runChangeOperations(): Map<string, { plan: RunChangeHostPlan; controller: AbortController }> { return this.runChange.state.runChangeOperations; }
  private get inventoryPublicationErrors(): Map<string, string> { return this.runChange.state.inventoryPublicationErrors; }
  private get observedInventoryRoots(): Set<string> { return this.runChange.state.observedInventoryRoots; }
  private readonly installationRefusals: InstallationEffectRefusalObservation[] = [];
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  installationEffectObservations(projectRoot: string): InstallationEffectRefusalObservation[] { return this.sessionEnv.installationEffectObservations(projectRoot); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private refuseUnprovenInstallation(bindingId: string, toolName: InstallationCapabilityTool, projectRoot: string, actorRoleId: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, metadata?: ReportHandbackMetadata): InstallSkillReceipt { return this.sessionEnv.refuseUnprovenInstallation(bindingId, toolName, projectRoot, actorRoleId, runtime, handle, metadata); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean { return this.runChange.runTaskIsFenced(projectRoot, taskId, runId); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> { return this.runChange.selectRunChangeForHandle(projectRoot, runtime, handle, request, signal); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async completeTeamPlanForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, request: Parameters<CompleteTeamPlanFn>[0], direct: { completeTeamPlan: CompleteTeamPlanFn }, signal?: AbortSignal): Promise<Awaited<ReturnType<CompleteTeamPlanFn>>> { return this.runChange.completeTeamPlanForHandle(projectRoot, runtime, handle, request, direct, signal); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private ownedRunStopMembers(plan: Pick<RunChangeHostPlan,"projectRoot" | "handles">) { return this.runChange.ownedRunStopMembers(plan); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async executeOwnedRunStop(plan: RunChangeHostPlan, signal: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> { return this.runChange.executeOwnedRunStop(plan, signal); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private resumeDeferredRunChanges(entry: LiveSession, origin: DeliveryOrigin): void { return this.runChange.resumeDeferredRunChanges(entry, origin); }
  /** 库存变更（薄委托 → `shared/inventory.ts`；observedRoots/发布失败表经显式状态面传入）。 */
  private inventoryChanged(projectRoot: string, reason: string): void { inventoryChanged(projectRoot, reason, this.inventoryState); }
  private publishDeliveryInventory(reason: string): void { publishDeliveryInventory(reason, this.inventoryState); }
  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 归属 run-change，由模块单 owner 持有）。 */
  private get inventoryState(): SessionInventoryState { return this.runChange.inventoryState; }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory,"sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops"> { return this.runChange.executionInventoryFacts(projectRoot); }
  private async openObservedRoleSession(input: Parameters<SessionManagerDeps["openRoleSession"]>[0], deps: Parameters<SessionManagerDeps["openRoleSession"]>[1]): Promise<RoleSessionHandle> { return this.lifecycle.openObservedRoleSession(input, deps); }
  private ownsControllerDisposal(handle: RoleSessionHandle, lease: ControllerDisposalLease): boolean { return this.lifecycle.ownsControllerDisposal(handle, lease); }
  private async disposeObservedHandle(handle: RoleSessionHandle, heldLease?: ControllerDisposalLease): Promise<void> { return this.lifecycle.disposeObservedHandle(handle, heldLease); }
  private readonly deps: SessionManagerDeps;
  private readonly loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  /** 保活中的会话：project × role × runtime → 句柄（上限见 `MAX_LIVE_SESSIONS`）。 */
  private readonly sessions = new Map<string, LiveSession>();
  /** 关闭全部使旧扫描尚未开始的重建步骤失效；选角色不取消后台扫描。 */
  private boundaryRefreshVersion = 0;
  /** 保存成功才递增的配置版本；活句柄记录它创建时的版本。 */
  private readonly profileRevisions = new Map<RuntimeKind, number>();
  // —— B4（2026-11-13）：投递机状态（方案 §3.6 的 19 个字段）由 `./session/delivery/queue.ts` 的 `Delivery` **单 owner 持有并创建**；门面仅保留**同一实例**的访问器（方案 §4.3 兼容面：测试 cast 与 尚未迁出的生命周期/卡片方法按原名访问），不造第二份状态。同名访问器直接转发同一对象。 ——
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.delivery.state.deliveryQueues; }
  private get drainChains(): Map<string, Promise<void>> { return this.delivery.state.drainChains; }
  private get drainClaimRecords(): Set<DrainClaimRecord> { return this.delivery.state.drainClaimRecords; }
  private get deliveryStopVersion(): number { return this.delivery.state.deliveryStopVersion; }
  private set deliveryStopVersion(value: number) { this.delivery.state.deliveryStopVersion = value; }
  private get deliveryStoppedAll(): boolean { return this.delivery.state.deliveryStoppedAll; }
  private set deliveryStoppedAll(value: boolean) { this.delivery.state.deliveryStoppedAll = value; }
  private get stoppedDeliveryKeys(): Set<string> { return this.delivery.state.stoppedDeliveryKeys; }
  private get resumedDeliveryKeys(): Set<string> { return this.delivery.state.resumedDeliveryKeys; }
  private get deliveryKeyStopVersions(): Map<string, number> { return this.delivery.state.deliveryKeyStopVersions; }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private deliveryIsStopped(key: string): boolean { return this.delivery.deliveryIsStopped(key); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private deliveryLifecycle(key: string): string { return this.delivery.deliveryLifecycle(key); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private resumeDelivery(key: string): void { this.delivery.resumeDelivery(key); }
  /** **`openInternal` 的按会话键互斥链（F-2-opt2，2026-10-16 客户批准）**：同一会话键的 `openInternal` 至多 一个在跑（其余按序等待）——闭合既有双开窗口（① 用户 open × 投递机自动开；② 两次用户 open）：旧实现 两方并发穿过 `sessions.get(key)` 的存在性检查后各自开会话，先建者被后建者覆盖（句柄泄漏）。 **防死锁（与 rebuildChains 的关系）**：持锁方「续接前查陈旧」要等 `rebuildChains`；重建的**重开续段** （同一逻辑流）因此必须直调 `openInternalUnsafe`（**不再入本链**）——否则「持锁等 rebuild 链 ← rebuild 链等锁」成环。重建链内的重开与持锁方并发是安全的：持锁方此时必然正阻塞在等待该重建链（或旧条目已被 dispose、重建链内重开走纯新建路径、不再触发任何 rebuild 检查）。 / /** **作废重建的按角色串行链（2026-10-13 状态机修复）**：`rebuildIfBoundaryStale` 经它串行化—— 同一角色任一时刻至多一个重建在跑（并发触发方按序等待，各自重查陈旧；见该方法注释）。 */
  private readonly rebuildChains = new Map<string, Promise<void>>();
  /** **正在跑的那条投递**（方案 §3.6 delivery；同一实例访问器，语义见 `session/delivery/queue.ts`）。 */
  private get activeDeliveries(): Map<string, DeliveryItem> { return this.delivery.state.activeDeliveries; }
  /** B 批：星形任务 id（内存索引；派发/恢复/列表时登记——回交路由用同步判定，保持事件顺序）。 */
  private readonly starTaskIds = new Set<string>();
  /** 2026-10-29（方案 v2.1 §5.4/M9）：任务创建者内存索引（`task.created.from`）——报告按创建者路由。 B1 提交 2/2：状态随 `rememberTaskCreator` 迁入 `./session/shared/tasks-store.ts`（模块单例，见导入）。 */ /** B 批：已写入 `task.reported` 的键（`taskId\0turnId|摘要`；防同轮重复事件）。 */
  private readonly reportedTaskKeys = new Set<string>();
  /** B-07：连续卡死升级卡（按链根去重；同一链只提交一次）。 */
  private readonly escalationRequests = new Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>>();
  /** B5：在途方案升级卡（`projectRoot\0flowId` 去重；同一 flow 至多一张）——状态由 `./session/cards/cards.ts` 的 `Cards` 单 owner 持有（同一实例访问器）。 */
  private get planEscalations(): Map<string, Promise<void>> { return this.cards.state.planEscalations; }
  /** B5：已向 convener 发过「是否自己调用 report_plan_escalation」提示的 flow（状态由 `Cards` 单 owner 持有；首次 blocked 即提示，同一 flow 在 done/failed/aborted 或升级卡成功提交后清除标记）。 */
  private get planEscalationPrompted(): Set<string> { return this.cards.state.planEscalationPrompted; }
  /** C 批：系统通知去重（`requestId\0event`）——状态由 `Cards` 单 owner 持有。 */
  private get requestNotifiedKeys(): Set<string> { return this.cards.state.requestNotifiedKeys; }
  /** 2026-11-02（版本决策）：同进程未决请求（subjectKey -> requestId）——状态由 `Cards` 单 owner 持有； 跨重启由账本结构化扫描兜底，只用于 `decision-pending` 的 check-then-set，不当作第二份持久状态。 */
  private get versionDecisionPending(): Map<string, string> { return this.cards.state.versionDecisionPending; }
  /** 版本决策 check-then-set 的 per-project 串行链（状态由 `Cards` 单 owner 持有；不持有到卡裁决/执行）。 */
  private get versionDecisionChains(): Map<string, Promise<void>> { return this.cards.state.versionDecisionChains; }
  /** C 批：已呈现过的申请（`requestId\0customer|judge`）——状态由 `Cards` 单 owner 持有。 */
  private get requestPresentedKeys(): Set<string> { return this.cards.state.requestPresentedKeys; }
  /** B 批：每角色最近运行日志的内存摘要（看护巡检/日志静默用；真实日志在 `.ans/state/logs/`）。 */
  private readonly lastRoleActivity = new Map<string, { at: number; kind: string; summary: string }>();
  private readonly reportStates = new Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }>();
  private readonly attemptStates = new Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>();
  private readonly knownReports = new Set<string>();
  private readonly knownAttempts = new Set<string>();
  private readonly persistenceInFlight = new Map<string, Promise<unknown>>();
  /** B2：证据/契约/文档格式检查（9 方法 → `./session/evidence.ts`；构造见 constructor）。 */
  private readonly evidence: Evidence;
  /** B2：报告/投递持久化状态与回执操作（6 方法 → `./session/persistence.ts`）。 五个状态 Map/Set 按方案 §3.6 **暂留本类**，构造时以同一实例引用注入（B1 同款口径）。 */
  private readonly persistence: Persistence;
  /** B3：任务账本业务/重派/终止/升级（17 方法 → `./session/tasks.ts`）。状态 starTaskIds/activeDispatchKeys/escalationRequests/lastRoleActivity 按方案 §3.6 暂留本类， 构造时以同一实例引用注入（B1/B2 同款口径）。 */
  private readonly tasks: Tasks;
  /** B3：看护/状态文本/诊断尾部/治理投影/网络状态（17 方法 → `./session/diagnostics.ts`）。 lastTurns/lastAssistantText/governanceHandbackMirrored/governanceClientProjections/networkState 按方案 §3.6 归属本模块，B3 暂留本类（同一实例引用；networkState 经 get/set 回调接回字段）。 */
  private readonly diagnostics: Diagnostics;
  /** B3：边界/画像重建、技能/MCP 安装卸载、激活刷新（11 方法 → `./session/session-env.ts`）。 boundaryRefreshVersion/profileRevisions/rebuildChains/installationRefusals 按方案 §3.6 归属本模块， B3 暂留本类（同一实例引用；selectionVersion/activeRoleId 经 get/set 回调接回字段）。 */
  private readonly sessionEnv: SessionEnv;
  /** B4：投递机（27 方法 → `./session/delivery/queue.ts` + `store.ts`；方案 §3.6 的 19 个状态字段由模块 单 owner 持有（`Delivery.state`）；门面仅保留同一实例访问器，见上方同名访问器组）。 */
  private readonly delivery: Delivery;
  /** B5：run-change 栅栏/控制器停止/执行库存事实（9 方法 → `./session/run-change.ts`；方案 §3.6 的 10 个 状态字段由模块单 owner 持有（`RunChange.state`）；门面仅保留同一实例访问器）。 */
  private readonly runChange: RunChange;
  /** B5：应用卡呈现/申请生命周期/方案升级/任命/stable/run-change 卡（21 方法 → `./session/cards/cards.ts`；方案 §3.6 的 7 个 cards 状态字段由模块单 owner 持有）。 */
  private readonly cards: Cards;
  /** B5：版本决策全链与恢复（17 方法 → `./session/cards/version-decisions.ts`）。 */
  private readonly versionDecisions: VersionDecisions;
  /** B5：验收 judge 事实与 appointment-write 校验（5 方法 → `./session/cards/acceptance-facts.ts`）。 */
  private readonly acceptanceFacts: AcceptanceFacts;
  /** B5：卡片通道端口实例（门面构造注入；fixed-workflow/lifecycle 经此使用，不导入 cards/**）。 */
  private readonly cardGateway: CardGateway;
  /** B5：精确控制器停止端口实例（门面构造注入）。 */
  private readonly controllerStopPort: ControllerStopPort;
  /** B6：回交提交、回交主人路由与回交展示（4 方法 → `./session/handback.ts`；§3.6 handback 2 字段由模块单 owner 持有）。 */
  private readonly handback: Handback;
  /** B6：星形/legacy 派发路由与幕僚控制器恢复（5 方法 → `./session/dispatch.ts`）。 */
  private readonly dispatch: Dispatch;
  /** B6：fixed 派发路由 + 路径 B 写集/启动门（3 方法 → `./session/fixed-workflow/route.ts`）。 */
  private readonly fixedWorkflowRoute: FixedWorkflowRoute;
  /** B6：固定卡请求/裁决/阶段推进 + fixed 收口/复核/回交子任务校验（6 方法 → `./session/fixed-workflow/cards.ts`）。 */
  private readonly fixedWorkflowCards: FixedWorkflowCards;
  /** B6：merge-main 卡/发布合并/自动呈卡（5 方法 → `./session/fixed-workflow/release-merge.ts`）。 */
  private readonly fixedWorkflowRelease: FixedWorkflowRelease;
  /** B6：fixed 面板只读投影 + advisory 摘要（2 方法 → `./session/fixed-workflow/panel.ts`）。 */
  private readonly fixedWorkflowPanel: FixedWorkflowPanel;
  /** B6：`FixedDispatchPort`（dispatch → fixed-workflow；构造注入箭头、运行期调用、参数逐位转发）。 */
  private readonly fixedDispatchPort: FixedDispatchPort;
  /** B6：`HandbackSink`（persistence → handback；构造注入箭头、运行期调用、参数逐位转发）。 */
  private readonly handbackSink: HandbackSink;
  /** B6（2026-11-13）：回交去重键（`handbackKey` 单一来源；`projectRoot\0<key>`——**一条回交只投递一次**， 永不放行重投）。状态由 `./session/handback.ts` 的 `Handback` **单 owner 持有并创建**；门面仅保留 **同一实例**访问器（方案 §4.3 兼容面：delivery/store 恢复路径按原名写同一 Set），不造第二份状态。 */
  private get enqueuedHandbackKeys(): Set<string> { return this.handback.state.enqueuedHandbackKeys; }
  private get pendingHandbackKeys(): Set<string> { return this.handback.state.pendingHandbackKeys; }
  /** 回交/派发提交屏障（方案 §3.6 delivery；同一实例访问器，语义见 `session/delivery/queue.ts`）。 */
  private get taskHandbackCommits(): Map<string, Promise<void>> { return this.delivery.state.taskHandbackCommits; }
  /** Only an already-started delivery observation; Core.send never awaits the detached report consumer. */
  private get taskDeliveryCommits(): Map<string, { done: Promise<void>; finish: () => void }> { return this.delivery.state.taskDeliveryCommits; }
  /** 派发去重键——**队列期窗口去重**（投递成功即释放，见 `drainQueue`；返工可再派发同文任务）。 契约的 `DispatchTaskPayload` 无 id/时间（钉死不扩），桌面无法区分「重试同一调用」与「新的一次相同文本 派发」；在途窗口去重防重投，送达后放行以保返工回路可用——语义在 change 文档写明。 */
  private readonly activeDispatchKeys = new Set<string>();
  /** 2026-10-31（run-change 触发缺陷）：**自动**呈现 run-change 卡的去重键（`projectRoot\0runId`；状态由 `Cards` 单 owner 持有）。同一 pinned run 只自动弹一次——客户已决定/已呈现后，后续冻结冲突只回 结构化拒绝（走显式入口），不刷屏、不重复替客户要决定。显式入口（会话头按钮/IPC）不受此集合限制。 */
  private get runChangeAutoPrompted(): Set<string> { return this.cards.state.runChangeAutoPrompted; }
  /** 「队列受阻」（枚举不到目标）只如实提示**一次**（方案 §3.6 delivery；同一实例访问器）。 */
  private get suDeliveryBlockedNoted(): Set<string> { return this.delivery.state.suDeliveryBlockedNoted; }
  /** **各角色最近一轮的终局**（G-2/W1「lastTurn 小状态」）：settled 时在事件消费循环里顺带落表 （outcome + 时刻；只记四值终局——旧来源缺事实不猜）。看护 `role_status` 的「最近一轮」行与未来 其他只读消费方取用；不参与任何判定。 */
  private readonly lastTurns = new Map<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }>();
  /** **各角色本轮 assistant 正文累积**（2026-10-18 客户反馈「内部治理角色，应该都向联络官反馈」）： 只记 `kind:"message"` 且**无结构化 detail** 的普通助手消息（delivery-note/prompt-input/receipt/ reasoning 等系统行一律不记）。Claude 一条回复可能拆成多个 text block（各发一条 message）—— 同一键 + 同一 `turnId` 用 `\n` 追加；`turnId` 变化即重置；总长上限 4000 码点（超出保留最新， 前置 `…`）。settle 时由 `mirrorGovernanceFeedback` 取出即删。不参与任何判定。 */
  private readonly lastAssistantText = new Map<string, { turnId?: string; text: string }>();
  /** **内置来源回交已投 Lead 的短时标记**（2026-10-24 治理协调，设计 v1 §6.2/§6.3）： `queueKey` → 入队时刻。内置角色回交在编排侧被 `suppressHandback` 抑制，正常不会出现； `handleHandback` 仍需对「防御性出现」的内置回交路由到 Lead，并与同一轮 settle 的 `mirrorGovernanceFeedback` **去重**（同一轮只向 Lead 投一条）。只在内存、短时有效；不参与任何判定。 */
  private readonly governanceHandbackMirrored = new Map<string, number>();
  /** **治理反馈客户投影登记表**（2026-10-25 A3/A4）：`queueKey + \0 + sha256(text)` → 投影 + 登记时刻。 `mirrorGovernanceFeedback` 发送成功后登记；事件消费循环对 `prompt-input` 回显按同一文本查表， 命中则把 `clientProjection` 附到外推事件的 `detail`（内部原文 `detail.text` 原样保留）。 有界（128，FIFO）+ 30 分钟 TTL；只在内存、不持久化、不参与任何判定。 */
  private readonly governanceClientProjections = new Map<string, { projection: GovernanceClientProjectionV1; at: number }>();
  /** **回交主人**最近一次开会话所用 runtime（评审 §5.6：`lastSuRuntime` → `lastGovernanceRuntime`）： trio = Convener（`schedule`），single = 主入口 su。看护向回交主人投系统消息时 queueKey 需要 runtime ——优先活会话，其次本记录，最后 `"pi"`（真实产品默认；demo 是开发替身）。仅为投递择路，不改任何判定。 / /** **投递队列持久化状态（方案 §3.6 delivery；同一实例访问器）**：存储路径、串行原子写链、 「delivery.end 已完成」键与应用任务「已投递」标记/武装标志（19 字段单 owner 在 delivery 模块； 语义/JSDoc 见 `./session/delivery/store.ts` 与 `./session/delivery/queue.ts`）。 */
  private get deliveryQueueStorePath(): string | undefined { return this.delivery.state.deliveryQueueStorePath; }
  private get deliveryPersistOutcome(): DeliveryQueuePersistenceOutcome { return this.delivery.state.deliveryPersistOutcome; }
  private get deliveryPersistChain(): Promise<DeliveryQueuePersistenceOutcome> { return this.delivery.state.deliveryPersistChain; }
  private get deliveryPersistSeq(): number { return this.delivery.state.deliveryPersistSeq; }
  private get deliveredDeliveryKeys(): Set<string> { return this.delivery.state.deliveredDeliveryKeys; }
  private get deliveredAppTaskIds(): Set<string> { return this.delivery.state.deliveredAppTaskIds; }
  private get deliveryStoreArmed(): boolean { return this.delivery.state.deliveryStoreArmed; }
  private set deliveryStoreArmed(value: boolean) { this.delivery.state.deliveryStoreArmed = value; }
  /** **P2 网络状态（2026-10-30）**：最近一次主进程网络快照（monitor 经 Interface 推入）。 `null` = 尚未收到（按在线处理；不误判离线）。离线期间队列保留、不认领新投递；恢复后按既有 drain 继续。 */
  private networkState: NetworkState | null = null;
  constructor(deps: SessionManagerDeps) { this.deps = deps; this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig; this.lifecycle = new Lifecycle( { deps, registerManager: () => registerDesktopSessionManager(this), sessions: this.sessions, loadEffectiveConfig: this.loadEffectiveConfig,
   manager: this as unknown as LifecycleManagerPeer, maxLiveSessions: MAX_LIVE_SESSIONS, profileRevisions: () => this.profileRevisions, rebuildChains: () => this.rebuildChains, boundaryRefreshVersion: () => this.boundaryRefreshVersion, setBoundaryRefreshVersion: (value) => { this.boundaryRefreshVersion = value;
   }, lastTurns: () => this.lastTurns, lastAssistantText: () => this.lastAssistantText, reportStates: () => this.reportStates, attemptStates: () => this.attemptStates, deliveryQueues: () => this.deliveryQueues, activeDeliveries: () => this.activeDeliveries, deliveredAppTaskIds: () => this.deliveredAppTaskIds,
   deliveredDeliveryKeys: () => this.deliveredDeliveryKeys, stoppedDeliveryKeys: () => this.stoppedDeliveryKeys, resumedDeliveryKeys: () => this.resumedDeliveryKeys, deliveryKeyStopVersions: () => this.deliveryKeyStopVersions, deliveryStopVersion: () => this.deliveryStopVersion, setDeliveryStopVersion: (value) => {
   this.deliveryStopVersion = value; }, deliveryStoppedAll: () => this.deliveryStoppedAll, setDeliveryStoppedAll: (value) => { this.deliveryStoppedAll = value; }, deferredRunChanges: () => this.deferredRunChanges, runChangeOperations: () => this.runChangeOperations, inventoryPublicationErrors: () => this.inventoryPublicationErrors,
   directory: { governanceOwner: (projectRoot) => this.governanceOwnerRoleId(projectRoot), governanceRuntime: (projectRoot) => this.governanceRuntimeFor(projectRoot), lastTurn: (projectRoot, roleId, runtime) => this.lastTurnOf(projectRoot, roleId, runtime), }, }, { afterAppointmentWriteApproved: (...args: Parameters<LifecyclePorts["afterAppointmentWriteApproved"]>) => this.afterAppointmentWriteApproved(...args),
   afterStableWrite: (...args: Parameters<LifecyclePorts["afterStableWrite"]>) => this.afterStableWrite(...args), appTaskClientMessageId: (...args: Parameters<LifecyclePorts["appTaskClientMessageId"]>) => this.appTaskClientMessageId(...args), appTaskClientMessageIdFromSeed: (...args: Parameters<LifecyclePorts["appTaskClientMessageIdFromSeed"]>) => this.appTaskClientMessageIdFromSeed(...args),
   appendRoleActivity: (...args: Parameters<LifecyclePorts["appendRoleActivity"]>) => this.appendRoleActivity(...args), applyMcpChange: (...args: Parameters<LifecyclePorts["applyMcpChange"]>) => this.applyMcpChange(...args), applySkillChange: (...args: Parameters<LifecyclePorts["applySkillChange"]>) => this.applySkillChange(...args),
   closeCreatedTaskFixedForSession: (...args: Parameters<LifecyclePorts["closeCreatedTaskFixedForSession"]>) => this.closeCreatedTaskFixedForSession(...args), completeTeamPlanFixedForHandle: (...args: Parameters<LifecyclePorts["completeTeamPlanFixedForHandle"]>) => this.completeTeamPlanFixedForHandle(...args),
   completeTeamPlanForHandle: (...args: Parameters<LifecyclePorts["completeTeamPlanForHandle"]>) => this.completeTeamPlanForHandle(...args), contractCheckText: (...args: Parameters<LifecyclePorts["contractCheckText"]>) => this.contractCheckText(...args), currentSkillPaths: (...args: Parameters<LifecyclePorts["currentSkillPaths"]>) => this.currentSkillPaths(...args),
   deliveryIsStopped: (...args: Parameters<LifecyclePorts["deliveryIsStopped"]>) => this.deliveryIsStopped(...args), deliveryLifecycle: (...args: Parameters<LifecyclePorts["deliveryLifecycle"]>) => this.deliveryLifecycle(...args), displayHandback: (...args: Parameters<LifecyclePorts["displayHandback"]>) => this.displayHandback(...args),
   docFormatText: (...args: Parameters<LifecyclePorts["docFormatText"]>) => this.docFormatText(...args), drainAllQueuesFor: (...args: Parameters<LifecyclePorts["drainAllQueuesFor"]>) => this.drainAllQueuesFor(...args), drainPiQueuesAcrossProjects: (...args: Parameters<LifecyclePorts["drainPiQueuesAcrossProjects"]>) => this.drainPiQueuesAcrossProjects(...args),
   drainQueue: (...args: Parameters<LifecyclePorts["drainQueue"]>) => this.drainQueue(...args), enqueueDelivery: (...args: Parameters<LifecyclePorts["enqueueDelivery"]>) => this.enqueueDelivery(...args), enrichAppointmentWriteBoundaryCard: (...args: Parameters<LifecyclePorts["enrichAppointmentWriteBoundaryCard"]>) => this.enrichAppointmentWriteBoundaryCard(...args),
   evidenceCheckText: (...args: Parameters<LifecyclePorts["evidenceCheckText"]>) => this.evidenceCheckText(...args), finishStopPersistence: (...args: Parameters<LifecyclePorts["finishStopPersistence"]>) => this.finishStopPersistence(...args), forceResetDeliveryState: (...args: Parameters<LifecyclePorts["forceResetDeliveryState"]>) => this.forceResetDeliveryState(...args),
   inventoryChanged: (...args: Parameters<LifecyclePorts["inventoryChanged"]>) => this.inventoryChanged(...args), lookupGovernanceClientProjection: (...args: Parameters<LifecyclePorts["lookupGovernanceClientProjection"]>) => this.lookupGovernanceClientProjection(...args), mergeReportState: (...args: Parameters<LifecyclePorts["mergeReportState"]>) => this.mergeReportState(...args),
   mirrorGovernanceFeedback: (...args: Parameters<LifecyclePorts["mirrorGovernanceFeedback"]>) => this.mirrorGovernanceFeedback(...args), notifyRoleState: (...args: Parameters<LifecyclePorts["notifyRoleState"]>) => this.notifyRoleState(...args), observeRoleEvent: (...args: Parameters<LifecyclePorts["observeRoleEvent"]>) => this.observeRoleEvent(...args),
   pendingAppTaskDelivery: (...args: Parameters<LifecyclePorts["pendingAppTaskDelivery"]>) => this.pendingAppTaskDelivery(...args), persistDeliveryQueues: (...args: Parameters<LifecyclePorts["persistDeliveryQueues"]>) => this.persistDeliveryQueues(...args), persistenceScope: (...args: Parameters<LifecyclePorts["persistenceScope"]>) => this.persistenceScope(...args),
   projectNote: (...args: Parameters<LifecyclePorts["projectNote"]>) => this.projectNote(...args), projectStateTool: (...args: Parameters<LifecyclePorts["projectStateTool"]>) => this.projectStateTool(...args), queueDirectNotification: (...args: Parameters<LifecyclePorts["queueDirectNotification"]>) => this.queueDirectNotification(...args),
   queueRebuildWritePermitsNotice: (...args: Parameters<LifecyclePorts["queueRebuildWritePermitsNotice"]>) => this.queueRebuildWritePermitsNotice(...args), rebuildIfBoundaryStale: (...args: Parameters<LifecyclePorts["rebuildIfBoundaryStale"]>) => this.rebuildIfBoundaryStale(...args), redispatchTask: (...args: Parameters<LifecyclePorts["redispatchTask"]>) => this.redispatchTask(...args),
   refuseUnprovenInstallation: (...args: Parameters<LifecyclePorts["refuseUnprovenInstallation"]>) => this.refuseUnprovenInstallation(...args), rememberAppTaskDelivered: (...args: Parameters<LifecyclePorts["rememberAppTaskDelivered"]>) => this.rememberAppTaskDelivered(...args), rememberReceipt: (...args: Parameters<LifecyclePorts["rememberReceipt"]>) => this.rememberReceipt(...args),
   reportPlanEscalation: (...args: Parameters<LifecyclePorts["reportPlanEscalation"]>) => this.reportPlanEscalation(...args), requestIdFor: (...args: Parameters<LifecyclePorts["requestIdFor"]>) => this.requestIdFor(...args), requestVersionDecision: (...args: Parameters<LifecyclePorts["requestVersionDecision"]>) => this.requestVersionDecision(...args),
   resumeDeferredRunChanges: (...args: Parameters<LifecyclePorts["resumeDeferredRunChanges"]>) => this.resumeDeferredRunChanges(...args), resumeDelivery: (...args: Parameters<LifecyclePorts["resumeDelivery"]>) => this.resumeDelivery(...args), roleActivityLogText: (...args: Parameters<LifecyclePorts["roleActivityLogText"]>) => this.roleActivityLogText(...args),
   roleStatusText: (...args: Parameters<LifecyclePorts["roleStatusText"]>) => this.roleStatusText(...args), routeDispatch: (...args: Parameters<LifecyclePorts["routeDispatch"]>) => this.routeDispatch(...args), runTaskIsFenced: (...args: Parameters<LifecyclePorts["runTaskIsFenced"]>) => this.runTaskIsFenced(...args),
   selectRunChangeForHandle: (...args: Parameters<LifecyclePorts["selectRunChangeForHandle"]>) => this.selectRunChangeForHandle(...args), sessionTailText: (...args: Parameters<LifecyclePorts["sessionTailText"]>) => this.sessionTailText(...args), targetKey: (...args: Parameters<LifecyclePorts["targetKey"]>) => this.targetKey(...args),
   terminateRoleRun: (...args: Parameters<LifecyclePorts["terminateRoleRun"]>) => this.terminateRoleRun(...args), withRequestLifecycle: (...args: Parameters<LifecyclePorts["withRequestLifecycle"]>) => this.withRequestLifecycle(...args), }, );
  // B2 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
  this.evidence = new Evidence(deps);
  // B6（2026-11-13）两阶段装配：`FixedDispatchPort`/`HandbackSink` 端口实例（箭头回调 → 门面同名薄委托； 运行期调用、参数逐位转发；构造期不触发任何端口方法）。
  this.handbackSink = { handleHandback: (projectRoot, runtime, hb, report, liveReport, liveDurability, flowId) => this.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId), handbackFlowId: (entry, hb) => this.handbackFlowId(entry, hb), }; this.persistence = new Persistence( {
   sessions: this.sessions, reportStates: this.reportStates, attemptStates: this.attemptStates, knownReports: this.knownReports, knownAttempts: this.knownAttempts, persistenceInFlight: this.persistenceInFlight, }, this.handbackSink, );
  // B6（2026-11-13）两阶段装配：回交状态由 ./session/handback.ts 的 Handback 单 owner 持有并创建 （方案 §3.6 的 2 个字段）；其余簇状态/未迁出方法经 refs 访问器与端口箭头延迟取值（构造期不触发）。
  this.handback = new Handback( { starTaskIds: this.starTaskIds, reportedTaskKeys: this.reportedTaskKeys, governanceHandbackMirrored: this.governanceHandbackMirrored, lastGovernanceRuntime: this.lastGovernanceRuntime, taskHandbackCommits: () => this.taskHandbackCommits, taskDeliveryCommits: () => this.taskDeliveryCommits,
   planEscalations: () => this.planEscalations, planEscalationPrompted: () => this.planEscalationPrompted, }, { findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId), activeRuntimeFor: (projectRoot) => this.activeRuntimeFor(projectRoot), enqueueDelivery: (projectRoot, targetRoleId,
   item) => this.enqueueDelivery(projectRoot, targetRoleId, item), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), }, deps, );
  // B3 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
  this.sessionEnv = new SessionEnv( { sessions: this.sessions, rebuildChains: this.rebuildChains, installationRefusals: this.installationRefusals, getSelectionVersion: () => this.selectionVersion, getBoundaryRefreshVersion: () => this.boundaryRefreshVersion, getActiveRoleId: () => this.activeRoleId, setActiveRoleId: (roleId) => {
   this.activeRoleId = roleId; }, }, { disposeEntry: (roleId, entry) => this.disposeEntry(roleId, entry), hasBusyRuntime: (runtime) => this.hasBusyRuntime(runtime), openInternalUnsafe: (req, userInitiated, selectionVersion, internalReopen) => this.openInternalUnsafe(req, userInitiated, selectionVersion,
   internalReopen), profileRevision: (runtime) => this.profileRevision(runtime), rebuildSession: (target, beforeDispose) => this.rebuildSession(target, beforeDispose), isCustomerInitiatedTurn: (projectRoot, runtime, roleId) => this.isCustomerInitiatedTurn(projectRoot, runtime, roleId), watchdogDeliver: (projectRoot,
   message) => this.watchdogDeliver(projectRoot, message), }, deps, );
  // B5（2026-11-13）两阶段装配：run-change 状态由 `./session/run-change.ts` 的 `RunChange` **单 owner 持有** （方案 §3.6 的 10 个字段；inventory 两项与 Delivery 共享同一 Set/Map 实例）；投递方法经端口箭头回调 注入，只在运行期调用（构造期不触发）。必须在 Delivery 之前构造：Delivery 的库存状态引用取自本对象。
  this.runChange = new RunChange( { sessions: this.sessions, observedHandles: this.observedHandles, openChains: this.openChains, lastRoleActivity: this.lastRoleActivity, managerId: this.managerId, deliveryQueues: () => this.deliveryQueues, activeDeliveries: () => this.activeDeliveries, drainClaimRecords: () => this.drainClaimRecords,
   taskDeliveryCommits: () => this.taskDeliveryCommits, taskHandbackCommits: () => this.taskHandbackCommits, }, { deliveryQueuePersistenceFacts: () => this.deliveryQueuePersistenceFacts() }, deps, );
  // B4（2026-11-13）两阶段装配：投递机状态由 `./session/delivery/queue.ts` 的 `Delivery` **单 owner 持有** （方案 §3.6 的 19 个字段）；未迁出的发送/生命周期方法经端口箭头回调注入，只在运行期调用（构造期不触发）。
  this.delivery = new Delivery( { sessions: this.sessions, lastGovernanceRuntime: this.lastGovernanceRuntime, activeDispatchKeys: this.activeDispatchKeys, starTaskIds: this.starTaskIds, enqueuedHandbackKeys: this.enqueuedHandbackKeys, openChains: this.openChains, attemptStates: this.attemptStates, lastRoleActivity: this.lastRoleActivity,
   observedInventoryRoots: this.observedInventoryRoots, inventoryPublicationErrors: this.inventoryPublicationErrors, }, { deliver: (entry, origin, text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume) => this.sendDelivery(entry, origin,
   text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume), openInternal: (req, userInitiated) => this.openInternal(req, userInitiated), healStaleOrigin: (entry, reasonCode) => this.healStaleOrigin(entry, reasonCode), beginDeliveryOrigin: (entry,
   clientMessageId) => this.beginDeliveryOrigin(entry, clientMessageId), trimDeliveryOrigins: (entry) => this.trimDeliveryOrigins(entry), failDeliveryOrigin: (entry, origin) => this.failDeliveryOrigin(entry, origin), hasBusyRuntime: (runtime) => this.hasBusyRuntime(runtime), profileRevision: (runtime) => this.profileRevision(runtime),
   findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId), noteWatchdogActivity: (projectRoot, reason) => this.noteWatchdogActivity(projectRoot, reason), inspectFixedHandbackChild: (projectRoot, handback, recipientRoleId, expectedFlowId) => this.inspectFixedHandbackChild(projectRoot,
   handback, recipientRoleId, expectedFlowId), runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId), isNetworkOffline: () => this.isNetworkOffline(), rememberReceipt: (entry, receipt) => this.rememberReceipt(entry, receipt), persistenceScope: (entry) => this.persistenceScope(entry),
   persistenceKey: (scope, id) => this.persistenceKey(scope, id), targetKey: (target) => this.targetKey(target), managerId: () => this.managerId, inventoryState: () => this.inventoryState, }, deps, this.sessionEnv, deps.deliveryQueueStorePath, );
  // B3 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
  this.tasks = new Tasks( { sessions: this.sessions, deliveryQueues: this.deliveryQueues, activeDeliveries: this.activeDeliveries, lastGovernanceRuntime: this.lastGovernanceRuntime, starTaskIds: this.starTaskIds, activeDispatchKeys: this.activeDispatchKeys, escalationRequests: this.escalationRequests,
   lastRoleActivity: this.lastRoleActivity, }, { restoreRequestState: (projectRoot, state) => this.restoreRequestState(projectRoot, state), restoreVersionDecisions: (projectRoot, state) => this.restoreVersionDecisions(projectRoot, state), findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot,
   roleId), enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey),
   stopExactController: (input, caller) => this.stopExactController(input, caller), ensureFreshRoleSession: (projectRoot, roleId, runtime) => this.ensureFreshRoleSession(projectRoot, roleId, runtime), withRequestLifecycle: (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride,
   lifecycle) => this.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle), }, deps, ); this.diagnostics = new Diagnostics( { sessions: this.sessions, deliveryQueues: this.deliveryQueues, activeDeliveries: this.activeDeliveries, openChains: this.openChains,
   rebuildChains: this.rebuildChains, lastGovernanceRuntime: this.lastGovernanceRuntime, lastRoleActivity: this.lastRoleActivity, lastTurns: this.lastTurns, lastAssistantText: this.lastAssistantText, governanceHandbackMirrored: this.governanceHandbackMirrored, governanceClientProjections: this.governanceClientProjections,
   getNetworkState: () => this.networkState, setNetworkState: (state) => { this.networkState = state; }, getActiveRoleId: () => this.activeRoleId, }, { openBackground: (req) => this.openBackground(req), sendBackground: (input) => this.sendBackground(input), notifyRoleState: (projectRoot, targetRoleId,
   runtime) => this.notifyRoleState(projectRoot, targetRoleId, runtime), drainAllQueuesFor: (projectRoot) => this.drainAllQueuesFor(projectRoot), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot,
   targetRoleId, item), }, deps, );
  // B5（2026-11-13）两阶段装配：cards 簇（方案 §3.6 的 7 个状态字段由 `Cards` 单 owner 持有并创建； version-decisions 经同一实例引用读写 versionDecisionPending/versionDecisionChains）； fixed 卡钩子（prepareFixedAppointmentCardRequest/recordFixedCardWorkflowResolution）经门面箭头注入。
  this.acceptanceFacts = new AcceptanceFacts(deps); this.cards = new Cards( { sessions: this.sessions, lastGovernanceRuntime: this.lastGovernanceRuntime, lastRoleActivity: this.lastRoleActivity, loadEffectiveConfig: this.loadEffectiveConfig, }, { findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot,
   roleId), activeRuntimeFor: (projectRoot) => this.activeRuntimeFor(projectRoot), enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), }, deps,
   this.evidence, this.acceptanceFacts, { prepareFixedAppointmentCardRequest: (projectRoot, flowId, request) => this.prepareFixedAppointmentCardRequest(projectRoot, flowId, request), recordFixedCardWorkflowResolution: (input) => this.recordFixedCardWorkflowResolution(input), }, ); this.versionDecisions = new VersionDecisions( this.cards,
   { sessions: this.sessions, lastGovernanceRuntime: this.lastGovernanceRuntime }, { findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId) }, deps, this.acceptanceFacts, );
  // B5 端口实例（方案 §3.3：由门面构造注入、运行期调用；B6/B7 的 fixed-workflow/lifecycle 经 CardGateway 发卡）。
  this.cardGateway = { presentAppCard: (input) => this.cards.presentAppCard(input), withRequestLifecycle: (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle) => this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride,
   lifecycle), offerRunChangeOnFrozenContract: (input) => this.cards.offerRunChangeOnFrozenContract(input), reportPlanEscalation: (projectRoot, input, signal) => this.cards.reportPlanEscalation(projectRoot, input, signal), }; this.controllerStopPort = { stopExactController: (input, caller) => this.runChange.stopExactController(input,
   caller) };
  // B6（2026-11-13）两阶段装配：fixed-workflow 模块（L5；白名单 card-gateway/evidence/run-change/git-ports） 与 dispatch 模块（L4；fixed 经 FixedDispatchPort 端口）。模块构造器零副作用（只存引用/箭头）； 端口只在运行期调用（两阶段装配）。构造顺序沿用 B3–B5 口径：全部下游模块实例先于本段就绪。
  this.fixedDispatchPort = { routeFixedPathDispatch: (projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId) => this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId), dispatchAdvisorySummary: (advisories) => this.dispatchAdvisorySummary(advisories),
   }; const fixedWorkflowRefs: FixedWorkflowRefs = { sessions: this.sessions, activeDispatchKeys: this.activeDispatchKeys, starTaskIds: this.starTaskIds, lastGovernanceRuntime: this.lastGovernanceRuntime, lastRoleActivity: this.lastRoleActivity, runChange: this.runChange, evidence: this.evidence, cardGateway: this.cardGateway,
   }; const fixedWorkflowPorts: FixedWorkflowPorts = { openInternal: (req, userInitiated) => this.openInternal(req, userInitiated), findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId), drainAllQueuesFor: (projectRoot) => this.drainAllQueuesFor(projectRoot), enqueueDelivery: (projectRoot,
   targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey), }; this.fixedWorkflowRoute = new FixedWorkflowRoute(fixedWorkflowRefs,
   fixedWorkflowPorts, deps); this.fixedWorkflowRelease = new FixedWorkflowRelease(fixedWorkflowRefs, fixedWorkflowPorts, deps); this.fixedWorkflowCards = new FixedWorkflowCards(fixedWorkflowRefs, fixedWorkflowPorts, this.fixedWorkflowRelease, deps); this.fixedWorkflowPanel = new FixedWorkflowPanel();
   this.dispatch = new Dispatch( { sessions: this.sessions, activeDispatchKeys: this.activeDispatchKeys, starTaskIds: this.starTaskIds, deliveredAppTaskIds: this.deliveredAppTaskIds, deliveredDeliveryKeys: this.deliveredDeliveryKeys, deliveryQueues: () => this.deliveryQueues, activeDeliveries: () => this.activeDeliveries,
   lastRoleActivity: this.lastRoleActivity, }, { openInternal: (req, userInitiated) => this.openInternal(req, userInitiated), findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId), enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId,
   item), drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime), appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey), appTaskClientMessageIdFromSeed: (seed) => this.appTaskClientMessageIdFromSeed(seed), deliveryIsStopped: (key) => this.deliveryIsStopped(key),
   runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId), routeStarDispatch: (projectRoot, runtime, fromRoleId, d, targetRoleId, task, source) => this.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source), }, this.fixedDispatchPort,
   deps, ); }
  // —————————————— G-2（W1）：看护的观察/活动转发与时钟 ——————————————
  /** 时钟（薄委托 → `shared/clock.ts`；注入以便单测；缺省 Date.now——与会话时间戳、投递入队时间同源）。 */
  private now(): number { return now(this.deps); }
  /** 转发一条结构化事件给看护器（隔离：看护回调抛错绝不影响会话/投递——看护永不阻断判定链）。 */
  private observeWatchdog(projectRoot: string, observation: WatchdogObservation): void { return this.lifecycle.observeWatchdog(projectRoot, observation); }
  /** 记一次**真实活动**（W3 滞回重武装信号；由本层判定后转发——`kind:"system"` 投递相关一律不记，防骚扰回路）。 */
  private noteWatchdogActivity(projectRoot: string, reason: string): void { return this.lifecycle.noteWatchdogActivity(projectRoot, reason); }
  /** 会话键（薄委托 → `shared/keys.ts`）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  /** 目标键（薄委托 → `shared/keys.ts`；只读状态回调保持原求值时机与次数）。 */
  private targetKey(target: string | SessionTarget): string | undefined { const state: TargetKeyState = { activeEntry: () => this.activeEntry(), activeRoleId: () => this.activeRoleId, sessionKeys: () => this.sessions.keys(), rebuildChainKeys: () => this.rebuildChains.keys(), }; return targetKey(target, state); }
  profileRevision(runtime: RuntimeKind): number { return this.lifecycle.profileRevision(runtime); }
  profileChanged(runtime: RuntimeKind): number { return this.lifecycle.profileChanged(runtime); }
  hasBusyRuntime(runtime: RuntimeKind): boolean { return this.lifecycle.hasBusyRuntime(runtime); }
  hasStaleProfile(runtime: RuntimeKind): boolean { return this.lifecycle.hasStaleProfile(runtime); }
  liveSessionViews(): { projectRoot: string; roleId: string; runtime: RuntimeKind; profileRevision: number }[] { return this.lifecycle.liveSessionViews(); }
  /** 聚合当前已打开会话的后台任务（2026-10-25）：按 `projectRoot + runtime` 过滤，直接读各句柄的 `listBackgroundTasks()`，**不缓存、不持久化**（任务只存在于会话内存）。句柄无该方法 ⇒ 跳过该角色； 没有任何具备能力的活会话 ⇒ 空列表 + `unavailable:true`（「没有任务」与「不支持」必须可区分）。 */
  listBackgroundTasks(projectRoot: string, runtime: RuntimeKind): BackgroundTasksListReply { return this.lifecycle.listBackgroundTasks(projectRoot, runtime); }
  /** 读取某会话内后台任务的状态与日志尾部（默认 both/40 行、上限 200 由底层钳制）。 找不到会话/句柄无能力如实失败；未知/已过期任务由底层返回 `undefined`——本层按失败回执，不造任务、不造日志。 */
  readBackgroundTask(input: BackgroundTaskReadInput): BackgroundTaskReadReply { return this.lifecycle.readBackgroundTask(input); }
  /** 停止某会话内的后台任务：底层结果（含 `unknown-task`/`closed`/`timeout`，以及成功）**原样返回**， 绝不改写成成功。找不到会话 ⇒ `closed`（会话不可用）；句柄无能力 ⇒ `unavailable`； 底层抛错 ⇒ 如实失败并带原始消息（不吞异常、不假装已停止）。 */
  async stopBackgroundTask(input: BackgroundTaskStopInput): Promise<BackgroundTaskStopReply> { return this.lifecycle.stopBackgroundTask(input); }
  /** 上下文来源投影（薄委托 → `shared/session-views.ts`；纯投影）。 */
  private contextInfo(handle: RoleSessionHandle): Pick<OpenResult,"contextSource" | "contextWarning"> { return contextInfo(handle); }
  /** **P0 收尾不变量（2026-10-30 现场）**：`busy` 已复位但 `origins.running` 仍残留的陈旧投递归属—— 标记 settled 并移除，记 `turn.origin-missing`。**只处理投递层状态，不伪造 turn**。 返回是否做了清理。 */
  private healStaleOrigin(entry: LiveSession, reasonCode: string): boolean { return this.lifecycle.healStaleOrigin(entry, reasonCode); }
  /** **turn lease**（P0：收尾不变量）：只有「未忙且没有正在跑的 origin」才能开跑新轮。 拿不到 lease ⇒ `undefined`（调用方入队/保留队首）——**绝不覆盖** `origins.running`（失败投递不得 删/盖另一个正在运行回合的归属）。 */
  private beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined { return this.lifecycle.beginDeliveryOrigin(entry, clientMessageId); }
  private captureDeliveryOrigin(entry: LiveSession, event: OrchestrationEvent): DeliveryOrigin | undefined { return this.lifecycle.captureDeliveryOrigin(entry, event); }
  private async sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback = false, handbackTaskId?: string, reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice = false, controllerResume?: ControllerResumeDelivery): Promise<void> { return this.lifecycle.sendDelivery(entry, origin, text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume); }
  private sendFacts(entry: LiveSession, origin: DeliveryOrigin): Pick<SendResult,'turnId' | 'clientMessageId' | 'inputAccepted' | 'outcome' | 'sessionCurrent'> { return this.lifecycle.sendFacts(entry, origin); }
  private trimDeliveryOrigins(entry: LiveSession): void { return this.lifecycle.trimDeliveryOrigins(entry); }
  private failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void { return this.lifecycle.failDeliveryOrigin(entry, origin); }
  /** 当前活动会话条目（无则 undefined）。 */
  private activeEntry(): LiveSession | undefined { return this.lifecycle.activeEntry(); }
  /** 释放一个保活会话；dispose 抛错如实返回原因（条目仍移出，不留半死项）。 **身份守卫（2026-10-13 状态机修复）**：只释放**仍在表中的这一条**（`get(roleId) === entry` 同一引用）—— 并发路径（settle 触发的 refreshStaleBoundaries 与用户下一次 send/open 各自的作废重建）在各自 `await` 期间可能已被对方替换/重建；照删会把**新会话（可能正在跑轮次）**误删并推 busy=false（真机「轮次还在跑 但忙态翻假」的根因一类）。已被替换 ⇒ 本调用 no-op（新条目的处置归它自己的路径）。 */
  private async disposeEntry(roleId: string, entry: LiveSession, heldLease?: ControllerDisposalLease): Promise<string | null> { return this.lifecycle.disposeEntry(roleId, entry, heldLease); }
  /** LRU 淘汰：保活数超出 `MAX_LIVE_SESSIONS` 时，从**最久未用**者起 dispose（直到回到上限）。 **P1-2（2026-10-13 客户裁定，提案首选方案）**：挑选判据加 `!busy`——**跳过正在跑轮次的会话** （后台在跑的同样计入 busy，B-2 下切走不停跑）；**全忙则允许暂时超限**（不掐断任何在跑任务）， 待某会话 settled（下一时机＝consume 的 settled 收口处）再收。切回被淘汰者的提示链路（D-1 recovered/rebuilt 文案）逐字未动——不出现第二套文案。 `keepRoleId`：本次**正在开启**的那个不淘汰（用户刚点的会话不能被自己的开启动作回收—— 「全忙暂超限」的子情形：除它之外全忙 ⇒ 暂超限）。 **2026-10-26 客户指令：主理（Lead，`primaryRoleId`）的会话不按容量淘汰**——主理会话设计为不关闭， 即使它是最久未用者。主理 id **逐会话按其所属项目**经 `deps.getListing` 解析（single/su 同口径； 多项目并存时各认各的主理，不硬编码角色 id）。显式生命周期（项目关闭/切换、边界陈旧重建、定向 stop） 不经本方法，行为不变；其余角色仍按既有 busy/LRU 规则淘汰。 */
  private async evictBeyondLimit(keepRoleId?: string): Promise<void> { return this.lifecycle.evictBeyondLimit(keepRoleId); }
  /** 该会话是否为其**所属项目**的主入口（主理 Lead；single/su 同口径，`primaryRoleId` 由门禁枚举给出， 不硬编码角色 id）。多项目并存时逐会话按各自 `projectRoot` 解析——A 项目的主理不会被 B 项目误 pin。 listing 精确 miss 时按斜杠变体兜底（同 `findListingForFeedback` 先例）；listing 暂不可得 ⇒ false （无主理信息，维持既有淘汰语义）。 */
  private isPrimarySession(entry: LiveSession): boolean { return this.lifecycle.isPrimarySession(entry); }
  // —————— O-1（2026-10-12）：边界快照检查与作废重建 —————— 真机现象：su 按流程改好角色的 boundary.yaml（盘上已含目标路径、pin 一致），但该角色的**活会话**仍在用 开会话时解析的旧边界 ⇒ 写入被拒（「目标路径未匹配任何边界条目」）。信号只取**读盘内容哈希** （可信信号，不用界面推测）；检出陈旧 ⇒ **作废重建**（dispose → 立即按新边界重开）并如实记一行。
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async boundaryDiff(entry: LiveSession): Promise<string | null> { return this.sessionEnv.boundaryDiff(entry); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async currentSkillPaths(projectRoot: string, roleId: string): Promise<string[] | null> { return this.sessionEnv.currentSkillPaths(projectRoot, roleId); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private rebuildIfBoundaryStale( roleId: string, userInitiated: boolean, selectionVersion = this.selectionVersion,
  // T3 B8.1：由 fixed 派发/投递的 forced 打开透传——陈旧重建后的会话仍按 fixed 重开（不会被聊天解析 在混合项目里换回 legacy）。settle 扫描/手动重建等调用不传，行为逐字不变。
  forcedWorkflowMode?: WorkflowMode, ): Promise<{ changed: string; reopened: OpenResult } | undefined> { return this.sessionEnv.rebuildIfBoundaryStale(roleId, userInitiated, selectionVersion, forcedWorkflowMode); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async rebuildIfBoundaryStaleUnsafe( roleId: string, userInitiated: boolean, selectionVersion: number, forcedWorkflowMode?: WorkflowMode, ): Promise<{ changed: string; reopened: OpenResult } | undefined> { return this.sessionEnv.rebuildIfBoundaryStaleUnsafe(roleId, userInitiated, selectionVersion, forcedWorkflowMode); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private queueRebuildWritePermitsNotice(sessionKey: string): void { this.sessionEnv.queueRebuildWritePermitsNotice(sessionKey); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  async refreshStaleBoundaries(): Promise<string[]> { return this.sessionEnv.refreshStaleBoundaries(); }
  /** 点角色 → 直接建立/续接会话（无确认框）。见上方类内注释：O-1 起，续接/开启前先查**边界快照**。 */
  async open(req: SessionOpenRequest): Promise<OpenResult> { return this.lifecycle.open(req); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async interpretDirective(request: DirectiveInterpretRequest): Promise<DirectiveInterpretResult> { return this.cards.interpretDirective(request); }
  /** **后台开启**（2026-10-18 客户修正）：应用代客户推进治理流程时打开目标治理角色会话。 与 `open` 同一会话键/续接/重建路径，但 `userInitiated=false`——**不抢 `activeRoleId`、不切当前 pane**， 也不动 `selectionTargetRoleId`/`selectionVersion`。失败如实返回，不自动重试。 */
  async openBackground(req: SessionOpenRequest): Promise<OpenResult> { return this.lifecycle.openBackground(req); }
  /** **后台投递**（2026-10-18 客户修正）：与 `send` 共用同一投递机/队列/忙态/真实状态外推， 但**不抢活动角色**（边界陈旧重建按非用户发起；即使 `activeRoleId` 为空也不因本消息复位）。 返回 `send` 的如实结果（失败不吞、不重试循环）。 **2026-10-25 真机重复投递修复**：本方法是**应用代客户推进**的唯一入口，默认给任务生成 **内容稳定 `clientMessageId`**（见 `APP_TASK_CLIENT_MESSAGE_ID_PREFIX`）——同一任务在重建 前后、或两条应用链路各发一次时**至多投递一次**（已投递/已入队 ⇒ 回 `duplicate:true`）。 `identitySeed`：调用方已有**语义去重键**（如 flow revision/交付集合指纹）时传入——同 content 但新 revision 的任务仍会作为新任务投递（文本未带 revision 的场景，如 delivered 唤醒）。 `stableIdentity:false` 只用于非任务的治理反馈镜像（同文可在不同轮次重复，保持既有语义）。 真实客户消息不经本方法，不受影响（同文重复发送仍是两个意图）。 `kind:"system"`（2026-10-26）：仅**治理唤醒**使用——目标忙时入队为 `DeliveryItem kind:"system"` （UI 显示「系统」、不可撤回）；缺省是客户消息类别（既有语义逐字不变）。 */
  async sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string; clientMessageId?: string; identitySeed?: string; stableIdentity?: boolean; kind?:"system" }): Promise<SendResult> { return this.lifecycle.sendBackground(input); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async queueDirectNotification(projectRoot: string, input: { key: string; recipientRoleId: string; message: string; source: Extract<import("../../../src/model/trunk.ts").DirectActionSource, { kind:"role-direct" }> }): Promise<void> { return this.delivery.queueDirectNotification(projectRoot, input); }
  /** 某角色当前是否有轮次在跑（纯读；W6-B 时序修复用）。 */
  isRoleBusy(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean { return this.lifecycle.isRoleBusy(projectRoot, roleId, runtime); }
  /** 该角色当前是否有**活会话**（纯读；链式推进的事实轮询护栏——会话被释放时不能断言「已 settled」）。 */
  hasLiveSession(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean { return this.lifecycle.hasLiveSession(projectRoot, roleId, runtime); }
  /** 上一轮是否被请求中止（纯读；链式推进的早失败护栏——中止 ≠ 正常结束，继续等下一次投递/重试）。 */
  wasLastTurnAborted(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean { return this.lifecycle.wasLastTurnAborted(projectRoot, roleId, runtime); }
  /** 该角色是否仍有排队/进行中的投递（纯读；链式推进的早失败护栏——有后续投递就不能断言「本轮即终局」）。 */
  hasPendingDelivery(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean { return this.lifecycle.hasPendingDelivery(projectRoot, roleId, runtime); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  requestRequirementChangeDecision(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; request: CustomerInputRequest; metadata?: CustomerInputMetadata; }): { ok: true; outcome: Promise<CustomerInputOutcome>; first: Promise<{ kind:"presented" } | { kind:"outcome"; outcome: CustomerInputOutcome }>; } | { ok: false; error: string } { return this.cards.requestRequirementChangeDecision(input); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async requestRunChangeDecision(input: { projectRoot: string; flowId: string; requestedBy?:"convener" | "planner" | "product"; reason?: string; proposed?: { documents: Record<string, string>; schemas: Record<string, string> }; }): Promise< | { ok: true; runId: string; outcome: Promise<CustomerInputOutcome>; first: Promise<{ kind:"presented" } | { kind:"outcome"; outcome: CustomerInputOutcome }>; }
  | { ok: false; error: string }
  > { return this.cards.requestRunChangeDecision(input); }
  // —————————————— 2026-11-04 trunk-amendment-model D1：应用自有客户卡（VCA/逐项/stable） ——————————————
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private pickGovernedCardEntry(projectRoot: string): LiveSession | undefined { return this.cards.pickGovernedCardEntry(projectRoot); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async presentAppCard(input: { projectRoot: string; request: CustomerInputRequest; metadata?: CustomerInputMetadata; requestId: string; signal?: AbortSignal; }): Promise<CustomerInputOutcome | undefined> { return this.cards.presentAppCard(input); }
  /** VCA 批准/拒绝卡（application-owned decision；客户本人；无通道 ⇒ unavailable/保持 submitted）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentVersionChangeCard(input: { projectRoot: string; record: VersionChangeRecord; signal?: AbortSignal; }): Promise<VcaCardOutcome> { return this.cards.presentVersionChangeCard(input); }
  /** 修正案逐项确认卡（只对实际变更项；acknowledgments 必选结算）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentAmendmentItemCard( input: AmendmentItemPresentation & { projectRoot: string; signal?: AbortSignal }, ): Promise<AmendmentItemOutcome> { return this.cards.presentAmendmentItemCard(input); }
  /** stable workflow 轻量确认卡（app-owned `stable-write`；独立结构校验；不签发许可）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentStableWriteCard(input: { projectRoot: string; record: StableWriteRecord; preview: StableWritePreview; signal?: AbortSignal; }): Promise<StableWriteCardOutcome> { return this.cards.presentStableWriteCard(input); }
  /** 幕僚/运营通知（只通知、无批准权；诚实行，不冒充客户决定）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  noteVersionChange(projectRoot: string, summary: string): void { return this.cards.noteVersionChange(projectRoot, summary); }
  /** 客户决定结果返回发起角色（如 product/rapporteur；只通知，不触发模型/门禁/派发）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  noteVersionChangeInitiator(projectRoot: string, roleId: string, summary: string): void { return this.cards.noteVersionChangeInitiator(projectRoot, roleId, summary); }
  // —————————————— 2026-11-05：方案升级报告卡（convener 提交 → 客户主权裁决） ——————————————
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult> { return this.cards.reportPlanEscalation(projectRoot, input, signal); }
  /** 方案升级卡决策后的如实通报与（仅「修订方案」时向策划 rapporteur 的）重做方案投递；不代客户决定、不改需求。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async afterPlanEscalation( projectRoot: string, input: { requestId: string; flowId: string }, outcome: CustomerInputOutcome | null | undefined, ): Promise<void> { return this.cards.afterPlanEscalation(projectRoot, input, outcome); }
  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async afterStableWrite( stack: VersionChangeStack, projectRoot: string, roleId: string, runtime: RuntimeKind, absPath: string, ): Promise<void> { return this.acceptanceFacts.afterStableWrite(stack, projectRoot, roleId, runtime, absPath); }
  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async enrichAppointmentWriteBoundaryCard( stack: VersionChangeStack, projectRoot: string, request: CustomerInputRequest, ): Promise<{ kind:"pass"; request: CustomerInputRequest } | { kind:"reject"; reason: string }> { return this.acceptanceFacts.enrichAppointmentWriteBoundaryCard(stack, projectRoot, request); }
  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async afterAppointmentWriteApproved( stack: VersionChangeStack, projectRoot: string, roleId: string, runtime: RuntimeKind, request: CustomerInputRequest, outcome: CustomerInputOutcome | null | undefined, ): Promise<void> { return this.acceptanceFacts.afterAppointmentWriteApproved(stack, projectRoot, roleId, runtime, request, outcome); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async activeRunViews(projectRoot: string): Promise<{ ok: true; runs: ActiveRunView[] } | { ok: false; error: string }> { return this.cards.activeRunViews(projectRoot); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async proposalCardFrozenRejection( projectRoot: string, request: CustomerInputRequest, metadata: CustomerInputMetadata | undefined, sourceRoleId?: string, ): Promise<{ rejection: MechanicalRejection; presented: boolean } | undefined> { return this.cards.proposalCardFrozenRejection(projectRoot, request, metadata, sourceRoleId); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async pendingVersionChangesFor( projectRoot: string, ): Promise<{ ok: true; pending: Array<{ applicationId: string; status: string }> } | { ok: false; reason: string }> { return this.cards.pendingVersionChangesFor(projectRoot); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async offerRunChangeOnFrozenContract(input: { projectRoot: string; flowId: string; manifest: RunManifest; newer: NewerContractDoc[]; reason: string;
  /** 三段式 missing 用（「拒绝：缺少 …」通顺的名词短语）；缺省回退 reason。 */
  missing?: string; requestedBy?:"convener" | "planner" | "product";
  /** AC-17：系统行落位（来源角色；缺省 chief）。 */
  noteRoleId?: string; }): Promise<{ rejection: MechanicalRejection; presented: boolean }> { return this.cards.offerRunChangeOnFrozenContract(input); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  governanceOwnerRoleId(projectRoot: string): string | null { return this.diagnostics.governanceOwnerRoleId(projectRoot); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  governanceRuntimeFor(projectRoot: string): RuntimeKind | undefined { return this.diagnostics.governanceRuntimeFor(projectRoot); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined { return this.diagnostics.activeRuntimeFor(projectRoot); }
  /** 该 flow 是否仍有**在途**派发/回交/运行轮次（纯读；2026-10-19 验收自动派发用）。 有 ⇒ 验收检查推迟到下一次事件，避免在交付完成前抢跑派 Proof；不制造第二份状态。 */
  async refreshListingNow(projectRoot: string): Promise<boolean> { return refreshListingNow(projectRoot, this.deps); }
  /** **等待某角色下一轮 settle**（W6-B 真机阻塞修复；只等一次、有上限）：客户决定卡是在来源角色 **本轮中途**作答的，来源本轮可能还在写角色卡/提案——先等它收尾（settle），再让应用推进下一步。 · 无会话 / 当前不忙 ⇒ 立即 true（无需等）； · 超时（缺省 60s）⇒ false（调用方记诊断后**照常继续**，绝不循环重试）； · 会话被 dispose ⇒ false（解析，不悬挂）。 */
  waitForRoleSettle( projectRoot: string, roleId: string, runtime: RuntimeKind, timeoutMs = 60_000, ): Promise<boolean> { return this.lifecycle.waitForRoleSettle(projectRoot, roleId, runtime, timeoutMs); }
  /** **等待角色真正空闲**（链式治理推进用，2026-10-18 真机修正）：`busy !== true` **且**该角色的投递队列为空。 与 `waitForRoleSettle` 的差别：后者只等「下一轮 settle」——若目标在收到任务前正忙、任务经既有投递机 排队，第一次 settle 只结束**上一轮**，本次任务尚未跑完。链式检查「Convener 是否写出了流程单」必须等 本次任务真正结束。**只等待、不重投、不重试**；超时或会话释放 ⇒ false（调用方如实报错、不循环）。 **注意（2026-10-20 真机）**：本方法以「会话条目存在 + 不忙 + 队列空」判空闲——刚投递（会话可能被 并发重建/释放）时会立即返回 false，真机因此产生 5ms 假错误。**链式治理推进已改用目标事实轮询** （`interface.ts::advanceGovernanceFlow`，读流程 YAML / 角色卡枚举）；新调用方不要再用它断定 「某个任务是否完成」。保留仅为既有 API 兼容。 */
  waitForRoleIdle( projectRoot: string, roleId: string, runtime: RuntimeKind, timeoutMs = 60_000, ): Promise<boolean> { return this.lifecycle.waitForRoleIdle(projectRoot, roleId, runtime, timeoutMs); }
  private async openInternal(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion): Promise<OpenResult> { return this.lifecycle.openInternal(req, userInitiated, selectionVersion); }
  /** `open` 的实现（`userInitiated=false` = 投递机后台自动开启：不抢活动角色，其余逐字同）。 `internalReopen=true`（G-2/W4；仅重建链内续段使用——陈旧重建与人工 `rebuildSession`）： **不再查陈旧、不再入 rebuild 链**——① 防「链内等待自身尾」的自死锁（rebuildIfBoundaryStaleUnsafe 的 重开处于该角色的 rebuild 链内，再入链会等自己）；② 此时旧条目已被本链 dispose；若并发方已重建出新会话， 如实按续接返回（不重复重建——重开目标已达成）。 */
  private async openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion, internalReopen = false, lifecycle = this.deliveryLifecycle(this.sessionKey(req.projectRoot, req.roleId, req.runtime))): Promise<OpenResult> { return this.lifecycle.openInternalUnsafe(req, userInitiated, selectionVersion, internalReopen, lifecycle); }
  /** 事件消费循环（**每会话一个，后台持续拉取**，B-2）：切走不停拉——重 pin/回交/适配器队列消费都依赖 拉取（事件流是拉驱动的）；事件带 `roleId` 信封外推，渲染侧按角色分发（多会话并存不会串消息）。 */
  private consume(key: string, entry: LiveSession): void { return this.lifecycle.consume(key, entry); }
  /** 发送一轮消息给**当前活动会话**（最近一次 open 的角色）；可反复调用。 **L-1（2026-10-12 客户裁定「每个角色…有个队列的概念」）**：角色**忙时不再直接失败**（旧行为＝直转 SDK、 被回 "already processing" 报错给客户）——客户消息作为**第三类**并入**同一条**投递队列（E-1/H-1 共用）， 按到达序在当前任务结束后执行；空闲路径同样声明聊天来源。返回 `queued:true + position`（界面据此如实提示）。 **P0-1（2026-10-13 客户批准）**：`opts`（图片载荷）为**可选**——忙时**入队即定格**（排队后到投递都带 原图）；空闲直发与出队均组合本轮来源和 ACK，images 数组保持原引用。 */
  async send(text: string, opts?: PromptOptions, target?: SessionTarget, metadata?: SessionMessageMetadata): Promise<SendResult> { return this.lifecycle.send(text, opts, target, metadata); }
  /** **停当前轮次（P0-2 UI，2026-10-13 客户批准）**：向指定角色的会话句柄请求中止当前进行中的轮次。 **三态如实回传**（契约形状 `RoleSessionAbortResult`，语义钉死在编排 run-role.ts）： - `{ok:true, supported:true}` —— 已请求停止（轮次仍以既有 `settled` 收尾——**不做乐观「已停止」假象**）； - `{ok:false, supported:false, error}` —— 句柄方法缺席（旧替身）或底层会话不带 abort（如 demo 替身） ——「当前运行时不支持停止」，**绝不假装已停**； - `{ok:false, supported:true, error}` —— 底层 abort 报错：错误原文如实上抛，不吞。 幂等：无在飞轮次 = no-op（底层不抛错、无副作用——abort 语义已在适配器环测试钉死）。 */
  async abort(target: string | SessionTarget): Promise<RoleSessionAbortResult> { return this.lifecycle.abort(target); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private forceResetDeliveryState(entry: LiveSession, reasonCode: string): void { this.delivery.forceResetDeliveryState(entry, reasonCode); }
  /** 关闭会话（B-2：**定向**）。给定 `roleId` 只关该角色（历史留在界面上）；缺省/`null` 关**全部** （换项目/退出时用）。dispose 出错如实返回（不静默）。 */
  async stop(target?: string | SessionTarget | null): Promise<StopResult> { return this.lifecycle.stop(target); }
  /** 是否还有**任何**保活会话（B-2：不再是「唯一句柄」语义）。 */
  isOpen(): boolean { return this.lifecycle.isOpen(); }
  /** 当前**活动**（最近一次**用户发起**的 open）的角色 id；无则 null（后台自动开启不改变它）。 */
  openForRoleId(): string | null { return this.lifecycle.openForRoleId(); }
  /** 保活中的角色 id 列表（B-3 状态徽标「空闲/已停止」派生据它 + 渲染侧的数据源）。 */
  liveRoleIds(): string[] { return this.lifecycle.liveRoleIds(); }
  // —————— 投递机（E-1 回交投 su + H-1 派发投目标角色；**同一套**，不造第二套） ——————
  /** **回交主人**角色 id（评审 §5.6，数据驱动、不硬编码）： · trio → `governanceFunction === "schedule"` 的角色（Convener）； · single → 门禁枚举给的 `primaryRoleId`（旧 su）。 回交、看护系统消息、恢复回执、投递失败系统行全部用它；`primaryRoleId` 只用于主入口/客户镜像。 枚举不到 → null（投递机按既有「目标未枚举」路径保留待重试，绝不静默丢）。 */
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  /** B 批：任务/汇报主链的幕僚角色 id（**只认真实 chief**，不把旧 liaison 别名算作星形主链）。 */ /** 登记任务创建者（读盘重放/新建/重派共用；缺字段的旧记录按 chief 兼容）。 */
  private rememberTaskCreator(taskId: string, created: { from?:"chief" | "convener" } | undefined): void { rememberTaskCreator(taskId, created); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  /** B 批：任务/汇报状态读取（坏行跳过；读失败按空状态 + 诊断，不阻塞）。 */
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  /** T3 B1：该任务是否为 fixed 任务（`task.created.workflowId` 命名空间；固定路径无 legacy run 绑定）。 */
  private async isFixedTask(projectRoot: string, taskId: string | undefined): Promise<boolean> { return isFixedTask(projectRoot, taskId); }
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async inspectFixedHandbackChild( projectRoot: string, handback: TaskHandback, recipientRoleId: string, expectedFlowId: string | undefined, ): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }> { return this.fixedWorkflowCards.inspectFixedHandbackChild(projectRoot, handback, recipientRoleId, expectedFlowId); }
  /** B 批：追加任务事件；失败只记诊断并返回 false（调用方决定是否 fail-closed）。 */
  private async appendTaskStateResult(projectRoot: string, event: TaskStateEvent): ReturnType<typeof recordTaskObservation> { return appendTaskStateResult(projectRoot, event); }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> { return appendTaskState(projectRoot, event); }
  private async recordTaskFailure(projectRoot: string, taskId: string, summary: string): Promise<boolean> { return recordTaskFailure(projectRoot, taskId, summary, () => this.now()); }
  /** B 批：每角色运行日志观察器（应用侧写，不依赖角色上报；失败只诊断、绝不打断事件循环）。 */
  private appendRoleActivity( projectRoot: string, roleId: string, input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string }, ): Promise<void> { return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.lastRoleActivity, now: () => this.now() }); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private observeRoleEvent(projectRoot: string, roleId: string, event: OrchestrationEvent): void { this.tasks.observeRoleEvent(projectRoot, roleId, event); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async roleActivityLogText(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> { return this.tasks.roleActivityLogText(projectRoot, query); }
  // —————————————— B 批：任务列表 / 重启恢复 / 终止 / 重派（界面与专项测试入口） ——————————————
  /** C 批：申请 id（稳定：来源/轮次/工具调用/卡片内容；同一调用重放同 id）。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private requestIdFor(projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata?: CustomerInputMetadata): string { return this.cards.requestIdFor(projectRoot, sourceRoleId, request, metadata); }
  /** C 批：系统通知幕僚（按 requestId+event 去重；系统行不是客户卡/不是决定）。返回可等待的落盘链。 */ /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private notifyRequest( projectRoot: string, requestId: string, sourceRoleId: string, title: string, event:"created" | "presented" | "resolved", detail?: string, after?: Promise<unknown>, ): Promise<void> { return this.cards.notifyRequest(projectRoot, requestId, sourceRoleId, title, event, detail, after); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async recordRequestPresented(projectRoot: string, requestId: string, sourceRoleId: string, title: string, to:"customer" | "judge" | "chief", notify = true): Promise<void> { return this.cards.recordRequestPresented(projectRoot, requestId, sourceRoleId, title, to, notify); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async appointmentWriteApplicationRejection( projectRoot: string, request: CustomerInputRequest, metadata: CustomerInputMetadata | undefined, ): Promise<string | undefined> { return this.cards.appointmentWriteApplicationRejection(projectRoot, request, metadata); }
  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async enrichAcceptanceJudgeContext( projectRoot: string, request: CustomerInputRequest, metadata: CustomerInputMetadata | undefined, sourceRoleId: string, ): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }> { return this.acceptanceFacts.enrichAcceptanceJudgeContext(projectRoot, request, metadata, sourceRoleId); }
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async withRequestLifecycle( projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata: CustomerInputMetadata | undefined, raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined, buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1], requestIdOverride?: string, lifecycle?: { notify?:"default" | "resolved-only" | "none"; signal?: AbortSignal;
  /** 下载卡事实不可用时附在客户卡上的提示（其他卡种不传）。 */
  judgeNotice?: string;
  /** 卡片实际呈现（客户或 judge）后回调一次（下载 presenter 用它上报 requestId）。 */
  onPresented?: () => void; }, ): Promise<CustomerInputOutcome | null | undefined> { return this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async readRoleActivityLog(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> { return this.tasks.readRoleActivityLog(projectRoot, query); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async listTasks(projectRoot: string): Promise<TaskListView> { return this.tasks.listTasks(projectRoot); }
  // —————————————— 2026-11-02：全局任务状态 / 版本决策（A2） ——————————————
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async projectStateView(projectRoot: string, scope: { roleId?: string; viewerRoleId?: string; full?: boolean; flowId?: string; now?: Date } = {}): Promise<ProjectStateView> { return this.tasks.projectStateView(projectRoot, scope); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async projectStateTool(projectRoot: string, roleId: string, query: { flowId?: string }): Promise<ProjectStateToolResult> { return this.tasks.projectStateTool(projectRoot, roleId, query); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async projectNote(input: { projectRoot: string; roleId: string; input: ProjectNoteInput }): Promise<ProjectNoteResult> { return this.tasks.projectNote(input); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private versionDecisionSubjectKey(projectRoot: string, subject: VersionDecisionRequestSubject): string { return this.versionDecisions.versionDecisionSubjectKey(projectRoot, subject); }
  /** 与 A1 `versionDecisionAttempt` 同口径的结构化匹配（runId/flowId 前缀碰撞防护）。 */ /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private isVersionDecisionRequestIdForSubject(requestId: string, subject: VersionDecisionRequestSubject): boolean { return this.versionDecisions.isVersionDecisionRequestIdForSubject(requestId, subject); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private findPendingVersionDecision(events: readonly TaskStateEvent[], flowId: string, subject: VersionDecisionRequestSubject): string | undefined { return this.versionDecisions.findPendingVersionDecision(events, flowId, subject); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private pendingRequestIdsForFlow(events: readonly TaskStateEvent[], flowId: string): string[] { return this.versionDecisions.pendingRequestIdsForFlow(events, flowId); }
  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private countAcceptanceRejections(events: readonly TaskStateEvent[], flowId: string): number { return this.acceptanceFacts.countAcceptanceRejections(events, flowId); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private countPriorVersionDecisions(events: readonly TaskStateEvent[], flowId: string, runId?: string): number { return this.versionDecisions.countPriorVersionDecisions(events, flowId, runId); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private buildVersionDecisionFacts(view: ProjectStateView, events: readonly TaskStateEvent[], subject: VersionDecisionRequestSubject): VersionDecisionFacts { return this.versionDecisions.buildVersionDecisionFacts(view, events, subject); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private versionDecisionCardLabels(facts: VersionDecisionFacts, flowId: string): VersionDecisionCardLabels { return this.versionDecisions.versionDecisionCardLabels(facts, flowId); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private decidedByText(decidedBy: VersionDecisionDecidedBy): string { return this.versionDecisions.decidedByText(decidedBy); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private formatTargetVersions(targets: Record<string, number>): string { return this.versionDecisions.formatTargetVersions(targets); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private stripVersionDecisionPrefix(text: string): string { return this.versionDecisions.stripVersionDecisionPrefix(text); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private nextVersionFlowId(oldFlowId: string, existing: ReadonlySet<string>): string | undefined { return this.versionDecisions.nextVersionFlowId(oldFlowId, existing); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private mapVersionDecisionRawOutcome(outcome: CustomerInputOutcome | null | undefined): CustomerInputOutcome | null | undefined { return this.versionDecisions.mapVersionDecisionRawOutcome(outcome); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private appendVersionDecisionAudit(projectRoot: string, fields: Omit<VersionDecisionEvent,"v" | "kind" | "at">): Promise<boolean> { return this.versionDecisions.appendVersionDecisionAudit(projectRoot, fields); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async emitVersionDecisionResolved(projectRoot: string, runtime: RuntimeKind, roleId: string, requestId: string, detail: string): Promise<void> { return this.versionDecisions.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, detail); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  async requestVersionDecision(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; request: VersionDecisionRequest; signal?: AbortSignal; }): Promise<VersionDecisionResult> { return this.versionDecisions.requestVersionDecision(input); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }> { return this.versionDecisions.restoreVersionDecisions(projectRoot, state); }
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async restoreRequestState( projectRoot: string, state: TaskReplay, ): Promise<{ orphaned: number; expired: number }> { return this.versionDecisions.restoreRequestState(projectRoot, state); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async restoreTasks(projectRoot: string): Promise<TaskRestoreReport> { return this.tasks.restoreTasks(projectRoot); }
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined { return this.lifecycle.findLiveRuntime(projectRoot, roleId); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async partialArtifactsFor(projectRoot: string, roleId: string, taskId: string | undefined, since?: string): Promise<string[]> { return this.tasks.partialArtifactsFor(projectRoot, roleId, taskId, since); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private roleTempDir(projectRoot: string, roleId: string): { abs: string; rel: string } | undefined { return this.tasks.roleTempDir(projectRoot, roleId); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async isolatePartialArtifacts( projectRoot: string, roleId: string, taskId: string | undefined, since?: string, ): Promise<{ artifacts: string[]; stagingDir?: string }> { return this.tasks.isolatePartialArtifacts(projectRoot, roleId, taskId, since); }
  /** B-07：确保目标角色使用 fresh 会话（现有会话重建；无会话则交由投递自动新开）。 */
  private async ensureFreshRoleSession(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<{ ok: boolean; rebuilt: boolean; error?: string }> { return this.lifecycle.ensureFreshRoleSession(projectRoot, roleId, runtime); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private chooseRedispatchTarget(projectRoot: string, currentRoleId: string, attempts: number): string { return this.tasks.chooseRedispatchTarget(projectRoot, currentRoleId, attempts); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private controllerProducerFacts(projectRoot: string, taskId: string, caller: ActualDispatchSource): DesktopControllerStopFact["knownProducers"] | undefined { return this.runChange.controllerProducerFacts(projectRoot, taskId, caller); }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult> { return this.runChange.stopExactController(input, caller); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async terminateRoleRun(input: TerminateRoleRunInput, chiefSource?: ActualDispatchSource): Promise<TerminateRoleRunResult> { return this.tasks.terminateRoleRun(input, chiefSource); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private taskChainRootOf(state: TaskReplay, taskId: string): string { return this.tasks.taskChainRootOf(state, taskId); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult> { return this.tasks.redispatchTask(input); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async closeTask(input: CloseTaskInput): Promise<CloseTaskResult> { return this.tasks.closeTask(input); }
  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private escalateStuckTask( projectRoot: string, taskId: string, rootTaskId: string, attempts: number, taskFlowId?: string, targetRoleId?: string, targetRuntime?: RuntimeKind, ): Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }> { return this.tasks.escalateStuckTask(projectRoot, taskId, rootTaskId, attempts, taskFlowId, targetRoleId, targetRuntime); }
  /** **派发主人**角色 id（routeDispatch 的来源防御性校验）：trio → Convener；single → 主入口（su）。 正常路径由 `open()` 的能力注入保证；此处只做防御性再校验（绝不静默换人）。 */
  private dispatcherRoleIdOf(projectRoot: string): string | null { return dispatcherRoleIdOf(projectRoot, this.deps); }
  /** 投递进展的**系统行**（首选进目标/请求者的 pane；首选未知时退回兜底角色）——如实、不静默。 */
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void { emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private governanceProjectionKey(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string { return this.diagnostics.governanceProjectionKey(projectRoot, roleId, runtime, text); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private governanceProjectionFingerprint(input: { sourceRoleId: string; statusCode: GovernanceClientProjectionV1["statusCode"]; flowIds: readonly string[]; reportPath?: string; governancePath?: string; text: string; }): string { return this.diagnostics.governanceProjectionFingerprint(input); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private registerGovernanceClientProjection( projectRoot: string, roleId: string, runtime: RuntimeKind, text: string, projection: GovernanceClientProjectionV1, ): void { this.diagnostics.registerGovernanceClientProjection(projectRoot, roleId, runtime, text, projection); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private lookupGovernanceClientProjection( projectRoot: string, roleId: string, runtime: RuntimeKind, text: string, ): GovernanceClientProjectionV1 | undefined { return this.diagnostics.lookupGovernanceClientProjection(projectRoot, roleId, runtime, text); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async mirrorGovernanceFeedback( projectRoot: string, runtime: RuntimeKind, roleId: string, options: { flowIds?: readonly string[]; outcome?: RuntimeTurnOutcome } = {}, ): Promise<void> { return this.diagnostics.mirrorGovernanceFeedback(projectRoot, runtime, roleId, options); }
  /** Proof settle 的报告指针：优先用本轮投递 origin 的 flowId；缺失时按账本 verifier 派发记录取最近的 flow（有界；读不到 ⇒ 空集，只给通用目录指针）。**只读**，不猜验收结论、不伪造报告版本。 */
  private resolveProofFlowIds(_projectRoot: string, hinted?: readonly string[]): string[] { return resolveProofFlowIds(_projectRoot, hinted); }
  /** `mirrorGovernanceFeedback` 的 listing 查找：精确命中优先；miss 时按斜杠变体再查（仅查找，不改 key）。 */
  private findListingForFeedback(projectRoot: string): ProjectListing | undefined { return findListingForFeedback(projectRoot, this.deps); }
  /** 角色显示名（listing 的 `displayName`；无则 roleId）——用于派发正文来源与治理反馈文案。 */
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  /** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string { return queueKey(projectRoot, targetRoleId, runtime); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appTaskClientMessageId(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string { return this.delivery.appTaskClientMessageId(projectRoot, roleId, runtime, text); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appTaskClientMessageIdFromSeed(seed: string): string { return this.delivery.appTaskClientMessageIdFromSeed(seed); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appDispatchClientMessageId(dedupKey: string): string { return this.delivery.appDispatchClientMessageId(dedupKey); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private rememberAppTaskDelivered(clientMessageId: string | undefined): void { this.delivery.rememberAppTaskDelivered(clientMessageId); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private pendingAppTaskDelivery( projectRoot: string, targetRoleId: string, runtime: RuntimeKind, clientMessageId: string, ): { queued: boolean; position?: number } | undefined { return this.delivery.pendingAppTaskDelivery(projectRoot, targetRoleId, runtime, clientMessageId); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem,"enqueuedAt">): void { this.delivery.enqueueDelivery(projectRoot, targetRoleId, item); }
  // —————— 2026-10-20 客户要求：投递队列持久化 + 重启自动续跑（不写项目文件；路径由 Interface 提供） ——————
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private persistableDeliveryItem(item: DeliveryItem): PersistedDeliveryItemV1["item"] | undefined { return this.delivery.persistableDeliveryItem(item); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private deliveryStoreItems(): PersistedDeliveryItemV1[] { return this.delivery.deliveryStoreItems(); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts { return this.delivery.deliveryQueuePersistenceFacts(); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private async finishStopPersistence(result: StopResult): Promise<StopResult> { return this.delivery.finishStopPersistence(result); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private persistDeliveryQueues(): void { this.delivery.persistDeliveryQueues(); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private parsePersistedDeliveryItem(raw: unknown): { projectRoot: string; roleId: string; runtime: RuntimeKind; item: DeliveryItem } | undefined { return this.delivery.parsePersistedDeliveryItem(raw); }
  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  async restorePersistedDeliveries(): Promise<DeliveryQueueRestoreReport> { return this.delivery.restorePersistedDeliveries(); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  withdraw(targetInput: string | SessionTarget, id: string): WithdrawResult { return this.delivery.withdraw(targetInput, id); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void { this.delivery.notifyRoleState(projectRoot, targetRoleId, runtime); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  broadcastRoleStates(): void { this.delivery.broadcastRoleStates(); }
  // —————————————— P2（2026-10-30）：网络状态 → 队列/状态快照 ——————————————
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private isNetworkOffline(): boolean { return this.diagnostics.isNetworkOffline(); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  applyNetworkState(state: NetworkState): void { this.diagnostics.applyNetworkState(state); }
  /** 持久化 scope（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private persistenceScope(entry: LiveSession): PersistenceScope { return this.persistence.persistenceScope(entry); }
  /** 持久化键（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private persistenceKey(scope: PersistenceScope, id: string): string { return this.persistence.persistenceKey(scope, id); }
  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private displayHandback(event: HandbackEvent): DesktopOrchestrationEvent { return this.handback.displayHandback(event); }
  /** 合并报告保存状态（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private mergeReportState(entry: LiveSession, event?: HandbackEvent, update?: ReportSaveStateV1, updatedId?: string): void { this.persistence.mergeReportState(entry, event, update, updatedId); }
  /** 登记投递回执（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void { this.persistence.rememberReceipt(entry, receipt); }
  /** 登记历史报告/回执 id（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  registerPersistenceHistory(history: import('../runtime-history.ts').SessionHistoryView): void { this.persistence.registerPersistenceHistory(history); }
  /** 持久化操作（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  async persistenceOperation<K extends keyof PersistenceValues>(scope: PersistenceScope, operation: K, id?: string): Promise<PersistenceReply<PersistenceValues[K]>> { return this.persistence.persistenceOperation(scope, operation, id); }
  /** 回交到达（E-1）：**去重登记**（`handbackKey` 单一来源——一条回交只投递一次）→ 入队 → 尝试投递。 **真机崩溃修复（2026-10-12）**：本函数经 `void` fire-and-forget 调用（consume 的事件循环），**任何上抛 都会变成未捕获拒绝**——故：(1) 形状防御（缺 `handback` 载荷 / 缺 `roleId`）先拦；(2) `renderHandbackPrompt` 渲染包 try/catch（坏形状绝不喂给它）；(3) 整体再包一层 catch——一切都落**如实系统行**，绝不上抛。 */ /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined { return this.handback.handbackFlowId(entry, hb); }
  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?:'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> { return this.handback.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId); }
  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private async commitHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?:'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> { return this.handback.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId); }
  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> { return this.dispatch.routeDispatch(projectRoot, runtime, fromRoleId, d, source); }
  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async chainDispatchFacts(projectRoot: string, flowHint: string | undefined): Promise<{ flowId?: string; intent: { found: boolean; candidates: number }; proposalFound: boolean; architectureFound: boolean; roster?: RosterLoadResult; d3Selected: string[]; d3DecisionId?: string; handoffFound: boolean; selectedCardsFound: boolean; missingSelectedCardIds: string[]; }> { return this.dispatch.chainDispatchFacts(projectRoot, flowHint); }
  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private captureChiefDispatchSource(projectRoot: string, runtime: RuntimeKind, source?: ActualDispatchSource) { return this.dispatch.captureChiefDispatchSource(projectRoot, runtime, source); }
  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async resumeChiefController(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> { return this.dispatch.resumeChiefController(projectRoot, runtime, fromRoleId, d, source); }
  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async routeStarDispatch( projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, targetRoleId: string, task: string, source?: ActualDispatchSource, ): Promise<DispatchReceipt> { return this.dispatch.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source); }
  /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
  private async routeFixedPathDispatch( projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, targetRoleId: string, task: string, source: ActualDispatchSource | undefined, dispatchFlowId: string, ): Promise<DispatchReceipt> { return this.fixedWorkflowRoute.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId); }
  // —————————————— T3 B3（2026-11-10 两条固定工作流路径）：fixed 应用接线 —————————————— 依据：v1.3 §4.2 A9/A12、§4.3 路径 B、§5（基线）、§6.4/§8.4（merge-main）、§7.1/§7.4； B3 验收 AC-09/AC-10/AC-11/AC-14/AC-15/AC-16/AC-20/AC-22、T-07/T-10/T-11/T-12。 纪律：桌面只做**应用接线**（可信身份绑定、证据收集、卡通道），业务校验/幂等/账本在编排服务； legacy 分支逐字保留；fixed 失败不产生客户卡（merge-main 除外，按高风险动作出卡）。
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async completeTeamPlanFixedForHandle( projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, request: Parameters<CompleteTeamPlanFn>[0], signal?: AbortSignal, ): Promise<CompleteTeamPlanFixedResult> { return this.fixedWorkflowCards.completeTeamPlanFixedForHandle(projectRoot, runtime, handle, request, signal); }
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async closeCreatedTaskFixedForSession( projectRoot: string, actorRoleId: string, input: FixedCloseCreatedTaskToolInput, signal?: AbortSignal, ): Promise<Awaited<ReturnType<typeof closeFixedWorkflowTask>>> { return this.fixedWorkflowCards.closeCreatedTaskFixedForSession(projectRoot, actorRoleId, input, signal); }
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async verifyFixedReviewCloseBasis( projectRoot: string, input: FixedCloseCreatedTaskToolInput, ): Promise<{ ok: true } | WorkflowServiceFailure> { return this.fixedWorkflowCards.verifyFixedReviewCloseBasis(projectRoot, input); }
  /** fixed 复核产物回退（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async findFixedReviewArtifact( projectRoot: string, flowId: string | undefined, stage:"A12a" | "A12b", ): Promise<WorkflowArtifactRef | undefined> { return this.evidence.findFixedReviewArtifact(projectRoot, flowId, stage); }
  /** fixed 收口证据（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async buildFixedCloseEvidence( projectRoot: string, taskId: string, note: string | undefined, ): Promise< | { ok: true; evidence: { artifacts?: WorkflowArtifactRef[]; branchTipOid?: string; acceptanceArchive?: { path: string; sha256: string } } | undefined }
  | WorkflowServiceFailure > { return this.evidence.buildFixedCloseEvidence(projectRoot, taskId, note); }
  /** 固定方案卡 documentRefs（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async collectFixedProposalDocumentRefs( projectRoot: string, flowId: string, ): Promise<{ ok: true; refs: WorkflowDocumentRef[] } | WorkflowServiceFailure> { return this.evidence.collectFixedProposalDocumentRefs(projectRoot, flowId); }
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async prepareFixedAppointmentCardRequest( projectRoot: string, flowId: string, request: CustomerInputRequest, ): Promise< | { ok: true; request: CustomerInputRequest; rosterRef: WorkflowDocumentRef }
  | WorkflowServiceFailure > { return this.fixedWorkflowCards.prepareFixedAppointmentCardRequest(projectRoot, flowId, request); }
  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async recordFixedCardWorkflowResolution(input: { projectRoot: string; sourceRoleId: string; flowId: string; workflowId: string; requestId: string; resolvedEvent: Extract<TaskStateEvent, { kind:"request.resolved" }>; answered: boolean; judged: boolean; documentRefs: readonly WorkflowDocumentRef[]; }): Promise<void> { return this.fixedWorkflowCards.recordFixedCardWorkflowResolution(input); }
  /** 路径 B 最小准备（B1/B3 派发前；幂等）：非 B 路径直接放行；已有 basis 记录 ⇒ no-op。 */ /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
  private async ensurePathBStartForDispatch( projectRoot: string, workflowId: string, flowId: string, ): Promise<{ ok: true } | WorkflowServiceFailure> { return this.fixedWorkflowRoute.ensurePathBStartForDispatch(projectRoot, workflowId, flowId); }
  /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
  private async checkPathBWriteSetForDispatch( projectRoot: string, workflowId: string, _flowId: string, targetRoleId: string, modulePaths: readonly string[] | undefined, ): Promise<{ ok: true } | WorkflowServiceFailure> { return this.fixedWorkflowRoute.checkPathBWriteSetForDispatch(projectRoot, workflowId, _flowId, targetRoleId, modulePaths); }
  /** merge-main 卡呈现（应用自有非判断卡；客户本人；judge 不可代批）。无通道 ⇒ undefined（调用方 fail-closed）。 */ /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private async presentMergeMainCard(input: { projectRoot: string; preview: ReleaseMergePreview; signal?: AbortSignal; }): Promise<CustomerInputOutcome | undefined> { return this.fixedWorkflowRelease.presentMergeMainCard(input); }
  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  async runFixedReleaseMerge(input: { projectRoot: string; workflowId: string; operationId: string; summary: string; evidence: readonly { path: string; sha256: string }[]; signal?: AbortSignal; }): Promise<{ ok: boolean; code?: string; message: string; releaseId?: string; merged?: boolean; mergeOid?: string; }> { return this.fixedWorkflowRelease.runFixedReleaseMerge(input); }
  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private async settleMergeMainCard(input: { projectRoot: string; workflowId: string; preview: ReleaseMergePreview; port: ReturnType<typeof createDesktopReleaseGitPort>; signal?: AbortSignal; }): Promise<{ ok: boolean; code?: string; message: string; releaseId?: string; merged?: boolean; mergeOid?: string; }> { return this.fixedWorkflowRelease.settleMergeMainCard(input); }
  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private async autoPresentFixedReleaseMerge(input: { projectRoot: string; workflowId: string; stage: FixedReleaseTriggerStage; taskId: string; }): Promise<{ status:"skipped" | "not-ready" | "already-merged" | "channel-unavailable" | "presented"; code?: string; message: string; releaseId?: string; merged?: boolean; }> { return this.fixedWorkflowRelease.autoPresentFixedReleaseMerge(input); }
  /** 自动呈卡的应用证据（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async fixedReleaseAutoEvidence( projectRoot: string, workflowId: string, stage: FixedReleaseTriggerStage, taskId: string, ): Promise<{ ok: true; evidence: { path: string; sha256: string }[] } | WorkflowServiceFailure> { return this.evidence.fixedReleaseAutoEvidence(projectRoot, workflowId, stage, taskId); }
  /** 自动呈卡失败/未呈卡时如实回运营（convener）与幕僚（chief）：只通知、不改状态、不伪造客户决定。 */ /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private noteFixedReleaseAutoTrigger(projectRoot: string, workflowId: string, summary: string): void { return this.fixedWorkflowRelease.noteFixedReleaseAutoTrigger(projectRoot, workflowId, summary); }
  /** 薄委托 → `session/fixed-workflow/panel.ts`（JSDoc/方法体见模块）。 */
  async fixedPanelState( projectRoot: string, flowId?: string, ): Promise<{ ok: true; mode: WorkflowMode; panel:"read-only" | "full"; mutationAllowed: boolean; workflow?: { workflowId: string; flowId: string; path:"A" | "B"; stage: WorkflowView["stage"]; status: string; closed?: string; blocked?: { code: string; summary: string }; }; }> { return this.fixedWorkflowPanel.fixedPanelState(projectRoot, flowId); }
  /** B1：advisory 摘要（最多 3 条 + 其余计数）；只用人话，技术 code 只进诊断。 */ /** 薄委托 → `session/fixed-workflow/panel.ts`（JSDoc/方法体见模块）。 */
  private dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string { return this.fixedWorkflowPanel.dispatchAdvisorySummary(advisories); }
  // —————————————— G-2（2026-10-16 客户批准）：看护数据面 / 系统投递 / 恢复执行桥 —————————————— 设计 `2026-10-16_design_role-watchdog-and-closure.md`（W1 快照与观察、W2 system 投递、W4 恢复执行桥、 W5 恢复确认桥）。**一条原则**：本段全部是「读快照＋经既有投递机投文本＋（客户一键确认后）复用既有 人工动作」——不写项目文件、不放行任何命令/写入、不改任何 gate/队列语义；一切失败路径 fail-closed （最坏情形退化为「没有看护时的现状」）。
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  watchdogSnapshot(projectRoot: string): WatchdogProjectSnapshot | undefined { return this.diagnostics.watchdogSnapshot(projectRoot); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  projectRootsWithActivity(): string[] { return this.diagnostics.projectRootsWithActivity(); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  lastTurnOf(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: RuntimeTurnOutcome; at: string; errorCode?: string } | undefined { return this.diagnostics.lastTurnOf(projectRoot, roleId, runtime); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string; uiOnlyWhenBusy?: boolean }): void { this.diagnostics.watchdogDeliver(projectRoot, message); }
  /** **`rebuild-session` 恢复动作**（W4，2026-10-16 客户批准；设计 §6.3）——新公共入口： dispose＋重开（保留 ANS 回放；F-5-opt1 注记适用）；**在跑轮次不打断**（busy ⇒ 拒绝并如实回执）。 与陈旧重建（O-1）同链串行（`rebuildChains` 按会话键——同一角色至多一个重建在跑）。 */
  async rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> { return this.lifecycle.rebuildSession(target, beforeDispose); }
  /** `rebuildSession` 的链内实现（同 `rebuildIfBoundaryStaleUnsafe` 同款步骤，**去掉陈旧判据**——手动触发）。 */
  private async rebuildSessionUnsafe(key: string, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> { return this.lifecycle.rebuildSessionUnsafe(key, beforeDispose); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async redeliverNudge(target: string | SessionTarget, itemId?: string): Promise<RedeliverResult> { return this.delivery.redeliverNudge(target, itemId); }
  // —————————————— G-4（2026-10-16 客户批准）：技能安装/卸载 handler（I3） —————————————— 设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §3.2/§3.3/§4.3/§4.4/§6.4； PM 裁定④（轮次护栏：仅**客户消息**发起的轮次可执行，先判）与⑤（O-1 指纹集扩展——见 `boundaryDiff` / `currentSkillPaths`）。**工具不写盘**——落盘永远由 su 的 `write_file` 完成（「先落盘再激活」＝ G-1「先落盘再派发」的镜像）；本层只 **护栏 → 校验（角色/登记/含角色/状态）→ 激活（复用既有重建； 在跑不打断 ⇒ `next-session`）→ 如实回执** ＋ `[系统·安装]` 系统行（`kind:"system"` 第四类通道 真投递给 su——不可撤回、与看护/恢复回执同一套投递机）＋ 诊断事件。失败一律 fail-closed＝**未执行、 零副作用**（登记不动、不重建、不投系统行）。**安装/卸载不改变任何角色的写边界**（技能是必读资料， 不是权限）。
  /** Installation's existing customer-turn rule follows the actual running origin. Direct system inputs and dispatch/handback rounds are not customer messages; absence of an active-delivery row is never evidence of customer intent. */
  private isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean { return this.lifecycle.isCustomerInitiatedTurn(projectRoot, runtime, roleId); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async activateRoleRefresh(projectRoot: string, runtime: RuntimeKind, roleId: string, beforeEffect?: () => Promise<boolean>): Promise<{ effective:"rebuilt" | "next-session"; note?: string; error?: string }> { return this.sessionEnv.activateRoleRefresh(projectRoot, runtime, roleId, beforeEffect); }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async applySkillChange( action:"installed" | "uninstalled", projectRoot: string, runtime: RuntimeKind, callerRoleId: string, d: InstallSkillPayload, beforeActivation?: () => Promise<boolean>, ): Promise<InstallSkillReceipt> { return this.sessionEnv.applySkillChange(action, projectRoot, runtime, callerRoleId, d, beforeActivation); }
  // —————————————— G-4 V2（2026-10-16 客户批准）：外来 MCP 安装/卸载 handler —————————————— 与技能两工具**逐字同构**（护栏/载荷/角色/激活共用件全同；仅校验面＝MCP 声明、名词与诚实面不同）。 **工具不写盘**——声明落盘永远由 su 的 `write_file` 完成（「先落盘再激活」）；失败一律 fail-closed＝ **未执行、零副作用**。**诚实面（不得宣称逐调用受审，§5.3）**：外来 MCP 工具在 ANS 门禁之外执行 （server 进程内）＝**能力级授予**；安装/卸载**不改变任何角色的写边界**。卸载＝**下次会话摘除** （server 进程随会话消亡、零平台残留）、**已发生的副作用不可撤**；**声明文件保留**（「效果已撤」与 「文件仍在」如实二分）。
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async applyMcpChange( action:"installed" | "uninstalled", projectRoot: string, runtime: RuntimeKind, callerRoleId: string, d: InstallMcpPayload, beforeActivation?: () => Promise<boolean>, ): Promise<InstallMcpReceipt> { return this.sessionEnv.applyMcpChange(action, projectRoot, runtime, callerRoleId, d, beforeActivation); }
  // ——————— G-2/W1：role_status / session_tail 的桌面侧数据源（契约＝`model/runtime.ts`；编排转发） ———————
  /** `evidence_check` 只读证据检查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async evidenceCheckText(projectRoot: string, roleId: string, input: EvidenceCheckInput): Promise<string> { return this.evidence.evidenceCheckText(projectRoot, roleId, input); }
  /** 调用角色的模块证据范围（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async evidenceScopeRoots(projectRoot: string, flowId: string, run: RunManifest | undefined, roleId: string): Promise<string[]> { return this.evidence.evidenceScopeRoots(projectRoot, flowId, run, roleId); }
  /** `contract_check` 只读契约速查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput, mode: WorkflowMode = "legacy"): Promise<string> { return this.evidence.contractCheckText(projectRoot, callerRoleId, input, mode); }
  /** fixed 会话的契约速查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async contractCheckTextFixed(projectRoot: string, callerRoleId: string, input: ContractCheckInput): Promise<string> { return this.evidence.contractCheckTextFixed(projectRoot, callerRoleId, input); }
  /** `doc_format` 只读数据源（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async docFormatText(projectRoot: string, callerRoleId: string, input: DocFormatInput): Promise<string> { return this.evidence.docFormatText(projectRoot, callerRoleId, input); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async roleStatusText(projectRoot: string, query: RoleStatusPayload): Promise<WatchdogToolResult> { return this.diagnostics.roleStatusText(projectRoot, query); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async diagnosticsTailText(roleId: string): Promise<string> { return this.diagnostics.diagnosticsTailText(roleId); }
  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async sessionTailText(projectRoot: string, query: SessionTailPayload): Promise<WatchdogToolResult> { return this.diagnostics.sessionTailText(projectRoot, query); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainAllQueuesFor(projectRoot: string): Promise<void> { return this.delivery.drainAllQueuesFor(projectRoot); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainPiQueuesAcrossProjects(): Promise<void> { return this.delivery.drainPiQueuesAcrossProjects(); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async waitForRunStopDeliveryClaims(input: { projectRoot: string; taskIds: readonly string[]; signal?: AbortSignal; caller?: ActualDispatchSource }): Promise<{ status:"wait-complete"; count: number } | { status:"blocked"; code: string }> { return this.delivery.waitForRunStopDeliveryClaims(input); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> { return this.delivery.drainQueue(projectRoot, targetRoleId, runtime); }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块；R2 认领段顺序钉在模块内）。 */
  private async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim: { taskIds?: readonly string[]; owner?: ActualDispatchSource }): Promise<void> { return this.delivery.drainQueueUnsafe(projectRoot, targetRoleId, runtime, claim); }
}
