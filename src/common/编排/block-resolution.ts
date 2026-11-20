// src/common/编排/block-resolution.ts
// 编排主属（2026-11-20 block resolver 第一批「编排地基」）：**block 分类/路由纯策略**。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §三（9 类判定/优先级）、
// §四（决策路由/judge/客户主权）、§五（生命周期/幂等/指纹）、§六（逐机制接合）、§七（落地形态）、
// §九 Q1–Q10 默认全部采纳；协调方 Q4 最终澄清：**终止只能由客户在决策卡中显式选择，judge 永不选择；
// 终止是 decided 的结果，不是停止态**。客户原则：所有 block 必须有解法，终态只有 fixed / decided。
//
// 纪律：
//  · **纯函数**：无 I/O、无时钟、无随机；输入 = 宿主已核验事实（错误码/账本/任务/证据事实），
//    **不采信模型自报文本**（summary 只作审计展示，不参与分类）。
//  · **无 stop 分支**：路由 kind 只含 engine-auto-fix / owner-repair / judge-decision /
//    customer-decision / escalated；`block-terminate-flow` 仅是客户主权卡选项（decision 结果）。
//  · 本模块不写账本、不建任务、不发卡；账本生命周期在 `block-ledger.ts`，桌面 router 消费本模块决策。
//  · 卡选项词表单一来源 = `model/runtime.ts`（`BLOCK_DECISION_OPTION_IDS` / `BLOCK_SOVEREIGN_OPTION_IDS`），
//    本模块只提供装配/推荐/校验。

import { createHash } from "node:crypto";

import type {
  BlockOptionId,
  StageBlockedEvent,
  TaskReportStatus,
  TaskReportedEvent,
  WorkflowProtocol,
  WorkflowStage,
} from "../../model/runtime.ts";
import {
  BLOCK_DECISION_OPTION_IDS,
  BLOCK_TERMINATE_OPTION_ID,
  isBlockDecisionOptionId,
  isBlockOptionId,
  isBlockSovereignOptionId,
} from "../../model/runtime.ts";

// —————————————— 9 类分类学（设计 §三 表；顺序即优先级，上=更具体） ——————————————

export const BLOCK_CLASS_DEFINITIONS = Object.freeze([
  { code: "B1", id: "missing-resource", title: "缺文件/资源" },
  { code: "B2", id: "missing-capability", title: "缺能力/权限" },
  { code: "B3", id: "scope-tradeoff", title: "范围歧义/业务取舍" },
  { code: "B4", id: "high-risk", title: "高风险动作" },
  { code: "B5", id: "environment-infra", title: "环境/基础设施" },
  { code: "B6", id: "protocol-reconcile", title: "协议/对账" },
  { code: "B7", id: "repeat-rejection", title: "重复拒绝循环" },
  { code: "B8", id: "model-anomaly", title: "模型行为异常" },
  { code: "B9", id: "budget-quota", title: "预算/配额耗尽" },
] as const);

export type BlockClass = (typeof BLOCK_CLASS_DEFINITIONS)[number]["id"];
export type BlockClassCode = (typeof BLOCK_CLASS_DEFINITIONS)[number]["code"];
export const BLOCK_CLASSES: readonly BlockClass[] = Object.freeze(
  BLOCK_CLASS_DEFINITIONS.map((entry) => entry.id),
);

/** 类 → 序号/优先级（0 = 最高；同一事实命中多类时取最小序号）。 */
const CLASS_PRIORITY: Readonly<Record<BlockClass, number>> = Object.freeze(
  Object.fromEntries(BLOCK_CLASS_DEFINITIONS.map((entry, index) => [entry.id, index])) as Record<BlockClass, number>,
);

/** 类 → `B1`..`B9` 编码（审计/展示用；分类语义以 id 为准）。 */
export function blockClassCodeOf(cls: BlockClass): BlockClassCode {
  const found = BLOCK_CLASS_DEFINITIONS.find((entry) => entry.id === cls);
  if (found === undefined) throw new TypeError(`未知 block 类：${String(cls)}`);
  return found.code;
}

export function isBlockClass(value: unknown): value is BlockClass {
  return typeof value === "string" && (BLOCK_CLASSES as readonly string[]).includes(value);
}

// —————————————— 事实输入（宿主核验；模型自报不入分类） ——————————————

/** block 事实源协议（fixed-v2.1 在飞 / app-dispatch/v1 / legacy 只读观察）。 */
export type BlockProtocol = WorkflowProtocol | "legacy";
export const BLOCK_PROTOCOLS: readonly BlockProtocol[] = Object.freeze(["fixed-v2.1", "app-dispatch/v1", "legacy"]);

export function isBlockProtocol(value: unknown): value is BlockProtocol {
  return typeof value === "string" && (BLOCK_PROTOCOLS as readonly string[]).includes(value);
}

/** 事实种类（应用从哪个事实源观察到的；决定默认兜底类，不决定采信）。 */
export type BlockFactKind =
  | "stage.blocked"
  | "task.reported"
  | "dispatch-rejection"
  | "service-rejection"
  | "reconcile"
  | "stall"
  | "shell-denial"
  | "shell-escalation"
  | "watchdog"
  | "release"
  | "redispatch"
  | "driver-observation";

export const BLOCK_FACT_KINDS: readonly BlockFactKind[] = Object.freeze([
  "stage.blocked", "task.reported", "dispatch-rejection", "service-rejection", "reconcile",
  "stall", "shell-denial", "shell-escalation", "watchdog", "release", "redispatch", "driver-observation",
]);

/**
 * 分类输入：**只认错误码/账本/任务/证据事实**。
 * `summary` 仅为审计展示（写进 `block.raised.summary`），**不参与分类**；
 * `detailCode` 是宿主从报告/命令原文确定性派生的二级码（更具体，优先于一级 code）。
 */
export interface BlockFact {
  readonly protocol: BlockProtocol;
  readonly kind: BlockFactKind;
  /** 一级稳定码（错误码/拒绝码/事件码）。 */
  readonly code?: string;
  /** 二级确定性码（如 `shell-out-of-bounds` / `report-evidence-missing`；优先于 code）。 */
  readonly detailCode?: string;
  readonly source?: string;
  readonly workflowId?: string;
  readonly flowId?: string;
  readonly stage?: WorkflowStage;
  readonly taskId?: string;
  readonly requestId?: string;
  readonly reportStatus?: TaskReportStatus;
  readonly evidencePaths?: readonly string[];
  readonly evidenceHashes?: readonly string[];
  readonly attempts?: number;
  /** 指纹材料（宿主给出的稳定事实串，如任务文本 hash/operationId/scope hash/命令原文 hash）。 */
  readonly fingerprintMaterial?: readonly string[];
  readonly highRisk?: boolean;
  /** 「替我决策」开关（宿主读取；缺省 = 关闭）。 */
  readonly judgeAvailable?: boolean;
  /** 同指纹已发生的 raised 次数（由 `block-ledger` 在写入时计算；缺省 0）。 */
  readonly priorOccurrences?: number;
  /** 缺失可确定性补齐（B3 引擎先派生一次）。 */
  readonly derivable?: boolean;
  /** 引擎能否确定性修复（B6 默认 true；false ⇒ 属主修复/客户决策）。 */
  readonly engineCanRepair?: boolean;
  /** 需要客户授权（shell 授权/例外；⇒ 客户主权卡，judge 不接）。 */
  readonly requiresAuthorization?: boolean;
  /** 需客户提供环境/物料（⇒ 客户决策，不是静默停）。 */
  readonly requiresCustomer?: boolean;
  /** 外部输入/客户物料缺失（B1 ⇒ 客户，而非属主）。 */
  readonly externalInput?: boolean;
  /** 越界行为（如幕僚越界 shell；B8 属主修复）。 */
  readonly outOfScope?: boolean;
  /** 真实态冲突（stage-transition-invalid 的 B6 面）。 */
  readonly stateConflict?: boolean;
  /** 模型误用（stage-transition-invalid 的 B8 面）。 */
  readonly modelMisuse?: boolean;
  /** 预算类是否属 decision 组业务取舍（B9 judge 可代批的前提）。 */
  readonly judgeEligible?: boolean;
  /** 宿主明确标记客户主权（合并/stable 写/终止等）。 */
  readonly sovereign?: boolean;
  /** 安全分类门禁止自动重派（P26 等）。 */
  readonly autoFixForbidden?: boolean;
  /** 责任属主（由宿主按文档种类/任务创建者给出；缺省按类兜底）。 */
  readonly ownerRoleId?: string;
  /** 审计摘要（不参与分类）。 */
  readonly summary?: string;
  /** 审计附加事实（可序列化；不参与分类）。 */
  readonly audit?: Readonly<Record<string, string | number | boolean>>;
}

// —————————————— 策略 / 计时默认（Q10：可配置注入；首版测试钉死） ——————————————

export interface BlockTimings {
  /** 停滞检测阈值：默认 12 分钟（沿用 RR 驱动观察值）。 */
  readonly stallMs: number;
  /** 修复任务超时升级：默认 10 分钟。 */
  readonly repairMs: number;
  /** 客户卡提醒：默认 30 分钟（同一卡，不重弹）。 */
  readonly remindMs: number;
}

export const DEFAULT_BLOCK_TIMINGS: BlockTimings = Object.freeze({
  stallMs: 12 * 60 * 1000,
  repairMs: 10 * 60 * 1000,
  remindMs: 30 * 60 * 1000,
});

/** 同指纹重复阈值（设计 §5.3/Q10：同指纹 2 次 ⇒ 只允许 escalated）。 */
export const BLOCK_REPEAT_THRESHOLD = 2;
/** 引擎自动修复默认尝试上限（B5 有界自动恢复）。 */
export const DEFAULT_MAX_AUTO_FIX_ATTEMPTS = 2;

export interface BlockResolverPolicy {
  /** 同指纹重复阈值（默认 2；最小 2）。 */
  readonly repeatThreshold?: number;
  /** 计时默认（stall/repair/remind）。 */
  readonly timings?: Partial<BlockTimings>;
  /** 「替我决策」默认开关（缺省关闭；事实 `judgeAvailable` 优先于本策略的显式 false）。 */
  readonly judgeEnabled?: boolean;
  /** B5 自动修复尝试上限（默认 2）。 */
  readonly maxAutoFixAttempts?: number;
}

export function resolveBlockTimings(overrides?: Partial<BlockTimings>): BlockTimings {
  const pick = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  return {
    stallMs: pick(overrides?.stallMs, DEFAULT_BLOCK_TIMINGS.stallMs),
    repairMs: pick(overrides?.repairMs, DEFAULT_BLOCK_TIMINGS.repairMs),
    remindMs: pick(overrides?.remindMs, DEFAULT_BLOCK_TIMINGS.remindMs),
  };
}

