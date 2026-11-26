import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DurableCapability,
  DurableDelivery as DurableDeliveryNote,
  DurableEffectIntent,
  DurableEffectOutcome,
  DurableInstanceRef,
  DurableOwner,
  DurableProblem,
  DurableProjection,
  DurableResult,
  DurableScopeDecision, DurableEvidenceAuditProjection,
  DurableTaskBinding,
} from "../../src/model/durable-workflow.ts";
import type { ChiefDecisionExecutionContext, ClaimFileWriteFn } from "../../src/model/runtime.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { appendRoleLog, readRoleLog, redactRoleLogSummary } from "../../src/common/编排/role-log.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { createDaprHost } from "../../src/pipeline/orchestration/dapr-host.ts";
import { openDurableWorkflow } from "../../src/pipeline/orchestration/durable-workflow.ts";
import { createRuntimeAdapterFactory, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ChiefDecisionExecutor } from "./customer-input.ts";
import { buildEffectiveProjectConfig } from "./project.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import type { LifecycleHost } from "./session/lifecycle/host.ts";
import type { ClaimDurableTaskGit } from "./workflow-git.ts";

type WorkflowStore = Awaited<ReturnType<typeof openDurableWorkflow>>;
type DaprHost = ReturnType<typeof createDaprHost>;
type DurableSessionOwner = { projectRoot: string } & ({ ref: DurableInstanceRef } | { foreign: DurableOwner });

type DecisionSessionHost = Pick<LifecycleHost, "openObservedRoleSession" | "disposeObservedHandle" | "loadEffectiveConfig">;

export async function executeChiefDecision(
  context: ChiefDecisionExecutionContext, evidence: string, signal: AbortSignal,
  open: (signal: AbortSignal) => Promise<RoleSessionHandle>,
  dispose: DecisionSessionHost["disposeObservedHandle"],
): Promise<void> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(context.limits.timeoutMs)]);
  bounded.throwIfAborted();
  let handle: RoleSessionHandle | undefined;
  let cancel!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => {
      void handle?.abort?.().catch(() => undefined);
      reject(new Error("幕僚独立决策已取消或达到预算"));
    };
    bounded.addEventListener("abort", cancel, { once: true });
  });
  const opening = open(bounded);
  void opening.then(late => {
    if (bounded.aborted && handle !== late) void dispose(late).catch(() => undefined);
  }, () => undefined);
  try {
    handle = await Promise.race([opening, aborted]);
    bounded.throwIfAborted();
    const active = handle;
    void (async () => { for await (const _event of active.events()) { /* isolated decision stream */ } })().catch(() => undefined);
    await Promise.race([active.send(JSON.stringify({ request: context.request, evidence })), aborted]);
  } finally {
    bounded.removeEventListener("abort", cancel);
    if (handle) await dispose(handle);
  }
}

/** Uses the registered project and the engine recorded on the workflow, including after restart. */
export function durableChiefDecisionExecutor(
  deps: SessionManagerDeps, host: DecisionSessionHost, projectRoot: string, runtime: unknown,
): ChiefDecisionExecutor | undefined {
  const selection = deps.getRegisteredProjectLifecycle?.(projectRoot);
  if (!selection || !isRuntimeKind(runtime) || runtime === "demo") return undefined;
  return async (context, evidence, decidePendingRequest, signal) => {
    const current = () => deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === selection.selectionId;
    await executeChiefDecision(context, evidence, signal, async bounded => {
      await deps.prepareRuntimeProfile?.(runtime);
      bounded.throwIfAborted();
      const listing = deps.getListing(projectRoot);
      if (listing?.governanceModel !== "trio" || !current() || !context.request.durableWorkflow) {
        throw new Error("当前项目或持久卡的幕僚委托不可用");
      }
      const { project } = await buildEffectiveProjectConfig(listing, {
        buildProjectConfig: deps.buildProjectConfig, loadEffectiveConfig: host.loadEffectiveConfig,
      });
      bounded.throwIfAborted();
      if (!current()) throw new Error("项目窗口已切换");
      const createAdapter = deps.createRuntimeAdapterFactory
        ? deps.createRuntimeAdapterFactory(project, runtime, { ...deps.runtimeOptions, shellGate: deps.shellGate })
        : runtime === "pi" ? deps.createPiAdapterFactory(project, deps.shellGate)
          : createRuntimeAdapterFactory(project, runtime, deps.runtimeOptions);
      return host.openObservedRoleSession({ roleId: "chief", project, runtime, chiefDecisionContext: context,
        decidePendingRequest: (input, toolSignal) => decidePendingRequest(input, current()
          ? toolSignal ? AbortSignal.any([bounded, toolSignal]) : bounded : AbortSignal.abort()) }, { createAdapter });
    }, handle => host.disposeObservedHandle(handle));
  };
}

