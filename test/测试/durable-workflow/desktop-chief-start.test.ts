import assert from "node:assert/strict";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKFLOW_START_OPTION_IDS } from "../../../app/desktop/workflow-chief-start.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { readWorkflowLedger } from "../../../src/common/编排/workflow-service.ts";
import { app, businessDb, emptyFixture, fixture, git, modelFixture, resourceRoot, sqliteSnapshot, successful, target as trackedFile, until, unwrap, write, type Log } from "./fixture.ts";

const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to verified Windows bundle resources", timeout: 120_000 };
const [approve, reject] = WORKFLOW_START_OPTION_IDS;
const matchWindow = () => true;

async function assertLegacyFirstStagesDenied(turn: import("./fixture.ts").ModelTurn) {
  if (!turn.toolNames.includes("dispatch_task")) {
    assert.equal(turn.toolNames.includes("redispatch_task"), false);
    return;
  }
  for (const [workflowPath, stage] of [["A", "A1"], ["B", "B1"]]) {
    const legacy = await turn.call("dispatch_task", { roleId: "convener", task: `Attempt the old ${stage} shortcut`,
      flowId: "w5-old-shortcut", workflowId: "forged-workflow-id", workflowPath, stage, taskKind: "stage-request",
      workflowAction: "advance", sideEffect: "read-only" });
    assert.equal(legacy.ok, false);
    assert.match(legacy.message ?? "", /workflow-start-confirmation-required|workflow-dispatch-owned/);
  }
}

