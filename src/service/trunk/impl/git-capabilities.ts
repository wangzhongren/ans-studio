// Query policy preparation and current-basis validation. Mutation stays blocked without real protection/serialization proof.
import { createHash } from "node:crypto";
import { isGitBasis, isGitOid, isGitLiteralPath, type GitCapabilityResult, type GitOid, type GitBasis } from "../../../model/trunk.ts";
import type { GitQueryRequest, TaskClosedEvent } from "../../../model/runtime.ts";
import { createGitQueryPort, createGitCandidateStore, createGitRefStore, readGitCandidateEvidence, readGitDeliveryEvidence, readGitPublishedReadEvidence, planGitRefPublication, createProjectTrunkStore, readGitInitializationFacts, initializeGitRepository, planGitRepositoryInitialization, planEmptyGitCandidate, readGitInitializationRecord, writeGitInitializationRecord, checkGitHostAction, type GitInitializationRecord, type GitTaskCandidateSource, type GitIntegrationSource, type GitRevertSource, type GitRefJournal } from "../../../provider/trunk/public/trunk-store.ts";
import { readOperationEvents, acquireVersionLock, ownsVersionLock, createGuardFreezeRegistry } from "../../../provider/version-change/public/version-change-store.ts";
import { prepareAssignedTaskWriteScope, inspectAssignedTask, readRunEvidence, prepareRoleDispatch, readAssignedReviewContext, prepareVerifiedDelivery, readTaskProcessSource, prepareRevertOwnerGrants, inspectExecutionCodeSource } from "./apply-journal.ts";
import { parseProjectRoster } from "../../../common/编排/workflow-preconditions.ts";
import { validateTaskStateEvent } from "../../../common/编排/task-state.ts";
import { isRunGitBases } from "../../../common/编排/run-manifest.ts";
import type { GitCapabilityService, GitQueryContext, PreparedGitQuery, PreparedGitInitialization, PreparedGitWorkerCommit, PreparedGitDelivery } from "../abstract/trunk-service.ts";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonical(value)]));
  return value;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function createGitCapabilityService(input: { projectRoot: string; context?: GitQueryContext }): GitCapabilityService {
  const port = createGitQueryPort(input.projectRoot), store = createProjectTrunkStore(input.projectRoot), candidates = createGitCandidateStore(input.projectRoot);
  const failure = (operationId: string, repoId: string, code: string, message: string): GitCapabilityResult => ({ operationId, repoId, status: "blocked", code, message });
  const workerPreparations = new WeakMap<PreparedGitWorkerCommit, string>();
  const deliveryPreparations = new WeakMap<PreparedGitDelivery, string>();
  async function prepareDelivery(request: PreparedGitDelivery["request"]): ReturnType<GitCapabilityService["prepareDelivery"]> {
    let repoId = "unavailable";
    const reject = (code: string, message: string) => ({ ok: false as const, result: failure(request.operationId, repoId, code, message) });
    try {
      const identity = await port.inspect(); repoId = identity.repoId;
      const context = input.context;
      if (request.target !== "delivery") return reject("git-document-publication-requires-business-context", "Document publication uses the actual bounded document business transaction");
      if (context?.actorRoleId !== "convener" || !context.taskId || !context.runId || !isGitBasis(request.expected) || !isGitOid(request.candidate)
        || !request.operationId?.trim() || request.operationId.length > 200 || !request.creatorCloseOperationId?.trim())
        return reject("git-delivery-request-invalid", "An actual live convener assignment, expected delivery ref and original quality-child close are required");
      const authority = await prepareVerifiedDelivery({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) },
        { taskId: context.taskId, runId: context.runId, candidate: request.candidate, creatorCloseOperationId: request.creatorCloseOperationId });
      if (!authority.ok) return reject("git-delivery-quality-unproven", authority.message ?? authority.code);
      const source = authority.value, ref = `refs/ans/delivery/${source.flowId}`;
      const processSource = await readTaskProcessSource({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) },
        { taskId: context.taskId, actorRoleId: "convener", flowId: source.flowId, runId: context.runId });
      if (!processSource.ok) return reject("git-delivery-current-source-unproven", processSource.message ?? processSource.code);
      if (request.expected.ref !== ref || JSON.stringify(request.criteria) !== JSON.stringify(source.criteria) || JSON.stringify(request.evidence) !== JSON.stringify(source.evidence))
        return reject("git-delivery-evidence-conflict", "Expected criteria/artifacts/ref differ from the actual independent quality and frozen run");
      const proof = await readGitCandidateEvidence(input.projectRoot, source.candidateOperationId, request.candidate);
      if (!proof.ok || (proof.value.journal.candidateSource?.kind !== "run-integration" && proof.value.journal.candidateSource?.kind !== "run-revert") || proof.value.journalFile.sha256 !== source.candidateJournalSha256)
        return reject("git-delivery-candidate-unproven", proof.ok ? "Candidate source/journal changed" : proof.message ?? proof.reason);
      const integration = proof.value.journal.candidateSource, codeBasis = integration.base.oid;
      if (!codeBasis) return reject("git-delivery-code-basis-unavailable", "The original integration code basis is required");
      const currentManifest = await store.readManifest(); if (!currentManifest.ok) return reject("git-delivery-authority-unavailable", currentManifest.message ?? currentManifest.reason);
      const currentGrants = [];
      for (const contributor of integration.kind === "run-integration" ? integration.contributors : []) {
        const owner = contributor.source, dispatch = await prepareRoleDispatch({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) },
          { fromRoleId: "convener", targetRoleId: owner.roleId, flowId: source.flowId, runId: source.runId, moduleId: owner.moduleId });
        const active = currentManifest.value.activeRoles?.[owner.roleId], files = active ? await store.readActiveRoleEvidence!(active) : undefined;
        const authorizationFile = files?.ok ? files.value.files.find(file => file.path === active!.authorizationRef.path && file.sha256 === active!.authorizationRef.sha256) : undefined;
        const auth: unknown = authorizationFile ? JSON.parse(Buffer.from(authorizationFile.bytesBase64, "base64").toString("utf8")) : undefined;
        if (!dispatch.ok || dispatch.value.kind !== "execution" || !auth || typeof auth !== "object" || !("schema" in auth) || auth.schema !== "role-authorization/v1"
          || !("roleId" in auth) || auth.roleId !== owner.roleId || !("flowId" in auth) || auth.flowId !== source.flowId || !("writesets" in auth) || !Array.isArray(auth.writesets))
          return reject("git-delivery-authority-unavailable", "Current Active and original frozen module authority must both remain applicable");
        const grants = auth.writesets;
        if (owner.files.some(file => !dispatch.value.modulePaths?.some(path => path === file.path || path.endsWith("/") && file.path.startsWith(path))
          || !grants.some(path => typeof path === "string" && (path === file.path || path.endsWith("/") && file.path.startsWith(path)))))
          return reject("git-delivery-authority-withdrawn", "A final contribution lies outside current Active and frozen ownership");
        currentGrants.push([owner.roleId, authorizationFile!.sha256, dispatch.value.basisDigest]);
      }
      if (integration.kind === "run-revert") {
        const run = await readRunEvidence({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, source.runId);
        if (!run.ok) return reject("git-delivery-revert-source-unavailable", run.message ?? run.code);
        const grants = await prepareRevertOwnerGrants({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, run.value, integration.files.map(file => file.path));
        if (!grants.ok || digest(grants.value) !== digest(integration.ownerGrants)) return reject("git-delivery-authority-withdrawn", grants.ok ? "Current revert owner authority differs" : grants.message ?? grants.code);
        currentGrants.push(...integration.ownerGrants.map(grant => [grant.ownerRoleId, grant.evidenceDigest]));
      }
      const current = await candidates.readRef(ref), prior = await createGitRefStore(input.projectRoot).readJournal(request.operationId);
      if (JSON.stringify(current) !== JSON.stringify(request.expected.oid)
        && !(prior && prior.phase !== "business-prepared" && prior.process?.termination === "exited" && prior.process.exitCode === 0
          && JSON.stringify(current) === JSON.stringify(request.candidate) && JSON.stringify(prior.deliverySource) === JSON.stringify(source)))
        return reject("git-delivery-ref-conflict", "The actual delivery ref differs from its expected old value");
      if (request.expected.oid) {
        const previous = (await createGitRefStore(input.projectRoot).listJournals()).filter(row => row.phase === "published" && row.ref === ref
          && JSON.stringify(row.newOid) === JSON.stringify(request.expected.oid) && row.deliverySource?.flowId === source.flowId);
        if (previous.length !== 1 || !(await readGitDeliveryEvidence(input.projectRoot, previous[0]!.operationId)).ok)
          return reject("git-delivery-old-ref-unproven", "An existing delivery value needs its original settled same-flow operation proof");
        const ancestry = await port.query({ operationId: request.operationId, template: "merge-base", target: request.expected.oid, other: codeBasis });
        if (ancestry.termination !== "exited" || ancestry.exitCode !== 0 || ancestry.outputTruncated || ancestry.stdout.trim() !== request.expected.oid.hex)
          return reject("git-delivery-base-behind-current", "The expected current delivery is not an ancestor of this frozen code basis; publication must not roll back later unmodified code");
      }
      const plan = await planGitRefPublication(input.projectRoot, ref, request.expected.oid, request.candidate);
      const revision = digest({ source, processSource: processSource.value, repoConfig: identity.configDigest, currentActive: [currentManifest.value.activeRevision, currentManifest.value.activeDigest], currentGrants }), paths = [...new Set(plan.diff.flatMap(row => [row.oldPath, row.newPath].filter((v): v is string => !!v)))].sort();
      const policyInput: PreparedGitDelivery["policyInput"] = { repoId, operationId: request.operationId, actorRoleId: "convener", taskId: context.taskId, runId: context.runId,
        authorizationRevision: context.authorizationRevision ?? revision, currentAuthorizationRevision: revision, objectFormat: identity.objectFormat, template: "publish-delivery",
        paths, readPaths: [...context.readPaths], writePaths: [], readableOids: [codeBasis, request.candidate, ...(request.expected.oid ? [request.expected.oid] : [])],
        base: request.expected.oid, candidate: request.candidate, ref, publicationRef: ref, ownedCandidateRef: proof.value.journal.ref,
        argv: plan.argv, commands: [plan.argv], worksite: plan.worksite, allDiff: { complete: true, base: request.expected.oid, candidate: request.candidate, entries: plan.diff },
        refPublicationPlan: plan, deliveryBasis: { base: codeBasis, baseTree: await candidates.listTree(codeBasis), source: integration,
          candidateOperationId: source.candidateOperationId, baseCommitBytesBase64: (await candidates.readCommitBytes(codeBasis)).bytesBase64 },
        integrationGrants: integration.kind === "run-integration" ? integration.contributors.map(row => ({ ownerRoleId: row.source.roleId, paths: row.source.files.map(file => file.path), candidate: row.candidate, evidenceDigest: digest(row.source) })) : integration.ownerGrants.map(grant => ({ ...grant, candidate: integration.target })) };
      const prepared: PreparedGitDelivery = { request: structuredClone(request), repoId, taskId: context.taskId, runId: context.runId, flowId: source.flowId,
        source, processSource: processSource.value, plan, policyInput, inputDigest: digest(policyInput), requestDigest: digest({ request, source, processSource: processSource.value, policyInput }) };
      deliveryPreparations.set(prepared, digest(prepared)); return { ok: true, value: prepared };
    } catch (error) { return reject("git-delivery-preparation-unavailable", String(error)); }
  }
  async function executeDelivery(prepared: PreparedGitDelivery, hostLeaseId: string, verdict: { allowed: boolean; inputDigest: string; code?: string }, signal?: AbortSignal): Promise<GitCapabilityResult> {
    const request = prepared.request, reject = (code: string, message: string) => failure(request.operationId, prepared.repoId, code, message);
    if (deliveryPreparations.get(prepared) !== digest(prepared) || !verdict.allowed || verdict.inputDigest !== prepared.inputDigest || prepared.inputDigest !== digest(prepared.policyInput))
      return reject(verdict.code ?? "git-delivery-policy-unproven", "The actual private preparation and complete ref-only policy verdict are required");
    const release = await acquireVersionLock(input.projectRoot), operations = createGitRefStore(input.projectRoot, { hostLeaseId, heldLockToken: release.token });
    try {
      if (signal?.aborted || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok || !await ownsVersionLock(input.projectRoot, release.token))
        return reject("git-delivery-mutation-interrupted", "Actual host/R9 publication lease is not current");
      const current = await prepareDelivery(request); if (!current.ok) return current.result;
      if (current.value.requestDigest !== prepared.requestDigest || current.value.inputDigest !== prepared.inputDigest)
        return reject("git-delivery-basis-stale", "The actual run/task/quality/current authority changed before publication");
      const result = await operations.publish({ operationId: request.operationId, repoId: prepared.repoId, ref: prepared.plan.ref, oldOid: request.expected.oid,
        newOid: request.candidate, tree: prepared.plan.commit.tree, parents: prepared.plan.commit.parents, requestDigest: prepared.requestDigest, deliverySource: prepared.source }, signal);
      if (result.status !== "published") return { operationId: request.operationId, repoId: prepared.repoId, status: result.status, journalId: result.journalId, message: result.message };
      return { operationId: request.operationId, repoId: prepared.repoId, status: "published", published: { ref: prepared.plan.ref, oid: request.candidate },
        candidate: request.candidate, tree: prepared.plan.commit.tree, parents: prepared.plan.commit.parents, journalId: result.journalId };
    } catch (error) {
      const journal = await operations.readJournal(request.operationId).catch(() => null);
      return journal ? { operationId: request.operationId, repoId: prepared.repoId, status: "pending-recovery", journalId: `.ans/trunk/operations/${createHash("sha256").update(request.operationId).digest("hex")}/git.json`, code: "git-delivery-effects-pending", message: String(error) }
        : reject("git-delivery-effect-failed", String(error));
    } finally { await release(); }
  }
  async function prepareIntegration(request: Extract<PreparedGitWorkerCommit["request"], { action: "integrate" }>): ReturnType<GitCapabilityService["prepareIntegration"]> {
    let repoId = "unavailable";
    const reject = (code: string, message: string) => ({ ok: false as const, result: failure(request.operationId, repoId, code, message) });
    try {
      const identity = await port.inspect(); repoId = identity.repoId;
      const context = input.context, deps = { projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) };
      if (context?.actorRoleId !== "convener" || !context.taskId || !context.runId || !isGitBasis(request.base) || !request.base.oid
        || !request.operationId?.trim() || request.operationId.length > 200 || !request.message?.trim() || request.message.length > 4000
        || !request.candidates.length || request.candidates.length > 64 || new Set(request.candidates.map(oid => `${oid.objectFormat}:${oid.hex}`)).size !== request.candidates.length)
        return reject("git-integration-request-invalid", "An actual assigned convener run and bounded distinct candidate OIDs are required");
      const assigned = await inspectAssignedTask(deps, { taskId: context.taskId, actorRoleId: "convener" });
      if (!assigned.ok || assigned.value.runId !== context.runId) return reject("git-integration-task-unavailable", assigned.ok ? "Assigned run differs" : assigned.message ?? assigned.code);
      const basis = await readRunEvidence(deps, context.runId); if (!basis.ok) return reject("git-integration-run-unavailable", basis.message ?? basis.code);
      const processSource = await readTaskProcessSource(deps, { taskId: context.taskId, actorRoleId: "convener", flowId: basis.value.flowId, runId: context.runId });
      if (!processSource.ok) return reject("git-integration-current-source-unproven", processSource.message ?? processSource.code);
      if (!isGitBasis(basis.value.run.codeBasis) || JSON.stringify(basis.value.run.codeBasis) !== JSON.stringify(request.base)) return reject("git-integration-base-conflict", "Integration must preserve the original immutable run code basis");
      const ledger = await readOperationEvents(input.projectRoot); if (!ledger.ok) return reject("git-task-evidence-unavailable", ledger.reason);
      const events = [];
      for (const row of ledger.records) { const checked = validateTaskStateEvent(row.value); if (!checked.ok) return reject("git-task-evidence-invalid", checked.message); events.push({ raw: row.raw, event: checked.event }); }
      const journals = await createGitRefStore(input.projectRoot).listJournals();
      const selected: Array<{ journal: GitRefJournal; source: GitTaskCandidateSource; report: { raw: string }; closed: TaskClosedEvent; paths: string[] }> = [];
      for (const oid of request.candidates) {
        const matching = journals.filter(journal => journal.phase !== "business-prepared" && journal.newOid.hex === oid.hex && journal.newOid.objectFormat === oid.objectFormat);
        if (matching.length !== 1) return reject("git-integration-candidate-unproven", "Each candidate must have exactly one real original operation journal");
        const journal = matching[0]!; if (journal.phase === "business-prepared") return reject("git-integration-candidate-unproven", "Candidate is not a committed ref operation");
        const source = journal.candidateSource;
        if (journal.repoId !== repoId || journal.phase !== "published" || journal.process?.termination !== "exited" || journal.process.exitCode !== 0
          || !source || source.kind !== "assigned-run-task" || source.runId !== context.runId || source.flowId !== basis.value.flowId || source.pinDigest !== basis.value.pinDigest
          || JSON.stringify(source.base) !== JSON.stringify(request.base) || journal.ref !== `refs/ans/candidates/${createHash("sha256").update(journal.operationId).digest("hex")}`
          || JSON.stringify(await candidates.readRef(journal.ref)) !== JSON.stringify(oid)) return reject("git-integration-candidate-unproven", "Candidate source/ref/process is not a settled same-run worker result");
        const actual = await candidates.readCommit(oid);
        if (JSON.stringify([actual.tree, actual.parents]) !== JSON.stringify([journal.tree, journal.parents]) || JSON.stringify(actual.parents) !== JSON.stringify([request.base.oid])) return reject("git-integration-parent-conflict", "Worker tree/parents differ from the actual pinned code basis");
        const rows = events.filter(row => "taskId" in row.event && row.event.taskId === source.taskId), creates = rows.filter(row => row.event.kind === "task.created"), created = creates[0]?.event;
        const report = rows.filter(row => row.event.kind === "task.reported").at(-1), closed = rows.filter(row => row.event.kind === "task.closed").at(-1)?.event;
        if (creates.length !== 1 || created?.kind !== "task.created" || created.from !== "convener" || created.to !== source.roleId || created.parentTaskRef?.taskId !== context.taskId
          || created.runId !== context.runId || created.flowId !== basis.value.flowId || created.moduleId !== source.moduleId || !basis.value.frozenRoles[source.roleId]
          || report?.event.kind !== "task.reported" || report.event.from !== source.roleId || report.event.status !== "done"
          || closed?.kind !== "task.closed" || closed.by !== "convener" || closed.outcome !== "accepted" || !closed.operationId || !closed.eventId
          || closed.actionSource?.kind !== "role-direct" || closed.actionSource.action !== "close-created-task" || closed.actionSource.runId !== context.runId)
          return reject("git-integration-child-not-accepted", "Every contribution must be the actual completed child of this convener, accepted by its original creator");
        const dispatch = await prepareRoleDispatch(deps, { fromRoleId: "convener", targetRoleId: source.roleId, flowId: basis.value.flowId, runId: context.runId, moduleId: source.moduleId });
        const current = await store.readManifest(), active = current.ok ? current.value.activeRoles?.[source.roleId] : undefined;
        const activeBytes = active ? await store.readActiveRoleEvidence!(active) : undefined;
        const authFile = activeBytes?.ok ? activeBytes.value.files.find(file => file.path === active!.authorizationRef.path && file.sha256 === active!.authorizationRef.sha256) : undefined;
        const auth: unknown = authFile ? JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8")) : undefined;
        if (!dispatch.ok || dispatch.value.kind !== "execution" || !auth || typeof auth !== "object" || !("writesets" in auth) || !Array.isArray(auth.writesets)
          || !("schema" in auth) || auth.schema !== "role-authorization/v1" || auth.writesets.some(path => typeof path !== "string")
          || !("roleId" in auth) || auth.roleId !== source.roleId || !("flowId" in auth) || auth.flowId !== basis.value.flowId)
          return reject("git-integration-authority-unavailable", "Current active authority and original frozen module must both remain applicable");
        const paths = source.files.map(file => file.path), writesets = auth.writesets;
        if (paths.some(path => !dispatch.value.modulePaths?.some(root => root === path || root.endsWith("/") && path.startsWith(root))
          || !writesets.some(root => typeof root === "string" && (root === path || root.endsWith("/") && path.startsWith(root))))) return reject("git-integration-scope-withdrawn", "A contribution no longer lies within the current/frozen ownership intersection");
        selected.push({ journal, source, report, closed, paths });
      }
      const firstRole = Object.values(basis.value.frozenRoles)[0], rosterFile = firstRole && basis.value.snapshot.files.find(file => file.path === firstRole.rosterRef.path && file.sha256 === firstRole.rosterRef.sha256);
      const roster = parseProjectRoster(rosterFile ? Buffer.from(rosterFile.bytesBase64, "base64").toString("utf8") : "", basis.value.flowId);
      if (!roster.ok || roster.roster.roles.some(role => role.modules.some(moduleId => selected.filter(row => row.source.roleId === role.id && row.source.moduleId === moduleId).length !== 1)))
        return reject("git-integration-incomplete", "Exactly one accepted actual contribution is required for each frozen roster module");
      const files = new Map<string, PreparedGitWorkerCommit["plan"]["input"]["files"][number]>(), sourceFiles = new Map<string, string | null>();
      const baseTree = await candidates.listTree(request.base.oid);
      for (const row of selected) for (const file of row.source.files) {
        const bytes = file.sha256 === null ? undefined : await candidates.readBlob(row.journal.newOid, file.path);
        if (bytes && bytes.sha256 !== file.sha256) return reject("git-integration-content-unproven", "Candidate bytes differ from the recorded owner contribution");
        if (sourceFiles.has(file.path) && sourceFiles.get(file.path) !== file.sha256) return reject("git-integration-conflict", "Overlapping contributions conflict; produce an explicit revised candidate");
        sourceFiles.set(file.path, file.sha256); files.set(file.path, { path: file.path, bytesBase64: bytes?.bytesBase64 ?? null, ...(baseTree.find(entry => entry.path === file.path)?.mode === "100755" ? { executable: true } : {}) });
      }
      const taskRows = events.filter(row => "taskId" in row.event && row.event.taskId === context.taskId), task = taskRows.find(row => row.event.kind === "task.created")!.event;
      const plan = await candidates.plan({ operationId: request.operationId, base: request.base.oid, parents: [request.base.oid, ...request.candidates], files: [...files.values()], message: request.message, timestamp: task.at });
      const source: GitIntegrationSource = { kind: "run-integration", taskId: context.taskId, runId: context.runId, flowId: basis.value.flowId, roleId: "convener", pinDigest: basis.value.pinDigest,
        taskDigest: digest(taskRows.map(row => row.event)), runRecordSha256: basis.value.recordSha256, scopeDigest: digest(selected.map(row => row.source)), base: request.base,
        files: [...sourceFiles].map(([path, sha256]) => ({ path, sha256 })), contributors: selected.map(row => ({ operationId: row.journal.operationId, candidate: row.journal.newOid, source: row.source,
          closeOperationId: row.closed.operationId!, closeEventId: row.closed.eventId!, reportSha256: createHash("sha256").update(row.report.raw).digest("hex") })) };
      const revision = digest({ source, processSource: processSource.value, repoConfig: identity.configDigest }), paths = [...files.keys()].sort(), policyInput: PreparedGitWorkerCommit["policyInput"] = {
        repoId, operationId: request.operationId, actorRoleId: "convener", taskId: context.taskId, runId: context.runId, authorizationRevision: context.authorizationRevision ?? revision,
        currentAuthorizationRevision: revision, objectFormat: identity.objectFormat, template: "integrate", paths, readPaths: [...context.readPaths], writePaths: [], readableOids: [request.base.oid, ...request.candidates],
        base: request.base.oid, candidate: plan.commit.candidate, ref: plan.ref, ownedCandidateRef: plan.ref, worksite: plan.worksite, allDiff: { complete: true, base: request.base.oid, candidate: plan.commit.candidate, entries: plan.diff },
        integrationGrants: selected.map(row => ({ ownerRoleId: row.source.roleId, paths: row.paths, candidate: row.journal.newOid, evidenceDigest: digest(row.source) })), argv: plan.commands[0]!, commands: plan.commands, rawObjectPlan: plan };
      const prepared: PreparedGitWorkerCommit = { request: structuredClone(request), taskId: context.taskId, runId: context.runId, flowId: basis.value.flowId, actorRoleId: "convener", repoId, source, plan,
        processSource: processSource.value, policyInput, inputDigest: digest(policyInput), requestDigest: digest({ request, source, processSource: processSource.value, plan }) };
      workerPreparations.set(prepared, digest(prepared)); return { ok: true, value: prepared };
    } catch (error) { return reject("git-integration-preparation-unavailable", String(error)); }
  }
  async function prepareRevert(request: Extract<PreparedGitWorkerCommit["request"], { action: "revert" }>): ReturnType<GitCapabilityService["prepareRevert"]> {
    let repoId = "unavailable";
    const reject = (code: string, message: string) => ({ ok: false as const, result: failure(request.operationId, repoId, code, message) });
    try {
      const identity = await port.inspect(); repoId = identity.repoId;
      const context = input.context, deps = { projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) };
      if (context?.actorRoleId !== "convener" || !context.taskId || !context.runId || !isGitBasis(request.base) || !request.base.oid || !isGitOid(request.commit)
        || !request.operationId?.trim() || request.operationId.length > 200 || !request.message?.trim() || request.message.length > 4000)
        return reject("git-revert-request-invalid", "An actual assigned convener run, original code basis and explicit revert target are required");
      const assigned = await inspectAssignedTask(deps, { taskId: context.taskId, actorRoleId: "convener" });
      if (!assigned.ok || assigned.value.runId !== context.runId) return reject("git-revert-task-unavailable", assigned.ok ? "Actual controller run differs" : assigned.message ?? assigned.code);
      const basis = await readRunEvidence(deps, context.runId); if (!basis.ok || JSON.stringify(basis.value.run.codeBasis) !== JSON.stringify(request.base))
        return reject("git-revert-code-basis-conflict", basis.ok ? "Expected base differs from the actual immutable assigned run" : basis.message ?? basis.code);
      const processSource = await readTaskProcessSource(deps, { taskId: context.taskId, actorRoleId: "convener", flowId: basis.value.flowId, runId: context.runId });
      if (!processSource.ok) return reject("git-revert-current-source-unproven", processSource.message ?? processSource.code);
      const target = await port.query({ operationId: request.operationId, template: "merge-base", target: request.commit, other: request.base.oid });
      if (target.termination !== "exited" || target.exitCode !== 0 || target.outputTruncated || target.stdout.trim() !== request.commit.hex)
        return reject("git-revert-target-source-unproven", "The explicit target must be a real same-repository ancestor of the proven immutable code basis");
      const ledger = await readOperationEvents(input.projectRoot); if (!ledger.ok) return reject("git-revert-task-source-unavailable", ledger.reason);
      const rows = ledger.records.filter(row => row.value.taskId === context.taskId), creates = rows.filter(row => row.value.kind === "task.created"), checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
      if (!checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== "convener" || checked.event.from !== "chief" || rows.some(row => row.value.kind === "task.closed"))
        return reject("git-revert-controller-unavailable", "The actual open Chief-created controller is required");
      const planned = await candidates.planRevert({ operationId: request.operationId, base: request.base.oid, commit: request.commit,
        ...(request.mainline !== undefined ? { mainline: request.mainline } : {}), message: request.message, timestamp: checked.event.at });
      if (!planned.ok) return reject(planned.code, `${planned.message}${planned.basis.conflicts.length ? `: ${planned.basis.conflicts.map(row => row.path).join(", ")}` : ""}`);
      const plan = planned.value; if (!plan.input.files.length || !plan.revertBasis) return reject("git-revert-no-change", "This target has no inverse file change; no candidate or execution receipt is invented");
      const affected = plan.input.files.map(file => file.path), grants = await prepareRevertOwnerGrants(deps, basis.value, affected);
      if (!grants.ok) return reject("git-revert-owner-authority-unavailable", grants.message ?? grants.code);
      const ownerGrants = grants.value, current = await store.readManifest();
      if (!current.ok) return reject("git-revert-current-authority-unavailable", current.message ?? current.reason);
      const source: GitRevertSource = { kind: "run-revert", taskId: context.taskId, runId: context.runId, flowId: basis.value.flowId, roleId: "convener", pinDigest: basis.value.pinDigest,
        taskDigest: digest(rows.map(row => row.value)), runRecordSha256: basis.value.recordSha256, scopeDigest: digest(ownerGrants), base: request.base, target: request.commit,
        ...(request.mainline !== undefined ? { mainline: request.mainline } : {}), revertBasis: plan.revertBasis, ownerGrants,
        files: plan.input.files.map(file => ({ path: file.path, sha256: file.bytesBase64 === null ? null : createHash("sha256").update(Buffer.from(file.bytesBase64, "base64")).digest("hex") })) };
      const revision = digest({ source, processSource: processSource.value, repoConfig: identity.configDigest, currentActive: [current.value.activeRevision, current.value.activeDigest] });
      const policyInput: PreparedGitWorkerCommit["policyInput"] = { repoId, operationId: request.operationId, actorRoleId: "convener", taskId: context.taskId, runId: context.runId,
        authorizationRevision: context.authorizationRevision ?? revision, currentAuthorizationRevision: revision, objectFormat: identity.objectFormat, template: "revert", target: request.commit,
        ...(request.mainline !== undefined ? { mainline: request.mainline } : {}), paths: affected, readPaths: [...context.readPaths], writePaths: [], readableOids: [request.base.oid, request.commit],
        base: request.base.oid, candidate: plan.commit.candidate, ref: plan.ref, ownedCandidateRef: plan.ref, argv: plan.commands[0]!, commands: plan.commands, worksite: plan.worksite,
        rawObjectPlan: plan, allDiff: { complete: true, base: request.base.oid, candidate: plan.commit.candidate, entries: plan.diff },
        integrationGrants: ownerGrants.map(grant => ({ ...grant, candidate: request.commit })) };
      const value: PreparedGitWorkerCommit = { request: structuredClone(request), taskId: context.taskId, runId: context.runId, flowId: basis.value.flowId, actorRoleId: "convener",
        repoId, source, processSource: processSource.value, plan, policyInput, inputDigest: digest(policyInput), requestDigest: digest({ request, source, processSource: processSource.value, plan }) };
      workerPreparations.set(value, digest(value)); return { ok: true, value };
    } catch (error) { return reject("git-revert-preparation-unavailable", String(error)); }
  }
  async function prepareWorkerCommit(request: PreparedGitWorkerCommit["request"]): ReturnType<GitCapabilityService["prepareWorkerCommit"]> {
    let repoId = "unavailable";
    const reject = (code: string, message: string) => ({ ok: false as const, result: failure(request.operationId, repoId, code, message) });
    try {
      const context = input.context, identity = await port.inspect(); repoId = identity.repoId;
      if (!context?.taskId || !context.runId || request.action !== "commit" || !isGitBasis(request.base) || !request.base.oid
        || !request.operationId?.trim() || request.operationId.length > 200 || !request.message?.trim()
        || request.message.length > 4000 || !Array.isArray(request.paths) || !request.paths.length || request.paths.length > 128 || new Set(request.paths).size !== request.paths.length)
        return reject("git-worker-request-invalid", "A real assigned run and bounded literal-file commit request are required");
      const read = await readOperationEvents(input.projectRoot); if (!read.ok) return reject("git-task-evidence-unavailable", read.reason);
      const rows = read.records.filter(row => row.value.taskId === context.taskId), creates = rows.filter(row => row.value.kind === "task.created");
      const checked = creates[0] ? validateTaskStateEvent(creates[0].value) : undefined;
      if (creates.length !== 1 || !checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== context.actorRoleId
        || checked.event.from !== "convener" || checked.event.runId !== context.runId || !checked.event.flowId || !checked.event.moduleId
        || rows.some(row => row.value.kind === "task.closed" || !validateTaskStateEvent(row.value).ok))
        return reject("git-worker-task-unproven", "The actual open assigned module task is unavailable");
      const task = checked.event;
      if (!task.flowId || !task.moduleId) return reject("git-worker-task-unproven", "Actual flow/module binding is absent");
      const flowId = task.flowId, moduleId = task.moduleId, run = await store.readRunRecord!(context.runId);
      if (!run.ok || run.value.value.state !== "pinned" || run.value.value.flowId !== task.flowId || typeof run.value.value.pinDigest !== "string"
        || !isGitBasis(run.value.value.codeBasis) || !run.value.value.codeBasis.oid)
        return reject("git-run-code-basis-unavailable", "No original immutable code basis exists on this assigned pinned run");
      if (JSON.stringify(request.base) !== JSON.stringify(run.value.value.codeBasis)) return reject("git-worker-base-conflict", "Expected base differs from the original assigned run code basis");
      if (request.base.ref !== "refs/ans/trunk") {
        if (!isRunGitBases(run.value.value) || run.value.value.codeBasisSource.kind !== "delivery-ref")
          return reject("git-run-code-basis-unavailable", "A non-document code base requires the original pinned delivery source");
        const frozen = await readRunEvidence({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, context.runId);
        if (!frozen.ok || frozen.value.recordSha256 !== run.value.sha256)
          return reject("git-run-code-basis-unavailable", frozen.ok ? "Assigned run changed while its frozen delivery source was checked" : frozen.message ?? frozen.code);
      }
      const scope = await prepareAssignedTaskWriteScope({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, { taskId: context.taskId, actorRoleId: context.actorRoleId });
      if (!scope.ok || scope.value.runId !== context.runId) return reject("git-worker-scope-unavailable", scope.ok ? "Current task/run mismatch" : scope.message ?? scope.code);
      const processSource = await readTaskProcessSource({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) },
        { taskId: context.taskId, actorRoleId: context.actorRoleId, flowId, runId: context.runId });
      if (!processSource.ok) return reject("git-worker-current-source-unproven", processSource.message ?? processSource.code);
      const paths = [...request.paths].sort(), baseTree = await candidates.listTree(request.base.oid), files: PreparedGitWorkerCommit["plan"]["input"]["files"][number][] = [], sourceFiles: GitTaskCandidateSource["files"][number][] = [];
      for (const path of paths) {
        if (!isGitLiteralPath(path) || path.split("/").some(part => /^(?:\.ans|\.git|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.netrc|id_rsa|id_ed25519)$/i.test(part))
          || !scope.value.paths.some(root => root === path || root.endsWith("/") && path.startsWith(root))) return reject("git-worker-path-forbidden", "Selected file is outside the actual frozen-module/current-authority intersection");
        const current = await store.readProjectFile!(path, { maxBytes: 1024 * 1024 });
        if (!current.ok && current.reason !== "missing") return reject("git-worker-file-unavailable", current.message ?? current.reason);
        if (!current.ok && !baseTree.some(file => file.path === path)) return reject("git-worker-delete-unproven", "An absent selected path is not a file of the actual base tree");
        files.push({ path, bytesBase64: current.ok ? current.value.bytesBase64 : null, ...(baseTree.find(file => file.path === path)?.mode === "100755" ? { executable: true } : {}) });
        sourceFiles.push({ path, sha256: current.ok ? current.value.sha256 : null });
      }
      const plan = await candidates.plan({ operationId: request.operationId, base: request.base.oid, files, message: request.message, timestamp: task.at });
      const source: GitTaskCandidateSource = { kind: "assigned-run-task", taskId: context.taskId, runId: context.runId, flowId, roleId: context.actorRoleId,
        moduleId, pinDigest: run.value.value.pinDigest, taskDigest: digest(rows.map(row => row.value)), runRecordSha256: run.value.sha256,
        scopeDigest: scope.value.basisDigest, base: structuredClone(request.base), files: sourceFiles };
      const revision = digest({ source, processSource: processSource.value, repoConfig: identity.configDigest }), policyInput: PreparedGitWorkerCommit["policyInput"] = {
        repoId, operationId: request.operationId, actorRoleId: context.actorRoleId, taskId: context.taskId, runId: context.runId,
        authorizationRevision: context.authorizationRevision ?? revision, currentAuthorizationRevision: revision, objectFormat: identity.objectFormat,
        template: "commit", paths, readPaths: [...context.readPaths], writePaths: [...scope.value.paths], readableOids: [request.base.oid],
        base: request.base.oid, candidate: plan.commit.candidate, ref: plan.ref, ownedCandidateRef: plan.ref, worksite: plan.worksite,
        allDiff: { complete: true, base: request.base.oid, candidate: plan.commit.candidate, entries: plan.diff }, argv: plan.commands[0]!, commands: plan.commands, rawObjectPlan: plan };
      const prepared: PreparedGitWorkerCommit = { request: structuredClone(request), taskId: context.taskId, runId: context.runId, flowId, actorRoleId: context.actorRoleId,
        repoId, source, processSource: processSource.value, plan, policyInput, inputDigest: digest(policyInput), requestDigest: digest({ request, source, processSource: processSource.value, plan }) };
      workerPreparations.set(prepared, digest(prepared)); return { ok: true, value: prepared };
    } catch (error) { return reject("git-worker-preparation-unavailable", String(error)); }
  }
  async function executeWorkerCommit(prepared: PreparedGitWorkerCommit, hostLeaseId: string, verdict: { allowed: boolean; inputDigest: string; code?: string }, signal?: AbortSignal): Promise<GitCapabilityResult> {
    const { request } = prepared, reject = (code: string, message: string) => failure(request.operationId, prepared.repoId, code, message);
    if (workerPreparations.get(prepared) !== digest(prepared) || !verdict.allowed || verdict.inputDigest !== prepared.inputDigest || prepared.inputDigest !== digest(prepared.policyInput))
      return reject(verdict.code ?? "git-worker-policy-unproven", "Actual prepared object identity and complete policy verdict are required");
    const release = await acquireVersionLock(input.projectRoot), operations = createGitRefStore(input.projectRoot, { hostLeaseId, heldLockToken: release.token });
    const journalId = `.ans/trunk/operations/${createHash("sha256").update(request.operationId).digest("hex")}/git.json`;
    try {
      if (signal?.aborted || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok || !await ownsVersionLock(input.projectRoot, release.token))
        return reject("git-worker-mutation-interrupted", "Actual host/R9 mutation lease is not current");
      const current = request.action === "integrate" ? await prepareIntegration(request) : request.action === "revert" ? await prepareRevert(request) : await prepareWorkerCommit(request);
      if (!current.ok) return current.result;
      if (current.value.requestDigest !== prepared.requestDigest || current.value.inputDigest !== prepared.inputDigest) return reject("git-worker-basis-stale", "Actual task/run/module/current authority or selected bytes changed before commit");
      const binding = { operationId: request.operationId, repoId: prepared.repoId, ref: prepared.plan.ref, oldOid: null,
        newOid: prepared.plan.commit.candidate, tree: prepared.plan.commit.tree, parents: prepared.plan.commit.parents,
        requestDigest: prepared.requestDigest, candidateSource: prepared.source };
      const recorded = await operations.writeCandidateJournal(binding); if (!recorded.ok) return reject("git-worker-journal-conflict", recorded.message ?? recorded.code);
      const actual = await candidates.prepareObjects(prepared.plan.input, signal, hostLeaseId);
      if (JSON.stringify(actual) !== JSON.stringify(prepared.plan.commit)) throw new Error("git-worker-object-readback-mismatch");
      if (signal?.aborted || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok) return { operationId: request.operationId, repoId: prepared.repoId, status: "pending-recovery", journalId, code: "git-worker-mutation-interrupted" };
      const published = await operations.publish(binding, signal);
      if (published.status !== "published") return { operationId: request.operationId, repoId: prepared.repoId, status: published.status, journalId, message: published.message };
      return { operationId: request.operationId, repoId: prepared.repoId, status: "prepared", candidate: actual.candidate, tree: actual.tree, parents: actual.parents, journalId };
    } catch (error) {
      const recorded = await operations.readJournal(request.operationId).catch(() => null);
      return recorded ? { operationId: request.operationId, repoId: prepared.repoId, status: "pending-recovery", journalId, code: "git-worker-effects-pending", message: String(error) }
        : reject("git-worker-effect-failed", String(error));
    } finally { await release(); }
  }
  async function prepareQuery(request: GitQueryRequest, context: GitQueryContext): ReturnType<GitCapabilityService["prepareQuery"]> {
    let repoId = "unavailable";
    try {
      const plan = await port.plan(request); repoId = plan.identity.repoId;
      const read = await readOperationEvents(input.projectRoot);
      if (!read.ok) return { ok: false, result: failure(request.operationId, repoId, "git-task-evidence-unavailable", read.reason) };
      const rows = context.taskId === undefined ? [] : read.records.filter(row => row.value.taskId === context.taskId), creations = rows.filter(row => row.value.kind === "task.created");
      if (rows.some(row => !validateTaskStateEvent(row.value).ok)) return { ok: false, result: failure(request.operationId, repoId, "git-task-evidence-invalid", "Task ledger schema is invalid") };
      const task = creations[0]?.value;
      if (context.taskId !== undefined && (creations.length !== 1 || !task || (task.to !== context.actorRoleId && task.from !== context.actorRoleId) || rows.some(row => row.value.kind === "task.closed")))
        return { ok: false, result: failure(request.operationId, repoId, "git-task-binding-unproven", "A real current assigned/created task is required") };
      if (context.runId !== undefined && task && context.runId !== task.runId) return { ok: false, result: failure(request.operationId, repoId, "git-run-binding-conflict", "Host run differs from the actual task") };
      let runSha: string | null = null, basis: GitBasis | undefined, basisSource: PreparedGitQuery["basisSource"];
      const runId = typeof task?.runId === "string" ? task.runId : context.runId;
      if (runId !== undefined) {
        const run = await store.readRunRecord!(runId);
        if (!run.ok || (task && run.value.value.flowId !== task.flowId)) return { ok: false, result: failure(request.operationId, repoId, "git-run-binding-unproven", "Actual same-flow task run is unavailable") };
        runSha = run.value.sha256;
        if (task && task.to === context.actorRoleId && run.value.value.state === "pinned") {
          if (!isGitBasis(run.value.value.codeBasis) || !run.value.value.codeBasis.oid
            || typeof run.value.value.pinDigest !== "string")
            return { ok: false, result: failure(request.operationId, repoId, "git-run-code-basis-unavailable", "The original pinned run has no immutable code basis; never infer one from HEAD/log/latest refs") };
          const frozen = await readRunEvidence({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, runId);
          if (!frozen.ok || frozen.value.recordSha256 !== run.value.sha256) return { ok: false, result: failure(request.operationId, repoId, "git-run-source-unproven", frozen.ok ? "Run changed during query preparation" : frozen.message ?? frozen.code) };
          basis = run.value.value.codeBasis;
          await candidates.readCommit(basis.oid!);
          basisSource = { kind: "assigned-run", runId, pinDigest: run.value.value.pinDigest, runRecordSha256: run.value.sha256 };
        } else if (task?.to === "convener" && context.actorRoleId === "convener" && run.value.value.state === "draft") {
          // A read returns the actual prospective code source, without pinning or claiming assigned-run authority.
          const current = await store.readManifest();
          if (current.ok && current.value.snapshotRef && current.value.activeRevision && current.value.activeDigest) {
            const expected = await store.readExecutionBases?.({ trunk: { version: current.value.trunkVersion, digest: current.value.digest }, active: { revision: current.value.activeRevision, digest: current.value.activeDigest }, snapshot: current.value.snapshotRef });
            if (expected?.ok && current.value.flowId === task.flowId) {
              const checked = await inspectExecutionCodeSource({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, expected.value);
              if (checked.ok) basis = checked.value.bases.codeBasis;
            }
          }
        }
      }
      const manifest = await store.readManifest();
      if (!manifest.ok && manifest.reason !== "missing" && manifest.message !== "git-media-has-no-effective-ref") return { ok: false, result: failure(request.operationId, repoId, "git-active-evidence-unavailable", manifest.message ?? manifest.reason) };
      const readableOids: GitOid[] = [];
      let reviewRead = false;
      if (context.actorRoleId === "verifier" && task?.to === "verifier" && runId && (task.hubRouting !== "chief-hub-v1" || task.reviewBasisRef !== undefined || task.reviewControllerRef !== undefined)) {
        const review = await readAssignedReviewContext({ projectRoot: input.projectRoot, store, freezeRegistry: createGuardFreezeRegistry(input.projectRoot) }, { taskId: context.taskId!, actorRoleId: "verifier" });
        if (!review.ok) return { ok: false, result: failure(request.operationId, repoId, "git-review-binding-unavailable", review.message ?? review.code) };
        reviewRead = true;
        readableOids.push(review.value.reviewBasisRef.candidate, ...review.value.reviewBasisRef.criteria.map(ref => ref.oid));
        if (!request.target || !["show", "ls-tree", "rev-parse", "log", "diff", "merge-base"].includes(request.template)
          || !readableOids.some(oid => oid.objectFormat === request.target!.objectFormat && oid.hex === request.target!.hex)
          || request.other && !readableOids.some(oid => oid.objectFormat === request.other!.objectFormat && oid.hex === request.other!.hex))
          return { ok: false, result: failure(request.operationId, repoId, "git-review-exact-target-required", "Assigned review queries must explicitly name the bound final candidate or frozen criterion commit; HEAD/live/default log is not review evidence") };
      }
      if (context.taskId && task?.to === context.actorRoleId && runId) for (const journal of await createGitRefStore(input.projectRoot).listJournals()) {
        if (journal.phase === "published" && journal.candidateSource?.taskId === context.taskId && journal.candidateSource.runId === runId) {
          const proof = await readGitCandidateEvidence(input.projectRoot, journal.operationId, journal.newOid);
          if (!proof.ok) return { ok: false, result: failure(request.operationId, repoId, "git-query-owned-candidate-unavailable", proof.message ?? proof.reason) };
          readableOids.push(journal.newOid);
        }
      }
      for (const ref of ["refs/ans/trunk", ...(typeof task?.flowId === "string" ? [`refs/ans/delivery/${task.flowId}`] : [])]) {
        if (reviewRead) continue;
        const oid = await candidates.readRef(ref); if (oid) { readableOids.push(oid); if (!basis && ref === "refs/ans/trunk") basis = { ref, oid }; }
      }
      // Explicit historical reads are separate from the immutable/default code basis and from write grants.
      if (!reviewRead) for (const target of [request.target, request.other]) {
        if (!target || readableOids.some(oid => oid.objectFormat === target.objectFormat && oid.hex.toLowerCase() === target.hex.toLowerCase())) continue;
        const proof = await readGitPublishedReadEvidence(input.projectRoot, target);
        if (proof.ok) readableOids.push(proof.value.commit.candidate);
        else if (proof.reason !== "missing") return { ok: false, result: failure(request.operationId, repoId, "git-query-publication-source-unavailable", proof.message ?? proof.reason) };
      }
      if (basis?.oid && !readableOids.some(oid => oid.hex === basis!.oid!.hex && oid.objectFormat === basis!.oid!.objectFormat)) readableOids.push(basis.oid);
      const uniqueOids = [...new Map(readableOids.map(oid => [`${oid.objectFormat}:${oid.hex.toLowerCase()}`, oid])).values()]
        .sort((a, b) => `${a.objectFormat}:${a.hex}`.localeCompare(`${b.objectFormat}:${b.hex}`));
      readableOids.splice(0, readableOids.length, ...uniqueOids);
      const revision = digest({ task: rows.map(row => row.value), runSha, active: manifest.ok ? [manifest.value.activeRevision ?? 0, manifest.value.activeDigest ?? null] : null, readableOids, basis, basisSource });
      const policyInput: PreparedGitQuery["policyInput"] = { repoId, operationId: request.operationId, actorRoleId: context.actorRoleId, ...(context.taskId !== undefined ? { taskId: context.taskId } : {}),
        ...(runId !== undefined ? { runId } : {}), authorizationRevision: context.authorizationRevision ?? revision,
        currentAuthorizationRevision: revision, objectFormat: plan.identity.objectFormat, template: request.template, paths: [...(request.paths ?? [])],
        readPaths: [...context.readPaths], writePaths: [], argv: [...plan.argv], readableOids,
        ...(request.target ? { target: { ...request.target } } : {}), ...(request.other ? { other: { ...request.other } } : {}), ...(request.limit !== undefined ? { limit: request.limit } : {}) };
      return { ok: true, value: { request: structuredClone(request), context: structuredClone(context), repoConfigDigest: plan.identity.configDigest,
        ...(basis ? { basis: structuredClone(basis) } : {}), ...(basisSource ? { basisSource: structuredClone(basisSource) } : {}),
        policyInput, inputDigest: digest(policyInput) } };
    } catch (error) { return { ok: false, result: failure(request.operationId, repoId, "git-query-evidence-unavailable", String(error)) }; }
  }
  const initializationPreparations = new WeakMap<PreparedGitInitialization, string>();
  async function prepareInitialization(request: PreparedGitInitialization["request"]): ReturnType<GitCapabilityService["prepareInitialization"]> {
    const blocked = (operationId: string, repoId: string, code: string, message: string) => ({ ok: false as const, result: failure(operationId, repoId, code, message) });
    try {
      if (!request.operationId?.trim() || request.operationId.length > 200 || /[\x00-\x1f]/.test(request.operationId) || !request.message?.trim() || request.message.length > 4000)
        return blocked(request.operationId, "uninitialized", "git-initialization-request-invalid", "A bounded original operation id and message are required before effects");
      if (request.base.ref !== "refs/ans/trunk" || request.base.oid !== null) return blocked(request.operationId, "uninitialized", "git-initialization-base-invalid", "A genuinely new repository initialization has the actual absent app trunk base");
      const context = input.context;
      if (context?.actorRoleId !== "convener" || !context.taskId) return blocked(request.operationId, "uninitialized", "git-initialization-task-unproven", "Initialization requires the actual assigned convener task");
      const read = await readOperationEvents(input.projectRoot); if (!read.ok) return blocked(request.operationId, "uninitialized", "git-task-evidence-unavailable", read.reason);
      const rows = read.records.filter(row => row.value.taskId === context.taskId), created = rows.filter(row => row.value.kind === "task.created");
      const checked = created[0] ? validateTaskStateEvent(created[0].value) : undefined;
      if (created.length !== 1 || !checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== "convener" || checked.event.from !== "chief" || !checked.event.flowId || !checked.event.runId
        || !checked.event.workSourceRef || rows.some(row => row.value.kind === "task.closed")) return blocked(request.operationId, "uninitialized", "git-initialization-source-unavailable", "The actual open child task has no typed customer-turn work source");
      const task = checked.event, ref = task.workSourceRef!, source = await store.readInitializationSource!(ref.sourceId);
      if (!source.ok || source.value.sha256 !== ref.sha256.toLowerCase() || source.value.path !== ref.path) return blocked(request.operationId, "uninitialized", "git-initialization-source-invalid", "Immutable work-source hash differs from this real task reference");
      let value: unknown; try { value = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8")); } catch { return blocked(request.operationId, "uninitialized", "git-initialization-source-invalid", "Work-source JSON is invalid"); }
      const record = value && typeof value === "object" ? value : undefined;
      const root = await readGitInitializationFacts(input.projectRoot);
      if (!record || !("schema" in record) || record.schema !== "repository-work-source/v1" || !("sourceId" in record) || record.sourceId !== ref.sourceId
        || !("projectRoot" in record) || record.projectRoot !== root.projectRoot || !("flowId" in record) || record.flowId !== task.flowId || !("kind" in record) || record.kind !== "customer-turn")
        return blocked(request.operationId, "uninitialized", "git-initialization-source-invalid", "The real customer work source belongs to another root/flow");
      const parent = "parent" in record && record.parent && typeof record.parent === "object" ? record.parent : undefined;
      if (!parent || !("roleId" in parent) || parent.roleId !== "chief" || !("sessionId" in parent) || typeof parent.sessionId !== "string" || !parent.sessionId)
        return blocked(request.operationId, "uninitialized", "git-initialization-source-invalid", "The immutable source has no actual chief Core instance binding");
      const prior = await readGitInitializationRecord(input.projectRoot, request.operationId);
      if (root.state !== "absent" && !(root.state === "existing" && prior) || root.parentRepositories.length || root.reasons.length) return blocked(request.operationId, "uninitialized", "git-initialization-root-changed", "The actual new-repository root changed or has an unsupported parent/link association");
      const run = await store.readRunRecord!(task.runId!);
      if (!run.ok || run.value.value.flowId !== task.flowId || run.value.value.state !== "draft") return blocked(request.operationId, "uninitialized", "git-initialization-run-invalid", "The real initialization task no longer has its current draft run");
      // The parent may naturally settle after child assignment. Its persisted true source is not a perpetual live-session requirement.
      const ledger = await store.readProjectFile!(".ans/state/tasks.jsonl", { maxBytes: 2 * 1024 * 1024 });
      if (!ledger.ok) return blocked(request.operationId, "uninitialized", "git-task-evidence-unavailable", "Actual task ledger bytes are unavailable");
      const candidatePlan = planEmptyGitCandidate({ operationId: request.operationId, message: request.message, timestamp: task.at, objectFormat: "sha1" });
      const initializationPlan = root.state === "absent" ? await planGitRepositoryInitialization(input.projectRoot, "sha1") : undefined;
      const requestDigest = digest({ request, projectRoot: root.projectRoot, taskId: context.taskId, runId: task.runId, flowId: task.flowId, sourceId: ref.sourceId, sourceSha256: source.value.sha256, candidate: candidatePlan.commit });
      if (prior && (prior.requestDigest !== requestDigest || prior.projectRoot !== root.projectRoot || prior.taskId !== context.taskId
        || prior.runId !== task.runId || prior.flowId !== task.flowId || prior.sourceId !== ref.sourceId || prior.sourceSha256 !== source.value.sha256))
        return blocked(request.operationId, "uninitialized", "git-initialization-operation-conflict", "The original operation belongs to another initialization request/source");
      const binding = { request: structuredClone(request), projectRoot: root.projectRoot, taskId: context.taskId, runId: task.runId!, flowId: task.flowId!, requestDigest,
        sourceId: ref.sourceId, sourceSha256: source.value.sha256, parentCoreSessionId: parent.sessionId, candidatePlan,
        ...(initializationPlan ? { initializationPlan } : {}), rootBasisDigest: prior?.qualificationDigest ?? root.qualificationDigest, expectedFiles: [{ path: ref.path, sha256: source.value.sha256 },
          { path: `.ans/runs/${task.runId}/manifest.json`, sha256: run.value.sha256 }, { path: ".ans/state/tasks.jsonl", sha256: ledger.value.sha256 }] };
      const prepared: PreparedGitInitialization = { ...binding, inputDigest: digest(binding) };
      initializationPreparations.set(prepared, digest(prepared));
      return { ok: true, value: prepared };

    } catch (error) { return blocked(request.operationId, "uninitialized", "git-initialization-evidence-unavailable", String(error)); }
  }
  async function executeInitialization(prepared: PreparedGitInitialization, hostLeaseId: string, signal?: AbortSignal): Promise<GitCapabilityResult> {
    const request = prepared.request;
    if (!checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok)
      return failure(request.operationId, "uninitialized", "git-host-mutation-lease-invalid", "The actual project mutation lease is not held");
    if (!initializationPreparations.has(prepared) || initializationPreparations.get(prepared) !== digest(prepared))
      return failure(request.operationId, "uninitialized", "git-initialization-preparation-invalid", "Only this Service instance's unchanged preparation is accepted");
    initializationPreparations.delete(prepared);
    if (signal?.aborted) return failure(request.operationId, "uninitialized", "git-initialization-cancelled", "Initialization was cancelled before effect");
    const release = await acquireVersionLock(input.projectRoot);
    const current = await prepareInitialization(request);
    if (!current.ok) { await release(); return current.result; }
    if (current.value.inputDigest !== prepared.inputDigest) { await release(); return failure(request.operationId, "uninitialized", "git-initialization-basis-stale", "The actual root/source/task/run changed before initialization"); }
    let repoId = "uninitialized";
    const journalId = `.ans/trunk/operations/${createHash("sha256").update(request.operationId).digest("hex")}/init.json`;
    let journal: GitInitializationRecord | null = null;
    try {
      journal = await readGitInitializationRecord(input.projectRoot, request.operationId);
      if (!journal) { journal = { media: "git-initialization/v1", operationId: request.operationId, requestDigest: prepared.requestDigest,
        projectRoot: prepared.projectRoot, taskId: prepared.taskId, runId: prepared.runId, flowId: prepared.flowId,
        sourceId: prepared.sourceId, sourceSha256: prepared.sourceSha256, qualificationDigest: prepared.rootBasisDigest, expectedFiles: prepared.expectedFiles, stage: "prepared" };
        await writeGitInitializationRecord(input.projectRoot, journal, release.token); }
      const root = await readGitInitializationFacts(input.projectRoot);
      let identity;
      if (root.state === "absent") identity = await initializeGitRepository(input.projectRoot, "sha1", { operationId: request.operationId,
        qualificationDigest: prepared.rootBasisDigest, expectedFiles: prepared.expectedFiles, hostLeaseId, heldLockToken: release.token }, signal);
      else {
        const process = await store.readProjectFile!(".ans/git-init-process.json", { maxBytes: 128 * 1024 });
        const facts: unknown = process.ok ? JSON.parse(Buffer.from(process.value.bytesBase64, "base64").toString("utf8")) : undefined;
        if (!facts || typeof facts !== "object" || !("operationId" in facts) || facts.operationId !== request.operationId
          || !("termination" in facts) || facts.termination !== "exited" || !("exitCode" in facts) || facts.exitCode !== 0) throw new Error("git-init-original-process-unproven");
        identity = await port.inspect();
        if (journal.repoId && journal.repoId !== identity.repoId) throw new Error("git-init-repository-identity-changed");
      }
      repoId = identity.repoId;
      if (journal.stage !== "candidate-created") { journal = { ...journal, stage: "repository-created", repoId }; await writeGitInitializationRecord(input.projectRoot, journal, release.token); }
      if (!await ownsVersionLock(input.projectRoot, release.token) || !checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok) throw new Error("git-host-mutation-lease-interrupted");
      const candidate = await candidates.prepare(prepared.candidatePlan.input, signal, hostLeaseId);
      if (JSON.stringify(candidate) !== JSON.stringify(prepared.candidatePlan.commit)) throw new Error("git-init-planned-candidate-readback-mismatch");
      journal = { ...journal, stage: "candidate-created", repoId, candidate: candidate.candidate, tree: candidate.tree, parents: candidate.parents };
      await writeGitInitializationRecord(input.projectRoot, journal, release.token);
      if (!checkGitHostAction({ projectRoot: input.projectRoot, leaseId: hostLeaseId, kind: "git-mutation" }).ok) throw new Error("git-host-mutation-lease-interrupted");
      return { operationId: request.operationId, repoId, status: "prepared", candidate: candidate.candidate, tree: candidate.tree, parents: candidate.parents };
    } catch (error) {
      // Git init or candidate object/ref creation may already have occurred. Never report a rollback from a thrown transport error.
      const actual = await port.inspect().catch(() => undefined);
      const recorded = await readGitInitializationRecord(input.projectRoot, request.operationId).catch(() => null);
      const root = await readGitInitializationFacts(input.projectRoot).catch(() => undefined);
      const process = await store.readProjectFile!(".ans/git-init-process.json", { maxBytes: 128 * 1024 });
      let unresolvedOwnedProcess = false;
      try { const fact: unknown = process.ok ? JSON.parse(Buffer.from(process.value.bytesBase64, "base64").toString("utf8")) : undefined;
        unresolvedOwnedProcess = !!fact && typeof fact === "object" && "operationId" in fact && fact.operationId === request.operationId && "termination" in fact && fact.termination === "unknown";
      } catch { /* Corrupt process evidence does not prove completion. */ }
      return recorded && (actual || root?.state === "existing" || unresolvedOwnedProcess) ? { operationId: request.operationId, repoId: actual?.repoId ?? repoId, status: "pending-recovery", journalId,
        code: "git-initialization-effects-pending", message: String(error) } : failure(request.operationId, repoId, "git-initialization-effect-failed", String(error));
    } finally { await release(); }
  }
  return { prepareDelivery, executeDelivery, prepareIntegration, prepareRevert, prepareWorkerCommit, executeWorkerCommit, prepareInitialization, executeInitialization, prepareQuery, async executeQuery(prepared, verdict, signal) {
    const { request, policyInput } = prepared;
    if (!verdict.allowed || verdict.inputDigest !== prepared.inputDigest || prepared.inputDigest !== digest(policyInput))
      return failure(request.operationId, policyInput.repoId, verdict.code ?? "git-policy-binding-invalid", "Current content-bound G policy result is required");
    const current = await prepareQuery(request, prepared.context);
    if (!current.ok) return current.result;
    if (current.value.inputDigest !== prepared.inputDigest || current.value.repoConfigDigest !== prepared.repoConfigDigest)
      return failure(request.operationId, policyInput.repoId, "git-query-basis-stale", "Actual repository/task/run/authorization changed after policy preparation");
    try {
      const facts = await port.query(request, signal);
      if (facts.outputTruncated) return { ...failure(request.operationId, policyInput.repoId, "git-query-output-truncated", "Bounded partial output; forced process termination remains unknown"), output: facts.stdout, truncated: true };
      if (JSON.stringify(facts.argv) !== JSON.stringify(policyInput.argv) || facts.termination !== "exited")
        return failure(request.operationId, policyInput.repoId, "git-query-process-unknown", "Query process did not prove the planned normal exit");
      if (facts.exitCode !== 0) return { operationId: request.operationId, repoId: policyInput.repoId, status: "rejected", code: "git-query-failed", message: facts.stderr };
      return { operationId: request.operationId, repoId: policyInput.repoId, status: "observed", output: facts.stdout, truncated: facts.outputTruncated,
        ...(current.value.basis ? { basis: current.value.basis } : {}), ...(current.value.basisSource ? { basisSource: current.value.basisSource } : {}) };
    } catch (error) { return failure(request.operationId, policyInput.repoId, "git-query-transport-failed", String(error)); }
  }, async candidate(request) {
    if (request.action === "init") {
      const prepared = await prepareInitialization(request);
      return prepared.ok ? failure(request.operationId, "uninitialized", "git-protection-closure-unproven", "Actual child task/work source verified; project-wide tool/process protection and authorization serialization closure is not installed") : prepared.result;
    }
    const identity = await port.inspect().catch(() => undefined);
    return failure(request.operationId, identity?.repoId ?? "uninitialized", "git-protection-closure-unproven", "No actual project-wide tool/process protection and authorization serialization closure is installed; candidate mutation is blocked");
  }, async publish(request) {
    const identity = await port.inspect().catch(() => undefined);
    return failure(request.operationId, identity?.repoId ?? "unavailable", "git-protection-closure-unproven", "No actual project-wide tool/process protection and authorization serialization closure is installed; ref publication is blocked");
  } };
}
