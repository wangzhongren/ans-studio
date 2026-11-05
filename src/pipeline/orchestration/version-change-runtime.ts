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
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TaskStateEvent } from "../../model/runtime.ts";
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
import type { SnapshotItem, TrunkApplyResult, TrunkRepinTargetKind, TrunkService } from "../../service/trunk/public/trunk-service.ts";
import type { TrunkRuntime, TrunkRuntimeResult } from "./trunk-runtime.ts";

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
  try {
    return sha256(await readFile(path.join(projectRoot, rel), "utf8"));
  } catch {
    return undefined;
  }
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

// —————————————— 工厂 ——————————————

export function createVersionChangeRuntime(deps: VersionChangeRuntimeDeps): VersionChangeRuntime {
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

  async function load(applicationId: string): Promise<VersionChangeRecord | undefined> {
    const records = await services.vca.list();
    return records.find((record) => record.applicationId === applicationId);
  }

  async function stableFilesForManifest(): Promise<
    | {
        ok: true;
        workflow: { path: string; sha256: string };
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
        workflow: { path: manifest.artifacts.workflow.path, sha256: manifest.artifacts.workflow.sha256 },
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
    return {
      ok: true,
      runId: stable.runId,
      ...(stable.rosterVersion !== undefined ? { rosterVersion: stable.rosterVersion } : {}),
      ...(stable.d3 !== undefined ? { d3: stable.d3 } : {}),
      ...(stable.roles !== undefined ? { roles: stable.roles } : {}),
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
    const result = await trunkService.validateUpgradeChain({
      flowId: record.flowId,
      documents,
      rosterChanged,
      ...(status.manifest?.rosterVersion !== undefined ? { rosterVersionFloor: status.manifest.rosterVersion } : {}),
      ...(status.manifest?.d3 !== undefined ? { d3: status.manifest.d3 } : {}),
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
    async submit(input) {
      const created = await services.vca.create(input);
      if (!created.ok) return created;
      let record = created.value;
      if (record.status === "draft") {
        const submitted = await services.vca.submit({ applicationId: record.applicationId, at: input.at });
        if (!submitted.ok) return submitted;
        record = submitted.value.record;
        await emitEvents([versionChangeEvent(record, "submitted", input.at), ...freezeEvents(submitted.value.freezes)]);
        await notifyStatus(record, "submitted", "：等待客户批准（客户本人；幕僚只通知）");
      }
      return { ok: true, value: record };
    },

    async present(applicationId) {
      const record = await load(applicationId);
      if (record === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      if (record.status !== "submitted") {
        return { ok: false, code: "vca-conflict", message: `VCA 状态 ${record.status} 不能发批准卡` };
      }
      if (deps.presenter === undefined) {
        return {
          ok: false,
          code: "vca-channel-unavailable",
          message: "无客户卡通道：VCA 保持 submitted，可稍后重试（不伪造客户批准）",
        };
      }
      const outcome = await deps.presenter.presentVersionChange({ applicationId, record });
      if (outcome.outcome !== "answered") {
        return {
          ok: false,
          code: "vca-channel-unavailable",
          message: outcome.outcome === "declined" ? "客户卡未作答：保持 submitted，可重试" : "客户卡通道不可用：保持 submitted",
        };
      }
      if (outcome.choice === "reject-version-change") {
        const rejected = await this.reject(applicationId, outcome.decisionId);
        if (!rejected.ok) {
          // 卡片已作答但拒绝未完成：必须回显（否则客户只看到卡关闭、申请仍挂在待批）。
          await notifyStatus(
            record,
            "处理失败",
            `：拒绝未完成（${rejected.code}${rejected.message !== undefined ? ` ${rejected.message}` : ""}）；申请保持 ${record.status}，可重新呈现`,
          );
        }
        return rejected.ok
          ? { ok: true, value: { record: rejected.value, needsItems: false } }
          : rejected;
      }
      const approved = await this.approve(applicationId, outcome.decisionId);
      if (!approved.ok) {
        // 卡片已作答但批准/应用未完成（如版本链校验失败）：同样回显，申请保持 submitted。
        await notifyStatus(
          record,
          "处理失败",
          `：批准未完成（${approved.code}${approved.message !== undefined ? ` ${approved.message}` : ""}）；申请保持 submitted，可重新呈现`,
        );
      }
      return approved;
    },

    async approve(applicationId, decisionId) {
      const before = await load(applicationId);
      if (before === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
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
      const at = now().toISOString();
      const rejected = await services.vca.reject({
        applicationId,
        decisionId,
        ...(message !== undefined ? { message } : {}),
        at,
      });
      if (!rejected.ok) return rejected;
      await emitEvents([versionChangeEvent(rejected.value, "rejected", at, message !== undefined ? { message } : {})]);
      await notifyStatus(rejected.value, "rejected");
      await notifyInitiator(rejected.value, `客户已拒绝 ${rejected.value.applicationId}（${rejected.value.kind}/${rejected.value.flowId}）。`);
      return rejected;
    },

    async runAmendmentItems(applicationId) {
      const record = await load(applicationId);
      if (record === undefined) return { ok: false, code: "vca-invalid", message: `VCA 不存在：${applicationId}` };
      if (record.kind !== "detail-amendment") return { ok: false, code: "vca-invalid", message: "仅 detail-amendment 有逐项确认" };
      if (record.status !== "approved") {
        return { ok: false, code: "vca-conflict", message: `VCA 状态 ${record.status} 不能逐项确认（需 approved）` };
      }
      if (deps.presenter?.presentAmendmentItem === undefined) {
        return { ok: false, code: "vca-channel-unavailable", message: "无逐项确认卡通道：保持 approved，可重试" };
      }
      if (record.amendmentDocPath === undefined) {
        return { ok: false, code: "vca-invalid", message: "detail-amendment 缺少修正案文档" };
      }
      const validated = await trunkService.validateAmendment({
        amendmentDocPath: record.amendmentDocPath,
        flowId: record.flowId,
      });
      if (!validated.ok) return { ok: false, code: "vca-invalid", message: validated.message ?? validated.code };
      const actual = validated.value.items.filter((item) => item.change !== "none");
      const decisions: ItemDecision[] = [];
      for (let index = 0; index < actual.length; index += 1) {
        const item = actual[index]!;
        const outcome = await deps.presenter.presentAmendmentItem({
          applicationId,
          item,
          index,
          total: actual.length,
        });
        if (outcome.outcome !== "answered") {
          return {
            ok: false,
            code: "vca-channel-unavailable",
            message: outcome.outcome === "declined" ? "逐项确认卡未作答：保持 approved，可重试" : "逐项确认卡通道不可用",
          };
        }
        if (outcome.choice === "item-cancel-amendment") {
          return { ok: true, value: { decisions, cancelled: true } };
        }
        decisions.push({
          itemId: item.itemId,
          choice: outcome.choice,
          decisionId: outcome.decisionId,
          ...(outcome.acknowledgments !== undefined ? { acknowledgments: outcome.acknowledgments } : {}),
        });
      }
      return { ok: true, value: { decisions, cancelled: false } };
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

    list(filter) {
      return services.vca.list(filter);
    },
  };
}
