import { readdir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { parseCriteriaText } from '../../common/编排/evidence-check.ts';
import { loadLatestRoster, parseTeamPlan } from '../../common/编排/workflow-preconditions.ts';
import type { DurableCapabilityEvent, DurableDocumentRevision, DurableDocumentRevisionDecisionInput, DurableDocumentRevisionReview, DurableEvidenceRef,
  DurableFact, DurableInstanceRef, DurableResult, DurableTaskBinding } from '../../model/durable-workflow.ts';
import { digest, publishRevisionProjectFile, readRevisionProjectFile, stableJson } from '../../provider/durable-workflow/public.ts';
import type { DurableLedger, StoredDocumentRevision, StoredInstance } from '../../provider/durable-workflow/public.ts';
import { currentProposalDecision, storedFact } from './facts.ts';
import { blockedRoutingEnabled, readVerificationPlan, unavailableVerification } from './blocked-routing.ts';
import { decisionProvenanceMatches, equal, evidenceAuditConfiguration, fail, liveEffect, ok, sameTask, validKey, workflowOwnsDispatch } from './rules.ts';

const MaxDocumentBytes = 128 * 1024;
const maxRevisionsPerInstance = 16;
type Source = DurableCapabilityEvent['source'];
type RevisionUpdate = NonNullable<StoredDocumentRevision['updates']>[number];
type DocumentKind = 'intent' | 'proposal' | 'modules' | 'roster' | 'architecture' | 'team' | 'criteria' | 'report' | 'role';
type Owner = { role: DurableDocumentRevision['roleId']; stage: DurableTaskBinding['stage']; kind: DocumentKind };
type AuthorizeChangedDocument = (facts: { value: StoredInstance; original: DurableEvidenceRef; task: DurableTaskBinding;
  canRevise: boolean }) => Promise<DurableResult<true>>;
const newer = (path: string) => path.replace(/-v([1-9]\d*)\.md$/, (_name, n) => `-v${Number(n) + 1}.md`);
const versionOf = (path: string) => Number(/-v([1-9]\d*)\.md$/.exec(path)?.[1] ?? 0);
const reasonOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function documentRevisionOwner(path: string, flow: string, assignedRoles: readonly string[]): Owner | undefined {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(flow) || path.length > 500) return undefined;
  const roleDocument = /^角色卡\/([a-z0-9][a-z0-9-]{0,79})\/(?:role-card\.md|boundary\.(?:md|yaml))$/.exec(path);
  if (roleDocument && assignedRoles.includes(roleDocument[1]!)) return { role: 'nominator', stage: 'A8', kind: 'role' };
  const match = new RegExp(`^docs/(product|proposals|contracts|scheduling|quality)/${flow}-([a-z]+)-v([1-9][0-9]{0,5})\\.md$`).exec(path);
  if (!match) return undefined;
  const [directory, kind] = [match[1], match[2]];
  if (directory === 'product' && kind === 'intent') return { role: 'product', stage: 'A2', kind };
  if (directory === 'proposals' && (kind === 'proposal' || kind === 'modules' || kind === 'roster') || directory === 'contracts' && kind === 'architecture') {
    return { role: 'rapporteur', stage: 'A5', kind: kind as 'proposal' | 'modules' | 'roster' | 'architecture' };
  }
  if (directory === 'scheduling' && kind === 'team') return { role: 'convener', stage: 'A9', kind };
  if (directory === 'quality' && kind === 'criteria') return { role: 'verifier', stage: 'A12a', kind };
  if (directory === 'quality' && kind === 'report') return { role: 'verifier', stage: 'A12b', kind };
  return undefined;
}

export function documentRevisionEnabled(value: StoredInstance): boolean {
  const step = value.definition.steps[value.stepId];
  return value.definition.schema === 2 && workflowOwnsDispatch(value) && !!step && 'action' in step
    && step.action === 'operations-implementation' && 'documentRevision' in step && step.documentRevision === true;
}

export function currentDocumentRevision(value: StoredInstance): StoredDocumentRevision | undefined {
  return value.graph?.documentRevisions?.findLast(item => item.origin.stepId === value.stepId
    && item.origin.entry === value.entry && item.origin.attempt === value.attempt);
}

export function revisionParksNode(value: StoredInstance): boolean {
  const active = currentDocumentRevision(value);
  return active !== undefined && active.status !== 'resumed';
}

export function documentRevisionProjection(value: StoredInstance): DurableDocumentRevision | undefined {
  const revision = currentDocumentRevision(value);
  return revision && revisionProjection(revision);
}

function revisionBinding(revision: StoredDocumentRevision, digest: string) {
  return { requestId: `document-revision:${revision.id}:${digest}`, generation: revision.origin.attempt, digest };
}

function revisionApproval(revision: StoredDocumentRevision): DurableDocumentRevision['approval'] {
  if (revision.approval) return revision.approval;
  const previous = revision.decision;
  if (previous?.authority === 'customer') {
    return { ...revisionBinding(revision, previous.digest), decision: previous.decision, at: previous.at, provenance: { source: 'customer' } };
  }
}

