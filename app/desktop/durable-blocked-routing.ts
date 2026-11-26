import path from "node:path";
import { stat } from "node:fs/promises";
import { createTranslator } from "../../src/common/shared/i18n/index.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { DURABLE_EVIDENCE_AUDIT_EXECUTOR } from "../../src/model/durable-workflow.ts";
import type { DurableA11Disposition, DurableImplementationItem, DurablePendingTask, DurableProjection, DurableResult, DurableVerificationCapabilitySnapshot, DurableVerificationPlan, DurableVerificationPreflightFn } from "../../src/model/durable-workflow.ts";
import type { CustomerInputRequest, ImplementationSelfTestObservation } from "../../src/model/runtime.ts";
import type { ImplementationRetestGuard } from "../../src/pipeline/orchestration/run-role.ts";
import { implementationTestRulesText, verifyImplementationRetestInputs } from "../../src/pipeline/orchestration/durable-workflow.ts";
import { BLOCKED_SCOPE_CARD_KIND, durableDecisionProvenance, type ChiefDecisionExecutor, type DesktopCustomerInputFn } from "./customer-input.ts";
import { a11ResumeKey, graphTurn, operationsTasks, preflightDesktopImplementationOwner, workflowTaskEffectMatches } from "./durable-workflow-a.ts";
import { durableHash, workspacePreparationSummary, type DesktopDurableWorkflow } from "./durable-workflow.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import type { LiveSession } from "./session/contracts/session-types.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { observeA11Git, recoverA11Index, sameA11GitSnapshot, type A11IndexExpectation } from "./workflow-git.ts";
import { prepareDesktopAcceptanceWorkspace } from "./durable-acceptance-workspace.ts";
import { mainT, type MainTranslate } from "./i18n.ts";
import roleText from "./durable-workflow-role-text.json" with { type: "json" };

export const A11_STOP_COMMAND = roleText.blocker.stopCommand;
const workflowDecisionT = createTranslator("zh-CN");

async function unavailableA11RetestCommand(projectRoot: string, candidateOid: string, modulePaths: readonly string[],
  requirements: DurableVerificationPlan["requirements"]): Promise<string | undefined> {
  for (const { id, command } of requirements) {
    if (!command) continue;
    const result = await verifyImplementationRetestInputs(projectRoot, candidateOid, modulePaths, command);
    if (!result.ok) return `${roleText.blocker.signedRetestRequirement[0]}${id}${roleText.blocker.signedRetestRequirement[1]}${result.message}`;
    const entry = command[0]!;
    if (path.isAbsolute(entry) && !(await stat(entry).catch(() => undefined))?.isFile()) {
      return `${roleText.blocker.retestEntryUnavailable[0]}${id}${roleText.blocker.retestEntryUnavailable[1]}${entry}${roleText.blocker.retestEntryUnavailable[2]}`;
    }
  }
}

export async function preflightDesktopA11RetestDelivery(store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>,
  view: DurableProjection, disposition: DurableA11Disposition): Promise<string | undefined> {
  const checked = await store.readEvidence(view.projectRoot, disposition.standard.path);
  if (!checked.ok || checked.value.sha256 !== disposition.standard.sha256) return roleText.blocker.signedCriteriaBytesUnverified;
  const observation = await observeA11Git(view.projectRoot);
  if (observation.branch !== disposition.branch || observation.head !== disposition.candidateOid || !observation.indexDigest
    || !observation.worktreeDigest || observation.lock || observation.trackedDirty || observation.stagedPaths.length
    || !observation.untrackedPaths || observation.untrackedPaths.length) return roleText.blocker.candidateAndIndexUnverified;
  const owner = operationsTasks(view).children.find(child => child.taskId === disposition.childTask.taskId
    && child.roleId === disposition.childTask.roleId && child.workOrder?.digest === disposition.workOrderDigest);
  if (!owner?.workOrder || !disposition.retest) return roleText.blocker.ownerAndOrderUnverified;
  return unavailableA11RetestCommand(view.projectRoot, disposition.candidateOid, owner.workOrder.paths, disposition.retest.missingRequirements);
}

