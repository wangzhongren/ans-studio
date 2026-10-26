/**
 * 工具行单行摘要（2026-10-25）：命令/目标去换行、空白归一、按字符截断。
 * 展示用短文本；完整原文由调用方放进 title 或展开详情。
 */

export const TOOL_ROW_TEXT_LIMIT = 72;

/** 多行/连续空白归一为单行；null/undefined ⇒ 空串。 */
export function normalizeToolRowText(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** 归一后截断到 maxLength（含省略号）。 */
export function truncateToolRowText(
  text: unknown,
  maxLength: number = TOOL_ROW_TEXT_LIMIT,
): string {
  const value = normalizeToolRowText(text);
  const limit =
    Number.isFinite(maxLength) && maxLength > 0
      ? Math.floor(maxLength)
      : TOOL_ROW_TEXT_LIMIT;
  const characters = Array.from(value);
  if (characters.length <= limit) return value;
  return characters.slice(0, Math.max(1, limit - 1)).join("") + "…";
}

export interface ToolRowTextDisplay {
  display: string;
  title: string;
}

/** 目标/命令展示：display 单行截断，title 保留归一后的全文（不丢原文内容）。 */
export function toolRowTextDisplay(
  text: unknown,
  maxLength: number = TOOL_ROW_TEXT_LIMIT,
): ToolRowTextDisplay {
  return {
    display: truncateToolRowText(text, maxLength),
    title: normalizeToolRowText(text),
  };
}
