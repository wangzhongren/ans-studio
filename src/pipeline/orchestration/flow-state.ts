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
  FLOW_QUALITY_TIERS,
  FLOW_STEP_KINDS,
  FLOW_STEP_STATUSES,
  FLOW_EVIDENCE_KINDS,
  RESERVED_ACCEPTANCE_STEP_IDS,
} from "../../common/编排/flow-state.ts";

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
} from "../../common/编排/flow-state.ts";