test("ordinary Chief proposes preset A, and a trusted customer starts it only after the live turn settles", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const requirement = "Create an isolated local example with a new governed implementation";
  const releaseParent = Promise.withResolvers<void>();
  const releaseProduct = Promise.withResolvers<void>();
  const releaseNextProduct = Promise.withResolvers<void>();
  const productTurns: string[] = [];
  let instanceId: string | undefined;
  let chiefAck: string | undefined;
  let choice: { definitionId: string; source: "preset"; expectedDigest: string; reason: string };
  const model = modelFixture(async turn => {
    if (turn.roleId === "chief" && turn.text === requirement) {
      assert.ok(turn.turnId);
      chiefAck = turn.turnId;
      const catalog = await turn.call("project_state", { definitionId: "path-a" });
      assert.equal(catalog.ok, true, catalog.message);
      assert.ok(catalog.message?.includes(`preset | id=path-a | v4 | ${choice.expectedDigest}`), catalog.message);
      const receipt = await turn.call("request_workflow_start", choice);
      assert.equal(receipt.ok, true, receipt.message);
      const duplicate = await turn.call("request_workflow_start", choice);
      assert.deepEqual(duplicate, receipt);
      const conflict = await turn.call("request_workflow_start", { ...choice, reason: "An inconsistent proposal for the same input" });
      assert.equal(conflict.ok, false, conflict.message);
      log("live-chief-input-and-proposal", { ackTurn: turn.turnId, catalog, receipt, conflict });
      await assertLegacyFirstStagesDenied(turn);
      await releaseParent.promise;
      await assertLegacyFirstStagesDenied(turn);
    } else if (turn.roleId === "product") {
      const taskId = /任务编号：#([0-9a-z-]+)\b/.exec(turn.text)?.[1];
      assert.ok(taskId, turn.text);
      const task = (await readTaskState(f.root)).records.get(taskId)?.created;
      assert.ok(task, turn.text);
      if (task.stage === "A2") {
        await releaseNextProduct.promise;
        return;
      }
      assert.equal(task.stage, "A1");
      assert.equal(task.to, "product");
      assert.equal(task.sideEffect, "read-only");
      assert.ok(turn.text.includes(requirement), turn.text);
      assert.ok(task.flowId && turn.text.includes(task.flowId), turn.text);
      const illegal = await turn.call("write_file", { path: `docs/product/${task.flowId}-outside-a1.md`, content: "Not authorized by A1" });
      assert.equal(illegal.ok, false, illegal.message);
      productTurns.push(taskId);
      log("product-direct-a1-write-denied", { taskId, illegal });
      await releaseProduct.promise;
      if (turn.signal.aborted) return;
      await successful(turn, "submit_report", { status: "completed", summary: "The customer requirement is bounded. Product intake is ready for intent drafting." });
    }
  }, log);
  const handle = await app(f, model, log);
  t.after(() => { releaseParent.resolve(); releaseProduct.resolve(); releaseNextProduct.resolve(); return handle.close(); });
  const project = { projectRoot: f.root };
  const target = { ...project, roleId: "chief", runtime: "pi" as const };
  const definition = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-a", source: "preset" }));
  assert.ok(definition.digest);
  assert.equal(definition.version, 4);
  choice = { definitionId: "path-a", source: "preset", expectedDigest: definition.digest, reason: "A new project needs full product governance" };
  const blocked = await handle.desktop.startDurableWorkflow({ ...project, ...choice, enabled: true, requestId: "w5-bypass", summary: requirement });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "workflow-start-confirmation-required");
  const opened = await handle.desktop.openSession(target);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const sent = handle.desktop.sendSession({ text: requirement, target, metadata: { clientMessageId: "display-only" } }, matchWindow);
  const card = await until("the exclusive workflow-start card", async () => [...handle.cards.values()]
    .find(item => item.request.cardKind === "workflow-start"), model.errors);
  assert.equal(card.request.application, true);
  assert.equal(card.request.sourceRoleId, "application");
  for (const field of [requirement, choice.reason, definition.name, "preset", "path-a", definition.digest]) {
    assert.ok(field && card.request.preview?.includes(field), JSON.stringify(card.request));
  }
  assert.deepEqual(card.request.kind === "choice" ? card.request.options.map(item => item.id) : [], [approve, reject]);
  const proposals = async () => unwrap(await handle.desktop.listWorkflowStartProposals(project));
  const [pending] = await proposals();
  assert.equal(pending.state, "pending");
  assert.equal(pending.requirement.text, requirement);
  assert.equal(pending.definition.digest, definition.digest);
  assert.equal(pending.requestId, card.id);
  const raw = businessDb(f, db => ({
    proposals: db.prepare("SELECT * FROM workflow_start_proposal").all(),
    jobs: db.prepare("SELECT * FROM workflow_start_job").all(),
    instances: db.prepare("SELECT id FROM instance").all(),
  }));
  assert.equal(raw.proposals.length, 1);
  const stored = JSON.parse(String(raw.proposals[0].data)).proposal;
  assert.equal(stored.requirement.turnId, chiefAck);
  assert.equal(stored.requirement.text, requirement);
  assert.notEqual(stored.requirement.inputId, "display-only");
  assert.deepEqual(raw.jobs, []);
  assert.deepEqual(raw.instances, []);
  assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(project)).controlPlane.state, "stopped");
  assert.equal(await (await handle.durable.store()).owner(f.root), undefined);
  assert.equal((await readTaskState(f.root)).records.size, 0);
  await assert.rejects(access(path.join(f.root, ".git")), { code: "ENOENT" });
  assert.equal((await handle.respond(card.id, approve)).ok, false);
  assert.equal((await handle.respond(card.id, approve, () => false)).ok, false);
  assert.equal((await handle.respond(card.id, approve, matchWindow)).ok, true);
  const accepted = await until("approved durable job awaiting the parent role turn", async () => {
    const [row] = await proposals();
    if (row?.state === "approved" && row.startup?.code === "workflow-existing-turn") return row;
  }, model.errors);
  assert.equal(accepted.activationId, pending.activationId);
  assert.deepEqual(businessDb(f, db => db.prepare("SELECT id FROM instance").all()), []);
  assert.equal(businessDb(f, db => db.prepare("SELECT * FROM workflow_start_job").all()).length, 1);
  assert.equal((await handle.respond(card.id, reject, matchWindow)).ok, false);
  log("approved-before-instance", { pending, raw, accepted });
  releaseParent.resolve();
  assert.equal((await sent).ok, true);
  const started = await until("the approved graph instance", async () => {
    const [row] = await proposals();
    if (row?.instanceId) {
      instanceId = row.instanceId;
      return row;
    }
  }, model.errors);
  const taskId = await until("the actual product role receives its direct A1 task", async () => productTurns[0], model.errors);
  const inFlight = (await readTaskState(f.root)).events;
  const a1Tasks = inFlight.filter(event => event.kind === "task.created" && event.workflowId === instanceId && event.stage === "A1");
  assert.equal(a1Tasks.length, 1);
  const [first] = a1Tasks;
  assert.equal(first.kind, "task.created");
  assert.equal(first.taskId, taskId);
  assert.equal(first.to, "product");
  assert.match(first.flowId ?? "", /^intake-[a-f0-9]{24}$/);
  assert.equal(inFlight.some(event => event.kind === "task.created" && event.workflowId === instanceId && event.stage === "A2"), false);
  const projection = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId }));
  assert.equal(projection.instance?.definitionDigest, definition.digest);
  assert.equal(projection.instance?.action, "product-prepare-direct");
  assert.equal(projection.instance?.flowId, first.flowId);
  assert.equal(projection.controlPlane.state, "ready");
  assert.ok(instanceId);
  const beforeReport = sqliteSnapshot(f, instanceId);
  assert.equal(businessDb(f, db => db.prepare("SELECT id FROM instance").all()).length, 1);
  await assert.rejects(access(path.join(f.root, ".git")), { code: "ENOENT" });
  await assert.rejects(access(path.join(f.root, `docs/product/${first.flowId}-outside-a1.md`)), { code: "ENOENT" });
  releaseProduct.resolve();
  const advanced = await until("the saved A1 report advances the same instance to A2", async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId })).instance;
    if (view?.action === "author-intent-direct") return view;
  }, model.errors);
  assert.equal(advanced.flowId, first.flowId);
  assert.deepEqual(productTurns, [taskId]);
  log("real-first-action-after-customer-approval", { started, first, projection, beforeReport, advanced, afterReport: sqliteSnapshot(f, instanceId) });
});

