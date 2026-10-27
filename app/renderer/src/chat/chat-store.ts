/**
 * 聊天流投影 store（Phase 3A）。
 *
 * 唯一权威仍是主进程：本 store 只保存 listing、会话历史/事件投影、角色状态快照与
 * 视图侧的 pane 状态；不做边界判定、不持久化治理事实、不绕过 IPC。
 *
 * 行模型实例放在模块级 Map（大数组不进入 zustand 深拷贝），`paneVersions` 作为
 * 变更信号驱动 React 重渲染；`rowModelDebug` 直接读模型。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import {
  classifyLiveDuplicate,
  eventKey,
  planReplay,
  rowSignature,
} from "@/chat/replay";
import {
  dedupeHistoryDescriptors,
  dedupeHistoryRows,
  describeEvent,
  envelopeMatches,
  historyRenderParts,
  historyRowToDescriptor,
  mergeClientProjectionData,
  normalizeEnvelopes,
  type NewRowDescriptor,
} from "@/chat/events";
import {
  liveRowIdentity,
  planHistoryMerge,
  type LiveRowIdentity,
} from "@/chat/history-merge";
import {
  governanceJudgeResultView,
  shellJudgeResultView,
} from "@/chat/judge";
import {
  mergeReasoningRowData,
  reasoningInsertIndex,
  reasoningPiecesFromData,
} from "@/chat/reasoning";
import {
  CHAT_ROW_GAP,
  RowModel,
} from "@/chat/row-model";
import { AnchorTable } from "@/chat/anchor-view";
import {
  clearReadingAnchors,
  clipReadingText,
  isStuckToBottom,
  readingAnchorFromRows,
  rememberReadingAnchor,
  type ReadingRowSample,
} from "@/chat/reading-anchor";
import {
  operatorCardMeta,
  operatorFinalNote,
  operatorMirrorRoleId,
  operatorQueued,
  operatorRetryNote,
  operatorSourceRoleId,
  operatorSurfaces,
  operatorExpiredNote,
  queuedCountForView,
  queuedWithoutPresented,
  OPERATOR_SUBMITTING_NOTE,
} from "@/chat/operator-view";
import {
  asReportRecord,
  historyProjectionText,
  reportIdentity,
  reportSourceRecord,
  reportVersionSupported,
  sortHistoryReports,
} from "@/chat/report-view";
import { governanceQueueAggregateText } from "@/chat/governance-view";
import type {
  ActivityItem,
  ChatRow,
  Listing,
  PaneMeta,
  RoleMeta,
  RoleView,
  SessionEnvelope,
} from "@/chat/types";
import { useUiStore, type RuntimeId } from "@/stores/ui-store";
import { useReportStore } from "@/stores/report-store";
import { useLocaleStore, translate, type Locale } from "@/i18n";

/** 当前界面语言（i18n B2）：事件投影/状态文案按事件到达时的 locale 渲染。 */
function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

type Dict<T> = Record<string, T>;

export interface HintSource {
  kind: "queue" | "send";
  roleId: string;
  runtime: string;
  projectRoot: string | null;
  clientMessageId?: string;
  turnId?: string;
}

const models = new Map<string, RowModel<ChatRow>>();
const historySignatures = new Map<string, string[]>();
const historyKeyCounts = new Map<string, Map<string, number>>();
const liveKeyCounts = new Map<string, Map<string, number>>();
const pendingHistories: Array<Record<string, unknown>> = [];
const localMessageIds = new Set<string>();
const ackedClientIds = new Set<string>();
const pendingSingles: SessionEnvelope[] = [];
let singleFlushTimer: ReturnType<typeof setTimeout> | null = null;

// —————— 工具组折叠状态（对齐旧 renderer.js：分组依据 = turnId + 连续行）——————
// 组指针只在连续工具行之间保留；助手/系统/卡片/无法关联的未放行行会切断它。
const activityGroupByRole = new Map<string, ChatRow | null>();
// 手动开合按稳定组 id 保存（虚拟行卸载/整段回放重建后仍保持）。
const activityManualOpen = new Map<string, Map<string, boolean>>();
// 组 id 的序号（同身份再次成组时区分；整段回放重建时按同一序列复位）。
const activityGroupCounts = new Map<string, Map<string, number>>();
// 已 settle 的轮：该轮工具组默认折叠，且后续追加不再自动展开。
const settledTurnsByRole = new Map<string, Set<string>>();
// 判断结果行幂等键（同一 id 重复到达只呈现一次；换项目清空——仅界面会话内幂等）。
const judgeResultIds = new Set<string>();
// 回放锚点表（每角色一份；history 重放时登记，operator 卡据此落回发生位置）。
const anchorsByRole = new Map<string, AnchorTable>();
// 已收到结构化报告/交付的轮次（turnId → 是否接收方），用于 task-request/reply-original 折叠。
const reportedTurnsByRole = new Map<string, Map<string, { receiver: boolean }>>();
// 历史报告身份（去重：同 reportId+来源只呈现一次）；full 重建时重置。
const historyReportIds = new Map<string, Set<string>>();
// 折叠 details 的手动开合（跨 full 重建保持；键 = 轮次+种类+行文本）。
const foldOpenByRole = new Map<string, Set<string>>();
// 本次 open 返回 fresh 且 resumed:false 的角色：首次历史回放后追加「可读历史保留，模型未恢复」。
const pendingReadableHistory = new Set<string>();
let rowSeq = 0;

function flushPendingSingles(): void {
  if (singleFlushTimer !== null) {
    clearTimeout(singleFlushTimer);
    singleFlushTimer = null;
  }
  if (pendingSingles.length === 0) return;
  const batch = pendingSingles.splice(0, pendingSingles.length);
  // 数组入口立即处理（不再次入队）。
  useChatStore.getState().appendEnvelopes(batch);
}

function modelFor(roleId: string): RowModel<ChatRow> {
  let model = models.get(roleId);
  if (!model) {
    model = new RowModel<ChatRow>(CHAT_ROW_GAP);
    models.set(roleId, model);
  }
  return model;
}

/**
 * full replay 前记录阅读锚点（PM §十七）：只在当前查看角色、已挂载 pane、
 * 且用户不在贴底时记录；贴底继续走原有尾部跟随。DOM 只读，不改行模型。
 */
function captureReadingAnchor(roleId: string): void {
  if (useUiStore.getState().selectedRoleId !== roleId) return;
  const chat = document.getElementById("chat");
  if (!chat) return;
  const pane = Array.from(
    chat.querySelectorAll<HTMLElement>(".chat-pane"),
  ).find((element) => element.dataset.roleId === roleId);
  if (!pane) return;
  const chatRect = chat.getBoundingClientRect();
  if (isStuckToBottom(chat.scrollTop, chat.scrollHeight, chat.clientHeight)) return;
  const rows: ReadingRowSample[] = [];
  pane.querySelectorAll<HTMLElement>(".msg, .tool-records, .sys-denied").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= chatRect.top || rect.top >= chatRect.bottom) return;
    const text = clipReadingText(element.textContent);
    if (text === "") return;
    rows.push({ text, top: rect.top });
  });
  rememberReadingAnchor(roleId, readingAnchorFromRows(rows, chatRect.top, false));
}

function estimateHeight(kind: ChatRow["kind"]): number {  switch (kind) {
    case "user":
      return 52 + CHAT_ROW_GAP;
    case "assistant":
      return 60 + CHAT_ROW_GAP;
    case "activities":
      return 38 + CHAT_ROW_GAP;
    case "injected":
      return 120 + CHAT_ROW_GAP;
    case "handback":
      return 190 + CHAT_ROW_GAP;
    case "delivery":
      return 170 + CHAT_ROW_GAP;
    case "operator":
      return 160 + CHAT_ROW_GAP;
    case "queue-aggregate":
      return 34 + CHAT_ROW_GAP;
    case "tool-lifecycle":
      return 46 + CHAT_ROW_GAP;
    case "judge-result":
    case "governance-judge-result":
      return 84 + CHAT_ROW_GAP;
    case "system":
    case "turn-terminal":
    case "reasoning":
      return 34 + CHAT_ROW_GAP;
    default:
      return 40 + CHAT_ROW_GAP;
  }
}

function makeRow(descriptor: NewRowDescriptor): ChatRow {
  return {
    id: "row-" + (++rowSeq),
    kind: descriptor.kind,
    data: descriptor.data,
    height: estimateHeight(descriptor.kind),
    turnId: descriptor.turnId,
    callId: descriptor.callId,
    requestId: descriptor.requestId,
    replay: descriptor.replay === true,
    ...(descriptor.anchorKey ? { anchorKey: descriptor.anchorKey } : {}),
    ...(descriptor.anchor ? { anchor: descriptor.anchor } : {}),
  };
}