function normalizeRepeatThreshold(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 2
    ? Math.floor(value)
    : BLOCK_REPEAT_THRESHOLD;
}

function normalizeMaxAutoFix(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : DEFAULT_MAX_AUTO_FIX_ATTEMPTS;
}

// —————————————— 指纹 / blockId / 幂等键（设计 §5.2） ——————————————

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 指纹材料：宿主给出则原样使用（顺序有意义）；否则按稳定事实派生（不含模型自报文本）。 */
export function blockFingerprintMaterial(fact: BlockFact): readonly string[] {
  if (fact.fingerprintMaterial !== undefined && fact.fingerprintMaterial.length > 0) {
    return [...fact.fingerprintMaterial];
  }
  const material: string[] = [
    `code:${fact.code ?? ""}`,
    `kind:${fact.kind}`,
    `detail:${fact.detailCode ?? ""}`,
  ];
  if (fact.workflowId !== undefined) material.push(`wf:${fact.workflowId}`);
  if (fact.stage !== undefined) material.push(`stage:${fact.stage}`);
  if (fact.taskId !== undefined) material.push(`task:${fact.taskId}`);
  for (const hash of [...(fact.evidenceHashes ?? [])].sort()) material.push(`evidence:${hash}`);
  return material;
}

/** 指纹 = SHA-256(JSON(材料))（64 hex；同 code + 同稳定事实 ⇒ 同指纹）。 */
export function computeBlockFingerprint(fact: BlockFact): string {
  return sha256Hex(JSON.stringify(blockFingerprintMaterial(fact)));
}

/**
 * `blockId = sha256(protocol|workflowId|stage|taskId|code|fingerprint).slice(0,24)`（设计 §5.2）。
 */
export function computeBlockId(fact: BlockFact): string {
  const material = [
    fact.protocol,
    fact.workflowId ?? "",
    fact.stage ?? "",
    fact.taskId ?? "",
    fact.code ?? "",
    computeBlockFingerprint(fact),
  ].join("|");
  return sha256Hex(material).slice(0, 24);
}

export type BlockEventKind = "block.raised" | "block.routed" | "block.resolved" | "block.escalated";
export const BLOCK_EVENT_KINDS: readonly BlockEventKind[] = Object.freeze([
  "block.raised", "block.routed", "block.resolved", "block.escalated",
]);

/** 幂等键：`block:<blockId>:<kind>:<attempt>`（设计 §5.2；同键 replay 返回原回执）。 */
export function blockIdempotencyKey(blockId: string, kind: BlockEventKind, attempt: number): string {
  const safeAttempt = Number.isSafeInteger(attempt) && attempt >= 1 ? attempt : 1;
  return `block:${blockId}:${kind}:${safeAttempt}`;
}

/** block 决策卡 requestId（设计 §4.3：确定性、同 block 只保留一张有效卡）。 */
export function blockCardRequestId(blockId: string): string {
  return `block-card-${blockId}`;
}

// —————————————— 码 → 类映射（附录 A 全表 + P1–P51 + app-dispatch/shell 码） ——————————————
//
// 优先级口径：重复指纹（B7）→ 显式 highRisk（B4）→ detailCode → code → 事实信号 → 兜底。
// 只认稳定码/结构化事实；不解析模型报告正文。

const CODE_CLASSES: Readonly<Record<string, BlockClass>> = Object.freeze({
  // B1 缺文件/资源（P4/P5/P15/P20/P25；A8 证据类）
  "close-report-missing": "missing-resource",
  "baseline-document-missing": "missing-resource",
  "baseline-team-plan-invalid": "missing-resource",
  "baseline-plan-hash-drift": "missing-resource",
  "baseline-roster-drift": "missing-resource",
  "basis-document-missing": "missing-resource",
  "basis-missing": "missing-resource",
  "basis-drift": "missing-resource",
  "basis-hash-mismatch": "missing-resource",
  "intent-entry-missing": "missing-resource",
  "intent-hash-drift": "missing-resource",
  "acceptance-archive-failed": "missing-resource",
  "acceptance-record-invalid": "missing-resource",
  "missing-contract": "missing-resource",
  "contract-missing": "missing-resource",
  "dispatch-contract-missing": "missing-resource",
  "review-role-unavailable": "missing-resource",
  "activation-document-invalid": "missing-resource",
  "activation-hash-drift": "missing-resource",
  "activation-roster-mismatch": "missing-resource",

  // B2 缺能力/权限（P10/P21/P22/P36/P37）
  "professional-role-unavailable": "missing-capability",
  "vca-role-not-allowed": "missing-capability",
  "document-planning-source-unavailable": "missing-capability",
  "worker-dispatch-source-unavailable": "missing-capability",
  "stage-request-source-missing": "missing-capability",
  "dispatch-evidence-missing": "missing-capability",
  "stage-request-required": "missing-capability",
  "review-role-invalid": "missing-capability",
  "target-card-missing": "missing-capability",
  "capability-unavailable": "missing-capability",
  "tool-unavailable": "missing-capability",
  "boundary-denied": "missing-capability",
  "acl-denied": "missing-capability",
  "shell-c-deny": "missing-capability",
  "shell-judge-deny": "missing-capability",
  "shell-judge-manual": "missing-capability",

  // B3 范围歧义/业务取舍（P16/P24）
  "b-change-scope-invalid": "scope-tradeoff",
  "b-change-scope-requires-rapporteur": "scope-tradeoff",
  "scope-ambiguous": "scope-tradeoff",
  "scope-tradeoff": "scope-tradeoff",
  "acceptance-criteria-conflict": "scope-tradeoff",
  "plan-escalation": "scope-tradeoff",
  "material-choice": "scope-tradeoff",
  "decision-required": "scope-tradeoff",
  "business-tradeoff": "scope-tradeoff",

  // B4 高风险动作（P31/P38；merge-main/stable-write/shell 授权）
  "merge-main": "high-risk",
  "stable-write": "high-risk",
  "high-risk-action": "high-risk",
  "high-risk-blocked": "high-risk",
  "release-high-risk": "high-risk",
  "shell-escalation": "high-risk",
  "customer-authorization-required": "high-risk",
  "destructive-action": "high-risk",

  // B5 环境/基础设施（P5/P6/P7/P18/P22/P28/P29/P33/P34/P36/P43/P44/P46/P47/P50）
  "b-repository-required": "environment-infra",
  "project-config-write-failed": "environment-infra",
  "baseline-gitignore-write-failed": "environment-infra",
  "baseline-identity-invalid": "environment-infra",
  "baseline-ledger-write-failed": "environment-infra",
  "workflow-ledger-write-failed": "environment-infra",
  "release-ledger-write-failed": "environment-infra",
  "network-offline": "environment-infra",
  "network-unavailable": "environment-infra",
  "model-request-failed": "environment-infra",
  "model-timeout": "environment-infra",
  "session-open-failed": "environment-infra",
  "target-busy": "environment-infra",
  "delivery-failed": "environment-infra",
  "delivery-queue-failed": "environment-infra",
  "port-unavailable": "environment-infra",
  "disk-full": "environment-infra",
  "permission-denied": "environment-infra",
  "workflow-stop-unconfirmed": "environment-infra",
  "dispatch-source-changed": "environment-infra",
  "release-merge-failed": "environment-infra",
  "release-failed": "environment-infra",
  "shell-a-unavailable": "environment-infra",
  "shell-a-timeout": "environment-infra",
  "redispatch-safety-gate": "environment-infra",
  "terminate-unconfirmed": "environment-infra",
  "escalation-channel-unavailable": "environment-infra",
  "handback-register-failed": "environment-infra",
  "handback-render-failed": "environment-infra",
  "queue-stuck": "environment-infra",
  "repeat-fail": "environment-infra",
  "cmd-timeout": "environment-infra",
  "propose-recovery": "environment-infra",
  "vca-channel-unavailable": "environment-infra",
  "chief-role-missing": "environment-infra",
  "environment-unavailable": "environment-infra",
  "channel-unavailable": "environment-infra",

  // B6 协议/对账（P8/P9/P11–P13/P17/P32）
  "workflow-corrupt": "protocol-reconcile",
  "workflow-protocol-mismatch": "protocol-reconcile",
  "workflow-binding-unavailable": "protocol-reconcile",
  "workflow-not-found": "protocol-reconcile",
  "workflow-closed": "protocol-reconcile",
  "workflow-definition-unknown": "protocol-reconcile",
  "workflow-definition-version-unsupported": "protocol-reconcile",
  "workflow-active-conflict": "protocol-reconcile",
  "workflow-workspace-busy": "protocol-reconcile",
  "workflow-stopping": "protocol-reconcile",
  "stage-workflow-mismatch": "protocol-reconcile",
  "stage-transition-invalid": "protocol-reconcile",
  "stage-request-removed": "protocol-reconcile",
  "stage-request-open": "protocol-reconcile",
  "b2-stage-request-forbidden": "protocol-reconcile",
  "reconcile-corrupt": "protocol-reconcile",
  "reconcile-error": "protocol-reconcile",
  "reconcile-reference-mismatch": "protocol-reconcile",
  "chief-hub-flow-unavailable": "protocol-reconcile",
  "definition-hash-mismatch": "protocol-reconcile",
  "ledger-order-invalid": "protocol-reconcile",
  "event-order-invalid": "protocol-reconcile",

  // B7 重复拒绝循环（由指纹阈值触发；显式码亦归本类）
  "repeat-rejection": "repeat-rejection",
  "repeated-rejection": "repeat-rejection",
  "fingerprint-repeat": "repeat-rejection",

  // B8 模型行为异常（P1–P3/P10/P14/P19/P23/P35/P39–P42/P45/P48–P51）
  "task-closed-rejected": "model-anomaly",
  "task-report-failed": "model-anomaly",
  "task-report-blocked": "model-anomaly",
  "stage-request-invalid": "model-anomaly",
  "card-prompt-mismatch": "model-anomaly",
  "card-prompt-document-invalid": "model-anomaly",
  "review-target-invalid": "model-anomaly",
  "workflow-path-not-stage-request": "model-anomaly",
  "module-paths-mismatch": "model-anomaly",
  "self-dispatch": "model-anomaly",
  "unknown-source": "model-anomaly",
  "chief-to-project-forbidden": "model-anomaly",
  "chief-production-dispatch-forbidden": "model-anomaly",
  "convener-to-verifier-forbidden": "model-anomaly",
  "convener-target-forbidden": "model-anomaly",
  "chief-dispatch-removed": "model-anomaly",
  "convener-builtin-dispatch-forbidden": "model-anomaly",
  "worker-dispatch-required": "model-anomaly",
  "model-hallucination": "model-anomaly",
  "invalid-tool-arguments": "model-anomaly",
  "empty-turn": "model-anomaly",
  "boundary-violation": "model-anomaly",
  "out-of-bounds-read": "model-anomaly",
  "out-of-bounds-write": "model-anomaly",
  "out-of-bounds-shell": "model-anomaly",
  "turn-deadline": "model-anomaly",
  "log-silence": "model-anomaly",
  "patrol": "model-anomaly",
  "stuck-role": "model-anomaly",
  "flow-stall": "model-anomaly",
  "stalled-no-progress": "model-anomaly",
  "blocked-unrecovered": "model-anomaly",
  "driver-gate-early-stop": "model-anomaly",
  "close-identity-invalid": "model-anomaly",
  "close-task-invalid": "model-anomaly",
  "intent-decision-invalid": "model-anomaly",
  "blocked-report-needs-routing": "model-anomaly",
  "invalid-report": "model-anomaly",
  "tool-misuse": "model-anomaly",

  // B9 预算/配额耗尽（P27/P30）
  "retry-budget-exhausted": "budget-quota",
  "auto-retry-exhausted": "budget-quota",
  "redispatch-exhausted": "budget-quota",
  "redispatch-limit": "budget-quota",
  "turn-budget-exhausted": "budget-quota",
  "approval-retry-capped": "budget-quota",
  "retry-capped": "budget-quota",
  "repair-limit-exhausted": "budget-quota",
  "budget-exhausted": "budget-quota",
  "quota-exhausted": "budget-quota",
});

