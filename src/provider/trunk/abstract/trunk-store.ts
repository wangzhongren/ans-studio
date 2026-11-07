// src/provider/trunk/abstract/trunk-store.ts
// trunk 存储 Provider 抽象契约（2026-11-04 trunk-amendment-model B-3 / S1）。
//
// 归属：编排（`src/provider/trunk/` 模块私有根，B-2/B-3 既有条目）。职责：**纯存储**——
// `.ans/trunk/{manifest,amendment,apply-journal}.json` 与 `history/` 的原子读写、坏件判别、
// history 归档；**不判断冻结/状态、不发事件、不改指针、不重建/覆盖坏件**（判定归 S2
// `src/service/trunk/` 与 S4）。
//
// 形状单一来源（C1 冻结）：`TrunkManifest`/`TrunkAmendmentState`/`TrunkApplyJournal` 从
// `src/model/trunk.ts` type-import，本文件不复制记录形状，只定义读写结果判别与相对路径常量。
// 依赖方向：Model → Provider；Provider 不 import Service/Pipeline/Interface。
//
// 判别语义（P1 §2.1/§3.1/§4.5）：
// · 读：`missing`（文件不存在）/`corrupt`（JSON 非法或结构不合法）/`io`（其它读失败）；
//   一律 `ok:false` 返回，**不自动重建、不自动覆盖**；
// · 写：原子（同目录临时文件 + fsync + rename，复用 `src/common/shared/atomic-write.ts`
//   的 Windows EPERM 有界重试）+ 每文件进程内串行链；
// · history：`history/manifest-v<N>.json` 归档；同版本同内容幂等、不同内容拒绝（不可变）。

import type {
  TrunkAmendmentState,
  TrunkApplyJournal,
  TrunkManifest,
  CompleteSnapshot, SnapshotRef, TrunkCommitRef, FrozenRoleEvidence, ActiveRoleEvidence, SnapshotArtifactRef,
  GitRawTreeEntry, GitRawStoredCommit, GitRawObjectInput, GitRawObjectPlan,
} from "../../../model/trunk.ts";

/** 当前主干 manifest 相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_MANIFEST_REL = ".ans/trunk/manifest.json";
/** 进行中修正案状态相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_AMENDMENT_REL = ".ans/trunk/amendment.json";
/** 跨文件提交日志相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_JOURNAL_REL = ".ans/trunk/apply-journal.json";
/** history 归档目录（`.ans/trunk/history/`，app-only）。 */
export const TRUNK_HISTORY_DIR = ".ans/trunk/history/";

/** 读失败原因：缺失 / 坏件 / 其它 I/O。 */
export type StoreReadFailureReason = "missing" | "corrupt" | "io";

export interface StoreReadFailure {
  ok: false;
  reason: StoreReadFailureReason;
  message?: string;
}

/** 判别式读结果：`ok:false` 时调用方决定迁移/恢复，Provider 不自行处理。 */
export type StoreRead<T> = { ok: true; value: T } | StoreReadFailure;

/** 写失败：`invalid` = 待写对象结构不合法；`io` = 落盘失败（原子写失败不改目标）。 */
export type StoreWriteFailureCode = "invalid" | "io";

export interface StoreWriteFailure {
  ok: false;
  code: StoreWriteFailureCode;
  message?: string;
}

export type StoreWrite = { ok: true } | StoreWriteFailure;
export type ManifestCasResult = StoreWrite | { ok: false; code: "conflict"; message: string };
export interface ActiveCommitRef { revision: number; digest: string | null }
export interface ActiveRolesState { revision: number; digest: string; roles: Record<string, ActiveRoleEvidence> }
export interface SnapshotCaptureInput {
  snapshotId: string;
  createdAt: string;
  files: readonly { path: string; sha256: string }[];
  /** Reuse immutable bytes for unchanged refs; never replace them with live bytes. */
  baseSnapshotRef?: SnapshotRef;
}

