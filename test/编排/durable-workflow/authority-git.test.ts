import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  createDesktopBaselineGitPort, createDesktopTaskGitShellPort, mergeDurableMain, previewDurableMerge, verifyDurableMerge,
} from '../../../app/desktop/workflow-git.ts';
import { deriveDurablePathBWriteSets, prepareDurablePathBBaseline } from '../../../src/common/编排/workflow-service.ts';
import type { DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git } from './fixture.ts';

const hash = (message: string) => createHash('sha256').update(message).digest('hex');
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

test('real desktop Git effects honor B2 and the bound delegated snapshot, and recover one merge', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  const source = 'change.txt';
  const roleDir = join(project, '角色卡', 'owner');
  await mkdir(roleDir, { recursive: true });
  await writeFile(join(roleDir, 'boundary.md'), '# Owner\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 单文件 | `change.txt` | scope |\n');
  await writeFile(join(project, source), 'base\n');
  git(project, 'config', 'user.name', 'ANS test');
  git(project, 'config', 'user.email', 'ans-test@example.invalid');
  git(project, 'add', '.');
  git(project, 'commit', '-m', 'Owner fixture');
  const artifactPath = 'evidence.txt';
  await writeFile(join(project, '.git', 'info', 'exclude'), artifactPath + '\n');
  await writeFile(join(project, artifactPath), 'reviewed artifact\n');

  let service = new DurableWorkflowService(dataDir);
  cleanup.push(() => service.close());
  const ref = unwrap(await service.start({ projectRoot: project, definitionId: 'path-b', requestId: 'protected-git' })).ref;
  const b1 = { stepId: 'impact', attempt: 1 };
  const binding = { stage: 'B1' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: 'operator-1', taskId: 'analysis-1', roleId: 'owner' };
  const baselineClaim = unwrap(service.claimEffect(ref, { ...b1, kind: 'baseline', key: 'git:baseline' }));
  const prepared = await prepareDurablePathBBaseline({ projectRoot: project, workflowId: ref.instanceId, port: createDesktopBaselineGitPort() });
  assert.ok(prepared.ok, prepared.ok ? '' : prepared.message);
  const branch = prepared.repo.branch;
  const oid = prepared.repo.baseOid!;
  unwrap(service.settleEffect(ref, { key: baselineClaim.key, token: baselineClaim.token,
    outcome: 'succeeded', evidence: 'actual baseline Git branch prepared', result: { branch, oid } }));
  const chiefRequest = 'Read current impact';
  unwrap(await service.submit(ref, { ...b1, kind: 'stage-request', source: 'chief', key: 'request-1', sourceTaskId: 'chief-turn-1',
    requestDigest: hash(chiefRequest), dispatch: { text: chiefRequest, flowId: 'fixture' } }));
  service.apply({ ref, stepId: b1.stepId, entry: 0, turn: 0 });
  unwrap(await service.submit(ref, { ...b1, kind: 'task-bound', source: 'host', key: 'bound-1', task: binding, modulePaths: [source] }));
  const analysis = unwrap(service.storeEvidence(ref, { report: 'Change authorized owner file' }));
  const firstArtifact = unwrap(await service.readEvidence(project, artifactPath));
  const operator = unwrap(service.storeEvidence(ref, { report: 'Operations verified', artifacts: [firstArtifact] }));
  unwrap(await service.submit(ref, { ...b1, kind: 'analysis-disposition', source: 'convener', key: 'close-1',
    task: binding, reportKey: 'report-1', outcome: 'usable' }));
  unwrap(await service.submit(ref, { ...b1, kind: 'task-report', source: 'host', key: 'report-1', task: binding, evidence: analysis }));
  unwrap(await service.submit(ref, { ...b1, kind: 'operator-report', source: 'host', key: 'operator-report-1',
    parentTaskId: binding.parentTaskId, evidence: operator }));
  assert.equal(service.apply({ ref, stepId: b1.stepId, entry: 0, turn: 1 }).next, 'scope');

  const scope = { stepId: 'scope', attempt: 1 };
  const sets = await deriveDurablePathBWriteSets({ projectRoot: project, flowId: 'fixture', scopeFiles: [source] });
  assert.ok(sets.ok, sets.ok ? '' : sets.message);
  const advance = 'Advance the same B1 analysis';
  const b2 = { ...scope, kind: 'b3-advance' as const, source: 'chief' as const, key: 'real-b3-advance',
    sourceTaskId: 'chief-turn-2', requestDigest: hash(advance), b1Attempt: 1, reportKey: 'report-1',
    baselineOid: oid, candidateSource: 'modulePaths' as const, candidates: [source], writeSets: sets.writesets,
    reason: 'Owner report confirms the scope', dispatch: { text: advance, flowId: 'fixture' },
  };
  assert.equal((await service.submit(ref, { ...b2, baselineOid: '0'.repeat(40) })).ok, false);
  unwrap(await service.submit(ref, b2));
  assert.equal(service.lookup(ref)?.stepId, 'scope');
  service.close();
  service = new DurableWorkflowService(dataDir);
  assert.equal(unwrap(await service.submit(ref, b2)).state, 'pending');
  assert.equal(service.apply({ ref, stepId: 'scope', entry: 1, turn: 0 }).next, 'implement');
  assert.equal(service.lookup(ref)?.actionIntent?.sourceKey, b2.key);
  assert.equal(service.listFacts(ref).filter(item => item.fact.kind === 'b3-advance').length, 1);

  const b3 = { stepId: 'implement', attempt: 1 };
  const worker = { ...binding, stage: 'B3' as const, taskId: 'implement-1', parentTaskId: 'operator-2' };
  assert.equal((await service.submit(ref, { ...b3, kind: 'task-bound', source: 'host', key: 'invalid',
    task: worker, modulePaths: ['outside.txt'] })).ok, false);
  unwrap(await service.submit(ref, { ...b3, kind: 'task-bound', source: 'host', key: 'bound-2', task: worker, modulePaths: [source] }));
  assert.deepEqual(service.taskGitScope(ref, worker.taskId, worker.roleId)?.paths, [source]);
  assert.equal(service.claimEffect(ref, { ...b3, kind: 'task-write', key: 'invalid-write', task: worker,
    expected: { paths: ['outside.txt'] } }).ok, false);
  const edit = unwrap(service.claimEffect(ref, { ...b3, kind: 'task-write', key: 'write-1', task: worker, expected: { paths: [source] } }));
  await writeFile(join(project, source), 'implemented\n');
  unwrap(service.settleEffect(ref, { key: edit.key, token: edit.token, outcome: 'succeeded', evidence: 'actual test file write' }));
  const port = createDesktopTaskGitShellPort(project, async operation => {
    const reply = service.claimEffect(ref, { ...b3, ...operation, task: worker });
    if (!reply.ok) return reply;
    const { key, token, execute } = reply.value;
    return { ok: true, value: { execute, async finish(outcome, evidence, result) {
      unwrap(service.settleEffect(ref, { key, token, outcome, evidence, result }));
    } } };
  });
  assert.equal((await port.add([source])).exitCode, 0);
  const unlock = await port.acquireCriticalSection('ans-test');
  assert.ok(typeof unlock === 'function');
  try {
    assert.equal((await port.commit(['git', 'commit', '-m', 'Implement authorized file'])).exitCode, 0);
  } finally { unlock(); }
  const implementationReport = unwrap(service.storeEvidence(ref, { report: 'Actual file changed' }));
  unwrap(await service.submit(ref, { ...b3, kind: 'task-report', source: 'host', key: 'report-2', task: worker, evidence: implementationReport }));
  unwrap(await service.submit(ref, { ...b3, kind: 'implementation-close', source: 'convener', key: 'close-2', task: worker, reportKey: 'report-2' }));
  unwrap(await service.submit(ref, { ...b3, kind: 'operator-report', source: 'host', key: 'operator-report-2', parentTaskId: worker.parentTaskId, evidence: operator }));
  assert.equal(service.apply({ ref, stepId: b3.stepId, entry: 2, turn: 0 }).next, 'release');

  const b4 = { stepId: 'release', attempt: 1 };
  const { diffStat: _ignored, ...preview } = unwrap(await previewDurableMerge({ projectRoot: project, branch, baselineOid: oid }));
  const firstSnapshot = { ...preview, branch, baselineOid: oid, b3CloseKey: 'close-2', operatorReport: operator, operatorReportArtifacts: [firstArtifact] };
  const firstRelease = unwrap(await service.submit(ref, { ...b4, kind: 'release-preview', source: 'host', key: 'release-preview-1', snapshot: firstSnapshot })).release!;
  await writeFile(join(project, artifactPath), 'refreshed artifact only\n');
  assert.equal((await service.submit(ref, { ...b4, kind: 'release-preview', source: 'host', key: 'invalid-artifact', snapshot: firstSnapshot })).ok, false);
  const snapshot = { ...firstSnapshot, operatorReportArtifacts: [unwrap(await service.readEvidence(project, artifactPath))] };
  const release = unwrap(await service.submit(ref, { ...b4, kind: 'release-preview', source: 'host', key: 'release-preview-2', snapshot })).release!;
  assert.equal(firstRelease.snapshot.tipOid, release.snapshot.tipOid);
  assert.equal(firstRelease.snapshot.mainOid, release.snapshot.mainOid);
  assert.notEqual(firstRelease.requestId, release.requestId);
  assert.equal(release.generation, firstRelease.generation + 1);
  assert.equal((await service.submit(ref, { ...b4, kind: 'release-decision', source: 'customer', key: 'expired-approval',
    requestId: firstRelease.requestId, digest: firstRelease.digest, generation: firstRelease.generation, action: 'approve' })).ok, false);
  const operation = { ...b4, kind: 'release-merge' as const, key: 'release-operation', requestId: release.requestId, snapshotDigest: release.digest,
    expected: { branch, mainOid: snapshot.mainOid, tipOid: snapshot.tipOid, files: snapshot.files },
  };
  assert.equal(service.claimEffect(ref, operation).ok, false);
  const approvalBinding = { requestId: release.requestId, digest: release.digest, generation: release.generation };
  const provenance = { source: 'delegated-chief', ...approvalBinding, delegationRevision: 8, reason: 'The verified scope and candidate agree.' } as const;
  const decision = { ...b4, ...approvalBinding, key: 'approval', action: 'approve' as const, provenance };
  const current = () => true;
  assert.equal((await service.submit(ref, { ...decision, kind: 'release-decision', source: 'delegated-chief' })).ok, false);
  assert.equal((await service.decideRelease(ref, { ...decision, generation: firstRelease.generation }, current)).ok, false);
  let checks = 0;
  assert.equal((await service.decideRelease(ref, decision, () => ++checks < 4)).ok, false);
  const branchBefore = git(project, 'rev-parse', 'main');
  git(project, 'update-ref', 'refs/heads/main', snapshot.tipOid);
  assert.equal((await service.decideRelease(ref, decision, current)).ok, false);
  assert.equal(service.lookup(ref)?.release?.decision, undefined);
  git(project, 'update-ref', 'refs/heads/main', branchBefore);
  const approved = unwrap(await service.decideRelease(ref, decision, current)).release!;
  assert.deepEqual(approved.decision?.provenance, provenance);
  assert.equal((await service.decideRelease(ref, { ...decision, key: 'opposite', action: 'reject' }, current)).ok, false);
  assert.equal(git(project, 'rev-parse', 'main'), branchBefore);
  let token = '';
  const merge = await mergeDurableMain({ projectRoot: project, workflowId: ref.instanceId, flowId: 'fixture', release: approved, claim: async () => {
      const claimed = unwrap(service.claimEffect(ref, operation));
      assert.equal(claimed.execute, true);
      token = claimed.token;
      return { ok: true };
    } });
  assert.equal(merge.ok, true);
  service.close();
  service = new DurableWorkflowService(dataDir);
  assert.equal(unwrap(service.claimEffect(ref, operation)).execute, false);
  const recovered = unwrap(await verifyDurableMerge({ projectRoot: project, workflowId: ref.instanceId, requestId: release.requestId, snapshot, writePaths: [source] }));
  unwrap(service.settleEffect(ref, { key: operation.key, token, outcome: 'succeeded', evidence: 'actual Git comparison after restart', result: recovered }));
  unwrap(await service.submit(ref, { ...b4, kind: 'release-merged', source: 'host', key: 'actual-result',
    requestId: release.requestId, effectKey: operation.key, mainOid: recovered.mainOid, closed: true }));
  assert.equal(service.apply({ ref, stepId: b4.stepId, entry: 3, turn: 0 }).terminal, 'delivered');
  assert.equal(service.lookup(ref)?.delivery?.releaseRequestId, release.requestId);
  assert.equal(git(project, 'rev-parse', 'main'), recovered.mainOid);
  assert.equal(await readFile(join(project, source), 'utf8'), 'implemented\n');
});
