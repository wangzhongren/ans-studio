/**
 * 角色工作态视图（纯函数 + 无 JSX 的 chip 组件）。
 *
 * 侧栏 RoleRow 与 ChatHeader 共用同一套“工作中”语义：busy 或队列待办 ⇒ working，
 * 等待确认 ⇒ awaiting（行强调但不是“工作中”文案）。颜色只用 index.css 令牌。
 */

import { createElement, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "../i18n/index.ts";
import { deriveRoleStatus, statusBadge, type RoleFacts, type RoleStatus } from "./status.ts";

export interface WorkingRolesSummary {
  ids: string[];
  count: number;
  queued: number;
}

/** 多角色工作态汇总：busy 或队列非空的角色都算（去重）。 */
export function workingRolesSummary(
  roleBusy: Record<string, boolean> | null | undefined,
  queueByRole: Record<string, readonly unknown[]> | null | undefined,
): WorkingRolesSummary {
  const ids = new Set<string>();
  let queued = 0;
  for (const [roleId, busy] of Object.entries(roleBusy || {})) {
    if (busy === true) ids.add(roleId);
  }
  for (const [roleId, queue] of Object.entries(queueByRole || {})) {
    if (Array.isArray(queue) && queue.length > 0) {
      ids.add(roleId);
      queued += queue.length;
    }
  }
  return { ids: [...ids], count: ids.size, queued };
}

export interface RoleStatusChipView {
  status: RoleStatus;
  working: boolean;
  awaiting: boolean;
  highlighted: boolean;
  /** 行级强调类（左侧工作态绿色条/轻微背景）。 */
  rowClass: string;
  /** 头像工作态类。 */
  avatarClass: string;
  /** 状态 chip 的完整 className。 */
  chipClass: string;
  dot: boolean;
  label: string;
  title: string;
}

/** 侧栏角色行状态视图；working 用 chip + 绿色强调，awaiting 只做琥珀行强调。 */
export function roleStatusChipView(
  status: RoleStatus,
  locale: Locale = DEFAULT_LOCALE,
  labelOverride = "",
): RoleStatusChipView {
  const badge = statusBadge(status, 0, locale);
  const working = status === "working";
  const awaiting = status === "awaiting-confirm";
  return {
    status,
    working,
    awaiting,
    highlighted: working || awaiting,
    rowClass: working ? "is-working" : awaiting ? "is-awaiting" : "",
    avatarClass: working ? "is-working" : awaiting ? "is-awaiting" : "",
    chipClass:
      "ti-status " +
      badge.className +
      (working ? " role-status-chip is-working" : ""),
    dot: working,
    label: labelOverride || badge.label,
    title: badge.title,
  };
}

export interface ChatWorkingChipView {
  visible: boolean;
  label: string;
  title: string;
}

/** 会话头“工作中”chip：只按当前选中角色的 busy/队列判定。 */
export function chatWorkingChipView(
  facts: Pick<RoleFacts, "busy" | "queueDepth">,
  locale: Locale = DEFAULT_LOCALE,
): ChatWorkingChipView {
  const visible = deriveRoleStatus({
    busy: facts.busy === true,
    queueDepth: typeof facts.queueDepth === "number" ? facts.queueDepth : 0,
  }) === "working";
  const badge = statusBadge("working", 0, locale);
  return { visible, label: badge.label, title: badge.title };
}

export interface RoleStatusChipProps {
  className: string;
  label: string;
  title?: string;
  /** 工作态小圆点（文本仍在，颜色不是唯一信号）。 */
  dot?: boolean;
  status?: RoleStatus;
  /** 既有状态图标（error/confirm/restored）；working 不再重复放转轮。 */
  icon?: ReactNode;
}

/** 共用的状态 chip；无 JSX，便于 node --test 直接渲染断言。 */
export function RoleStatusChip(props: RoleStatusChipProps) {
  return createElement(
    "span",
    {
      className: props.className,
      title: props.title || undefined,
      "data-status": props.status || undefined,
    },
    props.icon ? props.icon : null,
    props.dot
      ? createElement("span", {
          className: "role-status-dot",
          "aria-hidden": "true",
        })
      : null,
    createElement("span", { className: "role-status-label" }, props.label),
  );
}
