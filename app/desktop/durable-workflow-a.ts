import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { createTranslator } from "../../src/common/shared/i18n/index.ts";
import { renderWorkReportPrompt } from "../../src/common/编排/handback.ts";
import { parseIntentDecisionRequirements, parseProposalDecisionFields, proposalDecisionChoiceId, proposalDecisionChoices } from "../../src/common/编排/workflow-preconditions.ts";
import { preflightDurableEnvironmentOwner, preflightDurableImplementationOwner, preflightDurableReviewWrite } from "../../src/pipeline/orchestration/run-role.ts";
import { implementationWorkOrderText, implementationTestRulesText } from "../../src/pipeline/orchestration/durable-workflow.ts";
import {
  activateRoleDocumentsFixed, appendTaskEvent, archiveAcceptance, completeTeamPlanFixed,
  loadLatestRoster, parseTeamPlan, prepareIntent, readBasisLedger, readTaskState, taskBranchName, taskEvent,
  type CompleteTeamPlanFixedInput, type CompleteTeamPlanFixedResult, type FixedActivateRoleDocumentsDep, type TaskHandback,
} from "./workflow.ts";
import type { DurableCapability, DurableCapabilityEvent, DurableDomainOperation, DurableEffectRecord, DurableEvidenceRef, DurableGraphCard, DurablePendingTask, DurableProjection, DurableResult, DurableReviewPreflight, DurableTaskBinding } from "../../src/model/durable-workflow.ts";
import type { DurableProposalDecisionValue } from "../../src/model/durable-workflow.ts";
import type { CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, DispatchReceipt, DispatchTaskPayload, GovernedPackageLockGenerator, TaskClosedOutcome, WorkflowDocumentRef, WorkflowStage } from "../../src/model/runtime.ts";
import { durableDecisionProvenance, type ChiefDecisionExecutor, type ChiefDecisionHost, type DesktopCustomerInputFn, type PersistDurableCustomerAnswer } from "./customer-input.ts";
import { durableHash, type DesktopDurableWorkflow } from "./durable-workflow.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { latestVersionedDoc } from "./session/shared/text.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import type { ActualDispatchSource, LiveSession } from "./session/contracts/session-types.ts";
import { buildEffectiveProjectConfig } from "./project.ts";
import { refreshListingNow } from "./session/shared/roles.ts";
import { acquireProjectGitCriticalSection, createDurableGraphBaselineGitPort, durableBaselineOrigin, observeA11Git, previewDurableMerge,
  verifyDurableGraphBaseline, type DurableBaselineOrigin } from "./workflow-git.ts";
import { mainLocale, mainT, type MainTranslate } from "./i18n.ts";
import roleText from "./durable-workflow-role-text.json" with { type: "json" };

export interface DesktopGraphTaskProfile {
  stage: WorkflowStage;
  target?: "product" | "rapporteur" | "nominator" | "module-owner" | "independent-reviewer";
  prompt: string;
}

const graphTasks: Partial<Record<DurableCapability, DesktopGraphTaskProfile>> = {
  "product-prepare": { stage: "A1", target: "product", prompt: "Assign product to prepare the intent." },
  "author-intent": { stage: "A2", target: "product", prompt: "Assign product to author the intent and verify its actual document before closing." },
  "planning-prepare": { stage: "A4", target: "rapporteur", prompt: "Assign planning to prepare the proposal." },
  "author-proposal": { stage: "A5", target: "rapporteur", prompt: "Assign planning to produce the proposal, modules, roster and architecture. Verify the real documents before closing." },
  "personnel-prepare": { stage: "A7", target: "nominator", prompt: "Assign personnel to prepare the roles listed in the approved roster." },
  "activate-roles": { stage: "A8", target: "nominator", prompt: "Assign personnel to activate and verify each approved roster role using the existing role-document tool." },
  "team-baseline": { stage: "A9", prompt: "Use complete_team_plan to submit the actual team plan and verify the application Git baseline and task branch." },
  "independent-standard": { stage: "A12a", target: "independent-reviewer", prompt: "Dispatch the acceptance standard directly to the independent reviewer named by the roster." },
  "governed-implementation": { stage: "A11", target: "module-owner", prompt: "Dispatch implementation using the current appointment, baseline and module scope. Verify the actual commit before closing." },
  "independent-assessment": { stage: "A12b", target: "independent-reviewer", prompt: "Dispatch assessment of the current candidate directly to the independent reviewer named by the roster." },
};

export function graphTaskProfile(view: DurableProjection): DesktopGraphTaskProfile | undefined {
  return view.schema === 2 && view.action ? graphTasks[view.action as DurableCapability] : undefined;
}

export function workflowRoleDuty(stage: WorkflowStage, flowId: string, proposalRequestId?: string, evidenceCollectorRoleId?: string): string {
  const proposal = `docs/proposals/${flowId}`;
  const quality = `docs/quality/${flowId}`;
  const collector = evidenceCollectorRoleId ? `${roleText.pathA.approvedEvidenceCollectorInstruction[0]}${evidenceCollectorRoleId}${roleText.pathA.approvedEvidenceCollectorInstruction[1]}${flowId}${roleText.pathA.approvedEvidenceCollectorInstruction[2]}` : "";
  switch (stage) {
    case "A1": return roleText.pathA.prepareProduct;
    case "A2": return `${roleText.pathA.authorProductIntent[0]}${flowId}${roleText.pathA.authorProductIntent[1]}`;
    case "A4": return roleText.pathA.preparePlan;
    case "A5": return `${roleText.pathA.authorProposal[0]}${proposal}${roleText.pathA.authorProposal[1]}${proposal}${roleText.pathA.authorProposal[2]}${proposal}${roleText.pathA.authorProposal[3]}${flowId}${roleText.pathA.authorProposal[4]}${collector}`;
    case "A7": return `${roleText.pathA.preparePersonnel[0]}${proposal}${roleText.pathA.preparePersonnel[1]}`;
    case "A8": return `${roleText.pathA.authorPersonnelCards[0]}${proposal}${roleText.pathA.authorPersonnelCards[1]}${proposalRequestId ? `${roleText.pathA.roleActivationProposalDecision[0]}${proposalRequestId}` : ""}${roleText.pathA.authorPersonnelCards[2]}${collector}`;
    case "A9": return `${roleText.pathA.registerTeamBaseline[0]}${flowId}${roleText.pathA.registerTeamBaseline[1]}`;
    case "A11":
    case "B3": return roleText.pathA.governedImplementation;
    case "A12a": return `${roleText.pathA.authorIndependentCriteria[0]}${quality}${roleText.pathA.authorIndependentCriteria[1]}`;
    case "A12b": return `${roleText.pathA.assessIndependentCandidate[0]}${quality}${roleText.pathA.assessIndependentCandidate[1]}${quality}${roleText.pathA.assessIndependentCandidate[2]}`;
    case "B1": return roleText.pathA.observeExistingImplementation;
    default: return roleText.pathA.defaultWorkInstruction;
  }
}

export function graphImplementationTip(store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection): string | undefined {
  const task = view.implementation?.task;
  const recorded = task && store.listEffects(view.ref, "task-commit").findLast(row =>
    row.state === "succeeded" && row.intent.task?.taskId === task.taskId && row.intent.task.stageAttempt === task.stageAttempt)?.result?.result?.oid;
  return typeof recorded === "string" ? recorded : undefined;
}

export function operationsTasks(view: DurableProjection) {
  const tasks = view.action === "operations-implementation" ? view.pendingTasks?.filter(task =>
    (task.capability === "operations-implementation" || task.evidenceWorkOrder) && task.stepId === view.stepId && task.attempt === view.attempt) ?? [] : [];
  const parent = tasks.find(task => !task.workItemId && task.roleId === "convener" && task.task.parentTaskId === view.ref.instanceId);
  return { parent, children: parent ? tasks.filter(task => (task.workItemId || task.evidenceWorkOrder) && task.task.parentTaskId === parent.taskId) : [] };
}

export async function parkDesktopA11Disposition(durable: DesktopDurableWorkflow, view: DurableProjection,
  child: DurablePendingTask, isCurrent: () => boolean, close?: DurableCapabilityEvent) {
  if (!view.blockedRoutingEnabled || !child.workOrder || child.state !== "reported" || !isCurrent()) return false;
  const store = await durable.store();
  const live = store.lookup(view.ref);
  if (live?.a11Disposition?.state === "parked" && live.a11Disposition.childTask.taskId === child.taskId) return live.a11Disposition;
  const originalCommit = store.listEffects(view.ref, "task-commit").find(effect => effect.state === "succeeded" && workflowTaskEffectMatches(effect, child));
  const candidate = originalCommit?.result?.result?.oid;
  if (typeof candidate !== "string") return false;
  const observation = await observeA11Git(view.projectRoot);
  if (!isCurrent()) return false;
  const clean = !observation.stagedPaths.length && !observation.trackedDirty && !observation.lock
    && observation.branch === view.baseline?.branch && observation.head === candidate;
  const priorRetest = live?.a11Disposition?.state === "resumed" && live.a11Disposition.retest && live.a11Disposition.childTask.taskId === child.taskId;
  const receiptCheck = (priorRetest || clean && !observation.untrackedPaths?.length) && close?.input.kind === "task-closed" && close.input.outcome === "accepted"
    ? { reportKey: close.input.reportKey, event: close } : undefined;
  if (clean && !receiptCheck) return false;
  const parked = await store.parkA11Disposition(view.ref, { childTask: child.task, observation, receiptCheck }, isCurrent);
  if (!parked.ok) return false;
  durable.activate();
  return parked.value;
}

export const a11ResumeKey = (key: string): string => `a11-resume:${key}`;

export const operationsWakeKey = (taskId: string, reportKey: string, reviewGeneration?: number): string =>
  `a11-wake:${taskId}:${reportKey}${reviewGeneration === undefined ? "" : `:review:${reviewGeneration}`}`;

export function a11RetestReviewWakeKey(view: DurableProjection | undefined): string | undefined {
  const disposition = view?.a11Disposition;
  if (view?.status !== "waiting" || view.engine !== "healthy" || !disposition?.retest || disposition.state !== "resumed") return undefined;
  const child = view.pendingTasks?.find(task => task.taskId === disposition.childTask.taskId && task.state === "reported");
  return child?.report && operationsWakeKey(child.taskId, child.report.key, disposition.retest.reportReviewGeneration);
}

export function pendingDeliveryBlocksQueue(view: DurableProjection, key: string, pending?: { queued: boolean }): boolean {
  const disposition = view.a11Disposition;
  const isRetest = disposition?.retest && (key === a11ResumeKey(disposition.key) || key === a11RetestReviewWakeKey(view));
  return !!pending && (!pending.queued || !isRetest);
}

export function isOperationsParentEffect(effect: DurableEffectRecord, parent: DurablePendingTask): boolean {
  return effect.intent.kind === "model-send" && workflowTaskEffectMatches(effect, parent)
    && (effect.intent.key === `model:${parent.taskId}` || effect.intent.key.startsWith("model:a11-wake:")
      || effect.intent.key.startsWith("model:a11-progress:") || effect.intent.key.startsWith("model:a11-revision-resume:")
      || effect.intent.key.startsWith("model:a11-scope-revise:"));
}

export async function preflightDesktopReviewer(input: DurableReviewPreflight, deps: SessionManagerDeps): Promise<DurableResult<true>> {
  if (deps.refreshListing && !await refreshListingNow(input.projectRoot, deps)) {
    return graphFailure("workflow-reviewer-listing-unavailable", mainT("main.durableWorkflow.pathA.refreshAcceptanceRoleFailed"));
  }
  const listing = deps.getListing(input.projectRoot);
  if (!listing?.roles.some(role => role.roleId === input.roleId)) {
    return graphFailure("workflow-reviewer-unavailable", mainT("main.durableWorkflow.pathA.acceptanceRoleMissing", { roleId: input.roleId }));
  }
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig: deps.buildProjectConfig, loadEffectiveConfig: deps.loadEffectiveConfig ?? loadEffectiveConfig,
  });
  return preflightDurableReviewWrite({ project, roleId: input.roleId, path: input.path });
}

