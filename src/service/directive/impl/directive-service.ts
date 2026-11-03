// src/service/directive/impl/directive-service.ts
// 客户指令 Service 实现（2026-11-03，客户授权平面 B1）。
//
// 单一职责见 `../abstract/directive-service.ts`。本文件只做业务状态机与校验；持久化经注入的
// `DirectiveStore`（Provider，A2 共享辅助），不直接读盘/写盘。

import {
  CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES,
  CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH,
  CUSTOMER_DIRECTIVE_ID_PATTERN,
  CUSTOMER_DIRECTIVE_PATH_MAX_BYTES,
  CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES,
  CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES,
  CUSTOMER_DIRECTIVES_REL,
  directiveHighRiskReasons,
  type ApprovalAction,
  type ApprovalDirectiveFact,
  type ApprovalDirectiveSnapshot,
  type CustomerDirectiveTarget,
  type CustomerDirectiveUntil,
  type CustomerDirectiveView,
  type DecisionAction,
  type DecisionDirectiveFact,
  type DecisionDirectiveSnapshot,
  type DirectiveCreatedEventV1,
  type DirectiveEventV1,
  type DirectiveHighRiskReason,
  type DirectiveScope,
} from "../../../model/directive.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../model/runtime.ts";
import type {
  DirectiveConsumeVia,
  DirectiveCreateRequest,
  DirectiveCreateResult,
  DirectiveListView,
  DirectiveMutationResult,
  DirectiveService,
  DirectiveServiceList,
  DirectiveServiceOptions,
} from "../abstract/directive-service.ts";

const ID_RE = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);
const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const UNTIL_VALUES: readonly CustomerDirectiveUntil[] = ["once", "session", "forever"];
const EXPIRED_REASONS = new Set(["app-restart", "unused-once", "ttl"]);
const DOMAIN_RE = /^(?:\*|(\*\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)|([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?))$/;

/** 内部视图：多存 `sessionId`（只用于失效判定，不返回给消费者/面板）。 */
type ActiveView = CustomerDirectiveView & { sessionId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isUntil(value: unknown): value is CustomerDirectiveUntil {
  return typeof value === "string" && (UNTIL_VALUES as readonly string[]).includes(value);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** 目录比较（宽松：分隔符/尾斜杠/Windows 大小写；只用于 created 的 cwd 与 projectRoot 等值检查）。 */
function normalizeDirectoryForCompare(value: string): string {
  const slashed = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function sameDirectory(a: string, b: string): boolean {
  return normalizeDirectoryForCompare(a) === normalizeDirectoryForCompare(b);
}

function hasParentSegment(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === "..");
}

function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function validateScope(raw: unknown): { ok: true; scope: DirectiveScope } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, scope: {} };
  if (!isRecord(raw)) return { ok: false, message: "scope 必须是对象" };
  const flowId = raw["flowId"];
  if (flowId === undefined) return { ok: true, scope: {} };
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, message: "scope.flowId 必须是合法治理 slug" };
  }
  return { ok: true, scope: { flowId } };
}

