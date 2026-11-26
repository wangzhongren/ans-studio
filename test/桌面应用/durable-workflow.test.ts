import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { buildMergeMainCardRequest, createCustomerInputChannel, MERGE_MAIN_OPTION_IDS } from "../../app/desktop/customer-input.ts";
import { DesktopDurableWorkflow } from "../../app/desktop/durable-workflow.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { FixedWorkflowRelease } from "../../app/desktop/session/fixed-workflow/release-merge.ts";
import { createDesktopTaskGitShellPort, mergeDurableMain, previewDurableMerge, verifyDurableMerge, verifyDurableTaskCommit } from "../../app/desktop/workflow-git.ts";
import { DURABLE_ACTIVITY_CONTRACT, DURABLE_EXECUTOR, DURABLE_EVIDENCE_AUDIT_EXECUTOR, DURABLE_EVIDENCE_AUDIT_ACTIVITY_CONTRACT,
  DURABLE_GRAPH_EXECUTOR, DURABLE_GRAPH_ACTIVITY_CONTRACT, type DurableDefinitionSnapshot, type DurableEffectOutcome, type DurableEffectRecord,
  type DurableFact, type DurableProjection, type DurableReleaseSnapshot, type DurableResult } from "../../src/model/durable-workflow.ts";
import { DurableLedger, repositoryIdentity, workspaceIdentity } from "../../src/provider/durable-workflow/public.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function repository(t: TestContext) {
  const temporary = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, "ans-durable-desktop-"));
  t.after(async () => {
    assert.equal(path.dirname(root), temporary);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "ANS desktop test");
  git(root, "config", "user.email", "desktop-test@example.invalid");
  await fs.writeFile(path.join(root, ".gitignore"), ".ans/\n");
  await fs.writeFile(path.join(root, "feature.txt"), "before\n");
  git(root, "add", "--", ".gitignore", "feature.txt");
  git(root, "commit", "-m", "fixture");
  const baselineOid = git(root, "rev-parse", "HEAD");
  const branch = "ans/task/dw-test";
  git(root, "switch", "-c", branch);
  return { root, baselineOid, branch };
}

test("old direct workflow IPC always requires a Chief proposal and customer confirmation", async () => {
  const desktop = createDesktopInterface({
    envFilePath: path.join(os.tmpdir(), "ans-unused-workflow-env"),
    pickDirectory: async () => null,
    emitEvent: () => {},
  });
  const response = await desktop.startDurableWorkflow({
    projectRoot: os.tmpdir(), enabled: true, definitionId: "path-b", requestId: "id", summary: "Change",
  });
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.code, "workflow-start-confirmation-required");
  desktop.disposeProjectDocuments();
});

test("only an explicit customer choice reaches durable storage and IPC waits for the receipt", async () => {
  const presented: string[] = [];
  const channel = createCustomerInputChannel({ operatorId: "customer", presenter: payload => { presented.push(payload.id); } });
  const context = { roleId: "chief", requestId: "durable-release-1", projectRoot: "/fixture" };
  const card = buildMergeMainCardRequest({ workflowId: "dw-test", flowId: "test", releaseId: "rel-1",
    mainBaseOid: "main", branchTipOid: "tip", branchBaseOid: "base", nonMainBaseline: false,
    fileCount: 1, diffStat: "feature.txt", mergeKind: "merge", highRiskNotes: [] });
  const barrier = Promise.withResolvers<void>();
  let stored: "approve" | "reject" | undefined;
  const outcome = channel.customerInput(card, { ...context, persistReleaseDecision: async choice => {
    await barrier.promise;
    if (stored !== undefined && stored !== choice) return { ok: false, message: "Opposite decision was already recorded." };
    stored = choice;
    return { ok: true, decisionId: "decision-one" };
  } });
  assert.deepEqual(presented, [context.requestId]);
  const approve = { id: context.requestId, decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[0]] } };
  assert.equal(channel.respond(approve).ok, false);
  assert.equal((await channel.respondDurable({ id: context.requestId, decision: { kind: "choice", cancelled: true } }))?.ok, false);
  let returned = false;
  const submitting = channel.respondDurable(approve).then(reply => { returned = true; return reply; });
  await Promise.resolve();
  assert.equal(returned, false);
  assert.equal(channel.pendingCount(), 1);
  barrier.resolve();
  assert.deepEqual(await submitting, { ok: true });
  assert.deepEqual(await channel.respondDurable(approve), { ok: true });
  assert.equal((await channel.respondDurable({ id: context.requestId,
    decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[1]] } }))?.ok, false);
  assert.equal((await outcome)?.outcome, "answered");
  assert.equal(channel.pendingCount(), 0);
});

