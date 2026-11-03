/// <reference lib="dom" />
/**
 * 客户授权平面 C2：渲染侧指令状态与纯视图（customer-authorization-plane）。
 *
 * 纪律：
 *  - 主进程是唯一权威：本 store 只保存 C1 冻结载荷（`directive:confirm-request` /
 *    `directive:state` / `directive:list` / `directive:revoke` / `directive:confirm-response`）的投影；
 *  - 不判 target、不重算高危、不写账本、不新增 IPC、不访问文件系统；
 *  - `directivesEnabled` 首帧 false，必须由主进程先行 handshake 或 `directive:list` 成功后才抑制回显；
 *  - 旧 preload（五方法任一缺失）⇒ `capabilityAvailable=false`，普通聊天逐字不变；
 *  - 用户可见文案只经 A3 冻结 key（本文件只产出 key/参数，不产出中文文案）。
 *
 * 纯视图函数与 store 同文件：`node --test test/桌面UI/*.test.ts` 直接导入（不启动 DOM）。
 */

import { create } from "zustand";
import { parseDirectiveMarker } from "../../../../src/model/directive-marker.ts";
import type { MessageKey } from "../i18n/index.ts";

/**
 * C1 冻结的五个 preload 白名单方法（C2 只消费）。
 *
 * 定义放在本 store（`chat/ipc.ts` 会重导出并在该文件内做结构断言/窄化）：
 * 渲染层 `lib/platform.ts` 不在 C2 写集，且 root `typecheck` 会把 store 的
 * type-only 依赖一并纳入（不含 `@/` alias）；把接口留在 store 可让 Node 单测
 * 与双端 typecheck 同时成立，不弱化类型。
 */
export interface DirectiveBridge {
  onDirectiveConfirmRequest: (callback: (payload: unknown) => void) => () => void;
  directiveConfirmRespond: (input: unknown) => Promise<unknown>;
  listDirectives: (input: unknown) => Promise<unknown>;
  revokeDirective: (input: unknown) => Promise<unknown>;
  onDirectiveState: (callback: (payload: unknown) => void) => () => void;
}

export type DirectiveTarget = "approval" | "decision";
export type DirectiveUntil = "once" | "session" | "forever";
export type DirectiveStatus = "active" | "consumed" | "revoked" | "expired";
export type DirectiveConsumer = "shell-gate" | "decision-card" | "none";
export type DirectiveRuntime = "pi" | "codex" | "claude";

/** A1 标记常量按数据渲染（i18n 模板占位符 `{approvalMarker}`/`{decisionMarker}`）。 */
export const DIRECTIVE_APPROVAL_MARKER = "@\u5ba1\u6279";
export const DIRECTIVE_DECISION_MARKER = "@\u51b3\u7b56";

/** 撤销语法关键词（机器匹配；不是用户可见文案）。 */
const REVOKE_KEYWORD = "\u64a4\u9500";

export const DIRECTIVE_RUNTIMES: readonly DirectiveRuntime[] = ["pi", "codex", "claude"];

export function isDirectiveRuntime(value: unknown): value is DirectiveRuntime {
  return value === "pi" || value === "codex" || value === "claude";
}

export interface DirectiveScopeView {
  flowId?: string;
}

export type DirectiveResourceView =
  | { type: "shell"; command: string; cwd: string }
  | { type: "domain"; host: string; wildcard: boolean }
  | { type: "path"; path: string };

export type DirectiveActionView =
  | { kind: "allow"; resource: DirectiveResourceView }
  | { kind: "deny"; resource: DirectiveResourceView }
  | { kind: "select-recommended" }
  | { kind: "select-option"; selector: string }
  | { kind: "reject" };

export interface DirectiveItemView {
  id: string;
  target: DirectiveTarget;
  action: DirectiveActionView;
  scope: DirectiveScopeView;
  until: DirectiveUntil;
  status: DirectiveStatus;
  createdAt: string;
  consumer: DirectiveConsumer;
}

export interface DirectiveListView {
  active: DirectiveItemView[];
  consumed: DirectiveItemView[];
  revoked: DirectiveItemView[];
  expired: DirectiveItemView[];
}

export interface DirectiveConfirmRequestView {
  id: string;
  target: DirectiveTarget;
  rawText: string;
  projectRoot: string;
  roleId: string;
  runtime?: DirectiveRuntime;
  prefill: {
    action: DirectiveActionView;
    scope: DirectiveScopeView;
    until: DirectiveUntil;
    unrecognized: string[];
  };
  highRisk: { reasons: string[] };
  confirmable: boolean;
  decisionGroupEnabled: boolean;
}

