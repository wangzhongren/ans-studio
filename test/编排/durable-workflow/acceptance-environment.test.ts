import assert from 'node:assert/strict';
import { appendFile, lstat, mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { PROJECT_MODULES_SCHEMA_EXAMPLE, PROJECT_ROSTER_SCHEMA_EXAMPLE } from '../../../src/common/编排/workflow-preconditions.ts';
import { appendTaskEvent, readTaskState, taskEvent, tasksStatePath } from '../../../src/common/编排/task-state.ts';
import type { DurableAcceptanceEnvironmentMissing, DurableCapabilityEvent, DurableEffectIntent, DurablePendingTask, DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import { preflightScriptVerified } from '../../../src/service/durable-workflow/acceptance-environment.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService, parseDefinition } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, pathAV7Source, pinPathAV7 } from './fixture.ts';

const preset = pathAV7Source;
const current = () => true;
const previousPreset = (source: string) => source.replace('version: 7', 'version: 6')
  .replace(', environment-missing: open-recovery', '')
  .replace(/  open-recovery:\r?\n[\s\S]+?(?=  revise-implementation:)/, '');

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

test('v7 declares a bounded recovery loop with the original assessment as its only success target', async () => {
  const source = (await preset()).replaceAll('\r\n', '\n');
  const parsed = unwrap(parseDefinition(source));
  assert.equal(parsed.version, 7);
  const custom = source.replaceAll('assess:', 'review-written:').replaceAll(': assess', ': review-written')
    .replaceAll('open-recovery:', 'check-budget:').replaceAll(': open-recovery', ': check-budget')
    .replaceAll('restore-environment:', 'schedule-recovery:').replaceAll(': restore-environment', ': schedule-recovery');
  const budget = unwrap(parseDefinition(custom)).steps['check-budget'];
  assert.ok(budget && 'action' in budget);
  assert.equal(budget.maxVisits, 2);
  for (const invalid of [
    custom.replace('restored: review-written', 'restored: archive'),
    custom.replace('retryable: check-budget', 'retryable: schedule-recovery'),
    custom.replace('environment-missing: check-budget', 'environment-missing: schedule-recovery'),
    custom.replace('next: schedule-recovery', 'next: archive'),
    custom.replace('maxVisits: 2\n    next: schedule-recovery', 'maxVisits: 3\n    next: schedule-recovery'),
    custom.replace('maxVisits: 2\n    next: schedule-recovery', 'next: schedule-recovery'),
  ]) {
    assert.equal(parseDefinition(invalid).ok, false, invalid);
  }
  const prior = unwrap(parseDefinition(previousPreset(source)));
  assert.equal(prior.version, 6);
  const oldAssessment = prior.steps.assess;
  assert.ok(oldAssessment && 'action' in oldAssessment);
  assert.deepEqual(Object.keys(oldAssessment.on!).sort(), ['accepted', 'blocked', 'rework']);
  assert.equal(prior.steps['open-recovery'], undefined);
});

test('a live v6 instance reopens on its prior digest when the project file updates to v7', async t => {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  const latest = await preset();
  const file = join(definitions, 'path-a.yaml');
  const prior = unwrap(parseDefinition(previousPreset(latest)));
  await writeFile(file, previousPreset(latest));
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const { ref } = unwrap(await service.start({ projectRoot: project, definitionId: 'path-a', source: 'project', requestId: 'frozen-v6',
    expectedDigest: prior.digest, metadata: { summary: 'Fixture active acceptance project.' } }));
  service.close();
  await writeFile(file, latest);
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.equal(unwrap(await service.validateDefinition(project, 'path-a', { source: 'project' })).version, 7);
  const reopened = service.lookup(ref)!;
  assert.equal(reopened.ref.definitionVersion, 6);
  assert.equal(reopened.ref.definitionDigest, prior.digest);
  assert.equal(reopened.acceptanceEnvironment, undefined);
});

async function setup(t: TestContext, preflightFixture = false) {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  await pinPathAV7(definitions);
  const write = async (path: string, contents: string) => {
    await mkdir(join(project, path, '..'), { recursive: true });
    await writeFile(join(project, path), contents);
    return { path, sha256: digest(contents) };
  };
  const manifestText = preflightFixture ? '{"scripts":{"build":"tsc --noEmit && vite build","dev":"vite"},' +
    '"devDependencies":{"typescript":"^5.9.0","vite":"^7.0.0"}}'
    : '{"scripts":{"build":"vite build"},"devDependencies":{"vite":"^7.0.0"}}';
  const criteriaText = preflightFixture ? '在干净的约定环境按交付说明安装/启动。'
    : 'Acceptance requires npm run build and a browser smoke test.';
  const manifest = await write('package.json', manifestText);
  const criteria = await write('docs/quality/game-criteria-v1.md', criteriaText);
  const plan = await write('docs/scheduling/game-team-v1.md', 'Approved team plan and protected package manifest.');
  const roleId = 'frontend';
  await write('docs/product/game-intent-v1.md', 'Build a racing game.');
  await write('docs/proposals/game-proposal-v1.md', 'schema: project-proposal/v2\ndocs/product/game-intent-v1.md');
  await write('docs/contracts/game-architecture-v1.md', 'docs/proposals/game-proposal-v1.md');
  await write('docs/proposals/game-modules-v1.md', PROJECT_MODULES_SCHEMA_EXAMPLE.replaceAll('demo', 'game').replaceAll('src/', 'package.json'));
  const roster = await write('docs/proposals/game-roster-v1.md', PROJECT_ROSTER_SCHEMA_EXAMPLE.replaceAll('demo', 'game')
    .replaceAll('implementer', roleId).replaceAll('src/', 'package.json'));
  const documents = await Promise.all(['role-card.md', 'boundary.md', 'boundary.yaml']
    .map(name => write('角色卡/' + roleId + '/' + name, name)));
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Approved candidate');
  const candidateOid = git(project, 'rev-parse', 'HEAD');
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const definition = unwrap(await service.validateDefinition(project, 'path-a', { source: 'project' }));
  const text = 'Implement the racing game.';
  const proposal = unwrap(await service.proposeWorkflowStart({
    projectRoot: project, definitionId: 'path-a', source: 'project', reason: 'New project', expectedDigest: definition.digest,
    requirement: { inputId: 'demand', turnId: 'selection', text, digest: digest(text), runtime: 'claude' },
  }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: proposal.activationId,
    requestId: proposal.requestId, action: 'approve' }, current));
  const started = unwrap(await service.startApprovedWorkflow(project, proposal.activationId, current));
  const ref = started.instanceRef!;
  const branch = 'ans/task/' + ref.instanceId;
  git(project, 'switch', '-c', branch);
  service.engineStatus('healthy', undefined, ref);
  const operatorReport = unwrap(service.storeEvidence(ref, { status: 'completed' }));
  service.close();
  const ledger = new DurableLedger(dataDir);
  const value = ledger.instance(ref.instanceId)!;
  const writeSets = [{ roleId, paths: ['package.json'] }];
  Object.assign(value, { stepId: 'assess', entry: 13, baseline: { branch, oid: candidateOid },
    implementation: { kind: 'implementation-accepted', key: 'accepted-implementation', stepId: 'implement', attempt: 1,
      source: 'convener', reportKey: 'accepted-implementation', operatorReport, task: {
        stage: 'A11', stageAttempt: 1, executionAttempt: 1, parentTaskId: 'implementation-parent', taskId: 'implementation-child', roleId,
      } },
  });
  Object.assign(value.graph!, { flowId: 'game', expectedRoles: [roleId], activatedRoles: [roleId],
    approvedProposalRequestId: 'approved-proposal', proposalRoster: roster, writeSets,
    proofs: { appointed: 'appointment', 'team-plan': 'team', 'standard-open': 'standard', implementationTip: candidateOid },
  });
  value.graph!.tasks.push({ capability: 'independent-standard', stepId: 'open-standard', attempt: 1, flowId: 'game',
    roleId: 'verifier', taskId: 'standard-task', state: 'accepted', outcome: 'accepted', baselineOid: candidateOid,
    task: { stage: 'A12a', stageAttempt: 1, executionAttempt: 1, parentTaskId: ref.instanceId, taskId: 'standard-task', roleId: 'verifier' },
    dispatch: { text: 'Write standard', actor: 'application', flowId: 'game' }, documents: [criteria],
  });
  function record(stepId: string, key: string, input: DurableCapabilityEvent['input']) {
    const event = { key, stepId, attempt: 1, flowId: 'game', source: { roleId: 'host', originId: 'test-basis' }, input };
    ledger.saveFact(ref.instanceId, storedFact({ kind: 'capability-event', source: 'host', key, stepId, attempt: 1, event }, { key, state: 'consumed' }));
  }
  record('establish-team-baseline', 'team', { kind: 'baseline-verified', effectKey: 'team-baseline',
    baselineOid: candidateOid, branch, writeSets, documents: [plan] });
  record('activate-roles', 'activated:' + roleId, { kind: 'role-activated', roleId, documents, proposalRequestId: 'approved-proposal' });
  ledger.save(value);
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  let entry = 13;
  function advance() {
    const view = service.lookup(ref)!;
    const result = service.apply({ ref, stepId: view.stepId, entry, turn: 0 });
    entry = result.entry;
    return result.next ?? result.terminal;
  }
  function restart() {
    service.close();
    service = new DurableWorkflowService(dataDir, process.cwd());
  }
  function model(task: DurablePendingTask, turnId: string, key = 'model:' + task.taskId) {
    const intent: DurableEffectIntent = { stepId: task.stepId, attempt: task.attempt, kind: 'model-send', key, task: task.task,
      expected: { roleId: task.roleId, runtime: 'claude' } };
    const result = service.claimEffect(ref, intent);
    if (task.environmentRecovery) {
      assert.equal(result.ok ? undefined : result.code, 'evidence-audit-execution-retired');
      // These enqueue and reconciliation fixtures retain the model delivery that an old host already settled.
      const ledger = new DurableLedger(dataDir);
      try {
        const token = 'historical:' + key;
        ledger.saveEffect(ref.instanceId, { intent, token, state: 'succeeded', result: { key, token, outcome: 'succeeded',
          evidence: 'Historical fixture delivery', result: { turnId } } });
      } finally { ledger.close(); }
      return;
    }
    const claim = unwrap(result);
    assert.equal(claim.execute, true);
    unwrap(service.settleEffect(ref, { key, token: claim.token, outcome: 'succeeded', evidence: 'Fixture observed model delivery.', result: { turnId } }));
  }
  function report(task: DurablePendingTask, turnId: string, status: 'completed' | 'blocked') {
    const reportId = 'test-' + task.taskId;
    const evidence = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId, taskId: task.taskId, status,
      origin: 'submitted-report', summary: { text: 'Fixture formal handback' }, source: { roleId: task.roleId, runtime: 'claude', turnId } } }));
    return { key: 'report:' + reportId, evidence };
  }
  function installReceipt(child: DurablePendingTask, result: 'installed' | 'retryable') {
    return unwrap(service.storeEvidence(ref, { kind: 'npm-environment-install', taskId: child.taskId, turnId: 'child-' + child.attempt,
      candidateOid, decision: 'allowed', reviewedBy: 'test-approval', result, process: { status: 'exited', pid: 42,
        exitCode: result === 'installed' ? 0 : 1, outputDigest: digest('simulated output'), transientNetworkFailure: result === 'retryable' },
    })).sha256;
  }
  async function pendingAssessment() {
    const view = unwrap(await service.prepareWorkflowDispatch(ref, async () => ({ ok: true, value: true })));
    const basis = view.acceptanceEnvironment!.basis!;
    const task = view.pendingTasks!.find(item => item.taskId === basis.assessmentTask.taskId)!;
    return { basis, task };
  }
  async function assessment() {
    const { basis, task } = await pendingAssessment();
    const originId = 'review-' + task.attempt;
    model(task, originId);
    const { key, evidence } = report(task, originId, 'blocked');
    const missing: DurableAcceptanceEnvironmentMissing = { basis, reportKey: key, report: evidence, originId, manifest,
      condition: { kind: 'npm-local-executable', script: 'build', executable: 'vite' } };
    return { task, missing };
  }
  async function recovery() {
    const view = unwrap(await service.prepareWorkflowDispatch(ref));
    assert.deepEqual(view.acceptanceEnvironment!.eligibleRoleIds, [roleId]);
    const parent = view.pendingTasks!.find(item => item.taskId === view.acceptanceEnvironment!.parentTask!.taskId)!;
    const originId = 'convener-' + view.attempt;
    model(parent, originId);
    const request = { parentTask: parent.task, roleId, originId, requestId: 'request-' + view.attempt };
    assert.equal((await service.dispatchAcceptanceEnvironment(ref, { ...request, roleId: 'verifier' }, current)).ok, false);
    const received = unwrap(await service.dispatchAcceptanceEnvironment(ref, request, current));
    assert.deepEqual(unwrap(await service.dispatchAcceptanceEnvironment(ref, request, current)), received);
    const assigned = service.lookup(ref)!;
    const child = assigned.pendingTasks!.find(item => item.taskId === assigned.acceptanceEnvironment!.childTask!.taskId)!;
    assert.equal(service.taskGitScope(ref, child.taskId, child.roleId), undefined);
    model(child, 'child-' + child.attempt);
    return { parent, child, operation: { stepId: child.stepId, attempt: child.attempt, kind: 'environment-install' as const,
      key: assigned.acceptanceEnvironment!.effectKey!, task: child.task } };
  }
  async function close(child: DurablePendingTask, parent: DurablePendingTask, status: 'completed' | 'blocked') {
    const turnId = 'child-' + child.attempt;
    const { key, evidence } = report(child, turnId, status);
    unwrap(await service.submitCapability(ref, { key, stepId: child.stepId, attempt: child.attempt, flowId: child.flowId,
      source: { roleId: child.roleId, originId: turnId, parentTaskId: child.taskId }, input: { kind: 'task-report', task: child.task, evidence } }));
    const wake = 'wake-' + child.attempt;
    model(parent, wake, 'model:environment-recovery-wake:' + child.taskId + ':' + key);
    return { parentTask: parent.task, childTask: child.task, originId: wake };
  }
  return { project, get service() { return service; }, ref, criteria, manifest, candidateOid, branch,
    advance, restart, assessment, pendingAssessment, recovery, close, installReceipt, criteriaText };
}

