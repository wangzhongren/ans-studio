import { basename } from 'node:path';
import { parseDocument } from 'yaml';
import { parseCriteriaText } from '../../common/编排/evidence-check.ts';
import { DURABLE_EVIDENCE_AUDIT_CAPABILITIES, DURABLE_VERIFICATION_CAPABILITIES } from '../../model/durable-workflow.ts';
import type { DurableA11Disposition, DurableA11GitObservation, DurableAcceptancePreparationObservation, DurableBlockedRoutingProjection, DurableEffectIntent, DurableEvidenceRef, DurableImplementationItem, DurableImplementationWorkOrder,
  DurableCapabilityEvent, DurablePendingTask, DurableResult, DurableTaskBinding, DurableVerificationCapability, DurableVerificationCapabilitySnapshot,
  DurableVerificationPlan, DurableVerificationRequirement } from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { acceptancePreparationObservation, acceptancePreparationReworkStep, isPreparationBlocker } from './acceptance-workspace.ts';
import { activeAction, equal, fail, hashValid, liveEffect, oidValid, ok, safePath, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';

const requiredEvidence: Readonly<Record<DurableVerificationCapability, readonly string[]>> = {
  'module-inspection': ['file'], 'module-shell': ['command-receipt'], 'governed-commit': ['git-commit'],
  'workspace-build': ['command-receipt'], 'workspace-preview': ['file'], 'workspace-browser': ['browser-input', 'browser-screenshot'],
  'external-execution': ['execution-session'], 'approved-build': ['command-receipt', 'file'],
};
const deferred = (name: DurableVerificationCapability) => name.startsWith('workspace-') || name === 'external-execution' || name === 'approved-build';
const auditSources = { 'module-inspection': 'candidate-file', 'module-shell': 'task-command', 'governed-commit': 'candidate-commit',
  'external-execution': 'external-session', 'approved-build': 'task-command' } as const;

export function blockedRoutingEnabled(value: StoredInstance): boolean {
  const step = value.definition.steps[value.stepId];
  return workflowOwnsDispatch(value) && !!step && 'blockedRouting' in step && step.blockedRouting === true;
}

export function verificationCapabilitiesValid(value: unknown, evidenceAudit = false): value is DurableVerificationCapabilitySnapshot {
  const known = evidenceAudit ? DURABLE_EVIDENCE_AUDIT_CAPABILITIES : DURABLE_VERIFICATION_CAPABILITIES;
  if (!value || typeof value !== 'object' || !('stage' in value) || (value.stage !== 'A12a' && value.stage !== 'A12b') || !('status' in value)
    || !Array.isArray(value.status) || value.status.length !== known.length) return false;
  return new Set(value.status.map(row => row?.capability)).size === known.length && value.status.every(row =>
    row && known.some(item => item === row.capability) && ['available', 'candidate-pending', 'unavailable'].includes(row.status)
    && (row.status !== 'candidate-pending' || deferred(row.capability))
    && (row.status === 'available' && row.reason === undefined || typeof row.reason === 'string' && validKey(row.reason.trim())));
}

export function implementationTestCommand(argv: readonly string[]): boolean {
  if (!Array.isArray(argv) || !argv.length || argv.length > 32 || !argv.every(arg => typeof arg === 'string' && validKey(arg))) return false;
  const [entry, op, name] = argv;
  const executable = basename(entry!.replaceAll('\\', '/')).toLowerCase().replace(/\.(?:cmd|exe|ps1)$/, '');
  if (executable === 'node') return op === '--check' && typeof name === 'string' || op === '--test';
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(executable)) return false;
  return op === 'test' || !!name && ['run', 'run-script'].includes(op ?? '') && /^(?:test|lint|typecheck|check|build)(?:[-:_][a-zA-Z0-9._:-]+)?$/.test(name);
}

export function implementationTestMatches(requirement: DurableVerificationRequirement, argv: readonly string[]): boolean {
  return requirement.capability === 'module-shell' && implementationTestCommand(argv)
    && (!requirement.command || equal(requirement.command, argv));
}

