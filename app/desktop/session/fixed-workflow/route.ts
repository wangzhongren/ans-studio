// app/desktop/session/fixed-workflow/route.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6、附录 A fixed-workflow 组）：fixed 派发路由（`matrix:"two-fixed-paths/v1"`）+
// 路径 B 写集/启动门（L5，feature 白名单 card-gateway/evidence/run-change/git-ports）。

import { createHash } from "node:crypto";
import path from "node:path";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { extractDispatchReadPaths, planDispatchDelivery, renderDispatchPrompt } from "../../../../src/common/编排/handback.ts";
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
import type { DurableCapabilityEvent, DurableDispatchDetails, DurableEvidenceRef, DurableFact, DurablePendingTask, DurableProjection, DurableTaskBinding } from "../../../../src/model/durable-workflow.ts";
import { isRuntimeKind } from "../../runtime-config.ts";
import { durableHash, durableTaskId, isDirectProductCapability, recordWorkflowNotice, workspacePreparationSummary } from "../../durable-workflow.ts";
import { b3EvidenceDelivery, closeDesktopGraphCard, closeWorkflowTask, evidenceOperatorBinding, evidenceOperatorInstructions, evidenceRouteDelivery, graphCardProfile, graphEventAddress, graphImplementationTip, graphTaskProfile, nextOperationsDelivery, operationsTasks, pendingDeliveryBlocksQueue, preflightDesktopEnvironmentOwner, preflightDesktopImplementationOwner, preflightDesktopReviewer, requestEvidenceCollectionFromTurn, requestOperationsChild, resumeDesktopGraphCard, resumeGraphBaseline, syncGraphArchive, workflowReviewProof, workflowRoleDuty, workflowTaskEffectMatches } from "../../durable-workflow-a.ts";
import { closeDocumentRevisionCard, presentDocumentRevisionCard } from "../../durable-document-revision.ts";
import { closeBlockedScopeCard, desktopVerificationPreflight, holdDesktopUnavailableAssessment, presentB2EvidenceScopeCard, presentBlockedScopeCard, reconcileDesktopA11Disposition, verificationAssessmentPrompt, verificationStandardPrompt } from "../../durable-blocked-routing.ts";
import { acceptanceEnvironmentTask, assessmentHasEnvironmentFact, confirmAcceptanceEnvironmentAssessment, mirrorAcceptanceEnvironmentClosures, recoveryWakeKey } from "../../durable-acceptance-environment.ts";
import { closeDesktopAcceptanceWorkspace, desktopAssessmentAdmission, prepareDesktopAssessmentDispatch, refreshDesktopPreparationBlock, verifyDesktopAcceptanceWorkspaceEvidence } from "../../durable-acceptance-workspace.ts";
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
  durableDecisionExecutor(projectRoot: string, runtime: unknown): import("../../customer-input.ts").ChiefDecisionExecutor | undefined;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  drainAllQueuesFor(projectRoot: string): Promise<void>;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  pendingAppTaskDelivery(projectRoot: string, targetRoleId: string, runtime: RuntimeKind, clientMessageId: string): { queued: boolean; position?: number } | undefined;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  appDispatchClientMessageId(dedupKey: string): string;
}

