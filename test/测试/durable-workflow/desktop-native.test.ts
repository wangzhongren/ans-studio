import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, daprdListener, fix, fixture, git, modelFixture, operatorReport, resourceRoot, sqliteSnapshot,
  successful, target, until, unwrap, write, type Log } from "./fixture.ts";

const windowsDapr = {
  skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified bundle resource directory",
  timeout: 180_000,
};

function b3WorkerFacts({ fact }: ReturnType<typeof sqliteSnapshot>, kind: "task-bound" | "task-report") {
  return (fact ?? []).filter(row => {
    const { fact: entry } = JSON.parse(String(row.data));
    return entry.kind === kind && entry.task.stage === "B3" && entry.task.roleId === "worker";
  });
}

const approvedTurns = ["worker:B1", "convener:B1", "worker:B3", "convener:B3"];

function currentPathBModel(f: Awaited<ReturnType<typeof fixture>>, instanceId: () => string | undefined, log: Log,
  hooks: { beforeB1ReviewReport?: () => void; afterB3WorkerReport?: () => Promise<void> } = {}) {
  const turns: string[] = [];
  const model = modelFixture(async turn => {
    assert.equal(turn.chiefDecisionContext, undefined);
    const taskId = /任务编号：#([a-z0-9-]+)/.exec(turn.text)?.[1];
    assert.ok(taskId);
    const state = await readTaskState(f.root);
    const task = state.records.get(taskId)?.created;
    assert.ok(task?.stage && task.workflowId === instanceId());
    turns.push(`${turn.roleId}:${task.stage}`);
    if (turn.roleId === "worker" && task.stage === "B1") {
      await successful(turn, "read_file", { path: target });
      assert.equal((await turn.call("write_file", { path: target, content: "unauthorized during B1" })).ok, false);
      await successful(turn, "submit_report", { status: "completed", summary: `Only ${target} requires the scoped threshold fix.`, evidence: [analysis] });
      return;
    }
    if (turn.roleId === "worker" && task.stage === "B3") {
      await successful(turn, "write_file", { path: target, content: fix });
      await successful(turn, "run_shell", { command: `git add ${target}` });
      await successful(turn, "run_shell", { command: 'git commit -m "W5 current preset B bounded fix"' });
      await successful(turn, "submit_report", { status: "completed", summary: "The scoped fix is committed.", evidence: [target] });
      await hooks.afterB3WorkerReport?.();
      return;
    }
    assert.equal(turn.roleId, "convener");
    const workers = [...state.records.values()].filter(row => row.created?.to === "worker" && row.created.stage === task.stage);
    assert.equal(workers.length, 1);
    const worker = workers[0]!;
    assert.equal(worker.reports.length, 1);
    await successful(turn, "close_created_task", { operationId: `w5-review-${worker.taskId}`, taskId: worker.taskId, outcome: "accepted" });
    if (task.stage === "B1") hooks.beforeB1ReviewReport?.();
    await successful(turn, "submit_report", { status: "completed", summary: `Original ${task.stage} report verified.`,
      evidence: [task.stage === "B1" ? analysis : operatorReport] });
  }, log);
  return { ...model, turns };
}

type NativeScenario = "manual-frame" | "normal" | "pending-card-restart" | "daprd-loss-during-handback" | "simulated-offline-before-dispatch";

