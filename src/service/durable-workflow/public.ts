import { dirname } from 'node:path';
import { DURABLE_ACTIVITY_CONTRACT, DURABLE_EXECUTOR, DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR } from '../../model/durable-workflow.ts';
import type {
  DurableCapabilityEvent, DurableDefinitionSelection, DurableDefinitionSnapshot, DurableDelivery, DurableDomainRequest, DurableEffect, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableEffectRecord,
  DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableInstanceRef, DurableOwner, DurableProjection, DurableResult, DurableStartInput,
} from '../../model/durable-workflow.ts';
import {
  changeWorkspaceOwner, DurableLedger, definitionFiles, digest, gitRead, pinRepositoryDefinition, readImportedDefinition, readProjectFile, releaseOwner,
  repositoryIdentity, repositoryOwner, reserveOwnerState, reserveWorkspace, saveDefinitionFile, stableJson, workspaceIdentity, workspaceOwner,
} from '../../provider/durable-workflow/public.ts';
import type { OutboxItem, StoredInstance, WorkspaceIdentity, WorkspaceReservation } from '../../provider/durable-workflow/public.ts';
import { checkGitProtectionFactsCurrent, readGitProtectionFacts } from '../../provider/trunk/public/trunk-store.ts';
import { deriveDurablePathBWriteSets, readWorkflowLedger } from '../../common/编排/workflow-service.ts';
import { loadLatestRoster, reviewRoleIdOfRoster } from '../../common/编排/workflow-preconditions.ts';
import { domainWorkflowView, withWorkflowValidation } from '../../common/编排/workflow-state.ts';
import { WORKFLOW_LEDGER_SCHEMA } from '../../model/runtime.ts';
import type { WorkflowEvent, WorkflowStage } from '../../model/runtime.ts';
import { readIntentEntryFacts } from '../../common/shared/intent-entry-contract.ts';
import { parseDefinition } from './definition.ts';
import { capabilities, graphNeedsWrite } from './capabilities.ts';
import { admitCapability, applyGraph, capabilityEvidence, graphCardDigest } from './path-a.ts';
import { graphDocumentRoots, graphImplementationPaths, requiresEffectResolution, takeEffect, settleEffect } from './effects.ts';
import { admitFact, deliveryFor, scopeDecisionFor, storedFact } from './facts.ts';
import { activeAction, applyStep, equal, factShape, fail, hashValid, liveEffect, oidValid, ok, project as baseProjection, safePath, sameInstance, validKey } from './rules.ts';
import type { ActivityInput, ActivityOutcome } from './rules.ts';

export type { ActivityInput, ActivityOutcome } from './rules.ts';
export { parseDefinition } from './definition.ts';

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
const ownerSlot = (definitionId: string): string => definitionId === 'path-b' ? 'path-b' : 'read-only:' + definitionId;
const fingerprintStart = (input: DurableStartInput) => digest(stableJson([
  input.definitionId, input.source ?? null, input.expectedDigest ?? null, input.customerPurpose ?? null, input.metadata ?? {},
]));

async function trackedFiles(projectRoot: string, head: string, files: readonly string[]): Promise<boolean> {
  if (!oidValid(head) || files.some(file => !safePath(file))) return false;
  const entries = await Promise.all(files.map(file => gitRead(projectRoot, ['ls-tree', '-z', '--full-tree', head, '--', ':(literal)' + file])));
  return entries.every(entry => /^100(?:644|755) blob [a-f0-9]{40,64}\t/.test(entry) && entry.endsWith('\0'));
}

function project(ledger: DurableLedger, value: StoredInstance): DurableProjection {
  const projection = baseProjection(ledger, value);
  return { ...projection, schema: value.definition.schema, definitionSource: value.definitionSource ?? 'project', definitionFile: value.definitionFile,
    flowId: value.graph?.flowId, pendingTasks: value.graph?.tasks, writeSets: value.graph?.writeSets,
    acceptanceArchive: value.graph?.acceptanceArchive,
    scopeDecision: ledger.scopeDecision(value.ref.instanceId), delivery: ledger.delivery(value.ref.instanceId) };
}

export class DurableWorkflowService {
  readonly #ledger: DurableLedger;
  readonly #presetRoot?: string;

