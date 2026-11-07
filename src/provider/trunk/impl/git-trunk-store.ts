// Single-ref storage commit/recovery. This does not select/migrate production TrunkStore.
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { acquireVersionLock, ownsVersionLock, appendTaskLedgerEvent, readOperationEvents, readConfirmedIntentEvidence, readVersionBaselineState } from "../../version-change/public/version-change-store.ts";
import { isRunGitBases } from "../../../common/编排/run-manifest.ts";
import type { GitRefJournal, GitRefStore, GitOperationRecord, StoreWrite, TrunkStore, StoreRead, ManifestCasResult, ActiveRolesState, GitDocumentMutationScope } from "../abstract/trunk-store.ts";
import { FROZEN_ROLE_REF_KEYS, isActiveRoleEvidence, isFrozenRoleEvidence, isSnapshotRef, isSnapshotArtifactRef, type TrunkApplyJournal, type TrunkManifest, type CompleteSnapshot, type SnapshotRef, type TrunkCommitRef, type GitOid } from "../../../model/trunk.ts";
import { executeGit, inspectGitRepository, readGitProtectionFacts, isGitRefJournal, isGitOperationRecord, listGitOperationJournals, listGitInitializationRecords, readGitInitializationRecord, gitBusinessRequestDigest, isTrunkApplyJournalShape, checkGitHostAction, gitCommandArgv, isGitProcessNotStarted } from "./git-command.ts";
import { applicationGitRef, createGitCandidateStore } from "./git-candidate-store.ts";
import { createFsTrunkStore, isTrunkManifestShape, artifactRefs, checkRunChangeRequester } from "./fs-trunk-store.ts";
import { isStoredCompleteSnapshot, STABLE_WRITES_REL, STABLE_WRITE_PERMITS_REL } from "../../version-change/public/version-change-store.ts";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
/** Read the entire actual before/after tree and the exact single CAS command. No mutation. */
export async function planGitRefPublication(root: string, ref: string, oldOid: GitOid | null, candidate: GitOid): Promise<import("../abstract/trunk-store.ts").GitRefPublicationPlan> {
  applicationGitRef(ref);
  const objects = createGitCandidateStore(root), identity = await objects.inspect(), commit = await objects.readCommit(candidate);
  if (oldOid && oldOid.objectFormat !== identity.objectFormat || candidate.objectFormat !== identity.objectFormat) throw new Error("git-publication-format-mismatch");
  const baseTree = oldOid ? await objects.listTree(oldOid) : [], candidateTree = await objects.listTree(candidate);
  const before = new Map(baseTree.map(entry => [entry.path, entry])), after = new Map(candidateTree.map(entry => [entry.path, entry]));
  const diff: import("../abstract/trunk-store.ts").GitCandidatePlan["diff"][number][] = [];
  for (const file of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(file), next = after.get(file);
    if (old && next && old.mode === next.mode && old.oid.hex === next.oid.hex) continue;
    diff.push({ status: !old ? "A" : !next ? "D" : old.mode !== next.mode ? "T" : "M",
      ...(old ? { oldPath: file, oldMode: old.mode, oldOid: old.oid } : {}), ...(next ? { newPath: file, newMode: next.mode, newOid: next.oid } : {}) });
  }
  return { ref, oldOid, commit, baseTree, candidateTree, diff, commitBytesBase64: (await objects.readCommitBytes(candidate)).bytesBase64,
    oldCommitBytesBase64: oldOid ? (await objects.readCommitBytes(oldOid)).bytesBase64 : null, worksite: { kind: "ref-only", index: "not-used", checkout: "not-used" },
    argv: gitCommandArgv(["update-ref", "--no-deref", ref, candidate.hex, oldOid?.hex ?? "0".repeat(identity.objectFormat === "sha1" ? 40 : 64)]) };
}
/** Media/object proof only. Role, task and criterion applicability are validated by the Service. */
export async function readGitCandidateEvidence(root: string, operationId: string, candidate: GitOid): Promise<StoreRead<import("../abstract/trunk-store.ts").GitCandidateEvidence>> {
  try {
    const objects = createGitCandidateStore(root), identity = await objects.inspect(), journal = await createGitRefStore(root).readJournal(operationId);
    if (!journal || journal.phase !== "published" || journal.repoId !== identity.repoId || journal.process?.termination !== "exited" || journal.process.exitCode !== 0
      || !journal.candidateSource || journal.ref !== `refs/ans/candidates/${hash(operationId)}` || JSON.stringify(journal.newOid) !== JSON.stringify(candidate)
      || JSON.stringify(await objects.readRef(journal.ref)) !== JSON.stringify(candidate)) return { ok: false, reason: "corrupt", message: "git-candidate-operation-proof-unavailable" };
    const commit = await objects.readCommit(candidate);
    if (JSON.stringify([commit.tree, commit.parents]) !== JSON.stringify([journal.tree, journal.parents])) return { ok: false, reason: "corrupt", message: "git-candidate-object-proof-mismatch" };
    const file = `.ans/trunk/operations/${hash(operationId)}/git.json`, read = await createFsTrunkStore(root, { legacyCommitProofOnly: true }).readProjectFile!(file, { maxBytes: 2 * 1024 * 1024 });
    if (!read.ok) return read;
    if (JSON.stringify(JSON.parse(Buffer.from(read.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(journal)) return { ok: false, reason: "corrupt", message: "git-candidate-journal-changed" };
    return { ok: true, value: { journal, commit, journalFile: { path: file, ...read.value } } };
  } catch (error) { return { ok: false, reason: "corrupt", message: String(error) }; }
}
/** Real settled delivery media/ref/object proof; no task-completion policy is inferred here. */
export async function readGitDeliveryEvidence(root: string, operationId: string): Promise<StoreRead<import("../abstract/trunk-store.ts").GitCandidateEvidence>> {
  try {
    const objects = createGitCandidateStore(root), identity = await objects.inspect(), journal = await createGitRefStore(root).readJournal(operationId);
    if (!journal || journal.phase !== "published" || journal.repoId !== identity.repoId || journal.process?.termination !== "exited" || journal.process.exitCode !== 0
      || !journal.deliverySource || journal.ref !== `refs/ans/delivery/${journal.deliverySource.flowId}`
      || JSON.stringify(await objects.readRef(journal.ref)) !== JSON.stringify(journal.newOid)) return { ok: false, reason: "corrupt", message: "git-delivery-operation-proof-unavailable" };
    const commit = await objects.readCommit(journal.newOid);
    if (JSON.stringify([commit.tree, commit.parents]) !== JSON.stringify([journal.tree, journal.parents])) return { ok: false, reason: "corrupt", message: "git-delivery-object-proof-mismatch" };
    const file = `.ans/trunk/operations/${hash(operationId)}/git.json`, read = await createFsTrunkStore(root, { legacyCommitProofOnly: true }).readProjectFile!(file, { maxBytes: 2 * 1024 * 1024 });
    if (!read.ok) return read;
    if (JSON.stringify(JSON.parse(Buffer.from(read.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(journal)) return { ok: false, reason: "corrupt", message: "git-delivery-journal-changed" };
    return { ok: true, value: { journal, commit, journalFile: { path: file, ...read.value } } };
  } catch (error) { return { ok: false, reason: "corrupt", message: String(error) }; }
}
/** Read provenance only: a settled application publication reachable from its still-proven app ref. Never a write basis. */
export async function readGitPublishedReadEvidence(root: string, target: GitOid): Promise<StoreRead<import("../abstract/trunk-store.ts").GitCandidateEvidence>> {
  const invalid = (message: string): StoreRead<never> => ({ ok: false, reason: "corrupt", message });
  try {
    const objects = createGitCandidateStore(root), identity = await objects.inspect(), same = (a: GitOid | null, b: GitOid) => a?.objectFormat === b.objectFormat && a.hex.toLowerCase() === b.hex.toLowerCase();
    const journals = (await createGitRefStore(root).listJournals()).filter((row): row is GitRefJournal => row.phase !== "business-prepared");
    const published = journals.filter(row => row.phase === "published" && row.repoId === identity.repoId && row.process?.termination === "exited" && row.process.exitCode === 0
      && same(row.newOid, target) && (row.ref === "refs/ans/trunk"
        || row.deliverySource !== undefined && row.ref === `refs/ans/delivery/${row.deliverySource.flowId}`));
    if (!published.length) return { ok: false, reason: "missing", message: "git-published-read-source-missing" };
    if (published.length > 256 || target.objectFormat !== identity.objectFormat) return invalid("git-published-read-source-budget-or-format");
    await objects.readCommitBytes(target);
    const commit = await objects.readCommit(target);
    for (const journal of published) {
      if (JSON.stringify([commit.tree, commit.parents]) !== JSON.stringify([journal.tree, journal.parents])) return invalid("git-published-read-object-conflict");
      const file = `.ans/trunk/operations/${hash(journal.operationId)}/git.json`, read = await createFsTrunkStore(root, { legacyCommitProofOnly: true }).readProjectFile!(file, { maxBytes: 2 * 1024 * 1024 });
      if (!read.ok || JSON.stringify(JSON.parse(Buffer.from(read.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(journal)) return invalid("git-published-read-journal-conflict");
      const anchor = await objects.readRef(journal.ref); if (!anchor) continue;
      if (journal.ref === "refs/ans/trunk") {
        const bytes = await objects.readBlob(target, ".ans/trunk/manifest.json"), original: unknown = JSON.parse(Buffer.from(bytes.bytesBase64, "base64").toString("utf8"));
        if (!isTrunkManifestShape(original) || !original.snapshotRef) return invalid("git-published-read-document-source-invalid");
        const frozen = await objects.readBlob(target, `.ans/trunk/snapshots/${original.snapshotRef.snapshotId}.json`), snapshot: unknown = JSON.parse(Buffer.from(frozen.bytesBase64, "base64").toString("utf8"));
        if (!isStoredCompleteSnapshot(snapshot) || snapshot.snapshotId !== original.snapshotRef.snapshotId || snapshot.digest !== original.snapshotRef.digest)
          return invalid("git-published-read-document-snapshot-conflict");
        const current = await createGitTrunkStore(root).readManifest(); if (!current.ok) return current;
      } else {
        const currentRows = journals.filter(row => row.phase === "published" && row.ref === journal.ref && same(row.newOid, anchor) && row.deliverySource !== undefined);
        if (!currentRows.length) return invalid("git-published-read-anchor-source-missing");
        const current = await readGitDeliveryEvidence(root, currentRows[0]!.operationId); if (!current.ok) return current;
      }
      const pending: GitOid[] = [anchor], visited = new Set<string>(); let found = false;
      while (pending.length) {
        const oid = pending.pop()!; if (same(oid, target)) { found = true; break; }
        if (visited.has(oid.hex)) continue; if (visited.size >= 512) return invalid("git-published-read-ancestry-budget");
        visited.add(oid.hex); const parent = await objects.readCommit(oid); pending.push(...parent.parents);
      }
      if (!found) continue;
      if (!same(await objects.readRef(journal.ref), anchor)) return invalid("git-published-read-anchor-changed");
      return { ok: true, value: { journal, commit, journalFile: { path: file, ...read.value } } };
    }
    return invalid("git-published-read-history-unreachable");
  } catch (error) { return invalid(String(error)); }
}
/** A document-planning task consumes the original work source and exact effective document basis, not an execution pin. */
export async function appendGitDocumentPreparationTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskCreatedEvent, input: {
  documentBasis: { version: number; digest: string; snapshotRef?: SnapshotRef } | null; sourceFile: { path: string; sha256: string };
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string };
  expectedLedgerDigest?: string; initializationOperationId?: string;
  intentConfirmation?: { path: string; version: number; sha256: string; confirmationDigest: string };
  planCompletion?: { basis: import("../abstract/trunk-store.ts").GitPlanCompletionBasis; closeOperationId: string; closeSha256: string };
  hubRouting?: "chief-hub-v1";
  expectedFiles?: readonly { path: string; sha256: string }[];
  expectedActive?: { revision: number; digest: string };
}): ReturnType<typeof appendTaskLedgerEvent> {
  const release = await acquireVersionLock(root);
  try {
    if (input.hubRouting === "chief-hub-v1") {
      if (event.hubRouting !== input.hubRouting || event.from !== "chief" || !["product", "rapporteur", "nominator", "convener", "verifier"].includes(event.to))
        return { ok: false, reason: "builtin-task-source-mismatch" };
      if (input.expectedActive) {
        const current = await createProjectTrunkStore(root).readManifest();
        if (event.to !== "convener" || event.runState !== "pinned" || input.documentBasis === null || !current.ok
          || current.value.flowId !== event.flowId || current.value.trunkVersion !== input.documentBasis.version || current.value.digest !== input.documentBasis.digest
          || current.value.activeRevision !== input.expectedActive.revision || current.value.activeDigest !== input.expectedActive.digest)
          return { ok: false, reason: "restart-execution-target-changed" };
      }
      return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask, expectedRun: input.expectedRun,
        ...(input.expectedLedgerDigest ? { expectedLedgerDigest: input.expectedLedgerDigest } : {}), expectedFiles: [input.sourceFile, ...(input.expectedFiles ?? [])] });
    }
    if (event.to === "rapporteur" || event.to === "convener" || event.to === "nominator") {
      const selected = input.intentConfirmation;
      if (!selected) return { ok: false, reason: "document-preparation-intent-missing" };
      const proof = await readConfirmedIntentEvidence(root, selected.path);
      if (!proof.ok) return { ok: false, reason: `document-preparation-${proof.reason}` };
      const { ledgerDigest, ...intent } = proof.value;
      if (JSON.stringify(intent) !== JSON.stringify(selected) || ledgerDigest !== input.expectedLedgerDigest)
        return { ok: false, reason: "document-preparation-intent-changed" };
    }
    if (event.to === "nominator") {
      const selected = input.planCompletion;
      if (!selected) return { ok: false, reason: "role-preparation-plan-missing" };
      const plan = await readGitPlanCompletionBasis(root, selected.basis), ledger = await readOperationEvents(root);
      if (!plan.ok || JSON.stringify(plan.value.basis) !== JSON.stringify(selected.basis) || !ledger.ok) return { ok: false, reason: "role-preparation-plan-changed" };
      const closes = ledger.records.filter(row => row.value.kind === "task.closed" && row.value.taskId === selected.basis.taskId && row.value.operationId === selected.closeOperationId);
      if (closes.length !== 1 || hash(closes[0]!.raw) !== selected.closeSha256 || closes[0]!.value.by !== "chief" || closes[0]!.value.outcome !== "accepted") return { ok: false, reason: "role-preparation-creator-close-changed" };
    }
    const current = await createProjectTrunkStore(root).readManifest(), expected = input.documentBasis;
    let initial = false;
    if (expected === null && !current.ok && current.reason !== "missing" && input.initializationOperationId && event.flowId) {
      const proof = await createProjectTrunkStore(root).readInitialGitPublicationBasis?.(event.flowId);
      initial = proof?.ok === true && proof.value.initializationOperationId === input.initializationOperationId;
    }
    if (expected === null ? current.ok || (current.reason !== "missing" && !initial) : !current.ok || current.value.trunkVersion !== expected.version || current.value.digest !== expected.digest
      || current.value.snapshotRef?.snapshotId !== expected.snapshotRef?.snapshotId || current.value.snapshotRef?.digest !== expected.snapshotRef?.digest)
      return { ok: false, reason: "document-preparation-basis-changed" };
    if (!await ownsVersionLock(root, release.token)) return { ok: false, reason: "document-preparation-fence-lost" };
    return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask, expectedRun: input.expectedRun,
      ...(input.expectedLedgerDigest ? { expectedLedgerDigest: input.expectedLedgerDigest } : {}), expectedFiles: [input.sourceFile] });
  } catch (error) { return { ok: false, reason: String(error) }; } finally { await release(); }
}

/** Recheck actual immutable Git evidence in the same R9 lock as the existing ledger append. */
export async function appendGitCandidateTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskStateEvent, input: {
  operationId: string; candidate: GitOid; journalSha256: string; criteria: readonly import("../../../model/trunk.ts").GitEvidenceRef[];
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string };
  expectedLedgerDigest?: string; expectedFiles?: readonly { path: string; sha256: string }[];
  expectedDelivery?: { operationId: string; journalSha256: string };
  expectedParentTask?: { taskId: string; digest: string; flowId: string; runId: string; to: "convener" };
}): ReturnType<typeof appendTaskLedgerEvent> {
  const release = await acquireVersionLock(root);
  try {
    if (!await ownsVersionLock(root, release.token)) return { ok: false, reason: "candidate-task-fence-lost" };
    const proof = await readGitCandidateEvidence(root, input.operationId, input.candidate);
    if (!proof.ok || proof.value.journalFile.sha256 !== input.journalSha256) return { ok: false, reason: proof.ok ? "candidate-task-journal-changed" : proof.message ?? proof.reason };
    const objects = createGitCandidateStore(root);
    for (const ref of input.criteria) if ((await objects.readBlob(ref.oid, ref.path)).sha256 !== ref.sha256.toLowerCase()) return { ok: false, reason: "candidate-task-criterion-mismatch" };
    if (input.expectedDelivery) {
      const delivery = await readGitDeliveryEvidence(root, input.expectedDelivery.operationId);
      if (!delivery.ok || delivery.value.journalFile.sha256 !== input.expectedDelivery.journalSha256 || JSON.stringify(delivery.value.journal.newOid) !== JSON.stringify(input.candidate))
        return { ok: false, reason: "candidate-task-delivery-changed" };
    }
    return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask, expectedRun: input.expectedRun,
      ...(input.expectedLedgerDigest ? { expectedLedgerDigest: input.expectedLedgerDigest } : {}),
      ...(input.expectedParentTask ? { expectedParentTask: input.expectedParentTask } : {}), expectedFiles: [{ path: proof.value.journalFile.path, sha256: input.journalSha256 }, ...(input.expectedFiles ?? [])] });
  } catch (error) { return { ok: false, reason: String(error) }; } finally { await release(); }
}
async function optional(file: string): Promise<Buffer | null> {
  try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 2 * 1024 * 1024) throw new Error("git-journal-file-unsafe");
    return await readFile(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

/** Immutable work-source bytes in the existing operation namespace; never an approval or pointer. */
export async function readGitInitialWorkflowSource(root: string, operationId: string): Promise<StoreRead<{ path: string; sha256: string; bytesBase64: string }>> {
  const file = `.ans/trunk/operations/${hash(operationId)}/stable-source.json`;
  const read = await createFsTrunkStore(root, { legacyCommitProofOnly: true }).readProjectFile!(file, { maxBytes: 64 * 1024 });
  return read.ok ? { ok: true, value: { path: file, ...read.value } } : read;
}
export async function writeGitInitialWorkflowSource(root: string, input: { operationId: string; bytesBase64: string; hostLeaseId: string; expectedFiles: readonly { path: string; sha256: string }[] }): Promise<StoreRead<{ path: string; sha256: string; bytesBase64: string }>> {
  const release = await acquireVersionLock(root);
  try {
    if (!await ownsVersionLock(root, release.token) || !checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "arm" }).ok) return { ok: false, reason: "corrupt", message: "workflow-source-host-basis-invalid" };
    const legacy = createFsTrunkStore(root, { legacyCommitProofOnly: true });
    for (const file of input.expectedFiles) { const actual = await legacy.readProjectFile!(file.path); if (!actual.ok || actual.value.sha256 !== file.sha256) return { ok: false, reason: "corrupt", message: "workflow-source-authority-stale" }; }
    const rel = `.ans/trunk/operations/${hash(input.operationId)}/stable-source.json`, bytes = Buffer.from(input.bytesBase64, "base64");
    if (bytes.length > 64 * 1024) return { ok: false, reason: "corrupt", message: "workflow-source-byte-budget" };
    const old = await readGitInitialWorkflowSource(root, input.operationId);
    if (old.ok) return old.value.sha256 === createHash("sha256").update(bytes).digest("hex") ? old : { ok: false, reason: "corrupt", message: "workflow-source-operation-conflict" };
    if (old.reason !== "missing") return old;
    const prior = await createGitRefStore(root).readJournal(input.operationId), fsPrior = await legacy.readOperation!(input.operationId);
    if (prior || fsPrior.ok || fsPrior.reason !== "missing") return { ok: false, reason: "corrupt", message: "workflow-source-operation-already-bound" };
    await assertControlPaths(root); const dir = path.dirname(path.join(root, rel)); await mkdir(dir, { recursive: true });
    const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) return { ok: false, reason: "corrupt", message: "workflow-source-directory-unsafe" };
    if (!checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "arm" }).ok) return { ok: false, reason: "corrupt", message: "workflow-source-host-basis-stale" };
    await atomicWrite(path.join(root, rel), bytes); return readGitInitialWorkflowSource(root, input.operationId);
  } finally { await release(); }
}

