// src/service/trunk/impl/stable-snapshot.ts
// stable 文件 mini re-pin 快照（S2；P1 §2.3-16/§4.5.1/§4.7）。
//
// 纪律：
// · 只更新 trunk manifest 的 `artifacts.workflow` / `artifacts.roleCards[role]` /
//   `artifacts.boundaries[role]` 的 `{path,sha256}`，绑定 confirmationId/decisionId；
//   **trunkVersion 不变**（不升版本、不需 VCA）；
// · 只接受 `oldSha` 与当前快照一致的写入（fail-closed，不更新快照）；
//   新文件（record.baseSha256=""）且 manifest 无该路径快照时可新增；
// · 无 manifest / manifest 损坏 / 哈希不符 ⇒ `applied:false` + `pendingReattach:true`
//   （不虚构快照、不发事件；S4 记待续接/恢复）；
// · 返回的 audit = `stable-repinned` 事件载荷（origin/decidedBy customer，trunkVersion 不变）。

import type { TrunkStableArtifactRef } from "../../../model/trunk.ts";
import type {
  StableRepinAuditPayload,
  TrunkServiceDeps,
  TrunkStableSnapshotInput,
  TrunkStableSnapshotResult,
} from "../abstract/trunk-service.ts";

function auditOf(
  trunkVersion: number,
  input: TrunkStableSnapshotInput,
  oldSha: string,
): StableRepinAuditPayload {
  return {
    op: "stable-repinned",
    trunkVersion,
    kind: input.kind,
    roleId: input.roleId,
    path: input.path,
    oldSha,
    newSha: input.newSha,
    ...(input.confirmationId !== undefined ? { confirmationId: input.confirmationId } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    origin: "customer",
    decidedBy: "customer",
    at: input.at,
  };
}

export async function applyStableSnapshot(
  deps: TrunkServiceDeps,
  input: TrunkStableSnapshotInput,
): Promise<TrunkStableSnapshotResult> {
  const read = await deps.store.readManifest();
  if (!read.ok) return { applied: false, pendingReattach: true };
  const manifest = read.value;

  let currentRef: TrunkStableArtifactRef | undefined;
  if (input.kind === "workflow") {
    if (manifest.artifacts.workflow.path === input.path) currentRef = manifest.artifacts.workflow;
  } else if (input.kind === "role-card") {
    currentRef = manifest.artifacts.roleCards?.[input.roleId];
  } else {
    currentRef = manifest.artifacts.boundaries[input.roleId];
  }

  const oldSha = currentRef === undefined ? "" : currentRef.sha256;
  if (currentRef !== undefined && oldSha.toLowerCase() !== input.oldSha.toLowerCase()) {
    return { applied: false, pendingReattach: true };
  }
  if (currentRef === undefined && input.oldSha !== "") {
    return { applied: false, pendingReattach: true };
  }

  const nextRef: TrunkStableArtifactRef = {
    kind: input.kind,
    path: input.path,
    sha256: input.newSha,
    ...(input.confirmationId !== undefined ? { confirmationId: input.confirmationId } : {}),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    updatedAt: input.at,
  };
  const next = {
    ...manifest,
    artifacts: {
      ...manifest.artifacts,
      ...(input.kind === "workflow" ? { workflow: nextRef } : {}),
      ...(input.kind === "role-card"
        ? { roleCards: { ...(manifest.artifacts.roleCards ?? {}), [input.roleId]: nextRef } }
        : {}),
      ...(input.kind === "boundary"
        ? { boundaries: { ...manifest.artifacts.boundaries, [input.roleId]: nextRef } }
        : {}),
    },
    updatedAt: input.at,
  };
  const written = await deps.store.writeManifest(next);
  if (!written.ok) return { applied: false, pendingReattach: true };
  return { applied: true, audit: auditOf(manifest.trunkVersion, input, oldSha) };
}