function validateShellResource(
  raw: Record<string, unknown>,
  projectRoot: string | undefined,
): { ok: true; action: ApprovalAction } | { ok: false; message: string } {
  const kind = raw["kind"];
  if (kind !== "allow" && kind !== "deny") return { ok: false, message: "approval.action.kind 非法" };
  const resourceRaw = raw["resource"];
  if (!isRecord(resourceRaw)) return { ok: false, message: "approval.action.resource 非法" };
  const type = resourceRaw["type"];
  let resource: ApprovalAction["resource"];
  if (type === "shell") {
    const command = resourceRaw["command"];
    const cwd = resourceRaw["cwd"];
    if (typeof command !== "string" || command.trim() === "" || command.includes("\u0000")) {
      return { ok: false, message: "shell.command 必须非空且不含 NUL" };
    }
    if (byteLength(command) > CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES) {
      return { ok: false, message: "shell.command 超过上限" };
    }
    if (typeof cwd !== "string" || cwd.trim() === "" || cwd.includes("\u0000")) {
      return { ok: false, message: "shell.cwd 必须非空" };
    }
    if (projectRoot !== undefined && !sameDirectory(cwd, projectRoot)) {
      return { ok: false, message: "shell.cwd 必须等于项目根（审批指令只作用于项目根命令）" };
    }
    resource = { type: "shell", command, cwd };
  } else if (type === "domain") {
    const host = resourceRaw["host"];
    const wildcard = resourceRaw["wildcard"];
    if (typeof host !== "string" || host.includes("\u0000") || host.length > CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH) {
      return { ok: false, message: "domain.host 非法或超过上限" };
    }
    if (host.includes("/") || host.includes(":") || host.includes("?") || host.includes("#") || host !== host.toLowerCase()) {
      return { ok: false, message: "domain.host 必须是小写主机名（无 scheme/路径/端口）" };
    }
    if (!DOMAIN_RE.test(host)) return { ok: false, message: "domain.host 形状非法" };
    if (typeof wildcard !== "boolean") return { ok: false, message: "domain.wildcard 必须是布尔值" };
    const expectedWildcard = host === "*" || host.startsWith("*.");
    if (wildcard !== expectedWildcard) return { ok: false, message: "domain.wildcard 与 host 不一致" };
    resource = { type: "domain", host, wildcard };
  } else if (type === "path") {
    const pathValue = resourceRaw["path"];
    if (typeof pathValue !== "string" || pathValue.trim() === "" || pathValue.includes("\u0000")) {
      return { ok: false, message: "path 必须非空且不含 NUL" };
    }
    if (byteLength(pathValue) > CUSTOMER_DIRECTIVE_PATH_MAX_BYTES) {
      return { ok: false, message: "path 超过上限" };
    }
    if (!isAbsolutePath(pathValue)) return { ok: false, message: "path 必须是绝对路径" };
    if (hasParentSegment(pathValue)) return { ok: false, message: "path 不允许 .. 逃逸" };
    resource = { type: "path", path: pathValue };
  } else {
    return { ok: false, message: "approval.action.resource.type 非法" };
  }
  return { ok: true, action: { kind, resource } };
}

function validateDecisionAction(
  raw: Record<string, unknown>,
): { ok: true; action: DecisionAction } | { ok: false; message: string } {
  const kind = raw["kind"];
  if (kind === "select-recommended" || kind === "reject") return { ok: true, action: { kind } };
  if (kind === "select-option") {
    const selector = raw["selector"];
    if (typeof selector !== "string" || selector.trim() === "" || selector.includes("\u0000")) {
      return { ok: false, message: "select-option.selector 必须非空且不含 NUL" };
    }
    if (/[\r\n]/.test(selector)) return { ok: false, message: "select-option.selector 不能包含换行" };
    if (byteLength(selector) > CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES) {
      return { ok: false, message: "select-option.selector 超过上限" };
    }
    return { ok: true, action: { kind: "select-option", selector } };
  }
  return { ok: false, message: "decision.action.kind 非法" };
}

function validateAction(
  target: CustomerDirectiveTarget,
  raw: unknown,
  projectRoot: string | undefined,
): { ok: true; action: ApprovalAction | DecisionAction } | { ok: false; message: string } {
  if (!isRecord(raw)) return { ok: false, message: "action 必须是对象" };
  return target === "approval" ? validateShellResource(raw, projectRoot) : validateDecisionAction(raw);
}

interface ValidatedHighRisk {
  reasons: DirectiveHighRiskReason[];
  acknowledgedAt: string;
}

