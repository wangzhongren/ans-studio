import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { DurableFact, DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git } from './fixture.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const file = 'change.txt';
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

async function enterScope(t: TestContext, files = [file]) {
  const { project, dataDir, cleanup } = await fixture(t);
  const role = join(project, '角色卡', 'owner');
  await mkdir(role, { recursive: true });
  await writeFile(join(role, 'boundary.md'), [
    '# Owner\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |',
    ...files.map(path => '| 单文件 | ' + path + ' | scope |'),
    '',
  ].join('\n'));
  let service = new DurableWorkflowService(dataDir);
  const db = new DatabaseSync(join(dataDir, 'ans-workflow.sqlite'));
  db.exec('PRAGMA foreign_keys=ON;');
  cleanup.push(() => { db.close(); service.close(); });
  const ref = unwrap(await service.start({ projectRoot: project, definitionId: 'path-b', requestId: 'audit-test' })).ref;
  const branch = 'ans/task/' + ref.instanceId;
  const oid = git(project, 'rev-parse', 'HEAD');
  function reopen() {
    service.close();
    service = new DurableWorkflowService(dataDir);
    return service;
  }
  const b1 = { stepId: 'impact', attempt: 1 };
  const baseline = unwrap(service.claimEffect(ref, { ...b1, kind: 'baseline', key: 'baseline' }));
  git(project, 'switch', '-c', branch);
  unwrap(service.settleEffect(ref, { key: baseline.key, token: baseline.token, outcome: 'succeeded',
    evidence: 'fixture Git task branch created', result: { branch, oid } }));
  unwrap(await service.submit(ref, { ...b1, kind: 'stage-request', source: 'chief', key: 'request-1', sourceTaskId: 'chief-turn-1',
    requestDigest: hash('impact'), dispatch: { text: 'impact', flowId: 'audit-fixture' } }));
  service.apply({ ref, stepId: b1.stepId, entry: 0, turn: 0 });
  const task = { stage: 'B1' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: 'operator-1', taskId: 'analysis-1', roleId: 'owner' };
  unwrap(await service.submit(ref, { ...b1, kind: 'task-bound', source: 'host', key: 'bound-1', task, modulePaths: files }));
  const b1Report = unwrap(service.storeEvidence(ref, { report: 'Change owner file' }));
  const operatorReport = unwrap(service.storeEvidence(ref, { report: 'Operations report says task was inspected' }));
  unwrap(await service.submit(ref, { ...b1, kind: 'task-report', source: 'host', key: 'report-1', task, evidence: b1Report }));
  unwrap(await service.submit(ref, { ...b1, kind: 'operator-report', source: 'host', key: 'operator-1', parentTaskId: task.parentTaskId, evidence: operatorReport }));
  unwrap(await service.submit(ref, { ...b1, kind: 'analysis-disposition', source: 'convener', key: 'close-1', task, reportKey: 'report-1', outcome: 'usable' }));
  assert.equal(service.apply({ ref, stepId: b1.stepId, entry: 0, turn: 1 }).next, 'scope');
  const advance = {
    kind: 'b3-advance', source: 'chief', key: 'real-b3-request', stepId: 'scope', attempt: 1,
    sourceTaskId: 'chief-turn-2', requestDigest: hash('advance'), b1Attempt: 1, reportKey: 'report-1',
    baselineOid: oid, candidateSource: 'modulePaths', candidates: files,
    writeSets: [{ roleId: task.roleId, paths: [...files].sort() }], reason: 'Bound B1 owner report',
    dispatch: { text: 'advance', flowId: 'audit-fixture' },
  } satisfies DurableFact;
  return { service, db, ref, branch, oid, advance, b1Report, operatorReport, reopen, project };
}

