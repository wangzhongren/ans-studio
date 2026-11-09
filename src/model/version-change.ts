// version-change/v1、doc-freeze/v1、stable-write/v1、refactor-request/v1 共享 Model 契约
// （2026-11-04 trunk-amendment-model C1 冻结；形状派生自 P1.6 + PM 复审裁决 F13/F14）。
//
// 纪律（C1 冻结）：
// · 类型/常量/纯结构不变量：无 I/O、不读写账本、不执行业务判定（状态机/冻结服务/许可判定归编排 C2a/C2c
//   与门禁引擎 C2b）。
// · 依赖方向：仅单向依赖 ./trunk.ts 的共享类型与纯结构不变量；
//   不 import `runtime.ts` 或任何运行层；反向禁止。
// · 不改既有字段语义/不删除/不重命名；新增字段默认可选，旧读者忽略未知字段。
// · 审计归属（P1.6 §5.5/AC-31）：VCA/修正案的批准/拒绝 = customer；提交/应用/冻结/迁移/bootstrap
//   = application（不冒充客户）；refactor 无 customer decision。
// · 2026-11-09 显式契约修订（judge-delegated）：客户开启「替我决策」后的 judge 代批以独立来源
//   `judge-delegated` 冻结 proposal/intent-confirmed（无 decidedBy/decisionId，不冒充客户）；
//   客户本人与 chief-delegated 路径逐字不变。

import type { DirectActionReceipt, DirectActionSource, SnapshotRef, TrunkStableFileKind, TrunkVersionRef } from "./trunk.ts";
import { isDirectActionSource, isSnapshotRef } from "./trunk.ts";

/** `version-change/v1`（VCA 记录 + `version.change` 事件 schema）。 */
export const VERSION_CHANGE_SCHEMA = "version-change/v1";
/** `doc-freeze/v1`（R9 baseline 冻结 variant 的 `freeze` 子形状 + `doc.freeze` 事件 schema）。 */
export const DOC_FREEZE_SCHEMA = "doc-freeze/v1";
/** `stable-write/v1`（stable 写入记录/一次性许可/`stable.write.*` 事件 schema）。 */
export const STABLE_WRITE_SCHEMA = "stable-write/v1";
/** `refactor-request/v1`（重构申请记录 + `refactor.request` 事件 schema）。 */
export const REFACTOR_REQUEST_SCHEMA = "refactor-request/v1";

export const VERSION_CHANGE_ID_PATTERN = "^vc-[0-9]+$";
export const REFACTOR_REQUEST_ID_PATTERN = "^rf-[0-9]+$";
export const STABLE_WRITE_REQUEST_ID_PATTERN = "^sw-[0-9]+$";
export const AMENDMENT_ID_PATTERN = "^am-[0-9]+$";
export const VERSION_CHANGE_SUMMARY_MAX = 500;
export const REFACTOR_REASON_MAX = 1000;
/** stable 许可 TTL 默认 30 分钟（C2c 冻结确认；过期拒绝且不自动补发）。 */
export const STABLE_WRITE_PERMIT_TTL_MS = 30 * 60 * 1000;

// —————————————— version-change/v1 ——————————————

export type VersionChangeKind = "detail-amendment" | "version-upgrade";
export const VERSION_CHANGE_KINDS: readonly VersionChangeKind[] = Object.freeze([
  "detail-amendment",
  "version-upgrade",
]);

export type VersionChangeStatus = "draft" | "submitted" | "approved" | "rejected" | "applied" | "superseded";
export const VERSION_CHANGE_STATUSES: readonly VersionChangeStatus[] = Object.freeze([
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
  "superseded",
]);

export type VersionChangeInitiatorRoleId = "rapporteur" | "product";
/** 发起角色唯一映射（AC-3）：detail-amendment = rapporteur；version-upgrade = product。 */
export const VERSION_CHANGE_INITIATOR_BY_KIND: Readonly<
  Record<VersionChangeKind, VersionChangeInitiatorRoleId>
> = Object.freeze({
  "detail-amendment": "rapporteur",
  "version-upgrade": "product",
});

/**
 * 事件归属（AC-31/PM 复审 §4.1 + Q3）：
 * approved/rejected = customer（+ decisionId）；
 * submitted/applied/superseded = application（不冒充客户；applied/superseded 携带 decisionId 供审计）。
 * `draft` 不是账本事件状态（仅在记录内存在）。
 */