for (const scope of ["bundled-b", "imported"] as const) test(`ordinary Chief confirms ${scope} and reaches its real B1 role dispatch`, native, async t => {
  const f = await fixture({ installLegacyPathB: false });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const project = { projectRoot: f.root };
  let handle: Awaited<ReturnType<typeof app>>;
  const model = modelFixture(async turn => {
    if (turn.roleId !== "chief") return;
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection(project));
    assert.equal(view.instance?.action, "observe-existing");
    await successful(turn, "dispatch_task", { roleId: "convener", task: "Review the existing threshold",
      flowId: "w5-chief-b", workflowId: view.instance.instanceId, taskKind: "stage-request", workflowPath: "B", stage: "B1",
      workflowAction: "advance", sideEffect: "read-only", requestedEvidence: [trackedFile], reason: "Confirm the existing tracked threshold before proposing a scoped correction" });
  }, log);
  const definitionPath = fileURLToPath(new URL("./fixtures/external-existing-change.yaml", import.meta.url));
  handle = await app(f, model, log, { pickWorkflowDefinition: async () => definitionPath });
  t.after(() => handle.close());
  const selected = scope === "bundled-b" ? unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-b", source: "preset" }))
    : unwrap(await handle.desktop.importDurableWorkflow(project));
  assert.ok(selected.id && selected.digest && selected.source);
  const result = unwrap(await handle.startViaChief({ ...project, definitionId: selected.id, source: selected.source, expectedDigest: selected.digest,
    summary: "Inspect the existing tracked threshold for a possible correction" }));
  assert.equal(result.instance?.definitionId, selected.id);
  assert.equal(result.instance?.definitionSource, selected.source);
  assert.equal(result.instance?.definitionDigest, selected.digest);
  const first = await until("first actual B1 operations task is created", async () => (await readTaskState(f.root)).events.find(event =>
    event.kind === "task.created" && event.workflowId === result.instance?.instanceId && event.stage === "B1"), model.errors);
  assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  log("chosen-definition-first-native-b1", { scope, selected, result, first });
});

