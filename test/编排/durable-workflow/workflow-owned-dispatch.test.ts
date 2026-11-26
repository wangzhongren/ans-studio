import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PROJECT_MODULES_SCHEMA_EXAMPLE, PROJECT_ROSTER_SCHEMA_EXAMPLE } from '../../../src/common/编排/workflow-preconditions.ts';
import { ansGitignoreBlock } from '../../../src/common/编排/workflow-service.ts';
import { DURABLE_VERIFICATION_CAPABILITIES } from '../../../src/model/durable-workflow.ts';
import type { DurableA11GitObservation, DurableCapabilityEvent, DurablePendingTask, DurableResult, DurableTaskBinding, DurableVerificationCapabilitySnapshot } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, pinPathAV7, pinPathAV8 } from './fixture.ts';

const current = () => true;
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

async function approve(
  service: DurableWorkflowService, projectRoot: string, definitionId: string, source: 'project' | 'preset', text: string, reason: string,
) {
  const selected = unwrap(await service.validateDefinition(projectRoot, definitionId, { source }));
  const proposal = unwrap(await service.proposeWorkflowStart({ projectRoot, definitionId, source, reason, expectedDigest: selected.digest,
    requirement: { inputId: 'demand', turnId: 'selection', text, digest: digest(text), runtime: 'claude' } }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot, activationId: proposal.activationId, requestId: proposal.requestId, action: 'approve' }, current));
  const started = unwrap(await service.startApprovedWorkflow(projectRoot, proposal.activationId, current));
  assert.equal(started.state, 'started');
  assert.ok(started.instanceRef);
  service.engineStatus('healthy', undefined, started.instanceRef);
  return started.instanceRef;
}

test('an approved imported graph creates one planning task and branches on its actual report', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const project = join(directory, 'planning');
  const definitions = join(project, 'docs', 'workflows');
  await mkdir(definitions, { recursive: true });
  const preset = await readFile(new URL('../../../docs/workflows/path-a.yaml', import.meta.url), 'utf8');
  await writeFile(join(definitions, 'new-project.yaml'), preset.replace('id: path-a', 'id: new-project')
    .replaceAll('prepare-planning', 'receive-planning').replaceAll('onFailure: blocked', 'onFailure: parked')
    .replace('  delivered:', '  parked: { terminal: blocked }\n  delivered:'));
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const ref = await approve(service, project, 'new-project', 'project', '开发 3D 赛车游戏', '新项目。');
  assert.equal(service.lookup(ref)?.workflowOwnedDispatch, true);
  service.close();
  const ledger = new DurableLedger(dataDir);
  ledger.transaction(() => {
    const value = ledger.instance(ref.instanceId)!;
    value.stepId = 'receive-planning';
    value.entry = 4;
    value.graph!.flowId = 'game';
    value.graph!.proofs['intent-approved'] = 'fixture-approval';
    ledger.save(value);
  });
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const address = { stepId: 'receive-planning', attempt: 1 };
  assert.equal(service.claimEffect(ref, { ...address, kind: 'model-send', key: 'model:chief-intake:receive-planning:1',
    expected: { roleId: 'chief' } }).ok, false);
  await Promise.all(Array.from({ length: 4 }, () => service.prepareWorkflowDispatch(ref)));
  let view = service.lookup(ref)!;
  assert.equal(view.pendingTasks?.length, 1);
  const task = view.pendingTasks![0]!;
  assert.equal(task.task.roleId, 'rapporteur');
  assert.equal(task.dispatch.actor, 'application');
  assert.equal(task.task.parentTaskId, ref.instanceId);
  assert.deepEqual(service.apply({ ...address, ref, entry: 4, turn: 0 }), { entry: 4 });
  const modelKey = 'model:' + task.taskId;
  const claim = unwrap(service.claimEffect(ref, { ...address, kind: 'model-send', key: modelKey, task: task.task,
    expected: { roleId: task.roleId, runtime: 'claude' } }));
  unwrap(service.settleEffect(ref, { key: modelKey, token: claim.token, outcome: 'succeeded', evidence: 'Observed test delivery.', result: { turnId: 'planning-turn' } }));
  const report = { version: 1, reportId: 'planning-report', taskId: task.taskId, status: 'blocked', origin: 'submitted-report',
    summary: { text: '需要确认目标平台' }, source: { roleId: task.roleId, runtime: 'claude', turnId: 'planning-turn' } };
  const evidence = unwrap(service.storeEvidence(ref, { report }));
  unwrap(await service.submitCapability(ref, { ...address, flowId: task.flowId, key: 'report:' + report.reportId,
    source: { roleId: task.roleId, originId: 'planning-turn', parentTaskId: task.taskId }, input: { kind: 'task-report', task: task.task, evidence } }));
  assert.deepEqual(service.apply({ ...address, ref, entry: 4, turn: 1 }), { terminal: 'blocked', entry: 5 });
  view = service.lookup(ref)!;
  assert.equal(view.stepId, 'parked');
  assert.match(view.blockedReason ?? '', /需要确认目标平台/);
});

