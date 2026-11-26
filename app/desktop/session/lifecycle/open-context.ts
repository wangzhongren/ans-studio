// app/desktop/session/lifecycle/open-context.ts
// B7（2026-11-13）：openInternalUnsafe 的**单一**上下文对象类型（跨 builder 显式传递；无第二份状态）。
// 仅类型面、无运行时；取值/字段由 /open.ts 的主流程与 8 个连续块 builder 填充。
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import type { Acceptance, BoundarySection1 } from "../../../../src/model/boundary.ts";
import type { GovernanceModel, ProjectConfig, RoleDispatchPurpose } from "../../../../src/model/role.ts";
import type { ChiefDecisionExecutionContext, DecidePendingRequestFn, SelectRunChangeFn, CompleteTeamPlanFn, ActivateRoleDocumentsFn, CloseCreatedTaskFn, FixedCloseCreatedTaskFn, GitQueryFn, GitCandidateFn, GitPublishFn, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts, TaskWorkSourceRef } from "../../../../src/model/runtime.ts";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type {
  DownloadApprovalOutcome,
  DownloadApprovalPresenter,
  DownloadApprovalRequest,
  DownloadRequestOptions,
  DownloadRequestRuntime,
} from "../../../../src/pipeline/orchestration/download-request.ts";
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
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { RequestRequirementChangeFn, RequestRequirementChangeInput, RequestRequirementChangeResult } from "../../../../src/model/runtime.ts";
import type { PlanEscalationFn, PlanEscalationInput, PlanEscalationResult } from "../../../../src/model/runtime.ts";
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../../../src/model/runtime.ts";
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, UninstallSkillFn, ReportHandbackMetadata } from "../../../../src/model/runtime.ts";
import type { InstallMcpFn, InstallMcpPayload, InstallMcpReceipt, UninstallMcpFn } from "../../../../src/model/runtime.ts";
import type { DesktopOperatorChannelFn, DesktopShellArming } from "../../operator-channel.ts";
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../../../src/pipeline/orchestration/shell-arming.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn, ChiefDecisionBasis, ChiefDecisionHost } from "../../customer-input.ts";
import type { ProjectListing } from "../../../../src/service/role/resolve-role.ts";
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
import type { SessionManagerDeps } from "../contracts/deps.ts";
import { beginSessionDisposeLease, buildFixedTaskGitSurface, createTurnGitRuntime, endSessionDisposeLease, gitContextFailure, noteSessionDisposeInterruption } from "../git-ports.ts";

/** openInternalUnsafe 的**单一**上下文对象：跨 builder 的原局部变量显式传递（无第二份状态）。 */
export interface OpenContext {
  req: InternalSessionOpenRequest;
  userInitiated: boolean;
  selectionVersion: number;
  internalReopen: boolean;
  lifecycle: string;
  key: string;
  stopped: () => boolean;
  stoppedResult: () => OpenResult;
  forcedSessionWorkflowMode?: WorkflowMode;
  requestedSessionMode: WorkflowMode;
  requestedAssignment: DeliveryAssignment | undefined;
  listing: ProjectListing;
  role: ProjectListing["roles"][number];
  project: ProjectConfig;
  config: EffectiveConfigInfo;
  boundary: BoundarySection1;
  gitBinding: { handle?: RoleSessionHandle };
  currentGitRuntime: ReturnType<typeof createTurnGitRuntime>;
  routineShellPolicy: RoutineShellPolicy | undefined;
  governanceModel: GovernanceModel;
  governanceFunction: ProjectListing["roles"][number]["governanceFunction"];
  sessionWorkflowMode: WorkflowMode;
  legacyOnlyCapabilitiesAllowed: boolean;
  legacyBuiltIn: boolean;
  canSchedule: boolean;
  canNominate: boolean;
  customerInput: SessionManagerDeps["customerInput"];
  writeBoundary: BoundarySection1 | undefined;
  mirrorRoleIdFor: (request: CustomerInputRequest) => string | undefined;
  canDispatch: boolean;
  dispatchBinding: { handle?: RoleSessionHandle };
  planBinding: { handle?: RoleSessionHandle };
  dispatchTask: DispatchTaskFn | undefined;
  viewImage: ViewImageFn;
  canInitiateRequirementChange: boolean;
  canPresentAppRunChange: boolean;
  versionChangeStack: VersionChangeStack | undefined;
  direct: ReturnType<typeof createDirectRoleRuntime> | undefined;
  closeCreatedTask: CloseCreatedTaskFn | undefined;
  closeCreatedTaskFixed: FixedCloseCreatedTaskFn | undefined;
  submitVersionChangeCapability: SubmitVersionChangeFn | undefined;
  submitRefactorCapability: SubmitRefactorFn | undefined;
  reportPlanEscalationCapability: PlanEscalationFn | undefined;
  requestStableWriteCapability: RequestStableWriteFn | undefined;
  requestRequirementChange: RequestRequirementChangeFn | undefined;
  roleStatus: RoleStatusFn | undefined;
  contractCheck: ContractCheckFn | undefined;
  docFormat: DocFormatFn;
  evidenceCheck: EvidenceCheckFn | undefined;
  sessionTail: SessionTailFn | undefined;
  roleActivityLog: RoleActivityLogFn | undefined;
  terminateRoleRun: TerminateRoleRunFn | undefined;
  redispatchTaskCapability: RedispatchTaskFn | undefined;
  projectStateCapability: ProjectStateFn | undefined;
  projectNoteCapability: ProjectNoteFn | undefined;
  requestVersionDecisionCapability: RequestVersionDecisionFn | undefined;
  installationBinding: { handle?: RoleSessionHandle };
  installSkill: InstallSkillFn | undefined;
  uninstallSkill: UninstallSkillFn | undefined;
  installMcp: InstallMcpFn | undefined;
  uninstallMcp: UninstallMcpFn | undefined;
  interactionState: { lifetime: AbortController; turn: AbortController };
  shellOperatorChannel: OperatorChannelFn | undefined;
  shellArming: DesktopShellArming | undefined;
  shellEscalationPresenter: ShellEscalationPresentFn | undefined;
  shellOperatorOnly: { classifyShell: NonNullable<DesktopShellArming>["classifyShell"]; rules: NonNullable<DesktopShellArming>["rules"]; operatorChannel: OperatorChannelFn } | undefined;
  profileRevision: number;
  shellJudge: ShellJudgeFn | undefined;
  governanceJudge: GovernanceJudgeFn | undefined;
  downloadRuntime: DownloadRequestRuntime | undefined;
  buildCustomerInputContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1];
  handle: RoleSessionHandle;
  boundaryPaths: string[];
  boundaryPrints: Record<string, string>;
  skillPaths: string[];
}
