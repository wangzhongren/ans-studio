import type { DurableDelivery, DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableProposalDecision, DurableReleaseRequest, DurableResult, DurableScopeDecision } from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredFact, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { activeAction, decisionProvenanceMatches, equal, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';

type FactUpdate = DurableFactReceipt & { noWrite?: true };

export function currentProposalDecision(ledger: DurableLedger, instance: StoredInstance): DurableProposalDecision | undefined {
  const key = instance.graph?.proofs['proposal-approved'];
  if (!key) return;
  const approved = ledger.fact(instance.ref.instanceId, key);
  const event = approved?.fact.kind === 'capability-event' ? approved.fact.event : undefined;
  const decision = event?.input;
  if (approved?.receipt.state !== 'consumed' || !event || !decision || decision.kind !== 'card-decided'
    || decision.decision !== 'approve' || decision.decisionValues === undefined
    || decision.requestId !== instance.graph?.approvedProposalRequestId) return;
  const prepared = ledger.fact(instance.ref.instanceId, 'card-prepared:' + decision.requestId);
  const preparation = prepared?.fact.kind === 'capability-event' ? prepared.fact.event : undefined;
  const card = preparation?.input.kind === 'card-prepared' ? preparation.input.card : undefined;
  const proposal = card?.documents.find(item => /^docs\/proposals\/[a-z0-9-]+-proposal-v[1-9][0-9]*\.md$/.test(item.path));
  if (prepared?.receipt.state !== 'consumed' || !card || !proposal || preparation?.stepId !== event.stepId
    || preparation.attempt !== event.attempt || preparation.flowId !== event.flowId || !card.decisionFields?.length
    || card.digest !== decision.digest || card.generation !== decision.generation) return;
  const { requestId, digest: cardDigest, generation, decisionValues: values, authority, provenance } = decision;
  const selectionDigest = digest(stableJson([instance.ref, requestId, cardDigest, generation, proposal, values, authority, provenance]));
  return { requestId, digest: cardDigest, generation, proposal, selectionDigest, values, authority, ...(provenance ? { provenance } : {}) };
}

export function acceptancePreparationArchitecture(ledger: DurableLedger, instance: StoredInstance) {
  const approved = currentProposalDecision(ledger, instance);
  if (!approved) return;
  const prepared = ledger.fact(instance.ref.instanceId, 'card-prepared:' + approved.requestId)?.fact;
  const card = prepared?.kind === 'capability-event' && prepared.event.input.kind === 'card-prepared' ? prepared.event.input.card : undefined;
  return card?.documents.find(document => /^docs\/contracts\/[a-z0-9-]+-architecture-v[1-9][0-9]*\.md$/.test(document.path));
}

export function proposalDecisionTaskText(approved: DurableProposalDecision, stage: 'A11' | 'A12a' | 'A12b'): string {
  const selection = '\n本项目已批准的 A6 定案（应用账本）：' + JSON.stringify({
    requestId: approved.requestId, cardDigest: approved.digest, proposalDecisionDigest: approved.selectionDigest, decisionValues: approved.values,
  });
  return stage === 'A11' ? selection + '\n按实际定案实施和核对，发现任务与获批值冲突时按原流程回交。'
    : selection + '\n在当前验收文档顶部 YAML 前置区逐项写入同一 proposalDecisionDigest 与 decisionValues。按已批值核对，发现冲突时回交实际原因。';
}

export function admitFact(ledger: DurableLedger, instance: StoredInstance, fact: DurableFact): DurableResult<FactUpdate> {
  const id = instance.ref.instanceId;
  const action = activeAction(instance);
  const atCurrentStep = fact.stepId === instance.stepId;
  const receipt: DurableFactReceipt = { key: fact.key, state: 'pending' };
  const facts = (kind: DurableFact['kind']) => ledger.facts(id).filter(item =>
    item.fact.kind === kind && item.fact.stepId === fact.stepId && item.fact.attempt === fact.attempt && item.receipt.state !== 'ignored');
  const obsolete = (reason: string): DurableResult<FactUpdate> => ok({ ...receipt, state: 'ignored', reason });
  if (instance.status !== 'waiting') return obsolete('instance-terminal');
  if (fact.attempt < instance.attempt) return obsolete('attempt-retired');
  if (fact.attempt > instance.attempt) return fail('future-attempt', '此尝试尚未开放。');

  switch (fact.kind) {
    case 'stage-request':
      if (!atCurrentStep || !validKey(fact.sourceTaskId) || !hashValid(fact.requestDigest)
        || typeof fact.dispatch?.text !== 'string' || digest(fact.dispatch.text) !== fact.requestDigest || facts(fact.kind).length) {
        return fail('stage-request-invalid', 'B1 阶段请求的来源、摘要、尝试或唯一键不匹配。');
      }
      if (workflowOwnsDispatch(instance) && instance.graph) instance.graph.flowId ??= fact.dispatch.flowId;
      break;
    case 'task-bound': {
      if (!atCurrentStep) return obsolete('step-not-active');
      if (instance.task && !sameTask(instance.task, fact.task)) return fail('task-already-bound', '当前尝试已绑定另一生产任务。');
      if (fact.modulePaths?.some(path => !safePath(path))) return fail('task-invalid', '任务模块路径无效。');
      if (action === 'b1-impact-readonly' && ((!instance.baseline && instance.definition.schema === 1) || !facts('stage-request').some(item => item.receipt.state === 'consumed')
        && instance.attempt === 1)) {
        return fail('task-prerequisite-missing', 'B1 尚缺已核对基线或阶段请求。');
      }
      if (action === 'readonly-report' && !facts('stage-request').some(item => item.receipt.state === 'consumed')) {
        return fail('task-prerequisite-missing', '只读任务缺已持久受理的阶段请求。');
      }
      if (action === 'b3-implement-and-accept') {
        const paths = instance.scope?.writeSets.find(writeSet => writeSet.roleId === fact.task.roleId)?.paths;
        if (!paths?.length || !fact.modulePaths?.length || !fact.modulePaths.every(path => paths.includes(path))) {
          return fail('task-write-set-invalid', '实现任务未绑定本次 B2 写集。');
        }
      }
      instance.task = fact.task;
      break;
    }
    case 'task-report': {
      if (!atCurrentStep || instance.task && !sameTask(instance.task, fact.task)) return obsolete('task-not-current');
      const existing = facts(fact.kind).find(item => item.fact.kind === 'task-report' && sameTask(item.fact.task, fact.task));
      if (existing) return fail('report-already-recorded', '当前生产任务已记录报告。');
      break;
    }
    case 'analysis-disposition':
    case 'implementation-close':
    case 'implementation-accepted': {
      if (!atCurrentStep || instance.task && !sameTask(instance.task, fact.task)) return obsolete('task-not-current');
      if (!validKey(fact.reportKey) || facts(fact.kind).length) return fail('task-close-invalid', '收口未绑定唯一报告，或同一任务已有处置。');
      if (fact.kind === 'analysis-disposition' && !['usable', 'needsFollowup', 'blocked'].includes(fact.outcome)) {
        return fail('analysis-disposition-invalid', 'B1 处置结果无效。');
      }
      break;
    }
    case 'operator-report':
      if ((!atCurrentStep && !(action === 'accept-b3-advance-with-b2-scope' && valueIsB1Step(instance, fact.stepId)))
        || !validKey(fact.parentTaskId) || facts(fact.kind).length
        || instance.task !== undefined && instance.task.parentTaskId !== fact.parentTaskId) {
        return fail('operator-report-invalid', '运营报告未绑定正确的阶段父任务。');
      }
      break;
    case 'b3-advance': {
      const report = instance.analysisReport;
      if (!atCurrentStep || !report || instance.scope || !instance.baseline) return fail('b2-prerequisite-missing', '当前没有可确认的 B1 报告及基线。');
      if (fact.reportKey !== report.key || fact.b1Attempt !== report.attempt || fact.baselineOid !== instance.baseline.oid
        || !validKey(fact.sourceTaskId) || !hashValid(fact.requestDigest)
        || fact.dispatch && digest(fact.dispatch.text) !== fact.requestDigest || !fact.reason.trim()) {
        return fail('b2-evidence-mismatch', 'B3 请求与本次 B1 收口或基线不一致。');
      }
      if (!equal(fact.evidenceRequirements ?? [], evidenceRequirementsFromB1(ledger, instance))) {
        return fail('b2-acceptance-evidence-mismatch', '证据要求须来自同次正式 B1 报告，并绑定本次 B2 范围。');
      }
      const evidenceDecision = b2EvidenceDecisionProjection(ledger, instance);
      if (evidenceDecision && !evidenceDecision.decision
        || !equal(fact.evidenceAuthorization, evidenceDecision?.decision === 'approve' ? evidenceDecision : undefined)) {
        return fail('b2-acceptance-evidence-approval-mismatch', '独立取证额外写域须引用本次 B2 客户实际批准。');
      }
      if (fact.candidates.length === 0 || fact.candidates.some(path => !safePath(path))
        || !['requestedEvidence', 'modulePaths'].includes(fact.candidateSource)
        || fact.candidateSource === 'modulePaths' && !equal([...fact.candidates].sort(), [...report.modulePaths].sort())) {
        return fail('b2-candidates-invalid', '候选路径缺失或与同次 B1 记载不符。');
      }
      instance.scope = fact;
      break;
    }
    case 'release-preview': {
      if (!atCurrentStep || !instance.baseline || !instance.implementation) return fail('release-prerequisite-missing', '发布缺 B3 收口或基线。');
      const snapshot = fact.snapshot;
      const commit = ledger.effects(id).filter(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
        && sameTask(effect.intent.task, instance.implementation!.task)).at(-1);
      const writeSets = instance.scope?.writeSets ?? instance.graph?.writeSets;
      const allowedFile = (path: string) => writeSets?.some(set => set.paths.some(prefix => path === prefix
        || action === 'customer-publish' && prefix.endsWith('/') && path.startsWith(prefix)));
      if (![snapshot.mainOid, snapshot.tipOid, snapshot.baselineOid].every(oidValid)
        || !hashValid(snapshot.diffDigest) || snapshot.branch !== instance.baseline.branch || snapshot.baselineOid !== instance.baseline.oid
        || snapshot.tipOid !== commit?.result?.result?.oid
        || snapshot.b3CloseKey !== instance.implementation.key || !equal(snapshot.operatorReport, instance.implementation.operatorReport)
        || !snapshot.files.length || snapshot.files.some(file => !safePath(file) || !allowedFile(file))
        || action === 'customer-publish' && (!instance.graph?.acceptanceArchive
          || !equal(instance.graph.acceptanceArchive, snapshot.acceptanceArchive))) {
        return fail('release-preview-invalid', '预览未绑定已确认的 B3、基线及有效改动。');
      }
      const snapshotDigest = digest(stableJson({ ref: instance.ref, attempt: fact.attempt, snapshot }));
      const previous = instance.release;
      if (previous?.digest === snapshotDigest) return ok({ ...receipt, state: 'consumed', release: previous, noWrite: true });
      if (previous?.decision?.action === 'reject' || ledger.effects(id).some(effect => effect.intent.kind === 'release-merge'
        && (liveEffect(effect.state) || effect.state === 'succeeded'))) {
        return fail('release-reconciliation-required', '已有合并已发生或结果待核对，不能替换发布请求。');
      }
      const logicalKey = previous?.logicalKey ?? 'release:' + id;
      const generation = (previous?.generation ?? 0) + 1;
      const releaseId = 'rel-' + digest(stableJson([logicalKey, snapshotDigest, generation])).slice(0, 24);
      const release: DurableReleaseRequest = { logicalKey, releaseId, requestId: releaseId + '-decision', digest: snapshotDigest, generation, snapshot };
      instance.release = release;
      receipt.release = release;
      break;
    }
    case 'release-decision': {
      const release = instance.release;
      if (!atCurrentStep || !release || fact.requestId !== release.requestId || fact.digest !== release.digest || fact.generation !== release.generation) {
        return fail('release-decision-stale', '客户决定未对应当前有效的发布预览。');
      }
      if (!['approve', 'reject'].includes(fact.action)) return fail('release-decision-invalid', '客户决定必须批准或拒绝。');
      if (release.decision) {
        if (release.decision.action !== fact.action || release.decision.source !== fact.source
          || !equal(release.decision.provenance ?? { source: release.decision.source }, fact.provenance ?? { source: fact.source })) {
          return fail('release-decision-conflict', '此发布请求已提交其他决定。');
        }
        const existing = ledger.fact(id, release.decision.id);
        return ok({ ...receipt, ...existing?.receipt, release, noWrite: true });
      }
      release.decision = { id: fact.key, action: fact.action, at: new Date().toISOString(), source: fact.source,
        ...(fact.provenance ? { provenance: fact.provenance } : {}) };
      receipt.release = release;
      break;
    }
    case 'release-merged': {
      const effect = ledger.effect(id, fact.effectKey);
      if (!atCurrentStep || !fact.closed || !oidValid(fact.mainOid) || instance.release?.requestId !== fact.requestId
        || instance.release.decision?.action !== 'approve' || effect?.intent.kind !== 'release-merge'
        || effect.state !== 'succeeded' || effect.intent.requestId !== fact.requestId || effect.result?.result?.mainOid !== fact.mainOid) {
        return fail('release-result-invalid', '合并关闭必须匹配可信审批和实际 Git 回执。');
      }
      if (facts(fact.kind).length) return fail('release-already-recorded', '当前发布已记录唯一合并。');
      break;
    }
    case 'readonly-review':
      if (!validKey(fact.reportKey) || !['accepted', 'blocked'].includes(fact.outcome)
        || instance.readonlyReportKey !== undefined && fact.reportKey !== instance.readonlyReportKey || facts(fact.kind).length) {
        return fail('report-review-invalid', '审阅须绑定本次只读报告。');
      }
      break;
  }
  return ok(receipt);
}

function valueIsB1Step(instance: StoredInstance, stepId: string): boolean {
  const step = instance.definition.steps[stepId];
  return step !== undefined && 'action' in step && step.action === 'b1-impact-readonly';
}

export function storedFact(fact: DurableFact, receipt: DurableFactReceipt): StoredFact {
  return { fact, receipt, fingerprint: digest(stableJson(fact)) };
}

function accepted(stored: StoredFact | undefined): stored is StoredFact {
  return stored !== undefined && (stored.receipt.state === 'pending' || stored.receipt.state === 'consumed')
    && stored.receipt.key === stored.fact.key && digest(stableJson(stored.fact)) === stored.fingerprint;
}

function hasEvidence(ledger: DurableLedger, instanceId: string, evidence: DurableEvidenceRef): boolean {
  if (!evidence?.path || !hashValid(evidence.sha256)) return false;
  const bytes = ledger.evidence(instanceId, evidence.sha256);
  return bytes !== undefined && digest(bytes) === evidence.sha256;
}

export function scopeDecisionFor(ledger: DurableLedger, instance: StoredInstance, source: StoredFact | undefined, recordedAt: string,
  decidedAt?: string): DurableScopeDecision | undefined {
  if (!accepted(source) || source.fact.kind !== 'b3-advance' || source.fact.source !== (workflowOwnsDispatch(instance) ? 'host' : 'chief')) return undefined;
  const b3 = source.fact;
  const id = instance.ref.instanceId;
  const report = instance.analysisReport;
  const baseline = instance.baseline;
  if (!report || !baseline || !equal(instance.scope, b3) || report.key !== b3.reportKey || report.attempt !== b3.b1Attempt
    || baseline.oid !== b3.baselineOid || !oidValid(baseline.oid) || baseline.branch !== 'ans/task/' + id
    || !validKey(b3.sourceTaskId) || !hashValid(b3.requestDigest) || !hasEvidence(ledger, id, report.evidence)) return undefined;
  const savedReport = ledger.fact(id, report.key);
  if (!accepted(savedReport) || savedReport.receipt.state !== 'consumed' || savedReport.fact.kind !== 'task-report'
    || !equal(savedReport.fact.evidence, report.evidence) || savedReport.fact.task.stage !== 'B1'
    || savedReport.fact.task.stageAttempt !== report.attempt) return undefined;
  const task = savedReport.fact.task;
  const closed = ledger.facts(id).some(item => accepted(item) && item.receipt.state === 'consumed'
    && item.fact.kind === 'analysis-disposition' && item.fact.outcome === 'usable'
    && item.fact.reportKey === report.key && sameTask(task, item.fact.task));
  if (!closed) return undefined;
  return {
    id: 'scope:' + digest(stableJson([instance.ref.projectId, id, b3.key])), kind: 'change.scope-decided',
    b3Request: { key: b3.key, sourceTaskId: b3.sourceTaskId, digest: b3.requestDigest },
    b1Report: { ...report.evidence, key: report.key, attempt: report.attempt }, baseline,
    candidateSource: b3.candidateSource, candidates: b3.candidates, writeSets: b3.writeSets, reason: b3.reason,
    ...(b3.evidenceRequirements?.length ? { evidenceRequirements: b3.evidenceRequirements } : {}),
    ...(b3.evidenceAuthorization ? { evidenceAuthorization: b3.evidenceAuthorization } : {}),
    recordedAt, ...(decidedAt ? { decidedAt } : {}),
  };
}

export function evidenceRequirementsFromB1(ledger: DurableLedger, value: StoredInstance): import('../../model/durable-workflow.ts').DurableB2EvidenceRequirement[] {
  const ref = value.analysisReport?.evidence;
  const bytes = ref && ledger.evidence(value.ref.instanceId, ref.sha256);
  if (!bytes || digest(bytes) !== ref?.sha256) return [];
  try {
    const envelope = JSON.parse(bytes.toString('utf8')) as { report?: { origin?: string; evidence?: { text?: string }[] } };
    if (envelope.report?.origin !== 'submitted-report') return [];
    return (envelope.report.evidence ?? []).flatMap<import('../../model/durable-workflow.ts').DurableB2EvidenceRequirement>(item => {
      try {
        const entry = JSON.parse(item.text ?? '') as { kind?: string; requirementId?: string; reason?: string; source?: string; paths?: unknown };
        return entry.kind === 'b2-evidence-requirement' && typeof entry.requirementId === 'string'
          && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(entry.requirementId) && typeof entry.reason === 'string' && validKey(entry.reason)
          ? [{ requirementId: entry.requirementId, reason: entry.reason,
            ...(entry.source === 'candidate-file' && Array.isArray(entry.paths) && entry.paths.length > 0 && entry.paths.length <= 12
              && entry.paths.every(safePath) && new Set(entry.paths).size === entry.paths.length
              ? { source: 'candidate-file' as const, paths: entry.paths } : {}) }] : [];
      } catch { return []; }
    }).filter((entry, index, all) => all.findIndex(row => row.requirementId === entry.requirementId) === index).slice(0, 24);
  } catch { return []; }
}

export function b2EvidenceDecisionProjection(ledger: DurableLedger, value: StoredInstance) {
  if (value.status !== 'waiting' || activeAction(value) !== 'accept-b3-advance-with-b2-scope') return;
  const row = ledger.facts(value.ref.instanceId).findLast(item => item.receipt.state !== 'ignored'
    && item.fact.kind === 'capability-event' && item.fact.stepId === value.stepId && item.fact.attempt === value.attempt
    && (item.fact.event.input.kind === 'b2-evidence-scope-prepared' || item.fact.event.input.kind === 'b2-evidence-scope-decided'));
  const input = row?.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
  return input?.kind === 'b2-evidence-scope-prepared' || input?.kind === 'b2-evidence-scope-decided' ? input.request : undefined;
}

export function approvalForRelease(ledger: DurableLedger, instance: StoredInstance, release: DurableReleaseRequest,
  address: { stepId: string; attempt: number }): boolean {
  const decision = release.decision;
  if (decision?.action !== 'approve' || !decisionProvenanceMatches(decision.source, decision.provenance, release)) return false;
  const record = ledger.fact(instance.ref.instanceId, decision.id);
  if (!accepted(record) || record.fact.kind !== 'release-decision') return false;
  const saved = record.fact;
  return saved.source === decision.source && saved.action === 'approve' && equal(saved.provenance, decision.provenance)
    && saved.requestId === release.requestId && saved.digest === release.digest && saved.generation === release.generation
    && saved.attempt === address.attempt && saved.stepId === address.stepId;
}

export function deliveryFor(ledger: DurableLedger, instance: StoredInstance, source: StoredFact | undefined,
  createdAt: string): DurableDelivery | undefined {
  if (!accepted(source) || source.fact.kind !== 'release-merged' || source.fact.source !== 'host'
    || source.fact.closed !== true) return undefined;
  const merge = source.fact;
  const id = instance.ref.instanceId;
  const release = instance.release;
  if (!release || release.requestId !== merge.requestId || !oidValid(merge.mainOid)
    || !approvalForRelease(ledger, instance, release, merge)) return undefined;

  const effect = ledger.effect(id, merge.effectKey);
  const outcome = effect?.result;
  const verified = outcome?.result;
  const snapshot = release.snapshot;
  if (!effect || effect.state !== 'succeeded' || effect.intent.kind !== 'release-merge'
    || effect.intent.requestId !== release.requestId || effect.intent.snapshotDigest !== release.digest
    || effect.intent.attempt !== merge.attempt || effect.intent.stepId !== merge.stepId
    || effect.intent.expected?.mainOid !== snapshot.mainOid || effect.intent.expected.tipOid !== snapshot.tipOid
    || effect.intent.expected.branch !== snapshot.branch || !equal(effect.intent.expected.files, snapshot.files)
    || outcome?.outcome !== 'succeeded' || outcome.token !== effect.token || verified?.mainOid !== merge.mainOid
    || typeof verified.diffDigest !== 'string' || !hashValid(verified.diffDigest)) return undefined;
  // The approval describes the task baseline to tip. The verified merge delta is relative to approved main.
  const files = verified.files;
  if (!Array.isArray(files) || files.length === 0 || new Set(files).size !== files.length
    || !files.every(file => safePath(file) && snapshot.files.includes(file))) return undefined;

  const { operatorReport, operatorReportArtifacts, acceptanceArchive } = snapshot;
  if (!instance.implementation || instance.implementation.key !== snapshot.b3CloseKey
    || !equal(instance.implementation.operatorReport, operatorReport)
    || !hasEvidence(ledger, id, operatorReport)
    || operatorReportArtifacts?.some(artifact => !hasEvidence(ledger, id, artifact))
    || acceptanceArchive && (!equal(instance.graph?.acceptanceArchive, acceptanceArchive) || !hasEvidence(ledger, id, acceptanceArchive))) return undefined;
  return {
    id: 'delivery:' + digest(stableJson([instance.ref.projectId, id, release.requestId, merge.effectKey])),
    state: 'pending', releaseRequestId: release.requestId, mergeOid: merge.mainOid, files,
    diffDigest: verified.diffDigest, operatorReport, ...(operatorReportArtifacts ? { operatorReportArtifacts } : {}),
    ...(acceptanceArchive ? { acceptanceArchive } : {}),
    runtimeVerification: 'not-independently-verified', createdAt,
  };
}
