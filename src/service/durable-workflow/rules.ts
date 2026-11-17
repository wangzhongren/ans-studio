import type { DurableAction, DurableFact, DurableInstanceRef, DurableProjection, DurableResult, DurableStep, DurableTaskBinding, DurableTerminal } from '../../model/durable-workflow.ts';
import type { DurableLedger, StoredFact, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';

export const ok = <T>(value: T): DurableResult<T> => ({ ok: true, value });
export const fail = (code: string, message: string): DurableResult<never> => ({ ok: false, code, message });
export const hashValid = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);
export const oidValid = (value: string): boolean => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
export const validKey = (value: string): boolean => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/.test(value);
export const equal = (first: unknown, second: unknown): boolean => stableJson(first) === stableJson(second);
export const sameInstance = (first: DurableInstanceRef, second: DurableInstanceRef): boolean => equal(first, second);
export const sameTask = (first: DurableTaskBinding | undefined, second: DurableTaskBinding): boolean => first !== undefined && equal(first, second);
export const liveEffect = (state: string): boolean => state === 'claimed' || state === 'unknown';
export const actionOf = (step: DurableStep): DurableAction | undefined => 'action' in step ? step.action : undefined;
export const activeAction = (value: StoredInstance): DurableAction | undefined => actionOf(value.definition.steps[value.stepId]!);

export function safePath(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096
    && !/[\\:\x00-\x1f]/.test(path) && !path.split('/').some(part => ['', '.', '..'].includes(part))
    && !['.git', '.ans', '角色卡'].includes(path.split('/')[0]!.toLowerCase());
}

const sources: Readonly<Record<DurableFact['kind'], DurableFact['source']>> = {
  'stage-request': 'chief', 'task-bound': 'host', 'task-report': 'host',
  'analysis-disposition': 'convener', 'b3-advance': 'chief', 'implementation-close': 'convener',
  'operator-report': 'host', 'implementation-accepted': 'convener',
  'release-preview': 'host', 'release-decision': 'customer', 'release-merged': 'host', 'readonly-review': 'convener',
  'effect-settled': 'host',
};

const factsForAction: Readonly<Record<DurableAction, readonly DurableFact['kind'][]>> = {
  'b1-impact-readonly': ['stage-request', 'task-bound', 'task-report', 'analysis-disposition', 'operator-report'],
  'b1-open-followup-attempt': [],
  'accept-b3-advance-with-b2-scope': ['b3-advance'],
  'b3-implement-and-accept': ['task-bound', 'task-report', 'implementation-close', 'operator-report', 'implementation-accepted'],
  'b4-customer-merge-main': ['release-preview', 'release-decision', 'release-merged'],
  'readonly-report': ['stage-request', 'task-bound', 'task-report'],
  'wait-for-review': ['readonly-review'],
};

const waitFor: Readonly<Record<DurableAction, string>> = {
  'b1-impact-readonly': '等待本次 B1 只读报告和运营处置',
  'b1-open-followup-attempt': '等待上一 B1 尝试完成核对',
  'accept-b3-advance-with-b2-scope': '等待同一 B1 报告关联的幕僚 B3 advance',
  'b3-implement-and-accept': '等待实现任务报告、运营报告和收口',
  'b4-customer-merge-main': '等待应用生成发布预览',
  'readonly-report': '等待模块属主的只读报告',
  'wait-for-review': '等待运营核对只读报告',
};

export function project(ledger: DurableLedger, value: StoredInstance): DurableProjection {
  const action = value.status === 'waiting' ? activeAction(value) : undefined;
  const stageRequest = ledger.facts(value.ref.instanceId).find(item => item.fact.kind === 'stage-request'
    && item.fact.attempt === value.attempt)?.fact;
  return {
    ref: value.ref, definitionName: value.definition.name, projectRoot: value.projectRoot,
    stepId: value.stepId, stepName: value.stepId, attempt: value.attempt, status: value.status, engine: value.engine,
    action, waitingFor: action === undefined ? undefined : value.release
      ? (value.release.decision?.action === 'approve' ? '等待应用核对并执行已批准的本地合并' : '等待客户决定')
      : waitFor[action],
    blockedReason: value.engineReason ?? value.businessReason,
    pendingFacts: ledger.facts(value.ref.instanceId, true).length,
    task: value.task, actionIntent: value.actionIntent, baseline: value.baseline,
    stageRequest: stageRequest?.kind === 'stage-request' ? stageRequest : undefined,
    analysisReport: value.analysisReport, scope: value.scope, implementation: value.implementation,
    release: value.release, metadata: value.metadata,
  };
}