export async function preflightDesktopEnvironmentOwner(projectRoot: string, roleId: string, deps: SessionManagerDeps): Promise<DurableResult<true>> {
  if (deps.refreshListing && !await refreshListingNow(projectRoot, deps)) {
    return graphFailure("workflow-environment-owner-listing-unavailable", roleText.pathA.refreshDependencyRoleFailed);
  }
  const listing = deps.getListing(projectRoot);
  if (!listing?.roles.some(role => role.roleId === roleId)) {
    return graphFailure("workflow-environment-owner-unavailable", roleText.pathA.approvedDependencyOwnerMissing);
  }
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig: deps.buildProjectConfig, loadEffectiveConfig: deps.loadEffectiveConfig ?? loadEffectiveConfig,
  });
  return preflightDurableEnvironmentOwner({ project, roleId });
}

export async function preflightDesktopImplementationOwner(projectRoot: string, roleId: string, paths: readonly string[], deps: SessionManagerDeps): Promise<DurableResult<true>> {
  if (deps.refreshListing && !await refreshListingNow(projectRoot, deps)) {
    return graphFailure("workflow-implementation-owner-listing-unavailable", roleText.pathA.refreshImplementationOwnerFailed);
  }
  const listing = deps.getListing(projectRoot);
  if (!listing || listing.roles.filter(role => role.roleId === roleId).length !== 1) {
    return graphFailure("workflow-implementation-owner-unavailable", roleText.pathA.approvedImplementationOwnerNotUnique);
  }
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig: deps.buildProjectConfig, loadEffectiveConfig: deps.loadEffectiveConfig ?? loadEffectiveConfig,
  });
  return preflightDurableImplementationOwner({ project, roleId, paths });
}

export function evidenceOperatorBinding(view: DurableProjection): DurableTaskBinding | undefined {
  if (view.action === "operations-implementation") return operationsTasks(view).parent?.task;
  const production = view.task;
  const origin = view.scope?.sourceTaskId;
  if (view.action !== "b3-implement-and-accept" || production?.stage !== "B3" || !origin) return;
  return { ...production, taskId: production.parentTaskId, parentTaskId: origin, roleId: "convener", executionAttempt: 1 };
}

export async function requestEvidenceCollectionFromTurn(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection, actorRoleId: string,
  request: DispatchTaskPayload, targetRoleId: string, source: ActualDispatchSource, isCurrent: () => boolean,
): Promise<DispatchReceipt> {
  const parent = evidenceOperatorBinding(view);
  const audit = view.evidenceAudit;
  const originId = source.origin.turnId;
  const reject = (message: string): DispatchReceipt => ({ ok: false, message: `workflow-evidence-dispatch-invalid: ${message}` });
  if (!parent || !originId || actorRoleId !== parent.roleId || source.entry.assignedTaskId !== parent.taskId
    || (source.origin.taskId ?? source.entry.assignedTaskId) !== parent.taskId || !isCurrent()) return reject(roleText.pathA.collectEvidenceNeedsOperationsParent);
  if (request.moduleId !== "acceptance-evidence" || request.taskKind || request.workflowAction || request.workflowPath || request.reviewTarget
    || request.resumeController || request.stage && request.stage !== parent.stage || request.workflowId && request.workflowId !== view.ref.instanceId
    || request.flowId && request.flowId !== view.flowId || request.reworkOf || request.modulePaths?.length
    || request.sideEffect && request.sideEffect !== "read-only") return reject(roleText.pathA.evidenceUsesApprovedScope);
  if (!audit || audit.collectorRoleId !== targetRoleId) return reject(roleText.pathA.approvedEvidenceOrderMissing);
  const requestId = request.idempotencyKey ?? durableHash(JSON.stringify([parent.taskId, audit.basis.generation, targetRoleId]));
  const saved = await store.dispatchEvidenceCollection(view.ref, { parentTask: parent, roleId: targetRoleId, originId, requestId }, isCurrent);
  if (!saved.ok) return { ok: false, message: `${saved.code}: ${saved.message}` };
  if (saved.value.state === "ignored") return reject(saved.value.reason ?? roleText.pathA.evidenceDispatchRetired);
  return { ok: true, message: roleText.pathA.evidenceDispatchRecorded };
}

export function evidenceOperatorInstructions(view: DurableProjection): string {
  const audit = view.evidenceAudit;
  const parent = evidenceOperatorBinding(view);
  if (!audit || !parent) return "";
  const missing = audit.missing.map(item => `${item.requirementId} ${item.reason}`).join("；");
  const verify = `${roleText.pathA.evidenceOperatorState[0]}${audit.basis.generation}${roleText.pathA.evidenceOperatorState[1]}${audit.basis.candidateOid}${roleText.pathA.evidenceOperatorState[2]}${audit.state}${roleText.pathA.evidenceOperatorState[3]}${missing ? `${roleText.pathA.operatorEvidenceMissing[0]}${missing}${roleText.pathA.operatorEvidenceMissing[1]}` : ""}`;
  if (audit.state === "ready") return `${verify}${roleText.pathA.evidenceCollectionClosed[1]}`;
  const current = view.pendingTasks?.find(task => task.taskId === audit.collector?.taskId);
  if (current?.state === "pending") return `${verify}${roleText.pathA.awaitFormalEvidenceHandback[1]}${current.taskId}${roleText.pathA.awaitFormalEvidenceHandback[2]}`;
  if (current?.state === "reported") return audit.missing.length
    ? `${verify}${roleText.pathA.evidenceTaskReportedMissingItems[1]}${current.taskId}${roleText.pathA.evidenceTaskReportedMissingItems[2]}`
    : `${verify}${roleText.pathA.closeReportedEvidenceTask[1]}${current.taskId}${roleText.pathA.closeReportedEvidenceTask[2]}`;
  return audit.collectorRoleId ? `${verify}${roleText.pathA.dispatchApprovedEvidenceCollector[1]}${audit.collectorRoleId}${roleText.pathA.dispatchApprovedEvidenceCollector[2]}${parent.stage}${roleText.pathA.dispatchApprovedEvidenceCollector[3]}`
    : `${verify}${roleText.pathA.noApprovedEvidenceCollector[1]}`;
}

export function evidenceRouteDelivery(view: DurableProjection) {
  const route = view.evidenceAudit?.route;
  if (!route || view.evidenceAudit?.state !== "collecting") return;
  return { task: route.parentTask, key: `evidence-route:${route.requestId}`,
    text: `${roleText.pathA.dispatchEquivalentEvidenceRoute[0]}${route.parentTask.taskId}${roleText.pathA.dispatchEquivalentEvidenceRoute[1]}${evidenceOperatorInstructions(view)}` };
}

export function evidenceCollectionPrompt(task: DurablePendingTask): string {
  const evidence = task.evidenceWorkOrder;
  if (!evidence) return "";
  return [
    task.dispatch.text,
    `${roleText.pathA.evidenceOrderCandidate[0]}${task.taskId}${roleText.pathA.evidenceOrderCandidate[1]}${evidence.basis.candidateOid}${roleText.pathA.evidenceOrderCandidate[2]}${evidence.basis.branch}${roleText.pathA.evidenceOrderCandidate[3]}${evidence.basis.generation}${roleText.pathA.evidenceOrderCandidate[4]}`,
    `${roleText.pathA.evidenceOrderCriteria[0]}${evidence.basis.standard.path}${roleText.pathA.evidenceOrderCriteria[1]}${evidence.basis.standard.sha256}${roleText.pathA.evidenceOrderCriteria[2]}${evidence.requirementIds.join("、")}${roleText.pathA.evidenceOrderCriteria[3]}`,
    ...(evidence.approvedArtifacts?.length ? [`${roleText.pathA.referenceApprovedEvidenceSource[0]}${JSON.stringify(evidence.approvedArtifacts)}${roleText.pathA.referenceApprovedEvidenceSource[1]}`] : []),
    `${roleText.pathA.evidenceOrderWriteScope[0]}${evidence.writePaths.join("、") || roleText.pathA.evidenceOrderNoWriteScope}${roleText.pathA.evidenceOrderWriteScope[1]}`,
    roleText.pathA.reportEvidenceCollection,
  ].join("\n");
}

export function b3EvidenceDelivery(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection,
): { child: DurablePendingTask; text: string; parent?: DurableTaskBinding; key?: string } | undefined {
  const parent = evidenceOperatorBinding(view);
  const child = view.pendingTasks?.find(task => task.taskId === view.evidenceAudit?.collector?.taskId && task.evidenceWorkOrder);
  if (!parent || !child || parent.stage !== "B3") return;
  if (child.state === "pending") return { child, text: evidenceCollectionPrompt(child) };
  if (!child.report || child.state !== "reported" && child.state !== "accepted" && child.state !== "rework") return;
  const fact = store.listCapabilityEvents(view.ref).findLast(row => {
    const input = row.event.input;
    if (row.receipt.state === "ignored" || input.kind !== "evidence-collection-recorded" && input.kind !== "evidence-collection-closed") return false;
    return (child.state === "reported") === (input.kind === "evidence-collection-recorded")
      && input.task.taskId === child.taskId && input.reportKey === child.report?.key;
  });
  if (!fact) return;
  const report = store.getEvidence(view.ref, child.report.evidence) as { handback?: TaskHandback } | undefined;
  const text = child.state === "reported" && report?.handback ? `${renderWorkReportPrompt(report.handback)}${roleText.pathA.reviewEvidenceTaskReport[1]}${child.taskId}${roleText.pathA.reviewEvidenceTaskReport[2]}`
    : `${roleText.pathA.reportedEvidenceTaskState[0]}${child.taskId}${roleText.pathA.reportedEvidenceTaskState[1]}${child.state}${roleText.pathA.reportedEvidenceTaskState[2]}`;
  return { child, parent, key: `evidence-b3:${child.taskId}:${fact.event.key}`, text: text + evidenceOperatorInstructions(view) };
}

export async function requestOperationsChild(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection, actorRoleId: string,
  request: DispatchTaskPayload, targetRoleId: string, text: string, source: ActualDispatchSource, isCurrent: () => boolean,
  verifyOwner?: (roleId: string, paths: readonly string[]) => Promise<DurableResult<true>>,
): Promise<DispatchReceipt> {
  const { parent } = operationsTasks(view);
  const reject = (message: string): DispatchReceipt => ({ ok: false, message: `workflow-a11-dispatch-invalid: ${message}` });
  if (view.a11Disposition?.retest && (view.a11Disposition.state === "parked"
    || operationsTasks(view).children.some(task => task.taskId === view.a11Disposition?.childTask.taskId && !task.outcome))) {
    return reject(roleText.pathA.implementationRetestUnfinished);
  }
  const turnId = source.origin.turnId;
  if (!parent || parent.state !== "pending" || actorRoleId !== parent.roleId || source.entry.assignedTaskId !== parent.taskId
    || source.origin.taskId !== parent.taskId || !turnId || !isCurrent()) return reject(roleText.pathA.dispatchNeedsCurrentOperationsTurn);
  if (request.moduleId === "acceptance-evidence" && view.evidenceAuditEnabled) {
    return requestEvidenceCollectionFromTurn(store, view, actorRoleId, request, targetRoleId, source, isCurrent);
  }
  if (request.taskKind || request.workflowAction || request.workflowPath || request.reviewTarget || request.resumeController
    || request.stage !== undefined && request.stage !== "A11" || request.workflowId !== undefined && request.workflowId !== view.ref.instanceId
    || request.flowId !== undefined && request.flowId !== parent.flowId || request.reworkOf !== undefined && request.reworkOf !== "A11"
    || request.sideEffect !== undefined && request.sideEffect !== "code") return reject(roleText.pathA.dispatchOnlyApprovedA11);
  const requestedPaths = request.modulePaths;
  const matchesPaths = (paths: readonly string[]) => !!requestedPaths?.length && new Set(requestedPaths).size === requestedPaths.length
    && JSON.stringify([...requestedPaths].sort()) === JSON.stringify([...paths].sort());
  const candidates = (view.implementationItems ?? []).filter(item => request.moduleId !== undefined ? item.id === request.moduleId
    : view.blockedRoutingEnabled && requestedPaths?.length ? matchesPaths(item.paths) : item.id === targetRoleId);
  if (candidates.length !== 1) return reject(roleText.pathA.implementationOrderNotUnique);
  const item = candidates[0]!;
  const corrected = item.roleId !== targetRoleId;
  if (corrected && (!view.blockedRoutingEnabled || requestedPaths !== undefined && !matchesPaths(item.paths))) {
    return reject(`${roleText.pathA.implementationOrderMismatch[0]}${item.id}${roleText.pathA.implementationOrderMismatch[1]}${item.roleId}${roleText.pathA.implementationOrderMismatch[2]}${item.paths.join("、")}${roleText.pathA.implementationOrderMismatch[3]}`);
  }
  const requestId = request.idempotencyKey ?? durableHash(JSON.stringify([item.id, text, request.reworkOf ?? null]));
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(requestId)) return reject(roleText.pathA.invalidDispatchKey);
  const key = `a11-dispatch:${parent.taskId}:${requestId}`;
  const input = { kind: "implementation-dispatch" as const, roleId: item.roleId, workItemId: item.id,
    ...(corrected ? { requestedRoleId: targetRoleId } : {}),
    requestId, text, rework: request.reworkOf === "A11", ...(request.modulePaths ? { modulePaths: request.modulePaths } : {}) };
  const previous = store.listCapabilityEvents(view.ref).find(row => row.event.key === key);
  if (previous && JSON.stringify(previous.event.input) !== JSON.stringify(input)) return reject(roleText.pathA.dispatchKeyPayloadConflict);
  if (previous && !isCurrent()) return reject(roleText.pathA.operationsTurnChanged);
  if (!previous && view.blockedRoutingEnabled) {
    if (!verifyOwner) return reject(roleText.pathA.approvedWriteScopeUnverified);
    const owner = await verifyOwner(item.roleId, item.paths);
    if (!owner.ok) return { ok: false, message: `${owner.code}: ${owner.message}` };
    if (!isCurrent()) return reject(roleText.pathA.operationsTurnChangedDuringPreflight);
  }
  const saved = previous ? { ok: true as const, value: previous.receipt } : await store.submitCapability(view.ref,
    { ...graphEventAddress(view), flowId: parent.flowId, key,
      source: { roleId: actorRoleId, originId: turnId, parentTaskId: parent.taskId }, input }, isCurrent);
  if (!saved.ok) return { ok: false, message: `${saved.code}: ${saved.message}` };
  if (saved.value.state === "ignored") return reject(saved.value.reason ?? roleText.pathA.actualDispatchRetired);
  const child = store.lookup(view.ref)?.pendingTasks?.find(task => task.bindingKey === key && task.roleId === item.roleId);
  const assigned = corrected ? `${roleText.pathA.assignedImplementationToOwner[0]}${item.id}${roleText.pathA.assignedImplementationToOwner[1]}${item.roleId}` : `${roleText.pathA.assignedImplementationItem[0]}${item.id}`;
  return { ok: true, message: child ? `${assigned}${roleText.pathA.assignmentChildReceipt[1]}${child.taskId}${roleText.pathA.assignmentChildReceipt[2]}`
    : `${assigned}${roleText.pathA.assignmentKeyReceipt[1]}${saved.value.key}${roleText.pathA.assignmentKeyReceipt[2]}` };
}

