// src/common/编排/block-ledger.ts
// 编排主属（2026-11-20 block resolver 第一批）：**block 生命周期账本**（`.ans/state/blocks.jsonl`）。
//
// 依据：`docs/planning/2026-11-20_design_block-resolution-paths.md` §五（生命周期/事件形状/审计/幂等/
// 防重复卡）、§七.5（project_state open blocks）。协调方裁定：**无 stopped 终态**——`resolution`
// 只允许 `fixed` / `decided`；`escalated` 不是终态（升级后必须再次 routed）；终止只能是客户决策结果
// （`block-terminate-flow` ⇒ 记录 `decided` + note；workflow 级 `workflow.closed stopped` 另账）。
//
// 纪律：
//  · append-only；同幂等键 `block:<blockId>:<kind>:<attempt>` replay 返回原事件（first wins）。
//  · 事件形状单一来源 = `block-resolution.ts`（类/路由/指纹/幂等键）；本模块只做 I/O + 生命周期校验。
//  · 坏行 fail-closed：读取如实计数（`badLines`/`errors`），**不猜**；存在坏行时拒绝写入
//    （`block-ledger-corrupt`），避免在未知状态上追加处置。
//  · 本模块不写 workflows.jsonl/tasks.jsonl，不改变阶段状态机；block 生命周期独立记账。
//  · 同指纹重复 ≥ 阈值（默认 2）⇒ 只允许 escalated（`block.raised` 之后必须先 `escalateBlock`）。

import path from "node:path";

import type { WorkflowStage } from "../../model/runtime.ts";
import { isWorkflowStage } from "../../model/runtime.ts";
import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
  type JsonlReadError,
} from "../shared/jsonl-ledger.ts";
import type {
  BlockClass,
  BlockClassCode,
  BlockEscalationReason,
  BlockEscalationTarget,
  BlockFact,
  BlockOwnerKind,
  BlockProtocol,
  BlockResolverPolicy,
  BlockRouteKind,
} from "./block-resolution.ts";
import {
  BLOCK_ESCALATION_REASONS,
  BLOCK_ESCALATION_TARGETS,
  BLOCK_EVENT_KINDS,
  BLOCK_REPEAT_THRESHOLD,
  BLOCK_ROUTE_KINDS,
  blockClassCodeOf,
  blockIdempotencyKey,
  classifyBlock,
  computeBlockFingerprint,
  computeBlockId,
  isBlockClass,
  isBlockProtocol,
} from "./block-resolution.ts";

// —————————————— 路径 / schema ——————————————

/** block 生命周期账本（应用独占、append-only；设计 Q1 默认）。 */
export const BLOCKS_STATE_REL = ".ans/state/blocks.jsonl";
/** `block/v1`（设计 §5.2）。 */
export const BLOCK_LEDGER_SCHEMA = "block/v1" as const;
/** 与 tasks/workflows 账本同默认：5 MiB × 3 轮转。 */
export const BLOCK_LEDGER_LIMITS = Object.freeze({
  maxBytes: DEFAULT_JSONL_MAX_BYTES,
  rotations: DEFAULT_JSONL_ROTATIONS,
});

export function blocksStatePath(projectRoot: string): string {
  return path.join(projectRoot, ...BLOCKS_STATE_REL.split("/"));
}

// —————————————— 事件形状（block/v1） ——————————————

interface BlockLedgerEventBase {
  v: 1;
  at: string;
  schema: typeof BLOCK_LEDGER_SCHEMA;
  kind: (typeof BLOCK_EVENT_KINDS)[number];
  blockId: string;
  idempotencyKey: string;
}

/** `block.raised`（设计 §5.2 必填字段 + 可选审计字段）。 */
export interface BlockRaisedEvent extends BlockLedgerEventBase {
  kind: "block.raised";
  class: BlockClass;
  classCode: BlockClassCode;
  code?: string;
  detailCode?: string;
  source?: string;
  workflowId?: string;
  flowId?: string;
  stage?: WorkflowStage;
  taskId?: string;
  requestId?: string;
  fingerprint: string;
  summary: string;
  evidenceRefs: string[];
  protocol: BlockProtocol;
  /** 同指纹已发生次数（由 `raiseBlock` 计算；审计/重复判定用）。 */
  priorOccurrences?: number;
}

/** `block.routed`（每次路由/重路由一条；`route` 不含 escalated）。 */
export interface BlockRoutedEvent extends BlockLedgerEventBase {
  kind: "block.routed";
  route: BlockRouteKind;
  targetRoleId?: string;
  taskId?: string;
  cardRequestId?: string;
  attempt: number;
  reason: string;
}

/** `block.resolved`（终态只允许 fixed / decided；`stopped` 非法）。 */
export interface BlockResolvedEvent extends BlockLedgerEventBase {
  kind: "block.resolved";
  resolution: "fixed" | "decided";
  by: string;
  decisionId?: string;
  reEntry?: string;
  note: string;
}

/** `block.escalated`（不是终态；后接新 routed）。 */
export interface BlockEscalatedEvent extends BlockLedgerEventBase {
  kind: "block.escalated";
  from: string;
  to: BlockEscalationTarget;
  reason: BlockEscalationReason;
  attempt: number;
  note?: string;
}