async function enterRelease(t: TestContext, files = [file], approvedFiles = files) {
  const work = await enterScope(t, files);
  const { service, ref, branch, oid, advance, operatorReport } = work;
  unwrap(await service.submit(ref, advance));
  assert.equal(service.apply({ ref, stepId: 'scope', entry: 1, turn: 0 }).next, 'implement');
  const b3 = { stepId: 'implement', attempt: 1 };
  const task = { stage: 'B3' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: 'operator-2', taskId: 'build-1', roleId: 'owner' };
  unwrap(await service.submit(ref, { ...b3, kind: 'task-bound', source: 'host', key: 'bound-2', task, modulePaths: files }));
  const tipOid = 'b'.repeat(40);
  const committed = unwrap(service.claimEffect(ref, { ...b3, kind: 'task-commit', key: 'commit-1', task, expected: { paths: files } }));
  unwrap(service.settleEffect(ref, { key: committed.key, token: committed.token, outcome: 'succeeded',
    evidence: 'simulated test host commit proof', result: { oid: tipOid } }));
  const buildReport = unwrap(service.storeEvidence(ref, { report: 'Implemented' }));
  unwrap(await service.submit(ref, { ...b3, kind: 'task-report', source: 'host', key: 'report-2', task, evidence: buildReport }));
  unwrap(await service.submit(ref, { ...b3, kind: 'implementation-close', source: 'convener', key: 'close-2', task, reportKey: 'report-2' }));
  unwrap(await service.submit(ref, { ...b3, kind: 'operator-report', source: 'host', key: 'operator-2', parentTaskId: task.parentTaskId, evidence: operatorReport }));
  assert.equal(service.apply({ ref, stepId: b3.stepId, entry: 2, turn: 0 }).next, 'release');
  const b4 = { stepId: 'release', attempt: 1 };
  const snapshot = {
    mainOid: oid, branch, tipOid, baselineOid: oid, files: approvedFiles, diffDigest: hash('approved diff'),
    b3CloseKey: 'close-2', operatorReport,
  };
  const release = unwrap(await service.submit(ref, { ...b4, kind: 'release-preview', source: 'host', key: 'preview', snapshot })).release!;
  const approval = { ...b4, kind: 'release-decision', source: 'customer', key: 'decision',
    requestId: release.requestId, digest: release.digest, generation: release.generation, action: 'approve' } satisfies DurableFact;
  const operation = {
    ...b4, key: 'merge-effect', kind: 'release-merge' as const, requestId: release.requestId, snapshotDigest: release.digest,
    expected: { branch, mainOid: snapshot.mainOid, tipOid, files: snapshot.files },
  };
  const mainOid = 'c'.repeat(40);
  const merged = { ...b4, kind: 'release-merged', source: 'host', key: 'release-merged',
    requestId: release.requestId, effectKey: operation.key, mainOid, closed: true } satisfies DurableFact;
  return { ...work, b4, snapshot, release, approval, operation, mainOid, merged };
}

test('scope audit, original B3 fact and its outbox commit once or roll back together', async t => {
  const { service, db, ref, advance, b1Report, oid, branch, reopen } = await enterScope(t);
  assert.equal((await service.submit(ref, { ...advance, reportKey: 'obsolete-report' })).ok, false);
  assert.equal((await service.submit(ref, { ...advance, attempt: 2 })).ok, false);
  db.exec("CREATE TRIGGER fail_scope BEFORE INSERT ON scope_decision BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END");
  const failed = await service.submit(ref, advance);
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.message, /injected audit failure/);
  assert.equal(service.lookup(ref)?.scope, undefined);
  assert.equal(service.lookup(ref)?.scopeDecision, undefined);
  assert.equal(db.prepare('SELECT 1 FROM fact WHERE business_key=?').get(advance.key), undefined);
  assert.equal(db.prepare('SELECT 1 FROM outbox WHERE business_key=?').get(advance.key), undefined);

  db.exec('DROP TRIGGER fail_scope');
  const accepted = unwrap(await service.submit(ref, advance));
  assert.deepEqual(unwrap(await service.submit(ref, advance)), accepted);
  assert.equal((await service.submit(ref, { ...advance, reason: 'different request' })).ok, false);
  const decision = service.lookup(ref)?.scopeDecision;
  assert.ok(decision);
  assert.equal(decision.kind, 'change.scope-decided');
  assert.deepEqual(decision.b3Request, { key: advance.key, sourceTaskId: advance.sourceTaskId, digest: advance.requestDigest });
  assert.deepEqual(decision.b1Report, { ...b1Report, key: advance.reportKey, attempt: advance.b1Attempt });
  assert.deepEqual(decision.baseline, { oid, branch });
  assert.deepEqual(decision.writeSets, advance.writeSets);
  assert.equal(decision.reason, advance.reason);
  assert.equal(decision.recordedAt, decision.decidedAt);
  assert.deepEqual({ ...db.prepare('SELECT kind, request_key FROM scope_decision').get() },
    { kind: 'change.scope-decided', request_key: advance.key });
  assert.equal(db.prepare('SELECT business_key FROM outbox WHERE business_key=?').get(advance.key)?.business_key, advance.key);

  // Simulate a pre-audit database. Reopening must preserve the original B3 event and outbox byte for byte.
  const outbox = db.prepare('SELECT * FROM outbox ORDER BY business_key').all();
  const facts = service.listFacts(ref);
  db.exec('DELETE FROM scope_decision');
  let recovered = reopen();
  const backfilled = recovered.lookup(ref)?.scopeDecision;
  assert.equal(backfilled?.id, decision.id);
  assert.equal(backfilled?.decidedAt, undefined);
  assert.deepEqual(recovered.listFacts(ref), facts);
  assert.deepEqual(db.prepare('SELECT * FROM outbox ORDER BY business_key').all(), outbox);
  recovered = reopen();
  assert.deepEqual(recovered.lookup(ref)?.scopeDecision, backfilled);
  assert.equal(db.prepare('SELECT count(*) AS n FROM scope_decision').get()?.n, 1);
});

