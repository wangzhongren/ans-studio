/**
 * 「契约变更 · 重开 run」入口纯逻辑（2026-10-31 run-change 触发缺陷）。
 *
 * - 按钮是否可见/可用只由**主进程事实**决定：`listProject.activeRuns`（pinned run 摘要）与
 *   preload 是否暴露 `requestRunChange`；本模块不读盘、不猜 pin 状态、不伪造可用。
 * - 无 pinned run ⇒ 禁用并给原因；多个 pinned run ⇒ 禁用（无法确定变更对象）；
 *   旧主进程/桥缺省 ⇒ 禁用并说明。
 * - 文案全部走共享 i18n（zh-CN/en-US 同 key）；`runId`/`flowId` 等数据不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import type { ActiveRunSummary } from "./types.ts";

export interface RunChangeButtonView {
  visible: boolean;
  enabled: boolean;
  label: string;
  /** 悬停说明（可用时给用法；禁用时给原因）。 */
  title: string;
  /** 禁用原因（`enabled === false` 时存在；供 title/aria 使用）。 */
  disabledReason?: string;
}

export interface RunChangeButtonInput {
  /** preload 是否暴露 `requestRunChange`（旧主进程 ⇒ false）。 */
  bridgeAvailable: boolean;
  /** `listProject.activeRuns`（旧 main 缺省 ⇒ []）。 */
  runs: ActiveRunSummary[] | undefined;
  /** 主进程 manifest 读取失败原因（有值时禁用并如实显示）。 */
  runsError?: string | null;
}

/** 从 active run 摘要里挑出 pinned 的（顺序保持主进程给的 createdAt 顺序）。 */
export function pinnedRunsOf(runs: ActiveRunSummary[] | undefined): ActiveRunSummary[] {
  return (runs ?? []).filter((run) => run !== null && typeof run === "object" && run.state === "pinned");
}

export function runChangeButtonView(
  input: RunChangeButtonInput,
  locale: Locale = DEFAULT_LOCALE,
): RunChangeButtonView {
  const label = translate(locale, "ui.runChange.entry");
  if (!input.bridgeAvailable) {
    const disabledReason = translate(locale, "ui.runChange.disabledUnavailable");
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  if (typeof input.runsError === "string" && input.runsError !== "") {
    const disabledReason = translate(locale, "ui.runChange.disabledUnknown", { detail: input.runsError });
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  const pinned = pinnedRunsOf(input.runs);
  if (pinned.length === 0) {
    const disabledReason = translate(locale, "ui.runChange.disabledNoRun");
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  if (pinned.length > 1) {
    const disabledReason = translate(locale, "ui.runChange.disabledMultipleRuns", {
      runs: pinned.map((run) => run.flowId).join(", "),
    });
    return { visible: true, enabled: false, label, title: disabledReason, disabledReason };
  }
  const hint = translate(locale, "ui.runChange.entryHint");
  return { visible: true, enabled: true, label, title: hint };
}

/** 显式入口回执 → 一行（人话）结果；未知形状如实报「失败」，不假装成功。 */
export function runChangeReplyMessage(reply: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const record = reply !== null && typeof reply === "object" ? (reply as Record<string, unknown>) : {};
  if (record.ok !== true) {
    const detail = typeof record.error === "string" && record.error !== "" ? record.error : "unknown";
    return translate(locale, "ui.runChange.failed", { detail });
  }
  const status = record.status;
  if (status === "presented") return translate(locale, "ui.runChange.presented");
  if (status === "pending") return translate(locale, "ui.runChange.pending");
  if (status === "declined") return translate(locale, "ui.runChange.declined");
  if (status === "answered") {
    const mode = record.mode;
    if (mode === "continue-frozen") return translate(locale, "ui.runChange.answeredContinueFrozen");
    if (mode === "stop-and-restart") return translate(locale, "ui.runChange.answeredStopAndRestart");
    if (mode === "stop") return translate(locale, "ui.runChange.answeredStop");
    return translate(locale, "ui.runChange.answeredOther");
  }
  return translate(locale, "ui.runChange.answeredOther");
}
