// src/common/编排/version-decision.ts
// 幕僚版本决策的纯逻辑（2026-11-02，A1）。I/O 由 A2 会话层注入/执行；本模块不读盘、不写盘。
//
// 契约（PM 复审冻结）：
//   · 两动作固定 `version-modify` / `new-version-development`；卡内恰一 recommended = 幕僚 action。
//   · 执行期 pinned（两 action 统一）→ `failed/run-change-required`，零执行（不 ensure/不改文档/不写目标版本）。
//   · 非法答案归一化 declined + `reason:"invalid-selection"`；零执行、不写 `version.decision`；F5 不视为 answered。
//   · R2：timeout/unavailable → `request.resolved`；initiator-aborted → `request.orphaned`；late → 仅诊断。
//   · R3：F5 扫描排除已 orphaned 与已有任意 `version.decision` 的请求（failed 不被误判 uncertain）。
//   · R4：new-version-development 的关闭范围 = 旧 flow 全部活动 run；请求 runId 只作决策上下文。

import { randomUUID } from "node:crypto";

import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type {
  CustomerInputRequest,
  TaskStateEvent,
} from "../../model/runtime.ts";
import {
  VERSION_DECISION_ACTIONS,
  VERSION_DECISION_REASON_MAX,
  VERSION_DECISION_REFS_MAX,
  VERSION_DECISION_SCHEMA,
} from "../../model/project-state.ts";
import type {
  ProjectStateDocKind,
  VersionDecisionAction,
  VersionDecisionCard,
  VersionDecisionCardOption,
  VersionDecisionDecidedBy,
  VersionDecisionFacts,
  VersionDecisionRequest,
} from "../../model/project-state.ts";
import { isRunId } from "./run-manifest.ts";
import type { ActiveRunDerivation } from "./project-state.ts";

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const VERSION_DECISION_ACTION_SET: ReadonlySet<string> = new Set(VERSION_DECISION_ACTIONS);
const REQUEST_KEYS: ReadonlySet<string> = new Set(["flowId", "runId", "action", "reason", "refs"]);

/** 版本修改的目标版本 kind（topology 随 roster，不单列）。 */
export type VersionTargetDocKind = Exclude<ProjectStateDocKind, "topology">;
export const VERSION_TARGET_DOC_KINDS: readonly VersionTargetDocKind[] = [
  "intent", "proposal", "modules", "roster", "architecture", "assets",
];

function isVersionDecisionAction(value: unknown): value is VersionDecisionAction {
  return typeof value === "string" && VERSION_DECISION_ACTION_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProjectRelativeRef(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:[\\/]/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

// —————————————— 请求校验 ——————————————

export type VersionDecisionRequestValidation =
  | { ok: true; request: VersionDecisionRequest }
  | { ok: false; code: "version-decision-invalid"; message: string };

/**
 * 严格参数面（未知键/非法值一律拒绝；不读盘）。A2 在写 `request.created` 之前调用。
 */
export function validateVersionDecisionRequest(raw: unknown): VersionDecisionRequestValidation {
  if (!isRecord(raw)) return { ok: false, code: "version-decision-invalid", message: "请求必须是对象" };
  for (const key of Object.keys(raw)) {
    if (!REQUEST_KEYS.has(key)) return { ok: false, code: "version-decision-invalid", message: `未知参数：${key}` };
  }
  const flowId = raw["flowId"];
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "version-decision-invalid", message: "flowId 必须为治理 slug" };
  }
  const runId = raw["runId"];
  if (runId !== undefined && (typeof runId !== "string" || !isRunId(runId))) {
    return { ok: false, code: "version-decision-invalid", message: "runId 非法" };
  }
  const action = raw["action"];
  if (!isVersionDecisionAction(action)) {
    return { ok: false, code: "version-decision-invalid", message: `action 必须为 ${VERSION_DECISION_ACTIONS.join(" / ")} 之一` };
  }
  const reason = raw["reason"];
  if (typeof reason !== "string" || reason.trim() === "") {
    return { ok: false, code: "version-decision-invalid", message: "reason 必填" };
  }
  if (Array.from(reason).length > VERSION_DECISION_REASON_MAX) {
    return { ok: false, code: "version-decision-invalid", message: `reason 超过 ${VERSION_DECISION_REASON_MAX} 字符` };
  }
  const refs = raw["refs"];
  if (refs !== undefined) {
    if (!Array.isArray(refs) || refs.length > VERSION_DECISION_REFS_MAX || !refs.every(isProjectRelativeRef)) {
      return { ok: false, code: "version-decision-invalid", message: `refs 必须为 ≤${VERSION_DECISION_REFS_MAX} 项项目相对引用` };
    }
  }
  return {
    ok: true,
    request: {
      flowId,
      ...(runId !== undefined ? { runId } : {}),
      action,
      reason,
      ...(refs !== undefined && refs.length > 0 ? { refs: [...refs] } : {}),
    },
  };
}

