import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DURABLE_EVIDENCE_AUDIT_CAPABILITIES, DURABLE_VERIFICATION_CAPABILITIES } from '../../../src/model/durable-workflow.ts';
import { parseProjectModules, parseProjectRoster, PROJECT_MODULES_SCHEMA_EXAMPLE, PROJECT_ROSTER_SCHEMA_EXAMPLE } from '../../../src/common/编排/workflow-preconditions.ts';
import type { DurableCapabilityEvent, DurableResult, DurableTaskBinding, DurableVerificationCapabilitySnapshot } from '../../../src/model/durable-workflow.ts';
import type { ProjectConfig } from '../../../src/model/role.ts';
import { preflightDurableImplementationOwner } from '../../../src/pipeline/orchestration/run-role.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import { readVerificationPlan } from '../../../src/service/durable-workflow/blocked-routing.ts';
import { DurableWorkflowService, parseDefinition, verifyImplementationRetestInputs } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, pathAV8Source, pinPathAV8 } from './fixture.ts';

const current = () => true;
const standard = '---\nverificationRequirements:\n  - {id: AC-1, stage: A12b, capability: workspace-browser, evidence: [browser-input, browser-screenshot]}\n---\n'
  + '```ans-criteria\nschema: ans-criteria/v1\nflowId: tool\nversion: 1\nstatus: final\ncriteria:\n  - {id: AC-1, priority: P0, title: Use the actual page}\n```\n';
const refFor = (text = standard) => ({ path: 'docs/quality/tool-criteria-v1.md', sha256: digest(text) });

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

function capabilities(browser: 'available' | 'candidate-pending' | 'unavailable'): DurableVerificationCapabilitySnapshot {
  return { stage: 'A12a', status: DURABLE_VERIFICATION_CAPABILITIES.map(capability => ({ capability,
    status: capability === 'workspace-browser' ? browser : 'available',
    ...(capability === 'workspace-browser' && browser !== 'available' ? { reason: 'Actual browser is temporarily unavailable.' } : {}) })) };
}

test('v8 opt-in preserves every signed requirement and separates evidence from declared availability', async () => {
  const yaml = await pathAV8Source();
  const definition = unwrap(parseDefinition(yaml));
  assert.equal(definition.version, 8);
  for (const step of ['open-standard', 'implement', 'assess']) assert.equal('blockedRouting' in definition.steps[step]!, true);
  assert.equal(parseDefinition(yaml.replace('blockedRouting: true', 'blockedRouting: false')).ok, false);
  const valid = (text: string) => readVerificationPlan(refFor(text), Buffer.from(text), 'tool', capabilities('candidate-pending'));
  const plan = unwrap(valid(standard));
  assert.equal(plan.requirements[0]?.stage, 'A12b');
  assert.equal(plan.capabilities.status.find(item => item.capability === 'workspace-browser')?.status, 'candidate-pending');
  for (const invalid of [ standard.replace('browser-input, ', ''), standard.replace('stage: A12b', 'stage: A11'),
    standard.replace('verificationRequirements', 'placeholder'), standard.replace('id: AC-1, stage:', 'id: AC-2, stage:'),
    standard.replace('workspace-browser, evidence: [browser-input, browser-screenshot]', 'module-shell, evidence: [command-receipt], command: [echo, passed]'),
  ]) assert.equal(valid(invalid).ok, false);
});

