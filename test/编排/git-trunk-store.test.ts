import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { initializeGitRepository, createGitCandidateStore, createGitRefStore, createGitQueryPort, createFsTrunkStore, createGitTrunkStore, createProjectTrunkStore, migrateLegacyTrunkToGit, planGitRefPublication, readGitDeliveryEvidence, readGitCandidateEvidence, readGitPublishedReadEvidence, type GitIntegrationSource, type GitTaskCandidateSource, type GitDeliverySource } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGitCapabilityService } from "../../src/service/trunk/public/trunk-service.ts";
import { checkGitPolicy } from "../../src/service/gate/shell-rules.ts";
import { completeSnapshotDigest } from "../../src/provider/version-change/public/version-change-store.ts";
import { TRUNK_APPLY_JOURNAL_SCHEMA, TRUNK_MANIFEST_SCHEMA, type TrunkApplyJournal, type TrunkManifest, type CompleteSnapshot } from "../../src/model/trunk.ts";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64");
async function fixture(format: "sha1" | "sha256" = "sha1") { const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-git-store-")); const identity = await initializeGitRepository(root, format); return { root, identity, candidates: createGitCandidateStore(root), refs: createGitRefStore(root) }; }

test("Git execution bases (storage only): delivered code and newer document blobs freeze independently; ambiguity never selects by time", async () => {
  // Ordinary stored source DTOs exercise storage identity/ancestry only. No accepted task or business pin is fabricated here.
  const f = await fixture(), store = createGitTrunkStore(f.root), stamp = "2026-11-05T00:00:00.000Z", untouched = Buffer.from([0, 255, 13, 10]);
  const proposal = (version: number) => ({ path: `docs/proposals/demo-proposal-v${version}.md`, bytes: `---\nschema: project-proposal/v2\nflowId: demo\nversion: ${version}\n---\nProduce src/impl/result.txt, preserve evidence and use creator closure.\n` });
  const document = async (version: number, previous?: TrunkManifest) => {
    const p = proposal(version), files = [{ path: p.path, sha256: hash(p.bytes), bytesBase64: b64(p.bytes) }, { path: "src/untouched.dat", sha256: createHash("sha256").update(untouched).digest("hex"), bytesBase64: b64(untouched) }];
    const snapshot = { schema: "complete-snapshot/v1" as const, snapshotId: `separate-doc-${version}`, digest: completeSnapshotDigest(files), files, createdAt: stamp };
    const saved = await store.prepareSnapshot!(snapshot); assert.ok(saved.ok);
    const value: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", previous: previous ? { trunkVersion: previous.trunkVersion, runId: null } : null,
      flowId: "demo", runId: null, trunkVersion: version, digest: hash(`doc-${version}`), snapshotRef: saved.value, createdAt: stamp, updatedAt: stamp,
      artifacts: { documents: { proposal: { path: p.path, sha256: hash(p.bytes), version } }, execution: { teamPlan: null, flow: null }, boundaries: {} } };
    assert.ok((await store.compareAndSwapManifest!(previous ? { version: previous.trunkVersion, digest: previous.digest } : null, value, saved.value,
      { revision: 0, digest: null }, previous?.snapshotRef)).ok);
    return value;
  };
  const expected = (manifest: TrunkManifest) => ({ trunk: { version: manifest.trunkVersion, digest: manifest.digest }, active: { revision: 0, digest: null }, snapshot: manifest.snapshotRef });
  const one = await document(1), initial = await store.readExecutionBases!(expected(one)); assert.ok(initial.ok, JSON.stringify(initial));
  assert.equal(initial.value.codeBasisSource.kind, "document-ref"); assert.deepEqual(initial.value.codeBasis, initial.value.documentGitBasis);
  console.log("execution-bases:first-document-source-captured");
  const delivery = async (flowId: string, suffix: string, base: import("../../src/model/trunk.ts").GitBasis, content: string) => {
    assert.ok(base.oid); const op = `storage-integration-${suffix}`, file = { path: "src/impl/result.txt", sha256: hash(content) };
    const worker = await f.candidates.prepare({ operationId: `storage-worker-${suffix}`, base: base.oid, message: `Stored worker ${suffix}`, timestamp: stamp, files: [{ path: file.path, bytesBase64: b64(content) }] });
    const owner: GitTaskCandidateSource = { kind: "assigned-run-task", taskId: `storage-worker-${suffix}`, runId: `storage-run-${suffix}`, flowId, roleId: "impl", moduleId: "impl-core",
      pinDigest: hash(`storage-pin-${suffix}`), taskDigest: hash(`storage-task-${suffix}`), runRecordSha256: hash(`storage-run-bytes-${suffix}`), scopeDigest: hash(`storage-scope-${suffix}`), base, files: [file] };
    const source: GitIntegrationSource = { ...owner, kind: "run-integration", taskId: `storage-controller-${suffix}`, roleId: "convener", contributors: [{ operationId: `storage-worker-${suffix}`,
      candidate: worker.candidate, source: owner, closeOperationId: `storage-close-${suffix}`, closeEventId: `storage-close-event-${suffix}`, reportSha256: hash(`storage-report-${suffix}`) }] };
    const objects = await f.candidates.prepareObjects({ operationId: op, base: base.oid, parents: [base.oid, worker.candidate], message: `Stored integration ${suffix}`, timestamp: stamp, files: [{ path: file.path, bytesBase64: b64(content) }] });
    assert.equal((await f.refs.publish({ operationId: op, repoId: f.identity.repoId, ref: `refs/ans/candidates/${hash(op)}`, oldOid: null,
      newOid: objects.candidate, tree: objects.tree, parents: objects.parents, requestDigest: hash(`storage-candidate-request-${suffix}`), candidateSource: source })).status, "published");
    const proof = await readGitCandidateEvidence(f.root, op, objects.candidate); assert.ok(proof.ok);
    const deliverySource: GitDeliverySource = { kind: "verified-run-delivery", taskId: source.taskId, roleId: "convener", runId: source.runId, flowId,
      candidateOperationId: op, candidateJournalSha256: proof.value.journalFile.sha256, pinDigest: source.pinDigest, runRecordSha256: source.runRecordSha256,
      taskDigest: source.taskDigest, ledgerDigest: hash("no-business-ledger-is-created"), qualityTaskId: `storage-quality-${suffix}`, qualityDigest: hash(`storage-quality-${suffix}`),
      creatorCloseOperationId: `storage-quality-close-${suffix}`, creatorCloseEventId: `storage-quality-event-${suffix}`, qualityReportSha256: hash(`storage-quality-report-${suffix}`),
      criteria: [{ oid: initial.value.documentGitBasis.oid!, path: proposal(1).path, sha256: hash(proposal(1).bytes) }], evidence: [{ oid: objects.candidate, path: file.path, sha256: file.sha256 }],
      liveFiles: [{ path: `docs/quality/${flowId}-report-v1.md`, sha256: hash(`storage-only-quality-${suffix}`) }] };
    const ref = `refs/ans/delivery/${flowId}`, old = await f.candidates.readRef(ref);
    assert.equal((await f.refs.publish({ operationId: `storage-delivery-${suffix}`, repoId: f.identity.repoId, ref, oldOid: old,
      newOid: objects.candidate, tree: objects.tree, parents: objects.parents, requestDigest: hash(`storage-delivery-request-${suffix}`), deliverySource })).status, "published");
    return { ref, oid: objects.candidate };
  };
  const firstCode = await delivery("demo", "first", initial.value.codeBasis, "delivered text one\n"), two = await document(2, one);
  const bases = await store.readExecutionBases!(expected(two)); assert.ok(bases.ok, JSON.stringify(bases));
  assert.deepEqual(bases.value.codeBasis, firstCode); assert.equal(bases.value.codeBasisSource.kind, "delivery-ref");
  assert.notDeepEqual(bases.value.documentGitBasis.oid, bases.value.codeBasis.oid);
  assert.equal((await f.candidates.readBlob(bases.value.documentGitBasis.oid!, proposal(2).path)).sha256, hash(proposal(2).bytes));
  await assert.rejects(f.candidates.readBlob(bases.value.codeBasis.oid!, proposal(2).path), /git-command-failed/, "New criteria are not falsely sourced from the old delivered code commit");
  assert.deepEqual(Buffer.from((await f.candidates.readBlob(firstCode.oid, "src/untouched.dat")).bytesBase64, "base64"), untouched);
  console.log("execution-bases:delivered-code-newer-document-selected");
  const secondCode = await delivery("demo", "second", firstCode, "delivered text two\n"), three = await document(3, two);
  assert.equal((await store.verifyExecutionBases!(bases.value)).ok, true, "Later doc/ref advances do not rewrite or invalidate an already-frozen source tuple");
  const fresh = await store.readExecutionBases!(expected(three)); assert.ok(fresh.ok); assert.deepEqual(fresh.value.codeBasis, secondCode);
  const chiefContext = { actorRoleId: "chief", readPaths: ["."] }, chief = createGitCapabilityService({ projectRoot: f.root, context: chiefContext });
  for (const [label, oid] of [["current-delivery", secondCode.oid], ["historical-delivery", firstCode.oid], ["historical-document", initial.value.documentGitBasis.oid!]] as const) {
    assert.ok((await readGitPublishedReadEvidence(f.root, oid)).ok, `${label} is proved by its actual settled publication and reachable app history`);
    const prepared = await chief.prepareQuery({ operationId: `chief-read-${label}`, template: "log", limit: 1, target: oid }, chiefContext);
    assert.ok(prepared.ok, JSON.stringify(prepared)); if (!prepared.ok) return;
    assert.equal(prepared.value.context.taskId, undefined); assert.deepEqual(prepared.value.basis, { ref: "refs/ans/trunk", oid: fresh.value.documentGitBasis.oid });
    assert.equal(prepared.value.basisSource, undefined, "An explicit read target does not fabricate an assigned frozen run");
    const result = await chief.executeQuery(prepared.value, checkGitPolicy(prepared.value.policyInput));
    assert.equal(result.status, "observed", JSON.stringify(result)); assert.ok(result.output?.includes(oid.hex));
    assert.deepEqual(result.basis, prepared.value.basis, "Historical read permission never replaces the default code basis with its target");
  }
  const unpublished = await f.candidates.prepare({ operationId: "read-object-only", base: secondCode.oid, timestamp: stamp, message: "An existing but unpublished object",
    files: [{ path: "src/impl/never-delivered.txt", bytesBase64: b64("not delivery permission\n") }] });
  assert.equal((await readGitPublishedReadEvidence(f.root, unpublished.candidate)).ok, false);
  const forbidden = await chief.prepareQuery({ operationId: "chief-read-unpublished", template: "log", limit: 1, target: unpublished.candidate }, chiefContext);
  assert.ok(forbidden.ok); assert.equal(checkGitPolicy(forbidden.value.policyInput).code, "git-policy-read-oid", "Object existence alone is not an application publication source");
  const wrongFormat = await chief.prepareQuery({ operationId: "chief-read-wrong-format", template: "log", limit: 1, target: { objectFormat: "sha256", hex: "a".repeat(64) } }, chiefContext);
  assert.ok(!wrongFormat.ok);
  const foreign = await fixture(), foreignCommit = await foreign.candidates.prepare({ operationId: "other-repository-object", base: null, timestamp: stamp, message: "Foreign repository",
    files: [{ path: "private.txt", bytesBase64: b64("foreign root bytes\n") }] });
  const wrongRoot = await chief.prepareQuery({ operationId: "chief-read-foreign", template: "log", limit: 1, target: foreignCommit.candidate }, chiefContext);
  assert.ok(wrongRoot.ok); assert.equal(checkGitPolicy(wrongRoot.value.policyInput).code, "git-policy-read-oid");
  assert.equal((await store.verifyExecutionBases!(bases.value)).ok, true, "Read-only history queries do not re-pin or alter the earlier frozen source tuple");
  assert.equal((await store.compareAndSwapRunRecord!("stale-bases", null, { runId: "stale-bases", ...bases.value }, { ...expected(three), gitBases: bases.value })).ok, false);
  const original = bases.value.codeBasisSource, journalPath = path.join(f.root, `.ans/trunk/operations/${hash(original.operationId)}/git.json`), bytes = await fs.readFile(journalPath);
  await fs.appendFile(journalPath, "\n"); assert.equal((await store.verifyExecutionBases!(bases.value)).ok, false, "Even JSON-equivalent original journal bytes cannot replace the frozen provenance hash"); await fs.writeFile(journalPath, bytes);
  console.log("execution-bases:old-source-and-stale-cas-verified");
  const beta = await delivery("beta", "beta", secondCode, "descendant from another actual flow\n");
  const inherited = await store.readExecutionBases!(expected(three)); assert.ok(inherited.ok); assert.deepEqual(inherited.value.codeBasis, beta);
  await delivery("gamma", "gamma", firstCode, "divergent actual head\n");
  const ambiguous = await store.readExecutionBases!(expected(three)); assert.equal(ambiguous.ok, false); if (!ambiguous.ok) assert.match(ambiguous.message!, /heads-ambiguous/);
  assert.equal((await store.verifyExecutionBases!(bases.value)).ok, true, "New ambiguous heads never force a historical run to select current live code");
  console.log("execution-bases:actual-ancestry-selected-ambiguous-heads-denied");
});