function implementationWorkOrderPrompt(task: DurablePendingTask): string | undefined {
  const order = task.workOrder;
  if (!order || order.task.taskId !== task.taskId || order.task.roleId !== task.roleId || order.workItemId !== task.workItemId
    || order.task.stage !== "A11" || order.task.stageAttempt !== task.attempt || order.task.executionAttempt !== task.task.executionAttempt
    || order.task.parentTaskId !== task.task.parentTaskId || JSON.stringify([...order.paths].sort()) !== JSON.stringify([...(task.modulePaths ?? [])].sort())) return;
  const deferred = order.deferredChecks.map(item => item.id).join("、");
  return [`${roleText.pathA.activeImplementationOrder[0]}${order.workItemId}${roleText.pathA.activeImplementationOrder[1]}${order.digest}${roleText.pathA.activeImplementationOrder[2]}`, implementationWorkOrderText(order),
    deferred ? `${roleText.pathA.coordinateEvidenceCollection[0]}${deferred}${roleText.pathA.coordinateEvidenceCollection[1]}` : ""].filter(Boolean).join("\n");
}

function implementationRepairPrompt(view: DurableProjection, task: DurablePendingTask): string {
  const repair = view.implementationRepair;
  const order = task.workOrder;
  if (view.status !== "waiting" || view.engine !== "healthy" || !view.workflowOwnedDispatch || !view.blockedRoutingEnabled || !repair || !order
    || task.roleId !== repair.ownerTask.roleId || task.workItemId !== repair.workItemId
    || task.baseOid !== repair.sourceCandidateOid || task.task.stageAttempt !== view.attempt
    || task.task.executionAttempt !== 1 || repair.ownerTask.stage !== "A11"
    || repair.ownerTask.stageAttempt >= view.attempt || !repair.paths.length
    || JSON.stringify([...order.paths].sort()) !== JSON.stringify([...repair.paths].sort())) return "";
  const original = view.pendingTasks?.find(item => item.taskId === repair.ownerTask.taskId && item.roleId === repair.ownerTask.roleId
    && item.workItemId === repair.workItemId && item.stepId === task.stepId && item.attempt === repair.ownerTask.stageAttempt
    && item.task.parentTaskId === repair.ownerTask.parentTaskId && item.task.executionAttempt === repair.ownerTask.executionAttempt
    && item.state === "accepted" && item.workOrder?.digest === repair.workOrderDigest);
  if (!original) return "";
  return [
    "",
    `${roleText.pathA.acceptanceReworkCandidate[0]}${repair.sourceCandidateOid}${roleText.pathA.acceptanceReworkCandidate[1]}${repair.paths.join("、")}${roleText.pathA.acceptanceReworkCandidate[2]}`,
    repair.reason,
    roleText.pathA.repairImplementationWithinScope,
  ].join("\n");
}

export function nextOperationsDelivery(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection, parentBusy: boolean,
): { task: DurablePendingTask; text: string; wake?: { key: string; sourceRoleId: string } } | undefined {
  const { parent, children } = operationsTasks(view);
  if (!parent || parent.state !== "pending") return undefined;
  const active = children.find(child => child.state === "pending");
  if (active) {
    if (active.evidenceWorkOrder) return { task: active, text: evidenceCollectionPrompt(active) };
    const work = view.blockedRoutingEnabled ? implementationWorkOrderPrompt(active) : active.dispatch.text;
    if (work === undefined) return undefined;
    const resumed = view.a11Disposition;
    if (resumed?.state === "resumed" && resumed.childTask.taskId === active.taskId && active.workOrder?.digest === resumed.workOrderDigest) {
      const original = resumed.retest ? store.getEvidence(view.ref, resumed.childReport.evidence) as { handback?: TaskHandback } | undefined : undefined;
      const receipts = store.listCapabilityEvents(view.ref).flatMap(row => {
        const input = row.event.input;
        if (row.receipt.state === "ignored" || input.kind !== "implementation-self-test" || input.receipt.task.taskId !== active.taskId
          || input.receipt.candidateOid !== resumed.candidateOid || input.receipt.workOrderDigest !== resumed.workOrderDigest
          || resumed.retest && input.receipt.turnId !== original?.handback?.turnId) return [];
        return [`${input.receipt.executionDigest}${roleText.pathA.passingRetestReceipt[1]}${input.receipt.toolCallId}${roleText.pathA.passingRetestReceipt[2]}${JSON.stringify(input.receipt.argv)}${roleText.pathA.passingRetestReceipt[3]}`];
      });
      if (resumed.retest) return { task: active, wake: { key: a11ResumeKey(resumed.key), sourceRoleId: "application" }, text: [
        `${roleText.pathA.resumeSameCandidateRetest[0]}${active.roleId}${roleText.pathA.resumeSameCandidateRetest[1]}${active.workItemId}${roleText.pathA.resumeSameCandidateRetest[2]}${active.taskId}${roleText.pathA.resumeSameCandidateRetest[3]}${resumed.candidateOid}${roleText.pathA.resumeSameCandidateRetest[4]}`,
        `${roleText.pathA.retestOrderAndCriteria[0]}${resumed.workOrderDigest}${roleText.pathA.retestOrderAndCriteria[1]}${resumed.standard.path}${roleText.pathA.retestOrderAndCriteria[2]}${resumed.standard.sha256}${roleText.pathA.retestOrderAndCriteria[3]}`,
        receipts.length ? `${roleText.pathA.previousSameCandidateRetestReceipts[0]}${receipts.join("\n")}` : roleText.pathA.noPreviousSameCandidateRetestReceipts,
        `${roleText.pathA.missingRetestRequirements[0]}${implementationTestRulesText(resumed.retest.missingRequirements)}`,
        roleText.pathA.executeRetestsReadOnly,
        roleText.pathA.reportActualRetests,
      ].join("\n") };
      const observed = resumed.observation.untrackedPaths?.filter(file => resumed.recovery?.paths.includes(file)) ?? [];
      return { task: active, wake: { key: a11ResumeKey(resumed.key), sourceRoleId: "application" },
        text: [
          `${roleText.pathA.a11IndexReconciled[0]}${active.workItemId}${roleText.pathA.a11IndexReconciled[1]}${active.taskId}${roleText.pathA.a11IndexReconciled[2]}${resumed.candidateOid}${roleText.pathA.a11IndexReconciled[3]}`,
          ...(observed.length ? [`${roleText.pathA.filesNotStaged[0]}${observed.join("、")}${roleText.pathA.filesNotStaged[1]}`] : []),
          receipts.length ? `${roleText.pathA.savedSameCandidateRetestReceipts[0]}${receipts.join("\n")}` : roleText.pathA.retestReceiptUnavailable,
          work,
          roleText.pathA.resubmitImplementationReport,
        ].join("\n") };
    }
    const git = store.taskGitScope(view.ref, active.taskId, active.roleId);
    const duty = git ? view.blockedRoutingEnabled
      ? roleText.pathA.authorizedGitCommit
      : workflowRoleDuty("A11", active.flowId)
      : roleText.pathA.implementationWorkWithoutGitPermission;
    const submit = git ? roleText.pathA.governedGitEnabled : "";
    const approved = view.blockedRoutingEnabled && view.proposalDecision;
    const values = approved ? `${roleText.pathA.approvedProposalDecisions[0]}${JSON.stringify(approved.values)}${roleText.pathA.approvedProposalDecisions[1]}${approved.selectionDigest}${roleText.pathA.approvedProposalDecisions[2]}` : "";
    return { task: active, text: `${work}${values}${roleText.pathA.implementationBoundPrompt[2]}${duty}${roleText.pathA.implementationBoundPrompt[3]}${active.modulePaths?.join("、") ?? ""}${roleText.pathA.implementationBoundPrompt[4]}${active.baseOid ?? ""}${roleText.pathA.implementationBoundPrompt[5]}${submit}${implementationRepairPrompt(view, active)}` };
  }
  const plan = view.implementationItems?.map(item => {
    const child = children.findLast(child => child.workItemId === item.id);
    const recordedTip = child && store.listEffects(view.ref, "task-commit").findLast(row =>
      row.state === "succeeded" && workflowTaskEffectMatches(row, child))?.result?.result?.oid;
    return `${roleText.pathA.operationsWorkItemRow[0]}${item.id}${roleText.pathA.operationsWorkItemRow[1]}${item.roleId}${roleText.pathA.operationsWorkItemRow[2]}${item.paths.join("、")}${roleText.pathA.operationsWorkItemRow[3]}${child?.state ?? roleText.pathA.awaitingDispatch}${child ? `${roleText.pathA.operationsWorkItemBinding[0]}${child.taskId}${roleText.pathA.operationsWorkItemBinding[1]}${child.commitOid ?? recordedTip ?? roleText.pathA.awaitingCommitVerification}` : ""}`;
  }).join("\n");
  const repair = view.implementationRepair;
  const instructions = roleText.pathA.dispatchEachApprovedWorkItem +
    roleText.pathA.closeReportedImplementation +
    (repair ? "" : roleText.pathA.reworkAttemptRequirement) +
    roleText.pathA.completeAllImplementationItems +
    roleText.pathA.implementationGitAndIntegration +
    (view.blockedRoutingEnabled ? roleText.pathA.coordinateModuleSelfTests : "") +
    (view.documentRevisionEnabled
      ? roleText.pathA.requestRevisionForGovernanceBlock
      : roleText.pathA.reportImplementationBlock);
  const repairText = repair ? [`${roleText.pathA.coordinateAcceptancePreparationRework[0]}${repair.sourceCandidateOid}${roleText.pathA.coordinateAcceptancePreparationRework[1]}${repair.reason}`,
    `${roleText.pathA.assignOriginalReworkOwner[0]}${repair.ownerTask.roleId}${roleText.pathA.assignOriginalReworkOwner[1]}${repair.workItemId}${roleText.pathA.assignOriginalReworkOwner[2]}${repair.ownerTask.taskId}${roleText.pathA.assignOriginalReworkOwner[3]}${repair.paths.join("、")}${roleText.pathA.assignOriginalReworkOwner[4]}`,
    ...repair.inherited.map(entry => `${roleText.pathA.retainAcceptedImplementation[0]}${entry.workItemId}${roleText.pathA.retainAcceptedImplementation[1]}${entry.taskId}${roleText.pathA.retainAcceptedImplementation[2]}${entry.commitOid}${roleText.pathA.retainAcceptedImplementation[3]}`),
    roleText.pathA.reviewSingleReworkResult].join("\n") : "";
  const evidenceInstructions = view.evidenceAudit ? evidenceOperatorInstructions(view)
    : view.evidenceAuditEnabled ? roleText.pathA.verifyEvidenceAfterImplementation : "";
  const text = `${parent.dispatch.text}${roleText.pathA.operationsParentPrompt[1]}${view.ref.instanceId}${roleText.pathA.operationsParentPrompt[2]}${parent.flowId}${roleText.pathA.operationsParentPrompt[3]}${plan ?? ""}${roleText.pathA.operationsParentPrompt[4]}${instructions}${repairText}${evidenceInstructions}`;
  const last = children.at(-1);
  if (!last) return { task: parent, text };
  if (!last.report) return undefined;
  if (last.state === "accepted" || last.state === "rework") {
    if (parentBusy) return undefined;
    const close = store.listCapabilityEvents(view.ref).findLast(row => row.receipt.state !== "ignored" && (row.event.input.kind === "task-closed" || row.event.input.kind === "evidence-collection-closed")
      && row.event.input.task.taskId === last.taskId && row.event.input.outcome === last.state);
    if (!close) return undefined;
    return { task: parent, text: `${roleText.pathA.resumeAfterPriorWorkItem[0]}${last.taskId}${roleText.pathA.resumeAfterPriorWorkItem[1]}${last.state}${roleText.pathA.resumeAfterPriorWorkItem[2]}${text}`,
      wake: { key: `a11-progress:${last.taskId}:${close.event.key}`, sourceRoleId: "application" } };
  }
  if (last.state !== "reported" || last.evidenceWorkOrder && !store.listCapabilityEvents(view.ref).some(row =>
    row.receipt.state !== "ignored" && row.event.input.kind === "evidence-collection-recorded"
      && row.event.input.task.taskId === last.taskId && row.event.input.reportKey === last.report?.key)) return undefined;
  const snapshot = store.getEvidence(view.ref, last.report.evidence) as { handback?: TaskHandback } | undefined;
  if (!snapshot?.handback) return undefined;
  const retest = view.a11Disposition?.childTask.taskId === last.taskId ? view.a11Disposition.retest : undefined;
  const key = operationsWakeKey(last.taskId, last.report.key, retest?.reportReviewGeneration);
  const failure = retest?.failure?.assertionFailure ? `${roleText.pathA.retestFailureEvidence[0]}${retest.failure.toolCallId}${roleText.pathA.retestFailureEvidence[1]}${retest.failure.evidence.sha256}${roleText.pathA.retestFailureEvidence[2]}` : "";
  return { task: parent, text: `${renderWorkReportPrompt(snapshot.handback)}${roleText.pathA.reviewImplementationReport[1]}${last.taskId}${roleText.pathA.reviewImplementationReport[2]}${failure}${roleText.pathA.reviewImplementationReport[3]}${text}`,
    wake: { key, sourceRoleId: last.roleId } };
}

