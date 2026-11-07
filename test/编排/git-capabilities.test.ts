import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { initializeGitRepository, createFsTrunkStore, createProjectTrunkStore, createGitQueryPort, createGitCandidateStore, createGitRefStore, migrateLegacyTrunkToGit, checkGitHostAction } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGitCapabilityService, createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createGitRoleRuntime, recordTaskObservation, recordGitHostInventory, beginGitHostAction, endGitHostAction, recordGitHostInterruption, inspectGitHostCoordinator, prepareRoleDispatch, freezeExecutionRun, readRunRoleContext, inspectAssignedTask, prepareAssignedTaskWriteScope, prepareParentTaskRef, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, type GitHostInventory } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createVersionChangeStack } from "../../app/desktop/version-change.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createGuardFreezeRegistry } from "../../src/provider/version-change/public/version-change-store.ts";
import { checkGitPolicy, computeGitPolicyDigest } from "../../src/service/gate/shell-rules.ts";
import type { TaskCreatedEvent, GitQueryRequest } from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { validateRoleDocumentsSnapshot, validateBoundaryYamlText } from "../../src/service/boundary/resolve-boundary.ts";
import { createTrunkProject, PATHS } from "./fixtures/trunk-project.ts";
import { TRUNK_MANIFEST_SCHEMA, FROZEN_ROLE_REF_KEYS, type TrunkManifest } from "../../src/model/trunk.ts";
import { validateTaskStateEvent } from "../../src/common/编排/task-state.ts";
const at = "2026-11-05T00:00:00.000Z";
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-git-service-")); await initializeGitRepository(root);
  const store = createFsTrunkStore(root), runId = "run-git-query";
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: at })).ok);
  const task: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "git-query-task", from: "chief", to: "product", text: "Inspect this planning project",
    sideEffect: "read-only", idempotencyKey: "git-query-task", flowId: "demo", runId, runState: "draft" };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: task })).ok);
  await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/actual.md"), "Actual planning file");
  return { root, task, context: { actorRoleId: "product", taskId: task.taskId, runId, readPaths: ["docs/"] } };
}

for (const legacy of [false, true]) test(`Delivered ${legacy ? "legacy" : "Hub"} code provenance: an explicit real read-only trace keeps its original quality creator and frozen sources`,
  { skip: !process.env[legacy ? "ANS_O61_READONLY_LEGACY_ROOT" : "ANS_O61_READONLY_DELIVERY_ROOT"] }, async () => {
  // The caller supplies existing real production evidence. Nothing is seeded, copied, approved or written into that root.
  const root = process.env[legacy ? "ANS_O61_READONLY_LEGACY_ROOT" : "ANS_O61_READONLY_DELIVERY_ROOT"]!, store = createProjectTrunkStore(root), service = createTrunkService({ projectRoot: root });
  const current = await store.readManifest(); assert.ok(current.ok); if (!current.ok || !current.value.snapshotRef) return;
  const read = await store.readExecutionBases!({ trunk: { version: current.value.trunkVersion, digest: current.value.digest },
    active: { revision: current.value.activeRevision!, digest: current.value.activeDigest! }, snapshot: current.value.snapshotRef });
  assert.ok(read.ok, JSON.stringify(read)); if (!read.ok || read.value.codeBasisSource.kind !== "delivery-ref") assert.fail("An actual settled delivery is required");
  const bases = read.value, source = bases.codeBasisSource;
  assert.equal(source.kind, "delivery-ref"); if (source.kind !== "delivery-ref") return;
  const operation = await createGitRefStore(root).readJournal(source.operationId); assert.ok(operation && operation.phase === "published" && operation.deliverySource);
  if (!operation || operation.phase !== "published" || !operation.deliverySource) return;
  const delivery = operation.deliverySource;
  const paths = [".ans/state/tasks.jsonl", `.ans/runs/${source.sourceRunId}/manifest.json`, `.ans/trunk/operations/${createHash("sha256").update(source.operationId).digest("hex")}/git.json`,
    `.git/${bases.codeBasis.ref}`, ".git/refs/ans/trunk"];
  const fingerprints = async () => Promise.all(paths.map(async file => createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex")));
  const before = await fingerprints();
  const ledger = (await fs.readFile(path.join(root, ".ans/state/tasks.jsonl"), "utf8")).trim().split("\n").map(line => validateTaskStateEvent(JSON.parse(line)));
  const quality = ledger.find(row => row.ok && row.event.kind === "task.created" && row.event.taskId === delivery.qualityTaskId);
  const accepted = ledger.find(row => row.ok && row.event.kind === "task.closed" && row.event.eventId === delivery.creatorCloseEventId);
  assert.ok(quality?.ok && quality.event.kind === "task.created" && accepted?.ok && accepted.event.kind === "task.closed");
  if (!quality?.ok || quality.event.kind !== "task.created") return;
  assert.equal(quality.event.hubRouting, legacy ? undefined : "chief-hub-v1"); assert.equal(quality.event.from, legacy ? "convener" : "chief");
  if (legacy) assert.equal(quality.event.parentTaskRef?.taskId, source.controllerTaskId); else assert.equal(quality.event.parentTaskRef, undefined);
  if (accepted?.ok && accepted.event.kind === "task.closed") assert.equal(accepted.event.by, legacy ? "convener" : "chief");
  const actual = await service.inspectExecutionCodeSource(bases); assert.ok(actual.ok, JSON.stringify(actual)); if (!actual.ok) return;
  assert.equal(actual.value.controllerTask?.taskId, source.controllerTaskId);
  assert.deepEqual(actual.value.bases, bases);
  assert.notDeepEqual(bases.codeBasis.oid, bases.documentGitBasis.oid, "Newer document metadata does not replace the real delivered code OID");
  for (const wrong of [
    { ...bases, codeBasisSource: { ...source, controllerTaskId: "not-the-actual-controller" } },
    { ...bases, codeBasisSource: { ...source, sourceRunId: "not-the-actual-delivered-run" } },
    { ...bases, codeBasisSource: { ...source, operationId: "not-the-actual-delivery-operation" } },
    { ...bases, codeBasisSource: { ...source, journalSha256: "0".repeat(64) } },
    { ...bases, codeBasis: { ...bases.codeBasis, oid: { objectFormat: bases.codeBasis.oid!.objectFormat, hex: "0".repeat(bases.codeBasis.oid!.hex.length) } } },
  ]) assert.equal((await service.inspectExecutionCodeSource(wrong)).ok, false);
  if (!legacy) {
  const ref = quality.event.workSourceRef; assert.ok(ref); if (!ref) return;
  const stored = await store.readInitializationSource!(ref.sourceId); assert.ok(stored.ok); if (!stored.ok) return;
  // Component fault injections into the lower reader, never changes to actual closed tasks or their immutable evidence.
  for (const mutate of [
    (value: Record<string, unknown>) => { delete value.hubRouting; },
    (value: Record<string, unknown>) => { assert.ok(value.parent && typeof value.parent === "object"); Reflect.set(value.parent, "roleId", "convener"); },
    (value: Record<string, unknown>) => { assert.ok(value.reviewControllerRef && typeof value.reviewControllerRef === "object"); Reflect.set(value.reviewControllerRef, "taskId", "not-the-original-controller"); },
    (value: Record<string, unknown>) => { assert.ok(value.reviewBasisRef && typeof value.reviewBasisRef === "object"); const candidate: unknown = Reflect.get(value.reviewBasisRef, "candidate");
      assert.ok(candidate && typeof candidate === "object"); const hex: unknown = Reflect.get(candidate, "hex"); assert.ok(typeof hex === "string"); Reflect.set(candidate, "hex", "0".repeat(hex.length)); },
  ]) {
    const value: Record<string, unknown> = JSON.parse(Buffer.from(stored.value.bytesBase64, "base64").toString("utf8")); mutate(value);
    const faulty = createTrunkService({ projectRoot: root, freezeRegistry: createGuardFreezeRegistry(root), store: { ...store,
      async readInitializationSource(id) { const original = await store.readInitializationSource!(id); return id === ref.sourceId && original.ok
        ? { ok: true, value: { ...original.value, bytesBase64: Buffer.from(JSON.stringify(value)).toString("base64") } } : original; } } });
    assert.equal((await faulty.inspectExecutionCodeSource(bases)).ok, false);
  }
  }
  assert.deepEqual(await fingerprints(), before, "Read-only source inspection never changes the ledger, delivery, document ref or old run");
});

test("Review assignment: an expected OID or built-in name cannot replace a real integrated run and host criterion", async () => {
  const f = await fixture(), service = createTrunkService({ projectRoot: f.root }), target = { operationId: "not-a-real-integration", candidate: { objectFormat: "sha1" as const, hex: "a".repeat(40) } };
  const wrongParent = await service.prepareReviewTask({ parentTaskId: f.task.taskId, flowId: "demo", runId: f.task.runId!, target });
  assert.equal(wrongParent.ok, false);
  const parentTaskId = "actual-draft-review-controller";
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: { ...f.task, taskId: parentTaskId, to: "convener", idempotencyKey: parentTaskId } })).ok);
  const noRunEvidence = await service.prepareReviewTask({ parentTaskId, flowId: "demo", runId: f.task.runId!, target });
  assert.equal(noRunEvidence.ok, false, "A real controller alone does not synthesize the future pin/candidate/criteria");
  const runBeforeStop = await fs.readFile(path.join(f.root, ".ans/runs", f.task.runId!, "manifest.json"));
  const stopRequest = { operationId: "actual-unproven-stop", runId: f.task.runId!, expectedPinDigest: "b".repeat(64), targetTrunk: { version: 1, digest: "c".repeat(64) }, mode: "stop-and-restart" as const, reason: "An actual source must precede any stop" };
  assert.equal((await service.prepareRunChange({ request: stopRequest, actorRoleId: "rapporteur", taskId: f.task.taskId, replacementRunId: "not-a-real-target" })).ok, false,
    "No future replacement pin, role name or default data can stop a draft without actual executable old/target evidence");
  const noActualActor = await prepareRunChange({ projectRoot: f.root, request: stopRequest, requesterTaskId: f.task.taskId });
  assert.ok(!noActualActor.ok); assert.equal(noActualActor.code, "run-change-actor-unproven");
  const copiedHostReference = await finalizeRunChange({ projectRoot: f.root, planId: "model-supplied-plan", requestDigest: "d".repeat(64) });
  assert.ok(!copiedHostReference.ok); assert.equal(copiedHostReference.errorCode, "run-preparation-invalid");
  assert.deepEqual(await fs.readFile(path.join(f.root, ".ans/runs", f.task.runId!, "manifest.json")), runBeforeStop, "Rejected preparation/finalization never changes the old run or creates a replacement");
  const dispatch = await service.prepareRoleDispatch({ fromRoleId: "convener", targetRoleId: "verifier", parentTaskId, flowId: "demo", runId: f.task.runId });
  assert.equal(dispatch.ok, false, "A built-in target cannot bypass an explicit review binding");
  const parent = await service.prepareParentTaskRef({ actorRoleId: "convener", taskId: parentTaskId, flowId: "demo", runId: f.task.runId! }); assert.ok(parent.ok); if (!parent.ok) return;
  const reviewTask: TaskCreatedEvent = { ...f.task, taskId: "forged-host-review", from: "convener", to: "verifier", idempotencyKey: "forged-host-review", parentTaskRef: parent.parentTaskRef,
    reviewBasisRef: { kind: "git-candidate-review", candidateOperationId: target.operationId, candidate: target.candidate, criteria: [{ oid: target.candidate, path: "docs/proposals/demo-proposal-v1.md", sha256: "b".repeat(64) }] } };
  const before = await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl"));
  const forged = await recordTaskObservation({ projectRoot: f.root, event: reviewTask }); assert.ok(!forged.ok); assert.equal(forged.code, "task-review-basis-required");
  assert.deepEqual(await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl")), before);
  assert.equal((await service.readAssignedReviewContext({ taskId: f.task.taskId, actorRoleId: "verifier" })).ok, false);
});

