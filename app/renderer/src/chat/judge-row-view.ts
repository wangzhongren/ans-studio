/**
 * shell 判断结果行卡片（2026-10-25 UI 精修）。
 *
 * 只改渲染/样式：title/label 等视图字段语义不动；标题拆成主体 + 副标识两段渲染，
 * 但 textContent 仍逐字等于 view.title（完整信息不丢），aria-label 也保留全文。
 *
 * 无 JSX：node --test 可直接 react-dom/server 渲染断言。
 */

import { createElement, type ReactNode } from "react";
import { ChevronRight, ShieldCheck, ShieldX } from "lucide-react";
import type { Translator } from "../i18n/index.ts";
import { shortTime } from "./tool-summary.ts";
import type { ShellJudgeResultView } from "./judge.ts";
import { normalizeToolRowText } from "./tool-row-text.ts";

export interface ShellJudgeRowCardProps {
  view: ShellJudgeResultView;
  t: Translator;
}

/** 标题括号前缀拆分：「已替你放行（…）」→ 主体 + 包含括号的副标识。 */
export function splitJudgeTitle(title: string): { main: string; meta: string } {
  const match = /[（(]/.exec(title);
  if (!match || match.index <= 0 || !/[）)]\s*$/.test(title)) {
    return { main: title, meta: "" };
  }
  return {
    main: title.slice(0, match.index).replace(/^\s+/, ""),
    meta: title.slice(match.index),
  };
}

function detailSection(label: string | null, ...children: ReactNode[]) {
  return createElement(
    "section",
    { className: "sj-detail-section" },
    label ? createElement("p", { className: "sj-d-label" }, label) : null,
    ...children,
  );
}

function codeBlock(text: string) {
  return createElement(
    "pre",
    { className: "sj-pre" },
    createElement("code", null, text),
  );
}

/** 「替代方案：a\n替代方案：b」→ 去掉前缀后的列表项；单条也按列表渲染。 */
function alternativeItems(text: string, t: Translator): string[] {
  const prefix = t("ui.judge.alternative", { value: "" });
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith(prefix) ? line.slice(prefix.length).trim() : line,
    )
    .filter(Boolean);
}

export function ShellJudgeRowCard({ view, t }: ShellJudgeRowCardProps) {
  const allow = view.verdict === "allow";
  const title = splitJudgeTitle(view.title);
  const badgeLabel = t("ui.judge.titlePrefix", {
    label: t("ui.judge.mode.approval"),
  });
  const tierLabel = view.label || t("ui.judge.hardDenyLabel");
  const metaText = [
    view.engineText,
    view.operatorText,
    shortTime(view.at),
    view.tierText,
  ]
    .filter(Boolean)
    .join(" · ");
  const d = view.details;
  // deny 的判断理由/替代方案/客户说明已在展开区逐项渲染；这里只补 allow 的硬拒说明。
  const extraLines = view.verdict === "allow" ? view.lines : [];
  const alternativeList = d.alternative
    ? alternativeItems(d.alternative, t)
    : [];
  const evidenceItems = d.evidence.filter(
    (item) => normalizeToolRowText(item) !== normalizeToolRowText(d.command),
  );

  return createElement(
    "div",
    { className: "sys-text sj-body" },
    createElement(
      "div",
      { className: "sj-head" },
      createElement(
        "span",
        {
          className: "sj-verdict-icon " + (allow ? "is-allow" : "is-deny"),
          "aria-hidden": "true",
        },
        createElement(allow ? ShieldCheck : ShieldX, {
          size: 12,
          strokeWidth: 2,
        }),
      ),
      createElement(
        "span",
        { className: "sj-auto-badge " + (allow ? "is-allow" : "is-deny") },
        badgeLabel,
      ),
      createElement(
        "span",
        { className: "sj-title", "aria-label": view.title },
        createElement("strong", { className: "sj-title-main" }, title.main),
        title.meta
          ? createElement("span", { className: "sj-title-meta" }, title.meta)
          : null,
      ),
      view.denyOverride
        ? createElement("span", { className: "sj-tier-badge" }, tierLabel)
        : null,
    ),
    createElement(
      "div",
      {
        className: "sj-cmd" + (allow ? "" : " is-reason"),
        title: view.summary,
      },
      view.summary,
    ),
    createElement(
      "div",
      { className: "sj-foot" },
      createElement("div", { className: "sj-meta" }, metaText),
      createElement("details",
        { className: "sj-details" },
        createElement(
          "summary",
          null,
          createElement(ChevronRight, {
            className: "disclosure-chevron",
            size: 12,
            strokeWidth: 1.5,
            "aria-hidden": "true",
          }),
          t("ui.chatRow.judgeDetails"),
        ),
        createElement(
          "div",
          { className: "sj-details-body" },
          ...extraLines.map((line, index) =>
            createElement(
              "p",
              { className: "sj-detail-note", key: "line-" + index },
              line,
            ),
          ),
          view.retryHint
            ? createElement("p", { className: "sj-exit" }, view.retryHint)
            : null,
          d.command
            ? detailSection(
                t("ui.chatRow.commandOriginal"),
                codeBlock(d.command),
              )
            : null,
          d.reason
            ? detailSection(
                t("ui.judge.reasonLine", { reason: "" }),
                createElement("p", { className: "sj-d-value" }, d.reason),
              )
            : null,
          alternativeList.length > 0
            ? detailSection(
                t("ui.judge.alternative", { value: "" }),
                createElement(
                  "ul",
                  { className: "sj-list" },
                  ...alternativeList.map((item, index) =>
                    createElement("li", { key: "alternative-" + index }, item),
                  ),
                ),
              )
            : null,
          d.customerMessage
            ? createElement(
                "div",
                { className: "sj-callout" },
                createElement(
                  "p",
                  { className: "sj-d-label" },
                  t("ui.chatRow.customerMessage", { message: "" }),
                ),
                createElement(
                  "p",
                  { className: "sj-d-value" },
                  d.customerMessage,
                ),
                d.customerMessageSynthesized
                  ? createElement(
                      "p",
                      { className: "sj-detail-note" },
                      t("ui.chatRow.customerMessageNote"),
                    )
                  : null,
              )
            : d.customerMessageSynthesized
              ? createElement(
                  "p",
                  { className: "sj-detail-note" },
                  t("ui.chatRow.customerMessageNote"),
                )
              : null,
          d.cwd || d.toolCallId || evidenceItems.length > 0
            ? detailSection(
                t("ui.chatRow.evidence"),
                d.cwd || d.toolCallId
                  ? createElement(
                      "dl",
                      { className: "sj-kv-grid" },
                      d.cwd
                        ? createElement(
                            "div",
                            null,
                            createElement("dt", null, "cwd"),
                            createElement("dd", null, d.cwd),
                          )
                        : null,
                      d.toolCallId
                        ? createElement(
                            "div",
                            null,
                            createElement("dt", null, "toolCallId"),
                            createElement("dd", null, d.toolCallId),
                          )
                        : null,
                    )
                  : null,
                evidenceItems.length > 0
                  ? createElement(
                      "ul",
                      { className: "sj-list" },
                      ...evidenceItems.map((item, index) =>
                        createElement("li", { key: "evidence-" + index }, item),
                      ),
                    )
                  : null,
              )
            : null,
          d.hardDenyOverride
            ? createElement(
                "p",
                { className: "sj-detail-note" },
                t("ui.chatRow.hardDenyOverride"),
              )
            : null,
        ),
      ),
    ),
  );
}
