// app/desktop/plan-escalation.ts
// 2026-11-05：方案升级报告卡（客户主权卡）——convener 经 `report_plan_escalation` 提交，
// 应用发行；客户本人裁决「修订方案/验收要求｜客户提供环境｜继续核查｜终止」。
// 只组装卡面（纯函数，不计算哈希、不判定）；判断器/委托/@决策**永不**代答（选项词汇在
// customer-input 的主权排除表中登记）。

import type { CustomerInputRequest } from "../../src/model/runtime.ts";
import { mainT } from "./i18n.ts";

/** 客户主权选项词汇（与 customer-input 反代选排除表同一冻结词汇）。 */
export const PLAN_ESCALATION_OPTION_IDS = Object.freeze([
  "escalation-revise",
  "escalation-environment",
  "escalation-continue",
  "escalation-stop",
] as const);
export type PlanEscalationOption = (typeof PLAN_ESCALATION_OPTION_IDS)[number];

export type PlanEscalationCategoryView = "scheme" | "environment" | "authority" | "evidence";

export interface PlanEscalationCardInput {
  flowId: string;
  category: PlanEscalationCategoryView;
  summary: string;
}

export interface BuiltPlanEscalationCard {
  request: CustomerInputRequest;
  metadata: { cardKind: "decision"; flowId: string };
}

function boundedPreview(text: string, max = 8_000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 组装方案升级卡（字段缺失/非法 ⇒ 调用方不发卡，fail-closed）。 */
export function buildPlanEscalationCard(input: PlanEscalationCardInput): BuiltPlanEscalationCard | undefined {
  const flowId = input.flowId.trim();
  const summary = input.summary.trim();
  if (flowId === "" || summary === "") return undefined;
  const categoryKey =
    input.category === "environment"
      ? "ui.planEscalation.category.environment"
      : input.category === "authority"
        ? "ui.planEscalation.category.authority"
        : input.category === "evidence"
          ? "ui.planEscalation.category.evidence"
          : "ui.planEscalation.category.scheme";
  const lines = [
    mainT("ui.planEscalation.initiator", { role: "convener" }),
    mainT("ui.planEscalation.flow", { flowId }),
    mainT("ui.planEscalation.categoryLine", { category: mainT(categoryKey) }),
    mainT("ui.planEscalation.summary", { summary }),
    mainT("ui.planEscalation.semantics"),
  ];
  const request: CustomerInputRequest = {
    kind: "choice",
    title: `${mainT("ui.planEscalation.title")} · ${flowId}`,
    preview: boundedPreview(lines.join("\n")),
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId,
    options: [
      { id: "escalation-revise", label: mainT("ui.planEscalation.option.revise") },
      { id: "escalation-environment", label: mainT("ui.planEscalation.option.environment") },
      { id: "escalation-continue", label: mainT("ui.planEscalation.option.continue"), recommended: true },
      { id: "escalation-stop", label: mainT("ui.planEscalation.option.stop") },
    ],
  };
  return { request, metadata: { cardKind: "decision", flowId } };
}
