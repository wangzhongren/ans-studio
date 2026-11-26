import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { DurableResult, DurableStartProposal, DurableStartProposalInput } from '../../../src/model/durable-workflow.ts';
import { digest } from '../../../src/provider/durable-workflow/public.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture } from './fixture.ts';

const current = () => true;

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

function failure(result: DurableResult<unknown>, code: string): void {
  assert.equal(result.ok ? undefined : result.code, code);
}

async function proposalInput(service: DurableWorkflowService, projectRoot: string, inputId = 'input-1',
  source: 'preset' | 'project' = 'preset'): Promise<DurableStartProposalInput> {
  const text = 'Implement a threshold with an independent release check.';
  const selected = unwrap(await service.validateDefinition(projectRoot, 'path-a', { source }));
  return { projectRoot, definitionId: selected.id, source, expectedDigest: selected.digest, reason: 'New governed work.',
    requirement: { inputId, turnId: 'turn-1', text, digest: digest(text), runtime: 'pi' } };
}

function decision(projectRoot: string, { activationId, requestId }: DurableStartProposal, action: 'approve' | 'reject' | 'revoke') {
  return { projectRoot, activationId, requestId, action };
}

test('proposal replay fixes the original input, keeps the workspace free, and binds only the saved choice', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const projectRoot = join(directory, 'no-git');
  const other = join(directory, 'other-project');
  await Promise.all([mkdir(projectRoot), mkdir(other)]);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const input = await proposalInput(service, projectRoot);
  failure(await service.proposeWorkflowStart(input), 'workflow-start-source-stale');
  const p = unwrap(await service.proposeWorkflowStart(input, current));
  assert.equal(p.state, 'pending');
  failure(await service.startApprovedWorkflow(projectRoot, p.activationId, current), 'workflow-start-confirmation-required');
  assert.deepEqual(await service.owner(projectRoot), undefined);
  assert.deepEqual(service.activeProjections(), []);
  const replay = unwrap(await service.proposeWorkflowStart({ ...input, requirement: { ...input.requirement, turnId: 'turn-after-resend' } }, current));
  assert.deepEqual(replay, p);
  failure(await service.proposeWorkflowStart({ ...input, reason: 'Try a different proposal.' }, current), 'workflow-start-proposal-conflict');
  failure(await service.proposeWorkflowStart({ ...input, requirement: { ...input.requirement, runtime: 'codex' } }, current),
    'workflow-start-input-conflict');
  const sameText = unwrap(await service.proposeWorkflowStart({ ...input, requirement: { ...input.requirement, inputId: 'actual-new-send' } }, current));
  assert.notEqual(sameText.activationId, p.activationId);
  failure(await service.decideWorkflowStart(decision(other, p, 'approve'), current), 'workflow-start-proposal-not-found');
  failure(await service.decideWorkflowStart({ ...decision(projectRoot, p, 'approve'), requestId: sameText.requestId }, current), 'workflow-start-proposal-not-found');
  failure(await service.decideWorkflowStart(decision(projectRoot, p, 'approve'), () => false), 'workflow-start-source-stale');
  const refused = unwrap(await service.decideWorkflowStart(decision(projectRoot, p, 'reject'), current));
  assert.equal(refused.state, 'rejected');
  assert.deepEqual(unwrap(await service.decideWorkflowStart(decision(projectRoot, p, 'reject'), current)), refused);
  failure(await service.decideWorkflowStart(decision(projectRoot, p, 'approve'), current), 'workflow-start-decision-conflict');
  const revised = unwrap(await service.proposeWorkflowStart({ ...input, reason: 'Specific reason after rejection.' }, current));
  assert.equal(revised.generation, 2);
  assert.notEqual(revised.requestId, p.requestId);
  const revoked = unwrap(await service.decideWorkflowStart(decision(projectRoot, revised, 'revoke'), current));
  assert.equal(revoked.state, 'revoked');
  failure(await service.decideWorkflowStart(decision(projectRoot, revised, 'approve'), current), 'workflow-start-decision-conflict');
  assert.equal(await service.owner(projectRoot), undefined);
});

