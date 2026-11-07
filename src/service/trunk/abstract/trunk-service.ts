// src/service/trunk/abstract/trunk-service.ts
// 主干 Service 抽象契约（2026-11-04 trunk-amendment-model B-3 / S2）。
//
// 归属：编排（`src/service/trunk/` 模块私有根，B-3）。职责：**业务判定与状态机**——
// 唯一 pinned run 派生只读 v1、verifyTrunk、修正案解析/哈希定格/边界扩大、apply-journal
// 两阶段提交与崩溃对账、受控恢复（tN+1）、stable mini re-pin；**不写项目文档、不写账本、
// 不直接发卡、不派角色**（事件由 S4 Pipeline 在 Service 返回后写，P1 §3.3）。
//
// 依赖方向：Model（C1）→ Provider（S1 `TrunkStore`/`FreezeRegistryStore`）→ Service；
// 本层不 import Pipeline/Interface。run manifest 只经 `src/common/编排/run-manifest.ts`
// 的**既有只读 API**（`readRunManifest`/`verifyPinnedRun`/`loadPinnedRoster`）；run manifest
// re-pin 写入为注入 Port（S3 在 run-manifest.ts 实现 `repins`/`repinPinnedRun`）。
//
// 形状单一来源：`TrunkManifest`/`TrunkAmendment*`/`TrunkApplyJournal`/错误码 → `src/model/trunk.ts`；
// 事件载荷形状 → `src/model/runtime.ts`（本文件只声明 Service 返回的载荷子集）。
//
// 纪律（P1.6 §4.5/§4.6/§5.4）：
// · 提交点 = trunk manifest 写成功；journal phase 仅审计，对账以**内容匹配为主**；
// · 任何失败不改 trunk 指针；恢复产生新版本 tN+1（`source:"recovery"`）；
// · trunk 只引用已冻结的版本化文档；execution（teamPlan/flow）不纳入 guard 冻结（C15），
//   由 trunk manifest + verify 保证；stable 文件为确认即写快照（mini re-pin 不升 trunkVersion）；
// · 冻结注册表 corrupt ⇒ fail-closed（不自动重建）；missing/migration-required 对 verify 按
//   F29 既有文档默认冻结处理，apply 仍要求冻结记录（VCA 已先冻结）。

import type {
  TrunkAmendmentApplyState,
  TrunkAmendmentDoc,
  TrunkAmendmentItem,
  TrunkAmendmentItemKind,
  TrunkAmendmentState,
  TrunkAmendmentStatus,
  TrunkApplyJournalPhase,
  TrunkApplySnapshot,
  TrunkAvailability,
  TrunkDocKind,
  TrunkErrorCode,
  TrunkManifest,
  TrunkSource,
  TrunkStableArtifactRef,
  TrunkStableFileKind,
  TrunkStateOp,
  TrunkVersionRef,
  DirectActionReceipt, DirectActionSource, CompleteSnapshot, TrunkCommitRef, SnapshotRef, SnapshotArtifactRef, FrozenRoleEvidence, ActiveRoleEvidence,
} from "../../../model/trunk.ts";
import type { CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, SubmitVersionChangeInput, SelectRunChangeInput, SelectRunChangeResult, CompleteTeamPlanInput, CloseCreatedTaskInput, CloseCreatedTaskResult, TaskStateEvent, ActivateRoleDocumentsInput, ActivateRoleDocumentsResult } from "../../../model/runtime.ts";
import type { BoundaryEntry } from "../../../model/boundary.ts";
import type { TrunkStore } from "../../../provider/trunk/public/trunk-store.ts";
import type { FreezeRegistryStore } from "../../../provider/version-change/public/version-change-store.ts";

