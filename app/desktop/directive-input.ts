// app/desktop/directive-input.ts
// 客户授权平面 —— 桌面主进程侧指令控制器（C1，2026-11-03）。
//
// 职责（C1 P1 提案 §2.3/§2.4/§2.5）：
//   · 每个项目一个 B1 Pipeline 公共句柄 `CustomerDirectiveRuntime`（懒创建；项目切换不销毁）；
//   · 提交/确认/取消/列表/撤销/高危复核/幂等/关窗取消/项目切换/重推；
//   · decision 消费者的主进程侧入口（customer-input 只经本控制器读 target-scoped facts / 应用指令）。
//
// 分层纪律：本文件是 Interface 主进程侧应用层——只经 B1 的 **Pipeline 公共出口**
// （`src/pipeline/orchestration/customer-directive.ts`）与 A1 的 Model 只读类型/谓词；不 import
// Service/Provider 内部、不写盘、不 import renderer。B1 是账本/状态机/高危复算的唯一实现，本文件
// 不复制第二份消费逻辑。
//
// 冻结声明（C1 退出）：`directive:confirm-request`/`directive:confirm-response`/`directive:list`/
// `directive:revoke`/`directive:state` 的载荷形状、`directivesEnabled`/`confirmable`/
// `directiveConfirmRespond` 命名、`decisionGroupEnabled` 提交快照、应用运行级 `sessionId` 由本文件
// 与 `main.ts`/`preload.cjs` 冻结；C2 只按此消费，变更回 C1 重跑证据。

