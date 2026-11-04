// trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1 共享 Model 契约
// （2026-11-04 trunk-amendment-model C1 冻结；形状派生自 P1.6 设计基线 + PM 复审裁决）。
//
// 纪律（C1 冻结）：
// · 纯类型/常量：无 I/O、不读写账本、不执行任何判定（判定归 Service/门禁引擎/编排）。
// · 依赖方向：本文件 **零项目 import**；`version-change.ts` 可 type-import 本文件；
//   `runtime.ts` 可 type-import 本文件；反向禁止（见 P1 §3.5）。
// · 不改既有字段语义/不删除/不重命名；新增字段默认可选，旧读者忽略未知字段。
// · P1.6 起 stable 文件为「确认即写 + mini re-pin」快照；**不恢复 drift 状态**，
//   legacy `drift`/`unfrozen-expired` 仅用于旧账本读取（见 `TrunkStateLegacyOp`）。

/** `trunk/v1` manifest schema（单一来源）。 */
export const TRUNK_MANIFEST_SCHEMA = "trunk/v1";
/** `trunk-amendment/v1` schema（修正案文档与进行中状态共用）。 */
export const TRUNK_AMENDMENT_SCHEMA = "trunk-amendment/v1";
/** `trunk-apply-journal/v1` schema（跨文件提交日志）。 */
export const TRUNK_APPLY_JOURNAL_SCHEMA = "trunk-apply-journal/v1";
/** trunkVersion 最小值（bootstrap/首次建立为 1）。 */
export const TRUNK_VERSION_MIN = 1;

/**
 * stable 文件种类（单一定义；`version-change.ts` 的 `StableFileKind` 为本类型的别名）。
 * workflow/role-card/boundary 写入必须当刻客户确认；确认后立即 mini re-pin（不升 trunkVersion）。
 */
export type TrunkStableFileKind = "workflow" | "role-card" | "boundary";
export const TRUNK_STABLE_FILE_KINDS: readonly TrunkStableFileKind[] = Object.freeze([
  "workflow",
  "role-card",
  "boundary",
]);

/**
 * 主干来源（P1.3 source + P1.6 bootstrap/恢复）。
 * 只用 `"upgrade"`；消费方不得新造 `"main-upgrade"`（PM 复审 §4.10-3）。
 */
export type TrunkSource = "adopted" | "post-run-change" | "amendment" | "upgrade" | "bootstrap" | "recovery";
export const TRUNK_SOURCES: readonly TrunkSource[] = Object.freeze([
  "adopted",
  "post-run-change",
  "amendment",
  "upgrade",
  "bootstrap",
  "recovery",
]);

/**
 * 主干引用的版本化文档类别。
 * `intent` 不入主干（P1.6-F32：意图变化走需求变更/闸门 0/1，product-intent 不在 VCA）。
 */
export type TrunkDocKind = "proposal" | "modules" | "topology" | "architecture" | "assets" | "roster";
export const TRUNK_DOC_KINDS: readonly TrunkDocKind[] = Object.freeze([
  "proposal",
  "modules",
  "topology",
  "architecture",
  "assets",
  "roster",
]);

/** 版本化文档引用（path + 当刻字节 sha256；version 可选）。 */
export interface TrunkArtifactRef {
  path: string;
  sha256: string;
  version?: number;
}

/** execution（团队计划/flow）引用；缺失为 null（不伪造）。 */
export interface TrunkExecutionRef {
  teamPlan: TrunkArtifactRef | null;
  flow: (TrunkArtifactRef & { version: number }) | null;
}

/**
 * stable 文件快照（mini re-pin 绑定 decisionId/confirmationId；不产生冻结记录）。
 * 三类 stable 文件均带 `kind`/`path`（PM 复审 F3；AC-34）。
 */
export interface TrunkStableArtifactRef {
  kind: TrunkStableFileKind;
  path: string;
  sha256: string;
  /** workflow 轻量写入确认卡 / role-card·boundary appointment-write 的确认 id。 */
  confirmationId?: string;
  /** 客户决定 id（与 confirmationId 至少其一；由应用写入）。 */
  decisionId?: string;
  updatedAt?: string;
}

