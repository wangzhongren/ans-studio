// 客户授权平面共享 Model 契约（customer-directive/v1，2026-11-03 A1 冻结）。
//
// 依赖方向：本文件只单向依赖 `./directive-marker.ts`（target 字面集合唯一物理定义）与 `./runtime.ts`
// （`GovernanceFlowId` 与 `GOVERNANCE_SLUG_PATTERN`）。`runtime.ts` **不** import 本文件，避免 type-only
// 双向循环；Provider/Service/Pipeline/Interface 只读消费。本层不授予任何写权、不做 I/O。
//
// 字段约束（方案 §5.2；校验在主进程/Provider，fail-closed）：id 匹配 `CUSTOMER_DIRECTIVE_ID_PATTERN`；
// seq 为正整数且事件间单调；target 与 action.kind 必须匹配（本文件的判别联合在编译期锁定）；
// until 仅三值；rawText/command/host/path/selector 上限由本文件常量单一来源导出，消费方不得复制字面量；
// rawText 只存账本/面板，不打印到诊断、不进入模型上下文。

import type { DirectiveMarkerTarget } from "./directive-marker.ts";
import type { GovernanceFlowId, RuntimeKind } from "./runtime.ts";
// flowId 校验唯一来源（runtime.ts 的治理 slug 规则）；本文件不复制字面量。
import { GOVERNANCE_SLUG_PATTERN } from "./runtime.ts";

/** 账本事件 schema / 面板视图版本标识。 */
export const CUSTOMER_DIRECTIVE_SCHEMA = "customer-directive/v1";

/** 每项目独立账本（相对项目根；连字符，不是 `customer.directives.jsonl`）。 */
export const CUSTOMER_DIRECTIVES_REL = ".ans/state/customer-directives.jsonl";

/** 指令 id 形状：`d-<seq>`；seq 从 1 起、无前导零。 */
export const CUSTOMER_DIRECTIVE_ID_PATTERN = "^d-[1-9][0-9]*$";

/** 提交原文（含标记）UTF-8 字节上限；超长拒绝，不截断。 */
export const CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES = 4096;
/** shell 命令原文 UTF-8 字节上限。 */
export const CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES = 1024;
/** domain 主机名长度上限。 */
export const CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH = 253;
/** 外部目录路径 UTF-8 字节上限。 */
export const CUSTOMER_DIRECTIVE_PATH_MAX_BYTES = 512;
/** select-option 选择器 UTF-8 字节上限。 */
export const CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES = 256;

/** 两个 target 的字面集合唯一物理定义在 `directive-marker.ts`（单一来源）。 */
export type CustomerDirectiveTarget = DirectiveMarkerTarget;

/** 期限：一次 / 本次应用运行 / 长期直到撤销。 */
export type CustomerDirectiveUntil = "once" | "session" | "forever";

/** decision 指令可收窄到单个 flow；approval 事件的 scope 恒为 `{}`。 */
export interface DirectiveScope {
  flowId?: GovernanceFlowId;
}

/** 审批资源只允许 shell/domain/path——**没有**写权、代码、角色卡或边界目标。 */
export type ApprovalResource =
  | { type: "shell"; command: string; cwd: string }
  | { type: "domain"; host: string; wildcard: boolean }
  | { type: "path"; path: string };

export type ApprovalAction =
  | { kind: "allow"; resource: ApprovalResource }
  | { kind: "deny"; resource: ApprovalResource };

/** 决策动作只有选择/拒绝——不产生写权或治理卡自动通过。 */
export type DecisionAction =
  | { kind: "select-recommended" }
  | { kind: "select-option"; selector: string }
  | { kind: "reject" };

/**
 * 自然语言指令的解释请求（target=approval 用替我审批的判断 AI；target=decision 用替我决策的判断 AI）。
 * 判断器只做**纯理解**：不执行、不写盘、不落账；解释结果只作确认面板预填，客户确认后才经 B1 落账。
 */
export interface DirectiveInterpretRequest {
  target: CustomerDirectiveTarget;
  /** 标记后的正文（trim 后；可跨行）。 */
  body: string;
  /** 提交原文（含标记；与 B1 账本同一份，不截断）。 */
  rawText: string;
  projectRoot: string;
  roleId: string;
  /** 请求会话引擎（判断跟随请求会话，不跨引擎）；缺省 ⇒ 由宿主按活会话/默认引擎解析。 */
  runtime?: RuntimeKind;
}