test('the formal handback path verifies actual command evidence and returns to the same candidate', async t => {
  const x = await setup(t);
  const { ref } = x;
  const { task, missing } = await x.assessment();
  assert.equal((await x.service.submitCapability(ref, { key: 'forged', stepId: task.stepId, attempt: task.attempt, flowId: task.flowId,
    source: { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId }, input: { kind: 'environment-missing', missing } }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, { ...missing, commandReceiptId: 'forged' }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, { ...missing, basis: { ...missing.basis, candidateOid: '0'.repeat(40) } },
    current)).ok, false);
  const observed = { stepId: task.stepId, attempt: task.attempt, kind: 'acceptance-check-command' as const,
    key: 'acceptance-check-command:' + task.taskId + ':' + digest('command-1'), task: task.task };
  const check = unwrap(x.service.claimEffect(ref, observed));
  unwrap(x.service.settleEffect(ref, { key: check.key, token: check.token, outcome: 'succeeded', evidence: 'Fixture observed exit.',
    result: { script: 'build', turnId: missing.originId, decision: 'allowed', verifiedExit: '1', missingExecutable: 'vite', receiptId: 'observed-check' } }));
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)).ok, false);
  const checkedMissing = { ...missing, commandReceiptId: 'observed-check' };
  const verdict = unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, checkedMissing, current));
  assert.deepEqual(unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, { ...checkedMissing, origin: 'report' }, current)), verdict);
  assert.equal(x.advance(), 'open-recovery');
  assert.equal(x.advance(), 'restore-environment');
  const { parent, child, operation } = await x.recovery();
  const claim = unwrap(x.service.claimEffect(ref, operation));
  assert.equal(claim.execute, true);
  x.restart();
  const replay = unwrap(x.service.claimEffect(ref, operation));
  assert.equal(replay.execute, false);
  assert.equal(replay.token, claim.token);
  const commandReceiptId = x.installReceipt(child, 'installed');
  unwrap(x.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded', evidence: 'Fixture observed install.',
    result: { commandReceiptId } }));
  const binding = await x.close(child, parent, 'completed');
  const verification = unwrap(x.service.storeEvidence(ref, { kind: 'npm-local-executable-verified', candidateOid: x.candidateOid,
    criteria: x.criteria, manifest: x.manifest, commandReceiptId, taskId: child.taskId, executable: 'vite' }));
  const final = { ...binding, outcome: { kind: 'restored' as const, verification, commandReceiptId } };
  assert.equal((await x.service.settleAcceptanceEnvironment(ref, { ...final, originId: 'previous-turn' }, current)).ok, false);
  unwrap(await x.service.settleAcceptanceEnvironment(ref, final, current));
  assert.equal(x.advance(), 'assess');
  const next = unwrap(await x.service.prepareWorkflowDispatch(ref, async () => ({ ok: true, value: true }))).acceptanceEnvironment!;
  assert.equal(next.attempts, 1);
  assert.equal(next.state, 'rechecking');
  assert.equal(next.basis?.candidateOid, x.candidateOid);
  assert.equal(next.basis?.branch, x.branch);
  assert.deepEqual(next.basis?.criteria, x.criteria);
  assert.notEqual(next.basis?.assessmentTask.taskId, task.taskId);
  unwrap(await x.service.settleAcceptanceEnvironment(ref, final, current));
  assert.equal(x.service.lookup(ref)?.stepId, 'assess');
});