export interface DirectiveStateView {
  directivesEnabled: boolean;
  projectRoot: string;
  approval: DirectiveListView;
  decision: DirectiveListView;
  ledgerErrors: number;
}

export interface DirectiveCardEntry {
  expanded: boolean;
  text: string;
  submitting: boolean;
  status: { key: MessageKey | null; text: string };
}

const EMPTY_CARD_ENTRY: DirectiveCardEntry = Object.freeze({
  expanded: false,
  text: "",
  submitting: false,
  status: { key: null, text: "" },
});

export function cardEntryFor(
  entries: Record<string, DirectiveCardEntry>,
  cardId: string,
): DirectiveCardEntry {
  return entries[cardId] ?? EMPTY_CARD_ENTRY;
}

export function emptyDirectiveList(): DirectiveListView {
  return { active: [], consumed: [], revoked: [], expired: [] };
}

// —————————————————————— 结构断言/窄化（不弱化类型、不使用 any） ——————————————————————

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asDirectiveResource(value: unknown): DirectiveResourceView | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.type === "shell" && typeof record.command === "string") {
    return { type: "shell", command: record.command, cwd: asString(record.cwd) };
  }
  if (record.type === "domain" && typeof record.host === "string") {
    return { type: "domain", host: record.host, wildcard: record.wildcard === true };
  }
  if (record.type === "path" && typeof record.path === "string") {
    return { type: "path", path: record.path };
  }
  return null;
}

export function asDirectiveAction(value: unknown): DirectiveActionView | null {
  const record = asRecord(value);
  if (!record) return null;
  switch (record.kind) {
    case "allow":
    case "deny": {
      const resource = asDirectiveResource(record.resource);
      return resource ? { kind: record.kind, resource } : null;
    }
    case "select-recommended":
      return { kind: "select-recommended" };
    case "select-option":
      return typeof record.selector === "string"
        ? { kind: "select-option", selector: record.selector }
        : null;
    case "reject":
      return { kind: "reject" };
    default:
      return null;
  }
}

export function asDirectiveScope(value: unknown): DirectiveScopeView | null {
  if (value === undefined) return {};
  const record = asRecord(value);
  if (!record) return null;
  if (record.flowId === undefined) return {};
  return typeof record.flowId === "string" ? { flowId: record.flowId } : null;
}

function asDirectiveUntil(value: unknown): DirectiveUntil | null {
  return value === "once" || value === "session" || value === "forever"
    ? value
    : null;
}

function asDirectiveStatus(value: unknown): DirectiveStatus | null {
  return value === "active" ||
    value === "consumed" ||
    value === "revoked" ||
    value === "expired"
    ? value
    : null;
}

function asDirectiveConsumer(value: unknown): DirectiveConsumer | null {
  return value === "shell-gate" ||
    value === "decision-card" ||
    value === "none"
    ? value
    : null;
}

function asDirectiveTarget(value: unknown): DirectiveTarget | null {
  return value === "approval" || value === "decision" ? value : null;
}

function asDirectiveItem(value: unknown): DirectiveItemView | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const target = asDirectiveTarget(record.target);
  const action = asDirectiveAction(record.action);
  const scope = asDirectiveScope(record.scope);
  const until = asDirectiveUntil(record.until);
  const status = asDirectiveStatus(record.status);
  const consumer = asDirectiveConsumer(record.consumer);
  const createdAt = asString(record.createdAt);
  if (!id || !target || !action || !scope || !until || !status || !consumer) {
    return null;
  }
  return { id, target, action, scope, until, status, createdAt, consumer };
}

export function asDirectiveListView(
  value: unknown,
  expectedTarget?: DirectiveTarget,
): DirectiveListView | null {
  const record = asRecord(value);
  if (!record) return null;
  const buckets = ["active", "consumed", "revoked", "expired"] as const;
  const list = emptyDirectiveList();
  for (const bucket of buckets) {
    const raw = record[bucket];
    if (!Array.isArray(raw)) return null;
    for (const item of raw) {
      const parsed = asDirectiveItem(item);
      if (!parsed) continue;
      if (expectedTarget && parsed.target !== expectedTarget) continue;
      list[bucket].push(parsed);
    }
  }
  return list;
}