test('a pending card fails closed on byte edits, deletion and a same-byte effective source change', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const projectRoot = join(directory, 'selection-tests');
  await mkdir(projectRoot);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const preset = await proposalInput(service, projectRoot, 'source-test');
  const first = unwrap(await service.proposeWorkflowStart(preset, current));
  const copy = unwrap(await service.copyPreset(projectRoot, 'path-a'));
  const file = join(projectRoot, copy.file);
  const original = await readFile(file);
  assert.equal(copy.definition.digest, first.definition.digest);
  failure(await service.decideWorkflowStart(decision(projectRoot, first, 'approve'), current), 'workflow-start-proposal-stale');

  const project = await proposalInput(service, projectRoot, 'comment-test', 'project');
  const second = unwrap(await service.proposeWorkflowStart(project, current));
  await writeFile(file, Buffer.concat([original, Buffer.from('# The semantic digest stays the same.\n')]));
  assert.equal(unwrap(await service.validateDefinition(projectRoot, 'path-a')).digest, second.definition.digest);
  assert.equal(unwrap(await service.refreshWorkflowStartProposal(projectRoot, second.activationId, current)).state, 'stale');
  failure(await service.decideWorkflowStart(decision(projectRoot, second, 'approve'), current), 'workflow-start-proposal-stale');
  const nextGeneration = unwrap(await service.proposeWorkflowStart(project, current));
  assert.equal(nextGeneration.generation, second.generation + 1);
  await rm(file);
  failure(await service.decideWorkflowStart(decision(projectRoot, nextGeneration, 'approve'), current), 'workflow-start-proposal-stale');
  assert.equal(await service.owner(projectRoot), undefined);
  assert.deepEqual(service.activeProjections(), []);
});

test('workflow activation persists the bound delegated approval and only resumes the original start', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const projectRoot = join(directory, 'delegated');
  await mkdir(projectRoot);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const request = unwrap(await service.proposeWorkflowStart(await proposalInput(service, projectRoot), current));
  assert.match(request.definition.file ?? '', /path-a\.yaml$/);
  assert.match(request.definition.fileDigest ?? '', /^[a-f0-9]{64}$/);
  assert.match(request.decisionDigest ?? '', /^[a-f0-9]{64}$/);
  const provenance = { source: 'delegated-chief', requestId: request.requestId, digest: request.decisionDigest!,
    generation: request.generation, delegationRevision: 4, reason: 'The verified built-in graph fits the requested work.' } as const;
  const answer = { ...decision(projectRoot, request, 'approve'), provenance };
  failure(await service.decideWorkflowStart({ ...answer, action: 'revoke' }, current), 'workflow-start-decision-authority');
  failure(await service.decideWorkflowStart({ ...answer, provenance: { ...provenance, reason: '   ' } }, current), 'workflow-start-decision-authority');
  failure(await service.decideWorkflowStart({ ...answer, provenance: { ...provenance, generation: request.generation + 1 } }, current),
    'workflow-start-decision-authority');
  let checks = 0;
  failure(await service.decideWorkflowStart(answer, () => ++checks < 4), 'workflow-start-source-stale');
  assert.equal((await service.listWorkflowStartProposals(projectRoot))[0]?.state, 'pending');
  const approved = unwrap(await service.decideWorkflowStart(answer, current));
  assert.deepEqual(approved.decision?.provenance, provenance);
  failure(await service.decideWorkflowStart({ ...answer, provenance: { source: 'customer' } }, current), 'workflow-start-decision-conflict');
  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.deepEqual(unwrap(await service.decideWorkflowStart(answer, current)), approved);
  const results = await Promise.all([service.startApprovedWorkflow(projectRoot, request.activationId, current),
    service.startApprovedWorkflow(projectRoot, request.activationId, current)]);
  const first = unwrap(results[0]!);
  assert.deepEqual(first, unwrap(results[1]!));
  assert.equal(first.decision?.source, 'delegated-chief');
  assert.equal((await service.listProjections(projectRoot)).filter(instance => instance.ref.instanceId === first.instanceRef?.instanceId).length, 1);
});

test('approved original snapshots start once after YAML is edited, deleted or replaced by a different source', async t => {
  for (const edit of ['rewrite', 'delete', 'replace-source'] as const) await t.test(edit, async sub => {
    const { directory, dataDir, cleanup } = await fixture(sub);
    const projectRoot = join(directory, 'approved');
    await mkdir(projectRoot);
    let service = new DurableWorkflowService(dataDir, process.cwd());
    cleanup.push(() => service.close());
    const copy = unwrap(await service.copyPreset(projectRoot, 'path-a'));
    const proposal = unwrap(await service.proposeWorkflowStart(await proposalInput(service, projectRoot, 'approved-1', 'project'), current));
    const approved = unwrap(await service.decideWorkflowStart(decision(projectRoot, proposal, 'approve'), current));
    assert.equal(approved.startup?.state, 'waiting');
    assert.equal(await service.owner(projectRoot), undefined);
    service.close();
    const file = join(projectRoot, copy.file);
    if (edit === 'rewrite') await writeFile(file, (await readFile(file, 'utf8')).replace('name: 路径 A', 'name: Edited'));
    else await rm(file);
    service = new DurableWorkflowService(dataDir, edit === 'delete' ? undefined : process.cwd());
    assert.deepEqual(await service.listWorkflowStartProposals(projectRoot), [approved]);
    failure(await service.startApprovedWorkflow(projectRoot, proposal.activationId, () => false), 'workflow-start-source-stale');
    const calls = await Promise.all([service.startApprovedWorkflow(projectRoot, proposal.activationId, current),
      service.startApprovedWorkflow(projectRoot, proposal.activationId, current)]);
    const [first, second] = calls.map(unwrap);
    assert.deepEqual(first, second);
    assert.equal(first?.state, 'started');
    assert.equal(first?.startup?.state, 'created');
    assert.equal(first?.instanceRef?.definitionDigest, approved.definition.digest);
    assert.equal(service.lookup(first!.instanceRef!)?.definitionSource, 'project');
    assert.equal(service.lookup(first!.instanceRef!)?.metadata.summary, approved.requirement.text);
    service.markScheduling(first!.instanceRef!, true);
    assert.equal((await service.listWorkflowStartProposals(projectRoot))[0]?.startup?.state, 'scheduled');
    assert.equal(service.activeProjections().length, 1);
  });
});

