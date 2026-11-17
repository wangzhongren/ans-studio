import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DurableEffectIntent,
  DurableEffectOutcome,
  DurableInstanceRef,
  DurableProblem,
  DurableProjection,
  DurableResult,
} from "../../src/model/durable-workflow.ts";
import type { ClaimFileWriteFn } from "../../src/model/runtime.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { createDaprHost } from "../../src/pipeline/orchestration/dapr-host.ts";
import { openDurableWorkflow } from "../../src/pipeline/orchestration/durable-workflow.ts";
import type { ClaimDurableTaskGit } from "./workflow-git.ts";

type WorkflowStore = Awaited<ReturnType<typeof openDurableWorkflow>>;
type DaprHost = ReturnType<typeof createDaprHost>;

export interface DesktopDurableControlPlane {
  state: "stopped" | "starting" | "ready" | "failed";
  code?: string;
  message?: string;
}

export interface DesktopDurableDefinition {
  id: string;
  version?: number;
  digest?: string;
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
  action?: string;
  engine: DurableProjection["engine"];
  runtime?: RuntimeKind;
  status: string;
  stepId: string;
  stepName: string;
  attempt: number;
  waiting?: string;
  blockedReason?: string;
  approval?: { requestId: string; status: string };
  evidence?: { kind: "analysis" | "scope" | "operator" | "approval"; sha256: string }[];
}

export interface DesktopDurableView {
  controlPlane: DesktopDurableControlPlane;
  instance?: DesktopDurableInstance;
}

export function durableFailure(code: string, message: string): DurableResult<never> {
  return { ok: false, code, message };
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
    action: projection.action,
    engine: projection.engine,
    ...(isRuntimeKind(projection.metadata.runtime) ? { runtime: projection.metadata.runtime } : {}),
    status,
    stepId,
    stepName,
    attempt,
    waiting: waitingFor,
    blockedReason,
    ...(release ? { approval: { requestId: release.requestId, status: release.decision?.action ?? "pending" } } : {}),
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
}

export class DesktopDurableWorkflow {
  private readonly dataDir: string;
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
  private readonly deliveries = new Map<string, DurableDelivery>();
  private readonly sessions = new WeakSet<object>();

  constructor(options: { userDataRoot: string; resourceRoot: string }) {
    this.dataDir = path.join(options.userDataRoot, "business");
    this.host = createDaprHost(options);
  }

  store(): Promise<WorkflowStore> {
    this.storePromise ??= Promise.resolve().then(() => openDurableWorkflow({ dataDir: this.dataDir })).catch(error => {
      this.storePromise = undefined;
      throw error;
    });
    return this.storePromise;
  }

  async resume(): Promise<void> {
    const present = await fs.stat(this.dataDir).then(stat => stat.isDirectory(), error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    });
    if (!present || this.closing) return;
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
    return entries.map(({ file, definition, code, message, path: field }) => ({
      id: definition?.id ?? path.basename(file, path.extname(file)),
      file: path.basename(file),
      ...(definition ? { version: definition.version, digest: definition.digest } : {
        error: { code: code ?? "workflow-definition-invalid", message: message ?? "The workflow definition could not be read.",
          ...(field ? { path: field } : {}) },
      }),
    }));
  }

  async validateDefinition(projectRoot: string, definitionId: string): Promise<DurableResult<DesktopDurableDefinition>> {
    const store = await this.store();
    const validated = await store.validateDefinition(projectRoot, definitionId);
    if (!validated.ok) return validated;
    const { id, version, digest } = validated.value;
    const entries = await store.listDefinitions(projectRoot);
    const file = entries.find(entry => entry.definition?.id === id && entry.definition.digest === digest)?.file;
    return { ok: true, value: { id, version, digest, file: file ? path.basename(file) : `${id}.yaml` } };
  }

  async start(projectRoot: string, definitionId: string, requestId: string, summary: string, runtime: RuntimeKind): Promise<DurableResult<DesktopDurableView>> {
    const result = await (await this.store()).start({ projectRoot, definitionId, requestId, metadata: { summary, runtime } });
    if (!result.ok) return result;
    if (result.value.status === "waiting") this.activate();
    return { ok: true, value: this.view(result.value) };
  }

  async find(projectRoot: string, instanceId?: string): Promise<DurableProjection | undefined> {
    return (await this.store()).projection(projectRoot, instanceId);
  }

  async owns(projectRoot: string, instanceId?: string): Promise<boolean> {
    const store = await this.store();
    if ((await store.owner(projectRoot, instanceId))?.engine === "dapr") return true;
    return instanceId === undefined && (await store.listProjections(projectRoot)).some(projection => projection.status === "waiting");
  }

  async lookup(ref: DurableInstanceRef): Promise<DurableProjection | undefined> {
    return (await this.store()).lookup(ref);
  }

  registerDelivery(projectRoot: string, clientMessageId: string, delivery: DurableDelivery): void {
    this.deliveries.set(`${projectRoot}\0${clientMessageId}`, delivery);
  }

  delivery(projectRoot: string, clientMessageId: string | undefined): DurableDelivery | undefined {
    return clientMessageId === undefined ? undefined : this.deliveries.get(`${projectRoot}\0${clientMessageId}`);
  }

  taskEffectClaims(
    session: { projectRoot: string; taskId?: string; roleId: string },
    currentClientMessage: () => string | undefined,
  ): { claimTaskGit: ClaimDurableTaskGit; claimFileWrite: ClaimFileWriteFn } {
    const currentDelivery = () => this.delivery(session.projectRoot, currentClientMessage());
    const claimTaskGit: ClaimDurableTaskGit = async input => {
      const delivery = currentDelivery();
      const task = delivery?.intent.task;
      if (!delivery || task?.stage !== "B3" || task.taskId !== session.taskId || task.roleId !== session.roleId) {
        return durableFailure("workflow-task-write-forbidden", "The current session does not hold the authorized implementation task.");
      }
      const store = await this.store();
      const projection = await this.lookup(delivery.ref);
      if (!projection || projection.task?.taskId !== task.taskId || currentDelivery() !== delivery ||
        (input.expected.branch !== undefined && input.expected.branch !== projection.baseline?.branch)) {
        return durableFailure("workflow-task-write-stale", "The original task or task branch changed.");
      }
      const claim = await store.claimEffect(delivery.ref, {
        ...input, stepId: delivery.intent.stepId, attempt: delivery.intent.attempt, task,
      });
      if (!claim.ok) return claim;
      if (!claim.value.execute && claim.value.state !== "succeeded") {
        return durableFailure("workflow-task-operation-unknown", "An earlier actual operation requires verification.");
      }
      const finish = async (outcome: DurableEffectOutcome["outcome"], evidence: string, result?: DurableEffectOutcome["result"]): Promise<void> => {
        const settled = await store.settleEffect(delivery.ref, { key: claim.value.key, token: claim.value.token, outcome, evidence, result });
        if (!settled.ok) throw new Error(`${settled.code}: ${settled.message}`);
      };
      if (claim.value.execute && currentDelivery() !== delivery) {
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

  markSession(handle: object): void { this.sessions.add(handle); }
  isSession(handle: object): boolean { return this.sessions.has(handle); }

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
