import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { readTaskState } from '../../../src/common/编排/task-state.ts';
import { parseIntentDecisionRequirements, parseProposalDecisionFields, PROJECT_MODULES_SCHEMA_EXAMPLE, PROJECT_ROSTER_SCHEMA_EXAMPLE,
  proposalDecisionChoiceId, proposalDecisionChoices } from '../../../src/common/编排/workflow-preconditions.ts';
import type { DurableCapabilityEvent, DurableDecisionProvenance, DurableGraphCard, DurableResult } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest } from '../../../src/provider/durable-workflow/public.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService } from '../../../src/service/durable-workflow/public.ts';
import { fixture } from './fixture.ts';

const current = () => true;
const stale = () => false;
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

test('A6 parses exact proposal options and uses concrete compatible defaults only when selected', () => {
  const fields = 'decisionFields:\n  - id: layout\n    label: Layout\n    required: true\n    options:\n      - {value: compact, label: Compact}\n      - {value: wide, label: Wide}\n    defaultValue: compact\n';
  const proposal = '---\nschema: project-proposal/v2\n' + fields + '---\n';
  const intent = '---\nrequiredDecisionFields: [layout]\nrequiredDecisionValues: {layout: compact}\n---\n';
  const choices = unwrap(parseProposalDecisionFields(proposal, intent));
  assert.deepEqual(choices, [{ id: 'layout', label: 'Layout', required: true, options: [{ value: 'compact', label: 'Compact' }], defaultValue: 'compact' }]);
  assert.deepEqual(proposalDecisionChoices(choices), { [proposalDecisionChoiceId({ layout: 'compact' })]: { layout: 'compact' } });
  assert.equal(parseProposalDecisionFields(proposal.replace('defaultValue: compact', 'defaultValue: wide'), intent).ok, false);
  assert.equal(parseProposalDecisionFields('No structured options', intent).ok, false);
  assert.equal(parseProposalDecisionFields(proposal, intent.replace('compact', 'other')).ok, false);
  assert.equal(parseProposalDecisionFields(proposal.replace('    defaultValue: compact', '    defaultValue: compact\n    defaultValue: wide'), intent).ok, false);
  assert.deepEqual(unwrap(parseProposalDecisionFields('schema: project-proposal/v2\n', 'legacy intent')), []);
});

test('A3 and A6 share exact case-sensitive declarations and keep conditional requirements in the intent body', () => {
  const actualIntent = '---\nrequiredDecisionFields: [runtimePlatform, lapCount]\n'
    + 'requiredDecisionValues: {staticDesktopBrowserRequiredCompletionLaps: 3}\n---\nWhen the web target is chosen, drive three laps.';
  const repaired = actualIntent.replace('staticDesktopBrowserRequiredCompletionLaps', 'lapCount');
  const options = '---\ndecisionFields:\n  - id: runtimePlatform\n    label: Runtime\n    required: true\n'
    + '    options: [{ value: web, label: Web } ]\n  - id: lapCount\n    label: Laps\n    required: true\n'
    + '    options: [{value: 3, label: Three}]\n---\n';
  assert.equal(parseIntentDecisionRequirements(actualIntent).ok, false);
  assert.equal(parseProposalDecisionFields(options, actualIntent).ok, false);
  assert.equal(parseIntentDecisionRequirements(repaired.replace('requiredDecisionValues: {lapCount', 'requiredDecisionValues: {lapcount')).ok, false);
  assert.deepEqual(unwrap(parseIntentDecisionRequirements(repaired)), { fields: ['runtimePlatform', 'lapCount'], values: { lapCount: 3 } });
  assert.equal(parseIntentDecisionRequirements(repaired.replace('runtimePlatform, lapCount', 'runtimePlatform, runtimePlatform')).ok, false);
  assert.equal(parseIntentDecisionRequirements(repaired.replace('runtimePlatform, lapCount', 'runtime_platform, lapCount')).ok, false);
  assert.equal(parseIntentDecisionRequirements(repaired.replace('lapCount: 3', 'lapCount: TBD')).ok, false);
  assert.equal(unwrap(parseProposalDecisionFields(options, repaired))[1]?.options[0]?.value, 3);
  assert.equal(parseProposalDecisionFields(options.replace('id: lapCount', 'id: lapcount'), repaired).ok, false);
  assert.deepEqual(unwrap(parseIntentDecisionRequirements('An older intent without declaration.')), { fields: [], values: {} });
});

