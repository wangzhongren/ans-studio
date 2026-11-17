import type { DurableDelivery, DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableReleaseRequest, DurableResult, DurableScopeDecision } from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredFact, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { activeAction, equal, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey } from './rules.ts';

type FactUpdate = DurableFactReceipt & { noWrite?: true };

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
      break;
    case 'task-bound': {
      if (!atCurrentStep) return obsolete('step-not-active');
      if (instance.task && !sameTask(instance.task, fact.task)) return fail('task-already-bound', '当前尝试已绑定另一生产任务。');
      if (fact.modulePaths?.some(path => !safePath(path))) return fail('task-invalid', '任务模块路径无效。');
      if (action === 'b1-impact-readonly' && (!instance.baseline || !facts('stage-request').some(item => item.receipt.state === 'consumed')
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
      if (![snapshot.mainOid, snapshot.tipOid, snapshot.baselineOid].every(oidValid)
        || !hashValid(snapshot.diffDigest) || snapshot.branch !== instance.baseline.branch || snapshot.baselineOid !== instance.baseline.oid
        || snapshot.tipOid !== commit?.result?.result?.oid
        || snapshot.b3CloseKey !== instance.implementation.key || !equal(snapshot.operatorReport, instance.implementation.operatorReport)
        || !snapshot.files.length || snapshot.files.some(file => !safePath(file)
          || !instance.scope?.writeSets.some(set => set.paths.includes(file)))) {
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
        if (release.decision.action !== fact.action) return fail('release-decision-conflict', '客户已提交相反的发布决定。');
        const existing = ledger.fact(id, release.decision.id);
        return ok({ ...receipt, ...existing?.receipt, release, noWrite: true });
      }
      release.decision = { id: fact.key, action: fact.action, at: new Date().toISOString(), source: 'customer' };
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
  if (!accepted(source) || source.fact.kind !== 'b3-advance' || source.fact.source !== 'chief') return undefined;
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
    recordedAt, ...(decidedAt ? { decidedAt } : {}),
  };
}

export function deliveryFor(ledger: DurableLedger, instance: StoredInstance, source: StoredFact | undefined,
  createdAt: string): DurableDelivery | undefined {
  if (!accepted(source) || source.fact.kind !== 'release-merged' || source.fact.source !== 'host'
    || source.fact.closed !== true) return undefined;
  const merge = source.fact;
  const id = instance.ref.instanceId;
  const release = instance.release;
  if (!release || release.requestId !== merge.requestId || release.decision?.source !== 'customer'
    || release.decision.action !== 'approve' || !oidValid(merge.mainOid)) return undefined;
  const savedDecision = ledger.fact(id, release.decision.id);
  if (!accepted(savedDecision) || savedDecision.fact.kind !== 'release-decision' || savedDecision.fact.source !== 'customer'
    || savedDecision.fact.action !== 'approve' || savedDecision.fact.requestId !== release.requestId
    || savedDecision.fact.digest !== release.digest || savedDecision.fact.generation !== release.generation
    || savedDecision.fact.attempt !== merge.attempt || savedDecision.fact.stepId !== merge.stepId) return undefined;

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
    || typeof verified.diffDigest !== 'string' || !hashValid(verified.diffDigest) || verified.diffDigest !== snapshot.diffDigest
    || !Array.isArray(verified.files) || verified.files.length === 0 || !verified.files.every(safePath)
    || !equal(verified.files, snapshot.files)) return undefined;

  const { operatorReport, operatorReportArtifacts } = snapshot;
  if (!instance.implementation || instance.implementation.key !== snapshot.b3CloseKey
    || !equal(instance.implementation.operatorReport, operatorReport)
    || !hasEvidence(ledger, id, operatorReport)
    || operatorReportArtifacts?.some(artifact => !hasEvidence(ledger, id, artifact))) return undefined;
  return {
    id: 'delivery:' + digest(stableJson([instance.ref.projectId, id, release.requestId, merge.effectKey])),
    state: 'pending', releaseRequestId: release.requestId, mergeOid: merge.mainOid, files: verified.files,
    diffDigest: verified.diffDigest, operatorReport, ...(operatorReportArtifacts ? { operatorReportArtifacts } : {}),
    // A role's report is retained as evidence. No independent runtime-verification fact exists in this workflow.
    runtimeVerification: 'not-independently-verified', createdAt,
  };
}