test("closing the window leaves the durable approval unanswered and the same card can be presented again", async () => {
  const card = buildMergeMainCardRequest({ workflowId: "dw-test", flowId: "test", releaseId: "rel-2",
    mainBaseOid: "main", branchTipOid: "tip", branchBaseOid: "base", nonMainBaseline: false,
    fileCount: 1, diffStat: "feature.txt", mergeKind: "merge", highRiskNotes: [] });
  let persisted = 0;
  const present = (observe: (id: string) => void) => {
    const channel = createCustomerInputChannel({ operatorId: "customer", presenter: payload => observe(payload.id) });
    const outcome = channel.customerInput(card, { roleId: "chief", requestId: "same-card", persistReleaseDecision: async () => {
      persisted++;
      return { ok: true, decisionId: "same-record" };
    } });
    return { channel, outcome };
  };
  const ids: string[] = [];
  const first = present(id => ids.push(id));
  first.channel.rejectAllPending("window closed");
  await first.outcome;
  assert.equal(persisted, 0);
  const second = present(id => ids.push(id));
  assert.deepEqual(ids, ["same-card", "same-card"]);
  assert.equal((await second.channel.respondDurable({ id: "same-card", decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[1]] } }))?.ok, true);
  assert.equal(persisted, 1);
  await second.outcome;
});