test('approval and its job commit together and an already-created instance recovers a lost activation receipt', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const projectRoot = join(directory, 'sqlite-fault');
  await mkdir(projectRoot);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  const sqlite = new DatabaseSync(join(dataDir, 'ans-workflow.sqlite'));
  cleanup.push(() => service.close(), () => sqlite.close());
  const p = unwrap(await service.proposeWorkflowStart(await proposalInput(service, projectRoot), current));
  sqlite.exec("CREATE TRIGGER fail_job BEFORE INSERT ON workflow_start_job BEGIN SELECT RAISE(ABORT,'test job fault'); END");
  failure(await service.decideWorkflowStart(decision(projectRoot, p, 'approve'), current), 'workflow-start-storage-unavailable');
  assert.equal((await service.listWorkflowStartProposals(projectRoot))[0]?.state, 'pending');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM workflow_start_job').get()?.n, 0);
  sqlite.exec('DROP TRIGGER fail_job');
  unwrap(await service.decideWorkflowStart(decision(projectRoot, p, 'approve'), current));
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM workflow_start_job').get()?.n, 1);
  sqlite.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON workflow_start_proposal WHEN new.state='started' BEGIN SELECT RAISE(ABORT,'test receipt fault'); END");
  failure(await service.startApprovedWorkflow(projectRoot, p.activationId, current), 'workflow-start-storage-unavailable');
  assert.equal((await service.listWorkflowStartProposals(projectRoot))[0]?.state, 'approved');
  const instance = service.activeProjections()[0]?.ref;
  assert.ok(instance);
  sqlite.exec('DROP TRIGGER fail_receipt');
  service.close();
  service = new DurableWorkflowService(dataDir);
  const recovered = unwrap(await service.startApprovedWorkflow(projectRoot, p.activationId, current));
  assert.deepEqual(recovered.instanceRef, instance);
  assert.equal(service.activeProjections().length, 1);
});

test('approve and revoke settle once and a competing data directory still owns its original workspace', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const projectRoot = join(directory, 'competing-owner');
  await mkdir(projectRoot);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  const competing = new DurableWorkflowService(join(directory, 'competing-data'), process.cwd());
  cleanup.push(() => service.close(), () => competing.close());
  const input = await proposalInput(service, projectRoot, 'race');
  const pending = unwrap(await service.proposeWorkflowStart(input, current));
  const choices = await Promise.all([service.decideWorkflowStart(decision(projectRoot, pending, 'approve'), current),
    service.decideWorkflowStart(decision(projectRoot, pending, 'revoke'), current)]);
  assert.equal(choices.filter(result => result.ok).length, 1);
  assert.equal(choices.find(result => !result.ok)?.code, 'workflow-start-decision-conflict');
  assert.equal(await service.owner(projectRoot), undefined);
  const p = unwrap(await service.proposeWorkflowStart({ ...input, requirement: { ...input.requirement, inputId: 'next-demand' } }, current));
  unwrap(await service.decideWorkflowStart(decision(projectRoot, p, 'approve'), current));
  const own = unwrap(await competing.start({ projectRoot, definitionId: 'path-a', source: 'preset', requestId: 'original-owner' }));
  const blocked = unwrap(await service.startApprovedWorkflow(projectRoot, p.activationId, current));
  assert.equal(blocked.state, 'approved');
  assert.equal(blocked.startup?.state, 'blocked');
  assert.equal(blocked.startup?.code, 'workflow-workspace-busy');
  assert.equal((await service.owner(projectRoot))?.instanceId, own.ref.instanceId);
  assert.equal(service.activeProjections().length, 0);
});
