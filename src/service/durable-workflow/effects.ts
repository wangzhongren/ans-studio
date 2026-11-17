import { randomUUID } from 'node:crypto';
import type { DurableCapability, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableFact, DurablePendingTask, DurableResult } from '../../model/durable-workflow.ts';
import { digest } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredEffect, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { storedFact } from './facts.ts';
import { capabilities } from './capabilities.ts';
import { activeAction, equal, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey } from './rules.ts';

function allowedPath(allowed: readonly string[], path: string): boolean {
  return safePath(path) && allowed.some(prefix => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
}

const transportKinds = new Set<DurableEffectIntent['kind']>(['model-send', 'dispatch', 'report-delivery']);
export function requiresEffectResolution(instance: StoredInstance, effect: StoredEffect): boolean {
  return liveEffect(effect.state) && (!transportKinds.has(effect.intent.kind)
    || instance.status === 'waiting' && effect.intent.stepId === instance.stepId && effect.intent.attempt === instance.attempt);
}

function graphPathAllowed(allowed: readonly string[], path: string): boolean {
  return safePath(path.replace(/\/$/, '')) && allowed.some(prefix => path === prefix || prefix.endsWith('/') && path.startsWith(prefix));
}

function currentGraphTask(instance: StoredInstance, task: DurablePendingTask): boolean {
  return task.stepId === instance.stepId && task.attempt === instance.attempt ||
    task.capability === 'independent-standard' && task.baselineOid === instance.baseline?.oid
      && instance.graph?.proofs['standard-open'] === task.bindingKey ||
    ['product-prepare', 'planning-prepare', 'personnel-prepare'].includes(task.capability) && task.attempt === instance.attempt;
}

export function graphImplementationPaths(instance: StoredInstance, task?: DurablePendingTask): readonly string[] {
  if (!task || task.capability !== 'governed-implementation' || !currentGraphTask(instance, task)
    || task.outcome || !instance.commonDir || !instance.baseline) return [];
  const approved = instance.graph?.writeSets?.find(set => set.roleId === task.roleId)?.paths ?? [];
  return task.modulePaths?.filter(path => graphPathAllowed(approved, path)) ?? [];
}

export function graphDocumentRoots(action: DurableCapability): readonly string[] {
  switch (action) {
    case 'author-intent': return ['docs/product/'];
    case 'author-proposal': return ['docs/proposals/', 'docs/contracts/'];
    case 'confirm-intent': return ['docs/intents/'];
    case 'activate-roles': return ['角色卡/'];
    case 'team-baseline': return ['docs/scheduling/'];
    case 'independent-standard':
    case 'independent-assessment': return ['docs/quality/'];
    default: return [];
  }
}

function documentAllowed(instance: StoredInstance, action: DurableCapability, file: string): boolean {
  const graph = instance.graph!;
  const flow = graph.flowId;
  if (!flow || action !== 'activate-roles' && !safePath(file)) return false;
  switch (action) {
    case 'confirm-intent': return graph.proofs.intentId !== undefined && file === 'docs/intents/' + graph.proofs.intentId + '.md';
    case 'author-intent': return new RegExp('^docs/product/' + flow + '-intent-v[1-9][0-9]*\\.md$').test(file);
    case 'author-proposal': return new RegExp('^docs/(?:proposals/' + flow + '-(?:proposal|modules|roster)|contracts/' + flow
      + '-architecture)-v[1-9][0-9]*\\.md$').test(file);
    case 'activate-roles': return graph.roleDocumentPaths?.includes(file) === true;
    case 'team-baseline': return new RegExp('^docs/scheduling/' + flow + '-team-v[1-9][0-9]*\\.md$').test(file);
    case 'independent-standard':
    case 'independent-assessment': return new RegExp('^docs/quality/' + flow +
      (action === 'independent-standard' ? '-criteria' : '-report') + '-v[1-9][0-9]*\\.md$').test(file);
    default: return false;
  }
}

const legacyActions = new Set<DurableCapability>([
  'b1-impact-readonly', 'b1-open-followup-attempt', 'accept-b3-advance-with-b2-scope', 'b3-implement-and-accept',
  'b4-customer-merge-main', 'customer-publish', 'readonly-report', 'wait-for-review',
]);

function graphPermission(ledger: DurableLedger, instance: StoredInstance, intent: DurableEffectIntent,
  action: DurableCapability | undefined): DurableResult<true> | undefined {
  const graph = instance.graph;
  if (!graph || !action) return undefined;
  const id = instance.ref.instanceId;
  const active = intent.stepId === instance.stepId && intent.attempt === instance.attempt;
  const task = intent.task;
  const pending = task && graph.tasks.find(item => item.stepId === intent.stepId && item.attempt === intent.attempt &&
    sameTask(item.task, task) && currentGraphTask(instance, item));
  const report = task && graph.tasks.find(item => item.stepId === intent.stepId && item.attempt === intent.attempt
    && item.report && currentGraphTask(instance, item) && item.task.parentTaskId === task.taskId && item.taskId === task.parentTaskId
    && item.task.stage === task.stage && capabilities[item.capability].actor === task.roleId);
  if (legacyActions.has(action) && !pending && !report) return undefined;
  const capability = pending?.capability ?? report?.capability ?? action;
  const rows = ledger.facts(id).filter(item => item.fact.kind === 'capability-event'
    && item.fact.stepId === intent.stepId && item.fact.attempt === intent.attempt);
  const parent = task && active && task.roleId === 'convener' && task.stage === capabilities[action].stage
    && rows.some(item => item.receipt.state === 'consumed' && item.fact.kind === 'capability-event'
      && item.fact.event.input.kind === 'stage-request' && item.fact.event.source.originId === task.parentTaskId);
  if (intent.kind === 'model-send') {
    const stop = !task && active && action === 'verify-stop' && intent.expected?.roleId === 'convener'
      && intent.key === 'model:stop:' + intent.stepId + ':' + intent.attempt;
    const chief = !task && active && capabilities[action].actor !== 'host' && intent.expected?.roleId === 'chief'
      && intent.key === 'model:chief-intake:' + intent.stepId + ':' + intent.attempt;
    const team = (parent || pending?.state === 'pending') && intent.expected?.roleId === task?.roleId
      && intent.key === 'model:' + task?.taskId;
    const reviewer = report && !report.outcome && intent.expected?.roleId === task?.roleId
      && intent.key === 'model:graph-report:' + report.taskId + ':' + report.report?.key;
    return chief || team || reviewer || stop ? ok(true) : fail('effect-graph-context-mismatch', '模型发送缺少当前能力、派工或报告。');
  }
  if (intent.kind === 'baseline') {
    const initialChange = active && action === 'prepare-existing-branch' && graph.existingRequest && graph.proofs.observed && !task;
    const teamPlan = active && action === 'team-baseline' && parent && intent.expected?.parentTaskId === task?.taskId
      && safePath(String(intent.expected?.planPath ?? '')) && hashValid(String(intent.expected?.planSha256 ?? ''));
    return !instance.baseline && (initialChange || teamPlan) ? ok(true)
      : fail('baseline-not-open', '基线缺少既有模块核验或本次真实团队计划。');
  }
  if (intent.kind === 'role-activation' && active && action === 'activate-roles' && pending?.state === 'pending' && pending.roleId === 'nominator') {
    const expected = intent.expected;
    const paths = expected?.paths;
    const hashes = expected?.hashes;
    const exact = graph.roleDocumentPaths?.filter(path => path.startsWith('角色卡/' + expected?.roleId + '/'));
    return typeof expected?.roleId === 'string' && graph.expectedRoles?.includes(expected.roleId)
      && expected.proposalRequestId === graph.approvedProposalRequestId
      && Array.isArray(paths) && Array.isArray(hashes) && hashes.length === 3 && hashes.every(hashValid)
      && exact?.length === 3 && equal([...paths].sort(), exact.slice().sort())
      && rows.every(item => item.fact.kind !== 'capability-event' || item.fact.event.input.kind !== 'role-activated'
        || item.fact.event.input.roleId !== expected.roleId)
      ? ok(true) : fail('effect-activation-context-mismatch', '激活作用与已确认名单或角色文件不匹配。');
  }
  if (intent.kind === 'acceptance-archive' && active && action === 'archive-acceptance' && !task) {
    const expected = intent.expected;
    const standard = graph.tasks.find(item => item.capability === 'independent-standard' && item.outcome === 'accepted'
      && item.baselineOid === instance.baseline?.oid && item.documents?.some(document =>
        document.path === expected?.criteriaPath && document.sha256 === expected.criteriaSha256));
    const assessment = graph.tasks.find(item => item.capability === 'independent-assessment' && item.attempt === instance.attempt
      && item.outcome === 'accepted' && item.roleId === standard?.roleId && item.documents?.some(document =>
        document.path === expected?.reportPath && document.sha256 === expected.reportSha256));
    const version = typeof expected?.reportPath === 'string' && /-report-v([1-9][0-9]*)\.md$/.exec(expected.reportPath)?.[1];
    return standard && assessment && version && expected?.tipOid === (graph.proofs.implementationTip ?? graph.proofs.acceptedTip)
      && expected?.archivePath === 'docs/acceptance/' + graph.flowId + '-acceptance-v' + version + '.md'
      ? ok(true) : fail('effect-archive-context-mismatch', '归档作用与当前已接受的独立验收证据不匹配。');
  }
  if (intent.kind === 'dispatch' || intent.kind === 'report-delivery') return pending || parent || report
    ? ok(true) : fail('effect-graph-context-mismatch', '派发或报告送达缺少持久任务来源。');
  const code = graphImplementationPaths(instance, pending);
  const paths = intent.expected?.paths;
  if (Array.isArray(paths) && paths.length) {
    if (code.length && (intent.kind === 'task-commit' || intent.kind === 'task-write') && paths.every(path => graphPathAllowed(code, path))) return ok(true);
    const chief = active && !task && action === 'confirm-intent' && intent.expected?.roleId === 'chief';
    if (intent.kind === 'task-write' && (pending?.state === 'pending' || chief || parent && action === 'team-baseline')
      && paths.every(path => documentAllowed(instance, capability, path))) return ok(true);
  }
  return fail('effect-write-forbidden', '当前能力、任务及事实未授权实际作用。');
}

function b3ParentFromScope(ledger: DurableLedger, instance: StoredInstance, task: NonNullable<DurableEffectIntent['task']>): boolean {
  if (instance.definition.schema === 1) return instance.actionIntent?.sourceKey === instance.scope?.key;
  const scope = instance.scope;
  const report = instance.analysisReport;
  if (!scope?.dispatch || !report || task.parentTaskId !== scope.sourceTaskId || scope.attempt !== instance.attempt
    || scope.reportKey !== report.key || scope.b1Attempt !== report.attempt
    || scope.baselineOid !== instance.baseline?.oid || !scope.writeSets.length
    || scope.dispatch.flowId !== instance.graph?.flowId || scope.dispatch.actor !== 'chief'
    || scope.requestDigest !== digest(scope.dispatch.text)) return false;
  const step = instance.definition.steps[scope.stepId];
  const recorded = ledger.fact(instance.ref.instanceId, scope.key);
  return !!step && 'action' in step && step.action === 'accept-b3-advance-with-b2-scope'
    && recorded?.receipt.state === 'consumed' && recorded.fact.kind === 'b3-advance'
    && recorded.fact.source === 'chief' && equal(recorded.fact, scope);
}

function checkPermission(ledger: DurableLedger, instance: StoredInstance, intent: DurableEffectIntent): DurableResult<true> {
  const id = instance.ref.instanceId;
  const action = activeAction(instance);
  if (instance.status !== 'waiting') {
    return fail('effect-attempt-retired', '当前步骤或尝试已换代，不能执行原作用。');
  }
  if (instance.engine === 'incompatible' || instance.engine === 'history-missing') {
    return fail('effect-engine-blocked', '兼容性或历史核验阻止了新的作用。');
  }
  const graph = graphPermission(ledger, instance, intent, action);
  if (graph) return graph;
  if (intent.stepId !== instance.stepId || intent.attempt !== instance.attempt) {
    return fail('effect-attempt-retired', '当前步骤或尝试已换代，不能执行原作用。');
  }
  if (intent.kind === 'baseline') {
    if (!['b1-impact-readonly', 'prepare-existing-branch', 'team-baseline'].includes(action ?? '') || instance.baseline) return fail('baseline-not-open', '当前步骤不接受新的 Git 基线。');
    return ok(true);
  }
  if (intent.kind === 'release-merge') {
    const release = instance.release;
    if (action !== 'b4-customer-merge-main' && action !== 'customer-publish' || !release || release.decision?.action !== 'approve'
      || release.requestId !== intent.requestId || release.digest !== intent.snapshotDigest
      || intent.expected?.mainOid !== release.snapshot.mainOid || intent.expected?.tipOid !== release.snapshot.tipOid
      || intent.expected?.branch !== release.snapshot.branch || !equal(intent.expected?.files, release.snapshot.files)) {
      return fail('release-approval-invalid', '合并未绑定当前批准的快照和预期 refs。');
    }
    const conflict = ledger.effects(id).some(effect => effect.intent.kind === 'release-merge'
      && effect.intent.key !== intent.key && (liveEffect(effect.state) || effect.state === 'succeeded'));
    if (instance.graph && ledger.effects(id).some(effect => effect.intent.key !== intent.key && requiresEffectResolution(instance, effect))) {
      return fail('release-outcome-unresolved', '当前或先前实际作用仍待核对。');
    }
    return conflict ? fail('release-outcome-unresolved', '逻辑发布已有执行或未知结果。') : ok(true);
  }

  if (intent.kind === 'model-send' && intent.expected?.roleId === 'chief' && !intent.task) {
    const intake = (action === 'b1-impact-readonly' || action === 'readonly-report')
      && !ledger.facts(id).some(item => item.fact.kind === 'stage-request' && item.fact.attempt === instance.attempt)
      && intent.key === 'model:chief-intake:' + instance.stepId + ':' + instance.attempt;
    const analysis = action === 'accept-b3-advance-with-b2-scope' && !instance.scope && ledger.facts(id).some(item =>
      item.fact.kind === 'operator-report' && item.fact.attempt === instance.attempt && item.receipt.state === 'consumed'
      && intent.key === 'model:report:' + item.fact.key);
    return intake || analysis ? ok(true) : fail('effect-chief-context-mismatch', '幕僚模型发送缺当前入口或持久报告。');
  }

  const task = intent.task;
  if (!task || task.stageAttempt !== instance.attempt) return fail('effect-task-missing', '实际作用缺当前受派任务。');
  if (action === 'wait-for-review' && intent.kind === 'model-send' && task.roleId === 'convener'
    && task.stage === 'readonly' && task.taskId === instance.task?.parentTaskId
    && intent.key === 'model:report:' + instance.readonlyReportKey) return ok(true);
  const production = sameTask(instance.task, task);
  const pendingParent = ledger.facts(id).some(item => item.receipt.state === 'consumed' && item.fact.kind === 'stage-request'
    && item.fact.attempt === intent.attempt && item.fact.stepId === intent.stepId);
  const stageRequest = task.roleId === 'convener' && ['B1', 'B3', 'readonly'].includes(task.stage)
    && (action === 'b1-impact-readonly' && task.stage === 'B1' && pendingParent
      || action === 'readonly-report' && task.stage === 'readonly' && pendingParent
      || action === 'b3-implement-and-accept' && task.stage === 'B3' && b3ParentFromScope(ledger, instance, task));
  if (!production && !stageRequest) return fail('effect-task-mismatch', '实际作用任务与受信任务绑定不符。');
  if (intent.kind === 'dispatch' || intent.kind === 'model-send' || intent.kind === 'report-delivery') return ok(true);
  if ((intent.kind !== 'task-write' && intent.kind !== 'task-commit') || !production || action !== 'b3-implement-and-accept') {
    return fail('effect-write-forbidden', '当前任务没有实际文件写入或 Git 提交权。');
  }
  const allowed = instance.scope?.writeSets.find(writeSet => writeSet.roleId === task.roleId)?.paths;
  const binding = ledger.facts(id).find(item => item.fact.kind === 'task-bound' && sameTask(task, item.fact.task))?.fact;
  const taskPaths = binding?.kind === 'task-bound' ? binding.modulePaths : undefined;
  const paths = intent.expected?.paths;
  if (!allowed || !taskPaths || !Array.isArray(paths) || !paths.length
    || !paths.every(path => allowedPath(allowed, path) && allowedPath(taskPaths, path))) {
    return fail('effect-write-set-invalid', '实际文件路径超出 B2 有效写集。');
  }
  return ok(true);
}

export function takeEffect(ledger: DurableLedger, instance: StoredInstance, intent: DurableEffectIntent): DurableResult<DurableEffectClaim> {
  if (!validKey(intent.key)) return fail('effect-key-invalid', '操作键无效。');
  const id = instance.ref.instanceId;
  const existing = ledger.effect(id, intent.key);
  if (existing) {
    if (!equal(existing.intent, intent)) return fail('effect-key-conflict', '同一操作键已绑定其他作用内容。');
    if (existing.state !== 'not-started') {
      return ok({ key: intent.key, token: existing.token, state: existing.state, execute: false, result: existing.result });
    }
  }
  const permission = checkPermission(ledger, instance, intent);
  if (!permission.ok) return permission;
  const value: StoredEffect = { intent, token: randomUUID(), state: 'claimed' };
  ledger.saveEffect(id, value);
  return ok({ key: intent.key, token: value.token, state: value.state, execute: true });
}

export function settleEffect(ledger: DurableLedger, instance: StoredInstance, outcome: DurableEffectOutcome): DurableResult<DurableEffectClaim> {
  const id = instance.ref.instanceId;
  const effect = ledger.effect(id, outcome.key);
  if (!effect || effect.token !== outcome.token || !outcome.evidence?.trim()
    || !['not-started', 'succeeded', 'unknown'].includes(outcome.outcome)) {
    return fail('effect-claim-mismatch', '回执未对应实际认领或核对依据。');
  }
  if (effect.state === 'succeeded' || effect.state === 'not-started') {
    if (!equal(outcome, effect.result)) return fail('effect-outcome-conflict', '此前已确认该操作的结果。');
    return ok({ key: outcome.key, token: outcome.token, state: effect.state, execute: false, result: effect.result });
  }
  if (outcome.outcome === 'succeeded' && effect.intent.kind === 'baseline') {
    const branch = outcome.result?.branch;
    const oid = outcome.result?.oid;
    if (branch !== 'ans/task/' + id || typeof oid !== 'string' || !oidValid(oid)) {
      return fail('baseline-result-invalid', '基线未绑定工作流任务分支和 Git OID。');
    }
    instance.baseline = { branch, oid };
  }
  if (outcome.outcome === 'succeeded' && effect.intent.kind === 'task-commit'
    && (typeof outcome.result?.oid !== 'string' || !oidValid(outcome.result.oid))) {
    return fail('task-commit-result-invalid', '任务提交缺受信的结果 OID。');
  }
  effect.result = outcome;
  effect.state = outcome.outcome;
  ledger.saveEffect(id, effect);
  if (outcome.outcome === 'unknown') instance.businessReason = '实际作用结果待核对：' + effect.intent.kind;
  else if (!ledger.effects(id).some(item => item.state === 'unknown')) delete instance.businessReason;
  if (instance.status === 'waiting') {
    const wake: DurableFact = {
      key: 'effect:' + digest(outcome.key + ':' + outcome.token + ':' + outcome.outcome),
      stepId: instance.stepId, attempt: instance.attempt, kind: 'effect-settled', source: 'host', effectKey: outcome.key,
    };
    if (!ledger.fact(id, wake.key)) ledger.saveFact(id, storedFact(wake, { key: wake.key, state: 'pending' }));
  }
  ledger.save(instance);
  return ok({ key: outcome.key, token: outcome.token, state: effect.state, execute: false, result: outcome });
}
