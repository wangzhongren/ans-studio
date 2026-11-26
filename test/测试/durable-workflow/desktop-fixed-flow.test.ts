import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { DEFAULT_EVIDENCE_COLLECTOR } from "../../../src/model/durable-workflow.ts";
import { analysis, app, businessDb, daprdListener, emptyFixture, fix, fixture, git, modelFixture, operatorReport,
  resourceRoot, sqliteSnapshot, successful, target, until, unwrap, write, type Log } from "./fixture.ts";

const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to verified native Windows Dapr assets", timeout: 180_000 };

test("Native A12a annotated handback binds the actual successful write and original task to delivery", {
  skip: !process.env.ANS_F6_A12A_COMPLETED_NATIVE_LOG && "Set ANS_F6_A12A_COMPLETED_NATIVE_LOG to the completed annotated native full-chain output",
}, async t => {
  const raw = await readFile(process.env.ANS_F6_A12A_COMPLETED_NATIVE_LOG!, "utf8");
  const events = raw.split(/\r?\n/).flatMap(line => {
    const start = line.indexOf('{"at":');
    if (start === -1) return [];
    try { return [JSON.parse(line.slice(start))]; } catch { return []; }
  });
  const input = events.find(row => row.event === "empty-project-input")?.value;
  const done = events.find(row => row.event === "path-a-delivery")?.value;
  assert.ok(input?.root && input.userDataRoot && done?.done?.instanceId, "The actual Windows Dapr full chain must complete first");
  assert.equal(done.done.status, "delivered");
  const instanceId = String(done.done.instanceId);
  const proof = businessDb(input, db => {
    const stored = db.prepare("SELECT data FROM instance WHERE id = ?").get(instanceId);
    assert.ok(stored);
    const instance = JSON.parse(String(stored.data));
    const standard = instance.graph.tasks.find((task: { capability: string }) => task.capability === "independent-standard");
    assert.ok(standard?.report?.evidence?.sha256);
    const envelopeRow = db.prepare("SELECT content FROM evidence WHERE instance_id = ? AND digest = ?")
      .get(instanceId, standard.report.evidence.sha256);
    assert.ok(envelopeRow?.content instanceof Uint8Array);
    const envelope = JSON.parse(Buffer.from(envelopeRow.content).toString("utf8"));
    const effects = db.prepare("SELECT state,data FROM effect WHERE instance_id = ?").all(instanceId)
      .map(row => ({ state: row.state, ...JSON.parse(String(row.data)) }));
    const facts = db.prepare("SELECT state,data FROM fact WHERE instance_id = ?").all(instanceId)
      .map(row => ({ state: row.state, ...JSON.parse(String(row.data)) }));
    return { standard, envelope, effects, facts };
  });
  const standard = proof.standard;
  assert.equal(standard.state, "accepted");
  assert.equal(standard.outcome, "accepted");
  const prefix = `docs/quality/${standard.flowId}-criteria-v`;
  const artifact = proof.envelope.artifacts?.find((ref: { path: string }) => ref.path.startsWith(prefix));
  assert.ok(artifact);
  const bytes = await readFile(path.join(input.root, artifact.path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  assert.equal(proof.envelope.report.taskId, standard.taskId);
  assert.equal(proof.envelope.report.source.roleId, standard.roleId);
  assert.equal(proof.envelope.report.status, "completed");
  const calls = events.filter(row => row.event === "tool-result" && row.value.roleId === standard.roleId
    && row.value.turnId === proof.envelope.report.source.turnId).map(row => row.value);
  const writeIndex = calls.findIndex(call => call.name === "write_file" && call.args.path === artifact.path && call.result.ok);
  const readIndex = calls.findIndex(call => call.name === "read_file" && call.args.path === artifact.path && call.result.ok);
  const reportIndex = calls.findIndex(call => call.name === "submit_report" && call.args.status === "completed" && call.result.ok);
  assert.ok(writeIndex >= 0 && readIndex > writeIndex && reportIndex > readIndex,
    "The actual verifier tools must write and read the canonical standard before the annotated report");
  const evidence = proof.envelope.handback.evidence as string[];
  assert.equal(evidence.length, 2);
  assert.ok(evidence.some(text => text.startsWith("标准文件：") && text.includes(artifact.path) && text.includes("（")));
  assert.ok(evidence.some(text => !text.includes(artifact.path)), "The original free-text note must also survive");
  assert.equal(evidence.includes(artifact.path), false, "This regression must use the real annotated path shape");
  const writes = proof.effects.filter((record: { state: string; intent: { kind: string; task?: { taskId: string }; expected?: { paths?: string[] } } }) =>
    record.state === "succeeded" && record.intent.kind === "task-write" && record.intent.task?.taskId === standard.taskId
      && record.intent.expected?.paths?.includes(artifact.path));
  assert.equal(writes.length, 1);
  const write = writes[0];
  assert.deepEqual(write.intent.task, standard.task);
  assert.equal(write.intent.stepId, standard.stepId);
  assert.equal(write.intent.attempt, standard.attempt);
  assert.equal(write.intent.expected.contentSha256, artifact.sha256);
  assert.equal(write.result.key, write.intent.key);
  assert.equal(write.result.token, write.token);
  assert.equal(write.result.outcome, "succeeded");
  const model = proof.effects.find((record: { intent: { key: string } }) => record.intent.key === `model:${standard.taskId}`);
  assert.equal(model?.state, "succeeded");
  assert.equal(model.result.result.turnId, proof.envelope.report.source.turnId);
  const closures = proof.facts.filter((row: { state: string; fact: { event?: { input?: { kind?: string; task?: { taskId: string } } } } }) =>
    row.state === "consumed" && row.fact.event?.input?.kind === "task-closed" && row.fact.event.input.task?.taskId === standard.taskId);
  assert.equal(closures.length, 1);
  assert.equal(closures[0].fact.event.input.outcome, "accepted");
  assert.deepEqual(closures[0].fact.event.input.documents, [artifact]);
  const taskState = await readTaskState(input.root);
  assert.equal(taskState.records.get(standard.taskId)?.reports.length, 1);
  const implementations = [...taskState.records.values()].filter(record => record.created?.workflowId === instanceId && record.created.stage === "A11");
  assert.equal(implementations.filter(record => record.created?.to === "worker").length, 1);
  t.diagnostic(JSON.stringify({ event: "f6-r5-native-a12a-canonical-receipt-audit", instanceId, taskId: standard.taskId,
    turnId: proof.envelope.report.source.turnId, artifact, originalEvidence: evidence, writeKey: write.intent.key,
    stepId: standard.stepId, attempt: standard.attempt, finalStatus: done.done.status }));
});

for (const mode of ["busy-preset", "offline-import-reopen"] as const) {
  test(`Native fixed workflow queues one real A4 operation under concurrent observations: ${mode}`, native, async t => {
    const f = await emptyFixture();
    const project = { projectRoot: f.root };
    const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
    const imported = mode === "offline-import-reopen";
    const definitionId = imported ? "fixed-flow-observation-example" : "path-a";
    const expectedStep = imported ? "inspect-proposal-input" : "prepare-planning";
    const hold = Promise.withResolvers<void>();
    const stage5 = Promise.withResolvers<void>();
    const delivered: { taskId: string; stage: string; turnId: string }[] = [];
    let instanceId = "";
    let chosen: string | null = null;
    let handle: Awaited<ReturnType<typeof app>>;
    const model = modelFixture(async turn => {
      if (turn.roleId === "chief") {
        assert.equal(turn.toolNames.includes("dispatch_task"), false);
        assert.equal(turn.toolNames.includes("redispatch_task"), false);
        const phase = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId })).instance;
        assert.ok(phase?.flowId);
        assert.equal(phase.action, "confirm-intent");
        const intentId = `${phase.flowId}-intent`;
        await successful(turn, "write_file", { path: `docs/intents/${intentId}.md`,
          content: `---\nflowId: ${phase.flowId}\nintentId: ${intentId}\ngoal: Local example\n---\n# Intent\n` });
        await turn.call("request_choice", { title: "Approve the fixed-flow intent", question: "Confirm the governed local example?",
          cardKind: "intent-confirm", flowId: phase.flowId, intentId,
          options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] });
        return;
      }
      const taskId = /任务编号：#([a-z0-9-]+)/.exec(turn.text)?.[1];
      assert.ok(taskId && turn.turnId, turn.text);
      const task = (await readTaskState(f.root)).records.get(taskId)?.created;
      assert.ok(task?.flowId && task.stage, turn.text);
      assert.equal(task.workflowId, instanceId);
      if (task.stage === "A4" || task.stage === "A5") {
        assert.equal(turn.roleId, "rapporteur");
        assert.equal(turn.toolNames.includes("dispatch_task"), false);
        delivered.push({ taskId, stage: task.stage, turnId: turn.turnId });
        if (task.stage === "A5") {
          await stage5.promise;
          return;
        }
        if (!imported) await hold.promise;
      } else {
        assert.equal(turn.roleId, "product");
        if (task.stage === "A2") {
          await successful(turn, "write_file", { path: `docs/product/${task.flowId}-intent-v1.md`,
            content: `---\nschema: project-intent/v1\nflowId: ${task.flowId}\nintentId: ${task.flowId}-intent\nversion: 1\ngoal: Local example\nstatus: draft\n---\n# Scope\nCreate one local example.\n` });
        }
      }
      await successful(turn, "submit_report", { status: "completed", summary: `${task.stage} original workflow task is complete.` });
    }, log);
    handle = await app(f, model, log, { pickWorkflowDefinition: async () => chosen });
    t.after(() => { hold.resolve(); stage5.resolve(); return handle.close(); });
    let definition;
    if (imported) {
      const original = await readFile(new URL("../../../docs/workflows/path-a.yaml", import.meta.url), "utf8");
      const variant = original.replace("id: path-a", `id: ${definitionId}`).replaceAll("prepare-planning", expectedStep)
        .replace("action: planning-prepare\n    role: rapporteur\n    next: write-proposal\n    onFailure: blocked",
          "action: planning-prepare\n    role: rapporteur\n    next: write-proposal\n    onFailure: preparation-blocked")
          + "  preparation-blocked: { terminal: blocked }\n";
      await write(f.directory, "imported.yaml", variant);
      chosen = path.join(f.directory, "imported.yaml");
      definition = unwrap(await handle.desktop.importDurableWorkflow(project));
    } else {
      definition = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId, source: "preset" }));
    }
    assert.equal(definition.version, 7);
    const started = unwrap(await handle.startViaChief({ ...project, definitionId, source: imported ? "project" : "preset",
      expectedDigest: definition.digest, summary: "Create a governed local example and prepare a proposal" }));
    assert.ok(started.instance);
    instanceId = started.instance.instanceId;
    const card = await until("actual A3 card", async () => [...handle.cards.values()].find(card => card.request.cardKind === "intent-confirm"), model.errors);
    if (imported) handle.simulateNetwork(false);
    assert.equal((await handle.respond(card.id, "confirm", () => true)).ok, true);
    const task = await until("Dapr creates its A4 report-writer task", async () => {
      const phase = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId })).instance;
      return phase?.stepId === expectedStep ? phase.pendingTasks?.find(item => item.stepId === expectedStep) : undefined;
    }, model.errors);
    assert.equal(task.roleId, "rapporteur");
    if (!imported) await until("the genuine A4 role is busy in the original delivered turn", async () => delivered.find(item => item.stage === "A4"), model.errors);
    for (let pass = 0; pass < 3; pass++) {
      await Promise.all(Array.from({ length: 16 }, () => handle.observeNow(instanceId)));
      const queue = handle.roleStates.filter(state => state.roleId === "rapporteur").at(-1)?.queue ?? [];
      const matching = queue.filter(item => item.full.includes(task.taskId)).length;
      assert.ok(imported ? matching === 1 : matching <= 1, JSON.stringify(queue));
    }
    const seenIds = new Set(handle.roleStates.filter(state => state.roleId === "rapporteur")
      .flatMap(state => state.queue.filter(item => item.full.includes(task.taskId)).map(item => item.id)));
    assert.equal(seenIds.size, 1);
    assert.equal(delivered.length, imported ? 0 : 1);
    const before = sqliteSnapshot(f, instanceId);
    assert.equal(before.effect?.filter(row => row.business_key === `model:${task.taskId}` && row.state !== "not-started").length, imported ? 0 : 1);
    const created = (await readTaskState(f.root)).events.filter(row => row.kind === "task.created" && row.taskId === task.taskId);
    assert.equal(created.length, 1);
    const savedQueue = JSON.parse(await readFile(path.join(f.directory, "delivery-queue.json"), "utf8"));
    assert.equal(JSON.stringify(savedQueue).includes(task.taskId), false, "Durable queue items must recover from SQLite");
    log("f6-real-producer-concurrent-busy", { mode, task, rounds: 3, concurrentObservers: 16, seenIds: [...seenIds], before, savedQueue });
    if (imported) {
      const previous = await daprdListener(f);
      assert.ok(previous);
      await handle.close();
      handle = await app(f, model, log, { pickWorkflowDefinition: async () => chosen });
      const next = await until("sidecar restarts for original A4 task", () => daprdListener(f), model.errors);
      assert.notEqual(next.pid, previous.pid);
      log("f6-original-pending-operation-reopened", { taskId: task.taskId, previous, next });
    } else hold.resolve();
    const next = await until("A4 sends once and completes to its YAML successor", async () => delivered.find(item => item.stage === "A5"), model.errors);
    assert.equal(delivered.filter(item => item.stage === "A4").length, 1);
    assert.equal(delivered.find(item => item.stage === "A4")?.taskId, task.taskId);
    await Promise.all(Array.from({ length: 16 }, () => handle.observeNow(instanceId)));
    assert.equal(delivered.filter(item => item.stage === "A4").length, 1);
    const after = sqliteSnapshot(f, instanceId);
    assert.equal(after.effect?.filter(row => row.business_key === `model:${task.taskId}` && row.state === "succeeded").length, 1);
    assert.equal((await readTaskState(f.root)).records.get(task.taskId)?.reports.length, 1);
    log("f6-original-operation-delivered-once", { mode, task, delivered, next, after });
  });
}

