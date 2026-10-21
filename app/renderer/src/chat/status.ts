/**
 * 角色状态派生与徽标（Phase 3A 纯逻辑；对齐旧 role-status.js 的优先级与措辞）。
 *
 * 优先级：等待确认 > 工作中（busy 或队列待办）> 错误 > 空闲/已停止/已恢复/未开启。
 * `error` 是上一轮终局，新轮 busy 时必须显示「工作中」；`working` 只由真实信号
 * （busy / queueDepth）派生，界面侧不自行推测。
 */

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

export const STOPPED_LABEL = "已停止";

export interface RoleBadge {
  label: string;
  className: string;
  title: string;
}

const BADGES: Record<RoleStatus, RoleBadge> = {
  "not-opened": {
    label: "未开启",
    className: "st-off",
    title: "尚未开启会话（点它即可开启）",
  },
  idle: {
    label: "空闲",
    className: "st-idle",
    title: "会话已开启，当前没有在跑的任务",
  },
  working: {
    label: "工作中",
    className: "st-working",
    title: "有轮次在跑（切走后仍在后台跑的轮次同样计入）或队列有待办",
  },
  "awaiting-confirm": {
    label: "等待你确认",
    className: "st-confirm",
    title: "有交互请求挂起，等你在会话流里作答",
  },
  stopped: {
    label: STOPPED_LABEL,
    className: "st-stopped",
    title: "会话已停止（历史保留在界面上；再点开为新会话）",
  },
  error: {
    label: "错误",
    className: "st-error",
    title: "最近一次轮次或会话以错误结束",
  },
  "idle-restored": {
    label: "空闲（已恢复）",
    className: "st-restored",
    title: "句柄未开；聊天流里是该角色恢复出来的历史记录",
  },
};

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

export function statusBadge(status: RoleStatus, pendingCount = 0): RoleBadge {
  const badge = BADGES[status] ?? {
    label: "未知",
    className: "st-unknown",
    title: "未知状态（保守占位）",
  };
  const count =
    typeof pendingCount === "number" &&
    Number.isFinite(pendingCount) &&
    pendingCount > 0
      ? Math.floor(pendingCount)
      : 0;
  const label = badge.label + (count > 0 ? " · " + count + " 待办" : "");
  let title = badge.title;
  if (count > 0) {
    title +=
      status === "working"
        ? "；另有 " + count + " 项已入队，当前任务完成后依次处理"
        : "；另有 " + count + " 项待办在队列中（完成后依次处理）";
  }
  return { ...badge, label, title };
}