export type BlockLedgerEvent = BlockRaisedEvent | BlockRoutedEvent | BlockResolvedEvent | BlockEscalatedEvent;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const FINGERPRINT_RE = /^[a-f0-9]{64}$/;
const BLOCK_ID_RE = /^[a-f0-9]{24}$/;

/**
 * 事件守卫（schema 校验；**fail-closed**）：
 * - `resolution` 只允许 `fixed`/`decided`（`stopped` 等一律非法）；
 * - `block.routed.route` 不含 `escalated`（升级走 `block.escalated` 事件）；
 * - `block.escalated.reason`/`to` 只允许枚举值；`decided` 必须有 `decisionId`。
 */
export function isBlockLedgerEvent(value: unknown): value is BlockLedgerEvent {
  if (!isPlainObject(value)) return false;
  if (value["v"] !== 1 || value["schema"] !== BLOCK_LEDGER_SCHEMA) return false;
  if (!isNonEmptyString(value["at"]) || !isNonEmptyString(value["idempotencyKey"])) return false;
  const blockId = value["blockId"];
  if (!isNonEmptyString(blockId) || !BLOCK_ID_RE.test(blockId)) return false;
  const kind = value["kind"];
  if (typeof kind !== "string" || !(BLOCK_EVENT_KINDS as readonly string[]).includes(kind)) return false;
  if (kind === "block.raised") {
    if (!isBlockClass(value["class"])) return false;
    if (value["classCode"] !== blockClassCodeOf(value["class"] as BlockClass)) return false;
    if (!isBlockProtocol(value["protocol"])) return false;
    if (!isNonEmptyString(value["fingerprint"]) || !FINGERPRINT_RE.test(value["fingerprint"] as string)) return false;
    if (!isNonEmptyString(value["summary"])) return false;
    const refs = value["evidenceRefs"];
    if (!Array.isArray(refs) || !refs.every((ref) => typeof ref === "string")) return false;
    if (value["stage"] !== undefined && !isWorkflowStage(value["stage"])) return false;
    for (const key of ["code", "detailCode", "source", "workflowId", "flowId", "taskId", "requestId"] as const) {
      if (value[key] !== undefined && typeof value[key] !== "string") return false;
    }
    if (value["priorOccurrences"] !== undefined
      && (!Number.isSafeInteger(value["priorOccurrences"]) || (value["priorOccurrences"] as number) < 0)) {
      return false;
    }
    return true;
  }
  if (kind === "block.routed") {
    const route = value["route"];
    if (typeof route !== "string" || !(BLOCK_ROUTE_KINDS as readonly string[]).includes(route)) return false;
    if (route === "escalated") return false;
    if (!Number.isSafeInteger(value["attempt"]) || (value["attempt"] as number) < 1) return false;
    if (!isNonEmptyString(value["reason"])) return false;
    for (const key of ["targetRoleId", "taskId", "cardRequestId"] as const) {
      if (value[key] !== undefined && typeof value[key] !== "string") return false;
    }
    return true;
  }
  if (kind === "block.resolved") {
    const resolution = value["resolution"];
    if (resolution !== "fixed" && resolution !== "decided") return false;
    if (!isNonEmptyString(value["by"])) return false;
    if (!isNonEmptyString(value["note"])) return false;
    if (resolution === "decided" && !isNonEmptyString(value["decisionId"])) return false;
    if (value["decisionId"] !== undefined && typeof value["decisionId"] !== "string") return false;
    if (value["reEntry"] !== undefined && typeof value["reEntry"] !== "string") return false;
    return true;
  }
  if (kind === "block.escalated") {
    if (!isNonEmptyString(value["from"])) return false;
    if (typeof value["to"] !== "string" || !(BLOCK_ESCALATION_TARGETS as readonly string[]).includes(value["to"])) return false;
    if (typeof value["reason"] !== "string" || !(BLOCK_ESCALATION_REASONS as readonly string[]).includes(value["reason"])) return false;
    if (!Number.isSafeInteger(value["attempt"]) || (value["attempt"] as number) < 1) return false;
    if (value["note"] !== undefined && typeof value["note"] !== "string") return false;
    return true;
  }
  return false;
}

// —————————————— 读取 / 幂等追加（jsonl-ledger 单一实现） ——————————————

export interface BlockLedgerReadResult {
  files: string[];
  events: BlockLedgerEvent[];
  errors: JsonlReadError[];
  /** 坏 JSON + parser 拒绝的行数（fail-closed：不解释、不猜）。 */
  badLines: number;
  ignoredLines: number;
}

export async function readBlockLedger(projectRoot: string): Promise<BlockLedgerReadResult> {
  const read = await readJsonlLedger<BlockLedgerEvent>(
    blocksStatePath(projectRoot),
    (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { ok: false, message: `JSON 坏行：${err instanceof Error ? err.message : String(err)}` };
      }
      return isBlockLedgerEvent(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, message: "block 事件形状非法（schema/字段/枚举；含 resolution=stopped 等）" };
    },
    BLOCK_LEDGER_LIMITS,
  );
  return {
    files: [...read.files],
    events: [...read.values],
    errors: [...read.errors],
    badLines: read.badLines,
    ignoredLines: read.ignoredLines,
  };
}

