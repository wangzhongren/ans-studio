import type {
  DurableA11Disposition, DurableCapability, DurableCapabilityEvent, DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableGraphCard,
  DurableAcceptancePreparationRework, DurableImplementationAggregate, DurableImplementationItem,
  DurableEvidenceAuditBasis, DurableEvidenceAuditProjection, DurableEvidenceAuditRecord, DurableEvidenceCollectionMissing,
  DurableVerificationRequirement,
  DurableInstanceRef, DurablePendingTask, DurableResult, DurableTaskBinding,
} from '../../model/durable-workflow.ts';
import type { RuntimeReportSnapshotV1 } from '../../model/runtime.ts';
import type { DurableLedger, StoredFact, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import { INTENT_DECISION_REQUIREMENTS_AUTHORING, proposalDecisionChoiceId, proposalDecisionValuesValid } from '../../common/编排/workflow-preconditions.ts';
import { capabilities, workflowTaskRoles } from './capabilities.ts';
import { assessmentBasis, privateRecoveryVerificationMatches, recoveryBudget, recoveryCommandConfirms, recoveryInstallKey, recoveryMissing, recoveryOwners, recoveryTasks, recoveryVisitsKey,
  validMissingEvidence } from './acceptance-environment.ts';
import { acceptancePreparationEffectIdentity, acceptancePreparationEnabled, acceptancePreparationObservation, acceptancePreparationPermit,
  acceptancePreparationReworkStep, acceptanceWorkspaceProjection, isPreparationBlocker } from './acceptance-workspace.ts';
import { a11DispositionProjection, a11OperationsWakeModelKey, a11RecoveryEffectKey, a11ResumeModelKey, blockedRoutingEnabled, blockedRoutingProjection,
  citesImplementationTest, currentVerificationPlan, implementationTestMatches, implementationTestRulesText, implementationTestsSatisfied, implementationWorkOrder, missingImplementationTests,
  scopeGovernanceDigest, verificationCapabilitiesValid, workOrderText } from './blocked-routing.ts';
import { requiresEffectResolution } from './effects.ts';
import { b2EvidenceDecisionProjection, currentProposalDecision, proposalDecisionTaskText, storedFact } from './facts.ts';
import { currentDocumentRevision, revisionParksNode } from './document-revision.ts';
import { activeAction, applyStep, changeStep, decisionProvenanceMatches, equal, evidenceAuditConfiguration, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';
import type { ActivityInput, ActivityOutcome } from './rules.ts';

const preparations = ['product-prepare', 'planning-prepare', 'personnel-prepare'] as const;
const legacyActions = new Set<DurableCapability>([
  'b1-impact-readonly', 'b1-open-followup-attempt', 'accept-b3-advance-with-b2-scope', 'b3-implement-and-accept',
  'b4-customer-merge-main', 'customer-publish', 'readonly-report', 'wait-for-review',
]);
const cardKinds = { 'confirm-intent': 'intent-confirm', 'confirm-proposal': 'proposal', 'confirm-appointment': 'appointment' } as const;
const evidencePath = (ref: DurableEvidenceRef) => hashValid(ref.sha256) && (safePath(ref.path)
  || /^角色卡\/[a-z0-9][a-z0-9-]*\/(?:role-card\.md|boundary\.(?:yaml|md))$/.test(ref.path));

export function graphCardDigest(ref: DurableInstanceRef, input: Pick<DurableGraphCard, 'cardKind' | 'documents' | 'options' | 'payload' | 'decisionFields' | 'decisionProblem'> &
  { stepId: string; attempt: number }): string {
  return digest(stableJson([ref.projectId, ref.instanceId, input.stepId, input.attempt, input.cardKind, input.documents,
    input.options ?? [], input.payload ?? {}, ...(input.decisionFields !== undefined || input.decisionProblem !== undefined
      ? [{ fields: input.decisionFields, problem: input.decisionProblem }] : [])]));
}

export function capabilityEvidence(event: DurableCapabilityEvent): readonly DurableEvidenceRef[] {
  switch (event.input.kind) {
    case 'task-report': return [event.input.evidence];
    case 'product-intake-recovery':
    case 'product-intent-recovery': return [event.input.evidence];
    case 'operator-report': return [event.input.evidence];
    case 'task-closed': return event.input.documents ?? [];
    case 'environment-missing': {
      const { basis, report, manifest, lock } = event.input.missing;
      return [basis.criteria, manifest, ...(lock ? [lock] : []), ...(report ? [report] : [])];
    }
    case 'environment-recovery-settled': {
      const outcome = event.input.settlement.outcome;
      return outcome.kind === 'restored' ? [outcome.verification] : [];
    }
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
    task, taskId: task.taskId, roleId: task.roleId, state: 'pending', dispatch: event.input.dispatch, modulePaths: event.input.modulePaths,
    ...(event.input.reviewWritePath ? { reviewWritePath: event.input.reviewWritePath } : {}),
    ...(event.input.verificationCapabilities ? { verificationCapabilities: event.input.verificationCapabilities } : {}) };
}

export function runtimeReportFromEvidence(
  ledger: DurableLedger, instance: StoredInstance, evidence: DurableEvidenceRef,
): RuntimeReportSnapshotV1 | undefined {
  if (evidence.path !== 'ans-evidence/' + evidence.sha256) return undefined;
  const bytes = ledger.evidence(instance.ref.instanceId, evidence.sha256);
  if (!bytes || digest(bytes) !== evidence.sha256) return undefined;
  try {
    const { report } = JSON.parse(bytes.toString('utf8')) as { report?: RuntimeReportSnapshotV1 };
    if (report?.version !== 1 || !validKey(report.reportId) || typeof report.summary?.text !== 'string'
      || !['submitted-report', 'terminal-fallback'].includes(report.origin)
      || !['completed', 'blocked', 'failed', 'aborted', 'unreported'].includes(report.status)
      || report.origin === 'terminal-fallback' && report.status === 'completed') return undefined;
    return report;
  } catch { return undefined; }
}

const reportText = (report: RuntimeReportSnapshotV1) =>
  [report.summary.text, ...(report.evidence ?? []).map(item => item.text)].join('\n');

function retestMissing(ledger: DurableLedger, instance: StoredInstance, child: DurablePendingTask,
  disposition: DurableA11Disposition, report: RuntimeReportSnapshotV1) {
  const original = runtimeReportFromEvidence(ledger, instance, disposition.childReport.evidence);
  const resume = ledger.effect(instance.ref.instanceId, a11ResumeModelKey(disposition.key));
  if (!original || original.origin !== 'submitted-report' || original.status !== 'completed'
    || original.taskId !== child.taskId || original.source.roleId !== child.roleId
    || original.source.turnId === report.source.turnId || resume?.state !== 'succeeded'
    || resume.result?.result?.turnId !== report.source.turnId || report.origin !== 'submitted-report'
    || report.status !== 'completed' || !citesImplementationTest(reportText(report), disposition.candidateOid))
    return child.workOrder?.requirements.filter(req => req.capability === 'module-shell') ?? [];
  const references = reportText(report);
  return missingImplementationTests(ledger, instance, child, disposition.candidateOid, [
    { turnId: original.source.turnId, reportText: references },
    { turnId: report.source.turnId, retestKey: disposition.key, reportText: references },
  ]);
}

const directProducts = {
  'product-prepare-direct': { stage: 'A1', recovery: 'product-intake-recovery', legacy: 'product-prepare', key: 'intake-recovery' },
  'author-intent-direct': { stage: 'A2', recovery: 'product-intent-recovery', legacy: 'author-intent', key: 'intent-recovery' },
} as const;
type DirectProductCapability = keyof typeof directProducts;
const productDirect = (capability: DurableCapability): capability is DirectProductCapability => Object.hasOwn(directProducts, capability);

function directProductTask(instance: StoredInstance, capability: DirectProductCapability, summary: string, decisionProblem?: string): DurablePendingTask {
  const { ref, stepId, attempt, graph, metadata } = instance;
  const flowId = graph!.flowId ?? 'intake-' + digest(ref.instanceId).slice(0, 24);
  const roleId = 'product';
  const taskId = graphTaskId(ref, roleId, stepId, attempt);
  const { stage } = directProducts[capability];
  const instruction = stage === 'A1'
    ? '请只做产品受理。核对需求、初步范围和待澄清问题。使用 submit_report 回交受理结论，' +
      '可继续时提交 completed，无法继续时提交 blocked 并说明原因。本步不撰写正式意图文档，不创建或修改项目文件。'
    : '请起草本次产品意图。使用原始需求和可得参考即可。区分已确认目标、实施范围、非目标、' +
      '可验收结果、合理假设及待澄清事项。一般细节优先按可逆的最小可玩方案起草，把小范围默认值标为假设。' +
      '仅在缺少关键决定而确实无法起草时，用 submit_report 提交 blocked 并列出具体问题。' +
      '完成时请用 submit_report 提交 completed 并引用实际草稿相对路径。' +
      '只写 docs/product/' + flowId + '-intent-vN.md。文件前置元数据使用 schema: project-intent/v1、' +
      'flowId: ' + flowId + '、intentId: ' + flowId + '-intent、version: N（数字，和文件名一致）。' +
      INTENT_DECISION_REQUIREMENTS_AUTHORING +
      '首次用 v1，若已有同 flow 的版本则用下一版；正文写明上述内容，勿创建客户审批入口。'
      + (decisionProblem ? '\n上一次 A3 已明确要求修订意图。应用核对结果：' + decisionProblem : '');
  return {
    stepId, attempt, flowId, capability, taskId, roleId, state: 'pending',
    task: { stage, stageAttempt: attempt, executionAttempt: 1, parentTaskId: ref.instanceId, taskId, roleId },
    dispatch: { actor: 'application', flowId, runtime: metadata.runtime, text: '客户需求：' + summary + '\n\n' + instruction },
  };
}

function revisedIntentDecisionProblem(ledger: DurableLedger, instance: StoredInstance): string | undefined {
  const id = instance.ref.instanceId;
  const revised = ledger.facts(id).findLast(row => {
    if (row.receipt.state !== 'consumed' || row.fact.kind !== 'capability-event') return false;
    const { input, flowId, stepId, attempt } = row.fact.event;
    const step = instance.definition.steps[stepId];
    return input.kind === 'card-decided' && input.decision === 'revise' && flowId === instance.graph?.flowId && attempt < instance.attempt
      && step && 'action' in step && step.action === 'confirm-intent';
  });
  const decision = revised?.fact.kind === 'capability-event' ? revised.fact.event.input : undefined;
  if (decision?.kind !== 'card-decided') return;
  const prepared = ledger.fact(id, 'card-prepared:' + decision.requestId);
  const preparation = prepared?.fact.kind === 'capability-event' ? prepared.fact.event.input : undefined;
  if (prepared?.receipt.state === 'consumed' && preparation?.kind === 'card-prepared'
    && preparation.card.cardKind === 'intent-confirm' && preparation.card.generation === decision.generation
    && preparation.card.digest === decision.digest) return preparation.card.decisionProblem;
}

export function graphTaskId(ref: DurableInstanceRef, roleId: string, stepId: string, attempt: number): string {
  return 'dw-' + digest(stableJson([ref.projectId, ref.instanceId, roleId, stepId, attempt])).slice(0, 32);
}

export function implementationItems(value: StoredInstance): DurableImplementationItem[] {
  const graph = value.graph;
  const reviewer = graph?.tasks.findLast(task => task.capability === 'independent-standard' && task.outcome === 'accepted'
    && task.baselineOid === value.baseline?.oid)?.roleId;
  const collector = evidenceAuditConfiguration(value)?.collectorRoleId;
  return (graph?.writeSets ?? []).filter(set => set.paths.length > 0 && set.roleId !== reviewer && set.roleId !== collector
    && graph?.expectedRoles?.includes(set.roleId) && graph.activatedRoles?.includes(set.roleId))
    .map(set => ({ id: set.roleId, roleId: set.roleId, paths: set.paths }));
}

export function implementationChildren(value: StoredInstance): DurablePendingTask[] {
  return value.graph?.tasks.filter(task => task.capability === 'operations-implementation'
    && task.stepId === value.stepId && task.attempt === value.attempt && task.workItemId) ?? [];
}

export function implementationHead(value: StoredInstance): string | undefined {
  return implementationChildren(value).findLast(task => task.commitOid)?.commitOid
    ?? value.graph?.proofs.implementationTip ?? value.baseline?.oid;
}

export function implementationPreparationRepair(ledger: DurableLedger, value: StoredInstance): DurableAcceptancePreparationRework | undefined {
  const retry = acceptancePreparationReworkStep(value, 'assess');
  const key = value.graph?.proofs['preparation-rework-observation'];
  if (!retry || value.stepId !== retry.implementId || !key) return;
  const row = ledger.fact(value.ref.instanceId, key);
  const input = row?.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
  if (row?.receipt.state === 'consumed' && input?.kind === 'acceptance-preparation-observed'
    && value.attempt === input.observation.basis.assessmentTask.stageAttempt + 1) return input.observation.rework;
}

export function implementationDispatchItems(ledger: DurableLedger, value: StoredInstance): DurableImplementationItem[] {
  const items = implementationItems(value);
  const repair = implementationPreparationRepair(ledger, value);
  return repair ? items.filter(item => item.id === repair.workItemId && item.roleId === repair.ownerTask.roleId)
    .map(item => ({ ...item, paths: repair.paths })) : items;
}

export function implementationAggregate(ledger: DurableLedger, value: StoredInstance): DurableImplementationAggregate | undefined {
  const children = implementationChildren(value);
  const items = implementationItems(value);
  const repair = implementationPreparationRepair(ledger, value);
  const tipOid = implementationHead(value);
  if (!items.length || !tipOid || children.some(task => !task.outcome || task.outcome === 'rejected')) return undefined;
  const entries = items.flatMap(item => {
    const task = children.find(child => child.workItemId === item.id && child.outcome === 'accepted');
    if (task?.commitOid && task.report) return [{ workItemId: item.id, taskId: task.taskId, reportKey: task.report.key, commitOid: task.commitOid }];
    return repair?.inherited.filter(entry => entry.workItemId === item.id) ?? [];
  });
  return entries.length === items.length ? { tipOid, entries } : undefined;
}

export function sameAuditBasis(first: DurableEvidenceAuditBasis, second: DurableEvidenceAuditBasis): boolean {
  return first.candidateOid === second.candidateOid && first.branch === second.branch
    && first.approvalDigest === second.approvalDigest && equal(first.standard, second.standard);
}

export function missingAuditEvidence(requirements: readonly DurableVerificationRequirement[], records: readonly DurableEvidenceAuditRecord[]):
  DurableEvidenceCollectionMissing[] {
  return requirements.flatMap(requirement => {
    const rows = records.filter(row => row.requirementId === requirement.id && row.source === requirement.source);
    const artifact = !requirement.paths?.length || requirement.paths.every(path => rows.some(row => row.artifact?.path === path));
    if (rows.length && artifact) return [];
    const reason = requirement.source === 'external-session' ? '当前批准执行通道没有可核实的同候选外部会话来源。'
      : requirement.capability === 'approved-build' ? '当前构建通道缺同一次批准进程所产生的前后原件摘要及获批产物绑定。'
      : '缺少当前签发项所需的可核验证据。';
    return [{ requirementId: requirement.id, reason }];
  }).filter((missing, index, all) => all.findIndex(item => item.requirementId === missing.requirementId) === index);
}

export function evidenceAuditProjection(ledger: DurableLedger, value: StoredInstance): DurableEvidenceAuditProjection | undefined {
  const configuration = evidenceAuditConfiguration(value);
  const action = activeAction(value);
  const id = value.ref.instanceId;
  const facts = ledger.facts(id).flatMap(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event' ? [row.fact.event.input] : []);
  const legacy = facts.findLast(event => event.kind === 'evidence-audit-blocked' && event.legacy && event.scope.origin.entry === value.entry);
  if (!configuration) {
    const original = value.task ?? value.implementation?.task;
    if ((action === 'b3-implement-and-accept' || action === 'b4-customer-merge-main') && value.status === 'waiting'
      && value.scope?.evidenceRequirements?.length && value.baseline && value.analysisReport && original) {
      const produced = ledger.effects(id).findLast(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
        && sameTask(effect.intent.task, original) && effect.intent.expected?.branch === value.baseline?.branch);
      const candidateOid = produced?.result?.result?.oid;
      if (typeof candidateOid !== 'string' || !oidValid(candidateOid)) return;
      const current = facts.findLast(event => event.kind === 'evidence-audit-blocked' && event.scope.origin.entry === value.entry);
      const basis = { candidateOid, branch: value.baseline.branch, standard: value.analysisReport.evidence, generation: 1,
        approvalDigest: scopeGovernanceDigest(value) };
      const authority = value.scope.evidenceAuthorization;
      if (authority?.decision === 'approve') {
        const requirements = authority.requirements.map(requirement => ({ id: requirement.requirementId, stage: 'A12b' as const,
          capability: 'module-inspection' as const, evidence: ['file' as const], behavior: requirement.reason,
          source: 'candidate-file' as const, paths: requirement.paths }));
        return projectAuditCollection(value, basis, requirements, authority.roleId, facts, action === 'b4-customer-merge-main');
      }
      const missing = value.scope.evidenceRequirements.map(row => ({ requirementId: row.requirementId,
        reason: 'B2 同一范围缺已批准的独立取证工单及写域。' }));
      return { basis, requirements: [], state: current ? 'blocked' : 'collecting', records: [], missing, writePaths: [] };
    }
    if (legacy?.kind !== 'evidence-audit-blocked' || value.status !== 'waiting') return;
    return { basis: legacy.basis, state: 'blocked', legacy: true, requirements: [], auditTask: legacy.task, records: [], missing: legacy.missing, writePaths: [] };
  }
  const plan = currentVerificationPlan(ledger, value);
  const candidate = action === 'operations-implementation' ? implementationAggregate(ledger, value)?.tipOid
    : value.graph?.proofs.implementationTip;
  if (!plan || !candidate || !value.baseline || value.status !== 'waiting'
    || !['operations-implementation', 'independent-assessment', 'archive-acceptance', 'customer-publish'].includes(action ?? '')) return;
  const basis = { candidateOid: candidate, branch: value.baseline.branch, standard: plan.standard,
    approvalDigest: scopeGovernanceDigest(value), generation: 1 };
  return projectAuditCollection(value, basis, plan.requirements.filter(item => item.stage === 'A12b'), configuration.collectorRoleId, facts, false);
}

function projectAuditCollection(value: StoredInstance, basis: DurableEvidenceAuditBasis, requirements: readonly DurableVerificationRequirement[],
  collectorRoleId: string, facts: readonly DurableCapabilityEvent['input'][], completedLegacyB3: boolean): DurableEvidenceAuditProjection {
  const opened = facts.findLast(event => event.kind === 'evidence-audit-blocked' && !event.legacy
    && event.scope.origin.entry === value.entry && sameAuditBasis(event.basis, basis));
  const resumed = opened?.kind === 'evidence-audit-blocked' && facts.some(event => event.kind === 'blocked-scope-resumed'
    && event.evidenceAction === 'route' && event.requestId === opened.scope.binding.requestId) ? opened : undefined;
  const minimumGeneration = resumed ? resumed.basis.generation + 1 : 1;
  const collector = value.graph?.tasks.findLast(task => !!task.evidenceWorkOrder && task.evidenceWorkOrder.basis.generation >= minimumGeneration
    && sameAuditBasis(task.evidenceWorkOrder.basis, basis));
  const recorded = collector && facts.findLast(event => event.kind === 'evidence-collection-recorded'
    && sameTask(event.task, collector.task) && sameAuditBasis(event.basis, basis));
  const latest = recorded?.kind === 'evidence-collection-recorded' ? recorded : undefined;
  const previousGeneration = facts.reduce((highest, event) => {
    const previous = event.kind === 'evidence-collection-dispatched' ? event.workOrder.basis
      : event.kind === 'evidence-collection-recorded' || event.kind === 'evidence-audit-blocked' && !event.legacy ? event.basis : undefined;
    return previous && !sameAuditBasis(previous, basis) ? Math.max(highest, previous.generation) : highest;
  }, 0);
  const generation = Math.max(latest?.basis.generation ?? collector?.evidenceWorkOrder?.basis.generation ?? previousGeneration + 1,
    minimumGeneration, opened?.kind === 'evidence-audit-blocked' ? opened.basis.generation : 1);
  const records = latest?.records ?? [];
  const needed = missingAuditEvidence(requirements, records);
  const missing = needed.map(item => latest?.missing.find(row => row.requirementId === item.requirementId) ?? item);
  const blocker = facts.findLast(event => event.kind === 'evidence-audit-blocked' && !event.legacy
    && event.scope.origin.entry === value.entry && sameAuditBasis(event.basis, basis) && event.basis.generation === generation);
  const auditor = value.graph?.tasks.findLast(task => task.attempt === value.attempt && task.capability === 'independent-assessment');
  const ready = collector?.outcome === 'accepted' && !missing.length && !!latest;
  const completed = ready && (auditor?.outcome === 'accepted' || completedLegacyB3);
  return { basis: { ...basis, generation }, requirements, collectorRoleId,
    state: completed ? 'audited' : ready ? 'ready' : blocker ? 'blocked' : 'collecting',
    ...(!collector && resumed?.scope.evidenceRoute ? { route: { ...resumed.scope.evidenceRoute,
      requestId: resumed.scope.binding.requestId, parentTask: resumed.scope.origin.task } } : {}),
    collector: collector?.task, auditTask: auditor?.task, records, missing, writePaths: collector?.evidenceWorkOrder?.writePaths ?? [] };
}

export function evidenceAuditDeliveryPermit(ledger: DurableLedger, value: StoredInstance, task: DurableTaskBinding): DurableResult<{ generation?: number }> {
  if (task.stage !== 'A12b') return ok({});
  const assigned = value.graph?.tasks.find(row => sameTask(row.task, task));
  if (assigned?.environmentRecovery) return fail('evidence-audit-execution-retired', '旧独立验收执行任务已退役。');
  const audit = evidenceAuditProjection(ledger, value);
  if (audit?.legacy && audit.state === 'blocked') return fail('evidence-audit-legacy-blocked', '旧冻结标准所需执行或关闭回执缺失。');
  if (!evidenceAuditConfiguration(value)) return ok({});
  return value.engine === 'healthy' && activeAction(value) === 'independent-assessment' && audit?.state === 'ready'
    && assigned?.capability === 'independent-assessment' && sameTask(audit.auditTask, task)
    ? ok({ generation: audit.basis.generation }) : fail('evidence-audit-dispatch-held', '审计派发等待当前候选的正式取证及运营收口。');
}

function auditReportCovers(report: RuntimeReportSnapshotV1, audit: DurableEvidenceAuditProjection): boolean {
  if (report.status !== 'completed') return true;
  if (audit.records.some(record => record.outcome === 'failed')) return false;
  const expected = [...new Set(audit.requirements.map(req => req.id))].sort();
  const rows = new Map<string, readonly string[]>();
  for (const evidence of report.evidence ?? []) {
    try {
      const row = JSON.parse(evidence.text) as { requirementId?: unknown; evidenceIds?: unknown };
      if (typeof row.requirementId === 'string' && Array.isArray(row.evidenceIds) && row.evidenceIds.every(id => typeof id === 'string')) {
        if (rows.has(row.requirementId)) return false;
        rows.set(row.requirementId, row.evidenceIds);
      }
    } catch { /* Existing documentary evidence references may accompany formal verdict rows. */ }
  }
  return equal([...rows.keys()].sort(), expected) && expected.every(id =>
    equal([...(rows.get(id) ?? [])].sort(), audit.records.filter(row => row.requirementId === id).map(row => row.id).sort()));
}

export function admitCapability(ledger: DurableLedger, instance: StoredInstance, event: DurableCapabilityEvent,
  trustedLiveSource = false, trustedEnvironment = false, trustedBlockedRouting = false,
  receiptCheckOnly = false): DurableResult<DurableFactReceipt> {
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
  if (binding?.capability === 'independent-assessment' && acceptancePreparationEnabled(instance)
    && ['task-report', 'task-closed', 'task-dispatch-failed'].includes(input.kind)) {
    const permit = acceptancePreparationPermit(ledger, instance, binding.task);
    if (!permit.ok) return permit;
  }
  const continuation = binding && !binding.outcome && (input.kind === 'task-report' || input.kind === 'task-closed')
    && (instance.attempt === attempt || binding.capability === 'independent-standard' && binding.baselineOid === instance.baseline?.oid
      && state.proofs['standard-open'] === binding.bindingKey);
  if (!continuation && (instance.stepId !== stepId || instance.attempt !== attempt)) {
    return fail('capability-not-current', '步骤、尝试或任务已经退役。');
  }
  const facts = () => ledger.facts(id).filter(item => item.fact.kind === 'capability-event'
    && item.fact.stepId === stepId && item.fact.attempt === attempt && item.receipt.state !== 'ignored');
  const actor = roleId === descriptor.actor;
  const workflowOwned = workflowOwnsDispatch(instance);
  const host = workflowOwned && roleId === 'host' && parentTaskId === id;
  const modelOrigin = (operationKey: string) => {
    const effect = ledger.effect(id, operationKey);
    const turnId = effect?.result?.result?.turnId;
    return effect?.intent.kind === 'model-send' && effect.intent.stepId === stepId && effect.intent.attempt === attempt
      && effect.intent.expected?.roleId === roleId && (effect.state === 'claimed' || turnId === originId && effect.state !== 'not-started');
  };
  const implementationParent = step.action === 'operations-implementation' ? state.tasks.find(task =>
    task.capability === step.action && task.stepId === stepId && task.attempt === attempt && !task.workItemId) : undefined;
  const disposition = implementationParent ? a11DispositionProjection(ledger, instance) : undefined;
  const currentResume = disposition?.state === 'resumed' ? disposition : undefined;
  const resumedChild = !!(binding && currentResume && sameTask(binding.task, currentResume.childTask));
  const resumedModel = currentResume && ledger.effect(id, a11ResumeModelKey(currentResume.key));
  const retiredParentReport = currentResume?.parentReport && runtimeReportFromEvidence(ledger, instance, currentResume.parentReport.evidence);
  const resumedParentOperation = (operation: string) => {
    if (!currentResume) return true;
    const children = implementationChildren(instance);
    const resumedIndex = children.findIndex(child => sameTask(child.task, currentResume.childTask));
    return resumedIndex >= 0 && children.slice(resumedIndex).some(child =>
      child.report && operation === a11OperationsWakeModelKey(child, currentResume)
      || child.outcome && facts().some(row => {
        const input = row.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
        return input?.kind === 'task-closed' && sameTask(input.task, child.task)
          && operation === 'model:a11-progress:' + child.taskId + ':' + row.fact.key;
      }));
  };
  const parentEffect = () => implementationParent && ledger.effects(id).find(effect => effect.intent.kind === 'model-send'
    && sameTask(effect.intent.task, implementationParent.task)
    && effect.intent.stepId === stepId && effect.intent.attempt === attempt
    && resumedParentOperation(effect.intent.key)
    && (!retiredParentReport || retiredParentReport.source.turnId !== originId)
    && (effect.state === 'succeeded' && effect.result?.result?.turnId === originId
      || effect.state === 'claimed' && trustedLiveSource && !effect.result));
  const parentTool = () => workflowOwned && roleId === 'convener' && trustedLiveSource && !!implementationParent
    && parentTaskId === implementationParent.taskId && !implementationParent.report && !!parentEffect();
  const b3ParentTool = () => workflowOwned && roleId === 'convener' && trustedLiveSource && step.action === 'b3-implement-and-accept'
    && !!parentTaskId && parentTaskId === instance.task?.parentTaskId && ledger.effects(id).some(effect =>
      effect.intent.kind === 'model-send' && effect.intent.stepId === stepId && effect.intent.attempt === attempt
      && effect.intent.task?.taskId === parentTaskId && effect.intent.task.roleId === roleId
      && effect.state === 'succeeded' && effect.result?.result?.turnId === originId
      && (effect.intent.key === 'model:' + parentTaskId || effect.intent.key.startsWith('model:report:')
        || effect.intent.key.startsWith('model:evidence-b3:') || effect.intent.key.startsWith('model:evidence-route:')));
  if (receiptCheckOnly && (step.action !== 'operations-implementation' || input.kind !== 'task-closed' || input.outcome !== 'accepted'
    || parentEffect()?.state !== 'succeeded'))
    return fail('capability-close-invalid', '回执预核仅支持当前正式接受请求。');
  switch (input.kind) {
    case 'b2-evidence-scope-prepared':
    case 'b2-evidence-scope-decided': {
      const prior = b2EvidenceDecisionProjection(ledger, instance);
      const request = input.request;
      const prepared = input.kind === 'b2-evidence-scope-prepared';
      if (!trustedBlockedRouting || !host || step.action !== 'accept-b3-advance-with-b2-scope'
        || request.binding.generation !== attempt || key !== input.kind + ':' + request.binding.requestId
        || (prepared ? !!prior || !!request.decision || !request.requirements.length
          : !prior || prior.decision || !['approve', 'decline'].includes(request.decision ?? '') || request.provenance?.source !== 'customer'
            || !equal({ ...request, decision: undefined, provenance: undefined }, prior)
            || !decisionProvenanceMatches(request.provenance.source, request.provenance, prior.binding))) {
        return fail('b2-acceptance-evidence-approval-mismatch', 'B2 取证选择须绑定当前实际待批范围。');
      }
      break;
    }
    case 'evidence-collection-dispatched': {
      const audit = evidenceAuditProjection(ledger, instance);
      const order = input.workOrder;
      const prior = state.tasks.findLast(task => !!task.evidenceWorkOrder && sameAuditBasis(task.evidenceWorkOrder.basis, order.basis));
      const b3 = b3ParentTool();
      if (!trustedBlockedRouting || !parentTool() && !b3 || !audit || audit.state !== 'collecting'
        || prior && prior.outcome !== 'rework' || (b3 ? order.parentTask.taskId !== parentTaskId || order.parentTask.roleId !== roleId
          : !implementationParent || !sameTask(order.parentTask, implementationParent.task))
        || !equal(order.basis, audit.basis) || order.task.roleId !== audit.collectorRoleId || order.task.stage !== (b3 ? 'B3' : 'A11')
        || order.task.stageAttempt !== attempt || order.task.parentTaskId !== parentTaskId
        || !order.writePaths.length || !order.writePaths.every(path => path.startsWith('docs/verification/' + flowId + '/'))
        || key !== 'evidence-collection:' + order.task.taskId || state.tasks.some(task => task.taskId === order.task.taskId)) {
        return fail('evidence-collection-dispatch-stale', '取证须由当前运营按批准属主、证据写域和可核验候选派发。');
      }
      state.tasks.push({ capability: b3 ? 'b3-implement-and-accept' : 'operations-implementation', stepId, attempt, flowId, taskId: order.task.taskId,
        roleId: order.task.roleId, task: order.task, state: 'pending', bindingKey: key, evidenceWorkOrder: order,
        dispatch: { actor: 'application', flowId, runtime: instance.metadata.runtime,
          text: '应用验收取证工单。按真实来源提交原件引用和明确缺项。\n' + JSON.stringify({ ...order, requirements: audit.requirements }) } });
      break;
    }
    case 'evidence-execution-recorded': {
      const audit = evidenceAuditProjection(ledger, instance);
      const effect = binding && ledger.effect(id, 'model:' + binding.taskId);
      if (!trustedBlockedRouting || !host || !binding?.evidenceWorkOrder || binding.state !== 'pending' || !audit
        || !equal(audit.basis, input.basis) || !equal(binding.evidenceWorkOrder.basis, input.basis)
        || effect?.state !== 'succeeded' || effect.result?.result?.turnId !== input.turnId
        || key !== 'evidence-execution:' + binding.taskId + ':' + digest(input.toolCallId)) {
        return fail('evidence-execution-stale', '命令回执缺当期真实取证任务和回合。');
      }
      break;
    }
    case 'evidence-collection-recorded': {
      const audit = evidenceAuditProjection(ledger, instance);
      if (!trustedBlockedRouting || !host || !binding?.evidenceWorkOrder || !binding.report || binding.state !== 'reported'
        || binding.report.key !== input.reportKey || !audit || !sameTask(audit.collector, binding.task)
        || !sameAuditBasis(audit.basis, input.basis) || input.basis.generation !== audit.basis.generation + 1
        || key !== 'evidence-collection-recorded:' + binding.taskId + ':' + input.reportKey) {
        return fail('evidence-collection-record-stale', '证据登记缺当前真实取证回交或代次。');
      }
      break;
    }
    case 'evidence-collection-closed': {
      const audit = evidenceAuditProjection(ledger, instance);
      const collected = facts().some(row => row.fact.kind === 'capability-event'
        && row.fact.event.input.kind === 'evidence-collection-recorded'
        && sameTask(row.fact.event.input.task, input.task) && row.fact.event.input.reportKey === input.reportKey
        && equal(row.fact.event.input.basis, input.basis));
      if (!trustedBlockedRouting || !(parentTool() && implementationParent && sameTask(input.parentTask, implementationParent.task)
        || b3ParentTool() && input.parentTask.taskId === parentTaskId && input.parentTask.roleId === roleId)
        || !binding?.evidenceWorkOrder || binding.state !== 'reported' || binding.report?.key !== input.reportKey || !audit
        || !collected || !equal(audit.basis, input.basis) || (input.outcome === 'accepted' && audit.missing.length)
        || key !== 'evidence-collection-closed:' + binding.taskId + ':' + input.reportKey) {
        return fail('evidence-collection-close-invalid', '运营收口须核对当前真实回交及签发证据。');
      }
      binding.state = binding.outcome = input.outcome;
      break;
    }
    case 'evidence-audit-blocked': {
      const audit = evidenceAuditProjection(ledger, instance);
      const previous = blockedRoutingProjection(ledger, instance);
      if (!trustedBlockedRouting || (input.legacy ? !host || !['independent-assessment', 'open-environment-recovery', 'operations-environment-recovery'].includes(step.action)
        : input.observation ? !host || !previous?.evidenceAuditKey || !!previous.decision && previous.decision.option !== 'wait'
          || !sameTask(previous.origin.task, input.scope.origin.task) : !parentTool() && !b3ParentTool())
        || !input.missing.length || input.scope.origin.entry !== instance.entry
        || input.scope.governanceDigest !== scopeGovernanceDigest(instance)
        || input.scope.binding.generation !== input.basis.generation || !input.scope.evidenceAuditKey
        || key !== 'evidence-audit-blocked:' + input.scope.evidenceAuditKey
        || !input.legacy && (!audit || !equal({ ...audit.basis, generation: audit.basis.generation + (input.observation ? 1 : 0) }, input.basis)
          || !equal(audit.missing, input.missing))) {
        return fail('evidence-audit-blocker-stale', '证据缺项须由当期获准角色或可信宿主核对。');
      }
      break;
    }
    case 'stage-request':
      if ((workflowOwned ? !host || originId !== id || step.action !== 'observe-existing'
        || input.dispatch.actor !== 'application' : roleId !== 'chief' || input.dispatch.actor !== 'chief'
          || !modelOrigin('model:chief-intake:' + stepId + ':' + attempt))
        || !descriptor.stage || input.stage !== descriptor.stage || descriptor.actor === 'host'
        || input.workflowPath !== (input.stage.startsWith('A') ? 'A' : 'B') || !hashValid(input.requestDigest)
        || digest(input.dispatch.text) !== input.requestDigest || input.dispatch.flowId !== flowId
        || facts().some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'stage-request')) {
        return fail('stage-request-invalid', '阶段请求未绑定当前能力或真实幕僚输入。');
      }
      state.flowId = flowId;
      if (step.action === 'observe-existing') state.existingRequest = event;
      break;
    case 'task-bound': {
      const plannedRole = step.role ?? (descriptor.independent ? 'verifier' : workflowTaskRoles[step.action]);
      const expectedParent = step.action === 'governed-implementation'
        ? graphTaskId(instance.ref, 'convener', stepId, attempt) : id;
      const workflowBinding = host && !!plannedRole && originId === input.task.taskId
        && input.task.taskId === graphTaskId(instance.ref, input.task.roleId, stepId, attempt)
        && input.task.parentTaskId === expectedParent && input.task.executionAttempt === 1
        && input.dispatch.actor === 'application' && (descriptor.independent && plannedRole === 'independent-reviewer' || plannedRole === 'module-owner'
          || plannedRole === input.task.roleId)
        && !state.tasks.some(task => task.stepId === stepId && task.attempt === attempt);
      if (productDirect(step.action)
        || (step.action === 'product-prepare' || step.action === 'author-intent')
          && facts().some(item => item.fact.kind === 'capability-event'
            && (item.fact.event.input.kind === 'product-intake-recovery' || item.fact.event.input.kind === 'product-intent-recovery'))
        || (workflowOwned ? !workflowBinding : !actor || input.dispatch.actor !== roleId
          || (descriptor.actor === 'convener' && (!parentTaskId || parentTaskId !== input.task.parentTaskId || !modelOrigin('model:' + parentTaskId)
            || !facts().some(item => item.receipt.state === 'consumed' && item.fact.kind === 'capability-event'
              && item.fact.event.input.kind === 'stage-request')))
          || (descriptor.actor === 'chief' && (input.task.parentTaskId !== originId || !modelOrigin('model:chief-intake:' + stepId + ':' + attempt))))
        || input.task.stage !== descriptor.stage || input.task.stageAttempt !== attempt || input.task.executionAttempt < 1
        || ![input.task.taskId, input.task.roleId, input.task.parentTaskId].every(validKey)
        || state.tasks.some(item => item.taskId === input.task.taskId)
        || input.dispatch.flowId !== flowId) {
        return fail('capability-task-invalid', '生产或验收任务缺少当前实际父请求及角色绑定。');
      }
      const expectedRole = step.action === 'product-prepare' || step.action === 'author-intent' ? 'product'
        : step.action === 'planning-prepare' || step.action === 'author-proposal' ? 'rapporteur'
          : step.action === 'personnel-prepare' || step.action === 'activate-roles' ? 'nominator' : undefined;
      if (expectedRole && input.task.roleId !== expectedRole) return fail('capability-task-role-invalid', '目标角色不符合注册能力。');
      if (descriptor.independent && (input.task.roleId === roleId || ['chief', 'product', 'rapporteur', 'convener', 'nominator'].includes(input.task.roleId))) {
        return fail('capability-task-role-invalid', '验收任务须绑定独立验收角色。');
      }
      if (descriptor.independent && input.reviewWritePath !== undefined) {
        const suffix = step.action === 'independent-standard' ? 'criteria' : 'report';
        if (!new RegExp('^docs/quality/' + flowId + '-' + suffix + '-v[1-9][0-9]*\\.md$').test(input.reviewWritePath))
          return fail('capability-review-path-invalid', '独立验收必须绑定本流程的规范证据路径。');
      }
      if (descriptor.independent && facts().some(row => row.fact.kind === 'capability-event'
        && row.fact.event.input.kind === 'review-preflight-failed')) return fail('workflow-review-preflight-invalid', '本次验收派发已因前检失败停止。');
      if (step.action === 'governed-implementation' && (!state.writeSets?.some(set => set.roleId === input.task.roleId
        && input.modulePaths?.every(path => set.paths.some(base => path === base || base.endsWith('/') && path.startsWith(base))))
        || !input.modulePaths?.length)) return fail('capability-write-set-invalid', '实施派发不在任命及计划写集中。');
      state.flowId ??= flowId;
      const configuration = evidenceAuditConfiguration(instance);
      const verification = (blockedRoutingEnabled(instance) || !!configuration) && step.action === 'independent-standard';
      if (verification ? !host || !trustedBlockedRouting || !verificationCapabilitiesValid(input.verificationCapabilities, !!configuration) || input.verificationCapabilities.stage !== 'A12a'
        : input.verificationCapabilities !== undefined) return fail('verification-capabilities-invalid', '验收能力须由当前应用实际核对。');
      const bound: DurablePendingTask = { ...recordBinding(event, step.action, input.task), bindingKey: event.key, baselineOid: instance.baseline?.oid };
      if (step.action === 'author-proposal') {
        bound.dispatch = { ...bound.dispatch, text: bound.dispatch.text
          + '\n如已确认意图要求 A6 定案，正式提案 YAML 前置区必须含 decisionFields 数组。每项包含 id、label、required、options（由 value、label 组成），可声明集合内的 defaultValue。须完整覆盖意图要求的标识与固定值，保留标识大小写，条件性要求照已确认正文处理。'
          + (configuration ? '\n候选名单应提议独立项目角色 ' + configuration.collectorRoleId
            + '（验收取证）。模块清单与名单中使用 acceptance-evidence、category: evidence，唯一属主为该角色，唯一路径 docs/verification/'
            + flowId + '/。该角色只按应用工单收集和回交原件与索引。' : '') };
      }
      if (verification) {
        bound.dispatch = { ...bound.dispatch, text: bound.dispatch.text + '\n本次 A12a 的应用实际验收能力：'
          + JSON.stringify(input.verificationCapabilities) + (configuration
            ? '\n签发 final ans-criteria，文件 YAML 前置区写 verificationRequirements。A11 保留获批 workItemId；A12b 每条写 id、stage、capability、evidence、behavior、source。静态候选文件用 module-inspection + [file] + candidate-file 与 paths；提交用 governed-commit + [git-commit] + candidate-commit；命令观察用 module-shell + [command-receipt] + task-command 与准确 command；实际构建用 approved-build + [command-receipt,file] + task-command、command、paths；真实外部实跑用 external-execution + [execution-session] + external-session。无法核证来源时保留真实标准和缺项。质检仅审计。'
            : '\n签发 final ans-criteria。文件 YAML 前置区写 verificationRequirements 数组，覆盖每个实际条目的 id，给出 stage（A11 或 A12b）、capability、evidence 数组。A11 项填写实际 workItemId；模块运行需要 command-receipt，可指定工作项中的准确命令 argv。每个 P0 都需要 A12b 的独立检查实际职责。核对旧冻结所需证据已实际存在。') };
      } else if (step.action === 'independent-assessment' && configuration) {
        const audit = evidenceAuditProjection(ledger, instance);
        if (!audit || audit.state !== 'ready') return fail('evidence-audit-dispatch-held', '独立审计需已收口的同候选实际证据。');
        bound.evidenceAuditGeneration = audit.basis.generation;
        bound.dispatch = { ...bound.dispatch, text: bound.dispatch.text + '\n完成只读审计。以下证据是已登记的当期候选、代次和签发内容。'
          + JSON.stringify({ basis: audit.basis, requirements: audit.requirements, records: audit.records })
          + '\n按每项实际来源和限制出具结论。规范报告写 verifiedCriteria；submit_report 的 evidence 逐条列 JSON {"requirementId":"AC-1","evidenceIds":["实际证据 ID"]}。运行、预览和取证写入不属于该任务。' };
      } else if (step.action === 'independent-assessment' && blockedRoutingEnabled(instance)) {
        const plan = currentVerificationPlan(ledger, instance);
        if (!plan) return fail('verification-standard-unavailable', '独立验收缺当前签发的能力标准。');
        bound.dispatch = { ...bound.dispatch, text: bound.dispatch.text + '\n本次签发的独立验收要求：'
          + JSON.stringify(plan.requirements.filter(item => item.stage === 'A12b'))
          + '\n正式报告 YAML 前置区写 verifiedCriteria，列出依实际证据完成的 A12b 条目编号。通过时须逐项完成。' };
      }
      const approved = currentProposalDecision(ledger, instance);
      if (approved && (input.task.stage === 'A11' || input.task.stage === 'A12a' || input.task.stage === 'A12b')
        && step.action !== 'operations-environment-recovery') {
        bound.dispatch = { ...bound.dispatch, text: bound.dispatch.text + proposalDecisionTaskText(approved, input.task.stage) };
      }
      if (step.action === 'operations-environment-recovery') bound.environmentRecovery = 'parent';
      state.tasks.push(bound);
      break;
    }
    case 'environment-missing': {
      const missing = input.missing;
      const assessed = state.tasks.find(task => sameTask(task.task, missing.basis.assessmentTask));
      if (!trustedEnvironment || !host || !recoveryBudget(instance, stepId) || !validMissingEvidence(missing)
        || !equal(assessmentBasis(instance), missing.basis) || !assessed || assessed.outcome) {
        return fail('environment-missing-unverified', '缺项未绑定当前候选、标准和独立验收任务。');
      }
      if (missing.origin === 'preflight') {
        if (instance.engine !== 'healthy' || assessed.state !== 'pending' || assessed.report
          || ledger.effects(id).some(effect => sameTask(effect.intent.task, assessed.task))) {
          return fail('environment-preflight-assessment-started', '本次验收已有派发、运行作用或回交，须使用正式验收回交。');
        }
        assessed.outcome = 'rejected';
        assessed.state = 'rejected';
        break;
      }
      const report = runtimeReportFromEvidence(ledger, instance, missing.report);
      const sent = ledger.effect(id, 'model:' + assessed.taskId);
      const checks = ledger.effects(id).filter(effect => effect.intent.kind === 'acceptance-check-command'
        && sameTask(effect.intent.task, assessed.task) && (liveEffect(effect.state)
          || effect.result?.result?.script === missing.condition.script));
      const agrees = checks.some(effect => effect.state === 'succeeded' && effect.result?.result?.receiptId === missing.commandReceiptId
        && effect.result?.result?.missingExecutable === missing.condition.executable);
      const unresolvedOrIncompatible = checks.some(effect => effect.state !== 'succeeded' || effect.result?.result?.decision !== 'allowed'
        || effect.result?.result?.turnId !== missing.originId || !/^[1-9][0-9]*$/.test(String(effect.result?.result?.verifiedExit)));
      if (assessed.report && !equal(assessed.report, { key: missing.reportKey, evidence: missing.report })
        || !report || report.origin !== 'submitted-report' || report.status !== 'blocked'
        || report.taskId !== assessed.taskId || report.source?.roleId !== assessed.roleId
        || report.source.turnId !== missing.originId || missing.reportKey !== 'report:' + report.reportId
        || sent?.state !== 'succeeded' || sent.intent.kind !== 'model-send' || !sameTask(sent.intent.task, assessed.task)
        || sent.result?.result?.turnId !== missing.originId || sent.intent.expected?.runtime !== report.source.runtime
        || (checks.length > 0 || missing.commandReceiptId) && (!agrees || unresolvedOrIncompatible)) {
        return fail('environment-missing-unverified', '缺项未绑定当前候选、标准、质检回交和已有应用命令回执。');
      }
      assessed.report = { key: missing.reportKey, evidence: missing.report };
      assessed.outcome = 'rejected';
      assessed.state = 'rejected';
      break;
    }
    case 'environment-recovery-dispatch': {
      const dispatch = input.dispatch;
      const { parent, child } = recoveryTasks(instance);
      const missing = recoveryMissing(ledger, instance)?.missing;
      const sent = parent && ledger.effect(id, 'model:' + parent.taskId);
      if (!trustedEnvironment || !trustedLiveSource || step.action !== 'operations-environment-recovery'
        || roleId !== 'convener' || !parent || parent.outcome || parent.report || child || !missing
        || !sameTask(parent.task, dispatch.parentTask) || parentTaskId !== parent.taskId || originId !== dispatch.originId
        || !validKey(dispatch.requestId) || !recoveryOwners(instance, missing).includes(dispatch.roleId)
        || sent?.intent.kind !== 'model-send' || !sameTask(sent.intent.task, parent.task)
        || !(sent.state === 'succeeded' && sent.result?.result?.turnId === originId || sent.state === 'claimed' && !sent.result)) {
        return fail('environment-recovery-owner-invalid', '恢复子任务未绑定当前运营回合及已任命的清单属主。');
      }
      const taskId = graphTaskId(instance.ref, dispatch.roleId, stepId + ':environment-child', attempt);
      const task: DurableTaskBinding = { stage: 'A12b', stageAttempt: attempt, executionAttempt: parent.task.executionAttempt,
        parentTaskId: parent.taskId, taskId, roleId: dispatch.roleId };
      state.tasks.push({ stepId, attempt, flowId, task, taskId, roleId: task.roleId, state: 'pending',
        capability: step.action, bindingKey: key, environmentRecovery: 'child',
        dispatch: { actor: 'application', flowId, runtime: instance.metadata.runtime,
          text: '本任务仅补齐当前验收候选所需的本地 npm 依赖：' + missing.condition.executable
            + '。使用应用提供的环境恢复工具并核对结果，经 submit_report 回交真实事实。保持候选和标准，禁止修改或提交项目文件。' } });
      break;
    }
    case 'environment-recovery-settled': {
      const { parentTask, childTask, outcome, originId: closeTurn } = input.settlement;
      const { parent, child } = recoveryTasks(instance);
      const install = child && ledger.effect(id, recoveryInstallKey(child));
      const report = child?.report && runtimeReportFromEvidence(ledger, instance, child.report.evidence);
      const wake = child?.report && ledger.effect(id, 'model:environment-recovery-wake:' + child.taskId + ':' + child.report.key);
      const validClose = parent && child && wake?.intent.kind === 'model-send' && sameTask(wake.intent.task, parent.task) && closeTurn
        && (wake.state === 'succeeded' && wake.result?.result?.turnId === closeTurn || trustedLiveSource && wake.state === 'claimed' && !wake.result);
      const command = outcome.commandReceiptId;
      if (!trustedEnvironment || !host || step.action !== 'operations-environment-recovery' || !parent || parent.outcome
        || !['restored', 'retryable', 'blocked'].includes(outcome.kind)
        || !sameTask(parent.task, parentTask) || (childTask ? !sameTask(child?.task, childTask) : !!child)
        || command !== undefined && (!validKey(command) || install?.state !== 'succeeded' || install.result?.result?.commandReceiptId !== command)
        || outcome.kind !== 'blocked' && (!validClose || !command || report?.origin !== 'submitted-report'
          || report.status !== (outcome.kind === 'restored' ? 'completed' : 'blocked')
          || !child || ledger.effect(id, 'model:' + child.taskId)?.state !== 'succeeded'
          || !recoveryCommandConfirms(ledger, instance, command, child, report.source.turnId, outcome.kind))
        || outcome.kind !== 'restored' && (typeof outcome.reason !== 'string' || !outcome.reason.trim() || outcome.reason.length > 1500)) {
        return fail('environment-recovery-result-invalid', '恢复结果未对应本次父子任务、正式回交和当前安装回执。');
      }
      if (outcome.kind === 'restored' && recoveryMissing(ledger, instance)?.missing.installTarget === 'assessment-private'
        && (!install || !privateRecoveryVerificationMatches(ledger, instance, install.intent, outcome.commandReceiptId, outcome.verification))) {
        return fail('environment-recovery-verification-invalid', '专用安装位置、目录身份或完整依赖摘要未匹配本次获批回执。');
      }
      parent.state = parent.outcome = outcome.kind === 'restored' ? 'accepted' : 'rejected';
      if (child) child.state = child.outcome = parent.outcome;
      break;
    }
    case 'implementation-dispatch': {
      if (!parentTool() || !implementationParent || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.requestId)
        || key !== 'a11-dispatch:' + implementationParent.taskId + ':' + input.requestId
        || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 6000) {
        return fail('workflow-implementation-source-invalid', '实施派发须绑定当前运营父任务和实际回合。');
      }
      const routing = blockedRoutingEnabled(instance) || !!evidenceAuditConfiguration(instance);
      const repair = implementationPreparationRepair(ledger, instance);
      const matchingItems = implementationDispatchItems(ledger, instance).filter(row => row.id === input.workItemId);
      const item = matchingItems.length === 1 ? matchingItems[0] : undefined;
      if (!item || (!routing || repair) && (input.roleId !== item.roleId || input.requestedRoleId !== undefined)
        || !validKey(input.roleId) || input.requestedRoleId !== undefined && !validKey(input.requestedRoleId)
        || input.modulePaths && !equal([...input.modulePaths].sort(), [...item.paths].sort())) {
        return fail('workflow-implementation-write-set-invalid', item && blockedRoutingEnabled(instance)
          ? `当前工作项 ${item.id} 的唯一获批属主为 ${item.roleId}，阶段为 A11，写集为 ${item.paths.join('、')}。按该工单重新请求派发。`
          : '目标属主或写集超出当前已任命的工作项。');
      }
      const children = implementationChildren(instance);
      const previous = children.findLast(task => task.workItemId === item.id);
      if (children.some(task => !task.outcome || task.outcome === 'rejected') || ledger.effects(id).some(effect =>
        effect.intent.stepId === stepId && effect.intent.attempt === attempt && requiresEffectResolution(ledger, instance, effect)
        && (effect.state === 'unknown' || !sameTask(effect.intent.task, implementationParent.task)))) {
        return fail('workflow-implementation-busy', '上一写入任务或作用仍待核对。');
      }
      const validRequest = previous ? input.rework && previous.outcome === 'rework' : !!repair === input.rework;
      if (!validRequest || (previous?.task.executionAttempt ?? 0) >= 3) {
        return fail('workflow-implementation-rework-invalid', '新派发或返工与同工作项的实际状态及剩余额度不符。');
      }
      const baseOid = implementationHead(instance);
      if (!baseOid || !oidValid(baseOid)) return fail('workflow-implementation-baseline-invalid', '工作项缺已核验的任务分支基线。');
      const executionAttempt = (previous?.task.executionAttempt ?? 0) + 1;
      const taskId = graphTaskId(instance.ref, item.roleId, stepId + ':' + item.id + ':' + executionAttempt, attempt);
      const task: DurableTaskBinding = { stage: 'A11', stageAttempt: attempt, executionAttempt,
        parentTaskId: implementationParent.taskId, taskId, roleId: item.roleId };
      const approved = currentProposalDecision(ledger, instance);
      const verificationPlan = routing ? currentVerificationPlan(ledger, instance) : undefined;
      if (routing && !verificationPlan) return fail('verification-standard-unavailable', '实施工作项缺本次已签发能力标准。');
      const workOrder = verificationPlan ? implementationWorkOrder(instance, item, task, verificationPlan) : undefined;
      state.tasks.push({ ...{ task, stepId, attempt, flowId, taskId, roleId: item.roleId, baseOid },
        capability: step.action, state: 'pending', bindingKey: key, workItemId: item.id,
        ...(workOrder ? { workOrder } : {}),
        modulePaths: item.paths, dispatch: { actor: 'application', flowId, runtime: instance.metadata.runtime,
          text: (workOrder ? workOrderText(workOrder) : input.text) + (approved ? proposalDecisionTaskText(approved, 'A11') : '') } });
      break;
    }
    case 'implementation-self-test': {
      const receipt = input.receipt;
      const child = implementationChildren(instance).find(item => sameTask(item.task, receipt.task));
      const retest = currentResume?.retest && child && sameTask(child.task, currentResume.childTask) ? currentResume : undefined;
      const sent = retest ? resumedModel : child && ledger.effect(id, 'model:' + child.taskId);
      const committed = child && ledger.effects(id).find(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
        && sameTask(effect.intent.task, child.task) && effect.result?.result?.oid === receipt.candidateOid);
      if (!trustedBlockedRouting || !host || !blockedRoutingEnabled(instance) && !evidenceAuditConfiguration(instance) || step.action !== 'operations-implementation'
        || !child?.workOrder || child.report || child.outcome || !committed || !validKey(receipt.turnId) || !validKey(receipt.toolCallId)
        || key !== 'implementation-self-test:' + child.taskId + ':' + digest(receipt.toolCallId)
        || receipt.workOrderDigest !== child.workOrder.digest || !hashValid(receipt.executionDigest)
        || !child.workOrder.requirements.some(req => implementationTestMatches(req, receipt.argv))
        || (retest ? receipt.retest?.key !== retest.key || receipt.retest.standardSha256 !== retest.standard.sha256
          || !hashValid(receipt.retest.auditDigest) || receipt.executionEvidence?.sha256 !== receipt.executionDigest
          || receipt.executionEvidence.path !== 'ans-evidence/' + receipt.executionDigest
          || retest.candidateOid !== receipt.candidateOid || retest.commitEffectKey !== committed.intent.key
          || sent?.state !== 'succeeded' : receipt.retest !== undefined)
        || receipt.exitCode !== 0 || receipt.writeAuditPassed !== true || !validKey(receipt.reviewedBy)
        || sent?.intent.kind !== 'model-send' || !sameTask(sent.intent.task, child.task)
        || !(sent.state === 'claimed' || sent.state === 'succeeded' && sent.result?.result?.turnId === receipt.turnId)) {
        return fail('implementation-self-test-invalid', '模块自测缺当前实施工单、提交和实际执行回合。');
      }
      break;
    }
    case 'blocked-scope-prepared': {
      const scope = input.scope;
      const owner = state.tasks.find(task => sameTask(task.task, scope.origin.task));
      if (!trustedBlockedRouting || !host || !blockedRoutingEnabled(instance) || blockedRoutingProjection(ledger, instance)
        || !owner || owner.outcome || owner.stepId !== stepId || owner.attempt !== attempt
        || scope.origin.stepId !== stepId || scope.origin.attempt !== attempt || scope.origin.entry !== instance.entry
        || scope.governanceDigest !== scopeGovernanceDigest(instance) || scope.binding.generation !== attempt
        || owner.capability === 'independent-assessment' && ledger.effects(id).some(effect => sameTask(effect.intent.task, owner.task)
          && (effect.intent.kind === 'model-send' || effect.intent.kind === 'dispatch'))
        || key !== 'blocked-scope-prepared:' + scope.binding.requestId) {
        return fail('workflow-blocked-scope-stale', '阻塞决定未绑定当前任务与获批依据。');
      }
      break;
    }
    case 'blocked-scope-decided': {
      const scope = blockedRoutingProjection(ledger, instance);
      const decision = input.decision;
      const recovery = disposition && ledger.effect(id, a11RecoveryEffectKey(disposition.key));
      const preparation = scope?.a12bPrepareKey ? acceptancePreparationObservation(ledger, instance) : undefined;
      const preparing = preparation && acceptancePreparationEffectIdentity(ledger.effect(id, preparation.prepareKey));
      if (!trustedBlockedRouting || !host || !scope || scope.decision || scope.governanceDigest !== scopeGovernanceDigest(instance)
        || scope.a11DispositionKey && (recovery?.state === 'claimed' || recovery?.state === 'succeeded'
          && disposition?.observation.indexDigest === recovery.intent.expected?.beforeIndex)
        || preparation && (!equal(preparing, preparation.effect) || preparing?.state === 'claimed'
          || decision.option === 'rework' && (!preparation.rework || preparing?.state === 'unknown'))
        || decision.option === 'rework' && !preparation
        || key !== 'blocked-scope-decided:' + decision.requestId || decision.requestId !== scope.binding.requestId
        || decision.generation !== scope.binding.generation || decision.digest !== scope.binding.digest
        || !scope.options.some(option => option.id === decision.option)
        || !decisionProvenanceMatches(decision.provenance.source, decision.provenance, scope.binding)) {
        return fail('workflow-blocked-scope-stale', '决定未匹配当前卡、可行选项及真实授权。');
      }
      break;
    }
    case 'acceptance-preparation-observed': {
      const next = input.observation;
      const workspace = acceptanceWorkspaceProjection(ledger, instance);
      const prior = workspace?.preparation;
      const scope = blockedRoutingProjection(ledger, instance);
      if (!trustedBlockedRouting || !host || !acceptancePreparationEnabled(instance) || !workspace
        || workspace.prepareKey !== next.prepareKey || !equal(workspace.basis, next.basis)
        || next.entry !== instance.entry || next.generation !== (prior?.generation ?? 0) + 1
        || next.governanceDigest !== scopeGovernanceDigest(instance)
        || !equal(next.effect, acceptancePreparationEffectIdentity(ledger.effect(id, next.prepareKey)))
        || ['stop', 'rework'].includes(scope?.decision?.option ?? '')
        || key !== 'acceptance-preparation-observed:' + next.prepareKey + ':' + next.generation
        || next.result.kind === 'prepared' && (!workspace.binding || next.effect?.state !== 'succeeded'
          || next.result.receiptId !== next.effect.receiptId)
        || next.confirmation && (!prior || !isPreparationBlocker(next.result) || next.digest !== prior.digest)
        || next.rework && next.result.kind !== 'candidate-defect') {
        return fail('acceptance-preparation-observation-stale', '准备结果、当期候选或处置已变化。');
      }
      break;
    }
    case 'a11-disposition-updated':
    case 'a11-disposition-resumed': {
      const next = input.disposition;
      const child = implementationChildren(instance).find(item => sameTask(item.task, next.childTask));
      const recovery = ledger.effect(id, a11RecoveryEffectKey(next.key));
      const scope = blockedRoutingProjection(ledger, instance);
      const resume = input.kind === 'a11-disposition-resumed';
      const sameChild = disposition && sameTask(disposition.childTask, next.childTask);
      const sameExhaustedRetest = sameChild && disposition?.retest && disposition.resumeExhausted && equal(disposition.childReport, next.childReport);
      if (!trustedBlockedRouting || !host || !blockedRoutingEnabled(instance) || !implementationParent || !child
        || (!sameExhaustedRetest && (child.state !== 'reported' || !child.report || !equal(next.childReport, child.report)))
        || !sameTask(implementationParent.task, next.parentTask) || implementationParent.outcome
        || next.entry !== instance.entry || next.governanceDigest !== scopeGovernanceDigest(instance)
        || next.workOrderDigest !== child.workOrder?.digest
        || recovery?.state === 'claimed' || scope?.decision?.option === 'stop'
        || key !== input.kind + ':' + next.key + ':' + next.generation
        || (sameChild ? disposition.state !== 'parked' || next.key !== disposition.key || next.generation !== disposition.generation + 1
          : next.generation !== 1 || scope !== undefined)
        || (resume ? !sameChild || next.state !== 'resumed' || next.standardState !== 'verified' : next.state !== 'parked')) {
        return fail('workflow-a11-disposition-stale', '原挂起、回交或治理依据已变化。');
      }
      if (resume) {
        for (const task of next.retest?.reportReviewGeneration ? [implementationParent] : [child, implementationParent]) {
          const prior = task.report && ledger.fact(id, task.report.key);
          if (prior?.receipt.state === 'pending') consume(ledger, id, prior);
          delete task.report;
          delete task.aggregate;
          task.state = 'pending';
        }
        if (instance.businessReason === '实际作用结果待核对：a11-index-recovery') delete instance.businessReason;
      }
      break;
    }
    case 'a11-retest-observed': {
      const next = input.disposition;
      const child = implementationChildren(instance).find(item => sameTask(item.task, next.childTask));
      if (!trustedBlockedRouting || !host || !currentResume?.retest || !next.retest || !child || child.outcome
        || currentResume.key !== next.key || !sameTask(currentResume.childTask, next.childTask)
        || currentResume.workOrderDigest !== next.workOrderDigest || scopeGovernanceDigest(instance) !== next.governanceDigest
        || next.generation !== currentResume.generation + 1
        || key !== input.kind + ':' + next.key + ':' + next.generation
        || (next.state === 'parked' ? !next.retest.blocker || !next.resumeExhausted && !!resumedModel && resumedModel.state !== 'not-started'
          : !next.retest.failure)) {
        return fail('workflow-a11-disposition-stale', '同候选补测回合或依据已变化。');
      }
      if (next.state === 'parked' && !next.resumeExhausted) {
        child.report = currentResume.childReport;
        child.state = 'reported';
        if (implementationParent && currentResume.parentReport) {
          implementationParent.report = currentResume.parentReport;
          implementationParent.state = 'reported';
        }
      }
      break;
    }
    case 'blocked-scope-resumed': {
      const scope = blockedRoutingProjection(ledger, instance);
      if (!trustedBlockedRouting || !host || !scope?.decision || scope.decision.option === 'stop'
        || scope.governanceDigest !== scopeGovernanceDigest(instance) || input.requestId !== scope.binding.requestId
        || key !== 'blocked-scope-resumed:' + input.requestId) return fail('workflow-blocked-scope-stale', '恢复未匹配当前实际决定。');
      if (scope.evidenceAuditKey) {
        if (input.evidenceAction !== scope.decision.option) return fail('workflow-blocked-scope-stale', '证据处置与已批准选择不符。');
        if (input.evidenceAction === 'route' && scope.evidenceRoute && equal(input.evidence, scope.document)) {
          const audit = evidenceAuditProjection(ledger, instance);
          const child = audit?.collector && state.tasks.find(task => sameTask(task.task, audit.collector!));
          if (!child || !child.report || !child.evidenceWorkOrder || child.outcome === 'accepted')
            return fail('workflow-blocked-scope-stale', '换路须接在当前取证任务的正式缺项之后。');
          child.state = child.outcome = 'rework';
          break;
        }
        const revision = currentDocumentRevision(instance);
        if (input.evidenceAction === 'compromise' && scope.evidenceCompromise && revision?.status === 'resumed'
          && revision.origin.taskId === scope.origin.task.taskId && equal(revision.candidate, input.evidence)) {
          const previous = state.tasks.findLast(task => task.evidenceWorkOrder && equal(task.evidenceWorkOrder.basis.standard, scope.document)
            && sameTask(task.evidenceWorkOrder.parentTask, scope.origin.task));
          if (previous && previous.state === 'reported') previous.state = previous.outcome = 'rework';
          break;
        }
        return fail('workflow-blocked-scope-stale', '证据处置缺受信路线或正式修订结算。');
      }
      if (scope.decision.option === 'wait') {
        const report = state.tasks.find(task => sameTask(task.task, scope.origin.task));
        if (!report || !equal(input.evidence, scope.document) || !verificationCapabilitiesValid(input.verificationCapabilities)
          || input.verificationCapabilities.stage !== report.task.stage
          || !input.verificationCapabilities.status.some(row => row.capability === scope.capability && row.status === 'available')) {
          return fail('workflow-blocked-scope-unresolved', '原能力未实际恢复。');
        }
        if (report.task.stage === 'A12a') {
          const author = report.report && runtimeReportFromEvidence(ledger, instance, report.report.evidence);
          if (author?.status === 'blocked') {
            report.state = report.outcome = 'rework';
          } else {
            report.verificationCapabilities = input.verificationCapabilities;
          }
        }
      }
      break;
    }
    case 'review-preflight-failed':
      if (!host || originId !== id || !descriptor.independent || !validKey(input.roleId)
        || key !== 'review-preflight:' + stepId + ':' + attempt || !input.reason.trim() || input.reason.length > 1500
        || state.tasks.some(task => task.stepId === stepId && task.attempt === attempt)) {
        return fail('workflow-review-preflight-invalid', '验收前检异常未绑定当前未派发步骤。');
      }
      break;
    case 'product-intake-recovery':
    case 'product-intent-recovery': {
      const target = directProducts[input.kind === 'product-intake-recovery' ? 'product-prepare-direct' : 'author-intent-direct'];
      const report = runtimeReportFromEvidence(ledger, instance, input.evidence);
      const taskId = graphTaskId(instance.ref, 'convener', stepId, attempt);
      const effect = ledger.effect(id, 'model:' + taskId);
      const request = facts().find(item => item.receipt.state === 'consumed' && item.fact.kind === 'capability-event'
        && item.fact.event.input.kind === 'stage-request')?.fact;
      if (step.action !== target.legacy || !instance.metadata.summary?.trim() || roleId !== 'convener' || parentTaskId !== taskId
        || key !== target.key + ':' + stepId + ':' + attempt || report?.origin !== 'submitted-report' || report.status !== 'blocked'
        || report.taskId !== taskId || report.source?.roleId !== roleId || report.source.turnId !== originId
        || request?.kind !== 'capability-event' || request.event.flowId !== flowId
        || state.tasks.some(task => task.stepId === stepId && task.attempt === attempt)
        || effect?.state !== 'succeeded' || effect.intent.kind !== 'model-send' || effect.intent.stepId !== stepId
        || effect.intent.attempt !== attempt || effect.intent.expected?.roleId !== roleId
        || effect.intent.expected.runtime !== report.source.runtime || effect.result?.result?.turnId !== originId
        || !sameTask(effect.intent.task, {
          stage: target.stage, stageAttempt: attempt, executionAttempt: 1, parentTaskId: request.event.source.originId, taskId, roleId,
        })) {
        return fail(target.key + '-unverified', '现有产品步骤未证明原运营回合明确阻塞且子任务未登记。');
      }
      break;
    }
    case 'product-dispatch-failed':
    case 'task-dispatch-failed': {
      const sent = binding && ledger.effect(id, 'model:' + binding.taskId);
      const allowed = input.kind === 'task-dispatch-failed' ? workflowOwned && binding?.dispatch.actor === 'application'
        : binding?.capability === 'author-intent-direct';
      if (!binding || !allowed || binding.state !== 'pending' || roleId !== 'host'
        || originId !== binding.taskId || parentTaskId !== binding.taskId || key !== input.kind + ':' + binding.taskId
        || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 1024
        || sent && sent.state !== 'not-started') {
        return fail('product-dispatch-failure-unverified', '产品发送失败未绑定尚未开始的直接派发。');
      }
      binding.outcome = 'rejected';
      binding.state = 'rejected';
      break;
    }
    case 'task-report': {
      if (!binding || binding.roleId !== roleId || binding.report || !hashValid(input.evidence.sha256)) {
        return fail('capability-report-invalid', '报告未绑定原生产或验收任务。');
      }
      const operationKey = 'model:' + binding.taskId;
      if (productDirect(binding.capability) || workflowOwned) {
        const report = runtimeReportFromEvidence(ledger, instance, input.evidence);
        const controller = binding === implementationParent;
        const effect = controller ? parentEffect() : resumedChild ? resumedModel : ledger.effect(id, operationKey);
        const effectTurnId = effect?.result?.result?.turnId;
        if (!report || key !== 'report:' + report.reportId || parentTaskId !== binding.taskId
          || report.taskId !== binding.taskId || report.source?.roleId !== roleId || report.source.turnId !== originId
          || effect?.intent.kind !== 'model-send' || !sameTask(effect.intent.task, binding.task)
          || effect.intent.stepId !== stepId || effect.intent.attempt !== attempt
          || effect.intent.expected?.roleId !== roleId || effect.intent.expected.runtime !== report.source.runtime
          || effect.state === 'not-started' || (effectTurnId !== undefined ? effectTurnId !== originId : !liveEffect(effect.state))) {
          return fail('capability-report-invalid', '产品报告未绑定当前真实派发及原模型回合。');
        }
        if (binding.capability === 'independent-assessment' && evidenceAuditConfiguration(instance)) {
          const audit = evidenceAuditProjection(ledger, instance);
          if (!audit || audit.state !== 'ready' || input.evidenceAuditGeneration !== audit.basis.generation
            || effect.intent.expected?.evidenceAuditGeneration !== String(audit.basis.generation)
            || report.origin !== 'submitted-report' || !auditReportCovers(report, audit)) {
            return fail('evidence-audit-verdict-invalid', '正式结论须审计同代证据并逐条列明实际证据 ID。');
          }
        }
        if (resumedChild ? !trustedLiveSource || input.recoveryKey !== currentResume?.key || effect.state !== 'succeeded'
          || report.status === 'completed' && report.origin !== 'submitted-report'
          : input.recoveryKey !== undefined) {
          return fail('workflow-a11-resume-report-invalid', '恢复回交须由原属主从绑定的新回合正式提交。');
        }
        if (controller) {
          if (report.origin !== 'submitted-report' || effect.state !== 'succeeded')
            return fail('workflow-implementation-intermediate', '运营派工回合结束，继续等待已派子任务。');
          if (disposition?.state === 'parked' && report.status !== 'blocked') {
            return fail('workflow-blocked-scope-parked', '原挂起仅保留本次阻塞报告。');
          }
          if (report.status === 'completed') {
            if (evidenceAuditConfiguration(instance) && evidenceAuditProjection(ledger, instance)?.state !== 'ready') {
              return fail('evidence-audit-collection-pending', '请先由运营收口当前候选的正式取证。');
            }
            const aggregate = implementationAggregate(ledger, instance);
            const summary = [report.summary.text, ...(report.evidence ?? []).map(item => item.text)].join('\n');
            if (!aggregate || !aggregate.entries.every(row => summary.includes(row.taskId)
              && summary.includes(row.commitOid)) || !summary.includes(aggregate.tipOid)) {
              return fail('workflow-implementation-summary-incomplete', '运营汇总需列出全部获准子任务与实际提交。');
            }
            binding.aggregate = aggregate;
          }
        }
      } else if (!modelOrigin(operationKey)) {
        return fail('capability-report-invalid', '报告未绑定原生产或验收任务。');
      }
      binding.report = { key, evidence: input.evidence };
      binding.state = 'reported';
      if (resumedChild && currentResume) {
        const report = runtimeReportFromEvidence(ledger, instance, input.evidence);
        const missing = currentResume.retest && report
          ? retestMissing(ledger, instance, binding, currentResume, report) : undefined;
        const defect = currentResume.retest?.failure;
        const defectReported = defect?.assertionFailure && report?.origin === 'submitted-report' && report.status !== 'completed'
          && report.source.turnId === defect.turnId && citesImplementationTest(reportText(report), defect.toolCallId);
        if (!defectReported && (report?.status !== 'completed' || missing?.length)) {
          const disposition = { ...currentResume, state: 'parked' as const, resumeExhausted: true as const,
            generation: currentResume.generation + 1, childReport: currentResume.retest ? currentResume.childReport : binding.report, observation: {
              ...currentResume.observation, reason: '同一工作项的恢复回合未正式完成：' + (report?.status ?? '未报告'),
            }, ...(currentResume.retest ? { retest: { ...currentResume.retest,
              missingRequirements: missing?.length ? missing : currentResume.retest.missingRequirements,
              blocker: currentResume.retest.blocker ?? '本轮正式回交未提供齐备且可核对的当期自测回执。' } } : {}) };
          const kind = currentResume.retest ? 'a11-retest-observed' as const : 'a11-disposition-updated' as const;
          const parkedKey = kind + ':' + disposition.key + ':' + disposition.generation;
          const parked = { key: parkedKey, stepId, attempt, flowId, source: { roleId: 'host', originId: id, parentTaskId: id },
            input: { kind, disposition } };
          ledger.saveFact(id, storedFact({ key: parkedKey, stepId, attempt, kind: 'capability-event', source: 'host', event: parked },
            { key: parkedKey, state: 'pending' }));
        }
      }
      break;
    }
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
      if (!binding || binding.environmentRecovery || binding.outcome || binding.report?.key !== input.reportKey
        || (step.action === 'operations-implementation' ? !binding.workItemId || !parentTool()
          || binding.task.parentTaskId !== implementationParent?.taskId
          || ledger.effect(id, 'model:' + binding.taskId)?.state !== 'succeeded'
          : workflowOwned ? !host || originId !== binding.taskId
          || ledger.effect(id, 'model:' + binding.taskId)?.state !== 'succeeded'
          : !actor || !modelOrigin('model:graph-report:' + binding.taskId + ':' + input.reportKey))
        || !['accepted', 'rework', 'rejected'].includes(input.outcome)
        || input.documents?.some(ref => !evidencePath(ref))) {
        return fail('capability-close-invalid', '收口对象、任务创建者或报告证据不匹配。');
      }
      if (step.action === 'operations-implementation') {
        if (disposition?.retest && disposition.state === 'parked' && sameTask(binding.task, disposition.childTask))
          return fail('workflow-blocked-scope-parked', '本工作项已挂起，等待补测或原授权处置。');
        const report = runtimeReportFromEvidence(ledger, instance, binding.report.evidence);
        const actions = ledger.effects(id).filter(effect => sameTask(effect.intent.task, binding.task));
        const commit = actions.find(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded');
        if (actions.some(effect => requiresEffectResolution(ledger, instance, effect)) || commit && commit.result?.result?.oid !== input.tipOid
          || input.tipOid && !oidValid(input.tipOid) || input.outcome === 'accepted'
          && (report?.origin !== 'submitted-report' || report.status !== 'completed' || !commit)) {
          return fail('workflow-implementation-child-unverified', '子任务报告、提交或未结算作用仍待核验。');
        }
        const originalReport = resumedChild && currentResume && runtimeReportFromEvidence(ledger, instance, currentResume.childReport.evidence);
        const inherited = !currentResume?.retest && originalReport && input.tipOid === currentResume?.candidateOid && binding.workOrder?.digest === currentResume.workOrderDigest
          && commit?.intent.key === currentResume.commitEffectKey && report?.source.turnId === resumedModel?.result?.result?.turnId
          && report?.source.turnId !== originalReport.source.turnId
          && implementationTestsSatisfied(ledger, instance, binding, originalReport.source.turnId, input.tipOid);
        if ((blockedRoutingEnabled(instance) || evidenceAuditConfiguration(instance)) && input.outcome === 'accepted') {
          if (!binding.workOrder || !input.tipOid || !report || report.taskId !== binding.taskId
            || report.source.roleId !== binding.roleId) return fail('workflow-implementation-child-unverified', '正式回交未匹配当前工单和原属主。');
          const missing = currentResume?.retest && resumedChild ? retestMissing(ledger, instance, binding, currentResume, report)
            : inherited ? [] : missingImplementationTests(ledger, instance, binding, input.tipOid, [{ turnId: report.source.turnId }]);
          if (missing.length) return { ok: false, code: 'workflow-implementation-self-test-missing', missingImplementationTests: missing,
            message: '当前提交缺获批工单要求的实际模块自测。应用按当前工单和候选核对同属主补测。\n' + implementationTestRulesText(missing) };
        }
        if (resumedChild && currentResume?.retest && input.outcome !== 'accepted') {
          const defect = currentResume.retest.failure;
          if (!defect?.assertionFailure || !report || report.origin !== 'submitted-report'
            || report.source.turnId !== defect.turnId || !citesImplementationTest(reportText(report), defect.toolCallId)
            || !input.defectNote || input.defectNote.length > 1600 || !citesImplementationTest(input.defectNote, defect.toolCallId)
            || input.defectNote.replace(defect.toolCallId, '').trim().length < 4) {
            return fail('workflow-a11-retest-defect-unverified', '本轮未记录可复核的候选代码缺陷，请按当前补测处置。');
          }
          if (binding.task.executionAttempt >= 3) {
            const blocker = '原运营已核对同候选的实际测试缺陷，原实施返工额度已用尽。';
            const disposition = { ...currentResume, state: 'parked' as const, resumeExhausted: true as const,
              generation: currentResume.generation + 1, retest: { ...currentResume.retest, blocker, defectNote: input.defectNote } };
            const kind = 'a11-retest-observed' as const;
            const parkedKey = kind + ':' + disposition.key + ':' + disposition.generation;
            const parked = { key: parkedKey, stepId, attempt, flowId, source: { roleId: 'host', originId: id, parentTaskId: id },
              input: { kind, disposition } };
            ledger.saveFact(id, storedFact({ key: parkedKey, stepId, attempt, kind: 'capability-event', source: 'host', event: parked },
              { key: parkedKey, state: 'pending' }));
            return fail('workflow-a11-implementation-rework-exhausted', blocker);
          }
        }
        if (receiptCheckOnly) return ok({ key, state: 'pending' });
        binding.commitOid = input.tipOid;
        binding.outcome = input.outcome === 'rework' && binding.task.executionAttempt >= 3 ? 'rejected' : input.outcome;
        binding.state = binding.outcome;
        break;
      }
      if (workflowOwned && input.outcome !== 'rejected') {
        const report = runtimeReportFromEvidence(ledger, instance, binding.report.evidence);
        if (report?.origin !== 'submitted-report' || report.taskId !== binding.taskId
          || (input.outcome === 'accepted' ? report.status !== 'completed' : report.status !== 'blocked' || step.action !== 'independent-assessment')) {
          return fail('capability-close-invalid', '收口结果与原角色提交的报告结论不匹配。');
        }
        if (step.action === 'independent-assessment' && (!input.tipOid || !oidValid(input.tipOid)
          || input.tipOid !== (state.proofs.implementationTip ?? state.proofs.acceptedTip))) {
          return fail('capability-review-candidate-mismatch', '独立验收未绑定本次受信候选提交。');
        }
        if (descriptor.independent && !input.documents?.some(document => {
          const suffix = step.action === 'independent-standard' ? 'criteria' : 'report';
          const expected = new RegExp('^docs/quality/' + flowId + '-' + suffix + '-v[1-9][0-9]*\\.md$');
          return expected.test(document.path) && ledger.effects(id).some(effect => effect.intent.kind === 'task-write'
            && effect.state === 'succeeded' && sameTask(effect.intent.task, input.task)
            && equal(effect.intent.expected?.paths, [document.path]) && effect.intent.expected?.contentSha256 === document.sha256);
        })) return fail('capability-independent-evidence-invalid', '独立验收文件缺少同一任务的实际写入回执。');
      }
      if (step.action === 'governed-implementation' && input.outcome === 'accepted'
        && (!input.tipOid || !ledger.effects(id).some(effect => effect.intent.kind === 'task-commit'
          && effect.state === 'succeeded' && sameTask(effect.intent.task, input.task) && effect.result?.result?.oid === input.tipOid))) {
        return fail('capability-commit-invalid', '实施收口缺少同一任务及候选的受信提交。');
      }
      if (step.action === 'activate-roles' && input.outcome === 'accepted' && (!state.expectedRoles?.length
        || !state.expectedRoles.every(role => state.activatedRoles?.includes(role)))) {
        return fail('workflow-required-roles-incomplete', '批准名单中的必需角色尚未全部激活。');
      }
      binding.outcome = input.outcome;
      binding.state = input.outcome;
      binding.documents = input.documents;
      break;
    case 'card-prepared': {
      const card = input.card;
      const expected = cardKinds[step.action as keyof typeof cardKinds];
      if (expected !== card.cardKind || roleId !== 'chief' && roleId !== 'host' || !card.documents.length
        || card.cardKind !== 'proposal' && card.decisionFields !== undefined
        || card.cardKind === 'appointment' && card.decisionProblem !== undefined
        || !validKey(card.requestId) || !Number.isSafeInteger(card.generation) || card.generation < 1
        || card.requestId !== 'dw-card:' + card.digest + ':' + card.generation
        || card.digest !== graphCardDigest(instance.ref, { ...card, stepId, attempt })
        || card.cardKind === 'appointment' && (!state.proposalRoster
          || !card.documents.some(document => equal(document, state.proposalRoster))
          || !equal([...(card.options ?? [])].sort(), [...(state.expectedRoles ?? [])].sort()))
        || state.card && (card.generation !== state.card.generation + 1 || state.card.digest === card.digest
          || facts().some(row => row.fact.kind === 'capability-event' && row.fact.event.input.kind === 'card-decided'
            && row.fact.event.input.requestId === state.card!.requestId))) {
        return fail('capability-card-invalid', '客户卡被绑定到其他能力、证据或代次。');
      }
      state.card = card;
      break;
    }
    case 'card-decided': {
      const card = state.card;
      const selected = input.selected ?? [];
      const structuredApproval = card?.cardKind === 'proposal' && !!card.decisionFields?.length && input.decision === 'approve';
      const expectedChoice = input.decision === 'approve' ? card?.cardKind === 'intent-confirm' ? 'confirm'
        : structuredApproval && input.decisionValues ? proposalDecisionChoiceId(input.decisionValues) : 'accept' : input.decision;
      if (!trustedLiveSource || !card || cardKinds[step.action as keyof typeof cardKinds] !== card.cardKind
        || card.requestId !== input.requestId || card.digest !== input.digest || card.generation !== input.generation
        || key !== 'card-decided:' + card.requestId || originId !== card.requestId
        || !decisionProvenanceMatches(input.authority, input.provenance, card)
        || input.authority === 'customer' && (roleId !== 'customer' || input.delegationRevision !== undefined)
        || input.authority === 'delegated-chief' && (roleId !== 'chief' || input.provenance?.source !== 'delegated-chief'
          || input.delegationRevision !== input.provenance.delegationRevision)
        || !['approve', 'revise', 'reject'].includes(input.decision)
        || input.decision === 'approve' && card.decisionProblem !== undefined
        || (structuredApproval ? !proposalDecisionValuesValid(card.decisionFields!, input.decisionValues)
          || !equal((card.payload?.decisionOptions as Record<string, unknown> | undefined)?.[expectedChoice], input.decisionValues)
          : input.decisionValues !== undefined)
        || facts().some(item => item.fact.kind === 'capability-event' && item.fact.event.input.kind === 'card-decided'
          && item.fact.event.input.requestId === input.requestId)
        || new Set(selected).size !== selected.length || selected.some(choice => !card.options?.includes(choice))
        || (card.cardKind === 'appointment' ? input.decision !== 'approve' || selected.length === 0
          || selected.some(role => !state.activatedRoles?.includes(role))
          : selected.length !== 1 || selected[0] !== expectedChoice)) {
        return fail('capability-card-decision-invalid', '客户裁决不匹配此能力的当前有效卡。');
      }
      if (card.cardKind === 'appointment' && input.decision === 'approve') {
        state.writeSets = state.writeSets?.filter(set => input.selected!.includes(set.roleId));
      }
      break;
    }
    case 'role-activated':
      if (roleId !== 'nominator' || step.action !== 'activate-roles' || !state.expectedRoles?.includes(input.roleId) || !validKey(input.roleId)
        || !equal(input.documents.map(document => document.path).sort(),
          ['boundary.md', 'boundary.yaml', 'role-card.md'].map(file => '角色卡/' + input.roleId + '/' + file))
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
      if (!(workflowOwned ? host && originId === id : actor) || step.action !== 'verify-stop' || !validKey(input.reportKey) ||
        !(workflowOwned || input.evidence && ledger.effect(id, 'model:stop:' + stepId + ':' + attempt)?.state === 'succeeded'
          || state.tasks.some(task => task.report?.key === input.reportKey && task.outcome))
        || ledger.effects(id).some(effect => requiresEffectResolution(ledger, instance, effect)) || state.tasks.some(task =>
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
  const fact: DurableFact = { kind: 'stage-request', source: workflowOwnsDispatch(instance) ? 'host' : 'chief', key, stepId: instance.stepId, attempt: instance.attempt,
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
  for (const item of pending) {
    if (item.fact.kind === 'document-revision' || revisionParksNode(instance) && item.fact.kind === 'effect-settled') consume(ledger, id, item);
  }
  if (revisionParksNode(instance)) return { entry: instance.entry };
  const events = pending.filter((item): item is StoredFact & { fact: Extract<DurableFact, { kind: 'capability-event' }> } =>
    item.fact.kind === 'capability-event' && (item.fact.attempt === instance.attempt
      || graph.tasks.some(task => task.capability === 'independent-standard' && task.stepId === item.fact.stepId
        && task.attempt === item.fact.attempt && task.baselineOid === instance.baseline?.oid)));
  const here = events.filter(item => item.fact.stepId === instance.stepId);
  const find = (kind: DurableCapabilityEvent['input']['kind']) => here.find(item => item.fact.event.input.kind === kind);
  const closed = find('task-closed');
  const close = closed?.fact.event.input;
  const closeEffect = action === 'independent-assessment' && close?.kind === 'task-closed' && close.outcome === 'rejected'
    ? ledger.effect(id, 'acceptance-workspace-close:' + close.task.taskId) : undefined;
  const failedClose = closeEffect?.state === 'unknown' && closeEffect.intent.kind === 'acceptance-workspace-close'
    && close?.kind === 'task-closed' && sameTask(closeEffect.intent.task, close.task) ? closeEffect : undefined;
  const workspace = action === 'independent-assessment' ? acceptanceWorkspaceProjection(ledger, instance) : undefined;
  const rejectedTask = close?.kind === 'task-closed' && close.outcome === 'rejected' && (workspace?.closeReceipt || failedClose)
    ? close.task : undefined;
  const busy = (stopKind?: 'a11-index-recovery' | 'acceptance-workspace-prepare') => Boolean(workspace?.receipt && !workspace.closeReceipt && !failedClose)
    || ledger.effects(id).some(effect => effect.intent.stepId === instance.stepId && effect.intent.attempt === instance.attempt
      && requiresEffectResolution(ledger, instance, effect) && effect.intent.key !== failedClose?.intent.key
      && !(stopKind === effect.intent.kind && effect.state === 'unknown')
      && !(rejectedTask && effect.intent.kind === 'acceptance-workspace-browser-capture' && effect.state === 'unknown'
        && sameTask(effect.intent.task, rejectedTask)));
  let outcome: string | undefined;
  let source: StoredFact | undefined;
  const baseline = find('baseline-verified');
  const operator = find('operator-report')?.fact.event.input;
  const productTask = graph.tasks.find(item => item.stepId === instance.stepId && item.attempt === instance.attempt
    && productDirect(item.capability));
  const recoveryAction = action === 'product-prepare' && find('product-intake-recovery') ? 'product-prepare-direct'
    : action === 'author-intent' && find('product-intent-recovery') ? 'author-intent-direct' : undefined;
  const directAction = productDirect(action) ? action
    : productTask && productDirect(productTask.capability) ? productTask.capability : recoveryAction;
  const workflowOwned = workflowOwnsDispatch(instance);
  const assigned = workflowOwned ? graph.tasks.find(task => task.stepId === instance.stepId && task.attempt === instance.attempt) : undefined;
  const sendFailed = find('task-dispatch-failed');
  const taskReport = assigned?.report && runtimeReportFromEvidence(ledger, instance, assigned.report.evidence);
  const deliveredReport = assigned && taskReport && ledger.effect(id, 'model:' + assigned.taskId)?.state === 'succeeded' ? taskReport : undefined;
  const preparation = preparations.includes(action as typeof preparations[number]);
  const assessmentNeedsDisposition = (action === 'independent-assessment' || action === 'independent-standard' && blockedRoutingEnabled(instance)) && deliveredReport?.status === 'blocked'
    && deliveredReport.origin === 'submitted-report' && !assigned?.outcome;
  const preflight = find('review-preflight-failed');
  const environmentMissing = find('environment-missing');
  const blocked = blockedRoutingProjection(ledger, instance);
  if (!blocked && action === 'operations-implementation' && a11DispositionProjection(ledger, instance)?.state === 'parked') {
    for (const item of pending) {
      if (item.fact.kind === 'effect-settled' || item.fact.kind === 'capability-event'
        && ['a11-disposition-updated', 'a11-retest-observed'].includes(item.fact.event.input.kind)) consume(ledger, id, item);
    }
    return { entry: instance.entry };
  }
  if (blocked?.a12bPrepareKey) {
    const decision = blocked.decision?.option;
    const preparation = acceptancePreparationObservation(ledger, instance);
    if (decision === 'rework' && preparation?.rework && !busy()) {
      source = here.find(item => item.fact.key === 'blocked-scope-decided:' + blocked.binding.requestId);
      if (!source) return { entry: instance.entry };
      graph.proofs['preparation-rework-observation'] = 'acceptance-preparation-observed:' + preparation.prepareKey + ':' + preparation.generation;
      outcome = 'rework';
    } else if (decision === 'stop' && !busy('acceptance-workspace-prepare')) {
      source = here.find(item => item.fact.key === 'blocked-scope-decided:' + blocked.binding.requestId);
      if (!source) return { entry: instance.entry };
      instance.businessReason = '已按当期准备阻塞处置停止：' + blocked.reason;
      outcome = 'blocked';
    } else {
      for (const item of pending) {
        if (item.fact.kind === 'effect-settled' || item.fact.kind === 'capability-event'
          && (item.fact.event.input.kind === 'acceptance-preparation-observed'
            || item.fact.event.input.kind === 'blocked-scope-decided' && item.fact.event.input.decision.option === 'wait')) {
          consume(ledger, id, item);
        }
      }
      return { entry: instance.entry };
    }
  } else if (blocked) {
    const renewed = blocked.resumePending && find('blocked-scope-resumed');
    if (renewed && !busy()) {
      consume(ledger, id, renewed);
      instance.attempt++;
      changeStep(instance, instance.stepId, renewed.fact.key);
      return { next: instance.stepId, entry: instance.entry };
    }
    if (blocked.decision?.option !== 'stop' || busy(blocked.a11DispositionKey ? 'a11-index-recovery' : undefined)) {
      if (blocked.a11DispositionKey) {
        for (const item of pending) {
          if (item.fact.kind === 'effect-settled' || item.fact.kind === 'capability-event'
            && ['a11-disposition-updated', 'a11-retest-observed', 'blocked-scope-decided'].includes(item.fact.event.input.kind)) consume(ledger, id, item);
        }
      }
      return { entry: instance.entry };
    }
    source = here.find(item => item.fact.key === 'blocked-scope-decided:' + blocked.binding.requestId);
    instance.businessReason = '已按当期真实处置停止：' + blocked.reason;
    outcome = step.on?.blocked ? 'blocked' : 'failure';
  } else if (action === 'independent-assessment' && step.on?.['environment-missing'] && environmentMissing && !busy()) {
    source = environmentMissing;
    outcome = 'environment-missing';
  } else if (action === 'open-environment-recovery' && !busy()) {
    const origin = recoveryMissing(ledger, instance);
    if (!origin || !step.maxVisits) throw new Error('恢复额度缺少当前冻结缺项。');
    const key = recoveryVisitsKey(origin.missing.basis);
    const visits = instance.visits[key] ?? 0;
    if (visits >= step.maxVisits) {
      const attempts = ledger.facts(id).findLast(row => row.fact.kind === 'capability-event'
        && row.fact.event.input.kind === 'environment-recovery-settled');
      const last = attempts?.fact.kind === 'capability-event' && attempts.fact.event.input.kind === 'environment-recovery-settled'
        ? attempts.fact.event.input.settlement.outcome : undefined;
      instance.businessReason = '验收环境补齐额度已用尽（' + origin.missing.condition.executable + '，候选 '
        + origin.missing.basis.candidateOid + '，已尝试 ' + visits + ' 次）'
        + (last && last.kind !== 'restored' ? '：' + last.reason : '。');
      outcome = 'limit';
    } else {
      instance.visits[key] = visits + 1;
      instance.attempt++;
      outcome = 'done';
    }
  } else if (action === 'operations-environment-recovery') {
    const settled = find('environment-recovery-settled');
    const result = settled?.fact.event.input;
    const otherLiveEffects = () => ledger.effects(id).some(effect => effect.intent.stepId === instance.stepId
      && effect.intent.attempt === instance.attempt && liveEffect(effect.state)
      && (result?.kind !== 'environment-recovery-settled' || result.settlement.outcome.kind !== 'blocked'
        || (effect.intent.kind !== 'environment-install'
          && !(effect.state === 'unknown' && ['model-send', 'dispatch', 'report-delivery'].includes(effect.intent.kind)))));
    if (settled && result?.kind === 'environment-recovery-settled' && !otherLiveEffects()) {
      source = settled;
      outcome = result.settlement.outcome.kind;
      if (result.settlement.outcome.kind === 'blocked') instance.businessReason = '验收环境补齐受阻：' + result.settlement.outcome.reason;
    } else if (sendFailed && !otherLiveEffects()) {
      source = sendFailed;
      outcome = 'blocked';
      const failure = sendFailed.fact.event.input;
      if (failure.kind === 'task-dispatch-failed') instance.businessReason = '验收环境补齐任务未送达：' + failure.reason;
    }
  } else if (preflight?.fact.event.input.kind === 'review-preflight-failed' && !busy()) {
    source = preflight;
    instance.businessReason = '独立验收派发前检未通过（' + preflight.fact.event.input.roleId + '）：' + preflight.fact.event.input.reason;
    outcome = step.on?.blocked ? 'blocked' : 'failure';
  } else if (workflowOwned && (sendFailed || assigned && !directAction && (assigned.outcome === 'rejected'
    || !assigned.outcome && deliveredReport && deliveredReport.status !== 'completed' && !assessmentNeedsDisposition)) && !busy()) {
    source = sendFailed ?? closed ?? here.find(item => item.fact.key === assigned?.report?.key);
    const failure = sendFailed?.fact.event.input;
    instance.businessReason = failure?.kind === 'task-dispatch-failed' ? '任务未送达：' + failure.reason
      : failedClose ? '验收回环预览关闭无法核验：' + failedClose.result?.evidence
        : '当前角色未完成任务：' + (deliveredReport?.summary.text.replace(/\s+/g, ' ').slice(0, 400) ?? '正式收口未通过。');
    if (assigned) {
      assigned.outcome = 'rejected';
      assigned.state = 'rejected';
    }
    outcome = step.on?.blocked ? 'blocked' : 'failure';
  } else if (directAction) {
    if (!productTask) {
      const summary = instance.metadata.summary?.trim();
      if (summary) {
        const problem = directAction === 'author-intent-direct' ? revisedIntentDecisionProblem(ledger, instance) : undefined;
        const opened = directProductTask(instance, directAction, summary, problem);
        graph.flowId = opened.flowId;
        graph.tasks.push(opened);
      } else {
        instance.businessReason = '产品任务缺少原始需求。';
        if (productDirect(action)) outcome = 'blocked';
      }
    } else if (!busy()) {
      const failed = find('product-dispatch-failed');
      const failure = failed?.fact.event.input;
      if (failure?.kind === 'product-dispatch-failed') {
        source = failed;
        instance.businessReason = '产品任务未送达：' + failure.reason;
        if (productDirect(action)) outcome = 'blocked';
      } else if (productTask.report) {
        const report = runtimeReportFromEvidence(ledger, instance, productTask.report.evidence);
        const delivery = ledger.effect(id, 'model:' + productTask.taskId);
        if (report && delivery?.state === 'succeeded' && delivery.result?.result?.turnId === report.source.turnId) {
          source = here.find(item => item.fact.key === productTask.report?.key);
          if (source) {
            const ready = report.status === 'completed';
            const clarify = directAction === 'author-intent-direct' && report.origin === 'submitted-report' && report.status === 'blocked';
            productTask.outcome = ready ? 'accepted' : 'rejected';
            productTask.state = productTask.outcome;
            outcome = productDirect(action) ? (ready ? 'ready' : clarify ? 'clarify' : 'blocked') : (ready ? 'done' : undefined);
            if (!ready) {
              const label = clarify ? '产品请求澄清' : '产品任务未完成（' + report.status + '）';
              instance.businessReason = label + '：' + report.summary.text.replace(/\s+/g, ' ').slice(0, 400);
            }
          }
        }
      }
    }
  } else if (action === 'operations-implementation') {
    const children = implementationChildren(instance);
    const rejected = children.find(child => child.outcome === 'rejected');
    if (!busy() && (rejected || assigned?.report)) {
      const aggregate = assigned?.aggregate;
      const lastAccepted = children.findLast(task => task.commitOid === aggregate?.tipOid && task.outcome === 'accepted');
      if (assigned?.report && aggregate && lastAccepted && !rejected) {
        source = here.find(item => item.fact.key === assigned.report?.key);
        if (source) {
          assigned.state = 'accepted';
          assigned.outcome = 'accepted';
          graph.proofs.implementationTip = aggregate.tipOid;
          instance.implementation = { kind: 'implementation-accepted', source: 'convener', key: source.fact.key,
            stepId: instance.stepId, attempt: instance.attempt, task: lastAccepted.task,
            reportKey: lastAccepted.report!.key, operatorReport: assigned.report.evidence };
          outcome = 'done';
        }
      } else {
        const report = assigned?.report && runtimeReportFromEvidence(ledger, instance, assigned.report.evidence);
        instance.businessReason = rejected ? '实施工作项未获接受或返工已达额度：' + rejected.workItemId
          : '运营报告实施受阻：' + (report?.summary.text.replace(/\s+/g, ' ').slice(0, 400) ?? '未提交完整汇总。');
        outcome = 'failure';
      }
    }
  } else if (workflowOwned && preparation) {
    if (assigned && deliveredReport?.status === 'completed' && !busy()) {
      assigned.outcome = 'accepted';
      assigned.state = 'accepted';
      source = here.find(item => item.fact.key === assigned.report?.key);
      outcome = 'done';
    }
  } else if (workflowOwned && action === 'independent-standard') {
    if (assigned?.outcome === 'accepted' && !busy()) {
      source = closed;
      outcome = 'done';
    }
  } else if (preparation || action === 'independent-standard') {
    source = find('task-bound');
    if (source) outcome = 'done';
  } else if (action === 'author-intent' || action === 'author-proposal' || action === 'governed-implementation') {
    if (close?.kind === 'task-closed' && close.outcome === 'accepted' && !busy()
      && (action === 'governed-implementation' ? operator?.kind === 'operator-report'
        && operator.parentTaskId === close.task.parentTaskId : workflowOwned || !!close.documents?.length)) {
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
    const decision = find('card-decided');
    const result = decision?.fact.event.input;
    if (decision && result?.kind === 'card-decided') {
      const applied = action === 'confirm-intent' && result.decision === 'approve' && decision.fact.decisionRecordedAt
        ? pending.find(row => row.fact.kind === 'intent-decision-applied' && row.fact.stepId === instance.stepId
          && row.fact.attempt === instance.attempt && row.fact.requestId === result.requestId
          && row.fact.digest === result.digest && row.fact.generation === result.generation
          && digest(stableJson(row.fact)) === row.fingerprint)
        : undefined;
      if (applied) consume(ledger, id, applied);
      if (action !== 'confirm-intent' || result.decision !== 'approve' || !decision.fact.decisionRecordedAt || applied) {
        source = decision;
        outcome = result.decision === 'approve' ? 'approved' : result.decision === 'reject' ? 'rejected' : 'revise';
      }
    }
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
      if (assigned) {
        assigned.outcome = 'accepted';
        assigned.state = 'accepted';
      }
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
    if ((directAction || workflowOwned) && item.fact.stepId === instance.stepId
      && item.fact.event.input.kind === 'task-report' && item !== source
      && !(outcome && (action === 'operations-environment-recovery' || outcome === 'environment-missing'))) continue;
    if (item === source || (item.fact.event.input.kind !== 'stage-request' || action !== 'observe-existing')
      && ['stage-request', 'task-bound', 'task-report', 'implementation-dispatch', 'environment-recovery-dispatch',
        'implementation-self-test', 'blocked-scope-prepared', 'blocked-scope-decided', 'blocked-scope-resumed', 'acceptance-preparation-observed',
        'evidence-collection-dispatched', 'evidence-collection-recorded', 'evidence-collection-closed', 'evidence-execution-recorded', 'evidence-audit-blocked',
        'a11-disposition-updated', 'a11-disposition-resumed', 'a11-retest-observed',
        'product-intake-recovery', 'product-intent-recovery', 'card-prepared', 'role-activated'].includes(item.fact.event.input.kind)
      || action === 'operations-implementation' && item.fact.event.input.kind === 'task-closed'
      || item.fact.event.input.kind === 'operator-report' && outcome === 'done'
      || item.fact.stepId !== instance.stepId && item.fact.event.input.kind === 'task-closed') consume(ledger, id, item);
  }
  if (!outcome) return { entry: instance.entry };
  const descriptor = capabilities[action];
  for (const retired of descriptor.retires ?? []) delete graph.proofs[retired];
  for (const proof of descriptor.outcomes[outcome] ?? []) graph.proofs[proof] = source?.fact.key ?? input.stepId;
  const next = outcome === 'limit' ? step.onLimit : outcome === 'failure'
    ? ('onFailure' in step ? step.onFailure : undefined) : step.on?.[outcome] ?? step.next;
  if (!next && outcome === 'failure') {
    instance.status = 'blocked';
    delete instance.actionIntent;
    instance.entry++;
    for (const item of ledger.facts(id, true)) consume(ledger, id, item, 'instance-terminal');
    return { terminal: 'blocked', entry: instance.entry };
  }
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
