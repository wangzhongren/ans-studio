/**
 * 报告 / 持久化 / 交付回执的纯映射（Phase 4B）。
 *
 * 只转写主进程给出的事实：报告身份（reportId + 来源角色/引擎）、持久化状态、
 * 交付批次回执与安全显示副本 flags。不根据助手正文/工具输出造报告；不把
 * 「已保存」说成独立验收或「全部收齐」。
 *
 * i18n B2：展示文案来自 shared `ui.reportView.*`/`ui.reportCard.*`，纯函数接受
 * 可选 `locale`（默认 zh-CN）。reportId/roleId/时间等机器值不翻译。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export function asReportRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function asReportText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 句间/列表连接符（结构标点，不是文案；zh 与旧实现逐字一致）。 */
function clauseSeparator(locale: Locale): string {
  return locale === "zh-CN" ? "；" : "; ";
}

/** 文本投影 flags（旧 `ANSRuntimeUI.textFlags` 同口径）。 */
export function textFlags(value: unknown, locale: Locale = DEFAULT_LOCALE): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [
    record.redacted ? translate(locale, "shared.common.redacted") : "",
    record.truncated ? translate(locale, "shared.common.truncated") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const METADATA_LABEL_KEYS: Record<string, MessageKey> = {
  timestamp: "ui.reportView.provenance.timestamp",
  "anchor-token": "ui.reportView.provenance.anchorToken",
  "oversize-identity": "ui.reportView.provenance.oversize",
};

/** 历史元数据省略项（旧 `metadataLabel` 逐字）。 */
export function metadataLabel(omissions: unknown, locale: Locale = DEFAULT_LOCALE): string {
  if (!Array.isArray(omissions)) return "";
  return omissions
    .map((key) => {
      const messageKey = typeof key === "string" ? METADATA_LABEL_KEYS[key] : undefined;
      return messageKey === undefined ? "" : translate(locale, messageKey);
    })
    .filter(Boolean)
    .join(clauseSeparator(locale));
}

const REPORT_STATUS_KEYS: Record<string, MessageKey> = {
  completed: "shared.common.completed",
  blocked: "ui.work.reportStatus.blocked",
  unreported: "shared.common.notReported",
  failed: "shared.common.failed",
  aborted: "shared.common.aborted",
};

/** 报告声明（旧 `reportDeclaration` 逐字：来源 + 状态；不把声明当验收）。 */
export function reportDeclaration(
  report: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const record = asReportRecord(report);
  const status = asReportText(record.status);
  const originKey: MessageKey =
    record.origin === "submitted-report"
      ? "ui.work.origin.report"
      : record.origin === "terminal-fallback"
        ? "ui.work.origin.system"
        : "ui.work.origin.unconfirmed";
  const statusKey = REPORT_STATUS_KEYS[status] ?? "shared.common.unknownStatus";
  return translate(locale, originKey) + translate(locale, statusKey);
}

export function reportOriginLabel(
  origin: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(
    locale,
    origin === "submitted-report"
      ? "ui.reportView.originFormal"
      : origin === "terminal-fallback"
        ? "ui.reportView.originTerminal"
        : "ui.reportView.originUnconfirmed",
  );
}

/** 报告版本支持：有 reportId 且 version !== 1 ⇒ 不支持（旧同口径）。 */
export function reportVersionSupported(report: unknown): boolean {
  const record = asReportRecord(report);
  return !(record.reportId && record.version !== 1);
}

export function reportSummaryRecord(report: unknown): Record<string, unknown> {
  return asReportRecord(asReportRecord(report).summary);
}

export function reportSourceRecord(report: unknown): Record<string, unknown> {
  return asReportRecord(asReportRecord(report).source);
}

/** 报告身份：reportId + 来源角色/引擎；live 无 id 时按来源轮次+序号（旧同口径）。 */
export function reportIdentity(report: unknown, index = 0): string {
  const record = asReportRecord(report);
  const source = reportSourceRecord(report);
  const reportId = asReportText(record.reportId);
  if (reportId) {
    return JSON.stringify([
      asReportText(source.roleId),
      asReportText(source.runtime),
      reportId,
    ]);
  }
  return JSON.stringify([
    "live",
    asReportText(source.roleId),
    asReportText(source.turnId),
    index,
  ]);
}

/** 摘要预览：最多 180 字 / 4 行（按 Unicode 码点，避免切碎代理对）。 */
export function reportPreview(text: string): string {
  return Array.from(text)
    .slice(0, 180)
    .join("")
    .split(/\r?\n/)
    .slice(0, 4)
    .join("\n");
}

export interface ReportFlagsInput {
  summary: Record<string, unknown>;
  evidence: ReadonlyArray<Record<string, unknown>>;
  evidenceOmitted: unknown;
}

/** 报告卡可见 flags（摘要净化/截断、证据截断/净化/预算省略）。 */
export function reportFlags(
  input: ReportFlagsInput,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const flags: string[] = [];
  const summaryFlags = textFlags(input.summary, locale);
  if (summaryFlags) flags.push(summaryFlags);
  if (input.evidence.some((item) => item.truncated === true)) {
    flags.push(translate(locale, "ui.reportView.evidenceTruncatedSome"));
  }
  if (input.evidence.some((item) => item.redacted === true)) {
    flags.push(translate(locale, "ui.reportView.evidenceRedactedSome"));
  }
  if (
    typeof input.evidenceOmitted === "number" &&
    Number.isFinite(input.evidenceOmitted) &&
    input.evidenceOmitted > 0
  ) {
    flags.push(
      translate(locale, "ui.reportView.evidenceOmitted", {
        count: Math.floor(input.evidenceOmitted),
      }),
    );
  }
  return flags.join(clauseSeparator(locale));
}

/**
 * 历史报告快照排序：所有 `at` 都能解析 ⇒ 按时间从旧到新；任一缺失/非法
 * ⇒ 保持线上顺序（不猜）。稳定排序保证同时间保持原序。
 */
export function sortHistoryReports(reports: ReadonlyArray<unknown>): unknown[] {
  const list = reports.slice();
  const times = list.map((report) => {
    const at = asReportText(asReportRecord(report).at);
    const time = at ? new Date(at).getTime() : NaN;
    return Number.isFinite(time) ? time : null;
  });
  if (times.some((time) => time === null)) return list;
  return list
    .map((report, index) => ({ report, index, time: times[index] as number }))
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map((item) => item.report);
}

export interface ReportPersistenceInput {
  /** 主进程回包（`value`）或事件内联状态。 */
  state?: unknown;
  history?: unknown;
  retryAvailable?: unknown;
  retryHistoryAvailable?: unknown;
  code?: unknown;
  receipt?: unknown;
}

export type PersistenceKind = "ok" | "err" | "warn" | "muted" | "";

export interface PersistenceView {
  text: string;
  kind: PersistenceKind;
  retry: boolean;
}

const PERSISTENCE_FAILURE_KEYS: Record<string, MessageKey> = {
  CONFLICT: "ui.reportView.saveError.conflict",
  INVALID: "ui.reportView.saveError.invalid",
  REPLAY_DAMAGED: "ui.reportView.saveError.replayDamaged",
  REPLAY_CHANGED: "ui.reportView.saveError.replayChanged",
  SNAPSHOT_EXPIRED: "ui.reportView.saveError.snapshotExpired",
  PROVENANCE_TOO_LARGE: "ui.reportView.saveError.provenanceTooLarge",
  TEXT_PROJECTION_FAILED: "ui.reportView.saveError.textProjectionFailed",
};

/**
 * 报告/交付持久化状态 → 文案（旧 `ANSRuntimeUI.persistenceLabel` 逐字）。
 * `target = true` 表示交付接收历史；否则报告卡。
 */
export function persistenceView(
  value: ReportPersistenceInput | null | undefined,
  target: boolean,
  locale: Locale = DEFAULT_LOCALE,
): PersistenceView {
  const record = value || {};
  const state =
    typeof record.history === "string"
      ? record.history
      : typeof record.state === "string"
        ? record.state
        : "";
  const code = typeof record.code === "string" ? record.code : "";
  const failureKey = PERSISTENCE_FAILURE_KEYS[code];
  const failure = failureKey === undefined ? "" : translate(locale, failureKey);
  const retry =
    target
      ? state === "failed" && record.retryHistoryAvailable === true
      : state === "failed" && record.retryAvailable === true;
  if (failure && state !== "saved" && state !== "already-saved") {
    return { text: failure, kind: state === "expired" ? "warn" : "err", retry };
  }
  if (state === "saved" || state === "already-saved") {
    return {
      text: translate(
        locale,
        target ? "ui.reportView.savedTargetHistory" : "ui.reportView.savedReport",
      ),
      kind: "ok",
      retry: false,
    };
  }
  if (state === "expired") {
    return {
      text: translate(locale, "ui.reportView.saveError.snapshotExpired"),
      kind: "warn",
      retry: false,
    };
  }
  if (state === "disabled") {
    return {
      text: translate(locale, "ui.reportView.save.sessionOnly"),
      kind: "muted",
      retry: false,
    };
  }
  if (state === "unknown-live" || state === "unsupported") {
    return {
      text: translate(locale, "ui.reportView.save.unsupported"),
      kind: "muted",
      retry: false,
    };
  }
  if (state === "failed") {
    return {
      text: translate(
        locale,
        target
          ? "ui.reportView.save.historyNotSaved"
          : "ui.reportView.save.reportNotSaved",
      ),
      kind: "err",
      retry,
    };
  }
  if (state === "pending") {
    return {
      text: translate(
        locale,
        target ? "ui.reportView.savingHistory" : "ui.reportView.savingReport",
      ),
      kind: "muted",
      retry: false,
    };
  }
  return {
    text: translate(
      locale,
      target
        ? "ui.reportView.save.historyReceiptPending"
        : "ui.reportView.save.reportUnconfirmed",
    ),
    kind: "muted",
    retry: false,
  };
}

/** 重试按钮文案（旧逐字）。 */
export function retryLabel(target: boolean, locale: Locale = DEFAULT_LOCALE): string {
  return translate(
    locale,
    target ? "ui.reportView.retryHistory" : "ui.reportView.retryReport",
  );
}

export function retryNoteText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.reportView.retryNote");
}

