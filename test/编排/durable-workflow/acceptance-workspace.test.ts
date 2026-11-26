import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type {
  DurableAcceptancePreparationResult, DurableAcceptanceWorkspaceBinding, DurableAcceptanceWorkspaceRunReceipt, DurableEffect, DurableResult, DurableTaskBinding,
} from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, pinPathAV7, pinPathAV8 } from './fixture.ts';

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

async function setup(t: TestContext, staticRequirements?: DurableAcceptanceWorkspaceBinding['staticRequirements'], hostBrowser = false,
  optedIn = false) {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  if (optedIn) await pinPathAV8(definitions);
  else await pinPathAV7(definitions);
  const criteriaPath = 'docs/quality/race-criteria-v1.md';
  const entry = '<!doctype html><title>Fixture output</title><script type="module" src="./src/game.js"></script>';
  const candidateFiles = [['index.html', entry], ['src/game.js', 'export const score = 0;']] as const;
  const criteriaText = hostBrowser ? '```ans-criteria\nschema: ans-criteria/v1\nflowId: race\nversion: 1\nstatus: final\ncriteria:\n  - id: AC-1\n    priority: P0\n    title: Use the actual browser controls\n```\n' : staticRequirements
    ? 'Drive the static candidate in the browser and record evidence.' +
      (staticRequirements.build ? ' Run the actual build.' : '') +
      (staticRequirements.requireDeliveryStartup ? ' Run the advertised startup command.' : '') +
      (staticRequirements.requireLogicTest ? ' Run the actual logic tests.' : '')
    : 'Build the candidate. Drive the race in the browser and record evidence.';
  await mkdir(join(project, 'docs', 'quality'), { recursive: true });
  await writeFile(join(project, criteriaPath), criteriaText);
  if (staticRequirements) {
    await mkdir(join(project, 'src'));
    for (const [path, bytes] of candidateFiles) await writeFile(join(project, path), bytes);
    await mkdir(join(project, 'tools'));
    await writeFile(join(project, 'tools', 'server.mjs'), 'throw new Error("candidate launcher is not part of static preview");');
  }
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Candidate and standard');
  const candidateOid = git(project, 'rev-parse', 'HEAD');
  const criteria = { path: criteriaPath, sha256: digest(criteriaText) };
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const source = 'project';
  const definition = unwrap(await service.validateDefinition(project, 'path-a', { source }));
  const live = () => true;
  const text = 'Develop and verify a racing game.';
  const proposed = unwrap(await service.proposeWorkflowStart({
    projectRoot: project, definitionId: 'path-a', source, reason: 'New project', expectedDigest: definition.digest,
    requirement: { inputId: 'demand', turnId: 'select', text, digest: digest(text), runtime: 'claude' },
  }, live));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: proposed.activationId,
    requestId: proposed.requestId, action: 'approve' }, live));
  const ref = unwrap(await service.startApprovedWorkflow(project, proposed.activationId, live)).instanceRef!;
  const branch = 'ans/task/' + ref.instanceId;
  git(project, 'switch', '-c', branch);
  service.engineStatus('healthy', undefined, ref);
  service.close();

  const ledger = new DurableLedger(dataDir);
  const value = ledger.instance(ref.instanceId)!;
  const task = { stage: 'A12b', stageAttempt: 1, executionAttempt: 1, parentTaskId: ref.instanceId,
    taskId: 'assessment-task', roleId: 'verifier' } satisfies DurableTaskBinding;
  const reportPath = 'docs/quality/race-report-v1.md';
  const dispatch = { actor: 'application', flowId: 'race', text };
  Object.assign(value, { stepId: 'assess', entry: 13, baseline: { branch, oid: candidateOid } });
  Object.assign(value.graph!, { flowId: 'race', proofs: { 'standard-open': 'standard', implementationTip: candidateOid } });
  value.graph!.tasks.push({
    capability: 'independent-standard', stepId: 'open-standard', attempt: 1, flowId: 'race', roleId: 'verifier', taskId: 'standard-task',
    task: { ...task, taskId: 'standard-task', stage: 'A12a' }, outcome: 'accepted', state: 'accepted', baselineOid: candidateOid,
    documents: [criteria], dispatch,
  }, {
    capability: 'independent-assessment', stepId: 'assess', attempt: 1, flowId: 'race', roleId: task.roleId, taskId: task.taskId,
    task, state: 'pending', baselineOid: candidateOid, reviewWritePath: reportPath, dispatch,
  });
  ledger.save(value);
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());

  const step = { stepId: 'assess', attempt: 1 };
  const address = { ...step, flowId: 'race' };
  const basis = { candidateOid, branch, criteria, assessmentTask: task };
  const workspaceRoot = join(project, '.ans', 'acceptance-runs', task.taskId);
  const launcher = '// Fixture app launcher for the isolated workspace.';
  const binding: DurableAcceptanceWorkspaceBinding = { basis, projectRoot: project, workspaceRoot, workspaceIdentity: { dev: '11', ino: '12' },
    inputRoot: join(workspaceRoot, 'input'), outputRoot: join(workspaceRoot, 'output'), evidenceRoot: join(workspaceRoot, 'evidence'),
    launcherPath: join(workspaceRoot, 'build.mjs'), launcherSha256: digest(launcher), requiresBrowserEvidence: true,
    ...(hostBrowser ? { browserEvidenceSource: 'application-browser' } as const : {}),
    ...(staticRequirements ? { operation: 'static', staticRequirements } as const : {}) };
  const initial = service.lookup(ref)!.acceptanceWorkspace!;
  const effect = (kind: DurableEffect, key: string) => ({ ...step, kind, key, task });
  const syntheticTurn = 'assessment-turn';
  const run: DurableAcceptanceWorkspaceRunReceipt = { kind: 'acceptance-workspace-run', binding,
    build: { reviewedBy: 'fixture-operator', toolCallId: 'workspace-tool', turnId: syntheticTurn,
      argv: ['node', binding.launcherPath], cwd: binding.inputRoot, pid: 123, exitCode: 0, outputSha256: digest('synthetic output'),
      entrySha256: digest(entry), writeAuditPassed: true },
    preview: { reviewedBy: 'fixture-operator', url: 'http://127.0.0.1:43210/', port: 43210,
      openedAt: '2026-11-19T08:00:00Z', expiresAt: '2026-11-19T08:10:00Z', httpStatus: 200 } };
  function settle(key: string, token: string, receipt: unknown) {
    const { sha256 } = unwrap(service.storeEvidence(ref, receipt));
    return service.settleEffect(ref, { key, token, outcome: 'succeeded', evidence: 'Fixture records the result.', result: { receiptId: sha256 } });
  }
  async function prepare() {
    const intent = effect('acceptance-workspace-prepare', initial.prepareKey);
    const claim = unwrap(service.claimEffect(ref, intent));
    assert.equal(service.claimEffect(ref, effect('dispatch', 'dispatch:' + task.taskId)).ok, false);
    assert.equal(service.claimEffect(ref, { ...effect('model-send', 'model:' + task.taskId),
      expected: { roleId: task.roleId, runtime: 'claude' } }).ok, false);
    for (const root of [binding.inputRoot, binding.outputRoot, binding.evidenceRoot]) await mkdir(root, { recursive: true });
    await writeFile(binding.launcherPath, launcher);
    assert.equal(settle(claim.key, claim.token, { kind: 'acceptance-workspace-prepared',
      binding: { ...binding, inputRoot: project } }).ok, false);
    unwrap(settle(claim.key, claim.token, { kind: 'acceptance-workspace-prepared', binding }));
  }
  function admitModel() {
    const claim = unwrap(service.claimEffect(ref, { ...effect('model-send', 'model:' + task.taskId),
      expected: { roleId: task.roleId, runtime: 'claude' } }));
    unwrap(service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded',
      evidence: 'Fixture records model delivery.', result: { turnId: syntheticTurn } }));
  }
  async function submitReport(deliveryStartup?: string) {
    const reportText = `---\noutcome: accepted\ncandidateOid: ${candidateOid}\n`
      + (deliveryStartup === undefined ? '' : `deliveryStartup: ${deliveryStartup}\n`) + '---\nFixture acceptance.\n';
    const report = { path: reportPath, sha256: digest(reportText) };
    const write = unwrap(service.claimEffect(ref, { ...effect('task-write', 'review-report-write'),
      expected: { paths: [reportPath], contentSha256: report.sha256 } }));
    await writeFile(join(project, reportPath), reportText);
    unwrap(service.settleEffect(ref, { key: write.key, token: write.token, outcome: 'succeeded', evidence: 'Fixture records report file.' }));
    const reportKey = 'report:assessment-report';
    const evidence = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId: 'assessment-report', taskId: task.taskId,
      origin: 'submitted-report', status: 'completed', summary: { text: 'Fixture review.' },
      source: { roleId: task.roleId, runtime: 'claude', turnId: syntheticTurn } } }));
    unwrap(await service.submitCapability(ref, { ...address, key: reportKey,
      source: { roleId: task.roleId, originId: syntheticTurn, parentTaskId: task.taskId }, input: { kind: 'task-report', task, evidence } }));
    return { report, reportKey };
  }
  const restart = () => {
    service.close();
    service = new DurableWorkflowService(dataDir, process.cwd());
  };
  return { project, ref, get service() { return service; }, task, binding, initial, address, effect, run, entry, candidateFiles,
    prepare, settle, admitModel, submitReport, restart };
}