export const VERSION_CHANGE_CUSTOMER_STATUSES: readonly VersionChangeStatus[] = Object.freeze([
  "approved",
  "rejected",
]);
export const VERSION_CHANGE_APPLICATION_STATUSES: readonly VersionChangeStatus[] = Object.freeze([
  "submitted",
  "applied",
  "superseded",
]);

/**
 * VCA target kind（P1.6 收窄）：
 * · version-upgrade 只允许 contract/roster；
 * · detail-amendment 允许 contract/roster/execution；
 * · workflow/boundary 走 stable 确认即写；product-intent 走闸门 0/1 —— 均不在 VCA。
 */
export type VersionChangeTargetKind = "contract" | "roster" | "execution";
export const VERSION_UPGRADE_TARGET_KINDS: readonly VersionChangeTargetKind[] = Object.freeze([
  "contract",
  "roster",
]);
export const DETAIL_AMENDMENT_TARGET_KINDS: readonly VersionChangeTargetKind[] = Object.freeze([
  "contract",
  "roster",
  "execution",
]);
/** 明确禁止作为 VCA target 的 kind（提交校验按此拒绝并提示 stable-write/闸门，PM 复审 §4.10-4）。 */
export const VCA_FORBIDDEN_TARGET_KINDS = Object.freeze(["workflow", "boundary", "product-intent"] as const);

export type VersionChangeTargetAction = "add" | "modify";
export const VERSION_CHANGE_TARGET_ACTIONS: readonly VersionChangeTargetAction[] = Object.freeze([
  "add",
  "modify",
]);

export interface VersionChangeTarget {
  kind: VersionChangeTargetKind;
  path: string;
  action: VersionChangeTargetAction;
  from?: string;
  /** 应用在提交时计算并定格（AC-26/F38）；文档/发起者不自报哈希。 */
  toSha256: string;
  /** 仅旧 boundary target 的读兼容；新 VCA 不接收 boundary。 */
  roleId?: string;
  /** null means the target must be absent; omission is legacy-only. */
  expectedFromSha256?: string | null;
}

/** VCA 记录（`.ans/state/version-changes.json`）。 */
export interface VersionChangeRecord {
  v: 1;
  schema: typeof VERSION_CHANGE_SCHEMA;
  applicationId: string; // vc-<n>
  kind: VersionChangeKind;
  initiatorRoleId: VersionChangeInitiatorRoleId;
  flowId: string;
  /** null 仅 bootstrap（无 trunk；AC-25/F12）；与 `bootstrap:true` 配对且只允许一次。 */
  baseTrunk: TrunkVersionRef | null;
  bootstrap: boolean;
  targets: VersionChangeTarget[];
  /** detail-amendment 必填（am-<n>）。 */
  amendmentId?: string;
  /** detail-amendment 必填。 */
  amendmentDocPath?: string;
  summary: string; // ≤ VERSION_CHANGE_SUMMARY_MAX
  status: VersionChangeStatus;
  submittedAt?: string;
  submittedBy?: string;
  /** 提交时定格申请记录。 */
  applicationSha256?: string;
  /** 仅客户批准/拒绝（approved/rejected）。 */
  decidedBy?: "customer";
  decisionId?: string;
  decidedAt?: string;
  resultTrunkVersion?: number;
  journalId?: string;
  message?: string;
  at: string;
  updatedAt?: string;
  /** P3.1 direct branch: no fabricated approved/customer transition. */
  operationId?: string;
  actionSource?: DirectActionSource;
  directReceipt?: DirectActionReceipt;
  snapshotRef?: SnapshotRef;
  /** Explicit resubmission links to the preserved old pending request. */
  supersedesApplicationId?: string;
}

export const VERSION_CHANGE_ERROR_CODES = [
  "vca-invalid",
  "vca-role-not-allowed",
  "vca-target-invalid",
  "vca-boundary-forbidden",
  "vca-base-mismatch",
  "vca-pending",
  "vca-conflict",
  "vca-channel-unavailable",
  "vca-rejected",
  "vca-apply-failed",
  "vca-hash-drift",
] as const;
export type VersionChangeErrorCode = (typeof VERSION_CHANGE_ERROR_CODES)[number];

// —————————————— doc-freeze/v1 ——————————————