test("Chief final review and resume: exact host-shaped refs cannot invent integration, quality or reopen an ordinary preparation", async () => {
  const f = await fixture(), service = createTrunkService({ projectRoot: f.root });
  const host = { registration: { source: "native-directory-selection" as const, selectionId: "trusted-service-test-selection", selectedRoot: f.root, projectRoot: f.root, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief" as const, runtime: "codex" as const, sessionId: "trusted-service-test-chief", turnId: "review-test-turn", inputAccepted: true as const, settled: false as const, kind: "message" } };
  const target = { operationId: "absent-final-integration", candidate: { objectFormat: "sha1" as const, hex: "a".repeat(40) } };
  const before = await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl"), "utf8");
  const missing = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "verifier", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: host, reviewTarget: target });
  assert.ok(!missing.ok); assert.match(missing.message, /actual same-flow integration controller/);
  const privateActor = await prepareRoleDispatch({ projectRoot: f.root, fromRoleId: "chief", targetRoleId: "verifier", flowId: "demo", hostInitialization: host, reviewTarget: target });
  assert.equal(privateActor.ok, false, "Ordinary host data cannot replace private actual Chief invocation identity");
  const ordinary = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "verifier", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: host });
  assert.ok(ordinary.ok); if (!ordinary.ok || !ordinary.value.initializationSource || !ordinary.value.runId) return;
  assert.equal(ordinary.value.kind, "planning"); assert.equal(ordinary.value.reviewControllerRef, undefined);
  const source = ordinary.value.initializationSource, ref = { kind: "git-candidate-review" as const, candidateOperationId: target.operationId, candidate: target.candidate,
    criteria: [{ oid: target.candidate, path: "docs/proposals/demo-proposal-v1.md", sha256: "b".repeat(64) }] };
  const fakeFinal: TaskCreatedEvent = { ...f.task, taskId: "forged-chief-final-review", from: "chief", to: "verifier", idempotencyKey: "forged-chief-final-review",
    hubRouting: "chief-hub-v1", runId: ordinary.value.runId, runState: "pinned", reviewBasisRef: ref,
    reviewControllerRef: { kind: "convener-controller", taskId: "absent-controller", flowId: "demo", runId: ordinary.value.runId, reviewBasisRef: ref },
    workSourceRef: { kind: "chief-customer-turn", sourceId: source.sourceId, path: source.path, sha256: source.sha256 } };
  const rejected = await recordTaskObservation({ projectRoot: f.root, event: fakeFinal }); assert.ok(!rejected.ok); assert.equal(rejected.code, "task-review-basis-required");
  const resumeController = { taskId: "absent-controller", flowId: "demo", runId: ordinary.value.runId, reviewTaskId: fakeFinal.taskId, reviewCloseOperationId: "absent-review-close" };
  const resume = await service.prepareControllerResume({ resumeController, hostInitialization: host }); assert.ok(!resume.ok); assert.match(resume.message ?? "", /actual Chief-created final review/);
  assert.equal((await prepareControllerResume({ projectRoot: f.root, resumeController, hostInitialization: host })).ok, false);
  const queued = { projectRoot: f.root, resumeController, resumeKey: "a".repeat(64), basisDigest: "b".repeat(64) };
  const unissued = await inspectQueuedControllerResume(queued); assert.ok(!unissued.ok); assert.equal(unissued.code, "controller-resume-queue-source-unproven");
  assert.equal((await inspectQueuedControllerResume({ ...queued, resumeController: { ...resumeController, taskId: f.task.taskId } })).ok, false, "A different actual assignment cannot replay a plain queue receipt");
  assert.equal((await inspectQueuedControllerResume({ ...queued, basisDigest: "c".repeat(64) })).ok, false);
  assert.equal((await service.inspectQueuedControllerResume({ resumeController })).ok, false, "The domain inspector rechecks quality/task facts even without a live Chief turn");
  assert.equal((await service.inspectQueuedControllerResume({ resumeController: { ...resumeController, flowId: "other" } })).ok, false);
  assert.deepEqual(await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl"), "utf8"), before, "All rejected expectations leave actual tasks and their creators unchanged");
  assert.equal((await service.readAssignedReviewContext({ taskId: fakeFinal.taskId, actorRoleId: "verifier" })).ok, false);
});

test("Delivery authority: expected object refs and a role name do not replace real accepted independent quality", async () => {
  const f = await fixture(), objects = createGitCandidateStore(f.root), target = await objects.prepare({ operationId: "unapproved-delivery-object", base: null, timestamp: at,
    message: "Only an object", files: [{ path: "src/impl/result.txt", bytesBase64: Buffer.from("real bytes\n").toString("base64") }] });
  const request = { operationId: "unapproved-delivery-publish", target: "delivery" as const, expected: { ref: "refs/ans/delivery/demo", oid: null }, candidate: target.candidate,
    criteria: [], evidence: [], creatorCloseOperationId: "not-an-actual-quality-close" };
  const product = createGitCapabilityService({ projectRoot: f.root, context: f.context });
  const wrong = await product.prepareDelivery(request); assert.equal(wrong.ok, false); if (!wrong.ok) assert.equal(wrong.result.code, "git-delivery-request-invalid");
  const parentTaskId = "actual-open-delivery-controller";
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: { ...f.task, taskId: parentTaskId, to: "convener", idempotencyKey: parentTaskId } })).ok);
  const controller = createGitCapabilityService({ projectRoot: f.root, context: { ...f.context, actorRoleId: "convener", taskId: parentTaskId } });
  const missingQuality = await controller.prepareDelivery(request); assert.equal(missingQuality.ok, false); if (!missingQuality.ok) assert.equal(missingQuality.result.code, "git-delivery-quality-unproven");
  const runtime = createGitRoleRuntime({ projectRoot: f.root, context: { ...f.context, actorRoleId: "convener", taskId: parentTaskId } });
  assert.equal((await runtime.gitPublish(request)).code, "git-delivery-quality-unproven");
  assert.deepEqual(await objects.readRef(request.expected.ref), null); assert.equal(await createGitRefStore(f.root).readJournal(request.operationId), null);
});
test("Revert Service/Pipeline: real objects and a controller title cannot invent a pin or Chief quality", async () => {
  const f = await fixture(), objects = createGitCandidateStore(f.root), native = await objects.prepare({ operationId: "unassigned-revert-target", base: null, timestamp: at, message: "Actual native object only",
    files: [{ path: "src/impl/result.txt", bytesBase64: Buffer.from("real original\n").toString("base64") }] });
  const controllerTaskId = "actual-draft-revert-controller";
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: { ...f.task, taskId: controllerTaskId, to: "convener", idempotencyKey: controllerTaskId } })).ok);
  const context = { ...f.context, taskId: controllerTaskId, actorRoleId: "convener", readPaths: ["."] };
  const request = { action: "revert" as const, operationId: "unproven-revert", commit: native.candidate, base: { ref: "refs/ans/trunk", oid: native.candidate }, message: "A real object is not an execution grant" };
  const runPath = path.join(f.root, ".ans/runs", f.task.runId!, "manifest.json"), beforeRun = await fs.readFile(runPath), ledger = await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl"));
  const service = createGitCapabilityService({ projectRoot: f.root, context }), prepared = await service.prepareRevert(request);
  assert.ok(!prepared.ok); if (!prepared.ok) assert.equal(prepared.result.code, "git-revert-code-basis-conflict");
  const runtime = createGitRoleRuntime({ projectRoot: f.root, context });
  assert.equal((await runtime.gitCandidate(request)).code, "git-revert-controller-unproven", "No actual Core/tool means no implicit freeze");
  const wrongRole = createGitRoleRuntime({ projectRoot: f.root, context: f.context });
  assert.equal((await wrongRole.gitCandidate(request)).code, "git-revert-controller-unproven");
  const delivery = await service.prepareDelivery({ operationId: "unapproved-revert-delivery", target: "delivery", candidate: native.candidate, expected: { ref: "refs/ans/delivery/demo", oid: null },
    criteria: [], evidence: [], creatorCloseOperationId: "not-a-real-quality-close" });
  assert.ok(!delivery.ok); if (!delivery.ok) assert.equal(delivery.result.code, "git-delivery-quality-unproven");
  assert.deepEqual(await fs.readFile(runPath), beforeRun); assert.deepEqual(await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl")), ledger);
  assert.equal(await objects.readRef("refs/ans/delivery/demo"), null);
  assert.equal(await objects.readRef(`refs/ans/candidates/${createHash("sha256").update(request.operationId).digest("hex")}`), null);
});

test("Git Service/Pipeline: actual task/run plus G exact argv/read policy permits a bounded query", async () => {
  const f = await fixture(), runtime = createGitRoleRuntime({ projectRoot: f.root, context: f.context });
  const request: GitQueryRequest = { operationId: "query-planning", template: "status", paths: ["docs/actual.md"] };
  const result = await runtime.gitQuery(request); assert.equal(result.status, "observed", JSON.stringify(result)); assert.match(result.output!, /docs\/actual.md/);
  assert.equal((await runtime.gitQuery({ ...request, paths: ["src/private.ts"] })).status, "blocked");
  assert.equal((await runtime.gitQuery({ ...request, paths: [] })).status, "blocked", "A locally scoped role cannot ask for all repository paths");
  const wrong = createGitRoleRuntime({ projectRoot: f.root, context: { ...f.context, actorRoleId: "verifier" } });
  assert.equal((await wrong.gitQuery(request)).code, "git-task-binding-unproven");
  assert.equal((await runtime.gitQuery({ ...request, template: "show", target: { objectFormat: "sha1", hex: "a".repeat(40) } })).code, "git-policy-read-oid");
});
test("Git Service: policy result binds current repo/task/run/revision and cannot be reused after actual ledger change", async () => {
  const f = await fixture(), service = createGitCapabilityService({ projectRoot: f.root });
  const prepared = await service.prepareQuery({ operationId: "bound-query", template: "status", paths: ["docs/actual.md"] }, f.context);
  assert.ok(prepared.ok); if (!prepared.ok) return;
  assert.equal(prepared.value.inputDigest, computeGitPolicyDigest(prepared.value.policyInput));
  const verdict = checkGitPolicy(prepared.value.policyInput); assert.equal(verdict.allowed, true, JSON.stringify(verdict));
  assert.equal((await service.executeQuery(prepared.value, { allowed: true, inputDigest: "0".repeat(64) })).code, "git-policy-binding-invalid");
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: { v: 1, at, kind: "task.reported", taskId: f.task.taskId, from: "product", status: "blocked", summary: "Actual newer task evidence" } })).ok);
  assert.equal((await service.executeQuery(prepared.value, verdict)).code, "git-query-basis-stale");
});
test("Git modification Service: no self-reported proof or script identity can open mutations; Git metadata stays unchanged", async () => {
  const f = await fixture(), runtime = createGitRoleRuntime({ projectRoot: f.root, context: f.context });
  const oid = { objectFormat: "sha1" as const, hex: "a".repeat(40) };
  const rootIdentity = await createGitQueryPort(f.root).inspect();
  const refsBefore = await fs.readFile(path.join(f.root, ".git/HEAD"));
  const readOnly = await runtime.gitQuery({ operationId: "read-is-not-write-authority", template: "status", paths: ["docs/actual.md"] });
  assert.equal(readOnly.status, "observed", JSON.stringify(readOnly));
  const candidate = await runtime.gitCandidate({ operationId: "blocked-candidate", action: "commit", base: { ref: "refs/ans/trunk", oid: null }, paths: ["docs/actual.md"], message: "Cannot self authorize" });
  assert.equal(candidate.status, "blocked"); assert.equal(candidate.code, "git-worker-request-invalid", "An actual read cannot supply this planning task's missing immutable execution basis");
  for (const ref of ["refs/ans/delivery/demo", "refs/heads/main"]) {
    const unbound = await runtime.gitCandidate({ operationId: `blocked-basis-${ref === "refs/heads/main" ? "head" : "delivery"}`, action: "commit",
      base: { ref, oid }, paths: ["docs/actual.md"], message: "A supplied base is not assigned execution authority" });
    assert.equal(unbound.status, "blocked");
    assert.equal(unbound.code, ref === "refs/heads/main" ? "git-worker-request-invalid" : "git-worker-task-unproven", JSON.stringify(unbound));
  }
  const published = await runtime.gitPublish({ operationId: "blocked-publish", target: "documents", expected: { ref: "refs/ans/trunk", oid: null }, candidate: oid, criteria: [], evidence: [] });
  assert.equal(published.status, "blocked"); assert.equal(published.repoId, rootIdentity.repoId);
  assert.deepEqual(await fs.readFile(path.join(f.root, ".git/HEAD")), refsBefore);
  assert.equal(await fs.stat(path.join(f.root, ".git/refs/ans/trunk")).then(() => true, () => false), false);
  assert.equal(await fs.stat(path.join(f.root, ".git/ans/processes")).then(() => true, () => false), false);
});