function revisionProjection(current: StoredDocumentRevision): DurableDocumentRevision {
  const { id, path, reason, roleId, task, origin, status, original, candidate, reviewDigest, blockedReason } = current;
  const approval = revisionApproval(current);
  return { id, path, reason, roleId, task, origin, status, original, candidate, reviewDigest, blockedReason, ...(approval ? { approval } : {}) };
}

export function effectiveRevisionEvidence(value: StoredInstance, original: DurableEvidenceRef): DurableEvidenceRef {
  let effective = original;
  for (const revision of value.graph?.documentRevisions ?? []) {
    if (revision.status !== 'resumed') continue;
    const update = revision.updates?.find(item => equal(item.original, effective));
    if (update) effective = update.candidate;
  }
  return effective;
}

function currentVerifierStandard(ledger: DurableLedger, value: StoredInstance) {
  const proof = value.graph?.proofs['standard-open'];
  const closed = proof ? ledger.fact(value.ref.instanceId, proof) : undefined;
  if (closed?.receipt.state !== 'consumed' || closed.fact.kind !== 'capability-event' || !value.baseline) return undefined;
  const { event } = closed.fact;
  const input = event.input;
  if (input.kind !== 'task-closed' || event.flowId !== value.graph?.flowId || input.outcome !== 'accepted'
    || input.task.stage !== 'A12a' || input.task.roleId !== 'verifier') return undefined;
  return value.graph.tasks.find(task => task.capability === 'independent-standard' && task.roleId === 'verifier'
    && sameTask(task.task, input.task) && task.stepId === event.stepId && task.attempt === event.attempt
    && task.flowId === event.flowId && task.state === 'accepted' && task.outcome === 'accepted'
    && task.baselineOid === value.baseline!.oid && task.documents?.some(doc => input.documents?.some(ref =>
      equal(effectiveRevisionEvidence(value, ref), doc))));
}

function validateCriteriaRevision(ledger: DurableLedger, value: StoredInstance, original: DurableEvidenceRef,
  content: string, path: string, allowedSourceVersions?: readonly number[]): void {
  const standard = currentVerifierStandard(ledger, value);
  if (!standard?.documents?.some(ref => equal(ref, original))) {
    throw new Error('修订须绑定当前基线、流程及已接受的内置 A12a 质检任务和文件。');
  }
  const flowId = standard.flowId;
  const parsed = parseCriteriaText(content, { flowId, ...(allowedSourceVersions ? {} : { fileName: basename(path) }) });
  if (!parsed.ok) throw new Error(parsed.code + '：' + parsed.rejection.missing.join('；'));
  if (parsed.doc.status !== 'final') throw new Error('当前批准的 A12a 标准须是 final 版本。');
  if (allowedSourceVersions && !allowedSourceVersions.includes(parsed.doc.version)) {
    throw new Error('候选标准版本与应用绑定的当前及后继版本不一致。');
  }
  if (blockedRoutingEnabled(value) && standard.verificationCapabilities && !allowedSourceVersions) {
    const bytes = Buffer.from(content, 'utf8');
    const audit = value.definition.schema === 2 && !!value.definition.evidenceAudit;
    const plan = readVerificationPlan({ path, sha256: digest(bytes) }, bytes, flowId, standard.verificationCapabilities, undefined, audit);
    if (!plan.ok || unavailableVerification(plan.value)) throw new Error('修订后的标准须明确实际可核验职责与证据。');
    const approved = currentProposalDecision(ledger, value);
    const header = markdownHeader(content)?.values;
    if (approved && (header?.proposalDecisionDigest !== approved.selectionDigest || !equal(header.decisionValues, approved.values))) {
      throw new Error('修订后的标准须继续绑定当前 A6 决策及实际选择。');
    }
  }
}

