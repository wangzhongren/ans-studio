import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import type { DurableAcceptanceEnvironmentBasis, DurableAcceptanceEnvironmentMissing, DurableAcceptanceEnvironmentProjection,
  DurableCapabilityEvent, DurableEffectIntent, DurableEvidenceRef, DurablePendingTask } from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredInstance } from '../../provider/durable-workflow/public.ts';
import type { AcceptanceEnvironmentReviewScope } from '../../model/runtime.ts';
import { activeAction, equal, hashValid, oidValid, validKey, workflowOwnsDispatch } from './rules.ts';

export function recoveryBudget(value: StoredInstance, assessmentId: string) {
  const assessment = value.definition.steps[assessmentId];
  if (!workflowOwnsDispatch(value) || !assessment || !('action' in assessment)
    || assessment.action !== 'independent-assessment') return;
  const id = assessment.on?.['environment-missing'];
  const step = id && value.definition.steps[id];
  if (id && step && 'action' in step && step.action === 'open-environment-recovery' && step.maxVisits) {
    return { id, maxAttempts: step.maxVisits };
  }
}

export function assessmentBasis(value: StoredInstance): DurableAcceptanceEnvironmentBasis | undefined {
  const graph = value.graph;
  const assessment = graph?.tasks.find(task => task.capability === 'independent-assessment'
    && task.stepId === value.stepId && task.attempt === value.attempt && !task.outcome);
  const standard = graph?.tasks.findLast(task => task.capability === 'independent-standard'
    && task.outcome === 'accepted' && task.roleId === assessment?.roleId && task.baselineOid === value.baseline?.oid);
  const criteria = standard?.documents?.find(document =>
    new RegExp('^docs/quality/' + graph?.flowId + '-criteria-v[1-9][0-9]*\\.md$').test(document.path));
  const candidateOid = graph?.proofs.implementationTip ?? graph?.proofs.acceptedTip;
  if (assessment && criteria && candidateOid && oidValid(candidateOid) && value.baseline) {
    return { candidateOid, branch: value.baseline.branch, criteria, assessmentTask: assessment.task };
  }
}

export function recoveryMissing(ledger: DurableLedger, value: StoredInstance) {
  const rows = ledger.facts(value.ref.instanceId);
  const last = rows.findLast(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event'
    && row.fact.event.input.kind === 'environment-missing');
  if (last?.fact.kind === 'capability-event' && last.fact.event.input.kind === 'environment-missing') {
    return { event: last.fact.event, missing: last.fact.event.input.missing };
  }
}

export function recoveryVisitsKey(basis: DurableAcceptanceEnvironmentBasis): string {
  return 'environment:' + digest(stableJson([basis.candidateOid, basis.criteria]));
}

export function recoveryInstallKey(child: DurablePendingTask): string {
  return 'environment-install:' + child.taskId;
}

export function recoveryTasks(value: StoredInstance) {
  const tasks = value.graph?.tasks.filter(task => task.capability === 'operations-environment-recovery'
    && task.stepId === value.stepId && task.attempt === value.attempt) ?? [];
  return { parent: tasks.find(task => task.environmentRecovery === 'parent'), child: tasks.find(task => task.environmentRecovery === 'child') };
}

export function recoveryOwners(value: StoredInstance, missing: DurableAcceptanceEnvironmentMissing): readonly string[] {
  if (!value.graph?.proofs.appointed || !value.graph.proofs['team-plan'] || !value.graph.approvedProposalRequestId) return [];
  const activated = value.graph.activatedRoles ?? [];
  return (value.graph.writeSets ?? []).filter(set => activated.includes(set.roleId) && value.graph?.expectedRoles?.includes(set.roleId)
    && set.roleId !== missing.basis.assessmentTask.roleId && set.paths.includes(missing.manifest.path)).map(set => set.roleId);
}

export function recoveryEvent(input: DurableCapabilityEvent['input']): boolean {
  return input.kind === 'environment-missing' || input.kind === 'environment-recovery-dispatch' || input.kind === 'environment-recovery-settled';
}