export function asDirectiveConfirmRequest(
  value: unknown,
): DirectiveConfirmRequestView | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.version !== 1) return null;
  const request = asRecord(record.request);
  if (!request) return null;
  const id = asString(request.id);
  const target = asDirectiveTarget(request.target);
  const rawText = asString(request.rawText);
  const projectRoot = asString(request.projectRoot);
  const roleId = asString(request.roleId);
  const prefill = asRecord(request.prefill);
  const highRisk = asRecord(request.highRisk);
  if (!id || !target || !projectRoot || !roleId || !prefill || !highRisk) {
    return null;
  }
  const action = asDirectiveAction(prefill.action);
  const scope = asDirectiveScope(prefill.scope);
  const until = asDirectiveUntil(prefill.until);
  if (!action || !scope || !until) return null;
  if (typeof request.confirmable !== "boolean") return null;
  if (typeof request.decisionGroupEnabled !== "boolean") return null;
  const runtime = request.runtime;
  if (runtime !== undefined && !isDirectiveRuntime(runtime)) return null;
  return {
    id,
    target,
    rawText,
    projectRoot,
    roleId,
    ...(runtime !== undefined ? { runtime } : {}),
    prefill: {
      action,
      scope,
      until,
      unrecognized: asStringArray(prefill.unrecognized),
    },
    highRisk: { reasons: asStringArray(highRisk.reasons) },
    confirmable: request.confirmable,
    decisionGroupEnabled: request.decisionGroupEnabled,
  };
}

export function asDirectiveStateView(value: unknown): DirectiveStateView | null {
  const record = asRecord(value);
  if (!record || record.version !== 1) return null;
  if (record.directivesEnabled !== true) return null;
  const projectRoot = asString(record.projectRoot);
  const approval = asDirectiveListView(record.approval, "approval");
  const decision = asDirectiveListView(record.decision, "decision");
  const ledgerErrors = record.ledgerErrors;
  if (!approval || !decision || typeof ledgerErrors !== "number") return null;
  return { directivesEnabled: true, projectRoot, approval, decision, ledgerErrors };
}

export function asDirectiveListReply(value: unknown): DirectiveStateView | null {
  const record = asRecord(value);
  if (!record || record.ok !== true) return null;
  return asDirectiveStateView(value);
}

// —————————————————————— 文案 key 映射（只消费 A3 冻结 key） ——————————————————————

const STATUS_KEYS: Record<DirectiveStatus, MessageKey> = {
  active: "ui.directive.panel.status.active",
  consumed: "ui.directive.panel.status.consumed",
  revoked: "ui.directive.panel.status.revoked",
  expired: "ui.directive.panel.status.expired",
};

const CONSUMER_KEYS: Record<DirectiveConsumer, MessageKey> = {
  "shell-gate": "ui.directive.panel.consumer.shellGate",
  "decision-card": "ui.directive.panel.consumer.decisionCard",
  none: "ui.directive.panel.consumer.none",
};

const UNTIL_KEYS: Record<DirectiveUntil, MessageKey> = {
  once: "ui.directive.panel.until.once",
  session: "ui.directive.panel.until.session",
  forever: "ui.directive.panel.until.forever",
};

const HIGH_RISK_KEYS: Record<string, MessageKey> = {
  forever: "ui.directive.highRisk.forever",
  "project-decision-reject": "ui.directive.highRisk.projectReject",
  "project-decision-select-option": "ui.directive.highRisk.projectSelect",
  "wildcard-domain": "ui.directive.highRisk.wildcardDomain",
  "wide-path": "ui.directive.highRisk.broadPath",
  "wide-command": "ui.directive.highRisk.broadCommand",
  "switch-off-project-recommended": "ui.directive.highRisk.switchOffProjectSelect",
};

export function statusLabelKey(status: DirectiveStatus): MessageKey {
  return STATUS_KEYS[status];
}

export function consumerLabelKey(consumer: DirectiveConsumer): MessageKey {
  return CONSUMER_KEYS[consumer];
}

export function untilLabelKey(until: DirectiveUntil): MessageKey {
  return UNTIL_KEYS[until];
}

/** 期限提示：只有失效的 once 与 active 的 session/forever 给额外说明；其余为空。 */
export function untilHintKey(
  until: DirectiveUntil,
  status: DirectiveStatus,
): MessageKey | null {
  if (status === "expired" && until === "once") {
    return "ui.directive.panel.until.onceUnusedHint";
  }
  if (status !== "active") return null;
  if (until === "session") return "ui.directive.panel.until.sessionHint";
  if (until === "forever") return "ui.directive.panel.until.foreverHint";
  return null;
}