function currentBasis(ledger: DurableLedger, value: StoredInstance): DurableEvidenceRef[] {
  const facts = ledger.facts(value.ref.instanceId).flatMap(row => row.receipt.state === 'consumed'
    && row.fact.kind === 'capability-event' ? [row.fact.event.input] : []);
  const all = facts.flatMap(input => {
    if (input.kind === 'card-prepared' && facts.some(decision => decision.kind === 'card-decided'
      && decision.requestId === input.card.requestId && decision.digest === input.card.digest && decision.decision === 'approve')) {
      return [...input.card.documents];
    }
    if (input.kind === 'baseline-verified' || input.kind === 'role-activated') return [...input.documents ?? []];
    return [];
  });
  for (const task of value.graph?.tasks ?? []) {
    if (task.outcome === 'accepted' && task.roleId === 'verifier' && task.baselineOid === value.baseline?.oid
      && task.capability === 'independent-assessment') all.push(...task.documents ?? []);
  }
  all.push(...currentVerifierStandard(ledger, value)?.documents ?? []);
  const current = all.map(ref => effectiveRevisionEvidence(value, ref));
  const byPath = new Map<string, DurableEvidenceRef>();
  for (const ref of current) {
    const prior = byPath.get(ref.path);
    if (prior && !equal(prior, ref)) throw new Error(`当前文件具有冲突的批准摘要：${ref.path}`);
    byPath.set(ref.path, ref);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function parentOf(value: StoredInstance) {
  return value.graph?.tasks.find(task => task.capability === 'operations-implementation' && !task.workItemId
    && task.stepId === value.stepId && task.attempt === value.attempt && task.roleId === 'convener' && task.state === 'pending');
}

function sourceOwnsTurn(ledger: DurableLedger, value: StoredInstance, task: DurableTaskBinding, source: Source, initialKey?: string): boolean {
  if (!validKey(source.originId) || source.roleId !== task.roleId || source.parentTaskId !== task.taskId) return false;
  return ledger.effects(value.ref.instanceId).some(effect => effect.intent.kind === 'model-send'
    && effect.intent.stepId === value.stepId && effect.intent.attempt === value.attempt && sameTask(effect.intent.task, task)
    && (!initialKey || effect.intent.key === initialKey) && effect.intent.expected?.roleId === task.roleId
    && (effect.state === 'claimed' || effect.state === 'succeeded' && effect.result?.result?.turnId === source.originId));
}

function idleForRevision(ledger: DurableLedger, value: StoredInstance, parent: DurableTaskBinding): boolean {
  return !value.graph?.tasks.some(task => task.task.parentTaskId === parent.taskId
    && task.stepId === value.stepId && task.attempt === value.attempt && task.workItemId && task.state === 'pending')
    && !ledger.effects(value.ref.instanceId).some(effect => liveEffect(effect.state)
      && !(effect.state === 'claimed' && effect.intent.kind === 'model-send' && sameTask(effect.intent.task, parent)));
}

type Header = { original: string; values: Record<string, unknown>; textAfter: string };
function markdownHeader(text: string): Header | undefined {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!header) return undefined;
  const parsed = parseDocument(header[1]!, { uniqueKeys: true, strict: true, merge: false });
  if (parsed.errors.length || parsed.warnings.length) throw new Error('候选元数据 YAML 无效或含歧义。');
  const values: unknown = parsed.toJS({ maxAliasCount: 0 });
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('候选元数据必须为映射。');
  return { original: header[1]!, values: values as Record<string, unknown>, textAfter: text.slice(header[0].length) };
}

function versionedText(content: string, originalPath: string, targetPath: string): string {
  const before = versionOf(originalPath);
  const after = versionOf(targetPath);
  const header = markdownHeader(content);
  if (header && header.values.version !== undefined && header.values.version !== before && header.values.version !== after) {
    throw new Error('候选文档版本与应用绑定的原版本不一致。');
  }
  if (header?.values.version !== undefined) {
    const version = /^version:[ \t]*\d+[ \t]*$/m;
    if (!version.test(header.original)) throw new Error('候选版本须是普通整数。');
    content = `---\n${header.original.replace(version, `version: ${after}`)}\n---\n${header.textAfter}`;
  }
  return content.replace(/(```ans-criteria\r?\n[\s\S]*?^version:[ \t]*)\d+(?=[ \t]*\r?$)/m, (_full, leading) => `${leading}${after}`);
}

function sameHeader(before: string, after: string, flow: string): boolean {
  const old = markdownHeader(before)?.values;
  const next = markdownHeader(after)?.values;
  if (!old || !next) return old === next;
  const { version: _oldVersion, ...oldTerms } = old;
  const { version: _newVersion, ...newTerms } = next;
  return (oldTerms.flowId === undefined || oldTerms.flowId === flow) && equal(oldTerms, newTerms);
}

type Bundle = { original: DurableEvidenceRef; candidate: DurableEvidenceRef; bytes: Buffer };

async function compatibleRoster(value: StoredInstance, changes: readonly Bundle[]) {
  const flowId = value.graph!.flowId!;
  const projectRoot = value.projectRoot;
  const evidenceCollectorRoleId = evidenceAuditConfiguration(value)?.collectorRoleId;
  const old = await loadLatestRoster({ projectRoot, flowId, evidenceCollectorRoleId });
  if (!old.ok || !equal({ path: old.path, sha256: old.sha256 }, value.graph?.proposalRoster)) {
    throw new Error(old.ok ? '当前名单不是本流程批准的有效版本。' : old.reason);
  }
  const overlay = new Map(changes.map(item => [item.candidate.path, item.bytes]));
  const mockNames = async (root: string) => [...new Set([...(await readdir(root)), ...[...overlay.keys()].flatMap(file => {
    const parts = file.split('/');
    return relative(root, join(projectRoot, ...parts.slice(0, -1))) === '' ? [parts.at(-1)!] : [];
  })])];
  const mockRead = async (path: string, encoding?: string) => {
    const file = relative(projectRoot, path).split(sep).join('/');
    const bytes = overlay.get(file) ?? await readRevisionProjectFile(projectRoot, file, MaxDocumentBytes);
    if (!bytes) throw new Error('缺少关联文件：' + file);
    return encoding ? bytes.toString('utf8') : bytes;
  };
  const proposed = await loadLatestRoster({ projectRoot, flowId, evidenceCollectorRoleId, readdirFn: mockNames as typeof readdir,
    readFileFn: mockRead as Parameters<typeof loadLatestRoster>[0]['readFileFn'] });
  if (!proposed.ok) throw new Error(proposed.reason);
  if (!equal(old.roster.roles, proposed.roster.roles) || !equal(old.roster.modules, proposed.roster.modules)
    || !equal(old.roster.envBootstrap, proposed.roster.envBootstrap)) throw new Error('候选改变了名单、职责或模块所有权，须重新通过方案、任命及激活门。');
  return old;
}

export class DocumentRevisionService {
  readonly #inFlight = new Map<string, Promise<DurableResult<DurableDocumentRevision>>>();
  readonly ledger: DurableLedger;
  readonly find: (ref: DurableInstanceRef) => StoredInstance | undefined;
  readonly owns: (value: StoredInstance) => boolean;
  readonly verifyResume: (value: StoredInstance) => Promise<DurableResult<true>>;

  constructor(ledger: DurableLedger, find: (ref: DurableInstanceRef) => StoredInstance | undefined, owns: (value: StoredInstance) => boolean,
    verifyResume: (value: StoredInstance) => Promise<DurableResult<true>>) {
    this.ledger = ledger;
    this.find = find;
    this.owns = owns;
    this.verifyResume = verifyResume;
  }

  #active(ref: DurableInstanceRef, id?: string) {
    const value = this.find(ref);
    const revision = value && currentDocumentRevision(value);
    return value && value.status === 'waiting' && value.engine === 'healthy' && this.owns(value) && documentRevisionEnabled(value)
      && (!id || revision?.id === id) ? { value, revision } : undefined;
  }

  #record(value: StoredInstance, revision: StoredDocumentRevision): DurableResult<DurableDocumentRevision> {
    this.ledger.save(value);
    const key = `document-revision:${revision.id}:${revision.status}`;
    if (!this.ledger.fact(value.ref.instanceId, key)) {
      const fact: DurableFact = { kind: 'document-revision', source: 'host', key, stepId: revision.origin.stepId,
        attempt: revision.origin.attempt, revisionId: revision.id, state: revision.status,
        ...(revision.approval ? { approval: revision.approval } : {}) };
      this.ledger.saveFact(value.ref.instanceId, storedFact(fact, { key, state: revision.status === 'resumed' ? 'pending' : 'consumed' }));
    }
    return ok(documentRevisionProjection(value)!);
  }

  #blocked(value: StoredInstance, revision: StoredDocumentRevision, reason: string): DurableResult<DurableDocumentRevision> {
    revision.status = 'blocked';
    revision.blockedReason = reason;
    return this.#record(value, revision);
  }

  async #verifyBasis(value: StoredInstance, revision: StoredDocumentRevision, restoration: 'waiting' | 'applying' | 'completed' = 'waiting'): Promise<void> {
    if (!equal(currentBasis(this.ledger, value), revision.basis)) throw new Error('修订的有效依据已变动。');
    for (const ref of revision.basis) {
      if (ref.path === revision.path && revision.missingOriginal && restoration === 'applying') continue;
      const bytes = await readRevisionProjectFile(value.projectRoot, ref.path, MaxDocumentBytes);
      if (ref.path === revision.path && revision.missingOriginal && restoration === 'waiting') {
        if (!bytes) continue;
        throw new Error(`等待中的修订原文件已重新出现：${ref.path}`);
      }
      if (!bytes || digest(bytes) !== ref.sha256) throw new Error(`修订所依据的文件已经漂移：${ref.path}`);
    }
  }

  async request(ref: DurableInstanceRef, input: { path: string; reason: string; source: Source }, isCurrent: () => boolean,
    authorizeChangedDocument?: AuthorizeChangedDocument) {
    const active = this.#active(ref);
    const parent = active && parentOf(active.value);
    const invalid = () => fail('document-revision-source', '只有当前已启用修订的 A11 运营回合可提出文件修订。');
    if (!active || !parent || !isCurrent() || !sourceOwnsTurn(this.ledger, active.value, parent.task, input.source)) return invalid();
    if (typeof input.path !== 'string' || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 4000) {
      return fail('document-revision-request-invalid', '提交项目相对路径与 1–4000 字的具体原因。');
    }
    const { value, revision } = active;
    const flow = value.graph?.flowId;
    const owner = flow && documentRevisionOwner(input.path, flow, value.graph?.expectedRoles ?? []);
    if (!owner) return fail('document-revision-owner', '文件不属于当前流程的固定内置角色归属。');
    const prior = value.graph?.documentRevisions?.find(item => item.origin.entry === value.entry && item.path === input.path && item.reason === input.reason.trim());
    if (prior) return ok(prior);
    if (revisionParksNode(value)) return fail('document-revision-busy', '已有需要办结的治理文件修订。');
    if (!idleForRevision(this.ledger, value, parent.task)) return fail('document-revision-busy', '先等待当前实施子任务回交并结算所有实际作用。');
    try {
      const basis = currentBasis(this.ledger, value);
      const original = basis.find(item => item.path === input.path);
      if (!original || basis.some(item => newer(original.path) === item.path && item.path !== original.path)) {
        return fail('document-revision-file', '只接受本流程实际已登记的生效文件。');
      }
      const bytes = await readRevisionProjectFile(value.projectRoot, original.path, MaxDocumentBytes);
      if (bytes && digest(bytes) !== original.sha256) return fail('document-revision-drift', '原文件与本流程已核验摘要不同，需要先处理漂移。');
      const candidate: StoredDocumentRevision = {
        id: 'rev-' + digest(stableJson([ref, value.entry, original, input.reason.trim()])).slice(0, 40),
        path: input.path, reason: input.reason.trim(), roleId: owner.role, status: 'pending', original, basis,
        origin: { stepId: value.stepId, entry: value.entry, attempt: value.attempt, taskId: parent.taskId }, requestedBy: input.source,
        missingOriginal: !bytes,
        task: { stage: owner.stage, roleId: owner.role, stageAttempt: value.attempt, executionAttempt: 1, parentTaskId: parent.taskId,
          taskId: 'dw-' + digest(stableJson([ref, value.entry, original, input.reason.trim(), owner.role])).slice(0, 30) },
      };
      await this.#verifyBasis(value, candidate);
      if (bytes && authorizeChangedDocument) {
        const cap = await authorizeChangedDocument({ value, original, task: parent.task,
          canRevise: !['intent', 'role', 'report'].includes(owner.kind) });
        if (!cap.ok) return cap;
      }
      return this.ledger.transaction(() => {
        const current = this.#active(ref);
        const assigned = current && parentOf(current.value);
        if (!current || !assigned || current.value.entry !== value.entry || current.value.stepId !== value.stepId
          || current.value.attempt !== value.attempt || !sameTask(assigned.task, parent.task) || !isCurrent()
          || !sourceOwnsTurn(this.ledger, current.value, parent.task, input.source)
          || !equal(currentBasis(this.ledger, current.value), basis)) return invalid();
        if (!equal(current.revision, revision) || revisionParksNode(current.value) || !idleForRevision(this.ledger, current.value, parent.task)) {
          return fail('document-revision-busy', '另一项实际派发或修订已受理。');
        }
        const items = current.value.graph!.documentRevisions ??= [];
        if (items.length >= maxRevisionsPerInstance) return fail('document-revision-limit', '工作流修订次数已达到限制。');
        if (bytes) this.ledger.saveEvidence(ref.instanceId, original.sha256, bytes);
        items.push(candidate);
        return this.#record(current.value, candidate);
      });
    } catch (error) { return fail('document-revision-request-evidence', reasonOf(error)); }
  }

  async #bundle(value: StoredInstance, revision: StoredDocumentRevision, content: string): Promise<Bundle[]> {
    const original = revision.original!;
    const owner = documentRevisionOwner(original.path, value.graph!.flowId!, value.graph!.expectedRoles ?? [])!;
    const frozen = this.ledger.evidence(value.ref.instanceId, original.sha256);
    if (revision.missingOriginal) {
      const bytes = Buffer.from(content, 'utf8');
      if (digest(bytes) !== original.sha256) throw new Error('原文件缺失，当前入口只能恢复已经批准的同一摘要。');
      if (owner.kind === 'criteria') validateCriteriaRevision(this.ledger, value, original, content, original.path);
      return [{ original, candidate: original, bytes }];
    }
    if (!frozen || digest(frozen) !== original.sha256) throw new Error('缺少原审批的固定文件字节。');
    const old = frozen.toString('utf8');
    if (old === content || old === versionedText(content, original.path, original.path)) throw new Error('候选没有实际修改。');
    if (owner.kind === 'intent') throw new Error('产品意图变更会影响已批准的跨角色方案引用，须回到意图及方案确认。');
    if (owner.kind === 'role') throw new Error('任命角色文档需通过原三份角色文件一致性及激活门，当前单文件候选未生效。');
    if (owner.kind === 'report') throw new Error('既有验收报告绑定前一候选和判定，须在对应 A12b 独立验收重新生成。');
    const add = (ref: DurableEvidenceRef, text: string): Bundle => {
      const path = newer(ref.path);
      if (path === ref.path || versionOf(path) > 999999) throw new Error('文件缺少可分配的后继规范版本。');
      const bytes = Buffer.from(versionedText(text, ref.path, path), 'utf8');
      if (bytes.length > MaxDocumentBytes) throw new Error('生成的修订文档超过大小限制。');
      return { original: ref, candidate: { path, sha256: digest(bytes) }, bytes };
    };
    if (owner.kind !== 'criteria' && !sameHeader(old, content, value.graph!.flowId!)) {
      throw new Error('候选改变了正式结构或授权字段，须由原确认与核验节点处理。');
    }
    if (owner.kind === 'criteria') validateCriteriaRevision(this.ledger, value, original, content, original.path,
      [versionOf(original.path), versionOf(newer(original.path))]);
    const main = add(original, content);
    const changes = [main];
    if (owner.role === 'rapporteur') {
      const lookup = (kind: DocumentKind) => revision.basis.find(ref => documentRevisionOwner(ref.path, value.graph!.flowId!, [])?.kind === kind);
      const companion = async (kind: DocumentKind) => {
        const ref = lookup(kind);
        if (!ref) throw new Error('缺少已批准的同属主关联文档：' + kind);
        const bytes = await readRevisionProjectFile(value.projectRoot, ref.path, MaxDocumentBytes);
        if (!bytes || digest(bytes) !== ref.sha256) throw new Error('关联文档已漂移：' + ref.path);
        const text = changes.reduce((body, change) => {
          if (kind !== 'roster') return body.replaceAll(change.original.path, change.candidate.path);
          // The roster's module snapshot is part of the already approved authority. Advance top-level document references only.
          const old = change.original.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const field = new RegExp(`^(proposal|architecture|modulesDoc):([ \\t]*)(["']?)${old}\\3([ \\t]*)(?=\\r?$)`, 'm');
          return body.replace(field, (_original, key, indent, quote, tail) => `${key}:${indent}${quote}${change.candidate.path}${quote}${tail}`);
        }, bytes.toString('utf8'));
        changes.push(add(ref, text));
      };
      if (owner.kind === 'proposal') await companion('architecture');
      if (owner.kind !== 'roster') await companion('roster');
      await compatibleRoster(value, changes);
    } else if (owner.kind === 'team') {
      const roster = await compatibleRoster(value, []);
      const header = markdownHeader(old)?.values;
      const modulesRef = header?.modules as DurableEvidenceRef | undefined;
      const rosterRef = header?.roster as DurableEvidenceRef | undefined;
      if (!modulesRef || !rosterRef) throw new Error('团队计划缺原有正式模块与名单引用。');
      const expectedRoster = { path: roster.path, sha256: roster.sha256 };
      const effectiveModules = effectiveRevisionEvidence(value, modulesRef);
      if (!equal(effectiveRevisionEvidence(value, rosterRef), expectedRoster) || !revision.basis.some(ref => equal(ref, effectiveModules)
        && documentRevisionOwner(ref.path, value.graph!.flowId!, [])?.kind === 'modules')) {
        throw new Error('团队计划引用须关联已批准的当前模块与名单依据。');
      }
      for (const ref of [modulesRef, rosterRef]) {
        const bytes = await readRevisionProjectFile(value.projectRoot, ref.path, MaxDocumentBytes);
        if (!bytes || digest(bytes) !== ref.sha256) throw new Error('团队计划引用的原始文件与摘要不匹配：' + ref.path);
      }
      const parsed = parseTeamPlan(main.bytes.toString('utf8'), { flowId: value.graph!.flowId!, version: versionOf(main.candidate.path),
        modules: modulesRef, roster: rosterRef, rosterFacts: roster.roster });
      if (!parsed.ok) throw new Error(parsed.reason);
      const scope = parsed.plan.roleRows.map(({ roleId, writesets }) => ({ roleId, paths: writesets }));
      if (!equal(scope, value.graph?.writeSets)) throw new Error('候选团队计划写集与本节点已批准的有效写集不一致。');
    }
    if (owner.kind === 'criteria') validateCriteriaRevision(this.ledger, value, original, main.bytes.toString('utf8'), main.candidate.path);
    const pathSet = new Set<string>();
    for (const doc of changes) {
      if (pathSet.has(doc.candidate.path) || await readRevisionProjectFile(value.projectRoot, doc.candidate.path, MaxDocumentBytes)) {
        throw new Error('规范后继版本已经存在：' + doc.candidate.path);
      }
      pathSet.add(doc.candidate.path);
    }
    return changes;
  }

  async submit(ref: DurableInstanceRef, input: { revisionId: string; content: string; source: Source }, isCurrent: () => boolean) {
    const active = this.#active(ref, input.revisionId);
    const revision = active?.revision;
    const sourceValid = () => !!active && !!revision && isCurrent() && sourceOwnsTurn(this.ledger, active.value,
      revision.task, input.source, 'model:' + revision.task.taskId);
    if (!active || !revision || !sourceValid()) return fail('document-revision-candidate-source', '当前回合不持有实际内置角色修订任务。');
    if (typeof input.content !== 'string' || !input.content.trim() || Buffer.byteLength(input.content) > MaxDocumentBytes || input.content.includes('\0')) {
      return fail('document-revision-candidate-invalid', '修订须回交有界的完整 UTF-8 文件内容。');
    }
    if (revision.status !== 'pending') {
      return equal(revision.submittedBy, input.source) && revision.candidateInputDigest === digest(input.content) ? ok(documentRevisionProjection(active.value)!)
        : fail('document-revision-candidate-state', '本修订不再接受候选。');
    }
    let bundle: Bundle[];
    try {
      await this.#verifyBasis(active.value, revision);
      bundle = await this.#bundle(active.value, revision, input.content);
    } catch (error) { return fail('document-revision-candidate-evidence', reasonOf(error)); }
    return this.ledger.transaction(() => {
      const latest = this.#active(ref, revision.id);
      const draft = latest?.revision;
      if (!latest || !draft || draft.status !== 'pending' || !equal(draft, revision) || !isCurrent()
        || !sourceOwnsTurn(this.ledger, latest.value, draft.task, input.source, 'model:' + draft.task.taskId)) {
        return fail('document-revision-candidate-stale', '实际修订回合或有效依据在处理期间已变化。');
      }
      for (const doc of bundle) this.ledger.saveEvidence(ref.instanceId, doc.candidate.sha256, doc.bytes);
      draft.updates = bundle.map(({ original, candidate }) => ({ original, candidate }));
      draft.candidate = bundle[0]!.candidate;
      draft.submittedBy = input.source;
      draft.candidateInputDigest = digest(input.content);
      draft.status = draft.missingOriginal ? 'ready' : 'awaiting-approval';
      draft.reviewDigest = digest(stableJson([ref, draft.id, draft.origin, draft.basis, draft.updates]));
      return this.#record(latest.value, draft);
    });
  }

  async review(ref: DurableInstanceRef, id: string, isCurrent = () => true): Promise<DurableResult<DurableDocumentRevisionReview>> {
    const stale = () => fail('document-revision-decision-stale', '原修订决定的应用来源或委托已变化。');
    const active = this.#active(ref, id);
    const revision = active?.revision;
    if (!active || revision?.status !== 'awaiting-approval' || !revision.reviewDigest || !revision.updates?.length) {
      return fail('document-revision-review-unavailable', '没有等待本人确认的当前候选。');
    }
    try {
      await this.#verifyBasis(active.value, revision);
      if (!isCurrent()) return stale();
      const previews = [];
      for (const item of revision.updates) {
        const bytes = this.ledger.evidence(ref.instanceId, item.candidate.sha256);
        if (!bytes || digest(bytes) !== item.candidate.sha256) throw new Error('候选证据缺失或已变化。');
        if (await readRevisionProjectFile(active.value.projectRoot, item.candidate.path, MaxDocumentBytes)) {
          throw new Error('候选版本路径提前被占用：' + item.candidate.path);
        }
        if (!isCurrent()) return stale();
        previews.push({ ...item, content: bytes.toString('utf8') });
      }
      return ok({ ...revisionBinding(revision, revision.reviewDigest), originalContent: revision.original
        && this.ledger.evidence(ref.instanceId, revision.original.sha256)?.toString('utf8'), candidateContent: previews[0]!.content,
        documents: revision.updates.map(item => item.candidate), previews });
    } catch (error) { return fail('document-revision-review-drift', reasonOf(error)); }
  }

  async decide(ref: DurableInstanceRef, input: DurableDocumentRevisionDecisionInput, isCurrent?: () => boolean) {
    const provenance = input.provenance ?? { source: 'customer' };
    if (!isCurrent?.() || input.authority !== provenance.source || !['approve', 'reject'].includes(input.decision)) {
      return fail('document-revision-decision-authority', '修订决定须来自当前桌面确认卡的有权来源。');
    }
    const matches = (revision: StoredDocumentRevision) => {
      const binding = revisionBinding(revision, input.digest);
      return revision.reviewDigest === input.digest
        && (input.requestId === undefined || input.requestId === binding.requestId)
        && (input.generation === undefined || input.generation === binding.generation)
        && decisionProvenanceMatches(provenance.source, provenance, binding);
    };
    const replay = (revision: StoredDocumentRevision) => {
      const recorded = revisionApproval(revision);
      if (!recorded) return;
      return recorded.decision === input.decision && recorded.digest === input.digest && equal(recorded.provenance, provenance)
        ? ok(revisionProjection(revision))
        : fail('document-revision-decision-conflict', '同一修订已记录其他决定。');
    };
    const previous = this.find(ref)?.graph?.documentRevisions?.find(item => item.id === input.revisionId);
    if (!previous || !matches(previous)) return fail('document-revision-decision-stale', '决定未匹配当前候选、请求或代次。');
    const recorded = replay(previous);
    if (recorded) return recorded;
    const checked = await this.review(ref, input.revisionId, isCurrent);
    if (!checked.ok) return checked;
    return this.ledger.transaction(() => {
      const latest = this.#active(ref, input.revisionId);
      const revision = latest?.revision;
      if (!latest || !revision || !matches(revision) || !isCurrent()) {
        return fail('document-revision-decision-stale', '当前候选、确认卡或发出来源已更新。');
      }
      const saved = replay(revision);
      if (saved) return saved;
      if (revision.status !== 'awaiting-approval' || !equal(revision, previous) || checked.value.digest !== input.digest) {
        return fail('document-revision-decision-stale', '当前候选、确认卡或发出来源已更新。');
      }
      revision.approval = { ...revisionBinding(revision, input.digest), provenance, decision: input.decision, at: new Date().toISOString() };
      if (input.decision === 'reject') return this.#blocked(latest.value, revision, '修订被拒绝。旧批准仍有效，原节点等待处理该缺项。');
      revision.status = 'ready';
      return this.#record(latest.value, revision);
    });
  }

  fail(ref: DurableInstanceRef, input: { revisionId: string; reason: string; turnId?: string }) {
    return this.ledger.transaction(() => {
      const active = this.#active(ref, input.revisionId);
      const revision = active?.revision;
      const effect = revision && this.ledger.effect(ref.instanceId, 'model:' + revision.task.taskId);
      if (!active || revision?.status !== 'pending' || !input.reason.trim()
        || !(effect?.state === 'succeeded' && !!input.turnId && effect.result?.result?.turnId === input.turnId
          || (effect === undefined || effect.state === 'not-started') && !input.turnId)) {
        return fail('document-revision-failure-source', '修订失败未绑定真实的原派发或实际回合。');
      }
      return this.#blocked(active.value, revision, input.reason.slice(0, 1000));
    });
  }

  resume(ref: DurableInstanceRef) {
    const pending = this.#inFlight.get(ref.instanceId);
    if (pending) return pending;
    const result = this.#apply(ref).finally(() => this.#inFlight.delete(ref.instanceId));
    this.#inFlight.set(ref.instanceId, result);
    return result;
  }

  async #apply(ref: DurableInstanceRef): Promise<DurableResult<DurableDocumentRevision>> {
    const active = this.#active(ref);
    const revision = active?.revision;
    const approval = revision && revisionApproval(revision);
    const binding = revision && approval && revisionBinding(revision, approval.digest);
    if (!active || !revision?.updates?.length || !['ready', 'applying'].includes(revision.status)
      || !revision.missingOriginal && (!approval || !binding || approval.decision !== 'approve' || approval.digest !== revision.reviewDigest
        || approval.requestId !== binding.requestId || approval.generation !== binding.generation
        || !decisionProvenanceMatches(approval.provenance.source, approval.provenance, binding))) {
      return fail('document-revision-apply-state', '当前治理文件修订没有有效批准或待核对结果。');
    }
    try {
      await this.#verifyBasis(active.value, revision, revision.status === 'applying' ? 'applying' : 'waiting');
      if (!revision.missingOriginal) {
        const verified = await this.verifyResume(active.value);
        if (!verified.ok) throw new Error(verified.message);
      }
      const claim = this.ledger.transaction(() => {
        const live = this.#active(ref, revision.id);
        if (!live?.revision || !equal(live.revision, revision)) return false;
        live.revision.status = 'applying';
        this.#record(live.value, live.revision);
        return true;
      });
      if (!claim) return fail('document-revision-apply-stale', '候选或本人决定已变化。');
      for (const update of revision.updates) {
        const bytes = this.ledger.evidence(ref.instanceId, update.candidate.sha256);
        if (!bytes || digest(bytes) !== update.candidate.sha256) throw new Error('候选存档与本人确认的摘要不一致。');
        if (revision.task.stage === 'A12a') validateCriteriaRevision(this.ledger, active.value, update.original,
          bytes.toString('utf8'), update.candidate.path);
        await publishRevisionProjectFile(active.value.projectRoot, update.candidate.path, bytes, revision.status === 'applying');
      }
      await this.#verifyBasis(active.value, revision, 'completed');
      for (const update of revision.updates) {
        const bytes = await readRevisionProjectFile(active.value.projectRoot, update.candidate.path, MaxDocumentBytes);
        if (!bytes || digest(bytes) !== update.candidate.sha256) throw new Error('落盘的修订版本或摘要不完整：' + update.candidate.path);
      }
      const verified = await this.verifyResume(active.value);
      if (!verified.ok) throw new Error(verified.message);
      const rosterUpdate = revision.updates.find(change => equal(change.original, active.value.graph?.proposalRoster)
        && !equal(change.original, change.candidate));
      if (rosterUpdate) {
        const roster = await loadLatestRoster({ projectRoot: active.value.projectRoot, flowId: active.value.graph!.flowId!,
          evidenceCollectorRoleId: evidenceAuditConfiguration(active.value)?.collectorRoleId });
        if (!roster.ok || !equal({ path: roster.path, sha256: roster.sha256 }, rosterUpdate.candidate)) {
          throw new Error(roster.ok ? '实际生效名单没有绑定已确认的修订版本。' : roster.reason);
        }
      }
      return this.ledger.transaction(() => {
        const live = this.#active(ref, revision.id);
        const current = live?.revision;
        if (!live || current?.status !== 'applying' || current.reviewDigest !== revision.reviewDigest || !parentOf(live.value)
          || !equal(current.updates, revision.updates)) return fail('document-revision-apply-stale', '修订或原运营父任务已变化，须核对实际落盘。');
        const graph = live.value.graph!;
        if (rosterUpdate) graph.proposalRoster = rosterUpdate.candidate;
        for (const task of graph.tasks) {
          if (task.roleId !== 'verifier' || task.outcome !== 'accepted') continue;
          task.documents = task.documents?.map(doc => revision.updates!.find(change => equal(doc, change.original))?.candidate ?? doc);
        }
        current.status = 'resumed';
        delete current.blockedReason;
        return this.#record(live.value, current);
      });
    } catch (error) {
      return this.ledger.transaction(() => {
        const live = this.#active(ref, revision.id);
        if (!live?.revision || !['ready', 'applying'].includes(live.revision.status)) {
          return fail('document-revision-apply-stale', '原实例或候选已变化，待核对实际文件。');
        }
        return this.#blocked(live.value, live.revision, reasonOf(error));
      });
    }
  }
}
