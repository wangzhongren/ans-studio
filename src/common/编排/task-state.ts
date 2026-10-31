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
// 纪律：本模块不执行任务、不投递、不判定验收；`task.closed` 只由幕僚动作写入。
// `.ans/state/**` 是应用独占的运行数据（非仓库候选）；旧 gate/flow/ledger 不读本文件。

import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
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
} from "../../model/runtime.ts";
import { GOVERNANCE_CARD_GROUP } from "../../model/runtime.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";

/** 项目相对路径（POSIX 形式，便于跨平台展示与测试）。 */
export const TASKS_STATE_REL = ".ans/state/tasks.jsonl";
/** 默认单文件上限与保留份数（B-03「轮转」；env 可调）。 */
export const TASKS_MAX_BYTES_ENV = "ANS_TASKS_MAX_BYTES";
export const TASKS_ROTATIONS_ENV = "ANS_TASKS_ROTATIONS";
export const DEFAULT_TASKS_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_TASKS_ROTATIONS = 3;

const SIDE_EFFECTS: readonly TaskSideEffect[] = ["read-only", "docs", "code", "external", "destructive", "unknown"];
const TASK_EVENT_KINDS = new Set([
  "task.created", "task.delivered", "task.reported", "task.closed", "task.redispatch", "delegation.changed",
  // C 批：申请/决策/审批事件（C-03）；与任务事件同文件、append-only。
  "request.created", "request.presented", "request.resolved", "request.notified", "request.orphaned",
  "approval.created", "approval.resolved", "approval.expired",
]);
const REPORT_STATUSES: readonly TaskReportStatus[] = ["done", "blocked", "failed"];
const CLOSED_OUTCOMES: readonly TaskClosedOutcome[] = ["accepted", "rework", "rejected"];
const REDISPATCH_SAFETIES: readonly TaskRedispatchSafety[] = ["safe", "unsafe", "needs-review"];

/** 治理步骤/流程 slug 校验（2026-10-29，F3）：小写 slug、不含首/尾连字符；仅供事件字段形态校验。 */
function isTaskSlug(value: unknown): boolean {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(value);
}

/**
 * 2026-10-31（D3 卡种收口）：`request.*.cardKind` 字段白名单校验——
 * 唯一来源 = `model/runtime.ts` 的 `GOVERNANCE_CARD_GROUP` 键集（不另写第二张映射表）。
 */
function isGovernanceCardKind(value: unknown): boolean {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, value);
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

// —————————————— 追加（轮转 + 原子行） ——————————————

type AppendResult = { ok: true; path: string } | { ok: false; message: string; code?: string };

function jsonLine(event: TaskStateEvent): string {
  return `${JSON.stringify(event)}\n`;
}

