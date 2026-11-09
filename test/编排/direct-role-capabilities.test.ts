import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGuardFreezeRegistry, acquireVersionLock, readVersionBaselineState, writeVersionBaselineState, scanVersionedDocuments, readConfirmedIntentEvidence, completeSnapshotDigest } from "../../src/provider/version-change/public/version-change-store.ts";
import { createTrunkService, type TrunkDirectApplyInput } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { prepareChiefDecisionEvidence, openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createDirectRoleRuntime as createDirectRoleRuntimeBase, readRunRoleContext, prepareCreatedTaskClose, recordTaskObservation, freezeExecutionRun, prepareRoleDispatch, prepareAssignedTaskWriteScope, inspectAssignedTask, prepareParentTaskRef, resolveDeliveryAssignment, classifyClosedTaskNotice } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { validateRunManifest } from "../../src/common/编排/run-manifest.ts";
import { readTaskState, validateTaskStateEvent } from "../../src/common/编排/task-state.ts";
import { createTrunkProject, PATHS } from "./fixtures/trunk-project.ts";
import { createVersionChangeStack } from "../../app/desktop/version-change.ts";
import type { CustomerInputRequest, CustomerInputMetadata, TaskCreatedEvent, TaskReportedEvent, RequestCreatedEvent, RequestResolvedEvent } from "../../src/model/runtime.ts";
import { TRUNK_MANIFEST_SCHEMA, COMPLETE_SNAPSHOT_SCHEMA, FROZEN_ROLE_REF_KEYS, type TrunkManifest, type SnapshotRef, type FrozenRoleEvidence, type ActiveRoleEvidence, type CompleteSnapshot } from "../../src/model/trunk.ts";

const at = "2026-11-05T00:00:00.000Z";
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
// Existing successful Pipeline cases explicitly acknowledge notification enqueue.
const createDirectRoleRuntime = (input: Parameters<typeof createDirectRoleRuntimeBase>[0]) => createDirectRoleRuntimeBase({ notifyDirect: async () => {}, ...input });

test("Chief hub ordinary preparation: five actual task reports close without future approvals and create no action authority", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-hub-ordinary-"));
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok);
  const service = createTrunkService({ projectRoot: root });
  const noticeRecipients: string[] = [], closeRuntime = createDirectRoleRuntimeBase({ projectRoot: root, actorRoleId: "chief", notifyDirect: async item => { noticeRecipients.push(item.recipientRoleId); } });
  let retired: { taskId: string; reportTurnId: string } | undefined;
  for (const roleId of ["convener", "product", "rapporteur", "nominator", "verifier"]) {
    const prepared = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: roleId, flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: {
      registration: { source: "native-directory-selection", selectionId: "unit-trusted-registration", selectedRoot: root, projectRoot: root, selectedAt: at, listingGeneration: 1 },
      parent: { roleId: "chief", runtime: "codex", sessionId: "unit-trusted-upstream-chief", turnId: `unit-${roleId}`, inputAccepted: true, settled: false, kind: retired ? "handback" : "message" },
      ...(retired ? { creatorReports: [{ taskId: retired.taskId, roleId: "convener", reportId: "unit-trusted-upstream-report", turnId: retired.reportTurnId }] } : {}),
    } });
    assert.ok(prepared.ok, JSON.stringify(prepared)); if (!prepared.ok) return;
    assert.equal(prepared.value.purpose, "builtin-preparation"); const ref = prepared.value.initializationSource, runId = prepared.value.runId;
    assert.ok(ref && runId); if (!ref || !runId) return;
    const actualDraft = await createFsTrunkStore(root).readRunRecord!(runId); assert.ok(actualDraft.ok); if (!actualDraft.ok) return;
    const draftShape = validateRunManifest(actualDraft.value.value); assert.ok(draftShape.ok, JSON.stringify(draftShape));
    assert.equal(actualDraft.value.value.schemas && typeof actualDraft.value.value.schemas === "object" && "run" in actualDraft.value.value.schemas ? actualDraft.value.value.schemas.run : undefined, actualDraft.value.value.schema);
    const taskId = `hub-${roleId}`;
    assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: roleId,
      text: "Investigate and report available information", sideEffect: "read-only", idempotencyKey: taskId, flowId: "demo", runId, runState: "draft", hubRouting: "chief-hub-v1",
      workSourceRef: { kind: ref.kind ?? "chief-customer-turn", sourceId: ref.sourceId, path: ref.path, sha256: ref.sha256 } } })).ok);
    assert.ok((await service.inspectAssignedTask({ taskId, actorRoleId: roleId })).ok);
    assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId, from: roleId,
      status: "done", turnId: `report-${roleId}`, summary: "Preparation findings are recorded; missing action material remains with Chief" } })).ok);
    const basis = await service.prepareCreatedTaskClose(taskId, "chief"); assert.ok(basis.ok, JSON.stringify(basis)); if (!basis.ok) return;
    assert.equal(basis.value.reportOnly, true); assert.equal((await service.prepareCreatedTaskClose(taskId, "convener")).ok, false);
    const closed = await closeRuntime.closeCreatedTask({ operationId: `close-${taskId}`, taskId, runId, reportRef: basis.value.reportRef, basisDigest: basis.value.basisDigest, outcome: "accepted" });
    assert.equal(closed.status, "applied", JSON.stringify(closed)); assert.match(closed.message ?? "", /certifies no publication/);
    assert.ok(closed.source?.kind === "role-direct");
    if (!retired) retired = { taskId, reportTurnId: `report-${roleId}` };
  }
  assert.deepEqual(noticeRecipients, [], "Real task closes do not broadcast document-change turns to Chief or old unrelated Convener assignments");
  assert.equal((await createFsTrunkStore(root).readManifest()).ok, false);
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false);
  assert.equal((await createGuardFreezeRegistry(root, { migrationCompleted: () => true }).listFreezes()).length, 0);
});

test("Retained intent confirmation: real migration keeps history and only the exact persisted customer decision adds confirmation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-intent-migration-decision-"));
  const project: ProjectConfig = { projectRoot: root, skillRoot: path.join(root, "skill-root"), roles: {}, governanceModel: "trio",
    builtInRoles: ["chief", "product"], governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:trusted-host" } } };
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok);
  const intentPath = "docs/product/demo-intent-v2.md", intent = "---\nschema: project-intent/v1\nflowId: demo\nversion: 2\n---\n# Exact new intent\nPreserve the actual approved bytes.\n";
  const product = await openRoleSession({ roleId: "product", project, runtime: "demo", autoRepin: false }, { runtimeOptions: { writeRoot: root,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: intentPath, content: intent } }]) } } });
  await product.send("Write a new intent version"); await product.dispose();
  assert.equal(await fs.readFile(path.join(root, intentPath), "utf8"), intent);
  // A fresh real desktop stack performs its existing migration; no freeze record is seeded.
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok);
  const registry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
  const migrated = await registry.listFreezes(); assert.equal(migrated.length, 1); assert.equal(migrated[0]!.freeze.reason, "migrated-legacy");
  assert.deepEqual(await readConfirmedIntentEvidence(root, intentPath), { ok: false, reason: "intent-confirmation-missing" }, "Migration is not M0 approval");
  const service = createTrunkService({ projectRoot: root }), prepared = await service.prepareIntentConfirmation("demo");
  assert.ok(prepared.ok, JSON.stringify(prepared)); if (!prepared.ok) return;
  const source = { kind: "customer-decision" as const, decisionId: "migration-real-decision", requestId: "migration-real-request", at };
  const freeze = { schema: "doc-freeze/v1" as const, applicationId: `intent-${source.requestId}`, reason: "intent-confirmed" as const,
    origin: "customer" as const, decidedBy: "customer" as const, decisionId: source.decisionId, source, snapshotRef: prepared.value.snapshotRef, frozenAt: at };
  const denied = await registry.appendDocFreezeRecords([{ path: intentPath, version: 2, sha256: sha(intent), freeze }]);
  assert.deepEqual(denied, { ok: false, code: "conflict", message: "frozen-conflict" }, "A shape-shaped confirmation without the real request/decision cannot promote migration");
  const wrongHash = await registry.appendDocFreezeRecords([{ path: intentPath, version: 2, sha256: "0".repeat(64), freeze }]);
  assert.ok(!wrongHash.ok && wrongHash.message === "hash-mismatch");
  const chief = await openRoleSession({ roleId: "chief", project, runtime: "demo", autoRepin: false, customerInput: async request => {
    assert.equal(request.kind, "choice"); if (request.kind !== "choice") return { outcome: "unavailable" };
    const created: RequestCreatedEvent = { v: 1, at, kind: "request.created", requestId: source.requestId, flowId: "demo", sourceRoleId: "chief",
      cardKind: "intent-confirm", title: request.title, context: request.question, options: request.options };
    const resolved: RequestResolvedEvent = { v: 1, at, kind: "request.resolved", requestId: created.requestId, cardKind: "intent-confirm", by: "customer",
      decisionId: source.decisionId, selectedOptionIds: ["confirm"], choice: "confirm" };
    assert.ok((await recordTaskObservation({ projectRoot: root, event: created })).ok);
    assert.ok((await recordTaskObservation({ projectRoot: root, event: resolved })).ok);
    const wrongDecision = await registry.appendDocFreezeRecords([{ path: intentPath, version: 2, sha256: sha(intent),
      freeze: { ...freeze, decisionId: "another-decision", source: { ...source, decisionId: "another-decision" } } }]);
    assert.deepEqual(wrongDecision, { ok: false, code: "conflict", message: "frozen-conflict" });
    const unpresented = await createFsTrunkStore(root).captureSnapshot!({ snapshotId: "s-unpresented-intent", createdAt: at, files: [{ path: intentPath, sha256: sha(intent) }] });
    assert.ok(unpresented.ok, JSON.stringify(unpresented));
    if (unpresented.ok) assert.deepEqual(await registry.appendDocFreezeRecords([{ path: intentPath, version: 2, sha256: sha(intent),
      freeze: { ...freeze, snapshotRef: unpresented.value } }]), { ok: false, code: "conflict", message: "frozen-conflict" }, "Equal bytes in an unpresented snapshot do not satisfy the exact retained-card marker");
    return { outcome: "answered", value: { selected: ["confirm"] }, decisionId: source.decisionId };
  } }, { runtimeOptions: { writeRoot: root, providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "request_choice", args: {
    title: "Confirm migrated exact intent", flowId: "demo", cardKind: "intent-confirm", options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }],
  } }]) } } });
  await chief.send("Confirm the exact retained version"); await chief.dispose();
  const state = await readVersionBaselineState(root), rows: unknown[] = (state.text ?? "").trim().split("\n").map(row => JSON.parse(row));
  assert.ok(rows.some(row => typeof row === "object" && row !== null && "freeze" in row && JSON.stringify(row.freeze) === JSON.stringify(migrated[0]!.freeze)), "Original migration history remains byte-equivalent");
  const confirmations = await createGuardFreezeRegistry(root, { migrationCompleted: () => true }).listFreezes();
  assert.equal(confirmations.length, 1); assert.equal(confirmations[0]!.freeze.reason, "intent-confirmed");
  assert.equal(confirmations[0]!.freeze.decisionId, source.decisionId); assert.equal(confirmations[0]!.sha256, sha(intent));
  const exact = await readConfirmedIntentEvidence(root, intentPath); assert.ok(exact.ok, JSON.stringify(exact));
  assert.deepEqual(await readConfirmedIntentEvidence(root, "docs/product/demo-intent-v1.md"), { ok: false, reason: "intent-confirmation-missing" }, "No version substitution is inferred");
  const beforeReplay = state.text;
  const replay = await service.finalizeIntentConfirmation(prepared.value, { outcome: "answered", value: { selected: ["confirm"] }, decisionId: source.decisionId });
  assert.ok(replay.ok, JSON.stringify(replay)); assert.equal((await readVersionBaselineState(root)).text, beforeReplay);
  const pendingPath = "docs/product/other-intent-v1.md", pendingText = "---\nschema: project-intent/v1\nflowId: other\nversion: 1\n---\nAn unrelated pending draft.\n";
  const pending = await openRoleSession({ roleId: "product", project, runtime: "demo", autoRepin: false }, { runtimeOptions: { writeRoot: root,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: pendingPath, content: pendingText } }]) } } });
  await pending.send("Write unrelated draft material"); await pending.dispose(); assert.equal(await fs.readFile(path.join(root, pendingPath), "utf8"), pendingText);
  const retained = await readConfirmedIntentEvidence(root, intentPath); assert.ok(retained.ok, JSON.stringify(retained));
  if (retained.ok && exact.ok) assert.deepEqual(retained.value, exact.value, "An unrelated pending draft does not replace this selected approved source");
  assert.deepEqual(await readConfirmedIntentEvidence(root, pendingPath), { ok: false, reason: "intent-confirmation-missing" });
  await fs.writeFile(path.join(root, intentPath), `${intent}External bytes changed after confirmation.\n`);
  assert.deepEqual(await readConfirmedIntentEvidence(root, intentPath), { ok: false, reason: "intent-confirmation-bytes-changed" }, "A stored approval never validates different current bytes");
});

test("Pipeline tools: product writes intent, retained chief confirmation creates real R9 evidence, then product direct-publishes the first planning trunk", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-real-intent-entry-"));
  const project: ProjectConfig = { projectRoot: root, skillRoot: path.join(root, "skill-root"), roles: {}, governanceModel: "trio", builtInRoles: ["chief", "product", "rapporteur"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:trusted-host" } } };
  const intentPath = "docs/product/demo-intent-v1.md", proposalPath = "docs/proposals/demo-proposal-v1.md";
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok, "Use the real existing desktop initialization, never seed a confirmed-intent record");
  const intent = "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\n# Actual product intent\nPublish a planning basis before any execution authorization.\n";
  const product = await openRoleSession({ roleId: "product", project, runtime: "demo", autoRepin: false }, { runtimeOptions: { writeRoot: root, providerFactories: {
    demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: intentPath, content: intent } }]),
  } } });
  await product.send("Write the actual versioned intent");
  const observed: Array<{ kind: string; summary: string }> = [];
  for await (const event of product.events()) { observed.push({ kind: event.kind, summary: event.summary }); if (event.kind === "settled") break; }
  await product.dispose();
  assert.equal(await fs.readFile(path.join(root, intentPath), "utf8").catch(() => undefined), intent, JSON.stringify(observed));
  let shownQuestion = "";
  const chief = await openRoleSession({ roleId: "chief", project, runtime: "demo", autoRepin: false,
    customerInput: async request => {
      assert.equal(request.kind, "choice"); if (request.kind !== "choice") return { outcome: "unavailable" };
      shownQuestion = request.question ?? "";
      const created: RequestCreatedEvent = { v: 1, at, kind: "request.created", requestId: "actual-intent-customer-request", flowId: "demo", sourceRoleId: "chief",
        cardKind: "intent-confirm", title: request.title, context: request.question, options: request.options };
      const resolved: RequestResolvedEvent = { v: 1, at, kind: "request.resolved", requestId: created.requestId, cardKind: "intent-confirm", by: "customer",
        decisionId: "actual-intent-customer-decision", selectedOptionIds: ["confirm"], choice: "confirm" };
      assert.ok((await recordTaskObservation({ projectRoot: root, event: created })).ok);
      assert.ok((await recordTaskObservation({ projectRoot: root, event: resolved })).ok);
      return { outcome: "answered", value: { selected: ["confirm"] }, decisionId: resolved.decisionId };
    } }, { runtimeOptions: { writeRoot: root, providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "request_choice", args: {
      title: "Confirm this exact intent", question: "Confirm the product intent", cardKind: "intent-confirm", flowId: "demo",
      options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }],
    } }]) } } });
  await chief.send("Present the retained intent confirmation"); await chief.dispose();
  assert.ok(shownQuestion.includes("[ans-intent-evidence")); assert.ok(shownQuestion.includes(sha(intent)));
  const registry = createGuardFreezeRegistry(root, { migrationCompleted: () => true });
  const freezes = await registry.listFreezes(); assert.equal(freezes.length, 1);
  assert.equal(freezes[0]!.freeze.reason, "intent-confirmed"); assert.equal(freezes[0]!.freeze.origin, "customer");
  assert.equal(freezes[0]!.freeze.decisionId, "actual-intent-customer-decision");
  const overwrite = await openRoleSession({ roleId: "product", project, runtime: "demo", autoRepin: false }, { runtimeOptions: { writeRoot: root,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: intentPath, content: `${intent}Unapproved replacement` } }]) } } });
  await overwrite.send("Attempt to change the already confirmed version"); await overwrite.dispose();
  assert.equal(await fs.readFile(path.join(root, intentPath), "utf8"), intent, "The legal G refresh installs the real freeze before another write can overwrite it");
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const runtime = createVersionChangeRuntime({ projectRoot: root, services: integration.services, trunkService: integration.trunk,
    trunkRuntime: { bootstrap: async () => { throw new Error("cancelled ordinary approval"); }, applyApproved: async () => { throw new Error("cancelled ordinary approval"); } },
    emitEvent: async () => {}, notifyDirect: async () => {} });
  const proposal = `---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: ${intentPath}\n---\n# Real proposal\n`;
  const author = await openRoleSession({ roleId: "rapporteur", project, runtime: "demo", autoRepin: false },
    { runtimeOptions: { writeRoot: root, providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: proposalPath, content: proposal } }]) } } });
  await author.send("Write the proposal within the rapporteur's actual area"); await author.dispose();
  const publish = await openRoleSession({ roleId: "product", project, runtime: "demo", autoRepin: false, submitVersionChange: input => runtime.submitDirect(input, "product") },
    { runtimeOptions: { writeRoot: root, providerFactories: { demo: options => createDemoRuntimeAdapter(options, [
      { name: "submit_version_change", args: { kind: "version-upgrade", flowId: "demo", summary: "Publish the first actual planning basis", operationId: "real-first-tool-submit",
        baseTrunk: null, targets: [{ kind: "contract", path: proposalPath, action: "add", expectedFromSha256: null }] } },
    ]) } } });
  await publish.send("Publish the first planning trunk directly"); await publish.dispose();
  const manifest = await createFsTrunkStore(root).readManifest(); assert.ok(manifest.ok, JSON.stringify(manifest)); if (!manifest.ok) return;
  assert.equal(manifest.value.trunkVersion, 1); assert.equal(manifest.value.artifacts.workflow, undefined); assert.equal(manifest.value.activeRoles, undefined);
  assert.equal(manifest.value.actionSource?.kind === "role-direct" && manifest.value.actionSource.actorRoleId, "product");
});

