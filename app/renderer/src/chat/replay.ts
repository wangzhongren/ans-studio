/**
 * 回放与实时去重（Phase 3A 纯逻辑）。
 *
 * 旧 `renderer.js` 用 `replayPlan`（skip/append/full）+ `replayKey/canonicalKey`
 * 计数做「历史回放幂等 / 增量 / 全量重建」与「实时回显不重复」。这里保留同一语义的
 * 可单测最小面：
 * - `planReplay(prev, next)`：相同 → skip；next 是 prev 的严格前缀扩展 → append；
 *   其余 → full；
 * - `rowSignature(row)`：历史行的稳定签名（kind/turnId/eventKind/text/at）；
 * - `eventKey(event)`：实时事件的去重键（turnId + kind + source + text）；
 * - `classifyLiveDuplicate(...)`：命中历史或已见实时 → skip（终态/工具身份不参与）。
 */

export interface ReplayRowLike {
  kind?: string;
  text?: string;
  turnId?: string | null;
  eventKind?: string | null;
  at?: string;
}

export type ReplayPlan =
  | { mode: "skip" }
  | { mode: "append"; from: number }
  | { mode: "full" };

export function rowSignature(row: ReplayRowLike): string {
  return JSON.stringify([
    row && row.kind ? row.kind : "",
    row && row.turnId ? row.turnId : "",
    row && row.eventKind ? row.eventKind : "",
    row && typeof row.text === "string" ? row.text : "",
    row && typeof row.at === "string" ? row.at : "",
  ]);
}

export function planReplay(
  previous: string[] | null,
  next: string[],
): ReplayPlan {
  if (!previous) return { mode: "full" };
  if (
    previous.length === next.length &&
    previous.every((value, index) => value === next[index])
  ) {
    return { mode: "skip" };
  }
  if (
    next.length > previous.length &&
    previous.every((value, index) => value === next[index])
  ) {
    return { mode: "append", from: previous.length };
  }
  return { mode: "full" };
}

export interface LiveEventLike {
  kind?: string;
  turnId?: string;
  summary?: string;
  detail?: Record<string, unknown>;
}

function detailString(
  detail: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = detail ? detail[key] : undefined;
  return typeof value === "string" ? value : "";
}

export function eventKey(event: LiveEventLike | null | undefined): string | null {
  if (!event) return null;
  const turnId = typeof event.turnId === "string" ? event.turnId : "";
  if (!turnId) return null; // 无轮次身份的事件不参与去重（不猜）
  const kind = event.kind || "message";
  const source = detailString(event.detail, "source");
  const text =
    detailString(event.detail, "text") ||
    (typeof event.summary === "string" ? event.summary : "");
  return JSON.stringify([turnId, kind, source, text]);
}

export function isTerminalEvent(event: LiveEventLike | null | undefined): boolean {
  if (!event) return false;
  return event.kind === "settled" || event.kind === "denied";
}

export function isToolEvent(event: LiveEventLike | null | undefined): boolean {
  if (!event) return false;
  if (event.kind !== "tool_call" && event.kind !== "accepted" && event.kind !== "denied") {
    return false;
  }
  return typeof detailString(event.detail, "toolName") === "string" && detailString(event.detail, "toolName") !== "";
}

export interface DuplicateDecision {
  skip: boolean;
  nextLiveCount: number;
}

/**
 * 历史/实时去重（逐 key 计数）。
 * - 历史有 N 条同 key，实时只允许 N 条「非终态/非工具身份」事件通过（之后的重复跳过）；
 * - 历史没有、实时已见过同 key 的非终态/非工具事件，再见到即跳过；
 * - 终态/工具身份事件不因文本重复被吞（它们是事实，不是回显）。
 */
export function classifyLiveDuplicate(input: {
  key: string | null;
  event: LiveEventLike | null | undefined;
  historyCount: number;
  liveCount: number;
}): DuplicateDecision {
  const key = input.key;
  const historyCount = Math.max(0, input.historyCount || 0);
  const liveCount = Math.max(0, input.liveCount || 0);
  const exempt = isTerminalEvent(input.event) || isToolEvent(input.event);
  if (!key || exempt) {
    return { skip: false, nextLiveCount: liveCount + 1 };
  }
  if (historyCount > 0) {
    // 历史已有同 key：实时回显不再新增行（历史行已经在）。
    return { skip: true, nextLiveCount: Math.max(liveCount, historyCount) };
  }
  if (liveCount > 0) {
    // 同一实时事件的重复推送。
    return { skip: true, nextLiveCount: liveCount };
  }
  return { skip: false, nextLiveCount: 1 };
}