test("untrusted ordinary frame and old A1/B1 routes cannot authorize startup", native, async t => {
  const f = await fixture({ installLegacyPathB: false });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  let digest: string;
  let checked = false;
  const session = { projectRoot: f.root, roleId: "chief", runtime: "pi" as const };
  const model = modelFixture(async turn => {
    assert.equal(turn.roleId, "chief");
    assert.equal((await turn.call("project_state", { definitionId: "path-b" })).ok, true);
    const noGrant = await turn.call("request_workflow_start", { definitionId: "path-b", source: "preset", expectedDigest: digest, reason: "No trusted frame grant" });
    assert.equal(noGrant.ok, false);
    assert.match(noGrant.message ?? "", /workflow-start-input-unverified/);
    await assertLegacyFirstStagesDenied(turn);
    const fakeCard = await turn.call("request_choice", { title: "Fake startup", cardKind: "workflow-start", options: [{ id: approve, label: "Approve" }, { id: reject, label: "Reject" }] });
    assert.equal(fakeCard.ok, false);
    checked = true;
  }, log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const project = { projectRoot: f.root };
  digest = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-b", source: "preset" })).digest!;
  assert.equal((await handle.desktop.openSession(session)).ok, true);
  assert.equal((await handle.desktop.sendSession({ text: "Wrong role must be denied", target: { ...session, roleId: "worker" } }, matchWindow)).ok, false);
  assert.equal((await handle.desktop.sendSession({ text: "No trusted callback", target: session,
    metadata: { clientMessageId: "pretend-trusted-customer" } })).ok, true);
  await until("real unauthorized tool calls are denied", async () => checked ? true : undefined, model.errors);
  assert.deepEqual(unwrap(await handle.desktop.listWorkflowStartProposals(project)), []);
  assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(project)).instance, undefined);
  assert.equal((await readTaskState(f.root)).records.size, 0);
  assert.equal((await readWorkflowLedger(f.root)).events.some(event => event.kind === "workflow.started"), false);
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.baselineOid);
  assert.equal(handle.cards.size, 0);
});

