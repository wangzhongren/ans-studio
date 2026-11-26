import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR } from '../../../src/model/durable-workflow.ts';
import type { DurableEffectIntent, DurableFact, DurableInstanceRef, DurablePendingTask, DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import type { StoredInstance } from '../../../src/provider/durable-workflow/public.ts';
import { takeEffect } from '../../../src/service/durable-workflow/effects.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService, parseDefinition } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, legacyPathA } from './fixture.ts';

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

function productModel(service: DurableWorkflowService, ref: DurableInstanceRef, task: DurablePendingTask): string {
  const key = 'model:' + task.taskId;
  const { stepId, attempt } = task;
  const turnId = 'turn-' + task.taskId;
  const claim = unwrap(service.claimEffect(ref, { key, kind: 'model-send', stepId, attempt, task: task.task,
    expected: { roleId: 'product', runtime: 'claude', inputDigest: digest(task.dispatch.text), clientMessageId: 'test-' + task.taskId } }));
  unwrap(service.settleEffect(ref, { key, token: claim.token, outcome: 'succeeded', evidence: 'Observed original test turn', result: { turnId } }));
  return turnId;
}

async function productReport(service: DurableWorkflowService, ref: DurableInstanceRef, task: DurablePendingTask,
  turnId: string, status: 'completed' | 'blocked' | 'aborted', summary: string) {
  const reportId = 'report-' + task.taskId;
  const evidence = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId, taskId: task.taskId, status,
    origin: status === 'aborted' ? 'terminal-fallback' : 'submitted-report', summary: { text: summary },
    source: { roleId: 'product', runtime: 'claude', turnId } } }));
  return unwrap(await service.submitCapability(ref, { key: 'report:' + reportId, stepId: task.stepId, attempt: task.attempt,
    flowId: task.flowId, source: { roleId: 'product', originId: turnId, parentTaskId: task.taskId },
    input: { kind: 'task-report', task: task.task, evidence } }));
}

async function reachDirectA2(service: DurableWorkflowService, blank: string, requestId: string) {
  await mkdir(blank);
  const { ref } = unwrap(await service.start({ projectRoot: blank, definitionId: 'path-a', requestId, source: 'preset',
    metadata: { summary: '开发一个 3D 赛车游戏。', runtime: 'claude' } }));
  const a1 = { ref, stepId: 'prepare-product', entry: 0, turn: 0 };
  assert.deepEqual(service.apply(a1), { entry: 0 });
  const intake = service.lookup(ref)!.pendingTasks![0]!;
  await productReport(service, ref, intake, productModel(service, ref, intake), 'completed', '依据用户原始需求执行。');
  assert.deepEqual(service.apply({ ...a1, turn: 1 }), { next: 'write-intent', entry: 1 });
  const a2 = { ref, stepId: 'write-intent', entry: 1 };
  assert.deepEqual(service.apply({ ...a2, turn: 0 }), { entry: 1 });
  const task = service.lookup(ref)!.pendingTasks!.find(row => row.task.stage === 'A2')!;
  assert.equal(task.capability, 'author-intent-direct');
  assert.equal(task.task.parentTaskId, ref.instanceId);
  assert.equal(task.flowId, intake.flowId);
  assert.match(task.dispatch.text, /开发一个 3D 赛车游戏/);
  assert.equal((await readdir(blank)).includes('docs'), false, 'A2 can dispatch without a prior product document');
  return { ref, a2, task };
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
  assert.equal(started.action, 'product-prepare-direct');
  assert.equal(started.ref.definitionVersion, copied.definition.version);
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

test('the same YAML capability validates the preset and a renamed import and rejects unsafe branches', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const blank = join(directory, 'blank');
  const external = join(directory, 'alternate.yaml');
  await mkdir(blank);
  const yaml = await readFile(join(process.cwd(), 'docs', 'workflows', 'path-a.yaml'), 'utf8');
  const renamed = yaml.replace('id: path-a', 'id: alternate').replaceAll('prepare-product:', 'gather:')
    .replace('start: prepare-product', 'start: gather');
  await writeFile(external, renamed);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  assert.equal(unwrap(await service.importDefinition(blank, external)).definition.id, 'alternate');
  assert.equal(parseDefinition(renamed.replace('role: product', 'role: convener')).ok, false);
  assert.equal(parseDefinition(renamed.replace(', blocked: blocked', '')).ok, false);
  assert.equal(parseDefinition(renamed.replace('blocked: blocked }', 'blocked: write-intent }')).ok, false);
  const view = unwrap(await service.start({ projectRoot: blank, definitionId: 'alternate', requestId: 'start-import',
    metadata: { summary: 'Build a racing game.', runtime: 'claude' } }));
  assert.equal(view.stepId, 'gather');
  service.apply({ ref: view.ref, stepId: view.stepId, entry: 0, turn: 0 });
  assert.equal(service.lookup(view.ref)?.pendingTasks?.[0]?.roleId, 'product');
});

