/**
 * 报告 / 持久化 / 交付回执的纯映射（Phase 4B）。
 *
 * 只转写主进程给出的事实：报告身份（reportId + 来源角色/引擎）、持久化状态、
 * 交付批次回执与安全显示副本 flags。不根据助手正文/工具输出造报告；不把
 * 「已保存」说成独立验收或「全部收齐」。
 */

export function asReportRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function asReportText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 文本投影 flags（旧 `ANSRuntimeUI.textFlags` 同口径）。 */
export function textFlags(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [record.redacted ? "已净化" : "", record.truncated ? "已截断" : ""]
    .filter(Boolean)
    .join(" · ");
}

const METADATA_LABELS: Record<string, string> = {
  timestamp: "原时间未保存或不可展示",
  "anchor-token": "原定位标记未提供",
  "oversize-identity": "原调用身份超出展示预算",
};

/** 历史元数据省略项（旧 `metadataLabel` 逐字）。 */
export function metadataLabel(omissions: unknown): string {
  if (!Array.isArray(omissions)) return "";
  return omissions
    .map((key) => (typeof key === "string" ? METADATA_LABELS[key] || "" : ""))
    .filter(Boolean)
    .join("；");
}

const REPORT_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  blocked: "被拦下",
  unreported: "未报告",
  failed: "失败",
  aborted: "已中止",
};

/** 报告声明（旧 `reportDeclaration` 逐字：来源 + 状态；不把声明当验收）。 */
export function reportDeclaration(report: unknown): string {
  const record = asReportRecord(report);
  const status = asReportText(record.status);
  const origin =
    record.origin === "submitted-report"
      ? "报告声明："
      : record.origin === "terminal-fallback"
        ? "系统按终态记录："
        : "来源未确认：";
  return origin + (REPORT_STATUS_LABELS[status] || "未知状态");
}