for (const format of ["sha1", "sha256"] as const) test(`Git delivery bytes: real ${format} raw commits and null/existing ref CAS preserve the code basis`, async () => {
  const f = await fixture(format), ref = "refs/ans/delivery/demo", stamp = "2026-11-05T00:00:00.000Z";
  const base = await f.candidates.prepare({ operationId: "delivery-code-base", base: null, timestamp: stamp, message: "Actual base", files: [
    { path: ".ans/trunk/manifest.json", bytesBase64: b64("existing application metadata\n") }, { path: "docs/approved.md", bytesBase64: b64("unchanged approved bytes\n") }] });
  const worker = await f.candidates.prepare({ operationId: "delivery-worker", base: base.candidate, timestamp: stamp, message: "Actual module result", files: [{ path: "src/impl/result.txt", bytesBase64: b64("actual text\n") }] });
  const integrated = await f.candidates.prepare({ operationId: "delivery-integrated", base: base.candidate, parents: [base.candidate, worker.candidate], timestamp: stamp,
    message: "Actual integration", files: [{ path: "src/impl/result.txt", bytesBase64: b64("actual text\n") }] });
  const plan = await planGitRefPublication(f.root, ref, null, integrated.candidate), baseBytes = await f.candidates.readCommitBytes(base.candidate);
  const objectOid = (encoded: string) => { const bytes = Buffer.from(encoded, "base64"); return createHash(format).update(Buffer.from(`commit ${bytes.length}\0`)).update(bytes).digest("hex"); };
  assert.equal(objectOid(plan.commitBytesBase64), integrated.candidate.hex); assert.equal(objectOid(baseBytes.bytesBase64), base.candidate.hex);
  assert.equal(plan.oldCommitBytesBase64, null); assert.deepEqual(plan.baseTree, []); assert.deepEqual(plan.commit, integrated);
  assert.equal(plan.diff.length, 3, "First ref publication has the whole CAS tree; authorization still uses the separate code base");
  for (const file of await f.candidates.listTree(base.candidate)) assert.deepEqual(plan.candidateTree.find(entry => entry.path === file.path), file);
  const input = { operationId: "delivery-publish-first", repoId: f.identity.repoId, ref, oldOid: null, newOid: integrated.candidate, tree: integrated.tree, parents: integrated.parents, requestDigest: hash("actual-first-delivery") };
  assert.equal((await f.refs.publish(input)).status, "published"); assert.equal((await f.refs.publish(input)).status, "published");
  assert.equal((await readGitDeliveryEvidence(f.root, input.operationId)).ok, false, "Low-level ref success without verified quality/task source is not completion authority");
  const newer = await f.candidates.prepare({ operationId: "delivery-next", base: integrated.candidate, timestamp: stamp, message: "Next actual candidate", files: [{ path: "src/impl/result.txt", bytesBase64: b64("next actual text\n") }] });
  const existing = await planGitRefPublication(f.root, ref, integrated.candidate, newer.candidate);
  assert.equal(objectOid(existing.oldCommitBytesBase64!), integrated.candidate.hex); assert.equal(objectOid(existing.commitBytesBase64), newer.candidate.hex);
  assert.deepEqual(existing.diff.map(row => row.newPath), ["src/impl/result.txt"]);
  const next = { ...input, operationId: "delivery-publish-next", oldOid: integrated.candidate, newOid: newer.candidate, tree: newer.tree, parents: newer.parents, requestDigest: hash("actual-next-delivery") };
  assert.equal((await f.refs.publish(next)).status, "published");
  assert.equal((await f.refs.publish({ ...input, operationId: "delivery-stale-null", requestDigest: hash("stale-null") })).status, "conflict");
  assert.deepEqual(await f.candidates.readRef(ref), newer.candidate); assert.deepEqual(await f.candidates.readRef("refs/ans/trunk"), null);
  assert.equal(await fs.stat(path.join(f.root, ".git/index")).then(() => true, () => false), false);
});

