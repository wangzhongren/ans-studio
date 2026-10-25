/**
 * 工作概览 / 角色角标纯逻辑（Phase 4A）：待处理计数与定位项、
 * 队列分组（进行中 / 第 N 位）、最近回交去重与排序、tab 角标。
 *
 * 唯一数据源：主进程 role-state 快照与当前 pane 的真实行；本模块不造第二套状态。
 *
 * i18n B1：展示文案来自 shared 目录（`ui.work.*` 等），纯函数接受可选 `locale`
 * （默认 zh-CN）；`roleId`/自定义分组名/报告正文等数据不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";
import { queueItemViews, type QueueItemView } from "./confirm-logic.ts";
import { operatorSurfaces } from "./operator-view.ts";
import type { ChatRow } from "./types.ts";

export interface PendingRequestView {
  id: string;
  /** choice ⇒ 待选择；其余（confirm）⇒ 待确认（按当前 locale 渲染的展示文案）。 */
  kindLabel: string;
  title: string;
  requestId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 该角色未作答的交互请求（按到达序；源面与镜像面都计入同一请求）。 */
export function pendingViews(
  pendingOperator: Record<string, Record<string, unknown>>,
  roleId: string | null,
  locale: Locale = DEFAULT_LOCALE,
): PendingRequestView[] {
  if (!roleId) return [];
  const views: PendingRequestView[] = [];
  for (const [id, payload] of Object.entries(pendingOperator)) {
    if (operatorSurfaces(payload).indexOf(roleId) < 0) continue;
    const request = asRecord(payload.request);
    const kind = asString(request.kind);
    views.push({
      id,
      kindLabel: translate(
        locale,
        kind === "choice" ? "ui.work.kind.choice" : "ui.work.kind.confirm",
      ),
      title: asString(request.title) || translate(locale, "ui.work.requestFallback"),
      requestId: id,
    });
  }
  return views;
}

export function pendingCountFor(
  pendingOperator: Record<string, Record<string, unknown>>,
  roleId: string | null,
): number {
  return pendingViews(pendingOperator, roleId).length;
}

export interface QueueGroups {
  running: QueueItemView[];
  queued: QueueItemView[];
  total: number;
}

/** 队列快照 → 进行中 + 排队 1..N（复用 3B 的纯映射，单一来源）。 */
export function queueGroups(
  queue: readonly Record<string, unknown>[] | null | undefined,
  running: Record<string, unknown> | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): QueueGroups {
  const views = queueItemViews(queue || [], running || null, locale);
  return {
    running: views.filter((view) => view.running),
    queued: views.filter((view) => !view.running),
    total: views.length,
  };
}

/** 工作概览角标 = 待确认/待选择数（PM §12.3 第 1 条）。 */
export function workBadgeCount(pendingCount: number): number {
  return Math.max(0, Math.floor(Number(pendingCount) || 0));
}

/** 工作概览四节是否全空（待处理/队列/最近交付）；全空时只显示一张总空态卡。 */
export function isWorkOverviewEmpty(
  pendingCount: number,
  queueTotal: number,
  reportCount: number,
): boolean {
  return (
    Math.max(0, Math.floor(Number(pendingCount) || 0)) === 0 &&
    Math.max(0, Math.floor(Number(queueTotal) || 0)) === 0 &&
    Math.max(0, Math.floor(Number(reportCount) || 0)) === 0
  );
}

/** 角色角标 = 当前工作（busy=1）+ 排队数。 */
export function roleBadgeCount(busy: boolean, queueLength: number): number {
  return (busy ? 1 : 0) + Math.max(0, Math.floor(Number(queueLength) || 0));
}

export function badgeText(count: number): string {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  return value > 99 ? "99+" : String(value);
}

export function queueTimeText(at: unknown): string {
  if (typeof at !== "string" || at === "") return "";
  const value = new Date(at);
  return Number.isNaN(value.getTime()) ? "" : value.toLocaleTimeString();
}

