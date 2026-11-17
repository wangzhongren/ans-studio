import { DURABLE_ACTIVITY_CONTRACT, DURABLE_EXECUTOR } from '../../model/durable-workflow.ts';
import type {
  DurableDefinition, DurableDelivery, DurableEffect, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome, DurableEffectRecord,
  DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableInstanceRef, DurableOwner, DurableProjection, DurableResult, DurableStartInput,
} from '../../model/durable-workflow.ts';
import {
  DurableLedger, definitionFiles, digest, gitRead, pinRepositoryDefinition, readProjectFile, releaseOwner,
  repositoryIdentity, repositoryOwner, reserveOwnerState, stableJson,
} from '../../provider/durable-workflow/public.ts';
import type { OutboxItem, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { checkGitProtectionFactsCurrent, readGitProtectionFacts } from '../../provider/trunk/public/trunk-store.ts';
import { deriveDurablePathBWriteSets, readWorkflowLedger } from '../../common/编排/workflow-service.ts';
import { parseDefinition } from './definition.ts';
import { takeEffect, settleEffect } from './effects.ts';
import { admitFact, deliveryFor, scopeDecisionFor, storedFact } from './facts.ts';
import { activeAction, applyStep, equal, factShape, fail, hashValid, ok, project as baseProjection, sameInstance, validKey } from './rules.ts';
import type { ActivityInput, ActivityOutcome } from './rules.ts';

export type { ActivityInput, ActivityOutcome } from './rules.ts';
export { parseDefinition } from './definition.ts';

const MaxDefinitionBytes = 128 * 1024;
const MaxEvidenceBytes = 2 * 1024 * 1024;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export interface DurableDefinitionEntry {
  file: string;
  ok: boolean;
  definition?: DurableDefinition;
  code?: string;
  message?: string;
  path?: string;
}

type Evidence = { ref: DurableEvidenceRef; bytes: Buffer };
const ownerSlot = (definitionId: string): string => definitionId === 'path-b' ? 'path-b' : 'read-only:' + definitionId;

function project(ledger: DurableLedger, value: StoredInstance): DurableProjection {
  const projection = baseProjection(ledger, value);
  if (value.ref.definitionId !== 'path-b') return projection;
  return { ...projection, scopeDecision: ledger.scopeDecision(value.ref.instanceId), delivery: ledger.delivery(value.ref.instanceId) };
}

export class DurableWorkflowService {
  readonly #ledger: DurableLedger;

  constructor(dataDir: string) {
    this.#ledger = new DurableLedger(dataDir);
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
    let files: string[];
    try {
      files = await definitionFiles(projectRoot);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : [
        { file: 'docs/workflows', ok: false, code: 'definition-directory-invalid', message: message(error) },
      ];
    }
    return Promise.all(files.map(async file => {
      try {
        const result = parseDefinition((await readProjectFile(projectRoot, file, MaxDefinitionBytes)).toString('utf8'));
        return result.ok ? { file, ok: true, definition: result.value } : { file, ...result };
      } catch (error) {
        return { file, ok: false, code: 'definition-unreadable', message: message(error) };
      }
    }));
  }

  async validateDefinition(projectRoot: string, id: string): Promise<DurableResult<DurableDefinition>> {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return fail('definition-id-invalid', '工作流定义 ID 无效。');
    const entries = await this.listDefinitions(projectRoot);
    const matches = entries.filter(item => item.definition?.id === id || item.file === 'docs/workflows/' + id + '.yaml');
    if (matches.length > 1) return fail('definition-id-conflict', '项目中多个 YAML 声明相同定义。');
    const entry = matches[0];
    if (entry?.definition?.id === id) return ok(entry.definition);
    if (entry && !entry.ok) {
      return { ok: false, code: entry.code!, message: entry.message!, path: entry.path };
    }
    return fail('definition-not-found', '项目工作流定义未找到。');
  }

  async start(input: DurableStartInput): Promise<DurableResult<DurableProjection>> {
    if (!validKey(input.requestId)) return fail('start-request-invalid', '启动请求缺有效且稳定的操作键。');
    const repo = await repositoryIdentity(input.projectRoot).catch(() => undefined);
    if (!repo) return fail('b-repository-required', '工作流须从已有 Git 根目录启动。');
    const ledger = this.#ledger;
    const previous = ledger.request(repo.projectId, input.requestId);
    if (previous) return previous.definition.id === input.definitionId && equal(previous.metadata, input.metadata ?? {})
      ? ok(project(ledger, previous)) : fail('start-key-conflict', '相同启动键已绑定其他请求。');

    const selected = await this.validateDefinition(repo.root, input.definitionId);
    if (!selected.ok) return selected;
    const definition = selected.value;
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
        if (concurrent) return concurrent.definition.id === input.definitionId && equal(concurrent.metadata, input.metadata ?? {})
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
          ref, definition, projectRoot: repo.root, commonDir: repo.commonDir, requestId: input.requestId,
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

  async owner(projectRoot: string, instanceId?: string): Promise<DurableOwner | undefined> {
    const repo = await repositoryIdentity(projectRoot).catch(() => undefined);
    if (!repo) return undefined;
    const value = instanceId === undefined ? undefined : this.#ledger.instance(instanceId);
    if (value?.ref.projectId === repo.projectId) {
      return { engine: 'dapr', instanceId: value.ref.instanceId, projectId: repo.projectId, ownedByThisDataDir: true };
    }
    const row = repositoryOwner(repo) ?? this.#ledger.active(repo.projectId)
      .map(item => repositoryOwner(repo, ownerSlot(item.definition.id))).find(item => item !== undefined);
    if (!row || instanceId !== undefined && instanceId !== row.instanceId) return undefined;
    return { engine: row.engine, instanceId: row.instanceId, projectId: repo.projectId, ownedByThisDataDir: row.dataDir === this.#ledger.dataDir };
  }

  async listProjections(projectRoot: string): Promise<DurableProjection[]> {
    const repo = await repositoryIdentity(projectRoot).catch(() => undefined);
    return repo ? this.#ledger.instances(repo.projectId).map(value => project(this.#ledger, value)) : [];
  }

  async projection(projectRoot: string, instanceId?: string): Promise<DurableProjection | undefined> {
    const all = await this.listProjections(projectRoot);
    return instanceId === undefined ? all.find(value => value.status === 'waiting' && value.ref.definitionId === 'path-b')
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
    const registered = repositoryOwner(value, ownerSlot(value.definition.id));
    return registered?.engine === 'dapr' && registered.instanceId === value.ref.instanceId
      && registered.dataDir === this.#ledger.dataDir;
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
        }
        if (fact.kind === 'b3-advance') {
          if (!value.baseline || !value.analysisReport) return fail('b2-prerequisite-missing', '尚无本次 B1 报告与基线。');
          await this.#capture(value, value.analysisReport.evidence);
          const [branch, head] = await Promise.all([
            gitRead(value.projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
            gitRead(value.projectRoot, ['rev-parse', '--verify', 'HEAD']),
          ]);
          if (branch !== value.baseline.branch || head !== value.baseline.oid) return fail('b2-baseline-drift', '本次 B1 的任务分支或基线已漂移。');
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

  taskGitScope(ref: DurableInstanceRef, taskId: string, roleId: string): {
    taskId: string; workflowId: string; branch: string; paths: string[];
  } | undefined {
    const value = this.#find(ref);
    if (!value || value.status !== 'waiting' || activeAction(value) !== 'b3-implement-and-accept'
      || value.task?.taskId !== taskId || value.task.roleId !== roleId || !value.baseline
      || value.engine === 'incompatible' || value.engine === 'history-missing') return undefined;
    const scope = value.scope?.writeSets.find(set => set.roleId === roleId);
    if (!scope?.paths.length) return undefined;
    const binding = this.#ledger.facts(ref.instanceId).find(item => item.fact.kind === 'task-bound' && item.fact.task.taskId === taskId)?.fact;
    const paths = binding?.kind === 'task-bound' ? binding.modulePaths?.filter(path => scope.paths.includes(path)) : undefined;
    return paths?.length ? { taskId, workflowId: ref.instanceId, branch: value.baseline.branch, paths: [...paths] } : undefined;
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

  engineInputs(): { ref: DurableInstanceRef; definition: DurableDefinition; scheduled: boolean; scheduling: boolean }[] {
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
      const outcome = applyStep(ledger, value, input);
      ledger.save(value);
      ledger.saveActivity(value.ref.instanceId, key, outcome);
      return { value, existing: outcome };
    });
    if (next.value.status !== 'waiting') {
      const value = next.value;
      releaseOwner(value, { engine: 'dapr', dataDir: ledger.dataDir, instanceId: value.ref.instanceId }, ownerSlot(value.definition.id));
    }
    return next.existing;
  }

  pendingOutbox(): OutboxItem[] { return this.#ledger.outbox(Date.now()); }
  postponeOutbox(item: OutboxItem, accepted: boolean): void { this.#ledger.postponed(item, accepted); }
}