/** VCA `baseTrunk` 比较基准（`version-change.ts` 复用；避免第二份 baseTrunk 形状）。 */
export interface TrunkVersionRef {
  trunkVersion: number;
  runId: string | null;
  /** 内容 digest（算法由 S2 计算并文档化；Model 只声明字段，PM 裁决 Q14）。 */
  digest: string;
}

/** `.ans/trunk/manifest.json`：当前主干基线。 */
export interface TrunkManifest {
  schema: typeof TRUNK_MANIFEST_SCHEMA;
  trunkVersion: number;
  source: TrunkSource;
  previous: { trunkVersion: number; runId?: string | null } | null;
  flowId: string;
  /** bootstrap 首次建立 t1 时可为 null；首个 handoff pin 后回填（PM 裁决 Q13）。 */
  runId: string | null;
  artifacts: {
    documents: Partial<Record<TrunkDocKind, TrunkArtifactRef>>;
    execution: TrunkExecutionRef;
    workflow: TrunkStableArtifactRef;
    /** role-card.md 快照（roleId → 快照；PM 复审 F3；AC-34 覆盖三类 stable 文件）。 */
    roleCards?: Record<string, TrunkStableArtifactRef>;
    /** boundary.yaml 快照（roleId → 快照）。 */
    boundaries: Record<string, TrunkStableArtifactRef>;
  };
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  /** 内容 digest（算法由 S2 计算并文档化；Model 只声明字段）。 */
  digest: string;
  createdAt: string;
  updatedAt: string;
}

/** 主干可用性（只读视图；不持久化、无 schema 自描述）。 */
export type TrunkAvailability = "frozen" | "derived" | "unavailable" | "apply-uncertain";

/** `trunk:state` 只读视图（IPC/面板；不持久化）。 */
export interface TrunkStateView {
  availability: TrunkAvailability;
  trunkVersion?: number;
  source?: TrunkSource;
  runId?: string | null;
  flowId?: string;
  workflow?: TrunkStableArtifactRef;
  roleCards?: Record<string, TrunkStableArtifactRef>;
  boundaries?: Record<string, TrunkStableArtifactRef>;
  pendingAmendmentId?: string;
  applyState?: TrunkAmendmentApplyState;
  journalId?: string;
  issues?: string[];
}

/**
 * 修正案生命周期（P1.6 §1.4.3/§4.7）：
 * draft（可原位改）→ submitted（VCA 提交，修正案冻结）→ approved/rejected → applied/superseded。
 * `proposed`/`confirmed`/`cancelled` 为旧账本读侧映射（不重写旧账本）。
 */
export type TrunkAmendmentStatus = "draft" | "submitted" | "approved" | "rejected" | "applied" | "superseded";
export const TRUNK_AMENDMENT_STATUSES: readonly TrunkAmendmentStatus[] = Object.freeze([
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
  "superseded",
]);

/** P1.3 旧修正案状态（只读兼容；新代码不得写入）。 */
export type TrunkAmendmentLegacyStatus = "proposed" | "confirmed" | "cancelled";
export const TRUNK_AMENDMENT_LEGACY_STATUSES: readonly TrunkAmendmentLegacyStatus[] = Object.freeze([
  "proposed",
  "confirmed",
  "cancelled",
]);
/** 旧状态 → P1.6 状态映射（AC-32；旧账本只读、不改写）。 */
export const TRUNK_AMENDMENT_LEGACY_STATUS_MAP: Readonly<
  Record<TrunkAmendmentLegacyStatus, TrunkAmendmentStatus>
> = Object.freeze({
  proposed: "submitted",
  confirmed: "approved",
  cancelled: "rejected",
});

/** 执行子态与生命周期分离（P1.3 F6 保留）。 */
export type TrunkAmendmentApplyState = "idle" | "applying" | "applied" | "apply-failed" | "applied-uncertain";
export const TRUNK_AMENDMENT_APPLY_STATES: readonly TrunkAmendmentApplyState[] = Object.freeze([
  "idle",
  "applying",
  "applied",
  "apply-failed",
  "applied-uncertain",
]);

/**
 * item kind：新 detail-amendment 只允许 contract/roster/execution（P1.6 §4.7/§5.3；
 * workflow/boundary 走 stable 确认即写，仅旧文档可读）。`change:none` 不是 VCA target。
 */