for (const existingWorkflow of [false, true]) test(`complete team plan / activation / new pin: actual ${existingWorkflow ? "existing workflow" : "planning-only"} basis and independent pointers`, async () => {
  const project = await createTrunkProject({ withRun: false });
  const store = createFsTrunkStore(project.root), documents = project.snapshot().documents;
  const captured = await store.captureSnapshot!({ snapshotId: "planning-without-execution", createdAt: at, files: [...Object.values(documents),
    ...(existingWorkflow ? [{ path: PATHS.workflow, sha256: project.hashes[PATHS.workflow]! }] : [])] });
  assert.ok(captured.ok); if (!captured.ok) return;
  const initial: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", trunkVersion: 1, previous: null, runId: null, flowId: "demo",
    digest: sha("actual-planning-trunk"), snapshotRef: captured.value, createdAt: at, updatedAt: at,
    artifacts: { documents, execution: { teamPlan: null, flow: null }, boundaries: {},
      ...(existingWorkflow ? { workflow: { kind: "workflow" as const, path: PATHS.workflow, sha256: project.hashes[PATHS.workflow]! } } : {}) } };
  assert.ok((await store.compareAndSwapManifest!(null, initial, captured.value)).ok);
  const planning = await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "chief", targetRoleId: "convener", flowId: "demo" });
  assert.equal(planning.ok, false, "A published planning snapshot alone does not supply the actual chief's current work source");
  assert.equal((await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "convener", targetRoleId: "impl", flowId: "demo", runId: "missing-future-pin" })).ok, false);
  await fs.unlink(path.join(project.root, PATHS.roleCard)); await fs.unlink(path.join(project.root, PATHS.boundary));
  if (!existingWorkflow) await fs.unlink(path.join(project.root, PATHS.workflow));
  const planPath = "docs/scheduling/demo-team-v2.md";
  const plan = { schema: "teamPlanSchema:3", flowId: "demo", version: 2,
    modules: documents.modules, roster: documents.roster,
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] };
  const text = `---\n${JSON.stringify(plan)}\n---\n# Real team plan\n`;
  await fs.writeFile(path.join(project.root, planPath), text);
  const input = { operationId: "complete-real-plan", flowId: "demo", baseDigest: initial.digest, plan: { path: planPath, sha256: sha(text), version: 2 } };
  const wrong = await createDirectRoleRuntime({ projectRoot: project.root, actorRoleId: "chief" }).completeTeamPlan(input); assert.equal(wrong.ok, false);
  const service = createTrunkService({ projectRoot: project.root });
  const legacy = await service.completeTeamPlan({ ...input, operationId: "reject-schema-only", plan: { path: PATHS.teamPlan, sha256: project.hashes[PATHS.teamPlan]!, version: 1 } }, "convener");
  assert.equal(legacy.ok, false); assert.equal((await store.readManifest()).ok, true);
  const planPending = await createDirectRoleRuntimeBase({ projectRoot: project.root, actorRoleId: "convener" }).completeTeamPlan(input);
  assert.equal(planPending.status, "committed-pending-recovery");
  const planNotices = new Set<string>();
  const completed = await createDirectRoleRuntimeBase({ projectRoot: project.root, actorRoleId: "convener", notifyDirect: async item => { planNotices.add(item.key); } }).completeTeamPlan(input);
  assert.equal(completed.status, "applied", JSON.stringify(completed)); assert.equal(planNotices.size, 2);
  assert.equal(completed.source?.kind === "role-direct" && completed.source.action, "complete-team-plan");
  assert.equal(completed.source?.kind === "role-direct" && completed.source.actorRoleId, "convener");
  assert.ok(completed.planRef); assert.ok(completed.rosterRef);
  const published = await store.readManifest(); assert.ok(published.ok); if (!published.ok) return;
  assert.equal(published.value.trunkVersion, 2); assert.equal(Boolean(published.value.artifacts.workflow), existingWorkflow);
  assert.equal(published.value.d3, undefined); assert.equal(published.value.activeRoles, undefined); assert.equal(published.value.runId, null);
  await fs.unlink(path.join(project.root, planPath));
  assert.deepEqual(await service.completeTeamPlan(input, "convener"), completed);
  const noOp = await service.completeTeamPlan({ ...input, operationId: "same-real-plan", baseDigest: published.value.digest }, "convener");
  assert.equal(noOp.status, "no-op", JSON.stringify(noOp));
  const unchanged = await store.readManifest(); assert.equal(unchanged.ok && unchanged.value.trunkVersion, 2);
  assert.equal((await service.readRunEvidence("absent-future-run")).ok, false);
  assert.ok(completed.planRef && completed.rosterRef); if (!completed.planRef || !completed.rosterRef) return;
  const request: RequestCreatedEvent = { v: 1, at, kind: "request.created", requestId: "real-d3-plan", flowId: "demo", sourceRoleId: "nominator",
    cardKind: "appointment", title: "Select implementation capability", options: [{ id: "impl", label: "Implementation" }] };
  const decision: RequestResolvedEvent = { v: 1, at, kind: "request.resolved", requestId: request.requestId, decisionId: "real-customer-d3", by: "customer",
    cardKind: "appointment", choice: "impl", targetRoleIds: ["impl"], rosterVersion: 1, rosterSha256: completed.rosterRef.sha256 };
  const card = "# Implementation\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接", "执行原则", "质量职责", "标准工作流", "交付物清单"].map(section => `## ${section}\nMaintain the assigned module.\n`).join("");
  const md = "# Boundary\n## Section 1: 可修改文件与目录\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录（私有） | `src/impl/` | implementation |\n";
  const yaml = "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: implementation\n";
  const paths = { card: PATHS.roleCard, boundaryMd: "角色卡/impl/boundary.md", boundaryYaml: PATHS.boundary };
  const activate = { operationId: "activate-from-real-d3", flowId: "demo", targetRoleId: "impl", d3DecisionId: decision.decisionId!, planRef: completed.planRef,
    rosterRef: completed.rosterRef, documents: { card: { path: paths.card, sha256: sha(card) }, boundaryMd: { path: paths.boundaryMd, sha256: sha(md) }, boundaryYaml: { path: paths.boundaryYaml, sha256: sha(yaml) } } };
  let activationAckLost = true; const activationNotices = new Set<string>();
  const runtime = createDirectRoleRuntime({ projectRoot: project.root, actorRoleId: "nominator", notifyDirect: async item => {
    activationNotices.add(item.key); if (activationAckLost) { activationAckLost = false; throw new Error("Activation enqueued but ack lost"); }
  } });
  const draftProject: ProjectConfig = { projectRoot: project.root, skillRoot: path.join(project.root, "skill-root"), roles: {}, governanceModel: "trio", builtInRoles: ["nominator"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:actual-host" } } };
  const firstDraft = await openRoleSession({ roleId: "nominator", project: draftProject, runtime: "demo", autoRepin: false, stablePermitOf: () => undefined,
    customerInput: async shown => {
      assert.equal(await fs.access(path.join(project.root, paths.card)).then(() => true, () => false), false, "The real write tool cannot draft a role before actual D3");
      assert.equal(shown.cardKind, "appointment");
      assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { ...request, context: shown.kind === "choice" ? shown.question : undefined } })).ok);
      assert.ok((await recordTaskObservation({ projectRoot: project.root, event: decision })).ok);
      return { outcome: "answered", value: { selected: ["impl"] }, decisionId: decision.decisionId };
    } }, { runtimeOptions: { writeRoot: project.root, versionedDocAfterWrite: async () => { throw new Error("Role drafts must not call the former stable approval/repin post-write route"); },
      providerFactories: { demo: options => createDemoRuntimeAdapter(options, [
        { name: "write_file", args: { path: paths.card, content: card } },
        { name: "request_choice", args: { cardKind: "appointment", flowId: "demo", title: "Select the actual roster", question: "Select implementation", multiple: true, options: [{ id: "impl", label: "Implementation" }] } },
        { name: "write_file", args: { path: paths.card, content: card } },
      ]) } } });
  await firstDraft.send("Ask actual D3 then write only the first draft"); await firstDraft.dispose();
  assert.equal(await fs.readFile(path.join(project.root, paths.card), "utf8"), card);
  assert.equal((await runtime.activateRoleDocuments(activate)).ok, false, "One real draft file must remain inactive while the other two are absent");
  const incomplete = await store.readManifest(); assert.equal(incomplete.ok && incomplete.value.activeRoles, undefined);
  const otherDrafts = await openRoleSession({ roleId: "nominator", project: draftProject, runtime: "demo", autoRepin: false, stablePermitOf: () => undefined,
    activateRoleDocuments: runtime.activateRoleDocuments }, { runtimeOptions: { writeRoot: project.root,
      versionedDocAfterWrite: async () => { throw new Error("No mini-repin for draft role files"); }, providerFactories: {
        demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: paths.boundaryMd, content: md } },
          { name: "write_file", args: { path: paths.boundaryYaml, content: yaml } }, { name: "activate_role_documents", args: activate }]),
      } } });
  await otherDrafts.send("Complete the other two drafts and activate the validated whole role"); await otherDrafts.dispose();
  const activated = await runtime.activateRoleDocuments(activate); assert.equal(activated.status, "applied", JSON.stringify(activated));
  assert.equal(activationNotices.size, 3, "Activation retry reaches each unique recipient with fixed keys");
  assert.ok(activated.evidence); assert.equal(activated.evidence && "runId" in activated.evidence, false);
  const active = await store.readManifest(); assert.ok(active.ok); if (!active.ok) return;
  assert.equal(active.value.trunkVersion, 2); assert.equal(active.value.digest, published.value.digest); assert.equal(active.value.activeRevision, 1);
  assert.equal(active.value.frozenRoles, undefined); assert.ok(active.value.activeRoles?.impl);
  const beforeNoopNotices = activationNotices.size;
  const noChange = await runtime.activateRoleDocuments({ ...activate, operationId: "unchanged-role-activation" }); assert.equal(noChange.status, "no-op", JSON.stringify(noChange));
  assert.equal(activationNotices.size, beforeNoopNotices, "An unchanged already-active result does not broadcast a newly changed permission effect");
  const runId = "run-20261105-demo-realpin";
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft",
    createdAt: at, updatedAt: at, schemas: {}, documents: {}, execution: { teamPlan: null, flow: null } })).ok);
  let pin = await freezeExecutionRun({ projectRoot: project.root, runId, flowId: "demo", operationId: "real-first-pin" });
  assert.equal(pin.ok, existingWorkflow, JSON.stringify(pin));
  if (!existingWorkflow) {
    const workflow = "# Actually approved late workflow\n";
    const stableInput = { kind: "workflow" as const, roleId: "convener", path: PATHS.workflow, oldSha: "", newSha: sha(workflow), decisionId: "actual-stable-customer-decision", at };
    assert.equal((await service.applyStableSnapshot(stableInput)).applied, false, "An input claiming approval cannot replace the real written record and consumed permit");
    const integration = createVersionChangeIntegration({ projectRoot: project.root, migrationCompleted: () => true, now: () => new Date(at) });
    const requested = await integration.services.stableWrite.request({ roleId: "convener", kind: "workflow", content: workflow, at });
    assert.ok(requested.ok, JSON.stringify(requested)); if (!requested.ok) return;
    const approved = await integration.services.stableWrite.approve(requested.value.requestId, { decisionId: stableInput.decisionId, at });
    assert.ok(approved.ok, JSON.stringify(approved)); if (!approved.ok) return;
    // The Service-layer fixture performs the exact approved bytes; no storage or permission state is seeded.
    await fs.writeFile(path.join(project.root, PATHS.workflow), workflow);
    assert.equal((await service.applyStableSnapshot(stableInput)).applied, false, "Approved but unconsumed permission is not a completed stable write");
    const completedWrite = await integration.services.stableWrite.completeWrite({ requestId: requested.value.requestId, actualSha256: sha(workflow), at });
    assert.ok(completedWrite.ok, JSON.stringify(completedWrite)); if (!completedWrite.ok) return;
    assert.equal(completedWrite.value.repin.applied, true, JSON.stringify(completedWrite.value));
    const attached = await store.readManifest(); assert.ok(attached.ok); if (!attached.ok) return;
    assert.equal(attached.value.trunkVersion, 2); assert.equal(attached.value.digest, published.value.digest);
    assert.equal(attached.value.activeDigest, active.value.activeDigest); assert.equal(attached.value.artifacts.workflow?.sha256, sha(workflow));
    const originalPlan = await service.recoverDirect(input.operationId); assert.equal(originalPlan.status, "applied", JSON.stringify(originalPlan));
    assert.ok((await store.readManifestAt!({ version: 2, digest: published.value.digest }, published.value.snapshotRef)).ok,
      "The original document commit keeps its exact pre-workflow snapshot proof");
    pin = await freezeExecutionRun({ projectRoot: project.root, runId, flowId: "demo", operationId: "real-first-pin" });
    assert.ok(pin.ok, JSON.stringify(pin));
    assert.equal((await service.applyStableSnapshot(stableInput)).applied, false, "A pinned run is never rewritten by late workflow recovery");
    const planV3Path = "docs/scheduling/demo-team-v3.md", planV3Text = `---\n${JSON.stringify({ ...plan, version: 3 })}\n---\n# Real next plan\n`;
    await fs.writeFile(path.join(project.root, planV3Path), planV3Text);
    const nextPlan = await service.completeTeamPlan({ operationId: "plan-after-initial-workflow", flowId: "demo", baseDigest: attached.value.digest,
      plan: { path: planV3Path, sha256: sha(planV3Text), version: 3 } }, "convener");
    assert.equal(nextPlan.status, "applied", JSON.stringify(nextPlan));
    const afterNext = await store.readManifest(); assert.equal(afterNext.ok && afterNext.value.trunkVersion, 3, "Same-version initial workflow history cannot block the next real document publication");
  }
  if (pin.ok) {
    const currentActive = await store.readManifest(); assert.ok(currentActive.ok); if (!currentActive.ok) return;
    const activeRef = currentActive.value.activeRoles?.impl; assert.ok(activeRef); if (!activeRef) return;
    assert.equal((await store.readProjectFile!(activeRef.authorizationRef.path)).ok, false, "Application-owned authorization bytes need no physical worktree projection");
    const actualActive = await store.readActiveRoleEvidence!(activeRef); assert.ok(actualActive.ok); if (!actualActive.ok) return;
    const actualAuthorization = actualActive.value.files.find(file => file.path === activeRef.authorizationRef.path);
    assert.equal(actualAuthorization?.sha256, activeRef.authorizationRef.sha256);
    assert.equal(actualAuthorization && sha(Buffer.from(actualAuthorization.bytesBase64, "base64")), activeRef.authorizationRef.sha256);
    assert.equal((await store.readActiveRoleEvidence!({ ...activeRef, authorizationRef: { ...activeRef.authorizationRef, sha256: "0".repeat(64) } })).ok, false, "A changed immutable authorization reference is still refused");
    const publicShape = validateRunManifest(pin.run); assert.ok(publicShape.ok, JSON.stringify(publicShape));
    assert.deepEqual(pin.run.schemas, { run: pin.run.schema }, "The producer declares its actual run envelope only, never a future document approval/schema");
    assert.equal(validateRunManifest({ ...pin.run, schemas: undefined }).ok, false, "The original consumer still rejects absent schema declarations");
    assert.equal(validateRunManifest({ ...pin.run, schema: "ans-run/v2" }).ok, false);
    const actualRecord = await store.readRunRecord!(runId); assert.ok(actualRecord.ok); if (actualRecord.ok) assert.deepEqual(actualRecord.value.value, pin.run);
    assert.equal(pin.frozenRoles.impl!.runId, runId); assert.equal(pin.frozenRoles.impl!.pinDigest, pin.pinDigest);
    assert.ok(FROZEN_ROLE_REF_KEYS.every(key => pin.frozenRoles.impl![key].snapshotId === pin.snapshotRef.snapshotId));
    assert.ok((await readRunRoleContext({ projectRoot: project.root, runId, roleId: "impl" })).ok);
    const dispatch = await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "convener", targetRoleId: "impl", flowId: "demo", runId, moduleId: "impl-core" });
    assert.equal(dispatch.ok && dispatch.value.kind, "execution", JSON.stringify(dispatch));
    assert.deepEqual(dispatch.ok && dispatch.value.modulePaths, ["src/impl/"]);
    const parentTaskId = "actual-execution-convener";
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.created", taskId: parentTaskId, flowId: "demo", from: "chief", to: "convener",
      text: "Organize this real execution run", runId, runState: "pinned", sideEffect: "code", idempotencyKey: parentTaskId } })).ok);
    const parentRef = await prepareParentTaskRef({ projectRoot: project.root, actorRoleId: "convener", taskId: parentTaskId, flowId: "demo", runId }); assert.ok(parentRef.ok); if (!parentRef.ok) return;
    const assigned: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "actual-scoped-worker", flowId: "demo", from: "convener", to: "impl", text: "Implement the assigned module", parentTaskRef: parentRef.parentTaskRef,
      runId, runState: "pinned", moduleId: "impl-core", moduleDirectory: "src/impl/", modulePaths: ["src/impl/"], sideEffect: "code", idempotencyKey: "actual-scoped-worker" };
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: assigned })).ok);
    const scope = await prepareAssignedTaskWriteScope({ projectRoot: project.root, taskId: assigned.taskId, actorRoleId: "impl" }); assert.ok(scope.ok, JSON.stringify(scope)); if (scope.ok) assert.deepEqual(scope.value.paths, ["src/impl/"]);
    assert.equal((await inspectAssignedTask({ projectRoot: project.root, taskId: assigned.taskId, actorRoleId: "someone-else" })).ok, false);
    assert.equal((await inspectAssignedTask({ projectRoot: project.root, taskId: assigned.taskId, actorRoleId: "impl" })).ok, true);
    assert.ok(dispatch.ok); if (dispatch.ok) {
      const workerProject: ProjectConfig = { projectRoot: project.root, skillRoot: path.join(project.root, "skill-root"), governanceModel: "trio", roles: { impl: { card: paths.card, boundary: paths.boundaryYaml } },
        documentContext: dispatch.value.documentContext };
      const worker = await openRoleSession({ roleId: "impl", project: workerProject, runtime: "demo", taskId: assigned.taskId, autoRepin: false }, { runtimeOptions: { writeRoot: project.root,
        providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: "src/impl/task-owned.ts", content: "actual assigned nested file" } }]) } } });
      await worker.send("Write within the actual assigned directory"); await worker.dispose();
      assert.equal(await fs.readFile(path.join(project.root, "src/impl/task-owned.ts"), "utf8"), "actual assigned nested file", "A directory is a task scope, not an exact-file writeSet entry");
      const bad = { ...assigned, taskId: "actual-wrong-module", moduleId: "not-owned", idempotencyKey: "actual-wrong-module" };
      assert.ok((await recordTaskObservation({ projectRoot: project.root, event: bad })).ok);
      const blockedWorker = await openRoleSession({ roleId: "impl", project: workerProject, runtime: "demo", taskId: bad.taskId, autoRepin: false }, { runtimeOptions: { writeRoot: project.root,
        providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: "write_file", args: { path: "src/impl/wrong-task.ts", content: "must not be written" } }]) } } });
      await blockedWorker.send("A same-role boundary cannot override the actual task module"); await blockedWorker.dispose();
      assert.equal(await fs.stat(path.join(project.root, "src/impl/wrong-task.ts")).then(() => true, () => false), false);
    }
    assert.equal((await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "chief", targetRoleId: "impl", flowId: "demo", runId, moduleId: "impl-core" })).ok, false);
    assert.equal((await prepareRoleDispatch({ projectRoot: project.root, fromRoleId: "convener", targetRoleId: "impl", flowId: "demo", runId, moduleId: "someone-elses-module" })).ok, false);
    const beforeTransition = await store.readRunRecord!(runId); assert.ok(beforeTransition.ok); if (!beforeTransition.ok) return;
    const requesterId = "actual-old-run-rapporteur";
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.created", taskId: requesterId, from: "chief", to: "rapporteur",
      flowId: "demo", runId, runState: "pinned", text: "Select an actual run transition", sideEffect: "docs", idempotencyKey: requesterId } })).ok);
    const transitionTarget = await store.readManifest(); assert.ok(transitionTarget.ok); if (!transitionTarget.ok) return;
    const transitionRequest = { operationId: "real-prepare-restart", runId, expectedPinDigest: pin.pinDigest, mode: "stop-and-restart" as const,
      targetTrunk: { version: transitionTarget.value.trunkVersion, digest: transitionTarget.value.digest }, reason: "Prepare the real target before stopping anything" };
    const missingTarget = await service.prepareRunChange({ request: { ...transitionRequest, targetTrunk: { version: 999, digest: "0".repeat(64) } }, actorRoleId: "rapporteur", taskId: requesterId });
    assert.equal(missingTarget.ok, false); assert.deepEqual(await store.readRunRecord!(runId), beforeTransition, "Rejected target cannot stop or modify the old execution");
    const restart = await service.prepareRunChange({ request: transitionRequest, actorRoleId: "rapporteur", taskId: requesterId });
    if (existingWorkflow) {
    assert.ok(restart.ok, JSON.stringify(restart)); if (!restart.ok || !restart.value.replacement) return;
    assert.notEqual(restart.value.replacement.runId, runId); assert.equal(restart.value.replacement.alreadyPinned, false);
    assert.ok(validateRunManifest(restart.value.replacement.nextRun).ok);
    const actualReplacement = await store.readRunRecord!(restart.value.replacement.runId); assert.ok(actualReplacement.ok); if (!actualReplacement.ok) return;
    assert.equal(actualReplacement.value.value.state, "draft", "Preparation owns only a real draft; no replacement is pinned before actual stop");
    assert.deepEqual(actualReplacement.value.value.runChangeSource, restart.value.runChangeSource);
    const prematurePin = await freezeExecutionRun({ projectRoot: project.root, runId: restart.value.replacement.runId, flowId: "demo", operationId: "no-pin-before-actual-stop" });
    assert.ok(!prematurePin.ok); assert.match(prematurePin.message, /only be pinned.*stopped-old-run/);
    assert.deepEqual(await store.readRunRecord!(restart.value.replacement.runId), actualReplacement, "The ordinary freeze path cannot prematurely pin a restart target");
    const repeat = await service.prepareRunChange({ request: transitionRequest, actorRoleId: "rapporteur", taskId: requesterId });
    assert.ok(repeat.ok); if (repeat.ok) assert.equal(repeat.value.replacement?.runId, restart.value.replacement.runId);
    assert.equal((await service.prepareRunChange({ request: { ...transitionRequest, reason: "Different request under the same operation" }, actorRoleId: "rapporteur", taskId: requesterId })).ok, false);
    assert.equal((await service.prepareRunChange({ request: transitionRequest, actorRoleId: "rapporteur", taskId: requesterId, replacementRunId: "run-model-invented-target" })).ok, false);
    assert.deepEqual(await store.readRunRecord!(runId), beforeTransition, "Successful target preparation still does not stop or repin old execution");
    const hub = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "rapporteur", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: {
      registration: { source: "native-directory-selection", selectionId: "unit-run-change-selection", selectedRoot: project.root, projectRoot: project.root, selectedAt: at, listingGeneration: 1 },
      parent: { roleId: "chief", runtime: "codex", sessionId: "unit-trusted-run-change-chief", turnId: "new-doc-change", kind: "message", inputAccepted: true, settled: false } } });
    assert.ok(hub.ok); if (!hub.ok || !hub.value.initializationSource || !hub.value.runId) return;
    const hubRef = hub.value.initializationSource, hubTask: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "actual-hub-change-requester", from: "chief", to: "rapporteur",
      flowId: "demo", runId: hub.value.runId, runState: "draft", text: "Assess this actual change target", hubRouting: "chief-hub-v1", sideEffect: "docs", idempotencyKey: "actual-hub-change-requester",
      workSourceRef: { kind: hubRef.kind ?? "chief-customer-turn", sourceId: hubRef.sourceId, path: hubRef.path, sha256: hubRef.sha256 } };
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: hubTask })).ok);
    const requesterProcess = await service.readTaskProcessSource({ taskId: hubTask.taskId, actorRoleId: "rapporteur", flowId: "demo", runId: hub.value.runId });
    assert.ok(requesterProcess.ok, JSON.stringify(requesterProcess)); if (!requesterProcess.ok) return;
    assert.equal(requesterProcess.value.parentCoreSessionId, "unit-trusted-run-change-chief");
    assert.deepEqual(requesterProcess.value.workSourceRef, hubTask.workSourceRef);
    assert.equal((await service.readTaskProcessSource({ taskId: hubTask.taskId, actorRoleId: "rapporteur", flowId: "demo", runId })).ok, false,
      "Requester process provenance cannot be borrowed from the selected old execution run");
    const noM0 = await service.prepareRunChange({ request: { ...transitionRequest, operationId: "hub-no-confirmed-target" }, actorRoleId: "rapporteur", taskId: hubTask.taskId });
    assert.ok(!noM0.ok); assert.match(noM0.message ?? "", /intent.*not confirmed/i, "A real new Hub requester is recognized, but its legacy fixture has no actual selected-target confirmation; routing alone is not effect permission");
    const source = { oldRunId: runId, oldSha256: beforeTransition.value.sha256, requesterTaskId: hubTask.taskId,
      requesterDigest: sha(JSON.stringify(hubTask)), requestDigest: sha(JSON.stringify(transitionRequest)) };
    const activeBasis = { revision: transitionTarget.value.activeRevision!, digest: transitionTarget.value.activeDigest! };
    const providerDraft = (id: string) => ({ schema: "ans-run/v1", schemas: { run: "ans-run/v1" }, runId: id, flowId: "demo", state: "draft", createdAt: at, updatedAt: at,
      documents: {}, execution: { teamPlan: null, flow: null }, runChangeSource: source });
    const casBasis = { trunk: transitionRequest.targetTrunk, active: activeBasis, snapshot: transitionTarget.value.snapshotRef, runChangeSource: source };
    assert.equal((await store.compareAndSwapRunRecord!("run-provider-old-sha-negative", null, { ...providerDraft("run-provider-old-sha-negative"), runChangeSource: { ...source, oldSha256: "0".repeat(64) } },
      { ...casBasis, runChangeSource: { ...source, oldSha256: "0".repeat(64) } })).ok, false);
    assert.ok((await store.compareAndSwapRunRecord!("run-provider-hub-source", null, providerDraft("run-provider-hub-source"), casBasis)).ok, "Provider R9 joins the actual independent Hub requester and old run without stopping/pinning either");
    assert.ok((await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.reported", taskId: hubTask.taskId, from: "rapporteur", status: "blocked", summary: "Applicable confirmation is missing" } })).ok);
    const hubCloseBasis = await service.prepareCreatedTaskClose(hubTask.taskId, "chief"); assert.ok(hubCloseBasis.ok); if (!hubCloseBasis.ok) return;
    assert.equal((await service.closeCreatedTask({ operationId: "close-hub-change-requester", taskId: hubTask.taskId, runId: hub.value.runId, reportRef: hubCloseBasis.value.reportRef,
      basisDigest: hubCloseBasis.value.basisDigest, outcome: "rejected" }, "chief")).status, "applied");
    assert.equal((await service.readTaskProcessSource({ taskId: hubTask.taskId, actorRoleId: "rapporteur", flowId: "demo", runId: hub.value.runId })).ok, false);
    assert.equal((await store.compareAndSwapRunRecord!("run-provider-closed-source", null, providerDraft("run-provider-closed-source"), casBasis)).ok, false, "A real closed requester invalidates the same R9 source even though its old run still exists");
    assert.deepEqual(await store.readRunRecord!(runId), beforeTransition);

    } else {
      assert.ok(!restart.ok); assert.match(restart.message ?? "", /no activation for this actual plan/);
      assert.deepEqual(await store.readRunRecord!(runId), beforeTransition, "A newly published plan without its applicable activation cannot stop the old run");
    }

  }
  const malformedCard = "# Incomplete replacement card\n";
  await fs.writeFile(path.join(project.root, paths.card), malformedCard);
  assert.equal((await runtime.activateRoleDocuments({ ...activate, operationId: "reject-incomplete-new-card",
    documents: { ...activate.documents, card: { path: paths.card, sha256: sha(malformedCard) } } })).ok, false);
  const retained = await store.readManifest(); assert.equal(retained.ok && retained.value.activeRevision, 1);
  for (const file of Object.values(paths)) await fs.unlink(path.join(project.root, file));
  assert.deepEqual(await runtime.activateRoleDocuments(activate), activated, "Committed activation replays from its original bytes after live drafts disappear");
  if (pin.ok) {
    const preserved = await freezeExecutionRun({ projectRoot: project.root, runId, flowId: "demo", operationId: "never-repin-existing-run" });
    assert.equal(preserved.ok && preserved.pinDigest, pin.pinDigest, "Existing run uses its actual old immutable evidence rather than missing live cards");
  }
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-direct-"));
  await fs.mkdir(path.join(root, "docs"));
  const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0, 0xff, 0x0d, 0x0a]);
  await fs.writeFile(path.join(root, "docs/workflow.md"), bytes);
  const store = createFsTrunkStore(root);
  const captured = await store.captureSnapshot!({ snapshotId: "s1", createdAt: at,
    files: [{ path: "docs/workflow.md", sha256: sha(bytes) }] });
  if (!captured.ok) throw new Error(captured.message ?? captured.reason);
  assert.equal(captured.ok, true);
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1,
    source: "bootstrap", previous: null, flowId: "demo", runId: null,
    artifacts: { documents: {}, execution: { teamPlan: null, flow: null },
      workflow: { kind: "workflow", path: "docs/workflow.md", sha256: sha(bytes) }, boundaries: {} },
    snapshotRef: captured.value, digest: sha("manifest1"), createdAt: at, updatedAt: at };
  return { root, store, bytes, ref: captured.value, manifest };
}

