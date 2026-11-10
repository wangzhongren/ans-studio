// src/common/编排/task-state.ts
// 编排主属（B 批，2026-10-28）：任务/汇报主干的最小状态。
//
// 路径：`.ans/state/tasks.jsonl`（**app-only、append-only、每行一个事件**；角色不可写）。
// 事件形状单一来源 = 契约家 `model/runtime.ts`（`TaskStateEvent`）；本模块只做：
//   · 追加（行内 JSON 定格、写失败如实返回，不抛）；
//   · 读取/重放（坏行跳过并记录，不阻塞启动；轮转文件一并按旧→新读取）；
//   · 副作用分类（幕僚声明 + 应用强制**只升不降**；缺填/非法 ⇒ unknown）；
//   · 幂等键/任务 id/任务卡/状态派生。
//
// 2026-11-04（trunk-amendment-model C2a）：新增 `trunk.state`/`trunk.amendment`/`version.change`/
// `doc.freeze`/`refactor.request`/`stable.write.*` 六类账本事件（17 → 27 kind）的读侧逐 kind 校验；
// 枚举/状态分区/归属常量全部消费 C1 Model（`model/trunk.ts`/`model/version-change.ts`/
// `model/runtime.ts`），不复制字面量、不另造同义枚举；旧事件/旧账本照常可读。
//
// 纪律：本模块不执行任务、不投递、不判定验收；`task.closed` 只由幕僚动作写入。
// `.ans/state/**` 是应用独占的运行数据（非仓库候选）；旧 gate/flow/ledger 不读本文件。

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  TaskClosedOutcome,
  TaskCreatedEvent,
  TaskDeliveredEvent,
  TaskRedispatchSafety,
  TaskReportedEvent,
  TaskReportStatus,
  TaskSideEffect,
  TaskStateEvent,
  WorkflowPath,
  WorkflowStage,
} from "../../model/runtime.ts";
import {
  GOVERNANCE_CARD_KINDS,
  STABLE_WRITE_APPLICATION_EVENT_KINDS,
  STABLE_WRITE_CUSTOMER_EVENT_KINDS,
  STABLE_WRITE_EVENT_KINDS,
  VCA_SUBMISSION_TARGETS_MAX,
  isTaskWorkSourceRef,
  isTaskParentRef,
  isTaskHubRouting,
  isTaskReviewControllerRef,
  isTaskReviewBasisRef,
  isWorkflowPath,
  isWorkflowStage,
} from "../../model/runtime.ts";
// 2026-11-04（trunk-amendment-model C2a）：新账本事件的枚举/常量单一来源 = C1 Model；
// 本模块只消费、不复制字面量、不另造同义枚举（C1 冻结记录 §3.1/§3.2）。
import type { VersionChangeKind } from "../../model/version-change.ts";
import {
  AMENDMENT_ID_PATTERN,
  DETAIL_AMENDMENT_TARGET_KINDS,
  DOC_FREEZE_APPLICATION_REASONS,
  DOC_FREEZE_CUSTOMER_REASONS,
  DOC_FREEZE_JUDGE_DELEGATED_REASONS,
  DOC_FREEZE_REASONS,
  DOC_FREEZE_SCHEMA,
  isJudgeDelegatedSource,
  REFACTOR_FORBIDDEN_KINDS,
  REFACTOR_MANAGED_BY,
  REFACTOR_REASON_MAX,
  REFACTOR_REQUEST_ID_PATTERN,
  REFACTOR_REQUEST_SCHEMA,
  REFACTOR_REQUEST_STATUSES,
  REFACTOR_REQUESTED_BY,
  STABLE_WRITE_REQUEST_ID_PATTERN,
  STABLE_WRITE_SCHEMA,
  STABLE_WRITE_STATUSES,
  VERSION_CHANGE_APPLICATION_STATUSES,
  VERSION_CHANGE_CUSTOMER_STATUSES,
  VERSION_CHANGE_ID_PATTERN,
  VERSION_CHANGE_INITIATOR_BY_KIND,
  VERSION_CHANGE_KINDS,
  VERSION_CHANGE_SCHEMA,
  VERSION_CHANGE_TARGET_ACTIONS,
} from "../../model/version-change.ts";
import {
  TRUNK_AMENDMENT_APPLY_STATES,
  TRUNK_AMENDMENT_LEGACY_ITEM_KINDS,
  TRUNK_AMENDMENT_LEGACY_STATUSES,
  TRUNK_AMENDMENT_STATUSES,
  TRUNK_AMENDMENT_VCA_ITEM_KINDS,
  TRUNK_SOURCES,
  TRUNK_STABLE_FILE_KINDS,
  TRUNK_STATE_APPLICATION_OPS,
  TRUNK_STATE_CUSTOMER_OPS,
  TRUNK_STATE_LEGACY_OPS,
  TRUNK_STATE_OPS,
  TRUNK_VERSION_MIN,
  isDirectActionSource,
  isDirectActionReceipt,
} from "../../model/trunk.ts";
import {
  PROJECT_NOTE_BLOCKER_TEXT_MAX,
  PROJECT_NOTE_KEY_MAX,
  PROJECT_NOTE_NEXT_STEP_TEXT_MAX,
  PROJECT_NOTE_REFS_MAX,
  VERSION_DECISION_ACTIONS,
  VERSION_DECISION_REASON_MAX,
  VERSION_DECISION_SCHEMA,
} from "../../model/project-state.ts";
import { CUSTOMER_DIRECTIVE_ID_PATTERN } from "../../model/directive.ts";
import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
} from "../shared/jsonl-ledger.ts";
import { isRunId } from "./run-manifest.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";

/** 项目相对路径（POSIX 形式，便于跨平台展示与测试）。 */
export const TASKS_STATE_REL = ".ans/state/tasks.jsonl";
/** 默认单文件上限与保留份数（B-03「轮转」；env 可调；默认值单一来源 = A2 `jsonl-ledger`）。 */
export const TASKS_MAX_BYTES_ENV = "ANS_TASKS_MAX_BYTES";
export const TASKS_ROTATIONS_ENV = "ANS_TASKS_ROTATIONS";
export const DEFAULT_TASKS_MAX_BYTES = DEFAULT_JSONL_MAX_BYTES;
export const DEFAULT_TASKS_ROTATIONS = DEFAULT_JSONL_ROTATIONS;

/** 指令 id 形状（单一来源 = A1 常量；不复制字面量）。 */
const CUSTOMER_DIRECTIVE_ID_RE = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);

const SIDE_EFFECTS: readonly TaskSideEffect[] = ["read-only", "docs", "code", "external", "destructive", "unknown"];
const TASK_EVENT_KINDS = new Set([
  "task.created", "task.delivered", "task.reported", "task.closed", "task.redispatch", "delegation.changed",
  // C 批：申请/决策/审批事件（C-03）；与任务事件同文件、append-only。
  "request.created", "request.presented", "request.resolved", "request.notified", "request.orphaned",
  "approval.created", "approval.resolved", "approval.expired",
  // 2026-11-02（全局任务状态/版本决策）：幕僚备注与路线审计；TaskRecord 不消费。
  "project.focus", "project.note", "version.decision",
  // 2026-11-04（trunk-amendment-model C2a）：C1 冻结的六类账本事件（17 → 27 类）；
  // 形状/常量单一来源 = `model/runtime.ts` + `model/trunk.ts` + `model/version-change.ts`。
  "trunk.state", "trunk.amendment", "version.change", "doc.freeze", "refactor.request",
  ...STABLE_WRITE_EVENT_KINDS,
]);
const REPORT_STATUSES: readonly TaskReportStatus[] = ["done", "blocked", "failed"];
const CLOSED_OUTCOMES: readonly TaskClosedOutcome[] = ["accepted", "rework", "rejected"];
const REDISPATCH_SAFETIES: readonly TaskRedispatchSafety[] = ["safe", "unsafe", "needs-review"];

/** sha256 小写 hex（应用计算；发起者不自报）。 */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
/** C1 id 形状（单一来源 = `model/version-change.ts` 常量；不复制字面量）。 */
const VERSION_CHANGE_ID_RE = new RegExp(VERSION_CHANGE_ID_PATTERN);
const REFACTOR_REQUEST_ID_RE = new RegExp(REFACTOR_REQUEST_ID_PATTERN);
const STABLE_WRITE_REQUEST_ID_RE = new RegExp(STABLE_WRITE_REQUEST_ID_PATTERN);
const AMENDMENT_ID_RE = new RegExp(AMENDMENT_ID_PATTERN);

/** 治理步骤/流程 slug 校验（2026-10-29，F3）：小写 slug、不含首/尾连字符；仅供事件字段形态校验。 */
function isTaskSlug(value: unknown): boolean {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(value);
}

/**
 * 2026-10-31（D3 卡种收口）：`request.*.cardKind` 字段白名单校验——
 * 唯一来源 = `model/runtime.ts` 的 `GOVERNANCE_CARD_KINDS` 白名单（C1b：判断分组键集 +
 * app-owned `stable-write`；不另写第二张映射表；白名单不表达权限）。
 */
function isGovernanceCardKind(value: unknown): boolean {
  return typeof value === "string" && (GOVERNANCE_CARD_KINDS as readonly string[]).includes(value);
}

/** 2026-11-02：`project.note.refs`/版本决策 refs 的项目相对引用（路径或任务/申请 id）。 */
function isProjectRelativeRef(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:[\\/]/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** 非空字符串数组（可选上限）；用于版本决策审计 id 列表。 */
function isNonEmptyStringArray(value: unknown, max?: number): value is string[] {
  return Array.isArray(value) &&
    (max === undefined || value.length <= max) &&
    value.every((item) => typeof item === "string" && item.trim() !== "");
}

function isVersionDecisionAction(value: unknown): boolean {
  return typeof value === "string" && (VERSION_DECISION_ACTIONS as readonly string[]).includes(value);
}

/** 版本决策 targetVersions：kind → 正整数目标版本（有界键数；只做形状校验）。 */
function isTargetVersions(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 32) return false;
  return entries.every(([key, version]) =>
    key.trim() !== "" && typeof version === "number" && Number.isInteger(version) && version >= 1,
  );
}

