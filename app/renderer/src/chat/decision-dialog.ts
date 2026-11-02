/**
 * 决策对话框/待办/历史的纯逻辑（E 批，2026-10-28）。
 *
 * 只按主进程已推送的 operator 请求事实转写：来源角色、标题、选项、推荐项、风险；
 * 不读文件、不判边界、不代答。优先级只按卡种/显式 risk 字段：
 *   高风险（risk:"high"/destructive） > 审批（appointment-write） > decision > 低风险确认。
 * 同优先级按到达序（pendingOperator 插入序 / 传入 order）FIFO。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";

export interface DecisionOptionView {
  id: string;
  label: string;
  description?: string;
  recommended: boolean;
}

export interface DecisionView {
  id: string;
  sourceRoleId: string;
  kind: "confirm" | "choice";
  title: string;
  question: string;
  preview: string;
  detail: string;
  cardKind: string;
  paths: string[];
  options: DecisionOptionView[];
  multiple: boolean;
  recommendedId: string | null;
  judgeNotice: string;
  priority: 0 | 1 | 2 | 3;
  highRisk: boolean;
  destructive: boolean;
  /** 内容是否足以作答（缺标题/选项/请求体为 false）。 */
  answerable: boolean;
  /** 验收决定卡（`request.cardKind === "acceptance"`）；普通卡 false。 */
  acceptance: boolean;
  /** 验收报告显示视图；仅验收卡且 payload 合法时非 null（本地防御读取结果，不是共享 Model）。 */
  acceptanceReport: AcceptanceReportView | null;
}

/**
 * 渲染侧验收报告视图：`payload.acceptanceReport` 经防御读取后的展示值。
 * 只用于渲染，不进入报告快照/任务账本/持久化，不新增共享类型。
 */
export interface AcceptanceReportView {
  version: 1;
  path: string;
  text: string;
  redacted: boolean;
  truncated: boolean;
}

const ACCEPTANCE_REPORT_MAX_BYTES = 16384;