test('a settled delegated A3 authorizes exactly one writeback and gates the next node across restart', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const selected = unwrap(await service.validateDefinition(project, 'path-a', { source: 'preset' }));
  const text = 'Develop a small 3D racer.';
  const proposal = unwrap(await service.proposeWorkflowStart({ projectRoot: project, definitionId: selected.id, source: 'preset',
    expectedDigest: selected.digest, reason: 'New build.', requirement: { inputId: 'test-demand', turnId: 'initial-turn',
      text, digest: digest(text), runtime: 'claude' } }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: proposal.activationId,
    requestId: proposal.requestId, action: 'approve' }, current));
  const ref = unwrap(await service.startApprovedWorkflow(project, proposal.activationId, current)).instanceRef!;
  service.close();
  const ledger = new DurableLedger(dataDir);
  ledger.transaction(() => {
    const value = ledger.instance(ref.instanceId)!;
    value.stepId = 'confirm-intent';
    value.entry = 2;
    value.graph!.flowId = 'game';
    value.graph!.proofs['intent-written'] = 'current-intent-fixture';
    ledger.save(value);
  });
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const intentId = 'game-intent';
  const product = { path: 'docs/product/game-intent-v1.md', kind: 'intent', version: 1 };
  const entry = { path: 'docs/intents/game-intent.md', kind: 'intent-entry' };
  const write = async (path: string, contents: string) => {
    await mkdir(dirname(join(project, path)), { recursive: true });
    await writeFile(join(project, path), contents);
  };
  const draft = '---\nschema: project-intent/v1\nintentId: game-intent\nflowId: game\nversion: 1\n---\n# Draft\nBuild a racer.\n';
  await write(product.path, draft);
  await write(entry.path, '---\nintentId: game-intent\nflowId: game\n---\n# Entry\n');
  const documentRefs = await Promise.all([product, entry].map(async ref => ({ ...ref, ...unwrap(await service.readEvidence(project, ref.path)) })));
  const address = { stepId: 'confirm-intent', attempt: 1, flowId: 'game' };
  const details = { cardKind: 'intent-confirm' as const, documents: documentRefs.map(({ path, sha256 }) => ({ path, sha256 })),
    options: ['confirm', 'revise', 'reject'], payload: { documentRefs, intentId } };
  const cardDigest = service.graphCardDigest(ref, { ...address, ...details });
  const binding = { digest: cardDigest, generation: 1, requestId: 'dw-card:' + cardDigest + ':1' };
  const card: DurableGraphCard = { ...binding, ...details };
  unwrap(await service.submitCapability(ref, { ...address, key: 'card-prepared:' + card.requestId,
    source: { roleId: 'host', originId: ref.instanceId }, input: { kind: 'card-prepared', card } }, current));
  const provenance: DurableDecisionProvenance = { source: 'delegated-chief', ...binding, delegationRevision: 7,
    reason: 'The reviewed intent matches this request.' };
  const decision = { kind: 'card-decided', ...binding, authority: 'delegated-chief', delegationRevision: 7,
    decision: 'approve', selected: ['confirm'], provenance } as const;
  const event = { ...address, key: 'card-decided:' + binding.requestId,
    source: { roleId: 'chief', originId: binding.requestId }, input: decision } satisfies DurableCapabilityEvent;
  const rows = async () => (await readTaskState(project)).events.filter(row => row.kind === 'request.resolved');
  assert.equal((await service.completeIntentDecision(ref, binding, current)).ok, false);
  assert.equal((await service.submitCapability(ref, event)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...decision, authority: 'customer' } }, current)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...decision, selected: ['reject'] } }, current)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event,
    input: { ...decision, provenance: { ...provenance, generation: 2 } } }, current)).ok, false);
  let authorityChecks = 0;
  assert.equal((await service.submitCapability(ref, event, () => ++authorityChecks < 3)).ok, false);
  await write(product.path, draft + 'Changed after the card.\n');
  assert.equal((await service.submitCapability(ref, event, current)).ok, false);
  assert.equal((await rows()).length, 0);
  await write(product.path, draft);
  assert.equal(unwrap(await service.submitCapability(ref, event, current)).state, 'pending');
  assert.equal((await service.submitCapability(ref, event, stale)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...decision, decision: 'reject', selected: ['reject'] } }, current)).ok, false);
  assert.deepEqual(service.apply({ ref, ...address, entry: 2, turn: 0 }), { entry: 2 });
  assert.equal((await rows()).length, 0);

  const sqlite = new DatabaseSync(join(dataDir, 'ans-workflow.sqlite'));
  sqlite.exec("CREATE TRIGGER fail_intent_receipt BEFORE INSERT ON fact WHEN new.business_key LIKE 'intent-decision-applied:%' BEGIN SELECT RAISE(ABORT,'test bridge interruption'); END");
  try {
    const interrupted = await service.completeIntentDecision(ref, binding, current);
    assert.equal(interrupted.ok ? undefined : interrupted.code, 'intent-decision-apply-failed');
    assert.equal((await rows()).length, 1, 'the task mirror was already written');
    assert.deepEqual(service.apply({ ref, ...address, entry: 2, turn: 1 }), { entry: 2 });
  } finally {
    sqlite.exec('DROP TRIGGER fail_intent_receipt');
    sqlite.close();
  }

  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.equal(service.lookup(ref)?.stepId, address.stepId);
  assert.equal((await service.completeIntentDecision(ref, binding, stale)).ok, false);
  const settled = await Promise.all([service.completeIntentDecision(ref, binding, current), service.completeIntentDecision(ref, binding, current)]);
  assert.deepEqual(unwrap(settled[0]!), unwrap(settled[1]!));
  assert.equal((await rows()).length, 1);
  assert.equal((await rows())[0]?.by, 'chief-delegated');
  assert.equal((await rows())[0]?.actionSource?.kind, 'chief-delegated');
  assert.equal(service.listFacts(ref).filter(row => row.fact.kind === 'intent-decision-applied').length, 1);
  assert.equal(service.apply({ ref, ...address, entry: 2, turn: 2 }).next, 'prepare-planning');
  assert.equal(unwrap(await service.completeIntentDecision(ref, binding, current)).state, 'consumed');
  assert.equal((await rows()).length, 1);
});