test('a host preflight binds the compound-build candidate before dispatch and retires that assessment across reopen', async t => {
  const x = await setup(t, true);
  const { ref } = x;
  const { basis, task } = await x.pendingAssessment();
  const missing = { origin: 'preflight', basis, manifest: x.manifest,
    condition: { kind: 'npm-local-executable', script: 'dev', executable: 'vite' } } as const;
  const address = { stepId: task.stepId, attempt: task.attempt };
  const source = { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId };
  assert.equal((await x.service.submitCapability(ref, { ...address, key: 'forged-preflight', flowId: task.flowId, source,
    input: { kind: 'environment-missing', missing } }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, { ...missing, condition: { ...missing.condition,
    script: 'build' } }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, { ...missing, condition: { ...missing.condition,
    executable: 'typescript' } }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, { ...missing, basis: { ...basis,
    assessmentTask: { ...task.task, stageAttempt: task.attempt + 1 } } }, current)).ok, false);
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing({ ...ref, definitionDigest: '0'.repeat(64) }, missing,
    current)).ok, false);
  await mkdir(join(x.project, 'node_modules'));
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)).ok, false);
  await rmdir(join(x.project, 'node_modules'));
  await writeFile(join(x.project, x.criteria.path), 'This replaced the approved standard.');
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)).ok, false);
  await writeFile(join(x.project, x.criteria.path), x.criteriaText);
  const priorTaskId = 'prior-implementation-closure';
  assert.equal((await appendTaskEvent(x.project, taskEvent('task.created', { taskId: priorTaskId, from: 'convener', to: 'frontend',
    flowId: task.flowId, workflowId: ref.instanceId, stage: 'A11', text: 'Earlier implementation', sideEffect: 'code',
    idempotencyKey: priorTaskId }))).ok, true);
  assert.equal((await appendTaskEvent(x.project, taskEvent('task.closed', { taskId: priorTaskId, by: 'convener',
    outcome: 'accepted', operationId: 'earlier-close', eventId: 'earlier-close' }))).ok, true);
  assert.deepEqual((await readTaskState(x.project)).errors.map(error => error.message), ['task.closed direct creator/source binding invalid']);
  const results = await Promise.all(Array.from({ length: 3 }, () => x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)));
  assert.deepEqual(results.map(unwrap), Array(3).fill(unwrap(results[0]!)));
  x.restart();
  assert.deepEqual(unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)), unwrap(results[0]!));
  assert.equal(x.service.claimEffect(ref, { ...address, kind: 'dispatch', key: 'dispatch:' + task.taskId, task: task.task }).ok, false);
  assert.equal(x.service.claimEffect(ref, { ...address, kind: 'model-send', key: 'model:' + task.taskId, task: task.task,
    expected: { roleId: task.roleId, runtime: 'claude' } }).ok, false);
  assert.equal(x.service.listEffects(ref).some(effect => effect.intent.task?.taskId === task.taskId), false);
  assert.equal(x.advance(), 'open-recovery');
  assert.equal(x.advance(), 'restore-environment');
  await x.recovery();
  assert.equal(x.service.lookup(ref)?.acceptanceEnvironment?.attempts, 1);
  const facts = x.service.listCapabilityEvents(ref).filter(row => row.event.input.kind === 'environment-missing');
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.receipt.state, 'consumed');
  assert.deepEqual(facts[0]?.event.input, { kind: 'environment-missing', missing });
  assert.equal(x.service.lookup(ref)?.pendingTasks?.find(item => item.taskId === task.taskId)?.report, undefined);
});

