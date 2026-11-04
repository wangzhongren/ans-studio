// src/service/trunk/abstract/trunk-service.ts
// 主干 Service 抽象契约（2026-11-04 trunk-amendment-model B-3 / S2）。
//
// 归属：编排（`src/service/trunk/` 模块私有根，B-3）。职责：**业务判定与状态机**——
// 唯一 pinned run 派生只读 v1、verifyTrunk、修正案解析/哈希定格/边界扩大、apply-journal
// 两阶段提交与崩溃对账、受控恢复（tN+1）、stable mini re-pin；**不写项目文档、不写账本、
// 不直接发卡、不派角色**（事件由 S4 Pipeline 在 Service 返回后写，P1 §3.3）。
//
// 依赖方向：Model（C1）→ Provider（S1 `TrunkStore`/`FreezeRegistryStore`）→ Service；
// 本层不 import Pipeline/Interface。run manifest 只经 `src/common/编排/run-manifest.ts`
// 的**既有只读 API**（`readRunManifest`/`verifyPinnedRun`/`loadPinnedRoster`）；run manifest
// re-pin 写入为注入 Port（S3 在 run-manifest.ts 实现 `repins`/`repinPinnedRun`）。
//
// 形状单一来源：`TrunkManifest`/`TrunkAmendment*`/`TrunkApplyJournal`/错误码 → `src/model/trunk.ts`；
// 事件载荷形状 → `src/model/runtime.ts`（本文件只声明 Service 返回的载荷子集）。
//
// 纪律（P1.6 §4.5/§4.6/§5.4）：
// · 提交点 = trunk manifest 写成功；journal phase 仅审计，对账以**内容匹配为主**；
// · 任何失败不改 trunk 指针；恢复产生新版本 tN+1（`source:"recovery"`）；
// · trunk 只引用已冻结的版本化文档；execution（teamPlan/flow）不纳入 guard 冻结（C15），
//   由 trunk manifest + verify 保证；stable 文件为确认即写快照（mini re-pin 不升 trunkVersion）；
// · 冻结注册表 corrupt ⇒ fail-closed（不自动重建）；missing/migration-required 对 verify 按
//   F29 既有文档默认冻结处理，apply 仍要求冻结记录（VCA 已先冻结）。

import type {
  TrunkAmendmentApplyState,
  TrunkAmendmentDoc,
  TrunkAmendmentItem,
  TrunkAmendmentItemKind,
  TrunkAmendmentState,
  TrunkAmendmentStatus,
  TrunkApplyJournalPhase,
  TrunkApplySnapshot,
  TrunkAvailability,
  TrunkDocKind,
  TrunkErrorCode,
  TrunkManifest,
  TrunkSource,
  TrunkStableArtifactRef,
  TrunkStableFileKind,
  TrunkStateOp,
  TrunkVersionRef,
} from "../../../model/trunk.ts";
import type { TrunkStore } from "../../../provider/trunk/abstract/trunk-store.ts";
import type { FreezeRegistryStore } from "../../../provider/version-change/abstract/freeze-cache.ts";

// —————————————— 通用结果 ——————————————

/** 失败码 = C1 `TRUNK_ERROR_CODES`（单一来源；本层不造同义码）。失败即不改指针/不写事件。 */
export type TrunkServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TrunkErrorCode; message?: string };

// —————————————— 注入依赖 ——————————————

/**
 * run manifest re-pin Port（S3 `run-manifest.ts` 实现 `repinPinnedRun`；同 runId、追加 `repins`、
 * 幂等）。S2 只调用，不复制 run-manifest 写入语义。
 */
export interface RunRepinPort {
  repin(input: {
    runId: string;
    targets: TrunkRepinTarget[];
    applicationId: string;
    decisionId?: string;
    at: string;
  }): Promise<{ ok: true; alreadyApplied: boolean } | { ok: false; code: string; message?: string }>;
}

/** `RunRepinRecord.targets` 的 kind 集合（C1/S3 冻结形状）。 */
export type TrunkRepinTargetKind =
  | "intent"
  | "proposal"
  | "modules"
  | "roster"
  | "topology"
  | "architecture"
  | "assets"
  | "teamPlan"
  | "flow";

export interface TrunkRepinTarget {
  kind: TrunkRepinTargetKind;
  path: string;
  sha256: string;
}