test("Git normal read tool: host-bound query reaches real Git; a global query does not fabricate a task", async () => {
  const f = await fixture(), runtime = createGitRoleRuntime({ projectRoot: f.root, context: f.context });
  const observed: string[] = [];
  const handle = await openRoleSession({ roleId: "product", runtime: "demo", autoRepin: false,
    project: { projectRoot: f.root, skillRoot: path.join(f.root, "skill-root"), roles: {}, governanceModel: "trio", builtInRoles: ["product"],
      governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:actual-host" } } },
    gitQuery: async request => { const result = await runtime.gitQuery(request); observed.push(result.status); return result; },
  }, { runtimeOptions: { writeRoot: f.root, providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "git_query", args: { operationId: "tool-query", template: "status", paths: ["docs/actual.md"] } }]) } } });
  await handle.send("Read the actual project Git status"); await handle.dispose(); assert.deepEqual(observed, ["observed"]);
  const ledgerBefore = await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl"));
  const global = createGitRoleRuntime({ projectRoot: f.root, context: { actorRoleId: "chief", readPaths: ["."] } });
  assert.equal((await global.gitQuery({ operationId: "global-read", template: "status" })).status, "observed");
  assert.deepEqual(await fs.readFile(path.join(f.root, ".ans/state/tasks.jsonl")), ledgerBefore);
});

test("Git host coordination: ordinary unknown inventory serializes real host actions without minting a mutation permit", async () => {
  const f = await fixture();
  const inventory: GitHostInventory = { source: "desktop-session-manager", projectRoot: f.root, observedAt: at, revision: 1, sessions: [], pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: ["Historical coverage has not been proven"] };
  const recorded = recordGitHostInventory(inventory); assert.ok(recorded.ok); if (!recorded.ok) return;
  const begin = beginGitHostAction({ projectRoot: f.root, kind: "session-open", expectedCoordinatorRevision: recorded.coordinatorRevision }); assert.ok(begin.ok); if (!begin.ok) return;
  assert.equal(beginGitHostAction({ projectRoot: f.root, kind: "git-mutation" }).ok, false);
  assert.equal(endGitHostAction({ projectRoot: f.root, leaseId: "wrong-instance" }).ok, false);
  assert.equal(recordGitHostInventory({ ...inventory, revision: 0 }).ok, false);
  assert.equal(recordGitHostInventory({ ...inventory, observedAt: "2026-11-05T00:00:01.000Z" }).ok, true, "Observation time alone is not a new permission revision");
  assert.equal(recordGitHostInventory({ ...inventory, pendingOpens: ["another-open"] }).ok, false);
  const refusedRelease = endGitHostAction({ projectRoot: f.root, leaseId: begin.leaseId, inventory: { ...inventory, pendingOpens: ["actual-unpublished-change"] } });
  assert.ok(!refusedRelease.ok); assert.equal(refusedRelease.code, "git-host-inventory-revision-conflict");
  assert.equal(inspectGitHostCoordinator({ projectRoot: f.root }).activeAction, "session-open", "A failed same-revision inventory publish retains the actual owner lease, never silently releases it");
  const stillBusy = beginGitHostAction({ projectRoot: f.root, kind: "session-open" }); assert.ok(!stillBusy.ok); assert.equal(stillBusy.code, "git-host-coordinator-busy");
  assert.equal(endGitHostAction({ projectRoot: f.root, leaseId: begin.leaseId, inventory: { ...inventory, revision: 2, pendingOpens: ["actual-open"] } }).ok, true);
  assert.equal(inspectGitHostCoordinator({ projectRoot: f.root }).activeAction, undefined, "Only the same actual owner with fresh revision/complete inventory can end its lease");
  assert.equal(inspectGitHostCoordinator({ projectRoot: f.root }).coverage, "unknown");
  const runtime = createGitRoleRuntime({ projectRoot: f.root, context: f.context });
  assert.equal((await runtime.gitCandidate({ operationId: "no-permit-from-lease", action: "commit", base: { ref: "refs/ans/trunk", oid: null }, paths: ["docs/actual.md"], message: "still blocked" })).code, "git-worker-request-invalid", "A lease cannot turn a planning task/absent code base into an executable worker assignment");
});

test("Git cross-project admission: one actual mutation lease excludes new actors everywhere and emergency facts invalidate without releasing it", async () => {
  const one = await fs.mkdtemp(path.join(os.tmpdir(), "ans-global-lease-a-")), two = await fs.mkdtemp(path.join(os.tmpdir(), "ans-global-lease-b-"));
  const opening = beginGitHostAction({ projectRoot: two, kind: "session-open" }); assert.ok(opening.ok); if (!opening.ok) return;
  try { assert.equal(beginGitHostAction({ projectRoot: one, kind: "git-mutation" }).ok, false); } finally { endGitHostAction({ projectRoot: two, leaseId: opening.leaseId }); }
  const mutation = beginGitHostAction({ projectRoot: one, kind: "git-mutation" }); assert.ok(mutation.ok); if (!mutation.ok) return;
  try {
    assert.equal(checkGitHostAction({ projectRoot: one, leaseId: mutation.leaseId }).ok, true);
    assert.equal(beginGitHostAction({ projectRoot: two, kind: "session-open" }).ok, false);
    assert.equal(beginGitHostAction({ projectRoot: two, kind: "authorization-change" }).ok, false);
    recordGitHostInterruption({ projectRoot: two, reason: "actual-other-root-emergency" });
    assert.equal(checkGitHostAction({ projectRoot: one, leaseId: mutation.leaseId }).ok, false, "Other-root emergency facts invalidate the held proof");
    assert.equal(inspectGitHostCoordinator({ projectRoot: one }).activeAction, "git-mutation");
    assert.equal(endGitHostAction({ projectRoot: two, leaseId: mutation.leaseId }).ok, false, "An interruption cannot release another root's owned lease");
    const blockedOpen = beginGitHostAction({ projectRoot: two, kind: "session-open" }); assert.equal(blockedOpen.ok, false);
  } finally { endGitHostAction({ projectRoot: one, leaseId: mutation.leaseId }); }
  const after = beginGitHostAction({ projectRoot: two, kind: "session-open" }); assert.ok(after.ok); if (after.ok) endGitHostAction({ projectRoot: two, leaseId: after.leaseId });
  const inventoryMutation = beginGitHostAction({ projectRoot: one, kind: "git-mutation" }); assert.ok(inventoryMutation.ok); if (!inventoryMutation.ok) return;
  try {
    assert.ok(recordGitHostInventory({ source: "desktop-session-manager", projectRoot: two, observedAt: at, revision: 1, sessions: [], pendingOpens: ["actual-creating-entry"], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: ["Actual new admission metadata"] }).ok);
    assert.equal(checkGitHostAction({ projectRoot: one, leaseId: inventoryMutation.leaseId }).ok, false);
    assert.equal(inspectGitHostCoordinator({ projectRoot: one }).activeAction, "git-mutation");
  } finally { endGitHostAction({ projectRoot: one, leaseId: inventoryMutation.leaseId }); }
});