/** Proves current active成果; it deliberately makes no claim which task originally created that activation. */
export async function readGitActiveCompletionBasis(root: string, input: { flowId: string; roles: readonly { roleId: string; operationId: string }[] }): Promise<StoreRead<{
  basis: import("../abstract/trunk-store.ts").GitActiveCompletionBasis; files: CompleteSnapshot["files"]; liveFiles: readonly { path: string; sha256: string }[]
}>> {
  const invalid = (message: string): StoreRead<never> => ({ ok: false, reason: "corrupt", message });
  try {
    if (!input.roles.length || input.roles.length > 16 || new Set(input.roles.map(role => role.roleId)).size !== input.roles.length) return invalid("active-completion-targets-invalid");
    const store = createGitTrunkStore(root, { readOnly: true }), objects = createGitCandidateStore(root), operations = createGitRefStore(root), identity = await objects.inspect();
    const current = await store.readManifest(), oid = await objects.readRef("refs/ans/trunk");
    if (!current.ok || !oid || current.value.flowId !== input.flowId || current.value.activeRevision === undefined || !current.value.activeDigest) return invalid("active-completion-current-state-unavailable");
    const blob = await objects.readBlob(oid, ".ans/trunk/manifest.json");
    if (JSON.stringify(JSON.parse(Buffer.from(blob.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(current.value)) return invalid("active-completion-ref-changed");
    const files = new Map<string, CompleteSnapshot["files"][number]>(), roles: import("../abstract/trunk-store.ts").GitActiveCompletionBasis["roles"][number][] = [], liveFiles: Array<{ path: string; sha256: string }> = [];
    const add = (file: CompleteSnapshot["files"][number]) => { const old = files.get(file.path); if (old && old.sha256 !== file.sha256) throw new Error("active-completion-material-collision"); files.set(file.path, file); };
    for (const target of [...input.roles].sort((a, b) => a.roleId.localeCompare(b.roleId))) {
      const evidence = current.value.activeRoles?.[target.roleId]; if (!evidence) return invalid("active-completion-role-absent");
      const frozen = await store.readActiveRoleEvidence!(evidence); if (!frozen.ok) return frozen;
      const activation = frozen.value.files.find(file => file.path === evidence.activationRef.path && file.sha256 === evidence.activationRef.sha256);
      const meta: unknown = activation ? JSON.parse(Buffer.from(activation.bytesBase64, "base64").toString("utf8")) : undefined;
      if (!meta || typeof meta !== "object" || !("input" in meta) || !meta.input || typeof meta.input !== "object" || !("operationId" in meta.input) || meta.input.operationId !== target.operationId) return invalid("active-completion-original-operation-mismatch");
      const journal = await operations.readJournal(target.operationId), business = journal?.businessJournal;
      if (!journal || journal.phase === "business-prepared" || journal.process?.termination !== "exited" || journal.process.exitCode !== 0 || journal.repoId !== identity.repoId
        || business?.actionSource?.kind !== "role-direct" || business.actionSource.action !== "activate-role-documents" || business.actionSource.actorRoleId !== "nominator"
        || JSON.stringify(business.targetSnapshot) !== JSON.stringify(evidence.snapshotRef) || journal.requestDigest !== gitBusinessRequestDigest(business)) return invalid("active-completion-journal-proof-unavailable");
      const original = await objects.readCommit(journal.newOid);
      if (JSON.stringify([original.tree, original.parents]) !== JSON.stringify([journal.tree, journal.parents])) return invalid("active-completion-object-proof-invalid");
      let cursor: GitOid | null = oid, found = false;
      for (let count = 0; cursor && count < 256; count++) {
        if (cursor.hex === journal.newOid.hex) { found = true; break; }
        const commit = await objects.readCommit(cursor); if (commit.parents.length > 1) return invalid("active-completion-ancestry-ambiguous"); cursor = commit.parents[0] ?? null;
      }
      if (!found) return invalid("active-completion-operation-not-effective");
      for (const file of frozen.value.files) add(file);
      const journalPath = `.ans/trunk/operations/${hash(target.operationId)}/git.json`, journalBytes = await store.readProjectFile!(journalPath);
      if (!journalBytes.ok) return journalBytes; add({ path: journalPath, ...journalBytes.value });
      for (const key of ["cardRef", "boundaryMdRef", "boundaryYamlRef"] as const) {
        const ref = evidence[key], live = await store.readProjectFile!(ref.path); if (!live.ok || live.value.sha256 !== ref.sha256) return invalid("active-completion-live-documents-drifted");
        liveFiles.push({ path: ref.path, sha256: ref.sha256 });
      }
      roles.push({ roleId: target.roleId, operationId: target.operationId, evidence });
    }
    return { ok: true, value: { basis: { kind: "current-active-completion", repoId: identity.repoId, flowId: input.flowId, gitOid: oid,
      active: { revision: current.value.activeRevision, digest: current.value.activeDigest }, roles }, files: [...files.values()], liveFiles } };
  } catch (error) { return invalid(String(error)); }
}
export async function appendGitActiveCompletionTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskClosedEvent, input: {
  basis: import("../abstract/trunk-store.ts").GitActiveCompletionBasis; expectedFiles: readonly { path: string; sha256: string }[];
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string }
}) {
  const release = await acquireVersionLock(root);
  try {
    if (!await ownsVersionLock(root, release.token)) return { ok: false as const, reason: "active-completion-lock-lost" };
    const actual = await readGitActiveCompletionBasis(root, input.basis);
    if (!actual.ok || JSON.stringify(actual.value.basis) !== JSON.stringify(input.basis)) return { ok: false as const, reason: "active-completion-current-basis-conflict" };
    return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask, expectedRun: input.expectedRun, expectedFiles: input.expectedFiles });
  } finally { await release(); }
}

/** Reads the original published snapshot/object and current ref; no source is inferred from live text. */
export async function readGitStableCompletionBasis(root: string, input: { flowId: string; taskId: string; runId: string; operationId: string }): Promise<StoreRead<{
  basis: import("../abstract/trunk-store.ts").GitStableCompletionBasis; files: CompleteSnapshot["files"];
  publishedSnapshot: CompleteSnapshot; businessJournal: TrunkApplyJournal; liveFiles: readonly { path: string; sha256: string }[];
}>> {
  const invalid = (message: string): StoreRead<never> => ({ ok: false, reason: "corrupt", message });
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  try {
    const store = createGitTrunkStore(root, { readOnly: true }), objects = createGitCandidateStore(root), identity = await objects.inspect();
    const current = await store.readManifest(), oid = await objects.readRef("refs/ans/trunk"), journal = await createGitRefStore(root).readJournal(input.operationId);
    if (!current.ok || !oid || current.value.flowId !== input.flowId || !current.value.artifacts.workflow || !journal || journal.phase === "business-prepared"
      || journal.repoId !== identity.repoId || journal.ref !== "refs/ans/trunk" || journal.process?.termination !== "exited" || journal.process.exitCode !== 0
      || !journal.businessJournal || journal.businessJournal.actionSource !== undefined || journal.requestDigest !== gitBusinessRequestDigest(journal.businessJournal))
      return invalid("stable-completion-published-proof-unavailable");
    const business = journal.businessJournal, message: unknown = business.message ? JSON.parse(business.message) : undefined;
    if (!object(message) || message.schema !== "stable-initial-workflow/v1" || !object(message.source) || !object(message.sourceFile)
      || message.source.operationId !== input.operationId || message.source.flowId !== input.flowId || message.source.taskId !== input.taskId || message.source.runId !== input.runId
      || message.source.path !== "docs/workflow.md" || typeof message.source.targetSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(message.source.targetSha256)
      || message.sourceFile.path !== `.ans/trunk/operations/${hash(input.operationId)}/stable-source.json` || typeof message.sourceFile.sha256 !== "string"
      || !isSnapshotRef(business.targetSnapshot)) return invalid("stable-completion-original-source-mismatch");
    const original = await objects.readCommit(journal.newOid);
    if (JSON.stringify([original.tree, original.parents]) !== JSON.stringify([journal.tree, journal.parents])) return invalid("stable-completion-object-proof-invalid");
    let cursor: GitOid | null = oid, found = false;
    for (let count = 0; cursor && count < 256; count++) {
      if (cursor.hex === journal.newOid.hex && cursor.objectFormat === journal.newOid.objectFormat) { found = true; break; }
      const commit = await objects.readCommit(cursor); if (commit.parents.length > 1) return invalid("stable-completion-ancestry-ambiguous"); cursor = commit.parents[0] ?? null;
    }
    if (!found) return invalid("stable-completion-operation-not-effective");
    const originalBlob = await objects.readBlob(journal.newOid, ".ans/trunk/manifest.json"), originalManifest: unknown = JSON.parse(Buffer.from(originalBlob.bytesBase64, "base64").toString("utf8"));
    if (!isTrunkManifestShape(originalManifest) || originalManifest.flowId !== input.flowId
      || JSON.stringify(canonical(originalManifest.snapshotRef)) !== JSON.stringify(canonical(business.targetSnapshot))
      || JSON.stringify(canonical(originalManifest.artifacts.workflow)) !== JSON.stringify(canonical(current.value.artifacts.workflow))) return invalid("stable-completion-current-workflow-changed");
    const snapshotPath = `.ans/trunk/snapshots/${business.targetSnapshot.snapshotId}.json`, snapshotBlob = await objects.readBlob(journal.newOid, snapshotPath);
    const snapshot: unknown = JSON.parse(Buffer.from(snapshotBlob.bytesBase64, "base64").toString("utf8"));
    if (!isStoredCompleteSnapshot(snapshot) || snapshot.snapshotId !== business.targetSnapshot.snapshotId || snapshot.digest !== business.targetSnapshot.digest)
      return invalid("stable-completion-published-snapshot-invalid");
    const source = await readGitInitialWorkflowSource(root, input.operationId), workflow = await store.readProjectFile!("docs/workflow.md");
    if (!source.ok || source.value.sha256 !== message.sourceFile.sha256 || !workflow.ok || workflow.value.sha256 !== message.source.targetSha256
      || current.value.artifacts.workflow.sha256 !== workflow.value.sha256
      || JSON.stringify(canonical(JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8")))) !== JSON.stringify(canonical(message.source))
      || !snapshot.files.some(file => file.path === source.value.path && file.sha256 === source.value.sha256 && file.bytesBase64 === source.value.bytesBase64)
      || !snapshot.files.some(file => file.path === "docs/workflow.md" && file.sha256 === workflow.value.sha256 && file.bytesBase64 === workflow.value.bytesBase64))
      return invalid("stable-completion-source-or-workflow-bytes-changed");
    const journalPath = `.ans/trunk/operations/${hash(input.operationId)}/git.json`, files: CompleteSnapshot["files"][number][] = [
      { path: snapshotPath, sha256: hash(Buffer.from(snapshotBlob.bytesBase64, "base64")), bytesBase64: snapshotBlob.bytesBase64 },
      { path: source.value.path, sha256: source.value.sha256, bytesBase64: source.value.bytesBase64 }, { path: "docs/workflow.md", ...workflow.value } ];
    const live = new Map<string, { sha256: string; bytesBase64: string }>();
    for (const file of [journalPath, STABLE_WRITES_REL, STABLE_WRITE_PERMITS_REL]) {
      const bytes = await store.readProjectFile!(file); if (!bytes.ok) return invalid("stable-completion-current-record-bytes-unavailable");
      live.set(file, bytes.value); files.push({ path: file, ...bytes.value });
    }
    if (JSON.stringify(await objects.readRef("refs/ans/trunk")) !== JSON.stringify(oid)) return invalid("stable-completion-ref-changed-during-read");
    return { ok: true, value: { basis: { kind: "stable-workflow-completion", repoId: identity.repoId,
      flowId: input.flowId, taskId: input.taskId, runId: input.runId, operationId: input.operationId, gitOid: oid, publishedOid: journal.newOid,
      snapshotRef: business.targetSnapshot, workflow: { path: "docs/workflow.md", sha256: workflow.value.sha256 },
      sourceFile: { path: source.value.path, sha256: source.value.sha256 }, journalSha256: live.get(journalPath)!.sha256,
      stableWritesSha256: live.get(STABLE_WRITES_REL)!.sha256, stablePermitsSha256: live.get(STABLE_WRITE_PERMITS_REL)!.sha256 },
      files, publishedSnapshot: snapshot, businessJournal: business, liveFiles: files.filter(file => file.path !== snapshotPath).map(({ path, sha256 }) => ({ path, sha256 })) } };
  } catch (error) { return invalid(String(error)); }
}
export async function appendGitStableCompletionTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskClosedEvent, input: {
  basis: import("../abstract/trunk-store.ts").GitStableCompletionBasis; expectedFiles: readonly { path: string; sha256: string }[];
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string }
}) {
  const release = await acquireVersionLock(root);
  try {
    if (!await ownsVersionLock(root, release.token)) return { ok: false as const, reason: "stable-completion-lock-lost" };
    const current = await readGitStableCompletionBasis(root, input.basis);
    if (!current.ok || JSON.stringify(current.value.basis) !== JSON.stringify(input.basis) || event.taskId !== input.basis.taskId)
      return { ok: false as const, reason: "stable-completion-current-basis-conflict" };
    return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask,
      expectedRun: input.expectedRun, expectedFiles: input.expectedFiles });
  } finally { await release(); }
}