for (const format of ["sha1", "sha256"] as const) test(`Git candidates: real ${format} complete trees preserve unchanged arbitrary bytes and isolate the user index`, async () => {
  const f = await fixture(format), binary = Buffer.from([0, 255, 13, 10, 239, 187, 191]);
  const firstInput = { operationId: "candidate-first", base: null, message: "Actual first complete tree", files: [{ path: "docs/binary.dat", bytesBase64: b64(binary) }, { path: "src/owned.ts", bytesBase64: b64("v1") }] };
  const first = await f.candidates.prepare(firstInput);
  assert.equal(first.candidate.objectFormat, format); assert.equal(first.parents.length, 0);
  assert.deepEqual(Buffer.from((await f.candidates.readBlob(first.candidate, "docs/binary.dat")).bytesBase64, "base64"), binary);
  assert.deepEqual(await f.candidates.prepare(firstInput), first);
  await assert.rejects(f.candidates.prepare({ ...firstInput, message: "Different same-operation content" }), /operation-conflict/);
  assert.equal(await fs.stat(path.join(f.root, ".git/index")).then(() => true, () => false), false);
  await fs.mkdir(path.join(f.root, "src")); await fs.writeFile(path.join(f.root, "src/owned.ts"), "unselected live bytes");
  const next = await f.candidates.prepare({ operationId: "candidate-second", base: first.candidate, message: "Only the selected change", files: [{ path: "src/owned.ts", bytesBase64: b64("v2") }] });
  assert.deepEqual(next.parents, [first.candidate]); assert.equal(Buffer.from((await f.candidates.readBlob(next.candidate, "src/owned.ts")).bytesBase64, "base64").toString(), "v2");
  assert.deepEqual(Buffer.from((await f.candidates.readBlob(next.candidate, "docs/binary.dat")).bytesBase64, "base64"), binary);
  const tree = await f.candidates.listTree(next.candidate); assert.deepEqual(tree.map(file => file.path), ["docs/binary.dat", "src/owned.ts"]);
  assert.equal(await f.candidates.readRef("refs/ans/trunk"), null, "Preparing objects never publishes a trunk");
  console.log(JSON.stringify({ format, first: first.candidate, next: next.candidate, tree: next.tree, parents: next.parents }));
});