export interface TrunkServiceDeps {
  projectRoot: string;
  /** S1 文件系统存储（`.ans/trunk/`）。 */
  store: TrunkStore;
  /** S1 R9 冻结注册表适配（C2b 唯一实现之上的 Port）。 */
  freezeRegistry: FreezeRegistryStore;
  /** S3 注入；缺省时 upgrade/detail 需要 re-pin 的 apply 返回 `trunk-apply-failed`。 */
  runRepin?: RunRepinPort;
  now?: () => Date;
}

// —————————————— 视图 / 校验结果 ——————————————

export interface TrunkStatusView {
  availability: TrunkAvailability;
  /** 落盘 manifest（`frozen`/`apply-uncertain`）或派生虚拟 manifest（`derived`）。 */
  manifest?: TrunkManifest;
  /** true = 未落盘、从唯一 pinned run 派生（零写入）。 */
  derived: boolean;
  frozenDocuments: Array<{ kind: TrunkDocKind; path: string; sha256: string; version?: number }>;
  stable: {
    workflow?: TrunkStableArtifactRef;
    roleCards?: Record<string, TrunkStableArtifactRef>;
    boundaries?: Record<string, TrunkStableArtifactRef>;
  };
  amendment?: {
    amendmentId: string;
    status: TrunkAmendmentStatus;
    applyState: TrunkAmendmentApplyState;
    applicationId?: string;
  };
  journal?: { journalId: string; phase: TrunkApplyJournalPhase; result?: "committed" | "apply-failed" | "applied-uncertain" };
  /** stable 文件已写入但无 trunk manifest/快照可续接（待续接；不虚构快照）。 */
  pendingReattach: string[];
  issues: string[];
}

export interface TrunkVerifyResult {
  ok: boolean;
  violations: string[];
}

/** 修正案 item 的哈希定格视图（from 取 trunk/run 基线 ref；to 取当刻字节）。 */
export interface SnapshotItem extends TrunkAmendmentItem {
  fromSha256: string | null;
  toSha256: string;
}

export interface AmendmentValidation {
  doc: TrunkAmendmentDoc;
  path: string;
  docSha256: string;
  docVersion: number;
  /** 已计算 from/to 哈希的 items（提交定格用；change:none 保留但不作为 target）。 */
  items: SnapshotItem[];
}

export interface TargetVersionChoice {
  selected?: number;
  candidates: Array<{ path: string; version: number }>;
}

export interface ExpansionResult {
  expanded: boolean;
  /** 扩大的条目/原因（供客户勾选预览；只读，不写边界）。 */
  expansions: string[];
}

// —————————————— apply ——————————————

/** `trunk.state` 审计载荷（S4 映射为 C1 `TrunkStateEvent`；`v`/`at` 由账本层补）。 */
export interface TrunkStateAuditPayload {
  kind: "trunk.state";
  op: TrunkStateOp;
  trunkVersion: number;
  previousTrunkVersion?: number;
  runId: string | null;
  flowId: string;
  source?: TrunkSource;
  decidedBy?: "customer";
  origin: "customer" | "application";
  channel?: "governance-card" | "application-observer" | "low-level-run-change";
  decisionId?: string;
  confirmationId?: string;
  amendmentId?: string;
  journalId?: string;
  path?: string;
  oldSha?: string;
  newSha?: string;
  reason?: string;
  at: string;
}

/** stable mini re-pin 审计载荷（与 C2c `StableRepinAudit` 结构一致；不升 trunkVersion）。 */
export interface StableRepinAuditPayload {
  op: "stable-repinned";
  trunkVersion: number;
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  origin: "customer";
  decidedBy: "customer";
  at: string;
}

export interface TrunkStableSnapshotInput {
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  /** 写入前 hash（"" = 写入前文件不存在；record.baseSha256 同约定）。 */
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  at: string;
}

export interface TrunkStableSnapshotResult {
  applied: boolean;
  pendingReattach?: boolean;
  audit?: StableRepinAuditPayload;
}

export interface TrunkApplyInput {
  /** bootstrap 仅建立 t1；recovery 只经 `recover()`。 */
  source: "amendment" | "upgrade" | "bootstrap";
  flowId: string;
  /** VCA/修正案 applicationId（审计关联）。 */
  applicationId: string;
  /** 客户决定 id（VCA 批准）；有则审计 origin/decidedBy = customer。 */
  decisionId?: string;
  amendmentId?: string;
  runId: string | null;
  /** 期望的当前主干版本；null = 无 manifest（仅 bootstrap）。 */
  baseTrunkVersion: number | null;
  /** 目标内容快照（documents/execution/workflow/roleCards/boundaries；service 以磁盘字节复核）。 */
  target: TrunkApplySnapshot;
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  /** 需要更新 pinned run manifest 时提供（S3 Port）。 */
  repin?: { runId: string; targets: TrunkRepinTarget[] };
  highRisk?: { acknowledged: true; items?: string[] };
  journalId?: string;
  at: string;
}