test('v9 admits the exact non-production evidence scope and refuses legacy or foreign ownership', async () => {
  const yaml = await readFile(new URL('../../../docs/workflows/path-a.yaml', import.meta.url), 'utf8');
  const definition = unwrap(parseDefinition(yaml));
  assert.equal(definition.version, 9);
  assert.equal(definition.schema, 2);
  assert.equal(unwrap(parseDefinition(yaml.replace('id: path-a', 'id: external-audit'))).version, 9);
  const role = 'acceptance-evidence-collector';
  const path = 'docs/verification/demo/';
  const module = (text: string) => text.replaceAll('core', 'acceptance-evidence')
    .replace('category: acceptance-evidence', 'category: evidence').replaceAll('src/', path);
  const roster = module(PROJECT_ROSTER_SCHEMA_EXAMPLE).replaceAll('implementer', role);
  assert.equal(parseProjectModules(module(PROJECT_MODULES_SCHEMA_EXAMPLE), 'demo', role).ok, true);
  assert.equal(parseProjectRoster(roster, 'demo', role).ok, true);
  for (const rejected of [roster, roster.replaceAll(path, 'docs/verification/foreign/'), roster.replaceAll(role, 'other-owner')]) {
    assert.equal(parseProjectRoster(rejected, 'demo', rejected === roster ? undefined : role).ok, false);
  }
  const auditStandard = standard.replace('workspace-browser, evidence: [browser-input, browser-screenshot]',
    'external-execution, behavior: Complete the signed scenario, source: external-session, evidence: [execution-session]');
  const snapshot = { stage: 'A12a' as const, status: DURABLE_EVIDENCE_AUDIT_CAPABILITIES.map(capability => ({ capability,
    status: 'unavailable' as const, reason: 'No approved external executor.' })) };
  assert.equal(readVerificationPlan(refFor(standard), Buffer.from(standard), 'tool', snapshot, [], true).ok, false);
  assert.equal(readVerificationPlan(refFor(auditStandard), Buffer.from(auditStandard), 'tool', snapshot, [], true).ok, true);
});

test('strict A11 Node inputs use all actual tracked module paths and read-only options', async t => {
  const { project } = await fixture(t);
  for (const file of ['test/race/first.test.mjs', 'test/race/second.test.mjs', 'elsewhere/other.test.mjs']) {
    await mkdir(join(project, file, '..'), { recursive: true });
    await writeFile(join(project, file), 'export {};\n');
  }
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Tracked Node module tests');
  const candidate = git(project, 'rev-parse', 'HEAD');
  const prove = (...args: string[]) => verifyImplementationRetestInputs(project, candidate, ['test/race/'], ['node', ...args]);
  assert.equal((await prove('--test', '--test-name-pattern', 'signed group', 'test/race/first.test.mjs', 'test/race/second.test.mjs')).ok, true);
  assert.equal((await prove('--check', 'test/race/first.test.mjs')).ok, true);
  for (const args of [
    ['--test'],
    ['--test', 'test/race/first.test.mjs', 'elsewhere/other.test.mjs'],
    ['--test', '--', 'test/race/first.test.mjs', '../outside.mjs'],
    ['--test', 'test/race/first.test.mjs', 'test/race/not-tracked.test.mjs'],
    ['--test', join(project, 'test/race/first.test.mjs')],
    ['--test', '--test-reporter-destination=result.out', 'test/race/first.test.mjs'],
    ['--test', '--test-update-snapshots', 'test/race/first.test.mjs'],
  ]) assert.equal((await prove(...args)).ok, false, args.join(' '));
  assert.equal((await verifyImplementationRetestInputs(project, candidate, ['test/race/', 'elsewhere/'], ['node', '--test'])).ok, true);
});