export interface DesktopDurableControlPlane {
  state: "stopped" | "starting" | "ready" | "failed";
  code?: string;
  message?: string;
}

export interface DesktopDurableDefinition {
  id: string;
  name?: string;
  source: "project" | "preset";
  version?: number;
  digest?: string;
  purpose?: string;
  file: string;
  error?: DurableProblem;
}

export interface DesktopDurableInstance {
  projectId: string;
  instanceId: string;
  definitionId: string;
  definitionVersion: number;
  definitionDigest: string;
  owner: "dapr";
  definitionName: string;
  definitionSource?: "project" | "preset";
  schema?: 1 | 2;
  flowId?: string;
  pendingTasks?: readonly { taskId: string; roleId: string; stepId: string; attempt: number; state: string }[];
  action?: string;
  engine: DurableProjection["engine"];
  runtime?: RuntimeKind;
  status: string;
  stepId: string;
  stepName: string;
  attempt: number;
  waiting?: string;
  blockedReason?: string;
  acceptanceEnvironment?: DurableProjection["acceptanceEnvironment"];
  approval?: { requestId: string; status: string; decisionId?: string; source?: "customer" | "delegated-chief" };
  evidence?: { kind: "analysis" | "scope" | "operator" | "approval"; sha256: string }[];
  evidenceAudit?: Pick<DurableEvidenceAuditProjection, "state" | "basis" | "missing">;
  scopeDecision?: DurableScopeDecision;
  delivery?: DesktopDurableDeliverySummary;
}

export type DesktopDurableDeliverySummary = Pick<DurableDeliveryNote, "id" | "state" | "releaseRequestId" | "createdAt" | "deliveredAt">;

export interface DesktopDurableDeliveryView {
  delivery: DurableDeliveryNote;
  viewToken: string;
}

export interface DesktopDurableView {
  controlPlane: DesktopDurableControlPlane;
  instance?: DesktopDurableInstance;
}

export type DesktopDurableSelection = { source?: "project" | "preset"; expectedDigest?: string };

export function durableSelection(request: Record<string, unknown>): DurableResult<DesktopDurableSelection> {
  const { source, expectedDigest } = request;
  if (source !== undefined && source !== "project" && source !== "preset"
    || expectedDigest !== undefined && (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest))) {
    return durableFailure("workflow-selection-invalid", "The definition source or digest is invalid.");
  }
  return { ok: true, value: { source, expectedDigest } };
}

export function durableFailure(code: string, message: string): DurableResult<never> {
  return { ok: false, code, message };
}

export function isDirectProductCapability(capability: DurableCapability | undefined): boolean {
  return capability === "product-prepare-direct" || capability === "author-intent-direct";
}

export async function recordWorkflowNotice(
  projectRoot: string, chief: string, notice: { ref: string; summary: string; taskId?: string },
): Promise<"recorded" | "existing" | "failed"> {
  const prior = await readRoleLog(projectRoot, { roleId: chief });
  if (prior.entries.some(entry => entry.kind === "workflow.notice" && entry.ref === notice.ref)) return "existing";
  const result = await appendRoleLog(projectRoot, chief, { kind: "workflow.notice", status: "blocked", ...notice });
  return result.ok ? "recorded" : "failed";
}

function deliverySummary(delivery: DurableDeliveryNote): DesktopDurableDeliverySummary {
  const { id, state, releaseRequestId, createdAt, deliveredAt } = delivery;
  return { id, state, releaseRequestId, createdAt, ...(deliveredAt ? { deliveredAt } : {}) };
}