export function directiveTargetTitleKey(target: DirectiveTarget): MessageKey {
  return target === "approval"
    ? "ui.directive.dialog.titleApproval"
    : "ui.directive.dialog.titleDecision";
}

function actionKey(target: DirectiveTarget, action: DirectiveActionView): MessageKey {
  if (action.kind === "allow") return "ui.directive.dialog.action.allow";
  if (action.kind === "deny") return "ui.directive.dialog.action.reject";
  if (action.kind === "select-recommended") {
    return "ui.directive.dialog.action.selectRecommended";
  }
  if (action.kind === "select-option") {
    return "ui.directive.dialog.action.selectOption";
  }
  return "ui.directive.dialog.action.reject";
}

function actionDetail(action: DirectiveActionView): string {
  return action.kind === "select-option" ? action.selector : "";
}

function resourceView(
  action: DirectiveActionView,
): { key: MessageKey; params: Record<string, string>; noteKey: MessageKey | null } | null {
  if (action.kind !== "allow" && action.kind !== "deny") return null;
  const resource = action.resource;
  if (resource.type === "shell") {
    return {
      key: "ui.directive.dialog.resource.shell",
      params: { command: resource.command },
      noteKey: null,
    };
  }
  if (resource.type === "domain") {
    return {
      key: "ui.directive.dialog.resource.domain",
      params: { host: resource.host },
      // Q5 A：domain/path 只记录、当前版本无消费者；用 A3 冻结的如实状态文案。
      noteKey: "main.directive.receipt.noConsumerSuffix",
    };
  }
  return {
    key: "ui.directive.dialog.resource.path",
    params: { path: resource.path },
    noteKey: "main.directive.receipt.noConsumerSuffix",
  };
}

function scopeView(
  target: DirectiveTarget,
  scope: DirectiveScopeView,
): {
  key: MessageKey;
  params: Record<string, string>;
  noteKey: MessageKey | null;
} {
  if (target === "decision" && scope.flowId) {
    return {
      key: "ui.directive.dialog.scope.flow",
      params: { flowId: scope.flowId },
      noteKey: null,
    };
  }
  if (target === "decision") {
    return {
      key: "ui.directive.dialog.scope.allFlows",
      params: {},
      noteKey: "ui.directive.dialog.scope.projectNote",
    };
  }
  return {
    key: "ui.directive.dialog.scope.project",
    params: {},
    noteKey: "ui.directive.dialog.scope.projectNote",
  };
}

export interface DirectiveDialogHighRiskView {
  key: MessageKey;
  params: Record<string, string>;
}

export interface DirectiveDialogView {
  titleKey: MessageKey;
  rawText: string;
  isRevoke: boolean;
  revokeTarget: string;
  actionKey: MessageKey;
  actionDetail: string;
  scopeKey: MessageKey;
  scopeParams: Record<string, string>;
  scopeNoteKey: MessageKey | null;
  resourceKey: MessageKey | null;
  resourceParams: Record<string, string>;
  resourceNoteKey: MessageKey | null;
  untilKey: MessageKey;
  highRisk: DirectiveDialogHighRiskView[];
  highRiskVisible: boolean;
  unrecognized: string[];
  confirmable: boolean;
  decisionGroupEnabled: boolean;
}

/** 输入式撤销识别：只认 C1 冻结语法（`<marker> <revokeKeyword> #d-<seq>`）。 */
export function directiveRevokeTarget(request: DirectiveConfirmRequestView): string {
  const hit = parseDirectiveMarker(request.rawText);
  const body = (hit ? hit.body : "").trim();
  const candidate = body || request.prefill.unrecognized.join(" ").trim();
  if (!candidate.startsWith(REVOKE_KEYWORD)) return "";
  const match = /#\s*(d-[1-9][0-9]*)\s*$/.exec(candidate);
  return match ? match[1]! : "";
}

