/**
 * 流程状态面板纯逻辑（2026-10-25）：`window.desktop.getFlowStatus` 回执归一化、
 * 七态/四 kind 映射、默认过滤、进度与头部徽标、5s/30s 拉取助手。
 *
 * 只读：不写文件、不缓存流程事实；坏文件只进 errors，不阻断其他流程。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import { shortTime } from "./tool-summary.ts";

export type FlowStepStatus =
  | "pending"
  | "dispatched"
  | "delivered"
  | "done"
  | "failed"
  | "blocked"
  | "superseded";
export type FlowStepDisplayStatus = FlowStepStatus | "unknown";

export interface FlowStatusStep {
  id: string;
  title: string;
  kind: string;
  owner: string;
  status: FlowStepDisplayStatus;
}

export interface FlowStatusCounts {
  total: number;
  done: number;
  delivered: number;
  dispatched: number;
  pending: number;
  failed: number;
  blocked: number;
  superseded: number;
}

export interface FlowStatusFlow {
  flowId: string;
  revision?: string;
  steps: FlowStatusStep[];
  counts: FlowStatusCounts;
  current: string[];
  updatedAt: string;
}

export interface FlowStatusFileError {
  file: string;
  error: string;
}

export interface FlowStatusReply {
  ok: boolean;
  flows?: FlowStatusFlow[];
  errors?: FlowStatusFileError[];
  error?: string;
}

export interface FlowStatusBridge {
  getFlowStatus?: (projectRoot: string) => Promise<unknown>;
}

export interface FlowStepView {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  owner: string;
  status: FlowStepDisplayStatus;
  statusLabel: string;
  statusClass: string;
}

export interface FlowStatusErrorView {
  file: string;
  detail: string;
}

export interface FlowView {
  flowId: string;
  revision: string;
  steps: FlowStepView[];
  currentSteps: FlowStepView[];
  counts: FlowStatusCounts;
  current: string[];
  updatedAt: string;
  updatedAtText: string;
  done: number;
  total: number;
  progressText: string;
  progressPercent: number;
  visibleSteps: FlowStepView[];
  hasDoneSteps: boolean;
}

export type FlowStatusModel =
  | { kind: "loading" }
  | {
      kind: "ready";
      flows: FlowView[];
      errors: FlowStatusErrorView[];
      done: number;
      total: number;
    }
  | { kind: "unavailable" }
  | { kind: "error"; detail: string };

export interface FlowBadgeView {
  visible: boolean;
  text: string;
  title: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeFlowStepStatus(
  value: unknown,
): FlowStepDisplayStatus {
  if (
    value === "pending" ||
    value === "dispatched" ||
    value === "delivered" ||
    value === "done" ||
    value === "failed" ||
    value === "blocked" ||
    value === "superseded"
  ) {
    return value;
  }
  return "unknown";
}

export function flowStepStatusView(
  status: FlowStepDisplayStatus,
  locale: Locale = DEFAULT_LOCALE,
): { label: string; className: string } {
  switch (status) {
    case "pending":
      return { label: translate(locale, "ui.flow.state.pending"), className: "is-pending" };
    case "dispatched":
      return { label: translate(locale, "ui.flow.state.dispatched"), className: "is-dispatched" };
    case "delivered":
      return { label: translate(locale, "ui.flow.state.delivered"), className: "is-delivered" };
    case "done":
      return { label: translate(locale, "ui.flow.state.done"), className: "is-done" };
    case "failed":
      return { label: translate(locale, "ui.flow.state.failed"), className: "is-failed" };
    case "blocked":
      return { label: translate(locale, "ui.flow.state.blocked"), className: "is-blocked" };
    case "superseded":
      return { label: translate(locale, "ui.flow.state.superseded"), className: "is-superseded" };
    default:
      return {
        label: translate(locale, "shared.common.unknownStatus"),
        className: "is-unknown",
      };
  }
}

/** kind 原值可能是 `customer-decision`（YAML）或 camelCase；统一映射到既有 key。 */
export function flowStepKindLabel(
  kind: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (kind === "artifact") return translate(locale, "ui.flow.kind.artifact");
  if (kind === "dispatch") return translate(locale, "ui.flow.kind.dispatch");
  if (
    kind === "customer-decision" ||
    kind === "customer_decision" ||
    kind === "customerDecision"
  ) {
    return translate(locale, "ui.flow.kind.customerDecision");
  }
  if (kind === "acceptance") return translate(locale, "ui.flow.kind.acceptance");
  return kind || translate(locale, "shared.common.unknown");
}