export async function reconcileDesktopA11Disposition(durable: DesktopDurableWorkflow, view: DurableProjection,
  deps: SessionManagerDeps, key: string): Promise<DurableProjection | undefined> {
  const prior = view.a11Disposition!;
  const { projectRoot, ref } = view;
  const store = await durable.store();
  const registration = deps.getRegisteredProjectLifecycle?.(projectRoot);
  const parked = () => {
    const active = store.lookup(ref);
    return registration && deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === registration.selectionId
      && active?.status === "waiting" && active.engine === "healthy" && active.stepId === view.stepId && active.attempt === view.attempt
      && active.a11Disposition?.state === "parked" && active.a11Disposition.key === prior.key ? active : undefined;
  };
  if (!parked()) return;
  if (prior.retest) {
    const fresh = await observeA11Git(projectRoot);
    const child = operationsTasks(view).children.find(task => task.taskId === prior.childTask.taskId);
    const paths = child?.workOrder?.paths;
    const owner = child && paths && await preflightDesktopImplementationOwner(projectRoot, child.roleId, paths, deps);
    const runtime = view.metadata.runtime;
    const unavailable = !owner?.ok || !paths ? roleText.blocker.ownerAndWriteSetUnverified
      : prior.retest.pendingReportReview ? undefined
        : !isRuntimeKind(runtime) || runtime === "demo" || !deps.shellGate && (!deps.shellArming || !deps.shellOperatorChannel)
        ? roleText.blocker.governedShellUnassembled
        : !deps.readDurableReports ? roleText.blocker.formalHandbackUnassembled
          : await unavailableA11RetestCommand(projectRoot, prior.candidateOid, paths, prior.retest.missingRequirements);
    const observed = await store.observeA11Disposition(ref, prior.key,
      sameA11GitSnapshot(prior.observation, fresh) ? prior.observation : fresh, () => !!parked(), { unavailable });
    const active = parked();
    if (!observed.ok || !active) return;
    const current = () => {
      const latest = parked();
      return latest?.a11Disposition?.generation === observed.value.generation && latest.blockedRouting?.decision?.option !== "stop";
    };
    if (current() && !unavailable && (!observed.value.resumeExhausted || observed.value.retest?.pendingReportReview) && observed.value.standardState === "verified"
      && (!observed.value.confirmation || active.blockedRouting?.decision?.option === "wait")) {
      const resumed = await store.resumeA11Disposition(ref, prior.key, fresh, current, {});
      if (resumed.ok) { durable.activate(); return; }
    }
    return parked();
  }
  const receipt = () => store.listEffects(ref, "a11-index-recovery").find(effect => effect.intent.key === key);
  const fresh = await observeA11Git(projectRoot, prior.recovery?.paths);
  const observed = receipt()?.state === "claimed" ? { ok: true as const, value: prior }
    : await store.observeA11Disposition(ref, prior.key,
      sameA11GitSnapshot(prior.observation, fresh) ? prior.observation : fresh, () => !!parked());
  const active = parked();
  if (!observed.ok || !active) return;
  const disposition = observed.value;
  const current = () => {
    const latest = parked();
    return latest?.a11Disposition?.generation === disposition.generation && latest.blockedRouting?.decision?.option !== "stop";
  };
  const expected = receipt()?.intent.expected;
  const known = expected && typeof expected.branch === "string" && typeof expected.head === "string"
    && typeof expected.beforeIndex === "string" && typeof expected.afterIndex === "string" && typeof expected.worktreeDigest === "string"
    && Array.isArray(expected.paths) && typeof expected.lockPid === "string" && typeof expected.lockFileId === "string"
    ? expected as A11IndexExpectation : undefined;
  const settle = async (observation: Awaited<ReturnType<typeof observeA11Git>> | undefined) => {
    const effect = receipt();
    if (!effect) return false;
    if (effect.state === "succeeded") return !!observation;
    if (!observation && effect.state !== "claimed") return true;
    const outcome = observation && { branch: observation.branch, head: observation.head, indexDigest: observation.indexDigest,
      worktreeDigest: observation.worktreeDigest };
    if (outcome && (!outcome.branch || !outcome.head || !outcome.indexDigest || !outcome.worktreeDigest)) return false;
    const saved = await store.settleEffect(ref, { key, token: effect.token, outcome: observation ? "succeeded" : "unknown",
      evidence: observation ? "Verified the retained Git refs, candidate, complete index and worktree after-image."
        : "The retained Git refs, candidate or complete index state could not be proven.",
      ...(outcome ? { result: { branch: outcome.branch!, head: outcome.head!, indexDigest: outcome.indexDigest!,
        worktreeDigest: outcome.worktreeDigest! } } : {}) });
    return saved.ok;
  };
  const child = operationsTasks(active).children.find(task => task.taskId === disposition.childTask.taskId);
  let actual = disposition.observation;
  const owner = child?.workOrder && await preflightDesktopImplementationOwner(projectRoot, child.roleId, child.workOrder.paths, deps);
  if (current() && owner?.ok && disposition.standardState === "verified" && !disposition.resumeExhausted
    && (!disposition.confirmation || active.blockedRouting?.decision?.option === "wait")
    && (disposition.recovery || !fresh.stagedPaths.length)) {
    actual = await recoverA11Index({ projectRoot, branch: disposition.branch, head: disposition.candidateOid,
      recovery: disposition.recovery, expected: known, isCurrent: current, settle,
      allowManualWithExisting: active.blockedRouting?.decision?.option === "wait" && receipt()?.state !== "claimed",
      claim: async intent => {
        const operation = { key, kind: "a11-index-recovery" as const, stepId: active.stepId, attempt: active.attempt,
          task: disposition.childTask, expected: intent };
        const result = receipt() ? await store.retryA11RecoveryEffect(ref, operation, current)
          : await store.claimA11RecoveryEffect(ref, operation, current);
        return result.ok && result.value.execute;
      },
      resume: async observation => {
        const resumed = await store.resumeA11Disposition(ref, disposition.key, observation, current);
        if (resumed.ok) durable.activate();
        return resumed.ok;
      },
    });
  } else if (current() && !owner?.ok) {
    actual = { ...actual, reason: roleText.blocker.ownerAndWriteSetUnverified };
  }
  if (!parked()) return;
  await settle(undefined);
  await store.observeA11Disposition(ref, disposition.key, actual, current);
  return parked();
}