const DETAIL_CLASSES: Readonly<Record<string, BlockClass>> = Object.freeze({
  "missing-evidence": "missing-resource",
  "missing-file": "missing-resource",
  "missing-module": "missing-resource",
  "roster-unreadable": "missing-resource",
  "report-evidence-missing": "missing-resource",
  "verification-channel-unavailable": "missing-capability",
  "shell-capability-required": "missing-capability",
  "shell-out-of-bounds": "model-anomaly",
  "out-of-bounds": "model-anomaly",
  "taskkind-misuse": "model-anomaly",
  "parameter-misuse": "model-anomaly",
  "scope-tradeoff": "scope-tradeoff",
  "business-tradeoff": "scope-tradeoff",
  "state-conflict": "protocol-reconcile",
  "protocol-conflict": "protocol-reconcile",
  "reconcile": "protocol-reconcile",
  "budget-exhausted": "budget-quota",
  "high-risk-authorization": "high-risk",
  "environment": "environment-infra",
  "transport": "environment-infra",
  "model-anomaly": "model-anomaly",
  "repeat": "repeat-rejection",
  "unclassified": "model-anomaly",
});

/** 已知错误/拒绝码 → 类（导出供测试矩阵与桌面展示；未列出的码走事实信号/兜底）。 */
export function blockClassForCode(code: string): BlockClass | undefined {
  return CODE_CLASSES[code];
}

/** 已知二级码 → 类（优先于一级 code）。 */
export function blockClassForDetailCode(detailCode: string): BlockClass | undefined {
  return DETAIL_CLASSES[detailCode];
}

function pickHighestPriority(classes: readonly BlockClass[]): BlockClass {
  let best: BlockClass | undefined;
  for (const cls of classes) {
    if (best === undefined || CLASS_PRIORITY[cls] < CLASS_PRIORITY[best]) best = cls;
  }
  return best ?? "model-anomaly";
}

export interface BlockClassification {
  readonly class: BlockClass;
  readonly classCode: BlockClassCode;
  /** 分类依据（稳定短语，如 `code:workflow-corrupt` / `repeat-fingerprint`）。 */
  readonly reason: string;
  readonly repeat: boolean;
  /** 重复升级前的底层类（仅 repeat=true 时给出）。 */
  readonly repeatOf?: BlockClass;
  readonly priorOccurrences: number;
  readonly threshold: number;
}

const SHELL_KINDS: ReadonlySet<BlockFactKind> = new Set<BlockFactKind>(["shell-denial", "shell-escalation"]);

function baseClassOf(fact: BlockFact): { cls: BlockClass; reason: string } {
  if (fact.highRisk === true) return { cls: "high-risk", reason: "fact:high-risk" };
  const detail = fact.detailCode !== undefined ? DETAIL_CLASSES[fact.detailCode] : undefined;
  if (detail !== undefined) return { cls: detail, reason: `detail:${fact.detailCode}` };
  if (fact.outOfScope === true
    && (SHELL_KINDS.has(fact.kind) || (fact.code !== undefined && fact.code.includes("shell")))) {
    return { cls: "model-anomaly", reason: "fact:shell-out-of-scope" };
  }
  const fromCode = fact.code !== undefined ? CODE_CLASSES[fact.code] : undefined;
  if (fromCode !== undefined) return { cls: fromCode, reason: `code:${fact.code}` };
  const signals: BlockClass[] = [];
  if (fact.stateConflict === true) signals.push("protocol-reconcile");
  if (fact.modelMisuse === true) signals.push("model-anomaly");
  if (fact.externalInput === true) signals.push("missing-resource");
  if (fact.requiresAuthorization === true) signals.push("missing-capability");
  if (fact.requiresCustomer === true) signals.push("environment-infra");
  if (signals.length > 0) return { cls: pickHighestPriority(signals), reason: "fact-signals" };
  if (fact.kind === "stall" || fact.kind === "watchdog" || fact.kind === "driver-observation") {
    return { cls: "model-anomaly", reason: `kind:${fact.kind}` };
  }
  return { cls: "model-anomaly", reason: "unclassified" };
}

/**
 * 分类（纯函数）：同指纹重复 ≥ 阈值 ⇒ B7 升级（优先于一切底层类）；
 * 否则 highRisk → detailCode → code → 事实信号 → 兜底 B8。
 */
export function classifyBlock(
  fact: BlockFact,
  policy: Pick<BlockResolverPolicy, "repeatThreshold"> = {},
): BlockClassification {
  const threshold = normalizeRepeatThreshold(policy.repeatThreshold);
  const prior = typeof fact.priorOccurrences === "number" && Number.isFinite(fact.priorOccurrences)
    ? Math.max(0, Math.floor(fact.priorOccurrences))
    : 0;
  const repeat = prior + 1 >= threshold;
  const base = baseClassOf(fact);
  if (repeat) {
    return {
      class: "repeat-rejection",
      classCode: "B7",
      reason: `repeat-fingerprint:${prior + 1}>=${threshold}`,
      repeat: true,
      repeatOf: base.cls,
      priorOccurrences: prior,
      threshold,
    };
  }
  return {
    class: base.cls,
    classCode: blockClassCodeOf(base.cls),
    reason: base.reason,
    repeat: false,
    priorOccurrences: prior,
    threshold,
  };
}

// —————————————— 卡选项词表（设计 §7.3；id 单一来源 = model/runtime.ts） ——————————————

export interface BlockOptionSpec {
  readonly id: BlockOptionId;
  readonly label: string;
  readonly consequence: string;
  readonly sovereign: boolean;
}

export const BLOCK_OPTION_SPECS: Readonly<Record<BlockOptionId, BlockOptionSpec>> = Object.freeze({
  "block-revise-scope": {
    id: "block-revise-scope",
    label: "修订范围后继续",
    consequence: "应用按修订后的范围建立新尝试（新 attempt），原 block 记 resolved(decided)。",
    sovereign: false,
  },
  "block-rework": {
    id: "block-rework",
    label: "返工（属主修复）",
    consequence: "属主按缺失证据/纠正约束返工；应用重算字节 hash/账本事实后自动重入场。",
    sovereign: false,
  },
  "block-replace-executor": {
    id: "block-replace-executor",
    label: "更换执行者",
    consequence: "换执行者/换模型（fresh 会话）后重派；原 block 记 resolved(decided)。",
    sovereign: false,
  },
  "block-retry-with-cap": {
    id: "block-retry-with-cap",
    label: "限次重试",
    consequence: "在剩余预算内重试一次（带指纹与上限）；同指纹再次出现即升级，不循环。",
    sovereign: false,
  },
  "block-accept-with-limits": {
    id: "block-accept-with-limits",
    label: "带限制接受（非高危）",
    consequence: "按现状继续并在下游交付披露限制；高风险动作不得使用本项。",
    sovereign: false,
  },
  [BLOCK_TERMINATE_OPTION_ID]: {
    id: BLOCK_TERMINATE_OPTION_ID,
    label: "显式终止本次流程",
    consequence:
      "应用走显式停稳流程（confirmStop 停稳证据 + workflow.closed stopped）并披露未完成项；该终止是客户决定的结果，block 记 resolved(decided)。",
    sovereign: true,
  },
  "block-grant-exception": {
    id: "block-grant-exception",
    label: "授权一次性例外",
    consequence: "对本次精确动作授予一次性例外；客户本人决定，judge 不可代批。",
    sovereign: true,
  },
  "block-accept-current-state": {
    id: "block-accept-current-state",
    label: "接受现状",
    consequence: "以现状收口并在交付披露未完成/限制；客户本人决定。",
    sovereign: true,
  },
  "block-merge-main": {
    id: "block-merge-main",
    label: "确认合并 main",
    consequence: "复用既有 merge-main 高风险卡：客户本人确认后应用合并（不 push/tag）。",
    sovereign: true,
  },
  "block-stable-write": {
    id: "block-stable-write",
    label: "确认 stable 写入",
    consequence: "复用既有 stable-write 确认卡；客户本人。",
    sovereign: true,
  },
});

export interface BlockCardOption extends BlockOptionSpec {
  readonly recommended: boolean;
}

/** 类 → 客户卡选项集合（2–4 个；high-risk 的首项按事实替换为 merge-main/stable-write）。 */
const CLASS_OPTION_IDS: Readonly<Record<BlockClass, readonly BlockOptionId[]>> = Object.freeze({
  "missing-resource": ["block-rework", "block-revise-scope", "block-accept-with-limits"],
  "missing-capability": ["block-replace-executor", "block-rework", "block-grant-exception"],
  "scope-tradeoff": ["block-revise-scope", "block-rework", "block-accept-with-limits", "block-terminate-flow"],
  "high-risk": ["block-grant-exception", "block-rework", "block-terminate-flow"],
  "environment-infra": ["block-rework", "block-replace-executor", "block-grant-exception"],
  "protocol-reconcile": ["block-rework", "block-accept-current-state", "block-terminate-flow"],
  "repeat-rejection": ["block-replace-executor", "block-rework", "block-accept-current-state", "block-terminate-flow"],
  "model-anomaly": ["block-rework", "block-replace-executor", "block-accept-with-limits"],
  "budget-quota": ["block-revise-scope", "block-retry-with-cap", "block-accept-current-state", "block-terminate-flow"],
});

