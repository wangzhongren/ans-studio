import { randomUUID } from 'node:crypto';
import type { DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableFact, DurableResult } from '../../model/durable-workflow.ts';
import { digest } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredEffect, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { storedFact } from './facts.ts';
import { activeAction, equal, fail, liveEffect, oidValid, ok, safePath, sameTask, validKey } from './rules.ts';

function allowedPath(allowed: readonly string[], path: string): boolean {
  return safePath(path) && allowed.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

function checkPermission(ledger: DurableLedger, instance: StoredInstance, intent: DurableEffectIntent): DurableResult<true> {
  const id = instance.ref.instanceId;
  const action = activeAction(instance);
  if (instance.status !== 'waiting' || intent.stepId !== instance.stepId || intent.attempt !== instance.attempt) {
    return fail('effect-attempt-retired', '当前步骤或尝试已换代，不能执行原作用。');
  }
  if (instance.engine === 'incompatible' || instance.engine === 'history-missing') {
    return fail('effect-engine-blocked', '兼容性或历史核验阻止了新的作用。');
  }
  if (intent.kind === 'baseline') {
    if (action !== 'b1-impact-readonly' || instance.baseline) return fail('baseline-not-open', 'B1 基线不接受新的操作。');
    return ok(true);
  }
  if (intent.kind === 'release-merge') {
    const release = instance.release;
    if (action !== 'b4-customer-merge-main' || !release || release.decision?.action !== 'approve'
      || release.requestId !== intent.requestId || release.digest !== intent.snapshotDigest
      || intent.expected?.mainOid !== release.snapshot.mainOid || intent.expected?.tipOid !== release.snapshot.tipOid
      || intent.expected?.branch !== release.snapshot.branch || !equal(intent.expected?.files, release.snapshot.files)) {
      return fail('release-approval-invalid', '合并未绑定当前批准的快照和预期 refs。');
    }
    const conflict = ledger.effects(id).some(effect => effect.intent.kind === 'release-merge'
      && effect.intent.key !== intent.key && (liveEffect(effect.state) || effect.state === 'succeeded'));
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
      || action === 'b3-implement-and-accept' && task.stage === 'B3' && instance.actionIntent?.sourceKey === instance.scope?.key);
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