export type BlockLedgerAppendResult =
  | { ok: true; path: string; replay: boolean; event: BlockLedgerEvent }
  | { ok: false; code?: string; message: string };

/** 同文件幂等追加的进程内串行链（read-then-append；跨进程并发不在本批范围）。 */
const appendChains = new Map<string, Promise<unknown>>();

/** 追加 block 事件（同幂等键 replay 返回原事件，不重复追加；形状非法拒绝写入）。 */
export function appendBlockEvent(projectRoot: string, event: BlockLedgerEvent): Promise<BlockLedgerAppendResult> {
  if (!isBlockLedgerEvent(event)) {
    return Promise.resolve({ ok: false, code: "invalid-event", message: "block/v1 事件形状非法（拒绝写入）" });
  }
  const file = path.resolve(blocksStatePath(projectRoot));
  const previous = appendChains.get(file) ?? Promise.resolve();
  const next = previous.then(async (): Promise<BlockLedgerAppendResult> => {
    const existing = await readBlockLedger(projectRoot);
    const replay = existing.events.find((item) => item.idempotencyKey === event.idempotencyKey);
    if (replay !== undefined) {
      return { ok: true, path: file, replay: true, event: replay };
    }
    const appended = await appendJsonlLine(file, JSON.stringify(event), BLOCK_LEDGER_LIMITS);
    if (!appended.ok) {
      return {
        ok: false,
        ...(appended.code !== undefined ? { code: appended.code } : {}),
        message: appended.message,
      };
    }
    return { ok: true, path: file, replay: false, event };
  });
  const settled = next.then(() => undefined, () => undefined);
  appendChains.set(file, settled);
  void settled.finally(() => {
    if (appendChains.get(file) === settled) appendChains.delete(file);
  });
  return next;
}

// —————————————— 生命周期重放（纯函数；不猜、不改写） ——————————————

export type BlockLifecycleStatus = "raised" | "routed" | "escalated" | "resolved";

/**
 * 单次 `block.routed` 的聚合（2026-11-20 R1 收尾修补）：
 * 保留每次路由的修复任务/卡链接（taskId/cardRequestId）与 route/reason/attempt/at，
 * 供桌面从生命周期直接恢复「谁在修/哪张卡在等」而无需直读 routed 事件。
 */
export interface BlockRoutingRecord {
  route: BlockRouteKind;
  reason: string;
  attempt: number;
  at: string;
  idempotencyKey: string;
  targetRoleId?: string;
  taskId?: string;
  cardRequestId?: string;
}

export interface BlockLifecycle {
  blockId: string;
  class: BlockClass;
  classCode: BlockClassCode;
  protocol: BlockProtocol;
  fingerprint: string;
  status: BlockLifecycleStatus;
  resolution?: "fixed" | "decided";
  resolvedBy?: string;
  decisionId?: string;
  reEntry?: string;
  /** 当前责任方（routed/escalated 后更新）。 */
  owner?: string;
  waitingOn?: BlockOwnerKind;
  routeKind?: BlockRouteKind;
  routeCount: number;
  escalationCount: number;
  attempt: number;
  workflowId?: string;
  flowId?: string;
  stage?: WorkflowStage;
  /** raised 事实关联的任务（被 blocked/failed 的任务；不是修复任务）。 */
  taskId?: string;
  requestId?: string;
  code?: string;
  summary: string;
  evidenceRefs: readonly string[];
  raisedAt: string;
  updatedAt: string;
  /** 最近一条事件幂等键（审计/测试）。 */
  lastEventId: string;
  /** 每次 `block.routed` 的完整路由记录（旧→新；R1 收尾修补）。 */
  routings: BlockRoutingRecord[];
  /** 最近一次路由的链接（= `routings` 末项；审计/桌面便利字段）。 */
  routeReason?: string;
  routeAttempt?: number;
  routeTargetRoleId?: string;
  routeTaskId?: string;
  cardRequestId?: string;
}

export interface BlockLedgerReplayResult {
  records: ReadonlyMap<string, BlockLifecycle>;
  /** 按 raised 顺序的 blockId。 */
  order: readonly string[];
  /** 生命周期非法（事件顺序/身份/provenance）——如实列出，不猜。 */
  errors: readonly string[];
}

function waitingOnOf(route: BlockRouteKind): BlockOwnerKind {
  if (route === "engine-auto-fix") return "engine";
  if (route === "judge-decision") return "judge";
  if (route === "customer-decision") return "customer";
  return "role";
}

function waitingOnOfEscalation(to: BlockEscalationTarget): BlockOwnerKind {
  if (to === "customer-decision") return "customer";
  if (to === "engine-repair") return "engine";
  return "role";
}