/** 旧导出名（zh-CN 值），供未迁移调用方逐字使用。 */
export const RETRY_NOTE = retryNoteText(DEFAULT_LOCALE);

// —————— 交付回执 ——————

export interface DeliveryReceiptLike {
  version?: unknown;
  attemptId?: unknown;
  inputSaved?: unknown;
  history?: unknown;
  outcome?: unknown;
  providerMayHaveStarted?: unknown;
  retryHistoryAvailable?: unknown;
}

export interface DeliveryBatchFacts {
  history: string;
  input: string;
  outcome: string;
  /** 批次是否已收到回执（缺省一律「未确认」，不猜）。 */
  hasReceipt: boolean;
}

const RECEIPT_OUTCOME_KEYS: Record<string, MessageKey> = {
  completed: "shared.common.completed",
  failed: "shared.common.failed",
  aborted: "shared.common.aborted",
  timed_out: "ui.reportView.turnStatus.timedOut",
};

/** 交付批次事实三列（旧 `updatePersistenceCard` 逐字）；缺回执全部「未确认」。 */
export function deliveryBatchFacts(
  receipt: unknown,
  persistence: ReportPersistenceInput | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): DeliveryBatchFacts {
  const record = asReportRecord(receipt);
  const hasReceipt = Object.keys(record).length > 0;
  const view = persistenceView(persistence, true, locale);
  const persistenceHistory =
    persistence && typeof (persistence as ReportPersistenceInput).history === "string"
      ? (persistence as ReportPersistenceInput).history
      : undefined;
  const history =
    persistence && (persistence as ReportPersistenceInput).state === "pending"
      ? translate(locale, "ui.reportView.savingHistory")
      : !hasReceipt
        ? translate(locale, "ui.reportView.history.unconfirmed")
        : persistenceHistory !== undefined &&
            persistenceHistory !== "saved" &&
            persistenceHistory !== "already-saved"
          ? view.text
          : record.history === "failed"
            ? view.text
            : record.history === "saved" || record.history === "already-saved"
              ? translate(locale, "ui.reportView.history.saved")
              : view.text;
  const input = hasReceipt
    ? record.inputSaved === true
      ? translate(locale, "ui.reportView.history.saved")
      : record.history === "disabled"
        ? translate(locale, "ui.reportView.history.disabled")
        : translate(locale, "ui.reportView.history.notSaved")
    : translate(locale, "ui.reportView.history.unconfirmed");
  const outcomeKey =
    typeof record.outcome === "string" ? RECEIPT_OUTCOME_KEYS[record.outcome] : undefined;
  const outcome = hasReceipt
    ? outcomeKey !== undefined
      ? translate(locale, outcomeKey)
      : typeof record.outcome === "string" && record.outcome !== ""
        ? String(record.outcome)
        : record.providerMayHaveStarted === true
          ? translate(locale, "ui.reportView.history.maybeStarted")
          : translate(locale, "ui.reportView.history.notHandedToProvider")
    : translate(locale, "ui.reportView.history.unconfirmed");
  return { history, input, outcome, hasReceipt };
}

