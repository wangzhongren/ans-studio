import { randomUUID } from 'node:crypto';
import type { DurableCapability, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableFact, DurablePendingTask, DurableResult } from '../../model/durable-workflow.ts';
import { digest } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredEffect, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { approvalForRelease, storedFact } from './facts.ts';
import { capabilities } from './capabilities.ts';
import { currentDocumentRevision, revisionParksNode } from './document-revision.ts';
import { privateInstallClaimMatches, privateInstallReceiptMatches, recoveryBudget, recoveryInstallKey, recoveryMissing, recoveryTasks } from './acceptance-environment.ts';
import { acceptancePreparationPermit, acceptanceWorkspaceProjection, allowAcceptanceWorkspaceEffect, isAcceptanceWorkspaceEffect,
  verifyAcceptanceWorkspaceEffect } from './acceptance-workspace.ts';
import { a11DispositionProjection, a11OperationsWakeModelKey, a11RecoveryClaimMatches, a11RecoveryEffectKey, a11ResumeModelKey, blockedRoutingEnabled, blockedRoutingProjection } from './blocked-routing.ts';
import { evidenceAuditDeliveryPermit, evidenceAuditProjection } from './path-a.ts';
import { activeAction, equal, evidenceAuditConfiguration, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';

function allowedPath(allowed: readonly string[], path: string): boolean {
  return safePath(path) && allowed.some(prefix => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
}

const transportKinds = new Set<DurableEffectIntent['kind']>(['model-send', 'dispatch', 'report-delivery']);
export function requiresEffectResolution(ledger: DurableLedger, instance: StoredInstance, effect: StoredEffect): boolean {
  if (effect.intent.kind === 'model-send' && effect.state === 'unknown') {
    const a11 = a11DispositionProjection(ledger, instance);
    if (a11?.retest && a11.resumeExhausted && a11.state === 'parked' && effect.intent.key === a11ResumeModelKey(a11.key)) return false;
  }
  if (effect.intent.kind === 'a11-index-recovery' && effect.state === 'unknown'
    && ledger.facts(instance.ref.instanceId).some(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event'
      && row.fact.event.input.kind === 'a11-disposition-resumed' && row.fact.event.input.disposition.recoveryMode === 'manual'
      && effect.intent.key === a11RecoveryEffectKey(row.fact.event.input.disposition.key))) return false;
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
  if (!task || !(task.capability === 'governed-implementation' || task.capability === 'operations-implementation' && task.workItemId)
    || !currentGraphTask(instance, task)
    || task.outcome || !instance.commonDir || !instance.baseline) return [];
  const approved = instance.graph?.writeSets?.find(set => set.roleId === task.roleId)?.paths ?? [];
  return task.modulePaths?.filter(path => graphPathAllowed(approved, path)) ?? [];
}

export function graphDocumentRoots(action: DurableCapability): readonly string[] {
  switch (action) {
    case 'author-intent':
    case 'author-intent-direct': return ['docs/product/'];
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
    case 'author-intent':
    case 'author-intent-direct': return new RegExp('^docs/product/' + flow + '-intent-v[1-9][0-9]*\\.md$').test(file);
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
  const workflowOwned = workflowOwnsDispatch(instance);
  const pending = task && graph.tasks.find(item => item.stepId === intent.stepId && item.attempt === intent.attempt &&
    sameTask(item.task, task) && currentGraphTask(instance, item));
  if (active && pending?.capability === 'independent-assessment' && (intent.kind === 'dispatch' || intent.kind === 'model-send')) {
    const workspace = acceptanceWorkspaceProjection(ledger, instance);
    const preparation = workspace && ledger.effect(id, workspace.prepareKey);
    if (preparation && liveEffect(preparation.state)) {
      return fail('acceptance-workspace-preparation-unresolved', '独立验收送达等待本次工作区准备作用结算。');
    }
  }
  const report = task && graph.tasks.find(item => item.stepId === intent.stepId && item.attempt === intent.attempt
    && item.report && currentGraphTask(instance, item) && item.task.parentTaskId === task.taskId && item.taskId === task.parentTaskId
    && item.task.stage === task.stage && (workflowOwned ? item.capability === 'governed-implementation' && task.roleId === 'convener'
      : capabilities[item.capability].actor === task.roleId));
  if (intent.kind === 'model-send' && intent.key.startsWith('model:evidence-b3:')) {
    const link = active && task?.roleId === 'convener' && task.stage === 'B3' && action === 'b3-implement-and-accept'
      && intent.expected?.roleId === task.roleId && b3ParentFromScope(ledger, instance, task) && ledger.facts(id).some(row => {
        const input = row.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
        return row.receipt.state !== 'ignored' && row.fact.stepId === intent.stepId && row.fact.attempt === intent.attempt
          && (input?.kind === 'evidence-collection-recorded' || input?.kind === 'evidence-collection-closed')
          && input.task.parentTaskId === task.taskId && intent.key === 'model:evidence-b3:' + input.task.taskId + ':' + row.fact.key;
      });
    return link ? ok(true) : fail('effect-graph-context-mismatch', 'B3 取证回交未绑定当前运营和已登记事实。');
  }
  if (intent.kind === 'model-send' && intent.key.startsWith('model:evidence-route:')) {
    const route = evidenceAuditProjection(ledger, instance)?.route;
    return active && route && sameTask(task, route.parentTask) && intent.expected?.roleId === 'convener'
      && intent.key === 'model:evidence-route:' + route.requestId ? ok(true)
      : fail('effect-graph-context-mismatch', '取证接续仅授权当前运营和已结算的候选路线。');
  }
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
    const chief = !task && active && (workflowOwned ? ['confirm-intent', 'confirm-proposal', 'confirm-appointment'].includes(action)
      : capabilities[action].actor !== 'host') && intent.expected?.roleId === 'chief'
      && intent.key === 'model:chief-intake:' + intent.stepId + ':' + intent.attempt;
    const team = (parent || pending?.state === 'pending') && intent.expected?.roleId === task?.roleId
      && intent.key === 'model:' + task?.taskId;
    const reviewer = report && !report.outcome && intent.expected?.roleId === task?.roleId
      && intent.key === 'model:graph-report:' + report.taskId + ':' + report.report?.key;
    const operationsChildren = pending?.capability === 'operations-implementation' && !pending.workItemId && !pending.outcome
      ? graph.tasks.filter(item => item.stepId === intent.stepId && item.attempt === intent.attempt && (item.workItemId || item.evidenceWorkOrder)
        && item.task.parentTaskId === pending.taskId) : [];
    const currentA11 = pending?.capability === 'operations-implementation' ? a11DispositionProjection(ledger, instance) : undefined;
    const operationsWake = active && operationsChildren.some(child => !child.outcome && child.report
      && intent.key === a11OperationsWakeModelKey(child, currentA11));
    const latest = operationsChildren.at(-1);
    const operationsProgress = active && latest && (latest.outcome === 'accepted' || latest.outcome === 'rework')
      && operationsChildren.every(child => child.outcome && child.outcome !== 'rejected') && rows.some(row => {
        const input = row.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
        return row.receipt.state !== 'ignored' && (input?.kind === 'task-closed' || input?.kind === 'evidence-collection-closed') && sameTask(input.task, latest.task)
          && intent.key === 'model:a11-progress:' + latest.taskId + ':' + row.fact.key;
      });
    const recovery = active && pending?.environmentRecovery === 'parent' && !pending.outcome ? recoveryTasks(instance).child : undefined;
    const recoveryWake = recovery?.report && !recovery.outcome
      && intent.key === 'model:environment-recovery-wake:' + recovery.taskId + ':' + recovery.report.key
      && intent.expected?.roleId === 'convener';
    return chief || team || reviewer || stop || task?.roleId === 'convener' && (operationsWake || operationsProgress || recoveryWake)
      ? ok(true) : fail('effect-graph-context-mismatch', '模型发送缺少当前能力、派工或报告。');
  }
  if (intent.kind === 'acceptance-check-command') {
    const prefix = 'acceptance-check-command:' + task?.taskId + ':';
    return active && action === 'independent-assessment' && recoveryBudget(instance, instance.stepId)
      && pending && !pending.outcome && !pending.report && intent.key.startsWith(prefix) && hashValid(intent.key.slice(prefix.length))
      ? ok(true) : fail('environment-assessment-effect-invalid', '命令观测缺少当前验收尝试。');
  }
  if (intent.kind === 'environment-install') {
    const delivery = pending && ledger.effect(id, 'model:' + pending.taskId);
    const missing = recoveryMissing(ledger, instance)?.missing;
    return active && action === 'operations-environment-recovery' && pending?.environmentRecovery === 'child'
      && pending.state === 'pending' && !pending.report && intent.key === recoveryInstallKey(pending)
      && delivery?.intent.kind === 'model-send' && sameTask(delivery.intent.task, pending.task)
      && (delivery.state === 'claimed' || delivery.state === 'succeeded')
      && missing && privateInstallClaimMatches(instance, missing, pending, intent, delivery.result?.result?.turnId)
      ? ok(true) : fail('environment-recovery-effect-invalid', '安装作用缺少当前已派恢复子任务。');
  }
  if (intent.kind === 'baseline') {
    const initialChange = active && action === 'prepare-existing-branch' && graph.existingRequest && graph.proofs.observed && !task;
    const teamPlan = active && action === 'team-baseline' && (parent || pending?.roleId === 'convener')
      && intent.expected?.parentTaskId === task?.taskId
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
  if (pending?.evidenceWorkOrder) {
    const paths = intent.expected?.paths;
    const roots = pending.evidenceWorkOrder.writePaths;
    return intent.kind === 'task-write' && pending.state === 'pending' && intent.key.startsWith('file:')
      && Array.isArray(paths) && paths.length > 0 && paths.every(path => safePath(path) && roots.some(root => path.startsWith(root)))
      ? ok(true) : fail('evidence-collection-write-forbidden', '取证工单只授权批准的非 Git 证据文件。');
  }
  const code = graphImplementationPaths(instance, pending);
  const paths = intent.expected?.paths;
  if (Array.isArray(paths) && paths.length) {
    if (code.length && (intent.kind === 'task-commit' || intent.kind === 'task-write') && paths.every(path => graphPathAllowed(code, path))) {
      const stage = intent.kind === 'task-write' && intent.key.startsWith('git-add:');
      if (pending?.workItemId && action === 'operations-implementation' && blockedRoutingEnabled(instance)) {
        const taskEffects = ledger.effects(id).filter(effect => sameTask(effect.intent.task, pending.task) && effect.state !== 'not-started');
        if (stage && taskEffects.some(effect => effect.intent.kind === 'task-commit')) {
          return fail('workflow-implementation-already-committed', '本工单的唯一提交已执行或正在核对。提交后不能追加暂存。请引用应用自测回执并正式回交。');
        }
        if (stage && (pending.state !== 'pending' || intent.expected?.head !== pending.baseOid
          || intent.expected?.branch !== instance.baseline?.branch)) {
          return fail('workflow-implementation-stage-base', '暂存须绑定当前工单的真实任务分支和提交前序。');
        }
        if (intent.kind === 'task-commit' && taskEffects.some(effect => effect.intent.kind === 'task-write'
          && effect.intent.key.startsWith('git-add:') && liveEffect(effect.state))) {
          return fail('workflow-implementation-stage-unresolved', '本工单暂存作用尚未核对，暂不能提交。');
        }
      }
      if (pending?.workItemId && intent.kind === 'task-commit' && (intent.expected?.head !== pending.baseOid
        || intent.expected?.branch !== instance.baseline?.branch || ledger.effects(id).some(effect =>
          effect.intent.key !== intent.key && effect.intent.kind === 'task-commit' && sameTask(effect.intent.task, pending.task)
          && effect.state !== 'not-started'))) return fail('workflow-implementation-commit-base', '提交基于本工作项的唯一已核验前序。');
      return ok(true);
    }
    const chief = active && !task && action === 'confirm-intent' && intent.expected?.roleId === 'chief';
    if (intent.kind === 'task-write' && (pending?.state === 'pending' || chief || parent && action === 'team-baseline')
      && paths.every(path => pending?.reviewWritePath ? path === pending.reviewWritePath : documentAllowed(instance, capability, path))) return ok(true);
  }
  return fail('effect-write-forbidden', '当前能力、任务及事实未授权实际作用。');
}

function b3ParentFromScope(ledger: DurableLedger, instance: StoredInstance, task: NonNullable<DurableEffectIntent['task']>): boolean {
  if (instance.definition.schema === 1) return instance.actionIntent?.sourceKey === instance.scope?.key;
  const scope = instance.scope;
  const report = instance.analysisReport;
  const workflowOwned = workflowOwnsDispatch(instance);
  const expectedParent = workflowOwned ? instance.task?.parentTaskId : scope?.sourceTaskId;
  if (!scope?.dispatch || !report || (workflowOwned ? task.taskId : task.parentTaskId) !== expectedParent || scope.attempt !== instance.attempt
    || scope.reportKey !== report.key || scope.b1Attempt !== report.attempt
    || scope.baselineOid !== instance.baseline?.oid || !scope.writeSets.length
    || scope.dispatch.flowId !== instance.graph?.flowId || scope.dispatch.actor !== (workflowOwned ? 'application' : 'chief')
    || scope.requestDigest !== digest(scope.dispatch.text)) return false;
  const step = instance.definition.steps[scope.stepId];
  const recorded = ledger.fact(instance.ref.instanceId, scope.key);
  return !!step && 'action' in step && step.action === 'accept-b3-advance-with-b2-scope'
    && recorded?.receipt.state === 'consumed' && recorded.fact.kind === 'b3-advance'
    && recorded.fact.source === (workflowOwned ? 'host' : 'chief') && equal(recorded.fact, scope);
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
  const revision = currentDocumentRevision(instance);
  if (revision && intent.stepId === instance.stepId && intent.attempt === instance.attempt) {
    if (intent.kind === 'model-send' && revision.status === 'pending' && sameTask(intent.task, revision.task)
      && intent.expected?.roleId === revision.roleId && intent.key === 'model:' + revision.task.taskId) return ok(true);
    const originTask = instance.graph?.tasks.find(task => task.taskId === revision.origin.taskId);
    if (intent.kind === 'model-send' && revision.status === 'resumed' && originTask?.state === 'pending'
      && sameTask(intent.task, originTask.task) && intent.expected?.roleId === 'convener'
      && intent.key === 'model:a11-revision-resume:' + revision.id) return ok(true);
  }
  if (revisionParksNode(instance)) return fail('document-revision-node-parked', '原节点正在等待内置文件修订。');
  const scope = blockedRoutingProjection(ledger, instance);
  const disposition = a11DispositionProjection(ledger, instance);
  if (disposition?.retest && disposition.state === 'parked')
    return fail('workflow-blocked-scope-parked', '当前工作项等待补测或本人、委托决定。');
  if (disposition?.retest && sameTask(intent.task, disposition.childTask)
    && (intent.kind !== 'model-send' || intent.key !== a11ResumeModelKey(disposition.key))) {
    return fail('workflow-a11-retest-readonly', '当前同候选补测不允许启动原写入、提交、派工或备用作用。');
  }
  if (intent.kind === 'a11-index-recovery') {
    return disposition && instance.engine === 'healthy' && intent.stepId === instance.stepId && intent.attempt === instance.attempt
      && scope?.decision?.option !== 'stop' && (!disposition.confirmation || scope?.decision?.option === 'wait')
      && a11RecoveryClaimMatches(disposition, intent)
      ? ok(true) : fail('workflow-a11-recovery-claim-invalid', '索引恢复未绑定当前挂起工单、完整索引及写入回执。');
  }
  if (scope) {
    if (scope.a12bPrepareKey && intent.kind === 'acceptance-workspace-prepare'
      && scope.decision?.option !== 'stop' && scope.decision?.option !== 'rework') {
      return allowAcceptanceWorkspaceEffect(ledger, instance, intent);
    }
    if ((scope.decision?.option === 'revise' || scope.decision?.option === 'compromise' && scope.evidenceCompromise)
      && action === 'operations-implementation' && intent.kind === 'model-send'
      && intent.stepId === instance.stepId && intent.attempt === instance.attempt && intent.expected?.roleId === 'convener'
      && sameTask(intent.task, scope.origin.task) && intent.key === 'model:a11-scope-revise:' + scope.binding.requestId) return ok(true);
    return fail('workflow-blocked-scope-parked', '当前节点等待实际阻塞决定或恢复。');
  }
  if (disposition?.state === 'resumed' && intent.kind === 'model-send' && intent.key === a11ResumeModelKey(disposition.key)) {
    const child = instance.graph?.tasks.find(task => sameTask(task.task, disposition.childTask));
    const original = child && ledger.effect(id, 'model:' + child.taskId);
    return child?.state === 'pending' && sameTask(intent.task, disposition.childTask) && intent.stepId === instance.stepId
      && intent.attempt === instance.attempt && intent.expected?.roleId === child.roleId
      && original?.state === 'succeeded' && intent.expected.runtime === original.intent.expected?.runtime
      ? ok(true) : fail('workflow-a11-resume-delivery-invalid', '恢复送达须绑定原属主和当前工单。');
  }
  if (isAcceptanceWorkspaceEffect(intent.kind)) return allowAcceptanceWorkspaceEffect(ledger, instance, intent);
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
    if (action !== 'b4-customer-merge-main' && action !== 'customer-publish' || !release || !approvalForRelease(ledger, instance, release, intent)
      || release.requestId !== intent.requestId || release.digest !== intent.snapshotDigest
      || intent.expected?.mainOid !== release.snapshot.mainOid || intent.expected?.tipOid !== release.snapshot.tipOid
      || intent.expected?.branch !== release.snapshot.branch || !equal(intent.expected?.files, release.snapshot.files)) {
      return fail('release-approval-invalid', '合并未绑定当前批准的快照和预期 refs。');
    }
    const conflict = ledger.effects(id).some(effect => effect.intent.kind === 'release-merge'
      && effect.intent.key !== intent.key && (liveEffect(effect.state) || effect.state === 'succeeded'));
    if (instance.graph && ledger.effects(id).some(effect => effect.intent.key !== intent.key && requiresEffectResolution(ledger, instance, effect))) {
      return fail('release-outcome-unresolved', '当前或先前实际作用仍待核对。');
    }
    return conflict ? fail('release-outcome-unresolved', '逻辑发布已有执行或未知结果。') : ok(true);
  }

  if (intent.kind === 'model-send' && intent.expected?.roleId === 'chief' && !intent.task) {
    if (workflowOwnsDispatch(instance)) return fail('effect-chief-context-mismatch', '固定派发由当前工作流执行。');
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
    && (!workflowOwnsDispatch(instance) || task.taskId === instance.task?.parentTaskId)
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
  if (evidenceAuditConfiguration(instance) && (isAcceptanceWorkspaceEffect(intent.kind) || intent.kind === 'environment-install'
    || intent.kind === 'acceptance-check-command')) return fail('evidence-audit-execution-retired', '当前证据审计合同没有旧独立执行作用。');
  let permittedPreparationKey: string | undefined;
  if (intent.task && (intent.kind === 'dispatch' || intent.kind === 'model-send')) {
    const assigned = instance.graph?.tasks.find(task => sameTask(task.task, intent.task!));
    if (assigned?.environmentRecovery) return fail('evidence-audit-execution-retired', '旧独立验收执行任务已退役。');
    if (intent.task.stage === 'A12b' && evidenceAuditConfiguration(instance)) {
      const audit = evidenceAuditDeliveryPermit(ledger, instance, intent.task);
      if (!audit.ok || audit.value.generation !== assigned?.evidenceAuditGeneration
        || intent.expected?.evidenceAuditGeneration !== String(audit.value.generation)) {
        return fail('evidence-audit-dispatch-held', '实际质检送达须绑定已收口证据及当期代次。');
      }
    }
    const historical = acceptanceWorkspaceProjection(ledger, instance);
    const permit = historical?.receipt && historical.closeReceipt && (!historical.binding?.requiresBrowserEvidence || historical.browserEvidence)
      ? ok({ prepareKey: undefined, generation: undefined }) : acceptancePreparationPermit(ledger, instance, intent.task);
    if (!permit.ok) return permit;
    if (permit.value.prepareKey && (permit.value.prepareKey !== intent.expected?.prepareKey
      || String(permit.value.generation) !== intent.expected?.preparationGeneration)) {
      return fail('acceptance-preparation-generation-stale', '质检送达未绑定当前准备观察代次。');
    }
    permittedPreparationKey = permit.value.prepareKey;
  }
  const id = instance.ref.instanceId;
  const existing = ledger.effect(id, intent.key);
  if (existing) {
    const transport = (candidate: DurableEffectIntent) => ({ ...candidate,
      expected: { ...candidate.expected, preparationGeneration: undefined, clientMessageId: undefined } });
    const rebound = permittedPreparationKey && existing.state === 'not-started' && equal(transport(existing.intent), transport(intent));
    if (!rebound && !equal(existing.intent, intent)) return fail('effect-key-conflict', '同一操作键已绑定其他作用内容。');
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

export function settleEffect(ledger: DurableLedger, instance: StoredInstance, outcome: DurableEffectOutcome,
  trustedBrowserCapture = false): DurableResult<DurableEffectClaim> {
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
  if (effect.intent.kind === 'acceptance-workspace-prepare') {
    const scope = blockedRoutingProjection(ledger, instance);
    if (scope?.a12bPrepareKey === effect.intent.key && (scope.decision?.option === 'stop' || scope.decision?.option === 'rework')) {
      return fail('acceptance-preparation-observation-stale', '本次准备已由当期处置结算。');
    }
  }
  if (isAcceptanceWorkspaceEffect(effect.intent.kind)) {
    const verified = verifyAcceptanceWorkspaceEffect(ledger, instance, effect, outcome, trustedBrowserCapture);
    if (!verified.ok) return verified;
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
  if (effect.intent.kind === 'a11-index-recovery') {
    const disposition = a11DispositionProjection(ledger, instance);
    const scope = blockedRoutingProjection(ledger, instance);
    const expected = effect.intent.expected;
    if (disposition?.state !== 'parked' || scope?.decision?.option === 'stop' || !sameTask(effect.intent.task, disposition.childTask)
      || outcome.outcome === 'succeeded' && (!expected || !outcome.result || outcome.result.branch !== expected.branch
        || outcome.result.head !== expected.head || outcome.result.indexDigest !== expected.afterIndex
        || outcome.result.worktreeDigest !== expected.worktreeDigest)) {
      return fail('workflow-a11-recovery-result-invalid', '索引恢复结果未核对同一实际分支、提交、完整索引和工作区指纹。');
    }
  }
  if (outcome.outcome === 'succeeded' && effect.intent.kind === 'environment-install') {
    const receiptId = outcome.result?.commandReceiptId;
    if (typeof receiptId !== 'string' || !hashValid(receiptId) || !ledger.evidence(id, receiptId)
      || !privateInstallReceiptMatches(ledger, instance, effect.intent, receiptId)) {
      return fail('environment-recovery-receipt-invalid', '安装作用需要持久记录的实际应用命令回执。');
    }
  }
  if (outcome.outcome === 'succeeded' && effect.intent.kind === 'acceptance-check-command') {
    const result = outcome.result;
    if (!result || !['allowed', 'denied', 'unavailable'].includes(String(result.decision))
      || !validKey(String(result.turnId ?? '')) || !validKey(String(result.receiptId ?? '')) || !validKey(String(result.script ?? ''))
      || !/^(?:[0-9]+)?$/.test(String(result.verifiedExit ?? '')) || typeof result.missingExecutable !== 'string') {
      return fail('environment-assessment-receipt-invalid', '命令观察需要当前回合的实际判定和运行结果。');
    }
  }
  effect.result = outcome;
  effect.state = outcome.outcome;
  ledger.saveEffect(id, effect);
  if (instance.status === 'waiting' || effect.intent.kind !== 'environment-install' && effect.intent.kind !== 'acceptance-check-command') {
    if (outcome.outcome === 'unknown') instance.businessReason = '实际作用结果待核对：' + effect.intent.kind;
    else if (!ledger.effects(id).some(item => item.state === 'unknown')) delete instance.businessReason;
  }
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