function highRiskPrimaryOption(fact: BlockFact): BlockOptionId {
  if (fact.code === "merge-main") return "block-merge-main";
  if (fact.code === "stable-write") return "block-stable-write";
  return "block-grant-exception";
}

/** judge 变体：只保留 `block-decision` 词汇（客户主权项一律缺席）。 */
function judgeOptionIds(ids: readonly BlockOptionId[]): readonly BlockOptionId[] {
  const filtered = ids.filter((id) => isBlockDecisionOptionId(id));
  const result = [...filtered];
  for (const candidate of BLOCK_DECISION_OPTION_IDS) {
    if (result.length >= 2) break;
    if (!result.includes(candidate)) result.push(candidate);
  }
  return result.slice(0, 4);
}

/**
 * 推荐项（恰一个；修复向；终止永不作为默认推荐）：
 *  - B3 修订范围；B9 缩范围/限次重试；B4 对应高风险动作；B7 更换执行者；
 *  - B8 首次返工、重复后换人；B2 授权场景推荐授权、否则换人；其余返工。
 */
export function recommendedBlockOptionIdFor(
  cls: BlockClass,
  fact: BlockFact,
  variant: "judge" | "customer" = "customer",
): BlockOptionId {
  let wanted: BlockOptionId;
  switch (cls) {
    case "missing-resource":
      wanted = "block-rework";
      break;
    case "missing-capability":
      wanted = fact.requiresAuthorization === true && variant === "customer"
        ? "block-grant-exception"
        : "block-replace-executor";
      break;
    case "scope-tradeoff":
      wanted = "block-revise-scope";
      break;
    case "high-risk":
      wanted = highRiskPrimaryOption(fact);
      break;
    case "environment-infra":
      wanted = "block-rework";
      break;
    case "protocol-reconcile":
      wanted = "block-rework";
      break;
    case "repeat-rejection":
      wanted = "block-replace-executor";
      break;
    case "model-anomaly":
      wanted = (fact.attempts ?? 0) > 1 ? "block-replace-executor" : "block-rework";
      break;
    case "budget-quota":
      wanted = "block-revise-scope";
      break;
  }
  if (variant === "judge" && !isBlockDecisionOptionId(wanted)) {
    return "block-rework";
  }
  return wanted;
}

/**
 * 装配 block 决策卡选项（恰一个 recommended；2–4 个；含主权项时整卡 `block-sovereign`）。
 * `variant:"judge"` 只用于 judge 代批面（无主权项）；客户卡用 `"customer"`（可含主权项）。
 */
export function blockCardOptionsFor(
  cls: BlockClass,
  fact: BlockFact,
  variant: "judge" | "customer" = "customer",
): readonly BlockCardOption[] {
  const base = CLASS_OPTION_IDS[cls];
  const ids: readonly BlockOptionId[] = cls === "high-risk"
    ? [highRiskPrimaryOption(fact), ...base.filter((id) => !isBlockSovereignOptionId(id) || id === "block-terminate-flow")]
    : base;
  const chosen = variant === "judge" ? judgeOptionIds(ids) : [...new Set(ids)].slice(0, 4);
  const recommended = recommendedBlockOptionIdFor(cls, fact, variant);
  const recommendedId = chosen.includes(recommended) ? recommended : (chosen.find((id) => id !== BLOCK_TERMINATE_OPTION_ID) ?? chosen[0]);
  if (recommendedId === undefined) throw new TypeError(`block 卡选项为空（类 ${cls}）`);
  return chosen.map((id) => ({
    ...BLOCK_OPTION_SPECS[id],
    recommended: id === recommendedId,
  }));
}

/** 卡是否允许 judge 代批：恰一推荐 + 全为 block-decision 词汇 + 推荐项非主权。 */
export function blockCardAllowsJudge(options: readonly BlockCardOption[]): boolean {
  if (options.length < 2 || options.length > 4) return false;
  if (options.some((option) => !isBlockDecisionOptionId(option.id))) return false;
  const recommended = options.filter((option) => option.recommended);
  if (recommended.length !== 1) return false;
  return isBlockDecisionOptionId(recommended[0]!.id);
}

/** 卡选项自检（桌面/测试共用）：2–4 项、id 合法且不重复、恰一推荐、推荐非终止。 */
export function validateBlockCardOptions(options: readonly BlockCardOption[]): readonly string[] {
  const errors: string[] = [];
  if (options.length < 2 || options.length > 4) errors.push(`选项数 ${options.length}（要求 2–4）`);
  const ids = options.map((option) => option.id);
  if (new Set(ids).size !== ids.length) errors.push("选项 id 重复");
  for (const id of ids) {
    if (!isBlockOptionId(id)) errors.push(`未知选项 id：${String(id)}`);
  }
  const recommended = options.filter((option) => option.recommended);
  if (recommended.length !== 1) errors.push(`推荐项 ${recommended.length} 个（要求恰一个）`);
  if (recommended.length === 1 && recommended[0]!.id === BLOCK_TERMINATE_OPTION_ID) {
    errors.push("block-terminate-flow 不得作为推荐项（Q4：终止只能由客户显式选择）");
  }
  for (const option of options) {
    const spec = BLOCK_OPTION_SPECS[option.id];
    if (spec !== undefined && spec.sovereign !== option.sovereign) {
      errors.push(`选项 ${option.id} 的主权标记与词表不一致`);
    }
  }
  return errors;
}

// —————————————— 路由决策（无 stop 分支） ——————————————

export type BlockRouteKind =
  | "engine-auto-fix"
  | "owner-repair"
  | "judge-decision"
  | "customer-decision"
  | "escalated";

export const BLOCK_ROUTE_KINDS: readonly BlockRouteKind[] = Object.freeze([
  "engine-auto-fix", "owner-repair", "judge-decision", "customer-decision", "escalated",
]);

/** 升级去向（`block.escalated` 不是终态；升级后必须再次 routed）。 */
export type BlockEscalationTarget = "executor-replace" | "owner-reassign" | "customer-decision" | "engine-repair";
export const BLOCK_ESCALATION_TARGETS: readonly BlockEscalationTarget[] = Object.freeze([
  "executor-replace", "owner-reassign", "customer-decision", "engine-repair",
]);

/** 升级原因（账本 `block.escalated.reason` 值域；设计 §5.2）。 */
export type BlockEscalationReason = "repeat" | "budget" | "judge-manual" | "repair-timeout" | "unclassified";
export const BLOCK_ESCALATION_REASONS: readonly BlockEscalationReason[] = Object.freeze([
  "repeat", "budget", "judge-manual", "repair-timeout", "unclassified",
]);

export type BlockOwnerKind = "engine" | "role" | "judge" | "customer";

export interface BlockRouteOwner {
  readonly kind: BlockOwnerKind;
  readonly roleId?: string;
}

export type BlockResumeAction =
  | "bounded-retry"
  | "capability-route"
  | "reconcile"
  | "rework"
  | "new-attempt"
  | "redispatch"
  | "replay"
  | "await-card"
  | "client-config"
  | "none";

export interface BlockRouteDecision {
  readonly kind: BlockRouteKind;
  readonly class: BlockClass;
  readonly classCode: BlockClassCode;
  readonly classificationReason: string;
  /** 人类可读决策理由（稳定短语 + 事实）。 */
  readonly reason: string;
  readonly highRisk: boolean;
  readonly sovereign: boolean;
  readonly needsJudge: boolean;
  readonly requiresCustomer: boolean;
  /** block 决策卡复用 `cardKind:"decision"`（应用发行）。 */
  readonly cardKind: "decision";
  readonly cardVocabulary: "block-decision" | "block-sovereign";
  readonly optionIds: readonly BlockOptionId[];
  readonly options: readonly BlockCardOption[];
  readonly recommendedOptionId?: BlockOptionId;
  readonly owner: BlockRouteOwner;
  readonly repair?: {
    readonly kind: "missing-resource" | "capability-route" | "environment" | "reconcile" | "rework" | "executor-replace";
    readonly ownerRoleId?: string;
    readonly evidenceRequired: boolean;
  };
  readonly resume: BlockResumeAction;
  readonly escalation?: {
    readonly kind: BlockEscalationTarget;
    readonly reason: BlockEscalationReason;
    readonly note: string;
  };
  readonly repeat?: { readonly count: number; readonly threshold: number; readonly baseClass: BlockClass };
}

function missingResourceOwner(fact: BlockFact): string {
  if (fact.ownerRoleId !== undefined && fact.ownerRoleId.trim() !== "") return fact.ownerRoleId;
  const detail = fact.detailCode ?? "";
  if (detail.includes("intent")) return "product";
  if (detail.includes("activation")) return "nominator";
  if (detail.includes("report") || detail.includes("acceptance")) return "verifier";
  return "rapporteur";
}

/**
 * 路由决策（设计 §四/§六；**无 stop**）：
 * - B1 属主修复（外部物料 ⇒ 客户）；B2 引擎能力路由（需授权 ⇒ 客户）；B3 judge/客户决策；
 * - B4 客户主权；B5 有界自动恢复 → 属主 → 客户；B6 引擎修复 → 属主/客户；
 * - B7 只升级（executor-replace/owner-reassign/customer-decision/engine-repair；不是终态）；
 * - B8 属主返工/换人；B9 judge（仅 decision 组可代批）/客户（含终止主权项）。
 */