export interface TrunkApplyResult {
  manifest: TrunkManifest;
  journalId: string;
  alreadyApplied: boolean;
  previousTrunkVersion: number | null;
  historyArchivedVersion?: number;
  audit: TrunkStateAuditPayload;
  issues?: string[];
}

export type JournalContentPhase = "prepared" | "run-manifest-written" | "committed";

export interface ReconcileResult {
  state: "none" | JournalContentPhase | "split";
  journalId?: string;
  recordedPhase?: TrunkApplyJournalPhase;
  contentPhase?: JournalContentPhase;
  split: boolean;
  message?: string;
  /** 内容已到提交点但事件缺失：S4 补写（幂等）。 */
  audit?: TrunkStateAuditPayload;
}

export interface TrunkRecoveryInput {
  /** 客户确认 id（恢复需客户本人确认）。 */
  decisionId: string;
  reason: string;
  /** true = 优先用 apply-journal 的 target 内容；缺省从唯一 pinned run 重新派生。 */
  useJournalTarget?: boolean;
  journalId?: string;
  at: string;
}

// —————————————— 2026-11-05（Batch 3.5 / S5）：主干客户动作（refreeze/abandon/history） ——————————————

/** stable 快照目标（refreeze 只允许 stable 文件；版本化文档/execution 一律拒绝）。 */
export interface TrunkStableSnapshotTarget {
  workflow?: { path: string; sha256: string };
  roleCards?: Record<string, { path: string; sha256: string }>;
  boundaries?: Record<string, { path: string; sha256: string }>;
}

export interface TrunkRefreezeInput {
  /** 客户 decisionId（客户本人；不进入判断器/委托/指令）。 */
  decisionId: string;
  reason: string;
  /** 高危二次确认（重新冻结属应急/恢复路径时必须 acknowledged:true）。 */
  highRisk?: { acknowledged: true; items?: string[] };
  /** 只更新 stable 快照（内容以磁盘字节复核）；**不升 trunkVersion**。 */
  target: TrunkStableSnapshotTarget;
  at: string;
}

export interface TrunkRefreezeResult {
  manifest: TrunkManifest;
  audit: TrunkStateAuditPayload;
  /** 实际变化的 stable 路径（workflow / roleCards.<role> / boundaries.<role>）。 */
  changed: string[];
}

export interface TrunkAbandonUpgradeInput {
  decisionId: string;
  reason: string;
  at: string;
}

export interface TrunkAbandonUpgradeResult {
  /** 当前 trunk manifest（放弃不改指针；无 manifest 时 undefined）。 */
  manifest?: TrunkManifest;
  audit: TrunkStateAuditPayload;
}

export interface TrunkHistoryResult {
  /** 已归档的 trunk 版本号（升序；来自 `.ans/trunk/history/`，不虚构内容）。 */
  versions: number[];
  /** 当前主干版本（无 manifest 时缺省）。 */
  currentTrunkVersion?: number;
}

// —————————————— 2026-11-05（E2 返工 S7 / AC-5 / AC-13） ——————————————

/** version-upgrade 前置校验输入（批准前/apply 前；有效文档 = 当前 trunk 覆盖 VCA targets 后）。 */
export interface UpgradeChainValidationInput {
  flowId: string;
  /** 有效文档集（path + sha256；内容以磁盘字节复核）。 */
  documents: Partial<Record<TrunkDocKind, { path: string; sha256: string }>>;
  /** 是否本次变更 roster（决定版本链强校验与 roster 版本单调）。 */
  rosterChanged: boolean;
  /** 当前 trunk rosterVersion（roster 变更时必须递增）。 */
  rosterVersionFloor?: number;
  /** 当前 D3（trunk manifest.d3 / run d3）；targetRoleIds 必须 ⊆ roster roles。 */
  d3?: { decisionId: string; targetRoleIds: string[] };
}

export interface UpgradeChainValidation {
  rosterVersion?: number;
  roleIds: string[];
  /** 已通过的检查（content/schema/roster/d3/chain/role-cards）。 */
  checks: string[];
}

/** stable boundary（preview 文本）扩大检测输入（AC-13；不写盘）。 */
export interface StableBoundaryExpansionInput {
  projectRoot: string;
  roleId: string;
  /** 当前 boundary.yaml（项目相对路径）。 */
  fromPath: string;
  /** 预览的最终 boundary.yaml 文本（客户确认卡 body）。 */
  toYamlText: string;
}