for (const format of ["sha1", "sha256"] as const) test(`Git revert Provider: real ${format} inverse applies to current code and preserves unrelated later files`, async () => {
  // Storage and pure-policy component only: these owner DTOs are not an actual application task/authorization receipt.
  const f = await fixture(format), timestamp = "2026-11-06T00:00:00.000Z";
  const parent = await f.candidates.prepare({ operationId: "revert-parent", base: null, message: "Original owner files", timestamp, files: [
    { path: "src/impl/result.txt", bytesBase64: b64("original") }, { path: "src/impl/deleted.txt", bytesBase64: b64("restore me") }] });
  const target = await f.candidates.prepare({ operationId: "revert-target", base: parent.candidate, message: "Actual change to undo", timestamp, files: [
    { path: "src/impl/result.txt", bytesBase64: b64("target") }, { path: "src/impl/added.txt", bytesBase64: b64("remove me") }, { path: "src/impl/deleted.txt", bytesBase64: null }] });
  const current = await f.candidates.prepare({ operationId: "revert-current", base: target.candidate, message: "Unrelated later work", timestamp,
    files: [{ path: "src/other/untouched.dat", bytesBase64: b64(Buffer.from([0, 255, 13, 10])) }] });
  const request = { operationId: "actual-revert-plan", base: current.candidate, commit: target.candidate, message: "Undo the target without rolling back other work", timestamp };
  const result = await f.candidates.planRevert(request); assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) return;
  const plan = result.value; assert.ok(plan.revertBasis); assert.deepEqual(plan.commit.parents, [current.candidate]);
  assert.equal(plan.revertBasis.selectedParent?.index, 1); assert.deepEqual(plan.revertBasis.selectedParent?.commit, parent.candidate);
  assert.deepEqual(plan.revertBasis.inverseChanges.map(row => row.status), ["D", "A", "M"]); assert.deepEqual(plan.revertBasis.conflicts, []);
  const revision = hash("storage-only-current-owner-basis"), facts = { repoId: f.identity.repoId, operationId: request.operationId, actorRoleId: "convener", taskId: "storage-controller", runId: "storage-run",
    authorizationRevision: revision, currentAuthorizationRevision: revision, objectFormat: format, template: "revert" as const, target: target.candidate,
    base: current.candidate, candidate: plan.commit.candidate, paths: plan.input.files.map(file => file.path), readPaths: ["."], writePaths: [], ref: plan.ref, ownedCandidateRef: plan.ref,
    worksite: plan.worksite, rawObjectPlan: plan, allDiff: { complete: true, base: current.candidate, candidate: plan.commit.candidate, entries: plan.diff },
    argv: plan.commands[0]!, commands: plan.commands, integrationGrants: [{ ownerRoleId: "impl", paths: ["src/impl/"], candidate: target.candidate, evidenceDigest: revision }] };
  assert.equal(checkGitPolicy(facts).allowed, true, JSON.stringify(checkGitPolicy(facts)));
  assert.equal(checkGitPolicy({ ...facts, integrationGrants: [{ ...facts.integrationGrants[0]!, paths: ["src/other/"] }] }).allowed, false);
  const actual = await f.candidates.prepare(plan.input); assert.deepEqual(actual, plan.commit);
  assert.equal(Buffer.from((await f.candidates.readBlob(actual.candidate, "src/impl/result.txt")).bytesBase64, "base64").toString(), "original");
  assert.equal(Buffer.from((await f.candidates.readBlob(actual.candidate, "src/impl/deleted.txt")).bytesBase64, "base64").toString(), "restore me");
  assert.deepEqual(Buffer.from((await f.candidates.readBlob(actual.candidate, "src/other/untouched.dat")).bytesBase64, "base64"), Buffer.from([0, 255, 13, 10]));
  assert.equal((await f.candidates.listTree(actual.candidate)).some(file => file.path === "src/impl/added.txt"), false);
  assert.deepEqual(await f.candidates.prepare(plan.input), actual); assert.equal(await f.candidates.readRef("refs/ans/trunk"), null);
  assert.equal(await fs.stat(path.join(f.root, ".git/index")).then(() => true, () => false), false);
  const conflicting = await f.candidates.prepare({ operationId: "revert-conflicting-current", base: current.candidate, message: "Later owner edit", timestamp, files: [{ path: "src/impl/result.txt", bytesBase64: b64("later edit") }] });
  const conflict = await f.candidates.planRevert({ ...request, operationId: "never-write-conflict", base: conflicting.candidate });
  assert.ok(!conflict.ok); if (!conflict.ok) { assert.equal(conflict.code, "git-revert-conflict"); assert.equal(conflict.basis.conflicts[0]?.path, "src/impl/result.txt"); }
  assert.equal(await f.candidates.readRef(`refs/ans/candidates/${hash("never-write-conflict")}`), null);
  await assert.rejects(f.candidates.planRevert({ ...request, mainline: 1 }), /mainline/);
  const rootRevert = await f.candidates.planRevert({ ...request, operationId: "root-revert", base: parent.candidate, commit: parent.candidate });
  assert.ok(rootRevert.ok); if (rootRevert.ok) assert.equal(rootRevert.value.revertBasis?.selectedParent, null);
  await assert.rejects(f.candidates.planRevert({ ...request, base: parent.candidate, commit: parent.candidate, mainline: 1 }), /root-mainline/);
  const merge = await f.candidates.prepare({ operationId: "real-merge-target", base: parent.candidate, parents: [parent.candidate, target.candidate], message: "Real multiple parents", timestamp,
    files: [{ path: "src/impl/result.txt", bytesBase64: b64("merge change") }] });
  await assert.rejects(f.candidates.planRevert({ ...request, base: merge.candidate, commit: merge.candidate }), /mainline/);
  const mainline = await f.candidates.planRevert({ ...request, operationId: "merge-mainline-revert", base: merge.candidate, commit: merge.candidate, mainline: 1 });
  assert.ok(mainline.ok); if (mainline.ok) assert.deepEqual(mainline.value.revertBasis?.selectedParent?.commit, parent.candidate);
  await assert.rejects(f.candidates.planRevert({ ...request, base: merge.candidate, commit: merge.candidate, mainline: 3 }), /mainline/);
  const collisionParent = await f.candidates.prepare({ operationId: "collision-parent", base: parent.candidate, message: "Original file", timestamp, files: [{ path: "src/impl/collision", bytesBase64: b64("original file") }] });
  const collisionTarget = await f.candidates.prepare({ operationId: "collision-target", base: collisionParent.candidate, message: "Remove original file", timestamp, files: [{ path: "src/impl/collision", bytesBase64: null }] });
  const collisionCurrent = await f.candidates.prepare({ operationId: "collision-current", base: collisionTarget.candidate, message: "Later nested work", timestamp, files: [{ path: "src/impl/collision/later.txt", bytesBase64: b64("keep later") }] });
  const collision = await f.candidates.planRevert({ ...request, operationId: "never-write-collision", base: collisionCurrent.candidate, commit: collisionTarget.candidate });
  assert.ok(!collision.ok); if (!collision.ok) assert.equal(collision.code, "git-revert-conflict");
  assert.equal(await f.candidates.readRef(`refs/ans/candidates/${hash("never-write-collision")}`), null);

});