test('known merge creates and independently acknowledges one note across rollback, reopen and old-record recovery', async t => {
  const { service, db, ref, b4, snapshot, release, approval, operation, mainOid, merged, reopen } = await enterRelease(t);
  assert.equal((await service.submit(ref, merged)).ok, false);
  assert.equal(service.lookup(ref)?.delivery, undefined);
  unwrap(await service.submit(ref, approval));
  const effect = unwrap(service.claimEffect(ref, operation));
  unwrap(service.settleEffect(ref, { key: effect.key, token: effect.token, outcome: 'succeeded',
    evidence: 'simulated test host replay proof', result: { mainOid, files: snapshot.files, diffDigest: snapshot.diffDigest } }));
  db.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON delivery_note BEGIN SELECT RAISE(ABORT, 'injected delivery failure'); END");
  const first = await service.submit(ref, merged);
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.match(first.message, /injected delivery failure/);
    service.block(ref, first.code, first.message);
  }
  assert.equal(service.lookup(ref)?.delivery, undefined);
  assert.equal(db.prepare('SELECT 1 FROM outbox WHERE business_key=?').get(merged.key), undefined);
  assert.equal(db.prepare('SELECT 1 FROM fact WHERE business_key=?').get(merged.key), undefined);
  assert.equal(db.prepare('SELECT state FROM effect WHERE business_key=?').get(effect.key)?.state, 'succeeded');

  db.exec('DROP TRIGGER fail_delivery');
  let recovered = reopen();
  assert.match(recovered.lookup(ref)?.blockedReason ?? '', /injected delivery failure/);
  assert.equal(unwrap(recovered.claimEffect(ref, operation)).execute, false);
  const receipt = unwrap(await recovered.submit(ref, merged));
  assert.deepEqual(unwrap(await recovered.submit(ref, merged)), receipt);
  const note = recovered.lookup(ref)?.delivery;
  assert.ok(note);
  assert.equal(note.state, 'pending');
  assert.equal(note.releaseRequestId, release.requestId);
  assert.equal(note.mergeOid, mainOid);
  assert.deepEqual(note.files, snapshot.files);
  assert.equal(note.diffDigest, snapshot.diffDigest);
  assert.deepEqual(note.operatorReport, snapshot.operatorReport);
  assert.equal(note.runtimeVerification, 'not-independently-verified');
  assert.equal(db.prepare('SELECT 1 FROM outbox WHERE business_key=?').get(note.id), undefined);
  assert.equal(recovered.apply({ ref, stepId: b4.stepId, entry: 3, turn: 0 }).terminal, 'delivered');
  assert.equal(recovered.lookup(ref)?.delivery?.state, 'pending');
  assert.equal(recovered.lookup(ref)?.blockedReason, undefined);

  const input = { deliveryId: note.id, requestId: release.requestId };
  assert.equal(recovered.acknowledgeDelivery({ ...ref, projectId: 'other-project' }, input).ok, false);
  assert.equal(recovered.acknowledgeDelivery(ref, { ...input, requestId: 'obsolete' }).ok, false);
  const opened = unwrap(recovered.acknowledgeDelivery(ref, input));
  assert.equal(opened.state, 'delivered');
  assert.ok(opened.deliveredAt && opened.deliveredAt >= note.createdAt);
  recovered = reopen();
  assert.deepEqual(unwrap(recovered.acknowledgeDelivery(ref, input)), opened);
  assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_receipt').get()?.n, 1);

  // No historical note or delivery time exists in a pre-change database.
  db.exec('DELETE FROM delivery_receipt; DELETE FROM delivery_note');
  const activity = db.prepare('SELECT * FROM activity ORDER BY rowid').all();
  const effects = recovered.listEffects(ref);
  const facts = recovered.listFacts(ref);
  recovered = reopen();
  const backfilled = recovered.lookup(ref)?.delivery;
  assert.equal(backfilled?.id, note.id);
  assert.equal(backfilled?.state, 'pending');
  assert.equal(backfilled?.deliveredAt, undefined);
  assert.deepEqual(recovered.listEffects(ref), effects);
  assert.deepEqual(recovered.listFacts(ref), facts);
  assert.deepEqual(db.prepare('SELECT * FROM activity ORDER BY rowid').all(), activity);
  assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_note').get()?.n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_receipt').get()?.n, 0);
});