export interface StableBoundaryExpansionResult {
  expanded: boolean;
  /** 扩大条目（`root:path`）或不可解析原因（fail-closed）。 */
  expansions: string[];
}

// —————————————— Service ——————————————

/**
 * 主干 Service（P1 §2.3/§3.3）：
 * · `status`/`verify`/`derive`：派生只读 v1（零写入）、校验 pinned run/stable/roster/D3/R9；
 * · `validateAmendment`/`snapshotItemHashes`/`detectBoundaryExpansion`/`selectTargetVersion`：
 *   修正案解析、哈希定格、边界扩大（只读）、目标版本选择；
 * · `recordAmendment`/`readAmendment`：`.ans/trunk/amendment.json` 生命周期（P1.3 旧状态映射）；
 * · `executeApply`：journal 两阶段（提交点 = trunk manifest 写成功）、history 归档、审计载荷；
 * · `reconcileJournal`：内容匹配为主/phase 辅助、两方向/相位滞后如实报告；
 * · `recover`：客户确认的受控恢复（tN+1）；
 * · `applyStableSnapshot`：mini re-pin（不升 trunkVersion、无 manifest 只记待续接）；
 * · `current`/`latestFrozenVersion`：C2c `TrunkBaselinePort` 结构对齐。
 */
export interface TrunkService {
  status(): Promise<TrunkStatusView>;
  verify(): Promise<TrunkVerifyResult>;
  derive(): Promise<TrunkServiceResult<{ manifest: TrunkManifest; issues: string[] }>>;
  validateAmendment(input: { amendmentDocPath: string; flowId: string }): Promise<TrunkServiceResult<AmendmentValidation>>;
  snapshotItemHashes(items: readonly TrunkAmendmentItem[]): Promise<TrunkServiceResult<SnapshotItem[]>>;
  detectBoundaryExpansion(items: readonly TrunkAmendmentItem[]): Promise<ExpansionResult>;
  selectTargetVersion(input: { kind: TrunkAmendmentItemKind; path: string }): Promise<TargetVersionChoice>;
  recordAmendment(state: TrunkAmendmentState): Promise<TrunkServiceResult<TrunkAmendmentState>>;
  readAmendment(): Promise<TrunkServiceResult<TrunkAmendmentState | undefined>>;
  executeApply(input: TrunkApplyInput): Promise<TrunkServiceResult<TrunkApplyResult>>;
  reconcileJournal(): Promise<TrunkServiceResult<ReconcileResult>>;
  recover(input: TrunkRecoveryInput): Promise<TrunkServiceResult<TrunkApplyResult>>;
  applyStableSnapshot(input: TrunkStableSnapshotInput): Promise<TrunkStableSnapshotResult>;
  /**
   * 完成升级/重新冻结（P1.3 保留；Batch 3.5 S5）：只更新 stable 快照（workflow/roleCards/
   * boundaries），客户 decisionId + 高危确认；内容以磁盘字节复核；**不升 trunkVersion**。
   * 返回 `trunk.state(op:"refrozen")` 审计载荷（不写账本）。
   */
  refreeze(input: TrunkRefreezeInput): Promise<TrunkServiceResult<TrunkRefreezeResult>>;
  /** 放弃升级（P1.3 保留）：关闭解冻窗口、不 re-pin、不改指针；返回 `refrozen-cancelled` 载荷。 */
  abandonUpgrade(input: TrunkAbandonUpgradeInput): Promise<TrunkServiceResult<TrunkAbandonUpgradeResult>>;
  /** trunk 历史版本列表（只读；来自 history 归档，不虚构内容）。 */
  history(): Promise<TrunkServiceResult<TrunkHistoryResult>>;
  /** version-upgrade 批准前/apply 前校验（AC-5；失败返回 `trunk-item-invalid`，调用方映射 vca-*）。 */
  validateUpgradeChain(input: UpgradeChainValidationInput): Promise<TrunkServiceResult<UpgradeChainValidation>>;
  /** stable boundary 预览文本扩大检测（AC-13；只读，不写盘）。 */
  detectStableBoundaryExpansion(input: StableBoundaryExpansionInput): Promise<StableBoundaryExpansionResult>;
  /** C2c `TrunkBaselinePort`：当前主干引用；无 trunk 返回 null。 */
  current(): Promise<TrunkVersionRef | null>;
  /** C2c `TrunkBaselinePort`：路径族已冻结的最新版本号（未知返回 undefined）。 */
  latestFrozenVersion(pathFamily: string): Promise<number | undefined>;
}