const preparationNotices = new Map<string, string>();
const preparationAddress = (view: DurableProjection) => JSON.stringify([view.ref.projectId, view.ref.instanceId, view.acceptanceWorkspace?.prepareKey]);

export function workspacePreparationNotice(view: DurableProjection): string | undefined {
  return view.acceptanceWorkspace?.preparationGate ? preparationNotices.get(preparationAddress(view)) : undefined;
}

export function workspacePreparationSummary(view: DurableProjection): string | undefined {
  const stuck = workspacePreparationNotice(view);
  if (stuck) return stuck;
  const observed = view.acceptanceWorkspace?.preparation;
  if (!observed || !("stage" in observed.result)) return;
  const { result, basis, generation } = observed;
  const stages: Record<typeof result.stage, string> = { candidate: "候选核验", materials: "签发依据", entry: "入口核验",
    registration: "工作区登记", workspace: "隔离准备", reconciliation: "原作用对账" };
  const paths = result.paths?.map(item => `${item.path}（${{ present: "存在", missing: "缺失", unverified: "无法核验" }[item.state]}）`).join("、");
  const scope = view.blockedRouting?.a12bPrepareKey === observed.prepareKey ? view.blockedRouting : undefined;
  const actions = scope?.options.map(option => option.label).join("、");
  return `A12b ${stages[result.stage]}。第 ${generation} 次观察，候选 ${basis.candidateOid}。 ${result.reason}` +
    (paths ? ` 已核对路径 ${paths}。` : "") +
    (scope?.decision?.option === "wait" ? " 当前已选择等待客观条件恢复。" : actions ? ` 可选处置 ${actions}。` : "");
}

export function setWorkspacePreparationNotice(view: DurableProjection, text?: string) {
  const address = preparationAddress(view);
  if (!text) { preparationNotices.delete(address); return; }
  if (preparationNotices.size >= 128 && !preparationNotices.has(address)) preparationNotices.delete(preparationNotices.keys().next().value!);
  preparationNotices.set(address, text);
}

export function evidenceAuditBlockerSummary(view: DurableProjection): string | undefined {
  const audit = view.evidenceAudit;
  if (audit?.state !== "blocked") return;
  const missing = audit.missing.map(row => `${row.requirementId}（${row.reason}）`).join("、");
  return `${view.stepName} 等待实际取证。候选 ${audit.basis.candidateOid}，证据代次 ${audit.basis.generation}。${missing ? ` 缺项 ${missing}。` : ""}`;
}

export function durableInstanceView(projection: DurableProjection): DesktopDurableInstance {
  const { ref, status, stepId, stepName, attempt, waitingFor, blockedReason, release } = projection;
  return {
    projectId: ref.projectId,
    instanceId: ref.instanceId,
    definitionId: ref.definitionId,
    definitionVersion: ref.definitionVersion,
    definitionDigest: ref.definitionDigest,
    owner: "dapr",
    definitionName: projection.definitionName,
    definitionSource: projection.definitionSource,
    schema: projection.schema,
    flowId: projection.flowId,
    pendingTasks: projection.pendingTasks?.map(({ taskId, roleId, stepId, attempt, state }) => ({ taskId, roleId, stepId, attempt, state })),
    action: projection.action,
    engine: projection.engine,
    ...(isRuntimeKind(projection.metadata.runtime) ? { runtime: projection.metadata.runtime } : {}),
    status,
    stepId,
    stepName,
    attempt,
    waiting: waitingFor,
    blockedReason: evidenceAuditBlockerSummary(projection) ?? workspacePreparationSummary(projection) ?? blockedReason,
    ...(projection.acceptanceEnvironment ? { acceptanceEnvironment: projection.acceptanceEnvironment } : {}),
    ...(release ? { approval: { requestId: release.requestId, status: release.decision?.action ?? "pending",
      ...(release.decision ? { decisionId: release.decision.id, source: release.decision.source } : {}) } } : {}),
    ...(projection.scopeDecision ? { scopeDecision: projection.scopeDecision } : {}),
    ...(projection.evidenceAudit ? { evidenceAudit: { state: projection.evidenceAudit.state,
      basis: projection.evidenceAudit.basis, missing: projection.evidenceAudit.missing } } : {}),
    ...(projection.delivery ? { delivery: deliverySummary(projection.delivery) } : {}),
    evidence: [
      ...(projection.analysisReport ? [{ kind: "analysis" as const, sha256: projection.analysisReport.evidence.sha256 }] : []),
      ...(projection.scope ? [{ kind: "scope" as const, sha256: projection.scope.requestDigest }] : []),
      ...(projection.implementation ? [{ kind: "operator" as const, sha256: projection.implementation.operatorReport.sha256 }] : []),
      ...(release ? [{ kind: "approval" as const, sha256: release.digest }] : []),
    ],
  };
}