// —————————————— 前置事实（pinned / 多 run / pending） ——————————————

export interface VersionDecisionContextInput {
  /** A2 在执行前重新 `scanRunManifestsForState` + `deriveActiveRunFromManifests` 的结果。 */
  derivation: ActiveRunDerivation;
  requestedRunId?: string;
  hasPending: boolean;
}

export type VersionDecisionContextResult =
  | { ok: true; runId?: string }
  | { ok: false; code: "run-change-required" | "run-ambiguous" | "decision-pending"; message: string };

/**
 * 版本决策前置：任一 pinned/多 pinned 冲突 → run-change；多个活动 run 未给/给错 runId → run-ambiguous；
 * 有未决请求 → decision-pending；legacy/无 run → ok（runId 缺省）。
 */
export function validateVersionDecisionContext(input: VersionDecisionContextInput): VersionDecisionContextResult {
  const { derivation } = input;
  if (derivation.conflict !== undefined || derivation.activeRuns.some((run) => run.state === "pinned")) {
    return {
      ok: false,
      code: "run-change-required",
      message: "当前 flow 存在 pinned（或多个 pinned 冲突）；版本决策不适用，请走 run-change（契约变更 · 重开 run）",
    };
  }
  const activeRuns = derivation.activeRuns;
  if (input.requestedRunId !== undefined) {
    if (!activeRuns.some((run) => run.runId === input.requestedRunId)) {
      return { ok: false, code: "run-ambiguous", message: `runId ${input.requestedRunId} 不属于该 flow 的活动 run` };
    }
  } else if (activeRuns.length > 1) {
    return { ok: false, code: "run-ambiguous", message: `flow 有 ${activeRuns.length} 个活动 run；请指定 runId` };
  }
  if (input.hasPending) {
    return { ok: false, code: "decision-pending", message: "同一 flow/run 已有未决版本决策" };
  }
  const runId = input.requestedRunId ?? (activeRuns.length === 1 ? activeRuns[0]!.runId : undefined);
  return { ok: true, ...(runId !== undefined ? { runId } : {}) };
}

// —————————————— 卡构造 ——————————————

/** 卡面文案注入（A3 `ui.versionDecision.*`；A1 不硬编码文案）。disclaimer 必须含「全部活动 run」与「路线≠内容批准」。 */
export interface VersionDecisionCardLabels {
  title: string;
  question: string;
  disclaimer: string;
  optionVersionModify: string;
  optionNewVersionDevelopment: string;
  optionVersionModifyDescription?: string;
  optionNewVersionDevelopmentDescription?: string;
  preview?: string;
}

export interface VersionDecisionCardInput {
  requestId: string;
  flowId: string;
  runId?: string;
  action: VersionDecisionAction;
  reason: string;
  facts: VersionDecisionFacts;
  labels: VersionDecisionCardLabels;
}

/**
 * 构造 application-owned decision 卡结构。A2 再用 `versionDecisionCardToRequest` 附加
 * `cardKind:"decision"`/`application:true`/`sourceRoleId:"application"` 并交 `validateDecisionCardRequest`。
 */
export function buildVersionDecisionCard(input: VersionDecisionCardInput): VersionDecisionCard {
  if (!isVersionDecisionAction(input.action)) throw new Error(`非法版本决策动作：${String(input.action)}`);
  const options: VersionDecisionCardOption[] = VERSION_DECISION_ACTIONS.map((action) => ({
    id: action,
    label: action === "version-modify" ? input.labels.optionVersionModify : input.labels.optionNewVersionDevelopment,
    ...(action === "version-modify"
      ? (input.labels.optionVersionModifyDescription !== undefined ? { description: input.labels.optionVersionModifyDescription } : {})
      : (input.labels.optionNewVersionDevelopmentDescription !== undefined ? { description: input.labels.optionNewVersionDevelopmentDescription } : {})),
    ...(action === input.action ? { recommended: true } : {}),
  }));
  return {
    schema: VERSION_DECISION_SCHEMA,
    requestId: input.requestId,
    flowId: input.flowId,
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    action: input.action,
    reason: input.reason,
    facts: input.facts,
    title: input.labels.title,
    question: `${input.labels.question}\n${input.labels.disclaimer}`,
    options,
    ...(input.labels.preview !== undefined ? { preview: input.labels.preview } : {}),
  };
}