export function validMissingEvidence(missing: DurableAcceptanceEnvironmentMissing): boolean {
  const condition = missing.manifest?.path === 'package.json' && hashValid(missing.manifest.sha256)
    && (missing.lock === undefined || missing.lock?.path === 'package-lock.json' && hashValid(missing.lock.sha256))
    && missing.condition?.kind === 'npm-local-executable'
    && typeof missing.condition.script === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(missing.condition.script)
    && typeof missing.condition.executable === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(missing.condition.executable);
  if (!condition) return false;
  if (missing.origin === 'preflight') {
    return (missing.installTarget === undefined || missing.installTarget === 'assessment-private') && missing.report === undefined
      && missing.reportKey === undefined && missing.originId === undefined && missing.commandReceiptId === undefined;
  }
  return (missing.origin === undefined || missing.origin === 'report')
    && missing.installTarget === undefined
    && missing.report?.path === 'ans-evidence/' + missing.report?.sha256 && hashValid(missing.report.sha256)
    && validKey(missing.originId) && validKey(missing.reportKey)
    && (missing.commandReceiptId === undefined || validKey(missing.commandReceiptId));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

interface PrivateInstallProof {
  dependenciesLocation: { path: string; identity: { dev: string; ino: string } };
  dependenciesSha256: string;
}

function decimalIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
}

function directoryMatches(path: string, dev: unknown, ino: unknown): boolean {
  if (!decimalIdentity(dev) || !decimalIdentity(ino)) return false;
  try {
    const stats = lstatSync(path, { bigint: true });
    return stats.isDirectory() && !relative(path, realpathSync.native(path))
      && stats.dev.toString() === dev && stats.ino.toString() === ino;
  } catch { return false; }
}

export function privateInstallClaimMatches(value: StoredInstance, missing: DurableAcceptanceEnvironmentMissing,
  child: DurablePendingTask, intent: DurableEffectIntent, sentTurn: unknown): boolean {
  const expected = intent.expected;
  if (missing.installTarget !== 'assessment-private') return expected?.installTarget === undefined;
  const path = join(value.projectRoot, '.ans', 'acceptance-deps', child.taskId, 'node_modules');
  if (!expected || expected.installTarget !== 'assessment-private' || expected.publishDirectory !== path
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(child.taskId)
    || typeof expected.stagingDirectory !== 'string' || dirname(expected.stagingDirectory) !== join(value.projectRoot, '.ans')
    || !/^acceptance-npm-[a-z0-9]{6}$/i.test(basename(expected.stagingDirectory))
    || typeof expected.manifestSha256 !== 'string' || !hashValid(expected.manifestSha256)
    || expected.lockSha256 !== missing.lock?.sha256 || expected.criteriaSha256 !== missing.basis.criteria.sha256
    || expected.candidateOid !== missing.basis.candidateOid || typeof expected.turnId !== 'string' || !validKey(expected.turnId)
    || sentTurn !== undefined && expected.turnId !== sentTurn || typeof expected.toolCallId !== 'string' || !validKey(expected.toolCallId)
    || !Array.isArray(expected.argv) || expected.argv[0] !== 'npm' || expected.argv[1] !== (missing.lock ? 'ci' : 'install')
    || !expected.argv.includes('--ignore-scripts') || !expected.argv.includes('--prefix=' + expected.stagingDirectory)
    || !directoryMatches(expected.stagingDirectory, expected.stagingDev, expected.stagingIno)
    || !directoryMatches(dirname(path), expected.publishDev, expected.publishIno)) return false;
  try { return lstatSync(path, { throwIfNoEntry: false }) === undefined; } catch { return false; }
}

function recoveryEvidence(ledger: DurableLedger, instanceId: string, sha: string): Record<string, unknown> | undefined {
  const bytes = hashValid(sha) ? ledger.evidence(instanceId, sha) : undefined;
  if (!bytes || digest(bytes) !== sha) return;
  try { return asRecord(JSON.parse(bytes.toString('utf8'))); } catch { return; }
}

function privateInstallProof(receipt: Record<string, unknown>): PrivateInstallProof | undefined {
  const { path, identity } = asRecord(receipt.dependenciesLocation);
  const { dev, ino } = asRecord(identity);
  const sha = receipt.dependenciesSha256;
  if (typeof path !== 'string' || !decimalIdentity(dev) || !decimalIdentity(ino) || typeof sha !== 'string' || !hashValid(sha)) return;
  return { dependenciesLocation: { path, identity: { dev, ino } }, dependenciesSha256: sha };
}