/** Same-task plan output from the published application ref, never inferred from report prose. */
export async function readGitPlanCompletionBasis(root: string, input: { flowId: string; taskId: string; runId: string; sourceId: string }): Promise<StoreRead<{
  basis: import("../abstract/trunk-store.ts").GitPlanCompletionBasis; files: CompleteSnapshot["files"]; liveFiles: readonly { path: string; sha256: string }[];
}>> {
  const invalid = (message: string): StoreRead<never> => ({ ok: false, reason: "corrupt", message });
  try {
    const store = createProjectTrunkStore(root), current = await store.readManifest(), source = await store.readInitializationSource?.(input.sourceId);
    if (!current.ok || !source?.ok || current.value.flowId !== input.flowId || !current.value.snapshotRef) return invalid("plan-completion-source-unavailable");
    const work: unknown = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8"));
    if (!work || typeof work !== "object" || !("purpose" in work) || !["team-planning", "builtin-preparation"].includes(String(work.purpose)) || !("planningRunId" in work) || work.planningRunId !== input.runId
      || !("flowId" in work) || work.flowId !== input.flowId) return invalid("plan-completion-purpose-mismatch");
    const plan = current.value.artifacts.execution.teamPlan;
    if (!plan) return invalid("plan-completion-ref-missing");
    const snapshot = await store.readSnapshot!(current.value.snapshotRef); if (!snapshot.ok) return invalid("plan-completion-snapshot-missing");
    const identity = await createGitCandidateStore(root).inspect();
    const matches = (await createGitRefStore(root).listJournals()).filter(row => row.phase === "published" && row.ref === "refs/ans/trunk" && row.repoId === identity.repoId
      && row.process?.termination === "exited" && row.process.exitCode === 0 && row.publicationTask?.taskId === input.taskId
      && row.publicationTask.runId === input.runId && row.businessJournal?.actionSource?.kind === "role-direct" && row.businessJournal.actionSource.action === "complete-team-plan"
      && row.businessJournal.actionSource.actorRoleId === "convener" && row.businessJournal.target.execution.teamPlan?.path === plan.path && row.businessJournal.target.execution.teamPlan.sha256 === plan.sha256);
    if (matches.length !== 1) return invalid("plan-completion-task-operation-unproven");
    const journal = matches[0]!, business = journal.businessJournal!;
    const original = await store.readOperationCommit?.(business);
    if (!original?.ok || business.flowId !== input.flowId || !business.targetSnapshot || original.value.snapshotRef?.digest !== business.targetSnapshot.digest
      || original.value.digest !== current.value.digest || original.value.trunkVersion !== current.value.trunkVersion) return invalid("plan-completion-current-commit-changed");
    const markerPath = `.ans/trunk/plan-completions/${hash(JSON.stringify(journal.operationId))}.json`;
    const markerFile = snapshot.value.files.find(file => file.path === markerPath), planFile = snapshot.value.files.find(file => file.path === plan.path && file.sha256 === plan.sha256);
    const marker: unknown = markerFile ? JSON.parse(Buffer.from(markerFile.bytesBase64, "base64").toString("utf8")) : undefined;
    if (!planFile || !marker || typeof marker !== "object" || !("schema" in marker) || marker.schema !== "team-plan-completion/v1"
      || !("operationId" in marker) || marker.operationId !== journal.operationId || !("actorRoleId" in marker) || marker.actorRoleId !== "convener"
      || !("flowId" in marker) || marker.flowId !== input.flowId || !("plan" in marker) || !marker.plan || typeof marker.plan !== "object"
      || !("path" in marker.plan) || marker.plan.path !== plan.path || !("sha256" in marker.plan) || marker.plan.sha256 !== plan.sha256) return invalid("plan-completion-marker-mismatch");
    const path = `.ans/trunk/operations/${hash(journal.operationId)}/git.json`, raw = await store.readProjectFile!(path);
    if (!raw.ok || JSON.stringify(JSON.parse(Buffer.from(raw.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(journal)) return invalid("plan-completion-journal-changed");
    return { ok: true, value: { basis: { kind: "team-plan-completion", ...input, sourceSha256: source.value.sha256, operationId: journal.operationId,
      journalSha256: raw.value.sha256, trunk: { version: current.value.trunkVersion, digest: current.value.digest }, snapshot: current.value.snapshotRef, plan: { path: plan.path, sha256: plan.sha256 } },
      files: [planFile, markerFile!, { path: source.value.path, sha256: source.value.sha256, bytesBase64: source.value.bytesBase64 }, { path, ...raw.value }],
      liveFiles: [{ path: source.value.path, sha256: source.value.sha256 }, { path, sha256: raw.value.sha256 }] } };
  } catch (error) { return invalid(String(error)); }
}
export async function appendGitPlanCompletionTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskClosedEvent, input: {
  basis: import("../abstract/trunk-store.ts").GitPlanCompletionBasis; expectedFiles: readonly { path: string; sha256: string }[];
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string }
}) {
  const release = await acquireVersionLock(root);
  try {
    const proof = await readGitPlanCompletionBasis(root, input.basis);
    if (!proof.ok || JSON.stringify(proof.value.basis) !== JSON.stringify(input.basis) || event.taskId !== input.basis.taskId)
      return { ok: false as const, reason: "plan-completion-basis-changed" };
    return await appendTaskLedgerEvent(root, event, { heldLockToken: release.token, expectedTask: input.expectedTask, expectedRun: input.expectedRun, expectedFiles: input.expectedFiles });
  } finally { await release(); }
}

/** Actual completed infrastructure output, independent of any later document publication or live parent turn. */
export async function readGitInitializationTaskBasis(root: string, input: { flowId: string; taskId?: string; runId?: string; sourceId?: string }): Promise<StoreRead<import("../abstract/trunk-store.ts").GitInitializationTaskBasis>> {
  const invalid = (message: string): StoreRead<never> => ({ ok: false, reason: "corrupt", message });
  try {
    const legacy = createFsTrunkStore(root, { legacyCommitProofOnly: true }), objects = createGitCandidateStore(root), identity = await objects.inspect();
    const records = (await listGitInitializationRecords(root)).filter(record => record.flowId === input.flowId && record.stage === "candidate-created" && record.repoId === identity.repoId
      && (!input.taskId || record.taskId === input.taskId) && (!input.runId || record.runId === input.runId) && (!input.sourceId || record.sourceId === input.sourceId));
    if (records.length !== 1) return invalid("unique-real-initialization-task-output-unavailable");
    const record = records[0]!, source = await legacy.readInitializationSource!(record.sourceId);
    if (!source.ok || source.value.sha256 !== record.sourceSha256) return invalid("initialization-source-proof-unavailable");
    const value: unknown = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8"));
    if (!value || typeof value !== "object" || !("projectRoot" in value) || value.projectRoot !== identity.root || !("flowId" in value) || value.flowId !== input.flowId) return invalid("initialization-source-root-flow-mismatch");
    const parent = "parent" in value && value.parent && typeof value.parent === "object" ? value.parent : undefined;
    if (!parent || !("sessionId" in parent) || typeof parent.sessionId !== "string" || !parent.sessionId) return invalid("initialization-source-core-binding-unavailable");
    const files: CompleteSnapshot["files"][number][] = [{ path: source.value.path, sha256: source.value.sha256, bytesBase64: source.value.bytesBase64 }];
    for (const file of [`.ans/trunk/operations/${hash(record.operationId)}/init.json`, ".ans/git-init-process.json"]) {
      const bytes = await legacy.readProjectFile!(file, { maxBytes: 64 * 1024 }); if (!bytes.ok) return invalid("initialization-output-bytes-unavailable"); files.push({ path: file, ...bytes.value });
    }
    const process: unknown = JSON.parse(Buffer.from(files.at(-1)!.bytesBase64, "base64").toString("utf8"));
    if (!process || typeof process !== "object" || !("operationId" in process) || process.operationId !== record.operationId || !("termination" in process) || process.termination !== "exited" || !("exitCode" in process) || process.exitCode !== 0) return invalid("initialization-process-not-proven-settled");
    const ref = await objects.readRef(`refs/ans/candidates/${hash(record.operationId)}`), commit = record.candidate ? await objects.readCommit(record.candidate) : undefined;
    if (!commit || JSON.stringify(ref) !== JSON.stringify(record.candidate) || JSON.stringify(commit.tree) !== JSON.stringify(record.tree) || commit.parents.length || (await objects.listTree(commit.candidate)).length) return invalid("initial-empty-candidate-proof-unavailable");
    return { ok: true, value: { repoId: identity.repoId, flowId: record.flowId, taskId: record.taskId, runId: record.runId,
      initializationOperationId: record.operationId, sourceId: record.sourceId, sourceSha256: record.sourceSha256, parentCoreSessionId: parent.sessionId, initialCandidate: commit.candidate, tree: commit.tree, files } };
  } catch (error) { return invalid(String(error)); }
}
export async function appendGitInitializationTaskEvent(root: string, event: import("../../../model/runtime.ts").TaskClosedEvent, input: {
  basis: Omit<import("../abstract/trunk-store.ts").GitInitializationTaskBasis, "files">;
  expectedFiles: readonly { path: string; sha256: string }[];
  expectedTask: { taskId: string; digest: string }; expectedRun: { runId: string; sha256: string };
}) {
  const release = await acquireVersionLock(root);
  try {
    const current = await readGitInitializationTaskBasis(root, input.basis);
    if (!current.ok) return { ok: false as const, reason: "initialization-output-cas-conflict" };
    const { files, ...binding } = current.value; void files;
    if (JSON.stringify(binding) !== JSON.stringify(input.basis) || event.taskId !== input.basis.taskId) return { ok: false as const, reason: "initialization-output-cas-conflict" };
    return await appendTaskLedgerEvent(root, event, { expectedTask: input.expectedTask, expectedRun: input.expectedRun,
      expectedFiles: input.expectedFiles, heldLockToken: release.token });
  } finally { await release(); }
}

/** Full TrunkStore semantics over one ref. readOnly is a restriction, never an authorization proof. */
export function createGitTrunkStore(root: string, options: { readOnly?: boolean; migrationOperationId?: string; documentMutation?: GitDocumentMutationScope } = {}): TrunkStore {
  const scope = options.documentMutation === undefined ? undefined : structuredClone(options.documentMutation);
  const leaseValid = () => !scope || checkGitHostAction({ projectRoot: root, leaseId: scope.hostLeaseId, kind: "git-mutation" }).ok;
  const legacy = createFsTrunkStore(root, { legacyCommitProofOnly: true }), objects = createGitCandidateStore(root), operations = createGitRefStore(root, scope ? { hostLeaseId: scope.hostLeaseId } : undefined);
  const missing = <T>(): StoreRead<T> => ({ ok: false, reason: "missing" });
  const invalid = <T>(message: string): StoreRead<T> => ({ ok: false, reason: "corrupt", message });
  const denied = (): StoreWrite => ({ ok: false, code: "invalid", message: "git-mutation-lease-unproven" });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
  const manifestPath = ".ans/trunk/manifest.json", snapshotPath = (ref: SnapshotRef) => `.ans/trunk/snapshots/${ref.snapshotId}.json`;
  async function visibleOid(): Promise<GitOid | null> {
    const current = await objects.readRef("refs/ans/trunk"); if (!current) return null;
    const identity = await objects.inspect(), journals = await operations.listJournals();
    const proof = journals.find(journal => journal.phase !== "business-prepared" && journal.repoId === identity.repoId && journal.ref === "refs/ans/trunk"
      && journal.newOid.hex === current.hex && journal.process?.termination === "exited");
    if (!proof || proof.phase === "business-prepared") throw new Error("git-visible-ref-commit-proof-unavailable");
    const commit = await objects.readCommit(current);
    if (JSON.stringify([commit.tree, commit.parents]) !== JSON.stringify([proof.tree, proof.parents])) throw new Error("git-visible-object-proof-mismatch");
    return current;
  }
  async function jsonAt<T>(oid: GitOid, file: string, validate: (value: unknown) => value is T): Promise<StoreRead<T>> {
    try { const blob = await objects.readBlob(oid, file), value: unknown = JSON.parse(Buffer.from(blob.bytesBase64, "base64").toString("utf8"));
      return validate(value) ? { ok: true, value } : invalid("git-stored-shape-invalid");
    } catch (error) { return invalid(String(error)); }
  }
  async function readSnapshot(ref: SnapshotRef): Promise<StoreRead<CompleteSnapshot>> {
    if (!isSnapshotRef(ref)) return invalid("snapshot-ref-invalid");
    try { const oid = await visibleOid();
      if (oid) { const entries = await objects.listTree(oid);
        if (entries.some(entry => entry.path === snapshotPath(ref))) { const found = await jsonAt(oid, snapshotPath(ref), isStoredCompleteSnapshot);
          return found.ok && found.value.digest !== ref.digest ? invalid("git-snapshot-digest-mismatch") : found; }
      }
      // Only real immutable legacy/staged snapshots, never live artifact reconstruction.
      return legacy.readSnapshot!(ref);
    } catch (error) { return invalid(String(error)); }
  }
  async function verify(manifest: TrunkManifest): Promise<StoreRead<TrunkManifest>> {
    if (!manifest.snapshotRef) return invalid("git-manifest-needs-complete-snapshot");
    const snapshot = await readSnapshot(manifest.snapshotRef); if (!snapshot.ok) return snapshot;
    if (!artifactRefs(manifest).every(ref => snapshot.value.files.some(file => file.path === ref.path.split("#")[0] && file.sha256 === ref.sha256.toLowerCase()))) return invalid("git-manifest-closure-incomplete");
    for (const [roleId, evidence] of [...Object.entries(manifest.activeRoles ?? {}), ...Object.entries(manifest.frozenRoles ?? {})]) {
      if (evidence.roleId !== roleId) return invalid("git-role-identity-invalid");
      const frozen = await roleBytes(evidence); if (!frozen.ok) return frozen;
    }
    return { ok: true, value: manifest };
  }
  async function roleBytes(evidence: import("../../../model/trunk.ts").ActiveRoleEvidence): Promise<StoreRead<CompleteSnapshot>> {
    if (!isActiveRoleEvidence(evidence)) return invalid("role-evidence-invalid");
    const read = await readSnapshot(evidence.snapshotRef); if (!read.ok) return read;
    return FROZEN_ROLE_REF_KEYS.every(key => evidence[key].snapshotId === evidence.snapshotRef.snapshotId
      && read.value.files.some(file => file.path === evidence[key].path && file.sha256 === evidence[key].sha256.toLowerCase())) ? read : invalid("role-frozen-bytes-incomplete");
  }
  async function readManifest(): Promise<StoreRead<TrunkManifest>> {
    try { const oid = await visibleOid(); if (!oid) return missing(); const value = await jsonAt(oid, manifestPath, isTrunkManifestShape); return value.ok ? verify(value.value) : value; }
    catch (error) { return invalid(String(error)); }
  }
  const matches = (manifest: TrunkManifest, ref: TrunkCommitRef, snapshot?: SnapshotRef) => manifest.trunkVersion === ref.version && manifest.digest === ref.digest
    && (snapshot === undefined || JSON.stringify(manifest.snapshotRef) === JSON.stringify(snapshot));
  const documentJournalBinding = (journal: GitRefJournal) => {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)])) : value;
    const { phase, businessJournal, ...binding } = journal; void phase;
    if (!businessJournal) return hash(JSON.stringify(canonical(binding)));
    const { phase: businessPhase, updatedAt, result, ...business } = businessJournal; void businessPhase; void updatedAt; void result;
    return hash(JSON.stringify(canonical({ ...binding, businessJournal: business })));
  };
  async function historicalRefProof(ref: string, oid: GitOid, operationId?: string): Promise<StoreRead<import("../abstract/trunk-store.ts").GitCandidateEvidence>> {
    const identity = await objects.inspect(), matches = (await operations.listJournals()).filter(row => row.phase !== "business-prepared" && row.ref === ref && row.repoId === identity.repoId
      && row.process?.termination === "exited" && row.process.exitCode === 0 && JSON.stringify(row.newOid) === JSON.stringify(oid) && (operationId === undefined || row.operationId === operationId));
    if (matches.length !== 1 || matches[0]?.phase === "business-prepared") return invalid("git-historical-ref-source-unavailable");
    const journal = matches[0], commit = await objects.readCommit(oid);
    if (JSON.stringify([commit.tree, commit.parents]) !== JSON.stringify([journal.tree, journal.parents])) return invalid("git-historical-ref-object-conflict");
    const file = `.ans/trunk/operations/${hash(journal.operationId)}/git.json`, bytes = await legacy.readProjectFile!(file, { maxBytes: 2 * 1024 * 1024 });
    if (!bytes.ok || JSON.stringify(JSON.parse(Buffer.from(bytes.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(journal)) return invalid("git-historical-journal-conflict");
    return { ok: true, value: { journal, commit, journalFile: { path: file, ...bytes.value } } };
  }
  async function verifyExecutionBases(bases: import("../abstract/trunk-store.ts").GitExecutionBases): Promise<StoreRead<import("../abstract/trunk-store.ts").GitExecutionBases>> {
    try {
      if (!isRunGitBases(bases)) return invalid("git-run-independent-bases-invalid");
      const document = await historicalRefProof(bases.documentGitBasis.ref, bases.documentGitBasis.oid!); if (!document.ok) return document;
      const source = bases.codeBasisSource, code = await historicalRefProof(bases.codeBasis.ref, bases.codeBasis.oid!, source.operationId);
      if (!code.ok || (source.kind === "delivery-ref" ? code.value.journalFile.sha256 !== source.journalSha256 : documentJournalBinding(code.value.journal) !== source.journalBindingSha256)) return invalid("git-run-code-source-conflict");
      if (source.kind === "delivery-ref") {
        const delivery = code.value.journal.deliverySource;
        if (!delivery || delivery.flowId !== source.sourceFlowId || delivery.runId !== source.sourceRunId || delivery.taskId !== source.controllerTaskId) return invalid("git-run-delivery-source-conflict");
        const original = await readGitCandidateEvidence(root, delivery.candidateOperationId, bases.codeBasis.oid!);
        const integration = original.ok ? original.value.journal.candidateSource : undefined;
        if (!original.ok || original.value.journalFile.sha256 !== delivery.candidateJournalSha256 || (integration?.kind !== "run-integration" && integration?.kind !== "run-revert")
          || integration.taskId !== delivery.taskId || integration.runId !== delivery.runId || integration.flowId !== delivery.flowId) return invalid("git-run-delivery-candidate-source-conflict");
      } else {
        const manifest = await jsonAt(bases.documentGitBasis.oid!, manifestPath, isTrunkManifestShape);
        if (!manifest.ok || manifest.value.flowId !== source.sourceFlowId) return invalid("git-run-document-source-conflict");
      }
      return { ok: true, value: structuredClone(bases) };
    } catch (error) { return invalid(String(error)); }
  }
  async function readExecutionBases(expected: { trunk: TrunkCommitRef; active: import("../abstract/trunk-store.ts").ActiveCommitRef; snapshot?: SnapshotRef }): Promise<StoreRead<import("../abstract/trunk-store.ts").GitExecutionBases>> {
    try {
      const oid = await visibleOid(); if (!oid) return invalid("git-code-basis-ref-unavailable");
      const current = await readManifest();
      if (!current.ok || !matches(current.value, expected.trunk) || (current.value.activeRevision ?? 0) !== expected.active.revision
        || (current.value.activeDigest ?? null) !== expected.active.digest || !expected.snapshot || JSON.stringify(current.value.snapshotRef) !== JSON.stringify(expected.snapshot))
        return invalid("git-code-basis-document-active-conflict");
      const document = await historicalRefProof("refs/ans/trunk", oid); if (!document.ok) return document;
      const refs = await objects.listDeliveryRefs(), deliveries: Array<{ ref: string; proof: import("../abstract/trunk-store.ts").GitCandidateEvidence }> = [];
      for (const ref of refs) {
        const proof = await historicalRefProof(ref.ref, ref.oid); if (!proof.ok) return proof;
        const settled = await readGitDeliveryEvidence(root, proof.value.journal.operationId); if (!settled.ok) return settled;
        deliveries.push({ ref: ref.ref, proof: settled.value });
      }
      let bases: import("../abstract/trunk-store.ts").GitExecutionBases = { codeBasis: { ref: "refs/ans/trunk", oid }, documentGitBasis: { ref: "refs/ans/trunk", oid },
        codeBasisSource: { kind: "document-ref", operationId: document.value.journal.operationId, journalBindingSha256: documentJournalBinding(document.value.journal), sourceFlowId: current.value.flowId } };
      if (deliveries.length) {
        const commits = new Map<string, import("../abstract/trunk-store.ts").GitStoredCommit>();
        const ancestor = async (from: GitOid, to: GitOid) => {
          const queue = [to], visited = new Set<string>();
          while (queue.length) { const next = queue.pop()!; if (next.hex === from.hex) return true; if (visited.has(next.hex)) continue; visited.add(next.hex);
            if (visited.size > 2048 || commits.size > 2048) throw new Error("git-delivery-ancestry-budget");
            let commit = commits.get(next.hex); if (!commit) { commit = await objects.readCommit(next); commits.set(next.hex, commit); } queue.push(...commit.parents); }
          return false;
        };
        const heads = [...new Map(deliveries.map(row => [row.proof.commit.candidate.hex, row])).values()], maximal = [];
        for (const head of heads) { let all = true; for (const other of heads) if (!await ancestor(other.proof.commit.candidate, head.proof.commit.candidate)) { all = false; break; } if (all) maximal.push(head); }
        if (maximal.length !== 1) return invalid("git-delivery-code-heads-ambiguous");
        const chosen = maximal[0]!, source = chosen.proof.journal.deliverySource!;
        bases = { codeBasis: { ref: chosen.ref, oid: chosen.proof.commit.candidate }, documentGitBasis: { ref: "refs/ans/trunk", oid },
          codeBasisSource: { kind: "delivery-ref", operationId: chosen.proof.journal.operationId, journalSha256: chosen.proof.journalFile.sha256,
            sourceFlowId: source.flowId, sourceRunId: source.runId, controllerTaskId: source.taskId } };
      }
      if (JSON.stringify(await objects.listDeliveryRefs()) !== JSON.stringify(refs) || JSON.stringify(await visibleOid()) !== JSON.stringify(oid)) return invalid("git-run-git-sources-changed");
      return verifyExecutionBases(bases);
    } catch (error) { return invalid(String(error)); }
  }
  async function findManifest(ref: TrunkCommitRef, snapshot?: SnapshotRef): Promise<StoreRead<TrunkManifest>> {
    try { let oid = await visibleOid(), visited = 0;
      while (oid && visited++ < 256) { const read = await jsonAt(oid, manifestPath, isTrunkManifestShape); if (!read.ok) return read;
        if (matches(read.value, ref, snapshot)) return verify(read.value);
        const commit = await objects.readCommit(oid); if (commit.parents.length > 1) return invalid("git-trunk-successor-chain-ambiguous"); oid = commit.parents[0] ?? null;
      }
      return missing();
    } catch (error) { return invalid(String(error)); }
  }
  async function readOperation(operationId: string): Promise<StoreRead<TrunkApplyJournal>> {
    try { const git = await operations.readJournal(operationId);
      if (git) return git.businessJournal ? { ok: true, value: git.businessJournal } : invalid("git-operation-is-not-business-journal");
      return legacy.readOperation!(operationId);
    } catch (error) { return invalid(String(error)); }
  }
  async function readOperationCommit(journal: TrunkApplyJournal): Promise<StoreRead<TrunkManifest>> {
    if (!journal.operationId || journal.actionSource?.kind !== "role-direct") return invalid("operation-identity-required");
    const ref = { version: journal.target.trunkVersion, digest: journal.actionSource.targetDigest };
    const git = await operations.readJournal(journal.operationId);
    if (!git) return legacy.readManifestAt!(ref, journal.actionSource.baseDigest === journal.actionSource.targetDigest ? undefined : journal.targetSnapshot);
    if (git.requestDigest !== gitBusinessRequestDigest(journal)) return invalid("git-operation-request-mismatch");
    if (git.phase === "business-prepared") return journal.actionSource.baseDigest === journal.actionSource.targetDigest ? findManifest(ref) : missing();
    if (git.process?.termination !== "exited") return invalid("git-operation-process-unknown");
    // Prove ancestry from the effective ref, never from phase or a raw JSON projection.
    let oid = await visibleOid(), count = 0;
    while (oid && count++ < 256) { if (oid.hex === git.newOid.hex) { const value = await jsonAt(oid, manifestPath, isTrunkManifestShape); return value.ok ? verify(value.value) : value; }
      const commit = await objects.readCommit(oid); if (commit.parents.length > 1) return invalid("git-successor-chain-ambiguous"); oid = commit.parents[0] ?? null; }
    return missing();
  }
  async function readCommittedFreezeBasis(journal: TrunkApplyJournal): Promise<StoreRead<import("../../version-change/public/version-change-store.ts").CommittedFreezeBasis>> {
    const release = await acquireVersionLock(root);
    try {
      const source = journal.actionSource;
      if (!journal.operationId || source?.kind !== "role-direct" || !journal.targetSnapshot || source.operationId !== journal.operationId)
        return invalid("committed-freeze-source-invalid");
      const rel = `.ans/trunk/operations/${hash(journal.operationId)}/git.json`, before = await legacy.readProjectFile!(rel, { maxBytes: 2 * 1024 * 1024 });
      const git = await operations.readJournal(journal.operationId);
      if (!before.ok || !git || git.phase !== "published" || git.process?.termination !== "exited" || git.process.exitCode !== 0
        || git.requestDigest !== gitBusinessRequestDigest(journal) || JSON.stringify(git.businessJournal?.actionSource) !== JSON.stringify(source)
        || JSON.stringify(git.businessJournal?.targetSnapshot) !== JSON.stringify(journal.targetSnapshot)) return invalid("committed-freeze-operation-unproven");
      // This performs the original native effective-ref ancestry, manifest and complete-snapshot verification.
      const committed = await readOperationCommit(journal), repo = await objects.inspect(), bytes = await objects.readCommitBytes(git.newOid);
      if (!committed.ok || committed.value.digest !== source.targetDigest || JSON.stringify(committed.value.snapshotRef) !== JSON.stringify(journal.targetSnapshot)
        || JSON.stringify(committed.value.actionSource) !== JSON.stringify(source)) return invalid("committed-freeze-ref-source-unproven");
      const after = await legacy.readProjectFile!(rel, { maxBytes: 2 * 1024 * 1024 });
      if (!after.ok || after.value.sha256 !== before.value.sha256 || !await ownsVersionLock(root, release.token)) return invalid("committed-freeze-operation-changed");
      return { ok: true, value: { projectRoot: repo.root, operationId: journal.operationId, operationFile: { path: rel, sha256: after.value.sha256 },
        source, snapshotRef: journal.targetSnapshot, commit: git.newOid, commitBytesBase64: bytes.bytesBase64 } };
    } catch (error) { return invalid(String(error)); } finally { await release(); }
  }
  async function finalizeCommittedMetadata(journal: TrunkApplyJournal, proof: import("../../version-change/public/version-change-store.ts").CommittedFreezeBasis): Promise<StoreWrite> {
    const release = await acquireVersionLock(root);
    const rejected = (message: string): StoreWrite => ({ ok: false, code: "invalid", message });
    try {
      if (!isTrunkApplyJournalShape(journal) || journal.operationId !== proof.operationId || journal.phase !== "committed" || journal.result !== "committed"
        || !Number.isFinite(Date.parse(journal.updatedAt)) || JSON.stringify(journal.actionSource) !== JSON.stringify(proof.source)
        || JSON.stringify(journal.targetSnapshot) !== JSON.stringify(proof.snapshotRef)) return rejected("committed-metadata-source-invalid");
      const commitBytes = Buffer.from(proof.commitBytesBase64, "base64");
      if (commitBytes.toString("base64") !== proof.commitBytesBase64 || createHash(proof.commit.objectFormat).update(Buffer.from(`commit ${commitBytes.length}\0`)).update(commitBytes).digest("hex") !== proof.commit.hex)
        return rejected("committed-metadata-object-proof-invalid");
      const file = `.ans/trunk/operations/${hash(proof.operationId)}/git.json`, actual = await legacy.readProjectFile!(file, { maxBytes: 2 * 1024 * 1024 });
      const prior = await operations.readJournal(proof.operationId), identity = await objects.inspect();
      if (identity.root !== proof.projectRoot || proof.operationFile.path !== file || !actual.ok || actual.value.sha256 !== proof.operationFile.sha256
        || !prior || prior.phase !== "published" || prior.process?.termination !== "exited" || prior.process.exitCode !== 0 || !prior.businessJournal
        || JSON.stringify(prior.newOid) !== JSON.stringify(proof.commit)) return rejected("committed-metadata-operation-changed");
      const unchanged = (value: TrunkApplyJournal) => { const { phase, result, updatedAt, ...rest } = value; void phase; void result; void updatedAt; return rest; };
      if (JSON.stringify(unchanged(prior.businessJournal)) !== JSON.stringify(unchanged(journal)) || Date.parse(journal.updatedAt) < Date.parse(prior.businessJournal.updatedAt)) return rejected("committed-metadata-cannot-change-business-basis");
      const committed = await readOperationCommit(journal);
      if (!committed.ok || committed.value.digest !== proof.source.targetDigest) return rejected("committed-metadata-ref-unproven");
      const baselines = await readVersionBaselineState(root);
      if (baselines.text === null) return rejected("committed-metadata-freeze-history-missing");
      const records: unknown[] = baselines.text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      const before = prior.businessJournal.before.documents;
      for (const [key, ref] of Object.entries(prior.businessJournal.target.documents)) {
        if (JSON.stringify(before[key as keyof typeof before] ?? null) === JSON.stringify(ref)) continue;
        if (!records.some(row => row && typeof row === "object" && "event" in row && row.event === "frozen" && "version" in row
          && typeof row.version === "number" && "path" in row && typeof row.path === "string" && (/-v\d+\.md$/i.test(row.path) ? row.path : `${row.path}-v${row.version}.md`) === ref.path
          && "sha256" in row && row.sha256 === ref.sha256 && "freeze" in row && row.freeze && typeof row.freeze === "object"
          && "origin" in row.freeze && row.freeze.origin === "role-direct" && "reason" in row.freeze && row.freeze.reason === "role-direct-applied"
          && "source" in row.freeze && JSON.stringify(row.freeze.source) === JSON.stringify(proof.source)
          && "snapshotRef" in row.freeze && JSON.stringify(row.freeze.snapshotRef) === JSON.stringify(proof.snapshotRef))) return rejected("committed-metadata-effect-freeze-unproven");
      }
      if (!await ownsVersionLock(root, release.token)) return rejected("committed-metadata-fence-lost");
      // Only this exact existing journal's settlement fields may advance. No ref, object, manifest or task changes.
      return await createGitRefStore(root, { heldLockToken: release.token }).writeBusinessJournal(journal);
    } catch (error) { return rejected(String(error)); } finally { await release(); }
  }
  async function materializeManifestFiles(next: TrunkManifest, previous: TrunkManifest | undefined, oldOid: GitOid | null, activeOnly = false): Promise<StoreRead<readonly { path: string; bytesBase64: string }[]>> {
    const valid = await verify(next); if (!valid.ok) return { ok: false, reason: "corrupt", message: valid.message ?? valid.reason };
    const files = new Map<string, { path: string; bytesBase64: string }>();
    const snapshots = new Map<string, CompleteSnapshot>();
    for (const ref of [next.snapshotRef!, ...Object.values(next.activeRoles ?? {}).map(value => value.snapshotRef), ...Object.values(next.frozenRoles ?? {}).map(value => value.snapshotRef)]) {
      const read = await readSnapshot(ref); if (!read.ok) return { ok: false, reason: "corrupt", message: read.message ?? read.reason }; snapshots.set(ref.snapshotId, read.value);
    }
    const doc = snapshots.get(next.snapshotRef!.snapshotId)!;
    for (const file of doc.files) files.set(file.path, { path: file.path, bytesBase64: file.bytesBase64 });
    for (const snapshot of snapshots.values()) files.set(snapshotPath(snapshot), { path: snapshotPath(snapshot), bytesBase64: encode(snapshot) });
    files.set(manifestPath, { path: manifestPath, bytesBase64: encode(next) });
    if (activeOnly) for (const evidence of Object.values(next.activeRoles ?? {})) {
      const active = snapshots.get(evidence.snapshotRef.snapshotId)!;
      for (const key of ["cardRef", "boundaryMdRef", "boundaryYamlRef", "d3Ref", "activationRef", "authorizationRef"] as const) {
        const ref = evidence[key], file = active.files.find(file => file.path === ref.path && file.sha256 === ref.sha256);
        if (!file) return invalid("active-target-bytes-missing");
        files.set(file.path, { path: file.path, bytesBase64: file.bytesBase64 });
      }
    }
    if (previous && !activeOnly) { const archive = `.ans/trunk/history/manifest-v${previous.trunkVersion}.json`;
      if (!oldOid) return invalid("history-original-git-manifest-unavailable");
      if (!(await objects.listTree(oldOid)).some(entry => entry.path === archive)) {
        const original = await objects.readBlob(oldOid, manifestPath);
        files.set(archive, { path: archive, bytesBase64: original.bytesBase64 });
      }
    }
    return { ok: true, value: [...files.values()] };
  }
  async function commitManifest(next: TrunkManifest, previous: TrunkManifest | undefined, oldOid: GitOid | null, operationId?: string, heldLockToken?: string): Promise<ManifestCasResult> {
    if (options.readOnly) return denied();
    const activeOnly = scope?.activeTarget !== undefined || (previous !== undefined && JSON.stringify(previous.snapshotRef) === JSON.stringify(next.snapshotRef) && previous.activeDigest !== next.activeDigest);
    const materialized = await materializeManifestFiles(next, previous, oldOid, activeOnly);
    if (!materialized.ok) return { ok: false, code: "invalid", message: materialized.message ?? materialized.reason };
    const files = materialized.value;
    let business: TrunkApplyJournal | undefined;
    for (const record of await operations.listJournals()) if (record.businessJournal && record.businessJournal.targetSnapshot?.digest === next.snapshotRef?.digest
      && record.businessJournal.actionSource?.kind === "role-direct" && record.businessJournal.actionSource.targetDigest === next.digest) { if (business && business.operationId !== record.operationId) return { ok: false, code: "invalid", message: "git-business-operation-ambiguous" }; business = record.businessJournal; }
    if (operationId) { const read = await readOperation(operationId); if (read.ok) business = read.value; }
    const id = business?.operationId ?? operationId ?? (!oldOid ? options.migrationOperationId : undefined) ?? `git-cas-${hash(JSON.stringify([oldOid, next]))}`;
    const requestDigest = business ? gitBusinessRequestDigest(business) : hash(JSON.stringify([oldOid, next]));
    const legacyBasis = !oldOid && options.migrationOperationId ? await legacy.readProjectFile!(manifestPath) : undefined;
    if (legacyBasis && !legacyBasis.ok) return { ok: false, code: "invalid", message: "legacy-migration-basis-unavailable" };
    if (legacyBasis?.ok && JSON.stringify(JSON.parse(Buffer.from(legacyBasis.value.bytesBase64, "base64").toString("utf8"))) !== JSON.stringify(next)) return { ok: false, code: "conflict", message: "legacy-migration-target-is-stale" };
    if (scope && (!leaseValid() || id !== scope.operationId || business === undefined || gitBusinessRequestDigest(business) !== scope.journalDigest)) return denied();
    const prepared = await objects.prepare({ operationId: id, base: oldOid, files, message: `ANS trunk ${next.trunkVersion} ${next.digest}`,
      ...(scope ? { timestamp: next.updatedAt } : {}) }, undefined, scope?.hostLeaseId);
    if (scope?.plannedCommit && JSON.stringify(prepared) !== JSON.stringify(scope.plannedCommit.commit)) return { ok: false, code: "invalid", message: "git-planned-candidate-readback-mismatch" };
    const publishing = heldLockToken ? createGitRefStore(root, { heldLockToken, ...(scope ? { hostLeaseId: scope.hostLeaseId } : {}) }) : operations;
    const identity = await objects.inspect(), result = await publishing.publish({ operationId: id, repoId: identity.repoId, ref: "refs/ans/trunk", oldOid,
      newOid: prepared.candidate, tree: prepared.tree, parents: prepared.parents, requestDigest, ...(business ? { businessJournal: business } : {}),
      ...(scope?.publicationTask ? { publicationTask: scope.publicationTask } : {}),
      ...(legacyBasis?.ok ? { legacyManifestSha256: legacyBasis.value.sha256 } : {}) });
    if (result.status !== "published") return { ok: false, code: result.status === "conflict" ? "conflict" : "io", message: `${result.status}:${result.journalId}:${result.message ?? ""}` };
    // Compatibility routing only: the verified ref/journal remains the sole effective pointer.
    try { await atomicWrite(path.join(root, ".ans/trunk/git-mode.json"), JSON.stringify({ media: "git-ref/v1", repoId: identity.repoId, ref: "refs/ans/trunk", journalId: result.journalId })); }
    catch (error) { return { ok: false, code: "io", message: `committed-pending-recovery:${result.journalId}:${String(error)}` }; }
    return { ok: true };
  }
  return { ...legacy, readManifest, readSnapshot, readOperation, readOperationCommit, readCommittedFreezeBasis, finalizeCommittedMetadata,
    async planDocumentCommit(input) {
      const { manifest: next, journal, expectedBase } = input;
      try {
        const source = journal.actionSource;
        if (source?.kind !== "role-direct" || !journal.targetSnapshot || JSON.stringify(source) !== JSON.stringify(next.actionSource)
          || JSON.stringify(journal.targetSnapshot) !== JSON.stringify(next.snapshotRef)) return invalid("git-document-plan-source-invalid");
        const base = await visibleOid(), current = base ? await jsonAt(base, manifestPath, isTrunkManifestShape) : missing<TrunkManifest>();
        if (expectedBase === null ? current.ok || current.reason !== "missing" : !current.ok || !matches(current.value, expectedBase)) return invalid("git-document-plan-base-stale");
        const files = await materializeManifestFiles(next, current.ok ? current.value : undefined, base); if (!files.ok) return files;
        const repo = await objects.inspect(), candidate = await objects.plan({ operationId: source.operationId, base, files: files.value,
          message: `ANS trunk ${next.trunkVersion} ${next.digest}`, timestamp: next.updatedAt });
        const metadata = files.value.map(file => {
          const bytes = Buffer.from(file.bytesBase64, "base64"), kind = file.path === manifestPath ? "manifest" as const
            : file.path.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" as const : file.path.startsWith(".ans/trunk/history/") ? "history" as const
            : file.path.startsWith(".ans/") ? "frozen-application-evidence" as const : "snapshot-content" as const;
          return { path: file.path, kind, sha256: createHash("sha256").update(bytes).digest("hex"), oid: { objectFormat: repo.objectFormat,
            hex: createHash(repo.objectFormat).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex") } };
        });
        const baseManifest = base ? await objects.readBlob(base, manifestPath) : undefined;
        return { ok: true, value: { repo, base, candidate, publicationCommand: gitCommandArgv(["update-ref", "--no-deref", "refs/ans/trunk", candidate.commit.candidate.hex, base?.hex ?? "0".repeat(repo.objectFormat === "sha1" ? 40 : 64)]),
          ...(baseManifest ? { baseManifestBytesBase64: baseManifest.bytesBase64 } : {}), files: metadata, manifestSha256: hash(JSON.stringify(next)), journalDigest: gitBusinessRequestDigest(journal),
          publication: { kind: "direct-document-publication", flowId: next.flowId, operationId: source.operationId, actorRoleId: source.actorRoleId, applicationId: source.applicationId,
            action: source.action, snapshot: journal.targetSnapshot, documents: next.artifacts.documents, execution: next.artifacts.execution } } };
      } catch (error) { return invalid(String(error)); }
    },
    async planInitialWorkflowCommit(input) {
      try {
        const { manifest: next, journal, source, record, permit } = input;
        const base = await visibleOid(), current = base ? await jsonAt(base, manifestPath, isTrunkManifestShape) : missing<TrunkManifest>();
        if (!current.ok || !matches(current.value, source.documentCommit, source.documentSnapshot) || journal.actionSource !== undefined
          || journal.operationId !== source.operationId || !next.snapshotRef || JSON.stringify(journal.targetSnapshot) !== JSON.stringify(next.snapshotRef)) return invalid("git-initial-workflow-plan-basis-invalid");
        const files = await materializeManifestFiles(next, current.value, base); if (!files.ok) return files;
        const repo = await objects.inspect(), candidate = await objects.plan({ operationId: source.operationId, base, files: files.value,
          message: `ANS trunk ${next.trunkVersion} ${next.digest}`, timestamp: next.updatedAt });
        const metadata = files.value.map(file => {
          const bytes = Buffer.from(file.bytesBase64, "base64"), kind = file.path === manifestPath ? "manifest" as const
            : file.path.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" as const : file.path.startsWith(".ans/trunk/history/") ? "history" as const
            : file.path.startsWith(".ans/") ? "frozen-application-evidence" as const : "snapshot-content" as const;
          return { path: file.path, kind, sha256: createHash("sha256").update(bytes).digest("hex"), oid: { objectFormat: repo.objectFormat,
            hex: createHash(repo.objectFormat).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex") } };
        });
        const original = await objects.readBlob(base!, manifestPath);
        return { ok: true, value: { repo, base, candidate, baseManifestBytesBase64: original.bytesBase64,
          publicationCommand: gitCommandArgv(["update-ref", "--no-deref", "refs/ans/trunk", candidate.commit.candidate.hex, base!.hex]),
          files: metadata, manifestSha256: hash(JSON.stringify(next)), journalDigest: gitBusinessRequestDigest(journal),
          publication: { kind: "stable-initial-workflow-publication", flowId: next.flowId, operationId: source.operationId, actorRoleId: "convener",
            snapshot: next.snapshotRef, documentSnapshot: source.documentSnapshot, source, record, permit, documents: next.artifacts.documents, execution: next.artifacts.execution } } };
      } catch (error) { return invalid(String(error)); }
    },
    async planActiveCommit(input) {
      try {
        const { manifest: next, journal, expectedBase, expectedActive, targetRoleId } = input, source = journal.actionSource;
        if (source?.kind !== "role-direct" || source.action !== "activate-role-documents" || !journal.targetSnapshot || !next.snapshotRef
          || next.activeRevision === undefined || !next.activeDigest || !next.activeRoles?.[targetRoleId]
          || JSON.stringify(next.activeRoles[targetRoleId].snapshotRef) !== JSON.stringify(journal.targetSnapshot)) return invalid("git-active-plan-source-invalid");
        const base = await visibleOid(), current = base ? await jsonAt(base, manifestPath, isTrunkManifestShape) : missing<TrunkManifest>();
        if (!current.ok || !matches(current.value, expectedBase) || (current.value.activeRevision ?? 0) !== expectedActive.revision
          || (current.value.activeDigest ?? null) !== expectedActive.digest) return invalid("git-active-plan-base-stale");
        const { activeRoles: _oldRoles, activeRevision: _oldRevision, activeDigest: _oldDigest, ...oldDoc } = current.value;
        const { activeRoles: _roles, activeRevision: _revision, activeDigest: _digest, ...newDoc } = next;
        if (JSON.stringify(oldDoc) !== JSON.stringify(newDoc)) return invalid("git-active-plan-changes-document");
        const files = await materializeManifestFiles(next, current.value, base, true); if (!files.ok) return files;
        const repo = await objects.inspect(), candidate = await objects.plan({ operationId: source.operationId, base, files: files.value,
          message: `ANS trunk ${next.trunkVersion} ${next.digest}`, timestamp: next.updatedAt });
        const metadata = files.value.map(file => {
          const bytes = Buffer.from(file.bytesBase64, "base64"), kind = file.path === manifestPath ? "manifest" as const
            : file.path.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" as const : file.path.startsWith(".ans/trunk/history/") ? "history" as const
            : file.path.startsWith(".ans/") ? "frozen-application-evidence" as const : "snapshot-content" as const;
          return { path: file.path, kind, sha256: createHash("sha256").update(bytes).digest("hex"), oid: { objectFormat: repo.objectFormat,
            hex: createHash(repo.objectFormat).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex") } };
        });
        const original = await objects.readBlob(base!, manifestPath);
        return { ok: true, value: { repo, base, candidate, baseManifestBytesBase64: original.bytesBase64,
          publicationCommand: gitCommandArgv(["update-ref", "--no-deref", "refs/ans/trunk", candidate.commit.candidate.hex, base!.hex]),
          files: metadata, manifestSha256: hash(JSON.stringify(next)), journalDigest: gitBusinessRequestDigest(journal),
          publication: { kind: "role-activation-publication", flowId: next.flowId, operationId: source.operationId, actorRoleId: source.actorRoleId,
            applicationId: source.applicationId, action: "activate-role-documents", snapshot: journal.targetSnapshot, documentSnapshot: next.snapshotRef,
            targetRoleId, expectedActive, targetActive: { revision: next.activeRevision, digest: next.activeDigest, roles: next.activeRoles },
            evidence: next.activeRoles[targetRoleId], documents: next.artifacts.documents, execution: next.artifacts.execution } } };
      } catch (error) { return invalid(String(error)); }
    },
    async readInitialGitPublicationBasis(flowId) {
      try {
        if (await objects.readRef("refs/ans/trunk")) return invalid("document-pointer-already-exists");
        const old = await legacy.readManifest(); if (old.ok || old.reason !== "missing") return invalid("legacy-document-basis-requires-migration");
        const completed = await readGitInitializationTaskBasis(root, { flowId });
        if (!completed.ok) return completed;
        const { repoId, initializationOperationId, sourceId, sourceSha256, parentCoreSessionId, initialCandidate } = completed.value;
        return { ok: true, value: { repoId, flowId, initializationOperationId, sourceId, sourceSha256, parentCoreSessionId, initialCandidate } };
      } catch (error) { return invalid(String(error)); }
    },
    async readCodeBasis(expected) {
      const bases = await readExecutionBases(expected); return bases.ok ? { ok: true, value: bases.value.codeBasis } : bases;
    },
    readExecutionBases, verifyExecutionBases,
    async commitRunTransition(input) {
      const release = await acquireVersionLock(root);
      try {
        const fresh = async () => {
          const lease = checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "git-mutation" });
          if (!lease.ok || lease.coordinatorRevision !== input.coordinatorRevision || !await ownsVersionLock(root, release.token)) return false;
          const ledger = await readOperationEvents(root);
          return ledger.ok && hash(JSON.stringify(ledger.records.map(row => row.value))) === input.ledgerDigest
            && (!input.runChangeSource || await checkRunChangeRequester(root, input.runChangeSource, String(input.old.value.flowId)) === undefined)
            && checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "git-mutation" }).ok;
        };
        const recordPath = async (id: string) => {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id)) throw new Error("run-transition-invalid-id");
          let dir = await realpath(root);
          for (const part of [".ans", "runs", id]) { dir = path.join(dir, part); const info = await lstat(dir);
            if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) throw new Error("run-transition-path-unproven"); }
          return path.join(dir, "manifest.json");
        };
        if (input.old.value.runId !== input.old.runId || input.old.value.state !== "cancelled" || input.replacement?.runId === input.old.runId)
          return { ok: false, code: "invalid", message: "run-transition-identities-invalid" };
        const oldPath = await recordPath(input.old.runId), old = await legacy.readRunRecord!(input.old.runId);
        const pending = structuredClone(input.old.value), changes = pending.directRunChanges;
        if (!Array.isArray(changes) || !changes.length || !changes.at(-1)?.receipt) return { ok: false, code: "invalid", message: "run-transition-source-missing" };
        const row = changes.at(-1), receipt = row.receipt;
        row.receipt = { ...receipt, ok: false, status: "committed-pending-recovery", errorCode: "run-transition-pending", message: "Actual old execution stopped; replacement/final acknowledgement requires readback" };
        if (!old.ok || (old.value.sha256 !== input.old.sha256 && JSON.stringify(old.value.value) !== JSON.stringify(pending)
          && JSON.stringify(old.value.value) !== JSON.stringify(input.old.value))) return { ok: false, code: "conflict", message: "run-transition-old-cas-conflict" };
        if (input.runChangeSource) {
          if (input.runChangeSource.oldRunId !== input.old.runId || input.runChangeSource.oldSha256 !== input.old.sha256) return { ok: false, code: "conflict", message: "run-transition-source-identity-conflict" };
          const error = await checkRunChangeRequester(root, input.runChangeSource, String(input.old.value.flowId)); if (error) return { ok: false, code: "conflict", message: error };
          if (input.replacement && JSON.stringify(input.replacement.value.runChangeSource) !== JSON.stringify(input.runChangeSource)) return { ok: false, code: "conflict", message: "run-transition-replacement-source-conflict" };
        }
        let nextPath: string | undefined;
        if (input.replacement) {
          const next = input.replacement; nextPath = await recordPath(next.runId);
          const current = await readManifest(), nextRecord = await legacy.readRunRecord!(next.runId);
          if (next.value.runId !== next.runId || next.value.state !== "pinned" || !nextRecord.ok
            || (nextRecord.value.sha256 !== next.sha256 && JSON.stringify(nextRecord.value.value) !== JSON.stringify(next.value))
            || !current.ok || !matches(current.value, next.trunk, next.snapshot)
            || (current.value.activeRevision ?? 0) !== next.active.revision || (current.value.activeDigest ?? null) !== next.active.digest)
            return { ok: false, code: "conflict", message: "run-transition-target-cas-conflict" };
          if (!next.gitBases) return { ok: false, code: "invalid", message: "run-transition-target-git-source-missing" };
          const actual = await readExecutionBases({ trunk: next.trunk, active: next.active, snapshot: next.snapshot });
          if (!actual.ok || JSON.stringify(actual.value) !== JSON.stringify(next.gitBases)) return { ok: false, code: "conflict", message: "run-transition-target-git-source-conflict" };
          if (next.sourceTask) { const ledger = await readOperationEvents(root);
            if (!ledger.ok || hash(JSON.stringify(ledger.records.filter(row => row.value.taskId === next.sourceTask!.taskId).map(row => row.value))) !== next.sourceTask.digest)
              return { ok: false, code: "conflict", message: "run-transition-delivered-source-conflict" }; }
        }
        if (!await fresh()) return { ok: false, code: "conflict", message: "run-transition-fence-or-source-changed" };
        // A crash here records the true stopped old execution, never an applied replacement claim.
        await atomicWrite(oldPath, JSON.stringify(pending));
        if (input.replacement && nextPath) {
          if (!await fresh()) return { ok: false, code: "conflict", message: "run-transition-old-stopped-replacement-fenced" };
          await atomicWrite(nextPath, JSON.stringify(input.replacement.value));
        }
        if (!await fresh()) return { ok: false, code: "conflict", message: "run-transition-final-acknowledgement-fenced" };
        await atomicWrite(oldPath, JSON.stringify(input.old.value));
        return { ok: true };
      } catch (error) { return { ok: false, code: "io", message: String(error) }; } finally { await release(); }
    },
    async compareAndSwapRunRecord(runId, expectedSha256, value, expectedBasis) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(runId) || value.runId !== runId) return { ok: false, code: "invalid", message: "run-identity-invalid" };
      const release = await acquireVersionLock(root);
      try { if (expectedBasis) { const current = await readManifest(); if (!current.ok || !matches(current.value, expectedBasis.trunk)
          || (current.value.activeRevision ?? 0) !== expectedBasis.active.revision || (current.value.activeDigest ?? null) !== expectedBasis.active.digest)
          return { ok: false, code: "conflict", message: "git-run-document-active-cas-conflict" };
          if (expectedBasis.gitBases) {
            const actual = await readExecutionBases(expectedBasis);
            if (!actual.ok || JSON.stringify(actual.value) !== JSON.stringify(expectedBasis.gitBases)
              || JSON.stringify({ codeBasis: value.codeBasis, documentGitBasis: value.documentGitBasis, codeBasisSource: value.codeBasisSource }) !== JSON.stringify(expectedBasis.gitBases))
              return { ok: false, code: "conflict", message: "git-run-independent-source-cas-conflict" };
          } else if (expectedBasis.codeBasis && (expectedBasis.codeBasis.ref !== "refs/ans/trunk" || !expectedBasis.codeBasis.oid
            || !expectedBasis.snapshot || JSON.stringify(current.value.snapshotRef) !== JSON.stringify(expectedBasis.snapshot)
            || JSON.stringify(await visibleOid()) !== JSON.stringify(expectedBasis.codeBasis.oid) || JSON.stringify(value.codeBasis) !== JSON.stringify(expectedBasis.codeBasis)))
            return { ok: false, code: "conflict", message: "git-run-code-basis-cas-conflict" }; }
        if (expectedBasis?.sourceTask) {
          const ledger = await readOperationEvents(root);
          if (!ledger.ok || hash(JSON.stringify(ledger.records.filter(row => row.value.taskId === expectedBasis.sourceTask!.taskId).map(row => row.value))) !== expectedBasis.sourceTask.digest)
            return { ok: false, code: "conflict", message: "git-run-delivered-controller-cas-conflict" };
        }
        if (expectedBasis?.runChangeSource) {
          const source = expectedBasis.runChangeSource, old = await legacy.readRunRecord!(source.oldRunId);
          if (!old.ok || old.value.sha256 !== source.oldSha256 || old.value.value.state !== "pinned" || old.value.value.flowId !== value.flowId
            || JSON.stringify(value.runChangeSource) !== JSON.stringify(source) || runId === source.oldRunId) return { ok: false, code: "conflict", message: "run-change-old-source-cas-conflict" };
          const error = await checkRunChangeRequester(root, source, String(value.flowId)); if (error) return { ok: false, code: "conflict", message: error };
        }
        const current = await legacy.readRunRecord!(runId);
        if (current.ok ? current.value.sha256 !== expectedSha256 : current.reason !== "missing" || expectedSha256 !== null) return { ok: false, code: "conflict", message: "run-byte-cas-conflict" };
        let dir = await realpath(root); for (const part of [".ans", "runs", runId]) { dir = path.join(dir, part); await mkdir(dir, { recursive: true });
          const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) return { ok: false, code: "invalid", message: "run-control-path-escape" }; }
        if (!await ownsVersionLock(root, release.token)) return { ok: false, code: "conflict", message: "run-fencing-lost" };
        await atomicWrite(path.join(dir, "manifest.json"), JSON.stringify(value)); return { ok: true };
      } catch (error) { return { ok: false, code: "io", message: String(error) }; } finally { await release(); }
    },
    async prepareSnapshot(snapshot) { const oid = await visibleOid(); if (oid && (await objects.listTree(oid)).some(entry => entry.path === snapshotPath(snapshot))) {
      const old = await readSnapshot(snapshot); if (!old.ok || JSON.stringify(old.value) !== JSON.stringify(snapshot)) return invalid("git-snapshot-immutable-conflict");
    } return legacy.prepareSnapshot!(snapshot); },
    async captureSnapshot(input) { if (input.baseSnapshotRef) { const base = await readSnapshot(input.baseSnapshotRef); if (!base.ok) return base; const seeded = await legacy.prepareSnapshot!(base.value); if (!seeded.ok) return seeded; } return legacy.captureSnapshot!(input); },
    async readSnapshotArtifact(ref) { if (!isSnapshotArtifactRef(ref)) return invalid("artifact-ref-invalid");
      // Artifact refs do not carry snapshot digest: obtain the actual immutable snapshot first.
      const oid = await visibleOid(); if (!oid) return legacy.readSnapshotArtifact!(ref); const actual = await jsonAt(oid, `.ans/trunk/snapshots/${ref.snapshotId}.json`, isStoredCompleteSnapshot);
      if (!actual.ok) return legacy.readSnapshotArtifact!(ref);
      const file = actual.value.files.find(file => file.path === ref.path && file.sha256 === ref.sha256.toLowerCase()); return file ? { ok: true, value: { snapshot: actual.value, bytesBase64: file.bytesBase64, sha256: file.sha256 } } : invalid("artifact-byte-binding-invalid"); },
    readActiveRoleEvidence: roleBytes,
    readFrozenRoleEvidence(evidence) { return isFrozenRoleEvidence(evidence) ? roleBytes(evidence) : Promise.resolve(invalid("old-run-missing-frozen-evidence")); },
    async readManifestAt(ref, snapshot) { const git = await findManifest(ref, snapshot); return git.ok || git.reason !== "missing" ? git : legacy.readManifestAt!(ref, snapshot); },
    async readManifestVersion(version) { const current = await readManifest(); if (current.ok && current.value.trunkVersion === version) return current;
      const oid = await visibleOid(); if (!oid) return legacy.readManifestVersion!(version); const history = await jsonAt(oid, `.ans/trunk/history/manifest-v${version}.json`, isTrunkManifestShape); return history.ok ? verify(history.value) : history; },
    async listHistory() { const oid = await visibleOid(); return oid ? (await objects.listTree(oid)).map(entry => /^\.ans\/trunk\/history\/manifest-v([1-9]\d*)\.json$/.exec(entry.path)?.[1]).filter((value): value is string => value !== undefined).map(Number).sort((a, b) => a - b) : legacy.listHistory(); },
    async archiveHistory(version, manifest) { const known = await findManifest({ version, digest: manifest.digest }, manifest.snapshotRef); return known.ok ? { ok: true } : { ok: false, code: "invalid", message: "history-not-a-visible-git-commit" }; },
    writeManifest: async () => ({ ok: false, code: "invalid", message: "git-manifest-requires-cas" }),
    async writeOperation(journal) {
      if (scope && (!leaseValid() || journal.operationId !== scope.operationId || journal.flowId !== scope.flowId
        || (scope.initialWorkflowSource ? journal.actionSource !== undefined : journal.actionSource?.kind !== "role-direct" || journal.actionSource.actorRoleId !== scope.actorRoleId)
        || gitBusinessRequestDigest(journal) !== scope.journalDigest || JSON.stringify(journal.targetSnapshot) !== JSON.stringify(scope.snapshot))) return denied();
      const old = await legacy.readOperation!(journal.operationId ?? ""); if (old.ok) return legacy.writeOperation!(journal);
      return options.readOnly ? denied() : operations.writeBusinessJournal(journal); },
    async listOperationRecords() { const all = await legacy.listStorageOperations!(); if (!all.ok) return all; const values: TrunkApplyJournal[] = [];
      for (const item of all.value) { if (item.media === "fs") { const old = await legacy.readOperation!(item.operationId); if (!old.ok) return old; values.push(old.value); }
        else if (item.media === "git-ref/v1") { const git = await operations.readJournal(item.operationId); if (git?.businessJournal) values.push(git.businessJournal); } } return { ok: true, value: values }; },
    async compareAndSwapManifest(expected, next, snapshot, active, expectedSnapshot) {
      if (options.readOnly) return denied(); if (!isTrunkManifestShape(next) || JSON.stringify(next.snapshotRef) !== JSON.stringify(snapshot)) return { ok: false, code: "invalid", message: "invalid-commit-manifest" };
      if (scope && (scope.activeTarget || !leaseValid() || hash(JSON.stringify(next)) !== scope.manifestSha256 || JSON.stringify(snapshot) !== JSON.stringify(scope.snapshot)
        || JSON.stringify(expected) !== JSON.stringify(scope.expectedBase) || JSON.stringify(active) !== JSON.stringify(scope.expectedActive)
        || JSON.stringify(expectedSnapshot) !== JSON.stringify(scope.expectedSnapshot))) return denied();
      const release = scope ? await acquireVersionLock(root) : undefined;
      try {
      if (scope) {
        if (!leaseValid() || !release || !await ownsVersionLock(root, release.token)) return denied();
        const identity = await objects.inspect();
        if (!scope.plannedCommit || scope.plannedCommit.repoId !== identity.repoId || scope.plannedCommit.configDigest !== identity.configDigest) return { ok: false, code: "conflict", message: "git-repository-plan-identity-stale" };
        for (const file of scope.expectedFiles) {
          if (!file.path || /[\\:\x00-\x1f]/.test(file.path) || file.path.startsWith("/") || file.path.split("/").some(part => !part || part === "." || part === "..")) return denied();
          const absolute = path.join(await realpath(root), file.path), info = await lstat(absolute);
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * 1024 * 1024 || await realpath(absolute) !== absolute || createHash("sha256").update(await readFile(absolute)).digest("hex") !== file.sha256) return { ok: false, code: "conflict", message: "git-authorization-or-target-bytes-stale" };
        }
        if (scope.publicationTask) {
          const task = scope.publicationTask, ledger = await readOperationEvents(root);
          if (scope.actorRoleId !== "convener" || !scope.expectedFiles.some(file => file.path === ".ans/state/tasks.jsonl" && file.sha256 === task.ledgerSha256)
            || !ledger.ok) return denied();
          const rows = ledger.records.filter(row => row.value.taskId === task.taskId), creates = rows.filter(row => row.value.kind === "task.created");
          if (creates.length !== 1 || creates[0]!.value.to !== "convener" || creates[0]!.value.runId !== task.runId
            || creates[0]!.value.flowId !== scope.flowId || rows.some(row => row.value.kind === "task.closed")) return denied();
        }
      }
      if (scope?.initialWorkflowSource) {
        const runs = await legacy.listRunRecords!(); if (!runs.ok || runs.value.some(run => run.schema !== "ans-run/v1" || typeof run.runId !== "string" || typeof run.flowId !== "string" || run.state !== "draft" || run.pinDigest !== undefined || run.pinnedBy !== undefined || run.frozenRoles !== undefined)) return { ok: false, code: "conflict", message: "initial-workflow-execution-run-present-or-unknown" };
      }
      const oid = await visibleOid(), current = oid ? await jsonAt(oid, manifestPath, isTrunkManifestShape) : missing<TrunkManifest>();
      if (scope?.plannedCommit && JSON.stringify(oid) !== JSON.stringify(scope.plannedCommit.base)) return { ok: false, code: "conflict", message: "git-full-ref-basis-stale" };
      if (expected === null ? current.ok || current.reason !== "missing" : !current.ok || !matches(current.value, expected)) return { ok: false, code: "conflict", message: "git-document-cas-conflict" };
      if ((current.ok && current.value.flowId !== next.flowId) || (expectedSnapshot && (!current.ok || JSON.stringify(current.value.snapshotRef) !== JSON.stringify(expectedSnapshot)))) return { ok: false, code: "conflict", message: "git-snapshot-flow-cas-conflict" };
      if ((current.ok && current.value.activeRevision !== undefined && !active) || (active && ((current.ok ? current.value.activeRevision ?? 0 : 0) !== active.revision || (current.ok ? current.value.activeDigest ?? null : null) !== active.digest))) return { ok: false, code: "conflict", message: "git-active-cas-conflict" };
      if (!current.ok && options.migrationOperationId) { const original = await legacy.readManifest(); if (!original.ok || JSON.stringify(original.value) !== JSON.stringify(next)) return { ok: false, code: "conflict", message: "migration-source-is-not-current-legacy-commit" }; }
      const merged = !current.ok && options.migrationOperationId ? next : { ...next, activeRoles: current.ok ? current.value.activeRoles : undefined, activeRevision: current.ok ? current.value.activeRevision : undefined, activeDigest: current.ok ? current.value.activeDigest : undefined };
      return await commitManifest(merged, current.ok ? current.value : undefined, oid, scope?.operationId, release?.token);
      } finally { await release?.(); }
    },
    async compareAndSwapActiveRoles(expected, active, next) {
      if (options.readOnly || (scope && !scope.activeTarget)) return denied();
      if (scope && (!leaseValid() || JSON.stringify(expected) !== JSON.stringify(scope.expectedBase) || JSON.stringify(active) !== JSON.stringify(scope.expectedActive)
        || JSON.stringify(next) !== JSON.stringify(scope.activeTarget))) return denied();
      const release = scope ? await acquireVersionLock(root) : undefined;
      try {
        if (scope) {
          if (!leaseValid() || !release || !await ownsVersionLock(root, release.token)) return denied();
          const identity = await objects.inspect();
          if (!scope.plannedCommit || scope.plannedCommit.repoId !== identity.repoId || scope.plannedCommit.configDigest !== identity.configDigest) return { ok: false, code: "conflict", message: "git-active-repository-plan-stale" };
          for (const file of scope.expectedFiles) {
            if (!file.path || /[\\:\x00-\x1f]/.test(file.path) || file.path.startsWith("/") || file.path.split("/").some(part => !part || part === "." || part === "..")) return denied();
            const absolute = path.join(await realpath(root), file.path), info = await lstat(absolute);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * 1024 * 1024 || await realpath(absolute) !== absolute || createHash("sha256").update(await readFile(absolute)).digest("hex") !== file.sha256) return { ok: false, code: "conflict", message: "git-active-authority-or-draft-stale" };
          }
        }
        if (scope?.publicationTask) {
          const task = scope.publicationTask, ledger = await readOperationEvents(root);
          if (scope.actorRoleId !== "nominator" || !scope.expectedFiles.some(file => file.path === ".ans/state/tasks.jsonl" && file.sha256 === task.ledgerSha256) || !ledger.ok) return denied();
          const rows = ledger.records.filter(row => row.value.taskId === task.taskId), creates = rows.filter(row => row.value.kind === "task.created");
          if (creates.length !== 1 || creates[0]!.value.to !== scope.actorRoleId || creates[0]!.value.runId !== task.runId || creates[0]!.value.flowId !== scope.flowId
            || rows.some(row => row.value.kind === "task.closed")) return denied();
        }
        const oid = await visibleOid(), current = oid ? await jsonAt(oid, manifestPath, isTrunkManifestShape) : missing<TrunkManifest>();
        if (scope?.plannedCommit && JSON.stringify(oid) !== JSON.stringify(scope.plannedCommit.base)) return { ok: false, code: "conflict", message: "git-active-full-ref-basis-stale" };
        if (!current.ok || !matches(current.value, expected) || (current.value.activeRevision ?? 0) !== active.revision || (current.value.activeDigest ?? null) !== active.digest) return { ok: false, code: "conflict", message: "git-active-document-cas-conflict" };
        if (next.revision !== active.revision + 1 || !/^[a-f0-9]{64}$/i.test(next.digest) || !Object.entries(next.roles).every(([id, value]) => isActiveRoleEvidence(value) && value.roleId === id)) return { ok: false, code: "invalid", message: "active-target-invalid" };
        const target = { ...current.value, activeRoles: next.roles, activeRevision: next.revision, activeDigest: next.digest };
        if (scope && hash(JSON.stringify(target)) !== scope.manifestSha256) return denied();
        const journal = (await operations.listJournals()).find(record => record.businessJournal?.actionSource?.kind === "role-direct" && record.businessJournal.actionSource.action === "activate-role-documents" && record.businessJournal.actionSource.targetDigest === next.digest);
        return await commitManifest(target, current.value, oid, scope?.operationId ?? journal?.operationId, release?.token);
      } finally { await release?.(); }
    },
    async readActiveRolesAt(ref) { let oid = await visibleOid(), count = 0;
      while (oid && count++ < 256) { const current = await jsonAt(oid, manifestPath, isTrunkManifestShape); if (!current.ok) return current;
        if (current.value.activeRevision === ref.revision && current.value.activeDigest === ref.digest && current.value.activeRoles) { for (const value of Object.values(current.value.activeRoles)) { const bytes = await roleBytes(value); if (!bytes.ok) return bytes; }
          return { ok: true, value: { revision: ref.revision, digest: ref.digest, roles: current.value.activeRoles } }; }
        const commit = await objects.readCommit(oid); if (commit.parents.length > 1) return invalid("active-history-chain-ambiguous"); oid = commit.parents[0] ?? null;
      } return legacy.readActiveRolesAt!(ref); },
  };
}

