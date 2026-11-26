import { basename, join, relative } from 'node:path';
import type {
  DurableAcceptanceDispatchPermit, DurableAcceptancePreparationObservation, DurableAcceptancePreparationResult, DurableTaskBinding,
  DurableAcceptanceEnvironmentBasis, DurableAcceptanceWorkspaceBinding, DurableAcceptanceWorkspaceBrowserCaptureReceipt, DurableAcceptanceWorkspaceCloseReceipt,
  DurableAcceptanceWorkspaceEvidenceReceipt, DurableAcceptanceWorkspacePreparationReceipt, DurableAcceptanceWorkspaceProjection,
  DurableAcceptanceWorkspaceRunReceipt, DurableEffect, DurableEffectIntent, DurableEffectOutcome, DurableEvidenceRef, DurablePendingTask, DurableResult,
} from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredEffect, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { assessmentBasis, recoveryBudget } from './acceptance-environment.ts';
import { currentProposalDecision } from './facts.ts';
import { activeAction, equal, fail, hashValid, ok, safePath, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';

const workspaceEffects = ['acceptance-workspace-prepare', 'acceptance-workspace-run',
  'acceptance-workspace-close', 'acceptance-workspace-evidence', 'acceptance-workspace-browser-capture'] as const;
type WorkspaceEffect = typeof workspaceEffects[number];

export function isAcceptanceWorkspaceEffect(kind: DurableEffect): kind is WorkspaceEffect {
  return workspaceEffects.some(effect => effect === kind);
}

function effectKey(kind: WorkspaceEffect, taskId: string): string {
  return kind + ':' + taskId;
}

export function acceptancePreparationReworkStep(value: StoredInstance, assessmentId = value.stepId) {
  const assess = value.definition.steps[assessmentId];
  if (!workflowOwnsDispatch(value) || value.definition.id !== 'path-a' || value.definition.version !== 8 || assessmentId !== 'assess'
    || !assess || !('action' in assess) || assess.action !== 'independent-assessment' || !('blockedRouting' in assess)
    || assess.blockedRouting !== true || !assess.on?.rework) return;
  const id = assess.on.rework;
  const retry = value.definition.steps[id];
  const implement = retry && 'action' in retry && retry.next ? value.definition.steps[retry.next] : undefined;
  if (retry && 'action' in retry && retry.action === 'retry-implementation' && retry.maxVisits
    && implement && 'action' in implement && implement.action === 'operations-implementation' && implement.next === assessmentId) {
    return { id, implementId: retry.next!, maxVisits: retry.maxVisits };
  }
}

export function acceptancePreparationEnabled(value: StoredInstance): boolean {
  return value.status === 'waiting' && !!acceptancePreparationReworkStep(value);
}

export function acceptancePreparationObservation(ledger: DurableLedger, value: StoredInstance): DurableAcceptancePreparationObservation | undefined {
  if (!acceptancePreparationEnabled(value)) return;
  const basis = assessmentBasis(value);
  if (!basis) return;
  const key = effectKey('acceptance-workspace-prepare', basis.assessmentTask.taskId);
  const row = ledger.facts(value.ref.instanceId).findLast(({ fact, receipt }) => receipt.state !== 'ignored'
    && fact.kind === 'capability-event' && fact.stepId === value.stepId && fact.attempt === value.attempt
    && fact.event.input.kind === 'acceptance-preparation-observed' && fact.event.input.observation.entry === value.entry
    && fact.event.input.observation.prepareKey === key && equal(fact.event.input.observation.basis, basis));
  const input = row?.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
  return input?.kind === 'acceptance-preparation-observed' ? input.observation : undefined;
}

export function isPreparationBlocker(result: DurableAcceptancePreparationResult): result is
  Exclude<DurableAcceptancePreparationResult, { kind: 'prepared' | 'not-applicable' }> {
  return result.kind === 'candidate-defect' || result.kind === 'material-conflict' || result.kind === 'unavailable';
}

export function acceptancePreparationEffectIdentity(effect: StoredEffect | undefined): DurableAcceptancePreparationObservation['effect'] {
  const receiptId = effect?.result?.result?.receiptId;
  return effect && { token: effect.token, state: effect.state, ...(typeof receiptId === 'string' ? { receiptId } : {}) };
}

export function acceptancePreparationPermit(ledger: DurableLedger, value: StoredInstance, task: DurableTaskBinding): DurableResult<DurableAcceptanceDispatchPermit> {
  if (task.stage !== 'A12b' || !acceptancePreparationReworkStep(value, 'assess')) return ok({});
  const assigned = value.graph?.tasks.find(row => sameTask(row.task, task));
  if (assigned?.environmentRecovery) return ok({});
  const denied = () => fail('acceptance-preparation-dispatch-held', '当前独立验收送达等待已登记且核验过的工作区准备结果。');
  if (!acceptancePreparationEnabled(value) || value.engine !== 'healthy' || !assigned || assigned.outcome
    || assigned.capability !== 'independent-assessment') return denied();
  const observation = acceptancePreparationObservation(ledger, value);
  if (!observation || !sameTask(task, observation.basis.assessmentTask) || isPreparationBlocker(observation.result)) return denied();
  const effect = ledger.effect(value.ref.instanceId, observation.prepareKey);
  if (observation.result.kind === 'prepared') {
    const receipt = effectReceipt<DurableAcceptanceWorkspacePreparationReceipt>(ledger, value, effect);
    if (effect?.result?.result?.receiptId !== observation.result.receiptId || receipt?.kind !== 'acceptance-workspace-prepared'
      || !validBinding(ledger, value, observation.basis, receipt.binding)) return denied();
  } else if (effect && effect.state !== 'not-started') return denied();
  return ok({ prepareKey: observation.prepareKey, generation: observation.generation });
}

function currentAssessment(value: StoredInstance): { basis: DurableAcceptanceEnvironmentBasis; task: DurablePendingTask } | undefined {
  if (value.status !== 'waiting' || activeAction(value) !== 'independent-assessment'
    || !recoveryBudget(value, value.stepId) && !acceptancePreparationEnabled(value)) return;
  const basis = assessmentBasis(value);
  const task = basis && value.graph?.tasks.find(item => sameTask(item.task, basis.assessmentTask));
  if (basis && task) return { basis, task };
}

function workspaceEffect(ledger: DurableLedger, value: StoredInstance, kind: WorkspaceEffect, taskId: string): StoredEffect | undefined {
  return ledger.effect(value.ref.instanceId, effectKey(kind, taskId));
}

function readReceipt<T>(ledger: DurableLedger, value: StoredInstance, receiptId: unknown): T | undefined {
  const bytes = typeof receiptId === 'string' && hashValid(receiptId) ? ledger.evidence(value.ref.instanceId, receiptId) : undefined;
  if (!bytes || digest(bytes) !== receiptId) return;
  try { return JSON.parse(bytes.toString('utf8')) as T; } catch { return; }
}

function effectReceipt<T>(ledger: DurableLedger, value: StoredInstance, effect: StoredEffect | undefined): T | undefined {
  return effect?.state === 'succeeded' ? readReceipt<T>(ledger, value, effect.result?.result?.receiptId) : undefined;
}

function validBinding(ledger: DurableLedger, value: StoredInstance, basis: DurableAcceptanceEnvironmentBasis, binding: DurableAcceptanceWorkspaceBinding): boolean {
  const root = join(value.projectRoot, '.ans', 'acceptance-runs', basis.assessmentTask.taskId);
  const requirements = binding?.staticRequirements;
  const approved = currentProposalDecision(ledger, value);
  return binding?.projectRoot === value.projectRoot && equal(binding.basis, basis) && binding.workspaceRoot === root
    && binding.inputRoot === join(root, 'input') && binding.outputRoot === join(root, 'output') && binding.evidenceRoot === join(root, 'evidence')
    && binding.launcherPath === join(root, 'build.mjs') && hashValid(binding.launcherSha256)
    && typeof binding.workspaceIdentity?.dev === 'string' && /^\d+$/.test(binding.workspaceIdentity.dev)
    && typeof binding.workspaceIdentity?.ino === 'string' && /^\d+$/.test(binding.workspaceIdentity.ino)
    && typeof binding.requiresBrowserEvidence === 'boolean'
    && binding.proposalDecisionDigest === approved?.selectionDigest
    && (binding.browserEvidenceSource === undefined && !(approved && binding.requiresBrowserEvidence)
      || binding.browserEvidenceSource === 'application-browser' && binding.requiresBrowserEvidence)
    && (binding.operation === undefined && requirements === undefined
      || binding.operation === 'static' && !!requirements
        && typeof requirements.build === 'boolean' && typeof requirements.requireDeliveryStartup === 'boolean'
        && typeof requirements.requireLogicTest === 'boolean'
        && (requirements.deliveryStartup === undefined ? !requirements.requireDeliveryStartup : validKey(requirements.deliveryStartup)));
}

export function acceptanceWorkspaceProjection(ledger: DurableLedger, value: StoredInstance): DurableAcceptanceWorkspaceProjection | undefined {
  const assessment = currentAssessment(value);
  if (!assessment) return;
  const { basis, task: { taskId } } = assessment;
  const prepareKey = effectKey('acceptance-workspace-prepare', taskId);
  const runKey = effectKey('acceptance-workspace-run', taskId);
  const closeKey = effectKey('acceptance-workspace-close', taskId);
  const evidenceKey = effectKey('acceptance-workspace-evidence', taskId);
  const preparedEffect = ledger.effect(value.ref.instanceId, prepareKey);
  const runEffect = ledger.effect(value.ref.instanceId, runKey);
  const closeEffect = ledger.effect(value.ref.instanceId, closeKey);
  const evidenceEffect = ledger.effect(value.ref.instanceId, evidenceKey);
  const prepared = effectReceipt<DurableAcceptanceWorkspacePreparationReceipt>(ledger, value, preparedEffect);
  const binding = prepared?.kind === 'acceptance-workspace-prepared' && validBinding(ledger, value, basis, prepared.binding) ? prepared.binding : undefined;
  const run = effectReceipt<DurableAcceptanceWorkspaceRunReceipt | DurableAcceptanceWorkspacePreparationReceipt>(ledger, value, runEffect);
  const receipt = run?.kind === 'acceptance-workspace-run' || run?.kind === 'acceptance-workspace-static-run' ? run : undefined;
  const closeReceipt = effectReceipt<DurableAcceptanceWorkspaceCloseReceipt>(ledger, value, closeEffect);
  const browserEvidence = effectReceipt<DurableAcceptanceWorkspaceEvidenceReceipt>(ledger, value, evidenceEffect);
  const unresolved = [preparedEffect, runEffect, closeEffect, evidenceEffect].find(effect => effect?.state === 'unknown');
  const reason = prepared?.kind === 'acceptance-workspace-blocked' ? prepared.reason
    : run?.kind === 'acceptance-workspace-blocked' ? run.reason : unresolved?.result?.evidence;
  const runReceiptId = receipt ? runEffect?.result?.result?.receiptId : undefined;
  const preparation = acceptancePreparationObservation(ledger, value);
  const blocker = preparation && isPreparationBlocker(preparation.result) ? preparation.result : undefined;
  return { basis, prepareKey, runKey, closeKey, evidenceKey, binding, receipt, closeReceipt, browserEvidence, reason: blocker?.reason ?? reason,
    ...(acceptancePreparationEnabled(value) ? { preparationGate: true as const, preparation } : {}),
    ...(typeof runReceiptId === 'string' ? { runReceiptId } : {}),
    state: blocker || reason ? 'blocked' : receipt ? 'ready-for-review' : runEffect?.state === 'claimed' ? 'running'
      : binding ? 'ready' : preparedEffect?.state === 'claimed' ? 'preparing' : 'eligible' };
}

export function allowAcceptanceWorkspaceEffect(ledger: DurableLedger, value: StoredInstance, intent: DurableEffectIntent): DurableResult<true> {
  const assessment = currentAssessment(value);
  if (!isAcceptanceWorkspaceEffect(intent.kind) || !assessment || !sameTask(intent.task, assessment.task.task)
    || intent.stepId !== value.stepId || intent.attempt !== value.attempt) {
    return fail('acceptance-workspace-effect-invalid', '作用未绑定当前独立验收任务及尝试。');
  }
  const workspace = acceptanceWorkspaceProjection(ledger, value)!;
  const sent = ledger.effect(value.ref.instanceId, 'model:' + assessment.task.taskId);
  if (workspace.preparationGate && intent.kind !== 'acceptance-workspace-prepare'
    && !acceptancePreparationPermit(ledger, value, assessment.task.task).ok) {
    return fail('acceptance-preparation-dispatch-held', '本次验收准备结果尚未作为当前回合依据。');
  }
  if (intent.kind === 'acceptance-workspace-browser-capture') {
    return browserCaptureCurrent(ledger, value, workspace, assessment.task, intent)
      ? ok(true) : fail('acceptance-browser-capture-stale', '浏览器操作未绑定当前质检回合和已批准的运行预览。');
  }
  if (intent.key !== effectKey(intent.kind, assessment.task.taskId)) {
    return fail('acceptance-workspace-effect-invalid', '作用未绑定当前独立验收任务及尝试。');
  }
  if (intent.kind === 'acceptance-workspace-prepare') {
    return (!sent || workspace.preparationGate && sent.state === 'not-started') && !assessment.task.report
      && ledger.effects(value.ref.instanceId).every(effect =>
        effect.intent.kind !== 'dispatch' || !sameTask(effect.intent.task, assessment.task.task)
          || workspace.preparationGate && effect.state === 'not-started')
      ? ok(true) : fail('acceptance-workspace-assessment-started', '本次验收已派发，不能重开工作区。');
  }
  if (!workspace.binding || workspace.state === 'blocked') return fail('acceptance-workspace-unavailable', '本次任务缺少可核验的应用工作区。');
  if (intent.kind === 'acceptance-workspace-run') {
    return sent?.intent.kind === 'model-send' && ['claimed', 'succeeded'].includes(sent.state) && !assessment.task.report
      ? ok(true) : fail('acceptance-workspace-run-invalid', '构建与预览必须由当前实际质检回合请求。');
  }
  return workspace.receipt ? ok(true) : fail('acceptance-workspace-run-unverified', '本次构建与预览缺少实际回执。');
}

function browserCaptureCurrent(ledger: DurableLedger, value: StoredInstance, workspace: DurableAcceptanceWorkspaceProjection,
  task: DurablePendingTask, intent: DurableEffectIntent): boolean {
  const live = workspace.receipt;
  const stage = live?.kind === 'acceptance-workspace-static-run' ? live.stage : live?.build;
  const { turnId, toolCallId, runReceiptId } = intent.expected ?? {};
  const model = ledger.effect(value.ref.instanceId, 'model:' + task.taskId);
  const closing = ledger.effect(value.ref.instanceId, workspace.closeKey);
  return workspace.binding?.browserEvidenceSource === 'application-browser' && workspace.state === 'ready-for-review'
    && !!live && typeof turnId === 'string' && turnId === stage?.turnId && typeof toolCallId === 'string' && validKey(toolCallId)
    && typeof runReceiptId === 'string' && runReceiptId === workspace.runReceiptId
    && intent.key === effectKey('acceptance-workspace-browser-capture', task.taskId) + ':' + digest(toolCallId)
    && !task.outcome && !task.report && (!closing || closing.state === 'not-started') && !workspace.closeReceipt
    && Date.now() >= Date.parse(live.preview.openedAt) && Date.now() < Date.parse(live.preview.expiresAt)
    && model?.intent.kind === 'model-send' && sameTask(model.intent.task, task.task)
    && (model.state === 'claimed' || model.state === 'succeeded' && model.result?.result?.turnId === turnId);
}

export function isBrowserCaptureArtifact(binding: DurableAcceptanceWorkspaceBinding, ref: DurableEvidenceRef, format: 'json' | 'png'): boolean {
  if (typeof ref?.path !== 'string' || typeof ref.sha256 !== 'string') return false;
  const prefix = relative(binding.projectRoot, binding.evidenceRoot).replaceAll('\\', '/') + '/';
  const leaf = ref.path.slice(prefix.length);
  return ref.path.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(leaf) && leaf.endsWith('.' + format) && hashValid(ref.sha256);
}

export function verifyBrowserCaptureEvents(receipt: DurableAcceptanceWorkspaceBrowserCaptureReceipt, bytes: Buffer): 'interaction' | 'observation' | undefined {
  try {
    const body = JSON.parse(bytes.toString('utf8')) as { kind?: unknown; events?: unknown };
    if (body.kind !== 'acceptance-browser-events' || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 256) return;
    const ended = Date.parse(receipt.endedAt);
    let previous = Date.parse(receipt.startedAt);
    let interaction = false;
    const seen = new Set<string>();
    for (const event of body.events) {
      if (!event || typeof event.at !== 'string') return;
      const at = Date.parse(event.at);
      if (!(at >= previous && at <= ended)) return;
      previous = at;
      if (event.kind === 'keydown' || event.kind === 'keyup') {
        if (typeof event.key !== 'string' || !validKey(event.key) || event.key.length > 32) return;
        interaction ||= event.kind === 'keydown';
      } else if (event.kind === 'click') {
        if (![event.x, event.y].every(point => Number.isFinite(point) && point >= 0 && point <= 32_768)) return;
        interaction = true;
      } else if (event.kind === 'screenshot') {
        if (seen.has(event.path) || !receipt.screenshots.some(file => file.path === event.path)) return;
        seen.add(event.path);
      } else if (event.kind !== 'wait' || (event.ms !== undefined && !(Number.isFinite(event.ms) && event.ms >= 0 && event.ms <= 60_000))) return;
    }
    if (seen.size !== receipt.screenshots.length) return;
    return interaction ? 'interaction' : 'observation';
  } catch { return; }
}

function validRun(ledger: DurableLedger, value: StoredInstance, binding: DurableAcceptanceWorkspaceBinding,
  receipt: DurableAcceptanceWorkspaceRunReceipt): boolean {
  const stage = receipt.kind === 'acceptance-workspace-static-run' ? receipt.stage : receipt.build;
  const { preview } = receipt;
  if (!stage || !preview || (receipt.kind === 'acceptance-workspace-static-run') !== (binding.operation === 'static')) return false;
  const turn = ledger.effect(value.ref.instanceId, 'model:' + binding.basis.assessmentTask.taskId);
  const window = Date.parse(preview.expiresAt) - Date.parse(preview.openedAt);
  return validKey(stage.reviewedBy) && validKey(stage.turnId) && validKey(stage.toolCallId)
    && turn?.intent.kind === 'model-send' && sameTask(turn.intent.task, binding.basis.assessmentTask)
    && (turn.state === 'claimed' || turn.state === 'succeeded' && turn.result?.result?.turnId === stage.turnId)
    && equal(stage.argv, ['node', binding.launcherPath]) && stage.cwd === binding.inputRoot && stage.writeAuditPassed === true
    && hashValid(stage.outputSha256) && hashValid(stage.entrySha256)
    && (receipt.kind === 'acceptance-workspace-static-run' ? validStaticFiles(receipt)
      : Number.isSafeInteger(receipt.build.pid) && receipt.build.pid > 0 && receipt.build.exitCode === 0)
    && preview.reviewedBy === stage.reviewedBy && Number.isSafeInteger(preview.port) && preview.port > 0 && preview.port <= 65535
    && preview.url === 'http://127.0.0.1:' + preview.port + '/' && preview.httpStatus === 200
    && window > 0 && window <= 15 * 60_000;
}

function validStaticFiles(receipt: Extract<DurableAcceptanceWorkspaceRunReceipt, { kind: 'acceptance-workspace-static-run' }>): boolean {
  const { stage } = receipt;
  if ('build' in receipt || 'pid' in stage || 'exitCode' in stage || !Array.isArray(stage.files) || stage.files.length < 1
    || stage.files.length > 256 || stage.files.some((file, index) => !safePath(file?.path) || !hashValid(file?.sha256)
      || /^(?:docs|tools)(?:\/|$)/i.test(file.path) || file.path.split('/').some((part: string) => part.startsWith('.'))
      || index > 0 && stage.files[index - 1]!.path >= file.path)) return false;
  if (new Set(stage.files.map(file => file.path.toLowerCase())).size !== stage.files.length) return false;
  const sha = digest(stableJson(stage.files.map(file => [file.path, file.sha256])));
  return sha === stage.inputSha256 && sha === stage.outputSha256
    && stage.files.some(file => file.path === 'index.html' && file.sha256 === stage.entrySha256);
}

function captureReceiptMatches(workspace: DurableAcceptanceWorkspaceProjection, intent: DurableEffectIntent,
  receipt: DurableAcceptanceWorkspaceBrowserCaptureReceipt): boolean {
  const preview = workspace.receipt?.preview;
  const began = Date.parse(receipt.startedAt), ended = Date.parse(receipt.endedAt);
  return !!preview && receipt.runReceiptId === workspace.runReceiptId && receipt.runReceiptId === intent.expected?.runReceiptId
    && receipt.url === preview.url && receipt.turnId === intent.expected?.turnId && receipt.toolCallId === intent.expected?.toolCallId
    && began >= Date.parse(preview.openedAt) && ended >= began && ended <= Date.parse(preview.expiresAt) && ended <= Date.now()
    && isBrowserCaptureArtifact(receipt.binding, receipt.events, 'json') && Array.isArray(receipt.screenshots) && receipt.screenshots.length <= 4
    && receipt.screenshots.every(shot => isBrowserCaptureArtifact(receipt.binding, shot, 'png'))
    && new Set(receipt.screenshots.map(shot => shot.path)).size === receipt.screenshots.length;
}

function capturedBrowserEvidenceMatches(ledger: DurableLedger, value: StoredInstance, workspace: DurableAcceptanceWorkspaceProjection,
  evidence: DurableAcceptanceWorkspaceEvidenceReceipt): boolean {
  const ids = evidence.captureReceiptIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 64 || new Set(ids).size !== ids.length || !ids.every(hashValid)) return false;
  const task = workspace.basis.assessmentTask;
  const effects = ledger.effects(value.ref.instanceId).filter(effect => effect.intent.kind === 'acceptance-workspace-browser-capture'
    && effect.state === 'succeeded' && sameTask(effect.intent.task, task));
  const artifactPrefix = 'docs/verification/' + value.graph?.flowId + '-' + task.taskId + '-';
  const observed = Date.parse(evidence.observedAt);
  let interaction = false;
  const screenshots = new Map<string, string>();
  for (const id of ids) {
    const effect = effects.find(row => row.result?.result?.receiptId === id);
    const capture = effect && effectReceipt<DurableAcceptanceWorkspaceBrowserCaptureReceipt>(ledger, value, effect);
    if (!effect || !capture || capture.kind !== 'acceptance-workspace-browser-capture' || !equal(capture.binding, evidence.binding)
      || !captureReceiptMatches(workspace, effect.intent, capture)
      || Date.parse(capture.startedAt) > observed || Date.parse(capture.endedAt) > Date.parse(workspace.closeReceipt?.closedAt ?? workspace.receipt!.preview.expiresAt)) return false;
    const bytes = ledger.evidence(value.ref.instanceId, capture.events.sha256);
    const action = bytes && verifyBrowserCaptureEvents(capture, bytes);
    if (!action || digest(bytes!) !== capture.events.sha256) return false;
    interaction ||= action === 'interaction';
    for (const shot of capture.screenshots) screenshots.set(artifactPrefix + basename(shot.path), shot.sha256);
  }
  const submitted = evidence.artifacts.filter(artifact => artifact.path.endsWith('.png'));
  return interaction && submitted.length > 0 && submitted.every(artifact => screenshots.get(artifact.path) === artifact.sha256);
}