export function reportOriginLabel(origin: unknown): string {
  return origin === "submitted-report"
    ? "正式回交"
    : origin === "terminal-fallback"
      ? "终态记录"
      : "来源未确认";
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
export function reportFlags(input: ReportFlagsInput): string {
  const flags: string[] = [];
  const summaryFlags = textFlags(input.summary);
  if (summaryFlags) flags.push(summaryFlags);
  if (input.evidence.some((item) => item.truncated === true)) flags.push("部分证据显示已截断");
  if (input.evidence.some((item) => item.redacted === true)) flags.push("部分证据已净化");
  if (
    typeof input.evidenceOmitted === "number" &&
    Number.isFinite(input.evidenceOmitted) &&
    input.evidenceOmitted > 0
  ) {
    flags.push("另有 " + Math.floor(input.evidenceOmitted) + " 条证据因预算省略");
  }
  return flags.join("；");
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

const PERSISTENCE_FAILURE_BY_CODE: Record<string, string> = {
  CONFLICT: "保存内容冲突，不能自动覆盖。",
  INVALID: "保存材料无效，不能自动恢复。",
  REPLAY_DAMAGED: "历史记录损坏，不能自动补存。",
  REPLAY_CHANGED: "历史记录已变化，不能自动补存。",
  SNAPSHOT_EXPIRED: "可补存的会话材料已失效，无法在此补存。",
  PROVENANCE_TOO_LARGE: "回交记录超过展示与来源预算，尚未继续投递。",
  TEXT_PROJECTION_FAILED: "交接显示内容生成失败，尚未交给Provider。",
};

/**
 * 报告/交付持久化状态 → 文案（旧 `ANSRuntimeUI.persistenceLabel` 逐字）。
 * `target = true` 表示交付接收历史；否则报告卡。
 */
export function persistenceView(
  value: ReportPersistenceInput | null | undefined,
  target: boolean,
): PersistenceView {
  const record = value || {};
  const state =
    typeof record.history === "string"
      ? record.history
      : typeof record.state === "string"
        ? record.state
        : "";
  const code = typeof record.code === "string" ? record.code : "";
  const failure = PERSISTENCE_FAILURE_BY_CODE[code] || "";
  const retry =
    target
      ? state === "failed" && record.retryHistoryAvailable === true
      : state === "failed" && record.retryAvailable === true;
  if (failure && state !== "saved" && state !== "already-saved") {
    return { text: failure, kind: state === "expired" ? "warn" : "err", retry };
  }
  if (state === "saved" || state === "already-saved") {
    return { text: target ? "接收历史已保存" : "报告已保存", kind: "ok", retry: false };
  }
  if (state === "expired") {
    return { text: "可补存的会话材料已失效，无法在此补存。", kind: "warn", retry: false };
  }
  if (state === "disabled") {
    return { text: "仅本次会话可见，未启用历史保存。", kind: "muted", retry: false };
  }
  if (state === "unknown-live" || state === "unsupported") {
    return { text: "当前会话无法确认或不支持此保存恢复能力。", kind: "muted", retry: false };
  }
  if (state === "failed") {
    return {
      text: target
        ? "本次接收历史未保存；执行状态以上方实际结果为准。"
        : "报告尚未保存，暂未继续回交。可补存原报告，无需重新运行任务。",
      kind: "err",
      retry,
    };
  }
  if (state === "pending") {
    return {
      text: target ? "正在保存历史…" : "正在保存报告…",
      kind: "muted",
      retry: false,
    };
  }
  return {
    text: target ? "尚未取得最终历史回执，处理可能已开始。" : "报告保存状态未确认。",
    kind: "muted",
    retry: false,
  };
}

/** 重试按钮文案（旧逐字）。 */
export function retryLabel(target: boolean): string {
  return target ? "重试保存历史" : "重试保存报告";
}

/** 失败重试附注（旧逐字：补存不重跑）。 */
export const RETRY_NOTE = "补存已有记录，不再次执行或投递。";

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

const RECEIPT_OUTCOME_LABELS: Record<string, string> = {
  completed: "已完成",
  failed: "失败",
  aborted: "已中止",
  timed_out: "运行超时",
};

/** 交付批次事实三列（旧 `updatePersistenceCard` 逐字）；缺回执全部「未确认」。 */
export function deliveryBatchFacts(
  receipt: unknown,
  persistence: ReportPersistenceInput | null | undefined,
): DeliveryBatchFacts {
  const record = asReportRecord(receipt);
  const hasReceipt = Object.keys(record).length > 0;
  const view = persistenceView(persistence, true);
  const persistenceHistory =
    persistence && typeof (persistence as ReportPersistenceInput).history === "string"
      ? (persistence as ReportPersistenceInput).history
      : undefined;
  const history =
    persistence && (persistence as ReportPersistenceInput).state === "pending"
      ? "正在保存历史…"
      : !hasReceipt
        ? "未确认"
        : persistenceHistory !== undefined &&
            persistenceHistory !== "saved" &&
            persistenceHistory !== "already-saved"
          ? view.text
          : record.history === "failed"
            ? view.text
            : record.history === "saved" || record.history === "already-saved"
              ? "已保存"
              : view.text;
  const input = hasReceipt
    ? record.inputSaved === true
      ? "已保存"
      : record.history === "disabled"
        ? "未启用历史保存"
        : "尚未保存"
    : "未确认";
  const outcome = hasReceipt
    ? typeof record.outcome === "string" && record.outcome !== ""
      ? RECEIPT_OUTCOME_LABELS[record.outcome] || String(record.outcome)
      : record.providerMayHaveStarted === true
        ? "可能已开始，结果未确认"
        : "尚未交给Provider"
    : "未确认";
  return { history, input, outcome, hasReceipt };
}

/** 交付批次卡标题（逐字：N 份不等于全部收齐）。 */
export function deliveryBatchTitle(count: number): string {
  return "回交投递 · 本批 " + Math.max(0, Math.floor(count)) + " 份（不表示全部收齐）";
}

export function deliveryCount(reports: unknown): number {
  return Array.isArray(reports) ? reports.length : 0;
}

/** 安全显示副本 flags（主进程投影事实；缺省不显示「完整模型输入」）。 */
export function safeCopyFlags(projection: unknown): string {
  const record = asReportRecord(projection);
  return [
    "此处未记录完整模型输入",
    record.redacted ? "已净化" : "",
    record.truncated ? "显示副本已截断" : "",
    record.summaryTruncated ? "摘要已截断" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const SAFE_COPY_MISSING =
  "交接内容安全显示副本未提供，不能显示完整模型输入。";

/** 安全显示副本正文：只认 trusted-handback-display；否则如实缺失。 */
export function safeCopyText(projection: unknown, text: string): string {
  const record = asReportRecord(projection);
  if (
    record.version === 1 &&
    record.source === "trusted-handback-display" &&
    record.modelInputRecorded === false
  ) {
    return text;
  }
  return SAFE_COPY_MISSING;
}

// —————— 报告折叠（task-request / reply-original）——————

export const TASK_REQUEST_LABEL = "任务请求原文";
export const REPLY_ORIGINAL_LABEL = "本轮角色回复原文（展开）";
export const DELIVERY_REPLY_LABEL = "本轮回交处理回复原文（展开）";

/**
 * 历史投影/报告记录摘要（`#history-projection-note`，旧口径）：
 * 报告记录不可读、投影省略/无效与解析跳过**分开**呈现；不含报告 id。
 */
export function historyProjectionText(payload: unknown): string {
  const record = asReportRecord(payload);
  const parts: string[] = [];
  const reportErrors = Array.isArray(record.reportErrors) ? record.reportErrors : [];
  if (reportErrors.length > 0) {
    parts.push("报告记录不可读（" + reportErrors.length + " 条）");
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
  if (omitted > 0) parts.push("省略前 " + omitted + " 条历史投影");
  if (invalid > 0) parts.push("无效投影条目 " + invalid);
  if (projection.truncated === true) parts.push("历史投影已截断");
  const skipped =
    typeof record.skipped === "number" && record.skipped > 0
      ? Math.floor(record.skipped)
      : 0;
  if (skipped > 0) parts.push("原解析跳过 " + skipped + " 条");
  return parts.join(" · ");
}