/** 解释失败原因（稳定码；全部 fail-closed，词表只用于诊断/测试，不面向客户）。 */
export type DirectiveInterpretFailureCode =
  | "context-missing"
  | "unsupported-engine"
  | "aborted"
  | "timeout"
  | "unavailable"
  | "parse-failed"
  | "low-confidence";

/**
 * 解释结果：成功时 `candidate` 是判断 AI 交回的**未采信原始 JSON**（由编排预填构造器按 target
 * 严格校验/规范化；非法形状一律回落现有行为，绝不猜）。`confidence` 为模型自报 0..1。
 */
export type DirectiveInterpretResult =
  | { ok: true; candidate: unknown; confidence: number; notes?: string }
  | { ok: false; reasonCode: DirectiveInterpretFailureCode; reason?: string };

/** 判断器函数；契约上**不抛错**（所有失败归 `ok:false`），超时由驱动自身 fail-closed。 */
export type DirectiveInterpretFn = (
  request: DirectiveInterpretRequest,
  signal?: AbortSignal,
) => Promise<DirectiveInterpretResult>;

/** 落账时保存的高危确认记录（`reasons` 为稳定 reason 码，面板文案由 i18n 映射）。 */
export interface DirectiveHighRiskRecord {
  reasons: string[];
  acknowledged: true;
  acknowledgedAt: string;
}

/**
 * `directive.created` 事件（`customer-directive/v1`）。
 *
 * 用判别联合强化 §5.2 的 target/action 匹配约束：approval 只能配 `ApprovalAction` + `scope: {}`；
 * decision 只能配 `DecisionAction` + `DirectiveScope`。JSON 形状与方案 §5.2 一致。
 */
export type DirectiveCreatedEventV1 = {
  version: 1;
  kind: "directive.created";
  id: string;
  seq: number;
  until: CustomerDirectiveUntil;
  rawText: string;
  highRisk?: DirectiveHighRiskRecord;
  sessionId: string;
  createdAt: string;
  createdBy: "customer";
  source: "desktop-input";
} & (
  | { target: "approval"; action: ApprovalAction; scope: {} }
  | { target: "decision"; action: DecisionAction; scope: DirectiveScope }
);

/** 账本单行事件联合（append-only；每行一个 JSON 对象）。 */
export type DirectiveEventV1 =
  | DirectiveCreatedEventV1
  | {
      version: 1;
      kind: "directive.consumed";
      id: string;
      seq: number;
      at: string;
      via: { requestId?: string; toolCallId?: string; flowId?: string };
    }
  | { version: 1; kind: "directive.revoked"; id: string; seq: number; at: string; by: "customer" }
  | {
      version: 1;
      kind: "directive.expired";
      id: string;
      seq: number;
      at: string;
      reason: "app-restart" | "unused-once" | "ttl";
    };

/**
 * 消费者/面板读取的指令视图（回放派生；不是账本事件）。
 * `consumer:"none"` 表示 domain/path 等当前无消费者（Q5 A）。
 */
export interface CustomerDirectiveView {
  id: string;
  seq: number;
  target: CustomerDirectiveTarget;
  action: ApprovalAction | DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
  status: "active" | "consumed" | "revoked" | "expired";
  rawText: string;
  createdAt: string;
  consumedAt?: string;
  revokedAt?: string;
  expiredAt?: string;
  expiredReason?: string;
  highRisk?: { reasons: string[]; acknowledged: true };
  consumer: "shell-gate" | "decision-card" | "none";
}

/**
 * 审批消费者的 target-scoped fact（方案 §5.4/§6.4 I-1）。
 * 与 `DecisionDirectiveFact` 是**两个不兼容类型**：target 字面量与 action 判别均互斥。
 */
export interface ApprovalDirectiveFact {
  id: string;
  seq: number;
  target: "approval";
  action: ApprovalAction;
  scope: {};
  until: CustomerDirectiveUntil;
}

/** 决策消费者的 target-scoped fact；跨 target 赋值必须在编译期失败（I-1）。 */
export interface DecisionDirectiveFact {
  id: string;
  seq: number;
  target: "decision";
  action: DecisionAction;
  scope: DirectiveScope;
  until: CustomerDirectiveUntil;
}

/** 审批快照；`ledgerErrors > 0` ⇒ `active` 为空，消费者按无指令处理。 */
export interface ApprovalDirectiveSnapshot {
  ledgerErrors: number;
  active: ApprovalDirectiveFact[];
}