/** 交付批次卡标题（逐字：N 份不等于全部收齐）。 */
export function deliveryBatchTitle(
  count: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.reportView.batch", {
    count: Math.max(0, Math.floor(count)),
  });
}

export function deliveryCount(reports: unknown): number {
  return Array.isArray(reports) ? reports.length : 0;
}

/** 安全显示副本 flags（主进程投影事实；缺省不显示「完整模型输入」）。 */
export function safeCopyFlags(projection: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const record = asReportRecord(projection);
  return [
    translate(locale, "ui.reportView.modelInputMissing"),
    record.redacted ? translate(locale, "shared.common.redacted") : "",
    record.truncated ? translate(locale, "ui.reportView.displayTruncated") : "",
    record.summaryTruncated ? translate(locale, "ui.reportView.summaryTruncated") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function safeCopyMissingText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.reportView.replicaMissing");
}

export const SAFE_COPY_MISSING = safeCopyMissingText(DEFAULT_LOCALE);

/** 安全显示副本正文：只认 trusted-handback-display；否则如实缺失。 */
export function safeCopyText(
  projection: unknown,
  text: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const record = asReportRecord(projection);
  if (
    record.version === 1 &&
    record.source === "trusted-handback-display" &&
    record.modelInputRecorded === false
  ) {
    return text;
  }
  return safeCopyMissingText(locale);
}

// —————— 报告折叠（task-request / reply-original）——————

export function taskRequestLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.reportView.taskRequestLabel");
}

