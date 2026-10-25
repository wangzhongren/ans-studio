/**
 * 会话事件 → 界面行的纯映射（Phase 3A）。
 *
 * 只做「主进程/编排已给出的事实」到行类型的映射；不判边界、不推导治理结论。
 * 渲染组件按这里的 `NewRowDescriptor` 构造 DOM；单测可独立断言路由/分类。
 */

import type {
  ActivityItem,
  ClientProjectionV1,
  RowKind,
  SessionEnvelope,
  SessionEvent,
} from "./types.ts";
import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import {
  reasoningPieceFromCarrier,
  reasoningPieceFromDetail,
  reasoningRowDataFromPiece,
  reasoningUnsafeNote,
} from "./reasoning.ts";

export interface NewRowDescriptor {
  kind: RowKind;
  data: unknown;
  turnId?: string;
  callId?: string;
  requestId?: string;
  replay?: boolean;
  anchorKey?: string;
  anchor?: string;
  /** 实时事件的原始 kind（denied/settled）；终态合并用于来源去重，不参与渲染身份。 */
  eventKind?: string;
}

export interface ViewIdentity {
  projectRoot: string | null;
  runtime: string;
}

export function normalizeEnvelopes(input: unknown): SessionEnvelope[] {
  if (Array.isArray(input)) {
    return input.filter(
      (item): item is SessionEnvelope =>
        !!item && typeof item === "object" && typeof (item as SessionEnvelope).roleId === "string",
    );
  }
  if (
    input &&
    typeof input === "object" &&
    typeof (input as SessionEnvelope).roleId === "string" &&
    (input as SessionEnvelope).event &&
    typeof (input as SessionEnvelope).event === "object"
  ) {
    return [input as SessionEnvelope];
  }
  return [];
}

/** 信封/事件与当前视图的 runtime/project 匹配（按显式字段；缺省不猜）。 */
export function envelopeMatches(
  envelope: SessionEnvelope,
  view: ViewIdentity,
): boolean {
  if (!envelope || typeof envelope.roleId !== "string" || !envelope.event) {
    return false;
  }
  if (
    typeof envelope.projectRoot === "string" &&
    view.projectRoot !== null &&
    envelope.projectRoot !== view.projectRoot
  ) {
    return false;
  }
  if (typeof envelope.runtime === "string" && envelope.runtime !== view.runtime) {
    return false;
  }
  const event = envelope.event;
  if (typeof event.runtime === "string" && event.runtime !== view.runtime) {
    return false;
  }
  if (typeof event.roleId === "string" && event.roleId !== envelope.roleId) {
    return false;
  }
  return true;
}

function stringDetail(
  event: SessionEvent,
  key: string,
): string {
  const value = event.detail ? event.detail[key] : undefined;
  return typeof value === "string" ? value : "";
}

