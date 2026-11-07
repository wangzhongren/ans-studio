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

import { readGitInitialWorkflowSource, writeGitInitialWorkflowSource, type GitInitialWorkflowSource } from "../../../provider/trunk/public/trunk-store.ts";
import { validateTaskStateEvent } from "../../../common/编排/task-state.ts";
import { isSnapshotRef, type TrunkStableArtifactRef } from "../../../model/trunk.ts";
import { createHash } from "node:crypto";
import { readOperationEvents, createStableWriteStore, createStableWritePermitStore, STABLE_WRITES_REL, STABLE_WRITE_PERMITS_REL } from "../../../provider/version-change/public/version-change-store.ts";
import type {
  StableRepinAuditPayload,
  TrunkServiceDeps,
  TrunkStableSnapshotInput,
  TrunkStableSnapshotResult,
} from "../abstract/trunk-service.ts";

export const initialWorkflowOperationId = (flowId: string, requestId: string, permitId: string) => `initial-workflow-${createHash("sha256").update(JSON.stringify([flowId, requestId, permitId])).digest("hex")}`;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
const json = (value: unknown) => JSON.stringify(canonical(value));
const onlyUnpinnedDrafts = (runs: readonly Record<string, unknown>[]) => runs.every(run => run.schema === "ans-run/v1" && typeof run.runId === "string" && typeof run.flowId === "string"
  && run.state === "draft" && run.pinDigest === undefined && run.pinnedBy === undefined && run.frozenRoles === undefined);
export async function bindInitialWorkflowSource(deps: TrunkServiceDeps, input: { requestId: string; taskId: string; coreSessionId: string; coreTurnId?: string; hostLeaseId: string }): Promise<import("../abstract/trunk-service.ts").TrunkServiceResult<GitInitialWorkflowSource>> {
  const invalid = (message: string) => ({ ok: false as const, code: "trunk-item-invalid" as const, message });
  try {
    const current = await deps.store.readManifest(), ledger = await readOperationEvents(deps.projectRoot);
    if (!current.ok || !current.value.snapshotRef || current.value.artifacts.workflow || !ledger.ok || !input.coreSessionId) return invalid("Initial workflow needs a real planning trunk and actual Core source");
    const records = await createStableWriteStore(deps.projectRoot).list(), permits = await createStableWritePermitStore(deps.projectRoot).list();
    const record = records.find(record => record.requestId === input.requestId), permit = record && permits.find(permit => permit.permitId === record.permitId);
    if (!record || !permit || record.status !== "approved" || permit.status !== "approved" || record.kind !== "workflow" || record.roleId !== "convener"
      || record.path !== "docs/workflow.md" || record.baseSha256 !== "" || permit.requestId !== record.requestId || permit.roleId !== record.roleId || permit.path !== record.path
      || permit.targetSha256 !== record.targetSha256 || permit.baseSha256 !== "" || record.decisionId !== permit.authority.decisionId || record.confirmationId !== permit.authority.confirmationId
      || !Number.isFinite(Date.parse(permit.expiresAt)) || Date.parse(permit.expiresAt) < (deps.now?.() ?? new Date()).getTime()) return invalid("No actual still-approved initial workflow permit matches this tool result");
    const rows = ledger.records.filter(row => row.value.taskId === input.taskId), creates = rows.filter(row => row.value.kind === "task.created");
    const task = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    if (!task?.ok || task.event.kind !== "task.created" || task.event.to !== "convener" || task.event.from !== "chief" || task.event.flowId !== current.value.flowId
      || !task.event.runId || rows.some(row => row.value.kind === "task.closed")) return invalid("The actual assigned convener task is unavailable or closed");
    const run = await deps.store.readRunRecord?.(task.event.runId), runs = await deps.store.listRunRecords?.();
    if (!run?.ok || run.value.value.state !== "draft" || run.value.value.flowId !== current.value.flowId || !runs?.ok || !onlyUnpinnedDrafts(runs.value)) return invalid("Initial workflow cannot change an existing execution run");
    const expectedFiles: Array<{ path: string; sha256: string }> = [];
    for (const path of [".ans/state/tasks.jsonl", STABLE_WRITES_REL, STABLE_WRITE_PERMITS_REL, `.ans/runs/${task.event.runId}/manifest.json`]) {
      const file = await deps.store.readProjectFile!(path); if (!file.ok) return invalid("Workflow source bytes unavailable"); expectedFiles.push({ path, sha256: file.value.sha256 });
    }
    const source: GitInitialWorkflowSource = { schema: "stable-initial-workflow-source/v1", kind: "stable-initial-workflow",
      operationId: initialWorkflowOperationId(current.value.flowId, record.requestId, permit.permitId), flowId: current.value.flowId, taskId: input.taskId, runId: task.event.runId,
      coreSessionId: input.coreSessionId, ...(input.coreTurnId ? { coreTurnId: input.coreTurnId } : {}), roleId: "convener", requestId: record.requestId, permitId: permit.permitId,
      path: "docs/workflow.md", baseSha256: "", targetSha256: record.targetSha256, authority: permit.authority,
      documentCommit: { version: current.value.trunkVersion, digest: current.value.digest }, documentSnapshot: current.value.snapshotRef };
    const saved = await writeGitInitialWorkflowSource(deps.projectRoot, { operationId: source.operationId, bytesBase64: Buffer.from(json(source)).toString("base64"), hostLeaseId: input.hostLeaseId, expectedFiles });
    return saved.ok ? { ok: true, value: source } : invalid(saved.message ?? saved.reason);
  } catch (error) { return invalid(String(error)); }
}

