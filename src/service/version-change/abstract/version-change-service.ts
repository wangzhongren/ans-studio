// src/service/version-change/abstract/version-change-service.ts
// 冻结 / 版本变更申请（VCA）/ stable-write / 轻量重构 Service 抽象契约
// （2026-11-04 trunk-amendment-model C2c 契约冻结）。
//
// 归属：编排（B-7 模块私有根 `src/service/version-change/`；stable-write 子服务按 P1 §7.4
// 默认并入，不触发 B-12）。职责：业务判定与状态机契约；**不写项目文档、不写账本、不写存储**。
//
// 依赖方向：Model（C1 冻结）→ Provider（S1 后续）→ Service；本层不 import Pipeline/Interface，
// 不 import `src/common/门禁引擎/**` 实现（R9 冻结记录写入 / 同步冻结快照 / `stableWriteDecision`
// 归门禁引擎 C2b，经本文件定义的 Port 注入）。冻结权威 = R9 `.ans/state/versions.jsonl`
// baseline；`doc-freezes.json` 仅派生缓存（F34）。
//
// 契约版本：`version-change-service/v1`（见 `public/version-change-service.ts`
// `VERSION_CHANGE_SERVICE_CONTRACT_VERSION`）。形状单一来源：
// · VCA/冻结/stable/refactor 记录与常量 → `src/model/version-change.ts`（C1）；
// · trunk/修正案/journal → `src/model/trunk.ts`（C1）；
// · 账本事件 → `src/model/runtime.ts`（C1）。本文件只定义服务入参/返回/Port，不另造记录形状。
//
// F13（PM 复审 §四）：`PermitFact` 是 C1 `StableWritePermit` 的**别名**，不是第三形状；
// 门禁 `StableWritePermitView` 亦必须为同一形状的别名/窄视图（C2b 冻结）。
// F16：stable 写入真实执行点 = 编排 S3 `run-role.gate`（pre-write 许可判定）+
// B-11 `completeWrite(actualSha)`（post-write 复核消费）；桌面窗口只发行 writeSet/呈现确认卡，
// 无直接写盘路径；本 Service 不写盘、不自带 fs。
//
// 审计归属（AC-31/F35）：VCA approve/reject 与 detail-item freeze 为 customer；
// submit / amendment-submitted / 迁移 / bootstrap 为 application（`decidedBy` 缺省，不冒充客户）；
// refactor 无 customer decision。事件由 Pipeline（S4）在 Service 返回后写，本层不触达账本。

import type {
  DocFreezeErrorCode,
  DocFreezeLookup,
  DocFreezeRecord,
  DocMigrationMark,
  DocFreezeOrigin,
  DocFreezeReason,
  RefactorForbiddenKind,
  RefactorRequestRecord,
  RefactorRequestScope,
  StableFileKind,
  StableWriteErrorCode,
  StableWritePermit,
  StableWriteRecord,
  VersionChangeErrorCode,
  VersionChangeInitiatorRoleId,
  VersionChangeKind,
  VersionChangeRecord,
  VersionChangeStatus,
  VersionChangeTarget,
  VersionChangeTargetKind,
} from "../../../model/version-change.ts";
import type { TrunkAmendmentItem, TrunkVersionRef, DirectActionReceipt, DirectActionSource, SnapshotRef, CompleteSnapshot } from "../../../model/trunk.ts";

// —————————————— 通用 ——————————————

/** Service 判别返回：失败即不改状态、不写盘、不发事件。 */
export type ServiceResult<T, C extends string> =
  | { ok: true; value: T }
  | { ok: false; code: C; message?: string };

/** Port 写入结果（S1 Provider 实现；`conflict` 用于 expectedStatus 乐观并发失败）。 */
export type PortWriteResult = { ok: true } | { ok: false; code: "conflict" | "io"; message?: string };

/** 项目相对 POSIX 路径 / 内容哈希 Port（应用计算哈希；发起者不自报，P1 §4.4/F20/F25）。 */
export interface ProjectHashPort {
  /** 项目相对路径当刻字节 sha256；文件不存在返回 `undefined`。 */
  sha256File(relPath: string): Promise<string | undefined>;
  /** 最终内容字节 sha256（stable-write 的 targetSha256）。 */
  sha256Content(content: string | Uint8Array): string;
  /** 申请记录规范化 sha256（提交时定格 applicationSha256；算法由 S2 文档化，PM Q14）。 */
  sha256Record(record: VersionChangeRecord): string;
}

