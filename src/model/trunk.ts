// trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1 共享 Model 契约
// （2026-11-04 trunk-amendment-model C1 冻结；形状派生自 P1.6 设计基线 + PM 复审裁决）。
//
// 纪律（C1 冻结）：
// · 共享类型/常量/纯结构不变量：无 I/O、不读写账本、不执行业务/权限判定。
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
export type TrunkSource = "adopted" | "post-run-change" | "amendment" | "upgrade" | "bootstrap" | "recovery" | "team-plan";
export const TRUNK_SOURCES: readonly TrunkSource[] = Object.freeze([
  "adopted",
  "post-run-change",
  "amendment",
  "upgrade",
  "bootstrap",
  "recovery",
  "team-plan",
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
    /** Planning-only trunk may lack workflow. Never infer run/dispatch readiness from this type. */
    workflow?: TrunkStableArtifactRef;
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
  /** Direct commits point to immutable complete bytes; legacy manifests may lack this. */
  snapshotRef?: SnapshotRef;
  actionSource?: DirectActionSource;
  /** Historical run-bound evidence only; new pre-run activation uses activeRoles. */
  frozenRoles?: Record<string, FrozenRoleEvidence>;
  /** Independent role-activation dimension; does not change document version/digest/history. */
  activeRevision?: number;
  activeDigest?: string;
  activeRoles?: Record<string, ActiveRoleEvidence>;
}

/** Only narrows the workflow prerequisite; full run authorization and evidence remain caller checks. */
export type ExecutionTrunkManifest = TrunkManifest & {
  artifacts: TrunkManifest["artifacts"] & { workflow: TrunkStableArtifactRef };
};
/** Pure prerequisite check: no file synthesis, phase state, I/O, or permission decision. */
export function hasExecutionWorkflow(manifest: TrunkManifest): manifest is ExecutionTrunkManifest {
  const workflow = manifest.artifacts.workflow;
  return workflow != null && workflow.kind === "workflow"
    && modelPath(workflow.path) && modelDigest(workflow.sha256);
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
  /** Absence preserves a planning baseline; it is never a ready execution baseline. */
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
  operationId?: string;
  actionSource?: DirectActionSource;
  beforeSnapshot?: SnapshotRef;
  targetSnapshot?: SnapshotRef;
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

// G-C1: shared Git values only. Repository identity, authorization and Git I/O belong to host layers.
export interface GitOid { objectFormat: "sha1" | "sha256"; hex: string }
export interface GitBasis { ref: string; oid: GitOid | null }
export interface GitEvidenceRef { oid: GitOid; path: string; sha256: string }
/** Complete observations retain special/unknown modes so consumers can explicitly reject unsupported effects. */
export interface GitRawTreeEntry { path: string; mode: string; oid: GitOid }
export type RawTree = readonly GitRawTreeEntry[];
export interface GitRawDiffEntry {
  status: "A" | "M" | "D" | "R" | "C" | "T";
  oldPath?: string; newPath?: string;
  oldMode?: string; newMode?: string;
  oldOid?: GitOid | null; newOid?: GitOid | null;
}
/** Existing regular-file input only. Observed raw modes never become writable input modes. */
export interface GitRawObjectInput {
  operationId: string; base: GitOid | null; parents?: readonly GitOid[];
  files: readonly { path: string; bytesBase64: string | null; executable?: boolean }[];
  message: string; timestamp?: string;
}
export interface GitRawStoredCommit { candidate: GitOid; tree: GitOid; parents: GitOid[]; message: string }
/** Owners bind the actual commit bytes to commit/tree/full entries by independently reconstructing the objects. */
export interface GitRawRevertCommit {
  commit: GitOid;
  commitBytesBase64: string;
  tree: GitOid;
  entries: RawTree;
}
export interface GitRawRevertConflict {
  path: string;
  /** null explicitly means missing on that side. */
  parent: GitRawTreeEntry | null;
  target: GitRawTreeEntry | null;
  current: GitRawTreeEntry | null;
  reason: string;
}
/** Derived observations only: complete/empty conflicts do not authenticate objects, resolve conflicts or authorize writes. */
export interface GitRawRevertBasis {
  target: GitRawRevertCommit;
  /** null only for a real root commit; the parent side is then its object-format empty tree, never a fabricated commit. */
  selectedParent: (GitRawRevertCommit & {
    /** Actual 1-based target parent position; consumers verify the bytes' real parents and requested mainline. */
    index: number;
  }) | null;
  codeBasis: GitRawRevertCommit;
  inverseChanges: readonly GitRawDiffEntry[];
  conflicts: readonly GitRawRevertConflict[];
  complete: boolean;
}
/** Shared raw-object plan. No I/O, operational capability, approval or isolation receipt lives in this Model. */
export interface GitRawObjectPlan {
  input: GitRawObjectInput;
  commit: GitRawStoredCommit;
  ref: string;
  baseTree: RawTree;
  worksite: { kind: "raw-object-plumbing"; index: "not-used"; checkout: "not-used" };
  commands: readonly (readonly string[])[];
  diff: readonly GitRawDiffEntry[];
  revertBasis?: GitRawRevertBasis;
}
export const GIT_QUERY_TEMPLATES = Object.freeze([
  "status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "merge-base", "branch-list", "worktree-list",
] as const);
export type GitQueryTemplate = (typeof GIT_QUERY_TEMPLATES)[number];
export const GIT_CAPABILITY_STATUSES = Object.freeze([
  "observed", "prepared", "published", "rejected", "conflict", "blocked", "pending-recovery",
] as const);
export type GitCapabilityStatus = (typeof GIT_CAPABILITY_STATUSES)[number];
export const GIT_CAPABILITY_PATHS_MAX = 128;
export const GIT_CAPABILITY_CANDIDATES_MAX = 64;
export const GIT_CAPABILITY_MESSAGE_MAX = 4000;
export interface GitCapabilityResult {
  operationId: string;
  repoId: string;
  status: GitCapabilityStatus;
  /** Observed code basis only; absence never means use the latest ref. Not authorization. */
  basis?: GitBasis;
  /** Present only when the host actually bound this code basis to an assigned run record. */
  basisSource?: { kind: "assigned-run"; runId: string; pinDigest: string; runRecordSha256: string };
  code?: string;
  message?: string;
  candidate?: GitOid;
  tree?: GitOid;
  parents?: GitOid[];
  published?: GitBasis;
  journalId?: string;
  output?: string;
  truncated?: boolean;
}
export function isGitOid(value: unknown): value is GitOid {
  return modelObject(value) && (value.objectFormat === "sha1" || value.objectFormat === "sha256")
    && typeof value.hex === "string" && (value.objectFormat === "sha1" ? /^[a-f0-9]{40}$/i : /^[a-f0-9]{64}$/i).test(value.hex);
}
/** This syntax is not authorization: host must still bind the exact allocated ref. */
export function isGitApplicationRef(value: unknown): value is string {
  return modelText(value) && /^(?:refs\/ans\/(?:trunk|delivery\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)|refs\/heads\/codex\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)$/.test(value)
    && !value.endsWith("/") && !value.includes("//");
}
export function isGitLiteralPath(value: unknown): value is string {
  return modelPath(value) && !value.startsWith("-") && !/[*?\[\]]/.test(value)
    && !value.split("/").some(part => part.toLowerCase() === ".git");
}
export function isGitBasis(value: unknown): value is GitBasis {
  return modelObject(value) && isGitApplicationRef(value.ref) && (value.oid === null || isGitOid(value.oid));
}
export function isGitCapabilityResult(value: unknown): value is GitCapabilityResult {
  if (!modelObject(value) || !modelText(value.operationId) || !modelText(value.repoId)
    || !GIT_CAPABILITY_STATUSES.includes(value.status as GitCapabilityStatus)) return false;
  for (const key of ["code", "message", "journalId", "output"] as const) if (value[key] !== undefined && typeof value[key] !== "string") return false;
  if (value.truncated !== undefined && typeof value.truncated !== "boolean") return false;
  for (const key of ["candidate", "tree"] as const) if (value[key] !== undefined && !isGitOid(value[key])) return false;
  if (value.parents !== undefined && (!Array.isArray(value.parents) || !value.parents.every(isGitOid))) return false;
  if (value.published !== undefined && !isGitBasis(value.published)) return false;
  if (value.basis !== undefined && !isGitBasis(value.basis)) return false;
  if (value.basisSource !== undefined) {
    const source = value.basisSource;
    if (!modelObject(source) || source.kind !== "assigned-run" || !modelText(source.runId)
      || source.runId.trim() !== source.runId || /[\x00-\x1f\x7f]/.test(source.runId)
      || !modelDigest(source.pinDigest) || !modelDigest(source.runRecordSha256)
      || Object.keys(source).length !== 4 || !Object.keys(source).every(key => ["kind", "runId", "pinDigest", "runRecordSha256"].includes(key))) return false;
  }
  if (value.status === "prepared" && (!isGitOid(value.candidate) || !isGitOid(value.tree) || !Array.isArray(value.parents))) return false;
  if (value.status === "published" && (!isGitBasis(value.published) || !isGitOid(value.published.oid))) return false;
  if (value.status === "pending-recovery" && !modelText(value.journalId)) return false;
  return true;
}

// P3.1 direct-role capabilities. Pure values and structural invariants only.
// No validator here authenticates an actor, reads bytes, calculates hashes or grants authority.
export interface TrunkCommitRef { version: number; digest: string }
export type DirectRoleAction = "version-upgrade" | "detail-amendment" | "select-run-change"
  | "complete-team-plan" | "activate-role-documents" | "close-created-task";
export const DIRECT_ROLE_ACTIONS: readonly DirectRoleAction[] = Object.freeze([
  "version-upgrade", "detail-amendment", "select-run-change", "complete-team-plan",
  "activate-role-documents", "close-created-task",
]);
export const DIRECT_ACTION_ACTORS: Readonly<Record<DirectRoleAction, readonly string[]>> = Object.freeze({
  "version-upgrade": Object.freeze(["product"]), "detail-amendment": Object.freeze(["rapporteur"]),
  "select-run-change": Object.freeze(["rapporteur"]), "complete-team-plan": Object.freeze(["convener"]),
  "activate-role-documents": Object.freeze(["nominator"]), "close-created-task": Object.freeze(["chief", "convener"]),
});
/** Application-built evidence. Never accept this object from model tool arguments. */
export type DirectActionSource =
  | { kind: "customer-decision"; decisionId: string; at: string; requestId?: string }
  | { kind: "role-direct"; actorRoleId: string; action: DirectRoleAction; operationId: string;
      applicationId: string; baseDigest: string | null; targetDigest: string; at: string;
      journalId?: string; runId?: string }
  | { kind: "chief-delegated"; actorRoleId: "chief"; originRoleId: string; requestId: string;
      baseDigest: string; delegationRevision: number; disposition: "select" | "reject" | "revise";
      selected?: readonly string[]; reason: string; at: string };

export const DIRECT_ACTION_STATUSES = Object.freeze([
  "applied", "no-op", "rejected", "committed-pending-recovery", "blocked",
] as const);
export type DirectActionStatus = (typeof DIRECT_ACTION_STATUSES)[number];
interface DirectActionReceiptBase {
  operationId: string;
  baseDigest: string | null;
  targetDigest: string | null;
  applicationId?: string;
  journalId?: string;
  source?: DirectActionSource;
  message?: string;
}
/** The pointer commit is final; a post-commit failure must retain its journal and target. */
export type DirectActionReceipt =
  | (DirectActionReceiptBase & { ok: true; status: "applied" | "no-op"; targetDigest: string })
  | (DirectActionReceiptBase & { ok: false; status: "rejected" | "blocked"; errorCode: string; message: string })
  | (DirectActionReceiptBase & { ok: false; status: "committed-pending-recovery";
      applicationId: string; journalId: string; targetDigest: string; errorCode: string; message: string });

export const COMPLETE_SNAPSHOT_SCHEMA = "complete-snapshot/v1";
export interface SnapshotRef { snapshotId: string; digest: string }
export interface SnapshotArtifactRef {
  snapshotId: string;
  path: string;
  sha256: string;
  version?: number;
}
/** Base64 preserves exact original bytes, including BOM and non-UTF8 data. */
export interface CompleteSnapshot extends SnapshotRef {
  schema: typeof COMPLETE_SNAPSHOT_SCHEMA;
  files: readonly { path: string; sha256: string; bytesBase64: string }[];
  createdAt: string;
}
/** Complete activation evidence exists before any execution run; no fabricated run/pin. */
export interface ActiveRoleEvidence {
  roleId: string;
  snapshotRef: SnapshotRef;
  rosterRef: SnapshotArtifactRef;
  planRef: SnapshotArtifactRef;
  d3Ref: SnapshotArtifactRef;
  activationRef: SnapshotArtifactRef;
  cardRef: SnapshotArtifactRef;
  boundaryMdRef: SnapshotArtifactRef;
  boundaryYamlRef: SnapshotArtifactRef;
  authorizationRef: SnapshotArtifactRef;
}
/** Only a real frozen run binds activation evidence to its actual run/pin. */
export interface FrozenRoleEvidence extends ActiveRoleEvidence {
  runId: string;
  pinDigest: string;
}
export const FROZEN_ROLE_REF_KEYS = Object.freeze([
  "rosterRef", "planRef", "d3Ref", "activationRef", "cardRef", "boundaryMdRef",
  "boundaryYamlRef", "authorizationRef",
] as const);
type ModelObject = Record<string, unknown>;
function modelObject(value: unknown): value is ModelObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function modelText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function modelDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
function modelPath(value: unknown): value is string {
  return modelText(value) && !/[\\\x00-\x1f:]/.test(value) && !value.startsWith("/")
    && !value.split("/").some(part => part === ".." || part === "." || part === "");
}
export function isSnapshotRef(value: unknown): value is SnapshotRef {
  return modelObject(value) && modelText(value.snapshotId) && modelDigest(value.digest);
}
export function isSnapshotArtifactRef(value: unknown): value is SnapshotArtifactRef {
  return modelObject(value) && modelText(value.snapshotId) && modelPath(value.path)
    && modelDigest(value.sha256) && (value.version === undefined
      || (Number.isSafeInteger(value.version) && (value.version as number) >= 1));
}
export function isCompleteSnapshot(value: unknown): value is CompleteSnapshot {
  if (!modelObject(value) || !isSnapshotRef(value) || value.schema !== COMPLETE_SNAPSHOT_SCHEMA
      || !modelText(value.createdAt) || !Array.isArray(value.files) || value.files.length === 0) return false;
  const paths = new Set<string>();
  return value.files.every((file: unknown) => {
    if (!modelObject(file) || !modelPath(file.path) || !modelDigest(file.sha256)
        || typeof file.bytesBase64 !== "string"
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.bytesBase64)
        || paths.has(file.path)) return false;
    paths.add(file.path);
    return true;
  });
}
export function isActiveRoleEvidence(value: unknown): value is ActiveRoleEvidence {
  return modelObject(value) && modelText(value.roleId) && isSnapshotRef(value.snapshotRef)
    && FROZEN_ROLE_REF_KEYS.every(key => isSnapshotArtifactRef(value[key])
      && value[key].snapshotId === (value.snapshotRef as SnapshotRef).snapshotId);
}
export function isFrozenRoleEvidence(value: unknown): value is FrozenRoleEvidence {
  return modelObject(value) && modelText(value.runId) && modelDigest(value.pinDigest) && isActiveRoleEvidence(value);
}
export function isDirectActionSource(value: unknown): value is DirectActionSource {
  if (!modelObject(value) || !modelText(value.at)) return false;
  if (value.kind === "customer-decision") return modelText(value.decisionId)
    && value.actorRoleId === undefined && (value.requestId === undefined || modelText(value.requestId));
  // A direct or delegated action must never carry fabricated customer approval fields.
  if (value.decisionId !== undefined || value.decidedBy !== undefined || value.confirmed !== undefined) return false;
  if (value.kind === "role-direct") return modelText(value.actorRoleId)
    && DIRECT_ROLE_ACTIONS.includes(value.action as DirectRoleAction)
    && DIRECT_ACTION_ACTORS[value.action as DirectRoleAction].includes(value.actorRoleId)
    && modelText(value.operationId)
    && modelText(value.applicationId) && (value.baseDigest === null || modelDigest(value.baseDigest))
    && modelDigest(value.targetDigest) && (value.journalId === undefined || modelText(value.journalId))
    && (value.runId === undefined || modelText(value.runId));
  if (value.kind !== "chief-delegated" || value.actorRoleId !== "chief" || !modelText(value.originRoleId)
      || !modelText(value.requestId) || !modelDigest(value.baseDigest)
      || !Number.isSafeInteger(value.delegationRevision) || (value.delegationRevision as number) < 0
      || !modelText(value.reason) || !["select", "reject", "revise"].includes(value.disposition as string)) return false;
  return value.disposition === "select"
    ? Array.isArray(value.selected) && value.selected.length > 0 && value.selected.every(modelText)
      && new Set(value.selected).size === value.selected.length
    : value.selected === undefined;
}
export function isDirectActionReceipt(value: unknown): value is DirectActionReceipt {
  if (!modelObject(value) || !modelText(value.operationId)
      || !(value.baseDigest === null || modelDigest(value.baseDigest))
      || !(value.targetDigest === null || modelDigest(value.targetDigest))
      || (value.source !== undefined && !isDirectActionSource(value.source))) return false;
  if (modelObject(value.source) && value.source.kind === "role-direct"
      && (value.source.operationId !== value.operationId || value.source.baseDigest !== value.baseDigest
        || value.source.targetDigest !== value.targetDigest
        || (value.applicationId !== undefined && value.source.applicationId !== value.applicationId)
        || (value.journalId !== undefined && value.source.journalId !== value.journalId))) return false;
  if (value.status === "applied" || value.status === "no-op") return value.ok === true
    && modelDigest(value.targetDigest) && (value.status !== "no-op" || value.baseDigest === value.targetDigest);
  if (value.ok !== false || !modelText(value.errorCode) || !modelText(value.message)) return false;
  if (value.status === "committed-pending-recovery") return modelText(value.applicationId)
    && modelText(value.journalId) && modelDigest(value.targetDigest);
  return value.status === "rejected" || value.status === "blocked";
}
