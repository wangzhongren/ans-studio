// app/renderer/src/chat/card-meta.ts
// D 批（2026-10-28）：客户卡元信息（来源/权力/路径）——不再投影 flow/gate/ledger/acceptance 视图。
import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import type { MessageKey } from "../../../../src/common/shared/i18n/keys.ts";

export interface GovernanceCardMeta {
  governance: boolean;
  badge: string;
  power: string;
  flowId: string;
  stepId: string;
  lines: string[];
}

const POWER_KEYS: Record<string, MessageKey> = {
  proposal: "ui.governance.power.proposal",
  appointment: "ui.governance.power.appointment",
  acceptance: "ui.governance.power.acceptance",
  "intent-confirm": "ui.governance.power.intentConfirm",
  "appointment-write": "ui.governance.power.appointmentWrite",
};

export function governanceCardMetaView(request: unknown, locale: Locale = DEFAULT_LOCALE): GovernanceCardMeta {
  const req = request && typeof request === "object" ? (request as Record<string, unknown>) : {};
  const cardKind = typeof req.cardKind === "string" ? req.cardKind : "";
  const powerKey = POWER_KEYS[cardKind];
  const power = powerKey === undefined ? "" : translate(locale, powerKey);
  const lines: string[] = [];
  if (power !== "") lines.push(translate(locale, "ui.governance.decisionLine.power", { power }));
  const paths = Array.isArray(req.paths) ? req.paths.filter((path): path is string => typeof path === "string" && path !== "") : [];
  for (const path of paths) lines.push(translate(locale, "ui.governance.decisionLine.writePath", { path }));
  if (typeof req.summary === "string" && req.summary !== "") {
    lines.push(translate(locale, "ui.governance.decisionLine.summary", { summary: req.summary }));
  }
  return { governance: power !== "", badge: power, power, flowId: "", stepId: "", lines };
}

/** D 批：镜像面已删除；保留渲染兼容文案（正常不会出现）。 */
export function governanceMirrorBadge(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.mirrorBadge");
}

export function governanceMirrorSourceLabel(source: string, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.mirrorSource", { source });
}

/** 排队提示（不作答、不代答）。 */
export function governanceQueueNote(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.governance.queueNote");
}