function objectDetail(
  event: SessionEvent,
  key: string,
): Record<string, unknown> | null {
  const value = event.detail ? event.detail[key] : undefined;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** 推理事件的轮次回退：event.turnId 缺省时取 detail.turnId（Service 会把 turnId 并入 detail）。 */
function detailTurnId(event: SessionEvent): string | undefined {
  const detail = event.detail;
  if (!detail || typeof detail !== "object") return undefined;
  const value = (detail as Record<string, unknown>).turnId;
  return typeof value === "string" && value !== "" ? value : undefined;
}

function displayTarget(event: SessionEvent): string {
  const display = objectDetail(event, "display");
  if (display) {
    const target = display.target;
    if (typeof target === "string" && target !== "") return target;
    if (target && typeof target === "object") {
      const record = target as Record<string, unknown>;
      const text = record.text;
      if (typeof text === "string" && text !== "") return text;
      const path = record.path;
      if (typeof path === "string" && path !== "") return path;
      const command = record.command;
      if (typeof command === "string" && command !== "") return command;
      const value = record.value;
      if (value && typeof value === "object") {
        const valueText = (value as Record<string, unknown>).text;
        if (typeof valueText === "string" && valueText !== "") return valueText;
      }
    }
  }
  // 事件详情直接携带的目标（旧 tool-rows 口径：target → path → args.path/command）。
  for (const key of ["target", "path", "file_path", "command"]) {
    const value = event.detail ? event.detail[key] : undefined;
    if (typeof value === "string" && value !== "") return value;
  }
  const args = objectDetail(event, "args");
  if (args) {
    for (const key of ["path", "file_path", "command", "target"]) {
      const value = args[key];
      if (typeof value === "string" && value !== "") return value;
    }
  }
  const summary = typeof event.summary === "string" ? event.summary : "";
  const readFailure = /^read_file 失败：(.+)（.+）$/.exec(summary);
  if (readFailure) return readFailure[1];
  const shellResult = /^run_shell 已执行：(.+)（exit (-?\d+|\?)(?:，signal [^）]+)?）$/.exec(summary);
  if (shellResult) return shellResult[1];
  const targetHint = /（目标：([^）]+)）/.exec(summary);
  if (targetHint) return targetHint[1];
  return "";
}

function summaryToolName(summary: string): { toolName: string; rest: string } {
  const text = String(summary || "");
  const index = text.search(/[：:]/);
  if (index > 0) {
    return { toolName: text.slice(0, index).trim(), rest: text.slice(index + 1).trim() };
  }
  return { toolName: text.split(/\s+/)[0] || "", rest: "" };
}

export function toolStatus(
  activity: Partial<ActivityItem> & { phase?: string },
  locale: Locale = DEFAULT_LOCALE,
): {
  status: string;
  statusText: string;
} {
  if (activity.denied) {
    return { status: "denied", statusText: translate(locale, "ui.tool.status.notApproved") };
  }
  if (activity.timedOut) {
    return { status: "timed-out", statusText: translate(locale, "ui.tool.status.timedOut") };
  }
  if (typeof activity.exitCode === "number" && activity.exitCode !== 0) {
    return {
      status: "exited-nonzero",
      statusText: translate(locale, "ui.tool.status.completedExit", {
        code: activity.exitCode,
      }),
    };
  }
  if (activity.failed) {
    return { status: "failed", statusText: translate(locale, "shared.common.failed") };
  }
  if (activity.phase === "call" || activity.phase === "start" || activity.phase === "running") {
    return { status: "running", statusText: translate(locale, "ui.tool.status.running") };
  }
  if (activity.phase === "blocked" || activity.phase === "denied") {
    return { status: "denied", statusText: translate(locale, "ui.tool.status.notApproved") };
  }
  if (activity.phase === "result") {
    if (activity.completed === true) {
      return { status: "completed", statusText: translate(locale, "ui.tool.status.done") };
    }
    if (activity.returned === true) {
      return { status: "returned", statusText: translate(locale, "ui.tool.status.returned") };
    }
    // accepted 单独到达不是执行成功——没有 ok/status 事实就如实标「状态未记录」。
    return { status: "unknown", statusText: translate(locale, "ui.tool.status.unknown") };
  }
  return { status: "recorded", statusText: translate(locale, "ui.tool.status.recorded") };
}

export function activityFromEvent(
  event: SessionEvent,
  locale: Locale = DEFAULT_LOCALE,
): ActivityItem | null {
  if (!event) return null;
  const summary = typeof event.summary === "string" ? event.summary : "";
  const parsed = summaryToolName(summary);
  const detail = event.detail || {};
  const toolName =
    typeof detail.toolName === "string" && detail.toolName !== ""
      ? detail.toolName
      : typeof detail.name === "string" && detail.name !== ""
        ? detail.name
        : parsed.toolName;
  if (!toolName) return null;
  const process = objectDetail(event, "process");
  const rawDisplay = objectDetail(event, "display");
  const display = rawDisplay && rawDisplay.version === 1 ? rawDisplay : null;
  const displayTargetRecord =
    display && display.target && typeof display.target === "object"
      ? (display.target as Record<string, unknown>)
      : null;
  const displayValue =
    displayTargetRecord && displayTargetRecord.value && typeof displayTargetRecord.value === "object"
      ? (displayTargetRecord.value as Record<string, unknown>)
      : null;
  const displayText =
    displayValue && typeof displayValue.text === "string"
      ? displayValue.text
      : rawDisplay && typeof rawDisplay.target === "string"
        ? rawDisplay.target
        : "";
  const explicitIdentity =
    (typeof detail.toolName === "string" && detail.toolName !== "") ||
    (typeof detail.name === "string" && detail.name !== "") ||
    (typeof detail.toolCallId === "string" && detail.toolCallId !== "") ||
    (typeof detail.callId === "string" && detail.callId !== "") ||
    !!rawDisplay;
  // 无显式工具身份且摘要首词不像工具名（中文叙述等）⇒ 不是工具事实（旧/未知系统记录）。
  if (!explicitIdentity && !/^[A-Za-z][\w.-]*$/.test(toolName)) return null;
  const displayProcess =
    display && display.process && typeof display.process === "object"
      ? (display.process as Record<string, unknown>)
      : null;
  const processRecord = process || displayProcess;
  const exitCode =
    processRecord && typeof processRecord.exitCode === "number"
      ? processRecord.exitCode
      : undefined;
  const timedOut = !!processRecord && processRecord.timedOut === true;
  const explicitPhase = typeof detail.phase === "string" ? detail.phase : "";
  const phase =
    explicitPhase ||
    (event.kind === "tool_call"
      ? "call"
      : event.kind === "accepted"
        ? "result"
        : event.kind === "denied"
          ? "blocked"
          : "");
  const identityPhase =
    explicitPhase === "start" || explicitPhase === "result" || explicitPhase === "blocked"
      ? explicitPhase
      : event.kind === "tool_call"
        ? "start"
        : event.kind === "accepted"
          ? "result"
          : event.kind === "denied"
            ? "blocked"
            : "";
  const denied = event.kind === "denied" || phase === "blocked" || phase === "denied";
  const head = summary.split(/\r?\n/)[0].trim();
  const readFailure = toolName === "read_file" ? /^read_file 失败：(.+)（.+）$/.exec(head) : null;
  const shellResult =
    toolName === "run_shell"
      ? /^run_shell 已执行：(.+)（exit (-?\d+|\?)(?:，signal [^）]+)?）$/.exec(head)
      : null;
  const knownFailure =
    !!readFailure || !!(shellResult && shellResult[2] !== "?" && Number(shellResult[2]) !== 0);
  const ok = typeof detail.ok === "boolean" ? detail.ok : undefined;
  const detailStatus = typeof detail.status === "string" ? detail.status : "";
  const failed =
    !denied &&
    (knownFailure || detailStatus === "failed" || ok === false || !!detail.error);
  // display 存在时目标只取 display（版本不支持/目标缺失 ⇒ 空），绝不回退原始参数。
  const target = rawDisplay ? displayText : displayTarget(event);
  const completed = detailStatus === "completed" || ok === true;
  const returned = detailStatus === "returned";
  const base: ActivityItem = {
    toolName,
    target,
    status: "",
    statusText: "",
    summary,
    visibleSummary: head,
    deniedSummary: event.kind === "denied" && typeof event.summary === "string" ? summary : "",
    callId:
      typeof detail.toolCallId === "string"
        ? detail.toolCallId
        : typeof detail.callId === "string"
          ? detail.callId
          : undefined,
    turnId: typeof event.turnId === "string" ? event.turnId : undefined,
    phase: phase || undefined,
    identityPhase: identityPhase || undefined,
    denied,
    failed,
    exceptional: denied || failed || timedOut || detailStatus === "timed_out",
    barrier: !!rawDisplay,
    origin: "live",
    at:
      typeof event.at === "string"
        ? event.at
        : typeof detail.at === "string"
          ? detail.at
          : "",
    completed,
    returned,
    exitCode,
    timedOut,
    hasDisplay: !!rawDisplay,
    displayUnsupported: !!rawDisplay && !display,
    detailText: [
      summary,
      target ? translate(locale, "ui.events.target", { target }) : "",
      exitCode !== undefined
        ? translate(locale, "ui.chatRow.exitCode", { code: exitCode ?? "" })
        : "",
      timedOut ? translate(locale, "ui.events.timedOut") : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const status = toolStatus(base, locale);
  base.status = status.status;
  base.statusText = status.statusText;
  base.label = activityPhaseLabel(base, locale);
  base.display = display || undefined;
  base.fullTarget = displayText || base.target;
  base.legacyTextProjection = detail.textProjection;
  base.metadataOmissions = Array.isArray(detail.metadataOmissions)
    ? detail.metadataOmissions
    : undefined;
  base.legacyStatusSource =
    typeof detail.legacyStatusSource === "string" ? detail.legacyStatusSource : undefined;
  return base;
}

/** 相位标签（旧 tool-rows `label` 同口径；结构化终态优先于文本失败推断）。 */
export function activityPhaseLabel(
  activity: Partial<ActivityItem>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (activity.timedOut) return translate(locale, "ui.tool.status.timedOut");
  if (activity.status === "exited-nonzero") {
    return translate(locale, "ui.tool.status.completedExit", {
      code: activity.exitCode ?? "",
    });
  }
  if (activity.failed) return translate(locale, "ui.tool.status.failed");
  if (activity.denied) return translate(locale, "ui.tool.status.denied");
  if (activity.status === "running") return translate(locale, "ui.tool.status.called");
  if (activity.status === "completed") {
    return translate(locale, "ui.tool.status.completedShort");
  }
  if (activity.status === "returned") {
    return translate(locale, "ui.tool.status.returned");
  }
  return translate(locale, "ui.tool.status.unknown");
}

export interface InjectedMessage {
  kind: "dispatch" | "handback" | "system" | "system-notice";
  label: string;
  body: string;
  /** 系统通知的可见正文（标记由徽标承载；与 `body` 原文分离）。 */
  displayBody?: string;
  sourceRoleId?: string;
  remainder?: string;
  /** 事件层可选客户投影（桌面窗口 `GovernanceClientProjectionV1`）；形状不符不附带。 */
  clientProjection?: ClientProjectionV1;
  /** 事件时间（ISO；仅用于短时间显示，不猜）。 */
  at?: string;
}

const CLIENT_PROJECTION_STATUS = new Set<ClientProjectionV1["statusCode"]>([
  "completed",
  "failed",
  "aborted",
  "timed_out",
  "unknown",
  "internal-feedback",
]);
const CLIENT_PROJECTION_ACTIONS = new Set<ClientProjectionV1["action"]>([
  "report-ready",
  "await-lead-summary",
]);

/**
 * 校验并读取事件层可选客户投影（桌面窗口 `GovernanceClientProjectionV1`）。
 * 只接受版本 1 / governance-feedback；任何字段缺失或越界都返回 null（回退旧文本归类）。
 */
export function clientProjectionFrom(value: unknown): ClientProjectionV1 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || record.kind !== "governance-feedback") return null;
  const fingerprint =
    typeof record.fingerprint === "string" ? record.fingerprint.trim() : "";
  if (fingerprint === "") return null;
  const source =
    record.sourceRole && typeof record.sourceRole === "object"
      ? (record.sourceRole as Record<string, unknown>)
      : null;
  const sourceRoleId =
    source && typeof source.roleId === "string" ? source.roleId.trim() : "";
  if (!source || sourceRoleId === "") return null;
  const statusCode =
    typeof record.statusCode === "string" ? record.statusCode : "";
  if (!CLIENT_PROJECTION_STATUS.has(statusCode as ClientProjectionV1["statusCode"])) {
    return null;
  }
  const action = typeof record.action === "string" ? record.action : "";
  if (!CLIENT_PROJECTION_ACTIONS.has(action as ClientProjectionV1["action"])) {
    return null;
  }
  const flowIds = Array.isArray(record.flowIds)
    ? record.flowIds.filter(
        (id): id is string => typeof id === "string" && id.trim() !== "",
      )
    : [];
  return {
    version: 1,
    kind: "governance-feedback",
    fingerprint,
    sourceRole: {
      roleId: sourceRoleId,
      displayName:
        typeof source.displayName === "string" ? source.displayName : "",
    },
    statusCode: statusCode as ClientProjectionV1["statusCode"],
    statusText:
      typeof record.statusText === "string" ? record.statusText : "",
    ...(flowIds.length > 0 ? { flowIds } : {}),
    ...(typeof record.reportPath === "string" && record.reportPath !== ""
      ? { reportPath: record.reportPath }
      : {}),
    ...(typeof record.governancePath === "string" &&
    record.governancePath !== ""
      ? { governancePath: record.governancePath }
      : {}),
    action: action as ClientProjectionV1["action"],
  };
}

/**
 * 连续同指纹注入投影的合并数据（A4）：仅当上一条数据与新数据的
 * `clientProjection.fingerprint` 非空且相等时返回合并后的 data，否则返回 null。
 * `occurrences` 只保留最近 8 次，避免无限增长；不改变原 data 对象。
 */
export function mergeClientProjectionData(
  previous: unknown,
  next: unknown,
): Record<string, unknown> | null {
  const previousData =
    previous && typeof previous === "object"
      ? (previous as Record<string, unknown>)
      : null;
  const nextData =
    next && typeof next === "object" ? (next as Record<string, unknown>) : null;
  if (!previousData || !nextData) return null;
  const previousProjection = clientProjectionFrom(previousData.clientProjection);
  const nextProjection = clientProjectionFrom(nextData.clientProjection);
  if (!previousProjection || !nextProjection) return null;
  if (previousProjection.fingerprint !== nextProjection.fingerprint) return null;
  const previousCount =
    typeof previousData.projectionCount === "number" &&
    Number.isFinite(previousData.projectionCount) &&
    previousData.projectionCount >= 1
      ? Math.floor(previousData.projectionCount)
      : 1;
  const previousOccurrences = Array.isArray(previousData.projectionOccurrences)
    ? previousData.projectionOccurrences
    : [];
  const occurrence: Record<string, unknown> = {};
  if (typeof nextData.at === "string" && nextData.at !== "") {
    occurrence.at = nextData.at;
  }
  if (typeof nextData.turnId === "string" && nextData.turnId !== "") {
    occurrence.turnId = nextData.turnId;
  }
  const occurrences = Object.keys(occurrence).length
    ? [...previousOccurrences, occurrence].slice(-8)
    : previousOccurrences;
  return {
    ...previousData,
    projectionCount: previousCount + 1,
    ...(occurrences.length > 0 ? { projectionOccurrences: occurrences } : {}),
  };
}

/**
 * 系统投递输入归类（旧 tool-rows.js `classifyInjectedMessage` 同口径）：
 * 适配器把程序化输入回显为 `用户指令：<正文>`——归类前先剥掉该**可选**回显前缀；
 * 之后按文首定格标记识别（`[系统·<子类>]` 子类 ≤12 且闭合、其后空白/文末；`[派发]`/`[回交]` 前缀）。
 * 不是「看起来像」的启发式：前缀就是各渲染函数首行的定格格式。
 */
const USER_ECHO_PREFIX = "用户指令：";

export function classifyInjected(
  text: string,
  locale: Locale = DEFAULT_LOCALE,
): InjectedMessage | null {
  const raw = String(text == null ? "" : text);
  const value = raw.indexOf(USER_ECHO_PREFIX) === 0
    ? raw.slice(USER_ECHO_PREFIX.length)
    : raw;
  const system = /^\[系统·([^\]\r\n]{1,12})\](?=\s|$)\s*/.exec(value);
  if (system) {
    return {
      kind: "system",
      label: translate(locale, "ui.events.systemMessage", { label: system[1] }),
      body: value.slice(system[0].length),
    };
  }
  // `【系统通知】` / `【系统通知·<子类>】`：标记闭合、子类 ≤16 且无括号/换行；
  // 通知正文到第一个空行为止，其后原样作为用户正文（旧 classifySystemNotice 同口径）。
  const notice = /^【系统通知(?:·([^】\r\n]{1,16}))?】\s*/.exec(value);
  if (notice) {
    const rest = value.slice(notice[0].length);
    const split = rest.search(/\r?\n\r?\n/);
    const noticeText = (split >= 0 ? rest.slice(0, split) : rest).trim();
    if (noticeText !== "") {
      return {
        kind: "system-notice",
        label: notice[1]
          ? translate(locale, "ui.events.systemNoticeWithLabel", { label: notice[1] })
          : translate(locale, "ui.events.systemNotice"),
        body: value,
        displayBody: noticeText,
        remainder: split >= 0 ? rest.slice(split).replace(/^\r?\n\r?\n/, "") : "",
      };
    }
  }
  const dispatch = /^\[派发\]\s*(?:来自\s*([^\s的]+)\s*的\s*)?/.exec(value);
  if (dispatch) {
    return {
      kind: "dispatch",
      label: dispatch[1]
        ? translate(locale, "ui.events.dispatchTaskWithRole", { role: dispatch[1] })
        : translate(locale, "ui.events.dispatchTask"),
      body: value.slice(dispatch[0].length),
      sourceRoleId: dispatch[1] || undefined,
    };
  }
  const handback = /^\[回交\]\s*(?:来自\s*([^\s的]+)\s*的\s*)?/.exec(value);
  if (handback) {
    return {
      kind: "handback",
      label: handback[1]
        ? translate(locale, "ui.events.handbackDeliveryWithRole", { role: handback[1] })
        : translate(locale, "ui.events.handbackDelivery"),
      body: value.slice(handback[0].length),
      sourceRoleId: handback[1] || undefined,
    };
  }
  return null;
}