function testRuleText(requirement: DurableVerificationRequirement): string {
  return requirement.command
    ? `${requirement.id} 的签发命令是 ${JSON.stringify(requirement.command)}。原审批和回执逐项核对完整字面 argv。`
    : `${requirement.id} 可使用 node --test <实际模块测试文件>（例如 node --test test/gameplay-dev/race.test.mjs）。`
      + ' node 直接运行脚本没有应用回执资格。node --check <模块文件> 只检查语法，文件须在获批范围内且受候选 Git 跟踪。'
      + ' npm、pnpm、yarn、bun 的 test，或 run/run-script 的 test、lint、typecheck、check、build 及现有分隔后缀形式可作为候选。'
      + '包脚本必须实际存在，补测时不得生成输出、缓存或其他工作区写入。';
}

export function implementationTestRulesText(requirements: readonly DurableVerificationRequirement[]): string {
  return requirements.filter(req => req.capability === 'module-shell').map(testRuleText).join('\n');
}

export function citesImplementationTest(text: string, token: string): boolean {
  const words = text.split(/[\s`"'，。；、()[\]{}]+/);
  return words.some(word => word === token || word.replace(/[,.!?;]+$/, '') === token);
}

export function readVerificationPlan(document: DurableEvidenceRef, bytes: Buffer, flowId: string,
  capabilities: DurableVerificationCapabilitySnapshot, items?: readonly DurableImplementationItem[], evidenceAudit = false): DurableResult<DurableVerificationPlan> {
  const invalid = (reason: string) => fail('verification-plan-invalid', reason);
  const known = evidenceAudit ? DURABLE_EVIDENCE_AUDIT_CAPABILITIES : DURABLE_VERIFICATION_CAPABILITIES;
  if (!verificationCapabilitiesValid(capabilities, evidenceAudit) || digest(bytes) !== document.sha256) return invalid('当前验收能力快照或标准摘要无效。');
  const content = bytes.toString('utf8');
  const criteria = parseCriteriaText(content, { flowId, fileName: basename(document.path) });
  if (!criteria.ok || criteria.doc.status !== 'final') return invalid('当前标准须使用已签发的 final ans-criteria 条目。');
  const header = /^\ufeff?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  let raw: unknown;
  try {
    const yaml = header && parseDocument(header[1]!, { uniqueKeys: true });
    if (yaml && !yaml.errors.length) raw = yaml.toJS({ maxAliasCount: 0 })?.verificationRequirements;
  } catch { return invalid('能力要求的 YAML 前置字段无法核对。'); }
  if (!Array.isArray(raw) || !raw.length || raw.length > 96) return invalid('标准须写入每项 verificationRequirements。');
  const requirements: DurableVerificationRequirement[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['id', 'stage', 'capability', 'evidence', 'workItemId', 'command',
      ...(evidenceAudit ? ['behavior', 'source', 'paths'] : [])].includes(key))
      || (row.stage !== 'A11' && row.stage !== 'A12b') || !known.some(item => item === row.capability)) return invalid('标准缺少有效的阶段与能力，新合同不得引用退役工作区执行。');
    const capability: DurableVerificationCapability = row.capability;
    if (!criteria.doc.criteria.some(item => item.id === row.id) || !Array.isArray(row.evidence) || !row.evidence.length
      || !equal([...row.evidence].sort(), [...requiredEvidence[capability]].sort())
      || (row.stage === 'A11' ? deferred(row.capability) || typeof row.workItemId !== 'string' || !validKey(row.workItemId)
        || items !== undefined && !items.some(item => item.id === row.workItemId)
        : row.workItemId !== undefined || !evidenceAudit && (row.capability === 'module-shell' || row.capability === 'governed-commit'))
      || row.command !== undefined && (!['module-shell', 'approved-build'].includes(row.capability) || !implementationTestCommand(row.command))) {
      return invalid('标准条目的阶段、能力、证据类型或实施归属不匹配。');
    }
    if (requirements.some(prior => prior.id === row.id && prior.stage === row.stage && prior.capability === row.capability
      && prior.workItemId === row.workItemId)) return invalid('标准含重复的阶段能力与证据要求。');
    if (evidenceAudit && row.stage === 'A12b' && (!validKey(row.behavior) || row.source !== auditSources[row.capability as keyof typeof auditSources]
      || (row.capability === 'module-shell' || row.capability === 'approved-build') && !row.command
      || (row.capability === 'module-inspection' || row.capability === 'approved-build') && !row.paths
      || row.paths !== undefined && (!Array.isArray(row.paths) || !row.paths.length || row.paths.length > 24
        || !row.paths.every(safePath) || new Set(row.paths).size !== row.paths.length))) {
      return invalid('独立审计项须明确实际行为、允许的来源和对应字面文件或受控命令。');
    }
    requirements.push({ id: row.id, stage: row.stage, capability: row.capability, evidence: [...row.evidence],
      ...(row.stage === 'A12b' && evidenceAudit ? { behavior: row.behavior, source: row.source, ...(row.paths ? { paths: row.paths } : {}) } : {}),
      ...(row.workItemId === undefined ? {} : { workItemId: row.workItemId }), ...(row.command === undefined ? {} : { command: [...row.command] }) });
  }
  if (criteria.doc.criteria.some(item => !requirements.some(row => row.id === item.id && (item.priority !== 'P0' || row.stage === 'A12b')))) {
    return invalid('每个签发条目须有有效职责及证据，所有 P0 条目须有独立验收职责。');
  }
  return ok({ standard: document, capabilities, capabilitiesDigest: digest(stableJson(capabilities)), requirements });
}

export function currentVerificationPlan(ledger: DurableLedger, value: StoredInstance): DurableVerificationPlan | undefined {
  const standard = value.graph?.tasks.findLast(task => task.capability === 'independent-standard' && task.outcome === 'accepted'
    && task.baselineOid === value.baseline?.oid);
  const document = standard?.documents?.find(doc => /^docs\/quality\/[a-z0-9-]+-criteria-v[1-9][0-9]*\.md$/.test(doc.path));
  const bytes = document && ledger.evidence(value.ref.instanceId, document.sha256);
  if (!standard?.verificationCapabilities || !document || !bytes) return;
  const audit = value.definition.schema === 2 && !!value.definition.evidenceAudit;
  const parsed = readVerificationPlan(document, bytes, standard.flowId, standard.verificationCapabilities, undefined, audit);
  return parsed.ok && (audit || !unavailableVerification(parsed.value)) ? parsed.value : undefined;
}

export function unavailableVerification(plan: DurableVerificationPlan) {
  return plan.capabilities.status.find(row => row.status === 'unavailable' && plan.requirements.some(req => req.capability === row.capability));
}

export function implementationWorkOrder(value: StoredInstance, item: DurableImplementationItem, task: DurableTaskBinding,
  plan: DurableVerificationPlan): DurableImplementationWorkOrder {
  const requirements = plan.requirements.filter(row => row.stage === 'A11' && row.workItemId === item.id);
  if (!requirements.length) {
    requirements.push({ id: 'module-review', stage: 'A11', capability: 'module-inspection', evidence: ['file'], workItemId: item.id });
  }
  const order = { schema: 'implementation-work-order/v1' as const, task, workItemId: item.id, paths: [...item.paths],
    standard: plan.standard, capabilitiesDigest: plan.capabilitiesDigest, requirements, deferredChecks: plan.requirements.filter(row => row.stage === 'A12b') };
  return { ...order, digest: digest(stableJson([value.ref, order])) };
}

export function workOrderText(order: DurableImplementationWorkOrder): string {
  const checks = implementationTestRulesText(order.requirements);
  const semantics = checks
    ? '先在批准范围内完成实现并提交，随后在干净的已提交候选上通过原 run_shell 审批执行。命中语法后仍需核对项目文件、实际执行器和写审计。\n' + checks
    : '按获批职责做相称的模块自查，核对本模块文件、内容和说明，完成实际提交。';
  return '应用生成的本轮实施工单（已批准工作项及正式验收依据）：\n' + JSON.stringify(order)
    + '\n按已批准产品意图、提案和工作项实施本模块。' + semantics
    + '唯一提交完成后不可再次暂存。正式回交应列实际提交、自测的应用回执引用（工具调用或回执 ID）、结果及限制。'
    + '应用已保存实际自测，无需另写自测回执。项目级执行由经批准的执行方完成，取证工单登记实际来源，独立质检审计证据。';
}

export function missingImplementationTests(ledger: DurableLedger, value: StoredInstance, child: DurablePendingTask, candidateOid: string,
  turns: readonly { turnId: string; retestKey?: string; reportText?: string }[]): DurableVerificationRequirement[] {
  const order = child.workOrder;
  if (!order) return [];
  return order.requirements.filter(requirement => requirement.capability === 'module-shell' &&
    !ledger.facts(value.ref.instanceId).some(row => {
      if (row.receipt.state === 'ignored' || row.fact.kind !== 'capability-event' || row.fact.event.input.kind !== 'implementation-self-test'
        || row.fact.event.stepId !== child.stepId || row.fact.event.attempt !== child.attempt) return false;
      const { receipt } = row.fact.event.input;
      return sameTask(receipt.task, child.task) && receipt.workOrderDigest === order.digest && receipt.candidateOid === candidateOid
        && implementationTestMatches(requirement, receipt.argv) && turns.some(turn => turn.turnId === receipt.turnId
          && turn.retestKey === receipt.retest?.key
          && (!receipt.retest || receipt.retest.standardSha256 === order.standard.sha256)
          && (turn.reportText === undefined || [receipt.toolCallId, receipt.executionDigest, row.fact.key].some(token => citesImplementationTest(turn.reportText!, token))));
    }));
}

export function implementationTestsSatisfied(ledger: DurableLedger, value: StoredInstance, child: DurablePendingTask,
  turnId: string, candidateOid: string): boolean {
  return !!child.workOrder && missingImplementationTests(ledger, value, child, candidateOid, [{ turnId }]).length === 0;
}

export function cleanRetestObservation(disposition: Pick<DurableA11Disposition, 'candidateOid' | 'branch'>,
  observation: DurableA11GitObservation): boolean {
  return observation.head === disposition.candidateOid && observation.branch === disposition.branch && !!observation.indexDigest
    && !!observation.worktreeDigest && !observation.lock && !observation.stagedPaths.length && !observation.trackedDirty
    && observation.untrackedPaths?.length === 0;
}

export function blockedRoutingProjection(ledger: DurableLedger, value: StoredInstance): DurableBlockedRoutingProjection | undefined {
  if (value.status !== 'waiting') return;
  const rows = ledger.facts(value.ref.instanceId).flatMap(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event'
    && row.fact.event.stepId === value.stepId && row.fact.event.attempt === value.attempt ? [row.fact.event.input] : []);
  const audit = rows.findLast(row => row.kind === 'evidence-audit-blocked' && row.scope.origin.entry === value.entry);
  if (audit?.kind === 'evidence-audit-blocked' && rows.some(row => row.kind === 'blocked-scope-resumed'
    && row.requestId === audit.scope.binding.requestId && row.evidenceAction)) return undefined;
  if (audit?.kind === 'evidence-audit-blocked' && !rows.some(row => row.kind === 'evidence-collection-recorded'
    && row.basis.candidateOid === audit.basis.candidateOid && row.basis.generation > audit.basis.generation)) {
    const decision = rows.find(row => row.kind === 'blocked-scope-decided' && row.decision.requestId === audit.scope.binding.requestId);
    return { ...audit.scope, ...(decision?.kind === 'blocked-scope-decided' ? { decision: decision.decision } : {}) };
  }
  if (!blockedRoutingEnabled(value)) return;
  const preparation = acceptancePreparationObservation(ledger, value);
  if (preparation && isPreparationBlocker(preparation.result)) {
    const scope = acceptancePreparationScope(value, preparation);
    if (!scope) return;
    const decisions = rows.flatMap(row => row.kind === 'blocked-scope-decided' ? [row.decision] : []);
    const decision = decisions.find(row => row.requestId === scope.binding.requestId)
      ?? (!preparation.confirmation ? decisions.findLast(row => row.option === 'wait' && rows.some(saved =>
        saved.kind === 'acceptance-preparation-observed' && saved.observation.prepareKey === preparation.prepareKey
        && acceptancePreparationScope(value, saved.observation)?.binding.requestId === row.requestId)) : undefined);
    return { ...scope, ...(decision ? { decision } : {}) };
  }
  const a11 = a11DispositionProjection(ledger, value);
  if (a11?.state === 'parked' && (!a11.retest || a11.retest.blocker || !cleanRetestObservation(a11, a11.observation)
    || a11.standardState !== 'verified' || a11.resumeExhausted || a11.confirmation)) {
    const scope = a11Scope(value, a11);
    const decisions = rows.flatMap(row => row.kind === 'blocked-scope-decided' ? [row.decision] : []);
    const decision = decisions.find(row => row.requestId === scope.binding.requestId)
      ?? (!a11.confirmation ? decisions.findLast(row => row.option === 'wait' &&
        rows.some(saved => saved.kind === 'a11-disposition-updated' && saved.disposition.key === a11.key
          && a11Scope(value, saved.disposition).binding.requestId === row.requestId)) : undefined);
    return { ...scope, ...(decision ? { decision } : {}) };
  }
  const prepared = rows.findLast(row => row.kind === 'blocked-scope-prepared');
  if (prepared?.kind !== 'blocked-scope-prepared' || prepared.scope.origin.entry !== value.entry) return;
  const resumed = rows.some(row => row.kind === 'blocked-scope-resumed' && row.requestId === prepared.scope.binding.requestId);
  const resumePending = resumed && prepared.scope.origin.task.stage === 'A12a' && value.graph?.tasks.some(task =>
    sameTask(task.task, prepared.scope.origin.task) && task.outcome === 'rework');
  if (resumed && !resumePending) return;
  const decision = rows.find(row => row.kind === 'blocked-scope-decided' && row.decision.requestId === prepared.scope.binding.requestId);
  return { ...prepared.scope, ...(decision?.kind === 'blocked-scope-decided' ? { decision: decision.decision } : {}),
    ...(resumePending ? { resumePending: true as const } : {}) };
}

export function blockedScopeEvent(input: DurableCapabilityEvent['input']): boolean {
  return ['blocked-scope-prepared', 'blocked-scope-decided', 'blocked-scope-resumed',
    'a11-disposition-updated', 'a11-disposition-resumed', 'a11-retest-observed', 'acceptance-preparation-observed',
    'evidence-collection-dispatched', 'evidence-collection-recorded', 'evidence-collection-closed', 'evidence-execution-recorded',
    'evidence-audit-blocked', 'b2-evidence-scope-prepared', 'b2-evidence-scope-decided'].includes(input.kind);
}

export function newEvidenceAuditScope(value: StoredInstance, task: DurableTaskBinding, basis: import('../../model/durable-workflow.ts').DurableEvidenceAuditBasis,
  reason: string, actions: Pick<DurableBlockedRoutingProjection, 'evidenceRoute' | 'evidenceCompromise'> = {}): DurableBlockedRoutingProjection {
  const original = newBlockedScope(value, task, basis.standard, reason, basis.candidateOid, undefined, false);
  const step = value.definition.steps[value.stepId];
  const stopId = step && 'action' in step ? step.on?.blocked ?? ('onFailure' in step ? step.onFailure : undefined) : undefined;
  const target = stopId ? value.definition.steps[stopId] : undefined;
  const options = original.options.filter(option => option.id !== 'stop' || target && 'terminal' in target && ['blocked', 'stopped'].includes(target.terminal));
  if (actions.evidenceRoute) options.unshift({ id: 'route', label: '换用已核实的取证来源', impact: '在同一候选和签发标准下，由原授权属主重新取证。来源：'
    + actions.evidenceRoute.artifacts.map(artifact => artifact.path || artifact.receiptId).join('、') });
  if (actions.evidenceCompromise) options.unshift({ id: 'compromise', label: '申请调整签发要求', impact: '原条目 '
    + actions.evidenceCompromise.requirementIds.join('、') + ' 改用可核候选文件时，当前无法实证的行为仍缺原执行证明。提议参考 '
    + actions.evidenceCompromise.paths.join('、') + '，需经原文件修订审批并重新审计。' });
  const evidenceAuditKey = digest(stableJson([value.ref, original.origin, basis, reason, options, actions]));
  return { ...original, ...actions, options, evidenceAuditKey,
    binding: { requestId: 'workflow-blocked-scope:' + evidenceAuditKey, digest: evidenceAuditKey, generation: basis.generation } };
}

function acceptancePreparationScope(value: StoredInstance, observation: DurableAcceptancePreparationObservation): DurableBlockedRoutingProjection | undefined {
  if (!isPreparationBlocker(observation.result)) return;
  const conflict = observation.materials.find(material => material.state !== 'verified');
  const extra = conflict ? ' 原签发依据当前状态：' + ({ missing: '缺失', drifted: '摘要已变', unreadable: '无法读取', verified: '已核对' })[conflict.state] + '。' : '';
  const scope = newBlockedScope(value, observation.basis.assessmentTask, observation.basis.criteria,
    observation.result.reason + extra, observation.basis.candidateOid, undefined, false);
  const retry = acceptancePreparationReworkStep(value);
  const rework = !observation.confirmation && !conflict && !!observation.rework
    && observation.effect?.state !== 'claimed' && observation.effect?.state !== 'unknown' && retry
    && (value.visits[retry.id] ?? 0) < retry.maxVisits;
  const options = observation.confirmation ? scope.options.map(option => option.id === 'wait'
    ? { ...option, label: '取消停止，继续等待' } : option)
    : rework ? [{ id: 'rework' as const, label: '由原运营安排 A11 返工',
      impact: '仅向获批原属主派发已核实的文件改动，真实收口后重新验收新候选。' }, ...scope.options] : scope.options;
  const sha = digest(stableJson([value.ref, observation.prepareKey, observation.digest, observation.generation, options]));
  return { ...scope, options, a12bPrepareKey: observation.prepareKey,
    binding: { requestId: 'workflow-blocked-scope:' + sha, digest: sha, generation: observation.generation } };
}

export function a11DispositionProjection(ledger: DurableLedger, value: StoredInstance): DurableA11Disposition | undefined {
  if (!blockedRoutingEnabled(value) || value.status !== 'waiting' || activeAction(value) !== 'operations-implementation') return;
  for (const row of ledger.facts(value.ref.instanceId).reverse()) {
    if (row.receipt.state === 'ignored' || row.fact.kind !== 'capability-event'
      || row.fact.stepId !== value.stepId || row.fact.attempt !== value.attempt) continue;
    const input = row.fact.event.input;
    if ((input.kind === 'a11-disposition-updated' || input.kind === 'a11-disposition-resumed' || input.kind === 'a11-retest-observed')
      && input.disposition.entry === value.entry) return input.disposition;
  }
}

export const a11RecoveryEffectKey = (key: string): string => 'a11-index-recovery:' + key;
export const a11ResumeModelKey = (key: string): string => 'model:a11-resume:' + key;
export function a11OperationsWakeModelKey(task: DurablePendingTask, disposition?: DurableA11Disposition): string {
  const generation = disposition?.retest?.reportReviewGeneration;
  return 'model:a11-wake:' + task.taskId + ':' + task.report?.key
    + (generation && sameTask(task.task, disposition?.childTask) ? ':review:' + generation : '');
}

export function a11ObservationValid(observation: DurableA11GitObservation): boolean {
  const sortedPaths = (paths: readonly string[] | undefined) => Array.isArray(paths) && paths.length <= 256
    && paths.every(path => safePath(path)) && new Set(paths).size === paths.length;
  return !!observation && validKey(observation.reason) && typeof observation.trackedDirty === 'boolean'
    && (observation.branch === undefined || validKey(observation.branch))
    && (observation.head === undefined || oidValid(observation.head))
    && (observation.indexDigest === undefined || hashValid(observation.indexDigest))
    && (observation.worktreeDigest === undefined || hashValid(observation.worktreeDigest))
    && (observation.lock === undefined || validKey(observation.lock))
    && sortedPaths(observation.stagedPaths) && (observation.untrackedPaths === undefined || sortedPaths(observation.untrackedPaths))
    && (observation.files === undefined || Array.isArray(observation.files)
      && observation.files.every(file => file && safePath(file.path) && hashValid(file.sha256))
      && sortedPaths(observation.files.map(file => file.path)));
}

export function a11RecoveryProof(ledger: DurableLedger, value: StoredInstance, child: DurablePendingTask,
  commitKey: string, candidateOid: string): DurableA11Disposition['recovery'] {
  const effects = ledger.effects(value.ref.instanceId);
  const after = effects.slice(effects.findIndex(effect => effect.intent.key === commitKey) + 1);
  const taskEffects = after.filter(effect => sameTask(effect.intent.task, child.task) && effect.intent.kind === 'task-write'
    && effect.state !== 'not-started');
  const additions = taskEffects.filter(effect => effect.intent.key.startsWith('git-add:'));
  const addition = additions[0];
  const expected = addition?.intent.expected;
  const result = addition?.result?.result;
  if (additions.length !== 1 || !addition || !addition.intent.key.startsWith('git-add:v2:') || addition.state !== 'succeeded'
    || after.some(effect => effect.intent.stepId === child.stepId && effect.intent.attempt === child.attempt
      && (effect.intent.kind === 'task-write' || effect.intent.kind === 'task-commit') && liveEffect(effect.state))
    || expected?.head !== candidateOid || expected.branch !== value.baseline?.branch
    || result?.beforeIndex !== expected.indexDigest || typeof result.beforeIndex !== 'string' || !hashValid(result.beforeIndex)
    || typeof result.afterIndex !== 'string' || !hashValid(result.afterIndex) || result.beforeIndex === result.afterIndex
    || result.afterBranch !== expected.branch || result.afterHead !== candidateOid || result.exitCode !== '0'
    || !Array.isArray(expected.paths) || !expected.paths.length || new Set(expected.paths).size !== expected.paths.length
    || expected.paths.some(path => !safePath(path) || /[*?\[\]]/.test(path)
      || /^(?:docs\/(?:product|intents|proposals|contracts|scheduling|quality|acceptance)\/)/.test(path)
      || !child.workOrder?.paths.some(root => path === root || root.endsWith('/') && path.startsWith(root)))) return;
  const paths = [...expected.paths].sort();
  const writes: DurableEvidenceRef[] = [];
  const beforeAdd = taskEffects.slice(0, taskEffects.indexOf(addition));
  for (const path of paths) {
    const recorded = beforeAdd.filter(effect => effect.state === 'succeeded' && effect.intent.key.startsWith('file:')
      && effect.intent.expected?.operation === 'write' && equal(effect.intent.expected.paths, [path]));
    const sha256 = recorded[0]?.intent.expected?.contentSha256;
    if (recorded.length !== 1 || typeof sha256 !== 'string' || !hashValid(sha256) || after.some(effect =>
      effect !== addition && effect !== recorded[0] && effect.intent.kind === 'task-write' && effect.state !== 'not-started'
      && Array.isArray(effect.intent.expected?.paths) && effect.intent.expected.paths.includes(path))) return;
    writes.push({ path, sha256 });
  }
  return { addEffectKey: addition.intent.key, beforeIndex: result.beforeIndex, afterIndex: result.afterIndex, paths, writes };
}

export function a11RecoveryObservationMatches(disposition: DurableA11Disposition): boolean {
  const { observation, recovery, candidateOid, branch } = disposition;
  return !!recovery && observation.head === candidateOid && observation.branch === branch
    && observation.indexDigest === recovery.afterIndex && !observation.trackedDirty && observation.untrackedPaths?.length === 0
    && !!observation.worktreeDigest && !observation.lock
    && equal([...observation.stagedPaths].sort(), [...recovery.paths].sort()) && !!observation.files
    && recovery.writes.every(write => observation.files!.some(file => equal(file, write)));
}

export function a11RecoveryClaimMatches(disposition: DurableA11Disposition, intent: DurableEffectIntent): boolean {
  const expected = intent.expected;
  return disposition.state === 'parked' && !disposition.resumeExhausted && disposition.standardState === 'verified'
    && a11RecoveryObservationMatches(disposition)
    && intent.kind === 'a11-index-recovery' && intent.key === a11RecoveryEffectKey(disposition.key)
    && sameTask(intent.task, disposition.childTask) && expected?.head === disposition.candidateOid
    && expected.branch === disposition.branch && expected.beforeIndex === disposition.recovery?.afterIndex
    && expected.worktreeDigest === disposition.observation.worktreeDigest
    && equal(expected.paths, disposition.recovery?.paths) && typeof expected.afterIndex === 'string' && hashValid(expected.afterIndex)
    && expected.afterIndex !== expected.beforeIndex && typeof expected.lockPid === 'string' && /^[1-9][0-9]*$/.test(expected.lockPid)
    && typeof expected.lockFileId === 'string' && validKey(expected.lockFileId);
}

function a11Scope(value: StoredInstance, disposition: DurableA11Disposition): DurableBlockedRoutingProjection {
  const state = {
    verified: '签发标准字节已核对。', missing: '原签发标准文件缺失。', drifted: '原签发标准文件摘要已变化。', unreadable: '原签发标准文件当前不可读取。',
  }[disposition.standardState];
  const scope = newBlockedScope(value, disposition.childTask, disposition.standard,
    [disposition.observation.reason, disposition.observation.lock, state, disposition.retest?.blocker,
      disposition.retest && implementationTestRulesText(disposition.retest.missingRequirements)].filter(Boolean).join(' '),
    disposition.candidateOid, undefined, false);
  const options = disposition.confirmation ? scope.options.map(option => option.id === 'wait'
    ? { ...option, label: '取消停止，继续等待' } : option) : scope.options;
  const sha = digest(stableJson([value.ref, disposition, options]));
  return { ...scope, options, a11DispositionKey: disposition.key,
    binding: { requestId: 'workflow-blocked-scope:' + sha, digest: sha, generation: disposition.generation } };
}

export function scopeGovernanceDigest(value: StoredInstance): string {
  const proofs = value.graph?.proofs;
  return digest(stableJson([value.ref, value.baseline, value.graph?.approvedProposalRequestId, proofs?.['intent-approved'],
    proofs?.['proposal-approved'], proofs?.appointed, proofs?.['team-plan'], proofs?.['standard-open'],
    ...(value.scope?.evidenceRequirements?.length ? [value.scope.key, value.scope.evidenceRequirements, value.scope.evidenceAuthorization] : [])]));
}

export function newBlockedScope(value: StoredInstance, task: DurableTaskBinding, document: DurableEvidenceRef, reason: string,
  candidateOid: string | undefined, capability: DurableVerificationCapability | undefined, canRevise: boolean): DurableBlockedRoutingProjection {
  const origin = { stepId: value.stepId, entry: value.entry, attempt: value.attempt, task };
  const options = [
    { id: 'wait' as const, label: '保留原标准并等待', impact: '等待原要求的前置条件可核验，保持现有批准材料。' },
    ...(canRevise ? [{ id: 'revise' as const, label: '请原属主提出修订', impact: '只能提出具体新版本，经原文件授权与核验后才可恢复。' }] : []),
    { id: 'stop' as const, label: '停止本次工作流', impact: '保留工作及不满足的证据，按原阻塞出口结束。' },
  ];
  const governanceDigest = scopeGovernanceDigest(value);
  const details = { origin, document, reason, candidateOid, capability, options, governanceDigest };
  const sha = digest(stableJson([value.ref, details]));
  return { kind: 'scope-change', binding: { requestId: 'workflow-blocked-scope:' + sha, digest: sha, generation: value.attempt }, ...details };
}
