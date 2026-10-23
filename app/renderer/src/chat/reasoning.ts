/**
 * 推理折叠行的纯逻辑（R1/R2/R3 的单一实现）。
 *
 * 实时（`events.describeEvent`）、历史回放（`events.historyRowToDescriptor`）与
 * store 的合并/插入位置都调用本模块；`ChatRow` 只消费行数据与文案常量。
 *
 * 纪律：
 *  - 正文唯一来源是核心投影形的 `reasoning.text.text`（DisplayTextV1）；原始事实
 *    （>`text` 是字符串）或损坏形状一律 fail-closed，绝不把未投影文本放上屏。
 *  - summary（「已思考」）只作旧数据兜底文案，绝不当正文。
 *  - 时长只认真实信号（有限且 >=0）；无信号不发明秒数。
 *  - omitted 一律不呈现正文；合并后部分省略有独立标记。
 *
 * 不读 DOM、不依赖 store，供 node 单测直接 import。
 */

export type ReasoningStatus = "complete" | "omitted";

/** 一段推理事实（已由核心投影：`text` 是 DisplayTextV1.text；omitted 时为空串）。 */
export interface ReasoningPiece {
  status: ReasoningStatus;
  text: string;
  durationMs?: number;
}

/** 推理行数据（桌面UI 内部形状，不是跨角色契约）。`pieces` 供合并/幂等使用，不渲染。 */
export interface ReasoningRowData extends Record<string, unknown> {
  status: ReasoningStatus;
  text: string;
  durationMs?: number;
  label: string;
  partialOmitted?: boolean;
  pieces: ReasoningPiece[];
}

/** 旧行没有 label 时的兜底文案（与 reasoningLabel 同源；不允许第二份文案实现）。 */
export const REASONING_FALLBACK_LABEL = "已思考";
export const REASONING_UNSAFE_NOTE = "推理内容无法安全显示";
export const REASONING_OMITTED_NOTE = "平台省略了思考正文，无法显示具体内容。";
export const REASONING_EMPTY_NOTE = "没有可显示的思考正文。";
export const REASONING_PARTIAL_NOTE = "平台省略了部分思考正文。";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 真实时长信号：有限且 >=0；负数/NaN/Infinity/字符串/null 一律视为无信号。 */
export function validReasoningDurationMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * 折叠标题唯一文案来源（R2 冻结格式）：
 * 有真实时长 → 「已思考 N 秒」（四舍五入、下限 1）；无信号 → 「已思考」；
 * omitted → 追加「（内容由平台省略）」；合并后部分省略 → 追加「（部分内容由平台省略）」。
 */
export function reasoningLabel(input: {
  status: ReasoningStatus;
  durationMs?: number;
  partialOmitted?: boolean;
}): string {
  const durationMs = validReasoningDurationMs(input.durationMs);
  const base =
    durationMs !== undefined
      ? "已思考 " + Math.max(1, Math.round(durationMs / 1000)) + " 秒"
      : REASONING_FALLBACK_LABEL;
  if (input.status === "omitted") return base + "（内容由平台省略）";
  if (input.partialOmitted === true) return base + "（部分内容由平台省略）";
  return base;
}

function sanitizePiece(piece: ReasoningPiece): ReasoningPiece {
  const status: ReasoningStatus = piece.status === "omitted" ? "omitted" : "complete";
  const text = status === "omitted" ? "" : asString(piece.text);
  const durationMs = validReasoningDurationMs(piece.durationMs);
  return { status, text, ...(durationMs !== undefined ? { durationMs } : {}) };
}

/** piece 指纹（`status|durationMs?|正文`）：实时重推/实时＋历史重复到达时命中即忽略。 */
export function reasoningPieceFingerprint(piece: ReasoningPiece): string {
  const safe = sanitizePiece(piece);
  return JSON.stringify([safe.status, safe.durationMs ?? null, safe.text]);
}

/**
 * 从投影形载体 `{text: DisplayTextV1, status, durationMs?}` 提取一段事实。
 * 坏件（text 不是 `{text: string}` 结构、status 非 complete/omitted）返回 null，由调用方 fail-closed。
 */