test("Formal new-project route: filesystem emptiness cannot replace native selection and an actual chief parent turn", async () => {
  const base = process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Temp") : "/tmp";
  const root = await fs.mkdtemp(path.join(base, "ans-o4-bootstrap-"));
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok, "Use the actual application initializer, not a fabricated host bootstrap flag");
  const planning = await prepareRoleDispatch({ projectRoot: root, fromRoleId: "chief", targetRoleId: "convener", flowId: "demo" });
  assert.equal(planning.ok, false, "Application initialization alone is not native project registration or customer-turn authority");
  const filesBeforeDocumentRoute = await createFsTrunkStore(root).listRunRecords!();
  const noDocumentSource = await prepareRoleDispatch({ projectRoot: root, fromRoleId: "chief", targetRoleId: "product", flowId: "demo" });
  assert.ok(!noDocumentSource.ok); assert.match(noDocumentSource.message, /actual registered project.*current chief work source/);
  const copiedHostFields = await prepareRoleDispatch({ projectRoot: root, fromRoleId: "chief", targetRoleId: "rapporteur", flowId: "demo", hostInitialization: {
    registration: { selectionId: "not-a-native-selection", source: "native-directory-selection", selectedRoot: root, projectRoot: root, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief", runtime: "codex", sessionId: "not-an-actual-Core", turnId: "not-an-accepted-turn", inputAccepted: true, settled: false, kind: "message" } } });
  assert.ok(!copiedHostFields.ok); assert.match(copiedHostFields.message, /actual active accepted chief dispatch turn/);
  const copiedReportFields = await prepareRoleDispatch({ projectRoot: root, fromRoleId: "chief", targetRoleId: "rapporteur", flowId: "demo", hostInitialization: {
    registration: { selectionId: "not-a-native-selection", source: "native-directory-selection", selectedRoot: root, projectRoot: root, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief", runtime: "codex", sessionId: "not-an-actual-Core", turnId: "not-an-ingested-handback", inputAccepted: true, settled: false, kind: "system" },
    creatorReports: [{ taskId: "not-a-real-chief-child", roleId: "product", reportId: "not-a-real-report", turnId: "not-a-real-child-turn" }] } });
  assert.ok(!copiedReportFields.ok, "A creator-report-shaped host value cannot replace the actual Core-ingested handback");
  assert.deepEqual(await createFsTrunkStore(root).listRunRecords!(), filesBeforeDocumentRoute, "Rejected document routing cannot create a planning run or touch an execution pin");
  assert.equal(await fs.stat(path.join(root, ".ans/trunk/initialization-sources")).then(() => true, () => false), false, "A model-shaped host payload is not a durable work source");
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false, "Route preparation cannot init a repo or fabricate future material");
  assert.equal((await prepareRoleDispatch({ projectRoot: root, fromRoleId: "convener", targetRoleId: "worker", flowId: "demo", runId: "run-no-future-material" })).ok, false);
  const parent = await fs.mkdtemp(path.join(base, "ans-o4-nested-parent-")); await initializeGitRepository(parent); const nested = path.join(parent, "nested"); await fs.mkdir(nested);
  assert.ok((await createVersionChangeStack({ projectRoot: nested }).ensureInitialized()).ok);
  const rejected = await prepareRoleDispatch({ projectRoot: nested, fromRoleId: "chief", targetRoleId: "convener", flowId: "demo" }); assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.message, /actual registered project and current chief work source/);
});

test("Git initialization Service effect: storage fixture rechecks bytes, rejects copied preparation and replays actual empty candidate", async () => {
  // This is an explicitly allocated storage-layer fixture, not proof of the production admission/whole-team protection closure.
  const base = process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Temp") : "/tmp";
  const root = await fs.mkdtemp(path.join(base, "ans-init-service-")), store = createFsTrunkStore(root), runId = "run-real-init";
  const run = { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: at };
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, run)).ok);
  const sourceId = "init-source-" + "a".repeat(64), canonical = await fs.realpath(root);
  const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn",
    sourceId, projectRoot: canonical, flowId: "demo", parent: { roleId: "chief", sessionId: "storage-fixture-session", turnId: "storage-fixture-turn" } })).toString("base64"));
  assert.ok(source.ok); if (!source.ok) return;
  const task: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "actual-init-child", from: "chief", to: "convener", text: "Infrastructure storage fixture",
    sideEffect: "unknown", idempotencyKey: "actual-init-child", flowId: "demo", runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  const changedKind = await recordTaskObservation({ projectRoot: root, event: { ...task, taskId: "wrong-kind-init-child", idempotencyKey: "wrong-kind-init-child",
    workSourceRef: { kind: "chief-creator-report", sourceId, path: source.value.path, sha256: source.value.sha256 } } });
  assert.ok(!changedKind.ok, "The new pure ref kind cannot relabel actual customer-source bytes or establish a different authority");
  const recorded = await recordTaskObservation({ projectRoot: root, event: task }); assert.ok(recorded.ok, JSON.stringify(recorded));
  const service = createGitCapabilityService({ projectRoot: root, context: { actorRoleId: "convener", taskId: task.taskId, runId, readPaths: ["."] } });
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(lease.ok); if (!lease.ok) return;
  const request = { action: "init" as const, operationId: "actual-init-storage-op", base: { ref: "refs/ans/trunk", oid: null }, message: "Create empty infrastructure candidate" };
  assert.ok(endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }).ok);
  recordGitHostInventory({ source: "desktop-session-manager", projectRoot: root, observedAt: at, revision: 1,
    sessions: [], pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] });
  const production = await createGitRoleRuntime({ projectRoot: root, context: { actorRoleId: "convener", taskId: task.taskId, runId, readPaths: ["."] } }).gitCandidate(request);
  assert.equal(production.status, "blocked", "Ordinary fixture inventory/source strings do not prove an actual Core/controller surface");
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false);
  const renewed = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(renewed.ok); if (!renewed.ok) return;
  lease.leaseId = renewed.leaseId;
  const prepared = await service.prepareInitialization(request); assert.ok(prepared.ok, JSON.stringify(prepared)); if (!prepared.ok) return;
  assert.equal((await service.executeInitialization(prepared.value, "invented-lease")).code, "git-host-mutation-lease-invalid");
  assert.equal((await service.executeInitialization(structuredClone(prepared.value), lease.leaseId)).code, "git-initialization-preparation-invalid");
  const runBytes = await fs.readFile(path.join(root, `.ans/runs/${runId}/manifest.json`));
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), JSON.stringify({ ...run, state: "closed" }));
  assert.equal((await service.executeInitialization(prepared.value, lease.leaseId)).code, "git-initialization-run-invalid");
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false);
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), runBytes);
  const current = await service.prepareInitialization(request); assert.ok(current.ok); if (!current.ok) return;
  const actual = await service.executeInitialization(current.value, lease.leaseId); assert.equal(actual.status, "prepared", JSON.stringify(actual));
  assert.ok(actual.candidate); assert.ok(actual.tree); assert.deepEqual(actual.parents, []);
  const operationHash = createHash("sha256").update(request.operationId).digest("hex");
  const journal = JSON.parse(await fs.readFile(path.join(root, `.ans/trunk/operations/${operationHash}/init.json`), "utf8"));
  assert.equal(journal.stage, "candidate-created"); assert.deepEqual(journal.candidate, actual.candidate);
  const retryService = createGitCapabilityService({ projectRoot: root, context: { actorRoleId: "convener", taskId: task.taskId, runId, readPaths: ["."] } });
  const retry = await retryService.prepareInitialization(request); assert.ok(retry.ok, JSON.stringify(retry)); if (!retry.ok) return;
  const replay = await retryService.executeInitialization(retry.value, lease.leaseId); assert.deepEqual(replay, actual);
  assert.equal(await fs.stat(path.join(root, ".git/refs/ans/trunk")).then(() => true, () => false), false, "Infrastructure candidate is not a document-trunk publication");
  const beforeInterruption = inspectGitHostCoordinator({ projectRoot: root });
  recordGitHostInterruption({ projectRoot: root, reason: "actual-emergency-stop", coreSessionId: "storage-fixture-session" });
  const afterInterruption = inspectGitHostCoordinator({ projectRoot: root });
  assert.ok(afterInterruption.coordinatorRevision > beforeInterruption.coordinatorRevision); assert.equal(afterInterruption.activeAction, "git-mutation");
  const interrupted = await retryService.prepareInitialization(request); assert.ok(interrupted.ok); if (!interrupted.ok) return;
  assert.equal((await retryService.executeInitialization(interrupted.value, lease.leaseId)).code, "git-host-mutation-lease-invalid");
  assert.equal(beginGitHostAction({ projectRoot: root, kind: "session-open" }).ok, false, "Invalidation does not prematurely release the owned mutation lease");
  assert.ok(endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }).ok);
  const reported = await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId: task.taskId, from: "convener", status: "done",
    summary: "The actual repository initialization and empty candidate are complete", evidence: [`Git candidate ${actual.candidate!.hex}`, `Git operation ${request.operationId}`] } });
  assert.ok(reported.ok, JSON.stringify(reported));
  const creator = createTrunkService({ projectRoot: root });
  const basis = await creator.prepareCreatedTaskClose(task.taskId, "chief"); assert.ok(basis.ok, JSON.stringify(basis)); if (!basis.ok) return;
  assert.equal(basis.value.initializationCommit?.initializationOperationId, request.operationId);
  assert.ok(basis.value.materialRefs?.every(ref => ref.path.startsWith(".ans/")), "Initialization completion does not invent future planning documents");
  const sourceClosed = await creator.closeCreatedTask({ operationId: "close-real-init-output", taskId: task.taskId, runId,
    basisDigest: basis.value.basisDigest, reportRef: basis.value.reportRef, outcome: "accepted" }, "chief");
  assert.equal(sourceClosed.status, "applied", JSON.stringify(sourceClosed));
  const selected = await createProjectTrunkStore(root).readManifest(); assert.equal(selected.ok, false);
  if (!selected.ok) assert.equal(selected.reason, "corrupt", "Worker readers still cannot fall back to live documents after initialization");
  assert.equal((await createProjectTrunkStore(root).readInitialGitPublicationBasis!("demo")).ok, true, "Only the explicit document-publication path receives real absence proof");
  const proposalPath = "docs/proposals/demo-proposal-v1.md", intentPath = "docs/product/demo-intent-v1.md";
  const intent = "# Layer fixture confirmed intent\n", proposal = `---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: ${intentPath}\n---\nPlanning before execution\n`;
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true }); await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  await fs.writeFile(path.join(root, intentPath), intent); await fs.writeFile(path.join(root, proposalPath), proposal);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex"), integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  assert.ok((await integration.services.freeze.freeze({ path: intentPath, version: 1, sha256: hash(intent), reason: "intent-confirmed", applicationId: "layer-intent-confirmed", decisionId: "layer-actual-intent-decision", at })).ok);
  const actualStore = createProjectTrunkStore(root), actualRegistry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
  let omitCommittedProof = true, effectFreezes: Parameters<typeof actualRegistry.appendDocFreezeRecords>[0] = [];
  const documents = createTrunkService({ projectRoot: root, store: actualStore, freezeRegistry: { ...actualRegistry,
    appendDocFreezeRecords(records, evidence) { effectFreezes = structuredClone(records); return actualRegistry.appendDocFreezeRecords(records, omitCommittedProof ? undefined : evidence); } } });
  const currentParentId = "current-storage-publication-chief";
  const route = await documents.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "product", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: {
    registration: { source: "native-directory-selection", selectionId: "storage-current-selection", selectedRoot: canonical, projectRoot: canonical, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief", runtime: "codex", sessionId: currentParentId, turnId: "storage-current-publication-turn", kind: "message", inputAccepted: true, settled: false } } });
  assert.ok(route.ok, JSON.stringify(route)); if (!route.ok || !route.value.initializationSource || !route.value.runId) return;
  const currentSource = route.value.initializationSource;
  const publicationTask: TaskCreatedEvent = { ...task, taskId: "real-product-publication-task", to: "product", idempotencyKey: "real-product-publication-task", hubRouting: "chief-hub-v1",
    runId: route.value.runId, workSourceRef: { kind: currentSource.kind ?? "chief-customer-turn", sourceId: currentSource.sourceId, path: currentSource.path, sha256: currentSource.sha256 } };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: publicationTask })).ok);
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok, "Actual application initialization migrates the existing exact draft bytes");
  const migrationBytes = await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8");
  const migrated = migrationBytes.trim().split("\n").map(line => JSON.parse(line)).find(row => row.doc === "proposal" && row.version === 1 && row.event === "frozen");
  assert.equal(migrated?.freeze.reason, "migrated-legacy"); assert.equal(migrated?.sha256, hash(proposal));
  const publicationSourceInput = { taskId: publicationTask.taskId, actorRoleId: "product", flowId: "demo", runId: route.value.runId };
  const currentProcess = await documents.readTaskProcessSource(publicationSourceInput);
  assert.ok(currentProcess.ok, JSON.stringify(currentProcess)); if (!currentProcess.ok) return;
  assert.equal(currentProcess.value.parentCoreSessionId, currentParentId);
  assert.equal(currentProcess.value.sourceAssignmentTaskId, publicationTask.taskId);
  assert.deepEqual(currentProcess.value.workSourceRef, publicationTask.workSourceRef);
  assert.ok(currentProcess.value.expectedFiles.some(file => file.path === currentSource.path && file.sha256 === currentSource.sha256));
  for (const wrong of [{ actorRoleId: "rapporteur" }, { taskId: "unknown-task" }, { flowId: "another-flow" }, { runId }])
    assert.equal((await documents.readTaskProcessSource({ ...publicationSourceInput, ...wrong })).ok, false, JSON.stringify(wrong));
  const draft = await documents.prepareDirectSubmission({ operationId: "first-git-document", kind: "version-upgrade", initiatorRoleId: "product", flowId: "demo", baseTrunk: null,
    summary: "Actual first planning publication", targets: [{ kind: "contract", path: proposalPath, action: "add", expectedFromSha256: null }] }, "product");
  assert.ok(draft.ok, JSON.stringify(draft)); if (!draft.ok) return;
  const plan = await documents.prepareDirectCommit!(draft.value.applyInput); assert.ok(plan.ok, JSON.stringify(plan)); if (!plan.ok) return;
  assert.equal((await actualStore.readCommittedFreezeBasis!(plan.value.journal)).ok, false, "An uncommitted plan or journal is not a published-operation proof");
  assert.equal((await documents.executeDirect(draft.value.applyInput)).ok, false, "The ordinary production selector remains read-only");
  const publishing = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(publishing.ok); if (!publishing.ok) return;
  const authority = await documents.prepareDirectAuthority!(plan.value, publicationTask.taskId); assert.ok(authority.ok, JSON.stringify(authority)); if (!authority.ok) return;
  assert.equal(authority.value.processSource.parentCoreSessionId, currentParentId);
  assert.notEqual(authority.value.processSource.parentCoreSessionId, prepared.value.parentCoreSessionId, "Publication uses its actual current task source, not the old init parent; this does not certify that old process terminated");
  assert.deepEqual(authority.value.processSource.workSourceRef, publicationTask.workSourceRef);
  assert.ok(authority.value.expectedFiles.some(file => file.path === currentSource.path && file.sha256 === currentSource.sha256), "Original R9 expected bytes include the actual action source");
  assert.equal((await documents.prepareDirectAuthority!(plan.value, "another-task")).ok, false);
  const absentSourceTask = { ...publicationTask, taskId: "publication-no-source", idempotencyKey: "publication-no-source", workSourceRef: undefined, hubRouting: undefined };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: absentSourceTask })).ok);
  assert.equal((await documents.prepareDirectAuthority!(plan.value, absentSourceTask.taskId)).ok, false, "An actual but unbound legacy task cannot borrow repo initialization as its current source");
  assert.equal((await documents.readTaskProcessSource({ ...publicationSourceInput, taskId: absentSourceTask.taskId })).ok, false);
  const rawSource = await fs.readFile(path.join(root, currentSource.path));
  const wrongParent = JSON.parse(rawSource.toString("utf8")); wrongParent.parent.sessionId = "wrong-parent";
  await fs.writeFile(path.join(root, currentSource.path), JSON.stringify(wrongParent));
  assert.equal((await documents.prepareDirectAuthority!(plan.value, publicationTask.taskId)).ok, false, "Changing the Chief parent without its immutable source reference is a real source-byte mismatch");
  assert.equal((await documents.readTaskProcessSource(publicationSourceInput)).ok, false);
  await fs.writeFile(path.join(root, currentSource.path), rawSource);

  let candidateVerdict = checkGitPolicy(authority.value.candidatePolicyInput), publicationVerdict = checkGitPolicy(authority.value.publicationPolicyInput);
  if (process.env.ANS_O6_POLICY_FACTS) await fs.writeFile(process.env.ANS_O6_POLICY_FACTS, JSON.stringify({ candidate: authority.value.candidatePolicyInput, publication: authority.value.publicationPolicyInput }, null, 2));
  const copied = await documents.commitPreparedDirect!(structuredClone(plan.value), { hostLeaseId: publishing.leaseId, taskId: publicationTask.taskId, candidateVerdict, publicationVerdict });
  assert.ok(!copied.ok);
  assert.equal(copied.errorCode, "direct-commit-binding-invalid");
  assert.equal(candidateVerdict.allowed, true, JSON.stringify(candidateVerdict)); assert.equal(publicationVerdict.allowed, true, JSON.stringify(publicationVerdict));
  const stale = await documents.commitPreparedDirect!(plan.value, { hostLeaseId: publishing.leaseId, taskId: publicationTask.taskId, candidateVerdict, publicationVerdict });
  assert.equal(stale.ok, false, "Actual task-ledger mutation invalidates the earlier content-bound policy input");
  const freshAuthority = await documents.prepareDirectAuthority!(plan.value, publicationTask.taskId); assert.ok(freshAuthority.ok); if (!freshAuthority.ok) return;
  candidateVerdict = checkGitPolicy(freshAuthority.value.candidatePolicyInput); publicationVerdict = checkGitPolicy(freshAuthority.value.publicationPolicyInput);
  const published = await documents.commitPreparedDirect!(plan.value, { hostLeaseId: publishing.leaseId, taskId: publicationTask.taskId, candidateVerdict, publicationVerdict });
  assert.equal(published.status, "committed-pending-recovery", JSON.stringify(published));
  assert.match(published.message ?? "", /frozen-conflict: docs\/proposals\/demo-proposal-v1\.md/);
  assert.equal(await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8"), migrationBytes, "Without actual committed proof the same-byte migration is retained and cannot become an effect receipt");
  const originalOperation = await actualStore.readOperation!(draft.value.applyInput.operationId); assert.ok(originalOperation.ok); if (!originalOperation.ok) return;
  const committedBasis = await actualStore.readCommittedFreezeBasis!(originalOperation.value); assert.ok(committedBasis.ok, JSON.stringify(committedBasis)); if (!committedBasis.ok) return;
  const metadataOnly = { ...originalOperation.value, phase: "committed" as const, result: "committed" as const, updatedAt: new Date().toISOString() };
  assert.equal((await actualStore.finalizeCommittedMetadata!(metadataOnly, committedBasis.value)).ok, false, "A real commit alone cannot settle metadata before its actual formal effect-freeze rows exist");
  assert.equal((await actualStore.finalizeCommittedMetadata!({ ...metadataOnly, message: "changed original business input" }, committedBasis.value)).ok, false);
  assert.equal((await actualStore.finalizeCommittedMetadata!({ ...metadataOnly, phase: "prepared" }, committedBasis.value)).ok, false);
  assert.equal((await actualStore.finalizeCommittedMetadata!(metadataOnly, { ...committedBasis.value, operationId: "another-operation" })).ok, false);
  const refsBeforeRecovery = { trunk: await createGitCandidateStore(root).readRef("refs/ans/trunk"), delivery: await createGitCandidateStore(root).readRef("refs/ans/delivery/demo") };
  for (const wrong of [
    { ...committedBasis.value, operationId: "different-operation" },
    { ...committedBasis.value, projectRoot: root + "-another-project" },
    { ...committedBasis.value, source: { ...committedBasis.value.source, actorRoleId: "rapporteur" } },
    { ...committedBasis.value, snapshotRef: { ...committedBasis.value.snapshotRef, digest: "0".repeat(64) } },
    { ...committedBasis.value, operationFile: { ...committedBasis.value.operationFile, sha256: "0".repeat(64) } },
    { ...committedBasis.value, commitBytesBase64: Buffer.from("not the actual commit object").toString("base64") },
  ]) assert.equal((await actualRegistry.appendDocFreezeRecords(effectFreezes, { committedOperation: wrong })).ok, false);
  assert.equal((await actualRegistry.appendDocFreezeRecords(effectFreezes.map(record => ({ ...record, sha256: "0".repeat(64) })), { committedOperation: committedBasis.value })).ok, false);
  assert.equal((await actualRegistry.appendDocFreezeRecords(effectFreezes.map(record => ({ ...record, path: record.path.replace("-v1.md", "-v2.md"), version: 2 })), { committedOperation: committedBasis.value })).ok, false);
  const operationLink = path.join(root, "operation-proof-hardlink.json");
  await fs.link(path.join(root, committedBasis.value.operationFile.path), operationLink);
  try { assert.equal((await actualRegistry.appendDocFreezeRecords(effectFreezes, { committedOperation: committedBasis.value })).ok, false, "A hard-linked protected journal cannot prove this project's immutable operation path"); }
  finally { await fs.unlink(operationLink); }
  assert.equal(await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8"), migrationBytes, "All mismatched proof/tuple refusals leave prior history byte-exact");
  omitCommittedProof = false;
  const recoveredMetadata = await documents.recoverDirect(draft.value.applyInput.operationId);
  assert.equal(recoveredMetadata.status, "applied", JSON.stringify(recoveredMetadata));
  const afterRecovery = await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8");
  assert.ok(afterRecovery.startsWith(migrationBytes), "The actual migration rows remain immutable history");
  const effectRows = afterRecovery.trim().split("\n").map(line => JSON.parse(line)).filter(row => row.doc === "proposal" && row.version === 1 && row.event === "frozen");
  assert.deepEqual(effectRows.map(row => row.freeze.reason), ["migrated-legacy", "role-direct-applied"]);
  assert.equal(effectRows[1].freeze.source.operationId, draft.value.applyInput.operationId);
  assert.equal((await documents.recoverDirect(draft.value.applyInput.operationId)).status, "applied");
  assert.equal(await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8"), afterRecovery, "Actual recovery is idempotent and never reinitializes or republishes");
  assert.deepEqual({ trunk: await createGitCandidateStore(root).readRef("refs/ans/trunk"), delivery: await createGitCandidateStore(root).readRef("refs/ans/delivery/demo") }, refsBeforeRecovery);
  assert.deepEqual(await fs.readFile(path.join(root, `.ans/runs/${runId}/manifest.json`)), runBytes, "Document metadata recovery never changes the old run");
  assert.ok(endGitHostAction({ projectRoot: root, leaseId: publishing.leaseId }).ok);
  const actualDocument = await createProjectTrunkStore(root).readManifest(); assert.ok(actualDocument.ok, JSON.stringify(actualDocument));
  if (actualDocument.ok) { assert.equal(actualDocument.value.trunkVersion, 1); assert.equal(actualDocument.value.flowId, "demo"); assert.equal(actualDocument.value.artifacts.workflow, undefined); }
  const host = { registration: { source: "native-directory-selection" as const, selectionId: "actual-mode-context-selection", selectedRoot: canonical, projectRoot: canonical, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief" as const, runtime: "codex" as const, sessionId: currentParentId, turnId: "actual-mode-context-turn", kind: "message", inputAccepted: true as const, settled: false as const } };
  const rapporteur = await documents.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "rapporteur", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: host });
  assert.ok(rapporteur.ok, JSON.stringify(rapporteur)); if (!rapporteur.ok || !rapporteur.value.runId || !rapporteur.value.initializationSource) return;
  const rapporteurSource = rapporteur.value.initializationSource, rapporteurTaskId = "actual-mode-report-context";
  assert.ok((await documents.recordTaskObservation({ ...publicationTask, to: "rapporteur", taskId: rapporteurTaskId, idempotencyKey: rapporteurTaskId,
    runId: rapporteur.value.runId, workSourceRef: { kind: rapporteurSource.kind!, sourceId: rapporteurSource.sourceId, path: rapporteurSource.path, sha256: rapporteurSource.sha256 } })).ok);
  assert.ok((await documents.recordTaskObservation({ v: 1, at, kind: "task.reported", taskId: rapporteurTaskId, from: "rapporteur", turnId: "actual-mode-report-turn", status: "done",
    summary: "A model statement about a replacement cannot create a committed stop/restart operation", evidence: [proposalPath] })).ok);
  const reportHost = { ...host, parent: { ...host.parent, turnId: "actual-mode-handback-turn", kind: "submitted-report" },
    creatorReports: [{ taskId: rapporteurTaskId, roleId: "rapporteur", turnId: "actual-mode-report-turn", reportId: "actual-mode-context-report" }] };
  const withoutRestart = await documents.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "convener", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: reportHost });
  assert.ok(withoutRestart.ok, JSON.stringify(withoutRestart)); if (!withoutRestart.ok) return;
  assert.equal(withoutRestart.value.kind, "planning", "A real report with no actual committed replacement keeps ordinary Hub preparation; it never mints execution");
  assert.notEqual(withoutRestart.value.runId, runId);
  const unknownReport = await documents.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "convener", flowId: "demo", hubRouting: "chief-hub-v1",
    hostInitialization: { ...reportHost, creatorReports: [{ ...reportHost.creatorReports[0]!, taskId: "not-the-actual-report-task" }] } });
  assert.equal(unknownReport.ok, false);
});


