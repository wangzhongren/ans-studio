/**
 * 历史回放 vs 实时行的合并判定（纯逻辑）。
 *
 * 真机回归 row-355/row-358：会话重建的用户输入以
 * `【系统通知·会话重建】…\n\n<用户正文>` 形式回放；渲染层把这条历史行拆成
 * 「通知行 + 用户正文行」，与实时到达的同一条输入呈现相同。按原始正文去重时
 * 前缀导致文本不等 ⇒ 历史追加又生成一对通知/用户行，同一 turn 同一输入出现两条。
 *
 * 这里只回答「这条历史行在实时侧是否已被完整呈现」，不做 IPC/状态变更；
 * 身份按 turnId + 呈现分片（kind + 全文）比较，不同 turn 的同文输入互不覆盖。
 */

import type { NewRowDescriptor } from "./events.ts";
import { historyRenderParts, type HistoryRenderPart } from "./events.ts";

export interface LiveRowIdentity {
  kind: string;
  turnId: string;
  text: string;
}

/** 实时（非 replay）行在合并判定中的身份；无 turnId/无文本不参与（不猜）。 */
export function liveRowIdentity(row: {
  kind: string;
  turnId?: string;
  data: unknown;
  replay?: boolean;
}): LiveRowIdentity | null {
  if (row.replay) return null;
  const turnId = typeof row.turnId === "string" ? row.turnId : "";
  if (!turnId) return null;
  const data =
    row.data && typeof row.data === "object"
      ? (row.data as Record<string, unknown>)
      : {};
  const body = typeof data.body === "string" ? data.body : "";
  const text = typeof data.text === "string" ? data.text : "";
  const content =
    row.kind === "injected" || row.kind === "delivery"
      ? body || text
      : text || body;
  if (content === "") return null;
  return { kind: row.kind, turnId, text: content };
}

/** 与 `liveCoversHistoryRow` 同口径的「投影行」种类（工具/回交/终态不按文本合并）。 */
const MERGE_KINDS = new Set([
  "user",
  "assistant",
  "system",
  "injected",
  "denied",
]);

export interface HistoryMergeDecision {
  /** 追加原始历史行（保留锚点等身份与全部分片）。 */
  appendRow: boolean;
  /** 仅追加通知行（system-notice 正文已由实时行呈现，去掉 remainder）。 */
  appendNoticeOnly: boolean;
  /** 仅追加用户正文行（通知已由实时行呈现，正文缺失）。 */
  appendUserTexts: string[];
}

/** 历史行的某一呈现分片是否已被实时行覆盖（同 kind、同 turn、全文相等）。 */
export function historyPartCoveredByLive(
  part: HistoryRenderPart,
  turnId: string,
  liveRows: readonly LiveRowIdentity[],
): boolean {
  if (!turnId) return false;
  return liveRows.some(
    (row) =>
      row.kind === part.kind && row.turnId === turnId && row.text === part.text,
  );
}

/**
 * 决定一条历史行是否还要追加：
 * - 单分片行：实时侧同 turn 同文已存在 ⇒ 不追加；
 * - system-notice 行：通知/正文分别判断，只补缺的一份（全部覆盖 ⇒ 不追加）；
 * - 不同 turn 的同文输入（客户真实两条）互不覆盖；
 * - 非合并种类（工具/回交/终态等）始终按原样追加。
 */
export function planHistoryMerge(
  descriptor: NewRowDescriptor,
  liveRows: readonly LiveRowIdentity[],
  claimedUserTexts: ReadonlySet<string> = new Set<string>(),
): HistoryMergeDecision {
  const none: HistoryMergeDecision = {
    appendRow: false,
    appendNoticeOnly: false,
    appendUserTexts: [],
  };
  if (!MERGE_KINDS.has(descriptor.kind)) {
    return { ...none, appendRow: true };
  }
  const parts = historyRenderParts(descriptor);
  if (parts.length === 0) return { ...none, appendRow: true };
  const turnId = typeof descriptor.turnId === "string" ? descriptor.turnId : "";
  const covered = parts.map(
    (part) =>
      (part.kind === "user" && claimedUserTexts.has(part.text)) ||
      historyPartCoveredByLive(part, turnId, liveRows),
  );
  if (parts.length === 1) {
    return covered[0] ? none : { ...none, appendRow: true };
  }
  if (covered.every(Boolean)) return none;
  if (covered.every((value) => !value)) return { ...none, appendRow: true };
  const missingUserTexts = parts
    .filter((part, index) => index > 0 && !covered[index] && part.kind === "user")
    .map((part) => part.text);
  // 首片（通知）已覆盖 ⇒ 只补缺的用户正文；否则通知缺失 ⇒ 补通知（不含 remainder）。
  return {
    appendRow: false,
    appendNoticeOnly: !covered[0],
    appendUserTexts: missingUserTexts,
  };
}