import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import {
  createCustomerDirectiveRuntime,
  type CreateCustomerDirectiveRuntimeOptions,
  type CustomerDirectiveRuntime,
  type DecisionApplyResult,
  type DecisionCardFacts,
  type DecisionHooks,
  type DirectiveErrorCode,
  type DirectiveListView,
  type DirectivePresenterRequest,
  type SubmitFromInput,
  type SubmitResult,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import {
  CUSTOMER_DIRECTIVE_ID_PATTERN,
  directiveHighRiskReasons,
  type ApprovalAction,
  type CustomerDirectiveTarget,
  type CustomerDirectiveUntil,
  type DecisionAction,
  type DecisionDirectiveSnapshot,
  type DirectiveScope,
} from "../../src/model/directive.ts";
import { GOVERNANCE_SLUG_PATTERN, type RuntimeKind } from "../../src/model/runtime.ts";
import { parseDirectiveMarker } from "../../src/model/directive-marker.ts";
import { mainT } from "./i18n.ts";

const DIRECTIVE_OPERATOR_PREFIX = "directive:";
const DIRECTIVE_ID_RE = new RegExp(CUSTOMER_DIRECTIVE_ID_PATTERN);
const COMPLETED_KEY_LIMIT = 100;

/**
 * Q9 A 唯一归属解析：`operatorId:"directive:<id>"` ⇒ `d-<seq>`；其余/非法 ⇒ undefined。
 * `directiveId` 只从该前缀解析（不信任其他字段）；旧记录（无该前缀）保持可读。
 */
export function directiveIdFromOperatorId(operatorId: unknown): string | undefined {
  if (typeof operatorId !== "string" || !operatorId.startsWith(DIRECTIVE_OPERATOR_PREFIX)) {
    return undefined;
  }
  const id = operatorId.slice(DIRECTIVE_OPERATOR_PREFIX.length);
  return DIRECTIVE_ID_RE.test(id) ? id : undefined;
}

/** `directive:confirm-request` 冻结载荷（C1 为 source of truth；C2 逐字段消费）。 */
export interface DirectiveConfirmRequestPayload {
  version: 1;
  request: {
    id: string;
    target: CustomerDirectiveTarget;
    rawText: string;
    projectRoot: string;
    roleId: string;
    runtime?: RuntimeKind;
    prefill: {
      action: ApprovalAction | DecisionAction;
      scope: DirectiveScope;
      until: CustomerDirectiveUntil;
      unrecognized: string[];
    };
    highRisk: { reasons: string[] };
    confirmable: boolean;
    decisionGroupEnabled: boolean;
  };
}

/** `directive:confirm-response` 入参（渲染侧不可信；主进程按快照复核）。 */
export interface DirectiveConfirmResponseInput {
  id: string;
  decision: "confirm" | "cancel";
  values?: {
    action: ApprovalAction | DecisionAction;
    scope: DirectiveScope;
    until: CustomerDirectiveUntil;
    acknowledged?: true;
  };
}

/** `directive:list` 成功载荷（与 `directive:state` 同形）。 */
export interface DirectiveListReplyOk {
  version: 1;
  ok: true;
  directivesEnabled: true;
  projectRoot: string;
  approval: DirectiveListView;
  decision: DirectiveListView;
  ledgerErrors: number;
}

export type DirectiveListReply = DirectiveListReplyOk | { ok: false; error: string };

/** `directive:state` 主→渲推送载荷（与 `directive:list` 成功视图一一对应；不新增跨 target 字段）。 */
export interface DirectiveStateView {
  version: 1;
  directivesEnabled: true;
  projectRoot: string;
  approval: DirectiveListView;
  decision: DirectiveListView;
  ledgerErrors: number;
}

export type DirectiveRevokeReply =
  | { ok: true; id: string; target: CustomerDirectiveTarget }
  | { ok: false; error: string };

/** 可见系统行（既有 `delivery-note`；不含原文、不进模型上下文）。 */
export interface DirectiveNote {
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  summary: string;
}

export interface DirectiveDecisionConsumer {
  decisionFacts(projectRoot: string): DecisionDirectiveSnapshot | undefined;
  applyDecisionDirective(
    projectRoot: string,
    card: DecisionCardFacts,
    hooks: DecisionHooks,
  ): Promise<DecisionApplyResult | undefined>;
}

export interface DirectiveInputController extends DirectiveDecisionConsumer {
  /** 当前项目授权来源（`app:list-project` 成功值）；项目切换取消未决面板、不销毁旧运行时。 */
  setCurrentProject(projectRoot: string | undefined): void;
  currentProjectRoot(): string | undefined;
  submitFromInput(input: SubmitFromInput): Promise<SubmitResult>;
  respond(input: unknown): Promise<{ ok: boolean; error?: string; expired?: boolean }>;
  list(input?: unknown): Promise<DirectiveListReply>;
  revoke(input: unknown): Promise<DirectiveRevokeReply>;
  /** 当前项目视图；无当前项目 ⇒ 空视图（能力位恒 true）。账本不可读 ⇒ undefined（主进程跳过推送）。 */
  state(): Promise<DirectiveStateView | undefined>;
  replayPending(): number;
  cancelAll(reason: string): void;
  cancelProject(projectRoot: string): void;
}

export interface CreateDirectiveInputControllerOptions {
  /** 应用运行级 id（main.ts 启动生成一次；项目切换不重置；重启生成新值使 session 指令失效）。 */
  sessionId: string;
  /** 主→渲推送 `directive:confirm-request`；窗口不可用时抛错（B1 映射 presenter-unavailable）。 */
  present: (payload: DirectiveConfirmRequestPayload) => void;
  /** 既有 `delivery-note` 系统行（回执/生效行）；失败由调用方隔离，不影响已完成的账本动作。 */
  emitNotice: (note: DirectiveNote) => void;
  /** 测试注入缝；生产走 B1 公共工厂。 */
  createRuntime?: (options: CreateCustomerDirectiveRuntimeOptions) => CustomerDirectiveRuntime;
  now?: () => Date;
}

interface PendingEntryBase {
  requestId: string;
  target: CustomerDirectiveTarget;
  rawText: string;
  projectRoot: string;
  roleId: string;
  runtime?: RuntimeKind;
  /** 仅撤销面板需要（B1 presenter 请求不携带）；创建路径由 `submitFromInput` 原入参保存。 */
  clientMessageId?: string;
  prefill: DirectiveConfirmRequestPayload["request"]["prefill"];
  decisionGroupEnabled: boolean;
  /** 首次推达的冻结载荷（重推逐字复用；不重算预填/高危）。 */
  payload: DirectiveConfirmRequestPayload;
}

/** 新建指令：B1 presenter 回包解析。 */
interface CreatePendingEntry extends PendingEntryBase {
  kind: "create";
  resolve: (
    response: { decision: "confirm"; values: NonNullable<DirectiveConfirmResponseInput["values"]> } | { decision: "cancel" },
  ) => void;
}

/** 输入式撤销（`@审批 撤销 #d-N`）：确认后调用 B1 `runtime.revoke`（`submitFromInput` 只创建）。 */
interface RevokePendingEntry extends PendingEntryBase {
  kind: "revoke";
  directiveId: string;
  result: Promise<SubmitResult>;
  resolveSubmit: (result: SubmitResult) => void;
}

type PendingEntry = CreatePendingEntry | RevokePendingEntry;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function emptyListView(): DirectiveListView {
  return { active: [], consumed: [], revoked: [], expired: [] };
}

function emptyState(): DirectiveStateView {
  return {
    version: 1,
    directivesEnabled: true,
    projectRoot: "",
    approval: emptyListView(),
    decision: emptyListView(),
    ledgerErrors: 0,
  };
}

/** 提交错误码 → A3 冻结文案（不含原文/不硬编码用户可见字符串）。 */
export function directiveSubmitErrorMessage(code: DirectiveErrorCode): string {
  switch (code) {
    case "cancelled":
      return mainT("ui.directive.error.cancelled");
    case "presenter-unavailable":
      return mainT("ui.directive.error.panelUnavailable");
    case "invalid-input":
      return mainT("ui.directive.error.incompleteParse");
    case "high-risk-unacknowledged":
      return mainT("ui.directive.error.highRiskUnacknowledged");
    case "ledger-write-failed":
      return mainT("ui.directive.error.writeFailed");
    case "ledger-unavailable":
      return mainT("ui.directive.error.ledgerUnavailable");
    case "not-found":
      return mainT("ui.directive.error.revokeNotFound");
    case "target-mismatch":
      return mainT("ui.directive.error.revokeCrossTarget", { id: "" });
    case "already-consumed":
      return mainT("ui.directive.error.revokeConsumed");
    case "already-revoked":
      return mainT("ui.directive.error.revokeRevoked");
    case "expired":
      return mainT("ui.directive.error.revokeExpired");
  }
}

/** 撤销错误码 → A3 冻结文案（跨 target 带 id）。 */
export function directiveRevokeErrorMessage(code: DirectiveErrorCode, id: string): string {
  if (code === "target-mismatch") return mainT("ui.directive.error.revokeCrossTarget", { id });
  return directiveSubmitErrorMessage(code);
}

/**
 * 回包结构复核（不信任渲染侧字段）：target 与 action 判别一致、until 三值、scope 形状。
 * 详细 schema（命令/主机/路径/选择器上限）由 B1 Service 的同一校验器负责——本层不复制第二份。
 */
function validateConfirmationValues(
  target: CustomerDirectiveTarget,
  raw: unknown,
): { ok: true; values: NonNullable<DirectiveConfirmResponseInput["values"]> } | { ok: false } {
  if (!isRecord(raw)) return { ok: false };
  const action = raw["action"];
  const scope = raw["scope"];
  const until = raw["until"];
  if (!isRecord(action) || !isRecord(scope)) return { ok: false };
  if (until !== "once" && until !== "session" && until !== "forever") return { ok: false };
  if (target === "approval") {
    if (action["kind"] !== "allow" && action["kind"] !== "deny") return { ok: false };
    const resource = action["resource"];
    if (!isRecord(resource)) return { ok: false };
    const type = resource["type"];
    if (type !== "shell" && type !== "domain" && type !== "path") return { ok: false };
    if (scope["flowId"] !== undefined) return { ok: false }; // approval scope 恒为 {}
  } else {
    const kind = action["kind"];
    if (kind !== "select-recommended" && kind !== "select-option" && kind !== "reject") return { ok: false };
    if (kind === "select-option") {
      const selector = action["selector"];
      if (typeof selector !== "string" || selector.trim() === "") return { ok: false };
    }
    const flowId = scope["flowId"];
    if (flowId !== undefined) {
      if (typeof flowId !== "string" || !new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)) return { ok: false };
    }
  }
  const acknowledged = raw["acknowledged"];
  if (acknowledged !== undefined && acknowledged !== true) return { ok: false };
  return { ok: true, values: raw as unknown as NonNullable<DirectiveConfirmResponseInput["values"]> };
}