export function directiveDialogView(
  request: DirectiveConfirmRequestView,
): DirectiveDialogView {
  const revokeTarget = directiveRevokeTarget(request);
  const isRevoke = revokeTarget !== "";
  const scope = scopeView(request.target, request.prefill.scope);
  const resource = isRevoke ? null : resourceView(request.prefill.action);
  const highRisk = request.highRisk.reasons.map(
    (reason): DirectiveDialogHighRiskView => {
      const known = HIGH_RISK_KEYS[reason];
      if (known === undefined) {
        return { key: "ui.directive.highRisk.unknown", params: { reason } };
      }
      return { key: known, params: {} };
    },
  );
  return {
    titleKey: directiveTargetTitleKey(request.target),
    rawText: request.rawText,
    isRevoke,
    revokeTarget: revokeTarget ? "#" + revokeTarget : "",
    actionKey: isRevoke
      ? "ui.directive.dialog.action.revoke"
      : actionKey(request.target, request.prefill.action),
    actionDetail: isRevoke ? "" : actionDetail(request.prefill.action),
    scopeKey: scope.key,
    scopeParams: scope.params,
    scopeNoteKey: scope.noteKey,
    resourceKey: resource ? resource.key : null,
    resourceParams: resource ? resource.params : {},
    resourceNoteKey: resource ? resource.noteKey : null,
    untilKey: untilLabelKey(request.prefill.until),
    highRisk,
    highRiskVisible: highRisk.length > 0,
    unrecognized: request.prefill.unrecognized,
    confirmable: request.confirmable,
    decisionGroupEnabled: request.decisionGroupEnabled,
  };
}

export function directiveConfirmValues(
  request: DirectiveConfirmRequestView,
  acknowledged: boolean,
): {
  action: DirectiveActionView;
  scope: DirectiveScopeView;
  until: DirectiveUntil;
  acknowledged?: true;
} {
  return {
    action: request.prefill.action,
    scope: request.prefill.scope,
    until: request.prefill.until,
    ...(acknowledged ? { acknowledged: true as const } : {}),
  };
}

export interface DirectiveRowView {
  actionKey: MessageKey;
  actionDetail: string;
  scopeKey: MessageKey;
  scopeParams: Record<string, string>;
  resourceKey: MessageKey | null;
  resourceParams: Record<string, string>;
  resourceNoteKey: MessageKey | null;
  untilKey: MessageKey;
  untilHintKey: MessageKey | null;
  statusKey: MessageKey;
  consumerKey: MessageKey;
  canRevoke: boolean;
}

export function directiveRowView(item: DirectiveItemView): DirectiveRowView {
  const scope = scopeView(item.target, item.scope);
  const resource = resourceView(item.action);
  return {
    actionKey: actionKey(item.target, item.action),
    actionDetail: actionDetail(item.action),
    scopeKey: scope.key,
    scopeParams: scope.params,
    resourceKey: resource ? resource.key : null,
    resourceParams: resource ? resource.params : {},
    resourceNoteKey: resource ? resource.noteKey : null,
    untilKey: untilLabelKey(item.until),
    untilHintKey: untilHintKey(item.until, item.status),
    statusKey: statusLabelKey(item.status),
    consumerKey: consumerLabelKey(item.consumer),
    canRevoke: item.status === "active",
  };
}

export function groupDirectiveList(list: DirectiveListView): {
  active: DirectiveItemView[];
  history: DirectiveItemView[];
} {
  return {
    active: list.active,
    history: [...list.consumed, ...list.revoked, ...list.expired],
  };
}

// —————————————————————— AC-22 卡内入口 target 校验（严格 fail-closed） ——————————————————————

export interface CardDirectiveTargetView {
  projectRoot: string | null;
  runtime: string;
}

export type CardDirectiveTargetResult =
  | {
      ok: true;
      target: { projectRoot: string; roleId: string; runtime: DirectiveRuntime };
    }
  | { ok: false };

/**
 * 卡内入口的唯一 target 来源 = 卡载荷 `{projectRoot,roleId,runtime}`。
 * 任一缺失/非法/跨项目（或 runtime 与当前视图不一致）⇒ fail-closed；不回退“当前选择”。
 */
export function cardDirectiveTarget(
  payload: unknown,
  view: CardDirectiveTargetView,
): CardDirectiveTargetResult {
  const record = asRecord(payload);
  if (!record) return { ok: false };
  const projectRoot = asString(record.projectRoot);
  const roleId = asString(record.roleId);
  const runtime = record.runtime;
  if (!projectRoot || !roleId || !isDirectiveRuntime(runtime)) return { ok: false };
  if (view.projectRoot === null || projectRoot !== view.projectRoot) return { ok: false };
  if (runtime !== view.runtime) return { ok: false };
  return { ok: true, target: { projectRoot, roleId, runtime } };
}

// —————————————————————— store ——————————————————————

export interface DirectiveStoreState {
  capabilityAvailable: boolean;
  directivesEnabled: boolean;
  projectRoot: string | null;
  pending: DirectiveConfirmRequestView | null;
  dialogAcknowledged: boolean;
  approval: DirectiveListView;
  decision: DirectiveListView;
  ledgerErrors: number;
  listLoaded: boolean;
  initialReadDone: boolean;
  busy: boolean;
  errorKey: MessageKey | null;
  errorText: string;
  panelOpen: boolean;
  cardEntries: Record<string, DirectiveCardEntry>;

