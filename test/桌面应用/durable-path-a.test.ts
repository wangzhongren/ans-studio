import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { createCustomerInputChannel, DOCUMENT_REVISION_CARD_KIND, DOCUMENT_REVISION_OPTIONS,
  type DurableCustomerAnswer, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { closeDocumentRevisionCard, presentDocumentRevisionCard } from "../../app/desktop/durable-document-revision.ts";
import { closeBlockedScopeCard, desktopImplementationRetestGuard, desktopVerificationPreflight, observeImplementationSelfTest, presentBlockedScopeCard,
  verificationStandardPrompt } from "../../app/desktop/durable-blocked-routing.ts";
import { durableHash, durableTaskId, type DesktopDurableWorkflow } from "../../app/desktop/durable-workflow.ts";
import { evidenceRouteDelivery, nextOperationsDelivery, pendingDeliveryBlocksQueue, prepareDesktopGraphCard, requestOperationsChild,
  resumeDesktopGraphCard, workflowReviewProof } from "../../app/desktop/durable-workflow-a.ts";
import type { SessionManagerDeps } from "../../app/desktop/session/contracts/deps.ts";
import type { ActualDispatchSource, LiveSession } from "../../app/desktop/session/contracts/session-types.ts";
import { FixedWorkflowRoute, type FixedWorkflowRefs } from "../../app/desktop/session/fixed-workflow/route.ts";
import { Handback, type HandbackPorts, type HandbackRefs } from "../../app/desktop/session/handback.ts";
import { createDesktopTaskGitShellPort, createDurableGraphBaselineGitPort, durableBaselineOrigin, observeA11Git, recoverA11Index,
  verifyDurableGraphBaseline, type A11IndexExpectation, type ClaimDurableTaskGit } from "../../app/desktop/workflow-git.ts";
import { readRoleLog } from "../../src/common/编排/role-log.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import type { TaskHandback } from "../../src/common/编排/handback.ts";
import { DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR, type DurableCapabilityEvent, type DurableEffectRecord,
  type DurableEvidenceRef, type DurablePendingTask, type DurableProjection, type DurableResult, type DurableTaskBinding } from "../../src/model/durable-workflow.ts";
import type { RuntimeReportSnapshotV1, WorkflowEvent } from "../../src/model/runtime.ts";

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

for (const linked of [false, true]) test(`A11 reserves native refs and atomically reconciles the ${linked ? "linked split" : "complete"} index`, async t => {
  const temporary = path.resolve(os.tmpdir());
  const fixture = await fs.mkdtemp(path.join(temporary, "ans-a11-index-test-"));
  t.after(() => {
    assert.equal(path.dirname(fixture), temporary);
    return fs.rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const branch = "ans/task/r16-test";
  git(fixture, "init", "-b", linked ? "main" : branch);
  git(fixture, "config", "core.autocrlf", "false");
  git(fixture, "config", "user.name", "ANS");
  git(fixture, "config", "user.email", "ans@local");
  await fs.writeFile(path.join(fixture, ".gitignore"), ".ans/\n");
  await fs.writeFile(path.join(fixture, "implementation.txt"), "candidate\n");
  git(fixture, "add", "--", ".gitignore", "implementation.txt");
  git(fixture, "commit", "-m", "one implementation commit");
  const root = linked ? path.join(fixture, "linked") : fixture;
  if (linked) {
    git(fixture, "worktree", "add", "-b", branch, root);
    git(root, "update-index", "--split-index");
  }
  const head = git(root, "rev-parse", "HEAD");
  const alternate = git(root, "commit-tree", "HEAD^{tree}", "-p", head, "-m", "external attempt");
  git(root, "branch", "alternate", alternate);
  const index = git(root, "rev-parse", "--path-format=absolute", "--git-path", "index");
  const file = "receipt.bin";
  const original = Buffer.from([3, 127, 128, 255]);
  await fs.writeFile(path.join(root, file), original);
  git(root, "add", "--", file);
  const beforeBytes = await fs.readFile(index);
  const before = await observeA11Git(root);
  assert.deepEqual(before.stagedPaths, [file]);
  assert.equal(before.trackedDirty, false, JSON.stringify({ before,
    status: git(root, "-c", "core.fsmonitor=false", "-c", "core.ignoreStat=false", "status", "--porcelain=v1"),
    entries: git(root, "-c", "core.fsmonitor=false", "-c", "core.ignoreStat=false", "ls-files", "--stage", "-v") }));
  assert.ok(before.indexDigest && before.files?.length === 1);
  const recovery = { afterIndex: before.indexDigest, writes: before.files, paths: [file] };
  const noWrite = { projectRoot: root, branch, head, recovery, isCurrent: () => true,
    async claim(): Promise<boolean> { assert.fail("unsafe index must not claim"); },
    async settle(): Promise<boolean> { assert.fail("unsafe index must not settle"); },
    async resume(): Promise<boolean> { assert.fail("unsafe index must not resume"); },
  };
  const unknownLock = Buffer.from("external index lock");
  await fs.writeFile(`${index}.lock`, unknownLock, { flag: "wx" });
  assert.match((await recoverA11Index(noWrite)).lock ?? "", /索引锁/);
  assert.deepEqual(await fs.readFile(`${index}.lock`), unknownLock);
  assert.deepEqual(await fs.readFile(index), beforeBytes);
  await fs.unlink(`${index}.lock`);

  await fs.writeFile(path.join(root, file), Buffer.from("post-stage edit"));
  assert.equal((await recoverA11Index(noWrite)).trackedDirty, true);
  assert.deepEqual(await fs.readFile(index), beforeBytes);
  await fs.writeFile(path.join(root, file), original);
  await fs.writeFile(path.join(root, "user-file"), "external bytes");
  assert.deepEqual((await recoverA11Index(noWrite)).untrackedPaths, ["user-file"]);
  assert.deepEqual(await fs.readFile(index), beforeBytes);
  await fs.unlink(path.join(root, "user-file"));

  let expectation: A11IndexExpectation | undefined;
  let settled = false;
  let resumed = false;
  const verifyRetention = () => {
    assert.throws(() => git(root, "update-ref", `refs/heads/${branch}`, alternate, head), /lock/i);
    assert.throws(() => git(root, "symbolic-ref", "HEAD", "refs/heads/alternate"), /lock/i);
    assert.throws(() => git(root, "add", "--", file), /lock/i);
  };
  const result = await recoverA11Index({ ...noWrite,
    async claim(intent) {
      expectation = intent;
      verifyRetention();
      assert.deepEqual(await fs.readFile(index), beforeBytes);
      return true;
    },
    async settle(observation) {
      if (!observation) return false;
      assert.ok(expectation);
      verifyRetention();
      assert.equal(observation.indexDigest, expectation.afterIndex);
      assert.deepEqual(observation.untrackedPaths, [file]);
      settled = true;
      return true;
    },
    async resume(observation) {
      assert.equal(settled, true);
      assert.equal(observation.worktreeDigest, before.worktreeDigest);
      resumed = true;
      return true;
    },
  });
  assert.ok(expectation, JSON.stringify(result));
  assert.deepEqual(result.stagedPaths, []);
  assert.equal(resumed, true, JSON.stringify(result));
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), branch);
  assert.equal(git(root, "--no-optional-locks", "status", "--porcelain"), `?? ${file}`);
  assert.deepEqual(await fs.readFile(path.join(root, file)), original);
  assert.deepEqual((await observeA11Git(root, [file])).files, before.files);
  assert.equal(git(root, "update-ref", `refs/heads/${branch}`, head, head), "");

  let replayed = false;
  const replay = await recoverA11Index({ ...noWrite, expected: expectation,
    async settle(observation) {
      assert.equal(observation?.indexDigest, expectation?.afterIndex);
      verifyRetention();
      return true;
    },
    async resume() { replayed = true; return true; },
  });
  assert.equal(replayed, true, JSON.stringify(replay));
});

for (const linked of [false, true]) test(`task Git settles failed add with unchanged ${linked ? "linked split " : ""}index`, async t => {
  const temporary = path.resolve(os.tmpdir());
  const fixture = await fs.mkdtemp(path.join(temporary, "ans-a11-staging-"));
  t.after(() => {
    assert.equal(path.dirname(fixture), temporary);
    return fs.rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  git(fixture, "init", "-b", "main");
  await fs.writeFile(path.join(fixture, "source.ts"), "export const source = 1;\n");
  git(fixture, "add", "--", "source.ts");
  git(fixture, "-c", "user.name=ANS", "-c", "user.email=ans@local", "commit", "-m", "baseline");
  const root = linked ? path.join(fixture, "linked") : fixture;
  if (linked) {
    git(fixture, "worktree", "add", "-b", "ans/task/staging", root);
    git(root, "update-index", "--split-index");
    assert.match(git(root, "rev-parse", "--shared-index-path"), /sharedindex\.[a-f0-9]+$/);
  }
  const indexPath = git(root, "rev-parse", "--path-format=absolute", "--git-path", "index");
  const baseline = git(root, "rev-parse", "HEAD");
  await fs.writeFile(path.join(root, "source.ts"), "export const source = 2;\n");

  type Intent = Parameters<ClaimDurableTaskGit>[0];
  const settled: { intent: Intent; outcome: string; result: Readonly<Record<string, unknown>> | undefined }[] = [];
  const records = new Map<string, string>([["git-add:r6-without-index-proof", "unknown"]]);
  let beforeProcess: (() => Promise<void>) | undefined;
  const claim: ClaimDurableTaskGit = async intent => {
    const prior = records.get(intent.key);
    assert.notEqual(prior, "unknown");
    const start = beforeProcess;
    beforeProcess = undefined;
    if (start) await start();
    return { ok: true, value: { execute: prior !== "succeeded", async finish(outcome, _evidence, result) {
      records.set(intent.key, outcome);
      settled.push({ intent, outcome, result });
    } } };
  };
  const open = () => createDesktopTaskGitShellPort(root, claim);
  const port = open();
  const original = await fs.readFile(indexPath);
  const missing = ["source.ts", "package-lock.json"];
  const failed = await port.add(missing);
  assert.equal(failed.exitCode, 128);
  assert.match(failed.stderr, /pathspec.*package-lock\.json/);
  assert.deepEqual(await fs.readFile(indexPath), original);
  assert.equal(settled[0]?.outcome, "not-started");
  assert.match(settled[0]!.intent.key, /^git-add:v2:/);
  assert.equal(settled[0]!.result?.beforeIndex, settled[0]!.result?.afterIndex);
  assert.equal(settled[0]!.result?.exitCode, "128");
  assert.equal(settled[0]!.result?.afterHead, baseline);

  const reopened = open();
  assert.equal((await reopened.add(missing)).exitCode, 128);
  assert.equal(settled[1]!.intent.key, settled[0]!.intent.key);
  assert.equal((await reopened.add(["source.ts"])).exitCode, 0);
  assert.equal(settled[2]!.outcome, "succeeded");
  assert.equal(git(root, "diff", "--cached", "--name-only"), "source.ts");
  assert.equal((await reopened.add(missing)).exitCode, 128);
  assert.equal(settled[3]!.outcome, "not-started");
  assert.notEqual(settled[3]!.intent.key, settled[0]!.intent.key);
  assert.equal(settled[3]!.result?.beforeIndex, settled[3]!.result?.afterIndex);
  assert.equal(records.get("git-add:r6-without-index-proof"), "unknown");

  // An external lock before launch prevents the claim. A lock appearing after claim prevents speculative settlement.
  const indexLock = `${indexPath}.lock`;
  await fs.writeFile(indexLock, "locked", { flag: "wx" });
  assert.match((await reopened.add(missing)).error ?? "", /index and task branch/);
  assert.equal(settled.length, 4);
  await fs.unlink(indexLock);
  beforeProcess = () => fs.writeFile(indexLock, "locked", { flag: "wx" });
  assert.notEqual((await reopened.add(missing)).exitCode, 0);
  assert.equal(settled[4]!.outcome, "unknown");
  assert.equal(settled[4]!.result?.afterIndex, undefined);
  await fs.unlink(indexLock);

  const commit = await reopened.commit(["git", "commit", "-m", "staged source"]);
  assert.equal(commit.exitCode, 0);
  assert.equal(settled[5]!.outcome, "succeeded");
  assert.equal(git(root, "rev-parse", "HEAD^"), baseline);

  assert.equal((await reopened.add(["source.ts"])).exitCode, 0);
  const completed = settled.at(-1)!;
  assert.equal(completed.outcome, "succeeded");
  assert.equal(completed.result?.beforeIndex, completed.result?.afterIndex);
  const beforeReplay = settled.length;
  assert.match((await open().add(["source.ts"])).stdout, /already recorded/);
  assert.equal(settled.length, beforeReplay);
});

test("the same Git operation resumes after init and branch creation without repeating either effect", async t => {
  const temporary = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, "ans-v2-baseline-"));
  t.after(() => {
    assert.equal(path.dirname(root), temporary);
    return fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const definitionFile = "docs/workflows/a.yaml";
  await fs.mkdir(path.dirname(path.join(root, definitionFile)), { recursive: true });
  await fs.writeFile(path.join(root, definitionFile), "name: Example\n");
  const workflowId = "dw-recover-a9";
  const token = "recorded-effect-token";
  const origin = unwrap(await durableBaselineOrigin(root, workflowId));
  assert.equal(origin.repositoryBefore, "absent");
  const resume = async () => unwrap(await createDurableGraphBaselineGitPort({
    projectRoot: root, workflowId, token, origin, definitionFile,
  }));
  let port = await resume();
  const initialized = await port.ensureRepository({ projectRoot: root, allowInit: true });
  assert.equal(initialized.ok && initialized.repository.state, "initialized");
  const foreign = await createDurableGraphBaselineGitPort({ projectRoot: root, workflowId, token: "foreign", origin, definitionFile });
  assert.equal(foreign.ok, false);
  port = await resume();
  const recovered = await port.ensureRepository({ projectRoot: root, allowInit: true });
  assert.equal(recovered.ok && recovered.repository.state, "existing");
  const ignore = await port.ensureGitignore({ projectRoot: root });
  assert.equal(ignore.ok && ignore.committed, true);
  const main = git(root, "rev-parse", "main");
  assert.equal(git(root, "rev-list", "--count", "main"), "1");
  const worktree = await port.inspectWorktree({ projectRoot: root });
  assert.ok(worktree.ok);
  assert.deepEqual(worktree.untracked, []);
  const secondDefinition = path.join(root, "docs/workflows/unselected.yaml");
  await fs.writeFile(secondDefinition, "name: Unselected\n");
  const other = await port.inspectWorktree({ projectRoot: root });
  assert.ok(other.ok);
  assert.deepEqual(other.untracked, ["docs/workflows/unselected.yaml"]);
  await fs.unlink(secondDefinition);
  const branch = await port.prepareTaskBranch({ projectRoot: root, workflowId, base: "main", allowReuse: false });
  assert.equal(branch.ok && branch.reused, false);
  port = await resume();
  const replay = await port.prepareTaskBranch({ projectRoot: root, workflowId, base: "main", allowReuse: false });
  assert.equal(replay.ok && replay.reused, true);
  assert.equal(git(root, "rev-list", "--count", "main"), "1");
  assert.deepEqual(unwrap(await verifyDurableGraphBaseline(root, workflowId, token, origin)), {
    branch: `ans/task/${workflowId}`, oid: main,
  });
  git(root, "add", "--", definitionFile);
  const tracked = await port.inspectWorktree({ projectRoot: root });
  assert.ok(tracked.ok);
  assert.equal(tracked.trackedChanges, 1);
});

test("workflow cards acknowledge only explicit offered choices after actual durable persistence", async () => {
  const receipts: DurableCustomerAnswer[] = [];
  const ids: string[] = [];
  const open = () => {
    const channel = createCustomerInputChannel({ operatorId: "local-customer", presenter: payload => { ids.push(payload.id); } });
    const answer = channel.customerInput({
      kind: "choice", cardKind: "appointment", title: "Appoint the current roles", flowId: "example", multiple: true,
      options: [{ id: "worker", label: "Worker" }, { id: "reviewer", label: "Reviewer" }],
    }, { roleId: "chief", requestId: "dw-card-same", projectRoot: "/fixture", governanceModel: "trio",
      persistWorkflowDecision: async selected => { receipts.push(selected); return { ok: true, decisionId: "saved-appointment" }; } });
    return { channel, answer };
  };
  const prior = open();
  const response = (decision: unknown) => ({ id: "dw-card-same", decision });
  assert.equal((await prior.channel.respondDurable(response({ kind: "choice", cancelled: true })))?.ok, false);
  assert.equal((await prior.channel.respondDurable(response({ kind: "choice", selected: ["foreign"] })))?.ok, false);
  prior.channel.rejectAllPending("window closed");
  await prior.answer;
  assert.equal(receipts.length, 0);
  const current = open();
  assert.deepEqual(ids, ["dw-card-same", "dw-card-same"]);
  assert.equal((await current.channel.respondDurable(response({ kind: "choice", selected: ["worker"] })))?.ok, true);
  assert.deepEqual(receipts, [{ kind: "choice", selected: ["worker"], acknowledged: undefined }]);
  assert.equal((await current.answer)?.outcome, "answered");
});

test("revision approval binds exact durable candidate and the current main frame across reopening", async () => {
  const ref = { projectId: "fixture", instanceId: "dw-revision", definitionId: "path-a", definitionVersion: 6,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT } as const;
  const revision: NonNullable<DurableProjection["documentRevision"]> = {
    id: "repair-1", path: "docs/proposals/fixture-proposal-v1.md", reason: "Resolve contradictory build steps", roleId: "rapporteur",
    origin: { stepId: "implement", entry: 9, attempt: 1, taskId: "dw-ops" }, status: "awaiting-approval",
    reviewDigest: "b".repeat(64),
    task: { stage: "A5", taskId: "dw-fix", roleId: "rapporteur", parentTaskId: "dw-ops", executionAttempt: 1, stageAttempt: 1 },
  };
  const view: DurableProjection = { ref, engine: "healthy", status: "waiting", schema: 2, definitionName: "Path A",
    projectRoot: "/fixture", stepId: "implement", stepName: "Implement", action: "operations-implementation", attempt: 1,
    metadata: { runtime: "claude" }, flowId: "fixture", pendingFacts: 0, documentRevisionEnabled: true, documentRevision: revision };
  const old = { path: revision.path, sha256: "c".repeat(64) };
  const next = { path: "docs/proposals/fixture-proposal-v2.md", sha256: "d".repeat(64) };
  const decisions: { revisionId: string; digest: string; decision: string; authority: string }[] = [];
  const answered: OperatorRequestPayload[] = [];
  let activated = 0;
  let live = view;
  const durable = {
    store: async () => ({ lookup: () => live, async readDocumentRevisionReview() {
      const digest = live.documentRevision?.reviewDigest;
      return { ok: true, value: { digest, requestId: `document-revision:${revision.id}:${digest}`, generation: revision.origin.attempt,
        originalContent: "Original", candidateContent: "Corrected", documents: [next],
        previews: [{ original: old, candidate: next, content: "Corrected" }] } };
    }, async decideDocumentRevision(_ref: unknown, decision: (typeof decisions)[number], isCurrent: () => boolean) {
      assert.ok(isCurrent());
      decisions.push(decision);
      live = { ...live, documentRevision: { ...revision, status: "ready" } };
      return { ok: true, value: live.documentRevision };
    } }),
    activate: () => { activated++; },
  } as unknown as DesktopDurableWorkflow;
  const open = () => createCustomerInputChannel({ operatorId: "local-customer", presenter: card => { answered.push(card); },
    delegation: { get: () => ({ enabled: true, revision: 1 }), subscribe: () => () => undefined } });
  const present = (channel: ReturnType<typeof open>) => presentDocumentRevisionCard({ durable, view, revision, chief: "chief",
    customer: channel.customerInput, isRegistered: () => true });
  const first = open();
  await present(first);
  await present(first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(answered.length, 1);
  const card = answered[0]!;
  assert.equal(card.request.cardKind, DOCUMENT_REVISION_CARD_KIND);
  assert.match(String(card.request.preview), /Original[\s\S]*Corrected/);
  const response = { id: card.id, decision: { kind: "choice", selected: [DOCUMENT_REVISION_OPTIONS[0]] } };
  assert.equal((await first.respondDurable(response))?.ok, false);
  live = { ...view, documentRevision: { ...revision, reviewDigest: "e".repeat(64) } };
  const drifted = await first.respondDurable(response, () => true);
  assert.equal(drifted?.ok, false);
  assert.equal(drifted?.expired, true);
  assert.equal(decisions.length, 0);
  closeDocumentRevisionCard(durable, view.projectRoot);
  live = view;
  const reopened = open();
  await present(reopened);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(answered.map(request => request.id), [card.id, card.id]);
  assert.equal((await first.respondDurable(response, () => true))?.ok, false);
  assert.equal((await reopened.respondDurable(response, () => true))?.ok, true);
  assert.deepEqual(decisions, [{ revisionId: revision.id, digest: revision.reviewDigest, decision: "approve", authority: "customer",
    provenance: { source: "customer" } }]);
  assert.equal(activated, 1);
  assert.equal((await reopened.respondDurable(response, () => true))?.ok, false);
  assert.equal(decisions.length, 1);
  closeDocumentRevisionCard(durable, view.projectRoot);
});

test("restored A3 approval only resumes the effect bound to its recorded request", async () => {
  const ref = { projectId: "project", instanceId: "dw-a3", definitionId: "path-a", definitionVersion: 6,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT } as const;
  const view: DurableProjection = { ref, schema: 2, projectRoot: "/restored", stepId: "intent", attempt: 1,
    metadata: { runtime: "claude" }, pendingFacts: 1, definitionName: "Path A", stepName: "A3", status: "waiting", engine: "healthy",
    flowId: "fixture", action: "confirm-intent" };
  const binding = { requestId: "saved-a3", digest: "b".repeat(64), generation: 3 };
  const source = { roleId: "chief", originId: binding.requestId };
  const input = { kind: "card-prepared" as const, card: { ...binding, cardKind: "intent-confirm" as const, documents: [], options: ["confirm"] } };
  const address = { stepId: view.stepId, attempt: view.attempt, flowId: view.flowId!, source };
  const prepared = { event: { ...address, key: "prepared", input }, receipt: { state: "consumed" } };
  const decided = { event: { ...address, key: "decided", input: { ...binding, kind: "card-decided", selected: ["confirm"],
    decision: "approve", authority: "delegated-chief", provenance: { ...binding, source: "delegated-chief", delegationRevision: 9, reason: "Verified" } } },
    receipt: { state: "pending" } };
  let completions = 0;
  const durable = { store: async () => ({ listCapabilityEvents: () => [prepared, decided],
    completeIntentDecision: (instance: unknown, effect: unknown, current: () => boolean) => {
      assert.equal(instance, ref);
      assert.deepEqual(effect, binding);
      assert.ok(current());
      completions++;
      return { ok: true };
    },
  }) } as unknown as DesktopDurableWorkflow;
  const unexpected = () => assert.fail("A recorded decision must not prompt the customer or delegate again.");
  assert.equal(await resumeDesktopGraphCard(durable, view, { customer: unexpected, executeDecision: unexpected, isRegistered: () => false }), true);
  assert.equal(completions, 0);
  assert.equal(await resumeDesktopGraphCard(durable, view, { customer: unexpected, executeDecision: unexpected, isRegistered: () => true }), true);
  assert.equal(completions, 1);
});

test("A3 presents only revision or rejection for the invalid field declaration and restores normal approval on a new draft", async t => {
  const temporary = path.resolve(os.tmpdir());
  const projectRoot = await fs.mkdtemp(path.join(temporary, "ans-a3-decision-requirements-"));
  t.after(() => {
    assert.equal(path.dirname(projectRoot), temporary);
    return fs.rm(projectRoot, { recursive: true, force: true });
  });
  const ref = { projectId: "project", instanceId: "dw-intent-check", definitionId: "path-a", definitionVersion: 7,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT } as const;
  const flowId = "racing", intentId = "racing-intent";
  const common = { v: 1 as const, at: new Date().toISOString(), schema: "ans-workflow/v1" as const,
    path: "A" as const, workflowId: ref.instanceId, flowId };
  const legacy: WorkflowEvent[] = [{ ...common, kind: "workflow.started", idempotencyKey: "intake", sourceTaskId: "source-task",
    trigger: { by: "chief", reason: "Test existing A3 card entry" } }];
  for (const stage of ["A1", "A2"] as const) legacy.push(
    { ...common, kind: "stage.requested", idempotencyKey: `${stage}-requested`, stage, requestTaskId: `${stage}-request`,
      requestDigest: "b".repeat(64), attempt: 1 },
    { ...common, kind: "stage.completed", idempotencyKey: `${stage}-completed`, stage, cause: { kind: "seed", ref: `${stage}-done` }, artifacts: [] },
  );
  for (const event of legacy) {
    const saved = await appendWorkflowEvent(projectRoot, event);
    assert.equal(saved.ok, true, JSON.stringify(saved));
  }
  const write = async (file: string, header: object) => {
    const full = path.join(projectRoot, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, `---\n${stringify(header)}---\n# Actual race intent\n`);
  };
  const product = (version: number) => `docs/product/${flowId}-intent-v${version}.md`;
  const draft = (version: number) => ({ schema: "project-intent/v1", flowId, intentId, version });
  await write(`docs/intents/${intentId}.md`, { intentId });
  await write(product(1), { ...draft(1), requiredDecisionFields: ["runtimePlatform", "lapCount"],
    requiredDecisionValues: { staticDesktopBrowserRequiredCompletionLaps: 3 } });
  const original = await fs.readFile(path.join(projectRoot, product(1)), "utf8");
  let view: DurableProjection = { ref, schema: 2, projectRoot, stepId: "intent", attempt: 1, flowId,
    metadata: { runtime: "claude" }, pendingFacts: 0, definitionName: "Path A", stepName: "A3", status: "waiting", engine: "healthy", action: "confirm-intent" };
  const rows: { receipt: { state: "consumed" }; event: DurableCapabilityEvent }[] = [];
  const store = { listCapabilityEvents: () => rows, graphCardDigest: (_ref: unknown, value: unknown) => durableHash(JSON.stringify(value)),
    withDomainOperation: async (_ref: unknown, _intent: unknown, run: () => Promise<unknown>) => ({ ok: true, value: await run() }),
    readEvidence: async (_root: string, file: string) => ({ ok: true, value: { path: file,
      sha256: durableHash(await fs.readFile(path.join(projectRoot, file), "utf8")) } }),
    submitCapability: async (_ref: unknown, event: DurableCapabilityEvent) => {
      rows.push({ receipt: { state: "consumed" }, event });
      return { ok: true, value: { state: "consumed" } };
    } };
  const durable = { store: async () => store, lookup: async () => view } as unknown as DesktopDurableWorkflow;
  async function present(expectRestricted: boolean) {
    return prepareDesktopGraphCard({ durable, view, source: { roleId: "chief", originId: "a3-turn" }, isCurrent: () => true,
      request: { kind: "choice", cardKind: "intent-confirm", flowId, title: "Intent",
        options: ["confirm", "revise", "reject"].map(id => ({ id, label: id })) },
      window: { isRegistered: () => true, customer: async (request, ctx) => {
        assert.equal(request.kind, "choice");
        assert.deepEqual(request.options.map(item => item.id), expectRestricted ? ["revise", "reject"] : ["confirm", "revise", "reject"]);
        if (!expectRestricted) return { outcome: "declined" };
        assert.match(request.question ?? "", /修订[\s\S]*产品提交新版本/);
        const record = rows.at(-1)?.event.input;
        assert.equal(record?.kind, "card-prepared");
        assert.ok(record.card.decisionProblem);
        assert.ok(request.question?.includes(record.card.decisionProblem));
        assert.equal((await ctx.persistWorkflowDecision!({ kind: "choice", selected: ["confirm"] }, undefined, () => true)).ok, false);
        const saved = await ctx.persistWorkflowDecision!({ kind: "choice", selected: ["revise"] }, undefined, () => true);
        assert.ok(saved.ok);
        return { outcome: "answered", value: { selected: ["revise"] }, decisionId: saved.decisionId };
      } } });
  }
  assert.equal((await present(true))?.outcome, "answered");
  const decision = rows.at(-1)?.event.input;
  assert.equal(decision?.kind, "card-decided");
  assert.equal(decision.decision, "revise");
  const journal = await readTaskState(projectRoot);
  assert.deepEqual(journal.events.filter(event => event.kind === "request.resolved").map(event => event.choice), ["revise"]);
  await write(product(2), { ...draft(2), requiredDecisionFields: ["runtime-platform", "lap-count"], requiredDecisionValues: { "lap-count": 3 } });
  view = { ...view, attempt: 2 };
  assert.equal((await present(false))?.outcome, "declined");
  await write(product(3), draft(3));
  view = { ...view, attempt: 3 };
  assert.equal((await present(false))?.outcome, "declined");
  assert.equal(await fs.readFile(path.join(projectRoot, product(1)), "utf8"), original);
});

for (const delegated of [false, true]) test(`structured A6 preserves ${delegated ? "delegated" : "customer"} approval for the tool and A8 mirror`, async t => {
  const temporary = path.resolve(os.tmpdir());
  const projectRoot = await fs.mkdtemp(path.join(temporary, "ans-a6-receipt-"));
  t.after(() => {
    assert.equal(path.dirname(projectRoot), temporary);
    return fs.rm(projectRoot, { recursive: true, force: true });
  });
  const flowId = "racing";
  const intent = `docs/product/${flowId}-intent-v1.md`;
  const proposal = `docs/proposals/${flowId}-proposal-v1.md`;
  const architecture = `docs/contracts/${flowId}-architecture-v1.md`;
  const modules = [{ id: "track", name: "Track", purpose: "Race track", path: "src/track/", category: "core",
    publicContract: "Defines the track", architectureSource: architecture }];
  const decisionValues = { laps: 3 };
  const docs = new Map<string, DurableEvidenceRef>();
  const write = async (file: string, header: object, body = `# ${flowId}\n`) => {
    const bytes = `---\n${stringify(header)}---\n${body}`;
    await fs.mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await fs.writeFile(path.join(projectRoot, file), bytes);
    docs.set(file, { path: file, sha256: durableHash(bytes) });
  };
  await write(intent, { flowId, version: 1, requiredDecisionFields: ["laps"] });
  await write(proposal, { schema: "project-proposal/v2", flowId, version: 1, intent,
    decisionFields: [{ id: "laps", label: "Laps", required: true, options: [{ value: 3, label: "Three" }] }] });
  await write(architecture, { schema: "project-architecture/v1", flowId, version: 1, proposal });
  await write(`docs/proposals/${flowId}-modules-v1.md`, { schema: "project-modules/v2", flowId, version: 1, modules });
  await write(`docs/proposals/${flowId}-roster-v1.md`, { schema: "project-roster/v3", flowId, version: 1, intent, proposal, architecture,
    envBootstrap: { omitted: true, omissionReason: "Static browser output" }, modules,
    roles: [{ id: "track-owner", displayName: "Track owner", purpose: "Author track", capability: "Track design", modules: ["track"] }] },
  `# Roster\n## 人员+模块拓扑图\n\`\`\`topology\n${stringify({ schema: "project-topology/v2", management: ["convener", "track-owner"],
    modules: [{ id: "track", path: "src/track/", roleId: "track-owner" }], roles: [{ id: "track-owner", modules: ["track"] }] })}\`\`\`\n`);

  const ref = { projectId: "project", instanceId: "dw-structured-a6", definitionId: "path-a", definitionVersion: 7,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT } as const;
  const view: DurableProjection = { ref, schema: 2, projectRoot, stepId: "proposal", attempt: 1, flowId,
    metadata: { runtime: "claude" }, pendingFacts: 0, definitionName: "Path A", stepName: "A6", status: "waiting", engine: "healthy", action: "confirm-proposal" };
  const source = { roleId: "chief", originId: "a6-turn" };
  const prior = { requestId: "intent-request", digest: "b".repeat(64), generation: 1 };
  const rows: { receipt: { state: "consumed" }; event: DurableCapabilityEvent }[] = [];
  const push = (input: DurableCapabilityEvent["input"], stepId: string, key: string) => rows.push({ receipt: { state: "consumed" },
    event: { key, input, source, flowId, stepId, attempt: 1 } });
  push({ kind: "card-prepared", card: { ...prior, cardKind: "intent-confirm", documents: [docs.get(intent)!] } }, "intent", "prior-prepared");
  push({ kind: "card-decided", ...prior, selected: ["confirm"], decision: "approve", authority: "customer" }, "intent", "prior-decided");
  const store = { listCapabilityEvents: () => rows, graphCardDigest: () => "d".repeat(64),
    readEvidence: async (_root: string, file: string) => ({ ok: true, value: docs.get(file)! }),
    submitCapability: async (_ref: unknown, event: DurableCapabilityEvent) => {
      rows.push({ receipt: { state: "consumed" }, event });
      return { ok: true, value: { state: "consumed" } };
    } };
  const durable = { store: async () => store, lookup: async () => view } as unknown as DesktopDurableWorkflow;
  let option = "";
  const result = await prepareDesktopGraphCard({ durable, view, source, isCurrent: () => true,
    request: { kind: "choice", cardKind: "proposal", flowId, title: "Proposal",
      options: ["accept", "revise", "reject"].map(id => ({ id, label: id })) },
    window: { isRegistered: () => true, customer: async (request, ctx) => {
      assert.equal(request.kind, "choice");
      option = request.options.find(item => item.id.startsWith("choice-"))!.id;
      const actionSource = delegated ? { kind: "chief-delegated" as const, actorRoleId: "chief" as const, originRoleId: "chief",
        requestId: ctx.requestId!, baseDigest: "d".repeat(64), delegationRevision: 2, disposition: "select" as const,
        selected: [option], reason: "Approved signed laps", at: new Date().toISOString() } : undefined;
      const saved = await ctx.persistWorkflowDecision!({ kind: "choice", selected: [option] },
        actionSource ? { source: actionSource, isCurrent: () => true } : undefined, () => true);
      assert.ok(saved.ok);
      return { outcome: "answered", value: { selected: [option] }, decisionId: saved.decisionId, actionSource };
    } } });
  assert.equal(result?.outcome, "answered", JSON.stringify(result));
  assert.deepEqual(result.value.selected, ["accept"]);
  assert.deepEqual(result.durableProposalSelection, { requestId: result.decisionId?.slice("decision-".length),
    baseDigest: "d".repeat(64), selectedOptionId: option, decisionValues });
  const actual = rows.at(-1)?.event.input;
  assert.equal(actual?.kind, "card-decided");
  assert.deepEqual(actual.decisionValues, decisionValues);
  assert.deepEqual(actual.selected, [option]);
  const mirror = (await readTaskState(projectRoot)).events.find(event => event.kind === "request.resolved");
  assert.equal(mirror?.choice, "accept");
  assert.deepEqual(mirror.selectedOptionIds, [option]);
  if (delegated) assert.deepEqual(mirror.actionSource, result.actionSource);
});

for (const stage of ["A1", "A2"] as const) test(`workflow ${stage} queues one product task and reconciles its bound report`, async t => {
  const temporary = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, `ans-direct-${stage.toLowerCase()}-`));
  t.after(() => {
    assert.equal(path.dirname(root), temporary);
    return fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const ref = { projectId: "project", instanceId: "dw-intake", definitionId: "path-a", definitionVersion: 2,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const stepId = stage === "A1" ? "receive-product" : "write-intent";
  const capability = stage === "A1" ? "product-prepare-direct" : "author-intent-direct";
  const flowId = "racing-game";
  const taskId = durableTaskId(ref, "product", stepId, 1);
  const task: DurableTaskBinding = { taskId, roleId: "product", parentTaskId: ref.instanceId,
    stage, stageAttempt: 1, executionAttempt: 1 };
  const view: DurableProjection = {
    ref, schema: 2, definitionName: "Path A", projectRoot: root, stepId, stepName: stepId, action: capability,
    flowId, attempt: 1, status: "waiting", engine: "healthy", pendingFacts: 0, metadata: { runtime: "claude" },
    pendingTasks: [{ task, taskId, roleId: "product", stepId, attempt: 1, flowId, state: "pending",
      capability, dispatch: { actor: "application", flowId, text: "开发一个 3D 赛车游戏。" } }],
  };
  let effect: DurableEffectRecord | undefined;
  let registeredIntent: DurableEffectRecord["intent"] | undefined;
  const settled: string[] = [];
  const admitted: DurableCapabilityEvent[] = [];
  const blockers: string[] = [];
  const store = {
    lookup: () => view,
    listCapabilityEvents: () => [],
    listEffects: () => effect ? [effect] : [],
    settleEffect: (_ref: typeof ref, result: NonNullable<DurableEffectRecord["result"]>) => {
      assert.equal(result.token, effect?.token);
      assert.equal(result.outcome, "succeeded");
      assert.equal(result.result?.turnId, "bound-turn");
      settled.push(result.key);
      effect = { ...effect!, state: "succeeded", result };
      return { ok: true };
    },
    block: (_ref: typeof ref, code: string, message: string) => { blockers.push(`${code}: ${message}`); },
    storeEvidence: () => ({ ok: true, value: { path: "ans-evidence/" + "b".repeat(64), sha256: "b".repeat(64) } }),
    submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent) => {
      assert.equal(effect?.state, "succeeded");
      if (!admitted.some(prior => prior.key === event.key)) admitted.push(event);
      return { ok: true, value: { key: event.key, state: "pending" } };
    },
  };
  const notes: string[] = [];
  const report: RuntimeReportSnapshotV1 = {
    version: 1, reportId: `report-${stage}`, taskId, source: { roleId: "product", runtime: "claude", turnId: "bound-turn" },
    status: stage === "A1" ? "failed" : "blocked", origin: stage === "A1" ? "terminal-fallback" : "submitted-report",
    at: new Date().toISOString(), evidence: stage === "A2" ? [{ text: "docs/missing.md", truncated: false, redacted: false }] : [], evidenceOmitted: 0,
    summary: { text: stage === "A1" ? "The role round failed." : "请确认游戏平台。", truncated: false, redacted: false },
  };
  let reports = [{ ...report, source: { ...report.source, turnId: "foreign-turn" } }];
  const deps = {
    durableWorkflow: {
      store: async () => store,
      registerDelivery: (_root: string, _clientId: string, delivery: { intent: DurableEffectRecord["intent"] }) => {
        assert.equal(registeredIntent, undefined);
        registeredIntent = delivery.intent;
      },
    },
    getListing: () => ({ governanceModel: "trio", roles: [
      { roleId: "chief", governanceFunction: "chief" }, { roleId: "convener", governanceFunction: "schedule" },
    ] }),
    readDurableReports: async () => reports,
    emitEvent: ({ roleId, event }: Parameters<SessionManagerDeps["emitEvent"]>[0]) => {
      assert.equal(roleId, "chief");
      notes.push(event.summary);
    },
  } as unknown as SessionManagerDeps;
  const messages: Array<{ roleId: string; source: string; taskId?: string; text: string }> = [];
  const route = new FixedWorkflowRoute({ sessions: new Map(), starTaskIds: new Set() } as unknown as FixedWorkflowRefs, {
    durableDecisionExecutor: () => undefined,
    appDispatchClientMessageId: () => "stable-client-id",
    pendingAppTaskDelivery: () => messages.length ? { queued: true, position: 1 } : undefined,
    enqueueDelivery: (_root, roleId, item) => messages.push({ roleId, source: item.sourceRoleId, taskId: item.taskId, text: item.text }),
    drainQueue: async () => {},
    drainAllQueuesFor: async () => {},
    openInternal: async () => assert.fail("Only the product dispatch should be queued"),
    findLiveRuntime: () => undefined,
  }, deps);
  await Promise.all([route.syncDurableTasks(view), route.syncDurableTasks(view)]);
  await route.syncDurableTasks(view);
  assert.equal(messages.length, 1);
  assert.ok(registeredIntent);
  effect = { intent: registeredIntent, state: "unknown", token: "claim-token",
    result: { key: registeredIntent.key, token: "claim-token", outcome: "unknown", evidence: "turn opened", result: { turnId: "bound-turn" } } };
  assert.deepEqual({ ...messages[0], text: undefined }, { roleId: "product", source: "application", taskId, text: undefined });
  assert.match(messages[0]!.text, /工作流 dw-intake 和 flowId racing-game/);
  let journal = await readTaskState(root);
  assert.equal(journal.records.size, 1);
  assert.equal(journal.events.filter(event => event.kind === "task.created").length, 1);
  assert.equal(journal.records.get(taskId)?.created?.sideEffect, stage === "A1" ? "read-only" : "docs");
  if (stage === "A2") assert.match(messages[0]!.text, /docs\/product\/racing-game-intent-vN\.md/);

  const handback = new Handback({} as HandbackRefs, {} as HandbackPorts, deps);
  await handback.resumeDurableReports(view, () => false);
  assert.equal(settled.length, 0);
  assert.equal(admitted.length, 0);
  if (stage === "A2") assert.match(blockers[0]!, /product-receipt-unverified/);
  else assert.deepEqual(blockers, []);
  reports = [report];
  await handback.resumeDurableReports(view, () => false);
  await new Handback({} as HandbackRefs, {} as HandbackPorts, deps).resumeDurableReports(view, () => false);
  assert.deepEqual(settled, [`model:${taskId}`]);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0]?.input.kind, "task-report");
  assert.equal(admitted[0]?.source.originId, "bound-turn");
  journal = await readTaskState(root);
  assert.equal(journal.records.get(taskId)?.reports.length, 1);
  assert.equal(notes.length, stage === "A1" ? 1 : 2);
  if (stage === "A2") assert.match(notes[1]!, /幕僚协调.*请确认游戏平台/);
  const persistedNotes = await readRoleLog(root, { roleId: "chief" });
  assert.equal(persistedNotes.entries.filter(row => row.ref === report.reportId).length, 1);
});

test("a durable card prompt reserves its producer before session open and rejects a retired step", async () => {
  const projectRoot = path.join(os.tmpdir(), "ans-durable-card-producer-fixture");
  const ref = { projectId: "project", instanceId: "dw-card", definitionId: "path-a", definitionVersion: 3,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const projection: DurableProjection = { ref, schema: 2, definitionName: "Path A", projectRoot, stepId: "confirm-proposal",
    stepName: "Proposal", action: "confirm-proposal", flowId: "race", attempt: 1, status: "waiting", engine: "healthy",
    pendingFacts: 0, metadata: { runtime: "claude" } };
  let live = projection;
  let opened = 0;
  let registered = 0;
  const pending = new Set<string>();
  const beginOpen = Promise.withResolvers<void>();
  const finishOpen = Promise.withResolvers<void>();
  const store = { lookup: () => live, listEffects: () => [], listCapabilityEvents: () => [], listFacts: () => [] };
  const route = new FixedWorkflowRoute({ sessions: new Map(), starTaskIds: new Set() } as unknown as FixedWorkflowRefs, {
    durableDecisionExecutor: () => undefined,
    appDispatchClientMessageId: key => key,
    pendingAppTaskDelivery: (_root, _role, _runtime, clientId) => pending.has(clientId) ? { queued: true } : undefined,
    enqueueDelivery: (_root, _role, item) => pending.add(item.clientMessageId!),
    drainQueue: async () => {},
    drainAllQueuesFor: async () => {},
    openInternal: async () => {
      opened++;
      beginOpen.resolve();
      await finishOpen.promise;
      return { ok: true } as Awaited<ReturnType<import("../../app/desktop/session/fixed-workflow/route.ts").FixedWorkflowPorts["openInternal"]>>;
    },
    findLiveRuntime: () => undefined,
  }, {
    durableWorkflow: { store: async () => store, isSession: () => true, registerDelivery: () => { registered++; } },
    getListing: () => ({ governanceModel: "trio", roles: [
      { roleId: "chief", governanceFunction: "chief" }, { roleId: "convener", governanceFunction: "schedule" },
    ] }),
    getRegisteredProjectLifecycle: () => ({}),
    customerInput: async () => assert.fail("There is no persisted customer card yet"),
  } as unknown as SessionManagerDeps);
  const first = route.syncDurableTasks(projection);
  await beginOpen.promise;
  await route.syncDurableTasks(projection);
  assert.equal(opened, 1);
  live = { ...projection, stepId: "prepare-personnel", attempt: 2 };
  finishOpen.resolve();
  await first;
  assert.equal(registered, 0);
  assert.equal(pending.size, 0);
  live = projection;
  await route.syncDurableTasks(projection);
  await route.syncDurableTasks(projection);
  assert.equal(opened, 2);
  assert.equal(registered, 1);
  assert.equal(pending.size, 1);
});

test("current A5 handback hashes only individually named proposal materials and preserves the original report", async t => {
  for (const variant of ["live-annotations", "bare-and-ascii", "unsafe", "retired", "unknown-send", "foreign-runtime", "foreign-role"] as const) await t.test(variant, async child => {
    const temporary = path.resolve(os.tmpdir());
    const projectRoot = await fs.mkdtemp(path.join(temporary, "ans-a5-evidence-"));
    child.after(() => {
      assert.equal(path.dirname(projectRoot), temporary);
      return fs.rm(projectRoot, { recursive: true, force: true });
    });
    const flowId = "intake-eaedc199e0f412ffa44a4352", stepId = "author-proposal", attempt = 2;
    const ref = { projectId: "project", instanceId: "dw-a5-current", definitionId: "path-a", definitionVersion: 7,
      definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
    const task: DurableTaskBinding = { taskId: "dw-0a63ca092aee70ea96b307bdd83ba8c1", roleId: "rapporteur", stage: "A5",
      parentTaskId: ref.instanceId, stageAttempt: attempt, executionAttempt: 1 };
    const pending: DurablePendingTask = { stepId, attempt, flowId, task, taskId: task.taskId, roleId: task.roleId, capability: "author-proposal",
      state: "pending", dispatch: { flowId, actor: "application", text: "Write the current proposal" } };
    const view: DurableProjection = { ref, schema: 2, projectRoot, stepId, attempt, action: "author-proposal", status: "waiting", engine: "healthy",
      workflowOwnedDispatch: true, flowId, definitionName: "Path A", stepName: "A5", pendingFacts: 0, metadata: { runtime: "claude" }, pendingTasks: [pending] };
    assert.ok((await appendTaskEvent(projectRoot, taskEvent("task.created", { from: "convener", to: task.roleId, taskId: task.taskId,
      workflowId: ref.instanceId, flowId, stage: "A5", text: pending.dispatch.text, idempotencyKey: `durable-task:${task.taskId}`, sideEffect: "docs" }))).ok);
    const files = [`docs/proposals/${flowId}-proposal-v1.md`, `docs/proposals/${flowId}-modules-v1.md`,
      `docs/proposals/${flowId}-roster-v1.md`, `docs/contracts/${flowId}-architecture-v1.md`];
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
      await fs.writeFile(path.join(projectRoot, file), `# Current ${file}\n`);
    }
    const [proposal, modules, roster, architecture] = files as [string, string, string, string];
    const exactEntries = [
      `${proposal}（已获准写入；决策项与三圈条件验收）`, `${modules}（已获准写入；4 模块）`,
      `${roster}（已获准写入；3 角色、4 模块及 topology 块）`, `${architecture}（已获准写入；有向检查点和实驾证据契约）`,
      "只查询 doc_format 与 contract_check 的格式/字段说明；未执行游戏、未测得真实按键秒数或三圈实驾证据；A6 仍须选择定案",
    ];
    const note = (text: string) => ({ text, truncated: false, redacted: false });
    const unsafeEntries = [
      `证据：${proposal}`, `${proposal} + ${modules}`, `${proposal}（含 ${modules}）`, `${proposal}（追加） 拖尾`,
      `${proposal}（错误边界)`, `${proposal}\n（伪造）`, `${proposal}.backup`, `${proposal}（../外部）`,
      `${architecture.replace("/contracts/", "/proposals/")}`, `${proposal.replace(flowId, "another-flow")}`, `C:/${roster}`,
      `${roster.replace("/proposals/", "/proposals/../proposals/")}`, `${modules}\u200b`,
    ].map(note).concat({ text: modules, truncated: true, redacted: false }, { text: roster, truncated: false, redacted: true });
    const evidence = variant === "unsafe" ? unsafeEntries : (variant === "bare-and-ascii"
      ? [proposal, `${modules} (Written and reviewed)`, roster, architecture, proposal] : exactEntries).map(note);
    const report: RuntimeReportSnapshotV1 = { version: 1, reportId: "current-a5", taskId: task.taskId,
      source: { roleId: variant === "foreign-role" ? "product" : task.roleId, runtime: variant === "foreign-runtime" ? "codex" : "claude", turnId: "actual-a5-turn" },
      status: "completed", origin: "submitted-report", at: new Date().toISOString(), summary: note("真实回交原文"), evidence, evidenceOmitted: 0 };
    const key = `model:${task.taskId}`;
    const model: DurableEffectRecord = { intent: { key, kind: "model-send", stepId, attempt: variant === "retired" ? attempt - 1 : attempt,
      task, expected: { roleId: task.roleId, runtime: "claude" } }, token: "actual-send", state: variant === "unknown-send" ? "unknown" : "succeeded",
      result: { key, token: "actual-send", outcome: variant === "unknown-send" ? "unknown" : "succeeded", evidence: "model send fixture",
        result: { turnId: "actual-a5-turn" } } };
    const captured: { report: RuntimeReportSnapshotV1; handback: TaskHandback; artifacts: DurableEvidenceRef[] }[] = [];
    const reads: string[] = [];
    const storedReports: DurableCapabilityEvent[] = [];
    const store = { listCapabilityEvents: () => [], listEffects: () => [model],
      readEvidence: async (_root: string, file: string) => {
        reads.push(file);
        assert.ok(files.includes(file));
        return { ok: true, value: { path: file, sha256: durableHash(await fs.readFile(path.join(projectRoot, file), "utf8")) } };
      },
      storeEvidence: (_ref: typeof ref, value: typeof captured[number]) => {
        captured.push(value);
        return { ok: true, value: { path: "ans-evidence/report", sha256: "c".repeat(64) } };
      },
      submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent) => {
        storedReports.push(event);
        return { ok: true, value: { state: "pending" } };
      },
    };
    const deps = { durableWorkflow: { store: async () => store }, readDurableReports: async () => [report] } as unknown as SessionManagerDeps;
    await new Handback({} as HandbackRefs, {} as HandbackPorts, deps).resumeDurableReports(view, () => false);
    if (variant !== "live-annotations" && variant !== "bare-and-ascii" && variant !== "unsafe") {
      assert.deepEqual([reads.length, captured.length, storedReports.length], [0, 0, 0]);
      return;
    }
    assert.equal(storedReports[0]?.input.kind, "task-report");
    assert.deepEqual(captured[0]?.report, report);
    assert.deepEqual(captured[0]?.handback.evidence, evidence.map(item => item.text));
    const expected = variant === "unsafe" ? [] : files.sort();
    assert.deepEqual(reads, expected);
    assert.deepEqual(captured[0]?.artifacts, expected.map(file => ({ path: file, sha256: durableHash(`# Current ${file}\n`) })));
    assert.deepEqual((await readTaskState(projectRoot)).records.get(task.taskId)?.reports[0]?.evidence, evidence.map(item => item.text));
  });
});

test("A12a binds the actual settled criteria write independently of report wording", async context => {
  const variants = ["annotated", "plain", "same-path-edit", "missing", "unknown-write", "tampered", "foreign-flow", "foreign-task",
    "foreign-role", "retired-attempt", "foreign-step", "ambiguous-version", "foreign-model-binding"] as const;
  for (const variant of variants) await context.test(variant, async subtest => {
    const temporary = await fs.realpath(os.tmpdir());
    const projectRoot = await fs.mkdtemp(path.join(temporary, "ans-criteria-proof-"));
    subtest.after(() => {
      assert.equal(path.dirname(projectRoot), temporary);
      return fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    });
    const ref = { projectId: "project", instanceId: "dw-criteria", definitionId: "path-a", definitionVersion: 4,
      definitionDigest: "b".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
    const flowId = "racing-test";
    const stepId = "open-standard";
    const task: DurableTaskBinding = { taskId: "dw-verification", roleId: "verifier", stage: "A12a", parentTaskId: ref.instanceId,
      stageAttempt: 1, executionAttempt: 1 };
    const view: DurableProjection = { ref, schema: 2, definitionName: "Path A", projectRoot,
      stepId: "implement", stepName: "Implementation", action: "governed-implementation", flowId, attempt: 1,
      status: "waiting", engine: "healthy", pendingFacts: 0, metadata: { runtime: "claude" }, workflowOwnedDispatch: true,
      pendingTasks: [{ task, taskId: task.taskId, roleId: task.roleId, stepId, attempt: 1, flowId,
        state: "pending", capability: "independent-standard", dispatch: { actor: "application", flowId, text: "Write the criteria" } }] };
    assert.ok((await appendTaskEvent(projectRoot, taskEvent("task.created", { from: "convener", to: task.roleId, taskId: task.taskId,
      workflowId: ref.instanceId, flowId, stage: "A12a", text: "Write the criteria", idempotencyKey: `durable-task:${task.taskId}`, sideEffect: "docs" }))).ok);
    const file = `docs/quality/${flowId}-criteria-v1.md`;
    const absolute = path.join(projectRoot, file);
    const content = "# Criteria\n\nVerify the race starts and ends.\n";
    const sha256 = durableHash(content);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, variant === "tampered" ? "Changed outside the original turn" : content);
    const report: RuntimeReportSnapshotV1 = {
      version: 1, reportId: "report-a12a", taskId: task.taskId, source: { roleId: task.roleId, runtime: "claude", turnId: "criteria-turn" },
      status: "completed", origin: "submitted-report", at: new Date().toISOString(), evidenceOmitted: 0,
      evidence: [{ text: variant === "plain" || variant === "missing" ? file : `证据：${file}（已写入并回读）`, truncated: false, redacted: false }],
      summary: { text: "已完成验收标准。", truncated: false, redacted: false },
    };
    const model: DurableEffectRecord = {
      intent: { key: `model:${task.taskId}`, kind: "model-send", stepId, attempt: 1,
        task: variant === "foreign-model-binding" ? { ...task, executionAttempt: 2 } : task,
        expected: { roleId: task.roleId, runtime: "claude" } }, token: "model-token", state: "succeeded",
      result: { key: `model:${task.taskId}`, token: "model-token", outcome: "succeeded", evidence: "original send", result: { turnId: "criteria-turn" } },
    };
    const write = (key: string, filePath: string, hash: string): DurableEffectRecord => ({
      intent: { key, kind: "task-write", stepId: variant === "foreign-step" ? "other-standard" : stepId,
        attempt: variant === "retired-attempt" ? 2 : 1,
        task: { ...task, taskId: variant === "foreign-task" ? "dw-another-task" : task.taskId,
          roleId: variant === "foreign-role" ? "other-verifier" : task.roleId }, expected: { paths: [filePath], contentSha256: hash, operation: "write" } },
      token: "write-token", state: variant === "unknown-write" ? "unknown" : "succeeded",
      result: { key, token: "write-token", outcome: variant === "unknown-write" ? "unknown" : "succeeded", evidence: "actual file write" },
    });
    const writes = variant === "missing" ? [] : [write("file:original", variant === "foreign-flow" ? "docs/quality/alien-criteria-v1.md" : file, sha256)];
    if (variant === "ambiguous-version") writes.push(write("file:another-version", `docs/quality/${flowId}-criteria-v2.md`, sha256));
    if (variant === "same-path-edit") writes.unshift(write("file:before-edit", file, durableHash("Earlier content")));
    const recorded = new Map<string, DurableCapabilityEvent>();
    const captured: Array<{ artifacts: DurableEvidenceRef[]; handback: TaskHandback }> = [];
    const store = {
      listEffects: (_ref: typeof ref, kind: string) => kind === "task-write" ? writes : kind === "model-send" ? [model] : [],
      listCapabilityEvents: () => [],
      readEvidence: async (_root: string, relative: string) => {
        assert.equal(relative, file);
        return { ok: true as const, value: { path: relative, sha256: durableHash(await fs.readFile(absolute, "utf8")) } };
      },
      storeEvidence: (_ref: typeof ref, evidence: (typeof captured)[number]) => {
        captured.push(evidence);
        return { ok: true as const, value: { path: "ans-evidence/" + "c".repeat(64), sha256: "c".repeat(64) } };
      },
      submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent) => {
        const previous = recorded.get(event.key);
        if (previous) assert.deepEqual(event, previous);
        recorded.set(event.key, event);
        return { ok: true as const, value: { key: event.key, state: "pending" } };
      },
    };
    const deps = { durableWorkflow: { store: async () => store }, readDurableReports: async () => [report] } as unknown as SessionManagerDeps;
    await new Handback({} as HandbackRefs, {} as HandbackPorts, deps).resumeDurableReports(view, () => false);
    if (variant === "foreign-model-binding") {
      assert.equal(captured.length, 0);
      assert.equal(recorded.size, 0);
      return;
    }
    await new Handback({} as HandbackRefs, {} as HandbackPorts, deps).resumeDurableReports(view, () => false);
    assert.equal(recorded.size, 1);
    const event = recorded.get(`report:${report.reportId}`);
    assert.equal(event?.stepId, stepId);
    assert.equal(event?.attempt, 1);
    assert.equal(event?.source.originId, report.source.turnId);
    assert.equal((await readTaskState(projectRoot)).records.get(task.taskId)?.reports.length, 1);
    const accepted = variant === "annotated" || variant === "plain" || variant === "same-path-edit";
    assert.deepEqual(captured.map(item => item.artifacts), accepted ? [[{ path: file, sha256 }], [{ path: file, sha256 }]] : [[], []]);
    assert.deepEqual(captured[0]?.handback.evidence, [report.evidence[0]?.text]);
    const typed = store as unknown as Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
    const review = await workflowReviewProof(typed, view, "A12a", flowId, captured[0]!.handback, captured[0]!.artifacts);
    assert.equal(review.ok, accepted);
    if (accepted) {
      await fs.appendFile(absolute, "\nUntrusted later edit");
      assert.equal((await workflowReviewProof(typed, view, "A12a", flowId, captured[0]!.handback, captured[0]!.artifacts)).ok, false);
    }
  });
});

test("A11 keeps one write lane and resumes the same operations parent from child facts", async () => {
  const ref = { projectId: "project", instanceId: "dw-operations", definitionId: "path-a", definitionVersion: 5,
    definitionDigest: "b".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const flowId = "multi-owner";
  const stepId = "implement";
  const task = (taskId: string, roleId: string, parentTaskId: string, workItemId?: string): DurablePendingTask => ({
    capability: "operations-implementation", taskId, roleId, workItemId, stepId, attempt: 1, flowId, state: "pending",
    dispatch: { actor: "application", text: "Develop the candidate", flowId },
    task: { taskId, roleId, parentTaskId, stage: "A11", stageAttempt: 1, executionAttempt: 1 },
    ...(workItemId ? { modulePaths: ["src/core/"], baseOid: "a".repeat(40) } : {}),
  });
  const parent = task("dw-operator", "convener", ref.instanceId);
  const child = task("dw-core", "worker", parent.taskId, "worker");
  const approvalEventKey = `a11-dispatch:${parent.taskId}:core-original`;
  const planned = { id: "worker", roleId: "worker", paths: ["src/core/"] };
  const view: DurableProjection = { ref, projectRoot: path.join(os.tmpdir(), "ans-operations-proof"), schema: 2, definitionName: "A",
    stepId, stepName: "Implementation", action: "operations-implementation", flowId, attempt: 1, status: "waiting", engine: "healthy",
    pendingFacts: 0, metadata: { runtime: "claude" }, workflowOwnedDispatch: true, pendingTasks: [parent], implementationItems: [planned] };
  let live = view;
  const events: Array<{ event: DurableCapabilityEvent; receipt: { key: string; state: "consumed" } }> = [];
  let hasTaskGit = true;
  const store = {
    lookup: () => live,
    listCapabilityEvents: () => events,
    listEffects: () => [],
    taskGitScope: (_ref: typeof ref, taskId: string, roleId: string) => hasTaskGit && taskId === child.taskId && roleId === child.roleId
      ? { taskId, workflowId: ref.instanceId, branch: "ans/task/mock", paths: planned.paths } : undefined,
    getEvidence: () => ({ handback: { roleId: child.roleId, taskId: child.taskId, status: "completed", summary: "Worker report", evidence: [], at: new Date().toISOString() } }),
    submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent, current: () => boolean) => {
      assert.ok(current());
      assert.equal(event.key, approvalEventKey);
      live = { ...view, pendingTasks: [parent, { ...child, bindingKey: event.key }] };
      const receipt = { key: event.key, state: "consumed" as const };
      events.push({ event, receipt });
      return { ok: true as const, value: receipt };
    },
  } as unknown as Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
  const source = (turnId: string, taskId = parent.taskId) => ({ entry: { assignedTaskId: taskId }, origin: { turnId, taskId } } as ActualDispatchSource);
  const input = { roleId: "worker", task: "Implement core", moduleId: planned.id, idempotencyKey: "core-original", stage: "A11" as const };
  assert.equal(nextOperationsDelivery(store, live, false)?.task.taskId, parent.taskId);
  assert.equal((await requestOperationsChild(store, live, "chief", input, "worker", input.task, source("chief-turn"), () => true)).ok, false);
  assert.equal((await requestOperationsChild(store, live, "convener", input, "worker", input.task, source("old-turn", "retired-parent"), () => true)).ok, false);
  assert.equal((await requestOperationsChild(store, live, "convener", input, "worker", input.task, source("origin"), () => true)).ok, true);
  assert.equal(nextOperationsDelivery(store, live, true)?.task.taskId, child.taskId);
  assert.match(nextOperationsDelivery(store, live, true)?.text ?? "", /git commit -m[\s\S]*run_shell Git/);
  hasTaskGit = false;
  assert.doesNotMatch(nextOperationsDelivery(store, live, true)?.text ?? "", /git commit -m/);
  assert.equal((await requestOperationsChild(store, live, "convener", input, "worker", input.task, source("resumed"), () => true)).ok, true);
  assert.equal((await requestOperationsChild(store, live, "convener", input, "worker", "Changed work", source("resumed"), () => true)).ok, false);
  assert.equal(events.length, 1);
  const report = { key: "report:original", evidence: { path: `ans-evidence/${"a".repeat(64)}`, sha256: "a".repeat(64) } };
  live = { ...view, pendingTasks: [parent, { ...child, state: "reported", report }] };
  const wake = nextOperationsDelivery(store, live, false);
  assert.equal(wake?.task.taskId, parent.taskId);
  assert.equal(wake?.wake?.key, `a11-wake:${child.taskId}:${report.key}`);
  live = { ...view, pendingTasks: [parent, { ...child, state: "accepted", report, commitOid: "b".repeat(40) }] };
  const closeKey = `a11-close:${child.taskId}:accepted`;
  events.push({ event: { key: closeKey, stepId, attempt: 1, flowId, source: { roleId: "convener", originId: "resumed", parentTaskId: parent.taskId },
    input: { kind: "task-closed", task: child.task, reportKey: report.key, outcome: "accepted" } }, receipt: { key: closeKey, state: "consumed" } });
  assert.equal(nextOperationsDelivery(store, live, true), undefined);
  const progress = nextOperationsDelivery(store, live, false);
  assert.equal(progress?.task.taskId, parent.taskId);
  assert.equal(progress?.wake?.key, `a11-progress:${child.taskId}:${closeKey}`);
  assert.match(progress?.text ?? "", /提交=bbbb/);
});

test("R19 puts the durable A12b diagnosis only in the bound owner's original repair delivery", () => {
  const ref = { projectId: "project", instanceId: "dw-r19", definitionId: "path-a", definitionVersion: 8,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const stepId = "implement", flowId = "race", roleId = "entry-owner", workItemId = "entry", paths = ["index.html"];
  const parentTask: DurableTaskBinding = { taskId: "dw-operator-two", parentTaskId: ref.instanceId,
    roleId: "convener", stage: "A11", stageAttempt: 2, executionAttempt: 1 };
  const worker = { ...parentTask, taskId: "dw-entry-two", parentTaskId: parentTask.taskId, roleId };
  const originalWorker = { ...worker, taskId: "dw-entry-one", parentTaskId: "dw-operator-one", stageAttempt: 1 };
  const parent: DurablePendingTask = { taskId: parentTask.taskId, task: parentTask, roleId: parentTask.roleId, stepId,
    capability: "operations-implementation", flowId, attempt: 2, state: "pending", dispatch: { actor: "application", flowId, text: "Coordinate" } };
  const candidate = "b".repeat(40);
  const order: NonNullable<DurablePendingTask["workOrder"]> = { schema: "implementation-work-order/v1", digest: "c".repeat(64),
    task: worker, workItemId, paths, standard: { path: "docs/quality/race-criteria-v1.md", sha256: "e".repeat(64) },
    capabilitiesDigest: "f".repeat(64), requirements: [], deferredChecks: [] };
  const child: DurablePendingTask = { ...parent, task: worker, taskId: worker.taskId, roleId, baseOid: candidate, workItemId,
    modulePaths: paths, workOrder: order, dispatch: { actor: "application", flowId, text: "The operator requested a repair." } };
  const original = { ...child, task: originalWorker, taskId: originalWorker.taskId, attempt: 1, state: "accepted" as const,
    workOrder: { ...order, task: originalWorker, digest: "d".repeat(64) } };
  const reason = "index.html 第 13 行的正文 noscript 含子标签。保留纯文本提示，移除其中的子标签。";
  const repair = { sourceCandidateOid: candidate, ownerTask: originalWorker, workItemId, workOrderDigest: original.workOrder.digest,
    paths, writeEffectKeys: ["file:original-entry-write"], inherited: [], reason };
  const view: DurableProjection = { ref, schema: 2, projectRoot: path.join(os.tmpdir(), "ans-r19-worker-prompt"), stepId, stepName: "A11",
    flowId, attempt: 2, definitionName: "Path A", status: "waiting", engine: "healthy", pendingFacts: 0, metadata: { runtime: "claude" },
    action: "operations-implementation", workflowOwnedDispatch: true, blockedRoutingEnabled: true, implementationRepair: repair,
    pendingTasks: [original, parent, child], implementationItems: [{ id: workItemId, roleId, paths }] };
  const store = { taskGitScope: () => ({ taskId: worker.taskId, paths }) } as unknown as Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
  const delivery = nextOperationsDelivery(store, view, false);
  assert.equal(delivery?.task.taskId, worker.taskId);
  assert.match(delivery.text, /应用核对的 A12b 返工依据/);
  assert.ok(delivery.text.includes(reason));
  assert.ok(delivery.text.includes(`原候选 ${candidate}，核准修复文件 index.html`));
  assert.doesNotMatch(delivery.text, /The operator requested a repair/);
  const mismatch: DurableProjection[] = [
    { ...view, implementationRepair: undefined },
    { ...view, implementationRepair: { ...repair, sourceCandidateOid: "0".repeat(40) } },
    { ...view, implementationRepair: { ...repair, ownerTask: { ...originalWorker, roleId: "wrong-owner" } } },
    { ...view, implementationRepair: { ...repair, paths: ["README.md"] } },
    { ...view, pendingTasks: [original, parent, { ...child, task: { ...worker, executionAttempt: 2 },
      workOrder: { ...order, task: { ...worker, executionAttempt: 2 } } }] },
    { ...view, pendingTasks: [parent, child] },
  ];
  for (const stale of mismatch) assert.doesNotMatch(nextOperationsDelivery(store, stale, false)?.text ?? "", /正文 noscript 含子标签/);
});

test("A11 delivers the approved work order and admits retest observations only from its acknowledged owner turn", async () => {
  const ref = { projectId: "project", instanceId: "dw-a11-authority", definitionId: "path-a", definitionVersion: 8,
    definitionDigest: "a".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const projectRoot = path.join(os.tmpdir(), "ans-a11-actual-order");
  const stepId = "implement", flowId = "racing", roleId = "race-qa";
  const parentTask = { taskId: "dw-original-operator", parentTaskId: ref.instanceId, roleId: "convener", stage: "A11" as const, stageAttempt: 2, executionAttempt: 1 };
  const childTask = { ...parentTask, taskId: "dw-current-module-check", parentTaskId: parentTask.taskId, roleId };
  const parent: DurablePendingTask = { task: parentTask, taskId: parentTask.taskId, roleId: parentTask.roleId, stepId, attempt: 2, flowId,
    capability: "operations-implementation", state: "pending", dispatch: { actor: "application", flowId, text: "Current parent" } };
  const raw = "优先用可用的真实浏览器预览和公开键盘 W/S/A/D/P，从新局同一 session ID 真实驾驶 CP1→CP2→CP3→FINISH 三圈；分阶段保存 0/3、1/3、2/3、3/3 的截图、实际按下/松开及 P 停/续操作记录，报告可复现的短路线。";
  const paths = ["test/race-qa/"];
  const expectedCommand = ["node", "--test", "test/race-qa/rules.test.js"];
  const child: DurablePendingTask = { ...parent, task: childTask, taskId: childTask.taskId, roleId, baseOid: "b".repeat(40),
    workItemId: roleId, modulePaths: paths, dispatch: { actor: "application", flowId, text: raw },
    workOrder: { schema: "implementation-work-order/v1", digest: "c".repeat(64), task: childTask, workItemId: roleId, paths,
      standard: { path: "docs/quality/racing-criteria-v1.md", sha256: "d".repeat(64) }, capabilitiesDigest: "e".repeat(64),
      requirements: [{ id: "AC-2", stage: "A11", capability: "module-shell", evidence: ["command-receipt"], workItemId: roleId, command: expectedCommand }],
      deferredChecks: [{ id: "AC-4", stage: "A12b", capability: "workspace-browser", evidence: ["browser-input", "browser-screenshot"] }] } };
  let live: DurableProjection = { ref, schema: 2, projectRoot, stepId, attempt: 2, flowId, pendingTasks: [parent, child], status: "waiting", engine: "healthy",
    pendingFacts: 0, definitionName: "Path A", stepName: "A11", metadata: { runtime: "claude" }, action: "operations-implementation",
    blockedRoutingEnabled: true, workflowOwnedDispatch: true, implementationItems: [{ id: roleId, roleId, paths }] };
  let observations = 0;
  let effect: DurableEffectRecord | undefined;
  const routed: DurableCapabilityEvent[] = [];
  const store = { taskGitScope: () => ({ taskId: childTask.taskId, paths }), lookup: () => live, listCapabilityEvents: () => [],
    listEffects: () => effect ? [effect] : [], getEvidence: () => ({ handback: { turnId: "original-worker", summary: "Current A11 result", evidence: [] } }),
    submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent, current: () => boolean) => {
      assert.equal(current(), true);
      assert.equal(event.input.kind, "implementation-dispatch");
      assert.equal(event.input.roleId, roleId);
      assert.equal(event.input.requestedRoleId, "wrong-owner");
      assert.equal(event.input.workItemId, roleId);
      routed.push(event);
      live = { ...live, pendingTasks: [parent, { ...child, bindingKey: event.key }] };
      return { ok: true, value: { key: event.key, state: "consumed" } };
    }, recordImplementationSelfTest: async (_ref: typeof ref, value: { task: DurableTaskBinding;
    observation: { argv: readonly string[] } }, current: () => boolean) => {
      assert.deepEqual(value.task, childTask);
      assert.deepEqual(value.observation.argv, expectedCommand);
      assert.equal(current(), true);
      observations++;
    } } as unknown as Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
  const outgoing = nextOperationsDelivery(store, live, false);
  assert.equal(outgoing?.task.taskId, childTask.taskId);
  assert.match(outgoing.text, /工单 SHA-256/);
  assert.match(outgoing.text, /node[\s\S]*rules\.test\.js/);
  assert.match(outgoing.text, /git commit[\s\S]*模块自测继续经原 run_shell/);
  assert.doesNotMatch(outgoing.text, /只运行前述受限 Git 命令/);
  assert.match(outgoing.text, /运营按签发标准派工取证，A12b 审计 AC-4/);
  assert.doesNotMatch(outgoing.text, /真实驾驶|0\/3、1\/3|CP1|session ID/);
  assert.equal(nextOperationsDelivery(store, { ...live, pendingTasks: [parent, { ...child, workOrder: undefined }] }, false), undefined);
  const origin = { entry: { assignedTaskId: parentTask.taskId }, origin: { turnId: "parent-origin", taskId: parentTask.taskId } } as ActualDispatchSource;
  const routedRequest = { roleId: "wrong-owner", task: raw, moduleId: roleId };
  const tryRoute = (request: typeof routedRequest & { modulePaths?: string[] }) => requestOperationsChild(store,
    { ...live, pendingTasks: [parent] }, "convener", request, "wrong-owner", raw, origin, () => true,
    async (owner, writes) => {
      assert.equal(owner, roleId);
      assert.deepEqual(writes, paths);
      return { ok: true, value: true };
    });
  const invalid = await tryRoute({ ...routedRequest, modulePaths: ["src/elsewhere/"] });
  assert.equal(invalid.ok, false);
  assert.equal(routed.length, 0);
  const corrected = await tryRoute(routedRequest);
  assert.equal(corrected.ok, true);
  assert.match(corrected.message ?? "", /实际属主 race-qa，子任务 #dw-current-module-check/);
  assert.equal(routed.length, 1);

  const lifetime = new AbortController();
  const session = { projectRoot, roleId, runtime: "claude", busy: true, assignedTaskId: childTask.taskId,
    origins: { running: { turnId: "current-turn", taskId: childTask.taskId, clientMessageId: "task-send" } },
    interactionState: { turn: { signal: lifetime.signal }, lifetime } } as unknown as LiveSession;
  let deliveryKey = `model:${childTask.taskId}`;
  let selectionId: string | undefined = "first-window-registration";
  const durable = { delivery: () => ({ roleId, runtime: "claude", ref, assignmentTaskId: childTask.taskId,
    selectionId: "first-window-registration", intent: { stepId, attempt: 2, task: childTask, key: deliveryKey } }),
    lookup: async () => live, store: async () => store } as unknown as DesktopDurableWorkflow;
  const observe = observeImplementationSelfTest(durable, () => session, () => selectionId);
  const facts = { roleId, turnId: "current-turn", toolCallId: "actual-test", cwd: projectRoot, argv: expectedCommand, reviewedBy: "operator",
    outcome: { exitCode: 0, stdout: "pass", stderr: "" }, writeAuditPassed: true };
  await observe({ ...facts, roleId: "wrong-worker" });
  await observe({ ...facts, turnId: "retired-turn" });
  await observe({ ...facts, cwd: path.join(projectRoot, "other") });
  await observe({ ...facts, writeAuditPassed: false });
  await observe({ ...facts, outcome: { ...facts.outcome, exitCode: 1 } });
  assert.equal(observations, 0);
  await observe(facts);
  assert.equal(observations, 1);
  const guard = desktopImplementationRetestGuard(durable, () => session, projectRoot, childTask.taskId, () => selectionId);
  const context = { turnId: "current-turn", toolCallId: "actual-test" };
  assert.deepEqual(await guard(context), { mode: "ordinary" });
  const order = child.workOrder!;
  const retest: NonNullable<DurableProjection["a11Disposition"]> = { state: "resumed", key: "retest", entry: 1, generation: 2,
    childTask, parentTask, workOrderDigest: order.digest, standard: order.standard, standardState: "verified",
    candidateOid: "f".repeat(40), baseOid: child.baseOid!, branch: "ans/task/racing", commitEffectKey: "original-commit",
    childReport: { key: "report:original-worker", evidence: { path: "report", sha256: "a".repeat(64) } },
    governanceDigest: "1".repeat(64), observation: { stagedPaths: [], trackedDirty: false, reason: "clean" },
    retest: { missingRequirements: order.requirements } };
  live = { ...live, a11Disposition: retest };
  assert.deepEqual(await guard(context), { mode: "denied" });
  await observe(facts);
  assert.equal(observations, 1);
  const wake = nextOperationsDelivery(store, live, false);
  assert.equal(wake?.wake?.key, "a11-resume:retest");
  assert.match(wake.text, /AC-2[\s\S]*node[\s\S]*rules\.test\.js/);
  assert.doesNotMatch(wake.text, /git add|git commit|落实实际产物/);
  assert.equal(pendingDeliveryBlocksQueue(live, wake.wake.key, { queued: true }), false);
  assert.equal(pendingDeliveryBlocksQueue(live, wake.wake.key, { queued: false }), true);
  assert.equal(pendingDeliveryBlocksQueue(live, "a11-resume:other", { queued: true }), true);
  deliveryKey = `model:${wake.wake.key}`;
  assert.deepEqual(await guard(context), { mode: "denied" });
  const acknowledged = { key: deliveryKey, token: "claim", outcome: "succeeded" as const, evidence: "real runtime ACK",
    result: { turnId: context.turnId } };
  effect = { intent: { key: deliveryKey, kind: "model-send", stepId, attempt: 2, task: childTask, expected: { runtime: "claude" } },
    token: acknowledged.token, state: "succeeded", result: acknowledged } as DurableEffectRecord;
  const strict = await guard(context);
  assert.equal(strict.mode, "retest");
  assert.deepEqual(strict.approvedCommands, [expectedCommand]);
  await observe({ ...facts, writeAuditPassed: false, reviewedBy: "", outcome: { ...facts.outcome, exitCode: 1 } });
  assert.equal(observations, 2);
  assert.deepEqual(await guard({ ...context, turnId: "original-worker" }), { mode: "denied" });
  selectionId = "new-window-registration";
  assert.equal(strict.isCurrent(), false);
  assert.deepEqual(await guard(context), { mode: "denied" });
  const report = { key: "report:retest-worker", evidence: retest.childReport.evidence };
  live = { ...live, a11Disposition: { ...retest, retest: { ...retest.retest!, reportReviewGeneration: 5 } },
    pendingTasks: [parent, { ...child, state: "reported", report }] };
  await observe(facts);
  assert.equal(observations, 2);
  const review = nextOperationsDelivery(store, live, false);
  assert.equal(review?.task.taskId, parentTask.taskId);
  assert.equal(review?.wake?.key, `a11-wake:${childTask.taskId}:${report.key}:review:5`);
  assert.equal(pendingDeliveryBlocksQueue(live, review.wake.key, { queued: true }), false);
  assert.equal(pendingDeliveryBlocksQueue(live, `a11-wake:${childTask.taskId}:${report.key}`, { queued: true }), true);
});

test("A12a preflight only advertises current allowed capabilities and verified interfaces", async () => {
  const ref = { projectId: "project", instanceId: "verify", definitionId: "path-a", definitionDigest: "a".repeat(64), definitionVersion: 8,
    executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const input = { ref, projectRoot: os.tmpdir(), roleId: "independent", taskId: "verify-current", stepId: "standard",
    attempt: 1, flowId: "racing", stage: "A12a" as const, path: "docs/quality/racing-criteria-v1.md", baselineOid: "c".repeat(40) };
  const deps = { getListing: () => ({ roles: [{ roleId: "independent" }] }), shellArming: {}, shellOperatorChannel: () => undefined } as unknown as SessionManagerDeps;
  const snapshot = unwrap(await desktopVerificationPreflight(deps, "claude")(input));
  assert.equal(snapshot.status.length, 6);
  assert.equal(snapshot.status.find(item => item.capability === "module-shell")?.status, "available");
  assert.equal(snapshot.status.find(item => item.capability === "workspace-browser")?.status, "unavailable");
  assert.match(verificationStandardPrompt(snapshot), /verificationRequirements[\s\S]*A12b/);
  const active = unwrap(await desktopVerificationPreflight(deps, "claude")({ ...input, ref: { ...ref,
    executor: "ans-durable-evidence-audit-v1", activityContract: 3 } }));
  assert.equal(active.status.length, 5);
  assert.equal(active.status.find(item => item.capability === "external-execution")?.status, "unavailable");
  assert.equal(active.status.find(item => item.capability === "approved-build")?.status, "unavailable");
  assert.ok(active.status.every(item => !item.capability.startsWith("workspace-")));
  assert.match(verificationStandardPrompt(active), /只读审计/);
  const reassessed = unwrap(await desktopVerificationPreflight(deps, "claude")({ ...input, stage: "A12b", path: "docs/quality/racing-report-v1.md" }));
  assert.equal(reassessed.stage, "A12b");
  assert.equal(reassessed.status.find(item => item.capability === "workspace-browser")?.status, "unavailable");
  assert.equal((await desktopVerificationPreflight(deps, "claude")({ ...input, roleId: "other" })).ok, false);
});

test("R15 scope card persists its current allowed choice and refuses drifting evidence", async () => {
  const ref = { projectId: "project", instanceId: "scope", definitionId: "path-a", definitionDigest: "a".repeat(64), definitionVersion: 8,
    executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const projectRoot = path.join(os.tmpdir(), "ans-r15-scope");
  const scope: NonNullable<DurableProjection["blockedRouting"]> = { kind: "scope-change",
    binding: { requestId: "current-scope", digest: "b".repeat(64), generation: 1 }, origin: { stepId: "standard", entry: 3, attempt: 1,
      task: { taskId: "current-task", roleId: "independent", parentTaskId: ref.instanceId, stage: "A12a", stageAttempt: 1, executionAttempt: 1 } },
    document: { path: "docs/quality/racing-criteria-v1.md", sha256: "c".repeat(64) }, governanceDigest: "d".repeat(64),
    reason: "Browser disabled", capability: "workspace-browser",
    options: [{ id: "wait", label: "Wait", impact: "Keep original signed requirements" }, { id: "stop", label: "Stop", impact: "Close blocked" }] };
  const view: DurableProjection = { ref, schema: 2, projectRoot, stepId: "standard", attempt: 1, flowId: "racing", action: "independent-standard",
    definitionName: "Path A", stepName: "A12a", pendingFacts: 0, metadata: {}, status: "waiting", engine: "healthy", blockedRoutingEnabled: true, blockedRouting: scope };
  let hash = scope.document.sha256;
  let saved = 0;
  let registered = true;
  let activate = 0;
  const store = { lookup: () => view, readEvidence: async (_root: string, file: string) => ({ ok: true, value: { path: file, sha256: hash } }),
    decideBlockedScopeChange: async (_ref: typeof ref, value: NonNullable<typeof scope.decision>, isCurrent: () => boolean) => {
      assert.equal(isCurrent(), true);
      assert.deepEqual(value, { ...scope.binding, option: "wait", provenance: { source: "customer" } });
      saved++;
      return { ok: true };
    } };
  const durable = { store: async () => store, activate: () => { activate++; } } as unknown as DesktopDurableWorkflow;
  const pending: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "local-customer", presenter: card => { pending.push(card); } });
  const open = { durable, view, chief: "chief", customer: channel.customerInput, isRegistered: () => registered };
  await presentBlockedScopeCard(open);
  await presentBlockedScopeCard(open);
  assert.equal(pending.length, 1);
  const request = pending[0]!;
  assert.deepEqual(request.request.kind === "choice" && request.request.options.map(item => item.id), ["wait", "stop"]);
  const respond = (id: string, current = true) => channel.respondDurable({ id: request.id, decision: { kind: "choice", selected: [id] } }, () => current);
  await respond("revise");
  await respond("wait", false);
  hash = "d".repeat(64);
  assert.equal((await respond("wait"))?.ok, false);
  assert.equal(saved, 0);
  hash = scope.document.sha256;
  assert.equal((await respond("wait"))?.ok, true);
  assert.equal(saved, 1);
  assert.equal(activate, 1);
  registered = false;
  closeBlockedScopeCard(durable, projectRoot);
});

test("evidence disposition renders only the verified continuation and binds its original operating task", async () => {
  const ref = { projectId: "project", instanceId: "evidence-scope", definitionId: "path-a", definitionDigest: "a".repeat(64),
    definitionVersion: 9, executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const parent: DurableTaskBinding = { taskId: "original-operations", roleId: "convener", parentTaskId: ref.instanceId,
    stage: "A11", stageAttempt: 1, executionAttempt: 1 };
  const standard = { path: "docs/quality/racing-criteria-v1.md", sha256: "b".repeat(64) };
  const candidateOid = "c".repeat(40);
  const equivalent = { roleId: "acceptance-evidence-collector", fromGeneration: 2,
    artifacts: [{ requirementId: "AC-1", path: "src/entry.js", source: "candidate-file" as const }] };
  const scope: NonNullable<DurableProjection["blockedRouting"]> = {
    kind: "scope-change", binding: { requestId: "evidence-recovery", digest: "d".repeat(64), generation: 2 },
    origin: { stepId: "implement", entry: 3, attempt: 1, task: parent }, document: standard,
    governanceDigest: "e".repeat(64), candidateOid, reason: "AC-1 缺实际原件。", evidenceAuditKey: "audit", evidenceRoute: equivalent,
    options: [{ id: "wait", label: "Wait", impact: "Wait on the same task" }, { id: "route", label: "Use alternate source", impact: "Preserve the signed standard" }],
  };
  const view: DurableProjection = { ref, schema: 2, projectRoot: path.join(os.tmpdir(), "ans-r20-evidence-scope"), stepId: "implement", attempt: 1,
    flowId: "racing", action: "operations-implementation", definitionName: "Path A", stepName: "A11", pendingFacts: 0, metadata: {},
    status: "waiting", engine: "healthy", blockedRouting: scope,
    evidenceAudit: { basis: { candidateOid, branch: "ans/task/evidence-scope", standard, approvalDigest: "f".repeat(64), generation: 2 },
      state: "blocked", requirements: [], records: [], missing: [{ requirementId: "AC-1", reason: "缺实际原件" }], writePaths: [] } };
  const pending: OperatorRequestPayload[] = [];
  let approved = 0;
  const durable = { store: async () => ({ lookup: () => view,
    decideBlockedScopeChange: async (_ref: typeof ref, value: NonNullable<typeof scope.decision>, current: () => boolean) => {
      assert.equal(current(), true);
      assert.deepEqual(value, { ...scope.binding, option: "route", provenance: { source: "customer" } });
      approved++;
      return { ok: true };
    } }), activate() {} } as unknown as DesktopDurableWorkflow;
  const channel = createCustomerInputChannel({ operatorId: "local-customer", presenter: card => { pending.push(card); } });
  await presentBlockedScopeCard({ durable, view, chief: "chief", customer: channel.customerInput, isRegistered: () => true });
  const request = pending[0]!;
  assert.deepEqual(request.request.kind === "choice" && request.request.options.map(option => option.id), ["wait", "route"]);
  assert.match(request.request.preview ?? "", /AC-1[\s\S]*src\/entry\.js/);
  const choose = (option: string) => channel.respondDurable({ id: request.id, decision: { kind: "choice", selected: [option] } }, () => true);
  assert.equal((await choose("compromise"))?.ok, false);
  assert.equal((await choose("route"))?.ok, true);
  assert.equal(approved, 1);
  assert.equal(evidenceRouteDelivery(view), undefined);
  view.evidenceAudit = { ...view.evidenceAudit!, state: "collecting", route: { ...equivalent, requestId: scope.binding.requestId, parentTask: parent } };
  assert.equal(evidenceRouteDelivery(view)?.key, "evidence-route:evidence-recovery");
  assert.deepEqual(evidenceRouteDelivery(view)?.task, parent);
  closeBlockedScopeCard(durable, view.projectRoot);
});

test("A11 resumes an exact parent report after every approved child is accepted", async context => {
  const temporary = await fs.realpath(os.tmpdir());
  const projectRoot = await fs.mkdtemp(path.join(temporary, "ans-a11-parent-resume-"));
  context.after(() => {
    assert.equal(path.dirname(projectRoot), temporary);
    return fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const ref = { projectId: "project", instanceId: "dw-operation", definitionId: "path-a", definitionVersion: 5,
    definitionDigest: "b".repeat(64), executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const flowId = "multi-owner";
  const stepId = "implement";
  const parentTask: DurableTaskBinding = { taskId: "dw-operator", roleId: "convener", parentTaskId: ref.instanceId,
    stage: "A11", stageAttempt: 1, executionAttempt: 1 };
  const parent: DurablePendingTask = { task: parentTask, taskId: parentTask.taskId, roleId: parentTask.roleId,
    stepId, attempt: 1, flowId, capability: "operations-implementation", state: "pending", dispatch: { actor: "application", flowId, text: "Coordinate" } };
  const children = ["worker", "environment"].map((roleId, index): DurablePendingTask => {
    const task = { ...parentTask, parentTaskId: parent.taskId, taskId: `dw-${roleId}`, roleId };
    return { ...parent, task, taskId: task.taskId, roleId, workItemId: roleId, state: "accepted", commitOid: String(index + 1).repeat(40) };
  });
  const view: DurableProjection = { ref, projectRoot, schema: 2, definitionName: "Path A", stepId, stepName: "Implement",
    action: "operations-implementation", attempt: 1, flowId, status: "waiting", engine: "healthy", pendingFacts: 0,
    metadata: { runtime: "claude" }, workflowOwnedDispatch: true, pendingTasks: [parent, ...children],
    implementationItems: children.map(child => ({ id: child.roleId, roleId: child.roleId, paths: [`src/${child.roleId}/`] })) };
  assert.ok((await appendTaskEvent(projectRoot, taskEvent("task.created", { from: "convener", to: parent.roleId, taskId: parent.taskId,
    workflowId: ref.instanceId, flowId, stage: "A11", text: "Coordinate", idempotencyKey: `durable-task:${parent.taskId}`, sideEffect: "read-only" }))).ok);
  const key = "model:a11-progress:dw-environment:a11-close:accepted";
  let effect: DurableEffectRecord = { intent: { key, stepId, attempt: 1, kind: "model-send", task: parentTask,
    expected: { runtime: "claude", roleId: parent.roleId } }, token: "exact-receipt", state: "unknown",
    result: { key, token: "exact-receipt", outcome: "unknown", evidence: "Original turn opened", result: { turnId: "parent-wake" } } };
  const actual: RuntimeReportSnapshotV1 = { version: 1, reportId: "a11-parent-result", taskId: parent.taskId,
    source: { roleId: parent.roleId, runtime: "claude", turnId: "parent-wake" }, status: "completed", origin: "submitted-report",
    at: new Date().toISOString(), evidenceOmitted: 0, evidence: [],
    summary: { text: children.map(child => `${child.taskId} at ${child.commitOid}`).join("; "), truncated: false, redacted: false } };
  let report = { ...actual, status: "failed", origin: "terminal-fallback" } as RuntimeReportSnapshotV1;
  let admitted = 0;
  const store = {
    listEffects: (_ref: typeof ref, kind: string) => kind === "model-send" ? [effect] : [], listCapabilityEvents: () => [],
    settleEffect: (_ref: typeof ref, result: NonNullable<DurableEffectRecord["result"]>) => {
      assert.equal(result.result?.turnId, "parent-wake");
      effect = { ...effect, state: "succeeded", result };
      return { ok: true };
    },
    storeEvidence: () => ({ ok: true, value: { path: `ans-evidence/${"e".repeat(64)}`, sha256: "e".repeat(64) } }),
    submitCapability: async (_ref: typeof ref, event: DurableCapabilityEvent) => {
      assert.equal(effect.state, "succeeded");
      assert.equal(event.input.kind, "task-report");
      assert.equal(event.source.originId, "parent-wake");
      assert.equal(event.source.parentTaskId, parent.taskId);
      admitted++;
      return { ok: true, value: { key: event.key, state: "pending" } };
    },
  };
  const deps = { durableWorkflow: { store: async () => store }, readDurableReports: async () => [report] } as unknown as SessionManagerDeps;
  const handback = new Handback({} as HandbackRefs, {} as HandbackPorts, deps);
  await handback.resumeDurableReports(view, () => false);
  assert.equal(admitted, 0);
  assert.equal(effect.state, "unknown");
  report = actual;
  await handback.resumeDurableReports({ ...view, pendingTasks: [parent, children[0]!] }, () => false);
  assert.equal(admitted, 0);
  await handback.resumeDurableReports(view, () => false);
  assert.equal(admitted, 1);
  assert.equal((await readTaskState(projectRoot)).records.get(parent.taskId)?.reports.length, 1);
});