/** 高危复核：用提交快照的 `decisionGroupEnabled` 重算；形状异常 ⇒ 不受理（保持面板可重试）。 */
function recheckHighRisk(
  entry: PendingEntry,
  values: NonNullable<DirectiveConfirmResponseInput["values"]>,
): { ok: true; reasons: string[] } | { ok: false } {
  try {
    const reasons =
      entry.target === "approval"
        ? directiveHighRiskReasons({
            target: "approval",
            action: values.action as ApprovalAction,
            until: values.until,
            projectRoot: entry.projectRoot,
          })
        : directiveHighRiskReasons({
            target: "decision",
            action: values.action as DecisionAction,
            until: values.until,
            scope: values.scope,
            decisionGroupEnabled: entry.decisionGroupEnabled,
          });
    return { ok: true, reasons: [...reasons] };
  } catch {
    return { ok: false };
  }
}

/**
 * 输入式撤销解析（P1.1 §7.3）：正文 `撤销 #d-<seq>`（撤销只减少授权，不需要二次高危确认）。
 * 返回 undefined = 不是撤销；`{ok:false}` = 是撤销但 id 形状非法（fail-closed，不开面板）。
 */
function parseRevokeBody(body: string): { ok: true; id: string } | { ok: false } | undefined {
  if (!/^撤销(?:\s|#|$)/.test(body)) return undefined;
  const match = /^撤销\s*#\s*(\S+)\s*$/.exec(body);
  if (match === null || !DIRECTIVE_ID_RE.test(match[1]!)) return { ok: false };
  return { ok: true, id: match[1]! };
}

export function createDirectiveInputController(
  opts: CreateDirectiveInputControllerOptions,
): DirectiveInputController {
  if (typeof opts.sessionId !== "string" || opts.sessionId.trim() === "") {
    throw new Error("客户指令控制器：sessionId 必须非空");
  }
  if (typeof opts.present !== "function" || typeof opts.emitNotice !== "function") {
    throw new Error("客户指令控制器：present/emitNotice 必须为函数");
  }
  const createRuntime = opts.createRuntime ?? createCustomerDirectiveRuntime;
  const diagnostic = createDiagnosticLogger({ component: "desktop.directive" });
  /** 每项目运行时（项目切换不销毁；切回同一运行内 session 指令仍有效）。 */
  const runtimes = new Map<string, CustomerDirectiveRuntime>();
  /** 未决确认面板（按应用生成 requestId；重推复用同一 id）。 */
  const pending = new Map<string, PendingEntry>();
  /** 已落账提交幂等（有界；`clientMessageId` 缺省不参与）。 */
  const completed = new Map<string, { id: string; target: CustomerDirectiveTarget }>();
  let currentProjectRoot: string | undefined;

  const emitNoteSafely = (note: DirectiveNote, code: string): void => {
    try {
      opts.emitNotice(note);
    } catch (error) {
      diagnostic.error("directive.notice.failed", error, { reasonCode: code });
    }
  };

  const emitReceipt = (
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind | undefined,
    target: CustomerDirectiveTarget,
    verb: "created" | "revoked",
    id: string,
    noConsumer: boolean,
  ): void => {
    if (typeof roleId !== "string" || roleId.trim() === "") return;
    const key =
      target === "approval"
        ? verb === "created"
          ? "main.directive.receipt.approvalCreated"
          : "main.directive.receipt.approvalRevoked"
        : verb === "created"
          ? "main.directive.receipt.decisionCreated"
          : "main.directive.receipt.decisionRevoked";
    const summary = mainT(key, { id }) + (noConsumer ? mainT("main.directive.receipt.noConsumerSuffix") : "");
    emitNoteSafely(
      {
        roleId,
        projectRoot,
        ...(runtime !== undefined ? { runtime } : {}),
        summary,
      },
      `${target}.${verb}`,
    );
  };

  const presenterFor = (projectRoot: string): { present: (request: DirectivePresenterRequest) => Promise<{ decision: "confirm"; values: NonNullable<DirectiveConfirmResponseInput["values"]> } | { decision: "cancel" }> } => ({
    present: (request) =>
      new Promise((resolve, reject) => {
        const payload: DirectiveConfirmRequestPayload = {
          version: 1,
          request: {
            id: request.requestId,
            target: request.target,
            rawText: request.rawText,
            projectRoot,
            roleId: request.roleId,
            ...(request.runtime !== undefined ? { runtime: request.runtime } : {}),
            prefill: {
              action: request.prefill.action,
              scope: request.prefill.scope,
              until: request.prefill.until,
              unrecognized: [...request.prefill.unrecognized],
            },
            highRisk: { reasons: [...request.highRisk.reasons] },
            confirmable: request.confirmable,
            decisionGroupEnabled: request.decisionGroupEnabled,
          },
        };
        const entry: CreatePendingEntry = {
          kind: "create",
          requestId: request.requestId,
          target: request.target,
          rawText: request.rawText,
          projectRoot,
          roleId: request.roleId,
          ...(request.runtime !== undefined ? { runtime: request.runtime } : {}),
          prefill: payload.request.prefill,
          decisionGroupEnabled: request.decisionGroupEnabled,
          payload,
          resolve,
        };
        pending.set(request.requestId, entry);
        try {
          opts.present(payload);
          diagnostic.record("directive.confirm.requested", {
            requestId: request.requestId,
            target: request.target,
            projectRoot,
          });
        } catch (error) {
          pending.delete(request.requestId);
          reject(error);
        }
      }),
  });

  const runtimeFor = (projectRoot: string): CustomerDirectiveRuntime => {
    let runtime = runtimes.get(projectRoot);
    if (runtime === undefined) {
      runtime = createRuntime({
        projectRoot,
        sessionId: opts.sessionId,
        present: presenterFor(projectRoot),
        ...(opts.now !== undefined ? { now: opts.now } : {}),
      });
      runtimes.set(projectRoot, runtime);
    }
    return runtime;
  };

  const resolveProjectRoot = (input: unknown): string | undefined => {
    if (isRecord(input) && typeof input["projectRoot"] === "string" && input["projectRoot"].trim() !== "") {
      return input["projectRoot"] === currentProjectRoot ? input["projectRoot"] : undefined;
    }
    return currentProjectRoot;
  };

  const submissionKeyOf = (
    projectRoot: string,
    target: CustomerDirectiveTarget,
    rawText: string,
    clientMessageId: string | undefined,
  ): string | undefined => {
    if (clientMessageId === undefined) return undefined;
    return `${projectRoot}\u0000${target}\u0000${rawText}\u0000${clientMessageId}`;
  };

  const submissionKey = (input: SubmitFromInput): string | undefined =>
    submissionKeyOf(input.projectRoot, input.target, input.rawText, input.clientMessageId);

  const rememberCompleted = (key: string, value: { id: string; target: CustomerDirectiveTarget }): void => {
    completed.set(key, value);
    while (completed.size > COMPLETED_KEY_LIMIT) {
      const oldest = completed.keys().next().value;
      if (oldest === undefined) break;
      completed.delete(oldest);
    }
  };

  /** 在 B1 双视图中查目标（唯一读点 list；不新增跨 target 消费者 API）。 */
  const findDirectiveView = async (projectRoot: string, id: string) => {
    const listed = await runtimeFor(projectRoot).list();
    if (!listed.ok) return { ok: false as const };
    const all = [
      ...listed.approval.active,
      ...listed.approval.consumed,
      ...listed.approval.revoked,
      ...listed.approval.expired,
      ...listed.decision.active,
      ...listed.decision.consumed,
      ...listed.decision.revoked,
      ...listed.decision.expired,
    ];
    return { ok: true as const, view: all.find((item) => item.id === id) };
  };

  /**
   * 输入式撤销（B1 交接口径）：`submitFromInput` 只创建；撤销由 C1 在确认后调 `runtime.revoke(id,target)`。
   * 面板只对**同 target 且 active** 的目标打开（已消费/已撤销/已失效/不存在/跨 target 直接如实回错，不开面板）。
   */
  async function submitRevoke(input: SubmitFromInput, id: string, body: string): Promise<SubmitResult> {
    const key = submissionKey(input);
    if (key !== undefined) {
      const existing = completed.get(key);
      if (existing !== undefined) return { ok: true, ...existing };
    }
    const requestId = `revoke-${input.target}-${id}`;
    const existingPending = pending.get(requestId);
    if (existingPending?.kind === "revoke") return existingPending.result;
    let view: Awaited<ReturnType<typeof findDirectiveView>>;
    try {
      view = await findDirectiveView(input.projectRoot, id);
    } catch (error) {
      diagnostic.error("directive.revoke.lookup.failed", error, { target: input.target });
      return { ok: false, error: "ledger-unavailable" };
    }
    if (!view.ok) return { ok: false, error: "ledger-unavailable" };
    if (view.view === undefined) return { ok: false, error: "not-found" };
    if (view.view.target !== input.target) return { ok: false, error: "target-mismatch" };
    if (view.view.status === "consumed") return { ok: false, error: "already-consumed" };
    if (view.view.status === "revoked") return { ok: false, error: "already-revoked" };
    if (view.view.status === "expired") return { ok: false, error: "expired" };
    const prefill = {
      action: view.view.action,
      scope: view.view.scope,
      until: view.view.until,
      unrecognized: [body.trim()],
    };
    const payload: DirectiveConfirmRequestPayload = {
      version: 1,
      request: {
        id: requestId,
        target: input.target,
        rawText: input.rawText,
        projectRoot: input.projectRoot,
        roleId: input.roleId,
        ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
        prefill,
        highRisk: { reasons: [] },
        confirmable: true,
        decisionGroupEnabled: input.decisionGroupEnabled,
      },
    };
    let resolveSubmit!: (result: SubmitResult) => void;
    const result = new Promise<SubmitResult>((resolve) => {
      resolveSubmit = resolve;
    });
    const entry: RevokePendingEntry = {
      kind: "revoke",
      requestId,
      target: input.target,
      rawText: input.rawText,
      projectRoot: input.projectRoot,
      roleId: input.roleId,
      ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
      ...(input.clientMessageId !== undefined ? { clientMessageId: input.clientMessageId } : {}),
      prefill,
      decisionGroupEnabled: input.decisionGroupEnabled,
      payload,
      directiveId: id,
      result,
      resolveSubmit,
    };
    pending.set(requestId, entry);
    try {
      opts.present(payload);
      diagnostic.record("directive.revoke.requested", { requestId, target: input.target, id });
    } catch (error) {
      pending.delete(requestId);
      diagnostic.error("directive.revoke.present.failed", error, { requestId });
      resolveSubmit({ ok: false, error: "presenter-unavailable" });
    }
    return result;
  }

  const cancelEntries = (predicate: (entry: PendingEntry) => boolean, reason: string): number => {
    let cancelled = 0;
    for (const [requestId, entry] of [...pending.entries()]) {
      if (!predicate(entry)) continue;
      pending.delete(requestId);
      if (entry.kind === "create") entry.resolve({ decision: "cancel" });
      else entry.resolveSubmit({ ok: false, error: "cancelled", directiveCancelled: true });
      cancelled += 1;
      diagnostic.record("directive.confirm.cancelled", { requestId, target: entry.target, reasonCode: reason });
    }
    return cancelled;
  };

  async function submitFromInput(input: SubmitFromInput): Promise<SubmitResult> {
    if (
      currentProjectRoot === undefined ||
      typeof input.projectRoot !== "string" ||
      input.projectRoot !== currentProjectRoot
    ) {
      return { ok: false, error: "invalid-input", message: "projectRoot 不是当前项目授权来源" };
    }
    if (input.target !== "approval" && input.target !== "decision") {
      return { ok: false, error: "invalid-input", message: "target 非法" };
    }
    if (typeof input.decisionGroupEnabled !== "boolean") {
      return { ok: false, error: "invalid-input", message: "decisionGroupEnabled 必须是布尔值" };
    }
    // 输入式撤销（B1 交接口径）：`@审批 撤销 #d-N` / `@决策 撤销 #d-N` 走 `runtime.revoke`，不创建新指令。
    const marker = parseDirectiveMarker(input.rawText);
    if (marker !== undefined && marker.target !== input.target) {
      return { ok: false, error: "invalid-input", message: "标记与 target 不一致" };
    }
    const revoke = marker !== undefined ? parseRevokeBody(marker.body) : undefined;
    if (revoke !== undefined) {
      if (!revoke.ok) {
        return { ok: false, error: "invalid-input", message: "撤销指令缺少合法的 #d-<seq> 目标" };
      }
      return submitRevoke(input, revoke.id, marker!.body);
    }
    const key = submissionKey(input);
    if (key !== undefined) {
      const existing = completed.get(key);
      if (existing !== undefined) return { ok: true, ...existing };
    }
    let result: SubmitResult;
    try {
      result = await runtimeFor(input.projectRoot).submitFromInput(input);
    } catch (error) {
      diagnostic.error("directive.submit.failed", error, { target: input.target });
      return { ok: false, error: "ledger-unavailable", message: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok) {
      diagnostic.record("directive.submit.failed", { target: input.target, error: result.error });
      return result;
    }
    if (key !== undefined) rememberCompleted(key, { id: result.id, target: result.target });
    diagnostic.record("directive.submit.ok", { target: result.target, id: result.id });
    let noConsumer = false;
    if (result.target === "approval") {
      try {
        const fact = runtimeFor(input.projectRoot).approvalFacts().active.find((item) => item.id === result.id);
        noConsumer = fact !== undefined && fact.action.resource.type !== "shell";
      } catch {
        noConsumer = false;
      }
    }
    emitReceipt(input.projectRoot, input.roleId, input.runtime, result.target, "created", result.id, noConsumer);
    return result;
  }

  async function respond(input: unknown): Promise<{ ok: boolean; error?: string; expired?: boolean }> {
    if (!isRecord(input)) return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    const id = typeof input["id"] === "string" ? input["id"] : "";
    if (id === "") return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    const entry = pending.get(id);
    if (entry === undefined) {
      return { ok: false, error: mainT("main.customerInput.noPendingRequest"), expired: true };
    }
    const decision = input["decision"];
    if (decision === "cancel") {
      pending.delete(id);
      if (entry.kind === "create") entry.resolve({ decision: "cancel" });
      else entry.resolveSubmit({ ok: false, error: "cancelled", directiveCancelled: true });
      diagnostic.record("directive.confirm.cancelled", { requestId: id, target: entry.target, reasonCode: "customer-cancel" });
      return { ok: true };
    }
    if (decision !== "confirm") {
      return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    }
    if (entry.kind === "revoke") {
      // 撤销只减少授权：无高危二次确认；成功后 durable 追加 revoked、回执、解析提交结果。
      let result;
      try {
        result = await runtimeFor(entry.projectRoot).revoke(entry.directiveId, entry.target);
      } catch (error) {
        diagnostic.error("directive.revoke.failed", error, { requestId: id, target: entry.target });
        return { ok: false, error: mainT("ui.directive.error.ledgerUnavailable") };
      }
      if (!result.ok) {
        // 面板保持可重试（目标可能刚被消费/撤销）；如实回错误原因。
        return { ok: false, error: directiveRevokeErrorMessage(result.error, entry.directiveId) };
      }
      pending.delete(id);
      const key = submissionKeyOf(entry.projectRoot, entry.target, entry.rawText, entry.clientMessageId);
      if (key !== undefined) rememberCompleted(key, { id: entry.directiveId, target: entry.target });
      emitReceipt(entry.projectRoot, entry.roleId, entry.runtime, entry.target, "revoked", entry.directiveId, false);
      entry.resolveSubmit({ ok: true, id: entry.directiveId, target: entry.target });
      diagnostic.record("directive.revoked", { requestId: id, target: entry.target, id: entry.directiveId });
      return { ok: true };
    }
    const validated = validateConfirmationValues(entry.target, input["values"]);
    if (!validated.ok) return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    const values = validated.values;
    const highRisk = recheckHighRisk(entry, values);
    if (!highRisk.ok) return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    if (highRisk.reasons.length > 0 && values.acknowledged !== true) {
      diagnostic.record("directive.confirm.high-risk-unacknowledged", {
        requestId: id,
        target: entry.target,
        reasonCount: highRisk.reasons.length,
      });
      return { ok: false, error: mainT("ui.directive.error.highRiskUnacknowledged") };
    }
    pending.delete(id);
    entry.resolve({ decision: "confirm", values });
    diagnostic.record("directive.confirm.accepted", { requestId: id, target: entry.target });
    return { ok: true };
  }

  async function list(input?: unknown): Promise<DirectiveListReply> {
    const projectRoot = resolveProjectRoot(input);
    if (projectRoot === undefined) {
      return { ok: false, error: mainT("ui.directive.error.panelUnavailable") };
    }
    let result;
    try {
      result = await runtimeFor(projectRoot).list();
    } catch (error) {
      diagnostic.error("directive.list.failed", error, { projectRoot });
      return { ok: false, error: mainT("ui.directive.error.ledgerUnavailable") };
    }
    if (!result.ok) return { ok: false, error: directiveSubmitErrorMessage(result.error) };
    return {
      version: 1,
      ok: true,
      directivesEnabled: true,
      projectRoot: result.projectRoot,
      approval: result.approval,
      decision: result.decision,
      ledgerErrors: result.ledgerErrors,
    };
  }

  async function revoke(input: unknown): Promise<DirectiveRevokeReply> {
    if (!isRecord(input)) return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    const id = typeof input["id"] === "string" ? input["id"] : "";
    const target = input["target"];
    if (id === "" || (target !== "approval" && target !== "decision")) {
      return { ok: false, error: mainT("ui.directive.error.incompleteParse") };
    }
    const projectRoot = resolveProjectRoot(input);
    if (projectRoot === undefined) {
      return { ok: false, error: mainT("ui.directive.error.panelUnavailable") };
    }
    let result;
    try {
      result = await runtimeFor(projectRoot).revoke(id, target);
    } catch (error) {
      diagnostic.error("directive.revoke.failed", error, { id, target });
      return { ok: false, error: mainT("ui.directive.error.ledgerUnavailable") };
    }
    if (!result.ok) return { ok: false, error: directiveRevokeErrorMessage(result.error, id) };
    const roleId = typeof input["roleId"] === "string" ? input["roleId"] : "";
    const runtime = typeof input["runtime"] === "string" && input["runtime"] !== "" ? (input["runtime"] as RuntimeKind) : undefined;
    emitReceipt(projectRoot, roleId, runtime, target, "revoked", id, false);
    diagnostic.record("directive.revoked", { id, target, projectRoot });
    return { ok: true, id, target };
  }

  async function state(): Promise<DirectiveStateView | undefined> {
    if (currentProjectRoot === undefined) return emptyState();
    const reply = await list(undefined);
    if (!reply.ok) return undefined;
    return {
      version: 1,
      directivesEnabled: true,
      projectRoot: reply.projectRoot,
      approval: reply.approval,
      decision: reply.decision,
      ledgerErrors: reply.ledgerErrors,
    };
  }

  const setCurrentProject = (projectRoot: string | undefined): void => {
    const next = typeof projectRoot === "string" && projectRoot.trim() !== "" ? projectRoot : undefined;
    if (next === currentProjectRoot) return;
    if (currentProjectRoot !== undefined) cancelEntries((entry) => entry.projectRoot === currentProjectRoot, "project-switch");
    currentProjectRoot = next;
  };

  return {
    setCurrentProject,
    currentProjectRoot: () => currentProjectRoot,
    submitFromInput,
    respond,
    list,
    revoke,
    state,
    replayPending: () => {
      let replayed = 0;
      for (const entry of pending.values()) {
        try {
          opts.present(entry.payload);
          replayed += 1;
        } catch (error) {
          diagnostic.error("directive.replay.failed", error, { requestId: entry.requestId });
        }
      }
      return replayed;
    },
    cancelAll: (reason: string) => {
      cancelEntries(() => true, reason);
    },
    cancelProject: (projectRoot: string) => {
      cancelEntries((entry) => entry.projectRoot === projectRoot, "project-switch");
    },
    decisionFacts: (projectRoot: string) => {
      if (currentProjectRoot === undefined || projectRoot !== currentProjectRoot) return undefined;
      return runtimeFor(projectRoot).decisionFacts();
    },
    applyDecisionDirective: async (projectRoot, card, hooks) => {
      if (currentProjectRoot === undefined || projectRoot !== currentProjectRoot) return undefined;
      return runtimeFor(projectRoot).applyDecisionDirective(card, hooks);
    },
  };
}