export async function openWorkflowStopConfirmation(durable: DesktopDurableWorkflow, projectRoot: string,
  isCurrent: () => boolean): Promise<DurableResult<true>> {
  const store = await durable.store();
  const parked = (await store.listProjections(projectRoot)).filter(view => view.status === "waiting" && view.engine === "healthy"
    && (view.a11Disposition?.state === "parked" || !!view.blockedRouting?.a12bPrepareKey)
    && (view.blockedRouting?.decision?.option === "wait" || view.a11Disposition?.confirmation === "stop"
      || view.acceptanceWorkspace?.preparation?.confirmation === "stop"));
  if (!isCurrent() || parked.length !== 1) return { ok: false, code: "workflow-stop-unavailable",
    message: mainT("main.durableWorkflow.blocker.stopConfirmationUnavailable") };
  const view = parked[0]!;
  const preparation = view.blockedRouting?.a12bPrepareKey;
  if (preparation) {
    const task = view.pendingTasks?.find(item => item.taskId === view.acceptanceWorkspace?.basis.assessmentTask.taskId && item.state === "pending");
    if (task) await prepareDesktopAcceptanceWorkspace(store, view, task);
    const requested = await store.requestAcceptancePreparationStop(view.ref, preparation, isCurrent);
    if (!requested.ok) return requested;
    durable.activate();
    return { ok: true, value: true };
  }
  const disposition = view.a11Disposition!;
  const fresh = await observeA11Git(projectRoot, disposition.recovery?.paths);
  const observed = await store.observeA11Disposition(view.ref, disposition.key,
    sameA11GitSnapshot(fresh, disposition.observation) ? disposition.observation : fresh, isCurrent);
  if (!observed.ok) return observed;
  const requested = await store.requestA11DispositionStop(view.ref, disposition.key, isCurrent);
  if (!requested.ok) return requested;
  durable.activate();
  return { ok: true, value: true };
}

export function desktopVerificationPreflight(deps: SessionManagerDeps, runtime: RuntimeKind): DurableVerificationPreflightFn {
  return async input => {
    const roles = deps.getListing(input.projectRoot)?.roles.filter(role => role.roleId === input.roleId);
    if (roles?.length !== 1) {
      return { ok: false, code: "workflow-verification-role-unavailable", message: mainT("main.durableWorkflow.blocker.independentAcceptanceOwnerUnverified") };
    }
    const realRuntime = runtime !== "demo";
    const shellWired = realRuntime && (!!deps.shellGate || !!deps.shellArming && !!deps.shellOperatorChannel);
    return { ok: true, value: { stage: input.stage, status: [
      { capability: "module-inspection", status: "available", reason: roleText.blocker.moduleInspectionCapability },
      { capability: "module-shell", status: shellWired ? "available" : "unavailable", reason: shellWired
        ? roleText.blocker.moduleShellCapability : roleText.blocker.governedShellApprovalUnavailable },
      { capability: "governed-commit", status: shellWired ? "available" : "unavailable", reason: shellWired
        ? roleText.blocker.governedCommitCapability : roleText.blocker.governedShellDeliveryUnavailable },
      ...(input.ref.executor === DURABLE_EVIDENCE_AUDIT_EXECUTOR ? [
        { capability: "external-execution" as const, status: "unavailable" as const, reason: roleText.blocker.externalExecutionUnverified },
        { capability: "approved-build" as const, status: "unavailable" as const,
          reason: roleText.blocker.approvedBuildUnverified },
      ] : [
        { capability: "workspace-build" as const, status: "unavailable" as const, reason: roleText.blocker.originalBuildReceiptOnly },
        { capability: "workspace-preview" as const, status: "unavailable" as const, reason: roleText.blocker.originalPreviewReceiptOnly },
        { capability: "workspace-browser" as const, status: "unavailable" as const, reason: roleText.blocker.originalBrowserAndCloseReceiptOnly },
      ]),
    ] } };
  };
}

export async function holdDesktopUnavailableAssessment(durable: DesktopDurableWorkflow, view: DurableProjection, pending: DurablePendingTask,
  deps: SessionManagerDeps, runtime: RuntimeKind, notice: (code: string, message: string) => Promise<void>): Promise<boolean> {
  const plan = view.verificationPlan;
  if (!view.blockedRoutingEnabled || !plan || pending.capability !== "independent-assessment") return false;
  const store = await durable.store();
  const registration = deps.getRegisteredProjectLifecycle?.(view.projectRoot);
  const isCurrent = () => {
    const live = store.lookup(view.ref);
    return !!registration && deps.getRegisteredProjectLifecycle?.(view.projectRoot)?.selectionId === registration.selectionId
      && live?.status === "waiting" && live.engine === "healthy" && live.stepId === view.stepId && live.attempt === view.attempt
      && live.pendingTasks?.some(task => task.taskId === pending.taskId && task.roleId === pending.roleId && task.state === "pending") === true;
  };
  if (!isCurrent()) return true;
  if (store.listEffects(view.ref, "model-send").some(effect => workflowTaskEffectMatches(effect, pending))) return false;
  if (!pending.reviewWritePath || !view.baseline) {
    await notice("workflow-verification-capabilities-missing", mainT("main.durableWorkflow.blocker.verificationBaselineOrOwnerUnverified"));
    return true;
  }
  const preflight = desktopVerificationPreflight(deps, runtime);
  const checked = await preflight({ ref: view.ref, projectRoot: view.projectRoot, roleId: pending.roleId, taskId: pending.taskId,
    stepId: pending.stepId, attempt: pending.attempt, flowId: pending.flowId, stage: "A12b", path: pending.reviewWritePath,
    baselineOid: view.baseline.oid, proposalDecisionDigest: view.proposalDecision?.selectionDigest });
  if (!checked.ok) {
    await notice(checked.code, checked.message);
    return true;
  }
  const unavailable = checked.value.status.find(row => row.status === "unavailable"
    && plan.requirements.some(item => item.stage === "A12b" && item.capability === row.capability));
  if (!unavailable) return !isCurrent();
  const prepared = await store.prepareBlockedScopeChange(view.ref, { task: pending.task, document: plan.standard, capability: unavailable.capability,
    reason: unavailable.reason ?? roleText.blocker.issuedVerificationCapabilityUnavailable }, isCurrent, preflight);
  if (prepared.ok) durable.activate();
  else await notice(prepared.code, prepared.message);
  return true;
}