/** fixed 派发路由 + 路径 B 写集/启动门（原 SessionManager 3 方法的同签名实现）。 */
export class FixedWorkflowRoute {
  private readonly refs: FixedWorkflowRefs;
  private readonly port: FixedWorkflowPorts;
  private readonly deps: SessionManagerDeps;
  private readonly preparingDurablePrompts = new Set<string>();
  private readonly materializingDurableTasks = new Set<string>();
  private readonly reconcilingA11Dispositions = new Set<string>();
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
      if (this.deps.durableWorkflow) {
        closeDesktopGraphCard(this.deps.durableWorkflow, projectRoot);
        closeDocumentRevisionCard(this.deps.durableWorkflow, projectRoot);
        closeBlockedScopeCard(this.deps.durableWorkflow, projectRoot);
      }
      ports.closeRelease();
    };
  }

  async syncDurableTasks(projection: DurableProjection): Promise<void> {
    const durable = this.deps.durableWorkflow;
    if (!durable || projection.engine !== "healthy") return;
    if (projection.acceptanceEnvironment || projection.pendingTasks?.some(task => task.environmentRecovery)) {
      await mirrorAcceptanceEnvironmentClosures(await durable.store(), projection);
    }
    if (projection.acceptanceEnvironment?.state === "blocked" && projection.status === "waiting") {
      projection = await refreshDesktopPreparationBlock(durable, projection, this.deps);
    }
    if (projection.acceptanceEnvironment?.state === "blocked" && !projection.blockedRouting?.evidenceAuditKey) {
      const chief = this.chiefTaskRoleIdOf(projection.projectRoot);
      const recovery = projection.acceptanceEnvironment;
      if (chief) {
        const summary = `工作流 ${projection.ref.instanceId} 的验收环境需要幕僚处理。候选 ${recovery.basis?.candidateOid ?? "待核对"}，补齐尝试 ${recovery.attempts}/${recovery.maxAttempts}。${recovery.reason ?? projection.blockedReason ?? "请核对原恢复回执。"}`;
        const saved = await recordWorkflowNotice(projection.projectRoot, chief, {
          ref: `workflow-environment-blocked:${projection.ref.instanceId}`, summary, taskId: recovery.parentTask?.taskId,
        });
        if (saved === "recorded") this.emitDeliveryNote(projection.projectRoot, this.durableRuntime(projection), chief, chief, summary);
      }
      return;
    }
    if (projection.status !== "waiting") return;
    const store = await durable.store();
    const { ref, projectRoot } = projection;
    const convener = this.handbackOwnerRoleId(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    if (!chief || !convener) return;
    if (await this.syncA11Disposition(projection, chief, convener)) return;
    projection = await refreshDesktopPreparationBlock(durable, projection, this.deps);
    if (await this.syncBlockedScope(projection, chief, convener) || projection.evidenceAudit?.state === "blocked" || await this.syncDocumentRevision(projection, chief, convener)) return;
    const evidenceRoute = evidenceRouteDelivery(projection);
    if (evidenceRoute) return this.queueDurablePrompt(projection, evidenceRoute.task.roleId, "application", evidenceRoute.text,
      this.durableRuntime(projection), evidenceRoute.key, undefined, evidenceRoute.task, evidenceRoute.task.taskId);
    if (projection.workflowOwnedDispatch) {
      const prepared = await store.prepareWorkflowDispatch(ref, input => preflightDesktopReviewer(input, this.deps),
        desktopVerificationPreflight(this.deps, this.durableRuntime(projection)));
      if (!prepared.ok) {
        if (!projection.blockedReason) store.block(ref, prepared.code, prepared.message);
        await this.noteWorkflowException(projection, chief, prepared.code, prepared.message);
        return;
      }
      projection = prepared.value;
      if (projection.status !== "waiting" || projection.engine !== "healthy" || projection.b2EvidenceDecision && await this.syncBlockedScope(projection, chief, convener)) return;
    }
    const { stepId, attempt, action, workflowOwnedDispatch } = projection;
    if (projection.schema === 2) await this.syncGraphTasks(projection, chief, convener);
    if (isDirectProductCapability(projection.action) || graphTaskProfile(projection) || action === "operations-implementation" || action === "operations-environment-recovery") return;
    if (action === "b3-implement-and-accept" && projection.evidenceAudit?.collector) {
      const runtime = this.durableRuntime(projection);
      const collection = b3EvidenceDelivery(store, projection);
      if (collection?.parent && collection.key) await this.queueDurablePrompt(projection, collection.parent.roleId, collection.child.roleId,
        collection.text, runtime, collection.key, undefined, collection.parent, collection.parent.taskId);
      else if (collection) await this.materializeDurableTask(projection, { taskId: collection.child.taskId, sourceRoleId: "application",
        roleId: collection.child.roleId, binding: collection.child.task, stage: "B3", parentTaskId: collection.child.task.parentTaskId,
        sideEffect: "docs", details: { ...collection.child.dispatch, text: collection.text } });
    }
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
    if (!workflowOwnedDispatch && action === "accept-b3-advance-with-b2-scope" && projection.analysisReport) {
      const analysis = projection.analysisReport;
      const disposition = projection.schema === 2 ? facts.find(({ fact, receipt }) =>
        fact.kind === "analysis-disposition" && fact.outcome === "usable" && fact.reportKey === analysis.key
        && fact.task.stageAttempt === analysis.attempt && receipt.state === "consumed")?.fact : undefined;
      const parent = projection.schema === 2 ? (disposition?.kind === "analysis-disposition" ? disposition.task.parentTaskId : undefined)
        : durableTaskId(ref, convener, "B1", analysis.attempt);
      const report = parent ? facts.find(row => row.fact.kind === "operator-report" && row.fact.parentTaskId === parent)?.fact : undefined;
      if (report?.kind === "operator-report") {
        const recorded = store.getEvidence(ref, report.evidence) as { handback?: TaskHandback } | undefined;
        if (recorded?.handback) {
          const text = renderWorkReportPrompt(recorded.handback) +
            `\n如 B1 依据可用，请向运营使用真实路径 B 的 B3 advance（workflowId ${ref.instanceId}），保持 B1 flowId，给出文件候选和理由。`;
          await this.queueDurablePrompt(projection, chief, convener, text, this.durableRuntime(projection), `report:${report.key}`);
        }
      }
    }
    const requestForStep = facts.find(row => row.fact.kind === "stage-request" && row.fact.attempt === attempt
      && row.fact.stepId === stepId && row.receipt.state !== "ignored");
    const stageRequest = requestForStep?.receipt.state === "consumed" ? requestForStep.fact : undefined;
    if (!workflowOwnedDispatch && (action === "b1-impact-readonly" || action === "readonly-report") && !stageRequest) {
      if (projection.schema === 2 && requestForStep) return;
      const task = `客户已从桌面启动持久工作流 ${ref.instanceId}。需求：${projection.metadata.summary ?? ""}\n`
        + `请使用 dispatch_task 向运营 ${convener} 发真实路径 B 的 B1 advance 阶段请求。为本次工作选择一个 flowId、指明需核对的模块和问题，要求运营只读派发给现有模块属主。当前轮是第 ${attempt} 次影响面分析。`;
      await this.queueDurablePrompt(projection, chief, "application", task, this.durableRuntime(projection), `chief-intake:${stepId}:${attempt}`);
      return;
    }
    if ((action === "prepare-existing-branch" || action === "b1-impact-readonly" && projection.schema !== 2) && !projection.baseline) {
      const claimed = await store.claimEffect(ref, {
        ...address, key: "git:baseline", kind: "baseline", expected: { workflowId: ref.instanceId },
      });
      if (!claimed.ok) {
        if (projection.schema === 2) store.block(ref, claimed.code, claimed.message);
        return;
      }
      if (!claimed.value.execute) {
        if (projection.schema === 2 && (claimed.value.state === "claimed" || claimed.value.state === "unknown")) {
          store.block(ref, "workflow-existing-baseline-reconciliation-required",
            claimed.value.result?.evidence ?? "An earlier attempt to prepare the existing task branch requires reconciliation.");
        }
        return;
      }
      if (projection.schema === 2) {
        const checked = await store.checkExistingBaseline(ref);
        if (!checked.ok) {
          await store.settleEffect(ref, { key: claimed.value.key, token: claimed.value.token,
            outcome: "not-started", evidence: checked.message });
          store.block(ref, checked.code, checked.message);
          return;
        }
      }
      const prepared = await prepareDurablePathBBaseline({ projectRoot, workflowId: ref.instanceId,
        port: createDesktopBaselineGitPort(projection.definitionSource === "project" ? projection.definitionFile : undefined) });
      const settled = await store.settleEffect(ref, prepared.ok && prepared.repo.baseOid ? {
        key: claimed.value.key, token: claimed.value.token, outcome: "succeeded", evidence: "baseline-branch-prepared",
        result: { branch: prepared.repo.branch, oid: prepared.repo.baseOid },
      } : {
        key: claimed.value.key, token: claimed.value.token, outcome: "unknown",
        evidence: prepared.ok ? "baseline-oid-missing" : `${prepared.code}: ${prepared.message}`,
      });
      if (projection.schema === 2 && !settled.ok) store.block(ref, settled.code, settled.message);
      else if (projection.schema === 2 && !prepared.ok) store.block(ref, prepared.code, prepared.message);
      return;
    }
    const dispatch = stageRequest?.kind === "stage-request" ? stageRequest.dispatch
      : action === "b3-implement-and-accept" ? projection.scope?.dispatch : undefined;
    if (dispatch && !workflowOwnedDispatch) {
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
      const stage = binding.stage === "B3" ? "B3" : "B1";
      const flowId = taskFact.dispatch.flowId;
      if (!flowId) return;
      if (!workflowOwnedDispatch || !facts.some(row => row.fact.kind === "task-report" && row.fact.task.taskId === binding.taskId && row.receipt.state === "consumed")) {
        await this.materializeDurableTask(projection, {
          taskId: binding.taskId, sourceRoleId: workflowOwnedDispatch ? "application" : convener, roleId: binding.roleId,
          stage, details: workflowOwnedDispatch ? { ...taskFact.dispatch, text: `${taskFact.dispatch.text}\n${workflowRoleDuty(stage, flowId)}\n任务涵盖文件：${taskFact.modulePaths?.join("、") ?? ""}` } : taskFact.dispatch,
          binding, modulePaths: taskFact.modulePaths,
        });
      }
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
          : "核对本次只读报告；依据可用用 close_created_task accepted，需要补查用 rework，阻塞用 rejected。请在本轮使用 submit_report 回交处置依据。";
        const firstRequest = facts.find(row => row.fact.kind === "stage-request" && row.fact.attempt === attempt)?.fact;
        const parent = projection.schema === 2 && binding.stage === "B3" ? projection.scope?.sourceTaskId
          : firstRequest?.kind === "stage-request" ? firstRequest.sourceTaskId : projection.scope?.sourceTaskId;
        const operatorParent = workflowOwnedDispatch ? ref.instanceId : parent;
        const operator = operatorParent ? { stage: binding.stage, stageAttempt: attempt, executionAttempt: 1,
          parentTaskId: operatorParent, taskId: binding.parentTaskId, roleId: convener } : undefined;
        const text = `${renderWorkReportPrompt(recorded.handback)}\n${finish}${evidenceOperatorInstructions(projection)}`;
        if (workflowOwnedDispatch && operator && (binding.stage !== "readonly" || action === "wait-for-review")) {
          const flowId = projection.flowId ?? (taskFact?.kind === "task-bound" ? taskFact.dispatch?.flowId : undefined);
          if (!flowId) return;
          await this.materializeDurableTask(projection, {
            taskId: binding.parentTaskId, sourceRoleId: "application", roleId: convener,
            stage: binding.stage === "B3" ? "B3" : "B1", details: { actor: "application", text, flowId },
            binding: operator, sideEffect: "read-only", operationKey: `report:${taskReport.key}`,
          });
        } else if (!workflowOwnedDispatch) {
          await this.queueDurablePrompt(projection, convener, binding.roleId, text,
            this.durableRuntime(projection), `report:${taskReport.key}`, undefined, operator, binding.parentTaskId);
        }
      }
    }
  }

  private async syncGraphTasks(view: DurableProjection, chief: string, convener: string): Promise<void> {
    const store = await this.deps.durableWorkflow!.store();
    const profile = graphTaskProfile(view);
    const events = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state === "consumed");
    const currentRequest = events.find(({ event }) => event.input.kind === "stage-request" &&
      event.stepId === view.stepId && event.attempt === view.attempt)?.event;
    const runtime = this.durableRuntime(view);
    const direct = view.pendingTasks?.find(item => isDirectProductCapability(item.capability)
      && item.stepId === view.stepId && item.attempt === view.attempt && item.flowId === view.flowId);
    const stage = direct?.capability === "author-intent-direct" ? "A2" : "A1";
    const intake = view.action === "author-intent" || view.action === "author-intent-direct"
      ? view.pendingTasks?.findLast(item => item.capability === "product-prepare-direct" && item.flowId === view.flowId && item.report)
      : undefined;
    const intakeEvidence = intake?.report && store.getEvidence(view.ref, intake.report.evidence) as { handback?: TaskHandback } | undefined;
    const intakeSummary = intakeEvidence?.handback?.status === "completed" && intakeEvidence.handback.taskId === intake?.taskId
      ? `\nA1 产品受理摘要：${shortenText(intakeEvidence.handback.summary, 1500)}\n以上摘要仅供参考。` : "";
    if (isDirectProductCapability(view.action) || direct) {
      if (direct?.state === "pending" && direct.dispatch.actor === "application"
        && direct.dispatch.flowId === view.flowId && direct.roleId === "product"
        && direct.task.roleId === direct.roleId && direct.taskId === direct.task.taskId
        && direct.task.stage === stage && direct.task.parentTaskId === view.ref.instanceId
        && direct.task.stageAttempt === view.attempt) {
        const duty = stage === "A1" ? "此节点只读。" : `撰写可提交审批的产品意图草稿，写入 docs/product/${direct.flowId}-intent-vN.md。采用小规模、可调整的默认方案时，把它明确标为待审批假设。只有缺少关键决定以致无法给出草案时，才回报 blocked 并列出具体问题。`;
        await this.materializeDurableTask(view, {
          taskId: direct.taskId, sourceRoleId: "application", creator: view.workflowOwnedDispatch ? "convener" : "chief", roleId: direct.roleId,
          stage, binding: direct.task, sideEffect: stage === "A1" ? "read-only" : "docs",
          details: { ...direct.dispatch,
            text: `${direct.dispatch.text}\n应用已绑定工作流 ${view.ref.instanceId} 和 flowId ${direct.flowId}。${duty}${intakeSummary}` },
        });
      }
      return;
    }
    if (view.action === "archive-acceptance") await syncGraphArchive(this.deps.durableWorkflow!, view);
    if (view.action === "team-baseline" && ![...this.sessions.values()].some(entry => entry.projectRoot === view.projectRoot
      && entry.roleId === convener && entry.busy)) await resumeGraphBaseline(this.deps.durableWorkflow!, view);
    const card = graphCardProfile(view);
    if (card && this.deps.customerInput) {
      let draft = "";
      if (card.kind === "intent-confirm") {
        const checked = await store.prepareDirectIntentGate(view.ref);
        if (!checked.ok) {
          closeDesktopGraphCard(this.deps.durableWorkflow!, view.projectRoot);
          const summary = `A3 意图审批待幕僚处理。工作流 ${view.ref.instanceId}。${checked.message} 请核对产品稿并协调补正。`;
          const notice = await recordWorkflowNotice(view.projectRoot, chief, {
            ref: `intent-gate:${view.ref.instanceId}:${view.attempt}:${durableHash(checked.message).slice(0, 16)}`, summary,
          });
          if (notice === "recorded") this.emitDeliveryNote(view.projectRoot, runtime, chief, chief, summary);
          return;
        }
        if (checked.value) {
          const { path: productDraft, intentId } = checked.value;
          draft = `\n应用已核对产品稿 ${productDraft}。请阅读该稿，并按该稿在 docs/intents/${intentId}.md 写意图入口，frontmatter 至少包含 intentId: ${intentId}、flowId: ${view.flowId} 和 goal；保留待客户确认项，再用 request_choice 提交意图确认卡。`;
        }
      }
      const registration = this.deps.getRegisteredProjectLifecycle?.(view.projectRoot);
      if (!await resumeDesktopGraphCard(this.deps.durableWorkflow!, view, {
        customer: this.deps.customerInput,
        executeDecision: this.port.durableDecisionExecutor(view.projectRoot, view.metadata.runtime),
        isRegistered: () => !!registration && this.deps.getRegisteredProjectLifecycle?.(view.projectRoot)?.selectionId === registration.selectionId,
      })) {
        if (view.workflowOwnedDispatch && !this.sessions.get(this.sessionKey(view.projectRoot, chief, runtime))?.busy &&
          store.listEffects(view.ref, "model-send").some(effect => effect.intent.key === `model:chief-intake:${view.stepId}:${view.attempt}` && effect.state === "succeeded")) {
          await this.noteWorkflowException(view, chief, "workflow-card-not-submitted", `确认回合已结束，尚未登记 ${card.stage} 确认卡。请核对本节点的材料和卡片回执。`);
          return;
        }
        await this.queueDurablePrompt(view, chief, "application",
          `工作流 ${view.ref.instanceId}，flowId ${view.flowId ?? ""}。请使用原有 ${card.kind} 客户卡入口提交当前 ${card.stage} 文档，以应用校验的证据等待决定。${draft}`,
          runtime, `chief-intake:${view.stepId}:${view.attempt}`);
      }
    }
    if (view.action === "observe-existing" && !view.workflowOwnedDispatch && !currentRequest) {
      await this.queueDurablePrompt(view, chief, "application",
        `客户请求：${view.metadata.summary ?? ""}\n核定客户要求是否是可定位的现有实现变更。仅当有依据时，向运营 ${convener} 发工作流 ${view.ref.instanceId} 的路径 B B1 advance，并提供 flowId、requestedEvidence（现有模块真实文件）和 reason（对应客户请求的现有行为及改动理由）。`,
        runtime, `chief-intake:${view.stepId}:${view.attempt}`);
    }
    if (view.action === "verify-stop" && !view.workflowOwnedDispatch) {
      await this.queueDurablePrompt(view, convener, "application",
        `核对工作流 ${view.ref.instanceId} 已无在途任务、未确认写入或待核对 Git 作用。仅在确认停稳后使用 submit_report 提交 completed 报告与依据。`,
        runtime, `stop:${view.stepId}:${view.attempt}`, undefined, undefined, undefined, true);
    }
    if (view.workflowOwnedDispatch) {
      await this.syncWorkflowGraphTasks(view, chief, convener);
      return;
    }
    const independent = profile?.target === "independent-reviewer";
    const active = view.pendingTasks?.some(task => task.stepId === view.stepId && task.attempt === view.attempt);
    if (profile && !currentRequest && !active) {
      const instruction = independent ? profile.prompt
        : `请通过 dispatch_task 向运营 ${convener} 提交路径 A 的 ${profile.stage} advance。审批或派工由本次实际能力处理。`;
      await this.queueDurablePrompt(view, chief, "application",
        `客户请求：${view.metadata.summary ?? ""}${intakeSummary}\n工作流 ${view.ref.instanceId}${view.flowId ? `，flowId ${view.flowId}` : ""}。\n${instruction}`,
        runtime, `chief-intake:${view.stepId}:${view.attempt}`);
    }
    if (profile && currentRequest?.input.kind === "stage-request" && !independent) {
      const taskId = durableTaskId(view.ref, convener, view.stepId, view.attempt);
      await this.materializeDurableTask(view, {
        taskId, sourceRoleId: chief, roleId: convener, stage: profile.stage, stageRequest: true,
        details: { ...currentRequest.input.dispatch, text: `${currentRequest.input.dispatch.text}\n${profile.prompt}` +
          (intakeSummary ? `\n应用已绑定工作流 ${view.ref.instanceId} 和 flowId ${view.flowId}。${intakeSummary}` : "") },
        binding: { stage: profile.stage, stageAttempt: view.attempt, executionAttempt: 1,
          parentTaskId: currentRequest.source.originId, taskId, roleId: convener },
      });
    }
    for (const pending of view.pendingTasks ?? []) {
      if (pending.state !== "pending" && pending.state !== "reported") continue;
      if (pending.task.stage === "readonly" || isDirectProductCapability(pending.capability)) continue;
      const address = { ...view, stepId: pending.stepId, attempt: pending.attempt };
      const binding = events.find(({ event }) => event.input.kind === "task-bound" &&
        event.input.task.taskId === pending.taskId)?.event;
      if (!binding) continue;
      const creator = binding.source.roleId;
      if (creator !== "chief" && creator !== "convener") continue;
      if (pending.state === "pending") {
        await this.materializeDurableTask(address, {
          taskId: pending.taskId, sourceRoleId: creator, creator,
          roleId: pending.roleId, stage: pending.task.stage, binding: pending.task,
          details: pending.capability === "author-intent" && intakeSummary ? {
            ...pending.dispatch, text: `${pending.dispatch.text}\n工作流 ${view.ref.instanceId}，flowId ${pending.flowId}。\n意图文档使用 docs/product/${pending.flowId}-intent-vN.md。${intakeSummary}`,
          } : pending.dispatch,
          modulePaths: pending.modulePaths, sideEffect: pending.task.stage === "A11" ? "code" : "docs",
        });
      }
      const report = pending.report && store.getEvidence(view.ref, pending.report.evidence) as { handback?: TaskHandback } | undefined;
      if (report?.handback && pending.report) {
        if (pending.task.stage === "A1" || pending.task.stage === "A4" || pending.task.stage === "A7") continue;
        const reviewerTask: DurableTaskBinding = {
          stage: pending.task.stage, stageAttempt: pending.attempt, executionAttempt: pending.task.executionAttempt,
          parentTaskId: pending.task.taskId, taskId: pending.task.parentTaskId, roleId: creator,
        };
        await this.queueDurablePrompt(address, creator, pending.roleId,
          `${renderWorkReportPrompt(report.handback)}\n请核对真实证据后使用 close_created_task。若运营完成实施核验，请用 submit_report 回交实施依据。`,
          runtime, `graph-report:${pending.taskId}:${pending.report.key}`, undefined, reviewerTask,
          creator === convener ? pending.task.parentTaskId : undefined);
      }
    }
  }

  private async noteWorkflowException(view: DurableProjection, chief: string, code: string, reason: string, taskId?: string): Promise<void> {
    const summary = `工作流 ${view.ref.instanceId} 在 ${view.stepName} 需要幕僚处理。${shortenText(reason, 500)}`;
    const notice = await recordWorkflowNotice(view.projectRoot, chief, {
      ref: `workflow-exception:${view.ref.instanceId}:${view.stepId}:${view.attempt}:${code}`, summary, taskId,
    });
    if (notice === "recorded") this.emitDeliveryNote(view.projectRoot, this.durableRuntime(view), chief, chief, summary);
  }

  private async syncA11Disposition(view: DurableProjection, chief: string, convener: string): Promise<boolean> {
    const disposition = view.a11Disposition;
    if (disposition?.state !== "parked") return false;
    const key = `a11-index-recovery:${disposition.key}`;
    if (this.reconcilingA11Dispositions.has(key)) return true;
    this.reconcilingA11Dispositions.add(key);
    try {
      const active = await reconcileDesktopA11Disposition(this.deps.durableWorkflow!, view, this.deps, key);
      if (active) await this.syncBlockedScope(active, chief, convener);
    } finally {
      this.reconcilingA11Dispositions.delete(key);
    }
    return true;
  }

  private async syncBlockedScope(view: DurableProjection, chief: string, convener: string): Promise<boolean> {
    const durable = this.deps.durableWorkflow!;
    const { projectRoot, ref } = view;
    if (view.b2EvidenceDecision && !view.b2EvidenceDecision.decision) {
      const customer = this.deps.customerInput;
      const selection = this.deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId;
      if (customer) await presentB2EvidenceScopeCard({ durable, view, chief, customer,
        isRegistered: () => !!selection && this.deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === selection });
      else await this.noteWorkflowException(view, chief, "workflow-b2-evidence-decision-unavailable", "等待在当前主窗口确认 B2 取证范围。");
      return true;
    }
    const scope = view.blockedRouting;
    if (!scope || scope.decision) closeBlockedScopeCard(durable, projectRoot);
    if (!scope) return false;
    if (scope.a12bPrepareKey || scope.evidenceAuditKey) await this.noteWorkflowException(view, chief, scope.binding.requestId, workspacePreparationSummary(view) ?? scope.reason, scope.origin.task.taskId);
    const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
    const isRegistered = () => !!registration && this.deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === registration.selectionId;
    if (!scope.decision) {
      if (this.deps.customerInput) await presentBlockedScopeCard({ durable, view, chief, customer: this.deps.customerInput, isRegistered,
        executeDecision: this.port.durableDecisionExecutor(projectRoot, view.metadata.runtime) });
      else await this.noteWorkflowException(view, chief, "workflow-blocked-scope-card-unavailable", "当前窗口无法展示原项目的范围处置卡。", scope.origin.task.taskId);
      return true;
    }
    if (scope.a11DispositionKey || scope.a12bPrepareKey || !isRegistered() || scope.decision.option === "stop") return true;
    const choice = scope.decision.option;
    if (scope.evidenceAuditKey && choice !== "route" && (choice !== "compromise" || !scope.evidenceCompromise)) return true;
    const store = await durable.store();
    const runtime = this.durableRuntime(view);
    const isCurrent = () => {
      const latest = store.lookup(ref);
      return isRegistered() && latest?.status === "waiting" && latest.engine === "healthy" && latest.stepId === view.stepId && latest.attempt === view.attempt
        && latest.blockedRouting?.binding.digest === scope.binding.digest && latest.blockedRouting.decision?.option === scope.decision?.option;
    };
    if (choice === "wait" || choice === "route" || view.documentRevision?.status === "resumed") {
      const resumed = await store.resumeBlockedScopeChange(ref, scope.binding.requestId,
        choice === "wait" ? desktopVerificationPreflight(this.deps, runtime) : undefined, isCurrent);
      if (resumed.ok && !store.lookup(ref)?.blockedRouting) durable.activate();
      else if (!resumed.ok && choice === "route") await this.noteWorkflowException(view, chief, resumed.code, resumed.message, scope.origin.task.taskId);
      return true;
    }
    if (await this.syncDocumentRevision(view, chief, convener)) return true;
    const { parent } = operationsTasks(view);
    if (!parent || parent.roleId !== convener || parent.taskId !== scope.origin.task.taskId || !isCurrent()) return true;
    const wake = `a11-scope-revise:${scope.binding.requestId}`;
    const sent = store.listEffects(ref, "model-send").find(effect => effect.intent.key === `model:${wake}`);
    const session = this.sessions.get(this.sessionKey(projectRoot, parent.roleId, runtime));
    if (!session?.busy && !session?.origins.running) {
      if (sent?.state === "succeeded") {
        await this.noteWorkflowException(view, chief, "workflow-scope-revision-request-missing", "当前运营接续回合已结束，尚未提交选定的原文件修订申请。", parent.taskId);
      } else if (!sent || sent.state === "not-started") {
        await this.queueDurablePrompt(view, parent.roleId, "application",
          `本次已有效选择申请修订 ${scope.document.path}（原 SHA-256 ${scope.document.sha256}）。在原运营任务 #${parent.taskId} 使用 request_document_revision 提交该文件的具体修订理由，再等待当前新版本的实际批准。${scope.evidenceCompromise
            ? `拟调整验收条目 ${scope.evidenceCompromise.requirementIds.join("、")}，可核对的候选原件 ${scope.evidenceCompromise.paths.join("、")}。经原批准后仍须重新签发标准、取证和审计。` : ""}`,
          runtime, wake, undefined, parent.task, parent.taskId);
      }
    }
    return true;
  }

  private async syncDocumentRevision(view: DurableProjection, chief: string, convener: string): Promise<boolean> {
    const revision = view.documentRevision;
    if (!revision) return false;
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const runtime = this.durableRuntime(view);
    const { parent } = operationsTasks(view);
    if (!parent || parent.taskId !== revision.origin.taskId) return false;
    if (revision.status !== "awaiting-approval") closeDocumentRevisionCard(durable, view.projectRoot);
    switch (revision.status) {
      case "pending": {
        const operations = this.sessions.get(this.sessionKey(view.projectRoot, convener, runtime));
        if (operations?.busy || operations?.origins.running) return true;
        if (revision.task.stage === "readonly" || !view.flowId) break;
        await this.materializeDurableTask(view, {
          taskId: revision.task.taskId, sourceRoleId: "application", roleId: revision.roleId,
          stage: revision.task.stage, binding: revision.task, sideEffect: "docs", parentTaskId: parent.taskId,
          details: { flowId: view.flowId, actor: "application", text: `工作流暂停原运营任务 #${parent.taskId}。核对并修订治理文件 ${revision.path}。` +
            `\n运营报告的问题：${revision.reason}\n请读取正式文件与同流程关联依据，使用 submit_document_revision 提交本文件的完整候选内容。` +
            "\n应用会隔离候选并核对批准条件。当前任务只提交该文件的候选，不直接写入正式文件或改变授权。" },
        });
        break;
      }
      case "awaiting-approval": {
        const registration = this.deps.getRegisteredProjectLifecycle?.(view.projectRoot);
        if (this.deps.customerInput) await presentDocumentRevisionCard({ durable, view, revision, chief,
          customer: this.deps.customerInput, executeDecision: this.port.durableDecisionExecutor(view.projectRoot, view.metadata.runtime),
          isRegistered: () => !!registration && this.deps.getRegisteredProjectLifecycle?.(view.projectRoot)?.selectionId === registration.selectionId });
        else await this.noteWorkflowException(view, chief, `revision-card-unavailable:${revision.id}`, "当前窗口无法呈现本人修订确认卡。", revision.task.taskId);
        break;
      }
      case "ready":
      case "applying": {
        const result = await store.resumeDocumentRevision(view.ref);
        if (!result.ok) await this.noteWorkflowException(view, chief, `revision:${revision.id}:${result.code}`, result.message, revision.task.taskId);
        break;
      }
      case "blocked":
        await this.noteWorkflowException(view, chief, `revision-blocked:${revision.id}`,
          revision.blockedReason ?? `治理文件 ${revision.path} 的修订未能恢复原节点。`, revision.task.taskId);
        break;
      case "resumed": {
        const key = `a11-revision-resume:${revision.id}`;
        const sent = store.listEffects(view.ref, "model-send").find(effect => effect.intent.key === `model:${key}`);
        if (sent?.state === "succeeded") return false;
        await this.queueDurablePrompt(view, convener, "application",
          `应用已核对治理文件 ${revision.path} 的修订并恢复本次 A11 运营任务 #${parent.taskId}。` +
          `请重新核对当前生效的治理依据和工作项，按已批准写域继续原任务。${view.evidenceAudit?.state === "collecting" ? evidenceOperatorInstructions(view) : ""}`, runtime, key, undefined, parent.task, parent.taskId);
        break;
      }
    }
    return true;
  }

  private async syncWorkflowGraphTasks(view: DurableProjection, chief: string, convener: string): Promise<void> {
    if (view.action === "operations-environment-recovery") return this.syncEnvironmentRecovery(view);
    if (view.action === "operations-implementation") {
      const runtime = this.durableRuntime(view);
      const incomplete = view.blockedRoutingEnabled && operationsTasks(view).children.find(task => task.state === "pending" && !task.workOrder && !task.evidenceWorkOrder);
      if (incomplete) {
        await this.noteWorkflowException(view, chief, "workflow-implementation-order-missing", "本次 A11 子任务缺少核验过的应用工单，先核对当前职责与依据。", incomplete.taskId);
        return;
      }
      const next = nextOperationsDelivery(await this.deps.durableWorkflow!.store(), view, this.sessions.get(this.sessionKey(view.projectRoot, convener, runtime))?.busy ?? false);
      if (!next) return;
      const { task, text, wake } = next;
      if (view.blockedRoutingEnabled && task.workOrder) {
        const owner = await preflightDesktopImplementationOwner(view.projectRoot, task.roleId, task.workOrder.paths, this.deps);
        if (!owner.ok) {
          await this.noteWorkflowException(view, chief, owner.code, owner.message, task.taskId);
          return;
        }
      }
      if (wake) return this.queueDurablePrompt(view, task.roleId, wake.sourceRoleId, text, runtime, wake.key, undefined, task.task, task.taskId);
      return this.materializeDurableTask(view, { taskId: task.taskId, sourceRoleId: "application", roleId: task.roleId, stage: "A11",
        binding: task.task, modulePaths: task.modulePaths, details: { ...task.dispatch, text }, sideEffect: task.workItemId ? "code" : "read-only",
        parentTaskId: task.workItemId || task.evidenceWorkOrder ? task.task.parentTaskId : undefined });
    }
    const pending = view.pendingTasks?.find(task => task.stepId === view.stepId && task.attempt === view.attempt &&
      task.dispatch.actor === "application" && task.task.stage !== "readonly" && !task.evidenceWorkOrder);
    if (!pending || pending.task.stage === "readonly") return;
    const stage = pending.task.stage;
    const store = await this.deps.durableWorkflow!.store();
    const candidateOid = graphImplementationTip(store, view);
    if (pending.state === "pending") {
      if (stage === "A12b" && !view.evidenceAuditEnabled && !view.evidenceAudit?.legacy && !view.acceptanceWorkspace?.preparationGate && await holdDesktopUnavailableAssessment(this.deps.durableWorkflow!, view, pending, this.deps, this.durableRuntime(view),
        (code, message) => this.noteWorkflowException(view, chief, code, message, pending.taskId))) return;
      const events = store.listCapabilityEvents(view.ref);
      const proposalCard = events.findLast(row => row.receipt.state === "consumed" && row.event.input.kind === "card-prepared" &&
        row.event.input.card.cardKind === "proposal")?.event.input;
      const proposal = proposalCard?.kind === "card-prepared" ? events.findLast(row => row.receipt.state === "consumed" &&
        row.event.input.kind === "card-decided" && row.event.input.decision === "approve" &&
        row.event.input.requestId === proposalCard.card.requestId)?.event.input : undefined;
      const proposalRequestId = proposal?.kind === "card-decided" ? proposal.requestId : undefined;
      if (stage === "A12b" && typeof candidateOid !== "string") {
        await this.noteWorkflowException(view, chief, "workflow-assessment-candidate-missing", "本次独立验收无可核验的已接纳候选提交。", pending.taskId);
        return;
      }
      const candidate = stage === "A12b" ? `\n候选提交：${candidateOid}。验收报告 YAML frontmatter 必须逐字记录 candidateOid，并以 outcome: accepted、outcome: rework 或 outcome: blocked 表达结论。` : "";
      const verified = pending.verificationCapabilities ?? view.verificationCapabilities;
      if (stage === "A12a" && view.blockedRoutingEnabled && !verified) {
        await this.noteWorkflowException(view, chief, "workflow-verification-capabilities-missing", "当前独立标准缺少应用实际能力核对，先核对当前角色和运行时。", pending.taskId);
        return;
      }
      const capability = stage === "A12a" && view.blockedRoutingEnabled ? verificationStandardPrompt(verified, view.implementationItems)
        : stage === "A12b" && view.blockedRoutingEnabled ? verificationAssessmentPrompt(view.verificationPlan) : "";
      await this.materializeDurableTask(view, {
        taskId: pending.taskId, sourceRoleId: "application", roleId: pending.roleId, stage,
        binding: pending.task, modulePaths: pending.modulePaths,
        sideEffect: stage === "A11" ? "code" : stage === "A4" || stage === "A7" ? "read-only" : "docs",
        details: { ...pending.dispatch, text: `${pending.dispatch.text}\n${workflowRoleDuty(stage, pending.flowId, proposalRequestId, view.evidenceCollectorRoleId)}${candidate}${capability}${pending.reviewWritePath ? `\n本次唯一预检通过的证据文件：${pending.reviewWritePath}` : ""}` },
      });
      return;
    }
    if (pending.state !== "reported" || !pending.report || !["A5", "A8", "A11", "A12a", "A12b"].includes(stage)) return;
    const snapshot = store.getEvidence(view.ref, pending.report.evidence) as { handback?: TaskHandback; artifacts?: DurableEvidenceRef[] } | undefined;
    const report = snapshot?.handback;
    if (!report?.turnId || this.sessions.get(this.sessionKey(view.projectRoot, pending.roleId, this.durableRuntime(view)))?.busy) return;
    const effect = store.listEffects(view.ref, "model-send").find(row => row.intent.key === `model:${pending.taskId}`);
    if (effect?.state !== "succeeded" || report.turnId !== effect.result?.result?.turnId) return;
    if (stage === "A12b") {
      const frozen = await closeDesktopAcceptanceWorkspace(store, view, pending.taskId);
      if (!frozen.ok) {
        await store.prepareEvidenceAudit(view.ref, { verifiedLegacyFailure: true });
        store.block(view.ref, frozen.code, frozen.message);
        return;
      }
    }
    let outcome: "accepted" | "rework" | "rejected" = report.status === "completed" ? "accepted" : "rejected";
    let documents = snapshot?.artifacts;
    let tipOid: string | undefined;
    if (stage === "A12a" || stage === "A12b") {
      const proof = await workflowReviewProof(store, view, stage, pending.flowId, report, documents, candidateOid);
      if (proof.ok) ({ documents, outcome, tipOid } = proof.value);
      else {
        await this.noteWorkflowException(view, chief, proof.code, proof.message, pending.taskId);
        outcome = "rejected";
        documents = undefined;
      }
    }
    if (stage === "A12b" && outcome === "accepted" && !view.evidenceAuditEnabled) {
      const verified = await confirmAcceptanceEnvironmentAssessment(store, view, pending, report.turnId);
      const evidence = verified.ok ? await verifyDesktopAcceptanceWorkspaceEvidence(store, view, pending, report.turnId, report.evidence) : verified;
      if (!evidence.ok) {
        await store.prepareEvidenceAudit(view.ref, { verifiedLegacyFailure: true });
        store.block(view.ref, evidence.code, evidence.message);
        await this.noteWorkflowException(view, chief, evidence.code, evidence.message, pending.taskId);
        return;
      } else if (evidence.value.length) documents = [...documents ?? [], ...evidence.value];
    }
    if (stage === "A11" && outcome === "accepted") {
      const evidence = await this.refs.evidence.buildFixedCloseEvidence(view.projectRoot, pending.taskId, undefined);
      if (!evidence.ok || !evidence.evidence?.branchTipOid) {
        await this.noteWorkflowException(view, chief, "workflow-implementation-evidence-missing", evidence.ok ? "缺少实际提交。" : evidence.message, pending.taskId);
        outcome = "rejected";
      } else {
        tipOid = evidence.evidence.branchTipOid;
        const review = store.listCapabilityEvents(view.ref).find(row => row.receipt.state !== "ignored" && row.event.stepId === view.stepId &&
          row.event.attempt === view.attempt && row.event.input.kind === "operator-report" && row.event.input.parentTaskId === pending.task.parentTaskId)?.event.input;
        if (review?.kind !== "operator-report") {
          const task: DurableTaskBinding = { ...pending.task, roleId: convener, taskId: pending.task.parentTaskId, parentTaskId: pending.taskId };
          const text = `${renderWorkReportPrompt(report)}\n核对本次真实提交 ${tipOid} 与实现报告，使用 submit_report 回交核对结论和依据。`;
          await this.materializeDurableTask(view, { taskId: task.taskId, sourceRoleId: "application", roleId: convener, stage,
            details: { ...pending.dispatch, text }, binding: task, sideEffect: "read-only", operationKey: `graph-report:${pending.taskId}:${pending.report.key}` });
          return;
        }
        const reviewReport = store.getEvidence(view.ref, review.evidence) as { handback?: TaskHandback } | undefined;
        if (reviewReport?.handback?.status !== "completed") {
          await this.noteWorkflowException(view, chief, "workflow-implementation-review-blocked", reviewReport?.handback?.summary ?? "运营提交核验未通过。", pending.taskId);
          outcome = "rejected";
        }
      }
    }
    const durable = this.deps.durableWorkflow!;
    const saved = await closeWorkflowTask(durable, view, pending, outcome, documents, tipOid);
    if (!saved.ok) {
      await this.noteWorkflowException(view, chief, saved.code, saved.message, pending.taskId);
      const staticProofRejected = stage === "A12b" && (saved.code === "acceptance-workspace-static-startup-missing"
        || saved.code === "acceptance-workspace-static-check-required");
      const decisionProofRejected = (stage === "A12a" || stage === "A12b") && saved.code === "workflow-review-proposal-decision-mismatch";
      const browserProofRejected = stage === "A12b" && saved.code === "acceptance-workspace-browser-proof-required";
      const verificationProofRejected = stage === "A12b" && saved.code === "verification-assessment-proof-required";
      if (outcome === "accepted" && (saved.code === "workflow-required-roles-incomplete" || staticProofRejected || decisionProofRejected || browserProofRejected || verificationProofRejected)) {
        const rejected = await closeWorkflowTask(durable, view, pending, "rejected");
        if (!rejected.ok) await this.noteWorkflowException(view, chief, rejected.code, rejected.message, pending.taskId);
      }
    }
  }

  private async syncEnvironmentRecovery(view: DurableProjection): Promise<void> {
    const recovery = view.acceptanceEnvironment;
    const parent = recovery?.parentTask;
    if (!parent || recovery.state !== "recovering") return;
    const operator = acceptanceEnvironmentTask(view, parent.roleId, parent.taskId, "parent");
    if (!operator || operator.state !== "pending") return;
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const runtime = this.durableRuntime(view);
    const child = recovery.childTask && acceptanceEnvironmentTask(view, recovery.childTask.roleId, recovery.childTask.taskId, "child");
    const facts = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state !== "ignored");
    if (facts.some(({ event }) => event.input.kind === "environment-recovery-settled"
      && event.input.settlement.parentTask.taskId === parent.taskId)) return;
    if (!child) {
      if (facts.some(({ event }) => event.input.kind === "environment-recovery-dispatch"
        && event.input.dispatch.parentTask.taskId === parent.taskId)) return;
      if (!recovery.eligibleRoleIds?.length) {
        await store.settleAcceptanceEnvironment(view.ref, { parentTask: parent,
          outcome: { kind: "blocked", reason: "当前获批团队中没有可核验的 package.json 责任人。" } }, () =>
          store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId);
        durable.activate();
        return;
      }
      const sent = store.listEffects(view.ref, "model-send").find(row => row.intent.key === `model:${parent.taskId}`);
      const session = this.sessions.get(this.sessionKey(view.projectRoot, parent.roleId, runtime));
      if (sent?.state === "succeeded" && !session?.busy && !session?.origins.running) {
        const result = await store.settleAcceptanceEnvironment(view.ref, { parentTask: parent,
          outcome: { kind: "blocked", reason: "原运营回合已结束，未核定并派发获批属主。" } }, () =>
          store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId
          && !store.lookup(view.ref)?.acceptanceEnvironment?.childTask);
        if (result.ok) durable.activate();
        return;
      }
      const text = `${operator.dispatch.text}\n核对当前任务依据后，用 dispatch_task 指派一名获批 package.json 属主（${recovery.eligibleRoleIds.join("、")}）。传 roleId、task、稳定 idempotencyKey，可使用 stage=A12b。\n等待属主正式回交后，用 close_created_task 核对原应用回执和本地实物。无合格属主时以 submit_report blocked 报告具体缺项。`;
      return this.materializeDurableTask(view, { taskId: parent.taskId, sourceRoleId: "application", roleId: parent.roleId,
        stage: "A12b", binding: parent, details: { ...operator.dispatch, text }, sideEffect: "read-only" });
    }
    if (child.state === "pending") {
      const text = `${child.dispatch.text}\n本任务只补齐应用已核对的本地依赖。调用无参数 restore_acceptance_environment，等原应用命令审批和实际结果。核对后以 submit_report 正式回交应用回执和结果；安装及核验成功回交 completed，其他情况回交 blocked。保留包清单、锁文件、现有输出和 Git 候选。`;
      return this.materializeDurableTask(view, { taskId: child.taskId, sourceRoleId: parent.roleId, roleId: child.roleId,
        stage: "A12b", binding: child.task, parentTaskId: parent.taskId, details: { ...child.dispatch, text }, sideEffect: "read-only" });
    }
    if (child.state !== "reported" || !child.report) return;
    const snapshot = store.getEvidence(view.ref, child.report.evidence) as { handback?: TaskHandback } | undefined;
    if (!snapshot?.handback || this.sessions.get(this.sessionKey(view.projectRoot, parent.roleId, runtime))?.busy) return;
    const key = recoveryWakeKey(child);
    const wake = store.listEffects(view.ref, "model-send").find(row => row.intent.key === `model:${key}`);
    if (wake?.state === "succeeded" || wake?.state === "unknown") {
      const result = await store.settleAcceptanceEnvironment(view.ref, { parentTask: parent, childTask: child.task,
        outcome: { kind: "blocked", reason: "原运营核对回合已结束，未形成有效的正式收口。请核对原应用回执与本地实物。" } }, () =>
        store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId &&
        !this.sessions.get(this.sessionKey(view.projectRoot, parent.roleId, runtime))?.busy);
      if (result.ok) durable.activate();
      return;
    }
    await this.queueDurablePrompt(view, parent.roleId, child.roleId,
      `${renderWorkReportPrompt(snapshot.handback)}\n核对本次恢复子任务 #${child.taskId}。使用 close_created_task：实物核验补齐为 accepted，仅明确可重试的环境失败用 rework，其余用 rejected。应用会检查真实回执与当前状态并给出有效处置。`,
      runtime, key, undefined, parent, parent.taskId);
  }

  private async queueDurablePrompt(
    projection: DurableProjection, roleId: string, sourceRoleId: string, text: string, runtime: RuntimeKind,
    key: string, taskId?: string, task?: DurableTaskBinding, assignmentTaskId?: string, unassigned = false,
  ): Promise<void> {
    const { ref, projectRoot } = projection;
    const dedupKey = `${projectRoot}\0${runtime}\0durable\0${ref.instanceId}\0${key}`;
    if (this.preparingDurablePrompts.has(dedupKey)) return;
    this.preparingDurablePrompts.add(dedupKey);
    try {
      await this.prepareDurablePrompt(projection, roleId, sourceRoleId, text, runtime, key, dedupKey, taskId, task, assignmentTaskId, unassigned);
    } finally {
      this.preparingDurablePrompts.delete(dedupKey);
    }
  }

  private async prepareDurablePrompt(
    projection: DurableProjection, roleId: string, sourceRoleId: string, text: string, runtime: RuntimeKind,
    key: string, dedupKey: string, taskId?: string, task?: DurableTaskBinding, assignmentTaskId?: string, unassigned = false,
  ): Promise<void> {
    const { ref, stepId, attempt, projectRoot } = projection;
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const operation = `model:${key}`;
    const parent = projection.evidenceAudit && evidenceOperatorBinding(projection);
    const parentGeneration = parent?.taskId === task?.taskId && parent?.roleId === roleId ? projection.evidenceAudit?.basis.generation : undefined;
    const assessment = task?.stage === "A12b" && projection.action === "independent-assessment" ? task : undefined;
    const admission = assessment && await desktopAssessmentAdmission(store, projection, assessment);
    if (assessment && !admission) return;
    if (admission) dedupKey += admission.dedup;
    const clientMessageId = this.appDispatchClientMessageId(dedupKey);
    const queued = () => this.port.pendingAppTaskDelivery(projectRoot, roleId, runtime, clientMessageId);
    const shouldQueue = () => {
      const existing = store.listEffects(ref, "model-send").find(effect => effect.intent.key === operation);
      if (existing && existing.state !== "not-started" || pendingDeliveryBlocksQueue(projection, key, queued())) return false;
      if (task?.stage === "A12b" && projection.acceptanceEnvironment?.enabled && assessmentHasEnvironmentFact(store, projection, task)) return false;
      const live = store.lookup(ref);
      return live?.engine === "healthy" && live.status === "waiting" &&
        live.a11Disposition?.state !== "parked" && (parentGeneration === undefined || live.evidenceAudit?.basis.generation === parentGeneration) &&
        (live.stepId === stepId && live.attempt === attempt || live.pendingTasks?.some(item =>
          item.taskId === (taskId ?? task?.parentTaskId) && item.stepId === stepId && item.attempt === attempt &&
          item.capability === "independent-standard" && (item.state === "pending" || item.state === "reported")));
    };
    if (!shouldQueue()) return;
    const existingSession = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!taskId && (existingSession?.sessionWorkflowMode !== "fixed" || !durable.isSession(existingSession.handle) ||
        (assignmentTaskId !== undefined && existingSession.assignedTaskId !== assignmentTaskId)
        || unassigned && existingSession.assignedTaskId !== undefined)) {
      if (existingSession?.busy || existingSession?.origins.running) return;
      const opened = await this.openInternal({ projectRoot, roleId, runtime, forcedWorkflowMode: "fixed",
        ...(assignmentTaskId ? { taskId: assignmentTaskId } : {}) }, false);
      if (!opened.ok || !shouldQueue()) return;
    }
    durable.registerDelivery(projectRoot, clientMessageId, {
      ref, roleId, runtime, assignmentTaskId, workflowOwnedDispatch: projection.workflowOwnedDispatch,
      selectionId: this.deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId,
      intent: {
        key: operation, kind: "model-send", stepId, attempt, task,
        expected: { roleId, runtime, inputDigest: durableHash(text), clientMessageId,
          ...admission && admission.expected, ...(parentGeneration !== undefined ? { evidenceAuditParentGeneration: String(parentGeneration) } : {}) },
      },
    });
    if (!queued()) this.enqueueDelivery(projectRoot, roleId, {
      kind: taskId ? "dispatch" : "system", runtime, targetRoleId: roleId, sourceRoleId,
      taskId, text, summary: shortenSummary(text), dedupKey, clientMessageId,
    });
    void this.drainQueue(projectRoot, roleId, runtime);
  }
  private async materializeDurableTask(projection: DurableProjection, input: Parameters<FixedWorkflowRoute["materializeDurableTaskOnce"]>[1]): Promise<void> {
    const key = `${projection.projectRoot}\0${input.taskId}`;
    if (this.materializingDurableTasks.has(key)) return;
    this.materializingDurableTasks.add(key);
    try {
      const decision = projection.proposalDecision;
      if (decision && ["A11", "A12a", "A12b"].includes(input.stage) && !input.details.text.includes(decision.selectionDigest)) {
        input = { ...input, details: { ...input.details,
          text: `${input.details.text}\nA6 已批准定案 ${decision.requestId}，选择摘要 ${decision.selectionDigest}，实际值 ${JSON.stringify(decision.values)}。按该组定案实施或核对，冲突请按原流程回交。` } };
      }
      if (input.stage === "A12b") {
        const workspace = await prepareDesktopAssessmentDispatch(this.deps.durableWorkflow!, projection, input.taskId, this.deps);
        if (workspace.hold) return;
        if (workspace.text) input = { ...input, details: { ...input.details, text: input.details.text + workspace.text } };
      }
      await this.materializeDurableTaskOnce(projection, input);
    } finally {
      this.materializingDurableTasks.delete(key);
    }
  }

  private async materializeDurableTaskOnce(projection: DurableProjection, input: {
    taskId: string; sourceRoleId: string; roleId: string; stage: WorkflowStage; details: DurableDispatchDetails;
    stageRequest?: true; binding?: DurableTaskBinding; modulePaths?: readonly string[]; parentTaskId?: string;
    creator?: "chief" | "convener"; sideEffect?: "read-only" | "docs" | "code"; operationKey?: string;
  }): Promise<void> {
    const { projectRoot, ref } = projection;
    const key = `durable-task:${input.taskId}`;
    const state = await this.readTasks(projectRoot);
    const current = state.records.get(input.taskId)?.created;
    const creator = input.creator ?? (input.stageRequest ? "chief" : "convener");
    const directIntent = input.binding?.stage === "A2" && input.binding.parentTaskId === ref.instanceId ? input.binding : undefined;
    const ownedBinding = projection.workflowOwnedDispatch || directIntent ? input.binding : undefined;
    const dispatchFailure = async (reason: string) => {
      if (!ownedBinding) return;
      const chief = this.chiefTaskRoleIdOf(projectRoot);
      if (!chief) return;
      const summary = await this.deps.durableWorkflow!.rejectWorkflowDispatch(ref, ownedBinding, reason, chief);
      if (summary) this.emitDeliveryNote(projectRoot, this.durableRuntime(projection, input.details.runtime), chief, chief, summary);
    };
    if (!current) {
      const parent = input.parentTaskId ? state.records.get(input.parentTaskId)?.created : undefined;
      const parentStage = input.stage === "B3" ? "B3" : projection.action === "operations-environment-recovery" ? "A12b" : "A11";
      if (input.parentTaskId && (!parent || parent.workflowId !== ref.instanceId || parent.flowId !== input.details.flowId || parent.to !== "convener" || parent.stage !== parentStage)) return dispatchFailure("缺少本次实际运营父任务记录。");
      // The SQLite fact already exists. This journal row is a replayable projection for existing role tools.
      const result = await appendTaskEvent(projectRoot, taskEvent("task.created", {
        taskId: input.taskId,
        from: creator,
        to: input.roleId,
        flowId: input.details.flowId,
        workflowId: ref.instanceId,
        stage: input.stage,
        ...(input.stageRequest ? { taskKind: "stage-request" as const } : {}),
        text: input.details.text,
        sideEffect: input.stageRequest ? "read-only" : input.sideEffect ?? (input.stage === "B3" ? "code" : "read-only"),
        idempotencyKey: key,
        ...(parent ? { parentTaskRef: { kind: "assigned-task" as const, taskId: parent.taskId, ledgerSha256: durableHash(JSON.stringify(parent)) } } : {}),
        ...(input.modulePaths?.length ? { modulePaths: [...input.modulePaths] } : {}),
      }, () => new Date(this.now())));
      if (!result.ok) {
        if (ownedBinding) {
          await dispatchFailure(result.message ?? "产品任务无法记入派发账本。");
          return;
        }
        const store = await this.deps.durableWorkflow!.store();
        store.block(ref, result.code ?? "workflow-task-materialization-failed",
          result.message ?? "The saved workflow task could not be recorded for the assigned role.");
        return;
      }
    } else if (current.idempotencyKey !== key || current.to !== input.roleId || current.workflowId !== ref.instanceId) {
      await dispatchFailure("任务账本已有同号但身份不一致的派发记录。");
      return;
    }
    this.starTaskIds.add(input.taskId);
    taskCreators.set(input.taskId, creator);
    const dispatch = { roleId: input.roleId, task: projection.workflowOwnedDispatch && !isDirectProductCapability(projection.action)
      ? `${input.details.text}\n工作流 ${ref.instanceId}，flowId ${input.details.flowId ?? ""}，当前阶段 ${input.stage}。` : input.details.text };
    const options = { sourceRoleId: input.sourceRoleId === "application" ? "工作流" : this.roleDisplayName(projectRoot, input.sourceRoleId), taskId: input.taskId };
    let text: string;
    if (directIntent || projection.workflowOwnedDispatch) {
      // Request text and the optional A1 context are content, not mandatory document references.
      text = renderDispatchPrompt(dispatch, options);
    } else {
      const probes = new Map<string, string | undefined>();
      for (const readPath of extractDispatchReadPaths(input.details.text)) {
        probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
      }
      const plan = planDispatchDelivery(dispatch, probes, options);
      if (plan.action === "reject") return;
      text = plan.text;
    }
    await this.queueDurablePrompt(projection, input.roleId, input.sourceRoleId, text,
      this.durableRuntime(projection, input.details.runtime), input.operationKey ?? input.taskId, input.taskId, input.binding);
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
    if (action === "b3-implement-and-accept" && d.moduleId === "acceptance-evidence") {
      const dispatched = await requestEvidenceCollectionFromTurn(store, projection, fromRoleId, d, targetRoleId, source, current);
      if (dispatched.ok) durable.activate();
      return dispatched;
    }
    if (projection.workflowOwnedDispatch && action === "operations-environment-recovery") {
      const parent = projection.acceptanceEnvironment?.parentTask;
      if (!parent || fromRoleId !== parent.roleId || source.entry.assignedTaskId !== parent.taskId || source.origin.taskId !== parent.taskId
        || d.taskKind || d.workflowAction || d.workflowPath || d.reviewTarget || d.resumeController || d.reworkOf
        || d.moduleId || d.modulePaths?.length || d.stage && d.stage !== "A12b"
        || d.workflowId && d.workflowId !== ref.instanceId || d.flowId && d.flowId !== projection.flowId
        || d.sideEffect && d.sideEffect !== "read-only") {
        return reject("workflow-environment-dispatch-forbidden", "仅受理当前恢复运营任务将本次已核对缺项派给获批属主。");
      }
      const requestId = d.idempotencyKey ?? durableHash(JSON.stringify([parent.taskId, targetRoleId]));
      if (!projection.acceptanceEnvironment?.eligibleRoleIds?.includes(targetRoleId)) {
        return reject("workflow-environment-owner-forbidden", "目标角色不在本次获批的 package.json 属主名单。");
      }
      const verifiedOwner = await preflightDesktopEnvironmentOwner(projectRoot, targetRoleId, this.deps);
      if (!verifiedOwner.ok) return reject(verifiedOwner.code, verifiedOwner.message);
      const saved = await store.dispatchAcceptanceEnvironment(ref, { parentTask: parent, roleId: targetRoleId, originId: source.origin.turnId, requestId }, current);
      if (!saved.ok) return reject(saved.code, saved.message);
      if (saved.value.state === "ignored") return reject("workflow-environment-dispatch-stale", saved.value.reason ?? "原任务已变化。");
      durable.activate();
      return { ok: true, message: "已受理当前环境恢复派工，请等待属主正式回交。" };
    }
    if (projection.workflowOwnedDispatch) {
      if (projection.action !== "operations-implementation") return reject("workflow-dispatch-owned", "当前固定流程的派发由工作流执行。");
      const dispatched = await requestOperationsChild(store, projection, fromRoleId, d, targetRoleId, text, source, current,
        (roleId, paths) => preflightDesktopImplementationOwner(projectRoot, roleId, paths, this.deps));
      if (dispatched.ok) durable.activate();
      return dispatched;
    }
    const convener = this.handbackOwnerRoleId(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    if (!convener || !chief || (d.workflowId !== undefined && d.workflowId !== ref.instanceId)) {
      return reject("stage-request-invalid", "The request does not match the registered workflow.");
    }
    const profile = graphTaskProfile(projection);
    const direct = projection.pendingTasks?.find(task => isDirectProductCapability(task.capability)
      && task.stepId === stepId && task.attempt === attempt);
    if (projection.action === "product-prepare-direct" || direct?.capability === "product-prepare-direct") {
      return reject("workflow-intake-dispatch-owned", "The workflow owns this product intake dispatch.");
    }
    if (projection.action === "author-intent-direct" || direct?.capability === "author-intent-direct") {
      return reject("workflow-intent-dispatch-owned", "The workflow owns this product intent dispatch.");
    }
    if (profile) return this.routeGraphDispatch(projection, profile, runtime, fromRoleId, targetRoleId, text, d, source, current, chief, convener);
    if (projection.schema === 2 && action === "observe-existing") {
      if (fromRoleId !== chief || targetRoleId !== convener || d.taskKind !== "stage-request" || d.stage !== "B1"
        || d.workflowId !== ref.instanceId || d.workflowPath !== "B" || d.workflowAction !== "advance"
        || !d.flowId || !d.reason?.trim() || !d.requestedEvidence?.length || d.reworkOf || d.moduleId || d.modulePaths?.length) {
        return reject("workflow-existing-purpose-unverified", "The actual chief verification request must identify a tracked existing module and reason.");
      }
      const existingPaths = [...new Set(d.requestedEvidence.map(file => file.trim().replace(/\\/g, "/")))];
      if (!current()) return reject("dispatch-source-changed", "The originating turn changed during validation.");
      const saved = await store.submitCapability(ref, {
        ...graphEventAddress(projection), key: `existing-purpose:${stepId}:${attempt}`, flowId: d.flowId,
        source: { roleId: fromRoleId, originId: source.origin.turnId },
        input: { kind: "stage-request", stage: "B1", workflowPath: "B", requestDigest: durableHash(text),
          dispatch: { text, runtime, flowId: d.flowId, actor: fromRoleId }, existingPaths, reason: d.reason.trim() },
      }, current);
      return saved.ok ? { ok: true, message: `已保存现有实现资格核对请求（${saved.value.key}）。` } : reject(saved.code, saved.message);
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

  private async routeGraphDispatch(
    view: DurableProjection, profile: NonNullable<ReturnType<typeof graphTaskProfile>>, runtime: RuntimeKind,
    from: string, target: string, text: string, request: DispatchTaskPayload, source: ActualDispatchSource,
    current: () => boolean, chief: string, convener: string,
  ): Promise<DispatchReceipt> {
    const deny = (message: string): DispatchReceipt => ({ ok: false, message: `stage-request-invalid: ${message}` });
    const { ref, projectRoot, stepId, attempt } = view;
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const independent = profile.target === "independent-reviewer";
    const operatorTask = durableTaskId(ref, convener, stepId, attempt);
    const delivery = durable.delivery(projectRoot, source.origin.clientMessageId);
    const assigned = delivery?.intent.task;
    const parent = from === convener && !independent && request.taskKind !== "stage-request"
      && delivery?.roleId === convener && delivery.runtime === runtime
      && delivery.intent.stepId === stepId && delivery.intent.attempt === attempt
      && assigned?.taskId === operatorTask && assigned.roleId === convener
      && assigned.stage === profile.stage && assigned.stageAttempt === attempt
      && source.entry.assignedTaskId === operatorTask && source.origin.taskId === operatorTask
      ? store.listCapabilityEvents(ref).find(row => row.receipt.state === "consumed" && row.event.stepId === stepId
        && row.event.attempt === attempt && row.event.source.roleId === chief
        && row.event.source.originId === assigned.parentTaskId && row.event.input.kind === "stage-request")?.event
      : undefined;
    const flowId = request.flowId ?? parent?.flowId;
    const originId = source.origin.turnId;
    if (!originId || !flowId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(flowId) || view.flowId && view.flowId !== flowId
      || parent && parent.flowId !== flowId || (request.workflowId ?? (parent ? ref.instanceId : undefined)) !== ref.instanceId
      || (request.stage ?? (parent ? profile.stage : undefined)) !== profile.stage || request.reworkOf !== undefined) {
      return deny("当前实例、flow 与能力必须匹配。");
    }
    const dispatch = { text, runtime, flowId, actor: from };
    const address = graphEventAddress(view);
    let event: DurableCapabilityEvent;
    if (request.taskKind === "stage-request") {
      if (independent || from !== chief || target !== convener || request.workflowPath !== "A"
        || request.workflowAction !== "advance" || request.moduleId || request.modulePaths?.length) {
        return deny("仅幕僚可以向运营请求当前能力的阶段。");
      }
      event = { ...address, key: `stage-request:${stepId}:${attempt}`, flowId, source: { roleId: from, originId },
        input: { kind: "stage-request", stage: profile.stage, workflowPath: "A", requestDigest: durableHash(text), dispatch } };
    } else {
      const parentTaskId = independent ? originId : operatorTask;
      const expectedSource = independent ? chief : convener;
      if (!profile.target || from !== expectedSource || request.workflowAction !== undefined
        || request.workflowPath !== undefined && (!parent || request.workflowPath !== "A") || !independent && !parent) {
        return deny("派发需要当前能力的实际创建者与已受派任务。");
      }
      let modulePaths: readonly string[] | undefined;
      if (independent || profile.target === "module-owner") {
        const roster = await loadLatestWorkflowRoster({ projectRoot, flowId, evidenceCollectorRoleId: view.evidenceCollectorRoleId });
        if (!roster.ok) return deny(roster.reason);
        if (independent) {
          if (target !== reviewRoleIdOfRoster(roster.roster) || request.moduleId || request.modulePaths?.length) return deny("需要名单指定的独立验收角色。");
        } else {
          if (!request.moduleId || !roster.roster.roles.some(role => role.id === target && role.modules.includes(request.moduleId!))) {
            return deny("仅可向名单中的实际模块属主派发。");
          }
          const wanted = [...new Set((request.modulePaths ?? []).map(file => file.trim().replace(/\\/g, "/")))];
          const writeSet = deriveFixedModuleWriteSet(roster.roster, request.moduleId, wanted);
          if (!writeSet.ok) return deny(writeSet.message);
          modulePaths = wanted.length ? wanted : writeSet.paths;
        }
      } else if (profile.target !== target || request.moduleId || request.modulePaths?.length) {
        return deny("目标角色不符合当前能力。");
      }
      const taskId = durableTaskId(ref, target, stepId + (request.moduleId ? `:${request.moduleId}` : ""), attempt);
      const task: DurableTaskBinding = { stage: profile.stage, stageAttempt: attempt, executionAttempt: 1, parentTaskId, taskId, roleId: target };
      event = { ...address, key: `task-bound:${taskId}`, flowId, source: { roleId: from, originId, parentTaskId },
        input: { kind: "task-bound", task, dispatch, modulePaths } };
    }
    if (!current()) return deny("核验期间真实发起回合已变化。");
    const saved = await store.submitCapability(ref, event, current);
    return saved.ok ? { ok: true, message: `已保存本次请求（${saved.value.key}）。` }
      : { ok: false, message: `${saved.code}: ${saved.message}` };
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