export function durableRequest(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

export function durableIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
}

export function durableHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function durableTaskId(ref: DurableInstanceRef, role: string, stage: string, attempt: number): string {
  return `dw-${durableHash(JSON.stringify([ref.projectId, ref.instanceId, role, stage, attempt])).slice(0, 32)}`;
}

interface DurableDelivery {
  ref: DurableInstanceRef;
  roleId: string;
  runtime: RuntimeKind;
  intent: DurableEffectIntent;
  assignmentTaskId?: string;
  selectionId?: string;
  workflowOwnedDispatch?: boolean;
}

export class DesktopDurableWorkflow {
  private readonly dataDir: string;
  private readonly presetRoot?: string;
  private readonly host: DaprHost;
  private storePromise?: Promise<WorkflowStore>;
  private recovery?: ReturnType<typeof setInterval>;
  private working?: Promise<void>;
  private generation?: number;
  private workerProblem?: Pick<DurableProblem, "code" | "message">;
  private closing = false;
  private startWanted = false;
  private retryAfter = 0;
  private readonly projectWorkers = new Map<string, (projection: DurableProjection) => Promise<void>>();
  private readonly observedEnvironmentBlocks = new Set<string>();
  private readonly deliveries = new Map<string, DurableDelivery>();
  private readonly sessions = new WeakMap<object, DurableSessionOwner | undefined>();

  constructor(options: { userDataRoot: string; resourceRoot: string; presetRoot?: string }) {
    this.dataDir = path.join(options.userDataRoot, "business");
    this.presetRoot = options.presetRoot;
    this.host = createDaprHost(options);
  }

  store(): Promise<WorkflowStore> {
    this.storePromise ??= Promise.resolve().then(() => openDurableWorkflow({ dataDir: this.dataDir, presetRoot: this.presetRoot })).catch(error => {
      this.storePromise = undefined;
      throw error;
    });
    return this.storePromise;
  }