export function factShape(value: StoredInstance, fact: DurableFact): DurableResult<true> {
  if (!validKey(fact.key) || !Number.isSafeInteger(fact.attempt) || fact.attempt < 1) return fail('fact-invalid', '事实键或尝试号无效。');
  if (!Object.hasOwn(sources, fact.kind) || sources[fact.kind] !== fact.source) return fail('fact-source-invalid', '事实来源无效。');
  if (!Object.hasOwn(value.definition.steps, fact.stepId)) return fail('fact-step-invalid', '事实步骤不属于固定定义。');
  const action = actionOf(value.definition.steps[fact.stepId]!);
  if (action === undefined || !factsForAction[action].includes(fact.kind)) {
    return fail('fact-step-invalid', '该步骤不接受此业务事实。');
  }
  if ('task' in fact) {
    const { stage, stageAttempt, executionAttempt, parentTaskId, taskId, roleId } = fact.task;
    const expected = action === 'b1-impact-readonly' ? 'B1' : action === 'b3-implement-and-accept' ? 'B3' : 'readonly';
    if (stage !== expected || stageAttempt !== fact.attempt || !Number.isSafeInteger(executionAttempt)
      || executionAttempt < 1 || ![parentTaskId, taskId, roleId].every(validKey) || parentTaskId === taskId) {
      return fail('fact-task-invalid', '事实未绑定真实父任务、生产任务、属主及尝试。');
    }
  }
  return ok(true);
}

export interface ActivityInput {
  ref: DurableInstanceRef;
  stepId: string;
  entry: number;
  turn: number;
  timer?: boolean;
}

export interface ActivityOutcome {
  next?: string;
  entry: number;
  terminal?: DurableTerminal;
}

function changeStep(value: StoredInstance, next: string, sourceKey?: string): void {
  value.stepId = next;
  value.entry++;
  const step = value.definition.steps[next]!;
  if ('terminal' in step) {
    value.status = step.terminal;
    delete value.actionIntent;
    return;
  }
  delete value.businessReason;
  value.actionIntent = {
    key: 'intent:' + value.ref.instanceId + ':' + value.entry,
    action: step.action, stepId: next, attempt: value.attempt, sourceKey,
  };
}