test("Git ref CAS: real independent Node processes have one winner; recovery uses actual ref and immutable commit", async () => {
  const f = await fixture(), a = await f.candidates.prepare({ operationId: "candidate-a", base: null, message: "a", files: [{ path: "a.txt", bytesBase64: b64("a") }] }),
    b = await f.candidates.prepare({ operationId: "candidate-b", base: null, message: "b", files: [{ path: "a.txt", bytesBase64: b64("b") }] });
  const inputs = [a, b].map((candidate, index) => ({ operationId: `publish-${index}`, repoId: f.identity.repoId, ref: "refs/ans/trunk", oldOid: null,
    newOid: candidate.candidate, tree: candidate.tree, parents: candidate.parents, requestDigest: hash(`request-${index}`) }));
  const api = pathToFileURL(path.resolve("src/provider/trunk/public/trunk-store.ts")).href;
  const results = await Promise.all(inputs.map(input => promisify(execFile)(process.execPath, ["--input-type=module", "-e",
    `import {createGitRefStore} from ${JSON.stringify(api)};console.log(JSON.stringify(await createGitRefStore(${JSON.stringify(f.root)}).publish(${JSON.stringify(input)})));`], { windowsHide: true, timeout: 20000 }).then(value => JSON.parse(value.stdout))));
  assert.equal(results.filter(value => value.status === "published").length, 1); assert.equal(results.filter(value => value.status === "conflict").length, 1);
  const winner = results.findIndex(value => value.status === "published"), input = inputs[winner]!;
  const actual = await f.candidates.readRef("refs/ans/trunk"); assert.deepEqual(actual, input.newOid);
  const replay = await f.refs.publish(input); assert.equal(replay.status, "published"); assert.equal(replay.journal.process?.termination, "exited");
  const file = path.join(f.root, replay.journalId), saved = JSON.parse(await fs.readFile(file, "utf8"));
  await fs.writeFile(file, JSON.stringify({ ...saved, phase: "prepared" }));
  assert.equal((await createGitRefStore(f.root).publish(input)).status, "published", "Prepared phase cannot override true committed ref and settled process");
  await assert.rejects(f.refs.publish({ ...input, requestDigest: hash("different") }), /operation-replay-conflict/);
  const all = await f.refs.listJournals(); assert.equal(all.length, 1, "A precommit CAS loser does not create a false committed journal");
  console.log(JSON.stringify({ old: null, published: actual, results: results.map(value => ({ status: value.status, journalId: value.journalId })) }));
});

