// src/pipeline/orchestration/trunk-runtime.ts
// 主干 Pipeline 公共句柄（2026-11-04 trunk-amendment-model B-2 / S4）。
//
// 职责（P1 §2.5-25/§3.5）：trunk 状态/面板数据、主干升级（**收窄：仅紧急/恢复**）、受控恢复、
// bootstrap、apply（供 version-change-runtime 调用）、stable mini re-pin 事件；接 S2
// `TrunkService`、S3 `repinPinnedRun`（生产 `RunRepinPort`）、task-state 事件注入与 presenter。
//
// 纪律：
// · **不写项目文档、不派角色、不直接写账本/发卡**：状态/提交/冻结由注入 Service 完成；
//   事件经注入 `emitEvent`（生产 = `appendTaskEvent`；测试 = fake）落账。
// · 提交点 = S2 `executeApply` 的 trunk manifest 写成功；失败不改 trunk 指针（S2 保证）。
// · 主干升级只允许 `reason:"emergency"|"recovery"` + 客户 decisionId + 高危二次确认
//   （`highRisk.acknowledged===true`），**拒绝版本化文档/execution 内容变更**（走 VCA），
//   只允许 stable/紧急 re-pin；不用于常规 stable（stable 走确认即写 + mini re-pin）。
// · stable mini re-pin **不升 trunkVersion**；无 manifest ⇒ 只记待续接（S2 返回 applied:false，
//   不写 `stable-repinned` 事件）。

import { repinPinnedRun } from "../../common/编排/run-manifest.ts";
import type { TaskStateEvent } from "../../model/runtime.ts";
import type {
  TrunkApplySnapshot,
  TrunkDocKind,
  TrunkManifest,
  TrunkStableFileKind,
} from "../../model/trunk.ts";
import type {
  ReconcileResult,
  RunRepinPort,
  StableRepinAuditPayload,
  TrunkApplyInput,
  TrunkApplyResult,
  TrunkRecoveryInput,
  TrunkService,
  TrunkServiceResult,
  TrunkStatusView,
} from "../../service/trunk/public/trunk-service.ts";

export type { RunRepinPort };

/** S3 `repinPinnedRun` 的 `RunRepinPort` 生产适配（同 runId；`repins` 追加；内容 hash 磁盘重算）。 */
export function createRunRepinPort(projectRoot: string): RunRepinPort {
  return {
    async repin(input) {
      const result = await repinPinnedRun(projectRoot, input.runId, {
        targets: input.targets,
        applicationId: input.applicationId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        at: input.at,
      });
      return result.ok
        ? { ok: true, alreadyApplied: result.alreadyApplied }
        : { ok: false, code: result.code, message: result.reason };
    },
  };
}