export function verificationStandardPrompt(snapshot: DurableVerificationCapabilitySnapshot | undefined, workItems?: readonly DurableImplementationItem[]): string {
  if (!snapshot) return "";
  const audit = snapshot.status.some(row => row.capability === "external-execution" || row.capability === "approved-build");
  const status = snapshot.status.map(row => `${row.capability}: ${row.status}${row.reason ? `（${row.reason}）` : ""}`).join("\n");
  const approved = workItems?.map(item => `${item.id}（${item.roleId}，${item.paths.join("、")}）`).join("、");
  return `${roleText.blocker.verificationCapabilityInstruction[0]}${status}${roleText.blocker.verificationCapabilityInstruction[1]}` +
    roleText.blocker.criteriaVerificationSchema +
    roleText.blocker.criteriaPerRequirementRule +
    (approved ? `${roleText.blocker.approvedImplementationItems[0]}${approved}${roleText.blocker.approvedImplementationItems[1]}` : "") +
    (audit
      ? roleText.blocker.evidenceAuditRequirementRule +
        roleText.blocker.criteriaVerificationExample
      : roleText.blocker.frozenCriteriaLegacyEvidenceRule) +
    roleText.blocker.criteriaCompletionInstruction;
}

export function verificationAssessmentPrompt(plan: DurableVerificationPlan | undefined): string {
  if (!plan) return "";
  const checks = plan.requirements.filter(item => item.stage === "A12b").map(item => `${item.id} ${item.capability}（${item.evidence.join("、")}）`);
  return `${roleText.blocker.independentAcceptanceCriteriaInstruction[0]}${plan.standard.path}${roleText.blocker.independentAcceptanceCriteriaInstruction[1]}${plan.standard.sha256}${roleText.blocker.independentAcceptanceCriteriaInstruction[2]}${checks.join("；")}${roleText.blocker.independentAcceptanceCriteriaInstruction[3]}` +
    roleText.blocker.independentAcceptanceHandbackInstruction;
}

export function observeImplementationSelfTest(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined = () => undefined) {
  const getTurn = graphTurn(durable, session);
  return async (observation: ImplementationSelfTestObservation) => {
    const live = await getTurn();
    if (!live?.view.blockedRoutingEnabled || !live.current() || live.entry.roleId !== observation.roleId
      || live.source.originId !== observation.turnId || path.relative(live.view.projectRoot, observation.cwd)) return;
    const child = operationsTasks(live.view).children.find(task => task.state === "pending" && task.taskId === live.entry.assignedTaskId
      && task.taskId === live.delivery.intent.task?.taskId && task.taskId === live.source.parentTaskId && task.roleId === observation.roleId);
    if (!child?.workOrder) return;
    const store = await durable.store();
    const retest = live.view.a11Disposition;
    if (retest?.retest && retest.childTask.taskId === child.taskId) {
      const current = a11RetestTurnCurrent(store, live, observation.turnId);
      const stillCurrent = () => !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && current?.() === true;
      if (stillCurrent()) await store.recordImplementationSelfTest(live.view.ref, { task: child.task, observation }, stillCurrent);
      return;
    }
    if (observation.reviewedBy && observation.writeAuditPassed === true && observation.outcome.exitCode === 0
      && !observation.outcome.error && !observation.outcome.signal && !observation.outcome.timedOut) {
      await store.recordImplementationSelfTest(live.view.ref, { task: child.task, observation }, live.current);
    }
  };
}

function currentEvidenceCollectionTurn(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined) {
  const getTurn = graphTurn(durable, session);
  return async (turnId: string) => {
    const live = await getTurn();
    const task = live?.delivery.intent.task;
    const audit = live?.view.evidenceAudit;
    if (!live || !task || !audit || task.taskId !== live.entry.assignedTaskId || task.taskId !== live.source.parentTaskId
      || live.source.originId !== turnId || audit.collector?.taskId !== task.taskId) return;
    const pending = live.view.pendingTasks?.find(row => row.taskId === task.taskId && row.roleId === task.roleId && row.state === "pending");
    const order = pending?.evidenceWorkOrder;
    if (!pending || !order || order.basis.generation !== audit.basis.generation) return;
    const store = await durable.store();
    const current = () => {
      const actual = store.lookup(live.view.ref);
      return !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && live.current()
        && actual?.engine === "healthy" && actual.stepId === pending.stepId && actual.attempt === pending.attempt
        && actual.evidenceAudit?.basis.generation === order.basis.generation && actual.evidenceAudit.collector?.taskId === task.taskId
        && actual.evidenceAudit.basis.candidateOid === order.basis.candidateOid && actual.evidenceAudit.basis.branch === order.basis.branch
        && actual.evidenceAudit.basis.standard.sha256 === order.basis.standard.sha256
        && actual.pendingTasks?.some(row => row.taskId === task.taskId && row.state === "pending") === true
        && store.evidenceAuditAccess(live.view.ref, task) === "collect"
        && store.listEffects(live.view.ref, "model-send").some(row => row.intent.key === live.delivery.intent.key
          && row.state === "succeeded" && row.result?.result?.turnId === turnId && workflowTaskEffectMatches(row, pending));
    };
    if (current()) return { live, task, order, audit, store, current };
  };
}