  attachBridge: (bridge: DirectiveBridge | null) => void;
  setProjectRoot: (projectRoot: string | null) => void;
  applyState: (payload: unknown) => void;
  receiveConfirmRequest: (payload: unknown) => void;
  setDialogAcknowledged: (acknowledged: boolean) => void;
  respondConfirm: (decision: "confirm" | "cancel") => Promise<void>;
  refresh: () => Promise<void>;
  ensureInitialRead: (projectRoot: string | null, timeoutMs?: number) => Promise<void>;
  revoke: (
    id: string,
    target: DirectiveTarget,
    context?: { roleId?: string; runtime?: DirectiveRuntime },
  ) => Promise<void>;
  clearProject: (previousRoot: string | null, nextRoot: string | null) => void;
  openPanel: () => void;
  closePanel: () => void;
  setCardEntryExpanded: (cardId: string, expanded: boolean) => void;
  setCardEntryText: (cardId: string, text: string) => void;
  collapseCardEntry: (cardId: string) => void;
  submitFromCardEntry: (input: {
    cardId: string;
    rawText: string;
    payload: unknown;
    view: CardDirectiveTargetView;
    sendSession?: (...args: unknown[]) => Promise<unknown>;
  }) => Promise<void>;
}

let attachedBridge: DirectiveBridge | null = null;
let initialReadPromise: Promise<void> | null = null;

export const DIRECTIVE_INITIAL_READ_TIMEOUT_MS = 750;

function errorFrom(res: Record<string, unknown>, fallback: MessageKey): {
  errorKey: MessageKey | null;
  errorText: string;
} {
  const text = typeof res.error === "string" ? res.error : "";
  return text !== ""
    ? { errorKey: null, errorText: text }
    : { errorKey: fallback, errorText: "" };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "cmid-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function updateEntry(
  entries: Record<string, DirectiveCardEntry>,
  cardId: string,
  patch: Partial<DirectiveCardEntry>,
): Record<string, DirectiveCardEntry> {
  const current = entries[cardId] ?? EMPTY_CARD_ENTRY;
  return { ...entries, [cardId]: { ...current, ...patch } };
}