export function workflowTaskEffectMatches(effect: DurableEffectRecord, pending: DurablePendingTask): boolean {
  const { stepId, attempt, task } = effect.intent;
  return stepId === pending.stepId && attempt === pending.attempt && task?.taskId === pending.taskId
    && task.taskId === pending.task.taskId && task.roleId === pending.roleId && task.roleId === pending.task.roleId
    && task.stage === pending.task.stage && task.stageAttempt === pending.task.stageAttempt
    && task.executionAttempt === pending.task.executionAttempt && task.parentTaskId === pending.task.parentTaskId;
}

export async function workflowWrittenReviewEvidence(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection, pending: DurablePendingTask,
): Promise<DurableEvidenceRef[]> {
  const kind = pending.capability === "independent-standard" && pending.task.stage === "A12a" ? "criteria"
    : pending.capability === "independent-assessment" && pending.task.stage === "A12b" && pending.reviewWritePath ? "report" : undefined;
  if (!view.workflowOwnedDispatch || !kind
    || pending.flowId !== view.flowId || pending.dispatch.actor !== "application" || pending.dispatch.flowId !== pending.flowId
    || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(pending.flowId)) return [];
  const prefix = `docs/quality/${pending.flowId}-${kind}-v`;
  const writes = new Map<string, Set<string>>();
  for (const effect of store.listEffects(view.ref, "task-write")) {
    if (effect.intent.kind !== "task-write" || effect.state !== "succeeded" || effect.result?.outcome !== "succeeded"
      || effect.result.key !== effect.intent.key || effect.result.token !== effect.token || !workflowTaskEffectMatches(effect, pending)) continue;
    const { paths, contentSha256 } = effect.intent.expected ?? {};
    if (!Array.isArray(paths) || paths.length !== 1 || typeof contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(contentSha256)) continue;
    const file = paths[0];
    if (!file.startsWith(prefix) || !/^[1-9]\d*\.md$/.test(file.slice(prefix.length)) || pending.reviewWritePath && file !== pending.reviewWritePath) continue;
    const hashes = writes.get(file) ?? new Set<string>();
    hashes.add(contentSha256);
    writes.set(file, hashes);
  }
  if (writes.size !== 1) return [];
  const [file, hashes] = writes.entries().next().value!;
  const fresh = await store.readEvidence(view.projectRoot, file);
  return fresh.ok && fresh.value.path === file && hashes.has(fresh.value.sha256) ? [fresh.value] : [];
}

export async function workflowReviewProof(
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, view: DurableProjection, stage: "A12a" | "A12b",
  flowId: string, report: TaskHandback, artifacts?: readonly DurableEvidenceRef[], candidateOid?: string,
): Promise<DurableResult<{ outcome: TaskClosedOutcome; documents: DurableEvidenceRef[]; tipOid?: string }>> {
  const prefix = `docs/quality/${flowId}-${stage === "A12a" ? "criteria" : "report"}-v`;
  const artifact = artifacts?.find(item => item.path.startsWith(prefix) && /^[1-9]\d*\.md$/.test(item.path.slice(prefix.length)));
  const fresh = artifact ? await store.readEvidence(view.projectRoot, artifact.path) : undefined;
  if (!artifact || !fresh?.ok || fresh.value.sha256 !== artifact.sha256) {
    return graphFailure("workflow-review-evidence-missing", roleText.pathA.acceptanceFileMissingOrChanged);
  }
  const documents = [artifact];
  if (stage === "A12a") return { ok: true, value: { documents, outcome: report.status === "completed" ? "accepted" : "rejected" } };
  const content = await readFile(path.join(view.projectRoot, artifact.path), "utf8").catch(() => undefined);
  const header = content && durableHash(content) === artifact.sha256 ? /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1] : undefined;
  let verdict: { candidateOid?: unknown; outcome?: unknown } | undefined;
  try { if (header) verdict = parse(header); } catch { /* malformed evidence is a blocked review */ }
  if (candidateOid && verdict?.candidateOid === candidateOid) {
    if (verdict.outcome === "accepted" && report.status === "completed") return { ok: true, value: { documents, outcome: "accepted", tipOid: candidateOid } };
    if (verdict.outcome === "rework" && report.status === "blocked") return { ok: true, value: { documents, outcome: "rework", tipOid: candidateOid } };
    if (report.status !== "completed") return { ok: true, value: { documents, outcome: "rejected" } };
  }
  return graphFailure("workflow-review-candidate-unverified", roleText.pathA.acceptanceHandbackMismatch);
}

export async function closeWorkflowTask(durable: DesktopDurableWorkflow, view: DurableProjection, pending: DurablePendingTask,
  outcome: TaskClosedOutcome, documents?: readonly DurableEvidenceRef[], tipOid?: string) {
  if (!pending.report) return graphFailure("close-report-missing", roleText.pathA.actualRoleReportMissing);
  const store = await durable.store();
  const key = `workflow-close:${pending.taskId}:${pending.report.key}`;
  const saved = await store.submitCapability(view.ref, {
    key, stepId: pending.stepId, attempt: pending.attempt, flowId: pending.flowId,
    source: { roleId: "host", originId: pending.taskId, parentTaskId: view.ref.instanceId },
    input: { kind: "task-closed", task: pending.task, reportKey: pending.report.key, outcome,
      ...(documents?.length ? { documents: [...documents] } : {}), ...(tipOid ? { tipOid } : {}) },
  });
  if (saved.ok && saved.value.state !== "ignored" && !(await readTaskState(view.projectRoot)).records.get(pending.taskId)?.closed) {
    await appendTaskEvent(view.projectRoot, taskEvent("task.closed", {
      taskId: pending.taskId, by: "convener", outcome, eventId: key, note: roleText.pathA.closeFromTrustedHandback,
    }));
  }
  return saved;
}

export function graphEventAddress(view: DurableProjection): Pick<DurableCapabilityEvent, "stepId" | "attempt"> {
  return { stepId: view.stepId, attempt: view.attempt };
}

export function graphTaskAddress(view: DurableProjection, taskId?: string): Pick<DurableCapabilityEvent, "stepId" | "attempt"> {
  const pending = view.pendingTasks?.find(task => task.taskId === taskId && task.capability === "independent-standard");
  return pending ? { stepId: pending.stepId, attempt: pending.attempt } : graphEventAddress(view);
}

const cards = {
  "confirm-intent": { kind: "intent-confirm", stage: "A3", operation: "intent-card" },
  "confirm-proposal": { kind: "proposal", stage: "A6", operation: "proposal-card" },
  "confirm-appointment": { kind: "appointment", stage: "A10", operation: "appointment-card" },
} as const;

export function graphCardProfile(view: DurableProjection) {
  return view.schema === 2 && view.action !== undefined && Object.hasOwn(cards, view.action)
    ? cards[view.action as keyof typeof cards] : undefined;
}

export async function runGraphDomain<T>(
  durable: DesktopDurableWorkflow, view: DurableProjection, operation: DurableDomainOperation,
  run: () => Promise<T>, taskId?: string, reconcileEffectKey?: string,
): Promise<DurableResult<T>> {
  if (!view.flowId) return { ok: false, code: "workflow-flow-unavailable", message: "The original workflow flow is unavailable." };
  return (await durable.store()).withDomainOperation(view.ref, {
    ...graphTaskAddress(view, taskId), flowId: view.flowId, operation, ...(taskId ? { taskId } : {}),
    ...(reconcileEffectKey ? { reconcileEffectKey } : {}),
  }, run);
}

export function graphTurn(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined) {
  return async () => {
    const entry = session();
    const origin = entry?.origins.running;
    if (!entry || !origin?.turnId) return undefined;
    const delivery = durable.delivery(entry.projectRoot, origin.clientMessageId);
    if (!delivery || delivery.roleId !== entry.roleId || delivery.runtime !== entry.runtime) return undefined;
    const current = () => session() === entry && entry.busy && entry.origins.running === origin && !origin.settled
      && !entry.interactionState.turn.signal.aborted && !entry.interactionState.lifetime.signal.aborted;
    const view = await durable.lookup(delivery.ref);
    if (!view || view.schema !== 2 || view.status !== "waiting" || view.engine !== "healthy" || !current()) return undefined;
    const { stepId, attempt } = delivery.intent;
    const assigned = view.pendingTasks?.some(task => task.stepId === stepId && task.attempt === attempt
      && task.taskId === delivery.intent.task?.taskId && task.capability === "independent-standard");
    if (!assigned && (stepId !== view.stepId || attempt !== view.attempt)) return undefined;
    const source = { roleId: entry.roleId, originId: origin.turnId, ...(origin.taskId ? { parentTaskId: origin.taskId } : {}) };
    return { view, source, current, delivery, entry };
  };
}

export function isA11PackageLockWorker(view: DurableProjection, roleId: string, taskId: string): boolean {
  if (!view.workflowOwnedDispatch || view.status !== "waiting" || view.engine !== "healthy") return false;
  const { parent, children } = operationsTasks(view);
  return parent?.state === "pending" && children.some(task => task.roleId === roleId && task.taskId === taskId
    && task.state === "pending" && task.modulePaths?.includes("package-lock.json"));
}

