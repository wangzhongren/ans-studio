// src/pipeline/orchestration/customer-directive.ts
// 客户授权平面 —— Pipeline 公共句柄（2026-11-03，B1 冻结）。
//
// 职责（B1 提案 §1.1）：每项目运行时句柄——
//   · `submitFromInput`：A1 marker 复校验 → presenter 取客户确认 → Service 校验/高危复算/落账；
//   · `approvalFacts`/`decisionFacts`：target-scoped 快照（消费者只读自己的 target）；
//   · `takeDirective`：shell gate 的审批消费者（精确命令 + active + `once` durable 消费）；
//   · `applyDecisionDirective`：decision 卡消费者（确定性代选/拒绝；冲突/不匹配不消费）；
//   · `revoke`/`list`：面板与输入撤销的唯一服务路径。
//
// 依赖方向：本文件 → Service 公共出口 → Provider 公共出口 → A2 共享 JSONL 辅助；Model（A1）只读。
// 本文件不写盘、不 import app/**；Provider/Service 的内部实现不越过公共出口。
//
// 冻结声明（B1 退出）：本文件导出的类型与 `createCustomerDirectiveRuntime` 形状、`takeDirective`
// 注入语义、`DecisionHooks.emitResult` 唯一钩子、`directive:{id,scope}` 审计字段、Q9 枚举由 B1 冻结；
// C1/C2 只按此消费；任何变更回编排重跑受影响证据。

import { randomUUID } from "node:crypto";

import {
  CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES,
  CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH,
  CUSTOMER_DIRECTIVE_PATH_MAX_BYTES,
  CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES,
  CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES,
  directiveHighRiskReasons,
  type ApprovalAction,
  type ApprovalDirectiveSnapshot,
  type CustomerDirectiveTarget,
  type CustomerDirectiveUntil,
  type CustomerDirectiveView,
  type DecisionAction,
  type DecisionDirectiveSnapshot,
  type DirectiveHighRiskReason,
  type DirectiveInterpretFn,
  type DirectiveInterpretResult,
  type DirectiveScope,
} from "../../model/directive.ts";
import { parseDirectiveMarker } from "../../model/directive-marker.ts";
// 低置信阈值单一来源（编排解释器驱动导出；本层只读消费，不复制字面量）。
import { DIRECTIVE_INTERPRET_MIN_CONFIDENCE } from "../../common/编排/directive-interpreter.ts";
import { GOVERNANCE_SLUG_PATTERN, type RuntimeKind, type ShellReviewRequest } from "../../model/runtime.ts";
import {
  createDirectiveFileStore,
  type DirectiveStore,
} from "../../provider/directive/public/directive-store.ts";
import {
  createDirectiveService,
  type DirectiveErrorCode,
  type DirectiveListView,
  type DirectiveService,
} from "../../service/directive/public/directive-service.ts";

export type { DirectiveErrorCode } from "../../service/directive/public/directive-service.ts";
export type { DirectiveListView } from "../../service/directive/public/directive-service.ts";
export type { DirectiveStore } from "../../provider/directive/public/directive-store.ts";

/** `submitFromInput` 入参（C1 主进程构造；`decisionGroupEnabled` 必填、无默认）。 */
export interface SubmitFromInput {
  /** 提交全文（含标记；≤ `CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES`）。 */
  rawText: string;
  /** Interface 用 A1 `parseDirectiveMarker` 判定；Pipeline 再校验 target 一致。 */
  target: CustomerDirectiveTarget;
  projectRoot: string;
  roleId: string;
  runtime?: RuntimeKind;
  clientMessageId?: string;
  /** C1 主进程 `decisionJudgeSwitch` 提交当刻快照（Q7 A / P1-CAP-04；必填、无默认）。 */
  decisionGroupEnabled: boolean;
}

export type SubmitResult =
  | { ok: true; id: string; target: CustomerDirectiveTarget }
  | { ok: false; error: DirectiveErrorCode; message?: string; directiveCancelled?: true };

/** presenter 回包的结构化字段（由 C1 面板生成；主进程按提交快照复核）。 */
export interface DirectiveConfirmationValues {
  action: ApprovalAction | DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
  /** 仅高危；缺失/非 true ⇒ `high-risk-unacknowledged`（Service 复算）。 */
  acknowledged?: true;
}

export interface DirectivePresenterRequest {
  /** 应用生成；C1 作为 IPC request.id（同一提交/重推不变）。 */
  requestId: string;
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
  highRisk: { reasons: DirectiveHighRiskReason[] };
  confirmable: boolean;
  decisionGroupEnabled: boolean;
}