test('a direct intake waits for the exact product report and reconciles that same task after reopen', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const otherRoot = join(directory, 'different-instance');
  await mkdir(otherRoot);
  const other = unwrap(await service.start({ projectRoot: otherRoot, definitionId: 'path-a', requestId: 'other',
    source: 'preset', metadata: { summary: 'Build a different game.', runtime: 'claude' } }));
  const otherTick = { ref: other.ref, stepId: other.stepId, entry: 0 };
  service.apply({ ...otherTick, turn: 0 });
  const otherProduct = service.lookup(other.ref)?.pendingTasks?.[0];
  assert.ok(otherProduct);
  for (const status of ['completed', 'blocked'] as const) {
    const blank = join(directory, status);
    await mkdir(blank);
    const initial = unwrap(await service.start({ projectRoot: blank, definitionId: 'path-a', requestId: 'start-' + status,
      source: 'preset', metadata: { summary: '开发一个 3D 赛车游戏。', runtime: 'claude' } }));
    const { ref, stepId, attempt } = initial;
    const tick = { ref, stepId, entry: 0 };
    assert.equal(service.lookup(ref)?.pendingTasks?.length, 0);
    assert.deepEqual(service.apply({ ...tick, turn: 0 }), { entry: 0 });
    const product = service.lookup(ref)?.pendingTasks?.[0];
    assert.ok(product);
    assert.match(product.dispatch.text, /3D 赛车/);
    assert.equal(product.dispatch.actor, 'application');
    assert.equal(product.task.parentTaskId, ref.instanceId);
    const address = { stepId, attempt, flowId: product.flowId };
    const source = { roleId: 'product', originId: 'product-turn', parentTaskId: product.taskId };
    const key = 'model:' + product.taskId;
    const claim = unwrap(service.claimEffect(ref, { key, kind: 'model-send', stepId, attempt, task: product.task,
      expected: { roleId: 'product', runtime: 'claude', inputDigest: digest(product.dispatch.text), clientMessageId: 'test-send' } }));
    assert.equal(claim.execute, true);
    const write = service.claimEffect(ref, { key: 'write', kind: 'task-write', stepId, attempt, task: product.task,
      expected: { roleId: 'product', paths: ['docs/product/intent.md'] } });
    assert.equal(write.ok, false);
    const snapshot = { report: { version: 1, reportId: status,
      origin: 'submitted-report', status, taskId: product.taskId,
      source: { roleId: 'product', runtime: 'claude', turnId: source.originId }, summary: { text: '受理结论' } } };
    const evidence = unwrap(service.storeEvidence(ref, snapshot));
    const event = { ...address, key: 'report:' + status, source,
      input: { kind: 'task-report' as const, task: product.task, evidence } };
    const mismatched = await service.submitCapability(ref, { ...event, source: { ...source, originId: 'wrong-turn' } });
    assert.equal(mismatched.ok, false);
    const wrongRole = await service.submitCapability(ref, { ...event, source: { ...source, roleId: 'convener' } });
    assert.equal(wrongRole.ok ? undefined : wrongRole.code, 'capability-report-invalid');
    const retiredAttempt = await service.submitCapability(ref, { ...event, attempt: attempt - 1 });
    assert.equal(retiredAttempt.ok ? undefined : retiredAttempt.code, 'capability-not-current');
    const crossInstance = await service.submitCapability(other.ref, event);
    assert.equal(crossInstance.ok ? undefined : crossInstance.code, 'capability-evidence-invalid');
    // A copied report file still belongs to the originating task, even if its bytes are present under the other instance.
    unwrap(service.storeEvidence(other.ref, snapshot));
    const crossInstanceTask = await service.submitCapability(other.ref, { ...event, flowId: otherProduct.flowId });
    assert.equal(crossInstanceTask.ok ? undefined : crossInstanceTask.code, 'capability-report-invalid');
    assert.deepEqual(service.lookup(other.ref)?.pendingTasks, [otherProduct]);
    assert.equal(service.lookup(other.ref)?.stepId, other.stepId);
    assert.deepEqual(service.apply({ ...tick, turn: 1 }), { entry: 0 });
    assert.deepEqual(service.lookup(ref)?.pendingTasks, [product]);
    assert.equal(service.lookup(ref)?.stepId, stepId);
    assert.equal(unwrap(await service.submitCapability(ref, event)).state, 'pending');
    assert.deepEqual(service.apply({ ...tick, turn: 2 }), { entry: 0 });
    assert.equal(unwrap(await service.submitCapability(ref, event)).state, 'pending');
    service.close();
    service = new DurableWorkflowService(dataDir, process.cwd());
    assert.equal(service.lookup(ref)?.pendingTasks?.[0]?.taskId, product.taskId);
    unwrap(service.settleEffect(ref, { key, token: claim.token, outcome: 'succeeded', evidence: 'original accepted turn',
      result: { turnId: source.originId } }));
    const result = service.apply({ ...tick, turn: 3 });
    assert.deepEqual(result, status === 'completed' ? { next: 'write-intent', entry: 1 } : { terminal: 'blocked', entry: 1 });
    assert.deepEqual(service.apply({ ...tick, turn: 3 }), result);
    assert.equal(unwrap(await service.submitCapability(ref, event)).state, 'consumed');
    assert.equal(service.lookup(ref)?.pendingTasks?.length, 1);
    if (status === 'blocked') assert.match(service.lookup(ref)?.blockedReason ?? '', /受理结论/);
    assert.equal((await readdir(blank)).includes('.git'), false);
  }
});