test("queued ordinary Chief input keeps its frame grant and can read one definition from a long catalog", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const project = { projectRoot: f.root };
  const target = { ...project, roleId: "chief", runtime: "pi" as const };
  const first = "Read the available workflow definitions";
  const queued = "Create a governed local example from the selected preset";
  const release = Promise.withResolvers<void>();
  let catalogChecked = false;
  let deferredTurn: string | undefined;
  let digest: string;
  const yaml = await readFile(new URL("../../../docs/workflows/path-a.yaml", import.meta.url), "utf8");
  for (let index = 1; index <= 30; index++) {
    const id = `catalog-example-${String(index).padStart(2, "0")}`;
    await write(f.root, `docs/workflows/${id}.yaml`, yaml.replace("id: path-a", `id: ${id}`));
  }
  const model = modelFixture(async turn => {
    assert.equal(turn.roleId, "chief");
    if (turn.text.endsWith(first)) {
      const result = await turn.call("project_state", {});
      assert.equal(result.ok, true);
      assert.match(result.message ?? "", /More definitions exist/);
      assert.ok(Buffer.byteLength(result.message ?? "", "utf8") < 3000);
      catalogChecked = true;
      await release.promise;
      return;
    }
    assert.ok(turn.text.endsWith(queued), turn.text);
    deferredTurn = turn.turnId;
    const exact = await turn.call("project_state", { definitionId: "path-a" });
    assert.equal(exact.ok, true);
    assert.ok(exact.message?.includes(digest));
    assert.ok(!exact.message?.includes("More definitions exist"));
    await successful(turn, "request_workflow_start", { definitionId: "path-a", source: "preset", expectedDigest: digest, reason: "Full governance for the queued new request" });
  }, log);
  const handle = await app(f, model, log);
  t.after(() => { release.resolve(); return handle.close(); });
  digest = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-a", source: "preset" })).digest!;
  assert.equal((await handle.desktop.openSession(target)).ok, true);
  const read = handle.desktop.sendSession({ text: first, target }, matchWindow);
  await until("long catalog read completes without a startup", async () => catalogChecked ? true : undefined, model.errors);
  assert.deepEqual(unwrap(await handle.desktop.listWorkflowStartProposals(project)), []);
  assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(project)).controlPlane.state, "stopped");
  const sent = await handle.desktop.sendSession({ text: queued, target, metadata: { clientMessageId: "queued-display-id" } }, matchWindow);
  assert.ok(sent.ok && sent.queued, JSON.stringify(sent));
  assert.equal(deferredTurn, undefined);
  release.resolve();
  assert.equal((await read).ok, true);
  const [proposal] = await until("queued authenticated message produces the exclusive card", async () => {
    const proposals = unwrap(await handle.desktop.listWorkflowStartProposals(project));
    if (proposals.some(row => handle.cards.has(row.requestId))) return proposals;
  }, model.errors);
  assert.equal(proposal.requirement.text, queued);
  const row = businessDb(f, db => db.prepare("SELECT * FROM workflow_start_proposal").get());
  assert.equal(JSON.parse(String(row?.data)).proposal.requirement.turnId, deferredTurn);
  assert.notEqual(row?.input_id, "queued-display-id");
  assert.equal((await readTaskState(f.root)).records.size, 0);
  log("queued-chief-original-input-proven", { sent, deferredTurn, proposal, storedInputId: row?.input_id });
});

for (const drift of ["rewrite", "delete", "same-bytes-override"] as const) test(`pending customer card loses authority on ${drift}`, native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const model = modelFixture(async turn => assert.fail(`unexpected model turn: ${turn.text}`), log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const project = { projectRoot: f.root };
  const local = "docs/workflows/path-a.yaml";
  const source = drift === "same-bytes-override" ? "preset" : "project";
  if (source === "project") unwrap(await handle.desktop.copyDurableWorkflowPreset({ ...project, definitionId: "path-a" }));
  const pending = unwrap(await handle.proposeViaChief({ ...project, definitionId: "path-a", source, summary: "Create a new example based on this exact definition" }));
  await until("the original pending card", async () => handle.cards.get(pending.requestId), model.errors);
  if (drift === "rewrite") {
    const content = await readFile(path.join(f.root, local), "utf8");
    await write(f.root, local, content.replace(/name: .+/, "name: Changed name, same version"));
  } else if (drift === "delete") {
    await unlink(path.join(f.root, local));
  } else {
    const copied = unwrap(await handle.desktop.copyDurableWorkflowPreset({ ...project, definitionId: "path-a" }));
    assert.equal(copied.digest, pending.definition.digest);
    assert.notEqual(copied.source, pending.definition.source);
  }
  const response = await handle.respond(pending.requestId, approve, matchWindow);
  assert.equal(response.ok, false);
  const stale = await until("saved proposal becomes stale", async () => {
    const [row] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
    if (row?.state === "stale") return row;
  }, model.errors);
  assert.equal(stale.activationId, pending.activationId);
  assert.equal(stale.decision, undefined);
  assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(project)).instance, undefined);
  assert.equal(businessDb(f, db => db.prepare("SELECT * FROM workflow_start_job").all()).length, 0);
  assert.equal((await readTaskState(f.root)).records.size, 0);
  await assert.rejects(access(path.join(f.root, ".git")), { code: "ENOENT" });
  log("pending-card-drift-refused", { drift, pending, response, stale });
});