test('A12b workspace binds prepare, one run, loopback closure, actual evidence and the original assessment', async t => {
  const f = await setup(t);
  const { ref, binding, initial, run } = f;
  assert.equal(initial.state, 'eligible');
  const runIntent = f.effect('acceptance-workspace-run', initial.runKey);
  assert.equal(f.service.claimEffect(ref, runIntent).ok, false);
  await f.prepare();
  assert.equal(f.service.lookup(ref)?.acceptanceWorkspace?.state, 'ready');
  assert.equal(f.service.claimEffect(ref, runIntent).ok, false);
  f.admitModel();
  const claim = unwrap(f.service.claimEffect(ref, runIntent));
  assert.equal(claim.execute, true);
  f.restart();
  assert.equal(unwrap(f.service.claimEffect(ref, runIntent)).execute, false);
  assert.equal(f.settle(claim.key, claim.token, { ...run, preview: { ...run.preview, url: 'http://0.0.0.0:43210/' } }).ok, false);
  assert.equal(f.settle(claim.key, claim.token, { ...run, build: { ...run.build, exitCode: 1 } }).ok, false);
  await writeFile(join(binding.outputRoot, 'index.html'), f.entry);
  unwrap(f.settle(claim.key, claim.token, run));
  const { report, reportKey } = await f.submitReport();
  const close = (documents = [report]) => f.service.submitCapability(ref, { ...f.address, key: 'review-close',
    source: { roleId: 'host', originId: f.task.taskId, parentTaskId: ref.instanceId }, input: {
      kind: 'task-closed', task: f.task, reportKey, outcome: 'accepted', tipOid: binding.basis.candidateOid, documents,
    } });
  assert.equal((await close()).ok, false);
  const closeEffect = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-close', initial.closeKey)));
  unwrap(f.settle(closeEffect.key, closeEffect.token, { kind: 'acceptance-workspace-closed', binding,
    url: run.preview.url, closedAt: '2026-11-19T08:05:00Z' }));
  assert.equal((await close()).ok, false);
  const acceptedPath = 'docs/verification/browser-result.txt';
  await mkdir(join(f.project, 'docs', 'verification'), { recursive: true });
  await writeFile(join(f.project, acceptedPath), 'Actual application evidence fixture.');
  const proof = unwrap(await f.service.readEvidence(f.project, acceptedPath));
  const evidenceEffect = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-evidence', initial.evidenceKey)));
  const captured = { kind: 'acceptance-workspace-browser-evidence', binding, url: run.preview.url,
    observedAt: '2026-11-19T08:04:00Z', checks: ['fixture browser check'], artifacts: [proof] };
  assert.equal(f.settle(evidenceEffect.key, evidenceEffect.token, { ...captured, observedAt: '2026-11-19T08:06:00Z' }).ok, false);
  unwrap(f.settle(evidenceEffect.key, evidenceEffect.token, captured));
  await writeFile(join(binding.outputRoot, 'index.html'), 'Drifted output');
  assert.equal((await close([report, proof])).ok, false);
  await writeFile(join(binding.outputRoot, 'index.html'), f.entry);
  unwrap(await close([report, proof]));
  assert.equal(f.service.apply({ ref, stepId: 'assess', entry: 13, turn: 0 }).next, 'archive');
  assert.equal(f.service.claimEffect(ref, { ...runIntent, key: runIntent.key + '-late' }).ok, false);
});

