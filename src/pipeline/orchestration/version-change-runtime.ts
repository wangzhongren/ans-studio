// src/pipeline/orchestration/version-change-runtime.ts
// 版本变更申请（VCA）Pipeline 公共句柄（2026-11-04 trunk-amendment-model B-8 / S4）。
//
// 职责（P1 §2.5-26/§3.5/§4.4/§4.7；F35/F36/F37/F38/F43）：
// · `submit`：create + submit（S2 VCA Service）→ `version.change(submitted)`（application）+ 提交冻结
//   修正案的 `doc.freeze`；通知幕僚/运营（无批准权）。
// · `present`：客户卡（客户本人；无卡通道 ⇒ `vca-channel-unavailable`，保持 submitted 可重试）。
// · `approve`：批准前哈希重验由 S2 Service 保证；`version-upgrade` 单次（冻结 → trunk apply/re-pin →
//   `version.change(applied)`）；`detail-amendment` 只到 approved，等待逐项确认。
// · `runAmendmentItems`/`applyAmendmentItems`：detail 逐项卡（item-apply/item-keep/
//   item-cancel-amendment）+ acknowledgments；只冻结 applied 项（C15；execution 不纳入 guard），
//   全部确认后 trunk apply → `vca.apply` → `trunk.amendment`/`version.change(applied)` 事件。
// · bootstrap（`baseTrunk:null`）：批准后经 trunk-runtime 建立 t1（`source:"bootstrap"`）。
//
// 纪律：**不写项目文档、不直接写账本/发卡、不派角色**；Service/store/卡/事件/通知全部注入；
// 客户卡永不进判断器/委托/指令；失败不冻结/不 re-pin（S2 保证），事件只按实际结果写。

import { createHash } from "node:crypto";
import { createFsTrunkStore, createProjectTrunkStore, readGitProtectionFacts } from "../../provider/trunk/public/trunk-store.ts";
import { appendOperationEvent, operationDeliveryRecorded, recordOperationDelivery } from "../../provider/version-change/public/version-change-store.ts";
import { createTrunkService } from "../../service/trunk/public/trunk-service.ts";
import { validateBoundaryYamlText } from "../../service/boundary/resolve-boundary.ts";
import { builtInRoleModuleOf } from "../../service/role/resolve-role.ts";

import type { TaskStateEvent, SubmitVersionChangeInput, SubmitVersionChangeResult } from "../../model/runtime.ts";
import type { RolePolicyDecision } from "../../model/role.ts";
import type { DirectActionReceipt, DirectActionSource } from "../../model/trunk.ts";
import type {
  TrunkApplySnapshot,
  TrunkDocKind,
  TrunkStableArtifactRef,
} from "../../model/trunk.ts";
import type {
  DocFreezeRecordInput,
  ServiceResult,
  VersionChangeCreateInput,
  VersionChangeServices,
} from "../../service/version-change/public/version-change-service.ts";
import type { VersionChangeErrorCode, VersionChangeRecord, VersionChangeStatus } from "../../model/version-change.ts";
import type { SnapshotItem, TrunkApplyResult, TrunkRepinTargetKind, TrunkService, DirectTrunkService } from "../../service/trunk/public/trunk-service.ts";
import type { TrunkRuntime, TrunkRuntimeResult, DirectNotificationSink } from "./trunk-runtime.ts";
import { executeGitDocumentPublication } from "./trunk-runtime.ts";

// —————————————— 客户卡 Port（D1 后续实现 IPC/UI；本节点只消费） ——————————————

export type VcaCardOutcome =
  | {
      outcome: "answered";
      choice: "approve-version-change" | "reject-version-change";
      decisionId: string;
    }
  | { outcome: "declined" }
  | { outcome: "unavailable" };

export type AmendmentItemChoice = "item-apply" | "item-keep" | "item-cancel-amendment";

export type AmendmentItemOutcome =
  | {
      outcome: "answered";
      choice: AmendmentItemChoice;
      decisionId: string;
      /** 边界扩大等必勾选项的客户确认回执（如有）。 */
      acknowledgments?: Array<{ id: string; label: string }>;
    }
  | { outcome: "declined" }
  | { outcome: "unavailable" };

export interface VersionChangePresenter {
  /** VCA 批准卡（application-owned decision；display kind/targets/sha/diff/summary）。 */
  presentVersionChange(input: { applicationId: string; record: VersionChangeRecord }): Promise<VcaCardOutcome>;
  /** detail 逐项确认卡（每项一张；item-apply/item-keep/item-cancel-amendment）。 */
  presentAmendmentItem?(input: {
    applicationId: string;
    item: SnapshotItem;
    index: number;
    total: number;
  }): Promise<AmendmentItemOutcome>;
}

// —————————————— 依赖与公共句柄 ——————————————

