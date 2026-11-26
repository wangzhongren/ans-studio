import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { WORKFLOW_START_OPTION_IDS } from "../../../app/desktop/workflow-chief-start.ts";
import { app, businessDb, decideBounded, emptyFixture, modelFixture, resourceRoot, until, unwrap, write, type Log, type ModelTurn } from "./fixture.ts";

const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to verified Windows bundle resources", timeout: 120_000 };

for (const restart of [false, true]) test(`Native delegated workflow-start ${restart ? "pending restart" : "first presentation"}`, native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const rounds: string[] = [];
  const model = modelFixture(async turn => {
    if (!turn.chiefDecisionContext) return;
    assert.equal(turn.chiefDecisionContext.request.cardKind, "workflow-start");
    rounds.push(turn.chiefDecisionContext.request.requestId);
    const result = await decideBounded(turn, [WORKFLOW_START_OPTION_IDS[0]], log);
    assert.equal(result.ok, true, result.message);
    const duplicate = await decideBounded(turn, [WORKFLOW_START_OPTION_IDS[1]], log);
    assert.equal(duplicate.ok, false, duplicate.message);
  }, log);
  let handle = await app(f, model, log);
  t.after(() => handle.close());
  const project = { projectRoot: f.root };
  if (!restart) assert.equal((await handle.desktop.setDecisionJudgeEnabled({ enabled: true })).enabled, true);
  const proposal = unwrap(await handle.proposeViaChief({ ...project, definitionId: "path-a", source: "preset",
    summary: "Start one governed local threshold example from the fixed workflow." }));
  if (restart) {
    const original = await until("customer card without delegation", async () => handle.cards.get(proposal.requestId), model.errors);
    assert.equal(original.request.application, true);
    assert.equal(rounds.length, 0);
    assert.deepEqual(businessDb(f, db => db.prepare("SELECT id FROM instance").all()), []);
    await handle.close();
    handle = await app(f, model, log, { initialJudgeSwitches: { decision: true, approval: false } });
  }
  assert.equal(handle.desktop.getDecisionJudgeState().enabled, true);
  assert.equal(handle.desktop.getShellJudgeState().enabled, false);
  const approved = await until("delegated startup creates the real instance", async () => {
    const row = unwrap(await handle.desktop.listWorkflowStartProposals(project)).find(item => item.activationId === proposal.activationId);
    if (row?.instanceId) return row;
  }, model.errors);
  assert.equal(approved.requestId, proposal.requestId);
  assert.equal(approved.state, "started");
  assert.deepEqual(rounds, [proposal.requestId]);
  const rows = businessDb(f, db => ({ instance: db.prepare("SELECT id FROM instance").all(),
    proposals: db.prepare("SELECT * FROM workflow_start_proposal").all(), jobs: db.prepare("SELECT * FROM workflow_start_job").all() }));
  assert.equal(rows.instance.length, 1);
  assert.equal(rows.jobs.length, 1);
  assert.equal(rows.proposals.length, 1);
  assert.match(String(rows.proposals[0].data), /"source":"delegated-chief"/);
  log("persisted-delegated-startup", { proposal, approved, rows });
  await handle.close();
  handle = await app(f, model, log, { initialJudgeSwitches: { decision: true, approval: false } });
  const [settled] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
  assert.equal(settled.activationId, proposal.activationId);
  assert.equal(settled.instanceId, approved.instanceId);
  assert.deepEqual(rounds, [proposal.requestId]);
  assert.deepEqual(businessDb(f, db => db.prepare("SELECT id FROM instance").all()), rows.instance);
  assert.equal(handle.cards.has(proposal.requestId), false);
  log("settled-delegated-startup-reopened", { settled, rounds });
});

test("Native application command approval alone leaves workflow-start to a trusted customer", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const model = modelFixture(async turn => assert.fail(`unexpected delegated turn: ${turn.text}`), log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  assert.equal((await handle.desktop.setShellJudgeEnabled({ enabled: true })).enabled, true);
  assert.equal(handle.desktop.getDecisionJudgeState().enabled, false);
  const project = { projectRoot: f.root };
  const proposal = unwrap(await handle.proposeViaChief({ ...project, definitionId: "path-a", source: "preset",
    summary: "Leave this workflow choice for the actual customer input channel." }));
  const card = await until("workflow choice reserved for the trusted customer", async () => handle.cards.get(proposal.requestId), model.errors);
  const untrusted = await handle.respond(card.id, WORKFLOW_START_OPTION_IDS[0], () => false);
  assert.equal(untrusted.ok, false);
  const rejected = await handle.respond(card.id, WORKFLOW_START_OPTION_IDS[1], () => true);
  assert.equal(rejected.ok, true);
  const [row] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
  assert.equal(row.state, "rejected");
  const raw = businessDb(f, db => ({ proposals: db.prepare("SELECT * FROM workflow_start_proposal").all(),
    instances: db.prepare("SELECT * FROM instance").all(), jobs: db.prepare("SELECT * FROM workflow_start_job").all() }));
  assert.match(String(raw.proposals[0]?.data), /"source":"customer"/);
  assert.equal(raw.instances.length, 0);
  assert.equal(raw.jobs.length, 0);
  assert.deepEqual(model.errors, []);
  log("application-command-switch-only", { row, untrusted, rejected, raw });
});