test("the actual Git commit and merge use their effect claim and can be verified from repo facts", async t => {
  const { root, baselineOid, branch } = await repository(t);
  await fs.writeFile(path.join(root, "feature.txt"), "after\n");
  const commits: Array<{ expected: Readonly<Record<string, string | readonly string[]>>; result: unknown }> = [];
  const port = createDesktopTaskGitShellPort(root, async input => ({
    ok: true,
    value: { execute: true, finish: async (outcome, _evidence, result) => {
      assert.equal(outcome, "succeeded");
      if (input.kind === "task-commit") commits.push({ expected: input.expected, result });
    } },
  }));
  assert.equal((await port.add(["feature.txt"])).exitCode, 0);
  const unlock = port.acquireCriticalSection("test-authorized-task");
  assert.ok(unlock);
  try {
    assert.equal((await port.commit(["git", "commit", "-m", "Implement feature"])).exitCode, 0);
  } finally { unlock(); }
  assert.equal(commits.length, 1);
  assert.deepEqual(await verifyDurableTaskCommit(root, commits[0]!.expected), commits[0]!.result);
  const preview = await previewDurableMerge({ projectRoot: root, branch, baselineOid });
  assert.ok(preview.ok);
  const { mainOid, tipOid, diffDigest, files } = preview.value;
  const snapshot: DurableReleaseSnapshot = { mainOid, tipOid, diffDigest, files, branch, baselineOid,
    b3CloseKey: "close-key", operatorReport: { path: "ans-evidence/accepted", sha256: "b".repeat(64) } };
  const release = { projectRoot: root, workflowId: "dw-test", flowId: "test", requestId: "decision-one", snapshot };
  const binding = { requestId: release.requestId, digest: diffDigest, generation: 1 };
  const request = { ...binding, logicalKey: "release", releaseId: "rel", snapshot,
    decision: { id: release.requestId, action: "approve" as const, at: new Date().toISOString(), source: "delegated-chief" as const,
      provenance: { ...binding, source: "delegated-chief" as const, delegationRevision: 3, reason: "Verified candidate" } } };
  let entered = 0;
  const wrong = { ...request, decision: { ...request.decision, provenance: { ...request.decision.provenance, requestId: "another-card" } } };
  const invalid = await mergeDurableMain({ ...release, release: wrong, claim: async () => assert.fail("Invalid approval must not reach Git") });
  assert.equal(invalid.ok, false);
  const refused = await mergeDurableMain({ ...release, release: request, claim: async () => {
    entered++;
    return { ok: false, code: "stale-test-approval", message: "Approval replaced." };
  } });
  assert.equal(refused.ok, false);
  assert.equal(git(root, "rev-parse", "main"), mainOid);
  assert.equal(git(root, "branch", "--show-current"), branch);
  const merged = await mergeDurableMain({ ...release, release: request, claim: async () => { entered++; return { ok: true }; } });
  assert.ok(merged.ok);
  assert.equal(entered, 2);
  const actual = await verifyDurableMerge({ ...release, writePaths: files });
  assert.ok(actual.ok);
  assert.equal(actual.value.mainOid, git(root, "rev-parse", "main"));
  assert.deepEqual(actual.value.files, ["feature.txt"]);
  assert.equal((await verifyDurableMerge({ ...release, requestId: "wrong-request", writePaths: files })).ok, false);

  await t.test("a verified merge retries failed admission by the same fact and never merges again", async () => {
    const durable = new DesktopDurableWorkflow({ userDataRoot: path.join(root, ".ans", "desktop-test"), resourceRoot: root });
    const ref = { projectId: "fixture", instanceId: release.workflowId, definitionId: "path-b", definitionVersion: 1,
      definitionDigest: diffDigest, executor: DURABLE_EXECUTOR, activityContract: DURABLE_ACTIVITY_CONTRACT };
    const address = { stepId: "release", attempt: 1 };
    const projection: DurableProjection = {
      ...address, ref, projectRoot: root, stepName: "Release", definitionName: "Path B", status: "waiting",
      action: "b4-customer-merge-main", engine: "healthy", pendingFacts: 0, metadata: {}, release: request,
      baseline: { branch, oid: baselineOid },
      scope: { stepId: "scope", attempt: 1, kind: "b3-advance", source: "chief", key: "scope", sourceTaskId: "chief-turn",
        requestDigest: diffDigest, b1Attempt: 1, reportKey: "analysis", baselineOid, candidateSource: "modulePaths",
        candidates: files, writeSets: [{ roleId: "owner", paths: files }], reason: "Fixture scope" },
      implementation: { stepId: "implement", attempt: 1, source: "convener", kind: "implementation-accepted", key: snapshot.b3CloseKey,
        task: { stage: "B3", stageAttempt: 1, executionAttempt: 1, parentTaskId: "parent", taskId: "task", roleId: "owner" },
        reportKey: "implementation-report", operatorReport: snapshot.operatorReport },
    };
    const effect: DurableEffectRecord = { intent: { ...address, key: "real-merge", kind: "release-merge", requestId: request.requestId },
      token: "merge-claim", state: "claimed" };
    const submitted: DurableFact[] = [];
    const blocks: string[] = [];
    const store = {
      listEffects: () => [effect],
      settleEffect: t.mock.fn((_ref: unknown, result: DurableEffectOutcome) => {
        effect.state = "succeeded";
        effect.result = result;
        return { ok: true };
      }),
      submit: async (_ref: unknown, fact: DurableFact) => {
        submitted.push(fact);
        return submitted.length === 1
          ? { ok: false, code: "fact-write-failed", message: "Fixture database temporarily unavailable" }
          : { ok: true, value: { key: fact.key, state: "pending" } };
      },
      block: (_ref: unknown, code: string, detail: string) => { blocks.push(`${code}: ${detail}`); },
    };
    t.mock.method(durable, "store", async () => store);
    type ReleaseParams = ConstructorParameters<typeof FixedWorkflowRelease>;
    const unexpectedSession = () => { throw new Error("Reconciliation must not open a role session."); };
    const handler = new FixedWorkflowRelease({} as ReleaseParams[0], {} as ReleaseParams[1], {
      durableWorkflow: durable,
      getRegisteredProjectLifecycle: () => ({ selectionId: "fixture", selectedRoot: root, projectRoot: root, selectedAt: request.decision.at,
        source: "native-directory-selection", listingGeneration: 1 }),
      openRoleSession: unexpectedSession,
      createPiAdapterFactory: unexpectedSession,
      createDemoAdapter: unexpectedSession,
      buildProjectConfig: unexpectedSession,
      getListing: () => undefined,
      emitEvent: () => {},
    });
    await handler.syncDurableRelease(projection);
    assert.deepEqual(blocks, ["fact-write-failed: Fixture database temporarily unavailable"]);
    assert.equal(store.settleEffect.mock.callCount(), 1);
    assert.equal(effect.result?.result?.mainOid, actual.value.mainOid);
    await handler.syncDurableRelease(projection);
    assert.deepEqual(submitted[0], submitted[1]);
    assert.equal(submitted.length, 2);
    assert.equal(store.settleEffect.mock.callCount(), 1);
    assert.equal(blocks.length, 1);
    assert.equal(git(root, "rev-parse", "main"), actual.value.mainOid);
  });
});