for (const gather of ['none', 'approve', 'unavailable'] as const) test(`B2 preserves the production scope with evidence authorization ${gather}`, async t => {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  await mkdir(join(project, 'src'));
  await mkdir(join(project, '角色卡', 'owner'), { recursive: true });
  const modulePath = 'src/settings.ts';
  const ownerBoundaryPath = join(project, '角色卡', 'owner', 'boundary.yaml');
  const ownerBoundary = 'role: owner\nentries:\n  - root: project\n    path: src/\n    kind: directory\n    purpose: Existing module\n';
  await writeFile(join(project, modulePath), 'export const limit = 4;\n');
  await writeFile(ownerBoundaryPath, ownerBoundary);
  if (gather === 'approve') {
    const roleId = 'acceptance-evidence-collector';
    await mkdir(join(project, '角色卡', roleId), { recursive: true });
    await writeFile(join(project, '角色卡', roleId, 'boundary.yaml'),
      `role: ${roleId}\nentries:\n  - root: project\n    path: docs/verification/\n    kind: directory\n    purpose: Acceptance evidence only\n`);
  }
  await writeFile(join(definitions, 'path-b.yaml'), await readFile(new URL('../../../docs/workflows/path-b.yaml', import.meta.url)));
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Existing module');
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const ref = await approve(service, project, 'path-b', 'project', 'Adjust the existing limit.', 'The limit is in src/settings.ts.');
  unwrap(await service.prepareWorkflowDispatch(ref));
  assert.equal(service.apply({ ref, stepId: 'qualify-change', entry: 0, turn: 0 }).next, 'prepare-branch');
  const branch = 'ans/task/' + ref.instanceId;
  const oid = git(project, 'rev-parse', 'HEAD');
  const baseline = unwrap(service.claimEffect(ref, { stepId: 'prepare-branch', attempt: 1, kind: 'baseline', key: 'baseline' }));
  git(project, 'switch', '-c', branch);
  unwrap(service.settleEffect(ref, { key: 'baseline', token: baseline.token, outcome: 'succeeded',
    evidence: 'Verified Git test baseline.', result: { branch, oid } }));
  assert.equal(service.apply({ ref, stepId: 'prepare-branch', entry: 1, turn: 0 }).next, 'impact');
  assert.deepEqual(service.apply({ ref, stepId: 'impact', entry: 2, turn: 0 }), { entry: 2 });
  let view = unwrap(await service.prepareWorkflowDispatch(ref));
  const task = view.task!;
  assert.equal(task.roleId, 'owner');
  const address = { stepId: 'impact', attempt: 1 };
  const reportKey = 'test-report';
  const evidence = unwrap(service.storeEvidence(ref, gather === 'none' ? { status: 'completed' } : {
    report: { origin: 'submitted-report', evidence: [{ text: JSON.stringify({ kind: 'b2-evidence-requirement', requirementId: 'AC-1',
      reason: 'Read the changed value.', source: 'candidate-file', paths: [modulePath] }) }] },
  }));
  unwrap(await service.submit(ref, { ...address, kind: 'task-report', source: 'host', key: reportKey, task, evidence }));
  unwrap(await service.submit(ref, { ...address, kind: 'operator-report', source: 'host', key: 'operator',
    parentTaskId: task.parentTaskId, evidence }));
  unwrap(await service.submit(ref, { ...address, kind: 'analysis-disposition', source: 'convener', key: 'usable',
    task, reportKey, outcome: 'usable' }));
  assert.equal(service.apply({ ...address, ref, entry: 2, turn: 1 }).next, 'scope');
  view = unwrap(await service.prepareWorkflowDispatch(ref));
  if (gather === 'approve') {
    const card = view.b2EvidenceDecision;
    assert.ok(card);
    assert.equal(view.scope, undefined);
    const decision = { ...card.binding, action: 'approve' as const, provenance: { source: 'customer' as const } };
    assert.equal((await service.decideB2EvidenceScope(ref, { ...decision, digest: '0'.repeat(64) }, () => true)).ok, false);
    await writeFile(ownerBoundaryPath, ownerBoundary.replace('src/', 'another/'));
    assert.equal((await service.decideB2EvidenceScope(ref, decision, current)).ok, false);
    await writeFile(ownerBoundaryPath, ownerBoundary);
    unwrap(await service.decideB2EvidenceScope(ref, decision, () => true));
    view = unwrap(await service.prepareWorkflowDispatch(ref));
    assert.equal(view.scopeDecision?.evidenceAuthorization?.roleId, card.roleId);
    assert.deepEqual(view.scopeDecision?.evidenceAuthorization?.writePaths, card.writePaths);
  } else {
    assert.equal(view.b2EvidenceDecision, undefined);
    assert.equal(view.scopeDecision?.evidenceAuthorization, undefined);
  }
  assert.equal(view.scopeDecision?.evidenceRequirements?.[0]?.requirementId, gather === 'none' ? undefined : 'AC-1');
  assert.deepEqual(view.scopeDecision?.candidates, [modulePath]);
  assert.equal(view.scope?.source, 'host');
  assert.equal(view.scope?.sourceTaskId, ref.instanceId);
  assert.equal(view.scopeDecision?.b1Report.key, reportKey);
  assert.equal(service.apply({ ref, stepId: 'scope', entry: 3, turn: 0 }).next, 'implement');
  view = unwrap(await service.prepareWorkflowDispatch(ref));
  assert.equal(view.task?.roleId, 'owner');
  assert.deepEqual(service.taskGitScope(ref, view.task!.taskId, 'owner')?.paths, [modulePath]);
  if (gather === 'none') return;
  const implementation = view.task!;
  const b3 = { stepId: view.stepId, attempt: view.attempt };
  const commit = unwrap(service.claimEffect(ref, { ...b3, kind: 'task-commit', key: 'fixture-b3-commit', task: implementation,
    expected: { branch, head: oid, paths: [modulePath] } }));
  await writeFile(join(project, modulePath), 'export const limit = 5;\n');
  git(project, 'add', modulePath);
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Change only approved module');
  const candidateOid = git(project, 'rev-parse', 'HEAD');
  unwrap(service.settleEffect(ref, { key: commit.key, token: commit.token, outcome: 'succeeded', evidence: 'Actual fixture Git commit', result: { oid: candidateOid } }));
  const parent: DurableTaskBinding = { ...implementation, roleId: 'convener', taskId: implementation.parentTaskId, parentTaskId: ref.instanceId };
  const model = (task: DurableTaskBinding, turnId: string, key = 'model:' + task.taskId) => {
    const claim = unwrap(service.claimEffect(ref, { ...b3, kind: 'model-send', key, task, expected: { roleId: task.roleId, runtime: 'claude' } }));
    unwrap(service.settleEffect(ref, { key, token: claim.token, outcome: 'succeeded', evidence: 'Observed directed fixture turn', result: { turnId } }));
  };
  const operations = 'b3-operations-turn';
  model(parent, operations);
  const collectorRoleId = 'acceptance-evidence-collector';
  const dispatch = { parentTask: parent, roleId: collectorRoleId, originId: operations, requestId: 'b3-collection' };
  if (gather === 'approve') {
    unwrap(await service.dispatchEvidenceCollection(ref, dispatch, current));
    const collecting = service.lookup(ref)?.evidenceAudit;
    assert.ok(collecting?.collector);
    const child = collecting.collector;
    assert.equal(service.taskGitScope(ref, child.taskId, child.roleId), undefined);
    const turnId = 'b3-collection-turn';
    model(child, turnId);
    const report = { version: 1, reportId: 'b3-collection-report', taskId: child.taskId, status: 'blocked', origin: 'submitted-report',
      summary: { text: 'The approved module file was omitted from the collected evidence.' }, at: new Date().toISOString(),
      source: { roleId: child.roleId, runtime: 'claude', turnId } };
    const refReport = unwrap(service.storeEvidence(ref, { report }));
    unwrap(await service.submitCapability(ref, { ...b3, key: 'report:' + report.reportId, flowId: view.flowId!,
      source: { roleId: child.roleId, originId: turnId, parentTaskId: child.taskId }, input: { kind: 'task-report', task: child, evidence: refReport } }, current));
    unwrap(await service.recordEvidenceCollection(ref, { task: child, generation: collecting.basis.generation, artifacts: [] }, current));
  } else {
    assert.equal((await service.dispatchEvidenceCollection(ref, dispatch, current)).ok, false);
  }
  const basis = service.lookup(ref)!.evidenceAudit!.basis;
  const blocker = { parentTask: parent, originId: operations, generation: basis.generation,
    reason: 'Required evidence did not reach the formal handback.' };
  const parked = unwrap(await service.recordEvidenceBlocker(ref, blocker, current));
  const scope = service.lookup(ref)?.blockedRouting;
  assert.ok(scope);
  assert.equal(scope.options.some(option => option.id === 'stop'), false);
  assert.equal(scope.options.some(option => option.id === 'route'), gather === 'approve');
  if (gather === 'approve') {
    assert.deepEqual(scope.evidenceRoute?.artifacts, [{ requirementId: 'AC-1', path: modulePath, source: 'candidate-file' }]);
  }
  const decision = { ...scope.binding, option: gather === 'approve' ? 'route' as const : 'wait' as const, provenance: { source: 'customer' as const } };
  if (gather === 'approve') {
    await writeFile(join(project, modulePath), 'outside the committed candidate\n');
    assert.equal((await service.decideBlockedScopeChange(ref, decision, current)).ok, false);
    await writeFile(join(project, modulePath), 'export const limit = 5;\n');
  }
  unwrap(await service.decideBlockedScopeChange(ref, decision, current));
  if (gather === 'approve') {
    unwrap(await service.resumeBlockedScopeChange(ref, scope.binding.requestId, undefined, current));
    const resumed = service.lookup(ref)?.evidenceAudit;
    assert.equal(resumed?.basis.generation, basis.generation + 1);
    assert.equal(resumed?.route?.requestId, scope.binding.requestId);
    assert.deepEqual(unwrap(await service.recordEvidenceBlocker(ref, { ...blocker, generation: basis.generation + 1 }, current)), parked);
    assert.equal(service.lookup(ref)?.blockedRouting, undefined);
    const resumedTurn = 'b3-resumed-operations-turn';
    model(parent, resumedTurn, 'model:evidence-route:' + scope.binding.requestId);
    unwrap(await service.dispatchEvidenceCollection(ref, { ...dispatch, originId: resumedTurn, requestId: 'b3-recollection' }, current));
    const latest = service.lookup(ref)!;
    const order = latest.pendingTasks?.find(row => row.taskId === latest.evidenceAudit?.collector?.taskId)?.evidenceWorkOrder;
    assert.deepEqual(order?.approvedArtifacts, scope.evidenceRoute?.artifacts);
  }
  assert.equal(service.lookup(ref)?.stepId, 'implement');
});