async function runCurrentPathB(t: test.TestContext, mode: NativeScenario) {
  const f = await fixture({ installLegacyPathB: false, existingIndependentRoster: true });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const project = { projectRoot: f.root };
  let instanceId: string | undefined;
  let interrupted: Awaited<ReturnType<typeof daprdListener>>;
  const model = currentPathBModel(f, () => instanceId, log, {
    beforeB1ReviewReport() {
      if (mode === "simulated-offline-before-dispatch") handle.simulateNetwork(false);
    },
    async afterB3WorkerReport() {
      if (mode !== "daprd-loss-during-handback") return;
      // The tool has accepted a candidate while the live turn still owes the terminal handback.
      interrupted = await daprdListener(f);
      assert.ok(interrupted, "locate the isolated sidecar by its allocated port");
      assert.ok(instanceId);
      const beforeHandback = sqliteSnapshot(f, instanceId);
      assert.equal(b3WorkerFacts(beforeHandback, "task-report").length, 0);
      process.kill(interrupted.pid, "SIGKILL");
      log("daprd-force-exit", { ...interrupted, applicationPid: process.pid, beforeHandback });
    },
  });
  let handle = await app(f, model, log);
  t.after(() => handle.close());
  const started = unwrap(await handle.startViaChief({ ...project, definitionId: "path-b", source: "preset",
    requestId: `windows-native-b-${mode}`, summary: `Change the existing threshold in ${target} within its approved work item.` }));
  assert.ok(started.instance);
  assert.equal(started.instance.definitionVersion, 3);
  assert.equal(started.instance.schema, 2);
  assert.equal(started.instance.definitionSource, "preset");
  instanceId = started.instance.instanceId;
  const selector = { ...project, instanceId };
  const projection = async () => unwrap(await handle.desktop.getDurableWorkflowProjection(selector));
  log("desktop-started", started);

  const ready = await until("registered real worker", async () => {
    const view = await projection();
    if (view.controlPlane.state === "failed") throw new Error(JSON.stringify(view));
    if (view.controlPlane.state === "ready") return view;
  }, model.errors);
  log("worker-ready", ready);

  let pausedTaskId: string | undefined;
  let originalListener: Awaited<ReturnType<typeof daprdListener>>;
  if (mode === "simulated-offline-before-dispatch") {
    pausedTaskId = await until("persisted B3 worker task while model transport is offline", async () => {
      const bound = b3WorkerFacts(sqliteSnapshot(f, instanceId), "task-bound");
      assert.ok(bound.length <= 1, "only one worker task may be bound while offline");
      if (bound[0]?.state === "consumed") return JSON.parse(String(bound[0].data)).fact.task.taskId as string;
    }, model.errors);
    const paused = await projection();
    originalListener = await daprdListener(f);
    assert.ok(originalListener);
    assert.equal(paused.controlPlane.state, "ready");
    assert.equal(paused.instance?.engine, "healthy");
    assert.deepEqual(model.turns, approvedTurns.slice(0, 2));
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    log("b3-dispatch-waiting-with-model-transport-offline", { pausedTaskId, originalListener, paused, sqlite: sqliteSnapshot(f, instanceId) });
    handle.simulateNetwork(true);
  }

  const pending = await until("actual B4 customer card", async () => [...handle.cards.values()]
    .find(card => card.request.cardKind === "merge-main"), model.errors);
  const before = await projection();
  assert.equal(pending.request.application, true);
  assert.equal(before.instance?.approval?.requestId, pending.id);
  assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  log("pre-approval", { before, sqlite: sqliteSnapshot(f, instanceId) });

  if (mode === "pending-card-restart") {
    const first = await daprdListener(f);
    assert.ok(first);
    await handle.close();
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid, "closing the pending card must preserve main");
    const original = await readFile(new URL("../../../docs/workflows/path-b.yaml", import.meta.url), "utf8");
    const replacement = original.replace(/^version: 3$/m, "version: 4");
    assert.notEqual(replacement, original);
    await write(f.root, "docs/workflows/path-b.yaml", replacement);
    handle = await app(f, model, log);
    const updated = unwrap(await handle.desktop.validateDurableWorkflow({ ...project, definitionId: "path-b", source: "project" }));
    assert.equal(updated.version, 4);
    assert.notEqual(updated.digest, before.instance?.definitionDigest);
    const resumed = await until("same customer card after Desktop and Dapr restart", async () => handle.cards.get(pending.id), model.errors);
    const second = await daprdListener(f);
    assert.ok(second);
    assert.notEqual(second.pid, first.pid);
    assert.equal(resumed.id, pending.id);
    const view = await projection();
    assert.equal(view.instance?.definitionVersion, 3);
    assert.equal(view.instance?.definitionDigest, before.instance?.definitionDigest);
    assert.equal(view.instance?.approval?.status, "pending");
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    log("restart-card-restored", { view, id: resumed.id, first, second, sqlite: sqliteSnapshot(f, instanceId) });
  }

  if (mode === "daprd-loss-during-handback") {
    const resumed = await daprdListener(f);
    assert.ok(interrupted && resumed);
    assert.notEqual(resumed.pid, interrupted.pid);
    const reports = b3WorkerFacts(sqliteSnapshot(f, instanceId), "task-report");
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.state, "consumed");
    log("handback-recovered", { interrupted, resumed, applicationPid: process.pid, reports });
  }

  if (mode === "simulated-offline-before-dispatch") {
    const { records } = await readTaskState(f.root);
    const workers = [...records.values()].filter(record => record.created?.to === "worker" && record.created.stage === "B3");
    assert.equal(workers.length, 1);
    assert.equal(workers[0]?.taskId, pausedTaskId);
    assert.deepEqual(await daprdListener(f), originalListener);
    assert.deepEqual(model.turns, approvedTurns);
    log("original-b3-task-resumed-once", { worker: workers[0], turns: model.turns, originalListener });
    handle.simulateNetwork(false);
  }

  if (mode === "manual-frame") {
    const rejectedFrame = await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[0], () => false);
    assert.equal(rejectedFrame.ok, false);
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  }
  const branchTip = git(f.root, "rev-parse", "HEAD");
  const accepted = await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[0], () => true);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const complete = await until("actual Git result and pending delivery", async () => {
    const { instance } = await projection();
    if (instance?.status === "delivered" && instance.delivery?.state === "pending") return instance;
  }, model.errors);
  const main = git(f.root, "rev-parse", "main");
  assert.notEqual(main, f.baselineOid);
  const parents = git(f.root, "rev-list", "--parents", "-n", "1", "main").split(" ");
  assert.deepEqual(parents, [main, f.baselineOid, branchTip]);
  assert.match(branchTip, /^[a-f0-9]{40}$/);
  assert.equal(git(f.root, "rev-list", "--count", `${f.baselineOid}..${branchTip}`), "1");
  assert.equal(git(f.root, "diff", "--name-only", f.baselineOid, "main"), target);
  assert.equal(git(f.root, "show", `main:${target}`), fix.trim());
  assert.equal(git(f.root, "remote"), "");
  assert.equal(git(f.root, "tag"), "");
  assert.equal((await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[0], () => true)).ok, true);
  assert.equal((await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[1], () => true)).ok, false);
  assert.equal(git(f.root, "rev-parse", "main"), main);
  assert.deepEqual(model.turns, approvedTurns);

  const delivery = { ...selector, deliveryId: complete.delivery!.id };
  const detail = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
  assert.equal(unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: detail.viewToken })).state, "delivered");
  const snapshot = sqliteSnapshot(f, instanceId);
  const saved = snapshot.fact?.filter(row => row.business_key === `release-decision:${pending.id}`);
  assert.equal(saved?.length, 1);
  assert.match(String(saved?.[0]?.data), /"source":"customer"/);
  assert.deepEqual(snapshot.effect?.filter(row => String(row.business_key).startsWith("release-merge:")).map(row => row.state), ["succeeded"]);
  log("delivered", { complete, main, parents, turns: model.turns, snapshot });
}

