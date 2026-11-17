import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  activateRoleDocumentsFixed, appendTaskEvent, archiveAcceptance, completeTeamPlanFixed, finalizeIntent,
  loadLatestRoster, parseTeamPlan, prepareIntent, readBasisLedger, readTaskState, taskBranchName, taskEvent,
  type CompleteTeamPlanFixedInput, type CompleteTeamPlanFixedResult, type FixedActivateRoleDocumentsDep, type TaskHandback,
} from "./workflow.ts";
import type { DurableCapability, DurableCapabilityEvent, DurableDomainOperation, DurableGraphCard, DurableProjection, DurableResult } from "../../src/model/durable-workflow.ts";
import type { CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, WorkflowDocumentRef, WorkflowStage } from "../../src/model/runtime.ts";
import type { ChiefDecisionHost, DesktopCustomerInputFn, PersistDurableCustomerAnswer } from "./customer-input.ts";
import { type DesktopDurableWorkflow } from "./durable-workflow.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { latestVersionedDoc } from "./session/shared/text.ts";
import type { LiveSession } from "./session/contracts/session-types.ts";
import { acquireProjectGitCriticalSection, createDurableGraphBaselineGitPort, durableBaselineOrigin, previewDurableMerge,
  verifyDurableGraphBaseline, type DurableBaselineOrigin } from "./workflow-git.ts";

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

export function graphRolePorts(input: {
  durable: DesktopDurableWorkflow;
  session: () => LiveSession | undefined;
  customer?: DesktopCustomerInputFn;
  isRegistered: () => boolean;
  chiefDecision?: ChiefDecisionHost;
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
        isCurrent: live.current, request, metadata, window: { customer: input.customer, isRegistered: input.isRegistered, chiefDecision: input.chiefDecision } });
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
          ...request, projectRoot: view.projectRoot, roster: { ...request.roster, sha256: request.roster.sha256! },
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
  const roster = await loadLatestRoster({ projectRoot, flowId: result.flowId });
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
        projectRoot, flowId, workflowId: ref.instanceId, operationId, actorRoleId: "convener",
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
  const criteria = standard?.documents?.find(doc => exactName("criteria", doc.path));
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
  documentRefs: WorkflowDocumentRef[];
  intentId?: string;
};

interface GraphCardWindow {
  customer: DesktopCustomerInputFn;
  isRegistered(): boolean;
  chiefDecision?: ChiefDecisionHost;
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
    const roster = await loadLatestRoster({ projectRoot: view.projectRoot, flowId });
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
    } else {
      const approved = store.listCapabilityEvents(view.ref).find(row => row.receipt.state === "consumed"
        && row.event.input.kind === "card-prepared" && row.event.input.card.cardKind === "intent-confirm"
        && row.event.input.card.documents.some(doc => doc.path === roster.roster.intent));
      if (!approved) return notPresented("The proposal requires the approved version of the intent.");
      const latestModules = await latestVersionedDoc(view.projectRoot, "docs/proposals", flowId, "modules");
      const modules = roster.roster.modulesDoc ?? (latestModules && `docs/proposals/${latestModules.name}`);
      if (!modules) return notPresented("The approved roster has no matching module document.");
      for (const [kind, file] of [["intent", roster.roster.intent], ["proposal", roster.roster.proposal],
        ["modules", modules], ["roster", roster.path], ["architecture", roster.roster.architecture]] as const) {
        const evidence = await store.readEvidence(view.projectRoot, file);
        if (!evidence.ok) return notPresented(evidence.message);
        refs.push({ kind, ...evidence.value, version: Number(/-v(\d+)\.md$/.exec(file)?.[1]) });
      }
    }
  }
  const options = request.kind === "choice" ? request.options.map(option => option.id) : [];
  const allowed = profile.kind === "intent-confirm" ? ["confirm", "revise", "reject"]
    : profile.kind === "proposal" ? ["accept", "revise", "reject"] : options;
  if (request.kind !== "choice" || options.length === 0 || new Set(options).size !== options.length
    || profile.kind !== "appointment" && (request.multiple === true || options.some(id => !allowed.includes(id)))) {
    return notPresented("The choices do not match the current workflow card.");
  }
  const address = graphEventAddress(view);
  const documents = refs.map(({ path, sha256 }) => ({ path, sha256 }));
  const payload = { request, documentRefs: refs, ...(intentId ? { intentId } : {}) };
  const digest = store.graphCardDigest(view.ref, { ...address, cardKind: profile.kind, documents, options, payload });
  const previous = graphCardRows(store, view);
  const last = previous.at(-1)?.event.input;
  if (last?.kind === "card-prepared" && last.card.digest === digest) {
    return presentDesktopGraphCard(durable, view, last.card, source, window);
  }
  if (!input.isCurrent() || !window.isRegistered()) return notPresented("The originating role turn changed while the card was prepared.");
  const generation = last?.kind === "card-prepared" ? last.card.generation + 1 : 1;
  const card: DurableGraphCard = { requestId: `dw-card:${digest}:${generation}`, digest, generation,
    cardKind: profile.kind, documents, options, payload };
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