test("Git query: output and real process time are bounded; forced cancellation never claims whole-tree termination", async () => {
  const f = await fixture(), candidate = await f.candidates.prepare({ operationId: "large-blob", base: null, message: "bounded query", files: [{ path: "large.txt", bytesBase64: b64("x".repeat(128 * 1024)) }] });
  const bounded = await createGitQueryPort(f.root, { outputLimit: 1024 }).query({ operationId: "bounded-blob", template: "show", target: candidate.candidate, paths: ["large.txt"] });
  assert.equal(bounded.outputTruncated, true); assert.equal(Buffer.from(bounded.stdoutBase64!, "base64").length <= 1024, true); assert.equal(bounded.termination, "unknown");
  const timeout = await createGitQueryPort(f.root, { timeoutMs: 1 }).query({ operationId: "timeout", template: "status" });
  assert.equal(timeout.timedOut, true); assert.equal(timeout.termination, "unknown"); assert.ok(timeout.pid);
});

test("Git operation media: restart enumeration discovers both formats and refuses same-id rebinding", async () => {
  const f = await fixture(), legacy = createFsTrunkStore(f.root), at = "2026-11-05T00:00:00.000Z";
  const old: TrunkApplyJournal = { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, journalId: "legacy-journal", operationId: "legacy-operation", flowId: "demo", phase: "prepared",
    before: { trunkVersion: 1, runId: null, documents: {}, execution: { teamPlan: null, flow: null } },
    target: { trunkVersion: 1, runId: null, documents: {}, execution: { teamPlan: null, flow: null } }, startedAt: at, updatedAt: at };
  assert.ok((await legacy.writeOperation!(old)).ok);
  const candidate = await f.candidates.prepare({ operationId: "new-candidate", base: null, message: "Actual Git candidate", files: [{ path: "a.txt", bytesBase64: b64("actual") }] });
  const input = { operationId: "git-operation", repoId: f.identity.repoId, ref: "refs/ans/trunk", oldOid: null, newOid: candidate.candidate, tree: candidate.tree, parents: candidate.parents, requestDigest: hash("git-operation") };
  await assert.rejects(f.refs.publish({ ...input, operationId: old.operationId! }), /operation-bound-to-fs-media/);
  assert.equal((await f.refs.publish(input)).status, "published");
  const restart = createFsTrunkStore(f.root), all = await restart.listStorageOperations!(); assert.ok(all.ok);
  if (all.ok) assert.deepEqual([...all.value].sort((a, b) => a.operationId.localeCompare(b.operationId)), [{ media: "git-ref/v1", operationId: input.operationId }, { media: "fs", operationId: old.operationId }]);
  assert.equal((await restart.readOperation!(old.operationId!)).ok, true);
  const wrongReader = await restart.readOperation!(input.operationId); assert.equal(wrongReader.ok, false);
  assert.equal((await restart.writeOperation!({ ...old, operationId: input.operationId })).ok, false);
  assert.equal((await restart.listOperationRecords!()).ok, false, "Legacy-only enumeration must not silently skip Git operations");
});

test("Git mutation process fence: an unresolved prior instance survives restart and never expires from clock or missing pid", async () => {
  const f = await fixture(), dir = path.join(f.root, ".git/ans/processes"); await fs.mkdir(dir, { recursive: true });
  const processId = "00000000-0000-4000-8000-000000000001";
  await fs.writeFile(path.join(dir, `${processId}.json`), JSON.stringify({ processId, operationId: "old-unknown-operation", repoId: f.identity.repoId, startedAt: "2000-01-01T00:00:00.000Z", pid: 99999999, termination: "unknown" }));
  const restarted = createGitCandidateStore(f.root);
  await assert.rejects(restarted.prepare({ operationId: "after-unknown", base: null, message: "Must not modify", files: [{ path: "a.txt", bytesBase64: b64("blocked") }] }), /git-owned-process-unresolved/);
  assert.equal(await restarted.readRef("refs/ans/trunk"), null);
  const query = await createGitQueryPort(f.root).query({ operationId: "read-while-unknown", template: "status" }); assert.equal(query.termination, "exited", "Read-only query remains available without releasing the fence");
});