export interface RecentHandbackView {
  key: string;
  declaration: string;
  summary: string;
  flags: string;
  order: number;
}

const REPORT_STATUS_KEYS: Record<string, MessageKey> = {
  completed: "shared.common.completed",
  blocked: "ui.work.reportStatus.blocked",
  unreported: "shared.common.notReported",
  failed: "shared.common.failed",
  aborted: "shared.common.aborted",
};

/** 旧 `reportDeclaration` 逐字基线：来源 + 状态，不把报告声明说成独立验收。 */
export function reportDeclaration(
  report: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const record = asRecord(report);
  const status = asString(record.status);
  const originKey: MessageKey =
    record.origin === "submitted-report"
      ? "ui.work.origin.report"
      : record.origin === "terminal-fallback"
        ? "ui.work.origin.system"
        : "ui.work.origin.unconfirmed";
  const statusKey = REPORT_STATUS_KEYS[status] ?? "shared.common.unknownStatus";
  return translate(locale, originKey) + translate(locale, statusKey);
}

function reportSummaryText(report: unknown): string {
  const summary = asRecord(asRecord(report).summary);
  return asString(summary.text);
}

function reportFlags(report: unknown, locale: Locale): string {
  const summary = asRecord(asRecord(report).summary);
  return [
    summary.redacted ? translate(locale, "shared.common.redacted") : "",
    summary.truncated ? translate(locale, "shared.common.truncated") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function reportIdentity(report: unknown, index: number): string {
  const record = asRecord(report);
  const reportId = asString(record.reportId);
  if (reportId) {
    const source = asRecord(record.source);
    return JSON.stringify([
      asString(source.roleId),
      asString(source.runtime),
      reportId,
    ]);
  }
  const source = asRecord(record.source);
  const turnId = asString(source.turnId);
  return JSON.stringify(["live", asString(source.roleId), turnId, index]);
}

/**
 * 最近回交：当前 pane 的真实 handback 行 + 交付批内的真实结构化报告；
 * 同 reportId+来源身份只列一次；保持行序（旧 `currentWorkReports` 同向）。
 */
export function recentHandbacks(
  rows: readonly ChatRow[] | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): RecentHandbackView[] {
  const views: RecentHandbackView[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (report: unknown): void => {
    if (!report || typeof report !== "object") return;
    const key = reportIdentity(report, order);
    if (seen.has(key)) return;
    seen.add(key);
    views.push({
      key,
      declaration: reportDeclaration(report, locale),
      summary: Array.from(reportSummaryText(report)).slice(0, 120).join(""),
      flags: reportFlags(report, locale),
      order,
    });
    order += 1;
  };
  for (const row of rows || []) {
    const data = asRecord(row.data);
    if (row.kind === "handback") {
      push(data.report);
      continue;
    }
    if (row.kind === "delivery") {
      const provenance = asRecord(data.provenance);
      const presentation = asRecord(data.presentation);
      const identity = Object.keys(provenance).length > 0 ? provenance : presentation;
      for (const report of Array.isArray(identity.reports) ? identity.reports : []) {
        push(report);
      }
    }
  }
  return views;
}

export function workEmptyPending(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.work.emptyPending");
}

export function queueEmptyText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.work.emptyQueue");
}

export function recentReportsEmpty(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.work.emptyReports");
}

export function workTitle(roleName: string, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.work.title", {
    roleName: roleName || translate(locale, "shared.common.role"),
  });
}

export function profileTitle(roleName: string, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.profile.title", {
    roleName: roleName || translate(locale, "shared.common.role"),
  });
}

export function queueTitle(roleName: string, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.queue.title", {
    roleName: roleName || translate(locale, "shared.common.role"),
  });
}

export function workBadgeAria(count: number, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.work.overviewAria", { count: badgeText(count) });
}

export function roleBadgeAria(count: number, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.profile.aria", { count: badgeText(count) });
}
