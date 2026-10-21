/**
 * 确认卡状态机 / 队列撤回 / 附件类型呈现的纯逻辑（Phase 3B）。
 *
 * 渲染侧只呈现主进程数据面：`shell:confirm-request` 与 `recovery:confirm-request`
 * 的载荷原样存放；是否放行只由客户点击「放行执行 / 执行」决定（恰 allow:true）。
 * 失效/通道异常只收卡或如实定格，绝不呈现为已放行/已执行。
 *
 * 纯函数、无 DOM/存储依赖；`test/桌面UI/` 的 node 单测直接 import。
 */

export interface ConfirmCardRecord {
  id: string;
  payload: Record<string, unknown>;
  busy: boolean;
  expiredReason: string;
}

export interface ConfirmCardViewIdentity {
  projectRoot: string | null;
  runtime: string;
}

export function asCardRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * 卡载荷是否属于当前视图（旧 `Rt.matchesView` 同口径）：
 * projectRoot/runtime 缺省视为匹配；显式值必须精确相等。
 */
export function payloadMatchesView(
  payload: unknown,
  view: ConfirmCardViewIdentity,
): boolean {
  const record = asCardRecord(payload);
  const projectRoot = record.projectRoot;
  const runtime = record.runtime;
  return (
    (projectRoot == null || projectRoot === view.projectRoot) &&
    (runtime == null ? view.runtime === "pi" : runtime === view.runtime)
  );
}

/** 新卡到达：同 id 保留原记录（幂等重推），否则新建。 */
export function receiveCard(
  current: ConfirmCardRecord | null,
  payload: unknown,
): ConfirmCardRecord | null {
  const record = asCardRecord(payload);
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return current;
  if (current && current.id === id) {
    return { ...current, payload: record };
  }
  return { id, payload: record, busy: false, expiredReason: "" };
}

/** 回传在途：防止重复提交。 */
export function startResponding(
  current: ConfirmCardRecord | null,
): ConfirmCardRecord | null {
  if (!current || current.busy) return current;
  return { ...current, busy: true };
}

export interface ConfirmResponseOutcome {
  /** true = 收起卡片；false = 保留卡片并进入失效态（恢复卡口径）。 */
  close: boolean;
  /** true = 主进程回执该确认已失效（未获放行/未获执行）。 */
  expired: boolean;
  /** 如实提示（空串 = 不提示）；只用于 composer-hint，不写进卡内伪造结论。 */
  hint: string;
}

const SHELL_EXPIRED_HINT = "此确认已失效（超时或应用重启），未获放行——请让角色重新发起。";
const SHELL_CHANNEL_HINT =
  "未能回传你的决定（通道未接或异常）——按 fail-closed 不放行；请让角色重新发起。";
const RECOVERY_EXPIRED_TEXT = "此确认已失效（应用重启或请求已结束），未获执行——请让提议方重新发起。";
const RECOVERY_CHANNEL_TEXT =
  "未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。";

/** shell 卡回包结果 → 收起/提示（旧 respondShellConfirm 同口径）。 */
export function shellResponseOutcome(res: unknown): ConfirmResponseOutcome {
  const record = asCardRecord(res);
  if (record.ok === true) return { close: true, expired: false, hint: "" };
  if (record.expired === true) {
    return { close: true, expired: true, hint: SHELL_EXPIRED_HINT };
  }
  return { close: true, expired: false, hint: SHELL_CHANNEL_HINT };
}

/**
 * 恢复卡回包结果：成功 ⇒ 收起；失效/通道异常 ⇒ 保留卡片、定格为失效态，
 * 提示语必须是 `按 fail-closed 不执行`（旧 markRecoveryConfirmExpired 同口径）。
 */
export function recoveryResponseOutcome(res: unknown): ConfirmResponseOutcome {
  const record = asCardRecord(res);
  if (record.ok === true) return { close: true, expired: false, hint: "" };
  if (record.expired === true) {
    return { close: false, expired: true, hint: RECOVERY_EXPIRED_TEXT };
  }
  return { close: false, expired: true, hint: RECOVERY_CHANNEL_TEXT };
}

/**
 * 本轮 settled 后该收起哪张 shell 卡（2026-10-18 真机：不保留按钮全禁用的「已失效」卡）：
 * 只命中**该角色、同 runtime/project** 的当前卡；仍在等待的卡与其它角色的卡不受影响。
 */
export function staleShellOnSettled(
  card: ConfirmCardRecord | null,
  envelope: { roleId?: unknown; runtime?: unknown; projectRoot?: unknown },
  view: ConfirmCardViewIdentity,
): boolean {
  if (!card) return false;
  const roleId = typeof envelope.roleId === "string" ? envelope.roleId : "";
  const cardRoleId = typeof card.payload.roleId === "string" ? card.payload.roleId : "";
  if (!roleId || cardRoleId !== roleId) return false;
  const runtime =
    (typeof envelope.runtime === "string" && envelope.runtime) || view.runtime;
  const cardRuntime =
    typeof card.payload.runtime === "string" ? card.payload.runtime : view.runtime;
  if (cardRuntime !== runtime) return false;
  if (typeof envelope.projectRoot === "string") {
    const cardRoot =
      typeof card.payload.projectRoot === "string" ? card.payload.projectRoot : view.projectRoot;
    if (cardRoot !== envelope.projectRoot) return false;
  }
  return true;
}