function accepted<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

function refused(result: DurableResult<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

test("project-state resolves only the sole active frozen declaration in the actual project and flow", async t => {
  const temporary = path.resolve(os.tmpdir());
  const fixture = await fs.mkdtemp(path.join(temporary, "ans-roster-context-"));
  const root = path.join(fixture, "current");
  const other = path.join(fixture, "other");
  await Promise.all([fs.mkdir(root), fs.mkdir(other)]);
  const userDataRoot = path.join(fixture, "user-data");
  const app = new DesktopDurableWorkflow({ userDataRoot, resourceRoot: root,
    presetRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  t.after(async () => {
    await app.close();
    assert.equal(path.dirname(fixture), temporary);
    await fs.rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const [workspace, neighbour] = await Promise.all([workspaceIdentity(root), workspaceIdentity(other)]);
  assert.equal(await app.evidenceCollectorRoleForProject(root)("racing"), undefined);
  assert.equal(await app.hasStoredBusiness(), false);
  const store = await app.store();
  const declared = accepted(await store.validateDefinition(root, "path-a", { source: "preset" }));
  const undeclared = accepted(await store.validateDefinition(root, "path-b", { source: "preset" }));
  assert.ok(declared.schema === 2 && declared.evidenceAudit?.collectorRoleId);
  const role = declared.evidenceAudit.collectorRoleId;
  const ledger = new DurableLedger(path.join(userDataRoot, "business"));
  try {
    // Persist isolated state fixtures to exercise the desktop lookup only. This test does not run workflow approval.
    const save = (name: string, definition: DurableDefinitionSnapshot, flowId: string | undefined,
      project = workspace, status: DurableProjection["status"] = "waiting", projectRoot = project.root, engine: DurableProjection["engine"] = "healthy", workflowOwned = true) => {
      const evidence = definition.schema === 2 && !!definition.evidenceAudit;
      ledger.save({ ref: { projectId: project.projectId, instanceId: `dw-${name}`, definitionId: definition.id, definitionVersion: definition.version,
        definitionDigest: definition.digest, executor: evidence ? DURABLE_EVIDENCE_AUDIT_EXECUTOR : DURABLE_GRAPH_EXECUTOR,
        activityContract: evidence ? DURABLE_EVIDENCE_AUDIT_ACTIVITY_CONTRACT : DURABLE_GRAPH_ACTIVITY_CONTRACT },
      definition, definitionSource: "preset", projectRoot, commonDir: project.repository?.commonDir ?? "",
      requestId: name, metadata: workflowOwned ? { workflowOwnedDispatch: "true" } : {}, stepId: definition.start, entry: 1, attempt: 1, status, engine,
      scheduled: true, scheduling: false, visits: {}, graph: { flowId, tasks: [], proofs: {} } });
    };
    save("racing-current", declared, "racing");
    save("racing-history", declared, "racing", workspace, "blocked");
    for (const engine of ["pending", "offline", "incompatible", "history-missing"] as const) {
      save(engine, declared, engine, workspace, "waiting", workspace.root, engine);
    }
    save("old-current", undeclared, "old");
    save("unbound-current", declared, undefined);
    save("unactivated", declared, "unactivated", workspace, "waiting", workspace.root, "healthy", false);
    save("different-project", declared, "only-there", neighbour);
    save("legacy-alias-shape", declared, "wrong-root", workspace, "waiting", neighbour.root);

    const proposedDefinition = path.join(root, "docs", "workflows", "path-a.yaml");
    await fs.mkdir(path.dirname(proposedDefinition), { recursive: true });
    const preset = await fs.readFile(new URL("../../docs/workflows/path-a.yaml", import.meta.url), "utf8");
    await fs.writeFile(proposedDefinition, preset.replace(`collectorRoleId: ${role}`, "collectorRoleId: unapproved-draft-collector"));
    const resolve = app.evidenceCollectorRoleForProject(root);
    assert.equal(await resolve("racing"), role);
    assert.equal(await resolve("pending"), role);
    assert.equal(await resolve("offline"), role);
    for (const flow of ["old", "racing-other", "", "only-there", "wrong-root", "incompatible", "history-missing", "unactivated"]) assert.equal(await resolve(flow), undefined, flow);
    assert.equal(await app.evidenceCollectorRoleForProject(other)("racing"), undefined);
    assert.equal(await app.evidenceCollectorRoleForProject(other)("only-there"), role);

    save("racing-conflict", undeclared, "racing");
    assert.equal(await app.evidenceCollectorRoleForProject(root)("racing"), undefined);
  } finally {
    ledger.close();
  }
});

test("a saved delivery is scoped to its selected project and the first open receipt survives reopening", async t => {
  let closeWindow: (() => Promise<void>) | undefined;
  const { root, baselineOid, branch } = await repository(t);
  const other = (await repository(t)).root;
  const repo = await repositoryIdentity(root);
  const userDataRoot = path.join(root, ".ans", "workflow-test");
  const at = "2026-11-17T09:00:00.000Z";
  const digest = "b".repeat(64);
  const instanceId = "dw-delivery-fixture";
  const deliveryId = "delivery-fixture";
  const releaseRequestId = "release-request-fixture";
  const ref = { projectId: repo.projectId, instanceId, definitionId: "path-b", definitionVersion: 1,
    definitionDigest: digest, executor: DURABLE_EXECUTOR, activityContract: DURABLE_ACTIVITY_CONTRACT };
  const report = { path: "ans-evidence/operator", sha256: digest };
  const snapshot: DurableReleaseSnapshot = { mainOid: baselineOid, tipOid: baselineOid, baselineOid, branch, files: ["feature.txt"],
    diffDigest: digest, b3CloseKey: "close", operatorReport: report };
  // Seed a finished ledger to isolate this test to desktop query and receipt behavior.
  const ledger = new DurableLedger(path.join(userDataRoot, "business"));
  try {
    ledger.transaction(() => {
      ledger.save({ ref, definition: { id: "path-b", name: "Path B", schema: 1, version: 1, digest,
        start: "done", steps: { done: { terminal: "delivered" } } }, projectRoot: repo.root, commonDir: repo.commonDir,
        requestId: "start", metadata: {}, stepId: "done", entry: 1, attempt: 1, status: "delivered", engine: "healthy",
        scheduled: true, scheduling: false, visits: {},
        release: { logicalKey: "release", releaseId: "rel", requestId: releaseRequestId, generation: 1, digest, snapshot,
          decision: { id: "approval", source: "customer", action: "approve", at } } });
      ledger.saveFact(instanceId, { fact: { key: "advance", stepId: "scope", attempt: 1, kind: "b3-advance", source: "chief",
        sourceTaskId: "chief-turn", requestDigest: digest, b1Attempt: 1, reportKey: "report", baselineOid, candidateSource: "modulePaths",
        candidates: ["feature.txt"], writeSets: [{ roleId: "owner", paths: ["feature.txt"] }], reason: "Confirmed scope" },
        receipt: { key: "advance", state: "consumed" }, fingerprint: digest });
      ledger.saveScopeDecision(instanceId, { kind: "change.scope-decided", id: "scope-fixture",
        b3Request: { key: "advance", sourceTaskId: "chief-turn", digest },
        b1Report: { ...report, key: "report", attempt: 1 }, baseline: { oid: baselineOid, branch },
        candidateSource: "modulePaths", candidates: ["feature.txt"], writeSets: [{ roleId: "owner", paths: ["feature.txt"] }],
        reason: "Confirmed scope", recordedAt: at });
      ledger.saveFact(instanceId, { fact: { key: "merge", stepId: "release", attempt: 1, kind: "release-merged", source: "host",
        requestId: releaseRequestId, effectKey: "merge-effect", mainOid: baselineOid, closed: true },
        receipt: { key: "merge", state: "consumed" }, fingerprint: digest });
      ledger.saveDelivery(instanceId, "merge", { id: deliveryId, state: "pending", releaseRequestId, mergeOid: baselineOid,
        files: ["feature.txt"], diffDigest: digest, operatorReport: report, runtimeVerification: "not-independently-verified", createdAt: at });
    });
  } finally {
    ledger.close();
  }
  const input = { projectRoot: root, instanceId, deliveryId };
  let projectToPick = root;
  const openWindow = async () => {
    await closeWindow?.();
    const durable = new DesktopDurableWorkflow({ userDataRoot, resourceRoot: root });
    const desktop = createDesktopInterface({
      durableWorkflow: durable, envFilePath: path.join(root, ".ans", "desktop-test-env"), pickDirectory: async () => projectToPick, emitEvent: () => {},
    });
    closeWindow = async () => {
      desktop.disposeProjectDocuments();
      await durable.close();
    };
    assert.equal(await desktop.pickProject(), projectToPick);
    await desktop.listProject({ projectRoot: projectToPick });
    return desktop;
  };
  try {
    const first = await openWindow();
    const original = accepted(await first.getDurableWorkflowProjection(input)).instance;
    assert.equal(original?.status, "delivered");
    assert.equal(original.delivery?.state, "pending");
    assert.equal(original.scopeDecision?.kind, "change.scope-decided");
    assert.equal(original.scopeDecision.b3Request.sourceTaskId, "chief-turn");
    refused(await first.readDurableWorkflowDelivery({ ...input, instanceId: "../invalid" }), "workflow-delivery-invalid");
    refused(await first.readDurableWorkflowDelivery({ ...input, deliveryId: "not-generated" }), "workflow-delivery-not-found");
    refused(await first.acknowledgeDurableWorkflowDelivery({ ...input, viewToken: "unopened" }), "workflow-delivery-not-opened");
    const opened = accepted(await first.readDurableWorkflowDelivery(input));
    assert.deepEqual(opened.delivery.files, ["feature.txt"]);
    assert.equal(opened.delivery.runtimeVerification, "not-independently-verified");
    assert.equal(accepted(await first.getDurableWorkflowProjection(input)).instance?.delivery?.state, "pending");
    refused(await first.acknowledgeDurableWorkflowDelivery({ ...input, projectRoot: other, viewToken: opened.viewToken }), "workflow-project-unselected");
    refused(await first.acknowledgeDurableWorkflowDelivery({ ...input, instanceId: "different", viewToken: opened.viewToken }), "workflow-delivery-not-opened");

    const reopened = await openWindow();
    assert.equal(accepted(await reopened.getDurableWorkflowProjection(input)).instance?.delivery?.state, "pending");
    refused(await reopened.acknowledgeDurableWorkflowDelivery({ ...input, viewToken: opened.viewToken }), "workflow-delivery-not-opened");
    const fresh = accepted(await reopened.readDurableWorkflowDelivery(input));
    const viewed = { ...input, viewToken: fresh.viewToken };
    const delivered = accepted(await reopened.acknowledgeDurableWorkflowDelivery(viewed));
    assert.equal(delivered.state, "delivered");
    assert.ok(delivered.deliveredAt);
    assert.deepEqual(accepted(await reopened.acknowledgeDurableWorkflowDelivery(viewed)), delivered);

    const restarted = await openWindow();
    assert.deepEqual(accepted(await restarted.getDurableWorkflowProjection(input)).instance?.delivery, delivered);
    const afterRestart = accepted(await restarted.readDurableWorkflowDelivery(input));
    assert.deepEqual(accepted(await restarted.acknowledgeDurableWorkflowDelivery({ ...input, viewToken: afterRestart.viewToken })), delivered);
    projectToPick = other;
    assert.equal(await restarted.pickProject(), other);
    await restarted.listProject({ projectRoot: other });
    refused(await restarted.readDurableWorkflowDelivery({ ...input, projectRoot: other }), "workflow-delivery-not-found");
  } finally {
    await closeWindow?.();
  }
});