/**
 * 冻结原因（P1.6 §4.5）。归属按触发源区分（AC-31/F35；2026-11-09 judge-delegated 显式契约修订）：
 * · customer：`vca-approved`/`version-upgrade-approved`/`detail-item-applied`/`proposal-confirmed`/
 *   `intent-confirmed`（客户确认类；`decidedBy:"customer"`）；
 * · application：`amendment-submitted`/`handoff-pin-bootstrap`/`bootstrap-vca-approved`/
 *   `migrated-legacy`（提交/迁移/bootstrap；`decidedBy` 缺省，不冒充客户）；
 * · judge-delegated（2026-11-09 显式修订）：客户开启「替我决策」且判断 agent 代批时，
 *   `proposal-confirmed`/`intent-confirmed` 以 `origin:"judge-delegated"` 冻结——携带 judge 来源，
 *   **无** `decidedBy`/`decisionId`；客户本人路径仍为 customer（见 `DOC_FREEZE_JUDGE_DELEGATED_REASONS`）。
 */
export type DocFreezeReason =
  | "role-direct-applied"
  | "vca-approved"
  | "version-upgrade-approved"
  | "detail-item-applied"
  | "amendment-submitted"
  | "handoff-pin-bootstrap"
  | "bootstrap-vca-approved"
  | "migrated-legacy"
  | "proposal-confirmed"
  | "intent-confirmed";
export const DOC_FREEZE_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "role-direct-applied",
  "vca-approved",
  "version-upgrade-approved",
  "detail-item-applied",
  "amendment-submitted",
  "handoff-pin-bootstrap",
  "bootstrap-vca-approved",
  "migrated-legacy",
  "proposal-confirmed",
  "intent-confirmed",
]);
export const DOC_FREEZE_CUSTOMER_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "vca-approved",
  "version-upgrade-approved",
  "detail-item-applied",
  "proposal-confirmed",
  "intent-confirmed",
]);
export const DOC_FREEZE_APPLICATION_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "amendment-submitted",
  "handoff-pin-bootstrap",
  "bootstrap-vca-approved",
  "migrated-legacy",
]);

/**
 * judge 代批（2026-11-09；「替我决策」开关开启时判断 agent 代选）可派生冻结的 reason 子集。
 * 仅两个客户确认类 reason 允许 judge 来源；VCA/version-upgrade/detail/amendment/stable 等
 * 保持客户本人（Q5 客户主权）。本常量是 `DOC_FREEZE_CUSTOMER_REASONS` 的子集约束，
 * **不改变** `DOC_FREEZE_REASONS` 全集与 customer/application 两分区。
 */
export const DOC_FREEZE_JUDGE_DELEGATED_REASONS: readonly DocFreezeReason[] = Object.freeze([
  "proposal-confirmed",
  "intent-confirmed",
]);

export type DocFreezeOrigin = "customer" | "application" | "role-direct" | "chief-delegated" | "judge-delegated";
/** New direct freezing never borrows a historical customer-approved reason. */
export const DOC_FREEZE_DIRECT_REASONS: readonly DocFreezeReason[] = Object.freeze(["role-direct-applied"]);

/**
 * R9 baseline 追加 variant 记录的冻结子形状（PM 复审 §4.2；不给既有 `VersionBaselineRecord`
 * 加可选 `freeze` 字段）。外层记录 = `VersionBaselineRecord` 公共字段 + `event:"frozen"` +
 * `freeze: DocFreezeRecord`；门禁引擎 type-import 本类型，不复制。
 * `draft-updated`（同 path/version 新 sha）/`draft-marker`（`migrated-draft` 证据）由门禁引擎追加。
 */
export const DOC_FREEZE_BASELINE_EVENT_KINDS = Object.freeze([
  "frozen",
  "draft-updated",
  "draft-marker",
] as const);

/**
 * judge 代批来源（2026-11-09 judge-delegated；诚实委托来源）。客户开启「替我决策」后判断 agent
 * 代选产生的冻结来源：**不携带任何客户字段**（无 `decidedBy`/`decisionId`/`actorRoleId`），
 * 字段按账本 `request.resolved`（及其随行 `judge` 审计）**原值逐字段复制、不截断**（G1 单一策略）。
 * `selected`（如有）与账本 `resolved.selectedOptionIds`、`confirmed`（如有）与 confirm 选择的
 * 一致性由冻结生产方/账本重放校验，本类型不自行推断。
 * 纪律：`engine` 用受限字符串而非 import `RuntimeKind`（本文件仅依赖 ./trunk.ts 的边界）；
 * `RuntimeKind` 白名单由生产方与冻结/账本消费者交叉校验真实值。
 */
