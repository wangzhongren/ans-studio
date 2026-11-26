import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { DurableResult } from '../../../src/model/durable-workflow.ts';
import { requestStage } from '../../../src/common/编排/workflow-service.ts';
import { DurableWorkflowService, parseDefinition } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, legacyPathB } from './fixture.ts';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return (result as { value: T }).value;
}

test('strict YAML rejects unsafe fields, unauthorized jumps, aliases and unreachable steps', async () => {
  const source = legacyPathB;
  assert.equal(parseDefinition(source).ok, true);
  for (const malformed of [
    source.replace('version: 1', 'version: 1\nversion: 2'),
    source.replace('name: 路径 B', 'name: &name 路径 B'),
    source + '---\nid: another',
    source.replace('next: implement', 'next: release'),
    source.replace('merged: delivered', 'merged: stopped'),
    source.replace('role: module-owner', 'role: unknown'),
    source.replace('on:', 'shell: git status\n    on:'),
    source.replace('    on:\n      usable: scope', '    on:\n      extra: blocked'),
    source + '  unreachable: { terminal: blocked }',
  ]) {
    const rejected = parseDefinition(malformed);
    assert.equal(rejected.ok, false, malformed);
    if (!rejected.ok) assert.ok(rejected.path);
  }
});

test('repository owner is exclusive across data roots and worktrees; snapshots are project scoped', async t => {
  const { project, definitions, dataDir, directory, cleanup } = await fixture(t);
  const first = new DurableWorkflowService(dataDir);
  const other = new DurableWorkflowService(join(directory, 'other-app-data'));
  cleanup.push(() => { first.close(); other.close(); });
  const started = unwrap(await first.start({ projectRoot: project, definitionId: 'path-b', requestId: 'entry-1' }));
  assert.deepEqual(unwrap(await first.start({ projectRoot: project, definitionId: 'path-b', requestId: 'entry-1' })).ref, started.ref);
  const worktree = join(directory, 'worktree');
  git(project, 'worktree', 'add', '-b', 'other-worktree', worktree);
  assert.equal((await other.owner(worktree))?.instanceId, started.ref.instanceId);
  assert.equal((await other.owner(worktree))?.ownedByThisDataDir, false);
  assert.equal((await other.start({ projectRoot: worktree, definitionId: 'path-b', requestId: 'entry-2' })).ok, false);
  const legacy = await requestStage({
    projectRoot: project, flowId: 'prototype-test', stage: 'B1', workflowPath: 'B',
    requestDigest: hash('legacy request'), sourceTaskId: 'customer-legacy', text: 'legacy request',
  });
  assert.equal(legacy.ok, false);
  if (!legacy.ok) assert.equal(legacy.code, 'workflow-owner-conflict');

  const alternative = unwrap(await first.start({ projectRoot: project, definitionId: 'read-only-example', requestId: 'read-1' }));
  assert.notEqual(alternative.ref.instanceId, started.ref.instanceId);
  const original = legacyPathB;
  await writeFile(join(definitions, 'path-b.yaml'), original.replace('version: 1', 'version: 2'));
  assert.equal(first.lookup(started.ref)?.ref.definitionVersion, 1);
  assert.equal(unwrap(await first.validateDefinition(project, 'path-b')).version, 2);
  assert.equal((await first.submit({ ...started.ref, instanceId: alternative.ref.instanceId }, {
    kind: 'stage-request', source: 'chief', key: 'invalid', stepId: 'impact', attempt: 1,
    sourceTaskId: 'customer', requestDigest: hash('inspect'), dispatch: { text: 'inspect' },
  })).ok, false);
});

test('unsupported Git configuration blocks a write workflow before ownership but leaves the read-only graph available', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  git(project, 'config', '--local', 'core.autocrlf', 'false');
  const service = new DurableWorkflowService(dataDir);
  cleanup.push(() => service.close());
  const rejected = await service.start({ projectRoot: project, definitionId: 'path-b', requestId: 'write' });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.code, 'workflow-git-protection-unavailable');
    assert.match(rejected.message, /git-config-executable-or-unsupported/);
  }
  assert.deepEqual(service.activeProjections(), []);
  assert.equal(await service.owner(project), undefined);
  await assert.rejects(access(join(project, '.git', 'ans-workflow-ownership.sqlite')), { code: 'ENOENT' });
  assert.equal(unwrap(await service.start({ projectRoot: project, definitionId: 'read-only-example', requestId: 'read' })).status, 'waiting');
});

test('out-of-order reports and closure remain durable until prerequisites and the Worker activity', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  let service = new DurableWorkflowService(dataDir);
  cleanup.push(() => service.close());
  const ref = unwrap(await service.start({ projectRoot: project, definitionId: 'read-only-example', requestId: 'read-1' })).ref;
  const task = { stage: 'readonly' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: 'operator', taskId: 'inspect-1', roleId: 'owner' };
  const evidence = unwrap(service.storeEvidence(ref, { report: 'Repository examined' }));
  const operation = { stepId: 'inspect', attempt: 1 };
  const report = { ...operation, kind: 'task-report' as const, source: 'host' as const, key: 'report', task, evidence };
  const request = { ...operation, kind: 'stage-request' as const, source: 'chief' as const, key: 'stage-b1',
    sourceTaskId: 'customer', requestDigest: hash('inspect'), dispatch: { text: 'inspect' } };
  unwrap(await service.submit(ref, report));
  unwrap(await service.submit(ref, request));
  unwrap(await service.submit(ref, { kind: 'readonly-review', source: 'convener', key: 'review', stepId: 'review', attempt: 1, reportKey: 'report', outcome: 'accepted' }));
  assert.equal(service.pendingOutbox().length, 3);
  const turn0 = { ref, stepId: 'inspect', entry: 0, turn: 0 };
  assert.deepEqual(service.apply(turn0), { entry: 0 });
  assert.equal(service.pendingOutbox().length, 2);
  service.close();
  service = new DurableWorkflowService(dataDir);
  assert.deepEqual(service.getEvidence(ref, evidence), { report: 'Repository examined' });
  assert.equal(unwrap(await service.submit(ref, report)).state, 'pending');
  assert.equal((await service.submit(ref, { ...report, evidence: { ...evidence, path: 'a' } })).ok, false);
  unwrap(await service.submit(ref, { ...operation, kind: 'task-bound', source: 'host', key: 'binding', task }));
  const turn1 = { ...turn0, turn: 1 };
  assert.deepEqual(service.apply(turn1), { next: 'review', entry: 1 });
  assert.deepEqual(service.apply(turn1), { next: 'review', entry: 1 });
  assert.equal(service.apply({ ref, stepId: 'review', entry: 1, turn: 0 }).terminal, 'completed');
  assert.equal(service.lookup(ref)?.status, 'completed');
  assert.equal(service.pendingOutbox().length, 0);
});