export function authorizeA11PackageLock(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined): GovernedPackageLockGenerator["authorize"] {
  const liveTurn = graphTurn(durable, session);
  return async signal => {
    const live = await liveTurn();
    const binding = live?.delivery.intent.task;
    if (!live || binding?.stage !== "A11" || binding.roleId !== live.entry.roleId
      || binding.taskId !== live.entry.assignedTaskId || binding.taskId !== live.source.parentTaskId) return undefined;
    const { ref } = live.view;
    const store = await durable.store();
    const isCurrent = () => {
      if (signal?.aborted || !live.current()) return false;
      const now = store.lookup(ref);
      return !!now && now.stepId === live.view.stepId && now.attempt === binding.stageAttempt
        && !(now.a11Disposition?.retest && now.a11Disposition.childTask.taskId === binding.taskId)
        && isA11PackageLockWorker(now, binding.roleId, binding.taskId)
        && store.taskWriteScope(ref, binding.taskId, binding.roleId)?.includes("package-lock.json") === true;
    };
    return isCurrent() ? { isCurrent } : undefined;
  };
}

export function graphRolePorts(input: {
  durable: DesktopDurableWorkflow;
  session: () => LiveSession | undefined;
  customer?: DesktopCustomerInputFn;
  isRegistered: () => boolean;
  executeDecision?: ChiefDecisionExecutor;
}) {
  const get = graphTurn(input.durable, input.session);
  return {
    async workflowDomain<T>(operation: DurableDomainOperation, run: () => Promise<T>): Promise<T> {
      const live = await get();
      if (!live) throw new Error("The current role turn does not own this workflow operation.");
      const result = await runGraphDomain(input.durable, live.view, operation, run, live.source.parentTaskId);
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      return result.value;
    },
    async customerInput(request: CustomerInputRequest, metadata?: CustomerInputMetadata) {
      if (request.cardKind !== "intent-confirm" && request.cardKind !== "proposal" && request.cardKind !== "appointment") return undefined;
      const live = await get();
      if (!live || !input.customer || metadata?.signal?.aborted || metadata?.turnId && metadata.turnId !== live.source.originId) {
        return notPresented("The current role turn does not own this workflow card.");
      }
      return prepareDesktopGraphCard({ durable: input.durable, view: live.view, source: live.source,
        isCurrent: live.current, request, metadata, window: { customer: input.customer, isRegistered: input.isRegistered, executeDecision: input.executeDecision } });
    },
    async activateRoleDocumentsFixed(request: Parameters<FixedActivateRoleDocumentsDep>[0], signal?: AbortSignal) {
      const live = await get();
      if (!live || signal?.aborted || !live.source.parentTaskId || live.source.roleId !== "nominator"
        || live.view.action !== "activate-roles" || request.flowId !== live.view.flowId || request.workflowId !== live.view.ref.instanceId) {
        return graphFailure("workflow-role-activation-forbidden", "Role activation needs the actual assigned personnel task.");
      }
      const { view, source, current } = live;
      const store = await input.durable.store();
      const proposalRequestId = request.proposalDecisionId.startsWith("decision-")
        ? request.proposalDecisionId.slice("decision-".length) : undefined;
      const proposal = store.listCapabilityEvents(view.ref).find(row => row.receipt.state === "consumed"
        && row.event.input.kind === "card-decided" && row.event.input.requestId === proposalRequestId && row.event.input.decision === "approve");
      if (!proposal || !proposalRequestId) return graphFailure("workflow-activation-approval-missing", "Role activation requires the approved proposal.");
      const documents = [request.documents.card, request.documents.boundaryMd, request.documents.boundaryYaml];
      const verified = [];
      for (const document of documents) {
        const evidence = await store.readEvidence(view.projectRoot, document.path);
        if (!evidence.ok || evidence.value.sha256 !== document.sha256) {
          return graphFailure("workflow-activation-document-drift", "An activation document changed.");
        }
        verified.push(evidence.value);
      }
      const key = `role-activation:${view.stepId}:${view.attempt}:${request.targetRoleId}`;
      const claim = await store.claimEffect(view.ref, { ...graphEventAddress(view), key, kind: "role-activation",
        task: live.delivery.intent.task, expected: { roleId: request.targetRoleId, proposalRequestId,
          paths: verified.map(evidence => evidence.path), hashes: verified.map(evidence => evidence.sha256) } });
      if (!claim.ok) return claim;
      const existing = store.listCapabilityEvents(view.ref).find(row => row.event.key === key)?.event.input;
      if (!claim.value.execute && claim.value.state !== "succeeded") {
        return graphFailure("workflow-activation-unverified", "The original activation effect requires verification.");
      }
      if (!current() || signal?.aborted) {
        if (claim.value.execute) await store.settleEffect(view.ref, { key, token: claim.value.token, outcome: "not-started", evidence: "Activation turn stopped before execution." });
        return graphFailure("workflow-role-activation-forbidden", "The actual personnel task stopped before activation.");
      }
      let actual;
      if (claim.value.execute) {
        const { card, boundaryMd, boundaryYaml } = request.documents;
        const run = await runGraphDomain(input.durable, view, "activate-roles", () => activateRoleDocumentsFixed({
          ...request, projectRoot: view.projectRoot, evidenceCollectorRoleId: view.evidenceCollectorRoleId, roster: { ...request.roster, sha256: request.roster.sha256! },
          documents: { card: { ...card, sha256: card.sha256! }, boundaryMd: { ...boundaryMd, sha256: boundaryMd.sha256! },
            boundaryYaml: { ...boundaryYaml, sha256: boundaryYaml.sha256! } },
        }), live.source.parentTaskId);
        actual = run.ok ? run.value : run;
        const settled = await store.settleEffect(view.ref, { key, token: claim.value.token,
          outcome: actual.ok ? "succeeded" : "unknown",
          evidence: actual.ok ? "The original role activation and document receipts were recorded." : actual.message,
          ...(actual.ok ? { result: { activationKey: actual.activationKey, roleId: actual.roleId, rosterSha256: actual.rosterSha256 } } : {}) });
        if (!settled.ok) return settled;
        if (!actual.ok) return actual;
      }
      const saved = await store.submitCapability(view.ref, { ...graphEventAddress(view), key, flowId: request.flowId, source,
        input: { kind: "role-activated", roleId: request.targetRoleId, documents: verified, proposalRequestId } }, current);
      if (!saved.ok) return saved;
      if (saved.value.state === "ignored") return graphFailure("workflow-role-activation-ignored", saved.value.reason ?? "The role activation belongs to a retired step.");
      const activationKey = actual?.activationKey ?? claim.value.result?.result?.activationKey;
      if (typeof activationKey !== "string") return graphFailure("workflow-role-activation-unverified", "The original activation key is unavailable.");
      return { ok: true as const, workflowId: view.ref.instanceId, roleId: request.targetRoleId, activationKey,
        rosterSha256: request.roster.sha256!, replay: !claim.value.execute || !!existing, stageCompleted: saved.value.state === "consumed" };
    },
  };
}

function graphFailure(code: string, message: string) {
  return { ok: false as const, code, message };
}

export async function completeGraphBaseline(
  durable: DesktopDurableWorkflow, live: NonNullable<Awaited<ReturnType<ReturnType<typeof graphTurn>>>>,
  request: CompleteTeamPlanFixedInput,
): Promise<CompleteTeamPlanFixedResult> {
  const { view, current, source, delivery } = live;
  const { ref, projectRoot, flowId } = view;
  if (view.action !== "team-baseline" || !flowId || flowId !== request.flowId || request.workflowId !== ref.instanceId
    || source.roleId !== "convener" || !source.parentTaskId || !current() || !request.plan
    || request.runId !== undefined || request.baseDigest !== undefined) {
    return graphFailure("workflow-baseline-forbidden", "Baseline preparation requires the actual assigned operations task.");
  }
  const store = await durable.store();
  const plan = await store.readEvidence(projectRoot, request.plan.path);
  if (!plan.ok || request.plan.sha256 && plan.value.sha256 !== request.plan.sha256) {
    return graphFailure("workflow-baseline-plan-drift", "The actual submitted team plan changed.");
  }
  const key = `git:baseline:${view.stepId}:${view.attempt}`;
  const prior = store.listEffects(ref, "baseline").find(effect => effect.intent.key === key && effect.state !== "not-started");
  if (prior) {
    if (prior.intent.expected?.operationId !== request.operationId || prior.intent.expected?.planSha256 !== plan.value.sha256) {
      return graphFailure("workflow-baseline-conflict", "A different team plan operation is already in progress.");
    }
    return executeGraphBaseline(durable, view, prior.intent, prior.token, true);
  }
  const original = await durableBaselineOrigin(projectRoot, ref.instanceId);
  if (!original.ok) return original;
  const planVersion = request.plan.version ?? Number(/-v([1-9]\d*)\.md$/.exec(plan.value.path)?.[1]);
  if (!Number.isSafeInteger(planVersion) || planVersion < 1) return graphFailure("workflow-baseline-plan-invalid", "The actual versioned team plan is required.");
  if (!current()) return graphFailure("workflow-baseline-forbidden", "The originating operations turn changed.");
  const intent = { ...graphEventAddress(view), key, kind: "baseline" as const, task: delivery.intent.task,
    expected: { ...original.value, workflowId: ref.instanceId, planPath: plan.value.path, planSha256: plan.value.sha256,
      planVersion: String(planVersion), operationId: request.operationId,
      originId: source.originId, parentTaskId: source.parentTaskId, branch: taskBranchName(ref.instanceId) } };
  const claim = await store.claimEffect(ref, intent);
  if (!claim.ok) return claim;
  if (!current()) {
    if (claim.value.execute) await store.settleEffect(ref, { key, token: claim.value.token, outcome: "not-started", evidence: "Operations turn ended before baseline preparation." });
    return graphFailure("workflow-baseline-forbidden", "The originating operations turn changed.");
  }
  return executeGraphBaseline(durable, view, intent, claim.value.token, !claim.value.execute);
}

async function recordGraphBaseline(
  durable: DesktopDurableWorkflow, view: DurableProjection, key: string, token: string,
  source: DurableCapabilityEvent["source"], original: DurableBaselineOrigin, result: Extract<CompleteTeamPlanFixedResult, { ok: true }>,
): Promise<DurableResult<unknown>> {
  const store = await durable.store();
  const { ref, projectRoot } = view;
  const actualBasis = (await readBasisLedger(projectRoot)).events.find(event => event.kind === "basis.recorded"
    && event.workflowId === ref.instanceId && event.basisId === result.basisId && event.operationId === result.operationId);
  const repo = actualBasis?.kind === "basis.recorded" ? actualBasis.repo : undefined;
  const actual = await verifyDurableGraphBaseline(projectRoot, ref.instanceId, token, original);
  if (!repo?.baseOid || !actual.ok || actual.value.branch !== repo.branch || actual.value.oid !== repo.baseOid) {
    const message = "The original Git baseline has no matching branch and basis receipt.";
    store.block(ref, "workflow-baseline-reconciliation-required", message);
    return graphFailure("workflow-baseline-reconciliation-required", message);
  }
  const plan = await store.readEvidence(projectRoot, result.plan.path);
  const roster = await loadLatestRoster({ projectRoot, flowId: result.flowId, evidenceCollectorRoleId: view.evidenceCollectorRoleId });
  const docs = result.documents.map(({ path, sha256 }) => ({ path, sha256 }));
  const modules = result.documents.find(document => document.kind === "modules");
  const planText = await readFile(path.join(projectRoot, result.plan.path), "utf8").catch(() => undefined);
  if (!plan.ok || plan.value.sha256 !== result.plan.sha256 || typeof planText !== "string" || !roster.ok || !modules) {
    return graphFailure("workflow-baseline-documents-unavailable", "The team plan documents could not be verified.");
  }
  const settings = parseTeamPlan(planText, { flowId: result.flowId, version: result.plan.version,
    modules: { path: modules.path, sha256: modules.sha256 }, roster, rosterFacts: roster.roster });
  if (!settings.ok) return graphFailure("workflow-baseline-plan-invalid", settings.reason);
  const baselineOid = repo.baseOid, branch = repo.branch;
  const settled = await store.settleEffect(ref, { key, token, outcome: "succeeded", evidence: "Verified the actual branch, tip and recorded team-plan basis.",
    result: { branch, oid: baselineOid } });
  if (!settled.ok) return settled;
  const bound = await store.bindRepository(ref, { effectKey: key, baselineOid, branch });
  if (!bound.ok) return bound;
  return store.submitCapability(ref, { ...graphEventAddress(view), key: `baseline-verified:${key}`, flowId: result.flowId, source,
    input: { kind: "baseline-verified", effectKey: key, baselineOid, branch, documents: [...docs, plan.value],
      writeSets: settings.plan.roleRows.map(row => ({ roleId: row.roleId, paths: row.writesets })) } });
}