function publicationStillMatches(expected: NonNullable<DurableEffectIntent['expected']>, proof: PrivateInstallProof): boolean {
  const { path, identity } = proof.dependenciesLocation;
  return path === expected.publishDirectory && directoryMatches(dirname(path), expected.publishDev, expected.publishIno)
    && directoryMatches(path, identity.dev, identity.ino);
}

export function privateInstallReceiptMatches(ledger: DurableLedger, value: StoredInstance, intent: DurableEffectIntent, sha: string): boolean {
  const expected = intent.expected;
  if (expected?.installTarget !== 'assessment-private') return true;
  const receipt = recoveryEvidence(ledger, value.ref.instanceId, sha);
  const task = intent.task;
  if (!receipt || !task || receipt.kind !== 'npm-environment-install' || receipt.taskId !== task.taskId
    || receipt.turnId !== expected.turnId || receipt.toolCallId !== expected.toolCallId || receipt.candidateOid !== expected.candidateOid
    || receipt.cwd !== expected.stagingDirectory || !equal(receipt.argv, expected.argv)) return false;
  const scope = asRecord(receipt.acceptanceEnvironmentScope) as Partial<AcceptanceEnvironmentReviewScope>;
  if (scope.kind !== 'application-isolated-npm-restore' || scope.projectRoot !== value.projectRoot || scope.instanceId !== value.ref.instanceId
    || scope.flowId !== value.graph?.flowId || scope.stepId !== intent.stepId || scope.attempt !== intent.attempt || scope.taskId !== task.taskId
    || scope.roleId !== task.roleId || scope.effectKey !== intent.key || scope.turnId !== expected.turnId || scope.toolCallId !== expected.toolCallId
    || scope.candidateOid !== expected.candidateOid || scope.criteriaSha256 !== expected.criteriaSha256
    || scope.manifestSha256 !== expected.manifestSha256 || scope.lockSha256 !== expected.lockSha256
    || scope.stagingDirectory !== expected.stagingDirectory || scope.stagingIdentity?.dev !== expected.stagingDev
    || scope.stagingIdentity?.ino !== expected.stagingIno || scope.publishDirectory !== expected.publishDirectory
    || scope.publishIdentity?.dev !== expected.publishDev || scope.publishIdentity?.ino !== expected.publishIno) return false;
  if (receipt.result === 'blocked') return true;
  if ((receipt.result !== 'installed' && receipt.result !== 'retryable')
    || !installProcessMatches(receipt, receipt.result === 'installed' ? 'restored' : 'retryable')) return false;
  if (receipt.result === 'retryable') return true;
  const proof = privateInstallProof(receipt);
  return !!proof && publicationStillMatches(expected, proof);
}

export function privateRecoveryVerificationMatches(ledger: DurableLedger, value: StoredInstance, intent: DurableEffectIntent,
  commandSha: string, verification: DurableEvidenceRef): boolean {
  if (intent.expected?.installTarget !== 'assessment-private') return false;
  const command = recoveryEvidence(ledger, value.ref.instanceId, commandSha);
  const verified = verification.path === 'ans-evidence/' + verification.sha256
    ? recoveryEvidence(ledger, value.ref.instanceId, verification.sha256) : undefined;
  const proof = command && privateInstallProof(command);
  return !!proof && !!verified && equal(proof, privateInstallProof(verified))
    && privateInstallReceiptMatches(ledger, value, intent, commandSha);
}

