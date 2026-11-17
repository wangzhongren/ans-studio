import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { createDesktopReleaseGitPort } from "../../../app/desktop/workflow-git.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, businessDb, daprdListener, fix, fixture, git, operatorReport, pathBModel, resourceRoot,
  sqliteSnapshot, successful, target, until, unwrap, write, type Log } from "./fixture.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Snapshot = ReturnType<typeof sqliteSnapshot>;
const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified Windows bundle resources", timeout: 240_000 };
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function factsOf(snapshot: Snapshot, kind: string) {
  return (snapshot.fact ?? []).map(row => JSON.parse(String(row.data))).filter(row => row.fact.kind === kind);
}

function mainReflog(f: Fixture) {
  return git(f.root, "reflog", "show", "--format=%H", "refs/heads/main").split(/\r?\n/);
}

function gitDiffDigest(f: Fixture, from: string, to: string) {
  const names = git(f.root, "diff", "--name-status", "-z", from, to);
  const stat = git(f.root, "diff", "--stat", "--no-color", from, to);
  return sha256(Buffer.from(`${names}\n${stat}`));
}

function receipts(f: Fixture, deliveryId: string) {
  return businessDb(f, db => db.prepare("SELECT * FROM delivery_receipt WHERE delivery_id=?").all(deliveryId));
}

function interruptMergeSettlement(f: Fixture, instanceId: string) {
  // Only the isolated fixture ledger is touched. Force rollback at the durable record
  // boundary after actual Git, before a success effect, release fact or delivery can exist.
  assert.match(instanceId, /^dw-[a-f0-9]+$/);
  businessDb(f, db => db.exec(`
    CREATE TRIGGER w5_interrupt_merge_settlement BEFORE UPDATE OF state ON effect
    WHEN NEW.instance_id = '${instanceId}' AND NEW.business_key LIKE 'release-merge:%' AND NEW.state = 'succeeded'
    BEGIN SELECT RAISE(ABORT, 'w5-interrupt-after-git-before-effect'); END;
  `), true);
}

async function checkScope(f: Fixture, instanceId: string, snapshot: Snapshot) {
  assert.equal(snapshot.scope_decision?.length, 1);
  const scopeRow = snapshot.scope_decision[0];
  const scope = JSON.parse(String(scopeRow.data));
  assert.equal(scopeRow.kind, "change.scope-decided");
  assert.equal(scope.kind, "change.scope-decided");
  assert.equal(scopeRow.id, scope.id);
  assert.equal(factsOf(snapshot, "b3-advance").length, 1);
  const [{ fact: b3 }] = factsOf(snapshot, "b3-advance");
  const workerReports = factsOf(snapshot, "task-report");
  const b1 = workerReports.find(row => row.fact.key === b3.reportKey)?.fact;
  assert.ok(b1);
  assert.equal(b1.task.stage, "B1");
  assert.equal(b1.task.stageAttempt, 1);
  assert.equal(scopeRow.request_key, b3.key);
  assert.deepEqual(scope.b3Request, { key: b3.key, sourceTaskId: b3.sourceTaskId, digest: b3.requestDigest });
  assert.deepEqual(scope.b1Report, { key: b1.key, attempt: 1, ...b1.evidence });
  const report = businessDb(f, db => db.prepare("SELECT content FROM evidence WHERE instance_id=? AND digest=?").get(instanceId, b1.evidence.sha256));
  assert.ok(report?.content instanceof Uint8Array);
  assert.equal(sha256(report.content), b1.evidence.sha256);
  const evidence = JSON.parse(Buffer.from(report.content).toString("utf8"));
  assert.ok(evidence.artifacts.some((artifact: { path: string; sha256: string }) => artifact.path === analysis));
  const analysisFileSha = sha256(await readFile(path.join(f.root, analysis)));
  assert.equal(evidence.artifacts.find((artifact: { path: string }) => artifact.path === analysis)?.sha256, analysisFileSha);
  assert.equal(scope.baseline.oid, f.baselineOid);
  assert.equal(scope.baseline.branch, `ans/task/${instanceId}`);
  assert.equal(scope.candidateSource, "requestedEvidence");
  assert.deepEqual(scope.candidates, [target]);
  assert.deepEqual(scope.writeSets, [{ roleId: "worker", paths: [target] }]);
  assert.equal(scope.reason, b3.reason);
  return { scope, b3, b1 };
}