test('v8 holds the actual dispatch permit until the same preparation settles and is durably observed', async t => {
  const f = await setup(t, undefined, false, true);
  const { ref, task, initial, binding } = f;
  const live = () => true;
  assert.equal(initial.preparationGate, true);
  const record = (result: DurableAcceptancePreparationResult) => f.service.recordAcceptancePreparation(ref,
    { prepareKey: initial.prepareKey, basis: initial.basis, result }, live);
  const observeUnavailable = () => record({ kind: 'unavailable', stage: 'workspace', code: 'workspace-unavailable',
    reason: '宿主暂无法准备工作区。', candidate: { state: 'unreadable' } });
  assert.equal(f.service.acceptanceDispatchPermit(ref, task).ok, false);
  assert.equal((await record({ kind: 'prepared', receiptId: '9'.repeat(64) })).ok, false);
  const initialIssue = unwrap(await observeUnavailable());
  assert.deepEqual(unwrap(await observeUnavailable()), initialIssue);
  const firstCard = f.service.lookup(ref)!.blockedRouting!.binding;
  const wait = { ...firstCard, option: 'wait' as const, provenance: { source: 'customer' as const } };
  unwrap(await f.service.decideBlockedScopeChange(ref, wait, live));
  f.restart();
  assert.equal(f.service.lookup(ref)?.blockedRouting?.decision?.option, 'wait');
  const confirmation = unwrap(await f.service.requestAcceptancePreparationStop(ref, initial.prepareKey, live));
  assert.equal(confirmation.confirmation, 'stop');
  const cancel = f.service.lookup(ref)!.blockedRouting!.binding;
  unwrap(await f.service.decideBlockedScopeChange(ref, { ...wait, ...cancel }, live));
  const claim = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-prepare', initial.prepareKey)));
  unwrap(f.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'unknown', evidence: 'Fixture lost preparation acknowledgement.' }));
  const uncertain = unwrap(await observeUnavailable());
  assert.equal(uncertain.effect?.state, 'unknown');
  assert.equal(f.service.acceptanceDispatchPermit(ref, task).ok, false);
  assert.equal(unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-prepare', initial.prepareKey))).execute, false);
  const ready = { kind: 'acceptance-workspace-prepared', binding };
  const receiptId = unwrap(f.service.storeEvidence(ref, ready)).sha256;
  unwrap(f.service.settleEffect(ref, { key: claim.key, token: claim.token, outcome: 'succeeded',
    evidence: 'Fixture reconciled the ready registration.', result: { receiptId } }));
  assert.equal(f.service.acceptanceDispatchPermit(ref, task).ok, false, 'a settled effect alone cannot deliver');
  const prepared = unwrap(await record({ kind: 'prepared', receiptId }));
  assert.equal(prepared.generation, uncertain.generation + 1);
  const permit = unwrap(f.service.acceptanceDispatchPermit(ref, task));
  assert.deepEqual(permit, { prepareKey: initial.prepareKey, generation: prepared.generation });
  const send = f.effect('model-send', 'model:' + task.taskId);
  const expected = { roleId: task.roleId, runtime: 'claude', prepareKey: initial.prepareKey, preparationGeneration: String(prepared.generation) };
  assert.equal(f.service.claimEffect(ref, { ...send, expected: { ...expected, preparationGeneration: String(uncertain.generation) } }).ok, false);
  const sent = unwrap(f.service.claimEffect(ref, { ...send, expected }));
  assert.equal(sent.execute, true);
  assert.equal((await f.service.decideBlockedScopeChange(ref, { ...cancel, option: 'stop', provenance: { source: 'customer' } }, live)).ok, false);
});