const DECISION_KINDS = new Set(["proposal", "appointment", "acceptance", "intent-confirm", "decision"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * 防御读取验收报告展示载荷：version=1、text 为字符串、redacted/truncated 为布尔、
 * path 为字符串、UTF-8 字节数 <= 16384；任一不合法返回 null（不抛、不猜、不二次截断）。
 */
function readAcceptanceReport(payload: unknown): AcceptanceReportView | null {
  const raw = asRecord(asRecord(payload).acceptanceReport);
  if (raw.version !== 1) return null;
  const body = asRecord(raw.text);
  if (typeof body.text !== "string") return null;
  if (typeof body.redacted !== "boolean") return null;
  if (typeof body.truncated !== "boolean") return null;
  if (typeof raw.path !== "string") return null;
  if (new TextEncoder().encode(body.text).byteLength > ACCEPTANCE_REPORT_MAX_BYTES) return null;
  return {
    version: 1,
    path: raw.path,
    text: body.text,
    redacted: body.redacted,
    truncated: body.truncated,
  };
}

/** preview 去重判据：仅统一换行/去首尾空白后完全相等才视为重复（不做空白压缩）。 */
export function sameDisplayText(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n").trim();
  return normalize(left) === normalize(right);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : [];
}

export function decisionRequestOf(payload: unknown): Record<string, unknown> {
  return asRecord(asRecord(payload).request);
}

export function decisionSourceRoleId(payload: unknown): string {
  return text(asRecord(payload).roleId);
}

export function decisionCardKind(payload: unknown): string {
  const request = decisionRequestOf(payload);
  return text(request.cardKind) || text(asRecord(payload).cardKind);
}

export function decisionPriority(payload: unknown): 0 | 1 | 2 | 3 {
  const request = decisionRequestOf(payload);
  const record = asRecord(payload);
  if (record.risk === "high" || request.risk === "high" || request.destructive === true) return 0;
  const cardKind = decisionCardKind(payload);
  if (cardKind === "appointment-write") return 1;
  if (DECISION_KINDS.has(cardKind)) return 2;
  return 3;
}

/** 高风险/不可逆：需要二次确认。 */
export function isDestructiveDecision(payload: unknown): boolean {
  const request = decisionRequestOf(payload);
  return (
    decisionPriority(payload) === 0 ||
    decisionCardKind(payload) === "appointment-write" ||
    request.destructive === true
  );
}

export function decisionView(payload: unknown, locale: Locale = DEFAULT_LOCALE): DecisionView {
  const request = decisionRequestOf(payload);
  const kindRaw = text(request.kind);
  const kind = kindRaw === "choice" ? "choice" : "confirm";
  const options: DecisionOptionView[] = Array.isArray(request.options)
    ? request.options
        .map((item): DecisionOptionView | null => {
          const option = asRecord(item);
          const id = text(option.id);
          const label = text(option.label) || id;
          if (id === "") return null;
          return {
            id,
            label,
            ...(text(option.description) !== "" ? { description: text(option.description) } : {}),
            recommended: option.recommended === true,
          };
        })
        .filter((item): item is DecisionOptionView => item !== null)
    : [];
  const recommended = options.filter((option) => option.recommended);
  const title = text(request.title) || translate(locale, "ui.decisionDialog.titleFallback");
  const cardKind = decisionCardKind(payload);
  const acceptance = cardKind === "acceptance";
  return {
    id: text(asRecord(payload).id),
    sourceRoleId: decisionSourceRoleId(payload),
    kind,
    title,
    question: text(request.question),
    preview: text(request.preview),
    detail: text(request.detail),
    cardKind,
    acceptance,
    acceptanceReport: acceptance ? readAcceptanceReport(payload) : null,
    paths: stringList(request.paths),
    options,
    multiple: request.multiple === true,
    recommendedId: recommended.length === 1 ? recommended[0]!.id : null,
    judgeNotice: text(asRecord(payload).judgeNotice),
    priority: decisionPriority(payload),
    highRisk: decisionPriority(payload) === 0,
    destructive: isDestructiveDecision(payload),
    answerable: kind === "confirm" || options.length > 0,
  };
}

/** 按优先级 + 到达序排序；deferred 中的 id 不参与自动弹出，但保留在待办计数。 */
export function orderedDecisionIds(
  pending: Record<string, Record<string, unknown>>,
  order: readonly string[] = [],
): string[] {
  const index = new Map(order.map((id, position) => [id, position]));
  return Object.entries(pending)
    .map(([id, payload], insertion) => ({
      id,
      priority: decisionPriority(payload),
      position: index.get(id) ?? order.length + insertion,
    }))
    .sort((a, b) => a.priority - b.priority || a.position - b.position)
    .map((item) => item.id);
}

export function nextDecisionId(
  pending: Record<string, Record<string, unknown>>,
  deferred: readonly string[],
  order: readonly string[] = [],
  exclude: string | null = null,
): string | null {
  const deferredSet = new Set(deferred);
  return (
    orderedDecisionIds(pending, order).find(
      (id) => id !== exclude && !deferredSet.has(id) && pending[id] !== undefined,
    ) ?? null
  );
}

export function pendingMoreCount(
  pending: Record<string, Record<string, unknown>>,
  activeId: string | null,
): number {
  return Object.keys(pending).filter((id) => id !== activeId).length;
}

/** E-05：是否打开/替换当前卡（纯判定）。
 *  - 无活动卡：空闲时打开最优；输入中只有高风险可立即打断；
 *  - 已有活动卡：只允许更高优先级的高风险（priority 0）替换，其余排队到当前卡处理完。
 */
export function shouldOpenDecision(input: {
  activePriority: number | null;
  bestPriority: number;
  suppressed: boolean;
}): boolean {
  const highRisk = input.bestPriority === 0;
  if (input.activePriority === null) return !input.suppressed || highRisk;
  return highRisk && input.activePriority > 0;
}
