import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR } from '../../../src/model/durable-workflow.ts';
import type { DurableEffectIntent, DurableFact, DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import type { StoredInstance } from '../../../src/provider/durable-workflow/public.ts';
import { takeEffect } from '../../../src/service/durable-workflow/effects.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService, parseDefinition } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git } from './fixture.ts';

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

const independentReadOnly = `schema: 2
id: verify-existing-artifacts
version: 1
name: Existing artifacts
start: gather
steps:
  gather: { action: readonly-report, role: module-owner, next: evaluate }
  evaluate:
    action: wait-for-review
    on: { accepted: complete, blocked: hold }
  complete: { terminal: completed }
  hold: { terminal: blocked }
`;

test('native catalogue exposes two presets and imports a distinct legal graph without replacing files', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const blank = join(directory, 'blank');
  const source = join(directory, 'native-selection.yaml');
  await mkdir(blank);
  await writeFile(source, independentReadOnly);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());

  assert.deepEqual((await service.listDefinitions(blank)).map(item => item.definition?.id).sort(), ['path-a', 'path-b']);
  const external = unwrap(await service.importDefinition(blank, source));
  assert.equal(external.definition.id, 'verify-existing-artifacts');
  assert.equal(external.file, 'docs/workflows/verify-existing-artifacts.yaml');
  assert.equal(await readFile(join(blank, external.file), 'utf8'), independentReadOnly);
  assert.equal((await service.importDefinition(blank, source)).ok, false);
  assert.deepEqual(await readdir(join(blank, 'docs', 'workflows')), ['verify-existing-artifacts.yaml']);
  const parsed = unwrap(parseDefinition(independentReadOnly));
  assert.equal(unwrap(await service.validateDefinition(blank, parsed.id, { expectedDigest: parsed.digest, source: 'project' })).schema, 2);
  assert.equal(parseDefinition(independentReadOnly.replace('next: evaluate', 'next: complete')).ok, false);
  assert.equal(parseDefinition(independentReadOnly.replace('role: module-owner', 'role: independent-reviewer')).ok, false);
  assert.equal(parseDefinition(independentReadOnly.replace('action: wait-for-review', 'action: run-external-script')).ok, false);
});

test('directory ownership survives reopen before Git and the original selected YAML remains pinned', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const blank = join(directory, 'blank');
  await mkdir(blank);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  const competitor = new DurableWorkflowService(join(directory, 'other-data'), process.cwd());
  cleanup.push(() => service.close(), () => competitor.close());
  const copied = unwrap(await service.copyPreset(blank, 'path-a'));
  const selected = { projectRoot: blank, definitionId: 'path-a', requestId: 'provision',
    source: 'project' as const, expectedDigest: copied.definition.digest };
  const started = unwrap(await service.start(selected));
  assert.equal(started.definitionFile, 'docs/workflows/path-a.yaml');
  assert.equal(started.baseline, undefined);
  assert.equal(started.action, 'product-prepare');
  assert.equal((await readdir(blank)).includes('.git'), false);

  const blocked = await competitor.start({ projectRoot: blank, definitionId: 'path-a', requestId: 'second-root', source: 'preset' });
  assert.equal(blocked.ok ? undefined : blocked.code, 'workflow-workspace-busy');
  const differentSource = await service.start({ ...selected, source: 'preset' });
  assert.equal(differentSource.ok ? undefined : differentSource.code, 'start-key-conflict');
  const malformed = join(blank, copied.file);
  await writeFile(malformed, 'schema: 2\nid: path-a\n');
  assert.equal((await service.validateDefinition(blank, 'path-a', { source: 'project' })).ok, false);
  assert.equal((await service.validateDefinition(blank, 'path-a', { source: 'preset' })).ok, true);
  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.deepEqual(unwrap(await service.start(selected)).ref, started.ref);
  assert.equal((await service.owner(blank))?.instanceId, started.ref.instanceId);
  assert.equal((await competitor.owner(blank))?.ownedByThisDataDir, false);
  const shell = service.claimEffect(started.ref, { kind: 'task-write', key: 'unchecked-write', stepId: started.stepId,
    attempt: 1, expected: { roleId: 'chief', paths: ['src/index.ts'] } });
  assert.equal(shell.ok ? undefined : shell.code, 'effect-write-forbidden');
});

test('a writable existing-change definition refuses a fresh project before assigning an owner', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const blank = join(directory, 'blank');
  await mkdir(blank);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const result = await service.start({ projectRoot: blank, definitionId: 'path-b', requestId: 'start-b', source: 'preset' });
  assert.equal(result.ok ? undefined : result.code, 'workflow-existing-change-unavailable');
  assert.equal(await service.owner(blank), undefined);
  assert.deepEqual(await readdir(blank), []);
});

