/**
 * 工具失败卡片的展示组件（无 JSX，便于 node --test 直接渲染断言）。
 *
 * 结构：
 *  - `ToolErrorSummary`：`<summary>` 只含时间/工具名/目标/失败徽标/一行原因；
 *    原因已在纯函数层截断，fullText 只进 title（悬停追溯），不铺进可见文本。
 *  - `ToolErrorFullEntry`：展开区内嵌 `<details>`，承载无法从 display 详情取得的完整原文。
 *
 * 颜色只用 index.css 令牌（`.tool-call-record[data-failed="true"]` 等样式在 shell.css）。
 */

import { createElement } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

export interface ToolErrorSummaryProps {
  timeText: string;
  timeTitle?: string;
  toolName: string;
  target?: string;
  targetTitle?: string;
  /** 失败状态文案（沿用旧 `.tool-call-status` 契约，例如「调用发起 → 执行失败」）。 */
  statusLabel: string;
  /** 失败状态语义类（failed / timed-out …），与既有 danger 色彩语义一致。 */
  statusClass?: string;
  /** 已截断的一行原因。 */
  reason: string;
}

/** 失败工具行的 `<summary>`（紧凑单行卡片）。 */
export function ToolErrorSummary(props: ToolErrorSummaryProps) {
  return createElement(
    "summary",
    { className: "tool-error-summary" },
    createElement(
      "span",
      {
        className: "tool-call-time",
        title: props.timeTitle || undefined,
      },
      props.timeText,
    ),
    createElement("strong", null, props.toolName),
    props.target
      ? createElement("span", {
          className: "tool-call-target",
          title: props.targetTitle || undefined,
        }, props.target)
      : null,
    createElement(
      "span",
      {
        className:
          "tool-call-status " + (props.statusClass || "failed"),
        title: props.statusLabel,
      },
      createElement(AlertTriangle, {
        size: 11,
        strokeWidth: 1.75,
        "aria-hidden": "true",
      }),
      createElement(
        "span",
        { className: "tool-call-status-text" },
        props.statusLabel,
      ),
    ),
    props.reason
      ? createElement(
          "span",
          { className: "tool-error-reason" },
          props.reason,
        )
      : null,
  );
}

export interface ToolErrorFullEntryProps {
  /** 入口文案（当前复用既有中性 key `ui.chatRow.error`）。 */
  label: string;
  text: string;
}

/** 展开区内的「完整错误」入口；不新增弹窗。 */
export function ToolErrorFullEntry(props: ToolErrorFullEntryProps) {
  return createElement(
    "details",
    { className: "tool-error-full" },
    createElement(
      "summary",
      null,
      createElement(ChevronRight, {
        className: "disclosure-chevron",
        size: 12,
        strokeWidth: 1.5,
        "aria-hidden": "true",
      }),
      createElement("span", { className: "tool-error-full-label" }, props.label),
    ),
    createElement("pre", { className: "tool-error-full-text" }, props.text),
  );
}