test("Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority", async () => {
  const project = await createTrunkProject({ withRun: false }), fsStore = createFsTrunkStore(project.root), documents = project.snapshot().documents;
  const snapshot = await fsStore.captureSnapshot!({ snapshotId: "o7-real-planning-basis", createdAt: at, files: Object.values(documents) });
  assert.ok(snapshot.ok); if (!snapshot.ok) return;
  const initial: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", trunkVersion: 1, previous: null, runId: null, flowId: "demo",
    digest: createHash("sha256").update("actual-o7-planning-basis").digest("hex"), snapshotRef: snapshot.value, createdAt: at, updatedAt: at,
    artifacts: { documents, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await fsStore.compareAndSwapManifest!(null, initial, snapshot.value)).ok);
  await initializeGitRepository(project.root);
  assert.ok((await migrateLegacyTrunkToGit(project.root, { operationId: "o7-existing-fixture-migration", expected: { version: 1, digest: initial.digest } })).ok);
  await fs.unlink(path.join(project.root, PATHS.roleCard)); await fs.unlink(path.join(project.root, PATHS.boundary)); await fs.unlink(path.join(project.root, PATHS.workflow));
  const runId = "run-o7-planning", taskId = "task-o7-real-convener";
  assert.ok((await fsStore.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, createdAt: at })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "convener", text: "Prepare the real plan",
    sideEffect: "docs", idempotencyKey: taskId, flowId: "demo", runId, runState: "draft" } })).ok);
  const service = createTrunkService({ projectRoot: project.root }), sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const planPath = "docs/scheduling/demo-team-v2.md", text = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: "demo", version: 2, modules: documents.modules, roster: documents.roster,
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# Real future plan\n`;
  await fs.writeFile(path.join(project.root, planPath), text);
  const input = { operationId: "o7-real-plan-publication", flowId: "demo", runId, baseDigest: initial.digest, plan: { path: planPath, sha256: sha(text), version: 2 } };
  const wrongActor = await service.prepareTeamPlanCommit!(input, "product"); assert.ok(wrongActor.ok && !("preparationKind" in wrongActor.value) && !wrongActor.value.ok);
  const prepared = await service.prepareTeamPlanCommit!(input, "convener"); assert.ok(prepared.ok, JSON.stringify(prepared));
  if (!prepared.ok || !("preparationKind" in prepared.value)) { assert.fail(JSON.stringify(prepared)); }
  const value = prepared.value;
  assert.equal(value.manifest.source, "team-plan"); assert.equal(value.manifest.trunkVersion, 2);
  assert.deepEqual(value.manifest.artifacts.documents, initial.artifacts.documents); assert.equal(value.manifest.activeRoles, undefined); assert.equal(value.manifest.artifacts.workflow, undefined);
  const authority = await service.prepareDirectAuthority!(value, taskId); assert.ok(authority.ok, JSON.stringify(authority)); if (!authority.ok) return;
  assert.equal((await service.prepareDirectAuthority!(value, "wrong-task")).ok, false);
  let candidateVerdict = checkGitPolicy(authority.value.candidatePolicyInput), publicationVerdict = checkGitPolicy(authority.value.publicationPolicyInput);
  if (process.env.ANS_O7_POLICY_FACTS) await fs.writeFile(process.env.ANS_O7_POLICY_FACTS, JSON.stringify({ candidate: authority.value.candidatePolicyInput, publication: authority.value.publicationPolicyInput }, null, 2));
  assert.equal(candidateVerdict.allowed, true, JSON.stringify(candidateVerdict)); assert.equal(publicationVerdict.allowed, true, JSON.stringify(publicationVerdict));
  const lease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(lease.ok); if (!lease.ok) return;
  try {
    const copied = await service.commitPreparedTeamPlan!(structuredClone(value), { hostLeaseId: lease.leaseId, taskId, candidateVerdict, publicationVerdict }); assert.equal(copied.ok, false);
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.reported", taskId, from: "convener", status: "blocked", summary: "Actual newer planning report before commit" } })).ok);
    const stale = await service.commitPreparedTeamPlan!(value, { hostLeaseId: lease.leaseId, taskId, candidateVerdict, publicationVerdict });
    assert.ok(!stale.ok); assert.equal(stale.errorCode, "plan-commit-binding-invalid");
    const refreshed = await service.prepareDirectAuthority!(value, taskId); assert.ok(refreshed.ok); if (!refreshed.ok) return;
    assert.notEqual(refreshed.value.authorizationDigest, authority.value.authorizationDigest);
    candidateVerdict = checkGitPolicy(refreshed.value.candidatePolicyInput); publicationVerdict = checkGitPolicy(refreshed.value.publicationPolicyInput);
    const committed = await service.commitPreparedTeamPlan!(value, { hostLeaseId: lease.leaseId, taskId, candidateVerdict, publicationVerdict }); assert.equal(committed.status, "applied", JSON.stringify(committed));
    assert.equal(committed.source?.kind === "role-direct" && committed.source.action, "complete-team-plan");
  } finally { endGitHostAction({ projectRoot: project.root, leaseId: lease.leaseId }); }
  const current = await createProjectTrunkStore(project.root).readManifest(); assert.ok(current.ok); if (!current.ok) return;
  assert.equal(current.value.trunkVersion, 2); assert.deepEqual(current.value.artifacts.documents, initial.artifacts.documents); assert.equal(current.value.artifacts.workflow, undefined);
  const replay = await service.completeTeamPlan(input, "convener"); assert.equal(replay.status, "applied", JSON.stringify(replay));
  const noOpInput = { ...input, operationId: "o7-same-plan-no-op", baseDigest: current.value.digest };
  const noOpPrepared = await service.prepareTeamPlanCommit!(noOpInput, "convener"); assert.ok(noOpPrepared.ok);
  if (!noOpPrepared.ok || !("preparationKind" in noOpPrepared.value)) { assert.fail(JSON.stringify(noOpPrepared)); }
  const noOpAuthority = await service.prepareDirectAuthority!(noOpPrepared.value, taskId); assert.ok(noOpAuthority.ok); if (!noOpAuthority.ok) return;
  const noOpCandidate = checkGitPolicy(noOpAuthority.value.candidatePolicyInput), noOpPublication = checkGitPolicy(noOpAuthority.value.publicationPolicyInput);
  assert.equal(noOpCandidate.allowed, true, JSON.stringify(noOpCandidate)); assert.equal(noOpPublication.allowed, true, JSON.stringify(noOpPublication));
  const noOpLease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(noOpLease.ok); if (!noOpLease.ok) return;
  try {
    const result = await service.commitPreparedTeamPlan!(noOpPrepared.value, { hostLeaseId: noOpLease.leaseId, taskId, candidateVerdict: noOpCandidate, publicationVerdict: noOpPublication });
    assert.equal(result.status, "no-op", JSON.stringify(result));
  } finally { endGitHostAction({ projectRoot: project.root, leaseId: noOpLease.leaseId }); }
  const unchanged = await createProjectTrunkStore(project.root).readManifest(); assert.ok(unchanged.ok); if (!unchanged.ok) return;
  assert.deepEqual(unchanged.value, current.value, "No-op leaves the actual document, role and run pointers unchanged");
  assert.ok(replay.planRef && replay.rosterRef); if (!replay.planRef || !replay.rosterRef) return;
  const nominationTaskId = "task-o8-real-nominator";
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.created", taskId: nominationTaskId, from: "chief", to: "nominator", text: "Create and activate the real selected role",
    sideEffect: "docs", idempotencyKey: nominationTaskId, flowId: "demo", runId, runState: "draft" } })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "request.created", requestId: "o8-actual-d3", flowId: "demo", sourceRoleId: "nominator",
    cardKind: "appointment", title: "Select the actual roster", options: [{ id: "impl", label: "Implementation" }] } })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "request.resolved", requestId: "o8-actual-d3", decisionId: "o8-customer-selected-impl", by: "customer",
    cardKind: "appointment", choice: "impl", targetRoleIds: ["impl"], rosterVersion: 1, rosterSha256: replay.rosterRef.sha256 } })).ok);
  const card = "# Implementation\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接", "执行原则", "质量职责", "标准工作流", "交付物清单"].map(section => `## ${section}\nMaintain the assigned module.\n`).join("");
  const md = "# Boundary\n## Section 1: 可修改文件与目录\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录（私有） | `src/impl/` | implementation |\n";
  const yaml = "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: implementation\n";
  const activationInput = { operationId: "o8-git-active-only", flowId: "demo", targetRoleId: "impl", d3DecisionId: "o8-customer-selected-impl", planRef: replay.planRef, rosterRef: replay.rosterRef,
    documents: { card: { path: PATHS.roleCard, sha256: sha(card) }, boundaryMd: { path: "角色卡/impl/boundary.md", sha256: sha(md) }, boundaryYaml: { path: PATHS.boundary, sha256: sha(yaml) } } };
  await fs.writeFile(path.join(project.root, PATHS.roleCard), card);
  assert.equal((await service.prepareRoleActivation(activationInput, "nominator")).ok, false, "A single draft never enables the new role");
  await fs.writeFile(path.join(project.root, activationInput.documents.boundaryMd.path), md); await fs.writeFile(path.join(project.root, PATHS.boundary), yaml);
  const activation = await service.prepareRoleActivation(activationInput, "nominator"); assert.ok(activation.ok, JSON.stringify(activation)); if (!activation.ok) return;
  assert.equal("runId" in activation.value.evidence, false); assert.equal("pinDigest" in activation.value.evidence, false);
  const quality = validateRoleDocumentsSnapshot({ snapshot: activation.value.snapshot, roles: [activation.value.role] }), boundary = validateBoundaryYamlText(yaml);
  assert.ok(quality.ok); assert.ok(boundary.ok); if (!quality.ok || !boundary.ok) return;
  const activePrepared = await service.prepareActivationCommit!(activation.value, quality.roleDocumentChecks, boundary.entries, "nominator");
  assert.ok(activePrepared.ok, JSON.stringify(activePrepared)); if (!activePrepared.ok || !("preparationKind" in activePrepared.value)) assert.fail(JSON.stringify(activePrepared));
  const activeValue = activePrepared.value, activeAuthority = await service.prepareDirectAuthority!(activeValue, nominationTaskId);
  assert.ok(activeAuthority.ok, JSON.stringify(activeAuthority)); if (!activeAuthority.ok) return;
  const activeCandidate = checkGitPolicy(activeAuthority.value.candidatePolicyInput), activePublication = checkGitPolicy(activeAuthority.value.publicationPolicyInput);
  if (process.env.ANS_O8_POLICY_FACTS) await fs.writeFile(process.env.ANS_O8_POLICY_FACTS, JSON.stringify({ candidate: activeAuthority.value.candidatePolicyInput, publication: activeAuthority.value.publicationPolicyInput }, null, 2));
  assert.equal(activeCandidate.allowed, true, JSON.stringify(activeCandidate)); assert.equal(activePublication.allowed, true, JSON.stringify(activePublication));
  const competingActivation = await service.prepareRoleActivation({ ...activationInput, operationId: "o8-competing-activation" }, "nominator"); assert.ok(competingActivation.ok); if (!competingActivation.ok) return;
  const competingQuality = validateRoleDocumentsSnapshot({ snapshot: competingActivation.value.snapshot, roles: [competingActivation.value.role] }); assert.ok(competingQuality.ok); if (!competingQuality.ok) return;
  const competingPrepared = await service.prepareActivationCommit!(competingActivation.value, competingQuality.roleDocumentChecks, boundary.entries, "nominator");
  assert.ok(competingPrepared.ok); if (!competingPrepared.ok || !("preparationKind" in competingPrepared.value)) assert.fail(JSON.stringify(competingPrepared));
  const activeLease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(activeLease.ok); if (!activeLease.ok) return;
  try {
    const copiedActive = await service.commitPreparedActivation!(structuredClone(activeValue), { hostLeaseId: activeLease.leaseId, taskId: nominationTaskId, candidateVerdict: activeCandidate, publicationVerdict: activePublication });
    assert.ok(!copiedActive.ok); assert.equal(copiedActive.errorCode, "activation-commit-binding-invalid");
    const activeResult = await service.commitPreparedActivation!(activeValue, { hostLeaseId: activeLease.leaseId, taskId: nominationTaskId, candidateVerdict: activeCandidate, publicationVerdict: activePublication });
    assert.equal(activeResult.status, "applied", JSON.stringify(activeResult)); assert.equal(activeResult.source?.kind === "role-direct" && activeResult.source.action, "activate-role-documents");
  } finally { endGitHostAction({ projectRoot: project.root, leaseId: activeLease.leaseId }); }
  const activeManifest = await createProjectTrunkStore(project.root).readManifest(); assert.ok(activeManifest.ok); if (!activeManifest.ok) return;
  const { activeRoles, activeRevision, activeDigest, ...docAfter } = activeManifest.value;
  assert.deepEqual(docAfter, unchanged.value, "Only the active dimension changes; document source/version/refs/snapshot remain exact");
  assert.equal(activeRevision, 1); assert.ok(activeDigest); assert.ok(activeRoles?.impl);
  assert.equal(await fs.stat(path.join(project.root, ".ans/trunk/history/manifest-v2.json")).then(() => true, () => false), false);
  assert.equal(activeManifest.value.artifacts.workflow, undefined);
  const activeReplay = await service.activateRoleDocuments(activation.value, quality.roleDocumentChecks, boundary.entries); assert.equal(activeReplay.status, "applied", JSON.stringify(activeReplay));
  assert.equal((await service.prepareDirectAuthority!(competingPrepared.value, nominationTaskId)).ok, false, "A concurrent activation preparation cannot reuse the old active revision");
  const noOpActivation = await service.prepareRoleActivation({ ...activationInput, operationId: "o8-identical-active-noop" }, "nominator"); assert.ok(noOpActivation.ok); if (!noOpActivation.ok) return;
  assert.equal(noOpActivation.value.noOp, true);
  const noOpQuality = validateRoleDocumentsSnapshot({ snapshot: noOpActivation.value.snapshot, roles: [noOpActivation.value.role] }); assert.ok(noOpQuality.ok); if (!noOpQuality.ok) return;
  const noOpActivePrepared = await service.prepareActivationCommit!(noOpActivation.value, noOpQuality.roleDocumentChecks, boundary.entries, "nominator");
  assert.ok(noOpActivePrepared.ok); if (!noOpActivePrepared.ok || !("preparationKind" in noOpActivePrepared.value)) assert.fail(JSON.stringify(noOpActivePrepared));
  const noOpActiveAuthority = await service.prepareDirectAuthority!(noOpActivePrepared.value, nominationTaskId); assert.ok(noOpActiveAuthority.ok); if (!noOpActiveAuthority.ok) return;
  const nc = checkGitPolicy(noOpActiveAuthority.value.candidatePolicyInput), np = checkGitPolicy(noOpActiveAuthority.value.publicationPolicyInput);
  assert.equal(nc.allowed, true, JSON.stringify(nc)); assert.equal(np.allowed, true, JSON.stringify(np));
  const nl = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(nl.ok); if (!nl.ok) return;
  try { const noOpResult = await service.commitPreparedActivation!(noOpActivePrepared.value, { hostLeaseId: nl.leaseId, taskId: nominationTaskId, candidateVerdict: nc, publicationVerdict: np }); assert.equal(noOpResult.status, "no-op", JSON.stringify(noOpResult)); }
  finally { endGitHostAction({ projectRoot: project.root, leaseId: nl.leaseId }); }
  assert.deepEqual(await createProjectTrunkStore(project.root).readManifest(), activeManifest, "No-op does not mutate either visible dimension");
  const reportEvidence = Object.values(activationInput.documents).map(ref => ref.path);
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.reported", taskId: nominationTaskId, from: "nominator", status: "done", summary: "The actual selected three-document role is active", evidence: reportEvidence } })).ok);
  assert.equal((await service.prepareCreatedTaskClose(nominationTaskId, "convener")).ok, false);
  const activeCloseBasis = await service.prepareCreatedTaskClose(nominationTaskId, "chief"); assert.ok(activeCloseBasis.ok, JSON.stringify(activeCloseBasis)); if (!activeCloseBasis.ok) return;
  assert.equal(activeCloseBasis.value.activationCommit?.kind, "current-active-completion"); assert.equal(activeCloseBasis.value.activationCommit?.roles[0]?.operationId, activationInput.operationId);
  assert.equal(activeCloseBasis.value.initializationCommit, undefined); assert.ok(activeCloseBasis.value.reportRef);
  const closeInput = { operationId: "o9-close-active-role-report", taskId: nominationTaskId, runId, reportRef: activeCloseBasis.value.reportRef, basisDigest: activeCloseBasis.value.basisDigest, outcome: "accepted" as const };
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.reported", taskId: nominationTaskId, from: "nominator", status: "done", summary: "A newer actual completion report", evidence: reportEvidence } })).ok);
  const staleClose = await service.closeCreatedTask(closeInput, "chief"); assert.ok(!staleClose.ok); assert.equal(staleClose.errorCode, "task-close-stale");
  await fs.writeFile(path.join(project.root, PATHS.roleCard), card + "Drift after the actual active commit\n");
  assert.equal((await service.prepareCreatedTaskClose(nominationTaskId, "chief")).ok, false, "Live reported documents must still match the true active bytes");
  await fs.writeFile(path.join(project.root, PATHS.roleCard), card);
  const latestCloseBasis = await service.prepareCreatedTaskClose(nominationTaskId, "chief"); assert.ok(latestCloseBasis.ok, JSON.stringify(latestCloseBasis)); if (!latestCloseBasis.ok) return;
  const accepted = await service.closeCreatedTask({ ...closeInput, reportRef: latestCloseBasis.value.reportRef, basisDigest: latestCloseBasis.value.basisDigest }, "chief");
  assert.equal(accepted.status, "applied", JSON.stringify(accepted)); assert.equal(accepted.taskStatus, "closed");
  const acceptedReplay = await service.closeCreatedTask({ ...closeInput, reportRef: latestCloseBasis.value.reportRef, basisDigest: latestCloseBasis.value.basisDigest }, "chief"); assert.equal(acceptedReplay.status, "applied");
  const workflowText = "# Actual approved first workflow\nPlan, implement, verify and accept the assigned module.\n", workflowAt = new Date().toISOString();
  const integration = createVersionChangeIntegration({ projectRoot: project.root, migrationCompleted: () => true });
  const requestedWorkflow = await integration.services.stableWrite.request({ roleId: "convener", kind: "workflow", content: workflowText, at: workflowAt });
  assert.ok(requestedWorkflow.ok, JSON.stringify(requestedWorkflow)); if (!requestedWorkflow.ok) return;
  const approvedWorkflow = await integration.services.stableWrite.approve(requestedWorkflow.value.requestId, { decisionId: "o10-real-stable-execution-approval", at: workflowAt });
  assert.ok(approvedWorkflow.ok, JSON.stringify(approvedWorkflow)); if (!approvedWorkflow.ok) return;
  const sourceLease = beginGitHostAction({ projectRoot: project.root, kind: "arm" }); assert.ok(sourceLease.ok); if (!sourceLease.ok) return;
  let sourceResult;
  try { sourceResult = await service.bindInitialWorkflowSource!({ requestId: requestedWorkflow.value.requestId, taskId, coreSessionId: "storage-fixture-source-core", coreTurnId: "storage-fixture-actual-request", hostLeaseId: sourceLease.leaseId }); }
  finally { endGitHostAction({ projectRoot: project.root, leaseId: sourceLease.leaseId }); }
  assert.ok(sourceResult.ok, JSON.stringify(sourceResult)); if (!sourceResult.ok) return;
  assert.equal(sourceResult.value.targetSha256, sha(workflowText)); assert.equal(sourceResult.value.taskId, taskId);
  assert.equal(await fs.stat(path.join(project.root, PATHS.workflow)).then(() => true, () => false), false);
  // The storage-layer fixture executes the exact approved target; public Core file-tool acceptance is Q's separate proof.
  await fs.writeFile(path.join(project.root, PATHS.workflow), workflowText);
  const writtenWorkflow = await integration.services.stableWrite.completeWrite({ requestId: requestedWorkflow.value.requestId, actualSha256: sha(workflowText), at: workflowAt });
  assert.ok(writtenWorkflow.ok, JSON.stringify(writtenWorkflow)); if (!writtenWorkflow.ok) return;
  assert.equal(writtenWorkflow.value.record.status, "written"); assert.equal(writtenWorkflow.value.permit.status, "consumed"); assert.equal(writtenWorkflow.value.repin.applied, false);
  const workflowInput = { kind: "workflow" as const, roleId: "convener", path: PATHS.workflow, oldSha: "", newSha: sha(workflowText), decisionId: "o10-real-stable-execution-approval", at: workflowAt };
  const workflowPrepared = await service.prepareInitialWorkflowCommit!(workflowInput); assert.ok(workflowPrepared.ok, JSON.stringify(workflowPrepared));
  if (!workflowPrepared.ok || !("preparationKind" in workflowPrepared.value)) assert.fail(JSON.stringify(workflowPrepared));
  const laterPreparation = await service.prepareInitialWorkflowCommit!({ ...workflowInput, at: new Date(Date.parse(workflowAt) + 10000).toISOString() });
  assert.ok(laterPreparation.ok && "preparationKind" in laterPreparation.value); if (!laterPreparation.ok || !("preparationKind" in laterPreparation.value)) return;
  assert.deepEqual(laterPreparation.value.gitPlan?.candidate.commit, workflowPrepared.value.gitPlan?.candidate.commit, "A later host retry time never changes the same actual written operation's candidate");
  assert.equal(laterPreparation.value.gitPlan?.journalDigest, workflowPrepared.value.gitPlan?.journalDigest);
  const workflowAuthority = await service.prepareDirectAuthority!(workflowPrepared.value, taskId); assert.ok(workflowAuthority.ok, JSON.stringify(workflowAuthority)); if (!workflowAuthority.ok) return;
  const workflowCandidate = checkGitPolicy(workflowAuthority.value.candidatePolicyInput), workflowPublication = checkGitPolicy(workflowAuthority.value.publicationPolicyInput);
  if (process.env.ANS_O10_POLICY_FACTS) await fs.writeFile(process.env.ANS_O10_POLICY_FACTS, JSON.stringify({ candidate: workflowAuthority.value.candidatePolicyInput, publication: workflowAuthority.value.publicationPolicyInput }, null, 2));
  assert.equal(workflowCandidate.allowed, true, JSON.stringify(workflowCandidate)); assert.equal(workflowPublication.allowed, true, JSON.stringify(workflowPublication));
  const workflowLease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(workflowLease.ok); if (!workflowLease.ok) return;
  try {
    const copiedWorkflow = await service.commitPreparedInitialWorkflow!(structuredClone(workflowPrepared.value), { hostLeaseId: workflowLease.leaseId, taskId, candidateVerdict: workflowCandidate, publicationVerdict: workflowPublication });
    assert.equal(copiedWorkflow.applied, false); assert.equal(copiedWorkflow.errorCode, "initial-workflow-binding-invalid");
    const attached = await service.commitPreparedInitialWorkflow!(workflowPrepared.value, { hostLeaseId: workflowLease.leaseId, taskId, candidateVerdict: workflowCandidate, publicationVerdict: workflowPublication }); assert.equal(attached.applied, true, JSON.stringify(attached));
  }
  finally { endGitHostAction({ projectRoot: project.root, leaseId: workflowLease.leaseId }); }
  const withWorkflow = await createProjectTrunkStore(project.root).readManifest(); assert.ok(withWorkflow.ok); if (!withWorkflow.ok) return;
  assert.equal(withWorkflow.value.trunkVersion, activeManifest.value.trunkVersion); assert.equal(withWorkflow.value.digest, activeManifest.value.digest);
  assert.equal(withWorkflow.value.source, activeManifest.value.source); assert.deepEqual(withWorkflow.value.actionSource, activeManifest.value.actionSource);
  assert.deepEqual(withWorkflow.value.activeRoles, activeManifest.value.activeRoles); assert.equal(withWorkflow.value.activeDigest, activeManifest.value.activeDigest);
  assert.equal(withWorkflow.value.artifacts.workflow?.sha256, sha(workflowText));
  const replayWorkflow = await service.prepareInitialWorkflowCommit!({ ...workflowInput, at: new Date().toISOString() }); assert.ok(replayWorkflow.ok); if (!replayWorkflow.ok) return;
  assert.ok(!("preparationKind" in replayWorkflow.value) && replayWorkflow.value.applied, JSON.stringify(replayWorkflow));
  const wrongWorkflowAuthority = await service.prepareInitialWorkflowCommit!({ ...workflowInput, decisionId: "invented-customer-decision" });
  assert.ok(wrongWorkflowAuthority.ok && !("preparationKind" in wrongWorkflowAuthority.value) && !wrongWorkflowAuthority.value.applied);
  const workflowReport = { v: 1 as const, at: workflowAt, kind: "task.reported" as const, taskId, from: "convener", status: "done" as const,
    summary: "The actually approved freeform workflow is written and published", evidence: [PATHS.workflow] };
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: workflowReport })).ok);
  assert.equal((await service.prepareCreatedTaskClose(taskId, "convener")).ok, false, "Only the actual chief creator can close this task");
  const workflowBasis = await service.prepareCreatedTaskClose(taskId, "chief"); assert.ok(workflowBasis.ok, JSON.stringify(workflowBasis)); if (!workflowBasis.ok) return;
  assert.equal(workflowBasis.value.stableCommit?.kind, "stable-workflow-completion");
  assert.equal(workflowBasis.value.stableCommit?.operationId, sourceResult.value.operationId);
  assert.equal(workflowBasis.value.stableCommit?.taskId, taskId);
  assert.equal(workflowBasis.value.activationCommit, undefined); assert.equal(workflowBasis.value.initializationCommit, undefined);
  const stableClose = { operationId: "o13-real-workflow-creator-close", taskId, runId, basisDigest: workflowBasis.value.basisDigest,
    reportRef: workflowBasis.value.reportRef, outcome: "accepted" as const };
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { ...workflowReport, summary: "A genuinely newer workflow report" } })).ok);
  const staleStableClose = await service.closeCreatedTask(stableClose, "chief"); assert.ok(!staleStableClose.ok);
  assert.equal(staleStableClose.errorCode, "task-close-stale");
  await fs.writeFile(path.join(project.root, PATHS.workflow), workflowText + "unapproved live drift\n");
  assert.equal((await service.prepareCreatedTaskClose(taskId, "chief")).ok, false);
  await fs.writeFile(path.join(project.root, PATHS.workflow), workflowText);
  const sourcePath = `.ans/trunk/operations/${sha(sourceResult.value.operationId)}/stable-source.json`, sourceBytes = await fs.readFile(path.join(project.root, sourcePath));
  await fs.writeFile(path.join(project.root, sourcePath), JSON.stringify({ ...sourceResult.value, taskId: "another-real-task" }));
  assert.equal((await service.prepareCreatedTaskClose(taskId, "chief")).ok, false, "Live source tampering cannot replace the source committed in Git");
  await fs.writeFile(path.join(project.root, sourcePath), sourceBytes);
  const otherTask = "o13-different-convener-task";
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at: workflowAt, kind: "task.created", taskId: otherTask, from: "chief", to: "convener",
    text: "A different real planning assignment", sideEffect: "docs", idempotencyKey: otherTask, flowId: "demo", runId, runState: "draft" } })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { ...workflowReport, taskId: otherTask } })).ok);
  assert.equal((await service.prepareCreatedTaskClose(otherTask, "chief")).ok, false, "An old workflow source is not attributed to another task by its report text");
  const currentWorkflowBasis = await service.prepareCreatedTaskClose(taskId, "chief"); assert.ok(currentWorkflowBasis.ok, JSON.stringify(currentWorkflowBasis)); if (!currentWorkflowBasis.ok) return;
  let raced = false; const actualStore = createProjectTrunkStore(project.root);
  const racing = createTrunkService({ projectRoot: project.root, store: { ...actualStore, async prepareSnapshot(snapshot) {
    const result = await actualStore.prepareSnapshot!(snapshot);
    if (!raced) { raced = true; assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { ...workflowReport, summary: "Actual report arriving after basis capture" } })).ok); }
    return result;
  } } });
  const raceInput = { ...stableClose, basisDigest: currentWorkflowBasis.value.basisDigest, reportRef: currentWorkflowBasis.value.reportRef };
  const racedStableClose = await racing.closeCreatedTask(raceInput, "chief"); assert.ok(!racedStableClose.ok);
  assert.equal(racedStableClose.errorCode, "task-close-cas-conflict", "Final R9 ledger CAS rejects a report arriving after the real basis was prepared");
  const finalWorkflowBasis = await service.prepareCreatedTaskClose(taskId, "chief"); assert.ok(finalWorkflowBasis.ok, JSON.stringify(finalWorkflowBasis)); if (!finalWorkflowBasis.ok) return;
  const acceptedWorkflow = await service.closeCreatedTask({ ...stableClose, basisDigest: finalWorkflowBasis.value.basisDigest, reportRef: finalWorkflowBasis.value.reportRef }, "chief");
  assert.equal(acceptedWorkflow.status, "applied", JSON.stringify(acceptedWorkflow)); assert.equal(acceptedWorkflow.taskStatus, "closed");
  assert.equal(acceptedWorkflow.source?.kind === "role-direct" && acceptedWorkflow.source.action, "close-created-task");
  assert.equal((await service.closeCreatedTask({ ...stableClose, basisDigest: finalWorkflowBasis.value.basisDigest, reportRef: finalWorkflowBasis.value.reportRef }, "chief")).status, "applied");
  assert.equal(await fs.readFile(path.join(project.root, PATHS.workflow), "utf8"), workflowText, "Freeform approved bytes need no injected flow frontmatter");
  assert.deepEqual(await createProjectTrunkStore(project.root).readManifest(), withWorkflow, "Creator closure never republishes or re-pins the workflow");
  const unprovedRun = "run-o10-unproved-execution";
  assert.ok((await fsStore.compareAndSwapRunRecord!(unprovedRun, null, { schema: "ans-run/v1", flowId: "demo", runId: unprovedRun, state: "legacy", documents: {}, createdAt: workflowAt })).ok);
  const refusedUnknown = await service.prepareInitialWorkflowCommit!(workflowInput); assert.ok(refusedUnknown.ok && !("preparationKind" in refusedUnknown.value) && !refusedUnknown.value.applied, "Unproven old execution state cannot count as no pinned run");
  assert.deepEqual(await createProjectTrunkStore(project.root).readManifest(), withWorkflow);
  const executionTaskId = "o14-real-convener-execution";
  const traceExecution = (stage: string) => { if (process.env.ANS_O14_STAGE_TRACE === "1") process.stdout.write(`O14 actual layer: ${stage}\n`); };
  traceExecution("workflow-creator-close-complete");
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at: workflowAt, kind: "task.created", taskId: executionTaskId,
    from: "chief", to: "convener", flowId: "demo", runId, runState: "draft", text: "Organize execution using the actual published materials",
    sideEffect: "code", idempotencyKey: executionTaskId } })).ok);
  const parent = await inspectAssignedTask({ projectRoot: project.root, actorRoleId: "convener", taskId: executionTaskId });
  assert.ok(parent.ok, JSON.stringify(parent)); if (!parent.ok) return; assert.equal(parent.value.runId, runId); assert.equal(parent.value.flowId, "demo");
  const assignedParent = await prepareParentTaskRef({ projectRoot: project.root, actorRoleId: "convener", taskId: executionTaskId, flowId: "demo", runId });
  assert.ok(assignedParent.ok, JSON.stringify(assignedParent)); if (!assignedParent.ok) return;
  const workerTask: TaskCreatedEvent = { v: 1, at: workflowAt, kind: "task.created", taskId: "o14-actual-worker", from: "convener", to: "impl", flowId: "demo", runId,
    runState: "draft", moduleId: "impl-core", moduleDirectory: "src/impl/", modulePaths: ["src/impl/"], parentTaskRef: assignedParent.parentTaskRef,
    text: "Implement the actual assigned module", sideEffect: "code", idempotencyKey: "o14-actual-worker" };
  const beforePinWorker = await recordTaskObservation({ projectRoot: project.root, event: workerTask }); assert.ok(!beforePinWorker.ok);
  assert.equal(beforePinWorker.code, "task-worker-pin-unavailable"); assert.equal(beforePinWorker.message, "Run lacks a complete executable immutable pin");
  traceExecution("draft-worker-rejected-before-first-pin");
  const frozen = await freezeExecutionRun({ projectRoot: project.root, runId, flowId: "demo", operationId: "o14-real-first-execution-pin" });
  assert.ok(frozen.ok, JSON.stringify(frozen)); if (!frozen.ok) return;
  traceExecution("actual-first-pin-complete");
  assert.equal(frozen.run.state, "pinned"); assert.ok(FROZEN_ROLE_REF_KEYS.every(key => frozen.frozenRoles.impl![key].snapshotId === frozen.snapshotRef.snapshotId));
  const dispatchWorker = await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "convener", targetRoleId: "impl", flowId: "demo", runId, moduleId: "impl-core" });
  assert.ok(dispatchWorker.ok && dispatchWorker.value.kind === "execution", JSON.stringify(dispatchWorker));
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { ...workerTask, runState: "pinned" } })).ok);
  traceExecution("actual-pinned-worker-registered");
  const workerContext = await readRunRoleContext({ projectRoot: project.root, runId, roleId: "impl" }); assert.ok(workerContext.ok, JSON.stringify(workerContext));
  const taskScope = await prepareAssignedTaskWriteScope({ projectRoot: project.root, taskId: workerTask.taskId, actorRoleId: "impl" });
  assert.ok(taskScope.ok, JSON.stringify(taskScope)); if (taskScope.ok) assert.deepEqual(taskScope.value.paths, ["src/impl/"]);
  assert.deepEqual(await createProjectTrunkStore(project.root).readManifest(), withWorkflow, "First execution pin does not change the document/active Git pointer");
  const objects = createGitCandidateStore(project.root), codeBasis = frozen.run.codeBasis;
  assert.ok(codeBasis && typeof codeBasis === "object" && "oid" in codeBasis && codeBasis.oid, "New pin carries the actual code-basis app ref");
  const workerGit = createGitCapabilityService({ projectRoot: project.root, context: { actorRoleId: "impl", taskId: workerTask.taskId, runId, readPaths: ["."] } });
  const query = await workerGit.prepareQuery({ operationId: "o18-real-worker-query", template: "log", limit: 1 }, { actorRoleId: "impl", taskId: workerTask.taskId, runId, readPaths: ["."] });
  assert.ok(query.ok, JSON.stringify(query)); if (!query.ok) return;
  const queried = await workerGit.executeQuery(query.value, checkGitPolicy(query.value.policyInput));
  assert.equal(queried.status, "observed", JSON.stringify(queried)); assert.deepEqual(queried.basis, codeBasis);
  assert.equal(queried.basisSource?.runId, runId); assert.equal(queried.basisSource?.pinDigest, frozen.pinDigest);
  const basis = queried.basis; assert.ok(basis?.oid); if (!basis?.oid) return;
  await fs.mkdir(path.join(project.root, "src/impl"), { recursive: true }); await fs.writeFile(path.join(project.root, "src/impl/finite.ts"), "export const transition = 'done';\n");
  const request = { operationId: "o18-real-worker-candidate", action: "commit" as const, base: basis, paths: ["src/impl/finite.ts"], message: "Actual assigned finite state module" };
  const preparedWorker = await workerGit.prepareWorkerCommit(request); assert.ok(preparedWorker.ok, JSON.stringify(preparedWorker)); if (!preparedWorker.ok) return;
  const workerVerdict = checkGitPolicy(preparedWorker.value.policyInput); assert.ok(workerVerdict.allowed, JSON.stringify(workerVerdict));
  let workerCandidateOid: import("../../src/model/trunk.ts").GitOid | undefined;
  const workerLease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(workerLease.ok); if (!workerLease.ok) return;
  try {
    assert.equal((await workerGit.executeWorkerCommit(structuredClone(preparedWorker.value), workerLease.leaseId, workerVerdict)).status, "blocked", "A copied preparation is not an execution capability");
    const candidate = await workerGit.executeWorkerCommit(preparedWorker.value, workerLease.leaseId, workerVerdict); assert.equal(candidate.status, "prepared", JSON.stringify(candidate));
    assert.ok(candidate.candidate && candidate.tree); if (!candidate.candidate) return;
    workerCandidateOid = candidate.candidate;
    assert.equal(Buffer.from((await objects.readBlob(candidate.candidate, "src/impl/finite.ts")).bytesBase64, "base64").toString("utf8"), "export const transition = 'done';\n");
    assert.deepEqual(await objects.readRef("refs/ans/trunk"), basis.oid, "Worker candidate never publishes document/delivery trunk");
    const journal = await createGitRefStore(project.root).readJournal(request.operationId); assert.ok(journal && journal.phase === "published");
    assert.equal(journal.candidateSource?.taskId, workerTask.taskId); assert.equal(journal.candidateSource?.kind, "assigned-run-task");
    if (journal.candidateSource?.kind === "assigned-run-task") assert.equal(journal.candidateSource.moduleId, "impl-core");
    assert.deepEqual(journal.newOid, candidate.candidate); assert.equal(journal.process?.termination, "exited");
    assert.deepEqual(await workerGit.executeWorkerCommit(preparedWorker.value, workerLease.leaseId, workerVerdict), candidate, "Original operation replays without another candidate");
    assert.equal((await workerGit.prepareWorkerCommit({ ...request, operationId: "outside-module", paths: ["docs/workflow.md"] })).ok, false);
    assert.equal((await workerGit.prepareWorkerCommit({ ...request, operationId: "wrong-code-base", base: { ...basis, oid: candidate.candidate } })).ok, false);
    await fs.writeFile(path.join(project.root, "src/impl/finite.ts"), "changed after preparation\n");
    assert.equal((await workerGit.executeWorkerCommit(preparedWorker.value, workerLease.leaseId, workerVerdict)).status, "blocked", "Actual selected bytes are rechecked under R9");
  } finally { endGitHostAction({ projectRoot: project.root, leaseId: workerLease.leaseId }); }
  traceExecution("actual-assigned-worker-candidate-created");
  assert.ok(workerCandidateOid); if (!workerCandidateOid) return;
  await fs.writeFile(path.join(project.root, "src/impl/finite.ts"), "export const transition = 'done';\n");
  const controlGit = createGitCapabilityService({ projectRoot: project.root, context: { actorRoleId: "convener", taskId: executionTaskId, runId, readPaths: ["."] } });
  const integrationRequest = { operationId: "o19-real-final-integration", action: "integrate" as const, base: basis, candidates: [workerCandidateOid], message: "Integrate the actual accepted module" };
  const beforeClose = await controlGit.prepareIntegration(integrationRequest); assert.equal(beforeClose.ok, false, "Reporting/Git success alone cannot release accepted-child integration");
  assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at: workflowAt, kind: "task.reported", taskId: workerTask.taskId, from: "impl", status: "done",
    summary: "Actual committed finite-state module", evidence: ["src/impl/finite.ts", `Git candidate ${workerCandidateOid.objectFormat}:${workerCandidateOid.hex}`] } })).ok);
  const workerCloseBasis = await service.prepareCreatedTaskClose(workerTask.taskId, "convener"); assert.ok(workerCloseBasis.ok, JSON.stringify(workerCloseBasis)); if (!workerCloseBasis.ok) return;
  const acceptedChild = await service.closeCreatedTask({ operationId: "o19-creator-accept-worker", taskId: workerTask.taskId, runId, basisDigest: workerCloseBasis.value.basisDigest,
    reportRef: workerCloseBasis.value.reportRef, outcome: "accepted" }, "convener"); assert.equal(acceptedChild.status, "applied", JSON.stringify(acceptedChild));
  traceExecution("actual-worker-creator-accepted");
  const preparedIntegration = await controlGit.prepareIntegration(integrationRequest); assert.ok(preparedIntegration.ok, JSON.stringify(preparedIntegration)); if (!preparedIntegration.ok) return;
  assert.deepEqual(preparedIntegration.value.plan.commit.parents, [basis.oid, workerCandidateOid]);
  const integrationVerdict = checkGitPolicy(preparedIntegration.value.policyInput);
  if (process.env.ANS_O19_POLICY_FACTS) await fs.writeFile(process.env.ANS_O19_POLICY_FACTS, JSON.stringify({ facts: preparedIntegration.value.policyInput, source: preparedIntegration.value.source, verdict: integrationVerdict }, null, 2));
  assert.equal(integrationVerdict.allowed, true, JSON.stringify(integrationVerdict));
  const integrationLease = beginGitHostAction({ projectRoot: project.root, kind: "git-mutation" }); assert.ok(integrationLease.ok); if (!integrationLease.ok) return;
  try {
    const integrated = await controlGit.executeWorkerCommit(preparedIntegration.value, integrationLease.leaseId, integrationVerdict);
    assert.equal(integrated.status, "prepared", JSON.stringify(integrated)); assert.ok(integrated.candidate && integrated.tree); if (!integrated.candidate) return;
    const actual = await objects.readCommit(integrated.candidate); assert.deepEqual(actual.parents, [basis.oid, workerCandidateOid]);
    assert.deepEqual(actual, preparedIntegration.value.plan.commit);
    const beforeTree = await objects.listTree(basis.oid), finalTree = await objects.listTree(integrated.candidate);
    for (const unchanged of beforeTree.filter(entry => entry.path !== "src/impl/finite.ts")) assert.deepEqual(finalTree.find(entry => entry.path === unchanged.path), unchanged, "Integration preserves every unchanged base blob/mode");
    assert.deepEqual(await objects.readRef("refs/ans/trunk"), basis.oid, "An integration candidate is not document/delivery publication");
    const integrationJournal = await createGitRefStore(project.root).readJournal(integrationRequest.operationId);
    assert.ok(integrationJournal && integrationJournal.phase === "published" && integrationJournal.candidateSource?.kind === "run-integration");
    if (integrationJournal?.candidateSource?.kind === "run-integration") {
      assert.equal(integrationJournal.candidateSource.contributors[0]?.closeOperationId, acceptedChild.operationId);
      assert.equal(integrationJournal.candidateSource.contributors[0]?.source.taskId, workerTask.taskId);
    }
    assert.deepEqual(await controlGit.executeWorkerCommit(preparedIntegration.value, integrationLease.leaseId, integrationVerdict), integrated);
    assert.equal((await controlGit.prepareIntegration({ ...integrationRequest, operationId: "duplicate-heads", candidates: [workerCandidateOid, workerCandidateOid] })).ok, false);
  } finally { endGitHostAction({ projectRoot: project.root, leaseId: integrationLease.leaseId }); }
  traceExecution("actual-convener-integration-candidate-created");
});

