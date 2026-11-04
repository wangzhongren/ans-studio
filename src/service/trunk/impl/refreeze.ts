// src/service/trunk/impl/refreeze.ts
// 主干客户动作（Batch 3.5 / S5；P1.3 §4.7 保留 + P1.6 §4.9 收窄）：
// · `refreeze`：完成升级/重新冻结——**只更新 stable 快照**（workflow/roleCards/boundaries），
//   客户 decisionId + 高危确认，内容以磁盘字节复核；**不升 trunkVersion**；返回复算 digest 的
//   manifest 与 `trunk.state(op:"refrozen")` 审计载荷（不写账本）。
// · `abandonUpgrade`：放弃升级——关闭解冻窗口、不 re-pin、不改指针；返回
//   `trunk.state(op:"refrozen-cancelled")` 载荷（旧主干继续有效）。
// · `history`：trunk 历史版本列表（只读 history 归档；不虚构内容）。
//
// 纪律：版本化文档/execution 变更一律拒绝（走 VCA/detail）；不写项目文档；失败不改指针。

import type { TrunkErrorCode, TrunkManifest, TrunkStableArtifactRef } from "../../../model/trunk.ts";
import type {
  TrunkAbandonUpgradeInput,
  TrunkAbandonUpgradeResult,
  TrunkHistoryResult,
  TrunkRefreezeInput,
  TrunkRefreezeResult,
  TrunkServiceDeps,
  TrunkServiceResult,
  TrunkStateAuditPayload,
} from "../abstract/trunk-service.ts";
import { computeTrunkDigest, sha256File } from "./trunk-common.ts";

function fail<T>(code: TrunkErrorCode, message?: string): TrunkServiceResult<T> {
  return { ok: false, code, message };
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function auditOf(
  manifest: TrunkManifest,
  op: "refrozen" | "refrozen-cancelled",
  input: { decisionId: string; reason: string; at: string },
): TrunkStateAuditPayload {
  return {
    kind: "trunk.state",
    op,
    trunkVersion: manifest.trunkVersion,
    ...(manifest.previous !== null ? { previousTrunkVersion: manifest.previous.trunkVersion } : {}),
    runId: manifest.runId,
    flowId: manifest.flowId,
    source: manifest.source,
    origin: "customer",
    decidedBy: "customer",
    decisionId: input.decisionId,
    reason: input.reason,
    at: input.at,
  };
}

/** 完成升级/重新冻结：只 re-pin stable 快照（不升 trunkVersion）。 */
export async function refreezeTrunk(
  deps: TrunkServiceDeps,
  input: TrunkRefreezeInput,
): Promise<TrunkServiceResult<TrunkRefreezeResult>> {
  if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
    return fail("trunk-high-risk-unacknowledged", "重新冻结必须带客户 decisionId（客户本人）");
  }
  if (input.highRisk?.acknowledged !== true) {
    return fail("trunk-high-risk-unacknowledged", "重新冻结必须高危二次确认（highRisk.acknowledged:true）");
  }
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    return fail("trunk-apply-failed", "重新冻结必须说明 reason");
  }
  const read = await deps.store.readManifest();
  if (!read.ok && read.reason === "corrupt") {
    return fail("trunk-manifest-corrupt", `trunk manifest 损坏：${read.message ?? "invalid"}`);
  }
  if (!read.ok) return fail("trunk-unavailable", "无 trunk manifest：不能重新冻结");
  const manifest = read.value;

  // 内容匹配为主：每个 stable 目标都必须与磁盘字节一致（差异/缺失 ⇒ 不提交）。
  const check = async (label: string, ref: { path: string; sha256: string }): Promise<string | undefined> => {
    if (!isSha256Hex(ref.sha256)) return `${label}: sha256 非法`;
    const actual = await sha256File(deps.projectRoot, ref.path);
    if (actual === undefined) return `${label}: 文件缺失 ${ref.path}`;
    if (actual.toLowerCase() !== ref.sha256.toLowerCase()) return `${label}: 哈希不符 ${ref.path}`;
    return undefined;
  };
  if (input.target.workflow !== undefined) {
    const problem = await check("workflow", input.target.workflow);
    if (problem !== undefined) return fail("trunk-apply-failed", problem);
  }
  for (const [roleId, ref] of Object.entries(input.target.roleCards ?? {})) {
    const problem = await check(`roleCards.${roleId}`, ref);
    if (problem !== undefined) return fail("trunk-apply-failed", problem);
  }
  for (const [roleId, ref] of Object.entries(input.target.boundaries ?? {})) {
    const problem = await check(`boundaries.${roleId}`, ref);
    if (problem !== undefined) return fail("trunk-apply-failed", problem);
  }

  const changed: string[] = [];
  const stamp = (kind: TrunkStableArtifactRef["kind"], path: string, sha256: string): TrunkStableArtifactRef => ({
    kind,
    path,
    sha256,
    decisionId: input.decisionId,
    updatedAt: input.at,
  });
  let workflow = manifest.artifacts.workflow;
  if (input.target.workflow !== undefined) {
    const ref = input.target.workflow;
    if (workflow.sha256.toLowerCase() !== ref.sha256.toLowerCase() || workflow.path !== ref.path) {
      workflow = stamp("workflow", ref.path, ref.sha256);
      changed.push("workflow");
    }
  }
  const roleCards: Record<string, TrunkStableArtifactRef> = { ...(manifest.artifacts.roleCards ?? {}) };
  for (const [roleId, ref] of Object.entries(input.target.roleCards ?? {})) {
    const existing = roleCards[roleId];
    if (existing !== undefined && existing.path === ref.path && existing.sha256.toLowerCase() === ref.sha256.toLowerCase()) continue;
    roleCards[roleId] = stamp("role-card", ref.path, ref.sha256);
    changed.push(`roleCards.${roleId}`);
  }
  const boundaries: Record<string, TrunkStableArtifactRef> = { ...manifest.artifacts.boundaries };
  for (const [roleId, ref] of Object.entries(input.target.boundaries ?? {})) {
    const existing = boundaries[roleId];
    if (existing !== undefined && existing.path === ref.path && existing.sha256.toLowerCase() === ref.sha256.toLowerCase()) continue;
    boundaries[roleId] = stamp("boundary", ref.path, ref.sha256);
    changed.push(`boundaries.${roleId}`);
  }
  if (changed.length === 0) {
    return fail("trunk-apply-failed", "重新冻结没有 stable 快照变更（版本化文档/execution 变更须走 VCA）");
  }
  const digest = computeTrunkDigest({
    trunkVersion: manifest.trunkVersion,
    flowId: manifest.flowId,
    runId: manifest.runId,
    documents: manifest.artifacts.documents,
    execution: manifest.artifacts.execution,
    workflow,
    roleCards,
    boundaries,
    ...(manifest.rosterVersion !== undefined ? { rosterVersion: manifest.rosterVersion } : {}),
    ...(manifest.d3 !== undefined ? { d3: manifest.d3 } : {}),
    ...(manifest.roles !== undefined ? { roles: manifest.roles } : {}),
  });
  const next: TrunkManifest = {
    ...manifest,
    artifacts: { ...manifest.artifacts, workflow, roleCards, boundaries },
    digest,
    updatedAt: input.at,
  };
  const written = await deps.store.writeManifest(next);
  if (!written.ok) return fail("trunk-manifest-write-failed", written.message ?? "trunk manifest 写入失败（指针未变）");
  return {
    ok: true,
    value: { manifest: next, changed, audit: auditOf(next, "refrozen", input) },
  };
}