  constructor(dataDir: string, presetRoot?: string) {
    this.#ledger = new DurableLedger(dataDir);
    this.#presetRoot = presetRoot;
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

  async listDefinitions(projectRoot: string): Promise<DurableDefinitionEntry[]> {
    const project = await this.#definitionsFrom(projectRoot, 'project');
    const preset = this.#presetRoot ? await this.#definitionsFrom(this.#presetRoot, 'preset') : [];
    return [...project, ...preset.filter(item => !item.ok || item.definition?.schema === 2)];
  }

  async #definitionsFrom(projectRoot: string, source: 'project' | 'preset'): Promise<DurableDefinitionEntry[]> {
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
        const result = parseDefinition((await readProjectFile(projectRoot, file, MaxDefinitionBytes)).toString('utf8'));
        return result.ok ? { file, source, ok: true, definition: result.value } : { file, source, ...result };
      } catch (error) {
        return { file, source, ok: false, code: 'definition-unreadable', message: message(error) };
      }
    }));
  }

  async #selectDefinition(projectRoot: string, id: string, selection: DurableDefinitionSelection): Promise<DurableResult<DurableDefinitionEntry & { definition: DurableDefinitionSnapshot }>> {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return fail('definition-id-invalid', '工作流定义 ID 无效。');
    const entries = await this.listDefinitions(projectRoot);
    const base = 'docs/workflows/' + id;
    const all = entries.filter(item => item.definition?.id === id || item.file === base + '.yaml' || item.file === base + '.yml');
    const source = selection.source ?? (all.some(item => item.source === 'project') ? 'project' : 'preset');
    const matches = all.filter(item => item.source === source);
    if (matches.length > 1) return fail('definition-id-conflict', '项目中多个 YAML 声明相同定义。');
    const entry = matches[0];
    if (entry?.definition?.id === id) {
      if (selection.expectedDigest !== undefined && entry.definition.digest !== selection.expectedDigest) return fail('definition-digest-changed', '所选定义已修改，请重新校验。');
      return ok({ ...entry, definition: entry.definition });
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

  async start(input: DurableStartInput): Promise<DurableResult<DurableProjection>> {
    if (!validKey(input.requestId)) return fail('start-request-invalid', '启动请求缺有效且稳定的操作键。');
    const workspace = await workspaceIdentity(input.projectRoot).catch(() => undefined);
    if (!workspace) return fail('workflow-workspace-invalid', '请选择可核验的工作区根目录。');
    const repo = workspace.repository;
    const ledger = this.#ledger;
    const fingerprint = fingerprintStart(input);
    const previous = ledger.request(workspace.projectId, input.requestId) ?? (repo && ledger.request(repo.projectId, input.requestId));
    if (previous) return (previous.startupFingerprint ? previous.startupFingerprint === fingerprint
      : previous.definition.id === input.definitionId && equal(previous.metadata, input.metadata ?? {})
        && (input.source === undefined || input.source === (previous.definitionSource ?? 'project'))
        && (input.expectedDigest === undefined || input.expectedDigest === previous.definition.digest))
      ? ok(project(ledger, previous)) : fail('start-key-conflict', '相同启动键已绑定其他请求。');

    const heldWorkspace = workspaceOwner(workspace.root);
    if (heldWorkspace?.engine === 'dapr' && heldWorkspace.state === 'reserved' && heldWorkspace.dataDir === ledger.dataDir
      && heldWorkspace.requestId === input.requestId && heldWorkspace.definition?.schema === 2) {
      if (heldWorkspace.fingerprint !== fingerprint) return fail('start-key-conflict', '原申请的来源、摘要或内容已经固定。');
      return this.#startGraph(workspace, input, heldWorkspace.definition, heldWorkspace.source ?? 'project', heldWorkspace.definitionFile, heldWorkspace);
    }
    const selected = await this.#selectDefinition(workspace.root, input.definitionId, input);
    if (!selected.ok) return selected;
    const { definition, source: definitionSource } = selected.value;
    const definitionFile = definitionSource === 'project' ? selected.value.file : undefined;
    if (definition.schema === 2) return this.#startGraph(workspace, input, definition, definitionSource, definitionFile);
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
        const concurrent = ledger.request(repo.projectId, input.requestId);
        if (concurrent) return concurrent.startupFingerprint === fingerprint
          ? ok(project(ledger, concurrent)) : fail('start-key-conflict', '相同启动键已绑定其他请求。');
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
    resume?: WorkspaceReservation): Promise<DurableResult<DurableProjection>> {
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
        const previous = ledger.request(projectId, input.requestId);
        if (previous) return previous.startupFingerprint === fingerprint ? ok(project(ledger, previous))
          : fail('start-key-conflict', '相同启动键已绑定其他请求。');
        const pinned = ledger.definition(projectId, definition.id, definition.version);
        if (pinned && pinned.digest !== definition.digest || repo && !pinRepositoryDefinition(repo, definition)) {
          return fail('definition-version-conflict', '此项目的同版本定义已固定到不同摘要。');
        }
        ledger.pin(projectId, definition);
        const ref = { projectId, instanceId, definitionId: definition.id, definitionVersion: definition.version,
          definitionDigest: definition.digest, executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
        const value: StoredInstance = { ref, definition, definitionSource, definitionFile, startupFingerprint: fingerprint,
          projectRoot: root, commonDir: repo?.commonDir ?? '', requestId: input.requestId, metadata: { ...input.metadata },
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

  async #capture(value: StoredInstance, ref: DurableEvidenceRef): Promise<Evidence> {
    if (!hashValid(ref.sha256)) throw new Error('无效证据摘要。');
    const bytes = ref.path === 'ans-evidence/' + ref.sha256
      ? this.#ledger.evidence(value.ref.instanceId, ref.sha256) : await readProjectFile(value.projectRoot, ref.path, MaxEvidenceBytes);
    if (!bytes || digest(bytes) !== ref.sha256) throw new Error('报告字节与固定摘要不匹配。');
    return { ref, bytes };
  }

  graphCardDigest = graphCardDigest;

  listCapabilityEvents(ref: DurableInstanceRef): readonly { event: DurableCapabilityEvent; receipt: DurableFactReceipt }[] {
    if (!this.#find(ref)) return [];
    return this.#ledger.facts(ref.instanceId).flatMap(({ fact, receipt }) => fact.kind === 'capability-event' ? [{ event: fact.event, receipt }] : []);
  }

  async submitCapability(ref: DurableInstanceRef, event: DurableCapabilityEvent, isCurrent?: () => boolean): Promise<DurableResult<DurableFactReceipt>> {
    const ledger = this.#ledger;
    const value = this.#find(ref);
    if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
    const fact: DurableFact = { kind: 'capability-event', source: 'host', key: event.key, stepId: event.stepId, attempt: event.attempt, event };
    const previous = ledger.fact(ref.instanceId, event.key);
    if (previous) return equal(previous.fact, fact) ? ok(previous.receipt) : fail('fact-key-conflict', '同一事实键已绑定其他内容。');
    const evidence: Evidence[] = [];
    try {
      for (const item of capabilityEvidence(event)) evidence.push(await this.#capture(value, item));
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
        const roster = await loadLatestRoster({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!roster.ok || reviewRoleIdOfRoster(roster.roster) !== event.input.task.roleId
          || value.graph?.proposalRoster && !equal(value.graph.proposalRoster, { path: roster.path, sha256: roster.sha256 })) {
          return fail('capability-task-role-invalid', '独立验收角色须来自当前已核验名单。');
        }
      }
      if (event.input.kind === 'card-decided' && activeAction(value) === 'confirm-intent' && event.input.decision === 'approve') {
        const facts = await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!facts.productIntentId || !facts.intentEntryExists || facts.intentEntryIntentId !== facts.productIntentId) {
          return fail('intent-entry-missing', '产品意图缺少匹配的真实意图入口。');
        }
      }
      if (event.input.kind === 'task-closed' && event.input.outcome === 'accepted' && activeAction(value) === 'author-intent') {
        const actual = await readIntentEntryFacts({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!actual.productIntentId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(actual.productIntentId)) {
          return fail('intent-document-invalid', '正式产品意图缺有效 intentId。');
        }
        intentId = actual.productIntentId;
      }
      if (event.input.kind === 'card-decided' && activeAction(value) === 'confirm-proposal' && event.input.decision === 'approve') {
        const roster = await loadLatestRoster({ projectRoot: value.projectRoot, flowId: event.flowId });
        if (!roster.ok || !value.graph?.card?.documents.some(item => item.path === roster.path && item.sha256 === roster.sha256)) {
          return fail('workflow-roster-drift', '任命名单须源自本次经确认的提案。');
        }
        confirmedRoster = roster;
      }
      if (event.input.kind === 'card-decided' && value.graph?.card) {
        await Promise.all(value.graph.card.documents.map(async item => {
          const current = await this.readEvidence(value.projectRoot, item.path);
          if (!current.ok || !equal(current.value, item)) throw new Error('客户决定所依据的文件已经漂移。');
        }));
      }
      return ledger.transaction(() => {
        const original = ledger.fact(ref.instanceId, event.key);
        if (original) return equal(original.fact, fact) ? ok(original.receipt) : fail('fact-key-conflict', '同一事实键已绑定其他内容。');
        if (isCurrent && !isCurrent()) return fail('capability-source-stale', '原应用来源或授权已变化。');
        const current = this.#find(ref)!;
        if (!this.#owns(current)) return fail('workflow-owner-conflict', '实例缺当前目录或仓库写占用。');
        const admitted = admitCapability(ledger, current, event);
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
        ledger.saveFact(ref.instanceId, storedFact(fact, admitted.value));
        return admitted;
      });
    } catch (error) { return fail('capability-evidence-invalid', message(error)); }
  }

  async submit(ref: DurableInstanceRef, fact: DurableFact): Promise<DurableResult<DurableFactReceipt>> {
    const value = this.#find(ref);
    if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
    const ledger = this.#ledger;
    const replay = (): DurableResult<DurableFactReceipt> | undefined => {
      const original = ledger.fact(ref.instanceId, fact.key);
      if (!original) return undefined;
      return original.fingerprint === digest(stableJson(fact)) ? ok(original.receipt)
        : fail('fact-key-conflict', '同一业务事实键已绑定不同内容。');
    };
    const original = replay();
    if (original) return original;
    const shape = factShape(value, fact);
    if (!shape.ok) return shape;
    const evidence: Evidence[] = [];
    if (fact.attempt === value.attempt && value.status === 'waiting') {
      try {
        if (fact.kind === 'task-report' || fact.kind === 'operator-report') evidence.push(await this.#capture(value, fact.evidence));
        if (fact.kind === 'implementation-accepted') evidence.push(await this.#capture(value, fact.operatorReport));
        if (fact.kind === 'release-preview') {
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
        const previous = replay();
        if (previous) return previous;
        const current = this.#find(ref)!;
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
    return this.#ledger.transaction(() => {
      const value = this.#find(ref);
      if (!value) return fail('workflow-not-found', '作用域与已有实例不匹配。');
      if (value.status === 'waiting' && !this.#owns(value)) return fail('workflow-owner-conflict', '当前实例缺仓库持久所有权。');
      return takeEffect(this.#ledger, value, intent);
    });
  }

  settleEffect(ref: DurableInstanceRef, outcome: DurableEffectOutcome): DurableResult<DurableEffectClaim> {
    return this.#ledger.transaction(() => {
      const value = this.#find(ref);
      return value ? settleEffect(this.#ledger, value, outcome) : fail('workflow-not-found', '作用域与已有实例不匹配。');
    });
  }

  block(ref: DurableInstanceRef, code: string, detail: string): void {
    this.#ledger.transaction(() => {
      const value = this.#find(ref);
      if (!value || value.status !== 'waiting') return;
      value.businessReason = code + ': ' + detail;
      this.#ledger.save(value);
    });
  }

  async withDomainOperation<T>(ref: DurableInstanceRef, request: DurableDomainRequest, operation: () => Promise<T>): Promise<DurableResult<T>> {
    const value = this.#find(ref);
    const graph = value?.graph;
    if (!value || !graph || !this.#owns(value) || value.status !== 'waiting' || graph.flowId !== request.flowId
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
    if (!value || value.status !== 'waiting' || !value.baseline || !this.#owns(value)
      || value.engine === 'incompatible' || value.engine === 'history-missing') return undefined;
    if (activeAction(value) === 'governed-implementation') {
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
    if (!value || !task || value.status !== 'waiting' || !this.#owns(value)
      || value.engine === 'incompatible' || value.engine === 'history-missing') return undefined;
    if (task.stepId !== value.stepId && (task.capability !== 'independent-standard' || task.baselineOid !== value.baseline?.oid
      || task.bindingKey !== value.graph?.proofs['standard-open'])) return undefined;
    return graphDocumentRoots(task.capability);
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
      if (value.definition.schema === 2 && !ledger.effects(value.ref.instanceId).some(item => requiresEffectResolution(value, item))) {
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
