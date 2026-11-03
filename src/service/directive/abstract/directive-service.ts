// src/service/directive/abstract/directive-service.ts
// 客户指令 Service —— 抽象契约与跨层类型（2026-11-03，客户授权平面 B1）。
//
// 归属：编排（B-3 模块私有根 `src/service/directive/`）。职责（B1 提案 §1.3）：
//   schema 校验、状态机 `created→active→consumed/revoked/expired`、ID `d-<seq>`（回放 max+1）、
//   target 过滤、快照、创建/撤销/消费/失效、高危计算（调用 A1 谓词）、错误语义。
//
// 依赖方向：Model（A1 只读）→ Provider（A2 共享辅助）→ Service。本层不 import Pipeline/Interface。
// 消费者 API 只按 target 返回本 target 的 fact；没有 all-facts 消费者 API（I-2）。

import type {
  ApprovalAction,
  ApprovalDirectiveSnapshot,
  CustomerDirectiveTarget,
  CustomerDirectiveUntil,
  CustomerDirectiveView,
  DecisionAction,
  DecisionDirectiveSnapshot,
  DirectiveScope,
} from "../../../model/directive.ts";
import type { DirectiveStore } from "../../../provider/directive/public/directive-store.ts";

/** 稳定错误码（Pipeline 公共句柄原样 re-export；C1 按 code 映射文案）。 */
export type DirectiveErrorCode =
  | "cancelled"
  | "presenter-unavailable"
  | "invalid-input"
  | "high-risk-unacknowledged"
  | "ledger-write-failed"
  | "ledger-unavailable"
  | "not-found"
  | "target-mismatch"
  | "already-consumed"
  | "already-revoked"
  | "expired";

/** 创建请求：结构化字段来自面板确认后的快照；`rawText` 只入账本，不写诊断/不进模型。 */
export interface DirectiveCreateRequest {
  target: CustomerDirectiveTarget;
  action: ApprovalAction | DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
  rawText: string;
  /** 创建时项目根（`shell.cwd` 必须等于它；只存账本内的 resource.cwd）。 */
  projectRoot: string;
  /** C1 主进程 `decisionJudgeSwitch` 提交当刻快照（Q7 A / P1-CAP-04；必填、无默认）。 */
  decisionGroupEnabled: boolean;
  /** 仅高危指令可给 `true`；主进程复算后未确认即拒绝落账。 */
  acknowledged?: boolean;
}

export type DirectiveCreateResult =
  | { ok: true; id: string; target: CustomerDirectiveTarget }
  | { ok: false; error: DirectiveErrorCode; message?: string };

export type DirectiveMutationResult =
  | { ok: true }
  | { ok: false; error: DirectiveErrorCode; message?: string };

/** `directive.consumed.via`（审计串联；全部可选）。 */
export interface DirectiveConsumeVia {
  requestId?: string;
  toolCallId?: string;
  flowId?: string;
}

/** 面板分组视图（两个 target 各一份；`list` 是 Interface 的唯一跨 target 读点）。 */
export interface DirectiveListView {
  active: CustomerDirectiveView[];
  consumed: CustomerDirectiveView[];
  revoked: CustomerDirectiveView[];
  expired: CustomerDirectiveView[];
}

export interface DirectiveServiceList {
  approval: DirectiveListView;
  decision: DirectiveListView;
  ledgerErrors: number;
}

export interface DirectiveServiceOptions {
  projectRoot: string;
  /** 本次应用运行 id（C1 主进程生成；只写进 created 事件，用于 session/once 失效判定）。 */
  sessionId: string;
  store: DirectiveStore;
  now?: () => Date;
}

export interface DirectiveService {
  /** 幂等加载账本（首次调用触发；重复调用返回同一 promise）。 */
  ready(): Promise<void>;
  /** 加载失败信息（`ledger-unavailable` 时供 Pipeline `list` 返回 ok:false）。 */
  getLoadError(): string | undefined;
  create(input: DirectiveCreateRequest): Promise<DirectiveCreateResult>;
  revoke(id: string, target: CustomerDirectiveTarget): Promise<DirectiveMutationResult>;
  /**
   * 原子消费（`once` 追加 `directive.consumed`；`session`/`forever` 只返回成功、不写账本）。
   * 追加串行链 + 内存 active 复检；durable 失败 ⇒ `ledger-write-failed`。
   */
  consume(id: string, via?: DirectiveConsumeVia): Promise<DirectiveMutationResult>;
  /** 失效（best-effort：追加失败也把内存视图置为 expired；供重启扫描）。 */
  expire(id: string, reason: "app-restart" | "unused-once" | "ttl"): Promise<void>;
  /** 审批消费者快照；`ledgerErrors > 0 ⇒ active=[]`（消费者按无指令处理）。 */
  approvalFacts(): ApprovalDirectiveSnapshot;
  /** 决策消费者快照；同上。 */
  decisionFacts(): DecisionDirectiveSnapshot;
  /** 面板双视图（唯一跨 target 读点；不改账本）。 */
  list(): DirectiveServiceList;
  /** 单条视图（撤销 target/状态判定用；不存在 ⇒ undefined）。 */
  view(id: string): CustomerDirectiveView | undefined;
}