test('an existing repository stays in observation until the real chief model effect and specific tracked module are bound', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  await mkdir(join(project, 'src'));
  await mkdir(join(project, '角色卡', 'owner'), { recursive: true });
  await writeFile(join(project, 'src', 'settings.ts'), 'export const limit = 4;\n');
  await writeFile(join(project, '角色卡', 'owner', 'boundary.yaml'),
    'role: owner\nentries:\n  - root: project\n    path: src/\n    kind: directory\n    purpose: Existing module\n');
  git(project, 'add', 'src', '角色卡');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Existing module');
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const { ref, stepId, attempt } = unwrap(await service.start({ projectRoot: project, definitionId: 'path-b',
    requestId: 'qualify', source: 'preset' }));
  const apply = (turn: number) => service.apply({ ref, stepId, entry: 0, turn });
  assert.deepEqual(apply(0), { entry: 0 });
  assert.equal(service.lookup(ref)?.flowId, undefined);
  const text = 'Update the existing local limit';
  const event = { stepId, attempt, key: 'existing-purpose', flowId: 'change-limit',
    source: { roleId: 'chief', originId: 'chief-turn' }, input: {
      kind: 'stage-request' as const, stage: 'B1' as const, workflowPath: 'B' as const,
      requestDigest: digest(text), dispatch: { text, actor: 'chief', flowId: 'change-limit' },
      existingPaths: ['src/settings.ts'], reason: 'Change the current tracked limit',
    } };
  assert.equal((await service.submitCapability(ref, event)).ok, false);
  const key = 'model:chief-intake:' + stepId + ':' + attempt;
  const model = unwrap(service.claimEffect(ref, { key, stepId, attempt, kind: 'model-send', expected: { roleId: 'chief' } }));
  assert.equal(model.execute, true);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...event.input, existingPaths: ['src/new.ts'] } })).ok, false);
  unwrap(await service.submitCapability(ref, event));
  assert.deepEqual(apply(1), { entry: 0 });
  unwrap(service.settleEffect(ref, { key, token: model.token, outcome: 'succeeded',
    evidence: 'Observed application turn id', result: { turnId: 'chief-turn' } }));
  assert.equal(apply(2).next, 'prepare-branch');
  assert.equal(service.lookup(ref)?.flowId, 'change-limit');
  assert.equal((await service.checkExistingBaseline(ref)).ok, true);
  await writeFile(join(project, 'src', 'settings.ts'), 'export const limit = 8;\n');
  const drift = await service.checkExistingBaseline(ref);
  assert.equal(drift.ok ? undefined : drift.code, 'workflow-existing-baseline-drift');
});

test('an intervening independent standard preserves only the consumed B2 authorization for the current B3 parent', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  const yaml = new URL('../../测试/durable-workflow/fixtures/external-existing-change.yaml', import.meta.url);
  const definition = unwrap(parseDefinition(await readFile(yaml, 'utf8')));
  assert.equal(definition.schema, 2);
  const scopeStep = Object.entries(definition.steps).find(([, step]) => 'action' in step && step.action === 'accept-b3-advance-with-b2-scope')!;
  const standard = Object.entries(definition.steps).find(([, step]) => 'action' in step && step.action === 'independent-standard')!;
  const [stepId] = Object.entries(definition.steps).find(([, step]) => 'action' in step && step.action === 'b3-implement-and-accept')!;
  assert.equal('next' in scopeStep[1] && scopeStep[1].next, standard[0]);
  assert.equal('next' in standard[1] && standard[1].next, stepId);
  const ledger = new DurableLedger(dataDir);
  cleanup.push(() => ledger.close());
  const ref = { projectId: 'test-project', instanceId: 'test-instance', definitionId: definition.id,
    definitionVersion: definition.version, definitionDigest: definition.digest,
    executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
  const baseline = { oid: 'a'.repeat(40), branch: 'ans/task/' + ref.instanceId };
  const report = { key: 'analysis', attempt: 1, evidence: { path: 'docs/analysis.md', sha256: 'b'.repeat(64) }, modulePaths: ['src/settings.ts'] };
  const dispatch = { text: 'Implement the verified settings correction', flowId: 'settings', actor: 'chief' };
  const scope: Extract<DurableFact, { kind: 'b3-advance' }> = { kind: 'b3-advance', key: 'b3-advance:1', source: 'chief',
    stepId: scopeStep[0], attempt: 1, sourceTaskId: 'actual-chief-turn', requestDigest: digest(dispatch.text),
    b1Attempt: 1, reportKey: report.key, baselineOid: baseline.oid, candidateSource: 'modulePaths',
    candidates: report.modulePaths, writeSets: [{ roleId: 'worker', paths: report.modulePaths }], reason: 'Verified existing defect', dispatch };
  const instance: StoredInstance = { ref, definition, projectRoot: project, commonDir: join(project, '.git'),
    requestId: 'external-run', metadata: {}, attempt: 1, entry: 4, stepId, status: 'waiting', engine: 'healthy',
    visits: {}, scheduled: true, scheduling: false, baseline, analysisReport: report, scope,
    graph: { flowId: dispatch.flowId, tasks: [], proofs: { 'standard-open': 'independent-task-bound' } },
    actionIntent: { key: 'start-b3', stepId, attempt: 1, action: 'b3-implement-and-accept', sourceKey: 'independent-task-bound' } };
  const task = { stage: 'B3' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: scope.sourceTaskId,
    taskId: 'operations-b3', roleId: 'convener' };
  const intent: DurableEffectIntent = { key: 'model:operations-b3', kind: 'model-send', stepId, attempt: 1, task };
  const tryClaim = (context = instance, effect = intent) => ledger.transaction(() => takeEffect(ledger, context, effect));
  const denied = (result: ReturnType<typeof tryClaim>) => assert.equal(result.ok ? undefined : result.code, 'effect-task-mismatch');
  ledger.save(instance);
  ledger.saveFact(ref.instanceId, storedFact(scope, { key: scope.key, state: 'pending' }));
  denied(tryClaim());
  ledger.saveFact(ref.instanceId, storedFact(scope, { key: scope.key, state: 'consumed' }));
  denied(tryClaim({ ...instance, scope: { ...scope, requestDigest: 'c'.repeat(64) } }));
  denied(tryClaim({ ...instance, scope: { ...scope, attempt: 2 } }));
  denied(tryClaim(instance, { ...intent, task: { ...task, parentTaskId: 'unrelated-chief-turn' } }));
  assert.equal(ledger.effects(ref.instanceId).length, 0);
  assert.equal(unwrap(tryClaim()).execute, true);
  assert.equal(unwrap(tryClaim()).execute, false);
});