export interface VersionChangeRuntimeDeps {
  projectRoot: string;
  services: VersionChangeServices;
  /** S2 trunk service（修正案解析/当前主干/status）。 */
  trunkService: TrunkService;
  directTrunkService?: DirectTrunkService;
  /** Sink must deduplicate the stable key, including a delivery followed by a lost acknowledgement. */
  notifyDirect?: DirectNotificationSink;
  /** S4 trunk-runtime（apply/bootstrap；事件由它写）。 */
  trunkRuntime: Pick<TrunkRuntime, "applyApproved" | "bootstrap">;
  emitEvent: (event: TaskStateEvent) => Promise<void>;
  presenter?: VersionChangePresenter;
  /** 幕僚/运营通知（只通知，无批准权）。 */
  notify?: (message: string) => void | Promise<void>;
  /** 发起人回执（客户决定后返回发起角色会话；只通知，不触发批准/派发）。 */
  notifyInitiator?: (roleId: string, message: string) => void | Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface ItemDecision {
  itemId: string;
  choice: AmendmentItemChoice;
  decisionId: string;
  acknowledgments?: Array<{ id: string; label: string }>;
}

export type VersionChangeRuntimeResult<T> = ServiceResult<T, VersionChangeErrorCode>;

export interface VersionChangeRuntime {
  submitDirect?(input: SubmitVersionChangeInput, trustedActorRoleId: string): Promise<SubmitVersionChangeResult>;
  /** create + submit；已 submitted 的幂等返回不重复写事件。 */
  submit(input: VersionChangeCreateInput): Promise<VersionChangeRuntimeResult<VersionChangeRecord>>;
  /** 客户卡（仅 submitted；无通道 ⇒ vca-channel-unavailable，保持 submitted 可重试）。 */
  present(applicationId: string): Promise<
    VersionChangeRuntimeResult<{ record: VersionChangeRecord; needsItems: boolean; resultTrunkVersion?: number }>
  >;
  approve(
    applicationId: string,
    decisionId: string,
  ): Promise<VersionChangeRuntimeResult<{ record: VersionChangeRecord; needsItems: boolean; resultTrunkVersion?: number }>>;
  reject(applicationId: string, decisionId: string, message?: string): Promise<VersionChangeRuntimeResult<VersionChangeRecord>>;
  /** detail 逐项卡：返回每项客户选择（不改状态）；无卡通道/取消按失败返回。 */
  runAmendmentItems(applicationId: string): Promise<
    VersionChangeRuntimeResult<{ decisions: ItemDecision[]; cancelled: boolean }>
  >;
  /** 执行逐项确认：只冻结 applied 项 → trunk apply/re-pin → vca.apply → 事件。 */
  applyAmendmentItems(
    applicationId: string,
    input: { decisionId: string; decisions: ItemDecision[] },
  ): Promise<VersionChangeRuntimeResult<{ record: VersionChangeRecord; resultTrunkVersion: number }>>;
  list(filter?: { flowId?: string; status?: VersionChangeStatus }): Promise<VersionChangeRecord[]>;
}
export interface DirectVersionChangeRuntime extends VersionChangeRuntime {
  submitDirect(input: SubmitVersionChangeInput, trustedActorRoleId: string): Promise<SubmitVersionChangeResult>;
}

// —————————————— 事件构造 ——————————————

function versionChangeEvent(
  record: VersionChangeRecord,
  status: VersionChangeStatus,
  at: string,
  extra: { journalId?: string; message?: string } = {},
): TaskStateEvent {
  const customer = status === "approved" || status === "rejected";
  return {
    v: 1,
    at,
    kind: "version.change",
    schema: "version-change/v1",
    applicationId: record.applicationId,
    vcKind: record.kind,
    initiatorRoleId: record.initiatorRoleId,
    flowId: record.flowId,
    status,
    ...(record.baseTrunk !== null ? { baseTrunkVersion: record.baseTrunk.trunkVersion } : {}),
    ...(record.bootstrap ? { bootstrap: true } : {}),
    targets: record.targets.map((target) => ({
      kind: target.kind,
      path: target.path,
      action: target.action,
      toSha256: target.toSha256,
    })),
    origin: customer ? "customer" : "application",
    ...(customer ? { decidedBy: "customer" as const } : {}),
    ...(record.decisionId !== undefined ? { decisionId: record.decisionId } : {}),
    ...(record.journalId !== undefined ? { journalId: record.journalId } : {}),
    ...(record.resultTrunkVersion !== undefined ? { resultTrunkVersion: record.resultTrunkVersion } : {}),
    ...(extra.journalId !== undefined ? { journalId: extra.journalId } : {}),
    ...(extra.message !== undefined ? { message: extra.message } : {}),
  } as TaskStateEvent;
}

function freezeEvents(freezes: readonly DocFreezeRecordInput[]): TaskStateEvent[] {
  return freezes.map(
    (entry) =>
      ({
        v: 1,
        at: entry.freeze.frozenAt,
        kind: "doc.freeze",
        schema: "doc-freeze/v1",
        path: entry.path,
        version: entry.version,
        sha256: entry.sha256,
        applicationId: entry.freeze.applicationId,
        reason: entry.freeze.reason,
        origin: entry.freeze.origin,
        ...(entry.freeze.decidedBy !== undefined ? { decidedBy: entry.freeze.decidedBy } : {}),
        ...(entry.freeze.decisionId !== undefined ? { decisionId: entry.freeze.decisionId } : {}),
        ...(entry.freeze.actorRoleId !== undefined ? { actorRoleId: entry.freeze.actorRoleId } : {}),
      }) as TaskStateEvent,
  );
}

function trunkAmendmentEvent(input: {
  record: VersionChangeRecord;
  amendmentId?: string;
  status: "approved" | "applied" | "rejected";
  itemId?: string;
  itemKind?: SnapshotItem["kind"];
  itemResult?: "applied" | "kept" | "cancelled";
  decisionId?: string;
  journalId?: string;
  resultTrunkVersion?: number;
  applyState?: "idle" | "applying" | "applied";
  at: string;
}): TaskStateEvent {
  const customer = input.status !== "applied";
  return {
    v: 1,
    at: input.at,
    kind: "trunk.amendment",
    amendmentId: input.amendmentId ?? input.record.amendmentId ?? "amendment",
    flowId: input.record.flowId,
    status: input.status,
    ...(input.applyState !== undefined ? { applyState: input.applyState } : {}),
    applicationId: input.record.applicationId,
    origin: customer ? "customer" : "application",
    ...(customer && input.decisionId !== undefined ? { decidedBy: "customer" as const } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
    ...(input.itemKind !== undefined ? { itemKind: input.itemKind } : {}),
    ...(input.itemResult !== undefined ? { itemResult: input.itemResult } : {}),
    ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
    ...(input.resultTrunkVersion !== undefined ? { resultTrunkVersion: input.resultTrunkVersion } : {}),
  } as TaskStateEvent;
}

// —————————————— 目标快照（Pipeline 拼装；S2 复核磁盘字节） ——————————————

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function fileSha(projectRoot: string, rel: string): Promise<string | undefined> {
  const read = await createFsTrunkStore(projectRoot).readProjectFile!(rel);
  return read.ok ? read.value.sha256 : undefined;
}

function stableMapOf(
  refs: Record<string, TrunkStableArtifactRef> | undefined,
): Record<string, { path: string; sha256: string }> | undefined {
  if (refs === undefined) return undefined;
  const out: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(refs)) out[roleId] = { path: ref.path, sha256: ref.sha256 };
  return out;
}

function repinKindOf(pathRel: string): TrunkRepinTargetKind {
  if (pathRel.includes("-proposal-v")) return "proposal";
  if (pathRel.includes("-modules-v")) return "modules";
  if (pathRel.includes("-topology-v")) return "topology";
  if (pathRel.includes("-architecture-v")) return "architecture";
  if (pathRel.includes("-assets-v")) return "assets";
  if (pathRel.includes("-roster-v")) return "roster";
  if (pathRel.startsWith("docs/scheduling/")) return "teamPlan";
  if (pathRel.startsWith("docs/flows/")) return "flow";
  return "proposal";
}

/**
 * X-R1（E2 S4）：product 模块 `preflight.checkAction("version-upgrade", …)` 的拒绝映射到既有 Direct
 * 回执码。模块 `code`/`messageKey` 只作稳定内部诊断，不得进入客户可见文案；外部
 * `SubmitVersionChangeResult.errorCode` 保持与迁移前 Service 路径同向：
 *
 * - `product-initiator-mismatch` / `product-kind-mismatch` / `product-operation-id-missing`：
 *   `submitDirect` 既有早退 ⇒ `vca-role-not-allowed`（本单元在早退**之后**调用，这些分支不可达；
 *   映射仅作 fail-closed 兜底）；
 * - `product-bootstrap-mismatch`：调用点以 `baseTrunk === null` 派生 bootstrap（既有 direct 语义），
 *   正常不可达；防御性映射 `vca-invalid`；
 * - `product-base-trunk-invalid` / `product-amendment-ref-forbidden` / `product-facts-*` /
 *   `action-not-covered`：迁移前 `vca-invalid`（畸形 baseTrunk 属 D-PRE-1 已登记的更早拒绝，
 *   码取同一 `vca-invalid` 语义）；
 * - `product-targets-invalid`（空 targets）：迁移前 `vca-service.prepareDirect` ⇒ `vca-invalid`；
 * - `product-targets-invalid`（缺 `expectedFromSha256`）：迁移前 `prepareDirectSubmission` ⇒
 *   `trunk-item-invalid`，由 `submitDirect` 既有映射 ⇒ `vca-target-invalid`。
 */
function productPreflightRejection(
  decision: Extract<RolePolicyDecision, { readonly allow: false }>,
): { code: VersionChangeErrorCode; message: string } {
  const details: unknown = decision.details;
  const reason = typeof details === "object" && details !== null && typeof (details as { reason?: unknown }).reason === "string"
    ? (details as { reason: string }).reason
    : undefined;
  switch (decision.code) {
    case "product-targets-invalid":
      return reason === "expectedFromSha256"
        // 与迁移前 `prepareDirectSubmission` 的拒绝文案逐字一致（外部 message 不变）。
        ? { code: "vca-target-invalid", message: "Duplicate target or missing expected original hash" }
        : { code: "vca-invalid", message: `Direct submission target is invalid (${decision.code}${reason === undefined ? "" : `:${reason}`})` };
    case "product-bootstrap-mismatch":
      return { code: "vca-invalid", message: `Direct submission base/bootstrap mismatch (${decision.code})` };
    case "product-initiator-mismatch":
    case "product-kind-mismatch":
    case "product-operation-id-missing":
      // 与迁移前 `submitDirect` 早退文案逐字一致（本调用点在早退之后，正常不可达）。
      return { code: "vca-role-not-allowed", message: "Direct submit requires the real session role, operation id and explicit expected base" };
    default:
      return { code: "vca-invalid", message: `Direct submission role preflight rejected (${decision.code})` };
  }
}

/**
 * X-R2（E2 S4）：rapporteur 模块 `preflight.checkAction("detail-amendment", …)` 的拒绝映射到既有
 * Direct 回执码。direct 路径的事实由本层按既有语义供给：整单（`wholeOrder:true`；逐项/最终卡通道
 * 已关闭）且无 legacy 卡路径（`legacyCardPath:"none"`），因此模块的 `amendment-not-whole-order` /
 * `amendment-legacy-card-path` 分支在 direct 路径不可达。其余拒绝分支亦被 `submitDirect` 既有早退
 * （operationId/baseTrunk/actor + kind=detail-amendment）与上述固定事实排除，属 fail-closed 兜底：
 *
 * - `rapporteur-initiator-mismatch`：早退已要求真实 actor = rapporteur 且 `initiatorRoleId === actor`，
 *   正常不可达；防御性映射沿用早退文案/码 `vca-role-not-allowed`；
 * - `rapporteur-facts-*` / `rapporteur-amendment-*` / `action-not-covered`：`vca-invalid`
 *   （与迁移前 direct 路径对畸形修正案请求的既有 `vca-invalid` 同向）。
 *
 * 模块 `code`/`messageKey` 只作稳定内部诊断；外部 `errorCode` 保持既有集合。
 */
function rapporteurDetailAmendmentRejection(
  decision: Extract<RolePolicyDecision, { readonly allow: false }>,
): { code: VersionChangeErrorCode; message: string } {
  if (decision.code === "rapporteur-initiator-mismatch") {
    return { code: "vca-role-not-allowed", message: "Direct submit requires the real session role, operation id and explicit expected base" };
  }
  return { code: "vca-invalid", message: `Direct amendment role preflight rejected (${decision.code})` };
}

// —————————————— 工厂 ——————————————

export function createVersionChangeRuntime(deps: VersionChangeRuntimeDeps): DirectVersionChangeRuntime {
  const now = deps.now ?? (() => new Date());
  const { services, trunkService, trunkRuntime } = deps;

  async function notifyStatus(record: VersionChangeRecord, status: string, extra = ""): Promise<void> {
    try {
      await deps.notify?.(
        `version.change ${record.applicationId}（${record.kind}/${record.flowId}）→ ${status}${extra}`,
      );
    } catch {
      /* 通知失败不改变业务结果 */
    }
  }

  /** 把客户决定结果返回发起人（只通知；失败不改变业务结果）。 */
  async function notifyInitiator(record: VersionChangeRecord, summary: string): Promise<void> {
    try {
      await deps.notifyInitiator?.(record.initiatorRoleId, summary);
    } catch {
      /* 通知失败不改变业务结果 */
    }
  }

  async function emitEvents(events: TaskStateEvent[]): Promise<void> {
    for (const event of events) await deps.emitEvent(event);
  }

  function withReplacementView(record: VersionChangeRecord, records: readonly VersionChangeRecord[]): VersionChangeRecord {
    const replacement = records.find(next => next.supersedesApplicationId === record.applicationId && next.status === "applied"
      && next.actionSource?.kind === "role-direct" && next.initiatorRoleId === record.initiatorRoleId && next.kind === record.kind);
    return replacement ? { ...record, status: "superseded", message: `Replaced by ${replacement.applicationId}/${replacement.operationId}` } : record;
  }
  async function load(applicationId: string): Promise<VersionChangeRecord | undefined> {
    const records = await services.vca.list(), record = records.find(record => record.applicationId === applicationId);
    return record ? withReplacementView(record, records) : undefined;
  }

  async function stableFilesForManifest(): Promise<
    | {
        ok: true;
        workflow?: { path: string; sha256: string };
        roleCards?: Record<string, { path: string; sha256: string }>;
        boundaries?: Record<string, { path: string; sha256: string }>;
        runId: string | null;
        rosterVersion?: number;
        d3?: { decisionId: string; targetRoleIds: string[] };
        roles?: string[];
      }
    | { ok: false; message: string }
  > {
    const status = await trunkService.status();
    const manifest = status.manifest;
    if (manifest !== undefined) {
      return {
        ok: true,
        ...(manifest.artifacts.workflow ? { workflow: { path: manifest.artifacts.workflow.path, sha256: manifest.artifacts.workflow.sha256 } } : {}),
        ...(manifest.artifacts.roleCards !== undefined
          ? { roleCards: stableMapOf(manifest.artifacts.roleCards) }
          : {}),
        boundaries: stableMapOf(manifest.artifacts.boundaries),
        runId: manifest.runId,
        // 存量项目 bootstrap：清单基线（派生自 pinned run）的 roster/D3/roles 必须一起携带，
        // 否则 t1 与 pinned run 校验不一致（verify 报 d3/roster 漂移）。
        ...(manifest.rosterVersion !== undefined ? { rosterVersion: manifest.rosterVersion } : {}),
        ...(manifest.d3 !== undefined ? { d3: manifest.d3 } : {}),
        ...(manifest.roles !== undefined ? { roles: manifest.roles } : {}),
      };
    }
    // bootstrap：无 manifest ⇒ stable 快照取磁盘（workflow 必需；role-card/boundary 未知角色 ⇒ 空）。
    const workflowSha = await fileSha(deps.projectRoot, "docs/workflow.md");
    if (workflowSha === undefined) return { ok: false, message: "bootstrap 需要 docs/workflow.md（stable 基线）" };
    return { ok: true, workflow: { path: "docs/workflow.md", sha256: workflowSha }, runId: null };
  }

  async function targetFor(record: VersionChangeRecord, appliedPaths?: readonly string[]): Promise<
    | {
        ok: true;
        target: TrunkApplySnapshot;
        runId: string | null;
        rosterVersion?: number;
        d3?: { decisionId: string; targetRoleIds: string[] };
        roles?: string[];
        topologyFollow?: { path: string; sha256: string };
      }
    | { ok: false; message: string }
  > {
    const stable = await stableFilesForManifest();
    if (!stable.ok) return stable;
    const status = await trunkService.status();
    const current = status.manifest;
    const documents: TrunkApplySnapshot["documents"] = {};
    if (current !== undefined) {
      for (const kind of Object.keys(current.artifacts.documents)) {
        const ref = current.artifacts.documents[kind as keyof typeof current.artifacts.documents];
        if (ref !== undefined) documents[kind as TrunkDocKind] = { path: ref.path, sha256: ref.sha256 };
      }
    }
    let execution: TrunkApplySnapshot["execution"] =
      current !== undefined
        ? {
            teamPlan:
              current.artifacts.execution.teamPlan === null
                ? null
                : { path: current.artifacts.execution.teamPlan.path, sha256: current.artifacts.execution.teamPlan.sha256 },
            flow:
              current.artifacts.execution.flow === null
                ? null
                : {
                    path: current.artifacts.execution.flow.path,
                    sha256: current.artifacts.execution.flow.sha256,
                    version: current.artifacts.execution.flow.version,
                  },
          }
        : { teamPlan: null, flow: null };
    for (const target of record.targets) {
      if (appliedPaths !== undefined && !appliedPaths.includes(target.path)) continue;
      if (target.kind === "execution") {
        if (target.path.startsWith("docs/scheduling/")) {
          execution = { ...execution, teamPlan: { path: target.path, sha256: target.toSha256 } };
        } else {
          execution = {
            ...execution,
            flow: {
              path: target.path,
              sha256: target.toSha256,
              version: execution.flow?.version ?? 1,
            },
          };
        }
        continue;
      }
      documents[repinKindOf(target.path) as TrunkDocKind] = { path: target.path, sha256: target.toSha256 };
    }
    // 名单内嵌拓扑：roster 目标推进时，topology 引用必须跟随到新名单文件（保留 #fragment），
    // 否则主干/run 的拓扑会继续指向旧名单的内嵌区块（真机 vc-3 暴露）。
    let topologyFollow: { path: string; sha256: string } | undefined;
    if (current !== undefined) {
      const rosterTarget = record.targets.find((target) => repinKindOf(target.path) === "roster");
      const currentTopology = current.artifacts.documents.topology;
      const currentRoster = current.artifacts.documents.roster;
      if (
        rosterTarget !== undefined &&
        currentTopology !== undefined &&
        currentRoster !== undefined &&
        currentTopology.path.split("#")[0] === currentRoster.path.split("#")[0]
      ) {
        const hashIndex = currentTopology.path.indexOf("#");
        const fragment = hashIndex >= 0 ? currentTopology.path.slice(hashIndex) : "";
        topologyFollow = { path: `${rosterTarget.path}${fragment}`, sha256: rosterTarget.toSha256 };
        documents.topology = topologyFollow;
      }
    }
    return {
      ok: true,
      runId: stable.runId,
      ...(stable.rosterVersion !== undefined ? { rosterVersion: stable.rosterVersion } : {}),
      ...(stable.d3 !== undefined ? { d3: stable.d3 } : {}),
      ...(stable.roles !== undefined ? { roles: stable.roles } : {}),
      ...(topologyFollow !== undefined ? { topologyFollow } : {}),
      target: {
        trunkVersion: current?.trunkVersion ?? 0,
        runId: stable.runId,
        documents,
        execution,
        workflow: stable.workflow,
        ...(stable.roleCards !== undefined ? { roleCards: stable.roleCards } : {}),
        ...(stable.boundaries !== undefined ? { boundaries: stable.boundaries } : {}),
      },
    };
  }

  /**
   * AC-5（E2 返工 S7）：version-upgrade 前置校验——schema/roster/D3/版本链/role-card·boundary。
   * 有效文档 = 当前 trunk documents 被 VCA targets 覆盖；复用 S2 `validateUpgradeChain`
   * （roster/modules 解析复用 `workflow-preconditions`，不复制第二套）。失败 fail-closed：
   * 批准前 ⇒ `vca-target-invalid`（不 approved/不冻结）；apply 前 ⇒ `vca-apply-failed`（不 re-pin）。
   */
  async function checkUpgradeChain(
    record: VersionChangeRecord,
  ): Promise<{ ok: true } | { ok: false; code: "vca-target-invalid" | "vca-hash-drift"; message: string }> {
    const status = await trunkService.status();
    const documents: Partial<Record<TrunkDocKind, { path: string; sha256: string }>> = {};
    if (status.manifest !== undefined) {
      for (const kind of Object.keys(status.manifest.artifacts.documents)) {
        const ref = status.manifest.artifacts.documents[kind as keyof typeof status.manifest.artifacts.documents];
        if (ref !== undefined) documents[kind as TrunkDocKind] = { path: ref.path, sha256: ref.sha256 };
      }
    }
    for (const target of record.targets) {
      if (target.kind === "execution") continue;
      documents[repinKindOf(target.path) as TrunkDocKind] = { path: target.path, sha256: target.toSha256 };
    }
    const rosterChanged = record.targets.some((target) => /-roster-v\d+\.md$/i.test(target.path));
    if (record.status !== "approved" || record.decidedBy !== "customer" || !record.decisionId)
      return { ok: false, code: "vca-target-invalid", message: "Only an actual prior customer approval can use historical recovery" };
    const common = { flowId: record.flowId, documents, rosterChanged,
      ...(status.manifest?.rosterVersion !== undefined ? { rosterVersionFloor: status.manifest.rosterVersion } : {}),
      ...(status.manifest?.d3 !== undefined ? { d3: status.manifest.d3 } : {}) };
    const planning = await trunkService.validateUpgradeChain({ ...common, planningOnly: true });
    if (!planning.ok) return { ok: false, code: "vca-target-invalid", message: planning.message ?? planning.code };
    const roles: Array<{ roleId: string; cardSha256: string; boundaryYamlSha256: string }> = [];
    const store = createProjectTrunkStore(deps.projectRoot);
    for (const roleId of planning.value.roleIds) {
      const cardRef = status.derived ? undefined : status.manifest?.artifacts.roleCards?.[roleId];
      const yamlRef = status.derived ? undefined : status.manifest?.artifacts.boundaries[roleId];
      if (!cardRef || !yamlRef) return { ok: false, code: "vca-target-invalid", message: "Historical role byte identities are missing; current live files cannot manufacture them" };
      const card = await store.readProjectFile!(cardRef.path), yaml = await store.readProjectFile!(yamlRef.path);
      if (!card.ok || !yaml.ok || card.value.sha256 !== cardRef.sha256 || yaml.value.sha256 !== yamlRef.sha256
        || !Buffer.from(card.value.bytesBase64, "base64").toString("utf8").trim()) return { ok: false, code: "vca-hash-drift", message: "Historical role bytes differ from their real stable hashes" };
      const quality = validateBoundaryYamlText(Buffer.from(yaml.value.bytesBase64, "base64").toString("utf8"));
      if (!quality.ok) return { ok: false, code: "vca-target-invalid", message: quality.message };
      roles.push({ roleId, cardSha256: card.value.sha256, boundaryYamlSha256: yaml.value.sha256 });
    }
    const result = await trunkService.validateUpgradeChain({
      ...common, legacyApproval: { applicationId: record.applicationId, decisionId: record.decisionId, roles },
    });
    if (result.ok) return { ok: true };
    const message = result.message ?? result.code;
    // 目标内容 hash 漂移保留 C2c 既有语义 `vca-hash-drift`（与批准前重验一致）。
    return { ok: false, code: /哈希不符/.test(message) ? "vca-hash-drift" : "vca-target-invalid", message };
  }

  async function applyUpgrade(record: VersionChangeRecord, decisionId: string, at: string): Promise<
    VersionChangeRuntimeResult<{ record: VersionChangeRecord; needsItems: boolean; resultTrunkVersion?: number }>
  > {
    // AC-5：apply 前重验（防止批准后漂移/外部改动；失败不 re-pin、不改指针）。
    const rechecked = await checkUpgradeChain(record);
    if (!rechecked.ok) {
      return {
        ok: false,
        code: rechecked.code === "vca-hash-drift" ? "vca-hash-drift" : "vca-apply-failed",
        message: rechecked.message,
      };
    }
    const built = await targetFor(record);
    if (!built.ok) return { ok: false, code: "vca-apply-failed", message: built.message };
    const repinTargets = record.targets.map((target) => ({
      kind: repinKindOf(target.path),
      path: target.path,
      sha256: target.toSha256,
    }));
    // 内嵌拓扑跟随名单：run 的 topology 引用也要一起 re-pin（否则 run 侧继续指向旧名单区块）。
    if (built.topologyFollow !== undefined) {
      repinTargets.push({ kind: "topology", path: built.topologyFollow.path, sha256: built.topologyFollow.sha256 });
    }
    const base = record.baseTrunk;
    const applied =
      base === null
        ? await trunkRuntime.bootstrap({
            flowId: record.flowId,
            runId: built.runId,
            applicationId: record.applicationId,
            decisionId,
            target: built.target,
            // 存量项目：bootstrap 以唯一 pinned run 派生基线落 t1，同时把 run 回绑到新版本
            // （与升级通道的 re-pin 同义）；无 pinned run 的纯新项目不提供 re-pin。
            ...(built.rosterVersion !== undefined ? { rosterVersion: built.rosterVersion } : {}),
            ...(built.d3 !== undefined ? { d3: built.d3 } : {}),
            ...(built.roles !== undefined ? { roles: built.roles } : {}),
            ...(built.runId !== null
              ? { repin: { runId: built.runId, targets: repinTargets } }
              : {}),
            journalId: `j-${record.applicationId}`,
            at,
          })
        : await trunkRuntime.applyApproved({
            source: "upgrade",
            flowId: record.flowId,
            applicationId: record.applicationId,
            decisionId,
            runId: built.runId,
            baseTrunkVersion: base.trunkVersion,
            target: built.target,
            repin: built.runId !== null ? { runId: built.runId, targets: repinTargets } : undefined,
            journalId: `j-${record.applicationId}`,
            at,
          });
    if (!applied.ok) {
      return { ok: false, code: "vca-apply-failed", message: `${applied.code}: ${applied.message ?? ""}` };
    }
    const marked = await services.vca.apply({
      applicationId: record.applicationId,
      resultTrunkVersion: applied.value.manifest.trunkVersion,
      journalId: applied.value.journalId,
      at,
    });
    if (!marked.ok) return marked;
    await emitEvents([versionChangeEvent(marked.value.record, "applied", at)]);
    await notifyStatus(marked.value.record, "applied", `（trunk v${applied.value.manifest.trunkVersion}）`);
    await notifyInitiator(
      marked.value.record,
      `客户已批准并应用 ${marked.value.record.applicationId}（${marked.value.record.kind}/${marked.value.record.flowId}）→ 主干 t${applied.value.manifest.trunkVersion}；批准已生效，实施排期仍按治理流程。`,
    );
    return { ok: true, value: { record: marked.value.record, needsItems: false, resultTrunkVersion: applied.value.manifest.trunkVersion } };
  }

  return {
    async submitDirect(input, trustedActorRoleId) {
      const operationId = input.operationId ?? "missing-operation";
      const rejected = (message: string, code: VersionChangeErrorCode = "vca-invalid"): SubmitVersionChangeResult => ({ ok: false, status: "rejected", errorCode: code, message,
        operationId, receipt: { ok: false, status: "rejected", operationId, baseDigest: input.baseTrunk?.digest ?? null, targetDigest: null, errorCode: code, message } });
      let observed: DirectActionReceipt | undefined;
      try {
      if (!input.operationId || input.baseTrunk === undefined || input.initiatorRoleId !== trustedActorRoleId
        || trustedActorRoleId !== (input.kind === "version-upgrade" ? "product" : input.kind === "detail-amendment" ? "rapporteur" : undefined))
        return rejected("Direct submit requires the real session role, operation id and explicit expected base", "vca-role-not-allowed");
      if (!services.vca.prepareDirect || !services.vca.finalizeDirect) return rejected("Direct metadata capabilities are unavailable", "vca-channel-unavailable");
      // X-R1（E2 S4）：product 的 version-upgrade 直接提交前置——只在 direct 路径、在既有
      // operationId/baseTrunk/真实 actor 校验之后、Service 最终校验之前调用。模块只回答角色侧前置；
      // `allow` 不替代任何 Service 校验（文件字节/hash、target 写区/版本链、base 全等、快照等仍由
      // `prepareDirectSubmission` / `vca-service` 执行）。普通 `submit`（历史客户卡通道）不调用
      // （非 direct 路径不得调用）。
      if (input.kind === "version-upgrade") {
        const preflight = builtInRoleModuleOf("product")?.preflight;
        if (preflight !== undefined) {
          const facts: Record<string, unknown> = {
            initiatorRoleId: input.initiatorRoleId,
            kind: input.kind,
            operationId: input.operationId,
            baseTrunk: input.baseTrunk,
            // 既有 direct 语义：bootstrap = `baseTrunk === null`（`vca-service.prepareDirect` 以此写入
            // `record.bootstrap`）；旧 `bootstrap` 兼容参数在 direct 路径不参与判定。为保持零差异，
            // 事实包取**实际**语义，而不是把可能省略/矛盾的兼容参数原样透传。
            bootstrap: input.baseTrunk === null,
            targets: input.targets.map((target) => ({
              ...(target.expectedFromSha256 !== undefined ? { expectedFromSha256: target.expectedFromSha256 } : {}),
            })),
          };
          const decision = preflight.checkAction({ action: "version-upgrade", facts });
          if (!decision.allow) {
            const rejection = productPreflightRejection(decision);
            return rejected(rejection.message, rejection.code);
          }
        }
      } else if (input.kind === "detail-amendment") {
        // X-R2（E2 S4）：rapporteur 的 detail-amendment 直接提交前置——同一调用纪律（direct 路径、
        // 既有早退之后、Service 最终校验之前）。事实按 rapporteur `api-spec.md` §5.3 登记键供给：
        // direct 通道只接受**整单**修正案（逐项/最终卡通道已关闭），且不经过任何 legacy 卡/批准路径。
        // `allow` 不替代 Service 最终校验（targets/hash/base/权限/trunk 事务仍在
        // `prepareDirectSubmission` 与 `apply-journal`）。
        const preflight = builtInRoleModuleOf("rapporteur")?.preflight;
        if (preflight !== undefined) {
          const facts: Record<string, unknown> = {
            initiatorRoleId: input.initiatorRoleId,
            kind: input.kind,
            wholeOrder: true,
            legacyCardPath: "none",
          };
          const decision = preflight.checkAction({ action: "detail-amendment", facts });
          if (!decision.allow) {
            const rejection = rapporteurDetailAmendmentRejection(decision);
            return rejected(rejection.message, rejection.code);
          }
        }
      }
      const direct = deps.directTrunkService ?? createTrunkService({ projectRoot: deps.projectRoot });
      const requestDigest = sha256(JSON.stringify({ operationId, actor: trustedActorRoleId, kind: input.kind, flowId: input.flowId, baseTrunk: input.baseTrunk,
        summary: input.summary, targets: input.targets.map(target => ({ kind: target.kind, path: target.path, action: target.action, from: target.from,
          roleId: target.roleId, expectedFromSha256: target.expectedFromSha256 })), amendmentId: input.amendmentId, amendmentDocPath: input.amendmentDocPath,
        supersedesApplicationId: input.supersedesApplicationId }));
      let record = (await services.vca.list()).find(record => record.operationId === operationId);
      if (record && (record.message !== `direct-request:${requestDigest}` || record.initiatorRoleId !== trustedActorRoleId)) return rejected("Operation id is bound to a different real request", "vca-conflict");
      let operation = record ? await direct.readDirectOperation(operationId) : undefined;
      let receipt: DirectActionReceipt;
      if (record && operation?.ok) { receipt = await direct.recoverDirect(operationId); observed = receipt; }
      else {
        const prepared = await direct.prepareDirectSubmission(input, trustedActorRoleId);
        if (!prepared.ok) return rejected(prepared.message ?? prepared.code, "vca-target-invalid");
        const value = prepared.value;
        const created = await services.vca.prepareDirect({ kind: input.kind, initiatorRoleId: input.initiatorRoleId, flowId: input.flowId,
          baseTrunk: value.currentTrunk, currentTrunk: value.currentTrunk, targets: input.targets, summary: input.summary,
          applicationId: value.applicationId, operationId, requestDigest, snapshot: value.snapshot,
          ...(input.supersedesApplicationId ? { supersedesApplicationId: input.supersedesApplicationId } : {}),
          ...(input.amendmentId ? { amendmentId: input.amendmentId } : {}), ...(input.amendmentDocPath ? { amendmentDocPath: input.amendmentDocPath } : {}),
          ...(value.amendmentItems ? { amendmentItems: value.amendmentItems } : {}), at: value.applyInput.at });
        if (!created.ok) return rejected(created.message ?? created.code, created.code);
        record = created.value;
        const git = await readGitProtectionFacts(deps.projectRoot);
        receipt = git.identity ? await executeGitDocumentPublication({ projectRoot: deps.projectRoot, applyInput: value.applyInput }) : await direct.executeDirect(value.applyInput);
        observed = receipt;
        if (!receipt.ok && receipt.status !== "committed-pending-recovery") return { ok: false, status: receipt.status,
          applicationId: record.applicationId, operationId, errorCode: "vca-apply-failed", message: receipt.message, receipt };
        operation = await direct.readDirectOperation(operationId);
      }
      if (!record || !operation?.ok || receipt.source?.kind !== "role-direct" || !receipt.applicationId || !receipt.journalId || !receipt.targetDigest)
        throw new Error("Committed operation proof is unavailable");
      const source = receipt.source, { manifest, snapshot } = operation.value;
      const pending = (message: string): DirectActionReceipt => ({ ok: false, status: "committed-pending-recovery", operationId,
        applicationId: receipt.applicationId!, journalId: receipt.journalId!, baseDigest: receipt.baseDigest, targetDigest: receipt.targetDigest!, source,
        errorCode: "direct-effects-pending", message });
      try {
        const finalized = await services.vca.finalizeDirect({ applicationId: record.applicationId, receipt,
          snapshotRef: { snapshotId: snapshot.snapshotId, digest: snapshot.digest }, resultTrunkVersion: manifest.trunkVersion, at: now().toISOString() });
        if (!finalized.ok) receipt = pending(finalized.message ?? finalized.code);
        else record = finalized.value;
        const event: TaskStateEvent = { v: 1, at: source.at, kind: "version.change", schema: "version-change/v1", applicationId: record.applicationId,
          vcKind: record.kind, initiatorRoleId: record.initiatorRoleId, flowId: record.flowId, status: "applied", origin: "role-direct", actionSource: source,
          operationId, directReceipt: receipt, journalId: receipt.journalId, resultTrunkVersion: manifest.trunkVersion,
          ...(record.baseTrunk ? { baseTrunkVersion: record.baseTrunk.trunkVersion } : { bootstrap: true }),
          targets: record.targets.map(target => ({ kind: target.kind, path: target.path, action: target.action, toSha256: target.toSha256 })) };
        const events: TaskStateEvent[] = [event];
        if (source.baseDigest !== source.targetDigest) events.push({ v: 1, at: source.at, kind: "trunk.state", op: "switched", origin: "role-direct", actionSource: source,
          operationId, channel: "role-direct", trunkVersion: manifest.trunkVersion, flowId: manifest.flowId, runId: manifest.runId,
          source: manifest.source, journalId: receipt.journalId, ...(manifest.previous ? { previousTrunkVersion: manifest.previous.trunkVersion } : {}) });
        for (const event of events) { const stored = await appendOperationEvent(deps.projectRoot, event); if (!stored.ok) throw new Error(stored.reason); }
        for (const recipientRoleId of ["chief", "convener", trustedActorRoleId]) {
          const key = `${operationId}:${source.targetDigest}:documents-updated:${recipientRoleId}`;
          if (await operationDeliveryRecorded(deps.projectRoot, key)) continue;
          if (!deps.notifyDirect) throw new Error("Idempotent direct notification sink is unavailable");
          await deps.notifyDirect({ key, recipientRoleId, source, message: `${record.kind} ${record.applicationId} ${receipt.status}; trunk t${manifest.trunkVersion}; ${source.targetDigest}` });
          const recorded = await recordOperationDelivery(deps.projectRoot, key); if (!recorded.ok) throw new Error(recorded.reason);
        }
      } catch (error) { receipt = pending(String(error)); }
      if (!receipt.ok && receipt.status === "committed-pending-recovery") {
        await services.vca.finalizeDirect({ applicationId: record.applicationId, receipt,
          snapshotRef: { snapshotId: snapshot.snapshotId, digest: snapshot.digest }, resultTrunkVersion: manifest.trunkVersion, at: now().toISOString() }).catch(() => undefined);
      }
      return { ok: receipt.ok, status: receipt.status, applicationId: record.applicationId, operationId, receipt,
        journalId: receipt.journalId, baseDigest: receipt.baseDigest ?? undefined, targetDigest: receipt.targetDigest ?? undefined,
        ...(!receipt.ok ? { errorCode: "vca-apply-failed" as const, message: receipt.message } : {}) };
      } catch (error) {
        if (observed && (observed.ok || observed.status === "committed-pending-recovery") && observed.applicationId && observed.journalId && observed.targetDigest) {
          const receipt: DirectActionReceipt = { ...observed, ok: false, status: "committed-pending-recovery", applicationId: observed.applicationId,
            journalId: observed.journalId, targetDigest: observed.targetDigest, errorCode: "direct-effects-pending", message: String(error) };
          return { ok: false, status: receipt.status, operationId, applicationId: receipt.applicationId, receipt,
            errorCode: "vca-apply-failed", message: receipt.message, targetDigest: receipt.targetDigest };
        }
        return rejected(String(error), "vca-apply-failed");
      }
    },
    async submit(input) {
      return { ok: false, code: "vca-channel-unavailable", message: "Ordinary document submissions use submitDirect with a real operation, expected base and target hashes; the former customer approval channel is closed." };
    },

    async present(applicationId) {
      const record = await load(applicationId);
      if (record === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      return { ok: false, code: "vca-channel-unavailable", message: record.status === "superseded" ? record.message : "Historical requests remain readable; ordinary customer approval cards cannot be presented. The original owner must explicitly resubmit through submitDirect." };
    },

    async approve(applicationId, decisionId) {
      const before = await load(applicationId);
      if (before === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      if (before.status === "superseded") return { ok: false, code: "vca-conflict", message: before.message };
      if (before.status !== "approved" || before.operationId || before.decisionId !== decisionId)
        return { ok: false, code: "vca-conflict", message: "A new customer approval cannot settle a historical pending request; only a real prior approval may be recovered." };
      // AC-5：批准前 schema/roster/D3/版本链校验（fail-closed；不 approved、不冻结、不 re-pin）。
      if (before.kind === "version-upgrade") {
        const checked = await checkUpgradeChain(before);
        if (!checked.ok) {
          return { ok: false, code: checked.code, message: checked.message };
        }
      }
      const at = now().toISOString();
      const approved = await services.vca.approve({ applicationId, decisionId, at });
      if (!approved.ok) return approved;
      const record = approved.value.record;
      await emitEvents([...freezeEvents(approved.value.freezes), versionChangeEvent(record, "approved", at)]);
      await notifyStatus(record, "approved");
      if (record.kind === "detail-amendment") {
        await notifyInitiator(
          record,
          `客户已批准 ${record.applicationId}（${record.kind}/${record.flowId}）；等待逐项确认后应用。`,
        );
        return { ok: true, value: { record, needsItems: true } };
      }
      return applyUpgrade(record, decisionId, at);
    },

    async reject(applicationId, decisionId, message) {
      const record = await load(applicationId);
      if (record?.status === "rejected" && record.decisionId === decisionId) return { ok: true, value: record };
      return { ok: false, code: "vca-conflict", message: "Historical pending requests are read-only; an old customer-card reply cannot mutate them." };
    },

    async runAmendmentItems(applicationId) {
      const record = await load(applicationId);
      if (record === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      return { ok: false, code: "vca-channel-unavailable", message: "Final per-item customer cards are closed; the original rapporteur must explicitly resubmit the whole amendment." };
    },
    async applyAmendmentItems(applicationId, input) {
      const record = await load(applicationId);
      if (record === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      if (record.kind !== "detail-amendment") return { ok: false, code: "vca-invalid", message: "仅 detail-amendment 逐项执行" };
      if (record.status !== "approved") {
        return { ok: false, code: "vca-conflict", message: `VCA 状态 ${record.status} 不能 apply（需 approved）` };
      }
      if (record.amendmentDocPath === undefined) {
        return { ok: false, code: "vca-invalid", message: "detail-amendment 缺少修正案文档" };
      }
      if (input.decisions.some((decision) => decision.choice === "item-cancel-amendment")) {
        return { ok: false, code: "vca-apply-failed", message: "修正案已取消（item-cancel-amendment）：不改 trunk，保持 approved" };
      }
      const validated = await trunkService.validateAmendment({
        amendmentDocPath: record.amendmentDocPath,
        flowId: record.flowId,
      });
      if (!validated.ok) return { ok: false, code: "vca-invalid", message: validated.message ?? validated.code };
      const itemById = new Map(validated.value.items.map((item) => [item.itemId, item]));
      const at = now().toISOString();
      const appliedPaths: string[] = [];
      const resolutions: Array<{ item: SnapshotItem; result: "applied" | "kept" }> = [];
      for (const decision of input.decisions) {
        const item = itemById.get(decision.itemId);
        if (item === undefined) return { ok: false, code: "vca-invalid", message: `未知 itemId：${decision.itemId}` };
        if (decision.choice === "item-apply") {
          const target = record.targets.find((candidate) => candidate.path === item.to);
          if (target === undefined) return { ok: false, code: "vca-invalid", message: `applied item 无对应 VCA target：${item.to}` };
          appliedPaths.push(item.to);
          resolutions.push({ item, result: "applied" });
        } else {
          resolutions.push({ item, result: "kept" });
        }
      }
      if (appliedPaths.length === 0) {
        return { ok: false, code: "vca-apply-failed", message: "no-applicable-changes：全部 kept/none，不改 trunk" };
      }
      // C15：execution 不纳入 guard 冻结；只预冻结 contract/roster 目标（vca.apply 会幂等复冻结）。
      const freezeInputs = record.targets
        .filter((target) => appliedPaths.includes(target.path) && target.kind !== "execution")
        .map((target) => ({
          path: target.path,
          version: Number(/-v(\d+)\.md$/i.exec(target.path)?.[1] ?? "1"),
          sha256: target.toSha256,
          applicationId: record.applicationId,
          reason: "detail-item-applied" as const,
          decisionId: input.decisionId,
          at,
        }));
      if (freezeInputs.length > 0) {
        const frozen = await services.freeze.freezeMany(freezeInputs);
        if (!frozen.ok) return { ok: false, code: "vca-apply-failed", message: `${frozen.code}: ${frozen.message ?? ""}` };
      }
      const built = await targetFor(record, appliedPaths);
      if (!built.ok) return { ok: false, code: "vca-apply-failed", message: built.message };
      const base = record.baseTrunk;
      if (base === null) return { ok: false, code: "vca-apply-failed", message: "detail-amendment 不允许 bootstrap base（需既有 trunk）" };
      const appliedTrunk = await trunkRuntime.applyApproved({
        source: "amendment",
        flowId: record.flowId,
        applicationId: record.applicationId,
        decisionId: input.decisionId,
        ...(record.amendmentId !== undefined ? { amendmentId: record.amendmentId } : {}),
        runId: built.runId,
        baseTrunkVersion: base.trunkVersion,
        target: built.target,
        repin: built.runId !== null
          ? {
              runId: built.runId,
              targets: appliedPaths.map((path) => ({
                kind: repinKindOf(path),
                path,
                sha256: record.targets.find((target) => target.path === path)!.toSha256,
              })),
            }
          : undefined,
        journalId: `j-${record.applicationId}`,
        at,
      });
      if (!appliedTrunk.ok) {
        return { ok: false, code: "vca-apply-failed", message: `${appliedTrunk.code}: ${appliedTrunk.message ?? ""}` };
      }
      const marked = await services.vca.apply({
        applicationId: record.applicationId,
        resultTrunkVersion: appliedTrunk.value.manifest.trunkVersion,
        journalId: appliedTrunk.value.journalId,
        appliedTargetPaths: appliedPaths,
        at,
      });
      if (!marked.ok) return marked;
      const itemEvents: TaskStateEvent[] = resolutions.map((resolution) =>
        trunkAmendmentEvent({
          record,
          amendmentId: record.amendmentId,
          status: "approved",
          itemId: resolution.item.itemId,
          itemKind: resolution.item.kind,
          itemResult: resolution.result,
          decisionId: input.decisionId,
          at,
        }),
      );
      const lifecycle = trunkAmendmentEvent({
        record,
        amendmentId: record.amendmentId,
        status: "applied",
        applyState: "applied",
        decisionId: input.decisionId,
        journalId: appliedTrunk.value.journalId,
        resultTrunkVersion: appliedTrunk.value.manifest.trunkVersion,
        at,
      });
      await emitEvents([
        ...itemEvents,
        lifecycle,
        ...freezeEvents(marked.value.freezes),
        versionChangeEvent(marked.value.record, "applied", at),
      ]);
      await notifyStatus(marked.value.record, "applied", `（trunk v${appliedTrunk.value.manifest.trunkVersion}）`);
      return {
        ok: true,
        value: { record: marked.value.record, resultTrunkVersion: appliedTrunk.value.manifest.trunkVersion },
      };
    },

    async list(filter) {
      const records = await services.vca.list();
      const view = records.map(record => withReplacementView(record, records));
      return view.filter(record => (filter?.flowId === undefined || record.flowId === filter.flowId)
        && (filter?.status === undefined || record.status === filter.status));
    },
  };
}
