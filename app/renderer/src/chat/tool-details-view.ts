/**
 * 工具行展开详情（2026-10-25）：阶段时间线、命令去重、stdout/stderr 分区与长输出折叠。
 *
 * 与 shell 判断卡详情共用 `.sj-detail-section` / `.sj-d-label` / `.sj-pre` 样式。
 * 无 JSX：node --test 可直接渲染断言；不改折叠行 summary / 数据字段。
 */

import { createElement, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  DEFAULT_LOCALE,
  translate,
  type Locale,
  type Translator,
} from "../i18n/index.ts";
import type { ActivityItem } from "./types.ts";
import { activityPhaseLabel, shortTime } from "./tool-summary.ts";
import { metadataLabel, textFlags } from "./report-view.ts";
import { normalizeToolRowText } from "./tool-row-text.ts";

export interface ToolDetailText {
  text: string;
  redacted: boolean;
  truncated: boolean;
}

export interface ToolDetailStage {
  at: string;
  label: string;
  status: string;
}

export interface ToolDetailsModel {
  stages: ToolDetailStage[];
  timeline: string;
  commands: string[];
  fileTargets: string[];
  error: ToolDetailText | null;
  resultText: ToolDetailText | null;
  stdout: ToolDetailText | null;
  stderr: ToolDetailText | null;
  exitCode: number | null;
  signal: string;
  durationMs: number | null;
  omissions: string[];
  notes: string[];
  hasDisplay: boolean;
  supported: boolean;
  unsupported: boolean;
  noFileTarget: boolean;
}