test('a frozen v1 intake can recover once from the blocked report of its actual operations turn', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const blank = join(directory, 'blank');
  const afterImport = join(blank, 'docs', 'workflows');
  await mkdir(afterImport, { recursive: true });
  await writeFile(join(afterImport, 'path-a.yaml'), legacyPathA);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const view = unwrap(await service.start({ projectRoot: blank, definitionId: 'path-a', requestId: 'legacy-race',
    source: 'project', metadata: { summary: 'Build a 3D racing game.', runtime: 'claude' } }));
  const { ref, stepId, attempt } = view;
  const tick = { ref, stepId, entry: 0 };
  const address = { stepId, attempt, flowId: 'racing-game-3d' };
  assert.equal(ref.definitionVersion, 1);
  assert.equal(view.action, 'product-prepare');
  assert.deepEqual(service.apply({ ...tick, turn: 0 }), { entry: 0 });
  assert.deepEqual(service.lookup(ref)?.pendingTasks, []);
  const chiefOrigin = 'chief-turn';
  const chiefKey = 'model:chief-intake:' + stepId + ':' + attempt;
  const chief = unwrap(service.claimEffect(ref, { kind: 'model-send', key: chiefKey, stepId, attempt,
    expected: { roleId: 'chief', runtime: 'claude', inputDigest: digest('intake'), clientMessageId: 'chief-intake' } }));
  unwrap(service.settleEffect(ref, { key: chiefKey, token: chief.token, outcome: 'succeeded', evidence: 'original chief',
    result: { turnId: chiefOrigin } }));
  const instruction = '请运营派产品受理';
  unwrap(await service.submitCapability(ref, { ...address, key: 'stage-request', source: { roleId: 'chief', originId: chiefOrigin },
    input: { kind: 'stage-request', stage: 'A1', workflowPath: 'A', requestDigest: digest(instruction),
      dispatch: { text: instruction, flowId: address.flowId, actor: 'chief', runtime: 'claude' } } }));
  service.apply({ ...tick, turn: 1 });
  const roleId = 'convener';
  const taskId = 'dw-' + digest(JSON.stringify([ref.projectId, ref.instanceId, roleId, stepId, attempt])).slice(0, 32);
  const operatorKey = 'model:' + taskId;
  const operator = unwrap(service.claimEffect(ref, { kind: 'model-send', key: operatorKey, stepId, attempt,
    task: { stage: 'A1', stageAttempt: attempt, executionAttempt: 1, parentTaskId: chiefOrigin, taskId, roleId },
    expected: { roleId, runtime: 'claude', inputDigest: digest(instruction), clientMessageId: 'old-send' } }));
  const originId = 'operator-turn';
  const evidence = unwrap(service.storeEvidence(ref, { report: { version: 1, reportId: 'original-block',
    origin: 'submitted-report', status: 'blocked', taskId,
    source: { roleId, runtime: 'claude', turnId: originId }, summary: { text: '原派发缺少实例 ID' } } }));
  const recovery = { ...address, key: 'intake-recovery:' + stepId + ':' + attempt,
    source: { roleId, originId, parentTaskId: taskId }, input: { kind: 'product-intake-recovery' as const, evidence } };
  assert.equal((await service.submitCapability(ref, recovery)).ok, false);
  unwrap(service.settleEffect(ref, { key: operatorKey, token: operator.token, outcome: 'succeeded', evidence: 'same observed turn',
    result: { turnId: originId } }));
  unwrap(await service.submitCapability(ref, recovery));
  service.apply({ ...tick, turn: 2 });
  const recovered = service.lookup(ref)!;
  assert.deepEqual(recovered.ref, ref);
  assert.equal(recovered.flowId, address.flowId);
  assert.equal(recovered.stepId, stepId);
  assert.equal(recovered.pendingTasks?.length, 1);
  assert.equal(recovered.pendingTasks?.[0]?.roleId, 'product');
  assert.equal(unwrap(await service.submitCapability(ref, recovery)).state, 'consumed');
  service.apply({ ...tick, turn: 3 });
  assert.equal(service.lookup(ref)?.pendingTasks?.length, 1);
});