/** 从账本事件重放每个 block 的完整生命周期（纯函数；非法顺序计入 errors、不伪造状态）。 */
export function replayBlockLifecycles(events: readonly BlockLedgerEvent[]): BlockLedgerReplayResult {
  const records = new Map<string, BlockLifecycle>();
  const order: string[] = [];
  const errors: string[] = [];
  for (const event of events) {
    if (!isBlockLedgerEvent(event)) {
      errors.push(`非法事件（形状）：${String((event as { idempotencyKey?: unknown }).idempotencyKey ?? "?")}`);
      continue;
    }
    const existing = records.get(event.blockId);
    if (event.kind === "block.raised") {
      if (existing !== undefined) {
        errors.push(`${event.blockId}: 重复 block.raised（同 block 只允许一次 raised）`);
        continue;
      }
      const lifecycle: BlockLifecycle = {
        blockId: event.blockId,
        class: event.class,
        classCode: event.classCode,
        protocol: event.protocol,
        fingerprint: event.fingerprint,
        status: "raised",
        routeCount: 0,
        escalationCount: 0,
        attempt: 0,
        ...(event.workflowId !== undefined ? { workflowId: event.workflowId } : {}),
        ...(event.flowId !== undefined ? { flowId: event.flowId } : {}),
        ...(event.stage !== undefined ? { stage: event.stage } : {}),
        ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
        ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
        ...(event.code !== undefined ? { code: event.code } : {}),
        summary: event.summary,
        evidenceRefs: [...event.evidenceRefs],
        raisedAt: event.at,
        updatedAt: event.at,
        lastEventId: event.idempotencyKey,
        routings: [],
      };
      records.set(event.blockId, lifecycle);
      order.push(event.blockId);
      continue;
    }
    if (existing === undefined) {
      errors.push(`${event.blockId}: ${event.kind} 发生在 block.raised 之前（不猜）`);
      continue;
    }
    if (existing.status === "resolved") {
      errors.push(`${event.blockId}: 已 resolved（${existing.resolution}）后仍出现 ${event.kind}`);
      continue;
    }
    if (event.kind === "block.routed") {
      existing.status = "routed";
      existing.routeKind = event.route;
      existing.waitingOn = waitingOnOf(event.route);
      existing.owner = event.targetRoleId ?? (event.route === "engine-auto-fix" ? "engine"
        : event.route === "judge-decision" ? "judge"
          : event.route === "customer-decision" ? "customer" : existing.owner);
      existing.routeCount += 1;
      existing.attempt = Math.max(existing.attempt, event.attempt);
      // R1 收尾修补：保留每次 routed 的链接（修复任务/卡/属主）与 route/reason/attempt。
      const routing: BlockRoutingRecord = {
        route: event.route,
        reason: event.reason,
        attempt: event.attempt,
        at: event.at,
        idempotencyKey: event.idempotencyKey,
        ...(event.targetRoleId !== undefined ? { targetRoleId: event.targetRoleId } : {}),
        ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
        ...(event.cardRequestId !== undefined ? { cardRequestId: event.cardRequestId } : {}),
      };
      existing.routings.push(routing);
      existing.routeReason = routing.reason;
      existing.routeAttempt = routing.attempt;
      existing.routeTargetRoleId = routing.targetRoleId;
      existing.routeTaskId = routing.taskId;
      existing.cardRequestId = routing.cardRequestId;
      existing.updatedAt = event.at;
      existing.lastEventId = event.idempotencyKey;
      continue;
    }
    if (event.kind === "block.escalated") {
      // escalated 不是终态：记录升级事实，等待新 routed（resolved 前必须 routed）。
      existing.status = "escalated";
      existing.waitingOn = waitingOnOfEscalation(event.to);
      existing.escalationCount += 1;
      existing.attempt = Math.max(existing.attempt, event.attempt);
      existing.updatedAt = event.at;
      existing.lastEventId = event.idempotencyKey;
      continue;
    }
    // block.resolved
    if (existing.status === "raised") {
      errors.push(`${event.blockId}: resolved 前缺少 routed（raised→routed→resolved；escalated 也不是终态）`);
      continue;
    }
    if (existing.status === "escalated") {
      errors.push(`${event.blockId}: escalated 后必须先 routed 再 resolved（升级不是终态）`);
      continue;
    }
    if (event.resolution === "decided" && event.by !== "judge" && event.by !== "customer") {
      errors.push(`${event.blockId}: decided 只能由 judge/customer 裁决（收到 by=${event.by}）`);
      continue;
    }
    if (event.by === "judge" && event.decisionId === undefined) {
      errors.push(`${event.blockId}: judge 决议缺 decisionId（provenance 不诚实）`);
      continue;
    }
    existing.status = "resolved";
    existing.resolution = event.resolution;
    existing.resolvedBy = event.by;
    if (event.decisionId !== undefined) existing.decisionId = event.decisionId;
    if (event.reEntry !== undefined) existing.reEntry = event.reEntry;
    existing.updatedAt = event.at;
    existing.lastEventId = event.idempotencyKey;
  }
  return { records, order, errors };
}

export interface BlockListFilter {
  readonly blockId?: string;
  readonly workflowId?: string;
  readonly flowId?: string;
}