function asDict(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function countSignatures(signatures: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const signature of signatures) {
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  return counts;
}

/**
 * 历史行的实时去重键（与 `eventKey` 同形）：turnId + 事件 kind + source + 文本。
 * 实时回显与历史同键 ⇒ 只保留一条（旧 canonicalKey 计数同向）。
 */
function historyEventKey(row: Record<string, unknown>): string | null {
  const turnId = typeof row.turnId === "string" ? row.turnId : "";
  if (!turnId) return null;
  const kind =
    row.kind === "assistant" || row.kind === "user"
      ? "message"
      : typeof row.eventKind === "string" && row.eventKind !== ""
        ? row.eventKind
        : "";
  if (!kind) return null;
  const source = row.kind === "user" ? "prompt-input" : "";
  const text = typeof row.text === "string" ? row.text : "";
  return JSON.stringify([turnId, kind, source, text]);
}

function countHistoryEventKeys(rows: ReadonlyArray<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = historyEventKey(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * 增量回放时，历史 user 呈现分片优先认领尚未绑定 turnId 的本地乐观行（同文本、先到先得）。
 * 这样「先键入发送、后到历史」不会再叠一条相同用户气泡；turnId 回填后 ACK 仍按文本幂等。
 * 以**呈现分片文本**为参数：system-notice 历史行的用户正文在拆分后的 user 分片里。
 */
function claimOptimisticUserText(
  model: RowModel<ChatRow>,
  turnId: string,
  text: string,
): boolean {
  if (!turnId || !text) return false;
  for (const candidate of model.rows) {
    if (candidate.kind !== "user" || candidate.turnId) continue;
    if (asString(asDict(candidate.data).text) !== text) continue;
    candidate.turnId = turnId;
    candidate.data = { ...asDict(candidate.data) };
    return true;
  }
  return false;
}

function rowText(row: ChatRow): string {  const data = asDict(row.data);
  if (row.kind === "user" || row.kind === "assistant") return asString(data.text);
  if (row.kind === "system" || row.kind === "turn-terminal") return asString(data.text);
  if (row.kind === "denied") return asString(data.text);
  if (row.kind === "handback") {
    const report = asDict(data.report);
    const summary = asDict(report.summary);
    return asString(summary.text);
  }
  if (row.kind === "delivery") return asString(data.text);
  if (row.kind === "activities") {
    return asArray<Record<string, unknown>>(data.items)
      .map((item) => asString(item.toolName) + " " + asString(item.target) + " " + asString(item.statusText))
      .join("\n");
  }
  if (row.kind === "injected") {
    return asString(data.label) + "\n" + asString(data.body);
  }
  if (row.kind === "operator") {
    const payload = asDict(data.payload);
    const request = asDict(payload.request);
    return asString(request.title) + "\n" + asString(request.detail);
  }
  return "";
}

interface ChatStore {
  projectRoot: string | null;
  primaryRoleId: string | null;
  hasRoles: boolean;
  roles: RoleView[];
  warnings: string[];
  governanceModel: "single" | "trio" | null;
  governanceRecord: Record<string, unknown> | null;
  sessionOpenRoleId: string | null;
  roleBusy: Dict<boolean>;
  roleMeta: Dict<RoleMeta>;
  queueByRole: Dict<Array<Record<string, unknown>>>;
  /** 主进程 role-state 快照的「正在跑的那条投递」（队列视图的「进行中」位）。 */
  runningByRole: Dict<Record<string, unknown> | null>;
  paneMeta: Dict<PaneMeta>;
  paneVersions: Dict<number>;
  scrollNonce: number;
  pendingOperator: Dict<Record<string, unknown>>;
  queuedOperator: Dict<Record<string, unknown>>;
  hint: string;
  /** 当前提示的来源（旧 currentHintSource 同义）：队列空快照只清同角色/同视图的排队提示。 */
  hintSource: HintSource | null;
  setHint: (hint: string, source?: HintSource | null) => void;
  appendLocalUser: (roleId: string, text: string, clientMessageId?: string) => void;
  loadProject: (projectRoot: string, fresh?: boolean) => Promise<Listing | null>;
  applyListing: (listing: Listing, fresh: boolean) => void;
  refreshProject: () => Promise<void>;
  refreshLiveRoles: () => Promise<void>;
  selectRole: (roleId: string) => Promise<void>;
  /** 发送失败/异常后本地会话句柄失效：下次发送前必须重新 openSession（fail-closed）。 */
  invalidateSession: (roleId: string) => void;
  selectRuntime: (runtime: RuntimeId) => void;
  appendEnvelopes: (input: unknown) => void;
  setActivityGroupOpen: (
    roleId: string,
    rowId: string,
    open: boolean,
    manual?: boolean,
  ) => void;
  setRowDetailOpen: (
    roleId: string,
    rowId: string,
    key: string,
    open: boolean,
  ) => void;
  /** 行内异步内容（view_image 缩略图）加载/失败后通知 pane 重新测量行高；只 bump 版本。 */
  touchPane: (roleId: string) => void;
  setOperatorSelected: (
    roleId: string,
    rowId: string,
    selected: string[],
  ) => void;
  applyHistory: (payload: unknown) => void;
  applyRoleState: (payload: unknown) => void;
  appendSystemRow: (roleId: string, cls: string, text: string) => void;
  setRoleError: (roleId: string, error: boolean) => void;
  /** 该 clientMessageId 是否已由真实事件 ACK（迟到的入队回包不得复活提示）。 */
  hasClientAck: (clientMessageId: string) => boolean;
  appendShellJudgeResult: (payload: unknown) => void;
  appendGovernanceJudgeResult: (payload: unknown) => void;
  appendOperatorRequest: (payload: unknown) => void;
  respondOperator: (id: string, decision: unknown) => Promise<void>;
  expireOperator: (id: string, reason?: string) => void;
  queueOperator: (payload: unknown) => void;
  rowModelDebug: (roleId: string) => unknown;
  paneDebug: (roleId: string) => unknown;
  resetPanes: () => void;
}

function bumpVersions(
  current: Dict<number>,
  roleIds: Iterable<string>,
): Dict<number> {
  const next = { ...current };
  for (const roleId of roleIds) {
    next[roleId] = (next[roleId] || 0) + 1;
  }
  return next;
}

function ensureMeta(meta: Dict<RoleMeta>, roleId: string): RoleMeta {
  if (!meta[roleId]) {
    meta[roleId] = {
      error: false,
      hadSession: false,
      restored: false,
      contextText: translate(currentLocale(), "ui.chatHeader.noSession"),
    };
  }
  return meta[roleId];
}

// —————— Phase 4B：锚点 / 折叠 / 报告 / 排队聚合 ——————

function anchorsFor(roleId: string): AnchorTable {
  let table = anchorsByRole.get(roleId);
  if (!table) {
    table = new AnchorTable();
    anchorsByRole.set(roleId, table);
  }
  return table;
}

/** 历史行登记锚点（按行表最终索引）。 */
function noteRowAnchor(roleId: string, row: ChatRow, index: number): void {
  if (!row.anchorKey) return;
  anchorsFor(roleId).note(index, row.anchorKey, row.anchor);
}

function reportedTurnsFor(roleId: string): Map<string, { receiver: boolean }> {
  let map = reportedTurnsByRole.get(roleId);
  if (!map) {
    map = new Map();
    reportedTurnsByRole.set(roleId, map);
  }
  return map;
}

export function markReportedTurn(roleId: string, turnId: string, receiver: boolean): void {
  if (!roleId || !turnId) return;
  const map = reportedTurnsFor(roleId);
  const existing = map.get(turnId);
  map.set(turnId, { receiver: receiver || existing?.receiver === true });
}

function foldOpenSet(roleId: string): Set<string> {
  let set = foldOpenByRole.get(roleId);
  if (!set) {
    set = new Set();
    foldOpenByRole.set(roleId, set);
  }
  return set;
}

function foldIdentity(row: ChatRow): string {
  const data = asDict(row.data);
  return JSON.stringify([row.kind, row.turnId || "", asString(data.text).slice(0, 400)]);
}

/** 折叠开合状态的设置（ChatRow 的 toggle 回调走这里；跨 full 重建保持）。 */
export function setFoldOpen(roleId: string, row: ChatRow, open: boolean): void {
  const id = foldIdentity(row);
  const set = foldOpenSet(roleId);
  if (open) set.add(id);
  else set.delete(id);
  row.data = { ...asDict(row.data), foldOpen: open };
}

/**
 * 已报告轮次的折叠标记：assistant 行在 settled（或回放行）后折成 reply-original；
 * user 行（非注入）折成 task-request。绝不折叠报告/卡/工具行。
 */
function applyFoldToRow(row: ChatRow, roleId: string): boolean {
  const reported = reportedTurnsByRole.get(roleId);
  if (!reported || !row.turnId) return false;
  const info = reported.get(row.turnId);
  if (!info) return false;
  const data = asDict(row.data);
  if (data.fold === "task-request" || data.fold === "reply-original") return false;
  if (row.kind === "user") {
    row.data = {
      ...data,
      fold: "task-request",
      foldLabel: translate(currentLocale(), "ui.reportView.taskRequestLabel"),
      foldOpen: foldOpenSet(roleId).has(foldIdentity(row)),
    };
    return true;
  }
  if (row.kind === "assistant") {
    const settled = row.replay === true || settledTurnsByRole.get(roleId)?.has(row.turnId) === true;
    if (!settled) return false;
    row.data = {
      ...data,
      fold: "reply-original",
      foldLabel: info.receiver
        ? translate(currentLocale(), "ui.reportView.deliveryReplyLabel")
        : translate(currentLocale(), "ui.reportView.replyOriginalLabel"),
      foldOpen: foldOpenSet(roleId).has(foldIdentity(row)),
    };
    return true;
  }
  return false;
}

/** 对整表重算折叠（新行到达/落定/回放后调用）。返回是否有变化。 */
function foldRowsForRole(roleId: string): boolean {
  const model = models.get(roleId);
  if (!model) return false;
  let changed = false;
  for (const row of model.rows) {
    if (applyFoldToRow(row, roleId)) changed = true;
  }
  return changed;
}

/** 结构化报告卡的描述符（live 事件 / 历史快照共用）。 */
function reportDescriptor(
  report: unknown,
  persistence: unknown,
  scope: { projectRoot: string | null; roleId: string; runtime: string },
): NewRowDescriptor {
  const source = reportSourceRecord(report);
  return {
    kind: "handback",
    data: { report, persistence, scope },
    turnId: asString(source.turnId) || undefined,
  };
}

/**
 * 追加历史报告快照：排序按时间（未知时间保线上序）；同身份只呈现一次。
 * 返回新增行数。
 */
function appendHistoryReports(
  roleId: string,
  reports: ReadonlyArray<unknown>,
  scope: { projectRoot: string | null; roleId: string; runtime: string },
  fresh: boolean,
): number {
  if (fresh) historyReportIds.set(roleId, new Set());
  let seen = historyReportIds.get(roleId);
  if (!seen) {
    seen = new Set();
    historyReportIds.set(roleId, seen);
  }
  const model = modelFor(roleId);
  const ordered = sortHistoryReports(reports);
  let added = 0;
  for (const report of ordered) {
    if (!reportVersionSupported(report)) continue;
    const source = reportSourceRecord(report);
    if (asString(source.roleId) !== roleId) continue;
    if (
      typeof source.runtime === "string" &&
      source.runtime !== "" &&
      source.runtime !== scope.runtime
    ) {
      continue;
    }
    const identity = reportIdentity(report, added);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const row = makeRow(reportDescriptor(report, undefined, scope));
    row.replay = true;
    model.append(row);
    noteRowAnchor(roleId, row, model.rows.length - 1);
    added += 1;
    const turnId = asString(source.turnId);
    if (turnId) markReportedTurn(roleId, turnId, false);
  }
  if (added > 0) foldRowsForRole(roleId);
  return added;
}

/** 排队聚合行（trio 主入口唯一；原位更新；清空移除）。 */
function refreshQueueAggregate(): void {
  const state = useChatStore.getState();
  const trio = state.governanceModel === "trio";
  const primary = state.primaryRoleId;
  const runtime = useUiStore.getState().runtime;
  const queued = queuedWithoutPresented(state.queuedOperator, state.pendingOperator);
  const count = trio && primary ? queuedCountForView(queued, state.projectRoot, runtime) : 0;
  const text = governanceQueueAggregateText(count, currentLocale());
  const dirty = new Set<string>();
  for (const [roleId, model] of models) {
    const rows = model.rows.filter((row) => row.kind === "queue-aggregate");
    for (const row of rows) {
      if (count === 0 || roleId !== primary) {
        model.setRows(model.rows.filter((candidate) => candidate !== row));
        dirty.add(roleId);
      }
    }
  }
  if (count > 0 && primary) {
    const model = modelFor(primary);
    let row = model.rows.find((candidate) => candidate.kind === "queue-aggregate");
    if (!row) {
      row = makeRow({ kind: "queue-aggregate", data: { count, text } });
      model.append(row);
    } else {
      row.data = { count, text };
      const last = model.rows[model.rows.length - 1];
      if (last !== row) {
        model.setRows(model.rows.filter((candidate) => candidate !== row).concat([row]));
      }
    }
    dirty.add(primary);
  }
  if (dirty.size > 0) {
    useChatStore.setState({
      paneVersions: bumpVersions(useChatStore.getState().paneVersions, dirty),
    });
  }
}

/**
 * 交互卡插入位（旧 operatorAnchorIndex 同口径）：toolCallId 行之后 → anchorKey 回放锚点
 * （请求行之后/结论行之前）→ 行尾兜底（绝不丢卡）。插入后同步右移锚点索引。
 */
function insertOperatorRow(
  roleId: string,
  model: RowModel<ChatRow>,
  row: ChatRow,
  toolCallId: string,
  anchorKey: string,
): void {
  if (toolCallId) {
    const at = model.indexOfCallId(toolCallId);
    if (at >= 0) {
      model.insertAt(at + 1, row);
      anchorsFor(roleId).shiftAfterInsert(at + 1);
      return;
    }
  }
  if (anchorKey) {
    const table = anchorsFor(roleId);
    const at = table.insertionIndex(anchorKey, model.rows.length);
    if (at !== null) {
      model.insertAt(at, row);
      table.shiftAfterInsert(at);
      return;
    }
  }
  model.append(row);
}

/** 交互请求的 toolCallId 生命周期行移入卡片（旧 `.op-tool-lifecycle` 同义）。 */
function attachLifecycleToOperator(
  model: RowModel<ChatRow>,
  operatorRow: ChatRow,
  toolCallId: string,
): void {
  if (!toolCallId) return;
  const index = model.rows.findIndex(
    (candidate) =>
      candidate.kind === "tool-lifecycle" &&
      asString(asDict(candidate.data).callId) === toolCallId,
  );
  if (index < 0) return;
  const lifecycleRow = model.rows[index];
  // 旧回放锚点行必须保留为独立行（请求/结论索引供 replayAnchorDebug 与卡插入位使用），
  // 不能移入卡片；新实时生命周期仍归卡内。
  if (lifecycleRow.anchorKey) return;
  const data = asDict(operatorRow.data);
  if (!data.toolLifecycle) {
    operatorRow.data = { ...data, toolLifecycle: asDict(lifecycleRow.data) };
  }
  operatorRow.height = Math.max(operatorRow.height || 0, estimateHeight("tool-lifecycle"));
  model.setRows(model.rows.filter((row) => row !== lifecycleRow));
}

/** 同一请求 id 的全部呈现面（源面 + 镜像面；跨 pane）。 */
function operatorRowRefs(id: string): Array<{ roleId: string; row: ChatRow }> {
  const refs: Array<{ roleId: string; row: ChatRow }> = [];
  for (const [roleId, model] of models) {
    for (const row of model.rows) {
      if (row.kind === "operator" && row.requestId === id) {
        refs.push({ roleId, row });
      }
    }
  }
  return refs;
}

function updateOperatorRows(
  id: string,
  patch: Record<string, unknown>,
  onlyActive = false,
): string[] {
  const dirty: string[] = [];
  for (const { roleId, row } of operatorRowRefs(id)) {
    const data = asDict(row.data);
    if (onlyActive && data.state !== "open" && data.state !== "submitting") continue;
    row.data = { ...data, ...patch };
    if (dirty.indexOf(roleId) < 0) dirty.push(roleId);
  }
  return dirty;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  projectRoot: null,
  primaryRoleId: null,
  hasRoles: false,
  roles: [],
  warnings: [],
  governanceModel: null,
  governanceRecord: null,
  sessionOpenRoleId: null,
  roleBusy: {},
  roleMeta: {},
  queueByRole: {},
  runningByRole: {},
  paneMeta: {},
  paneVersions: {},
  scrollNonce: 0,
  pendingOperator: {},
  queuedOperator: {},
  hint: "",
  hintSource: null,

  setHint: (hint, source = null) => set({ hint, hintSource: source }),

  appendLocalUser: (roleId, text, clientMessageId) => {
    if (!roleId || !text.trim()) return;
    if (clientMessageId) localMessageIds.add(clientMessageId);
    const model = modelFor(roleId);
    appendDescriptor(model, { kind: "user", data: { text } }, roleId);
    const roleMeta = { ...get().roleMeta };
    const localMeta = ensureMeta(roleMeta, roleId);
    localMeta.hadSession = true;
    localMeta.live = true;
    const paneMeta = { ...get().paneMeta };
    paneMeta[roleId] = {
      ...(paneMeta[roleId] || {
        loading: false,
        emptyNote: false,
        contextText: translate(currentLocale(), "ui.chatStore.context.opened"),
      }),
      loading: false,
      emptyNote: false,
    };
    set({ roleMeta, paneMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  resetPanes: () => {
    models.clear();
    historySignatures.clear();
    historyKeyCounts.clear();
    liveKeyCounts.clear();
    localMessageIds.clear();
    ackedClientIds.clear();
    pendingSingles.length = 0;
    activityGroupByRole.clear();
    activityManualOpen.clear();
    activityGroupCounts.clear();
    settledTurnsByRole.clear();
    judgeResultIds.clear();
    anchorsByRole.clear();
    clearReadingAnchors();
    reportedTurnsByRole.clear();
    historyReportIds.clear();
    foldOpenByRole.clear();
    pendingReadableHistory.clear();
    if (singleFlushTimer !== null) {
      clearTimeout(singleFlushTimer);
      singleFlushTimer = null;
    }
    set({
      sessionOpenRoleId: null,
      paneMeta: {},
      paneVersions: {},
      pendingOperator: {},
      queuedOperator: {},
      runningByRole: {},
      // 旧 loadProject/applyListing(fresh=true) 同义：换项目不保留上一项目的角色状态徽标/队列。
      roleMeta: {},
      roleBusy: {},
      queueByRole: {},
    });
  },

  loadProject: async (projectRoot, explicitFresh) => {
    const bridge = getDesktopBridge();
    if (!bridge?.listProject || !projectRoot) return null;
    let raw: unknown;
    try {
      raw = await bridge.listProject(projectRoot);
    } catch (error) {
      const current = get();
      const selected = useUiStore.getState().selectedRoleId;
      const paneMeta = { ...current.paneMeta };
      if (selected) {
        paneMeta[selected] = {
          loading: false,
          emptyNote: false,
          contextText: translate(currentLocale(), "ui.chatStore.context.projectLoadFailed"),
          error: String(error),
        };
      }
      set({ paneMeta });
      return null;
    }
    const record = asDict(raw);
    if (!raw || typeof raw !== "object") return null;
    const roles = asArray<RoleView>(record.roles);
    const listing: Listing = {
      projectRoot: asString(record.projectRoot) || projectRoot,
      primaryRoleId:
        typeof record.primaryRoleId === "string" ? record.primaryRoleId : roles[0]?.roleId || null,
      hasRoles:
        typeof record.hasRoles === "boolean" ? record.hasRoles : roles.length > 0,
      roles,
      warnings: asArray<string>(record.warnings),
      governanceModel:
        record.governanceModel === "single" || record.governanceModel === "trio"
          ? record.governanceModel
          : undefined,
      governanceRecord:
        record.governanceRecord && typeof record.governanceRecord === "object"
          ? (record.governanceRecord as Listing["governanceRecord"])
          : undefined,
    };
    // 旧 loadProject 语义：显式导入/切换项目一律 fresh（停止旧会话、清空旧状态），
    // 即使路径与当前项目相同；只有 refreshProject 显式传 false 才保留当前会话/选择。
    const fresh = explicitFresh !== false;
    get().applyListing(listing, fresh);
    // pending histories（项目不符时寄存）——bench 的 r1/r2 场景
    const remain: Array<Record<string, unknown>> = [];
    for (const pending of pendingHistories) {
      const pendingRoot = asString(pending.projectRoot);
      if (pendingRoot === listing.projectRoot) {
        get().applyHistory(pending);
      } else {
        remain.push(pending);
      }
    }
    pendingHistories.length = 0;
    pendingHistories.push(...remain);
    void get().refreshLiveRoles();
    return listing;
  },

  applyListing: (listing, fresh) => {
    if (fresh) get().resetPanes();
    const current = get();
    const roles = Array.isArray(listing.roles) ? listing.roles : [];
    const selectedNow = useUiStore.getState().selectedRoleId;
    const selected =
      !fresh && roles.some((role) => role.roleId === selectedNow)
        ? selectedNow
        : listing.primaryRoleId && roles.some((role) => role.roleId === listing.primaryRoleId)
          ? listing.primaryRoleId
          : roles[0]?.roleId || null;
    useUiStore.getState().selectRole(selected || "");
    const paneMeta = fresh ? {} : { ...current.paneMeta };
    if (selected && !paneMeta[selected]) {
      paneMeta[selected] = {
        loading: false,
        emptyNote: true,
        contextText:
          selected === listing.primaryRoleId
            ? translate(currentLocale(), "ui.chatStore.context.primaryNoSession")
            : translate(currentLocale(), "ui.chatHeader.noSession"),
      };
    }
    set({
      projectRoot: listing.projectRoot,
      primaryRoleId: listing.primaryRoleId,
      hasRoles: listing.hasRoles !== false,
      roles,
      warnings: Array.isArray(listing.warnings) ? listing.warnings : [],
      governanceModel: listing.governanceModel || null,
      governanceRecord: listing.governanceRecord || null,
      sessionOpenRoleId: fresh ? null : current.sessionOpenRoleId,
      paneMeta,
      paneVersions: bumpVersions(fresh ? {} : current.paneVersions, selected ? [selected] : []),
    });
    // trio 才显示排队聚合；模型变 single/未知时立即移除（不残留 0 行）。
    refreshQueueAggregate();
  },

  refreshProject: async () => {
    const projectRoot = get().projectRoot;
    if (!projectRoot) return;
    await get().loadProject(projectRoot, false);
  },

  refreshLiveRoles: async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.listLiveSessionViews) return;
    try {
      const views = await bridge.listLiveSessionViews();
      const roleMeta = { ...get().roleMeta };
      for (const view of asArray<Record<string, unknown>>(views)) {
        const roleId = asString(view.roleId);
        const root = asString(view.projectRoot);
        if (!roleId) continue;
        if (root && root !== get().projectRoot) continue;
        const meta = ensureMeta(roleMeta, roleId);
        meta.live = true;
        meta.hadSession = true;
      }
      set({ roleMeta, paneVersions: bumpVersions(get().paneVersions, Object.keys(roleMeta)) });
    } catch {
      /* 读取活动会话失败不打断界面；状态保持如实缺省。 */
    }
  },

  selectRole: async (roleId) => {
    if (!roleId) return;
    useUiStore.getState().selectRole(roleId);
    const projectRoot = get().projectRoot;
    const runtime = useUiStore.getState().runtime;
    modelFor(roleId);
    const paneMeta = { ...get().paneMeta };
    const alreadyOpen = get().sessionOpenRoleId === roleId;
    const alreadyLoaded = !!paneMeta[roleId]?.historyLoaded || historySignatures.has(roleId);
    paneMeta[roleId] = {
      ...(paneMeta[roleId] || { emptyNote: true, contextText: "" }),
      loading: !alreadyLoaded,
      contextText: alreadyOpen
        ? paneMeta[roleId]?.contextText ||
          translate(currentLocale(), "ui.chatStore.context.opened")
        : translate(currentLocale(), "ui.chatStore.context.opening"),
      error: undefined,
    };
    set({
      paneMeta,
      scrollNonce: get().scrollNonce + 1,
      paneVersions: bumpVersions(get().paneVersions, [roleId]),
    });
    if (!projectRoot) {
      paneMeta[roleId] = {
        ...paneMeta[roleId],
        loading: false,
        emptyNote: true,
        contextText: translate(currentLocale(), "ui.sidebar.noProject"),
      };
      set({ paneMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
      return;
    }
    const bridge = getDesktopBridge();
    if (alreadyOpen && alreadyLoaded) {
      paneMeta[roleId] = { ...paneMeta[roleId], loading: false };
      set({ paneMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
      // 旧语义：显式再点同一角色要向后端再确认一次会话（后台可能已释放）；
      // 只确认，不重拉历史，保留当前行与滚动。
      if (bridge?.openSession && projectRoot) {
        try {
          const result = asDict(await bridge.openSession({ projectRoot, roleId, runtime }));
          if (result.ok === false) {
            const roleMeta = { ...get().roleMeta };
            ensureMeta(roleMeta, roleId).error = true;
            set({ roleMeta });
          }
        } catch {
          /* 确认失败不吞当前会话；后续发送会按真实结果报错。 */
        }
      }
      return;
    }
    if (!bridge) {
      paneMeta[roleId] = {
        ...paneMeta[roleId],
        loading: false,
        error: translate(currentLocale(), "ui.chatStore.error.noDesktopBridge"),
        contextText: translate(currentLocale(), "ui.chatStore.context.notConnected"),
      };
      set({ paneMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
      return;
    }
    if (!alreadyOpen) {
      if (!bridge.openSession) {
        paneMeta[roleId] = {
          ...paneMeta[roleId],
          loading: false,
          error: translate(currentLocale(), "ui.chatStore.error.noSessionChannel"),
          contextText: translate(currentLocale(), "ui.chatStore.context.channelUnavailable"),
        };
        set({ paneMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
        return;
      }
      let result: Record<string, unknown> = {};
      try {
        result = asDict(await bridge.openSession({ projectRoot, roleId, runtime }));
      } catch (error) {
        result = { ok: false, error: String(error) };
      }
      if (result.ok === false) {
        const reason =
          asString(result.error) || translate(currentLocale(), "ui.chatStore.openFailed");
        const roleMeta = { ...get().roleMeta };
        ensureMeta(roleMeta, roleId).error = true;
        const nextPane = { ...get().paneMeta };
        nextPane[roleId] = {
          ...nextPane[roleId],
          loading: false,
          error: reason,
          contextText: translate(currentLocale(), "ui.chatStore.openFailed"),
        };
        const model = modelFor(roleId);
        model.append(makeRow({
          kind: "system",
          data: {
            cls: "sys-call sys-config",
            text: translate(currentLocale(), "ui.chatStore.openFailedWithReason", {
              reason,
            }),
          },
        }));
        set({
          roleMeta,
          paneMeta: nextPane,
          hint: translate(currentLocale(), "ui.chatStore.openFailedWithReason", {
            reason,
          }),
          paneVersions: bumpVersions(get().paneVersions, [roleId]),
        });
        return;
      }
      const contextSource = asString(result.contextSource);
      const contextWarning = asString(result.contextWarning);
      const resumed = result.resumed === true || contextSource === "resumed";
      // 旧 showSessionContext 同口径：resumed/recovered/fresh 文案逐字；不把恢复失败说成已恢复。
      const contextText = resumed
        ? translate(currentLocale(), "ui.chatStore.context.continues")
        : contextSource === "recovered"
          ? translate(currentLocale(), "ui.chatStore.context.recovered")
          : contextSource === "fresh"
            ? contextWarning
              ? translate(currentLocale(), "ui.chatStore.context.recoveryFailed")
              : translate(currentLocale(), "ui.chatStore.context.newSession")
            : translate(currentLocale(), "ui.chatStore.context.sourceUnreported");
      if (!resumed && contextSource === "fresh") {
        pendingReadableHistory.add(roleId);
      }
      const roleMeta = { ...get().roleMeta };
      const meta = ensureMeta(roleMeta, roleId);
      meta.hadSession = true;
      meta.live = true;
      meta.contextText = contextText;
      meta.contextWarning = contextWarning || undefined;
      const nextPane = { ...get().paneMeta };
      nextPane[roleId] = { ...nextPane[roleId], contextText };
      set({
        sessionOpenRoleId: roleId,
        roleMeta,
        paneMeta: nextPane,
        paneVersions: bumpVersions(get().paneVersions, [roleId]),
      });
    }
    if (bridge.getSessionHistory) {
      try {
        const history = await bridge.getSessionHistory({ projectRoot, roleId, runtime });
        get().applyHistory(history);
      } catch (error) {
        const nextPane = { ...get().paneMeta };
        nextPane[roleId] = {
          ...nextPane[roleId],
          loading: false,
          historyLoaded: true,
          error: String(error),
          contextText: translate(currentLocale(), "ui.chatStore.context.historyFailed"),
        };
        set({ paneMeta: nextPane, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
      }
    } else {
      const nextPane = { ...get().paneMeta };
      nextPane[roleId] = {
        ...nextPane[roleId],
        loading: false,
        historyLoaded: true,
      };
      set({ paneMeta: nextPane, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
    }
  },

  invalidateSession: (roleId) => {
    if (!roleId || get().sessionOpenRoleId !== roleId) return;
    set({ sessionOpenRoleId: null });
  },

  selectRuntime: (runtime) => {
    useUiStore.getState().setRuntime(runtime);
    const selected = useUiStore.getState().selectedRoleId;
    const paneMeta = { ...get().paneMeta };
    if (selected && paneMeta[selected]) {
      paneMeta[selected] = {
        ...paneMeta[selected],
        contextText: translate(currentLocale(), "ui.chatStore.context.engineSwitched"),
        loading: false,
      };
    }
    set({
      sessionOpenRoleId: null,
      paneMeta,
      queuedOperator: {},
      paneVersions: bumpVersions(get().paneVersions, selected ? [selected] : []),
    });
    refreshQueueAggregate();
  },

  appendEnvelopes: (input) => {
    // 单发 session:event：16ms 合帧（旧 Q-1 同义）；数组 session:events：立即按批处理，保持 e2e 同步可见。
    if (!Array.isArray(input)) {
      const singles = normalizeEnvelopes(input);
      if (singles.length === 0) return;
      pendingSingles.push(...singles);
      if (singleFlushTimer === null) {
        singleFlushTimer = setTimeout(flushPendingSingles, 16);
      }
      return;
    }
    if (pendingSingles.length > 0) {
      input = [...pendingSingles.splice(0, pendingSingles.length), ...input];
      if (singleFlushTimer !== null) {
        clearTimeout(singleFlushTimer);
        singleFlushTimer = null;
      }
    }
    const envelopes = normalizeEnvelopes(input);
    if (envelopes.length === 0) return;
    const projectRoot = get().projectRoot;
    const runtime = useUiStore.getState().runtime;
    const view = { projectRoot, runtime };
    const dirty = new Set<string>();
    const roleMeta = { ...get().roleMeta };
    const paneMeta = { ...get().paneMeta };
    const liveCounts = new Map(liveKeyCounts);
    let hint = get().hint;
    let hintSource = get().hintSource;
    for (const envelope of envelopes) {
      if (!envelopeMatches(envelope, view)) continue;
      const roleId = envelope.roleId;
      const event = envelope.event;
      // 真实事件 ACK：记录 clientMessageId；匹配的排队提示只清一次（迟到的入队回包不得复活）。
      if (typeof envelope.clientMessageId === "string" && envelope.clientMessageId !== "") {
        ackedClientIds.add(envelope.clientMessageId);
        if (
          hintSource &&
          hintSource.kind === "queue" &&
          hintSource.clientMessageId === envelope.clientMessageId
        ) {
          hint = "";
          hintSource = null;
        }
      }
      // 已接受但暂时「结果未报告」的发送提示：该轮真实终态到达即收口（不覆盖新草稿）。
      // 身份按 **turnId** 精确匹配（错误轮次的终态不得改写）；无 turnId 时才退回 clientMessageId。
      if (hintSource && hintSource.kind === "send") {
        const eventTurn = typeof event.turnId === "string" ? event.turnId : "";
        const byTurn = !!hintSource.turnId && eventTurn === hintSource.turnId;
        const byClient =
          !hintSource.turnId &&
          !!hintSource.clientMessageId &&
          typeof envelope.clientMessageId === "string" &&
          hintSource.clientMessageId === envelope.clientMessageId;
        const terminal =
          event.kind === "settled" ||
          (event.kind === "message" && asDict(event.detail).source === "prompt-input");
        if ((byTurn || byClient) && terminal) {
          hint = "";
          hintSource = null;
        }
      }
      const descriptor = describeEvent(event, currentLocale());
      if (!descriptor) continue;
      const scope = {
        projectRoot: typeof envelope.projectRoot === "string" ? envelope.projectRoot : projectRoot,
        roleId,
        runtime:
          typeof envelope.runtime === "string"
            ? envelope.runtime
            : typeof event.runtime === "string"
              ? event.runtime
              : runtime,
      };
      if (descriptor.kind === "handback") {
        const data = asDict(descriptor.data);
        const report = data.report;
        if (!reportVersionSupported(report)) continue;
        const source = reportSourceRecord(report);
        // 来源角色/引擎不符的报告不提升（旧 appendHandback 同口径）。
        if (asString(source.roleId) !== roleId) continue;
        if (
          typeof source.runtime === "string" &&
          source.runtime !== "" &&
          source.runtime !== scope.runtime
        ) {
          continue;
        }
        descriptor.data = { ...data, scope };
        const turnId = asString(source.turnId);
        if (turnId) markReportedTurn(roleId, turnId, false);
        foldRowsForRole(roleId);
        useReportStore
          .getState()
          .ensureReport(scope, asString(asReportRecord(report).reportId), data.persistence);
      }
      if (descriptor.kind === "delivery") {
        const data = asDict(descriptor.data);
        const provenance = asDict(data.provenance);
        const presentation = asDict(data.presentation);
        const identity = Object.keys(provenance).length > 0 ? provenance : presentation;
        descriptor.data = { ...data, scope };
        const turnId = descriptor.turnId || "";
        if (turnId) markReportedTurn(roleId, turnId, true);
        useReportStore
          .getState()
          .ensureDelivery(scope, asString(identity.attemptId), undefined);
      }
      if (
        descriptor.kind === "user" &&
        typeof envelope.clientMessageId === "string" &&
        localMessageIds.has(envelope.clientMessageId)
      ) {
        // 本地乐观行已呈现：真实事件只补齐 turnId（报告折叠需要精确轮次），不重复加行。
        const turnId = asString(event.turnId);
        const text = asString(asDict(descriptor.data).text);
        const model = modelFor(roleId);
        if (turnId) {
          for (let index = model.rows.length - 1; index >= 0; index -= 1) {
            const row = model.rows[index];
            if (row.kind !== "user" || row.turnId) continue;
            if (asString(asDict(row.data).text) !== text) continue;
            row.turnId = turnId;
            row.data = { ...asDict(row.data) };
            applyFoldToRow(row, roleId);
            dirty.add(roleId);
            break;
          }
        }
        continue;
      }
      const key = eventKey(event);
      let liveMap = liveCounts.get(roleId);
      if (!liveMap) {
        liveMap = new Map<string, number>();
        liveCounts.set(roleId, liveMap);
      }
      const decision = classifyLiveDuplicate({
        key,
        event,
        historyCount: key ? (historyKeyCounts.get(roleId)?.get(key) || 0) : 0,
        liveCount: key ? liveMap.get(key) || 0 : 0,
      });
      if (key) liveMap.set(key, decision.nextLiveCount);
      // 终态行即使文本命中历史/实时去重，也要走合并/提升路径（同一 turn+outcome 只留一条）。
      if (decision.skip && descriptor.kind !== "turn-terminal") continue;
      const model = modelFor(roleId);
      const meta = ensureMeta(roleMeta, roleId);
      meta.hadSession = true;
      meta.live = true;
      meta.lastEvent = asString(event.summary);
      const pane = paneMeta[roleId] || {
        loading: false,
        emptyNote: true,
        contextText: translate(currentLocale(), "ui.chatStore.context.opened"),
      };
      paneMeta[roleId] = {
        ...pane,
        loading: false,
        emptyNote: false,
      };
      if (descriptor.kind === "turn-terminal") {
        const outcome = asString(asDict(descriptor.data).outcome);
        if (outcome === "failed" || outcome === "timed_out") meta.error = true;
        else if (outcome === "completed" || outcome === "aborted") meta.error = false;
      }
      if (event.kind === "settled") {
        const settledTurn = asString(event.turnId);
        if (settledTurn) {
          setSettled(roleId, settledTurn);
          foldActivityGroups(roleId, settledTurn);
          foldRowsForRole(roleId);
        }
      }
      const appended = appendDescriptor(model, descriptor, roleId);
      if (appended && (appended.kind === "user" || appended.kind === "assistant")) {
        applyFoldToRow(appended, roleId);
      }
      dirty.add(roleId);
    }
    liveKeyCounts.clear();
    for (const [roleId, map] of liveCounts) liveKeyCounts.set(roleId, map);
    if (dirty.size > 0 || hint !== get().hint || hintSource !== get().hintSource) {
      set({
        roleMeta,
        paneMeta,
        hint,
        hintSource,
        paneVersions: bumpVersions(get().paneVersions, dirty),
      });
    }
  },

  setActivityGroupOpen: (roleId, rowId, open, manual = true) => {
    const model = models.get(roleId);
    if (!model) return;
    const row = model.rows.find((candidate) => candidate.id === rowId);
    if (!row || row.kind !== "activities") return;
    const data = asDict(row.data);
    const id = asString(data.id);
    row.data = {
      ...data,
      open: open === true,
      manual: manual ? true : data.manual === true,
    };
    if (manual && id) manualOpenMap(roleId).set(id, open === true);
    set({
      paneVersions: bumpVersions(get().paneVersions, [roleId]),
    });
  },

  setRowDetailOpen: (roleId, rowId, key, open) => {
    const model = models.get(roleId);
    if (!model) return;
    const row = model.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    if (key === "fold") {
      // task-request / reply-original 的开合（跨 full 重建保持；卸载重挂同状态）。
      setFoldOpen(roleId, row, open === true);
      set({ paneVersions: bumpVersions(get().paneVersions, [roleId]) });
      return;
    }
    row.data = {
      ...asDict(row.data),
      detailsOpen: {
        ...asDict(asDict(row.data).detailsOpen),
        [key]: open === true,
      },
    };
    set({ paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  touchPane: (roleId) => {
    if (!roleId) return;
    set({ paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  setOperatorSelected: (roleId, rowId, selected) => {
    const model = models.get(roleId);
    if (!model) return;
    const row = model.rows.find((candidate) => candidate.id === rowId);
    if (!row || row.kind !== "operator") return;
    row.data = { ...asDict(row.data), selected: selected.slice() };
    set({ paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  applyHistory: (payload) => {
    const record = asDict(payload);
    const roleId = asString(record.roleId);
    if (!roleId) return;
    const payloadRoot = asString(record.projectRoot);
    const payloadRuntime = asString(record.runtime);
    if (payloadRoot && payloadRoot !== get().projectRoot) {
      pendingHistories.push(record);
      return;
    }
    if (payloadRuntime && payloadRuntime !== useUiStore.getState().runtime) return;
    const rows = asArray<Record<string, unknown>>(record.rows);
    const historyRows = dedupeHistoryRows(rows, currentLocale());
    const signatures = rows.map(rowSignature);
    const previous = historySignatures.get(roleId) || null;
    const planned = planReplay(previous, signatures);
    // 之前的「历史」若为空，模型里只有实时行——此时 append(from 0) 会把同一批历史行
    // 追加到实时行之后造成重复（实际轮次被呈现两次）；按 full 重建（旧回放口径）。
    const plan =
      planned.mode === "append" && planned.from === 0
        ? ({ mode: "full" } as const)
        : planned;
    const model = modelFor(roleId);
    const scope = {
      projectRoot: payloadRoot || get().projectRoot,
      roleId,
      runtime: payloadRuntime || useUiStore.getState().runtime,
    };
    const reports = asArray<unknown>(record.reports);
    const appendHistoryDescriptor = (descriptor: NewRowDescriptor): ChatRow => {
      const appended = appendDescriptor(model, descriptor, roleId);
      noteRowAnchor(roleId, appended, Math.max(0, model.rows.indexOf(appended)));
      if (descriptor.kind === "delivery" && descriptor.turnId) {
        markReportedTurn(roleId, descriptor.turnId, true);
      }
      return appended;
    };
    const appendHistoryRow = (row: Record<string, unknown>): ChatRow =>
      appendHistoryDescriptor(historyRowToDescriptor(row, currentLocale()));
    let added = 0;
    if (plan.mode === "full") {
      if (rows.length === 0 && model.rows.length > 0) {
        // 空历史不能覆盖任何实时行（旧 preserveUncoveredRows 同向）：
        // 例如「先到判断结果行、后到空历史」——实时事实保留，不重建。
        added += appendHistoryReports(roleId, reports, scope, false);
      } else {
        // 行表整体重建：保留交互卡行（同一行对象 ⇒ React 复用原 DOM，卡不闪、不重答）。
        const operatorRows = model.rows.filter((row) => row.kind === "operator");
        // 实时 reasoning 行不参与首行文本去重；重建后按 turnId 归并（见下方）。
        const liveReasoningRows = model.rows.filter(
          (row) => row.kind === "reasoning" && !row.replay,
        );
        // 首次恢复才显示「会话记录已恢复」分隔（已有实时/历史行时重建不重复插入）。
        const hadRows = model.rows.some((row) => row.kind !== "operator");
        // 保留「未被历史覆盖」的实时行（旧 preserveUncoveredRows 同口径）：系统注记/未入库的
        // 用户与助手行/实时报告/交付批；工具行与工具组由历史重建，不从实时侧重复保留。
        const keepKinds = new Set([
          "user",
          "assistant",
          "system",
          "denied",
          "injected",
          "turn-terminal",
          "handback",
          "delivery",
          "reasoning",
        ]);
        const historyDescriptors = dedupeHistoryDescriptors(
          historyRows.map((row) => historyRowToDescriptor(row, currentLocale())),
        );
        const groupOf = (kind: string): string =>
          kind === "injected" || kind === "user"
            ? "user"
            : kind === "delivery"
              ? "delivery"
              : kind;
        const exactCounts = new Map<string, number>();
        const looseCounts = new Map<string, number>();
        for (const descriptor of historyDescriptors) {
          if (
            descriptor.kind !== "user" &&
            descriptor.kind !== "assistant" &&
            descriptor.kind !== "system" &&
            descriptor.kind !== "injected" &&
            descriptor.kind !== "denied" &&
            descriptor.kind !== "delivery"
          ) {
            continue;
          }
          // 按**呈现分片**计数：system-notice 历史行会拆成通知行 + 用户正文行，
          // 与实时行的呈现身份一致后才能被下方 preserve 循环正确覆盖。
          for (const part of historyRenderParts(descriptor)) {
            const text = part.text.split(/\r?\n/)[0].trim();
            if (text === "") continue;
            const group = groupOf(part.kind);
            const turnId = asString(descriptor.turnId);
            const exactKey = group + "|" + turnId + "|" + text;
            exactCounts.set(exactKey, (exactCounts.get(exactKey) || 0) + 1);
            const looseKey = group + "|" + text;
            looseCounts.set(looseKey, (looseCounts.get(looseKey) || 0) + 1);
          }
        }
        const consume = (counts: Map<string, number>, key: string): boolean => {
          const count = counts.get(key) || 0;
          if (count <= 0) return false;
          counts.set(key, count - 1);
          return true;
        };
        const liveTextOf = (row: ChatRow): string => {
          const data = asDict(row.data);
          const text =
            row.kind === "injected" || row.kind === "delivery"
              ? asString(data.body) || asString(data.text)
              : asString(data.text);
          return (text || rowText(row)).split(/\r?\n/)[0].trim();
        };
        const preserved: ChatRow[] = [];
        for (const row of model.rows) {
          if (row.replay || !keepKinds.has(row.kind)) continue;
          if (rowText(row) === "") continue;
          const text = liveTextOf(row);
          if (text === "") continue;
          const group = groupOf(row.kind);
          const exactKey = group + "|" + (row.turnId || "") + "|" + text;
          const looseKey = group + "|" + text;
          if (consume(exactCounts, exactKey)) {
            consume(looseCounts, looseKey);
            continue;
          }
          // 无 turnId 的本地乐观行：按文本计数（同一文本的历史行逐个覆盖）。
          if (!row.turnId && consume(looseCounts, looseKey)) continue;
          preserved.push(row);
        }
        anchorsFor(roleId).clear();
        // 行表即将整体重建：先记录首个可见阅读行（全文文本前缀 + 相对偏移）。
        if (rows.length > 0 && hadRows) captureReadingAnchor(roleId);
        model.clear();
        activityGroupByRole.set(roleId, null);
        // 整段回放按同一序列重建组 id；手动开合状态（activityManualOpen）因此可恢复。
        activityGroupCounts.delete(roleId);
        // 客户 2026-10-13 裁定：成功回放不显示分隔行；错误分支才保留。
        historyDescriptors.forEach((descriptor) => {
          appendHistoryDescriptor(descriptor);
          added += 1;
        });
        // 交互卡按锚点回插（请求行之后/结论行之前）；无锚落尾（绝不丢卡）。
        const table = anchorsFor(roleId);
        for (const row of operatorRows) {
          let at: number | null = null;
          if (row.anchorKey) {
            at = table.insertionIndex(row.anchorKey, model.rows.length);
          }
          if (at === null) {
            model.append(row);
          } else {
            model.insertAt(at, row);
            table.shiftAfterInsert(at);
          }
          if (row.callId) attachLifecycleToOperator(model, row, row.callId);
        }
        // 实时保留行的报告身份先入去重集，历史报告不再生成第二张卡。
        const seeded = new Set<string>();
        for (const row of preserved) {
          if (row.kind !== "handback") continue;
          const report = asDict(row.data).report;
          if (report && typeof report === "object") seeded.add(reportIdentity(report));
        }
        historyReportIds.set(roleId, seeded);
        added += appendHistoryReports(roleId, reports, scope, false);
        for (const row of preserved) {
          // 实时终态行若与历史 denied 行同一 turn 且文本相交：提升历史行并合并来源，
          // 不额外保留实时副本（旧 appendTurnTerminal 的 token 回指同义）。
          if (row.kind === "turn-terminal" && row.turnId) {
            const rowData = asDict(row.data);
            const outcome = asString(rowData.outcome);
            const sources = asArray<Record<string, unknown>>(rowData.sources)
              .map((source) => ({
                kind: asString(source.kind) || "terminal",
                text: asString(source.text),
              }))
              .filter((source) => source.text !== "");
            const terminalText = asString(rowData.text);
            if (terminalText && !sources.some((source) => source.text === terminalText)) {
              sources.unshift({ kind: "terminal", text: terminalText });
            }
            let promoted: ChatRow | null = null;
            if (outcome && sources.length > 0) {
              for (const candidate of model.rows) {
                if (candidate.kind !== "system" || candidate.turnId !== row.turnId) continue;
                const candidateData = asDict(candidate.data);
                if (asString(candidateData.cls) !== "sys-call") continue;
                const candidateText = asString(candidateData.text);
                if (!sources.some((source) => source.text === candidateText)) continue;
                promoted = candidate;
                candidate.kind = "turn-terminal";
                candidate.data = {
                  ...candidateData,
                  turnId: row.turnId,
                  outcome,
                  text: sources[0].text,
                  sources,
                };
                candidate.height = Math.max(
                  candidate.height || 0,
                  estimateHeight("turn-terminal"),
                );
                break;
              }
            }
            if (promoted) continue;
          }
          model.append(row);
        }
        // 全量重建后实时 reasoning 行按 turnId 归并（R3）：有历史行 ⇒ piece 指纹幂等合并
        // （正文不重复、时长不重复累计）；无对应历史行 ⇒ 按确定性规则插到该回合终态行之前，
        // 绝不统一追加到表尾（否则又会出现在「会话结束」之后）。无 turnId 的坏件保持到达序追加。
        for (const row of liveReasoningRows) {
          const turnId = asString(row.turnId);
          const existing = turnId
            ? model.rows.find(
                (candidate) =>
                  candidate.kind === "reasoning" &&
                  asString(candidate.turnId) === turnId,
              )
            : undefined;
          if (existing) {
            let merged = asDict(existing.data);
            let changed = false;
            for (const piece of reasoningPiecesFromData(asDict(row.data))) {
              const result = mergeReasoningRowData(merged, piece, currentLocale());
              if (result.changed) {
                merged = result.data;
                changed = true;
              }
            }
            if (changed) {
              existing.data = merged;
              existing.height = Math.max(
                existing.height || 0,
                estimateHeight("reasoning"),
              );
            }
            continue;
          }
          if (!turnId) {
            model.append(row);
            continue;
          }
          const at = reasoningInsertIndex(model.rows, turnId);
          if (at >= model.rows.length) {
            model.append(row);
          } else {
            model.insertAt(at, row);
            anchorsFor(roleId).shiftAfterInsert(at);
          }
        }
      }
      historySignatures.set(roleId, signatures);
      historyKeyCounts.set(roleId, countHistoryEventKeys(historyRows));
      liveKeyCounts.delete(roleId);
    } else if (plan.mode === "append") {
      const appendRows = dedupeHistoryRows(rows.slice(plan.from), currentLocale());
      // 实时行身份在每条历史行前重算：上一条认领可能刚回填了乐观行的 turnId。
      const liveIdentities = (): LiveRowIdentity[] =>
        model.rows
          .map((candidate) => liveRowIdentity(candidate))
          .filter((identity): identity is LiveRowIdentity => identity !== null);
      for (const row of appendRows) {
        const descriptor = historyRowToDescriptor(row, currentLocale());
        const turnId = asString(descriptor.turnId);
        // 先认领本地乐观行（同文、无 turnId）；system-notice 的用户正文在拆分后的 user 分片。
        const claimed = new Set<string>();
        for (const part of historyRenderParts(descriptor)) {
          if (part.kind !== "user") continue;
          if (claimOptimisticUserText(model, turnId, part.text)) claimed.add(part.text);
        }
        // 按呈现分片判定（通知/用户正文分别覆盖）；不同 turn 的同文输入保留。
        const decision = planHistoryMerge(descriptor, liveIdentities(), claimed);
        if (decision.appendRow) {
          appendHistoryRow(row);
          added += 1;
        }
        if (decision.appendNoticeOnly) {
          appendHistoryDescriptor({
            ...descriptor,
            data: { ...asDict(descriptor.data), remainder: "" },
          });
          added += 1;
        }
        for (const text of decision.appendUserTexts) {
          appendHistoryDescriptor({
            kind: "user",
            data: { text },
            ...(turnId ? { turnId } : {}),
            replay: true,
          });
          added += 1;
        }
      }
      added += appendHistoryReports(roleId, reports, scope, false);
      historySignatures.set(roleId, signatures);
      historyKeyCounts.set(roleId, countHistoryEventKeys(historyRows));
    } else if (plan.mode === "skip" && reports.length > 0) {
      // 行签名相同但携带新的报告快照（同角色历史重推）：只补报告，不重放行。
      added += appendHistoryReports(roleId, reports, scope, false);
    }
    // 折叠只按已报告轮次与 settled/回放行（报告声明本身不折叠活跃消息）。
    foldRowsForRole(roleId);
    const error = asString(record.error);
    if (error && rows.length === 0) {
      appendDescriptor(model, {
        kind: "system",
        data: {
          cls: "sys-call sys-replay-divider",
          text: translate(currentLocale(), "ui.chatStore.replayFailed", {
            detail: error,
          }),
        },
        replay: true,
      }, roleId);
    }
    const projectionText = historyProjectionText(record, currentLocale());
    const roleMeta = { ...get().roleMeta };
    const meta = ensureMeta(roleMeta, roleId);
    if (pendingReadableHistory.has(roleId)) {
      pendingReadableHistory.delete(roleId);
      if (rows.length > 0 && meta.readableHistoryRetained !== true) {
        meta.readableHistoryRetained = true;
        meta.contextText =
          meta.contextText + translate(currentLocale(), "ui.chatStore.historyRetainedSuffix");
      }
    }
    meta.restored = true;
    meta.contextText =
      meta.contextText || translate(currentLocale(), "ui.chatStore.context.historyRecovered");
    const paneMeta = { ...get().paneMeta };
    paneMeta[roleId] = {
      loading: false,
      emptyNote: rows.length === 0 && model.rows.length === 0,
      historyLoaded: true,
      contextText: meta.contextText,
      ...(projectionText ? { projectionText } : {}),
      error: error || undefined,
    };
    set({
      roleMeta,
      paneMeta,
      paneVersions: bumpVersions(get().paneVersions, [roleId]),
    });
    refreshQueueAggregate();
    void added;
  },

  applyRoleState: (payload) => {
    const record = asDict(payload);
    const roleId = asString(record.roleId);
    if (!roleId) return;
    modelFor(roleId); // 后台角色也建立 pane 行表（空行 + 队列/状态事实由 paneDebug/QueueRows 呈现）
    const payloadRoot = asString(record.projectRoot);
    const payloadRuntime = asString(record.runtime);
    if (payloadRoot && get().projectRoot && payloadRoot !== get().projectRoot) return;
    if (payloadRuntime && payloadRuntime !== useUiStore.getState().runtime) return;
    const roleBusy = { ...get().roleBusy, [roleId]: record.busy === true };
    const queue = asArray<Record<string, unknown>>(record.queue);
    const queueByRole = { ...get().queueByRole, [roleId]: queue };
    const runningByRole = {
      ...get().runningByRole,
      [roleId]:
        record.running && typeof record.running === "object"
          ? (record.running as Record<string, unknown>)
          : null,
    };
    const roleMeta = { ...get().roleMeta };
    const meta = ensureMeta(roleMeta, roleId);
    meta.live = true;
    meta.hadSession = true;
    const contextSource = asString(record.contextSource);
    const contextWarning = asString(record.contextWarning);
    if (contextSource === "recovered") {
      meta.contextText = translate(currentLocale(), "ui.chatStore.context.recovered");
    } else if (contextSource === "fresh") {
      const base = contextWarning
        ? translate(currentLocale(), "ui.chatStore.context.recoveryFailed")
        : translate(currentLocale(), "ui.chatStore.context.newSession");
      meta.contextText =
        meta.readableHistoryRetained === true && !contextWarning
          ? base + translate(currentLocale(), "ui.chatStore.historyRetainedSuffix")
          : base;
    }
    if (contextWarning) meta.contextWarning = contextWarning;
    const paneMeta = { ...get().paneMeta };
    if (paneMeta[roleId] && meta.contextText) {
      paneMeta[roleId] = { ...paneMeta[roleId], contextText: meta.contextText };
    }
    // 权威空队列只清「同角色/同引擎/同项目」的排队提示（旧 currentHintSource 口径）；
    // 其它角色的快照与校验/发送提示不受影响。
    let hint = get().hint;
    let hintSource = get().hintSource;
    if (
      queue.length === 0 &&
      hintSource &&
      hintSource.kind === "queue" &&
      hintSource.roleId === roleId &&
      hintSource.runtime === useUiStore.getState().runtime &&
      (!hintSource.projectRoot || hintSource.projectRoot === get().projectRoot)
    ) {
      hint = "";
      hintSource = null;
    }
    set({
      roleBusy,
      queueByRole,
      runningByRole,
      roleMeta,
      paneMeta,
      hint,
      hintSource,
      paneVersions: bumpVersions(get().paneVersions, [roleId]),
    });
  },

  appendSystemRow: (roleId, cls, text) => {
    if (!roleId || !text) return;
    const model = modelFor(roleId);
    model.append(makeRow({ kind: "system", data: { cls, text } }));
    set({ paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  setRoleError: (roleId, error) => {
    if (!roleId) return;
    const roleMeta = { ...get().roleMeta };
    ensureMeta(roleMeta, roleId).error = error === true;
    set({ roleMeta, paneVersions: bumpVersions(get().paneVersions, [roleId]) });
  },

  hasClientAck: (clientMessageId) => ackedClientIds.has(clientMessageId),

  appendShellJudgeResult: (payload) => {
    const record = asDict(payload);
    const view = shellJudgeResultView(record);
    if (!view) return; // manual/未知裁决不产生结果行（原卡 + judgeNotice 替代）
    appendJudgeResultRow(record, view, "judge-result");
  },

  appendGovernanceJudgeResult: (payload) => {
    const record = asDict(payload);
    const view = governanceJudgeResultView(record);
    if (!view) return;
    appendJudgeResultRow(record, view, "governance-judge-result");
  },

  appendOperatorRequest: (payload) => {
    const record = asDict(payload);
    const id = asString(record.id);
    const roleId = operatorSourceRoleId(record);
    if (!id || !roleId) return;
    const surfaces = operatorSurfaces(record);
    const mirrorRoleId = operatorMirrorRoleId(record);
    const queued = operatorQueued(record);
    const toolCallId = asString(record.toolCallId);
    const anchorKey = asString(record.anchorKey);
    const existing = operatorRowRefs(id);
    const existingRoles = existing.map((ref) => ref.roleId);
    const dirty: string[] = [];
    for (const surfaceRoleId of surfaces) {
      const current = existing.find((ref) => ref.roleId === surfaceRoleId);
      if (current) {
        // 幂等重推：同一 id 只更新载荷/排队事实；终态不复活。
        const data = asDict(current.row.data);
        if (anchorKey) current.row.anchorKey = anchorKey;
        current.row.data = {
          ...data,
          payload: record,
          ...(data.state === "open" && typeof record.queued === "boolean"
            ? { queued }
            : {}),
        };
        dirty.push(surfaceRoleId);
        continue;
      }
      const model = modelFor(surfaceRoleId);
      const row = makeRow({
        kind: "operator",
        data: {
          payload: record,
          state: "open",
          finalNote: null,
          selected: [],
          queued,
          isMirror: surfaceRoleId !== roleId,
          surfaceRoleId,
        },
        requestId: id,
        turnId: asString(record.turnId) || undefined,
        callId:
          surfaceRoleId === roleId
            ? toolCallId || undefined
            : undefined,
        // full rebuild 按此锚点回插（旧卡不落尾）；镜像面不参与源角色锚点表。
        anchorKey: surfaceRoleId === roleId && anchorKey ? anchorKey : undefined,
        anchor: surfaceRoleId === roleId && anchorKey ? "request" : undefined,
      });
      if (surfaceRoleId === roleId) {
        insertOperatorRow(surfaceRoleId, model, row, toolCallId, anchorKey);
        attachLifecycleToOperator(model, row, toolCallId);
      } else {
        model.append(row);
      }
      dirty.push(surfaceRoleId);
    }
    void existingRoles;
    void mirrorRoleId;
    // 已被呈现 ⇒ 不再属于排队聚合（同一 id 不重复计数）。
    const queuedOperator = { ...get().queuedOperator };
    delete queuedOperator[id];
    const pendingOperator = { ...get().pendingOperator, [id]: record };
    set({
      pendingOperator,
      queuedOperator,
      paneVersions: bumpVersions(get().paneVersions, dirty),
    });
    refreshQueueAggregate();
  },

  respondOperator: async (id, decision) => {
    const payload = get().pendingOperator[id];
    if (!payload) return;
    const refs = operatorRowRefs(id);
    if (refs.length === 0) return;
    const anySubmitting = refs.some((ref) => asDict(ref.row.data).state === "submitting");
    if (anySubmitting) return;
    const dirty = updateOperatorRows(id, {
      state: "submitting",
      finalNote: OPERATOR_SUBMITTING_NOTE,
      retryError: "",
    });
    set({ paneVersions: bumpVersions(get().paneVersions, dirty) });
    const bridge = getDesktopBridge();
    let result: Record<string, unknown> = {};
    if (bridge?.operatorRespond) {
      try {
        result = asDict(await bridge.operatorRespond({ id, decision }));
      } catch (error) {
        result = { ok: false, error: String(error) };
      }
    } else {
      result = { ok: false, error: translate(currentLocale(), "ui.chatStore.error.operatorChannelMissing") };
    }
    if (result.ok === true) {
      const note = operatorFinalNote(decision, currentLocale());
      updateOperatorRows(id, { state: "decided", finalNote: note, retryError: "" });
      const pendingOperator = { ...get().pendingOperator };
      delete pendingOperator[id];
      set({
        pendingOperator,
        paneVersions: bumpVersions(get().paneVersions, dirty),
      });
      refreshQueueAggregate();
      return;
    }
    if (result.expired === true) {
      get().expireOperator(id, asString(result.error) || asString(result.reason));
      return;
    }
    // 可重试（校验驳回/通道瞬时失败）：请求仍 open，两侧解冻并如实示原因。
    updateOperatorRows(id, {
      state: "open",
      finalNote: null,
      retryError: operatorRetryNote(asString(result.error) || translate(currentLocale(), "ui.chatStore.operatorChannelNotAccepted"), currentLocale()),
    });
    set({ paneVersions: bumpVersions(get().paneVersions, dirty) });
  },

  expireOperator: (id, reason) => {
    const roleId = asString(get().pendingOperator[id]?.roleId);
    const pendingOperator = { ...get().pendingOperator };
    delete pendingOperator[id];
    const queuedOperator = { ...get().queuedOperator };
    delete queuedOperator[id];
    const note = operatorExpiredNote(reason, currentLocale());
    const dirty = updateOperatorRows(
      id,
      { state: "expired", finalNote: note, retryError: "" },
      true,
    );
    set({
      pendingOperator,
      queuedOperator,
      paneVersions: bumpVersions(
        get().paneVersions,
        dirty.length ? dirty : roleId ? [roleId] : [],
      ),
    });
    refreshQueueAggregate();
  },

  queueOperator: (payload) => {
    const record = asDict(payload);
    const id = asString(record.id);
    if (!id) return;
    // 仅 trio 出现排队事实（single/未知不出现聚合行；不自行排队/合并/批准）。
    if (get().governanceModel !== "trio") return;
    // 已被呈现的同一 id 不再计入排队。
    if (get().pendingOperator[id]) return;
    set({ queuedOperator: { ...get().queuedOperator, [id]: record } });
    refreshQueueAggregate();
  },

  rowModelDebug: (roleId) => {
    const model = models.get(roleId);
    if (!model) return null;
    const debug = model.debug();
    // 旧 rowList 口径：恢复分隔提示不是历史/实时事实行，不计入 count；operator 索引仍用真实行号。
    const dividers = model.rows.filter(
      (row) => row.kind === "system" && asString(asDict(row.data).cls) === "sys-replay-divider",
    ).length;
    return { ...debug, count: debug.count - dividers };
  },

  paneDebug: (roleId) => {
    const model = models.get(roleId);
    if (!model) return null;
    const meta = get().paneMeta[roleId] || {
      loading: false,
      emptyNote: true,
      contextText: "",
    };
    const rows = model.rows;
    const assistant = rows.filter((row) => row.kind === "assistant").length;
    const queued = (get().queueByRole[roleId] || []).length > 0;
    const busy = get().roleBusy[roleId] === true;
    return {
      inChat: useUiStore.getState().selectedRoleId === roleId,
      empty: rows.length === 0 && !meta.loading && !queued && !busy,
      queue: queued,
      currentWork: busy,
      loading: meta.loading === true,
      loadingText: meta.loading
        ? rows.length === 0 && !busy && !queued
          ? translate(currentLocale(), "ui.chatStore.context.openingSession")
          : translate(currentLocale(), "ui.chatStream.loadingHistory")
        : "",
      note: meta.emptyNote === true,
      noteText: meta.emptyNote
        ? get().roleBusy[roleId]
          ? translate(currentLocale(), "ui.chatStore.context.openedBackground")
          : translate(currentLocale(), "ui.chatStream.empty.openedTitle")
        : "",
      assistant,
      text: [
        ...rows.map(rowText),
        ...(get().queueByRole[roleId] || [])
          .map((item) => asString(item.summary))
          .filter((text) => text !== ""),
      ].join("\n"),
    };
  },
}));

function manualOpenMap(roleId: string): Map<string, boolean> {
  let map = activityManualOpen.get(roleId);
  if (!map) {
    map = new Map<string, boolean>();
    activityManualOpen.set(roleId, map);
  }
  return map;
}

function groupCountMap(roleId: string): Map<string, number> {
  let map = activityGroupCounts.get(roleId);
  if (!map) {
    map = new Map<string, number>();
    activityGroupCounts.set(roleId, map);
  }
  return map;
}

function setSettled(roleId: string, turnId: string): void {
  let set = settledTurnsByRole.get(roleId);
  if (!set) {
    set = new Set<string>();
    settledTurnsByRole.set(roleId, set);
  }
  set.add(turnId);
}

function isExceptionalActivity(item: ActivityItem): boolean {
  return (
    item.exceptional === true ||
    item.denied === true ||
    item.failed === true ||
    item.timedOut === true ||
    item.status === "denied" ||
    item.status === "failed" ||
    item.status === "timed-out"
  );
}

function activityCompatible(groupTurn: string, nextTurn: string): boolean {
  return !(groupTurn && nextTurn && groupTurn !== nextTurn);
}

/** 组默认开合（旧 groupDefaultOpen）：只有「实时、有轮次、未 settle、本角色 busy」展开。 */
function groupDefaultOpen(roleId: string, item: ActivityItem): boolean {
  if (item.origin !== "live") return false;
  const turnId = typeof item.turnId === "string" ? item.turnId : "";
  if (!turnId) return false;
  if (settledTurnsByRole.get(roleId)?.has(turnId)) return false;
  return useChatStore.getState().roleBusy[roleId] === true;
}

/** 追加后同步默认开合；手动开合（true/false）优先，永不被自动状态覆盖。 */
function syncGroupOpen(roleId: string, row: ChatRow, item: ActivityItem): void {
  const data = asDict(row.data);
  if (typeof data.manual === "boolean") return;
  const want = groupDefaultOpen(roleId, item);
  if (data.open !== want) row.data = { ...data, open: want };
}

function groupIdentityFor(item: ActivityItem, turnId: string): string {
  if (item.callId) return "call:" + turnId + "\u0000" + item.callId;
  return [
    "row:" + turnId,
    item.toolName || "",
    item.target || "",
    item.visibleSummary || item.summary || "",
  ].join("\u0000");
}

function nextGroupId(roleId: string, item: ActivityItem, turnId: string): string {
  const identity = groupIdentityFor(item, turnId);
  const counts = groupCountMap(roleId);
  const count = (counts.get(identity) || 0) + 1;
  counts.set(identity, count);
  return "activity:" + identity + ":" + count;
}

/** 同一调用的同一相位去重更新；不同相位追加（渲染时由 mergePhases 并成一行）。 */
function mergeActivityItem(items: ActivityItem[], item: ActivityItem): ActivityItem[] {
  if (item.callId) {
    const index = items.findIndex(
      (candidate) =>
        candidate.callId === item.callId &&
        (candidate.identityPhase || "") === (item.identityPhase || "") &&
        (candidate.turnId || "") === (item.turnId || ""),
    );
    if (index >= 0) {
      const previous = items[index];
      const next = { ...previous, ...item };
      if (!item.target && previous.target) next.target = previous.target;
      const copy = items.slice();
      copy[index] = next;
      return copy;
    }
  }
  // 增量追加沿用同一数组，避免 300 事件风暴下每事件复制增长数组造成无谓 GC。
  // 行更新仍通过新的 row.data 对象传递给 React（memo 以 data 引用比较）。
  items.push(item);
  return items;
}

function appendActivityItem(
  model: RowModel<ChatRow>,
  roleId: string,
  descriptor: NewRowDescriptor,
  item: ActivityItem,
): ChatRow {
  const data = asDict(descriptor.data);
  const group = activityGroupByRole.get(roleId) || null;
  if (group) {
    const groupData = asDict(group.data);
    const groupTurn = asString(groupData.turnId);
    const nextTurn = asString(data.turnId) || (item.turnId || "");
    if (activityCompatible(groupTurn, nextTurn)) {
      const items = mergeActivityItem(
        asArray<ActivityItem>(groupData.items),
        item,
      );
      group.data = {
        ...groupData,
        items,
        turnId: groupTurn || nextTurn,
      };
      syncGroupOpen(roleId, group, item);
      group.height = Math.max(group.height, estimateHeight("activities") + items.length * 12);
      return group;
    }
  }
  const turnId = asString(data.turnId) || item.turnId || "";
  const id = nextGroupId(roleId, item, turnId);
  const manual = manualOpenMap(roleId).has(id) ? manualOpenMap(roleId).get(id)! : null;
  const open = manual !== null ? manual : groupDefaultOpen(roleId, item);
  const row = makeRow({
    ...descriptor,
    data: {
      id,
      items: [item],
      turnId,
      open,
      manual,
    },
  });
  model.append(row);
  activityGroupByRole.set(roleId, row);
  return row;
}

/**
 * 未放行/失败/超时：始终直显一条 `.sys-denied`；若该调用已在本轮连续组内，
 * 其相位仍并入组行（摘要如实计「含 N 条未放行/失败」），组不被切断；
 * 无法关联时切断组，后续普通工具另起一组（旧 appendActivity 同口径）。
 */
function appendExceptionalActivity(
  model: RowModel<ChatRow>,
  roleId: string,
  descriptor: NewRowDescriptor,
  item: ActivityItem,
): ChatRow {
  const group = activityGroupByRole.get(roleId) || null;
  let associated: ChatRow | null = null;
  if (group && item.callId && item.turnId) {
    const groupData = asDict(group.data);
    if (
      asString(groupData.turnId) === item.turnId &&
      asArray<ActivityItem>(groupData.items).some(
        (candidate) => candidate.callId === item.callId,
      )
    ) {
      associated = group;
    }
  }
  let effective = item;
  if (associated) {
    const groupData = asDict(associated.data);
    const groupItems = asArray<ActivityItem>(groupData.items);
    if (!effective.target) {
      const earlier = groupItems.find(
        (candidate) => candidate.callId === effective.callId && candidate.target,
      );
      if (earlier) {
        effective = { ...effective, target: earlier.target };
      }
    }
    const items = mergeActivityItem(groupItems, effective);
    associated.data = { ...groupData, items };
    syncGroupOpen(roleId, associated, effective);
    associated.height = Math.max(
      associated.height,
      estimateHeight("activities") + items.length * 12,
    );
    activityGroupByRole.set(roleId, associated);
  } else {
    activityGroupByRole.set(roleId, null);
  }
  const text =
    effective.deniedSummary ||
    effective.visibleSummary ||
    (effective.summary || "").split(/\r?\n/)[0] ||
    translate(currentLocale(), "ui.chatStore.toolNotApproved", { toolName: effective.toolName });
  const row = makeRow({
    kind: "denied",
    data: { text, target: effective.target || "", activity: effective },
    turnId: descriptor.turnId,
    callId: descriptor.callId,
    replay: descriptor.replay,
  });
  model.append(row);
  return row;
}

/**
 * 推理行：同一 turnId 只保留一行（后续 piece 原地合并，不移动位置）；
 * 首段按 `reasoningInsertIndex` 确定性落位（本回合首个 assistant/tool/终态行之前，
 * 绝不落在「会话结束」之后）；无 turnId 的坏件不合并/不重排，按到达序追加。
 * 幂等由 piece 指纹保证（实时重推/实时＋历史各来一次不会重复拼接或计时）。
 */
function appendReasoningDescriptor(
  model: RowModel<ChatRow>,
  roleId: string,
  descriptor: NewRowDescriptor,
): ChatRow {
  const data = asDict(descriptor.data);
  const turnId = asString(descriptor.turnId);
  if (turnId) {
    const existing = model.rows.find(
      (candidate) =>
        candidate.kind === "reasoning" && asString(candidate.turnId) === turnId,
    );
    if (existing) {
      let merged = asDict(existing.data);
      let changed = false;
      for (const piece of reasoningPiecesFromData(data)) {
        const result = mergeReasoningRowData(merged, piece, currentLocale());
        if (result.changed) {
          merged = result.data;
          changed = true;
        }
      }
      if (changed) {
        existing.data = merged;
        existing.height = Math.max(existing.height || 0, estimateHeight("reasoning"));
      }
      return existing;
    }
  }
  const row = makeRow({
    ...descriptor,
    data: { ...data, pieces: reasoningPiecesFromData(data) },
  });
  if (turnId) {
    const at = reasoningInsertIndex(model.rows, turnId);
    if (at >= model.rows.length) {
      model.append(row);
    } else {
      model.insertAt(at, row);
      if (roleId) anchorsFor(roleId).shiftAfterInsert(at);
    }
  } else {
    model.append(row);
  }
  return row;
}

/** 描述符 → 行追加（工具相位合并、工具组连续分组；operator 由单独入口插入）。 */
function appendDescriptor(
  model: RowModel<ChatRow>,
  descriptor: NewRowDescriptor,
  roleId = "",
): ChatRow {
  // A4：连续同指纹的治理反馈投影合并为一行（×N），不新增重复状态行。
  if (descriptor.kind === "injected") {
    const previous = model.rows[model.rows.length - 1];
    if (previous && previous.kind === "injected") {
      const merged = mergeClientProjectionData(previous.data, descriptor.data);
      if (merged) {
        previous.data = merged;
        previous.height = Math.max(previous.height || 0, estimateHeight("injected"));
        if (roleId) activityGroupByRole.set(roleId, null);
        return previous;
      }
    }
  }
  if (descriptor.kind === "reasoning" && descriptor.data) {
    return appendReasoningDescriptor(model, roleId, descriptor);
  }
  if (descriptor.kind === "turn-terminal") {
    const data = asDict(descriptor.data);
    const turnId = asString(data.turnId) || asString(descriptor.turnId);
    const outcome = asString(data.outcome);
    const text = asString(data.text);
    if (turnId && outcome) {
      let existing: ChatRow | null = null;
      // 同一实际 turn + outcome 只保留一条终态行：先找既有终态（实时先后到达），
      // 再找历史回放留下的 system sys-call 行（history-first 的 denied 行需提升）。
      for (let index = model.rows.length - 1; index >= 0; index -= 1) {
        const candidate = model.rows[index];
        const candidateData = asDict(candidate.data);
        if (
          candidate.kind === "turn-terminal" &&
          asString(candidateData.turnId) === turnId &&
          asString(candidateData.outcome) === outcome
        ) {
          existing = candidate;
          break;
        }
      }
      if (!existing) {
        for (let index = model.rows.length - 1; index >= 0; index -= 1) {
          const candidate = model.rows[index];
          const candidateData = asDict(candidate.data);
          if (
            candidate.kind === "system" &&
            candidate.turnId === turnId &&
            asString(candidateData.cls) === "sys-call" &&
            asString(candidateData.text) === text
          ) {
            existing = candidate;
            break;
          }
        }
      }
      if (existing) {
        const existingData = asDict(existing.data);
        const sources = asArray<Record<string, unknown>>(existingData.sources).map((source) => ({
          kind: asString(source.kind),
          text: asString(source.text),
        }));
        // 历史 system 行被提升时，把历史原文保留为首个来源（不丢事实）。
        const previousText = asString(existingData.text);
        if (previousText && !sources.some((source) => source.text === previousText)) {
          sources.unshift({ kind: existing.kind === "system" ? "history" : "terminal", text: previousText });
        }
        if (text && !sources.some((source) => source.text === text)) {
          sources.push({ kind: asString(descriptor.eventKind) || "terminal", text });
        }
        existing.kind = "turn-terminal";
        existing.data = {
          ...existingData,
          turnId,
          outcome,
          text: sources[0]?.text || text,
          sources,
        };
        existing.height = Math.max(existing.height || 0, estimateHeight("turn-terminal"));
        if (roleId) activityGroupByRole.set(roleId, null);
        return existing;
      }
    }
    const row = makeRow({
      ...descriptor,
      data: {
        ...data,
        turnId,
        outcome,
        sources:
          asArray<Record<string, unknown>>(data.sources).length > 0
            ? data.sources
            : [{ kind: asString(descriptor.eventKind) || "terminal", text }],
      },
      turnId: turnId || descriptor.turnId,
    });
    model.append(row);
    if (roleId) activityGroupByRole.set(roleId, null);
    return row;
  }
  if (descriptor.kind === "injected") {
    const data = asDict(descriptor.data);
    if (asString(data.kind) === "system-notice") {
      // 系统通知与用户正文分离：通知独立 sys-notice 行，空行后的用户正文另起普通用户行。
      const noticeText = asString(data.displayBody) || asString(data.body);
      const row = makeRow({
        ...descriptor,
        data: { ...data, body: noticeText, displayBody: noticeText },
      });
      model.append(row);
      const remainder = asString(data.remainder);
      if (remainder !== "") {
        model.append(
          makeRow({
            kind: "user",
            data: { text: remainder },
            turnId: descriptor.turnId,
            replay: descriptor.replay,
          }),
        );
      }
      if (roleId) activityGroupByRole.set(roleId, null);
      return row;
    }
  }
  if (descriptor.kind === "tool-lifecycle" && descriptor.data) {
    // display v1 生命周期：同一 callId（带 turnId 时同 turn）的 start/result/blocked 并成一行，
    // 行序按首相位、标签按到达序连接（旧 tool-rows 同口径）；不同 callId 各占一行。
    const data = asDict(descriptor.data);
    const activity = asDict(data.activity) as unknown as ActivityItem;
    const callId = asString(activity.callId) || descriptor.callId || "";
    const turnId = asString(activity.turnId) || descriptor.turnId || "";
    const stage =
      activity.identityPhase === "start" ||
      activity.identityPhase === "result" ||
      activity.identityPhase === "blocked"
        ? activity.identityPhase
        : "result";
    // card-first：交互卡已存在时，同一 toolCallId 的生命周期并入卡内，不再产生独立工具行。
    if (roleId && callId) {
      const operator = model.rows.find(
        (candidate) =>
          candidate.kind === "operator" &&
          candidate.callId === callId &&
          (!turnId || !candidate.turnId || candidate.turnId === turnId),
      );
      if (operator) {
        const operatorData = asDict(operator.data);
        const lifecycle = asDict(operatorData.toolLifecycle);
        const stages = { ...asDict(lifecycle.stages) };
        const previousResult = asDict(stages.result) as unknown as ActivityItem;
        const keepFailedResult =
          stage === "result" &&
          previousResult.failed === true &&
          activity.failed !== true &&
          activity.completed === true;
        if (!keepFailedResult) {
          stages[stage] = activity;
          operator.data = {
            ...operatorData,
            toolLifecycle: {
              ...lifecycle,
              stages,
              activity:
                (stages.result as ActivityItem | undefined) ||
                (stages.blocked as ActivityItem | undefined) ||
                (stages.start as ActivityItem | undefined) ||
                activity,
              callId,
              turnId,
            },
          };
          operator.height = Math.max(operator.height || 0, estimateHeight("tool-lifecycle"));
        }
        if (roleId) activityGroupByRole.set(roleId, null);
        return operator;
      }
    }
    let existing: ChatRow | null = null;
    // 带旧回放锚点的请求/结论行保持独立（旧锚点表 + 卡插入位）；实时生命周期才合并。
    const anchoredReplay = descriptor.replay === true && !!descriptor.anchorKey;
    if (callId && !anchoredReplay) {
      for (let index = model.rows.length - 1; index >= 0; index -= 1) {
        const candidate = model.rows[index];
        if (candidate.kind !== "tool-lifecycle") continue;
        const candidateData = asDict(candidate.data);
        if (asString(candidateData.callId) !== callId) continue;
        if (asString(candidateData.turnId) !== turnId) continue;
        existing = candidate;
        break;
      }
    }
    if (existing) {
      const existingData = asDict(existing.data);
      const existingStages = asDict(existingData.stages);
      const previousResult = asDict(existingStages.result) as unknown as ActivityItem;
      const keepFailedResult =
        stage === "result" &&
        previousResult.failed === true &&
        activity.failed !== true &&
        activity.completed === true;
      if (keepFailedResult) {
        return existing;
      }
      const stages = {
        ...existingStages,
        [stage]: activity,
      };
      const terminal =
        (stages.result as ActivityItem | undefined) ||
        (stages.blocked as ActivityItem | undefined) ||
        (stages.start as ActivityItem | undefined) ||
        activity;
      existing.data = {
        ...existingData,
        stages,
        activity: terminal,
      };
      existing.height = Math.max(existing.height, estimateHeight("tool-lifecycle"));
      if (roleId) activityGroupByRole.set(roleId, null);
      return existing;
    }
    const row = makeRow({
      ...descriptor,
      data: { stages: { [stage]: activity }, activity, callId, turnId },
    });
    model.append(row);
    if (roleId) activityGroupByRole.set(roleId, null);
    return row;
  }
  if (descriptor.kind === "activities" && descriptor.data) {
    const data = asDict(descriptor.data);
    const items = asArray<ActivityItem>(data.items);
    const exceptional = items.find(isExceptionalActivity);
    if (exceptional) {
      return appendExceptionalActivity(model, roleId, descriptor, exceptional);
    }
    if (items.length > 0) {
      let last: ChatRow | null = null;
      for (const item of items) {
        last = appendActivityItem(model, roleId, descriptor, item);
      }
      return last as ChatRow;
    }
  }
  if (descriptor.kind === "denied" && descriptor.data) {
    const data = asDict(descriptor.data);
    const activity = asDict(data.activity) as unknown as ActivityItem;
    if (typeof activity.toolName === "string" && activity.toolName !== "") {
      return appendExceptionalActivity(model, roleId, descriptor, activity);
    }
  }
  const row = makeRow(descriptor);
  model.append(row);
  // 非工具行（助手/系统/卡片/独立未放行）切断连续工具组。
  if (roleId) activityGroupByRole.set(roleId, null);
  return row;
}

/**
 * 判断结果行：按 `roleId` 落 pane、按 `toolCallId` 锚定到该调用行之后；定位不到追加流尾（不丢行）。
 * 同一 id 重复到达幂等；`manual` 已在上层被过滤（不产生结果行）。
 */
function appendJudgeResultRow(
  payload: Record<string, unknown>,
  view: { toolCallId: string },
  kind: "judge-result" | "governance-judge-result",
): void {
  const projectRoot = asString(payload.projectRoot);
  if (projectRoot && projectRoot !== useChatStore.getState().projectRoot) return;
  const runtime = asString(payload.runtime);
  if (runtime && runtime !== useUiStore.getState().runtime) return;
  const roleId = asString(payload.roleId);
  if (!roleId) return;
  const key = asString(payload.id);
  if (key && judgeResultIds.has(key)) return;
  if (key) judgeResultIds.add(key);
  const model = modelFor(roleId);
  const toolCallId = view.toolCallId;
  const at = toolCallId ? model.indexOfCallId(toolCallId) : -1;
  const row = makeRow({
    kind,
    data: { view },
    turnId: asString(payload.turnId) || undefined,
    callId: toolCallId || undefined,
  });
  if (at >= 0) model.insertAt(at + 1, row);
  else model.append(row);
  useChatStore.setState({
    paneVersions: bumpVersions(useChatStore.getState().paneVersions, [roleId]),
  });
}

function foldActivityGroups(roleId: string, turnId: string): boolean {
  if (!turnId) return false;
  const model = models.get(roleId);
  if (!model) return false;
  let changed = false;
  const canInspectDom = typeof document !== "undefined";
  for (const row of model.rows) {
    if (row.kind !== "activities") continue;
    const data = asDict(row.data);
    if (asString(data.turnId) !== turnId) continue;
    if (data.open !== true || typeof data.manual === "boolean") continue;
    if (canInspectDom) {
      const element = document.querySelector(`[data-row-id="${row.id}"]`);
      if (element && element.contains(document.activeElement)) continue;
    }
    row.data = { ...data, open: false };
    changed = true;
  }
  return changed;
}

export function getRowModel(roleId: string): RowModel<ChatRow> | null {
  return models.get(roleId) || null;
}

/** `replayAnchorDebug(roleId)`：每角色锚点表（无表返回 []）。 */
export function getReplayAnchors(roleId: string): Array<{
  anchorKey: string;
  requestIndex: number | null;
  conclusionIndex: number | null;
  rowsAtReplay: number;
}> {
  const table = anchorsByRole.get(roleId);
  return table ? table.entries() : [];
}

export function getPendingHistories(): ReadonlyArray<Record<string, unknown>> {
  return pendingHistories;
}
