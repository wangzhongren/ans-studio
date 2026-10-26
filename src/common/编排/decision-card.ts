// src/common/编排/decision-card.ts
// decision 卡（`request_choice(cardKind="decision")`）的**结构校验单一共享实现**（2026-10-26）。
//
// 客户规则（经主控任务转达；PM 设计登记 `2026-10-26_design_decision-card.md`，rules-only）：
//   · 材料性选择由主理交统筹（Steward/Convener）发 `request_choice(cardKind="decision")`；
//   · 卡内**恰有一个** `recommended: true` 推荐项；「替我决策」开启时默认选推荐项；
//   · decision 卡独立于提案/任命/验收：不是客户批准、不触发 gate/验收。
//
// 本模块是「卡是否可发」的唯一确定性校验（纯函数：不读盘、不写盘、不调用模型）：
//   · 编排 `run-role.ts::governedInput` 在触达 raw 客户通道**之前**调用——覆盖 CLI、single su 与
//     项目角色（它们没有桌面卡校验）；
//   · 桌面窗口经 Pipeline 公共出口（`src/pipeline/orchestration/run-role.ts` 再导出）复用同一函数，
//     不复制第二份。
//
// 失败一律由调用方 fail-closed（`declined + notPresented:true`：卡片从未呈现，不写账本）。

import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type { CustomerInputMetadata, CustomerInputRequest } from "../../model/runtime.ts";

/** decision 卡最少选项数（0/1 个选项无法构成材料性选择）。 */
export const DECISION_CARD_MIN_OPTIONS = 2;

/** 校验失败原因（机器码；文案由调用方按自己的 i18n/面向对象拼）。 */
export type DecisionCardRejectReason =
  | "role-not-allowed"
  | "not-choice"
  | "missing-flow-id"
  | "not-enough-options"
  | "invalid-option-id"
  | "duplicate-option-id"
  | "recommended-count";

/** 校验结果：`applicable:false` = 本请求不是 decision 卡（调用方按原逻辑处理）。 */
export type DecisionCardValidation =
  | {
      ok: true;
      applicable: boolean;
      flowId?: string;
      recommendedOptionId?: string;
    }
  | {
      ok: false;
      reasonCode: DecisionCardRejectReason;
      /** 有界的机器细节（如 `recommended=2` / `duplicate option id: x`），不是用户文案。 */
      detail: string;
    };

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 校验一张 decision 卡是否允许发送给客户（**确定性**；同输入 ⇒ 同结果）。
 *
 * 规则（顺序即拒绝原因优先级）：
 *   1. 卡种解析 `request.cardKind ?? metadata.cardKind`；不是 `"decision"` ⇒ `applicable:false`（通过，
 *      调用方按原卡种逻辑处理）；
 *   2. **仅 trio 统筹（convener）**可发（single/su、项目角色、其他内置治理角色一律拒）；
 *   3. 必须是 `request_choice`（choice）卡；
 *   4. `flowId`（request 或 metadata）必须存在且为合法 slug（decision 选择要按 flow 审计/定位）；
 *   5. 至少 `DECISION_CARD_MIN_OPTIONS` 个选项；
 *   6. 每个选项 id 必须是非空字符串，且**不重复**；
 *   7. **恰好一个** `recommended === true`（0 个/多个都拒；判断/桌面都不得伪造推荐项）。
 *
 * 通过 ⇒ `{ ok:true, applicable:true, flowId, recommendedOptionId }`（推荐项 id 供调用方/桌面显示；
 * 本函数不代选、不补默认值）。
 */
export function validateDecisionCardRequest(input: {
  request: CustomerInputRequest;
  roleId: string;
  /** 会话治理模型：只有 `trio` 的 convener 可发 decision 卡。 */
  governanceModel: "single" | "trio";
  metadata?: Pick<CustomerInputMetadata, "cardKind" | "flowId">;
}): DecisionCardValidation {
  const { request, roleId } = input;
  const rawCardKind = (request as { cardKind?: unknown }).cardKind ?? input.metadata?.cardKind;
  const cardKind = typeof rawCardKind === "string" ? rawCardKind : undefined;
  if (cardKind !== "decision") return { ok: true, applicable: false };

  if (input.governanceModel !== "trio" || roleId !== "convener") {
    return {
      ok: false,
      reasonCode: "role-not-allowed",
      detail: `role=${roleId === "" ? "unknown" : roleId}`,
    };
  }
  if (request.kind !== "choice") {
    return { ok: false, reasonCode: "not-choice", detail: "not a choice card" };
  }
  const flowId = (request as { flowId?: unknown }).flowId ?? input.metadata?.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, reasonCode: "missing-flow-id", detail: "flowId missing or invalid" };
  }
  const rawOptions = (request as { options?: unknown }).options;
  if (!Array.isArray(rawOptions) || rawOptions.length < DECISION_CARD_MIN_OPTIONS) {
    return {
      ok: false,
      reasonCode: "not-enough-options",
      detail: `options<${DECISION_CARD_MIN_OPTIONS}`,
    };
  }

  const seen = new Set<string>();
  const recommendedIds: string[] = [];
  for (const rawOption of rawOptions) {
    const id = isRecord(rawOption) ? rawOption["id"] : undefined;
    if (typeof id !== "string" || id.trim() === "") {
      return { ok: false, reasonCode: "invalid-option-id", detail: "option id missing" };
    }
    if (seen.has(id)) {
      return { ok: false, reasonCode: "duplicate-option-id", detail: `duplicate option id: ${id}` };
    }
    seen.add(id);
    if (isRecord(rawOption) && rawOption["recommended"] === true) recommendedIds.push(id);
  }
  if (recommendedIds.length !== 1) {
    return {
      ok: false,
      reasonCode: "recommended-count",
      detail: `recommended=${recommendedIds.length}`,
    };
  }
  return { ok: true, applicable: true, flowId, recommendedOptionId: recommendedIds[0]! };
}