export function observeEvidenceCollectionExecution(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined) {
  const getCurrent = currentEvidenceCollectionTurn(durable, session, selectionId);
  return async (observation: ImplementationSelfTestObservation) => {
    const context = await getCurrent(observation.turnId);
    if (!context || context.task.roleId !== observation.roleId || path.relative(context.live.view.projectRoot, observation.cwd)) return;
    const { live, task, store, current } = context;
    const saved = await store.recordEvidenceExecution(live.view.ref, { task, observation }, current);
    if (saved.ok && saved.value.state !== "ignored") return { evidenceExecutionRef: saved.value.key };
  };
}

async function observeEvidenceCollectionGit(view: DurableProjection, writePaths: readonly string[],
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>) {
  const { projectRoot, ref } = view;
  const actual = await observeA11Git(projectRoot);
  const source = view.definitionSource === "project" ? view.definitionFile : undefined;
  let verifiedDefinitionPath: string | undefined;
  if (source && actual.untrackedPaths?.includes(source)) {
    const entries = await store.listDefinitions(projectRoot);
    const matches = entries.filter(entry => entry.source === "project" && entry.file === source && entry.definition?.id === ref.definitionId
      && entry.definition.version === ref.definitionVersion && entry.definition.digest === ref.definitionDigest);
    if (matches.length === 1) verifiedDefinitionPath = source;
  }
  const inEvidenceScope = (file: string) => file === verifiedDefinitionPath
    || writePaths.some(scope => file === scope || scope.endsWith("/") && file.startsWith(scope));
  const approved = actual.untrackedPaths?.filter(inEvidenceScope) ?? [];
  if (!approved.length) return actual;
  // Prove the current bytes of authorized evidence before classifying other untracked changes.
  // The strict whole-tree audit also compares every evidence file across the command.
  const observed = await observeA11Git(projectRoot, approved);
  if (observed.branch !== actual.branch || observed.head !== actual.head || observed.indexDigest !== actual.indexDigest
    || !observed.files || observed.files.length !== approved.length
    || JSON.stringify(observed.untrackedPaths?.filter(inEvidenceScope)) !== JSON.stringify(approved)) {
    return { ...observed, trackedDirty: true, reason: mainT("main.durableWorkflow.blocker.approvedEvidenceFileUnverified") };
  }
  return { ...observed, untrackedPaths: observed.untrackedPaths?.filter(file => !inEvidenceScope(file)) };
}

export function desktopEvidenceCollectionCommandGuard(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined): ImplementationRetestGuard {
  const getCurrent = currentEvidenceCollectionTurn(durable, session, selectionId);
  return async ({ turnId, toolCallId }) => {
    const context = toolCallId ? await getCurrent(turnId) : undefined;
    if (!context) return { mode: "denied" };
    const { live, order, audit, store, current } = context;
    const requirements = audit.requirements.filter(row => order.requirementIds.includes(row.id) && row.capability === "module-shell" && row.source === "task-command" && row.command);
    const approvedCommands = requirements.flatMap(row => row.command ? [row.command] : []);
    if (!approvedCommands.length) return { mode: "denied" };
    const approvedProduction = live.view.implementationItems?.flatMap(item => item.paths) ?? live.view.scope?.writeSets.flatMap(set => set.paths) ?? [];
    const modulePaths = [...new Set([...approvedProduction, ...requirements.flatMap(row => row.paths ?? [])])];
    const workOrderDigest = durableHash(JSON.stringify(order));
    return { mode: "retest", key: `evidence-command:${order.task.taskId}:${order.basis.generation}`,
      workOrderDigest, candidateOid: order.basis.candidateOid, branch: order.basis.branch, standard: order.basis.standard,
      modulePaths, approvedCommands, isCurrent: current, observeGit: () => observeEvidenceCollectionGit(live.view, order.writePaths, store) };
  };
}

type GraphTurn = NonNullable<Awaited<ReturnType<ReturnType<typeof graphTurn>>>>;