export interface JudgeDelegatedSource {
  kind: "judge-delegated";
  /** 真实 `request.resolved.requestId`。 */
  requestId: string;
  /** `GovernanceJudgeAudit.engine`（如 "claude"/"codex"/"pi"/"demo"）。 */
  engine: string;
  model?: string;
  /** 必须等于 `judge:${engine}`。 */
  operatorId: string;
  reasonCode: string;
  reason?: string;
  selected?: readonly string[];
  confirmed?: true;
  /** "intent-confirm" | "proposal"（与冻结 reason 绑定）。 */
  cardKind: string;
  /** 等于 `request.resolved.at` / `freeze.frozenAt`。 */
  at: string;
}

/** 冻结记录来源（2026-11-09 显式扩展）：应用内直连来源 + judge 代批来源；客户/幕僚来源不变。 */
export type DocFreezeSource = DirectActionSource | JudgeDelegatedSource;

/**
 * judge 代批来源结构守卫（单一实现；冻结生产/校验共用）。只做类型/自洽校验：
 * 不设长度上限、不截断（G1）；source 与账本的一致性（engine/operatorId/reasonCode/reason/
 * selected/cardKind/at 逐字段）由冻结生产方与账本重放校验，本函数不读账本。
 * 任何非法形状（null/非对象/缺字段/engine 空串/operatorId 与 engine 不符/客户字段混入）
 * 一律 fail-closed、不抛错。
 */
export function isJudgeDelegatedSource(value: unknown): value is JudgeDelegatedSource {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Partial<JudgeDelegatedSource>;
  if (source.kind !== "judge-delegated") return false;
  // judge 来源不得携带任何客户身份/审批字段（审计真实性）。
  if ((source as Record<string, unknown>).decidedBy !== undefined
      || (source as Record<string, unknown>).decisionId !== undefined
      || (source as Record<string, unknown>).actorRoleId !== undefined) return false;
  if (typeof source.requestId !== "string" || source.requestId.trim() === "") return false;
  if (typeof source.engine !== "string" || source.engine === "") return false;
  if (typeof source.operatorId !== "string" || source.operatorId !== `judge:${source.engine}`) return false;
  if (typeof source.reasonCode !== "string" || source.reasonCode === "") return false;
  if (source.model !== undefined && typeof source.model !== "string") return false;
  if (source.reason !== undefined && typeof source.reason !== "string") return false;
  if (source.selected !== undefined && (!Array.isArray(source.selected)
      || !source.selected.every(part => typeof part === "string"))) return false;
  if (source.confirmed !== undefined && source.confirmed !== true) return false;
  if (typeof source.cardKind !== "string" || source.cardKind === "") return false;
  if (typeof source.at !== "string" || source.at.trim() === "") return false;
  return true;
}

export interface DocFreezeRecord {
  schema: typeof DOC_FREEZE_SCHEMA;
  /**
   * 两种历史口径（F4 勘误，2026-11-09）：
   * · VCA/application 类按客户 `decisionId` 合成非空 `proposal-<decisionId>` /
   *   `intent-<decisionId>`（PM 裁决 §4.10-7）；
   * · `intent-confirmed` 的实际生产/复核按 `requestId` 合成 `intent-<requestId>`；
   * judge-delegated 无客户 decisionId，统一按 `proposal-/intent-<source.requestId>`。**不得空串**。
   */
  applicationId: string;
  reason: DocFreezeReason;
  origin: DocFreezeOrigin;
  /** 仅客户确认类 reason（judge-delegated / chief-delegated 不得携带）。 */
  decidedBy?: "customer";
  /** 客户确认类 reason 的客户 decision id；judge-delegated / chief-delegated 不得携带。 */
  decisionId?: string;
  frozenAt: string;
  /** amendment-submitted: rapporteur；其余按触发源。 */
  actorRoleId?: string;
  /** Required for new direct-origin records; absent only on historical records. judge-delegated 必带 `JudgeDelegatedSource`。 */
  source?: DocFreezeSource;
  snapshotRef?: SnapshotRef;
}