async function executeGraphBaseline(
  durable: DesktopDurableWorkflow, view: DurableProjection,
  intent: import("../../src/model/durable-workflow.ts").DurableEffectIntent, token: string, recovering: boolean,
): Promise<CompleteTeamPlanFixedResult> {
  const { projectRoot, flowId, ref } = view;
  const key = intent.key;
  const expected = intent.expected;
  const invalid = () => graphFailure("workflow-baseline-reconciliation-required", "The original team-plan operation could not be identified.");
  if (!flowId || !expected) return invalid();
  const { operationId, originId, parentTaskId, repositoryBefore, mainBefore, planPath, planSha256, planVersion } = expected;
  if (typeof operationId !== "string" || typeof originId !== "string" || typeof parentTaskId !== "string"
    || (repositoryBefore !== "existing" && repositoryBefore !== "absent") || typeof mainBefore !== "string"
    || typeof planPath !== "string" || typeof planSha256 !== "string" || typeof planVersion !== "string") return invalid();
  const original = { repositoryBefore, mainBefore } satisfies DurableBaselineOrigin;
  const source = { roleId: "convener", originId, parentTaskId };
  const store = await durable.store();
  const release = acquireProjectGitCriticalSection(projectRoot, key);
  if (!release) return graphFailure("workflow-baseline-busy", "The original baseline operation is already in progress.");
  try {
    const basis = (await readBasisLedger(projectRoot)).events.find(event => event.kind === "basis.recorded"
      && event.workflowId === ref.instanceId && event.operationId === operationId);
    let result: CompleteTeamPlanFixedResult;
    if (basis?.kind === "basis.recorded" && basis.teamPlan && basis.flowId === flowId) {
      result = { ok: true, operationId, flowId, workflowId: ref.instanceId, basisId: basis.basisId,
        plan: basis.teamPlan, documents: basis.documents, replay: true, stageCompleted: false };
    } else {
      const proven = await createDurableGraphBaselineGitPort({ projectRoot, workflowId: ref.instanceId, token,
        origin: original, definitionFile: view.definitionSource === "project" ? view.definitionFile : undefined });
      if (!proven.ok) {
        store.block(ref, proven.code, proven.message);
        return proven;
      }
      let gitStarted = false;
      const { ensureRepository } = proven.value;
      const appResult = await runGraphDomain(durable, view, "team-baseline", () => completeTeamPlanFixed({
        projectRoot, flowId, workflowId: ref.instanceId, operationId, actorRoleId: "convener", evidenceCollectorRoleId: view.evidenceCollectorRoleId,
        plan: { path: planPath, sha256: planSha256, version: Number(planVersion) },
        port: { ...proven.value, ensureRepository: input => { gitStarted = true; return ensureRepository(input); } },
      }), parentTaskId, recovering ? key : undefined);
      result = appResult.ok ? appResult.value : appResult;
      if (!result.ok) {
        if (!recovering) await store.settleEffect(ref, { key, token, outcome: gitStarted ? "unknown" : "not-started", evidence: result.message });
        store.block(ref, result.code, result.message);
        return result;
      }
    }
    const saved = await recordGraphBaseline(durable, view, key, token, source, original, result);
    return saved.ok ? result : saved;
  } finally {
    release();
  }
}

export async function resumeGraphBaseline(durable: DesktopDurableWorkflow, view: DurableProjection): Promise<void> {
  if (view.action !== "team-baseline") return;
  const store = await durable.store();
  const key = `git:baseline:${view.stepId}:${view.attempt}`;
  const previous = store.listEffects(view.ref, "baseline").find(effect => effect.intent.key === key && effect.state !== "not-started");
  if (previous) await executeGraphBaseline(durable, view, previous.intent, previous.token, true);
}

export async function syncGraphArchive(durable: DesktopDurableWorkflow, view: DurableProjection): Promise<void> {
  if (view.action !== "archive-acceptance" || !view.flowId || !view.baseline) return;
  const { ref, projectRoot, flowId, baseline } = view;
  const store = await durable.store();
  const rows = store.listCapabilityEvents(ref).filter(row => row.receipt.state === "consumed").map(row => row.event);
  const closes = rows.flatMap(row => row.input.kind === "task-closed" && row.input.outcome === "accepted" ? [row.input] : []);
  const standard = closes.findLast(item => item.task.stage === "A12a");
  const assessment = closes.findLast(item => item.task.stage === "A12b");
  const implementation = view.implementation;
  const candidate = implementation && store.listEffects(ref, "task-commit").findLast(effect => effect.state === "succeeded"
    && effect.intent.task?.taskId === implementation.task.taskId
    && effect.intent.task.stageAttempt === implementation.task.stageAttempt)?.result?.result?.oid;
  const exactName = (kind: "criteria" | "report", file: string) =>
    file.startsWith(`docs/quality/${flowId}-${kind}-v`) && /-v[1-9]\d*\.md$/.test(file);
  const current = view.evidenceAudit;
  const signed = current?.basis.standard;
  const matchesSigned = (doc: DurableEvidenceRef | undefined) => !!signed && doc?.path === signed.path && doc.sha256 === signed.sha256;
  const originalStandard = view.pendingTasks?.find(task => task.taskId === standard?.task.taskId
    && task.capability === "independent-standard" && task.outcome === "accepted"
    && task.roleId === standard.task.roleId && task.baselineOid === baseline.oid);
  const currentCriteria = current?.state === "audited" && current.basis.candidateOid === candidate && current.basis.branch === baseline.branch
    && current.auditTask?.taskId === assessment?.task.taskId && signed && exactName("criteria", signed.path)
    && matchesSigned(view.verificationPlan?.standard) && originalStandard?.documents?.some(matchesSigned) ? signed : undefined;
  const criteria = view.evidenceAuditEnabled ? currentCriteria : standard?.documents?.find(doc => exactName("criteria", doc.path));
  const report = assessment?.documents?.find(doc => exactName("report", doc.path));
  if (!standard || !criteria || !report || !assessment || typeof candidate !== "string") {
    store.block(ref, "workflow-acceptance-incomplete", "The bound independent standard, accepted implementation and assessment are required.");
    return;
  }
  const reportEvent = rows.find(row => row.key === assessment.reportKey)?.input;
  const snapshot = reportEvent?.kind === "task-report" ? store.getEvidence(ref, reportEvent.evidence) as { handback?: TaskHandback } | undefined : undefined;
  const domainState = await readTaskState(projectRoot);
  const staffDecision = domainState.records.get(assessment.task.taskId)?.closed?.note;
  if (!snapshot?.handback || snapshot.handback.status === "blocked" && !staffDecision?.trim()) {
    store.block(ref, "workflow-acceptance-incomplete", "An explicit assessment report or the recorded light-verification disposition is required.");
    return;
  }
  for (const doc of [criteria, report]) {
    const current = await store.readEvidence(projectRoot, doc.path);
    if (!current.ok || current.value.sha256 !== doc.sha256) {
      store.block(ref, "workflow-acceptance-drift", "A document in the accepted evidence pair changed.");
      return;
    }
  }
  const preview = await previewDurableMerge({ projectRoot, branch: baseline.branch, baselineOid: baseline.oid,
    definitionFile: view.definitionSource === "project" ? view.definitionFile : undefined });
  if (!preview.ok || preview.value.tipOid !== candidate) {
    store.block(ref, "workflow-acceptance-drift", "The working candidate no longer matches the accepted implementation.");
    return;
  }
  const version = /-v([1-9]\d*)\.md$/.exec(report.path)?.[1];
  const archivePath = `docs/acceptance/${flowId}-acceptance-v${version}.md`;
  const key = `acceptance-archive:${view.stepId}:${view.attempt}`;
  const claim = await store.claimEffect(ref, { ...graphEventAddress(view), key, kind: "acceptance-archive",
    expected: { criteriaPath: criteria.path, criteriaSha256: criteria.sha256, reportPath: report.path, reportSha256: report.sha256,
      archivePath, tipOid: candidate } });
  if (!claim.ok) {
    store.block(ref, claim.code, claim.message);
    return;
  }
  if (claim.value.execute) {
    const result = await runGraphDomain(durable, view, "archive-acceptance", () => archiveAcceptance({
      projectRoot, flowId, workflowId: ref.instanceId, criteriaPath: criteria.path, reportPath: report.path,
      conclusion: snapshot.handback!.summary, ...(staffDecision ? { staffDecision } : {}),
    }));
    if (!result.ok || !result.value.ok) {
      const failure = result.ok ? result.value : result;
      await store.settleEffect(ref, { key, token: claim.value.token, outcome: "unknown", evidence: failure.ok ? "Unverified archive." : failure.message });
      store.block(ref, "workflow-acceptance-archive-failed", failure.ok ? "Unverified archive." : failure.message);
      return;
    }
  }
  const archive = await store.readEvidence(projectRoot, archivePath);
  const archivedText = archive.ok ? await readFile(path.join(projectRoot, archivePath), "utf8").catch(() => "") : "";
  const metadata = archivedText.split(/^---\s*$/m)[1]?.trim().split(/\r?\n/) ?? [];
  if (!archive.ok || ![`workflowId: ${ref.instanceId}`, `criteria: ${criteria.path}`, `criteriaSha256: ${criteria.sha256}`,
    `report: ${report.path}`, `reportSha256: ${report.sha256}`, `idempotencyKey: acceptance:${ref.instanceId}:${report.sha256}`].every(value => metadata.includes(value))) {
    store.block(ref, "workflow-acceptance-archive-unverified", "The archive does not match the original verification evidence.");
    return;
  }
  const settled = await store.settleEffect(ref, { key, token: claim.value.token, outcome: "succeeded",
    evidence: "Verified the bound criteria, report and actual archive bytes against the candidate tip.",
    result: { archivePath, archiveSha256: archive.value.sha256, tipOid: candidate } });
  if (!settled.ok) {
    store.block(ref, settled.code, settled.message);
    return;
  }
  const recorded = await store.submitCapability(ref, { ...graphEventAddress(view), key: `archive-verified:${key}`, flowId,
    source: { roleId: "host", originId: key },
    input: { kind: "archive-verified", effectKey: key, criteria, report, archive: archive.value, tipOid: candidate,
      runtimeVerified: false } });
  if (!recorded.ok) store.block(ref, recorded.code, recorded.message);
}


type CardPayload = {
  request: CustomerInputRequest;
  sourceRequest?: CustomerInputRequest;
  documentRefs: WorkflowDocumentRef[];
  intentId?: string;
  decisionOptions?: Readonly<Record<string, Readonly<Record<string, DurableProposalDecisionValue>>>>;
};

const workflowDecisionT = createTranslator("zh-CN");

function revisionOptions(request: Extract<CustomerInputRequest, { kind: "choice" }>, material: string, t: MainTranslate = mainT) {
  return ["revise", "reject"].map(id => request.options.find(option => option.id === id)
    ?? { id, label: t(id === "revise" ? "main.durableWorkflow.pathA.reviseMaterial" : "main.durableWorkflow.pathA.rejectMaterial", { material }) });
}

function intentRevisionCard(request: Extract<CustomerInputRequest, { kind: "choice" }>, problem: string, t: MainTranslate = mainT) {
  return {
    ...request, multiple: false,
    options: revisionOptions(request, t("main.durableWorkflow.pathA.intentMaterial"), t),
    question: t("main.durableWorkflow.pathA.intentRevisionRequired", { problem }),
  };
}

async function readCardMaterial(projectRoot: string, refs: readonly WorkflowDocumentRef[], kind: "intent" | "proposal"): Promise<string> {
  const doc = refs.find(item => item.kind === kind);
  if (!doc) throw new Error(mainT("main.durableWorkflow.pathA.currentCardMaterialMissing"));
  const bytes = await readFile(path.join(projectRoot, doc.path));
  if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256) throw new Error(mainT("main.durableWorkflow.pathA.cardMaterialChanged"));
  return bytes.toString("utf8");
}