export function countFlowSteps(
  steps: readonly Pick<FlowStatusStep, "status">[],
): FlowStatusCounts {
  const counts: FlowStatusCounts = {
    total: steps.length,
    done: 0,
    delivered: 0,
    dispatched: 0,
    pending: 0,
    failed: 0,
    blocked: 0,
    superseded: 0,
  };
  for (const step of steps) {
    if (
      step.status === "done" ||
      step.status === "delivered" ||
      step.status === "dispatched" ||
      step.status === "pending" ||
      step.status === "failed" ||
      step.status === "blocked" ||
      step.status === "superseded"
    ) {
      counts[step.status] += 1;
    }
  }
  return counts;
}

export function normalizeFlowCounts(
  raw: unknown,
  steps: readonly FlowStatusStep[],
): FlowStatusCounts {
  const record = asRecord(raw);
  const computed = countFlowSteps(steps);
  const total = steps.length;
  return {
    total,
    done: Math.min(total, asCount(record.done, computed.done)),
    delivered: asCount(record.delivered, computed.delivered),
    dispatched: asCount(record.dispatched, computed.dispatched),
    pending: asCount(record.pending, computed.pending),
    failed: asCount(record.failed, computed.failed),
    blocked: asCount(record.blocked, computed.blocked),
    superseded: asCount(record.superseded, computed.superseded),
  };
}

export function normalizeFlowStep(raw: unknown): FlowStatusStep | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (id === "") return null;
  return {
    id,
    title: asString(record.title) || id,
    kind: asString(record.kind),
    owner: asString(record.owner),
    status: normalizeFlowStepStatus(record.status),
  };
}

/** current 按 YAML 步骤顺序（不是 current 数组顺序）；未知 id 跳过。 */
export function flowCurrentSteps(
  steps: readonly FlowStatusStep[],
  current: readonly string[],
): FlowStatusStep[] {
  const ids = new Set(current);
  return steps.filter((step) => ids.has(step.id));
}

/** 默认只显示未完成（含 superseded）+ current；展开显示全部。 */
export function flowVisibleSteps(
  steps: readonly FlowStatusStep[],
  current: readonly string[],
  expanded: boolean,
): FlowStatusStep[] {
  if (expanded) return steps.slice();
  const currentIds = new Set(current);
  return steps.filter(
    (step) => step.status !== "done" || currentIds.has(step.id),
  );
}

function stepView(step: FlowStatusStep, locale: Locale): FlowStepView {
  const state = flowStepStatusView(step.status, locale);
  return {
    id: step.id,
    title: step.title,
    kind: step.kind,
    kindLabel: flowStepKindLabel(step.kind, locale),
    owner: step.owner,
    status: step.status,
    statusLabel: state.label,
    statusClass: state.className,
  };
}