export async function resumeDesktopGraphCard(
  durable: DesktopDurableWorkflow, view: DurableProjection, window: GraphCardWindow,
): Promise<boolean> {
  const store = await durable.store();
  if (!window.isRegistered()) return true;
  const last = graphCardRows(store, view).at(-1);
  if (last?.event.input.kind !== "card-prepared") return false;
  const card = last.event.input.card;
  const decision = store.listCapabilityEvents(view.ref).find(row => row.event.input.kind === "card-decided"
    && row.event.input.requestId === card.requestId && row.receipt.state !== "ignored");
  if (!decision) {
    for (const document of card.documents) {
      const current = await store.readEvidence(view.projectRoot, document.path);
      if (!current.ok || current.value.sha256 !== document.sha256) {
        closeDesktopGraphCard(durable, view.projectRoot);
        const payload = card.payload as CardPayload | undefined;
        if (payload) {
          void prepareDesktopGraphCard({ durable, view, request: payload.request,
            source: last.event.source, window, isCurrent: window.isRegistered }).then(result => {
            if (result?.outcome === "declined" && result.notPresented) store.block(view.ref, "workflow-card-evidence-drift", result.reason ?? "The customer card is waiting for valid current documents.");
          }).catch(() => undefined);
        }
        return true;
      }
    }
    void presentDesktopGraphCard(durable, view, card, last.event.source, window).catch(() => undefined);
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
  const persist: PersistDurableCustomerAnswer = async (answer, delegated) => {
    const currentAuthority = () => present() && (!delegated || delegated.isCurrent());
    if (!currentAuthority()) return staleCard("The workflow card's project or delegation is no longer current in this window.");
    const selected = answer.kind === "choice" ? [...answer.selected].sort() : [];
    const choice = delegated?.source.disposition === "revise" || delegated?.source.disposition === "reject" ? delegated.source.disposition
      : answer.kind === "confirm" ? answer.confirmed ? "confirm" : "reject" : selected[0];
    const decision = choice === "revise" ? "revise" : choice === "reject" ? "reject"
      : profile.kind === "appointment" || choice === "confirm" || choice === "accept" ? "approve" : "reject";
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
      ...identity, decisionId, by: delegated ? "chief-delegated" : "customer", choice: choice ?? "reject",
      ...(delegated ? { actionSource: delegated.source } : {}),
      ...(profile.kind === "appointment" ? { source: "stage-a10" as const, targetRoleIds: selected }
        : { selectedOptionIds: selected }),
    });
    if (!recorded && profile.kind === "intent-confirm" && decision === "approve") {
      const checked = await runGraphDomain(durable, view, "intent-card",
        () => finalizeIntent({ projectRoot, flowId, workflowId: ref.instanceId, event: resolved }));
      if (!checked.ok) return { ok: false as const, message: checked.message };
      if (!checked.value.ok) return { ok: false as const, message: checked.value.message };
    }
    if (!currentAuthority()) return staleCard("The workflow card's project or delegation changed during validation.");
    const saved = await store.submitCapability(ref, { ...address, key, flowId,
      source: { roleId: delegated ? "chief" : "customer", originId: card.requestId },
      input: { kind: "card-decided", requestId: card.requestId, digest: card.digest, generation: card.generation,
        decision, authority: delegated ? "delegated-chief" : "customer", selected,
        ...(delegated ? { delegationRevision: delegated.source.delegationRevision } : {}) } }, currentAuthority);
    if (!saved.ok || saved.value.state === "ignored") return { ok: false as const, message: saved.ok ? saved.value.reason ?? "Stale card." : saved.message };
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
  const chiefDecision: ChiefDecisionHost | undefined = window.chiefDecision && card.cardKind !== "intent-confirm" ? {
    execute: window.chiefDecision.execute,
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
      if (!await current()) throw new Error("The workflow decision materials are stale.");
      const context = await Promise.all(card.documents.map(async doc => `${doc.path}\n${(await readFile(path.join(projectRoot, doc.path), "utf8")).slice(0, 4_000)}`));
      return { baseDigest: card.digest, context: context.join("\n\n"), isCurrent: current,
        evidenceRefs: card.documents.map(doc => ({ ...doc, snapshotId: card.digest })) };
    },
  } : undefined;
  return window.customer(payload.request, { roleId: source.roleId, runtime, projectRoot, requestId: card.requestId, sessionSignal: signal,
    governanceModel: "trio", chiefDecision, persistWorkflowDecision: persist });
}