function concreteProposalCard(request: Extract<CustomerInputRequest, { kind: "choice" }>,
  fields: NonNullable<DurableGraphCard["decisionFields"]>, decisionProblem?: string, t: MainTranslate = mainT) {
  const decisionOptions = decisionProblem ? {} : proposalDecisionChoices(fields);
  const approvalOptions = Object.entries(decisionOptions).map(([id, values]) => {
    const chosen = fields.flatMap(field => {
      if (!Object.hasOwn(values, field.id)) return [];
      const value = values[field.id];
      const option = field.options.find(item => item.value === value);
      return [`${field.label} ${option?.label ?? value} (${JSON.stringify(value)})${field.defaultValue === value ? t("main.durableWorkflow.pathA.usesProposalDefault") : ""}`];
    });
    const recommended = fields.every(field => !Object.hasOwn(values, field.id) ? !field.required && field.defaultValue === undefined
      : field.defaultValue === values[field.id]);
    const label = fields.flatMap(field => Object.hasOwn(values, field.id)
      ? [field.options.find(option => option.value === values[field.id])!.label] : []).join(" · ");
    return { id, label: label || t("main.durableWorkflow.pathA.approveDecisionSet"), description: chosen.join("。"), ...(recommended ? { recommended: true } : {}) };
  });
  return {
    request: { ...request, multiple: false, options: [...approvalOptions, ...revisionOptions(request, t("main.durableWorkflow.pathA.proposalMaterial"), t)],
      ...(decisionProblem ? { description: t("main.durableWorkflow.pathA.proposalRevisionRequired", { problem: decisionProblem }) } : {}) },
    decisionOptions,
  };
}

interface GraphCardWindow {
  customer: DesktopCustomerInputFn;
  isRegistered(): boolean;
  executeDecision?: ChiefDecisionExecutor;
}

interface GraphCardPresentation {
  requestId: string;
  controller: AbortController;
  outcome: Promise<CustomerInputOutcome | null | undefined>;
}

const presentations = new WeakMap<DesktopDurableWorkflow, Map<string, GraphCardPresentation>>();

export function closeDesktopGraphCard(durable: DesktopDurableWorkflow, projectRoot: string): void {
  const byProject = presentations.get(durable);
  const presentation = byProject?.get(projectRoot);
  if (presentation) {
    byProject?.delete(projectRoot);
    presentation.controller.abort();
  }
}

function staleCard(message: string) {
  return { ok: false as const, stale: true, message };
}

function notPresented(reason: string): CustomerInputOutcome {
  return { outcome: "declined", notPresented: true, reason };
}

export async function prepareDesktopGraphCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  request: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
  source: DurableCapabilityEvent["source"];
  window: GraphCardWindow;
  isCurrent: () => boolean;
}): Promise<CustomerInputOutcome | null | undefined> {
  const { durable, view, source, window } = input;
  const profile = graphCardProfile(view);
  const flowId = view.flowId;
  const store = await durable.store();
  if (!profile || source.roleId !== "chief" || profile.kind !== input.request.cardKind || !flowId
    || (input.request.flowId ?? input.metadata?.flowId) !== flowId || !input.isCurrent() || !window.isRegistered()) {
    return notPresented("The current role turn does not own this customer card.");
  }
  const previous = graphCardRows(store, view).at(-1)?.event.input;
  if (previous?.kind === "card-prepared" && graphCardDecision(store, view, previous.card)) {
    return notPresented("The workflow already recorded the decision for this request.");
  }
  let request = input.request;
  let intentId: string | undefined;
  let refs: WorkflowDocumentRef[] = [];
  if (profile.kind === "intent-confirm") {
    const run = await runGraphDomain(durable, view, profile.operation,
      () => prepareIntent({ projectRoot: view.projectRoot, flowId, workflowId: view.ref.instanceId }));
    if (!run.ok) return notPresented(run.message);
    if (!run.value.ok) return notPresented(run.value.message);
    const prepared = run.value;
    refs = prepared.documentRefs;
    intentId = prepared.intentId;
    if (!intentId || (input.metadata?.intentId !== undefined && input.metadata.intentId !== intentId)) {
      return notPresented("The bound intent entry must exist before the card is presented.");
    }
    const entry = await store.readEvidence(view.projectRoot, `docs/intents/${intentId}.md`);
    if (!entry.ok) return notPresented(entry.message);
    refs = [...refs, { kind: "intent-entry", ...entry.value }];
  } else {
    const roster = await loadLatestRoster({ projectRoot: view.projectRoot, flowId, evidenceCollectorRoleId: view.evidenceCollectorRoleId });
    if (!roster.ok) return notPresented(roster.reason);
    const rosterRef = { kind: "roster", path: roster.path, sha256: roster.sha256, version: roster.version };
    if (profile.kind === "appointment") {
      const offered = request.kind === "choice" ? request.options : [];
      if (request.kind !== "choice" || request.multiple !== true
        || offered.length !== roster.roster.roles.length
        || roster.roster.roles.some(role => !offered.some(option => option.id === role.id))) {
        return notPresented("Appointment choices must match the current approved roster.");
      }
      request = { ...request, options: roster.roster.roles.map(role => ({ id: role.id, label: role.displayName, recommended: true })) };
      refs = [rosterRef];
      const events = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state === "consumed");
      const approved = events.findLast(row => row.event.input.kind === "card-prepared" && row.event.input.card.cardKind === "proposal"
        && row.event.input.card.documents.some(doc => doc.path === rosterRef.path && doc.sha256 === rosterRef.sha256)
        && graphCardDecision(store, view, row.event.input.card)?.input.decision === "approve")?.event.input;
      if (approved?.kind !== "card-prepared") return notPresented("Appointment requires the current approved roster.");
      for (const role of roster.roster.roles) {
        const activation = events.findLast(row => row.event.input.kind === "role-activated"
          && row.event.input.roleId === role.id && row.event.input.proposalRequestId === approved.card.requestId)?.event.input;
        if (activation?.kind !== "role-activated") return notPresented(`Role ${role.id} has no matching activation.`);
        for (const evidence of activation.documents) {
          const actual = await store.readEvidence(view.projectRoot, evidence.path);
          if (!actual.ok || actual.value.sha256 !== evidence.sha256) return notPresented(`Role ${role.id} changed after activation.`);
          refs.push({ kind: "role-activation", ...evidence });
        }
      }
    } else {
      const approved = store.listCapabilityEvents(view.ref).find(row => row.receipt.state === "consumed"
        && row.event.input.kind === "card-prepared" && row.event.input.card.cardKind === "intent-confirm"
        && row.event.input.card.documents.some(doc => doc.path === roster.roster.intent)
        && graphCardDecision(store, view, row.event.input.card)?.input.decision === "approve");
      const approvedIntent = approved?.event.input.kind === "card-prepared"
        ? approved.event.input.card.documents.find(doc => doc.path === roster.roster.intent) : undefined;
      if (!approvedIntent) return notPresented("The proposal requires the approved version of the intent.");
      const latestModules = await latestVersionedDoc(view.projectRoot, "docs/proposals", flowId, "modules");
      const modules = roster.roster.modulesDoc ?? (latestModules && `docs/proposals/${latestModules.name}`);
      if (!modules) return notPresented("The approved roster has no matching module document.");
      for (const [kind, file] of [["intent", roster.roster.intent], ["proposal", roster.roster.proposal],
        ["modules", modules], ["roster", roster.path], ["architecture", roster.roster.architecture]] as const) {
        const evidence = await store.readEvidence(view.projectRoot, file);
        if (!evidence.ok) return notPresented(evidence.message);
        if (kind === "intent" && evidence.value.sha256 !== approvedIntent.sha256) return notPresented("The approved intent changed after confirmation.");
        refs.push({ kind, ...evidence.value, version: Number(/-v(\d+)\.md$/.exec(file)?.[1]) });
      }
    }
  }
  const provided = request.kind === "choice" ? request.options.map(option => option.id) : [];
  const allowed = profile.kind === "intent-confirm" ? ["confirm", "revise", "reject"]
    : profile.kind === "proposal" ? ["accept", "revise", "reject"] : provided;
  if (request.kind !== "choice" || provided.length === 0 || new Set(provided).size !== provided.length
    || profile.kind !== "appointment" && (request.multiple === true || provided.some(id => !allowed.includes(id)))) {
    return notPresented("The choices do not match the current workflow card.");
  }
  let decisionFields: DurableGraphCard["decisionFields"];
  let decisionProblem: string | undefined;
  let decisionOptions: CardPayload["decisionOptions"];
  const sourceRequest = request;
  let cardRequest = sourceRequest;
  if (profile.kind === "intent-confirm") {
    try {
      const parsed = parseIntentDecisionRequirements(await readCardMaterial(view.projectRoot, refs, "intent"));
      if (!parsed.ok) {
        decisionProblem = parsed.message;
        cardRequest = intentRevisionCard(sourceRequest, decisionProblem);
      }
    } catch (error) {
      return notPresented(error instanceof Error ? error.message : mainT("main.durableWorkflow.pathA.intentDecisionRequirementsUnreadable"));
    }
  } else if (profile.kind === "proposal") {
    try {
      const [proposalText, intentText] = await Promise.all([
        readCardMaterial(view.projectRoot, refs, "proposal"), readCardMaterial(view.projectRoot, refs, "intent"),
      ]);
      const parsed = parseProposalDecisionFields(proposalText, intentText);
      if (!parsed.ok) {
        decisionProblem = parsed.message;
        decisionFields = [];
      } else if (parsed.value.length) decisionFields = parsed.value;
    } catch (error) {
      return notPresented(error instanceof Error ? error.message : "Cannot read the current proposal decisions.");
    }
    if (decisionFields) ({ request: cardRequest, decisionOptions } = concreteProposalCard(sourceRequest, decisionFields, decisionProblem));
  }
  const options = cardRequest.options.map(option => option.id);
  const address = graphEventAddress(view);
  const documents = refs.map(({ path, sha256 }) => ({ path, sha256 }));
  const payload: CardPayload = { request: cardRequest, documentRefs: refs, ...(intentId ? { intentId } : {}),
    ...(decisionOptions ? { decisionOptions } : {}), ...(decisionOptions || decisionProblem ? { sourceRequest } : {}) };
  const decisionBinding = { ...(decisionFields ? { decisionFields } : {}), ...(decisionProblem ? { decisionProblem } : {}) };
  const digestFor = (body: CardPayload) => store.graphCardDigest(view.ref, {
    ...address, cardKind: profile.kind, documents, options, payload: body, ...decisionBinding,
  });
  const digest = digestFor(payload);
  const last = graphCardRows(store, view).at(-1)?.event.input;
  if (last?.kind === "card-prepared") {
    if (graphCardDecision(store, view, last.card)) return notPresented("This workflow card is already decided.");
    if (last.card.digest === digest) return presentDesktopGraphCard(durable, view, last.card, source, window);
    if (decisionFields || decisionProblem) {
      // An unchanged request can be retried after a locale switch. Match the original full digest
      // before reusing its pending card, including the original visible text and generation.
      const alternateT = mainLocale() === "en-US" ? workflowDecisionT : createTranslator("en-US");
      const alternateRequest = profile.kind === "proposal" && decisionFields
        ? concreteProposalCard(sourceRequest, decisionFields, decisionProblem, alternateT).request
        : profile.kind === "intent-confirm" && decisionProblem
          ? intentRevisionCard(sourceRequest, decisionProblem, alternateT) : undefined;
      if (alternateRequest && last.card.digest === digestFor({ ...payload, request: alternateRequest })) {
        return presentDesktopGraphCard(durable, view, last.card, source, window);
      }
    }
  }
  if (!input.isCurrent() || !window.isRegistered()) return notPresented("The originating role turn changed while the card was prepared.");
  const generation = last?.kind === "card-prepared" ? last.card.generation + 1 : 1;
  const card: DurableGraphCard = { requestId: `dw-card:${digest}:${generation}`, digest, generation,
    cardKind: profile.kind, documents, options, payload, ...decisionBinding };
  const saved = await store.submitCapability(view.ref, { ...address, key: `card-prepared:${card.requestId}`, flowId, source,
    input: { kind: "card-prepared", card } }, () => input.isCurrent() && window.isRegistered());
  if (!saved.ok || saved.value.state === "ignored") return notPresented(saved.ok ? saved.value.reason ?? "The card was retired." : saved.message);
  return presentDesktopGraphCard(durable, view, card, source, window);
}

type DesktopStore = Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;

function graphCardRows(store: DesktopStore, view: DurableProjection) {
  return store.listCapabilityEvents(view.ref).filter(row => row.event.stepId === view.stepId && row.event.attempt === view.attempt
    && row.event.input.kind === "card-prepared" && row.receipt.state !== "ignored");
}

function graphCardDecision(store: DesktopStore, view: DurableProjection, card: DurableGraphCard) {
  const event = store.listCapabilityEvents(view.ref).find(row => row.event.input.kind === "card-decided"
    && row.event.input.requestId === card.requestId && row.event.input.digest === card.digest && row.receipt.state !== "ignored")?.event;
  return event?.input.kind === "card-decided" ? { ...event, input: event.input } : undefined;
}