test("Windows B2 audit and B4 delivery recover from the real merge without a second Git effect", native, async t => {
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const f = await fixture();
  log("fixture", f);
  let instanceId = "";
  let originalB3: { sourceTaskId: string; digest: string } | undefined;
  let handle: Awaited<ReturnType<typeof app>>;
  const model = pathBModel(f, () => instanceId, log, {
    async beforeScope(turn, request) {
      const invalid = await turn.call("dispatch_task", { ...request, requestedEvidence: ["src/unowned.ts"] });
      assert.equal(invalid.ok, false);
      assert.match(invalid.message, /b-change-scope-invalid/);
      const snapshot = sqliteSnapshot(f, instanceId);
      assert.equal(snapshot.scope_decision?.length, 0);
      assert.equal(factsOf(snapshot, "b3-advance").length, 0);
      log("invalid-scope-rejected-without-audit", { invalid, counts: { scope: snapshot.scope_decision.length, advance: 0 } });
    },
    async afterScope(turn, request) {
      assert.ok(turn.turnId);
      assert.equal(typeof request.task, "string");
      originalB3 = { sourceTaskId: turn.turnId, digest: sha256(Buffer.from(String(request.task))) };
      await successful(turn, "dispatch_task", request);
      const conflicting = await turn.call("dispatch_task", { ...request, task: "A different B3 request under the same scope operation" });
      assert.equal(conflicting.ok, false);
      assert.match(conflicting.message, /fact-key-conflict/);
      handle.simulateNetwork(false);
      log("scope-duplicate-and-conflict", { conflicting, request });
    },
  });
  handle = await app(f, model, log);
  t.after(() => handle.close());
  const projectRoot = f.root;
  const start = { projectRoot, enabled: true, definitionId: "path-b", requestId: "w5-audit-delivery-rework",
    summary: "Fix the legacy-path collision threshold and show the local delivery" };
  const started = unwrap(await handle.startViaChief(start));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  const selector = { projectRoot, instanceId };
  const projection = async () => unwrap(await handle.desktop.getDurableWorkflowProjection(selector));
  await until("B3 parent request saved while model transport is offline", async () => {
    const tasks = await readTaskState(projectRoot);
    return [...tasks.records.values()].find(row => row.created?.stage === "B3" && row.created.taskKind === "stage-request");
  }, model.errors);
  assert.equal(model.runs.get("convener"), 2);
  assert.equal(model.runs.get("worker"), 1);
  const scopeBefore = await checkScope(f, instanceId, sqliteSnapshot(f, instanceId));
  assert.ok(originalB3);
  assert.equal(scopeBefore.scope.b3Request.sourceTaskId, originalB3.sourceTaskId);
  assert.equal(scopeBefore.scope.b3Request.digest, originalB3.digest);
  assert.deepEqual((await projection()).instance?.scopeDecision, scopeBefore.scope);
  const firstHost = await daprdListener(f);
  assert.ok(firstHost);
  log("audited-scope-before-restart", { scopeBefore, firstHost, projection: await projection() });
  await handle.close();
  handle = await app(f, model, log);
  assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(selector)).instance?.instanceId, instanceId);
  const card = await until("original workflow presents B4 approval", async () => [...handle.cards.values()][0], model.errors);
  const resumedHost = await daprdListener(f);
  assert.ok(resumedHost && resumedHost.pid !== firstHost.pid);
  assert.deepEqual(await checkScope(f, instanceId, sqliteSnapshot(f, instanceId)), scopeBefore);
  assert.equal(git(projectRoot, "rev-parse", "main"), f.baselineOid);
  assert.equal((await projection()).instance?.delivery, undefined);

  interruptMergeSettlement(f, instanceId);
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
  const mainOid = await until("actual Git merge happened before the blocked SQLite write", async () => {
    const head = git(projectRoot, "rev-parse", "main");
    if (head === f.baselineOid) return;
    const { controlPlane } = await projection();
    return controlPlane.state === "failed" ? head : undefined;
  }, model.errors);
  const interrupted = sqliteSnapshot(f, instanceId);
  const releaseRows = interrupted.effect.filter(row => String(row.business_key).startsWith("release-merge:"));
  assert.equal(releaseRows.length, 1);
  assert.equal(releaseRows[0].state, "claimed");
  assert.equal(factsOf(interrupted, "release-merged").length, 0);
  assert.equal(interrupted.delivery_note?.length, 0);
  assert.equal((await projection()).instance?.delivery, undefined);
  const gitBefore = mainReflog(f);
  log("git-succeeded-before-sqlite-settlement", { mainOid, gitBefore, releaseRows, projection: await projection(), resumedHost });

  await handle.close();
  businessDb(f, db => db.exec("DROP TRIGGER w5_interrupt_merge_settlement"), true);
  handle = await app(f, model, log);
  const pending = await until("recovered local delivery is pending", async () => {
    const { instance } = await projection();
    if (instance?.status === "delivered" && instance.delivery?.state === "pending") return instance.delivery;
  }, model.errors);
  const recovered = sqliteSnapshot(f, instanceId);
  assert.equal(recovered.delivery_note.length, 1);
  assert.notEqual(pending.id, card.id);
  assert.equal(factsOf(recovered, "release-merged").length, 1);
  assert.equal(factsOf(recovered, "release-merged")[0].fact.closed, true);
  assert.equal(recovered.effect.filter(row => String(row.business_key).startsWith("release-merge:") && row.state === "succeeded").length, 1);
  assert.deepEqual(mainReflog(f), gitBefore);
  assert.equal(gitBefore.filter(oid => oid === mainOid).length, 1);
  const parents = git(projectRoot, "rev-list", "--parents", "-n", "1", mainOid).split(" ");
  assert.deepEqual(parents.slice(0, 2), [mainOid, f.baselineOid]);
  assert.equal(parents.length, 3);
  assert.equal(git(projectRoot, "diff", "--name-only", f.baselineOid, mainOid), target);
  const diffDigest = gitDiffDigest(f, f.baselineOid, mainOid);
  assert.deepEqual(Object.fromEntries(model.runs), { chief: 2, convener: 4, worker: 2 });
  log("only-original-merge-recovered", { pending, parents, gitBefore, recovered });

  // Model a legacy v1 store by stripping only the two new records after shutdown.
  // Keep the real Git merge, original release fact, scope, evidence, and Workflow history.
  assert.equal(receipts(f, pending.id).length, 0);
  await handle.close();
  businessDb(f, db => {
    db.exec("BEGIN IMMEDIATE");
    try {
      assert.equal(db.prepare("DELETE FROM delivery_note WHERE instance_id=?").run(instanceId).changes, 1);
      assert.equal(db.prepare("DELETE FROM scope_decision WHERE instance_id=?").run(instanceId).changes, 1);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }, true);
  const historical = sqliteSnapshot(f, instanceId);
  assert.equal(historical.scope_decision.length, 0);
  assert.equal(historical.delivery_note.length, 0);
  assert.equal(factsOf(historical, "b3-advance").length, 1);
  assert.equal(factsOf(historical, "release-merged").length, 1);
  log("history-fixture-removed-only-new-rows", { originalScope: scopeBefore.scope.id, originalDelivery: pending.id, historical, gitBefore });
  handle = await app(f, model, log);
  const backfilled = await until("legacy terminal projection backfills original audit and pending note", async () => {
    const { instance } = await projection();
    if (instance?.scopeDecision && instance.delivery) return instance;
  }, model.errors);
  assert.equal(backfilled.scopeDecision?.id, scopeBefore.scope.id);
  assert.equal(backfilled.delivery?.id, pending.id);
  assert.equal(backfilled.delivery?.state, "pending");
  assert.equal(backfilled.delivery?.deliveredAt, undefined);
  assert.equal(receipts(f, pending.id).length, 0);
  const afterBackfill = sqliteSnapshot(f, instanceId);
  await checkScope(f, instanceId, afterBackfill);
  assert.equal(afterBackfill.delivery_note.length, 1);
  assert.deepEqual(mainReflog(f), gitBefore);
  log("historical-records-backfilled-without-delivery", { backfilled, afterBackfill, gitBefore });

  const delivery = { ...selector, deliveryId: pending.id };
  assert.equal((await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: "invalid" })).ok, false);
  assert.equal((await handle.desktop.readDurableWorkflowDelivery({ ...delivery, projectRoot: path.join(f.directory, "unselected") })).ok, false);
  assert.equal(receipts(f, pending.id).length, 0);
  const viewing = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
  assert.equal(viewing.delivery.id, pending.id);
  assert.equal(viewing.delivery.state, "pending");
  assert.equal(viewing.delivery.releaseRequestId, card.id);
  assert.equal(viewing.delivery.mergeOid, mainOid);
  assert.deepEqual(viewing.delivery.files, [target]);
  assert.equal(viewing.delivery.diffDigest, diffDigest);
  assert.match(viewing.delivery.operatorReport.sha256, /^[a-f0-9]{64}$/);
  assert.equal(viewing.delivery.runtimeVerification, "not-independently-verified");
  const reportFile = viewing.delivery.operatorReportArtifacts?.find(artifact => artifact.path === operatorReport);
  assert.equal(reportFile?.sha256, sha256(await readFile(path.join(f.root, operatorReport))));
  assert.equal((await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, deliveryId: "wrong-delivery", viewToken: viewing.viewToken })).ok, false);
  assert.equal(receipts(f, pending.id).length, 0);
  assert.equal((await projection()).instance?.delivery?.state, "pending");
  log("read-delivery-keeps-pending", { detail: viewing.delivery, projection: await projection() });

  const acknowledgment = { ...delivery, viewToken: viewing.viewToken };
  const delivered = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery(acknowledgment));
  assert.equal(delivered.state, "delivered");
  assert.ok(delivered.deliveredAt);
  assert.equal(unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery(acknowledgment)).deliveredAt, delivered.deliveredAt);
  assert.equal(receipts(f, pending.id).length, 1);
  await handle.close();
  handle = await app(f, model, log);
  assert.equal((await handle.desktop.acknowledgeDurableWorkflowDelivery(acknowledgment)).ok, false);
  const newViewing = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
  assert.equal(newViewing.delivery.state, "delivered");
  const replayed = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: newViewing.viewToken }));
  assert.equal(replayed.deliveredAt, delivered.deliveredAt);
  assert.equal(receipts(f, pending.id).length, 1);
  assert.deepEqual(mainReflog(f), gitBefore);
  log("delivery-acknowledgment-replayed-once", { delivered, replayed, receipt: receipts(f, pending.id), gitBefore });
});