test('a private restore pins its approved slot and tree proof across reopen without changing the project installation', async t => {
  const x = await setup(t, true);
  const { ref } = x;
  const { basis, task } = await x.pendingAssessment();
  const missing = { origin: 'preflight', installTarget: 'assessment-private', basis, manifest: x.manifest,
    condition: { kind: 'npm-local-executable', script: 'dev', executable: 'vite' } } as const;
  assert.equal((await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current)).ok, false);
  const original = join(x.project, 'node_modules');
  await mkdir(original);
  await writeFile(join(original, 'keep.txt'), 'original dependency tree');
  const source = { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId };
  assert.equal((await x.service.submitCapability(ref, { stepId: task.stepId, attempt: task.attempt, key: 'forged-private', flowId: task.flowId,
    source, input: { kind: 'environment-missing', missing } }, current)).ok, false);
  unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current));
  assert.equal(x.advance(), 'open-recovery');
  assert.equal(x.advance(), 'restore-environment');

  const { child, parent, operation } = await x.recovery();
  const stagingDirectory = join(x.project, '.ans', 'acceptance-npm-Ab0123');
  const publishParent = join(x.project, '.ans', 'acceptance-deps', child.taskId);
  const publishDirectory = join(publishParent, 'node_modules');
  await mkdir(stagingDirectory);
  await mkdir(publishParent, { recursive: true });
  async function identity(path: string) {
    const { dev, ino } = await lstat(path, { bigint: true });
    return { dev: dev.toString(), ino: ino.toString() };
  }
  const stagingIdentity = await identity(stagingDirectory);
  const publishIdentity = await identity(publishParent);
  const turnId = 'child-' + child.attempt;
  const argv = ['npm', 'install', '--ignore-scripts', '--no-package-lock', '--prefix=' + stagingDirectory];
  const expected = { installTarget: missing.installTarget, publishDirectory, publishDev: publishIdentity.dev, publishIno: publishIdentity.ino,
    stagingDirectory, stagingDev: stagingIdentity.dev, stagingIno: stagingIdentity.ino, criteriaSha256: x.criteria.sha256,
    candidateOid: x.candidateOid, manifestSha256: x.manifest.sha256, turnId, toolCallId: 'tool-restore', argv };
  for (const bad of [{ ...expected, publishDirectory: original }, { ...expected, publishIno: '-1' },
    { ...expected, candidateOid: '0'.repeat(40) }, { ...expected, turnId: 'old-turn' }]) {
    assert.equal(x.service.claimEffect(ref, { ...operation, expected: bad }).ok, false);
  }
  assert.equal(x.service.claimEffect(ref, operation).ok, false);
  await mkdir(publishDirectory);
  assert.equal(x.service.claimEffect(ref, { ...operation, expected }).ok, false);
  await rmdir(publishDirectory);
  const claim = unwrap(x.service.claimEffect(ref, { ...operation, expected }));
  assert.equal(claim.execute, true);
  x.restart();
  const replay = unwrap(x.service.claimEffect(ref, { ...operation, expected }));
  assert.equal(replay.execute, false);
  assert.equal(replay.token, claim.token);
  assert.equal(x.service.claimEffect(ref, { ...operation, expected: { ...expected, publishDirectory: original } }).ok, false);

  await mkdir(publishDirectory);
  await writeFile(join(publishDirectory, 'test-dependency.js'), 'exact fixture byte set');
  const installed = { dependenciesLocation: { path: publishDirectory, identity: await identity(publishDirectory) },
    dependenciesSha256: digest('fixture byte set digest') };
  const scope = { kind: 'application-isolated-npm-restore', projectRoot: x.project, stagingDirectory, stagingIdentity,
    publishDirectory, publishIdentity, instanceId: ref.instanceId, flowId: child.flowId, stepId: child.stepId, attempt: child.attempt,
    taskId: child.taskId, roleId: child.roleId, turnId, toolCallId: expected.toolCallId, effectKey: operation.key,
    candidateOid: x.candidateOid, criteriaSha256: x.criteria.sha256, manifestSha256: x.manifest.sha256 };
  const receipt = { kind: 'npm-environment-install', taskId: child.taskId, turnId, toolCallId: expected.toolCallId, cwd: stagingDirectory,
    argv, candidateOid: x.candidateOid, acceptanceEnvironmentScope: scope, decision: 'allowed', reviewedBy: 'test-approval', result: 'installed',
    process: { status: 'exited', pid: 42, exitCode: 0, outputDigest: digest('simulated output') }, ...installed };
  const settle = (proof: unknown) => x.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded',
    evidence: 'Fixture install proof.', result: { commandReceiptId: unwrap(x.service.storeEvidence(ref, proof)).sha256 } });
  for (const bad of [{ ...receipt, decision: 'denied' }, { ...receipt, argv: [...argv, '--global'] },
    { ...receipt, acceptanceEnvironmentScope: { ...scope, publishIdentity: stagingIdentity } },
    { ...receipt, dependenciesLocation: { ...installed.dependenciesLocation, path: original } }]) {
    assert.equal(settle(bad).ok, false);
  }
  const commandReceiptId = unwrap(settle(receipt)).result!.result!.commandReceiptId as string;
  const binding = await x.close(child, parent, 'completed');
  const body = { kind: 'npm-local-executable-verified', candidateOid: x.candidateOid, criteria: x.criteria, manifest: x.manifest,
    commandReceiptId, taskId: child.taskId, executable: 'vite', ...installed };
  const close = (proof: unknown) => x.service.settleAcceptanceEnvironment(ref, { ...binding, outcome: { kind: 'restored', commandReceiptId,
    verification: unwrap(x.service.storeEvidence(ref, proof)) } }, current);
  assert.equal((await close({ ...body, dependenciesSha256: digest('different tree') })).ok, false);
  const moved = join(publishParent, 'test-rotated-tree');
  await rename(publishDirectory, moved);
  await mkdir(publishDirectory);
  assert.equal((await close(body)).ok, false);
  await rmdir(publishDirectory);
  await rename(moved, publishDirectory);
  unwrap(await close(body));
  assert.equal(x.advance(), 'assess');
  assert.equal(x.service.lookup(ref)?.acceptanceEnvironment?.attempts, 1);
  assert.equal(await readFile(join(original, 'keep.txt'), 'utf8'), 'original dependency tree');
});