/** A single exact business plan, under the caller's actual held host lease. Never changes production selection globally. */
export function createGitDocumentMutationStore(root: string, input: {
  publicationTask?: { taskId: string; runId: string; ledgerSha256: string };
  hostLeaseId: string; manifest: TrunkManifest; journal: TrunkApplyJournal; expectedBase: import("../../../model/trunk.ts").TrunkCommitRef | null;
  expectedActive: import("../abstract/trunk-store.ts").ActiveCommitRef; expectedSnapshot?: SnapshotRef; expectedFiles: readonly { path: string; sha256: string }[];
  gitPlan: import("../abstract/trunk-store.ts").GitDocumentCommitPlan;
}): TrunkStore {
  const source = input.journal.actionSource;
  if (!checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "git-mutation" }).ok || source?.kind !== "role-direct"
    || !input.journal.targetSnapshot || !input.manifest.snapshotRef || input.journal.operationId !== source.operationId
    || JSON.stringify(input.manifest.actionSource) !== JSON.stringify(source) || JSON.stringify(input.journal.targetSnapshot) !== JSON.stringify(input.manifest.snapshotRef)
    || input.gitPlan.manifestSha256 !== hash(JSON.stringify(input.manifest)) || input.gitPlan.journalDigest !== gitBusinessRequestDigest(input.journal)) throw new Error("git-document-mutation-binding-invalid");
  return createGitTrunkStore(root, { documentMutation: { hostLeaseId: input.hostLeaseId, operationId: source.operationId, actorRoleId: source.actorRoleId,
    ...(input.publicationTask ? { publicationTask: input.publicationTask } : {}),
    flowId: input.journal.flowId, manifestSha256: hash(JSON.stringify(input.manifest)), journalDigest: gitBusinessRequestDigest(input.journal), snapshot: input.journal.targetSnapshot,
    expectedBase: input.expectedBase, expectedActive: input.expectedActive, expectedSnapshot: input.expectedSnapshot, expectedFiles: input.expectedFiles,
    plannedCommit: { repoId: input.gitPlan.repo.repoId, configDigest: input.gitPlan.repo.configDigest, base: input.gitPlan.base, commit: input.gitPlan.candidate.commit } } });
}