/** 交互/派发类工具（旧 SPECIAL_TOOLS）：独立生命周期行，不进入工具折叠组。 */
const SPECIAL_TOOLS = new Set([
  "request_confirmation",
  "request_choice",
  "submit_report",
  "dispatch_task",
  "report_shell_verdict",
]);

export function isSpecialTool(toolName: unknown): boolean {
  return typeof toolName === "string" && SPECIAL_TOOLS.has(toolName);
}

/** denied/settled 的终态身份：只认真实 turnId + 冻结 outcome（旧 terminalFact 同口径）。 */
export function terminalOutcome(event: SessionEvent | null | undefined): string {
  if (!event || (event.kind !== "denied" && event.kind !== "settled")) return "";
  if (typeof event.turnId !== "string" || event.turnId === "") return "";
  const detail = event.detail && typeof event.detail === "object"
    ? (event.detail as Record<string, unknown>)
    : {};
  const outcome = typeof detail.outcome === "string" ? detail.outcome : "";
  return ["completed", "failed", "aborted", "timed_out"].includes(outcome) ? outcome : "";
}

export function describeEvent(
  event: SessionEvent | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): NewRowDescriptor | null {
  if (!event || typeof event !== "object") return null;
  const kind = event.kind || "message";
  const summary = typeof event.summary === "string" ? event.summary : "";
  const turnId = typeof event.turnId === "string" ? event.turnId : undefined;
  if (kind === "handback") {
    const report = event.report || event.liveReport;
    if (!report || typeof report !== "object") {
      return {
        kind: "system",
        data: {
          cls: "sys-call",
          text: translate(locale, "ui.events.handbackLegacy"),
        },
        turnId,
      };
    }
    return {
      kind: "handback",
      data: { report, persistence: event.reportPersistence },
      turnId,
    };
  }
  if (kind === "message") {
    const source = stringDetail(event, "source");
    // 回交投递（安全显示副本/来源）：先于普通 prompt-input 归类（旧 appendDelivery 同义）。
    const provenance = objectDetail(event, "inputProvenance");
    const presentation = objectDetail(event, "inputPresentation");
    if (provenance || presentation) {
      return {
        kind: "delivery",
        data: {
          provenance,
          presentation,
          text: stringDetail(event, "text") || summary,
          projection: objectDetail(event, "inputTextProjection"),
        },
        turnId,
      };
    }
    if (source === "delivery-note") {
      return {
        kind: "system",
        data: { cls: "sys-call sys-delivery-note", text: summary },
        turnId,
      };
    }
    if (source === "delivery-receipt" || source === "delivery-boundary") {
      return null;
    }
    if (source === "reasoning") {
      // R1：正文唯一来源＝核心投影形 `detail.reasoning.text.text`（DisplayTextV1）。
      // 不读 `detail.text`、不用 summary 当正文；坏件/旧原始事实 fail-closed。
      const reasoningTurnId = turnId || detailTurnId(event);
      const piece = reasoningPieceFromDetail(event.detail);
      if (!piece) {
        return {
          kind: "system",
          data: { cls: "sys-call", text: reasoningUnsafeNote(locale) },
          turnId: reasoningTurnId,
        };
      }
      return {
        kind: "reasoning",
        data: reasoningRowDataFromPiece(piece, locale),
        turnId: reasoningTurnId,
      };
    }
    if (source === "reasoning-diagnostic") {
      return {
        kind: "system",
        data: {
          cls: "sys-call",
          text: summary || reasoningUnsafeNote(locale),
        },
        turnId: turnId || detailTurnId(event),
      };
    }
    if (source === "prompt-input") {
      const text = stringDetail(event, "text");
      const projection = clientProjectionFrom(objectDetail(event, "clientProjection"));
      const injected = classifyInjected(text, locale);
      if (injected) {
        return {
          kind: "injected",
          data: {
            ...injected,
            ...(projection
              ? { clientProjection: projection, turnId: turnId || undefined }
              : {}),
            ...(typeof event.at === "string" && event.at !== ""
              ? { at: event.at }
              : {}),
          },
          turnId,
        };
      }
      return { kind: "user", data: { text }, turnId };
    }
    return {
      kind: "assistant",
      data: {
        text: summary,
        ...(typeof event.at === "string" && event.at !== ""
          ? { at: event.at }
          : {}),
      },
      turnId,
    };
  }
  if (kind === "tool_call" || kind === "accepted" || kind === "denied") {
    if (kind === "denied") {
      // 非工具类 denied（例如「本轮已中止」终态）不是工具行：只有**显式**工具身份
      // （detail.toolName / toolCallId）才允许渲染为工具卡片；否则如实作为系统事实，
      // 不从摘要猜工具名、不伪造「目标未记录」。
      const detail = event.detail || {};
      const explicitTool =
        (typeof detail.toolName === "string" && detail.toolName !== "") ||
        (typeof detail.toolCallId === "string" && detail.toolCallId !== "");
      if (!explicitTool) {
        const outcome = terminalOutcome(event);
        if (outcome) {
          return {
            kind: "turn-terminal",
            data: { turnId, outcome, text: summary, sources: [{ kind: "denied", text: summary }] },
            turnId,
            eventKind: "denied",
          };
        }
        return {
          kind: "system",
          data: { cls: "sys-call", text: summary },
          turnId,
        };
      }
    }
    const activity = activityFromEvent(event, locale);
    if (kind === "denied" && activity) {
      if (isSpecialTool(activity.toolName) || activity.hasDisplay) {
        // 特殊工具/display 生命周期：denied 是同一调用的 blocked 相位，不另造 .sys-denied。
        return {
          kind: "tool-lifecycle",
          data: { activity },
          turnId,
          callId: activity.callId,
          eventKind: "denied",
        };
      }
      return {
        kind: "denied",
        data: { text: summary, target: activity.target, activity },
        turnId,
        callId: activity.callId,
      };
    }
    if (kind === "denied") {
      // 非工具类 denied（例如「本轮已中止」终态）不是工具行：有真实 turn+outcome 时并入
      // 终态行；否则如实作为系统事实，不伪造工具详情。
      const outcome = terminalOutcome(event);
      if (outcome) {
        return {
          kind: "turn-terminal",
          data: { turnId, outcome, text: summary, sources: [{ kind: "denied", text: summary }] },
          turnId,
          eventKind: "denied",
        };
      }
      return {
        kind: "system",
        data: { cls: "sys-call", text: summary },
        turnId,
      };
    }
    if (activity && (activity.hasDisplay || isSpecialTool(activity.toolName))) {
      return {
        kind: "tool-lifecycle",
        data: { activity },
        turnId,
        callId: activity.callId,
      };
    }
    if (activity) {
      return {
        kind: "activities",
        data: { items: [activity], turnId: turnId || "" },
        turnId,
        callId: activity.callId,
      };
    }
    return {
      kind: "system",
      data: {
        cls: "sys-call sys-unknown-tool-event",
        text: translate(locale, "ui.events.legacyUnknown", { summary }),
      },
      turnId,
    };
  }
  if (kind === "settled") {
    const outcome = event.detail && typeof event.detail.outcome === "string" ? event.detail.outcome : "";
    if (["completed", "failed", "aborted", "timed_out"].includes(outcome)) {
      return {
        kind: "turn-terminal",
        data: { turnId: turnId || "", outcome, text: summary, sources: [{ kind: "settled", text: summary }] },
        turnId,
        eventKind: "settled",
      };
    }
    return { kind: "system", data: { cls: "sys-settled", text: summary }, turnId };
  }
  return { kind: "system", data: { cls: "sys-settled", text: summary }, turnId };
}

