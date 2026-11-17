// app/desktop/session/fixed-workflow/route.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6、附录 A fixed-workflow 组）：fixed 派发路由（`matrix:"two-fixed-paths/v1"`）+
// 路径 B 写集/启动门（L5，feature 白名单 card-gateway/evidence/run-change/git-ports）。
// 3 个类方法（routeFixedPathDispatch/ensurePathBStartForDispatch/checkPathBWriteSetForDispatch）自
// app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原 receiver 面——
//  · 跨簇状态（sessions/activeDispatchKeys/starTaskIds/lastGovernanceRuntime）经 `FixedWorkflowRefs`
//    显式传入**同一实例**（只读/按原样写入；不双写、不复制）；
//  · 已迁出模块实例经 refs 直接调用：runChange.runTaskIsFenced（白名单 L2）；
//  · Git baseline 端口经 `git-ports.ts`（L1；固定路径准备/绑定不直接导入 workflow-git）；
//  · 尚未迁出的门面方法（openInternal/findLiveRuntime/enqueueDelivery/drainQueue/
//    appDispatchClientMessageId）经 `FixedWorkflowPorts` 箭头回调注入，运行期调用、参数逐位原样转发；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*（与门面委托同一函数、同一入参）。
// **T3 核心接线逐字保留**：stage-request、scope 记录（recordFixedPathBScopeDecisionForDispatch）、
// 轻量验收 close 门（B31/B34 语义）、路径 B 写集/启动门——方法体哈希相等（不可机械处仅 receiver 适配，
// 见 evidence/adapters-and-equivalence.md）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L5 fixed-workflow 只可导入 L0、card-gateway、evidence、run-change、git-ports。