function consume(ledger: DurableLedger, value: StoredInstance, item: StoredFact, reason?: string): void {
  item.receipt = { ...item.receipt, state: reason === undefined ? 'consumed' : 'ignored', reason };
  ledger.saveFact(value.ref.instanceId, item);
}
export function applyStep(ledger: DurableLedger, value: StoredInstance, input: ActivityInput): ActivityOutcome {
  if (input.stepId !== value.stepId || input.entry !== value.entry) throw new Error('工作流重放步骤与 ANS 账本不一致。');
  const step = value.definition.steps[value.stepId]!;
  if ('terminal' in step) return { terminal: step.terminal, entry: value.entry };
  const stepId = value.stepId;
  const all = ledger.facts(value.ref.instanceId);
  const pending = all.filter(item => item.receipt.state === 'pending');
  const current = pending.filter(item => item.fact.stepId === stepId && item.fact.attempt === value.attempt);
  const candidate = <K extends DurableFact['kind']>(kind: K) => current.find(
    (item): item is StoredFact & { fact: Extract<DurableFact, { kind: K }> } => item.fact.kind === kind,
  );
  const reportFor = (key?: string) => all.find(item => item.fact.kind === 'task-report'
    && (key === undefined || item.fact.key === key) && item.receipt.state !== 'ignored'
    && item.fact.stepId === stepId && sameTask(value.task, item.fact.task));
  const live = () => ledger.effects(value.ref.instanceId).some(effect =>
    effect.intent.attempt === value.attempt && liveEffect(effect.state));
  for (const item of pending) {
    if (item.fact.attempt < value.attempt) consume(ledger, value, item, 'attempt-retired');
    else if (item.fact.kind === 'effect-settled') consume(ledger, value, item);
  }

  const bound = candidate('task-bound');
  if (bound && sameTask(value.task, bound.fact.task)) consume(ledger, value, bound);
  const report = reportFor();
  if (report && report.receipt.state === 'pending') consume(ledger, value, report);
  const request = candidate('stage-request');
  if (request) consume(ledger, value, request);
  const operatorReport = all.find(item => item.fact.kind === 'operator-report' && item.receipt.state !== 'ignored'
    && (item.fact.stepId === stepId || step.action === 'accept-b3-advance-with-b2-scope')
    && item.fact.attempt === value.attempt && item.fact.parentTaskId === value.task?.parentTaskId);
  if (operatorReport?.receipt.state === 'pending') consume(ledger, value, operatorReport);
  if (input.timer) {
    const timerKey = 'timer:' + value.entry;
    if (ledger.activity(value.ref.instanceId, timerKey) === undefined) {
      ledger.saveActivity(value.ref.instanceId, timerKey, { stepId, attempt: value.attempt });
    }
  }

  let next: string | undefined;
  let advancedBy: StoredFact | undefined;
  switch (step.action) {
    case 'b1-impact-readonly': {
      const disposition = candidate('analysis-disposition');
      if (!disposition || !sameTask(value.task, disposition.fact.task)) break;
      const evidence = reportFor(disposition.fact.reportKey)?.fact;
      if (evidence?.kind !== 'task-report') break;
      if (disposition.fact.outcome === 'usable' && (!operatorReport || live())) break;
      if (disposition.fact.outcome === 'blocked' && live()) break;
      const task = all.find(item => item.fact.kind === 'task-bound' && sameTask(value.task, item.fact.task))?.fact;
      value.analysisReport = {
        key: evidence.key, evidence: evidence.evidence, attempt: value.attempt,
        modulePaths: task?.kind === 'task-bound' ? task.modulePaths ?? [] : [],
      };
      next = step.on![disposition.fact.outcome];
      if (disposition.fact.outcome !== 'usable' && 'terminal' in value.definition.steps[next!]!) {
        value.businessReason = disposition.fact.outcome === 'needsFollowup' ? '当前定义要求停止，无补查出口。' : '运营处置为阻塞。';
      }
      advancedBy = disposition;
      break;
    }
    case 'b1-open-followup-attempt': {
      if (live()) {
        value.businessReason = '上一尝试的已认领操作尚未核对，补查保持暂停。';
        break;
      }
      const used = value.visits[stepId] ?? 0;
      if (used >= step.maxVisits!) {
        next = step.onLimit!;
        value.businessReason = '只读补查已达到配置次数。';
      } else {
        value.visits[stepId] = used + 1;
        value.attempt++;
        delete value.analysisReport;
        delete value.task;
        next = step.next;
      }
      break;
    }
    case 'accept-b3-advance-with-b2-scope': {
      const scope = candidate('b3-advance');
      if (!scope || scope.fact.key !== value.scope?.key) break;
      next = step.next;
      advancedBy = scope;
      delete value.task;
      break;
    }
    case 'b3-implement-and-accept': {
      const accepted = candidate('implementation-accepted');
      const close = candidate('implementation-close');
      const implementation = accepted?.fact ?? (close && operatorReport?.fact.kind === 'operator-report'
        ? { ...close.fact, kind: 'implementation-accepted' as const, operatorReport: operatorReport.fact.evidence } : undefined);
      if (!implementation || !sameTask(value.task, implementation.task) || !reportFor(implementation.reportKey)) break;
      if (live()) {
        value.businessReason = '实现任务的实际操作结果未核对。';
        break;
      }
      if (!ledger.effects(value.ref.instanceId).some(effect => effect.intent.kind === 'task-commit'
        && effect.state === 'succeeded' && sameTask(effect.intent.task, implementation.task))) {
        value.businessReason = '等待受信的实际 Git 提交回执。';
        break;
      }
      value.implementation = implementation;
      next = step.next;
      advancedBy = accepted ?? close;
      break;
    }
    case 'b4-customer-merge-main': {
      for (const item of current) if (item.fact.kind === 'release-preview' || item.fact.kind === 'release-decision') consume(ledger, value, item);
      const merged = candidate('release-merged');
      if (value.release?.decision?.action === 'reject') next = step.on!.rejected;
      if (value.release?.decision?.action === 'approve' && merged?.fact.requestId === value.release.requestId && merged.fact.closed) {
        next = step.on!.merged;
        advancedBy = merged;
      }
      break;
    }
    case 'readonly-report': {
      if (!report || !value.task) break;
      value.readonlyReportKey = report.fact.key;
      next = step.next;
      advancedBy = report;
      break;
    }
    case 'wait-for-review': {
      const review = candidate('readonly-review');
      if (!review || review.fact.reportKey !== value.readonlyReportKey || live()) break;
      next = step.on![review.fact.outcome];
      advancedBy = review;
      break;
    }
  }
  if (advancedBy) consume(ledger, value, advancedBy);
  if (next === undefined) return { entry: value.entry };
  changeStep(value, next, advancedBy?.fact.key);
  if (value.status !== 'waiting') {
    for (const item of ledger.facts(value.ref.instanceId, true)) consume(ledger, value, item, 'instance-terminal');
    return { terminal: value.status, entry: value.entry };
  }
  return { next, entry: value.entry };
}
