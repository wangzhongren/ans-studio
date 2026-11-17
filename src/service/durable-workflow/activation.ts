import type {
  DurableProjection, DurableResult, DurableStartInput, DurableStartProposal,
  DurableStartProposalDecisionInput, DurableStartProposalInput,
} from '../../model/durable-workflow.ts';
import { digest, stableJson, workspaceIdentity } from '../../provider/durable-workflow/public.ts';
import type {
  DurableLedger, StoredStartProposal, StoredStartSelection, WorkspaceIdentity,
} from '../../provider/durable-workflow/public.ts';
import { equal, fail, hashValid, ok, validKey } from './rules.ts';

type IsCurrent = () => boolean;
type Select = (root: string, definitionId: string) => Promise<DurableResult<StoredStartSelection>>;
type Start = (input: DurableStartInput, selection: StoredStartSelection, current: IsCurrent) => Promise<DurableResult<DurableProjection>>;

const sourceStale = () => fail('workflow-start-source-stale', '当前窗口、客户需求或受信回合已变化。');
const notFound = () => fail('workflow-start-proposal-not-found', '这个项目没有对应的工作流启用提议。');

function selectionMatches(first: StoredStartSelection, second: StoredStartSelection): boolean {
  return first.source === second.source && first.file === second.file && first.fileDigest === second.fileDigest
    && first.definition.digest === second.definition.digest;
}

export class WorkflowStartActivation {
  readonly #starting = new Map<string, Promise<DurableResult<DurableStartProposal>>>();
  private readonly ledger: DurableLedger;
  private readonly select: Select;
  private readonly start: Start;

  constructor(ledger: DurableLedger, select: Select, start: Start) {
    this.ledger = ledger;
    this.select = select;
    this.start = start;
  }