export function decideBlockRoute(fact: BlockFact, policy: BlockResolverPolicy = {}): BlockRouteDecision {
  const classification = classifyBlock(fact, policy);
  const cls = classification.class;
  const highRisk = fact.highRisk === true || cls === "high-risk";
  const judgeEnabled = fact.judgeAvailable === true && policy.judgeEnabled !== false;
  const maxAutoFix = normalizeMaxAutoFix(policy.maxAutoFixAttempts);
  const attempts = typeof fact.attempts === "number" && Number.isFinite(fact.attempts)
    ? Math.max(0, Math.floor(fact.attempts))
    : 0;

  let kind: BlockRouteKind;
  let reason: string;
  let owner: BlockRouteOwner;
  let resume: BlockResumeAction;
  let repair: BlockRouteDecision["repair"];
  let escalation: BlockRouteDecision["escalation"];

  switch (cls) {
    case "missing-resource": {
      if (fact.externalInput === true) {
        kind = "customer-decision";
        reason = "missing-resource:customer-material";
        owner = { kind: "customer" };
        resume = "await-card";
      } else {
        const roleId = missingResourceOwner(fact);
        kind = "owner-repair";
        reason = "missing-resource:owner-repair";
        owner = { kind: "role", roleId };
        resume = "rework";
        repair = { kind: "missing-resource", ownerRoleId: roleId, evidenceRequired: true };
      }
      break;
    }
    case "missing-capability": {
      if (fact.requiresAuthorization === true) {
        kind = "customer-decision";
        reason = "missing-capability:customer-authorization";
        owner = { kind: "customer" };
        resume = "await-card";
      } else if (fact.engineCanRepair === false) {
        const roleId = fact.ownerRoleId ?? "convener";
        kind = "owner-repair";
        reason = "missing-capability:owner-repair";
        owner = { kind: "role", roleId };
        resume = "rework";
        repair = { kind: "capability-route", ownerRoleId: roleId, evidenceRequired: false };
      } else {
        kind = "engine-auto-fix";
        reason = "missing-capability:engine-route";
        owner = { kind: "engine" };
        resume = "capability-route";
      }
      break;
    }
    case "scope-tradeoff": {
      if (judgeEnabled && fact.judgeEligible !== false) {
        kind = "judge-decision";
        reason = "scope-tradeoff:judge-decision";
        owner = { kind: "judge" };
      } else {
        kind = "customer-decision";
        reason = "scope-tradeoff:customer-decision";
        owner = { kind: "customer" };
      }
      resume = "await-card";
      break;
    }
    case "high-risk": {
      kind = "customer-decision";
      reason = "high-risk:customer-only";
      owner = { kind: "customer" };
      resume = "await-card";
      break;
    }
    case "environment-infra": {
      if (fact.requiresCustomer === true) {
        kind = "customer-decision";
        reason = "environment-infra:customer";
        owner = { kind: "customer" };
        resume = "await-card";
      } else if (fact.autoFixForbidden === true || attempts >= maxAutoFix) {
        const roleId = fact.ownerRoleId ?? "convener";
        kind = "owner-repair";
        reason = fact.autoFixForbidden === true
          ? "environment-infra:owner-repair-safety-gate"
          : "environment-infra:owner-repair-auto-fix-cap";
        owner = { kind: "role", roleId };
        resume = "rework";
        repair = { kind: "environment", ownerRoleId: roleId, evidenceRequired: false };
      } else {
        kind = "engine-auto-fix";
        reason = "environment-infra:bounded-auto-fix";
        owner = { kind: "engine" };
        resume = "bounded-retry";
      }
      break;
    }
    case "protocol-reconcile": {
      if (fact.engineCanRepair !== false) {
        kind = "engine-auto-fix";
        reason = "protocol-reconcile:engine-repair";
        owner = { kind: "engine" };
        resume = "reconcile";
      } else if (fact.ownerRoleId !== undefined && fact.ownerRoleId.trim() !== "") {
        kind = "owner-repair";
        reason = "protocol-reconcile:owner-repair";
        owner = { kind: "role", roleId: fact.ownerRoleId };
        resume = "rework";
        repair = { kind: "reconcile", ownerRoleId: fact.ownerRoleId, evidenceRequired: true };
      } else {
        kind = "customer-decision";
        reason = "protocol-reconcile:customer-decision";
        owner = { kind: "customer" };
        resume = "await-card";
      }
      break;
    }
    case "repeat-rejection": {
      kind = "escalated";
      const target: BlockEscalationTarget = highRisk
        ? "customer-decision"
        : fact.engineCanRepair === true
          ? "engine-repair"
          : "executor-replace";
      escalation = {
        kind: target,
        reason: "repeat",
        note: `同指纹已 ${classification.priorOccurrences + 1} 次（阈值 ${classification.threshold}）；禁止原样循环。`,
      };
      reason = `repeat-rejection:escalate:${target}`;
      owner = target === "customer-decision"
        ? { kind: "customer" }
        : target === "engine-repair"
          ? { kind: "engine" }
          : { kind: "role", roleId: fact.ownerRoleId ?? "convener" };
      resume = "none";
      break;
    }
    case "model-anomaly": {
      const roleId = fact.ownerRoleId ?? "convener";
      kind = "owner-repair";
      reason = "model-anomaly:owner-rework";
      owner = { kind: "role", roleId };
      resume = "rework";
      repair = { kind: "rework", ownerRoleId: roleId, evidenceRequired: true };
      break;
    }
    case "budget-quota": {
      if (judgeEnabled && fact.judgeEligible === true) {
        kind = "judge-decision";
        reason = "budget-quota:judge-decision";
        owner = { kind: "judge" };
      } else {
        kind = "customer-decision";
        reason = "budget-quota:customer-decision";
        owner = { kind: "customer" };
      }
      resume = "await-card";
      break;
    }
  }

  // 卡选项：judge 面只给 block-decision；客户面可含 block-sovereign（终止/接受现状等）。
  const variant: "judge" | "customer" = kind === "judge-decision" ? "judge" : "customer";
  const options = blockCardOptionsFor(cls, fact, variant);
  const optionIds = options.map((option) => option.id);
  const recommendedOptionId = options.find((option) => option.recommended)?.id;
  const requiresCustomer = fact.requiresCustomer === true || fact.requiresAuthorization === true
    || fact.externalInput === true || kind === "customer-decision";
  const sovereign = highRisk
    || fact.requiresAuthorization === true
    || fact.sovereign === true
    || optionIds.some((id) => isBlockSovereignOptionId(id));
  const needsJudge = kind === "judge-decision";

  return {
    kind,
    class: cls,
    classCode: classification.classCode,
    classificationReason: classification.reason,
    reason,
    highRisk,
    sovereign,
    needsJudge,
    requiresCustomer,
    cardKind: "decision",
    cardVocabulary: optionIds.some((id) => isBlockSovereignOptionId(id)) ? "block-sovereign" : "block-decision",
    optionIds,
    options,
    ...(recommendedOptionId !== undefined ? { recommendedOptionId } : {}),
    owner,
    ...(repair !== undefined ? { repair } : {}),
    resume,
    ...(escalation !== undefined ? { escalation } : {}),
    ...(classification.repeat
      ? {
          repeat: {
            count: classification.priorOccurrences + 1,
            threshold: classification.threshold,
            baseClass: classification.repeatOf ?? "model-anomaly",
          },
        }
      : {}),
  };
}

/** 便捷断言：路由决策不含 stop/stopped 分支（AC-1；测试与桌面自检共用）。 */
export function isStopFreeRoute(decision: BlockRouteDecision): boolean {
  return decision.kind !== ("stop" as unknown as BlockRouteKind)
    && decision.kind !== ("stopped" as unknown as BlockRouteKind);
}

// —————————————— 事实适配器（供 workflow-service / 桌面 router 消费） ——————————————

export interface BlockFactBaseOptions {
  readonly protocol?: BlockProtocol;
  readonly detailCode?: string;
  readonly highRisk?: boolean;
  readonly judgeAvailable?: boolean;
  readonly priorOccurrences?: number;
  readonly attempts?: number;
  readonly fingerprintMaterial?: readonly string[];
  /** 证据路径（项目相对；应用核验事实；修复任务/简报据此补证）。 */
  readonly evidencePaths?: readonly string[];
  /** 期望证据 hash（与应用 `evidencePaths` 按下标对齐；应用重算后比对，I-4）。 */
  readonly evidenceHashes?: readonly string[];
  readonly requestId?: string;
  readonly source?: string;
  readonly outOfScope?: boolean;
  readonly requiresAuthorization?: boolean;
  readonly requiresCustomer?: boolean;
  readonly externalInput?: boolean;
  readonly stateConflict?: boolean;
  readonly modelMisuse?: boolean;
  readonly engineCanRepair?: boolean;
  readonly derivable?: boolean;
  readonly judgeEligible?: boolean;
  readonly sovereign?: boolean;
  readonly autoFixForbidden?: boolean;
  readonly ownerRoleId?: string;
}

/** 适配器公共可选字段复制（证据/结构事实；只复制已给出值，加法兼容旧调用）。 */
function baseFactExtras(options: BlockFactBaseOptions): Partial<BlockFact> {
  return {
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    ...(options.evidencePaths !== undefined ? { evidencePaths: [...options.evidencePaths] } : {}),
    ...(options.evidenceHashes !== undefined ? { evidenceHashes: [...options.evidenceHashes] } : {}),
    ...(options.outOfScope !== undefined ? { outOfScope: options.outOfScope } : {}),
    ...(options.requiresAuthorization !== undefined ? { requiresAuthorization: options.requiresAuthorization } : {}),
    ...(options.requiresCustomer !== undefined ? { requiresCustomer: options.requiresCustomer } : {}),
    ...(options.externalInput !== undefined ? { externalInput: options.externalInput } : {}),
    ...(options.stateConflict !== undefined ? { stateConflict: options.stateConflict } : {}),
    ...(options.modelMisuse !== undefined ? { modelMisuse: options.modelMisuse } : {}),
    ...(options.engineCanRepair !== undefined ? { engineCanRepair: options.engineCanRepair } : {}),
    ...(options.derivable !== undefined ? { derivable: options.derivable } : {}),
    ...(options.judgeEligible !== undefined ? { judgeEligible: options.judgeEligible } : {}),
    ...(options.sovereign !== undefined ? { sovereign: options.sovereign } : {}),
    ...(options.autoFixForbidden !== undefined ? { autoFixForbidden: options.autoFixForbidden } : {}),
    ...(options.ownerRoleId !== undefined ? { ownerRoleId: options.ownerRoleId } : {}),
  };
}

type MutableFact = { -readonly [K in keyof BlockFact]: BlockFact[K] };