export type TrunkAmendmentItemKind = "contract" | "roster" | "execution" | "workflow" | "boundary";
export const TRUNK_AMENDMENT_VCA_ITEM_KINDS = Object.freeze(["contract", "roster", "execution"] as const);
export const TRUNK_AMENDMENT_LEGACY_ITEM_KINDS = Object.freeze(["workflow", "boundary"] as const);
export type TrunkAmendmentItemChange = "add" | "modify" | "none";
export type TrunkAmendmentItemResult = "pending" | "applied" | "kept" | "cancelled";

/** 修正案单项（哈希由应用计算/定格；发起者不自报）。 */
export interface TrunkAmendmentItem {
  itemId: string;
  kind: TrunkAmendmentItemKind;
  change: TrunkAmendmentItemChange;
  from?: string;
  /** `change:add` 可缺省或 null（P1.3 F21）；由应用在提交时计算定格（F20/F25）。 */
  fromSha256?: string | null;
  to: string;
  toSha256?: string;
  /** 仅旧 boundary item 的读兼容；新 detail 不含 boundary。 */
  roleId?: string;
  reason?: string;
  result?: TrunkAmendmentItemResult;
}

/** 修正案文档 frontmatter（策划写 `docs/proposals/<flowId>-amendment-vN.md`）。 */
export interface TrunkAmendmentDoc {
  schema: typeof TRUNK_AMENDMENT_SCHEMA;
  amendmentId: string;
  flowId: string;
  docVersion: number;
  /** bootstrap detail 允许 null（仅当 `bootstrap:true`；与 P1.6/AC-25 一致，PM F12）。 */
  baseTrunk: TrunkVersionRef | null;
  /** `baseTrunk === null` ⇒ `true`（bootstrap 只允许一次）。 */
  bootstrap?: boolean;
  summary?: string;
  items: TrunkAmendmentItem[];
}

/** 整组一致性 check id（P1.3 F24 候选八项；P1.3 原文不可得，按 PM 裁决 Q9 以本候选冻结）。 */
export const TRUNK_AMENDMENT_CHECK_IDS = Object.freeze([
  "roles-in-roster",
  "boundary-role-has-card",
  "module-owner-in-roster",
  "workflow-roles-exist",
  "d3-target-subset",
  "roster-version-monotonic",
  "contract-reference-chain",
  "execution-goal-consistency",
] as const);
export type TrunkAmendmentCheckId = (typeof TRUNK_AMENDMENT_CHECK_IDS)[number];
export interface TrunkAmendmentCheck {
  checkId: TrunkAmendmentCheckId;
  ok: boolean;
  detail?: string;
}