export async function resumeDesktopGraphCard(
  durable: DesktopDurableWorkflow, view: DurableProjection, window: GraphCardWindow,
): Promise<boolean> {
  const store = await durable.store();
  if (!window.isRegistered()) return true;
  const last = graphCardRows(store, view).at(-1);
  if (last?.event.input.kind !== "card-prepared") return false;
  const card = last.event.input.card;
  const decision = graphCardDecision(store, view, card);
  if (card.cardKind === "intent-confirm" && decision?.input.decision === "approve" && decision.input.provenance) {
    const { requestId, digest, generation } = card;
    const result = await store.completeIntentDecision(view.ref, { requestId, digest, generation }, window.isRegistered);
    if (!result.ok && window.isRegistered()) store.block(view.ref, result.code, result.message);
  }
  if (!decision) {
    const payload = card.payload as CardPayload | undefined;
    let refresh = false;
    for (const document of card.documents) {
      const current = await store.readEvidence(view.projectRoot, document.path);
      if (!current.ok || current.value.sha256 !== document.sha256) {
        refresh = true;
        break;
      }
    }
    if (!refresh && card.cardKind === "intent-confirm" && !card.decisionProblem && payload) {
      try {
        refresh = !parseIntentDecisionRequirements(await readCardMaterial(view.projectRoot, payload.documentRefs, "intent")).ok;
      } catch {
        refresh = true;
      }
    }
    if (refresh) {
      closeDesktopGraphCard(durable, view.projectRoot);
      if (payload) {
        void prepareDesktopGraphCard({ durable, view, request: payload.sourceRequest ?? payload.request,
          source: last.event.source, window, isCurrent: window.isRegistered }).then(result => {
          if (result?.outcome === "declined" && result.notPresented) store.block(view.ref, "workflow-card-evidence-drift", result.reason ?? "The customer card is waiting for valid current documents.");
        }).catch(() => undefined);
      }
    } else void presentDesktopGraphCard(durable, view, card, last.event.source, window).catch(() => undefined);
  }
  return true;
}

function presentDesktopGraphCard(
  durable: DesktopDurableWorkflow, view: DurableProjection, card: DurableGraphCard,
  source: DurableCapabilityEvent["source"], window: GraphCardWindow,
): Promise<CustomerInputOutcome | null | undefined> {
  const { projectRoot } = view;
  let byProject = presentations.get(durable);
  if (!byProject) {
    byProject = new Map();
    presentations.set(durable, byProject);
  }
  const previous = byProject.get(projectRoot);
  if (previous?.requestId === card.requestId) return previous.outcome;
  previous?.controller.abort();
  const controller = new AbortController();
  const outcome = openDesktopGraphCard(durable, view, card, source, window, controller.signal).finally(() => {
    if (byProject.get(projectRoot)?.controller === controller) byProject.delete(projectRoot);
  });
  byProject.set(projectRoot, { requestId: card.requestId, controller, outcome });
  return outcome;
}

async function openDesktopGraphCard(
  durable: DesktopDurableWorkflow, view: DurableProjection, card: DurableGraphCard,
  source: DurableCapabilityEvent["source"], window: GraphCardWindow, signal: AbortSignal,
): Promise<CustomerInputOutcome | null | undefined> {
  const profile = graphCardProfile(view);
  const payload = card.payload as CardPayload | undefined;
  const flowId = view.flowId;
  if (!profile || !payload || !flowId || card.cardKind !== profile.kind) return notPresented("The stored workflow card is incomplete.");
  const store = await durable.store();
  const decisionId = `decision-${card.requestId}`;
  const { projectRoot, ref } = view;
  const identity = { requestId: card.requestId, cardKind: card.cardKind, workflowId: ref.instanceId,
    stage: profile.stage, documentRefs: payload.documentRefs, ...(payload.intentId ? { intentId: payload.intentId } : {}) };
  const present = () => !signal.aborted && window.isRegistered();
  const persist: PersistDurableCustomerAnswer = async (answer, delegated, isMainFrameCurrent) => {
    const currentAuthority = () => present() && (delegated ? delegated.isCurrent() : isMainFrameCurrent?.() === true);
    if (!currentAuthority()) return staleCard("The workflow card's project or delegation is no longer current in this window.");
    const selected = answer.kind === "choice" ? [...answer.selected].sort() : [];
    const choice = delegated?.source.disposition === "revise" || delegated?.source.disposition === "reject" ? delegated.source.disposition
      : answer.kind === "confirm" ? answer.confirmed ? "confirm" : "reject" : selected[0];
    const decisionValues = choice && Object.hasOwn(payload.decisionOptions ?? {}, choice) ? payload.decisionOptions?.[choice] : undefined;
    const decision = choice === "revise" ? "revise" : choice === "reject" ? "reject"
      : decisionValues || profile.kind === "appointment" || choice === "confirm" || choice === "accept" ? "approve" : "reject";
    if (choice !== "revise" && choice !== "reject") {
      if (card.decisionProblem) return staleCard(card.decisionProblem);
      if (card.decisionFields && !decisionValues) return staleCard(mainT("main.durableWorkflow.pathA.confirmedDecisionSetRequired"));
    }
    const address = graphEventAddress(view);
    const key = `card-decided:${card.requestId}`;
    const recorded = store.listCapabilityEvents(ref).find(row => row.event.key === key);
    if (!recorded) {
      const current = await durable.lookup(ref);
      if (!current || current.status !== "waiting" || current.stepId !== view.stepId || current.attempt !== view.attempt) {
        return staleCard("The workflow advanced before this decision was recorded.");
      }
      const latest = graphCardRows(store, current).at(-1)?.event.input;
      if (latest?.kind !== "card-prepared" || latest.card.requestId !== card.requestId) return staleCard("This card has been superseded.");
      for (const doc of card.documents) {
        const actual = await store.readEvidence(projectRoot, doc.path);
        if (!actual.ok || actual.value.sha256 !== doc.sha256) return staleCard("A document changed after this card was prepared.");
      }
    }
    const resolved = taskEvent("request.resolved", {
      ...identity, decisionId, by: delegated ? "chief-delegated" : "customer", choice: decisionValues ? "accept" : choice ?? "reject",
      ...(delegated ? { actionSource: delegated.source } : {}),
      ...(profile.kind === "appointment" ? { source: "stage-a10" as const, targetRoleIds: selected }
        : { selectedOptionIds: selected }),
    });
    if (!currentAuthority()) return staleCard("The workflow card's project or delegation changed during validation.");
    const saved = await store.submitCapability(ref, { ...address, key, flowId,
      source: { roleId: delegated ? "chief" : "customer", originId: card.requestId },
      input: { kind: "card-decided", requestId: card.requestId, digest: card.digest, generation: card.generation,
        decision, authority: delegated ? "delegated-chief" : "customer", selected,
        ...(decisionValues ? { decisionValues } : {}),
        provenance: durableDecisionProvenance(card.generation, delegated),
        ...(delegated ? { delegationRevision: delegated.source.delegationRevision } : {}) } }, currentAuthority);
    if (!saved.ok || saved.value.state === "ignored") return { ok: false as const, message: saved.ok ? saved.value.reason ?? "Stale card." : saved.message };
    if (profile.kind === "intent-confirm" && decision === "approve") {
      durable.activate();
      return { ok: true as const, decisionId };
    }
    const state = await readTaskState(projectRoot);
    if (!state.events.some(event => event.kind === "request.resolved" && event.requestId === card.requestId)) {
      const mirror = await appendTaskEvent(projectRoot, resolved);
      if (!mirror.ok) return { ok: false as const, message: "The decision was saved. Retry to finish recording its document receipt." };
    }
    return { ok: true as const, decisionId };
  };
  const state = await readTaskState(projectRoot);
  if (!state.events.some(event => event.kind === "request.created" && event.requestId === card.requestId)) {
    const request = payload.request;
    await appendTaskEvent(projectRoot, taskEvent("request.created", {
      ...identity, flowId, sourceRoleId: source.roleId, title: request.title,
      options: request.kind === "choice" ? request.options : [],
    }));
  }
  if (signal.aborted || !window.isRegistered()) return notPresented("The workflow card's project is not open.");
  const runtime = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : "pi";
  const executeDecision = window.executeDecision;
  const host: ChiefDecisionHost | undefined = executeDecision ? {
    execute: (context, ...args) => {
      const source = payload.sourceRequest;
      let options = context.request.options;
      // Recreate only app-generated captions for the model; the saved customer card is presented verbatim.
      if (source?.kind === "choice" && card.cardKind === "proposal" && card.decisionFields) {
        options = concreteProposalCard(source, card.decisionFields, card.decisionProblem, workflowDecisionT).request.options;
      } else if (source?.kind === "choice" && card.cardKind === "intent-confirm" && card.decisionProblem) {
        options = intentRevisionCard(source, card.decisionProblem, workflowDecisionT).options;
      }
      return executeDecision({ ...context, request: { ...context.request, options } }, ...args);
    },
    prepare: async () => {
      const current = async () => {
        if (!present()) return false;
        const live = await durable.lookup(ref);
        const cardRow = live && graphCardRows(store, live).at(-1)?.event.input;
        if (cardRow?.kind !== "card-prepared" || cardRow.card.requestId !== card.requestId) return false;
        for (const doc of card.documents) {
          const file = await store.readEvidence(projectRoot, doc.path);
          if (!file.ok || file.value.sha256 !== doc.sha256) return false;
        }
        return present();
      };
      if (!await current() || card.cardKind === "appointment" && (!card.options?.length || card.documents.length < 1 + card.options.length * 3)) {
        throw new Error("The current workflow documents or role-activation evidence could not be verified.");
      }
      const context = await Promise.all(card.documents.map(async doc => {
        const bytes = await readFile(path.join(projectRoot, doc.path));
        if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256) throw new Error("A workflow decision document changed.");
        return `${doc.path}\n${bytes.toString("utf8").slice(0, 4_000)}`;
      }));
      if (!present()) throw new Error("The project or workflow card changed.");
      return { baseDigest: card.digest, context: context.join("\n\n").slice(0, 64_000), isCurrent: current,
        evidenceRefs: card.documents.map(doc => ({ ...doc, snapshotId: card.digest })) };
    },
  } : undefined;
  const outcome = await window.customer(payload.request, { roleId: source.roleId, runtime, projectRoot, requestId: card.requestId, sessionSignal: signal,
    governanceModel: "trio", durableDecision: { cardKind: card.cardKind, generation: card.generation, host }, persistWorkflowDecision: persist });
  if (card.cardKind !== "proposal" || payload.sourceRequest?.kind !== "choice" || outcome?.outcome !== "answered"
    || outcome.value.selected?.length !== 1) return outcome;
  const selectedOptionId = outcome.value.selected[0]!;
  if (!Object.hasOwn(payload.decisionOptions ?? {}, selectedOptionId)) return outcome;

  const recorded = graphCardDecision(store, view, card);
  const approval = recorded?.input;
  const invalidReceipt: CustomerInputOutcome = { outcome: "unavailable", reason: roleText.pathA.proposalDecisionReceiptUnverified };
  if (recorded?.stepId !== view.stepId || recorded.attempt !== view.attempt
    || approval?.decision !== "approve" || approval.generation !== card.generation || outcome.decisionId !== decisionId
    || approval.selected?.length !== 1 || approval.selected[0] !== selectedOptionId || !approval.decisionValues
    || proposalDecisionChoiceId(approval.decisionValues) !== selectedOptionId
    || !payload.sourceRequest.options.some(option => option.id === "accept")) return invalidReceipt;
  const provenance = approval.provenance;
  const action = outcome.actionSource;
  if (approval.authority === "delegated-chief") {
    if (action?.kind !== "chief-delegated" || provenance?.source !== "delegated-chief" || action.disposition !== "select"
      || action.originRoleId !== source.roleId || action.requestId !== card.requestId || action.baseDigest !== card.digest
      || action.selected?.length !== 1 || action.selected[0] !== selectedOptionId
      || action.delegationRevision !== provenance.delegationRevision || action.reason !== provenance.reason) return invalidReceipt;
  } else if (provenance?.source !== "customer" || action !== undefined) return invalidReceipt;
  return { ...outcome, value: { ...outcome.value, selected: ["accept"] }, durableProposalSelection: {
    requestId: card.requestId, baseDigest: card.digest, selectedOptionId, decisionValues: approval.decisionValues,
  } };
}