export interface DirectivePresenter {
  present(req: DirectivePresenterRequest): Promise<
    { decision: "confirm"; values: DirectiveConfirmationValues } | { decision: "cancel" }
  >;
}

/** shell gate 的审批消费者返回值（`scope` 的值即账本 `until`）。 */
export interface ApprovalDirectiveDecision {
  action: "allow" | "deny";
  id: string;
  scope: CustomerDirectiveUntil;
}

/** decision 消费者入参（C1 从卡载荷构造；只处理 `cardKind==="decision"`）。 */
export interface DecisionCardFacts {
  cardKind: "decision";
  requestId: string;
  flowId?: string;
  options: readonly { id: string; label: string; recommended?: boolean }[];
}

/** 唯一可见行钩子（无 `deliver` 别名；抛错/拒绝 ⇒ 不消费、不应用、返回 undefined）。 */
export interface DecisionVisibleResult {
  kind: "selected" | "rejected";
  directiveId: string;
  action: "select-recommended" | "select-option" | "reject";
  /** selected 时必填。 */
  optionId?: string;
}

export interface DecisionHooks {
  emitResult(result: DecisionVisibleResult): void | Promise<void>;
}

export type DecisionApplyResult =
  | { kind: "selected"; id: string; optionId: string; action: "select-recommended" | "select-option" }
  | { kind: "rejected"; id: string; action: "reject" }
  | { kind: "conflict"; ids: readonly string[] }
  | { kind: "no-match"; ids: readonly string[] };

export type RevokeResult =
  | { ok: true; id: string; target: CustomerDirectiveTarget }
  | { ok: false; error: DirectiveErrorCode };

export type DirectiveListResult =
  | {
      ok: true;
      projectRoot: string;
      approval: DirectiveListView;
      decision: DirectiveListView;
      ledgerErrors: number;
    }
  | { ok: false; error: DirectiveErrorCode };

/**
 * `takeDirective` 的内部消费阶段提示（仅 B1 的 shell gate 使用）：
 *   · `"deny"`：只匹配 deny 指令（gate 在硬地板之后的 deny 预检）；
 *   · `"allow"`：先匹配 deny（竞争窗口防御），否则匹配 allow（gate 在既有 grant 之后）；
 *   · 省略：先 deny 后 allow（冻结的公共语义）。
 * C1 只调用一参形式；该可选参数不改变公共调用形状。
 */
export type ApprovalDirectiveIntent = "allow" | "deny";

export interface CustomerDirectiveRuntime {
  submitFromInput(input: SubmitFromInput): Promise<SubmitResult>;
  approvalFacts(): ApprovalDirectiveSnapshot;
  decisionFacts(): DecisionDirectiveSnapshot;
  takeDirective(
    req: ShellReviewRequest,
    intent?: ApprovalDirectiveIntent,
  ): Promise<ApprovalDirectiveDecision | undefined>;
  applyDecisionDirective(card: DecisionCardFacts, hooks?: DecisionHooks): Promise<DecisionApplyResult | undefined>;
  revoke(id: string, target: CustomerDirectiveTarget): Promise<RevokeResult>;
  list(): Promise<DirectiveListResult>;
}

export interface CreateCustomerDirectiveRuntimeOptions {
  projectRoot: string;
  /** 本次应用运行 id（C1 主进程启动生成；项目切换不重置；重启失效）。 */
  sessionId: string;
  present: DirectivePresenter;
  /**
   * 自然语言解释器（判断 AI 纯理解模式；2026-11-04 客户直修）。缺省 ⇒ 只走既有确定性解析。
   * 给出时仅在确定性解析**不可确认**、正文非空且不是撤销时调用；解释成功且严格校验通过才用于预填面板。
   * 失败/不可用/低置信/非法形状一律回退既有行为（原文 + 未识别片段、确认禁用）——**绝不猜、绝不落账**。
   */
  interpretDirective?: DirectiveInterpretFn;
  now?: () => Date;
  /** 测试注入缝；生产走 Provider 默认实现（C1 不消费）。 */
  store?: DirectiveStore;
}

const UNTIL_VALUES: readonly CustomerDirectiveUntil[] = ["once", "session", "forever"];
const SUBMISSION_KEY_LIMIT = 100;

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 命令精确匹配口径（B1 提案 §4）：trim + 折叠连续空白；不做通配/argv 推断。 */
function normalizeCommandText(value: string): string {
  return normalizeText(value);
}