test("Native workflow-start revokes the decision generation and refuses a late tool reply", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const entered = Promise.withResolvers<ModelTurn>();
  const reenabled = Promise.withResolvers<ModelTurn>();
  const finishNewTurn = Promise.withResolvers<void>();
  const submitLate = Promise.withResolvers<void>();
  const result = Promise.withResolvers<Awaited<ReturnType<ModelTurn["call"]>>>();
  let rounds = 0;
  const model = modelFixture(async turn => {
    assert.equal(turn.chiefDecisionContext?.request.cardKind, "workflow-start");
    rounds += 1;
    if (rounds === 2) {
      reenabled.resolve(turn);
      await finishNewTurn.promise;
      return;
    }
    assert.equal(rounds, 1);
    entered.resolve(turn);
    await submitLate.promise;
    result.resolve(await decideBounded(turn, [WORKFLOW_START_OPTION_IDS[0]], log));
  }, log);
  const handle = await app(f, model, log, { initialJudgeSwitches: { decision: true, approval: true } });
  t.after(() => { submitLate.resolve(); finishNewTurn.resolve(); return handle.close(); });
  const project = { projectRoot: f.root };
  const proposal = unwrap(await handle.proposeViaChief({ ...project, definitionId: "path-a", source: "preset",
    summary: "Wait while the customer takes responsibility for this workflow choice." }));
  const original = await entered.promise;
  assert.equal(original.chiefDecisionContext?.request.requestId, proposal.requestId);
  assert.equal((await handle.desktop.setDecisionJudgeEnabled({ enabled: false })).enabled, false);
  assert.equal(handle.desktop.getShellJudgeState().enabled, true);
  const fallback = await until("original actionable card with a revocation reason", async () => handle.cards.get(proposal.requestId), model.errors);
  assert.ok(fallback.judgeNotice?.trim());
  assert.equal((await handle.desktop.setDecisionJudgeEnabled({ enabled: true })).enabled, true);
  const current = await reenabled.promise;
  assert.equal(current.chiefDecisionContext?.request.requestId, original.chiefDecisionContext?.request.requestId);
  assert.notEqual(current.chiefDecisionContext?.request.delegationRevision, original.chiefDecisionContext?.request.delegationRevision);
  submitLate.resolve();
  const late = await result.promise;
  assert.equal(late.ok, false, late.message);
  const before = businessDb(f, db => db.prepare("SELECT * FROM workflow_start_job").all());
  assert.deepEqual(before, []);
  assert.equal((await handle.desktop.setDecisionJudgeEnabled({ enabled: false })).enabled, false);
  finishNewTurn.resolve();
  assert.equal((await handle.respond(fallback.id, WORKFLOW_START_OPTION_IDS[1], () => true)).ok, true);
  assert.equal((await handle.respond(fallback.id, WORKFLOW_START_OPTION_IDS[0], () => true)).ok, false);
  const [row] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
  assert.equal(row.state, "rejected");
  log("revoked-decision-personal-fallback", { proposal, fallback, late, before, row });
});

test("Native workflow-start refuses a decision after the actual project YAML changes", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const entered = Promise.withResolvers<void>();
  const submit = Promise.withResolvers<void>();
  const result = Promise.withResolvers<Awaited<ReturnType<ModelTurn["call"]>>>();
  const model = modelFixture(async turn => {
    assert.equal(turn.chiefDecisionContext?.request.cardKind, "workflow-start");
    entered.resolve();
    await submit.promise;
    result.resolve(await decideBounded(turn, [WORKFLOW_START_OPTION_IDS[0]], log));
  }, log);
  const handle = await app(f, model, log, { initialJudgeSwitches: { decision: true, approval: false } });
  t.after(() => { submit.resolve(); return handle.close(); });
  const project = { projectRoot: f.root, definitionId: "path-a" };
  const selected = unwrap(await handle.desktop.copyDurableWorkflowPreset(project));
  const original = unwrap(await handle.proposeViaChief({ ...project, source: "project", expectedDigest: selected.digest,
    summary: "Keep the selected project workflow definition fixed for this decision." }));
  await entered.promise;
  const relative = "docs/workflows/path-a.yaml";
  const previous = await readFile(path.join(f.root, relative), "utf8");
  const changed = previous.replace(/^version: (\d+)/m, (_, version: string) => `version: ${Number(version) + 1}`);
  assert.notEqual(changed, previous);
  await write(f.root, relative, changed);
  submit.resolve();
  const stale = await result.promise;
  assert.equal(stale.ok, false, stale.message);
  const newDefinition = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, source: "project" }));
  assert.notEqual(newDefinition.digest, selected.digest);
  const [row] = unwrap(await handle.desktop.listWorkflowStartProposals(project));
  assert.equal(row.activationId, original.activationId);
  assert.equal(row.state, "stale");
  assert.deepEqual(businessDb(f, db => db.prepare("SELECT id FROM instance").all()), []);
  assert.deepEqual(businessDb(f, db => db.prepare("SELECT * FROM workflow_start_job").all()), []);
  log("workflow-start-definition-movement-refused", { original, selected, newDefinition, stale, row });
});
