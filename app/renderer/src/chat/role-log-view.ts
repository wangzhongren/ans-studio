/**
 * 角色运行日志视图（E 批）：日志状态徽标 / 最后活动 / 视图文本的纯逻辑。
 *
 * 只按已给事实计算：busy、pending 决策数、最后日志时间。阈值与文案不读文件。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";

export type RoleLogStatus = "normal" | "slow" | "stuck" | "waiting";

export interface RoleLogFacts {
  busy: boolean;
  pending: number;
  lastActivityAt?: string | null;
  now?: number;
  slowMs?: number;
  stuckMs?: number;
}

export interface RoleLogBadgeView {
  status: RoleLogStatus;
  label: string;
  className: string;
  lastActivityText: string;
}

export const ROLE_LOG_SLOW_MS = 5 * 60 * 1000;
export const ROLE_LOG_STUCK_MS = 10 * 60 * 1000;

function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function roleLogStatus(facts: RoleLogFacts): RoleLogStatus {
  if (facts.pending > 0) return "waiting";
  if (!facts.busy) return "normal";
  const last = parseTime(facts.lastActivityAt);
  if (last === null) return "normal";
  const age = (facts.now ?? Date.now()) - last;
  if (age >= (facts.stuckMs ?? ROLE_LOG_STUCK_MS)) return "stuck";
  if (age >= (facts.slowMs ?? ROLE_LOG_SLOW_MS)) return "slow";
  return "normal";
}

export function roleLogBadgeView(facts: RoleLogFacts, locale: Locale = DEFAULT_LOCALE): RoleLogBadgeView {
  const status = roleLogStatus(facts);
  return {
    status,
    label: translate(locale, `ui.roleLog.status.${status}` as never),
    className: "role-log-badge is-" + status,
    lastActivityText: facts.lastActivityAt ?? "",
  };
}

/** 从运行日志文本里取最后一个 ISO 时间（没有则空串；只用于展示，不重算状态）。 */
export function lastLogTimeFromText(text: string): string {
  const matches = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g);
  return matches !== null && matches.length > 0 ? matches[matches.length - 1]! : "";
}

export function lastLogActionFromText(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.length > 0 ? lines[lines.length - 1]!.trim() : "";
}