  hasStoredBusiness(): Promise<boolean> {
    return fs.stat(this.dataDir).then(stat => stat.isDirectory(), error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    });
  }

  async resume(): Promise<void> {
    if (!await this.hasStoredBusiness() || this.closing) return;
    // Existing persisted data is needed before the control plane can reattach.
    if ((await this.store()).activeProjections().length !== 0) this.activate();
  }

  activate(): void {
    if (this.closing) return;
    this.startWanted = true;
    if (this.recovery === undefined) {
      this.recovery = setInterval(() => this.kick(), 2_000);
      this.recovery.unref();
    }
    this.kick();
  }

  private kick(): void {
    if (!this.startWanted || this.closing || this.working || Date.now() < this.retryAfter) return;
    this.working = this.tick().catch(() => {
      this.workerProblem = { code: "workflow-worker-unavailable", message: "Workflow worker failed to reconcile." };
      this.retryAfter = Date.now() + 5_000;
    }).finally(() => { this.working = undefined; });
  }

  private async tick(): Promise<void> {
    const store = await this.store();
    let status = this.host.status();
    if (status.state !== "ready" && this.generation !== undefined) {
      await store.stopWorker();
      this.generation = undefined;
    }
    if (!this.startWanted || this.closing) return;
    if (status.state !== "ready") status = await this.host.start();
    if (status.state !== "ready" || !status.connection) {
      this.retryAfter = Date.now() + 5_000;
      return;
    }
    if (this.generation !== status.generation) {
      if (this.generation !== undefined) await store.stopWorker();
      const worker = await store.startWorker(status.connection);
      if (worker.state !== "registered") {
        this.workerProblem = { code: `workflow-worker-${worker.state}`, message: worker.reason ?? "Workflow worker registration is pending." };
        this.retryAfter = Date.now() + 5_000;
        return;
      }
      this.generation = status.generation;
      this.workerProblem = undefined;
    }
    await store.reconcile();
    for (const projection of store.activeProjections()) {
      await this.projectWorkers.get(projection.projectRoot)?.(projection);
    }
    for (const [projectRoot, update] of this.projectWorkers) {
      const waiting = (await store.listProjections(projectRoot)).filter(projection => projection.acceptanceEnvironment?.state === "blocked"
        && !this.observedEnvironmentBlocks.has(projection.ref.instanceId));
      for (const projection of waiting) {
        await update(projection);
        this.observedEnvironmentBlocks.add(projection.ref.instanceId);
      }
    }
  }

  observeProject(projectRoot: string, update: (projection: DurableProjection) => Promise<void>): () => void {
    this.projectWorkers.set(projectRoot, update);
    this.kick();
    return () => {
      if (this.projectWorkers.get(projectRoot) === update) this.projectWorkers.delete(projectRoot);
    };
  }

  controlPlane(): DesktopDurableControlPlane {
    const status = this.host.status();
    if (this.workerProblem) return { state: "failed", ...this.workerProblem };
    if (status.state === "ready" && this.generation === undefined) return { state: "starting" };
    return {
      state: status.state,
      ...(status.diagnostic ? { code: status.diagnostic.code, message: status.diagnostic.message } : {}),
    };
  }

  view(projection?: DurableProjection): DesktopDurableView {
    return { controlPlane: this.controlPlane(), ...(projection ? { instance: durableInstanceView(projection) } : {}) };
  }

  async listDefinitions(projectRoot: string): Promise<DesktopDurableDefinition[]> {
    const entries = await (await this.store()).listDefinitions(projectRoot);
    return entries.map(({ file, source, definition, code, message, path: field }) => {
      const first = definition?.steps[definition.start];
      const action = first && "action" in first ? first.action : undefined;
      const purpose = action === "product-prepare" || action === "product-prepare-direct" ? "New product work with full governance"
        : action === "observe-existing" || action === "b1-impact-readonly" ? "Existing implementation and supportable file-level scope required"
        : action === "readonly-report" ? "Read-only work, no change authorization" : undefined;
      return ({
      id: definition?.id ?? path.basename(file, path.extname(file)),
      file: path.basename(file),
      source,
      ...(definition ? { name: definition.name, version: definition.version, digest: definition.digest, purpose } : {
        error: { code: code ?? "workflow-definition-invalid", message: message ?? "The workflow definition could not be read.",
          ...(field ? { path: field } : {}) },
      }),
      });
    });
  }

  async validateDefinition(projectRoot: string, definitionId: string, selection: DesktopDurableSelection = {}): Promise<DurableResult<DesktopDurableDefinition>> {
    const store = await this.store();
    const validated = await store.validateDefinition(projectRoot, definitionId, selection);
    if (!validated.ok) return validated;
    const { id, name, version, digest } = validated.value;
    const entries = await store.listDefinitions(projectRoot);
    const entry = entries.find(entry => entry.definition?.id === id && entry.definition.digest === digest
      && (selection.source === undefined || selection.source === entry.source));
    return { ok: true, value: { id, name, version, digest, source: entry?.source ?? selection.source ?? "project",
      file: entry ? path.basename(entry.file) : `${id}.yaml` } };
  }

  async copyPreset(projectRoot: string, definitionId: string): Promise<DurableResult<DesktopDurableDefinition>> {
    const saved = await (await this.store()).copyPreset(projectRoot, definitionId);
    if (!saved.ok) return saved;
    return this.validateDefinition(projectRoot, saved.value.definition.id, { source: "project", expectedDigest: saved.value.definition.digest });
  }

  async importDefinition(projectRoot: string, selectedFile: string): Promise<DurableResult<DesktopDurableDefinition>> {
    const saved = await (await this.store()).importDefinition(projectRoot, selectedFile);
    if (!saved.ok) return saved;
    return this.validateDefinition(projectRoot, saved.value.definition.id, { source: "project", expectedDigest: saved.value.definition.digest });
  }

  async start(projectRoot: string, definitionId: string, requestId: string, summary: string, runtime: RuntimeKind, selection: DesktopDurableSelection = {}): Promise<DurableResult<DesktopDurableView>> {
    const result = await (await this.store()).start({ projectRoot, definitionId, requestId, ...selection, metadata: { summary, runtime } });
    if (!result.ok) return result;
    if (result.value.status === "waiting") this.activate();
    return { ok: true, value: this.view(result.value) };
  }

  async find(projectRoot: string, instanceId?: string): Promise<DurableProjection | undefined> {
    return (await this.store()).projection(projectRoot, instanceId);
  }

  evidenceCollectorRoleForProject(projectRoot: string): (flowId: string) => Promise<string | undefined> {
    let project: Promise<DurableProjection[]> | undefined;
    const readProject = async () => {
      if (!await this.hasStoredBusiness()) return [];
      const root = await fs.realpath(projectRoot);
      const store = await this.store();
      return (await store.listProjections(projectRoot)).filter(view => view.status === "waiting" && path.relative(root, view.projectRoot) === "");
    };
    return async flowId => {
      if (!flowId) return undefined;
      project ??= readProject().catch(() => []);
      const matching = (await project).filter(view => view.flowId === flowId);
      if (matching.length !== 1) return undefined;
      const view = matching[0];
      const roleId = view?.evidenceCollectorRoleId;
      return view?.schema === 2 && view.engine !== "incompatible" && view.engine !== "history-missing" && view.evidenceAuditEnabled === true
        && roleId && roleId.trim() === roleId ? roleId : undefined;
    };
  }

  async owns(projectRoot: string, instanceId?: string): Promise<boolean> {
    const store = await this.store();
    if ((await store.owner(projectRoot, instanceId))?.engine === "dapr") return true;
    return instanceId === undefined && (await store.listProjections(projectRoot)).some(projection => projection.status === "waiting");
  }

  async lookup(ref: DurableInstanceRef): Promise<DurableProjection | undefined> {
    return (await this.store()).lookup(ref);
  }

  async findDelivery(projectRoot: string, instanceId: string, deliveryId: string): Promise<
    DurableResult<{ ref: DurableInstanceRef; delivery: DurableDeliveryNote }>
  > {
    const projection = await this.find(projectRoot, instanceId);
    const delivery = projection?.delivery;
    if (!projection || !delivery || delivery.id !== deliveryId
      || projection.release?.requestId !== delivery.releaseRequestId || projection.release.decision?.action !== "approve") {
      return durableFailure("workflow-delivery-not-found", "The workflow has no matching delivery explanation.");
    }
    return { ok: true, value: { ref: projection.ref, delivery } };
  }

  async acknowledgeDelivery(ref: DurableInstanceRef, delivery: DurableDeliveryNote, isCurrent: () => boolean): Promise<
    DurableResult<DesktopDurableDeliverySummary>
  > {
    const store = await this.store();
    if (!isCurrent()) return durableFailure("workflow-project-unselected", "The selected project changed.");
    const result = store.acknowledgeDelivery(ref, { deliveryId: delivery.id, requestId: delivery.releaseRequestId });
    return result.ok ? { ok: true, value: deliverySummary(result.value) } : result;
  }

  registerDelivery(projectRoot: string, clientMessageId: string, delivery: DurableDelivery): void {
    this.deliveries.set(`${projectRoot}\0${clientMessageId}`, delivery);
  }

  delivery(projectRoot: string, clientMessageId: string | undefined): DurableDelivery | undefined {
    return clientMessageId === undefined ? undefined : this.deliveries.get(`${projectRoot}\0${clientMessageId}`);
  }

  async rejectWorkflowDispatch(ref: DurableInstanceRef, task: DurableTaskBinding, reason: string, chief: string): Promise<string | undefined> {
    const store = await this.store();
    const view = store.lookup(ref);
    const pending = view?.pendingTasks?.find(item => item.taskId === task.taskId && item.stepId === view.stepId
      && item.attempt === view.attempt && item.state === "pending" && item.dispatch.actor === "application");
    const legacyIntent = pending?.capability === "author-intent-direct" && task.roleId === "product"
      && task.stage === "A2" && task.parentTaskId === ref.instanceId;
    if (!view || view.status !== "waiting" || !view.flowId || task.stageAttempt !== view.attempt
      || !view.workflowOwnedDispatch && !legacyIntent) return undefined;
    const effect = store.listEffects(ref, "model-send").find(item => item.intent.task?.taskId === task.taskId);
    if (effect && effect.state !== "not-started") return undefined;
    const revision = view.documentRevision;
    if (revision?.status === "pending" && revision.task.taskId === task.taskId && revision.roleId === task.roleId
      && revision.task.parentTaskId === task.parentTaskId) {
      await store.failDocumentRevision(ref, { revisionId: revision.id,
        reason: `修订未派达。原因 ${redactRoleLogSummary(reason, view.projectRoot)}` });
      this.activate();
      return undefined;
    }
    const kind = legacyIntent ? "product-dispatch-failed" : "task-dispatch-failed";
    const key = `${kind}:${task.taskId}`;
    const summary = `${task.stage} 工作流任务未派达（${ref.instanceId}），请幕僚处理。原因：${redactRoleLogSummary(reason, view.projectRoot)}`;
    const notice = await recordWorkflowNotice(view.projectRoot, chief, { ref: key, summary, taskId: task.taskId });
    if (notice === "failed") {
      store.block(ref, "workflow-notice-unavailable", summary);
      return undefined;
    }
    if (!pending) {
      store.block(ref, "workflow-dispatch-failed", summary);
      return undefined;
    }
    const saved = await store.submitCapability(ref, {
      key, stepId: view.stepId, attempt: view.attempt, flowId: view.flowId,
      source: { roleId: "host", originId: task.taskId, parentTaskId: task.taskId },
      input: { kind, task, reason: summary.slice(0, 500) },
    });
    return saved.ok && saved.value.state !== "ignored" ? summary : undefined;
  }

  taskEffectClaims(
    session: { projectRoot: string; taskId?: string; roleId: string },
    currentClientMessage: () => string | undefined,
  ): { claimTaskGit: ClaimDurableTaskGit; claimFileWrite: ClaimFileWriteFn } {
    const currentDelivery = () => this.delivery(session.projectRoot, currentClientMessage());
    const claimTaskGit: ClaimDurableTaskGit = async input => {
      const delivery = currentDelivery();
      const task = delivery?.intent.task;
      if (!delivery || delivery.roleId !== session.roleId || task?.taskId !== session.taskId || task && task.roleId !== session.roleId) {
        return durableFailure("workflow-task-write-forbidden", "The current session does not hold the authorized role turn or task.");
      }
      const store = await this.store();
      const projection = await this.lookup(delivery.ref);
      if (!projection || currentDelivery() !== delivery ||
        (input.expected.branch !== undefined && input.expected.branch !== projection.baseline?.branch)) {
        return durableFailure("workflow-task-write-stale", "The original task or task branch changed.");
      }
      if (projection.a11Disposition?.retest && projection.a11Disposition.childTask.taskId === task?.taskId) {
        return durableFailure("workflow-a11-retest-write-forbidden", "A11 同候选补测回合禁止文件写入和 Git 写操作。");
      }
      const current = delivery.intent.stepId === projection.stepId && delivery.intent.attempt === projection.attempt;
      const pending = projection.pendingTasks?.find(item => item.taskId === task?.taskId && item.roleId === session.roleId
        && item.stepId === delivery.intent.stepId && item.attempt === delivery.intent.attempt && item.state === "pending");
      const preparation = current && (projection.action === "confirm-intent" && !task && session.roleId === "chief" ||
        projection.action === "team-baseline" && task?.stage === "A9" && session.roleId === "convener");
      const allowed = projection.schema === 2 && projection.pendingTasks !== undefined
        ? Boolean(pending && (current || pending.capability === "independent-standard") || preparation)
          || Boolean(task?.stage === "B3" && projection.task?.taskId === task.taskId)
        : Boolean(task?.stage === "B3" && projection.task?.taskId === task.taskId) || Boolean(projection.schema === 2 && preparation);
      if (!allowed) return durableFailure("workflow-task-write-forbidden", "The current capability has no matching write scope.");
      const claim = await store.claimEffect(delivery.ref, {
        ...input, stepId: delivery.intent.stepId, attempt: delivery.intent.attempt, task,
        ...(projection.schema === 2 && !task ? { expected: { ...input.expected, roleId: session.roleId } } : {}),
      });
      if (!claim.ok) return claim;
      if (!claim.value.execute && claim.value.state !== "succeeded") {
        return durableFailure("workflow-task-operation-unknown", "An earlier actual operation requires verification.");
      }
      const finish = async (outcome: DurableEffectOutcome["outcome"], evidence: string, result?: DurableEffectOutcome["result"]): Promise<void> => {
        const settled = await store.settleEffect(delivery.ref, { key: claim.value.key, token: claim.value.token, outcome, evidence, result });
        if (!settled.ok) throw new Error(`${settled.code}: ${settled.message}`);
      };
      const activeDisposition = store.lookup(delivery.ref)?.a11Disposition;
      if (claim.value.execute && (currentDelivery() !== delivery
        || activeDisposition?.retest && activeDisposition.childTask.taskId === task?.taskId)) {
        await finish("not-started", "session changed before the actual write or Git command");
        return durableFailure("workflow-task-write-stale", "The task session changed before execution.");
      }
      return { ok: true, value: { execute: claim.value.execute, finish } };
    };
    const claimFileWrite: ClaimFileWriteFn = async input => {
      const relative = path.relative(session.projectRoot, input.targetPath);
      if (input.signal?.aborted || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return durableFailure("workflow-file-write-outside-task", "The actual file target is outside the task worktree.");
      }
      const result = await claimTaskGit({ kind: "task-write", key: `file:${input.operationId}`,
        expected: { paths: [relative.split(path.sep).join("/")], contentSha256: input.contentSha256, operation: input.operation } });
      if (!result.ok) return result;
      if (!result.value.execute) return durableFailure("workflow-file-write-recorded", "The exact file operation is already recorded.");
      if (input.signal?.aborted) {
        await result.value.finish("not-started", "operation stopped before the actual file effect");
        return durableFailure("workflow-file-write-cancelled", "The file operation stopped before execution.");
      }
      return { ok: true, value: { finish: result.value.finish } };
    };
    return { claimTaskGit, claimFileWrite };
  }

  async markSession(handle: object, projectRoot: string, projection?: DurableProjection): Promise<void> {
    if (projection?.status === "waiting") {
      this.sessions.set(handle, { projectRoot, ref: projection.ref });
      return;
    }
    const owner = await (await this.store()).owner(projectRoot);
    this.sessions.set(handle, owner?.engine === "dapr" && !owner.ownedByThisDataDir ? { projectRoot, foreign: owner } : undefined);
  }

  isSession(handle: object): boolean { return this.sessions.has(handle); }

  async canRebindCompletedSession(projectRoot: string, handle: object): Promise<boolean> {
    const binding = this.sessions.get(handle);
    if (binding?.projectRoot !== projectRoot) return false;
    const store = await this.store();
    const projections = await store.listProjections(projectRoot);
    if (projections.some(projection => projection.status === "waiting") || await store.owner(projectRoot)) return false;
    // A foreign workflow was never executable by this handle. Its shared owner is authoritative here.
    if ("foreign" in binding) return true;
    const { ref } = binding;
    return projections.some(projection => projection.ref.instanceId === ref.instanceId
      && projection.ref.projectId === ref.projectId && projection.ref.definitionDigest === ref.definitionDigest
      && projection.status !== "waiting");
  }

  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.recovery);
    await this.working;
    const store = await this.storePromise;
    try {
      await store?.close();
    } finally {
      await this.host.stop();
    }
  }
}
