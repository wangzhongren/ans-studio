import assert from "node:assert/strict";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKFLOW_START_OPTION_IDS } from "../../../app/desktop/workflow-chief-start.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { readWorkflowLedger } from "../../../src/common/编排/workflow-state.ts";
import { app, businessDb, emptyFixture, fixture, git, modelFixture, resourceRoot, successful, target as trackedFile, until, unwrap, write, type Log } from "./fixture.ts";

const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to verified Windows bundle resources", timeout: 120_000 };
const [approve, reject] = WORKFLOW_START_OPTION_IDS;
const matchWindow = () => true;

test("ordinary Chief proposes preset A, and a trusted customer starts it only after the live turn settles", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const requirement = "Create an isolated local example with a new governed implementation";
  const releaseParent = Promise.withResolvers<void>();
  let instanceId: string | undefined;
  let choice: { definitionId: string; source: "preset"; expectedDigest: string; reason: string };
  const model = modelFixture(async turn => {
    if (turn.roleId === "chief" && turn.text === requirement) {
      assert.ok(turn.turnId);
      const catalog = await turn.call("project_state", { definitionId: "path-a" });
      assert.equal(catalog.ok, true, catalog.message);
      assert.ok(catalog.message?.includes(`preset | id=path-a | v1 | ${choice.expectedDigest}`), catalog.message);
      const receipt = await turn.call("request_workflow_start", choice);
      assert.equal(receipt.ok, true, receipt.message);
      const duplicate = await turn.call("request_workflow_start", choice);
      assert.deepEqual(duplicate, receipt);
      const conflict = await turn.call("request_workflow_start", { ...choice, reason: "An inconsistent proposal for the same input" });
      assert.equal(conflict.ok, false, conflict.message);
      log("live-chief-input-and-proposal", { ackTurn: turn.turnId, catalog, receipt, conflict });
      await releaseParent.promise;
    } else if (turn.roleId === "chief") {
      assert.ok(instanceId, turn.text);
      await successful(turn, "dispatch_task", { roleId: "convener", task: "Prepare the new product example after approval",
        flowId: "w5-chief-a", workflowId: instanceId, taskKind: "stage-request", workflowPath: "A", stage: "A1",
        workflowAction: "advance", sideEffect: "read-only" });
    }
  }, log);
  const handle = await app(f, model, log);
  t.after(() => { releaseParent.resolve(); return handle.close(); });
  const project = { projectRoot: f.root };
  const target = { ...project, roleId: "chief", runtime: "pi" as const };
  const definition = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-a", source: "preset" }));
  assert.ok(definition.digest);
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
  assert.deepEqual(raw.jobs, []);
  assert.deepEqual(raw.instances, []);
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
  const first = await until("valid A1 dispatch after approval", async () => (await readTaskState(f.root)).events.find(event =>
    event.kind === "task.created" && event.workflowId === instanceId && event.stage === "A1"), model.errors);
  const projection = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId }));
  assert.equal(projection.instance?.definitionDigest, definition.digest);
  assert.equal(projection.controlPlane.state, "ready");
  assert.equal(businessDb(f, db => db.prepare("SELECT id FROM instance").all()).length, 1);
  log("real-first-action-after-customer-approval", { started, first, projection });
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
    for (const [workflowPath, stage] of [["A", "A1"], ["B", "B1"]]) {
      const legacy = await turn.call("dispatch_task", { roleId: "convener", task: `Attempt the old ${stage} shortcut`,
        flowId: "w5-old-shortcut", workflowId: "forged-workflow-id", workflowPath, stage, taskKind: "stage-request",
        workflowAction: "advance", sideEffect: "read-only" });
      assert.equal(legacy.ok, false);
      assert.match(legacy.message ?? "", /workflow-start-confirmation-required/);
    }
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