test('preflight refuses an already journaled or claimed independent assessment', async t => {
  for (const prior of ['task-journal', 'dispatch-settled', 'model-claimed', 'current-invalid-closure', 'unknown-invalid-closure',
    'malformed-journal', 'unreadable-journal'] as const) {
    await t.test(prior, async subtest => {
      const x = await setup(subtest, true);
      const { ref } = x;
      const { basis, task } = await x.pendingAssessment();
      if (prior === 'task-journal') {
        const result = await appendTaskEvent(x.project, taskEvent('task.created', { taskId: task.taskId, from: 'chief', to: task.roleId,
          flowId: task.flowId, workflowId: ref.instanceId, stage: 'A12b', text: 'Already recorded', sideEffect: 'read-only',
          idempotencyKey: 'assessment-dispatch-' + task.taskId }));
        assert.equal(result.ok, true);
      } else if (prior === 'dispatch-settled' || prior === 'model-claimed') {
        const kind = prior === 'model-claimed' ? 'model-send' : 'dispatch';
        const effect = unwrap(x.service.claimEffect(ref, { stepId: task.stepId, attempt: task.attempt, kind,
          key: (kind === 'model-send' ? 'model:' : 'dispatch:') + task.taskId, task: task.task,
          expected: { roleId: task.roleId, runtime: 'claude' } }));
        if (prior === 'dispatch-settled') unwrap(x.service.settleEffect(ref, { key: effect.key, token: effect.token,
          outcome: 'not-started', evidence: 'Fixture reports original claim did not start.' }));
      } else if (prior === 'current-invalid-closure' || prior === 'unknown-invalid-closure') {
        const result = await appendTaskEvent(x.project, taskEvent('task.closed', {
          taskId: prior === 'current-invalid-closure' ? task.taskId : 'unknowable-prior-task', by: 'convener',
          outcome: 'accepted', operationId: 'invalid-close', eventId: 'invalid-close',
        }));
        assert.equal(result.ok, true);
      } else {
        const path = tasksStatePath(x.project);
        if (prior === 'unreadable-journal') await mkdir(path, { recursive: true });
        else {
          await mkdir(join(path, '..'), { recursive: true });
          await appendFile(path, '{invalid\n');
        }
      }
      const result = await x.service.recordAcceptanceEnvironmentMissing(ref, { origin: 'preflight', basis, manifest: x.manifest,
        condition: { kind: 'npm-local-executable', script: 'dev', executable: 'vite' } }, current);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, 'environment-preflight-assessment-started');
      assert.equal(x.service.lookup(ref)?.stepId, 'assess');
      assert.equal(x.service.lookup(ref)?.acceptanceEnvironment?.attempts, 0);
    });
  }
});