/** 把 A0 卡结构转成 `CustomerInputRequest`（application-owned decision）；A2 呈现前调用。 */
export function versionDecisionCardToRequest(card: VersionDecisionCard): CustomerInputRequest {
  return {
    kind: "choice",
    title: card.title,
    question: card.question,
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: card.flowId,
    options: card.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.description !== undefined ? { description: option.description } : {}),
      ...(option.recommended === true ? { recommended: true } : {}),
    })),
    ...(card.preview !== undefined ? { preview: card.preview } : {}),
  };
}

// —————————————— targetVersions ——————————————

/**
 * 目标版本 = 已存在文档最新版本 + 1；缺失 kind → 1；topology 随 roster，不单列。
 * 只作为建议/审计，不创建文件（A2 只写 `version.decision.targetVersions`）。
 */
export function computeTargetVersions(
  latest: Partial<Record<VersionTargetDocKind, number>> = {},
): Record<VersionTargetDocKind, number> {
  const targets = {} as Record<VersionTargetDocKind, number>;
  for (const kind of VERSION_TARGET_DOC_KINDS) {
    const version = latest[kind];
    targets[kind] = typeof version === "number" && Number.isInteger(version) && version >= 1 ? version + 1 : 1;
  }
  return targets;
}

// —————————————— 答案映射（R2） ——————————————

export type VersionDecisionAnswerOutcome = "answered" | "declined" | "timeout" | "unavailable" | "aborted" | "late";

export interface VersionDecisionAnswerInput {
  outcome: VersionDecisionAnswerOutcome;
  /** 通道实际裁决人；answered/declined/unavailable 应给出。2026-11-03 Q9 A：加 `"directive"`。 */
  by?: VersionDecisionDecidedBy;
  selected?: readonly unknown[];
  choice?: unknown;
  reason?: string;
}

export type VersionDecisionAnswerPlan =
  | { kind: "execute"; action: VersionDecisionAction; decidedBy: VersionDecisionDecidedBy; selectedOptionIds: [VersionDecisionAction] }
  | { kind: "resolve-declined"; choice: "declined"; reason?: string; by?: VersionDecisionDecidedBy }
  | { kind: "resolve-unavailable"; choice: "unavailable"; reason?: string; by?: VersionDecisionDecidedBy }
  | { kind: "orphan"; reason: "initiator-aborted" }
  | { kind: "late"; reason: "late-answer" };

/**
 * 兼容窄重载（2026-11-03 Q9 A）：旧调用方（`app/desktop/session.ts` 在 C1 更新前）的 `decidedBy`
 * 静态上仍是 `"customer" | "judge"`；命中窄重载时返回值也收窄为同二值，避免把 `"directive"` 泄漏给
 * 尚未按三值处理的旧读者（AC-15）。C1 把变量扩为三值后自动选择宽签名；运行期实现完全相同。
 */
export type VersionDecisionAnswerInputNarrow = Omit<VersionDecisionAnswerInput, "by"> & {
  by?: "customer" | "judge";
};

export type VersionDecisionAnswerPlanNarrow =
  | { kind: "execute"; action: VersionDecisionAction; decidedBy: "customer" | "judge"; selectedOptionIds: [VersionDecisionAction] }
  | { kind: "resolve-declined"; choice: "declined"; reason?: string; by?: "customer" | "judge" }
  | { kind: "resolve-unavailable"; choice: "unavailable"; reason?: string; by?: "customer" | "judge" }
  | { kind: "orphan"; reason: "initiator-aborted" }
  | { kind: "late"; reason: "late-answer" };

/**
 * R2 纯映射：
 * · answered + 恰一合法 action → execute（by 缺失按非法答案处理）；
 * · declined → request.resolved(declined)；timeout/unavailable → request.resolved(unavailable)；
 * · initiator-aborted → request.orphaned(initiator-aborted)；
 * · late（已中止/orphaned 后）→ 仅诊断，不写 resolved、不执行；
 * · 非法/未知/多选/缺 by → 归一化 resolved declined + reason:"invalid-selection"（零执行）。
 */