function normalizeDirectoryForCompare(value: string): string {
  const slashed = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function sameDirectory(a: string, b: string): boolean {
  return normalizeDirectoryForCompare(a) === normalizeDirectoryForCompare(b);
}

function isUntil(value: unknown): value is CustomerDirectiveUntil {
  return typeof value === "string" && (UNTIL_VALUES as readonly string[]).includes(value);
}

// —————————————————————— 正文预填（保守建议；不决定 target/高危/落账） ——————————————————————

interface DirectivePrefill {
  action: ApprovalAction | DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
  unrecognized: string[];
  /** 关键字段是否足以确认（空命令/空选择器/未识别片段 ⇒ false；面板据此禁用确认）。 */
  confirmable: boolean;
  /** 非空 = 预填来自判断 AI 的解释（只作诊断/测试；不进账本、不进冻结面板载荷）。 */
  interpreted?: { confidence: number; notes?: string };
}

const FLOW_TOKEN_RE = /(?:^|\s)flow=([a-z0-9][a-z0-9-]*[a-z0-9])(?=\s|$)/;
const UNTIL_EQ_RE = /(?:^|\s)until=(once|session|forever)(?=\s|$)/i;
const UNTIL_BARE_RE = /(?:^|\s)(once|session|forever)\s*$/i;

function extractUntil(body: string): { until: CustomerDirectiveUntil; rest: string } {
  const eq = UNTIL_EQ_RE.exec(body);
  if (eq !== null) {
    return {
      until: eq[1]!.toLowerCase() as CustomerDirectiveUntil,
      rest: `${body.slice(0, eq.index)} ${body.slice(eq.index + eq[0].length)}`.trim(),
    };
  }
  const bare = UNTIL_BARE_RE.exec(body);
  if (bare !== null) {
    return {
      until: bare[1]!.toLowerCase() as CustomerDirectiveUntil,
      rest: body.slice(0, bare.index).trim(),
    };
  }
  return { until: "session", rest: body.trim() };
}

function extractFlow(body: string): { flowId?: string; rest: string } {
  const match = FLOW_TOKEN_RE.exec(body);
  if (match === null) return { rest: body.trim() };
  return {
    flowId: match[1],
    rest: `${body.slice(0, match.index)} ${body.slice(match.index + match[0].length)}`.trim(),
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function buildApprovalPrefill(body: string, projectRoot: string): DirectivePrefill {
  const unrecognized: string[] = [];
  const { until, rest: untilRest } = extractUntil(body);
  const rest = untilRest;
  const emptyShell = (): ApprovalAction => ({
    kind: "allow",
    resource: { type: "shell", command: "", cwd: projectRoot },
  });

  if (/^撤销\b/.test(rest) || /^撤销\s*#/.test(rest)) {
    // 撤销走 Pipeline `revoke`（冻结 API）；预填把原文交面板识别，不构造可落账 action。
    unrecognized.push(rest);
    return { action: emptyShell(), scope: {}, until, unrecognized, confirmable: false };
  }
  const deny = /^拒绝(?:\s+([\s\S]*))?$/.exec(rest);
  if (deny !== null) {
    const tail = (deny[1] ?? "").trim();
    if (tail !== "") unrecognized.push(tail);
    return { action: { kind: "deny", resource: { type: "shell", command: "", cwd: projectRoot } }, scope: {}, until, unrecognized, confirmable: false };
  }
  const allow = /^允许\s+([\s\S]+)$/.exec(rest);
  if (allow === null) {
    if (rest !== "") unrecognized.push(rest);
    return { action: emptyShell(), scope: {}, until, unrecognized, confirmable: false };
  }
  const args = allow[1]!.trim();
  const shell = /^shell\b\s*([\s\S]*)$/i.exec(args);
  if (shell !== null) {
    const command = unquote(shell[1]!);
    return {
      action: { kind: "allow", resource: { type: "shell", command, cwd: projectRoot } },
      scope: {},
      until,
      unrecognized,
      confirmable: command !== "",
    };
  }
  const domain = /^(?:联网|domain)\b\s*([\s\S]*)$/i.exec(args);
  if (domain !== null) {
    const tail = domain[1]!.trim();
    const keyed = /^(?:domain=|host=)(\S+)/i.exec(tail);
    const host = unquote(keyed !== null ? keyed[1]! : tail.split(/\s+/)[0] ?? "");
    const leftover = keyed !== null ? tail.slice(keyed[0].length).trim() : tail.slice(host.length).trim();
    if (leftover !== "") unrecognized.push(leftover);
    const wildcard = host === "*" || host.startsWith("*.");
    return {
      action: { kind: "allow", resource: { type: "domain", host, wildcard } },
      scope: {},
      until,
      unrecognized,
      confirmable: host !== "",
    };
  }
  const path = /^(?:外部目录|目录|path)\b\s*([\s\S]*)$/i.exec(args);
  if (path !== null) {
    const tail = path[1]!.trim();
    const keyed = /^path=(.+)$/i.exec(tail);
    const pathValue = unquote(keyed !== null ? keyed[1]! : tail);
    return {
      action: { kind: "allow", resource: { type: "path", path: pathValue } },
      scope: {},
      until,
      unrecognized,
      confirmable: pathValue !== "",
    };
  }
  unrecognized.push(args);
  return { action: emptyShell(), scope: {}, until, unrecognized, confirmable: false };
}

function buildDecisionPrefill(body: string, projectRoot: string): DirectivePrefill {
  const unrecognized: string[] = [];
  const { until, rest: untilRest } = extractUntil(body);
  const { flowId, rest } = extractFlow(untilRest);
  const scope: DirectiveScope = flowId !== undefined ? { flowId } : {};

  const recommended = /^选推荐项(?:\s*([\s\S]*))?$/.exec(rest);
  if (recommended !== null) {
    const tail = (recommended[1] ?? "").trim();
    if (tail !== "") unrecognized.push(tail);
    return { action: { kind: "select-recommended" }, scope, until, unrecognized, confirmable: tail === "" };
  }
  const only = /^只接受\s+([\s\S]+)$/.exec(rest);
  if (only !== null) {
    const selector = only[1]!.trim();
    return { action: { kind: "select-option", selector }, scope, until, unrecognized, confirmable: selector !== "" };
  }
  const reject = /^拒绝(?:\s*([\s\S]*))?$/.exec(rest);
  if (reject !== null) {
    const tail = (reject[1] ?? "").trim();
    if (tail !== "") unrecognized.push(tail);
    return { action: { kind: "reject" }, scope, until, unrecognized, confirmable: tail === "" };
  }
  if (rest !== "") unrecognized.push(rest);
  return { action: { kind: "select-recommended" }, scope, until, unrecognized, confirmable: false };
}

function buildPrefill(target: CustomerDirectiveTarget, body: string, projectRoot: string): DirectivePrefill {
  return target === "approval" ? buildApprovalPrefill(body, projectRoot) : buildDecisionPrefill(body, projectRoot);
}

// —————————————————————— 自然语言解释预填（2026-11-04 客户直修） ——————————————————————
//
// 解释器交回的是**未采信的模型 JSON**：这里按 B1 Service 的同一组字段约束做保守规范化（形状/枚举/长度），
// 非法/越界一律返回 undefined ⇒ 调用方保留确定性解析结果（面板原文 + 未识别片段、确认禁用）。
// 最终落账校验仍在 B1 Service（validateCreateInput）——本函数只是「解释结果能否摆上确认面板」的预填门槛，
// 不是第二份账本校验；Service 仍可拒绝任何它认为非法的确认值（fail-closed）。
const INTERPRET_UNTIL_VALUES: readonly CustomerDirectiveUntil[] = ["once", "session", "forever"];
// 与 Service 的 DOMAIN_RE 同形（主机名小写、无 scheme/端口/路径；* / *. 为通配）。
const INTERPRET_DOMAIN_RE = /^(?:\*|(\*\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)|([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?))$/;
const INTERPRET_ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;

function interpretByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** 与桌面撤销快路径同一前缀口径：`撤销 …` 永不交自然语言解释器（防止把撤销理解成授权）。 */
function isRevokeBodyText(body: string): boolean {
  return /^撤销(?:\s|#|$)/.test(body);
}

function buildInterpretedPrefill(
  target: CustomerDirectiveTarget,
  candidate: unknown,
  projectRoot: string,
): DirectivePrefill | undefined {
  if (!isRecord(candidate)) return undefined;
  const until = candidate["until"];
  if (typeof until !== "string" || !(INTERPRET_UNTIL_VALUES as readonly string[]).includes(until)) return undefined;
  const actionRaw = candidate["action"];
  if (!isRecord(actionRaw)) return undefined;
  const kind = actionRaw["kind"];

  if (target === "approval") {
    if (kind !== "allow" && kind !== "deny") return undefined;
    const resourceRaw = actionRaw["resource"];
    if (!isRecord(resourceRaw)) return undefined;
    const type = resourceRaw["type"];
    let resource: ApprovalAction["resource"];
    if (type === "shell") {
      const command = typeof resourceRaw["command"] === "string" ? resourceRaw["command"].trim() : "";
      if (command === "" || command.includes("\u0000")) return undefined;
      if (interpretByteLength(command) > CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES) return undefined;
      // cwd 恒为项目根：与确定性解析/Service 校验同口径；不信任模型给的目录。
      resource = { type: "shell", command, cwd: projectRoot };
    } else if (type === "domain") {
      const host = typeof resourceRaw["host"] === "string" ? resourceRaw["host"].trim().toLowerCase() : "";
      if (host === "" || host.includes("\u0000") || host.length > CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH) return undefined;
      if (!INTERPRET_DOMAIN_RE.test(host)) return undefined;
      resource = { type: "domain", host, wildcard: host === "*" || host.startsWith("*.") };
    } else if (type === "path") {
      const pathValue = typeof resourceRaw["path"] === "string" ? resourceRaw["path"].trim() : "";
      if (pathValue === "" || pathValue.includes("\u0000")) return undefined;
      if (interpretByteLength(pathValue) > CUSTOMER_DIRECTIVE_PATH_MAX_BYTES) return undefined;
      if (!INTERPRET_ABSOLUTE_PATH_RE.test(pathValue)) return undefined;
      if (pathValue.split(/[\\/]+/).some((segment) => segment === "..")) return undefined;
      resource = { type: "path", path: pathValue };
    } else {
      return undefined;
    }
    return {
      action: { kind, resource },
      scope: {},
      until: until as CustomerDirectiveUntil,
      unrecognized: [],
      confirmable: true,
    };
  }

  if (kind !== "select-recommended" && kind !== "select-option" && kind !== "reject") return undefined;
  let action: DecisionAction;
  if (kind === "select-option") {
    const selector = typeof actionRaw["selector"] === "string" ? actionRaw["selector"].trim() : "";
    if (selector === "" || selector.includes("\u0000") || /[\r\n]/.test(selector)) return undefined;
    if (interpretByteLength(selector) > CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES) return undefined;
    action = { kind: "select-option", selector };
  } else {
    action = { kind };
  }
  const scopeRaw = candidate["scope"];
  let scope: DirectiveScope = {};
  if (scopeRaw !== undefined) {
    if (!isRecord(scopeRaw)) return undefined;
    const flowId = scopeRaw["flowId"];
    if (flowId !== undefined) {
      if (typeof flowId !== "string" || !new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)) return undefined;
      scope = { flowId };
    }
  }
  return {
    action,
    scope,
    until: until as CustomerDirectiveUntil,
    unrecognized: [],
    confirmable: true,
  };
}

function previewHighRisk(
  target: CustomerDirectiveTarget,
  prefill: DirectivePrefill,
  projectRoot: string,
  decisionGroupEnabled: boolean,
): DirectiveHighRiskReason[] {
  try {
    return target === "approval"
      ? directiveHighRiskReasons({
          target: "approval",
          action: prefill.action as ApprovalAction,
          until: prefill.until,
          projectRoot,
        })
      : directiveHighRiskReasons({
          target: "decision",
          action: prefill.action as DecisionAction,
          until: prefill.until,
          scope: prefill.scope,
          decisionGroupEnabled,
        });
  } catch {
    return [];
  }
}

// —————————————————————— 运行时工厂 ——————————————————————

function validateSubmitInput(input: SubmitFromInput): string | undefined {
  if (!isRecord(input as unknown)) return "input 必须是对象";
  if (typeof input.rawText !== "string" || input.rawText.trim() === "") return "rawText 必须非空";
  if (byteLength(input.rawText) > CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES) return "rawText 超过上限";
  if (input.target !== "approval" && input.target !== "decision") return "target 非法";
  if (typeof input.projectRoot !== "string" || input.projectRoot.trim() === "") return "projectRoot 必须非空";
  if (typeof input.roleId !== "string" || input.roleId.trim() === "") return "roleId 必须非空";
  if (typeof input.decisionGroupEnabled !== "boolean") return "decisionGroupEnabled 必须是布尔值";
  if (input.clientMessageId !== undefined && (typeof input.clientMessageId !== "string" || input.clientMessageId.trim() === "")) {
    return "clientMessageId 非法";
  }
  return undefined;
}

function isConfirmResponse(
  value: unknown,
): value is { decision: "confirm"; values: DirectiveConfirmationValues } | { decision: "cancel" } {
  if (!isRecord(value)) return false;
  if (value["decision"] === "cancel") return true;
  if (value["decision"] !== "confirm") return false;
  const values = value["values"];
  if (!isRecord(values)) return false;
  return isRecord(values["action"]) && isRecord(values["scope"]) && isUntil(values["until"]);
}

function matchesFlowScope(scope: DirectiveScope, cardFlowId: string | undefined): boolean {
  if (scope.flowId === undefined) return true;
  return cardFlowId !== undefined && scope.flowId === cardFlowId;
}

function optionMatches(option: { id: string; label: string }, selector: string): boolean {
  if (option.id === selector) return true;
  const label = normalizeText(option.label);
  if (label === selector) return true;
  const separators = ["：", ":", "（", "(", "-", " "];
  return separators.some((separator) => label.startsWith(selector + separator));
}

interface ResolvedDecisionFact {
  id: string;
  seq: number;
  until: CustomerDirectiveUntil;
  action: DecisionAction;
  key: string;
  optionId?: string;
}

function resolveDecisionFact(fact: { id: string; seq: number; until: CustomerDirectiveUntil; action: DecisionAction }, card: DecisionCardFacts): ResolvedDecisionFact | { id: string; key: "no-match" } {
  if (fact.action.kind === "reject") {
    return { ...fact, key: "reject" };
  }
  if (fact.action.kind === "select-recommended") {
    const recommended = card.options.filter((option) => option.recommended === true);
    if (recommended.length !== 1) return { id: fact.id, key: "no-match" };
    return { ...fact, key: `select:${recommended[0]!.id}`, optionId: recommended[0]!.id };
  }
  const selector = normalizeText(fact.action.selector);
  const matches = card.options.filter((option) => optionMatches(option, selector));
  if (matches.length !== 1) return { id: fact.id, key: "no-match" };
  return { ...fact, key: `select:${matches[0]!.id}`, optionId: matches[0]!.id };
}

function decisionPreference(fact: { until: CustomerDirectiveUntil; seq: number }): number {
  // 优先 standing（session/forever，不消费 once）；同档取最新 seq。
  const standing = fact.until === "once" ? 1 : 0;
  return standing * 1_000_000 - fact.seq;
}

export function createCustomerDirectiveRuntime(
  opts: CreateCustomerDirectiveRuntimeOptions,
): CustomerDirectiveRuntime {
  if (typeof opts.projectRoot !== "string" || opts.projectRoot.trim() === "") {
    throw new Error("客户指令运行时：projectRoot 必须非空");
  }
  if (typeof opts.sessionId !== "string" || opts.sessionId.trim() === "") {
    throw new Error("客户指令运行时：sessionId 必须非空");
  }
  if (typeof opts.present?.present !== "function") {
    throw new Error("客户指令运行时：presenter 必须实现 present()");
  }
  const store = opts.store ?? createDirectiveFileStore(opts.projectRoot);
  const service: DirectiveService = createDirectiveService({
    projectRoot: opts.projectRoot,
    sessionId: opts.sessionId,
    store,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });
  // 预加载：不阻塞工厂返回；消费者方法各自等待 ready（fail-safe：加载前按无指令处理）。
  void service.ready().catch(() => undefined);

  const submissions = new Map<string, Promise<SubmitResult>>();

  function submissionKey(input: SubmitFromInput): string | undefined {
    if (input.clientMessageId === undefined) return undefined;
    return `${input.target}\u0000${input.rawText}\u0000${input.clientMessageId}`;
  }

  function rememberSubmission(key: string, promise: Promise<SubmitResult>): void {
    submissions.set(key, promise);
    while (submissions.size > SUBMISSION_KEY_LIMIT) {
      const oldest = submissions.keys().next().value;
      if (oldest === undefined) break;
      submissions.delete(oldest);
    }
  }

  async function doSubmit(input: SubmitFromInput): Promise<SubmitResult> {
    const quick = validateSubmitInput(input);
    if (quick !== undefined) return { ok: false, error: "invalid-input", message: quick };
    const marker = parseDirectiveMarker(input.rawText);
    if (marker === undefined || marker.target !== input.target) {
      return { ok: false, error: "invalid-input", message: "标记与 target 不一致" };
    }
    let prefill = buildPrefill(input.target, marker.body, input.projectRoot);
    // 自然语言（2026-11-04 客户直修）：确定性解析得到可确认的结构化解释 ⇒ 沿用（向后兼容）；
    // 否则交对应判断 AI 做纯理解，成功且严格校验通过才用其预填；失败/低置信/非法形状一律保留确定性结果
    // （面板原文 + 未识别片段、确认禁用）。撤销正文永不交解释器（撤销只减少授权，走既有快路径）。
    const structured = prefill.confirmable && prefill.unrecognized.length === 0;
    if (!structured && opts.interpretDirective !== undefined && marker.body.trim() !== "" && !isRevokeBodyText(marker.body)) {
      let interpretation: DirectiveInterpretResult | undefined;
      try {
        interpretation = await opts.interpretDirective({
          target: input.target,
          body: marker.body,
          rawText: input.rawText,
          projectRoot: input.projectRoot,
          roleId: input.roleId,
          ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
        });
      } catch (error) {
        // 注入实现抛错也按不可用处理（fail-closed；绝不猜、绝不落账）。
        interpretation = {
          ok: false,
          reasonCode: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      if (interpretation.ok && interpretation.confidence >= DIRECTIVE_INTERPRET_MIN_CONFIDENCE) {
        const interpreted = buildInterpretedPrefill(input.target, interpretation.candidate, input.projectRoot);
        if (interpreted !== undefined) {
          interpreted.interpreted = {
            confidence: interpretation.confidence,
            ...(interpretation.notes !== undefined ? { notes: interpretation.notes } : {}),
          };
          prefill = interpreted;
        }
      }
    }
    const previewReasons = previewHighRisk(input.target, prefill, input.projectRoot, input.decisionGroupEnabled);
    const request: DirectivePresenterRequest = {
      requestId: `directive-${randomUUID()}`,
      target: input.target,
      rawText: input.rawText,
      projectRoot: input.projectRoot,
      roleId: input.roleId,
      ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
      prefill: {
        action: prefill.action,
        scope: prefill.scope,
        until: prefill.until,
        unrecognized: [...prefill.unrecognized],
      },
      highRisk: { reasons: previewReasons },
      confirmable: prefill.confirmable && prefill.unrecognized.length === 0,
      decisionGroupEnabled: input.decisionGroupEnabled,
    };

    let response: Awaited<ReturnType<DirectivePresenter["present"]>>;
    try {
      response = await opts.present.present(request);
    } catch (err) {
      return { ok: false, error: "presenter-unavailable", message: err instanceof Error ? err.message : String(err) };
    }
    if (!isConfirmResponse(response)) {
      return { ok: false, error: "presenter-unavailable", message: "presenter 回包形状非法" };
    }
    if (response.decision === "cancel") {
      return { ok: false, error: "cancelled", directiveCancelled: true };
    }
    const values = response.values;
    const targetMatches =
      input.target === "approval"
        ? values.action.kind === "allow" || values.action.kind === "deny"
        : values.action.kind === "select-recommended" || values.action.kind === "select-option" || values.action.kind === "reject";
    if (!targetMatches) return { ok: false, error: "invalid-input", message: "回包 action 与 target 不一致" };
    const created = await service.create({
      target: input.target,
      action: values.action,
      scope: values.scope,
      until: values.until,
      rawText: input.rawText,
      projectRoot: input.projectRoot,
      decisionGroupEnabled: input.decisionGroupEnabled,
      ...(values.acknowledged === true ? { acknowledged: true } : {}),
    }).catch((err: unknown) => ({
      ok: false as const,
      error: "ledger-write-failed" as const,
      message: err instanceof Error ? err.message : String(err),
    }));
    return created.ok
      ? { ok: true, id: created.id, target: created.target }
      : { ok: false, error: created.error, ...(created.message !== undefined ? { message: created.message } : {}) };
  }

  async function submitFromInput(input: SubmitFromInput): Promise<SubmitResult> {
    const key = submissionKey(input);
    if (key === undefined) return doSubmit(input);
    const existing = submissions.get(key);
    if (existing !== undefined) return existing;
    const promise = doSubmit(input);
    rememberSubmission(key, promise);
    return promise;
  }

  async function takeDirective(
    req: ShellReviewRequest,
    intent?: ApprovalDirectiveIntent,
  ): Promise<ApprovalDirectiveDecision | undefined> {
    try {
      await service.ready();
      if (service.getLoadError() !== undefined) return undefined;
      const facts = service.approvalFacts();
      if (facts.ledgerErrors > 0) return undefined;
      const command = normalizeCommandText(typeof req.command === "string" ? req.command : "");
      const cwd = typeof req.cwd === "string" ? req.cwd : "";
      const matching = facts.active.filter((fact) => {
        if (fact.target !== "approval") return false; // 防御：跨 target/伪造记录丢弃（I-3）
        const resource = fact.action.resource;
        return resource.type === "shell" &&
          normalizeCommandText(resource.command) === command &&
          sameDirectory(resource.cwd, cwd);
      });
      const denyMatches = matching.filter((fact) => fact.action.kind === "deny");
      const allowMatches = matching.filter((fact) => fact.action.kind === "allow");
      const candidates =
        intent === "deny"
          ? denyMatches
          : intent === "allow"
            ? (denyMatches.length > 0 ? denyMatches : allowMatches)
            : (denyMatches.length > 0 ? denyMatches : allowMatches);
      if (candidates.length === 0) return undefined;
      const chosen = [...candidates].sort((a, b) => {
        const standing = (fact: typeof a): number => (fact.until === "once" ? 1 : 0);
        return standing(a) - standing(b) || b.seq - a.seq;
      })[0]!;
      if (chosen.until === "once") {
        const consumed = await service.consume(chosen.id, { toolCallId: req.toolCallId });
        if (!consumed.ok) return undefined; // 消费失败 ⇒ 回落既有路径，绝不重复使用
      }
      return {
        action: chosen.action.kind === "deny" ? "deny" : "allow",
        id: chosen.id,
        scope: chosen.until,
      };
    } catch {
      return undefined;
    }
  }

  async function applyDecisionDirective(
    card: DecisionCardFacts,
    hooks?: DecisionHooks,
  ): Promise<DecisionApplyResult | undefined> {
    try {
      if (card.cardKind !== "decision") return undefined;
      await service.ready();
      if (service.getLoadError() !== undefined) return undefined;
      const facts = service.decisionFacts();
      if (facts.ledgerErrors > 0) return undefined;
      const applicable = facts.active.filter((fact) => fact.target === "decision" && matchesFlowScope(fact.scope, card.flowId));
      if (applicable.length === 0) return undefined;

      const resolved = applicable.map((fact) => resolveDecisionFact(fact, card));
      const noMatch = resolved.filter((item) => item.key === "no-match");
      const definite = resolved.filter((item): item is ResolvedDecisionFact => item.key !== "no-match");
      if (definite.length === 0) {
        return { kind: "no-match", ids: noMatch.map((item) => item.id) };
      }
      const keys = new Set(definite.map((item) => item.key));
      if (keys.size > 1) {
        return { kind: "conflict", ids: definite.map((item) => item.id) };
      }
      const chosen = [...definite].sort((a, b) => decisionPreference(a) - decisionPreference(b))[0]!;
      const visible: DecisionVisibleResult = chosen.key === "reject"
        ? { kind: "rejected", directiveId: chosen.id, action: "reject" }
        : {
            kind: "selected",
            directiveId: chosen.id,
            action: chosen.action.kind === "select-recommended" ? "select-recommended" : "select-option",
            ...(chosen.optionId !== undefined ? { optionId: chosen.optionId } : {}),
          };
      if (visible.kind === "selected" && visible.optionId === undefined) return undefined;
      if (hooks === undefined || typeof hooks.emitResult !== "function") return undefined;
      try {
        await hooks.emitResult(visible);
      } catch {
        return undefined; // 可见行失败 ⇒ 不消费、不应用、回落客户卡
      }
      if (chosen.until === "once") {
        const consumed = await service.consume(chosen.id, { requestId: card.requestId });
        if (!consumed.ok) return undefined;
      }
      return visible.kind === "selected"
        ? { kind: "selected", id: chosen.id, optionId: visible.optionId!, action: visible.action as "select-recommended" | "select-option" }
        : { kind: "rejected", id: chosen.id, action: "reject" };
    } catch {
      return undefined;
    }
  }

  async function revoke(id: string, target: CustomerDirectiveTarget): Promise<RevokeResult> {
    try {
      const result = await service.revoke(id, target);
      return result.ok ? { ok: true, id, target } : { ok: false, error: result.error };
    } catch {
      return { ok: false, error: "ledger-unavailable" };
    }
  }

  async function list(): Promise<DirectiveListResult> {
    try {
      await service.ready();
      if (service.getLoadError() !== undefined) return { ok: false, error: "ledger-unavailable" };
      const listed = service.list();
      return {
        ok: true,
        projectRoot: opts.projectRoot,
        approval: listed.approval,
        decision: listed.decision,
        ledgerErrors: listed.ledgerErrors,
      };
    } catch {
      return { ok: false, error: "ledger-unavailable" };
    }
  }

  return {
    submitFromInput,
    approvalFacts: () => service.approvalFacts(),
    decisionFacts: () => service.decisionFacts(),
    takeDirective,
    applyDecisionDirective,
    revoke,
    list,
  };
}