/** Infrastructure facts only; none of these fields grants role/task authorization. */
export interface GitProcessFacts {
  processId: string; operationId?: string; repoId?: string; executable: string; argv: readonly string[]; pid?: number;
  startedAt: string; endedAt?: string; exitCode: number | null; signal: string | null;
  timedOut: boolean; aborted: boolean; outputTruncated: boolean;
  launch?: "pending" | "started" | "cancelled-before-spawn";
  termination: "exited" | "unknown"; stdout: string; stdoutBase64?: string; stderr: string; error?: string;
}
export interface GitRepositoryIdentity {
  repoId: string; root: string; gitDir: string; commonDir: string;
  objectFormat: "sha1" | "sha256"; configDigest: string;
}
export interface GitProtectionFacts {
  projectRoot: string; protectedGitRoots: readonly string[]; coverage: "complete" | "unknown";
  basisDigest: string; identity?: GitRepositoryIdentity; reasons: readonly string[];
}
export interface GitInitializationFacts {
  projectRoot: string; state: "absent" | "existing" | "unsupported"; applicationStatePresent: boolean;
  parentRepositories: readonly string[]; files: readonly { path: string; sha256: string; bytes: number; source: "application-state" | "unattributed-existing-content" }[];
  basisDigest: string; qualificationDigest: string; reasons: readonly string[];
}
export interface GitInitializationPlan {
  projectRoot: string; objectFormat: "sha1" | "sha256"; templateDir: string; qualificationDigest: string;
  worksite: { kind: "raw-object-plumbing"; index: "not-used"; checkout: "not-used" };
  argv: readonly string[];
}
export interface GitQueryPort {
  inspect(): Promise<GitRepositoryIdentity>;
  plan(input: import("../../../model/runtime.ts").GitQueryRequest): Promise<{ identity: GitRepositoryIdentity; argv: readonly string[] }>;
  query(input: import("../../../model/runtime.ts").GitQueryRequest, signal?: AbortSignal): Promise<GitProcessFacts>;
}
/** Existing public names retain the shared Model raw data, including modes and R/C observations. */
export type GitTreeEntry = GitRawTreeEntry;
export type GitStoredCommit = GitRawStoredCommit;
export type GitCandidateInput = GitRawObjectInput;
export interface GitRevertInput {
  operationId: string; base: import("../../../model/trunk.ts").GitOid; commit: import("../../../model/trunk.ts").GitOid;
  mainline?: number; message: string; timestamp: string;
}
export type GitRevertPlanResult = { ok: true; value: GitCandidatePlan } | { ok: false; code: "git-revert-conflict" | "git-revert-mode-unsupported"; basis: import("../../../model/trunk.ts").GitRawRevertBasis; message: string };
export interface GitCandidateStore {
  inspect(): Promise<GitRepositoryIdentity>;
  prepare(input: GitCandidateInput, signal?: AbortSignal, hostLeaseId?: string): Promise<GitStoredCommit>;
  /** Write/read back objects only; the journalled ref CAS remains the single candidate publication point. */
  prepareObjects(input: GitCandidateInput, signal?: AbortSignal, hostLeaseId?: string): Promise<GitStoredCommit>;
  plan(input: GitCandidateInput): Promise<GitCandidatePlan>;
  planRevert(input: GitRevertInput): Promise<GitRevertPlanResult>;
  readCommit(oid: import("../../../model/trunk.ts").GitOid): Promise<GitStoredCommit>;
  readCommitBytes(oid: import("../../../model/trunk.ts").GitOid): Promise<{ bytesBase64: string; sha256: string }>;
  listTree(oid: import("../../../model/trunk.ts").GitOid): Promise<readonly GitTreeEntry[]>;
  readBlob(oid: import("../../../model/trunk.ts").GitOid, path: string): Promise<{ bytesBase64: string; sha256: string }>;
  readRef(ref: string): Promise<import("../../../model/trunk.ts").GitOid | null>;
  listDeliveryRefs(): Promise<readonly { ref: string; oid: import("../../../model/trunk.ts").GitOid }[]>;
}
export type GitCandidatePlan = GitRawObjectPlan;
export interface GitRefJournal {
  media: "git-ref/v1"; operationId: string; repoId: string; ref: string;
  oldOid: import("../../../model/trunk.ts").GitOid | null; newOid: import("../../../model/trunk.ts").GitOid;
  tree: import("../../../model/trunk.ts").GitOid; parents: import("../../../model/trunk.ts").GitOid[];
  requestDigest: string; phase: "prepared" | "published" | "conflict" | "unknown";
  process?: GitProcessFacts;
  businessJournal?: TrunkApplyJournal;
  publicationTask?: { taskId: string; runId: string; ledgerSha256: string };
  legacyManifestSha256?: string;
  candidateSource?: GitTaskCandidateSource | GitIntegrationSource | GitRevertSource;
  deliverySource?: GitDeliverySource;
}
export interface GitTaskCandidateSource {
  kind: "assigned-run-task"; taskId: string; runId: string; flowId: string; roleId: string; moduleId: string;
  pinDigest: string; taskDigest: string; runRecordSha256: string; scopeDigest: string;
  base: import("../../../model/trunk.ts").GitBasis;
  files: readonly { path: string; sha256: string | null }[];
}
export interface GitIntegrationSource extends Omit<GitTaskCandidateSource, "kind" | "moduleId"> {
  kind: "run-integration";
  contributors: readonly { operationId: string; candidate: import("../../../model/trunk.ts").GitOid; source: GitTaskCandidateSource; closeOperationId: string; closeEventId: string; reportSha256: string }[];
}
export interface GitCandidateEvidence {
  journal: GitRefJournal; journalFile: { path: string; sha256: string; bytesBase64: string };
  commit: GitStoredCommit;
}
/** A real controller-owned inverse candidate. No worker contribution/acceptance is invented. */
export interface GitRevertSource extends Omit<GitTaskCandidateSource, "kind" | "moduleId"> {
  kind: "run-revert"; roleId: "convener";
  target: import("../../../model/trunk.ts").GitOid; mainline?: number;
  revertBasis: import("../../../model/trunk.ts").GitRawRevertBasis;
  ownerGrants: readonly { ownerRoleId: string; paths: readonly string[]; evidenceDigest: string }[];
}
export type GitExecutionBases = import("../../../common/编排/run-manifest.ts").RunGitBases;
/** Existing object/ref plan only; it does not create an index, checkout or new commit. */
export interface GitRefPublicationPlan {
  ref: string; oldOid: import("../../../model/trunk.ts").GitOid | null;
  commitBytesBase64: string; oldCommitBytesBase64: string | null;
  commit: GitStoredCommit; baseTree: readonly GitTreeEntry[]; candidateTree: readonly GitTreeEntry[];
  worksite: { kind: "ref-only"; index: "not-used"; checkout: "not-used" };
  argv: readonly string[]; diff: GitCandidatePlan["diff"];
}
export interface GitDeliverySource {
  kind: "verified-run-delivery"; taskId: string; runId: string; flowId: string; roleId: "convener";
  candidateOperationId: string; candidateJournalSha256: string; pinDigest: string; runRecordSha256: string;
  taskDigest: string; ledgerDigest: string; qualityTaskId: string; qualityDigest: string;
  creatorCloseOperationId: string; creatorCloseEventId: string; qualityReportSha256: string;
  criteria: readonly import("../../../model/trunk.ts").GitEvidenceRef[];
  evidence: readonly import("../../../model/trunk.ts").GitEvidenceRef[];
  liveFiles: readonly { path: string; sha256: string }[];
}
export interface GitBusinessPreparation { media: "git-ref/v1"; operationId: string; repoId: string; requestDigest: string; phase: "business-prepared"; businessJournal: TrunkApplyJournal }
export type GitOperationRecord = GitRefJournal | GitBusinessPreparation;
export interface GitRefStore {
  writeCandidateJournal(input: Omit<GitRefJournal, "media" | "phase" | "process">): Promise<StoreWrite>;
  writeBusinessJournal(journal: TrunkApplyJournal): Promise<StoreWrite>;
  readJournal(operationId: string): Promise<GitOperationRecord | null>;
  listJournals(): Promise<readonly GitOperationRecord[]>;
  publish(input: Omit<GitRefJournal, "media" | "phase" | "process">, signal?: AbortSignal): Promise<{
    status: "published" | "conflict" | "blocked" | "pending-recovery"; journalId: string; journal: GitRefJournal; message?: string;
  }>;
}
export interface GitInitializationRecord {
  media: "git-initialization/v1"; operationId: string; requestDigest: string;
  projectRoot: string; taskId: string; runId: string; flowId: string; sourceId: string; sourceSha256: string;
  qualificationDigest: string; expectedFiles: readonly { path: string; sha256: string }[];
  stage: "prepared" | "repository-created" | "candidate-created";
  repoId?: string; candidate?: import("../../../model/trunk.ts").GitOid; tree?: import("../../../model/trunk.ts").GitOid;
  parents?: readonly import("../../../model/trunk.ts").GitOid[];
}
export interface StorageOperationIdentity { media: "fs" | "git-ref/v1" | "git-initialization/v1"; operationId: string }
export interface InitialGitPublicationBasis {
  repoId: string; flowId: string; initializationOperationId: string; sourceId: string; sourceSha256: string;
  parentCoreSessionId: string;
  initialCandidate: import("../../../model/trunk.ts").GitOid;
}
export interface GitInitializationTaskBasis extends InitialGitPublicationBasis {
  taskId: string; runId: string; tree: import("../../../model/trunk.ts").GitOid;
  files: CompleteSnapshot["files"];
}
/** One content-bound storage transaction; the token is the actual held host lease, never an allow flag. */
export interface GitDocumentMutationScope {
  publicationTask?: { taskId: string; runId: string; ledgerSha256: string };
  hostLeaseId: string; operationId: string; actorRoleId: string; flowId: string;
  manifestSha256: string; journalDigest: string; snapshot: SnapshotRef;
  expectedBase: TrunkCommitRef | null; expectedActive: ActiveCommitRef; expectedSnapshot?: SnapshotRef;
  expectedFiles: readonly { path: string; sha256: string }[];
  plannedCommit?: { repoId: string; configDigest: string; base: import("../../../model/trunk.ts").GitOid | null; commit: GitStoredCommit };
  activeTarget?: ActiveRolesState;
  initialWorkflowSource?: GitInitialWorkflowSource;
}
export interface GitDocumentCommitPlan {
  repo: GitRepositoryIdentity; base: import("../../../model/trunk.ts").GitOid | null; candidate: GitCandidatePlan;
  baseManifestBytesBase64?: string;
  publicationCommand: readonly string[];
  manifestSha256: string; journalDigest: string;
  files: readonly { path: string; sha256: string; oid: import("../../../model/trunk.ts").GitOid;
    kind: "manifest" | "complete-snapshot" | "history" | "frozen-application-evidence" | "snapshot-content" }[];
  publication: { kind: "direct-document-publication"; flowId: string; operationId: string; actorRoleId: string; applicationId: string;
    action: string; snapshot: SnapshotRef; documents: TrunkManifest["artifacts"]["documents"]; execution: TrunkManifest["artifacts"]["execution"] };
}
export interface GitActiveCommitPlan extends Omit<GitDocumentCommitPlan, "publication"> {
  publication: { kind: "role-activation-publication"; flowId: string; operationId: string; actorRoleId: string; applicationId: string;
    action: "activate-role-documents"; snapshot: SnapshotRef; documentSnapshot: SnapshotRef; targetRoleId: string;
    expectedActive: ActiveCommitRef; targetActive: ActiveRolesState; evidence: import("../../../model/trunk.ts").ActiveRoleEvidence;
    documents: TrunkManifest["artifacts"]["documents"]; execution: TrunkManifest["artifacts"]["execution"] };
}
export interface GitInitialWorkflowSource {
  schema: "stable-initial-workflow-source/v1"; kind: "stable-initial-workflow"; operationId: string;
  flowId: string; taskId: string; runId: string; coreSessionId: string; coreTurnId?: string;
  roleId: "convener"; requestId: string; permitId: string; path: "docs/workflow.md"; baseSha256: ""; targetSha256: string;
  authority: import("../../../model/version-change.ts").StableWriteAuthority;
  documentCommit: TrunkCommitRef; documentSnapshot: SnapshotRef;
}
export interface GitInitialWorkflowCommitPlan extends Omit<GitDocumentCommitPlan, "publication"> {
  publication: { kind: "stable-initial-workflow-publication"; flowId: string; operationId: string; actorRoleId: "convener";
    snapshot: SnapshotRef; documentSnapshot: SnapshotRef; source: GitInitialWorkflowSource;
    record: import("../../../model/version-change.ts").StableWriteRecord; permit: import("../../../model/version-change.ts").StableWritePermit;
    documents: TrunkManifest["artifacts"]["documents"]; execution: TrunkManifest["artifacts"]["execution"] };
}
export interface GitActiveCompletionBasis {
  kind: "current-active-completion"; repoId: string; flowId: string; gitOid: import("../../../model/trunk.ts").GitOid;
  active: { revision: number; digest: string };
  roles: readonly { roleId: string; operationId: string; evidence: import("../../../model/trunk.ts").ActiveRoleEvidence }[];
}
export interface GitPlanCompletionBasis {
  kind: "team-plan-completion"; flowId: string; taskId: string; runId: string; operationId: string;
  sourceId: string; sourceSha256: string; journalSha256: string;
  trunk: TrunkCommitRef; snapshot: SnapshotRef; plan: { path: string; sha256: string };
}
/** Published workflow bytes for this exact original stable task, not a grant inferred from report text. */
export interface GitStableCompletionBasis {
  kind: "stable-workflow-completion"; repoId: string; flowId: string; taskId: string; runId: string; operationId: string;
  gitOid: import("../../../model/trunk.ts").GitOid; publishedOid: import("../../../model/trunk.ts").GitOid;
  snapshotRef: SnapshotRef; workflow: { path: "docs/workflow.md"; sha256: string };
  sourceFile: { path: string; sha256: string }; journalSha256: string;
  stableWritesSha256: string; stablePermitsSha256: string;
}