  async #workspace(projectRoot: string): Promise<WorkspaceIdentity | undefined> {
    return workspaceIdentity(projectRoot).catch(() => undefined);
  }

  #read(workspace: WorkspaceIdentity | undefined, activationId: string): StoredStartProposal | undefined {
    if (!workspace || !validKey(activationId)) return undefined;
    const value = this.ledger.startProposal(activationId);
    return value?.proposal.projectId === workspace.projectId && value.start.projectRoot === workspace.root ? value : undefined;
  }

  #view(value: StoredStartProposal): DurableStartProposal {
    const proposal = value.proposal;
    const instance = proposal.instanceRef && this.ledger.instance(proposal.instanceRef.instanceId);
    if (!instance) return proposal;
    return { ...proposal, startup: { state: instance.scheduled ? 'scheduled' : 'created',
      ...(instance.engineReason ? { message: instance.engineReason } : {}) } };
  }

  #transaction<T>(operation: () => DurableResult<T>): DurableResult<T> {
    try { return this.ledger.transaction(operation); }
    catch { return fail('workflow-start-storage-unavailable', '启用记录暂未写入，可以使用原标识核对或重试。'); }
  }

  async list(projectRoot: string): Promise<DurableStartProposal[]> {
    const workspace = await this.#workspace(projectRoot);
    return workspace ? this.ledger.startProposals(workspace.projectId).map(value => this.#view(value)) : [];
  }

  async propose(input: DurableStartProposalInput, current?: IsCurrent): Promise<DurableResult<DurableStartProposal>> {
    if (!current?.()) return sourceStale();
    const { requirement, definitionId, expectedDigest, source, customerPurpose } = input;
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!requirement || ![requirement.inputId, requirement.turnId, requirement.runtime].every(validKey)
      || typeof requirement.text !== 'string' || !requirement.text.trim() || digest(requirement.text) !== requirement.digest
      || !reason || !['project', 'preset'].includes(source) || !hashValid(expectedDigest)) {
      return fail('workflow-start-proposal-invalid', '提议需绑定原客户输入、真实回合、有效定义和选择理由。');
    }
    const workspace = await this.#workspace(input.projectRoot);
    if (!workspace) return fail('workflow-workspace-invalid', '请选择可核验的工作区根目录。');
    const { root, projectId } = workspace;
    const fingerprint = digest(stableJson([definitionId, source, expectedDigest, reason, requirement.text, requirement.digest,
      requirement.runtime, customerPurpose ?? null]));
    const selected = await this.select(root, definitionId);
    return this.#transaction(() => {
      if (!current()) return sourceStale();
      const history = this.ledger.startProposals(projectId, requirement.inputId);
      const latest = history.at(-1);
      if (latest && (latest.proposal.requirement.text !== requirement.text
        || latest.proposal.requirement.digest !== requirement.digest || latest.proposal.requirement.runtime !== requirement.runtime)) {
        return fail('workflow-start-input-conflict', '同一客户输入标识已绑定不同的内容或运行时。');
      }
      const replay = history.findLast(value => value.fingerprint === fingerprint
        && (value.proposal.state !== 'stale' || !selected.ok || selectionMatches(value.selection, selected.value)));
      if (replay) return ok(this.#view(replay));
      if (latest && ['pending', 'approved', 'started'].includes(latest.proposal.state)) {
        return fail('workflow-start-proposal-conflict', '原需求已有提议或启动记录，请先处置仍待决的提议。');
      }
      if (!selected.ok) return selected;
      const selection = selected.value;
      const definition = selection.definition;
      if (selection.source !== source || definition.digest !== expectedDigest) {
        return fail('workflow-start-definition-changed', '定义的有效来源或摘要已变化，请重新查看目录。');
      }
      const generation = (latest?.proposal.generation ?? 0) + 1;
      const identity = digest(stableJson([projectId, requirement.inputId, generation]));
      const activationId = 'activate-' + identity;
      const proposal: DurableStartProposal = { activationId, projectId, requestId: 'workflow-start-card-' + identity,
        generation, state: 'pending', definition: { id: definition.id, name: definition.name, version: definition.version,
          digest: definition.digest, source }, requirement, reason, createdAt: new Date().toISOString() };
      const start: DurableStartInput = { projectRoot: root, definitionId, source, expectedDigest, customerPurpose,
        requestId: 'workflow-start-' + identity, metadata: { summary: requirement.text, runtime: requirement.runtime, activationId } };
      this.ledger.saveStartProposal({ proposal, selection, fingerprint, start });
      return ok(proposal);
    });
  }

  async refresh(projectRoot: string, activationId: string, current?: IsCurrent): Promise<DurableResult<DurableStartProposal>> {
    const workspace = await this.#workspace(projectRoot);
    const value = this.#read(workspace, activationId);
    if (!value) return notFound();
    if (value.proposal.state !== 'pending') return ok(this.#view(value));
    const selected = await this.select(value.start.projectRoot, value.proposal.definition.id);
    return this.#transaction(() => {
      if (current && !current()) return sourceStale();
      const checked = this.#read(workspace, activationId);
      if (!checked) return notFound();
      if (checked.proposal.state === 'pending' && (!selected.ok || !selectionMatches(checked.selection, selected.value))) {
        checked.proposal.state = 'stale';
        this.ledger.saveStartProposal(checked);
      }
      return ok(this.#view(checked));
    });
  }

  async decide(input: DurableStartProposalDecisionInput, current?: IsCurrent): Promise<DurableResult<DurableStartProposal>> {
    if (!current?.()) return sourceStale();
    if (!['approve', 'reject', 'revoke'].includes(input.action)) return fail('workflow-start-decision-invalid', '启用决定无效。');
    const workspace = await this.#workspace(input.projectRoot);
    const value = this.#read(workspace, input.activationId);
    if (!value || value.proposal.requestId !== input.requestId) return notFound();
    const selected = value.proposal.state === 'pending' && input.action !== 'revoke'
      ? await this.select(value.start.projectRoot, value.proposal.definition.id) : undefined;
    const currentWorkspace = await this.#workspace(input.projectRoot);
    return this.#transaction(() => {
      if (!current()) return sourceStale();
      const checked = this.#read(currentWorkspace, input.activationId);
      if (!checked || checked.proposal.requestId !== input.requestId) return notFound();
      const proposal = checked.proposal;
      if (proposal.decision?.action === input.action) return ok(this.#view(checked));
      if (proposal.state !== 'pending') {
        return fail(proposal.state === 'stale' ? 'workflow-start-proposal-stale' : 'workflow-start-decision-conflict',
          '该启用提议已失效或已保存其他决定。');
      }
      if (input.action !== 'revoke' && (!selected?.ok || !selectionMatches(checked.selection, selected.value))) {
        proposal.state = 'stale';
        this.ledger.saveStartProposal(checked);
        return fail('workflow-start-proposal-stale', '定义文件或有效来源已变化，请在新提议中重新核对。');
      }
      proposal.decision = { action: input.action, source: 'customer', at: new Date().toISOString() };
      proposal.state = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'revoked';
      if (input.action === 'approve') {
        proposal.startup = { state: 'waiting' };
        this.ledger.saveApprovedStart({ activationId: input.activationId, start: checked.start, selection: checked.selection });
      }
      this.ledger.saveStartProposal(checked);
      return ok(proposal);
    });
  }

  async startApproved(projectRoot: string, activationId: string, current?: IsCurrent): Promise<DurableResult<DurableStartProposal>> {
    if (!current?.()) return sourceStale();
    const workspace = await this.#workspace(projectRoot);
    const value = this.#read(workspace, activationId);
    if (!value) return notFound();
    if (value.proposal.state === 'started') return ok(this.#view(value));
    if (value.proposal.state !== 'approved' || value.proposal.decision?.action !== 'approve'
      || value.proposal.decision.source !== 'customer') {
      return fail('workflow-start-confirmation-required', '该提议还没有本人的启用批准。');
    }
    const existing = this.#starting.get(activationId);
    if (existing) return existing;
    const operation = this.#runApproved(value, current).finally(() => this.#starting.delete(activationId));
    this.#starting.set(activationId, operation);
    return operation;
  }

  async #runApproved(value: StoredStartProposal, current: IsCurrent): Promise<DurableResult<DurableStartProposal>> {
    const { activationId } = value.proposal;
    const job = this.ledger.approvedStart(activationId);
    if (!job || job.activationId !== activationId || !equal(value.start, job.start) || !equal(value.selection, job.selection)) {
      return fail('workflow-start-approval-invalid', '批准记录缺少匹配的定版启动待办。');
    }
    const { digest: savedDigest, ...graph } = job.selection.definition;
    if (savedDigest !== job.start.expectedDigest || digest(stableJson(graph)) !== savedDigest) {
      return fail('workflow-start-approval-invalid', '定版定义的内容与批准摘要不符。');
    }
    const result = await this.start(job.start, job.selection, current).catch(() =>
      fail('workflow-start-storage-unavailable', '启动暂未核对完成，可以使用原标识重试。'));
    return this.#transaction(() => {
      const checked = this.ledger.startProposal(activationId);
      if (!checked || (checked.proposal.state !== 'approved' && checked.proposal.state !== 'started')) return notFound();
      if (checked.proposal.state === 'started') return ok(this.#view(checked));
      if (result.ok) {
        checked.proposal.state = 'started';
        checked.proposal.instanceRef = result.value.ref;
        checked.proposal.startup = { state: 'created' };
      } else if (result.code === 'workflow-start-source-stale') return result;
      else {
        const blocked = { state: 'blocked' as const, code: result.code, message: result.message };
        if (equal(checked.proposal.startup, blocked)) return ok(this.#view(checked));
        checked.proposal.startup = blocked;
      }
      this.ledger.saveStartProposal(checked);
      return ok(this.#view(checked));
    });
  }
}