/** 未 resolved 的 block（raised/routed/escalated；escalated 也属于 open，等待新 routed）。 */
export function listOpenBlocks(
  events: readonly BlockLedgerEvent[],
  filter: BlockListFilter = {},
): readonly BlockLifecycle[] {
  const replay = replayBlockLifecycles(events);
  const open: BlockLifecycle[] = [];
  for (const blockId of replay.order) {
    const record = replay.records.get(blockId);
    if (record === undefined || record.status === "resolved") continue;
    if (filter.blockId !== undefined && record.blockId !== filter.blockId) continue;
    if (filter.workflowId !== undefined && record.workflowId !== filter.workflowId) continue;
    if (filter.flowId !== undefined && record.flowId !== filter.flowId) continue;
    open.push(record);
  }
  return open;
}

/** project_state 摘要（只读；age 需要调用方注入时钟）。 */
export interface BlockOpenSummary {
  blockId: string;
  class: BlockClass;
  classCode: BlockClassCode;
  status: "raised" | "routed" | "escalated";
  owner?: string;
  waitingOn?: BlockOwnerKind;
  ageMs?: number;
  evidenceRefs: string[];
  workflowId?: string;
  flowId?: string;
  stage?: string;
  taskId?: string;
  summary: string;
  /** 最近一次路由（R1 收尾修补）：route/reason/attempt + 修复任务/卡链接。 */
  routeKind?: BlockRouteKind;
  routeReason?: string;
  routeAttempt?: number;
  routeTargetRoleId?: string;
  routeTaskId?: string;
  cardRequestId?: string;
  routeCount: number;
  /** 全部路由记录（旧→新；R1 收尾修补；旧记录无 routed 事件时为空数组）。 */
  routings: BlockRoutingRecord[];
}

export function summarizeOpenBlocks(
  events: readonly BlockLedgerEvent[],
  options: BlockListFilter & { readonly nowMs?: number; readonly limit?: number } = {},
): readonly BlockOpenSummary[] {
  const open = listOpenBlocks(events, options);
  const limit = typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : undefined;
  const summaries: BlockOpenSummary[] = [];
  for (const record of open) {
    const raisedMs = Date.parse(record.raisedAt);
    const ageMs = options.nowMs !== undefined && Number.isFinite(raisedMs) && options.nowMs >= raisedMs
      ? options.nowMs - raisedMs
      : undefined;
    summaries.push({
      blockId: record.blockId,
      class: record.class,
      classCode: record.classCode,
      status: record.status === "resolved" ? "routed" : record.status,
      ...(record.owner !== undefined ? { owner: record.owner } : {}),
      ...(record.waitingOn !== undefined ? { waitingOn: record.waitingOn } : {}),
      ...(ageMs !== undefined ? { ageMs } : {}),
      evidenceRefs: [...record.evidenceRefs],
      ...(record.workflowId !== undefined ? { workflowId: record.workflowId } : {}),
      ...(record.flowId !== undefined ? { flowId: record.flowId } : {}),
      ...(record.stage !== undefined ? { stage: record.stage } : {}),
      ...(record.taskId !== undefined ? { taskId: record.taskId } : {}),
      summary: record.summary,
      ...(record.routeKind !== undefined ? { routeKind: record.routeKind } : {}),
      ...(record.routeReason !== undefined ? { routeReason: record.routeReason } : {}),
      ...(record.routeAttempt !== undefined ? { routeAttempt: record.routeAttempt } : {}),
      ...(record.routeTargetRoleId !== undefined ? { routeTargetRoleId: record.routeTargetRoleId } : {}),
      ...(record.routeTaskId !== undefined ? { routeTaskId: record.routeTaskId } : {}),
      ...(record.cardRequestId !== undefined ? { cardRequestId: record.cardRequestId } : {}),
      routeCount: record.routeCount,
      routings: record.routings.map((routing) => ({ ...routing })),
    });
    if (limit !== undefined && summaries.length >= limit) break;
  }
  return summaries;
}

// —————————————— 写入 API（raise / route / escalate / resolve） ——————————————

export type BlockLedgerFailure = { ok: false; code: string; message: string };

function ledgerFailure(code: string, message: string): BlockLedgerFailure {
  return { ok: false, code, message };
}

function corruptFailure(badLines: number): BlockLedgerFailure {
  return ledgerFailure(
    "block-ledger-corrupt",
    `blocks.jsonl 存在 ${badLines} 条坏行；fail-closed：不猜、不追加（请先按审计修复账本）。`,
  );
}

function evidenceRefsOf(fact: BlockFact): string[] {
  const paths = fact.evidencePaths ?? [];
  const hashes = fact.evidenceHashes ?? [];
  return paths.map((file, index) => {
    const hash = hashes[index];
    return hash !== undefined ? `${file}#sha256=${hash}` : file;
  });
}

function fingerprintCount(events: readonly BlockLedgerEvent[], fingerprint: string): number {
  return events.filter((event) => event.kind === "block.raised" && event.fingerprint === fingerprint).length;
}