test('v8 observations bind actual signed-byte drift and allow a real stop without assessment handback', async t => {
  const f = await setup(t, undefined, false, true);
  const { ref, initial, project } = f;
  const live = () => true;
  const record = () => f.service.recordAcceptancePreparation(ref, { prepareKey: initial.prepareKey, basis: initial.basis,
    result: { kind: 'material-conflict', stage: 'materials', code: 'workspace-criteria-drifted', reason: '原标准字节变化。',
      candidate: { state: 'verified' }, paths: [{ path: initial.basis.criteria.path, state: 'present' }] } }, live);
  await writeFile(join(project, initial.basis.criteria.path), 'first drift');
  const first = unwrap(await record());
  const scope = f.service.lookup(ref)!.blockedRouting!;
  assert.equal(first.materials[0]?.state, 'drifted');
  assert.equal(scope.a12bPrepareKey, initial.prepareKey);
  assert.deepEqual(scope.options.map(option => option.id), ['wait', 'stop']);
  await writeFile(join(project, initial.basis.criteria.path), 'second drift');
  assert.equal((await f.service.decideBlockedScopeChange(ref, { ...scope.binding, option: 'stop', provenance: { source: 'customer' } }, live)).ok, false);
  assert.equal(f.service.lookup(ref)?.acceptanceWorkspace?.preparation?.generation, first.generation + 1);
  const current = f.service.lookup(ref)!.blockedRouting!;
  unwrap(await f.service.decideBlockedScopeChange(ref, { ...current.binding, option: 'stop', provenance: { source: 'customer' } }, live));
  assert.equal(f.service.apply({ ref, stepId: 'assess', entry: 13, turn: 0 }).terminal, 'blocked');
  assert.equal(f.service.listCapabilityEvents(ref).some(row => row.event.input.kind === 'task-report' || row.event.input.kind === 'task-closed'), false);
});

