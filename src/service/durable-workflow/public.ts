import { basename, dirname, isAbsolute, join, relative, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import type { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { DURABLE_ACTIVITY_CONTRACT, DURABLE_EXECUTOR, DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR,
  DURABLE_EVIDENCE_AUDIT_EXECUTOR, DURABLE_EVIDENCE_AUDIT_ACTIVITY_CONTRACT } from '../../model/durable-workflow.ts';
import type {
  DurableAcceptanceDispatchPermit, DurableAcceptancePreparationInput, DurableAcceptancePreparationObservation,
  DurableAcceptancePreparationPath, DurableAcceptancePreparationRework, DurableAcceptancePreparationResult,
  DurableCloseEvidenceCollectionInput, DurableDispatchEvidenceCollectionInput, DurableEvidenceAuditProjection, DurableEvidenceAuditRecord,
  DurableB2EvidenceDecision, DurableEvidenceBlockerInput, DurableEvidenceCollectionArtifact, DurableRecordEvidenceCollectionInput,
  DurableA11Disposition, DurableA11GitObservation,
  DurableAcceptanceEnvironmentDispatch, DurableAcceptanceEnvironmentMissing, DurableAcceptanceEnvironmentSettlement,
  DurableAcceptanceWorkspaceBrowserCaptureReceipt, DurableAcceptanceWorkspaceProjection, DurableAcceptanceWorkspaceRunReceipt, DurableGraphCard, DurableProposalDecision,
  DurableBlockedRoutingProjection, DurableBlockedScopeDecisionInput, DurableBlockedScopeRequest, DurableVerificationCapabilitySnapshot, DurableVerificationPreflightFn,
  DurableCapabilityEvent, DurableDecisionBinding, DurableDefinitionSelection, DurableDefinitionSnapshot, DurableDelivery, DurableDomainRequest, DurableEffect, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableEffectRecord,
  DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableInstanceRef, DurableOwner, DurableProjection, DurableResult, DurableStartInput,
  DurableReleaseDecisionInput, DurableStartProposal, DurableStartProposalDecisionInput, DurableStartProposalInput, DurableTaskBinding, DurableReviewPreflightFn,
} from '../../model/durable-workflow.ts';
import {
  changeWorkspaceOwner, DurableLedger, definitionFiles, digest, gitRead, pinRepositoryDefinition, readCandidateBlob, readImportedDefinition, readProjectFile, releaseOwner,
  repositoryIdentity, repositoryOwner, reserveOwnerState, reserveWorkspace, saveDefinitionFile, stableJson, workspaceIdentity, workspaceOwner,
} from '../../provider/durable-workflow/public.ts';
import type { OutboxItem, StoredInstance, StoredStartSelection, WorkspaceIdentity, WorkspaceReservation } from '../../provider/durable-workflow/public.ts';
import { checkGitProtectionFactsCurrent, readGitProtectionFacts } from '../../provider/trunk/public/trunk-store.ts';
import { deriveDurableEvidenceWriter, deriveDurablePathBWriteSets, finalizeIntent, readWorkflowLedger } from '../../common/编排/workflow-service.ts';
import { appendTaskEvent, DEFAULT_TASKS_MAX_BYTES, readTaskState, TASKS_STATE_REL, taskEvent, validateTaskStateEvent } from '../../common/编排/task-state.ts';
import { loadLatestRoster, parseIntentDecisionRequirements, parseProposalDecisionFields, proposalDecisionChoices, reviewRoleIdOfRoster } from '../../common/编排/workflow-preconditions.ts';
import { parseCriteriaText, parseEvidenceMeta } from '../../common/编排/evidence-check.ts';
import { domainWorkflowView, withWorkflowValidation } from '../../common/编排/workflow-state.ts';
import { WORKFLOW_LEDGER_SCHEMA } from '../../model/runtime.ts';
import type { ImplementationSelfTestObservation, WorkflowDocumentRef, WorkflowEvent, WorkflowStage } from '../../model/runtime.ts';
import { readIntentEntryFacts } from '../../common/shared/intent-entry-contract.ts';
import { parseDefinition } from './definition.ts';
import { preflightScriptVerified, recoveryEvent, recoveryMissing, recoveryOwners, recoveryProjection, validMissingEvidence } from './acceptance-environment.ts';
import { acceptancePreparationEffectIdentity, acceptancePreparationEnabled, acceptancePreparationObservation, acceptancePreparationPermit,
  acceptancePreparationReworkStep, acceptanceWorkspaceProjection, isBrowserCaptureArtifact, isPreparationBlocker, verifyBrowserCaptureEvents,
  workspaceWasPrepared } from './acceptance-workspace.ts';
import { a11DispositionProjection, a11ObservationValid, a11RecoveryClaimMatches, a11RecoveryEffectKey, a11RecoveryProof,
  a11ResumeModelKey, blockedRoutingEnabled, blockedRoutingProjection, blockedScopeEvent, cleanRetestObservation, currentVerificationPlan, implementationTestCommand, implementationTestMatches, implementationWorkOrder, newBlockedScope,
  newEvidenceAuditScope, readVerificationPlan, scopeGovernanceDigest, unavailableVerification, verificationCapabilitiesValid } from './blocked-routing.ts';
import { DocumentRevisionService, documentRevisionEnabled, documentRevisionOwner, documentRevisionProjection, effectiveRevisionEvidence,
  revisionParksNode } from './document-revision.ts';
import { WorkflowStartActivation } from './activation.ts';
import { capabilities, graphNeedsWrite, workflowTaskRoles } from './capabilities.ts';
import { admitCapability, applyGraph, capabilityEvidence, graphCardDigest, graphTaskId, implementationAggregate,
  evidenceAuditDeliveryPermit, evidenceAuditProjection, implementationChildren, implementationDispatchItems, implementationHead, implementationItems,
  implementationPreparationRepair, missingAuditEvidence, runtimeReportFromEvidence, sameAuditBasis } from './path-a.ts';
import { graphDocumentRoots, graphImplementationPaths, requiresEffectResolution, takeEffect, settleEffect } from './effects.ts';
import { acceptancePreparationArchitecture, admitFact, b2EvidenceDecisionProjection, currentProposalDecision, deliveryFor, evidenceRequirementsFromB1, scopeDecisionFor, storedFact } from './facts.ts';
import { activeAction, applyStep, decisionProvenanceMatches, equal, evidenceAuditConfiguration, factShape, fail, hashValid, liveEffect, oidValid, ok, project as baseProjection, safePath, sameInstance, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';
import type { ActivityInput, ActivityOutcome } from './rules.ts';

export type { ActivityInput, ActivityOutcome } from './rules.ts';
export { parseDefinition } from './definition.ts';
export { implementationTestCommand, implementationTestMatches, implementationTestRulesText, workOrderText as implementationWorkOrderText } from './blocked-routing.ts';

function retestNodeFiles(argv: readonly string[]): string[] | undefined {
  if (argv[1] === '--check' && argv.length !== 3) return;
  const files: string[] = [];
  let options = argv[1] === '--test';
  const withValue = new Set(['--test-concurrency', '--test-name-pattern', '--test-skip-pattern', '--test-shard', '--test-timeout']);
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index]!;
    if (options && arg === '--') {
      options = false;
      continue;
    }
    if (options && arg.startsWith('-')) {
      const [flag, ...value] = arg.split('=');
      if (arg === '--test-only') continue;
      if (!withValue.has(flag!) || (value.length ? !value.join('=') : !argv[index + 1] || argv[index + 1]!.startsWith('-'))) return;
      if (!value.length) index++;
      continue;
    }
    const file = arg.replaceAll('\\', '/').replace(/^\.\//, '');
    if (!safePath(file) || !file.split('/').every(part => /^[\p{L}\p{N}._@+ -]+$/u.test(part)
      && !part.startsWith('-') && !/[. ]$/.test(part))) return;
    files.push(file);
  }
  return files;
}

export async function verifyImplementationRetestInputs(projectRoot: string, candidateOid: string, paths: readonly string[],
  argv: readonly string[], standard?: DurableEvidenceRef): Promise<DurableResult<true>> {
  const unusable = (message: string) => fail('workflow-a11-retest-command-unavailable', message);
  if (!implementationTestCommand(argv) || !oidValid(candidateOid)) return unusable('命令不符合当前正式模块自测语法。');
  const executable = basename(argv[0]!.replaceAll('\\', '/')).toLowerCase().replace(/\.(?:cmd|exe|ps1)$/, '');
  try {
    if (standard && digest(await readProjectFile(projectRoot, standard.path, MaxEvidenceBytes)) !== standard.sha256)
      return unusable('本轮原签发标准的实际字节已变化。');
    if (executable === 'node') {
      const files = retestNodeFiles(argv);
      const covered = (file: string) => paths.some(root => file === root || root.endsWith('/') && file.startsWith(root));
      if (!files) return unusable('补测无法核对 Node 参数或字面路径；请使用当前签发的只读参数和项目内字面模块文件。');
      const actualFile = async (file: string) => (await lstat(join(projectRoot, file))).isFile()
        && relative(projectRoot, await realpath(join(projectRoot, file))).replaceAll('\\', '/') === file;
      if (!files.length) {
        const tracked = (await gitRead(projectRoot, ['ls-tree', '-r', '--name-only', '-z', candidateOid])).split('\0').filter(Boolean);
        const recognized = tracked.filter(file => safePath(file)
          && /(?:^|\/)(?:test\/.*|test(?:[-_].*)?|[^/]+[.](?:test|spec))[.](?:[cm]?[jt]s)$/u.test(file));
        if (!recognized.some(covered) || recognized.some(file => !covered(file)))
          return unusable('无法在整个候选的默认 Node 测试发现范围内隔离当前模块。请使用签发标准允许的实际模块测试文件。');
        files.push(...recognized);
      }
      if (!files.every(covered) || !await trackedFiles(projectRoot, candidateOid, files) || !(await Promise.all(files.map(actualFile))).every(Boolean))
        return unusable('全部模块测试或语法检查文件须由同候选跟踪、处于获批模块并且当前可读：' + files.join('、'));
      return ok(true);
    }
    if (!await trackedFiles(projectRoot, candidateOid, ['package.json'])) return unusable('同候选缺受 Git 跟踪的 package.json。');
    const manifest = JSON.parse((await readProjectFile(projectRoot, 'package.json', MaxEvidenceBytes)).toString('utf8')) as { scripts?: Record<string, unknown> };
    const scriptName = argv[1] === 'test' ? 'test' : argv[2]!;
    const script = manifest.scripts && Object.hasOwn(manifest.scripts, scriptName) ? manifest.scripts[scriptName] : undefined;
    if (typeof script !== 'string' || !script.trim()) return unusable('同候选 package.json 中缺实际包脚本：' + scriptName);
    const env = (key: string) => Object.entries(process.env).find(([name]) => name.toUpperCase() === key)?.[1];
    const withinProject = (file: string | undefined) => {
      if (!file || !isAbsolute(file)) return false;
      const rel = relative(projectRoot, file).replaceAll('\\', '/');
      return !!rel && safePath(rel);
    };
    if (executable !== 'npm' || !withinProject(env('NPM_CONFIG_CACHE')) || !withinProject(env('NPM_CONFIG_LOGS_DIR'))
      || argv.slice(2).some(arg => /^--(?:cache|logs-dir|userconfig|globalconfig|prefix|workspace|workspaces)(?:=|$)/.test(arg))) {
      return unusable('当前包执行器缓存或日志的实际写入范围无法纳入补测观测，不能签发补测回执。');
    }
    if ([script, manifest.scripts?.['pre' + scriptName], manifest.scripts?.['post' + scriptName], ...argv.slice(2)].some(part =>
      typeof part === 'string' && /(?:^|[\s;&|])(?:--write|--fix|--test-update-snapshots|--test-reporter-destination|mkdir|touch|del|rm|mv|cp|git|install)(?:[=\s;&|]|$)/i.test(part))) {
      return unusable('当前包脚本或参数包含补测期间禁用的写入操作。');
    }
    return ok(true);
  } catch (error) { return unusable('当前自测命令的实际项目输入无法读取：' + message(error)); }
}

const MaxDefinitionBytes = 128 * 1024;
const MaxEvidenceBytes = 2 * 1024 * 1024;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export interface DurableDefinitionEntry {
  file: string;
  ok: boolean;
  definition?: DurableDefinitionSnapshot;
  source: 'project' | 'preset';
  code?: string;
  message?: string;
  path?: string;
}

type Evidence = { ref: DurableEvidenceRef; bytes: Buffer };
type A11StandardObservation = Pick<DurableA11Disposition, 'standardState' | 'observedStandardSha256'>;
type A11Availability = { unavailable?: string };
const blockerText = (reason: string | undefined) => reason?.trim().replace(/\s+/g, ' ').slice(0, 512) || undefined;
function implementationTransportMatches(observation: ImplementationSelfTestObservation, strict: boolean): boolean {
  const process = observation.process;
  if (!process) return !strict;
  const transport = process.transport;
  if (!process.started || !transport) return false;
  const [entry, ...args] = observation.argv;
  const program = entry && basename(entry.replaceAll('\\', '/')).toLowerCase().replace(/\.(?:cmd|exe|ps1)$/, '');
  const absolute = (file: string) => isAbsolute(file) || win32.isAbsolute(file);
  if (strict && !absolute(transport.executable)) return false;
  if (transport.kind === 'direct') return transport.executable === entry && equal(transport.argv, args);
  if (!absolute(transport.executable)) return false;
  if (transport.kind === 'bundled-node') return program === 'node' && equal(transport.argv, args);
  const [cli, ...npmArgs] = transport.argv;
  return program === 'npm' && !!cli && absolute(cli) && /[/\\]npm[/\\]bin[/\\]npm-cli\.js$/i.test(cli) && equal(npmArgs, args);
}
type DirectIntentDraft = DurableEvidenceRef & { intentId: string; version: number };
type LoadedDefinitionEntry = DurableDefinitionEntry & { fileDigest?: string };
const ownerSlot = (definitionId: string): string => definitionId === 'path-b' ? 'path-b' : 'read-only:' + definitionId;
const fingerprintStart = (input: DurableStartInput) => digest(stableJson([
  input.definitionId, input.source ?? null, input.expectedDigest ?? null, input.customerPurpose ?? null, input.metadata ?? {},
]));
const startContextStale = () => fail('workflow-start-source-stale', '当前项目已变化或原发起回合尚未结束。');

async function trackedFiles(projectRoot: string, head: string, files: readonly string[]): Promise<boolean> {
  if (!oidValid(head) || files.some(file => !safePath(file))) return false;
  const entries = await Promise.all(files.map(file => gitRead(projectRoot, ['ls-tree', '-z', '--full-tree', head, '--', ':(literal)' + file])));
  return entries.every(entry => /^100(?:644|755) blob [a-f0-9]{40,64}\t/.test(entry) && entry.endsWith('\0'));
}

async function assessmentJournalIsUndispatched(projectRoot: string, taskId: string): Promise<boolean> {
  const tasks = await readTaskState(projectRoot);
  if (tasks.records.has(taskId)) return false;
  const legacyClosure = 'task.closed direct creator/source binding invalid';
  const segments = new Map<string, readonly string[]>();
  for (const error of tasks.errors) {
    if (error.message !== legacyClosure || error.line < 1 || !/^tasks\.jsonl(?:\.[1-9][0-9]*)?$/.test(error.file)) return false;
    let lines = segments.get(error.file);
    if (!lines) {
      const bytes = await readProjectFile(projectRoot, dirname(TASKS_STATE_REL) + '/' + error.file, DEFAULT_TASKS_MAX_BYTES);
      lines = bytes.toString('utf8').split(/\r?\n/);
      segments.set(error.file, lines);
    }
    // Check the original row: only a rejected closure of a different, known task is harmless here.
    const row = JSON.parse(lines[error.line - 1] ?? 'null') as { kind?: unknown; taskId?: unknown } | null;
    if (row?.kind !== 'task.closed' || typeof row.taskId !== 'string' || row.taskId === taskId || !tasks.records.get(row.taskId)?.created) {
      return false;
    }
    const parsed = validateTaskStateEvent(row);
    if (parsed.ok || parsed.message !== legacyClosure) return false;
  }
  return true;
}

function project(ledger: DurableLedger, value: StoredInstance): DurableProjection {
  const projection = baseProjection(ledger, value);
  const revision = documentRevisionProjection(value);
  const acceptanceEnvironment = recoveryProjection(ledger, value);
  const acceptanceWorkspace = acceptanceWorkspaceProjection(ledger, value);
  const proposalDecision = currentProposalDecision(ledger, value);
  const auditConfiguration = evidenceAuditConfiguration(value);
  const routing = blockedRoutingEnabled(value) || !!auditConfiguration;
  const blockedRouting = blockedRoutingProjection(ledger, value);
  const a11Disposition = routing ? a11DispositionProjection(ledger, value) : undefined;
  const implementationRepair = implementationPreparationRepair(ledger, value);
  const audit = evidenceAuditProjection(ledger, value);
  const b2Evidence = b2EvidenceDecisionProjection(ledger, value);
  const verificationPlan = routing ? currentVerificationPlan(ledger, value) : undefined;
  const verificationCapabilities = verificationPlan?.capabilities ?? (routing ? value.graph?.tasks.find(task =>
    task.stepId === value.stepId && task.attempt === value.attempt && task.capability === 'independent-standard')?.verificationCapabilities : undefined);
  const revisionWait = revision && revision.status !== 'resumed'
    ? revision.status === 'awaiting-approval' ? '等候本人确认治理文件修订' : '等候治理文件修订' : undefined;
  return { ...projection, schema: value.definition.schema, definitionSource: value.definitionSource ?? 'project', definitionFile: value.definitionFile,
    workflowOwnedDispatch: workflowOwnsDispatch(value),
    ...(projection.action === 'operations-implementation' || routing && projection.action === 'independent-standard' ? {
      implementationItems: implementationDispatchItems(ledger, value).filter(item => item.roleId !== value.graph?.tasks.find(task => task.stepId === value.stepId
        && task.attempt === value.attempt && task.capability === 'independent-standard')?.roleId),
    } : {}),
    ...(acceptanceEnvironment ? { acceptanceEnvironment } : {}),
    ...(acceptanceWorkspace ? { acceptanceWorkspace } : {}),
    ...(proposalDecision ? { proposalDecision } : {}),
    ...(routing ? { blockedRoutingEnabled: true, verificationPlan, verificationCapabilities } : {}),
    ...(blockedRouting ? { blockedRouting } : {}),
    ...(a11Disposition ? { a11Disposition } : {}),
    ...(implementationRepair ? { implementationRepair } : {}),
    ...(auditConfiguration ? { evidenceAuditEnabled: true as const, evidenceCollectorRoleId: auditConfiguration.collectorRoleId } : {}),
    ...(audit ? { evidenceAudit: audit } : {}),
    ...(b2Evidence ? { b2EvidenceDecision: b2Evidence } : {}),
    ...(documentRevisionEnabled(value) ? { documentRevisionEnabled: true, documentRevision: revision } : {}),
    ...(revisionWait ? { waitingFor: revisionWait } : {}),
    ...(revision?.blockedReason ? { blockedReason: revision.blockedReason } : {}),
    flowId: value.graph?.flowId, pendingTasks: value.graph?.tasks, writeSets: value.graph?.writeSets,
    acceptanceArchive: value.graph?.acceptanceArchive,
    scopeDecision: ledger.scopeDecision(value.ref.instanceId), delivery: ledger.delivery(value.ref.instanceId) };
}

export class DurableWorkflowService {
  readonly #ledger: DurableLedger;
  readonly #presetRoot?: string;
  readonly #activation: WorkflowStartActivation;
  readonly #documentRevisions: DocumentRevisionService;
  readonly #finishingIntent = new Map<string, Promise<DurableResult<DurableFactReceipt>>>();

  constructor(dataDir: string, presetRoot?: string) {
    this.#ledger = new DurableLedger(dataDir);
    this.#presetRoot = presetRoot;
    this.#documentRevisions = new DocumentRevisionService(this.#ledger, ref => this.#find(ref), value => this.#owns(value),
      async value => {
        const basis = await this.#verifyImplementationAuthority(value);
        if (!basis.ok) return basis;
        const head = implementationHead(value);
        return head ? this.#verifyImplementationGit(value, head) : fail('workflow-implementation-head-missing', '原节点缺实施基线。');
      });
    this.#activation = new WorkflowStartActivation(this.#ledger, (root, id) => this.#selectDefinition(root, id, {}, true),
      (input, selection, current) => this.#start(input, selection, current));
    try {
      this.#recoverBusinessRecords();
    } catch (error) {
      this.#ledger.close();
      throw error;
    }
  }

  #recoverBusinessRecords(): void {
    const ledger = this.#ledger;
    ledger.transaction(() => {
      for (const value of ledger.missingBusinessRecords()) {
        const id = value.ref.instanceId;
        const recordedAt = new Date().toISOString();
        if (value.scope && !ledger.scopeDecision(id)) {
          const scope = scopeDecisionFor(ledger, value, ledger.fact(id, value.scope.key), recordedAt);
          if (scope) ledger.saveScopeDecision(id, scope);
        }
        if (value.release?.decision?.action === 'approve' && !ledger.delivery(id)) {
          for (const source of ledger.facts(id)) {
            const delivery = deliveryFor(ledger, value, source, recordedAt);
            if (!delivery) continue;
            ledger.saveDelivery(id, source.fact.key, delivery);
            break;
          }
        }
      }
    });
  }
  close(): void { this.#ledger.close(); }

  requestDocumentRevision(ref: DurableInstanceRef, input: Parameters<DocumentRevisionService['request']>[1], isCurrent: () => boolean) {
    return this.#documentRevisions.request(ref, input, isCurrent, async ({ value, task, original, canRevise }) => {
      if (!blockedRoutingEnabled(value)) return ok(true);
      const scope = blockedRoutingProjection(this.#ledger, value);
      const wake = scope && this.#ledger.effect(ref.instanceId, 'model:a11-scope-revise:' + scope.binding.requestId);
      if ((scope?.decision?.option === 'revise' || scope?.decision?.option === 'compromise' && scope.evidenceCompromise)
        && sameTask(scope.origin.task, task) && equal(scope.document, original)
        && scope.governanceDigest === scopeGovernanceDigest(value) && scope.candidateOid === implementationHead(value)
        && wake?.intent.kind === 'model-send' && sameTask(wake.intent.task, task) && wake.intent.expected?.roleId === 'convener'
        && (wake.state === 'claimed' || wake.state === 'succeeded' && wake.result?.result?.turnId === input.source.originId)) return ok(true);
      const prepared = await this.#prepareBlockedScope(value, task, original, input.reason, undefined, canRevise, isCurrent);
      return prepared.ok ? fail('workflow-blocked-scope-decision-required', '已批准文件要改变，须先在当前应用决定卡选择实际处置。') : prepared;
    });
  }
  submitDocumentRevision(...input: Parameters<DocumentRevisionService['submit']>) { return this.#documentRevisions.submit(...input); }
  readDocumentRevisionReview(...input: Parameters<DocumentRevisionService['review']>) { return this.#documentRevisions.review(...input); }
  decideDocumentRevision(...input: Parameters<DocumentRevisionService['decide']>) { return this.#documentRevisions.decide(...input); }
  resumeDocumentRevision(...input: Parameters<DocumentRevisionService['resume']>) { return this.#documentRevisions.resume(...input); }
  failDocumentRevision(...input: Parameters<DocumentRevisionService['fail']>) { return this.#documentRevisions.fail(...input); }

  async listDefinitions(projectRoot: string): Promise<DurableDefinitionEntry[]> {
    return (await this.#listDefinitions(projectRoot)).map(({ fileDigest, ...item }) => item);
  }

  async #listDefinitions(projectRoot: string): Promise<LoadedDefinitionEntry[]> {
    const project = await this.#definitionsFrom(projectRoot, 'project');
    const preset = this.#presetRoot ? await this.#definitionsFrom(this.#presetRoot, 'preset') : [];
    return [...project, ...preset.filter(item => !item.ok || item.definition?.schema === 2)];
  }

  async #definitionsFrom(projectRoot: string, source: 'project' | 'preset'): Promise<LoadedDefinitionEntry[]> {
    let files: string[];
    try {
      files = await definitionFiles(projectRoot);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : [
        { file: 'docs/workflows', source, ok: false, code: 'definition-directory-invalid', message: message(error) },
      ];
    }
    return Promise.all(files.map(async file => {
      try {
        const bytes = await readProjectFile(projectRoot, file, MaxDefinitionBytes);
        const result = parseDefinition(bytes.toString('utf8'));
        return result.ok ? { file, source, ok: true, definition: result.value, fileDigest: digest(bytes) } : { file, source, ...result };
      } catch (error) {
        return { file, source, ok: false, code: 'definition-unreadable', message: message(error) };
      }
    }));
  }

  async #selectDefinition(projectRoot: string, id: string, selection: DurableDefinitionSelection,
    requireEffectiveSource = false): Promise<DurableResult<StoredStartSelection>> {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return fail('definition-id-invalid', '工作流定义 ID 无效。');
    const entries = await this.#listDefinitions(projectRoot);
    const unavailable = requireEffectiveSource && entries.find(item => item.source === 'project'
      && item.file === 'docs/workflows' && !item.ok);
    if (unavailable) return fail('definition-directory-invalid', unavailable.message ?? '无法核验当前项目的有效工作流来源。');
    const base = 'docs/workflows/' + id;
    const all = entries.filter(item => item.definition?.id === id || item.file === base + '.yaml' || item.file === base + '.yml');
    const source = selection.source ?? (all.some(item => item.source === 'project') ? 'project' : 'preset');
    const matches = all.filter(item => item.source === source);
    if (matches.length > 1) return fail('definition-id-conflict', '项目中多个 YAML 声明相同定义。');
    const entry = matches[0];
    if (entry?.definition?.id === id && entry.fileDigest) {
      if (selection.expectedDigest !== undefined && entry.definition.digest !== selection.expectedDigest) return fail('definition-digest-changed', '所选定义已修改，请重新校验。');
      return ok({ file: entry.file, source, definition: entry.definition, fileDigest: entry.fileDigest });
    }
    if (entry && !entry.ok) {
      return { ok: false, code: entry.code!, message: entry.message!, path: entry.path };
    }
    return fail('definition-not-found', '项目工作流定义未找到。');
  }

  async validateDefinition(projectRoot: string, id: string, selection: DurableDefinitionSelection = {}): Promise<DurableResult<DurableDefinitionSnapshot>> {
    const selected = await this.#selectDefinition(projectRoot, id, selection);
    return selected.ok ? ok(selected.value.definition) : selected;
  }

  async #installDefinition(projectRoot: string, bytes: Buffer): Promise<DurableResult<DurableDefinitionEntry & { definition: DurableDefinitionSnapshot }>> {
    const parsed = parseDefinition(bytes.toString('utf8'));
    if (!parsed.ok) return parsed;
    const matches = (await this.#definitionsFrom(projectRoot, 'project')).some(item => item.definition?.id === parsed.value.id);
    if (matches) return fail('definition-id-conflict', '项目内已有同名定义。');
    try {
      const file = await saveDefinitionFile(projectRoot, parsed.value.id, bytes);
      return ok({ file, source: 'project', ok: true, definition: parsed.value });
    } catch (error) {
      return fail((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'definition-id-conflict' : 'definition-import-failed', message(error));
    }
  }

  async copyPreset(projectRoot: string, definitionId: string) {
    if (!this.#presetRoot) return fail('definition-not-found', '随包预设目录不可用。');
    const selected = await this.#selectDefinition(projectRoot, definitionId, { source: 'preset' });
    if (!selected.ok) return selected;
    try {
      return await this.#installDefinition(projectRoot, await readProjectFile(this.#presetRoot, selected.value.file, MaxDefinitionBytes));
    } catch (error) { return fail('definition-import-failed', message(error)); }
  }

  async importDefinition(projectRoot: string, selectedFilePath: string) {
    try {
      return await this.#installDefinition(projectRoot, await readImportedDefinition(selectedFilePath, MaxDefinitionBytes));
    } catch (error) { return fail('definition-import-failed', message(error)); }
  }

  proposeWorkflowStart(input: DurableStartProposalInput, current?: () => boolean): Promise<DurableResult<DurableStartProposal>> {
    return this.#activation.propose(input, current);
  }

  listWorkflowStartProposals(projectRoot: string): Promise<DurableStartProposal[]> {
    return this.#activation.list(projectRoot);
  }

  refreshWorkflowStartProposal(projectRoot: string, activationId: string, current?: () => boolean): Promise<DurableResult<DurableStartProposal>> {
    return this.#activation.refresh(projectRoot, activationId, current);
  }

  decideWorkflowStart(input: DurableStartProposalDecisionInput, current?: () => boolean): Promise<DurableResult<DurableStartProposal>> {
    return this.#activation.decide(input, current);
  }

  startApprovedWorkflow(projectRoot: string, activationId: string, current?: () => boolean): Promise<DurableResult<DurableStartProposal>> {
    return this.#activation.startApproved(projectRoot, activationId, current);
  }

  start(input: DurableStartInput): Promise<DurableResult<DurableProjection>> {
    return this.#start(input);
  }

  async #start(input: DurableStartInput, approved?: StoredStartSelection, current?: () => boolean): Promise<DurableResult<DurableProjection>> {
    if (!validKey(input.requestId)) return fail('start-request-invalid', '启动请求缺有效且稳定的操作键。');
    const workspace = await workspaceIdentity(input.projectRoot).catch(() => undefined);
    if (!workspace) return fail('workflow-workspace-invalid', '请选择可核验的工作区根目录。');
    if (current && !current()) return startContextStale();
    const repo = workspace.repository;
    const ledger = this.#ledger;
    const fingerprint = fingerprintStart(input);
    const previous = ledger.request(workspace.projectId, input.requestId) ?? (repo && ledger.request(repo.projectId, input.requestId));
    if (previous) return (previous.startupFingerprint ? previous.startupFingerprint === fingerprint
      : previous.definition.id === input.definitionId && equal(previous.metadata, input.metadata ?? {})
        && (input.source === undefined || input.source === (previous.definitionSource ?? 'project'))
        && (input.expectedDigest === undefined || input.expectedDigest === previous.definition.digest))
      ? ok(project(ledger, previous)) : fail('start-key-conflict', '相同启动键已绑定其他请求。');
    if (approved && ledger.instancesForRoot(workspace.root).some(item => item.status === 'waiting')) {
      return fail('workflow-workspace-busy', '该项目已有运行中的工作流。');
    }
    if (approved) {
      const legacy = await readWorkflowLedger(workspace.root);
      const closed = new Set(legacy.events.filter(item => item.kind === 'workflow.closed').map(item => item.workflowId));
      if (legacy.badLines || legacy.errors.length || legacy.events.some(item => item.kind === 'workflow.started' && !closed.has(item.workflowId))) {
        return fail('workflow-workspace-busy', '该项目已有活动或待核对的既有工作流。');
      }
    }

    const heldWorkspace = workspaceOwner(workspace.root);
    if (heldWorkspace?.engine === 'dapr' && heldWorkspace.state === 'reserved' && heldWorkspace.dataDir === ledger.dataDir
      && heldWorkspace.requestId === input.requestId && heldWorkspace.definition?.schema === 2) {
      if (heldWorkspace.fingerprint !== fingerprint) return fail('start-key-conflict', '原申请的来源、摘要或内容已经固定。');
      return this.#startGraph(workspace, input, heldWorkspace.definition, heldWorkspace.source ?? 'project', heldWorkspace.definitionFile, heldWorkspace, current);
    }
    const selected = approved ? ok(approved) : await this.#selectDefinition(workspace.root, input.definitionId, input);
    if (!selected.ok) return selected;
    const { definition, source: definitionSource } = selected.value;
    const definitionFile = definitionSource === 'project' ? selected.value.file : undefined;
    if (definition.schema === 2) return this.#startGraph(workspace, input, definition, definitionSource, definitionFile, undefined, current);
    if (!repo) return fail('b-repository-required', '工作流须从已有 Git 根目录启动。');
    if (definition.id === 'path-b' && this.#workspaceReservation(workspace)?.engine === 'dapr') {
      return fail('workflow-workspace-busy', '此工作区已由另一持久工作流申请或占用。');
    }
    const slot = ownerSlot(definition.id);
    const instanceId = 'dw-' + digest(stableJson([repo.projectId, input.requestId])).slice(0, 36);
    const requestedOwner = { engine: 'dapr' as const, instanceId, dataDir: ledger.dataDir };
    const held = repositoryOwner(repo, slot);
    const finalized = held?.engine === 'dapr' && held.dataDir === ledger.dataDir ? ledger.instance(held.instanceId) : undefined;
    if (held && finalized && finalized.status !== 'waiting') releaseOwner(repo, held, slot);
    else if (held && (held.engine !== 'dapr' || held.dataDir !== requestedOwner.dataDir || held.instanceId !== instanceId)) {
      return fail('workflow-workspace-busy', '规范化 Git 仓库已有其他工作流所有者。');
    }
    if (slot === 'path-b') {
      try {
        const protection = await readGitProtectionFacts(repo.root);
        if (!checkGitProtectionFactsCurrent(protection)) {
          const details = protection.reasons.join(' / ') || '核对期间 Git 仓库事实发生变化';
          return fail('workflow-git-protection-unavailable', '当前仓库无法提供路径 B 所需的写入保护。请选择受现有 Git 门支持的仓库布局与本地配置（' + details + '）。');
        }
      } catch (error) {
        return fail('workflow-git-protection-unavailable', '无法核对此仓库的写入保护（' + message(error) + '）。');
      }
    }
    if (current && !current()) return startContextStale();
    const reserved = reserveOwnerState(repo, requestedOwner, slot);
    if (reserved === 'conflict') {
      return fail('workflow-workspace-busy', '规范化 Git 仓库已有其他工作流所有者。');
    }
    let retained = reserved === 'already-owned';
    try {
      if (slot === 'path-b') {
        const state = await readWorkflowLedger(repo.root);
        const closed = new Set(state.events.filter(event => event.kind === 'workflow.closed').map(event => event.workflowId));
        if (state.badLines > 0 || state.errors.length > 0
          || state.events.some(event => event.kind === 'workflow.started' && !closed.has(event.workflowId))) {
          return fail('workflow-workspace-busy', '项目存在活动的既有工作流。');
        }
      }
      return ledger.transaction(() => {
        if (current && !current()) return startContextStale();
        const concurrent = ledger.request(repo.projectId, input.requestId);
        if (concurrent) return concurrent.startupFingerprint === fingerprint
          ? ok(project(ledger, concurrent)) : fail('start-key-conflict', '相同启动键已绑定其他请求。');
        if (approved && ledger.instancesForRoot(workspace.root).some(item => item.status === 'waiting')) {
          return fail('workflow-workspace-busy', '该项目已有运行中的工作流。');
        }
        const pinned = ledger.definition(repo.projectId, definition.id, definition.version);
        if (pinned && pinned.digest !== definition.digest || !pinRepositoryDefinition(repo, definition)) {
          return fail('definition-version-conflict', '此项目的同版本定义已固定到不同摘要。');
        }
        ledger.pin(repo.projectId, definition);
        const ref: DurableInstanceRef = {
          projectId: repo.projectId, instanceId, definitionId: definition.id, definitionVersion: definition.version,
          definitionDigest: definition.digest, executor: DURABLE_EXECUTOR, activityContract: DURABLE_ACTIVITY_CONTRACT,
        };
        const step = definition.steps[definition.start]!;
        const value: StoredInstance = {
          ref, definition, definitionSource, definitionFile, startupFingerprint: fingerprint, projectRoot: repo.root, commonDir: repo.commonDir, requestId: input.requestId,
          metadata: { ...input.metadata }, stepId: definition.start, entry: 0, attempt: 1, status: 'waiting',
          engine: 'pending', scheduled: false, scheduling: false, visits: {},
          ...('action' in step ? {
            actionIntent: { key: 'intent:' + instanceId + ':0', action: step.action, stepId: definition.start, attempt: 1 },
          } : {}),
        };
        ledger.save(value);
        retained = true;
        return ok(project(ledger, value));
      });
    } finally {
      if (!retained) releaseOwner(repo, requestedOwner, slot);
    }
  }

  #workspaceReservation(workspace: WorkspaceIdentity): WorkspaceReservation | undefined {
    const direct = workspaceOwner(workspace.root);
    if (direct || !workspace.repository) return direct;
    const primary = dirname(workspace.repository.commonDir);
    return primary !== workspace.root ? workspaceOwner(primary) : undefined;
  }

  async #startGraph(workspace: WorkspaceIdentity, input: DurableStartInput,
    definition: Extract<DurableDefinitionSnapshot, { schema: 2 }>, definitionSource: 'project' | 'preset', definitionFile?: string,
    resume?: WorkspaceReservation, current?: () => boolean): Promise<DurableResult<DurableProjection>> {
    const { root, repository: repo, projectId } = workspace;
    const ledger = this.#ledger;
    const write = graphNeedsWrite(definition);
    const entry = definition.steps[definition.start]!;
    const action = 'action' in entry ? entry.action : undefined;
    const fingerprint = fingerprintStart(input);
    const instanceId = 'dw-' + digest(stableJson([projectId, input.requestId])).slice(0, 36);
    const owner = { engine: 'dapr' as const, instanceId, dataDir: ledger.dataDir };
    if (action === 'observe-existing' && (!repo || input.customerPurpose === 'new-work')) {
      return fail('workflow-existing-change-unavailable', '此定义要求可核验的既有实现及变更；新工作须走完整治理。');
    }
    let observedHead = resume?.initialHead;
    let observedStatus: string | undefined;
    if (repo) {
      try {
        if (write && !checkGitProtectionFactsCurrent(await readGitProtectionFacts(root))) return fail('workflow-git-protection-unavailable', '仓库布局或配置不支持受治理写入。');
        if (action === 'observe-existing') {
          observedHead ??= await gitRead(root, ['rev-parse', '--verify', 'HEAD']);
          observedStatus = resume?.initialStatus ?? await gitRead(root, ['status', '--porcelain=v1', '-uno']);
        }
      } catch (error) { return fail('workflow-git-protection-unavailable', message(error)); }
    }
    let reserved: WorkspaceReservation | undefined;
    let shared: 'acquired' | 'already-owned' | 'conflict' | undefined;
    let active = false;
    try {
      if (current && !current()) return startContextStale();
      if (write) {
        const held = this.#workspaceReservation(workspace);
        if (held && (held.instanceId !== instanceId || held.fingerprint !== fingerprint || held.dataDir !== ledger.dataDir || held.engine !== 'dapr')) {
          return fail('workflow-workspace-busy', '当前工作区已由另一流程独占。');
        }
        reserved = reserveWorkspace(root, { ...owner, projectId, requestId: input.requestId, fingerprint, state: 'reserved',
          source: definitionSource, definitionFile, definition, initialHead: observedHead, initialStatus: observedStatus });
        if (reserved.instanceId !== instanceId || reserved.fingerprint !== fingerprint || reserved.dataDir !== ledger.dataDir || reserved.engine !== 'dapr') {
          reserved = undefined;
          return fail('workflow-workspace-busy', '当前工作区已由另一流程独占。');
        }
        if (repo) {
          shared = reserveOwnerState(repo, owner);
          if (shared === 'conflict') return fail('workflow-workspace-busy', '规范化 Git 仓库已有其他所有者。');
        }
        const legacy = await readWorkflowLedger(root);
        const closed = new Set(legacy.events.filter(item => item.kind === 'workflow.closed').map(item => item.workflowId));
        if (legacy.badLines || legacy.errors.length || legacy.events.some(item => item.kind === 'workflow.started' && !closed.has(item.workflowId))) {
          return fail('workflow-workspace-busy', '项目存在活动或未核验的既有工作流。');
        }
      }
      const result = ledger.transaction(() => {
        if (current && !current()) return startContextStale();
        const previous = ledger.request(projectId, input.requestId);
        if (previous) return previous.startupFingerprint === fingerprint ? ok(project(ledger, previous))
          : fail('start-key-conflict', '相同启动键已绑定其他请求。');
        if (current && ledger.instancesForRoot(root).some(item => item.status === 'waiting')) {
          return fail('workflow-workspace-busy', '该项目已有运行中的工作流。');
        }
        const pinned = ledger.definition(projectId, definition.id, definition.version);
        if (pinned && pinned.digest !== definition.digest || repo && !pinRepositoryDefinition(repo, definition)) {
          return fail('definition-version-conflict', '此项目的同版本定义已固定到不同摘要。');
        }
        ledger.pin(projectId, definition);
        const ref = { projectId, instanceId, definitionId: definition.id, definitionVersion: definition.version,
          definitionDigest: definition.digest, executor: definition.evidenceAudit ? DURABLE_EVIDENCE_AUDIT_EXECUTOR : DURABLE_GRAPH_EXECUTOR,
          activityContract: definition.evidenceAudit ? DURABLE_EVIDENCE_AUDIT_ACTIVITY_CONTRACT : DURABLE_GRAPH_ACTIVITY_CONTRACT };
        const value: StoredInstance = { ref, definition, definitionSource, definitionFile, startupFingerprint: fingerprint,
          projectRoot: root, commonDir: repo?.commonDir ?? '', requestId: input.requestId,
          metadata: { ...input.metadata, ...(current && input.metadata?.activationId ? { workflowOwnedDispatch: 'true', workflowReviewPreflight: 'true' } : {}) },
          stepId: definition.start, entry: 0, attempt: 1, status: 'waiting', engine: 'pending', scheduling: false, scheduled: false,
          visits: {}, graph: { observedHead, observedStatus, customerPurpose: input.customerPurpose, tasks: [], proofs: {} },
          ...(action ? { actionIntent: { key: 'intent:' + instanceId + ':0', action, stepId: definition.start, attempt: 1 } } : {}) };
        ledger.save(value);
        return ok(project(ledger, value));
      });
      if (result.ok) {
        active = true;
        if (reserved) changeWorkspaceOwner(root, reserved, true);
      }
      return result;
    } catch (error) { return fail('workflow-owner-unavailable', message(error)); }
    finally {
      if (!active && !resume) {
        if (repo && shared === 'acquired') releaseOwner(repo, owner);
        if (reserved?.state === 'reserved') changeWorkspaceOwner(root, reserved, false);
      }
    }
  }

  async owner(projectRoot: string, instanceId?: string): Promise<DurableOwner | undefined> {
    const workspace = await workspaceIdentity(projectRoot).catch(() => undefined);
    if (!workspace) return undefined;
    const repo = workspace.repository;
    const value = instanceId === undefined ? undefined : this.#ledger.instance(instanceId);
    if (value && (value.ref.projectId === repo?.projectId || value.ref.projectId === workspace.projectId)) {
      return { engine: 'dapr', instanceId: value.ref.instanceId, projectId: value.ref.projectId, ownedByThisDataDir: true };
    }
    const directory = this.#workspaceReservation(workspace);
    if (directory && (instanceId === undefined || instanceId === directory.instanceId)) return {
      engine: directory.engine, instanceId: directory.instanceId, projectId: directory.projectId, ownedByThisDataDir: directory.dataDir === this.#ledger.dataDir,
    };
    if (!repo) {
      const local = this.#ledger.active(workspace.projectId)[0];
      return local ? { engine: 'dapr', instanceId: local.ref.instanceId, projectId: workspace.projectId, ownedByThisDataDir: true } : undefined;
    }
    const row = repositoryOwner(repo) ?? this.#ledger.active(repo.projectId)
      .map(item => repositoryOwner(repo, ownerSlot(item.definition.id))).find(item => item !== undefined);
    if (!row) {
      const local = this.#ledger.active(workspace.projectId).find(item => item.graph && this.#owns(item)
        && (instanceId === undefined || instanceId === item.ref.instanceId));
      return local ? { engine: 'dapr', instanceId: local.ref.instanceId, projectId: workspace.projectId, ownedByThisDataDir: true } : undefined;
    }
    if (instanceId !== undefined && instanceId !== row.instanceId) return undefined;
    return { engine: row.engine, instanceId: row.instanceId, projectId: repo.projectId, ownedByThisDataDir: row.dataDir === this.#ledger.dataDir };
  }

  async listProjections(projectRoot: string): Promise<DurableProjection[]> {
    const workspace = await workspaceIdentity(projectRoot).catch(() => undefined);
    if (!workspace) return [];
    const local = this.#ledger.instances(workspace.projectId);
    const legacy = workspace.repository ? this.#ledger.instances(workspace.repository.projectId) : [];
    return [...local, ...legacy].map(value => project(this.#ledger, value));
  }

  async projection(projectRoot: string, instanceId?: string): Promise<DurableProjection | undefined> {
    const all = await this.listProjections(projectRoot);
    return instanceId === undefined ? all.find(value => value.status === 'waiting' && value.schema === 2 && value.action !== 'readonly-report')
      ?? all.find(value => value.status === 'waiting' && value.schema === 1 && value.ref.definitionId === 'path-b')
      ?? all.find(value => value.status === 'waiting') ?? all[0] : all.find(value => value.ref.instanceId === instanceId);
  }

  lookup(ref: DurableInstanceRef): DurableProjection | undefined {
    const value = this.#find(ref);
    return value && project(this.#ledger, value);
  }

  activeProjections(): DurableProjection[] { return this.#ledger.active().map(value => project(this.#ledger, value)); }

  #find(ref: DurableInstanceRef): StoredInstance | undefined {
    const value = this.#ledger.instance(ref.instanceId);
    return value && sameInstance(value.ref, ref) ? value : undefined;
  }

  #owns(value: StoredInstance): boolean {
    if (value.definition.schema === 2) {
      if (!graphNeedsWrite(value.definition)) return true;
      const directory = workspaceOwner(value.projectRoot);
      if (directory?.engine !== 'dapr' || directory.projectId !== value.ref.projectId
        || directory.instanceId !== value.ref.instanceId || directory.dataDir !== this.#ledger.dataDir) return false;
      if (!value.commonDir) return true;
      const repo = repositoryOwner(value);
      return repo?.engine === 'dapr' && repo.instanceId === value.ref.instanceId && repo.dataDir === this.#ledger.dataDir;
    }
    const registered = repositoryOwner(value, ownerSlot(value.definition.id));
    return registered?.engine === 'dapr' && registered.instanceId === value.ref.instanceId
      && registered.dataDir === this.#ledger.dataDir;
  }

  async bindRepository(ref: DurableInstanceRef, request: { effectKey: string; baselineOid: string; branch: string }): Promise<DurableResult<DurableProjection>> {
    const initial = this.#find(ref);
    if (!initial || initial.definition.schema !== 2 || activeAction(initial) !== 'team-baseline' || !this.#owns(initial)) {
      return fail('workflow-repository-binding-invalid', '当前节点没有仓库绑定权限。');
    }
    const repo = await repositoryIdentity(initial.projectRoot).catch(() => undefined);
    if (!repo || dirname(repo.commonDir) !== repo.root || !oidValid(request.baselineOid)
      || request.branch !== 'ans/task/' + ref.instanceId) return fail('workflow-repository-binding-invalid', 'Git 仓库身份或基线不匹配。');
    const protection = await readGitProtectionFacts(repo.root);
    if (!checkGitProtectionFactsCurrent(protection)) return fail('workflow-git-protection-unavailable', '核对 Git 绑定时仓库保护不可用。');
    const [head, branch] = await Promise.all([gitRead(repo.root, ['rev-parse', '--verify', 'HEAD']), gitRead(repo.root, ['symbolic-ref', '--short', 'HEAD'])]);
    if (head !== request.baselineOid || branch !== request.branch) return fail('workflow-repository-binding-drift', '实际任务分支与基线回执不一致。');
    const ledger = this.#ledger;
    return ledger.transaction(() => {
      const current = this.#find(ref);
      const effect = ledger.effect(ref.instanceId, request.effectKey);
      if (!current || current.stepId !== initial.stepId || !this.#owns(current) || effect?.intent.kind !== 'baseline'
        || effect.state !== 'succeeded' || !equal(current.baseline, { oid: request.baselineOid, branch: request.branch })) {
        return fail('workflow-repository-binding-invalid', '基线回执或当前目录占用已变化。');
      }
      if (current.commonDir && current.commonDir !== repo.commonDir) return fail('workflow-repository-binding-drift', '实例已绑定其他仓库。');
      if (reserveOwnerState(repo, { engine: 'dapr', instanceId: ref.instanceId, dataDir: ledger.dataDir }) === 'conflict') {
        return fail('workflow-workspace-busy', 'Git 仓库已存在其他所有者。');
      }
      current.commonDir = repo.commonDir;
      ledger.save(current);
      return ok(project(ledger, current));
    });
  }

  async readEvidence(projectRoot: string, path: string): Promise<DurableResult<DurableEvidenceRef>> {
    try {
      const bytes = await readProjectFile(projectRoot, path, MaxEvidenceBytes);
      return ok({ path, sha256: digest(bytes) });
    } catch (error) {
      return fail('evidence-unreadable', message(error));
    }
  }

  storeEvidence(ref: DurableInstanceRef, body: unknown): DurableResult<DurableEvidenceRef> {
    if (!this.#find(ref)) return fail('workflow-not-found', '作用域与已有实例不匹配。');
    const serial = stableJson(body);
    if (serial === undefined) return fail('evidence-invalid', '持久证据需要可序列化的 JSON。');
    const bytes = Buffer.from(serial);
    if (bytes.length > MaxEvidenceBytes) return fail('evidence-too-large', '报告超出持久证据大小限制。');
    const sha256 = digest(bytes);
    this.#ledger.saveEvidence(ref.instanceId, sha256, bytes);
    return ok({ path: 'ans-evidence/' + sha256, sha256 });
  }

  getEvidence(ref: DurableInstanceRef, evidence: DurableEvidenceRef): unknown {
    if (!this.#find(ref)) return undefined;
    const bytes = this.#ledger.evidence(ref.instanceId, evidence.sha256);
    if (!bytes || digest(bytes) !== evidence.sha256) return undefined;
    return evidence.path === 'ans-evidence/' + evidence.sha256 ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8');
  }

  async prepareDirectIntentGate(ref: DurableInstanceRef): Promise<DurableResult<DirectIntentDraft | undefined>> {
    const value = this.#find(ref);
    if (!value || value.status !== 'waiting' || activeAction(value) !== 'confirm-intent' || !this.#owns(value)) {
      return fail('workflow-intent-gate-not-open', '当前实例没有可核验的意图确认节点。');
    }
    const graph = value.graph;
    const flowId = graph?.flowId;
    const task = graph?.tasks.find(item => item.capability === 'author-intent-direct' && item.attempt === value.attempt
      && item.flowId === flowId && item.state === 'accepted' && item.report?.key === graph.proofs['intent-written']);
    if (!flowId || !task) return ok(undefined);
    let checked: DurableResult<DirectIntentDraft>;
    try {
      const readOwnedText = async (file: Parameters<typeof readFile>[0]): Promise<string> => {
        const path = relative(value.projectRoot, String(file)).replaceAll('\\', '/');
        return (await readProjectFile(value.projectRoot, path, MaxEvidenceBytes)).toString('utf8');
      };
      const facts = await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId, readFileFn: readOwnedText as unknown as typeof readFile });
      const path = facts.productIntentPath;
      if (!path) {
        checked = fail('workflow-intent-draft-missing', '未找到当前产品任务的版本化意图稿。');
      } else {
        const version = Number(/-intent-v([1-9][0-9]*)\.md$/.exec(path)?.[1]);
        const bytes = await readProjectFile(value.projectRoot, path, 256 * 1024);
        const text = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        const parts = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(text);
        const document = parts && parseDocument(parts[1]!, { uniqueKeys: true });
        const header = document && !document.errors.length && document.toJS({ maxAliasCount: 0 }) as Record<string, unknown>;
        const intentId = header && header.intentId;
        const sha256 = digest(bytes);
        if (!header || header.schema !== 'project-intent/v1' || header.flowId !== flowId
          || !Number.isSafeInteger(version) || header.version !== version || (header.status !== undefined && header.status !== 'draft')
          || typeof intentId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(intentId) || !parts?.[2]?.trim()) {
          checked = fail('workflow-intent-draft-invalid', '意图稿需匹配当前流程、规范版本、意图标识和非空正文。');
        } else {
          const written = this.#ledger.effects(ref.instanceId).some(effect => effect.intent.kind === 'task-write'
            && effect.state === 'succeeded' && effect.intent.stepId === task.stepId && effect.intent.attempt === task.attempt
            && !!effect.intent.task && equal(effect.intent.task, task.task)
            && equal(effect.intent.expected?.paths, [path]) && effect.intent.expected?.contentSha256 === sha256);
          checked = written ? ok({ path, sha256, intentId, version })
            : fail('workflow-intent-draft-unverified', '最新意图稿字节与当前产品任务的已核验写入不匹配。');
        }
      }
    } catch {
      checked = fail('workflow-intent-draft-unreadable', '当前意图稿无法安全读取。');
    }
    return this.#ledger.transaction(() => {
      const current = this.#find(ref);
      if (!current?.graph || current.status !== 'waiting' || current.stepId !== value.stepId || current.attempt !== value.attempt
        || current.graph.proofs['intent-written'] !== task.report?.key || !this.#owns(current)) {
        return fail('workflow-intent-gate-stale', '核对时原意图确认节点已变化。');
      }
      if (checked.ok) {
        current.graph.proofs.intentId = checked.value.intentId;
        if (current.businessReason?.startsWith('workflow-intent-draft-')) delete current.businessReason;
      } else {
        delete current.graph.proofs.intentId;
        current.businessReason = checked.code + ': ' + checked.message;
      }
      this.#ledger.save(current);
      return checked;
    });
  }

  async #capture(value: StoredInstance, ref: DurableEvidenceRef): Promise<Evidence> {
    if (!hashValid(ref.sha256)) throw new Error('无效证据摘要。');
    const bytes = ref.path === 'ans-evidence/' + ref.sha256
      ? this.#ledger.evidence(value.ref.instanceId, ref.sha256) : await readProjectFile(value.projectRoot, ref.path, MaxEvidenceBytes);
    if (!bytes || digest(bytes) !== ref.sha256) throw new Error('报告字节与固定摘要不匹配。');
    return { ref, bytes };
  }

  async #captureEffective(value: StoredInstance, original: DurableEvidenceRef): Promise<Evidence> {
    const effective = effectiveRevisionEvidence(value, original);
    if (!equal(effective, original)) await this.#capture(value, original);
    return this.#capture(value, effective);
  }

  #verifyIntentDecisionCard(card: DurableGraphCard, intentPath: string | undefined, evidence: readonly Evidence[], approving = false): DurableResult<true> {
    const intent = intentPath ? evidence.find(item => item.ref.path === intentPath) : undefined;
    if (intentPath && !intent) return fail('workflow-intent-draft-drift', '意图确认卡未绑定当前有效的意图稿及摘要。');
    const parsed = parseIntentDecisionRequirements(intent?.bytes.toString('utf8') ?? '');
    if (approving && !parsed.ok) return parsed;
    if (card.decisionFields === undefined && card.payload?.decisionOptions === undefined
      && (parsed.ok ? card.decisionProblem === undefined : card.decisionProblem === parsed.message
        && equal([...(card.options ?? [])].sort(), ['reject', 'revise']))) return ok(true);
    return fail('workflow-intent-decision-card-drift', 'A3 卡须显示当前意图的定案核对结果，无效声明只允许修订或拒绝。');
  }

  #proposalCardMatchesMaterials(value: StoredInstance, card: DurableGraphCard, flowId: string, evidence: readonly Evidence[]): boolean {
    const versioned = (prefix: string) => evidence.find(item => item.ref.path.startsWith(prefix)
      && /^[1-9][0-9]*\.md$/.test(item.ref.path.slice(prefix.length)));
    const proposal = versioned('docs/proposals/' + flowId + '-proposal-v');
    const intent = versioned('docs/product/' + flowId + '-intent-v');
    const parsed = parseProposalDecisionFields(proposal?.bytes.toString('utf8') ?? '', intent?.bytes.toString('utf8') ?? '');
    if (parsed.ok && !parsed.value.length) return card.decisionFields === undefined && card.decisionProblem === undefined
      && card.payload?.decisionOptions === undefined;
    if (!proposal || !intent) return false;
    const authored = value.graph?.tasks.findLast(task => task.capability === 'author-proposal' && task.outcome === 'accepted');
    if (!authored?.documents?.some(document => document.path === proposal.ref.path && document.sha256 === proposal.ref.sha256)) return false;
    if (!parsed.ok) return equal(card.decisionFields, []) && card.decisionProblem === parsed.message
      && equal(card.payload?.decisionOptions ?? {}, {}) && equal([...(card.options ?? [])].sort(), ['reject', 'revise']);
    const options = proposalDecisionChoices(parsed.value);
    return card.decisionProblem === undefined && equal(card.decisionFields, parsed.value)
      && equal(card.payload?.decisionOptions, options)
      && equal([...(card.options ?? [])].sort(), [...Object.keys(options), 'reject', 'revise'].sort());
  }

  #reviewMatchesProposal(content: string, proposal: DurableProposalDecision): boolean {
    const frontmatter = /^\ufeff?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    const header = frontmatter && parseDocument(frontmatter[1]!, { uniqueKeys: true });
    const fields = header && !header.errors.length ? header.toJS({ maxAliasCount: 0 }) as Record<string, unknown> | undefined : undefined;
    return fields?.proposalDecisionDigest === proposal.selectionDigest && equal(fields.decisionValues, proposal.values);
  }

  #browserEvidenceMatchesStandard(workspace: DurableAcceptanceWorkspaceProjection, flowId: string, standard: Evidence,
    attachments: readonly Evidence[], requiredBrowserIds?: readonly string[]): boolean {
    const { binding, receipt, browserEvidence, closeReceipt } = workspace;
    if (!binding || !receipt || !closeReceipt || !browserEvidence?.captureReceiptIds?.length) return false;
    const criteria = parseCriteriaText(standard.bytes.toString('utf8'), { flowId, fileName: basename(standard.ref.path) });
    const expected = criteria.ok && criteria.doc.status === 'final'
      ? [...new Set(requiredBrowserIds ?? criteria.doc.criteria.filter(item => item.priority === 'P0').map(item => item.id))].sort() : [];
    if (!expected.length || !equal(expected, [...browserEvidence.checks].sort())) return false;
    const turnId = receipt.kind === 'acceptance-workspace-static-run' ? receipt.stage.turnId : receipt.build.turnId;
    const earned = new Set<string>();
    for (const shot of attachments.filter(file => file.ref.path.endsWith('.png'))) {
      const sidecar = attachments.find(file => file.ref.path === shot.ref.path + '.meta.json');
      if (!sidecar) return false;
      const text = sidecar.bytes.toString('utf8');
      const metadata = parseEvidenceMeta(text);
      if (!metadata.ok || 'collection' in metadata.meta || metadata.meta.artifact !== shot.ref.path
        || metadata.meta.bytes !== shot.bytes.length || metadata.meta.sha256 !== shot.ref.sha256) return false;
      const { acceptanceWorkspace } = JSON.parse(text) as { acceptanceWorkspace?: Record<string, unknown> };
      const capturedAt = Date.parse(metadata.meta.generatedAt);
      if (acceptanceWorkspace?.candidateOid !== workspace.basis.candidateOid || acceptanceWorkspace.criteriaSha256 !== standard.ref.sha256
        || acceptanceWorkspace.taskId !== workspace.basis.assessmentTask.taskId || acceptanceWorkspace.turnId !== turnId
        || acceptanceWorkspace.previewUrl !== receipt.preview.url || acceptanceWorkspace.runReceiptId !== workspace.runReceiptId
        || acceptanceWorkspace.proposalDecisionDigest !== binding.proposalDecisionDigest
        || !(capturedAt >= Date.parse(receipt.preview.openedAt) && capturedAt <= Date.parse(closeReceipt.closedAt)
          && capturedAt <= Date.parse(browserEvidence.observedAt) && capturedAt <= Date.parse(receipt.preview.expiresAt))) return false;
      for (const check of metadata.meta.acIds ?? []) if (expected.includes(check)) earned.add(check);
    }
    return equal(expected, [...earned].sort());
  }

  graphCardDigest = graphCardDigest;

  listCapabilityEvents(ref: DurableInstanceRef): readonly { event: DurableCapabilityEvent; receipt: DurableFactReceipt }[] {
    if (!this.#find(ref)) return [];
    return this.#ledger.facts(ref.instanceId).flatMap(({ fact, receipt }) => fact.kind === 'capability-event' ? [{ event: fact.event, receipt }] : []);
  }

  async #workflowExistingPaths(value: StoredInstance): Promise<DurableResult<readonly string[]>> {
    const head = value.graph?.observedHead ?? await gitRead(value.projectRoot, ['rev-parse', '--verify', 'HEAD']);
    if (!value.metadata.summary?.trim() || !oidValid(head)) return fail('workflow-existing-purpose-unverified', '既有变更缺少原始需求或 Git 基线。');
    const request = [value.metadata.summary, value.metadata.selectionReason].filter(Boolean).join('\n');
    const entries = await gitRead(value.projectRoot, ['ls-tree', '-r', '-z', '--full-tree', head]);
    const requestedPaths = entries.split('\0').flatMap(entry => {
      const file = /^100(?:644|755) blob [a-f0-9]{40,64}\t(.+)$/.exec(entry)?.[1];
      if (!file || !safePath(file)) return [];
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reference = new RegExp('(?:^|[^a-zA-Z0-9_./-])(?:\\./)?' + escaped + '(?=$|[^a-zA-Z0-9_./-]|\\.(?:$|\\s))');
      return reference.test(request) ? [file] : [];
    });
    return requestedPaths.length > 0 && requestedPaths.length <= 5 ? ok(requestedPaths)
      : fail('workflow-existing-scope-ambiguous', '请补充本次变更涉及的具体 Git 跟踪文件，再提请确认工作流。');
  }

  async prepareWorkflowDispatch(ref: DurableInstanceRef, reviewerPreflight?: DurableReviewPreflightFn,
    verificationPreflight?: DurableVerificationPreflightFn): Promise<DurableResult<DurableProjection>> {
    const value = this.#find(ref);
    if (!value || !value.graph || !workflowOwnsDispatch(value)) return fail('workflow-dispatch-not-open', '实例未由工作流接管固定派发。');
    const finish = () => ok(project(this.#ledger, this.#find(ref)!));
    if (value.status !== 'waiting' || value.engine !== 'healthy' || revisionParksNode(value) || blockedRoutingProjection(this.#ledger, value)) return finish();
    const action = activeAction(value);
    if (!action) return finish();
    const { attempt, stepId, projectRoot } = value;
    const original = value.graph.existingRequest?.input;
    const flowId = value.graph.flowId ?? 'intake-' + digest(ref.instanceId).slice(0, 24);
    const summary = value.metadata.summary ?? '';
    const dispatch = { actor: 'application', flowId, runtime: value.metadata.runtime, text: summary };
    const address = { stepId, attempt, flowId };
    const source = { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId };
    const isCurrent = () => {
      const current = this.#find(ref);
      return !!current && current.status === 'waiting' && current.engine === 'healthy' && current.stepId === stepId
        && current.attempt === attempt && this.#owns(current);
    };
    const bind = async (fact: DurableFact): Promise<DurableResult<DurableProjection>> => {
      if (!isCurrent()) return finish();
      const saved = await this.submit(ref, fact);
      return saved.ok ? finish() : saved;
    };
    try {
      if (action === 'observe-existing') {
        if (original) return finish();
        const paths = await this.#workflowExistingPaths(value);
        if (!paths.ok) return paths;
        const observed = await this.submitCapability(ref, { ...address, key: 'workflow-observe:' + stepId + ':' + attempt, source,
          input: { kind: 'stage-request', workflowPath: 'B', stage: 'B1', requestDigest: digest(summary), dispatch,
            existingPaths: paths.value, reason: '已批准的需求及选流理由引用的实际跟踪文件。' } }, isCurrent);
        return observed.ok ? finish() : observed;
      }
      if (action === 'verify-stop') {
        const key = 'workflow-stop:' + stepId + ':' + attempt;
        const settled = await this.submitCapability(ref, { ...address, key, source, input: { kind: 'stop-verified', reportKey: key } }, isCurrent);
        return settled.ok ? finish() : settled;
      }
      if (action === 'accept-b3-advance-with-b2-scope') {
        if (value.scope || !value.analysisReport || !value.baseline) return finish();
        const scopeFiles = value.analysisReport.modulePaths;
        const owners = await deriveDurablePathBWriteSets({ projectRoot, flowId, scopeFiles });
        if (!owners.ok) return owners;
        const evidenceRequirements = evidenceRequirementsFromB1(this.#ledger, value);
        const knownEvidenceAuthority = b2EvidenceDecisionProjection(this.#ledger, value);
        const scopeId = 'b2-evidence-scope:' + digest(stableJson([ref, address, value.analysisReport.key, value.baseline, owners.writesets]));
        if (knownEvidenceAuthority?.decision === 'approve' && (knownEvidenceAuthority.scopeId !== scopeId
          || !equal(knownEvidenceAuthority.requirements, evidenceRequirements)
          || !equal(knownEvidenceAuthority.writePaths, await deriveDurableEvidenceWriter(projectRoot, flowId, knownEvidenceAuthority.roleId)))) {
          return fail('b2-acceptance-evidence-approval-mismatch', '已批准的取证身份、原变更范围或写域已变化。');
        }
        if (knownEvidenceAuthority && !knownEvidenceAuthority.decision) return finish();
        if (!knownEvidenceAuthority && evidenceRequirements.length && evidenceRequirements.every(requirement =>
          requirement.source === 'candidate-file' && requirement.paths?.every(path => scopeFiles.includes(path)))) {
          const roleId = 'acceptance-evidence-collector';
          const writePaths = await deriveDurableEvidenceWriter(projectRoot, flowId, roleId);
          if (writePaths?.length && !owners.writesets.some(owner => owner.roleId === roleId)) {
            const sha = digest(stableJson([scopeId, roleId, writePaths, evidenceRequirements]));
            const binding = { requestId: scopeId + ':' + sha.slice(0, 12), digest: sha, generation: value.attempt };
            const request = { binding, scopeId, roleId, writePaths, requirements: evidenceRequirements };
            const prepared = await this.#submitAuditEvent(value, 'b2-evidence-scope-prepared:' + binding.requestId,
              { kind: 'b2-evidence-scope-prepared', request }, isCurrent);
            return prepared.ok ? finish() : prepared;
          }
        }
        return await bind({ kind: 'b3-advance', source: 'host', stepId, attempt, key: 'workflow-scope:' + stepId + ':' + attempt,
          sourceTaskId: ref.instanceId, requestDigest: digest(summary), reportKey: value.analysisReport.key,
          b1Attempt: value.analysisReport.attempt, baselineOid: value.baseline.oid, candidateSource: 'modulePaths',
          candidates: scopeFiles, writeSets: owners.writesets, reason: '使用本次可用 B1 报告、既有跟踪文件与实际边界核定范围。', dispatch,
          ...(evidenceRequirements.length ? { evidenceRequirements } : {}),
          ...(knownEvidenceAuthority?.decision === 'approve' ? { evidenceAuthorization: knownEvidenceAuthority } : {}) });
      }
      if (action === 'b1-impact-readonly' || action === 'readonly-report' || action === 'b3-implement-and-accept') {
        if (value.task) return finish();
        const requests = this.#ledger.facts(ref.instanceId).filter(item => item.fact.kind === 'stage-request'
          && item.fact.stepId === stepId && item.fact.attempt === attempt);
        let scopeFiles = original?.kind === 'stage-request' ? original.existingPaths : undefined;
        if (action === 'readonly-report' && !scopeFiles) {
          const paths = await this.#workflowExistingPaths(value);
          if (!paths.ok) return paths;
          scopeFiles = paths.value;
          if (!requests.length) return await bind({ kind: 'stage-request', source: 'host', stepId, attempt,
            key: 'workflow-readonly:' + stepId + ':' + attempt, sourceTaskId: ref.instanceId, requestDigest: digest(summary), dispatch });
        }
        if ((action === 'readonly-report' || action === 'b1-impact-readonly' && attempt === 1)
          && !requests.some(item => item.receipt.state === 'consumed')) return finish();
        const owners = action === 'b3-implement-and-accept' && value.scope ? { ok: true as const, writesets: value.scope.writeSets }
          : scopeFiles?.length ? await deriveDurablePathBWriteSets({ projectRoot, flowId, scopeFiles }) : undefined;
        if (!owners) return fail('workflow-existing-scope-ambiguous', '固定任务缺少已核验的既有文件。');
        if (!owners.ok) return owners;
        if (owners.writesets.length !== 1) return fail('workflow-owner-ambiguous', '此步骤需要唯一模块属主，请核对范围。');
        const { roleId, paths } = owners.writesets[0]!;
        const stage = action === 'b1-impact-readonly' ? 'B1' : action === 'b3-implement-and-accept' ? 'B3' : 'readonly';
        if (stage === 'B1') dispatch.text += '\n若当前已确认需求确有必须交出的验收证据，在正式回交 evidence 逐项补 JSON {"kind":"b2-evidence-requirement","requirementId":"实际编号","reason":"对应正式要求"}。可由当前受控候选文件证明时补 source:"candidate-file" 和 B2 字面候选 paths 数组。此记录不授予额外写域。';
        const task: DurableTaskBinding = { stage, stageAttempt: attempt, executionAttempt: 1, roleId,
          taskId: graphTaskId(ref, roleId, stepId, attempt), parentTaskId: graphTaskId(ref, 'convener', stepId, attempt) };
        return await bind({ kind: 'task-bound', source: 'host', key: 'workflow-bind:' + task.taskId,
          stepId, attempt, task, modulePaths: paths, dispatch });
      }
      const descriptor = capabilities[action];
      const selected = value.definition.steps[stepId]!;
      const selector = 'action' in selected ? selected.role ?? (descriptor.independent ? 'verifier' : workflowTaskRoles[action]) : undefined;
      if (!selector || !descriptor.stage || ['product-prepare-direct', 'author-intent-direct'].includes(action)
        || value.graph.tasks.some(task => task.stepId === stepId && task.attempt === attempt)) return finish();
      let roleId: string = selector;
      let modulePaths: readonly string[] | undefined;
      let reviewWritePath: string | undefined;
      let verificationCapabilities: DurableVerificationCapabilitySnapshot | undefined;
      const requiresReviewPreflight = descriptor.independent
        && (value.metadata.workflowReviewPreflight === 'true' || selector !== 'independent-reviewer');
      const reviewFailure = async (problem: { code: string; message: string }): Promise<DurableResult<never>> => {
        if (requiresReviewPreflight) await this.submitCapability(ref, { ...address, key: 'review-preflight:' + stepId + ':' + attempt, source,
          input: { kind: 'review-preflight-failed', roleId, reason: (problem.code + ' ' + problem.message).slice(0, 1500) } }, isCurrent);
        return { ok: false, ...problem };
      };
      if (selector === 'independent-reviewer') {
        const roster = await loadLatestRoster({ projectRoot, flowId, evidenceCollectorRoleId: evidenceAuditConfiguration(value)?.collectorRoleId });
        const reviewer = roster.ok ? reviewRoleIdOfRoster(roster.roster) : undefined;
        if (!reviewer || requiresReviewPreflight && (!roster.ok
          || !equal(value.graph.proposalRoster, { path: roster.path, sha256: roster.sha256 }))) {
          return reviewFailure({ code: 'workflow-reviewer-unavailable', message: '本次冻结批准名单中缺可核验的独立验收角色。' });
        }
        roleId = reviewer;
      } else if (selector === 'module-owner') {
        const roster = await loadLatestRoster({ projectRoot, flowId, evidenceCollectorRoleId: evidenceAuditConfiguration(value)?.collectorRoleId });
        if (!roster.ok || !equal(value.graph.proposalRoster, { path: roster.path, sha256: roster.sha256 })) {
          return fail('workflow-roster-drift', '实施目标需要本次获批的实际名单。');
        }
        const reviewer = reviewRoleIdOfRoster(roster.roster);
        const approved = (value.graph.writeSets ?? []).filter(entry => entry.roleId !== reviewer
          && entry.roleId !== evidenceAuditConfiguration(value)?.collectorRoleId);
        if (approved.length !== 1) return fail('workflow-owner-ambiguous', '已任命的团队计划没有唯一的当前实施写集。');
        ({ roleId, paths: modulePaths } = approved[0]!);
      }
      if (descriptor.independent && roleId === evidenceAuditConfiguration(value)?.collectorRoleId) {
        return reviewFailure({ code: 'workflow-reviewer-unavailable', message: '取证属主不能承担同一候选的独立验收。' });
      }
      const taskId = graphTaskId(ref, roleId, stepId, attempt);
      if (action === 'operations-implementation') {
        const items = implementationDispatchItems(this.#ledger, value);
        const roles = await this.#verifyImplementationAuthority(value);
        if (!roles.ok) return roles;
        const currentTip = implementationHead(value);
        if (!items.length || !currentTip || !value.graph.proofs['standard-open'] || !value.graph.proofs.appointed
          || !value.graph.proofs['team-plan']) return fail('workflow-implementation-not-open', '实施缺少获批工作项、任命、基线或已通过的验收标准。');
        const head = await this.#verifyImplementationGit(value, currentTip);
        if (!head.ok) return head;
      }
      if (action === 'operations-environment-recovery') {
        const missing = recoveryMissing(this.#ledger, value)?.missing;
        if (!missing) return fail('environment-recovery-not-open', '恢复任务缺已核验的验收环境缺项。');
        const owners = recoveryOwners(value, missing);
        dispatch.text = '核对当前独立验收缺少的本地 npm 执行入口 ' + missing.condition.executable
          + '，候选 ' + missing.basis.candidateOid + '，标准 ' + missing.basis.criteria.path + '。'
          + (owners.length ? '使用 dispatch_task 在以下已任命的清单属主中安排一名：' + owners.join('、') + '。收到回交后用 close_created_task 收口。'
            : '当前没有获批的清单属主，请提交正式的阻塞回交。')
          + '本任务只补齐本地依赖。保持源文件、标准、锁文件及候选提交。';
      }
      if ((descriptor.stage === 'A12a' || descriptor.stage === 'A12b') && requiresReviewPreflight) {
        if (!reviewerPreflight) return fail('workflow-review-preflight-unavailable', '独立验收派发需要应用核对实际写门。');
        if (roleId !== 'verifier') {
          const roster = await loadLatestRoster({ projectRoot, flowId, evidenceCollectorRoleId: evidenceAuditConfiguration(value)?.collectorRoleId });
          if (!roster.ok || !equal(value.graph.proposalRoster, { path: roster.path, sha256: roster.sha256 })
            || !roster.roster.roles.some(entry => entry.id === roleId)) {
            return reviewFailure({ code: 'workflow-reviewer-unavailable', message: '具名验收角色不在当前冻结的批准名单中。' });
          }
        }
        if (descriptor.stage === 'A12a') {
          if (!value.baseline) return reviewFailure({ code: 'workflow-review-baseline-unavailable', message: '缺本次已核验基线。' });
          const head = await this.#verifyImplementationGit(value, value.baseline.oid);
          if (!head.ok) return reviewFailure(head);
        } else {
          const standard = value.graph.tasks.findLast(task => task.capability === 'independent-standard' && task.outcome === 'accepted'
            && task.roleId === roleId && task.baselineOid === value.baseline?.oid);
          const candidateOid = value.graph.proofs.implementationTip ?? value.graph.proofs.acceptedTip;
          if (!standard?.documents?.length || !candidateOid || !value.implementation) {
            return reviewFailure({ code: 'workflow-review-proof-unavailable', message: '本次候选缺独立标准或已核验实施提交。' });
          }
          if (!acceptancePreparationEnabled(value)) {
            try {
              const documents = await Promise.all(standard.documents.map(document => this.#capture(value, document)));
              const approved = currentProposalDecision(this.#ledger, value);
              if (approved && !documents.some(document => document.ref.path.startsWith('docs/quality/' + flowId + '-criteria-v')
                && this.#reviewMatchesProposal(document.bytes.toString('utf8'), approved))) {
                return reviewFailure({ code: 'workflow-review-proposal-decision-mismatch', message: '验收标准须沿用当前批准的 A6 选择与摘要。' });
              }
            } catch {
              return reviewFailure({ code: 'workflow-review-standard-drift', message: '已核验的独立验收标准发生变化。' });
            }
            const head = await this.#verifyImplementationGit(value, candidateOid);
            if (!head.ok) return reviewFailure(head);
          }
        }
        const suffix = descriptor.stage === 'A12a' ? 'criteria' : 'report';
        const prefix = flowId + '-' + suffix;
        const files = await readdir(projectRoot + '/docs/quality').catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        });
        const existing = files.map(file => Number(new RegExp('^' + prefix + '-v([1-9][0-9]*)\\.md$').exec(file)?.[1] ?? 0));
        reviewWritePath = 'docs/quality/' + prefix + '-v' + (Math.max(0, ...existing) + 1) + '.md';
        const checked = await reviewerPreflight({ ...address, projectRoot, roleId, taskId, stage: descriptor.stage, path: reviewWritePath });
        if (!checked.ok) return reviewFailure(checked);
        if (descriptor.stage === 'A12a' && (blockedRoutingEnabled(value) || evidenceAuditConfiguration(value))) {
          if (!verificationPreflight || !value.baseline) return fail('verification-capabilities-unavailable', '独立标准需要应用实际核对验收能力。');
          const caps = await verificationPreflight({ ...address, ref, projectRoot, roleId, taskId, stage: descriptor.stage, path: reviewWritePath,
            baselineOid: value.baseline.oid, proposalDecisionDigest: currentProposalDecision(this.#ledger, value)?.selectionDigest });
          if (!caps.ok) return reviewFailure(caps);
          if (!verificationCapabilitiesValid(caps.value, !!evidenceAuditConfiguration(value))) return fail('verification-capabilities-invalid', '应用验收能力快照不完整或无法核对。');
          verificationCapabilities = caps.value;
        }
      }
      const task = { stage: descriptor.stage, stageAttempt: attempt, executionAttempt: 1, roleId, taskId,
        parentTaskId: action === 'governed-implementation' ? graphTaskId(ref, 'convener', stepId, attempt) : ref.instanceId };
      const submitted = await this.#submitCapability(ref, { ...address, key: 'workflow-bind:' + taskId,
        source: { ...source, originId: taskId }, input: { kind: 'task-bound', task, dispatch, modulePaths, reviewWritePath,
          ...(verificationCapabilities ? { verificationCapabilities } : {}) } }, isCurrent, false, !!verificationCapabilities);
      return submitted.ok ? finish() : submitted;
    } catch (error) {
      return fail('workflow-dispatch-prepare-failed', message(error));
    }
  }

  async #verifyImplementationGit(value: StoredInstance, tip: string, base?: string,
    paths?: readonly string[]): Promise<DurableResult<true>> {
    if (!value.baseline || !oidValid(tip) || base && !oidValid(base)) return fail('workflow-implementation-git-invalid', '缺有效的任务分支或提交起点。');
    const read = (...args: string[]) => gitRead(value.projectRoot, ['--no-optional-locks', ...args]);
    const [head, branch, staged, dirty] = await Promise.all([
      read('rev-parse', '--verify', 'HEAD'), read('symbolic-ref', '--short', 'HEAD'),
      read('diff', '--cached', '--name-only', '-z'), read('diff', '--name-only', '-z'),
    ]);
    if (head !== tip || branch !== value.baseline.branch || staged || dirty) {
      return fail('workflow-implementation-head-drift', '实际 HEAD、任务分支、暂存区或已追踪文件已变化，请核对原任务。');
    }
    if (base && paths) {
      const files = (await read('diff', '--no-renames', '--name-only', '-z', base, tip)).split('\0').filter(Boolean);
      if (!files.length || files.some(file => !safePath(file) || !paths.some(path => file === path || path.endsWith('/') && file.startsWith(path)))) {
        return fail('workflow-implementation-diff-invalid', '候选变更缺失或超出获批写集。');
      }
    }
    return ok(true);
  }

  async #verifyImplementationAuthority(value: StoredInstance): Promise<DurableResult<true>> {
    const roles = await this.#verifyActivatedRoleDocuments(value);
    if (!roles.ok) return roles;
    const graph = value.graph!;
    const key = graph.proofs['team-plan'];
    const source = key && this.#ledger.fact(value.ref.instanceId, key);
    const input = source && source.fact.kind === 'capability-event' ? source.fact.event.input : undefined;
    if (input?.kind !== 'baseline-verified' || input.baselineOid !== value.baseline?.oid
      || input.branch !== value.baseline?.branch || !input.documents?.length) {
      return fail('workflow-implementation-basis-unavailable', '本次实施缺已核验的团队计划和基线记录。');
    }
    try {
      await Promise.all(input.documents.map(document => this.#captureEffective(value, document)));
    } catch {
      return fail('workflow-implementation-basis-drift', '本次实施的团队计划、名单或依据文件已变化。');
    }
    return ok(true);
  }

  async #verifyImplementationEvent(value: StoredInstance, event: DurableCapabilityEvent): Promise<DurableResult<true>> {
    const input = event.input;
    if ((blockedRoutingEnabled(value) || evidenceAuditConfiguration(value))
      && (input.kind === 'implementation-dispatch' || input.kind === 'task-closed' && input.outcome === 'accepted')) {
      const plan = currentVerificationPlan(this.#ledger, value);
      if (!plan) return fail('verification-standard-unavailable', '当前实施缺已签发能力标准。');
      try { await this.#capture(value, plan.standard); }
      catch { return fail('verification-standard-drift', '当前签发标准文件已缺失或变化，先按原授权恢复或核准新版本。'); }
    }
    if (input.kind === 'implementation-dispatch') {
      const head = implementationHead(value);
      if (!head) return fail('workflow-implementation-git-invalid', '缺本次已核验的任务分支 HEAD。');
      const roles = await this.#verifyImplementationAuthority(value);
      return roles.ok ? this.#verifyImplementationGit(value, head) : roles;
    }
    if (input.kind === 'task-closed') {
      const child = implementationChildren(value).find(task => equal(task.task, input.task));
      if (!child?.baseOid || !child.modulePaths?.length) return fail('workflow-implementation-child-invalid', '没有对应受派子任务。');
      const effect = this.#ledger.effects(value.ref.instanceId).find(record => record.intent.kind === 'task-commit'
        && record.state === 'succeeded' && equal(record.intent.task, input.task));
      const oid = effect?.result?.result?.oid;
      if (typeof oid !== 'string' && input.tipOid || oid !== undefined && (typeof oid !== 'string' || oid !== input.tipOid
        || effect?.intent.expected?.head !== child.baseOid || effect.intent.expected.branch !== value.baseline?.branch)) {
        return fail('workflow-implementation-child-unverified', '任务提交未绑定本次已核验起点。');
      }
      const verified = await this.#verifyImplementationGit(value, typeof oid === 'string' ? oid : child.baseOid,
        typeof oid === 'string' ? child.baseOid : undefined, child.modulePaths);
      if (!verified.ok || typeof oid !== 'string') return verified;
      if (await gitRead(value.projectRoot, ['show', '-s', '--format=%P', oid]) !== child.baseOid)
        return fail('workflow-implementation-commit-chain', '子任务提交父链与已核验前序不匹配。');
      const disposition = a11DispositionProjection(this.#ledger, value);
      if (input.outcome === 'accepted' && disposition?.retest && sameTask(disposition.childTask, child.task))
        return this.#verifyImplementationAuthority(value).then(authority => authority.ok ? this.#a11CleanCandidate(value, child, oid) : authority);
      return ok(true);
    }
    if (input.kind === 'task-report' && input.task.roleId === 'convener') {
      const report = this.getEvidence(value.ref, input.evidence) as { report?: { status?: string } } | undefined;
      if (report?.report?.status !== 'completed') return ok(true);
      const aggregate = implementationAggregate(this.#ledger, value);
      if (!aggregate || !value.baseline) return fail('workflow-implementation-summary-incomplete', '仍缺少获批工作项的正式报告与提交。');
      const roles = await this.#verifyImplementationAuthority(value);
      if (!roles.ok) return roles;
      return this.#verifyImplementationGit(value, aggregate.tipOid, value.baseline.oid, implementationItems(value).flatMap(item => item.paths));
    }
    return ok(true);
  }

  async #verifyRecoveryArtifacts(value: StoredInstance, missing: DurableAcceptanceEnvironmentMissing): Promise<DurableResult<true>> {
    const { basis, manifest, lock, condition } = missing;
    const candidate = value.graph?.proofs.implementationTip ?? value.graph?.proofs.acceptedTip;
    const standard = value.graph?.tasks.findLast(task => task.capability === 'independent-standard' && task.roleId === basis.assessmentTask.roleId
      && task.outcome === 'accepted' && task.baselineOid === value.baseline?.oid);
    if (candidate !== basis.candidateOid || basis.branch !== value.baseline?.branch
      || !standard?.documents?.some(document => equal(document, basis.criteria))) {
      return fail('environment-recovery-basis-drift', '当前候选、任务分支或验收标准已变化。');
    }
    const head = await this.#verifyImplementationGit(value, candidate);
    if (!head.ok) return head;
    const paths = [manifest.path, ...(lock ? [lock.path] : [])];
    if (!await trackedFiles(value.projectRoot, candidate, paths)) {
      return fail('environment-recovery-manifest-drift', '本地依赖依据未绑定当前候选的普通跟踪清单或锁。');
    }
    const [captured, criteria, capturedLock] = await Promise.all([this.#capture(value, manifest), this.#capture(value, basis.criteria),
      ...(lock ? [this.#capture(value, lock)] : [])]);
    if (!lock) {
      const trackedLock = await gitRead(value.projectRoot, ['ls-tree', '-z', candidate, '--', 'package-lock.json']);
      const entries = await readdir(value.projectRoot);
      if (trackedLock || entries.some(file => file.toLowerCase() === 'package-lock.json')) {
        return fail('environment-recovery-lock-drift', '当前候选或工作树存在锁文件，不能按无锁恢复。');
      }
    }
    const packageManifest = JSON.parse(captured.bytes.toString('utf8')) as { scripts?: Record<string, unknown> };
    const verified = missing.origin === 'preflight'
      ? preflightScriptVerified(condition, packageManifest, capturedLock && JSON.parse(capturedLock.bytes.toString('utf8')),
        criteria.bytes.toString('utf8'))
      : typeof packageManifest.scripts?.[condition.script] === 'string';
    if (!verified) {
      return fail('environment-recovery-script-unverified', '缺项未对应候选清单中的实际 npm 检查脚本。');
    }
    return ok(true);
  }

  async #verifyStaticWorkspaceOutput(value: StoredInstance,
    receipt: Extract<DurableAcceptanceWorkspaceRunReceipt, { kind: 'acceptance-workspace-static-run' }>): Promise<DurableResult<true>> {
    const { binding, stage } = receipt;
    const { candidateOid } = binding.basis;
    const entries = (await gitRead(value.projectRoot, ['ls-tree', '-rz', '--full-tree', candidateOid])).split('\0');
    const blobs = new Map<string, string>();
    for (const entry of entries) {
      const match = /^100(?:644|755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/.exec(entry);
      if (match) blobs.set(match[2]!, match[1]!);
    }
    let remaining = 48 * 1024 * 1024;
    for (const file of stage.files) {
      const expectedOid = blobs.get(file.path);
      const path = join(binding.outputRoot, file.path);
      const stat = await lstat(path);
      if (!expectedOid || !stat.isFile() || stat.nlink !== 1 || stat.size > remaining || relative(path, await realpath(path)) !== '') {
        return fail('acceptance-workspace-static-output-drift', '静态预览输出与原候选的受控文件清单不符。');
      }
      const bytes = await readProjectFile(value.projectRoot, relative(value.projectRoot, path).replaceAll('\\', '/'), stat.size);
      const blob = createHash(expectedOid.length === 40 ? 'sha1' : 'sha256').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
      if (digest(bytes) !== file.sha256 || blob !== expectedOid) {
        return fail('acceptance-workspace-static-output-drift', '静态预览文件字节与本次回执或原候选不符。');
      }
      remaining -= bytes.length;
    }
    return ok(true);
  }

  recordAcceptanceEnvironmentMissing(ref: DurableInstanceRef, missing: DurableAcceptanceEnvironmentMissing,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const evidence = missing.origin === 'report' ? { ...missing, origin: undefined } : missing;
    return this.#submitEnvironmentEvent(ref, missing.basis.assessmentTask, 'environment-missing:' + missing.basis.assessmentTask.taskId,
      { kind: 'environment-missing', missing: evidence }, isCurrent);
  }

  dispatchAcceptanceEnvironment(ref: DurableInstanceRef, dispatch: DurableAcceptanceEnvironmentDispatch,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    return this.#submitEnvironmentEvent(ref, dispatch.parentTask, 'environment-child:' + dispatch.parentTask.taskId,
      { kind: 'environment-recovery-dispatch', dispatch }, isCurrent);
  }

  settleAcceptanceEnvironment(ref: DurableInstanceRef, settlement: DurableAcceptanceEnvironmentSettlement,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    return this.#submitEnvironmentEvent(ref, settlement.parentTask, 'environment-result:' + settlement.parentTask.taskId,
      { kind: 'environment-recovery-settled', settlement }, isCurrent);
  }

  async recordImplementationSelfTest(ref: DurableInstanceRef, input: { task: DurableTaskBinding; observation: ImplementationSelfTestObservation },
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const observation = input.observation;
    const invalid = () => fail('implementation-self-test-invalid', '模块自测须由当前获批工单在实际已提交候选上执行，正常退出并通过写入审计。');
    if (!value || !blockedRoutingEnabled(value) && !evidenceAuditConfiguration(value) || value.status !== 'waiting' || value.engine !== 'healthy'
      || activeAction(value) !== 'operations-implementation' || !isCurrent() || observation.roleId !== input.task.roleId
      || relative(value.projectRoot, observation.cwd) || !implementationTestCommand(observation.argv)) return invalid();
    const child = implementationChildren(value).find(item => sameTask(item.task, input.task));
    if (!child?.workOrder?.requirements.some(requirement => implementationTestMatches(requirement, observation.argv)) || child.report) return invalid();
    const disposition = a11DispositionProjection(this.#ledger, value);
    const retest = disposition?.retest && sameTask(disposition.childTask, child.task) ? disposition : undefined;
    if (retest && (retest.state !== 'resumed' || !retest.retest?.missingRequirements.some(req => implementationTestMatches(req, observation.argv))
      || this.#ledger.effect(ref.instanceId, a11ResumeModelKey(retest.key))?.result?.result?.turnId !== observation.turnId
      || retest.workOrderDigest !== child.workOrder.digest)) return invalid();
    const committed = this.#ledger.effects(ref.instanceId).findLast(effect => effect.intent.kind === 'task-commit'
      && effect.state === 'succeeded' && sameTask(effect.intent.task, child.task));
    const candidateOid = committed?.result?.result?.oid;
    if (typeof candidateOid !== 'string' || retest && (retest.candidateOid !== candidateOid || retest.commitEffectKey !== committed?.intent.key)) return invalid();
    try {
      const ensure = retest ? await this.#a11CleanCandidate(value, child, candidateOid)
        : await this.#verifyImplementationGit(value, candidateOid, child.baseOid, child.modulePaths);
      if (retest && (!ensure.ok || (await this.#a11StandardObservation(value, retest.standard)).standardState !== 'verified'
        || !observation.writeAuditPassed || !validKey(observation.reviewedBy) || observation.outcome.exitCode !== 0
        || observation.outcome.signal || observation.outcome.timedOut || observation.outcome.error || observation.failure
        || !implementationTransportMatches(observation, true) || observation.strictAudit?.status !== 'passed'
        || !hashValid(observation.strictAudit.digest))) {
        await this.#recordA11RetestFailure(value, retest, observation, ensure.ok, isCurrent);
        return invalid();
      }
      if (!ensure.ok) return ensure;
      if (!implementationTransportMatches(observation, !!retest) || !observation.writeAuditPassed || !validKey(observation.reviewedBy) || observation.outcome.exitCode !== 0
        || observation.outcome.signal || observation.outcome.timedOut || observation.outcome.error) return invalid();
      if (await gitRead(value.projectRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...child.workOrder.paths])) return invalid();
      if (observation.argv[1] === '--check') {
        const path = observation.argv[2]!.replaceAll('\\', '/').replace(/^\.\//, '');
        const repair = implementationPreparationRepair(this.#ledger, value);
        const original = repair && value.graph?.tasks.find(task => sameTask(task.task, repair.ownerTask)
          && task.workOrder?.digest === repair.workOrderDigest);
        const readable = original?.workOrder && repair?.workItemId === child.workItemId ? original.workOrder.paths : child.workOrder.paths;
        if (!safePath(path) || !readable.some(root => path === root || root.endsWith('/') && path.startsWith(root))
          || !await trackedFiles(value.projectRoot, candidateOid, [path])) return invalid();
      }
      if (!isCurrent()) return invalid();
      const { turnId, toolCallId, reviewedBy, argv, outcome, strictAudit } = observation;
      const bytes = Buffer.from(stableJson({ kind: 'implementation-self-test-observation', observation }), 'utf8');
      const sha256 = digest(bytes);
      const executionEvidence = { path: 'ans-evidence/' + sha256, sha256 };
      const receipt = { task: child.task, workOrderDigest: child.workOrder.digest, candidateOid, turnId, toolCallId, argv: [...argv],
        reviewedBy, exitCode: 0 as const, writeAuditPassed: true as const,
        executionDigest: observation.process ? sha256 : digest(stableJson(outcome)),
        ...(observation.process ? { executionEvidence } : {}),
        ...(retest && strictAudit?.status === 'passed' ? { retest: { key: retest.key, standardSha256: retest.standard.sha256, auditDigest: strictAudit.digest } } : {}) };
      return this.#submitCapability(ref, { key: 'implementation-self-test:' + child.taskId + ':' + digest(toolCallId),
        stepId: child.stepId, attempt: child.attempt, flowId: child.flowId,
        source: { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId }, input: { kind: 'implementation-self-test', receipt } },
      () => isCurrent() && (!retest || equal(a11DispositionProjection(this.#ledger, this.#find(ref) ?? value), retest)), false, true,
      observation.process ? { ref: executionEvidence, bytes } : undefined);
    } catch { return invalid(); }
  }

  async #recordA11RetestFailure(value: StoredInstance, prior: DurableA11Disposition, observation: ImplementationSelfTestObservation,
    clean: boolean, isCurrent: () => boolean): Promise<void> {
    if (!prior.retest || !isCurrent() || !validKey(observation.toolCallId)) return;
    const bytes = Buffer.from(stableJson({ kind: 'a11-retest-command-observation', key: prior.key, observation }), 'utf8');
    const sha256 = digest(bytes);
    const output = observation.output && !observation.output.stdoutTruncated && !observation.output.stderrTruncated
      ? observation.output.stdout + '\n' + observation.output.stderr : '';
    const matchedAssertion = /(?:^|\n)\s*not ok\s+\d+\b/.test(output)
      && /(?:^|\n)\s*(?:name:\s*['"]?AssertionError|code:\s*['"]?ERR_ASSERTION)\b/.test(output)
      || /(?:^|\n)\s*✖\s+/.test(output) && /(?:^|\n)\s*AssertionError\s+\[ERR_ASSERTION\]:/.test(output);
    const assertionFailure = clean && matchedAssertion && observation.argv[1] === '--test' && implementationTransportMatches(observation, true)
      && observation.strictAudit?.status === 'passed' && hashValid(observation.strictAudit.digest)
      && validKey(observation.reviewedBy) && observation.outcome.exitCode === 1 && !observation.failure
      && !observation.outcome.timedOut && !observation.outcome.signal && !observation.outcome.error;
    const blocker = blockerText(observation.failure ?? (observation.strictAudit?.status === 'failed' ? observation.strictAudit.reason : undefined)
      ?? (assertionFailure ? '实际测试断言失败，等待同一属主正式回交可复核依据。' : '当期命令缺少可核验的执行、签发或严格写审计事实。'));
    const evidence = { path: 'ans-evidence/' + sha256, sha256 };
    const disposition = { ...prior, generation: prior.generation + 1,
      retest: { ...prior.retest, blocker, failure: { toolCallId: observation.toolCallId, turnId: observation.turnId, evidence, assertionFailure } } };
    this.#ledger.transaction(() => {
      const current = this.#find(value.ref);
      if (!current || !this.#a11Current(value, prior, isCurrent) || !equal(a11DispositionProjection(this.#ledger, current), prior)
        || prior.retest?.failure?.toolCallId === observation.toolCallId) return;
      const key = 'a11-retest-observed:' + prior.key + ':' + disposition.generation;
      const event: DurableCapabilityEvent = { key, stepId: current.stepId, attempt: current.attempt, flowId: current.graph!.flowId!,
        source: { roleId: 'host', originId: value.ref.instanceId, parentTaskId: value.ref.instanceId },
        input: { kind: 'a11-retest-observed', disposition } };
      const admitted = admitCapability(this.#ledger, current, event, true, false, true);
      if (!admitted.ok) return;
      this.#ledger.saveEvidence(value.ref.instanceId, sha256, bytes);
      this.#ledger.saveFact(value.ref.instanceId, storedFact({ kind: 'capability-event', source: 'host', key,
        stepId: event.stepId, attempt: event.attempt, event }, admitted.value));
    });
  }

  async failA11Retest(ref: DurableInstanceRef, key: string, reason: string,
    isCurrent: () => boolean): Promise<DurableResult<DurableA11Disposition>> {
    const value = this.#find(ref);
    const disposition = value && a11DispositionProjection(this.#ledger, value);
    const blocker = blockerText(reason);
    if (!value || disposition?.key !== key || !disposition.retest || !blocker || !isCurrent()) return this.#a11Unresolved();
    if (disposition.state === 'parked' && disposition.resumeExhausted) return ok(disposition);
    if (disposition.state !== 'resumed') return this.#a11Unresolved();
    const effect = this.#ledger.effect(ref.instanceId, a11ResumeModelKey(key));
    if (effect?.state === 'claimed' || effect?.state === 'succeeded'
      && value.graph?.tasks.some(task => sameTask(task.task, disposition.childTask) && task.report)) return this.#a11Unresolved();
    return this.#saveA11Disposition(value, { ...disposition, state: 'parked', generation: disposition.generation + 1,
      ...(effect && effect.state !== 'not-started' ? { resumeExhausted: true as const } : {}),
      retest: { ...disposition.retest, blocker: disposition.retest.blocker ?? blocker } }, 'a11-retest-observed', isCurrent);
  }

  async #a11StandardObservation(value: StoredInstance, standard: DurableEvidenceRef): Promise<A11StandardObservation> {
    try {
      const bytes = await readProjectFile(value.projectRoot, standard.path, MaxEvidenceBytes);
      const observedStandardSha256 = digest(bytes);
      return { standardState: observedStandardSha256 === standard.sha256 ? 'verified' : 'drifted', observedStandardSha256 };
    } catch (error) {
      return { standardState: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable', observedStandardSha256: undefined };
    }
  }

  #a11Current(value: StoredInstance, disposition: DurableA11Disposition, isCurrent: () => boolean): boolean {
    const current = this.#find(value.ref);
    return this.#scopeCurrent(value, current, isCurrent) && current!.entry === disposition.entry
      && scopeGovernanceDigest(current!) === disposition.governanceDigest;
  }

  #a11Unresolved() {
    return fail('workflow-a11-disposition-unverified', '缺当前已回交实施工单、真实提交或符合原授权的 Git 状态。');
  }

  async parkA11Disposition(ref: DurableInstanceRef, input: { childTask: DurableTaskBinding; observation: DurableA11GitObservation;
    receiptCheck?: { reportKey: string; event: DurableCapabilityEvent; unavailable?: string } },
    isCurrent: () => boolean): Promise<DurableResult<DurableA11Disposition>> {
    const value = this.#find(ref);
    if (!value || !isCurrent() || !a11ObservationValid(input.observation) || activeAction(value) !== 'operations-implementation'
      || !blockedRoutingEnabled(value) || value.status !== 'waiting') return this.#a11Unresolved();
    const existing = a11DispositionProjection(this.#ledger, value);
    if (existing?.state === 'parked' && sameTask(existing.childTask, input.childTask))
      return this.observeA11Disposition(ref, existing.key, input.observation, isCurrent, input.receiptCheck);
    if (existing?.state === 'resumed' && sameTask(existing.childTask, input.childTask)) {
      if (!existing.retest || !input.receiptCheck) return this.#a11Unresolved();
      const { event, reportKey } = input.receiptCheck;
      if (event.input.kind !== 'task-closed' || event.input.outcome !== 'accepted' || event.input.tipOid !== existing.candidateOid
        || event.input.reportKey !== reportKey || !sameTask(event.input.task, existing.childTask)
        || !admitCapability(this.#ledger, value, event, true, false, false, true).ok) return this.#a11Unresolved();
      const material = await this.#a11StandardObservation(value, existing.standard);
      const actual = input.observation;
      const fresh = cleanRetestObservation(existing, actual);
      const child = implementationChildren(value).find(task => sameTask(task.task, existing.childTask));
      const verified = fresh && child && (await this.#a11CleanCandidate(value, child, existing.candidateOid).catch(() => undefined))?.ok;
      if (verified && material.standardState === 'verified') return this.#a11Unresolved();
      return this.#saveA11Disposition(value, { ...existing, ...material, state: 'parked', resumeExhausted: true,
        generation: existing.generation + 1, observation: actual, retest: { ...existing.retest, pendingReportReview: true,
          blocker: verified ? '已保存当期正式回交，等待原签发标准恢复。' : '已保存当期正式回交，等待同一候选和干净 Git 状态恢复。' } },
      'a11-retest-observed', isCurrent);
    }
    const children = implementationChildren(value).filter(task => !task.outcome);
    const child = children.length === 1 && sameTask(children[0]!.task, input.childTask) ? children[0] : undefined;
    const parent = value.graph?.tasks.find(task => task.taskId === child?.task.parentTaskId && task.capability === 'operations-implementation'
      && task.stepId === value.stepId && task.attempt === value.attempt && !task.workItemId && !task.outcome);
    const plan = currentVerificationPlan(this.#ledger, value);
    const item = implementationDispatchItems(this.#ledger, value).find(item => item.id === child?.workItemId && item.roleId === child.roleId);
    const actions = this.#ledger.effects(ref.instanceId).filter(effect => effect.intent.kind === 'task-commit'
      && sameTask(effect.intent.task, input.childTask) && effect.state !== 'not-started');
    const commit = actions[0];
    const expected = commit?.intent.expected;
    const result = commit?.result?.result;
    const candidateOid = result?.oid;
    const branch = value.baseline?.branch;
    const observation = input.observation;
    if (!child?.report || child.state !== 'reported' || !parent || !plan || !item || !child.workOrder || !child.baseOid || !branch
      || child.baseOid !== implementationHead(value) || !equal(child.workOrder, implementationWorkOrder(value, item, child.task, plan))
      || !equal(child.workOrder.paths, item.paths) || !sameTask(child.workOrder.task, child.task)
      || actions.length !== 1 || commit?.state !== 'succeeded' || expected?.head !== child.baseOid || expected.branch !== branch
      || typeof candidateOid !== 'string' || !oidValid(candidateOid)
      || typeof expected.diffDigest !== 'string' || !hashValid(expected.diffDigest) || result?.diffDigest !== expected.diffDigest
      || typeof expected.marker !== 'string' || !validKey(expected.marker) || !Array.isArray(expected.paths) || !expected.paths.length
      || !expected.paths.every(path => safePath(path) && item.paths.some(root => path === root || root.endsWith('/') && path.startsWith(root)))) return this.#a11Unresolved();
    const gitBlocked = observation.stagedPaths.length || observation.lock || observation.trackedDirty || !observation.indexDigest
      || observation.head !== candidateOid || observation.branch !== branch;
    const receiptCheck = input.receiptCheck;
    if (receiptCheck ? !cleanRetestObservation({ candidateOid, branch }, observation)
      : !gitBlocked) return this.#a11Unresolved();
    let missing: DurableA11Disposition['retest'];
    if (receiptCheck) {
      const { event, reportKey } = receiptCheck;
      if (event.input.kind !== 'task-closed' || event.input.outcome !== 'accepted' || event.input.tipOid !== candidateOid
        || reportKey !== child.report.key || event.input.reportKey !== reportKey || !sameTask(event.input.task, child.task)) return this.#a11Unresolved();
      const checked = admitCapability(this.#ledger, value, event, true, false, false, true);
      if (checked.ok || checked.code !== 'workflow-implementation-self-test-missing' || !checked.missingImplementationTests?.length)
        return this.#a11Unresolved();
      missing = { missingRequirements: checked.missingImplementationTests,
        ...(blockerText(receiptCheck.unavailable) ? { blocker: blockerText(receiptCheck.unavailable) } : {}) };
      const authority = await this.#verifyImplementationAuthority(value);
      if (!authority.ok) return authority;
    }
    try {
      const [head, currentBranch, commitText, files] = await Promise.all([
        gitRead(value.projectRoot, ['--no-optional-locks', 'rev-parse', '--verify', 'HEAD']).catch(() => undefined),
        gitRead(value.projectRoot, ['--no-optional-locks', 'symbolic-ref', '--short', 'HEAD']).catch(() => undefined),
        gitRead(value.projectRoot, ['--no-optional-locks', 'show', '-s', '--format=%P%n%B', candidateOid]),
        gitRead(value.projectRoot, ['--no-optional-locks', 'diff', '--name-only', '-z', child.baseOid, candidateOid]),
      ]);
      const [parents, ...body] = commitText.split(/\r?\n/);
      if (observation.head !== undefined && head !== observation.head
        || observation.branch !== undefined && currentBranch !== observation.branch
        || parents !== child.baseOid || !body.includes(expected.marker)
        || !equal(files.split('\0').filter(Boolean).sort(), [...expected.paths].sort())) return this.#a11Unresolved();
      if (missing) {
        const git = await this.#a11CleanCandidate(value, child, candidateOid);
        if (!git.ok) return git;
      }
      const recovery = missing ? undefined : a11RecoveryProof(this.#ledger, value, child, commit.intent.key, candidateOid);
      const governanceDigest = scopeGovernanceDigest(value);
      const key = digest(stableJson([ref, value.stepId, value.entry, value.attempt, child.task, parent.task,
        governanceDigest, child.workOrder.digest, commit.intent.key, candidateOid, recovery, ...(missing ? ['retest', plan.standard] : [])]));
      const disposition: DurableA11Disposition = { key, state: 'parked', entry: value.entry, generation: 1,
        childTask: child.task, parentTask: parent.task, candidateOid, branch, baseOid: child.baseOid, commitEffectKey: commit.intent.key,
        governanceDigest, workOrderDigest: child.workOrder.digest, standard: plan.standard,
        ...await this.#a11StandardObservation(value, plan.standard), observation: { ...observation, head, branch: currentBranch },
        childReport: child.report,
        ...(parent.report ? { parentReport: parent.report } : {}), ...(recovery ? { recovery } : {}), ...(missing ? { retest: missing } : {}) };
      return await this.#saveA11Disposition(value, disposition, 'a11-disposition-updated', isCurrent);
    } catch { return this.#a11Unresolved(); }
  }

  async observeA11Disposition(ref: DurableInstanceRef, key: string, observation: DurableA11GitObservation,
    isCurrent: () => boolean, availability?: A11Availability): Promise<DurableResult<DurableA11Disposition>> {
    const value = this.#find(ref);
    const disposition = value && a11DispositionProjection(this.#ledger, value);
    if (!value || disposition?.key !== key || disposition.state !== 'parked' || !isCurrent()
      || !a11ObservationValid(observation)) return this.#a11Unresolved();
    const material = await this.#a11StandardObservation(value, disposition.standard);
    const retest = disposition.retest && availability && !disposition.resumeExhausted
      ? { ...disposition.retest, blocker: blockerText(availability.unavailable) } : disposition.retest;
    if (material.standardState === disposition.standardState && material.observedStandardSha256 === disposition.observedStandardSha256
      && equal(disposition.observation, observation) && equal(retest, disposition.retest)) return ok(disposition);
    const parentReport = value.graph?.tasks.find(task => sameTask(task.task, disposition.parentTask))?.report;
    return this.#saveA11Disposition(value, { ...disposition, ...material, generation: disposition.generation + 1, observation,
      confirmation: undefined, ...(parentReport ? { parentReport } : {}), ...(retest ? { retest } : {}) }, 'a11-disposition-updated', isCurrent);
  }

  async requestA11DispositionStop(ref: DurableInstanceRef, key: string,
    isCurrent: () => boolean): Promise<DurableResult<DurableA11Disposition>> {
    const value = this.#find(ref);
    const disposition = value && a11DispositionProjection(this.#ledger, value);
    if (!value || disposition?.key !== key || disposition.state !== 'parked' || !isCurrent()) return this.#a11Unresolved();
    const scope = blockedRoutingProjection(this.#ledger, value);
    if (scope?.decision?.option !== 'wait' && !disposition.confirmation) return this.#a11Unresolved();
    const material = await this.#a11StandardObservation(value, disposition.standard);
    if (disposition.confirmation && !scope?.decision && material.standardState === disposition.standardState
      && material.observedStandardSha256 === disposition.observedStandardSha256) return ok(disposition);
    return this.#saveA11Disposition(value, { ...disposition, ...material, generation: disposition.generation + 1,
      confirmation: 'stop' }, 'a11-disposition-updated', isCurrent);
  }

  async resumeA11Disposition(ref: DurableInstanceRef, key: string, observation: DurableA11GitObservation,
    isCurrent: () => boolean, availability?: A11Availability): Promise<DurableResult<DurableA11Disposition>> {
    const value = this.#find(ref);
    const disposition = value && a11DispositionProjection(this.#ledger, value);
    if (!value || disposition?.key !== key || !isCurrent() || !a11ObservationValid(observation)) return this.#a11Unresolved();
    if (disposition.state === 'resumed') return ok(disposition);
    const scope = blockedRoutingProjection(this.#ledger, value);
    const effect = this.#ledger.effect(ref.instanceId, a11RecoveryEffectKey(key));
    const proof = effect?.result?.result;
    const matchingNative = effect?.state === 'succeeded' && proof?.indexDigest === observation.indexDigest
      && proof?.worktreeDigest === observation.worktreeDigest;
    const unsettledNative = effect?.state === 'unknown' && effect.intent.expected?.afterIndex === observation.indexDigest
      && effect.intent.expected?.worktreeDigest === observation.worktreeDigest;
    if (disposition.resumeExhausted && !disposition.retest?.pendingReportReview || scope?.decision?.option === 'stop' || disposition.confirmation && !scope?.decision
      || disposition.retest && (!availability || availability.unavailable || !observation.worktreeDigest
        || !observation.untrackedPaths || observation.untrackedPaths.length)
      || observation.branch !== disposition.branch
      || observation.head !== disposition.candidateOid || !observation.indexDigest || observation.lock
      || observation.stagedPaths.length || observation.trackedDirty || effect?.state === 'claimed' || unsettledNative
      || effect && !matchingNative && scope?.decision?.option !== 'wait') return this.#a11Unresolved();
    try {
      const child = implementationChildren(value).find(task => sameTask(task.task, disposition.childTask));
      const plan = currentVerificationPlan(this.#ledger, value);
      const item = implementationDispatchItems(this.#ledger, value).find(item => item.id === child?.workItemId && item.roleId === child.roleId);
      if (!child?.workOrder || !plan || !item || child.workOrder.digest !== disposition.workOrderDigest
        || !equal(child.workOrder, implementationWorkOrder(value, item, child.task, plan)) || !equal(plan.standard, disposition.standard)
        || (await this.#a11StandardObservation(value, disposition.standard)).standardState !== 'verified') return this.#a11Unresolved();
      const authority = await this.#verifyImplementationAuthority(value);
      if (!authority.ok) return authority;
      const git = disposition.retest ? await this.#a11CleanCandidate(value, child, disposition.candidateOid)
        : await this.#verifyImplementationGit(value, disposition.candidateOid, disposition.baseOid, child.modulePaths);
      if (!git.ok) return git;
      const parentReport = value.graph?.tasks.find(task => sameTask(task.task, disposition.parentTask))?.report;
      return this.#saveA11Disposition(value, { ...disposition, state: 'resumed', generation: disposition.generation + 1, observation,
        ...(disposition.retest ? { retest: { ...disposition.retest, blocker: undefined, pendingReportReview: undefined,
          ...(disposition.retest.pendingReportReview ? { reportReviewGeneration: disposition.generation + 1 } : {}) } }
          : { recoveryMode: matchingNative ? 'native' : 'manual' }), standardState: 'verified', observedStandardSha256: disposition.standard.sha256,
        confirmation: undefined,
        ...(parentReport ? { parentReport } : {}) }, 'a11-disposition-resumed', isCurrent);
    } catch { return this.#a11Unresolved(); }
  }

  async #a11CleanCandidate(value: StoredInstance, child: { baseOid?: string; modulePaths?: readonly string[] }, candidateOid: string): Promise<DurableResult<true>> {
    const git = await this.#verifyImplementationGit(value, candidateOid, child.baseOid, child.modulePaths);
    if (!git.ok) return git;
    const read = (...args: string[]) => gitRead(value.projectRoot, ['--no-optional-locks', ...args]);
    if (await read('ls-files', '--others', '--exclude-standard', '-z') || await read('show', '-s', '--format=%P', candidateOid) !== child.baseOid)
      return fail('workflow-a11-candidate-drift', '当前候选父链或未追踪项目文件已变化。');
    const index = await read('rev-parse', '--path-format=absolute', '--git-path', 'index');
    const unlocked = await lstat(index + '.lock').then(() => false, (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
    return unlocked ? ok(true) : fail('workflow-a11-candidate-drift', '完整索引当前不可核验。');
  }

  async #saveA11Disposition(value: StoredInstance, disposition: DurableA11Disposition,
    kind: 'a11-disposition-updated' | 'a11-disposition-resumed' | 'a11-retest-observed', isCurrent: () => boolean): Promise<DurableResult<DurableA11Disposition>> {
    const row = await this.#submitScope(value, kind + ':' + disposition.key + ':' + disposition.generation, { kind, disposition },
      () => this.#a11Current(value, disposition, isCurrent));
    return row.ok ? ok(disposition) : row;
  }

  #scopeCurrent(value: StoredInstance, current: StoredInstance | undefined, isCurrent: () => boolean): boolean {
    return !!current && current.status === 'waiting' && current.engine === 'healthy' && this.#owns(current) && blockedRoutingEnabled(current) && isCurrent()
      && current.stepId === value.stepId && current.entry === value.entry && current.attempt === value.attempt
      && scopeGovernanceDigest(current) === scopeGovernanceDigest(value) && implementationHead(current) === implementationHead(value);
  }

  acceptanceDispatchPermit(ref: DurableInstanceRef, task: DurableTaskBinding): DurableResult<DurableAcceptanceDispatchPermit> {
    const value = this.#find(ref);
    return value && this.#owns(value) ? acceptancePreparationPermit(this.#ledger, value, task)
      : fail('acceptance-preparation-dispatch-held', '当前验收实例或项目归属已变化。');
  }

  evidenceAuditAccess(ref: DurableInstanceRef, task: DurableTaskBinding): 'audit' | 'collect' | undefined {
    const value = this.#find(ref);
    if (!value || value.status !== 'waiting' || !this.#owns(value)) return;
    const assigned = value.graph?.tasks.find(row => sameTask(row.task, task) && row.stepId === value.stepId && row.attempt === value.attempt);
    return assigned?.evidenceWorkOrder ? 'collect' : assigned?.capability === 'independent-assessment' ? 'audit' : undefined;
  }

  async decideB2EvidenceScope(ref: DurableInstanceRef, input: DurableDecisionBinding &
    { action: 'approve' | 'decline'; provenance: DurableB2EvidenceDecision['provenance'] },
  isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const current = value && b2EvidenceDecisionProjection(this.#ledger, value);
    const invalid = () => fail('b2-acceptance-evidence-approval-mismatch', 'B2 额外证据授权的身份、范围或当前批准已变化。');
    if (!value || !current || !value.graph?.flowId || !isCurrent() || input.provenance?.source !== 'customer' || !['approve', 'decline'].includes(input.action)
      || current.binding.requestId !== input.requestId || current.binding.digest !== input.digest || current.binding.generation !== input.generation
      || !decisionProvenanceMatches(input.provenance.source, input.provenance, current.binding)) return invalid();
    const key = 'b2-evidence-scope-decided:' + input.requestId;
    if (current.decision) {
      const recorded = this.#ledger.fact(ref.instanceId, key);
      return current.decision === input.action && equal(current.provenance, input.provenance) && recorded ? ok(recorded.receipt) : invalid();
    }
    if (input.action === 'approve') {
      const analysis = value.analysisReport;
      if (!analysis || !value.baseline) return invalid();
      const address = { stepId: value.stepId, attempt: value.attempt, flowId: value.graph.flowId };
      const owners = await deriveDurablePathBWriteSets({ projectRoot: value.projectRoot, flowId: value.graph.flowId, scopeFiles: analysis.modulePaths });
      if (!owners.ok || current.scopeId !== 'b2-evidence-scope:' + digest(stableJson([ref, address, analysis.key, value.baseline, owners.writesets]))
        || !equal(current.requirements, evidenceRequirementsFromB1(this.#ledger, value))
        || !equal(current.writePaths, await deriveDurableEvidenceWriter(value.projectRoot, value.graph.flowId, current.roleId))) return invalid();
    }
    return this.#submitAuditEvent(value, key, { kind: 'b2-evidence-scope-decided', request: { ...current, decision: input.action, provenance: input.provenance } }, isCurrent);
  }

  evidenceAuditDispatchPermit(ref: DurableInstanceRef, task: DurableTaskBinding): DurableResult<{ generation?: number }> {
    const value = this.#find(ref);
    return value && this.#owns(value) ? evidenceAuditDeliveryPermit(this.#ledger, value, task)
      : fail('evidence-audit-dispatch-held', '当前实例归属缺失。');
  }

  #submitAuditEvent(value: StoredInstance, key: string, input: DurableCapabilityEvent['input'], isCurrent: () => boolean,
    parent?: { task: DurableTaskBinding; originId: string }, evidence?: Evidence) {
    return this.#submitCapability(value.ref, { key, input, stepId: value.stepId, attempt: value.attempt, flowId: value.graph!.flowId!,
      source: parent ? { roleId: parent.task.roleId, originId: parent.originId, parentTaskId: parent.task.taskId }
        : { roleId: 'host', originId: value.ref.instanceId, parentTaskId: value.ref.instanceId } },
    () => {
      const current = this.#find(value.ref);
      return !!current && current.status === 'waiting' && current.engine === 'healthy' && this.#owns(current)
        && current.stepId === value.stepId && current.entry === value.entry && current.attempt === value.attempt && isCurrent();
    }, false, true, evidence);
  }

  async dispatchEvidenceCollection(ref: DurableInstanceRef, input: DurableDispatchEvidenceCollectionInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const audit = value && evidenceAuditProjection(this.#ledger, value);
    const graph = value?.graph;
    const b3 = value && activeAction(value) === 'b3-implement-and-accept';
    const b2Authority = b3 && value.scope?.evidenceAuthorization;
    const forbidden = () => fail('evidence-collection-dispatch-invalid', '缺当前运营、正式生产候选或独立取证写域批准。');
    if (!value || !audit || !graph?.flowId || !isCurrent() || !b3 && activeAction(value) !== 'operations-implementation'
      || input.roleId !== audit.collectorRoleId || (b3 ? !b2Authority || b2Authority.decision !== 'approve' || b2Authority.roleId !== input.roleId
        : !graph.expectedRoles?.includes(input.roleId) || !graph.activatedRoles?.includes(input.roleId))
      || !validKey(input.requestId)) return forbidden();
    const taskId = graphTaskId(ref, input.roleId, value.stepId + ':evidence:' + input.requestId, value.attempt);
    const key = 'evidence-collection:' + taskId;
    const previous = this.#ledger.fact(ref.instanceId, key);
    const saved = previous?.fact.kind === 'capability-event' ? previous.fact.event : undefined;
    if (saved?.input.kind === 'evidence-collection-dispatched' && previous?.receipt.state !== 'ignored'
      && saved.source.roleId === input.parentTask.roleId && saved.source.originId === input.originId
      && sameTask(saved.input.workOrder.parentTask, input.parentTask) && sameAuditBasis(saved.input.workOrder.basis, audit.basis)) return ok(previous!.receipt);
    const writePath = 'docs/verification/' + graph.flowId + '/' + taskId + '/';
    const approved = b2Authority ? b2Authority.writePaths : graph.writeSets?.find(set => set.roleId === input.roleId)?.paths ?? [];
    if (!approved.some(path => path === writePath || path.startsWith('docs/verification/') && path.endsWith('/') && writePath.startsWith(path))) return forbidden();
    try {
      if (b3) {
        if (!equal(approved, await deriveDurableEvidenceWriter(value.projectRoot, graph.flowId, input.roleId))) return forbidden();
      } else {
        const authority = await this.#verifyImplementationAuthority(value);
        if (!authority.ok) return authority;
      }
      if (!await this.#auditMaterialCurrent(value, audit.basis)) return forbidden();
      const task: DurableTaskBinding = { stage: b3 ? 'B3' : 'A11', stageAttempt: value.attempt, executionAttempt: 1,
        taskId, roleId: input.roleId, parentTaskId: input.parentTask.taskId };
      const sourceReceipts = this.#ledger.facts(ref.instanceId).flatMap(row => {
        const entry = row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
        return entry?.kind === 'implementation-self-test' && entry.receipt.executionEvidence
          && entry.receipt.candidateOid === audit.basis.candidateOid
          && audit.requirements.some(req => req.source === 'task-command' && equal(req.command, entry.receipt.argv))
          ? [{ receiptId: row.fact.key, taskId: entry.receipt.task.taskId, argv: entry.receipt.argv }] : [];
      });
      const workOrder = { basis: audit.basis, task, parentTask: input.parentTask, writePaths: [writePath],
        requirementIds: [...new Set(audit.requirements.map(requirement => requirement.id))], sourceReceipts,
        ...(audit.route ? { approvedArtifacts: audit.route.artifacts } : {}) };
      return this.#submitAuditEvent(value, key, { kind: 'evidence-collection-dispatched', workOrder },
        isCurrent, { task: input.parentTask, originId: input.originId });
    } catch { return forbidden(); }
  }

  async #auditMaterialCurrent(value: StoredInstance, basis: DurableEvidenceAuditProjection['basis']): Promise<boolean> {
    if (scopeGovernanceDigest(value) !== basis.approvalDigest) return false;
    await this.#capture(value, basis.standard);
    if (value.scope?.evidenceRequirements?.length) {
      const approval = value.scope.evidenceAuthorization;
      if (!approval || approval.decision !== 'approve' || !value.graph?.flowId
        || !equal(approval.writePaths, await deriveDurableEvidenceWriter(value.projectRoot, value.graph.flowId, approval.roleId))) return false;
    }
    return (await this.#verifyImplementationGit(value, basis.candidateOid)).ok;
  }

  async #verifyCurrentAudit(value: StoredInstance, audit: DurableEvidenceAuditProjection): Promise<DurableResult<true>> {
    try {
      if (!await this.#auditMaterialCurrent(value, audit.basis) || audit.missing.length
        || (audit.state !== 'ready' && audit.state !== 'audited')) throw new Error('audit not ready');
      for (const record of audit.records) await this.#verifyAuditRecord(value, audit.basis, record);
      return ok(true);
    } catch { return fail('evidence-audit-lineage-drift', '当前候选、签发标准或已登记的实际原件无法复核。'); }
  }

  async #verifyAuditRecord(value: StoredInstance, basis: DurableEvidenceAuditProjection['basis'], record: DurableEvidenceAuditRecord): Promise<void> {
    if (record.source === 'candidate-file') {
      if (!record.artifact || digest(await readCandidateBlob(value.projectRoot, basis.candidateOid, record.artifact.path, MaxEvidenceBytes))
        !== record.artifact.sha256) throw new Error('candidate artifact drift');
      await this.#capture(value, record.artifact);
      return;
    }
    if (record.source === 'candidate-commit') {
      if (record.sourceId !== basis.candidateOid) throw new Error('candidate commit drift');
      return;
    }
    const row = this.#ledger.fact(value.ref.instanceId, record.sourceId);
    const source = row?.receipt.state !== 'ignored' && row?.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
    const ref = source?.kind === 'evidence-execution-recorded' && sameAuditBasis(source.basis, basis) && sameTask(record.sourceTask, source.task)
      ? source.receipt : source?.kind === 'implementation-self-test' && source.receipt.candidateOid === basis.candidateOid
      && sameTask(record.sourceTask, source.receipt.task) ? source.receipt.executionEvidence : undefined;
    if (!ref) throw new Error('execution receipt missing');
    await this.#capture(value, ref);
  }

  async verifyEvidenceAudit(ref: DurableInstanceRef, task: DurableTaskBinding, generation?: number): Promise<DurableResult<true>> {
    const value = this.#find(ref);
    const permit = this.evidenceAuditDispatchPermit(ref, task);
    if (!value || !permit.ok) return !permit.ok ? permit : fail('workflow-not-found', '当前审计实例不可用。');
    if (permit.value.generation === undefined) return ok(true);
    const audit = evidenceAuditProjection(this.#ledger, value);
    if (!audit || permit.value.generation !== generation) return fail('evidence-audit-generation-stale', '审计送达缺当前证据代次。');
    const checked = await this.#verifyCurrentAudit(value, audit);
    if (!checked.ok) return checked;
    const live = this.evidenceAuditDispatchPermit(ref, task);
    return live.ok && live.value.generation === generation ? ok(true)
      : fail('evidence-audit-generation-stale', '核对期间审计证据已变化。');
  }

  async verifyEvidenceAuditRelease(ref: DurableInstanceRef): Promise<DurableResult<true>> {
    const value = this.#find(ref);
    if (!value || !this.#owns(value) || value.status !== 'waiting') return fail('workflow-not-found', '当前发布实例不可用。');
    if (!evidenceAuditConfiguration(value) && !value.scope?.evidenceRequirements?.length) return ok(true);
    const audit = evidenceAuditProjection(this.#ledger, value);
    return audit?.state === 'audited' ? this.#verifyCurrentAudit(value, audit)
      : fail('evidence-audit-publish-held', '当前发布缺已审计的证据链。');
  }

  async recordEvidenceExecution(ref: DurableInstanceRef, input: { task: DurableTaskBinding; observation: ImplementationSelfTestObservation },
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref), observation = input.observation;
    const audit = value && evidenceAuditProjection(this.#ledger, value);
    const invalid = () => fail('evidence-execution-unverified', '缺当前受控命令、实际批准、进程结算或写入核验。');
    if (!value || !audit || !sameTask(audit.collector, input.task) || !isCurrent() || observation.roleId !== input.task.roleId
      || relative(value.projectRoot, observation.cwd) || !validKey(observation.reviewedBy) || !validKey(observation.toolCallId)
      || !implementationTestCommand(observation.argv) || !audit.requirements.some(req => req.source === 'task-command' && equal(req.command, observation.argv))
      || !implementationTransportMatches(observation, true) || observation.strictAudit?.status !== 'passed' || !observation.writeAuditPassed
      || !Number.isSafeInteger(observation.outcome.exitCode) || observation.outcome.signal || observation.outcome.error || observation.outcome.timedOut) return invalid();
    try {
      if (!await this.#auditMaterialCurrent(value, audit.basis)) return invalid();
      const bytes = Buffer.from(stableJson(observation), 'utf8');
      const sha256 = digest(bytes);
      const receipt = { path: 'ans-evidence/' + sha256, sha256 };
      const key = 'evidence-execution:' + input.task.taskId + ':' + digest(observation.toolCallId);
      const previous = this.#ledger.fact(ref.instanceId, key);
      const recorded = previous?.fact.kind === 'capability-event' ? previous.fact.event.input : undefined;
      if (previous) return recorded?.kind === 'evidence-execution-recorded' && equal(recorded.receipt, receipt)
        ? ok(previous.receipt) : invalid();
      return this.#submitAuditEvent(value, key,
        { kind: 'evidence-execution-recorded', task: input.task, basis: audit.basis, receipt, turnId: observation.turnId,
          toolCallId: observation.toolCallId, argv: observation.argv, observedAt: new Date().toISOString(), exitCode: observation.outcome.exitCode! },
        isCurrent, undefined, { ref: receipt, bytes });
    } catch { return invalid(); }
  }

  async #recordAuditArtifact(value: StoredInstance, audit: DurableEvidenceAuditProjection, input: DurableEvidenceCollectionArtifact,
    at: string): Promise<DurableEvidenceAuditRecord | undefined> {
    const relevant = audit.requirements.filter(requirement => requirement.id === input.requirementId && requirement.source === input.source);
    if (!relevant.length || input.source === 'external-session') return;
    if (input.source === 'candidate-file' && relevant.some(req => req.paths?.includes(input.path)) && safePath(input.path)) {
      const bytes = await readCandidateBlob(value.projectRoot, audit.basis.candidateOid, input.path, MaxEvidenceBytes);
      const artifact = { path: input.path, sha256: digest(bytes) };
      await this.#capture(value, artifact);
      const sourceId = audit.basis.candidateOid + ':' + input.path;
      return { id: digest(stableJson([audit.basis, input.requirementId, sourceId, artifact])), requirementId: input.requirementId,
        source: 'candidate-file', sourceId, artifact, observedAt: at, outcome: 'recorded' };
    }
    if (input.source !== 'task-command' || !input.receiptId || !validKey(input.receiptId) || input.path !== ''
      || !relevant.some(req => req.capability === 'module-shell')) return;
    const row = this.#ledger.fact(value.ref.instanceId, input.receiptId);
    const receipt = row?.receipt.state !== 'ignored' && row?.fact.kind === 'capability-event' ? row.fact.event.input : undefined;
    let sourceTask: DurableTaskBinding, observedAt: string, outcome: DurableEvidenceAuditRecord['outcome'], argv: readonly string[];
    if (receipt?.kind === 'evidence-execution-recorded' && sameAuditBasis(receipt.basis, audit.basis)
      && receipt.basis.generation === audit.basis.generation && sameTask(audit.collector, receipt.task)) {
      await this.#capture(value, receipt.receipt);
      ({ task: sourceTask, observedAt, argv } = receipt);
      outcome = receipt.exitCode === 0 ? 'executed' : 'failed';
    } else if (receipt?.kind === 'implementation-self-test' && receipt.receipt.candidateOid === audit.basis.candidateOid
      && receipt.receipt.executionEvidence) {
      const original = value.graph?.tasks.find(task => sameTask(task.task, receipt.receipt.task) && task.outcome === 'accepted'
        && task.workOrder?.digest === receipt.receipt.workOrderDigest && equal(task.workOrder.standard, audit.basis.standard));
      const report = original?.report && runtimeReportFromEvidence(this.#ledger, value, original.report.evidence);
      if (!original || !report || typeof report.at !== 'string') return;
      await this.#capture(value, receipt.receipt.executionEvidence);
      sourceTask = original.task;
      observedAt = report.at;
      argv = receipt.receipt.argv;
      outcome = 'executed';
    } else return;
    if (!relevant.some(requirement => requirement.capability === 'module-shell' && equal(requirement.command, argv))) return;
    return { id: digest(stableJson([audit.basis, input.requirementId, input.receiptId])), requirementId: input.requirementId,
      source: 'task-command', sourceId: input.receiptId, sourceTask, observedAt, outcome };
  }

  async recordEvidenceCollection(ref: DurableInstanceRef, input: DurableRecordEvidenceCollectionInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const audit = value && evidenceAuditProjection(this.#ledger, value);
    const pending = value?.graph?.tasks.find(task => sameTask(task.task, input.task));
    const invalid = () => fail('evidence-collection-source-invalid', '证据登记缺当前取证工单和实际正式回交。');
    if (!value || !audit || !pending?.evidenceWorkOrder || !pending.report || !sameTask(audit.collector, input.task)
      || !isCurrent() || input.generation !== pending.evidenceWorkOrder.basis.generation || input.reportKey && input.reportKey !== pending.report.key
      || !Array.isArray(input.artifacts) || input.artifacts.length > 96) return invalid();
    const key = 'evidence-collection-recorded:' + pending.taskId + ':' + pending.report.key;
    const existing = this.#ledger.fact(ref.instanceId, key);
    if (existing) return ok(existing.receipt);
    const report = runtimeReportFromEvidence(this.#ledger, value, pending.report.evidence);
    const model = this.#ledger.effect(ref.instanceId, 'model:' + pending.taskId);
    if (report?.origin !== 'submitted-report' || typeof report.at !== 'string' || model?.state !== 'succeeded'
      || model.result?.result?.turnId !== report.source.turnId || input.generation !== audit.basis.generation) return invalid();
    const reported = new Set((report.evidence ?? []).flatMap(evidence => {
      try { return [stableJson(JSON.parse(evidence.text))]; } catch { return []; }
    }));
    if (input.artifacts.some(artifact => !reported.has(stableJson(artifact)))) return invalid();
    try {
      if (!await this.#auditMaterialCurrent(value, audit.basis)) return invalid();
      const rows = await Promise.all(input.artifacts.map(artifact => this.#recordAuditArtifact(value, audit, artifact, report.at).catch(() => undefined)));
      const commits = audit.requirements.filter(requirement => requirement.source === 'candidate-commit').map(requirement => ({
        id: digest(stableJson([audit.basis, requirement.id, 'candidate-commit'])), requirementId: requirement.id,
        source: 'candidate-commit' as const, sourceId: audit.basis.candidateOid, observedAt: report.at, outcome: 'recorded' as const,
      }));
      const records = [...new Map([...rows.flatMap(row => row ? [[row.id, row] as const] : []), ...commits.map(row => [row.id, row] as const)]).values()];
      if (pending.evidenceWorkOrder.approvedArtifacts) {
        const prior = this.#ledger.facts(ref.instanceId).findLast(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event'
          && row.fact.event.input.kind === 'evidence-collection-recorded' && sameAuditBasis(row.fact.event.input.basis, audit.basis)
          && row.fact.event.input.basis.generation < audit.basis.generation);
        const previous = prior?.fact.kind === 'capability-event' ? prior.fact.event.input : undefined;
        if (previous?.kind === 'evidence-collection-recorded') {
          for (const record of previous.records) {
            if (records.some(current => current.requirementId === record.requirementId && current.source === record.source
              && current.artifact?.path === record.artifact?.path)) continue;
            try { await this.#verifyAuditRecord(value, audit.basis, record); records.push(record); } catch { /* Keep the named missing requirement. */ }
          }
        }
      }
      const missing = missingAuditEvidence(audit.requirements, records);
      return this.#submitAuditEvent(value, key, { kind: 'evidence-collection-recorded', task: input.task, reportKey: pending.report.key,
        basis: { ...audit.basis, generation: audit.basis.generation + 1 }, records, missing }, isCurrent);
    } catch { return invalid(); }
  }

  async closeEvidenceCollection(ref: DurableInstanceRef, input: DurableCloseEvidenceCollectionInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const audit = value && evidenceAuditProjection(this.#ledger, value);
    const invalid = () => fail('evidence-collection-close-invalid', '收口需要当前候选和实际运营回合。');
    if (!value || !audit || !isCurrent() || !sameTask(audit.collector, input.task)) return invalid();
    try {
      if (!await this.#auditMaterialCurrent(value, audit.basis)) return invalid();
      if (input.outcome === 'accepted') {
        if (audit.missing.length) return invalid();
        for (const record of audit.records) await this.#verifyAuditRecord(value, audit.basis, record);
      }
      return this.#submitAuditEvent(value, 'evidence-collection-closed:' + input.task.taskId + ':' + input.reportKey,
        { kind: 'evidence-collection-closed', task: input.task, parentTask: input.parentTask, reportKey: input.reportKey,
          outcome: input.outcome, basis: audit.basis }, isCurrent, { task: input.parentTask, originId: input.originId });
    } catch { return invalid(); }
  }

  async recordEvidenceBlocker(ref: DurableInstanceRef, input: DurableEvidenceBlockerInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const audit = value && evidenceAuditProjection(this.#ledger, value);
    const original = value && isCurrent() && this.#ledger.facts(ref.instanceId).findLast(row => row.receipt.state !== 'ignored'
      && row.fact.kind === 'capability-event' && row.fact.event.input.kind === 'evidence-audit-blocked'
      && row.fact.event.input.scope.origin.entry === value.entry && row.fact.event.source.originId === input.originId
      && sameTask(row.fact.event.input.scope.origin.task, input.parentTask));
    if (original) return ok(original.receipt);
    if (!value || !audit || audit.route || !isCurrent() || audit.basis.generation !== input.generation || !audit.missing.length)
      return fail('evidence-audit-blocker-stale', '缺当前运营任务或已核实的取证缺项。');
    const reason = audit.missing.map(item => item.requirementId + ' ' + item.reason).join(' ').slice(0, 700);
    const actions = await this.#evidenceBlockerActions(value, audit);
    const scope = newEvidenceAuditScope(value, input.parentTask, audit.basis, reason, actions);
    return this.#submitAuditEvent(value, 'evidence-audit-blocked:' + scope.evidenceAuditKey,
      { kind: 'evidence-audit-blocked', basis: audit.basis, task: audit.collector ?? input.parentTask, missing: audit.missing, scope },
      isCurrent, { task: input.parentTask, originId: input.originId });
  }

  async #evidenceBlockerActions(value: StoredInstance, audit: DurableEvidenceAuditProjection): Promise<Pick<DurableBlockedRoutingProjection, 'evidenceRoute' | 'evidenceCompromise'>> {
    const collector = value.graph?.tasks.find(task => audit.collector && sameTask(task.task, audit.collector));
    if (!audit.collectorRoleId || !collector?.report || audit.legacy) return {};
    const missing = new Set(audit.missing.map(item => item.requirementId));
    const artifacts: DurableEvidenceCollectionArtifact[] = [];
    const verified: DurableEvidenceAuditRecord[] = [];
    const currentFacts = this.#ledger.facts(value.ref.instanceId).flatMap(row => row.receipt.state !== 'ignored' && row.fact.kind === 'capability-event' ? [{ key: row.fact.key, event: row.fact.event.input }] : []);
    try {
      if (!await this.#auditMaterialCurrent(value, audit.basis)) return {};
      const recorded = runtimeReportFromEvidence(this.#ledger, value, collector.report.evidence);
      if (!recorded || typeof recorded.at !== 'string') return {};
      for (const requirement of audit.requirements.filter(item => missing.has(item.id))) {
        const proposed: DurableEvidenceCollectionArtifact[] = requirement.source === 'candidate-file' ? (requirement.paths ?? []).map(path => ({
          requirementId: requirement.id, path, source: 'candidate-file',
        })) : requirement.source === 'task-command' ? currentFacts.flatMap(({ key, event }) => event.kind === 'implementation-self-test'
          && equal(requirement.command, event.receipt.argv) ? [{ requirementId: requirement.id, path: '', source: 'task-command' as const, receiptId: key }] : []) : [];
        for (const artifact of proposed) {
          const record = await this.#recordAuditArtifact(value, audit, artifact, recorded.at).catch(() => undefined);
          if (record && record.outcome !== 'failed') { artifacts.push(artifact); verified.push(record); }
        }
      }
      const unique = [...new Map(artifacts.map(artifact => [stableJson(artifact), artifact])).values()];
      const unresolved = missingAuditEvidence(audit.requirements, [...audit.records, ...verified]);
      if (unique.length && !unresolved.length && !currentFacts.some(({ event }) => event.kind === 'evidence-audit-blocked'
        && sameAuditBasis(event.basis, audit.basis) && equal(event.scope.evidenceRoute?.artifacts, unique)
        && currentFacts.some(row => row.event.kind === 'blocked-scope-resumed' && row.event.evidenceAction === 'route'
          && row.event.requestId === event.scope.binding.requestId))) {
        return { evidenceRoute: { roleId: audit.collectorRoleId, artifacts: unique, fromGeneration: audit.basis.generation } };
      }
      const standardOwner = value.graph?.flowId
        ? documentRevisionOwner(audit.basis.standard.path, value.graph.flowId, value.graph.expectedRoles ?? []) : undefined;
      const standard = value.graph?.tasks.find(task => task.outcome === 'accepted' && task.task.stage === 'A12a' && task.roleId === 'verifier'
        && task.documents?.some(document => equal(document, audit.basis.standard)));
      if (!unresolved.length || standardOwner?.kind !== 'criteria' || !standard || !documentRevisionEnabled(value)) return {};
      const compromisePaths = new Set<string>();
      for (const missing of unresolved) {
        const proposed = audit.requirements.filter(requirement => requirement.id === missing.requirementId).flatMap(requirement => requirement.paths ?? []);
        if (!proposed.length) return {};
        for (const path of new Set(proposed)) {
          const bytes = await readCandidateBlob(value.projectRoot, audit.basis.candidateOid, path, MaxEvidenceBytes);
          await this.#capture(value, { path, sha256: digest(bytes) });
          compromisePaths.add(path);
        }
      }
      return { evidenceCompromise: { requirementIds: unresolved.map(item => item.requirementId), paths: [...compromisePaths] } };
    } catch { return {}; }
  }

  async prepareEvidenceAudit(ref: DurableInstanceRef,
    options?: { verifiedLegacyFailure: true }): Promise<DurableResult<DurableEvidenceAuditProjection | undefined>> {
    const value = this.#find(ref);
    if (!value) return fail('workflow-not-found', '证据核验缺当前实例。');
    const current = evidenceAuditProjection(this.#ledger, value);
    const action = activeAction(value);
    if (current?.state === 'blocked' && !current.legacy) {
      const scope = blockedRoutingProjection(this.#ledger, value);
      if (!scope?.evidenceAuditKey || scope.decision && scope.decision.option !== 'wait') return ok(current);
      const actions = await this.#evidenceBlockerActions(value, current);
      if (equal(actions.evidenceRoute, scope.evidenceRoute) && equal(actions.evidenceCompromise, scope.evidenceCompromise)) return ok(current);
      const basis = { ...current.basis, generation: current.basis.generation + 1 };
      if (actions.evidenceRoute) actions.evidenceRoute = { ...actions.evidenceRoute, fromGeneration: basis.generation };
      const update = newEvidenceAuditScope(value, scope.origin.task, basis, scope.reason, actions);
      const stored = await this.#submitAuditEvent(value, 'evidence-audit-blocked:' + update.evidenceAuditKey,
        { kind: 'evidence-audit-blocked', basis, task: scope.origin.task, scope: update, missing: current.missing, observation: true },
        () => { const live = this.#find(ref); return !!live && blockedRoutingProjection(this.#ledger, live)?.binding.digest === scope.binding.digest; });
      const live = this.#find(ref);
      return stored.ok && live ? ok(evidenceAuditProjection(this.#ledger, live)) : stored.ok ? ok(current) : stored;
    }
    if (current || evidenceAuditConfiguration(value) || value.status !== 'waiting') return ok(current);
    if (action === 'operations-environment-recovery' || action === 'open-environment-recovery') {
      const recovery = recoveryProjection(this.#ledger, value);
      if (!recovery?.basis || !recovery.missing) return ok(undefined);
      const settled = this.#ledger.facts(ref.instanceId).some(row => row.receipt.state !== 'ignored' && row.fact.stepId === value.stepId
        && row.fact.attempt === value.attempt && row.fact.kind === 'capability-event' && row.fact.event.input.kind === 'environment-recovery-settled');
      if (settled) return ok(undefined);
      const task = recovery.childTask ?? recovery.parentTask ?? recovery.basis.assessmentTask;
      const basis = { candidateOid: recovery.basis.candidateOid, branch: recovery.basis.branch, standard: recovery.basis.criteria,
        generation: 1, approvalDigest: scopeGovernanceDigest(value) };
      const reason = '旧冻结验收缺原恢复和实操回执，旧独立验收执行入口已退役。';
      const scope = newEvidenceAuditScope(value, task, basis, reason);
      const stored = await this.#submitAuditEvent(value, 'evidence-audit-blocked:' + scope.evidenceAuditKey, { kind: 'evidence-audit-blocked',
        basis, task, scope, missing: [{ requirementId: 'legacy-environment', reason }], legacy: true }, () => true);
      const live = this.#find(ref);
      return stored.ok && live ? ok(evidenceAuditProjection(this.#ledger, live)) : stored.ok ? ok(undefined) : stored;
    }
    if (action !== 'independent-assessment') return ok(undefined);
    const workspace = acceptanceWorkspaceProjection(this.#ledger, value);
    const plan = currentVerificationPlan(this.#ledger, value);
    const required = plan?.requirements.filter(requirement => requirement.stage === 'A12b' && requirement.capability.startsWith('workspace-')) ?? [];
    if (!workspace || !required.length && !workspaceWasPrepared(this.#ledger, value, workspace.basis.assessmentTask.taskId)) return ok(undefined);
    const assessment = value.graph?.tasks.find(task => sameTask(task.task, workspace.basis.assessmentTask));
    const historicalCaptures = assessment?.report && workspace.closeReceipt && workspace.binding?.browserEvidenceSource === 'application-browser'
      && this.#ledger.effects(ref.instanceId).filter(effect => effect.intent.kind === 'acceptance-workspace-browser-capture'
        && effect.state === 'succeeded' && sameTask(effect.intent.task, assessment.task)
        && effect.intent.expected?.runReceiptId === workspace.runReceiptId);
    const browserReady = workspace.browserEvidence
      ? required.every(req => req.capability !== 'workspace-browser' || workspace.browserEvidence?.checks.includes(req.id))
      : Array.isArray(historicalCaptures) && historicalCaptures.length > 0;
    const needsBrowser = workspace.binding?.requiresBrowserEvidence === true || required.some(req => req.capability === 'workspace-browser');
    const complete = !options?.verifiedLegacyFailure && workspace.receipt && workspace.closeReceipt && (!needsBrowser || browserReady)
      && required.every(req => req.capability !== 'workspace-build' || workspace.receipt?.kind === 'acceptance-workspace-run');
    const basis = { candidateOid: workspace.basis.candidateOid, branch: workspace.basis.branch, standard: workspace.basis.criteria,
      generation: 1, approvalDigest: scopeGovernanceDigest(value) };
    if (complete) {
      try {
        if (await this.#auditMaterialCurrent(value, basis)) {
          await Promise.all((workspace.browserEvidence?.artifacts ?? []).map(artifact => this.#capture(value, artifact)));
          return ok(undefined);
        }
      } catch { /* Preserve known facts and expose the unavailable historical prerequisites. */ }
    }
    const task = workspace.basis.assessmentTask;
    const reason = '旧冻结验收所需的实际执行、关闭、来源或原件无法完整复核。旧执行入口已退役。';
    const missing = (required.length ? [...new Set(required.map(req => req.id))] : ['legacy-workspace']).map(requirementId => ({ requirementId, reason }));
    const scope = newEvidenceAuditScope(value, task, basis, reason);
    const stored = await this.#submitAuditEvent(value, 'evidence-audit-blocked:' + scope.evidenceAuditKey,
      { kind: 'evidence-audit-blocked', basis, task, scope, missing, legacy: true }, () => true);
    const live = this.#find(ref);
    return stored.ok && live ? ok(evidenceAuditProjection(this.#ledger, live)) : stored.ok ? ok(undefined) : stored;
  }

  async #acceptancePreparationMaterials(value: StoredInstance,
    basis: DurableAcceptancePreparationInput['basis']): Promise<DurableAcceptancePreparationObservation['materials']> {
    const architecture = acceptancePreparationArchitecture(this.#ledger, value);
    return Promise.all((architecture ? [basis.criteria, architecture] : [basis.criteria]).map(async ref => {
      const path = join(value.projectRoot, ref.path);
      try {
        if (!(await lstat(path)).isFile() || relative(path, await realpath(path)))
          return { ref, state: 'unreadable' as const };
      } catch (error) {
        return { ref, state: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' as const : 'unreadable' as const };
      }
      const actual = await this.#a11StandardObservation(value, ref);
      return { ref, state: actual.standardState, ...(actual.observedStandardSha256 ? { observedSha256: actual.observedStandardSha256 } : {}) };
    }));
  }

  async #acceptancePreparationCandidate(value: StoredInstance, basis: DurableAcceptancePreparationInput['basis']):
    Promise<Extract<DurableAcceptancePreparationResult, { candidate: unknown }>['candidate']> {
    const read = (...args: string[]) => gitRead(value.projectRoot, ['--no-optional-locks', ...args]).catch(() => undefined);
    const [oid, branch] = await Promise.all([read('rev-parse', '--verify', 'HEAD'), read('symbolic-ref', '--short', 'HEAD')]);
    const fields = { ...(oid && oidValid(oid) ? { oid } : {}), ...(branch && validKey(branch) ? { branch } : {}) };
    if (!oid || !branch) return { state: 'unreadable', ...fields };
    if (oid !== basis.candidateOid || branch !== basis.branch) return { state: 'changed', ...fields };
    const verified = await this.#verifyImplementationGit(value, basis.candidateOid).catch(() => undefined);
    return { state: verified?.ok ? 'verified' : verified ? 'changed' : 'unreadable', ...fields };
  }

  async #acceptancePreparationPaths(value: StoredInstance, input: DurableAcceptancePreparationInput,
    materials: DurableAcceptancePreparationObservation['materials']): Promise<DurableAcceptancePreparationPath[]> {
    const result = input.result;
    if (!isPreparationBlocker(result) || !result.paths?.length) return [];
    const architecture = materials.find(material => material.ref.path.startsWith('docs/contracts/') && material.state === 'verified');
    const declared = architecture ? await this.#capture(value, architecture.ref).then(item =>
      [...item.bytes.toString('utf8').matchAll(/\x60([a-zA-Z0-9_][a-zA-Z0-9_./-]*)\x60/g)].map(match => match[1])) : [];
    const verified: DurableAcceptancePreparationPath[] = [];
    for (const proposed of result.paths) {
      const material = materials.find(item => item.ref.path === proposed.path);
      if (material) {
        verified.push({ path: proposed.path, state: material.state === 'missing' ? 'missing' : material.state === 'unreadable' ? 'unverified' : 'present' });
        continue;
      }
      try {
        const entry = await gitRead(value.projectRoot, ['ls-tree', '-z', '--full-tree', input.basis.candidateOid, '--', ':(literal)' + proposed.path]);
        if (/^100(?:644|755) blob [a-f0-9]{40,64}\t/.test(entry) && entry.endsWith('\0')) verified.push({ path: proposed.path, state: 'present' });
        else if (!entry && declared.includes(proposed.path)) verified.push({ path: proposed.path, state: 'missing' });
        else if (declared.includes(proposed.path)) verified.push({ path: proposed.path, state: 'unverified' });
      } catch {
        if (declared.includes(proposed.path)) verified.push({ path: proposed.path, state: 'unverified' });
      }
    }
    return verified.sort((a, b) => a.path.localeCompare(b.path));
  }

  async #acceptancePreparationRepair(value: StoredInstance, input: DurableAcceptancePreparationInput,
    result: DurableAcceptancePreparationResult): Promise<DurableAcceptancePreparationRework | undefined> {
    const retry = acceptancePreparationReworkStep(value);
    if (!retry || (value.visits[retry.id] ?? 0) >= retry.maxVisits || result.kind !== 'candidate-defect'
      || result.stage !== 'entry' || result.code !== 'static-entry-rejected' || result.candidate.state !== 'verified'
      || !result.paths?.length || result.paths.some(path => path.state !== 'present'
        || /^(?:docs\/(?:product|intents|proposals|contracts|scheduling|quality|acceptance|verification)\/)/.test(path.path))) return;
    const candidate = input.basis.candidateOid;
    const prior = value.graph?.tasks.findLast(task => task.capability === 'operations-implementation' && task.state === 'accepted'
      && task.aggregate?.tipOid === candidate);
    if (!prior?.aggregate || !value.implementation) return;
    const items = implementationItems(value);
    const paths = result.paths.map(path => path.path);
    const slot = (path: string, scope: readonly string[]) => scope.some(root => path === root || root.endsWith('/') && path.startsWith(root));
    const owners = paths.map(path => items.filter(item => slot(path, item.paths)));
    const item = owners[0]?.[0];
    if (!item || !owners.every(matches => matches.length === 1 && matches[0]!.id === item.id)) return;
    const previous = prior.aggregate.entries.find(entry => entry.workItemId === item.id);
    const child = previous && value.graph?.tasks.find(task => task.taskId === previous.taskId && task.report?.key === previous.reportKey
      && task.workItemId === item.id && task.roleId === item.roleId && task.state === 'accepted' && task.commitOid === previous.commitOid);
    const order = child?.workOrder;
    if (!child || !order || !sameTask(child.task, order.task) || !equal(order.standard, input.basis.criteria)
      || !paths.every(path => slot(path, order.paths))) return;
    const closed = this.#ledger.facts(value.ref.instanceId).some(row => row.receipt.state === 'consumed' && row.fact.kind === 'capability-event'
      && row.fact.event.input.kind === 'task-closed' && row.fact.event.input.outcome === 'accepted'
      && sameTask(row.fact.event.input.task, child.task) && row.fact.event.input.reportKey === previous.reportKey
      && row.fact.event.input.tipOid === previous.commitOid);
    if (!closed || !(await this.#verifyImplementationAuthority(value)).ok) return;
    const effects = this.#ledger.effects(value.ref.instanceId);
    if (effects.some(effect => (effect.intent.kind === 'model-send' || effect.intent.kind === 'dispatch')
      && sameTask(effect.intent.task, input.basis.assessmentTask) && effect.state !== 'not-started')) return;
    const commit = effects.find(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
      && sameTask(effect.intent.task, child.task) && effect.result?.result?.oid === child.commitOid
      && effect.intent.expected?.branch === input.basis.branch && effect.intent.expected.head === child.baseOid);
    if (!commit) return;
    const writeEffectKeys: string[] = [];
    for (const path of paths) {
      const write = effects.slice(0, effects.indexOf(commit)).findLast(effect => effect.state === 'succeeded'
        && effect.intent.kind === 'task-write' && effect.intent.key.startsWith('file:') && sameTask(effect.intent.task, child.task)
        && equal(effect.intent.expected?.paths, [path]) && ['write', 'edit'].includes(String(effect.intent.expected?.operation)));
      const sha256 = write?.intent.expected?.contentSha256;
      if (!write || typeof sha256 !== 'string' || !hashValid(sha256)) return;
      const actual = await this.#capture(value, { path, sha256 }).catch(() => undefined);
      const diff = await gitRead(value.projectRoot, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z',
        child.commitOid!, candidate, '--', ':(literal)' + path]);
      if (!actual || diff) return;
      writeEffectKeys.push(write.intent.key);
    }
    return { sourceCandidateOid: candidate, ownerTask: child.task, workItemId: item.id, workOrderDigest: order.digest, paths, writeEffectKeys,
      inherited: prior.aggregate.entries.filter(entry => entry.workItemId !== item.id), reason: result.reason };
  }

  async recordAcceptancePreparation(ref: DurableInstanceRef, input: DurableAcceptancePreparationInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableAcceptancePreparationObservation>> {
    const invalid = () => fail('acceptance-preparation-observation-invalid', '准备结果未匹配当前实际候选、工作区和签发依据。');
    const value = this.#find(ref);
    const workspace = value && acceptanceWorkspaceProjection(this.#ledger, value);
    if (!value || !workspace?.preparationGate || !isCurrent() || value.engine !== 'healthy' || workspace.prepareKey !== input.prepareKey
      || !equal(input.basis, workspace.basis) || !input.result || !['prepared', 'not-applicable', 'candidate-defect', 'material-conflict', 'unavailable']
        .includes(input.result.kind)) return invalid();
    const previous = workspace.preparation;
    if (['stop', 'rework'].includes(blockedRoutingProjection(this.#ledger, value)?.decision?.option ?? '')) return invalid();
    const observed = input.result;
    if (isPreparationBlocker(observed) && (!/^[a-z][a-z0-9-]{0,95}$/.test(observed.code) || !validKey(observed.reason)
      || /(?:\b[A-Za-z]:[\\/]|(?:\s|^)[\\/])/.test(observed.reason.trim())
      || !['candidate', 'materials', 'entry', 'registration', 'workspace', 'reconciliation'].includes(observed.stage)
      || observed.paths && (!Array.isArray(observed.paths) || observed.paths.length > 24 || !observed.paths.every(path => path && safePath(path.path))
        || new Set(observed.paths.map(path => path.path)).size !== observed.paths.length))) return invalid();
    try {
      const effect = acceptancePreparationEffectIdentity(this.#ledger.effect(ref.instanceId, input.prepareKey));
      const materials = await this.#acceptancePreparationMaterials(value, input.basis);
      const candidate = await this.#acceptancePreparationCandidate(value, input.basis);
      const conflicts = materials.some(material => material.state !== 'verified');
      const approved = currentProposalDecision(this.#ledger, value);
      const criteria = !conflicts && approved ? await this.#capture(value, input.basis.criteria) : undefined;
      const mismatch = !!(approved && criteria && !this.#reviewMatchesProposal(criteria.bytes.toString('utf8'), approved));
      let result: DurableAcceptancePreparationResult = observed;
      if (conflicts || mismatch) {
        result = { kind: 'material-conflict', stage: 'materials', code: conflicts ? 'workspace-signed-material-changed' : 'workspace-standard-proposal-mismatch',
          candidate, reason: conflicts ? '当前签发标准或批准架构缺失、漂移或暂不可读。' : '当期标准与已批准的 A6 定案不符。',
          paths: materials.filter(material => conflicts ? material.state !== 'verified' : equal(material.ref, input.basis.criteria))
            .map(material => ({ path: material.ref.path, state: material.state === 'missing' ? 'missing' : material.state === 'unreadable' ? 'unverified' : 'present' })) };
      } else if (candidate.state !== 'verified') {
        result = { kind: 'unavailable', stage: 'candidate', code: 'workspace-candidate-unverified', candidate,
          reason: '当前 Git 分支、提交或已跟踪工作区无法匹配原候选。' };
      } else if (observed.kind === 'prepared') {
        if (!hashValid(observed.receiptId) || !workspace.binding || effect?.state !== 'succeeded' || effect.receiptId !== observed.receiptId) return invalid();
      } else if (observed.kind === 'not-applicable') {
        const plan = currentVerificationPlan(this.#ledger, value);
        const selectedBrowser = Object.entries(approved?.values ?? {}).some(([field, selection]) =>
          /^(?:runtime-?|delivery-?)?platform$/i.test(field) && typeof selection === 'string' && /^(?:desktop-)?static-browser(?:-file|-http)?$/.test(selection));
        if (observed.authority !== 'no-workspace-required' || !plan || !equal(plan.standard, input.basis.criteria)
          || selectedBrowser || plan.requirements.some(row => row.stage === 'A12b' && row.capability.startsWith('workspace-'))
          || effect && effect.state !== 'not-started') return invalid();
      } else {
        const paths = await this.#acceptancePreparationPaths(value, input, materials);
        result = { ...observed, candidate, paths };
      }
      const rework = observed.kind === 'candidate-defect' && result.kind === 'candidate-defect'
        && observed.paths?.length === result.paths?.length ? await this.#acceptancePreparationRepair(value, input, result) : undefined;
      const details = { prepareKey: input.prepareKey, basis: input.basis, result, entry: value.entry,
        governanceDigest: scopeGovernanceDigest(value), materials, ...(effect ? { effect } : {}),
        ...(rework ? { rework, action: 'rework' as const } : {}) };
      const observationDigest = digest(stableJson([ref, { ...details,
        result: isPreparationBlocker(result) ? { ...result, reason: undefined } : result,
        rework: rework ? { ...rework, reason: undefined } : undefined }]));
      if (previous?.digest === observationDigest && this.#scopeCurrent(value, this.#find(ref), isCurrent)
        && acceptancePreparationObservation(this.#ledger, this.#find(ref)!)?.generation === previous.generation) return ok(previous);
      return this.#saveAcceptancePreparation(value, { ...details, digest: observationDigest, generation: (previous?.generation ?? 0) + 1 }, isCurrent);
    } catch { return invalid(); }
  }

  async #saveAcceptancePreparation(value: StoredInstance, observation: DurableAcceptancePreparationObservation,
    isCurrent: () => boolean): Promise<DurableResult<DurableAcceptancePreparationObservation>> {
    const key = 'acceptance-preparation-observed:' + observation.prepareKey + ':' + observation.generation;
    const saved = await this.#submitScope(value, key, { kind: 'acceptance-preparation-observed', observation }, isCurrent);
    return saved.ok ? ok(observation) : saved;
  }

  async requestAcceptancePreparationStop(ref: DurableInstanceRef, prepareKey: string,
    isCurrent: () => boolean): Promise<DurableResult<DurableAcceptancePreparationObservation>> {
    const value = this.#find(ref);
    const observation = value && acceptancePreparationObservation(this.#ledger, value);
    const scope = value && blockedRoutingProjection(this.#ledger, value);
    if (!value || !isCurrent() || !observation || observation.prepareKey !== prepareKey
      || scope?.a12bPrepareKey !== prepareKey || scope.decision?.option !== 'wait' && !observation.confirmation)
      return fail('workflow-blocked-scope-stale', '当前准备阻塞不在已选等待状态。');
    if (observation.confirmation && !scope.decision) return ok(observation);
    return this.#saveAcceptancePreparation(value, { ...observation, generation: observation.generation + 1, confirmation: 'stop' }, isCurrent);
  }

  #submitScope(value: StoredInstance, key: string, input: DurableCapabilityEvent['input'], isCurrent: () => boolean) {
    return this.#submitCapability(value.ref, { key, stepId: value.stepId, attempt: value.attempt, flowId: value.graph!.flowId!,
      source: { roleId: 'host', originId: value.ref.instanceId, parentTaskId: value.ref.instanceId }, input },
    () => this.#scopeCurrent(value, this.#find(value.ref), isCurrent), false, true);
  }

  async #prepareBlockedScope(value: StoredInstance, task: DurableTaskBinding, document: DurableEvidenceRef, reason: string,
    capability: DurableBlockedScopeRequest['capability'] | undefined, canRevise: boolean,
    isCurrent: () => boolean): Promise<DurableResult<DurableBlockedRoutingProjection>> {
    const description = reason.trim().replace(/\s+/g, ' ').slice(0, 256);
    if (!this.#scopeCurrent(value, this.#find(value.ref), isCurrent) || !validKey(description)) {
      return fail('workflow-blocked-scope-stale', '当前阻塞来源或原审批已变化。');
    }
    const candidate = implementationHead(value);
    if (!candidate) return fail('workflow-blocked-scope-candidate', '当前阻塞缺合法候选或基线。');
    const head = await this.#verifyImplementationGit(value, candidate);
    if (!head.ok) return head;
    const scope = newBlockedScope(value, task, document, description, candidate, capability, canRevise);
    const saved = await this.#submitScope(value, 'blocked-scope-prepared:' + scope.binding.requestId, { kind: 'blocked-scope-prepared', scope }, isCurrent);
    if (!saved.ok) return saved;
    return ok(blockedRoutingProjection(this.#ledger, this.#find(value.ref)!) ?? scope);
  }

  async prepareBlockedScopeChange(ref: DurableInstanceRef, input: DurableBlockedScopeRequest,
    isCurrent: () => boolean, preflight?: DurableVerificationPreflightFn): Promise<DurableResult<DurableBlockedRoutingProjection>> {
    const value = this.#find(ref);
    const task = value?.graph?.tasks.find(item => sameTask(item.task, input.task));
    const invalid = () => fail('workflow-blocked-scope-unverified', '缺当前独立标准、实际角色报告或受信的不可用能力。');
    if (!value || !task || task.stepId !== value.stepId || task.attempt !== value.attempt || !blockedRoutingEnabled(value) || !isCurrent()) return invalid();
    if (task.capability === 'independent-assessment' && task.state === 'pending' && !task.report && preflight && value.baseline && task.reviewWritePath) {
      const plan = currentVerificationPlan(this.#ledger, value);
      const sent = this.#ledger.effects(ref.instanceId).some(effect => sameTask(effect.intent.task, task.task)
        && (effect.intent.kind === 'dispatch' || effect.intent.kind === 'model-send'));
      if (!plan || sent || !equal(plan.standard, input.document) || !plan.requirements.some(row => row.stage === 'A12b' && row.capability === input.capability)) return invalid();
      const checked = await preflight({ ref, projectRoot: value.projectRoot, roleId: task.roleId, taskId: task.taskId,
        stepId: task.stepId, attempt: task.attempt, flowId: task.flowId, stage: 'A12b', path: task.reviewWritePath,
        baselineOid: value.baseline.oid, proposalDecisionDigest: currentProposalDecision(this.#ledger, value)?.selectionDigest });
      if (!checked.ok || !verificationCapabilitiesValid(checked.value) || checked.value.stage !== 'A12b') return invalid();
      const unavailable = checked.value.status.find(row => row.status === 'unavailable' && row.capability === input.capability);
      if (!unavailable) return invalid();
      return this.#prepareBlockedScope(value, task.task, input.document, (unavailable.reason ?? '本次独立验收的实际能力不可用。').slice(0, 256),
        unavailable.capability, false, isCurrent);
    }
    if (!task.verificationCapabilities || task.state !== 'reported' || task.capability !== 'independent-standard' || !task.report
      || !this.#ledger.effects(ref.instanceId).some(effect => effect.intent.kind === 'task-write' && effect.state === 'succeeded'
        && sameTask(effect.intent.task, task.task) && equal(effect.intent.expected?.paths, [input.document.path])
        && effect.intent.expected?.contentSha256 === input.document.sha256)
      || this.#ledger.effect(ref.instanceId, 'model:' + task.taskId)?.state !== 'succeeded') return invalid();
    try {
      const formal = this.getEvidence(ref, task.report.evidence) as { report?: { status?: string; origin?: string } } | undefined;
      if (formal?.report?.origin !== 'submitted-report' || !['completed', 'blocked'].includes(formal.report.status ?? '')) return invalid();
      const bytes = await this.#capture(value, input.document);
      const approved = currentProposalDecision(this.#ledger, value);
      if (approved && !this.#reviewMatchesProposal(bytes.bytes.toString('utf8'), approved)) return invalid();
      const planned = readVerificationPlan(input.document, bytes.bytes, task.flowId, task.verificationCapabilities,
        implementationItems(value).filter(item => item.roleId !== task.roleId));
      const missing = planned.ok && unavailableVerification(planned.value);
      if (!missing || missing.capability !== input.capability) return invalid();
      const reason = '当前标准要求 ' + missing.capability + '，实际应用能力不可用。' + (missing.reason ?? '');
      return this.#prepareBlockedScope(value, task.task, input.document, reason.slice(0, 256), missing.capability, false, isCurrent);
    } catch { return invalid(); }
  }

  async decideBlockedScopeChange(ref: DurableInstanceRef, decision: DurableBlockedScopeDecisionInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const key = 'blocked-scope-decided:' + decision.requestId;
    if (!value || !isCurrent()) return fail('workflow-blocked-scope-stale', '原决定来源已变化。');
    const previous = this.#ledger.fact(ref.instanceId, key);
    if (previous?.fact.kind === 'capability-event' && previous.fact.event.input.kind === 'blocked-scope-decided') {
      return equal(previous.fact.event.input.decision, decision) ? ok(previous.receipt) : fail('fact-key-conflict', '本次阻塞已记录其它处置。');
    }
    const scope = blockedRoutingProjection(this.#ledger, value);
    if (!scope || !decisionProvenanceMatches(decision.provenance.source, decision.provenance, scope.binding)
      || !scope.candidateOid || scope.binding.requestId !== decision.requestId) return fail('workflow-blocked-scope-stale', '决定未匹配当前阻塞卡。');
    if (scope.evidenceAuditKey) {
      if (!scope.options.some(option => option.id === decision.option)) return fail('workflow-blocked-scope-stale', '冻结节点没有本决定的现行出口。');
      const audit = evidenceAuditProjection(this.#ledger, value);
      if (!audit || scope.binding.generation !== audit.basis.generation) return fail('workflow-blocked-scope-stale', '已换代的证据卡无法结算。');
      if (decision.option === 'route' || decision.option === 'compromise') {
        const available = await this.#evidenceBlockerActions(value, audit);
        if (decision.option === 'route' ? !scope.evidenceRoute || !equal(available.evidenceRoute, scope.evidenceRoute)
          : !scope.evidenceCompromise || !equal(available.evidenceCompromise, scope.evidenceCompromise)) {
          return fail('workflow-blocked-scope-stale', '本次实际取证路线或拟调整依据已变化。');
        }
      }
      return this.#submitAuditEvent(value, key, { kind: 'blocked-scope-decided', decision }, isCurrent);
    }
    const preparation = scope.a12bPrepareKey && acceptancePreparationObservation(this.#ledger, value);
    if (preparation && isPreparationBlocker(preparation.result)) {
      const effect = acceptancePreparationEffectIdentity(this.#ledger.effect(ref.instanceId, preparation.prepareKey));
      const [materials, candidate] = await Promise.all([
        this.#acceptancePreparationMaterials(value, preparation.basis), this.#acceptancePreparationCandidate(value, preparation.basis),
      ]);
      if (!equal(materials, preparation.materials) || !equal(candidate, preparation.result.candidate) || !equal(effect, preparation.effect)) {
        await this.recordAcceptancePreparation(ref, preparation, isCurrent);
        return fail('workflow-blocked-scope-stale', '当前准备条件已变化，请查看新的实际观察。');
      }
      if (decision.option === 'rework' && (effect?.state === 'unknown' || effect?.state === 'claimed'
        || !preparation.rework || !equal(preparation.rework, await this.#acceptancePreparationRepair(value, preparation, preparation.result)))) {
        return fail('workflow-blocked-scope-stale', '返工需匹配当前候选、原工单及实际文件作用。');
      }
      return this.#submitScope(value, key, { kind: 'blocked-scope-decided', decision }, isCurrent);
    }
    const a11 = scope.a11DispositionKey && a11DispositionProjection(this.#ledger, value);
    if (a11) {
      const material = await this.#a11StandardObservation(value, a11.standard);
      if (material.standardState !== a11.standardState || material.observedStandardSha256 !== a11.observedStandardSha256) {
        await this.observeA11Disposition(ref, a11.key, a11.observation, isCurrent);
        return fail('workflow-blocked-scope-stale', '当前签发文件的观察状态已变化，请重新查看处置。');
      }
      return this.#submitScope(value, key, { kind: 'blocked-scope-decided', decision }, isCurrent);
    }
    try {
      await this.#capture(value, scope.document);
      const head = await this.#verifyImplementationGit(value, scope.candidateOid);
      if (!head.ok) return head;
      return this.#submitScope(value, key, { kind: 'blocked-scope-decided', decision }, isCurrent);
    } catch { return fail('workflow-blocked-scope-drift', '当前阻塞的文件已发生变化。'); }
  }

  async resumeBlockedScopeChange(ref: DurableInstanceRef, requestId: string, preflight?: DurableVerificationPreflightFn,
    isCurrent: () => boolean = () => false): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    const scope = value && blockedRoutingProjection(this.#ledger, value);
    const insufficient = () => fail('workflow-blocked-scope-unresolved', '当前阻塞缺真实恢复的能力或已核对的新批准文件。');
    if (!value || !isCurrent()) return insufficient();
    const recorded = this.#ledger.fact(ref.instanceId, 'blocked-scope-resumed:' + requestId);
    if (recorded?.fact.kind === 'capability-event' && recorded.fact.event.input.kind === 'blocked-scope-resumed') return ok(recorded.receipt);
    if (!scope?.decision || scope.binding.requestId !== requestId || !scope.candidateOid) return insufficient();
    try {
      const head = await this.#verifyImplementationGit(value, scope.candidateOid);
      if (!head.ok) return head;
      await this.#capture(value, scope.document);
      let evidence: DurableEvidenceRef = scope.document;
      let verificationCapabilities: DurableVerificationCapabilitySnapshot | undefined;
      if (scope.evidenceAuditKey && scope.decision.option === 'route') {
        const audit = evidenceAuditProjection(this.#ledger, value);
        if (!audit || !scope.evidenceRoute || !equal((await this.#evidenceBlockerActions(value, audit)).evidenceRoute, scope.evidenceRoute)) return insufficient();
        return this.#submitAuditEvent(value, 'blocked-scope-resumed:' + requestId,
          { kind: 'blocked-scope-resumed', requestId, evidence, evidenceAction: 'route' }, isCurrent);
      }
      if (scope.decision.option === 'revise' || scope.decision.option === 'compromise' && scope.evidenceCompromise) {
        const revision = documentRevisionProjection(value);
        if (!revision || revision.status !== 'resumed' || revision.approval?.decision !== 'approve' || !revision.candidate
          || !equal(revision.original, scope.document) || revision.origin.taskId !== scope.origin.task.taskId) return insufficient();
        evidence = revision.candidate;
      } else if (scope.decision.option === 'wait' && scope.capability && preflight && value.baseline
        && (scope.origin.task.stage === 'A12a' || scope.origin.task.stage === 'A12b')) {
        const task = value.graph?.tasks.find(task => sameTask(task.task, scope.origin.task));
        if (!task || !task.reviewWritePath) return insufficient();
        const prepared = await preflight({ ref, projectRoot: value.projectRoot, roleId: task.roleId, taskId: task.taskId,
          stepId: task.stepId, attempt: task.attempt, flowId: task.flowId, stage: scope.origin.task.stage, path: task.reviewWritePath,
          baselineOid: value.baseline.oid, proposalDecisionDigest: currentProposalDecision(this.#ledger, value)?.selectionDigest });
        if (!prepared.ok) return prepared;
        verificationCapabilities = prepared.value;
      } else return insufficient();
      await this.#capture(value, evidence);
      if (scope.evidenceAuditKey && scope.decision.option === 'compromise') {
        const plan = currentVerificationPlan(this.#ledger, value);
        if (!plan || !equal(plan.standard, evidence)) return insufficient();
        return this.#submitAuditEvent(value, 'blocked-scope-resumed:' + requestId,
          { kind: 'blocked-scope-resumed', requestId, evidence, evidenceAction: 'compromise' }, isCurrent);
      }
      return this.#submitScope(value, 'blocked-scope-resumed:' + requestId, { kind: 'blocked-scope-resumed', requestId, evidence,
        ...(verificationCapabilities ? { verificationCapabilities } : {}) }, isCurrent);
    } catch { return insufficient(); }
  }

  #submitEnvironmentEvent(ref: DurableInstanceRef, binding: DurableTaskBinding, key: string,
    input: DurableCapabilityEvent['input'], isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    if (value && evidenceAuditConfiguration(value)) return Promise.resolve(fail('evidence-audit-execution-retired', '当前证据审计合同没有旧独立执行入口。'));
    const task = value?.graph?.tasks.find(item => equal(item.task, binding));
    if (!task || !isCurrent?.()) {
      return Promise.resolve(fail('environment-recovery-source-stale', '环境事实缺当前应用来源或持久任务。'));
    }
    const source = input.kind === 'environment-recovery-dispatch'
      ? { roleId: 'convener', originId: input.dispatch.originId, parentTaskId: binding.taskId }
      : { roleId: 'host', originId: ref.instanceId, parentTaskId: ref.instanceId };
    return this.#submitCapability(ref, { key, stepId: task.stepId, attempt: task.attempt, flowId: task.flowId, source, input },
      isCurrent, true);
  }

  submitCapability(ref: DurableInstanceRef, event: DurableCapabilityEvent, isCurrent?: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    return this.#submitCapability(ref, event, isCurrent);
  }

  #a11ParkedParentReport(value: StoredInstance, event: DurableCapabilityEvent): boolean {
    const disposition = a11DispositionProjection(this.#ledger, value);
    return disposition?.state === 'parked' && event.input.kind === 'task-report' && sameTask(event.input.task, disposition.parentTask);
  }

  async #submitCapability(ref: DurableInstanceRef, event: DurableCapabilityEvent, isCurrent?: () => boolean,
    trustedEnvironment = false, trustedBlockedRouting = false, observedEvidence?: Evidence): Promise<DurableResult<DurableFactReceipt>> {
    const ledger = this.#ledger;
    const value = this.#find(ref);
    if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
    const decision = event.input.kind === 'card-decided' ? event.input : undefined;
    const sourceStale = () => fail('capability-source-stale', '原应用来源或授权已变化。');
    if (decision && !isCurrent?.()) return sourceStale();
    if (recoveryEvent(event.input) && (!trustedEnvironment || !isCurrent?.())) return sourceStale();
    if (blockedScopeEvent(event.input) && (!trustedBlockedRouting || !isCurrent?.())) return sourceStale();
    const disposition = a11DispositionProjection(ledger, value);
    if (disposition?.state === 'resumed' && (event.key === disposition.childReport.key || event.key === disposition.parentReport?.key))
      return ok({ key: event.key, state: 'ignored', reason: '原回交保留为历史，本次恢复需要新的正式回交。' });
    const fact: DurableFact = { kind: 'capability-event', source: 'host', key: event.key, stepId: event.stepId, attempt: event.attempt, event };
    const replay = (original: ReturnType<DurableLedger['fact']>): DurableResult<DurableFactReceipt> | undefined => {
      if (!original) return;
      if (equal(original.fact, fact) || decision && original.fact.kind === 'capability-event' && equal(original.fact.event, event)) {
        return ok(original.receipt);
      }
      const prior = original.fact.kind === 'capability-event' ? original.fact.event : undefined;
      if (prior?.input.kind === 'implementation-dispatch' && event.input.kind === 'implementation-dispatch'
        && isCurrent?.() && event.source.roleId === 'convener' && prior.source.roleId === 'convener'
        && event.source.parentTaskId === prior.source.parentTaskId && equal(prior.input, event.input)
        && prior.flowId === event.flowId && prior.stepId === event.stepId && prior.attempt === event.attempt) return ok(original.receipt);
      if (prior?.input.kind === 'environment-recovery-dispatch' && event.input.kind === 'environment-recovery-dispatch'
        && prior.input.dispatch.requestId === event.input.dispatch.requestId && prior.input.dispatch.roleId === event.input.dispatch.roleId
        && prior.stepId === event.stepId && prior.attempt === event.attempt
        && equal(prior.input.dispatch.parentTask, event.input.dispatch.parentTask)) return ok(original.receipt);
      return fail('fact-key-conflict', '同一事实键已绑定其他内容。');
    };
    const previous = replay(ledger.fact(ref.instanceId, event.key));
    if (previous) return previous;
    if ((blockedRoutingProjection(ledger, value) || disposition?.retest && disposition.state === 'parked')
      && !blockedScopeEvent(event.input) && !this.#a11ParkedParentReport(value, event)) {
      return fail('workflow-blocked-scope-parked', '当前节点等待实际阻塞决定或原授权恢复。');
    }
    if (revisionParksNode(value)) return fail('document-revision-node-parked', '当前节点正在处理内置文件修订。');
    const card = value.graph?.card;
    if (decision && (!card || card.requestId !== decision.requestId || card.digest !== decision.digest
      || card.generation !== decision.generation || !decisionProvenanceMatches(decision.authority, decision.provenance, card))) {
      return fail('capability-card-decision-invalid', '决定未匹配当前卡、代次或受限委托证据。');
    }
    const evidence: Evidence[] = observedEvidence ? [observedEvidence] : [];
    try {
      const input = event.input;
      let intentPath: string | undefined;
      const preflight = input.kind === 'environment-missing' && input.missing.origin === 'preflight' ? input.missing : undefined;
      if (input.kind === 'environment-missing' || input.kind === 'environment-recovery-dispatch'
        || input.kind === 'environment-recovery-settled' && input.settlement.outcome.kind !== 'blocked') {
        const missing = input.kind === 'environment-missing' ? input.missing : recoveryMissing(ledger, value)?.missing;
        if (!missing || !validMissingEvidence(missing)) return fail('environment-recovery-evidence-invalid', '缺少应用确认的依赖与报告证据。');
        const checked = await this.#verifyRecoveryArtifacts(value, missing);
        if (!checked.ok) return checked;
        if (preflight && !await assessmentJournalIsUndispatched(value.projectRoot, preflight.basis.assessmentTask.taskId)) {
          return fail('environment-preflight-assessment-started', '应用派发账本已有本次任务，或无法核对尚未派发状态。');
        }
        if (input.kind !== 'environment-missing') {
          const authority = await this.#verifyImplementationAuthority(value);
          if (!authority.ok) return authority;
        }
        if (input.kind === 'environment-recovery-settled' && input.settlement.outcome.kind === 'restored') {
          const result = input.settlement.outcome;
          const verified = this.getEvidence(ref, result.verification) as Record<string, unknown> | undefined;
          if (verified?.kind !== 'npm-local-executable-verified' || verified.candidateOid !== missing.basis.candidateOid
            || !equal(verified.criteria, missing.basis.criteria) || !equal(verified.manifest, missing.manifest) || !equal(verified.lock, missing.lock)
            || verified.taskId !== input.settlement.childTask?.taskId || verified.commandReceiptId !== result.commandReceiptId
            || verified.executable !== missing.condition.executable) {
            return fail('environment-recovery-verification-invalid', '安装结果缺本任务对同候选和实际本地执行入口的复测。');
          }
        }
      }
      if (activeAction(value) === 'operations-implementation') {
        const checked = await this.#verifyImplementationEvent(value, event);
        if (!checked.ok) return checked;
      }
      if (evidenceAuditConfiguration(value) && activeAction(value) === 'independent-assessment'
        && (input.kind === 'task-report' || input.kind === 'task-closed')) {
        const audit = evidenceAuditProjection(ledger, value);
        if (!audit) return fail('evidence-audit-dispatch-held', '正式审计缺当期收口证据。');
        const checked = await this.#verifyCurrentAudit(value, audit);
        if (!checked.ok) return checked;
      }
      if (activeAction(value) === 'confirm-intent' &&
        (event.input.kind === 'card-prepared' || event.input.kind === 'card-decided' && event.input.decision === 'approve')) {
        const currentDraft = await this.prepareDirectIntentGate(ref);
        if (!currentDraft.ok) return currentDraft;
        intentPath = currentDraft.value?.path;
        const documents = event.input.kind === 'card-prepared' ? event.input.card.documents : value.graph?.card?.documents;
        if (currentDraft.value) {
          const { path, sha256 } = currentDraft.value;
          if (!documents?.some(document => document.path === path && document.sha256 === sha256)) {
            return fail('workflow-intent-draft-drift', '意图确认卡未绑定当前有效的意图稿及摘要。');
          }
        }
      }
      for (const item of capabilityEvidence(event)) evidence.push(await this.#capture(value, item));
      if (input.kind === 'card-prepared' && input.card.cardKind === 'intent-confirm') {
        const actual = intentPath ?? (await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId: event.flowId })).productIntentPath;
        const checked = this.#verifyIntentDecisionCard(input.card, actual, evidence);
        if (!checked.ok) return checked;
      }
      if (input.kind === 'card-prepared' && input.card.cardKind === 'proposal'
        && !this.#proposalCardMatchesMaterials(value, input.card, event.flowId, evidence)) {
        return fail('workflow-proposal-decision-fields-drift', 'A6 定案选项须来自当前正式意图与提案。');
      }
      const currentProposal = currentProposalDecision(ledger, value);
      const eventStep = value.definition.steps[event.stepId];
      const reviewAction = eventStep && 'action' in eventStep ? eventStep.action : undefined;
      const auditConfigured = !!evidenceAuditConfiguration(value);
      if (input.kind === 'task-closed' && input.outcome !== 'rework' && (blockedRoutingEnabled(value) || auditConfigured)
        && reviewAction === 'independent-standard') {
        const assigned = value.graph?.tasks.find(task => sameTask(task.task, input.task));
        const standard = evidence.find(item => item.ref.path === assigned?.reviewWritePath);
        if (assigned?.verificationCapabilities && standard) {
          const plan = readVerificationPlan(standard.ref, standard.bytes, event.flowId, assigned.verificationCapabilities,
            implementationItems(value).filter(item => item.roleId !== assigned.roleId), auditConfigured);
          if (!plan.ok && input.outcome === 'accepted') return plan;
          const missing = plan.ok && unavailableVerification(plan.value);
          if (missing && !auditConfigured) {
            const opened = await this.prepareBlockedScopeChange(ref, { task: input.task, document: standard.ref,
              capability: missing.capability, reason: missing.reason ?? '应用核对能力不可用。' }, isCurrent ?? (() => true));
            return opened.ok ? fail('verification-capability-unavailable', '已创建当前能力不可用的应用处置卡，暂缓签发。') : opened;
          }
        } else if (input.outcome === 'accepted') {
          return fail('verification-plan-invalid', '缺本次正式标准与应用能力依据。');
        }
      }
      if (currentProposal && input.kind === 'task-closed' && input.outcome !== 'rejected'
        && (reviewAction === 'independent-standard' || reviewAction === 'independent-assessment')) {
        const suffix = reviewAction === 'independent-standard' ? 'criteria' : 'report';
        const document = evidence.find(item => item.ref.path.startsWith('docs/quality/' + event.flowId + '-' + suffix + '-v'));
        if (!document || !this.#reviewMatchesProposal(document.bytes.toString('utf8'), currentProposal)) {
          return fail('workflow-review-proposal-decision-mismatch', '正式验收文档须沿用当前批准的 A6 选择与摘要。');
        }
      }
      const closingWorkspace = input.kind === 'task-closed' && activeAction(value) === 'independent-assessment'
        ? acceptanceWorkspaceProjection(ledger, value) : undefined;
      if (closingWorkspace?.receipt && !closingWorkspace.closeReceipt && input.kind === 'task-closed'
        && sameTask(input.task, closingWorkspace.basis.assessmentTask)) {
        const close = ledger.effect(ref.instanceId, closingWorkspace.closeKey);
        if (input.outcome !== 'rejected' || close?.state !== 'unknown' || close.intent.kind !== 'acceptance-workspace-close'
          || !sameTask(close.intent.task, input.task)) {
          return fail('acceptance-workspace-preview-still-open', '本次验收的回环预览尚未核对关闭。');
        }
      }
      if (workflowOwnsDispatch(value) && activeAction(value) === 'independent-assessment'
        && event.input.kind === 'task-closed' && event.input.outcome !== 'rejected') {
        const { tipOid, outcome, documents } = event.input;
        const prefix = 'docs/quality/' + event.flowId + '-report-v';
        const identified = evidence.find(item => item.ref.path.startsWith(prefix));
        const document = identified && /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(identified.bytes.toString('utf8'));
        const header = document && parseDocument(document[1]!, { uniqueKeys: true });
        const facts = header && !header.errors.length ? header.toJS({ maxAliasCount: 0 }) as Record<string, unknown> : undefined;
        if (!facts || facts.outcome !== outcome || facts.candidateOid !== tipOid) {
          return fail('capability-review-candidate-mismatch', '独立验收报告须记录同一候选的提交与正式结论。');
        }
        if ((blockedRoutingEnabled(value) || auditConfigured) && outcome === 'accepted') {
          const plan = currentVerificationPlan(ledger, value);
          const independent = plan?.requirements.filter(row => row.stage === 'A12b');
          const required = independent && [...new Set(independent.map(row => row.id))].sort();
          if (!required?.length || !Array.isArray(facts.verifiedCriteria) || !equal([...facts.verifiedCriteria].sort(), required)) {
            return fail('verification-assessment-proof-required', '正式独立验收报告未逐项回交当前签发要求。');
          }
          const actual = closingWorkspace;
          if (independent!.some(row => row.capability === 'workspace-browser' && (!actual?.browserEvidence?.captureReceiptIds?.length
            || !actual.browserEvidence.checks.includes(row.id)) || row.capability === 'workspace-build' && actual?.receipt?.kind !== 'acceptance-workspace-run'
            || row.capability === 'workspace-preview' && (!actual?.receipt || !actual.closeReceipt))) {
            return fail('verification-assessment-proof-required', '当前候选缺签发标准所需的实物构建、预览关闭或实际浏览器证据。');
          }
        }
        if (outcome === 'accepted' && workspaceWasPrepared(ledger, value, event.input.task.taskId)) {
          const workspace = closingWorkspace;
          if (!workspace?.binding || !workspace.receipt || !workspace.closeReceipt || workspace.state !== 'ready-for-review'
            || !sameTask(event.input.task, workspace.basis.assessmentTask) || tipOid !== workspace.basis.candidateOid) {
            return fail('acceptance-workspace-proof-required', '本次独立验收缺获批实际操作、回环预览或关闭核验。');
          }
          const acceptedBrowserEvidence = workspace.browserEvidence?.artifacts;
          if (workspace.binding.requiresBrowserEvidence && (!acceptedBrowserEvidence?.length || acceptedBrowserEvidence.some(item =>
            !documents?.some(document => equal(document, item))))) {
            return fail('acceptance-workspace-browser-proof-required', '本次验收标准需要实际浏览器操作及已复核的附件。');
          }
          const head = await this.#verifyImplementationGit(value, workspace.basis.candidateOid);
          if (!head.ok) return head;
          const pathFromProject = (absolute: string) => relative(value.projectRoot, absolute).replaceAll('\\', '/');
          if (workspace.receipt.kind === 'acceptance-workspace-static-run') {
            const requirements = workspace.binding.staticRequirements!;
            if (requirements.build || requirements.requireDeliveryStartup || requirements.requireLogicTest) {
              return fail('acceptance-workspace-static-check-required', '静态准备不能证明签发标准要求的实际构建、交付启动或逻辑测试。');
            }
            if (requirements.deliveryStartup && facts.deliveryStartup !== 'not-verified') {
              return fail('acceptance-workspace-static-startup-missing', '验收报告须单列交付启动器状态 deliveryStartup: not-verified。');
            }
            const verified = await this.#verifyStaticWorkspaceOutput(value, workspace.receipt);
            if (!verified.ok) return verified;
          } else {
            await this.#capture(value, { path: pathFromProject(join(workspace.binding.outputRoot, 'index.html')),
              sha256: workspace.receipt.build.entrySha256 });
          }
          const [criteriaBytes, , ...attachments] = await Promise.all([
            this.#capture(value, workspace.basis.criteria),
            this.#capture(value, { path: pathFromProject(workspace.binding.launcherPath), sha256: workspace.binding.launcherSha256 }),
            ...(acceptedBrowserEvidence ?? []).map(item => this.#capture(value, item)),
          ]);
          if (workspace.binding.browserEvidenceSource === 'application-browser'
            && !this.#browserEvidenceMatchesStandard(workspace, event.flowId, criteriaBytes, attachments,
              blockedRoutingEnabled(value) ? currentVerificationPlan(ledger, value)?.requirements
                .filter(row => row.stage === 'A12b' && row.capability === 'workspace-browser').map(row => row.id) : undefined)) {
            return fail('acceptance-workspace-browser-proof-required', '当前 P0 标准缺少同一应用浏览器回合的实际证据与元数据。');
          }
        }
      }
      let intentId: string | undefined;
      let confirmedRoster: Awaited<ReturnType<typeof loadLatestRoster>> | undefined;
      if (event.input.kind === 'stage-request' && activeAction(value) === 'observe-existing') {
        const paths = event.input.existingPaths;
        const head = value.graph?.observedHead;
        if (!head || !oidValid(head) || !paths?.length || paths.length > 5 || paths.some(path => !safePath(path))
          || value.graph?.customerPurpose === 'new-work' || !event.input.reason?.trim()) {
          return fail('workflow-existing-purpose-unverified', '变更须绑定真实请求、理由及已存在的模块文件。');
        }
        const owners = await deriveDurablePathBWriteSets({ projectRoot: value.projectRoot, flowId: event.flowId, scopeFiles: paths });
        if (!owners.ok) return owners;
        if (!await trackedFiles(value.projectRoot, head, paths)) return fail('workflow-existing-purpose-unverified', '既有范围须核验到具体已追踪的普通文件。');
      }
      if (event.input.kind === 'task-bound' && (activeAction(value) === 'independent-standard' || activeAction(value) === 'independent-assessment')) {
        const roster = await loadLatestRoster({ projectRoot: value.projectRoot, flowId: event.flowId, evidenceCollectorRoleId: evidenceAuditConfiguration(value)?.collectorRoleId });
        const step = value.definition.steps[event.stepId];
        const role = step && 'action' in step ? step.role ?? 'verifier' : undefined;
        const explicit = role !== undefined && role !== 'independent-reviewer';
        if (!roster.ok || (explicit ? role !== event.input.task.roleId || role !== 'verifier' && !roster.roster.roles.some(entry => entry.id === role)
          : reviewRoleIdOfRoster(roster.roster) !== event.input.task.roleId)
          || value.graph?.proposalRoster && !equal(value.graph.proposalRoster, { path: roster.path, sha256: roster.sha256 })) {
          return fail('capability-task-role-invalid', '独立验收角色须来自当前已核验名单。');
        }
      }
      if (decision && activeAction(value) === 'confirm-intent') {
        const facts = await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!facts.productIntentId || !facts.intentEntryExists || facts.intentEntryIntentId !== facts.productIntentId
          || !card?.documents.some(item => item.path === facts.productIntentPath)
          || !card.documents.some(item => item.path === facts.intentEntryPath)) {
          return fail('intent-entry-missing', '产品意图缺少匹配的真实意图入口。');
        }
        intentPath = facts.productIntentPath;
      }
      if (event.input.kind === 'task-closed' && event.input.outcome === 'accepted' && activeAction(value) === 'author-intent') {
        const actual = await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!actual.productIntentId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(actual.productIntentId)) {
          return fail('intent-document-invalid', '正式产品意图缺有效 intentId。');
        }
        intentId = actual.productIntentId;
      }
      if (decision && activeAction(value) === 'confirm-proposal') {
        const roster = await loadLatestRoster({ projectRoot: value.projectRoot, flowId: event.flowId, evidenceCollectorRoleId: evidenceAuditConfiguration(value)?.collectorRoleId });
        const documents = card?.documents ?? [];
        const paths = documents.map(item => item.path);
        const approved = ledger.facts(ref.instanceId).findLast(row => row.receipt.state === 'consumed'
          && row.fact.kind === 'capability-event' && row.fact.event.input.kind === 'card-decided'
          && row.fact.event.input.decision === 'approve' && row.fact.key === value.graph?.proofs['intent-approved']);
        const approvedDecision = approved?.fact.kind === 'capability-event' && approved.fact.event.input;
        const approvedPreparation = approvedDecision && approvedDecision.kind === 'card-decided'
          ? ledger.fact(ref.instanceId, 'card-prepared:' + approvedDecision.requestId)?.fact : undefined;
        const approvedIntent = approvedPreparation?.kind === 'capability-event' && approvedPreparation.event.input.kind === 'card-prepared'
          ? approvedPreparation.event.input.card.documents : undefined;
        if (!roster.ok || !documents.some(item => item.path === roster.path && item.sha256 === roster.sha256)
          || ![roster.roster.intent, roster.roster.proposal, roster.roster.architecture].every(path => paths.includes(path))
          || !(roster.roster.modulesDoc ? paths.includes(roster.roster.modulesDoc)
            : paths.some(path => path.startsWith('docs/proposals/' + event.flowId + '-modules-v')))
          || !approvedIntent?.some(item => item.path === roster.roster.intent && documents.some(doc => equal(item, doc)))) {
          return fail('workflow-roster-drift', '任命名单须源自本次经确认的提案。');
        }
        if (decision.decision === 'approve') confirmedRoster = roster;
      }
      if (decision && card) {
        if (!isCurrent?.()) return sourceStale();
        for (const document of card.documents) {
          evidence.push(await this.#capture(value, document));
          if (!isCurrent()) return sourceStale();
        }
        if (card.cardKind === 'intent-confirm' && decision.decision === 'approve') {
          const checked = this.#verifyIntentDecisionCard(card, intentPath, evidence, true);
          if (!checked.ok) return checked;
        }
        if (card.cardKind === 'proposal' && !this.#proposalCardMatchesMaterials(value, card, event.flowId, evidence)) {
          return fail('workflow-proposal-decision-fields-drift', 'A6 定案选项须来自当前正式意图与提案。');
        }
        if (activeAction(value) === 'confirm-appointment') {
          const verified = await this.#verifyActivatedRoleDocuments(value);
          if (!verified.ok) return verified;
        }
      }
      if (event.input.kind === 'task-closed' && event.input.outcome === 'accepted' && activeAction(value) === 'activate-roles') {
        const verified = await this.#verifyActivatedRoleDocuments(value);
        if (!verified.ok) return verified;
      }
      return ledger.transaction(() => {
        if (isCurrent && !isCurrent()) return sourceStale();
        const original = replay(ledger.fact(ref.instanceId, event.key));
        if (original) return original;
        const current = this.#find(ref)!;
        if (!this.#owns(current)) return fail('workflow-owner-conflict', '实例缺当前目录或仓库写占用。');
        if (revisionParksNode(current)) return fail('document-revision-node-parked', '当前节点正在处理内置文件修订。');
        const currentDisposition = a11DispositionProjection(ledger, current);
        if ((blockedRoutingProjection(ledger, current) || currentDisposition?.retest && currentDisposition.state === 'parked')
          && !blockedScopeEvent(event.input) && !this.#a11ParkedParentReport(current, event)) {
          return fail('workflow-blocked-scope-parked', '当前节点等待实际阻塞决定或原授权恢复。');
        }
        if (decision && !equal(current.graph?.card, card)) return sourceStale();
        if (preflight) {
          const rootTreePresent = readdirSync(current.projectRoot).some(entry => entry.toLowerCase() === 'node_modules');
          if (rootTreePresent && preflight.installTarget !== 'assessment-private') {
            return fail('environment-preflight-install-tree-present', '当前工作树已存在 node_modules，保留原目录并继续正式验收。');
          }
          if (!rootTreePresent && preflight.installTarget === 'assessment-private') {
            return fail('environment-preflight-install-tree-changed', '原项目依赖目录状态已变化，需重新核对本次候选的安装位置。');
          }
        }
        const admitted = admitCapability(ledger, current, event, isCurrent !== undefined, trustedEnvironment, trustedBlockedRouting);
        if (!admitted.ok) return admitted;
        if (current.graph && intentId) current.graph.proofs.intentId = intentId;
        if (current.graph && confirmedRoster?.ok && event.input.kind === 'card-decided') {
          current.graph.proposalRoster = { path: confirmedRoster.path, sha256: confirmedRoster.sha256 };
          current.graph.approvedProposalRequestId = event.input.requestId;
          current.graph.expectedRoles = confirmedRoster.roster.roles.map(role => role.id);
          current.graph.roleDocumentPaths = current.graph.expectedRoles.flatMap(id =>
            ['role-card.md', 'boundary.md', 'boundary.yaml'].map(name => '角色卡/' + id + '/' + name));
        }
        for (const item of evidence) ledger.saveEvidence(ref.instanceId, item.ref.sha256, item.bytes);
        ledger.save(current);
        ledger.saveFact(ref.instanceId, storedFact(decision ? { ...fact, decisionRecordedAt: new Date().toISOString() } : fact, admitted.value));
        return admitted;
      });
    } catch (error) { return fail('capability-evidence-invalid', message(error)); }
  }

  completeIntentDecision(ref: DurableInstanceRef, input: DurableDecisionBinding, isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    if (!isCurrent?.() || !validKey(input.requestId) || !hashValid(input.digest) || !Number.isSafeInteger(input.generation)) {
      return Promise.resolve(fail('intent-decision-apply-stale', '原意图确认卡的项目状态已变化。'));
    }
    const { requestId, digest: cardDigest, generation } = input;
    const key = digest(stableJson([ref, requestId, cardDigest, generation]));
    const pending = this.#finishingIntent.get(key);
    if (pending) return pending;
    const operation = this.#completeIntentDecision(ref, input, isCurrent).finally(() => this.#finishingIntent.delete(key));
    this.#finishingIntent.set(key, operation);
    return operation;
  }

  async #completeIntentDecision(ref: DurableInstanceRef, input: DurableDecisionBinding,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const ledger = this.#ledger;
    const id = ref.instanceId;
    const key = 'intent-decision-applied:' + input.requestId;
    const stale = () => fail('intent-decision-apply-stale', '意图写回必须绑定已结算的当前批准请求。');
    const value = this.#find(ref);
    if (!value || !isCurrent()) return stale();
    const previous = ledger.fact(id, key);
    if (previous?.fact.kind === 'intent-decision-applied') {
      return previous.fact.digest === input.digest && previous.fact.generation === input.generation
        && previous.fingerprint === digest(stableJson(previous.fact)) ? ok(previous.receipt) : stale();
    }
    const saved = ledger.fact(id, 'card-decided:' + input.requestId);
    const prepared = ledger.fact(id, 'card-prepared:' + input.requestId);
    const decision = saved?.fact.kind === 'capability-event' ? saved.fact.event.input : undefined;
    const preparation = prepared?.fact.kind === 'capability-event' ? prepared.fact.event : undefined;
    const card = preparation?.input.kind === 'card-prepared' ? preparation.input.card : undefined;
    if (saved?.fact.kind !== 'capability-event' || !saved.fact.decisionRecordedAt || saved.receipt.state !== 'pending'
      || saved.fingerprint !== digest(stableJson(saved.fact)) || !prepared || prepared.receipt.state === 'ignored'
      || prepared.fingerprint !== digest(stableJson(prepared.fact))
      || decision?.kind !== 'card-decided' || decision.decision !== 'approve' || decision.digest !== input.digest
      || decision.generation !== input.generation || card?.cardKind !== 'intent-confirm' || !equal(value.graph?.card, card)
      || !decisionProvenanceMatches(decision.authority, decision.provenance, card)) return stale();
    const { stepId, attempt, flowId } = saved.fact.event;
    const stillCurrent = () => {
      const current = this.#find(ref);
      return isCurrent() && current?.status === 'waiting' && current.stepId === stepId && current.attempt === attempt
        && this.#owns(current) && activeAction(current) === 'confirm-intent' && equal(current.graph?.card, card);
    };
    if (!stillCurrent()) return stale();
    const documentRefs = card.payload?.documentRefs as WorkflowDocumentRef[] | undefined;
    const intentId = card.payload?.intentId;
    if (!Array.isArray(documentRefs) || typeof intentId !== 'string'
      || documentRefs.some(item => !item || typeof item.path !== 'string' || typeof item.sha256 !== 'string')
      || !equal(documentRefs.map(({ path, sha256 }) => ({ path, sha256 })), card.documents)) return stale();
    const at = saved.fact.decisionRecordedAt;
    const provenance = decision.provenance;
    const selected = [...(decision.selected ?? [])];
    const resolved = taskEvent('request.resolved', {
      requestId: input.requestId, decisionId: 'decision-' + input.requestId, workflowId: id, stage: 'A3',
      by: decision.authority === 'delegated-chief' ? 'chief-delegated' : 'customer', cardKind: 'intent-confirm',
      documentRefs, intentId, selectedOptionIds: selected, choice: 'confirm',
      ...(provenance?.source === 'delegated-chief' ? {
        actionSource: { kind: 'chief-delegated', actorRoleId: 'chief', originRoleId: preparation!.source.roleId,
          requestId: input.requestId, baseDigest: provenance.digest, delegationRevision: provenance.delegationRevision,
          disposition: 'select', selected, reason: provenance.reason, at },
      } : {}),
    }, () => new Date(at));
    try {
      const state = await readTaskState(value.projectRoot);
      const mirror = state.events.find(event => event.kind === 'request.resolved' && event.requestId === input.requestId);
      if (mirror && !equal({ ...mirror, at: resolved.at }, resolved)) {
        return fail('intent-decision-mirror-conflict', '意图写回的任务记录与已结算的决定不一致。');
      }
      for (const document of card.documents) {
        await this.#capture(value, document);
        if (!stillCurrent()) return stale();
      }
      const finalized = await this.withDomainOperation(ref, { stepId, attempt, flowId, operation: 'intent-card' },
        () => finalizeIntent({ projectRoot: value.projectRoot, flowId, workflowId: id, event: resolved }));
      if (!finalized.ok) return finalized;
      if (!finalized.value.ok) return fail(finalized.value.code, finalized.value.message);
      if (!stillCurrent()) return stale();
      if (!mirror) {
        const appended = await appendTaskEvent(value.projectRoot, resolved);
        if (!appended.ok) return fail('intent-decision-mirror-failed', appended.message);
      }
      return ledger.transaction(() => {
        if (!stillCurrent() || ledger.fact(id, saved.fact.key)?.fingerprint !== saved.fingerprint) return stale();
        const fact: DurableFact = { kind: 'intent-decision-applied', source: 'host', key, stepId, attempt,
          requestId: input.requestId, digest: input.digest, generation: input.generation, appliedAt: new Date().toISOString() };
        const receipt: DurableFactReceipt = { key, state: 'pending' };
        ledger.saveFact(id, storedFact(fact, receipt));
        return ok(receipt);
      });
    } catch (error) { return fail('intent-decision-apply-failed', message(error)); }
  }

  submit(ref: DurableInstanceRef, fact: DurableFact): Promise<DurableResult<DurableFactReceipt>> {
    return this.#submit(ref, fact);
  }

  decideRelease(ref: DurableInstanceRef, input: DurableReleaseDecisionInput,
    isCurrent: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    if (!isCurrent?.() || !input.provenance || !decisionProvenanceMatches(input.provenance.source, input.provenance, input)) {
      return Promise.resolve(fail('release-decision-authority', '发布决定须来自当前应用确认卡的有权来源。'));
    }
    const { key, stepId, attempt, requestId, digest, generation, action, provenance } = input;
    return this.#submit(ref, { kind: 'release-decision', key, stepId, attempt, requestId, digest, generation, action,
      source: provenance.source, provenance }, isCurrent);
  }

  async #verifyReleaseDecision(value: StoredInstance, fact: Extract<DurableFact, { kind: 'release-decision' }>,
    isCurrent: () => boolean): Promise<DurableResult<true>> {
    const release = value.release;
    const snapshot = release?.snapshot;
    const stale = () => fail('release-preview-drift', '已验收候选、基线、发布证据或当前项目来源已变化。');
    if (value.status !== 'waiting' || !snapshot || !['approve', 'reject'].includes(fact.action)
      || !value.baseline || snapshot.baselineOid !== value.baseline.oid || snapshot.branch !== value.baseline.branch
      || value.implementation?.key !== snapshot.b3CloseKey || !equal(value.implementation.operatorReport, snapshot.operatorReport)) return stale();
    const ledger = this.#ledger;
    const id = value.ref.instanceId;
    const actual = ledger.effects(id).findLast(effect => effect.intent.kind === 'task-commit' && effect.state === 'succeeded'
      && equal(effect.intent.task, value.implementation?.task));
    if (actual?.result?.result?.oid !== snapshot.tipOid) return stale();
    const documents = [snapshot.operatorReport, ...(snapshot.operatorReportArtifacts ?? [])];
    if (evidenceAuditConfiguration(value) || value.scope?.evidenceRequirements?.length) {
      const audit = evidenceAuditProjection(ledger, value);
      if (!audit || audit.state !== 'audited' || !(await this.#verifyCurrentAudit(value, audit)).ok) return stale();
    }
    if (activeAction(value) === 'customer-publish') {
      const recorded = this.listCapabilityEvents(value.ref).findLast(row => row.receipt.state === 'consumed'
        && row.event.input.kind === 'archive-verified' && row.event.input.tipOid === snapshot.tipOid)?.event.input;
      if (recorded?.kind !== 'archive-verified' || !equal(recorded.archive, snapshot.acceptanceArchive)
        || !equal(recorded.archive, value.graph?.acceptanceArchive)) return stale();
      documents.push(recorded.criteria, recorded.report, recorded.archive);
    }
    try {
      for (const document of documents) {
        await this.#capture(value, document);
        if (!isCurrent()) return stale();
      }
      const protection = await readGitProtectionFacts(value.projectRoot);
      if (!isCurrent() || !checkGitProtectionFactsCurrent(protection)) return stale();
      const [branch, tip, main, dirty] = await Promise.all([
        gitRead(value.projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        gitRead(value.projectRoot, ['rev-parse', '--verify', 'HEAD']),
        gitRead(value.projectRoot, ['rev-parse', '--verify', 'refs/heads/main']),
        gitRead(value.projectRoot, ['status', '--porcelain=v1', '-uno']),
      ]);
      return isCurrent() && branch === snapshot.branch && tip === snapshot.tipOid && main === snapshot.mainOid && !dirty
        ? ok(true) : stale();
    } catch { return stale(); }
  }

  async #submit(ref: DurableInstanceRef, fact: DurableFact, isCurrent?: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
    const ledger = this.#ledger;
    const replay = (): DurableResult<DurableFactReceipt> | undefined => {
      const original = ledger.fact(ref.instanceId, fact.key);
      if (!original) return undefined;
      const normalizedLegacyCustomer = fact.kind === 'release-decision' && fact.source === 'customer'
        && fact.provenance?.source === 'customer' && original.fact.kind === 'release-decision'
        && original.fact.source === 'customer' && original.fact.provenance === undefined
        && original.fingerprint === digest(stableJson({ ...fact, provenance: undefined }));
      return normalizedLegacyCustomer || original.fingerprint === digest(stableJson(fact)) ? ok(original.receipt)
        : fail('fact-key-conflict', '同一业务事实键已绑定不同内容。');
    };
    const trustedRelease = fact.kind === 'release-decision' && isCurrent !== undefined;
    const stale = () => fail('release-decision-stale', '当前发布卡、项目来源或委托已变化。');
    if (trustedRelease && !isCurrent()) return stale();
    if (fact.kind === 'release-decision') {
      const checked = factShape(value, fact, trustedRelease);
      if (!checked.ok) return checked;
    }
    const original = replay();
    if (original) return original;
    const shape = factShape(value, fact, trustedRelease);
    if (!shape.ok) return shape;
    if (trustedRelease) {
      const release = value.release;
      if (!this.#owns(value) || !release || value.stepId !== fact.stepId || value.attempt !== fact.attempt
        || release.requestId !== fact.requestId || release.digest !== fact.digest || release.generation !== fact.generation) return stale();
      const checked = await this.#verifyReleaseDecision(value, fact, isCurrent);
      if (!checked.ok) return checked;
    } else if (fact.kind === 'release-decision' && workflowOwnsDispatch(value)) {
      return fail('release-decision-authority', '当前发布须通过应用确认卡提交决定。');
    }
    const evidence: Evidence[] = [];
    if (fact.attempt === value.attempt && value.status === 'waiting') {
      try {
        if (fact.kind === 'task-report' || fact.kind === 'operator-report') evidence.push(await this.#capture(value, fact.evidence));
        if (fact.kind === 'implementation-accepted') evidence.push(await this.#capture(value, fact.operatorReport));
        if (fact.kind === 'release-preview') {
          if (evidenceAuditConfiguration(value) || value.scope?.evidenceRequirements?.length) {
            const audit = evidenceAuditProjection(ledger, value);
            if (!audit || audit.state !== 'audited') return fail('evidence-audit-publish-held', '发布等候当前证据链的正式审计。');
            const checked = await this.#verifyCurrentAudit(value, audit);
            if (!checked.ok) return checked;
          }
          const body = this.getEvidence(ref, fact.snapshot.operatorReport) as { artifacts?: readonly DurableEvidenceRef[] } | undefined;
          const original = body?.artifacts ?? [];
          const artifacts = fact.snapshot.operatorReportArtifacts ?? [];
          const originalPaths = [...new Set(original.map(item => item.path))].sort();
          const submittedPaths = artifacts.map(item => item.path).sort();
          if (artifacts.length > 32 || !equal(originalPaths, submittedPaths)) {
            return fail('release-evidence-paths-mismatch', '发布证据须覆盖已收口报告中记录的工件路径。');
          }
          for (const artifact of artifacts) evidence.push(await this.#capture(value, artifact));
          if (fact.snapshot.acceptanceArchive) evidence.push(await this.#capture(value, fact.snapshot.acceptanceArchive));
        }
        if (fact.kind === 'b3-advance') {
          if (!value.baseline || !value.analysisReport) return fail('b2-prerequisite-missing', '尚无本次 B1 报告与基线。');
          await this.#capture(value, value.analysisReport.evidence);
          const [branch, head] = await Promise.all([
            gitRead(value.projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
            gitRead(value.projectRoot, ['rev-parse', '--verify', 'HEAD']),
          ]);
          if (branch !== value.baseline.branch || head !== value.baseline.oid) return fail('b2-baseline-drift', '本次 B1 的任务分支或基线已漂移。');
          if (value.definition.schema === 2) {
            const original = value.graph?.existingRequest;
            if (original?.input.kind !== 'stage-request' || original.flowId !== fact.dispatch?.flowId || !original.input.existingPaths?.length) {
              return fail('workflow-existing-purpose-unverified', '派发缺少本次经核验的既有实现变更。');
            }
            if (!await trackedFiles(value.projectRoot, head, fact.candidates)) {
              return fail('b2-existing-paths-unverified', 'B3 候选须落在经核验的现有已追踪文件。');
            }
          }
          const startRequest = ledger.facts(ref.instanceId).find(item => item.fact.kind === 'stage-request'
            && item.fact.attempt === fact.b1Attempt && item.receipt.state === 'consumed')?.fact;
          if (startRequest?.kind === 'stage-request' && startRequest.dispatch.flowId !== fact.dispatch?.flowId) {
            return fail('b2-flow-mismatch', 'B3 advance 须沿用本次 B1 的真实阶段请求归属。');
          }
          const verified = await deriveDurablePathBWriteSets({
            projectRoot: value.projectRoot, flowId: value.metadata.flowId ?? fact.dispatch?.flowId ?? 'default', scopeFiles: fact.candidates,
          });
          if (!verified.ok) return verified;
          if (!equal(verified.writesets, fact.writeSets)) return fail('b2-write-set-mismatch', 'B3 写集须匹配现有角色名单与边界。');
        }
      } catch (error) {
        return fail('fact-evidence-invalid', message(error));
      }
    }
    try {
      return ledger.transaction(() => {
        if (trustedRelease && !isCurrent()) return stale();
        const previous = replay();
        if (previous) return previous;
        const current = this.#find(ref)!;
        if (trustedRelease && (!this.#owns(current) || !equal(current.release?.snapshot, value.release?.snapshot)
          || current.release?.requestId !== fact.requestId)) return stale();
        const admitted = admitFact(ledger, current, fact);
        if (!admitted.ok) return admitted;
        const { noWrite, ...receipt } = admitted.value;
        if (noWrite) return ok(receipt);
        const stored = storedFact(fact, receipt);
        const savedAt = new Date().toISOString();
        const newScope = fact.kind === 'b3-advance' && receipt.state === 'pending';
        const newDelivery = fact.kind === 'release-merged' && receipt.state === 'pending';
        const scope = newScope ? scopeDecisionFor(ledger, current, stored, savedAt, savedAt) : undefined;
        const delivery = newDelivery ? deliveryFor(ledger, current, stored, savedAt) : undefined;
        if (newScope && !scope) return fail('scope-audit-evidence-invalid', '无法将 B2 决定绑定到持久的 B1 证据与原 B3 请求。');
        if (newDelivery && !delivery) return fail('delivery-evidence-invalid', '合并回执与已批准的交付证据不一致。');
        if (delivery) delete current.businessReason;
        for (const item of evidence) ledger.saveEvidence(ref.instanceId, item.ref.sha256, item.bytes);
        ledger.save(current);
        ledger.saveFact(ref.instanceId, stored);
        if (scope) ledger.saveScopeDecision(ref.instanceId, scope);
        if (delivery) ledger.saveDelivery(ref.instanceId, fact.key, delivery);
        return ok(receipt);
      });
    } catch (error) {
      return fail('fact-write-failed', message(error));
    }
  }

  acknowledgeDelivery(ref: DurableInstanceRef, input: { deliveryId: string; requestId: string }): DurableResult<DurableDelivery> {
    const ledger = this.#ledger;
    try {
      return ledger.transaction(() => {
        const instance = this.#find(ref);
        if (!instance) return fail('workflow-not-found', '作用域与已有实例不匹配。');
        const delivery = ledger.delivery(ref.instanceId);
        if (!delivery || delivery.id !== input.deliveryId || delivery.releaseRequestId !== input.requestId
          || instance.release?.requestId !== input.requestId) {
          return fail('delivery-note-not-found', '交付说明与本次实例及发布请求不匹配。');
        }
        if (delivery.state === 'delivered') return ok(delivery);
        ledger.saveDeliveryReceipt(delivery.id, new Date().toISOString());
        return ok(ledger.delivery(ref.instanceId)!);
      });
    } catch (error) {
      return fail('delivery-receipt-write-failed', message(error));
    }
  }

  listFacts(ref: DurableInstanceRef): readonly { fact: DurableFact; receipt: DurableFactReceipt }[] {
    return this.#find(ref) ? this.#ledger.facts(ref.instanceId).map(({ fact, receipt }) => ({ fact, receipt })) : [];
  }

  listEffects(ref: DurableInstanceRef, kind?: DurableEffect): DurableEffectRecord[] {
    if (!this.#find(ref)) return [];
    return this.#ledger.effects(ref.instanceId).filter(effect => !kind || effect.intent.kind === kind);
  }

  claimEffect(ref: DurableInstanceRef, intent: DurableEffectIntent): DurableResult<DurableEffectClaim> {
    if (intent.kind === 'a11-index-recovery') return fail('workflow-a11-recovery-claim-invalid', '索引恢复需要实际保留 Git 验证锁的应用入口。');
    return this.#ledger.transaction(() => {
      const value = this.#find(ref);
      if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
      if (value.status === 'waiting' && !this.#owns(value)) return fail('workflow-owner-conflict', '当前实例缺仓库持久所有权。');
      if (intent.task) {
        const missing = this.#ledger.fact(ref.instanceId, 'environment-missing:' + intent.task.taskId);
        const fact = missing?.fact;
        if (missing?.receipt.state !== 'ignored' && fact?.kind === 'capability-event' && fact.event.input.kind === 'environment-missing'
          && fact.event.input.missing.origin === 'preflight' && sameTask(intent.task, fact.event.input.missing.basis.assessmentTask)) {
          return fail('environment-preflight-assessment-retired', '本次独立验收已由应用前检转交环境恢复。');
        }
      }
      return takeEffect(this.#ledger, value, intent);
    });
  }

  claimA11RecoveryEffect(ref: DurableInstanceRef, intent: DurableEffectIntent,
    isCurrent: () => boolean): Promise<DurableResult<DurableEffectClaim>> {
    return this.#claimA11RecoveryEffect(ref, intent, isCurrent, false);
  }

  retryA11RecoveryEffect(ref: DurableInstanceRef, intent: DurableEffectIntent,
    isCurrent: () => boolean): Promise<DurableResult<DurableEffectClaim>> {
    return this.#claimA11RecoveryEffect(ref, intent, isCurrent, true);
  }

  async #claimA11RecoveryEffect(ref: DurableInstanceRef, intent: DurableEffectIntent,
    isCurrent: () => boolean, retry: boolean): Promise<DurableResult<DurableEffectClaim>> {
    const value = this.#find(ref);
    const disposition = value && a11DispositionProjection(this.#ledger, value);
    const invalid = () => fail('workflow-a11-recovery-claim-invalid', '索引恢复未绑定当前 Git 保留、实施工单和原批准依据。');
    if (!value || !disposition || !this.#a11Current(value, disposition, isCurrent) || !a11RecoveryClaimMatches(disposition, intent)
      || (await this.#a11StandardObservation(value, disposition.standard)).standardState !== 'verified') return invalid();
    const authority = await this.#verifyImplementationAuthority(value);
    if (!authority.ok) return authority;
    return this.#ledger.transaction(() => {
      const current = this.#find(ref);
      if (!current || !this.#a11Current(value, disposition, isCurrent)
        || !equal(a11DispositionProjection(this.#ledger, current), disposition)) return invalid();
      const scope = blockedRoutingProjection(this.#ledger, current);
      if (!scope || scope.decision?.option === 'stop' || disposition.confirmation && scope.decision?.option !== 'wait'
        || intent.stepId !== current.stepId || intent.attempt !== current.attempt) return invalid();
      if (!retry) return takeEffect(this.#ledger, current, intent);
      const previous = this.#ledger.effect(ref.instanceId, intent.key);
      const stableIntent = (candidate: DurableEffectIntent) => ({ ...candidate,
        expected: { ...candidate.expected, lockPid: undefined, lockFileId: undefined } });
      if (!previous || previous.state === 'succeeded' || !equal(stableIntent(previous.intent), stableIntent(intent))) return invalid();
      this.#ledger.saveEffect(ref.instanceId, { ...previous, intent, state: 'claimed', result: undefined });
      return ok({ key: intent.key, token: previous.token, state: 'claimed', execute: true });
    });
  }

  settleEffect(ref: DurableInstanceRef, outcome: DurableEffectOutcome): DurableResult<DurableEffectClaim> {
    return this.#ledger.transaction(() => {
      const value = this.#find(ref);
      return value ? settleEffect(this.#ledger, value, outcome) : fail('workflow-not-found', '作用域与已有实例不匹配。');
    });
  }

  /** The application supplies a live isolated browser lease and owns the original capture files. */
  async settleAcceptanceBrowserCapture(ref: DurableInstanceRef, outcome: DurableEffectOutcome,
    isCurrent: () => boolean): Promise<DurableResult<DurableEffectClaim>> {
    const invalid = () => fail('acceptance-browser-capture-invalid', '真实浏览器回执缺当前应用会话、输入时间序列或截图原件。');
    if (!isCurrent() || outcome.outcome !== 'succeeded') return invalid();
    const value = this.#find(ref);
    const effect = this.#ledger.effect(ref.instanceId, outcome.key);
    const receiptId = outcome.result?.receiptId;
    const workspace = value && acceptanceWorkspaceProjection(this.#ledger, value);
    if (!value || !workspace?.binding || effect?.intent.kind !== 'acceptance-workspace-browser-capture'
      || effect.token !== outcome.token || typeof receiptId !== 'string' || !hashValid(receiptId)) return invalid();
    try {
      const receipt = this.getEvidence(ref, { path: 'ans-evidence/' + receiptId, sha256: receiptId }) as DurableAcceptanceWorkspaceBrowserCaptureReceipt | undefined;
      if (receipt?.kind !== 'acceptance-workspace-browser-capture' || !equal(receipt.binding, workspace.binding)
        || !isBrowserCaptureArtifact(workspace.binding, receipt.events, 'json') || !Array.isArray(receipt.screenshots)
        || receipt.screenshots.length > 4 || !receipt.screenshots.every(file => isBrowserCaptureArtifact(receipt.binding, file, 'png'))) return invalid();
      const read = async (file: DurableEvidenceRef) => {
        const path = join(value.projectRoot, file.path);
        const before = await lstat(path, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n || relative(path, await realpath(path)) !== '') throw new Error('capture file identity');
        const evidence = await this.#capture(value, file);
        const after = await lstat(path, { bigint: true });
        if (!after.isFile() || after.nlink !== 1n || before.ino !== after.ino || before.dev !== after.dev || before.mtimeNs !== after.mtimeNs
          || before.ctimeNs !== after.ctimeNs || before.size !== after.size || relative(path, await realpath(path)) !== '') throw new Error('capture file drift');
        return evidence;
      };
      const [events, ...shots] = await Promise.all([read(receipt.events), ...receipt.screenshots.map(read)]);
      if (!events || events.bytes.length > 128 * 1024 || !verifyBrowserCaptureEvents(receipt, events.bytes)
        || shots.some(shot => shot.bytes.length < 33 || shot.bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
          || shot.bytes.subarray(12, 16).toString('ascii') !== 'IHDR')) return invalid();
      return this.#ledger.transaction(() => {
        if (!isCurrent()) return invalid();
        const current = this.#find(ref);
        if (!current || !this.#owns(current)) return invalid();
        const settled = settleEffect(this.#ledger, current, outcome, true);
        if (settled.ok) for (const item of [events, ...shots]) this.#ledger.saveEvidence(ref.instanceId, item.ref.sha256, item.bytes);
        return settled;
      });
    } catch { return invalid(); }
  }

  block(ref: DurableInstanceRef, code: string, detail: string): void {
    this.#ledger.transaction(() => {
      const value = this.#find(ref);
      if (!value || value.status !== 'waiting') return;
      value.businessReason = code + ': ' + detail;
      this.#ledger.save(value);
    });
  }

  async #verifyActivatedRoleDocuments(value: StoredInstance): Promise<DurableResult<true>> {
    const graph = value.graph;
    if (!graph?.expectedRoles?.length || !graph.expectedRoles.every(role => graph.activatedRoles?.includes(role))) {
      return fail('workflow-required-roles-incomplete', '批准名单中的必需角色尚未全部激活。');
    }
    const activations = this.listCapabilityEvents(value.ref).filter(row => row.receipt.state !== 'ignored'
      && row.event.input.kind === 'role-activated' && row.event.input.proposalRequestId === graph.approvedProposalRequestId);
    try {
      for (const role of graph.expectedRoles) {
        const activation = activations.find(row => row.event.input.kind === 'role-activated' && row.event.input.roleId === role)?.event.input;
        if (activation?.kind !== 'role-activated') {
          return fail('workflow-required-role-unverified', '缺少已批准角色的激活记录：' + role);
        }
        await Promise.all(activation.documents.map(document => this.#captureEffective(value, document)));
      }
    } catch {
      return fail('workflow-role-documents-drift', '已激活角色的角色卡或边界文件缺失或与批准字节不一致。');
    }
    return ok(true);
  }

  async withDomainOperation<T>(ref: DurableInstanceRef, request: DurableDomainRequest, operation: () => Promise<T>): Promise<DurableResult<T>> {
    const value = this.#find(ref);
    const graph = value?.graph;
    if (!value || !graph || !this.#owns(value) || value.status !== 'waiting' || graph.flowId !== request.flowId || revisionParksNode(value)
      || value.engine === 'incompatible' || value.engine === 'history-missing') {
      return fail('workflow-domain-not-open', '该实例没有当前可信业务操作。');
    }
    const step = value.definition.steps[request.stepId];
    const action = step && 'action' in step ? step.action : undefined;
    const descriptor = action && capabilities[action];
    const active = value.stepId === request.stepId && value.attempt === request.attempt;
    const task = graph.tasks.find(item => item.taskId === request.taskId && item.stepId === request.stepId
      && item.attempt === request.attempt && !item.outcome);
    const close = request.operation === 'close-task' && !!task && !!task.report;
    const opening = active && descriptor && descriptor.domain === request.operation;
    if (!descriptor || !descriptor.stage || !(opening || close && action === 'independent-standard')
      || request.operation === 'close-task' && !close) return fail('workflow-domain-not-open', '原业务操作未绑定当前能力和实际任务。');
    if (evidenceAuditConfiguration(value) && request.operation === 'archive-acceptance') {
      const audit = evidenceAuditProjection(this.#ledger, value);
      if (!audit || audit.state !== 'audited') return fail('evidence-audit-archive-held', '归档等候当前证据链的正式审计。');
      const checked = await this.#verifyCurrentAudit(value, audit);
      if (!checked.ok) return checked;
    }
    const expectedEffect = request.operation === 'team-baseline' ? 'baseline'
      : request.operation === 'activate-roles' ? 'role-activation'
        : request.operation === 'archive-acceptance' ? 'acceptance-archive' : undefined;
    if (request.reconcileEffectKey && request.operation !== 'team-baseline') {
      return fail('workflow-domain-effect-missing', '该兼容操作没有待核对的恢复入口。');
    }
    if (expectedEffect && !this.#ledger.effects(ref.instanceId).some(effect => effect.intent.kind === expectedEffect
      && effect.intent.stepId === request.stepId && effect.intent.attempt === request.attempt
      && (request.reconcileEffectKey ? request.reconcileEffectKey === effect.intent.key && ['claimed', 'unknown'].includes(effect.state)
        : effect.state === 'claimed') && (!request.taskId || effect.intent.task?.taskId === request.taskId))) {
      return fail('workflow-domain-effect-missing', '业务兼容校验须发生在同一已认领作用内。');
    }
    const prior: [string, WorkflowStage][] = [
      ['product-ready', 'A1'], ['intent-written', 'A2'], ['intent-approved', 'A3'], ['plan-ready', 'A4'],
      ['proposal-written', 'A5'], ['proposal-approved', 'A6'], ['personnel-ready', 'A7'], ['roles-active', 'A8'],
      ['team-plan', 'A9'], ['appointed', 'A10'], ['implementation', 'A11'], ['assessment', 'A12b'],
    ];
    const appointment = request.operation === 'appointment-card';
    if (appointment && (!value.baseline || !value.commonDir || !graph.proofs['team-plan'] || !graph.proposalRoster)) {
      return fail('workflow-appointment-not-open', '任命卡缺少本次已核验的团队计划、仓库基线或名单。');
    }
    if (opening && action === 'confirm-intent') {
      const checked = await this.prepareDirectIntentGate(ref);
      if (!checked.ok) return checked;
    }
    if (request.operation === 'team-baseline' || appointment) {
      const verified = await this.#verifyActivatedRoleDocuments(value);
      if (!verified.ok) return verified;
    }
    const previousStage = appointment ? 'A9' : opening && action === 'confirm-intent' && !graph.card ? 'A2' : undefined;
    const stage = previousStage ?? descriptor.stage;
    const view = domainWorkflowView(ref.instanceId, request.flowId, stage, request.attempt,
      prior.filter(([proof]) => graph.proofs[proof]).map(([, priorStage]) => priorStage), previousStage ? 'completed' : 'requested');
    const at = new Date().toISOString();
    const events: WorkflowEvent[] = [{ v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, idempotencyKey: 'domain:' + ref.instanceId,
      kind: 'workflow.started', workflowId: ref.instanceId, flowId: request.flowId, path: view.path,
      trigger: { by: 'chief', reason: 'Durable application validation' }, sourceTaskId: ref.instanceId }];
    const facts = this.listCapabilityEvents(ref);
    for (const row of facts) {
      if (row.receipt.state !== 'consumed' || row.event.input.kind !== 'role-activated') continue;
      const input = row.event.input;
      const roster = graph.proposalRoster;
      if (!roster) continue;
      const effect = this.#ledger.effect(ref.instanceId, row.event.key);
      const activationKey = effect?.result?.result?.activationKey;
      if (typeof activationKey !== 'string') continue;
      events.push({ ...events[0]!, kind: 'role.activated', idempotencyKey: activationKey, roleId: input.roleId,
        roster, decisionRef: 'decision-' + input.proposalRequestId, documents: [...input.documents] });
    }
    view.activatedRoleIds = graph.activatedRoles?.slice();
    return ok(await withWorkflowValidation({ projectRoot: value.projectRoot, operation: request.operation, view, events }, operation));
  }

  taskGitScope(ref: DurableInstanceRef, taskId: string, roleId: string): {
    taskId: string; workflowId: string; branch: string; paths: string[];
  } | undefined {
    const value = this.#find(ref);
    if (!value || value.status !== 'waiting' || !value.baseline || !this.#owns(value) || revisionParksNode(value) || a11DispositionProjection(this.#ledger, value)?.state === 'parked'
      || value.engine === 'incompatible' || value.engine === 'history-missing') return undefined;
    const retest = a11DispositionProjection(this.#ledger, value);
    if (retest?.retest && retest.childTask.taskId === taskId) return undefined;
    if (activeAction(value) === 'governed-implementation' || activeAction(value) === 'operations-implementation') {
      const task = value.graph?.tasks.find(item => item.taskId === taskId && item.roleId === roleId);
      const paths = graphImplementationPaths(value, task);
      return paths.length ? { taskId, workflowId: ref.instanceId, branch: value.baseline.branch, paths: [...paths] } : undefined;
    }
    if (activeAction(value) !== 'b3-implement-and-accept' || value.task?.taskId !== taskId || value.task.roleId !== roleId) return undefined;
    const scope = value.scope?.writeSets.find(set => set.roleId === roleId);
    if (!scope?.paths.length) return undefined;
    const binding = this.#ledger.facts(ref.instanceId).find(item => item.fact.kind === 'task-bound' && item.fact.task.taskId === taskId)?.fact;
    const paths = binding?.kind === 'task-bound' ? binding.modulePaths?.filter(path => scope.paths.includes(path)) : undefined;
    return paths?.length ? { taskId, workflowId: ref.instanceId, branch: value.baseline.branch, paths: [...paths] } : undefined;
  }

  taskWriteScope(ref: DurableInstanceRef, taskId: string, roleId: string): readonly string[] | undefined {
    const git = this.taskGitScope(ref, taskId, roleId);
    if (git) return git.paths;
    const value = this.#find(ref);
    const task = value?.graph?.tasks.find(item => item.roleId === roleId && item.taskId === taskId && item.state === 'pending');
    if (!value || !task || value.status !== 'waiting' || !this.#owns(value) || revisionParksNode(value) || a11DispositionProjection(this.#ledger, value)?.state === 'parked'
      || value.engine === 'incompatible' || value.engine === 'history-missing') return undefined;
    const retest = a11DispositionProjection(this.#ledger, value);
    if (retest?.retest && retest.childTask.taskId === taskId) return undefined;
    if (task.stepId !== value.stepId && (task.capability !== 'independent-standard' || task.baselineOid !== value.baseline?.oid
      || task.bindingKey !== value.graph?.proofs['standard-open'])) return undefined;
    return task.evidenceWorkOrder?.writePaths ?? (task.reviewWritePath ? [task.reviewWritePath] : graphDocumentRoots(task.capability));
  }

  async checkExistingBaseline(ref: DurableInstanceRef): Promise<DurableResult<true>> {
    const value = this.#find(ref);
    const graph = value?.graph;
    if (!value || !graph?.existingRequest || activeAction(value) !== 'prepare-existing-branch' || !this.#owns(value)) {
      return fail('baseline-not-open', '既有模块尚未核验。');
    }
    try {
      const protection = await readGitProtectionFacts(value.projectRoot);
      if (!checkGitProtectionFactsCurrent(protection)) return fail('workflow-git-protection-unavailable', protection.reasons.join('；'));
      const [head, status] = await Promise.all([gitRead(value.projectRoot, ['rev-parse', '--verify', 'HEAD']),
        gitRead(value.projectRoot, ['status', '--porcelain=v1', '-uno'])]);
      const current = this.#find(ref);
      return current?.stepId === value.stepId && current.attempt === value.attempt && this.#owns(current)
          && head === graph.observedHead && status === graph.observedStatus && status === ''
        ? ok(true) : fail('workflow-existing-baseline-drift', '已观察 HEAD 或工作区已变化，须核对实际 Git 状态后重试。');
    } catch (error) { return fail('workflow-existing-baseline-drift', message(error)); }
  }

  checkCompatibility(contracts: readonly { executor: string; activityContract: number }[]): string | undefined {
    for (const value of this.#ledger.active()) {
      if (!this.#owns(value)) return '在途实例缺仓库持久所有权：' + value.ref.instanceId;
      const { digest: storedDigest, ...definition } = value.definition;
      if (!contracts.some(contract => contract.executor === value.ref.executor && contract.activityContract === value.ref.activityContract)
        || storedDigest !== value.ref.definitionDigest || digest(stableJson(definition)) !== storedDigest) {
        return '无法注册在途实例需要的工作流或活动契约：' + value.ref.executor + '/' + value.ref.activityContract;
      }
    }
    return undefined;
  }

  engineStatus(status: DurableProjection['engine'], reason?: string, ref?: DurableInstanceRef): void {
    this.#ledger.transaction(() => {
      for (const value of this.#ledger.active()) {
        if (ref && !sameInstance(ref, value.ref)) continue;
        if (value.engine === 'history-missing' && status === 'offline') continue;
        value.engine = status;
        value.engineReason = reason;
        this.#ledger.save(value);
      }
    });
  }

  engineInputs(): { ref: DurableInstanceRef; definition: DurableDefinitionSnapshot; scheduled: boolean; scheduling: boolean }[] {
    return this.#ledger.active().flatMap(value => {
      if (!this.#owns(value)) {
        this.engineStatus('history-missing', '当前实例缺仓库持久所有权。', value.ref);
        return [];
      }
      const { ref, definition, scheduled, scheduling } = value;
      return [{ ref, definition, scheduled, scheduling }];
    });
  }

  markScheduling(ref: DurableInstanceRef, scheduled: boolean): void {
    this.#ledger.transaction(() => {
      const value = this.#find(ref);
      if (!value) return;
      value.scheduling = !scheduled;
      value.scheduled = scheduled;
      this.#ledger.save(value);
    });
  }

  async prepareA11BlockedReduction(input: ActivityInput): Promise<void> {
    const value = this.#find(input.ref);
    if (!value || value.status !== 'waiting' || value.engine !== 'healthy' || input.stepId !== value.stepId || input.entry !== value.entry
      || activeAction(value) !== 'operations-implementation' || !blockedRoutingEnabled(value) || a11DispositionProjection(this.#ledger, value)?.state === 'parked') return;
    const children = implementationChildren(value).filter(child => !child.outcome);
    if (children.length !== 1 || children[0]?.state !== 'reported') return;
    const child = children[0];
    const parent = value.graph?.tasks.find(task => task.taskId === child.task.parentTaskId && task.report);
    const report = parent?.report && this.getEvidence(input.ref, parent.report.evidence) as
      { report?: { status?: string; origin?: string } } | undefined;
    if (report?.report?.status !== 'blocked' || report.report.origin !== 'submitted-report') return;
    const candidate = this.#ledger.effects(input.ref.instanceId).find(effect => effect.intent.kind === 'task-commit'
      && effect.state === 'succeeded' && sameTask(effect.intent.task, child.task));
    if (!candidate) return;
    const read = (...args: string[]) => gitRead(value.projectRoot, ['--no-optional-locks', ...args]).catch(() => undefined);
    const [head, branch, staged, dirty, indexPath] = await Promise.all([
      read('rev-parse', '--verify', 'HEAD'), read('symbolic-ref', '--short', 'HEAD'),
      read('diff', '--cached', '--name-only', '-z'), read('diff', '--name-only', '-z'),
      read('rev-parse', '--path-format=absolute', '--git-path', 'index'),
    ]);
    const indexLock = indexPath ? await lstat(indexPath + '.lock').then(() => '实际索引锁待核对。', (error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? undefined : '实际索引锁状态无法读取。') : undefined;
    const lock = indexLock ?? (staged === undefined || dirty === undefined ? '当前 Git 索引或工作区无法读取。' : undefined);
    if (!lock && !staged && !dirty && head === candidate.result?.result?.oid && branch === value.baseline?.branch) return;
    const observed: DurableA11GitObservation = { head, branch, lock, stagedPaths: (staged ?? '').split('\0').filter(safePath).slice(0, 256),
      trackedDirty: !!dirty, reason: '正式运营阻塞报告已保存，实际 Git 收口条件需要核对。' };
    await this.parkA11Disposition(input.ref, { childTask: child.task, observation: observed }, () => {
      const current = this.#find(input.ref);
      return current?.stepId === input.stepId && current.entry === input.entry && current.engine === 'healthy'
        && a11DispositionProjection(this.#ledger, current)?.state !== 'parked'
        && current.graph?.tasks.some(task => task.taskId === child.task.parentTaskId && task.report?.key === parent?.report?.key) === true;
    });
  }

  apply(input: ActivityInput): ActivityOutcome {
    const ledger = this.#ledger;
    const next = ledger.transaction(() => {
      const value = this.#find(input.ref);
      if (!value) throw new Error('工作流活动引用未知实例。');
      const key = 'apply:' + input.entry + ':' + input.turn;
      const existing = ledger.activity<ActivityOutcome>(value.ref.instanceId, key);
      if (existing) return { value, existing };
      if (value.status === 'waiting' && !this.#owns(value)) throw new Error('当前实例缺仓库持久所有权。');
      const outcome = value.definition.schema === 2 ? applyGraph(ledger, value, input) : applyStep(ledger, value, input);
      ledger.save(value);
      ledger.saveActivity(value.ref.instanceId, key, outcome);
      return { value, existing: outcome };
    });
    if (next.value.status !== 'waiting') {
      const value = next.value;
      const owner = { engine: 'dapr' as const, dataDir: ledger.dataDir, instanceId: value.ref.instanceId };
      if (value.definition.schema === 1) releaseOwner(value, owner, ownerSlot(value.definition.id));
      if (value.definition.schema === 2 && !ledger.effects(value.ref.instanceId).some(item => requiresEffectResolution(ledger, value, item))) {
        if (value.commonDir) releaseOwner(value, owner);
        const directory = workspaceOwner(value.projectRoot);
        if (directory?.engine === owner.engine && directory.dataDir === owner.dataDir && directory.instanceId === owner.instanceId) {
          changeWorkspaceOwner(value.projectRoot, directory, false);
        }
      }
    }
    return next.existing;
  }

  pendingOutbox(): OutboxItem[] { return this.#ledger.outbox(Date.now()); }
  postponeOutbox(item: OutboxItem, accepted: boolean): void { this.#ledger.postponed(item, accepted); }
}