test('A3 presents only the existing revision outlets when the actual current draft has incompatible declarations', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const selected = unwrap(await service.validateDefinition(project, 'path-a', { source: 'preset' }));
  const summary = 'Freeze options for this documentation site.';
  const activation = unwrap(await service.proposeWorkflowStart({ projectRoot: project, definitionId: 'path-a', source: 'preset',
    expectedDigest: selected.digest, reason: 'New documentation tool.', requirement: { inputId: 'draft', turnId: 'start',
      text: summary, digest: digest(summary), runtime: 'claude' } }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: activation.activationId,
    requestId: activation.requestId, action: 'approve' }, current));
  const ref = unwrap(await service.startApprovedWorkflow(project, activation.activationId, current)).instanceRef!;
  service.close();
  const ledger = new DurableLedger(dataDir);
  const value = ledger.instance(ref.instanceId)!;
  Object.assign(value, { stepId: 'confirm-intent', entry: 3 });
  Object.assign(value.graph!, { flowId: 'tool', proofs: { 'product-ready': 'product', 'intent-written': 'intent' } });
  ledger.save(value);
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const intentHeader = '---\nschema: project-intent/v1\nflowId: tool\nintentId: tool-intent\n';
  const older = intentHeader + 'version: 1\n---\nAn older valid project intent.\n';
  const invalid = intentHeader + 'version: 2\nrequiredDecisionFields: [outputFormat]\n'
    + 'requiredDecisionValues: {conditionalOutput: html}\n---\nA conditional requirement.\n';
  const parsed = parseIntentDecisionRequirements(invalid);
  assert.equal(parsed.ok, false);
  const problem = parsed.ok ? '' : parsed.message;
  const documents = await Promise.all([
    ['docs/product/tool-intent-v1.md', older], ['docs/product/tool-intent-v2.md', invalid],
    ['docs/intents/tool-intent.md', '---\nintentId: tool-intent\nflowId: tool\n---\n# Entry\n'],
  ].map(async ([path, body]) => {
    await mkdir(dirname(join(project, path!)), { recursive: true });
    await writeFile(join(project, path!), body!);
    return { path: path!, sha256: digest(body!) };
  }));
  const address = { stepId: 'confirm-intent', attempt: 1, flowId: 'tool' };
  const prepare = (options: readonly string[], decisionProblem?: string) => {
    const details = { ...address, cardKind: 'intent-confirm' as const, documents, options, decisionProblem };
    const sha = service.graphCardDigest(ref, details);
    const card: DurableGraphCard = { ...details, generation: 1, digest: sha, requestId: 'dw-card:' + sha + ':1' };
    return { card, event: { ...address, key: 'card-prepared:' + card.requestId, source: { roleId: 'host', originId: ref.instanceId },
      input: { kind: 'card-prepared', card } } satisfies DurableCapabilityEvent };
  };
  assert.equal((await service.submitCapability(ref, prepare(['confirm', 'revise', 'reject']).event, current)).ok, false);
  assert.equal((await service.submitCapability(ref, prepare(['revise', 'reject'], 'substituted reason').event, current)).ok, false);
  const restricted = prepare(['revise', 'reject'], problem);
  unwrap(await service.submitCapability(ref, restricted.event, current));
  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const { requestId, digest: cardDigest, generation } = restricted.card;
  const answer = (decision: 'approve' | 'revise') => service.submitCapability(ref, { ...address, key: 'card-decided:' + requestId,
    source: { roleId: 'customer', originId: requestId }, input: { kind: 'card-decided', requestId, digest: cardDigest, generation,
      authority: 'customer', decision, selected: [decision === 'approve' ? 'confirm' : 'revise'] } }, current);
  const denied = await answer('approve');
  assert.equal(denied.ok ? undefined : denied.code, 'intent-decision-requirements-invalid');
  unwrap(await answer('revise'));
  const revised = service.apply({ ref, ...address, entry: 3, turn: 0 });
  assert.equal(revised.next, 'revise-intent');
  const restartTask = service.apply({ ref, stepId: 'revise-intent', entry: revised.entry, turn: 0 });
  assert.equal(restartTask.next, 'write-intent');
  service.apply({ ref, stepId: 'write-intent', entry: restartTask.entry, turn: 0 });
  assert.match(service.lookup(ref)?.pendingTasks?.find(item => item.stepId === 'write-intent')?.dispatch.text ?? '', /应用核对结果：/);
});