function a11RetestTurnCurrent(store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, live: GraphTurn, turnId: string) {
  const { ref, stepId, attempt } = live.view;
  const disposition = live.view.a11Disposition;
  const key = disposition && `model:${a11ResumeKey(disposition.key)}`;
  const child = operationsTasks(live.view).children.find(task => task.taskId === disposition?.childTask.taskId
    && task.state === "pending" && task.roleId === live.entry.roleId && task.workOrder?.digest === disposition.workOrderDigest);
  if (!disposition?.retest || disposition.state !== "resumed" || !child || turnId !== live.source.originId
    || live.delivery.intent.key !== key || live.delivery.assignmentTaskId !== child.taskId || live.source.parentTaskId !== child.taskId
    || live.entry.assignedTaskId !== child.taskId || live.delivery.intent.task?.taskId !== child.taskId) return undefined;
  return () => {
    const current = store.lookup(ref);
    const active = current?.a11Disposition;
    return live.current() && current?.engine === "healthy" && current.status === "waiting" && current.stepId === stepId
      && current.attempt === attempt && active?.key === disposition.key && active.state === "resumed" && active.generation === disposition.generation
      && current.pendingTasks?.some(task => task.taskId === child.taskId && task.state === "pending") === true
      && store.listEffects(ref, "model-send").some(effect => effect.intent.key === key && effect.state === "succeeded"
        && effect.result?.result?.turnId === turnId && effect.intent.expected?.runtime === live.entry.runtime && workflowTaskEffectMatches(effect, child));
  };
}

export function desktopImplementationRetestGuard(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  projectRoot: string, taskId: string, selectionId: () => string | undefined): ImplementationRetestGuard {
  const getTurn = graphTurn(durable, session);
  return async ({ turnId, toolCallId }) => {
    const live = await getTurn();
    if (!live || live.source.parentTaskId !== taskId
      || live.entry.assignedTaskId !== taskId || live.delivery.intent.task?.taskId !== taskId
      || !operationsTasks(live.view).children.some(task => task.taskId === taskId && task.state === "pending")) return { mode: "denied" };
    const disposition = live.view.a11Disposition;
    if (!disposition?.retest || disposition.childTask.taskId !== taskId) return { mode: "ordinary" };
    if (!toolCallId || live.source.originId !== turnId) return { mode: "denied" };
    const current = a11RetestTurnCurrent(await durable.store(), live, turnId);
    const isCurrent = () => !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && current?.() === true;
    if (!isCurrent()) return { mode: "denied" };
    const child = operationsTasks(live.view).children.find(task => task.taskId === taskId && task.workOrder?.digest === disposition.workOrderDigest);
    if (!child?.workOrder) return { mode: "denied" };
    return { mode: "retest", key: disposition.key, candidateOid: disposition.candidateOid, branch: disposition.branch,
      workOrderDigest: disposition.workOrderDigest, standard: disposition.standard,
      approvedCommands: disposition.retest.missingRequirements.map(req => req.command),
      modulePaths: child.workOrder.paths, isCurrent, observeGit: () => observeA11Git(projectRoot) };
  };
}

type OpenScope = { requestId: string; controller: AbortController };
const cards = new WeakMap<DesktopDurableWorkflow, Map<string, OpenScope>>();

export function closeBlockedScopeCard(durable: DesktopDurableWorkflow, projectRoot: string): void {
  const registered = cards.get(durable);
  const card = registered?.get(projectRoot);
  registered?.delete(projectRoot);
  card?.controller.abort();
}

/** B2 keeps the existing main-window choice surface and binds a separate evidence write range to the original scope. */
export async function presentB2EvidenceScopeCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  chief: string;
  customer: DesktopCustomerInputFn;
  isRegistered: () => boolean;
}): Promise<void> {
  const { durable, view, chief, customer, isRegistered } = input;
  const choice = view.b2EvidenceDecision;
  const { projectRoot, ref } = view;
  if (!choice || choice.decision || !isRegistered()) return;
  const { binding, scopeId, roleId, writePaths, requirements } = choice;
  let registered = cards.get(durable);
  if (!registered) {
    registered = new Map();
    cards.set(durable, registered);
  }
  if (registered.get(projectRoot)?.requestId === binding.requestId) return;
  closeBlockedScopeCard(durable, projectRoot);
  const controller = new AbortController();
  const card = { requestId: binding.requestId, controller };
  registered.set(projectRoot, card);
  const release = () => { if (registered.get(projectRoot) === card) registered.delete(projectRoot); };
  try {
    const store = await durable.store();
    const current = () => {
      if (controller.signal.aborted || !isRegistered() || registered.get(projectRoot) !== card) return false;
      const live = store.lookup(ref);
      const actual = live?.b2EvidenceDecision;
      return live?.status === "waiting" && live.engine === "healthy" && actual?.scopeId === scopeId && !actual.decision
        && actual.binding.requestId === binding.requestId && actual.binding.generation === binding.generation && actual.binding.digest === binding.digest;
    };
    if (!current()) { release(); return; }
    const running = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : undefined;
    const details = requirements.map(item => `${item.requirementId}（${item.reason}${item.paths?.length ? mainT("main.durableWorkflow.blocker.b2Originals", { paths: item.paths.join("、") }) : ""}）`).join("、");
    const candidates = view.scopeDecision?.candidates.join("、");
    void Promise.resolve(customer({
      kind: "choice", cardKind: BLOCKED_SCOPE_CARD_KIND, application: true, sourceRoleId: "application", flowId: view.flowId,
      title: mainT("main.durableWorkflow.blocker.b2EvidenceScopeTitle"),
      question: mainT("main.durableWorkflow.blocker.b2EvidenceScopeQuestion"),
      preview: mainT("main.durableWorkflow.blocker.b2EvidenceScopePreview", { scopeId, candidates: candidates ? mainT("main.durableWorkflow.blocker.b2ImplementationPaths", { paths: candidates }) : "", roleId, paths: writePaths.join("、"), details }),
      options: [
        { id: "route", label: mainT("main.durableWorkflow.blocker.approveEvidenceScope"), description: mainT("main.durableWorkflow.blocker.approveEvidenceScopeDescription") },
        { id: "wait", label: mainT("main.durableWorkflow.blocker.declineEvidenceScope"), description: mainT("main.durableWorkflow.blocker.declineEvidenceScopeDescription") },
      ],
    }, {
      roleId: chief, runtime: running, projectRoot, requestId: binding.requestId, sessionSignal: controller.signal, governanceModel: "trio",
      durableDecision: { cardKind: BLOCKED_SCOPE_CARD_KIND, generation: binding.generation, customerOnly: true },
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const authorized = () => !delegated && (isMainFrameCurrent?.() === true) && current();
        const selected = answer.kind === "choice" && answer.selected.length === 1 ? answer.selected[0] : undefined;
        const action = selected === "route" ? "approve" : selected === "wait" ? "decline" : undefined;
        if (!action || !authorized()) return { ok: false, stale: !current(), message: mainT("main.durableWorkflow.blocker.b2CurrentWindowScopeRequired") };
        const result = await store.decideB2EvidenceScope(ref, { ...binding, action, provenance: durableDecisionProvenance(binding.generation) }, authorized);
        if (!result.ok) return { ok: false, stale: !current(), message: result.message };
        durable.activate();
        return { ok: true, decisionId: binding.requestId };
      },
    })).catch(() => undefined).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}

