import type {
  DurableCapability, DurableCapabilityEvent, DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableGraphCard,
  DurableInstanceRef, DurablePendingTask, DurableResult, DurableTaskBinding,
} from '../../model/durable-workflow.ts';
import type { DurableLedger, StoredFact, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import { capabilities } from './capabilities.ts';
import { requiresEffectResolution } from './effects.ts';
import { storedFact } from './facts.ts';
import { activeAction, applyStep, changeStep, equal, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey } from './rules.ts';
import type { ActivityInput, ActivityOutcome } from './rules.ts';

const preparations = ['product-prepare', 'planning-prepare', 'personnel-prepare'] as const;
const legacyActions = new Set<DurableCapability>([
  'b1-impact-readonly', 'b1-open-followup-attempt', 'accept-b3-advance-with-b2-scope', 'b3-implement-and-accept',
  'b4-customer-merge-main', 'customer-publish', 'readonly-report', 'wait-for-review',
]);
const cardKinds = { 'confirm-intent': 'intent-confirm', 'confirm-proposal': 'proposal', 'confirm-appointment': 'appointment' } as const;
const evidencePath = (ref: DurableEvidenceRef) => hashValid(ref.sha256) && (safePath(ref.path)
  || /^角色卡\/[a-z0-9][a-z0-9-]*\/(?:role-card\.md|boundary\.(?:yaml|md))$/.test(ref.path));

export function graphCardDigest(ref: DurableInstanceRef, input: Pick<DurableGraphCard, 'cardKind' | 'documents' | 'options' | 'payload'> &
  { stepId: string; attempt: number }): string {
  return digest(stableJson([ref.projectId, ref.instanceId, input.stepId, input.attempt, input.cardKind, input.documents,
    input.options ?? [], input.payload ?? {}]));
}

export function capabilityEvidence(event: DurableCapabilityEvent): readonly DurableEvidenceRef[] {
  switch (event.input.kind) {
    case 'task-report': return [event.input.evidence];
    case 'operator-report': return [event.input.evidence];
    case 'task-closed': return event.input.documents ?? [];
    case 'card-prepared': return event.input.card.documents;
    case 'role-activated': return event.input.documents;
    case 'baseline-verified': return event.input.documents ?? [];
    case 'archive-verified': return [event.input.criteria, event.input.report, event.input.archive];
    case 'stop-verified': return event.input.evidence ? [event.input.evidence] : [];
    default: return [];
  }
}

function recordBinding(event: DurableCapabilityEvent, capability: DurableCapability, task: DurableTaskBinding): DurablePendingTask {
  if (event.input.kind !== 'task-bound') throw new Error('Capability task binding has an invalid source.');
  return { stepId: event.stepId, attempt: event.attempt, flowId: event.flowId, capability,
    task, taskId: task.taskId, roleId: task.roleId, state: 'pending', dispatch: event.input.dispatch, modulePaths: event.input.modulePaths };
}

export function admitCapability(ledger: DurableLedger, instance: StoredInstance, event: DurableCapabilityEvent): DurableResult<DurableFactReceipt> {
  const state = instance.graph;
  const definition = instance.definition;
  const id = instance.ref.instanceId;
  const { roleId, originId, parentTaskId } = event.source;
  const { stepId, attempt, flowId, input, key } = event;
  if (!state || definition.schema !== 2 || instance.status !== 'waiting') return fail('capability-not-open', '实例没有活动 v2 节点。');
  if (![key, roleId, originId].every(validKey) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(flowId)
    || state.flowId && state.flowId !== flowId) return fail('capability-source-invalid', '业务事实的来源、流程或操作键不匹配。');
  const step = definition.steps[stepId];
  if (!step || !('action' in step)) return fail('capability-not-open', '步骤不在固定定义中。');
  const descriptor = capabilities[step.action];
  const binding = 'task' in input ? state.tasks.find(item => sameTask(item.task, input.task)
    && item.stepId === stepId && item.attempt === attempt && item.flowId === flowId) : undefined;
  const continuation = binding && !binding.outcome && (input.kind === 'task-report' || input.kind === 'task-closed')
    && (instance.attempt === attempt || binding.capability === 'independent-standard' && binding.baselineOid === instance.baseline?.oid
      && state.proofs['standard-open'] === binding.bindingKey);
  if (!continuation && (instance.stepId !== stepId || instance.attempt !== attempt)) {
    return fail('capability-not-current', '步骤、尝试或任务已经退役。');
  }
  const facts = () => ledger.facts(id).filter(item => item.fact.kind === 'capability-event'
    && item.fact.stepId === stepId && item.fact.attempt === attempt && item.receipt.state !== 'ignored');
  const actor = roleId === descriptor.actor;
  const modelOrigin = (operationKey: string) => {
    const effect = ledger.effect(id, operationKey);
    const turnId = effect?.result?.result?.turnId;
    return effect?.intent.kind === 'model-send' && effect.intent.stepId === stepId && effect.intent.attempt === attempt
      && effect.intent.expected?.roleId === roleId && (effect.state === 'claimed' || turnId === originId && effect.state !== 'not-started');
  };
  switch (input.kind) {
    case 'stage-request':
      if (roleId !== 'chief' || !descriptor.stage || input.stage !== descriptor.stage || descriptor.actor === 'host'
        || input.workflowPath !== (input.stage.startsWith('A') ? 'A' : 'B') || !hashValid(input.requestDigest)
        || digest(input.dispatch.text) !== input.requestDigest || input.dispatch.flowId !== flowId || input.dispatch.actor !== 'chief'
        || !modelOrigin('model:chief-intake:' + stepId + ':' + attempt)
        || facts().some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'stage-request')) {
        return fail('stage-request-invalid', '阶段请求未绑定当前能力或真实幕僚输入。');
      }
      state.flowId = flowId;
      if (step.action === 'observe-existing') state.existingRequest = event;
      break;
    case 'task-bound': {
      if (!actor || input.task.stage !== descriptor.stage || input.task.stageAttempt !== attempt || input.task.executionAttempt < 1
        || ![input.task.taskId, input.task.roleId, input.task.parentTaskId].every(validKey)
        || state.tasks.some(item => item.taskId === input.task.taskId)
        || input.dispatch.flowId !== flowId || input.dispatch.actor !== roleId
        || (descriptor.actor === 'convener' && (!parentTaskId || parentTaskId !== input.task.parentTaskId || !modelOrigin('model:' + parentTaskId)
          || !facts().some(item => item.receipt.state === 'consumed' && item.fact.kind === 'capability-event'
            && item.fact.event.input.kind === 'stage-request')))
        || (descriptor.actor === 'chief' && (input.task.parentTaskId !== originId || !modelOrigin('model:chief-intake:' + stepId + ':' + attempt)))) {
        return fail('capability-task-invalid', '生产或验收任务缺少当前实际父请求及角色绑定。');
      }
      const expectedRole = step.action === 'product-prepare' || step.action === 'author-intent' ? 'product'
        : step.action === 'planning-prepare' || step.action === 'author-proposal' ? 'rapporteur'
          : step.action === 'personnel-prepare' || step.action === 'activate-roles' ? 'nominator' : undefined;
      if (expectedRole && input.task.roleId !== expectedRole) return fail('capability-task-role-invalid', '目标角色不符合注册能力。');
      if (descriptor.independent && (input.task.roleId === roleId || ['product', 'rapporteur', 'convener', 'nominator'].includes(input.task.roleId))) {
        return fail('capability-task-role-invalid', '验收任务须绑定独立验收角色。');
      }
      if (step.action === 'governed-implementation' && (!state.writeSets?.some(set => set.roleId === input.task.roleId
        && input.modulePaths?.every(path => set.paths.some(base => path === base || base.endsWith('/') && path.startsWith(base))))
        || !input.modulePaths?.length)) return fail('capability-write-set-invalid', '实施派发不在任命及计划写集中。');
      state.flowId ??= flowId;
      state.tasks.push({ ...recordBinding(event, step.action, input.task), bindingKey: event.key, baselineOid: instance.baseline?.oid });
      break;
    }
    case 'task-report':
      if (!binding || binding.roleId !== roleId || binding.report || !hashValid(input.evidence.sha256) || !modelOrigin('model:' + binding.taskId)) {
        return fail('capability-report-invalid', '报告未绑定原生产或验收任务。');
      }
      binding.report = { key, evidence: input.evidence };
      binding.state = 'reported';
      break;
    case 'operator-report':
      if (step.action !== 'governed-implementation' || roleId !== 'convener' || parentTaskId !== input.parentTaskId
        || !state.tasks.some(item => item.stepId === stepId && item.attempt === attempt && item.task.parentTaskId === input.parentTaskId
          && item.report && modelOrigin('model:graph-report:' + item.taskId + ':' + item.report.key))
        || !hashValid(input.evidence.sha256)
        || facts().some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'operator-report'
          && item.fact.event.input.parentTaskId === input.parentTaskId)) {
        return fail('capability-report-invalid', '运营报告未绑定本次真实实施任务的父派发。');
      }
      break;
    case 'task-closed':
      if (!binding || binding.outcome || !actor || binding.report?.key !== input.reportKey
        || !modelOrigin('model:graph-report:' + binding.taskId + ':' + input.reportKey)
        || !['accepted', 'rework', 'rejected'].includes(input.outcome)
        || input.documents?.some(ref => !evidencePath(ref))) {
        return fail('capability-close-invalid', '收口对象、任务创建者或报告证据不匹配。');
      }
      if (step.action === 'governed-implementation' && input.outcome === 'accepted'
        && (!input.tipOid || !ledger.effects(id).some(effect => effect.intent.kind === 'task-commit'
          && effect.state === 'succeeded' && sameTask(effect.intent.task, input.task) && effect.result?.result?.oid === input.tipOid))) {
        return fail('capability-commit-invalid', '实施收口缺少同一任务及候选的受信提交。');
      }
      binding.outcome = input.outcome;
      binding.state = input.outcome;
      binding.documents = input.documents;
      break;
    case 'card-prepared': {
      const card = input.card;
      const expected = cardKinds[step.action as keyof typeof cardKinds];
      if (expected !== card.cardKind || roleId !== 'chief' && roleId !== 'host' || !card.documents.length
        || !validKey(card.requestId) || !Number.isSafeInteger(card.generation) || card.generation < 1
        || card.requestId !== 'dw-card:' + card.digest + ':' + card.generation
        || card.digest !== graphCardDigest(instance.ref, { ...card, stepId, attempt })
        || card.cardKind === 'appointment' && (!state.proposalRoster
          || !card.documents.some(document => equal(document, state.proposalRoster))
          || !equal([...(card.options ?? [])].sort(), [...(state.expectedRoles ?? [])].sort()))
        || state.card && (card.generation !== state.card.generation + 1 || state.card.digest === card.digest)) {
        return fail('capability-card-invalid', '客户卡被绑定到其他能力、证据或代次。');
      }
      state.card = card;
      break;
    }
    case 'card-decided': {
      const card = state.card;
      if (!card || card.requestId !== input.requestId || card.digest !== input.digest || card.generation !== input.generation
        || input.authority === 'customer' && roleId !== 'customer' || input.authority === 'delegated-chief' && (roleId !== 'chief'
          || !Number.isSafeInteger(input.delegationRevision))
        || !['approve', 'revise', 'reject'].includes(input.decision)
        || facts().some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'card-decided'
          && item.fact.event.input.requestId === input.requestId)
        || (card.cardKind === 'appointment' && input.decision === 'approve'
          && (!input.selected?.length || input.selected.some(role => !card.options?.includes(role))))) {
        return fail('capability-card-decision-invalid', '客户裁决不匹配此能力的当前有效卡。');
      }
      if (card.cardKind === 'appointment' && input.decision === 'approve') {
        state.writeSets = state.writeSets?.filter(set => input.selected!.includes(set.roleId));
      }
      break;
    }
    case 'role-activated':
      if (roleId !== 'nominator' || step.action !== 'activate-roles' || input.documents.length < 3 || !validKey(input.roleId)
        || input.proposalRequestId !== state.approvedProposalRequestId
        || !ledger.effects(id).some(effect => effect.intent.key === key && effect.intent.kind === 'role-activation'
          && effect.state === 'succeeded' && effect.result?.result?.roleId === input.roleId
          && effect.result.result.rosterSha256 === state.proposalRoster?.sha256
          && equal(effect.intent.expected?.paths, input.documents.map(document => document.path))
          && equal(effect.intent.expected?.hashes, input.documents.map(document => document.sha256)))
        || !ledger.facts(id).some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'card-decided'
          && item.fact.event.input.decision === 'approve' && item.fact.event.input.requestId === input.proposalRequestId)) {
        return fail('capability-role-activation-invalid', '角色激活缺少已确认的提案及真实角色文件。');
      }
      state.activatedRoles = [...new Set([...(state.activatedRoles ?? []), input.roleId])];
      break;
    case 'baseline-verified': {
      const effect = ledger.effect(id, input.effectKey);
      if (step.action !== 'team-baseline' && step.action !== 'prepare-existing-branch'
        || roleId !== 'convener' && roleId !== 'host' || effect?.intent.kind !== 'baseline' || effect.state !== 'succeeded'
        || instance.commonDir === '' || !oidValid(input.baselineOid)
        || effect.result?.result?.oid !== input.baselineOid || effect.result.result.branch !== input.branch
        || input.branch !== 'ans/task/' + id) return fail('capability-baseline-invalid', '基线缺少本次受信 Git 操作和仓库绑定。');
      if (step.action === 'team-baseline' && (!input.documents?.some(document => document.path === effect.intent.expected?.planPath
        && document.sha256 === effect.intent.expected.planSha256) || !input.writeSets?.length
        || input.writeSets.some(set => !state.expectedRoles?.includes(set.roleId) || !set.paths.length
          || set.paths.some(path => !safePath(path.replace(/\/$/, '')))))) {
        return fail('capability-team-plan-invalid', '团队基线缺少已核验的计划及名单限定写集。');
      }
      state.writeSets = input.writeSets ?? state.writeSets;
      break;
    }
    case 'archive-verified': {
      const effect = ledger.effect(id, input.effectKey);
      const standard = state.tasks.find(task => task.capability === 'independent-standard' && task.outcome === 'accepted'
        && task.baselineOid === instance.baseline?.oid && task.documents?.some(document => equal(document, input.criteria)));
      const assessment = state.tasks.find(task => task.capability === 'independent-assessment' && task.outcome === 'accepted'
        && task.attempt === attempt && task.documents?.some(document => equal(document, input.report)));
      if (step.action !== 'archive-acceptance' || roleId !== 'host' || effect?.intent.kind !== 'acceptance-archive'
        || effect.state !== 'succeeded' || !oidValid(input.tipOid)
        || !standard || !assessment || standard.roleId !== assessment.roleId
        || effect.intent.expected?.criteriaSha256 !== input.criteria.sha256 || effect.intent.expected?.criteriaPath !== input.criteria.path
        || effect.intent.expected?.reportSha256 !== input.report.sha256 || effect.intent.expected?.reportPath !== input.report.path
        || effect.result?.result?.archivePath !== input.archive.path || effect.result.result.archiveSha256 !== input.archive.sha256
        || effect.result.result.tipOid !== input.tipOid
        || input.tipOid !== (state.proofs.implementationTip ?? state.proofs.acceptedTip)) {
        return fail('capability-archive-invalid', '归档未绑定本次标准、报告和已接受候选。');
      }
      break;
    }
    case 'stop-verified':
      if (!actor || step.action !== 'verify-stop' || !validKey(input.reportKey) ||
        !(input.evidence && ledger.effect(id, 'model:stop:' + stepId + ':' + attempt)?.state === 'succeeded'
          || state.tasks.some(task => task.report?.key === input.reportKey && task.outcome))
        || ledger.effects(id).some(effect => requiresEffectResolution(instance, effect)) || state.tasks.some(task =>
          !task.outcome && !(task.report && preparations.includes(task.capability as typeof preparations[number])))) {
        return fail('capability-stop-invalid', '未证明任务和实际作用已停稳。');
      }
      break;
  }
  return ok({ key, state: 'pending' });
}

