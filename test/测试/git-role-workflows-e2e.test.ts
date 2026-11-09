import assert from "node:assert/strict";
import type { TestOptions } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, request as httpRequest } from "node:http";
import { parse as parseYaml } from "yaml";
import { shortenSummary, readTaskState, type TaskRecord } from "../../src/common/编排/task-state.ts";
import { inspectQueuedControllerResume } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { inspectRuntimeCoreRegistry } from "../../src/service/runtime/session.ts";
import { initializeGitRepository, createGitCandidateStore, createGitRefStore, createProjectTrunkStore, readGitInitializationRecord, readGitInitialWorkflowSource } from "../../src/provider/trunk/public/trunk-store.ts";
import { createStableWriteStore, createStableWritePermitStore, readVersionBaselineState } from "../../src/provider/version-change/public/version-change-store.ts";
import { FROZEN_ROLE_REF_KEYS, TRUNK_MANIFEST_SCHEMA, isDirectActionReceipt, isGitBasis, isGitOid, isFrozenRoleEvidence, isGitCapabilityResult, isSnapshotArtifactRef, isSnapshotRef, type GitCapabilityResult, type GitEvidenceRef, type GitOid, type CompleteSnapshot, type SnapshotArtifactRef } from "../../src/model/trunk.ts";
import { isDispatchTaskResumeController, isTaskParentRef, isTaskReviewBasisRef, isTaskReviewControllerRef, type TaskReviewBasisRef } from "../../src/model/runtime.ts";
import { actualApplicationNotice, actualUserInput, actualToolReply, createFixtureTailRecorder, fixtureTailToolFact, createRealHttpDriver as createBaseRealHttpDriver, fixtureWaitBudgetMs, gitTool, hashFixtureFiles, observeFixtureGitMetadata, modelCalls, modelDone, observeDiagnosticTimers, readFixtureHttpBody, runDesktopLifecycleProbe, type ChatRequest, type HttpScripts, type HttpTrace } from "./git-role-workflows-driver.ts";

const evidence = path.resolve("角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence");
const continuousChangeChild = process.env.ANS_CONTINUOUS_CHANGE_CHILD === "1";
const continuousDrivers: Awaited<ReturnType<typeof createBaseRealHttpDriver>>[] = [];
const createRealHttpDriver = continuousChangeChild ? async (...args: Parameters<typeof createBaseRealHttpDriver>) => {
  const driver = await createBaseRealHttpDriver(...args); continuousDrivers.push(driver); return driver;
} : createBaseRealHttpDriver;
const standaloneBusiness = continuousChangeChild || process.env.ANS_Q36_STANDALONE === "1" || process.env.ANS_Q39_CHILD === "1" || process.env.ANS_CHANGE_STANDALONE === "1" || process.env.ANS_CHANGE_PLAN_STANDALONE === "1" || process.env.ANS_CHANGE_PUBLISH_STANDALONE === "1" || process.env.ANS_CHANGE_EXECUTION_STANDALONE === "1" || process.env.ANS_HUB_DRAFT_STANDALONE === "1" || process.env.ANS_PRODUCT_RECOVERY_STANDALONE === "1" || process.env.ANS_CHIEF_RECOVERY_STANDALONE === "1" || process.env.ANS_BLOCKED_PREPARATION_STANDALONE === "1" || process.env.ANS_NEW_MODIFICATION_CHILD === "1" || process.env.ANS_EXISTING_REVERT_CHILD === "1" || process.env.ANS_QUEUED_RESUME_READONLY_PROBE === "1" || process.env.ANS_EXISTING_MODIFICATION_REVERT_CHILD === "1" || process.env.ANS_CHIEF_DIALOGUE_STANDALONE === "1";
const nodeTest = standaloneBusiness ? undefined : (await import("node:test")).test;
const registeredCases: { name: string; run: () => Promise<void> }[] = [];
function test(name: string, options: TestOptions, run: () => Promise<void>) {
  if (nodeTest) { registeredCases.push({ name, run }); return nodeTest(name, options, run); }
  // Standalone does not register or report tests; its sole entry below awaits the full business function.
}

function phaseDeadline(localMs: number) {
  const local = Date.now() + localMs;
  if (!continuousChangeChild) return local;
  const absolute = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT);
  assert.ok(Number.isSafeInteger(absolute) && absolute > Date.now(), "CONTINUOUS_SHARED_DEADLINE_EXHAUSTED");
  return Math.min(local, absolute);
}
function evidenceField(value: unknown, key: string): unknown {
  assert.ok(value && typeof value === "object"); return Reflect.get(value, key);
}
async function verifiedProofLink(value: unknown) {
  const file = evidenceField(value, "path"), expected = evidenceField(value, "sha256");
  assert.ok(typeof file === "string" && typeof expected === "string");
  const bytes = await fs.readFile(file); assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  return JSON.parse(bytes.toString("utf8"));
}
async function verifyChangeBaseReceipt(value: unknown) {
  if (continuousChangeChild) {
    assert.equal(evidenceField(value, "schema"), "qa-inprocess-new-stage/v1"); assert.equal(evidenceField(value, "completed"), true);
    assert.equal(evidenceField(value, "processId"), process.pid); assert.equal(evidenceField(value, "runNonce"), process.env.ANS_HARNESS_RUN_ID);
    assert.equal(evidenceField(value, "runtimeProcessInstanceId"), inspectRuntimeCoreRegistry().processInstanceId);
    const files = evidenceField(value, "inputFiles"); assert.ok(Array.isArray(files));
    for (const source of files) { phaseDeadline(1);
      const file = evidenceField(source, "path"), expected = evidenceField(source, "sha256"); assert.ok(typeof file === "string" && typeof expected === "string");
      assert.ok(file.startsWith("src/") || file.startsWith("app/") || ["test/测试/git-role-workflows-driver.ts", "test/测试/git-role-workflows-e2e.test.ts"].includes(file));
      assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"), expected, `CONTINUOUS_INPUT_CHANGED ${file}`);
    }
    const completed = await verifiedProofLink(evidenceField(value, "completedProof"));
    assert.equal(completed.root, evidenceField(value, "root")); assert.ok(isGitCapabilityResult(completed.extra.publishedDelivery) && completed.extra.publishedDelivery.status === "published");
    assert.deepEqual(completed.observation.inventory.pendingOpens, []); assert.deepEqual(completed.observation.inventory.activeDeliveries, []); assert.deepEqual(completed.observation.inventory.queuedDispatches, []);
  } else {
    assert.equal(evidenceField(value, "schema"), "qa-owned-delivered-seed/v1"); assert.equal(evidenceField(value, "clean"), true);
    await verifiedProofLink(evidenceField(value, "parentProof"));
  }
  const post = await verifiedProofLink(evidenceField(value, "postCleanupProof")); assert.deepEqual(post.errors, []);
  assert.equal(post.root, evidenceField(value, "root"));
}
type ActualErrorFact = { name?: string; message?: string; stack?: string; code?: unknown; errors?: ActualErrorFact[]; thrown?: string };
function actualErrorFact(error: unknown): ActualErrorFact {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack,
    ...(Object.hasOwn(error, "code") ? { code: Reflect.get(error, "code") } : {}),
    ...(error instanceof AggregateError ? { errors: error.errors.map(actualErrorFact) } : {}) } : { thrown: String(error) };
}
async function preservePhaseCleanup(caseTag: string, primary: { error: unknown } | undefined, cleanup: () => Promise<void>) {
  let cleanupFailure: { error: unknown } | undefined;
  try { await cleanup(); } catch (error) { cleanupFailure = { error }; }
  const failures = [...(primary ? [primary.error] : []), ...(cleanupFailure ? [cleanupFailure.error] : [])];
  try { await fs.writeFile(path.join(evidence, `${caseTag}-error-outcomes.json`), JSON.stringify({ at: new Date().toISOString(), processId: process.pid,
    primaryError: primary ? actualErrorFact(primary.error) : null, cleanupError: cleanupFailure ? actualErrorFact(cleanupFailure.error) : null }, null, 2));
  } catch (error) { failures.push(error); }
  if (cleanupFailure || failures.length > (primary ? 1 : 0)) throw new AggregateError(failures, "Actual phase and cleanup errors; no failure suppressed");
}

/** Accept only a relay of an exact reply already produced by this fixture's real role HTTP turn. */
function ownProducedFeedback(body: ChatRequest, trace: readonly HttpTrace[], allowedRoles: readonly string[]) {
  const input = actualUserInput(body);
  const labels: Record<string, string> = { product: "产品", rapporteur: "策划", convener: "运营", nominator: "人事", verifier: "质检" };
  for (const row of trace) {
    const role = row.role.split(":")[0]!;
    if (!allowedRoles.includes(row.role) || !labels[role] || typeof row.reply?.content !== "string") continue;
    const expected = `[系统·治理反馈] 来自 ${labels[role]} 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：\n${row.reply.content}\n请用 1-3 句话向客户汇总：完成了什么、是否有风险/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。`;
    if (input === expected) return `${row.role}:${row.sequence}`;
  }
  assert.fail(`UNKNOWN_ROLE_FEEDBACK: no matching actual producer turn: ${input}`);
}

type VisibleHubController = { taskId: string; flowId: string; runId: string };
type VisibleHubDelivery = { controller: VisibleHubController; candidateOperationId: string; candidate: GitOid;
  reviewTaskId: string; reviewCloseOperationId: string; criteria: GitEvidenceRef[]; evidence: GitEvidenceRef[]; qualityPath: string };
type VisibleDeliveredTextSource = { flowId: string; operationId: string; candidate: GitOid; worker: GitOid };
function visibleDeliveredTextSource(text: string): VisibleDeliveredTextSource {
  const matches = [...text.matchAll(/DELIVERED\|f=([A-Za-z0-9_-]+)\|o=([A-Za-z0-9_:-]+)\|c=(sha1|sha256):([a-f0-9]+)\|w=(sha1|sha256):([a-f0-9]+)\|END/g)];
  assert.equal(matches.length, 1, "Actual delivered-source handback must contain one complete bounded packet"); const match = matches[0]; assert.ok(match);
  const flowId = match[1], operationId = match[2], candidate: unknown = { objectFormat: match[3], hex: match[4] }, worker: unknown = { objectFormat: match[5], hex: match[6] };
  assert.ok(flowId && operationId && isGitOid(candidate) && isGitOid(worker)); assert.notDeepEqual(candidate, worker, "Integration delivery must not relabel its source worker as final candidate");
  return { flowId, operationId, candidate, worker };
}
function visibleCandidate(text: string): GitOid {
  const match = /Git candidate (sha1|sha256):([a-f0-9]+)(?:\s|$)/.exec(text); assert.ok(match, "Actual handback must expose the specified candidate");
  const oid: unknown = { objectFormat: match[1], hex: match[2] }; assert.ok(isGitOid(oid)); return oid;
}
function visibleEvidence(text: string, label: "criterion" | "artifact"): GitEvidenceRef[] {
  return [...text.matchAll(new RegExp("Git " + label + " (sha1|sha256):([a-f0-9]+) ([^\\s]+) ([a-f0-9]{64})(?:\\s|$)", "g"))].map(match => {
    const oid: unknown = { objectFormat: match[1], hex: match[2] }; assert.ok(isGitOid(oid)); return { oid, path: match[3]!, sha256: match[4]! };
  });
}
function isVisibleHubDelivery(value: unknown): value is VisibleHubDelivery {
  if (!value || typeof value !== "object") return false;
  const controller = Reflect.get(value, "controller");
  const text = (key: string) => typeof Reflect.get(value, key) === "string" && Reflect.get(value, key).length > 0;
  const refs = (key: string) => { const rows = Reflect.get(value, key); return Array.isArray(rows) && rows.length > 0 && rows.every(row => row && typeof row === "object"
    && isGitOid(Reflect.get(row, "oid")) && typeof Reflect.get(row, "path") === "string" && typeof Reflect.get(row, "sha256") === "string" && /^[a-f0-9]{64}$/.test(Reflect.get(row, "sha256"))); };
  return !!controller && typeof controller === "object" && ["taskId", "flowId", "runId"].every(key => typeof Reflect.get(controller, key) === "string" && Reflect.get(controller, key).length > 0)
    && isGitOid(Reflect.get(value, "candidate")) && ["candidateOperationId", "reviewTaskId", "reviewCloseOperationId", "qualityPath"].every(text) && refs("criteria") && refs("evidence");
}

test("Q30 fixture HTTP preserves split UTF8 and byte budget", { timeout: 10000 }, async () => {
  const original = JSON.stringify({ message: "验收复核已结束与报告位置" }), bytes = Buffer.from(original, "utf8");
  const split = bytes.indexOf(Buffer.from("已", "utf8")) + 1, chunkBytes: number[] = [];
  assert.ok(split > 1); let observedFirstChunk!: () => void;
  const firstChunk = new Promise<void>(resolve => { observedFirstChunk = resolve; });
  let serverError: string | undefined;
  const server = createServer(async (request, response) => {
    try {
      async function* observedChunks() {
        for await (const chunk of request) { chunkBytes.push(chunk.length); if (chunkBytes.length === 1) observedFirstChunk(); yield chunk; }
      }
      response.end(await readFixtureHttpBody(observedChunks()));
    } catch (error) { serverError = String(error); response.statusCode = 500; response.end(serverError); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  let returned: string | undefined;
  try {
    returned = await new Promise<string>((resolve, reject) => {
      const request = httpRequest({ host: "127.0.0.1", port: address.port, path: "/v1/chat/completions", method: "POST" }, response => {
        readFixtureHttpBody(response).then(resolve, reject);
      });
      request.once("error", reject); request.write(bytes.subarray(0, split));
      firstChunk.then(() => request.end(bytes.subarray(split)), reject);
    });
    assert.equal(serverError, undefined); assert.ok(chunkBytes.length >= 2); assert.equal(chunkBytes[0], split);
    assert.equal(returned, original); assert.deepEqual(JSON.parse(returned), JSON.parse(original));
    async function* overBudget() { yield Buffer.alloc(2 * 1024 * 1024); yield Buffer.from([1]); }
    await assert.rejects(readFixtureHttpBody(overBudget()), /HTTP_INPUT_BUDGET/);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.writeFile(path.join(evidence, "q30-utf8-http-probe.json"), JSON.stringify({ at: new Date().toISOString(), original, returned, split, chunkBytes,
      serverError, serverClosed: !server.listening, purpose: "Owned loopback transport only; deliberately split the first byte of 已, exact text equality and 2MiB+1 rejection", businessPass: false }, null, 2));
  }
});

test("Q74 owned Git metadata observer atomic rename race remains bounded and strict", { timeout: 10000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "q2-git-metadata-observer-")); await initializeGitRepository(root);
  const registry = path.join(root, ".git/ans/processes"); await fs.mkdir(registry, { recursive: true });
  const headBefore = await fs.readFile(path.join(root, ".git/HEAD")), stableHash = createHash("sha256").update(headBefore).digest("hex");
  const facts: unknown[] = [];
  async function race(mode: "strict" | "live-diagnostic", temporary: string, destination: string) {
    await fs.writeFile(temporary, "actual controlled process record bytes\n");
    let releaseWriter: () => void = () => { throw new Error("writer not initialized"); }, releaseReader: () => void = () => { throw new Error("reader not initialized"); };
    const enumerated = new Promise<void>(resolve => { releaseWriter = resolve; }), renamed = new Promise<void>(resolve => { releaseReader = resolve; });
    let released = false, scans = 0;
    const writer = (async () => { await enumerated; try { await fs.rename(temporary, destination); facts.push({ event: "actual-owned-rename", from: temporary, to: destination }); } finally { releaseReader(); } })();
    try {
      return await hashFixtureFiles(root, ".git", { mode, afterEnumerate: async (directory, attempt) => {
        if (directory !== ".git/ans/processes") return; scans = attempt;
        if (!released) { released = true; facts.push({ event: "actual-directory-enumerated-before-rename", mode, attempt }); releaseWriter(); await renamed; }
      } });
    } finally { if (!released) releaseWriter(); await writer; facts.push({ event: "bounded-scan-return", mode, scans }); }
  }
  const tempName = () => `.${randomUUID()}.json.tmp-${process.pid}-0123456789abcdef`;
  const observed = await race("live-diagnostic", path.join(registry, tempName()), path.join(registry, `${randomUUID()}.json`));
  assert.ok(observed.length); assert.equal(observed.find(file => file.path === ".git/HEAD")?.sha256, stableHash);
  assert.equal(observed.some(file => file.path.includes(".tmp-")), false); assert.ok(facts.some(fact => evidenceField(fact, "event") === "bounded-scan-return" && evidenceField(fact, "scans") === 2));
  await assert.rejects(race("strict", path.join(registry, tempName()), path.join(registry, `${randomUUID()}.json`)), { code: "ENOENT" });
  await assert.rejects(race("live-diagnostic", path.join(registry, "unrecognized.tmp"), path.join(registry, "unrecognized-final.json")), { code: "ENOENT" });
  // A present producer temp may still be partial. Three fresh scans produce explicit unknown, never [] or fake absence.
  const persistent = path.join(registry, tempName()); await fs.writeFile(persistent, "active owned producer bytes\n"); let attempts = 0;
  const unknown = await observeFixtureGitMetadata(root, { afterEnumerate: async (directory, attempt) => { if (directory === ".git/ans/processes") attempts = attempt; } });
  assert.equal(attempts, 3); assert.equal(unknown.gitMetadata, null); assert.equal(unknown.gitMetadataDiagnostic.state, "unknown");
  await fs.rename(persistent, path.join(registry, `${randomUUID()}.json`));
  // Ordinary stable metadata disappearance is never eligible for the temporary-process retry.
  let movedHead = false;
  await assert.rejects(hashFixtureFiles(root, ".git", { mode: "live-diagnostic", afterEnumerate: async directory => {
    if (directory === ".git" && !movedHead) { movedHead = true; await fs.rename(path.join(root, ".git/HEAD"), path.join(root, ".git/HEAD.saved")); }
  } }), { code: "ENOENT" });
  await fs.rename(path.join(root, ".git/HEAD.saved"), path.join(root, ".git/HEAD"));
  await assert.rejects(hashFixtureFiles(root, ".git/unknown-source"), { code: "ENOENT" });
  await assert.rejects(hashFixtureFiles(root, ".git/HEAD"), { code: "ENOTDIR" });
  const immutable = path.join(root, ".git/objects/aa"); await fs.mkdir(immutable, { recursive: true });
  const immutablePath = path.join(immutable, "owned-hash-fixture.bin"); await fs.writeFile(immutablePath, "not a domain object or candidate; observer error fixture only\n"); let movedObject = false;
  await assert.rejects(hashFixtureFiles(root, ".git", { mode: "live-diagnostic", afterEnumerate: async directory => {
    if (directory === ".git/objects/aa" && !movedObject) { movedObject = true; await fs.rename(immutablePath, path.join(root, "retained-immutable-fixture.bin")); }
  } }), { code: "ENOENT" });
  const target = path.join(root, "owned-link-target"), link = path.join(root, ".git/owned-unknown-link"); await fs.mkdir(target);
  await fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(hashFixtureFiles(root, ".git", { mode: "live-diagnostic" }), /must not follow unknown links/);
  assert.equal(createHash("sha256").update(await fs.readFile(path.join(root, ".git/HEAD"))).digest("hex"), stableHash);
  await fs.writeFile(path.join(evidence, `q74-metadata-observer-race-proof-${process.pid}-${randomUUID()}.json`), JSON.stringify({ at: new Date().toISOString(), root, layerOnly: true, noBusinessOrAuthorityFactsCreated: true,
    stableHeadSha256: stableHash, observed, unknown, attempts, facts, covered: ["real enumeration/rename overlap recovered by fresh scan", "strict temp ENOENT preserved", "unknown temp ENOENT preserved", "stable metadata and object-read ENOENT preserved", "ENOTDIR preserved", "unknown link rejected", "three attempts yields explicit unknown/null, not absence"] }, null, 2), { flag: "wx" });
});

test("Q75 persisted governance status pointer is information only and bound across Desktop rebuild", { timeout: 10000, skip: process.env.ANS_STATUS_POINTER_CHECK !== "1" }, async () => {
  const checkTag = process.env.ANS_STATUS_POINTER_CHECK_TAG; assert.ok(checkTag && /^q[1-9]\d{0,5}-status-check-\d{2}$/.test(checkTag));
  const checkpointPath = path.join(evidence, "q74-known-status-first-failure-checkpoint.json"), checkpointBytes = await fs.readFile(checkpointPath);
  assert.equal(createHash("sha256").update(checkpointBytes).digest("hex"), "317e8b75a53ba8185edf9942298c5c4ddc722bb648260c47cae39e69181a1aff");
  const fixture = JSON.parse(checkpointBytes.toString("utf8")), originals = fixture.originals; assert.ok(Array.isArray(originals));
  const verifiedOriginal = async (suffix: string) => { const row = originals.find(row => typeof row.path === "string" && row.path.endsWith(suffix)); assert.ok(row);
    const bytes = await fs.readFile(row.path); assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256); return { path: row.path, sha256: row.sha256, value: JSON.parse(bytes.toString("utf8")) }; };
  const previous = await verifiedOriginal("q74-new-new-delivery-controller-closed.json"), current = await verifiedOriginal("q74-edit-after-cleanup-proof.json");
  const before = await fs.readFile(path.join(fixture.root, ".ans/state/tasks.jsonl"));
  const modelReply = await receivePersistedGovernanceStatus(fixture.actualErrorRequest.request, { root: fixture.root, currentTaskKey: "q74-edit-review", trace: current.value.trace,
    historyProof: { path: previous.path, sha256: previous.sha256 }, seen: new Set<string>(), caseTag: checkTag });
  assert.ok(modelReply?.content?.includes("既有质检状态指针")); assert.equal(modelReply?.tool_calls, undefined, "Information ACK cannot issue any authority or business action");
  const historical = fixture.historicalPointer, actualRead = historical.actualReportSnapshotReadback;
  const savedQuality = actualRead.result.value.snapshot.files.find((file: unknown) => evidenceField(file, "path") === historical.path); assert.ok(savedQuality);
  const savedQualitySha = evidenceField(savedQuality, "sha256"); assert.ok(typeof savedQualitySha === "string");
  const facts: StatusPointerFacts = { notice: fixture.actualErrorRequest.request.messages.at(-1).content, qualityPath: historical.path,
    qualityBytes: await fs.readFile(path.join(fixture.root, historical.path)), qualitySha256: historical.sha256, task: historical.actualTask, currentTask: fixture.currentReview.actualTask,
    currentTarget: { operationId: "q74-edit-integrate", candidate: fixture.currentReview.actualTask.created.reviewBasisRef.candidate },
    reportRef: actualRead.ref, reportSnapshotBytes: Buffer.from(actualRead.result.value.bytesBase64, "base64"), snapshotQualitySha256: savedQualitySha };
  const validated = validatePersistedStatusPointer(facts); assert.equal(validated.kind, "historical-accepted-status-pointer"); assert.equal(validated.acceptedPointer, true); assert.equal(validated.currentReviewAccepted, false);
  assert.throws(() => validatePersistedStatusPointer({ ...facts, notice: governanceStatusPointer("q2-new", "docs/quality/q2-new-report-v99.md"), qualityPath: "docs/quality/q2-new-report-v99.md" }));
  assert.throws(() => validatePersistedStatusPointer({ ...facts, qualityBytes: Buffer.concat([facts.qualityBytes, Buffer.from("changed")]) }));
  assert.throws(() => validatePersistedStatusPointer({ ...facts, task: { ...facts.task, taskId: "wrong-task" } }));
  assert.throws(() => validatePersistedStatusPointer({ ...facts, currentTarget: { ...facts.currentTarget, candidate: validated.candidate } }));
  assert.throws(() => validatePersistedStatusPointer({ ...facts, snapshotQualitySha256: "0".repeat(64) }));
  const unaccepted: StatusPointerFacts = { notice: governanceStatusPointer("q2-new", fixture.currentReview.qualityPath), qualityPath: fixture.currentReview.qualityPath,
    qualityBytes: await fs.readFile(path.join(fixture.root, fixture.currentReview.qualityPath)), qualitySha256: fixture.currentReview.sha256,
    task: fixture.currentReview.actualTask, currentTask: fixture.currentReview.actualTask, currentTarget: facts.currentTarget };
  assert.throws(() => validatePersistedStatusPointer(unaccepted), /document version/, "Actual old Q74 v2 bytes incorrectly declared version1; do not retroactively accept them");
  const oldFrontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(unaccepted.qualityBytes.toString("utf8")); assert.ok(oldFrontmatter?.[1]);
  const oldMetadata: unknown = parseYaml(oldFrontmatter[1]); assert.ok(oldMetadata && typeof oldMetadata === "object" && !Array.isArray(oldMetadata));
  const controlledBytes = Buffer.from(unaccepted.qualityBytes.toString("utf8").replace(oldFrontmatter[0], `---\n${JSON.stringify({ ...oldMetadata, version: qualityDocumentVersion(unaccepted.qualityPath) })}\n---\n`));
  const unacceptedPointer = validatePersistedStatusPointer({ ...unaccepted, qualityBytes: controlledBytes, qualitySha256: createHash("sha256").update(controlledBytes).digest("hex") });
  assert.equal(unacceptedPointer.currentReviewAccepted, false); assert.equal(unacceptedPointer.acceptedPointer, false); assert.equal(unacceptedPointer.reportRef, null);
  const repeat = new Set<string>(); const receive = () => receivePersistedGovernanceStatus(fixture.actualErrorRequest.request, { root: fixture.root, currentTaskKey: "q74-edit-review", trace: current.value.trace,
    historyProof: { path: previous.path, sha256: previous.sha256 }, seen: repeat, caseTag: `${checkTag}-repeat` });
  const firstAck = await receive(), repeatedAck = await receive(); assert.deepEqual(repeatedAck, firstAck); assert.equal(repeatedAck?.tool_calls, undefined);
  const sourceReceipts = new Set<string>(); assert.equal(recordStatusPointerReceipt(sourceReceipts, "actual-q74-pointer", facts.notice, validated), "fresh");
  assert.equal(recordStatusPointerReceipt(sourceReceipts, "actual-q74-pointer", facts.notice, validated), "duplicate");
  assert.throws(() => recordStatusPointerReceipt(sourceReceipts, "actual-q74-pointer", facts.notice, { ...validated, qualitySha256: "0".repeat(64) }), /Conflicting governance status/);
  const actualRef = validated.reportRef; assert.ok(actualRef); assert.throws(() => recordStatusPointerReceipt(sourceReceipts, "actual-q74-pointer", facts.notice, { ...validated,
    reportRef: { ...actualRef, snapshotId: "conflicting-snapshot" } }), /Conflicting governance status/);
  assert.deepEqual(await fs.readFile(path.join(fixture.root, ".ans/state/tasks.jsonl")), before, "Read-only pointer validation must not alter historical or current task state");
  await fs.writeFile(path.join(evidence, `${checkTag}-proof.json`), JSON.stringify({ at: new Date().toISOString(), layerOnly: true, actualQ74Root: fixture.root,
    realPriorReportRef: facts.reportRef, validated, unacceptedPointer, wrongPathShaTaskCurrentCidSnapshotShaRejected: true, identicalDuplicateInformationAck: true, conflictingReceiptShaOrSnapshotRejected: true, taskLedgerSha256: createHash("sha256").update(before).digest("hex"),
    noBusinessOrAuthorityEffects: true, scope: "Real stored historical v1 pointer plus actual old v2 mismatch rejection and in-memory corrected-version protocol control only; no old-root writes/business rerun/new quality acceptance" }, null, 2), { flag: "wx" });
});

test("Q87 quality document filename version keeps schema and actual metadata bindings", { timeout: 10000, skip: process.env.ANS_STATUS_POINTER_CHECK !== "1" }, async () => {
  const checkTag = process.env.ANS_STATUS_POINTER_CHECK_TAG; assert.ok(checkTag && /^q[1-9]\d{0,5}-status-check-\d{2}$/.test(checkTag));
  const bytes = await fs.readFile(path.join(evidence, "q86-first-quality-rejection-projection.json"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "2748bf94164a0ca60880085c1dc6751f9918316624b30810f7ffbff0120d3647");
  const actual = JSON.parse(bytes.toString("utf8")), original = await fs.readFile(path.join(actual.root, actual.actualQuality.path));
  assert.equal(createHash("sha256").update(original).digest("hex"), actual.actualQuality.sha256);
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(original.toString("utf8")); assert.ok(fm?.[1]);
  const meta: unknown = parseYaml(fm[1]); assert.ok(meta && typeof meta === "object" && !Array.isArray(meta));
  assert.throws(() => assertQualityDocumentVersion(actual.actualQuality.path, meta), /document version/);
  const cases = [1, 2, 3].map(version => {
    const qualityPath = `docs/quality/q2-new-report-v${version}.md`, control = { ...meta, version: qualityDocumentVersion(qualityPath) };
    assertQualityDocumentVersion(qualityPath, control); assert.equal(evidenceField(control, "schema"), "git-quality-report/v1");
    for (const field of ["taskId", "runId", "flowId", "candidateOperationId", "candidate", "criteria", "checks"]) assert.deepEqual(evidenceField(control, field), evidenceField(meta, field));
    for (const wrong of [0, version === 1 ? 2 : 1, undefined]) assert.throws(() => assertQualityDocumentVersion(qualityPath, { ...control, version: wrong }));
    assert.throws(() => assertQualityDocumentVersion(qualityPath, { ...control, schema: `git-quality-report/v${version + 1}` }));
    return { qualityPath, version: evidenceField(control, "version"), schema: evidenceField(control, "schema") };
  });
  const deliveredCheckpointBytes = await fs.readFile(path.join(evidence, "q87-business-delivery-checkpoint.json"));
  assert.equal(createHash("sha256").update(deliveredCheckpointBytes).digest("hex"), "e720f9620608a59434dc1a5deb80693c7e8ce2e98b5936627f2b1628a87d16cf");
  const deliveredCheckpoint = JSON.parse(deliveredCheckpointBytes.toString("utf8"));
  const sourceArtifact = deliveredCheckpoint.artifacts.find((row: { file: string }) => row.file === "q87-edit-actual-maintenance-delivery.json"); assert.ok(sourceArtifact);
  const sourceBytes = await fs.readFile(path.join(evidence, sourceArtifact.file)); assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), sourceArtifact.sha256.toLowerCase());
  const deliveredProof = JSON.parse(sourceBytes.toString("utf8")), published: unknown = deliveredProof.extra.published; assert.ok(isGitCapabilityResult(published));
  assert.equal(published.status, "published"); assert.ok(published.published && isGitOid(published.published.oid)); const sourceWorker = published.parents?.[1]; assert.ok(isGitOid(sourceWorker));
  const actualPublishedOid = published.published.oid;
  const flowMatch = /^refs\/ans\/delivery\/([A-Za-z0-9_-]+)$/.exec(published.published.ref); assert.ok(flowMatch?.[1]);
  const actualPacket = `DELIVERED|f=${flowMatch[1]}|o=${published.operationId}|c=${actualPublishedOid.objectFormat}:${actualPublishedOid.hex}|w=${sourceWorker.objectFormat}:${sourceWorker.hex}|END`;
  const parsedSource = visibleDeliveredTextSource(actualPacket); assert.deepEqual(parsedSource.candidate, published.published.oid); assert.deepEqual(parsedSource.worker, sourceWorker);
  assert.ok(actualPacket.length <= 200); assert.throws(() => visibleDeliveredTextSource(actualPacket.slice(0, -4))); assert.throws(() => visibleDeliveredTextSource(actualPacket + actualPacket));
  assert.throws(() => visibleDeliveredTextSource(actualPacket.replace(`|w=${sourceWorker.objectFormat}:${sourceWorker.hex}`, `|w=${actualPublishedOid.objectFormat}:${actualPublishedOid.hex}`)));
  const packetBoundaries = ["sha1", "sha256"].map(objectFormat => {
    const size = objectFormat === "sha1" ? 40 : 64, candidate: unknown = { objectFormat, hex: "a".repeat(size) }, worker: unknown = { objectFormat, hex: "b".repeat(size) };
    assert.ok(isGitOid(candidate) && isGitOid(worker));
    const packet = `DELIVERED|f=q2-new|o=q999999-revert-publish|c=${candidate.objectFormat}:${candidate.hex}|w=${worker.objectFormat}:${worker.hex}|END`, customerSummary = `已交付；${packet}`;
    assert.ok(customerSummary.length <= 200); assert.deepEqual(visibleDeliveredTextSource(customerSummary).worker, worker);
    return { objectFormat, actualSummaryLimit: 200, packetLength: packet.length, customerSummaryLength: customerSummary.length };
  });
  const actualLogControl = `${actualPublishedOid.hex}\0${published.parents?.map(parent => parent.hex).join(" ")}\0Actual public log-format protocol control\n`;
  assert.deepEqual(visiblePublishedWorkerFromLog(actualLogControl, actualPublishedOid), sourceWorker);
  for (const bad of [actualLogControl + actualLogControl, actualLogControl.replace(actualPublishedOid.hex, "0".repeat(actualPublishedOid.hex.length)), actualLogControl.replace("\0", " "),
    `${actualPublishedOid.hex}\0${sourceWorker.hex}\0One-parent control\n`]) assert.throws(() => visiblePublishedWorkerFromLog(bad, actualPublishedOid));
  const supportControl = { path: "docs/product/q2-new-revert-support-v1.md", sha256: "c".repeat(64) }, supportPacket = `SUPPORT_RECORD|${JSON.stringify(supportControl)}|END`;
  assert.deepEqual(visibleProductSupportRecord(supportPacket, supportControl.path), supportControl);
  for (const bad of [supportPacket.slice(0, -4), supportPacket + supportPacket, supportPacket.replace(supportControl.sha256, "invalid"), supportPacket.replace("docs/product/", "src/impl/")]) assert.throws(() => visibleProductSupportRecord(bad, supportControl.path));
  const revertPacketBoundaries = ["sha1", "sha256"].map(format => {
    const packet = `RV|o=q999999-revert-candidate|c=${format}:${"a".repeat(format === "sha1" ? 40 : 64)}|f=q2-new|r=run-hub-${"b".repeat(48)}|END`;
    assert.ok(shortenSummary(packet, 200) === packet && packet.length <= 200); return { format, length: packet.length };
  });
  const controlledTailPath = path.join(evidence, `${checkTag}-bounded-tail-control.jsonl`), tail = createFixtureTailRecorder(controlledTailPath, { entries: 2, bytes: 4096 });
  const privateBody = "DO_NOT_PERSIST_CONTROLLED_MODEL_FILE_CONTENT", privateKey = "DO_NOT_PERSIST_CONTROLLED_SECRET";
  const toolFact = fixtureTailToolFact({ id: "controlled-write", type: "function", function: { name: "ans_write_file", arguments: JSON.stringify({ path: "docs/product/control.md", content: privateBody, apiKey: privateKey }) } });
  tail("controlled-tool-metadata", toolFact); tail("controlled-identifier", { roleId: "convener", taskId: "controlled-task-not-business", turnId: "controlled-turn" });
  assert.throws(() => tail("controlled-overflow", {}), /QA_TAIL_DIAGNOSTIC_BOUND_EXCEEDED/);
  const boundedText = await fs.readFile(controlledTailPath, "utf8"); assert.equal(boundedText.trimEnd().split("\n").length, 2); assert.ok(Buffer.byteLength(boundedText) <= 4096);
  assert.ok(!boundedText.includes(privateBody) && !boundedText.includes(privateKey)); assert.equal(toolFact.identifiers.path, "docs/product/control.md");
  const byteBound = createFixtureTailRecorder(path.join(evidence, `${checkTag}-bounded-tail-byte-control.jsonl`), { entries: 2, bytes: 32 });
  assert.throws(() => byteBound("controlled-bound", {}), /QA_TAIL_DIAGNOSTIC_BOUND_EXCEEDED/);
  const phaseStartedAt = 1000000, phaseDeadline = phaseStartedAt + 180000, afterObservedPrefix = phaseStartedAt + 89000;
  assert.equal(fixtureWaitBudgetMs(90000, phaseDeadline, afterObservedPrefix, true), 91000, "MOD main wait uses only the already-declared phase remainder");
  assert.equal(fixtureWaitBudgetMs(90000, Math.min(phaseDeadline, phaseStartedAt + 120000), afterObservedPrefix, true), 31000, "Shared absolute bound only tightens MOD wait");
  assert.equal(fixtureWaitBudgetMs(90000, phaseDeadline, afterObservedPrefix), 90000, "HTTP/tool defaults stay at the original 90s bound");
  assert.equal(fixtureWaitBudgetMs(90000, phaseDeadline, phaseDeadline + 1, true), -1, "Expired phase cannot start a fresh wait");
  for (const bad of ["docs/quality/q2-new-report-v0.md", "../q2-new-report-v2.md", "docs/quality/q2-new-report-v2.md/extra"]) assert.throws(() => qualityDocumentVersion(bad));
  assert.deepEqual(await fs.readFile(path.join(actual.root, actual.actualQuality.path)), original, "Actual Q86 quality document must remain unchanged");
  await fs.writeFile(path.join(evidence, `${checkTag}-quality-version-protocol.json`), JSON.stringify({ at: new Date().toISOString(), actualSource: "Q86 immutable MD/Task/reviewBasis projection", actualBadVersionRejected: true,
    cases, boundedLastFactsProtocol: { entryAndByteBounds: true, controlledPromptAndSecretBodiesAbsent: true, noRuntimeOrWorkflowStateCreated: true }, revertMaterialProtocol: { actualLogControlSource: "Actual Q87 public publish CID/parents rendered only as a log-format parser control, not a fresh query receipt", revertPacketBoundaries, malformedLogOrSupportRejected: true }, deliveredSourcePacketProtocol: { actualPublishedSource: parsedSource, packetBoundaries, truncatedDuplicateOrFinalCidAsWorkerRejected: true, source: "Actual Q87 public publish receipt; format boundary controls are not real commits or business handbacks" }, unchangedTaskRunCandidateCriteriaAndChecks: true, oldRootBytesUnchanged: true, modificationMainWaitClippedToExistingPhaseOnly: true, originalHttpToolWaitUnchanged: true, noBusinessOrAuthorityState: true, scope: "Pure report-version protocol; no quality acceptance, publication or future v3 task invented" }, null, 2), { flag: "wx" });
});

test("Q18 minimal Desktop lifecycle runner diagnostic", { timeout: 30000 }, async () => {
  await runDesktopLifecycleProbe(path.join(evidence, "q18-desktop-runner-probe.json"));
});
test("Q22 minimal real denied write blocked report cleanup", { timeout: 30000 }, async () => {
  await runDesktopLifecycleProbe(path.join(evidence, "q22-blocked-desktop-probe.json"), "denied-write-blocked");
});
test("Q22 explicit outer failure after real blocked cleanup", { timeout: 30000, skip: process.env.ANS_Q22_ASSERTION_CONTROL !== "1" }, async () => {
  await runDesktopLifecycleProbe(path.join(evidence, "q22-blocked-outer-failure-probe.json"), "denied-write-blocked");
  assert.fail("Q22_DIAGNOSTIC_OUTER_FAILURE_AFTER_REAL_BLOCKED_CLEANUP");
});

function originalCreatorClose(body: Parameters<typeof actualToolReply>[0], operationId: string) {
  const text = String(body.messages.findLast(message => message.role === "user")?.content ?? "");
  const json = text.match(/\[应用绑定的原创建者收口依据\]\s*\n(\{[^\n]+\})/)?.[1];
  assert.ok(json, `Q2_FIRST_CLOSE_BASIS_MISSING ${text.slice(-1600)}`);
  const basis = JSON.parse(json) as Record<string, unknown>;
  for (const key of ["taskId", "runId", "basisDigest"]) assert.equal(typeof basis[key], "string", `Actual close basis ${key}`);
  assert.ok(basis.reportRef && typeof basis.reportRef === "object");
  return { operationId, taskId: basis.taskId, runId: basis.runId, basisDigest: basis.basisDigest, reportRef: basis.reportRef, outcome: "accepted" };
}
async function observeActualChiefWorkflow(body: ChatRequest) {
  const resource = new URL("../../src/common/门禁引擎/workflows/chief/chief-workflow.md", import.meta.url);
  const bytes = await fs.readFile(resource), text = bytes.toString("utf8"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const system = body.messages.filter(message => message.role === "system").map(message => String(message.content ?? "")).join("\n");
  const match = /## 应用内置 Chief workflow（非授权流程指导）\n(\{[^\n]+\})\n\n/.exec(system); assert.ok(match, "ACTUAL_CHIEF_WORKFLOW_CONTEXT_MISSING");
  const metadata: unknown = JSON.parse(match[1]!); assert.equal(evidenceField(metadata, "sourceUrl"), resource.href);
  assert.equal(evidenceField(metadata, "moduleUrl"), new URL("../../src/provider/runtime/tools.ts", import.meta.url).href);
  assert.equal(evidenceField(metadata, "sha256"), sha256); assert.equal(evidenceField(metadata, "bytes"), bytes.length);
  const version = /^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/m.exec(text)?.[1]; assert.ok(version); assert.equal(evidenceField(metadata, "resourceVersion"), version);
  const app: unknown = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8")); assert.equal(evidenceField(metadata, "applicationVersion"), evidenceField(app, "version"));
  assert.equal(system.split(text).length - 1, 1, "Chief receives the actual full application resource exactly once, not just its filename");
  return { observedAt: new Date().toISOString(), metadata, resourcePath: fileURLToPath(resource), sha256, bytes: bytes.length, fullText: text, actualSystem: system, source: "actual default CodexChat HTTP system; test reads expected source only for comparison, never injects it" };
}


/** Shared inference receiver only: real default runtime/tools and actual assigned run remain authoritative. */
function createAssignedWorkerReceivers(options: {
  driver: () => Awaited<ReturnType<typeof createRealHttpDriver>>; workerRoleId: string; workerTaskKey: string; flowId: string;
  output: { path: string; content: string }; ids: { write: string; basis: string; candidate: string; gapReport: string; report: string };
  caseTag: string; progress: { stage: string; reply: string }[]; onCandidateReceipt: (result: GitCapabilityResult) => void;
}): HttpScripts[string] {
  let documentTrunkBeforeCandidate: GitOid | null | undefined;
  return [
    async body => {
      const observation = await options.driver().observe(), live = observation.inventory.sessions.find(session => session.phase === "live" && session.roleId === options.workerRoleId);
      const names = body.tools?.map(tool => tool.function?.name) ?? [];
      options.progress.push({ stage: "worker-runtime", reply: JSON.stringify({ names, actualHostSurface: live?.toolSurface }) });
      const raw = names.filter(name => /^(ans_)?(run_shell|exec_command|run_script|start_background_command|start_background_process|spawn_process|background)$/.test(name ?? ""));
      // W5（P1.4 §4.5 / AC-1–AC-7）：旧 strict-surface 契约已删除——worker 按真实 ACL/任务绑定直接调用
      // 结构化工具（write_file/git_query/git_candidate）；native/toolSurface/strict 事实仅作为证据记录，
      // 不再据此决定是否 emit 工具调用（其它会话的 native/processCoverage 不再是动作前提）。
      options.progress.push({ stage: "worker-surface-evidence", reply: JSON.stringify({ raw, actualHostSurface: live?.toolSurface ?? null }) });
      const task = observation.tasks.find(task => task.created?.idempotencyKey === options.workerTaskKey);
      assert.equal(task?.created?.runState, "pinned", "Q14_WORKER_ACTUAL_RUN_NOT_PINNED");
      return modelCalls(gitTool(options.ids.write, "write_file", { path: options.output.path, content: options.output.content }));
    },
    body => { const reply = actualToolReply(body, options.ids.write); options.progress.push({ stage: "worker-write", reply }); assert.match(reply, /已获准并落盘/);
      return modelCalls(gitTool(options.ids.basis, "git_query", { operationId: options.ids.basis, template: "log", limit: 1 })); },
    async body => {
      const reply = actualToolReply(body, options.ids.basis), result: unknown = JSON.parse(reply.slice(reply.indexOf("{")));
      assert.ok(isGitCapabilityResult(result));
      options.progress.push({ stage: "worker-basis-query", reply });
      const basis = result.basis, source = result.basisSource;
      if (result.status !== "observed" || !isGitBasis(basis) || !basis.oid || source?.kind !== "assigned-run") {
        options.progress.push({ stage: "worker-candidate-source-gap", reply: JSON.stringify({ actualResult: result,
          missing: "The actual query/prompt does not expose a ref-bound code/run GitBasis. log OID is not proved refs/ans/trunk basis; candidate call must not invent one.",
          classification: "observed API information gap, not a fabricated production rejection code" }) });
        await options.driver().save(path.join(evidence, `${options.caseTag}-worker-candidate-first-gap.json`), { roleProgress: options.progress });
        return modelCalls(gitTool(options.ids.gapReport, "submit_report", { status: "blocked",
          summary: "实际文件已写入；git_query回执未提供ref绑定代码基线，不能据log最新OID伪造candidate base；需生产暴露真实run/code basis。", evidence: [options.output.path, `Git query ${result.operationId}: ${result.status}`] }));
      }
      const observation = await options.driver().observe(), child = observation.tasks.find(task => task.created?.idempotencyKey === options.workerTaskKey);
      assert.ok(child?.created?.runId); assert.equal(child.created.to, options.workerRoleId); assert.equal(child.created.flowId, options.flowId);
      const run = await createProjectTrunkStore(options.driver().root).readRunRecord!(child.created.runId); assert.ok(run.ok);
      assert.equal(source.runId, child.created.runId); assert.equal(source.pinDigest, run.value.value.pinDigest);
      assert.equal(source.runRecordSha256, run.value.sha256); assert.deepEqual(basis, run.value.value.codeBasis);
      documentTrunkBeforeCandidate = await createGitCandidateStore(options.driver().root).readRef("refs/ans/trunk"); assert.ok(isGitOid(documentTrunkBeforeCandidate));
      options.progress.push({ stage: "worker-assigned-run-code-basis", reply: JSON.stringify({ actualToolResult: result, child, run }) });
      return modelCalls(gitTool(options.ids.candidate, "git_candidate", { operationId: options.ids.candidate, action: "commit", base: basis,
        paths: [options.output.path], message: "Actual scoped worker output for independent verification" }));
    },
    async body => {
      const candidateMessage = body.messages.findLast(message => message.role === "tool" && message.tool_call_id === options.ids.candidate);
      if (!candidateMessage) { actualToolReply(body, options.ids.gapReport); options.progress.push({ stage: "worker-bounded-stop", reply: "actual blocked report submitted; no candidate/basis fabricated" });
        return modelDone("真实代码基线接口缺口已正式报告，保持阻塞；未声称候选、验收或交付。" ); }
      const reply = actualToolReply(body, options.ids.candidate), result: unknown = JSON.parse(reply.slice(reply.indexOf("{")));
      assert.ok(isGitCapabilityResult(result)); options.progress.push({ stage: "worker-candidate-result", reply });
      options.onCandidateReceipt(result);
      if (result.status === "prepared") {
        assert.ok(isGitOid(result.candidate)); assert.ok(isGitOid(result.tree)); assert.ok(result.parents?.length); assert.ok(result.journalId);
        const git = createGitCandidateStore(options.driver().root), commit = await git.readCommit(result.candidate), blob = await git.readBlob(result.candidate, options.output.path);
        assert.deepEqual(commit.tree, result.tree); assert.deepEqual(commit.parents, result.parents);
        assert.equal(Buffer.from(blob.bytesBase64, "base64").toString("utf8"), options.output.content);
        const journal = await createGitRefStore(options.driver().root).readJournal(result.operationId); assert.ok(journal); assert.equal(journal.phase, "published");
        const query = options.driver().trace.findLast(turn => turn.role === options.workerRoleId && turn.request.messages.some(message => message.tool_call_id === options.ids.basis)); assert.ok(query);
        const actualQuery: unknown = JSON.parse(actualToolReply(query.request, options.ids.basis).slice(actualToolReply(query.request, options.ids.basis).indexOf("{")));
        assert.ok(isGitCapabilityResult(actualQuery)); assert.ok(isGitBasis(actualQuery.basis) && actualQuery.basis.oid);
        assert.deepEqual(await git.readRef(actualQuery.basis.ref), actualQuery.basis.oid);
        assert.ok(isGitOid(documentTrunkBeforeCandidate)); assert.deepEqual(await git.readRef("refs/ans/trunk"), documentTrunkBeforeCandidate);
        await options.driver().save(path.join(evidence, `${options.caseTag}-first-physical-worker-candidate.json`), { actualResult: result, actualQuery, commit, blob, journal, documentTrunkBeforeCandidate, roleProgress: options.progress });
        process.stdout.write(`Q_WORKER_CANDIDATE_PREPARED ${JSON.stringify({ at: new Date().toISOString(), candidate: result.candidate, tree: result.tree, journalId: result.journalId })}\n`);
      }
      await options.driver().save(path.join(evidence, `${options.caseTag}-worker-candidate-result.json`), { roleProgress: options.progress });
      return modelCalls(gitTool(options.ids.report, "submit_report", { status: result.status === "prepared" ? "completed" : "blocked",
        summary: `Q23真实worker候选 ${result.status} operation ${result.operationId} code ${result.code ?? "none"}；未独立质检或交付。`,
        evidence: [options.output.path, `Git operation ${result.operationId}`,
          ...(result.candidate ? [`Git candidate ${result.candidate.objectFormat}:${result.candidate.hex}`] : []),
          ...(result.tree ? [`Git tree ${result.tree.objectFormat}:${result.tree.hex}`] : []),
          ...(result.parents ?? []).map(parent => `Git parent ${parent.objectFormat}:${parent.hex}`), ...(result.journalId ? [`Git journal ${result.journalId}`] : [])] }));
    },
    body => { actualToolReply(body, options.ids.report); options.progress.push({ stage: "worker-bounded-stop", reply: "actual candidate result formally reported; downstream receiver required" });
      return modelDone("真实候选结果已报告；等待原创建者消费、独立验证与合法交付。" ); },
  ];
}

/** Reads application-issued ordinary review data from this verifier's actual HTTP context, never a sibling closure. */
function actualAssignedReviewBasis(body: ChatRequest): TaskReviewBasisRef {
  const found = body.messages.filter(message => message.role === "system" && typeof message.content === "string")
    .flatMap(message => typeof message.content === "string" ? [...message.content.matchAll(/(?:^|\n)Read-only final candidate review\n([^\n]+)\nFrozen completion requirements /g)] : []);
  assert.equal(found.length, 1, "ACTUAL_ASSIGNED_REVIEW_CONTEXT_UNAVAILABLE_OR_AMBIGUOUS");
  const line = found[0]?.[1]; assert.equal(typeof line, "string"); assert.ok(line);
  const value: unknown = JSON.parse(line); assert.ok(isTaskReviewBasisRef(value)); return value;
}

/** Inference-only revert receiver; explicit target is visible in the actual assigned task, base comes from the real query. */
function createAssignedRevertReceivers(options: {
  driver: () => Awaited<ReturnType<typeof createRealHttpDriver>>; taskKey: string; caseTag: string;
  ids: { basis: string; candidate: string; postBasis: string; report: string }; onResult: (result: GitCapabilityResult) => void;
  onBase?: (basis: NonNullable<GitCapabilityResult["basis"]>) => void;
}): HttpScripts[string] {
  let target: GitOid | undefined, mainline: number | undefined, priorDocument: GitOid | null | undefined, priorDelivery: GitOid | null | undefined;
  let result: GitCapabilityResult | undefined, actualAssignedRun: VisibleHubController | undefined;
  const formalReport = () => { assert.ok(result); return modelCalls(gitTool(options.ids.report, "submit_report", { status: "blocked",
    summary: result.status === "prepared" ? (() => { assert.ok(actualAssignedRun && isGitOid(result.candidate));
      const summary = `RV|o=${result.operationId}|c=${result.candidate.objectFormat}:${result.candidate.hex}|f=${actualAssignedRun.flowId}|r=${actualAssignedRun.runId}|END`;
      assert.ok(summary.length <= 200); return summary; })()
      : `REVERT_BLOCKED|op=${result.operationId}|code=${result.code ?? "unavailable"}|END`,
    evidence: [`Git operation ${result.operationId}`, ...(result.candidate ? [`Git candidate ${result.candidate.objectFormat}:${result.candidate.hex}`] : [])] })); };
  return [async body => {
    const matches = [...actualUserInput(body).matchAll(/REVERT_TARGET\|([^\r\n]+?)\|END/g)]; assert.equal(matches.length, 1, "VISIBLE_EXPLICIT_REVERT_TARGET_INFORMATION_GAP");
    const packet = matches[0]?.[1]; assert.ok(packet); const parsed: unknown = JSON.parse(packet);
    const commit = evidenceField(parsed, "commit"), selectedParent = evidenceField(parsed, "mainline"); assert.ok(isGitOid(commit)); target = commit;
    if (selectedParent !== undefined) { assert.ok(typeof selectedParent === "number" && Number.isSafeInteger(selectedParent) && selectedParent >= 1); mainline = selectedParent; }
    const driver = options.driver(), facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.taskKey);
    assert.ok(task?.created && task.created.runId); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "convener"); assert.equal(task.closed, undefined);
    const actualRun = await createProjectTrunkStore(driver.root).readRunRecord!(task.created.runId); assert.ok(actualRun.ok);
    assert.ok(actualRun.value.value.state === "draft" || actualRun.value.value.state === "pinned"); assert.ok(actualUserInput(body).includes(task.taskId));
    assert.ok(body.tools?.some(tool => tool.function?.name === "ans_git_candidate"));
    const git = createGitCandidateStore(driver.root); priorDocument = await git.readRef("refs/ans/trunk"); priorDelivery = await git.readRef(`refs/ans/delivery/${task.created.flowId}`);
    assert.ok(isGitOid(priorDocument) && isGitOid(priorDelivery));
    return modelCalls(gitTool(options.ids.basis, "git_query", { operationId: options.ids.basis, template: "log", limit: 1 }));
  }, async body => {
    const raw = actualToolReply(body, options.ids.basis), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value));
    assert.equal(value.status, "observed", raw); assert.ok(isGitBasis(value.basis) && value.basis.oid);
    const facts = await options.driver().observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.taskKey); assert.ok(task?.created?.runId);
    const run = await createProjectTrunkStore(options.driver().root).readRunRecord!(task.created.runId); assert.ok(run.ok);
    if (run.value.value.state === "draft") {
      assert.equal(value.basisSource, undefined, "Prospective codeBasis is ordinary expected data, not an assigned-run pin ticket");
      assert.equal(value.basis.ref, `refs/ans/delivery/${task.created.flowId}`); assert.deepEqual(value.basis.oid, priorDelivery);
    } else {
      assert.equal(run.value.value.state, "pinned"); assert.ok(value.basisSource?.kind === "assigned-run");
      assert.equal(value.basisSource.runId, task.created.runId); assert.equal(value.basisSource.pinDigest, run.value.value.pinDigest);
      assert.equal(value.basisSource.runRecordSha256, run.value.sha256); assert.deepEqual(value.basis, run.value.value.codeBasis);
    }
    options.onBase?.(value.basis);
    await options.driver().save(path.join(evidence, `${options.caseTag}-actual-pre-revert-query.json`), { actualQuery: value, actualTask: task, actualRun: run }); assert.ok(target);
    return modelCalls(gitTool(options.ids.candidate, "git_candidate", { operationId: options.ids.candidate, action: "revert", base: value.basis,
      commit: target, ...(mainline === undefined ? {} : { mainline }), message: "Revert the explicitly assigned later text change; retain the frozen required output" }));
  }, async body => {
    const raw = actualToolReply(body, options.ids.candidate), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value)); result = value; options.onResult(value);
    const driver = options.driver(), facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.taskKey); assert.ok(task?.created?.flowId);
    const git = createGitCandidateStore(driver.root); assert.deepEqual(await git.readRef("refs/ans/trunk"), priorDocument); assert.deepEqual(await git.readRef(`refs/ans/delivery/${task.created.flowId}`), priorDelivery);
    if (value.status === "prepared") {
      assert.ok(value.candidate && value.tree && value.journalId && value.parents?.length);
      const commit = await git.readCommit(value.candidate), blob = await git.readBlob(value.candidate, "src/impl/result.txt");
      const bytes = Buffer.from(blob.bytesBase64, "base64"), text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); assert.ok(text.trim().length, "Revert must retain the frozen required nonempty result, never fake a quality pass for its deletion");
      assert.deepEqual(commit.tree, value.tree); assert.deepEqual(commit.parents, value.parents);
      const journal = await createGitRefStore(driver.root).readJournal(value.operationId); assert.ok(journal); assert.equal(journal.phase, "published");
      await driver.save(path.join(evidence, `${options.caseTag}-actual-revert-candidate.json`), { actualTask: task, actualReceipt: value, commit, blob, journal, priorDocument, priorDelivery });
    } else await driver.save(path.join(evidence, `${options.caseTag}-actual-revert-gap.json`), { actualTask: task, actualReceipt: value });
    if (value.status === "prepared") return modelCalls(gitTool(options.ids.postBasis, "git_query", { operationId: options.ids.postBasis, template: "log", limit: 1 }));
    return formalReport();
  }, async body => {
    assert.ok(result);
    if (result.status !== "prepared") { actualToolReply(body, options.ids.report); return modelDone("真实revert拒绝已正式回Chief，未伪造pin或候选。"); }
    const raw = actualToolReply(body, options.ids.postBasis), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value));
    assert.equal(value.status, "observed", raw); assert.ok(value.basisSource?.kind === "assigned-run" && isGitBasis(value.basis));
    const driver = options.driver(), facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.taskKey); assert.ok(task?.created?.runId);
    const run = await createProjectTrunkStore(driver.root).readRunRecord!(task.created.runId); assert.ok(run.ok); assert.equal(run.value.value.state, "pinned");
    assert.equal(value.basisSource.runId, task.created.runId); assert.equal(value.basisSource.pinDigest, run.value.value.pinDigest);
    assert.equal(value.basisSource.runRecordSha256, run.value.sha256); assert.deepEqual(value.basis, run.value.value.codeBasis);
    const journal = await createGitRefStore(driver.root).readJournal(result.operationId); assert.ok(journal && journal.phase === "published" && journal.candidateSource?.kind === "run-revert");
    assert.equal(journal.candidateSource.taskId, task.taskId); assert.equal(journal.candidateSource.runId, task.created.runId);
    assert.equal(journal.candidateSource.pinDigest, run.value.value.pinDigest);
    assert.equal(typeof task.created.flowId, "string"); assert.ok(task.created.flowId);
    actualAssignedRun = { taskId: task.taskId, flowId: task.created.flowId, runId: value.basisSource.runId };
    await driver.save(path.join(evidence, `${options.caseTag}-actual-post-revert-pin.json`), { actualQuery: value, actualTask: task, actualRun: run, journal });
    return formalReport();
  }, body => { actualToolReply(body, options.ids.report); assert.ok(result); return modelDone("实际revert结果已正式回Chief；候选不是质量接受或交付，不自行批准/发布/关闭控制任务。"); }];
}

/** A real final-CID review can formally block on an explicitly requested, actually missing supporting record. */
function createAssignedReviewFailureReceivers(options: {
  driver: () => Awaited<ReturnType<typeof createRealHttpDriver>>; taskKey: string; caseTag: string; missingPath: string;
  ids: { criterion: string; artifact: string; support: string; report: string };
}): HttpScripts[string] {
  let basis: TaskReviewBasisRef | undefined, criterion: string | undefined, artifact: string | undefined;
  return [async body => {
    basis = actualAssignedReviewBasis(body); assert.equal(basis.criteria.length, 1);
    assert.ok(actualUserInput(body).includes(options.missingPath), "Supporting record must be part of the actual assigned task, not a hidden harness requirement");
    const facts = await options.driver().observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.taskKey);
    assert.ok(task?.created); assert.equal(task.created.to, "verifier"); assert.equal(task.created.from, "chief"); assert.equal(task.closed, undefined);
    assert.deepEqual(task.created.reviewBasisRef, basis); assert.ok(isTaskReviewControllerRef(task.created.reviewControllerRef)); assert.ok(actualUserInput(body).includes(task.taskId));
    const ref = basis.criteria[0]; assert.ok(ref);
    return modelCalls(gitTool(options.ids.criterion, "git_query", { operationId: options.ids.criterion, template: "show", target: ref.oid, paths: [ref.path] }));
  }, body => {
    const raw = actualToolReply(body, options.ids.criterion), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value)); assert.ok(basis);
    assert.equal(value.status, "observed", raw); assert.notEqual(value.truncated, true); assert.equal(typeof value.output, "string"); assert.ok(value.output);
    assert.equal(createHash("sha256").update(value.output).digest("hex"), basis.criteria[0]?.sha256); criterion = value.output;
    const requirements = criterion.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).join(" ");
    assert.equal(requirements, "Produce src/impl/result.txt, preserve evidence and use creator closure.");
    return modelCalls(gitTool(options.ids.artifact, "git_query", { operationId: options.ids.artifact, template: "show", target: basis.candidate, paths: ["src/impl/result.txt"] }));
  }, body => {
    const raw = actualToolReply(body, options.ids.artifact), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value)); assert.ok(basis);
    assert.equal(value.status, "observed", raw); assert.notEqual(value.truncated, true); assert.equal(typeof value.output, "string"); assert.ok(value.output?.trim()); artifact = value.output;
    return modelCalls(gitTool(options.ids.support, "read_file", { path: options.missingPath }));
  }, async body => {
    const reply = actualToolReply(body, options.ids.support); assert.equal(reply.startsWith(`read_file: ${options.missingPath}\n\n`), false);
    assert.match(reply, /ENOENT|不存在|no such|未找到|读取失败|失败|missing/i);
    assert.equal(await fs.stat(path.join(options.driver().root, options.missingPath)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
    assert.ok(basis && criterion && artifact); await options.driver().save(path.join(evidence, `${options.caseTag}-actual-review-missing-support.json`), { actualRequest: body, basis, criterion, artifact, actualMissingReply: reply });
    return modelCalls(gitTool(options.ids.report, "submit_report", { status: "blocked", summary: `REVIEW_SUPPORT_UNAVAILABLE|op=${basis.candidateOperationId}|path=${options.missingPath}|END`, evidence: [] }));
  }, body => { actualToolReply(body, options.ids.report); return modelDone("真实最终CID与冻结标准可读，但本任务明确要求的支持记录缺失，正式blocked回Chief；未写passed票、未自批质量或发布。"); }];
}

function createChiefReviewReworkReceivers(options: {
  driver: () => Awaited<ReturnType<typeof createRealHttpDriver>>; reviewTaskKey: string; closeId: string; caseTag: string; missingPath: string;
  onStopped: () => void;
}): HttpScripts[string] {
  return [async body => {
    const facts = await options.driver().observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.reviewTaskKey), report = task?.reports.at(-1);
    assert.ok(task?.created && report && task.created.reviewBasisRef); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "verifier"); assert.equal(task.closed, undefined);
    assert.equal(report.status, "blocked"); assert.equal(report.summary, `REVIEW_SUPPORT_UNAVAILABLE|op=${task.created.reviewBasisRef.candidateOperationId}|path=${options.missingPath}|END`);
    assert.ok(actualUserInput(body).includes(task.taskId) && actualUserInput(body).includes(report.summary));
    return modelCalls(gitTool(options.closeId, "close_created_task", { ...originalCreatorClose(body, options.closeId), outcome: "rework" }));
  }, async body => {
    const reply = actualToolReply(body, options.closeId), facts = await options.driver().observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === options.reviewTaskKey);
    assert.ok(task?.closed); assert.equal(task.closed.outcome, "rework", reply); assert.equal(task.closed.by, "chief"); assert.equal(task.reports.at(-1)?.status, "blocked");
    await options.driver().save(path.join(evidence, `${options.caseTag}-chief-actual-review-rework.json`), { actualTask: task, actualCloseReply: reply }); options.onStopped();
    return modelDone(`实际Verifier因${options.missingPath}缺失正式blocked；Chief已退修该审查任务，候选未获质量接受/未交付。请补充支持记录后重新决定真实审查，不借退修授发布权。`);
  }];
}

function qualityDocumentVersion(qualityPath: string): number {
  const match = /^docs\/quality\/[A-Za-z0-9_-]+-report-v([1-9]\d*)\.md$/.exec(qualityPath); assert.ok(match?.[1], "Canonical quality report path required");
  const version = Number(match[1]); assert.ok(Number.isSafeInteger(version) && version > 0); return version;
}
function assertQualityDocumentVersion(qualityPath: string, metadata: unknown) {
  assert.equal(evidenceField(metadata, "schema"), "git-quality-report/v1");
  assert.equal(evidenceField(metadata, "version"), qualityDocumentVersion(qualityPath), "Quality report document version must match its actual canonical filename");
}

function governanceStatusPointer(flowId: string, qualityPath: string) {
  return `[系统·治理反馈] 来自 质检 的验收状态（只含状态与报告指针；不转述报告正文）：\n状态：本轮已完成（流程 ${flowId}）\n报告路径：${qualityPath}\n治理记录：docs/governance/verifier/${flowId}.md\n请只向客户说明验收复核已结束与报告位置；不要转述报告内容，不要编辑/代批/改判验收结论，也不要把报告当作客户批准。验收卡与客户决定仍由应用/客户处理。`;
}
type StatusPointerFacts = {
  notice: string; qualityPath: string; qualityBytes: Buffer; qualitySha256: string; task: TaskRecord; currentTask: TaskRecord;
  currentTarget: { operationId: string; candidate: GitOid };
  reportRef?: SnapshotArtifactRef; reportSnapshotBytes?: Buffer; snapshotQualitySha256?: string;
};
function validatePersistedStatusPointer(facts: StatusPointerFacts) {
  const { task, currentTask } = facts; assert.ok(task.created && currentTask.created);
  const basis = task.created.reviewBasisRef, currentBasis = currentTask.created.reviewBasisRef;
  assert.ok(isTaskReviewBasisRef(basis) && isTaskReviewBasisRef(currentBasis));
  assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "verifier"); assert.equal(currentTask.created.to, "verifier"); assert.equal(task.created.flowId, currentTask.created.flowId);
  assert.equal(currentBasis.candidateOperationId, facts.currentTarget.operationId); assert.deepEqual(currentBasis.candidate, facts.currentTarget.candidate);
  const flowId = task.created.flowId; assert.ok(flowId && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(flowId));
  assert.match(facts.qualityPath, /^docs\/quality\/[a-z0-9-]+-report-v[1-9]\d*\.md$/); assert.ok(facts.qualityPath.startsWith(`docs/quality/${flowId}-report-v`));
  assert.equal(facts.notice, governanceStatusPointer(flowId, facts.qualityPath));
  assert.equal(createHash("sha256").update(facts.qualityBytes).digest("hex"), facts.qualitySha256);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(facts.qualityBytes), fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text); assert.ok(fm?.[1]);
  const meta: unknown = parseYaml(fm[1]); assertQualityDocumentVersion(facts.qualityPath, meta);
  assert.equal(evidenceField(meta, "taskId"), task.taskId); assert.equal(evidenceField(meta, "flowId"), flowId); assert.equal(evidenceField(meta, "runId"), task.created.runId);
  assert.equal(evidenceField(meta, "candidateOperationId"), basis.candidateOperationId); assert.deepEqual(evidenceField(meta, "candidate"), basis.candidate); assert.deepEqual(evidenceField(meta, "criteria"), basis.criteria);
  const report = task.reports.at(-1); assert.ok(report && report.status === "done" && report.evidence?.includes(facts.qualityPath)); assert.equal(report.from, "verifier");
  if (facts.reportRef !== undefined) {
    assert.ok(isSnapshotArtifactRef(facts.reportRef) && facts.reportSnapshotBytes);
    assert.equal(createHash("sha256").update(facts.reportSnapshotBytes).digest("hex"), facts.reportRef.sha256);
    assert.deepEqual(JSON.parse(facts.reportSnapshotBytes.toString("utf8")), report); assert.equal(facts.snapshotQualitySha256, facts.qualitySha256);
  }
  const historical = task.taskId !== currentTask.taskId, acceptedPointer = task.closed?.outcome === "accepted";
  if (historical || acceptedPointer) {
    assert.ok(task.closed && acceptedPointer && facts.reportRef, "Historical accepted pointer requires the actual creator receipt and snapshot reportRef");
    assert.equal(task.closed.by, "chief"); assert.ok(task.closed.actionSource?.kind === "role-direct"); assert.equal(task.closed.actionSource.actorRoleId, "chief");
    assert.equal(task.closed.actionSource.action, "close-created-task"); assert.equal(task.closed.actionSource.operationId, task.closed.operationId); assert.equal(task.closed.actionSource.runId, task.created.runId);
  }
  return { kind: historical ? "historical-accepted-status-pointer" : "current-reported-status-pointer", taskId: task.taskId, reportTurnId: report.turnId,
    candidate: basis.candidate, qualityPath: facts.qualityPath, qualitySha256: facts.qualitySha256, reportRef: facts.reportRef ?? null,
    acceptedPointer, currentReviewAccepted: !historical && acceptedPointer, meaning: "Information only; not a save/close/approval promise for another task or candidate" };
}

function recordStatusPointerReceipt(seen: Set<string>, scope: string, notice: string, pointer: ReturnType<typeof validatePersistedStatusPointer>) {
  const logical = `${scope}:${pointer.kind}:${pointer.taskId}:${pointer.reportTurnId}:${pointer.acceptedPointer}:`;
  const digest = createHash("sha256").update(JSON.stringify({ notice, candidate: pointer.candidate, path: pointer.qualityPath, sha256: pointer.qualitySha256, ref: pointer.reportRef })).digest("hex");
  const prior = [...seen].filter(key => key.startsWith(logical)); assert.ok(prior.length <= 1, "Ambiguous governance status receipt history");
  const key = logical + digest;
  if (prior.length) { assert.equal(prior[0], key, "Conflicting governance status source/ref/SHA for the same task/report"); return "duplicate" as const; }
  seen.add(key); return "fresh" as const;
}

async function receivePersistedGovernanceStatus(body: ChatRequest, options: {
  root: string; currentTaskKey: string; trace: readonly HttpTrace[]; historyProof?: { path: string; sha256: string }; historyProofs?: readonly { path: string; sha256: string }[]; seen: Set<string>; caseTag: string;
}) {
  const notice = actualUserInput(body); if (!notice.startsWith("[系统·治理反馈] 来自 质检 的验收状态")) return undefined;
  const pathMatch = /\n报告路径：(docs\/quality\/[a-z0-9-]+-report-v[1-9]\d*\.md)\n/.exec(notice); assert.ok(pathMatch); const qualityPath = pathMatch[1]; assert.ok(qualityPath);
  const qualityBytes = await fs.readFile(path.join(options.root, qualityPath)), qualitySha256 = createHash("sha256").update(qualityBytes).digest("hex");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(qualityBytes.toString("utf8")); assert.ok(fm?.[1]); const meta: unknown = parseYaml(fm[1]), taskId = evidenceField(meta, "taskId"); assert.ok(typeof taskId === "string");
  const ledger = await readTaskState(options.root); assert.deepEqual(ledger.errors, []); const task = ledger.records.get(taskId), currentTask = [...ledger.records.values()].find(row => row.created?.idempotencyKey === options.currentTaskKey); assert.ok(task && currentTask);
  const traces = [...options.trace];
  const history = [...(options.historyProof ? [options.historyProof] : []), ...(options.historyProofs ?? [])];
  assert.ok(history.length <= 2); assert.equal(new Set(history.map(ref => ref.path)).size, history.length);
  for (const reference of history) {
    const bytes = await fs.readFile(reference.path); assert.equal(createHash("sha256").update(bytes).digest("hex"), reference.sha256);
    const proof = JSON.parse(bytes.toString("utf8")); assert.equal(proof.root, options.root); assert.deepEqual(proof.errors, []); assert.ok(Array.isArray(proof.trace)); traces.push(...proof.trace);
  }
  const currentDispatches = traces.flatMap(turn => turn.role === "chief" ? turn.reply?.tool_calls ?? [] : []).filter(call => {
    if (call.function.name !== "ans_dispatch_task") return false; const args: unknown = JSON.parse(call.function.arguments);
    return evidenceField(args, "idempotencyKey") === options.currentTaskKey && evidenceField(args, "roleId") === "verifier";
  }); assert.equal(currentDispatches.length, 1); const dispatch = currentDispatches[0]; assert.ok(dispatch);
  const target = evidenceField(JSON.parse(dispatch.function.arguments), "reviewTarget"), candidate = evidenceField(target, "candidate"), operationId = evidenceField(target, "operationId"); assert.ok(isGitOid(candidate) && typeof operationId === "string");
  let reportRef: SnapshotArtifactRef | undefined, reportSnapshotBytes: Buffer | undefined, snapshotQualitySha256: string | undefined;
  const closedCalls = traces.flatMap(turn => turn.role === "chief" ? turn.reply?.tool_calls ?? [] : []).filter(call => {
    if (call.function.name !== "ans_close_created_task") return false; const args: unknown = JSON.parse(call.function.arguments);
    return evidenceField(args, "taskId") === task.taskId && evidenceField(args, "operationId") === task.closed?.operationId;
  });
  if (task.closed?.outcome === "accepted") {
    assert.equal(closedCalls.length, 1); const closed = closedCalls[0]; assert.ok(closed); const ref = evidenceField(JSON.parse(closed.function.arguments), "reportRef"); assert.ok(isSnapshotArtifactRef(ref)); reportRef = ref;
    const read = await createProjectTrunkStore(options.root).readSnapshotArtifact!(reportRef); assert.ok(read.ok); reportSnapshotBytes = Buffer.from(read.value.bytesBase64, "base64");
    snapshotQualitySha256 = read.value.snapshot.files.find(file => file.path === qualityPath)?.sha256;
  }
  const facts: StatusPointerFacts = { notice, qualityPath, qualityBytes, qualitySha256, task, currentTask, currentTarget: { operationId, candidate }, reportRef, reportSnapshotBytes, snapshotQualitySha256 };
  const validated = validatePersistedStatusPointer(facts), receipt = recordStatusPointerReceipt(options.seen, `${options.root}:${currentTask.taskId}`, notice, validated);
  if (receipt === "fresh") await fs.writeFile(path.join(evidence, `${options.caseTag}-status-pointer-${validated.taskId}.json`), JSON.stringify({ at: new Date().toISOString(), notice, currentTaskId: currentTask.taskId, actualTask: task, validated }, null, 2), { flag: "wx" });
  return modelDone(`${validated.kind === "historical-accepted-status-pointer" ? "既有" : "本轮"}质检状态指针已核对，报告位置${qualityPath}；这只作信息回执，不表示其它版本/任务已保存、accepted或客户批准。`);
}

/** Shared real final-OID review; only the source-specific creator/revert receipt check is supplied by the current scenario. */
function createAssignedTextReviewReceivers(options: {
  driver: () => Awaited<ReturnType<typeof createRealHttpDriver>>; taskKey: string; caseTag: string; qualityPath: string;
  expectedContent?: string; id: (suffix: string) => string;
  actualSourceReceipt: (basis: TaskReviewBasisRef) => Promise<unknown>;
}): HttpScripts[string] {
  const id = options.id, qualityPath = options.qualityPath, outputPath = "src/impl/result.txt";
  let reviewBasis: TaskReviewBasisRef | undefined, reviewIdentity: { taskId: string; runId: string; flowId: string } | undefined;
  let reviewText: string | undefined, qualityText: string | undefined, actualCreatorReceipt: unknown;
  const decode = (body: ChatRequest, callId: string) => { const raw = actualToolReply(body, callId), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(value)); return value; };
  return [async body => {
    reviewBasis = actualAssignedReviewBasis(body); assert.equal(reviewBasis.criteria.length, 1);
    const task = (await options.driver().observe()).tasks.find(row => row.created?.idempotencyKey === options.taskKey); assert.ok(task?.created?.runId && task.created.flowId); assert.deepEqual(task.created.reviewBasisRef, reviewBasis);
    reviewIdentity = { taskId: task.taskId, runId: task.created.runId, flowId: task.created.flowId };
    await options.driver().save(path.join(evidence, `${options.caseTag}-actual-review-runtime.json`), { actualRequest: body, actualTask: task }); const criterion = reviewBasis.criteria[0]; assert.ok(criterion);
    return modelCalls(gitTool(id("criterion"), "git_query", { operationId: id("criterion"), template: "show", target: criterion.oid, paths: [criterion.path] }));
  }, body => {
    const value = decode(body, id("criterion")); assert.equal(value.status, "observed"); assert.notEqual(value.truncated, true); assert.ok(value.output && reviewBasis);
    assert.equal(createHash("sha256").update(value.output).digest("hex"), reviewBasis.criteria[0]?.sha256);
    const requirements = value.output.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).join(" ");
    assert.equal(requirements, "Produce src/impl/result.txt, preserve evidence and use creator closure.");
    return modelCalls(gitTool(id("artifact"), "git_query", { operationId: id("artifact"), template: "show", target: reviewBasis.candidate, paths: [outputPath] }));
  }, async body => {
    const value = decode(body, id("artifact")); assert.equal(value.status, "observed"); assert.notEqual(value.truncated, true); assert.equal(typeof value.output, "string"); assert.ok(value.output?.trim()); if (options.expectedContent !== undefined) assert.equal(value.output, options.expectedContent); reviewText = value.output;
    assert.ok(reviewBasis); actualCreatorReceipt = await options.actualSourceReceipt(reviewBasis);
    return modelCalls(gitTool(id("denied-write"), "write_file", { path: "src/impl/verifier-maintenance-denied.txt", content: "This implementation write must be denied.\n" }));
  }, async body => {
    const reply = actualToolReply(body, id("denied-write")); assert.doesNotMatch(reply, /已获准并落盘/); assert.match(reply, /拒|越界|denied|门禁|不允许/i);
    assert.equal(await fs.stat(path.join(options.driver().root, "src/impl/verifier-maintenance-denied.txt")).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
    assert.ok(reviewBasis && reviewIdentity && reviewText);
    const metadata = { schema: "git-quality-report/v1", version: qualityDocumentVersion(qualityPath), ...reviewIdentity, candidateOperationId: reviewBasis.candidateOperationId, candidate: reviewBasis.candidate, criteria: reviewBasis.criteria,
      checks: [{ artifact: { oid: reviewBasis.candidate, path: outputPath, sha256: createHash("sha256").update(reviewText).digest("hex") }, assertion: "nonempty-utf8" }] };
    qualityText = `---\n${JSON.stringify(metadata, null, 2)}\n---\n# Independent later text review\nExact final Git blob: ${JSON.stringify(reviewText)}\nActual source/creator evidence: ${JSON.stringify(actualCreatorReceipt)}\nImplementation write was actually denied.\n`;
    return modelCalls(gitTool(id("quality-write"), "write_file", { path: qualityPath, content: qualityText }));
  }, async body => {
    assert.match(actualToolReply(body, id("quality-write")), /已获准并落盘/); assert.equal(await fs.readFile(path.join(options.driver().root, qualityPath), "utf8"), qualityText); assert.ok(reviewBasis && reviewText);
    return modelCalls(gitTool(id("quality-report"), "submit_report", { status: "completed", summary: "真实最终OID/冻结标准/实际来源/实施拒写及自属质量文档已核，不代Chief接受或发布。",
      evidence: [qualityPath, `Git operation ${reviewBasis.candidateOperationId}`, `Git candidate ${reviewBasis.candidate.objectFormat}:${reviewBasis.candidate.hex}`,
        ...reviewBasis.criteria.map(ref => `Git criterion ${ref.oid.objectFormat}:${ref.oid.hex} ${ref.path} ${ref.sha256}`),
        `Git artifact ${reviewBasis.candidate.objectFormat}:${reviewBasis.candidate.hex} ${outputPath} ${createHash("sha256").update(reviewText).digest("hex")}`] }));
  }, body => { actualToolReply(body, id("quality-report")); return modelDone("后续独立质量证据已正式回Chief；未自行接受或交付。"); }];
}

/** A bounded follow-on cycle uses the same real worker receiver and the current delivered code basis. */
async function runDeliveredTextModification(options: { caseTag: string; proofFile: string; proofSha256: string; absoluteDeadlineAt: number }) {
  const op = (suffix: string) => `${options.caseTag}-${suffix}`, flowId = "q2-new", outputPath = "src/impl/result.txt";
  const content = "Actual isolated workflow worker output, later approved text maintenance.\n", qualityPath = `docs/quality/${flowId}-report-v2.md`;
  const phaseEnd = Math.min(Date.now() + 180000, options.absoluteDeadlineAt); assert.ok(phaseEnd > Date.now());
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, completed = false, customerText: string | undefined, primary: unknown;
  let workerReceipt: GitCapabilityResult | undefined, integrated: GitCapabilityResult | undefined, published: GitCapabilityResult | undefined;
  let visibleDelivered: VisibleDeliveredTextSource | undefined;
  let controllerCandidate: GitOid | undefined, actualControllerBasis: GitCapabilityResult["basis"];
  let chiefTarget: { controller: VisibleHubController; operationId: string; candidate: GitOid } | undefined;
  let chiefQuality: { candidate: GitOid; criteria: GitEvidenceRef[]; evidence: GitEvidenceRef[]; qualityPath: string } | undefined;
  const progress: { stage: string; reply: string }[] = [], notices = new Set<string>();
  const decode = (body: ChatRequest, id: string) => { const text = actualToolReply(body, id), value: unknown = JSON.parse(text.slice(text.indexOf("{"))); assert.ok(isGitCapabilityResult(value)); progress.push({ stage: id, reply: text }); return value; };
  const scripts: HttpScripts = { chief: [async body => {
    await observeActualChiefWorkflow(body); assert.ok(actualUserInput(body).includes(outputPath));
    return modelCalls(gitTool(op("controller"), "dispatch_task", { roleId: "convener", flowId, sideEffect: "code", idempotencyKey: op("controller"),
      task: `在当前已交付代码与原冻结标准下维护${outputPath}的非空文本，通过真实impl任务/候选/creatorclose整合，正式回Chief独立质量；不要复用首轮operation或质量报告。`, expectedOutput: "真实后续候选与独立质量/交付" }));
  }, body => { assert.match(actualToolReply(body, op("controller")), /已受理|已派发/); return modelDone("等待真实运营任务，不把派发当执行或交付。"); },
  async body => {
    const facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === op("controller")), report = task?.reports.at(-1), input = actualUserInput(body);
    assert.ok(task?.created && report && task.created.runId); assert.equal(task.closed, undefined); assert.ok(input.includes(task.taskId) && input.includes(report.summary));
    if (report.status === "done") {
      visibleDelivered = visibleDeliveredTextSource(report.summary); assert.equal(visibleDelivered.flowId, task.created.flowId); assert.equal(visibleDelivered.operationId, op("publish"));
      assert.deepEqual(visibleDelivered.candidate, published?.published?.oid, "Comparison only: Chief delivery selector came from its actual received formal report");
      return modelCalls(gitTool(op("close-controller"), "close_created_task", originalCreatorClose(body, op("close-controller"))));
    }
    if (report.summary === "本轮未提交正式任务报告，尚不能确认任务完成。本轮没有可定位的产物证据。") {
      const child = facts.tasks.find(row => row.created?.idempotencyKey === op("worker")); assert.ok(child?.created && isTaskParentRef(child.created.parentTaskRef));
      assert.equal(child.created.parentTaskRef.taskId, task.taskId);
      if (child.closed) { assert.equal(child.closed.outcome, "accepted"); const review = facts.tasks.find(row => row.created?.idempotencyKey === op("review"));
        assert.ok(review?.created && !review.closed && isTaskReviewControllerRef(review.created.reviewControllerRef)); assert.equal(review.created.reviewControllerRef.taskId, task.taskId); }
      return modelDone("运营尚未完成；已真实成立的worker或独立审查继续等待，不把terminal fallback当完成或批准。");
    }
    assert.equal(report.status, "blocked"); const packet = /FINAL_REVIEW\|op=([^|]+)\|cid=(sha1|sha256):([a-f0-9]+)\|flow=([^|]+)\|run=([^|]+)\|END/.exec(input); assert.ok(packet, "CURRENT_CONTROLLER_VISIBLE_FINAL_TARGET_INFORMATION_GAP");
    const candidate: unknown = { objectFormat: packet[2], hex: packet[3] }; assert.ok(isGitOid(candidate)); assert.equal(packet[4], task.created.flowId); assert.equal(packet[5], task.created.runId);
    chiefTarget = { controller: { taskId: task.taskId, flowId: packet[4]!, runId: packet[5]! }, operationId: packet[1]!, candidate };
    assert.deepEqual(candidate, integrated?.candidate, "comparison only; selector came from actual Chief handback");
    return modelCalls(gitTool(op("review"), "dispatch_task", { roleId: "verifier", flowId: chiefTarget.controller.flowId, sideEffect: "code", idempotencyKey: op("review"),
      reviewTarget: { operationId: chiefTarget.operationId, candidate }, task: `独立按真实冻结criteria核${candidate.objectFormat}:${candidate.hex}及creator证据；质量自属报告用${qualityPath}，回Chief不自批。`, expectedOutput: qualityPath }));
  }, async body => {
    const pending = body.messages.findLast(message => message.role === "tool")?.tool_call_id;
    if (pending === op("review")) { assert.match(actualToolReply(body, op("review")), /已受理|已派发/); return modelDone("已派真实独立Verifier，等待正式报告。"); }
    assert.equal(pending, op("close-controller")); const reply = actualToolReply(body, op("close-controller"));
    const task = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("controller")); assert.equal(task?.closed?.outcome, "accepted", reply); assert.equal(task?.closed?.by, "chief");
    assert.ok(published?.published && isGitOid(published.published.oid) && visibleDelivered); assert.equal(published.published.ref, `refs/ans/delivery/${visibleDelivered.flowId}`);
    customerText = `已交付；DELIVERED|f=${visibleDelivered.flowId}|o=${visibleDelivered.operationId}|c=${visibleDelivered.candidate.objectFormat}:${visibleDelivered.candidate.hex}|w=${visibleDelivered.worker.objectFormat}:${visibleDelivered.worker.hex}|END`;
    assert.ok(customerText.length <= 200, "Customer source packet must remain visible under the actual summary limit"); completed = true; return modelDone(customerText);
  }, async body => {
    const input = actualUserInput(body), facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === op("review")), report = task?.reports.at(-1);
    assert.ok(task?.created && report && chiefTarget); assert.equal(report.status, "done"); assert.ok(input.includes(task.taskId) && input.includes(report.summary));
    const candidate = visibleCandidate(input), criteria = visibleEvidence(input, "criterion"), artifacts = visibleEvidence(input, "artifact");
    assert.deepEqual(candidate, chiefTarget.candidate); assert.ok(criteria.length && artifacts.length && input.includes(qualityPath));
    assert.ok(isTaskReviewControllerRef(task.created.reviewControllerRef)); assert.equal(task.created.reviewControllerRef.taskId, chiefTarget.controller.taskId);
    assert.deepEqual(criteria, task.created.reviewControllerRef.reviewBasisRef.criteria); chiefQuality = { candidate, criteria, evidence: artifacts, qualityPath };
    return modelCalls(gitTool(op("close-review"), "close_created_task", originalCreatorClose(body, op("close-review"))));
  }, async body => {
    const reply = actualToolReply(body, op("close-review")), value: unknown = JSON.parse(reply.slice(reply.indexOf("{")));
    assert.equal(evidenceField(value, "ok"), true); assert.equal(evidenceField(value, "operationId"), op("close-review")); const reviewTaskId = evidenceField(value, "taskId"); assert.ok(typeof reviewTaskId === "string" && chiefTarget && chiefQuality);
    const material: VisibleHubDelivery = { controller: chiefTarget.controller, candidateOperationId: chiefTarget.operationId, ...chiefQuality, reviewTaskId, reviewCloseOperationId: op("close-review") };
    const actual = (await driver.observe()).tasks.find(row => row.taskId === reviewTaskId); assert.equal(actual?.closed?.outcome, "accepted");
    return modelCalls(gitTool(op("resume"), "dispatch_task", { roleId: "convener", flowId, sideEffect: "code", idempotencyKey: op("resume"),
      resumeController: { ...material.controller, reviewTaskId, reviewCloseOperationId: material.reviewCloseOperationId },
      task: `质量已由Chief真实accepted；同一仍live控制任务继续交付。【交付依据】${JSON.stringify(material)}`, expectedOutput: "实际后续delivery ref/journal和正式报告" }));
  }, body => { assert.match(actualToolReply(body, op("resume")), /已受理|已派发/); return modelDone("真实resume已受理；仍等运营实际发布与报告。"); }], convener: [
  body => {
    const input = actualUserInput(body), match = /【交付依据】(\{[^\n]+\})/.exec(input);
    if (match) { const material: unknown = JSON.parse(match[1]!); assert.ok(isVisibleHubDelivery(material) && actualControllerBasis?.oid);
      return modelCalls(gitTool(op("publish"), "git_publish", { operationId: op("publish"), target: "delivery", expected: { ref: `refs/ans/delivery/${flowId}`, oid: actualControllerBasis.oid },
        candidate: material.candidate, criteria: material.criteria, evidence: material.evidence, creatorCloseOperationId: material.reviewCloseOperationId })); }
    return modelCalls(gitTool(op("worker"), "dispatch_task", { roleId: "impl", flowId, sideEffect: "code", moduleId: "impl-core", idempotencyKey: op("worker"),
      task: `按真实当前run/module只维护${outputPath}为当前指定非空文本，必须实际write/query/commit/report，不自批质量或交付。`, expectedOutput: outputPath }));
  }, async body => {
    if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === op("publish")) {
      published = decode(body, op("publish")); assert.equal(published.status, "published"); assert.ok(published.published && integrated?.candidate);
      assert.deepEqual(published.published.oid, integrated.candidate); assert.deepEqual(await createGitCandidateStore(driver.root).readRef(published.published.ref), published.published.oid);
      await driver.save(path.join(evidence, `${options.caseTag}-actual-maintenance-delivery.json`), { published, journal: await createGitRefStore(driver.root).readJournal(published.operationId) });
      const sourceWorker = published.parents?.[1]; assert.ok(isGitOid(sourceWorker)); assert.equal(published.published.ref, `refs/ans/delivery/${flowId}`);
      const summary = `DELIVERED|f=${flowId}|o=${published.operationId}|c=${published.published.oid.objectFormat}:${published.published.oid.hex}|w=${sourceWorker.objectFormat}:${sourceWorker.hex}|END`;
      assert.ok(summary.length <= 200); assert.deepEqual(visibleDeliveredTextSource(summary).worker, sourceWorker);
      return modelCalls(gitTool(op("delivery-report"), "submit_report", { status: "completed", summary, evidence: [qualityPath, `Git operation ${published.operationId}`] }));
    }
    assert.match(actualToolReply(body, op("worker")), /已受理|已派发/); return modelDone("等待实际worker报告，未接受或交付。");
  }, body => {
    if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === op("delivery-report")) { actualToolReply(body, op("delivery-report")); return modelDone("真实delivery已正式报Chief，等待原创建者收口。"); }
    controllerCandidate = visibleCandidate(actualUserInput(body)); assert.deepEqual(controllerCandidate, workerReceipt?.candidate);
    return modelCalls(gitTool(op("close-worker"), "close_created_task", originalCreatorClose(body, op("close-worker"))));
  }, async body => {
    const reply = actualToolReply(body, op("close-worker")), child = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("worker"));
    assert.equal(child?.closed?.outcome, "accepted", reply); assert.equal(child?.closed?.by, "convener");
    return modelCalls(gitTool(op("basis"), "git_query", { operationId: op("basis"), template: "log", limit: 1 }));
  }, async body => {
    const result = decode(body, op("basis")); assert.equal(result.status, "observed"); assert.ok(isGitBasis(result.basis) && result.basis.oid && controllerCandidate); actualControllerBasis = result.basis;
    const parent = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("controller")); assert.ok(parent?.created?.runId);
    const run = await createProjectTrunkStore(driver.root).readRunRecord!(parent.created.runId); assert.ok(run.ok); assert.deepEqual(result.basis, run.value.value.codeBasis);
    assert.equal(result.basis.ref, `refs/ans/delivery/${flowId}`);
    if (result.basisSource) { assert.equal(result.basisSource.runId, parent.created.runId); assert.equal(result.basisSource.pinDigest, run.value.value.pinDigest); assert.equal(result.basisSource.runRecordSha256, run.value.sha256); }
    return modelCalls(gitTool(op("integrate"), "git_candidate", { operationId: op("integrate"), action: "integrate", base: result.basis, candidates: [controllerCandidate], message: "Integrate the actual creator-accepted later text maintenance" }));
  }, async body => {
    integrated = decode(body, op("integrate")); assert.equal(integrated.status, "prepared"); assert.ok(integrated.candidate && integrated.parents && integrated.parents.length >= 2 && integrated.tree && integrated.journalId);
    const task = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("controller")); assert.ok(task?.created?.runId);
    const git = createGitCandidateStore(driver.root), commit = await git.readCommit(integrated.candidate), blob = await git.readBlob(integrated.candidate, outputPath);
    assert.deepEqual(commit.tree, integrated.tree); assert.deepEqual(commit.parents, integrated.parents); assert.equal(Buffer.from(blob.bytesBase64, "base64").toString("utf8"), content);
    await driver.save(path.join(evidence, `${options.caseTag}-actual-maintenance-integration.json`), { integrated, commit, blob, actualTask: task });
    const summary = `FINAL_REVIEW|op=${integrated.operationId}|cid=${integrated.candidate.objectFormat}:${integrated.candidate.hex}|flow=${flowId}|run=${task.created.runId}|END`; assert.ok(summary.length <= 200);
    return modelCalls(gitTool(op("review-request"), "submit_report", { status: "blocked", summary, evidence: [`Git operation ${integrated.operationId}`, `Git candidate ${integrated.candidate.objectFormat}:${integrated.candidate.hex}`] }));
  }, body => { actualToolReply(body, op("review-request")); return modelDone("后续真实候选已正式回Chief，请独立质检；候选不等交付。"); }],
  impl: createAssignedWorkerReceivers({ driver: () => driver, workerRoleId: "impl", workerTaskKey: op("worker"), flowId, output: { path: outputPath, content },
    ids: { write: op("write"), basis: op("worker-basis"), candidate: op("candidate"), gapReport: op("worker-gap"), report: op("worker-report") }, caseTag: options.caseTag, progress, onCandidateReceipt: result => { workerReceipt = result; } }),
  verifier: createAssignedTextReviewReceivers({ driver: () => driver, taskKey: op("review"), caseTag: options.caseTag, qualityPath, expectedContent: content, id: op,
    actualSourceReceipt: async () => { const worker = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("worker"));
      assert.ok(worker?.closed); assert.equal(worker.closed.outcome, "accepted"); assert.equal(worker.closed.by, "convener"); return worker.closed; } }) };
  const recipients = ["chief", "convener", "product", "nominator", "verifier", "impl"];
  for (const role of recipients) scripts[`${role}:application-notice`] = [async body => {
    const text = actualApplicationNotice(body); assert.ok(text);
    if (text.startsWith("[系统·治理反馈] 来自 质检 的验收状态")) {
      assert.equal(role, "chief"); const pointer = await receivePersistedGovernanceStatus(body, { root: driver.root, currentTaskKey: op("review"), trace: driver.trace,
        historyProof: { path: options.proofFile, sha256: options.proofSha256 }, seen: notices, caseTag: options.caseTag }); assert.ok(pointer); return pointer;
    }
    const match = /^\[应用·文档更新\] close-created-task ([^ ]+) applied; ([a-f0-9]{64})$/.exec(text); assert.ok(match);
    assert.ok([op("close-worker"), op("close-review"), op("close-controller")].includes(match[1]!)); const task = (await driver.observe()).tasks.find(row => row.closed?.operationId === match[1]); assert.ok(task?.closed?.actionSource?.kind === "role-direct");
    assert.equal(task.closed.outcome, "accepted"); assert.equal(task.closed.actionSource.targetDigest, match[2]); const key = `${role}:${task.taskId}:${match[1]}:${match[2]}`; assert.equal(notices.has(key), false); notices.add(key); return modelDone(`只确认真实已生效收口 ${match[1]}；不代批准。`);
  }];
  scripts["chief:feedback"] = [async body => {
    const pointer = await receivePersistedGovernanceStatus(body, { root: driver.root, currentTaskKey: op("review"), trace: driver.trace, historyProof: { path: options.proofFile, sha256: options.proofSha256 }, seen: notices, caseTag: options.caseTag }); if (pointer) return pointer;
    const key = ownProducedFeedback(body, driver.trace, ["convener", "impl", "verifier", ...recipients.map(role => `${role}:application-notice`)]); assert.equal(notices.has(key), false); notices.add(key); return modelDone("收到本轮真实回执，仍核正式报告与应用收口依据。");
  }];
  driver = await createRealHttpDriver(scripts, { tag: options.caseTag, requestLimit: 128, timeoutMs: 90000, caseDeadlineAt: phaseEnd, existingOwnedProject: { proofFile: options.proofFile, proofSha256: options.proofSha256 },
    finiteRoles: { chief: { initial: 0, tasks: { [op("controller")]: 2, [op("review")]: 4 } }, convener: { tasks: { [op("controller")]: 0, [op("worker")]: 2 } }, impl: { tasks: { [op("worker")]: 0 } }, verifier: { tasks: { [op("review")]: 0 } } },
    reusableNoticeKeys: ["chief:feedback", ...recipients.map(role => `${role}:application-notice`)] });
  try {
    await driver.openChief(); await driver.sendChief(`在本项目实际已交付基线继续维护${outputPath}非空文本，保持原已确认标准与边界；请由运营真实派impl、原creator收口、Chief独立质检、resume与delivery完成。不是新类型固定路由。`);
    await driver.bounded("real delivered text maintenance and full outcome drain", async signal => { for (;;) {
      if (driver.errors.length) throw new Error(driver.errors.join("\n")); const facts = await driver.observe(), chief = facts.inventory.sessions.find(row => row.roleId === "chief" && row.phase === "live");
      if (completed && !facts.inventory.pendingOpens.length && !facts.inventory.activeDeliveries.length && !facts.inventory.queuedDispatches.length && chief?.lifecycle?.status === "quiescent" && chief.lifecycle.providerFinished) break;
      signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
    } }, { remainingCase: true });
    assert.ok(published?.published && completed && customerText); const tasks = (await driver.observe()).tasks;
    for (const key of [op("controller"), op("worker"), op("review")]) assert.equal(tasks.find(row => row.created?.idempotencyKey === key)?.closed?.outcome, "accepted");
    assert.ok(driver.events.some(row => evidenceField(row, "roleId") === "chief" && evidenceField(evidenceField(row, "event"), "summary") === customerText));
    await driver.save(path.join(evidence, `${options.caseTag}-delivered-text-proof.json`), { publishedDelivery: published, integrated, workerReceipt, qualityPath, customerText, visibleDelivered, processId: process.pid });
    return { root: driver.root, published, integrated, workerReceipt, proofFile: path.join(evidence, `${options.caseTag}-delivered-text-proof.json`) };
  } catch (error) { primary = error; throw error;
  } finally {
    let cleanup: unknown;
    try { await driver.save(path.join(evidence, `${options.caseTag}-full-final-proof.json`), { completed, publishedDelivery: published, integrated, workerReceipt, qualityPath, progress, primaryError: primary === undefined ? null : actualErrorFact(primary) });
      await driver.dispose(); await driver.save(path.join(evidence, `${options.caseTag}-after-cleanup-proof.json`), { completed, publishedDelivery: published }); assert.deepEqual(driver.errors, []);
    } catch (error) { cleanup = error; }
    await fs.writeFile(path.join(evidence, `${options.caseTag}-error-outcomes.json`), JSON.stringify({ primaryError: primary === undefined ? null : actualErrorFact(primary), cleanupError: cleanup === undefined ? null : actualErrorFact(cleanup), driverErrors: driver.errors }, null, 2), { flag: "wx" });
    if (cleanup !== undefined) throw new AggregateError([...(primary === undefined ? [] : [primary]), cleanup], "Real maintenance failure and cleanup error; none suppressed");
  }
}

function visiblePublishedWorkerFromLog(output: string, expectedDelivery: GitOid): GitOid {
  const rows = output.split(/\r?\n/).filter(line => line.length); assert.equal(rows.length, 1);
  const columns = rows[0]?.split("\0"); assert.ok(columns && columns.length === 3); assert.equal(columns[0], expectedDelivery.hex);
  const parents = columns[1]?.split(" "); assert.ok(parents && parents.length === 2);
  const first: unknown = { objectFormat: expectedDelivery.objectFormat, hex: parents[0] }, worker: unknown = { objectFormat: expectedDelivery.objectFormat, hex: parents[1] };
  assert.ok(isGitOid(first) && isGitOid(worker)); assert.notDeepEqual(worker, expectedDelivery); assert.notDeepEqual(first, worker); return worker;
}
function visibleProductSupportRecord(input: string, expectedPath: string): { path: string; sha256: string } {
  const matches = [...input.matchAll(/SUPPORT_RECORD\|([^\r\n]+?)\|END/g)]; assert.equal(matches.length, 1);
  const packet = matches[0]?.[1]; assert.ok(packet); const record: unknown = JSON.parse(packet);
  const supportPath = evidenceField(record, "path"), sha256 = evidenceField(record, "sha256");
  assert.equal(supportPath, expectedPath); assert.ok(typeof supportPath === "string" && typeof sha256 === "string" && /^[a-f0-9]{64}$/.test(sha256));
  assert.ok(record && typeof record === "object" && !Array.isArray(record)); assert.deepEqual(Object.keys(record).sort(), ["path", "sha256"]); return { path: supportPath, sha256 };
}

/** Same-process follow-on: revert a visible later worker commit, formally rework a missing-support review, and request a fresh review. */
async function runDeliveredRevertWithReviewRepair(options: {
  caseTag: string; proofFile: string; proofSha256: string; historyProof: { path: string; sha256: string }; absoluteDeadlineAt: number; existingDeliveredData?: { producerSourceIdentity: string; checkpointSha256: string };
  reviewMode?: "positive";
}) {
  assert.ok(options.reviewMode === undefined || options.reviewMode === "positive");
  const repairReview = options.reviewMode !== "positive";
  const op = (suffix: string) => `${options.caseTag}-${suffix}`, flowId = "q2-new", outputPath = "src/impl/result.txt";
  const qualityPath = `docs/quality/${flowId}-report-v3.md`, supportPath = "docs/product/q2-new-revert-support-v1.md";
  const phaseEnd = Math.min(Date.now() + 240000, options.absoluteDeadlineAt); assert.ok(phaseEnd > Date.now());
  const priorBytes = await fs.readFile(options.proofFile); assert.equal(createHash("sha256").update(priorBytes).digest("hex"), options.proofSha256);
  const prior = JSON.parse(priorBytes.toString("utf8")); assert.deepEqual(prior.errors, []);
  if (options.existingDeliveredData) { assert.match(options.existingDeliveredData.producerSourceIdentity, /^[a-f0-9]{64}$/); assert.match(options.existingDeliveredData.checkpointSha256, /^[a-f0-9]{64}$/); }
  else assert.equal(prior.extra?.processId, process.pid);
  const actualCustomerText: unknown = prior.extra?.customerText; assert.equal(typeof actualCustomerText, "string"); assert.ok(typeof actualCustomerText === "string");
  assert.ok(Array.isArray(prior.events) && prior.events.some((row: unknown) => evidenceField(row, "roleId") === "chief" && evidenceField(evidenceField(row, "event"), "summary") === actualCustomerText));
  const priorPublication: unknown = prior.extra?.publishedDelivery; assert.ok(isGitCapabilityResult(priorPublication) && priorPublication.status === "published" && priorPublication.published && isGitOid(priorPublication.published.oid));
  const deliveryRef = priorPublication.published.ref, priorDelivery = priorPublication.published.oid;
  assert.equal(deliveryRef, `refs/ans/delivery/${flowId}`); assert.ok(actualCustomerText.includes(priorDelivery.hex));
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, completed = false, primary: unknown, reworked = false;
  let candidateReceipt: GitCapabilityResult | undefined, published: GitCapabilityResult | undefined, controllerBasis: GitCapabilityResult["basis"];
  let chiefTarget: { controller: VisibleHubController; operationId: string; candidate: GitOid } | undefined;
  let chiefQuality: { criteria: GitEvidenceRef[]; evidence: GitEvidenceRef[] } | undefined, supportReport: { path: string; sha256: string } | undefined;
  let customerText: string | undefined, pinBeforeSupport: { runId: string; sha256: string } | undefined;
  const notices = new Set<string>(), progress: { id: string; raw: string }[] = [];
  const decode = (body: ChatRequest, id: string) => { const raw = actualToolReply(body, id), result: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.ok(isGitCapabilityResult(result)); progress.push({ id, raw }); return result; };
  const work = async (body: ChatRequest, key: string, status: "blocked" | "done") => {
    const task = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === key), report = task?.reports.at(-1);
    assert.ok(task?.created && report); assert.equal(task.created.from, "chief"); assert.equal(task.closed, undefined); assert.equal(report.status, status);
    assert.ok(actualUserInput(body).includes(task.taskId) && actualUserInput(body).includes(report.summary)); return { task, report };
  };
  const dispatchReview = (key: string) => {
    assert.ok(chiefTarget);
    const supportPacket = repairReview && key === op("review") ? (() => { assert.ok(supportReport); return ` SUPPORT_RECORD|${JSON.stringify(supportReport)}|END`; })() : "";
    return modelCalls(gitTool(key, "dispatch_task", { roleId: "verifier", flowId: chiefTarget.controller.flowId, sideEffect: "code", idempotencyKey: key,
      reviewTarget: { operationId: chiefTarget.operationId, candidate: chiefTarget.candidate },
      task: repairReview ? `按真实冻结标准只读核最终CID；本审查还需实际读取支持记录${supportPath}。缺记录正式blocked回Chief，不假质量通过。补材后必须全新审查任务；质量自属产物${qualityPath}。${supportPacket}`
        : `按宿主真实冻结标准只读核本次revert最终CID/blob/hash、非空UTF8成果及实际来源；真实测试实施目录拒写与质量自属写，正式报告Chief，不代批准或发布。质量自属产物${qualityPath}。`, expectedOutput: qualityPath }));
  };
  const rework = createChiefReviewReworkReceivers({ driver: () => driver, reviewTaskKey: op("review-missing"), closeId: op("rework-review"), caseTag: options.caseTag,
    missingPath: supportPath, onStopped: () => { reworked = true; } }); assert.ok(rework?.[0] && rework[1]); const beginRework = rework[0], finishRework = rework[1];
  const closeDeliveredController = async (body: ChatRequest) => {
    const { report } = await work(body, op("controller"), "done"); const match = /^REVERT_DELIVERED\|o=([^|]+)\|c=(sha1|sha256):([a-f0-9]+)\|END$/.exec(report.summary); assert.ok(match);
    const candidate: unknown = { objectFormat: match[2], hex: match[3] }; assert.ok(isGitOid(candidate) && chiefTarget); assert.equal(match[1], op("publish")); assert.deepEqual(candidate, chiefTarget.candidate);
    return modelCalls(gitTool(op("close-controller"), "close_created_task", originalCreatorClose(body, op("close-controller"))));
  };
  const finishController = async (body: ChatRequest) => {
    const raw = actualToolReply(body, op("close-controller")), task = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("controller")); assert.equal(task?.closed?.outcome, "accepted", raw);
    assert.ok(chiefTarget); customerText = `revert已交付；REVERT_DELIVERED|o=${op("publish")}|c=${chiefTarget.candidate.objectFormat}:${chiefTarget.candidate.hex}|END`; assert.ok(customerText.length <= 200);
    completed = true; return modelDone(customerText);
  };
  const scripts: HttpScripts = { chief: [async body => {
    await observeActualChiefWorkflow(body); const input = actualUserInput(body); assert.ok(input.includes(actualCustomerText));
    assert.ok(input.includes(deliveryRef));
    return modelCalls(gitTool(op("delivery-source"), "git_query", { operationId: op("delivery-source"), template: "log", target: priorDelivery, limit: 1 }));
  }, async body => {
    const result = decode(body, op("delivery-source")); assert.equal(result.status, "observed"); assert.notEqual(result.truncated, true); assert.ok(isGitBasis(result.basis) && result.basis.oid && typeof result.output === "string");
    assert.equal(result.basis.oid.objectFormat, priorDelivery.objectFormat);
    const selectedWorker = visiblePublishedWorkerFromLog(result.output, priorDelivery);
    await driver.save(path.join(evidence, `${options.caseTag}-chief-actual-delivery-source-query.json`), { actualQuery: result, selectedWorker, historicalProducer: options.existingDeliveredData ?? { processId: process.pid }, inputDeliveryRef: deliveryRef });
    return modelCalls(gitTool(op("controller"), "dispatch_task", { roleId: "convener", flowId, sideEffect: "code", idempotencyKey: op("controller"),
      task: `只撤回客户指定交付ref的实际query二parent中后续worker非merge改动，保留冻结标准必需非空${outputPath}；真实query取得base再revert，不虚构pin/stop。REVERT_TARGET|${JSON.stringify({ commit: selectedWorker })}|END`, expectedOutput: "真实revert候选及Chief独立质量协调" }));
  }, body => { assert.match(actualToolReply(body, op("controller")), /已受理|已派发/); return modelDone("等待真实revert候选报告，不把派发当执行。"); },
  async body => {
    const current = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("controller"));
    if (current?.reports.at(-1)?.status === "done") return closeDeliveredController(body);
    const { task, report } = await work(body, op("controller"), "blocked"), input = actualUserInput(body);
    const match = /RV\|o=([^|]+)\|c=(sha1|sha256):([a-f0-9]+)\|f=([^|]+)\|r=([^|]+)\|END/.exec(input); assert.ok(match);
    const candidate: unknown = { objectFormat: match[2], hex: match[3] }; assert.ok(isGitOid(candidate));
    assert.equal(match[4], task.created?.flowId); assert.equal(match[5], task.created?.runId); assert.ok(match[1] && match[4] && match[5]);
    assert.ok(report.summary.includes(match[0])); chiefTarget = { operationId: match[1], candidate, controller: { taskId: task.taskId, flowId: match[4], runId: match[5] } };
    return dispatchReview(op(repairReview ? "review-missing" : "review"));
  }, body => { if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === op("close-controller")) return finishController(body);
    assert.match(actualToolReply(body, op(repairReview ? "review-missing" : "review")), /已受理|已派发/); return modelDone("等待实际独立Verifier正式报告。"); },
  beginRework,
  async body => {
    await finishRework(body); assert.equal(reworked, true); assert.ok(chiefTarget);
    const pinned = await createProjectTrunkStore(driver.root).readRunRecord!(chiefTarget.controller.runId); assert.ok(pinned.ok && pinned.value.value.state === "pinned");
    pinBeforeSupport = { runId: chiefTarget.controller.runId, sha256: pinned.value.sha256 };
    return modelCalls(gitTool(op("support"), "dispatch_task", { roleId: "product", flowId, sideEffect: "docs", idempotencyKey: op("support"),
      task: `Chief已真实退修缺材料审查，请仅补本人支持记录${supportPath}：说明该真实revert候选只撤回后续文本维护、保留冻结必需文件；不更改需求/确认/批准/质量结论。SUPPORT_TARGET|${JSON.stringify({ operationId: chiefTarget.operationId, candidate: chiefTarget.candidate })}|END`, expectedOutput: supportPath }));
  }, body => { assert.match(actualToolReply(body, op("support")), /已受理|已派发/); return modelDone("等待真实Product支持文件与正式报告，不代写/代批。"); },
  async body => {
    const { task, report } = await work(body, op("support"), "done"); assert.equal(task.created?.to, "product");
    const match = /^SUPPORT_READY\|p=([^|]+)\|h=([a-f0-9]{64})\|END$/.exec(report.summary); assert.ok(match?.[1] && match[2]);
    assert.equal(match[1], supportPath); assert.deepEqual(report.evidence, [match[1]]); supportReport = { path: match[1], sha256: match[2] };
    return modelCalls(gitTool(op("close-support"), "close_created_task", originalCreatorClose(body, op("close-support"))));
  }, async body => {
    const raw = actualToolReply(body, op("close-support")), facts = await driver.observe(), task = facts.tasks.find(row => row.created?.idempotencyKey === op("support"));
    assert.equal(task?.closed?.outcome, "accepted", raw); assert.equal(task.closed.by, "chief"); assert.ok(supportReport);
    assert.equal(createHash("sha256").update(await fs.readFile(path.join(driver.root, supportReport.path))).digest("hex"), supportReport.sha256);
    assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === op("review-missing"))?.closed?.outcome, "rework");
    assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === op("controller"))?.closed, undefined);
    assert.ok(pinBeforeSupport); const pinned = await createProjectTrunkStore(driver.root).readRunRecord!(pinBeforeSupport.runId);
    assert.ok(pinned.ok); assert.equal(pinned.value.sha256, pinBeforeSupport.sha256, "Supplemental live material must never repin or rewrite the frozen execution basis");
    return dispatchReview(op("review"));
  }, body => { assert.match(actualToolReply(body, op("review")), /已受理|已派发/); return modelDone("新审查已真实派发，旧退修任务保持closed；支持文件不是质量批准。"); },
  async body => {
    const { task } = await work(body, op("review"), "done"); assert.ok(chiefTarget && task.created && isTaskReviewControllerRef(task.created.reviewControllerRef));
    assert.equal(task.created.reviewControllerRef.taskId, chiefTarget.controller.taskId); assert.equal(task.created.reviewControllerRef.runId, chiefTarget.controller.runId);
    const input = actualUserInput(body), candidate = visibleCandidate(input), criteria = visibleEvidence(input, "criterion"), artifacts = visibleEvidence(input, "artifact");
    assert.deepEqual(candidate, chiefTarget.candidate); assert.deepEqual(criteria, task.created.reviewControllerRef.reviewBasisRef.criteria); assert.ok(criteria.length && artifacts.length && input.includes(qualityPath));
    chiefQuality = { criteria, evidence: artifacts }; return modelCalls(gitTool(op("close-review"), "close_created_task", originalCreatorClose(body, op("close-review"))));
  }, async body => {
    const raw = actualToolReply(body, op("close-review")), value: unknown = JSON.parse(raw.slice(raw.indexOf("{"))); assert.equal(evidenceField(value, "ok"), true);
    assert.equal(evidenceField(value, "operationId"), op("close-review")); const taskId = evidenceField(value, "taskId"); assert.ok(typeof taskId === "string" && chiefTarget && chiefQuality);
    const facts = await driver.observe(); assert.equal(facts.tasks.find(row => row.taskId === taskId)?.closed?.outcome, "accepted");
    if (repairReview) assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === op("review-missing"))?.closed?.outcome, "rework");
    const material: VisibleHubDelivery = { controller: chiefTarget.controller, candidateOperationId: chiefTarget.operationId, candidate: chiefTarget.candidate,
      ...chiefQuality, qualityPath, reviewTaskId: taskId, reviewCloseOperationId: op("close-review") };
    await driver.save(path.join(evidence, `${options.caseTag}-actual-new-review-accepted.json`), { actualCloseReply: raw, actualTasks: facts.tasks });
    return modelCalls(gitTool(op("resume"), "dispatch_task", { roleId: "convener", flowId, sideEffect: "code", idempotencyKey: op("resume"),
      resumeController: { ...material.controller, reviewTaskId: taskId, reviewCloseOperationId: material.reviewCloseOperationId },
      task: `Chief已真实accepted全新审查；同一仍live控制任务继续真实交付。【交付依据】${JSON.stringify(material)}`, expectedOutput: "真实revert交付与正式报告" }));
  }, body => { assert.match(actualToolReply(body, op("resume")), /已受理|已派发/); return modelDone("实际resume受理不是发布，继续等控制任务正式结果。"); },
  ] };
  // The positive variant goes directly from this candidate report to a new real review.
  // The original six repair handlers remain unchanged and registered only in repair mode.
  if (!repairReview) {
    assert.ok(scripts.chief);
    scripts.chief = [...scripts.chief.slice(0, 5), ...scripts.chief.slice(11)];
  }
  const revert = createAssignedRevertReceivers({ driver: () => driver, taskKey: op("controller"), caseTag: options.caseTag,
    ids: { basis: op("basis"), candidate: op("candidate"), postBasis: op("post-basis"), report: op("review-request") }, onResult: value => { candidateReceipt = value; }, onBase: basis => { controllerBasis = basis; } }); assert.ok(revert?.[0]); const firstRevert = revert[0];
  scripts.convener = [body => {
    const match = /【交付依据】(\{[^\n]+\})/.exec(actualUserInput(body)); if (!match) return firstRevert(body);
    const material: unknown = JSON.parse(match[1] ?? "null"); assert.ok(isVisibleHubDelivery(material) && controllerBasis?.oid);
    return modelCalls(gitTool(op("publish"), "git_publish", { operationId: op("publish"), target: "delivery", expected: { ref: `refs/ans/delivery/${material.controller.flowId}`, oid: controllerBasis.oid },
      candidate: material.candidate, criteria: material.criteria, evidence: material.evidence, creatorCloseOperationId: material.reviewCloseOperationId }));
  }, async body => {
    if (body.messages.findLast(message => message.role === "tool")?.tool_call_id !== op("publish")) { assert.ok(revert[1]); return revert[1](body); }
    published = decode(body, op("publish")); assert.equal(published.status, "published"); assert.ok(published.published && isGitOid(published.published.oid));
    assert.deepEqual(published.published.oid, candidateReceipt?.candidate); assert.deepEqual(await createGitCandidateStore(driver.root).readRef(published.published.ref), published.published.oid);
    await driver.save(path.join(evidence, `${options.caseTag}-actual-revert-delivery.json`), { published, journal: await createGitRefStore(driver.root).readJournal(published.operationId) });
    const summary = `REVERT_DELIVERED|o=${published.operationId}|c=${published.published.oid.objectFormat}:${published.published.oid.hex}|END`; assert.ok(summary.length <= 200);
    return modelCalls(gitTool(op("delivery-report"), "submit_report", { status: "completed", summary, evidence: [qualityPath, `Git operation ${published.operationId}`] }));
  }, body => {
    if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === op("delivery-report")) { actualToolReply(body, op("delivery-report")); return modelDone("真实revert delivery已正式回Chief。"); }
    assert.ok(revert[2]); return revert[2](body);
  }, ...revert.slice(3)];
  scripts.product = [body => {
    const input = actualUserInput(body); assert.ok(input.includes(supportPath)); const match = /SUPPORT_TARGET\|([^\r\n]+?)\|END/.exec(input); assert.ok(match?.[1]);
    const value: unknown = JSON.parse(match[1]); const candidate = evidenceField(value, "candidate"), operationId = evidenceField(value, "operationId"); assert.ok(isGitOid(candidate) && typeof operationId === "string");
    const content = `# Revert supporting context\n\nThe actual assigned revert candidate ${candidate.objectFormat}:${candidate.hex}, operation ${operationId}, reverses the later text maintenance while retaining the required nonempty src/impl/result.txt.\nThis record is supporting context, not customer confirmation, permission, quality approval or delivery evidence.\n`;
    return modelCalls(gitTool(op("support-write"), "write_file", { path: supportPath, content }));
  }, async body => {
    assert.match(actualToolReply(body, op("support-write")), /已获准并落盘/); return modelCalls(gitTool(op("support-read"), "read_file", { path: supportPath }));
  }, async body => {
    const raw = actualToolReply(body, op("support-read")), bytes = await fs.readFile(path.join(driver.root, supportPath)); assert.ok(raw.includes(bytes.toString("utf8")));
    const summary = `SUPPORT_READY|p=${supportPath}|h=${createHash("sha256").update(bytes).digest("hex")}|END`; assert.ok(summary.length <= 200);
    return modelCalls(gitTool(op("support-report"), "submit_report", { status: "completed", summary, evidence: [supportPath] }));
  }, body => { actualToolReply(body, op("support-report")); return modelDone("真实自属支持文件已正式报告Chief；未确认意图或代批质量。"); }];
  const failed = createAssignedReviewFailureReceivers({ driver: () => driver, taskKey: op("review-missing"), caseTag: options.caseTag, missingPath: supportPath,
    ids: { criterion: op("missing-criterion"), artifact: op("missing-artifact"), support: op("missing-support"), report: op("missing-report") } }); assert.ok(failed);
  const positive = createAssignedTextReviewReceivers({ driver: () => driver, taskKey: op("review"), caseTag: options.caseTag, qualityPath, id: suffix => op(`v3-${suffix}`),
    actualSourceReceipt: async basis => {
      const facts = await driver.observe(), review = facts.tasks.find(row => row.created?.idempotencyKey === op("review")), old = facts.tasks.find(row => row.created?.idempotencyKey === op("review-missing"));
      assert.ok(review?.created?.reviewControllerRef);
      if (repairReview) {
        assert.ok(old?.closed?.outcome === "rework"); assert.notEqual(review.taskId, old.taskId);
        assert.equal(review.created.reviewControllerRef.taskId, old.created?.reviewControllerRef?.taskId); assert.deepEqual(review.created.reviewBasisRef, old.created?.reviewBasisRef);
      } else {
        assert.equal(old, undefined); assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === op("support")), undefined);
      }
      const journal = await createGitRefStore(driver.root).readJournal(basis.candidateOperationId); assert.ok(journal && journal.phase === "published" && journal.candidateSource?.kind === "run-revert"); assert.deepEqual(journal.newOid, basis.candidate);
      assert.equal(journal.candidateSource.taskId, review.created.reviewControllerRef.taskId); assert.equal(journal.candidateSource.runId, review.created.reviewControllerRef.runId);
      return { actualRevertSource: journal.candidateSource, ...(repairReview ? { actualOldReviewDisposition: old?.closed, actualProductTask: facts.tasks.find(row => row.created?.idempotencyKey === op("support")) } : {}) };
    } }); assert.ok(positive?.[0]); const firstPositive = positive[0];
  scripts.verifier = [...failed, async body => {
    const task = (await driver.observe()).tasks.find(row => row.created?.idempotencyKey === op("review")); assert.ok(task?.created && actualUserInput(body).includes(supportPath));
    return modelCalls(gitTool(op("repaired-support-read"), "read_file", { path: supportPath }));
  }, async body => {
    const raw = actualToolReply(body, op("repaired-support-read")), record = visibleProductSupportRecord(actualUserInput(body), supportPath);
    const bytes = await fs.readFile(path.join(driver.root, record.path)); assert.ok(raw.includes(bytes.toString("utf8"))); assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256); return firstPositive(body);
  }, ...positive.slice(1)];
  if (!repairReview) scripts.verifier = positive;
  const roles = ["chief", "convener", "product", "nominator", "verifier", "impl", "rapporteur"];
  const pointer = async (body: ChatRequest) => {
    if (!actualUserInput(body).startsWith("[系统·治理反馈] 来自 质检 的验收状态")) return undefined;
    const tasks = (await driver.observe()).tasks, currentTaskKey = tasks.some(task => task.created?.idempotencyKey === op("review")) ? op("review") : op("review-missing");
    return receivePersistedGovernanceStatus(body, { root: driver.root, currentTaskKey, trace: driver.trace,
      historyProofs: [options.historyProof, { path: options.proofFile, sha256: options.proofSha256 }], seen: notices, caseTag: options.caseTag });
  };
  for (const role of roles) scripts[`${role}:application-notice`] = [async body => {
    const text = actualApplicationNotice(body); assert.ok(text); if (text.startsWith("[系统·治理反馈] 来自 质检 的验收状态")) { assert.equal(role, "chief"); const reply = await pointer(body); assert.ok(reply); return reply; }
    const match = /^\[应用·文档更新\] close-created-task ([^ ]+) applied; ([a-f0-9]{64})$/.exec(text); assert.ok(match?.[1] && match[2]);
    assert.ok([op("rework-review"), op("close-support"), op("close-review"), op("close-controller")].includes(match[1]));
    const task = (await driver.observe()).tasks.find(row => row.closed?.operationId === match[1]); assert.ok(task?.closed?.actionSource?.kind === "role-direct");
    assert.equal(task.closed.outcome, match[1] === op("rework-review") ? "rework" : "accepted"); assert.equal(task.closed.actionSource.targetDigest, match[2]);
    notices.add(`${role}:${task.taskId}:${match[1]}:${match[2]}`); return modelDone(`只确认已真实生效处置${match[1]}；不借状态消息授予质量/发布权限。`);
  }];
  scripts["chief:feedback"] = [async body => { const reply = await pointer(body); if (reply) return reply;
    const key = ownProducedFeedback(body, driver.trace, ["convener", "product", "verifier", ...roles.map(role => `${role}:application-notice`)]); assert.equal(notices.has(key), false); notices.add(key); return modelDone("收到真实内部回执；仍按正式报告与Chief实际处置推进。"); }];
  driver = await createRealHttpDriver(scripts, { tag: options.caseTag, requestLimit: 128, timeoutMs: 90000, caseDeadlineAt: phaseEnd,
    tailDiagnosticFile: path.join(evidence, `${options.caseTag}-bounded-last-facts.jsonl`),
    existingOwnedProject: { proofFile: options.proofFile, proofSha256: options.proofSha256 },
    finiteRoles: repairReview ? { chief: { initial: 0, tasks: { [op("controller")]: 3, [op("review-missing")]: 5, [op("support")]: 8, [op("review")]: 11 } },
      convener: { tasks: { [op("controller")]: 0 } }, product: { tasks: { [op("support")]: 0 } }, verifier: { tasks: { [op("review-missing")]: 0, [op("review")]: failed.length } } }
      : { chief: { initial: 0, tasks: { [op("controller")]: 3, [op("review")]: 5 } }, convener: { tasks: { [op("controller")]: 0 } }, verifier: { tasks: { [op("review")]: 0 } } },
    reusableNoticeKeys: ["chief:feedback", ...roles.map(role => `${role}:application-notice`)] });
  try {
    assert.equal(driver.root, prior.root); await driver.openChief(); await driver.sendChief(`对实际既有交付${deliveryRef}撤回其query二parent中后续worker改动，保留原冻结标准，独立质量核对与真实交付。历史真实Chief转达：${actualCustomerText}`);
    await driver.bounded("real revert, Chief review rework/support/new review, delivery and final drain", async signal => { for (;;) {
      if (driver.errors.length) throw new Error(driver.errors.join("\n")); const facts = await driver.observe(), chief = facts.inventory.sessions.find(row => row.roleId === "chief" && row.phase === "live");
      if (completed && !facts.inventory.pendingOpens.length && !facts.inventory.activeDeliveries.length && !facts.inventory.queuedDispatches.length && chief?.lifecycle?.status === "quiescent" && chief.lifecycle.providerFinished) break;
      signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
    } }, { remainingCase: true });
    assert.ok(completed && published?.published && customerText && (!repairReview || reworked)); const facts = await driver.observe();
    for (const key of [...(repairReview ? [op("support")] : []), op("review"), op("controller")]) assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === key)?.closed?.outcome, "accepted");
    if (repairReview) assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === op("review-missing"))?.closed?.outcome, "rework");
    else for (const key of [op("support"), op("review-missing")]) assert.equal(facts.tasks.find(row => row.created?.idempotencyKey === key), undefined);
    assert.ok(driver.events.some(row => evidenceField(row, "roleId") === "chief" && evidenceField(evidenceField(row, "event"), "summary") === customerText));
    await driver.save(path.join(evidence, `${options.caseTag}-revert-delivered-proof.json`), { publishedDelivery: published, candidateReceipt, customerText, processId: process.pid });
    return { root: driver.root, published };
  } catch (error) { primary = error; throw error;
  } finally {
    await preservePhaseCleanup(options.caseTag, primary === undefined ? undefined : { error: primary }, async () => {
      await driver.save(path.join(evidence, `${options.caseTag}-full-final-proof.json`), { completed, candidateReceipt, publishedDelivery: published, progress, primaryError: primary === undefined ? null : actualErrorFact(primary) });
      await driver.dispose(); await driver.save(path.join(evidence, `${options.caseTag}-after-cleanup-proof.json`), { completed, publishedDelivery: published }); assert.deepEqual(driver.errors, []);
    });
  }
}

// Draft content is authored only by each actual role's write_file call, never prefilled by fs.
const flow = "demo", intentPath = "docs/product/demo-intent-v1.md";
const docs: Record<string, string> = {
  "docs/proposals/demo-proposal-v1.md": "---\nschema: project-proposal/v2\nflowId: demo\nintentId: q2-demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\n---\n# One local text worker\nProduce src/impl/result.txt, preserve evidence and use creator closure.\n",
  "docs/proposals/demo-modules-v1.md": "---\nschema: project-modules/v2\nflowId: demo\nversion: 1\nmodules:\n  - id: impl-core\n    name: Local text\n    purpose: One isolated local output\n    path: src/impl/\n    category: core\n    publicContract: src/impl/result.txt\n    architectureSource: docs/contracts/demo-architecture-v1.md\n---\n# Modules\n",
  "docs/proposals/demo-roster-v1.md": "---\nschema: project-roster/v3\nflowId: demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\nproposal: docs/proposals/demo-proposal-v1.md\narchitecture: docs/contracts/demo-architecture-v1.md\nenvBootstrap:\n  omitted: true\n  omissionReason: Pure local text task requires no environment setup\nroles:\n  - id: impl\n    displayName: Local implementation\n    purpose: Write the one text output\n    capability: Local file editing\n    modules: [impl-core]\nmodules:\n  - id: impl-core\n    name: Local text\n    purpose: One isolated local output\n    path: src/impl/\n    category: core\n    publicContract: src/impl/result.txt\n    architectureSource: docs/contracts/demo-architecture-v1.md\n---\n# Roster\n## 人员+模块拓扑图\n```topology\nschema: project-topology/v2\nmanagement: [convener, impl]\nmodules:\n  - id: impl-core\n    path: src/impl/\n    roleId: impl\nroles:\n  - id: impl\n    modules: [impl-core]\n```\n",
  "docs/proposals/demo-topology-v1.md": "---\nschema: project-topology/v2\nflowId: demo\nversion: 1\n---\n# Topology\nconvener delegates the local module to impl after actual D3 and activation.\n",
  "docs/contracts/demo-architecture-v1.md": "---\nschema: project-architecture/v1\nflowId: demo\nversion: 1\n---\n# Local text architecture\nproposal: docs/proposals/demo-proposal-v1.md\nModule impl-core writes only src/impl/.\n",
  "docs/contracts/demo-assets-v1.md": "---\nschema: project-assets/v1\nflowId: demo\nversion: 1\n---\n# Assets\nNo external assets or network.\n",
};

/** Same-flow material preparation after real initialization creator closure, never prefilled. */
function postInitMaterials(chainFlow: string, submitted: (reply: string) => void | Promise<void>, planned: (reply: string) => void | Promise<void>, roleProgress: (stage: string, reply: string) => void | Promise<void>, diagnosticOnly = false): HttpScripts {
  const intent = `docs/product/${chainFlow}-intent-v1.md`;
  const documents = Object.fromEntries(Object.entries(docs).map(([path, text]) => [path.replaceAll("demo", chainFlow), text.replaceAll("demo", chainFlow)]));
  let documentBasis: string | undefined;
  let planRefs: { planRef: SnapshotArtifactRef; rosterRef: SnapshotArtifactRef } | undefined;
  let d3DecisionId: string | undefined;
  const roleDocuments = {
    "角色卡/impl/role-card.md": "# Implementation\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接", "执行原则", "质量职责", "标准工作流", "交付物清单"].map(section => `## ${section}\nMaintain the assigned module; write only src/impl/.\n`).join(""),
    "角色卡/impl/boundary.md": "# Boundary\n## Section 1: 可修改文件与目录\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录（私有） | `src/impl/` | implementation |\n",
    "角色卡/impl/boundary.yaml": "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: implementation\n",
  };
  const planPath = `docs/scheduling/${chainFlow}-team-v1.md`;
  const workflowText = `# Actual ${chainFlow} workflow\nconvener dispatches impl within src/impl/ after the actual run freeze; a real report needs creator accepted closure before dependencies. Independent verification and final Git delivery remain required.\n`;
  const planText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: chainFlow, version: 1,
    modules: { path: `docs/proposals/${chainFlow}-modules-v1.md`, sha256: createHash("sha256").update(documents[`docs/proposals/${chainFlow}-modules-v1.md`]!).digest("hex") },
    roster: { path: `docs/proposals/${chainFlow}-roster-v1.md`, sha256: createHash("sha256").update(documents[`docs/proposals/${chainFlow}-roster-v1.md`]!).digest("hex") },
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# Current execution plan\nD3 and activation remain separate.\n`;
  return { chief: [
    () => modelCalls(gitTool("q6-product-draft", "dispatch_task", { roleId: "product", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q6-product-draft",
      task: `起草 ${intent}，flowId ${chainFlow}、intentId q6-intent；本项目只生成src/impl/result.txt。报告真实路径，不造客户确认或未来授权。`, expectedOutput: intent })),
    body => { assert.match(actualToolReply(body, "q6-product-draft"), /任务已派发|已受理/); return modelDone("等待真实产品草稿报告。" ); },
    body => modelCalls(gitTool("q6-close-product-draft", "close_created_task", originalCreatorClose(body, "q6-close-product-draft"))),
    body => { assert.match(actualToolReply(body, "q6-close-product-draft"), /accepted|closed/); return modelCalls(gitTool("q6-confirm-intent", "request_choice", {
      cardKind: "intent-confirm", flowId: chainFlow, intentId: "q6-intent", title: "确认实际产品意图", question: "核对实际产品文档字节后确认？",
      options: [{ id: "confirm", label: "Confirm", recommended: true }, { id: "revise", label: "Revise" }] })); },
    body => { assert.match(actualToolReply(body, "q6-confirm-intent"), /confirm/); return modelCalls(gitTool("q6-rapporteur-draft", "dispatch_task", {
      roleId: "rapporteur", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q6-rapporteur-draft",
      task: `根据已确认${intent}编写${chainFlow}六份proposal/modules/roster/topology/architecture/assets v1规划；不填D3/卡/workflow/pin，报告实际文档。`, expectedOutput: "六份实际规划文档" })); },
    body => { assert.match(actualToolReply(body, "q6-rapporteur-draft"), /任务已派发|已受理/); return modelDone("等待真实策划报告。" ); },
    body => modelCalls(gitTool("q6-close-rapporteur", "close_created_task", originalCreatorClose(body, "q6-close-rapporteur"))),
    body => { assert.match(actualToolReply(body, "q6-close-rapporteur"), /accepted|closed/); return modelCalls(gitTool("q6-product-publish", "dispatch_task", {
      roleId: "product", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q6-product-publish",
      task: `提交实际${chainFlow}六规划文档，生产submit_version_change version-upgrade/baseTrunk:null整单首建；无workflow/D3/卡/执行pin，报告真实回执。`, expectedOutput: "真实首doc null-CAS回执" })); },
    body => { assert.match(actualToolReply(body, "q6-product-publish"), /任务已派发|已受理/); return modelDone("等真实首doc回执，不以候选替发布。" ); },
    body => modelCalls(gitTool("q7-close-document-task", "close_created_task", originalCreatorClose(body, "q7-close-document-task"))),
    body => { assert.match(actualToolReply(body, "q7-close-document-task"), /accepted|closed/); return modelCalls(gitTool("q7-dispatch-plan", "dispatch_task", {
      roleId: "convener", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q7-dispatch-plan", expectedOutput: planPath,
      task: `按真实有效${chainFlow}proposal/modules/roster形成${planPath}并complete_team_plan；不要填未来D3/卡/workflow/pin，报告实际回执。` })); },
    body => { assert.match(actualToolReply(body, "q7-dispatch-plan"), /任务已派发|已受理/); return modelDone("等待真实运营计划，不把文档发布当D3或执行授权。" ); },
    body => modelCalls(gitTool("q8-close-team-plan", "close_created_task", originalCreatorClose(body, "q8-close-team-plan"))),
    body => { const reply = actualToolReply(body, "q8-close-team-plan"); roleProgress("plan-close", reply); assert.match(reply, /accepted|closed/);
      return modelCalls(gitTool("q8-dispatch-nominator", "dispatch_task", { roleId: "nominator", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q8-dispatch-nominator",
        expectedOutput: "真实D3/零文件角色三文档/完整激活回执", task: `依据真实已完成${planPath}和当前roster由客户D3选择impl，从无文件通过write_file准备三文档，再activate_role_documents；不能预填D3/active或绕生产工具。` })); },
    body => { const reply = actualToolReply(body, "q8-dispatch-nominator"); roleProgress("nominator-dispatch", reply); assert.match(reply, /任务已派发|已受理/); return modelDone("等待真实人事选人与激活回执。" ); },
    body => modelCalls(gitTool("q9-close-activation", "close_created_task", originalCreatorClose(body, "q9-close-activation"))),
    async body => { const reply = actualToolReply(body, "q9-close-activation"); await roleProgress("activation-close", reply); assert.match(reply, /accepted|closed/);
      return modelCalls(gitTool("q9-dispatch-workflow", "dispatch_task", { roleId: "convener", flowId: chainFlow, sideEffect: "docs", idempotencyKey: "q9-dispatch-workflow",
        expectedOutput: "真实workflow专门许可写入及执行准备回执", task: "通过生产request_stable_write请求docs/workflow.md专门确认，只有实际许可后才能write_file相同bytes；不能由业务开关代批，不得造workflow/ref/pin。" })); },
    body => { const reply = actualToolReply(body, "q9-dispatch-workflow"); roleProgress("workflow-dispatch", reply); assert.match(reply, /任务已派发|已受理/); return modelDone("等待真实工作流写入许可与回执。" ); },
    body => modelCalls(gitTool("q69-chief-read-project-workflow", "read_file", { path: "docs/workflow.md" }),
      gitTool("q69-chief-query-workflow-source", "git_query", { operationId: "q69-chief-query-workflow-source", template: "log", limit: 1 }),
      gitTool("q11-close-workflow", "close_created_task", originalCreatorClose(body, "q11-close-workflow"))),
    async body => { const reply = actualToolReply(body, "q11-close-workflow"); await roleProgress("workflow-close", reply); assert.match(reply, /accepted|closed/);
      const projectRead = actualToolReply(body, "q69-chief-read-project-workflow"); assert.equal(projectRead, `read_file: docs/workflow.md\n\n${workflowText}`);
      const source = actualObservedGit(body, "q69-chief-query-workflow-source"); assert.ok(isGitBasis(source.basis) && source.basis.oid);
      await roleProgress("chief-project-workflow-read", JSON.stringify({ actualRead: projectRead, actualQuery: source, actualTextSHA256: createHash("sha256").update(workflowText).digest("hex") }));
      return modelCalls(gitTool("q11-dispatch-execution", "dispatch_task", { roleId: "convener", flowId: chainFlow, sideEffect: "code", idempotencyKey: "q11-dispatch-execution",
        expectedOutput: "真实执行freeze/pin及worker正式派发或精确缺口", task: "按当前真实t2/Active1/workflow组织执行；只能生产冻结完整run，再派impl的impl-core模块，不造pin/run/refs/目录写集，不省独立质检。" })); },
    body => { const reply = actualToolReply(body, "q11-dispatch-execution"); roleProgress("execution-dispatch", reply); assert.match(reply, /任务已派发|已受理/); return modelDone("等待运营真实执行前置结果，不把派发当冻结授权。" ); },
  ], product: [
    () => modelCalls(gitTool("q6-write-intent", "write_file", { path: intent, content: `---\nschema: project-intent/v1\nflowId: ${chainFlow}\nintentId: q6-intent\nversion: 1\n---\n# Local text task\nOne worker writes src/impl/result.txt; no external resources.\n` })),
    body => { assert.match(actualToolReply(body, "q6-write-intent"), /已获准并落盘/); return modelCalls(gitTool("q6-report-intent", "submit_report", { status: "completed", summary: "实际产品意图草稿已落盘，等待客户核字节。", evidence: [intent] })); },
    body => { actualToolReply(body, "q6-report-intent"); return modelDone("真实意图草稿已回报。" ); },
    () => modelCalls(gitTool("q6-first-document-submit", "submit_version_change", { operationId: "q6-first-document-submit", kind: "version-upgrade", flowId: chainFlow,
      baseTrunk: null, summary: "真实Git首建后的规划文档整单首提交", targets: Object.keys(documents).map(path => ({ kind: path.includes("roster") ? "roster" : "contract", path, action: "add", expectedFromSha256: null })) })),
    async body => { const reply = actualToolReply(body, "q6-first-document-submit");
      const raw = JSON.parse(reply.slice(reply.indexOf("{"))); documentBasis = raw.receipt?.targetDigest ?? raw.targetDigest;
      await submitted(reply);
      return modelCalls(gitTool("q6-report-document-submit", "submit_report", { status: /applied|committed-pending-recovery/.test(reply) ? "completed" : "blocked",
        summary: `真实文档首提交回执：${reply}`, evidence: Object.keys(documents) })); },
    () => modelDone("首doc原始结果已回报，不伪accepted。"),
  ], rapporteur: [
    () => modelCalls(...Object.entries(documents).map(([path, content], index) => gitTool(`q6-plan-write-${index}`, "write_file", { path, content }))),
    body => { Object.keys(documents).forEach((_, index) => assert.match(actualToolReply(body, `q6-plan-write-${index}`), /已获准并落盘/));
      return modelCalls(gitTool("q6-report-plan", "submit_report", { status: "completed", summary: "实际六份规划落盘；无未来D3/卡/workflow/pin。", evidence: Object.keys(documents) })); },
    () => modelDone("规划草稿真实报告已交创建者。"),
  ], convener: [
    () => modelCalls(gitTool("q7-write-team-plan", "write_file", { path: planPath, content: planText })),
    body => { assert.match(actualToolReply(body, "q7-write-team-plan"), /已获准并落盘/); assert.match(documentBasis ?? "", /^[a-f0-9]{64}$/);
      return modelCalls(gitTool("q7-complete-team-plan", "complete_team_plan", { operationId: "q7-complete-team-plan", flowId: chainFlow,
        baseDigest: documentBasis, plan: { path: planPath, sha256: createHash("sha256").update(planText).digest("hex"), version: 1 } })); },
    async body => { const reply = actualToolReply(body, "q7-complete-team-plan"), receipt: unknown = JSON.parse(reply.slice(reply.indexOf("{")));
      if (receipt && typeof receipt === "object" && "planRef" in receipt && "rosterRef" in receipt && isSnapshotArtifactRef(receipt.planRef) && isSnapshotArtifactRef(receipt.rosterRef))
        planRefs = { planRef: receipt.planRef, rosterRef: receipt.rosterRef };
      await planned(reply); return modelCalls(gitTool("q7-report-team-plan", "submit_report", {
      status: /applied|no-op/.test(reply) ? "completed" : "blocked", summary: `真实完成计划回执：${reply}`, evidence: [planPath] })); },
    () => modelDone("真实计划与回执已交回，不伪造D3或激活。"),
    body => { roleProgress("workflow-tools", JSON.stringify(body.tools?.map(tool => tool.function?.name)));
      assert.ok(body.tools?.some(tool => tool.function?.name === "ans_request_stable_write"), "Q9_REQUIRED_PRODUCTION_REQUEST_STABLE_WRITE_MISSING");
      return modelCalls(gitTool("q9-request-workflow", "request_stable_write", { content: workflowText })); },
    body => { const reply = actualToolReply(body, "q9-request-workflow"); roleProgress("workflow-request", reply); assert.match(reply, /已提交 requestId=.*status=requested/);
      return modelCalls(gitTool("q9-write-workflow", "write_file", { path: "docs/workflow.md", content: workflowText })); },
    async body => { const reply = actualToolReply(body, "q9-write-workflow"); await roleProgress("workflow-write", reply);
      if (diagnosticOnly) return modelDone("真实workflow诊断输出已记录；任务收口尚未完成。" );
      return modelCalls(gitTool("q9-report-workflow", "submit_report", { status: /已获准并落盘/.test(reply) ? "completed" : "blocked", summary: `真实workflow写入回执：${reply}`, evidence: ["docs/workflow.md"] })); },
    () => modelDone("真实workflow回执已报告，不伪造执行pin。"),
    () => modelCalls(gitTool("q11-dispatch-worker", "dispatch_task", { roleId: "impl", flowId: chainFlow, sideEffect: "code", moduleId: "impl-core", idempotencyKey: "q11-dispatch-worker",
      expectedOutput: "src/impl/result.txt及真实测试/报告", task: "仅在应用实际完整冻结run和绑定模块目录后写src/impl/result.txt，报告实际路径；没有冻结/写权就blocked，不自建ref/权限。" })),
    body => { const reply = actualToolReply(body, "q11-dispatch-worker"); roleProgress("worker-dispatch", reply); assert.match(reply, /任务已派发|已受理/); return modelDone("保留真实worker派发结果；尚未独立质检或交付。" ); },
  ], nominator: [
    body => { assert.ok(body.tools?.some(tool => tool.function?.name === "ans_activate_role_documents"));
      return modelCalls(gitTool("q8-d3", "request_choice", { cardKind: "appointment", flowId: chainFlow, title: "选择真实名单项目角色", question: "选择impl执行本地文本模块？", multiple: true, options: [{ id: "impl", label: "Local implementation" }] })); },
    body => { const reply = actualToolReply(body, "q8-d3"); roleProgress("d3", reply);
      d3DecisionId = /D3 裁决 id（decisionId）：([^\s—]+)/.exec(reply)?.[1]; assert.ok(d3DecisionId, `Q8_D3_ACTUAL_DECISION_MISSING ${reply}`);
      return modelCalls(...Object.entries(roleDocuments).map(([path, content], index) => gitTool(`q8-role-draft-${index}`, "write_file", { path, content }))); },
    body => { Object.keys(roleDocuments).forEach((_, index) => { const reply = actualToolReply(body, `q8-role-draft-${index}`); roleProgress(`draft-${index}`, reply); assert.match(reply, /已获准并落盘/); });
      assert.ok(planRefs); assert.ok(d3DecisionId);
      const ref = (path: keyof typeof roleDocuments) => ({ path, sha256: createHash("sha256").update(roleDocuments[path]).digest("hex") });
      return modelCalls(gitTool("q8-activate-role", "activate_role_documents", { operationId: "q8-activate-role", flowId: chainFlow, targetRoleId: "impl", d3DecisionId,
        planRef: planRefs.planRef, rosterRef: planRefs.rosterRef, documents: { card: ref("角色卡/impl/role-card.md"), boundaryMd: ref("角色卡/impl/boundary.md"), boundaryYaml: ref("角色卡/impl/boundary.yaml") } })); },
    async body => { const reply = actualToolReply(body, "q8-activate-role"); await roleProgress("activation", reply); return modelCalls(gitTool("q8-report-activation", "submit_report", {
      status: /applied|no-op/.test(reply) ? "completed" : "blocked", summary: `真实角色激活回执：${reply}`, evidence: Object.keys(roleDocuments) })); },
    () => modelDone("真实角色草稿与激活结果已回报。"),
  ] };
}

test("Q2 real default CodexChat HTTP: chief Git query preserves real metadata and records the actual same-instance surface", { timeout: 15000 }, async () => {
  const queryCaseTag = process.env.ANS_QUERY_CASE_TAG ?? "q2-query"; assert.match(queryCaseTag, /^(?:q2-query|q[1-9]\d{0,5}-read-only)$/);
  const driver = await createRealHttpDriver({ chief: [
    async body => { assert.ok(actualUserInput(body).includes("仅通过git_query")); await observeActualChiefWorkflow(body);
      assert.ok(body.tools?.some(tool => tool.function?.name === "ans_git_query"));
      assert.equal(body.tools?.some(tool => tool.function?.name === "ans_run_shell"), false);
      return modelCalls(gitTool("q2-safe-query", "git_query", { operationId: "q2-query-status", template: "status" })); },
    body => { assert.match(actualToolReply(body, "q2-safe-query"), /observed/); return modelDone("真实受控查询结束；不写Git、不宣称全队隔离。" ); },
  ] }, { tag: queryCaseTag, requestLimit: 8, prepareFixture: async root => {
    // Existing-repo query fixture only; this setup is absent from the true new-project case below.
    await initializeGitRepository(root); await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/query.md"), "query fixture\n");
  } });
  const before = await hashFixtureFiles(driver.root);
  try {
    await driver.openChief(); await driver.sendChief("仅通过git_query查询本地fixture状态。");
    assert.equal(driver.trace.length, 2); assert.deepEqual(driver.errors, []);
    const observation = await driver.observe(), live = observation.inventory.sessions.find(fact => fact.phase === "live" && fact.kind === "role");
    assert.ok(live?.coreSessionId); assert.equal(live.toolSurface?.sessionId, live.coreSessionId);
    // W5（P1.4 §3.5/§4.2）：以下 strict/native 字段断言是**证据生产**事实（PR #72 不变），不是 Git 动作门前提；
    // 本变更后 native/toolSurface 缺失/unknown 不再阻断结构化 Git 动作（写门改动作时授权）。
    assert.equal(live.toolSurface?.factoryProvenance, "default-production");
    assert.equal(live.toolSurface?.nativeToolRegistry, "application-mediated");
    assert.equal(live.toolSurface?.native?.factory, "codex-chat");
    assert.equal(live.toolSurface?.native?.nativeInstanceId, live.lifecycle?.native?.instanceId);
    assert.deepEqual(live.toolSurface?.native?.nativeBuiltinTools, []);
    assert.equal(observation.inventory.coverage, "unknown");
    assert.deepEqual(await hashFixtureFiles(driver.root), before);
  } finally { await driver.save(path.join(evidence, `${queryCaseTag}-proof.json`), { gitMetadataBefore: before }); await driver.dispose();
    await driver.save(path.join(evidence, `${queryCaseTag}-after-cleanup-proof.json`), { gitMetadataBefore: before, phase: "actual dispose and owned writes returned" }); assert.deepEqual(driver.errors, []); }
});

const firstNewBusinessName = "Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards";
const firstNewBusinessTimeoutMs = () => process.env.ANS_Q39_BUSINESS === "1" || (!standaloneBusiness && process.env.ANS_DIRECT_NODETEST !== "1") ? 300000 : (process.env.ANS_Q38_BUSINESS === "1" || process.env.ANS_Q36_BUSINESS === "1" ? 300000 : (process.env.ANS_Q35_BUSINESS === "1" ? 300000 : process.env.ANS_Q34_QUEUE_DIAGNOSTIC === "1" || process.env.ANS_Q33_QUEUE_DIAGNOSTIC === "1" ? 90000 : process.env.ANS_Q32_BUSINESS === "1" || process.env.ANS_Q31_BUSINESS === "1" || process.env.ANS_Q30_BUSINESS === "1" || process.env.ANS_Q29_BUSINESS === "1" || process.env.ANS_Q28_BUSINESS === "1" || process.env.ANS_Q27_BUSINESS === "1" || process.env.ANS_Q26_BUSINESS === "1" ? 300000 : process.env.ANS_Q25_BUSINESS === "1" ? 240000 : process.env.ANS_Q24_BUSINESS === "1" ? 180000 : process.env.ANS_Q23_BUSINESS === "1" ? 180000 : process.env.ANS_Q21_BUSINESS === "1" ? 180000 : process.env.ANS_Q20_PROFILE === "1" ? 90000 : process.env.ANS_Q19_DIAGNOSTIC === "1" ? 120000 : 240000) );
async function runOwnedCompleteBusinessChild() {
  const runNonce = process.env.ANS_HARNESS_RUN_ID ?? randomUUID();
  const caseTag = process.env.ANS_Q39_CASE_TAG ?? `default-new-${runNonce}`;
  assert.match(caseTag, /^[a-z0-9][a-z0-9-]{0,99}$/);
  const started = new Date().toISOString();
  const suppliedOuter = Number(process.env.ANS_HARNESS_WRAPPER_DEADLINE_AT);
  const outerDeadlineAt = Number.isSafeInteger(suppliedOuter) && suppliedOuter > Date.now() ? suppliedOuter : Date.now() + 330000;
  const deadlineAt = Math.min(Date.now() + 300000, outerDeadlineAt - 30000);
  assert.ok(deadlineAt > Date.now(), "No fresh child may extend an exhausted shared budget");
  const source = [fileURLToPath(import.meta.url), path.resolve("test/测试/git-role-workflows-driver.ts")].map(file => ({ file,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }));
  const lifePath = path.join(evidence, `${caseTag}-child-lifecycle.json`);
  const life: { runNonce: string; caseTag: string; parentPid: number; childPid?: number; exe: string; args: string[]; cwd: string; started: string; deadlineAt: number; outerDeadlineAt: number;
    source: typeof source; inputIdentity?: string; watchdogFired: boolean; events: { type: string; at: string; pid?: number; exitCode?: number | null; signal?: string | null; error?: string }[] } = {
      runNonce, caseTag, parentPid: process.pid, exe: process.execPath, args: [fileURLToPath(import.meta.url)], cwd: process.cwd(), started, deadlineAt, outerDeadlineAt, source,
      inputIdentity: process.env.ANS_HARNESS_INPUT_IDENTITY, watchdogFired: false, events: [{ type: "START", at: started }] };
  writeFileSync(lifePath, JSON.stringify(life, null, 2), { flag: "wx" });
  const persist = () => writeFileSync(lifePath, JSON.stringify(life, null, 2));
  const outFd = openSync(path.join(evidence, `${caseTag}-business-child.stdout.log`), "wx"), errFd = openSync(path.join(evidence, `${caseTag}-business-child.stderr.log`), "wx");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, ANS_Q39_BUSINESS: "1", ANS_Q39_CHILD: "1", ANS_Q39_CASE_TAG: caseTag,
      ANS_HARNESS_RUN_ID: runNonce, ANS_HARNESS_ABSOLUTE_DEADLINE_AT: String(deadlineAt), NODE_DISABLE_COMPILE_CACHE: "1" },
    stdio: ["ignore", "pipe", "pipe"] });
  let spawnError: string | undefined;
  child.once("spawn", () => { life.childPid = child.pid; life.events.push({ type: "SPAWN", at: new Date().toISOString(), pid: child.pid }); persist();
    process.stdout.write(`Q_OWNED_BUSINESS_CHILD_SPAWN ${JSON.stringify({ runNonce, caseTag, parentPid: process.pid, childPid: child.pid, deadlineAt, outerDeadlineAt })}\n`); });
  child.stdout.on("data", bytes => { writeSync(outFd, bytes); process.stdout.write(bytes); });
  child.stderr.on("data", bytes => { writeSync(errFd, bytes); process.stderr.write(bytes); });
  child.once("error", error => { spawnError = String(error); life.events.push({ type: "ERROR", at: new Date().toISOString(), error: spawnError }); persist(); });
  child.once("exit", (exitCode, signal) => { life.events.push({ type: "EXIT", at: new Date().toISOString(), exitCode, signal }); persist(); });
  const watchdog = setTimeout(() => { life.watchdogFired = true; life.events.push({ type: "SHARED_DEADLINE", at: new Date().toISOString(), pid: child.pid }); persist(); child.kill("SIGTERM"); }, Math.max(1, deadlineAt - Date.now()));
  try {
    await new Promise<void>(resolve => child.once("close", (exitCode, signal) => { life.events.push({ type: "CLOSE", at: new Date().toISOString(), exitCode, signal }); persist(); resolve(); }));
  } finally { clearTimeout(watchdog); closeSync(outFd); closeSync(errFd); }
  assert.equal(spawnError, undefined); assert.equal(life.watchdogFired, false, "Owned child exceeded the same absolute business budget");
  for (const type of ["EXIT", "CLOSE"]) {
    const row = life.events.find(event => event.type === type); assert.ok(row); assert.equal(row.exitCode, 0); assert.equal(row.signal, null);
  }
  const childStart = JSON.parse(readFileSync(path.join(evidence, `${caseTag}-child-start.json`), "utf8"));
  const result = JSON.parse(readFileSync(path.join(evidence, `${caseTag}-child-result.json`), "utf8"));
  for (const record of [childStart, result]) {
    assert.equal(record.runNonce, runNonce); assert.equal(record.caseTag, caseTag); assert.equal(record.pid, child.pid);
    assert.equal(record.parentPid, process.pid);
    assert.equal(record.deadlineAt, deadlineAt); assert.deepEqual(record.source, source); assert.equal(record.inputIdentity, life.inputIdentity);
    assert.equal(record.nodeTestRuntimeLoaded, false); assert.equal(record.registeredTestCount, 0);
  }
  assert.equal(result.completed, true);
  const completedPath = path.join(evidence, `${caseTag}-new-delivery-controller-closed.json`), completedBytes = readFileSync(completedPath);
  assert.equal(result.completedProof.path, completedPath); assert.equal(result.completedProof.sha256, createHash("sha256").update(completedBytes).digest("hex"));
  const finalPath = path.join(evidence, `${caseTag}-full-final-proof.json`), finalBytes = readFileSync(finalPath);
  assert.equal(result.finalProof.path, finalPath); assert.equal(result.finalProof.sha256, createHash("sha256").update(finalBytes).digest("hex"));
  const postPath = path.join(evidence, `${caseTag}-after-cleanup-proof.json`), postBytes = readFileSync(postPath);
  assert.equal(result.postCleanupProof.path, postPath); assert.equal(result.postCleanupProof.sha256, createHash("sha256").update(postBytes).digest("hex"));
  const post = JSON.parse(postBytes.toString("utf8")); assert.equal(post.root, result.root); assert.deepEqual(post.errors, []);
  for (const key of ["pendingOpens", "activeDeliveries", "queuedDispatches"]) assert.deepEqual(post.observation.inventory[key], []);
  const completed = JSON.parse(completedBytes.toString("utf8")), final = JSON.parse(finalBytes.toString("utf8"));
  assert.equal(completed.root, result.root); assert.equal(final.root, result.root); assert.deepEqual(final.errors, []);
  const inventory = completed.observation.inventory; assert.deepEqual(inventory.pendingOpens, []); assert.deepEqual(inventory.activeDeliveries, []); assert.deepEqual(inventory.queuedDispatches, []);
  const chief = inventory.sessions.find((session: { roleId: string; phase: string }) => session.roleId === "chief" && session.phase === "live");
  assert.equal(chief?.lifecycle?.status, "quiescent"); assert.equal(chief.lifecycle.providerFinished, true);
  assert.ok(isGitCapabilityResult(completed.extra.publishedDelivery) && completed.extra.publishedDelivery.status === "published");
  for (const [key, creator] of [["q11-dispatch-execution", "chief"], ["q23-dispatch-verifier", "chief"]]) {
    const task = completed.extra.terminal.tasks.find((task: { created?: { idempotencyKey?: string } }) => task.created?.idempotencyKey === key);
    assert.equal(task?.closed?.outcome, "accepted"); assert.equal(task.closed.by, creator); assert.equal(task.created.from, creator);
  }
  assert.ok(completed.extra.customerDeliveryText && completed.events.some((row: { roleId?: string; event?: { kind?: string; summary?: string } }) => row.roleId === "chief" && row.event?.kind === "message" && row.event.summary === completed.extra.customerDeliveryText));
  writeFileSync(path.join(evidence, `${caseTag}-parent-verified-child.json`), JSON.stringify({ at: new Date().toISOString(), runNonce, parentPid: process.pid,
    childPid: child.pid, caseTag, completed: true, deadlineAt, outerDeadlineAt, source, result, childLifecycle: life }, null, 2), { flag: "wx" });
  const parentProofPath = path.join(evidence, `${caseTag}-parent-verified-child.json`);
  writeFileSync(path.join(evidence, `${caseTag}-clean-delivery-seed.json`), JSON.stringify({ schema: "qa-owned-delivered-seed/v1", clean: true,
    at: new Date().toISOString(), caseTag, runNonce, root: result.root, published: completed.extra.publishedDelivery,
    parentProof: { path: parentProofPath, sha256: createHash("sha256").update(readFileSync(parentProofPath)).digest("hex") },
    postCleanupProof: result.postCleanupProof, source, inputIdentity: life.inputIdentity }, null, 2), { flag: "wx" });
}

export async function runFirstNewBusinessCase() {
  if (!standaloneBusiness && process.env.ANS_DIRECT_NODETEST !== "1") { await runOwnedCompleteBusinessChild(); return; }
  const suppliedDeadlineAt = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT);
  const caseDeadlineAt = Number.isSafeInteger(suppliedDeadlineAt) ? Math.min(Date.now() + firstNewBusinessTimeoutMs(), suppliedDeadlineAt) : Date.now() + firstNewBusinessTimeoutMs();
  assert.ok(caseDeadlineAt > Date.now());
  const q39Business = process.env.ANS_Q39_BUSINESS === "1";
  const q19Diagnostic = process.env.ANS_Q19_DIAGNOSTIC === "1";
  const q20Profile = process.env.ANS_Q20_PROFILE === "1";
  const q38Business = process.env.ANS_Q38_BUSINESS === "1";
  const q36Business = process.env.ANS_Q36_BUSINESS === "1";
  const q35Business = process.env.ANS_Q35_BUSINESS === "1" || q36Business || q38Business || q39Business;
  const q34QueueDiagnostic = process.env.ANS_Q34_QUEUE_DIAGNOSTIC === "1";
  const q33QueueDiagnostic = process.env.ANS_Q33_QUEUE_DIAGNOSTIC === "1" || q34QueueDiagnostic;
  const q32Business = process.env.ANS_Q32_BUSINESS === "1" || q33QueueDiagnostic || q35Business;
  const q31Business = process.env.ANS_Q31_BUSINESS === "1" || q32Business;
  const q30Business = process.env.ANS_Q30_BUSINESS === "1" || q31Business;
  const q29Business = process.env.ANS_Q29_BUSINESS === "1" || q30Business;
  const q28Business = process.env.ANS_Q28_BUSINESS === "1" || q29Business;
  const q27Business = process.env.ANS_Q27_BUSINESS === "1" || q28Business;
  const q26Business = process.env.ANS_Q26_BUSINESS === "1" || q27Business;
  const q25Business = process.env.ANS_Q25_BUSINESS === "1" || q26Business;
  const q24Business = process.env.ANS_Q24_BUSINESS === "1" || q25Business;
  const q23Business = process.env.ANS_Q23_BUSINESS === "1" || q24Business;
  const q21Business = process.env.ANS_Q21_BUSINESS === "1" || q23Business;
  const caseTag = process.env.ANS_Q39_CASE_TAG ?? (q39Business ? "q39" : q38Business ? "q38" : q36Business ? "q36" : q35Business ? "q35" : q34QueueDiagnostic ? "q34" : q33QueueDiagnostic ? "q33" : q32Business ? "q32" : q31Business ? "q31" : q30Business ? "q30" : q29Business ? "q29" : q28Business ? "q28" : q27Business ? "q27" : q26Business ? "q26" : q25Business ? "q25" : q24Business ? "q24" : q23Business ? "q23" : q21Business ? "q21" : q20Profile ? "q20" : q19Diagnostic ? "q19" : "q17");
  const timerDiagnostics = q19Diagnostic ? observeDiagnosticTimers() : undefined;
  // Q17 none-isolation runner after exact current-parent blocked-report wait handling; one attempt: 192 HTTP/240s whole test/90s wait,
  // no retry, expected <=144 through actual first pin/persisted child/worker open.
  const diagnosticOnly = false;
  let handoffReply: string | undefined, initReply: string | undefined;
  let actualSource: unknown;
  let initializationReadback: unknown;
  let initHandoff: string | undefined, initCloseReply: string | undefined;
  let firstDocumentReply: string | undefined;
  let firstDocumentReadback: unknown;
  let planReply: string | undefined;
  let planReadback: unknown;
  const roleProgress: { stage: string; reply: string }[] = [];
  let workerCandidateReceipt: GitCapabilityResult | undefined;
  let controllerCandidate: GitOid | undefined;
  let controllerTerminalSummary: string | undefined;
  let chiefReceivedController: { controller: VisibleHubController; operationId: string; candidate: GitOid } | undefined;
  let chiefReceivedQuality: { candidate: GitOid; criteria: GitEvidenceRef[]; evidence: GitEvidenceRef[]; qualityPath: string } | undefined;
  let publishedDelivery: GitCapabilityResult | undefined, deliveryTargetRef: string | undefined, customerDeliveryText: string | undefined;
  let verifierBasis: TaskReviewBasisRef | undefined, verifierCriterionText: string | undefined, verifierOutputText: string | undefined;
  let verifierNegativeReply: string | undefined, verifierEvidenceContent: string | undefined;
  let verifierTaskIdentity: { taskId: string; runId: string; flowId: string } | undefined;
  let verifiedWorkerCreatorReceipt: unknown;
  const verifierEvidencePath = "docs/quality/q2-new-report-v1.md";
  const finishVerifierReport = (body: Parameters<typeof actualToolReply>[0]) => {
    if (body.messages.findLast(message => message.role === "tool")?.tool_call_id !== "q25-verifier-report") return undefined;
    actualToolReply(body, "q25-verifier-report"); roleProgress.push({ stage: "verifier-formal-report-returned", reply: "actual independently checked criterion/OID/gate/evidence report submitted" });
    return modelDone("最终OID与冻结criterion的实际核对、实施目录拒写和自属证据结果已正式报告，未代原创建者收口或发布。" );
  };
  let activationReadback: unknown;
  let activationCloseReadback: unknown;
  let workflowReadback: unknown;
  let workflowCloseReadback: unknown;
  let releaseWorkflowObservation!: () => void;
  const workflowObservation = new Promise<void>(resolve => { releaseWorkflowObservation = resolve; });
  let releaseWorkflowCloseObservation!: () => void;
  const workflowCloseObservation = new Promise<void>(resolve => { releaseWorkflowCloseObservation = resolve; });
  let releaseActivationObservation!: () => void;
  const activationObservation = new Promise<void>(resolve => { releaseActivationObservation = resolve; });
  let releaseActivationCloseObservation!: () => void;
  const activationCloseObservation = new Promise<void>(resolve => { releaseActivationCloseObservation = resolve; });
  let releasePlanObservation!: () => void;
  const planObservation = new Promise<void>(resolve => { releasePlanObservation = resolve; });
  let releaseDocumentObservation!: () => void;
  const documentObservation = new Promise<void>(resolve => { releaseDocumentObservation = resolve; });
  const materials = postInitMaterials("q2-new", async reply => { firstDocumentReply = reply; await documentObservation; },
    async reply => { planReply = reply; await planObservation; }, async (stage, reply) => { roleProgress.push({ stage, reply });
      if (stage === "activation") await activationObservation;
      if (stage === "activation-close") await activationCloseObservation;
      if (stage === "workflow-write") await workflowObservation;
      if (stage === "workflow-close") await workflowCloseObservation;
    }, diagnosticOnly);
  // Each real role reply/validated app notice can produce one governance relay.
  // Unknown or repeated relays fail; these acknowledgements never consume a task handback.
  const feedback = new Set([
    ["运营", "保留实际首建回执，不生成未来授权。"],
    ["产品", "真实意图草稿已回报。"],
    ["策划", "规划草稿真实报告已交创建者。"],
    ...["q6-close-product-draft", "q6-close-rapporteur", "q7-close-document-task", "q8-close-team-plan", "q9-close-activation", "q11-close-workflow", "q21-close-worker", "q25-close-verifier", "q25-close-controller", "q26-close-controller"].map(op => ["运营", `只确认收到实际${op}收口通知，不重复执行。`]),
    ...["运营", "产品"].map(role => [role, "已核同operation/application/digest的首doc通知，不额外授权。"]),
    ["产品", "首doc原始结果已回报，不伪accepted。"],
    ["运营", "只确认真实同operation计划通知，不把它当D3。"],
    ["运营", "真实计划与回执已交回，不伪造D3或激活。"],
    ["人事", "真实角色草稿与激活结果已回报。"],
    ...["运营", "人事"].map(role => [role, "只确认同op已提交的真实激活通知，不额外派工。"]),
    ["运营", "真实workflow回执已报告，不伪造执行pin。"],
    ["运营", "真实workflow诊断输出已记录；任务收口尚未完成。"],
    ["运营", "保留真实worker派发结果；尚未独立质检或交付。"],
    ["运营", "真实worker候选或基线缺口已收到；保持阻塞，未关闭或验收。"],
    ["运营", "已派发真实独立verifier；等待实际质量报告，未批准或发布。"],
    ["运营", "实际集成候选已正式交Chief选择质检；未创建Verifier、未验收或发布，原controller保持live。"],
    ["质检", "最终OID与冻结criterion的实际核对、实施目录拒写和自属证据结果已正式报告，未代原创建者收口或发布。"],
    ["运营", "Q25实际独立质检phase和真实收口结果已回报；整体发布未完成，父任务仍live，不代交付。"],
    ["运营", "真实delivery发布及核对结果已正式报告；等待chief原创建者收口，不代最终接受。"],
  ].map(([role, message]) => `${role}\n${message}`));
  const seenNotices = new Set<string>();
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>;
  const consumeControllerPublish: HttpScripts[string][number] = async body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q26-publish-delivery") {
        const reply = actualToolReply(body, "q26-publish-delivery"), result: unknown = JSON.parse(reply.slice(reply.indexOf("{"))); assert.ok(isGitCapabilityResult(result));
        roleProgress.push({ stage: "actual-delivery-publish-result", reply });
        if (result.status === "published") {
          assert.equal(result.published?.ref, deliveryTargetRef); assert.deepEqual(result.published?.oid, controllerCandidate);
          const git = createGitCandidateStore(driver.root), actualRef = await git.readRef(result.published!.ref), journal = await createGitRefStore(driver.root).readJournal(result.operationId);
          assert.deepEqual(actualRef, controllerCandidate); assert.ok(journal); assert.equal(journal.phase, "published");
          assert.ok(controllerCandidate); const commit = await git.readCommit(controllerCandidate);
          publishedDelivery = result; await driver.save(path.join(evidence, `${caseTag}-first-physical-delivery.json`), { result, actualRef, journal, commit, roleProgress });
          process.stdout.write(`Q_DELIVERY_PUBLISHED ${JSON.stringify({ at: new Date().toISOString(), ref: result.published?.ref, oid: actualRef, journalId: result.journalId })}\n`);
          controllerTerminalSummary = `Q26实际delivery已published ${result.published!.ref}@${actualRef!.hex}，独立quality与原creator已accepted。`;
        } else controllerTerminalSummary = `Q26实际delivery未published：${reply}`;
        return modelCalls(gitTool("q26-controller-delivery-report", "submit_report", { status: result.status === "published" ? "completed" : "blocked", summary: controllerTerminalSummary,
          evidence: [verifierEvidencePath, `Git operation ${result.operationId}`, ...(controllerCandidate ? [`Git candidate ${controllerCandidate.objectFormat}:${controllerCandidate.hex}`] : [])] }));
      }
      assert.fail("UNKNOWN_RESUMED_CONTROLLER_PUBLISH_RESULT"); };
  const resumeControllerPublish: HttpScripts[string][number] = async body => {
    const input = actualUserInput(body), json = /【交付依据】(\{[^\n]+\})/.exec(input)?.[1];
    assert.ok(json, "Actual resumed controller input must expose the Chief delivery material");
    const material: unknown = JSON.parse(json); assert.ok(isVisibleHubDelivery(material));
    const issuedTurn = driver.trace.findLast(turn => turn.role === "chief" && turn.reply?.tool_calls?.some(call => call.id === "q48-resume-controller"));
    const issuedCall = issuedTurn?.reply?.tool_calls?.find(call => call.id === "q48-resume-controller"); assert.ok(issuedCall);
    const issued = JSON.parse(issuedCall.function.arguments);
    assert.ok(input.includes(issued.task));
    assert.deepEqual(issued.resumeController, { ...material.controller, reviewTaskId: material.reviewTaskId, reviewCloseOperationId: material.reviewCloseOperationId });
    const actual = await driver.observe(), controller = actual.tasks.find(task => task.taskId === material.controller.taskId), review = actual.tasks.find(task => task.taskId === material.reviewTaskId);
    assert.ok(controller?.created && review?.created && review.closed); assert.equal(controller.closed, undefined);
    assert.equal(controller.created.from, "chief"); assert.equal(controller.created.to, "convener");
    assert.equal(controller.created.flowId, material.controller.flowId); assert.equal(controller.created.runId, material.controller.runId);
    assert.equal(review.created.from, "chief"); assert.equal(review.closed.by, "chief"); assert.equal(review.closed.outcome, "accepted"); assert.equal(review.closed.operationId, material.reviewCloseOperationId);
    assert.ok(isTaskReviewControllerRef(review.created.reviewControllerRef)); assert.equal(review.created.reviewControllerRef.taskId, controller.taskId);
    assert.deepEqual(review.created.reviewControllerRef.reviewBasisRef.candidate, material.candidate); assert.deepEqual(review.created.reviewControllerRef.reviewBasisRef.criteria, material.criteria);
    assert.deepEqual(material.candidate, controllerCandidate, "Only a cross-check: actual publish selector comes from received Chief material");
    deliveryTargetRef = `refs/ans/delivery/${material.controller.flowId}`;
    assert.equal(await createGitCandidateStore(driver.root).readRef(deliveryTargetRef), null, "First NEW delivery uses actual absence, never the code basis");
    roleProgress.push({ stage: "controller-actual-chief-resume", reply: JSON.stringify({ actualInput: input, issued, actualController: controller, acceptedReview: review, receivedMaterial: material }) });
    await driver.save(path.join(evidence, `${caseTag}-first-real-controller-resume.json`), { actualInput: input, issued, controller, review, material });
    return modelCalls(gitTool("q26-publish-delivery", "git_publish", { operationId: "q26-publish-delivery", target: "delivery", expected: { ref: deliveryTargetRef, oid: null },
      candidate: material.candidate, criteria: material.criteria, evidence: material.evidence, creatorCloseOperationId: material.reviewCloseOperationId }));
  };
  const hubConvenerMaterials = materials.convener!.map((step, index): HttpScripts[string][number] => index === 8 ? async body => {
    if (actualUserInput(body).includes("【交付依据】")) return resumeControllerPublish(body);
    return step(body);
  } : index === 9 ? body => body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q26-publish-delivery"
    ? consumeControllerPublish(body) : step(body) : step);
  driver = await createRealHttpDriver({ chief: [
    async body => { const actualChiefWorkflow = await observeActualChiefWorkflow(body);
      await driver.save(path.join(evidence, `${caseTag}-actual-chief-workflow-context.json`), { actualChiefWorkflow });
      return modelCalls(gitTool("q2-real-bootstrap-dispatch", "dispatch_task", { roleId: "convener", flowId: "q2-new", sideEffect: "docs",
      idempotencyKey: "q2-empty-bootstrap-convener", expectedOutput: "受控Git首建的真实回执或精确阻塞",
      task: "客户要求在此真正空项目新建一个本地文本应用。请按真实host判断无仓库/根归属，经git_candidate init建立受控首候选，再按缺口组织产品/策划；不得预塞未来计划/D3/卡/workflow/pin或自报bootstrap授权。" })); },
    body => { handoffReply = actualToolReply(body, "q2-real-bootstrap-dispatch"); return modelDone("按实际派发回执继续；拒绝则保留第一阻点，不造状态绕过。" ); },
    body => {
      initHandoff = String(body.messages.findLast(message => message.role === "user")?.content);
      if (initHandoff.includes("[应用绑定的原创建者收口依据]"))
        return modelCalls(gitTool("q5-close-physical-init", "close_created_task", originalCreatorClose(body, "q5-close-physical-init")));
      return modelDone("实际首建报告缺少应用绑定收口依据；保持未收口，不假造reportRef或future规划材料来释放依赖。" );
    },
    body => { initCloseReply = actualToolReply(body, "q5-close-physical-init"); assert.match(initCloseReply, /accepted|closed/); return materials.chief![0]!(body); },
    ...materials.chief!.slice(1),
    async body => {
      const text = actualUserInput(body), observation = await driver.observe();
      const parent = observation.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-execution"); assert.ok(parent?.created);
      assert.equal(parent.created.from, "chief"); assert.equal(parent.created.to, "convener"); assert.equal(parent.created.flowId, "q2-new"); assert.equal(parent.closed, undefined);
      const report = parent.reports.at(-1); assert.ok(report); assert.equal(report.from, "convener"); assert.ok(report.turnId);
      if (publishedDelivery?.status === "published" && report.status === "done" && report.summary.startsWith("Q26实际delivery已published")) {
        assert.ok(text.includes(report.summary));
        return modelCalls(gitTool("q26-close-controller", "close_created_task", originalCreatorClose(body, "q26-close-controller")));
      }
      if (report.status === "blocked" && text.includes("Q48实际集成候选已prepared")) {
        const operationId = /Git operation ([^\s]+)/.exec(text)?.[1], taskId = /Controller task ([^\s]+)/.exec(text)?.[1];
        const run = /Controller flow ([^\s]+) run ([^\s]+)/.exec(text); assert.ok(operationId && taskId && run);
        const candidate = visibleCandidate(text);
        assert.equal(taskId, parent.taskId); assert.equal(run[1], parent.created.flowId); assert.equal(run[2], parent.created.runId);
        if (report.evidence !== undefined) {
          for (const claim of report.evidence.filter(item => item.startsWith("Git operation "))) assert.equal(claim, `Git operation ${operationId}`);
          for (const claim of report.evidence.filter(item => item.startsWith("Git candidate "))) assert.deepEqual(visibleCandidate(claim), candidate);
        }
        assert.deepEqual(candidate, controllerCandidate, "Shared harness state is a cross-check, never Chief's target selector");
        const source = driver.events.find(event => { const raw = JSON.stringify(event); return raw.includes('"origin":"submitted-report"')
          && raw.includes(`"taskId":${JSON.stringify(taskId)}`) && raw.includes(`"turnId":${JSON.stringify(report.turnId)}`) && raw.includes('"roleId":"convener"'); });
        assert.ok(source, "Chief must actually receive this Convener formal report");
        chiefReceivedController = { controller: { taskId, flowId: run[1]!, runId: run[2]! }, operationId, candidate };
        roleProgress.push({ stage: "chief-visible-controller-review-target", reply: JSON.stringify({ actualInput: text, selected: chiefReceivedController, source }) });
        return modelCalls(gitTool("q23-dispatch-verifier", "dispatch_task", { roleId: "verifier", flowId: run[1], sideEffect: "code", idempotencyKey: "q23-dispatch-verifier",
          reviewTarget: { operationId, candidate }, task: `独立核实际报告指定的${candidate.objectFormat}:${candidate.hex}及宿主冻结标准；质量结果正式回Chief，不自行发布或批准。`, expectedOutput: "真实最终CID/criteria独立报告" }));
      }
      assert.equal(report.status, "blocked");
      if (controllerTerminalSummary && /^Q2[356]/.test(report.summary)) {
        assert.ok(text.includes(report.summary));
        const full = controllerTerminalSummary.replaceAll(/\s+/g, " ");
        assert.ok(full.startsWith(report.summary.replace(/…$/, "")) || report.summary === full, "Q23_CONTROLLER_REPORT_SUMMARY_UNBOUND");
        const source = driver.events.find(event => { const raw = JSON.stringify(event); return raw.includes('"kind":"handback"') && raw.includes('"origin":"submitted-report"')
          && raw.includes(`"taskId":${JSON.stringify(parent.taskId)}`) && raw.includes(`"turnId":${JSON.stringify(report.turnId)}`) && raw.includes('"roleId":"convener"'); });
        assert.ok(source, "Q23_CONTROLLER_FORMAL_REPORT_SOURCE_UNBOUND");
        roleProgress.push({ stage: "chief-controller-blocked-report-received", reply: JSON.stringify({ currentAppRoot: driver.root, parent, source, actualInput: text }) });
        return modelDone("已收到真实控制任务阻塞报告；候选不等验收，未关闭或批准，等待有权角色修复实际缺口。" );
      }
      const reviewer = observation.tasks.find(task => task.created?.idempotencyKey === "q23-dispatch-verifier");
      if (reviewer?.created && !reviewer.closed && report.summary === "本轮未提交正式任务报告，尚不能确认任务完成。本轮没有可定位的产物证据。") {
        assert.equal(reviewer.created.from, "chief"); assert.equal(reviewer.created.to, "verifier"); assert.equal(reviewer.created.runId, parent.created.runId);
        assert.ok(isTaskReviewBasisRef(reviewer.created.reviewBasisRef)); assert.deepEqual(reviewer.created.reviewBasisRef.candidate, controllerCandidate);
        assert.ok(driver.trace.some(turn => turn.role === "chief" && turn.reply?.content === "Chief已派发真实独立Verifier，等待正式报告，不把派发当验收。"));
        roleProgress.push({ stage: "chief-waiting-actual-verifier", reply: JSON.stringify({ parent, reviewer, actualInput: text }) });
        return modelDone("等待已经真实成立的verifier任务；父阻塞报告不等完成，未关闭或批准。" );
      }
      assert.equal(report.summary, "本轮未提交正式任务报告，尚不能确认任务完成。本轮没有可定位的产物证据。");
      const expected = `[工作结果] 已收到 1 份角色结果。\n任务：#${parent.taskId}\n来源角色：convener\n状态：blocked\n摘要：${report.summary}\n证据：\n  - 无可验收证据；需要原角色补充，不能推定通过。\n\n请核对工作结果并向客户汇总：实际完成了什么、产物路径、实际测试结果、哪些未完成或需返工，以及下一步。\n只有证据支持才确认通过；blocked/failed 或未报告不得当作完成。工作结果不构成任何写权或验收结论。\n\n[收口依据尚不可用] Task does not belong to this run's frozen roster`;
      assert.ok(text.startsWith(expected.split("\n\n[收口依据尚不可用]")[0]), "Q21_PARENT_BLOCKED_REPORT_BINDING_MISMATCH");
      const child = observation.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker"); assert.ok(child?.created);
      assert.equal(child.created.from, "convener"); assert.equal(child.created.to, "impl"); assert.equal(child.created.flowId, parent.created.flowId);
      assert.equal(child.created.runId, parent.created.runId); assert.equal(child.created.runState, "pinned"); assert.equal(child.closed, undefined);
      assert.ok(isTaskParentRef(child.created.parentTaskRef)); assert.equal(child.created.parentTaskRef.taskId, parent.taskId);
      assert.ok(child.created.runId); const run = await createProjectTrunkStore(driver.root).readRunRecord!(child.created.runId); assert.ok(run.ok); assert.equal(run.value.value.state, "pinned");
      const actualEvent = driver.events.find(event => { const raw = JSON.stringify(event); return raw.includes('"kind":"handback"') && raw.includes('"origin":"terminal-fallback"')
        && raw.includes(`"taskId":${JSON.stringify(parent.taskId)}`) && raw.includes(`"turnId":${JSON.stringify(report.turnId)}`) && raw.includes('"roleId":"convener"') && raw.includes('"runtime":"codex"'); });
      assert.ok(actualEvent, "Q17_ACTUAL_TERMINAL_FALLBACK_SOURCE_UNBOUND");
      roleProgress.push({ stage: "chief-blocked-parent-wait-ack", reply: JSON.stringify({ currentAppRoot: driver.root, parentTaskId: parent.taskId, latestReport: report,
        actualSourceEvent: actualEvent, childTaskId: child.taskId, childParentRef: child.created.parentTaskRef, flowId: child.created.flowId, runId: child.created.runId, runSha256: run.value.sha256,
        permissionOrCloseIssued: false, disposition: "wait for already persisted worker; parent blocked report is not completion" }) });
      return modelDone("运营当前报告为阻塞，不能当完成或验收；已成立的worker继续等待实际结果，未关闭父任务、未批准或重派。" );
    },
    async body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q23-dispatch-verifier") {
        const reply = actualToolReply(body, "q23-dispatch-verifier"); assert.match(reply, /已受理|已派发/, reply);
        return modelDone("Chief已派发真实独立Verifier，等待正式报告，不把派发当验收。");
      }
      const reply = actualToolReply(body, "q26-close-controller"), parent = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-execution"); assert.ok(parent);
      roleProgress.push({ stage: "chief-parent-close-result", reply });
      await driver.save(path.join(evidence, `${caseTag}-chief-parent-real-close.json`), { parent, actualReply: reply, publishedDelivery });
      if (parent.closed?.outcome !== "accepted" || parent.closed.by !== "chief") return modelDone("发布已真实发生，但父任务原创建者收口尚未accepted；原回执已保存，不冒整体交付完成。" );
      assert.ok(publishedDelivery?.published?.oid); customerDeliveryText = `本次NEW已实际发布 ${publishedDelivery.published.ref}@${publishedDelivery.published.oid.hex}；独立质检与原创建者收口已有真实证据。`;
      return modelDone(customerDeliveryText);
    },
    async body => {
      const input = actualUserInput(body), actual = await driver.observe(), reviewer = actual.tasks.find(task => task.created?.idempotencyKey === "q23-dispatch-verifier");
      assert.ok(reviewer?.created); const report = reviewer.reports.at(-1); assert.ok(report);
      assert.equal(reviewer.created.from, "chief"); assert.equal(reviewer.created.to, "verifier"); assert.ok(input.includes(reviewer.taskId) && input.includes(report.summary));
      assert.equal(report.status, "done", `ACTUAL_REVIEW_NOT_DONE ${input}`); assert.ok(chiefReceivedController);
      const candidate = visibleCandidate(input), criteria = visibleEvidence(input, "criterion"), evidence = visibleEvidence(input, "artifact");
      assert.ok(criteria.length && evidence.length, "Chief report must expose actual frozen criteria and final blob evidence");
      assert.deepEqual(candidate, chiefReceivedController.candidate); assert.ok(isTaskReviewControllerRef(reviewer.created.reviewControllerRef));
      assert.equal(reviewer.created.reviewControllerRef.taskId, chiefReceivedController.controller.taskId);
      assert.deepEqual(criteria, reviewer.created.reviewControllerRef.reviewBasisRef.criteria);
      const qualityPath = /docs\/quality\/[^\s]+-report-v1\.md/.exec(input)?.[0];
      assert.ok(qualityPath, "CHIEF_VISIBLE_QUALITY_PATH_INFORMATION_GAP"); assert.equal(qualityPath, verifierEvidencePath);
      chiefReceivedQuality = { candidate, criteria, evidence, qualityPath };
      roleProgress.push({ stage: "chief-visible-quality-report", reply: JSON.stringify({ actualInput: input, selected: chiefReceivedQuality, task: reviewer }) });
      return modelCalls(gitTool("q25-close-verifier", "close_created_task", originalCreatorClose(body, "q25-close-verifier")));
    },
    async body => {
      const reply = actualToolReply(body, "q25-close-verifier"), raw = JSON.parse(reply.slice(reply.indexOf("{")));
      assert.equal(raw.ok, true, reply); assert.equal(raw.status, "applied", reply); assert.equal(raw.operationId, "q25-close-verifier");
      const selectedController = chiefReceivedController, selectedQuality = chiefReceivedQuality;
      assert.equal(typeof raw.taskId, "string", "ACTUAL_REVIEW_CLOSE_TASK_ID_INFORMATION_GAP");
      assert.ok(selectedController, "CHIEF_VISIBLE_CONTROLLER_INFORMATION_GAP");
      assert.ok(selectedQuality, "CHIEF_VISIBLE_QUALITY_INFORMATION_GAP");
      const actual = await driver.observe(), reviewer = actual.tasks.find(task => task.taskId === raw.taskId), controller = actual.tasks.find(task => task.taskId === selectedController.controller.taskId);
      assert.ok(reviewer?.created && reviewer.closed && controller?.created); assert.equal(reviewer.created.from, "chief"); assert.equal(reviewer.closed.by, "chief");
      assert.equal(reviewer.closed.outcome, "accepted"); assert.equal(reviewer.closed.operationId, raw.operationId); assert.equal(controller.closed, undefined);
      const material: VisibleHubDelivery = { controller: selectedController.controller, candidateOperationId: selectedController.operationId,
        candidate: selectedQuality.candidate, criteria: selectedQuality.criteria, evidence: selectedQuality.evidence, qualityPath: selectedQuality.qualityPath,
        reviewTaskId: raw.taskId, reviewCloseOperationId: raw.operationId };
      const resumeController = { ...material.controller, reviewTaskId: raw.taskId, reviewCloseOperationId: raw.operationId };
      await driver.save(path.join(evidence, `${caseTag}-verifier-real-close-result.json`), { reviewer, actualReply: reply, resumeController, visibleMaterial: material });
      roleProgress.push({ stage: "verifier-real-creator-close", reply });
      return modelCalls(gitTool("q48-resume-controller", "dispatch_task", { roleId: "convener", flowId: material.controller.flowId, sideEffect: "code", idempotencyKey: "q48-resume-controller",
        resumeController, task: `Chief明确续接原运营任务；仅按真实质量回执核对后发布，不能新建或重派worker。\n【交付依据】${JSON.stringify(material)}`,
        expectedOutput: "原controller真实delivery发布/正式报告，未发布前不完成父任务" }));
    },
    body => { const reply = actualToolReply(body, "q48-resume-controller"); assert.match(reply, /已受理|已入队|已投递|已续接/, reply);
      roleProgress.push({ stage: "chief-resume-controller-request-receipt", reply }); return modelDone("已明确请求续接仍live的原运营任务；等待真实送达、发布和正式报告，不把受理当交付完成。"); },
  ], product: materials.product!, rapporteur: materials.rapporteur!,
  ...Object.fromEntries(["chief", "convener", "product", "nominator"].map(role => [`${role}:application-notice`,
    [async body => {
      const notice = actualApplicationNotice(body); assert.ok(notice, "Missing actual application notice");
      const noticeKey = `${role}\n${notice}`; assert.equal(seenNotices.has(noticeKey), false, `REPEATED_APPLICATION_NOTICE ${noticeKey}`); seenNotices.add(noticeKey);
      const closed = /^\[应用·文档更新\] close-created-task (q5-close-physical-init|q6-close-product-draft|q6-close-rapporteur|q7-close-document-task|q8-close-team-plan|q9-close-activation|q11-close-workflow|q21-close-worker|q25-close-verifier|q25-close-controller|q26-close-controller) (applied|no-op); ([a-f0-9]{64})$/.exec(notice);
      if (closed) {
        assert.ok(role === "chief" || role === "convener");
        const task = (await driver.observe()).tasks.find(task => task.closed?.operationId === closed[1]); assert.ok(task?.created && task.closed);
        assert.equal(task.closed.outcome, "accepted"); assert.equal(task.closed.by, task.created.from);
        const source = task.closed.actionSource; assert.ok(source?.kind === "role-direct");
        assert.equal(source.action, "close-created-task"); assert.equal(source.actorRoleId, task.created.from);
        assert.equal(source.operationId, closed[1]); assert.equal(source.targetDigest, closed[3]);
        return modelDone(`只确认收到实际${closed[1]}收口通知，不重复执行。`);
      }
      const published = /^\[应用·文档更新\] version-upgrade (vc-[0-9]+) applied; trunk t1; ([a-f0-9]{64})$/.exec(notice);
      if (published) {
        const operation = await createProjectTrunkStore(driver.root).readOperation!("q6-first-document-submit"); assert.ok(operation.ok);
        assert.equal(operation.value.applicationId, published[1]); assert.equal(operation.value.operationId, "q6-first-document-submit");
        const source = operation.value.actionSource; assert.ok(source?.kind === "role-direct");
        assert.equal(source.targetDigest, published[2]);
        return modelDone("已核同operation/application/digest的首doc通知，不额外授权。" );
      }
      const completed = /^\[应用·文档更新\] complete-team-plan q7-complete-team-plan (applied|no-op); ([a-f0-9]{64})$/.exec(notice);
      if (completed) {
        assert.ok(role === "chief" || role === "convener");
        const operation = await createProjectTrunkStore(driver.root).readOperation!("q7-complete-team-plan"); assert.ok(operation.ok);
        const source = operation.value.actionSource; assert.ok(source?.kind === "role-direct");
        assert.equal(source.targetDigest, completed[2]); return modelDone("只确认真实同operation计划通知，不把它当D3。" );
      }
      const activated = /^\[应用·文档更新\] activate-role-documents q8-activate-role (applied|no-op); ([a-f0-9]{64})$/.exec(notice);
      if (activated) {
        assert.ok(["chief", "convener", "nominator"].includes(role));
        const operation = await createProjectTrunkStore(driver.root).readOperation!("q8-activate-role"); assert.ok(operation.ok);
        const source = operation.value.actionSource; assert.ok(source?.kind === "role-direct"); assert.equal(source.action, "activate-role-documents");
        assert.equal(source.actorRoleId, "nominator"); assert.equal(source.operationId, "q8-activate-role"); assert.equal(source.targetDigest, activated[2]);
        return modelDone("只确认同op已提交的真实激活通知，不额外派工。" );
      }
      assert.fail(`UNKNOWN_OR_UNBOUND_APPLICATION_NOTICE ${role}: ${notice}`);
    }]])),
  "chief:feedback": [async body => {
    const text = actualUserInput(body);
    if (text.startsWith("[系统·治理反馈] 来自 质检 的验收状态（只含状态与报告指针；不转述报告正文）：\n")) {
      assert.ok(verifierTaskIdentity && verifierBasis && verifierEvidenceContent);
      const { taskId, runId, flowId } = verifierTaskIdentity;
      const expected = `[系统·治理反馈] 来自 质检 的验收状态（只含状态与报告指针；不转述报告正文）：\n状态：本轮已完成（流程 ${flowId}）\n报告路径：${verifierEvidencePath}\n治理记录：docs/governance/verifier/${flowId}.md\n请只向客户说明验收复核已结束与报告位置；不要转述报告内容，不要编辑/代批/改判验收结论，也不要把报告当作客户批准。验收卡与客户决定仍由应用/客户处理。`;
      assert.equal(text, expected, "UNKNOWN_VERIFIER_STATUS_RELAY");
      const task = (await driver.observe()).tasks.find(task => task.taskId === taskId);
      assert.ok(task?.created && isTaskReviewBasisRef(task.created.reviewBasisRef));
      assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "verifier");
      assert.equal(task.created.runId, runId); assert.equal(task.created.flowId, flowId);
      assert.deepEqual(task.created.reviewBasisRef, verifierBasis);
      const sourceTurn = driver.trace.findLast(turn => turn.role === "verifier" && turn.reply?.content === "最终OID与冻结criterion的实际核对、实施目录拒写和自属证据结果已正式报告，未代原创建者收口或发布。");
      assert.ok(sourceTurn); assert.match(actualToolReply(sourceTurn.request, "q25-verifier-report"), /候选报告已收到/);
      const sourceEvent = driver.events.find(event => {
        const raw = JSON.stringify(event);
        return raw.includes(JSON.stringify(driver.root)) && raw.includes('"kind":"handback"') && raw.includes('"roleId":"verifier"') &&
          raw.includes(`"taskId":${JSON.stringify(taskId)}`) && raw.includes('"origin":"submitted-report"') &&
          raw.includes(JSON.stringify(verifierEvidencePath));
      });
      const bytes = await fs.readFile(path.join(driver.root, verifierEvidencePath)); assert.equal(bytes.toString("utf8"), verifierEvidenceContent);
      const digest = createHash("sha256").update(bytes).digest("hex"), key = `verifier-status:${driver.root}:${taskId}:${runId}:${verifierBasis.candidateOperationId}:${digest}`;
      assert.equal(seenNotices.has(key), false, "REPEATED_VERIFIER_STATUS_RELAY"); seenNotices.add(key);
      roleProgress.push({ stage: "chief-verifier-status-notice", reply: JSON.stringify({ taskId, runId, flowId, evidencePath: verifierEvidencePath, digest, sourceEvent: sourceEvent ?? null, actualInput: text,
        receiptOnly: "Status is not a saved/ledger/accepted promise; real report basis and creator close remain later production checks" }) });
      return modelDone(`质检复核已结束，报告位置为 ${verifierEvidencePath}；任务接受和客户决定仍按真实后续回执处理。`);
    }
    const match = /^\[系统·治理反馈\] 来自 (运营|产品|策划|人事|质检) 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：\n([^\n]+)\n请用 1-3 句话向客户汇总：完成了什么、是否有风险\/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。$/.exec(text);
    assert.ok(match, `UNKNOWN_GOVERNANCE_RELAY ${text}`);
    assert.equal(feedback.delete(`${match[1]}\n${match[2]}`), true, `UNKNOWN_OR_REPEATED_GOVERNANCE_RELAY ${text}`);
    if (match[1] === "质检") {
      const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q23-dispatch-verifier"); assert.ok(task?.created?.reviewBasisRef);
      assert.ok(driver.trace.some(turn => turn.role === "verifier" && turn.reply?.content === match[2] && actualToolReply(turn.request, "q25-verifier-report")));
    }
    if (match[1] === "运营" && match[2] === "保留真实worker派发结果；尚未独立质检或交付。") {
      const sourceTurn = driver.trace.findLast(turn => turn.role === "convener" && turn.reply?.content === match[2] && !turn.reply.tool_calls?.length);
      assert.ok(sourceTurn, "WORKER_RELAY_SOURCE_CONVENER_REPLY_UNBOUND");
      const receipt = actualToolReply(sourceTurn.request, "q11-dispatch-worker"); assert.match(receipt, /任务已派发给「impl」/);
      const observation = await driver.observe(), child = observation.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker");
      assert.ok(child?.created); assert.match(receipt, new RegExp(child.taskId)); assert.equal(child.created.from, "convener"); assert.equal(child.created.flowId, "q2-new");
      assert.ok(isTaskParentRef(child.created.parentTaskRef));
      const parent = observation.tasks.find(task => task.taskId === child.created!.parentTaskRef!.taskId); assert.ok(parent?.created);
      assert.equal(parent.created.idempotencyKey, "q11-dispatch-execution"); assert.equal(parent.created.to, "convener"); assert.equal(parent.created.runId, child.created.runId);
      assert.ok(String(sourceTurn.request.messages.findLast(message => message.role === "user")?.content).includes(parent.taskId), "WORKER_RELAY_ACTUAL_PARENT_DELIVERY_UNBOUND");
      roleProgress.push({ stage: "pureack-worker-dispatch-binding", reply: JSON.stringify({ sourceTraceSequence: sourceTurn.sequence,
        operation: "q11-dispatch-worker", childTaskId: child.taskId, parentTaskRef: child.created.parentTaskRef, flowId: child.created.flowId, runId: child.created.runId, currentAppRoot: driver.root }) });
    }
    return modelDone("已收到对应内部进度；任务收口仍以实际应用依据为准。" );
  }], convener: [
    () => modelCalls(gitTool("q2-bootstrap-init", "git_candidate", { operationId: "q2-real-bootstrap-init", action: "init",
      base: { ref: "refs/ans/trunk", oid: null }, message: "First controlled candidate for the actually empty host-selected project" })),
    body => { initReply = actualToolReply(body, "q2-bootstrap-init");
      const parsed: unknown = JSON.parse(initReply.slice(initReply.indexOf("{"))); assert.ok(isGitCapabilityResult(parsed));
      return modelCalls(gitTool("q2-bootstrap-report", "submit_report", {
        status: parsed.status === "prepared" ? "completed" : "blocked", summary: `实际首建回执；prepared仅表示候选已准备、不等发布/验收：${initReply}`,
        evidence: parsed.status === "prepared" ? [`Git candidate ${parsed.candidate?.objectFormat}:${parsed.candidate?.hex}`,
          `Git tree ${parsed.tree?.objectFormat}:${parsed.tree?.hex}`, `Git operation ${parsed.operationId}`] : [`Git result ${parsed.status}:${parsed.code}`] })); },
    () => modelDone("保留实际首建回执，不生成未来授权。"),
    ...hubConvenerMaterials,
    async body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q26-controller-delivery-report") {
        actualToolReply(body, "q26-controller-delivery-report"); roleProgress.push({ stage: "controller-bounded-stop", reply: controllerTerminalSummary ?? "actual delivery result formally reported" });
        return modelDone("真实delivery发布及核对结果已正式报告；等待chief原创建者收口，不代最终接受。");
      }
      const text = actualUserInput(body), observation = await driver.observe();
      const child = observation.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker"); assert.ok(child?.created);
      assert.equal(child.created.from, "convener"); assert.equal(child.created.to, "impl"); assert.equal(child.created.flowId, "q2-new");
      const latest = child.reports.at(-1); assert.ok(latest); assert.ok(text.includes(child.taskId) && text.includes(latest.summary));
      roleProgress.push({ stage: "controller-child-report", reply: JSON.stringify({ task: child, input: text }) });
      if (latest.status === "blocked") {
        controllerTerminalSummary = `Q23真实worker候选阻塞：${latest.summary}`;
        return modelCalls(gitTool("q23-controller-blocked-report", "submit_report", { status: "blocked", summary: controllerTerminalSummary, evidence: latest.evidence ?? [] }));
      }
      const candidateText = latest.evidence?.find(item => item.startsWith("Git candidate "));
      const candidateMatch = /^Git candidate (sha1|sha256):([a-f0-9]+)$/.exec(candidateText ?? ""); assert.ok(candidateMatch);
      const actualCandidate: unknown = { objectFormat: candidateMatch[1], hex: candidateMatch[2] }; assert.ok(isGitOid(actualCandidate));
      controllerCandidate = actualCandidate; assert.deepEqual(controllerCandidate, workerCandidateReceipt?.candidate);
      if (!text.includes("[应用绑定的原创建者收口依据]")) {
        roleProgress.push({ stage: "controller-child-basis-gap", reply: text });
        controllerTerminalSummary = "Q23真实worker候选已收到，但应用尚未提供原创建者child收口basis/reportRef；不能先整合未accepted的child。";
        return modelCalls(gitTool("q23-controller-blocked-report", "submit_report", { status: "blocked", summary: controllerTerminalSummary, evidence: latest.evidence ?? [] }));
      }
      return modelCalls(gitTool("q21-close-worker", "close_created_task", originalCreatorClose(body, "q21-close-worker")));
    },
    async body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q23-controller-blocked-report") {
        actualToolReply(body, "q23-controller-blocked-report"); roleProgress.push({ stage: "controller-bounded-stop", reply: controllerTerminalSummary ?? "actual blocked report" });
        return modelDone("真实worker候选或基线缺口已收到；保持阻塞，未关闭或验收。" );
      }
      const reply = actualToolReply(body, "q21-close-worker"); roleProgress.push({ stage: "controller-child-close", reply });
      const child = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker"); assert.ok(child);
      if (child.closed?.outcome !== "accepted" || child.closed.by !== "convener") {
        controllerTerminalSummary = `Q23原创建者child真实close未accepted：${reply}`;
        return modelCalls(gitTool("q23-controller-close-rejected-report", "submit_report", { status: "blocked", summary: controllerTerminalSummary, evidence: child.reports.at(-1)?.evidence ?? [] }));
      }
      await driver.save(path.join(evidence, `${caseTag}-first-worker-creator-close.json`), { child, reply });
      return modelCalls(gitTool("q23-convener-basis-query", "git_query", { operationId: "q23-convener-basis-query", template: "log", limit: 1 }));
    },
    async body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q23-controller-close-rejected-report") {
        actualToolReply(body, "q23-controller-close-rejected-report"); roleProgress.push({ stage: "controller-bounded-stop", reply: controllerTerminalSummary ?? "close rejected" });
        return modelDone("真实worker候选或基线缺口已收到；保持阻塞，未关闭或验收。" );
      }
      const reply = actualToolReply(body, "q23-convener-basis-query"), result: unknown = JSON.parse(reply.slice(reply.indexOf("{")));
      assert.ok(isGitCapabilityResult(result)); assert.equal(result.status, "observed"); assert.ok(isGitBasis(result.basis) && result.basis.oid); assert.ok(controllerCandidate);
      const parent = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-execution"); assert.ok(parent?.created?.runId);
      const run = await createProjectTrunkStore(driver.root).readRunRecord!(parent.created.runId); assert.ok(run.ok);
      if (result.basisSource) {
        assert.equal(result.basisSource.kind, "assigned-run"); assert.equal(result.basisSource.runId, parent.created.runId);
        assert.equal(result.basisSource.pinDigest, run.value.value.pinDigest); assert.equal(result.basisSource.runRecordSha256, run.value.sha256);
      }
      assert.deepEqual(result.basis, run.value.value.codeBasis);
      roleProgress.push({ stage: "controller-code-basis", reply: JSON.stringify({ actualResult: result, actualTask: parent.created, run, sourceWasPresent: !!result.basisSource }) });
      return modelCalls(gitTool("q23-integrate-worker", "git_candidate", { operationId: "q23-integrate-worker", action: "integrate", base: result.basis,
        candidates: [controllerCandidate], message: "Integrate actual creator-accepted worker candidate for independent verification" }));
    },
    async body => {
      const reply = actualToolReply(body, "q23-integrate-worker"), result: unknown = JSON.parse(reply.slice(reply.indexOf("{"))); assert.ok(isGitCapabilityResult(result));
      roleProgress.push({ stage: "controller-integration-result", reply }); await driver.save(path.join(evidence, `${caseTag}-controller-integration-result.json`), { roleProgress, result });
      controllerTerminalSummary = `Q23真实集成 ${result.status} operation ${result.operationId} code ${result.code ?? "none"}`;
      if (result.status !== "prepared") return modelCalls(gitTool("q23-controller-integration-report", "submit_report", { status: "blocked", summary: controllerTerminalSummary,
        evidence: [`Git operation ${result.operationId}`, ...(controllerCandidate ? [`Git candidate ${controllerCandidate.objectFormat}:${controllerCandidate.hex}`] : [])] }));
      assert.ok(isGitOid(result.candidate)); assert.ok(isGitOid(result.tree)); assert.ok(result.parents && result.parents.length >= 2); assert.ok(result.journalId);
      const git = createGitCandidateStore(driver.root), commit = await git.readCommit(result.candidate), blob = await git.readBlob(result.candidate, "src/impl/result.txt");
      assert.deepEqual(commit.tree, result.tree); assert.deepEqual(commit.parents, result.parents);
      assert.equal(Buffer.from(blob.bytesBase64, "base64").toString("utf8"), "Actual isolated workflow worker output.\n");
      const parent = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-execution"); assert.ok(parent?.created?.runId);
      const run = await createProjectTrunkStore(driver.root).readRunRecord!(parent.created.runId); assert.ok(run.ok);
      const actualBasis = run.value.value.codeBasis; assert.ok(isGitBasis(actualBasis) && actualBasis.oid);
      const baseFiles = await git.listTree(actualBasis.oid), finalFiles = await git.listTree(result.candidate);
      for (const entry of baseFiles.filter(entry => entry.path !== "src/impl/result.txt")) assert.deepEqual(finalFiles.find(file => file.path === entry.path), entry);
      const journal = await createGitRefStore(driver.root).readJournal(result.operationId); assert.ok(journal); assert.equal(journal.phase, "published");
      assert.deepEqual(await git.readRef("refs/ans/trunk"), actualBasis.oid);
      await driver.save(path.join(evidence, `${caseTag}-first-physical-integrated-candidate.json`), { result, commit, blob, baseFiles, finalFiles, journal, run, roleProgress });
      process.stdout.write(`Q_INTEGRATED_CANDIDATE_PREPARED ${JSON.stringify({ at: new Date().toISOString(), candidate: result.candidate, tree: result.tree, parents: result.parents, journalId: result.journalId })}\n`);
      controllerCandidate = result.candidate;
      controllerTerminalSummary = `Q48实际集成候选已prepared ${result.operationId} ${result.candidate.objectFormat}:${result.candidate.hex}，等待Chief独立质检与显式续接发布；controller仍未完成。`;
      return modelCalls(gitTool("q48-controller-review-request-report", "submit_report", { status: "blocked", summary: controllerTerminalSummary,
        evidence: [`Controller task ${parent.taskId}`, `Controller flow ${parent.created.flowId} run ${parent.created.runId}`,
          `Git operation ${result.operationId}`, `Git candidate ${result.candidate.objectFormat}:${result.candidate.hex}`, `Git tree ${result.tree?.objectFormat}:${result.tree?.hex}`] }));
    },
    body => {
      if (body.messages.findLast(message => message.role === "tool")?.tool_call_id === "q48-controller-review-request-report") {
        actualToolReply(body, "q48-controller-review-request-report"); roleProgress.push({ stage: "controller-requested-chief-review", reply: controllerTerminalSummary ?? "actual integrated candidate report" });
        return modelDone("实际集成候选已正式交Chief选择质检；未创建Verifier、未验收或发布，原controller保持live。");
      }
      const reply = actualToolReply(body, "q23-controller-integration-report");
      roleProgress.push({ stage: "controller-bounded-stop", reply });
      return modelDone("真实worker候选或基线缺口已收到；保持阻塞，未关闭或验收。" );
    },
  ], nominator: materials.nominator!, verifier: [
    async body => {
      const facts = await driver.observe(), task = facts.tasks.find(task => task.created?.idempotencyKey === "q23-dispatch-verifier"); assert.ok(task?.created);
      const basis = actualAssignedReviewBasis(body); assert.deepEqual(task.created.reviewBasisRef, basis); assert.deepEqual(basis.candidate, controllerCandidate);
      assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "verifier"); assert.equal(task.created.hubRouting, "chief-hub-v1");
      assert.equal(task.created.parentTaskRef, undefined, "Review business controller must not impersonate a creation parent");
      const controllerRef = task.created.reviewControllerRef; assert.ok(isTaskReviewControllerRef(controllerRef));
      const controller = facts.tasks.find(row => row.created?.idempotencyKey === "q11-dispatch-execution"); assert.ok(controller?.created); assert.equal(controller.closed, undefined);
      assert.equal(controllerRef.taskId, controller.taskId); assert.equal(controllerRef.flowId, controller.created.flowId); assert.equal(controllerRef.runId, controller.created.runId);
      assert.deepEqual(controllerRef.reviewBasisRef, basis); assert.equal(task.created.runId, controllerRef.runId);
      assert.ok(task.created.runId && task.created.flowId); assert.ok(actualUserInput(body).includes(task.taskId));
      verifierTaskIdentity = { taskId: task.taskId, runId: task.created.runId, flowId: task.created.flowId };
      const names = body.tools?.map(tool => tool.function?.name) ?? [];
      await driver.save(path.join(evidence, `${caseTag}-first-verifier-runtime.json`), { actualRequest: body, actualTask: task, actualToolNames: names, actualFacts: facts });
      process.stdout.write(`Q_VERIFIER_HTTP ${JSON.stringify({ at: new Date().toISOString(), taskId: task.taskId, candidate: basis.candidate, tools: names })}\n`);
      verifierBasis = basis; assert.equal(basis.criteria.length, 1, "Unknown multi-criterion review requires explicit bounded script");
      return modelCalls(gitTool("q25-verifier-criterion", "git_query", { operationId: "q25-verifier-criterion", template: "show", target: basis.criteria[0]!.oid, paths: [basis.criteria[0]!.path] }));
    },
    body => {
      const ended = finishVerifierReport(body); if (ended) return ended;
      const reply = actualToolReply(body, "q25-verifier-criterion"), result: unknown = JSON.parse(reply.slice(reply.indexOf("{"))); assert.ok(isGitCapabilityResult(result));
      roleProgress.push({ stage: "verifier-frozen-criterion-query", reply });
      if (result.status !== "observed" || result.truncated || result.output === undefined) return modelCalls(gitTool("q25-verifier-report", "submit_report", { status: "blocked", summary: `Q25冻结criterion真实Git查询阻塞：${reply}`, evidence: [] }));
      assert.ok(verifierBasis); assert.equal(createHash("sha256").update(result.output).digest("hex"), verifierBasis.criteria[0]!.sha256);
      const requirements = result.output.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).join(" ");
      assert.equal(requirements, "Produce src/impl/result.txt, preserve evidence and use creator closure.", "Q25_UNSCRIPTED_ACTUAL_CRITERION; no invented shell requirement or quality pass");
      verifierCriterionText = result.output;
      return modelCalls(gitTool("q25-verifier-code", "git_query", { operationId: "q25-verifier-code", template: "show", target: verifierBasis.candidate, paths: ["src/impl/result.txt"] }));
    },
    async body => {
      const ended = finishVerifierReport(body); if (ended) return ended;
      const reply = actualToolReply(body, "q25-verifier-code"), result: unknown = JSON.parse(reply.slice(reply.indexOf("{"))); assert.ok(isGitCapabilityResult(result));
      roleProgress.push({ stage: "verifier-final-oid-query", reply });
      if (result.status !== "observed" || result.truncated || result.output === undefined) return modelCalls(gitTool("q25-verifier-report", "submit_report", { status: "blocked", summary: `Q25最终OID真实Git查询阻塞：${reply}`, evidence: [] }));
      assert.equal(result.output, "Actual isolated workflow worker output.\n"); verifierOutputText = result.output;
      const worker = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker"); assert.ok(worker?.created && worker.closed);
      assert.equal(worker.closed.outcome, "accepted"); assert.equal(worker.closed.by, worker.created.from); assert.equal(worker.closed.by, "convener");
      assert.ok(worker.closed.actionSource?.kind === "role-direct"); assert.equal(worker.closed.actionSource.action, "close-created-task");
      verifiedWorkerCreatorReceipt = worker.closed;
      return modelCalls(gitTool("q25-verifier-forbidden-write", "write_file", { path: "src/impl/verifier-must-not-write.txt", content: "Unauthorized verifier implementation write must be rejected.\n" }));
    },
    async body => {
      const ended = finishVerifierReport(body); if (ended) return ended;
      const reply = actualToolReply(body, "q25-verifier-forbidden-write"); assert.doesNotMatch(reply, /已获准并落盘/); assert.match(reply, /拒|越界|denied|门禁|不允许/i);
      assert.equal(await fs.stat(path.join(driver.root, "src/impl/verifier-must-not-write.txt")).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
      verifierNegativeReply = reply; assert.ok(verifierBasis && verifierCriterionText && verifierOutputText);
      assert.ok(verifierTaskIdentity);
      const metadata = { schema: "git-quality-report/v1", version: qualityDocumentVersion(verifierEvidencePath), ...verifierTaskIdentity,
        candidateOperationId: verifierBasis.candidateOperationId, candidate: verifierBasis.candidate, criteria: verifierBasis.criteria,
        checks: [{ artifact: { oid: verifierBasis.candidate, path: "src/impl/result.txt", sha256: createHash("sha256").update(verifierOutputText).digest("hex") }, assertion: "nonempty-utf8" }] };
      verifierEvidenceContent = `---\n${JSON.stringify(metadata, null, 2)}\n---\n# Actual final candidate review\nFrozen requirement read and SHA256 checked: Produce src/impl/result.txt, preserve evidence and use creator closure.\nFinal Git blob content:\n\n\`\`\`text\n${verifierOutputText}\`\`\`\nOriginal creator receipt observed:\n${JSON.stringify(verifiedWorkerCreatorReceipt)}\nImplementation namespace production write was rejected and no file was created. This report was written through the verifier's own production file tool. No arbitrary shell execution was added to this text requirement.\n`;
      return modelCalls(gitTool("q25-verifier-evidence-write", "write_file", { path: verifierEvidencePath, content: verifierEvidenceContent }));
    },
    async body => {
      const ended = finishVerifierReport(body); if (ended) return ended;
      const reply = actualToolReply(body, "q25-verifier-evidence-write"); roleProgress.push({ stage: "verifier-own-evidence-write", reply });
      const written = /已获准并落盘/.test(reply);
      if (written) assert.equal(await fs.readFile(path.join(driver.root, verifierEvidencePath), "utf8"), verifierEvidenceContent);
      await driver.save(path.join(evidence, `${caseTag}-verifier-readonly-and-write-proof.json`), { verifierBasis, verifierCriterionText, verifierOutputText, verifierNegativeReply, actualOwnWrite: reply });
      return modelCalls(gitTool("q25-verifier-report", "submit_report", { status: written ? "completed" : "blocked", summary: written
        ? "Q25冻结text criterion的最终OID/blob/hash、真实worker原creator收口、实施目录拒写与自属质量证据落盘均已实际核对；未代原创建者接受质检任务或发布。"
        : `Q25实际quality证据目录写入未成功：${reply}；不冒证据已保存或质量通过。`, evidence: written && verifierBasis && verifierOutputText !== undefined ? [verifierEvidencePath,
          `Git review operation ${verifierBasis.candidateOperationId}`, `Git candidate ${verifierBasis.candidate.objectFormat}:${verifierBasis.candidate.hex}`,
          ...verifierBasis.criteria.map(ref => `Git criterion ${ref.oid.objectFormat}:${ref.oid.hex} ${ref.path} ${ref.sha256}`),
          `Git artifact ${verifierBasis.candidate.objectFormat}:${verifierBasis.candidate.hex} src/impl/result.txt ${createHash("sha256").update(verifierOutputText).digest("hex")}`] : [] }));
    },
    body => { const ended = finishVerifierReport(body); assert.ok(ended); return ended; },
  ], impl: createAssignedWorkerReceivers({ driver: () => driver, workerRoleId: "impl", workerTaskKey: "q11-dispatch-worker", flowId: "q2-new",
    output: { path: "src/impl/result.txt", content: "Actual isolated workflow worker output.\n" },
    ids: { write: "q17-worker-write", basis: "q21-worker-basis-query", candidate: "q21-worker-candidate", gapReport: "q21-worker-gap-report", report: "q21-worker-candidate-report" },
    caseTag, progress: roleProgress, onCandidateReceipt: result => { workerCandidateReceipt = result; }
  }) }, { caseDeadlineAt, tag: "first-bootstrap", requestLimit: q33QueueDiagnostic ? 96 : q23Business ? 256 : 192, timeoutMs: q33QueueDiagnostic ? 30000 : q26Business ? 150000 : q25Business ? 120000 : 90000,
    reusableNoticeKeys: ["chief:feedback", ...["chief", "convener", "product", "nominator"].map(role => `${role}:application-notice`)],
    finiteRoles: q21Business ? {
      chief: { initial: 0, tasks: { "q2-empty-bootstrap-convener": 2, "q6-product-draft": 5, "q6-rapporteur-draft": 9, "q6-product-publish": 12, "q7-dispatch-plan": 15, "q8-dispatch-nominator": 18, "q9-dispatch-workflow": 21, "q11-dispatch-execution": 24, "q23-dispatch-verifier": 26 } },
      convener: { tasks: { "q2-empty-bootstrap-convener": 0, "q7-dispatch-plan": 3, "q9-dispatch-workflow": 7, "q11-dispatch-execution": 11, "q11-dispatch-worker": 13 } },
      impl: { tasks: { "q11-dispatch-worker": 0 } },
      verifier: { tasks: { "q23-dispatch-verifier": 0 } },
    } : undefined,
    timerDiagnostics, lifecycleDiagnosticFile: q19Diagnostic || q20Profile || q21Business ? path.join(evidence, `${caseTag}-full-prefix-lifecycle.jsonl`) : undefined,
    publicationDiagnosticFile: path.join(evidence, `${caseTag}-first-publication-error.json`), workerDiagnosticFile: path.join(evidence, `${caseTag}-first-worker-runtime.json`),
    pinnedChildDiagnosticFile: path.join(evidence, `${caseTag}-first-persisted-child.json`),
    queueDiagnosticFile: q33QueueDiagnostic || q35Business ? path.join(evidence, `${caseTag}-first-queue-rejection.json`) : undefined,
    failOnClosedQueueRejection: q35Business });
  let primaryFailure: { error: unknown } | undefined;
  try {
    assert.deepEqual(await fs.readdir(driver.root), []);
    assert.equal(driver.initialRootFacts.ancestors.some(fact => fact.gitMarker || fact.symbolicLink), false, "The true new fixture has no ancestor Git or linked root");
    assert.deepEqual(driver.initialRootFacts.nestedGitMarkers, []); assert.deepEqual(driver.initialRootFacts.links, []);
    await driver.bounded("public-chief-open", () => driver.openChief()); await driver.sendChief("此空目录新建本地应用；先由运营做受控Git首建，随后按缺口规划。" );
    if (q33QueueDiagnostic) {
      let diagnosticWindowElapsed = false;
      await driver.bounded("first actual closed-assignment queue rejection diagnostic", async signal => {
        const windowEnds = Date.now() + 25000;
        while (!driver.queueDiagnostics.length) {
          if (driver.errors.length || driver.queueDiagnosticErrors.length) throw new Error([...driver.errors, ...driver.queueDiagnosticErrors].join("\n"));
          if (q34QueueDiagnostic) {
            for (const card of driver.pending.values()) {
              assert.equal(card.request.cardKind, "intent-confirm", `Q34_UNEXPECTED_CARD ${card.request.cardKind}`);
              assert.match(card.request.preview ?? "", /docs\/product\/q2-new-intent-v1\.md/);
              assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true);
            }
            if (Date.now() >= windowEnds) { diagnosticWindowElapsed = true; break; }
          }
          signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      if (diagnosticWindowElapsed) {
        await driver.save(path.join(evidence, `${caseTag}-bounded-window-no-residual.json`), { diagnosticOnly: true, fullNewPass: false,
          observationWindowMs: 25000, outcome: "No residual closed-assignment rejection observed in this bounded prefix window",
          firstDocumentReply: firstDocumentReply ?? null, coveredCalls: driver.trace.flatMap(row => row.reply?.tool_calls?.map(call => ({ role: row.role, id: call.id, name: call.function.name })) ?? []),
          coverageLimit: "Original public init/product/rapporteur prefix, real intent card response and first-doc callback barrier only; not later plan/activation/workflow/delivery/drain" });
        return;
      }
      const fact = driver.queueDiagnostics[0]!;
      const rejected = fact.inventory.queuedDispatches.find(entry => entry.kind === "system" && entry.lastAttempt.state !== "unknown" && entry.lastAttempt.code === "delivery-assignment-unavailable");
      assert.ok(rejected, "Q33_PUBLIC_REJECTION_ENTRY_NOT_OBSERVED");
      const head = fact.inventory.queuedDispatches.find(entry => entry.roleId === rejected.roleId && entry.runtime === rejected.runtime);
      const assignment = rejected.systemAssignmentTaskId ? fact.tasks.find(task => task.taskId === rejected.systemAssignmentTaskId) : undefined;
      await driver.save(path.join(evidence, `${caseTag}-queue-source-diagnostic.json`), { diagnosticOnly: true, fullNewPass: false,
        stopCondition: "first actual production closed-assignment refusal with same-process public queue and ledger facts", fact,
        recipientQueueHead: head, actualRejectedEntry: rejected, actualAssignmentTask: assignment ?? null,
        sourceLimit: "Only actual host inventory values; unknown provenance stays unknown. Ledger and inventory samples straddle one read, no atomicity claimed." });
      assert.equal(head?.queueEntryId, rejected.queueEntryId); assert.ok(rejected.queueEntryId);
      assert.equal(rejected.systemAssignmentState, "bound"); assert.ok(assignment?.closed, "Q33_REJECTED_ASSIGNMENT_NOT_ACTUALLY_CLOSED");
      assert.equal(rejected.lastAttempt.state === "unknown" ? undefined : rejected.lastAttempt.code, "delivery-assignment-unavailable");
      return; // This observation is not full NEW delivery/drain acceptance.
    }
    assert.deepEqual(driver.errors, [], "Production preflight refusal is not HTTP script exhaustion");
    let actual = await driver.observe();
    assert.ok(actual.tasks.some(task => task.created?.from === "chief" && task.created.to === "convener"),
      `Q2_FIRST_BOOTSTRAP_PREFLIGHT_BLOCK ${handoffReply}`);
    const child = actual.tasks.find(task => task.created?.to === "convener")!.created!;
    assert.equal(child.workSourceRef?.kind, "chief-customer-turn"); assert.ok(child.workSourceRef);
    const sourceBytes = await fs.readFile(path.join(driver.root, child.workSourceRef.path));
    assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), child.workSourceRef.sha256);
    const source = JSON.parse(sourceBytes.toString("utf8")); actualSource = { task: child, source };
    assert.equal(source.schema, "repository-work-source/v1"); assert.equal(source.flowId, child.flowId);
    assert.equal(source.sourceId, child.workSourceRef.sourceId); assert.equal(source.projectRoot, driver.initialRootFacts.canonicalRoot);
    assert.equal(source.parent.kind, "message"); assert.equal(source.parent.clientMessageId, driver.customerInputs[0]?.clientMessageId);
    assert.equal(source.parent.inputAccepted, true); assert.equal("parentTaskId" in source, false);
    await driver.bounded("actual convener init result", async signal => {
      while (initReply === undefined) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    actual = await driver.observe(); assert.deepEqual(actual.ledgerErrors, []);
    assert.match(initReply!, /prepared/, `Q2_FIRST_REAL_INIT_BLOCK ${initReply}`);
    const receipt: unknown = JSON.parse(initReply!.slice(initReply!.indexOf("{"))); assert.ok(isGitCapabilityResult(receipt));
    assert.equal(receipt.status, "prepared"); assert.ok(receipt.candidate); assert.ok(receipt.tree);
    assert.equal((await fs.lstat(path.join(driver.root, ".git"))).isDirectory(), true);
    const journal = await readGitInitializationRecord(driver.root, "q2-real-bootstrap-init"); assert.ok(journal);
    assert.equal(journal.media, "git-initialization/v1"); assert.equal(journal.stage, "candidate-created");
    assert.equal(journal.taskId, child.taskId); assert.equal(journal.runId, child.runId); assert.equal(journal.sourceId, child.workSourceRef.sourceId);
    assert.equal(journal.sourceSha256, child.workSourceRef.sha256); assert.deepEqual(journal.candidate, receipt.candidate);
    assert.deepEqual(journal.tree, receipt.tree); assert.deepEqual(journal.parents, receipt.parents);
    const store = createGitCandidateStore(driver.root), commit = await store.readCommit(receipt.candidate);
    assert.deepEqual(commit.candidate, receipt.candidate); assert.deepEqual(commit.tree, receipt.tree); assert.deepEqual(commit.parents, []);
    const ref = `refs/ans/candidates/${createHash("sha256").update("q2-real-bootstrap-init").digest("hex")}`;
    assert.deepEqual(await store.readRef(ref), receipt.candidate);
    initializationReadback = { receipt, journal, commit, candidateRef: ref };
    await driver.bounded("actual initialization report to its real creator", async signal => {
      while (initHandoff === undefined) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    assert.ok(initHandoff, "The actual creator handback must exist");
    assert.match(initHandoff, /\[应用绑定的原创建者收口依据\]/,
      `Q5_NEXT_INIT_CREATOR_CLOSE_BASIS_UNAVAILABLE: ${initHandoff}`);
    await driver.bounded("actual creator close result", async signal => {
      while (initCloseReply === undefined) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    assert.ok(initCloseReply, "The actual creator close response must exist");
    assert.match(initCloseReply, /accepted|closed/);
    await driver.bounded("same-flow product/rapporteur to actual first document submission", async signal => {
      while (firstDocumentReply === undefined) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        for (const card of driver.pending.values()) {
          assert.equal(card.request.cardKind, "intent-confirm", `Q6_UNEXPECTED_CARD ${card.request.cardKind}`);
          assert.match(card.request.preview ?? "", /docs\/product\/q2-new-intent-v1\.md/);
          assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true);
        }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    assert.ok(firstDocumentReply); assert.match(firstDocumentReply, /applied|committed-pending-recovery/, `Q6_FIRST_DOCUMENT_SUBMIT_BLOCK ${firstDocumentReply}`);
    const publishedStore = createProjectTrunkStore(driver.root), published = await publishedStore.readManifest(); assert.ok(published.ok, "Actual Git-backed manifest must exist after first publication");
    const publishedOid = await store.readRef("refs/ans/trunk"); assert.ok(publishedOid);
    const publishedCommit = await store.readCommit(publishedOid);
    assert.equal(published.value.trunkVersion, 1); assert.equal(published.value.flowId, "q2-new");
    assert.equal(published.value.artifacts.workflow, undefined); assert.ok(published.value.snapshotRef);
    const publishedSnapshot = await publishedStore.readSnapshot!(published.value.snapshotRef); assert.ok(publishedSnapshot.ok);
    const documentOperation = await publishedStore.readOperation!("q6-first-document-submit"); assert.ok(documentOperation.ok);
    assert.equal(documentOperation.value.operationId, "q6-first-document-submit");
    assert.equal(documentOperation.value.actionSource?.kind, "role-direct");
    if (documentOperation.value.actionSource?.kind === "role-direct") assert.equal(documentOperation.value.actionSource.actorRoleId, "product");
    firstDocumentReadback = { oid: publishedOid, commit: publishedCommit, manifest: published.value, snapshot: publishedSnapshot.value, operation: documentOperation.value };
    releaseDocumentObservation();
    await driver.bounded("real convener plan after actual document-task closure", async signal => {
      while (planReply === undefined) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    assert.ok(planReply); assert.match(planReply, /applied|no-op/, `Q7_COMPLETE_PLAN_BLOCK ${planReply}`);
    const plannedManifest = await publishedStore.readManifest(); assert.ok(plannedManifest.ok); assert.ok(plannedManifest.value.snapshotRef);
    const plannedOid = await store.readRef("refs/ans/trunk"); assert.ok(plannedOid);
    const plannedCommit = await store.readCommit(plannedOid), plannedSnapshot = await publishedStore.readSnapshot!(plannedManifest.value.snapshotRef); assert.ok(plannedSnapshot.ok);
    const planOperation = await publishedStore.readOperation!("q7-complete-team-plan"); assert.ok(planOperation.ok);
    assert.equal(plannedManifest.value.trunkVersion, 2); assert.equal(plannedManifest.value.source, "team-plan");
    assert.equal(plannedManifest.value.actionSource?.kind, "role-direct");
    const planSource = plannedManifest.value.actionSource; assert.ok(planSource?.kind === "role-direct");
    assert.equal(planSource.action, "complete-team-plan"); assert.equal(planSource.actorRoleId, "convener"); assert.equal(planSource.operationId, "q7-complete-team-plan");
    assert.deepEqual(plannedManifest.value.artifacts.documents, published.value.artifacts.documents);
    assert.deepEqual(plannedManifest.value.activeRoles, published.value.activeRoles); assert.deepEqual(plannedManifest.value.activeRevision, published.value.activeRevision);
    assert.equal(plannedManifest.value.d3, undefined); assert.equal(plannedManifest.value.runId, null); assert.equal(plannedManifest.value.artifacts.workflow, undefined);
    assert.equal(plannedManifest.value.artifacts.execution.flow, null);
    const team = plannedManifest.value.artifacts.execution.teamPlan; assert.ok(team); assert.equal(team.path, "docs/scheduling/q2-new-team-v1.md");
    const markerFile = plannedSnapshot.value.files.find(file => file.path.startsWith(".ans/trunk/plan-completions/")); assert.ok(markerFile);
    const marker = JSON.parse(Buffer.from(markerFile.bytesBase64, "base64").toString("utf8"));
    assert.equal(marker.schema, "team-plan-completion/v1"); assert.equal(marker.operationId, "q7-complete-team-plan"); assert.equal(marker.actorRoleId, "convener");
    assert.equal(marker.plan.path, team.path); assert.equal(marker.plan.sha256, team.sha256);
    planReadback = { oid: plannedOid, commit: plannedCommit, manifest: plannedManifest.value, snapshot: plannedSnapshot.value, operation: planOperation.value, marker };
    await driver.save(path.join(evidence, `${caseTag}-first-physical-plan-proof.json`), { firstDocumentReply, firstDocumentReadback, planReply, planReadback });
    releasePlanObservation();
    await driver.bounded("real D3 / zero-file role drafts / activation", async signal => {
      while (!roleProgress.some(item => item.stage === "activation")) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        for (const card of driver.pending.values()) {
          assert.equal(card.request.cardKind, "appointment", `Q8_UNEXPECTED_CARD ${card.request.cardKind}`);
          for (const relative of ["role-card.md", "boundary.md", "boundary.yaml"])
            assert.equal(await fs.access(path.join(driver.root, "角色卡/impl", relative)).then(() => true, () => false), false, "D3 must select a genuinely zero-file new role");
          assert.equal(driver.respond(card.id, { kind: "choice", selected: ["impl"] }).ok, true);
        }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const activation = roleProgress.find(item => item.stage === "activation"); assert.ok(activation); assert.match(activation.reply, /applied|no-op/, `Q8_ACTIVATION_BLOCK ${activation.reply}`);
    const activeManifest = await publishedStore.readManifest(); assert.ok(activeManifest.ok);
    assert.equal(activeManifest.value.activeRevision, 1); assert.ok(activeManifest.value.activeDigest); assert.ok(activeManifest.value.activeRoles?.impl);
    assert.equal(activeManifest.value.trunkVersion, plannedManifest.value.trunkVersion); assert.equal(activeManifest.value.digest, plannedManifest.value.digest);
    assert.equal(activeManifest.value.source, plannedManifest.value.source); assert.deepEqual(activeManifest.value.actionSource, plannedManifest.value.actionSource);
    assert.deepEqual(activeManifest.value.artifacts, plannedManifest.value.artifacts); assert.deepEqual(activeManifest.value.snapshotRef, plannedManifest.value.snapshotRef);
    assert.equal(activeManifest.value.runId, null); assert.equal(activeManifest.value.frozenRoles, undefined); assert.equal(activeManifest.value.artifacts.workflow, undefined);
    const activeRole = activeManifest.value.activeRoles.impl;
    assert.ok(publishedStore.readActiveRoleEvidence); assert.ok(publishedStore.readActiveRolesAt);
    const activeBytes = await publishedStore.readActiveRoleEvidence(activeRole); assert.ok(activeBytes.ok);
    const activeState = await publishedStore.readActiveRolesAt({ revision: 1, digest: activeManifest.value.activeDigest }); assert.ok(activeState.ok);
    assert.deepEqual(activeState.value.roles.impl, activeRole);
    for (const key of FROZEN_ROLE_REF_KEYS) {
      const ref = activeRole[key]; assert.equal(ref.snapshotId, activeRole.snapshotRef.snapshotId);
      const snapshotFile: CompleteSnapshot["files"][number] | undefined = activeBytes.value.files.find(candidate => candidate.path === ref.path && candidate.sha256 === ref.sha256);
      assert.ok(snapshotFile, `Q9_MISSING_ACTUAL_ACTIVE_REF ${key}`);
      assert.equal(createHash("sha256").update(Buffer.from(snapshotFile.bytesBase64, "base64")).digest("hex"), ref.sha256);
    }
    const authorizationFile = activeBytes.value.files.find(file => file.path === activeRole.authorizationRef.path); assert.ok(authorizationFile);
    const authorization = JSON.parse(Buffer.from(authorizationFile.bytesBase64, "base64").toString("utf8"));
    assert.equal(authorization.schema, "role-authorization/v1"); assert.equal(authorization.roleId, "impl"); assert.deepEqual(authorization.writesets, ["src/impl/"]);
    const activeOperation = await publishedStore.readOperation!("q8-activate-role"); assert.ok(activeOperation.ok); assert.equal(activeOperation.value.phase, "committed");
    const activationSource = activeOperation.value.actionSource; assert.ok(activationSource?.kind === "role-direct"); assert.equal(activationSource.actorRoleId, "nominator"); assert.equal(activationSource.action, "activate-role-documents");
    const activeOid = await store.readRef("refs/ans/trunk"); assert.ok(activeOid); const activeCommit = await store.readCommit(activeOid);
    activationReadback = { manifest: activeManifest.value, state: activeState.value, evidence: activeRole, snapshot: activeBytes.value, authorization,
      oid: activeOid, commit: activeCommit, operation: activeOperation.value };
    await driver.save(path.join(evidence, `${caseTag}-first-physical-active-proof.json`), { firstDocumentReadback, planReadback, activation: activation.reply, activationReadback, roleProgress });
    releaseActivationObservation();
    await driver.bounded("real nominator report and chief creator close", async signal => {
      while (!roleProgress.some(item => item.stage === "activation-close")) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const closedObservation = await driver.observe(), nominatorTask = closedObservation.tasks.find(task => task.created?.to === "nominator"); assert.ok(nominatorTask);
    assert.equal(nominatorTask.reports.at(-1)?.status, "done"); assert.equal(nominatorTask.closed?.outcome, "accepted");
    assert.equal(nominatorTask.closed?.by, "chief"); assert.equal(nominatorTask.closed?.operationId, "q9-close-activation");
    const closeTurn = driver.trace.find(turn => turn.reply?.tool_calls?.some(call => call.id === "q9-close-activation")); assert.ok(closeTurn);
    const closeCall = closeTurn.reply?.tool_calls?.find(call => call.id === "q9-close-activation"); assert.ok(closeCall);
    const submittedClose = JSON.parse(closeCall.function.arguments); assert.equal(submittedClose.taskId, nominatorTask.taskId); assert.ok(submittedClose.reportRef);
    const handback = String(closeTurn.request.messages.findLast(message => message.role === "user")?.content); assert.match(handback, /\[应用绑定的原创建者收口依据\]/);
    activationCloseReadback = { task: nominatorTask, actualSubmittedClose: submittedClose, actualHandback: handback, reply: roleProgress.find(item => item.stage === "activation-close")?.reply };
    await driver.save(path.join(evidence, `${caseTag}-first-nominator-creator-close-proof.json`), { activationReadback, activationCloseReadback, roleProgress });
    releaseActivationCloseObservation();
    await driver.bounded("dedicated workflow request/write after actual creator close", async signal => {
      while (!roleProgress.some(item => item.stage === "workflow-write")) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        for (const card of driver.pending.values()) {
          assert.equal(card.request.cardKind, "stable-write", `Q9_UNEXPECTED_CARD ${card.request.cardKind}`);
          assert.equal(driver.respond(card.id, { kind: "choice", selected: ["approve-stable-write"] }).ok, true);
        }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const workflow = roleProgress.find(item => item.stage === "workflow-write"); assert.ok(workflow);
    const workflowBytes = await fs.readFile(path.join(driver.root, "docs/workflow.md")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    const workflowManifest = await publishedStore.readManifest(); assert.ok(workflowManifest.ok);
    const initialWorkflowReadback = { reply: workflow.reply, file: workflowBytes ? { path: "docs/workflow.md", bytes: workflowBytes.length, sha256: createHash("sha256").update(workflowBytes).digest("hex") } : null,
      manifest: workflowManifest.value, ref: await store.readRef("refs/ans/trunk") };
    workflowReadback = initialWorkflowReadback;
    await driver.save(path.join(evidence, `${caseTag}-workflow-initial-readback-proof.json`), { activationCloseReadback, roleProgress, workflowReadback, publicationDiagnostics: driver.publicationDiagnostics });
    assert.match(workflow.reply, /已获准并落盘/, `Q10_WORKFLOW_WRITE_BLOCK ${workflow.reply}`);
    assert.ok(workflowBytes); assert.equal(workflowManifest.value.artifacts.workflow?.sha256, createHash("sha256").update(workflowBytes).digest("hex"),
      "Q10_WORKFLOW_FILE_WRITTEN_BUT_GIT_BINDING_UNPROVEN: file success alone is not execution-ready");
    assert.equal(workflowManifest.value.trunkVersion, activeManifest.value.trunkVersion); assert.equal(workflowManifest.value.digest, activeManifest.value.digest);
    assert.equal(workflowManifest.value.source, activeManifest.value.source); assert.deepEqual(workflowManifest.value.actionSource, activeManifest.value.actionSource);
    assert.deepEqual(workflowManifest.value.artifacts.documents, activeManifest.value.artifacts.documents);
    assert.deepEqual(workflowManifest.value.activeRoles, activeManifest.value.activeRoles); assert.equal(workflowManifest.value.activeRevision, 1); assert.equal(workflowManifest.value.activeDigest, activeManifest.value.activeDigest);
    assert.equal(workflowManifest.value.runId, null); assert.equal(workflowManifest.value.frozenRoles, undefined);
    const stableRecords = await createStableWriteStore(driver.root).list(), stableRecord = stableRecords.find(record => record.path === "docs/workflow.md" && record.targetSha256 === workflowManifest.value.artifacts.workflow?.sha256);
    assert.ok(stableRecord); assert.equal(stableRecord.status, "written"); assert.ok(stableRecord.writtenAt); assert.ok(stableRecord.consumedAt);
    const stablePermit = (await createStableWritePermitStore(driver.root).list()).find(permit => permit.permitId === stableRecord.permitId);
    assert.ok(stablePermit); assert.equal(stablePermit.status, "consumed"); assert.ok(stablePermit.consumedAt); assert.equal(stablePermit.targetSha256, stableRecord.targetSha256);
    const operations = await publishedStore.listOperationRecords!(); assert.ok(operations.ok);
    const workflowOperation = operations.value.find(journal => { try { return JSON.parse(journal.message ?? "null")?.schema === "stable-initial-workflow/v1"; } catch { return false; } });
    assert.ok(workflowOperation); assert.equal(workflowOperation.phase, "committed"); assert.equal(workflowOperation.result, "committed");
    const metadata = JSON.parse(workflowOperation.message!); assert.equal(metadata.record.requestId, stableRecord.requestId); assert.equal(metadata.source.requestId, stableRecord.requestId);
    const immutableSource = await readGitInitialWorkflowSource(driver.root, workflowOperation.operationId!); assert.ok(immutableSource.ok);
    const sourceFact = JSON.parse(Buffer.from(immutableSource.value.bytesBase64, "base64").toString("utf8")); assert.deepEqual(sourceFact, metadata.source);
    const workflowFacts = await driver.observe(), workflowTask = workflowFacts.tasks.find(task => task.created?.idempotencyKey === "q9-dispatch-workflow"); assert.ok(workflowTask);
    assert.equal(sourceFact.taskId, workflowTask.taskId); assert.equal(sourceFact.runId, workflowTask.created?.runId); assert.equal(sourceFact.roleId, "convener");
    assert.ok(driver.trace.some(turn => turn.creationFacts.entries.some(entry => entry.sessionId === sourceFact.coreSessionId && entry.roleId === "convener")));
    const gitJournal = await createGitRefStore(driver.root).readJournal(workflowOperation.operationId!); assert.ok(gitJournal); assert.equal(gitJournal.phase, "published");
    assert.deepEqual(gitJournal.newOid, await store.readRef("refs/ans/trunk"));
    workflowReadback = { ...initialWorkflowReadback, stableRecord, stablePermit, operation: workflowOperation, gitJournal, immutableSource: immutableSource.value, source: sourceFact, task: workflowTask };
    await driver.save(path.join(evidence, `${caseTag}-first-git-workflow-proof.json`), { activationReadback, activationCloseReadback, workflowReadback, roleProgress });
    if (diagnosticOnly) return;
    releaseWorkflowObservation();
    await driver.bounded("real workflow report and original chief close", async signal => {
      while (!roleProgress.some(item => item.stage === "workflow-close")) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const closedWorkflowObservation = await driver.observe(), closedWorkflowTask = closedWorkflowObservation.tasks.find(task => task.created?.idempotencyKey === "q9-dispatch-workflow");
    assert.ok(closedWorkflowTask); assert.equal(closedWorkflowTask.reports.at(-1)?.status, "done"); assert.equal(closedWorkflowTask.closed?.outcome, "accepted");
    assert.equal(closedWorkflowTask.closed?.by, "chief"); assert.equal(closedWorkflowTask.closed?.operationId, "q11-close-workflow");
    const workflowCloseTurn = driver.trace.find(turn => turn.reply?.tool_calls?.some(call => call.id === "q11-close-workflow")); assert.ok(workflowCloseTurn);
    const workflowCloseCall = workflowCloseTurn.reply?.tool_calls?.find(call => call.id === "q11-close-workflow"); assert.ok(workflowCloseCall);
    const actualWorkflowClose = JSON.parse(workflowCloseCall.function.arguments); assert.equal(actualWorkflowClose.taskId, closedWorkflowTask.taskId); assert.ok(actualWorkflowClose.reportRef);
    workflowCloseReadback = { task: closedWorkflowTask, actualSubmittedClose: actualWorkflowClose,
      actualHandback: workflowCloseTurn.request.messages.findLast(message => message.role === "user")?.content };
    await driver.save(path.join(evidence, `${caseTag}-first-workflow-creator-close-proof.json`), { workflowReadback, workflowCloseReadback });
    releaseWorkflowCloseObservation();
    await driver.bounded("actual execution and worker dispatch preflight", async signal => {
      while (!roleProgress.some(item => item.stage === "worker-dispatch")) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const worker = roleProgress.find(item => item.stage === "worker-dispatch"); assert.ok(worker); assert.match(worker.reply, /任务已派发|已受理/, `Q14_WORKER_DISPATCH_BLOCK ${worker.reply}`);
    const actualPinnedTasks = await driver.observe(), actualChild = actualPinnedTasks.tasks.find(task => task.created?.to === "impl"); assert.ok(actualChild?.created);
    assert.equal(actualChild.created.runState, "pinned"); assert.ok(isTaskParentRef(actualChild.created.parentTaskRef));
    const parent = actualPinnedTasks.tasks.find(task => task.taskId === actualChild.created!.parentTaskRef!.taskId); assert.ok(parent?.created);
    assert.equal(parent.created.to, "convener"); assert.equal(parent.created.runId, actualChild.created.runId); assert.equal(parent.closed, undefined);
    assert.ok(actualChild.created.runId); const runRead = await publishedStore.readRunRecord!(actualChild.created.runId); assert.ok(runRead.ok);
    const run = runRead.value.value; assert.equal(run.state, "pinned"); assert.ok(isSnapshotRef(run.snapshotRef));
    const chiefReadTurn = driver.trace.findLast(turn => turn.role === "chief" && turn.request.messages.some(message => message.tool_call_id === "q69-chief-read-project-workflow")
      && turn.request.messages.some(message => message.tool_call_id === "q69-chief-query-workflow-source")); assert.ok(chiefReadTurn, "ACTUAL_CHIEF_PROJECT_WORKFLOW_READ_MISSING");
    const chiefRead = actualToolReply(chiefReadTurn.request, "q69-chief-read-project-workflow"), prefix = "read_file: docs/workflow.md\n\n"; assert.ok(chiefRead.startsWith(prefix));
    const chiefQuery = actualObservedGit(chiefReadTurn.request, "q69-chief-query-workflow-source"); assert.ok(isGitBasis(chiefQuery.basis) && chiefQuery.basis.oid);
    const workflowGit = createGitCandidateStore(driver.root), workflowBlob = await workflowGit.readBlob(chiefQuery.basis.oid, "docs/workflow.md");
    assert.equal(Buffer.from(workflowBlob.bytesBase64, "base64").toString("utf8"), chiefRead.slice(prefix.length));
    const workflowSHA = createHash("sha256").update(chiefRead.slice(prefix.length)).digest("hex"); assert.ok(isSnapshotArtifactRef(run.workflowRef)); assert.equal(run.workflowRef.sha256, workflowSHA);
    const workflowManifestBlob = await workflowGit.readBlob(chiefQuery.basis.oid, ".ans/trunk/manifest.json");
    const chiefWorkflowManifest: unknown = JSON.parse(Buffer.from(workflowManifestBlob.bytesBase64, "base64").toString("utf8"));
    assert.equal(evidenceField(chiefWorkflowManifest, "schema"), TRUNK_MANIFEST_SCHEMA); const docVersion = evidenceField(chiefWorkflowManifest, "trunkVersion"); assert.ok(typeof docVersion === "number" && Number.isSafeInteger(docVersion));
    await driver.save(path.join(evidence, `${caseTag}-actual-chief-project-workflow-read.json`), { actualChiefToolRequest: chiefReadTurn.request, actualPublicRead: chiefRead, actualPublicQuery: chiefQuery,
      actualGitBlob: workflowBlob, actualManifest: chiefWorkflowManifest, documentVersion: docVersion, actualBytesSHA256: workflowSHA, frozenWorkflowRef: run.workflowRef,
      boundary: "Chief actually read the project workflow through public tools after stable publication; this observation does not attach its full text to every Chief turn or change its Convener owner" });
    const runBytes = await publishedStore.readSnapshot!(run.snapshotRef); assert.ok(runBytes.ok);
    assert.ok(run.frozenRoles && typeof run.frozenRoles === "object" && !Array.isArray(run.frozenRoles));
    const frozen = Reflect.get(run.frozenRoles, "impl"); assert.ok(isFrozenRoleEvidence(frozen));
    assert.equal(frozen.runId, actualChild.created.runId); assert.equal(frozen.pinDigest, run.pinDigest);
    for (const key of FROZEN_ROLE_REF_KEYS) {
      const frozenRef: SnapshotArtifactRef = frozen[key];
      const frozenFile: CompleteSnapshot["files"][number] | undefined = runBytes.value.files.find(file => file.path === frozenRef.path && file.sha256 === frozenRef.sha256);
      assert.ok(frozenFile, `Q15_FROZEN_EVIDENCE_BYTES_MISSING ${key}`);
      assert.equal(createHash("sha256").update(Buffer.from(frozenFile.bytesBase64, "base64")).digest("hex"), frozenRef.sha256);
    }
    await driver.save(path.join(evidence, `${caseTag}-first-pin-child-verified-proof.json`), { parent, child: actualChild, runRead, snapshot: runBytes.value, frozenRole: frozen });
    await driver.bounded("actual worker required surface / scoped write", async signal => {
      while (!roleProgress.some(item => item.stage === "controller-bounded-stop" || item.stage === "worker-candidate-source-gap")) {
        const failed = driver.inspectInventory().sessions.find(session => session.roleId === "impl" && ["open-failed", "dispose-failed"].includes(session.phase));
        if (failed) throw new Error(`Q15_WORKER_OPEN_BLOCK ${JSON.stringify({ phase: failed.phase, errors: failed.errors, coreSessionId: failed.coreSessionId })}`);
        if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    // W5（P1.4 §4.5）：worker 不再据 native/strict surface 阻塞；真实工具面证据单独断言——
    // 结构化写路径不得向 worker 暴露原始 shell 工具（N7：裸 Git 写仍硬拒；声明为事实观察，不是动作门）。
    const workerSurfaceEvidence = roleProgress.find(item => item.stage === "worker-surface-evidence"); assert.ok(workerSurfaceEvidence, "Q14_WORKER_SURFACE_EVIDENCE_MISSING");
    const workerSurfaceFacts: { raw?: unknown } = JSON.parse(workerSurfaceEvidence.reply);
    assert.ok(Array.isArray(workerSurfaceFacts.raw) && workerSurfaceFacts.raw.length === 0, `Q14_WORKER_RAW_SHELL_SURFACE_EXPOSED ${workerSurfaceEvidence.reply}`);
    await driver.bounded("actual worker latest report and matching persisted turn end", async signal => {
      for (;;) {
        const observation = await driver.observe(), child = observation.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-worker");
        const report = child?.reports.at(-1);
        const rows = (await fs.readFile(path.join(driver.root, ".ans/state/logs/impl.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
        if (report?.turnId && rows.some(row => row.kind === "turn.end" && row.turnId === report.turnId)) break;
        if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    await driver.save(path.join(evidence, `${caseTag}-worker-candidate-terminal.json`), { roleProgress });
    if (roleProgress.some(item => item.stage === "controller-bounded-stop")) {
      await driver.bounded("actual controller blocked report reaches chief", async signal => {
        while (!roleProgress.some(item => ["chief-controller-blocked-report-received", "chief-parent-close-gap", "chief-parent-close-result"].includes(item.stage))) {
          if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      await driver.save(path.join(evidence, `${caseTag}-controller-terminal-received.json`), { roleProgress });
    }
    const codeBasisGap = roleProgress.find(item => item.stage === "worker-candidate-source-gap");
    assert.equal(codeBasisGap, undefined, `Q21_ACTUAL_QUERY_CODE_BASIS_UNEXPOSED ${codeBasisGap?.reply}`);
    if (q26Business && publishedDelivery?.status === "published") {
      const terminal = await driver.observe(), parent = terminal.tasks.find(task => task.created?.idempotencyKey === "q11-dispatch-execution"), reviewer = terminal.tasks.find(task => task.created?.idempotencyKey === "q23-dispatch-verifier");
      assert.equal(parent?.closed?.outcome, "accepted"); assert.equal(parent?.closed?.by, "chief"); assert.equal(parent?.closed?.operationId, "q26-close-controller");
      assert.equal(reviewer?.closed?.outcome, "accepted"); assert.equal(reviewer?.closed?.by, "chief");
      assert.ok(customerDeliveryText);
      await driver.bounded("actual chief customer delivery and drained application receiver", async signal => {
        for (;;) {
          const messageSeen = driver.events.some(event => { const raw = JSON.stringify(event); return raw.includes('"roleId":"chief"') && raw.includes('"kind":"message"') && raw.includes(`"summary":${JSON.stringify(customerDeliveryText)}`); });
          const inventory = driver.inspectInventory(), chief = inventory.sessions.find(session => session.roleId === "chief" && session.phase === "live");
          if (messageSeen && chief?.lifecycle?.status === "quiescent" && chief.lifecycle.providerFinished && !inventory.pendingOpens.length && !inventory.activeDeliveries.length && !inventory.queuedDispatches.length) break;
          if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      await driver.save(path.join(evidence, `${caseTag}-new-delivery-controller-closed.json`), { terminal, publishedDelivery, customerDeliveryText, roleProgress });
      return;
    }
    assert.fail("Q21_DOWNSTREAM_CANDIDATE_VERIFIER_DELIVERY_NOT_COVERED; real result saved, no full NEW pass claimed");
  } catch (error) { primaryFailure = { error }; throw error;
  } finally {
    const errorFact = (error: unknown) => error instanceof Error ? { name: error.name, message: error.message, stack: error.stack,
      ...(Object.hasOwn(error, "code") ? { code: Reflect.get(error, "code") } : {}) } : { thrown: String(error) };
    let cleanupFailure: { error: unknown } | undefined;
    let disposeCompleted = false, finalAssertionsCompleted = false;
    try { releaseDocumentObservation(); releasePlanObservation(); releaseActivationObservation(); releaseActivationCloseObservation(); releaseWorkflowObservation(); releaseWorkflowCloseObservation(); await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { primaryError: primaryFailure ? errorFact(primaryFailure.error) : null, handoffReply: handoffReply ?? null, initReply: initReply ?? null,
    actualSource, initializationReadback, initHandoff: initHandoff ?? null, initCloseReply: initCloseReply ?? null,
    firstDocumentReply: firstDocumentReply ?? null,
    firstDocumentReadback,
    planReply: planReply ?? null,
    planReadback, activationReadback, activationCloseReadback, workflowReadback, workflowCloseReadback, roleProgress,
    budget: { diagnosticQueueOnly: q33QueueDiagnostic, httpRequests: q33QueueDiagnostic ? 96 : q23Business ? 256 : 192, wholeTestMs: q33QueueDiagnostic ? 90000 : q26Business ? 300000 : q25Business ? 240000 : q23Business ? 180000 : 240000, perObservationMs: q33QueueDiagnostic ? 30000 : q26Business ? 150000 : q25Business ? 120000 : 90000, retries: 0, expectedRequestsAtMost: q33QueueDiagnostic ? 48 : q27Business ? 180 : 144, runnerIsolation: "none", diagnosticOnly },
    repoPrefilled: false, futurePlanningD3CardsPrefilled: false }); await driver.dispose(); disposeCompleted = true;
    await fs.writeFile(path.join(evidence, `${caseTag}-owned-teardown-facts.json`), JSON.stringify(driver.teardownFacts, null, 2));
    if (q19Diagnostic || q20Profile) { await driver.samplePostCleanupDiagnostics(); timerDiagnostics?.restore(); }
    await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { stage: "after actual NEW dispose and all owned evidence tail writes", wholeNewCase: true });
    assert.deepEqual(driver.errors, [], "Complete NEW must not ignore late fixture or transport callback errors"); finalAssertionsCompleted = true;
    } catch (error) { cleanupFailure = { error }; }
    const failures = [...(primaryFailure ? [primaryFailure.error] : []), ...(cleanupFailure ? [cleanupFailure.error] : [])];
    try { await fs.writeFile(path.join(evidence, `${caseTag}-error-outcomes.json`), JSON.stringify({ at: new Date().toISOString(), caseTag, root: driver.root,
      primaryError: primaryFailure ? errorFact(primaryFailure.error) : null, cleanupError: cleanupFailure ? errorFact(cleanupFailure.error) : null,
      disposeCompleted, finalAssertionsCompleted, driverErrors: [...driver.errors] }, null, 2));
    } catch (error) { failures.push(error); }
    if (cleanupFailure || failures.length > (primaryFailure ? 1 : 0)) throw new AggregateError(failures, "Actual NEW failure and cleanup/evidence errors; no failure suppressed");
  }
}

test(firstNewBusinessName, { timeout: firstNewBusinessTimeoutMs() }, runFirstNewBusinessCase);

// Prepared secondary observation only. Not registered as the P2 initial-order test.
export async function preparedMaterialsFirstObservation() {
  let initReply: string | undefined;
  const driver = await createRealHttpDriver({ "chief:feedback": Array.from({ length: 6 }, () => () => modelDone("已看到内部进度；它不等于正式任务报告/原创建者收口，不释放依赖。")), chief: [
    () => modelCalls(gitTool("q2-first-product", "dispatch_task", { roleId: "product", sideEffect: "docs", flowId: flow, idempotencyKey: "q2-new-project-product",
      task: "起草 docs/product/demo-intent-v1.md（flowId demo，intentId q2-demo）：本项目只让一个worker生成本地文本，先写草稿并submit_report带实际路径；不得伪造确认或初始化.git。",
      expectedOutput: intentPath })),
    body => { assert.match(actualToolReply(body, "q2-first-product"), /任务已派发|已受理/); return modelDone("等产品真实报告；未报告/未合法收口不放行依赖。" ); },
    body => modelCalls(gitTool("q2-close-product", "close_created_task", originalCreatorClose(body, "q2-close-product-draft"))),
    body => { assert.match(actualToolReply(body, "q2-close-product"), /accepted|closed/); return modelCalls(gitTool("q2-real-intent", "request_choice", {
      cardKind: "intent-confirm", flowId: flow, intentId: "q2-demo", title: "确认实际产品意图", question: "核对已展示产品意图字节后确认？",
      options: [{ id: "confirm", label: "Confirm", recommended: true }, { id: "revise", label: "Revise" }] })); },
    body => { assert.match(actualToolReply(body, "q2-real-intent"), /confirm/); return modelCalls(gitTool("q2-plan-draft", "dispatch_task", {
      roleId: "rapporteur", flowId: flow, sideEffect: "docs", idempotencyKey: "q2-rapporteur-draft", expectedOutput: "六份真实规划文档",
      task: "按已确认 docs/product/demo-intent-v1.md 编写demo proposal/modules/roster/topology/architecture/assets v1文档；不填D3/角色卡/workflow/有效pin；submit_report带真实路径。" })); },
    body => { assert.match(actualToolReply(body, "q2-plan-draft"), /任务已派发|已受理/); return modelDone("等待策划真实规划报告。" ); },
    body => modelCalls(gitTool("q2-close-plan", "close_created_task", originalCreatorClose(body, "q2-close-planning-draft"))),
    body => { assert.match(actualToolReply(body, "q2-close-plan"), /accepted|closed/); return modelCalls(gitTool("q2-publish-plan", "dispatch_task", {
      roleId: "product", flowId: flow, sideEffect: "docs", idempotencyKey: "q2-product-direct-plan", expectedOutput: "真实首建规划trunk回执",
      task: "核真实demo规划文档，调用submit_version_change version-upgrade,baseTrunk:null整单直接首建规划主干；不得造workflow/D3/卡/pin，报告真实回执。" })); },
    body => { assert.match(actualToolReply(body, "q2-publish-plan"), /任务已派发|已受理/); return modelDone("等待产品整单真实提交报告。" ); },
    body => modelCalls(gitTool("q2-close-published-plan", "close_created_task", originalCreatorClose(body, "q2-close-published-plan"))),
    body => { assert.match(actualToolReply(body, "q2-close-published-plan"), /accepted|closed/); return modelCalls(gitTool("q2-convener-init", "dispatch_task", {
      roleId: "convener", flowId: flow, sideEffect: "docs", idempotencyKey: "q2-convener-initialize", expectedOutput: "合法受控git init实际回执",
      task: "依据实际demo规划主干作规划协调；通过git_candidate init首建真实仓库，若保护/lease前提不足如实blocked并submit_report；不得裸写.git或绕过真实回执。" })); },
    body => { assert.match(actualToolReply(body, "q2-convener-init"), /任务已派发|已受理/); return modelDone("等待运营真实首建回执。" ); },
    () => modelDone("保留实际运营阻点；未合法accepted收口的任务不释放依赖。"),
  ], product: [
    () => modelCalls(gitTool("q2-product-write", "write_file", { path: intentPath, content: "---\nschema: project-intent/v1\nflowId: demo\nintentId: q2-demo\nversion: 1\n---\n# Local text task\nOne worker produces src/impl/result.txt; no external resources.\n" })),
    body => { assert.match(actualToolReply(body, "q2-product-write"), /已获准并落盘/); return modelCalls(gitTool("q2-product-report", "submit_report", {
      status: "completed", summary: "已真实起草产品意图，尚未客户确认/冻结或发布。", evidence: [intentPath] })); },
    body => { actualToolReply(body, "q2-product-report"); return modelDone("产品意图草稿已交真实创建者。" ); },
    () => modelCalls(gitTool("q2-direct-plan", "submit_version_change", { operationId: "q2-direct-first-plan", kind: "version-upgrade", flowId: flow,
      baseTrunk: null, summary: "整单首建真实规划，不含执行授权", targets: Object.keys(docs).map(path => ({ kind: path.includes("roster") ? "roster" : "contract", path, action: "add", expectedFromSha256: null })) })),
    body => { assert.match(actualToolReply(body, "q2-direct-plan"), /applied|committed-pending-recovery/); return modelCalls(gitTool("q2-direct-report", "submit_report", {
      status: "completed", summary: "已得到真实规划trunk提交回执。", evidence: Object.keys(docs) })); },
    body => { actualToolReply(body, "q2-direct-report"); return modelDone("规划发布事实已回报创建者。" ); },
  ], rapporteur: [
    () => modelCalls(...Object.entries(docs).map(([path, content], i) => gitTool(`q2-plan-write-${i}`, "write_file", { path, content }))),
    body => { for (let i = 0; i < Object.keys(docs).length; i++) assert.match(actualToolReply(body, `q2-plan-write-${i}`), /已获准并落盘/);
      return modelCalls(gitTool("q2-planning-report", "submit_report", { status: "completed", summary: "六份实际规划文档已落盘；无D3/角色卡/workflow/有效pin。", evidence: Object.keys(docs) })); },
    body => { actualToolReply(body, "q2-planning-report"); return modelDone("真实规划草稿报告已交回。" ); },
  ], convener: [
    () => modelCalls(gitTool("q2-product-init", "git_candidate", {
      operationId: "q2-new-init", action: "init", base: { ref: "refs/ans/trunk", oid: null }, message: "Initialize the actual empty project through the governed candidate capability" })),
    body => { initReply = actualToolReply(body, "q2-product-init"); return modelCalls(gitTool("q2-product-blocked-report", "submit_report", {
      status: "blocked", summary: `真实Git首建回执：${initReply}`, evidence: [] })); },
    body => { actualToolReply(body, "q2-product-blocked-report"); return modelDone("保留真实首建阻点，未生成有效ref/计划/D3/卡/pin。" ); },
  ] }, { tag: "new", requestLimit: 40, timeoutMs: 10000 });
  try {
    assert.deepEqual(await fs.readdir(driver.root), [], "No repository or app authority is prefilled before the real public entry");
    await driver.openChief(); await driver.sendChief("建立一个真正新的本地项目，先派产品起草意图，不预建仓库/角色。" );
    await driver.bounded("real product init/result/report", async signal => {
      for (;;) {
        if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        for (const card of driver.pending.values()) {
          assert.equal(card.request.cardKind, "intent-confirm", `Q2_UNEXPECTED_CUSTOMER_CARD ${card.request.cardKind}`);
          assert.match(card.request.preview ?? "", /docs\/product\/demo-intent-v1\.md/);
          assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true);
        }
        const actual = await driver.observe();
        if (initReply !== undefined && actual.tasks.some(task => task.reports.length > 0)) return;
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const actual = await driver.observe(); assert.deepEqual(actual.ledgerErrors, []);
    assert.ok(actual.tasks.some(task => task.created?.from === "chief" && task.created.to === "product"));
    assert.equal(actual.tasks.find(task => task.created?.to === "convener")?.closed?.outcome === "accepted", false);
    assert.deepEqual(driver.errors, [], "A production blocked receipt differs from HTTP script exhaustion");
    assert.match(initReply!, /prepared/,
      "Q2_FIRST_REAL_INIT_BLOCK: do not replace this governed init with fixture git init, fake lease or synthetic accepted state");
  } finally { await driver.save(path.join(evidence, "q2-new-project-first-block.json"), { initReply: initReply ?? null, existingRepoLifecycleRun: false }); await driver.dispose(); }
}


test("Q36 shared full business registration identity", { timeout: 10000 }, async () => {
  assert.equal(standaloneBusiness, false); assert.ok(nodeTest);
  assert.equal(registeredCases.find(entry => entry.name === firstNewBusinessName)?.run, runFirstNewBusinessCase);
  assertBoundedChangeHandoffProtocol();
  const fixedStart = 1000000, phaseEnd = fixedStart + 120000, afterPrefix = fixedStart + 44000;
  assert.equal(fixtureWaitBudgetMs(45000, phaseEnd, afterPrefix), 45000, "Unchanged default waits retain their original local limit");
  assert.equal(fixtureWaitBudgetMs(45000, phaseEnd, afterPrefix, true), 76000, "Already spent44s cannot restart a fresh120s wait");
  assert.equal(fixtureWaitBudgetMs(45000, Math.min(phaseEnd, fixedStart + 90000), afterPrefix, true), 46000, "Shared earlier absolute deadline tightens the remaining phase");
  assert.equal(fixtureWaitBudgetMs(45000, phaseEnd, phaseEnd + 1, true), -1, "Expired budget is rejected by bounded before any wait starts");
  assert.throws(() => fixtureWaitBudgetMs(45000, undefined, afterPrefix, true));
  await fs.writeFile(path.join(evidence, "q36-node-test-registration-check.json"), JSON.stringify({ at: new Date().toISOString(), mode: "default node:test", targetUsesSameCompleteFunction: true, defaultFullEntry: process.env.ANS_DIRECT_NODETEST === "1" ? "explicit-direct-diagnostic" : "await-owned-child", registeredNames: registeredCases.map(entry => entry.name), businessExecuted: false }, null, 2));
});

/** Executable CHANGE entry on the actual previously published project; no new init or seeded state. */
export async function runDeliveredChangeEntryCase() {
  const caseTag = process.env.ANS_CHANGE_CASE_TAG ?? "q37-change", proofFile = process.env.ANS_CHANGE_BASE_PROOF ?? path.join(evidence, "q36-complete-new-summary.json");
  assert.match(caseTag, /^q(?:[1-9]\d{0,5}|40-0[23])-change$/);
  const op = (suffix: string) => `${caseTag}-${suffix}`;
  const deadlineAt = phaseDeadline(90000);
  const proofSha256 = process.env.ANS_CHANGE_BASE_PROOF_SHA ?? "a1aac1cd8e0c0892c2b6dbe88bf8720e8a280a5b4374be45d4af47c1e1d2e0fa";
  const prior = JSON.parse(await fs.readFile(proofFile, "utf8"));
  if (process.env.ANS_CHANGE_REQUIRE_CLEAN_SEED === "1") {
    await verifyChangeBaseReceipt(prior);
  }
  const publication: unknown = prior.published ?? prior.extra?.publishedDelivery;
  assert.ok(isGitCapabilityResult(publication) && publication.status === "published" && publication.published);
  const delivered = publication.published; const deliveredOid = delivered.oid; assert.ok(isGitOid(deliveredOid), "Existing published delivery requires its actual non-null full OID");
  const draftPath = "docs/product/q2-new-intent-v2.md";
  const content = `---\nschema: project-intent/v1\nflowId: q2-new\nintentId: ${op("intent")}\nversion: 2\n---\n# Requested change\nChange the delivered local text output to a second explicitly agreed text version; retain src/impl/ ownership. Document publication, rapporteur run selection, actual execution, independent final OID review and delivery remain separate.\n`;
  let complete = false, queryReply: string | undefined, closeReply: string | undefined;
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>;
  const feedbackSeen = new Set<string>();
  const acknowledgeDraftClosure = (recipient: "chief" | "convener"): HttpScripts[string][number] => async body => {
    const text = actualApplicationNotice(body); assert.ok(text);
    const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === op("product"));
    assert.ok(task?.created && task.closed); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "product");
    assert.equal(task.closed.by, "chief"); assert.equal(task.closed.outcome, "accepted"); assert.equal(task.closed.operationId, op("close-product"));
    const source = task.closed.actionSource;
    assert.ok(source?.kind === "role-direct" && source.action === "close-created-task" && source.actorRoleId === "chief");
    assert.equal(source.operationId, op("close-product"));
    assert.ok("targetDigest" in source && typeof source.targetDigest === "string" && /^[a-f0-9]{64}$/.test(source.targetDigest));
    assert.ok("applicationId" in source && typeof source.applicationId === "string" && source.applicationId.length > 0);
    assert.ok("runId" in source); assert.equal(source.runId, task.created.runId);
    assert.equal(text, `[应用·文档更新] close-created-task ${op("close-product")} applied; ${source.targetDigest}`);
    const key = `${recipient}:${task.taskId}:${source.applicationId}:${source.operationId}:${source.targetDigest}`;
    assert.equal(feedbackSeen.has(key), false, "Repeated current-operation application notice is not silently swallowed"); feedbackSeen.add(key);
    return modelDone(`只确认应用实际已入账的本任务收口通知 ${source.operationId}/${source.applicationId}/${task.taskId}，不创建新任务、批准或执行授权。`);
  };
  driver = await createRealHttpDriver({
    chief: [
      () => modelCalls(gitTool(op("delivery-query"), "git_query", { operationId: op("delivery-query"), template: "log", limit: 1, target: deliveredOid })),
      body => {
        queryReply = actualToolReply(body, op("delivery-query"));
        assert.ok(queryReply.includes("{"), `CHANGE_QUERY_ACTUAL_TOOL_REJECTION ${queryReply}`);
        const result: unknown = JSON.parse(queryReply.slice(queryReply.indexOf("{")));
        assert.ok(isGitCapabilityResult(result) && result.status === "observed", `Q37_EXISTING_DELIVERY_QUERY_BLOCK ${queryReply}`);
        assert.ok(result.output?.startsWith(deliveredOid.hex), "Actual public query must observe the specified existing delivered OID");
        return modelCalls(gitTool(op("product"), "dispatch_task", { roleId: "product", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("product"),
          task: `需求变更：以实际已交付 ${delivered.ref}@${deliveredOid.hex} 为起点，仅起草 ${draftPath} 的版本2产品意图并正式回报。复用现有repo；不init，不预填新D3/卡/workflow/pin，不把此草稿当新执行授权。`, expectedOutput: draftPath }));
      },
      body => { assert.match(actualToolReply(body, op("product")), /已派发|已受理/); return modelDone("等待实际产品变更草稿及报告；旧交付保持有效。" ); },
      body => modelCalls(gitTool(op("close-product"), "close_created_task", originalCreatorClose(body, op("close-product")))),
      async body => {
        closeReply = actualToolReply(body, op("close-product")); const actual = await driver.observe();
        const task = actual.tasks.find(task => task.created?.idempotencyKey === op("product"));
        assert.equal(task?.closed?.outcome, "accepted", `Q37_CHANGE_DRAFT_CLOSE_BLOCK ${closeReply}`); assert.equal(task.closed.by, "chief");
        complete = true; return modelDone("已合法收口真实变更意图草稿；尚未确认新意图、发布新文档、选择run模式或完成新交付。" );
      },
    ],
    product: [
      () => modelCalls(gitTool(op("intent-write"), "write_file", { path: draftPath, content })),
      body => { assert.match(actualToolReply(body, op("intent-write")), /已获准并落盘/);
        return modelCalls(gitTool(op("intent-report"), "submit_report", { status: "completed", summary: "Q37变更意图v2真实草稿已写入；等待chief原创建者收口及客户确认实际字节。", evidence: [draftPath] })); },
      body => { actualToolReply(body, op("intent-report")); return modelDone("Q37变更草稿已正式回报，未发布或批准执行。" ); },
    ],
    "chief:feedback": [body => {
      const key = ownProducedFeedback(body, driver.trace, ["product", "convener:application-notice"]);
      assert.equal(feedbackSeen.has(key), false); feedbackSeen.add(key); return modelDone("已收到真实角色回执进度；依正式报告和原创建者收口继续。" );
    }],
    "chief:application-notice": [acknowledgeDraftClosure("chief")],
    "convener:application-notice": [acknowledgeDraftClosure("convener")],
  }, { tag: caseTag, existingOwnedProject: { proofFile, proofSha256 }, requestLimit: 48, timeoutMs: 30000,
    caseDeadlineAt: deadlineAt, finiteRoles: { chief: { initial: 0, tasks: { [op("product")]: 3 } } },
    reusableNoticeKeys: ["chief:feedback", "chief:application-notice", "convener:application-notice"] });
  let phasePrimary: { error: unknown } | undefined;
  try {
    await driver.bounded("existing owned project chief entry", () => driver.openChief());
    await driver.sendChief(`需求变更：复用实际已交付项目 ${delivered.ref}@${deliveredOid.hex}，先让产品起草版本2目标；不重新init或预填授权。`);
    await driver.bounded("actual change product draft and original creator closure", async signal => {
      while (!complete) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    assert.equal(await fs.readFile(path.join(driver.root, draftPath), "utf8"), content);
    assert.deepEqual(await createGitCandidateStore(driver.root).readRef(delivered.ref), deliveredOid);
    assert.equal(driver.trace.some(row => row.reply?.tool_calls?.some(call => call.function.name === "ans_git_candidate")), false, "CHANGE entry must not initialize or manufacture a new candidate");
  } catch (error) { phasePrimary = { error }; throw error;
  } finally { await preservePhaseCleanup(caseTag, phasePrimary, async () => {
    await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { phaseOnly: "existing delivery -> actual v2 product draft -> original creator close", fullChangePass: false,
      caseTag, deadlineAt, complete, remaining: "Real intent confirmation, new document CAS, rapporteur three-mode selection, execution/quality/delivery still require subsequent receiver phases", queryReply, closeReply });
    await driver.dispose();
    await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { stage: "after actual dispose and all owned tail writes", phaseOnly: true, fullChangePass: false, complete });
    if (complete) assert.deepEqual(driver.errors, [], "A partial CHANGE entry must also reject late fixture callback errors");
  }); }
}

test("Q37 CHANGE existing-delivery entry to actual product draft creator-close", { timeout: 90000, skip: process.env.ANS_Q37_CHANGE_ENTRY !== "1" }, runDeliveredChangeEntryCase);

/** Continuation of the actual closed CHANGE draft, not a synthesized new baseline. */
export async function runChangeIntentAndPlanningCase() {
  const caseTag = process.env.ANS_CHANGE_PLAN_CASE_TAG ?? "q43-planning";
  assert.match(caseTag, /^q[1-9]\d{0,5}-planning$/);
  const op = (suffix: string) => `${caseTag}-${suffix}`;
  const priorTag = process.env.ANS_CHANGE_PRIOR_CASE_TAG ?? "q43-change", intentId = `${priorTag}-intent`;
  assert.match(priorTag, /^q(?:[1-9]\d{0,5}|40-0[23])-change$/);
  const baseProof = process.env.ANS_CHANGE_BASE_PROOF ?? path.join(evidence, "q38-new-delivery-controller-closed.json");
  const baseProofSha = process.env.ANS_CHANGE_BASE_PROOF_SHA ?? "23733a45002c6ec076e7b112ab18887a6fe7139870067f7d0c7505543d3b96e7";
  const draftProofBytes = await fs.readFile(process.env.ANS_CHANGE_DRAFT_PROOF ?? path.join(evidence, "q43-change-full-final-proof.json"));
  const draftProof = JSON.parse(draftProofBytes.toString("utf8"));
  assert.equal(draftProof.extra?.complete, true);
  const priorFixtureErrors: unknown[] = [];
  if (process.env.ANS_CHANGE_REQUIRE_CLEAN_SEED === "1") assert.deepEqual(draftProof.errors, []);
  for (const failure of draftProof.trace.filter((row: HttpTrace) => row.error)) {
    assert.equal(failure.role, "chief:feedback");
    ownProducedFeedback(failure.request, draftProof.trace, ["convener:application-notice"]);
    priorFixtureErrors.push(failure.error);
  }
  assert.deepEqual(draftProof.errors, priorFixtureErrors, "Do not normalize or drop unknown errors in prior input evidence");
  const priorTask = draftProof.observation.tasks.find((task: { created?: { idempotencyKey?: string } }) => task.created?.idempotencyKey === `${priorTag}-product`);
  assert.equal(priorTask?.closed?.operationId, `${priorTag}-close-product`); assert.equal(priorTask.closed.outcome, "accepted");
  const intentPath = "docs/product/q2-new-intent-v2.md", intentBytes = await fs.readFile(path.join(draftProof.root, intentPath));
  assert.ok(intentBytes.toString("utf8").includes(`intentId: ${intentId}\nversion: 2\n`));
  const documents = Object.fromEntries(Object.entries(docs).map(([p, text]) => [p.replaceAll("demo", "q2-new").replaceAll("-v1.md", "-v2.md"),
    text.replaceAll("demo", "q2-new").replaceAll("-v1.md", "-v2.md").replace(/intentId: [^\n]+/, `intentId: ${intentId}`).replace(/version: 1\n/, "version: 2\n")]));
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, complete = false, sendError: unknown;
  let send: Promise<void> | undefined;
  const notices = new Set<string>(), customerDecisions: { requestId: string; actualRequest: unknown; intentSha256: string; source: string }[] = [];
  let confirmedIntentReadback: unknown;
  const acknowledgement = (recipient: string): HttpScripts[string][number] => async body => {
    const text = actualApplicationNotice(body); assert.ok(text);
    const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === op("rapporteur"));
    assert.ok(task?.created && task.closed); assert.equal(task.closed.operationId, op("close-rapporteur")); assert.equal(task.closed.outcome, "accepted");
    assert.equal(task.created.flowId, "q2-new"); assert.equal(task.created.to, "rapporteur"); assert.equal(task.closed.by, "chief");
    const source = task.closed.actionSource; assert.ok(source?.kind === "role-direct" && source.action === "close-created-task");
    assert.equal(source.actorRoleId, "chief"); assert.equal(source.operationId, op("close-rapporteur"));
    assert.ok("targetDigest" in source && typeof source.targetDigest === "string" && "applicationId" in source && typeof source.applicationId === "string");
    assert.equal(text, `[应用·文档更新] close-created-task ${op("close-rapporteur")} applied; ${source.targetDigest}`);
    const key = `${recipient}:${task.taskId}:${source.applicationId}:${source.targetDigest}`;
    assert.equal(notices.has(key), false); notices.add(key); return modelDone(`只确认本轮真实策划收口通知 ${source.operationId}/${source.applicationId}/${task.taskId}，不冒新文档发布或run选择。`);
  };
  const scripts: HttpScripts = {
    chief: [
      () => modelCalls(gitTool(op("confirm-intent"), "request_choice", { cardKind: "intent-confirm", flowId: "q2-new", intentId,
        title: "确认已展示的版本2产品意图", question: "核对实际产品v2字节后确认本次变更？", options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] })),
      async body => { assert.match(actualToolReply(body, op("confirm-intent")), /confirm/);
        const baseline = await readVersionBaselineState(driver.root), request = customerDecisions.at(-1); assert.ok(request);
        const records = (baseline.text ?? "").split("\n").filter(Boolean).map(line => JSON.parse(line));
        const confirmed = records.find(row => row.flowId === "q2-new" && row.doc === "intent" && row.version === 2
          && row.path === "docs/product/q2-new-intent" && row.sha256 === request.intentSha256 && row.freeze?.reason === "intent-confirmed"
          && row.freeze.source?.requestId === request.requestId);
        confirmedIntentReadback = { requestId: request.requestId, baselineSha256: createHash("sha256").update(baseline.text ?? "").digest("hex"), record: confirmed ?? null };
        assert.ok(confirmed, "CHANGE_V2_INTENT_CONFIRMATION_NOT_PERSISTED_FOR_ACTUAL_REQUEST");
        return modelCalls(gitTool(op("rapporteur"), "dispatch_task", {
        roleId: "rapporteur", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("rapporteur"), expectedOutput: "真实版本2方案/模块/名单/架构材料及正式报告",
        task: `按客户已确认${intentPath}准备q2-new版本2六份规划文档，保留现有impl-core/src/impl/归属；先真实读取该意图。不得伪造D3/激活/执行pin或把文档草稿当已发布。报告所有真实路径。` })); },
      body => { assert.match(actualToolReply(body, op("rapporteur")), /已受理|已派发/); return modelDone("等待真实策划版本2材料报告，未合法收口不推进文档发布。"); },
      body => modelCalls(gitTool(op("close-rapporteur"), "close_created_task", originalCreatorClose(body, op("close-rapporteur")))),
      async body => { const reply = actualToolReply(body, op("close-rapporteur"));
        const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === op("rapporteur"));
        assert.equal(task?.closed?.outcome, "accepted", `CHANGE_PLANNING_CREATOR_CLOSE ${reply}`); assert.equal(task.closed.by, "chief"); complete = true;
        return modelDone("实际变更意图确认与策划材料收口完成；新文档CAS/run模式/执行/质检/交付尚未完成。"); },
    ],
    rapporteur: [
      () => modelCalls(gitTool(op("read-intent"), "read_file", { path: intentPath })),
      body => { assert.ok(actualToolReply(body, op("read-intent")).includes(intentId));
        return modelCalls(...Object.entries(documents).map(([p, content], index) => gitTool(op(`write-${index}`), "write_file", { path: p, content }))); },
      body => { Object.keys(documents).forEach((_, index) => assert.match(actualToolReply(body, op(`write-${index}`)), /已获准并落盘/));
        return modelCalls(gitTool(op("report"), "submit_report", { status: "completed", summary: "真实版本2六份策划材料已写入，未发布新主干或改变旧run。", evidence: Object.keys(documents) })); },
      body => { actualToolReply(body, op("report")); return modelDone("Q43策划v2已正式回报；等待原创建者收口。"); },
    ],
    "chief:feedback": [body => { const key = ownProducedFeedback(body, driver.trace, ["rapporteur", "convener:application-notice", "rapporteur:application-notice", "product:application-notice", "nominator:application-notice", "verifier:application-notice"]);
      assert.equal(notices.has(key), false); notices.add(key); return modelDone("已收到真实角色进度，仍依正式报告及应用收口依据推进。"); }],
  };
  const recipients = ["chief", "convener", "rapporteur", "product", "nominator", "verifier"];
  for (const recipient of recipients) scripts[`${recipient}:application-notice`] = [acknowledgement(recipient)];
  driver = await createRealHttpDriver(scripts, { tag: caseTag, existingOwnedProject: { proofFile: baseProof, proofSha256: baseProofSha }, requestLimit: 48,
    timeoutMs: 30000, caseDeadlineAt: phaseDeadline(90000), finiteRoles: { chief: { initial: 0, tasks: { [op("rapporteur")]: 3 } } },
    reusableNoticeKeys: ["chief:feedback", ...recipients.map(recipient => `${recipient}:application-notice`)] });
  let phasePrimary: { error: unknown } | undefined;
  try {
    assert.equal(driver.root, draftProof.root); await driver.bounded("change confirmation public chief", () => driver.openChief());
    send = driver.sendChief(`接续真实已收口的${intentPath}，确认已展示实际字节后派策划形成版本2材料；复用既有团队，未发布前不把新材料混入旧run。`).then(() => undefined, error => { sendError = error; });
    await driver.bounded("real change intent confirmation and planning creator close", async signal => {
      while (!complete) {
        if (sendError) throw sendError; if (driver.errors.length) throw new Error(driver.errors.join("\n"));
        for (const card of driver.pending.values()) {
          assert.equal(card.request.cardKind, "intent-confirm"); assert.equal(card.request.flowId, "q2-new");
          assert.ok((card.request.preview ?? "").includes(intentPath), "Customer must see the actual v2 intent material");
          customerDecisions.push({ requestId: card.id, actualRequest: card.request, intentSha256: createHash("sha256").update(intentBytes).digest("hex"), source: "test-customer actual requestId response" });
          assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true);
        }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    await send; if (sendError) throw sendError;
    for (const [p, content] of Object.entries(documents)) assert.equal(await fs.readFile(path.join(driver.root, p), "utf8"), content);
  } catch (error) { phasePrimary = { error }; throw error;
  } finally { await preservePhaseCleanup(caseTag, phasePrimary, async () => {
    await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { phaseOnly: true, fullChangePass: false, complete, customerDecisions,
      priorDraftProofSha256: createHash("sha256").update(draftProofBytes).digest("hex"), priorFixtureErrors, confirmedIntentReadback, remaining: "Actual v2 document publication, run-mode selection, execution/quality/delivery not completed" });
    await driver.dispose(); await send;
    await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { stage: "after actual dispose, owned tail writes and actual send settlement", phaseOnly: true, fullChangePass: false, complete, priorFixtureErrors });
    if (complete) assert.deepEqual(driver.errors, [], "Completed planning phase must not ignore late fixture errors");
  }); }
}

test("Q43 CHANGE real intent confirmation and version2 planning creator-close", { timeout: 90000, skip: process.env.ANS_CHANGE_PLAN_STANDALONE !== "1" }, runChangeIntentAndPlanningCase);

type ObservedDocumentBase = { version: number; digest: string; documents: Record<string, { path: string; sha256: string }> };
type VisibleRunChoice = { oldRunId: string; pinDigest: string; targetVersion: number; targetDigest: string; mode: string };
function actualChiefSummary(body: ChatRequest) {
  const summary = /^摘要：([^\n]*)$/m.exec(actualUserInput(body))?.[1]; assert.ok(summary, "ACTUAL_CHIEF_REPORT_SUMMARY_MISSING"); return summary;
}
function boundedRunModePacket(summary: string, expectedOperation: string, state: "blocked" | "applied"):
  { operationId: string; code: string; message: string } | { operationId: string; replacementRunId: string } {
  assert.ok(summary.length <= 200 && !/[\r\n]/.test(summary), "RUN_MODE_SUMMARY_BOUNDARY_INVALID");
  if (state === "blocked") {
    const match = /^RUN_MODE_BLOCKED\|op=([^|]+)\|code=([^|]+)\|reason=([^|]+)\|END$/.exec(summary); assert.ok(match, "RUN_MODE_BLOCKED_PACKET_INVALID");
    assert.equal(match[1], expectedOperation); assert.equal(match[2], "trunk-item-invalid");
    assert.equal(match[3], "Team plan modules reference differs from the applicable immutable baseline");
    return { operationId: match[1]!, code: match[2]!, message: match[3]! };
  }
  const match = /^RUN_MODE_APPLIED\|op=([^|\s]+)\|replacement=([^|\s]+)\|END$/.exec(summary); assert.ok(match, "RUN_MODE_APPLIED_PACKET_INVALID");
  assert.equal(match[1], expectedOperation); return { operationId: match[1]!, replacementRunId: match[2]! };
}
function actualOwnRunChoice(body: ChatRequest, taskKey: string, expected: VisibleRunChoice, expectedTaskId: string) {
  const taskId = /^任务：#([^\s]+)$/m.exec(actualUserInput(body))?.[1]; assert.equal(taskId, expectedTaskId, "CHIEF_REPORT_TASK_BINDING_CHANGED");
  const call = body.messages.flatMap(message => message.tool_calls ?? []).findLast(c => c.id === taskKey && c.function.name === "ans_dispatch_task");
  assert.ok(call, "CHIEF_ACTUAL_OWN_MODE_DISPATCH_INFORMATION_GAP"); const args: unknown = JSON.parse(call.function.arguments);
  assert.equal(evidenceField(args, "roleId"), "rapporteur"); assert.equal(evidenceField(args, "flowId"), "q2-new"); assert.equal(evidenceField(args, "idempotencyKey"), taskKey);
  const text = evidenceField(args, "task"); assert.ok(typeof text === "string");
  const visible = /实际新文档t([1-9]\d*)\/([a-f0-9]{64})已发布。对原真实run ([^、\s]+)、pin ([a-f0-9]{64})显式选择 (continue-frozen|stop-and-restart|stop)；/.exec(text);
  assert.ok(visible, "CHIEF_ACTUAL_OWN_RUN_TARGET_INFORMATION_GAP");
  const result = { oldRunId: visible[3]!, pinDigest: visible[4]!, targetVersion: Number(visible[1]), targetDigest: visible[2]!, mode: visible[5]! };
  assert.deepEqual(result, expected, "CHIEF_ACTUAL_OWN_TASK_RUN_TARGET_CHANGED"); return result;
}
function boundedRepairPlanPacket(summary: string, expectedOperation: string, expectedPath: string) {
  assert.ok(summary.length <= 200); const match = /^TEAM_PLAN_REPAIR_APPLIED\|op=([^|\s]+)\|plan=([^|\s]+)\|END$/.exec(summary);
  assert.ok(match, "CHIEF_REPAIRED_PLAN_VISIBLE_PATH_INFORMATION_GAP"); assert.equal(match[1], expectedOperation); assert.equal(match[2], expectedPath); return match[2]!;
}
function assertBoundedChangeHandoffProtocol() {
  const operation = "q65-publication-select-mode", reason = "Team plan modules reference differs from the applicable immutable baseline";
  const blocked = `RUN_MODE_BLOCKED|op=${operation}|code=trunk-item-invalid|reason=${reason}|END`;
  const applied = `RUN_MODE_APPLIED|op=${operation}-recheck|replacement=run-replacement-${"b".repeat(48)}|END`;
  const planPath = "docs/scheduling/q2-new-team-v2.md", planOperation = "q65-publication-repair-complete-plan";
  const plan = `TEAM_PLAN_REPAIR_APPLIED|op=${planOperation}|plan=${planPath}|END`;
  for (const packet of [blocked, applied, plan, "CURRENT_ACTIVE_APPLIED|op=q65-publication-refresh-active|END"]) {
    assert.ok(packet.length <= 200); assert.equal(shortenSummary(packet), packet); assert.equal(shortenSummary(` \n${packet}\n `), packet);
  }
  assert.equal(boundedRunModePacket(shortenSummary(` \n${blocked}\n `), operation, "blocked").operationId, operation);
  boundedRunModePacket(applied, `${operation}-recheck`, "applied"); boundedRepairPlanPacket(plan, planOperation, planPath);
  const rejected = [blocked.slice(0, -4), `${blocked}extra`, blocked.replace("trunk-item-invalid", "another-code"), blocked.replace(reason, "A different actual rejection"), blocked.replace(operation, "wrong-operation"), shortenSummary(blocked.replace("|END", `${"x".repeat(201)}|END`))];
  rejected.forEach(packet => assert.throws(() => boundedRunModePacket(packet, operation, "blocked")));
  assert.throws(() => boundedRunModePacket(applied.slice(0, -4), `${operation}-recheck`, "applied"));
  assert.throws(() => boundedRunModePacket(applied, "wrong-operation", "applied"));
  assert.throws(() => boundedRepairPlanPacket(plan.slice(0, -4), planOperation, planPath));
  assert.throws(() => boundedRepairPlanPacket(plan, planOperation, "docs/scheduling/other-plan.md"));
  const expected = { oldRunId: "run-existing-readable-context", pinDigest: "a".repeat(64), targetVersion: 3, targetDigest: "c".repeat(64), mode: "stop-and-restart" };
  const taskKey = "q65-publication-mode-task", taskId = "task-parser-contract-only";
  const taskText = `实际新文档t3/${expected.targetDigest}已发布。对原真实run ${expected.oldRunId}、pin ${expected.pinDigest}显式选择 stop-and-restart；`;
  const request = (text: string, ownTaskKey = taskKey, reportTaskId = taskId): ChatRequest => ({ model: "bounded-packet-parser-only", messages: [
    { role: "assistant", tool_calls: [gitTool(ownTaskKey, "dispatch_task", { roleId: "rapporteur", flowId: "q2-new", idempotencyKey: ownTaskKey, task: text })] },
    { role: "user", content: `[工作结果]\n任务：#${reportTaskId}\n摘要：${blocked}` },
  ] });
  assert.equal(actualChiefSummary(request(taskText)), blocked); actualOwnRunChoice(request(taskText), taskKey, expected, taskId);
  assert.throws(() => actualOwnRunChoice(request(taskText, "wrong-own-task"), taskKey, expected, taskId));
  assert.throws(() => actualOwnRunChoice(request(taskText, taskKey, "wrong-report-task"), taskKey, expected, taskId));
  assert.throws(() => actualOwnRunChoice(request(taskText.replace(expected.oldRunId, "another-run")), taskKey, expected, taskId));
  assert.throws(() => actualOwnRunChoice(request(taskText.replace(expected.targetDigest, "d".repeat(64))), taskKey, expected, taskId));
  console.log("Q65_BOUNDED_HANDOFF_PROTOCOL actual shortenSummary/200 boundary, exact code+reason+op, terminator, actual own task/run/target guards verified; no business/runtime/approval state created");
}
function actualObservedGit(body: ChatRequest, id: string) {
  const reply = actualToolReply(body, id), start = reply.indexOf("{"); assert.ok(start >= 0, `ACTUAL_GIT_TOOL_REJECTION ${reply}`);
  const parsed: unknown = JSON.parse(reply.slice(start)); assert.ok(isGitCapabilityResult(parsed));
  assert.equal(parsed.operationId, id); assert.equal(parsed.status, "observed", `ACTUAL_GIT_QUERY_BLOCK ${reply}`); return parsed;
}
function documentBaseFromGitOutput(result: GitCapabilityResult): ObservedDocumentBase {
  assert.equal(result.truncated, false); assert.ok(result.output, "Actual Git query did not expose the required manifest bytes");
  const value = JSON.parse(result.output); assert.equal(value.schema, TRUNK_MANIFEST_SCHEMA);
  assert.ok(Number.isSafeInteger(value.trunkVersion) && value.trunkVersion > 0); assert.match(value.digest, /^[a-f0-9]{64}$/);
  const documents: ObservedDocumentBase["documents"] = {};
  for (const kind of ["proposal", "modules", "roster", "topology", "architecture", "assets"]) {
    const ref = value.artifacts?.documents?.[kind]; assert.ok(ref && typeof ref.path === "string" && typeof ref.sha256 === "string");
    assert.match(ref.sha256, /^[a-f0-9]{64}$/); documents[kind] = { path: ref.path, sha256: ref.sha256 };
  }
  return { version: value.trunkVersion, digest: value.digest, documents };
}

/** Actual publication/run-choice continuation; ordinary expected data only, never a host authorization seam. */
export async function runChangePublicationAndModeCase() {
  const publicationDeadlineAt = phaseDeadline(120000);
  const round = process.env.ANS_CHANGE_PUBLICATION_ROUND; assert.ok(round && /^q[1-9]\d{0,5}$/.test(round));
  const caseTag = `${round}-publication`, op = (suffix: string) => `${caseTag}-${suffix}`;
  const proofFile = process.env.ANS_CHANGE_BASE_PROOF ?? path.join(evidence, `${round}-new-clean-delivery-seed.json`), proofBytes = await fs.readFile(proofFile), seed = JSON.parse(proofBytes.toString("utf8"));
  await verifyChangeBaseReceipt(seed);
  const completed = continuousChangeChild ? await verifiedProofLink(seed.completedProof)
    : JSON.parse(await fs.readFile(JSON.parse(await fs.readFile(seed.parentProof.path, "utf8")).result.completedProof.path, "utf8"));
  const oldTask = completed.extra.terminal.tasks.find((task: { created?: { idempotencyKey?: string } }) => task.created?.idempotencyKey === "q11-dispatch-execution");
  assert.ok(oldTask?.created?.runId); const oldRunId: string = oldTask.created.runId;
  const store = createProjectTrunkStore(seed.root), before = await store.readRunRecord!(oldRunId); assert.ok(before.ok); assert.equal(before.value.value.state, "pinned");
  const pinDigest = before.value.value.pinDigest; assert.ok(typeof pinDigest === "string" && /^[a-f0-9]{64}$/.test(pinDigest));
  const plan = JSON.parse(await fs.readFile(path.join(evidence, `${round}-planning-after-cleanup-proof.json`), "utf8"));
  assert.equal(plan.root, seed.root); assert.equal(plan.extra.complete, true); assert.deepEqual(plan.errors, []);
  const planningTask = plan.observation.tasks.find((task: { created?: { idempotencyKey?: string } }) => task.created?.idempotencyKey === `${round}-planning-rapporteur`);
  assert.equal(planningTask?.closed?.outcome, "accepted"); assert.equal(planningTask.closed.by, "chief");
  const reportClues: string[] = planningTask.reports.at(-1)?.evidence ?? [];
  reportClues.forEach(p => assert.match(p, /^docs\/(?:proposals|contracts)\/q2-new-(?:proposal|modules|roster|topology|architecture|assets)-v2\.md$/));
  let paths: string[] = [];
  const documentBytes = new Map<string, { bytes: number; sha256: string }>();
  const mode = process.env.ANS_CHANGE_RUN_MODE ?? "stop-and-restart"; assert.ok(mode === "continue-frozen" || mode === "stop-and-restart" || mode === "stop");
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, base: ObservedDocumentBase | undefined, target: ObservedDocumentBase | undefined;
  let targetOid: GitOid | undefined, publicationReply: string | undefined, modeReply: string | undefined, complete = false;
  let modeBlockedReport: { operationId: string; code: string; message: string; taskId: string } | undefined;
  let repairBase: ObservedDocumentBase | undefined, repairPlanText: string | undefined, repairPlanReceipt: string | undefined;
  let chiefVisiblePlanPath: string | undefined;
  let currentModeTaskKey = op("mode-task"), activeModeOperation = op("select-mode");
  let nominationRefs: { planRef: SnapshotArtifactRef; rosterRef: SnapshotArtifactRef } | undefined, newD3DecisionId: string | undefined;
  const currentRolePaths = ["角色卡/impl/role-card.md", "角色卡/impl/boundary.md", "角色卡/impl/boundary.yaml"];
  const currentRoleBytes = new Map<string, { path: string; sha256: string }>();
  const recoveryCustomerDecisions: { requestId: string; actualRequest: unknown; source: string }[] = [];
  const repairPlanPath = "docs/scheduling/q2-new-team-v2.md";
  let chiefVisibleTarget: { version: number; digest: string } | undefined;
  let chiefVisibleRecheckTarget: { version: number; digest: string } | undefined;
  let chiefVisiblePublicationRefs: string[] = [], modeReportPaths: string[] = [];
  let chiefVisibleRestart: { oldRunId: string; operationId: string; replacementRunId: string; targetVersion: number; targetDigest: string } | undefined;
  const seen = new Set<string>(), recipients = ["chief", "convener", "product", "rapporteur", "nominator", "verifier"];
  const scripts: HttpScripts = { chief: [
    body => { assert.ok(actualUserInput(body).includes(oldRunId) && actualUserInput(body).includes(pinDigest));
      return modelCalls(gitTool(op("publish-task"), "dispatch_task", { roleId: "product", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("publish-task"),
      task: `发布客户已确认且策划已真实收口的q2-new版本2六文档。报告可见路径线索 ${JSON.stringify(reportClues)}。通过list_dir docs/proposals和docs/contracts发现实际v2六类文件，再read_file核字节；裁剪报告不是完整清单或权限票。随后查询当前Git主干manifest，按actual旧ref/hash整单submit_version_change；不重写旧run/pin或伪造批准。`, expectedOutput: "真实v2文档发布回执" })); },
    body => { assert.match(actualToolReply(body, op("publish-task")), /已受理|已派发/); return modelDone("等待产品真实发布报告，候选/报告不替代原创建者收口。"); },
    body => { const visible = /真实文档t([1-9]\d*)\/([a-f0-9]{64})已发布/.exec(actualUserInput(body));
      assert.ok(visible, "CHIEF_PUBLICATION_TARGET_INFORMATION_GAP"); chiefVisibleTarget = { version: Number(visible[1]), digest: visible[2]! };
      chiefVisiblePublicationRefs = [...actualUserInput(body).matchAll(/^  - (docs\/(?:proposals|contracts)\/q2-new-(?:proposal|modules|roster|topology|architecture|assets)-v2\.md)$/gm)].map(match => match[1]!);
      return modelCalls(gitTool(op("close-publication"), "close_created_task", originalCreatorClose(body, op("close-publication")))); },
    async body => { actualToolReply(body, op("close-publication")); assert.ok(target && targetOid);
      const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === op("publish-task")); assert.equal(task?.closed?.outcome, "accepted");
      assert.ok(chiefVisibleTarget); assert.deepEqual(chiefVisibleTarget, { version: target.version, digest: target.digest });
      return modelCalls(gitTool(op("mode-task"), "dispatch_task", { roleId: "rapporteur", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("mode-task"),
        task: `实际新文档t${chiefVisibleTarget.version}/${chiefVisibleTarget.digest}已发布。对原真实run ${oldRunId}、pin ${pinDigest}显式选择 ${mode}；不把target当旧pin，不手写run状态。\n报告可见材料: ${JSON.stringify(chiefVisiblePublicationRefs)}`, expectedOutput: "真实select_run_change回执" })); },
    body => { assert.match(actualToolReply(body, op("mode-task")), /已受理|已派发/); return modelDone("等待策划真实run模式回执，不自行停稳或创建替代run。"); },
    async body => {
      const input = actualUserInput(body), summary = actualChiefSummary(body);
      if (summary.startsWith("RUN_MODE_BLOCKED|")) {
        const task = (await driver.observe()).tasks.find(t => t.created?.idempotencyKey === op("mode-task"));
        const report = task?.reports.at(-1);
        assert.ok(task?.created && report && report.status === "blocked" && input.includes(report.summary));
        assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "rapporteur"); assert.equal(task.closed, undefined);
        assert.equal(summary, report.summary); const packet = boundedRunModePacket(summary, op("select-mode"), "blocked"); assert.ok("code" in packet && "message" in packet);
        assert.ok(chiefVisibleTarget); const visibleRequest = actualOwnRunChoice(body, op("mode-task"), { oldRunId, pinDigest, targetVersion: chiefVisibleTarget.version, targetDigest: chiefVisibleTarget.digest, mode }, task.taskId);
        modeBlockedReport = { operationId: packet.operationId, code: packet.code, message: packet.message, taskId: task.taskId };
        await driver.save(path.join(evidence, `${caseTag}-chief-coordination-blocked-report.json`), { actualInput: input, actualTask: task, actualReport: report, modeBlockedReport, actualOwnDispatchedRunTarget: visibleRequest });
        return modelCalls(gitTool(op("rework-mode"), "close_created_task", { ...originalCreatorClose(body, op("rework-mode")), outcome: "rework" }));
      }
      if (mode === "stop-and-restart") {
      const packet = boundedRunModePacket(summary, currentModeTaskKey === op("mode-task") ? op("select-mode") : op("select-mode-recheck"), "applied"); assert.ok("replacementRunId" in packet);
      const actualTask = (await driver.observe()).tasks.find(t => t.created?.idempotencyKey === currentModeTaskKey); const actualReport = actualTask?.reports.at(-1);
      assert.ok(actualTask?.created && actualReport && actualReport.status === "done"); assert.equal(actualReport.summary, summary); assert.equal(actualTask.created.from, "chief"); assert.equal(actualTask.created.to, "rapporteur"); assert.equal(actualTask.closed, undefined);
      const expectedTarget = currentModeTaskKey === op("mode-task") ? chiefVisibleTarget : chiefVisibleRecheckTarget; assert.ok(expectedTarget);
      const actualRequest = actualOwnRunChoice(body, currentModeTaskKey, { oldRunId, pinDigest, targetVersion: expectedTarget.version, targetDigest: expectedTarget.digest, mode }, actualTask.taskId);
      chiefVisibleRestart = { oldRunId: actualRequest.oldRunId, operationId: packet.operationId, replacementRunId: packet.replacementRunId, targetVersion: actualRequest.targetVersion, targetDigest: actualRequest.targetDigest };
    }
      return modelCalls(gitTool(op("close-mode"), "close_created_task", originalCreatorClose(body, op("close-mode")))); },
    async body => {
      if (body.messages.findLast(m => m.tool_calls?.length)?.tool_calls?.[0]?.id === op("rework-mode")) {
        actualToolReply(body, op("rework-mode")); assert.ok(modeBlockedReport);
        const blocked = modeBlockedReport;
        const oldMode = (await driver.observe()).tasks.find(t => t.taskId === blocked.taskId);
        assert.equal(oldMode?.closed?.outcome, "rework"); assert.equal(oldMode.closed.by, "chief");
        await driver.save(path.join(evidence, `${caseTag}-old-blocked-mode-rework-disposition.json`), { actualTask: oldMode, modeBlockedReport });
        return modelCalls(gitTool(op("repair-plan-task"), "dispatch_task", { roleId: "convener", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("repair-plan-task"),
          task: `Chief收到并正式返工终结真实策划阻塞 RUN_MODE_BLOCKED operation=${modeBlockedReport.operationId} code=${modeBlockedReport.code} reason=${modeBlockedReport.message}。先git_query当前refs/ans/trunk的manifest，再read_file核该manifest实际modules/roster字节与SHA，按真实模块所有者/目录/依赖形成${repairPlanPath}并complete_team_plan。不得改旧run/pin或先stop；真实回报planRef/rosterRef及尚缺的新D3/Active，不把补计划当restart就绪。`, expectedOutput: "真实v2团队计划写入/完成回执与剩余目标就绪缺口" }));
      }
      actualToolReply(body, op("close-mode")); const task = (await driver.observe()).tasks.find(task => task.created?.idempotencyKey === currentModeTaskKey);
      assert.equal(task?.closed?.outcome, "accepted");
      if (mode === "stop-and-restart") { assert.ok(chiefVisibleRestart);
        return modelCalls(gitTool(op("execution-controller"), "dispatch_task", { roleId: "convener", flowId: "q2-new", sideEffect: "code", idempotencyKey: op("execution-controller"),
          task: `Chief收到并收口了本轮Rapporteur真实模式报告；请由host绑定该真实replacement，缺准入就blocked，不自填run/pin。实际报告材料 ${JSON.stringify(chiefVisibleRestart)}`,
          expectedOutput: "真实replacement Task/run执行准入及后继代码/质量/交付" })); }
      complete = true; return modelDone("文档发布及run选择前段已实际报告和原创建者收口；新执行/质量/交付尚未完成。"); },
    async body => {
      if (body.messages.findLast(m => m.tool_calls?.length)?.tool_calls?.[0]?.id === op("repair-plan-task")) { assert.match(actualToolReply(body, op("repair-plan-task")), /已受理|已派发/); return modelDone("等待运营真实补计划报告，原blocked任务已正式rework，不复用旧scope。"); }
      const reply = actualToolReply(body, op("execution-controller"));
      await driver.save(path.join(evidence, `${caseTag}-same-chain-execution-dispatch.json`), { actualReply: reply, chiefVisibleRestart });
      assert.match(reply, /已受理|任务已派发/, `ACTUAL_SAME_CHAIN_REPLACEMENT_DISPATCH_REFUSED ${reply}`);
      return modelDone("真实替代运营任务仅已受理；尚未证明执行、质检或新交付完成。"); },
    body => { chiefVisiblePlanPath = boundedRepairPlanPacket(actualChiefSummary(body), op("repair-complete-plan"), repairPlanPath);
      return modelCalls(gitTool(op("close-repair-plan"), "close_created_task", originalCreatorClose(body, op("close-repair-plan")))); },
    async body => { actualToolReply(body, op("close-repair-plan"));
      const task = (await driver.observe()).tasks.find(t => t.created?.idempotencyKey === op("repair-plan-task"));
      assert.equal(task?.closed?.outcome, "accepted"); assert.equal(task.closed.by, "chief");
      const old = await store.readRunRecord!(oldRunId); assert.ok(old.ok); assert.equal(old.value.sha256, before.value.sha256);
      await driver.save(path.join(evidence, `${caseTag}-chief-coordinated-plan-repair-accepted.json`), { modeBlockedReport, repairPlanReceipt, actualTask: task, oldRunUnchanged: old });
      assert.ok(chiefVisiblePlanPath);
      return modelCalls(gitTool(op("refresh-active-task"), "dispatch_task", { roleId: "nominator", flowId: "q2-new", sideEffect: "docs", idempotencyKey: op("refresh-active-task"),
        task: `Chief已收口实际补计划。当前可见计划路径 ${chiefVisiblePlanPath}。先git_query当前manifest取得实际snapshot/plan/roster引用，再按当前v2 roster对原impl真实appointment请求客户D3，read_file三件既存canonical角色文档核实际SHA，再activate_role_documents建立当前plan/roster授权；不伪造D3/重写旧run或先stop。`, expectedOutput: "真实当前v2 D3和Active重新绑定回执" })); },
    body => { assert.match(actualToolReply(body, op("refresh-active-task")), /已受理|已派发/); return modelDone("等待真实当前roster D3和Active报告，未重选run模式。"); },
    body => modelCalls(gitTool(op("close-refresh-active"), "close_created_task", originalCreatorClose(body, op("close-refresh-active")))),
    body => { actualToolReply(body, op("close-refresh-active")); return modelCalls(gitTool(op("ready-basis"), "git_query", { operationId: op("ready-basis"), template: "log", limit: 1 })); },
    body => { const result = actualObservedGit(body, op("ready-basis")); assert.ok(isGitBasis(result.basis) && result.basis.oid);
      return modelCalls(gitTool(op("ready-manifest"), "git_query", { operationId: op("ready-manifest"), template: "show", target: result.basis.oid, paths: [".ans/trunk/manifest.json"] })); },
    body => { const fresh = documentBaseFromGitOutput(actualObservedGit(body, op("ready-manifest"))); currentModeTaskKey = op("mode-recheck-task"); chiefVisibleRecheckTarget = { version: fresh.version, digest: fresh.digest };
      return modelCalls(gitTool(currentModeTaskKey, "dispatch_task", { roleId: "rapporteur", flowId: "q2-new", sideEffect: "docs", idempotencyKey: currentModeTaskKey,
        task: `实际新文档t${fresh.version}/${fresh.digest}已发布。对原真实run ${oldRunId}、pin ${pinDigest}显式选择 ${mode}；先前目标被真实拒，Chief已协调当前计划/D3/Active。新请求操作 ${op("select-mode-recheck")}，不得重放旧op更换target。\n报告可见材料: ${JSON.stringify(Object.values(fresh.documents).map(ref => ref.path))}`, expectedOutput: "按新完整目标真实select_run_change回执" })); },
    body => { assert.match(actualToolReply(body, currentModeTaskKey), /已受理|已派发/); return modelDone("等待新请求的实际目标就绪/停稳/replacement回执，不以补材料代执行。"); },
  ], product: [
    body => { assert.ok(actualUserInput(body).includes("docs/proposals") && actualUserInput(body).includes("docs/contracts"));
      return modelCalls(...["docs/proposals", "docs/contracts"].map((dir, index) => gitTool(op(`list-${index}`), "list_dir", { path: dir }))); },
    body => {
      const discovered = ["docs/proposals", "docs/contracts"].flatMap((dir, index) => {
        const reply = actualToolReply(body, op(`list-${index}`)), prefix = `list_dir: ${dir}\n\n`;
        assert.ok(reply.startsWith(prefix), `ACTUAL_DOCUMENT_LIST_REJECTED ${reply}`); assert.doesNotMatch(reply, /\[已截断/);
        return reply.slice(prefix.length).split("\n").filter(name => /^q2-new-(proposal|modules|roster|topology|architecture|assets)-v2\.md$/.test(name)).map(name => `${dir}/${name}`);
      });
      const kinds = discovered.map(p => /-(proposal|modules|roster|topology|architecture|assets)-v2\.md$/.exec(p)?.[1]);
      assert.deepEqual([...kinds].sort(), ["proposal", "modules", "roster", "topology", "architecture", "assets"].sort(), "ACTUAL_SIX_DOCUMENT_CATALOG_INFORMATION_GAP");
      paths = discovered.sort(); return modelCalls(...paths.map((p, index) => gitTool(op(`read-${index}`), "read_file", { path: p })));
    },
    async body => {
      const schemas: Record<string, string> = { proposal: "project-proposal/v2", modules: "project-modules/v2", roster: "project-roster/v3", topology: "project-topology/v2", architecture: "project-architecture/v1", assets: "project-assets/v1" };
      paths.forEach((p, index) => {
        const reply = actualToolReply(body, op(`read-${index}`)), prefix = `read_file: ${p}\n\n`;
        assert.ok(reply.startsWith(prefix), `ACTUAL_DOCUMENT_READ_REJECTED ${reply}`); const content = reply.slice(prefix.length);
        const kind = /-(proposal|modules|roster|topology|architecture|assets)-v2\.md$/.exec(p)?.[1]; assert.ok(kind);
        assert.ok(content.startsWith("---\n")); assert.ok(content.includes(`\nschema: ${schemas[kind]}\n`));
        assert.ok(content.includes("\nflowId: q2-new\n") && content.includes("\nversion: 2\n"));
        const bytes = Buffer.from(content, "utf8"); documentBytes.set(p, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      });
      await driver.save(path.join(evidence, `${caseTag}-public-document-discovery.json`), { reportClues, actualPaths: paths, actualReadBytes: Object.fromEntries(documentBytes) });
      return modelCalls(gitTool(op("basis"), "git_query", { operationId: op("basis"), template: "log", limit: 1 }));
    },
    body => { const result = actualObservedGit(body, op("basis")); assert.ok(isGitBasis(result.basis) && result.basis.oid);
      return modelCalls(gitTool(op("manifest"), "git_query", { operationId: op("manifest"), template: "show", target: result.basis.oid, paths: [".ans/trunk/manifest.json"] })); },
    body => { base = documentBaseFromGitOutput(actualObservedGit(body, op("manifest")));
      return modelCalls(gitTool(op("submit"), "submit_version_change", { operationId: op("submit"), kind: "version-upgrade", flowId: "q2-new", baseTrunk: { version: base.version, digest: base.digest },
        summary: "客户已确认v2意图及真实策划六文档整单发布，旧run仍保持原冻结依据", targets: paths.map(p => { const kind = /-(proposal|modules|roster|topology|architecture|assets)-v2\.md$/.exec(p)?.[1]; assert.ok(kind && base?.documents[kind]);
          const old = base.documents[kind]!; return { kind: kind === "roster" ? "roster" : "contract", path: p, action: "modify", from: old.path, expectedFromSha256: old.sha256 }; }) })); },
    body => { publicationReply = actualToolReply(body, op("submit")); const start = publicationReply.indexOf("{"); assert.ok(start >= 0, `ACTUAL_PUBLICATION_REJECTION ${publicationReply}`);
      const receipt: unknown = JSON.parse(publicationReply.slice(start)); assert.ok(receipt && typeof receipt === "object");
      assert.equal(Reflect.get(receipt, "ok"), true, publicationReply); assert.equal(Reflect.get(receipt, "status"), "applied", publicationReply);
      return modelCalls(gitTool(op("new-basis"), "git_query", { operationId: op("new-basis"), template: "log", limit: 1 })); },
    body => { const result = actualObservedGit(body, op("new-basis")); assert.ok(isGitBasis(result.basis) && result.basis.oid); targetOid = result.basis.oid;
      return modelCalls(gitTool(op("new-manifest"), "git_query", { operationId: op("new-manifest"), template: "show", target: targetOid, paths: [".ans/trunk/manifest.json"] })); },
    async body => { target = documentBaseFromGitOutput(actualObservedGit(body, op("new-manifest"))); assert.ok(base && target.version > base.version);
      assert.deepEqual(Object.values(target.documents).map(ref => ref.path).sort(), [...paths].sort());
      for (const ref of Object.values(target.documents)) assert.equal(ref.sha256, documentBytes.get(ref.path)?.sha256, "Published bytes must match the Product's actual public read");
      const old = await store.readRunRecord!(oldRunId); assert.ok(old.ok); assert.equal(old.value.sha256, before.value.sha256, "New doc publication must not mutate or silently re-pin the old run");
      await driver.save(path.join(evidence, `${caseTag}-physical-document-publication.json`), { base, target, targetOid, publicationReply, oldRunBefore: before, oldRunAfter: old });
      return modelCalls(gitTool(op("publication-report"), "submit_report", { status: "completed", summary: `真实文档t${target.version}/${target.digest}已发布，Git ${targetOid?.hex}，旧run原字节未变。`, evidence: paths })); },
    body => { actualToolReply(body, op("publication-report")); return modelDone("实际v2文档发布结果已正式回报，等待原创建者收口。"); },
  ], rapporteur: [
    body => { const input = actualUserInput(body), visible = /实际新文档t([1-9]\d*)\/([a-f0-9]{64})已发布。对原真实run ([^、\s]+)、pin ([a-f0-9]{64})显式选择 (continue-frozen|stop-and-restart|stop)；/.exec(input);
      assert.ok(visible, "RAPPORTEUR_RUN_CHOICE_INFORMATION_GAP"); assert.equal(visible[3], oldRunId); assert.equal(visible[4], pinDigest);
      const refsText = /报告可见材料: (\[[^\n]*\])/.exec(input)?.[1]; assert.ok(refsText, "RAPPORTEUR_REPORT_LINKS_INFORMATION_GAP");
      const refs: unknown = JSON.parse(refsText); assert.ok(Array.isArray(refs));
      modeReportPaths = refs.map(ref => { assert.equal(typeof ref, "string"); assert.match(ref, /^docs\/(?:proposals|contracts)\/q2-new-(?:proposal|modules|roster|topology|architecture|assets)-v2\.md$/); return ref; });
      const recheckOperation = /新请求操作 ([^，\s]+)，不得重放旧op/.exec(input)?.[1];
      if (recheckOperation !== undefined) { assert.equal(recheckOperation, op("select-mode-recheck")); activeModeOperation = recheckOperation; }
      else activeModeOperation = op("select-mode");
      return modelCalls(gitTool(activeModeOperation, "select_run_change", { operationId: activeModeOperation, runId: visible[3], expectedPinDigest: visible[4],
      targetTrunk: { version: Number(visible[1]), digest: visible[2] }, mode: visible[5], reason: "依客户已确认v2意图与真实新文档，显式选择旧冻结run时机；执行授权和后续交付仍独立。" })); },
    async body => { modeReply = actualToolReply(body, activeModeOperation); const start = modeReply.indexOf("{"); assert.ok(start >= 0, `ACTUAL_RUN_CHOICE_REJECTION ${modeReply}`);
      const receipt: unknown = JSON.parse(modeReply.slice(start)); assert.ok(isDirectActionReceipt(receipt));
      assert.equal(receipt.operationId, activeModeOperation);
      const actualSelection = body.messages.flatMap(message => message.tool_calls ?? []).findLast(call => call.id === activeModeOperation); assert.ok(actualSelection);
      const actualArgs = JSON.parse(actualSelection.function.arguments);
      if (!receipt.ok) {
        assert.equal(activeModeOperation, op("select-mode"), `ACTUAL_RECHECK_MODE_BLOCKED ${modeReply}`);
        assert.equal(receipt.status, "blocked", modeReply); assert.equal(receipt.errorCode, "trunk-item-invalid", modeReply);
        assert.equal(receipt.message, "Team plan modules reference differs from the applicable immutable baseline", modeReply);
        const old = await store.readRunRecord!(oldRunId); assert.ok(old.ok); assert.equal(old.value.sha256, before.value.sha256);
        await driver.save(path.join(evidence, `${caseTag}-actual-mode-blocked-before-stop.json`), { actualReply: modeReply, oldRunBefore: before, oldRunAfter: old });
        const summary = `RUN_MODE_BLOCKED|op=${receipt.operationId}|code=${receipt.errorCode}|reason=${receipt.message}|END`; assert.ok(summary.length <= 200);
        return modelCalls(gitTool(op("mode-report"), "submit_report", { status: "blocked", summary,
          evidence: modeReportPaths }));
      }
      assert.equal(receipt.status, "applied", modeReply);
      const run = await store.readRunRecord!(oldRunId); assert.ok(run.ok); assert.equal(run.value.value.pinDigest, pinDigest); assert.deepEqual(run.value.value.frozenRoles, before.value.value.frozenRoles);
      await driver.save(path.join(evidence, `${caseTag}-actual-run-mode.json`), { mode, modeReply, originalRun: before, actualRun: run });
      const replacement: unknown = Reflect.get(receipt, "replacementRunId");
      if (actualArgs.mode === "stop-and-restart") assert.ok(typeof replacement === "string" && replacement.length, `ACTUAL_RESTART_RECEIPT_REPLACEMENT_ID_INFORMATION_GAP ${modeReply}`);
      const summary = actualArgs.mode === "stop-and-restart" ? `RUN_MODE_APPLIED|op=${receipt.operationId}|replacement=${replacement}|END` : `RUN_MODE_APPLIED|op=${receipt.operationId}|END`; assert.ok(summary.length <= 200);
      return modelCalls(gitTool(op("mode-report"), "submit_report", { status: "completed", summary,
        evidence: modeReportPaths })); },
    body => { actualToolReply(body, op("mode-report")); return modelDone("真实run模式结果已正式回报；没有伪造新执行或验收完成。"); },
  ], nominator: [
    body => { const match = /当前可见计划路径 ([^。\s]+)。先git_query/.exec(actualUserInput(body)); assert.ok(match, "NOMINATOR_VISIBLE_CURRENT_PLAN_INFORMATION_GAP"); assert.equal(match[1], repairPlanPath);
      return modelCalls(gitTool(op("refresh-basis"), "git_query", { operationId: op("refresh-basis"), template: "log", limit: 1 })); },
    body => { const result = actualObservedGit(body, op("refresh-basis")); assert.ok(isGitBasis(result.basis) && result.basis.oid);
      return modelCalls(gitTool(op("refresh-manifest"), "git_query", { operationId: op("refresh-manifest"), template: "show", target: result.basis.oid, paths: [".ans/trunk/manifest.json"] })); },
    body => { const result = actualObservedGit(body, op("refresh-manifest")); assert.ok(result.output); const manifest: unknown = JSON.parse(result.output);
      assert.equal(evidenceField(manifest, "flowId"), "q2-new"); const snapshot = evidenceField(manifest, "snapshotRef"); assert.ok(isSnapshotRef(snapshot));
      const artifacts = evidenceField(manifest, "artifacts"), execution = evidenceField(artifacts, "execution"), plan = evidenceField(execution, "teamPlan"), documents = evidenceField(artifacts, "documents"), roster = evidenceField(documents, "roster");
      const planPath = evidenceField(plan, "path"), planSHA = evidenceField(plan, "sha256"), rosterPath = evidenceField(roster, "path"), rosterSHA = evidenceField(roster, "sha256");
      assert.equal(planPath, repairPlanPath); assert.ok(typeof planPath === "string" && typeof planSHA === "string" && typeof rosterPath === "string" && typeof rosterSHA === "string");
      const planRef = { snapshotId: snapshot.snapshotId, path: planPath, sha256: planSHA }, rosterRef = { snapshotId: snapshot.snapshotId, path: rosterPath, sha256: rosterSHA };
      assert.ok(isSnapshotArtifactRef(planRef) && isSnapshotArtifactRef(rosterRef)); nominationRefs = { planRef, rosterRef };
      return modelCalls(gitTool(op("refresh-read-roster"), "read_file", { path: rosterRef.path })); },
    body => { assert.ok(nominationRefs); const prefix = `read_file: ${nominationRefs.rosterRef.path}\n\n`, reply = actualToolReply(body, op("refresh-read-roster")); assert.ok(reply.startsWith(prefix));
      const content = reply.slice(prefix.length); assert.equal(createHash("sha256").update(content).digest("hex"), nominationRefs.rosterRef.sha256);
      const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content); assert.ok(header); const roster: unknown = parseYaml(header[1]!);
      assert.equal(evidenceField(roster, "version"), 2); const roles = evidenceField(roster, "roles"); assert.ok(Array.isArray(roles)); assert.ok(roles.some((r: unknown) => evidenceField(r, "id") === "impl"));
      return modelCalls(gitTool(op("refresh-d3"), "request_choice", { cardKind: "appointment", flowId: "q2-new", title: "按当前v2名单确认原impl", question: "为当前v2 roster/plan真实选择impl并重新绑定授权？", multiple: true, options: [{ id: "impl", label: "Local implementation" }] })); },
    body => { const reply = actualToolReply(body, op("refresh-d3")); newD3DecisionId = /D3 裁决 id（decisionId）：([^\s—]+)/.exec(reply)?.[1]; assert.ok(newD3DecisionId, `ACTUAL_CURRENT_D3_MISSING ${reply}`);
      return modelCalls(...currentRolePaths.map((p, i) => gitTool(op(`refresh-read-card-${i}`), "read_file", { path: p }))); },
    body => { assert.ok(nominationRefs && newD3DecisionId); currentRolePaths.forEach((p, i) => { const reply = actualToolReply(body, op(`refresh-read-card-${i}`)), prefix = `read_file: ${p}\n\n`; assert.ok(reply.startsWith(prefix));
        currentRoleBytes.set(p, { path: p, sha256: createHash("sha256").update(reply.slice(prefix.length)).digest("hex") }); });
      const ref = (p: string) => { const value = currentRoleBytes.get(p); assert.ok(value); return value; };
      return modelCalls(gitTool(op("refresh-active"), "activate_role_documents", { operationId: op("refresh-active"), flowId: "q2-new", targetRoleId: "impl", d3DecisionId: newD3DecisionId,
        planRef: nominationRefs.planRef, rosterRef: nominationRefs.rosterRef, documents: { card: ref(currentRolePaths[0]!), boundaryMd: ref(currentRolePaths[1]!), boundaryYaml: ref(currentRolePaths[2]!) } })); },
    async body => { const reply = actualToolReply(body, op("refresh-active")), start = reply.indexOf("{"); assert.ok(start >= 0, reply); const receipt: unknown = JSON.parse(reply.slice(start));
      assert.ok(isDirectActionReceipt(receipt)); assert.equal(receipt.ok, true, reply); assert.ok(receipt.status === "applied" || receipt.status === "no-op", reply);
      const old = await store.readRunRecord!(oldRunId); assert.ok(old.ok); assert.equal(old.value.sha256, before.value.sha256);
      await driver.save(path.join(evidence, `${caseTag}-actual-current-d3-active-refresh.json`), { actualReply: reply, nominationRefs, actualD3DecisionId: newD3DecisionId, actualThreeRefs: Object.fromEntries(currentRoleBytes), oldRunUnchanged: old });
      return modelCalls(gitTool(op("refresh-active-report"), "submit_report", { status: "completed", summary: `CURRENT_ACTIVE_APPLIED|op=${receipt.operationId}|END`, evidence: currentRolePaths })); },
    body => { actualToolReply(body, op("refresh-active-report")); return modelDone("真实Active更新已报告Chief，未自批或接受本任务。"); },
  ], convener: [
    body => { assert.ok(actualUserInput(body).includes(repairPlanPath) && actualUserInput(body).includes("RUN_MODE_BLOCKED"));
      return modelCalls(gitTool(op("repair-basis"), "git_query", { operationId: op("repair-basis"), template: "log", limit: 1 })); },
    body => { const result = actualObservedGit(body, op("repair-basis")); assert.ok(isGitBasis(result.basis) && result.basis.oid);
      return modelCalls(gitTool(op("repair-manifest"), "git_query", { operationId: op("repair-manifest"), template: "show", target: result.basis.oid, paths: [".ans/trunk/manifest.json"] })); },
    body => { repairBase = documentBaseFromGitOutput(actualObservedGit(body, op("repair-manifest")));
      return modelCalls(...["modules", "roster"].map(kind => { const ref: { path: string; sha256: string } | undefined = repairBase?.documents[kind]; assert.ok(ref);
        return gitTool(op(`repair-read-${kind}`), "read_file", { path: ref.path }); })); },
    body => { assert.ok(repairBase);
      const documents = new Map<string, unknown>();
      for (const kind of ["modules", "roster"]) {
        const ref: { path: string; sha256: string } | undefined = repairBase.documents[kind]; assert.ok(ref);
        const reply: string = actualToolReply(body, op(`repair-read-${kind}`)); const prefix: string = `read_file: ${ref.path}\n\n`;
        assert.ok(reply.startsWith(prefix)); const content: string = reply.slice(prefix.length); assert.equal(createHash("sha256").update(content).digest("hex"), ref.sha256);
        const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content); assert.ok(header); const parsed: unknown = parseYaml(header[1]!);
        assert.equal(evidenceField(parsed, "flowId"), "q2-new"); assert.equal(evidenceField(parsed, "version"), 2); documents.set(kind, parsed);
      }
      const modules = evidenceField(documents.get("modules"), "modules"), roles = evidenceField(documents.get("roster"), "roles");
      assert.ok(Array.isArray(modules) && Array.isArray(roles));
      const roleRows = roles.map((role: unknown) => {
        const roleId = evidenceField(role, "id"), assigned = evidenceField(role, "modules"); assert.equal(typeof roleId, "string"); assert.ok(Array.isArray(assigned));
        const writesets = assigned.map((moduleId: unknown) => { assert.equal(typeof moduleId, "string");
          const module = modules.find((row: unknown) => evidenceField(row, "id") === moduleId); assert.ok(module);
          const modulePath = evidenceField(module, "path"); assert.equal(typeof modulePath, "string"); return modulePath; });
        const dependencySource = evidenceField(role, "dependsOn"); assert.ok(dependencySource === undefined || Array.isArray(dependencySource));
        const dependsOn = dependencySource ?? []; dependsOn.forEach((id: unknown) => assert.equal(typeof id, "string"));
        return { roleId, modules: assigned, writesets, dependsOn };
      });
      repairPlanText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: "q2-new", version: 2,
        modules: repairBase.documents.modules, roster: repairBase.documents.roster, roleRows })}\n---\n# Current v2 execution plan\nChief-coordinated repair after the actual blocked run-mode report. D3/Active readiness remains separate.\n`;
      return modelCalls(gitTool(op("repair-write-plan"), "write_file", { path: repairPlanPath, content: repairPlanText })); },
    body => { assert.match(actualToolReply(body, op("repair-write-plan")), /已获准并落盘/);
      return modelCalls(gitTool(op("repair-read-plan"), "read_file", { path: repairPlanPath })); },
    body => { assert.ok(repairBase && repairPlanText); const reply = actualToolReply(body, op("repair-read-plan"));
      assert.equal(reply, `read_file: ${repairPlanPath}\n\n${repairPlanText}`);
      return modelCalls(gitTool(op("repair-complete-plan"), "complete_team_plan", { operationId: op("repair-complete-plan"), flowId: "q2-new", baseDigest: repairBase.digest,
        plan: { path: repairPlanPath, sha256: createHash("sha256").update(repairPlanText).digest("hex"), version: 2 } })); },
    async body => { repairPlanReceipt = actualToolReply(body, op("repair-complete-plan")); const start = repairPlanReceipt.indexOf("{"); assert.ok(start >= 0, repairPlanReceipt);
      const receipt: unknown = JSON.parse(repairPlanReceipt.slice(start)); assert.ok(isDirectActionReceipt(receipt)); assert.equal(receipt.ok, true, repairPlanReceipt); assert.equal(receipt.status, "applied", repairPlanReceipt);
      const planRef = evidenceField(receipt, "planRef"), modulesRef = evidenceField(receipt, "modulesRef"), rosterRef = evidenceField(receipt, "rosterRef");
      assert.ok(isSnapshotArtifactRef(planRef) && isSnapshotArtifactRef(modulesRef) && isSnapshotArtifactRef(rosterRef));
      assert.equal(planRef.path, repairPlanPath); assert.equal(modulesRef.path, repairBase?.documents.modules?.path); assert.equal(rosterRef.path, repairBase?.documents.roster?.path);
      const old = await store.readRunRecord!(oldRunId); assert.ok(old.ok); assert.equal(old.value.sha256, before.value.sha256);
      await driver.save(path.join(evidence, `${caseTag}-actual-team-plan-repair-publication.json`), { actualReply: repairPlanReceipt, repairBase, actualPlanRef: planRef, actualModulesRef: modulesRef, actualRosterRef: rosterRef, oldRunUnchanged: old });
      const summary = `TEAM_PLAN_REPAIR_APPLIED|op=${receipt.operationId}|plan=${planRef.path}|END`; assert.ok(summary.length <= 200);
      return modelCalls(gitTool(op("repair-plan-report"), "submit_report", { status: "completed", summary, evidence: [repairPlanPath] })); },
    body => { actualToolReply(body, op("repair-plan-report")); return modelDone("真实补计划结果已报告Chief，未声称整个restart就绪或执行完成。"); },
    async body => {
    const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("execution-controller")), visible = chiefVisibleRestart; assert.ok(task?.created && visible);
    assert.ok(actualUserInput(body).includes(JSON.stringify(visible))); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "convener"); assert.equal(task.closed, undefined);
    await driver.save(path.join(evidence, `${caseTag}-actual-same-chain-replacement-runtime.json`), { actualRequest: body, actualTask: task, expectedFromVisibleReport: visible, actualFacts: actual });
    assert.equal(task.created.runId, visible.replacementRunId, "ACTUAL_HOST_REPLACEMENT_BINDING_GAP");
    throw new Error("CHANGE_SAME_CHAIN_REPLACEMENT_ADMITTED; WORKER_CODE_QUALITY_DELIVERY_RECEIVERS_NOT_IMPLEMENTED");
  }], "chief:feedback": [body => { const key = ownProducedFeedback(body, driver.trace, ["product", "rapporteur", "convener", "nominator", ...recipients.filter(r => r !== "chief").map(r => `${r}:application-notice`)]);
    assert.equal(seen.has(key), false); seen.add(key); return modelDone("已收到实际角色回执，正式业务仍依报告和应用依据推进。"); }] };
  for (const recipient of recipients) scripts[`${recipient}:application-notice`] = [async body => {
    const text = actualApplicationNotice(body); assert.ok(text); const key = `${recipient}:${text}`; assert.equal(seen.has(key), false); seen.add(key);
    const published = /^\[应用·文档更新\] version-upgrade (vc-[0-9]+) applied; trunk t([1-9]\d*); ([a-f0-9]{64})$/.exec(text);
    if (published) { const journal = await store.readOperation!(op("submit")); assert.ok(journal.ok); assert.equal(journal.value.applicationId, published[1]);
      assert.equal(journal.value.operationId, op("submit")); assert.equal(journal.value.target.trunkVersion, Number(published[2])); const source = journal.value.actionSource;
      assert.ok(source?.kind === "role-direct" && source.action === "version-upgrade" && source.actorRoleId === "product"); assert.equal(source.targetDigest, published[3]);
      return modelDone(`只确认真实文档发布应用回执 ${op("submit")}/${source.applicationId}，不授旧run新权限。`); }
    const closed = /^\[应用·文档更新\] close-created-task ([^ ]+) applied; ([a-f0-9]{64})$/.exec(text);
    if (closed) { assert.ok([op("close-publication"), op("close-mode"), op("rework-mode"), op("close-repair-plan"), op("close-refresh-active")].includes(closed[1]!)); const task = (await driver.observe()).tasks.find(t => t.closed?.operationId === closed[1]);
      assert.ok(task?.closed && task.created); assert.equal(task.closed.by, task.created.from); assert.equal(task.closed.outcome, closed[1] === op("rework-mode") ? "rework" : "accepted"); const source = task.closed.actionSource;
      assert.ok(source?.kind === "role-direct" && source.action === "close-created-task"); assert.equal(source.targetDigest, closed[2]);
      return modelDone(`只确认真实收口 ${source.operationId}/${source.applicationId}/${task.taskId}。`); }
    const materialEffect = /^\[应用·文档更新\] (complete-team-plan|activate-role-documents) ([^ ]+) (applied|no-op); ([a-f0-9]{64})$/.exec(text);
    if (materialEffect) { const expected = materialEffect[1] === "complete-team-plan" ? op("repair-complete-plan") : op("refresh-active"); assert.equal(materialEffect[2], expected);
      const operation = await store.readOperation!(expected); assert.ok(operation.ok); const source = operation.value.actionSource;
      assert.ok(source?.kind === "role-direct"); assert.equal(source.operationId, expected); assert.equal(source.action, materialEffect[1]);
      assert.equal(source.actorRoleId, materialEffect[1] === "complete-team-plan" ? "convener" : "nominator"); assert.equal(source.targetDigest, materialEffect[4]);
      return modelDone(`只确认同op/source/digest实际补材回执 ${expected}，不替代目标准入或stop。`); }
    const selected = new RegExp("^\\[应用·文档更新\\] select-run-change (" + op("select-mode") + "|" + op("select-mode-recheck") + ") applied; ([a-f0-9]{64})$").exec(text);
    if (selected) { const run = await store.readRunRecord!(oldRunId); assert.ok(run.ok); const rows = run.value.value.directRunChanges;
      assert.ok(Array.isArray(rows)); const row = rows.find(r => r.receipt.operationId === selected[1]); assert.ok(row && isDirectActionReceipt(row.receipt));
      assert.equal(row.receipt.targetDigest, selected[2]); return modelDone(`只确认真实run选择回执 ${selected[1]}，不把它当执行或交付完成。`); }
    assert.fail(`UNKNOWN_OR_UNBOUND_PUBLICATION_NOTICE ${text}`);
  }];
  driver = await createRealHttpDriver(scripts, { tag: caseTag, existingOwnedProject: { proofFile, proofSha256: createHash("sha256").update(proofBytes).digest("hex") }, requestLimit: 112,
    timeoutMs: 45000, caseDeadlineAt: publicationDeadlineAt, finiteRoles: {
      chief: { initial: 0, tasks: { [op("publish-task")]: 2, [op("mode-task")]: 5, [op("mode-recheck-task")]: 5, [op("repair-plan-task")]: 8, [op("refresh-active-task")]: 11 } },
      rapporteur: { tasks: { [op("mode-task")]: 0, [op("mode-recheck-task")]: 0 } },
      convener: { tasks: { [op("repair-plan-task")]: 0, [op("execution-controller")]: 8 } } },
    reusableNoticeKeys: ["chief:feedback", ...recipients.map(r => `${r}:application-notice`)] });
  let phasePrimary: { error: unknown } | undefined;
  try { await driver.bounded("publication chief entry", () => driver.openChief()); await driver.bounded("publication customer turn", () => driver.sendChief(`接续本轮真实客户确认及策划已收口的v2材料，产品整单发布后由策划显式选择旧run ${oldRunId} / pin ${pinDigest} 的模式；不把新文档混入旧冻结依据。`));
    await driver.bounded("actual v2 publication and run choice", async signal => { while (!complete) { if (driver.errors.length) throw new Error(driver.errors.join("\n"));
      for (const card of driver.pending.values()) { assert.equal(card.request.cardKind, "appointment"); assert.equal(card.request.flowId, "q2-new"); assert.equal(card.request.kind, "choice");
        assert.ok(card.request.options.some(option => option.id === "impl")); recoveryCustomerDecisions.push({ requestId: card.id, actualRequest: card.request, source: "test-customer response to actual current-v2 appointment requestId" });
        assert.equal(driver.respond(card.id, { kind: "choice", selected: ["impl"] }).ok, true); }
      signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); } }, { remainingCase: true });
  } catch (error) { phasePrimary = { error }; throw error;
  } finally { await preservePhaseCleanup(caseTag, phasePrimary, async () => { await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { phaseOnly: true, fullChangePass: false, complete, base, target, targetOid, publicationReply, modeReply, oldRun: before, modeBlockedReport, repairPlanReceipt, recoveryCustomerDecisions });
    await driver.dispose(); await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { phaseOnly: true, fullChangePass: false, complete });
    if (complete) assert.deepEqual(driver.errors, []); }); }
}

test("CHANGE actual v2 publication and frozen-run mode", { timeout: 120000, skip: process.env.ANS_CHANGE_PUBLISH_STANDALONE !== "1" }, runChangePublicationAndModeCase);

/** Standalone admission diagnostic only: a new customer turn is not the prior creator-report source. */
export async function runChangeExecutionAdmissionCase() {
  const round = process.env.ANS_CHANGE_EXECUTION_ROUND; assert.ok(round && /^q[1-9]\d{0,5}$/.test(round));
  const caseTag = `${round}-execution`, op = (suffix: string) => `${caseTag}-${suffix}`;
  const seedPath = path.join(evidence, `${round}-new-clean-delivery-seed.json`), seedBytes = await fs.readFile(seedPath), seed = JSON.parse(seedBytes.toString("utf8"));
  const publication = JSON.parse(await fs.readFile(path.join(evidence, `${round}-publication-full-final-proof.json`), "utf8"));
  const modeProof = JSON.parse(await fs.readFile(path.join(evidence, `${round}-publication-actual-run-mode.json`), "utf8"));
  assert.equal(seed.clean, true); assert.equal(publication.root, seed.root); assert.equal(modeProof.root, seed.root);
  const modeReply: unknown = modeProof.extra.modeReply; assert.ok(typeof modeReply === "string");
  assert.equal(modeProof.extra.mode, "stop-and-restart", "Actual continue-frozen/stop does not establish replacement target execution");
  const marker = modeReply.indexOf("{"); assert.ok(marker >= 0, `ACTUAL_RESTART_REPLY_UNAVAILABLE ${modeReply}`);
  const receipt: unknown = JSON.parse(modeReply.slice(marker)); assert.ok(isDirectActionReceipt(receipt)); assert.equal(receipt.ok, true);
  const replacementRunId: unknown = Reflect.get(receipt, "replacementRunId");
  await fs.writeFile(path.join(evidence, `${caseTag}-actual-mode-input.json`), JSON.stringify({ root: seed.root, modeReply, receipt, publicationTarget: publication.extra.target,
    limitation: "Only an actual returned replacementRunId may be compared with host-created Task.runId; never computed or passed as a host field" }, null, 2), { flag: "wx" });
  assert.ok(typeof replacementRunId === "string" && replacementRunId.length, "ACTUAL_RESTART_RECEIPT_REPLACEMENT_ID_INFORMATION_GAP");
  const target = publication.extra.target; assert.ok(Number.isSafeInteger(target?.version) && typeof target.digest === "string");
  const modules = target.documents?.modules; assert.ok(typeof modules?.path === "string" && /^[a-f0-9]{64}$/.test(modules.sha256));
  const flowId: unknown = modeProof.extra.actualRun?.value?.value?.flowId; assert.equal(typeof flowId, "string");
  const material = { flowId, replacementRunId, target: { version: target.version, digest: target.digest }, modules };
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, controllerTaskId: string | undefined, gap: string | undefined, chiefReceived = false;
  let actualModule: { id: string; path: string } | undefined;
  let convenerReceived: { flowId: string; replacementRunId: string; modules: { path: string; sha256: string } } | undefined;
  const scripts: HttpScripts = { chief: [
    body => { const json = /实际回执材料 (\{[^\n]+\})/.exec(actualUserInput(body))?.[1]; assert.ok(json);
      const requested: unknown = JSON.parse(json); assert.deepEqual(requested, material); assert.ok(requested && typeof requested === "object");
      const requestedFlow: unknown = Reflect.get(requested, "flowId"); assert.ok(typeof requestedFlow === "string");
      return modelCalls(gitTool(op("controller"), "dispatch_task", { roleId: "convener", flowId: requestedFlow, sideEffect: "code", idempotencyKey: op("controller"),
        task: `依据实际已完成stop-and-restart回执恢复目标执行。仅由host绑定真实replacement run；读取实际modules并派合法impl，缺计划/D3/active/workflow就正式blocked回Chief，不补未来权限。\n【执行依据】${JSON.stringify(requested)}`,
        expectedOutput: "真实替代run执行准入或首个精确阻塞报告" })); },
    body => { const reply = actualToolReply(body, op("controller"));
      if (!/已受理|任务已派发/.test(reply)) { gap = `ACTUAL_CHANGED_CONTROLLER_DISPATCH_REFUSED ${reply}`; chiefReceived = true;
        return modelDone("真实运营执行准入未成立；保留回执，未重派或批准。"); }
      return modelDone("等待运营真实执行准入/worker回执，派发不等于授权或完成。"); },
    async body => { const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("controller"));
      assert.ok(task?.created); const report = task.reports.at(-1); assert.ok(report); assert.equal(task.created.from, "chief");
      assert.ok(actualUserInput(body).includes(task.taskId) && actualUserInput(body).includes(report.summary)); assert.equal(report.status, "blocked");
      chiefReceived = true; await driver.save(path.join(evidence, `${caseTag}-actual-chief-blocked-handback.json`), { task, input: actualUserInput(body), gap });
      return modelDone("已收到真实执行阻塞报告；原任务未验收，未伪造替代run或执行授权，下一步需有权角色修复具体材料。"); },
  ], convener: [
    async body => { const input = actualUserInput(body), json = /【执行依据】(\{[^\n]+\})/.exec(input)?.[1]; assert.ok(json);
      const received: unknown = JSON.parse(json); assert.deepEqual(received, material, "Received ordinary handoff must equal the actual published/mode evidence");
      assert.ok(received && typeof received === "object"); const receivedFlow: unknown = Reflect.get(received, "flowId"), receivedRun: unknown = Reflect.get(received, "replacementRunId"), receivedModules: unknown = Reflect.get(received, "modules");
      assert.ok(typeof receivedFlow === "string" && typeof receivedRun === "string" && receivedModules && typeof receivedModules === "object");
      const receivedPath: unknown = Reflect.get(receivedModules, "path"), receivedSHA: unknown = Reflect.get(receivedModules, "sha256");
      assert.ok(typeof receivedPath === "string" && typeof receivedSHA === "string");
      convenerReceived = { flowId: receivedFlow, replacementRunId: receivedRun, modules: { path: receivedPath, sha256: receivedSHA } };
      const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("controller")); assert.ok(task?.created);
      assert.ok(input.includes(task.taskId)); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "convener"); assert.equal(task.closed, undefined);
      controllerTaskId = task.taskId;
      if (task.created.runId !== convenerReceived.replacementRunId) { gap = `ACTUAL_HOST_REPLACEMENT_BINDING_GAP expected=${convenerReceived.replacementRunId} observed=${task.created.runId}`;
        return modelCalls(gitTool(op("blocked-report"), "submit_report", { status: "blocked", summary: gap, evidence: [] })); }
      return modelCalls(gitTool(op("read-modules"), "read_file", { path: convenerReceived.modules.path })); },
    body => { if (body.messages.findLast(m => m.role === "tool")?.tool_call_id === op("blocked-report")) { actualToolReply(body, op("blocked-report")); return modelDone("真实host replacement绑定缺口已正式回Chief，未派worker。"); }
      assert.ok(convenerReceived); const reply = actualToolReply(body, op("read-modules")), prefix = `read_file: ${convenerReceived.modules.path}\n\n`; assert.ok(reply.startsWith(prefix), `ACTUAL_TARGET_MODULE_READ_REFUSED ${reply}`);
      const content = reply.slice(prefix.length); assert.equal(createHash("sha256").update(content).digest("hex"), convenerReceived.modules.sha256);
      const candidates = [...content.matchAll(/^  - id: ([a-z0-9-]+)\n(?:[^\n]*\n)*?    path: ([^\s]+)\n/gm)];
      assert.equal(candidates.length, 1, "Unscripted actual module catalog is not an execution authorization");
      actualModule = { id: candidates[0]![1]!, path: candidates[0]![2]! };
      return modelCalls(gitTool(op("worker"), "dispatch_task", { roleId: "impl", flowId: convenerReceived.flowId, moduleId: actualModule.id, sideEffect: "code", idempotencyKey: op("worker"),
        task: "按host真实替代run/module冻结范围执行；缺前提必须blocked，不借新文档或自报状态增权。", expectedOutput: "实际变更代码候选和正式报告" })); },
    async body => { const reply = actualToolReply(body, op("worker")); gap = /已受理|任务已派发/.test(reply)
        ? "CHANGE_WORKER_ADMITTED_BUT_CODE_QUALITY_DELIVERY_RECEIVERS_NOT_IMPLEMENTED" : `ACTUAL_CHANGED_WORKER_ADMISSION_REFUSED ${reply}`;
      await driver.save(path.join(evidence, `${caseTag}-actual-worker-admission-result.json`), { reply, actualModule, controllerTaskId, gap });
      return modelCalls(gitTool(op("blocked-report"), "submit_report", { status: "blocked", summary: gap, evidence: [modules.path] })); },
    body => { actualToolReply(body, op("blocked-report")); return modelDone("真实执行准入结果已回Chief；后继代码/质检/发布仍未完成，未代验收。"); },
  ], impl: [() => { throw new Error("CHANGE_WORKER_CODE_QUALITY_DELIVERY_RECEIVER_NOT_IMPLEMENTED; actual registry/HTTP must remain evidence only"); }] };
  driver = await createRealHttpDriver(scripts, { tag: caseTag, existingOwnedProject: { proofFile: seedPath, proofSha256: createHash("sha256").update(seedBytes).digest("hex") },
    requestLimit: 48, timeoutMs: 30000, caseDeadlineAt: Date.now() + 90000, finiteRoles: { chief: { initial: 0, tasks: { [op("controller")]: 2 } } } });
  try { await driver.bounded("changed execution chief entry", () => driver.openChief());
    await driver.sendChief(`接续实际发布和stop-and-restart结果核对目标执行，不把旧pin换成新文档。实际回执材料 ${JSON.stringify(material)}`);
    await driver.bounded("changed execution first actual gate handback", async signal => { while (!chiefReceived) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); } });
    assert.fail(gap ?? "CHANGE_EXECUTION_CONTINUATION_NOT_COVERED");
  } finally { await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { phaseOnly: true, fullChangePass: false, material, controllerTaskId, actualModule, gap, chiefReceived });
    await driver.dispose(); await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { phaseOnly: true, fullChangePass: false, gap }); }
}

test("CHANGE standalone replacement admission diagnostic, not creator-report continuity", { timeout: 90000, skip: process.env.ANS_CHANGE_EXECUTION_STANDALONE !== "1" }, runChangeExecutionAdmissionCase);

/** One owned process and unchanged NEW body; stage receipts never claim a parent EXIT. */
export async function runContinuousNewToChangeCase() {
  assert.equal(continuousChangeChild, true); assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const round = process.env.ANS_CONTINUOUS_CHANGE_ROUND, nonce = process.env.ANS_HARNESS_RUN_ID;
  assert.ok(round && /^q[1-9]\d{0,5}$/.test(round) && nonce);
  const snapshotPath = process.env.ANS_CONTINUOUS_INPUT_SNAPSHOT; assert.ok(snapshotPath);
  const snapshotBytes = await fs.readFile(snapshotPath), snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  assert.equal(snapshot.sourceIdentity, process.env.ANS_HARNESS_INPUT_IDENTITY);
  const inputFiles = snapshot.files.filter((f: { path: string }) => f.path.startsWith("src/") || f.path.startsWith("app/")
    || ["test/测试/git-role-workflows-driver.ts", "test/测试/git-role-workflows-e2e.test.ts"].includes(f.path));
  assert.equal(inputFiles.filter((f: { path: string }) => f.path.startsWith("test/")).length, 2);
  const envValues: Record<string, string> = { ANS_Q39_BUSINESS: "1", ANS_Q39_CASE_TAG: `${round}-new`,
    ANS_CHANGE_CASE_TAG: `${round}-change`, ANS_CHANGE_PLAN_CASE_TAG: `${round}-planning`, ANS_CHANGE_PRIOR_CASE_TAG: `${round}-change`,
    ANS_CHANGE_DRAFT_PROOF: path.join(evidence, `${round}-change-after-cleanup-proof.json`), ANS_CHANGE_REQUIRE_CLEAN_SEED: "1",
    ANS_CHANGE_PUBLICATION_ROUND: round, ANS_CHANGE_RUN_MODE: "stop-and-restart" };
  const previous = new Map(Object.keys(envValues).concat(["ANS_CHANGE_BASE_PROOF", "ANS_CHANGE_BASE_PROOF_SHA"]).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envValues)) process.env[key] = value;
  const phases: unknown[] = []; let currentPhase = "new", root: string | undefined, completed = false, primary: unknown;
  let newReceipt: unknown;
  const link = async (suffix: string) => {
    const file = path.join(evidence, `${round}-new-${suffix}.json`), bytes = await fs.readFile(file);
    return { path: file, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const runPhase = async (phase: string, budgetMs: number, run: () => Promise<void>) => {
    currentPhase = phase; const started = new Date().toISOString(), deadlineAt = phaseDeadline(budgetMs);
    process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ event: "start", phase, at: started, processId: process.pid, nonce, budgetMs, deadlineAt })}\n`);
    try { if (newReceipt) await verifyChangeBaseReceipt(newReceipt); await run();
      phases.push({ phase, started, ended: new Date().toISOString(), processId: process.pid, completed: true, deadlineAt });
      process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ event: "end", phase, at: new Date().toISOString(), processId: process.pid, nonce, completed: true })}\n`);
    } catch (error) { phases.push({ phase, started, ended: new Date().toISOString(), processId: process.pid, completed: false, deadlineAt, error: actualErrorFact(error) }); throw error; }
  };
  try {
    await runPhase("new", 300000, runFirstNewBusinessCase);
    const completedProof = await link("new-delivery-controller-closed"), postCleanupProof = await link("after-cleanup-proof");
    const actual = await verifiedProofLink(completedProof); root = actual.root;
    assert.ok(isGitCapabilityResult(actual.extra.publishedDelivery) && actual.extra.publishedDelivery.status === "published");
    newReceipt = { schema: "qa-inprocess-new-stage/v1", completed: true, phaseOnly: true, processId: process.pid, runNonce: nonce,
      runtimeProcessInstanceId: inspectRuntimeCoreRegistry().processInstanceId, root, published: actual.extra.publishedDelivery,
      completedProof, postCleanupProof, inputFiles, inputSnapshot: { path: snapshotPath, sha256: createHash("sha256").update(snapshotBytes).digest("hex") },
      statement: "Original NEW function and all assertions returned in this process; no parent/child EXIT is claimed here; no production authority" };
    await verifyChangeBaseReceipt(newReceipt);
    const receiptPath = path.join(evidence, `${round}-new-stage-receipt.json`), receiptBytes = Buffer.from(JSON.stringify(newReceipt, null, 2));
    await fs.writeFile(receiptPath, receiptBytes, { flag: "wx" }); process.env.ANS_CHANGE_BASE_PROOF = receiptPath;
    process.env.ANS_CHANGE_BASE_PROOF_SHA = createHash("sha256").update(receiptBytes).digest("hex");
    await runPhase("entry", 90000, runDeliveredChangeEntryCase);
    await runPhase("planning", 90000, runChangeIntentAndPlanningCase);
    await runPhase("publication", 120000, runChangePublicationAndModeCase);
    completed = true;
  } catch (error) { primary = error; throw error;
  } finally {
    const lateFailures: unknown[] = [], late: unknown[] = [];
    for (const [index, driver] of continuousDrivers.entries()) {
      try { const file = path.join(evidence, `${round}-continuous-late-driver-${index}.json`);
        await driver.save(file, { observationOnly: true, index, currentPhase, statement: "Late same-process observation; does not replace first error facts" });
        late.push({ index, root: driver.root, errors: [...driver.errors], file });
        if (driver.errors.length) lateFailures.push(new Error(`CONTINUOUS_LATE_DRIVER_ERRORS index=${index}: ${driver.errors.join("\n")}`));
      } catch (error) { lateFailures.push(error); }
    }
    const outcome = { at: new Date().toISOString(), round, runNonce: nonce, processId: process.pid, root, completed, currentPhase,
      primaryError: primary === undefined ? null : actualErrorFact(primary), lateFailures: lateFailures.map(actualErrorFact), phases, late,
      actualFinalCoreRegistry: inspectRuntimeCoreRegistry(), totalHttpRequests: continuousDrivers.reduce((sum, d) => sum + d.trace.length, 0),
      budget: { http: 416, sharedBusinessDeadlineAt: Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT), wrapperMs: 630000, retries: 0 },
      limitation: "Same-process business outcome; natural EXIT/CLOSE is recorded only by the outer owned runner" };
    try { await fs.writeFile(path.join(evidence, `${round}-continuous-result.json`), JSON.stringify(outcome, null, 2), { flag: "wx" }); }
    catch (error) { lateFailures.push(error); }
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (lateFailures.length) throw new AggregateError([...(primary === undefined ? [] : [primary]), ...lateFailures], "Continuous business/late observation failures; none suppressed");
  }
}

/** Ordinary customer dialogue only: actual clarification and a second input in the same real Chief context, without manufacturing a Goal/Task/card. */
async function runChiefOrdinaryClarificationCase() {
  const caseTag = process.env.ANS_CHIEF_DIALOGUE_CASE_TAG; assert.ok(caseTag && /^q[1-9]\d{0,5}-chief-dialogue$/.test(caseTag));
  const first = "先只作普通对话，我还没有要执行的项目目标，想了解一个概念；请先问我具体需要了解什么，不创建任务或结构卡。";
  const question = "你想了解哪个具体概念？请补充名称或问题；在明确前先保持普通对话，不创建目标、任务或确认卡。";
  const second = "我补充：只解释只读讨论与实际执行的区别，不操作文件、不创建任务、不申请批准。";
  const answer = "只读讨论用于理解现有资料，不改变项目；实际执行会产生操作，需要先明确目标并经过适用门禁。本轮只完成解释，没有创建目标、任务或批准。";
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, asked = false, completed = false, primary: unknown;
  const phaseEnd = Date.now() + 15000;
  const actualChiefText = (row: unknown, expected: string) => {
    if (!row || typeof row !== "object" || Reflect.get(row, "roleId") !== "chief") return false;
    const event = Reflect.get(row, "event"); if (!event || typeof event !== "object" || Reflect.get(event, "kind") !== "message") return false;
    const detail = Reflect.get(event, "detail"); return !!detail && typeof detail === "object" && Reflect.get(detail, "text") === expected;
  };
  driver = await createRealHttpDriver({ chief: [async body => {
    assert.ok(actualUserInput(body).includes(first)); await observeActualChiefWorkflow(body); asked = true; return modelDone(question);
  }, body => {
    assert.equal(asked, true); assert.ok(actualUserInput(body).includes(second));
    assert.ok(body.messages.some(message => message.role === "assistant" && message.content === question), "ACTUAL_CHIEF_PRIOR_CLARIFICATION_CONTEXT_MISSING");
    completed = true; return modelDone(answer);
  }] }, { tag: caseTag, requestLimit: 8, timeoutMs: 10000, caseDeadlineAt: phaseEnd });
  const assertNoStructuredWork = async () => {
    const state = await driver.observe(); assert.deepEqual(state.ledgerErrors, []); assert.deepEqual(state.tasks, []);
    assert.equal(driver.trace.every(row => !row.reply?.tool_calls?.length), true); assert.deepEqual(driver.customerTrace, []); assert.equal(driver.pending.size, 0);
    assert.equal(await fs.stat(path.join(driver.root, ".git")).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
    return state;
  };
  try {
    assert.ok(driver.initialRootFacts.ancestors.every(item => !item.gitMarker && !item.symbolicLink));
    await driver.bounded("real ordinary Chief entry", () => driver.openChief());
    await driver.bounded("actual first ordinary clarification", () => driver.sendChief(first));
    assert.equal(asked, true); assert.equal(completed, false); await assertNoStructuredWork();
    const visibleQuestion = driver.events.filter(row => actualChiefText(row, question)); assert.equal(visibleQuestion.length, 1);
    await driver.save(path.join(evidence, `${caseTag}-actual-clarification-waits-input.json`), { asked, completed, actualVisibleQuestion: visibleQuestion });
    await driver.bounded("actual new customer input resumes dialogue", () => driver.sendChief(second));
    await driver.bounded("ordinary dialogue actual final drain", async signal => { for (;;) {
      if (driver.errors.length) throw new Error(driver.errors.join("\n")); const state = await driver.observe(), chief = state.inventory.sessions.find(row => row.roleId === "chief" && row.phase === "live");
      if (completed && !state.inventory.pendingOpens.length && !state.inventory.activeDeliveries.length && !state.inventory.queuedDispatches.length && chief?.lifecycle?.status === "quiescent" && chief.lifecycle.providerFinished) break;
      signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
    } }, { remainingCase: true });
    await assertNoStructuredWork(); assert.equal(driver.trace.length, 2); assert.equal(driver.customerInputs.length, 2); assert.notEqual(driver.customerInputs[0]?.clientMessageId, driver.customerInputs[1]?.clientMessageId);
    assert.ok(driver.events.some(row => actualChiefText(row, answer)));
  } catch (error) { primary = error; throw error;
  } finally {
    await preservePhaseCleanup(caseTag, primary === undefined ? undefined : { error: primary }, async () => {
      await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { asked, completed, scope: "Ordinary clarification/new input only; no Goal/Task/card/approval", primaryError: primary === undefined ? null : actualErrorFact(primary) });
      await driver.dispose(); await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { asked, completed, scope: "Actual dialogue/drain/cleanup; not LLM classification or execution" }); assert.deepEqual(driver.errors, []);
    });
  }
}

/** P1.1 ordinary preparation through the real Desktop lifecycle; no Git/M0/plan/D3 fixture. */
export async function runChiefHubDraftCase(options: { productRecovery?: boolean; chiefRecovery?: boolean; blockedPreparationRole?: "nominator" | "convener" | "rapporteur" } = {}) {
  const recovery = options.productRecovery === true, chiefRecovery = options.chiefRecovery === true, blockedRole = options.blockedPreparationRole;
  assert.ok(Number(recovery) + Number(chiefRecovery) + Number(blockedRole !== undefined) <= 1);
  const caseTag = blockedRole ? process.env.ANS_BLOCKED_PREPARATION_CASE_TAG ?? (blockedRole === "convener" ? "q72-convener-blocked" : blockedRole === "rapporteur" ? "q92-rapporteur-blocked" : "q71-nominator-blocked") : chiefRecovery ? process.env.ANS_CHIEF_RECOVERY_CASE_TAG ?? "q70-chief-recovery" : recovery ? process.env.ANS_PRODUCT_RECOVERY_CASE_TAG ?? "q59-product-recovery" : process.env.ANS_HUB_DRAFT_CASE_TAG ?? "q48-hub-draft";
  assert.match(caseTag, blockedRole ? new RegExp(`^q[1-9]\\d{0,5}-${blockedRole}-blocked$`) : chiefRecovery ? /^q[1-9]\d{0,5}-chief-recovery$/ : recovery ? /^q[1-9]\d{0,5}-product-recovery$/ : /^q[1-9]\d{0,5}-hub-draft(?:-\d{1,6})?$/);
  const op = (suffix: string) => `${caseTag}-${suffix}`, draftPath = "docs/product/hub-draft-intent-v1.md";
  const content = `---\nschema: project-intent/v1\nflowId: hub-draft\nintentId: ${caseTag}-intent\nversion: 1\n---\n# Preliminary product draft\nDescribe the requested local text outcome for later customer review. This draft is not confirmed intent, role activation or execution authorization.\n`;
  let driver!: Awaited<ReturnType<typeof createRealHttpDriver>>, completed = false, writeReply: string | undefined, closeReply: string | undefined;
  let actualWritten: { path: string; bytes: number; sha256: string } | undefined;
  const rejectedPath = "src/impl/product-outside-boundary.txt";
  let recoveryTaskId: string | undefined, rejectedWriteReply: string | undefined;
  let recoveryBefore: unknown, recoveryAfterDenial: unknown, recoveryCreated: unknown;
  const missingReference = blockedRole === "convener" ? "docs/scheduling/customer-planning-input.md" : blockedRole === "rapporteur" ? "docs/product/customer-confirmed-reference.md" : blockedRole ? "docs/scheduling/customer-assignment-roster.md" : "docs/product/customer-supplied-reference.md";
  const blockedRoleLabel = blockedRole === "convener" ? "Convener" : blockedRole === "rapporteur" ? "Planner" : "Nominator";
  const blockedProhibition = blockedRole === "convener" ? "不派impl、不冻结pin、不停止run、不产生候选或质量/执行授权" : blockedRole === "rapporteur" ? "不造已确认需求、不写或提交方案、不形成团队计划、D3或执行授权" : "不任命、不产生D3、不激活、不批准执行";
  const blockedSummary = `${blockedRoleLabel.toUpperCase()}_REFERENCE_UNAVAILABLE|path=${missingReference}|END`;
  let blockedDisposition: unknown;
  const blockedStopText = `已核${blockedRoleLabel}正式阻塞：${missingReference}不存在。原任务已由Chief退修终结；请客户补充真实${blockedRole === "convener" ? "planning input" : blockedRole === "rapporteur" ? "confirmed requirements" : "roster"}后再决定是否重新派发。当前${blockedProhibition}。`;
  let chiefRecoveryReply: string | undefined;
  const seen = new Set<string>(), recipients = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"];
  const scripts: HttpScripts = { chief: [
    () => modelCalls(gitTool(op("product"), "dispatch_task", { roleId: "product", flowId: "hub-draft", sideEffect: "docs", idempotencyKey: op("product"),
      task: `普通产品准备：仅在本人职责区起草${draftPath}并正式submit_report。项目无Git/M0/plan/D3；不要init、伪造确认或执行授权。`, expectedOutput: draftPath })),
    body => { const reply = actualToolReply(body, op("product")); assert.match(reply, /已受理|已派发/, reply); return modelDone("等待产品实际草稿及正式报告，不把派发当写入或确认。"); },
    body => modelCalls(gitTool(op("close"), "close_created_task", originalCreatorClose(body, op("close")))),
    async body => { closeReply = actualToolReply(body, op("close")); const task = (await driver.observe()).tasks.find(t => t.created?.idempotencyKey === op("product"));
      assert.ok(task?.created && task.closed); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "product"); assert.equal(task.created.hubRouting, "chief-hub-v1");
      assert.equal(task.closed.by, "chief"); assert.equal(task.closed.outcome, "accepted", closeReply); assert.equal(task.reports.at(-1)?.status, "done");
      if (recovery) assert.equal(task.taskId, recoveryTaskId, "Recovery must close the same actual task, not a replacement");
      completed = true; return modelDone("真实产品草稿及正式报告已由原创建者收口；客户意图未确认，也未授权执行。"); },
  ], product: [
    () => modelCalls(gitTool(op("write"), "write_file", { path: draftPath, content })),
    async body => { writeReply = actualToolReply(body, op("write")); assert.match(writeReply, /已获准并落盘/, `ACTUAL_PLAIN_DRAFT_WRITE_REJECTION ${writeReply}`);
      const bytes = await fs.readFile(path.join(driver.root, draftPath)); assert.equal(bytes.toString("utf8"), content);
      actualWritten = { path: draftPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
      return modelCalls(gitTool(op("read"), "read_file", { path: draftPath })); },
    body => { assert.ok(actualToolReply(body, op("read")).includes(`${caseTag}-intent`)); assert.ok(actualWritten);
      return modelCalls(gitTool(op("report"), "submit_report", { status: "completed", summary: `产品普通草稿真实写入并读取，${actualWritten.bytes}bytes sha256 ${actualWritten.sha256}；未确认意图。`, evidence: [draftPath] })); },
    body => { actualToolReply(body, op("report")); return modelDone("产品普通草稿已正式回报原Chief，未提交客户意图确认或Git动作。"); },
  ], "chief:feedback": [body => { const key = ownProducedFeedback(body, driver.trace, [blockedRole ?? "product", ...recipients.filter(r => r !== "chief").map(r => `${r}:application-notice`)]);
    assert.equal(seen.has(key), false); seen.add(key); return modelDone("已收到实际角色回执，正式收口仍核应用报告依据。"); }] };
  if (recovery) {
    const ordinaryProduct = scripts.product; assert.ok(ordinaryProduct?.[0]); const writeOwnDraft = ordinaryProduct[0];
    scripts.product = [async body => {
      const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("product"));
      assert.ok(task?.created); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "product"); assert.equal(task.closed, undefined);
      assert.equal(task.reports.length, 0); assert.equal(actual.ledger.some(event => event.kind === "task.redispatch" && event.taskId === task.taskId), false);
      assert.ok(actualUserInput(body).includes(task.taskId));
      assert.ok(actual.inventory.activeDeliveries.some(item => item.roleId === "product" && item.taskId === task.taskId));
      recoveryTaskId = task.taskId; recoveryBefore = task; recoveryCreated = task.created;
      return modelCalls(gitTool(op("rejected-write"), "write_file", { path: rejectedPath, content: "This Product write outside its boundary must be refused.\n" }));
    }, async body => {
      rejectedWriteReply = actualToolReply(body, op("rejected-write"));
      assert.doesNotMatch(rejectedWriteReply, /已获准并落盘/); assert.match(rejectedWriteReply, /拒|不允许|越界|denied/i);
      assert.equal(await fs.stat(path.join(driver.root, rejectedPath)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
      const actual = await driver.observe(), task = actual.tasks.find(t => t.taskId === recoveryTaskId);
      assert.ok(task?.created); assert.equal(task.closed, undefined); assert.equal(task.reports.length, 0);
      assert.equal(actual.ledger.some(event => event.kind === "task.redispatch" && event.taskId === task.taskId), false);
      assert.deepEqual(task.created, recoveryCreated, "Denied tool call must not recreate or grant authority to the task");
      recoveryAfterDenial = task;
      await driver.save(path.join(evidence, `${caseTag}-actual-denial-same-task.json`), { rejectedPath, rejectedWriteReply, recoveryBefore, recoveryAfterDenial, actualInventory: actual.inventory });
      return writeOwnDraft(body);
    }, ...ordinaryProduct.slice(1)];
  }
  if (chiefRecovery) {
    const ordinaryProduct = scripts.product; assert.ok(ordinaryProduct);
    scripts.product = [body => {
      assert.ok(actualUserInput(body).includes(missingReference));
      return modelCalls(gitTool(op("reference-read"), "read_file", { path: missingReference }));
    }, async body => {
      chiefRecoveryReply = actualToolReply(body, op("reference-read")); assert.doesNotMatch(chiefRecoveryReply, /^read_file: docs\/product\/customer-supplied-reference\.md\n\n/);
      assert.match(chiefRecoveryReply, /ENOENT|不存在|no such|未找到|读取失败|失败|missing/i);
      assert.equal(await fs.stat(path.join(driver.root, missingReference)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
      await driver.save(path.join(evidence, `${caseTag}-actual-reference-unavailable.json`), { actualToolReply: chiefRecoveryReply, actualMissingPath: missingReference });
      return modelCalls(gitTool(op("blocked-report"), "submit_report", { status: "blocked", summary: `PRODUCT_REFERENCE_UNAVAILABLE|path=${missingReference}|END`, evidence: [] }));
    }, body => { actualToolReply(body, op("blocked-report")); return modelDone("参考资料真实读取未获内容，已正式blocked回Chief；未伪造文件或继续写草稿。"); }, ...ordinaryProduct];
    scripts.chief = [async body => {
      assert.ok(actualUserInput(body).includes(missingReference) && actualUserInput(body).includes(draftPath));
      await observeActualChiefWorkflow(body);
      return modelCalls(gitTool(op("product"), "dispatch_task", { roleId: "product", flowId: "hub-draft", sideEffect: "docs", idempotencyKey: op("product"),
        task: `先实际read_file核客户提及的${missingReference}；缺失时正式blocked报告，不造参考内容或权限。后续目标仍是产品自属${draftPath}的普通准备，等待Chief依据原客户说明协调。`, expectedOutput: "参考内容或正式blocked事实" }));
    }, body => { assert.match(actualToolReply(body, op("product")), /已受理|已派发/); return modelDone("等待真实参考检查/正式报告，不以工具失败冒已完成。"); },
    async body => { const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("product")), report = task?.reports.at(-1);
      assert.ok(task?.created && report); assert.equal(report.status, "blocked"); assert.equal(report.summary, `PRODUCT_REFERENCE_UNAVAILABLE|path=${missingReference}|END`);
      assert.ok(actualUserInput(body).includes(task.taskId) && actualUserInput(body).includes(report.summary)); assert.equal(task.closed, undefined);
      assert.equal(task.created.from, "chief"); assert.equal(task.created.to, "product");
      return modelCalls(gitTool(op("rework"), "close_created_task", { ...originalCreatorClose(body, op("rework")), outcome: "rework" })); },
    async body => { const reply = actualToolReply(body, op("rework")), actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("product"));
      assert.ok(task?.closed); assert.equal(task.closed.outcome, "rework", reply); assert.equal(task.closed.by, "chief");
      await driver.save(path.join(evidence, `${caseTag}-chief-actual-rework.json`), { actualTask: task, actualCloseReply: reply });
      return modelCalls(gitTool(op("product-repair"), "dispatch_task", { roleId: "product", flowId: "hub-draft", sideEffect: "docs", idempotencyKey: op("product-repair"),
        task: `Chief已收到真实参考缺失报告并将旧任务正式rework。原客户已说明缺参考时按其直接目标起草：仅在产品自属${draftPath}形成可供复核的本地文本产品意图，不确认意图/不Gitinit/不授执行权。实际write_file/read_file后正式report。`, expectedOutput: draftPath })); },
    body => { assert.match(actualToolReply(body, op("product-repair")), /已受理|已派发/); return modelDone("已按真实blocked事实与原客户目标重新派发普通草稿，旧scope不转授。"); },
    body => modelCalls(gitTool(op("close"), "close_created_task", originalCreatorClose(body, op("close")))),
    async body => { closeReply = actualToolReply(body, op("close")); const tasks = (await driver.observe()).tasks;
      const old = tasks.find(t => t.created?.idempotencyKey === op("product")), repaired = tasks.find(t => t.created?.idempotencyKey === op("product-repair"));
      assert.ok(old?.created && old.closed && repaired?.created && repaired.closed); assert.notEqual(old.taskId, repaired.taskId);
      assert.equal(old.closed.outcome, "rework"); assert.equal(old.reports.at(-1)?.status, "blocked");
      assert.equal(repaired.created.from, "chief"); assert.equal(repaired.created.to, "product"); assert.equal(repaired.closed.by, "chief"); assert.equal(repaired.closed.outcome, "accepted", closeReply);
      assert.equal(repaired.reports.at(-1)?.status, "done"); completed = true;
      await driver.save(path.join(evidence, `${caseTag}-actual-chief-coordinated-recovery.json`), { oldTask: old, repairedTask: repaired, actualWritten, actualCloseReply: closeReply });
      return modelDone("真实blocked任务已正式返工终结；新产品草稿经真实写入/报告由Chief接受，客户意图与执行均未被批准。"); }];
  }
  if (blockedRole) {
    scripts[blockedRole] = [body => {
      assert.ok(actualUserInput(body).includes(missingReference));
      return modelCalls(gitTool(op("reference-read"), "read_file", { path: missingReference }));
    }, async body => {
      chiefRecoveryReply = actualToolReply(body, op("reference-read"));
      assert.equal(chiefRecoveryReply.startsWith(`read_file: ${missingReference}\n\n`), false);
      assert.match(chiefRecoveryReply, /ENOENT|不存在|no such|未找到|读取失败|失败|missing/i);
      assert.equal(await fs.stat(path.join(driver.root, missingReference)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
      await driver.save(path.join(evidence, `${caseTag}-actual-reference-unavailable.json`), { roleId: blockedRole, actualToolReply: chiefRecoveryReply, actualMissingPath: missingReference });
      return modelCalls(gitTool(op("blocked-report"), "submit_report", { status: "blocked", summary: blockedSummary, evidence: [] }));
    }, body => { actualToolReply(body, op("blocked-report")); return modelDone(`真实准备依据缺失，已正式blocked回Chief；${blockedProhibition}。`); }];
    scripts.chief = [async body => {
      await observeActualChiefWorkflow(body); assert.ok(actualUserInput(body).includes(missingReference));
      return modelCalls(gitTool(op("blocked-preparation"), "dispatch_task", { roleId: blockedRole, flowId: "hub-draft", sideEffect: "docs", idempotencyKey: op("blocked-preparation"),
        task: `仅核${missingReference}是否有客户提供的${blockedRole === "convener" ? "计划输入" : blockedRole === "rapporteur" ? "已确认需求依据" : "任命依据"}。实际read_file缺失则正式blocked回Chief，禁止补造资料；${blockedProhibition}。`, expectedOutput: "实际依据或正式blocked事实" }));
    }, body => { assert.match(actualToolReply(body, op("blocked-preparation")), /已受理|已派发/); return modelDone(`等待${blockedRoleLabel}真实材料检查和正式报告。`); },
    async body => {
      const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("blocked-preparation")), report = task?.reports.at(-1);
      assert.ok(task?.created && report); assert.equal(task.created.from, "chief"); assert.equal(task.created.to, blockedRole); assert.equal(task.closed, undefined);
      assert.equal(report.status, "blocked"); assert.equal(report.summary, blockedSummary);
      assert.ok(actualUserInput(body).includes(task.taskId) && actualUserInput(body).includes(report.summary));
      return modelCalls(gitTool(op("rework"), "close_created_task", { ...originalCreatorClose(body, op("rework")), outcome: "rework" }));
    }, async body => {
      closeReply = actualToolReply(body, op("rework"));
      const actual = await driver.observe(), task = actual.tasks.find(t => t.created?.idempotencyKey === op("blocked-preparation"));
      assert.ok(task?.created && task.closed); assert.equal(task.closed.outcome, "rework", closeReply); assert.equal(task.closed.by, "chief");
      assert.equal(task.reports.at(-1)?.status, "blocked"); assert.equal(actual.tasks.length, 1, "No implicit replacement, appointment or implementation task may be created");
      blockedDisposition = { actualTask: task, actualCloseReply: closeReply, disposition: `Await customer-supplied ${blockedRole === "convener" ? "planning input" : blockedRole === "rapporteur" ? "confirmed requirements" : "roster"}; no effects authority granted` };
      await driver.save(path.join(evidence, `${caseTag}-chief-actual-blocked-disposition.json`), blockedDisposition); completed = true;
      return modelDone(blockedStopText);
    }];
  }
  for (const recipient of recipients) scripts[`${recipient}:application-notice`] = [async body => {
    const text = actualApplicationNotice(body); assert.ok(text); const match = /^\[应用·文档更新\] close-created-task ([^ ]+) applied; ([a-f0-9]{64})$/.exec(text); assert.ok(match);
    assert.ok((blockedRole ? [op("rework")] : chiefRecovery ? [op("rework"), op("close")] : [op("close")]).includes(match[1]!));
    const task = (await driver.observe()).tasks.find(t => t.closed?.operationId === match[1]);
    assert.ok(task?.created && task.closed); assert.equal(task.closed.outcome, match[1] === op("rework") ? "rework" : "accepted");
    const source = task.closed.actionSource; assert.ok(source?.kind === "role-direct" && source.action === "close-created-task" && source.actorRoleId === "chief");
    assert.equal(source.operationId, match[1]); assert.equal(source.runId, task.created.runId);
    assert.equal(text, `[应用·文档更新] close-created-task ${source.operationId} applied; ${source.targetDigest}`);
    const key = `${recipient}:${task.taskId}:${source.applicationId}:${source.targetDigest}`; assert.equal(seen.has(key), false); seen.add(key);
    return modelDone(`只确认普通草稿真实收口 ${source.operationId}/${source.applicationId}/${task.taskId}，不代客户确认或执行授权。`);
  }];
  driver = await createRealHttpDriver(scripts, { tag: caseTag, requestLimit: 48, timeoutMs: 15000, caseDeadlineAt: Date.now() + 45000,
    finiteRoles: blockedRole ? { chief: { initial: 0, tasks: { [op("blocked-preparation")]: 2 } }, [blockedRole]: { tasks: { [op("blocked-preparation")]: 0 } } } : { chief: { initial: 0, tasks: { [op("product")]: 2, ...(chiefRecovery ? { [op("product-repair")]: 5 } : {}) } },
      ...(chiefRecovery ? { product: { tasks: { [op("product")]: 0, [op("product-repair")]: 3 } } } : {}) }, reusableNoticeKeys: ["chief:feedback", ...recipients.map(r => `${r}:application-notice`)] });
  try {
    assert.ok(driver.initialRootFacts.ancestors.every(item => !item.gitMarker && !item.symbolicLink));
    await driver.bounded("plain NoGit Desktop chief entry", () => driver.openChief());
    await driver.bounded("ordinary Chief product dispatch", () => driver.sendChief(blockedRole ? `请${blockedRoleLabel}仅核${missingReference}，没有依据就正式报告给Chief。若确实缺失请明确通知我并终结本次准备任务为退修，等我补充后再派；${blockedProhibition}。` : chiefRecovery ? `请产品先核${missingReference}；若参考缺失请真实汇报，由Chief按我直接提供的目标重派：在${draftPath}起草可供复核的本地文本产品意图。只是普通准备，不确认意图/不Gitinit/不授执行权。` : "先让产品起草可供客户复核的产品目标；这是新空项目普通准备，不初始化Git、不预置或批准M0/plan/D3。"));
    await driver.bounded("ordinary Product write/report/Chief close and actual phase drain", async signal => {
      for (;;) { if (driver.errors.length) throw new Error(driver.errors.join("\n")); assert.equal(driver.pending.size, 0, "No approval or intent-confirm card is part of this ordinary draft case");
        const actual = await driver.observe(), chief = actual.inventory.sessions.find(s => s.roleId === "chief" && s.phase === "live");
        if (completed && actual.inventory.pendingOpens.length === 0 && actual.inventory.activeDeliveries.length === 0 && actual.inventory.queuedDispatches.length === 0
          && chief?.lifecycle?.status === "quiescent" && chief.lifecycle.providerFinished) break;
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); }
    });
    if (blockedRole) {
      assert.ok(blockedDisposition && chiefRecoveryReply); assert.equal(actualWritten, undefined);
      assert.equal(driver.trace.some(t => t.reply?.tool_calls?.some(c => /(?:request_choice|activate_role_documents|write_file|freeze|stop|git_candidate|git_publish|complete_team_plan)/.test(c.function.name))), false);
      const visible = driver.events.filter(row => evidenceField(row, "roleId") === "chief"
        && evidenceField(evidenceField(row, "event"), "kind") === "message"
        && (() => { const detail = evidenceField(evidenceField(row, "event"), "detail"); return detail !== undefined && evidenceField(detail, "text") === blockedStopText; })());
      assert.equal(visible.length, 1, "Actual Desktop Chief event must visibly explain the stop exactly once");
      const turnId = evidenceField(evidenceField(visible[0], "event"), "turnId"); assert.equal(typeof turnId, "string");
      assert.ok(driver.events.some(row => evidenceField(row, "roleId") === "chief" && evidenceField(evidenceField(row, "event"), "kind") === "settled"
        && evidenceField(evidenceField(row, "event"), "turnId") === turnId), "Visible disposition turn must actually settle");
      await driver.save(path.join(evidence, `${caseTag}-actual-customer-visible-stop.json`), { actualChiefEvents: visible, actualTurnId: turnId, blockedDisposition });
    } else { assert.ok(actualWritten); assert.equal(createHash("sha256").update(await fs.readFile(path.join(driver.root, draftPath))).digest("hex"), actualWritten.sha256); }
    const manifest = await createProjectTrunkStore(driver.root).readManifest(); assert.equal(manifest.ok, false, "Draft close is not a published trunk");
    const gitExists = await fs.stat(path.join(driver.root, ".git")).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }); assert.equal(gitExists, false);
    const baseline = await readVersionBaselineState(driver.root); const rows = (baseline.text ?? "").split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.equal(rows.some(row => row.freeze?.reason === "intent-confirmed"), false); assert.deepEqual(driver.customerTrace, []);
    assert.equal(driver.trace.some(t => t.reply?.tool_calls?.some(c => /ans_git_(candidate|publish)/.test(c.function.name))), false);
    if (recovery) {
      assert.ok(recoveryTaskId && rejectedWriteReply && recoveryBefore && recoveryAfterDenial);
      assert.equal(await fs.stat(path.join(driver.root, rejectedPath)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
      await driver.save(path.join(evidence, `${caseTag}-actual-recovered-same-task.json`), { recoveryTaskId, rejectedPath, rejectedWriteReply, recoveryBefore, recoveryAfterDenial, actualWritten, closeReply });
    }
  } finally {
    await driver.save(path.join(evidence, `${caseTag}-full-final-proof.json`), { phaseOnly: true, hubDraftOnly: true, productRecoveryOnly: recovery, chiefCoordinatedRecovery: chiefRecovery, blockedPreparationRole: blockedRole, blockedDisposition, completed, actualWritten, writeReply, closeReply, noGitSetup: true, recoveryTaskId, rejectedWriteReply, actualMissingReferenceReply: chiefRecoveryReply });
    await driver.dispose(); await driver.save(path.join(evidence, `${caseTag}-after-cleanup-proof.json`), { stage: "actual bounded phase drain and dispose/tail writes completed", phaseOnly: true, productRecoveryOnly: recovery, chiefCoordinatedRecovery: chiefRecovery, blockedPreparationRole: blockedRole, blockedDisposition, completed, actualWritten, writeReply, closeReply, recoveryTaskId, rejectedWriteReply, actualMissingReferenceReply: chiefRecoveryReply });
    if (completed) assert.deepEqual(driver.errors, [], "No late hub draft receiver/transport failure may be hidden");
  }
}

test("Q48 hub ordinary no-Git product draft report and Chief typed close", { timeout: 45000, skip: process.env.ANS_HUB_DRAFT_STANDALONE !== "1" }, runChiefHubDraftCase);
test("Q59 Product same-candidate denied write recovers within original task", { timeout: 45000, skip: process.env.ANS_PRODUCT_RECOVERY_STANDALONE !== "1" }, () => runChiefHubDraftCase({ productRecovery: true }));
test("Q70 workflow formal Product blocked Chief rework and real same-goal draft recovery", { timeout: 45000, skip: process.env.ANS_CHIEF_RECOVERY_STANDALONE !== "1" }, () => runChiefHubDraftCase({ chiefRecovery: true }));
test("Q71 Nominator formal blocked Chief rework and customer-visible stop", { timeout: 45000, skip: process.env.ANS_BLOCKED_PREPARATION_STANDALONE !== "1" }, () => runChiefHubDraftCase({ blockedPreparationRole: "nominator" }));
test("Q72 Convener ordinary preparation formal blocked Chief rework and visible stop", { timeout: 45000, skip: process.env.ANS_BLOCKED_PREPARATION_STANDALONE !== "1" }, () => runChiefHubDraftCase({ blockedPreparationRole: "convener" }));

if (process.env.ANS_Q36_STANDALONE === "1") {
  assert.equal(process.env.ANS_Q36_BUSINESS, "1"); assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const started = new Date().toISOString(); let completed = false;
  process.stdout.write(`Q_STANDALONE_BUSINESS_START ${JSON.stringify({ started, nodeTestRuntimeLoaded: false, registeredTestCount: 0, wholeBudgetMs: firstNewBusinessTimeoutMs(), node: process.version })}\n`);
  try { await runFirstNewBusinessCase(); completed = true; }
  finally {
    const ended = new Date().toISOString();
    await fs.writeFile(path.join(evidence, "q36-standalone-entry.json"), JSON.stringify({ started, ended, completed, entry: "top-level await same runFirstNewBusinessCase", nodeTestRuntimeLoaded: false, registeredTestCount: registeredCases.length, wholeBudgetMs: firstNewBusinessTimeoutMs(), node: process.version }, null, 2));
    process.stdout.write(`Q_STANDALONE_BUSINESS_RETURN ${JSON.stringify({ ended, completed })}\n`);
  }
}

if (process.env.ANS_Q39_CHILD === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0); assert.equal(process.env.ANS_Q39_BUSINESS, "1");
  const caseTag = process.env.ANS_Q39_CASE_TAG, runNonce = process.env.ANS_HARNESS_RUN_ID;
  assert.ok(caseTag && runNonce); assert.match(caseTag, /^[a-z0-9][a-z0-9-]{0,99}$/);
  const deadlineAt = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT);
  assert.ok(Number.isSafeInteger(deadlineAt) && deadlineAt > Date.now() && deadlineAt <= Date.now() + 300000);
  const source = [fileURLToPath(import.meta.url), path.resolve("test/测试/git-role-workflows-driver.ts")].map(file => ({ file,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }));
  const start = { at: new Date().toISOString(), runNonce, caseTag, pid: process.pid, parentPid: process.ppid, deadlineAt, source,
    inputIdentity: process.env.ANS_HARNESS_INPUT_IDENTITY, nodeTestRuntimeLoaded: nodeTest !== undefined, registeredTestCount: registeredCases.length };
  writeFileSync(path.join(evidence, `${caseTag}-child-start.json`), JSON.stringify(start, null, 2), { flag: "wx" });
  process.stdout.write(`Q_OWNED_BUSINESS_CHILD_START ${JSON.stringify(start)}\n`);
  let completed = false;
  try { await runFirstNewBusinessCase(); completed = true; }
  finally {
    let root: string | undefined;
    const proof = (name: string) => {
      const file = path.join(evidence, `${caseTag}-${name}.json`), bytes = readFileSync(file);
      const data = JSON.parse(bytes.toString("utf8")); root = data.root;
      return { path: file, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const completedProof = completed ? proof("new-delivery-controller-closed") : undefined;
    const finalProof = completed ? proof("full-final-proof") : undefined;
    const postCleanupProof = completed ? proof("after-cleanup-proof") : undefined;
    writeFileSync(path.join(evidence, `${caseTag}-child-result.json`), JSON.stringify({ ...start, ended: new Date().toISOString(),
      completed, root, completedProof, finalProof, postCleanupProof }, null, 2), { flag: "wx" });
    process.stdout.write(`Q_OWNED_BUSINESS_CHILD_RETURN ${JSON.stringify({ runNonce, caseTag, pid: process.pid, completed })}\n`);
  }
}

if (process.env.ANS_CHANGE_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  assert.equal(process.env.ANS_Q37_CHANGE_ENTRY, "1");
  process.stdout.write(`Q_CHANGE_ENTRY_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_CHANGE_CASE_TAG, nodeTestRuntimeLoaded: false, businessMs: 90000, fullChange: false })}\n`);
  await runDeliveredChangeEntryCase();
  process.stdout.write(`Q_CHANGE_ENTRY_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_CHANGE_CASE_TAG, phaseOnly: true, fullChange: false })}\n`);
}

if (process.env.ANS_CHANGE_PLAN_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_CHANGE_PLANNING_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_CHANGE_PLAN_CASE_TAG, businessMs: 90000, fullChange: false })}\n`);
  await runChangeIntentAndPlanningCase();
  process.stdout.write(`Q_CHANGE_PLANNING_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, phaseOnly: true, fullChange: false })}\n`);
}

if (process.env.ANS_CHANGE_PUBLISH_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_CHANGE_PUBLICATION_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, round: process.env.ANS_CHANGE_PUBLICATION_ROUND, phaseOnly: true })}\n`);
  await runChangePublicationAndModeCase();
  process.stdout.write(`Q_CHANGE_PUBLICATION_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, phaseOnly: true })}\n`);
}

if (process.env.ANS_CHANGE_EXECUTION_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_CHANGE_EXECUTION_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, round: process.env.ANS_CHANGE_EXECUTION_ROUND, wholeMs: 90000, executionAdmissionOnly: true })}\n`);
  await runChangeExecutionAdmissionCase();
}

if (process.env.ANS_HUB_DRAFT_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_HUB_DRAFT_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_HUB_DRAFT_CASE_TAG, wholeMs: 45000, requests: 48 })}\n`);
  await runChiefHubDraftCase();
  process.stdout.write(`Q_HUB_DRAFT_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ordinaryDraftOnly: true })}\n`);
}

if (process.env.ANS_PRODUCT_RECOVERY_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_PRODUCT_RECOVERY_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_PRODUCT_RECOVERY_CASE_TAG, wholeMs: 45000, requests: 48 })}\n`);
  await runChiefHubDraftCase({ productRecovery: true });
  process.stdout.write(`Q_PRODUCT_RECOVERY_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, phaseOnly: true, oneRoleRecoveryOnly: true })}\n`);
}

if (process.env.ANS_CHIEF_RECOVERY_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_CHIEF_RECOVERY_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_CHIEF_RECOVERY_CASE_TAG, wholeMs: 45000, requests: 48 })}\n`);
  await runChiefHubDraftCase({ chiefRecovery: true });
  process.stdout.write(`Q_CHIEF_RECOVERY_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, completed: true, scope: "One real Product formal-blocked/Chief-rework recovery, not all-role acceptance" })}\n`);
}

if (continuousChangeChild) {
  process.stdout.write(`Q_CONTINUOUS_CHANGE_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, round: process.env.ANS_CONTINUOUS_CHANGE_ROUND,
    nonce: process.env.ANS_HARNESS_RUN_ID, sharedDeadlineAt: process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT, nodeTestRuntimeLoaded: false, registeredTestCount: registeredCases.length })}\n`);
  await runContinuousNewToChangeCase();
  process.stdout.write(`Q_CONTINUOUS_CHANGE_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, completed: true })}\n`);
}

if (process.env.ANS_BLOCKED_PREPARATION_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_BLOCKED_PREPARATION_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_BLOCKED_PREPARATION_CASE_TAG, wholeMs: 45000, requests: 48 })}\n`);
  const role = process.env.ANS_BLOCKED_PREPARATION_ROLE; assert.ok(role === "nominator" || role === "convener" || role === "rapporteur");
  await runChiefHubDraftCase({ blockedPreparationRole: role });
  process.stdout.write(`Q_BLOCKED_PREPARATION_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, scope: `${role} ordinary formal block/Chief rework and visible stop only` })}\n`);
}

if (process.env.ANS_NEW_MODIFICATION_CHILD === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const round = process.env.ANS_NEW_MODIFICATION_ROUND, nonce = process.env.ANS_HARNESS_RUN_ID;
  assert.ok(round && /^q[1-9]\d{0,5}$/.test(round) && nonce); const deadline = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT); assert.ok(Number.isSafeInteger(deadline) && deadline > Date.now());
  const includeRevert = process.env.ANS_INCLUDE_REVERT === "1";
  const stageBudgets = { new: 300000, modification: 180000, revert: 240000 };
  const emit = (phase: "new" | "modification" | "revert", event: "start" | "end") => process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase, event,
    ...(event === "start" ? { budgetMs: stageBudgets[phase], deadlineAt: Math.min(Date.now() + stageBudgets[phase], deadline) } : { completed: true }) })}\n`);
  const sourceHashes = () => Promise.all(["test/测试/git-role-workflows-e2e.test.ts", "test/测试/git-role-workflows-driver.ts"].map(async file => ({ file, sha256: createHash("sha256").update(await fs.readFile(file)).digest("hex") })));
  const startSource = await sourceHashes();
  let phase = "new", completed = false, primary: unknown;
  try {
    emit("new", "start"); await runFirstNewBusinessCase();
    const proofFile = path.join(evidence, `${round}-new-new-delivery-controller-closed.json`), proofBytes = await fs.readFile(proofFile);
    const final = JSON.parse(await fs.readFile(path.join(evidence, `${round}-new-after-cleanup-proof.json`), "utf8")); assert.deepEqual(final.errors, []);
    const outcome = JSON.parse(await fs.readFile(path.join(evidence, `${round}-new-error-outcomes.json`), "utf8")); assert.equal(outcome.primaryError, null); assert.equal(outcome.cleanupError, null); assert.equal(outcome.finalAssertionsCompleted, true);
    const newProof = JSON.parse(proofBytes.toString("utf8")); assert.ok(isGitCapabilityResult(newProof.extra?.publishedDelivery) && newProof.extra.publishedDelivery.status === "published");
    emit("new", "end"); phase = "modification"; emit("modification", "start");
    const modified = await runDeliveredTextModification({ caseTag: `${round}-edit`, proofFile, proofSha256: createHash("sha256").update(proofBytes).digest("hex"), absoluteDeadlineAt: deadline });
    assert.equal(modified.root, newProof.root); assert.deepEqual(await sourceHashes(), startSource);
    emit("modification", "end");
    if (includeRevert) {
      const modificationOutcome = JSON.parse(await fs.readFile(path.join(evidence, `${round}-edit-error-outcomes.json`), "utf8")); assert.equal(modificationOutcome.primaryError, null); assert.equal(modificationOutcome.cleanupError, null);
      const modificationFinal = JSON.parse(await fs.readFile(path.join(evidence, `${round}-edit-after-cleanup-proof.json`), "utf8")); assert.deepEqual(modificationFinal.errors, []); assert.equal(modificationFinal.extra.completed, true);
      const modifiedProof = await fs.readFile(modified.proofFile); phase = "revert"; emit("revert", "start");
      const reverted = await runDeliveredRevertWithReviewRepair({ caseTag: `${round}-revert`, proofFile: modified.proofFile, proofSha256: createHash("sha256").update(modifiedProof).digest("hex"),
        historyProof: { path: proofFile, sha256: createHash("sha256").update(proofBytes).digest("hex") }, absoluteDeadlineAt: deadline });
      assert.equal(reverted.root, newProof.root); assert.deepEqual(await sourceHashes(), startSource); emit("revert", "end");
    }
    completed = true;
  } catch (error) { primary = error; throw error;
  } finally {
    await fs.writeFile(path.join(evidence, `${round}-new-modification${includeRevert ? "-revert" : ""}-outcome.json`), JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase, completed, primaryError: primary === undefined ? null : actualErrorFact(primary), actualCoreRegistry: inspectRuntimeCoreRegistry(), budget: { http: includeRevert ? 512 : 384, newMs: 300000, modificationMs: 180000, ...(includeRevert ? { revertMs: 240000 } : {}), sharedAbsoluteDeadlineAt: deadline, wrapperMs: includeRevert ? 750000 : 510000, retries: 0 } }, null, 2), { flag: "wx" });
  }
}

if (process.env.ANS_EXISTING_REVERT_CHILD === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const round = process.env.ANS_EXISTING_REVERT_ROUND, nonce = process.env.ANS_HARNESS_RUN_ID; assert.ok(round && /^q[1-9]\d{0,5}$/.test(round) && nonce);
  const deadline = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT); assert.ok(Number.isSafeInteger(deadline) && deadline > Date.now());
  const checkpointBytes = await fs.readFile(path.join(evidence, "q87-business-delivery-checkpoint.json")), checkpointSha256 = createHash("sha256").update(checkpointBytes).digest("hex");
  assert.equal(checkpointSha256, "e720f9620608a59434dc1a5deb80693c7e8ce2e98b5936627f2b1628a87d16cf"); const historical = JSON.parse(checkpointBytes.toString("utf8"));
  assert.equal(historical.actualLifecycle.watchdogFired, false);
  for (const kind of ["EXIT", "CLOSE"]) { const events = historical.actualLifecycle.events.filter((row: { type: string }) => row.type === kind); assert.equal(events.length, 1); assert.equal(events[0].exitCode, 0); assert.equal(events[0].signal, null); }
  const artifact = (name: string) => { const row = historical.artifacts.find((entry: { file: string }) => entry.file === name); assert.ok(row && typeof row.sha256 === "string"); return { path: path.join(evidence, name), sha256: row.sha256.toLowerCase() }; };
  const modified = artifact("q87-edit-delivered-text-proof.json"), original = artifact("q87-new-new-delivery-controller-closed.json");
  const emit = (event: "start" | "end") => process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase: "revert", event,
    ...(event === "start" ? { budgetMs: 240000, deadlineAt: deadline } : { completed: true }) })}\n`);
  let completed = false, primary: unknown;
  try { emit("start"); await runDeliveredRevertWithReviewRepair({ caseTag: `${round}-revert`, proofFile: modified.path, proofSha256: modified.sha256, historyProof: original,
    absoluteDeadlineAt: deadline, existingDeliveredData: { producerSourceIdentity: historical.actualLifecycle.beforeIdentity, checkpointSha256 } }); completed = true; emit("end");
  } catch (error) { primary = error; throw error;
  } finally { await fs.writeFile(path.join(evidence, `${round}-existing-revert-outcome.json`), JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, completed,
    historicalInput: { root: historical.root, producerSourceIdentity: historical.actualLifecycle.beforeIdentity, checkpointSha256, modified, original, meaning: "Previously delivered project data, not current-source prefix execution or inherited runtime authority" },
    primaryError: primary === undefined ? null : actualErrorFact(primary), actualCoreRegistry: inspectRuntimeCoreRegistry(), budget: { http: 128, revertMs: 240000, sharedAbsoluteDeadlineAt: deadline, wrapperMs: 270000, retries: 0 } }, null, 2), { flag: "wx" }); }
}

if (process.env.ANS_QUEUED_RESUME_READONLY_PROBE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const round = process.env.ANS_QUEUED_RESUME_READONLY_ROUND, nonce = process.env.ANS_HARNESS_RUN_ID;
  assert.ok(round && /^q[1-9]\d{0,5}$/.test(round) && nonce); const output = path.join(evidence, `${round}-resume-readonly-admission-proof.json`);
  const deadlineAt = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT); assert.ok(Number.isSafeInteger(deadlineAt) && deadlineAt > Date.now());
  const emit = (event: "start" | "end") => process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase: "resume-inspection", event,
    ...(event === "start" ? { budgetMs: 10000, deadlineAt } : { completed: true }) })}\n`);
  let completed = false, primary: unknown, actualResult: unknown, beforeFiles: { path: string; sha256: string }[] = [], afterFiles: typeof beforeFiles = [];
  const registryBefore = inspectRuntimeCoreRegistry(); let actualRequest: unknown;
  try {
    emit("start"); const bytes = await fs.readFile(path.join(evidence, "q88-terminal-partial-sideeffects-projection.json"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), "ed41d67fff6d31b36fddbd81389eac5da3f563ca3daf3297a4e2cdf7eba5fd2d");
    const historical = JSON.parse(bytes.toString("utf8")), root = await fs.realpath(historical.root);
    assert.ok(root.toLowerCase().startsWith((await fs.realpath(os.tmpdir())).toLowerCase() + path.sep)); assert.match(path.basename(root), /^q2-git-first-bootstrap-/);
    const queueFile = path.join(root, "delivery-queue.json"), queueBytes = await fs.readFile(queueFile);
    assert.equal(createHash("sha256").update(queueBytes).digest("hex"), historical.durableQueue.sha256, "Current partial queue changed; do not silently select a replacement");
    const queue: unknown = JSON.parse(queueBytes.toString("utf8")), items = evidenceField(queue, "items"); assert.ok(Array.isArray(items) && items.length === 1);
    const item = evidenceField(items[0], "item"), resume = evidenceField(item, "controllerResume"), expected = evidenceField(resume, "expected");
    assert.ok(isDispatchTaskResumeController(expected)); const resumeKey = evidenceField(resume, "resumeKey"), basisDigest = evidenceField(resume, "basisDigest");
    assert.ok(typeof resumeKey === "string" && /^[a-f0-9]{64}$/.test(resumeKey) && typeof basisDigest === "string" && /^[a-f0-9]{64}$/.test(basisDigest));
    const files = [queueFile, path.join(root, ".ans/state/tasks.jsonl"), path.join(root, ".git/refs/ans/delivery/q2-new"), path.join(root, "docs/quality/q2-new-report-v3.md")];
    beforeFiles = await Promise.all(files.map(async file => ({ path: file, sha256: createHash("sha256").update(await fs.readFile(file)).digest("hex") })));
    actualRequest = { projectRoot: root, resumeController: expected, resumeKey, basisDigest };
    actualResult = await inspectQueuedControllerResume({ projectRoot: root, resumeController: expected, resumeKey, basisDigest });
    afterFiles = await Promise.all(files.map(async file => ({ path: file, sha256: createHash("sha256").update(await fs.readFile(file)).digest("hex") })));
    assert.deepEqual(afterFiles, beforeFiles); assert.equal(evidenceField(actualResult, "ok"), false); assert.equal(evidenceField(actualResult, "code"), "controller-resume-queue-source-unproven");
    const after = inspectRuntimeCoreRegistry(); assert.deepEqual(after.entries, registryBefore.entries); assert.equal(after.entries.length, 0);
    completed = true; emit("end");
  } catch (error) { primary = error; throw error;
  } finally {
    await fs.writeFile(output, JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, completed, actualRequest, actualResult,
      beforeFiles, afterFiles, actualCoreRegistryBefore: registryBefore, actualCoreRegistryAfter: inspectRuntimeCoreRegistry(), primaryError: primary === undefined ? null : actualErrorFact(primary),
      scope: "Only actual public queued-resume admission in a fresh process. No imported old receipt/accepted map, no Desktop import/restore, no Task/pin/ref/quality change, no model or replacement execution.",
      budget: { http: 0, businessMs: 10000, outerMs: 30000, attempts: 1, retries: 0 }, notClaimed: "Does not explain Q88 original same-process wait or authorize continuation; a real current Chief prepare is still required." }, null, 2), { flag: "wx" });
  }
}

if (process.env.ANS_EXISTING_MODIFICATION_REVERT_CHILD === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  const reviewMode = process.env.ANS_REVERT_REVIEW_MODE;
  assert.ok(reviewMode === undefined || reviewMode === "positive");
  const round = process.env.ANS_EXISTING_MODIFICATION_REVERT_ROUND, nonce = process.env.ANS_HARNESS_RUN_ID;
  assert.ok(round && /^q[1-9]\d{0,5}$/.test(round) && nonce); const deadline = Number(process.env.ANS_HARNESS_ABSOLUTE_DEADLINE_AT); assert.ok(Number.isSafeInteger(deadline) && deadline > Date.now());
  const budgets = { modification: 180000, revert: 240000 };
  const emit = (phase: keyof typeof budgets, event: "start" | "end") => process.stdout.write(`Q_CONTINUOUS_PHASE ${JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase, event,
    ...(event === "start" ? { budgetMs: budgets[phase], deadlineAt: Math.min(Date.now() + budgets[phase], deadline) } : { completed: true }) })}\n`);
  let phase = "modification", completed = false, primary: unknown, actualHistoricalInput: unknown;
  try {
    emit("modification", "start");
    const inspectionPath = reviewMode === "positive" ? process.env.ANS_EXISTING_MODIFICATION_REVERT_INSPECTION : path.join(evidence, "q90-q69-existing-clean-input-inspection.json");
    const inspectionSha256 = reviewMode === "positive" ? process.env.ANS_EXISTING_MODIFICATION_REVERT_INSPECTION_SHA256 : "f2c56a68e17de100a740b01d4d37abc229a2ef2a11af55520b0bd9c533af6c84";
    assert.ok(typeof inspectionPath === "string" && path.dirname(path.resolve(inspectionPath)) === evidence);
    assert.ok(typeof inspectionSha256 === "string" && /^[a-f0-9]{64}$/.test(inspectionSha256));
    const inspectionBytes = await fs.readFile(inspectionPath); assert.equal(createHash("sha256").update(inspectionBytes).digest("hex"), inspectionSha256);
    const inspection = JSON.parse(inspectionBytes.toString("utf8")); assert.equal(inspection.deliveryMatches, true); assert.equal(inspection.allTasksClosed, true); assert.deepEqual(inspection.ledgerErrors, []); assert.deepEqual(inspection.queue.items, []);
    const root = await fs.realpath(inspection.root); assert.ok(root.toLowerCase().startsWith((await fs.realpath(os.tmpdir())).toLowerCase() + path.sep)); assert.match(path.basename(root), /^q2-git-first-bootstrap-/);
    const proofFile = inspection.proof.path, proofBytes = await fs.readFile(proofFile); assert.equal(createHash("sha256").update(proofBytes).digest("hex"), inspection.proof.sha256);
    const proof = JSON.parse(proofBytes.toString("utf8")); assert.equal(proof.root, root); assert.deepEqual(proof.errors, []);
    const currentLedger = await readTaskState(root); assert.deepEqual(currentLedger.errors, []); assert.ok([...currentLedger.records.values()].every(task => task.closed !== undefined));
    const currentQueue = JSON.parse(await fs.readFile(path.join(root, "delivery-queue.json"), "utf8")); assert.deepEqual(currentQueue.items, []);
    const actualRef = await createGitCandidateStore(root).readRef(inspection.expectedDelivery.ref); assert.deepEqual(actualRef, inspection.expectedDelivery.oid);
    actualHistoricalInput = { inspectionPath, inspectionSha256: createHash("sha256").update(inspectionBytes).digest("hex"), root, published: inspection.expectedDelivery, meaning: "Clean historical delivered project data only. Current source prefix not claimed; no source compatibility ticket or prior runtime/accepted map inherited." };
    const sourcePaths = ["test/测试/git-role-workflows-e2e.test.ts", "test/测试/git-role-workflows-driver.ts"], sourceHashes = () => Promise.all(sourcePaths.map(async file => ({ file, sha256: createHash("sha256").update(await fs.readFile(file)).digest("hex") })));
    const before = await sourceHashes();
    const modified = await runDeliveredTextModification({ caseTag: `${round}-edit`, proofFile, proofSha256: inspection.proof.sha256, absoluteDeadlineAt: deadline });
    assert.equal(modified.root, root); const errors = JSON.parse(await fs.readFile(path.join(evidence, `${round}-edit-error-outcomes.json`), "utf8")); assert.equal(errors.primaryError, null); assert.equal(errors.cleanupError, null);
    const post = JSON.parse(await fs.readFile(path.join(evidence, `${round}-edit-after-cleanup-proof.json`), "utf8")); assert.deepEqual(post.errors, []); assert.equal(post.extra.completed, true);
    emit("modification", "end"); phase = "revert"; emit("revert", "start");
    const modifiedBytes = await fs.readFile(modified.proofFile);
    const reverted = await runDeliveredRevertWithReviewRepair({ caseTag: `${round}-revert`, proofFile: modified.proofFile, proofSha256: createHash("sha256").update(modifiedBytes).digest("hex"), historyProof: { path: proofFile, sha256: inspection.proof.sha256 }, absoluteDeadlineAt: deadline,
      ...(reviewMode === "positive" ? { reviewMode } : {}) });
    assert.equal(reverted.root, root); assert.deepEqual(await sourceHashes(), before); completed = true; emit("revert", "end");
  } catch (error) { primary = error; throw error;
  } finally {
    await fs.writeFile(path.join(evidence, `${round}-existing-modification-revert-outcome.json`), JSON.stringify({ at: new Date().toISOString(), processId: process.pid, nonce, phase, completed, actualHistoricalInput,
      primaryError: primary === undefined ? null : actualErrorFact(primary), actualCoreRegistry: inspectRuntimeCoreRegistry(), budget: { http: 256, modificationMs: 180000, revertMs: 240000, sharedAbsoluteDeadlineAt: deadline, wrapperMs: 450000, attempts: 1, retries: 0 },
      scope: "Actual existing clean Q69 project; new reversible maintenance data preparation then same-process unchanged revert240 receiver. No NEW rerun, old root clone/reset, inherited handles or private receipt." }, null, 2), { flag: "wx" });
  }
}

if (process.env.ANS_CHIEF_DIALOGUE_STANDALONE === "1") {
  assert.equal(nodeTest, undefined); assert.equal(registeredCases.length, 0);
  process.stdout.write(`Q_CHIEF_DIALOGUE_START ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, caseTag: process.env.ANS_CHIEF_DIALOGUE_CASE_TAG, http: 8, businessMs: 15000 })}\n`);
  await runChiefOrdinaryClarificationCase();
  process.stdout.write(`Q_CHIEF_DIALOGUE_RETURN ${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, scope: "Ordinary clarification then actual new customer input; no Goal/Task/card or authority" })}\n`);
}