test("Windows B4 customer rejection cannot create a note, delivery receipt or merge", native, async t => {
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const f = await fixture();
  log("fixture", f);
  let instanceId = "";
  const projectRoot = f.root;
  const model = pathBModel(f, () => instanceId, log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const started = unwrap(await handle.startViaChief({ projectRoot, enabled: true, definitionId: "path-b",
    requestId: "w5-reject-delivery-rework", summary: "Review this local candidate and decline merging it" }));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  const card = await until("B4 customer card before explicit rejection", async () => [...handle.cards.values()][0], model.errors);
  const before = mainReflog(f);
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[1])).ok, true);
  const stopped = await until("workflow stopped after actual customer rejection", async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ projectRoot, instanceId }));
    if (view.instance?.status === "stopped") return view.instance;
  }, model.errors);
  const snapshot = sqliteSnapshot(f, instanceId);
  await checkScope(f, instanceId, snapshot);
  assert.equal(stopped.delivery, undefined);
  assert.equal(snapshot.delivery_note.length, 0);
  assert.equal(factsOf(snapshot, "release-merged").length, 0);
  assert.equal(snapshot.effect.filter(row => String(row.business_key).startsWith("release-merge:")).length, 0);
  assert.equal(git(projectRoot, "rev-parse", "main"), f.baselineOid);
  assert.deepEqual(mainReflog(f), before);
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[1])).ok, true);
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0])).ok, false);
  log("rejected-without-merge-or-delivery", { stopped, snapshot, before });
});

