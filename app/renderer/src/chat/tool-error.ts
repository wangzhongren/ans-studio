/**
 * 工具失败原因归一化（纯函数，无 DOM/存储依赖）。
 *
 * 目标：summary 里只放一行可扫读的原因，不再把上千字的嵌套错误原文铺进折叠行。
 * 完整原文由展开区（已有 display 详情或 `ToolErrorFullEntry`）承载。
 *
 * 提取规则（按顺序）：
 *  1. 归一空白（多行折成单行）；
 *  2. 去掉重复的工具名前缀；
 *  3. 去掉「执行失败」「失败」「failed」等状态词前缀（仅当其后紧跟分隔符/括号）；
 *  4. 去掉整体包裹的嵌套括号；
 *  5. 取最内层「原因：…」段落，剥掉包装括号与未闭合的尾部右括号；
 *  6. 若「原因：」后是「客户拒绝（具体原因）→ …」这类短包装词，取括号内的具体原因；
 *  7. 无法解析时回退首句；
 *  8. 截断到 maxLength（默认 72，含省略号）。
 */

import { DEFAULT_LOCALE, translate } from "../i18n/index.ts";
import type { ActivityItem } from "./types.ts";

const DEFAULT_MAX_LENGTH = 72;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 解析用词汇来自既有 i18n key（DEFAULT_LOCALE 保证 agent 中文原文仍可识别）。 */
const FAILED_LABEL = translate(DEFAULT_LOCALE, "ui.tool.status.failed");
const FAILED_WORD = translate(DEFAULT_LOCALE, "shared.common.failed");
const REJECT_LABEL = translate(DEFAULT_LOCALE, "ui.chatRow.rejectAction");
const ERROR_LABEL = translate(DEFAULT_LOCALE, "ui.chatRow.error");
/**
 * 旧版工具结果里可能出现的状态/包装词；无对应 i18n key（内部解析词汇，非 UI 文案），
 * 用 Unicode 转义保留语义：调用失败 / 执行错误 / 不同意 / 未同意 / 未通过 / 异常 / 原因。
 */
const LEGACY_STATUS_WORDS: readonly string[] = [
  "\u8c03\u7528\u5931\u8d25",
  "\u6267\u884c\u9519\u8bef",
];
const LEGACY_WRAPPER_WORDS: readonly string[] = [
  "\u4e0d\u540c\u610f",
  "\u672a\u540c\u610f",
  "\u672a\u901a\u8fc7",
  "\u5f02\u5e38",
];
const REASON_MARKER = "\u539f\u56e0";

/** 状态词前缀；只有后接分隔符/括号/结尾才剥离，避免误伤普通句子。 */
const STATUS_PREFIX = new RegExp(
  "^(?:" +
    [FAILED_LABEL, ...LEGACY_STATUS_WORDS, FAILED_WORD, "failed", "failure", "error"]
      .map(escapeRegExp)
      .join("|") +
    ")(?=$|[\\s：:（(])",
  "i",
);

/** 「客户拒绝（…）」「自动审批未通过（…）」这类包装词（末尾命中即可）。 */
const WRAPPER_LABEL = new RegExp(
  "(?:" +
    [
      REJECT_LABEL,
      ...LEGACY_WRAPPER_WORDS,
      FAILED_WORD,
      ERROR_LABEL,
      REASON_MARKER,
      "denied",
      "rejected",
      "failed",
      "error",
    ]
      .map(escapeRegExp)
      .join("|") +
    ")$",
  "i",
);