const HISTORY_PROJECTION_GROUP: Record<string, string> = {
  user: "user",
  injected: "user",
  system: "system",
  delivery: "delivery",
};

/**
 * 历史内部投影去重键（5B 真机回归）：
 * 同一 turn 的 user 行与 prompt-input message 事件都会被映射为 user/injected；
 * 仅对 user/injected/system/delivery 这类「同一投递的投影」按首行文本去重，
 * 不碰 assistant/reasoning/tool（同轮多条助手消息/不同 callId 工具行是合法事实）。
 */
export function historyProjectionKey(
  descriptor: NewRowDescriptor,
): string | null {
  const group = HISTORY_PROJECTION_GROUP[descriptor.kind];
  if (!group) return null;
  // 无轮次身份的历史行不猜「同一条投递」；只对带 turnId 的投影去重。
  if (!descriptor.turnId) return null;
  const data =
    descriptor.data && typeof descriptor.data === "object"
      ? (descriptor.data as Record<string, unknown>)
      : {};
  const text =
    typeof data.body === "string"
      ? data.body
      : typeof data.text === "string"
        ? data.text
        : "";
  const first = text.split(/\r?\n/)[0].trim();
  if (!first) return null;
  return group + "|" + (descriptor.turnId || "") + "|" + first;
}

