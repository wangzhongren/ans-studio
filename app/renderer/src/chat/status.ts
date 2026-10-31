/**
 * 角色状态派生与徽标（Phase 3A 纯逻辑；对齐旧 role-status.js 的优先级与措辞）。
 *
 * 优先级：等待确认 > 工作中（busy 或队列待办）> 错误 > 空闲/已停止/已恢复/未开启。
 * `error` 是上一轮终局，新轮 busy 时必须显示「工作中」；`working` 只由真实信号
 * （busy / queueDepth）派生，界面侧不自行推测。
 *
 * i18n B1：文案来自 shared 目录（`ui.status.*`），纯函数接受可选 `locale`
 * （默认 zh-CN）以保持旧调用/旧测试逐字不变；组件按当前 locale 调用。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export type RoleStatus =
  | "not-opened"
  | "idle"
  | "working"
  | "awaiting-confirm"
  | "stopped"
  | "error"
  | "idle-restored";

export interface RoleFacts {
  awaitingConfirm?: boolean;
  busy?: boolean;
  queueDepth?: number;
  error?: boolean;
  live?: boolean;
  hadSession?: boolean;
  restored?: boolean;
}

/** 旧导出名（值仍为 zh-CN 文案；测试以此为行为基线）。 */
export const STOPPED_LABEL = translate(DEFAULT_LOCALE, "ui.status.label.stopped");

export interface RoleBadge {
  label: string;
  className: string;
  title: string;
}

interface BadgeMeta {
  labelKey: MessageKey;
  className: string;
  titleKey: MessageKey;
}

const BADGES: Record<RoleStatus, BadgeMeta> = {
  "not-opened": {
    labelKey: "ui.status.label.closed",
    className: "st-off",
    titleKey: "ui.status.title.closed",
  },
  idle: {
    labelKey: "ui.status.label.idle",
    className: "st-idle",
    titleKey: "ui.status.title.idle",
  },
  working: {
    labelKey: "ui.status.label.working",
    className: "st-working",
    titleKey: "ui.status.title.working",
  },
  "awaiting-confirm": {
    labelKey: "ui.status.label.waitingConfirm",
    className: "st-confirm",
    titleKey: "ui.status.title.waitingConfirm",
  },
  stopped: {
    labelKey: "ui.status.label.stopped",
    className: "st-stopped",
    titleKey: "ui.status.title.stopped",
  },
  error: {
    labelKey: "ui.status.label.error",
    className: "st-error",
    titleKey: "ui.status.title.error",
  },
  "idle-restored": {
    labelKey: "ui.status.label.idleRecovered",
    className: "st-restored",
    titleKey: "ui.status.title.idleRecovered",
  },
};

const UNKNOWN_BADGE: BadgeMeta = {
  labelKey: "shared.common.unknown",
  className: "st-unknown",
  titleKey: "ui.status.title.unknown",
};

/** 句间连接符（结构标点，不是文案；zh 保持旧逐字输出）。 */
function clauseSeparator(locale: Locale): string {
  return locale === "zh-CN" ? "；" : "; ";
}

export function deriveRoleStatus(facts: RoleFacts = {}): RoleStatus {
  if (facts.awaitingConfirm) return "awaiting-confirm";
  if (facts.busy === true) return "working";
  if (typeof facts.queueDepth === "number" && facts.queueDepth > 0) {
    return "working";
  }
  if (facts.error) return "error";
  if (facts.live) return "idle";
  if (facts.hadSession) return "stopped";
  if (facts.restored) return "idle-restored";
  return "not-opened";
}

export function statusBadge(
  status: RoleStatus,
  pendingCount = 0,
  locale: Locale = DEFAULT_LOCALE,
): RoleBadge {
  const badge = BADGES[status] ?? UNKNOWN_BADGE;
  const label = translate(locale, badge.labelKey);
  const title = translate(locale, badge.titleKey);
  const count =
    typeof pendingCount === "number" &&
    Number.isFinite(pendingCount) &&
    pendingCount > 0
      ? Math.floor(pendingCount)
      : 0;
  const pendingLabel =
    count > 0 ? label + " · " + translate(locale, "ui.status.pendingCount", { count }) : label;
  let pendingTitle = title;
  if (count > 0) {
    pendingTitle +=
      clauseSeparator(locale) +
      translate(
        locale,
        status === "working"
          ? "ui.status.queueNote.enqueued"
          : "ui.status.queueNote.pending",
        { count },
      );
  }
  return { label: pendingLabel, className: badge.className, title: pendingTitle };
}

// —————————————— P2（2026-10-30）：网络状态行 ——————————————
//
// 主进程 `net.isOnline` 权威 → 会话头状态行（`aria-live="polite"`）。只呈现人话：
// · 离线：`网络已断开`（title 说明请求计时已暂停、队列等待网络、恢复后自动继续）；
// · 恢复：从离线恢复后 8s 内显示 `网络已恢复 · 正在继续`（随后收起，不长期占位）；
// · 在线常态：隐藏（不刷屏）。**不显示** ECONNRESET/SDK 堆栈/URL/凭据——技术细节只在诊断。

/** 「网络已恢复」状态行的展示时长（毫秒）。 */
export const NETWORK_RECOVERED_VISIBLE_MS = 8_000;

/** 渲染层持有的网络事实（主进程快照 + 本地恢复时刻；不是第二状态源）。 */
export interface NetworkStatusFacts {
  online?: boolean;
  /** 离线 → 在线 的恢复时刻（ms epoch）；仅用于短暂展示恢复行。 */
  recoveredAt?: number | null;
}

export type NetworkStatusKind = "hidden" | "offline" | "recovered";

export interface NetworkStatusView {
  visible: boolean;
  status: NetworkStatusKind;
  label: string;
  title: string;
  className: string;
  ariaLive: "polite";
}

/**
 * 网络状态行视图（纯函数，locale/now 可注入）。`facts` 缺省（尚未收到快照）⇒ 隐藏——
 * 不把「未知」误报为离线/在线。
 */
export function networkStatusView(
  facts: NetworkStatusFacts | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
  nowMs: number = Date.now(),
): NetworkStatusView {
  const offline = facts?.online === false;
  if (offline) {
    return {
      visible: true,
      status: "offline",
      label: translate(locale, "ui.network.label.offline"),
      title: translate(locale, "ui.network.title.offline"),
      className: "network-status-line is-offline",
      ariaLive: "polite",
    };
  }
  const recoveredAt = typeof facts?.recoveredAt === "number" ? facts.recoveredAt : null;
  const recoveredAge = recoveredAt === null ? Number.POSITIVE_INFINITY : nowMs - recoveredAt;
  if (facts?.online === true && recoveredAge >= 0 && recoveredAge < NETWORK_RECOVERED_VISIBLE_MS) {
    return {
      visible: true,
      status: "recovered",
      label: translate(locale, "ui.network.label.recovered"),
      title: translate(locale, "ui.network.title.recovered"),
      className: "network-status-line is-recovered",
      ariaLive: "polite",
    };
  }
  return { visible: false, status: "hidden", label: "", title: "", className: "network-status-line", ariaLive: "polite" };
}