/** Strong write shape for the new path; the loose record above is retained for old readers. */
export type DirectDocFreezeRecord = Omit<DocFreezeRecord,
  "reason" | "origin" | "decidedBy" | "decisionId" | "source" | "snapshotRef"> & {
  reason: "role-direct-applied";
  origin: "role-direct";
  source: Extract<DirectActionSource, { kind: "role-direct" }>;
  snapshotRef: SnapshotRef;
  decidedBy?: never;
  decisionId?: never;
};

/** Single pure freeze-record invariant, shared by storage and gate readers.
 * Historical legal records stay valid; current delegation switches/authorization never enter here.
 */
export function isValidDocFreezeRecord(value: unknown): value is DocFreezeRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<DocFreezeRecord>;
  if (record.schema !== DOC_FREEZE_SCHEMA) return false;
  if (typeof record.applicationId !== "string" || record.applicationId.trim() === "") return false;
  if (typeof record.reason !== "string" || !DOC_FREEZE_REASONS.includes(record.reason as DocFreezeReason)) return false;
  if (record.reason === "role-direct-applied") return record.origin === "role-direct"
    && record.decidedBy === undefined && record.decisionId === undefined
    && isDirectActionSource(record.source) && record.source.kind === "role-direct"
    && record.source.applicationId === record.applicationId && record.source.actorRoleId === record.actorRoleId
    && isSnapshotRef(record.snapshotRef) && typeof record.frozenAt === "string" && record.frozenAt.trim() !== "";
  if (record.origin === "chief-delegated") return DOC_FREEZE_CUSTOMER_REASONS.includes(record.reason as DocFreezeReason)
    && record.decidedBy === undefined && record.decisionId === undefined && record.actorRoleId === "chief"
    && isDirectActionSource(record.source) && record.source.kind === "chief-delegated" && record.source.disposition === "select"
    && typeof record.frozenAt === "string" && record.frozenAt.trim() !== "";
  if (record.origin === "judge-delegated") {
    // 2026-11-09 judge-delegated：reason 限两值；禁止客户字段；source 自洽；
    // applicationId/frozenAt 按 requestId 派生（不设长度上限、不截断——G1）。
    if (!DOC_FREEZE_JUDGE_DELEGATED_REASONS.includes(record.reason as DocFreezeReason)) return false;
    if (record.decidedBy !== undefined || record.decisionId !== undefined || record.actorRoleId !== undefined) return false;
    if (!isJudgeDelegatedSource(record.source)) return false;
    const source = record.source;
    const expectedCardKind = record.reason === "intent-confirmed" ? "intent-confirm" : "proposal";
    if (source.cardKind !== expectedCardKind) return false;
    const applicationPrefix = record.reason === "intent-confirmed" ? "intent" : "proposal";
    if (record.applicationId !== `${applicationPrefix}-${source.requestId}`) return false;
    if (typeof record.frozenAt !== "string" || record.frozenAt.trim() === "" || record.frozenAt !== source.at) return false;
    if (record.snapshotRef !== undefined && !isSnapshotRef(record.snapshotRef)) return false;
    return true;
  }
  if (record.origin !== "customer" && record.origin !== "application") return false;
  const customerReason = DOC_FREEZE_CUSTOMER_REASONS.includes(record.reason as DocFreezeReason);
  if (customerReason !== (record.origin === "customer")) return false;
  if (record.decidedBy !== undefined && record.decidedBy !== "customer") return false;
  if (record.origin === "application" && record.decidedBy !== undefined) return false;
  if (record.decisionId !== undefined && (typeof record.decisionId !== "string" || record.decisionId.trim() === "")) return false;
  if (record.actorRoleId !== undefined && (typeof record.actorRoleId !== "string" || record.actorRoleId.trim() === "")) return false;
  if (typeof record.frozenAt !== "string" || record.frozenAt.trim() === "") return false;
  if (record.source !== undefined && (!isDirectActionSource(record.source) || record.origin !== "customer"
      || record.source.kind !== "customer-decision" || record.source.decisionId !== record.decisionId)) return false;
  return true;
}

/**
 * 迁移标记（F29）：`migrated-legacy` 写冻结记录；`migrated-draft` **不写 `doc.freeze`**，
 * 仅 baseline `draft-marker` + 视图/审计标记（PM 复审 §4.2-3）。
 */