function historyDescriptorHasIdentity(descriptor: NewRowDescriptor): boolean {
  return !!(descriptor.anchorKey || descriptor.anchor || descriptor.requestId);
}

/**
 * 历史行内部的投影去重：保留一条；若后续条目带 anchor/request 身份而先前没有，
 * 在原位置替换为带身份的一条（不改变其余行顺序）。
 */
export function dedupeHistoryDescriptors(
  descriptors: NewRowDescriptor[],
): NewRowDescriptor[] {
  const kept: NewRowDescriptor[] = [];
  const byKey = new Map<string, number>();
  for (const descriptor of descriptors) {
    const key = historyProjectionKey(descriptor);
    if (!key) {
      kept.push(descriptor);
      continue;
    }
    const at = byKey.get(key);
    if (at === undefined) {
      byKey.set(key, kept.length);
      kept.push(descriptor);
      continue;
    }
    if (
      historyDescriptorHasIdentity(descriptor) &&
      !historyDescriptorHasIdentity(kept[at])
    ) {
      kept[at] = descriptor;
    }
  }
  return kept;
}

/**
 * 历史行版本：返回按投影键去重后的原始行（保留带 anchor/request 身份的条目）。
 * 供 applyHistory 在重放前统一去重；不改变行内字段。
 */