/** First workflow only; shares the exact document CAS fence without granting any other writer. */
export function createGitInitialWorkflowMutationStore(root: string, input: {
  hostLeaseId: string; manifest: TrunkManifest; journal: TrunkApplyJournal; expectedActive: import("../abstract/trunk-store.ts").ActiveCommitRef;
  expectedFiles: readonly { path: string; sha256: string }[]; gitPlan: import("../abstract/trunk-store.ts").GitInitialWorkflowCommitPlan;
}): TrunkStore {
  const pub = input.gitPlan.publication, source = pub.source;
  if (!checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "git-mutation" }).ok || pub.kind !== "stable-initial-workflow-publication"
    || input.journal.actionSource !== undefined || source.kind !== "stable-initial-workflow" || source.operationId !== input.journal.operationId
    || JSON.stringify(input.journal.targetSnapshot) !== JSON.stringify(input.manifest.snapshotRef)
    || input.gitPlan.manifestSha256 !== hash(JSON.stringify(input.manifest)) || input.gitPlan.journalDigest !== gitBusinessRequestDigest(input.journal)) throw new Error("git-initial-workflow-mutation-binding-invalid");
  return createGitTrunkStore(root, { documentMutation: { hostLeaseId: input.hostLeaseId, operationId: source.operationId, actorRoleId: "convener", flowId: source.flowId,
    manifestSha256: input.gitPlan.manifestSha256, journalDigest: input.gitPlan.journalDigest, snapshot: pub.snapshot, expectedBase: source.documentCommit,
    expectedSnapshot: source.documentSnapshot, expectedActive: input.expectedActive, expectedFiles: input.expectedFiles, initialWorkflowSource: source,
    plannedCommit: { repoId: input.gitPlan.repo.repoId, configDigest: input.gitPlan.repo.configDigest, base: input.gitPlan.base, commit: input.gitPlan.candidate.commit } } });
}

