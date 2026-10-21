/**
 * 全量回放阅读锚点（Phase 5A）。
 *
 * 历史全量重建会换掉行对象，滚动位置可能因前缀插入/行高重测而漂移。这里只记录
 * **首个可见阅读行**的稳定文本前缀、相对聊天顶的偏移和贴底偏好；回放布局后按同一
 * 行文本找回并按 delta 校正 `scrollTop`。找不到同一行就什么都不做（不猜、不滚动）。
 *
 * 纯逻辑（不读 DOM、不设定时器、不做动画）；贴底时保持原有尾部行为，不介入。
 */

export const READING_TEXT_LIMIT = 60;
export const STICK_THRESHOLD = 24;

export interface ReadingRowSample {
  text: string;
  top: number;
}

export interface ReadingAnchor {
  /** 阅读行文本的稳定前缀（与 e2e `reading()` 同口径：textContent 前 60 字）。 */
  text: string;
  /** 行顶相对聊天顶的偏移（px）。 */
  offset: number;
  /** 记录时是否贴底；贴底走原有尾部跟随，不做阅读锚点还原。 */
  stickToBottom: boolean;
}

export function clipReadingText(text: unknown): string {
  return typeof text === "string" ? text.slice(0, READING_TEXT_LIMIT) : "";
}

/** 与 VirtualPane 的 24px 尾部容差同口径。 */
export function isStuckToBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = STICK_THRESHOLD,
): boolean {
  const remaining = scrollHeight - scrollTop - clientHeight;
  return Number.isFinite(remaining) && remaining <= threshold;
}

/**
 * 从按 DOM 顺序排列的可见阅读行中取第一行作为锚点。
 * 调用方只传入相交聊天视口的行；无文本行跳过。
 */
export function readingAnchorFromRows(
  rows: readonly ReadingRowSample[],
  chatTop: number,
  stickToBottom: boolean,
): ReadingAnchor | null {
  if (stickToBottom) return null;
  for (const row of rows) {
    const text = clipReadingText(row.text);
    if (text === "") continue;
    return {
      text,
      offset: row.top - chatTop,
      stickToBottom: false,
    };
  }
  return null;
}

/** 回放后的行是否就是记录时那一行（文本前缀相同；不按序号猜）。 */
export function readingAnchorMatches(anchor: ReadingAnchor | null, text: unknown): boolean {
  if (!anchor || anchor.text === "") return false;
  const candidate = clipReadingText(text);
  return candidate !== "" && candidate.startsWith(anchor.text);
}

/** 同一行相对聊天顶的位移：新偏移 - 旧偏移。 */
export function readingAnchorDelta(
  anchor: ReadingAnchor,
  rowTop: number,
  chatTop: number,
): number {
  return rowTop - chatTop - anchor.offset;
}

/**
 * 布局后的目标 `scrollTop`：只在非贴底且找到同一行时返回；否则 null（不动）。
 */
export function restoredScrollTop(
  anchor: ReadingAnchor | null,
  currentScrollTop: number,
  rowTop: number,
  chatTop: number,
): number | null {
  if (!anchor || anchor.stickToBottom) return null;
  return currentScrollTop + readingAnchorDelta(anchor, rowTop, chatTop);
}

/**
 * full replay 前登记、VirtualPane 布局后取走（一次性）；按角色隔离，
 * 后台角色未挂载时不消费，切回该角色后仍可用。
 */
const pendingAnchors = new Map<string, ReadingAnchor>();

export function rememberReadingAnchor(roleId: string, anchor: ReadingAnchor | null): void {
  if (!roleId || !anchor || anchor.stickToBottom) return;
  pendingAnchors.set(roleId, anchor);
}

export function takeReadingAnchor(roleId: string): ReadingAnchor | null {
  const anchor = pendingAnchors.get(roleId) || null;
  if (anchor) pendingAnchors.delete(roleId);
  return anchor;
}

export function clearReadingAnchors(): void {
  pendingAnchors.clear();
}