test("Native current preset B preserves the trusted manual merge and one Git effect", windowsDapr, async t => {
  await runCurrentPathB(t, "manual-frame");
});

for (const mode of ["normal", "pending-card-restart", "daprd-loss-during-handback", "simulated-offline-before-dispatch"] as const) {
  test(`Native Windows Desktop Path B ${mode}`, windowsDapr, async t => {
    await runCurrentPathB(t, mode);
  });
}

test("Native Desktop blocks unsupported repo-local Git config before any instance or task", windowsDapr, async t => {
  const f = await fixture({ installLegacyPathB: false, existingIndependentRoster: true });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  git(f.root, "config", "core.autocrlf", "false");
  const model = modelFixture(async () => assert.fail("rejected start must not dispatch a workflow role"), log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const selector = { projectRoot: f.root };
  const result = await handle.startViaChief({ ...selector, definitionId: "path-b", source: "preset",
    requestId: "invalid-git-config", summary: "A B1 task must not be created" });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, "workflow-git-protection-unavailable");
  const view = unwrap(await handle.desktop.getDurableWorkflowProjection(selector));
  const tasks = await readTaskState(f.root);
  assert.equal(view.instance, undefined);
  assert.equal(tasks.records.size, 0);
  assert.equal(handle.cards.size, 0);
  assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  assert.equal(git(f.root, "branch", "--format=%(refname:short)"), "main");
  log("git-protection-blocked", { result, view, baselineOid: f.baselineOid, tasks: tasks.records.size });
});