/** 失效回执只按 id 命中当前卡（旧 id/迟到回包不会误收其它卡）。 */
export function expiryHitsCard(
  card: ConfirmCardRecord | null,
  id: unknown,
): boolean {
  return !!card && typeof id === "string" && id !== "" && card.id === id;
}

// —————— 队列位次与撤回（chat stream 就地呈现）——————

export interface QueueEntry {
  id: string;
  kind: string;
  summary: string;
  full: string;
  sourceRoleId: string;
  at: string;
}

export interface QueueItemView extends QueueEntry {
  /** "进行中" 或排队位次（1..N，如实：排队 ≠ 已执行）。 */
  position: string;
  running: boolean;
  /** 仅客户消息且未投递（非进行中）者可撤回。 */
  canWithdraw: boolean;
  sourceLabel: string;
  text: string;
}

function queueSourceLabel(kind: string, sourceRoleId: string): string {
  if (kind === "dispatch") {
    return sourceRoleId ? "派发 · 来自 " + sourceRoleId : "派发";
  }
  if (kind === "handback") {
    return sourceRoleId ? "回交 · 来自 " + sourceRoleId : "回交";
  }
  if (kind === "system") return "系统";
  return "客户消息";
}

function shortenQueueText(summary: string): string {
  const text = String(summary == null ? "" : summary).replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}

function pickQueueEntry(value: unknown): QueueEntry {
  const record = asCardRecord(value);
  return {
    id: typeof record.id === "string" ? record.id : "",
    kind: typeof record.kind === "string" ? record.kind : "",
    summary: typeof record.summary === "string" ? record.summary : "",
    full: typeof record.full === "string" ? record.full : "",
    sourceRoleId:
      typeof record.sourceRoleId === "string" ? record.sourceRoleId : "",
    at: typeof record.at === "string" ? record.at : "",
  };
}

/** 队列条目视图（旧 `UiLabels.queueItemViews` 同口径：running 在前 + 排队 1..N）。 */
export function queueItemViews(queue: unknown, running: unknown): QueueItemView[] {
  const views: QueueItemView[] = [];
  if (running && typeof running === "object") {
    const entry = pickQueueEntry(running);
    views.push({
      ...entry,
      position: "进行中",
      running: true,
      canWithdraw: false,
      sourceLabel: queueSourceLabel(entry.kind, entry.sourceRoleId),
      text: shortenQueueText(entry.summary),
    });
  }
  const items = Array.isArray(queue) ? queue : [];
  for (let index = 0; index < items.length; index += 1) {
    const entry = pickQueueEntry(items[index]);
    views.push({
      ...entry,
      position: String(index + 1),
      running: false,
      canWithdraw: entry.kind === "message" && entry.id !== "",
      sourceLabel: queueSourceLabel(entry.kind, entry.sourceRoleId),
      text: shortenQueueText(entry.summary),
    });
  }
  return views;
}

export interface WithdrawOutcome {
  ok: boolean;
  /** 就地回执（旧 sysRow 文案同义）：成功/无效都如实一行；空串表示不显示。 */
  text: string;
}

/** 撤回回包 → 就地回执（绝不假装撤掉）。 */
export function withdrawOutcome(res: unknown): WithdrawOutcome {
  const record = asCardRecord(res);
  if (record.ok === true) {
    return {
      ok: true,
      text: "已撤回排队消息：" + (typeof record.summary === "string" ? record.summary : ""),
    };
  }
  return {
    ok: false,
    text: "撤回无效：" + (typeof record.error === "string" && record.error ? record.error : "未知原因"),
  };
}

/** 撤回异常（IPC 抛错）→ 就地回执。 */
export function withdrawExceptionOutcome(error: unknown): WithdrawOutcome {
  return { ok: false, text: "撤回失败：" + String(error) };
}

// —————— 附件类型呈现（渲染侧快速筛；权威校验在主进程）——————

export const IMAGE_MIME_ALLOW = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ImageFileLike {
  type: string;
  size: number;
}

/** 客户端快速筛：只挡明显不合规者并如实提示；真实字节校验在主进程。 */
export function clientImageProblem(file: ImageFileLike): string {
  if (IMAGE_MIME_ALLOW.indexOf(String(file.type || "")) < 0) {
    return "图片类型不支持：" + (file.type || "（未知）") + "——只支持 png / jpeg / webp / gif。";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return "图片过大（> " + Math.round(IMAGE_MAX_BYTES / 1024 / 1024) + "MB）——请压缩后再发。";
  }
  return "";
}

/** 附件 chip 的悬停标题（名称 + KB 大小）。 */
export function attachmentTitle(name: string, size: number): string {
  const kb = Math.max(1, Math.round((Number(size) || 0) / 1024));
  return name + "（" + kb + "KB）";
}
