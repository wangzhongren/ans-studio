// 客户指令标记纯解析器（customer-directive/v1，2026-11-03 A1 冻结）。
//
// 唯一规则来源：客户确认方案 P1.1 §3.1 第 1–6 条。本文件**零依赖**（无模块导入、不读盘、不依赖 Node），
// 可被主进程与渲染侧相对导入；渲染侧只用于回显抑制，主进程才是权威识别点。
// 第 7 条「带图拒绝」不是解析器职责：解析器只接收文本；调用方在命中且图片非空时拒绝。
// 本文件不复制第二份识别实现，也未启用英文别名/全角 `＠`（O5 未实施）。

export type DirectiveMarkerTarget = "approval" | "decision";

export interface DirectiveMarkerHit {
  readonly target: DirectiveMarkerTarget;
  readonly body: string;
}

const APPROVAL_MARKER = "@审批";
const DECISION_MARKER = "@决策";
const WHITESPACE = /\s/;

/**
 * 解析文本开头的客户指令标记。
 *
 * 规则（方案 §3.1）：
 * 1. 跳过开头 Unicode 空白（JS `\s`，含空格、制表符、换行、全角空格 `　`）；首个非空白位置必须是
 *    `@审批` 或 `@决策`。
 * 2. 标记后必须是空白（同 `\s`）或文本结束；`@审批员`、`@审批-允许`、`@审批，允许`、`@决策X` 不命中。
 * 3. 只检查开头；命中后其余全部为正文（可跨行），正文中出现 `@审批`/`@决策` 不触发第二次识别。
 * 4. 半角 `@`；全角 `＠` 与 `@approval`/`@decision` 不命中。
 * 5. `@边界` 不命中。
 * 6. 空正文（仅空白）仍命中，`body === ""`（面板留空、确认禁用）；不静默忽略。
 *
 * 非字符串入参返回 `undefined`，不抛错。`body` 是标记后文本的 `trim()` 结果，只是面板预填建议；
 * 审计原文由调用方保存完整 `rawText`。
 */
export function parseDirectiveMarker(text: string): DirectiveMarkerHit | undefined {
  if (typeof text !== "string") return undefined;

  let index = 0;
  while (index < text.length && WHITESPACE.test(text.charAt(index))) {
    index += 1;
  }

  const rest = text.slice(index);
  let target: DirectiveMarkerTarget;
  let markerLength: number;
  if (rest.startsWith(APPROVAL_MARKER)) {
    target = "approval";
    markerLength = APPROVAL_MARKER.length;
  } else if (rest.startsWith(DECISION_MARKER)) {
    target = "decision";
    markerLength = DECISION_MARKER.length;
  } else {
    return undefined;
  }

  const next = rest.charAt(markerLength);
  if (next !== "" && !WHITESPACE.test(next)) return undefined;

  return { target, body: rest.slice(markerLength).trim() };
}