/** 决策快照；`ledgerErrors > 0` ⇒ `active` 为空，消费者按无指令处理。 */
export interface DecisionDirectiveSnapshot {
  ledgerErrors: number;
  active: DecisionDirectiveFact[];
}

/**
 * 高危原因稳定码（账本持久值；A3 i18n 必须映射全部码，未知码透传不吞）。
 * 顺序即谓词输出顺序（方案 §4.3 表序）。
 */
export const DIRECTIVE_HIGH_RISK_REASONS = [
  "forever",
  "project-decision-reject",
  "project-decision-select-option",
  "wildcard-domain",
  "wide-path",
  "wide-command",
  "switch-off-project-recommended",
] as const;

export type DirectiveHighRiskReason = (typeof DIRECTIVE_HIGH_RISK_REASONS)[number];

/**
 * 高危谓词入参。decision 必须显式提供 `decisionGroupEnabled`（Q7 A / R2 冻结，无默认值）；
 * `projectRoot` 与 `path` 由调用方按同一规则规范化后传入，谓词只做纯字符串比较（不做 OS 判定/IO）。
 */
export type DirectiveHighRiskInput =
  | {
      target: "approval";
      action: ApprovalAction;
      until: CustomerDirectiveUntil;
      projectRoot: string;
    }
  | {
      target: "decision";
      action: DecisionAction;
      until: CustomerDirectiveUntil;
      scope: DirectiveScope;
      decisionGroupEnabled: boolean;
    };

// 方案 §4.3 的 shell 元字符集（宽命令判定）；不在本文件之外复制。
const SHELL_METACHARACTERS = [";", "&&", "||", "|", ">", "<", "`", "$(", "*", "\n"] as const;

function hasFlowScope(scope: DirectiveScope): boolean {
  return typeof scope.flowId === "string" && scope.flowId.length > 0;
}

function isDriveRootPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(path);
}

function normalizePathForComparison(value: string): string {
  const slashed = value.replace(/\\/g, "/");
  if (slashed === "/" || /^[A-Za-z]:\/$/.test(slashed)) return slashed;
  return slashed.replace(/\/+$/, "");
}

function isWidePath(path: string, projectRoot: string): boolean {
  if (path === "/" || path === "\\" || path.includes("**") || isDriveRootPath(path)) return true;
  const normalizedPath = normalizePathForComparison(path);
  const normalizedRoot = normalizePathForComparison(projectRoot);
  if (normalizedPath === normalizedRoot) return true;
  const prefix = normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
  return normalizedRoot.startsWith(prefix);
}

function isWildcardHost(host: string): boolean {
  return host === "" || host === "*" || host.startsWith("*.");
}

function isWideCommand(command: string): boolean {
  return SHELL_METACHARACTERS.some((token) => command.includes(token));
}

/**
 * 计算高危原因（稳定码，按 `DIRECTIVE_HIGH_RISK_REASONS` 表序返回；每条至多一次）。
 *
 * 判定只看落账时的结构化字段：`forever`；项目级 decision reject/select-option；通配域名；
 * 宽路径（盘符根/`/`/含 `**`/等于项目根/项目根祖先）；宽命令（shell 元字符）；
 * 以及 Q7 A 下「替我决策」开关关闭时的项目级 `select-recommended`。
 * 空命令不是高危，而是被 §5.2 的非空约束拒绝（F9）。
 */
export function directiveHighRiskReasons(input: DirectiveHighRiskInput): DirectiveHighRiskReason[] {
  const reasons: DirectiveHighRiskReason[] = [];
  if (input.until === "forever") reasons.push("forever");

  if (input.target === "decision") {
    const projectWide = !hasFlowScope(input.scope);
    if (projectWide && input.action.kind === "reject") reasons.push("project-decision-reject");
    if (projectWide && input.action.kind === "select-option") {
      reasons.push("project-decision-select-option");
    }
    if (
      projectWide &&
      input.action.kind === "select-recommended" &&
      input.decisionGroupEnabled === false
    ) {
      reasons.push("switch-off-project-recommended");
    }
    return reasons;
  }

  const resource = input.action.resource;
  if (resource.type === "domain" && isWildcardHost(resource.host)) reasons.push("wildcard-domain");
  if (resource.type === "path" && isWidePath(resource.path, input.projectRoot)) {
    reasons.push("wide-path");
  }
  if (resource.type === "shell" && isWideCommand(resource.command)) reasons.push("wide-command");
  return reasons;
}