test("Git TrunkStore: full five-argument CAS, same-version workflow fence, media-bound business recovery and read-only production selection", async () => {
  const f = await fixture(), store = createGitTrunkStore(f.root), at = "2026-11-05T00:00:00.000Z";
  const initialRead = await createProjectTrunkStore(f.root).readManifest(); assert.equal(initialRead.ok, false); if (!initialRead.ok) assert.equal(initialRead.reason, "corrupt", "Selected Git with no effective ref must never trigger legacy live fallback");
  const snapshot = async (snapshotId: string, content: Record<string, string>) => {
    const files = Object.entries(content).map(([path, text]) => ({ path, sha256: hash(text), bytesBase64: b64(text) }));
    const value: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId, digest: completeSnapshotDigest(files), createdAt: at, files };
    const saved = await store.prepareSnapshot!(value); assert.ok(saved.ok, JSON.stringify(saved)); return saved.value;
  };
  const p1 = "docs/proposals/demo-proposal-v1.md", s1 = await snapshot("git-doc-1", { [p1]: "actual proposal v1" });
  const first: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1, digest: hash("document-1"), source: "bootstrap", previous: null, flowId: "demo", runId: null,
    artifacts: { documents: { proposal: { path: p1, sha256: hash("actual proposal v1"), version: 1 } }, execution: { teamPlan: null, flow: null }, boundaries: {} }, snapshotRef: s1, createdAt: at, updatedAt: at };
  const initial = await store.compareAndSwapManifest!(null, first, s1); assert.ok(initial.ok, JSON.stringify(initial));
  const s2 = await snapshot("git-doc-workflow", { [p1]: "actual proposal v1", "docs/workflow.md": "actual approved workflow bytes" });
  const attached = { ...first, snapshotRef: s2, artifacts: { ...first.artifacts, workflow: { kind: "workflow" as const, path: "docs/workflow.md", sha256: hash("actual approved workflow bytes") } } };
  assert.ok((await store.compareAndSwapManifest!({ version: 1, digest: first.digest }, attached, s2, { revision: 0, digest: null }, s1)).ok);
  assert.equal((await store.compareAndSwapManifest!({ version: 1, digest: first.digest }, attached, s2, { revision: 0, digest: null }, s1)).ok, false, "Stale same-version snapshot cannot pass the fifth fence");
  const old = await store.readManifestAt!({ version: 1, digest: first.digest }, s1); assert.ok(old.ok); if (old.ok) assert.equal(old.value.artifacts.workflow, undefined);
  const p2 = "docs/proposals/demo-proposal-v2.md", s3 = await snapshot("git-doc-2", { [p2]: "actual proposal v2", "docs/workflow.md": "actual approved workflow bytes" });
  const source = { kind: "role-direct" as const, actorRoleId: "product", action: "version-upgrade" as const, operationId: "business-document-2", applicationId: "vca-business-document-2", journalId: "journal-business-document-2", baseDigest: first.digest, targetDigest: hash("document-2"), at };
  const next: TrunkManifest = { ...attached, trunkVersion: 2, previous: { trunkVersion: 1, runId: null }, digest: source.targetDigest, actionSource: source, snapshotRef: s3,
    artifacts: { ...attached.artifacts, documents: { proposal: { path: p2, sha256: hash("actual proposal v2"), version: 2 } } } };
  const journal: TrunkApplyJournal = { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, journalId: source.journalId, operationId: source.operationId, flowId: "demo", actionSource: source,
    before: { trunkVersion: 1, runId: null, documents: first.artifacts.documents, execution: first.artifacts.execution },
    target: { trunkVersion: 2, runId: null, documents: next.artifacts.documents, execution: next.artifacts.execution, workflow: { path: "docs/workflow.md", sha256: hash("actual approved workflow bytes") } },
    beforeSnapshot: s2, targetSnapshot: s3, phase: "prepared", startedAt: at, updatedAt: at };
  assert.ok((await store.writeOperation!(journal)).ok); assert.equal((await store.readOperationCommit!(journal)).ok, false);
  const changed = await store.compareAndSwapManifest!({ version: 1, digest: first.digest }, next, s3, { revision: 0, digest: null }, s2); assert.ok(changed.ok, JSON.stringify(changed));
  const recovered = await store.readOperationCommit!(journal); assert.ok(recovered.ok, JSON.stringify(recovered));
  const phaseIndependentBasis = await store.readExecutionBases!({ trunk: { version: next.trunkVersion, digest: next.digest }, active: { revision: 0, digest: null }, snapshot: s3 });
  assert.ok(phaseIndependentBasis.ok, JSON.stringify(phaseIndependentBasis));
  const lag = await store.readOperation!(source.operationId); assert.ok(lag.ok); if (lag.ok) assert.equal(lag.value.phase, "prepared", "Business phase can lag the actual ref commit");
  const oidBefore = await f.candidates.readRef("refs/ans/trunk"); assert.ok((await store.writeOperation!({ ...journal, phase: "committed", result: "committed" })).ok);
  assert.equal((await store.verifyExecutionBases!(phaseIndependentBasis.value)).ok, true, "A real business-journal phase acknowledgement cannot invalidate the frozen commit/object/source binding");
  assert.deepEqual(await f.candidates.readRef("refs/ans/trunk"), oidBefore, "Metadata recovery cannot publish another version");
  assert.equal(await fs.stat(path.join(f.root, `.ans/trunk/operations/${hash(source.operationId)}.json`)).then(() => true, () => false), false, "One original operation has one physical media record");
  await fs.unlink(path.join(f.root, `.ans/trunk/snapshots/${s1.snapshotId}.json`)); await fs.unlink(path.join(f.root, `.ans/trunk/snapshots/${s2.snapshotId}.json`)); await fs.unlink(path.join(f.root, `.ans/trunk/snapshots/${s3.snapshotId}.json`));
  const bytes = await store.readSnapshot!(s1); assert.ok(bytes.ok); if (bytes.ok) assert.equal(bytes.value.files[0]?.sha256, hash("actual proposal v1"));
  const selected = createProjectTrunkStore(f.root), read = await selected.readManifest(); assert.ok(read.ok, JSON.stringify(read)); if (read.ok) assert.equal(read.value.trunkVersion, 2);
  assert.equal((await selected.compareAndSwapManifest!({ version: 2, digest: next.digest }, next, s3, { revision: 0, digest: null })).ok, false, "Production selection never grants a mutation lease");
  assert.deepEqual(await f.candidates.readRef("refs/ans/trunk"), oidBefore);
});