for (const actor of ["chief", "convener"] as const) test(`Planning draft close: ${actor} binds actual run/report/material, refuses stale evidence and returns lifecycle receipts without model broadcasts`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-draft-close-")), store = createFsTrunkStore(root);
  const runId = `run-draft-${actor}`, material = "docs/product/demo-intent-v1.md";
  const text = "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\n# Actual initial planning material\n";
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true }); await fs.writeFile(path.join(root, material), text);
  const run = { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, execution: { teamPlan: null, flow: null }, createdAt: at, updatedAt: at };
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, run)).ok);
  let assignedParent: import("../../src/model/runtime.ts").TaskParentRef | undefined;
  if (actor === "convener") {
    const parentId = "actual-chief-assigned-planning";
    assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: parentId, from: "chief", to: "convener",
      flowId: "demo", runId, runState: "draft", text: "Coordinate this actual planning task", sideEffect: "docs", idempotencyKey: parentId } })).ok);
    const parent = await prepareParentTaskRef({ projectRoot: root, actorRoleId: "convener", taskId: parentId, flowId: "demo", runId }); assert.ok(parent.ok); if (!parent.ok) return; assignedParent = parent.parentTaskRef;
  }
  const created: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: `planning-${actor}`, from: actor,
    to: actor === "chief" ? "convener" : "rapporteur", ...(assignedParent ? { parentTaskRef: assignedParent } : {}), text: "Prepare the actual planning basis", flowId: "demo", runId, runState: "draft", sideEffect: "docs", idempotencyKey: `planning-${actor}` };
  const report: TaskReportedEvent = { v: 1, at, kind: "task.reported", taskId: created.taskId, from: created.to, status: "done", summary: "Planning material prepared", evidence: [material] };
  const createdResult = await recordTaskObservation({ projectRoot: root, event: created }); assert.ok(createdResult.ok, JSON.stringify(createdResult));
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { ...report, evidence: undefined } })).ok);
  assert.equal((await prepareCreatedTaskClose({ projectRoot: root, actorRoleId: actor, taskId: created.taskId })).ok, false, "A report claim alone is not actual planning material");
  assert.ok((await recordTaskObservation({ projectRoot: root, event: report })).ok);
  assert.equal((await recordTaskObservation({ projectRoot: root, event: { ...created, taskId: "worker-draft", idempotencyKey: "worker-draft", to: "worker" } })).ok, false);
  const prepare = () => prepareCreatedTaskClose({ projectRoot: root, actorRoleId: actor, taskId: created.taskId });
  assert.equal((await prepareCreatedTaskClose({ projectRoot: root, actorRoleId: actor === "chief" ? "convener" : "chief", taskId: created.taskId })).ok, false);
  const initial = await prepare(); assert.ok(initial.ok, JSON.stringify(initial)); if (!initial.ok) return;
  const runPath = path.join(root, `.ans/runs/${runId}/manifest.json`), runBytes = await fs.readFile(runPath);
  await fs.unlink(runPath); assert.equal((await prepare()).ok, false, "A nonexistent draft run is not manufactured"); await fs.writeFile(runPath, runBytes);
  const input = { operationId: `close-draft-${actor}`, taskId: created.taskId, runId, basisDigest: initial.basisDigest, reportRef: initial.reportRef, outcome: "accepted" as const };
  const storedRun = await store.readRunRecord!(runId); assert.ok(storedRun.ok); if (!storedRun.ok) return;
  assert.ok((await store.compareAndSwapRunRecord!(runId, storedRun.value.sha256, { ...run, updatedAt: "2026-11-05T00:01:00.000Z" })).ok);
  assert.equal((await createDirectRoleRuntime({ projectRoot: root, actorRoleId: actor }).closeCreatedTask(input)).ok, false, "A changed actual draft run invalidates its old material basis");
  const changedRun = await store.readRunRecord!(runId); assert.ok(changedRun.ok); if (!changedRun.ok) return;
  assert.ok((await store.compareAndSwapRunRecord!(runId, changedRun.value.sha256, run)).ok);
  assert.equal((await store.readManifest()).ok, false, "Draft close never fabricates a trunk or future authorization");
  const frozen = await store.readSnapshotArtifact!(initial.reportRef); assert.ok(frozen.ok);
  if (frozen.ok) assert.equal(Buffer.from(frozen.value.snapshot.files.find(file => file.path === material)!.bytesBase64, "base64").toString(), text);
  await fs.writeFile(path.join(root, material), text + "Changed before closure\n");
  assert.equal((await createDirectRoleRuntime({ projectRoot: root, actorRoleId: actor }).closeCreatedTask(input)).ok, false);
  await fs.writeFile(path.join(root, material), text.replace("flowId: demo", "flowId: other")); assert.equal((await prepare()).ok, false);
  await fs.writeFile(path.join(root, material), text);
  // Real material mutation after Service preparation must still be rejected by the locked Provider CAS.
  const service = createTrunkService({ projectRoot: root, freezeRegistry: createGuardFreezeRegistry(root), store: { ...store,
    async prepareSnapshot(snapshot) { const value = await store.prepareSnapshot!(snapshot); await fs.writeFile(path.join(root, material), text + "Concurrent material edit\n"); return value; },
  } });
  assert.equal((await service.closeCreatedTask(input, actor)).status, "rejected");
  assert.equal((await readTaskState(root)).records.get(created.taskId)?.closed, undefined);
  await fs.writeFile(path.join(root, material), text);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { ...report, summary: "Newest actual planning report" } })).ok);
  assert.equal((await createDirectRoleRuntime({ projectRoot: root, actorRoleId: actor }).closeCreatedTask(input)).ok, false);
  const latest = await prepare(); assert.ok(latest.ok); if (!latest.ok) return;
  const currentInput = { ...input, basisDigest: latest.basisDigest, reportRef: latest.reportRef };
  const missingSink = createDirectRoleRuntimeBase({ projectRoot: root, actorRoleId: actor });
  const committed = await missingSink.closeCreatedTask(currentInput);
  assert.equal(committed.status, "applied", JSON.stringify(committed));
  assert.equal((await readTaskState(root)).records.get(created.taskId)?.closed?.by, actor);
  const delivered = new Set<string>();
  const runtime = createDirectRoleRuntimeBase({ projectRoot: root, actorRoleId: actor, notifyDirect: async item => { delivered.add(item.key); throw new Error("No task lifecycle model broadcast is expected"); } });
  const recovered = await runtime.closeCreatedTask(currentInput); assert.equal(recovered.status, "applied"); assert.equal(delivered.size, 0);
  assert.deepEqual(await runtime.closeCreatedTask(currentInput), recovered);
  const ledger = await fs.readFile(path.join(root, ".ans/state/tasks.jsonl"), "utf8");
  assert.equal(ledger.trim().split("\n").map(line => JSON.parse(line)).filter(row => row.kind === "task.closed").length, 1);
  const raceTask = { ...created, taskId: `draft-race-${actor}`, idempotencyKey: `draft-race-${actor}` }, raceReport = { ...report, taskId: `draft-race-${actor}` };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: raceTask })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: raceReport })).ok);
  const raceBasis = await prepareCreatedTaskClose({ projectRoot: root, actorRoleId: actor, taskId: raceTask.taskId }); assert.ok(raceBasis.ok);
  if (raceBasis.ok) {
    const results = await Promise.all([createDirectRoleRuntime({ projectRoot: root, actorRoleId: actor }).closeCreatedTask({ ...input,
      operationId: `draft-race-close-${actor}`, taskId: raceTask.taskId, basisDigest: raceBasis.basisDigest, reportRef: raceBasis.reportRef }),
      recordTaskObservation({ projectRoot: root, event: { ...raceReport, summary: "Concurrent latest draft report" } })]);
    assert.equal(results.filter(result => result.ok).length, 1, "Actual draft latest-report and old-basis close cannot both commit");
  }
});