export function preflightScriptVerified(condition: DurableAcceptanceEnvironmentMissing['condition'],
  manifest: unknown, lock: unknown, criteria: string): boolean {
  const { script, executable } = condition;
  if (!['build', 'start', 'dev'].includes(script)
    && !Array.from(criteria.matchAll(/\bnpm\s+(?:(?:run|run-script)\s+([\w:-]+)|(start|test)\b)/g),
      match => match[1] ?? match[2]).includes(script)) return false;
  const source = asRecord(manifest);
  const scripts = asRecord(source.scripts);
  const body = scripts[script];
  if (typeof body !== 'string' || scripts['pre' + script] || scripts['post' + script]
    || /^[ \t]*([a-zA-Z0-9][a-zA-Z0-9_.-]*)(?:[ \t]+[^\r\n;|&><`$]*|[ \t]*)$/.exec(body)?.[1] !== executable) return false;
  const declared = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap(key =>
    Object.entries(asRecord(source[key])).filter(([, spec]) => typeof spec === 'string' && spec.trim() !== '').map(([name]) => name)));
  const packages = asRecord(asRecord(lock).packages);
  const matches = [...declared].filter(name => {
    const { bin } = asRecord(packages['node_modules/' + name]);
    return bin === undefined || typeof bin === 'string'
      ? name.split('/').at(-1) === executable
      : typeof asRecord(bin)[executable] === 'string' && String(asRecord(bin)[executable]).trim() !== '';
  });
  return matches.length === 1;
}

export function recoveryCommandConfirms(ledger: DurableLedger, value: StoredInstance, receiptId: string, child: DurablePendingTask,
  turnId: string, outcome: 'restored' | 'retryable'): boolean {
  const receipt = recoveryEvidence(ledger, value.ref.instanceId, receiptId);
  const candidateOid = value.graph?.proofs.implementationTip ?? value.graph?.proofs.acceptedTip;
  return receipt?.kind === 'npm-environment-install' && receipt.taskId === child.taskId && receipt.turnId === turnId
    && receipt.candidateOid === candidateOid && installProcessMatches(receipt, outcome);
}

function installProcessMatches(receipt: Record<string, unknown>, outcome: 'restored' | 'retryable'): boolean {
  const process = asRecord(receipt.process);
  return receipt.decision === 'allowed' && typeof receipt.reviewedBy === 'string' && validKey(receipt.reviewedBy)
    && process.status === 'exited' && typeof process.pid === 'number' && Number.isSafeInteger(process.pid) && process.pid > 0
    && typeof process.outputDigest === 'string' && hashValid(process.outputDigest)
    && (outcome === 'restored' ? receipt.result === 'installed' && process.exitCode === 0
      : receipt.result === 'retryable' && typeof process.exitCode === 'number' && Number.isSafeInteger(process.exitCode)
        && process.exitCode > 0 && process.transientNetworkFailure === true);
}

export function recoveryProjection(ledger: DurableLedger, value: StoredInstance): DurableAcceptanceEnvironmentProjection | undefined {
  const action = activeAction(value);
  const assessment = action === 'independent-assessment';
  const reason = value.businessReason;
  const blocked = value.status === 'blocked' && !!reason?.startsWith('验收环境补齐');
  if (!blocked && !assessment && action !== 'open-environment-recovery' && action !== 'operations-environment-recovery') return;
  const covered = recoveryMissing(ledger, value);
  const budget = recoveryBudget(value, assessment ? value.stepId : covered?.event.stepId ?? '');
  if (!budget) return;
  const current = assessment ? assessmentBasis(value) : undefined;
  const missing = covered?.missing;
  const sameBasis = current && missing && current.candidateOid === missing.basis.candidateOid && equal(current.criteria, missing.basis.criteria);
  const relevant = assessment && current && !sameBasis ? undefined : missing;
  const basis = current ?? relevant?.basis;
  const attempts = basis ? value.visits[recoveryVisitsKey(basis)] ?? 0 : 0;
  const tasks = blocked ? value.graph?.tasks.filter(task => task.environmentRecovery && task.attempt === value.attempt) : undefined;
  const { parent, child } = tasks ? { parent: tasks.find(task => task.environmentRecovery === 'parent'),
    child: tasks.find(task => task.environmentRecovery === 'child') } : recoveryTasks(value);
  return { enabled: true, basis, missing: relevant, state: blocked ? 'blocked' : assessment ? attempts ? 'rechecking' : 'assessment' : 'recovering',
    attempts, maxAttempts: budget.maxAttempts, parentTask: parent?.task, childTask: child?.task,
    effectKey: child ? recoveryInstallKey(child) : undefined, eligibleRoleIds: relevant && recoveryOwners(value, relevant), reason };
}