// —————————————— VCA（version-change/v1） ——————————————

/**
 * VCA 状态转移表（P1.6 §1.4.5/§4.4；`approved` 失败留在原状态 = 非转移、可重试）。
 * `draft` 仅存在于记录，不是账本事件状态。
 */
export const VERSION_CHANGE_TRANSITIONS: Readonly<
  Record<VersionChangeStatus, readonly VersionChangeStatus[]>
> = Object.freeze({
  draft: Object.freeze(["submitted", "superseded"] as const),
  submitted: Object.freeze(["approved", "rejected"] as const),
  approved: Object.freeze(["applied", "superseded"] as const),
  rejected: Object.freeze(["superseded"] as const),
  applied: Object.freeze([] as const),
  superseded: Object.freeze([] as const),
});

/** 状态转移契约（纯函数；Service 在每次迁移前调用）。 */
export function canTransitionVersionChange(from: VersionChangeStatus, to: VersionChangeStatus): boolean {
  return VERSION_CHANGE_TRANSITIONS[from].includes(to);
}

/** 发起角色/目标在提交前的声明形状（哈希由应用计算，不接受发起者自报）。 */
export interface VersionChangeTargetDraft {
  /**
   * 目标 kind。类型放宽为 string：`workflow`/`boundary`/`product-intent` 等非法值必须能进入
   * 校验并被拒绝（P1.6 §4.4；workflow/boundary 走 stable 确认即写）。
   */
  kind: string;
  path: string;
  action: "add" | "modify";
  from?: string;
  /** 仅旧 boundary target 的读兼容；新 VCA 不接收 boundary。 */
  roleId?: string;
}

/** VCA 创建（draft）输入；`initiatorRoleId` 为 string 以便角色矩阵校验给出明确错误码。 */
export interface VersionChangeCreateInput {
  kind: VersionChangeKind;
  initiatorRoleId: string;
  flowId: string;
  /** 有 trunk 时必须等于当前主干；无 trunk 时 `null` + `bootstrap:true`（F30/AC-25）。 */
  baseTrunk: TrunkVersionRef | null;
  bootstrap?: boolean;
  targets: VersionChangeTargetDraft[];
  /** detail-amendment 必填。 */
  amendmentId?: string;
  amendmentDocPath?: string;
  /**
   * detail-amendment 的修正案 items（S2 解析修正案文档后注入；用于 targets↔items 一致性，
   * `change:"none"` 不是 target，无实际变更项拒绝提交 — F36/F42/AC-28）。
   */
  amendmentItems?: TrunkAmendmentItem[];
  summary: string;
  at: string;
  /** 测试/恢复用；缺省由 Service 分配 `vc-<n>`（回放 max+1）。 */
  applicationId?: string;
}

export interface VersionChangeSubmitInput {
  applicationId: string;
  submittedBy?: string;
  at: string;
}

export interface VersionChangeApproveInput {
  applicationId: string;
  /** 客户决定 id（客户卡通道产物；客户本人，永不进判断器/委托/指令）。 */
  decisionId: string;
  at: string;
}

export interface VersionChangeRejectInput {
  applicationId: string;
  decisionId: string;
  message?: string;
  at: string;
}

export interface VersionChangeApplyInput {
  applicationId: string;
  /** re-pin 成功后的主干版本（version-upgrade/detail 均 +1；bootstrap 建立 t1）。 */
  resultTrunkVersion: number;
  journalId: string;
  /**
   * detail-amendment：P1.3 逐项确认后实际 applied 的 target 路径；只冻结 applied 项。
   * 全部 kept/none ⇒ 传空数组，返回 `vca-apply-failed`（`no-applicable-changes`），不改状态。
   */
  appliedTargetPaths?: string[];
  at: string;
}

/** VCA 迁移结果：`record` 新状态 + `freezes` 供 Pipeline 写 `doc.freeze` 事件。 */
export interface VersionChangeMutation {
  record: VersionChangeRecord;
  freezes: DocFreezeRecordInput[];
}

/** VCA 记录读写 Port（S1 `src/provider/version-change/` 实现）。 */
export interface VersionChangeRepositoryPort {
  list(): Promise<VersionChangeRecord[]>;
  findById(applicationId: string): Promise<VersionChangeRecord | undefined>;
  findByFlow(flowId: string): Promise<VersionChangeRecord[]>;
  insert(record: VersionChangeRecord): Promise<PortWriteResult>;
  updateWithExpectedStatus(
    record: VersionChangeRecord,
    expected: VersionChangeStatus,
  ): Promise<PortWriteResult>;
}