function validateHighRiskRecord(raw: unknown): { ok: true; highRisk?: ValidatedHighRisk } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true };
  if (!isRecord(raw)) return { ok: false, message: "highRisk 必须是对象" };
  if (raw["acknowledged"] !== true) return { ok: false, message: "highRisk.acknowledged 必须为 true" };
  const reasons = raw["reasons"];
  if (!Array.isArray(reasons) || reasons.length === 0 || reasons.length > 32) {
    return { ok: false, message: "highRisk.reasons 必须是非空数组（≤32）" };
  }
  if (!reasons.every((reason) => typeof reason === "string" && reason.trim() !== "")) {
    return { ok: false, message: "highRisk.reasons 必须是非空字符串数组" };
  }
  const acknowledgedAt = raw["acknowledgedAt"];
  if (!isIso(acknowledgedAt)) return { ok: false, message: "highRisk.acknowledgedAt 必须是 ISO 时间" };
  return { ok: true, highRisk: { reasons: reasons as DirectiveHighRiskReason[], acknowledgedAt } };
}

interface ValidatedCreate {
  target: CustomerDirectiveTarget;
  action: ApprovalAction | DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
}

function validateCreateInput(
  input: DirectiveCreateRequest,
): { ok: true; value: ValidatedCreate } | { ok: false; message: string } {
  if (input.target !== "approval" && input.target !== "decision") {
    return { ok: false, message: "target 非法" };
  }
  if (!isUntil(input.until)) return { ok: false, message: "until 非法" };
  if (typeof input.rawText !== "string" || input.rawText.trim() === "") {
    return { ok: false, message: "rawText 必须非空" };
  }
  if (byteLength(input.rawText) > CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES) {
    return { ok: false, message: "rawText 超过上限" };
  }
  if (!isNonEmptyString(input.projectRoot)) return { ok: false, message: "projectRoot 必须非空" };
  if (typeof input.decisionGroupEnabled !== "boolean") {
    return { ok: false, message: "decisionGroupEnabled 必须是布尔值" };
  }
  const scope = validateScope(input.scope);
  if (!scope.ok) return { ok: false, message: scope.message };
  if (input.target === "approval" && scope.scope.flowId !== undefined) {
    return { ok: false, message: "approval.scope 必须为 {}（审批范围固定项目级）" };
  }
  const action = validateAction(input.target, input.action, input.projectRoot);
  if (!action.ok) return { ok: false, message: action.message };
  return {
    ok: true,
    value: { target: input.target, action: action.action, scope: scope.scope, until: input.until },
  };
}

function consumerOf(target: CustomerDirectiveTarget, action: ApprovalAction | DecisionAction): CustomerDirectiveView["consumer"] {
  if (target === "decision") return "decision-card";
  return action.kind === "allow" || action.kind === "deny"
    ? action.resource.type === "shell" ? "shell-gate" : "none"
    : "none";
}

function toPublicView(view: ActiveView): CustomerDirectiveView {
  return {
    id: view.id,
    seq: view.seq,
    target: view.target,
    action: view.action,
    scope: { ...view.scope },
    until: view.until,
    status: view.status,
    rawText: view.rawText,
    createdAt: view.createdAt,
    ...(view.consumedAt !== undefined ? { consumedAt: view.consumedAt } : {}),
    ...(view.revokedAt !== undefined ? { revokedAt: view.revokedAt } : {}),
    ...(view.expiredAt !== undefined ? { expiredAt: view.expiredAt } : {}),
    ...(view.expiredReason !== undefined ? { expiredReason: view.expiredReason } : {}),
    ...(view.highRisk !== undefined ? { highRisk: { reasons: [...view.highRisk.reasons], acknowledged: true as const } } : {}),
    consumer: view.consumer,
  };
}

function emptyListView(): DirectiveListView {
  return { active: [], consumed: [], revoked: [], expired: [] };
}

/**
 * 构造 Service。`ready()` 之前所有消费者 API 返回空快照（fail-safe：按无指令处理）；
 * Pipeline 在 `takeDirective`/`applyDecisionDirective`/`list` 前等待 `ready()`。
 */