// —————————————— 2026-11-04（trunk-amendment-model C2a）：新账本事件形状辅助 ——————————————
//
// 纪律：值域/枚举**只消费** C1 Model 常量（`model/trunk.ts`/`model/version-change.ts`/
// `model/runtime.ts`），本模块不复制字面量、不另造同义枚举；这里只有通用形状辅助。

/** C1 常量集成员判断（值域单一来源 = Model）。 */
function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

/** 可选审计时间戳（F14）：仅给出时校验 ISO 形状，不要求必填。 */
function isIsoTimestampString(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** 项目相对路径（POSIX；允许目录尾 `/`；拒绝绝对路径/盘符/反斜杠/`.`/`..`）。 */
function isProjectRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

/** 有界数组 + 元素判定（上限防坏行膨胀；默认元素为非空字符串）。 */
function isBoundedArray(
  value: unknown,
  max: number,
  check: (item: unknown) => boolean = isNonEmptyTrimmedString,
): boolean {
  return Array.isArray(value) && value.length <= max && value.every(check);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface TaskStateReadError {
  /** 来源文件（项目相对或轮转文件名）。 */
  file: string;
  /** 1 起行号。 */
  line: number;
  message: string;
}

export interface TaskRecord {
  taskId: string;
  created?: TaskCreatedEvent;
  delivered?: TaskDeliveredEvent;
  reports: TaskReportedEvent[];
  closed?: TaskClosedEventView;
  redispatches: TaskRedispatchEventView[];
  /** 本任务是否由某次重派产生。 */
  retryOf?: string;
}

type TaskClosedEventView = Extract<TaskStateEvent, { kind: "task.closed" }>;
type TaskRedispatchEventView = Extract<TaskStateEvent, { kind: "task.redispatch" }>;

export interface TaskReplay {
  records: Map<string, TaskRecord>;
  events: TaskStateEvent[];
  errors: TaskStateReadError[];
  /** 未 closed 的任务（含已报告未收口；按 created.at 升序）。 */
  unclosed: TaskRecord[];
}

export interface TaskStateReadResult extends TaskReplay {
  files: string[];
}

export function tasksStatePath(projectRoot: string): string {
  return path.join(projectRoot, ...TASKS_STATE_REL.split("/"));
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function limits(): { maxBytes: number; rotations: number } {
  return {
    maxBytes: positiveInt(process.env[TASKS_MAX_BYTES_ENV], DEFAULT_TASKS_MAX_BYTES),
    rotations: positiveInt(process.env[TASKS_ROTATIONS_ENV], DEFAULT_TASKS_ROTATIONS),
  };
}

/** 单行摘要：压平空白、按 Unicode 码点截断（≤200；超长加省略号）。 */
export function shortenSummary(text: string, max = 200): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  const points = [...flat];
  if (points.length <= max) return flat;
  return `${points.slice(0, Math.max(0, max - 1)).join("")}…`;
}

// —————————————— 副作用分类（B-08：应用强制只升不降） ——————————————

export function normalizeTaskSideEffect(value: unknown): TaskSideEffect {
  return typeof value === "string" && (SIDE_EFFECTS as readonly string[]).includes(value)
    ? value as TaskSideEffect
    : "unknown";
}

const DESTRUCTIVE_RE = /(?:\brm\s+-[a-z]*[rf][a-z]*\b|\brmdir\b|\bdel\s+\/|\bformat\s+[a-z]:|\bdrop\s+table\b|\btruncate\s+table\b|git\s+reset\s+--hard|删除|清空|擦除|卸载)/i;
const EXTERNAL_RE = /(?:git\s+push|(?:npm|pnpm|yarn)\s+publish|gh\s+(?:pr|release)|deploy|发布|上线|部署|支付|付款|webhook|curl\s+https?:\/\/|https?:\/\/|外部服务|发送?邮件)/i;
const CODE_RE = /(?:^|[\s`"'(])(?:src|test|app|bin|scripts|packages)\/|\bpackage\.json\b|\btsconfig(?:\.[a-z]+)?\.json\b|\bpackage-lock\.json\b|(?:修改|新增|修复|实现)[^。\n]{0,20}(?:代码|源码|模块|函数|测试|缺陷|bug)|\b(?:npm|pnpm|yarn)\s+run\s+(?:build|test|typecheck)/i;
const DOCS_RE = /(?:^|[\s`"'(])(?:docs|角色卡)\/|\.md\b|文档|变更记录|changelog/i;

/**
 * 应用按任务文本**升类**副作用；幕僚声明只在没有更高风险证据时保留。
 * 只升不降：`declared=read-only` + 文本含 `src/` ⇒ `code`；声明的 `external` 永不因文本回落。
 */
export function classifyTaskSideEffect(declared: unknown, text: string): TaskSideEffect {
  const declaredValue = normalizeTaskSideEffect(declared);
  const body = String(text ?? "");
  const evidence: TaskSideEffect | undefined = DESTRUCTIVE_RE.test(body) ? "destructive"
    : EXTERNAL_RE.test(body) ? "external"
      : CODE_RE.test(body) ? "code"
        : DOCS_RE.test(body) ? "docs"
          : undefined;
  if (evidence === undefined) return declaredValue;
  // 已声明更高风险 ⇒ 不降；`unknown` 可被任何具体证据升类（unknown 不是风险等级，只是未知）。
  const rank: Record<TaskSideEffect, number> = { unknown: 0, "read-only": 1, docs: 2, code: 3, external: 4, destructive: 5 };
  return rank[evidence] >= rank[declaredValue] ? evidence : declaredValue;
}

// —————————————— 幂等键 / 任务 id ——————————————

export interface TaskIdempotencyInput {
  from: string;
  to: string;
  text: string;
  /** 2026-10-29（v2.6/R2）：模块归属参与去重（同文本派不同模块不得误判为同一任务）。 */
  moduleId?: string;
  moduleDirectory?: string;
  /** 显式键优先（空串/非字符串视为未提供）。 */
  idempotencyKey?: string;
}

/** 幂等键：显式键优先；否则 `sha256(from\0to\0moduleId\0moduleDirectory\0text)` 前 32 位。重派沿用原键。 */
export function taskIdempotencyKey(input: TaskIdempotencyInput): string {
  const explicit = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (explicit !== "") return explicit;
  return createHash("sha256")
    .update(`${input.from}\u0000${input.to}\u0000${input.moduleId ?? ""}\u0000${input.moduleDirectory ?? ""}\u0000${input.text}`)
    .digest("hex")
    .slice(0, 32);
}

/** 新任务 id：`t-<时间 base36>-<随机 8 hex>`（不含角色/项目信息）。 */
export function newTaskId(now: Date = new Date()): string {
  return `t-${now.getTime().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** 重派任务 id：`<原 id>-r<N>`（N=1 起；同原任务的多级重派各占一级）。 */
export function redispatchTaskId(retryOf: string, attempt: number): string {
  return `${retryOf}-r${Math.max(1, Math.floor(attempt))}`;
}

// —————————————— 追加（轮转 + 原子行；A2 共享辅助） ——————————————

type AppendResult = { ok: true; path: string } | { ok: false; message: string; code?: string };

/**
 * T3（2026-11-10 两条固定工作流路径，v1.3 §7.1 / B1 AC-17 / MF-3）：fixed `task.created` 绑定字段的
 * 形状/自洽校验（**写侧**）。`workflowId` 存在即以 fixed 记账：`flowId` 必填、`stage ∈ WorkflowStage`、
 * `taskKind` 只允许 `"stage-request"`（普通生产任务可缺省）、`workflowPath` 只允许 A/B，
 * `runId`/`runState` 由调用方另行断言（出现即拒绝）。
 */
function validateFixedTaskCreatedBinding(
  event: TaskCreatedEvent,
): { ok: true } | { ok: false; code: string; message: string } {
  const fail = (message: string): { ok: false; code: string; message: string } =>
    ({ ok: false, code: "invalid-task-binding", message });
  if (typeof event.workflowId !== "string" || !isTaskSlug(event.workflowId)) {
    return fail("task.created.workflowId 非法：必须是合法 slug");
  }
  if (event.flowId === undefined) {
    return fail("task.created fixed：带 workflowId 时必须同时给出 flowId");
  }
  if (!isTaskSlug(event.flowId)) return fail("task.created.flowId 非法：必须是合法 slug");
  if (event.stage === undefined || !isWorkflowStage(event.stage)) {
    return fail("task.created.stage 非法：fixed 任务必须给出合法 WorkflowStage");
  }
  if (event.taskKind !== undefined && event.taskKind !== "stage-request") {
    return fail('task.created.taskKind 非法：只允许 "stage-request"（普通生产任务可缺省）');
  }
  if (event.workflowPath !== undefined && !isWorkflowPath(event.workflowPath)) {
    return fail("task.created.workflowPath 非法：只允许 A/B");
  }
  return { ok: true };
}

/**
 * 追加一个任务事件。写失败**不抛**：返回 `{ok:false,message}`，调用方如实回执/记日志。
 * 轮转/串行链/原子追加**全部**走 A2 `src/common/shared/jsonl-ledger.ts`（B1 等价迁移；行为逐字不变）；
 * env 解析与诊断留在此处。
 *
 * T3（2026-11-10，v1.3 §7.1 / AC-17）fixed 分支：`kind==="task.created"` 且 `workflowId` 存在 ⇒
 * **豁免 runId/runState**（fixed 任务不带 run），但绑定字段必须自洽、且出现 `runId`/`runState` 即拒绝；
 * `workflowPath` 仅允许出现在该 workflowId 的首个 stage-request 上。无 `workflowId` 的旧
 * run-required 规则逐字保留（`allowLegacyRun` 仅历史/测试）。
 */
export async function appendTaskEvent(
  projectRoot: string,
  event: TaskStateEvent,
  options: { allowLegacyRun?: boolean } = {},
): Promise<AppendResult> {
  if ((event.kind === "request.presented" && event.to === "chief")
    || (event.kind === "request.resolved" && event.by === "chief-delegated")
    || ("actionSource" in event && event.actionSource !== undefined)) {
    const checked = validateEvent(event);
    if (!checked.ok) return { ok: false, code: "invalid-event-source", message: checked.message };
  }
  if (event.kind === "task.created" && event.workflowId !== undefined) {
    const binding = validateFixedTaskCreatedBinding(event);
    if (!binding.ok) return { ok: false, code: binding.code, message: binding.message };
    if (event.runId !== undefined || event.runState !== undefined) {
      return {
        ok: false,
        code: "fixed-task-run-forbidden",
        message: "task.created.fixed-task-run-forbidden：fixed 工作流任务不得携带 runId/runState（出现即拒绝）",
      };
    }
    if (event.workflowPath !== undefined) {
      if (event.taskKind !== "stage-request") {
        return {
          ok: false,
          code: "workflow-path-not-stage-request",
          message: "task.created.workflowPath 只允许出现在 taskKind=stage-request 的任务上",
        };
      }
      // `workflowPath` 仅首 stage-request（v1.3 §3.3/§7.1）：同 workflowId 已有 stage-request 时拒绝；
      // 同幂等键的重放（调用方在派发层本应去重）按幂等放行，避免把 replay 误判为第二次请求。
      const state = await readTaskState(projectRoot);
      const prior = [...state.records.values()].find((record) =>
        record.created?.workflowId === event.workflowId
        && record.created?.taskKind === "stage-request"
        && record.created?.idempotencyKey !== event.idempotencyKey);
      if (prior !== undefined) {
        return {
          ok: false,
          code: "workflow-path-not-first",
          message: `task.created.workflowPath 仅首 stage-request 可携带（已有 stage-request ${prior.taskId}）`,
        };
      }
    }
  } else if (event.kind === "task.created" && event.flowId !== undefined && options.allowLegacyRun !== true) {
    // 2026-10-30（3.1/P1.3 R1）：**新建**项目任务（flowId 有值）必须带 runId+runState；
    // 只有历史既有/测试重放可用 allowLegacyRun 写入无 run 的旧形状。读侧仍按 legacy 兼容。
    if (event.runId === undefined || event.runId === "" || event.runState === undefined) {
      return { ok: false, code: "run-required", message: "task.created.run-required：新建项目任务必须带 runId 与 runState（legacy 仅历史重放允许）" };
    }
  }
  const { maxBytes, rotations } = limits();
  const file = tasksStatePath(projectRoot);
  return appendJsonlLine(file, JSON.stringify(event), { maxBytes, rotations }).then((result) => {
    if (result.ok) return { ok: true, path: file };
    createDiagnosticLogger({ component: "orchestration.task-state", projectRoot }).error(
      "tasks.append.failed",
      result.cause ?? new Error(result.message),
      { taskId: (event as { taskId?: string }).taskId },
    );
    return {
      ok: false,
      message: result.message,
      ...(result.code !== undefined ? { code: result.code } : {}),
    };
  });
}

// —————————————— 读取 / 重放 ——————————————

function validateEvent(value: unknown): { ok: true; event: TaskStateEvent } | { ok: false; message: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "不是对象" };
  const rec = value as Record<string, unknown>;
  if (rec["v"] !== 1) return { ok: false, message: "v 必须为 1" };
  if (typeof rec["at"] !== "string" || Number.isNaN(Date.parse(rec["at"]))) return { ok: false, message: "at 非法" };
  const kind = rec["kind"];
  if (typeof kind !== "string" || !TASK_EVENT_KINDS.has(kind)) return { ok: false, message: "未知 kind" };
  if (kind === "delegation.changed") {
    if (typeof rec["roleId"] !== "string" || rec["roleId"] === "") return { ok: false, message: "delegation.changed 缺 roleId" };
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind.startsWith("request.")) {
    if (typeof rec["requestId"] !== "string" || rec["requestId"] === "") return { ok: false, message: "request 事件缺 requestId" };
    // 2026-11-02（A0-3）：reason 给出时必须是冻结三值之一；缺失按旧行兼容（历史写侧始终写 reason）。
    if (kind === "request.orphaned" && rec["reason"] !== undefined) {
      if (rec["reason"] !== "restart" && rec["reason"] !== "superseded" && rec["reason"] !== "initiator-aborted") {
        return { ok: false, message: "request.orphaned.reason 非法" };
      }
    }
    if (kind === "request.created") {
      if (typeof rec["sourceRoleId"] !== "string" || rec["sourceRoleId"] === "") return { ok: false, message: "request.created 缺 sourceRoleId" };
      if (typeof rec["title"] !== "string" || rec["title"] === "") return { ok: false, message: "request.created 缺 title" };
      if (!Array.isArray(rec["options"])) return { ok: false, message: "request.created 缺 options" };
      // 2026-10-31（D3 卡种收口）：可选卡种；给出时必须在治理卡种白名单内（缺失 = 旧记录，兼容）。
      if (rec["cardKind"] !== undefined && !isGovernanceCardKind(rec["cardKind"])) {
        return { ok: false, message: "request.created.cardKind 非法" };
      }
    }
    if (kind === "request.presented" && rec["to"] !== "customer" && rec["to"] !== "judge" && rec["to"] !== "chief")
      return { ok: false, message: "request.presented.to 非法" };
    if (kind === "request.resolved") {
      // 2026-11-03（客户授权平面 Q9 A）：`"directive"` 表示客户事先记录的决策指令导致的结果；
      // `directiveId` 可选，给出时必须匹配 A1 `CUSTOMER_DIRECTIVE_ID_PATTERN`，且 `by==="directive"` 时必填。
      const by = rec["by"];
      if (by !== "judge" && by !== "customer" && by !== "directive" && by !== "chief-delegated") return { ok: false, message: "request.resolved.by 非法" };
      const actionSource = rec["actionSource"];
      if (actionSource !== undefined && !isDirectActionSource(actionSource)) return { ok: false, message: "request.resolved.actionSource 非法" };
      if (by === "chief-delegated") {
        if (!isDirectActionSource(actionSource) || actionSource.kind !== "chief-delegated" || actionSource.requestId !== rec["requestId"]
          || rec["judge"] !== undefined || rec["directiveId"] !== undefined)
          return { ok: false, message: "request.resolved chief source/request binding missing" };
        const ids = rec["selectedOptionIds"] ?? rec["targetRoleIds"];
        if (actionSource.disposition === "select" && ids !== undefined
          && (!Array.isArray(ids) || ids.length !== actionSource.selected?.length || ids.some(id => !actionSource.selected?.includes(id))))
          return { ok: false, message: "request.resolved chief selection mismatch" };
        if (actionSource.disposition !== "select" && Array.isArray(ids) && ids.length)
          return { ok: false, message: "request.resolved chief reject/revise cannot select" };
      } else if (actionSource !== undefined && (actionSource.kind !== "customer-decision" || by !== "customer"
        || actionSource.decisionId !== rec["decisionId"])) return { ok: false, message: "request.resolved source/by mismatch" };
      if (rec["directiveId"] !== undefined) {
        const directiveId = rec["directiveId"];
        if (typeof directiveId !== "string" || !CUSTOMER_DIRECTIVE_ID_RE.test(directiveId)) {
          return { ok: false, message: "request.resolved.directiveId 非法" };
        }
      } else if (by === "directive") {
        return { ok: false, message: "request.resolved.by=directive 缺 directiveId" };
      }
      if (typeof rec["choice"] !== "string") return { ok: false, message: "request.resolved 缺 choice" };
      // 2026-10-31（D3 卡种收口）：可选卡种；给出时必须在治理卡种白名单内（缺失 = 旧记录，兼容）。
      if (rec["cardKind"] !== undefined && !isGovernanceCardKind(rec["cardKind"])) {
        return { ok: false, message: "request.resolved.cardKind 非法" };
      }
      // 2026-10-31：非 appointment 卡的选中选项（仅审计）——给出时必须是非空字符串数组。
      if (rec["selectedOptionIds"] !== undefined) {
        const ids = rec["selectedOptionIds"];
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id === "")) {
          return { ok: false, message: "request.resolved.selectedOptionIds 必须是非空字符串数组" };
        }
      }
      // 2026-10-29（方案 v2.1 §5.4，F3）：D3 名单版本/hash——给出时：正整数 + 64 位 hex（应用写，模型不可自报）。
      if (rec["rosterVersion"] !== undefined) {
        const version = rec["rosterVersion"];
        if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
          return { ok: false, message: "request.resolved.rosterVersion 必须是正整数" };
        }
      }
      if (rec["rosterSha256"] !== undefined) {
        if (typeof rec["rosterSha256"] !== "string" || !/^[0-9a-f]{64}$/.test(rec["rosterSha256"])) {
          return { ok: false, message: "request.resolved.rosterSha256 必须是 64 位小写 hex" };
        }
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind.startsWith("approval.")) {
    if (typeof rec["approvalId"] !== "string" || rec["approvalId"] === "") return { ok: false, message: "approval 事件缺 approvalId" };
    if (kind === "approval.created") {
      if (rec["approvalKind"] !== "shell" && rec["approvalKind"] !== "appointment-write") return { ok: false, message: "approval.created.approvalKind 非法" };
      if (typeof rec["sourceRoleId"] !== "string" || rec["sourceRoleId"] === "") return { ok: false, message: "approval.created 缺 sourceRoleId" };
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "project.focus") {
    if (rec["roleId"] !== "chief" && rec["roleId"] !== "application") {
      return { ok: false, message: "project.focus.roleId 非法" };
    }
    if (rec["cleared"] !== undefined && typeof rec["cleared"] !== "boolean") {
      return { ok: false, message: "project.focus.cleared 非法" };
    }
    const cleared = rec["cleared"] === true;
    if (rec["flowId"] !== undefined && !isTaskSlug(rec["flowId"])) {
      return { ok: false, message: "project.focus.flowId 非法" };
    }
    if (!cleared && rec["flowId"] === undefined) {
      return { ok: false, message: "project.focus 缺 flowId" };
    }
    if (rec["runId"] !== undefined && !isRunId(rec["runId"])) {
      return { ok: false, message: "project.focus.runId 非法" };
    }
    if (rec["note"] !== undefined) {
      if (typeof rec["note"] !== "string" || Array.from(rec["note"]).length > PROJECT_NOTE_BLOCKER_TEXT_MAX) {
        return { ok: false, message: "project.focus.note 非法" };
      }
    }
    if (rec["sourceDecisionId"] !== undefined) {
      if (typeof rec["sourceDecisionId"] !== "string" || rec["sourceDecisionId"].trim() === "") {
        return { ok: false, message: "project.focus.sourceDecisionId 非法" };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "project.note") {
    if (rec["roleId"] !== "chief") return { ok: false, message: "project.note.roleId 必须为 chief" };
    if (typeof rec["noteKey"] !== "string" || !isTaskSlug(rec["noteKey"]) || rec["noteKey"].length > PROJECT_NOTE_KEY_MAX) {
      return { ok: false, message: "project.note.noteKey 非法" };
    }
    if (rec["noteKind"] !== "blocker" && rec["noteKind"] !== "next-step") {
      return { ok: false, message: "project.note.noteKind 非法" };
    }
    if (typeof rec["text"] !== "string" || rec["text"].trim() === "") {
      return { ok: false, message: "project.note 缺 text" };
    }
    const textMax = rec["noteKind"] === "blocker" ? PROJECT_NOTE_BLOCKER_TEXT_MAX : PROJECT_NOTE_NEXT_STEP_TEXT_MAX;
    if (Array.from(rec["text"]).length > textMax) {
      return { ok: false, message: "project.note.text 超过上限" };
    }
    if (typeof rec["active"] !== "boolean") return { ok: false, message: "project.note.active 非法" };
    if (rec["refs"] !== undefined) {
      const refs = rec["refs"];
      if (!Array.isArray(refs) || refs.length > PROJECT_NOTE_REFS_MAX || !refs.every(isProjectRelativeRef)) {
        return { ok: false, message: "project.note.refs 非法" };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "version.decision") {
    if (rec["schema"] !== VERSION_DECISION_SCHEMA) return { ok: false, message: "version.decision.schema 非法" };
    const decisionId = rec["decisionId"];
    const requestId = rec["requestId"];
    const flowId = rec["flowId"];
    const reason = rec["reason"];
    if (typeof decisionId !== "string" || decisionId.trim() === "") {
      return { ok: false, message: "version.decision 缺 decisionId" };
    }
    if (typeof requestId !== "string" || requestId.trim() === "") {
      return { ok: false, message: "version.decision 缺 requestId" };
    }
    if (typeof flowId !== "string" || flowId.trim() === "") {
      return { ok: false, message: "version.decision 缺 flowId" };
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      return { ok: false, message: "version.decision 缺 reason" };
    }
    if (!isTaskSlug(flowId)) return { ok: false, message: "version.decision.flowId 非法" };
    if (Array.from(reason).length > VERSION_DECISION_REASON_MAX) {
      return { ok: false, message: "version.decision.reason 超过上限" };
    }
    if (typeof rec["attempt"] !== "number" || !Number.isInteger(rec["attempt"]) || rec["attempt"] < 1) {
      return { ok: false, message: "version.decision.attempt 非法" };
    }
    if (!isVersionDecisionAction(rec["action"])) return { ok: false, message: "version.decision.action 非法" };
    if (rec["recommendedBy"] !== "chief") return { ok: false, message: "version.decision.recommendedBy 非法" };
    if (!isVersionDecisionAction(rec["recommendedAction"])) {
      return { ok: false, message: "version.decision.recommendedAction 非法" };
    }
    // 2026-11-03（客户授权平面 Q9 A）：`decidedBy:"directive"` + 可选 `directiveId`（规则同 request.resolved）。
    if (rec["decidedBy"] !== "customer" && rec["decidedBy"] !== "judge" && rec["decidedBy"] !== "directive") {
      return { ok: false, message: "version.decision.decidedBy 非法" };
    }
    if (rec["directiveId"] !== undefined) {
      const directiveId = rec["directiveId"];
      if (typeof directiveId !== "string" || !CUSTOMER_DIRECTIVE_ID_RE.test(directiveId)) {
        return { ok: false, message: "version.decision.directiveId 非法" };
      }
    } else if (rec["decidedBy"] === "directive") {
      return { ok: false, message: "version.decision.decidedBy=directive 缺 directiveId" };
    }
    if (rec["operatorId"] !== undefined && (typeof rec["operatorId"] !== "string" || rec["operatorId"].trim() === "")) {
      return { ok: false, message: "version.decision.operatorId 非法" };
    }
    if (rec["status"] !== "executing" && rec["status"] !== "executed" && rec["status"] !== "failed" && rec["status"] !== "uncertain") {
      return { ok: false, message: "version.decision.status 非法" };
    }
    if (rec["oldFlowId"] !== undefined && !isTaskSlug(rec["oldFlowId"])) {
      return { ok: false, message: "version.decision.oldFlowId 非法" };
    }
    for (const field of ["oldRunId", "newRunId"] as const) {
      if (rec[field] !== undefined && !isRunId(rec[field])) {
        return { ok: false, message: `version.decision.${field} 非法` };
      }
    }
    if (rec["newFlowId"] !== undefined && !isTaskSlug(rec["newFlowId"])) {
      return { ok: false, message: "version.decision.newFlowId 非法" };
    }
    if (rec["targetVersions"] !== undefined && !isTargetVersions(rec["targetVersions"])) {
      return { ok: false, message: "version.decision.targetVersions 非法" };
    }
    for (const field of ["closedRunIds", "orphanedRequestIds", "supersededTaskIds"] as const) {
      if (rec[field] !== undefined && !isNonEmptyStringArray(rec[field])) {
        return { ok: false, message: `version.decision.${field} 非法` };
      }
    }
    if (rec["message"] !== undefined) {
      if (typeof rec["message"] !== "string" || Array.from(rec["message"]).length > PROJECT_NOTE_BLOCKER_TEXT_MAX) {
        return { ok: false, message: "version.decision.message 非法" };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  // —————————————— 2026-11-04（trunk-amendment-model C2a）：trunk/VCA/冻结/重构/stable 事件 ——————————————
  if (kind === "trunk.state") {
    const op = rec["op"];
    const legacyOp = isOneOf(TRUNK_STATE_LEGACY_OPS, op);
    if (!legacyOp && !isOneOf(TRUNK_STATE_OPS, op)) return { ok: false, message: "trunk.state.op 非法" };
    // 旧账本读兼容：`drift`/`unfrozen-expired` 仅旧读（新代码不得写）；不要求新归属字段。
    if (legacyOp) return { ok: true, event: rec as unknown as TaskStateEvent };
    const trunkVersion = rec["trunkVersion"];
    if (typeof trunkVersion !== "number" || !Number.isInteger(trunkVersion) || trunkVersion < TRUNK_VERSION_MIN) {
      return { ok: false, message: "trunk.state.trunkVersion 必须是正整数" };
    }
    if (rec["previousTrunkVersion"] !== undefined && !isPositiveInteger(rec["previousTrunkVersion"])) {
      return { ok: false, message: "trunk.state.previousTrunkVersion 非法" };
    }
    // mini re-pin 不升 trunkVersion：给出事件前版本时必须与 trunkVersion 一致（AC-34）。
    if (op === "stable-repinned" && rec["previousTrunkVersion"] !== undefined && rec["previousTrunkVersion"] !== trunkVersion) {
      return { ok: false, message: "trunk.state.stable-repinned 不得升 trunkVersion" };
    }
    const customerOp = isOneOf(TRUNK_STATE_CUSTOMER_OPS, op);
    const applicationOp = isOneOf(TRUNK_STATE_APPLICATION_OPS, op);
    if (!customerOp && !applicationOp) return { ok: false, message: "trunk.state.op 归属未定义" };
    const origin = rec["origin"];
    if (origin === "role-direct" || origin === "chief-delegated") {
      const source = rec["actionSource"];
      if (!isDirectActionSource(source) || source.kind !== origin || rec["decisionId"] !== undefined || rec["decidedBy"] !== undefined
        || (source.kind === "role-direct" && rec["operationId"] !== source.operationId)) return { ok: false, message: "trunk.state direct source binding invalid" };
    } else if (origin !== "customer" && origin !== "application") return { ok: false, message: "trunk.state.origin 非法" };
    else if (customerOp) {
      if (origin !== "customer") return { ok: false, message: "trunk.state 客户 op 必须 origin customer" };
      if (rec["decidedBy"] !== "customer") return { ok: false, message: "trunk.state 客户 op 必须 decidedBy customer" };
    } else {
      if (origin !== "application") return { ok: false, message: "trunk.state 应用 op 必须 origin application" };
      if (rec["decidedBy"] !== undefined) return { ok: false, message: "trunk.state 应用 op 不得带 decidedBy" };
    }
    if (rec["source"] !== undefined && !isOneOf(TRUNK_SOURCES, rec["source"])) {
      return { ok: false, message: "trunk.state.source 非法" };
    }
    if (rec["highRisk"] !== undefined) {
      const highRisk = rec["highRisk"];
      if (!isPlainRecord(highRisk) || highRisk["acknowledged"] !== true) {
        return { ok: false, message: "trunk.state.highRisk 非法（acknowledged 只允许 true）" };
      }
      if (highRisk["items"] !== undefined && !isBoundedArray(highRisk["items"], 64)) {
        return { ok: false, message: "trunk.state.highRisk.items 非法" };
      }
    }
    if (rec["scope"] !== undefined && !isBoundedArray(rec["scope"], 64)) {
      return { ok: false, message: "trunk.state.scope 非法" };
    }
    if (rec["runId"] !== undefined && rec["runId"] !== null && !isRunId(rec["runId"])) {
      return { ok: false, message: "trunk.state.runId 非法" };
    }
    if (rec["flowId"] !== undefined && !isTaskSlug(rec["flowId"])) {
      return { ok: false, message: "trunk.state.flowId 非法" };
    }
    for (const field of ["decisionId", "confirmationId", "amendmentId", "journalId", "reason", "message", "channel"] as const) {
      if (rec[field] !== undefined && !isNonEmptyTrimmedString(rec[field])) {
        return { ok: false, message: `trunk.state.${field} 非法` };
      }
    }
    if (op === "stable-repinned") {
      if (!isNonEmptyTrimmedString(rec["path"])) return { ok: false, message: "trunk.state.stable-repinned 缺 path" };
      const oldSha = rec["oldSha"];
      // `oldSha` 允许空串（此前无该文件快照；正常续接为 64 位小写 hex）。
      if (typeof oldSha !== "string" || (oldSha !== "" && !isSha256Hex(oldSha))) {
        return { ok: false, message: "trunk.state.stable-repinned.oldSha 非法" };
      }
      if (!isSha256Hex(rec["newSha"])) return { ok: false, message: "trunk.state.stable-repinned.newSha 非法" };
      // 绑定客户确认：decisionId / confirmationId 至少一个（AC-34）。
      if (!isNonEmptyTrimmedString(rec["confirmationId"]) && !isNonEmptyTrimmedString(rec["decisionId"])) {
        return { ok: false, message: "trunk.state.stable-repinned 缺 confirmationId/decisionId" };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "trunk.amendment") {
    const status = rec["status"];
    const legacyStatus = isOneOf(TRUNK_AMENDMENT_LEGACY_STATUSES, status);
    if (!legacyStatus && !isOneOf(TRUNK_AMENDMENT_STATUSES, status)) {
      return { ok: false, message: "trunk.amendment.status 非法" };
    }
    const amendmentId = rec["amendmentId"];
    if (typeof amendmentId !== "string" || amendmentId.trim() === "") {
      return { ok: false, message: "trunk.amendment 缺 amendmentId" };
    }
    // 新事件 id 必须是 C1 形状；旧状态（proposed/confirmed/cancelled）只要求非空（旧账本读兼容）。
    if (!legacyStatus && !AMENDMENT_ID_RE.test(amendmentId)) {
      return { ok: false, message: "trunk.amendment.amendmentId 非法" };
    }
    if (!isTaskSlug(rec["flowId"])) return { ok: false, message: "trunk.amendment.flowId 非法" };
    if (rec["applyState"] !== undefined && !isOneOf(TRUNK_AMENDMENT_APPLY_STATES, rec["applyState"])) {
      return { ok: false, message: "trunk.amendment.applyState 非法" };
    }
    if (rec["itemKind"] !== undefined &&
        !isOneOf(TRUNK_AMENDMENT_VCA_ITEM_KINDS, rec["itemKind"]) &&
        !isOneOf(TRUNK_AMENDMENT_LEGACY_ITEM_KINDS, rec["itemKind"])) {
      return { ok: false, message: "trunk.amendment.itemKind 非法" };
    }
    if (rec["itemResult"] !== undefined && !isNonEmptyTrimmedString(rec["itemResult"])) {
      return { ok: false, message: "trunk.amendment.itemResult 非法" };
    }
    if (rec["decidedBy"] !== undefined && rec["decidedBy"] !== "customer") {
      return { ok: false, message: "trunk.amendment.decidedBy 非法" };
    }
    for (const field of ["applicationId", "decisionId", "journalId", "itemId", "message"] as const) {
      if (rec[field] !== undefined && !isNonEmptyTrimmedString(rec[field])) {
        return { ok: false, message: `trunk.amendment.${field} 非法` };
      }
    }
    if (rec["resultTrunkVersion"] !== undefined && !isPositiveInteger(rec["resultTrunkVersion"])) {
      return { ok: false, message: "trunk.amendment.resultTrunkVersion 非法" };
    }
    if (!legacyStatus) {
      if (rec["origin"] !== "customer" && rec["origin"] !== "application") {
        return { ok: false, message: "trunk.amendment.origin 非法" };
      }
      // 客户批准/拒绝 ⇒ customer + decisionId（AC-31）；提交/应用动作由应用写、decidedBy 缺省。
      if ((status === "approved" || status === "rejected") &&
          (rec["decidedBy"] !== "customer" || !isNonEmptyTrimmedString(rec["decisionId"]))) {
        return { ok: false, message: "trunk.amendment 客户决定事件必须 decidedBy customer 且带 decisionId" };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "version.change") {
    if (rec["schema"] !== VERSION_CHANGE_SCHEMA) return { ok: false, message: "version.change.schema 非法" };
    const applicationId = rec["applicationId"];
    if (typeof applicationId !== "string" || !VERSION_CHANGE_ID_RE.test(applicationId)) {
      return { ok: false, message: "version.change.applicationId 非法" };
    }
    const vcKind = rec["vcKind"];
    if (!isOneOf(VERSION_CHANGE_KINDS, vcKind)) return { ok: false, message: "version.change.vcKind 非法" };
    if (rec["initiatorRoleId"] !== VERSION_CHANGE_INITIATOR_BY_KIND[vcKind as VersionChangeKind]) {
      return { ok: false, message: "version.change.initiatorRoleId 与 vcKind 不匹配" };
    }
    if (!isTaskSlug(rec["flowId"])) return { ok: false, message: "version.change.flowId 非法" };
    const status = rec["status"];
    const customerStatus = isOneOf(VERSION_CHANGE_CUSTOMER_STATUSES, status);
    const applicationStatus = isOneOf(VERSION_CHANGE_APPLICATION_STATUSES, status);
    // `draft` 不是账本事件状态（C1 注释；仅记录内存在）。
    if (!customerStatus && !applicationStatus) {
      return { ok: false, message: "version.change.status 非法（draft 不是账本事件状态）" };
    }
    const origin = rec["origin"];
    const direct = origin === "role-direct";
    if (direct) {
      const source = rec["actionSource"];
      if (!isDirectActionSource(source) || source.kind !== "role-direct" || source.operationId !== rec["operationId"]
        || source.applicationId !== applicationId || source.actorRoleId !== rec["initiatorRoleId"] || source.action !== vcKind
        || rec["decisionId"] !== undefined || rec["decidedBy"] !== undefined || !applicationStatus
        || (rec["directReceipt"] !== undefined && !isDirectActionReceipt(rec["directReceipt"]))) return { ok: false, message: "version.change direct source binding invalid" };
    } else if (origin !== "customer" && origin !== "application") return { ok: false, message: "version.change.origin 非法" };
    if (rec["decidedBy"] !== undefined && rec["decidedBy"] !== "customer") {
      return { ok: false, message: "version.change.decidedBy 非法" };
    }
    if (direct) {
      // New role actions never borrow a historical approved/customer transition.
    } else if (customerStatus) {
      // approved/rejected：客户决定（origin/decidedBy customer + decisionId）。
      if (origin !== "customer" || rec["decidedBy"] !== "customer" || !isNonEmptyTrimmedString(rec["decisionId"])) {
        return { ok: false, message: "version.change 客户决定事件必须 origin/decidedBy customer 且带 decisionId" };
      }
    } else if (origin !== "application" || rec["decidedBy"] !== undefined) {
      // submitted/applied/superseded：应用动作（不冒充客户；applied/superseded 可携 decisionId 供审计）。
      return { ok: false, message: "version.change 应用事件必须 origin application 且无 decidedBy" };
    }
    if (rec["baseTrunkVersion"] !== undefined && !isPositiveInteger(rec["baseTrunkVersion"])) {
      return { ok: false, message: "version.change.baseTrunkVersion 非法" };
    }
    if (rec["bootstrap"] !== undefined && typeof rec["bootstrap"] !== "boolean") {
      return { ok: false, message: "version.change.bootstrap 非法" };
    }
    if (rec["targets"] !== undefined) {
      const targets = rec["targets"];
      if (!Array.isArray(targets) || targets.length > VCA_SUBMISSION_TARGETS_MAX) return { ok: false, message: "version.change.targets 非法" };
      for (const target of targets) {
        if (!isPlainRecord(target)) return { ok: false, message: "version.change.targets 非法" };
        // contract/roster/execution 的并集 = detail 允许集合（upgrade 为其子集；逐项合法性由业务层判定）。
        if (!isOneOf(DETAIL_AMENDMENT_TARGET_KINDS, target["kind"])) {
          return { ok: false, message: "version.change.targets.kind 非法" };
        }
        if (!isProjectRelativePath(target["path"])) return { ok: false, message: "version.change.targets.path 非法" };
        if (!isOneOf(VERSION_CHANGE_TARGET_ACTIONS, target["action"])) {
          return { ok: false, message: "version.change.targets.action 非法" };
        }
        if (target["toSha256"] !== undefined && !isSha256Hex(target["toSha256"])) {
          return { ok: false, message: "version.change.targets.toSha256 非法" };
        }
        if (target["roleId"] !== undefined && !isNonEmptyTrimmedString(target["roleId"])) {
          return { ok: false, message: "version.change.targets.roleId 非法" };
        }
      }
    }
    for (const field of ["journalId", "message"] as const) {
      if (rec[field] !== undefined && !isNonEmptyTrimmedString(rec[field])) {
        return { ok: false, message: `version.change.${field} 非法` };
      }
    }
    if (rec["resultTrunkVersion"] !== undefined && !isPositiveInteger(rec["resultTrunkVersion"])) {
      return { ok: false, message: "version.change.resultTrunkVersion 非法" };
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "doc.freeze") {
    if (rec["schema"] !== DOC_FREEZE_SCHEMA) return { ok: false, message: "doc.freeze.schema 非法" };
    if (!isProjectRelativePath(rec["path"])) return { ok: false, message: "doc.freeze.path 非法" };
    if (!isPositiveInteger(rec["version"])) return { ok: false, message: "doc.freeze.version 必须是正整数" };
    if (!isSha256Hex(rec["sha256"])) return { ok: false, message: "doc.freeze.sha256 必须是 64 位小写 hex" };
    if (!isNonEmptyTrimmedString(rec["applicationId"])) return { ok: false, message: "doc.freeze 缺 applicationId" };
    const reason = rec["reason"];
    // `migrated-draft` 不是 freeze reason（C1 `DOC_MIGRATION_MARKS`；不写 doc.freeze）。
    if (!isOneOf(DOC_FREEZE_REASONS, reason)) return { ok: false, message: "doc.freeze.reason 非法" };
    const customerReason = isOneOf(DOC_FREEZE_CUSTOMER_REASONS, reason);
    const applicationReason = isOneOf(DOC_FREEZE_APPLICATION_REASONS, reason);
    const origin = rec["origin"];
    if (origin === "role-direct" || origin === "chief-delegated") {
      const source = rec["actionSource"];
      if (!isDirectActionSource(source) || source.kind !== origin || rec["decisionId"] !== undefined || rec["decidedBy"] !== undefined
        || (source.kind === "role-direct" ? reason !== "role-direct-applied" || source.applicationId !== rec["applicationId"] || source.actorRoleId !== rec["actorRoleId"]
          : !customerReason || source.disposition !== "select" || rec["actorRoleId"] !== "chief")) return { ok: false, message: "doc.freeze direct source binding invalid" };
    } else if (origin === "judge-delegated") {
      // 2026-11-09 judge-delegated（W-J2/I-24/F3）：judge 代批冻结账本行（防御/未来路径；当前无 doc.freeze 生产者）。
      // 与 Model 分支同条件：reason 仅 proposal-confirmed/intent-confirmed；无客户字段；source 从 actionSource
      // 读取且自洽；applicationId 按 requestId 派生；at === source.at（= 冻结 frozenAt）。
      const source = rec["actionSource"];
      if (!isOneOf(DOC_FREEZE_JUDGE_DELEGATED_REASONS, reason)) return { ok: false, message: "doc.freeze judge reason 非法" };
      if (!isJudgeDelegatedSource(source)) return { ok: false, message: "doc.freeze judge source 非法" };
      if (rec["decidedBy"] !== undefined || rec["decisionId"] !== undefined || rec["actorRoleId"] !== undefined) {
        return { ok: false, message: "doc.freeze judge 不得携带客户字段" };
      }
      const expected = reason === "intent-confirmed" ? { prefix: "intent", cardKind: "intent-confirm" } : { prefix: "proposal", cardKind: "proposal" };
      if (rec["applicationId"] !== `${expected.prefix}-${source.requestId}`) return { ok: false, message: "doc.freeze judge applicationId 不匹配" };
      if (source.cardKind !== expected.cardKind) return { ok: false, message: "doc.freeze judge cardKind 与 reason 不匹配" };
      if (rec["at"] !== source.at) return { ok: false, message: "doc.freeze judge at 与 source.at 不一致" };
    } else if (!customerReason && !applicationReason) return { ok: false, message: "doc.freeze.reason 归属未定义" };
    else if (origin !== "customer" && origin !== "application") return { ok: false, message: "doc.freeze.origin 非法" };
    else if (customerReason) {
      if (origin !== "customer" || rec["decidedBy"] !== "customer") {
        return { ok: false, message: "doc.freeze 客户确认类 reason 必须 origin/decidedBy customer" };
      }
    } else if (origin !== "application" || rec["decidedBy"] !== undefined) {
      // 提交/迁移/bootstrap：application，不冒充客户（F35）。
      return { ok: false, message: "doc.freeze 应用类 reason 必须 origin application 且无 decidedBy" };
    }
    for (const field of ["decisionId", "actorRoleId"] as const) {
      if (rec[field] !== undefined && !isNonEmptyTrimmedString(rec[field])) {
        return { ok: false, message: `doc.freeze.${field} 非法` };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "refactor.request") {
    if (rec["schema"] !== REFACTOR_REQUEST_SCHEMA) return { ok: false, message: "refactor.request.schema 非法" };
    const requestId = rec["requestId"];
    if (typeof requestId !== "string" || !REFACTOR_REQUEST_ID_RE.test(requestId)) {
      return { ok: false, message: "refactor.request.requestId 非法" };
    }
    if (!isTaskSlug(rec["flowId"])) return { ok: false, message: "refactor.request.flowId 非法" };
    if (rec["initiatedBy"] !== REFACTOR_REQUESTED_BY) return { ok: false, message: "refactor.request.initiatedBy 必须为 convener" };
    if (!isNonEmptyTrimmedString(rec["title"])) return { ok: false, message: "refactor.request 缺 title" };
    const reason = rec["reason"];
    if (typeof reason !== "string" || reason.trim() === "" || Array.from(reason).length > REFACTOR_REASON_MAX) {
      return { ok: false, message: "refactor.request.reason 非法" };
    }
    if (!isOneOf(REFACTOR_REQUEST_STATUSES, rec["status"])) return { ok: false, message: "refactor.request.status 非法" };
    if (rec["managedBy"] !== REFACTOR_MANAGED_BY) {
      return { ok: false, message: "refactor.request.managedBy 必须为 application-scheduler" };
    }
    // 重构不是客户决定：不得带 decidedBy/批准卡字段（F31）。
    if (rec["decidedBy"] !== undefined) return { ok: false, message: "refactor.request 不得带 decidedBy" };
    const scope = rec["scope"];
    if (!isPlainRecord(scope)) return { ok: false, message: "refactor.request.scope 非法" };
    if (!isBoundedArray(scope["modules"], 64)) return { ok: false, message: "refactor.request.scope.modules 非法" };
    if (!isBoundedArray(scope["paths"], 64, isProjectRelativePath)) return { ok: false, message: "refactor.request.scope.paths 非法" };
    if (!isBoundedArray(scope["roles"], 64)) return { ok: false, message: "refactor.request.scope.roles 非法" };
    const enforcement = rec["enforcement"];
    if (!isPlainRecord(enforcement)) return { ok: false, message: "refactor.request.enforcement 非法" };
    if (!isBoundedArray(enforcement["writeSet"], 64, isProjectRelativePath)) {
      return { ok: false, message: "refactor.request.enforcement.writeSet 非法" };
    }
    const forbiddenKinds = enforcement["forbiddenKinds"];
    if (!isBoundedArray(forbiddenKinds, REFACTOR_FORBIDDEN_KINDS.length, (item) => isOneOf(REFACTOR_FORBIDDEN_KINDS, item))) {
      return { ok: false, message: "refactor.request.enforcement.forbiddenKinds 非法" };
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind.startsWith("stable.write.")) {
    if (rec["schema"] !== STABLE_WRITE_SCHEMA) return { ok: false, message: "stable.write.schema 非法" };
    const requestId = rec["requestId"];
    if (typeof requestId !== "string" || !STABLE_WRITE_REQUEST_ID_RE.test(requestId)) {
      return { ok: false, message: "stable.write.requestId 非法" };
    }
    if (!isNonEmptyTrimmedString(rec["roleId"])) return { ok: false, message: "stable.write 缺 roleId" };
    if (!isProjectRelativePath(rec["path"])) return { ok: false, message: "stable.write.path 非法" };
    if (!isOneOf(TRUNK_STABLE_FILE_KINDS, rec["stableKind"])) return { ok: false, message: "stable.write.stableKind 非法" };
    // `baseSha256 === ""` = 写入前文件不存在（C1 约定）；否则须为 64 位小写 hex。
    const baseSha256 = rec["baseSha256"];
    if (typeof baseSha256 !== "string" || (baseSha256 !== "" && !isSha256Hex(baseSha256))) {
      return { ok: false, message: "stable.write.baseSha256 非法" };
    }
    if (!isSha256Hex(rec["targetSha256"])) return { ok: false, message: "stable.write.targetSha256 非法" };
    // `status` 与 kind 后缀同义冗余；C2a 归属判定以 `kind` 为准（C1 注释）。
    if (!isOneOf(STABLE_WRITE_STATUSES, rec["status"])) return { ok: false, message: "stable.write.status 非法" };
    const origin = rec["origin"];
    if (origin !== "customer" && origin !== "application") return { ok: false, message: "stable.write.origin 非法" };
    if (rec["decidedBy"] !== undefined && rec["decidedBy"] !== "customer") {
      return { ok: false, message: "stable.write.decidedBy 非法" };
    }
    if (isOneOf(STABLE_WRITE_CUSTOMER_EVENT_KINDS, kind)) {
      if (origin !== "customer" || rec["decidedBy"] !== "customer") {
        return { ok: false, message: "stable.write 客户决定事件必须 origin/decidedBy customer" };
      }
      if (!isNonEmptyTrimmedString(rec["decisionId"]) && !isNonEmptyTrimmedString(rec["confirmationId"])) {
        return { ok: false, message: "stable.write 客户决定事件缺 decisionId/confirmationId" };
      }
    } else if (isOneOf(STABLE_WRITE_APPLICATION_EVENT_KINDS, kind)) {
      // requested/written/failed：应用动作（written 是应用动作，不记 customer）。
      if (origin !== "application" || rec["decidedBy"] !== undefined) {
        return { ok: false, message: "stable.write 应用事件必须 origin application 且无 decidedBy" };
      }
    } else {
      return { ok: false, message: "stable.write.kind 归属未定义" };
    }
    // F14：approvedAt/expiresAt/consumedAt 为 C1 可选字段——给出时校验形状，不要求必填。
    for (const field of ["approvedAt", "expiresAt", "consumedAt"] as const) {
      if (rec[field] !== undefined && !isIsoTimestampString(rec[field])) {
        return { ok: false, message: `stable.write.${field} 非法` };
      }
    }
    for (const field of ["decisionId", "confirmationId"] as const) {
      if (rec[field] !== undefined && !isNonEmptyTrimmedString(rec[field])) {
        return { ok: false, message: `stable.write.${field} 非法` };
      }
    }
    for (const field of ["reason", "message"] as const) {
      if (rec[field] !== undefined && typeof rec[field] !== "string") {
        return { ok: false, message: `stable.write.${field} 非法` };
      }
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (typeof rec["taskId"] !== "string" || rec["taskId"] === "") return { ok: false, message: "缺 taskId" };
  if (kind === "task.created") {
    if (rec["workSourceRef"] !== undefined && !isTaskWorkSourceRef(rec["workSourceRef"])) return { ok: false, message: "task.created workSourceRef invalid" };
    if (rec["parentTaskRef"] !== undefined && !isTaskParentRef(rec["parentTaskRef"])) return { ok: false, message: "task.created parentTaskRef invalid" };
    if (rec["reviewBasisRef"] !== undefined && !isTaskReviewBasisRef(rec["reviewBasisRef"])) return { ok: false, message: "task.created reviewBasisRef invalid" };
    if (rec["hubRouting"] !== undefined && !isTaskHubRouting(rec["hubRouting"])) return { ok: false, message: "task.created hubRouting invalid" };
    if (rec["reviewControllerRef"] !== undefined && !isTaskReviewControllerRef(rec["reviewControllerRef"])) return { ok: false, message: "task.created reviewControllerRef invalid" };
    // 2026-10-29（方案 v2.1 §5.4，F2）：创建者受控放宽到 chief / convener（运营派发实现任务）。
    if (rec["from"] !== "chief" && rec["from"] !== "convener") {
      return { ok: false, message: "task.created.from 必须为 chief 或 convener" };
    }
    if (typeof rec["to"] !== "string" || rec["to"] === "") return { ok: false, message: "task.created 缺 to" };
    if (typeof rec["text"] !== "string" || rec["text"].trim() === "") return { ok: false, message: "task.created 缺 text" };
    const sideEffect = rec["sideEffect"];
    if (typeof sideEffect !== "string" || !(SIDE_EFFECTS as readonly string[]).includes(sideEffect)) return { ok: false, message: "sideEffect 非法" };
    if (typeof rec["idempotencyKey"] !== "string" || rec["idempotencyKey"] === "") return { ok: false, message: "缺 idempotencyKey" };
    // 2026-10-29（F3）：可选治理字段——flowId/stepId 给出时必须是合法 slug（缺失 = 旧记录，兼容）。
    if (rec["flowId"] !== undefined && !isTaskSlug(rec["flowId"])) return { ok: false, message: "task.created.flowId 非法" };
    if (rec["stepId"] !== undefined && !isTaskSlug(rec["stepId"])) return { ok: false, message: "task.created.stepId 非法" };
    // 2026-10-29（v2.6/R2）：模块归属（可选；旧记录兼容）。id 至少 2 字符；目录项目相对、以 / 结尾。
    if (rec["moduleId"] !== undefined) {
      if (typeof rec["moduleId"] !== "string" || rec["moduleId"].length < 2 || !isTaskSlug(rec["moduleId"])) {
        return { ok: false, message: "task.created.moduleId 非法" };
      }
    }
    if (rec["modulePaths"] !== undefined) {
      const paths = rec["modulePaths"];
      if (!Array.isArray(paths) || paths.length < 1 || paths.length > 20) return { ok: false, message: "task.created.modulePaths 非法" };
      for (const path of paths) {
        if (
          typeof path !== "string" ||
          path === "" ||
          path.startsWith("/") ||
          /^[a-zA-Z]:\//.test(path) ||
          path.split("/").some((segment) => segment === ".." || segment === ".")
        ) {
          return { ok: false, message: "task.created.modulePaths 非法" };
        }
      }
    }
    if (rec["runId"] !== undefined) {
      if (typeof rec["runId"] !== "string" || !/^run-[a-z0-9][a-z0-9-]{2,95}$/.test(rec["runId"])) {
        return { ok: false, message: "task.created.runId 非法" };
      }
    }
    if (rec["runState"] !== undefined) {
      if (rec["runState"] !== "draft" && rec["runState"] !== "pinned" && rec["runState"] !== "legacy") {
        return { ok: false, message: "task.created.runState 非法" };
      }
    }
    if (rec["runStage"] !== undefined) {
      if (typeof rec["runStage"] !== "string" || rec["runStage"].trim() === "") {
        return { ok: false, message: "task.created.runStage 非法" };
      }
    }
    if (rec["moduleDirectory"] !== undefined) {
      const dir = rec["moduleDirectory"];
      const segments = typeof dir === "string" ? dir.replace(/\/$/, "").split("/") : [];
      if (
        typeof dir !== "string" ||
        !dir.endsWith("/") ||
        dir.startsWith("/") ||
        /^[a-zA-Z]:\//.test(dir) ||
        segments.some((segment) => segment === ".." || segment === "." || segment === "")
      ) {
        return { ok: false, message: "task.created.moduleDirectory 非法" };
      }
    }
    // T3（2026-11-10，v1.3 §7.1 / MF-3）：fixed 工作流绑定字段（可选；旧行无字段照常）。
    // 读侧同样 fail-closed：坏形状 ⇒ 该行按坏行计数跳过（不猜），不阻塞其余账本。
    const workflowId = rec["workflowId"];
    if (workflowId !== undefined) {
      if (!isTaskSlug(workflowId)) return { ok: false, message: "task.created.workflowId 非法" };
      if (rec["flowId"] === undefined) return { ok: false, message: "task.created fixed 缺 flowId" };
      if (!isWorkflowStage(rec["stage"])) return { ok: false, message: "task.created.stage 非法（fixed 任务必填）" };
      if (rec["runId"] !== undefined || rec["runState"] !== undefined) {
        return { ok: false, message: "task.created fixed 不得携带 runId/runState" };
      }
      if (rec["taskKind"] !== undefined
        && (typeof rec["taskKind"] !== "string" || rec["taskKind"].trim() === "" || rec["taskKind"] !== "stage-request")) {
        return { ok: false, message: "task.created.taskKind 非法" };
      }
      if (rec["workflowPath"] !== undefined && !isWorkflowPath(rec["workflowPath"])) {
        return { ok: false, message: "task.created.workflowPath 非法" };
      }
    } else if (rec["workflowPath"] !== undefined) {
      return { ok: false, message: "task.created.workflowPath 需配合 workflowId" };
    } else if (rec["stage"] !== undefined && !isWorkflowStage(rec["stage"])) {
      return { ok: false, message: "task.created.stage 非法" };
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "task.reported") {
    if (typeof rec["from"] !== "string" || rec["from"] === "") return { ok: false, message: "task.reported 缺 from" };
    if (typeof rec["status"] !== "string" || !(REPORT_STATUSES as readonly string[]).includes(rec["status"])) return { ok: false, message: "task.reported.status 非法" };
    if (typeof rec["summary"] !== "string" || rec["summary"] === "") return { ok: false, message: "task.reported 缺 summary" };
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "task.closed") {
    // 2026-10-29（方案 v2.1 §5.4，F2）：任务创建者收口自己的任务（chief / convener）。
    if (rec["by"] !== "chief" && rec["by"] !== "convener") return { ok: false, message: "task.closed.by 必须为 chief 或 convener" };
    if (typeof rec["outcome"] !== "string" || !(CLOSED_OUTCOMES as readonly string[]).includes(rec["outcome"])) return { ok: false, message: "task.closed.outcome 非法" };
    if (rec["actionSource"] !== undefined || rec["operationId"] !== undefined || rec["eventId"] !== undefined) {
      const source = rec["actionSource"];
      if (!isDirectActionSource(source) || source.kind !== "role-direct" || source.action !== "close-created-task"
        || source.actorRoleId !== rec["by"] || source.operationId !== rec["operationId"] || !isNonEmptyTrimmedString(rec["eventId"]))
        return { ok: false, message: "task.closed direct creator/source binding invalid" };
    }
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "task.redispatch") {
    if (typeof rec["retryOf"] !== "string" || rec["retryOf"] === "") return { ok: false, message: "task.redispatch 缺 retryOf" };
    if (typeof rec["to"] !== "string" || rec["to"] === "") return { ok: false, message: "task.redispatch 缺 to" };
    if (rec["reason"] !== "stuck") return { ok: false, message: "task.redispatch.reason 必须为 stuck" };
    if (typeof rec["safety"] !== "string" || !(REDISPATCH_SAFETIES as readonly string[]).includes(rec["safety"])) return { ok: false, message: "task.redispatch.safety 非法" };
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  if (kind === "task.delivered") {
    if (typeof rec["to"] !== "string" || rec["to"] === "") return { ok: false, message: "task.delivered 缺 to" };
    return { ok: true, event: rec as unknown as TaskStateEvent };
  }
  return { ok: false, message: "未处理的事件类型" };
}

/** 纯重放：创建记录、归并投递/报告/收口/重派；未知任务的后续事件记错误但不阻断。 */
export function replayTaskEvents(events: readonly TaskStateEvent[], errors: TaskStateReadError[] = []): TaskReplay {
  const records = new Map<string, TaskRecord>();
  const pendingRetry = new Map<string, string>();
  const allErrors = [...errors];
  let line = 0;
  for (const event of events) {
    line += 1;
    const taskId = event.kind === "delegation.changed" ||
      event.kind.startsWith("request.") ||
      event.kind.startsWith("approval.") ||
      event.kind.startsWith("project.") ||
      event.kind.startsWith("stable.write.") ||
      event.kind === "version.decision" ||
      // 2026-11-04（C2a）：trunk/VCA/冻结/重构事件同样不是任务事件（TaskRecord 语义不变）。
      event.kind === "trunk.state" ||
      event.kind === "trunk.amendment" ||
      event.kind === "version.change" ||
      event.kind === "doc.freeze" ||
      event.kind === "refactor.request"
      ? undefined
      : (event as { taskId?: string }).taskId;
    if (taskId === undefined) continue;
    if (event.kind === "task.created") {
      const existing = records.get(taskId);
      if (existing?.created !== undefined) {
        allErrors.push({ file: TASKS_STATE_REL, line, message: `重复 task.created：${taskId}` });
        continue;
      }
      // 2026-10-30（3.1/P1.3）：无 runId 的既有 flow 任务按 legacy 读取；不补造 runId/manifest。
      // T3（2026-11-10，v1.3 §7.1）：fixed 任务（workflowId 存在）**不带 run**，不得被回填成 legacy runState。
      const createdEvent = event.flowId !== undefined && event.workflowId === undefined
        && event.runId === undefined && event.runState === undefined
        ? { ...event, runState: "legacy" as const }
        : event;
      records.set(taskId, {
        taskId,
        created: createdEvent,
        reports: [],
        redispatches: [],
        ...(pendingRetry.has(taskId) ? { retryOf: pendingRetry.get(taskId) } : {}),
      });
      continue;
    }
    const record = records.get(taskId);
    if (record === undefined) {
      // 重派事件可先于新任务 created（应用先写 redispatch 再写 created）：先登记 retryOf，供后续 created 使用。
      if (event.kind === "task.redispatch") {
        pendingRetry.set(taskId, event.retryOf);
        records.get(event.retryOf)?.redispatches.push(event);
        continue;
      }
      allErrors.push({ file: TASKS_STATE_REL, line, message: `未知任务事件（${event.kind}）：${taskId}` });
      continue;
    }
    if (event.kind === "task.delivered") record.delivered ??= event;
    else if (event.kind === "task.reported") record.reports.push(event);
    else if (event.kind === "task.closed") record.closed = event;
    else if (event.kind === "task.redispatch") {
      record.redispatches.push(event);
      pendingRetry.set(event.taskId, event.retryOf);
      const newRecord = records.get(event.taskId);
      if (newRecord !== undefined) newRecord.retryOf = event.retryOf;
    }
  }
  const unclosed = [...records.values()]
    .filter((record) => record.closed === undefined)
    .sort((a, b) => String(a.created?.at ?? "").localeCompare(String(b.created?.at ?? "")));
  return { records, events: [...events], errors: allErrors, unclosed };
}

/**
 * 读取并重放：轮转文件按 `.N`（旧）→ 当前（新）顺序读；坏行跳过并记录。
 * 读取/坏行/文件级失败**不阻塞启动**；读文件异常（非 ENOENT）以空结果 + 错误返回，不抛给调用方。
 * 轮转/旧→新/坏行计数**全部**走 A2 `jsonl-ledger`（B1 等价迁移；诊断 `tasks.read.partial` 留在此处）。
 */
export async function readTaskState(projectRoot: string): Promise<TaskStateReadResult> {
  const { rotations } = limits();
  const read = await readJsonlLedger<TaskStateEvent>(
    tasksStatePath(projectRoot),
    (raw) => {
      const checked = validateEvent(JSON.parse(raw));
      return checked.ok ? { ok: true, value: checked.event } : { ok: false, message: checked.message };
    },
    { rotations },
  );
  const replay = replayTaskEvents(read.values, read.errors);
  if (replay.errors.length > 0) {
    createDiagnosticLogger({ component: "orchestration.task-state", projectRoot }).record("tasks.read.partial", { count: replay.errors.length });
  }
  return { ...replay, files: [...read.files] };
}

/** Pure shared O event parser. Storage access remains at the caller's legal Provider boundary. */
export function validateTaskStateEvent(value: unknown): ReturnType<typeof validateEvent> { return validateEvent(value); }

// —————————————— 查询辅助 ——————————————

export function taskReportStatusOf(status: "completed" | "blocked" | "failed" | "aborted" | "unreported"): TaskReportStatus {
  if (status === "completed") return "done";
  if (status === "blocked" || status === "unreported") return "blocked";
  return "failed";
}

/** 任务状态（B-05 状态机；redispatch 只影响派生显示，不改原记录）。 */
export function taskStatusOf(record: TaskRecord): "created" | "delivered" | "reported" | "closed" | "failed" {
  if (record.closed !== undefined) return "closed";
  const last = record.reports[record.reports.length - 1];
  if (last?.status === "failed") return "failed";
  if (last !== undefined) return "reported";
  if (record.delivered !== undefined) return "delivered";
  return "created";
}

export interface TaskCardView {
  taskId: string;
  retryOf?: string;
  targetRoleId: string;
  text: string;
  expectedOutput?: string;
  requestedEvidence?: string[];
  moduleId?: string;
  moduleDirectory?: string;
  modulePaths?: string[];
  flowId?: string;
  runId?: string;
  runState?: "draft" | "pinned" | "legacy";
  runStage?: string;
  /** T3（2026-11-10，v1.3 §7.1）：fixed 工作流绑定（可选；旧任务无字段）。 */
  workflowId?: string;
  stage?: WorkflowStage;
  taskKind?: string;
  workflowPath?: WorkflowPath;
  sideEffect: TaskSideEffect;
  status: "created" | "delivered" | "reported" | "closed" | "failed";
  createdAt: string;
  deliveredAt?: string;
  lastReport?: TaskReportedEvent;
  closed?: { outcome: TaskClosedOutcome; note?: string; at: string };
  reports: TaskReportedEvent[];
}

export function taskCardOf(record: TaskRecord): TaskCardView | undefined {
  if (record.created === undefined) return undefined;
  const lastReport = record.reports[record.reports.length - 1];
  return {
    taskId: record.taskId,
    ...(record.retryOf !== undefined ? { retryOf: record.retryOf } : {}),
    targetRoleId: record.created.to,
    text: record.created.text,
    ...(record.created.expectedOutput !== undefined ? { expectedOutput: record.created.expectedOutput } : {}),
    ...(record.created.requestedEvidence !== undefined ? { requestedEvidence: [...record.created.requestedEvidence] } : {}),
    ...(record.created.moduleId !== undefined ? { moduleId: record.created.moduleId } : {}),
    ...(record.created.moduleDirectory !== undefined ? { moduleDirectory: record.created.moduleDirectory } : {}),
    ...(record.created.modulePaths !== undefined ? { modulePaths: [...record.created.modulePaths] } : {}),
    ...(record.created.flowId !== undefined ? { flowId: record.created.flowId } : {}),
    ...(record.created.runId !== undefined ? { runId: record.created.runId } : {}),
    ...(record.created.runState !== undefined
      ? { runState: record.created.runState }
      : record.created.flowId !== undefined && record.created.workflowId === undefined
        ? { runState: "legacy" as const }
        : {}),
    ...(record.created.runStage !== undefined ? { runStage: record.created.runStage } : {}),
    ...(record.created.workflowId !== undefined ? { workflowId: record.created.workflowId } : {}),
    ...(record.created.stage !== undefined ? { stage: record.created.stage } : {}),
    ...(record.created.taskKind !== undefined ? { taskKind: record.created.taskKind } : {}),
    ...(record.created.workflowPath !== undefined ? { workflowPath: record.created.workflowPath } : {}),
    sideEffect: record.created.sideEffect,
    status: taskStatusOf(record),
    createdAt: record.created.at,
    ...(record.delivered !== undefined ? { deliveredAt: record.delivered.at } : {}),
    ...(lastReport !== undefined ? { lastReport } : {}),
    ...(record.closed !== undefined ? { closed: { outcome: record.closed.outcome, ...(record.closed.note !== undefined ? { note: record.closed.note } : {}), at: record.closed.at } } : {}),
    reports: [...record.reports],
  };
}

export function taskCards(snapshot: TaskReplay): TaskCardView[] {
  return [...snapshot.records.values()]
    .map(taskCardOf)
    .filter((card): card is TaskCardView => card !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 同一幂等键下**未收口**的任务（派发去重用；已 closed 允许再次派发）。 */
export function findOpenTaskByIdempotencyKey(snapshot: TaskReplay, idempotencyKey: string): TaskRecord | undefined {
  for (const record of snapshot.records.values()) {
    if (record.created?.idempotencyKey === idempotencyKey && record.closed === undefined) return record;
  }
  return undefined;
}

/** 同一幂等键下的任务（含已报告/已收口）；重复派发抑制用，返回最新一条。 */
export function findTaskByIdempotencyKey(snapshot: TaskReplay, idempotencyKey: string): TaskRecord | undefined {
  let found: TaskRecord | undefined;
  for (const record of snapshot.records.values()) {
    if (record.created?.idempotencyKey !== idempotencyKey) continue;
    if (found === undefined || (record.created?.at ?? "") >= (found.created?.at ?? "")) found = record;
  }
  return found;
}

/** 某任务链已发生的重派次数（`retryOf` 反向链，最多 2 次自动重派；首次尝试不计）。 */
export function redispatchCountOf(snapshot: TaskReplay, originalTaskId: string): number {
  let count = 0;
  let cursor = originalTaskId;
  for (;;) {
    const next = [...snapshot.records.values()].find((record) => record.retryOf === cursor);
    if (next === undefined) break;
    count += 1;
    cursor = next.taskId;
    if (count > 100) break; // 防御坏循环
  }
  return count;
}

/** 追加事件的便捷构造（v=1；at 可注入）。 */
export function taskEvent<T extends TaskStateEvent["kind"]>(
  kind: T,
  fields: Omit<Extract<TaskStateEvent, { kind: T }>, "v" | "kind" | "at">,
  now: () => Date = () => new Date(),
): Extract<TaskStateEvent, { kind: T }> {
  return { v: 1, at: now().toISOString(), kind, ...fields } as Extract<TaskStateEvent, { kind: T }>;
}

/** 任务卡固定字段的纯文本行（B-10；聊天系统行/测试共用）。 */
export function renderTaskCardLines(card: TaskCardView): string[] {
  return [
    `[任务] #${card.taskId}${card.retryOf !== undefined ? `（重派自 ${card.retryOf}）` : ""}`,
    ...(card.runId !== undefined
      ? [`run：${card.runId}（${card.runState ?? "legacy"}${card.runStage !== undefined ? `，stage ${card.runStage}` : ""}）`]
      : card.flowId !== undefined && card.workflowId === undefined
        ? ["run：legacy（未冻结）"]
        : []),
    ...(card.workflowId !== undefined
      ? [`工作流：${card.workflowId}（${card.workflowPath !== undefined ? `路径 ${card.workflowPath}，` : ""}stage ${card.stage ?? "?"}${card.taskKind !== undefined ? `，${card.taskKind}` : ""}）`]
      : []),
    `目标角色：${card.targetRoleId}`,
    `目标：${shortenSummary(card.text, 200)}`,
    ...(card.expectedOutput !== undefined ? [`期望产出：${shortenSummary(card.expectedOutput, 200)}`] : []),
    ...(card.requestedEvidence !== undefined && card.requestedEvidence.length > 0
      ? [`可选证据：${card.requestedEvidence.slice(0, 5).join("；")}`]
      : []),
    ...(card.moduleId !== undefined ? [`模块：${card.moduleId}（${(card.modulePaths ?? (card.moduleDirectory !== undefined ? [card.moduleDirectory] : [])).join("、")}）`] : []),
    `状态：${card.status}｜副作用：${card.sideEffect}｜时间：${card.createdAt}`,
  ];
}