/**
 * VCA Service：create/submit/approve/reject/apply 五段状态机。
 * 保证（P1.6 §4.4/§5.1）：发起角色唯一（upgrade=product、detail=rapporteur）；目标在作者写区
 * （发起者不获写权）；upgrade 只 contract/roster；detail 可 contract/roster/execution；
 * workflow/boundary/product-intent 拒绝；baseTrunk 匹配（或 null+bootstrap）；同一 flow 同时
 * 仅一个 submitted/approved；applicationId 唯一、重复提交幂等；targets↔items 一致；
 * 批准前/apply 前重验 `toSha256`（F38/AC-26）；批准后 upgrade 冻结全部目标、detail 只冻结 applied 项。
 */
export interface VersionChangeDirectCreateInput extends VersionChangeCreateInput {
  operationId: string;
  requestDigest?: string;
  supersedesApplicationId?: string;
  snapshot: CompleteSnapshot;
  /** Current manifest facts obtained by Pipeline; CAS is performed by the trunk Service. */
  currentTrunk: TrunkVersionRef | null;
}
export interface VersionChangeService {
  prepareDirect?(input: VersionChangeDirectCreateInput): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
  finalizeDirect?(input: { applicationId: string; receipt: DirectActionReceipt; snapshotRef: SnapshotRef; resultTrunkVersion: number; at: string }): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
  create(input: VersionChangeCreateInput): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
  submit(input: VersionChangeSubmitInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
  approve(input: VersionChangeApproveInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
  reject(input: VersionChangeRejectInput): Promise<ServiceResult<VersionChangeRecord, VersionChangeErrorCode>>;
  apply(input: VersionChangeApplyInput): Promise<ServiceResult<VersionChangeMutation, VersionChangeErrorCode>>;
  list(filter?: { flowId?: string; status?: VersionChangeStatus }): Promise<VersionChangeRecord[]>;
}

// —————————————— 冻结服务（doc-freeze/v1） ——————————————

/**
 * R9 baseline `event:"frozen"` 记录（外层 `VersionBaselineRecord` 公共字段 + `freeze` 子形状；
 * PM 复审 §4.2-1；`DocFreezeRecord` 本身不含 path/version/sha，见 C1 Model 注释）。
 */
export interface DocFreezeRecordInput {
  path: string;
  version: number;
  sha256: string;
  freeze: DocFreezeRecord;
}

/** 迁移 `migrated-draft` 证据标记（baseline `event:"draft-marker"`；不是 freeze reason，PM Q2）。 */
export interface DraftMarkerEntry {
  path: string;
  version: number;
  sha256?: string;
  evidence?: string;
  markedAt: string;
}

/** 冻结注册表状态：missing=迁移（既有文档一律默认冻结）；corrupt=fail-closed（F29）。 */
export type FreezeRegistryState = "missing" | "ready" | "corrupt";

/**
 * 冻结注册表 Port（门禁引擎 C2b 实现；唯一写入者 = `appendDocFreezeRecords`，
 * 同 `versions.lock`/fencing；编排不直接写 `versions.jsonl` — PM §4.2-4/Q3）。
 * 同步冻结快照（`versionedDocFreezeState`）亦归 C2b；本 Port 的 `refreshSnapshot` 只触发刷新。
 */
export interface FreezeRegistryPort {
  state(): Promise<FreezeRegistryState>;
  listFreezes(): Promise<DocFreezeRecordInput[]>;
  listDraftMarkers(): Promise<DraftMarkerEntry[]>;
  appendDocFreezeRecords(records: DocFreezeRecordInput[]): Promise<PortWriteResult>;
  appendDraftMarkers(markers: DraftMarkerEntry[]): Promise<PortWriteResult>;
  /** 写后刷新 C2b 安装快照（失败 ⇒ 快照 unknown ⇒ 全量 fail-closed）。 */
  refreshSnapshot(): Promise<void>;
}

/** 冻结写入输入（reason/origin/decidedBy 归属按 C1 常量推导，F35）。 */
export interface DocFreezeInput {
  source?: DirectActionSource;
  snapshotRef?: SnapshotRef;
  path: string;
  version: number;
  sha256: string;
  applicationId: string;
  reason: DocFreezeReason;
  decisionId?: string;
  actorRoleId?: string;
  /** 覆盖 origin/decidedBy（默认按 reason 推导；`freeze` 会校验一致性）。 */
  origin?: DocFreezeOrigin;
  decidedBy?: "customer";
  at: string;
}

export interface ExistingVersionedDoc {
  path: string;
  version: number;
  sha256: string;
}

/** 仅可证明未确认的草稿（无客户确认记录/最后写入晚于最后一次确认）可标 `migrated-draft`。 */
export interface DraftCandidate extends ExistingVersionedDoc {
  evidence: string;
}

export interface FreezeMigrationInput {
  /** 迁移扫描到的既有版本化文档（S2 提供；既有文档一律默认冻结，F29）。 */
  existingDocs: ExistingVersionedDoc[];
  draftCandidates?: DraftCandidate[];
  at: string;
  /** 缺省合成 `"migration"`（不得空串）。 */
  applicationId?: string;
}

export interface FreezeMigrationReport {
  registry: FreezeRegistryState;
  migrated: DocFreezeRecordInput[];
  draftMarkers: DraftMarkerEntry[];
  skippedExisting: number;
  skippedDraftWithoutEvidence: number;
}

export interface BootstrapFreezeInput {
  docs: ExistingVersionedDoc[];
  at: string;
  reason: "handoff-pin-bootstrap" | "bootstrap-vca-approved";
  /** bootstrap-vca-approved 必填（= VCA applicationId）；handoff-pin 缺省合成。 */
  applicationId?: string;
  decisionId?: string;
}

/**
 * 冻结 Service（`isFrozen`/`freeze`/迁移/bootstrap）。
 * 保证（P1.6 §4.5/§5.2）：有冻结记录 ⇒ frozen；否则 draft；注册表 missing ⇒ unknown（先迁移）；
 * corrupt ⇒ unknown（fail-closed，不自动重建）；冻结不可逆（常态）；draft 可改但不进 trunk；
 * stable 文件不走 freeze（走 stable-write 确认即写 + mini re-pin）。
 */
export interface FreezeService {
  state(): Promise<FreezeRegistryState>;
  /** 冻结查询（Service 侧/测试/迁移用；生产同步守卫只用 C2b `versionedDocFreezeState`）。 */
  isFrozen(path: string, version?: number): Promise<DocFreezeLookup>;
  /** 已冻结记录（含 path/version/sha256；批准/apply 时重验修正案哈希用，F38）。 */
  entryOf(path: string, version?: number): Promise<DocFreezeRecordInput | undefined>;
  freeze(input: DocFreezeInput): Promise<ServiceResult<DocFreezeRecordInput, DocFreezeErrorCode>>;
  freezeMany(inputs: DocFreezeInput[]): Promise<ServiceResult<DocFreezeRecordInput[], DocFreezeErrorCode>>;
  /** `migrated-draft` 证据标记（不写 `doc.freeze`；不是 freeze reason）。 */
  recordDraftMarker(input: { path: string; version: number; sha256?: string; evidence: string; at: string }): Promise<ServiceResult<DraftMarkerEntry, DocFreezeErrorCode>>;
  /** 迁移：missing/ready ⇒ 既有文档默认冻结；corrupt ⇒ fail-closed（拒绝，不重建）。 */
  migrate(input: FreezeMigrationInput): Promise<ServiceResult<FreezeMigrationReport, DocFreezeErrorCode>>;
  /** 两条 bootstrap 路径（F30/AC-25）：首次 handoff pin / 无 trunk VCA 批准。 */
  bootstrap(input: BootstrapFreezeInput): Promise<ServiceResult<DocFreezeRecordInput[], DocFreezeErrorCode>>;
  /** 启动/会话打开：检查注册表 + 刷新 C2b 快照；missing ⇒ needsMigration，corrupt ⇒ fail-closed。 */
  ensureReady(): Promise<{ ok: true; state: FreezeRegistryState } | { ok: false; code: "doc-freeze-registry-unavailable" | "doc-freeze-registry-corrupt" }>;
  migrationMarkOf(path: string, version: number): Promise<DocMigrationMark | undefined>;
}

// —————————————— stable-write（stable-write/v1） ——————————————

/**
 * F13：`PermitFact` = C1 `StableWritePermit` 的别名（唯一 permit 形状）。
 * 门禁 `StableWritePermitView` 必须为同一类型的别名/窄视图；不得另造 permit 或第二套 status。
 */
export type PermitFact = StableWritePermit;

export interface StableWriteRequestInput {
  /** stable 文件归属角色（role-card/boundary 为被管理的角色 id；workflow 为 convener）。 */
  roleId: string;
  kind: StableFileKind;
  /** 预览的最终内容字节（应用计算 targetSha256；不信任发起者自报哈希）。 */
  content: string | Uint8Array;
  /** 有界 diff 文本（Pipeline 组装，卡片展示）；本服务只存档。 */
  diffPreview?: string;
  at: string;
  /** 测试/恢复用；缺省由 Service 分配 `sw-<n>`。 */
  requestId?: string;
}

/** 客户确认（workflow 轻量卡 / appointment-write 结果）；至少一个授权 id。 */
export interface StableWriteDecision {
  decisionId?: string;
  confirmationId?: string;
  at: string;
}

export interface StableWriteApproveResult {
  record: StableWriteRecord;
  /** 一次性许可（含 `approvedAt`/`expiresAt`；TTL = C1 `STABLE_WRITE_PERMIT_TTL_MS`）。 */
  permit: PermitFact;
}

/** mini re-pin 审计载荷（S4 映射为 `TrunkStateEvent(op:"stable-repinned")`；不升 trunkVersion）。 */
export interface StableRepinAudit {
  op: "stable-repinned";
  /** 事件前后的 trunkVersion 相同（无 manifest 时不产生本审计）。 */
  trunkVersion: number;
  kind: StableFileKind;
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

export interface StableRepinOutcome {
  /** true = trunk manifest 快照已更新；false = 无 trunk manifest，只记待续接（不写事件）。 */
  applied: boolean;
  pendingReattach?: boolean;
  audit?: StableRepinAudit;
}

export interface StableWriteCompleteInput {
  requestId: string;
  /** 写入后由应用重新计算的实际字节 sha256（post-write 复核；F16）。 */
  actualSha256: string;
  at?: string;
}

export interface StableWriteCompleteResult {
  record: StableWriteRecord;
  permit: PermitFact;
  repin: StableRepinOutcome;
}

/** stable-write 记录读写 Port（S1 实现；record 与 permit 分表，F13）。 */
export interface StableWriteRepositoryPort {
  list(): Promise<StableWriteRecord[]>;
  findById(requestId: string): Promise<StableWriteRecord | undefined>;
  insert(record: StableWriteRecord): Promise<PortWriteResult>;
  updateWithExpectedStatus(
    record: StableWriteRecord,
    expected: StableWriteRecord["status"],
  ): Promise<PortWriteResult>;
}

/** 一次性许可 Port（C2b 持有同步许可快照；编排只 install/refresh/query，不自建第二份 Map，F7）。 */
export interface StablePermitPort {
  list(): Promise<StableWritePermit[]>;
  upsert(permit: StableWritePermit): Promise<PortWriteResult>;
  /** Legacy injected fixtures may carry this method; the Service never invokes it. Production storage has no upward callback. */
  installSnapshot?(permits: readonly StableWritePermit[]): Promise<void>;
}

/**
 * mini re-pin Port（S2 trunk service 实现；P1.6 §4.5.1）：
 * 更新 trunk manifest `artifacts.workflow`/`artifacts.roleCards[role]`/`artifacts.boundaries[role]`
 * 的快照哈希，绑定 decisionId/confirmationId；**不升 trunkVersion**；无 manifest ⇒ applied:false。
 */
export interface TrunkStableSnapshotPort {
  applyStableSnapshot(input: {
    kind: StableFileKind;
    roleId: string;
    path: string;
    oldSha: string;
    newSha: string;
    confirmationId?: string;
    decisionId?: string;
    at: string;
  }): Promise<StableRepinOutcome>;
}

/**
 * stable-write Service（P1.6 §4.5.1/§5.2.1）：
 * request（计算 base/target sha + diff）→ approve（一次性许可 + 安装许可快照）/reject →
 * 写入（真实执行点 = run-role gate + B-11；本 Service 不写盘）→ completeWrite(actualSha)
 * （post-write 复核 `actual===targetSha256` 才消费 + mini re-pin；不符/异常 ⇒ failed 且许可作废，
 * fail-closed + 恢复，不产生 drift）→ fail（异常恢复）。
 * 无许可/伪造/过期 ⇒ 门禁拒绝（C2b `stableWriteDecision`）；本服务提供 `findPermit` 供快照判定。
 */
export interface StableWriteService {
  /** Actual storage root ordinary data; transitional Pipeline callers may read it, never a permission. */
  readonly projectRoot?: string;
  /** Ordinary currently applicable approved permits joined to their exact live request records. No Gate installation. */
  readPermitSnapshot(): Promise<StableWritePermit[]>;
  request(input: StableWriteRequestInput): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
  approve(requestId: string, decision: StableWriteDecision): Promise<ServiceResult<StableWriteApproveResult, StableWriteErrorCode>>;
  reject(requestId: string, decision: StableWriteDecision): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
  completeWrite(input: StableWriteCompleteInput): Promise<ServiceResult<StableWriteCompleteResult, StableWriteErrorCode>>;
  /** 异常 fail-closed + 恢复：记录/许可置 failed（不可复用），不更新 trunk 快照。 */
  fail(requestId: string, reason: string, at?: string): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
  /** 当前可用许可（status approved、未过期、未消费；供 C2b 同步许可快照/门禁查询）。 */
  findPermit(path: string): Promise<PermitFact | undefined>;
  list(): Promise<StableWriteRecord[]>;
}

// —————————————— 轻量重构（refactor-request/v1） ——————————————

/** 重构申请校验输入；发起身份由 S4/D1 保证（活动 convener 能力位），本层再校验角色。 */
export interface RefactorSubmitInput {
  requestId: string;
  flowId: string;
  /** 由 S4 从活动会话取得，不由渲染侧自报（F11）。 */
  roleId: string;
  title: string;
  reason: string;
  scope: RefactorRequestScope;
  at: string;
}

export interface RefactorValidationContext {
  flowExists: boolean;
  /** 既有模块代码根（S2 由模块文档注入）；提供时每个 scope path 必须在其内。 */
  allowedModuleRoots?: readonly string[];
}

export interface RefactorEnforcement {
  /** 机械写集：仅模块代码目录（由任务/WriteGate 收窄；F40/AC-7）。 */
  writeSet: string[];
  forbiddenKinds: RefactorForbiddenKind[];
}

export type RefactorValidationResult =
  | { ok: true; record: RefactorRequestRecord; enforcement: RefactorEnforcement }
  | { ok: false; code: "refactor-invalid" | "refactor-role-not-allowed" | "refactor-flow-missing" | "refactor-scope-forbidden" | "refactor-boundary-exceeded" | "refactor-write-set-forbidden"; message?: string };

/**
 * 重构校验接口：convener 发起；flow 存在；scope 在既有模块/角色边界内；禁止版本化文档/边界/
 * stable/团队计划/flow（越界提示 VCA/stable）；`managedBy:"application-scheduler"`（F31）；
 * 不产生 trunk 版本、无客户决定。scope 申报只作 early warning，机械保证在 WriteGate。
 */
export interface RefactorValidator {
  validate(input: RefactorSubmitInput, context: RefactorValidationContext): Promise<RefactorValidationResult>;
}

// —————————————— 组合入口 ——————————————

export interface VersionChangeServiceAllocation {
  applicationId?: () => string;
  requestId?: () => string;
  permitId?: () => string;
}

/** 组合依赖（S1 Provider + 门禁引擎 C2b Port + trunk service 注入；本层不触达文件系统）。 */
export interface VersionChangeServiceDeps {
  /** Actual storage root for proving an old pending application never passed its commit point. */
  projectRoot?: string;
  versionChanges: VersionChangeRepositoryPort;
  freezeRegistry: FreezeRegistryPort;
  stableWrites: StableWriteRepositoryPort;
  permits: StablePermitPort;
  hashes: ProjectHashPort;
  /** trunk 基线（VCA baseTrunk 比较 / mini re-pin 快照）。 */
  trunk: TrunkBaselinePort & TrunkStableSnapshotPort;
  now?: () => Date;
  allocate?: VersionChangeServiceAllocation;
}

/** VCA baseTrunk 比较 / 版本 monotonic 查询 Port（S2 trunk service 实现）。 */
export interface TrunkBaselinePort {
  /** 当前主干引用；无 trunk 返回 null。 */
  current(): Promise<TrunkVersionRef | null>;
  /** 路径族（去 `-vN.md`）已冻结的最新版本号；未知返回 undefined。 */
  latestFrozenVersion?(path: string): Promise<number | undefined>;
}

export interface VersionChangeServices {
  vca: VersionChangeService;
  freeze: FreezeService;
  stableWrite: StableWriteService;
  refactor: RefactorValidator;
}

/** `VersionChangeTarget` 的纯记录投影（供 targets↔items 与测试共享，不另造形状）。 */
export type VersionChangeTargetRecord = VersionChangeTarget;