for (const scenario of ['legacy', 'recovery', 'manual', 'stop', 'retest', 'retest-wait', 'retest-defect', 'retest-exhausted', 'prep-rework'] as const)
  test(`operations ${scenario} uses the current authoritative reports`, async t => {
  const optedIn = scenario !== 'legacy';
  const retesting = scenario.startsWith('retest');
  const prepRework = scenario === 'prep-rework';
  const defect = scenario === 'retest-defect' || scenario === 'retest-exhausted';
  const workerFile = defect ? 'src/race/game.test.mjs' : 'src/race/game.ts';
  const selfTestOp = defect ? '--test' : '--check';
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  if (optedIn) await pinPathAV8(definitions);
  else await pinPathAV7(definitions);
  const write = async (file: string, text: string) => {
    await mkdir(join(project, file, '..'), { recursive: true });
    await writeFile(join(project, file), text);
    return { path: file, sha256: digest(text) };
  };
  const roleIds = ['env-owner', 'worker'];
  const roleDocuments = await Promise.all(roleIds.map(role => Promise.all(['role-card.md', 'boundary.md', 'boundary.yaml']
    .map(name => write('角色卡/' + role + '/' + name, role + ' ' + name)))));
  const plan = await write('docs/scheduling/game-team-v1.md', 'Fixture approval and write sets.');
  const criteriaText = optedIn ? `---\nverificationRequirements:\n  - {id: AC-1, stage: A11, capability: module-shell, workItemId: worker, evidence: [command-receipt], command: [node, ${selfTestOp}, ${workerFile}]}\n`
    + (prepRework ? '  - {id: AC-1, stage: A11, capability: module-shell, workItemId: env-owner, evidence: [command-receipt], command: [node, --check, env/entry.mjs]}\n' : '')
    + '  - {id: AC-1, stage: A12b, capability: workspace-browser, evidence: [browser-input, browser-screenshot]}\n---\n'
    + '```ans-criteria\nschema: ans-criteria/v1\nflowId: game\nversion: 1\nstatus: final\ncriteria:\n  - {id: AC-1, priority: P0, title: Drive the candidate}\n```\n'
    : 'Pre-approved independent criteria fixture.';
  const criteria = await write('docs/quality/game-criteria-v1.md', criteriaText);
  if (prepRework) {
    await write('env/entry.mjs', 'export const launch = true;\n');
    await write('docs/product/game-intent-v1.md', 'Fixture intent approval');
    await write('docs/proposals/game-proposal-v1.md', '---\nschema: project-proposal/v2\n---\nCurrent intent docs/product/game-intent-v1.md\n');
    await write('docs/contracts/game-architecture-v1.md', 'Architecture for docs/proposals/game-proposal-v1.md uses `index.html`.');
    await write('docs/proposals/game-modules-v1.md', PROJECT_MODULES_SCHEMA_EXAMPLE.replaceAll('demo', 'game'));
    await write('docs/proposals/game-roster-v1.md', PROJECT_ROSTER_SCHEMA_EXAMPLE.replaceAll('demo', 'game'));
  }
  if (retesting) await write('.gitignore', ansGitignoreBlock() + '\n');
  const verificationCapabilities: DurableVerificationCapabilitySnapshot = { stage: 'A12a', status: DURABLE_VERIFICATION_CAPABILITIES.map(capability => ({ capability, status: 'available' })) };
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Approved basis');
  const oid = git(project, 'rev-parse', 'HEAD');
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const ref = await approve(service, project, 'path-a', 'project', 'Build a racing game.', 'New project.');
  const branch = 'ans/task/' + ref.instanceId;
  git(project, 'switch', '-c', branch);
  const writeSets = [{ roleId: 'env-owner', paths: prepRework ? ['env/', 'index.html'] : ['env/'] }, { roleId: 'worker', paths: ['src/race/'] }];
  service.close();
  const ledger = new DurableLedger(dataDir);
  ledger.transaction(() => {
    const value = ledger.instance(ref.instanceId)!;
    value.stepId = 'implement';
    value.entry = 12;
    value.baseline = { branch, oid };
    Object.assign(value.graph!, { flowId: 'game', expectedRoles: roleIds, activatedRoles: roleIds,
      approvedProposalRequestId: 'approved-proposal', writeSets,
      proofs: { appointed: 'approved-appointment', 'team-plan': 'verified-team', 'standard-open': 'standard-closure' },
    });
    value.graph!.tasks.push({
      capability: 'independent-standard', stepId: 'open-standard', attempt: 1, flowId: 'game',
      roleId: 'verifier', taskId: 'verifier-standard', state: 'accepted', outcome: 'accepted', baselineOid: oid,
      task: { stage: 'A12a', stageAttempt: 1, executionAttempt: 1, parentTaskId: ref.instanceId, taskId: 'verifier-standard', roleId: 'verifier' },
      dispatch: { text: 'Standard', actor: 'application', flowId: 'game' }, documents: [criteria],
      ...(optedIn ? { verificationCapabilities } : {}),
    });
    const record = (stepId: string, key: string, input: DurableCapabilityEvent['input']) => {
      const event = { key, stepId, attempt: 1, flowId: 'game', source: { roleId: 'host', originId: 'fixture-approved' }, input };
      ledger.saveFact(ref.instanceId, storedFact({ kind: 'capability-event', source: 'host', key, stepId, attempt: 1, event }, { key, state: 'consumed' }));
    };
    record('establish-team-baseline', 'verified-team', { kind: 'baseline-verified', effectKey: 'recorded-git-baseline',
      baselineOid: oid, branch, writeSets, documents: [plan] });
    for (const [index, roleId] of roleIds.entries()) record('activate-roles', 'activated:' + roleId,
      { kind: 'role-activated', roleId, documents: roleDocuments[index]!, proposalRequestId: 'approved-proposal' });
    ledger.saveEvidence(ref.instanceId, criteria.sha256, Buffer.from(criteriaText));
    ledger.save(value);
  });
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const view = unwrap(await service.prepareWorkflowDispatch(ref));
  const parent = view.pendingTasks!.find(task => task.capability === 'operations-implementation')!;
  assert.deepEqual(view.implementationItems, writeSets.map(item => ({ id: item.roleId, ...item })));
  const address = { flowId: 'game', stepId: 'implement', attempt: 1 };
  function model(task: DurablePendingTask, operation: string, turnId: string) {
    const key = 'model:' + operation;
    const claim = unwrap(service.claimEffect(ref, { ...address, stepId: task.stepId, attempt: task.attempt, kind: 'model-send', key, task: task.task,
      expected: { roleId: task.roleId, runtime: 'claude' } }));
    assert.equal(claim.execute, true);
    return () => unwrap(service.settleEffect(ref, { key, token: claim.token, outcome: 'succeeded', evidence: 'Observed model turn', result: { turnId } }));
  }
  const begin = model(parent, parent.taskId, 'parent-turn');
  const childRequest: DurableCapabilityEvent = { ...address, key: 'a11-dispatch:' + parent.taskId + ':env',
    source: { roleId: 'convener', originId: 'parent-turn', parentTaskId: parent.taskId },
    input: { kind: 'implementation-dispatch', roleId: optedIn ? 'worker' : 'env-owner', workItemId: 'env-owner', requestId: 'env',
      rework: false, text: optedIn ? '完成三圈比赛，使用应用工作区工具和浏览器截取 P0 证据。' : 'Prepare local assets' } };
  assert.equal((await service.submitCapability(ref, childRequest)).ok, false, 'requires a trusted current turn');
  assert.equal((await service.submitCapability(ref, { ...childRequest, source: { ...childRequest.source, roleId: 'chief' } }, current)).ok, false);
  const one = unwrap(await service.submitCapability(ref, childRequest, current));
  assert.deepEqual(unwrap(await service.submitCapability(ref, childRequest, current)), one);
  const workerRequest: DurableCapabilityEvent = { ...childRequest, key: 'a11-dispatch:' + parent.taskId + ':worker',
    input: { kind: 'implementation-dispatch', roleId: 'worker', workItemId: 'worker', requestId: 'worker', rework: false, text: 'Build the game' } };
  assert.equal((await service.submitCapability(ref, workerRequest, current)).ok, false, 'allows one active writer');
  begin();
  const accepted: { child: DurablePendingTask; childOid: string }[] = [];
  async function childReport(child: DurablePendingTask, turnId: string, key: string, summary: string, evidence: string[] = [],
    status: 'completed' | 'blocked' = 'completed', recoveryKey?: string) {
    const stored = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId: key, taskId: child.taskId, status,
      origin: 'submitted-report', summary: { text: summary }, evidence: evidence.map(text => ({ text })),
      source: { roleId: child.roleId, runtime: 'claude', turnId } } }));
    return service.submitCapability(ref, { ...address, stepId: child.stepId, attempt: child.attempt, key: 'report:' + key,
      source: { roleId: child.roleId, originId: turnId, parentTaskId: child.taskId },
      input: { kind: 'task-report', task: child.task, evidence: stored, ...(recoveryKey ? { recoveryKey } : {}) } }, recoveryKey ? current : undefined);
  }
  assert.equal((await childReport(parent, 'parent-turn', 'premature', 'Done')).ok, false);
  const env = service.lookup(ref)!.pendingTasks!.find(task => task.workItemId === roleIds[0])!;
  assert.equal(env.roleId, 'env-owner');
  if (optedIn) {
    assert.ok(env.workOrder);
    assert.equal(env.workOrder.deferredChecks[0]?.capability, 'workspace-browser');
    assert.doesNotMatch(env.dispatch.text, /完成三圈比赛/);
    assert.equal(env.workOrder.requirements.some(row => row.capability === 'module-shell'), prepRework);
  }
  model(env, env.taskId, 'first-env-turn')();
  unwrap(await childReport(env, 'first-env-turn', 'first-env-report', 'Candidate setup needs correction'));
  const reworkTurn = 'operations-env-rework';
  const finishRework = model(parent, 'a11-wake:' + env.taskId + ':report:first-env-report', reworkTurn);
  const reworkSource = { ...childRequest.source, originId: reworkTurn };
  const retry: DurableCapabilityEvent = { ...childRequest, source: reworkSource, key: childRequest.key + ':retry',
    input: { kind: 'implementation-dispatch', roleId: env.roleId, workItemId: env.workItemId!, requestId: 'env:retry',
      rework: true, text: 'Correct the asset setup' } };
  assert.equal((await service.submitCapability(ref, retry, current)).ok, false, 'rework requires original closure');
  unwrap(await service.submitCapability(ref, { ...address, source: reworkSource, key: 'env-rework',
    input: { kind: 'task-closed', task: env.task, reportKey: 'report:first-env-report', outcome: 'rework' } }, current));
  finishRework();
  const retryTurn = 'operations-env-progress';
  const finishProgress = model(parent, 'a11-progress:' + env.taskId + ':env-rework', retryTurn);
  const retrySource = { ...reworkSource, originId: retryTurn };
  unwrap(await service.submitCapability(ref, { ...retry, source: retrySource }, current));
  assert.deepEqual(unwrap(await service.submitCapability(ref, { ...childRequest, source: retrySource }, current)), one);
  assert.equal(service.lookup(ref)!.pendingTasks!.findLast(task => task.workItemId === env.workItemId)?.task.executionAttempt, 2);
  finishProgress();
  for (const [index, file] of [prepRework ? 'index.html' : 'env/assets.json', workerFile].entries()) {
    const child = service.lookup(ref)!.pendingTasks!.findLast(task => task.workItemId === roleIds[index])!;
    const marker = 'ANS-A11 test: ' + child.taskId;
    const workerTurn = 'worker-turn-' + index;
    const settled = model(child, child.taskId, workerTurn);
    const contents = index === 1 && defect
      ? "import { test } from 'node:test'; import assert from 'node:assert/strict';\ntest('candidate timing', () => assert.equal(1, 2));\n"
      : index === 1 && optedIn ? 'export const winner = 1;\n' : prepRework ? '<body onload="unsafe()">Blocked entry</body>\n' : 'Deliverable ' + index;
    const originalWrite = prepRework && index === 0 ? unwrap(service.claimEffect(ref, {
      ...address, kind: 'task-write', key: 'file:original-entry', task: child.task,
      expected: { paths: [file], operation: 'write', contentSha256: digest(contents) },
    })) : undefined;
    await write(file, contents);
    if (originalWrite) unwrap(service.settleEffect(ref, { key: originalWrite.key, token: originalWrite.token,
      outcome: 'succeeded', evidence: 'Actual entry bytes were saved during the original role turn.' }));
    const preStageKey = 'git-add:v2:' + digest(file);
    const indexBeforeStage = digest(await readFile(join(project, '.git', 'index')));
    const preStage = { ...address, key: preStageKey, kind: 'task-write' as const, task: child.task,
      expected: { paths: [file], head: child.baseOid!, branch, indexDigest: indexBeforeStage } };
    if (optedIn) {
      assert.equal(service.claimEffect(ref, { ...preStage, expected: { ...preStage.expected, branch: 'main' } }).ok, false);
      assert.equal(service.claimEffect(ref, { ...preStage, expected: { ...preStage.expected, head: '1'.repeat(40) } }).ok, false);
    }
    const stageClaim = optedIn ? unwrap(service.claimEffect(ref, preStage)) : undefined;
    git(project, 'add', '--', file);
    const diffDigest = digest(git(project, 'diff', '--cached', '--binary'));
    const expected = { paths: [file], head: child.baseOid!, branch, marker, diffDigest };
    const key = 'task-commit:' + child.taskId;
    if (stageClaim) {
      assert.equal(service.claimEffect(ref, { ...address, key, kind: 'task-commit', task: child.task, expected }).ok, false);
      unwrap(service.settleEffect(ref, { key: preStageKey, token: stageClaim.token, outcome: 'succeeded', evidence: 'Actual initial stage',
        result: { beforeIndex: indexBeforeStage, afterIndex: digest(await readFile(join(project, '.git', 'index'))),
          afterBranch: branch, afterHead: child.baseOid!, exitCode: '0' } }));
    }
    const claimed = unwrap(service.claimEffect(ref, { ...address, key, kind: 'task-commit', task: child.task, expected }));
    git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Scoped delivery ' + index, '-m', marker);
    const childOid = git(project, 'rev-parse', 'HEAD');
    unwrap(service.settleEffect(ref, { key, token: claimed.token, outcome: 'succeeded', evidence: 'Actual scoped Git commit', result: { oid: childOid, diffDigest } }));
    if (optedIn && index === 1 && !retesting) {
      const observe = (argv: readonly string[], writeAuditPassed = true) => service.recordImplementationSelfTest(ref, { task: child.task,
        observation: { argv, roleId: child.roleId, toolCallId: 'self-check', turnId: workerTurn, cwd: project,
          reviewedBy: 'actual-fixture-operator', outcome: { exitCode: 0 }, writeAuditPassed } }, current);
      assert.equal((await observe(['node', '--check', file], false)).ok, false);
      assert.equal((await observe(['node', '--check', 'env/assets.json'])).ok, false);
      execFileSync(process.execPath, ['--check', file], { cwd: project });
      unwrap(await observe(['node', '--check', file]));
    }
    if (prepRework && index === 0) {
      const argv = ['node', '--check', 'env/entry.mjs'];
      execFileSync(process.execPath, argv.slice(1), { cwd: project });
      unwrap(await service.recordImplementationSelfTest(ref, { task: child.task, observation: {
        argv, roleId: child.roleId, turnId: workerTurn, toolCallId: 'original-entry-test', cwd: project,
        reviewedBy: 'fixture-operator', outcome: { exitCode: 0 }, writeAuditPassed: true,
      } }, current));
    }
    settled();
    let reportKey = 'worker-report-' + index;
    unwrap(await childReport(child, workerTurn, reportKey, 'Implementation ready'));
    let reviewTurn = 'operations-wake-' + index;
    let settleReview = model(parent, 'a11-wake:' + child.taskId + ':report:' + reportKey, reviewTurn);
    if (retesting && index === 1) {
      settleReview();
      const closeEvent: DurableCapabilityEvent = { ...address, source: { ...childRequest.source, originId: reviewTurn }, key: 'close-before-self-test',
        input: { kind: 'task-closed', task: child.task, reportKey: 'report:' + reportKey, outcome: 'accepted', tipOid: childOid } };
      const check = await service.submitCapability(ref, closeEvent, current);
      assert.equal(check.ok ? undefined : check.code, 'workflow-implementation-self-test-missing');
      assert.deepEqual(check.ok ? undefined : check.missingImplementationTests?.map(row => row.command), [['node', selfTestOp, file]]);
      const observation: DurableA11GitObservation = { head: childOid, branch, indexDigest: digest(await readFile(join(project, '.git', 'index'))),
        stagedPaths: [], untrackedPaths: [], trackedDirty: false, reason: '实际候选、工作区和索引干净。', worktreeDigest: digest(childOid) };
      if (scenario === 'retest-wait') await write(criteria.path, 'Current standard drift');
      const park = (event: DurableCapabilityEvent) => service.parkA11Disposition(ref, { childTask: child.task, observation,
        receiptCheck: { event, reportKey: 'report:' + reportKey } }, current);
      assert.equal((await park({ ...closeEvent, source: { ...closeEvent.source, originId: 'untrusted' } })).ok, false);
      const parked = unwrap(await park(closeEvent));
      assert.equal(parked.childReport.key, 'report:' + reportKey);
      assert.equal(parked.candidateOid, childOid);
      assert.ok(parked.retest);
      assert.equal(parked.recovery, undefined);
      assert.equal(unwrap(await park(closeEvent)).key, parked.key);
      assert.equal(service.taskWriteScope(ref, child.taskId, child.roleId), undefined);
      assert.equal((await service.submitCapability(ref, { ...closeEvent, key: 'no-unapproved-rework',
        input: { kind: 'task-closed', task: child.task, reportKey: 'report:' + reportKey, outcome: 'rework', tipOid: childOid } }, current)).ok, false);
      if (scenario === 'retest-wait') {
        assert.equal(parked.standardState, 'drifted');
        assert.equal((await service.resumeA11Disposition(ref, parked.key, observation, current, {})).ok, false);
        const scope = service.lookup(ref)!.blockedRouting!;
        unwrap(await service.decideBlockedScopeChange(ref, { ...scope.binding, option: 'wait', provenance: { source: 'customer' } }, current));
        await write(criteria.path, criteriaText);
        unwrap(await service.observeA11Disposition(ref, parked.key, observation, current, {}));
      } else {
        assert.equal(service.lookup(ref)?.blockedRouting, undefined);
      }
      unwrap(await service.resumeA11Disposition(ref, parked.key, observation, current, {}));
      assert.equal(service.taskGitScope(ref, child.taskId, child.roleId), undefined);
      assert.equal(service.taskWriteScope(ref, child.taskId, child.roleId), undefined);
      const retestTurn = 'worker-current-retest';
      model(child, 'a11-resume:' + parked.key, retestTurn)();
      const observe = async (patch: Partial<Parameters<typeof service.recordImplementationSelfTest>[1]['observation']> = {}) =>
        service.recordImplementationSelfTest(ref, { task: child.task, observation: { argv: ['node', selfTestOp, file], roleId: child.roleId,
          cwd: project, turnId: retestTurn, toolCallId: 'new-real-self-check', reviewedBy: 'fixture-operator', outcome: { exitCode: 0 },
          writeAuditPassed: true, process: { started: true, transport: { kind: 'bundled-node', executable: process.execPath, argv: [selfTestOp, file] } },
          ...patch } }, current);
      assert.equal((await observe({ turnId: workerTurn })).ok, false);
      assert.equal((await observe({ toolCallId: 'ordinary-empty-audit' })).ok, false);
      assert.equal(service.lookup(ref)?.a11Disposition?.retest?.failure?.assertionFailure, false);
      assert.equal((await observe({ toolCallId: 'wrong-transport', strictAudit: { status: 'passed', digest: digest('fixture audit') },
        process: { started: true, transport: { kind: 'bundled-node', executable: process.execPath, argv: [file] } } })).ok, false);
      const actual = { strictAudit: { status: 'passed' as const, digest: digest('fixture strict audit') } };
      if (defect) {
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
        const result = spawnSync(process.execPath, ['--test', file], { cwd: project, encoding: 'utf8', env });
        assert.equal(result.status, 1);
        assert.match(result.stdout, /ERR_ASSERTION/);
        assert.equal((await observe({ ...actual, outcome: { exitCode: 1 },
          output: { stdout: result.stdout, stderr: result.stderr, stdoutTruncated: false, stderrTruncated: false } })).ok, false);
        assert.equal(service.lookup(ref)?.a11Disposition?.retest?.failure?.assertionFailure, true);
        reportKey = 'same-candidate-real-assertion';
        unwrap(await childReport(child, retestTurn, reportKey, 'Candidate timing assertion failed.',
          ['new-real-self-check'], 'blocked', parked.key));
        reviewTurn = 'operator-verifies-real-defect';
        let finish = model(parent, 'a11-wake:' + child.taskId + ':report:' + reportKey, reviewTurn);
        const repair = (defectNote?: string) => service.submitCapability(ref, { ...address, key: 'after-real-assertion',
          source: { ...closeEvent.source, originId: reviewTurn }, input: { kind: 'task-closed', task: child.task,
            reportKey: 'report:' + reportKey, outcome: 'rework', tipOid: childOid, defectNote } }, current);
        assert.equal((await repair('only a nonzero exit')).ok, false);
        const rework = await repair('new-real-self-check Native Node assertion observed actual duration instead of expected timing.');
        finish();
        if (scenario === 'retest-exhausted') {
          assert.equal(rework.ok ? undefined : rework.code, 'workflow-a11-implementation-rework-exhausted');
          const scope = service.lookup(ref)!.blockedRouting!;
          assert.deepEqual(scope.options.map(option => option.id), ['wait', 'stop']);
          assert.match(scope.reason, /返工额度已用尽/);
          assert.equal((await service.resumeA11Disposition(ref, parked.key, observation, current, {})).ok, false);
          return;
        }
        unwrap(rework);
        assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.taskId === child.taskId)?.outcome, 'rework');
        reviewTurn = 'operate-original-authorized-rework';
        finish = model(parent, 'a11-progress:' + child.taskId + ':after-real-assertion', reviewTurn);
        unwrap(await service.submitCapability(ref, { ...workerRequest, key: 'a11-dispatch:' + parent.taskId + ':defect-code-rework', source: { ...closeEvent.source, originId: reviewTurn },
          input: { kind: 'implementation-dispatch', workItemId: 'worker', roleId: 'worker', requestId: 'defect-code-rework',
            rework: true, text: 'Correct the independently verified candidate defect' } }, current));
        finish();
        assert.equal(service.lookup(ref)?.pendingTasks?.findLast(task => task.workItemId === 'worker')?.task.executionAttempt, 2);
        return;
      }
      execFileSync(process.execPath, ['--check', file], { cwd: project });
      const receipt = unwrap(await observe(actual));
      assert.deepEqual(unwrap(await observe(actual)), receipt);
      assert.equal((await childReport(child, workerTurn, 'late-old-retest', 'Old role replay.', [], 'completed', parked.key)).ok, false);
      reportKey = 'worker-retested';
      unwrap(await childReport(child, retestTurn, reportKey, 'Completed same candidate ' + childOid,
        ['new-real-self-check'], 'completed', parked.key));
      reviewTurn = 'operations-retest-review';
      settleReview = model(parent, 'a11-wake:' + child.taskId + ':report:' + reportKey, reviewTurn);
      if (scenario === 'retest-wait') {
        settleReview();
        await write(criteria.path, 'Drift after formal handback');
        const checkAgain: DurableCapabilityEvent = { ...closeEvent, key: 'close-retest-with-drift',
          source: { ...closeEvent.source, originId: reviewTurn }, input: { kind: 'task-closed', task: child.task,
            reportKey: 'report:' + reportKey, outcome: 'accepted', tipOid: childOid } };
        const waiting = unwrap(await park(checkAgain));
        assert.equal(waiting.standardState, 'drifted');
        assert.equal(waiting.retest?.pendingReportReview, true);
        assert.equal(waiting.resumeExhausted, true);
        await write(criteria.path, criteriaText);
        unwrap(await service.observeA11Disposition(ref, parked.key, observation, current, {}));
        const ready = unwrap(await service.resumeA11Disposition(ref, parked.key, observation, current, {}));
        assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.taskId === child.taskId)?.report?.key, 'report:' + reportKey);
        assert.equal(service.listEffects(ref, 'model-send').filter(effect => effect.intent.key === 'model:a11-resume:' + parked.key).length, 1);
        assert.ok(ready.retest?.reportReviewGeneration);
        reviewTurn = 'operations-retest-review-restored';
        settleReview = model(parent, 'a11-wake:' + child.taskId + ':report:' + reportKey + ':review:' + ready.retest.reportReviewGeneration, reviewTurn);
      }
      assert.equal(git(project, 'rev-parse', 'HEAD'), childOid);
      assert.equal(digest(await readFile(join(project, '.git', 'index'))), observation.indexDigest);
      assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.taskId === child.taskId)?.task.executionAttempt, child.task.executionAttempt);
    } else if (optedIn && index === 1 && !prepRework) {
      const path = 'src/race/extra-receipt.txt';
      const beforeIndex = digest(await readFile(join(project, '.git', 'index')));
      const writeIntent = { ...address, key: 'file:extra-receipt', kind: 'task-write' as const, task: child.task,
        expected: { paths: [path], operation: 'write', contentSha256: digest('historical receipt') } };
      const written = unwrap(service.claimEffect(ref, writeIntent));
      const generated = await write(path, 'historical receipt');
      unwrap(service.settleEffect(ref, { key: written.key, token: written.token, outcome: 'succeeded', evidence: 'Actual test fixture file write' }));
      const staged = { ...address, key: 'git-add:v2:' + digest(path), kind: 'task-write' as const, task: child.task,
        expected: { head: childOid, branch, indexDigest: beforeIndex, paths: [path] } };
      const rejected = service.claimEffect(ref, staged);
      assert.equal(rejected.ok ? undefined : rejected.code, 'workflow-implementation-already-committed');
      assert.equal(digest(await readFile(join(project, '.git', 'index'))), beforeIndex);
      git(project, 'add', '--', path);
      const afterIndex = digest(await readFile(join(project, '.git', 'index')));
      settleReview();
      const originalParent = await childReport(parent, reviewTurn, 'blocked-operator', 'Real Git blocked close', [], 'blocked');
      unwrap(originalParent);
      service.close();
      const reopened = new DurableLedger(dataDir);
      reopened.transaction(() => reopened.saveEffect(ref.instanceId, { intent: staged, state: 'succeeded', token: 'historical-stage',
        result: { key: staged.key, token: 'historical-stage', outcome: 'succeeded', evidence: 'Historical R15 Git stage fixture',
          result: { beforeIndex, afterIndex, afterBranch: branch, afterHead: childOid, exitCode: '0' } } }));
      reopened.close();
      service = new DurableWorkflowService(dataDir, process.cwd());
      if (scenario === 'stop') {
        git(project, 'switch', '--detach', childOid);
        await service.prepareA11BlockedReduction({ ...address, ref, turn: 1, entry: 12 });
        assert.equal(service.lookup(ref)?.a11Disposition?.parentReport?.key, 'report:blocked-operator');
      }
      const observation: DurableA11GitObservation = { head: childOid, ...(scenario === 'stop' ? {} : { branch }), indexDigest: afterIndex,
        stagedPaths: [path], untrackedPaths: [], trackedDirty: false, reason: '已核实有额外暂存。', files: [generated], worktreeDigest: digest(generated.sha256) };
      const parking = unwrap(await service.parkA11Disposition(ref, { childTask: child.task, observation }, current));
      assert.equal(parking.recovery?.addEffectKey, staged.key);
      assert.equal(parking.parentReport?.key, 'report:blocked-operator');
      assert.deepEqual(service.apply({ ...address, ref, turn: 1, entry: 12 }), { entry: 12 });
      assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.taskId === parent.taskId)?.report?.key, 'report:blocked-operator');
      assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.workItemId === roleIds[0] && task.state === 'accepted')?.state, 'accepted');
      assert.equal((await service.submitCapability(ref, { ...workerRequest, key: 'new-while-parked' }, current)).ok, false);
      if (scenario === 'stop') {
        const old = service.lookup(ref)!.blockedRouting!.binding;
        await write(criteria.path, 'Actual standard drift');
        const changed = await service.decideBlockedScopeChange(ref, { ...old, option: 'stop', provenance: { source: 'customer' } }, current);
        assert.equal(changed.ok, false);
        assert.equal(service.lookup(ref)?.a11Disposition?.standardState, 'drifted');
        const drifted = service.lookup(ref)!.blockedRouting!.binding;
        await write(criteria.path, 'Different actual standard drift');
        assert.equal((await service.decideBlockedScopeChange(ref, { ...drifted, option: 'wait', provenance: { source: 'customer' } }, current)).ok, false);
        const wait = service.lookup(ref)!.blockedRouting!.binding;
        unwrap(await service.decideBlockedScopeChange(ref, { ...wait, option: 'wait', provenance: { source: 'customer' } }, current));
        const stop = unwrap(await service.requestA11DispositionStop(ref, parking.key, current));
        assert.equal(stop.confirmation, 'stop');
        const cancelled = service.lookup(ref)!.blockedRouting!.binding;
        unwrap(await service.decideBlockedScopeChange(ref, { ...cancelled, option: 'wait', provenance: { source: 'customer' } }, current));
        const requestedAgain = unwrap(await service.requestA11DispositionStop(ref, parking.key, current));
        assert.equal(requestedAgain.generation, stop.generation + 1);
        const confirm = service.lookup(ref)!.blockedRouting!.binding;
        unwrap(await service.decideBlockedScopeChange(ref, { ...confirm, option: 'stop', provenance: { source: 'customer' } }, current));
        assert.deepEqual(service.apply({ ...address, ref, turn: 2, entry: 12 }), { terminal: 'blocked', entry: 13 });
        assert.equal(git(project, 'diff', '--cached', '--name-only'), path);
        assert.equal(await readFile(join(project, path), 'utf8'), 'historical receipt');
        return;
      }
      const intendedIndex = scenario === 'manual' ? '1'.repeat(64) : beforeIndex;
      const recoveryIntent = { ...address, key: 'a11-index-recovery:' + parking.key, kind: 'a11-index-recovery' as const, task: child.task,
        expected: { branch, head: childOid, beforeIndex: afterIndex, afterIndex: intendedIndex, paths: [path], worktreeDigest: observation.worktreeDigest!,
          lockPid: '100', lockFileId: 'fixture-index-lock' } };
      assert.equal(service.claimEffect(ref, recoveryIntent).ok, false, 'must call trusted recovery entry');
      const claim = unwrap(await service.claimA11RecoveryEffect(ref, recoveryIntent, current));
      const decision = service.lookup(ref)!.blockedRouting!.binding;
      assert.equal((await service.decideBlockedScopeChange(ref, { ...decision, option: 'stop', provenance: { source: 'customer' } }, current)).ok, false);
      if (scenario === 'manual') {
        unwrap(service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'unknown', evidence: 'Fixture uncertain original index outcome' }));
        unwrap(await service.decideBlockedScopeChange(ref, { ...decision, option: 'wait', provenance: { source: 'customer' } }, current));
      }
      git(project, 'restore', '--staged', '--', path);
      const result = { branch, head: childOid, indexDigest: scenario === 'manual' ? digest(await readFile(join(project, '.git', 'index'))) : beforeIndex,
        worktreeDigest: observation.worktreeDigest! };
      if (scenario === 'recovery') {
        unwrap(service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded', evidence: 'Fixture verified post-state', result }));
        assert.equal((await service.decideBlockedScopeChange(ref, { ...decision, option: 'stop', provenance: { source: 'customer' } }, current)).ok, false);
      }
      const clean: DurableA11GitObservation = { ...observation, ...result, stagedPaths: [], untrackedPaths: [path], reason: '工作区已保留回执。' };
      const restored = unwrap(await service.resumeA11Disposition(ref, parking.key, clean, current));
      assert.equal(restored.recoveryMode, scenario === 'manual' ? 'manual' : 'native');
      assert.equal(service.listEffects(ref, 'a11-index-recovery').at(-1)?.state, scenario === 'manual' ? 'unknown' : 'succeeded');
      assert.equal(service.lookup(ref)?.blockedRouting, undefined);
      assert.equal(service.lookup(ref)?.pendingTasks?.find(task => task.taskId === parent.taskId)?.report, undefined);
      assert.equal(unwrap(await childReport(parent, reviewTurn, 'blocked-operator', 'Real Git blocked close', [], 'blocked')).state, 'ignored');
      const newTurn = 'worker-original-recovery';
      model(child, 'a11-resume:' + parking.key, newTurn)();
      assert.equal(unwrap(service.claimEffect(ref, { ...address, task: child.task, kind: 'model-send', key: 'model:a11-resume:' + parking.key,
        expected: { roleId: child.roleId, runtime: 'claude' } })).execute, false);
      assert.equal((await childReport(child, workerTurn, 'old-child-forged', 'Was not sent', [], 'completed', parking.key)).ok, false);
      assert.equal((await childReport(child, newTurn, 'missing-recovery-binding', 'Was not bound')).ok, false);
      reportKey = 'worker-recovered';
      unwrap(await childReport(child, newTurn, reportKey, 'Real recovered report using application self-check', [], 'completed', parking.key));
      reviewTurn = 'operations-recovery-review';
      settleReview = model(parent, 'a11-wake:' + child.taskId + ':report:' + reportKey, reviewTurn);
      assert.equal(await readFile(join(project, path), 'utf8'), 'historical receipt');
    }
    const source = { ...childRequest.source, originId: reviewTurn };
    const close = await service.submitCapability(ref, { ...address, source, key: 'close-' + index,
      input: { kind: 'task-closed', task: child.task, reportKey: 'report:' + reportKey, outcome: 'accepted', tipOid: childOid } }, current);
    unwrap(close);
    accepted.push({ child, childOid });
    if (index === 0) {
      assert.deepEqual(service.apply({ ...address, ref, turn: 0, entry: 12 }), { entry: 12 });
      unwrap(await service.submitCapability(ref, { ...workerRequest, source }, current));
      if (scenario === 'retest-exhausted') {
        settleReview();
        for (const attempt of [1, 2]) {
          const prior = service.lookup(ref)!.pendingTasks!.findLast(task => task.workItemId === 'worker')!;
          assert.equal(prior.task.executionAttempt, attempt);
          const report = 'budget-original-' + attempt;
          model(prior, prior.taskId, 'original-worker-' + attempt)();
          unwrap(await childReport(prior, 'original-worker-' + attempt, report, 'Earlier code delivery not ready.', [], 'blocked'));
          const earlierReview = 'original-review-' + attempt;
          const finishing = model(parent, 'a11-wake:' + prior.taskId + ':report:' + report, earlierReview);
          const earlierClose = 'earlier-close-' + attempt;
          unwrap(await service.submitCapability(ref, { ...address, source: { ...source, originId: earlierReview }, key: earlierClose,
            input: { kind: 'task-closed', task: prior.task, reportKey: 'report:' + report, outcome: 'rework' } }, current));
          finishing();
          const progress = 'original-progress-' + attempt;
          const next = model(parent, 'a11-progress:' + prior.taskId + ':' + earlierClose, progress);
          unwrap(await service.submitCapability(ref, { ...workerRequest, key: 'a11-dispatch:' + parent.taskId + ':earlier-' + attempt, source: { ...source, originId: progress },
            input: { kind: 'implementation-dispatch', workItemId: 'worker', roleId: 'worker', requestId: 'earlier-' + attempt,
              rework: true, text: 'Original implementation rework' } }, current));
          next();
        }
      }
    }
    settleReview();
    if (index === 1) {
      const receipt = await childReport(parent, reviewTurn, 'aggregate', 'Final ' + childOid,
        accepted.flatMap(row => [row.child.taskId, row.childOid]));
      unwrap(receipt);
    }
  }
  assert.deepEqual(service.apply({ ...address, ref, turn: optedIn ? 2 : 1, entry: 12 }), { next: 'assess', entry: 13 });
  const advanced = service.lookup(ref)!;
  assert.equal(advanced.implementation?.task.taskId, accepted[1]?.child.taskId);
  assert.equal(advanced.pendingTasks?.find(task => task.taskId === parent.taskId)?.aggregate?.entries.length, 2);
  if (prepRework) {
    const ready = async () => ({ ok: true as const, value: true as const });
    const observed = unwrap(await service.prepareWorkflowDispatch(ref, ready));
    const original = observed.acceptanceWorkspace!;
    const record = (path: string) => service.recordAcceptancePreparation(ref, { prepareKey: original.prepareKey, basis: original.basis,
      result: { kind: 'candidate-defect', stage: 'entry', code: 'static-entry-rejected', reason: '实际入口未通过预览安全核验。',
        candidate: { state: 'verified', oid: original.basis.candidateOid, branch }, paths: [{ path, state: 'present' }] } }, current);
    const noWriteProof = unwrap(await record('env/entry.mjs'));
    assert.equal(noWriteProof.rework, undefined);
    assert.deepEqual(service.lookup(ref)?.blockedRouting?.options.map(option => option.id), ['wait', 'stop']);
    const scoped = unwrap(await record('index.html'));
    const oldOwner = accepted[0]!.child;
    assert.equal(scoped.generation, noWriteProof.generation + 1);
    assert.deepEqual(scoped.rework?.ownerTask, oldOwner.task);
    assert.deepEqual(scoped.rework?.writeEffectKeys, ['file:original-entry']);
    assert.deepEqual(scoped.rework?.paths, ['index.html']);
    assert.equal(scoped.rework?.inherited[0]?.taskId, accepted[1]?.child.taskId);
    const card = service.lookup(ref)!.blockedRouting!;
    unwrap(await service.decideBlockedScopeChange(ref, { ...card.binding, option: 'rework', provenance: { source: 'customer' } }, current));
    assert.equal((await record('env/entry.mjs')).ok, false, 'committed rework wins against a later observation');
    assert.deepEqual(service.apply({ ref, stepId: 'assess', turn: 0, entry: 13 }), { next: 'revise-implementation', entry: 14 });
    assert.deepEqual(service.apply({ ref, stepId: 'revise-implementation', turn: 0, entry: 14 }), { next: 'implement', entry: 15 });
    const opened = unwrap(await service.prepareWorkflowDispatch(ref));
    assert.equal(opened.attempt, 2);
    assert.deepEqual(opened.implementationItems, [{ id: 'env-owner', roleId: 'env-owner', paths: ['index.html'] }]);
    assert.equal(opened.implementationRepair?.inherited[0]?.taskId, accepted[1]?.child.taskId);
    const newParent = opened.pendingTasks!.find(task => task.capability === 'operations-implementation' && task.attempt === 2)!;
    const repairAddress = { ...address, attempt: 2 };
    const repairParentTurn = 'actual-a11-repair-parent';
    model(newParent, newParent.taskId, repairParentTurn)();
    const dispatchRepair: DurableCapabilityEvent = { ...repairAddress, key: 'a11-dispatch:' + newParent.taskId + ':entry-fix',
      source: { roleId: newParent.roleId, originId: repairParentTurn, parentTaskId: newParent.taskId },
      input: { kind: 'implementation-dispatch', roleId: 'env-owner', workItemId: 'env-owner', requestId: 'entry-fix',
        text: '修正已定位的入口。', modulePaths: ['index.html'], rework: true } };
    for (const change of [{ rework: false }, { roleId: 'worker' }, { modulePaths: ['env/'] }]) {
      assert.equal((await service.submitCapability(ref, { ...dispatchRepair, input: { ...dispatchRepair.input, ...change } as typeof dispatchRepair.input }, current)).ok, false);
    }
    unwrap(await service.submitCapability(ref, dispatchRepair, current));
    const repairChild = service.lookup(ref)!.pendingTasks!.find(task => task.workItemId === 'env-owner' && task.attempt === 2)!;
    assert.deepEqual(service.taskGitScope(ref, repairChild.taskId, repairChild.roleId)?.paths, ['index.html']);
    const repairTurn = 'actual-a11-repair-owner';
    model(repairChild, repairChild.taskId, repairTurn)();
    await write('index.html', '<body>Fixed entry</body>\n');
    git(project, 'add', '--', 'index.html');
    const markers = { marker: 'ANS fixture repair marker', diffDigest: digest(git(project, 'diff', '--cached', '--binary')) };
    const commit = unwrap(service.claimEffect(ref, { ...repairAddress, kind: 'task-commit', key: 'task-commit:' + repairChild.taskId,
      task: repairChild.task, expected: { paths: ['index.html'], branch, head: original.basis.candidateOid, ...markers } }));
    git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Fix verified entry', '-m', markers.marker);
    const fixed = git(project, 'rev-parse', 'HEAD');
    unwrap(service.settleEffect(ref, { key: commit.key, token: commit.token, outcome: 'succeeded',
      evidence: 'Fixture repair actual commit.', result: { oid: fixed, diffDigest: markers.diffDigest } }));
    const argv = ['node', '--check', 'env/entry.mjs'];
    execFileSync(process.execPath, argv.slice(1), { cwd: project });
    unwrap(await service.recordImplementationSelfTest(ref, { task: repairChild.task, observation: {
      argv, roleId: repairChild.roleId, turnId: repairTurn, toolCallId: 'new-entry-self-test', cwd: project,
      reviewedBy: 'fixture-operator', outcome: { exitCode: 0 }, writeAuditPassed: true,
    } }, current));
    unwrap(await childReport(repairChild, repairTurn, 'fixed-entry', 'New actual candidate and self-test'));
    const finalTurn = 'convener-entry-fix-review';
    model(newParent, 'a11-wake:' + repairChild.taskId + ':report:fixed-entry', finalTurn)();
    unwrap(await service.submitCapability(ref, { ...repairAddress, key: 'close-entry-fix',
      source: { roleId: newParent.roleId, originId: finalTurn, parentTaskId: newParent.taskId },
      input: { kind: 'task-closed', task: repairChild.task, reportKey: 'report:fixed-entry', outcome: 'accepted', tipOid: fixed } }, current));
    const inherited = accepted[1]!;
    unwrap(await childReport(newParent, finalTurn, 'accepted-entry-fix', 'Final ' + fixed,
      [repairChild.taskId, fixed, inherited.child.taskId, inherited.childOid]));
    assert.deepEqual(service.apply({ ...repairAddress, ref, entry: 15, turn: 0 }), { next: 'assess', entry: 16 });
    const newAssessment = unwrap(await service.prepareWorkflowDispatch(ref, ready)).acceptanceWorkspace!;
    assert.equal(newAssessment.basis.candidateOid, fixed);
    assert.equal(newAssessment.basis.assessmentTask.stageAttempt, 2);
    assert.notEqual(newAssessment.prepareKey, original.prepareKey);
    assert.equal((await service.recordAcceptancePreparation(ref, { prepareKey: original.prepareKey, basis: original.basis,
      result: { kind: 'not-applicable', authority: 'no-workspace-required' } }, current)).ok, false);
    assert.equal(service.listCapabilityEvents(ref).some(row => row.event.stepId === 'assess'
      && ['task-report', 'task-closed'].includes(row.event.input.kind)), false);
    return;
  }
  const blocked = await service.prepareWorkflowDispatch(ref, async target => {
    assert.equal(target.roleId, 'verifier');
    assert.equal(target.path, 'docs/quality/game-report-v1.md');
    return { ok: false, code: 'fixture-no-write', message: 'Current role does not cover docs/quality.' };
  });
  assert.equal(blocked.ok, false);
  assert.equal(service.lookup(ref)?.pendingTasks?.some(task => task.capability === 'independent-assessment'), false);
  assert.deepEqual(service.apply({ ref, stepId: 'assess', turn: 0, entry: 13 }), { terminal: 'blocked', entry: 14 });
});
