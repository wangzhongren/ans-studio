// Durable graph synchronization within the fixed-workflow routing component.

import type { ChiefDecisionExecutor } from "../../customer-input.ts";
import { renderWorkReportPrompt, type TaskHandback } from "../../../../src/common/编排/handback.ts";
import type { WorkflowStage } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { DurableDispatchDetails, DurableEvidenceRef, DurableProjection, DurableTaskBinding } from "../../../../src/model/durable-workflow.ts";
import { durableHash, durableTaskId, isDirectProductCapability, recordWorkflowNotice, workspacePreparationSummary } from "../../durable-workflow.ts";
import { closeDesktopGraphCard, closeWorkflowTask, evidenceOperatorInstructions, graphCardProfile, graphImplementationTip, graphTaskProfile, nextOperationsDelivery, operationsTasks, preflightDesktopImplementationOwner, resumeDesktopGraphCard, resumeGraphBaseline, syncGraphArchive, workflowReviewProof, workflowRoleDuty } from "../../durable-workflow-a.ts";
import { closeDocumentRevisionCard, presentDocumentRevisionCard } from "../../durable-document-revision.ts";
import { closeBlockedScopeCard, desktopVerificationPreflight, holdDesktopUnavailableAssessment, presentB2EvidenceScopeCard, presentBlockedScopeCard, reconcileDesktopA11Disposition, verificationAssessmentPrompt, verificationStandardPrompt } from "../../durable-blocked-routing.ts";
import { acceptanceEnvironmentTask, confirmAcceptanceEnvironmentAssessment, recoveryWakeKey } from "../../durable-acceptance-environment.ts";
import { closeDesktopAcceptanceWorkspace, verifyDesktopAcceptanceWorkspaceEvidence } from "../../durable-acceptance-workspace.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { LiveSession } from "../contracts/session-types.ts";
import type { Evidence } from "../evidence.ts";
import { sessionKey } from "../shared/keys.ts";
import { shortenText } from "../shared/text.ts";

export type DurableTaskMaterialization = {
  taskId: string; sourceRoleId: string; roleId: string; stage: WorkflowStage; details: DurableDispatchDetails;
  stageRequest?: true; binding?: DurableTaskBinding; modulePaths?: readonly string[]; parentTaskId?: string;
  creator?: "chief" | "convener"; sideEffect?: "read-only" | "docs" | "code"; operationKey?: string;
};

interface StageDispatchRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  evidence: Evidence;
}

interface StageDispatchDecisionPort {
  durableDecisionExecutor(projectRoot: string, runtime: unknown): ChiefDecisionExecutor | undefined;
}

interface StageDispatchRoute {
  durableRuntime(projection: DurableProjection, preferred?: string): RuntimeKind;
  emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void;
  queueDurablePrompt(
    projection: DurableProjection, roleId: string, sourceRoleId: string, text: string, runtime: RuntimeKind,
    key: string, taskId?: string, task?: DurableTaskBinding, assignmentTaskId?: string, unassigned?: boolean,
  ): Promise<void>;
  materializeDurableTask(projection: DurableProjection, input: DurableTaskMaterialization): Promise<void>;
}

export class FixedWorkflowStageDispatch {
  private readonly refs: StageDispatchRefs;
  private readonly port: StageDispatchDecisionPort;
  private readonly deps: SessionManagerDeps;
  private readonly durableRuntime: StageDispatchRoute["durableRuntime"];
  private readonly emitDeliveryNote: StageDispatchRoute["emitDeliveryNote"];
  private readonly queueDurablePrompt: StageDispatchRoute["queueDurablePrompt"];
  private readonly materializeDurableTask: StageDispatchRoute["materializeDurableTask"];
  private readonly reconcilingA11Dispositions = new Set<string>();

  readonly sync = {
    syncGraphTasks: this.syncGraphTasks.bind(this),
    noteWorkflowException: this.noteWorkflowException.bind(this),
    syncA11Disposition: this.syncA11Disposition.bind(this),
    syncBlockedScope: this.syncBlockedScope.bind(this),
    syncDocumentRevision: this.syncDocumentRevision.bind(this),
  };

  constructor(refs: StageDispatchRefs, port: StageDispatchDecisionPort, deps: SessionManagerDeps, route: StageDispatchRoute) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
    this.durableRuntime = route.durableRuntime;
    this.emitDeliveryNote = route.emitDeliveryNote;
    this.queueDurablePrompt = route.queueDurablePrompt;
    this.materializeDurableTask = route.materializeDurableTask;
  }

  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }

  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
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
}