test("a pending card survives controller reopen and simulated next day through one rejection", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const afterRejection = "Try the old start shortcut after the customer declined";
  let oldRoutesChecked = false;
  const model = modelFixture(async turn => {
    assert.ok(turn.text.endsWith(afterRejection), `unexpected model turn: ${turn.text}`);
    await assertLegacyFirstStagesDenied(turn);
    oldRoutesChecked = true;
  }, log);
  let handle = await app(f, model, log);
  t.after(() => handle.close());
  const project = { projectRoot: f.root };
  const input = { ...project, definitionId: "path-a", source: "preset" as const, summary: "Build one local example and wait for my decision" };
  const pending = unwrap(await handle.proposeViaChief(input));
  const original = await until("original pending card", async () => handle.cards.get(pending.requestId), model.errors);
  const oldWindow = handle;
  await handle.close();
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(pending.createdAt) + 25 * 60 * 60 * 1000 });
  try {
    handle = await app(f, model, log);
    const reopened = await until("original pending card after simulated next day", async () => handle.cards.get(pending.requestId), model.errors);
    assert.equal(reopened.id, original.id);
    assert.deepEqual(reopened.request, original.request);
    assert.equal((await oldWindow.respond(original.id, approve, matchWindow)).ok, false);
    assert.equal((await handle.respond(reopened.id, reject, matchWindow)).ok, true);
    assert.equal((await handle.respond(reopened.id, approve, matchWindow)).ok, false);
    const target = { ...project, roleId: "chief", runtime: "pi" as const };
    assert.equal((await handle.desktop.openSession(target)).ok, true);
    assert.equal((await handle.desktop.sendSession({ text: afterRejection, target }, matchWindow)).ok, true);
    assert.equal(oldRoutesChecked, true);
    const repeated = unwrap(await handle.proposeViaChief(input));
    assert.notEqual(repeated.activationId, pending.activationId);
    const rows = businessDb(f, db => db.prepare("SELECT input_id, state FROM workflow_start_proposal ORDER BY rowid").all());
    assert.deepEqual(rows.map(row => row.state), ["rejected", "pending"]);
    assert.notEqual(rows[0].input_id, rows[1].input_id);
    assert.equal(unwrap(await handle.desktop.getDurableWorkflowProjection(project)).instance, undefined);
    assert.equal((await readTaskState(f.root)).records.size, 0);
    assert.equal((await readWorkflowLedger(f.root)).events.some(event => event.kind === "workflow.started"), false);
    log("next-day-pending-and-distinct-new-input", { pending, repeated, rows, simulatedTime: new Date().toISOString() });
  } finally {
    t.mock.timers.reset();
  }
});

test("actual project switch expires the old window card and allows only the reselected project's decision", native, async t => {
  const f = await emptyFixture();
  const other = await emptyFixture();
  const project = { projectRoot: f.root };
  const otherProject = { projectRoot: other.root };
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  let root = f.root;
  const model = modelFixture(async turn => assert.fail(`unexpected model turn: ${turn.text}`), log);
  const handle = await app(f, model, log, { chooseProjectRoot: async () => root });
  t.after(() => handle.close());
  const proposal = unwrap(await handle.proposeViaChief({ ...project, definitionId: "path-a", source: "preset", summary: "Keep this new project decision private to its native selection" }));
  const card = await until("original project card", async () => handle.cards.get(proposal.requestId), model.errors);
  root = other.root;
  assert.equal(await handle.desktop.pickProject(), root);
  await handle.desktop.listProject(otherProject);
  assert.deepEqual(unwrap(await handle.desktop.listWorkflowStartProposals(otherProject)), []);
  const old = await handle.respond(card.id, approve, matchWindow);
  assert.equal(old.ok, false);
  root = f.root;
  assert.equal(await handle.desktop.pickProject(), root);
  await handle.desktop.listProject(project);
  const same = await until("same original card reappears in reselected project", async () => handle.cards.get(proposal.requestId), model.errors);
  assert.equal(same.id, card.id);
  assert.deepEqual(same.request, card.request);
  const request = { ...project, activationId: proposal.activationId, requestId: same.id };
  assert.equal((await handle.desktop.revokeWorkflowStartProposal(request, () => false)).ok, false);
  const revoked = unwrap(await handle.desktop.revokeWorkflowStartProposal(request, matchWindow));
  assert.equal(revoked.state, "revoked");
  assert.equal((await handle.respond(card.id, approve, () => false)).ok, false);
  assert.equal(businessDb(f, db => db.prepare("SELECT * FROM workflow_start_job").all()).length, 0);
  assert.equal((await readTaskState(f.root)).records.size, 0);
  log("project-switch-and-verified-revocation", { proposal, old, revoked });
});