test('A6 records an actual delegated option, rejects alternatives outside the frozen card and replays the same selection', async t => {
  const { project, dataDir, cleanup } = await fixture(t);
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const definition = unwrap(await service.validateDefinition(project, 'path-a', { source: 'preset' }));
  const text = 'Choose a layout for this documentation tool.';
  const activation = unwrap(await service.proposeWorkflowStart({ projectRoot: project, definitionId: definition.id, source: 'preset',
    expectedDigest: definition.digest, reason: 'New documentation tool.', requirement: { inputId: 'tool', turnId: 'start', text,
      digest: digest(text), runtime: 'claude' } }, current));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: activation.activationId,
    requestId: activation.requestId, action: 'approve' }, current));
  const ref = unwrap(await service.startApprovedWorkflow(project, activation.activationId, current)).instanceRef!;
  const intentText = '---\nschema: project-intent/v1\nrequiredDecisionFields: [layout]\n---\nChoose a layout.';
  const proposalText = '---\nschema: project-proposal/v2\ndecisionFields:\n  - id: layout\n    label: Layout\n    required: true\n    options:\n      - {value: compact, label: Compact}\n      - {value: wide, label: Wide}\n    defaultValue: compact\n---\nSee docs/product/tool-intent-v1.md.';
  const documents = await Promise.all([
    ['docs/product/tool-intent-v1.md', intentText], ['docs/proposals/tool-proposal-v1.md', proposalText],
    ['docs/proposals/tool-roster-v1.md', PROJECT_ROSTER_SCHEMA_EXAMPLE.replaceAll('demo', 'tool')],
    ['docs/proposals/tool-modules-v1.md', PROJECT_MODULES_SCHEMA_EXAMPLE.replaceAll('demo', 'tool')],
    ['docs/contracts/tool-architecture-v1.md', 'See docs/proposals/tool-proposal-v1.md.'],
  ].map(async ([path, bytes]) => {
    await mkdir(dirname(join(project, path!)), { recursive: true });
    await writeFile(join(project, path!), bytes!);
    return { path: path!, sha256: digest(bytes!) };
  }));
  service.close();
  const address = { stepId: 'confirm-proposal', attempt: 1, flowId: 'tool' };
  const ledger = new DurableLedger(dataDir);
  const state = ledger.instance(ref.instanceId)!;
  Object.assign(state, { stepId: address.stepId, entry: 6 });
  Object.assign(state.graph!, { flowId: 'tool', proofs: { 'proposal-written': 'proposal-verified' } });
  const intentDigest = 'a'.repeat(64);
  const intentCard: DurableGraphCard = { cardKind: 'intent-confirm', digest: intentDigest, requestId: 'dw-card:' + intentDigest + ':1',
    generation: 1, documents: [documents[0]!] };
  const recordIntent = (key: string, input: DurableCapabilityEvent['input']) => {
    const coords = { ...address, stepId: 'confirm-intent' };
    const event = { ...coords, key, source: { roleId: 'host', originId: ref.instanceId }, input };
    ledger.saveFact(ref.instanceId, storedFact({ ...coords, key, source: 'host', kind: 'capability-event', event }, { key, state: 'consumed' }));
  };
  recordIntent('card-prepared:' + intentCard.requestId, { kind: 'card-prepared', card: intentCard });
  const intentKey = 'card-decided:' + intentCard.requestId;
  state.graph!.proofs['intent-approved'] = intentKey;
  recordIntent(intentKey, { kind: 'card-decided', decision: 'approve', authority: 'customer', digest: intentDigest,
    requestId: intentCard.requestId, generation: 1, selected: ['confirm'] });
  const task = { stage: 'A5', stageAttempt: 1, executionAttempt: 1, parentTaskId: ref.instanceId, taskId: 'writer', roleId: 'convener' } as const;
  state.graph!.tasks.push({ task, capability: 'author-proposal', attempt: 1, stepId: 'write-proposal', flowId: 'tool', taskId: task.taskId,
    roleId: task.roleId, outcome: 'accepted', state: 'accepted', documents, dispatch: { actor: 'application', text: 'fixture' } });
  ledger.save(state);
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());

  const decisionFields = unwrap(parseProposalDecisionFields(proposalText, intentText));
  const decisionOptions = proposalDecisionChoices(decisionFields);
  const makeCard = (fields: typeof decisionFields | undefined, options: readonly string[], payload?: DurableGraphCard['payload']) => {
    const data = { cardKind: 'proposal' as const, documents, options, decisionFields: fields, payload };
    const sha = service.graphCardDigest(ref, { ...address, ...data });
    return { ...data, digest: sha, generation: 1, requestId: 'dw-card:' + sha + ':1' };
  };
  const prepare = (card: DurableGraphCard) => service.submitCapability(ref, { ...address, key: 'card-prepared:' + card.requestId,
    source: { roleId: 'host', originId: ref.instanceId }, input: { kind: 'card-prepared', card } }, current);
  assert.equal((await prepare(makeCard(undefined, ['accept', 'revise', 'reject']))).ok, false);
  const options = [...Object.keys(decisionOptions), 'revise', 'reject'];
  assert.equal((await prepare(makeCard(decisionFields, options, { decisionOptions: {} }))).ok, false);
  const card = makeCard(decisionFields, options, { decisionOptions });
  unwrap(await prepare(card));
  const { requestId, digest: cardDigest, generation } = card;
  const provenance: DurableDecisionProvenance = { source: 'delegated-chief', requestId, digest: cardDigest, generation,
    delegationRevision: 4, reason: 'Compact was a valid proposed default.' };
  const values = { layout: 'compact' };
  const decision = { kind: 'card-decided', decision: 'approve', authority: 'delegated-chief', requestId, digest: cardDigest, generation,
    delegationRevision: 4, provenance, selected: [proposalDecisionChoiceId(values)], decisionValues: values } as const;
  const event = { ...address, key: 'card-decided:' + requestId, source: { roleId: 'chief', originId: requestId }, input: decision };
  assert.equal((await service.submitCapability(ref, event, stale)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...decision, decisionValues: undefined } }, current)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, input: { ...decision, decisionValues: { layout: 'wide' } } }, current)).ok, false);
  assert.equal((await service.submitCapability(ref, { ...event, source: { ...event.source, roleId: 'customer' } }, current)).ok, false);
  await writeFile(join(project, documents[1]!.path), proposalText + '\nChanged after A6.');
  assert.equal((await service.submitCapability(ref, event, current)).ok, false);
  await writeFile(join(project, documents[1]!.path), proposalText);
  unwrap(await service.submitCapability(ref, event, current));
  assert.equal(service.lookup(ref)?.proposalDecision, undefined);
  assert.equal(service.apply({ ref, ...address, entry: 6, turn: 0 }).next, 'prepare-personnel');
  const frozen = service.lookup(ref)?.proposalDecision;
  assert.deepEqual(frozen?.values, values);
  assert.equal(frozen?.proposal.sha256, documents[1]!.sha256);
  assert.equal(frozen?.authority, 'delegated-chief');
  assert.match(frozen?.selectionDigest ?? '', /^[0-9a-f]{64}$/);
  service.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  assert.deepEqual(service.lookup(ref)?.proposalDecision, frozen);
  assert.equal(unwrap(await service.submitCapability(ref, event, current)).state, 'consumed');
  assert.equal(service.listCapabilityEvents(ref).filter(row => row.event.key === event.key).length, 1);
});