export function mapVersionDecisionAnswer(input: VersionDecisionAnswerInputNarrow): VersionDecisionAnswerPlanNarrow;
export function mapVersionDecisionAnswer(input: VersionDecisionAnswerInput): VersionDecisionAnswerPlan;
export function mapVersionDecisionAnswer(input: VersionDecisionAnswerInput): VersionDecisionAnswerPlan {
  if (input.outcome === "late") return { kind: "late", reason: "late-answer" };
  if (input.outcome === "aborted") return { kind: "orphan", reason: "initiator-aborted" };
  if (input.outcome === "declined") {
    return { kind: "resolve-declined", choice: "declined", ...(input.reason !== undefined ? { reason: input.reason } : {}), ...(input.by !== undefined ? { by: input.by } : {}) };
  }
  if (input.outcome === "timeout" || input.outcome === "unavailable") {
    return { kind: "resolve-unavailable", choice: "unavailable", ...(input.reason !== undefined ? { reason: input.reason } : {}), ...(input.by !== undefined ? { by: input.by } : {}) };
  }
  const selected = Array.isArray(input.selected)
    ? input.selected
    : input.choice !== undefined
      ? [input.choice]
      : [];
  const action = selected[0];
  if (selected.length === 1 && isVersionDecisionAction(action) && input.by !== undefined) {
    return {
      kind: "execute",
      action,
      decidedBy: input.by,
      selectedOptionIds: [action],
    };
  }
  return {
    kind: "resolve-declined",
    choice: "declined",
    reason: "invalid-selection",
    ...(input.by !== undefined ? { by: input.by } : {}),
  };
}

// —————————————— 执行计划 ——————————————

export interface VersionDecisionExecutionInput {
  action: VersionDecisionAction;
  flowId: string;
  /** 执行前重新读取的活动 run（不是发卡时的旧快照）。 */
  derivation: ActiveRunDerivation;
  requestedRunId?: string;
  hasPending: boolean;
  latestVersions?: Partial<Record<VersionTargetDocKind, number>>;
  pendingRequestIds?: readonly string[];
}

export type VersionDecisionExecutionPlan =
  | {
      kind: "fail";
      code: "version-decision-invalid" | "run-change-required" | "run-ambiguous" | "decision-pending";
      message: string;
      /** 仅在执行期 pinned 时给出：A2 写 `version.decision(status:"failed", message:"run-change-required")`。 */
      audit?: { status: "failed"; message: "run-change-required" };
    }
  | {
      kind: "version-modify";
      action: "version-modify";
      flowId: string;
      runId?: string;
      targetVersions: Record<VersionTargetDocKind, number>;
      needsRunAnchor: boolean;
    }
  | {
      kind: "new-version-development";
      action: "new-version-development";
      oldFlowId: string;
      requestedRunId?: string;
      /** A2 直接写入 `version.decision.closedRunIds`（R4/AC-5）。 */
      closedRunIds: string[];
      /** 同一列表的语义别名（关闭范围 = 旧 flow 全部活动 run）。 */
      oldActiveRunIds: string[];
      orphanRequestIds: string[];
      closeReasonPrefix: "superseded-by:";
    };

/**
 * 执行计划（纯）。两 action 统一在执行前复核 pinned：任一 pinned/多 pinned 冲突 →
 * `failed/run-change-required` 审计 + 零执行（无 targetVersions/closedRunIds/orphan）。
 * new-version-development 的 `oldActiveRunIds` 永远是旧 flow 的全部活动 run；`requestedRunId` 只作上下文。
 */
export function planVersionDecisionExecution(input: VersionDecisionExecutionInput): VersionDecisionExecutionPlan {
  if (!isVersionDecisionAction(input.action)) {
    return { kind: "fail", code: "version-decision-invalid", message: "action 非法" };
  }
  const context = validateVersionDecisionContext({
    derivation: input.derivation,
    ...(input.requestedRunId !== undefined ? { requestedRunId: input.requestedRunId } : {}),
    hasPending: input.hasPending,
  });
  if (!context.ok) {
    return {
      kind: "fail",
      code: context.code,
      message: context.message,
      ...(context.code === "run-change-required"
        ? { audit: { status: "failed" as const, message: "run-change-required" as const } }
        : {}),
    };
  }
  if (input.action === "version-modify") {
    return {
      kind: "version-modify",
      action: "version-modify",
      flowId: input.flowId,
      ...(context.runId !== undefined ? { runId: context.runId } : {}),
      targetVersions: computeTargetVersions(input.latestVersions ?? {}),
      needsRunAnchor: input.derivation.activeRuns.length === 0,
    };
  }
  const closedRunIds = input.derivation.activeRuns.map((run) => run.runId);
  return {
    kind: "new-version-development",
    action: "new-version-development",
    oldFlowId: input.flowId,
    ...(input.requestedRunId !== undefined ? { requestedRunId: input.requestedRunId } : {}),
    closedRunIds,
    oldActiveRunIds: [...closedRunIds],
    orphanRequestIds: [...(input.pendingRequestIds ?? [])],
    closeReasonPrefix: "superseded-by:",
  };
}