function factOf(base: BlockFact, extra?: Partial<BlockFact>): BlockFact {
  const merged: MutableFact = { ...base };
  if (extra !== undefined) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/** `stage.blocked` 账本事件 → BlockFact（事实锚点不变；resolver 只在其上追加生命周期）。 */
export function blockFactFromStageBlocked(
  event: Pick<StageBlockedEvent, "workflowId" | "flowId" | "stage" | "code" | "summary" | "taskId" | "attempt">,
  options: BlockFactBaseOptions = {},
): BlockFact {
  return factOf({
    protocol: options.protocol ?? "fixed-v2.1",
    kind: "stage.blocked",
    code: event.code,
    ...(options.detailCode !== undefined ? { detailCode: options.detailCode } : {}),
    source: options.source ?? "workflow-service.stage.blocked",
    workflowId: event.workflowId,
    flowId: event.flowId,
    stage: event.stage,
    ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
    attempts: event.attempt,
    ...(options.priorOccurrences !== undefined ? { priorOccurrences: options.priorOccurrences } : {}),
    ...(options.judgeAvailable !== undefined ? { judgeAvailable: options.judgeAvailable } : {}),
    ...(options.highRisk !== undefined ? { highRisk: options.highRisk } : {}),
    summary: event.summary,
    ...(options.fingerprintMaterial !== undefined ? { fingerprintMaterial: options.fingerprintMaterial } : {}),
    // R1b（测试批 R4b）：证据/期望 hash/结构事实必须随事件复制（I-4/AC-5）。
    ...baseFactExtras(options),
  });
}

/** `task.reported(blocked|failed)` → BlockFact；`done` 不是 block（返回 undefined）。 */
export function blockFactFromTaskReport(input: {
  readonly protocol: BlockProtocol;
  readonly report: Pick<TaskReportedEvent, "taskId" | "status" | "summary"> & { evidence?: readonly string[] };
  readonly workflowId?: string;
  readonly flowId?: string;
  readonly stage?: WorkflowStage;
  readonly requestId?: string;
  readonly options?: BlockFactBaseOptions;
}): BlockFact | undefined {
  const options = input.options ?? {};
  if (input.report.status === "done") return undefined;
  const code = input.report.status === "blocked" ? "task-report-blocked" : "task-report-failed";
  const requestId = input.requestId ?? options.requestId;
  return {
    protocol: input.protocol,
    kind: "task.reported",
    code,
    ...(options.detailCode !== undefined ? { detailCode: options.detailCode } : {}),
    source: options.source ?? "task-state.task.reported",
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    taskId: input.report.taskId,
    ...(requestId !== undefined ? { requestId } : {}),
    reportStatus: input.report.status,
    ...(input.report.evidence !== undefined
      ? { evidencePaths: [...input.report.evidence] }
      : options.evidencePaths !== undefined
        ? { evidencePaths: [...options.evidencePaths] }
        : {}),
    ...(options.evidenceHashes !== undefined ? { evidenceHashes: [...options.evidenceHashes] } : {}),
    ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
    ...(options.priorOccurrences !== undefined ? { priorOccurrences: options.priorOccurrences } : {}),
    ...(options.judgeAvailable !== undefined ? { judgeAvailable: options.judgeAvailable } : {}),
    ...(options.highRisk !== undefined ? { highRisk: options.highRisk } : {}),
    summary: input.report.summary,
    ...(options.fingerprintMaterial !== undefined ? { fingerprintMaterial: options.fingerprintMaterial } : {}),
    // R1b：其余结构事实（outOfScope/stateConflict/授权/属主等）随 options 复制；
    // 证据/请求 id 已按「报告优先」处理，不在此重复覆盖。
    ...baseFactExtras({
      ...options,
      evidencePaths: undefined,
      evidenceHashes: undefined,
      requestId: undefined,
    }),
  };
}

export interface BlockDispatchRejectionInput extends BlockFactBaseOptions {
  readonly protocol: BlockProtocol;
  readonly code: string;
  readonly message: string;
  readonly workflowId?: string;
  readonly flowId?: string;
  readonly stage?: WorkflowStage;
  readonly taskId?: string;
  readonly requestId?: string;
  readonly roleId?: string;
}

function blockFactFromRejectionBase(kind: BlockFactKind, input: BlockDispatchRejectionInput): BlockFact {
  return {
    protocol: input.protocol,
    kind,
    code: input.code,
    ...(input.detailCode !== undefined ? { detailCode: input.detailCode } : {}),
    source: input.source ?? "workflow-service.rejection",
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    // R1b（测试批 R4b）：拒绝类事实必须携带证据路径与期望 hash（修复任务/简报据此补证；I-4/AC-5）。
    ...(input.evidencePaths !== undefined ? { evidencePaths: [...input.evidencePaths] } : {}),
    ...(input.evidenceHashes !== undefined ? { evidenceHashes: [...input.evidenceHashes] } : {}),
    ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
    ...(input.priorOccurrences !== undefined ? { priorOccurrences: input.priorOccurrences } : {}),
    ...(input.judgeAvailable !== undefined ? { judgeAvailable: input.judgeAvailable } : {}),
    ...(input.highRisk !== undefined ? { highRisk: input.highRisk } : {}),
    ...(input.requiresAuthorization !== undefined ? { requiresAuthorization: input.requiresAuthorization } : {}),
    ...(input.requiresCustomer !== undefined ? { requiresCustomer: input.requiresCustomer } : {}),
    ...(input.externalInput !== undefined ? { externalInput: input.externalInput } : {}),
    ...(input.outOfScope !== undefined ? { outOfScope: input.outOfScope } : {}),
    ...(input.stateConflict !== undefined ? { stateConflict: input.stateConflict } : {}),
    ...(input.modelMisuse !== undefined ? { modelMisuse: input.modelMisuse } : {}),
    ...(input.engineCanRepair !== undefined ? { engineCanRepair: input.engineCanRepair } : {}),
    ...(input.derivable !== undefined ? { derivable: input.derivable } : {}),
    ...(input.judgeEligible !== undefined ? { judgeEligible: input.judgeEligible } : {}),
    ...(input.sovereign !== undefined ? { sovereign: input.sovereign } : {}),
    ...(input.autoFixForbidden !== undefined ? { autoFixForbidden: input.autoFixForbidden } : {}),
    ...(input.ownerRoleId !== undefined ? { ownerRoleId: input.ownerRoleId } : {}),
    ...(input.roleId !== undefined ? { audit: { roleId: input.roleId } } : {}),
    ...(input.fingerprintMaterial !== undefined ? { fingerprintMaterial: input.fingerprintMaterial } : {}),
    summary: input.message,
  };
}

/** 派发拒绝回执 → BlockFact（fixed 矩阵/route 拒绝码；`blockFact` 随回执/回执审计返回）。 */
export function blockFactFromDispatchRejection(input: BlockDispatchRejectionInput): BlockFact {
  return blockFactFromRejectionBase("dispatch-rejection", {
    ...input,
    source: input.source ?? "desktop.dispatch.rejection",
  });
}

/** workflow-service 服务拒绝（requestStage/recordStageDispatch/load 上下文等）→ BlockFact。 */
export function blockFactFromServiceFailure(input: BlockDispatchRejectionInput): BlockFact {
  return blockFactFromRejectionBase("service-rejection", {
    ...input,
    source: input.source ?? "workflow-service.failure",
  });
}

/** `reconcileFixedWorkflow` 单 workflow 回执（corrupt/errors）→ BlockFact[]（B6 输入）。 */
export function blockFactFromReconcileReceipt(input: {
  readonly workflowId: string;
  readonly protocol: BlockProtocol;
  readonly stage?: WorkflowStage;
  readonly corrupt?: string;
  readonly errors?: readonly string[];
  /** R1b：对账引用/证据（项目相对路径；应用核验事实）。 */
  readonly evidencePaths?: readonly string[];
  readonly evidenceHashes?: readonly string[];
}): readonly BlockFact[] {
  const facts: BlockFact[] = [];
  const evidence = {
    ...(input.evidencePaths !== undefined ? { evidencePaths: [...input.evidencePaths] } : {}),
    ...(input.evidenceHashes !== undefined ? { evidenceHashes: [...input.evidenceHashes] } : {}),
  };
  if (input.corrupt !== undefined) {
    facts.push({
      protocol: input.protocol,
      kind: "reconcile",
      code: "reconcile-corrupt",
      detailCode: "reconcile",
      source: "workflow-service.reconcileFixedWorkflow",
      workflowId: input.workflowId,
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...evidence,
      summary: input.corrupt,
      fingerprintMaterial: ["reconcile", input.workflowId, input.corrupt],
      engineCanRepair: true,
    });
  }
  for (const message of input.errors ?? []) {
    facts.push({
      protocol: input.protocol,
      kind: "reconcile",
      code: "reconcile-error",
      detailCode: "reconcile",
      source: "workflow-service.reconcileFixedWorkflow",
      workflowId: input.workflowId,
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...evidence,
      summary: message,
      fingerprintMaterial: ["reconcile-error", input.workflowId, message],
      engineCanRepair: true,
    });
  }
  return facts;
}

export interface BlockStallTick {
  readonly protocol: BlockProtocol;
  readonly workflowId: string;
  readonly flowId: string;
  readonly stage?: WorkflowStage;
  /** 最后一次真实进度时刻（账本事件/task.reported/卡活动/投递成功）。 */
  readonly lastProgressAt?: string;
  /** 当前时刻（宿主注入；本模块不读时钟）。 */
  readonly now: string;
  /** 合法长回合在飞（排除）。 */
  readonly inFlightTurn?: boolean;
  /** 已呈现的客户卡（可见等待，排除）。 */
  readonly openCard?: boolean;
  /** open 修复任务/在飞自动修复（排除）。 */
  readonly openRepairTask?: boolean;
  readonly judgeAvailable?: boolean;
  readonly priorOccurrences?: number;
  /** R1b：停滞证据（如最后进度事件/审计文件；项目相对路径 + 期望 hash）。 */
  readonly evidencePaths?: readonly string[];
  readonly evidenceHashes?: readonly string[];
}

/**
 * 停滞 tick → BlockFact（设计 §6.6）：无进度 ≥ T_stall 且无可见产物 ⇒ B8 候选；
 * 合法长回合/待答卡/open 修复任务一律排除（不误报）。时间非法 ⇒ 不猜（undefined）。
 */
export function blockFactFromStallTick(
  tick: BlockStallTick,
  policy: BlockResolverPolicy = {},
): BlockFact | undefined {
  if (tick.inFlightTurn === true || tick.openCard === true || tick.openRepairTask === true) return undefined;
  if (tick.lastProgressAt === undefined) return undefined;
  const last = Date.parse(tick.lastProgressAt);
  const now = Date.parse(tick.now);
  if (!Number.isFinite(last) || !Number.isFinite(now) || now < last) return undefined;
  const timings = resolveBlockTimings(policy.timings);
  const elapsed = now - last;
  if (elapsed < timings.stallMs) return undefined;
  return {
    protocol: tick.protocol,
    kind: "stall",
    code: "flow-stall",
    source: "block-router.stall-tick",
    workflowId: tick.workflowId,
    flowId: tick.flowId,
    ...(tick.stage !== undefined ? { stage: tick.stage } : {}),
    ...(tick.priorOccurrences !== undefined ? { priorOccurrences: tick.priorOccurrences } : {}),
    ...(tick.judgeAvailable !== undefined ? { judgeAvailable: tick.judgeAvailable } : {}),
    ...(tick.evidencePaths !== undefined ? { evidencePaths: [...tick.evidencePaths] } : {}),
    ...(tick.evidenceHashes !== undefined ? { evidenceHashes: [...tick.evidenceHashes] } : {}),
    summary: `工作流 ${tick.workflowId} 在 ${Math.floor(elapsed / 60000)} 分钟内无账本进度且无可见产物（T_stall=${Math.floor(timings.stallMs / 60000)}min）。`,
    fingerprintMaterial: ["flow-stall", tick.workflowId, tick.stage ?? ""],
  };
}

export type BlockShellDenialReason =
  | "c-deny"
  | "a-unavailable"
  | "a-timeout"
  | "judge-deny"
  | "judge-manual"
  | "retry-capped"
  | "escalation";

export const BLOCK_SHELL_DENIAL_REASONS: readonly BlockShellDenialReason[] = Object.freeze([
  "c-deny", "a-unavailable", "a-timeout", "judge-deny", "judge-manual", "retry-capped", "escalation",
]);

/**
 * shell 三层链拒绝/升级 → BlockFact（设计 §6.4）：
 * c-deny/a-* 默认 B2/B5；judge deny/manual 默认 B2；retry-capped ⇒ B9；escalation ⇒ B4（越界 ⇒ B8）。
 */
export function blockFactFromShellDenial(input: {
  readonly reason: BlockShellDenialReason;
  readonly protocol?: BlockProtocol;
  readonly workflowId?: string;
  readonly flowId?: string;
  readonly stage?: WorkflowStage;
  readonly taskId?: string;
  readonly command?: string;
  readonly summary?: string;
  readonly outOfScope?: boolean;
  readonly priorOccurrences?: number;
  readonly fingerprintMaterial?: readonly string[];
  /** R1b：命令/审计证据（项目相对路径 + 期望 hash；如 shell 审计日志）。 */
  readonly evidencePaths?: readonly string[];
  readonly evidenceHashes?: readonly string[];
}): BlockFact {
  const map: Readonly<Record<BlockShellDenialReason, { code: string; kind: BlockFactKind; detail?: string }>> = {
    "c-deny": { code: "shell-c-deny", kind: "shell-denial" },
    "a-unavailable": { code: "shell-a-unavailable", kind: "shell-denial" },
    "a-timeout": { code: "shell-a-timeout", kind: "shell-denial" },
    "judge-deny": { code: "shell-judge-deny", kind: "shell-denial" },
    "judge-manual": { code: "shell-judge-manual", kind: "shell-denial" },
    "retry-capped": { code: "retry-capped", kind: "shell-denial" },
    escalation: { code: "shell-escalation", kind: "shell-escalation" },
  };
  const entry = map[input.reason];
  return {
    protocol: input.protocol ?? "fixed-v2.1",
    kind: entry.kind,
    code: entry.code,
    ...(entry.detail !== undefined ? { detailCode: entry.detail } : {}),
    source: "shell-gate",
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.priorOccurrences !== undefined ? { priorOccurrences: input.priorOccurrences } : {}),
    ...(input.outOfScope === true ? { outOfScope: true } : {}),
    ...(input.evidencePaths !== undefined ? { evidencePaths: [...input.evidencePaths] } : {}),
    ...(input.evidenceHashes !== undefined ? { evidenceHashes: [...input.evidenceHashes] } : {}),
    ...(input.reason === "judge-deny" || input.reason === "judge-manual"
      ? { requiresAuthorization: true }
      : {}),
    summary: input.summary ?? `shell ${input.reason}${input.command !== undefined ? `：${input.command}` : ""}`,
    ...(input.fingerprintMaterial !== undefined
      ? { fingerprintMaterial: input.fingerprintMaterial }
      : input.command !== undefined
        ? { fingerprintMaterial: [`shell:${input.reason}`, input.command] }
        : {}),
  };
}