export function verifyAcceptanceWorkspaceEffect(ledger: DurableLedger, value: StoredInstance, effect: StoredEffect,
  outcome: DurableEffectOutcome, trustedBrowserCapture = false): DurableResult<true> {
  const assessment = currentAssessment(value);
  if (!assessment || !sameTask(effect.intent.task, assessment.task.task)) {
    return fail('acceptance-workspace-effect-stale', '本次工作区作用已脱离原验收任务。');
  }
  if (outcome.outcome !== 'succeeded') return ok(true);
  const receipt = readReceipt<DurableAcceptanceWorkspacePreparationReceipt | DurableAcceptanceWorkspaceRunReceipt |
    DurableAcceptanceWorkspaceCloseReceipt | DurableAcceptanceWorkspaceEvidenceReceipt | DurableAcceptanceWorkspaceBrowserCaptureReceipt>(
    ledger, value, outcome.result?.receiptId);
  const workspace = acceptanceWorkspaceProjection(ledger, value)!;
  if (receipt?.kind === 'acceptance-workspace-blocked' && equal(receipt.basis, workspace.basis) && validKey(receipt.reason)
    && (effect.intent.kind === 'acceptance-workspace-prepare' || effect.intent.kind === 'acceptance-workspace-run')) return ok(true);
  if (effect.intent.kind === 'acceptance-workspace-prepare' && receipt?.kind === 'acceptance-workspace-prepared'
    && validBinding(ledger, value, workspace.basis, receipt.binding)) return ok(true);
  if (receipt && typeof receipt === 'object' && 'binding' in receipt && workspace.binding && equal(receipt.binding, workspace.binding)) {
    if (effect.intent.kind === 'acceptance-workspace-run' && (receipt.kind === 'acceptance-workspace-run' || receipt.kind === 'acceptance-workspace-static-run')
      && validRun(ledger, value, workspace.binding, receipt)) return ok(true);
    if (effect.intent.kind === 'acceptance-workspace-browser-capture' && receipt.kind === 'acceptance-workspace-browser-capture'
      && trustedBrowserCapture && browserCaptureCurrent(ledger, value, workspace, assessment.task, effect.intent)
      && captureReceiptMatches(workspace, effect.intent, receipt)) return ok(true);
    const actual = workspace.receipt;
    if (actual && effect.intent.kind === 'acceptance-workspace-close' && receipt.kind === 'acceptance-workspace-closed'
      && receipt.url === actual.preview.url && Date.parse(receipt.closedAt) >= Date.parse(actual.preview.openedAt)) return ok(true);
    if (actual && effect.intent.kind === 'acceptance-workspace-evidence' && receipt.kind === 'acceptance-workspace-browser-evidence'
      && receipt.url === actual.preview.url && Date.parse(receipt.observedAt) >= Date.parse(actual.preview.openedAt)
      && Date.parse(receipt.observedAt) <= Date.parse(workspace.closeReceipt?.closedAt ?? actual.preview.expiresAt)
      && Date.parse(receipt.observedAt) <= Date.parse(actual.preview.expiresAt)
      && Array.isArray(receipt.checks) && receipt.checks.length > 0 && receipt.checks.every(validKey)
      && Array.isArray(receipt.artifacts) && receipt.artifacts.length > 0 && receipt.artifacts.length <= 32
      && receipt.artifacts.every(artifact => safePath(artifact.path) && artifact.path.startsWith('docs/verification/') && hashValid(artifact.sha256))
      && (workspace.binding.browserEvidenceSource === 'application-browser'
        ? capturedBrowserEvidenceMatches(ledger, value, workspace, receipt) : receipt.captureReceiptIds === undefined))
      return ok(true);
  }
  return fail('acceptance-workspace-receipt-invalid', '回执缺当前工作区、审批、作用或实物核验。');
}

export function workspaceWasPrepared(ledger: DurableLedger, value: StoredInstance, taskId: string): boolean {
  if (acceptancePreparationObservation(ledger, value)?.result.kind === 'not-applicable') return false;
  return workspaceEffect(ledger, value, 'acceptance-workspace-prepare', taskId) !== undefined;
}