function consume(ledger: DurableLedger, id: string, item: StoredFact, reason?: string) {
  item.receipt = { ...item.receipt, state: reason ? 'ignored' : 'consumed', reason };
  ledger.saveFact(id, item);
}

function relayExistingRequest(ledger: DurableLedger, instance: StoredInstance): void {
  const event = instance.graph?.existingRequest;
  if (activeAction(instance) !== 'b1-impact-readonly' || instance.attempt !== 1 || event?.input.kind !== 'stage-request') return;
  const key = 'b1-request:' + instance.attempt;
  if (ledger.fact(instance.ref.instanceId, key)) return;
  const fact: DurableFact = { kind: 'stage-request', source: 'chief', key, stepId: instance.stepId, attempt: instance.attempt,
    sourceTaskId: event.source.originId, requestDigest: event.input.requestDigest, dispatch: event.input.dispatch };
  ledger.saveFact(instance.ref.instanceId, storedFact(fact, { key, state: 'pending' }));
}

export function applyGraph(ledger: DurableLedger, instance: StoredInstance, input: ActivityInput): ActivityOutcome {
  const graph = instance.graph;
  const action = activeAction(instance);
  const id = instance.ref.instanceId;
  if (!graph || !action) return applyStep(ledger, instance, input);
  if (legacyActions.has(action)) {
    for (const item of ledger.facts(id, true)) {
      if (item.fact.kind !== 'capability-event') continue;
      const event = item.fact.event;
      if (!('task' in event.input) || !['task-report', 'task-closed'].includes(event.input.kind)) continue;
      const binding = event.input.task;
      if (graph.tasks.some(task => task.capability === 'independent-standard' && sameTask(task.task, binding)
        && task.baselineOid === instance.baseline?.oid)) consume(ledger, id, item);
    }
    const outcome = applyStep(ledger, instance, input);
    if (outcome.next && action === 'b3-implement-and-accept' && instance.implementation) {
      const implemented = instance.implementation.task;
      const knownTip = ledger.effects(id).filter(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
        && sameTask(effect.intent.task, implemented)).at(-1)?.result?.result?.oid;
      if (typeof knownTip === 'string') graph.proofs.acceptedTip = knownTip;
    }
    return outcome;
  }
  if (input.stepId !== instance.stepId || input.entry !== instance.entry) throw new Error('工作流重放步骤不一致。');
  const step = instance.definition.steps[instance.stepId]!;
  if ('terminal' in step) return { terminal: step.terminal, entry: instance.entry };
  const pending = ledger.facts(id, true);
  const events = pending.filter((item): item is StoredFact & { fact: Extract<DurableFact, { kind: 'capability-event' }> } =>
    item.fact.kind === 'capability-event' && (item.fact.attempt === instance.attempt
      || graph.tasks.some(task => task.capability === 'independent-standard' && task.stepId === item.fact.stepId
        && task.attempt === item.fact.attempt && task.baselineOid === instance.baseline?.oid)));
  const here = events.filter(item => item.fact.stepId === instance.stepId);
  const find = (kind: DurableCapabilityEvent['input']['kind']) => here.find(item => item.fact.event.input.kind === kind);
  const busy = () => ledger.effects(id).some(effect => effect.intent.stepId === instance.stepId
    && effect.intent.attempt === instance.attempt && liveEffect(effect.state));
  let outcome: string | undefined;
  let source: StoredFact | undefined;
  const baseline = find('baseline-verified');
  const closed = find('task-closed');
  const close = closed?.fact.event.input;
  const operator = find('operator-report')?.fact.event.input;
  if (preparations.includes(action as typeof preparations[number]) || action === 'independent-standard') {
    source = find('task-bound');
    if (source) outcome = 'done';
  } else if (action === 'author-intent' || action === 'author-proposal' || action === 'governed-implementation') {
    if (close?.kind === 'task-closed' && close.outcome === 'accepted' && !busy()
      && (action === 'governed-implementation' ? operator?.kind === 'operator-report'
        && operator.parentTaskId === close.task.parentTaskId : !!close.documents?.length)) {
      source = closed;
      outcome = 'done';
      if (action === 'governed-implementation' && close.tipOid && operator?.kind === 'operator-report') {
        graph.proofs.implementationTip = close.tipOid;
        instance.implementation = { kind: 'implementation-accepted', source: 'convener', key: closed!.fact.key,
          stepId: instance.stepId, attempt: instance.attempt, task: close.task, reportKey: close.reportKey,
          operatorReport: operator.evidence };
      }
    }
  } else if (action === 'confirm-intent' || action === 'confirm-proposal' || action === 'confirm-appointment') {
    source = find('card-decided');
    const result = source?.fact.kind === 'capability-event' && source.fact.event.input;
    if (result && result.kind === 'card-decided') outcome = result.decision === 'approve' ? 'approved' : result.decision === 'reject' ? 'rejected' : 'revise';
  } else if (action === 'activate-roles') {
    const activated = find('role-activated');
    const known = graph.activatedRoles ?? [];
    if (graph.expectedRoles?.length && graph.expectedRoles.every(role => known.includes(role))
      && close?.kind === 'task-closed' && close.outcome === 'accepted' && !busy()) {
      source = closed ?? activated;
      outcome = 'done';
    }
  } else if (action === 'team-baseline' || action === 'prepare-existing-branch') {
    if (instance.baseline && instance.commonDir && (action === 'prepare-existing-branch' || !!baseline) && !busy()) {
      source = baseline;
      outcome = 'done';
    }
  } else if (action === 'observe-existing') {
    source = find('stage-request');
    if (graph.observedHead && source && graph.existingRequest?.key === source.fact.key && !busy()) outcome = 'done';
    else source = undefined;
  } else if (action === 'finish-readonly') {
    if (!ledger.effects(id).some(effect => effect.intent.kind !== 'model-send' && effect.intent.kind !== 'dispatch'
      && effect.intent.kind !== 'report-delivery' && effect.state !== 'not-started') && !busy()) outcome = 'done';
  } else if (action === 'independent-assessment') {
    if (close?.kind === 'task-closed' && graph.tasks.some(task => task.capability === 'independent-standard' && task.outcome === 'accepted')
      && !busy()) {
      source = closed;
      outcome = close.outcome === 'rejected' ? 'blocked' : close.outcome;
    }
  } else if (action === 'archive-acceptance' || action === 'verify-stop') {
    source = find(action === 'archive-acceptance' ? 'archive-verified' : 'stop-verified');
    if (source) {
      outcome = 'done';
      const closure = source.fact.kind === 'capability-event' && source.fact.event.input;
      if (closure && closure.kind === 'archive-verified') graph.acceptanceArchive = closure.archive;
    }
  } else if (step.maxVisits && !busy()) {
    const visited = instance.visits[instance.stepId] ?? 0;
    if (visited >= step.maxVisits) outcome = 'limit';
    else {
      instance.visits[instance.stepId] = visited + 1;
      instance.attempt++;
      outcome = 'done';
    }
  }
  for (const item of pending) {
    if (item.fact.kind === 'effect-settled') consume(ledger, id, item);
    if (item.fact.attempt < instance.attempt && !events.includes(item as typeof events[number])) consume(ledger, id, item, 'attempt-retired');
  }
  for (const item of events) {
    if (item === source || (item.fact.event.input.kind !== 'stage-request' || action !== 'observe-existing')
      && ['stage-request', 'task-bound', 'task-report', 'card-prepared', 'role-activated'].includes(item.fact.event.input.kind)
      || item.fact.event.input.kind === 'operator-report' && outcome === 'done'
      || item.fact.stepId !== instance.stepId && item.fact.event.input.kind === 'task-closed') consume(ledger, id, item);
  }
  if (!outcome) return { entry: instance.entry };
  const descriptor = capabilities[action];
  for (const retired of descriptor.retires ?? []) delete graph.proofs[retired];
  for (const proof of descriptor.outcomes[outcome] ?? []) graph.proofs[proof] = source?.fact.key ?? input.stepId;
  const next = outcome === 'limit' ? step.onLimit : step.on?.[outcome] ?? step.next;
  if (!next) throw new Error('工作流没有固定分支。');
  if (action.startsWith('confirm-')) delete graph.card;
  changeStep(instance, next, source?.fact.key);
  relayExistingRequest(ledger, instance);
  const nextStep = instance.definition.steps[next]!;
  if ('terminal' in nextStep) {
    for (const item of ledger.facts(id, true)) consume(ledger, id, item, 'instance-terminal');
    return { terminal: nextStep.terminal, entry: instance.entry };
  }
  return { next, entry: instance.entry };
}