function evidenceScopePreview(view: DurableProjection, scope: NonNullable<DurableProjection["blockedRouting"]>, t: MainTranslate): string {
  const audit = view.evidenceAudit;
  if (!audit) return "";
  const sources = scope.evidenceRoute?.artifacts.map(item => `${item.requirementId}（${item.path || item.receiptId}）`).join("、");
  const proposed = scope.evidenceCompromise;
  return [
    "",
    t("main.durableWorkflow.blocker.auditEvidenceMissing", {
      generation: audit.basis.generation,
      requirements: audit.missing.map(item => `${item.requirementId}（${item.reason}）`).join("、"),
    }),
    ...(sources ? [t("main.durableWorkflow.blocker.equivalentEvidenceRoute", { roleId: String(scope.evidenceRoute?.roleId), sources })] : []),
    ...(proposed ? [t("main.durableWorkflow.blocker.criteriaScopeRevision", {
      requirements: proposed.requirementIds.join("、"), paths: proposed.paths.join("、"),
    })] : []),
  ].join("\n");
}

export async function presentBlockedScopeCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  chief: string;
  customer: DesktopCustomerInputFn;
  executeDecision?: ChiefDecisionExecutor;
  isRegistered: () => boolean;
}): Promise<void> {
  const { durable, view, chief, customer, executeDecision, isRegistered } = input;
  const scope = view.blockedRouting;
  if (scope?.kind !== "scope-change" || scope.decision || !isRegistered()) return;
  const disposition = scope.a11DispositionKey && view.a11Disposition?.key === scope.a11DispositionKey ? view.a11Disposition : undefined;
  const preparation = scope.a12bPrepareKey && view.acceptanceWorkspace?.preparation?.prepareKey === scope.a12bPrepareKey
    ? view.acceptanceWorkspace.preparation : undefined;
  const evidence = scope.evidenceAuditKey ? view.evidenceAudit : undefined;
  const confirmation = disposition?.confirmation === "stop" || preparation?.confirmation === "stop";
  const item = disposition && view.pendingTasks?.find(task => task.taskId === disposition.childTask.taskId);
  const visiblePaths = disposition?.observation.stagedPaths.filter(file =>
    item?.workOrder?.paths.some(allowed => file === allowed || allowed.endsWith("/") && file.startsWith(allowed))).slice(0, 32) ?? [];
  const { projectRoot, ref } = view;
  const { requestId, digest, generation } = scope.binding;
  let registered = cards.get(durable);
  if (!registered) {
    registered = new Map();
    cards.set(durable, registered);
  }
  if (registered.get(projectRoot)?.requestId === requestId) return;
  closeBlockedScopeCard(durable, projectRoot);
  const controller = new AbortController();
  const card = { requestId, controller };
  registered.set(projectRoot, card);
  const release = () => {
    if (registered.get(projectRoot) === card) registered.delete(projectRoot);
  };
  try {
    const store = await durable.store();
    const current = () => {
      if (controller.signal.aborted || !isRegistered() || registered.get(projectRoot) !== card) return false;
      const live = store.lookup(ref);
      const liveScope = live?.blockedRouting;
      return live?.status === "waiting" && live.engine === "healthy" && live.stepId === view.stepId && live.attempt === view.attempt
        && liveScope?.kind === "scope-change" && !liveScope.decision && liveScope.binding.requestId === requestId
        && liveScope.binding.digest === digest && liveScope.binding.generation === generation && liveScope.governanceDigest === scope.governanceDigest;
    };
    const materialsCurrent = async () => {
      if (!current()) return false;
      if (scope.evidenceAuditKey) return current();
      if (disposition) {
        const fresh = await observeA11Git(projectRoot, disposition.recovery?.paths);
        if (!current()) return false;
        const actual = sameA11GitSnapshot(disposition.observation, fresh) ? disposition.observation : fresh;
        const refreshed = await store.observeA11Disposition(ref, disposition.key, actual, current);
        if (refreshed.ok && !current()) durable.activate();
        return refreshed.ok && current();
      }
      if (preparation) {
        const task = view.pendingTasks?.find(item => item.taskId === preparation.basis.assessmentTask.taskId && item.state === "pending");
        if (!task) return false;
        await prepareDesktopAcceptanceWorkspace(store, view, task);
        if (!current()) durable.activate();
        return current();
      }
      const checked = await store.readEvidence(projectRoot, scope.document.path);
      return checked.ok && checked.value.sha256 === scope.document.sha256 && current();
    };
    if (!await materialsCurrent()) { release(); return; }
    const titleKey = confirmation ? "main.durableWorkflow.blocker.confirmStopTitle" : disposition
      ? disposition.retest ? "main.durableWorkflow.blocker.a11MissingSelfTestReceiptTitle" : "main.durableWorkflow.blocker.a11GitBlockTitle"
      : "main.durableWorkflow.blocker.acceptanceBlockTitle";
    const preview = (t: MainTranslate) => {
      const basis = t("main.durableWorkflow.blocker.decisionBasis", {
        step: view.stepName, attempt: view.attempt, path: scope.document.path, sha256: scope.document.sha256,
      }) + (scope.candidateOid ? t("main.durableWorkflow.blocker.candidateCommit", { candidate: scope.candidateOid }) : "");
      if (disposition) return basis + [
        t("main.durableWorkflow.blocker.a11BlockedWorkItem", {
          workItem: item?.workItemId ?? disposition.childTask.taskId, roleId: disposition.childTask.roleId, branch: disposition.branch,
        }),
        ...(visiblePaths.length ? [t("main.durableWorkflow.blocker.a11StagedPaths", { paths: visiblePaths.join("、") })] : []),
        ...(disposition.retest ? [t("main.durableWorkflow.blocker.a11RemainingRequirements", {
          requirements: implementationTestRulesText(disposition.retest.missingRequirements),
        })] : []),
        t("main.durableWorkflow.blocker.stopWhileWaiting", { command: A11_STOP_COMMAND }),
      ].join("");
      if (preparation) {
        const { rework } = preparation;
        return basis + t("main.durableWorkflow.blocker.preparationObservation", {
          generation: preparation.generation, command: A11_STOP_COMMAND,
          rework: rework ? t("main.durableWorkflow.blocker.candidatePreparationRework", {
            workItem: rework.workItemId, roleId: rework.ownerTask.roleId, paths: rework.paths.join("、"),
          }) : "",
        });
      }
      if (evidence) return basis + evidenceScopePreview(view, scope, t);
      return basis + t(scope.options.some(option => option.id === "revise")
        ? "main.durableWorkflow.blocker.requestRevisionNextAction" : "main.durableWorkflow.blocker.originalRevisionEntryUnavailable");
    };
    const request: CustomerInputRequest = { kind: "choice", cardKind: BLOCKED_SCOPE_CARD_KIND, application: true, sourceRoleId: "application",
      flowId: view.flowId, title: mainT(titleKey),
      question: preparation ? workspacePreparationSummary(view) ?? scope.reason : mainT("main.durableWorkflow.blocker.decisionRequired", { reason: scope.reason }),
      preview: preview(mainT),
      options: scope.options.map(option => ({ id: option.id, label: option.label, description: option.impact })) };
    const runtime = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : undefined;
    void Promise.resolve(customer(request, { roleId: chief, runtime, projectRoot, requestId, sessionSignal: controller.signal,
      governanceModel: "trio", durableDecision: { cardKind: BLOCKED_SCOPE_CARD_KIND, generation,
        ...(confirmation ? { customerOnly: true } : {}),
        host: !confirmation && executeDecision ? {
        execute: (context, ...args) => executeDecision({
          ...context, request: { ...context.request, question: workflowDecisionT(titleKey) },
        }, ...args),
        prepare: async () => {
          if (!await materialsCurrent()) throw new Error(roleText.blocker.decisionEvidenceChanged);
          return { baseDigest: digest, isCurrent: materialsCurrent, evidenceRefs: [{ ...scope.document, snapshotId: digest }],
            context: JSON.stringify({ reason: scope.reason, origin: scope.origin, preview: preview(workflowDecisionT), options: scope.options }) };
        },
      } : undefined },
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const authorized = () => current() && (delegated ? delegated.isCurrent() : isMainFrameCurrent?.() === true);
        const option = answer.kind === "choice" && answer.selected.length === 1 ? scope.options.find(item => item.id === answer.selected[0])?.id : undefined;
        if (!option || confirmation && delegated || !authorized() || !await materialsCurrent() || !authorized()) {
          return { ok: false, stale: !current(), message: mainT("main.durableWorkflow.blocker.validProjectOptionRequired") };
        }
        const result = await store.decideBlockedScopeChange(ref, { requestId, digest, generation, option,
          provenance: durableDecisionProvenance(generation, delegated) }, authorized);
        if (!result.ok) return { ok: false, stale: !current(), message: result.message };
        durable.activate();
        return { ok: true, decisionId: requestId };
      },
    })).catch(() => undefined).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}