export function replyOriginalLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.reportView.replyOriginalLabel");
}

export function deliveryReplyLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.reportView.deliveryReplyLabel");
}

export const TASK_REQUEST_LABEL = taskRequestLabel(DEFAULT_LOCALE);
export const REPLY_ORIGINAL_LABEL = replyOriginalLabel(DEFAULT_LOCALE);
export const DELIVERY_REPLY_LABEL = deliveryReplyLabel(DEFAULT_LOCALE);

/**
 * 历史投影/报告记录摘要（`#history-projection-note`，旧口径）：
 * 报告记录不可读、投影省略/无效与解析跳过**分开**呈现；不含报告 id。
 */
export function historyProjectionText(
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const record = asReportRecord(payload);
  const parts: string[] = [];
  const reportErrors = Array.isArray(record.reportErrors) ? record.reportErrors : [];
  if (reportErrors.length > 0) {
    parts.push(
      translate(locale, "ui.reportView.projection.reportUnreadable", {
        count: reportErrors.length,
      }),
    );
  }
  const projection = asReportRecord(record.projection);
  const omitted =
    typeof projection.omittedEntries === "number" && projection.omittedEntries > 0
      ? Math.floor(projection.omittedEntries)
      : 0;
  const invalid =
    typeof projection.invalidEntries === "number" && projection.invalidEntries > 0
      ? Math.floor(projection.invalidEntries)
      : 0;
  if (omitted > 0) {
    parts.push(translate(locale, "ui.reportView.projection.omitted", { count: omitted }));
  }
  if (invalid > 0) {
    parts.push(translate(locale, "ui.reportView.projection.invalid", { count: invalid }));
  }
  if (projection.truncated === true) {
    parts.push(translate(locale, "ui.reportView.projection.truncated"));
  }
  const skipped =
    typeof record.skipped === "number" && record.skipped > 0
      ? Math.floor(record.skipped)
      : 0;
  if (skipped > 0) {
    parts.push(translate(locale, "ui.reportView.projection.skipped", { count: skipped }));
  }
  return parts.join(" · ");
}