/** Exact independent active transaction. It cannot write the document dimension. */
export function createGitActiveMutationStore(root: string, input: {
  hostLeaseId: string; manifest: TrunkManifest; journal: TrunkApplyJournal; expectedBase: TrunkCommitRef;
  expectedActive: import("../abstract/trunk-store.ts").ActiveCommitRef; expectedFiles: readonly { path: string; sha256: string }[];
  gitPlan: import("../abstract/trunk-store.ts").GitActiveCommitPlan;
  publicationTask?: { taskId: string; runId: string; ledgerSha256: string };
}): TrunkStore {
  const source = input.journal.actionSource, pub = input.gitPlan.publication;
  if (!checkGitHostAction({ projectRoot: root, leaseId: input.hostLeaseId, kind: "git-mutation" }).ok || source?.kind !== "role-direct"
    || source.action !== "activate-role-documents" || source.actorRoleId !== "nominator" || !input.journal.targetSnapshot
    || pub.kind !== "role-activation-publication" || pub.operationId !== source.operationId
    || JSON.stringify(pub.snapshot) !== JSON.stringify(input.journal.targetSnapshot)
    || JSON.stringify(pub.targetActive.roles) !== JSON.stringify(input.manifest.activeRoles)
    || input.gitPlan.manifestSha256 !== hash(JSON.stringify(input.manifest)) || input.gitPlan.journalDigest !== gitBusinessRequestDigest(input.journal)) throw new Error("git-active-mutation-binding-invalid");
  return createGitTrunkStore(root, { documentMutation: { hostLeaseId: input.hostLeaseId, operationId: source.operationId, actorRoleId: source.actorRoleId,
    ...(input.publicationTask ? { publicationTask: input.publicationTask } : {}),
    flowId: input.journal.flowId, manifestSha256: input.gitPlan.manifestSha256, journalDigest: input.gitPlan.journalDigest, snapshot: input.journal.targetSnapshot,
    expectedBase: input.expectedBase, expectedActive: input.expectedActive, expectedSnapshot: input.manifest.snapshotRef, expectedFiles: input.expectedFiles,
    activeTarget: pub.targetActive, plannedCommit: { repoId: input.gitPlan.repo.repoId, configDigest: input.gitPlan.repo.configDigest, base: input.gitPlan.base, commit: input.gitPlan.candidate.commit } } });
}