for (const mode of ["preset-merge", "renamed-import-reject", "evidence-approved", "evidence-unapproved"] as const) {
  const evidence = mode === "evidence-approved" || mode === "evidence-unapproved";
  const evidenceApproved = mode === "evidence-approved";
  const testName = evidence ? `R20 native B2 evidence scope: ${mode}`
    : `Native fixed workflow B qualifies and dispatches real roles without Chief scheduling: ${mode}`;
  test(testName, native, async t => {
    const f = await fixture({ installLegacyPathB: false, existingIndependentRoster: true, evidenceCollector: evidenceApproved });
    const project = { projectRoot: f.root };
    const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
    const imported = mode === "renamed-import-reject";
    const definitionId = imported ? "fixed-existing-file-review" : "path-b";
    let chosen: string | null = null;
    let instanceId = "";
    let handle: Awaited<ReturnType<typeof app>>;
    const turns: { roleId: string; stage: string; taskId: string }[] = [];
    const requirement = JSON.stringify({ kind: "b2-evidence-requirement", requirementId: "B-AC-1",
      reason: "Read the actual changed threshold at the approved source of the current candidate.", source: "candidate-file", paths: [target] });
    const model = modelFixture(async turn => {
      if (!(evidence && turn.roleId === "convener")) assert.equal(turn.toolNames.includes("dispatch_task"), false, `Unexpected fixed dispatch tool in ${turn.roleId}`);
      assert.equal(turn.toolNames.includes("redispatch_task"), false);
      const state = await readTaskState(f.root);
      const quoted = /(?:任务编号：|任务：|原取证任务 )#([a-z0-9-]+)/.exec(turn.text)?.[1];
      const selectedTask = quoted && state.records.get(quoted)?.created;
      const actualParent = typeof selectedTask !== "string" && selectedTask?.to === DEFAULT_EVIDENCE_COLLECTOR
        && turn.roleId === "convener" ? selectedTask.parentTaskRef?.taskId : undefined;
      const taskId = actualParent ?? quoted;
      assert.ok(taskId, turn.text);
      const task = state.records.get(taskId)?.created;
      assert.ok(task?.stage && task.workflowId, turn.text);
      assert.equal(task.workflowId, instanceId);
      turns.push({ roleId: turn.roleId, stage: task.stage, taskId });
      if (turn.roleId === DEFAULT_EVIDENCE_COLLECTOR) {
        assert.ok(evidenceApproved && task.stage === "B3");
        const view = await handle.durable.find(f.root, instanceId);
        const workOrder = view?.pendingTasks?.find(item => item.taskId === taskId)?.evidenceWorkOrder;
        assert.ok(workOrder);
        assert.equal(workOrder.basis.candidateOid, git(f.root, "rev-parse", "HEAD"));
        assert.deepEqual(workOrder.requirementIds, ["B-AC-1"]);
        assert.ok(workOrder.writePaths.every(file => file.startsWith("docs/verification/")));
        await successful(turn, "read_file", { path: target });
        const invalid = await turn.call("write_file", { path: target, content: "outside B2 evidence authority" });
        assert.equal(invalid.ok, false, JSON.stringify(invalid));
        await successful(turn, "submit_report", { status: "completed", summary: "Current candidate file collected within B2 scope.",
          evidence: [JSON.stringify({ requirementId: "B-AC-1", path: target, source: "candidate-file" })] });
        log("r20-b3-collector-current-candidate", { workOrder, invalid });
        return;
      }
      if (turn.roleId === "worker" && task.stage === "B1") {
        await successful(turn, "read_file", { path: target });
        const forbidden = await turn.call("write_file", { path: target, content: "forbidden read-only mutation" });
        assert.equal(forbidden.ok, false);
        assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
        await successful(turn, "submit_report", { status: "completed", summary: `The tracked file ${target} needs a bounded threshold change.`, evidence: [analysis, ...(evidence ? [requirement] : [])] });
      } else if (turn.roleId === "worker" && task.stage === "B3") {
        await successful(turn, "write_file", { path: target, content: fix });
        const outside = await turn.call("write_file", { path: "src/outside.txt", content: "forbidden" });
        assert.equal(outside.ok, false);
        await successful(turn, "run_shell", { command: `git add ${target}` });
        await successful(turn, "run_shell", { command: 'git commit -m "F6 workflow assigned threshold change"' });
        await successful(turn, "submit_report", { status: "completed", summary: "Only the accepted source scope changed in the actual commit.", evidence: [target] });
      } else if (turn.roleId === "convener") {
        const source = [...state.records.values()].find(record => record.created?.to === "worker" && record.created.stage === task.stage);
        assert.ok(source, turn.text);
        log("f6-fixed-b-original-report-ledgers", { operator: task, source, sqlite: sqliteSnapshot(f, instanceId) });
        assert.equal(source.reports.length, 1, "The actual SQLite report must be mirrored once to the original task journal");
        if (!source.closed) await successful(turn, "close_created_task", { operationId: `f6-review-${source.taskId}`, taskId: source.taskId, outcome: "accepted" });
        if (evidence && task.stage === "B3") {
          const view = await handle.durable.find(f.root, instanceId);
          const audit = view?.evidenceAudit;
          if (evidenceApproved) {
            assert.ok(view && audit);
            const collection = view.pendingTasks?.find(item => item.taskId === audit.collector?.taskId);
            if (!collection) {
              await successful(turn, "dispatch_task", { roleId: DEFAULT_EVIDENCE_COLLECTOR, moduleId: "acceptance-evidence",
                task: "Collect the original approved B2 source evidence.", stage: "B3", sideEffect: "read-only", idempotencyKey: "r20-b3-collect" });
              return;
            }
            if (collection.state === "reported" && audit.state !== "ready") {
              await successful(turn, "close_created_task", { operationId: "r20-b3-collector-close", taskId: collection.taskId, outcome: "accepted" });
              return;
            }
            if (audit.state !== "ready") return;
            log("r20-b3-collection-ready-before-original-close", { audit, collection, source });
          } else {
            await successful(turn, "submit_report", { status: "blocked", summary: "B-AC-1 remains missing from the current B2 scope. There is no authorised collection owner.",
              evidence: [operatorReport] });
            return;
          }
        }
        await successful(turn, "submit_report", { status: "completed", summary: `Operations verified actual ${task.stage} evidence.`,
          evidence: [task.stage === "B1" ? analysis : operatorReport] });
      } else assert.fail(`Unexpected workflow role ${turn.roleId} for ${task.stage}`);
    }, log);
    handle = await app(f, model, log, { pickWorkflowDefinition: async () => chosen });
    t.after(() => handle.close());
    let selected;
    if (imported) {
      const yaml = await readFile(new URL("../../../docs/workflows/path-b.yaml", import.meta.url), "utf8");
      const custom = yaml.replace("id: path-b", `id: ${definitionId}`).replace(/^  impact:$/m, "  inspect-affected-file:")
        .replace("next: impact", "next: inspect-affected-file")
        .replace("rejected: stopped", "rejected: blocked").replace("  stopped: { terminal: stopped }\n", "");
      await write(f.directory, "custom-b.yaml", custom);
      chosen = path.join(f.directory, "custom-b.yaml");
      selected = unwrap(await handle.desktop.importDurableWorkflow(project));
    } else selected = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId, source: "preset" }));
    assert.equal(selected.version, 3);
    const started = unwrap(await handle.startViaChief({ ...project, definitionId, source: imported ? "project" : "preset",
      expectedDigest: selected.digest, summary: `Change the existing threshold in ${target} from 1 to 2 within its current module.` }));
    assert.ok(started.instance);
    instanceId = started.instance.instanceId;
    if (evidenceApproved) {
      const pending = await until("the application B2 evidence approval card", async () =>
        [...handle.cards.values()].find(card => card.request.title === "确认 B2 的验收取证范围"), model.errors);
      assert.equal(pending.request.kind, "choice");
      assert.deepEqual(pending.request.options.map(option => option.id).sort(), ["route", "wait"]);
      assert.match(pending.request.preview ?? "", /B-AC-1/);
      assert.equal((await handle.respond(pending.id, "route", () => false)).ok, false);
      const selected = await handle.respond(pending.id, "route", () => true);
      assert.equal(selected.ok, true, JSON.stringify(selected));
      log("r20-b2-extra-evidence-customer-approval", { pending, selected, rows: sqliteSnapshot(f, instanceId) });
    }
    if (mode === "evidence-unapproved") {
      const blocked = await until("frozen B3 hard evidence blocker", async () => {
        await handle.observeNow(instanceId);
        const view = await handle.durable.find(f.root, instanceId);
        const card = [...handle.cards.values()].find(item => item.request.cardKind === "workflow-blocked-scope");
        if (view?.action === "b3-implement-and-accept" && card) return { view, card };
      }, model.errors).catch(async error => {
        log("r20-b3-hard-block-routing-diagnostics", { view: await handle.durable.find(f.root, instanceId),
          cards: [...handle.cards.values()].map(card => [card.id, card.request.title]), rows: sqliteSnapshot(f, instanceId) });
        throw error;
      });
      assert.equal(blocked.card.request.kind, "choice");
      assert.ok(blocked.card.request.options.some(option => option.id === "wait"));
      assert.equal(blocked.card.request.options.some(option => option.id === "stop"), false);
      assert.equal((await handle.respond(blocked.card.id, "stop", () => true)).ok, false);
      const scope = blocked.view.blockedRouting;
      assert.ok(scope);
      const store = await handle.durable.store();
      const direct = await store.decideBlockedScopeChange(blocked.view.ref, {
        ...scope.binding, option: "stop", provenance: { source: "customer" },
      }, () => true);
      const delegated = await store.decideBlockedScopeChange(blocked.view.ref, {
        ...scope.binding, option: "stop",
        provenance: { ...scope.binding, source: "delegated-chief", delegationRevision: 1, reason: "Exercise the frozen B3 option boundary." },
      }, () => true);
      assert.equal(direct.ok, false);
      assert.equal(delegated.ok, false);
      const before = await daprdListener(f);
      await handle.close();
      handle = await app(f, model, log);
      unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId }));
      const restored = await until("same waiting B3 card after desktop reopen", async () => {
        await handle.observeNow(instanceId);
        return handle.cards.get(blocked.card.id);
      }, model.errors);
      assert.deepEqual(restored.request, blocked.card.request);
      assert.notEqual((await daprdListener(f))?.pid, before?.pid);
      const view = await handle.durable.find(f.root, instanceId);
      assert.equal(view?.stepId, blocked.view.stepId);
      assert.equal(view?.action, "b3-implement-and-accept");
      assert.equal(view?.status, "waiting");
      assert.equal((await handle.respond(restored.id, "stop", () => true)).ok, false);
      const rows = sqliteSnapshot(f, instanceId);
      assert.equal(rows.effect?.some(row => String(row.business_key).startsWith("release-merge:")), false);
      assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
      assert.equal(rows.fact?.some(row => String(row.business_key) === `blocked-scope-decided:${scope.binding.requestId}`), false);
      log("r20-b3-no-frozen-stop-or-publish-and-original-card-resumed", { blocked, restored, view, direct, delegated, rows });
      return;
    }
    const card = await until("actual B4 merge decision from the workflow", async () => [...handle.cards.values()].find(card => card.request.cardKind === "merge-main"), model.errors);
    const phase = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId })).instance;
    assert.ok(phase?.scopeDecision);
    assert.deepEqual(phase.scopeDecision.candidates, [target]);
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    if (evidenceApproved) {
      assert.equal(turns.filter(turn => turn.roleId === DEFAULT_EVIDENCE_COLLECTOR && turn.stage === "B3").length, 1);
      assert.equal(turns.filter(turn => turn.roleId === "worker" && turn.stage === "B3").length, 1);
      assert.equal(turns.some(turn => turn.stage === "A12b"), false);
    } else assert.deepEqual(turns.map(turn => [turn.roleId, turn.stage]), [["worker", "B1"], ["convener", "B1"], ["worker", "B3"], ["convener", "B3"]]);
    const operatorChoice = MERGE_MAIN_OPTION_IDS[imported ? 1 : 0];
    assert.equal((await handle.respond(card.id, operatorChoice, () => true)).ok, true);
    const done = await until("the frozen merge edge is applied", async () => {
      const current = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...project, instanceId })).instance;
      if (current?.status === (imported ? "blocked" : "delivered")) return current;
    }, model.errors);
    if (imported) {
      assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
      assert.equal(done.delivery, undefined);
    } else {
      assert.notEqual(git(f.root, "rev-parse", "main"), f.baselineOid);
      assert.equal(done.delivery?.state, "pending");
      assert.ok(done.delivery?.id);
      const selection = { ...project, instanceId, deliveryId: done.delivery.id };
      const detail = unwrap(await handle.desktop.readDurableWorkflowDelivery(selection));
      assert.equal(detail.delivery.state, "pending");
      assert.equal(unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...selection, viewToken: detail.viewToken })).state, "delivered");
    }
    const rows = sqliteSnapshot(f, instanceId);
    assert.equal(rows.scope_decision?.length, 1);
    assert.equal(rows.effect?.filter(row => String(row.business_key).startsWith("release-merge:")).length, imported ? 0 : 1);
    log("f6-fixed-b-final", { mode, definition: selected, turns, done, rows });
  });
}