export function reasoningPieceFromCarrier(carrier: unknown): ReasoningPiece | null {
  const record = asRecord(carrier);
  if (!record) return null;
  const status =
    record.status === "complete" || record.status === "omitted" ? record.status : null;
  const textHolder = asRecord(record.text);
  if (status === null || !textHolder || typeof textHolder.text !== "string") {
    return null;
  }
  const durationMs = validReasoningDurationMs(record.durationMs);
  return {
    status,
    text: status === "omitted" ? "" : textHolder.text,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

/** 实时事件 `detail.reasoning` 的提取（R1）；不读 `detail.text`、不读 summary。 */
export function reasoningPieceFromDetail(detail: unknown): ReasoningPiece | null {
  const record = asRecord(detail);
  return record ? reasoningPieceFromCarrier(record.reasoning) : null;
}

function composeReasoningData(pieces: ReasoningPiece[]): ReasoningRowData {
  const safePieces = pieces.map(sanitizePiece);
  const status: ReasoningStatus = safePieces.some(
    (piece) => piece.status === "complete",
  )
    ? "complete"
    : "omitted";
  const text = safePieces
    .filter((piece) => piece.status === "complete" && piece.text !== "")
    .map((piece) => piece.text)
    .join("\n\n");
  // 合并行只在所有已收 piece 都带真实时长时求和；任一缺失则不显示秒数（不显示部分和）。
  const allTimed =
    safePieces.length > 0 && safePieces.every((piece) => piece.durationMs !== undefined);
  const durationMs = allTimed
    ? safePieces.reduce((sum, piece) => sum + (piece.durationMs || 0), 0)
    : undefined;
  const partialOmitted =
    status === "complete" && safePieces.some((piece) => piece.status === "omitted");
  return {
    status,
    text,
    ...(durationMs !== undefined ? { durationMs } : {}),
    label: reasoningLabel({ status, durationMs, partialOmitted }),
    ...(partialOmitted ? { partialOmitted: true } : {}),
    pieces: safePieces,
  };
}

/** 单段事实 → 行数据（第一段建行）。 */
export function reasoningRowDataFromPiece(piece: ReasoningPiece): ReasoningRowData {
  return composeReasoningData([piece]);
}

/** 从行数据读取已收 piece（只认本模块写出的结构；损坏条目忽略，保守不猜）。 */
export function reasoningPiecesFromData(data: Record<string, unknown>): ReasoningPiece[] {
  if (Array.isArray(data.pieces)) {
    const pieces: ReasoningPiece[] = [];
    for (const item of data.pieces as unknown[]) {
      const record = asRecord(item);
      if (!record) continue;
      const status =
        record.status === "complete" || record.status === "omitted"
          ? record.status
          : null;
      if (status === null || typeof record.text !== "string") continue;
      const durationMs = validReasoningDurationMs(record.durationMs);
      pieces.push({
        status,
        text: status === "omitted" ? "" : record.text,
        ...(durationMs !== undefined ? { durationMs } : {}),
      });
    }
    return pieces;
  }
  // 兼容只有平铺字段的行（旧内存行/外部手写数据）。
  const status =
    data.status === "complete" || data.status === "omitted" ? data.status : null;
  if (status === null || typeof data.text !== "string") return [];
  const durationMs = validReasoningDurationMs(data.durationMs);
  return [
    {
      status,
      text: status === "omitted" ? "" : data.text,
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
  ];
}

/**
 * 把一段 piece 合并进已有行数据：指纹命中 ⇒ 原样返回（幂等）；否则按到达序拼接，
 * 重算 status/text/duration/label，并保留 `detailsOpen` 等既有字段。
 */
export function mergeReasoningRowData(
  existing: Record<string, unknown>,
  incoming: ReasoningPiece,
): { data: Record<string, unknown>; changed: boolean } {
  const piece = sanitizePiece(incoming);
  const pieces = reasoningPiecesFromData(existing);
  const fingerprint = reasoningPieceFingerprint(piece);
  if (pieces.some((candidate) => reasoningPieceFingerprint(candidate) === fingerprint)) {
    return { data: existing, changed: false };
  }
  const composed = composeReasoningData([...pieces, piece]);
  const data: Record<string, unknown> = { ...existing, ...composed };
  if (composed.durationMs === undefined) delete data.durationMs;
  if (!composed.partialOmitted) delete data.partialOmitted;
  return { data, changed: true };
}

const REASONING_ANCHOR_KINDS = new Set([
  "assistant",
  "activities",
  "tool-lifecycle",
  "denied",
  "turn-terminal",
]);

/**
 * 新 reasoning 行的确定性插入位置（R3）：
 *  - 同回合已有锚点行（assistant/activities/tool-lifecycle/denied/turn-terminal）
 *    ⇒ 插到该回合**第一条**锚点行之前（因此永远在「会话结束」之前）；
 *  - 只有非锚点行（user/delivery/injected/system/operator…）
 *    ⇒ 插到该回合最后一条行之后；
 *  - 该回合还没有任何行 ⇒ 表尾。
 * 无 turnId 返回表尾（调用方按无轮次坏件直接追加，不合并/不重排）。
 */
export function reasoningInsertIndex(
  rows: ReadonlyArray<{ kind?: string; turnId?: string }>,
  turnId: string,
): number {
  if (!turnId) return rows.length;
  let firstAnchor = -1;
  let lastTurnRow = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.turnId !== turnId) continue;
    lastTurnRow = index;
    if (
      firstAnchor < 0 &&
      typeof row.kind === "string" &&
      REASONING_ANCHOR_KINDS.has(row.kind)
    ) {
      firstAnchor = index;
    }
  }
  if (firstAnchor >= 0) return firstAnchor;
  return lastTurnRow >= 0 ? lastTurnRow + 1 : rows.length;
}