test('A11 owner preflight proves the directory as well as its exact dry probe', async t => {
  const { project, directory } = await fixture(t);
  const roles: ProjectConfig['roles'] = {};
  async function role(id: string, entries: readonly { path: string; kind: string }[]) {
    const root = '角色卡/' + id;
    await mkdir(join(project, root), { recursive: true });
    const card = root + '/role-card.md';
    const boundary = root + '/boundary.yaml';
    await writeFile(join(project, card), '# Implementation owner\n');
    await writeFile(join(project, boundary), `role: ${id}\nentries:\n` + entries.map(entry =>
      `  - root: project\n    kind: ${entry.kind}\n    path: ${entry.path}\n    purpose: fixture task\n`).join(''));
    roles[id] = { card, boundary };
  }
  const probe = '__ans_write_preflight__';
  await role('directory-owner', [{ path: 'entry/', kind: 'directory' }, { path: 'manifest.json', kind: 'file' }]);
  await role('narrow-owner', [{ path: 'entry/' + probe, kind: 'file' }, { path: 'entry/narrow/', kind: 'directory' }]);
  const config: ProjectConfig = { projectRoot: project, skillRoot: project, governanceModel: 'trio', roles, builtInRoles: ['verifier'],
    governanceBoundary: { path: '', acceptance: { accepted: true, source: 'fixture customer approval' } } };
  const inspect = (roleId: string, ...paths: string[]) => preflightDurableImplementationOwner({ project: config, roleId, paths });
  await mkdir(join(project, 'entry'), { recursive: true });
  assert.deepEqual(await inspect('directory-owner', 'entry/', 'entry/new-module/', 'manifest.json'), { ok: true, value: true });
  await assert.rejects(lstat(join(project, 'entry', probe)), { code: 'ENOENT' });
  assert.equal((await inspect('narrow-owner', 'entry/' + probe)).ok, true);
  assert.equal((await inspect('narrow-owner', 'entry/')).ok, false);
  assert.equal((await inspect('verifier', 'entry/')).ok, false);
  for (const path of ['entry/../entry/', 'entry//', 'entry\\sub/', '../entry/', 'manifest-other.json']) {
    assert.equal((await inspect('directory-owner', path)).ok, false, path);
  }
  const unaccepted: ProjectConfig = { ...config, governanceBoundary: { path: '', acceptance: { accepted: false, source: 'fixture pending' } } };
  assert.equal((await preflightDurableImplementationOwner({ project: unaccepted, roleId: 'directory-owner', paths: ['entry/'] })).ok, false);
  await t.test('existing real-path gate rejects internal aliases and external junctions', async linkTest => {
    const outside = join(directory, 'outside');
    await mkdir(outside);
    await mkdir(join(project, 'actual'));
    try {
      await symlink(outside, join(project, 'entry/external'), 'junction');
      await symlink(join(project, 'actual'), join(project, 'entry/alias'), 'junction');
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      linkTest.skip('This Windows test host does not grant junction creation.');
      return;
    }
    assert.equal((await inspect('directory-owner', 'entry/external/')).ok, false);
    assert.equal((await inspect('directory-owner', 'entry/alias/')).ok, false);
  });
});