/** Provider 错误判别形状（读/写两族；不抛出业务码，不映射 C1 `TrunkErrorCode`）。 */
export type TrunkStoreError = StoreReadFailure | StoreWriteFailure;

/**
 * trunk 存储接口（S2 `TrunkService`/S4 `trunk-runtime` 消费；测试可注入替身）。
 * 全部方法以**项目相对路径常量**定位，不接受任意路径；`projectRoot` 在工厂期绑定。
 */
export interface RunChangeSource {
  oldRunId: string; oldSha256: string; requesterTaskId: string;
  /** SHA256 of the unique real task.created event; later natural reports are not revocations. */
  requesterDigest: string; requestDigest: string;
}
export interface TrunkStore {
  readCommittedFreezeBasis?(journal: TrunkApplyJournal): Promise<StoreRead<import("../../version-change/public/version-change-store.ts").CommittedFreezeBasis>>;
  finalizeCommittedMetadata?(journal: TrunkApplyJournal, proof: import("../../version-change/public/version-change-store.ts").CommittedFreezeBasis): Promise<StoreWrite>;
  writeInitializationSource?(sourceId: string, bytesBase64: string): Promise<StoreRead<{ path: string; sha256: string }>>;
  readInitializationSource?(sourceId: string): Promise<StoreRead<{ path: string; sha256: string; bytesBase64: string }>>;
  readGitInitializationFacts?(): Promise<GitInitializationFacts>;
  /** Explicit absent document pointer proven by a real successful init; never legacy missing/live fallback. */
  readInitialGitPublicationBasis?(flowId: string): Promise<StoreRead<InitialGitPublicationBasis>>;
  planDocumentCommit?(input: { manifest: TrunkManifest; journal: TrunkApplyJournal; expectedBase: TrunkCommitRef | null }): Promise<StoreRead<GitDocumentCommitPlan>>;
  planActiveCommit?(input: { manifest: TrunkManifest; journal: TrunkApplyJournal; expectedBase: TrunkCommitRef;
    expectedActive: ActiveCommitRef; targetRoleId: string }): Promise<StoreRead<GitActiveCommitPlan>>;
  planInitialWorkflowCommit?(input: { manifest: TrunkManifest; journal: TrunkApplyJournal; source: GitInitialWorkflowSource;
    record: import("../../../model/version-change.ts").StableWriteRecord; permit: import("../../../model/version-change.ts").StableWritePermit }): Promise<StoreRead<GitInitialWorkflowCommitPlan>>;
  listStorageOperations?(): Promise<StoreRead<readonly StorageOperationIdentity[]>>;
  /** Opaque application-owned run JSON; business schema and transitions belong to Service. */
  readRunRecord?(runId: string): Promise<StoreRead<{ value: Record<string, unknown>; sha256: string }>>;
  /** Actual Git app-ref read, bound to the complete document/active basis. Missing on legacy FS media. */
  readCodeBasis?(expected: { trunk: TrunkCommitRef; active: ActiveCommitRef; snapshot?: SnapshotRef }): Promise<StoreRead<import("../../../model/trunk.ts").GitBasis>>;
  readExecutionBases?(expected: { trunk: TrunkCommitRef; active: ActiveCommitRef; snapshot?: SnapshotRef }): Promise<StoreRead<GitExecutionBases>>;
  verifyExecutionBases?(bases: GitExecutionBases): Promise<StoreRead<GitExecutionBases>>;
  compareAndSwapRunRecord?(runId: string, expectedSha256: string | null, value: Record<string, unknown>,
    expectedBasis?: { trunk: TrunkCommitRef; active: ActiveCommitRef; snapshot?: SnapshotRef; codeBasis?: import("../../../model/trunk.ts").GitBasis; gitBases?: GitExecutionBases;
      sourceTask?: { taskId: string; digest: string }; runChangeSource?: RunChangeSource }): Promise<ManifestCasResult>;
  commitRunTransition?(input: { hostLeaseId: string; coordinatorRevision: number; ledgerDigest: string; runChangeSource?: RunChangeSource;
    old: { runId: string; sha256: string; value: Record<string, unknown> };
    replacement?: { runId: string; sha256: string; value: Record<string, unknown>; trunk: TrunkCommitRef; active: ActiveCommitRef;
      snapshot?: SnapshotRef; gitBases?: GitExecutionBases; sourceTask?: { taskId: string; digest: string } } }): Promise<ManifestCasResult>;
  readProjectFile?(relPath: string, options?: { maxBytes?: number }): Promise<StoreRead<{ bytesBase64: string; sha256: string }>>;
  prepareSnapshot?(snapshot: CompleteSnapshot): Promise<StoreRead<SnapshotRef>>;
  captureSnapshot?(input: SnapshotCaptureInput): Promise<StoreRead<SnapshotRef>>;
  readSnapshot?(ref: SnapshotRef): Promise<StoreRead<CompleteSnapshot>>;
  readSnapshotArtifact?(ref: SnapshotArtifactRef): Promise<StoreRead<{ snapshot: CompleteSnapshot; bytesBase64: string; sha256: string }>>;
  compareAndSwapManifest?(expected: TrunkCommitRef | null, next: TrunkManifest, snapshot: SnapshotRef, expectedActive?: ActiveCommitRef, expectedSnapshot?: SnapshotRef): Promise<ManifestCasResult>;
  compareAndSwapActiveRoles?(expectedTrunk: TrunkCommitRef, expectedActive: ActiveCommitRef,
    next: ActiveRolesState): Promise<ManifestCasResult>;
  readActiveRolesAt?(ref: { revision: number; digest: string }): Promise<StoreRead<ActiveRolesState>>;
  readActiveRoleEvidence?(evidence: ActiveRoleEvidence): Promise<StoreRead<CompleteSnapshot>>;
  readFrozenRoleEvidence?(evidence: FrozenRoleEvidence): Promise<StoreRead<CompleteSnapshot>>;
  readOperation?(operationId: string): Promise<StoreRead<TrunkApplyJournal>>;
  readOperationCommit?(journal: TrunkApplyJournal): Promise<StoreRead<TrunkManifest>>;
  listOperationRecords?(): Promise<StoreRead<readonly TrunkApplyJournal[]>>;
  writeOperation?(journal: TrunkApplyJournal): Promise<StoreWrite>;
  readManifestAt?(ref: TrunkCommitRef, expectedSnapshot?: SnapshotRef): Promise<StoreRead<TrunkManifest>>;
  listRunRecords?(): Promise<StoreRead<readonly Record<string, unknown>[]>>;
  readManifestVersion?(version: number): Promise<StoreRead<TrunkManifest>>;
  readManifest(): Promise<StoreRead<TrunkManifest>>;
  writeManifest(manifest: TrunkManifest): Promise<StoreWrite>;
  readAmendment(): Promise<StoreRead<TrunkAmendmentState>>;
  writeAmendment(amendment: TrunkAmendmentState): Promise<StoreWrite>;
  readJournal(): Promise<StoreRead<TrunkApplyJournal>>;
  writeJournal(journal: TrunkApplyJournal): Promise<StoreWrite>;
  /** 归档某一主干版本（`history/manifest-v<N>.json`）；同版本同内容幂等。 */
  archiveHistory(version: number, manifest: TrunkManifest): Promise<StoreWrite>;
  /** 已归档版本号（升序）；坏件跳过，可用 `onDiagnostic` 收集诊断。 */
  listHistory(options?: { onDiagnostic?: (message: string) => void }): Promise<number[]>;
}

