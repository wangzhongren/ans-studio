// src/pipeline/orchestration/flow-state.ts
// Flow YAML 契约的**公开出口**（编排私有 common → Pipeline 薄再导出）。
//
// 分层纪律：桌面不直接 import `src/common/编排/**`（其他角色私有 common），只经本文件消费。
// 单一实现仍在 `src/common/编排/flow-state.ts`；本文件不复制逻辑、不做二次判定。

export {
  parseFlowStateYaml,
  evaluateFlowCompletion,
  flowCompletionIssue,
  validateFlowEvidence,
  flowStatePath,
  isReservedAcceptanceStepId,
  latestAcceptanceDecision,
  listReadyFlowSteps,
  FLOW_QUALITY_TIERS,
  FLOW_STEP_KINDS,
  FLOW_STEP_STATUSES,
  FLOW_EVIDENCE_KINDS,
  RESERVED_ACCEPTANCE_STEP_IDS,
} from "../../common/编排/flow-state.ts";

// 2026-10-23 验收返工路由（方案 v1 / Q2 A）：报告 fenced YAML `acceptance-rework/v1` 解析。
// 纯函数（无 IO）；桌面只经本公共出口消费，不直接 import 编排私有模块。
export {
  parseAcceptanceReworkReport,
  ACCEPTANCE_REWORK_SCHEMA,
  ACCEPTANCE_REWORK_MAX_ITEMS,
  ACCEPTANCE_REWORK_MAX_BLOCK_BYTES,
  ACCEPTANCE_REWORK_ITEM_ID_PATTERN,
  ACCEPTANCE_REWORK_MAX_ACTION_LENGTH,
  ACCEPTANCE_REWORK_MAX_EVIDENCE_ITEMS,
  ACCEPTANCE_REWORK_MAX_EVIDENCE_LENGTH,
  ACCEPTANCE_REWORK_MAX_OWNER_LENGTH,
} from "../../common/编排/acceptance-rework.ts";

// 2026-10-20 应用专用：客户验收 accepted 后把 flow YAML 的保留验收步骤置 done。
// 2026-10-23 应用专用：结构校验通过后把 flow YAML 的 `role-cards` 步骤置 done。
// 2026-10-23 应用专用：返工前把保留验收步骤从 dispatched/delivered 安全重开为 pending。
// 2026-10-24 应用专用：账本客户决定已结算后把 `kind:customer-decision` 步骤置 done（appointment 收口）。
// 2026-10-25 应用专用：验收标准工件就绪后把 `acceptance-criteria` 步骤置 done（应用验收门前置）。
// 桌面只经本公共出口消费；均不注册为角色工具。
export {
  completeAcceptanceCriteriaStep,
  completeAcceptanceStep,
  completeCustomerDecisionStep,
  completeRoleCardsStep,
  observeFlowArtifacts,
  reopenAcceptanceStepForRework,
} from "../../common/编排/flow-service.ts";
export type {
  CompleteAcceptanceCriteriaStepInput,
  CompleteAcceptanceCriteriaStepResult,
  CompleteCustomerDecisionStepInput,
  CompleteRoleCardsEvidence,
  CompleteRoleCardsStepInput,
  CompleteRoleCardsStepResult,
  CompleteRoleCardsValidatedFile,
  ObserveFlowArtifactsResult,
  ReopenAcceptanceStepForReworkInput,
  /** 2026-10-24 P0-1：flow 回执视图携带 `release`（缺省 false）；桌面只经本公共出口消费。 */
  FlowToolViewWithRelease,
  /** 2026-10-24 P0-1：受控扩展（release 标记）校验结果。 */
  ReleaseExtensionValidation,
} from "../../common/编排/flow-service.ts";

export type {
  AcceptanceReworkError,
  AcceptanceReworkItem,
  AcceptanceReworkParseResult,
  AcceptanceReworkSection,
} from "../../common/编排/acceptance-rework.ts";