import { createHash } from "node:crypto";
import path from "node:path";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { extractDispatchReadPaths, planDispatchDelivery } from "../../../../src/common/编排/handback.ts";
import { renderWorkReportPrompt, type TaskHandback } from "../../../../src/common/编排/handback.ts";
import { appendTaskEvent, classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskEvent, taskIdempotencyKey, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import { evaluateFixedPathDispatchAuthorization, stageRequestIdempotencyKey, stageStopIdempotencyKey } from "../../../../src/common/编排/workflow-dispatch.ts";
import {
  deriveDurablePathBWriteSets,
  prepareDurablePathBBaseline,
  preparePathBStart as prepareFixedPathBStart,
  readBasisLedger,
  readWorkflowLedger,
  requestStage,
  verifyBasisForWorkflow,
  workflowIdFor,
  type WorkflowServiceFailure,
} from "../../../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView, type WorkflowView } from "../../../../src/common/编排/workflow-state.ts";
import { deriveFixedModuleWriteSet, loadLatestRoster as loadLatestWorkflowRoster, reviewRoleIdOfRoster } from "../../../../src/common/编排/workflow-preconditions.ts";
import { inspectAssignedTask as inspectWorkflowAssignedTask } from "../../../../src/common/编排/workflow-service.ts";
import { isBuiltInGovernanceRoleId } from "../../../../src/service/boundary/resolve-boundary.ts";
import { isWorkflowPath, isWorkflowStage } from "../../../../src/model/runtime.ts";
import type { BasisEvent, DispatchReceipt, DispatchTaskPayload, TaskStateEvent, WorkflowEvent, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { RoleDispatchPurpose } from "../../../../src/model/role.ts";
import type { DurableDispatchDetails, DurableEvidenceRef, DurableFact, DurableProjection, DurableTaskBinding } from "../../../../src/model/durable-workflow.ts";
import { isRuntimeKind } from "../../runtime-config.ts";
import { durableHash, durableTaskId } from "../../durable-workflow.ts";
import { mainT } from "../../i18n.ts";
import {
  recordFixedPathBScopeDecisionForDispatch,
  recordFixedStageDispatchForTask,
  shouldRecordFixedStageDispatch,
} from "../../workflow.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { CardGateway } from "../card-gateway.ts";
import type { ActualDispatchSource, DeliveryItem, InternalSessionOpenRequest, LiveSession, OpenResult } from "../contracts/session-types.ts";
import type { Evidence } from "../evidence.ts";
import { createDesktopBaselineGitPort, verifyDurableTaskCommit } from "../git-ports.ts";
import type { RunChange } from "../run-change.ts";
import { now } from "../shared/clock.ts";
import { sessionKey } from "../shared/keys.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf, handbackOwnerRoleId, refreshListingNow, roleDisplayName } from "../shared/roles.ts";
import { appendRoleActivity, readTasks, recordTaskFailure, taskCreators } from "../shared/tasks-store.ts";
import { filePrint, shortenText } from "../shared/text.ts";

/** fixed-workflow 方法读取的跨模块状态面（同一实例；延迟取值，两阶段装配）。 */
export interface FixedWorkflowRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  activeDispatchKeys: Set<string>;
  starTaskIds: Set<string>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
  runChange: RunChange;
  evidence: Evidence;
  cardGateway: CardGateway;
}

/** 尚未迁出（B6 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface FixedWorkflowPorts {
  openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult>;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  drainAllQueuesFor(projectRoot: string): Promise<void>;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  appDispatchClientMessageId(dedupKey: string): string;
}

/** fixed 派发路由 + 路径 B 写集/启动门（原 SessionManager 3 方法的同签名实现）。 */
export class FixedWorkflowRoute {
  private readonly refs: FixedWorkflowRefs;
  private readonly port: FixedWorkflowPorts;
  private readonly deps: SessionManagerDeps;
  constructor(refs: FixedWorkflowRefs, port: FixedWorkflowPorts, deps: SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
  }

  /* 跨模块状态（同一实例；延迟取值）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get activeDispatchKeys(): Set<string> { return this.refs.activeDispatchKeys; }
  private get starTaskIds(): Set<string> { return this.refs.starTaskIds; }

  /* L0 共享函数（同名同义委托；与门面委托同一实现、同一入参）。 */
  private now(): number { return now(this.deps); }
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
  }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private refreshListingNow(projectRoot: string): Promise<boolean> { return refreshListingNow(projectRoot, this.deps); }
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }
  private async recordTaskFailure(projectRoot: string, taskId: string, summary: string): Promise<boolean> {
    return recordTaskFailure(projectRoot, taskId, summary, () => this.now());
  }
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.refs.lastRoleActivity, now: () => this.now() });
  }

  /* 已迁出模块实例（白名单下层；运行时同一对象）。 */
  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean {
    return this.refs.runChange.runTaskIsFenced(projectRoot, taskId, runId);
  }

  /* 尚未迁出的门面方法端口（运行期调用；参数逐位原样转发、返回原样返回）。 */
  private openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult> {
    return this.port.openInternal(req, userInitiated);
  }
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    return this.port.findLiveRuntime(projectRoot, roleId);
  }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    return this.port.enqueueDelivery(projectRoot, targetRoleId, item);
  }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    return this.port.drainQueue(projectRoot, targetRoleId, runtime);
  }
  private appDispatchClientMessageId(dedupKey: string): string {
    return this.port.appDispatchClientMessageId(dedupKey);
  }

  private durableRuntime(projection: DurableProjection, preferred?: string): RuntimeKind {
    const runtime = preferred ?? projection.metadata.runtime;
    return isRuntimeKind(runtime) ? runtime : "pi";
  }

  hasActiveRoleTurn(projectRoot: string): boolean {
    return [...this.sessions.values()].some(session =>
      session.projectRoot === projectRoot && (session.busy || session.origins.running !== undefined));
  }

  observeDurableProject(projectRoot: string, ports: {
    resumeReports(projection: DurableProjection, roleBusy: (roleId: string, runtime: RuntimeKind) => boolean): Promise<void>;
    syncRelease(projection: DurableProjection): Promise<void>;
    closeRelease(): void;
  }): () => void {
    const unobserve = this.deps.durableWorkflow?.observeProject(projectRoot, async projection => {
      await ports.resumeReports(projection, (roleId, runtime) =>
        this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.busy ?? false);
      await this.syncDurableTasks(projection);
      await ports.syncRelease(projection);
    });
    return () => {
      unobserve?.();
      ports.closeRelease();
    };
  }

  async syncDurableTasks(projection: DurableProjection): Promise<void> {
    const durable = this.deps.durableWorkflow;
    if (!durable || projection.status !== "waiting" || projection.engine !== "healthy") return;
    const store = await durable.store();
    const { ref, projectRoot, stepId, attempt, action } = projection;
    const convener = this.handbackOwnerRoleId(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    if (!chief || !convener) return;
    const address = { stepId, attempt };
    const facts = store.listFacts(ref);
    const currentTask = projection.task;
    if (currentTask && action === "b3-implement-and-accept" && ![...this.sessions.values()].some(entry =>
      entry.projectRoot === projectRoot && entry.assignedTaskId === currentTask.taskId && entry.busy)) {
      for (const effect of store.listEffects(ref, "task-commit")) {
        if ((effect.state !== "claimed" && effect.state !== "unknown")
          || effect.intent.task?.taskId !== currentTask.taskId || !effect.intent.expected) continue;
        const verified = await verifyDurableTaskCommit(projectRoot, effect.intent.expected);
        if (verified) {
          await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
            evidence: "Recovered task commit marker, parent and staged diff verified.", result: verified });
        } else {
          store.block(ref, "workflow-task-commit-uncertain", "The original task commit requires verification.");
        }
      }
    }
    if (action === "accept-b3-advance-with-b2-scope" && projection.analysisReport) {
      const b1Attempt = projection.analysisReport.attempt;
      const parent = durableTaskId(ref, convener, "B1", b1Attempt);
      const report = facts.find(row => row.fact.kind === "operator-report" && row.fact.parentTaskId === parent)?.fact;
      if (report?.kind === "operator-report") {
        const recorded = store.getEvidence(ref, report.evidence) as { handback?: TaskHandback } | undefined;
        if (recorded?.handback) {
          const text = renderWorkReportPrompt(recorded.handback) +
            `\n如 B1 依据可用，请向运营使用真实路径 B 的 B3 advance（workflowId ${ref.instanceId}），保持 B1 flowId，给出文件候选和理由。`;
          await this.queueDurablePrompt(projection, chief, convener, text, this.durableRuntime(projection), `report:${report.key}`);
        }
      }
    }
    const stageRequest = facts.find(row => row.fact.kind === "stage-request" && row.fact.attempt === attempt
      && row.fact.stepId === stepId && row.receipt.state === "consumed")?.fact;
    if ((action === "b1-impact-readonly" || action === "readonly-report") && !stageRequest) {
      const task = `客户已从桌面启动持久工作流 ${ref.instanceId}。需求：${projection.metadata.summary ?? ""}\n`
        + `请使用 dispatch_task 向运营 ${convener} 发真实路径 B 的 B1 advance 阶段请求。为本次工作选择一个 flowId、指明需核对的模块和问题，要求运营只读派发给现有模块属主。当前轮是第 ${attempt} 次影响面分析。`;
      await this.queueDurablePrompt(projection, chief, "application", task, this.durableRuntime(projection), `chief-intake:${stepId}:${attempt}`);
      return;
    }
    if (action === "b1-impact-readonly" && !projection.baseline) {
      const claimed = await store.claimEffect(ref, {
        ...address, key: "git:baseline", kind: "baseline", expected: { workflowId: ref.instanceId },
      });
      if (!claimed.ok || !claimed.value.execute) return;
      const prepared = await prepareDurablePathBBaseline({ projectRoot, workflowId: ref.instanceId, port: createDesktopBaselineGitPort() });
      await store.settleEffect(ref, prepared.ok && prepared.repo.baseOid ? {
        key: claimed.value.key, token: claimed.value.token, outcome: "succeeded", evidence: "baseline-branch-prepared",
        result: { branch: prepared.repo.branch, oid: prepared.repo.baseOid },
      } : {
        key: claimed.value.key, token: claimed.value.token, outcome: "unknown",
        evidence: prepared.ok ? "baseline-oid-missing" : `${prepared.code}: ${prepared.message}`,
      });
      return;
    }
    const dispatch = stageRequest?.kind === "stage-request" ? stageRequest.dispatch
      : action === "b3-implement-and-accept" ? projection.scope?.dispatch : undefined;
    if (dispatch) {
      const stage = action === "b3-implement-and-accept" ? "B3" : "B1";
      const parentId = durableTaskId(ref, convener, stage, attempt);
      const sourceTaskId = stageRequest?.kind === "stage-request" ? stageRequest.sourceTaskId : projection.scope?.sourceTaskId;
      if (!sourceTaskId) return;
      await this.materializeDurableTask(projection, {
        taskId: parentId, sourceRoleId: chief, roleId: convener, stage, details: dispatch, stageRequest: true,
        binding: { stage: action === "readonly-report" ? "readonly" : stage, stageAttempt: attempt,
          executionAttempt: 1, parentTaskId: sourceTaskId, taskId: parentId, roleId: convener },
      });
    }
    const binding = projection.task;
    if (binding?.stageAttempt !== attempt) return;
    const taskFact = facts.find(row => row.fact.kind === "task-bound" && row.fact.task.taskId === binding.taskId
      && row.receipt.state === "consumed")?.fact;
    if (taskFact?.kind === "task-bound" && taskFact.dispatch) {
      await this.materializeDurableTask(projection, {
        taskId: binding.taskId, sourceRoleId: convener, roleId: binding.roleId,
        stage: binding.stage === "B3" ? "B3" : "B1", details: taskFact.dispatch, binding, modulePaths: taskFact.modulePaths,
      });
    }
    const taskReport = facts.find(row => row.fact.kind === "task-report" && row.fact.task.taskId === binding.taskId
      && row.receipt.state === "consumed")?.fact;
    if (taskReport?.kind === "task-report") {
      const recorded = store.getEvidence(ref, taskReport.evidence) as { handback?: TaskHandback } | undefined;
      if (recorded?.handback) {
        const finish = binding.stage === "readonly"
          ? "请核对只读报告，再用 close_created_task accepted 或 rejected 给出审阅结论。"
          : binding.stage === "B3"
          ? "核对实现报告与任务分支的提交；接受时调用 close_created_task accepted，并在本轮使用 submit_report 提交运营报告。"
          : "核对本次只读报告；依据可用用 close_created_task accepted，需要补查用 rework，阻塞用 rejected。请在本轮使用 submit_report 将处置依据回交幕僚。";
        const firstRequest = facts.find(row => row.fact.kind === "stage-request" && row.fact.attempt === attempt)?.fact;
        const parent = firstRequest?.kind === "stage-request" ? firstRequest.sourceTaskId : projection.scope?.sourceTaskId;
        const operator = parent ? { stage: binding.stage, stageAttempt: attempt, executionAttempt: 1,
          parentTaskId: parent, taskId: binding.parentTaskId, roleId: convener } : undefined;
        await this.queueDurablePrompt(projection, convener, binding.roleId, `${renderWorkReportPrompt(recorded.handback)}\n${finish}`,
          this.durableRuntime(projection), `report:${taskReport.key}`, undefined, operator, binding.parentTaskId);
      }
    }
  }

  private async queueDurablePrompt(
    projection: DurableProjection, roleId: string, sourceRoleId: string, text: string, runtime: RuntimeKind,
    key: string, taskId?: string, task?: DurableTaskBinding, assignmentTaskId?: string,
  ): Promise<void> {
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const { ref, stepId, attempt, projectRoot } = projection;
    const operation = `model:${key}`;
    const existing = store.listEffects(ref, "model-send").find(effect => effect.intent.key === operation);
    if (existing && existing.state !== "not-started") return;
    const dedupKey = `${projectRoot}\0${runtime}\0durable\0${ref.instanceId}\0${key}`;
    const clientMessageId = this.appDispatchClientMessageId(dedupKey);
    durable.registerDelivery(projectRoot, clientMessageId, {
      ref, roleId, runtime, assignmentTaskId,
      intent: {
        key: operation, kind: "model-send", stepId, attempt, task,
        expected: { roleId, runtime, inputDigest: durableHash(text), clientMessageId },
      },
    });
    const existingSession = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!taskId && (existingSession?.sessionWorkflowMode !== "fixed" || !durable.isSession(existingSession.handle) ||
        (assignmentTaskId !== undefined && existingSession.assignedTaskId !== assignmentTaskId))) {
      if (existingSession?.busy || existingSession?.origins.running) return;
      const opened = await this.openInternal({ projectRoot, roleId, runtime, forcedWorkflowMode: "fixed",
        ...(assignmentTaskId ? { taskId: assignmentTaskId } : {}) }, false);
      if (!opened.ok) return;
    }
    this.enqueueDelivery(projectRoot, roleId, {
      kind: taskId ? "dispatch" : "system", runtime, targetRoleId: roleId, sourceRoleId,
      taskId, text, summary: shortenSummary(text), dedupKey, clientMessageId,
    });
    void this.drainQueue(projectRoot, roleId, runtime);
  }

  private async materializeDurableTask(projection: DurableProjection, input: {
    taskId: string; sourceRoleId: string; roleId: string; stage: "B1" | "B3"; details: DurableDispatchDetails;
    stageRequest?: true; binding?: DurableTaskBinding; modulePaths?: readonly string[];
  }): Promise<void> {
    const { projectRoot, ref } = projection;
    const key = `durable-task:${input.taskId}`;
    const state = await this.readTasks(projectRoot);
    const current = state.records.get(input.taskId)?.created;
    if (!current) {
      // The SQLite fact already exists. This journal row is a replayable projection for existing role tools.
      const result = await appendTaskEvent(projectRoot, taskEvent("task.created", {
        taskId: input.taskId,
        from: input.stageRequest ? "chief" : "convener",
        to: input.roleId,
        flowId: input.details.flowId,
        workflowId: ref.instanceId,
        stage: input.stage,
        ...(input.stageRequest ? { taskKind: "stage-request" as const } : {}),
        text: input.details.text,
        sideEffect: input.stage === "B3" && !input.stageRequest ? "code" : "read-only",
        idempotencyKey: key,
        ...(input.modulePaths?.length ? { modulePaths: [...input.modulePaths] } : {}),
      }, () => new Date(this.now())));
      if (!result.ok) return;
    } else if (current.idempotencyKey !== key || current.to !== input.roleId || current.workflowId !== ref.instanceId) {
      return;
    }
    this.starTaskIds.add(input.taskId);
    taskCreators.set(input.taskId, input.stageRequest ? "chief" : "convener");
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(input.details.text)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery({ roleId: input.roleId, task: input.details.text }, probes,
      { sourceRoleId: this.roleDisplayName(projectRoot, input.sourceRoleId), taskId: input.taskId });
    if (plan.action === "reject") return;
    await this.queueDurablePrompt(projection, input.roleId, input.sourceRoleId, plan.text,
      this.durableRuntime(projection, input.details.runtime), input.taskId, input.taskId, input.binding);
  }

  async routeDurableDispatch(
    projection: DurableProjection, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload,
    targetRoleId: string, text: string, source: ActualDispatchSource | undefined,
  ): Promise<DispatchReceipt> {
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const { ref, projectRoot, stepId, attempt, action } = projection;
    const reject = (code: string, message: string): DispatchReceipt => ({ ok: false, message: `${code}: ${message}` });
    const current = () => !!source && this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === source.entry
      && source.entry.busy && source.entry.origins.running === source.origin && !source.origin.settled
      && !source.entry.interactionState.lifetime.signal.aborted && !source.entry.interactionState.turn.signal.aborted
      && durable.delivery(projectRoot, source.origin.clientMessageId)?.ref.instanceId === ref.instanceId;
    if (!current() || !source?.origin.turnId || projection.engine !== "healthy" || projection.status !== "waiting") {
      return reject("workflow-owner-conflict", "The current turn does not own this durable workflow.");
    }
    const convener = this.handbackOwnerRoleId(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    if (!convener || !chief || (d.workflowId !== undefined && d.workflowId !== ref.instanceId)) {
      return reject("stage-request-invalid", "The request does not match the registered workflow.");
    }
    const address = { stepId, attempt };
    const requestedFlow = typeof d.flowId === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(d.flowId) ? d.flowId : undefined;
    let fact: DurableFact;
    if (d.taskKind === "stage-request") {
      if (d.stage === "B2") return reject("b2-stage-request-forbidden", "Use B3 advance after the accepted B1 report.");
      if (fromRoleId !== chief || targetRoleId !== convener || d.workflowPath !== "B" || d.workflowAction !== "advance"
        || !requestedFlow || d.moduleId || d.modulePaths?.length || d.reworkOf) {
        return reject("stage-request-invalid", "Only the lead may send this Path B advance to operations.");
      }
      const sourceTaskId = source.origin.turnId;
      const requestDigest = durableHash(text);
      const dispatch = { text, runtime, flowId: requestedFlow, actor: fromRoleId };
      if (d.stage === "B1" && (action === "b1-impact-readonly" || action === "readonly-report")) {
        fact = { ...address, key: `b1-request:${attempt}`, kind: "stage-request", source: "chief", sourceTaskId, requestDigest, dispatch };
      } else if (d.stage === "B3" && action === "accept-b3-advance-with-b2-scope" && projection.analysisReport && projection.baseline) {
        const report = projection.analysisReport;
        const original = store.listFacts(ref).find(row => row.fact.kind === "stage-request" && row.fact.attempt === report.attempt)?.fact;
        if (original?.kind !== "stage-request" || original.dispatch.flowId !== requestedFlow) {
          return reject("b-change-scope-invalid", "The advance must match the current B1 request.");
        }
        const savedReport = store.getEvidence(ref, report.evidence) as { artifacts?: DurableEvidenceRef[] } | undefined;
        if (!savedReport) return reject("b2-report-missing", "The current B1 report cannot be verified.");
        for (const artifact of savedReport.artifacts ?? []) {
          const fresh = await store.readEvidence(projectRoot, artifact.path);
          if (!fresh.ok || fresh.value.sha256 !== artifact.sha256) {
            return reject("b2-report-drift", "An artifact referenced by the current B1 report has changed.");
          }
        }
        const candidateSource = d.requestedEvidence?.length ? "requestedEvidence" : "modulePaths";
        const candidates = [...new Set((candidateSource === "requestedEvidence" ? d.requestedEvidence! : report.modulePaths).map(file => file.trim().replace(/\\/g, "/")))];
        if (!candidates.length || !d.reason?.trim()) {
          return reject("b-change-scope-invalid", "The current B1 report, file candidates and reason are required.");
        }
        const sets = await deriveDurablePathBWriteSets({ projectRoot, flowId: requestedFlow, scopeFiles: candidates });
        if (!sets.ok) return reject(sets.code, sets.message);
        fact = { ...address, key: `b3-advance:${attempt}`, kind: "b3-advance", source: "chief", sourceTaskId, requestDigest,
          b1Attempt: report.attempt, reportKey: report.key, baselineOid: projection.baseline.oid, candidateSource, candidates,
          writeSets: sets.writesets, reason: d.reason.trim(), dispatch };
      } else {
        return reject("stage-transition-invalid", "The durable workflow is not waiting for that advance.");
      }
    } else {
      const stage = action === "b3-implement-and-accept" ? "B3" : action === "b1-impact-readonly" ? "B1" : action === "readonly-report" ? "readonly" : undefined;
      const parentStage = stage === "B3" ? "B3" : "B1";
      const parentTaskId = durableTaskId(ref, convener, parentStage, attempt);
      if (fromRoleId !== convener || !stage || source.entry.assignedTaskId !== parentTaskId
        || (d.stage !== undefined && d.stage !== parentStage)
        || (source.origin.taskId ?? source.entry.assignedTaskId) !== parentTaskId || d.workflowPath !== undefined) {
        return reject("workflow-binding-unavailable", "Production dispatch must come from the assigned operations task.");
      }
      await this.refreshListingNow(projectRoot);
      const target = this.deps.getListing(projectRoot)?.roles.find(role => role.roleId === targetRoleId);
      if (!target || target.builtIn || isBuiltInGovernanceRoleId(targetRoleId)) {
        return reject("dispatch-evidence-missing", "Choose the authorized project module owner.");
      }
      const flowId = stage === "B3" ? projection.scope?.dispatch?.flowId : projection.stageRequest?.dispatch.flowId;
      if (!flowId) return reject("workflow-binding-unavailable", "The authorized stage request lacks a flow binding.");
      const modulePaths = [...new Set((d.modulePaths ?? []).map(file => file.trim().replace(/\\/g, "/")))];
      if (!modulePaths.length || modulePaths.some(file => file === "")) {
        return reject("dispatch-evidence-missing", "The production task must identify its module files.");
      }
      const allowed = stage === "B3" ? projection.scope?.writeSets.find(set => set.roleId === targetRoleId)
        : await deriveDurablePathBWriteSets({ projectRoot, flowId, scopeFiles: modulePaths }).then(result =>
          result.ok ? result.writesets.find(set => set.roleId === targetRoleId) : undefined);
      if (!allowed || modulePaths.some(file => !allowed.paths.includes(file)) ||
        (stage !== "B3" && d.sideEffect !== undefined && d.sideEffect !== "read-only")) {
        return reject("b-change-scope-invalid", "The requested files are outside the assigned module scope.");
      }
      const taskId = durableTaskId(ref, targetRoleId, stage, attempt);
      const task: DurableTaskBinding = { stage, stageAttempt: attempt, executionAttempt: 1, parentTaskId, taskId, roleId: targetRoleId };
      fact = { ...address, key: `task-bound:${attempt}:${stepId}`, kind: "task-bound", source: "host", task, modulePaths,
        dispatch: { text, flowId, runtime, actor: fromRoleId } };
    }
    if (!current()) return reject("dispatch-source-changed", "The originating turn changed during validation.");
    const saved = await store.submit(ref, fact);
    if (!saved.ok) return reject(saved.code, saved.message);
    return { ok: true, message: `已保存本次请求（${saved.value.key}）。工作流消费后将按相同业务键投递。` };
  }

  // —— routeFixedPathDispatch（B6 自 session.ts 逐字搬移）——
  /**
   * T3（2026-11-10 两条固定工作流路径，B1）：fixed 派发路由（`matrix:"two-fixed-paths/v1"`）。
   *
   * 依据：v1.3 §3.1/§3.2（fixed 矩阵）、§3.3（stage-request 原语）、§3.6（Q6 父门替代证据 fail-closed）、
   * §4.1（per-flow）；B1 验收 AC-01/AC-02/AC-04/AC-05/AC-12、T-01/T-05。
   *
   * 与 `routeStarDispatch` 的差异（**不调用** legacy 机制）：不调用 `prepareRoleDispatch`/
   * `freezeExecutionRun`/run-manifest pin/roster、`evaluateDispatchPreflight` advisories、`chainDispatchFacts`、
   * `versioned-doc-baseline` 收集、`hubPreparation` 五内置判断；不写 `.ans/runs`/`.ans/trunk`。
   * 复用：目标枚举刷新、`sourceIsCurrent` 口径、幂等查重、投递队列、`sideEffect` 分类、报告回交
   * （`task.created.from` 路由，后续链共用）。
   *
   * 硬授权（**fail-closed**，不得默认通过）：`evaluateFixedPathDispatchAuthorization` +
   * Q6 证据（live-turn `sourceIsCurrent` + convener 生产派发的 `inspectAssignedTask` 绑定 + identity/target +
   * 应用计算幂等键）。证据缺失/不匹配 ⇒ `dispatch-evidence-missing`/`dispatch-source-changed`/
   * `stage-request-required`。本方法**不写入** workflow 状态/授权：stage-request 的阶段账本事件只由编排
   * `workflowService.requestStage` 写（单一实现），桌面只透传宿主捕获事实与投递。
   */
  async routeFixedPathDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source: ActualDispatchSource | undefined,
    dispatchFlowId: string,
  ): Promise<DispatchReceipt> {
    const reject = (code: string, message: string): DispatchReceipt => {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `${code}：${message}`);
      return { ok: false, message: `${code}：${message}` };
    };
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const chiefId = chiefRoleId ?? "chief";
    const convenerId = convenerRoleId ?? "convener";
    // 旧候选评审绑定（reviewTarget）＝ trunk/candidate 机制；fixed 路径不使用（验收按任务分支/reviewRoleId，B3）。
    if (d.reviewTarget !== undefined) {
      return reject("review-target-invalid", "fixed 路径不使用旧候选评审绑定（reviewTarget）；验收按 workflow/reviewRoleId 直接派发。");
    }
    const reason = typeof d.reason === "string" ? d.reason : undefined;
    const expectedOutput = typeof d.expectedOutput === "string" && d.expectedOutput.trim() !== "" ? d.expectedOutput.trim() : undefined;
    const requestedEvidence = Array.isArray(d.requestedEvidence)
      ? d.requestedEvidence.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 5)
      : undefined;
    const requestedModuleId = typeof d.moduleId === "string" && d.moduleId.trim() !== "" ? d.moduleId.trim() : undefined;
    const requestedModulePaths = Array.isArray(d.modulePaths)
      ? [...new Set(d.modulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))].slice(0, 20)
      : undefined;
    const isStageRequest = d.taskKind === "stage-request";
    if (d.workflowPath !== undefined && !isStageRequest) {
      return reject("workflow-path-not-stage-request", "workflowPath 只允许出现在 taskKind=stage-request 的任务上。");
    }
    if (d.reworkOf !== undefined && !isStageRequest) {
      return reject("stage-request-invalid", "reworkOf 只允许出现在 taskKind=stage-request 的请求上。");
    }
    // 幂等键（应用计算；显式 idempotencyKey 仍按既有 `taskIdempotencyKey` 规则使用；重复抑制同 legacy 口径）。
    const idempotencyKey = taskIdempotencyKey({
      from: fromRoleId,
      to: targetRoleId,
      text: task,
      ...(typeof d.idempotencyKey === "string" ? { idempotencyKey: d.idempotencyKey } : {}),
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
    });
    const state = await this.readTasks(projectRoot);
    const duplicate = findTaskByIdempotencyKey(state, idempotencyKey);
    if (duplicate !== undefined) {
      const terminal = duplicate.closed !== undefined || duplicate.reports.length > 0;
      return {
        ok: true,
        message: terminal
          ? `已受理：任务 #${duplicate.taskId} 已${duplicate.closed !== undefined ? "收口" : "报告"}，重复派发已抑制（未创建新任务、未投递）；如需返工请使用新的任务文本或幂等键。`
          : `已受理：同一任务已存在（#${duplicate.taskId}），未重复派发；受理 ≠ 完成。`,
      };
    }
    // 目标事实（缓存 miss ⇒ 实时重枚举一次再判；与 legacy 同一依赖路径）。
    await this.refreshListingNow(projectRoot);
    const listingForPreflight = this.deps.getListing(projectRoot);
    const targetRole = listingForPreflight?.roles.find((role) => role.roleId === targetRoleId);
    const targetBuiltIn = targetRole?.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId);
    const targetExists = targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId);
    const isChiefSource = fromRoleId === chiefId;
    // T3 B8.2（2026-11-11，RR3 根因 2：运营无法获知 workflowId、9 次生产派发被 B7.1 证据门拒绝后回落
    // legacy stable-write）：运营（convener）的**生产派发**由应用从**来源真实受派任务**（`source.origin.taskId`
    // 的 `task.created`）自动绑定 workflowId/stage/flowId——不要求模型自报。显式 `workflowId` 仍须与父任务
    // 一致（不一致 ⇒ `stage-request-invalid`）；flowId 不是可信事实（按父任务账本为准）；显式 `stage` 是本次
    // 生产派发的目标阶段（如 A7 stage-request 之后派 A8），允许与父任务 stage 不同，缺失时才从父任务绑定。
    // 绑定失败（无受派任务/非 open fixed stage-request/缺 workflowId·stage·flowId/workflow 不在账本）
    // ⇒ `workflow-binding-unavailable` fail-closed：不创建任务、不写 trunk/run、**不回落 legacy 星形派发**。
    // 绑定值用于 workflow 事实/任务创建/stage.dispatched（单一事实来源 = 账本）。
    let effectiveStage: NonNullable<WorkflowView["stage"]> | undefined = d.stage;
    let effectiveFlowId = dispatchFlowId;
    let workflowId = typeof d.workflowId === "string" && d.workflowId.trim() !== "" ? d.workflowId.trim() : undefined;
    // convener 生产派发必须绑定当前真实受派的 open stage-request 任务（只认 tasks 账本；不采信自报）。
    let assignedTaskEvidence: {
      taskId?: string; from?: string; to?: string; taskKind?: string; workflowId?: string;
      stage?: NonNullable<WorkflowView["stage"]>; open?: boolean; stopped?: boolean;
    } | undefined;
    let assignedTaskFlowId: string | undefined;
    const assignedTaskId = !isStageRequest && fromRoleId === convenerId && typeof source?.origin.taskId === "string"
      ? source.origin.taskId.trim()
      : "";
    if (assignedTaskId !== "") {
      const assigned = await inspectWorkflowAssignedTask({ projectRoot, taskId: assignedTaskId, actorRoleId: fromRoleId });
      if (assigned.ok) {
        assignedTaskEvidence = {
          taskId: assigned.task.taskId,
          from: assigned.task.from,
          to: assigned.task.to,
          ...(assigned.task.taskKind !== undefined ? { taskKind: assigned.task.taskKind } : {}),
          ...(assigned.task.workflowId !== undefined ? { workflowId: assigned.task.workflowId } : {}),
          ...(assigned.task.stage !== undefined ? { stage: assigned.task.stage } : {}),
          open: assigned.task.open,
          stopped: assigned.task.stopped,
        };
        assignedTaskFlowId = assigned.task.flowId;
      }
    }
    if (!isStageRequest && fromRoleId === convenerId) {
      const assignedReady = assignedTaskEvidence !== undefined
        && assignedTaskEvidence.open === true
        && assignedTaskEvidence.stopped !== true
        && assignedTaskEvidence.from === "chief"
        && assignedTaskEvidence.to === convenerId
        && assignedTaskEvidence.taskKind === "stage-request"
        && typeof assignedTaskEvidence.workflowId === "string" && assignedTaskEvidence.workflowId !== ""
        && assignedTaskEvidence.stage !== undefined;
      const needsBinding = workflowId === undefined || effectiveStage === undefined || effectiveFlowId === "";
      if (needsBinding) {
        if (!assignedReady) {
          const why = assignedTaskId === ""
            ? "缺少当前真实受派任务（source.origin.taskId）"
            : assignedTaskEvidence === undefined
              ? "当前受派任务不可读"
              : "当前受派任务不是 open 的 fixed stage-request（须 chief→convener、taskKind=stage-request、workflowId/stage 齐全）";
          return reject(
            "workflow-binding-unavailable",
            `运营生产派发无法从受派任务自动绑定 workflowId/stage：${why}。未创建任务、未写 trunk/run，且不回落 legacy 星形派发。`,
          );
        }
        const boundWorkflowId = assignedTaskEvidence?.workflowId;
        const boundStage = assignedTaskEvidence?.stage;
        if (boundWorkflowId === undefined || boundWorkflowId === "" || boundStage === undefined
          || assignedTaskFlowId === undefined || assignedTaskFlowId === "") {
          return reject("workflow-binding-unavailable", `受派任务 ${assignedTaskId} 缺少 workflowId/stage/flowId，无法绑定 fixed 生产派发。`);
        }
        if (workflowId !== undefined && workflowId !== boundWorkflowId) {
          return reject("stage-request-invalid", `显式 workflowId ${workflowId} 与当前受派任务（${boundWorkflowId}）不一致；不采信模型自报、不回落 legacy。`);
        }
        // flowId 不是可信事实：模型可能按 legacy 口径记错（RR3 的 `flow snake-game`）——绑定路径下
        // **以受派任务的账本 flowId 为准**（不因自报 flowId 不同而拒绝合法派发；任务创建用绑定值）。
        // 显式 stage 是本次生产派发的目标阶段（A7 请求之后派 A8 等），允许与父任务 stage 不同；仅缺失时绑定。
        const bindingLedger = await readWorkflowLedger(projectRoot);
        if (!bindingLedger.events.some((event) => event.workflowId === boundWorkflowId)) {
          return reject("workflow-binding-unavailable", `受派任务 ${assignedTaskId} 绑定的 workflow ${boundWorkflowId} 在账本不存在（不猜、不伪造视图）。`);
        }
        workflowId = boundWorkflowId;
        if (effectiveStage === undefined) effectiveStage = boundStage;
        effectiveFlowId = assignedTaskFlowId;
      } else if (assignedReady) {
        // 模型显式 workflowId 仍须与父任务一致（不一致 ⇒ 拒绝，不静默改写；v1.3 §3.3 第 6 条）。
        if (workflowId !== assignedTaskEvidence?.workflowId) {
          return reject("stage-request-invalid", `显式 workflowId ${workflowId} 与当前受派任务（${assignedTaskEvidence?.workflowId}）不一致；不采信模型自报、不回落 legacy。`);
        }
        // flowId 以父任务账本为准（不采信自报）；stage 保留模型给出的目标阶段（仍受账本状态机约束）。
        if (assignedTaskFlowId !== undefined && assignedTaskFlowId !== "") effectiveFlowId = assignedTaskFlowId;
      }
    }
    // workflow 事实（`workflowId` 来自父任务自动绑定或宿主透传字段；存在即须在账本真实存在且未关闭——不猜、不伪造视图）。
    let workflowView: WorkflowView | undefined;
    let scopedWorkflowEvents: readonly WorkflowEvent[] = [];
    let basisReviewRoleId: string | undefined;
    if (workflowId !== undefined) {
      const ledger = await readWorkflowLedger(projectRoot);
      scopedWorkflowEvents = ledger.events.filter((event) => event.workflowId === workflowId);
      if (scopedWorkflowEvents.length === 0) {
        return reject("workflow-not-found", `workflow ${workflowId} 不存在（账本无记录）。`);
      }
      const view = deriveWorkflowView(scopedWorkflowEvents, state.events);
      if (view.blocked?.code === "workflow-corrupt") {
        return reject("workflow-corrupt", `工作流账本损坏：${view.blocked.summary}（不猜、不自动推进）。`);
      }
      if (view.closed !== undefined) {
        return reject("workflow-closed", `workflow ${workflowId} 已关闭（${view.closed.outcome}），不再接受派发。`);
      }
      workflowView = view;
      const basis = await readBasisLedger(projectRoot);
      const basisEvents = basis.events
        .filter((event): event is Extract<BasisEvent, { kind: "basis.recorded" | "basis.amended" }> =>
          event.kind === "basis.recorded" || event.kind === "basis.amended")
        .filter((event) => event.workflowId === workflowId);
      const latestBasis = basisEvents[basisEvents.length - 1];
      basisReviewRoleId = latestBasis?.reviewRoleId;
    }
    // purpose 由**可信路由事实**派生（不信任模型自报）：stage-request＝stage-request；chief→内置 verifier＝
    // review；chief→项目角色仅当目标是本 workflow 的 `reviewRoleId`（MF-10 窄例外；唯一可信来源 =
    // `basis.recorded.reviewRoleId`，不取模型自报/投影未派生字段）＝review，其余按生产派发拒绝
    // （提示交运营；仍由谓词判定，桌面只透传事实）；convener＝production。
    const workflowReviewRoleId = basisReviewRoleId;
    let purpose: RoleDispatchPurpose = isStageRequest ? "stage-request" : isChiefSource ? "review" : "production";
    let rosterReviewRoleId: string | undefined;
    if (!targetBuiltIn && isChiefSource && !isStageRequest) {
      if (workflowReviewRoleId !== undefined && workflowReviewRoleId === targetRoleId) {
        purpose = "review";
        const roster = await loadLatestWorkflowRoster({ projectRoot, flowId: dispatchFlowId });
        if (roster.ok) rosterReviewRoleId = reviewRoleIdOfRoster(roster.roster);
      } else {
        purpose = "production";
      }
    }
    const targetActivated = workflowView?.activatedRoleIds?.includes(targetRoleId) === true;
    // Q6 live-turn 证据（与 routeStarDispatch 同口径；只读本会话真实条目/轮次，不采信模型自报）。
    const sourceIsCurrent = (): boolean => !!source && this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === source.entry &&
      source.entry.busy && source.entry.origins.running === source.origin && !source.origin.settled &&
      !this.runTaskIsFenced(projectRoot, source.origin.taskId, source.origin.assignment?.runId) &&
      !source.entry.interactionState.lifetime.signal.aborted && !source.entry.interactionState.turn.signal.aborted;
    // stage-request 的 sourceTaskId = host 捕获的 chief 当前真实客户轮次（不可模型自报）。
    const stageRequestSourceTaskId = isStageRequest && typeof source?.origin.turnId === "string" ? source.origin.turnId.trim() : "";
    // 应用计算的幂等证据键（stage-request：与 workflow-service 同源 helper；attempt 按账本推导，
    // 服务层仍为权威并独立复核）。
    const requestDigest = createHash("sha256").update(task).digest("hex");
    let evidenceIdempotencyKey: string | undefined = idempotencyKey;
    if (isStageRequest) {
      evidenceIdempotencyKey = undefined;
      const action = d.workflowAction ?? "advance";
      if (workflowId !== undefined && d.stage !== undefined) {
        const attempts = scopedWorkflowEvents
          .filter((event): event is Extract<WorkflowEvent, { kind: "stage.requested" }> =>
            event.kind === "stage.requested" && event.stage === d.stage)
          .map((event) => event.attempt);
        const stops = scopedWorkflowEvents.filter((event) => event.kind === "workflow.stop-requested").length;
        const attempt = action === "stop" ? stops + 1 : attempts.length === 0 ? 1 : Math.max(...attempts) + 1;
        evidenceIdempotencyKey = action === "stop"
          ? stageStopIdempotencyKey(workflowId, d.stage, attempt)
          : stageRequestIdempotencyKey(workflowId, d.stage, attempt);
      } else if (d.workflowPath !== undefined && d.stage !== undefined && stageRequestSourceTaskId !== "") {
        const computed = workflowIdFor(dispatchFlowId, d.workflowPath, stageRequestSourceTaskId, requestDigest);
        evidenceIdempotencyKey = stageRequestIdempotencyKey(computed, d.stage, 1);
      }
    }
    // convener 生产派发的受派任务证据与 workflowId/stage/flowId 自动绑定已在 workflow 事实之前完成
    // （B8.2；绑定失败的 fail-closed 拒绝发生在那一步，不落到此处）。
    const authorization = evaluateFixedPathDispatchAuthorization({
      sourceRoleId: fromRoleId,
      chiefRoleId: chiefId,
      convenerRoleId: convenerId,
      targetRoleId,
      targetKind: targetBuiltIn ? "built-in-governance" : "project",
      targetExists,
      purpose,
      ...(workflowId !== undefined || workflowView !== undefined
        ? {
            workflow: {
              ...(workflowId !== undefined ? { workflowId } : {}),
              ...(workflowReviewRoleId !== undefined ? { reviewRoleId: workflowReviewRoleId } : {}),
              ...(workflowView?.stage !== undefined ? { stage: workflowView.stage } : {}),
            },
          }
        : {}),
      ...(workflowReviewRoleId !== undefined ? { reviewRoleId: workflowReviewRoleId } : {}),
      ...(rosterReviewRoleId !== undefined ? { rosterReviewRoleId } : {}),
      ...(basisReviewRoleId !== undefined ? { basisReviewRoleId } : {}),
      ...(targetActivated ? { targetActivated } : {}),
      ...(isStageRequest
        ? {
            stageRequest: {
              taskKind: d.taskKind,
              ...(d.workflowAction !== undefined ? { workflowAction: d.workflowAction } : {}),
              sideEffect: "read-only" as const,
              ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
              ...(requestedModulePaths !== undefined ? { modulePaths: requestedModulePaths } : {}),
            },
          }
        : {}),
      evidence: {
        sourceIsCurrent: sourceIsCurrent(),
        ...(evidenceIdempotencyKey !== undefined ? { idempotencyKey: evidenceIdempotencyKey } : {}),
        identity: { sourceRoleId: fromRoleId, targetRoleId },
        ...(assignedTaskEvidence !== undefined ? { assignedTask: assignedTaskEvidence } : {}),
        ...(stageRequestSourceTaskId !== "" ? { sourceTaskId: stageRequestSourceTaskId } : {}),
      },
    });
    if (!authorization.ok) {
      const missingNote = authorization.missing !== undefined && authorization.missing.length > 0
        ? `（缺失/不一致：${authorization.missing.join("、")}）`
        : "";
      return reject(authorization.code, `${authorization.message}${missingNote}`);
    }
    if (!isStageRequest && workflowId === undefined) {
      // fixed 生产任务必须携带 workflowId（v1.3 §3.3 第 6 条；无 workflowId 会落到 legacy run-required）。
      return reject("dispatch-evidence-missing", "fixed 生产派发必须携带 workflowId（工作流绑定证据）。");
    }
    if (!isStageRequest && effectiveStage === undefined) {
      return reject("dispatch-evidence-missing", "fixed 生产派发必须携带目标 stage（账本绑定证据）。");
    }
    // T3 B3（AC-10/v1.3 §4.3 MF-12）：路径 B 在 B1/B3 生产派发前完成最小仓库/分支准备
    // （既有仓库；无仓库 ⇒ `b-repository-required`，不自动 init；basis.recorded(reason:"path-b")）。
    // 幂等：已有 basis 记录 ⇒ no-op。非 B 路径 workflow 直接放行（零行为）。B8.2：flow 取自动绑定值。
    if (!isStageRequest && workflowId !== undefined && (effectiveStage === "B1" || effectiveStage === "B3")) {
      const pathB = await this.ensurePathBStartForDispatch(projectRoot, workflowId, effectiveFlowId);
      if (!pathB.ok) return reject(pathB.code, pathB.message);
    }
    // T3 B3（AC-19/§7.2）：A11/B1/B3 实现派发前复核 basis（文档/计划 hash 漂移 ⇒ `basis-drift`，
    // `basis-missing`；不派实现）。B1 由上面的路径 B 准备先写 basis，再复核。
    // T3 B2.1（AC-19/T-08；MF-B2-02）：补 `stage` ⇒ 关键门一致时按 v1.3 §7.2 G-9 节流入账
    // `basis.verified`（同 basis+同文档摘要只记一次）；drift/缺失仍 fail-closed 拒绝派发。
    if (!isStageRequest && workflowId !== undefined && fromRoleId === convenerId
      && (effectiveStage === "A11" || effectiveStage === "B1" || effectiveStage === "B3")) {
      const basis = await verifyBasisForWorkflow({ projectRoot, workflowId, stage: effectiveStage });
      if (!basis.ok) return reject(basis.code, basis.message);
    }
    // T3 B3（AC-10/§4.3 MF-8）：B3 写集 = B2 `change.scope-decided.scope.files` ∩ roster/边界派生；
    // 派发任务声明的模块路径必须落在该角色有效写集内（越界 ⇒ `b-change-scope-invalid`）。
    if (!isStageRequest && workflowId !== undefined && effectiveStage === "B3") {
      const writeSet = await this.checkPathBWriteSetForDispatch(projectRoot, workflowId, effectiveFlowId, targetRoleId, requestedModulePaths);
      if (!writeSet.ok) return reject(writeSet.code, writeSet.message);
    }
    // B21（2026-11-11，RR16 失败修复）：fixed A11 实现任务的模块写集以 `moduleId` 为权威——应用从
    // 最新名单模块表派生该模块路径并写入任务；模型 `modulePaths` 仅作断言，跨模块/未知 moduleId
    // ⇒ `module-paths-mismatch` fail-closed（不把空交集留到 worker 写门）。一模块一任务。
    let effectiveModulePaths = requestedModulePaths;
    if (!isStageRequest && fromRoleId === convenerId && effectiveStage === "A11"
      && requestedModuleId !== undefined && workflowId !== undefined) {
      const roster = await loadLatestWorkflowRoster({ projectRoot, flowId: effectiveFlowId });
      if (!roster.ok) {
        return reject("module-paths-mismatch", `A11 模块授权无法核验：最新名单不可读（${roster.reason}）。`);
      }
      const moduleWriteSet = deriveFixedModuleWriteSet(roster.roster, requestedModuleId, requestedModulePaths);
      if (!moduleWriteSet.ok) return reject(moduleWriteSet.code, moduleWriteSet.message);
      effectiveModulePaths = moduleWriteSet.paths;
    }
    // 核验期间来源变化 ⇒ 不创建（fail-closed；与 legacy worker-dispatch 同方向）。
    if (!sourceIsCurrent()) return reject("dispatch-source-changed", "核验期间来源轮次已变化，未创建任务。");
    const sideEffect = isStageRequest ? "read-only" as const : classifyTaskSideEffect(d?.sideEffect, task);
    let taskId: string;
    if (isStageRequest) {
      if (d.stage === undefined) return reject("stage-request-invalid", "stage-request 必须给出目标阶段（stage）。");
      const requestedAction = d.workflowAction ?? "advance";
      // T3 B5.1（G-B5-2，AC-10；v1.3 §4.3 B2）：路径 B 的 B3 advance 请求受理**之前**，由应用校验
      // 影响面报告字节 hash 并记录 B2 `change.scope-decided`（候选路径优先取 `requestedEvidence`，其次
      // B1 生产任务 modulePaths；属主/有效写集由编排按名单/边界派生——不采信模型自报写集）。
      // 失败 fail-closed：B3 请求不受理、不创建任务；B2 已记录 ⇒ 幂等 replay 不重复写。
      if (requestedAction === "advance" && d.stage === "B3" && workflowId !== undefined) {
        const scope = await recordFixedPathBScopeDecisionForDispatch({
          projectRoot,
          flowId: dispatchFlowId,
          workflowId,
          ...(requestedEvidence !== undefined ? { candidateFiles: requestedEvidence } : {}),
        });
        if (!scope.ok) return reject(scope.code, `B2 范围决定未记录：${scope.message}（B3 请求未受理）。`);
      }
      const stageRequest = await requestStage({
        projectRoot,
        flowId: dispatchFlowId,
        stage: d.stage,
        ...(requestedAction !== "advance" ? { workflowAction: requestedAction } : {}),
        ...(d.workflowPath !== undefined ? { workflowPath: d.workflowPath } : {}),
        ...(workflowId !== undefined ? { workflowId } : {}),
        ...(d.reworkOf !== undefined ? { reworkOf: d.reworkOf } : {}),
        requestDigest,
        ...(stageRequestSourceTaskId !== "" ? { sourceTaskId: stageRequestSourceTaskId } : {}),
        text: task,
        ...(reason !== undefined ? { reason } : {}),
      });
      if (!stageRequest.ok) return reject(stageRequest.code, stageRequest.message);
      taskId = stageRequest.taskId;
      if (stageRequest.replay) {
        return { ok: true, message: `已受理：同一 stage-request 已存在（#${taskId}），未重复投递；受理 ≠ 完成。` };
      }
      if (!sourceIsCurrent()) {
        return reject("dispatch-source-changed", "stage-request 已登记，但来源轮次在投递前已变化（未投递）。");
      }
    } else {
      const newId = newTaskId(new Date(this.now()));
      const createdAt = new Date(this.now());
      const created = taskEvent("task.created", {
        taskId: newId,
        from: fromRoleId === convenerId ? "convener" : "chief",
        flowId: effectiveFlowId,
        ...(workflowId !== undefined ? { workflowId } : {}),
        ...(workflowId !== undefined && effectiveStage !== undefined ? { stage: effectiveStage } : {}),
        to: targetRoleId,
        text: task,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
        ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
        ...(effectiveModulePaths !== undefined && effectiveModulePaths.length > 0 ? { modulePaths: effectiveModulePaths } : {}),
        sideEffect,
        idempotencyKey,
      }, () => createdAt);
      const appended = await appendTaskEvent(projectRoot, created);
      if (!appended.ok) return reject(appended.code ?? "task-ledger-write-failed", `任务未登记、未投递：${appended.message}`);
      taskId = newId;
    }
    // T3 B5.1（G-B5-1，AC-08/AC-09；v1.3 §4.5）：非 stage-request 的 fixed 任务创建 ⇒ 按真实
    // task.created 记 `stage.dispatched`（A1/A4/A7 完成于任务创建；A8/A12a/A12b 在办；A11 已由
    // `requestStage` 记录、B3 无此语义——集合单一来源 = `shouldRecordFixedStageDispatch`）。
    // 状态机窗口外（既有 review 直派夹具）不写也不阻断；账本/服务失败 fail-closed：不回滚已创建任务、
    // 不投递、如实回报（绝不伪造 stage.dispatched）。
    if (!isStageRequest && workflowId !== undefined && shouldRecordFixedStageDispatch(effectiveStage)) {
      const dispatched = await recordFixedStageDispatchForTask({
        projectRoot,
        workflowId,
        stage: effectiveStage,
        taskId,
        targetRoleId,
        ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
      });
      if (!dispatched.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `stage-dispatch-record-failed: ${dispatched.code}: ${shortenSummary(dispatched.message)}`);
        return reject(
          dispatched.code,
          `stage.dispatched ${effectiveStage} 未记录：${dispatched.message}；任务 #${taskId} 已创建但未投递（不伪造派发，请运营/幕僚核对账本）。`,
        );
      }
    }
    this.starTaskIds.add(taskId);
    taskCreators.set(taskId, fromRoleId === convenerId ? "convener" : "chief");
    this.appendRoleActivity(projectRoot, fromRoleId, {
      kind: "task.created",
      summary: `派发任务 #${taskId} → ${targetRoleId}：${shortenSummary(task)}`,
      taskId,
      status: sideEffect,
    });
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery(
      { roleId: targetRoleId, task, ...(reason !== undefined ? { reason } : {}) },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId),
        taskId,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.recordTaskFailure(projectRoot, taskId, `delivery-rejected: ${shortenSummary(plan.message)}`);
      return reject("dispatch-delivery-rejected", plan.message);
    }
    let deliveryRuntime = this.findLiveRuntime(projectRoot, targetRoleId) ?? runtime;
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：固定派发必须让目标会话绑定**本次真实
    // 任务**——open 入参携带 `taskId`（→ `openRoleSession` 的 input.taskId 与 `LiveSession.assignedTaskId`）。
    // 否则 run-role 的 handback intent 无任务事实：convener/product/verifier 的 `submit_report` 以
    // 「任务关联未知」到达、`task.reported` 缺失、`close_created_task accepted` 报
    // `close-report-missing`（RR5 实测，A1/A2 调度请求被 rework 收口并重复派发）。
    // B8.1（RR3）的强制 fixed 语义保留：目标未开、非 fixed、或 fixed 但未绑定本次任务（聊天打开/上一
    // 任务）⇒ 以 taskId+`forcedWorkflowMode:"fixed"` 打开。`openInternalUnsafe` 对空闲的既有 fixed
    // 会话安全 dispose 重开；busy/不可关闭 ⇒ `fixed-session-rebind-blocked` fail-closed（不清理在跑轮次）。
    // 唯一例外 = 目标已是 fixed 且忙：本段不打开（避免把正常的「忙时入队」变成拒绝），任务入队保留，
    // 由 drain 在目标空闲后按 taskId+forced 重绑再投——无论哪条路径，**未绑定本次任务的会话绝不会收到
    // 该任务**（不投递、不伪造投递成功）。
    const existingTarget = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime));
    const existingTargetFixed = existingTarget !== undefined && existingTarget.projectRoot === projectRoot
      && existingTarget.sessionWorkflowMode === "fixed";
    const targetBoundToTask = existingTargetFixed && existingTarget.assignedTaskId === taskId;
    // 忙时入队不丢（角色卡会话纪律）：fixed 目标忙时不在受理段强开/重绑——条目保留，drain 在目标空闲后
    // 按 taskId+forced 安全重绑再投（`openInternalUnsafe` 对 busy 会话本身 fail-closed，绝不清掉在跑轮次）。
    // 非 fixed（legacy 风险面）仍立即打开走 B8.1 的 fail-closed 拒绝（绝不把 fixed 任务留在 legacy 队列里）。
    const targetBusy = existingTarget !== undefined && (existingTarget.busy || existingTarget.origins.running !== undefined);
    if (!targetBoundToTask && !(existingTargetFixed && targetBusy)) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime: deliveryRuntime, taskId, forcedWorkflowMode: "fixed" }, false);
      if (!opened.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `delivery-target-open-failed: ${shortenSummary(opened.error ?? mainT("shared.common.unknownReason"))}`);
        if (opened.error !== undefined && (opened.error.startsWith("fixed-session-rebind-blocked") || opened.error.startsWith("worker-task-session-busy"))) {
          return reject("fixed-session-rebind-blocked", `${opened.error}（fixed 任务未投递；目标会话保持原状，待其空闲后重试。）`);
        }
        return reject(
          "dispatch-target-open-failed",
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
        );
      }
      deliveryRuntime = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime))?.runtime ?? deliveryRuntime;
    }
    const deliveryDedupKey = `${projectRoot}\u0000${deliveryRuntime}\u0000task\u0000${taskId}`;
    this.activeDispatchKeys.add(deliveryDedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime: deliveryRuntime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      taskId,
      text: plan.text,
      summary: `[任务] #${taskId} → ${this.roleDisplayName(projectRoot, targetRoleId)}：${shortenText(task, 40)}`,
      dedupKey: deliveryDedupKey,
      clientMessageId: this.appDispatchClientMessageId(deliveryDedupKey),
    });
    const cardRecord = (await this.readTasks(projectRoot)).records.get(taskId);
    const card = cardRecord !== undefined ? taskCardOf(cardRecord) : undefined;
    if (card !== undefined) {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, renderTaskCardLines(card).join("；"));
    }
    void this.drainQueue(projectRoot, targetRoleId, deliveryRuntime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    return {
      ok: true,
      message:
        mainT("main.session.acceptedTask", {
          to: this.roleDisplayName(projectRoot, targetRoleId),
          openNote,
          from: this.roleDisplayName(projectRoot, fromRoleId),
        }) +
        `任务编号：#${taskId}（sideEffect=${sideEffect}；受理 ≠ 完成）。`,
    };
  }
  // —— ensurePathBStartForDispatch（B6 自 session.ts 逐字搬移）——
  async ensurePathBStartForDispatch(
    projectRoot: string,
    workflowId: string,
    flowId: string,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    const ledger = await readWorkflowLedger(projectRoot);
    const started = ledger.events.find((event) => event.kind === "workflow.started" && event.workflowId === workflowId);
    if (started === undefined || started.kind !== "workflow.started" || started.path !== "B") return { ok: true };
    const basis = await readBasisLedger(projectRoot);
    const hasBasis = basis.events.some((event) =>
      (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === workflowId);
    if (hasBasis) return { ok: true };
    const prepared = await prepareFixedPathBStart({
      projectRoot,
      flowId,
      workflowId,
      operationId: `path-b:${workflowId}`,
      port: createDesktopBaselineGitPort(),
    });
    if (!prepared.ok) return prepared;
    return { ok: true };
  }
  // —— checkPathBWriteSetForDispatch（B6 自 session.ts 逐字搬移）——
  /**
   * B3 写集门（v1.3 §4.3 MF-8）：派发任务的 modulePaths 必须落在该角色由
   * `change.scope-decided.scope.files` 派生的有效写集内；越界/来源缺失 ⇒ `b-change-scope-invalid`。
   * 非 B 路径 workflow 直接放行（A 路径写集由团队计划在别处校验）。
   */
  async checkPathBWriteSetForDispatch(
    projectRoot: string,
    workflowId: string,
    _flowId: string,
    targetRoleId: string,
    modulePaths: readonly string[] | undefined,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    const ledger = await readWorkflowLedger(projectRoot);
    const events = ledger.events.filter((event) => event.workflowId === workflowId);
    const started = events.find((event) => event.kind === "workflow.started");
    if (started === undefined || started.kind !== "workflow.started" || started.path !== "B") return { ok: true };
    const scope = [...events].reverse().find(
      (event): event is Extract<WorkflowEvent, { kind: "change.scope-decided" }> => event.kind === "change.scope-decided",
    );
    if (scope === undefined) {
      return { ok: false, code: "b-change-scope-invalid", message: "B3 写集来源缺失：B2 change.scope-decided 不存在（不派发）。" };
    }
    const writeset = scope.effectiveWritesets.find((entry) => entry.roleId === targetRoleId);
    if (writeset === undefined || writeset.paths.length === 0) {
      return { ok: false, code: "b-change-scope-invalid", message: `scope 未给角色 ${targetRoleId} 任何有效写集（不派发）。` };
    }
    if (modulePaths === undefined || modulePaths.length === 0) {
      return { ok: false, code: "dispatch-evidence-missing", message: "B3 派发必须携带模块路径（modulePaths）以核对 scope 派生写集。" };
    }
    const covers = (prefix: string, candidate: string): boolean => {
      const root = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
      const target = candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
      return target === root || target.startsWith(`${root}/`);
    };
    const scopeCoveredByModules = writeset.paths.every((scopePath) => modulePaths.some((modulePath) => covers(modulePath, scopePath)));
    const modulesMappedToScope = modulePaths.every((modulePath) =>
      writeset.paths.some((scopePath) => covers(scopePath, modulePath) || covers(modulePath, scopePath)));
    if (!scopeCoveredByModules || !modulesMappedToScope) {
      return {
        ok: false,
        code: "b-change-scope-invalid",
        message: `派发模块路径与 scope 派生写集不一致（越界）：modules=${modulePaths.join(",")} writeset=${writeset.paths.join(",")}。`,
      };
    }
    return { ok: true };
  }
}