export interface ToolOutputSplit {
  first: string;
  rest: string;
  totalLines: number;
  hiddenLines: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readTextField(value: unknown): ToolDetailText | null {
  const record = asRecord(value);
  const text = asString(record.text);
  if (text === "") return null;
  return {
    text,
    redacted: record.redacted === true,
    truncated: record.truncated === true,
  };
}

function mergeText(
  current: ToolDetailText | null,
  next: ToolDetailText | null,
): ToolDetailText | null {
  if (!next) return current;
  if (!current) return next;
  if (current.text.includes(next.text)) {
    return {
      text: current.text,
      redacted: current.redacted || next.redacted,
      truncated: current.truncated || next.truncated,
    };
  }
  if (next.text.includes(current.text)) {
    return {
      text: next.text,
      redacted: current.redacted || next.redacted,
      truncated: current.truncated || next.truncated,
    };
  }
  return {
    text: current.text + "\n" + next.text,
    redacted: current.redacted || next.redacted,
    truncated: current.truncated || next.truncated,
  };
}

function pushUnique(list: string[], value: string): void {
  if (value !== "" && !list.includes(value)) list.push(value);
}

/** stdout/stderr 尾行折叠：默认显示前 maxLines 行，其余进展开区。 */
export function splitToolOutput(
  text: string,
  maxLines = 12,
): ToolOutputSplit {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const limit = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : 12;
  if (lines.length <= limit) {
    return {
      first: lines.join("\n"),
      rest: "",
      totalLines: lines.length,
      hiddenLines: 0,
    };
  }
  return {
    first: lines.slice(0, limit).join("\n"),
    rest: lines.slice(limit).join("\n"),
    totalLines: lines.length,
    hiddenLines: lines.length - limit,
  };
}

export function toolDetailsModel(
  items: readonly ActivityItem[],
  locale: Locale = DEFAULT_LOCALE,
): ToolDetailsModel {
  const stages: ToolDetailStage[] = [];
  const commands: string[] = [];
  const fileTargets: string[] = [];
  const omissions: string[] = [];
  const notes: string[] = [];
  let error: ToolDetailText | null = null;
  let resultText: ToolDetailText | null = null;
  let stdout: ToolDetailText | null = null;
  let stderr: ToolDetailText | null = null;
  let exitCode: number | null = null;
  let signal = "";
  let durationMs: number | null = null;
  let hasDisplay = false;
  let supported = false;
  let unsupported = false;

  for (const item of items) {
    const at = asString(item.at);
    let label =
      asString(item.label) ||
      asString(item.statusText) ||
      activityPhaseLabel(item, locale);
    const statusLabel = activityPhaseLabel(item, locale);
    if (
      (item.status === "failed" ||
        item.status === "denied" ||
        item.status === "timed-out") &&
      !label.includes(statusLabel)
    ) {
      label = [label, statusLabel].filter(Boolean).join(" · ");
    }
    stages.push({ at, label, status: asString(item.status) });
    if (item.hasDisplay === true) hasDisplay = true;
    if (item.displayUnsupported === true) {
      unsupported = true;
      continue;
    }
    const display = asRecord(item.display);
    if (Object.keys(display).length === 0) continue;
    supported = true;

    const target = asRecord(display.target);
    const targetValue = asRecord(target.value);
    const targetText = asString(targetValue.text);
    if (targetText !== "") {
      if (target.kind === "command") pushUnique(commands, targetText);
      else pushUnique(fileTargets, targetText);
    }

    error = mergeText(error, readTextField(display.error));
    resultText = mergeText(resultText, readTextField(display.resultText));
    const process = asRecord(display.process);
    if (typeof process.exitCode === "number" && Number.isFinite(process.exitCode)) {
      exitCode = process.exitCode;
    }
    if (asString(process.signal) !== "") signal = asString(process.signal);
    if (
      typeof process.durationMs === "number" &&
      Number.isFinite(process.durationMs)
    ) {
      durationMs = process.durationMs;
    }
    stdout = mergeText(stdout, readTextField(process.stdout));
    stderr = mergeText(stderr, readTextField(process.stderr));

    for (const omission of Array.isArray(display.omissions) ? display.omissions : []) {
      if (typeof omission === "string" && omission !== "") {
        pushUnique(omissions, omission);
      }
    }
    if (item.legacyStatusSource === "legacy-classifier") {
      pushUnique(notes, translate(locale, "ui.chatRow.legacyStatusSource"));
    }
    pushUnique(notes, metadataLabel(item.metadataOmissions, locale));
    pushUnique(notes, textFlags(item.legacyTextProjection, locale));
  }

  // 命令只出现一次；结果文本若与命令/输出完全重复则不再贴一遍。
  const dedupe = new Set(
    [...commands, stdout?.text || "", stderr?.text || "", error?.text || ""]
      .map((text) => normalizeToolRowText(text))
      .filter(Boolean),
  );
  if (resultText) {
    const result = normalizeToolRowText(resultText.text);
    const outputText = [stdout?.text || "", stderr?.text || ""]
      .map((text) => normalizeToolRowText(text))
      .filter(Boolean);
    if (
      dedupe.has(result) ||
      outputText.some((output) => output !== "" && result.includes(output))
    ) {
      resultText = null;
    }
  }

  const segments = stages
    .map((stage) => {
      const text = [shortTime(stage.at), stage.label].filter(Boolean).join(" ");
      return text;
    })
    .filter(Boolean);
  let timeline = segments.join(" → ");
  if (exitCode !== null) {
    timeline += (timeline ? " · " : "") + "exit " + exitCode;
  }

  return {
    stages,
    timeline,
    commands,
    fileTargets,
    error,
    resultText,
    stdout,
    stderr,
    exitCode,
    signal,
    durationMs,
    omissions,
    notes: [...new Set(notes)],
    hasDisplay,
    supported,
    unsupported,
    noFileTarget: supported && commands.length === 0 && fileTargets.length === 0,
  };
}

function detailSection(
  label: ReactNode,
  ...children: ReactNode[]
) {
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

function flagsFor(field: ToolDetailText, locale: Locale): string {
  return textFlags(
    { redacted: field.redacted, truncated: field.truncated },
    locale,
  );
}

function OutputSection({
  label,
  field,
  stderr,
  t,
  locale,
}: {
  label: string;
  field: ToolDetailText;
  stderr: boolean;
  t: Translator;
  locale: Locale;
}) {
  const split = splitToolOutput(field.text);
  const flags = flagsFor(field, locale);
  return createElement(
    "section",
    {
      className: "sj-detail-section tool-output" + (stderr ? " is-stderr" : ""),
      "data-stream": stderr ? "stderr" : "stdout",
      "data-lines": split.totalLines,
    },
    createElement(
      "p",
      { className: "sj-d-label" },
      createElement("span", null, label),
      createElement(
        "span",
        { className: "tool-line-count", title: String(split.totalLines) },
        split.totalLines,
      ),
      flags ? createElement("span", { className: "projection-flags" }, flags) : null,
    ),
    codeBlock(split.first),
    split.hiddenLines > 0
      ? createElement(
          "details",
          { className: "tool-output-more" },
          createElement(
            "summary",
            null,
            createElement(ChevronRight, {
              className: "disclosure-chevron",
              size: 12,
              strokeWidth: 1.5,
              "aria-hidden": "true",
            }),
            createElement("span", null, t("ui.queue.expand")),
            createElement(
              "span",
              { className: "tool-output-more-count" },
              "+" + split.hiddenLines,
            ),
          ),
          codeBlock(split.rest),
        )
      : null,
  );
}

export function ToolDetailsView({
  items,
  t,
  locale,
}: {
  items: ActivityItem[];
  t: Translator;
  locale: Locale;
}) {
  const model = toolDetailsModel(items, locale);
  if (!model.hasDisplay) {
    return createElement(
      "p",
      { className: "sj-detail-note" },
      t("ui.chatRow.noDetails"),
    );
  }
  if (!model.supported && model.unsupported) {
    return createElement(
      "p",
      { className: "sj-detail-note" },
      t("ui.chatRow.unsupportedDetail"),
    );
  }

  const omissionLabels = model.omissions.map((reason) => {
    if (reason === "budget") return t("ui.chatRow.budgetOmitted");
    if (reason === "unsupported-content") return t("ui.chatRow.nonTextResult");
    return t("ui.chatRow.unsupportedInput");
  });
  const processMeta = [
    model.exitCode !== null
      ? t("ui.chatRow.exitCode", { code: model.exitCode })
      : "",
    model.signal ? t("ui.chatRow.signal", { signal: model.signal }) : "",
    model.durationMs !== null
      ? t("ui.chatRow.duration", { ms: model.durationMs })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return createElement(
    "div",
    { className: "sj-details-body tool-details-structured" },
    model.timeline
      ? createElement(
          "div",
          {
            className: "tool-detail-timeline",
            "data-stages": model.stages.length,
          },
          model.timeline,
        )
      : null,
    ...model.commands.map((command) =>
      detailSection(t("ui.chatRow.actualCommand"), codeBlock(command)),
    ),
    model.fileTargets.length > 0
      ? detailSection(
          t("ui.chatRow.targetFile"),
          createElement(
            "p",
            { className: "sj-d-value" },
            model.fileTargets.join(locale === "zh-CN" ? "、" : ", "),
          ),
        )
      : null,
    processMeta
      ? createElement("p", { className: "sj-kv tool-process-meta" }, processMeta)
      : null,
    model.error
      ? detailSection(
          createElement(
            "span",
            null,
            t("ui.chatRow.error"),
            flagsFor(model.error, locale)
              ? createElement(
                  "span",
                  { className: "projection-flags" },
                  flagsFor(model.error, locale),
                )
              : null,
          ),
          createElement(
            "pre",
            { className: "sj-pre tool-error-block" },
            createElement("code", null, model.error.text),
          ),
        )
      : null,
    model.resultText
      ? detailSection(
          createElement(
            "span",
            null,
            t("ui.chatRow.result"),
            flagsFor(model.resultText, locale)
              ? createElement(
                  "span",
                  { className: "projection-flags" },
                  flagsFor(model.resultText, locale),
                )
              : null,
          ),
          codeBlock(model.resultText.text),
        )
      : null,
    model.stdout
      ? createElement(OutputSection, {
          key: "stdout",
          label: t("ui.chatRow.stdout"),
          field: model.stdout,
          stderr: false,
          t,
          locale,
        })
      : null,
    model.stderr
      ? createElement(OutputSection, {
          key: "stderr",
          label: t("ui.chatRow.stderr"),
          field: model.stderr,
          stderr: true,
          t,
          locale,
        })
      : null,
    model.noFileTarget
      ? createElement(
          "p",
          { className: "sj-detail-note" },
          t("ui.chatRow.noFileTargetDetail"),
        )
      : null,
    omissionLabels.length > 0
      ? createElement(
          "p",
          { className: "sj-detail-note" },
          omissionLabels.join(locale === "zh-CN" ? "；" : "; "),
        )
      : null,
    ...model.notes.map((note, index) =>
      createElement("p", { className: "sj-detail-note", key: "note-" + index }, note),
    ),
  );
}
