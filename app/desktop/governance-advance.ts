// app/desktop/governance-advance.ts
// D 批（2026-10-28）：旧治理阶段流转 / gate 派发 / 团队计划 / 验收返工路由 / 自动提醒已撤除。
// 本模块仅保留**兼容导出**（旧调用方/旧测试编译与死代码路径），不参与任何自动推进、派发或裁决。
// 任务/报告文案的保留项在 session.ts / handoff.ts；本文件不再产生可执行治理动作。

export type GovernanceRiskTier = "T0" | "T1" | "T2" | "T3";
export type GovernanceNextStepPayload = any;
export type GovernanceNextStepContext = any;
export type GovernanceAdvanceResult = { ok: boolean; dispatched: boolean; targetRoleId?: string; error?: string; [key: string]: unknown };
export type AcceptanceReworkBlockedItem = any;
export type AcceptanceReworkTaskItem = any;
export type GateHandoffDeliveryOutcome = any;
export type GateReminderCause = any;
export type GateReportCorrectionCause = any;
export type GateReportCorrectionError = any;
export type GateReturnCause = any;

export function deriveGovernanceNextStep(..._args: any[]): { nextFunction: null; roleId: null } {
  // D 批：应用不选下一角色、不推进阶段、不自动派发。
  return { nextFunction: null, roleId: null };
}

export function isMirroredGovernanceCard(_cardKind?: unknown): boolean {
  return false;
}

export function buildIntentHandoffMessage(_payload?: unknown): string {
  return "";
}

const empty = (): string => "";
export const acceptanceDispatchRecorded = (..._args: any[]): boolean => false;
export const acceptanceLastDispatchAtMs = (..._args: any[]): number | undefined => undefined;
export const buildAcceptanceCriteriaReportReminderMessage = empty;
export const buildAcceptanceCriteriaTaskMessage = empty;
export const buildAcceptanceReworkTaskMessage = empty;
export const buildAcceptanceTaskMessage = empty;
export const buildAcceptanceTriageCardLines = (): string[] => [];
export const buildAcceptanceTriageReportText = empty;
export const buildFlowStallTaskMessage = empty;
export const buildGatePassHandoffTaskMessage = empty;
export const buildGateReportCorrectionTaskMessage = empty;
export const buildGateReportReminderTaskMessage = empty;
export const buildGateReturnConvenerTaskMessage = empty;
export const buildGateReviewTaskMessage = empty;
export const buildGovernanceAdvanceMessage = empty;
export const buildGovernanceCoordinationTaskMessage = empty;
export const buildNominationAlreadyDoneMessage = empty;
export const buildRoleReadinessTaskMessage = empty;
export const flowCompletionIssue = (): string | undefined => undefined;
export const governanceAcceptanceAdvanceNote = empty;
export const governanceAcceptanceBlockedNote = empty;
export const governanceAcceptanceCriteriaNote = empty;
export const governanceAcceptanceCriteriaPath = (flowId = "task"): string => `docs/quality/${flowId}-criteria.md`;
export const governanceAcceptanceReworkAuditFailedNote = empty;
export const governanceAcceptanceReworkFailedNote = empty;
export const governanceAcceptanceReworkPendingNote = empty;
export const governanceAcceptanceReworkReportIncompleteNote = empty;
export const governanceAcceptanceReworkRoutedNote = empty;
export const governanceAcceptanceReportPath = (flowId = "task", version = 1): string => `docs/quality/${flowId}-report-v${version}.md`;
export const governanceAcceptanceTriageMissingReportNote = empty;
export const governanceAcceptanceTriageReturnedNote = empty;
export const governanceAdvanceSuccessNote = empty;
export const governanceChangePackagePath = (flowId = "task"): string => `docs/scheduling/${flowId}-change.md`;
export const governanceFlowPath = (flowId = "task"): string => `docs/scheduling/${flowId}.md`;
export const governanceFlowStatePath = (flowId = "task"): string => `docs/scheduling/${flowId}.md`;
export const governanceGateReviewReportPath = (flowId = "task"): string => `docs/quality/${flowId}-review.md`;
export const governanceNominationAlreadyDoneNote = empty;
export const governanceNominationFollowUpNote = empty;
export const governanceReadinessNote = empty;
export const governanceTeamPlanPath = (flowId = "task"): string => `docs/scheduling/${flowId}-plan.md`;