export function dedupeHistoryRows(
  rows: Record<string, unknown>[],
  locale: Locale = DEFAULT_LOCALE,
): Record<string, unknown>[] {
  const descriptors = rows.map((row) => historyRowToDescriptor(row, locale));
  const keptRows: Record<string, unknown>[] = [];
  const byKey = new Map<string, number>();
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const key = historyProjectionKey(descriptor);
    if (!key) {
      keptRows.push(rows[index]);
      continue;
    }
    const at = byKey.get(key);
    if (at === undefined) {
      byKey.set(key, keptRows.length);
      keptRows.push(rows[index]);
      continue;
    }
    const keptDescriptor = historyRowToDescriptor(keptRows[at], locale);
    if (
      historyDescriptorHasIdentity(descriptor) &&
      !historyDescriptorHasIdentity(keptDescriptor)
    ) {
      keptRows[at] = rows[index];
    }
  }
  return keptRows;
}

export function historyRowToDescriptor(row: Record<string, unknown>): NewRowDescriptor;
export function historyRowToDescriptor(
  row: Record<string, unknown>,
  locale: Locale,
): NewRowDescriptor;
export function historyRowToDescriptor(
  row: Record<string, unknown>,
  locale: Locale = DEFAULT_LOCALE,
): NewRowDescriptor {
  const kind = typeof row.kind === "string" ? row.kind : "";
  const text = typeof row.text === "string" ? row.text : "";
  const turnId = typeof row.turnId === "string" ? row.turnId : undefined;
  const anchorKey = typeof row.anchorKey === "string" ? row.anchorKey : undefined;
  const anchor = typeof row.anchor === "string" ? row.anchor : undefined;
  const requestId = typeof row.requestId === "string" ? row.requestId : undefined;
  const base = {
    turnId,
    replay: true as const,
    ...(anchorKey ? { anchorKey } : {}),
    ...(anchor ? { anchor } : {}),
    ...(requestId ? { requestId } : {}),
  };
  // G-5 回放载体：行有投影形 `row.reasoning` ⇒ 与实时同一提取器/同一行数据；
  // 缺失（null/undefined，旧数据）⇒ 保持既有 assistant 文本行回落；坏载体 fail-closed 诊断行。
  if (row.reasoning !== undefined && row.reasoning !== null) {
    const piece = reasoningPieceFromCarrier(row.reasoning);
    if (!piece) {
      return {
        ...base,
        kind: "system",
        data: { cls: "sys-call", text: reasoningUnsafeNote(locale) },
      };
    }
    return {
      ...base,
      kind: "reasoning",
      data: reasoningRowDataFromPiece(piece, locale),
    };
  }
  if (kind === "user") {
    const provenance =
      row.inputProvenance && typeof row.inputProvenance === "object"
        ? (row.inputProvenance as Record<string, unknown>)
        : null;
    const presentation =
      row.inputPresentation && typeof row.inputPresentation === "object"
        ? (row.inputPresentation as Record<string, unknown>)
        : null;
    if (provenance || presentation) {
      return {
        ...base,
        kind: "delivery",
        data: {
          provenance,
          presentation,
          text,
          projection:
            row.inputTextProjection && typeof row.inputTextProjection === "object"
              ? (row.inputTextProjection as Record<string, unknown>)
              : null,
        },
      };
    }
    const injected = classifyInjected(text, locale);
    if (injected) {
      const projection = clientProjectionFrom(row.clientProjection);
      return {
        ...base,
        kind: "injected",
        data: {
          ...injected,
          ...(projection
            ? { clientProjection: projection, turnId: turnId || undefined }
            : {}),
          ...(typeof row.at === "string" && row.at !== ""
            ? { at: row.at }
            : {}),
        },
      };
    }
    return { ...base, kind: "user", data: { text, projection: row.textProjection } };
  }
  if (kind === "assistant") {
    return {
      ...base,
      kind: "assistant",
      data: {
        text,
        projection: row.textProjection,
        ...(typeof row.at === "string" && row.at !== "" ? { at: row.at } : {}),
      },
    };
  }
  if (
    kind === "tool" ||
    (kind === "denied" &&
      row.activity &&
      typeof row.activity === "object" &&
      ((row.activity as Record<string, unknown>).display ||
        isSpecialTool((row.activity as Record<string, unknown>).toolName)))
  ) {
    const activity = row.activity && typeof row.activity === "object"
      ? (row.activity as Record<string, unknown>)
      : null;
    const head = text.split(/\r?\n/)[0].trim();
    const toolName =
      activity && typeof activity.toolName === "string"
        ? activity.toolName
        : summaryToolName(text).toolName || translate(locale, "shared.common.tool");
    const target =
      activity && typeof activity.target === "string" && activity.target
        ? activity.target
        : /（目标：([^）]+)）/.exec(head)?.[1] ||
          /^read_file 失败：(.+)（.+）$/.exec(head)?.[1] ||
          "";
    const phase = activity && typeof activity.phase === "string" ? activity.phase : undefined;
    const activityStatus = activity && typeof activity.status === "string" ? activity.status : "";
    const ok = activity && typeof activity.ok === "boolean" ? activity.ok : undefined;
    const rawDisplay =
      activity && activity.display && typeof activity.display === "object"
        ? (activity.display as Record<string, unknown>)
        : null;
    const display = rawDisplay && rawDisplay.version === 1 ? rawDisplay : null;
    const displayProcess =
      display && display.process && typeof display.process === "object"
        ? (display.process as Record<string, unknown>)
        : null;
    const displayTarget =
      display && display.target && typeof display.target === "object"
        ? (display.target as Record<string, unknown>)
        : null;
    const displayValue =
      displayTarget && displayTarget.value && typeof displayTarget.value === "object"
        ? (displayTarget.value as Record<string, unknown>)
        : null;
    const timedOut =
      !!(activity && activity.timedOut === true) ||
      (!!displayProcess && displayProcess.timedOut === true);
    const blocked =
      activityStatus === "denied" || phase === "blocked" || phase === "denied";
    const isFailure =
      !blocked &&
      (activityStatus === "failed" || activityStatus === "timed-out" || ok === false);
    const denied = blocked;
    const exitCode =
      activity && typeof activity.exitCode === "number"
        ? activity.exitCode
        : displayProcess && typeof displayProcess.exitCode === "number"
          ? displayProcess.exitCode
          : undefined;
    const exitedNonzero =
      !timedOut && typeof exitCode === "number" && exitCode !== 0;
    const status = isFailure
      ? activityStatus === "timed-out"
        ? "timed-out"
        : "failed"
      : denied
        ? "denied"
        : exitedNonzero
          ? "exited-nonzero"
          : phase === "start" || phase === "call"
            ? "running"
            : activityStatus === "completed" || ok === true
              ? "completed"
              : activityStatus === "returned"
                ? "returned"
                : "unknown";
    const identityPhase =
      phase === "start" || phase === "result" || phase === "blocked"
        ? phase
        : row.eventKind === "denied"
          ? "blocked"
          : phase === "call"
            ? "start"
            : "result";
    const item: ActivityItem = {
      toolName,
      target,
      status,
      statusText: "",
      summary: text,
      visibleSummary: head,
      deniedSummary: "",
      callId:
        activity && typeof activity.toolCallId === "string"
          ? activity.toolCallId
          : activity && typeof activity.callId === "string"
            ? activity.callId
            : undefined,
      turnId,
      phase,
      identityPhase,
      denied,
      failed: isFailure,
      exceptional: denied || isFailure || timedOut,
      barrier: false,
      origin: "history",
      at:
        typeof row.at === "string"
          ? row.at
          : activity && typeof activity.at === "string"
            ? activity.at
            : "",
      exitCode,
      timedOut,
      completed: activityStatus === "completed" || ok === true,
      returned: activityStatus === "returned",
      hasDisplay: !!display,
      display: display || undefined,
      fullTarget:
        (displayValue && typeof displayValue.text === "string" ? displayValue.text : "") ||
        target,
      legacyTextProjection:
        row.textProjection && typeof row.textProjection === "object"
          ? row.textProjection
          : undefined,
      metadataOmissions: Array.isArray(row.metadataOmissions)
        ? row.metadataOmissions
        : undefined,
      legacyStatusSource:
        typeof row.legacyStatusSource === "string" ? row.legacyStatusSource : undefined,
    };
    item.label = activityPhaseLabel(item, locale);
    const statusView = toolStatus(item, locale);
    item.status = statusView.status;
    item.statusText = statusView.statusText;
    if (display || isSpecialTool(item.toolName)) {
      return {
        ...base,
        kind: "tool-lifecycle",
        data: { activity: item },
        callId: item.callId,
      };
    }
    return {
      ...base,
      kind: "activities",
      data: { items: [item], turnId: turnId || "" },
      callId: item.callId,
    };
  }
  if (kind === "denied") {
    if (row.eventKind === "denied") {
      return {
        ...base,
        kind: "system",
        data: { cls: "sys-call", text },
      };
    }
    // 旧文本分类行只直显首行（安全摘要）；完整原文/stdout 不铺进聊天（旧 legacy 投影同向）。
    const head = text.split(/\r?\n/)[0].trim() || text;
    const target =
      typeof row.target === "string" && row.target !== ""
        ? row.target
        : /^read_file 失败：(.+)（.+）$/.exec(head)?.[1] ||
          /（目标：([^）]+)）/.exec(head)?.[1] ||
          /已执行：(.+)（exit /.exec(head)?.[1] ||
          /失败：(.+)（.+）$/.exec(head)?.[1] ||
          "";
    return {
      ...base,
      kind: "denied",
      data: {
        text: head,
        target,
        projection: row.textProjection,
        metadataOmissions: row.metadataOmissions,
        legacyStatusSource: row.legacyStatusSource,
        legacy: row.legacyStatusSource === "legacy-classifier",
      },
    };
  }
  return {
    ...base,
    kind: "system",
    data: {
      cls: "sys-call",
      text: text || translate(locale, "ui.events.historyRecord"),
    },
  };
}