test("Windows B4 records the actual subset when main independently has the first approved change", native, async t => {
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const f = await fixture();
  const projectRoot = f.root;
  const companion = "src/core/w5-companion.ts";
  await write(projectRoot, companion, "export const COMPANION = 1;\n");
  git(projectRoot, "add", "--", companion);
  git(projectRoot, "commit", "-m", "Add the second isolated baseline file");
  f.baselineOid = git(projectRoot, "rev-parse", "main");
  log("fixture", f);
  let instanceId = "";
  let independentMain: string | undefined;
  const model = pathBModel(f, () => instanceId, log, {
    changes: [{ path: target, content: fix }, { path: companion, content: "export const COMPANION = 2;\n" }],
    async afterImplementationReport() {
      // The role's commit is done on the task branch. The application has yet to finish
      // the report or form a release preview. An independent actor changes this isolated main.
      const originalBranch = git(projectRoot, "symbolic-ref", "--short", "HEAD");
      assert.equal(originalBranch, `ans/task/${instanceId}`);
      git(projectRoot, "-c", "core.autocrlf=false", "switch", "main");
      assert.equal(git(projectRoot, "rev-parse", "HEAD"), f.baselineOid);
      await write(projectRoot, target, fix);
      git(projectRoot, "-c", "core.autocrlf=false", "add", "--", target);
      git(projectRoot, "-c", "core.autocrlf=false", "commit", "-m", "Independent main already makes the same first change");
      independentMain = git(projectRoot, "rev-parse", "main");
      git(projectRoot, "-c", "core.autocrlf=false", "switch", originalBranch);
      const inspected = await createDesktopReleaseGitPort().inspectRepository({ projectRoot });
      assert.ok(inspected.ok, JSON.stringify(inspected));
      assert.equal(inspected.facts.trackedChanges, 0);
      assert.deepEqual(inspected.facts.untracked, []);
      log("independent-main-already-has-first-change", { independentMain, originalBranch, baseline: f.baselineOid });
    },
  });
  let handle = await app(f, model, log);
  t.after(() => handle.close());
  const started = unwrap(await handle.startViaChief({ projectRoot, enabled: true, definitionId: "path-b",
    requestId: "w5-b4-actual-subset", summary: "Fix both thresholds and compare the approved and actual merge" }));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  const selector = { projectRoot, instanceId };
  const projection = () => handle.desktop.getDurableWorkflowProjection(selector).then(unwrap);
  const card = await until("trusted B4 approval showing the two authorized paths", async () => [...handle.cards.values()][0], model.errors);
  assert.ok(independentMain);
  const [{ fact: preview }] = factsOf(sqliteSnapshot(f, instanceId), "release-preview");
  assert.equal(preview.snapshot.mainOid, independentMain);
  assert.equal(preview.snapshot.baselineOid, f.baselineOid);
  assert.deepEqual([...preview.snapshot.files].sort(), [target, companion].sort());
  assert.ok(card.request.preview?.includes(target));
  assert.ok(card.request.preview?.includes(companion));
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
  const mergeOid = await until("main receives the actual merge of an approved subset", async () => {
    const current = git(projectRoot, "rev-parse", "main");
    return current === independentMain ? undefined : current;
  }, model.errors);
  const actualDigest = gitDiffDigest(f, independentMain, mergeOid);
  assert.equal(git(projectRoot, "diff", "--name-only", independentMain, mergeOid), companion);
  assert.notEqual(actualDigest, preview.snapshot.diffDigest);
  assert.deepEqual(git(projectRoot, "rev-list", "--parents", "-n", "1", mergeOid).split(" "), [mergeOid, independentMain, preview.snapshot.tipOid]);
  const afterMerge = mainReflog(f);
  assert.equal(afterMerge.filter(oid => oid === mergeOid).length, 1);
  log("approved-both-but-actual-git-merged-second-only", { preview: preview.snapshot, actual: { files: [companion], actualDigest, mergeOid }, afterMerge });
  try {
    const note = await until("one pending explanation for the verified actual subset", async () => {
      const { instance } = await projection();
      if (instance?.status === "delivered" && instance.delivery?.state === "pending") return instance.delivery;
    }, model.errors);
    const delivery = { ...selector, deliveryId: note.id };
    const viewing = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
    assert.deepEqual(viewing.delivery.files, [companion]);
    assert.equal(viewing.delivery.diffDigest, actualDigest);
    assert.equal(viewing.delivery.mergeOid, mergeOid);
    assert.equal(viewing.delivery.releaseRequestId, card.id);
    assert.equal(receipts(f, note.id).length, 0);
    const proof = sqliteSnapshot(f, instanceId);
    const mergeEffects = proof.effect.filter(row => String(row.business_key).startsWith("release-merge:"));
    assert.equal(mergeEffects.length, 1);
    assert.equal(mergeEffects[0].state, "succeeded");
    assert.equal(factsOf(proof, "release-merged").length, 1);
    assert.equal(factsOf(proof, "release-merged")[0].fact.closed, true);
    assert.equal(proof.delivery_note.length, 1);
    const delivered = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: viewing.viewToken }));
    assert.equal(delivered.state, "delivered");
    await handle.close();
    handle = await app(f, model, log);
    const revisited = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
    assert.equal(revisited.delivery.deliveredAt, delivered.deliveredAt);
    assert.deepEqual(mainReflog(f), afterMerge);
    assert.equal(receipts(f, note.id).length, 1);
    const reopened = sqliteSnapshot(f, instanceId);
    assert.deepEqual(reopened.effect.filter(row => String(row.business_key).startsWith("release-merge:")), mergeEffects);
    assert.deepEqual(factsOf(reopened, "release-merged"), factsOf(proof, "release-merged"));
    log("actual-subset-note-delivered-after-one-merge", { delivered: revisited.delivery, afterMerge });
  } finally {
    const snapshot = sqliteSnapshot(f, instanceId);
    log("actual-subset-final-state", { projection: await projection(), mergeEffects: snapshot.effect.filter(row => String(row.business_key).startsWith("release-merge:")),
      releaseFacts: factsOf(snapshot, "release-merged"), deliveryNotes: snapshot.delivery_note });
  }
});