for (const reportStatus of ['completed', 'blocked'] as const) test(`known unavailable A12a parks a ${reportStatus} author report until actual capability proof`, async t => {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  await pinPathAV8(definitions);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const definition = unwrap(await service.validateDefinition(project, 'path-a', { source: 'project' }));
  const text = 'Choose and verify the current actual page.';
  const activation = unwrap(await service.proposeWorkflowStart({ projectRoot: project, definitionId: definition.id, source: 'project',
    expectedDigest: definition.digest, reason: 'New fixture page', requirement: { inputId: 'test', turnId: 'start', text, digest: digest(text), runtime: 'claude' } }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: activation.activationId, requestId: activation.requestId, action: 'approve' }, current));
  const ref = unwrap(await service.startApprovedWorkflow(project, activation.activationId, current)).instanceRef!;
  const branch = 'ans/task/' + ref.instanceId;
  git(project, 'switch', '-c', branch);
  const oid = git(project, 'rev-parse', 'HEAD');
  const address = { stepId: 'open-standard', attempt: 1, flowId: 'tool' };
  const task: DurableTaskBinding = { taskId: 'current-verifier', roleId: 'verifier', stage: 'A12a', stageAttempt: 1,
    executionAttempt: 1, parentTaskId: ref.instanceId };
  const doc = refFor();
  service.close();
  const ledger = new DurableLedger(dataDir);
  const value = ledger.instance(ref.instanceId)!;
  Object.assign(value, { stepId: address.stepId, entry: 11, baseline: { branch, oid }, engine: 'healthy' });
  Object.assign(value.graph!, { flowId: 'tool', proofs: { appointed: 'appointment', 'team-plan': 'plan' } });
  value.graph!.tasks.push({ ...address, task, taskId: task.taskId, roleId: task.roleId, state: 'pending', baselineOid: oid,
    capability: 'independent-standard', dispatch: { actor: 'application', text }, reviewWritePath: doc.path, verificationCapabilities: capabilities('unavailable') });
  ledger.save(value);
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const model = unwrap(service.claimEffect(ref, { ...address, key: 'model:' + task.taskId, kind: 'model-send', task,
    expected: { roleId: task.roleId, runtime: 'claude' } }));
  unwrap(service.settleEffect(ref, { key: model.key, token: model.token, outcome: 'succeeded', evidence: 'Observed actual role turn.', result: { turnId: 'standard-turn' } }));
  const write = unwrap(service.claimEffect(ref, { ...address, key: 'standard-write', kind: 'task-write', task,
    expected: { paths: [doc.path], contentSha256: doc.sha256 } }));
  await mkdir(join(project, 'docs/quality'), { recursive: true });
  await writeFile(join(project, doc.path), standard);
  unwrap(service.settleEffect(ref, { key: write.key, token: write.token, outcome: 'succeeded', evidence: 'Observed actual criteria write.' }));
  const reportKey = 'report:standard-report';
  const report = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId: 'standard-report', taskId: task.taskId, status: reportStatus,
    origin: 'submitted-report', source: { roleId: task.roleId, turnId: 'standard-turn', runtime: 'claude' }, summary: { text: 'Authored actual standard.' } } }));
  unwrap(await service.submitCapability(ref, { ...address, key: reportKey, source: { roleId: task.roleId, originId: 'standard-turn', parentTaskId: task.taskId },
    input: { kind: 'task-report', task, evidence: report } }));
  if (reportStatus === 'blocked') assert.deepEqual(service.apply({ ref, ...address, entry: 11, turn: 0 }), { entry: 11 });
  const close = () => service.submitCapability(ref, { ...address, key: 'close-standard', source: { roleId: 'host', originId: task.taskId, parentTaskId: ref.instanceId },
    input: { kind: 'task-closed', task, reportKey, outcome: reportStatus === 'completed' ? 'accepted' : 'rejected', documents: [doc] } });
  const initial = await close();
  assert.equal(initial.ok ? undefined : initial.code, 'verification-capability-unavailable');
  const scope = service.lookup(ref)!.blockedRouting!;
  assert.equal(scope.capability, 'workspace-browser');
  assert.deepEqual(scope.options.map(item => item.id), ['wait', 'stop']);
  assert.equal((await service.submitCapability(ref, { ...address, key: 'forged-choice', source: { roleId: 'host', originId: ref.instanceId },
    input: { kind: 'blocked-scope-decided', decision: { ...scope.binding, option: 'wait', provenance: { source: 'customer' } } } }, current)).ok, false);
  const choice = { ...scope.binding, option: 'wait', provenance: { source: 'customer' } } as const;
  assert.equal((await service.decideBlockedScopeChange(ref, { ...choice, option: 'revise' }, current)).ok, false);
  assert.equal((await service.decideBlockedScopeChange(ref, choice, () => false)).ok, false);
  await writeFile(join(project, doc.path), standard + 'Drift');
  assert.equal((await service.decideBlockedScopeChange(ref, choice, current)).ok, false);
  await writeFile(join(project, doc.path), standard);
  const decided = unwrap(await service.decideBlockedScopeChange(ref, choice, current));
  assert.deepEqual(service.apply({ ref, ...address, entry: 11, turn: 0 }), { entry: 11 });
  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.deepEqual(unwrap(await service.decideBlockedScopeChange(ref, choice, current)), decided);
  assert.equal((await service.resumeBlockedScopeChange(ref, scope.binding.requestId, async () => ({ ok: true, value: capabilities('candidate-pending') }), current)).ok, false);
  unwrap(await service.resumeBlockedScopeChange(ref, scope.binding.requestId, async () => ({ ok: true, value: capabilities('available') }), current));
  if (reportStatus === 'blocked') {
    assert.equal(service.lookup(ref)?.blockedRouting?.resumePending, true);
    assert.equal(service.apply({ ref, ...address, entry: 11, turn: 1 }).next, 'open-standard');
    assert.equal(service.lookup(ref)?.attempt, 2);
    assert.equal(service.lookup(ref)?.pendingTasks?.find(item => item.taskId === task.taskId)?.outcome, 'rework');
    assert.equal(service.lookup(ref)?.verificationPlan, undefined);
  } else {
    assert.equal(service.lookup(ref)?.blockedRouting, undefined);
    unwrap(await close());
    assert.equal(service.apply({ ref, ...address, entry: 11, turn: 1 }).next, 'implement');
    assert.equal(service.lookup(ref)?.verificationPlan?.standard.sha256, doc.sha256);
  }
});