test("Provider: complete snapshot preserves arbitrary bytes, survives live deletion, rejects mutation", async () => {
  const f = await fixture();
  const read = await f.store.readSnapshot!(f.ref); assert.equal(read.ok, true); if (!read.ok) return;
  assert.deepEqual(Buffer.from(read.value.files[0]!.bytesBase64, "base64"), f.bytes);
  await fs.unlink(path.join(f.root, "docs/workflow.md"));
  const copy = await f.store.captureSnapshot!({ snapshotId: "s2", createdAt: at, baseSnapshotRef: f.ref,
    files: [{ path: "docs/workflow.md", sha256: sha(f.bytes) }] });
  assert.equal(copy.ok, true);
  assert.equal((await f.store.prepareSnapshot!({ ...read.value, files: [{ ...read.value.files[0]!, bytesBase64: "YQ==" }] })).ok, false);
  assert.equal((await f.store.readSnapshot!({ ...f.ref, digest: sha("wrong") })).ok, false);
});

test("Provider: CAS commits one complete target, rejects stale base/flow and missing unchanged refs", async () => {
  const f = await fixture();
  const initial = await f.store.compareAndSwapManifest!(null, f.manifest, f.ref); assert.deepEqual(initial, { ok: true });
  const next = { ...f.manifest, trunkVersion: 2, digest: sha("manifest2") };
  const outcomes = await Promise.all([createFsTrunkStore(f.root), createFsTrunkStore(f.root)].map(store =>
    store.compareAndSwapManifest!({ version: 1, digest: f.manifest.digest }, next, f.ref)));
  assert.equal(outcomes.filter(result => result.ok).length, 1);
  assert.equal(outcomes.filter(result => !result.ok && result.code === "conflict").length, 1);
  assert.equal((await f.store.writeManifest(next)).ok, false);
  const incomplete = structuredClone(next); incomplete.artifacts.documents.proposal = { path: "docs/missing.md", sha256: sha("missing") };
  assert.equal((await f.store.compareAndSwapManifest!({ version: 2, digest: next.digest }, incomplete, f.ref)).ok, false);
  assert.equal((await f.store.readManifest()).ok, true);
});

test("Run storage/Service: byte CAS has one writer; executable reads require real workflow and all same-pin refs", async () => {
  const f = await fixture(), runId = "run-real-basis", pinDigest = sha("real-run-pin");
  const ref = { snapshotId: f.ref.snapshotId, path: "docs/workflow.md", sha256: sha(f.bytes) };
  const role: FrozenRoleEvidence = { runId, pinDigest, roleId: "worker", snapshotRef: f.ref,
    rosterRef: ref, planRef: ref, d3Ref: ref, activationRef: ref, cardRef: ref, boundaryMdRef: ref, boundaryYamlRef: ref, authorizationRef: ref };
  const run = { schema: "ans-run/v1", runId, flowId: "demo", state: "pinned", roles: ["worker"], pinDigest,
    snapshotRef: f.ref, workflowRef: ref, frozenRoles: { worker: role } };
  assert.equal((await f.store.compareAndSwapRunRecord!(runId, null, run)).ok, true);
  const old = await f.store.readRunRecord!(runId); assert.ok(old.ok); if (!old.ok) return;
  const results = await Promise.all([f.store, createFsTrunkStore(f.root)].map(store => store.compareAndSwapRunRecord!(runId, old.value.sha256, { ...run, updatedAt: at })));
  assert.equal(results.filter(result => result.ok).length, 1);
  const service = createTrunkService({ projectRoot: f.root });
  await fs.unlink(path.join(f.root, "docs/workflow.md"));
  const basis = await service.readRunEvidence(runId); assert.ok(basis.ok, JSON.stringify(basis));
  assert.equal((await f.store.compareAndSwapManifest!(null, f.manifest, f.ref)).ok, true);
  const select = { operationId: "run-choice-1", runId, expectedPinDigest: pinDigest, targetTrunk: { version: 1, digest: f.manifest.digest },
    mode: "continue-frozen" as const, reason: "Finish this actual frozen run first" };
  assert.equal((await createDirectRoleRuntime({ projectRoot: f.root, actorRoleId: "chief" }).selectRunChange(select)).ok, false);
  assert.equal((await createDirectRoleRuntimeBase({ projectRoot: f.root, actorRoleId: "rapporteur" }).selectRunChange(select)).status, "committed-pending-recovery");
  const runNotices = new Set<string>();
  const runtime = createDirectRoleRuntime({ projectRoot: f.root, actorRoleId: "rapporteur", notifyDirect: async item => { runNotices.add(item.key); } });
  const choice = await runtime.selectRunChange(select); assert.equal(choice.status, "applied", JSON.stringify(choice));
  assert.deepEqual(await runtime.selectRunChange(select), choice);
  assert.equal(runNotices.size, 3);
  assert.equal((await runtime.selectRunChange({ ...select, reason: "reuse id with changed decision" })).ok, false);
  const beforeStop = await f.store.readRunRecord!(runId);
  const blocked = await runtime.selectRunChange({ ...select, operationId: "run-stop-1", mode: "stop-and-restart" });
  assert.equal(blocked.status, "blocked", "Missing actual lifecycle stop proof cannot manufacture a replacement run");
  assert.deepEqual(await f.store.readRunRecord!(runId), beforeStop);
  assert.equal((await f.store.compareAndSwapManifest!({ version: 1, digest: f.manifest.digest }, { ...f.manifest, trunkVersion: 2, digest: sha("new-doc-only") }, f.ref)).ok, true);
  const context = await readRunRoleContext({ projectRoot: f.root, runId, roleId: "worker" });
  assert.equal(context.ok && context.documentContext.pinDigest, pinDigest, "Document publication preserves the old run pin");
  assert.equal((await readRunRoleContext({ projectRoot: f.root, runId, roleId: "stranger" })).ok, false);
  const created: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "task-real-report", flowId: "demo", from: "convener", to: "worker", text: "Implement module",
    sideEffect: "code", idempotencyKey: "task-real-report", runId, runState: "pinned" };
  const report: TaskReportedEvent = { v: 1, at, kind: "task.reported", taskId: created.taskId, from: "worker", status: "done", summary: "Actual implementation report" };
  await fs.mkdir(path.join(f.root, ".ans/state"), { recursive: true });
  await fs.writeFile(path.join(f.root, ".ans/state/tasks.jsonl"), `${JSON.stringify(created)}\n${JSON.stringify(report)}\n`);
  const closeBasis = await prepareCreatedTaskClose({ projectRoot: f.root, actorRoleId: "convener", taskId: created.taskId });
  assert.equal(closeBasis.ok, true, JSON.stringify(closeBasis));
  assert.equal((await prepareCreatedTaskClose({ projectRoot: f.root, actorRoleId: "chief", taskId: created.taskId })).ok, false);
  if (closeBasis.ok) {
    assert.equal(closeBasis.runId, runId); assert.equal(closeBasis.basisDigest, pinDigest);
    assert.equal(closeBasis.reportRef.sha256, sha(JSON.stringify(report)), "The reference binds the actual latest report line bytes");
    await fs.appendFile(path.join(f.root, ".ans/state/tasks.jsonl"), `${JSON.stringify({ ...report, summary: "A real superseding report" })}\n`);
    const newer = await prepareCreatedTaskClose({ projectRoot: f.root, actorRoleId: "convener", taskId: created.taskId });
    assert.equal(newer.ok, true); assert.notDeepEqual(newer.ok && newer.reportRef, closeBasis.reportRef);
    const creator = createDirectRoleRuntime({ projectRoot: f.root, actorRoleId: "convener" });
    const stale = { operationId: "close-old-report", taskId: created.taskId, runId, basisDigest: pinDigest, reportRef: closeBasis.reportRef, outcome: "accepted" as const };
    assert.equal((await creator.closeCreatedTask(stale)).ok, false);
    if (newer.ok) {
      const input = { ...stale, operationId: "close-current-report", reportRef: newer.reportRef };
      assert.equal((await createDirectRoleRuntime({ projectRoot: f.root, actorRoleId: "chief" }).closeCreatedTask(input)).ok, false);
      const closed = await creator.closeCreatedTask(input); assert.equal(closed.status, "applied", JSON.stringify(closed));
      assert.equal(closed.taskStatus, "closed"); assert.ok(closed.eventId);
      assert.equal(closed.source?.kind === "role-direct" && closed.source.actorRoleId, "convener");
      assert.deepEqual(await creator.closeCreatedTask(input), closed);
      assert.equal((await creator.closeCreatedTask({ ...input, outcome: "rework" })).ok, false);
      assert.equal((await recordTaskObservation({ projectRoot: f.root, event: { ...report, summary: "Too late after real close" } })).ok, false);
      const ledger = await readTaskState(f.root); assert.deepEqual(ledger.errors, []); assert.equal(ledger.records.get(created.taskId)?.closed?.by, "convener");
    }
  }
  const parentId = "actual-pinned-run-convener";
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: { v: 1, at, kind: "task.created", taskId: parentId, from: "chief", to: "convener", flowId: "demo", runId,
    runState: "pinned", text: "Coordinate the already pinned real run", sideEffect: "code", idempotencyKey: parentId } })).ok);
  const parent = await prepareParentTaskRef({ projectRoot: f.root, actorRoleId: "convener", taskId: parentId, flowId: "demo", runId }); assert.ok(parent.ok); if (!parent.ok) return;
  const raceTask = { ...created, taskId: "task-report-close-race", idempotencyKey: "task-report-close-race", parentTaskRef: parent.parentTaskRef };
  const raceReport = { ...report, taskId: raceTask.taskId };
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: raceTask })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: f.root, event: raceReport })).ok);
  const raceBasis = await prepareCreatedTaskClose({ projectRoot: f.root, actorRoleId: "convener", taskId: raceTask.taskId }); assert.ok(raceBasis.ok);
  if (raceBasis.ok) {
    const close = createDirectRoleRuntime({ projectRoot: f.root, actorRoleId: "convener" });
    const results = await Promise.all([close.closeCreatedTask({ operationId: "real-close-race", taskId: raceTask.taskId, runId,
      basisDigest: pinDigest, reportRef: raceBasis.reportRef, outcome: "accepted" }),
      recordTaskObservation({ projectRoot: f.root, event: { ...raceReport, summary: "Competing current report" } })]);
    assert.equal(results.filter(result => result.ok).length, 1, "A newer report and closure of its older basis cannot both commit");
  }
  const current = await f.store.readRunRecord!(runId); assert.ok(current.ok); if (!current.ok) return;
  const { workflowRef: omitted, ...noWorkflow } = run; void omitted;
  assert.equal((await f.store.compareAndSwapRunRecord!(runId, current.value.sha256, noWorkflow)).ok, true);
  assert.equal((await service.readRunEvidence(runId)).ok, false, "Planning-only data cannot start an executable run");
  const missing = await f.store.readRunRecord!(runId); assert.ok(missing.ok); if (!missing.ok) return;
  assert.equal((await f.store.compareAndSwapRunRecord!(runId, missing.value.sha256, { ...run, frozenRoles: {} })).ok, true);
  assert.equal((await service.readRunEvidence(runId)).ok, false, "A historical pin cannot be refilled from live role documents");
});

test("Provider: frozen role evidence requires all eight refs in one immutable snapshot; no live fallback", async () => {
  const f = await fixture();
  const artifact = { snapshotId: f.ref.snapshotId, path: "docs/workflow.md", sha256: sha(f.bytes) };
  const evidence = { runId: "run1", pinDigest: sha("pin"), roleId: "worker", snapshotRef: f.ref,
    ...Object.fromEntries(FROZEN_ROLE_REF_KEYS.map(key => [key, { ...artifact }])) } as unknown as FrozenRoleEvidence;
  assert.equal((await f.store.readFrozenRoleEvidence!(evidence)).ok, true);
  assert.equal((await f.store.readFrozenRoleEvidence!({ ...evidence, cardRef: { ...artifact, path: "docs/live-only.md" } })).ok, false);
  assert.equal((await f.store.readFrozenRoleEvidence!({ ...evidence, authorizationRef: undefined } as unknown as FrozenRoleEvidence)).ok, false);
  const other = { ...artifact, snapshotId: "another" }; assert.equal((await f.store.readFrozenRoleEvidence!({ ...evidence, d3Ref: other })).ok, false);
});