export const useDirectiveStore = create<DirectiveStoreState>((set, get) => {
  const applyListReply = (reply: DirectiveStateView, root: string | null): void => {
    const sameProject =
      reply.projectRoot === "" || root === null || reply.projectRoot === root;
    set({
      capabilityAvailable: true,
      directivesEnabled: true,
      ...(sameProject
        ? {
            approval: reply.approval,
            decision: reply.decision,
            ledgerErrors: reply.ledgerErrors,
            projectRoot: reply.projectRoot === "" ? root : reply.projectRoot,
            listLoaded: true,
          }
        : {}),
      errorKey: null,
      errorText: "",
    });
  };

  return {
    capabilityAvailable: false,
    directivesEnabled: false,
    projectRoot: null,
    pending: null,
    dialogAcknowledged: false,
    approval: emptyDirectiveList(),
    decision: emptyDirectiveList(),
    ledgerErrors: 0,
    listLoaded: false,
    initialReadDone: false,
    busy: false,
    errorKey: null,
    errorText: "",
    panelOpen: false,
    cardEntries: {},

    attachBridge: (bridge) => {
      attachedBridge = bridge;
      set({ capabilityAvailable: bridge !== null });
    },

    setProjectRoot: (projectRoot) => {
      set({ projectRoot });
    },

    applyState: (payload) => {
      const state = asDirectiveStateView(payload);
      if (!state) return;
      const root = get().projectRoot;
      // 旧项目迟到推送按 projectRoot 丢弃（只更新能力位，不串项目列表）。
      applyListReply(state, root);
    },

    receiveConfirmRequest: (payload) => {
      const request = asDirectiveConfirmRequest(payload);
      if (!request) return;
      const root = get().projectRoot;
      if (root !== null && request.projectRoot !== root) return;
      const current = get().pending;
      const same = current !== null && current.id === request.id;
      set({
        capabilityAvailable: true,
        directivesEnabled: true,
        pending: request,
        dialogAcknowledged: same ? get().dialogAcknowledged : false,
        errorKey: null,
        errorText: "",
      });
    },

    setDialogAcknowledged: (acknowledged) => {
      set({ dialogAcknowledged: acknowledged, errorKey: null, errorText: "" });
    },

    respondConfirm: async (decision) => {
      const state = get();
      const request = state.pending;
      if (!request || state.busy) return;
      if (!attachedBridge) {
        set({ errorKey: "ui.directive.error.capabilityUnavailable", errorText: "" });
        return;
      }
      if (decision === "confirm") {
        if (!request.confirmable) {
          set({ errorKey: "ui.directive.error.incompleteParse", errorText: "" });
          return;
        }
        if (request.highRisk.reasons.length > 0 && !state.dialogAcknowledged) {
          set({ errorKey: "ui.directive.error.highRiskUnacknowledged", errorText: "" });
          return;
        }
      }
      set({ busy: true, errorKey: null, errorText: "" });
      try {
        const res = asRecord(
          await attachedBridge.directiveConfirmRespond(
            decision === "confirm"
              ? {
                  id: request.id,
                  decision: "confirm",
                  values: directiveConfirmValues(request, state.dialogAcknowledged),
                }
              : { id: request.id, decision: "cancel" },
          ),
        ) ?? {};
        if (res.ok === true || res.expired === true) {
          // 过期 = 该面板已不可能被受理：本地收起（fail-closed，不伪造回执）。
          set({
            pending: null,
            dialogAcknowledged: false,
            busy: false,
            errorKey: null,
            errorText: "",
            // 确认/取消/过期后清空卡内入口状态（含“确认对话框已打开”），避免陈旧提示。
            cardEntries: {},
          });
          if (res.ok === true) void get().refresh();
          return;
        }
        const failure = errorFrom(res, "ui.directive.error.writeFailed");
        set({ busy: false, ...failure });
      } catch {
        set({
          busy: false,
          errorKey: "ui.directive.error.writeFailed",
          errorText: "",
        });
      }
    },

    refresh: async () => {
      const bridge = attachedBridge;
      if (!bridge) {
        set({ capabilityAvailable: false, errorKey: "ui.directive.error.capabilityUnavailable", errorText: "" });
        return;
      }
      const root = get().projectRoot;
      set({ busy: true, errorKey: null, errorText: "" });
      let raw: unknown = null;
      try {
        raw = await bridge.listDirectives(root ? { projectRoot: root } : {});
      } catch {
        set({
          errorKey: "ui.directive.error.panelUnavailable",
          errorText: "",
          listLoaded: false,
          busy: false,
        });
        return;
      }
      try {
        const reply = asDirectiveListReply(raw);
        if (reply) {
          applyListReply(reply, root);
        } else {
          const record = asRecord(raw) ?? {};
          set({
            listLoaded: false,
            ...errorFrom(record, "ui.directive.error.panelUnavailable"),
          });
        }
      } finally {
        set({ busy: false });
      }
    },

    ensureInitialRead: async (projectRoot, timeoutMs = DIRECTIVE_INITIAL_READ_TIMEOUT_MS) => {
      if (get().directivesEnabled || get().initialReadDone) return;
      if (initialReadPromise) return initialReadPromise;
      const bridge = attachedBridge;
      if (!bridge) {
        set({ capabilityAvailable: false, initialReadDone: true });
        return;
      }
      set({ capabilityAvailable: true });
      initialReadPromise = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const raw = await Promise.race<unknown>([
            bridge.listDirectives(projectRoot ? { projectRoot } : {}),
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), Math.max(1, timeoutMs));
            }),
          ]);
          const reply = raw === null ? null : asDirectiveListReply(raw);
          if (reply) {
            applyListReply(reply, projectRoot);
          }
        } catch {
          /* 初始读失败按 false 正常发送；不阻塞普通聊天。 */
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          initialReadPromise = null;
          set({ initialReadDone: true });
        }
      })();
      return initialReadPromise;
    },

    revoke: async (id, target, context) => {
      const bridge = attachedBridge;
      if (!bridge) {
        set({ errorKey: "ui.directive.error.capabilityUnavailable", errorText: "" });
        return;
      }
      if (get().busy) return;
      const root = get().projectRoot;
      // C1 回执 `emitReceipt` 需要 roleId 才产出「已撤销…」系统行；空值/非法值不附，
      // 保持 C1 冻结载荷向后兼容（未传上下文时形状与 C2 初版逐字一致）。
      const roleId =
        typeof context?.roleId === "string" && context.roleId.trim() !== ""
          ? context.roleId
          : "";
      const runtime = context?.runtime;
      set({ busy: true, errorKey: null, errorText: "" });
      try {
        const res = asRecord(
          await bridge.revokeDirective({
            id,
            target,
            ...(root ? { projectRoot: root } : {}),
            ...(roleId !== "" ? { roleId } : {}),
            ...(runtime !== undefined && isDirectiveRuntime(runtime) ? { runtime } : {}),
          }),
        ) ?? {};
        if (res.ok === true) {
          await get().refresh();
          return;
        }
        const failure = errorFrom(res, "ui.directive.error.writeFailed");
        set({ ...failure });
      } catch {
        set({ errorKey: "ui.directive.error.writeFailed", errorText: "" });
      } finally {
        set({ busy: false });
      }
    },

    clearProject: (previousRoot, nextRoot) => {
      void previousRoot;
      set({
        projectRoot: nextRoot,
        pending: null,
        dialogAcknowledged: false,
        approval: emptyDirectiveList(),
        decision: emptyDirectiveList(),
        ledgerErrors: 0,
        listLoaded: false,
        initialReadDone: false,
        busy: false,
        errorKey: null,
        errorText: "",
        panelOpen: false,
        cardEntries: {},
      });
    },

    openPanel: () => {
      if (!get().directivesEnabled) return;
      set({ panelOpen: true });
      if (!get().listLoaded && get().capabilityAvailable) void get().refresh();
    },

    closePanel: () => {
      set({ panelOpen: false });
    },

    setCardEntryExpanded: (cardId, expanded) => {
      set((state) => ({
        cardEntries: updateEntry(state.cardEntries, cardId, { expanded }),
      }));
    },

    setCardEntryText: (cardId, text) => {
      set((state) => ({
        cardEntries: updateEntry(state.cardEntries, cardId, {
          text,
          status: { key: null, text: "" },
        }),
      }));
    },

    collapseCardEntry: (cardId) => {
      set((state) => ({
        cardEntries: updateEntry(state.cardEntries, cardId, {
          expanded: false,
          text: "",
          status: { key: null, text: "" },
        }),
      }));
    },

    submitFromCardEntry: async ({ cardId, rawText, payload, view, sendSession }) => {
      const entry = cardEntryFor(get().cardEntries, cardId);
      if (entry.submitting) return;
      const markStatus = (
        status: DirectiveCardEntry["status"],
        patch: Partial<DirectiveCardEntry> = {},
      ) => {
        set((state) => ({
          cardEntries: updateEntry(state.cardEntries, cardId, { status, ...patch }),
        }));
      };
      const targetResult = cardDirectiveTarget(payload, view);
      if (!get().directivesEnabled) {
        markStatus({ key: "ui.directive.error.capabilityUnavailable", text: "" });
        return;
      }
      if (!targetResult.ok) {
        // 严格 fail-closed：入口禁用/提交拒绝；不发 sendSession、不画气泡、不落账。
        markStatus({ key: "ui.directive.cardEntry.error.invalidTarget", text: "" });
        return;
      }
      const marker = parseDirectiveMarker(rawText);
      if (!marker) {
        markStatus({ key: "ui.directive.cardEntry.error.notDirective", text: "" });
        return;
      }
      if (typeof sendSession !== "function") {
        markStatus({ key: "ui.directive.error.capabilityUnavailable", text: "" });
        return;
      }
      markStatus(
        { key: "ui.directive.cardEntry.status.submitting", text: "" },
        { submitting: true },
      );
      try {
        const res = asRecord(
          await sendSession(rawText, [], targetResult.target, {
            clientMessageId: uuid(),
          }),
        ) ?? {};
        const directive = asRecord(res.directive);
        if (directive && typeof directive.id === "string" && directive.id !== "") {
          // 确认对话框由主进程 `directive:confirm-request` 推达；这里只清空输入、显示状态。
          markStatus(
            { key: "ui.directive.cardEntry.status.confirmOpened", text: "" },
            { submitting: false, text: "" },
          );
          return;
        }
        const text = typeof res.error === "string" ? res.error : "";
        markStatus(
          text !== ""
            ? { key: null, text }
            : { key: "ui.directive.cardEntry.error.submitFailed", text: "" },
          { submitting: false },
        );
      } catch {
        markStatus(
          { key: "ui.directive.cardEntry.error.submitFailed", text: "" },
          { submitting: false },
        );
      }
    },
  };
});

/** 指令弹层（确认对话框或面板）是否打开；ConfirmCard 据此让出 Tab/Esc 陷阱。 */
export function isDirectiveOverlayOpen(state: {
  pending: DirectiveConfirmRequestView | null;
  panelOpen: boolean;
}): boolean {
  return state.pending !== null || state.panelOpen;
}