/** Actor identity is supplied by the application's trusted session, never tool arguments. */
export interface TrunkDirectApplyInput {
  operationId: string;
  applicationId: string;
  actorRoleId: string;
  kind: "version-upgrade" | "detail-amendment";
  flowId: string;
  baseTrunk: TrunkCommitRef | null;
  target: TrunkApplySnapshot;
  /** Each changed target slot binds the previous effective reference's exact byte hash. */
  expectedFrom: readonly { path: string; sha256: string | null }[];
  amendmentId?: string;
  amendmentDocPath?: string;
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  at: string;
  preparedSnapshotRef?: SnapshotRef;
  roleDocumentChecks?: readonly TrunkRoleDocumentCheck[];
}
export type { RoleDocumentCheck as TrunkRoleDocumentCheck } from "../../../model/boundary.ts";
import type { RoleDocumentCheck as TrunkRoleDocumentCheck } from "../../../model/boundary.ts";
export interface DirectTrunkService extends TrunkService {
  classifyClosedTaskNotice(input: { recipientRoleId: string; boundTaskId: string; operationId: string; source: DirectActionSource }): Promise<
    { ok: true; value: { kind: "information-only"; taskId: string; recipientRoleId: string; operationId: string } } | { ok: false; code: string; message: string }>;
  resolveDeliveryAssignment(input: DeliveryAssignmentInput): Promise<DeliveryAssignmentResult>;
  prepareParentTaskRef(input: { actorRoleId: "convener"; taskId: string; flowId: string; runId: string }): Promise<
    { ok: true; parentTaskRef: import("../../../model/runtime.ts").TaskParentRef } | { ok: false; code: string; message: string }>;
  inspectQueuedControllerResume(input: { resumeController: import("../../../model/runtime.ts").DispatchTaskResumeController }): Promise<TrunkServiceResult<ControllerResumePreparation>>;
  prepareControllerStop(input: { taskId: string; actorRoleId: "chief" }): Promise<TrunkServiceResult<ControllerStopScope>>;
  confirmControllerStop(expected: ControllerStopScope): Promise<TrunkServiceResult<ControllerStopScope>>;
  prepareControllerResume(input: { resumeController: import("../../../model/runtime.ts").DispatchTaskResumeController; hostInitialization: RepositoryInitializationContext }): Promise<TrunkServiceResult<ControllerResumePreparation>>;
  prepareReviewTask(input: { parentTaskId: string; flowId: string; runId: string; target: import("../../../model/runtime.ts").DispatchTaskReviewTarget }): Promise<TrunkServiceResult<PreparedReviewTask>>;
  readAssignedReviewContext(input: { taskId: string; actorRoleId: string }): Promise<TrunkServiceResult<ReviewMaterial>>;
  inspectAssignedTask(input: { taskId: string; actorRoleId: string }): Promise<TrunkServiceResult<{ taskId: string; actorRoleId: string; flowId: string; runId: string; basisDigest: string; kind: "planning" | "execution" | "review"; workSourceRef?: import("../../../model/runtime.ts").TaskWorkSourceRef }>>;
  readTaskProcessSource(input: { taskId: string; actorRoleId: string; flowId: string; runId: string }): Promise<TrunkServiceResult<PreparedTaskProcessSource>>;
  prepareAssignedTaskWriteScope(input: { taskId: string; actorRoleId: string }): Promise<TrunkServiceResult<{ taskId: string; runId: string; basisDigest: string; paths: string[] }>>;
  directDeliveryRecorded(key: string): Promise<boolean>;
  recordDirectDelivery(key: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  prepareRoleDispatch(input: { fromRoleId: string; targetRoleId: string; flowId: string; runId?: string; moduleId?: string; parentTaskId?: string; reviewTarget?: import("../../../model/runtime.ts").DispatchTaskReviewTarget; hostInitialization?: RepositoryInitializationContext; hubRouting?: import("../../../model/runtime.ts").TaskHubRouting }): Promise<RoleDispatchResult>;
  prepareRoleDraftScope(input: { flowId?: string; taskId?: string }): Promise<TrunkServiceResult<RoleDraftScope>>;
  prepareExecutionRun(input: { runId: string; flowId: string; operationId: string }): Promise<TrunkServiceResult<PreparedExecutionRun>>;
  pinExecutionRun(prepared: PreparedExecutionRun, checks: readonly TrunkRoleDocumentCheck[]): Promise<TrunkServiceResult<ExecutionRunBasis>>;
  prepareIntentConfirmation(flowId: string): Promise<TrunkServiceResult<PreparedIntentConfirmation>>;
  finalizeIntentConfirmation(prepared: PreparedIntentConfirmation, outcome: CustomerInputOutcome): Promise<TrunkServiceResult<{ path: string; sha256: string }>>;
  prepareRoleActivation(input: ActivateRoleDocumentsInput, trustedActorRoleId: string): Promise<TrunkServiceResult<PreparedRoleActivation>>;
  activateRoleDocuments(prepared: PreparedRoleActivation, checks: readonly TrunkRoleDocumentCheck[], boundaryEntries: readonly BoundaryEntry[]): Promise<ActivateRoleDocumentsResult>;
  recordTaskObservation(event: TaskStateEvent): Promise<TaskObservationResult>;
  closeCreatedTask(input: CloseCreatedTaskInput, trustedActorRoleId: string): Promise<CloseCreatedTaskResult>;
  completeTeamPlan(input: CompleteTeamPlanInput, trustedActorRoleId: string): Promise<CompletedTeamPlanReceipt>;
  prepareCreatedTaskClose(taskId: string, trustedActorRoleId: string): Promise<TrunkServiceResult<CreatedTaskCloseBasis>>;
  selectRunChange(input: SelectRunChangeInput, trustedActorRoleId: string): Promise<SelectRunChangeResult>;
  prepareRunChange(input: { request: SelectRunChangeInput; actorRoleId: "rapporteur"; taskId: string; replacementRunId?: string }): Promise<TrunkServiceResult<PreparedRunChange>>;
  commitPreparedRunChange(prepared: PreparedRunChange, evidence: RunStopCommitEvidence): Promise<SelectRunChangeResult>;
  readRunEvidence(runId: string): Promise<TrunkServiceResult<ExecutionRunBasis>>;
  inspectExecutionCodeSource(bases: import("../../../provider/trunk/public/trunk-store.ts").GitExecutionBases): Promise<TrunkServiceResult<{ bases: import("../../../provider/trunk/public/trunk-store.ts").GitExecutionBases; controllerTask: { taskId: string; digest: string } | null }>>;
  prepareDirectSubmission(input: SubmitVersionChangeInput, trustedActorRoleId: string): Promise<TrunkServiceResult<PreparedDirectSubmission>>;
  prepareDirectCommit?(input: TrunkDirectApplyInput): Promise<TrunkServiceResult<PreparedDirectCommit>>;
  prepareTeamPlanCommit?(input: CompleteTeamPlanInput, trustedActorRoleId: string): Promise<TrunkServiceResult<PreparedTeamPlanCommit | CompletedTeamPlanReceipt>>;
  bindInitialWorkflowSource?(input: { requestId: string; taskId: string; coreSessionId: string; coreTurnId?: string; hostLeaseId: string }): Promise<TrunkServiceResult<import("../../../provider/trunk/public/trunk-store.ts").GitInitialWorkflowSource>>;
  prepareInitialWorkflowCommit?(input: TrunkStableSnapshotInput): Promise<TrunkServiceResult<PreparedInitialWorkflowCommit | TrunkStableSnapshotResult>>;
  commitPreparedInitialWorkflow?(prepared: PreparedInitialWorkflowCommit, authority: { hostLeaseId: string; taskId: string;
    candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<TrunkStableSnapshotResult>;
  prepareActivationCommit?(activation: PreparedRoleActivation, checks: readonly TrunkRoleDocumentCheck[], boundaryEntries: readonly BoundaryEntry[], trustedActorRoleId: string): Promise<TrunkServiceResult<PreparedActivationCommit | ActivateRoleDocumentsResult>>;
  commitPreparedActivation?(prepared: PreparedActivationCommit, authority: { hostLeaseId: string; taskId: string;
    candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<ActivateRoleDocumentsResult>;
  prepareDirectAuthority?(prepared: PreparedDirectCommit | PreparedTeamPlanCommit | PreparedActivationCommit | PreparedInitialWorkflowCommit, taskId: string): Promise<TrunkServiceResult<PreparedDirectAuthority>>;
  commitPreparedTeamPlan?(prepared: PreparedTeamPlanCommit, authority: { hostLeaseId: string; taskId: string;
    candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<CompletedTeamPlanReceipt>;
  commitPreparedDirect?(prepared: PreparedDirectCommit, authority: { hostLeaseId: string; taskId: string;
    candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<DirectActionReceipt>;
  executeDirect(input: TrunkDirectApplyInput): Promise<DirectActionReceipt>;
  recoverDirect(operationId: string): Promise<DirectActionReceipt>;
  readDirectOperation(operationId: string): Promise<TrunkServiceResult<{ journal: import("../../../model/trunk.ts").TrunkApplyJournal; manifest: TrunkManifest; snapshot: CompleteSnapshot }>>;
  readEffectiveSnapshot(): Promise<TrunkServiceResult<{ manifest: TrunkManifest; snapshot: CompleteSnapshot }>>;
  prepareDecisionEvidence(input: DecisionEvidenceInput): Promise<TrunkServiceResult<PreparedDecisionEvidence>>;
  checkDecisionEvidence(verification: DecisionEvidenceVerification): Promise<boolean>;
}
/** Host delivery provenance only. A successful lookup is not permission to reopen or mutate. */
export interface DeliveryAssignmentInput {
  recipientRoleId: string;
  source: { kind: "assigned-task"; taskId: string } | { kind: "child-report"; childTaskId: string; childRoleId: string };
  expectedFlowId?: string; expectedRunId?: string;
}
export type DeliveryAssignmentResult = { ok: true; value: { taskId: string; actorRoleId: string; flowId: string; runId?: string } }
  | { ok: false; code: string; message: string };
/** Ordinary query policy input is composed with G by Pipeline, never a Service peer call. */
export interface GitQueryContext { actorRoleId: string; taskId?: string; runId?: string; readPaths: readonly string[]; authorizationRevision?: string }
export interface PreparedGitQuery {
  request: import("../../../model/runtime.ts").GitQueryRequest;
  context: GitQueryContext;
  repoConfigDigest: string;
  inputDigest: string;
  basis?: import("../../../model/trunk.ts").GitBasis;
  basisSource?: { kind: "assigned-run"; runId: string; pinDigest: string; runRecordSha256: string };
  policyInput: {
    repoId: string; operationId: string; actorRoleId: string; taskId?: string; runId?: string;
    authorizationRevision: string; currentAuthorizationRevision: string; objectFormat: "sha1" | "sha256";
    template: import("../../../model/trunk.ts").GitQueryTemplate; paths: readonly string[]; readPaths: readonly string[]; writePaths: readonly string[];
    argv: readonly string[]; target?: import("../../../model/trunk.ts").GitOid; other?: import("../../../model/trunk.ts").GitOid; limit?: number;
    readableOids: readonly import("../../../model/trunk.ts").GitOid[];
  };
}
export interface GitCapabilityService {
  prepareDelivery(input: import("../../../model/runtime.ts").GitPublishRequest): Promise<
    { ok: true; value: PreparedGitDelivery } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  executeDelivery(prepared: PreparedGitDelivery, hostLeaseId: string, verdict: { allowed: boolean; inputDigest: string; code?: string }, signal?: AbortSignal): Promise<import("../../../model/trunk.ts").GitCapabilityResult>;
  prepareIntegration(input: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "integrate" }>): Promise<
    { ok: true; value: PreparedGitWorkerCommit } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  prepareRevert(input: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "revert" }>): Promise<
    { ok: true; value: PreparedGitWorkerCommit } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  prepareWorkerCommit(input: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "commit" }>): Promise<
    { ok: true; value: PreparedGitWorkerCommit } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  executeWorkerCommit(prepared: PreparedGitWorkerCommit, hostLeaseId: string, verdict: { allowed: boolean; inputDigest: string; code?: string }, signal?: AbortSignal): Promise<import("../../../model/trunk.ts").GitCapabilityResult>;
  prepareInitialization(input: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "init" }>): Promise<
    { ok: true; value: PreparedGitInitialization } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  /** Pipeline invokes only after its actual project protection/admission closure is held; never a model tool. */
  executeInitialization(prepared: PreparedGitInitialization, hostLeaseId: string, signal?: AbortSignal): Promise<import("../../../model/trunk.ts").GitCapabilityResult>;
  prepareQuery(input: import("../../../model/runtime.ts").GitQueryRequest, context: GitQueryContext): Promise<
    { ok: true; value: PreparedGitQuery } | { ok: false; result: import("../../../model/trunk.ts").GitCapabilityResult }>;
  executeQuery(prepared: PreparedGitQuery, verdict: { allowed: boolean; inputDigest: string; code?: string }, signal?: AbortSignal): Promise<import("../../../model/trunk.ts").GitCapabilityResult>;
  candidate: import("../../../model/runtime.ts").GitCandidateFn;
  publish: import("../../../model/runtime.ts").GitPublishFn;
}
export interface PreparedGitDelivery {
  processSource: PreparedTaskProcessSource;
  request: import("../../../model/runtime.ts").GitPublishRequest;
  taskId: string; runId: string; flowId: string; repoId: string; inputDigest: string; requestDigest: string;
  source: import("../../../provider/trunk/public/trunk-store.ts").GitDeliverySource;
  plan: import("../../../provider/trunk/public/trunk-store.ts").GitRefPublicationPlan;
  policyInput: Omit<PreparedGitQuery["policyInput"], "template"> & {
    template: "publish-delivery"; base: import("../../../model/trunk.ts").GitOid | null; candidate: import("../../../model/trunk.ts").GitOid;
    ref: string; publicationRef: string; ownedCandidateRef: string; commands: readonly (readonly string[])[];
    worksite: import("../../../provider/trunk/public/trunk-store.ts").GitRefPublicationPlan["worksite"];
    allDiff: { complete: true; base: import("../../../model/trunk.ts").GitOid | null; candidate: import("../../../model/trunk.ts").GitOid; entries: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan["diff"] };
    integrationGrants: NonNullable<PreparedGitWorkerCommit["policyInput"]["integrationGrants"]>;
    refPublicationPlan: import("../../../provider/trunk/public/trunk-store.ts").GitRefPublicationPlan;
    deliveryBasis: { base: import("../../../model/trunk.ts").GitOid; baseTree: readonly import("../../../provider/trunk/public/trunk-store.ts").GitTreeEntry[];
      source: import("../../../provider/trunk/public/trunk-store.ts").GitIntegrationSource | import("../../../provider/trunk/public/trunk-store.ts").GitRevertSource; candidateOperationId: string; baseCommitBytesBase64: string };
  };
}
export interface PreparedGitWorkerCommit {
  processSource: PreparedTaskProcessSource;
  request: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "commit" | "integrate" | "revert" }>;
  taskId: string; runId: string; flowId: string; actorRoleId: string;
  inputDigest: string; requestDigest: string; repoId: string;
  source: import("../../../provider/trunk/public/trunk-store.ts").GitTaskCandidateSource | import("../../../provider/trunk/public/trunk-store.ts").GitIntegrationSource | import("../../../provider/trunk/public/trunk-store.ts").GitRevertSource;
  plan: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan;
  policyInput: Omit<PreparedGitQuery["policyInput"], "template"> & { template: "commit" | "integrate" | "revert"; ref: string; ownedCandidateRef: string;
    mainline?: number;
    integrationGrants?: readonly { ownerRoleId: string; paths: readonly string[]; candidate: import("../../../model/trunk.ts").GitOid; evidenceDigest: string }[];
    base: import("../../../model/trunk.ts").GitOid; candidate: import("../../../model/trunk.ts").GitOid;
    allDiff: { complete: true; base: import("../../../model/trunk.ts").GitOid; candidate: import("../../../model/trunk.ts").GitOid; entries: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan["diff"] };
    rawObjectPlan: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan;
    worksite: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan["worksite"]; commands: readonly (readonly string[])[] };
}
export interface PreparedGitInitialization {
  request: Extract<import("../../../model/runtime.ts").GitCandidateRequest, { action: "init" }>;
  projectRoot: string; taskId: string; runId: string; flowId: string;
  inputDigest: string; rootBasisDigest: string; requestDigest: string; sourceId: string; sourceSha256: string;
  parentCoreSessionId: string;
  candidatePlan: ReturnType<typeof import("../../../provider/trunk/public/trunk-store.ts").planEmptyGitCandidate>;
  initializationPlan?: import("../../../provider/trunk/public/trunk-store.ts").GitInitializationPlan;
  expectedFiles: readonly { path: string; sha256: string }[];
}
export interface RoleDispatchPreparation {
  kind: "planning" | "execution" | "review";
  flowId: string;
  basisDigest: string;
  purpose?: "repository-initialization" | "document-preparation" | "team-planning" | "role-preparation" | "builtin-preparation";
  hubRouting?: import("../../../model/runtime.ts").TaskHubRouting;
  initializationSource?: { sourceId: string; path: string; sha256: string; kind?: import("../../../model/runtime.ts").TaskWorkSourceRef["kind"] };
  runId?: string;
  reviewBasisRef?: import("../../../model/runtime.ts").TaskReviewBasisRef;
  reviewControllerRef?: import("../../../model/runtime.ts").TaskReviewControllerRef;
  parentTaskRef?: import("../../../model/runtime.ts").TaskParentRef;
  moduleId?: string;
  modulePaths?: string[];
  documentContext?: { runId: string; pinDigest: string; frozenRoleEvidence: FrozenRoleEvidence };
}
/** Ordinary target/source expectations. Neither a permit nor a run cancellation. */
export interface ControllerStopScope {
  taskId: string; actorRoleId: "convener"; creatorRoleId: "chief"; flowId: string; runId: string;
  taskDigest: string; ledgerDigest: string; runSha256: string; processSource: PreparedTaskProcessSource;
}
export interface ControllerResumePreparation {
  taskId: string; actorRoleId: "convener"; flowId: string; runId: string;
  reviewTaskId: string; reviewCloseOperationId: string; resumeKey: string; basisDigest: string;
}
export interface ReviewMaterial {
  flowId: string; runId: string; parentTaskId: string; pinDigest: string; runRecordSha256: string;
  reviewBasisRef: import("../../../model/runtime.ts").TaskReviewBasisRef;
  candidateJournalSha256: string; contextText: string;
  sourceFile?: { path: string; sha256: string };
  /** The actual approval/child-source rows checked when preparing a new review; final append compares this under R9. */
  relatedLedgerDigest: string;
}
export interface PreparedReviewTask extends ReviewMaterial { parentTaskRef: import("../../../model/runtime.ts").TaskParentRef }
export interface RepositoryInitializationContext {
  registration: { selectionId: string; source: "native-directory-selection"; selectedRoot: string; projectRoot: string; selectedAt: string; listingGeneration: number };
  parent: { roleId: "chief"; runtime: import("../../../model/runtime.ts").RuntimeKind; sessionId: string; turnId: string; clientMessageId?: string; kind?: string; inputAccepted: true; settled: false };
  /** Host references to the current real handback; Pipeline checks the actual Core-ingested turn, Service checks the original ledger. */
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
}
export type RoleDispatchResult = { ok: true; value: RoleDispatchPreparation } | { ok: false; code: TrunkErrorCode; message: string;
  blockedDependencies?: Array<{ roleId: string; moduleId: string }> };
export interface RoleDraftScope { flowId: string; basisDigest: string; d3RequestId: string; d3Reference: string; paths: string[] }
export interface PreparedExecutionRun {
  expectedCodeSourceTask?: { taskId: string; digest: string };
  runId: string;
  flowId: string;
  operationId: string;
  alreadyPinned: boolean;
  expectedRunSha256: string;
  expectedTrunk: TrunkCommitRef;
  expectedActive: { revision: number; digest: string };
  expectedDocumentSnapshot?: SnapshotRef;
  snapshot: CompleteSnapshot;
  nextRun: Record<string, unknown>;
  roles: PreparedRoleActivation["role"][];
}
export interface PreparedRunChange {
  processSource?: PreparedTaskProcessSource;
  runChangeSource?: import("../../../provider/trunk/public/trunk-store.ts").RunChangeSource;
  requesterSourceFile?: { path: string; sha256: string };
  request: SelectRunChangeInput; requesterTaskId: string; ledgerDigest: string; requestDigest: string;
  preparedAt: string;
  requesterCreationDigest: string;
  old: ExecutionRunBasis; taskIds: readonly string[]; replacement?: PreparedExecutionRun;
}
export interface RunStopCommitEvidence {
  hostLeaseId: string; coordinatorRevision: number;
  instances: readonly import("../../../model/runtime.ts").RuntimeSessionLifecycleFacts[];
  hostStops: readonly import("../../../provider/trunk/public/trunk-store.ts").GitHostRunStopFact[];
}
export interface PreparedIntentConfirmation { flowId: string; path: string; sha256: string; version: number; snapshotRef: SnapshotRef; text: string; marker: string }
export interface PreparedRoleActivation {
  input: ActivateRoleDocumentsInput;
  snapshot: CompleteSnapshot;
  evidence: ActiveRoleEvidence;
  expectedTrunk: TrunkCommitRef;
  expectedActive: { revision: number; digest: string | null };
  targetActive: { revision: number; digest: string };
  noOp: boolean;
  role: { roleId: string; cardPath: string; boundaryMdPath: string; boundaryYamlPath: string; allowedPaths: { path: string; kind: "file" | "directory" }[] };
  writesets: string[];
}
export type CompletedTeamPlanReceipt = DirectActionReceipt & { planRef?: SnapshotArtifactRef; rosterRef?: SnapshotArtifactRef; modulesRef?: SnapshotArtifactRef };
export interface CreatedTaskCloseBasis {
  taskId: string;
  runId: string;
  basisDigest: string;
  reportRef: SnapshotArtifactRef;
  reportStatus: import("../../../model/runtime.ts").TaskReportStatus;
  reportSummary: string;
  taskDigest: string;
  runRecordSha256: string;
  /** Draft planning bytes rechecked under the ledger/run commit lock. */
  materialRefs?: readonly { path: string; sha256: string }[];
  activationCommit?: import("../../../provider/trunk/public/trunk-store.ts").GitActiveCompletionBasis;
  stableCommit?: import("../../../provider/trunk/public/trunk-store.ts").GitStableCompletionBasis;
  planCommit?: import("../../../provider/trunk/public/trunk-store.ts").GitPlanCompletionBasis;
  initializationCommit?: Omit<import("../../../provider/trunk/public/trunk-store.ts").GitInitializationTaskBasis, "files">;
  reviewCommit?: { operationId: string; candidate: import("../../../model/trunk.ts").GitOid; journalSha256: string; criteria: import("../../../model/trunk.ts").GitEvidenceRef[] };
  /** Derived missing proof, never a model supplied approval. Rework/reject remains available. */
  acceptanceBlock?: string;
  acceptanceMessage?: string;
  relatedLedgerDigest?: string;
  reportOnly?: true;
  deliveryCommit?: { operationId: string; journalSha256: string };
}
export type TaskObservationResult = { ok: true; replay?: boolean } | { ok: false; code: string; message: string };
/** A byte-verified existing pin; reading it does not manufacture D3 or grant dispatch authority. */
export interface ExecutionRunBasis {
  runId: string;
  flowId: string;
  pinDigest: string;
  recordSha256: string;
  snapshot: CompleteSnapshot;
  frozenRoles: Record<string, FrozenRoleEvidence>;
  run: Record<string, unknown>;
}
export interface PreparedDirectSubmission {
  applicationId: string;
  applyInput: TrunkDirectApplyInput;
  snapshot: CompleteSnapshot;
  currentTrunk: TrunkVersionRef | null;
  amendmentItems?: TrunkAmendmentItem[];
}
export interface PreparedDirectCommit {
  preparationKind: "direct-document-commit";
  input: TrunkDirectApplyInput; manifest: TrunkManifest; journal: import("../../../model/trunk.ts").TrunkApplyJournal; snapshot: CompleteSnapshot;
  expectedActive: { revision: number; digest: string | null }; expectedSnapshot?: SnapshotRef;
  gitPlan?: import("../../../provider/trunk/public/trunk-store.ts").GitDocumentCommitPlan;
}
export interface PreparedTeamPlanCommit {
  preparationKind: "team-plan-commit";
  input: CompleteTeamPlanInput; actorRoleId: "convener";
  baseTrunk: import("../../../model/trunk.ts").TrunkCommitRef;
  manifest: TrunkManifest; journal: import("../../../model/trunk.ts").TrunkApplyJournal; snapshot: CompleteSnapshot;
  expectedActive: { revision: number; digest: string | null }; expectedSnapshot: SnapshotRef;
  gitPlan?: import("../../../provider/trunk/public/trunk-store.ts").GitDocumentCommitPlan;
}
export interface PreparedActivationCommit {
  preparationKind: "active-role-commit";
  input: ActivateRoleDocumentsInput; actorRoleId: "nominator";
  activation: PreparedRoleActivation; checks: readonly TrunkRoleDocumentCheck[]; boundaryEntries: readonly BoundaryEntry[];
  baseTrunk: import("../../../model/trunk.ts").TrunkCommitRef;
  manifest: TrunkManifest; journal: import("../../../model/trunk.ts").TrunkApplyJournal; snapshot: CompleteSnapshot;
  expectedActive: { revision: number; digest: string | null }; expectedSnapshot: SnapshotRef;
  gitPlan?: import("../../../provider/trunk/public/trunk-store.ts").GitActiveCommitPlan;
}
export interface InitialWorkflowSnapshotPreparation {
  preparationKind: "initial-workflow-snapshot"; input: TrunkStableSnapshotInput;
  source: import("../../../provider/trunk/public/trunk-store.ts").GitInitialWorkflowSource;
  sourceFile: { path: string; sha256: string };
  record: import("../../../model/version-change.ts").StableWriteRecord; permit: import("../../../model/version-change.ts").StableWritePermit;
  before: TrunkManifest; manifest: TrunkManifest; snapshot: CompleteSnapshot;
}
export interface PreparedInitialWorkflowCommit extends Omit<InitialWorkflowSnapshotPreparation, "preparationKind" | "input"> {
  preparationKind: "initial-workflow-commit"; input: TrunkStableSnapshotInput & { operationId: string; flowId: string };
  baseTrunk: import("../../../model/trunk.ts").TrunkCommitRef;
  journal: import("../../../model/trunk.ts").TrunkApplyJournal;
  expectedActive: { revision: number; digest: string | null }; expectedSnapshot: SnapshotRef;
  gitPlan?: import("../../../provider/trunk/public/trunk-store.ts").GitInitialWorkflowCommitPlan;
}
export interface DirectDocumentPolicyInput {
  repoId: string; operationId: string; actorRoleId: string; taskId: string; runId: string;
  authorizationRevision: string; currentAuthorizationRevision: string; objectFormat: "sha1" | "sha256";
  template: "commit" | "publish-documents"; paths: readonly string[]; readPaths: readonly string[]; writePaths: readonly string[];
  ref: string; ownedCandidateRef: string; publicationRef?: string;
  base: import("../../../model/trunk.ts").GitOid | null; candidate: import("../../../model/trunk.ts").GitOid;
  allDiff: { complete: true; base: import("../../../model/trunk.ts").GitOid | null; candidate: import("../../../model/trunk.ts").GitOid; entries: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan["diff"] };
  argv: readonly string[]; commands: readonly (readonly string[])[];
  worksite: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan["worksite"];
  rawObjectPlan: import("../../../provider/trunk/public/trunk-store.ts").GitCandidatePlan;
  businessPublication: import("../../../provider/trunk/public/trunk-store.ts").GitDocumentCommitPlan["publication"] | import("../../../provider/trunk/public/trunk-store.ts").GitActiveCommitPlan["publication"] | import("../../../provider/trunk/public/trunk-store.ts").GitInitialWorkflowCommitPlan["publication"];
  appGeneratedFiles: import("../../../provider/trunk/public/trunk-store.ts").GitDocumentCommitPlan["files"];
  manifestSha256: string; journalDigest: string; businessJournal: import("../../../model/trunk.ts").TrunkApplyJournal;
  businessBaseManifestBytesBase64?: string;
}
export interface PreparedTaskProcessSource {
  taskId: string; sourceAssignmentTaskId: string; parentCoreSessionId: string;
  workSourceRef: import("../../../model/runtime.ts").TaskWorkSourceRef;
  expectedFiles: readonly { path: string; sha256: string }[];
}
export interface PreparedDirectAuthority {
  taskId: string; runId: string; authorizationDigest: string;
  /** Actual publishing task's immutable Chief input source, independent of repository initialization history. */
  processSource: { parentCoreSessionId: string; workSourceRef: import("../../../model/runtime.ts").TaskWorkSourceRef };
  expectedFiles: readonly { path: string; sha256: string }[];
  candidatePolicyInput: DirectDocumentPolicyInput; publicationPolicyInput: DirectDocumentPolicyInput;
}
export interface DecisionEvidenceInput { originRoleId: string; request: CustomerInputRequest; metadata?: CustomerInputMetadata }
export interface DecisionEvidenceVerification {
  files: readonly { path: string; sha256: string | null }[];
  discovery?: { flowId: string; digest: string };
  task?: { taskId: string; digest: string };
}
export interface PreparedDecisionEvidence {
  baseDigest: string;
  evidenceRefs: readonly SnapshotArtifactRef[];
  context: string;
  verification: DecisionEvidenceVerification;
}

// —————————————— 通用结果 ——————————————

/** 失败码 = C1 `TRUNK_ERROR_CODES`（单一来源；本层不造同义码）。失败即不改指针/不写事件。 */
export type TrunkServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TrunkErrorCode; message?: string };

// —————————————— 注入依赖 ——————————————

/**
 * run manifest re-pin Port（S3 `run-manifest.ts` 实现 `repinPinnedRun`；同 runId、追加 `repins`、
 * 幂等）。S2 只调用，不复制 run-manifest 写入语义。
 */
export interface RunRepinPort {
  repin(input: {
    runId: string;
    targets: TrunkRepinTarget[];
    applicationId: string;
    decisionId?: string;
    at: string;
  }): Promise<{ ok: true; alreadyApplied: boolean } | { ok: false; code: string; message?: string }>;
}

/** `RunRepinRecord.targets` 的 kind 集合（C1/S3 冻结形状）。 */
export type TrunkRepinTargetKind =
  | "intent"
  | "proposal"
  | "modules"
  | "roster"
  | "topology"
  | "architecture"
  | "assets"
  | "teamPlan"
  | "flow";

export interface TrunkRepinTarget {
  kind: TrunkRepinTargetKind;
  path: string;
  sha256: string;
}

export interface TrunkServiceDeps {
  projectRoot: string;
  /** S1 文件系统存储（`.ans/trunk/`）。 */
  store: TrunkStore;
  /** S1 R9 冻结注册表适配（C2b 唯一实现之上的 Port）。 */
  freezeRegistry: FreezeRegistryStore;
  /** S3 注入；缺省时 upgrade/detail 需要 re-pin 的 apply 返回 `trunk-apply-failed`。 */
  runRepin?: RunRepinPort;
  now?: () => Date;
}

// —————————————— 视图 / 校验结果 ——————————————

export interface TrunkStatusView {
  availability: TrunkAvailability;
  /** 落盘 manifest（`frozen`/`apply-uncertain`）或派生虚拟 manifest（`derived`）。 */
  manifest?: TrunkManifest;
  /** true = 未落盘、从唯一 pinned run 派生（零写入）。 */
  derived: boolean;
  frozenDocuments: Array<{ kind: TrunkDocKind; path: string; sha256: string; version?: number }>;
  stable: {
    workflow?: TrunkStableArtifactRef;
    roleCards?: Record<string, TrunkStableArtifactRef>;
    boundaries?: Record<string, TrunkStableArtifactRef>;
  };
  amendment?: {
    amendmentId: string;
    status: TrunkAmendmentStatus;
    applyState: TrunkAmendmentApplyState;
    applicationId?: string;
  };
  journal?: { journalId: string; phase: TrunkApplyJournalPhase; result?: "committed" | "apply-failed" | "applied-uncertain" };
  /** stable 文件已写入但无 trunk manifest/快照可续接（待续接；不虚构快照）。 */
  pendingReattach: string[];
  issues: string[];
}

export interface TrunkVerifyResult {
  ok: boolean;
  violations: string[];
}

/** 修正案 item 的哈希定格视图（from 取 trunk/run 基线 ref；to 取当刻字节）。 */
export interface SnapshotItem extends TrunkAmendmentItem {
  fromSha256: string | null;
  toSha256: string;
}

export interface AmendmentValidation {
  doc: TrunkAmendmentDoc;
  path: string;
  docSha256: string;
  docVersion: number;
  /** 已计算 from/to 哈希的 items（提交定格用；change:none 保留但不作为 target）。 */
  items: SnapshotItem[];
}

export interface TargetVersionChoice {
  selected?: number;
  candidates: Array<{ path: string; version: number }>;
}

export interface ExpansionResult {
  expanded: boolean;
  /** 扩大的条目/原因（供客户勾选预览；只读，不写边界）。 */
  expansions: string[];
}

// —————————————— apply ——————————————

/** `trunk.state` 审计载荷（S4 映射为 C1 `TrunkStateEvent`；`v`/`at` 由账本层补）。 */
export interface TrunkStateAuditPayload {
  kind: "trunk.state";
  op: TrunkStateOp;
  trunkVersion: number;
  previousTrunkVersion?: number;
  runId: string | null;
  flowId: string;
  source?: TrunkSource;
  decidedBy?: "customer";
  origin: "customer" | "application";
  channel?: "governance-card" | "application-observer" | "low-level-run-change";
  decisionId?: string;
  confirmationId?: string;
  amendmentId?: string;
  journalId?: string;
  path?: string;
  oldSha?: string;
  newSha?: string;
  reason?: string;
  at: string;
}

/** stable mini re-pin 审计载荷（与 C2c `StableRepinAudit` 结构一致；不升 trunkVersion）。 */
export interface StableRepinAuditPayload {
  op: "stable-repinned";
  trunkVersion: number;
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  origin: "customer";
  decidedBy: "customer";
  at: string;
}

export interface TrunkStableSnapshotInput {
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  /** 写入前 hash（"" = 写入前文件不存在；record.baseSha256 同约定）。 */
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  at: string;
}

export interface TrunkStableSnapshotResult {
  applied: boolean;
  errorCode?: string; message?: string;
  pendingReattach?: boolean;
  audit?: StableRepinAuditPayload;
}

export interface TrunkApplyInput {
  /** bootstrap 仅建立 t1；recovery 只经 `recover()`。 */
  source: "amendment" | "upgrade" | "bootstrap";
  flowId: string;
  /** VCA/修正案 applicationId（审计关联）。 */
  applicationId: string;
  /** 客户决定 id（VCA 批准）；有则审计 origin/decidedBy = customer。 */
  decisionId?: string;
  amendmentId?: string;
  runId: string | null;
  /** 期望的当前主干版本；null = 无 manifest（仅 bootstrap）。 */
  baseTrunkVersion: number | null;
  /** 目标内容快照（documents/execution/workflow/roleCards/boundaries；service 以磁盘字节复核）。 */
  target: TrunkApplySnapshot;
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  /** 需要更新 pinned run manifest 时提供（S3 Port）。 */
  repin?: { runId: string; targets: TrunkRepinTarget[] };
  highRisk?: { acknowledged: true; items?: string[] };
  journalId?: string;
  at: string;
}

export interface TrunkApplyResult {
  manifest: TrunkManifest;
  journalId: string;
  alreadyApplied: boolean;
  previousTrunkVersion: number | null;
  historyArchivedVersion?: number;
  audit: TrunkStateAuditPayload;
  issues?: string[];
}

export type JournalContentPhase = "prepared" | "run-manifest-written" | "committed";

export interface ReconcileResult {
  state: "none" | JournalContentPhase | "split";
  journalId?: string;
  recordedPhase?: TrunkApplyJournalPhase;
  contentPhase?: JournalContentPhase;
  split: boolean;
  message?: string;
  /** 内容已到提交点但事件缺失：S4 补写（幂等）。 */
  audit?: TrunkStateAuditPayload;
}

export interface TrunkRecoveryInput {
  /** 客户确认 id（恢复需客户本人确认）。 */
  decisionId: string;
  reason: string;
  /** true = 优先用 apply-journal 的 target 内容；缺省从唯一 pinned run 重新派生。 */
  useJournalTarget?: boolean;
  /**
   * 显式修复目标（维护/修复用，优先级最高）：由调用方组装快照；service 仍以磁盘字节复核
   * 内容哈希并校验版本化文档已冻结，未通过即拒绝（fail-closed，不改指针）。
   */
  target?: TrunkApplySnapshot;
  /** 需要同时回绑 pinned run 时提供（与 apply/bootstrap 同语义、同提交协议）。 */
  repin?: { runId: string; targets: TrunkRepinTarget[] };
  /** 修复目标携带的名单事实（缺省沿用当前 manifest 值；存量重建时由调用方从派生基线提供）。 */
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  journalId?: string;
  at: string;
}

// —————————————— 2026-11-05（Batch 3.5 / S5）：主干客户动作（refreeze/abandon/history） ——————————————

/** stable 快照目标（refreeze 只允许 stable 文件；版本化文档/execution 一律拒绝）。 */
export interface TrunkStableSnapshotTarget {
  workflow?: { path: string; sha256: string };
  roleCards?: Record<string, { path: string; sha256: string }>;
  boundaries?: Record<string, { path: string; sha256: string }>;
}

export interface TrunkRefreezeInput {
  /** 客户 decisionId（客户本人；不进入判断器/委托/指令）。 */
  decisionId: string;
  reason: string;
  /** 高危二次确认（重新冻结属应急/恢复路径时必须 acknowledged:true）。 */
  highRisk?: { acknowledged: true; items?: string[] };
  /** 只更新 stable 快照（内容以磁盘字节复核）；**不升 trunkVersion**。 */
  target: TrunkStableSnapshotTarget;
  at: string;
}

export interface TrunkRefreezeResult {
  manifest: TrunkManifest;
  audit: TrunkStateAuditPayload;
  /** 实际变化的 stable 路径（workflow / roleCards.<role> / boundaries.<role>）。 */
  changed: string[];
}

export interface TrunkAbandonUpgradeInput {
  decisionId: string;
  reason: string;
  at: string;
}

export interface TrunkAbandonUpgradeResult {
  /** 当前 trunk manifest（放弃不改指针；无 manifest 时 undefined）。 */
  manifest?: TrunkManifest;
  audit: TrunkStateAuditPayload;
}

export interface TrunkHistoryResult {
  /** 已归档的 trunk 版本号（升序；来自 `.ans/trunk/history/`，不虚构内容）。 */
  versions: number[];
  /** 当前主干版本（无 manifest 时缺省）。 */
  currentTrunkVersion?: number;
}

// —————————————— 2026-11-05（E2 返工 S7 / AC-5 / AC-13） ——————————————

/** version-upgrade 前置校验输入（批准前/apply 前；有效文档 = 当前 trunk 覆盖 VCA targets 后）。 */
export interface UpgradeChainValidationInput {
  flowId: string;
  /** 有效文档集（path + sha256；内容以磁盘字节复核）。 */
  documents: Partial<Record<TrunkDocKind, { path: string; sha256: string }>>;
  /** 是否本次变更 roster（决定版本链强校验与 roster 版本单调）。 */
  rosterChanged: boolean;
  /** 当前 trunk rosterVersion（roster 变更时必须递增）。 */
  rosterVersionFloor?: number;
  /** 当前 D3（trunk manifest.d3 / run d3）；targetRoleIds 必须 ⊆ roster roles。 */
  d3?: { decisionId: string; targetRoleIds: string[] };
  /** Internal document-publication validation; never changes execution readiness. */
  planningOnly?: boolean;
  confirmedIntent?: { path: string; sha256: string };
  snapshot?: CompleteSnapshot;
  roleDocumentChecks?: readonly TrunkRoleDocumentCheck[];
  /** Only a real historical approval recovery; two-file quality is never activation or a new run pin. */
  legacyApproval?: { applicationId: string; decisionId: string; roles: readonly { roleId: string; cardSha256: string; boundaryYamlSha256: string }[] };
}

export interface UpgradeChainValidation {
  rosterVersion?: number;
  roleIds: string[];
  /** 已通过的检查（content/schema/roster/d3/chain/role-cards）。 */
  checks: string[];
}

/** stable boundary（preview 文本）扩大检测输入（AC-13；不写盘）。 */
export interface StableBoundaryExpansionInput {
  projectRoot: string;
  roleId: string;
  /** 当前 boundary.yaml（项目相对路径）。 */
  fromPath: string;
  /** 预览的最终 boundary.yaml 文本（客户确认卡 body）。 */
  toYamlText: string;
}

export interface StableBoundaryExpansionResult {
  expanded: boolean;
  /** 扩大条目（`root:path`）或不可解析原因（fail-closed）。 */
  expansions: string[];
}

// —————————————— Service ——————————————

/**
 * 主干 Service（P1 §2.3/§3.3）：
 * · `status`/`verify`/`derive`：派生只读 v1（零写入）、校验 pinned run/stable/roster/D3/R9；
 * · `validateAmendment`/`snapshotItemHashes`/`detectBoundaryExpansion`/`selectTargetVersion`：
 *   修正案解析、哈希定格、边界扩大（只读）、目标版本选择；
 * · `recordAmendment`/`readAmendment`：`.ans/trunk/amendment.json` 生命周期（P1.3 旧状态映射）；
 * · `executeApply`：journal 两阶段（提交点 = trunk manifest 写成功）、history 归档、审计载荷；
 * · `reconcileJournal`：内容匹配为主/phase 辅助、两方向/相位滞后如实报告；
 * · `recover`：客户确认的受控恢复（tN+1）；
 * · `applyStableSnapshot`：mini re-pin（不升 trunkVersion、无 manifest 只记待续接）；
 * · `current`/`latestFrozenVersion`：C2c `TrunkBaselinePort` 结构对齐。
 */
export interface TrunkService {
  status(): Promise<TrunkStatusView>;
  verify(): Promise<TrunkVerifyResult>;
  derive(): Promise<TrunkServiceResult<{ manifest: TrunkManifest; issues: string[] }>>;
  validateAmendment(input: { amendmentDocPath: string; flowId: string }): Promise<TrunkServiceResult<AmendmentValidation>>;
  snapshotItemHashes(items: readonly TrunkAmendmentItem[]): Promise<TrunkServiceResult<SnapshotItem[]>>;
  detectBoundaryExpansion(items: readonly TrunkAmendmentItem[]): Promise<ExpansionResult>;
  selectTargetVersion(input: { kind: TrunkAmendmentItemKind; path: string }): Promise<TargetVersionChoice>;
  recordAmendment(state: TrunkAmendmentState): Promise<TrunkServiceResult<TrunkAmendmentState>>;
  readAmendment(): Promise<TrunkServiceResult<TrunkAmendmentState | undefined>>;
  executeApply(input: TrunkApplyInput): Promise<TrunkServiceResult<TrunkApplyResult>>;
  reconcileJournal(): Promise<TrunkServiceResult<ReconcileResult>>;
  recover(input: TrunkRecoveryInput): Promise<TrunkServiceResult<TrunkApplyResult>>;
  applyStableSnapshot(input: TrunkStableSnapshotInput): Promise<TrunkStableSnapshotResult>;
  /**
   * 完成升级/重新冻结（P1.3 保留；Batch 3.5 S5）：只更新 stable 快照（workflow/roleCards/
   * boundaries），客户 decisionId + 高危确认；内容以磁盘字节复核；**不升 trunkVersion**。
   * 返回 `trunk.state(op:"refrozen")` 审计载荷（不写账本）。
   */
  refreeze(input: TrunkRefreezeInput): Promise<TrunkServiceResult<TrunkRefreezeResult>>;
  /** 放弃升级（P1.3 保留）：关闭解冻窗口、不 re-pin、不改指针；返回 `refrozen-cancelled` 载荷。 */
  abandonUpgrade(input: TrunkAbandonUpgradeInput): Promise<TrunkServiceResult<TrunkAbandonUpgradeResult>>;
  /** trunk 历史版本列表（只读；来自 history 归档，不虚构内容）。 */
  history(): Promise<TrunkServiceResult<TrunkHistoryResult>>;
  /** version-upgrade 批准前/apply 前校验（AC-5；失败返回 `trunk-item-invalid`，调用方映射 vca-*）。 */
  validateUpgradeChain(input: UpgradeChainValidationInput): Promise<TrunkServiceResult<UpgradeChainValidation>>;
  /** stable boundary 预览文本扩大检测（AC-13；只读，不写盘）。 */
  detectStableBoundaryExpansion(input: StableBoundaryExpansionInput): Promise<StableBoundaryExpansionResult>;
  /** C2c `TrunkBaselinePort`：当前主干引用；无 trunk 返回 null。 */
  current(): Promise<TrunkVersionRef | null>;
  /** C2c `TrunkBaselinePort`：路径族已冻结的最新版本号（未知返回 undefined）。 */
  latestFrozenVersion(pathFamily: string): Promise<number | undefined>;
}