export function isInitialWorkflowSource(value: unknown): value is GitInitialWorkflowSource {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  if (!object(value) || !object(value.authority) || !object(value.documentCommit) || !isSnapshotRef(value.documentSnapshot)) return false;
  return value.schema === "stable-initial-workflow-source/v1" && value.kind === "stable-initial-workflow" && value.roleId === "convener"
    && value.path === "docs/workflow.md" && value.baseSha256 === "" && typeof value.targetSha256 === "string" && /^[a-f0-9]{64}$/i.test(value.targetSha256)
    && [value.operationId, value.flowId, value.taskId, value.runId, value.coreSessionId, value.requestId, value.permitId].every(text)
    && (value.coreTurnId === undefined || text(value.coreTurnId)) && (text(value.authority.decisionId) || text(value.authority.confirmationId))
    && Object.keys(value.authority).every(key => ["decisionId", "confirmationId"].includes(key))
    && Number.isSafeInteger(value.documentCommit.version) && Number(value.documentCommit.version) > 0
    && typeof value.documentCommit.digest === "string" && /^[a-f0-9]{64}$/i.test(value.documentCommit.digest);
}

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

export async function applyStableSnapshot(deps: TrunkServiceDeps, input: TrunkStableSnapshotInput): Promise<TrunkStableSnapshotResult> {
  const result = await prepareInitialWorkflowSnapshot(deps, input);
  return "preparationKind" in result ? { applied: false, pendingReattach: true } : result;
}
export async function prepareInitialWorkflowSnapshot(
  deps: TrunkServiceDeps, input: TrunkStableSnapshotInput, prepareOnly = false,
): Promise<TrunkStableSnapshotResult | import("../abstract/trunk-service.ts").InitialWorkflowSnapshotPreparation> {
  const pending = (errorCode: string, message: string): TrunkStableSnapshotResult => ({ applied: false, pendingReattach: true, errorCode, message });
  const read = await deps.store.readManifest();
  if (!read.ok) return pending("stable-manifest-unavailable", read.message ?? read.reason);
  const manifest = read.value;

  // Initial planning trunks may receive their first actually approved workflow later.
  // This is the existing stable mini-update: no version bump, activation or run re-pin.
  if (manifest.snapshotRef !== undefined) {
    if (input.kind !== "workflow" || input.path !== "docs/workflow.md" || input.roleId !== "convener" || input.oldSha !== ""
      || (!input.confirmationId && !input.decisionId) || !deps.store.listRunRecords || !deps.store.readProjectFile
      || !deps.store.readSnapshot || !deps.store.captureSnapshot || !deps.store.compareAndSwapManifest) return pending("initial-workflow-input-invalid", "First workflow requires the actual convener approval, empty previous hash and complete snapshot storage");
    try {
      const runs = await deps.store.listRunRecords();
      if (!runs.ok || !onlyUnpinnedDrafts(runs.value)) return pending("initial-workflow-run-basis-unavailable", "Actual run history is unreadable, pinned or not wholly draft");
      const records = await createStableWriteStore(deps.projectRoot).list(), permits = await createStableWritePermitStore(deps.projectRoot).list();
      const record = records.find(record => record.kind === "workflow" && record.roleId === "convener" && record.path === input.path
        && record.baseSha256 === "" && record.targetSha256 === input.newSha && record.status === "written" && !!record.consumedAt && !!record.writtenAt
        && record.decisionId === input.decisionId && record.confirmationId === input.confirmationId);
      const permit = record ? permits.find(permit => permit.permitId === record.permitId && permit.requestId === record.requestId && permit.kind === "workflow"
        && permit.roleId === "convener" && permit.path === input.path && permit.baseSha256 === "" && permit.targetSha256 === input.newSha
        && permit.status === "consumed" && !!permit.consumedAt && permit.authority.decisionId === input.decisionId && permit.authority.confirmationId === input.confirmationId) : undefined;
      if (!record || !permit) return pending("initial-workflow-written-permit-unavailable", "No exact written workflow and consumed permit match the actual hash and approval");
      input = { ...input, at: record.writtenAt! };
      const operationId = initialWorkflowOperationId(manifest.flowId, record.requestId, permit.permitId), sourceRead = await readGitInitialWorkflowSource(deps.projectRoot, operationId);
      let source: GitInitialWorkflowSource | undefined;
      if (sourceRead.ok) {
        const parsed: unknown = JSON.parse(Buffer.from(sourceRead.value.bytesBase64, "base64").toString("utf8"));
        if (!isInitialWorkflowSource(parsed)) return pending("initial-workflow-source-invalid", "The immutable actual workflow source has an invalid shape");
        const actual = parsed;
        if (actual.schema !== "stable-initial-workflow-source/v1" || actual.kind !== "stable-initial-workflow" || actual.operationId !== operationId || actual.flowId !== manifest.flowId
          || actual.roleId !== "convener" || actual.requestId !== record.requestId || actual.permitId !== permit.permitId || actual.path !== input.path || actual.baseSha256 !== ""
          || actual.targetSha256 !== input.newSha || json(actual.authority) !== json(permit.authority) || !actual.taskId || !actual.runId || !actual.coreSessionId) return pending("initial-workflow-source-binding-invalid", "The immutable source differs from the actual flow/request/permit/hash/approval");
        source = { ...actual, documentCommit: { version: actual.documentCommit.version, digest: actual.documentCommit.digest },
          documentSnapshot: { snapshotId: actual.documentSnapshot.snapshotId, digest: actual.documentSnapshot.digest } };
      } else if (prepareOnly || sourceRead.reason !== "missing") return pending("initial-workflow-source-unavailable", sourceRead.message ?? sourceRead.reason);
      const attached = async () => {
        const current = await deps.store.readManifest();
        if (!current.ok || !current.value.snapshotRef || current.value.artifacts.workflow?.sha256 !== input.newSha
          || current.value.artifacts.workflow.decisionId !== input.decisionId || current.value.artifacts.workflow.confirmationId !== input.confirmationId) return false;
        const bytes = await deps.store.readSnapshot!(current.value.snapshotRef);
        return bytes.ok && bytes.value.files.some(file => file.path === input.path && file.sha256 === input.newSha)
          && bytes.value.files.some(file => file.path === STABLE_WRITES_REL) && bytes.value.files.some(file => file.path === STABLE_WRITE_PERMITS_REL)
          && (!source || sourceRead.ok && bytes.value.files.some(file => file.path === sourceRead.value.path && file.sha256 === sourceRead.value.sha256));
      };
      if (manifest.artifacts.workflow !== undefined) return await attached() ? { applied: true } : pending("initial-workflow-already-bound", "The current workflow is not this exact completed publication");
      const workflow = await deps.store.readProjectFile(input.path), recordBytes = await deps.store.readProjectFile(STABLE_WRITES_REL), permitBytes = await deps.store.readProjectFile(STABLE_WRITE_PERMITS_REL);
      if (!workflow.ok || workflow.value.sha256 !== input.newSha || !recordBytes.ok || !permitBytes.ok) return pending("initial-workflow-bytes-unavailable", "Actual workflow or stable ledger bytes are missing or changed");
      if (source && (json(source.documentCommit) !== json({ version: manifest.trunkVersion, digest: manifest.digest }) || json(source.documentSnapshot) !== json(manifest.snapshotRef))) return pending("initial-workflow-document-basis-stale", "The actual document basis changed after approval-source capture");
      const previous = await deps.store.readSnapshot(manifest.snapshotRef); if (!previous.ok) return pending("initial-workflow-base-snapshot-unavailable", previous.message ?? previous.reason);
      const refs = new Map(previous.value.files.map(file => [file.path, { path: file.path, sha256: file.sha256 }]));
      refs.set(input.path, { path: input.path, sha256: input.newSha });
      refs.set(STABLE_WRITES_REL, { path: STABLE_WRITES_REL, sha256: recordBytes.value.sha256 });
      refs.set(STABLE_WRITE_PERMITS_REL, { path: STABLE_WRITE_PERMITS_REL, sha256: permitBytes.value.sha256 });
      if (source && sourceRead.ok) refs.set(sourceRead.value.path, { path: sourceRead.value.path, sha256: sourceRead.value.sha256 });
      const identity = createHash("sha256").update(JSON.stringify([manifest.snapshotRef, record.requestId, input.newSha, recordBytes.value.sha256, permitBytes.value.sha256])).digest("hex");
      const captured = await deps.store.captureSnapshot({ snapshotId: `s-initial-workflow-${identity}`, createdAt: input.at, files: [...refs.values()], baseSnapshotRef: manifest.snapshotRef });
      if (!captured.ok) return { applied: false, pendingReattach: true, errorCode: "initial-workflow-snapshot-unavailable", message: captured.message ?? captured.reason };
      const next = { ...manifest, snapshotRef: captured.value, updatedAt: input.at,
        artifacts: { ...manifest.artifacts, workflow: { kind: "workflow" as const, path: input.path, sha256: input.newSha, updatedAt: input.at,
          ...(input.decisionId ? { decisionId: input.decisionId } : {}), ...(input.confirmationId ? { confirmationId: input.confirmationId } : {}) } } };
      if (prepareOnly) {
        if (!source || !sourceRead.ok) return pending("initial-workflow-source-unavailable", "Actual approval-source bytes are unavailable");
        const snapshot = await deps.store.readSnapshot(captured.value); if (!snapshot.ok) return pending("initial-workflow-snapshot-unavailable", snapshot.message ?? snapshot.reason);
        return { preparationKind: "initial-workflow-snapshot", input, source, sourceFile: { path: sourceRead.value.path, sha256: sourceRead.value.sha256 },
          record, permit, before: manifest, manifest: next, snapshot: snapshot.value };
      }
      // Preserve the original document operation's exact immutable commit proof.
      const archived = await deps.store.archiveHistory(manifest.trunkVersion, manifest); if (!archived.ok) return pending("initial-workflow-history-unavailable", archived.message ?? archived.code);
      const written = await deps.store.compareAndSwapManifest({ version: manifest.trunkVersion, digest: manifest.digest }, next, captured.value,
        { revision: manifest.activeRevision ?? 0, digest: manifest.activeDigest ?? null }, manifest.snapshotRef);
      if (!written.ok && !(await attached())) return pending("initial-workflow-cas-refused", written.message ?? written.code);
      return { applied: true, audit: auditOf(manifest.trunkVersion, input, "") };
    } catch (error) { return { applied: false, pendingReattach: true, errorCode: "initial-workflow-snapshot-failed", message: String(error) }; }
  }

  let currentRef: TrunkStableArtifactRef | undefined;
  if (input.kind === "workflow") {
    if (manifest.artifacts.workflow?.path === input.path) currentRef = manifest.artifacts.workflow;
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