export function buildDirectiveService(options: DirectiveServiceOptions): DirectiveService {
  if (options.store.relPath !== CUSTOMER_DIRECTIVES_REL) {
    throw new Error(`客户指令 Service：store.relPath 必须为 ${CUSTOMER_DIRECTIVES_REL}（实际 ${options.store.relPath}）`);
  }
  if (!isNonEmptyString(options.sessionId)) throw new Error("客户指令 Service：sessionId 必须非空");
  const now = options.now ?? (() => new Date());
  const views = new Map<string, ActiveView>();
  const order: string[] = [];
  let maxSeq = 0;
  let ledgerErrors = 0;
  let unknownEvents = 0;
  let loadFailure: string | undefined;
  let readyPromise: Promise<void> | undefined;
  let chain: Promise<unknown> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = chain.then(operation, operation);
    chain = result.then(() => undefined, () => undefined);
    return result;
  }

  function nextSeq(): number {
    maxSeq += 1;
    return maxSeq;
  }

  function addView(event: DirectiveCreatedEventV1): void {
    const highRisk = event.highRisk !== undefined
      ? { reasons: [...event.highRisk.reasons], acknowledged: true as const }
      : undefined;
    const view: ActiveView = {
      id: event.id,
      seq: event.seq,
      target: event.target,
      action: event.action,
      scope: { ...event.scope },
      until: event.until,
      status: "active",
      rawText: event.rawText,
      createdAt: event.createdAt,
      ...(highRisk !== undefined ? { highRisk } : {}),
      consumer: consumerOf(event.target, event.action),
      sessionId: event.sessionId,
    };
    views.set(event.id, view);
    order.push(event.id);
  }

  function applyStateEvent(event: Exclude<DirectiveEventV1, DirectiveCreatedEventV1>): { ok: true } | { ok: false; message: string } {
    const view = views.get(event.id);
    if (view === undefined) return { ok: false, message: `状态事件引用未知指令：${event.id}` };
    if (view.status !== "active") {
      return { ok: false, message: `状态事件作用于非 active 指令（${view.status}）：${event.id}` };
    }
    if (event.kind === "directive.consumed") {
      if (view.until !== "once") {
        return { ok: false, message: `consumed 事件只适用于 once 指令：${event.id}（until=${view.until}）` };
      }
      view.status = "consumed";
      view.consumedAt = event.at;
      return { ok: true };
    }
    if (event.kind === "directive.revoked") {
      view.status = "revoked";
      view.revokedAt = event.at;
      return { ok: true };
    }
    view.status = "expired";
    view.expiredAt = event.at;
    view.expiredReason = event.reason;
    return { ok: true };
  }

  function parseEventLine(raw: string): { kind: "created"; event: DirectiveCreatedEventV1 } | { kind: "state"; event: Exclude<DirectiveEventV1, DirectiveCreatedEventV1> } | { kind: "ignore" } | { kind: "error"; message: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { kind: "error", message: `JSON 坏行：${err instanceof Error ? err.message : String(err)}` };
    }
    if (!isRecord(parsed)) return { kind: "error", message: "事件不是对象" };
    if (parsed["version"] !== 1) return { kind: "error", message: "version 必须为 1（不支持未来版本）" };
    const kind = parsed["kind"];
    if (typeof kind !== "string") return { kind: "error", message: "事件缺 kind" };
    if (
      kind !== "directive.created" &&
      kind !== "directive.consumed" &&
      kind !== "directive.revoked" &&
      kind !== "directive.expired"
    ) {
      return { kind: "ignore" };
    }
    const id = parsed["id"];
    if (typeof id !== "string" || !ID_RE.test(id)) return { kind: "error", message: "id 非法" };
    const seq = parsed["seq"];
    if (!isPositiveInt(seq)) return { kind: "error", message: "seq 必须是正整数" };
    if (seq <= maxSeq) return { kind: "error", message: `seq 非单调（${seq} ≤ ${maxSeq}）` };

    if (kind === "directive.created") {
      const target = parsed["target"];
      if (target !== "approval" && target !== "decision") return { kind: "error", message: "target 非法" };
      if (id !== `d-${seq}`) return { kind: "error", message: "created.id 必须等于 d-<seq>" };
      const until = parsed["until"];
      if (!isUntil(until)) return { kind: "error", message: "until 非法" };
      const rawText = parsed["rawText"];
      if (typeof rawText !== "string" || rawText.trim() === "" || byteLength(rawText) > CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES) {
        return { kind: "error", message: "rawText 非法或超过上限" };
      }
      const sessionId = parsed["sessionId"];
      if (!isNonEmptyString(sessionId)) return { kind: "error", message: "sessionId 非法" };
      const createdAt = parsed["createdAt"];
      if (!isIso(createdAt)) return { kind: "error", message: "createdAt 非法" };
      if (parsed["createdBy"] !== "customer") return { kind: "error", message: "createdBy 非法" };
      if (parsed["source"] !== "desktop-input") return { kind: "error", message: "source 非法" };
      const scope = validateScope(parsed["scope"]);
      if (!scope.ok) return { kind: "error", message: scope.message };
      if (target === "approval" && scope.scope.flowId !== undefined) {
        return { kind: "error", message: "approval.scope 必须为 {}" };
      }
      const action = validateAction(target, parsed["action"], undefined);
      if (!action.ok) return { kind: "error", message: action.message };
      const highRisk = validateHighRiskRecord(parsed["highRisk"]);
      if (!highRisk.ok) return { kind: "error", message: highRisk.message };
      return {
        kind: "created",
        event: {
          version: 1,
          kind: "directive.created",
          id,
          seq,
          target,
          action: action.action,
          scope: scope.scope,
          until,
          rawText,
          ...(highRisk.highRisk !== undefined
            ? { highRisk: { reasons: highRisk.highRisk.reasons, acknowledged: true as const, acknowledgedAt: highRisk.highRisk.acknowledgedAt } }
            : {}),
          sessionId,
          createdAt,
          createdBy: "customer",
          source: "desktop-input",
        } as DirectiveCreatedEventV1,
      };
    }

    const at = parsed["at"];
    if (!isIso(at)) return { kind: "error", message: "at 非法" };
    if (kind === "directive.consumed") {
      const viaRaw = parsed["via"];
      const via: { requestId?: string; toolCallId?: string; flowId?: string } = {};
      if (viaRaw !== undefined) {
        if (!isRecord(viaRaw)) return { kind: "error", message: "consumed.via 非法" };
        for (const key of ["requestId", "toolCallId", "flowId"] as const) {
          const value = viaRaw[key];
          if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
            return { kind: "error", message: `consumed.via.${key} 非法` };
          }
          if (typeof value === "string") via[key] = value;
        }
      }
      return { kind: "state", event: { version: 1, kind, id, seq, at, via } };
    }
    if (kind === "directive.revoked") {
      if (parsed["by"] !== "customer") return { kind: "error", message: "revoked.by 非法" };
      return { kind: "state", event: { version: 1, kind, id, seq, at, by: "customer" } };
    }
    const reason = parsed["reason"];
    if (typeof reason !== "string" || !EXPIRED_REASONS.has(reason)) {
      return { kind: "error", message: "expired.reason 非法" };
    }
    return { kind: "state", event: { version: 1, kind, id, seq, at, reason: reason as "app-restart" | "unused-once" | "ttl" } };
  }

  async function expireViewInternal(view: ActiveView, reason: "app-restart" | "unused-once" | "ttl"): Promise<void> {
    const seq = nextSeq();
    const at = now().toISOString();
    const event: DirectiveEventV1 = { version: 1, kind: "directive.expired", id: view.id, seq, at, reason };
    try {
      await options.store.append(JSON.stringify(event));
    } catch {
      // best-effort：追加失败不阻塞读取视图的 expired 判定（B1 提案 §1.3/§7.2）。
    }
    view.status = "expired";
    view.expiredAt = at;
    view.expiredReason = reason;
  }

  async function load(): Promise<void> {
    let replay;
    try {
      replay = await options.store.replay();
    } catch (err) {
      loadFailure = err instanceof Error ? err.message : String(err);
      ledgerErrors += 1;
      return;
    }
    ledgerErrors += replay.errors;
    for (const raw of replay.lines) {
      const parsed = parseEventLine(raw);
      if (parsed.kind === "ignore") {
        unknownEvents += 1;
        continue;
      }
      if (parsed.kind === "error") {
        ledgerErrors += 1;
        continue;
      }
      if (parsed.kind === "created") {
        if (views.has(parsed.event.id)) {
          ledgerErrors += 1;
          continue;
        }
        maxSeq = Math.max(maxSeq, parsed.event.seq);
        addView(parsed.event);
        continue;
      }
      const applied = applyStateEvent(parsed.event);
      if (!applied.ok) {
        ledgerErrors += 1;
        continue;
      }
      maxSeq = Math.max(maxSeq, parsed.event.seq);
    }
    // sessionId 不一致的 session / 未使用 once 指令：追加 expired（best-effort），视图按 expired。
    for (const id of [...order]) {
      const view = views.get(id);
      if (view === undefined || view.status !== "active") continue;
      if (view.sessionId === options.sessionId) continue;
      if (view.until === "session") await expireViewInternal(view, "app-restart");
      else if (view.until === "once") await expireViewInternal(view, "unused-once");
    }
  }

  function ready(): Promise<void> {
    readyPromise ??= load();
    return readyPromise;
  }

  function rejection(error: DirectiveMutationResult & { ok: false }, message?: string): DirectiveMutationResult {
    return { ok: false, error: error.error, ...(message !== undefined ? { message } : {}) };
  }

  async function create(input: DirectiveCreateRequest): Promise<DirectiveCreateResult> {
    await ready();
    if (loadFailure !== undefined) return { ok: false, error: "ledger-unavailable", message: loadFailure };
    const validated = validateCreateInput(input);
    if (!validated.ok) return { ok: false, error: "invalid-input", message: validated.message };
    const { target, action, scope, until } = validated.value;
    const reasons = directiveHighRiskReasons(
      target === "approval"
        ? { target, action: action as ApprovalAction, until, projectRoot: input.projectRoot }
        : { target, action: action as DecisionAction, until, scope, decisionGroupEnabled: input.decisionGroupEnabled },
    );
    if (reasons.length > 0 && input.acknowledged !== true) {
      return {
        ok: false,
        error: "high-risk-unacknowledged",
        message: `高危指令未确认：${reasons.join(",")}`,
      };
    }
    return serialize(async () => {
      const seq = nextSeq();
      const id = `d-${seq}`;
      const createdAt = now().toISOString();
      const event: DirectiveCreatedEventV1 = {
        version: 1,
        kind: "directive.created",
        id,
        seq,
        target,
        action,
        scope,
        until,
        rawText: input.rawText,
        ...(reasons.length > 0
          ? { highRisk: { reasons: [...reasons], acknowledged: true as const, acknowledgedAt: createdAt } }
          : {}),
        sessionId: options.sessionId,
        createdAt,
        createdBy: "customer",
        source: "desktop-input",
      } as DirectiveCreatedEventV1;
      try {
        await options.store.append(JSON.stringify(event));
      } catch (err) {
        return { ok: false, error: "ledger-write-failed", message: err instanceof Error ? err.message : String(err) };
      }
      addView(event);
      return { ok: true, id, target };
    });
  }

  async function revoke(id: string, target: CustomerDirectiveTarget): Promise<DirectiveMutationResult> {
    await ready();
    if (loadFailure !== undefined) return rejection({ ok: false, error: "ledger-unavailable" }, loadFailure);
    return serialize(async () => {
      const view = views.get(id);
      if (view === undefined) return rejection({ ok: false, error: "not-found" }, `指令不存在：${id}`);
      if (view.target !== target) return rejection({ ok: false, error: "target-mismatch" }, `#${id} 属于 ${view.target}`);
      if (view.status === "consumed") return rejection({ ok: false, error: "already-consumed" });
      if (view.status === "revoked") return rejection({ ok: false, error: "already-revoked" });
      if (view.status === "expired") return rejection({ ok: false, error: "expired" });
      const seq = nextSeq();
      const at = now().toISOString();
      const event: DirectiveEventV1 = { version: 1, kind: "directive.revoked", id, seq, at, by: "customer" };
      try {
        await options.store.append(JSON.stringify(event));
      } catch (err) {
        return rejection({ ok: false, error: "ledger-write-failed" }, err instanceof Error ? err.message : String(err));
      }
      view.status = "revoked";
      view.revokedAt = at;
      return { ok: true };
    });
  }

  async function consume(id: string, via: DirectiveConsumeVia = {}): Promise<DirectiveMutationResult> {
    await ready();
    if (loadFailure !== undefined) return rejection({ ok: false, error: "ledger-unavailable" }, loadFailure);
    return serialize(async () => {
      const view = views.get(id);
      if (view === undefined) return rejection({ ok: false, error: "not-found" });
      if (view.status === "consumed") return rejection({ ok: false, error: "already-consumed" });
      if (view.status === "revoked") return rejection({ ok: false, error: "already-revoked" });
      if (view.status === "expired") return rejection({ ok: false, error: "expired" });
      if (view.until !== "once") return { ok: true };
      const seq = nextSeq();
      const at = now().toISOString();
      const event: DirectiveEventV1 = { version: 1, kind: "directive.consumed", id, seq, at, via };
      try {
        await options.store.append(JSON.stringify(event));
      } catch (err) {
        return rejection({ ok: false, error: "ledger-write-failed" }, err instanceof Error ? err.message : String(err));
      }
      view.status = "consumed";
      view.consumedAt = at;
      return { ok: true };
    });
  }

  async function expire(id: string, reason: "app-restart" | "unused-once" | "ttl"): Promise<void> {
    await ready();
    if (loadFailure !== undefined) return;
    await serialize(async () => {
      const view = views.get(id);
      if (view === undefined || view.status !== "active") return;
      await expireViewInternal(view, reason);
    });
  }

  function approvalFacts(): ApprovalDirectiveSnapshot {
    if (ledgerErrors > 0) return { ledgerErrors, active: [] };
    const active: ApprovalDirectiveFact[] = [];
    for (const id of order) {
      const view = views.get(id);
      if (view === undefined || view.status !== "active" || view.target !== "approval") continue;
      const action = view.action as ApprovalAction;
      if (action.kind !== "allow" && action.kind !== "deny") continue; // 防御：跨 target/伪造记录丢弃
      active.push({
        id: view.id,
        seq: view.seq,
        target: "approval",
        action,
        scope: {},
        until: view.until,
      });
    }
    return { ledgerErrors: 0, active };
  }

  function decisionFacts(): DecisionDirectiveSnapshot {
    if (ledgerErrors > 0) return { ledgerErrors, active: [] };
    const active: DecisionDirectiveFact[] = [];
    for (const id of order) {
      const view = views.get(id);
      if (view === undefined || view.status !== "active" || view.target !== "decision") continue;
      const action = view.action as DecisionAction;
      if (action.kind !== "select-recommended" && action.kind !== "select-option" && action.kind !== "reject") continue;
      active.push({
        id: view.id,
        seq: view.seq,
        target: "decision",
        action,
        scope: { ...view.scope },
        until: view.until,
      });
    }
    return { ledgerErrors: 0, active };
  }

  function list(): DirectiveServiceList {
    const approval = emptyListView();
    const decision = emptyListView();
    for (const id of order) {
      const view = views.get(id);
      if (view === undefined) continue;
      const bucket = view.target === "approval" ? approval : decision;
      bucket[view.status].push(toPublicView(view));
    }
    return { approval, decision, ledgerErrors };
  }

  return {
    ready,
    getLoadError: () => loadFailure,
    create,
    revoke,
    consume,
    expire,
    approvalFacts,
    decisionFacts,
    list,
    view: (id) => {
      const view = views.get(id);
      return view === undefined ? undefined : toPublicView(view);
    },
  };
}