test('A2 dispatches without an A1 document and only A3 requires the current draft and exact write receipt', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  for (const withDraft of [false, true]) {
    const blank = join(directory, withDraft ? 'verified-draft' : 'absent-draft');
    const { ref, a2, task } = await reachDirectA2(service, blank, 'start-' + withDraft);
    const turnId = productModel(service, ref, task);
    const path = 'docs/product/' + task.flowId + '-intent-v1.md';
    const text = `---\nschema: project-intent/v1\nflowId: ${task.flowId}\nversion: 1\nintentId: racing-game\n---\n# 赛车游戏意图\n`;
    if (withDraft) {
      await mkdir(join(blank, 'docs', 'product'), { recursive: true });
      const expected = { paths: [path], contentSha256: digest(text) };
      const args: DurableEffectIntent = { key: 'write-intent', kind: 'task-write', stepId: task.stepId, attempt: task.attempt, task: task.task, expected };
      assert.equal(service.claimEffect(ref, { ...args, expected: { ...expected, paths: ['docs/product/another-flow-intent-v1.md'] } }).ok, false);
      const write = unwrap(service.claimEffect(ref, args));
      await writeFile(join(blank, path), text);
      unwrap(service.settleEffect(ref, { key: write.key, token: write.token, outcome: 'succeeded', evidence: 'Verified governed product write' }));
    }
    await productReport(service, ref, task, turnId, 'completed', '已回交产品意图。');
    assert.deepEqual(service.apply({ ...a2, turn: 1 }), { next: 'confirm-intent', entry: 2 });
    const gate = await service.prepareDirectIntentGate(ref);
    if (!withDraft) {
      assert.equal(gate.ok ? undefined : gate.code, 'workflow-intent-draft-missing');
      assert.match(service.lookup(ref)?.blockedReason ?? '', /workflow-intent-draft-missing/);
      continue;
    }
    assert.deepEqual(unwrap(gate), { path, sha256: digest(text), intentId: 'racing-game', version: 1 });
    const address = { stepId: 'confirm-intent', attempt: 1, kind: 'task-write' as const };
    assert.equal(service.claimEffect(ref, { ...address, key: 'wrong-entry', expected: { roleId: 'chief',
      paths: ['docs/intents/wrong.md'] } }).ok, false);
    assert.equal(service.claimEffect(ref, { ...address, key: 'right-entry', expected: { roleId: 'chief',
      paths: ['docs/intents/racing-game.md'] } }).ok, true);
    await writeFile(join(blank, path), text + 'changed after the product write');
    const drift = await service.prepareDirectIntentGate(ref);
    assert.equal(drift.ok ? undefined : drift.code, 'workflow-intent-draft-unverified');
    assert.equal(service.claimEffect(ref, { ...address, key: 'after-drift', expected: { roleId: 'chief',
      paths: ['docs/intents/racing-game.md'] } }).ok, false);
  }
});

test('A2 clarification, verified send failure and known runtime failure follow their configured safe terminal edges', async t => {
  const { directory, dataDir, cleanup } = await fixture(t);
  const service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  for (const status of ['blocked', 'send-failed', 'aborted'] as const) {
    const { ref, a2, task } = await reachDirectA2(service, join(directory, status), status);
    const summary = '需要补充赛车目标平台。';
    if (status === 'send-failed') {
      unwrap(await service.submitCapability(ref, { key: 'product-dispatch-failed:' + task.taskId, stepId: task.stepId, attempt: task.attempt,
        flowId: task.flowId, source: { roleId: 'host', originId: task.taskId, parentTaskId: task.taskId },
        input: { kind: 'product-dispatch-failed', task: task.task, reason: summary } }));
    } else {
      await productReport(service, ref, task, productModel(service, ref, task), status, summary);
    }
    const result = service.apply({ ...a2, turn: 1 });
    assert.deepEqual(result, { terminal: 'blocked', entry: 2 });
    assert.equal(service.lookup(ref)?.stepId, status === 'blocked' ? 'needs-clarification' : 'blocked');
    assert.match(service.lookup(ref)?.blockedReason ?? '', /需要补充赛车目标平台/);
    assert.deepEqual(service.apply({ ...a2, turn: 1 }), result);
  }
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