test("Provider: document and active-role CAS fence both dimensions and preserve independent snapshots/history", async () => {
  const f = await fixture(); assert.ok((await f.store.compareAndSwapManifest!(null, f.manifest, f.ref)).ok);
  const ref = { snapshotId: f.ref.snapshotId, path: "docs/workflow.md", sha256: sha(f.bytes) };
  const role: ActiveRoleEvidence = { roleId: "worker", snapshotRef: f.ref, rosterRef: ref, planRef: ref, d3Ref: ref, activationRef: ref,
    cardRef: ref, boundaryMdRef: ref, boundaryYamlRef: ref, authorizationRef: ref };
  const doc = { version: 1, digest: f.manifest.digest }, active1 = { revision: 1, digest: sha("active-one") };
  assert.ok((await f.store.compareAndSwapActiveRoles!(doc, { revision: 0, digest: null }, { ...active1, roles: { worker: role } })).ok);
  const withActive = await f.store.readManifest(); assert.ok(withActive.ok); if (!withActive.ok) return;
  assert.equal(withActive.value.trunkVersion, 1); assert.equal(withActive.value.digest, doc.digest);
  assert.equal("runId" in withActive.value.activeRoles!.worker!, false);
  assert.ok((await f.store.archiveHistory(1, withActive.value)).ok);
  const nextRef = await f.store.captureSnapshot!({ snapshotId: "document-later", createdAt: at, files: [{ path: ref.path, sha256: ref.sha256 }], baseSnapshotRef: f.ref });
  assert.ok(nextRef.ok); if (!nextRef.ok) return;
  const next = { ...withActive.value, trunkVersion: 2, digest: sha("doc-later"), snapshotRef: nextRef.value };
  const active2 = { revision: 2, digest: sha("active-two"), roles: { worker: role } };
  const results = await Promise.all([
    f.store.compareAndSwapManifest!(doc, next, nextRef.value, active1),
    createFsTrunkStore(f.root).compareAndSwapActiveRoles!(doc, active1, active2),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1, "A concurrent document/role publication cannot both consume stale dual revisions");
  const winner = await f.store.readManifest(); assert.ok(winner.ok); if (!winner.ok) return;
  if (winner.value.trunkVersion === 2) {
    assert.ok((await f.store.compareAndSwapActiveRoles!({ version: 2, digest: next.digest }, active1, active2)).ok);
  } else {
    assert.ok((await f.store.archiveHistory(1, winner.value)).ok, "Role-only changes cannot overwrite or conflict with the same document history");
    assert.equal((await f.store.compareAndSwapManifest!(doc, next, nextRef.value, active1)).ok, false);
    assert.equal((await f.store.compareAndSwapManifest!(doc, next, nextRef.value)).ok, false);
    assert.ok((await f.store.compareAndSwapManifest!(doc, next, nextRef.value, active2)).ok);
  }
  const final = await f.store.readManifest(); assert.ok(final.ok); if (!final.ok) return;
  assert.equal(final.value.trunkVersion, 2); assert.equal(final.value.activeRevision, 2); assert.equal(final.value.activeDigest, active2.digest);
  assert.notEqual(final.value.snapshotRef!.snapshotId, final.value.activeRoles!.worker!.snapshotRef.snapshotId);
  assert.ok((await f.store.readActiveRoleEvidence!(final.value.activeRoles!.worker!)).ok);
  const history = await f.store.readManifestVersion!(1); assert.ok(history.ok); if (!history.ok) return;
  assert.equal(history.value.activeRevision, 1, "Original history is immutable across later role activation");
});
test("Provider: raw baseline primitives enforce lock fencing, byte CAS and one initialisation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-direct-baseline-"));
  assert.deepEqual(await readVersionBaselineState(root), { text: null, initialized: false });
  const release = await acquireVersionLock(root);
  try {
    assert.equal((await writeVersionBaselineState(root, { text: "first\n", expectedSha256: null, initialize: true, lockToken: "wrong" })).ok, false);
    assert.deepEqual(await readVersionBaselineState(root), { text: null, initialized: false });
    assert.equal((await writeVersionBaselineState(root, { text: "first\n", expectedSha256: null, initialize: true, lockToken: release.token })).ok, true);
    assert.equal((await writeVersionBaselineState(root, { text: "overwrite\n", expectedSha256: null, initialize: true, lockToken: release.token })).ok, false);
    assert.equal((await writeVersionBaselineState(root, { text: "overwrite\n", expectedSha256: sha("stale"), lockToken: release.token })).ok, false);
    assert.equal((await writeVersionBaselineState(root, { text: "second\n", expectedSha256: sha("first\n"), lockToken: release.token })).ok, true);
    assert.deepEqual(await readVersionBaselineState(root), { text: "second\n", initialized: true });
  } finally { await release(); }
});
function childResult(code: string, value: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, ANS_DIRECT_TEST_CASE: JSON.stringify(value) }, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); }); child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
}
test("Provider: independent processes compete on one CAS; a crashed lock owner cannot tear or double-commit the pointer", async () => {
  const f = await fixture(); assert.equal((await f.store.compareAndSwapManifest!(null, f.manifest, f.ref)).ok, true);
  const moduleUrl = new URL("../../src/provider/trunk/public/trunk-store.ts", import.meta.url).href;
  const script = `import {createFsTrunkStore} from ${JSON.stringify(moduleUrl)}; const data=JSON.parse(process.env.ANS_DIRECT_TEST_CASE); process.stdout.write(JSON.stringify(await createFsTrunkStore(data.root).compareAndSwapManifest(data.expected,data.next,data.ref)));`;
  const next = { ...f.manifest, trunkVersion: 2, digest: sha("two-process-target") };
  const value = { root: f.root, expected: { version: 1, digest: f.manifest.digest }, next, ref: f.ref };
  const results = (await Promise.all([childResult(script, value), childResult(script, value)])).map(text => JSON.parse(text));
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(results.filter(result => result.code === "conflict").length, 1);
  const lockUrl = new URL("../../src/provider/version-change/public/version-change-store.ts", import.meta.url).href;
  await childResult(`import {acquireVersionLock} from ${JSON.stringify(lockUrl)}; await acquireVersionLock(JSON.parse(process.env.ANS_DIRECT_TEST_CASE).root); process.exit(0);`, { root: f.root });
  const recovered = await f.store.compareAndSwapManifest!({ version: 2, digest: next.digest }, { ...next, trunkVersion: 3, digest: sha("post-crash-target") }, f.ref);
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 3);
});

async function directFixture() {
  const f = await fixture();
  assert.deepEqual(await f.store.compareAndSwapManifest!(null, f.manifest, f.ref), { ok: true });
  await fs.mkdir(path.join(f.root, "docs/proposals"));
  const proposal = "---\nschema: project-proposal/v2\n---\nTarget bytes\n";
  await fs.writeFile(path.join(f.root, "docs/proposals/demo-proposal-v1.md"), proposal);
  const registry = createGuardFreezeRegistry(f.root, { migrationCompleted: () => true });
  const service = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: registry });
  const input: TrunkDirectApplyInput = { operationId: "op-1", applicationId: "vc-1", actorRoleId: "product",
    kind: "version-upgrade", flowId: "demo", baseTrunk: { version: 1, digest: f.manifest.digest }, at,
    target: { trunkVersion: 2, runId: null, documents: { proposal: { path: "docs/proposals/demo-proposal-v1.md", sha256: sha(proposal) } },
      execution: { teamPlan: null, flow: null }, workflow: { path: "docs/workflow.md", sha256: sha(f.bytes) }, roleCards: {}, boundaries: {} },
    expectedFrom: [{ path: "docs/proposals/demo-proposal-v1.md", sha256: null }] };
  return { ...f, registry, service, input, proposal };
}
test("Service: whole direct commit preserves unchanged bytes and truthful source; replay/no-op do not upgrade again", async () => {
  const f = await directFixture();
  await fs.writeFile(path.join(f.root, "docs/workflow.md"), "live differs from effective frozen bytes");
  const receipt = await f.service.executeDirect(f.input);
  assert.equal(receipt.status, "applied", JSON.stringify(receipt));
  assert.equal(receipt.source?.kind, "role-direct"); assert.equal("decisionId" in receipt.source!, false);
  const effective = await f.service.readEffectiveSnapshot(); assert.equal(effective.ok, true); if (!effective.ok) return;
  assert.equal(effective.value.manifest.trunkVersion, 2);
  assert.deepEqual(Buffer.from(effective.value.snapshot.files.find(file => file.path === "docs/workflow.md")!.bytesBase64, "base64"), f.bytes);
  assert.equal((await f.service.executeDirect(f.input)).status, "applied");
  const frozen = await f.registry.listFreezes(); assert.equal(frozen[0]?.freeze.origin, "role-direct");
  assert.equal(frozen[0]?.freeze.decisionId, undefined);
  const noOp = await f.service.executeDirect({ ...f.input, operationId: "op-noop", applicationId: "vc-2",
    baseTrunk: { version: 2, digest: effective.value.manifest.digest }, expectedFrom: [] });
  assert.equal(noOp.status, "no-op", JSON.stringify(noOp));
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});
test("Service: any invalid target/hash/role or precommit failure leaves the complete old baseline", async () => {
  const f = await directFixture();
  assert.equal((await f.service.executeDirect({ ...f.input, actorRoleId: "chief" })).status, "rejected");
  assert.equal((await f.service.executeDirect({ ...f.input, expectedFrom: [{ path: f.input.expectedFrom[0]!.path, sha256: sha("wrong") }] })).status, "rejected");
  const invalid = structuredClone(f.input); (invalid.target.documents as Record<string, { path: string; sha256: string }>).intent = { path: "docs/product/demo-intent-v2.md", sha256: sha("bad") };
  invalid.expectedFrom = [...invalid.expectedFrom, { path: "docs/product/demo-intent-v2.md", sha256: null }];
  assert.equal((await f.service.executeDirect(invalid)).status, "rejected");
  const service = createTrunkService({ projectRoot: f.root, freezeRegistry: f.registry, store: { ...f.store,
    compareAndSwapManifest: async () => ({ ok: false, code: "io", message: "injected precommit failure" }) } });
  const result = await service.executeDirect(f.input); assert.equal(result.status, "rejected");
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.digest, f.manifest.digest);
  assert.equal((await f.registry.listFreezes()).length, 0);
  assert.equal((await f.service.executeDirect(f.input)).status, "applied");
});
test("Service: postcommit metadata failure reports committed-pending-recovery; restart uses frozen bytes, never re-pins", async () => {
  const f = await directFixture(); let repins = 0;
  const failing = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: { ...f.registry,
    appendDocFreezeRecords: async () => ({ ok: false, code: "io", message: "injected metadata failure" }) },
    runRepin: { repin: async () => { repins++; return { ok: true, alreadyApplied: false }; } } });
  const receipt = await failing.executeDirect(f.input); assert.equal(receipt.status, "committed-pending-recovery", JSON.stringify(receipt));
  const committed = await f.store.readManifest(); assert.equal(committed.ok && committed.value.trunkVersion, 2);
  await fs.unlink(path.join(f.root, "docs/proposals/demo-proposal-v1.md"));
  const restarted = createTrunkService({ projectRoot: f.root, store: createFsTrunkStore(f.root),
    freezeRegistry: createGuardFreezeRegistry(f.root, { migrationCompleted: () => true }) });
  assert.equal((await restarted.recoverDirect("op-1")).status, "applied");
  assert.equal((await restarted.executeDirect(f.input)).status, "applied");
  assert.equal(repins, 0);
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});
test("Service: concurrent direct submissions with one base commit exactly once and retain both operation journals", async () => {
  const f = await directFixture();
  const receipts = await Promise.all([f.service.executeDirect(f.input), f.service.executeDirect({ ...f.input, operationId: "op-2", applicationId: "vc-2" })]);
  assert.equal(receipts.filter(result => result.status === "applied").length, 1, JSON.stringify(receipts));
  assert.equal(receipts.filter(result => result.status === "rejected").length, 1, JSON.stringify(receipts));
  assert.equal((await f.store.readOperation!("op-1")).ok, true);
  assert.equal((await f.store.readOperation!("op-2")).ok, true);
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});
test("Service: lost CAS acknowledgement and metadata-write failure never claim a committed target was rejected", async () => {
  const f = await directFixture();
  const service = createTrunkService({ projectRoot: f.root, freezeRegistry: f.registry, store: { ...f.store,
    compareAndSwapManifest: async (...args) => { const result = await f.store.compareAndSwapManifest!(...args); if (result.ok) throw new Error("lost acknowledgement"); return result; },
    writeOperation: async journal => journal.phase === "committed" ? { ok: false, code: "io", message: "metadata unavailable" } : f.store.writeOperation!(journal) } });
  const receipt = await service.executeDirect(f.input);
  assert.equal(receipt.status, "committed-pending-recovery", JSON.stringify(receipt));
  assert.equal((await f.service.recoverDirect("op-1")).status, "applied");
  assert.equal((await f.service.executeDirect({ ...f.input, expectedFrom: [{ path: f.input.expectedFrom[0]!.path, sha256: sha("changed-request") }] })).status, "rejected");
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});
test("Service: direct VCA metadata goes draft to applied with the real committed source; legacy approval cannot impersonate it", async () => {
  const f = await directFixture();
  const captured = await f.store.captureSnapshot!({ snapshotId: "vca-prepared", createdAt: at, baseSnapshotRef: f.ref,
    files: [...Object.values(f.input.target.documents), f.input.target.workflow!] });
  assert.equal(captured.ok, true); if (!captured.ok) return;
  const snapshot = await f.store.readSnapshot!(captured.value); assert.equal(snapshot.ok, true); if (!snapshot.ok) return;
  const integration = createVersionChangeIntegration({ projectRoot: f.root, migrationCompleted: () => true });
  const currentTrunk = { trunkVersion: 1, runId: null, digest: f.manifest.digest };
  const prepared = await integration.services.vca.prepareDirect!({ kind: "version-upgrade", initiatorRoleId: "product",
    operationId: "op-1", applicationId: "vc-1", flowId: "demo", baseTrunk: currentTrunk, currentTrunk,
    snapshot: snapshot.value, targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v1.md", action: "add" }], summary: "Publish", at });
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); if (!prepared.ok) return;
  assert.equal(prepared.value.status, "draft");
  assert.equal((await integration.services.vca.approve({ applicationId: "vc-1", decisionId: "fake", at })).ok, false);
  const receipt = await f.service.executeDirect({ ...f.input, preparedSnapshotRef: captured.value }); assert.equal(receipt.ok, true);
  const finalized = await integration.services.vca.finalizeDirect!({ applicationId: "vc-1", receipt, snapshotRef: captured.value, resultTrunkVersion: 2, at });
  assert.equal(finalized.ok, true, JSON.stringify(finalized)); if (!finalized.ok) return;
  assert.equal(finalized.value.status, "applied"); assert.equal(finalized.value.decidedBy, undefined); assert.equal(finalized.value.decisionId, undefined);
  assert.equal(finalized.value.actionSource?.kind, "role-direct");
  const rejected = await integration.services.vca.finalizeDirect!({ applicationId: "vc-1", receipt: { ...receipt, source: { kind: "customer-decision", decisionId: "fake", at } },
    snapshotRef: captured.value, resultTrunkVersion: 2, at }); assert.equal(rejected.ok, false);
});
test("Service: first direct publication uses confirmed intent and null CAS, creates no workflow or execution authority", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-direct-bootstrap-"));
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const intent = "# Confirmed intent\n", proposal = "---\nschema: project-proposal/v2\nintent: docs/product/demo-intent-v1.md\n---\nPlan\n";
  await fs.writeFile(path.join(root, "docs/product/demo-intent-v1.md"), intent);
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v1.md"), proposal);
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const store = createFsTrunkStore(root);
  const service = createTrunkService({ projectRoot: root, store, freezeRegistry: createGuardFreezeRegistry(root, { migrationCompleted: () => true }) });
  const input: TrunkDirectApplyInput = { operationId: "first-publication", applicationId: "vc-1", kind: "version-upgrade", actorRoleId: "product",
    flowId: "demo", baseTrunk: null, target: { trunkVersion: 1, runId: null, documents: { proposal: { path: "docs/proposals/demo-proposal-v1.md", sha256: sha(proposal) } },
      execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} }, expectedFrom: [{ path: "docs/proposals/demo-proposal-v1.md", sha256: null }], at };
  assert.equal((await service.executeDirect(input)).status, "rejected", "Missing actual intent confirmation cannot be invented");
  assert.equal((await store.readManifest()).ok, false);
  const confirmed = await integration.services.freeze.freeze({ path: "docs/product/demo-intent-v1.md", version: 1, sha256: sha(intent),
    applicationId: "intent-unit-confirmation", reason: "intent-confirmed", decisionId: "unit-layer-intent-decision", at });
  assert.equal(confirmed.ok, true);
  const applied = await service.executeDirect(input); assert.equal(applied.status, "applied", JSON.stringify(applied));
  const published = await service.readEffectiveSnapshot(); assert.equal(published.ok, true); if (!published.ok) return;
  assert.equal(published.value.manifest.trunkVersion, 1); assert.equal(published.value.manifest.artifacts.workflow, undefined);
  assert.equal(published.value.manifest.frozenRoles, undefined);
  assert.ok(published.value.snapshot.files.some(file => file.path === "docs/product/demo-intent-v1.md"));
  assert.ok(published.value.snapshot.files.some(file => file.path === ".ans/state/versions.jsonl"));
  await assert.rejects(fs.access(path.join(root, "docs/workflow.md")));
  const execution = await service.verify(); assert.equal(execution.ok, false);
  assert.ok(execution.violations.some(problem => problem.includes("workflow")));
  assert.equal((await service.executeDirect(input)).status, "applied");
});
test("Service: detail amendment binds all frozen items to the complete target; no partial apply and true no-op", async () => {
  const f = await directFixture();
  const docPath = "docs/proposals/demo-amendment-v1.md";
  const amendment = (items: string, version: number, digest: string) => `---\nschema: trunk-amendment/v1\namendmentId: am-1\nflowId: demo\ndocVersion: 1\nbaseTrunk:\n  trunkVersion: ${version}\n  runId: null\n  digest: ${digest}\nitems:\n${items}\n---\nAmendment\n`;
  const item = "  - itemId: proposal\n    kind: contract\n    change: add\n    to: docs/proposals/demo-proposal-v1.md";
  await fs.writeFile(path.join(f.root, docPath), amendment(item + "\n  - itemId: omitted\n    kind: contract\n    change: add\n    to: docs/proposals/demo-assets-v1.md", 1, f.manifest.digest));
  const input: TrunkDirectApplyInput = { ...f.input, kind: "detail-amendment", actorRoleId: "rapporteur", amendmentId: "am-1", amendmentDocPath: docPath };
  assert.equal((await f.service.executeDirect(input)).status, "rejected");
  const before = await f.store.readManifest(); assert.equal(before.ok && before.value.trunkVersion, 1);
  await fs.writeFile(path.join(f.root, docPath), amendment(item, 1, f.manifest.digest));
  const applied = await f.service.executeDirect({ ...input, operationId: "valid-detail" }); assert.equal(applied.status, "applied", JSON.stringify(applied));
  const effective = await f.service.readEffectiveSnapshot(); assert.equal(effective.ok, true); if (!effective.ok) return;
  assert.ok((await f.registry.listFreezes()).some(record => record.path === docPath && record.freeze.origin === "role-direct"));
  const noopPath = "docs/proposals/demo-amendment-v2.md";
  await fs.writeFile(path.join(f.root, noopPath), amendment(item.replace("change: add", "change: none"), 2, effective.value.manifest.digest).replace("docVersion: 1", "docVersion: 2"));
  const noop = await f.service.executeDirect({ ...input, operationId: "detail-noop", applicationId: "vc-3", amendmentDocPath: noopPath,
    baseTrunk: { version: 2, digest: effective.value.manifest.digest }, expectedFrom: [] });
  assert.equal(noop.status, "no-op", JSON.stringify(noop));
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});