export interface TrunkRuntimeDeps {
  projectRoot: string;
  service: TrunkService;
  /** task-state 事件写入（生产 `appendTaskEvent(projectRoot, event)`；测试 fake）。 */
  emitEvent: (event: TaskStateEvent) => Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Pipeline 结果（失败码 = C1 `TRUNK_ERROR_CODES` / VCA 错误码；不新造同义码）。 */
export type TrunkRuntimeResult<T> = TrunkServiceResult<T>;

export interface TrunkMainUpgradeInput {
  /** 仅紧急/恢复；常规 stable 走 stable-write 确认即写。 */
  reason: "emergency" | "recovery";
  /** 客户 decisionId（客户本人；不进入判断器/委托/指令）。 */
  decisionId: string;
  /** 高危二次确认（必须显式 acknowledged:true）。 */
  highRisk: { acknowledged: true; items?: string[] };
  flowId: string;
  runId: string | null;
  target: TrunkApplySnapshot;
  journalId?: string;
  at: string;
}

export interface TrunkBootstrapInput {
  flowId: string;
  runId: string | null;
  applicationId: string;
  decisionId?: string;
  target: TrunkApplySnapshot;
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  roles?: string[];
  journalId?: string;
  at: string;
}

export interface TrunkStableRepinInput {
  kind: TrunkStableFileKind;
  roleId: string;
  path: string;
  /** 写入前 hash（"" = 写入前文件不存在）。 */
  oldSha: string;
  newSha: string;
  confirmationId?: string;
  decisionId?: string;
  at: string;
}

export interface TrunkStableRepinResult {
  applied: boolean;
  pendingReattach?: boolean;
  audit?: StableRepinAuditPayload;
}

export interface TrunkRuntime {
  status(): Promise<TrunkStatusView>;
  /** 打开面板/启动对账：内容已过提交点且事件缺失时补写 `trunk.state`（幂等载荷）。 */
  reconcile(): Promise<TrunkServiceResult<ReconcileResult>>;
  bootstrap(input: TrunkBootstrapInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  /** VCA upgrade/detail apply（调用方已冻结/逐项确认；提交点由 S2 保证）。 */
  applyApproved(input: TrunkApplyInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  mainUpgrade(input: TrunkMainUpgradeInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  recover(input: TrunkRecoveryInput): Promise<TrunkRuntimeResult<TrunkApplyResult>>;
  completeStableWrite(input: TrunkStableRepinInput): Promise<TrunkStableRepinResult>;
}

function auditToEvent(payload: {
  kind: "trunk.state";
  at: string;
}): TaskStateEvent {
  return { v: 1, ...payload } as TaskStateEvent;
}

function documentsSnapshot(manifest: TrunkManifest): Record<string, { path: string; sha256: string }> {
  const out: Record<string, { path: string; sha256: string }> = {};
  for (const kind of Object.keys(manifest.artifacts.documents)) {
    const ref = manifest.artifacts.documents[kind as keyof typeof manifest.artifacts.documents];
    if (ref === undefined) continue;
    out[kind] = { path: ref.path, sha256: ref.sha256 };
  }
  return out;
}

function sameStableRef(
  target: { path: string; sha256: string } | undefined,
  current: { path: string; sha256: string } | undefined,
): boolean {
  if (target === undefined) return true; // 未提供 = 沿用当前
  if (current === undefined) return false;
  return target.path === current.path && target.sha256.toLowerCase() === current.sha256.toLowerCase();
}

/**
 * 主干升级收窄校验：拒绝版本化文档/execution 变更；stable 快照可从磁盘重新 re-pin。
 * 返回错误消息（undefined = 通过）。
 */
function mainUpgradeScopeProblem(current: TrunkManifest, target: TrunkApplySnapshot): string | undefined {
  const currentDocs = documentsSnapshot(current);
  for (const [kind, ref] of Object.entries(target.documents)) {
    const existing = currentDocs[kind];
    if (existing === undefined) return `主干升级不得新增版本化文档：${kind}`;
    if (existing.path !== ref.path || existing.sha256.toLowerCase() !== ref.sha256.toLowerCase()) {
      return `主干升级不得修改版本化文档（走版本变更申请）：${ref.path}`;
    }
  }
  for (const kind of Object.keys(currentDocs)) {
    if (target.documents[kind as TrunkDocKind] === undefined) return `主干升级不得删除版本化文档：${kind}`;
  }
  const execution = current.artifacts.execution;
  const targetPlan = target.execution.teamPlan;
  const targetFlow = target.execution.flow;
  const planSame =
    (targetPlan === null && execution.teamPlan === null) ||
    (targetPlan !== null && execution.teamPlan !== null &&
      targetPlan.path === execution.teamPlan.path &&
      targetPlan.sha256.toLowerCase() === execution.teamPlan.sha256.toLowerCase());
  if (!planSame) return "主干升级不得修改 execution.teamPlan（走版本变更申请/轻量重构）";
  const flowSame =
    (targetFlow === null && execution.flow === null) ||
    (targetFlow !== null && execution.flow !== null &&
      targetFlow.path === execution.flow.path &&
      targetFlow.sha256.toLowerCase() === execution.flow.sha256.toLowerCase());
  if (!flowSame) return "主干升级不得修改 execution.flow（走版本变更申请）";
  // stable 快照允许 re-pin；若提供则只允许 workflow/roleCards/boundaries 变化（不校验 here，S2 复核磁盘）。
  return undefined;
}

export function createTrunkRuntime(deps: TrunkRuntimeDeps): TrunkRuntime {
  const now = deps.now ?? (() => new Date());

  async function emit(payload: { kind: "trunk.state"; at: string }): Promise<void> {
    await deps.emitEvent(auditToEvent(payload));
  }

  return {
    async status() {
      return deps.service.status();
    },

    async reconcile() {
      const result = await deps.service.reconcileJournal();
      if (!result.ok) return result;
      // 已过提交点但事件缺失（phase 滞后）⇒ 仅在**能解析客户绑定**时补写 `trunk.state`；
      // C2a 契约：`switched` 等客户 op 必须 `origin/decidedBy:"customer"` + decisionId（F35）。
      // reconcile 载荷来自 journal（C1 无 decisionId 字段）⇒ 无法解析时**不伪造客户事件**，
      // 只返回 split 诊断（应用侧可见/系统行），账本保持零错误（T1/AC-12/AC-31）。
      if (result.value.state === "committed" && result.value.split && result.value.audit !== undefined) {
        const audit = result.value.audit;
        const customerBound =
          audit.origin === "customer" &&
          audit.decidedBy === "customer" &&
          (audit.decisionId !== undefined || audit.confirmationId !== undefined);
        if (customerBound) {
          await emit(audit);
        } else {
          deps.log?.(
            "trunk.reconcile: split 已识别（内容已过提交点、phase 滞后）；缺少可解析客户 decisionId/confirmationId，未补写客户 op（不伪造账本）",
          );
        }
      }
      return result;
    },

    async bootstrap(input) {
      const result = await deps.service.executeApply({
        source: "bootstrap",
        flowId: input.flowId,
        applicationId: input.applicationId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        runId: input.runId,
        baseTrunkVersion: null,
        target: input.target,
        ...(input.rosterVersion !== undefined ? { rosterVersion: input.rosterVersion } : {}),
        ...(input.d3 !== undefined ? { d3: input.d3 } : {}),
        ...(input.roles !== undefined ? { roles: input.roles } : {}),
        ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
        at: input.at,
      });
      if (!result.ok) return result;
      await emit(result.value.audit);
      return result;
    },

    async applyApproved(input) {
      const result = await deps.service.executeApply(input);
      if (!result.ok) return result;
      await emit(result.value.audit);
      return result;
    },

    async mainUpgrade(input) {
      if (input.reason !== "emergency" && input.reason !== "recovery") {
        return { ok: false, code: "trunk-apply-failed", message: `主干升级只允许 emergency/recovery：${String(input.reason)}` };
      }
      if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
        return { ok: false, code: "trunk-high-risk-unacknowledged", message: "主干升级必须带客户 decisionId（客户本人）" };
      }
      if (input.highRisk?.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", message: "主干升级必须高危二次确认（highRisk.acknowledged:true）" };
      }
      const status = await deps.service.status();
      const current = status.manifest;
      if (current === undefined || status.availability !== "frozen") {
        return { ok: false, code: "trunk-unavailable", message: "主干升级需要已落盘的 frozen trunk manifest" };
      }
      const scopeProblem = mainUpgradeScopeProblem(current, input.target);
      if (scopeProblem !== undefined) {
        return { ok: false, code: "trunk-apply-failed", message: scopeProblem };
      }
      const result = await deps.service.executeApply({
        source: "upgrade",
        flowId: input.flowId,
        applicationId: `main-upgrade:${input.decisionId}`,
        decisionId: input.decisionId,
        runId: input.runId,
        baseTrunkVersion: current.trunkVersion,
        target: input.target,
        highRisk: { acknowledged: true, ...(input.highRisk.items !== undefined ? { items: input.highRisk.items } : {}) },
        ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
        at: input.at,
      });
      if (!result.ok) return result;
      await emit(result.value.audit);
      deps.log?.(`trunk.main-upgrade: v${result.value.manifest.trunkVersion} (${input.reason})`);
      return result;
    },

    async recover(input) {
      const result = await deps.service.recover(input);
      if (!result.ok) return result;
      await emit(result.value.audit);
      deps.log?.(`trunk.recover: v${result.value.manifest.trunkVersion}`);
      return result;
    },

    async completeStableWrite(input) {
      const result = await deps.service.applyStableSnapshot({
        kind: input.kind,
        roleId: input.roleId,
        path: input.path,
        oldSha: input.oldSha,
        newSha: input.newSha,
        ...(input.confirmationId !== undefined ? { confirmationId: input.confirmationId } : {}),
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        at: input.at,
      });
      if (result.applied && result.audit !== undefined) {
        await deps.emitEvent({
          v: 1,
          kind: "trunk.state",
          op: result.audit.op,
          trunkVersion: result.audit.trunkVersion,
          path: result.audit.path,
          oldSha: result.audit.oldSha,
          newSha: result.audit.newSha,
          origin: result.audit.origin,
          decidedBy: result.audit.decidedBy,
          ...(result.audit.confirmationId !== undefined ? { confirmationId: result.audit.confirmationId } : {}),
          ...(result.audit.decisionId !== undefined ? { decisionId: result.audit.decisionId } : {}),
          at: result.audit.at,
        });
      }
      return result;
    },
  };
}