/** Ordinary host inventory and process admission serialization, not permission evidence. */
export interface GitHostOpenFailureRef { source: "pipeline-role-open-failure"; failureId: string }
export interface GitHostQueuePersistenceFacts {
  managerId?: string; path?: string; armed: boolean; enqueuedSeq: number; completedSeq: number; committedSeq: number; pending: number; failureCount: number;
  lastError?: { seq: number; code: string; path: string };
  knownProducers: { openChains: number; deliveryClaims: number; handbackCommits: number };
}
export interface GitHostRunStopFact {
  managerId: string; operationId: string; runId: string; requestDigest: string; generation: number;
  state: "fenced"; hostHandleIds: readonly string[]; targetSeq: number;
}
/** Host-published exact controller fence; it does not cancel an execution run. */
export interface GitHostControllerStopFact {
  managerId: string; operationId: string; taskId: string; runId: string; requestDigest: string; generation: number;
  state: "fenced"; hostHandleIds: readonly string[]; targetSeq: number;
  /** Only producers affecting this exact target task, excluding the calling Chief's own turn. */
  knownProducers: GitHostQueuePersistenceFacts["knownProducers"];
}
export interface GitHostInventory {
  source: "desktop-session-manager"; projectRoot: string; observedAt: string; revision: string | number;
  sessions: readonly { hostHandleId: string; roleId: string; runtime: string; phase: "creating" | "live" | "disposing" | "disposed" | "dispose-failed" | "open-failed";
    coreSessionId?: string; taskId?: string; runId?: string;
    openFailureRef?: GitHostOpenFailureRef;
    toolSurface?: import("../../../model/runtime.ts").RuntimeSessionToolSurfaceFacts;
    lifecycle?: import("../../../model/runtime.ts").RuntimeSessionLifecycleFacts; errors: readonly string[] }[];
  pendingOpens: readonly string[]; queuedDispatches: readonly unknown[]; activeDeliveries: readonly unknown[];
  deliveryQueuePersistence?: readonly GitHostQueuePersistenceFacts[];
  runStops?: readonly GitHostRunStopFact[];
  controllerStops?: readonly GitHostControllerStopFact[];
  coverage: "unknown"; reasons: readonly string[];
}
export type GitHostActionKind = "session-open" | "session-dispose" | "arm" | "dispatch" | "authorization-change" | "git-mutation";
