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
// 桌面只经本公共出口消费；均不注册为角色工具。
export {
  completeAcceptanceStep,
  completeRoleCardsStep,
  observeFlowArtifacts,
  reopenAcceptanceStepForRework,
} from "../../common/编排/flow-service.ts";
export type {
  CompleteRoleCardsEvidence,
  CompleteRoleCardsStepInput,
  CompleteRoleCardsStepResult,
  CompleteRoleCardsValidatedFile,
  ObserveFlowArtifactsResult,
  ReopenAcceptanceStepForReworkInput,
} from "../../common/编排/flow-service.ts";

export type {
  AcceptanceReworkError,
  AcceptanceReworkItem,
  AcceptanceReworkParseResult,
  AcceptanceReworkSection,
} from "../../common/编排/acceptance-rework.ts";

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
} from "../../common/编排/flow-state.ts";