export function flowStatusView(
  raw: unknown,
  locale: Locale = DEFAULT_LOCALE,
): FlowView | null {
  const record = asRecord(raw);
  const flowId = asString(record.flowId);
  if (flowId === "") return null;
  const steps: FlowStatusStep[] = [];
  for (const item of asArray(record.steps)) {
    const step = normalizeFlowStep(item);
    if (step) steps.push(step);
  }
  const current = asArray(record.current)
    .map((id) => asString(id))
    .filter((id) => id !== "");
  const counts = normalizeFlowCounts(record.counts, steps);
  const currentSteps = flowCurrentSteps(steps, current);
  const visibleSteps = flowVisibleSteps(steps, current, false);
  const done = counts.done;
  const total = counts.total;
  return {
    flowId,
    revision: asString(record.revision),
    steps: steps.map((step) => stepView(step, locale)),
    currentSteps: currentSteps.map((step) => stepView(step, locale)),
    counts,
    current,
    updatedAt: asString(record.updatedAt),
    updatedAtText: shortTime(asString(record.updatedAt)),
    done,
    total,
    progressText: translate(locale, "ui.flow.progress", { done, total }),
    progressPercent:
      total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0,
    visibleSteps: visibleSteps.map((step) => stepView(step, locale)),
    hasDoneSteps: steps.some((step) => step.status === "done"),
  };
}

/** getFlowStatus 回执 → 视图模型；方法缺失/无项目即 unavailable。 */export async function loadFlowStatus(
  bridge: FlowStatusBridge | null | undefined,
  projectRoot: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<FlowStatusModel> {
  if (!bridge || typeof bridge.getFlowStatus !== "function" || !projectRoot) {
    return { kind: "unavailable" };
  }
  try {
    const reply = asRecord(await bridge.getFlowStatus(projectRoot));
    if (reply.ok !== true) {
      return {
        kind: "error",
        detail: asString(reply.error) || translate(locale, "shared.common.unknownReason"),
      };
    }
    const flows: FlowView[] = [];
    for (const raw of asArray(reply.flows)) {
      const view = flowStatusView(raw, locale);
      if (view) flows.push(view);
    }
    const errors: FlowStatusErrorView[] = asArray(reply.errors)
      .map((raw) => {
        const record = asRecord(raw);
        const file = asString(record.file);
        return file
          ? { file, detail: asString(record.error) }
          : null;
      })
      .filter((error): error is FlowStatusErrorView => error !== null);
    return {
      kind: "ready",
      flows,
      errors,
      done: flows.reduce((sum, flow) => sum + flow.done, 0),
      total: flows.reduce((sum, flow) => sum + flow.total, 0),
    };
  } catch (error) {
    return {
      kind: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 头部小徽标：聚合 done/total，title 显示各流程当前步骤 + 最近更新时间。 */
export function flowBadgeView(
  model: FlowStatusModel,
  locale: Locale = DEFAULT_LOCALE,
): FlowBadgeView {
  if (model.kind !== "ready" || model.flows.length === 0) {
    return { visible: false, text: "", title: "" };
  }
  const parts: string[] = [];
  for (const flow of model.flows) {
    if (flow.currentSteps.length === 0) continue;
    parts.push(
      flow.flowId +
        " " +
        translate(locale, "ui.flow.current") +
        "：" +
        flow.currentSteps.map((step) => step.title).join("、"),
    );
  }
  const updated = model.flows
    .map((flow) => flow.updatedAtText)
    .filter((text) => text !== "")
    .sort()
    .pop();
  if (updated) {
    parts.push(translate(locale, "ui.flow.updatedAt") + " " + updated);
  }
  return {
    visible: true,
    text: model.done + "/" + model.total,
    title: parts.join(" · "),
  };
}

/**
 * 拉取助手：立即拉一次（窗口隐藏时跳过），之后按 intervalMs 拉取；
 * 返回清理函数。schedule/cancel/isHidden 可注入，便于单测。
 */
export function startFlowStatusPolling(
  load: () => void,
  intervalMs = 30000,
  options: {
    isHidden?: () => boolean;
    schedule?: (handler: () => void, timeout: number) => unknown;
    cancel?: (id: unknown) => void;
  } = {},
): () => void {
  const isHidden = options.isHidden || (() => false);
  const schedule =
    options.schedule ||
    ((handler, timeout) => window.setInterval(handler, timeout));
  const cancel =
    options.cancel ||
    ((id) => window.clearInterval(id as ReturnType<typeof window.setInterval>));
  const run = () => {
    if (!isHidden()) load();
  };
  run();
  const id = schedule(run, intervalMs);
  return () => cancel(id);
}