export type DocMigrationMark = "migrated-legacy" | "migrated-draft";
export const DOC_MIGRATION_MARKS: readonly DocMigrationMark[] = Object.freeze([
  "migrated-legacy",
  "migrated-draft",
]);

/** 冻结查询三态（F33 fail-closed：unknown 视为拒绝覆盖；快照缺失/损坏一律 unknown）。 */
export type DocFreezeLookupState = "frozen" | "draft" | "unknown";
export const DOC_FREEZE_LOOKUP_STATES: readonly DocFreezeLookupState[] = Object.freeze([
  "frozen",
  "draft",
  "unknown",
]);

export interface DocFreezeLookup {
  path: string;
  version?: number;
  state: DocFreezeLookupState;
  record?: DocFreezeRecord;
  migrationMark?: DocMigrationMark;
}

// —————————————— stable-write/v1 ——————————————
//
// F13 冻结（PM 复审 §四）：`StableWritePermit` 是**唯一 permit 形状**。
// · 门禁引擎的 `StableWritePermitView` 必须为本类型的别名/窄视图（如需 `diffPreview`，
//   用 `Pick`/交叉附加可选字段），**不得**另造 permit 或第二套 status 枚举；
// · 编排的 `PermitFact` 同样是本类型的别名/窄视图；
// · `StableWriteRecord` 与 `StableWritePermit` **分表存储**：record 通过 `permitId` 关联
//   permit，可镜像 `expiresAt`/`consumedAt` 供面板展示；**不得出现第三形状**；
// · `StableWriteDecisionInput` 只对齐门禁判定入参；C1 不实现判定函数（归 C2b）。

/** stable 文件种类（与 trunk 单一定义同源；不得另造）。 */
export type StableFileKind = TrunkStableFileKind;

/** `stable-write` 记录生命周期（P1.6 §4.5.1 记录状态）。 */
export type StableWriteStatus = "requested" | "approved" | "rejected" | "written" | "failed";
export const STABLE_WRITE_STATUSES: readonly StableWriteStatus[] = Object.freeze([
  "requested",
  "approved",
  "rejected",
  "written",
  "failed",
]);

/** 一次性许可的状态（F5；仅四值；不得另造第二套）。 */
export type StableWritePermitStatus = "approved" | "consumed" | "expired" | "failed";
export const STABLE_WRITE_PERMIT_STATUSES: readonly StableWritePermitStatus[] = Object.freeze([
  "approved",
  "consumed",
  "expired",
  "failed",
]);

/**
 * 许可授权来源（P1 提案 union）：decisionId / confirmationId 至少一个非空。
 * `decisionId` = 客户决定卡；`confirmationId` = appointment-write 等确认通道。
 */
export type StableWriteAuthority =
  | { decisionId: string; confirmationId?: string }
  | { decisionId?: string; confirmationId: string };

/** stable 写入记录（与 permit 分表；`requested → approved/rejected → written/failed`）。 */
export interface StableWriteRecord {
  v: 1;
  schema: typeof STABLE_WRITE_SCHEMA;
  requestId: string; // sw-<n>
  roleId: string;
  path: string;
  kind: StableFileKind;
  /** "" 表示写入前文件不存在（新文件）；否则须等于当前文件 sha256（F5）。 */
  baseSha256: string;
  targetSha256: string;
  /** 有界；卡片展示（diff preview）。 */
  diffPreview: string;
  status: StableWriteStatus;
  decisionId?: string;
  confirmationId?: string;
  /** 关联的一次性许可 id（F13：record 与 permit 分表，按 id 关联）。 */
  permitId?: string;
  /** approved 后必填。 */
  approvedAt?: string;
  /** approved 后必填（TTL 常量见 `STABLE_WRITE_PERMIT_TTL_MS`）。 */
  expiresAt?: string;
  consumedAt?: string;
  writtenAt?: string;
  at: string;
}

/**
 * 一次性写许可（**唯一 permit 形状**，F13）：
 * · `baseSha256 === ""` 表示写入前文件不存在；
 * · `status` 仅 `approved|consumed|expired|failed`；
 * · `approvedAt`/`expiresAt` 批准后必填；`consumedAt` 成功消费后写入；
 * · TTL 默认 `STABLE_WRITE_PERMIT_TTL_MS`（30 分钟）；过期拒绝且不自动补发。
 */