export interface RaiseBlockInput {
  projectRoot: string;
  /** 宿主核验事实（`priorOccurrences` 缺省由账本按同指纹计数补全）。 */
  fact: BlockFact;
  policy?: BlockResolverPolicy;
  summary?: string;
  evidenceRefs?: readonly string[];
  now?: () => Date;
}

export interface RaiseBlockReceipt {
  blockId: string;
  class: BlockClass;
  classCode: BlockClassCode;
  fingerprint: string;
  priorOccurrences: number;
  /** 本事实是否触发重复升级（同指纹 ≥ 阈值；仅 escalated 路由）。 */
  repeatedFingerprint: boolean;
  replay: boolean;
  event: BlockRaisedEvent;
}

export type RaiseBlockResult = ({ ok: true } & RaiseBlockReceipt) | BlockLedgerFailure;

/**
 * 创建 block（分类 + 指纹/blockId + append；幂等）：
 * - 同 blockId 已 raised ⇒ replay 返回原事件（不重复 raised）；
 * - `priorOccurrences` 缺省按同指纹已 raised 次数补全；≥ 阈值 ⇒ class=repeat-rejection，
 *   路由必须 escalated（`routeBlock` fail-closed 强制）。
 */
export async function raiseBlock(input: RaiseBlockInput): Promise<RaiseBlockResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readBlockLedger(input.projectRoot);
  if (ledger.badLines > 0) return corruptFailure(ledger.badLines);
  const prior = fingerprintCount(ledger.events, computeBlockFingerprint(input.fact));
  const fact: BlockFact = input.fact.priorOccurrences === undefined
    ? { ...input.fact, priorOccurrences: prior }
    : input.fact;
  const classification = classifyBlock(fact, input.policy ?? {});
  const blockId = computeBlockId(fact);
  const fingerprint = computeBlockFingerprint(fact);
  const idempotencyKey = blockIdempotencyKey(blockId, "block.raised", 1);
  const existing = ledger.events.find((event) => event.idempotencyKey === idempotencyKey);
  if (existing !== undefined && existing.kind === "block.raised") {
    return {
      ok: true,
      blockId,
      class: existing.class,
      classCode: existing.classCode,
      fingerprint: existing.fingerprint,
      priorOccurrences: existing.priorOccurrences ?? prior,
      // replay 是同一发生（幂等重试），不是第 2 次发生；是否升级以已记账事实为准。
      repeatedFingerprint: existing.class === "repeat-rejection",
      replay: true,
      event: existing,
    };
  }
  const event: BlockRaisedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: BLOCK_LEDGER_SCHEMA,
    kind: "block.raised",
    blockId,
    idempotencyKey,
    class: classification.class,
    classCode: classification.classCode,
    ...(fact.code !== undefined ? { code: fact.code } : {}),
    ...(fact.detailCode !== undefined ? { detailCode: fact.detailCode } : {}),
    ...(fact.source !== undefined ? { source: fact.source } : {}),
    ...(fact.workflowId !== undefined ? { workflowId: fact.workflowId } : {}),
    ...(fact.flowId !== undefined ? { flowId: fact.flowId } : {}),
    ...(fact.stage !== undefined ? { stage: fact.stage } : {}),
    ...(fact.taskId !== undefined ? { taskId: fact.taskId } : {}),
    ...(fact.requestId !== undefined ? { requestId: fact.requestId } : {}),
    fingerprint,
    summary: input.summary ?? fact.summary ?? `${classification.classCode} ${fact.code ?? fact.kind}`,
    evidenceRefs: input.evidenceRefs !== undefined ? [...input.evidenceRefs] : evidenceRefsOf(fact),
    protocol: fact.protocol,
    priorOccurrences: classification.priorOccurrences,
  };
  const appended = await appendBlockEvent(input.projectRoot, event);
  if (!appended.ok) {
    return ledgerFailure(appended.code ?? "block-ledger-write-failed", `block.raised 写入失败：${appended.message}`);
  }
  const stored = appended.event.kind === "block.raised" ? appended.event : event;
  return {
    ok: true,
    blockId,
    class: stored.class,
    classCode: stored.classCode,
    fingerprint: stored.fingerprint,
    priorOccurrences: stored.priorOccurrences ?? prior,
    repeatedFingerprint: classification.repeat,
    replay: appended.replay,
    event: stored,
  };
}

function normalizeThreshold(policy: BlockResolverPolicy | undefined): number {
  const value = policy?.repeatThreshold;
  return typeof value === "number" && Number.isFinite(value) && value >= 2
    ? Math.floor(value)
    : BLOCK_REPEAT_THRESHOLD;
}

export interface RouteBlockInput {
  projectRoot: string;
  blockId: string;
  route: Exclude<BlockRouteKind, "escalated">;
  reason: string;
  targetRoleId?: string;
  taskId?: string;
  cardRequestId?: string;
  /** 缺省 = 该 block 已 routed 次数 + 1。 */
  attempt?: number;
  policy?: BlockResolverPolicy;
  now?: () => Date;
}

export type RouteBlockResult = ({ ok: true; replay: boolean; event: BlockRoutedEvent }) | BlockLedgerFailure;