/** 放弃升级：不 re-pin、不改指针；旧主干继续有效。 */
export async function abandonUpgradeTrunk(
  deps: TrunkServiceDeps,
  input: TrunkAbandonUpgradeInput,
): Promise<TrunkServiceResult<TrunkAbandonUpgradeResult>> {
  if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
    return fail("trunk-high-risk-unacknowledged", "放弃升级必须带客户 decisionId（客户本人）");
  }
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    return fail("trunk-apply-failed", "放弃升级必须说明 reason");
  }
  const read = await deps.store.readManifest();
  if (!read.ok && read.reason === "corrupt") {
    return fail("trunk-manifest-corrupt", `trunk manifest 损坏：${read.message ?? "invalid"}（恢复入口需客户确认）`);
  }
  if (!read.ok) return fail("trunk-unavailable", "无 trunk manifest：没有可放弃的升级窗口");
  return {
    ok: true,
    value: { manifest: read.value, audit: auditOf(read.value, "refrozen-cancelled", input) },
  };
}

/** trunk 历史版本列表（只读；history 归档 + 当前 manifest；不虚构内容）。 */
export async function trunkHistory(deps: TrunkServiceDeps): Promise<TrunkServiceResult<TrunkHistoryResult>> {
  let versions: number[];
  try {
    versions = await deps.store.listHistory();
  } catch (err) {
    return fail("trunk-unavailable", `trunk history 不可读：${err instanceof Error ? err.message : String(err)}`);
  }
  const read = await deps.store.readManifest();
  return {
    ok: true,
    value: {
      versions,
      ...(read.ok ? { currentTrunkVersion: read.value.trunkVersion } : {}),
    },
  };
}