// 2026-10-25 验收分诊（设计 `2026-10-25_design_acceptance-triage.md` §4/§5/§8.1/§9.1）：
// 报告 fenced YAML `acceptance-triage/v1` 解析、§5.1 R1–R7 默认建议、triage→rework 映射、
// `.ans/governance/acceptance/<flowId>/triage-v1.json` 分诊记录读写（原子写 / 幂等 / 恢复）。
// 解析与建议是纯函数；记录读写只碰 `.ans`（app-only 写域）。桌面只经本公共出口消费。
export {
  parseAcceptanceTriageReport,
  recommendAcceptanceTriage,
  isBlockingAcceptanceTriageSeverity,
  acceptanceTriageItemHasReworkPointers,
  acceptanceTriageToReworkItems,
  ACCEPTANCE_TRIAGE_SCHEMA,
  ACCEPTANCE_TRIAGE_MAX_ITEMS,
  ACCEPTANCE_TRIAGE_MAX_BLOCK_BYTES,
  ACCEPTANCE_TRIAGE_ITEM_ID_PATTERN,
  ACCEPTANCE_TRIAGE_MAX_REASON_LENGTH,
  ACCEPTANCE_TRIAGE_MAX_ACTION_LENGTH,
  ACCEPTANCE_TRIAGE_MAX_OWNER_LENGTH,
  ACCEPTANCE_TRIAGE_MAX_POINTER_ITEMS,
  ACCEPTANCE_TRIAGE_MAX_POINTER_LENGTH,
  ACCEPTANCE_TRIAGE_CONCLUSIONS,
  ACCEPTANCE_TRIAGE_SEVERITIES,
} from "../../common/编排/acceptance-triage.ts";
export type {
  AcceptanceTriageConclusion,
  AcceptanceTriageSeverity,
  AcceptanceTriageError,
  AcceptanceTriageItem,
  AcceptanceTriageSection,
  AcceptanceTriageParseFailureCode,
  AcceptanceTriageParseResult,
  AcceptanceTriageDisposition,
  AcceptanceTriageRecommendationBasis,
  AcceptanceTriageItemExecutability,
  AcceptanceTriageExecutabilityCheck,
  AcceptanceTriageRecommendation,
  AcceptanceTriageRecommendOptions,
  AcceptanceTriageReworkItem,
} from "../../common/编排/acceptance-triage.ts";

export {
  ACCEPTANCE_TRIAGE_RECORD_SCHEMA,
  ACCEPTANCE_TRIAGE_RECORD_REL_DIR,
  ACCEPTANCE_TRIAGE_RECORD_FILENAME,
  ACCEPTANCE_TRIAGE_RECORD_STATUSES,
  acceptanceTriageRecordRelPath,
  acceptanceTriageRecordAbsPath,
  acceptanceTriageIdempotencyKey,
  acceptanceTriageIdForReport,
  acceptanceTriageRecordMatchesReport,
  acceptanceTriageSeverityCounts,
  acceptanceTriageItemsDigest,
  buildAcceptanceTriageRecord,
  validateAcceptanceTriageRecord,
  isAcceptanceTriageStatusTransitionAllowed,
  readAcceptanceTriageRecord,
  writeAcceptanceTriageRecord,
} from "../../common/编排/acceptance-triage-record.ts";
export type {
  AcceptanceTriageRecordStatus,
  AcceptanceTriageDecisionSource,
  AcceptanceTriageRecordDisposition,
  AcceptanceTriageRecord,
  AcceptanceTriageRecordReadResult,
  AcceptanceTriageRecordReadOptions,
  AcceptanceTriageRecordWriteOptions,
  AcceptanceTriageRecordWriteResult,
  AcceptanceTriageRecordValidation,
  AcceptanceTriageRecordInput,
} from "../../common/编排/acceptance-triage-record.ts";

export type {
  FlowState,
  FlowStateStep,
  FlowStepEvidence,
  FlowStepKind,
  FlowStepStatus,
  FlowEvidenceKind,
  FlowQualityTier,
  FlowStateError,
  FlowEvidenceIssue,
  FlowLedgerInput,
  ParseFlowStateResult,
  ValidateFlowEvidenceResult,
  EvaluateFlowCompletionResult,
  EvaluateFlowCompletionOptions,
  LatestAcceptanceDecision,
  /** 2026-10-24 P0-2：就绪步骤纯规划器（桌面只经本公共出口消费）。 */
  ReadyFlowDispatchedStepIds,
  ReadyFlowStep,
  SkippedFlowStep,
  ReadyFlowStopReason,
  ListReadyFlowStepsResult,
} from "../../common/编排/flow-state.ts";