test('preflight accepts a unique locked bin alias for an explicit check', () => {
  const condition = { kind: 'npm-local-executable', script: 'inspect', executable: 'check-cli' } as const;
  const manifest = { scripts: { inspect: 'check-cli --project .' }, devDependencies: { '@fixture/checker': '1.0.0' } };
  const entry = { bin: { 'check-cli': 'dist/cli.js' } };
  const lock = { packages: { 'node_modules/@fixture/checker': entry } };
  assert.equal(preflightScriptVerified(condition, manifest, lock, 'Run npm run inspect and retain the output.'), true);
  assert.equal(preflightScriptVerified(condition, manifest, undefined, 'Run npm run inspect and retain the output.'), false);
  assert.equal(preflightScriptVerified(condition, manifest, lock, 'Launch the app in the approved environment.'), false);
  assert.equal(preflightScriptVerified(condition, { ...manifest, devDependencies: { ...manifest.devDependencies, other: '2.0.0' } },
    { packages: { ...lock.packages, 'node_modules/other': entry } }, 'Run npm run inspect.'), false);
});

test('two evidenced retryable failures exhaust the same candidate budget across restart', async t => {
  const x = await setup(t);
  const { ref } = x;
  const { missing } = await x.assessment();
  unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current));
  assert.equal(x.advance(), 'open-recovery');
  for (let index = 1; index <= 2; index++) {
    assert.equal(x.advance(), 'restore-environment');
    const { parent, child, operation } = await x.recovery();
    assert.equal(x.service.lookup(ref)?.acceptanceEnvironment?.attempts, index);
    const claim = unwrap(x.service.claimEffect(ref, operation));
    const commandReceiptId = x.installReceipt(child, 'retryable');
    unwrap(x.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded', evidence: 'Fixture observed nonzero result.',
      result: { commandReceiptId } }));
    const closing = await x.close(child, parent, 'blocked');
    unwrap(await x.service.settleAcceptanceEnvironment(ref, { ...closing,
      outcome: { kind: 'retryable', commandReceiptId, reason: 'Temporary npm transport failure' } }, current));
    assert.equal(x.advance(), 'open-recovery');
    x.restart();
  }
  assert.equal(x.advance(), 'blocked');
  const view = x.service.lookup(ref)!;
  assert.equal(view.acceptanceEnvironment?.state, 'blocked');
  assert.equal(view.acceptanceEnvironment?.attempts, 2);
  assert.match(view.blockedReason!, /额度已用尽.*Temporary npm transport failure/);
  assert.equal(view.release, undefined);
  assert.equal(view.acceptanceArchive, undefined);
});