// —————————————— P1–P51 点位矩阵（设计 §2.4/§6.11；供测试批 T-1/T-2 逐项构造事实） ——————————————

export type BlockPointFamily = "E" | "D" | "R" | "S" | "W" | "H";
export type BlockPointId =
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9" | "P10"
  | "P11" | "P12" | "P13" | "P14" | "P15" | "P16" | "P17" | "P18" | "P19" | "P20"
  | "P21" | "P22" | "P23" | "P24" | "P25" | "P26" | "P27" | "P28" | "P29" | "P30"
  | "P31" | "P32" | "P33" | "P34" | "P35" | "P36" | "P37" | "P38" | "P39" | "P40"
  | "P41" | "P42" | "P43" | "P44" | "P45" | "P46" | "P47" | "P48" | "P49" | "P50" | "P51";

export interface BlockPointDefinition {
  readonly point: BlockPointId;
  readonly family: BlockPointFamily;
  readonly title: string;
  readonly codes: readonly string[];
  /** 设计允许的类集合（canonical 事实命中 first）。 */
  readonly allowedClasses: readonly BlockClass[];
  /** canonical 事实的期望类（默认策略）。 */
  readonly expectedClass: BlockClass;
  /** canonical 事实在默认策略（judge off、首现、无授权）下的期望路由 kind。 */
  readonly expectedRoute: BlockRouteKind;
  /** canonical 事实（测试用；只读）。 */
  readonly fact: BlockFact;
}

function sampleFact(
  kind: BlockFactKind,
  code: string,
  extra: Partial<BlockFact> = {},
): BlockFact {
  return Object.freeze({
    protocol: "fixed-v2.1" as BlockProtocol,
    kind,
    code,
    priorOccurrences: 0,
    summary: `P 点位示例（${kind}/${code}）`,
    ...extra,
  });
}