test('rejected snapshot never creates a delivery note', async t => {
  const { service, ref, db, b4, approval, operation, merged, reopen } = await enterRelease(t);
  unwrap(await service.submit(ref, { ...approval, action: 'reject' }));
  assert.equal(service.claimEffect(ref, operation).ok, false);
  assert.equal((await service.submit(ref, merged)).ok, false);
  assert.equal(service.apply({ ref, stepId: b4.stepId, entry: 3, turn: 0 }).terminal, 'stopped');
  assert.equal(reopen().lookup(ref)?.delivery, undefined);
  assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_note').get()?.n, 0);
});

test('delivery uses the verified main-to-merge delta when approved main already contains one task change', async t => {
  const mergedOnly = 'second.txt';
  const { service, ref, db, b4, snapshot, approval, operation, mainOid, merged, reopen } = await enterRelease(t, [file, mergedOnly]);
  unwrap(await service.submit(ref, approval));
  const effect = unwrap(service.claimEffect(ref, operation));
  const actual = { mainOid, files: [mergedOnly], diffDigest: hash('approved main to merge contains only second.txt') };
  unwrap(service.settleEffect(ref, { key: effect.key, token: effect.token, outcome: 'succeeded',
    evidence: 'simulated trusted Git reconciliation for approved main that already contains the first change', result: actual }));
  assert.equal((await service.submit(ref, { ...merged, mainOid: 'd'.repeat(40) })).ok, false);
  assert.equal(service.lookup(ref)?.delivery, undefined);
  unwrap(await service.submit(ref, merged));
  assert.equal(service.apply({ ref, stepId: b4.stepId, entry: 3, turn: 0 }).terminal, 'delivered');
  const stored = service.lookup(ref)?.delivery;
  assert.equal(stored?.mergeOid, mainOid);
  assert.deepEqual(stored?.files, actual.files);
  assert.equal(stored?.diffDigest, actual.diffDigest);
  assert.notEqual(stored?.diffDigest, snapshot.diffDigest);
  assert.deepEqual(service.lookup(ref)?.release?.snapshot.files, [file, mergedOnly]);

  db.exec('DELETE FROM delivery_note');
  const recovered = reopen();
  const note = recovered.lookup(ref)?.delivery;
  assert.equal(note?.id, stored?.id);
  assert.deepEqual(note?.files, actual.files);
  assert.equal(note?.diffDigest, actual.diffDigest);
  assert.equal(unwrap(recovered.claimEffect(ref, operation)).execute, false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_note').get()?.n, 1);
});

test('unapproved files and unusable merge proof cannot close a release or create a note', async t => {
  const other = 'second.txt';
  const invalid = [
    ['path in B2 but outside the approved snapshot', [file, other], hash('unapproved file')],
    ['empty actual delta', [], hash('empty delta')],
    ['malformed digest', [file], 'forged-digest'],
  ] as const;
  for (const [label, files, diffDigest] of invalid) {
    await t.test(label, async it => {
      const { service, ref, db, approval, operation, mainOid, merged, reopen } = await enterRelease(it, [file, other], [file]);
      unwrap(await service.submit(ref, approval));
      const effect = unwrap(service.claimEffect(ref, operation));
      unwrap(service.settleEffect(ref, { key: effect.key, token: effect.token, outcome: 'succeeded',
        evidence: 'simulated host proof with an invalid delivery delta', result: { mainOid, files, diffDigest } }));
      const rejected = await service.submit(ref, merged);
      assert.equal(rejected.ok, false);
      if (!rejected.ok) assert.equal(rejected.code, 'delivery-evidence-invalid');
      assert.equal(db.prepare('SELECT state FROM effect WHERE business_key=?').get(effect.key)?.state, 'succeeded');
      assert.equal(db.prepare('SELECT 1 FROM fact WHERE business_key=?').get(merged.key), undefined);
      const recovered = reopen();
      assert.equal(recovered.lookup(ref)?.stepId, 'release');
      assert.equal(recovered.lookup(ref)?.delivery, undefined);
    });
  }
});
