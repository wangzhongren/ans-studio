/**
 * 低层 run-change 纯逻辑（2026-10-31；2026-11-04 U1 收口）。
 *
 * P1.6/G11：低层 run-change API 保留，但**客户侧 UI 入口已由「版本变更」/「主干升级」取代**
 * （`#run-change` 按钮与按钮级状态已删除）。本模块只保留低层内部/回执用途：
 * · `pinnedRunsOf`：从 `listProject.activeRuns` 摘要里挑 pinned（低层内部判据）；
 * · `runChangeReplyMessage`：显式调用回执 → 一行（人话）。
 * 不新增第二套按钮状态源；不读盘、不猜 pin 状态、不伪造可用。
 * 文案全部走共享 i18n（zh-CN/en-US 同 key）；`runId`/`flowId` 等数据不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import type { ActiveRunSummary } from "./types.ts";

/** 从 active run 摘要里挑出 pinned 的（顺序保持主进程给的 createdAt 顺序）。 */
export function pinnedRunsOf(runs: ActiveRunSummary[] | undefined): ActiveRunSummary[] {
  return (runs ?? []).filter((run) => run !== null && typeof run === "object" && run.state === "pinned");
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