/** Infrastructure migration copies only the actual immutable legacy closure; production must coordinate authorization first. */
export async function migrateLegacyTrunkToGit(root: string, input: { operationId: string; expected: TrunkCommitRef }): Promise<ManifestCasResult> {
  const legacy = createFsTrunkStore(root, { legacyCommitProofOnly: true }), old = await legacy.readManifest();
  if (!input.operationId || !old.ok || old.value.trunkVersion !== input.expected.version || old.value.digest !== input.expected.digest || !old.value.snapshotRef)
    return { ok: false, code: "invalid", message: "legacy-complete-commit-basis-unavailable" };
  const objects = createGitCandidateStore(root), prior = await objects.readRef("refs/ans/trunk");
  if (prior) return { ok: false, code: "conflict", message: "git-already-has-effective-ref" };
  const snapshot = await legacy.readSnapshot!(old.value.snapshotRef); if (!snapshot.ok) return { ok: false, code: "invalid", message: snapshot.message ?? snapshot.reason };
  // Old pending operation bytes remain their original media; none is replayed or approved here.
  const store = createGitTrunkStore(root, { migrationOperationId: input.operationId });
  return store.compareAndSwapManifest!(null, old.value, old.value.snapshotRef, { revision: 0, digest: null });
}

/** Production selection is read-only for Git until a trusted coordinated mutation path exists. */
export function createProjectTrunkStore(root: string): TrunkStore {
  const legacy = createFsTrunkStore(root), git = createGitTrunkStore(root, { readOnly: true });
  async function selected(): Promise<TrunkStore> {
    const mode = await optional(path.join(root, ".ans/trunk/git-mode.json"));
    const initialized = await optional(path.join(root, ".ans/git-init-process.json"));
    if (mode) {
      try { const projection: unknown = JSON.parse(mode.toString());
        if (projection && typeof projection === "object" && "migrationOperationId" in projection && typeof projection.migrationOperationId === "string") {
          const record = await createGitRefStore(root).readJournal(projection.migrationOperationId), actual = await createGitCandidateStore(root).readRef("refs/ans/trunk");
          if (!actual && record && record.phase !== "business-prepared" && record.legacyManifestSha256) {
            const original = await legacy.readProjectFile!(".ans/trunk/manifest.json");
            if (original.ok && original.value.sha256 === record.legacyManifestSha256) return createFsTrunkStore(root, { legacyCommitProofOnly: true });
          }
        }
      } catch { return git; }
      return git;
    }
    if (initialized) return git;
    // A ref is authoritative even if its optional compatibility projection was never written.
    const protection = await readGitProtectionFacts(root);
    for (const control of protection.protectedGitRoots) {
      try { if (await optional(path.join(control, "refs/ans/trunk"))) return git;
        const packed = await optional(path.join(control, "packed-refs")); if (packed && /(?:^|\n)[a-f0-9]+ refs\/ans\/trunk(?:\r?\n|$)/i.test(packed.toString())) return git;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOTDIR" && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    try { const identity = await inspectGitRepository(root); if (await createGitCandidateStore(identity.root).readRef("refs/ans/trunk")) return git; }
    catch (error) { if (mode) throw error; }
    return legacy;
  }
  return { ...legacy,
    async readManifest() { const store = await selected(), read = await store.readManifest(); return store === git && !read.ok && read.reason === "missing"
      ? { ok: false, reason: "corrupt", message: "git-media-has-no-effective-ref" } : read; },
    readInitialGitPublicationBasis: flowId => git.readInitialGitPublicationBasis!(flowId),
    planDocumentCommit: input => git.planDocumentCommit!(input),
    planActiveCommit: input => git.planActiveCommit!(input),
    planInitialWorkflowCommit: input => git.planInitialWorkflowCommit!(input),
    async readManifestAt(ref, snapshot) { return (await selected()).readManifestAt!(ref, snapshot); },
    async readManifestVersion(version) { return (await selected()).readManifestVersion!(version); },
    async readSnapshot(ref) { return (await selected()).readSnapshot!(ref); },
    async readSnapshotArtifact(ref) { return (await selected()).readSnapshotArtifact!(ref); },
    async readActiveRoleEvidence(ref) { return (await selected()).readActiveRoleEvidence!(ref); },
    async readFrozenRoleEvidence(ref) { return (await selected()).readFrozenRoleEvidence!(ref); },
    async readActiveRolesAt(ref) { return (await selected()).readActiveRolesAt!(ref); },
    async readOperation(id) { return (await selected()).readOperation!(id); },
    async readOperationCommit(journal) { const store = await selected(); return store.readOperationCommit ? store.readOperationCommit(journal)
      : journal.actionSource?.kind === "role-direct" ? store.readManifestAt!({ version: journal.target.trunkVersion, digest: journal.actionSource.targetDigest }, journal.actionSource.baseDigest === journal.actionSource.targetDigest ? undefined : journal.targetSnapshot)
      : { ok: false, reason: "corrupt", message: "operation-source-invalid" }; },
    async readCommittedFreezeBasis(journal) { const store = await selected(); return store.readCommittedFreezeBasis ? store.readCommittedFreezeBasis(journal) : { ok: false, reason: "missing" }; },
    async finalizeCommittedMetadata(journal, proof) { const store = await selected(); return store.finalizeCommittedMetadata ? store.finalizeCommittedMetadata(journal, proof) : { ok: false, code: "invalid", message: "committed-metadata-media-unsupported" }; },
    async compareAndSwapRunRecord(id, expected, value, basis) { return (await selected()).compareAndSwapRunRecord!(id, expected, value, basis); },
    async commitRunTransition(input) { const store = await selected(); return store.commitRunTransition ? store.commitRunTransition(input) : { ok: false, code: "invalid", message: "run-transition-media-unavailable" }; },
    async readCodeBasis(expected) { const store = await selected(); return store.readCodeBasis ? store.readCodeBasis(expected) : { ok: false, reason: "missing" }; },
    async readExecutionBases(expected) { const store = await selected(); return store.readExecutionBases ? store.readExecutionBases(expected) : { ok: false, reason: "missing" }; },
    async verifyExecutionBases(bases) { const store = await selected(); return store.verifyExecutionBases ? store.verifyExecutionBases(bases) : { ok: false, reason: "missing" }; },
    async writeOperation(journal) { return (await selected()).writeOperation!(journal); },
    async listOperationRecords() { return (await selected()).listOperationRecords!(); },
    async prepareSnapshot(snapshot) { return (await selected()).prepareSnapshot!(snapshot); },
    async captureSnapshot(input) { return (await selected()).captureSnapshot!(input); },
    async compareAndSwapManifest(expected, next, snapshot, active, expectedSnapshot) { return (await selected()).compareAndSwapManifest!(expected, next, snapshot, active, expectedSnapshot); },
    async compareAndSwapActiveRoles(doc, active, next) { return (await selected()).compareAndSwapActiveRoles!(doc, active, next); },
    async writeManifest(manifest) { return (await selected()).writeManifest(manifest); },
    async archiveHistory(version, manifest) { return (await selected()).archiveHistory(version, manifest); },
    async listHistory(options) { return (await selected()).listHistory(options); },
  };
}
async function assertControlPaths(root: string) {
  for (const rel of [".ans", ".ans/state", ".ans/trunk", ".ans/trunk/operations"]) {
    const abs = path.join(root, rel); try { const info = await lstat(abs); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(abs) !== abs) throw new Error("git-control-path-unsafe"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
export function createGitRefStore(root: string, fence?: { hostLeaseId?: string; heldLockToken?: string }): GitRefStore {
  const candidates = createGitCandidateStore(root);
  const journalPath = (operationId: string) => path.join(root, ".ans/trunk/operations", hash(operationId), "git.json");
  async function readJournal(operationId: string): Promise<GitOperationRecord | null> {
    await assertControlPaths(root);
    if (await readGitInitializationRecord(root, operationId)) throw new Error("operation-bound-to-init-media");
    const bytes = await optional(journalPath(operationId)); if (bytes === null) return null;
    if (bytes.length > 2 * 1024 * 1024) throw new Error("git-journal-budget");
    const value: unknown = JSON.parse(bytes.toString()); if (!isGitOperationRecord(value) || value.operationId !== operationId) throw new Error("git-journal-corrupt");
    if (value.phase !== "business-prepared") applicationGitRef(value.ref); return value;
  }
  async function listJournals(): Promise<readonly GitOperationRecord[]> {
    await assertControlPaths(root);
    return listGitOperationJournals(root);
  }
  async function safeWrite(journal: GitOperationRecord, actualProcess?: import("../abstract/trunk-store.ts").GitProcessFacts) {
    if (fence?.hostLeaseId && !checkGitHostAction({ projectRoot: root, leaseId: fence.hostLeaseId, kind: "git-mutation" }).ok) {
      // Revocation forbids another effect, not durable settlement of the exact already-bound process.
      // This private argument is only passed the actual executeGit return, never a public caller flag.
      if (!actualProcess || journal.phase === "business-prepared" || journal.process !== actualProcess || actualProcess.operationId !== journal.operationId)
        throw new Error("git-host-mutation-lease-invalid");
      const prior = await readJournal(journal.operationId);
      if (!prior || prior.phase === "business-prepared") throw new Error("git-process-settlement-unbound");
      const { phase: oldPhase, process: oldProcess, ...oldBinding } = prior, { phase: newPhase, process: newProcess, ...newBinding } = journal;
      void oldPhase; void oldProcess; void newPhase; void newProcess;
      if (JSON.stringify(oldBinding) !== JSON.stringify(newBinding)) throw new Error("git-process-settlement-binding-conflict");
      const persisted = await optional(path.join(root, ".git/ans/processes", `${actualProcess.processId}.json`));
      if (!persisted || JSON.stringify(JSON.parse(persisted.toString("utf8"))) !== JSON.stringify(actualProcess)) throw new Error("git-process-settlement-evidence-unavailable");
    }
    if (fence?.heldLockToken && !await ownsVersionLock(root, fence.heldLockToken)) throw new Error("git-ref-fencing-lost");
    const canonicalRoot = await realpath(root); let parent = canonicalRoot;
    for (const part of [".ans", "trunk", "operations", hash(journal.operationId)]) {
      parent = path.join(parent, part); await mkdir(parent, { recursive: true }); const info = await lstat(parent);
      if (info.isSymbolicLink() || !info.isDirectory() || await realpath(parent) !== parent) throw new Error("git-journal-path-escape");
    }
    await atomicWrite(journalPath(journal.operationId), JSON.stringify(journal));
  }
  async function publish(input: Omit<GitRefJournal, "media" | "phase" | "process">, signal?: AbortSignal) {
    const identity = await inspectGitRepository(root), ref = applicationGitRef(input.ref);
    await assertControlPaths(identity.root);
    if (identity.repoId !== input.repoId || !input.operationId || !/^[a-f0-9]{64}$/.test(input.requestDigest)) throw new Error("git-publish-identity-invalid");
    const committed = await candidates.readCommit(input.newOid);
    if (JSON.stringify([committed.tree, committed.parents]) !== JSON.stringify([input.tree, input.parents])) throw new Error("git-publish-object-mismatch");
    const journalId = `.ans/trunk/operations/${hash(input.operationId)}/git.json`;
    let journal: GitRefJournal = { ...input, media: "git-ref/v1", phase: "prepared" };
    let requestBound = false;
    const result = (status: "published" | "conflict" | "blocked" | "pending-recovery", message?: string) => ({ status, journalId, journal, ...(message ? { message } : {}) });
    const release = fence?.heldLockToken ? undefined : await acquireVersionLock(root), lockToken = fence?.heldLockToken ?? release!.token;
    try {
      if (!await ownsVersionLock(root, lockToken)) throw new Error("git-ref-fencing-lost");
      if (!await stableSourceMatches(input.operationId, input.businessJournal)) return result("blocked", "Operation is already bound to another immutable work source");
      if (fence?.hostLeaseId && !checkGitHostAction({ projectRoot: root, leaseId: fence.hostLeaseId, kind: "git-mutation" }).ok) return result("blocked", "Actual host mutation lease is invalid");
      // One operation id has one request and one storage medium, including after restart.
      if (await optional(path.join(root, ".ans/trunk/operations", `${hash(input.operationId)}.json`))) throw new Error("operation-bound-to-fs-media");
      const prior = await readJournal(input.operationId);
      if (prior) {
        if (prior.repoId !== input.repoId || prior.requestDigest !== input.requestDigest) throw new Error("git-operation-replay-conflict");
        if (prior.phase !== "business-prepared") {
          const { phase: oldPhase, process: oldProcess, businessJournal: oldBusiness, ...binding } = prior; void oldPhase; void oldProcess; void oldBusiness;
          const { businessJournal: newBusiness, ...expected } = input; void newBusiness;
          if (JSON.stringify(binding) !== JSON.stringify({ ...expected, media: "git-ref/v1" })) throw new Error("git-operation-replay-conflict");
          journal = prior;
        } else { journal = { ...journal, businessJournal: prior.businessJournal }; }
        requestBound = true;
      }
      for (const pending of await listJournals()) if (pending.operationId !== input.operationId && !isGitProcessNotStarted("process" in pending ? pending.process : undefined)
        && (pending.phase === "unknown" || ("process" in pending && pending.process?.termination === "unknown"))) return result("blocked", "Unresolved owned Git process holds the modification fence");
      const current = await candidates.readRef(ref);
      if (current?.hex === input.newOid.hex) {
        if (!prior || prior.phase === "business-prepared" || prior.process?.termination !== "exited" || prior.process.exitCode !== 0) return result("blocked", "Ref alone does not prove this operation's owned process succeeded");
        journal = { ...journal, phase: "published" }; await safeWrite(journal); return result("published");
      }
      if ((current?.hex ?? null) !== (input.oldOid?.hex ?? null)) return result(prior ? "blocked" : "conflict", "Ref differs from expected old OID; refusing rollback");
      if (!isGitProcessNotStarted(prior && "process" in prior ? prior.process : undefined)
        && (prior?.phase === "unknown" || (prior && "process" in prior && prior.process?.termination === "unknown"))) return result("blocked", "Prior owned Git process termination is unknown");
      if (signal?.aborted) return result("blocked", "Cancelled before ref modification");
      await safeWrite(journal);
      requestBound = true;
      if (input.legacyManifestSha256) {
        const original = await optional(path.join(root, ".ans/trunk/manifest.json"));
        if (!original || hash(original.toString()) !== input.legacyManifestSha256) return result("conflict", "Actual legacy manifest changed before Git cutover");
        // Fence old FS publishers under the same lock before CAS. Readers still use the actual old ref/basis until Git wins.
        await atomicWrite(path.join(root, ".ans/trunk/git-mode.json"), JSON.stringify({ media: "git-ref/v1", repoId: identity.repoId, migrationOperationId: input.operationId }));
      }
      const process = await executeGit(root, ["update-ref", "--no-deref", ref, input.newOid.hex, input.oldOid?.hex ?? "0".repeat(identity.objectFormat === "sha1" ? 40 : 64)], { signal, hostLeaseId: fence?.hostLeaseId, operationId: input.operationId });
      journal = { ...journal, process, phase: process.termination === "exited" || isGitProcessNotStarted(process) ? "prepared" : "unknown" };
      // Unknown termination is durably fenced before returning, even if the ref happens to match.
      await safeWrite(journal, process);
      if (isGitProcessNotStarted(process)) return result("blocked", "Publication was cancelled before the process started");
      if (process.termination !== "exited") return result("pending-recovery", "Owned Git process termination is unknown");
      const actual = await candidates.readRef(ref);
      if (actual?.hex === input.newOid.hex) { journal = { ...journal, phase: "published" }; await safeWrite(journal, process); return result("published"); }
      if ((actual?.hex ?? null) === (input.oldOid?.hex ?? null)) { journal = { ...journal, phase: "conflict" }; await safeWrite(journal, process); return result("conflict", process.stderr); }
      return result("blocked", "Unknown successor ref; refusing rollback");
    } catch (error) {
      // A ref commit is final. Metadata failure must never turn it into a rejected precommit.
      const actual = await candidates.readRef(ref).catch(() => undefined);
      if (requestBound && actual?.hex === input.newOid.hex) return result("pending-recovery", String(error));
      throw error;
    } finally { await release?.(); }
  }
  async function stableSourceMatches(operationId: string, journal: TrunkApplyJournal | undefined): Promise<boolean> {
    const file = await optional(path.join(root, ".ans/trunk/operations", hash(operationId), "stable-source.json"));
    if (!file) return true;
    if (!journal || journal.actionSource !== undefined || !journal.message) return false;
    const metadata: unknown = JSON.parse(journal.message);
    return !!metadata && typeof metadata === "object" && "schema" in metadata && metadata.schema === "stable-initial-workflow/v1"
      && "source" in metadata && hash(JSON.stringify(metadata.source)) === hash(file);
  }
  async function writeBusinessJournal(businessJournal: TrunkApplyJournal): Promise<StoreWrite> {
    if (!isTrunkApplyJournalShape(businessJournal) || !businessJournal.operationId) return { ok: false, code: "invalid", message: "git-business-journal-invalid" };
    const operationId = businessJournal.operationId, identity = await inspectGitRepository(root), requestDigest = gitBusinessRequestDigest(businessJournal);
    await assertControlPaths(root); const release = fence?.heldLockToken ? undefined : await acquireVersionLock(root), lockToken = fence?.heldLockToken ?? release!.token;
    try {
      if (!await ownsVersionLock(root, lockToken)) throw new Error("git-ref-fencing-lost");
      if (await optional(path.join(root, ".ans/trunk/operations", `${hash(operationId)}.json`))) return { ok: false, code: "invalid", message: "operation-bound-to-fs-media" };
      if (!await stableSourceMatches(operationId, businessJournal)) return { ok: false, code: "invalid", message: "operation-bound-to-other-work-source" };
      const prior = await readJournal(operationId);
      if (prior && (prior.repoId !== identity.repoId || prior.requestDigest !== requestDigest)) return { ok: false, code: "invalid", message: "git-business-operation-conflict" };
      await safeWrite(prior ? { ...prior, businessJournal } : { media: "git-ref/v1", phase: "business-prepared", operationId, repoId: identity.repoId, requestDigest, businessJournal });
      return { ok: true };
    } catch (error) { return { ok: false, code: "io", message: String(error) }; }
    finally { await release?.(); }
  }
  async function writeCandidateJournal(input: Omit<GitRefJournal, "media" | "phase" | "process">): Promise<StoreWrite> {
    const release = fence?.heldLockToken ? undefined : await acquireVersionLock(root), token = fence?.heldLockToken ?? release!.token;
    try {
      const journal: GitRefJournal = { ...input, media: "git-ref/v1", phase: "prepared" };
      if (!await ownsVersionLock(root, token) || !isGitRefJournal(journal) || !input.candidateSource || input.oldOid !== null
        || input.ref !== `refs/ans/candidates/${hash(input.operationId)}` || !await stableSourceMatches(input.operationId, undefined)) throw new Error("git-candidate-journal-binding-invalid");
      if (await optional(path.join(root, ".ans/trunk/operations", `${hash(input.operationId)}.json`))) throw new Error("operation-bound-to-fs-media");
      const old = await readJournal(input.operationId);
      if (old) {
        if (old.phase === "business-prepared") throw new Error("operation-bound-to-business-request");
        const { media, phase, process, ...binding } = old; void media; void phase; void process;
        if (JSON.stringify(binding) !== JSON.stringify(input)) throw new Error("git-candidate-operation-conflict");
        return { ok: true };
      }
      if (await candidates.readRef(input.ref)) throw new Error("git-candidate-ref-without-operation-proof");
      await safeWrite(journal); return { ok: true };
    } catch (error) { return { ok: false, code: "invalid", message: String(error) }; } finally { await release?.(); }
  }
  return { readJournal, listJournals, publish, writeBusinessJournal, writeCandidateJournal };
}
