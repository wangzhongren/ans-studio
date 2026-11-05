// src/service/trunk/impl/trunk-verify.ts
// verifyTrunk（S2；P1 §2.3-13/§4.6/§5.4）：pinned run + stable 哈希 + roster/D3 + R9 冻结。
//
// 纪律：发现不一致如实返回 violations（`trunk-verify-failed` 语义），**不自动改指针、不恢复**；
// 冻结注册表 corrupt ⇒ violation（fail-closed，不自动重建）；migration-required（missing）对
// 既有文档按 F29「默认冻结」处理（不误报，但 apply 仍要求冻结记录）；execution（teamPlan/flow）
// 不纳入 guard 冻结（C15），由 pinned run 校验保证。

import {
  loadPinnedRoster,
  readRunManifest,
  verifyPinnedRun,
} from "../../../common/编排/run-manifest.ts";
import type { TrunkManifest } from "../../../model/trunk.ts";
import type { FreezeRegistryStore } from "../../../provider/version-change/abstract/freeze-cache.ts";
import type { TrunkStore } from "../../../provider/trunk/abstract/trunk-store.ts";
import type { TrunkVerifyResult } from "../abstract/trunk-service.ts";
import { deriveTrunk } from "./trunk-derive.ts";
import { docFreezeState, filePathOfRef, samePath, sha256File } from "./trunk-common.ts";

export interface TrunkVerifyDeps {
  projectRoot: string;
  store: TrunkStore;
  freezeRegistry: FreezeRegistryStore;
  now: () => Date;
}

async function verifyStableHashes(projectRoot: string, manifest: TrunkManifest, violations: string[]): Promise<void> {
  const check = async (label: string, relPath: string, expected: string): Promise<void> => {
    const actual = await sha256File(projectRoot, relPath);
    if (actual === undefined) violations.push(`${label}: missing ${relPath}`);
    else if (actual.toLowerCase() !== expected.toLowerCase()) violations.push(`${label}: hash changed ${relPath}`);
  };
  await check("workflow", manifest.artifacts.workflow.path, manifest.artifacts.workflow.sha256);
  for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
    await check(`roleCards.${roleId}`, ref.path, ref.sha256);
  }
  for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
    await check(`boundaries.${roleId}`, ref.path, ref.sha256);
  }
}

async function verifyPinnedAndRoster(
  projectRoot: string,
  manifest: TrunkManifest,
  violations: string[],
): Promise<void> {
  if (manifest.runId === null) return; // bootstrap 尚未回填 runId（Q13 允许）
  const read = await readRunManifest(projectRoot, manifest.runId);
  if (!read.ok) {
    violations.push(`run: missing or invalid ${manifest.runId} (${read.reason})`);
    return;
  }
  const run = read.manifest;
  if (run.state !== "pinned") violations.push(`run: not pinned ${manifest.runId}`);
  else {
    const verified = await verifyPinnedRun(projectRoot, run);
    if (!verified.ok) violations.push(`run: verify failed (${verified.reason})`);
    else violations.push(...verified.violations.map((violation) => `run: ${violation}`));
  }
  if (run.flowId !== manifest.flowId) violations.push(`run: flowId mismatch ${run.flowId} ≠ ${manifest.flowId}`);
  if (run.rosterVersion !== manifest.rosterVersion) {
    violations.push(`roster: version mismatch run=${String(run.rosterVersion)} trunk=${String(manifest.rosterVersion)}`);
  }
  if (JSON.stringify(run.d3) !== JSON.stringify(manifest.d3)) {
    violations.push("d3: trunk manifest 与 pinned run 不一致");
  }
  const roster = await loadPinnedRoster(projectRoot, run);
  if (!roster.ok) {
    violations.push(`roster: ${roster.reason}`);
    return;
  }
  if (manifest.rosterVersion !== roster.version) {
    violations.push(`roster: version mismatch manifest=${String(manifest.rosterVersion)} roster=${roster.version}`);
  }
  const roleIds = new Set((manifest.roles ?? roster.roster.roles.map((role) => role.id)).map((id) => id));
  for (const roleId of roster.roster.roles) roleIds.add(roleId.id);
  if (manifest.d3 !== undefined) {
    for (const targetRoleId of manifest.d3.targetRoleIds) {
      if (!roleIds.has(targetRoleId)) violations.push(`d3: targetRoleId 不在 roster/roles：${targetRoleId}`);
    }
  }
}

async function verifyFrozenDocuments(
  registry: FreezeRegistryStore,
  manifest: TrunkManifest,
  violations: string[],
): Promise<void> {
  let state: Awaited<ReturnType<FreezeRegistryStore["state"]>>;
  try {
    state = await registry.state();
  } catch {
    violations.push("freeze: registry unavailable");
    return;
  }
  if (state === "corrupt") {
    violations.push("freeze: registry corrupt（fail-closed，不自动重建）");
    return;
  }
  if (state === "missing") return; // migration-required：F29 既有文档默认冻结，不误报
  for (const [kind, ref] of Object.entries(manifest.artifacts.documents)) {
    if (ref === undefined) continue;
    const frozen = await docFreezeState(registry, filePathOfRef(ref.path), ref.sha256);
    if (frozen === "corrupt") {
      violations.push(`freeze: registry corrupt while checking ${kind}`);
      continue;
    }
    if (frozen !== "frozen") violations.push(`documents.${kind}: not frozen ${ref.path}`);
  }
}

/** verifyTrunk：返回 violations（空 = ok）；无 manifest 时校验派生视图。 */
export async function verifyTrunk(deps: TrunkVerifyDeps): Promise<TrunkVerifyResult> {
  const read = await deps.store.readManifest();
  if (!read.ok && read.reason === "corrupt") {
    return { ok: false, violations: [`manifest: corrupt (${read.message ?? "invalid"})`] };
  }
  if (!read.ok) {
    const derived = await deriveTrunk(deps.projectRoot, deps.now);
    if (!derived.ok) return { ok: false, violations: [`trunk-unavailable: ${derived.message ?? derived.code}`] };
    return { ok: derived.value.issues.length === 0, violations: [...derived.value.issues] };
  }
  const manifest = read.value;
  const violations: string[] = [];
  await verifyPinnedAndRoster(deps.projectRoot, manifest, violations);
  await verifyStableHashes(deps.projectRoot, manifest, violations);
  await verifyFrozenDocuments(deps.freezeRegistry, manifest, violations);
  return { ok: violations.length === 0, violations };
}

/** 判断路径是否在 manifest documents 中（供 apply 冻结校验等复用）。 */
export function manifestDocumentRef(
  manifest: TrunkManifest,
  relPath: string,
): { kind: string; path: string; sha256: string } | undefined {
  for (const [kind, ref] of Object.entries(manifest.artifacts.documents)) {
    if (ref !== undefined && samePath(ref.path, relPath)) return { kind, path: ref.path, sha256: ref.sha256 };
  }
  return undefined;
}