test("a persisted approval resumes once after deleting its project YAML and reopening the controller", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const releaseParent = Promise.withResolvers<void>();
  const project = { projectRoot: f.root };
  const target = { ...project, roleId: "chief", runtime: "pi" as const };
  const requirement = "Create a governed local example using this exact saved project definition";
  let choice: { definitionId: string; expectedDigest: string; source: "project"; reason: string };
  const model = modelFixture(async turn => {
    if (turn.text !== requirement) return;
    await successful(turn, "project_state", { definitionId: "path-a" });
    await successful(turn, "request_workflow_start", choice);
    await releaseParent.promise;
  }, log);
  let handle = await app(f, model, log);
  t.after(() => { releaseParent.resolve(); return handle.close(); });
  const copied = unwrap(await handle.desktop.copyDurableWorkflowPreset({ ...project, definitionId: "path-a" }));
  assert.ok(copied.digest);
  choice = { definitionId: "path-a", expectedDigest: copied.digest, source: "project", reason: "The project-selected definition is the current new-product flow" };
  assert.equal((await handle.desktop.openSession(target)).ok, true);
  const sent = handle.desktop.sendSession({ text: requirement, target }, matchWindow);
  const original = await until("pending persisted project workflow card", async () => [...handle.cards.values()].find(item => item.request.cardKind === "workflow-start"), model.errors);
  assert.equal((await handle.respond(original.id, approve, matchWindow)).ok, true);
  const before = businessDb(f, db => ({ proposal: db.prepare("SELECT activation_id, state FROM workflow_start_proposal").get(),
    job: db.prepare("SELECT startup_key FROM workflow_start_job").get(), instances: db.prepare("SELECT id FROM instance").all() }));
  assert.equal(before.proposal?.state, "approved");
  assert.ok(before.job?.startup_key);
  assert.deepEqual(before.instances, []);
  await unlink(path.join(f.root, "docs/workflows/path-a.yaml"));
  handle.desktop.disposeProjectDocuments();
  releaseParent.resolve();
  assert.equal((await sent).ok, true);
  await handle.close();
  assert.deepEqual(businessDb(f, db => db.prepare("SELECT id FROM instance").all()), []);
  handle = await app(f, model, log);
  const started = await until("the same approved job starts only after reopen", async () => {
    const [row] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
    if (row?.instanceId && row.startup?.state === "scheduled") return row;
  }, model.errors);
  assert.equal(started.activationId, before.proposal?.activation_id);
  assert.equal(started.definition.source, "project");
  assert.equal(started.definition.digest, copied.digest);
  assert.equal(started.requestId, original.id);
  const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId: started.instanceId }));
  assert.equal(view.instance?.definitionDigest, copied.digest);
  assert.equal(view.instance?.definitionSource, "project");
  const after = businessDb(f, db => ({ jobs: db.prepare("SELECT startup_key FROM workflow_start_job").all(),
    instances: db.prepare("SELECT id,request_id FROM instance").all() }));
  assert.equal(after.jobs.length, 1);
  assert.deepEqual(after.instances.map(row => ({ ...row })), [{ id: started.instanceId, request_id: before.job.startup_key }]);
  log("approved-graph-resumed-after-deletion", { before, started, view, after });
});