const decisionRequest: CustomerInputRequest = { kind: "choice", title: "Recover the actual target", question: "Which action is justified?",
  preview: "Current target body", options: [{ id: "a", label: "First" }, { id: "b", label: "Second" }], cardKind: "decision", flowId: "demo" };
function decisionMetadata(runId?: string): CustomerInputMetadata {
  return { flowId: "demo", judgeContext: { flowId: "demo", artifacts: { proposalPath: "docs/evidence.md" },
    facts: { governanceModel: "trio", flowId: "demo", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [], ...(runId ? { runId, runState: "pinned" } : {}) } } };
}
async function decisionFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-evidence-"));
  await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/evidence.md"), "Actual target evidence\n");
  return root;
}
test("chief evidence: initial real target/request bytes produce a bounded immutable basis; isCurrent rechecks actual hashes", async () => {
  const root = await decisionFixture();
  const bundle = await prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata: decisionMetadata() });
  assert.match(bundle.baseDigest, /^[a-f0-9]{64}$/); assert.equal(bundle.evidenceRefs.length, 2);
  assert.ok(bundle.context.includes("Actual target evidence")); assert.ok(bundle.context.includes("Current target body"));
  assert.ok(bundle.context.includes("Recover the actual target")); assert.ok(bundle.context.includes("ledgerErrors"));
  assert.equal(await bundle.isCurrent(), true);
  await fs.writeFile(path.join(root, "docs/evidence.md"), "Changed after preparing");
  assert.equal(await bundle.isCurrent(), false);
});
test("chief evidence: missing targets, secret paths, excessive bytes and unbound old pinned runs refuse automatic decisions", async () => {
  const root = await decisionFixture(), invoke = (metadata: CustomerInputMetadata) => prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata });
  await assert.rejects(invoke({ flowId: "demo" }), /actual target/);
  await fs.writeFile(path.join(root, ".env"), "API_KEY=example-secret-value");
  const secret = decisionMetadata(); secret.judgeContext!.artifacts = { proposalPath: ".env" };
  await assert.rejects(invoke(secret), /secret/);
  await fs.writeFile(path.join(root, "docs/evidence.md"), "x".repeat(65537));
  await assert.rejects(invoke(decisionMetadata()), /oversized/);
  const runId = "run-20261105-demo-a1b2c3d4";
  await fs.mkdir(path.join(root, `.ans/runs/${runId}`), { recursive: true });
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), JSON.stringify({ runId, flowId: "demo", state: "pinned" }));
  await assert.rejects(invoke(decisionMetadata(runId)), /historical complete evidence/);
});
test("chief evidence: pinned run uses its immutable bytes and remains current when live files or document trunk change", async () => {
  const root = await decisionFixture(), store = createFsTrunkStore(root), runId = "run-20261105-demo-a1b2c3d4", pinDigest = sha("real-pin");
  const captured = await store.captureSnapshot!({ snapshotId: "run-basis", createdAt: at, files: [{ path: "docs/evidence.md", sha256: sha("Actual target evidence\n") }] });
  assert.equal(captured.ok, true); if (!captured.ok) return;
  const ref = { snapshotId: captured.value.snapshotId, path: "docs/evidence.md", sha256: sha("Actual target evidence\n") };
  const evidence = { runId, pinDigest, roleId: "worker", snapshotRef: captured.value,
    ...Object.fromEntries(FROZEN_ROLE_REF_KEYS.map(key => [key, { ...ref }])) } as unknown as FrozenRoleEvidence;
  await fs.mkdir(path.join(root, `.ans/runs/${runId}`), { recursive: true });
  const runPath = path.join(root, `.ans/runs/${runId}/manifest.json`);
  const run = { runId, flowId: "demo", state: "pinned", pinDigest, snapshotRef: captured.value, frozenRoles: { worker: evidence } };
  await fs.writeFile(runPath, JSON.stringify(run));
  const task = { v: 1, at, kind: "task.created", taskId: "task-1", flowId: "demo", runId, from: "chief", to: "convener", text: "Current task", sideEffect: "code", idempotencyKey: "task-one" };
  const ledgerPath = path.join(root, ".ans/state/tasks.jsonl");
  await fs.writeFile(ledgerPath, `${JSON.stringify(task)}\n`);
  const metadata = decisionMetadata(runId); metadata.taskId = "task-1";
  const mismatch = decisionMetadata("run-another"); mismatch.taskId = "task-1";
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata: mismatch }), /Task\/request\/run/);
  const bundle = await prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata });
  await fs.writeFile(path.join(root, "docs/evidence.md"), "New live authority must not leak into old pin");
  await fs.mkdir(path.join(root, ".ans/trunk"), { recursive: true }); await fs.writeFile(path.join(root, ".ans/trunk/manifest.json"), "new-document-trunk");
  await fs.appendFile(ledgerPath, `${JSON.stringify({ ...task, taskId: "unrelated-task" })}\n`);
  assert.equal(await bundle.isCurrent(), true); assert.ok(bundle.context.includes("Actual target evidence"));
  assert.equal(bundle.context.includes("New live authority"), false);
  await fs.writeFile(runPath, JSON.stringify({ ...run, state: "closed" }));
  assert.equal(await bundle.isCurrent(), false);
});
test("chief evidence: draft planning run needs bound document hashes and never requires future execution authorisation", async () => {
  const root = await decisionFixture(), runId = "run-20261105-demo-draft";
  await fs.mkdir(path.join(root, `.ans/runs/${runId}`), { recursive: true });
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), JSON.stringify({ runId, flowId: "demo", state: "draft",
    documents: { proposal: { path: "docs/evidence.md", sha256: sha("Actual target evidence\n") } }, execution: { teamPlan: null, flow: null } }));
  const metadata = decisionMetadata(runId); metadata.judgeContext!.facts.runState = "draft";
  const bundle = await prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata });
  assert.equal(await bundle.isCurrent(), true);
  await fs.writeFile(path.join(root, "docs/evidence.md"), "Drifted draft");
  assert.equal(await bundle.isCurrent(), false);
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata }), /drifted/);
});
// ———— A′（fix 2026-11-09 proposal-draft-run-evidence-binding）：B1 v1 §4.1 A1–A5 新增矩阵 ————
// draft manifest documents/execution 恒空（pin 前无绑定写点）时，应用按实际项目字节完成等价绑定：
// 目标集 = host artifacts/criteriaRef，否则按 flowId 的版本化文档发现；快照 complete-snapshot/v1 + 逐文件 SHA-256；
// 结算前由 discovery/verification 复核，漂移 fail-closed；manifest 永不因 prepare 被写。
const draftRunManifest = (runId: string) => JSON.stringify({ runId, flowId: "demo", state: "draft", documents: {}, execution: { teamPlan: null, flow: null } });
async function emptyDraftFixture(runId: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-draft-evidence-"));
  await fs.mkdir(path.join(root, `.ans/runs/${runId}`), { recursive: true });
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), draftRunManifest(runId));
  return root;
}
function emptyDraftMetadata(runId: string): CustomerInputMetadata {
  const metadata = decisionMetadata(runId);
  metadata.judgeContext!.facts.runState = "draft";
  delete metadata.judgeContext!.artifacts;
  return metadata;
}
test("chief evidence (A1): empty draft manifest binds actual flow bytes into a verifiable complete snapshot and never writes the manifest", async () => {
  const runId = "run-20261109-demo-draft-a1", root = await emptyDraftFixture(runId);
  const proposal = "Actual pending proposal v1\n", intent = "Actual product intent v1\n";
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v1.md"), proposal);
  await fs.writeFile(path.join(root, "docs/product/demo-intent-v1.md"), intent);
  const runPath = path.join(root, `.ans/runs/${runId}/manifest.json`), manifestBefore = await fs.readFile(runPath);
  const bundle = await prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata: emptyDraftMetadata(runId) });
  assert.ok(bundle.context.includes(proposal)); assert.ok(bundle.context.includes(intent));
  assert.ok(bundle.context.includes("Recover the actual target"));
  assert.equal(bundle.evidenceRefs.length, 3, "two discovered documents plus the request input enter the snapshot");
  const snapshotIds = [...new Set(bundle.evidenceRefs.map(ref => ref.snapshotId))];
  assert.equal(snapshotIds.length, 1); assert.match(snapshotIds[0]!, /^decision-[a-f0-9]{64}$/);
  const snapshot = await createFsTrunkStore(root).readSnapshot!({ snapshotId: snapshotIds[0]!, digest: snapshotIds[0]!.slice("decision-".length) });
  assert.equal(snapshot.ok, true); if (!snapshot.ok) return;
  assert.equal(snapshot.value.schema, COMPLETE_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.value.digest, completeSnapshotDigest(snapshot.value.files));
  for (const [rel, text] of [["docs/proposals/demo-proposal-v1.md", proposal], ["docs/product/demo-intent-v1.md", intent]] as const) {
    const file: CompleteSnapshot["files"][number] | undefined = snapshot.value.files.find(entry => entry.path === rel);
    assert.ok(file !== undefined, `snapshot carries the actual bytes of ${rel}`);
    assert.equal(file.sha256, sha(text));
    assert.equal(Buffer.from(file.bytesBase64, "base64").toString("utf8"), text);
    assert.ok(bundle.evidenceRefs.some(ref => ref.path === rel && ref.sha256 === sha(text)));
  }
  assert.equal(await bundle.isCurrent(), true);
  assert.deepEqual(await fs.readFile(runPath), manifestBefore, "prepare must not write the draft run manifest");
});
test("chief evidence (A2): draft binding fails closed on changed bytes and new versions; re-prepare reads the new bytes", async () => {
  const runId = "run-20261109-demo-draft-a2", root = await emptyDraftFixture(runId);
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const v1 = path.join(root, "docs/proposals/demo-proposal-v1.md");
  await fs.writeFile(v1, "Actual pending proposal v1\n");
  const invoke = () => prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata: emptyDraftMetadata(runId) });
  const first = await invoke();
  assert.ok(first.context.includes("Actual pending proposal v1")); assert.equal(await first.isCurrent(), true);
  await fs.writeFile(v1, "Changed after preparing\n");
  assert.equal(await first.isCurrent(), false, "changed actual bytes invalidate the earlier basis");
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v2.md"), "Actual newer pending proposal v2\n");
  assert.equal(await first.isCurrent(), false, "a new bound target version invalidates the earlier basis");
  const second = await invoke();
  assert.ok(second.context.includes("Actual newer pending proposal v2"));
  assert.equal(second.context.includes("Changed after preparing"), false, "the latest version replaces the earlier family bytes");
  assert.notEqual(second.baseDigest, first.baseDigest);
  assert.equal(await second.isCurrent(), true);
});
test("chief evidence (A3): empty targets and role self-reported paths stay unbound and produce no snapshot", async () => {
  const runId = "run-20261109-demo-draft-a3", root = await emptyDraftFixture(runId);
  const snapshots = path.join(root, ".ans/trunk/snapshots");
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata: emptyDraftMetadata(runId) }),
    /Draft request target is not bound to that run/, "no app-computed target means no binding");
  await assert.rejects(fs.access(snapshots), /ENOENT/, "an unbound draft produces no evidence snapshot");
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v1.md"), "Actual pending proposal v1\n");
  await fs.writeFile(path.join(root, "docs/role-private.md"), "Role-reported bytes must never be read\n");
  const reported = { ...emptyDraftMetadata(runId), paths: ["docs/role-private.md"] };
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata: reported }),
    /Draft request target is not bound to that run/, "a self-reported path outside the app evidence set is never read and never bound");
  const escaping = decisionMetadata(runId); escaping.judgeContext!.facts.runState = "draft";
  escaping.judgeContext!.artifacts = { proposalPath: "../outside.md" };
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata: escaping }),
    /invalid-project-path/, "an out-of-project artifact path is rejected by actual-byte reading");
  await assert.rejects(fs.access(snapshots), /ENOENT/, "rejected drafts produce no evidence snapshot");
});
test("chief evidence (A4): unreadable, secret, oversized, non-text and criteria-hash-mismatched draft targets keep the existing fail-closed classification", async () => {
  const runId = "run-20261109-demo-draft-a4", root = await emptyDraftFixture(runId);
  const invoke = (metadata: CustomerInputMetadata) => prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata });
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.writeFile(path.join(root, "docs/evidence.md"), "Actual target evidence\n");
  const missing = decisionMetadata(runId); missing.judgeContext!.facts.runState = "draft";
  missing.judgeContext!.artifacts = { proposalPath: "docs/missing.md" };
  await assert.rejects(invoke(missing), /Target evidence is unreadable: docs\/missing\.md/);
  await fs.writeFile(path.join(root, ".env"), "API_KEY=example-secret-value");
  const secret = decisionMetadata(runId); secret.judgeContext!.facts.runState = "draft";
  secret.judgeContext!.artifacts = { proposalPath: ".env" };
  await assert.rejects(invoke(secret), /secret/);
  await fs.writeFile(path.join(root, "docs/evidence.md"), "x".repeat(65537));
  const oversized = decisionMetadata(runId); oversized.judgeContext!.facts.runState = "draft";
  await assert.rejects(invoke(oversized), /oversized/);
  await fs.writeFile(path.join(root, "docs/evidence.md"), Buffer.from([0xff, 0xfe, 0xfd, 0x00]));
  const nonText = decisionMetadata(runId); nonText.judgeContext!.facts.runState = "draft";
  await assert.rejects(invoke(nonText), /non-text/);
  await fs.writeFile(path.join(root, "docs/evidence.md"), "Actual target evidence\n");
  const mismatched = emptyDraftMetadata(runId);
  mismatched.criteriaRef = { path: "docs/evidence.md", sha256: "0".repeat(64), version: 1 };
  await assert.rejects(invoke(mismatched), /Target evidence hash differs from the criteria reference/);
  await assert.rejects(fs.access(path.join(root, ".ans/trunk/snapshots")), /ENOENT/, "failed prepares produce no evidence snapshot");
  const matched = emptyDraftMetadata(runId);
  matched.criteriaRef = { path: "docs/evidence.md", sha256: sha("Actual target evidence\n"), version: 1 };
  const bundle = await invoke(matched);
  assert.ok(bundle.context.includes("Actual target evidence")); assert.equal(await bundle.isCurrent(), true);
});
test("chief evidence (A5): manifest-bound draft refs keep their authority over request targets", async () => {
  const root = await decisionFixture(), runId = "run-20261109-demo-draft-a5";
  await fs.mkdir(path.join(root, `.ans/runs/${runId}`), { recursive: true });
  await fs.writeFile(path.join(root, `.ans/runs/${runId}/manifest.json`), JSON.stringify({ runId, flowId: "demo", state: "draft",
    documents: { proposal: { path: "docs/evidence.md", sha256: sha("Actual target evidence\n") } }, execution: { teamPlan: null, flow: null } }));
  await fs.writeFile(path.join(root, "docs/other.md"), "Actual unrelated target\n");
  const metadata = decisionMetadata(runId); metadata.judgeContext!.facts.runState = "draft";
  metadata.judgeContext!.artifacts = { proposalPath: "docs/other.md" };
  await assert.rejects(prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "convener", request: decisionRequest, metadata }),
    /Draft request target is not bound to that run/, "bound refs stay authoritative; A′ does not bypass them");
});
test("chief evidence: ordinary request without host artifacts discovers actual flow materials and notices a new version", async () => {
  const root = await decisionFixture(); await fs.mkdir(path.join(root, "docs/proposals"));
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v1.md"), "Actual pending proposal v1\n");
  const metadata = decisionMetadata(); delete metadata.judgeContext!.artifacts;
  const bundle = await prepareChiefDecisionEvidence({ projectRoot: root, originRoleId: "rapporteur", request: decisionRequest, metadata });
  assert.ok(bundle.context.includes("Actual pending proposal v1")); assert.equal(await bundle.isCurrent(), true);
  await fs.writeFile(path.join(root, "docs/proposals/demo-proposal-v2.md"), "Actual newer pending proposal v2\n");
  assert.equal(await bundle.isCurrent(), false, "A new bound target version must invalidate the earlier chief basis");
});
test("Service: committed chief-delegated freeze preserves its true source on reload without customer fields", async () => {
  const root = await decisionFixture(); await fs.mkdir(path.join(root, "docs/proposals"));
  const rel = "docs/proposals/demo-proposal-v1.md"; await fs.writeFile(path.join(root, rel), "Confirmed proposal\n");
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const source = { kind: "chief-delegated" as const, actorRoleId: "chief" as const, originRoleId: "rapporteur", requestId: "proposal-request",
    baseDigest: sha("actual-layer-basis"), delegationRevision: 8, disposition: "select" as const, selected: ["accept"], reason: "Actual evidence", at };
  const frozen = await integration.services.freeze.freeze({ path: rel, sha256: sha("Confirmed proposal\n"), version: 1, applicationId: "proposal-request",
    reason: "proposal-confirmed", origin: "chief-delegated", actorRoleId: "chief", source, at });
  assert.equal(frozen.ok, true, JSON.stringify(frozen));
  const reloaded = await createGuardFreezeRegistry(root, { migrationCompleted: () => true }).listFreezes();
  assert.deepEqual(reloaded[0]!.freeze.source, source); assert.equal(reloaded[0]!.freeze.origin, "chief-delegated");
  assert.equal(reloaded[0]!.freeze.decidedBy, undefined); assert.equal(reloaded[0]!.freeze.decisionId, undefined);
});
test("Service: legacy pending requests stay unchanged and require an explicit direct resubmission link", async () => {
  const f = await directFixture(), integration = createVersionChangeIntegration({ projectRoot: f.root, migrationCompleted: () => true });
  const base = { trunkVersion: 1, runId: null, digest: f.manifest.digest };
  const targets = [{ kind: "contract", path: "docs/proposals/demo-proposal-v1.md", action: "add" as const }];
  assert.equal((await integration.services.vca.create({ kind: "version-upgrade", initiatorRoleId: "product", flowId: "demo", baseTrunk: base,
    applicationId: "vc-90", targets, summary: "Historical pending request", at })).ok, true);
  assert.equal((await integration.services.vca.submit({ applicationId: "vc-90", at })).ok, true);
  const captured = await f.store.captureSnapshot!({ snapshotId: "resubmission", createdAt: at, baseSnapshotRef: f.ref,
    files: [...Object.values(f.input.target.documents), f.input.target.workflow!] });
  assert.equal(captured.ok, true); if (!captured.ok) return;
  const read = await f.store.readSnapshot!(captured.value); assert.equal(read.ok, true); if (!read.ok) return;
  const input = { kind: "version-upgrade" as const, initiatorRoleId: "product", flowId: "demo", baseTrunk: base, currentTrunk: base,
    applicationId: "vc-91", operationId: "explicit-resubmit", targets, summary: "New direct submission", at, snapshot: read.value };
  assert.equal((await integration.services.vca.prepareDirect!(input)).ok, false);
  const linked = await integration.services.vca.prepareDirect!({ ...input, supersedesApplicationId: "vc-90" });
  assert.equal(linked.ok, true, JSON.stringify(linked));
  const records = await integration.services.vca.list();
  assert.equal(records.find(record => record.applicationId === "vc-90")?.status, "submitted");
  assert.equal(records.find(record => record.applicationId === "vc-91")?.status, "draft");
  assert.equal(records.find(record => record.applicationId === "vc-91")?.supersedesApplicationId, "vc-90");
  // Real commit succeeds while the original metadata deliberately remains submitted (lost finalisation).
  const committed = await f.service.executeDirect({ ...f.input, applicationId: "vc-90", operationId: "old-commit-lost-finalise" });
  assert.equal(committed.ok, true, JSON.stringify(committed));
  const actual = await f.store.readManifest(); assert.ok(actual.ok); if (!actual.ok) return;
  const current = { trunkVersion: actual.value.trunkVersion, runId: actual.value.runId, digest: actual.value.digest };
  const replacement = await integration.services.vca.prepareDirect!({ ...input, applicationId: "vc-92", operationId: "must-not-replace-committed",
    baseTrunk: current, currentTrunk: current, supersedesApplicationId: "vc-90" });
  assert.equal(replacement.ok, false, "Submitted metadata cannot erase an already committed original operation");
  if (!replacement.ok) assert.match(replacement.message ?? "", /commit point|committed|unknown/i);
  assert.equal((await integration.services.vca.list()).find(record => record.applicationId === "vc-90")?.status, "submitted");
});
test("Service: legacy no-op materialises exact immutable bytes without upgrading or rewriting historical customer metadata", async () => {
  const f = await fixture();
  const legacy: TrunkManifest = { ...f.manifest, snapshotRef: undefined, artifacts: { ...f.manifest.artifacts,
    workflow: { ...f.manifest.artifacts.workflow!, confirmationId: "existing-confirmation" } } };
  assert.equal((await f.store.writeManifest(legacy)).ok, true);
  assert.equal((await f.store.archiveHistory(1, legacy)).ok, true);
  const service = createTrunkService({ projectRoot: f.root, store: f.store, freezeRegistry: createGuardFreezeRegistry(f.root, { migrationCompleted: () => true }) });
  const input: TrunkDirectApplyInput = { operationId: "legacy-noop", applicationId: "vc-1", kind: "version-upgrade", actorRoleId: "product", flowId: "demo",
    baseTrunk: { version: 1, digest: legacy.digest }, target: { trunkVersion: 1, runId: null, documents: {}, execution: { teamPlan: null, flow: null },
      workflow: { path: "docs/workflow.md", sha256: sha(f.bytes) }, roleCards: {}, boundaries: {} }, expectedFrom: [], at };
  assert.equal((await service.executeDirect(input)).status, "no-op");
  const current = await f.store.readManifest(); assert.equal(current.ok, true); if (!current.ok) return;
  assert.equal(current.value.trunkVersion, 1); assert.ok(current.value.snapshotRef);
  assert.equal(current.value.artifacts.workflow?.confirmationId, "existing-confirmation");
  await fs.mkdir(path.join(f.root, "docs/proposals")); const proposal = "---\nschema: project-proposal/v2\n---\nActual next publication\n";
  await fs.writeFile(path.join(f.root, "docs/proposals/demo-proposal-v1.md"), proposal);
  const next = await service.executeDirect({ ...input, operationId: "next-after-noop", applicationId: "vc-2",
    target: { ...input.target, documents: { proposal: { path: "docs/proposals/demo-proposal-v1.md", sha256: sha(proposal) } } },
    expectedFrom: [{ path: "docs/proposals/demo-proposal-v1.md", sha256: null }] });
  assert.equal(next.status, "applied", JSON.stringify(next));
  const history = JSON.parse(await fs.readFile(path.join(f.root, ".ans/trunk/history/manifest-v1.json"), "utf8"));
  assert.equal(history.snapshotRef, undefined); assert.equal(history.source, legacy.source);
  assert.equal((await service.executeDirect(input)).status, "no-op", "Replay remains valid through the immutable original history");
});
test("Service: malformed execution document rejects the entire otherwise valid detail amendment", async () => {
  const f = await directFixture(); await fs.mkdir(path.join(f.root, "docs/flows"));
  const flowPath = "docs/flows/demo.yaml", broken = "invalid: [yaml\n"; await fs.writeFile(path.join(f.root, flowPath), broken);
  const amendmentPath = "docs/proposals/demo-amendment-v1.md";
  await fs.writeFile(path.join(f.root, amendmentPath), `---\nschema: trunk-amendment/v1\namendmentId: am-1\nflowId: demo\ndocVersion: 1\nbaseTrunk:\n  trunkVersion: 1\n  runId: null\n  digest: ${f.manifest.digest}\nitems:\n  - itemId: proposal\n    kind: contract\n    change: add\n    to: docs/proposals/demo-proposal-v1.md\n  - itemId: flow\n    kind: execution\n    change: add\n    to: ${flowPath}\n---\n`);
  const result = await f.service.executeDirect({ ...f.input, kind: "detail-amendment", actorRoleId: "rapporteur", amendmentId: "am-1", amendmentDocPath: amendmentPath,
    target: { ...f.input.target, execution: { teamPlan: null, flow: { path: flowPath, sha256: sha(broken), version: 1 } } },
    expectedFrom: [...f.input.expectedFrom, { path: flowPath, sha256: null }] });
  assert.equal(result.status, "rejected");
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.digest, f.manifest.digest);
  assert.equal((await f.registry.listFreezes()).length, 0);
});
test("Pipeline: real direct submit persists a whole commit and truthful audit without cards, old approval or re-pin", async () => {
  const f = await directFixture(), integration = createVersionChangeIntegration({ projectRoot: f.root, migrationCompleted: () => true });
  const deliveries: string[] = [];
  const runtime = createVersionChangeRuntime({ projectRoot: f.root, services: integration.services, trunkService: f.service,
    directTrunkService: f.service, trunkRuntime: { applyApproved: async () => { throw new Error("old approval path forbidden"); }, bootstrap: async () => { throw new Error("old bootstrap path forbidden"); } },
    emitEvent: async () => { throw new Error("direct audit must persist through its Provider"); },
    presenter: { presentVersionChange: async () => { throw new Error("customer card forbidden"); } },
    notifyDirect: async input => { deliveries.push(input.key); } });
  const input = { kind: "version-upgrade" as const, initiatorRoleId: "product" as const, flowId: "demo", summary: "Directly publish the target",
    operationId: "pipeline-submit", baseTrunk: f.input.baseTrunk, targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v1.md", action: "add" as const, expectedFromSha256: null }] };
  assert.equal((await runtime.submitDirect(input, "chief")).status, "rejected");
  const result = await runtime.submitDirect(input, "product"); assert.equal(result.status, "applied", JSON.stringify(result));
  const ledger = await readTaskState(f.root); assert.deepEqual(ledger.errors, []); assert.equal(ledger.events.length, 2);
  assert.ok(ledger.events.every(event => "actionSource" in event && event.actionSource?.kind === "role-direct"));
  assert.equal(ledger.events.some(event => "decidedBy" in event && event.decidedBy === "customer"), false);
  assert.equal(deliveries.length, 3);
  await fs.unlink(path.join(f.root, "docs/proposals/demo-proposal-v1.md"));
  const replay = await runtime.submitDirect(input, "product"); assert.equal(replay.status, "applied", JSON.stringify(replay));
  assert.equal((await readTaskState(f.root)).events.length, 2); assert.equal(deliveries.length, 3);
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});
test("Pipeline: lost notification acknowledgement returns pending, then recovers one keyed delivery and one version", async () => {
  const f = await directFixture(), integration = createVersionChangeIntegration({ projectRoot: f.root, migrationCompleted: () => true });
  const delivered = new Set<string>(); let loseAck = true;
  const runtime = createVersionChangeRuntime({ projectRoot: f.root, services: integration.services, trunkService: f.service, directTrunkService: f.service,
    trunkRuntime: { applyApproved: async () => { throw new Error("forbidden"); }, bootstrap: async () => { throw new Error("forbidden"); } }, emitEvent: async () => {},
    notifyDirect: async input => { delivered.add(input.key); if (loseAck) { loseAck = false; throw new Error("delivered but acknowledgement lost"); } } });
  const input = { kind: "version-upgrade" as const, initiatorRoleId: "product" as const, flowId: "demo", summary: "Recover notification",
    operationId: "pipeline-pending", baseTrunk: f.input.baseTrunk, targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v1.md", action: "add" as const, expectedFromSha256: null }] };
  const first = await runtime.submitDirect(input, "product"); assert.equal(first.status, "committed-pending-recovery", JSON.stringify(first));
  assert.equal(delivered.size, 1);
  const recovered = await runtime.submitDirect(input, "product"); assert.equal(recovered.status, "applied", JSON.stringify(recovered));
  assert.equal(delivered.size, 3);
  const ledger = await readTaskState(f.root); assert.equal(ledger.events.length, 2); assert.deepEqual(ledger.errors, []);
  const current = await f.store.readManifest(); assert.equal(current.ok && current.value.trunkVersion, 2);
});

test("Parent source: real assignment, durable child reference and locked parent CAS reject stale or cancelled origins", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-parent-cas-")), store = createFsTrunkStore(root), runId = "run-parent-source";
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  const material = "docs/product/demo-intent-v1.md";
  await fs.writeFile(path.join(root, material), "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\nActual allocated planning material\n");
  const draft = { schema: "ans-run/v1", runId, flowId: "demo", state: "draft", documents: {}, execution: { teamPlan: null, flow: null }, createdAt: at };
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, draft)).ok);
  const service = createTrunkService({ projectRoot: root });
  const parentInput = (taskId: string) => ({ projectRoot: root, actorRoleId: "convener" as const, taskId, flowId: "demo", runId });
  const makeParent = async (taskId: string) => {
    assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "convener", flowId: "demo", runId,
      runState: "draft", text: "Coordinate the actual planning assignment", sideEffect: "docs", idempotencyKey: taskId } })).ok);
    const result = await prepareParentTaskRef(parentInput(taskId)); assert.ok(result.ok, JSON.stringify(result));
    return result.parentTaskRef;
  };
  const report = async (taskId: string, summary: string) => assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId,
    from: "convener", status: "done", summary, evidence: [material] } })).ok);
  const closeParent = async (taskId: string, outcome: "accepted" | "rejected") => {
    await report(taskId, `Actual parent ${outcome} report`);
    const basis = await service.prepareCreatedTaskClose(taskId, "chief"); assert.ok(basis.ok, JSON.stringify(basis));
    const result = await service.closeCreatedTask({ operationId: `close-${taskId}`, taskId, runId, basisDigest: basis.value.basisDigest, reportRef: basis.value.reportRef, outcome }, "chief");
    assert.equal(result.status, "applied", JSON.stringify(result));
    return result;
  };
  const ref = await makeParent("actual-parent");
  const child: TaskCreatedEvent = { v: 1, at, kind: "task.created", taskId: "actual-child", from: "convener", to: "rapporteur", flowId: "demo", runId, runState: "draft",
    text: "Prepare this actual planning output", sideEffect: "docs", idempotencyKey: "actual-child", parentTaskRef: ref };
  assert.equal(validateTaskStateEvent({ ...child, parentTaskRef: { ...ref, safe: true } }).ok, false);
  const absent = await recordTaskObservation({ projectRoot: root, event: { ...child, parentTaskRef: undefined } }); assert.ok(!absent.ok); assert.equal(absent.code, "task-parent-required");
  const first = await recordTaskObservation({ projectRoot: root, event: child }); assert.ok(first.ok); assert.equal(first.replay, false);
  assert.deepEqual((await readTaskState(root)).records.get(child.taskId)?.created?.parentTaskRef, ref);
  assert.equal((await prepareParentTaskRef({ ...parentInput(ref.taskId), flowId: "other" })).ok, false);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: "actual-product-parent", from: "chief", to: "product",
    flowId: "demo", runId, runState: "draft", text: "Actual different-role assignment", sideEffect: "docs", idempotencyKey: "actual-product-parent" } })).ok);
  assert.equal((await prepareParentTaskRef(parentInput("actual-product-parent"))).ok, false, "A real assignment to another role cannot become this convener's parent");
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: " old-parent ", from: "chief", to: "convener", flowId: "demo", runId,
    runState: "draft", text: "A readable old-format opaque identity", sideEffect: "docs", idempotencyKey: "old-opaque-parent" } })).ok);
  assert.equal((await prepareParentTaskRef(parentInput(" old-parent "))).ok, false, "A readable historical identity cannot bypass the one strict Model reference guard");
  const otherRun = "run-parent-other"; assert.ok((await store.compareAndSwapRunRecord!(otherRun, null, { ...draft, runId: otherRun })).ok);
  assert.ok(!(await recordTaskObservation({ projectRoot: root, event: { ...child, taskId: "cross-run-child", idempotencyKey: "cross-run-child", runId: otherRun } })).ok);
  await report(ref.taskId, "Actual late parent report");
  const late = await recordTaskObservation({ projectRoot: root, event: { ...child, taskId: "stale-parent-child", idempotencyKey: "stale-parent-child" } });
  assert.ok(!late.ok); assert.equal(late.code, "task-parent-stale");
  await closeParent(ref.taskId, "accepted");
  const replay = await recordTaskObservation({ projectRoot: root, event: child }); assert.ok(replay.ok); assert.equal(replay.replay, true, "This is only the existing registration, never new-open authority");
  assert.ok((await inspectAssignedTask({ projectRoot: root, actorRoleId: "rapporteur", taskId: child.taskId })).ok, "The child's durable source does not require its parent prompt to remain active");
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId: child.taskId, from: "rapporteur", status: "done", summary: "Actual child output", evidence: [material] } })).ok);
  const childBasis = await service.prepareCreatedTaskClose(child.taskId, "convener"); assert.ok(childBasis.ok); if (!childBasis.ok) return;
  assert.equal((await service.closeCreatedTask({ operationId: "close-existing-child", taskId: child.taskId, runId, basisDigest: childBasis.value.basisDigest,
    reportRef: childBasis.value.reportRef, outcome: "accepted" }, "convener")).status, "applied");
  assert.equal((await recordTaskObservation({ projectRoot: root, event: child })).ok, true);
  assert.equal((await inspectAssignedTask({ projectRoot: root, actorRoleId: "rapporteur", taskId: child.taskId })).ok, false, "A replayed registration cannot reopen a closed child");
  const cancelledRef = await makeParent("cancelled-parent"); await closeParent(cancelledRef.taskId, "rejected");
  assert.equal((await prepareParentTaskRef(parentInput(cancelledRef.taskId))).ok, false);
  assert.ok(!(await recordTaskObservation({ projectRoot: root, event: { ...child, taskId: "cancelled-origin-child", idempotencyKey: "cancelled-origin-child", parentTaskRef: cancelledRef } })).ok);
  const deliveryParent = await makeParent("delivery-parent"), deliveryChild = { ...child, taskId: "delivery-child", idempotencyKey: "delivery-child", parentTaskRef: deliveryParent };
  assert.ok((await recordTaskObservation({ projectRoot: root, event: deliveryChild })).ok);
  const assignedSource = { projectRoot: root, recipientRoleId: "convener", source: { kind: "assigned-task" as const, taskId: deliveryParent.taskId } };
  const reportSource = { projectRoot: root, recipientRoleId: "convener", source: { kind: "child-report" as const, childTaskId: deliveryChild.taskId, childRoleId: "rapporteur" }, expectedFlowId: "demo", expectedRunId: runId };
  assert.deepEqual(await resolveDeliveryAssignment(assignedSource), { ok: true, value: { taskId: deliveryParent.taskId, actorRoleId: "convener", flowId: "demo", runId } });
  assert.equal((await resolveDeliveryAssignment(reportSource)).ok, false, "An actual child creation alone is not a delivered report source");
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId: deliveryChild.taskId, from: "rapporteur", status: "done", summary: "Actual handback", evidence: [material] } })).ok);
  assert.deepEqual(await resolveDeliveryAssignment(reportSource), { ok: true, value: { taskId: deliveryParent.taskId, actorRoleId: "convener", flowId: "demo", runId } });
  assert.equal((await resolveDeliveryAssignment({ ...reportSource, recipientRoleId: "chief" })).ok, false);
  assert.equal((await resolveDeliveryAssignment({ ...reportSource, source: { ...reportSource.source, childRoleId: "product" } })).ok, false);
  assert.equal((await resolveDeliveryAssignment({ ...reportSource, expectedFlowId: "other" })).ok, false);
  assert.equal((await resolveDeliveryAssignment({ ...reportSource, expectedRunId: otherRun })).ok, false);
  assert.equal((await resolveDeliveryAssignment({ ...assignedSource, source: { kind: "assigned-task", taskId: "missing-exact-id" } })).ok, false, "No latest-role fallback");
  const deliveryBasis = await service.prepareCreatedTaskClose(deliveryChild.taskId, "convener"); assert.ok(deliveryBasis.ok, JSON.stringify(deliveryBasis));
  const deliveryChildClosed = await service.closeCreatedTask({ operationId: "close-delivery-child", taskId: deliveryChild.taskId, runId, basisDigest: deliveryBasis.value.basisDigest,
    reportRef: deliveryBasis.value.reportRef, outcome: "accepted" }, "convener");
  assert.equal(deliveryChildClosed.status, "applied");
  assert.equal((await resolveDeliveryAssignment(reportSource)).ok, true, "A real creator-accepted child preserves its report relationship to the still-open parent");
  assert.equal((await resolveDeliveryAssignment({ projectRoot: root, recipientRoleId: "rapporteur", source: { kind: "assigned-task", taskId: deliveryChild.taskId } })).ok, false, "Historical handback never reopens the closed child");
  const deliveryParentClosed = await closeParent(deliveryParent.taskId, "accepted");
  assert.equal((await resolveDeliveryAssignment(reportSource)).ok, false, "A closed controller cannot receive a new assignment through its child's old report");
  assert.ok(deliveryParentClosed.source); const noticeSource = deliveryParentClosed.source; assert.ok(noticeSource.kind === "role-direct");
  const notice = { projectRoot: root, recipientRoleId: "convener", boundTaskId: deliveryParent.taskId, operationId: deliveryParentClosed.operationId, source: noticeSource };
  const ledgerBeforeNotice = await fs.readFile(path.join(root, ".ans/state/tasks.jsonl"));
  assert.deepEqual(await classifyClosedTaskNotice(notice), { ok: true, value: { kind: "information-only", taskId: deliveryParent.taskId, recipientRoleId: "convener", operationId: deliveryParentClosed.operationId } });
  assert.equal((await classifyClosedTaskNotice({ ...notice, source: structuredClone(noticeSource) })).ok, true, "A serialized real host receipt is ordinary matching data, not a private authorization token");
  assert.equal((await classifyClosedTaskNotice({ ...notice, source: { ...noticeSource, targetDigest: "0".repeat(64) } })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...notice, operationId: "different-operation" })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...notice, recipientRoleId: "product" })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...notice, recipientRoleId: "product", boundTaskId: "actual-product-parent" })).ok, false, "An open task is not a retired notice");
  assert.deepEqual(await classifyClosedTaskNotice({ ...notice, boundTaskId: cancelledRef.taskId }), { ok: true, value: { kind: "information-only", taskId: deliveryParent.taskId, recipientRoleId: "convener", operationId: deliveryParentClosed.operationId } },
    "A proven host fact names its source task; it does not reopen or complete the recipient's different rejected assignment");
  assert.equal((await inspectAssignedTask({ projectRoot: root, actorRoleId: "convener", taskId: cancelledRef.taskId })).ok, false, "An information receipt never authorizes the old rejected task");
  assert.ok(deliveryChildClosed.source?.kind === "role-direct");
  assert.deepEqual(await classifyClosedTaskNotice({ ...notice, operationId: deliveryChildClosed.operationId, source: deliveryChildClosed.source }),
    { ok: true, value: { kind: "information-only", taskId: deliveryChild.taskId, recipientRoleId: "convener", operationId: deliveryChildClosed.operationId } },
    "The original creator can receive the actual closed child's fact despite its own old closed assignment");
  assert.equal((await classifyClosedTaskNotice({ ...notice, boundTaskId: "missing-recipient-assignment" })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...notice, source: { ...noticeSource, action: "complete-team-plan" } })).ok, false, "Other business actions are not swallowed as closed-task facts");
  assert.equal((await inspectAssignedTask({ projectRoot: root, actorRoleId: "convener", taskId: deliveryParent.taskId })).ok, false);
  assert.deepEqual(await fs.readFile(path.join(root, ".ans/state/tasks.jsonl")), ledgerBeforeNotice, "Classification never appends completion or reopens a task");
  const productTaskId = "actual-product-parent";
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId: productTaskId, from: "product", status: "done", summary: "Actual product draft", evidence: [material] } })).ok);
  const productBasis = await service.prepareCreatedTaskClose(productTaskId, "chief"); assert.ok(productBasis.ok, JSON.stringify(productBasis));
  const productClosed = await service.closeCreatedTask({ operationId: "close-actual-product-parent", taskId: productTaskId, runId, basisDigest: productBasis.value.basisDigest,
    reportRef: productBasis.value.reportRef, outcome: "accepted" }, "chief"); assert.equal(productClosed.status, "applied"); assert.ok(productClosed.source?.kind === "role-direct");
  const crossRoleNotice = { ...notice, operationId: productClosed.operationId, source: productClosed.source };
  const ledgerBeforeCrossRoleNotice = await fs.readFile(path.join(root, ".ans/state/tasks.jsonl"));
  assert.deepEqual(await classifyClosedTaskNotice(crossRoleNotice), { ok: true, value: { kind: "information-only", taskId: productTaskId, recipientRoleId: "convener", operationId: productClosed.operationId } },
    "A real chief close of a product task can inform convener; its old assignment is not the source task");
  assert.equal((await classifyClosedTaskNotice({ ...crossRoleNotice, source: { ...productClosed.source, targetDigest: "0".repeat(64) } })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...crossRoleNotice, operationId: "unclosed-operation", source: { ...productClosed.source, operationId: "unclosed-operation" } })).ok, false);
  assert.deepEqual(await fs.readFile(path.join(root, ".ans/state/tasks.jsonl")), ledgerBeforeCrossRoleNotice);
  const otherRunRecipient = "actual-other-run-recipient";
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", from: "chief", to: "convener", taskId: otherRunRecipient,
    flowId: "demo", runId: otherRun, runState: "draft", text: "Actual distinct run assignment", sideEffect: "docs", idempotencyKey: otherRunRecipient } })).ok);
  await report(otherRunRecipient, "Actual other run report");
  const otherRunBasis = await service.prepareCreatedTaskClose(otherRunRecipient, "chief"); assert.ok(otherRunBasis.ok, JSON.stringify(otherRunBasis));
  assert.equal((await service.closeCreatedTask({ operationId: "close-other-run-recipient", taskId: otherRunRecipient, runId: otherRun, basisDigest: otherRunBasis.value.basisDigest,
    reportRef: otherRunBasis.value.reportRef, outcome: "accepted" }, "chief")).status, "applied");
  assert.equal((await classifyClosedTaskNotice({ ...crossRoleNotice, boundTaskId: otherRunRecipient })).ok, false, "An actual source cannot be attached to an unrelated run's recipient assignment");
  const openNoticeRecipient = await makeParent("actual-open-notice-recipient");
  assert.equal((await classifyClosedTaskNotice({ ...crossRoleNotice, boundTaskId: openNoticeRecipient.taskId })).ok, false, "A still-open recipient's work keeps normal notification delivery rather than being retired by another task's close fact");
  // Service-layer host DTO is already checked by Pipeline; persist the real source/draft/close here,
  // rather than making a planning draft look like the recipient's execution run.
  const professional = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "product", flowId: "demo", hostInitialization: {
    registration: { source: "native-directory-selection", selectionId: "service-notice-selection", selectedRoot: root, projectRoot: root, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief", runtime: "demo", sessionId: "service-notice-session", turnId: "service-notice-turn", kind: "message", inputAccepted: true, settled: false },
  } });
  assert.ok(professional.ok, JSON.stringify(professional)); if (!professional.ok) return;
  assert.equal(professional.value.purpose, "document-preparation");
  const docRun = professional.value.runId, docSource = professional.value.initializationSource;
  assert.ok(docRun && docRun !== runId && docSource); if (!docRun || !docSource) return;
  const docTask = "actual-professional-product";
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: docTask, from: "chief", to: "product",
    flowId: "demo", runId: docRun, runState: "draft", text: "Prepare this product draft", sideEffect: "docs", idempotencyKey: docTask,
    workSourceRef: { kind: docSource.kind ?? "chief-customer-turn", sourceId: docSource.sourceId, path: docSource.path, sha256: docSource.sha256 } } })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.reported", taskId: docTask, from: "product", status: "done", summary: "Actual product material", evidence: [material] } })).ok);
  const docBasis = await service.prepareCreatedTaskClose(docTask, "chief"); assert.ok(docBasis.ok, JSON.stringify(docBasis)); if (!docBasis.ok) return;
  const docClosed = await service.closeCreatedTask({ operationId: "close-professional-product", taskId: docTask, runId: docRun,
    basisDigest: docBasis.value.basisDigest, reportRef: docBasis.value.reportRef, outcome: "accepted" }, "chief");
  assert.equal(docClosed.status, "applied", JSON.stringify(docClosed)); assert.ok(docClosed.source?.kind === "role-direct");
  const docNotice = { ...notice, operationId: docClosed.operationId, source: docClosed.source };
  const originalLedger = await fs.readFile(path.join(root, ".ans/state/tasks.jsonl"));
  assert.deepEqual(await classifyClosedTaskNotice(docNotice), { ok: true, value: { kind: "information-only", taskId: docTask, recipientRoleId: "convener", operationId: docClosed.operationId } });
  assert.equal((await classifyClosedTaskNotice({ ...docNotice, boundTaskId: openNoticeRecipient.taskId })).ok, false);
  assert.equal((await classifyClosedTaskNotice({ ...docNotice, source: { ...docClosed.source, targetDigest: "0".repeat(64) } })).ok, false);
  const foreign = await fs.mkdtemp(path.join(os.tmpdir(), "ans-notice-other-project-"));
  assert.equal((await classifyClosedTaskNotice({ ...docNotice, projectRoot: foreign })).ok, false);
  const sourceAbs = path.join(root, docSource.path), originalSource = await fs.readFile(sourceAbs);
  await fs.appendFile(sourceAbs, "\n");
  assert.equal((await classifyClosedTaskNotice(docNotice)).ok, false, "Changed source bytes cannot create a cross-run information exception");
  await fs.writeFile(sourceAbs, originalSource);
  assert.deepEqual(await fs.readFile(path.join(root, ".ans/state/tasks.jsonl")), originalLedger, "Information classification does not append/open/reassign any task");
  for (const change of ["report", "close"] as const) {
    const raceRef = await makeParent(`race-parent-${change}`), raceChild = { ...child, taskId: `raced-child-${change}`, idempotencyKey: `raced-child-${change}`, parentTaskRef: raceRef };
    let reads = 0;
    const racedService = createTrunkService({ projectRoot: root, store: { ...store, async readRunRecord(id) {
      const actual = await store.readRunRecord!(id);
      if (++reads === 2) { if (change === "report") await report(raceRef.taskId, "Report during child prepare/append gap"); else await closeParent(raceRef.taskId, "rejected"); }
      return actual;
    } } });
    const result = await racedService.recordTaskObservation(raceChild); assert.ok(!result.ok, JSON.stringify(result));
    assert.equal(result.code, "task-ledger-append-failed"); assert.equal(result.message, change === "report" ? "task-parent-row-cas-conflict" : "task-parent-binding-conflict");
    assert.equal((await readTaskState(root)).records.has(raceChild.taskId), false, "Actual lock recheck must leave no child row after the parent changed");
  }
  const cancelledRunParent = await makeParent("actual-cancelled-run-parent"), runBeforeCancel = await store.readRunRecord!(runId); assert.ok(runBeforeCancel.ok);
  assert.ok((await store.compareAndSwapRunRecord!(runId, runBeforeCancel.value.sha256, { ...runBeforeCancel.value.value, state: "cancelled" })).ok);
  assert.equal((await resolveDeliveryAssignment({ ...assignedSource, source: { kind: "assigned-task", taskId: cancelledRunParent.taskId } })).ok, false, "An open task cannot reuse a truly cancelled run");
});

test("Provider strict scan: real non-ENOENT directory failure is never a complete empty TOFU scan", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-strict-scan-"));
  assert.deepEqual(await scanVersionedDocuments(root, { strict: true }), []);
  await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/proposals"), "Actual ENOTDIR fixture");
  await assert.rejects(scanVersionedDocuments(root, { strict: true }), error => !!error && typeof error === "object" && "code" in error && error.code === "ENOTDIR");
  assert.deepEqual(await scanVersionedDocuments(root), [], "Existing best-effort callers keep their documented compatibility; G complete-scan calls must opt into strict");
});
