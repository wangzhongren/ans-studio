/**
 * 决策卡（`cardKind="decision"`）卡面映射（2026-10-26）。
 *
 * 客户规则（项目管理 `2026-10-26_design_decision-card.md` §一/§二）：
 * - decision 卡是**材料性选择**，独立于提案/任命/验收，**不是客户批准**；
 * - 卡面固定标题与「非客户批准」标识、唯一推荐项的「推荐」标识走共享 i18n；
 * - 推荐项只是建议，不预选、不替客户选择（本模块只呈现，不参与结算）。
 *
 * 单一判据：只有 `request.cardKind === "decision"` 才产出 decision 卡面；
 * 其它卡种（普通 choice、proposal/appointment/acceptance/intent-confirm/write…）
 * 一律返回空视图——标题/徽标/推荐标识全部不出现（既有卡零变化）。
 * `options[].recommended` 亦只在 decision 卡上展示；非 decision 卡即使带该字段也忽略
 * （与桌面窗口 `evaluateDecisionCardRequest` 的「非 decision 卡忽略 recommended」同口径）。
 *
 * 本模块不做发卡前校验（恰一个推荐项、仅统筹可发、flowId 形状等由主进程 fail-closed）；
 * 也不做第二份 cardKind→分组映射。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";

export interface DecisionCardView {
  /** 是否为 decision 卡（唯一判据：request.cardKind === "decision"）。 */
  decision: boolean;
  /** 可见卡标题：decision 卡固定用共享 i18n；非 decision 为空串（调用方保留既有标题回退）。 */
  title: string;
  /** 「非客户批准」标识：仅 decision 卡非空。 */
  notApprovalBadge: string;
  /** 材料性选择问题：原 request.title（统筹必须写清要决定的问题与影响，不得丢）。 */
  question: string;
  /** 可选补充问句：原 request.question。 */
  questionNote: string;
  /** 「推荐」标识文案：仅 decision 卡非空；具体选项是否显示由 `recommended === true` 决定。 */
  recommendedBadge: string;
}

const NON_DECISION_VIEW: DecisionCardView = Object.freeze({
  decision: false,
  title: "",
  notApprovalBadge: "",
  question: "",
  questionNote: "",
  recommendedBadge: "",
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** decision 卡卡面视图（纯函数；locale 决定三处共享 i18n 文案）。 */
export function decisionCardView(
  request: unknown,
  locale: Locale = DEFAULT_LOCALE,
): DecisionCardView {
  const req = asRecord(request);
  if (req.cardKind !== "decision") return NON_DECISION_VIEW;
  return {
    decision: true,
    title: translate(locale, "ui.decisionCard.title"),
    notApprovalBadge: translate(locale, "ui.decisionCard.notApprovalBadge"),
    question: asString(req.title),
    questionNote: asString(req.question),
    recommendedBadge: translate(locale, "ui.decisionCard.recommended"),
  };
}

/**
 * 单选项的「推荐」标识：仅 decision 卡、且 `option.recommended === true`（严格布尔）
 * 才返回徽标文案；其余一律空串（不猜 truthy、不改选项 id/交互）。
 */
export function decisionOptionBadge(
  view: DecisionCardView,
  option: unknown,
): string {
  if (!view.decision) return "";
  return asRecord(option).recommended === true ? view.recommendedBadge : "";
}
