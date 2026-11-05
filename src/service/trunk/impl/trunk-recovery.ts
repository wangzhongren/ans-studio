// src/service/trunk/impl/trunk-recovery.ts
// 受控恢复（S2；P1 §2.3-15/§4.6/§5.4）。
//
// 纪律：
// · 必须客户本人确认（decisionId 非空）；恢复产生新版本 tN+1（`source:"recovery"`）；
// · 冻结注册表 corrupt ⇒ fail-closed（不自动重建/不放开覆盖），恢复亦拒绝；
// · 内容来源：缺省从唯一 pinned run 重新派生；`useJournalTarget:true` 时取 apply-journal
//   的 target（内容匹配修复入口）；两者都不可用 ⇒ `trunk-recovery-invalid`；
// · 恢复复用 apply-journal 两阶段提交（journal → history 归档 → manifest 写 = 提交点），
//   失败不改指针；事件载荷 `op:"recovered"`、`origin/decidedBy:"customer"`、`reason`。

import type { TrunkApplySnapshot } from "../../../model/trunk.ts";
import type {
  TrunkApplyResult,
  TrunkRecoveryInput,
  TrunkServiceDeps,
  TrunkServiceResult,
  TrunkStateAuditPayload,
} from "../abstract/trunk-service.ts";
import { commitTrunkApply, type InternalApplyInput } from "./apply-journal.ts";
import { deriveTrunk } from "./trunk-derive.ts";
import { snapshotOfManifest } from "./trunk-common.ts";

function invalid(message: string): TrunkServiceResult<never> {
  return { ok: false, code: "trunk-recovery-invalid", message };
}

export async function recoverTrunk(
  deps: TrunkServiceDeps,
  input: TrunkRecoveryInput,
): Promise<TrunkServiceResult<TrunkApplyResult>> {
  if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
    return invalid("恢复必须带客户 decisionId（客户本人确认）");
  }
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    return invalid("恢复必须说明 reason");
  }
  const now = deps.now ?? (() => new Date());
  let registryState: Awaited<ReturnType<TrunkServiceDeps["freezeRegistry"]["state"]>>;
  try {
    registryState = await deps.freezeRegistry.state();
  } catch {
    return invalid("冻结注册表不可用：fail-closed，恢复拒绝");
  }
  if (registryState === "corrupt") {
    return invalid("冻结注册表损坏：不自动重建/不放开覆盖（F29/AC-21），恢复拒绝");
  }

  const currentRead = await deps.store.readManifest();
  const current = currentRead.ok ? currentRead.value : undefined;

  let target: TrunkApplySnapshot | undefined = input.target;
  if (target === undefined && input.useJournalTarget === true) {
    const journal = await deps.store.readJournal();
    if (journal.ok) target = journal.value.target;
  }
  if (target === undefined) {
    const derived = await deriveTrunk(deps.projectRoot, now);
    if (!derived.ok) return invalid(`无法派生恢复内容：${derived.message ?? derived.code}`);
    target = snapshotOfManifest(derived.value.manifest);
  }

  let flowId = current?.flowId;
  let runId = current?.runId ?? target.runId;
  if (flowId === undefined) {
    const derived = await deriveTrunk(deps.projectRoot, now);
    if (!derived.ok) return invalid(`无法确定恢复 flowId：${derived.message ?? derived.code}`);
    flowId = derived.value.manifest.flowId;
    runId = runId ?? derived.value.manifest.runId;
  }

  const internal: InternalApplyInput = {
    source: "recovery",
    flowId,
    applicationId: `recovery-${input.decisionId}`,
    decisionId: input.decisionId,
    runId,
    baseTrunkVersion: current?.trunkVersion ?? null,
    target,
    ...(input.repin !== undefined ? { repin: input.repin } : {}),
    ...(input.rosterVersion !== undefined ? { rosterVersion: input.rosterVersion } : {}),
    ...(input.d3 !== undefined ? { d3: input.d3 } : {}),
    ...(input.roles !== undefined ? { roles: input.roles } : {}),
    reason: input.reason,
    ...(input.journalId !== undefined ? { journalId: input.journalId } : {}),
    at: input.at,
  };
  const committed = await commitTrunkApply(deps, internal);
  if (!committed.ok) return committed;
  const audit: TrunkStateAuditPayload = { ...committed.value.audit, op: "recovered", reason: input.reason };
  return { ok: true, value: { ...committed.value, audit } };
}