/** `.ans/trunk/amendment.json`（应用维护的进行中状态）。 */
export interface TrunkAmendmentState {
  v: 1;
  schema: typeof TRUNK_AMENDMENT_SCHEMA;
  amendmentId: string;
  flowId: string;
  docPath: string;
  /** VCA 提交时定格（application-submitted freeze）。 */
  docSha256: string;
  docVersion: number;
  /** bootstrap 可 null（PM F12/AC-25）；与 `bootstrap` 配对。 */
  baseTrunk: TrunkVersionRef | null;
  bootstrap?: boolean;
  status: TrunkAmendmentStatus;
  applyState: TrunkAmendmentApplyState;
  /** VCA 关联（P1.6 §5.3 新增；旧记录可缺省）。 */
  applicationId?: string;
  items: TrunkAmendmentItem[];
  checks?: TrunkAmendmentCheck[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  decidedAt?: string;
  appliedAt?: string;
  resultTrunkVersion?: number;
  journalId?: string;
  message?: string;
}

/**
 * 跨文件提交日志 phase（trunk manifest 写成功即提交点；phase 仅审计，P1.3 F18/F27）。
 * `committed`：提交点后写，仅审计/诊断，不作提交判据（PM 复审 F4）。
 */
export type TrunkApplyJournalPhase = "prepared" | "run-manifest-written" | "committed";
export const TRUNK_APPLY_JOURNAL_PHASES: readonly TrunkApplyJournalPhase[] = Object.freeze([
  "prepared",
  "run-manifest-written",
  "committed",
]);

/** 对账用内容快照（内容匹配为主判据，P1.3 F18）。 */
export interface TrunkApplySnapshot {
  trunkVersion: number;
  runId: string | null;
  documents: Partial<Record<TrunkDocKind, { path: string; sha256: string }>>;
  execution: {
    teamPlan: { path: string; sha256: string } | null;
    flow: { path: string; sha256: string; version: number } | null;
  };
  workflow?: { path: string; sha256: string };
  /** role-card 快照同步（PM 复审 F3）。 */
  roleCards?: Record<string, { path: string; sha256: string }>;
  boundaries?: Record<string, { path: string; sha256: string }>;
}

/** `.ans/trunk/apply-journal.json`。 */
export interface TrunkApplyJournal {
  v: 1;
  schema: typeof TRUNK_APPLY_JOURNAL_SCHEMA;
  journalId: string;
  /** detail-amendment / 主干升级。 */
  amendmentId?: string;
  /** VCA（version-upgrade）。 */
  applicationId?: string;
  flowId: string;
  phase: TrunkApplyJournalPhase;
  target: TrunkApplySnapshot;
  before: TrunkApplySnapshot;
  startedAt: string;
  updatedAt: string;
  result?: "committed" | "apply-failed" | "applied-uncertain";
  message?: string;
}

/**
 * `trunk.state` op（新写入集合）。
 * 归属（P1.6 §5.5/AC-31 + PM 复审 §4.1）：
 * · `switched`/`unfrozen`/`refrozen`/`refrozen-cancelled`/`recovered`/`stable-repinned` ⇒
 *   `origin:"customer"`、`decidedBy:"customer"`；
 * · `gap` ⇒ `origin:"application"`、`decidedBy` 缺省、`channel:"low-level-run-change"`；
 * · `stable-repinned` 为客户确认后的应用动作（customer），**trunkVersion 不变**。
 */
export type TrunkStateOp =
  | "switched"
  | "unfrozen"
  | "refrozen"
  | "refrozen-cancelled"
  | "recovered"
  | "gap"
  | "stable-repinned";
export const TRUNK_STATE_OPS: readonly TrunkStateOp[] = Object.freeze([
  "switched",
  "unfrozen",
  "refrozen",
  "refrozen-cancelled",
  "recovered",
  "gap",
  "stable-repinned",
]);

/**
 * 仅旧读/兼容集合：P1.6 移除 drift；O5 未选 ⇒ 无 `unfrozen-expired` 新写入（PM 裁决 Q2）。
 * 新代码不得写这两个值。
 */
export type TrunkStateLegacyOp = "drift" | "unfrozen-expired";
export const TRUNK_STATE_LEGACY_OPS: readonly TrunkStateLegacyOp[] = Object.freeze([
  "drift",
  "unfrozen-expired",
]);

/** 客户决策/客户确认后动作（`decidedBy:"customer"`；AC-31）。 */
export const TRUNK_STATE_CUSTOMER_OPS: readonly TrunkStateOp[] = Object.freeze([
  "switched",
  "unfrozen",
  "refrozen",
  "refrozen-cancelled",
  "recovered",
  "stable-repinned",
]);
/** 应用观测/自动动作（`origin:"application"`、`decidedBy` 缺省）。 */
export const TRUNK_STATE_APPLICATION_OPS: readonly TrunkStateOp[] = Object.freeze(["gap"]);

/**
 * trunk 层错误码（C1 冻结后为单一来源；C2c/S2 不另造同义码）。
 * 不设 `trunk-drift`（PM 裁决并入 `trunk-verify-failed`，不恢复 drift 状态）。
 */
export const TRUNK_ERROR_CODES = [
  "trunk-unavailable",
  "trunk-manifest-invalid",
  "trunk-manifest-corrupt",
  "trunk-manifest-write-failed",
  "trunk-verify-failed",
  "trunk-version-invalid",
  "trunk-version-regression",
  "trunk-amendment-invalid",
  "trunk-amendment-not-found",
  "trunk-amendment-conflict",
  "trunk-amendment-status-invalid",
  "trunk-item-invalid",
  "trunk-boundary-expansion-unacknowledged",
  "trunk-high-risk-unacknowledged",
  "trunk-journal-corrupt",
  "trunk-journal-write-failed",
  "trunk-apply-failed",
  "trunk-apply-uncertain",
  "trunk-recovery-invalid",
] as const;
export type TrunkErrorCode = (typeof TRUNK_ERROR_CODES)[number];