/**
 * 路由（`raised`/`escalated` 后追加；resolved 后拒绝）：
 * - 同指纹 ≥ 阈值且仍在 `raised` ⇒ **只允许 escalated**（`block-repeat-escalation-required`）；
 * - 幂等键 `block:<blockId>:block.routed:<attempt>`（同键 replay）。
 */
export async function routeBlock(input: RouteBlockInput): Promise<RouteBlockResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readBlockLedger(input.projectRoot);
  if (ledger.badLines > 0) return corruptFailure(ledger.badLines);
  const replayResult = replayBlockLifecycles(ledger.events);
  const lifecycle = replayResult.records.get(input.blockId);
  if (lifecycle === undefined) return ledgerFailure("block-not-found", `block ${input.blockId} 不存在（无 block.raised）。`);
  if (lifecycle.status === "resolved") {
    return ledgerFailure("block-already-resolved", `block ${input.blockId} 已 resolved（${lifecycle.resolution}）；不得再路由。`);
  }
  if (!isNonEmptyString(input.reason)) return ledgerFailure("block-route-invalid", "route.reason 不得为空。");
  if (!(BLOCK_ROUTE_KINDS as readonly string[]).includes(input.route)) {
    return ledgerFailure("block-route-invalid", `route 非法：${String(input.route)}（升级走 block.escalated）。`);
  }
  const threshold = normalizeThreshold(input.policy);
  const occurrences = fingerprintCount(ledger.events, lifecycle.fingerprint);
  if (lifecycle.status === "raised" && occurrences >= threshold) {
    return ledgerFailure(
      "block-repeat-escalation-required",
      `block ${input.blockId} 同指纹已 ${occurrences} 次（阈值 ${threshold}）；只允许 block.escalated（禁止原样循环）。`,
    );
  }
  const attempt = Number.isSafeInteger(input.attempt) && (input.attempt as number) >= 1
    ? (input.attempt as number)
    : lifecycle.routeCount + 1;
  const event: BlockRoutedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: BLOCK_LEDGER_SCHEMA,
    kind: "block.routed",
    blockId: input.blockId,
    idempotencyKey: blockIdempotencyKey(input.blockId, "block.routed", attempt),
    route: input.route,
    ...(input.targetRoleId !== undefined ? { targetRoleId: input.targetRoleId } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.cardRequestId !== undefined ? { cardRequestId: input.cardRequestId } : {}),
    attempt,
    reason: input.reason,
  };
  const appended = await appendBlockEvent(input.projectRoot, event);
  if (!appended.ok) {
    return ledgerFailure(appended.code ?? "block-ledger-write-failed", `block.routed 写入失败：${appended.message}`);
  }
  const stored = appended.event.kind === "block.routed" ? appended.event : event;
  return { ok: true, replay: appended.replay, event: stored };
}

export interface EscalateBlockInput {
  projectRoot: string;
  blockId: string;
  from: string;
  to: BlockEscalationTarget;
  reason: BlockEscalationReason;
  note?: string;
  /** 缺省 = 该 block 已 escalated 次数 + 1。 */
  attempt?: number;
  now?: () => Date;
}

export type EscalateBlockResult = ({ ok: true; replay: boolean; event: BlockEscalatedEvent }) | BlockLedgerFailure;

/** 升级（不是终态；后接新 routed）。from/to/reason 必填且枚举受限。 */
export async function escalateBlock(input: EscalateBlockInput): Promise<EscalateBlockResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readBlockLedger(input.projectRoot);
  if (ledger.badLines > 0) return corruptFailure(ledger.badLines);
  const replayResult = replayBlockLifecycles(ledger.events);
  const lifecycle = replayResult.records.get(input.blockId);
  if (lifecycle === undefined) return ledgerFailure("block-not-found", `block ${input.blockId} 不存在（无 block.raised）。`);
  if (lifecycle.status === "resolved") {
    return ledgerFailure("block-already-resolved", `block ${input.blockId} 已 resolved（${lifecycle.resolution}）；不得再升级。`);
  }
  if (!isNonEmptyString(input.from)) return ledgerFailure("block-escalate-invalid", "escalate.from 不得为空。");
  if (!(BLOCK_ESCALATION_TARGETS as readonly string[]).includes(input.to)) {
    return ledgerFailure("block-escalate-invalid", `escalate.to 非法：${String(input.to)}。`);
  }
  if (!(BLOCK_ESCALATION_REASONS as readonly string[]).includes(input.reason)) {
    return ledgerFailure("block-escalate-invalid", `escalate.reason 非法：${String(input.reason)}。`);
  }
  const attempt = Number.isSafeInteger(input.attempt) && (input.attempt as number) >= 1
    ? (input.attempt as number)
    : lifecycle.escalationCount + 1;
  const event: BlockEscalatedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: BLOCK_LEDGER_SCHEMA,
    kind: "block.escalated",
    blockId: input.blockId,
    idempotencyKey: blockIdempotencyKey(input.blockId, "block.escalated", attempt),
    from: input.from,
    to: input.to,
    reason: input.reason,
    attempt,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  const appended = await appendBlockEvent(input.projectRoot, event);
  if (!appended.ok) {
    return ledgerFailure(appended.code ?? "block-ledger-write-failed", `block.escalated 写入失败：${appended.message}`);
  }
  const stored = appended.event.kind === "block.escalated" ? appended.event : event;
  return { ok: true, replay: appended.replay, event: stored };
}