/** R4 唯一 closeReason 格式。 */
export function supersededCloseReason(newFlowId: string, newRunId: string): string {
  return `superseded-by:${newFlowId}/${newRunId}`;
}

// —————————————— F5 崩溃窗口扫描（R3） ——————————————

export interface ResolvedWithoutExecution {
  requestId: string;
  decisionId: string;
  action: VersionDecisionAction;
  decidedBy: VersionDecisionDecidedBy;
  flowId?: string;
}

/**
 * F5：`request.resolved` 已写、无同 decisionId 的 `version.decision` 的请求（A2 重启写 uncertain）。
 * 排除：已 `request.orphaned`、已任意 `version.decision`（含 failed/run-change-required）、
 * `reason:"invalid-selection"`、非 answered、非 `version-decision-` 前缀。
 */
export function collectResolvedWithoutExecution(events: readonly TaskStateEvent[]): ResolvedWithoutExecution[] {
  const orphaned = new Set<string>();
  const audited = new Set<string>();
  const flowByRequest = new Map<string, string>();
  for (const event of events) {
    if (event.kind === "request.orphaned") orphaned.add(event.requestId);
    else if (event.kind === "version.decision") audited.add(event.decisionId);
    else if (event.kind === "request.created" && event.flowId !== undefined) flowByRequest.set(event.requestId, event.flowId);
  }
  const out: ResolvedWithoutExecution[] = [];
  for (const event of events) {
    if (event.kind !== "request.resolved") continue;
    if (event.reason === "invalid-selection") continue;
    if (orphaned.has(event.requestId)) continue;
    if (event.decisionId === undefined || event.decisionId === "") continue;
    if (audited.has(event.decisionId)) continue;
    if (!event.requestId.startsWith("version-decision-")) continue;
    if (event.cardKind !== undefined && event.cardKind !== "decision") continue;
    const selected = event.selectedOptionIds ?? [];
    const action = selected[0];
    if (selected.length !== 1 || !isVersionDecisionAction(action)) continue;
    out.push({
      requestId: event.requestId,
      decisionId: event.decisionId,
      action,
      decidedBy: event.by,
      ...(flowByRequest.has(event.requestId) ? { flowId: flowByRequest.get(event.requestId)! } : {}),
    });
  }
  return out;
}

// —————————————— requestId / attempt（F1） ——————————————

export interface VersionDecisionRequestSubject {
  flowId: string;
  /** 有 run 用 `version-decision-<runId>-...`；无 run 用 `version-decision-flow-<flowId>-...`。 */
  runId?: string;
}

function normalizeHexSuffix(hex: string | undefined): string {
  if (hex !== undefined) {
    const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8);
    return clean.padEnd(8, "0");
  }
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/** 应用生成、永不复用的 requestId（有 run/无 run 两式；P1-GTS2-02）。 */
export function versionDecisionRequestId(
  subject: VersionDecisionRequestSubject,
  now: Date = new Date(),
  hex?: string,
): string {
  const time = now.getTime().toString(36);
  const suffix = normalizeHexSuffix(hex);
  return subject.runId !== undefined
    ? `version-decision-${subject.runId}-${time}-${suffix}`
    : `version-decision-flow-${subject.flowId}-${time}-${suffix}`;
}

/**
 * attempt = 该 flow/run 的 `request.created` 数（含拒绝/中止）+ 1。
 * 结构化匹配：前缀后的剩余部分必须恰为 `<base36 时间>-<8 hex>`，避免 runId/flowId 前缀碰撞。
 */
export function versionDecisionAttempt(
  events: readonly TaskStateEvent[],
  subject: VersionDecisionRequestSubject,
): number {
  const prefix = subject.runId !== undefined
    ? `version-decision-${subject.runId}-`
    : `version-decision-flow-${subject.flowId}-`;
  let count = 0;
  for (const event of events) {
    if (event.kind !== "request.created" || !event.requestId.startsWith(prefix)) continue;
    const remainder = event.requestId.slice(prefix.length);
    const parts = remainder.split("-");
    if (parts.length !== 2) continue;
    if (!/^[a-z0-9]+$/.test(parts[0]!)) continue;
    if (!/^[0-9a-f]{8}$/.test(parts[1]!)) continue;
    count += 1;
  }
  return count + 1;
}