/** 空白归一：保留展示所需的最小间距，多行折成一行。 */
export function normalizeToolErrorText(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/** 找到 `openIndex` 处括号的匹配右括号下标；找不到返回 -1（中英文括号视为同一族）。 */
function findMatchingClose(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "（" || char === "(") depth += 1;
    else if (char === "）" || char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 去掉整体包裹的括号：`（abc）` → `abc`（可多层）。 */
function unwrapFullyWrapped(text: string): string {
  let result = text.trim();
  for (let round = 0; round < 8; round += 1) {
    if (!/^[（(]/.test(result)) break;
    const close = findMatchingClose(result, 0);
    if (close !== result.length - 1) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

/** 截到第一个未闭合右括号处：它关闭的是「原因：」之外的包装层，其后是外层说明。 */
function cutAtUnmatchedCloser(text: string): string {
  const value = text.trim();
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "（" || char === "(") depth += 1;
    else if (char === "）" || char === ")") {
      depth -= 1;
      if (depth < 0) return value.slice(0, index).trim();
    }
  }
  return value;
}

/** 去掉重复的工具名前缀（`request_choice request_choice 执行失败`）。 */
function stripLeadingToolName(text: string, toolName: string): string {
  const name = String(toolName ?? "").trim();
  if (!name) return text;
  let result = text.trim();
  for (let round = 0; round < 8; round += 1) {
    if (!result.startsWith(name)) break;
    const rest = result.slice(name.length);
    if (rest === "") return "";
    if (!/^[\s：:（(·—–-]/.test(rest)) break;
    result = rest.replace(/^[\s：:·—–-]+/, "");
  }
  return result;
}

/** 去掉状态词前缀（`执行失败（…` 只去掉状态词，保留后续括号结构）。 */
function stripLeadingStatus(text: string): string {
  let result = text.trim();
  for (let round = 0; round < 4; round += 1) {
    const match = STATUS_PREFIX.exec(result);
    if (!match) break;
    result = result.slice(match[0].length).replace(/^[\s：:·—–-]+/, "");
  }
  return result;
}

/** `客户拒绝（具体原因）→ 说明` → 取括号内的具体原因。 */
function unwrapShortLabelWrapper(text: string): string {
  let result = text.trim();
  for (let round = 0; round < 4; round += 1) {
    const open = result.search(/[（(]/);
    if (open <= 0) break;
    const prefix = result.slice(0, open).trim();
    if (prefix.length > 16 || !WRAPPER_LABEL.test(prefix)) break;
    const close = findMatchingClose(result, open);
    if (close < 0) {
      // 原文被截断、右括号不在文本内：仍剥掉「客户拒绝（」这类包装词。
      const inner = result.slice(open + 1).trim();
      if (inner === "") break;
      result = inner;
      continue;
    }
    const suffix = result.slice(close + 1).trim();
    if (suffix !== "" && !/^[→；;，,。.]/.test(suffix)) break;
    const inner = result.slice(open + 1, close).trim();
    if (inner === "") break;
    result = inner;
  }
  return result;
}

/** 首句回退（只认中文句号/叹号/问号，避免把路径里的英文句点切断）。 */
function firstSentence(text: string): string {
  const match = /^[^。！？]*[。！？]/.exec(text.trim());
  if (match) {
    const sentence = match[0].replace(/[。！？]+$/, "").trim();
    if (sentence !== "") return sentence;
  }
  return text.trim();
}

/** 截断到 maxLength（含省略号）。 */
export function truncateToolErrorReason(
  text: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  const value = String(text ?? "").trim();
  const limit =
    Number.isFinite(maxLength) && maxLength > 0
      ? Math.floor(maxLength)
      : DEFAULT_MAX_LENGTH;
  if (value.length <= limit) return value;
  return value.slice(0, Math.max(1, limit - 1)) + "…";
}

export interface ToolErrorReasonOptions {
  toolName?: string;
  maxLength?: number;
}

/** 从失败原文提取一行人类可读原因；无法解析时回退首句/首行。 */
export function extractToolErrorReason(
  text: string,
  options: ToolErrorReasonOptions = {},
): string {
  const maxLength =
    Number.isFinite(options.maxLength) && (options.maxLength as number) > 0
      ? Math.floor(options.maxLength as number)
      : DEFAULT_MAX_LENGTH;
  let work = normalizeToolErrorText(text);
  if (!work) return "";
  work = stripLeadingToolName(work, options.toolName || "");
  work = stripLeadingStatus(work);
  work = stripLeadingToolName(work, options.toolName || "");
  work = unwrapFullyWrapped(work);
  work = stripLeadingToolName(work, options.toolName || "");
  work = stripLeadingStatus(work);

  let candidate = "";
  const marker = Math.max(
    work.lastIndexOf(REASON_MARKER + "："),
    work.lastIndexOf(REASON_MARKER + ":"),
  );
  if (marker >= 0) {
    candidate = work.slice(marker + 3).trim();
    candidate = cutAtUnmatchedCloser(candidate);
    candidate = unwrapFullyWrapped(candidate);
    candidate = unwrapShortLabelWrapper(candidate);
    candidate = cutAtUnmatchedCloser(candidate);
  }
  if (!candidate) {
    candidate = unwrapFullyWrapped(work);
    candidate = unwrapShortLabelWrapper(candidate);
    candidate = cutAtUnmatchedCloser(candidate);
    candidate = firstSentence(candidate);
  }
  candidate = candidate.replace(/\*\*/g, "").trim();
  if (!candidate) return "";
  return truncateToolErrorReason(candidate, maxLength);
}

/**
 * 失败行的完整原文：优先 visibleSummary（旧 summary 直显文本），
 * 若 summary 更长且包含它，则用完整 summary（多行错误不丢内容）。
 */
export function toolFailureFullText(
  activity: Pick<ActivityItem, "summary" | "visibleSummary">,
): string {
  const visible =
    typeof activity.visibleSummary === "string" ? activity.visibleSummary.trim() : "";
  const summary = typeof activity.summary === "string" ? activity.summary.trim() : "";
  if (visible && summary && summary.length > visible.length && summary.includes(visible)) {
    return summary;
  }
  return visible || summary;
}

function pushFieldText(field: unknown, out: string[]): void {
  if (!field || typeof field !== "object") return;
  const text = (field as Record<string, unknown>).text;
  if (typeof text === "string" && text.trim() !== "") out.push(text);
}

/**
 * 展开详情（`ToolDetails`）是否已经渲染了完整失败文本。
 * 只为避免重复全文：命中时不再新增 `ToolErrorFullEntry`。
 *
 * 判定：详情文本包含完整原文，或包含归一化后的一行原因（≥12 字符）。
 * 后者覆盖「详情保存的错误原文比 visibleSummary 更完整、但前缀包装不同」的情况。
 */
export function toolDetailsContainText(
  items: ActivityItem[],
  fullText: string,
  reason: string = "",
): boolean {
  const needles: string[] = [];
  const full = normalizeToolErrorText(fullText);
  if (full) needles.push(full);
  const reasonBody = normalizeToolErrorText(reason).replace(/…$/, "");
  if (reasonBody.length >= 12) needles.push(reasonBody);
  if (needles.length === 0) return false;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const display =
      item.display && typeof item.display === "object"
        ? (item.display as Record<string, unknown>)
        : null;
    if (!display) continue;
    const texts: string[] = [];
    pushFieldText(display.error, texts);
    pushFieldText(display.resultText, texts);
    const target = display.target as Record<string, unknown> | undefined;
    if (target) pushFieldText(target.value, texts);
    const process = display.process as Record<string, unknown> | undefined;
    if (process) {
      pushFieldText(process.stdout, texts);
      pushFieldText(process.stderr, texts);
    }
    for (const text of texts) {
      const normalized = normalizeToolErrorText(text);
      if (needles.some((needle) => normalized.includes(needle))) return true;
    }
  }
  return false;
}