export const BLOCK_POINTS: Readonly<Record<BlockPointId, BlockPointDefinition>> = Object.freeze({
  P1: { point: "P1", family: "E", title: "closeTask rejected ⇒ stage.blocked task-closed-rejected", codes: ["task-closed-rejected"], allowedClasses: ["missing-resource", "scope-tradeoff", "model-anomaly", "budget-quota"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("stage.blocked", "task-closed-rejected") },
  P2: { point: "P2", family: "E", title: "closeTask accepted + 报告 failed/blocked", codes: ["task-report-failed", "task-report-blocked"], allowedClasses: ["missing-resource", "missing-capability", "model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("task.reported", "task-report-failed", { reportStatus: "failed" }) },
  P3: { point: "P3", family: "E", title: "closeTask rework（非 A12b）", codes: ["task-report-blocked"], allowedClasses: ["scope-tradeoff", "model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("task.reported", "task-report-blocked", { reportStatus: "blocked" }) },
  P4: { point: "P4", family: "E", title: "A12b 轻量验收缺归档/note（close-report-missing）", codes: ["close-report-missing"], allowedClasses: ["missing-resource", "missing-capability"], expectedClass: "missing-resource", expectedRoute: "owner-repair", fact: sampleFact("service-rejection", "close-report-missing", { detailCode: "report-evidence-missing", evidencePaths: ["docs/acceptance/snake-report-v1.md"], evidenceHashes: ["a".repeat(64)] }) },
  P5: { point: "P5", family: "E", title: "A9 基线失败（project-config-write-failed 等）", codes: ["project-config-write-failed", "baseline-team-plan-invalid", "b-repository-required"], allowedClasses: ["environment-infra", "missing-resource"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "project-config-write-failed", { evidencePaths: [".ans/project.json"], evidenceHashes: ["1".repeat(64)] }) },
  P6: { point: "P6", family: "E", title: "release 合并失败/拒绝", codes: ["release-merge-failed", "release-failed"], allowedClasses: ["environment-infra", "high-risk", "budget-quota"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("release", "release-merge-failed") },
  P7: { point: "P7", family: "E", title: "workflow.stop-unconfirmed", codes: ["workflow-stop-unconfirmed"], allowedClasses: ["environment-infra", "protocol-reconcile"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("stage.blocked", "workflow-stop-unconfirmed") },
  P8: { point: "P8", family: "E", title: "workflow-corrupt（投影 fail-closed）", codes: ["workflow-corrupt"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("stage.blocked", "workflow-corrupt", { evidencePaths: [".ans/state/workflows.jsonl"], evidenceHashes: ["f".repeat(64)] }) },
  P9: { point: "P9", family: "E", title: "stage-transition-invalid（真实态冲突）", codes: ["stage-transition-invalid"], allowedClasses: ["protocol-reconcile", "model-anomaly"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "stage-transition-invalid", { stateConflict: true }) },
  P10: { point: "P10", family: "D", title: "fixed 矩阵拒绝码（self-dispatch 等）", codes: ["self-dispatch"], allowedClasses: ["model-anomaly", "missing-capability"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "self-dispatch") },
  P11: { point: "P11", family: "D", title: "workflow-binding-unavailable", codes: ["workflow-binding-unavailable"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "workflow-binding-unavailable") },
  P12: { point: "P12", family: "D", title: "workflow-not-found / workflow-closed", codes: ["workflow-not-found"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "workflow-not-found") },
  P13: { point: "P13", family: "D", title: "workflow-corrupt 派发门", codes: ["workflow-corrupt"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "workflow-corrupt") },
  P14: { point: "P14", family: "D", title: "stage-request-invalid（taskKind 误用）", codes: ["stage-request-invalid"], allowedClasses: ["model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "stage-request-invalid") },
  P15: { point: "P15", family: "D", title: "basis-drift / basis-missing", codes: ["basis-drift", "basis-missing"], allowedClasses: ["missing-resource", "protocol-reconcile"], expectedClass: "missing-resource", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "basis-drift", { evidencePaths: ["docs/scheduling/snake-team-v1.md"], evidenceHashes: ["b".repeat(64)] }) },
  P16: { point: "P16", family: "D", title: "b-change-scope-invalid（范围歧义）", codes: ["b-change-scope-invalid"], allowedClasses: ["scope-tradeoff", "protocol-reconcile"], expectedClass: "scope-tradeoff", expectedRoute: "customer-decision", fact: sampleFact("dispatch-rejection", "b-change-scope-invalid") },
  P17: { point: "P17", family: "D", title: "b2-stage-request-forbidden", codes: ["b2-stage-request-forbidden"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "b2-stage-request-forbidden") },
  P18: { point: "P18", family: "D", title: "b-repository-required", codes: ["b-repository-required"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "b-repository-required") },
  P19: { point: "P19", family: "D", title: "module-paths-mismatch", codes: ["module-paths-mismatch"], allowedClasses: ["model-anomaly", "missing-resource"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "module-paths-mismatch") },
  P20: { point: "P20", family: "D", title: "缺契约拒投", codes: ["missing-contract"], allowedClasses: ["missing-resource"], expectedClass: "missing-resource", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "missing-contract", { detailCode: "missing-file", evidencePaths: ["docs/contracts/snake-architecture-v1.md"], evidenceHashes: ["c".repeat(64)] }) },
  P21: { point: "P21", family: "D", title: "source 门（document-planning-source-unavailable）", codes: ["document-planning-source-unavailable"], allowedClasses: ["missing-capability", "protocol-reconcile"], expectedClass: "missing-capability", expectedRoute: "engine-auto-fix", fact: sampleFact("dispatch-rejection", "document-planning-source-unavailable") },
  P22: { point: "P22", family: "D", title: "VCA 通道不可用", codes: ["vca-channel-unavailable"], allowedClasses: ["missing-capability", "environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "vca-channel-unavailable") },
  P23: { point: "P23", family: "D", title: "review-target-invalid", codes: ["review-target-invalid"], allowedClasses: ["model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("dispatch-rejection", "review-target-invalid") },
  P24: { point: "P24", family: "R", title: "blocked 报告只提示运营（应用路由替换）", codes: ["blocked-report-needs-routing"], allowedClasses: ["scope-tradeoff", "environment-infra"], expectedClass: "scope-tradeoff", expectedRoute: "customer-decision", fact: sampleFact("task.reported", "blocked-report-needs-routing", { reportStatus: "blocked", detailCode: "scope-tradeoff", evidencePaths: ["docs/product/snake-intent-v1.md"], evidenceHashes: ["d".repeat(64)] }) },
  P25: { point: "P25", family: "R", title: "accepted 收口要求 done（close-report-missing）", codes: ["close-report-missing"], allowedClasses: ["missing-resource", "model-anomaly"], expectedClass: "missing-resource", expectedRoute: "owner-repair", fact: sampleFact("service-rejection", "close-report-missing", { evidencePaths: ["docs/acceptance/snake-report-v1.md"], evidenceHashes: ["e".repeat(64)] }) },
  P26: { point: "P26", family: "R", title: "重派安全门（零自动重派）", codes: ["redispatch-safety-gate"], allowedClasses: ["environment-infra", "model-anomaly"], expectedClass: "environment-infra", expectedRoute: "owner-repair", fact: sampleFact("redispatch", "redispatch-safety-gate", { autoFixForbidden: true }) },
  P27: { point: "P27", family: "R", title: "重派上限 ⇒ 升级卡（推荐改修复向）", codes: ["redispatch-exhausted"], allowedClasses: ["repeat-rejection", "budget-quota"], expectedClass: "budget-quota", expectedRoute: "customer-decision", fact: sampleFact("redispatch", "redispatch-exhausted") },
  P28: { point: "P28", family: "R", title: "升级卡无客户通道", codes: ["escalation-channel-unavailable"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "escalation-channel-unavailable") },
  P29: { point: "P29", family: "R", title: "terminateRoleRun 终止未确认", codes: ["terminate-unconfirmed"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "terminate-unconfirmed") },
  P30: { point: "P30", family: "R", title: "Q8 重试耗尽（app-dispatch）", codes: ["retry-budget-exhausted"], allowedClasses: ["repeat-rejection", "budget-quota"], expectedClass: "budget-quota", expectedRoute: "customer-decision", fact: sampleFact("service-rejection", "retry-budget-exhausted", { protocol: "app-dispatch/v1" }) },
  P31: { point: "P31", family: "R", title: "高风险零重派 blocked（app-dispatch）", codes: ["high-risk-blocked"], allowedClasses: ["high-risk", "repeat-rejection"], expectedClass: "high-risk", expectedRoute: "customer-decision", fact: sampleFact("service-rejection", "high-risk-blocked", { protocol: "app-dispatch/v1", highRisk: true }) },
  P32: { point: "P32", family: "R", title: "reconcile corrupt / 引用不一致（app-dispatch）", codes: ["reconcile-corrupt"], allowedClasses: ["protocol-reconcile"], expectedClass: "protocol-reconcile", expectedRoute: "engine-auto-fix", fact: sampleFact("reconcile", "reconcile-corrupt", { protocol: "app-dispatch/v1", detailCode: "reconcile", evidencePaths: [".ans/state/workflows.jsonl"], evidenceHashes: ["0".repeat(64)] }) },
  P33: { point: "P33", family: "R", title: "投递失败/目标忙/离线（队列重试）", codes: ["delivery-failed"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "delivery-failed") },
  P34: { point: "P34", family: "R", title: "handback 登记/渲染失败", codes: ["handback-register-failed"], allowedClasses: ["environment-infra", "protocol-reconcile"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "handback-register-failed") },
  P35: { point: "P35", family: "S", title: "shell c 硬拒（越界）", codes: ["shell-c-deny"], allowedClasses: ["missing-capability", "model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("shell-denial", "shell-c-deny", { detailCode: "shell-out-of-bounds", outOfScope: true }) },
  P36: { point: "P36", family: "S", title: "shell 操作者不可用/超时", codes: ["shell-a-unavailable", "shell-a-timeout"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("shell-denial", "shell-a-unavailable") },
  P37: { point: "P37", family: "S", title: "judge deny/manual 按拒绝", codes: ["shell-judge-deny", "shell-judge-manual"], allowedClasses: ["missing-capability", "repeat-rejection"], expectedClass: "missing-capability", expectedRoute: "customer-decision", fact: sampleFact("shell-denial", "shell-judge-deny", { requiresAuthorization: true }) },
  P38: { point: "P38", family: "S", title: "shell 升级卡（allow-once/session/deny）", codes: ["shell-escalation"], allowedClasses: ["missing-capability", "high-risk"], expectedClass: "high-risk", expectedRoute: "customer-decision", fact: sampleFact("shell-escalation", "shell-escalation") },
  P39: { point: "P39", family: "S", title: "fixed 路径卡预算外 shell 卡（幕僚越界）", codes: ["shell-escalation"], allowedClasses: ["model-anomaly", "high-risk"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("shell-escalation", "shell-escalation", { outOfScope: true }) },
  P40: { point: "P40", family: "W", title: "turn-deadline", codes: ["turn-deadline"], allowedClasses: ["model-anomaly", "environment-infra"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("watchdog", "turn-deadline") },
  P41: { point: "P41", family: "W", title: "log-silence slow/stuck/hard-cap", codes: ["log-silence"], allowedClasses: ["model-anomaly", "environment-infra"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("watchdog", "log-silence") },
  P42: { point: "P42", family: "W", title: "patrol 巡检消息", codes: ["patrol"], allowedClasses: ["model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("watchdog", "patrol") },
  P43: { point: "P43", family: "W", title: "queue-stuck/repeat-fail/cmd-timeout", codes: ["queue-stuck"], allowedClasses: ["environment-infra", "model-anomaly"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("watchdog", "queue-stuck") },
  P44: { point: "P44", family: "W", title: "propose_recovery", codes: ["propose-recovery"], allowedClasses: ["environment-infra", "model-anomaly"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("watchdog", "propose-recovery") },
  P45: { point: "P45", family: "W", title: "stuck 角色自动终止 + 安全重派", codes: ["stuck-role"], allowedClasses: ["model-anomaly", "environment-infra"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("watchdog", "stuck-role") },
  P46: { point: "P46", family: "W", title: "模型请求失败/轮次超时", codes: ["model-request-failed", "model-timeout"], allowedClasses: ["environment-infra", "model-anomaly"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "model-request-failed") },
  P47: { point: "P47", family: "W", title: "会话打开失败/网络离线", codes: ["session-open-failed", "network-offline"], allowedClasses: ["environment-infra"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("service-rejection", "session-open-failed") },
  P48: { point: "P48", family: "H", title: "driver stalled-no-progress（观察者）", codes: ["stalled-no-progress"], allowedClasses: ["model-anomaly"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("driver-observation", "stalled-no-progress") },
  P49: { point: "P49", family: "H", title: "driver blocked-unrecovered（观察者）", codes: ["blocked-unrecovered"], allowedClasses: ["model-anomaly", "budget-quota"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("driver-observation", "blocked-unrecovered") },
  P50: { point: "P50", family: "H", title: "driver gate 早停（chief-role-missing）", codes: ["chief-role-missing"], allowedClasses: ["high-risk", "environment-infra", "model-anomaly"], expectedClass: "environment-infra", expectedRoute: "engine-auto-fix", fact: sampleFact("driver-observation", "chief-role-missing") },
  P51: { point: "P51", family: "H", title: "产品无 flow 停滞处置（router stall 检测）", codes: ["flow-stall"], allowedClasses: ["model-anomaly", "budget-quota"], expectedClass: "model-anomaly", expectedRoute: "owner-repair", fact: sampleFact("stall", "flow-stall") },
});

export const BLOCK_POINT_IDS: readonly BlockPointId[] = Object.freeze(
  Object.keys(BLOCK_POINTS) as BlockPointId[],
);

/** 按点位构造 canonical 事实（可覆写字段；返回新对象，不共享可变数组）。 */
export function blockFactForPoint(
  point: BlockPointId,
  overrides: Partial<BlockFact> = {},
): BlockFact {
  const definition = BLOCK_POINTS[point];
  if (definition === undefined) throw new TypeError(`未知 block 点位：${String(point)}`);
  return {
    ...definition.fact,
    ...overrides,
    ...(overrides.fingerprintMaterial !== undefined
      ? { fingerprintMaterial: [...overrides.fingerprintMaterial] }
      : {}),
    ...(overrides.evidencePaths !== undefined ? { evidencePaths: [...overrides.evidencePaths] } : {}),
    ...(overrides.evidenceHashes !== undefined ? { evidenceHashes: [...overrides.evidenceHashes] } : {}),
  };
}

/** 点位矩阵自检（纯函数；返回空数组 = 通过）：P1–P51 齐全、canonical 事实命中期望类与路由。 */
export function validateBlockPointMatrix(policy: BlockResolverPolicy = {}): readonly string[] {
  const errors: string[] = [];
  const expectedCount = 51;
  if (BLOCK_POINT_IDS.length !== expectedCount) {
    errors.push(`点位数量 ${BLOCK_POINT_IDS.length}（应为 ${expectedCount}）`);
  }
  for (const id of BLOCK_POINT_IDS) {
    const definition = BLOCK_POINTS[id];
    if (definition.point !== id) errors.push(`${id}: point 字段不一致（${definition.point}）`);
    if (!definition.allowedClasses.includes(definition.expectedClass)) {
      errors.push(`${id}: expectedClass ${definition.expectedClass} 不在 allowedClasses`);
    }
    const cls = classifyBlock(definition.fact, policy);
    if (!definition.allowedClasses.includes(cls.class)) {
      errors.push(`${id}: canonical 事实分类 ${cls.class} 不在 allowedClasses [${definition.allowedClasses.join(",")}]`);
    } else if (cls.class !== definition.expectedClass) {
      errors.push(`${id}: canonical 事实分类 ${cls.class} != expectedClass ${definition.expectedClass}`);
    }
    const route = decideBlockRoute(definition.fact, policy);
    if (!isStopFreeRoute(route)) errors.push(`${id}: 路由含 stop 分支`);
    if (route.kind !== definition.expectedRoute) {
      errors.push(`${id}: canonical 路由 ${route.kind} != expectedRoute ${definition.expectedRoute}`);
    }
    if (route.recommendedOptionId === BLOCK_TERMINATE_OPTION_ID) {
      errors.push(`${id}: 推荐项不得为 block-terminate-flow`);
    }
    const optionErrors = validateBlockCardOptions(route.options);
    for (const message of optionErrors) errors.push(`${id}: ${message}`);
  }
  return errors;
}