test('an interrupted install remains unresolved and cannot replay or consume another attempt', async t => {
  const x = await setup(t);
  const { ref } = x;
  const { missing } = await x.assessment();
  unwrap(await x.service.recordAcceptanceEnvironmentMissing(ref, missing, current));
  x.advance();
  x.advance();
  const { parent, child, operation } = await x.recovery();
  const claim = unwrap(x.service.claimEffect(ref, operation));
  x.restart();
  assert.equal(unwrap(x.service.claimEffect(ref, operation)).execute, false);
  unwrap(x.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'unknown', evidence: 'Fixture restart before result.' }));
  const closing = await x.close(child, parent, 'blocked');
  assert.equal((await x.service.settleAcceptanceEnvironment(ref, { ...closing, outcome: {
    kind: 'retryable', reason: 'Outcome unproven', commandReceiptId: 'invented',
  } }, current)).ok, false);
  unwrap(await x.service.settleAcceptanceEnvironment(ref, { ...closing, outcome: {
    kind: 'blocked', reason: 'Original command exit and local install could not be verified',
  } }, current));
  assert.equal(x.advance(), 'blocked');
  const view = x.service.lookup(ref)!;
  assert.equal(view.acceptanceEnvironment?.attempts, 1);
  assert.equal(view.acceptanceEnvironment?.state, 'blocked');
  assert.equal(view.acceptanceEnvironment?.effectKey, operation.key);
  assert.equal(x.service.listEffects(ref, 'environment-install')[0]?.state, 'unknown');
  assert.equal(view.release, undefined);
});
