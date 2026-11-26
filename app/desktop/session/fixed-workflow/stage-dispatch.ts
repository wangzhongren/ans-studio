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
import { mainT } from "../../i18n.ts";
import roleText from "../../durable-workflow-role-text.json" with { type: "json" };

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
      ? `${roleText.dispatch.a1IntakeSummary[0]}${shortenText(intakeEvidence.handback.summary, 1500)}${roleText.dispatch.a1IntakeSummary[1]}` : "";
    if (isDirectProductCapability(view.action) || direct) {
      if (direct?.state === "pending" && direct.dispatch.actor === "application"
        && direct.dispatch.flowId === view.flowId && direct.roleId === "product"
        && direct.task.roleId === direct.roleId && direct.taskId === direct.task.taskId
        && direct.task.stage === stage && direct.task.parentTaskId === view.ref.instanceId
        && direct.task.stageAttempt === view.attempt) {
        const duty = stage === "A1" ? roleText.dispatch.a1ReadOnlyDuty : `${roleText.dispatch.a2IntentDraftDuty[0]}${direct.flowId}${roleText.dispatch.a2IntentDraftDuty[1]}`;
        await this.materializeDurableTask(view, {
          taskId: direct.taskId, sourceRoleId: "application", creator: view.workflowOwnedDispatch ? "convener" : "chief", roleId: direct.roleId,
          stage, binding: direct.task, sideEffect: stage === "A1" ? "read-only" : "docs",
          details: { ...direct.dispatch,
            text: `${direct.dispatch.text}${roleText.dispatch.directProductBinding[1]}${view.ref.instanceId}${roleText.dispatch.directProductBinding[2]}${direct.flowId}${roleText.dispatch.directProductBinding[3]}${duty}${intakeSummary}` },
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
          const summary = mainT("main.durableWorkflow.dispatch.a3ApprovalBlocked", { instanceId: view.ref.instanceId, reason: checked.message });
          const notice = await recordWorkflowNotice(view.projectRoot, chief, {
            ref: `intent-gate:${view.ref.instanceId}:${view.attempt}:${durableHash(checked.message).slice(0, 16)}`, summary,
          });
          if (notice === "recorded") this.emitDeliveryNote(view.projectRoot, runtime, chief, chief, summary);
          return;
        }
        if (checked.value) {
          const { path: productDraft, intentId } = checked.value;
          draft = `${roleText.dispatch.verifiedDraftInstruction[0]}${productDraft}${roleText.dispatch.verifiedDraftInstruction[1]}${intentId}${roleText.dispatch.verifiedDraftInstruction[2]}${intentId}${roleText.dispatch.verifiedDraftInstruction[3]}${view.flowId}${roleText.dispatch.verifiedDraftInstruction[4]}`;
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
          await this.noteWorkflowException(view, chief, "workflow-card-not-submitted", mainT("main.durableWorkflow.dispatch.missingConfirmationCard", { stage: card.stage }));
          return;
        }
        await this.queueDurablePrompt(view, chief, "application",
          `${roleText.dispatch.submitOriginalCardInstruction[0]}${view.ref.instanceId}${roleText.dispatch.submitOriginalCardInstruction[1]}${view.flowId ?? ""}${roleText.dispatch.submitOriginalCardInstruction[2]}${card.kind}${roleText.dispatch.submitOriginalCardInstruction[3]}${card.stage}${roleText.dispatch.submitOriginalCardInstruction[4]}${draft}`,
          runtime, `chief-intake:${view.stepId}:${view.attempt}`);
      }
    }
    if (view.action === "observe-existing" && !view.workflowOwnedDispatch && !currentRequest) {
      await this.queueDurablePrompt(view, chief, "application",
        `${roleText.dispatch.pathBIntakeInstruction[0]}${view.metadata.summary ?? ""}${roleText.dispatch.pathBIntakeInstruction[1]}${convener}${roleText.dispatch.pathBIntakeInstruction[2]}${view.ref.instanceId}${roleText.dispatch.pathBIntakeInstruction[3]}`,
        runtime, `chief-intake:${view.stepId}:${view.attempt}`);
    }
    if (view.action === "verify-stop" && !view.workflowOwnedDispatch) {
      await this.queueDurablePrompt(view, convener, "application",
        `${roleText.dispatch.verifyStoppedInstruction[0]}${view.ref.instanceId}${roleText.dispatch.verifyStoppedInstruction[1]}`,
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
        : `${roleText.dispatch.legacyPathAAdvanceInstruction[0]}${convener}${roleText.dispatch.legacyPathAAdvanceInstruction[1]}${profile.stage}${roleText.dispatch.legacyPathAAdvanceInstruction[2]}`;
      await this.queueDurablePrompt(view, chief, "application",
        `${roleText.dispatch.legacyIntakeInstruction[0]}${view.metadata.summary ?? ""}${intakeSummary}${roleText.dispatch.legacyIntakeInstruction[2]}${view.ref.instanceId}${view.flowId ? `，flowId ${view.flowId}` : ""}${roleText.dispatch.legacyIntakeInstruction[4]}${instruction}`,
        runtime, `chief-intake:${view.stepId}:${view.attempt}`);
    }
    if (profile && currentRequest?.input.kind === "stage-request" && !independent) {
      const taskId = durableTaskId(view.ref, convener, view.stepId, view.attempt);
      await this.materializeDurableTask(view, {
        taskId, sourceRoleId: chief, roleId: convener, stage: profile.stage, stageRequest: true,
        details: { ...currentRequest.input.dispatch, text: `${currentRequest.input.dispatch.text}\n${profile.prompt}` +
          (intakeSummary ? `${roleText.dispatch.legacyOperatorWorkflowBinding[0]}${view.ref.instanceId}${roleText.dispatch.legacyOperatorWorkflowBinding[1]}${view.flowId}${roleText.dispatch.legacyOperatorWorkflowBinding[2]}${intakeSummary}` : "") },
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
            ...pending.dispatch, text: `${pending.dispatch.text}${roleText.dispatch.legacyAuthorIntentBinding[1]}${view.ref.instanceId}${roleText.dispatch.legacyAuthorIntentBinding[2]}${pending.flowId}${roleText.dispatch.legacyAuthorIntentBinding[3]}${pending.flowId}${roleText.dispatch.legacyAuthorIntentBinding[4]}${intakeSummary}`,
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
          `${renderWorkReportPrompt(report.handback)}${roleText.dispatch.legacyOperationsHandbackInstruction[1]}`,
          runtime, `graph-report:${pending.taskId}:${pending.report.key}`, undefined, reviewerTask,
          creator === convener ? pending.task.parentTaskId : undefined);
      }
    }
  }

  private async noteWorkflowException(view: DurableProjection, chief: string, code: string, reason: string, taskId?: string): Promise<void> {
    const summary = mainT("main.durableWorkflow.dispatch.workflowNeedsChief", { instanceId: view.ref.instanceId, step: view.stepName, reason: shortenText(reason, 500) });
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
      else await this.noteWorkflowException(view, chief, "workflow-b2-evidence-decision-unavailable", mainT("main.durableWorkflow.dispatch.b2ScopeAwaitingMainWindow"));
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
      else await this.noteWorkflowException(view, chief, "workflow-blocked-scope-card-unavailable", mainT("main.durableWorkflow.dispatch.scopeCardUnavailable"), scope.origin.task.taskId);
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
        await this.noteWorkflowException(view, chief, "workflow-scope-revision-request-missing", mainT("main.durableWorkflow.dispatch.documentRevisionRequestMissing"), parent.taskId);
      } else if (!sent || sent.state === "not-started") {
        await this.queueDurablePrompt(view, parent.roleId, "application",
          `${roleText.dispatch.documentRevisionOperatorInstruction[0]}${scope.document.path}${roleText.dispatch.documentRevisionOperatorInstruction[1]}${scope.document.sha256}${roleText.dispatch.documentRevisionOperatorInstruction[2]}${parent.taskId}${roleText.dispatch.documentRevisionOperatorInstruction[3]}${scope.evidenceCompromise
            ? `${roleText.dispatch.evidenceCompromiseReissueInstruction[0]}${scope.evidenceCompromise.requirementIds.join("、")}${roleText.dispatch.evidenceCompromiseReissueInstruction[1]}${scope.evidenceCompromise.paths.join("、")}${roleText.dispatch.evidenceCompromiseReissueInstruction[2]}` : ""}`,
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
          details: { flowId: view.flowId, actor: "application", text: `${roleText.dispatch.pauseOperationsTaskForRevision[0]}${parent.taskId}${roleText.dispatch.pauseOperationsTaskForRevision[1]}${revision.path}${roleText.dispatch.pauseOperationsTaskForRevision[2]}` +
            `${roleText.dispatch.reviseOriginalGovernanceFileInstruction[0]}${revision.reason}${roleText.dispatch.reviseOriginalGovernanceFileInstruction[1]}` +
            roleText.dispatch.isolatedRevisionCandidateInstruction },
        });
        break;
      }
      case "awaiting-approval": {
        const registration = this.deps.getRegisteredProjectLifecycle?.(view.projectRoot);
        if (this.deps.customerInput) await presentDocumentRevisionCard({ durable, view, revision, chief,
          customer: this.deps.customerInput, executeDecision: this.port.durableDecisionExecutor(view.projectRoot, view.metadata.runtime),
          isRegistered: () => !!registration && this.deps.getRegisteredProjectLifecycle?.(view.projectRoot)?.selectionId === registration.selectionId });
        else await this.noteWorkflowException(view, chief, `revision-card-unavailable:${revision.id}`, mainT("main.durableWorkflow.dispatch.documentRevisionCardUnavailable"), revision.task.taskId);
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
          revision.blockedReason ?? mainT("main.durableWorkflow.dispatch.documentRevisionResumeFailed", { path: revision.path }), revision.task.taskId);
        break;
      case "resumed": {
        const key = `a11-revision-resume:${revision.id}`;
        const sent = store.listEffects(view.ref, "model-send").find(effect => effect.intent.key === `model:${key}`);
        if (sent?.state === "succeeded") return false;
        await this.queueDurablePrompt(view, convener, "application",
          `${roleText.dispatch.documentRevisionOperationsResumed[0]}${revision.path}${roleText.dispatch.documentRevisionOperationsResumed[1]}${parent.taskId}${roleText.dispatch.documentRevisionOperationsResumed[2]}` +
          `${roleText.dispatch.verifyNewGovernanceEvidenceInstruction[0]}${view.evidenceAudit?.state === "collecting" ? evidenceOperatorInstructions(view) : ""}`, runtime, key, undefined, parent.task, parent.taskId);
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
        await this.noteWorkflowException(view, chief, "workflow-implementation-order-missing", mainT("main.durableWorkflow.dispatch.a11WorkOrderMissing"), incomplete.taskId);
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
        await this.noteWorkflowException(view, chief, "workflow-assessment-candidate-missing", mainT("main.durableWorkflow.dispatch.independentReviewCandidateMissing"), pending.taskId);
        return;
      }
      const candidate = stage === "A12b" ? `${roleText.dispatch.independentReviewReportSchema[0]}${candidateOid}${roleText.dispatch.independentReviewReportSchema[1]}` : "";
      const verified = pending.verificationCapabilities ?? view.verificationCapabilities;
      if (stage === "A12a" && view.blockedRoutingEnabled && !verified) {
        await this.noteWorkflowException(view, chief, "workflow-verification-capabilities-missing", mainT("main.durableWorkflow.dispatch.independentReviewCapabilitiesMissing"), pending.taskId);
        return;
      }
      const capability = stage === "A12a" && view.blockedRoutingEnabled ? verificationStandardPrompt(verified, view.implementationItems)
        : stage === "A12b" && view.blockedRoutingEnabled ? verificationAssessmentPrompt(view.verificationPlan) : "";
      await this.materializeDurableTask(view, {
        taskId: pending.taskId, sourceRoleId: "application", roleId: pending.roleId, stage,
        binding: pending.task, modulePaths: pending.modulePaths,
        sideEffect: stage === "A11" ? "code" : stage === "A4" || stage === "A7" ? "read-only" : "docs",
        details: { ...pending.dispatch, text: `${pending.dispatch.text}\n${workflowRoleDuty(stage, pending.flowId, proposalRequestId, view.evidenceCollectorRoleId)}${candidate}${capability}${pending.reviewWritePath ? `${roleText.dispatch.preflightEvidenceWritePath[0]}${pending.reviewWritePath}` : ""}` },
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
        await this.noteWorkflowException(view, chief, "workflow-implementation-evidence-missing", evidence.ok ? mainT("main.durableWorkflow.dispatch.implementationCommitMissing") : evidence.message, pending.taskId);
        outcome = "rejected";
      } else {
        tipOid = evidence.evidence.branchTipOid;
        const review = store.listCapabilityEvents(view.ref).find(row => row.receipt.state !== "ignored" && row.event.stepId === view.stepId &&
          row.event.attempt === view.attempt && row.event.input.kind === "operator-report" && row.event.input.parentTaskId === pending.task.parentTaskId)?.event.input;
        if (review?.kind !== "operator-report") {
          const task: DurableTaskBinding = { ...pending.task, roleId: convener, taskId: pending.task.parentTaskId, parentTaskId: pending.taskId };
          const text = `${renderWorkReportPrompt(report)}${roleText.dispatch.operationsReviewCommitInstruction[1]}${tipOid}${roleText.dispatch.operationsReviewCommitInstruction[2]}`;
          await this.materializeDurableTask(view, { taskId: task.taskId, sourceRoleId: "application", roleId: convener, stage,
            details: { ...pending.dispatch, text }, binding: task, sideEffect: "read-only", operationKey: `graph-report:${pending.taskId}:${pending.report.key}` });
          return;
        }
        const reviewReport = store.getEvidence(view.ref, review.evidence) as { handback?: TaskHandback } | undefined;
        if (reviewReport?.handback?.status !== "completed") {
          await this.noteWorkflowException(view, chief, "workflow-implementation-review-blocked", reviewReport?.handback?.summary ?? mainT("main.durableWorkflow.dispatch.operationsReviewFailed"), pending.taskId);
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
          outcome: { kind: "blocked", reason: mainT("main.durableWorkflow.dispatch.packageOwnerUnverified") } }, () =>
          store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId);
        durable.activate();
        return;
      }
      const sent = store.listEffects(view.ref, "model-send").find(row => row.intent.key === `model:${parent.taskId}`);
      const session = this.sessions.get(this.sessionKey(view.projectRoot, parent.roleId, runtime));
      if (sent?.state === "succeeded" && !session?.busy && !session?.origins.running) {
        const result = await store.settleAcceptanceEnvironment(view.ref, { parentTask: parent,
          outcome: { kind: "blocked", reason: mainT("main.durableWorkflow.dispatch.packageOwnerDispatchMissing") } }, () =>
          store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId
          && !store.lookup(view.ref)?.acceptanceEnvironment?.childTask);
        if (result.ok) durable.activate();
        return;
      }
      const text = `${operator.dispatch.text}${roleText.dispatch.restoreAcceptanceDispatchInstruction[1]}${recovery.eligibleRoleIds.join("、")}${roleText.dispatch.restoreAcceptanceDispatchInstruction[2]}`;
      return this.materializeDurableTask(view, { taskId: parent.taskId, sourceRoleId: "application", roleId: parent.roleId,
        stage: "A12b", binding: parent, details: { ...operator.dispatch, text }, sideEffect: "read-only" });
    }
    if (child.state === "pending") {
      const text = `${child.dispatch.text}${roleText.dispatch.restoreAcceptanceOwnerInstruction[1]}`;
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
        outcome: { kind: "blocked", reason: mainT("main.durableWorkflow.dispatch.restoreAcceptanceCloseMissing") } }, () =>
        store.lookup(view.ref)?.acceptanceEnvironment?.parentTask?.taskId === parent.taskId &&
        !this.sessions.get(this.sessionKey(view.projectRoot, parent.roleId, runtime))?.busy);
      if (result.ok) durable.activate();
      return;
    }
    await this.queueDurablePrompt(view, parent.roleId, child.roleId,
      `${renderWorkReportPrompt(snapshot.handback)}${roleText.dispatch.restoreAcceptanceOperationsReviewInstruction[1]}${child.taskId}${roleText.dispatch.restoreAcceptanceOperationsReviewInstruction[2]}`,
      runtime, key, undefined, parent, parent.taskId);
  }
}