export interface ResolveBlockInput {
  projectRoot: string;
  blockId: string;
  /** 终态只允许 fixed / decided（stopped 非法）。 */
  resolution: "fixed" | "decided";
  /** `engine` / `<roleId>`（仅 fixed）/ `judge` / `customer`（decided）。 */
  by: string;
  decisionId?: string;
  reEntry?: string;
  note: string;
  now?: () => Date;
}

export type ResolveBlockResult = ({ ok: true; replay: boolean; event: BlockResolvedEvent }) | BlockLedgerFailure;

/**
 * 结算（终态 fixed/decided）：
 * - 必须在 `routed` 之后（escalated 不是终态：先 routed）；
 * - `decided` 只能由 judge/customer 结算，且必须有 `decisionId`（provenance 诚实）；
 * - 终止本次流程 = 客户选择 `block-terminate-flow` 后记 `decided` + note（不是 stop 终态）。
 */
export async function resolveBlock(input: ResolveBlockInput): Promise<ResolveBlockResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readBlockLedger(input.projectRoot);
  if (ledger.badLines > 0) return corruptFailure(ledger.badLines);
  const replayResult = replayBlockLifecycles(ledger.events);
  const lifecycle = replayResult.records.get(input.blockId);
  if (lifecycle === undefined) return ledgerFailure("block-not-found", `block ${input.blockId} 不存在（无 block.raised）。`);
  if (input.resolution !== "fixed" && input.resolution !== "decided") {
    return ledgerFailure("block-resolution-invalid", `resolution 只允许 fixed/decided（收到 ${String(input.resolution)}）。`);
  }
  if (!isNonEmptyString(input.by)) return ledgerFailure("block-resolution-invalid", "resolved.by 不得为空。");
  if (!isNonEmptyString(input.note)) return ledgerFailure("block-resolution-invalid", "resolved.note 不得为空。");
  if (lifecycle.status === "resolved") {
    return ledgerFailure("block-already-resolved", `block ${input.blockId} 已 resolved（${lifecycle.resolution}）。`);
  }
  if (lifecycle.status === "raised") {
    return ledgerFailure("block-not-routed", `block ${input.blockId} 尚未 routed；raised→routed→resolved（不得假性 fixed）。`);
  }
  if (lifecycle.status === "escalated") {
    return ledgerFailure(
      "block-escalated-unrouted",
      `block ${input.blockId} 处于 escalated（升级不是终态）；必须再次 routed 后再 resolved。`,
    );
  }
  if (input.resolution === "decided" && input.by !== "judge" && input.by !== "customer") {
    return ledgerFailure(
      "block-resolution-invalid",
      `decided 只能由 judge/customer 裁决（收到 by=${input.by}）；角色/引擎不构成裁决。`,
    );
  }
  if (input.resolution === "decided" && !isNonEmptyString(input.decisionId)) {
    return ledgerFailure("block-resolution-invalid", "decided 必须携带 decisionId（provenance）。");
  }
  const event: BlockResolvedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: BLOCK_LEDGER_SCHEMA,
    kind: "block.resolved",
    blockId: input.blockId,
    idempotencyKey: blockIdempotencyKey(input.blockId, "block.resolved", 1),
    resolution: input.resolution,
    by: input.by,
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.reEntry !== undefined ? { reEntry: input.reEntry } : {}),
    note: input.note,
  };
  const appended = await appendBlockEvent(input.projectRoot, event);
  if (!appended.ok) {
    return ledgerFailure(appended.code ?? "block-ledger-write-failed", `block.resolved 写入失败：${appended.message}`);
  }
  const stored = appended.event.kind === "block.resolved" ? appended.event : event;
  return { ok: true, replay: appended.replay, event: stored };
}

// —————————————— 读取便利：project_state open blocks ——————————————

export interface BlockOpenProjection {
  summaries: readonly BlockOpenSummary[];
  badLines: number;
  errors: readonly string[];
  ignoredLines: number;
}

/** 读 `.ans/state/blocks.jsonl` 并派生 open blocks（纯读；坏行如实计入，不猜）。 */
export async function readOpenBlockProjection(
  projectRoot: string,
  options: BlockListFilter & { readonly now?: Date; readonly limit?: number } = {},
): Promise<BlockOpenProjection> {
  const ledger = await readBlockLedger(projectRoot);
  const replay = replayBlockLifecycles(ledger.events);
  const nowMs = options.now !== undefined ? options.now.getTime() : undefined;
  return {
    summaries: summarizeOpenBlocks(ledger.events, {
      ...options,
      ...(nowMs !== undefined ? { nowMs } : {}),
    }),
    badLines: ledger.badLines,
    errors: ledger.errors.map((error) => `${error.file}:${error.line}: ${error.message}`),
    ignoredLines: ledger.ignoredLines,
  };
}