export interface StableWritePermit {
  v: 1;
  schema: typeof STABLE_WRITE_SCHEMA;
  permitId: string;
  requestId: string;
  roleId: string;
  path: string;
  kind: StableFileKind;
  authority: StableWriteAuthority;
  baseSha256: string; // "" = 写入前文件不存在
  targetSha256: string;
  status: StableWritePermitStatus;
  approvedAt: string;
  expiresAt: string;
  consumedAt?: string;
  issuedAt: string;
}

/**
 * `stableWriteDecision` 的无副作用判定入参（C2b 实现；C1 只冻结形状，不实现判定）：
 * `{projectRoot, relPath, sha256, permit?, now?: () => Date}`。
 * 判定为纯函数：不写盘、不消费、不发事件；无/伪造/过期/哈希不符/快照不可用 ⇒ 拒绝（fail-closed）。
 * 消费点：pre-write 判定不消费；post-write 复核 `actualSha === targetSha256` 后消费；失败作废许可。
 */
export interface StableWriteDecisionInput {
  projectRoot: string;
  relPath: string;
  sha256: string;
  permit?: StableWritePermit;
  now?: () => Date;
}

export const STABLE_WRITE_ERROR_CODES = [
  "stable-write-invalid",
  "stable-write-permit-missing",
  "stable-write-permit-invalid",
  "stable-write-permit-expired",
  "stable-write-permit-consumed",
  "stable-write-path-mismatch",
  "stable-write-hash-mismatch",
  "stable-write-confirmation-missing",
  "stable-write-write-failed",
] as const;
export type StableWriteErrorCode = (typeof STABLE_WRITE_ERROR_CODES)[number];

// —————————————— refactor-request/v1 ——————————————

/** 重构申请状态（五值含 superseded，PM 裁决 Q10）。 */
export type RefactorRequestStatus = "requested" | "accepted" | "closed" | "rejected" | "superseded";
export const REFACTOR_REQUEST_STATUSES: readonly RefactorRequestStatus[] = Object.freeze([
  "requested",
  "accepted",
  "closed",
  "rejected",
  "superseded",
]);

/** 发起者固定 convener；`managedBy` 是应用调度层语义（F31，不是新增角色）。 */
export const REFACTOR_REQUESTED_BY = "convener" as const;
export const REFACTOR_MANAGED_BY = "application-scheduler" as const;

/** 重构禁止触碰的工件类别（F40/AC-7；机械写集保证在 WriteGate）。 */
export type RefactorForbiddenKind = "versioned-doc" | "boundary" | "stable" | "team-plan" | "flow";
export const REFACTOR_FORBIDDEN_KINDS: readonly RefactorForbiddenKind[] = Object.freeze([
  "versioned-doc",
  "boundary",
  "stable",
  "team-plan",
  "flow",
]);

export interface RefactorRequestScope {
  modules: string[];
  paths: string[];
  roles: string[];
}

/** 重构申请记录（`.ans/state/refactor-requests.json`）。无客户决定；客户只读审计。 */
export interface RefactorRequestRecord {
  v: 1;
  schema: typeof REFACTOR_REQUEST_SCHEMA;
  requestId: string; // rf-<n>
  flowId: string;
  initiatedBy: typeof REFACTOR_REQUESTED_BY;
  title: string;
  reason: string; // ≤ REFACTOR_REASON_MAX
  scope: RefactorRequestScope;
  status: RefactorRequestStatus;
  managedBy: typeof REFACTOR_MANAGED_BY;
  enforcement: { writeSet: string[]; forbiddenKinds: RefactorForbiddenKind[] };
  at: string;
  updatedAt?: string;
  closedAt?: string;
  message?: string;
}

export const REFACTOR_ERROR_CODES = [
  "refactor-invalid",
  "refactor-role-not-allowed",
  "refactor-flow-missing",
  "refactor-scope-forbidden",
  "refactor-boundary-exceeded",
  "refactor-write-set-forbidden",
] as const;
export type RefactorErrorCode = (typeof REFACTOR_ERROR_CODES)[number];

// —————————————— doc-freeze 错误码 ——————————————

export const DOC_FREEZE_ERROR_CODES = [
  "doc-freeze-invalid",
  "doc-freeze-registry-unavailable",
  "doc-freeze-registry-corrupt",
  "doc-freeze-write-failed",
  "doc-freeze-application-id-missing",
] as const;
export type DocFreezeErrorCode = (typeof DOC_FREEZE_ERROR_CODES)[number];
