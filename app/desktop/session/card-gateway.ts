// app/desktop/session/card-gateway.ts
// B5（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B5）：卡片通道与固定卡钩子端口（L3，feature 白名单 []）。
// 本文件只定义**端口形状**，不持有状态、不实现业务：
//  · `CardGateway`：cards 簇对外呈现面（presentAppCard / withRequestLifecycle /
//    offerRunChangeOnFrozenContract / reportPlanEscalation）。由门面构造注入，运行期调用；
//    fixed-workflow/lifecycle 等上层模块经此端口发卡，不得导入 cards/**。
//  · `FixedCardHooks`：cards 簇对 fixed-workflow 尚未迁出方法（prepareFixedAppointmentCardRequest /
//    recordFixedCardWorkflowResolution）的回调端口（B5 由门面箭头转发；B6 迁出后改指 fixed-workflow）。
//  · `ControllerStopPort`：run-change 的 stopExactController 端口（tasks/上层模块经端口停止精确控制器）。
// 参数形状全部取自现行方法签名（不新造业务语义）；仅做命名提取。
// 依赖规则：L3 只可导入 L0（contracts/shared）与外部 src/app 类型；不得导入 feature 模块。

import type { CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, PlanEscalationInput, PlanEscalationResult, TaskStateEvent, WorkflowDocumentRef } from "../../../src/model/runtime.ts";
import type { NewerContractDoc, RunManifest } from "../../../src/common/编排/run-manifest.ts";
import type { MechanicalRejection } from "../../../src/common/编排/mechanical-rejection.ts";
import type { WorkflowServiceFailure } from "../../../src/common/编排/workflow-service.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn } from "../customer-input.ts";
import type { ActualDispatchSource } from "./contracts/session-types.ts";
import type { TerminateRoleRunInput, TerminateRoleRunResult } from "./contracts/tasks.ts";

/** 应用自有卡统一呈现入参（原 `presentAppCard` 入参对象的具名形状）。 */
export interface PresentAppCardInput {
  projectRoot: string;
  request: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
  requestId: string;
  signal?: AbortSignal;
}

/** 申请生命周期参数（原 `withRequestLifecycle` 的 `lifecycle` 参数对象）。 */
export interface RequestLifecycleOptions {
  notify?: "default" | "resolved-only" | "none";
  signal?: AbortSignal;
  /** 下载卡事实不可用时附在客户卡上的提示（其他卡种不传）。 */
  judgeNotice?: string;
  /** 卡片实际呈现（客户或 judge）后回调一次（下载 presenter 用它上报 requestId）。 */
  onPresented?: () => void;
}

/** 冻结契约上呈现 run-change 卡的入参（原 `offerRunChangeOnFrozenContract` 入参对象的具名形状）。 */
export interface OfferRunChangeOnFrozenContractInput {
  projectRoot: string;
  flowId: string;
  manifest: RunManifest;
  newer: NewerContractDoc[];
  reason: string;
  /** 三段式 missing 用（「拒绝：缺少 …」通顺的名词短语）；缺省回退 reason。 */
  missing?: string;
  requestedBy?: "convener" | "planner" | "product";
  /** AC-17：系统行落位（来源角色；缺省 chief）。 */
  noteRoleId?: string;
}

/** 卡片通道端口（cards 实现；门面构造注入、运行期调用）。方法签名与现行 SessionManager 方法逐位一致。 */
export interface CardGateway {
  presentAppCard(input: PresentAppCardInput): Promise<CustomerInputOutcome | undefined>;
  withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: RequestLifecycleOptions,
  ): Promise<CustomerInputOutcome | null | undefined>;
  offerRunChangeOnFrozenContract(input: OfferRunChangeOnFrozenContractInput): Promise<{ rejection: MechanicalRejection; presented: boolean }>;
  reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult>;
}

/** 固定卡裁决后工作流阶段事件的入参（原 `recordFixedCardWorkflowResolution` 入参对象的具名形状）。 */
export interface FixedCardResolutionInput {
  projectRoot: string;
  sourceRoleId: string;
  flowId: string;
  workflowId: string;
  requestId: string;
  resolvedEvent: Extract<TaskStateEvent, { kind: "request.resolved" }>;
  answered: boolean;
  judged: boolean;
  documentRefs: readonly WorkflowDocumentRef[];
}

/** fixed-workflow 尚未迁出方法的回调端口（B5 由门面箭头逐位转发；cards 只调用、不实现）。 */
export interface FixedCardHooks {
  prepareFixedAppointmentCardRequest(projectRoot: string, flowId: string, request: CustomerInputRequest): Promise<
    | { ok: true; request: CustomerInputRequest; rosterRef: WorkflowDocumentRef }
    | WorkflowServiceFailure
  >;
  recordFixedCardWorkflowResolution(input: FixedCardResolutionInput): Promise<void>;
}

/** run-change 的精确控制器停止端口（tasks/上层模块可经门面注入使用；参数逐位原样转发）。 */
export interface ControllerStopPort {
  stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult>;
}