test("Git migration: actual legacy committed and pending operations keep their original media proof", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-git-migration-")), legacy = createFsTrunkStore(root), at = "2026-11-05T00:00:00.000Z";
  const makeSnapshot = async (snapshotId: string, text: string) => { const files = [{ path: "docs/actual.md", sha256: hash(text), bytesBase64: b64(text) }];
    const saved = await legacy.prepareSnapshot!({ schema: "complete-snapshot/v1", snapshotId, digest: completeSnapshotDigest(files), files, createdAt: at }); assert.ok(saved.ok); return saved.value; };
  const oldSnapshot = await makeSnapshot("legacy-committed-bytes", "old actual committed bytes"), pendingSnapshot = await makeSnapshot("legacy-uncommitted-bytes", "pending actual bytes");
  const source = (operationId: string, baseDigest: string | null, targetDigest: string) => ({ kind: "role-direct" as const, actorRoleId: "product", action: "version-upgrade" as const, operationId, applicationId: `vca-${operationId}`, journalId: `j-${operationId}`, baseDigest, targetDigest, at });
  const oldSource = source("old-committed-op", null, hash("old-document")), pendingSource = source("old-uncommitted-op", oldSource.targetDigest, hash("next-document"));
  const first: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1, source: "bootstrap", previous: null, flowId: "demo", runId: null,
    artifacts: { documents: { proposal: { path: "docs/actual.md", sha256: hash("old actual committed bytes"), version: 1 } }, execution: { teamPlan: null, flow: null }, boundaries: {} },
    digest: oldSource.targetDigest, snapshotRef: oldSnapshot, actionSource: oldSource, createdAt: at, updatedAt: at };
  const journal = (which: typeof oldSource, snapshot: typeof oldSnapshot, version: number): TrunkApplyJournal => ({ v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, operationId: which.operationId, journalId: which.journalId, flowId: "demo", phase: "prepared", actionSource: which,
    before: { trunkVersion: 1, runId: null, documents: first.artifacts.documents, execution: first.artifacts.execution },
    target: { trunkVersion: version, runId: null, documents: { proposal: { path: "docs/actual.md", sha256: hash(version === 1 ? "old actual committed bytes" : "pending actual bytes") } }, execution: first.artifacts.execution }, targetSnapshot: snapshot, startedAt: at, updatedAt: at });
  const committed = journal(oldSource, oldSnapshot, 1), pending = journal(pendingSource, pendingSnapshot, 2);
  assert.ok((await legacy.writeOperation!(committed)).ok); assert.ok((await legacy.compareAndSwapManifest!(null, first, oldSnapshot)).ok); assert.ok((await legacy.writeOperation!(pending)).ok);
  await initializeGitRepository(root);
  const migrated = await migrateLegacyTrunkToGit(root, { operationId: "actual-migration", expected: { version: 1, digest: first.digest } }); assert.ok(migrated.ok, JSON.stringify(migrated));
  const git = createGitTrunkStore(root);
  assert.equal((await git.readOperationCommit!(committed)).ok, true, "A real old FS commit remains committed despite its lagging prepared phase");
  assert.equal((await git.readOperationCommit!(pending)).ok, false);
  const copied: TrunkManifest = { ...first, trunkVersion: 2, previous: { trunkVersion: 1, runId: null }, snapshotRef: pendingSnapshot, digest: pendingSource.targetDigest,
    actionSource: source("different-real-git-op", first.digest, pendingSource.targetDigest), artifacts: { ...first.artifacts, documents: { proposal: { path: "docs/actual.md", sha256: hash("pending actual bytes"), version: 2 } } } };
  assert.ok((await git.compareAndSwapManifest!({ version: 1, digest: first.digest }, copied, pendingSnapshot, { revision: 0, digest: null }, oldSnapshot)).ok);
  assert.equal((await git.readOperationCommit!(pending)).ok, false, "New Git with exactly the old pending target bytes/digest cannot fabricate its FS commit");
  assert.equal((await git.readOperationCommit!(committed)).ok, true);
  assert.equal((await legacy.readManifest()).ok, false, "An old unconverted reader cannot treat the compatibility projection as effective");
  assert.equal((await legacy.compareAndSwapManifest!({ version: 1, digest: first.digest }, copied, pendingSnapshot)).ok, false);
  const selected = await createProjectTrunkStore(root).readManifest(); assert.ok(selected.ok); if (selected.ok) assert.equal(selected.value.trunkVersion, 2);
});
