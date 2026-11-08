// src/provider/trunk/public/trunk-store.ts
// trunk 存储 Provider 公共出口（编排 B-3 / S1）。只 re-export，不定义第二份形状；
// 不 wildcard 导出 impl 内部（校验辅助不从公共面暴露）。

export {
  TRUNK_AMENDMENT_REL,
  TRUNK_HISTORY_DIR,
  TRUNK_JOURNAL_REL,
  TRUNK_MANIFEST_REL,
  type StoreRead,
  type StoreReadFailure,
  type StoreReadFailureReason,
  type StoreWrite,
  type StoreWriteFailure,
  type StoreWriteFailureCode,
  type TrunkStore,
  type RunChangeSource,
  type TrunkStoreError,
  type ManifestCasResult,
  type ActiveCommitRef,
  type ActiveRolesState,
  type SnapshotCaptureInput,
  type GitProcessFacts, type GitRepositoryIdentity, type GitProtectionFacts, type GitInitializationFacts, type GitQueryPort, type GitCandidateInput,
  type GitCandidateStore, type GitStoredCommit, type GitTreeEntry, type GitRefJournal, type GitRefStore,
  type GitCandidatePlan,
  type GitRevertInput, type GitRevertPlanResult,
  type GitTaskCandidateSource,
  type GitIntegrationSource,
  type GitRevertSource,
  type GitCandidateEvidence,
  type GitExecutionBases,
  type GitRefPublicationPlan, type GitDeliverySource,
  type StorageOperationIdentity,
  type GitOperationRecord, type GitBusinessPreparation,
  type GitInitializationRecord,
  type GitInitializationPlan,
  type InitialGitPublicationBasis,
  type GitInitializationTaskBasis,
  type GitDocumentMutationScope,
  type GitDocumentCommitPlan,
  type GitActiveCommitPlan, type GitActiveCompletionBasis, type GitPlanCompletionBasis, type GitStableCompletionBasis, type GitInitialWorkflowSource, type GitInitialWorkflowCommitPlan,
  type GitHostInventory, type GitHostActionKind, type GitHostOpenFailureRef, type GitHostQueuePersistenceFacts, type GitHostRunStopFact, type GitHostControllerStopFact,
} from "../abstract/trunk-store.ts";
export { createFsTrunkStore } from "../impl/fs-trunk-store.ts";
export { createGitQueryPort, initializeGitRepository, planGitRepositoryInitialization, readGitProtectionFacts, checkGitProtectionFactsCurrent, readGitInitializationFacts } from "../impl/git-command.ts";
// 2026-11-08（W3b，设计 P1.3 §2.4.3 / I0-4）：只读 Git 固定传输公共入口——只接受 `matchReadonlyGit`
// 的受限描述（不接受任意 argv），内部构造规范体并经绝对可执行 + 固定 config/env 执行。
export { executeReadonlyGit } from "../impl/git-command.ts";
export { readGitInitializationRecord, writeGitInitializationRecord } from "../impl/git-command.ts";
export { createGitCandidateStore, planEmptyGitCandidate } from "../impl/git-candidate-store.ts";
export { createGitRefStore, createGitTrunkStore, createGitDocumentMutationStore, createGitActiveMutationStore, createGitInitialWorkflowMutationStore, readGitActiveCompletionBasis, appendGitActiveCompletionTaskEvent, readGitInitialWorkflowSource, writeGitInitialWorkflowSource, createProjectTrunkStore, migrateLegacyTrunkToGit, readGitInitializationTaskBasis, appendGitInitializationTaskEvent } from "../impl/git-trunk-store.ts";
export { readGitStableCompletionBasis, appendGitStableCompletionTaskEvent } from "../impl/git-trunk-store.ts";
export { readGitPlanCompletionBasis, appendGitPlanCompletionTaskEvent } from "../impl/git-trunk-store.ts";
export { readGitCandidateEvidence, appendGitCandidateTaskEvent } from "../impl/git-trunk-store.ts";
export { readGitDeliveryEvidence, readGitPublishedReadEvidence, appendGitDocumentPreparationTaskEvent } from "../impl/git-trunk-store.ts";
export { planGitRefPublication } from "../impl/git-trunk-store.ts";

export { recordGitHostInventory, beginGitHostAction, endGitHostAction, recordGitHostInterruption, inspectGitHostCoordinator, checkGitHostAction, readGitHostProtectionRequirement } from "../impl/git-command.ts";