async function rotateIfNeeded(file: string, incomingBytes: number, maxBytes: number, rotations: number): Promise<void> {
  let size = 0;
  try {
    size = (await fs.stat(file)).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (size + incomingBytes <= maxBytes) return;
  // 旧 → 新依次后移；最老的越界份删除。
  for (let i = rotations; i >= 1; i -= 1) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      await fs.rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
  }
  try {
    await fs.unlink(`${file}.${rotations + 1}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** 每文件追加串行链（同进程内不交错；跨进程行仍为单次 appendFile）。 */
const appendChains = new Map<string, Promise<unknown>>();

/**
 * 追加一个任务事件。写失败**不抛**：返回 `{ok:false,message}`，调用方如实回执/记日志。
 * 轮转在追加前按文件当刻大小判定；行内 JSON 不含换行（`JSON.stringify` 保证）。
 */
export function appendTaskEvent(
  projectRoot: string,
  event: TaskStateEvent,
  options: { allowLegacyRun?: boolean } = {},
): Promise<AppendResult> {
  // 2026-10-30（3.1/P1.3 R1）：**新建**项目任务（flowId 有值）必须带 runId+runState；
  // 只有历史既有/测试重放可用 allowLegacyRun 写入无 run 的旧形状。读侧仍按 legacy 兼容。
  if (event.kind === "task.created" && event.flowId !== undefined && options.allowLegacyRun !== true) {
    if (event.runId === undefined || event.runId === "" || event.runState === undefined) {
      return Promise.resolve({ ok: false, code: "run-required", message: "task.created.run-required：新建项目任务必须带 runId 与 runState（legacy 仅历史重放允许）" });
    }
  }
  const file = tasksStatePath(projectRoot);
  const line = jsonLine(event);
  const previous = appendChains.get(file) ?? Promise.resolve();
  const next = previous.then(async (): Promise<AppendResult> => {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const { maxBytes, rotations } = limits();
      await rotateIfNeeded(file, Buffer.byteLength(line, "utf8"), maxBytes, rotations);
      await fs.appendFile(file, line, { encoding: "utf8", flag: "a" });
      return { ok: true, path: file };
    } catch (err) {
      createDiagnosticLogger({ component: "orchestration.task-state", projectRoot }).error("tasks.append.failed", err, { taskId: (event as { taskId?: string }).taskId });
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });
  const settled = next.then(() => undefined, () => undefined);
  appendChains.set(file, settled);
  void settled.finally(() => {
    if (appendChains.get(file) === settled) appendChains.delete(file);
  });
  return next;
}

// —————————————— 读取 / 重放 ——————————————

async function readFileLines(file: string): Promise<{ lines: string[]; dir: string } | undefined> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return { lines: raw.split(/\r?\n/), dir: path.dirname(file) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

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
    if (kind === "request.created") {
      if (typeof rec["sourceRoleId"] !== "string" || rec["sourceRoleId"] === "") return { ok: false, message: "request.created 缺 sourceRoleId" };
      if (typeof rec["title"] !== "string" || rec["title"] === "") return { ok: false, message: "request.created 缺 title" };
      if (!Array.isArray(rec["options"])) return { ok: false, message: "request.created 缺 options" };
      // 2026-10-31（D3 卡种收口）：可选卡种；给出时必须在治理卡种白名单内（缺失 = 旧记录，兼容）。
      if (rec["cardKind"] !== undefined && !isGovernanceCardKind(rec["cardKind"])) {
        return { ok: false, message: "request.created.cardKind 非法" };
      }
    }
    if (kind === "request.resolved") {
      if (rec["by"] !== "judge" && rec["by"] !== "customer") return { ok: false, message: "request.resolved.by 非法" };
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
  if (typeof rec["taskId"] !== "string" || rec["taskId"] === "") return { ok: false, message: "缺 taskId" };
  if (kind === "task.created") {
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
    const taskId = event.kind === "delegation.changed" || event.kind.startsWith("request.") || event.kind.startsWith("approval.")
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
      const createdEvent = event.flowId !== undefined && event.runId === undefined && event.runState === undefined
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
 * 坏行/读失败**不阻塞启动**；读文件异常（非 ENOENT）以空结果 + 错误返回，不抛给调用方。
 */
export async function readTaskState(projectRoot: string): Promise<TaskStateReadResult> {
  const file = tasksStatePath(projectRoot);
  const { rotations } = limits();
  const files: string[] = [];
  for (let i = rotations; i >= 1; i -= 1) {
    try {
      await fs.access(`${file}.${i}`);
      files.push(`${file}.${i}`);
    } catch { /* 不存在 */ }
  }
  files.push(file);
  const events: TaskStateEvent[] = [];
  const errors: TaskStateReadError[] = [];
  for (const source of files) {
    let lines: string[];
    try {
      const read = await readFileLines(source);
      if (read === undefined) continue;
      lines = read.lines;
    } catch (err) {
      errors.push({ file: path.basename(source), line: 0, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    lines.forEach((raw, index) => {
      if (raw.trim() === "") return;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch (err) {
        errors.push({ file: path.basename(source), line: index + 1, message: `JSON 坏行：${err instanceof Error ? err.message : String(err)}` });
        return;
      }
      const checked = validateEvent(value);
      if (!checked.ok) {
        errors.push({ file: path.basename(source), line: index + 1, message: checked.message });
        return;
      }
      events.push(checked.event);
    });
  }
  const replay = replayTaskEvents(events, errors);
  if (replay.errors.length > 0) {
    createDiagnosticLogger({ component: "orchestration.task-state", projectRoot }).record("tasks.read.partial", { count: replay.errors.length });
  }
  return { ...replay, files: files.map((f) => path.basename(f)) };
}

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
      : record.created.flowId !== undefined
        ? { runState: "legacy" as const }
        : {}),
    ...(record.created.runStage !== undefined ? { runStage: record.created.runStage } : {}),
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
      : card.flowId !== undefined
        ? ["run：legacy（未冻结）"]
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