test('browser capture must come from the current host lease, run and real hashed workspace files', async t => {
  const f = await setup(t, undefined, true);
  const { ref, task, binding, initial } = f;
  await f.prepare();
  f.admitModel();
  const preview = { ...f.run.preview, openedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
  const run = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-run', initial.runKey)));
  await writeFile(join(binding.outputRoot, 'index.html'), f.entry);
  unwrap(f.settle(run.key, run.token, { ...f.run, preview }));
  const runReceiptId = f.service.lookup(ref)!.acceptanceWorkspace!.runReceiptId!;
  const turnId = f.run.build.turnId;
  const toolCallId = 'actual-browser-tool';
  const key = 'acceptance-workspace-browser-capture:' + task.taskId + ':' + digest(toolCallId);
  const intent = { ...f.effect('acceptance-workspace-browser-capture', key), expected: { runReceiptId, turnId, toolCallId } };
  assert.equal(f.service.claimEffect(ref, { ...intent, expected: { ...intent.expected, runReceiptId: '0'.repeat(64) } }).ok, false);
  assert.equal(f.service.claimEffect(ref, { ...intent, expected: { ...intent.expected, turnId: 'other-turn' } }).ok, false);
  const claim = unwrap(f.service.claimEffect(ref, intent));
  f.restart();
  assert.equal(unwrap(f.service.claimEffect(ref, intent)).execute, false);
  const startedAt = new Date(Date.now() - 4000).toISOString();
  const endedAt = new Date(Date.now() - 1000).toISOString();
  const leaf = 'proof.png';
  const folder = '.ans/acceptance-runs/' + task.taskId + '/evidence/';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lL0AAAAASUVORK5CYII=', 'base64');
  const shot = { path: folder + leaf, sha256: digest(png) };
  const events = JSON.stringify({ kind: 'acceptance-browser-events', events: [
    { kind: 'keydown', key: 'ArrowUp', at: startedAt }, { kind: 'keyup', key: 'ArrowUp', at: endedAt },
    { kind: 'screenshot', path: shot.path, at: endedAt },
  ] });
  const capture = { kind: 'acceptance-workspace-browser-capture', binding, runReceiptId, url: preview.url, turnId, toolCallId,
    startedAt, endedAt, events: { path: folder + 'inputs.json', sha256: digest(events) }, screenshots: [shot] };
  const outcome = (evidence: unknown) => ({ key, token: claim.token, outcome: 'succeeded' as const, evidence: 'Host fixture proof',
    result: { receiptId: unwrap(f.service.storeEvidence(ref, evidence)).sha256 } });
  assert.equal(f.service.settleEffect(ref, outcome(capture)).ok, false);
  assert.equal((await f.service.settleAcceptanceBrowserCapture(ref, outcome(capture), () => true)).ok, false);
  await writeFile(join(f.project, capture.events.path), events);
  await writeFile(join(f.project, shot.path), png);
  assert.equal((await f.service.settleAcceptanceBrowserCapture(ref, outcome(capture), () => false)).ok, false);
  assert.equal((await f.service.settleAcceptanceBrowserCapture(ref, outcome({ ...capture, startedAt: preview.expiresAt }), () => true)).ok, false);
  const verified = outcome(capture);
  unwrap(await f.service.settleAcceptanceBrowserCapture(ref, verified, () => true));
  assert.equal(f.service.listEffects(ref, 'acceptance-workspace-browser-capture')[0]?.state, 'succeeded');

  const shutdown = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-close', initial.closeKey)));
  unwrap(f.settle(shutdown.key, shutdown.token, { kind: 'acceptance-workspace-closed', binding, url: preview.url, closedAt: new Date().toISOString() }));
  const lateTool = 'late-tool';
  assert.equal(f.service.claimEffect(ref, { ...intent, key: 'acceptance-workspace-browser-capture:' + task.taskId + ':' + digest(lateTool),
    expected: { ...intent.expected, toolCallId: lateTool } }).ok, false);
  const aggregate = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-evidence', initial.evidenceKey)));
  const publishedPath = 'docs/verification/race-' + task.taskId + '-' + leaf;
  await mkdir(join(f.project, 'docs', 'verification'), { recursive: true });
  await writeFile(join(f.project, publishedPath), png);
  const published = { path: publishedPath, sha256: shot.sha256 };
  const metadata = JSON.stringify({ schema: 'evidence-meta/v1', artifact: published.path, sha256: published.sha256, bytes: png.length,
    lines: 1, generatedAt: endedAt, acIds: ['AC-1'], acceptanceWorkspace: { candidateOid: binding.basis.candidateOid,
      criteriaSha256: binding.basis.criteria.sha256, taskId: task.taskId, turnId, previewUrl: preview.url, runReceiptId } });
  const sidecar = { path: published.path + '.meta.json', sha256: digest(metadata) };
  await writeFile(join(f.project, sidecar.path), metadata);
  const receipt = { kind: 'acceptance-workspace-browser-evidence', binding, url: preview.url, observedAt: endedAt, checks: ['AC-1'],
    artifacts: [published, sidecar], captureReceiptIds: [verified.result.receiptId] };
  assert.equal(f.settle(aggregate.key, aggregate.token, { ...receipt, captureReceiptIds: [] }).ok, false);
  assert.equal(f.settle(aggregate.key, aggregate.token, { ...receipt, artifacts: [{ ...published, sha256: '0'.repeat(64) }] }).ok, false);
  unwrap(f.settle(aggregate.key, aggregate.token, receipt));
  const { report, reportKey } = await f.submitReport();
  const close = () => f.service.submitCapability(ref, { ...f.address, key: 'review-close',
    source: { roleId: 'host', originId: task.taskId, parentTaskId: ref.instanceId }, input: { kind: 'task-closed', task,
      reportKey, outcome: 'accepted', tipOid: binding.basis.candidateOid, documents: [report, published, sidecar] } });
  await writeFile(join(f.project, publishedPath), 'changed evidence');
  assert.equal((await close()).ok, false);
  await writeFile(join(f.project, publishedPath), png);
  unwrap(await close());
  assert.equal(f.service.apply({ ref, stepId: 'assess', entry: 13, turn: 0 }).next, 'archive');
});

test('a declared unsupported workspace stays blocked across restart without another execution', async t => {
  const f = await setup(t);
  const { ref, initial } = f;
  const prepare = f.effect('acceptance-workspace-prepare', initial.prepareKey);
  assert.equal(f.service.claimEffect(ref, { ...prepare, task: { ...f.task, taskId: 'foreign-task' } }).ok, false);
  const claim = unwrap(f.service.claimEffect(ref, prepare));
  assert.equal(f.settle(claim.key, claim.token, 'not an application receipt').ok, false);
  const reason = 'The approved candidate requires an unsupported build tool.';
  unwrap(f.settle(claim.key, claim.token, { kind: 'acceptance-workspace-blocked', basis: initial.basis, reason }));
  f.restart();
  assert.equal(unwrap(f.service.claimEffect(ref, prepare)).execute, false);
  assert.equal(f.service.lookup(ref)?.acceptanceWorkspace?.reason, reason);
  f.admitModel();
  assert.equal(f.service.claimEffect(ref, f.effect('acceptance-workspace-run', initial.runKey)).ok, false);
  const { report, reportKey } = await f.submitReport();
  const close = await f.service.submitCapability(ref, { ...f.address, key: 'review-close',
    source: { roleId: 'host', originId: f.task.taskId, parentTaskId: ref.instanceId }, input: {
      kind: 'task-closed', task: f.task, reportKey, outcome: 'accepted', tipOid: initial.basis.candidateOid, documents: [report],
    } });
  assert.equal(close.ok, false);
  if (!close.ok) assert.equal(close.code, 'acceptance-workspace-proof-required');
});

test('a failed preview-close check permits only a rejected terminal and retains the unresolved effect', async t => {
  const f = await setup(t);
  const { ref, initial } = f;
  await f.prepare();
  f.admitModel();
  const run = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-run', initial.runKey)));
  await writeFile(join(f.binding.outputRoot, 'index.html'), f.entry);
  unwrap(f.settle(run.key, run.token, f.run));
  const { report, reportKey } = await f.submitReport();
  const close = (outcome: 'accepted' | 'rework' | 'rejected') => f.service.submitCapability(ref, {
    ...f.address, key: 'review-close', source: { roleId: 'host', originId: f.task.taskId, parentTaskId: ref.instanceId },
    input: { kind: 'task-closed', task: f.task, reportKey, outcome, tipOid: initial.basis.candidateOid, documents: [report] },
  });
  const assertedClose = f.effect('acceptance-workspace-close', initial.closeKey);
  assert.equal((await close('rejected')).ok, false);
  const shutdown = unwrap(f.service.claimEffect(ref, assertedClose));
  assert.equal((await close('rejected')).ok, false);
  unwrap(f.service.settleEffect(ref, { key: shutdown.key, token: shutdown.token, outcome: 'unknown',
    evidence: 'Fixture could not confirm the original loopback port closed.' }));
  assert.equal((await close('accepted')).ok, false);
  assert.equal((await close('rework')).ok, false);
  unwrap(await close('rejected'));
  assert.equal(f.service.apply({ ref, stepId: 'assess', entry: 13, turn: 0 }).terminal, 'blocked');
  assert.match(f.service.lookup(ref)?.blockedReason ?? '', /could not confirm the original loopback port closed/);
  assert.equal(f.service.listEffects(ref, 'acceptance-workspace-close')[0]?.state, 'unknown');
  assert.equal(unwrap(f.service.claimEffect(ref, assertedClose)).execute, false);
  assert.equal(f.service.lookup(ref)?.acceptanceArchive, undefined);
});

test('static workspace verifies selected Git bytes separately from build and required command checks', async t => {
  for (const scenario of ['static-approved', 'startup-unreported', 'build-required', 'startup-required', 'tests-required'] as const) {
    await t.test(scenario, async t => {
      const f = await setup(t, { build: scenario === 'build-required', deliveryStartup: 'node tools/server.mjs',
        requireDeliveryStartup: scenario === 'startup-required', requireLogicTest: scenario === 'tests-required' });
      const { ref, initial, binding } = f;
      await f.prepare();
      f.admitModel();
      const runEffect = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-run', initial.runKey)));
      const files = f.candidateFiles.map(([path, contents]) => ({ path, sha256: digest(contents) }));
      const fingerprint = digest(JSON.stringify(files.map(file => [file.path, file.sha256])));
      const { reviewedBy, toolCallId, turnId, argv, cwd } = f.run.build;
      const run = { kind: 'acceptance-workspace-static-run', binding,
        stage: { reviewedBy, toolCallId, turnId, argv, cwd, inputSha256: fingerprint, outputSha256: fingerprint,
          entrySha256: files[0]!.sha256, writeAuditPassed: true, files },
        preview: f.run.preview } as const;
      assert.equal(f.settle(runEffect.key, runEffect.token, f.run).ok, false);
      assert.equal(f.settle(runEffect.key, runEffect.token, { ...run, stage: { ...run.stage, pid: 1, exitCode: 0 } }).ok, false);
      const expanded = [...files, { path: 'tools/server.mjs', sha256: digest('candidate server') }];
      const expandedDigest = digest(JSON.stringify(expanded.map(file => [file.path, file.sha256])));
      assert.equal(f.settle(runEffect.key, runEffect.token, { ...run, stage: { ...run.stage, files: expanded,
        inputSha256: expandedDigest, outputSha256: expandedDigest } }).ok, false);
      for (const [file, contents] of f.candidateFiles) {
        await mkdir(join(binding.outputRoot, file, '..'), { recursive: true });
        await writeFile(join(binding.outputRoot, file), contents);
      }
      unwrap(f.settle(runEffect.key, runEffect.token, run));

      const closeEffect = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-close', initial.closeKey)));
      unwrap(f.settle(closeEffect.key, closeEffect.token, { kind: 'acceptance-workspace-closed', binding,
        url: run.preview.url, closedAt: '2026-11-19T08:05:00Z' }));
      const artifactPath = 'docs/verification/static-browser-result.txt';
      await mkdir(join(f.project, 'docs', 'verification'), { recursive: true });
      await writeFile(join(f.project, artifactPath), 'Browser evidence fixture.');
      const artifact = unwrap(await f.service.readEvidence(f.project, artifactPath));
      const browser = unwrap(f.service.claimEffect(ref, f.effect('acceptance-workspace-evidence', initial.evidenceKey)));
      unwrap(f.settle(browser.key, browser.token, { kind: 'acceptance-workspace-browser-evidence', binding,
        url: run.preview.url, observedAt: '2026-11-19T08:04:00Z', checks: ['fixture browser check'], artifacts: [artifact] }));
      const { report, reportKey } = await f.submitReport(scenario === 'startup-unreported' ? undefined : 'not-verified');
      const accept = () => f.service.submitCapability(ref, {
        ...f.address, key: 'review-close', source: { roleId: 'host', originId: f.task.taskId, parentTaskId: ref.instanceId },
        input: { kind: 'task-closed', task: f.task, reportKey, outcome: 'accepted', tipOid: initial.basis.candidateOid, documents: [report, artifact] },
      });
      if (scenario === 'static-approved') {
        await writeFile(join(binding.outputRoot, 'src', 'game.js'), 'changed browser bytes');
        const drift = await accept();
        assert.equal(drift.ok, false);
        if (!drift.ok) assert.equal(drift.code, 'acceptance-workspace-static-output-drift');
        await writeFile(join(binding.outputRoot, 'src', 'game.js'), f.candidateFiles[1]![1]);
        unwrap(await accept());
        assert.equal(f.service.apply({ ref, stepId: 'assess', entry: 13, turn: 0 }).next, 'archive');
      } else {
        const blocked = await accept();
        assert.equal(blocked.ok, false);
        if (!blocked.ok) assert.equal(blocked.code, scenario === 'startup-unreported'
          ? 'acceptance-workspace-static-startup-missing' : 'acceptance-workspace-static-check-required');
        assert.equal(f.service.lookup(ref)?.acceptanceArchive, undefined);
      }
    });
  }
});
