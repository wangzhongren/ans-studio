/**
 * 工作概览 / 角色角标纯逻辑（Phase 4A）：待处理计数与定位项、
 * 队列分组（进行中 / 第 N 位）、最近回交去重与排序、tab 角标。
 *
 * 唯一数据源：主进程 role-state 快照与当前 pane 的真实行；本模块不造第二套状态。
 */

import { queueItemViews, type QueueItemView } from "./confirm-logic.ts";
import { operatorSurfaces } from "./operator-view.ts";
import type { ChatRow } from "./types.ts";

export interface PendingRequestView {
  id: string;
  /** `choice` ⇒ 待选择；其余（confirm）⇒ 待确认。 */
  kindLabel: "待选择" | "待确认";
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
): PendingRequestView[] {
  if (!roleId) return [];
  const views: PendingRequestView[] = [];
  for (const [id, payload] of Object.entries(pendingOperator)) {
    if (operatorSurfaces(payload).indexOf(roleId) < 0) continue;
    const request = asRecord(payload.request);
    const kind = asString(request.kind);
    views.push({
      id,
      kindLabel: kind === "choice" ? "待选择" : "待确认",
      title: asString(request.title) || "交互请求",
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
): QueueGroups {
  const views = queueItemViews(queue || [], running || null);
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

const REPORT_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  blocked: "被拦下",
  unreported: "未报告",
  failed: "失败",
  aborted: "已中止",
};

/** 旧 `reportDeclaration` 逐字基线：来源 + 状态，不把报告声明说成独立验收。 */
export function reportDeclaration(report: unknown): string {
  const record = asRecord(report);
  const status = asString(record.status);
  const origin =
    record.origin === "submitted-report"
      ? "报告声明："
      : record.origin === "terminal-fallback"
        ? "系统按终态记录："
        : "来源未确认：";
  return origin + (REPORT_STATUS_LABELS[status] || "未知状态");
}

function reportSummaryText(report: unknown): string {
  const summary = asRecord(asRecord(report).summary);
  return asString(summary.text);
}

function reportFlags(report: unknown): string {
  const summary = asRecord(asRecord(report).summary);
  return [summary.redacted ? "已净化" : "", summary.truncated ? "已截断" : ""]
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
export function recentHandbacks(rows: readonly ChatRow[] | null | undefined): RecentHandbackView[] {
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
      declaration: reportDeclaration(report),
      summary: Array.from(reportSummaryText(report)).slice(0, 120).join(""),
      flags: reportFlags(report),
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

export const WORK_EMPTY_PENDING = "无待处理请求";
export const QUEUE_EMPTY_TEXT = "无进行中或排队消息";
export const RECENT_REPORTS_EMPTY = "暂无回交报告";
export const WORK_TITLE_SUFFIX = " · 工作概览";
export const PROFILE_TITLE_SUFFIX = " · 角色资料";
export const QUEUE_TITLE_SUFFIX = " · 队列";

export function workTitle(roleName: string): string {
  return (roleName || "角色") + WORK_TITLE_SUFFIX;
}

export function profileTitle(roleName: string): string {
  return (roleName || "角色") + PROFILE_TITLE_SUFFIX;
}

export function queueTitle(roleName: string): string {
  return (roleName || "角色") + QUEUE_TITLE_SUFFIX;
}

export function workBadgeAria(count: number): string {
  return "工作概览，" + badgeText(count) + " 项待处理";
}

export function roleBadgeAria(count: number): string {
  return "角色资料，" + badgeText(count) + " 项进行中或排队";
}
