import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, daprdListener, fix, fixture, git, modelFixture, operatorReport, pathBModel, resourceRoot, sqliteSnapshot,
  successful, target, until, unwrap, write, type Log } from "./fixture.ts";

const windowsDapr = {
  skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified bundle resource directory",
  timeout: 180_000,
};

function b3Reports({ fact }: ReturnType<typeof sqliteSnapshot>) {
  return (fact ?? []).filter(row => {
    const data = JSON.parse(String(row.data));
    return data.fact.kind === "task-report" && data.fact.task.stage === "B3";
  });
}

test("Native current preset B preserves the trusted manual merge and one Git effect", windowsDapr, async t => {
  const f = await fixture({ installLegacyPathB: false, existingIndependentRoster: true });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const project = { projectRoot: f.root };
  const turns: string[] = [];
  let instanceId: string | undefined;
  const model = modelFixture(async turn => {
    assert.equal(turn.chiefDecisionContext, undefined);
    const taskId = /任务编号：#([a-z0-9-]+)/.exec(turn.text)?.[1];
    assert.ok(taskId);
    const state = await readTaskState(f.root);
    const task = state.records.get(taskId)?.created;
    assert.ok(task?.stage && task.workflowId === instanceId);
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
      await successful(turn, "run_shell", { command: 'git commit -m "R10 current preset B bounded fix"' });
      await successful(turn, "submit_report", { status: "completed", summary: "The scoped fix is committed.", evidence: [target] });
      return;
    }
    assert.equal(turn.roleId, "convener");
    const worker = [...state.records.values()].find(row => row.created?.to === "worker" && row.created.stage === task.stage);
    assert.ok(worker && worker.reports.length === 1);
    await successful(turn, "close_created_task", { operationId: `r10-review-${worker.taskId}`, taskId: worker.taskId, outcome: "accepted" });
    await successful(turn, "submit_report", { status: "completed", summary: `Original ${task.stage} report verified.`,
      evidence: [task.stage === "B1" ? analysis : operatorReport] });
  }, log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const started = unwrap(await handle.startViaChief({ ...project, definitionId: "path-b", source: "preset",
    summary: `Change the existing threshold in ${target} within its approved work item.` }));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  const selector = { ...project, instanceId };
  const card = await until("current B4 merge card", async () => [...handle.cards.values()].find(card => card.request.cardKind === "merge-main"), model.errors);
  const branchTip = git(f.root, "rev-parse", "HEAD");
  const rejectedFrame = await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0], () => false);
  assert.equal(rejectedFrame.ok, false);
  assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  const accepted = await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0], () => true);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const done = await until("B4 actual Git result and delivery", async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection(selector)).instance;
    if (view?.delivery?.state === "pending") return view;
  }, model.errors);
  assert.deepEqual(turns, ["worker:B1", "convener:B1", "worker:B3", "convener:B3"]);
  assert.equal(git(f.root, "show", `main:${target}`), fix.trim());
  const mainParents = git(f.root, "rev-list", "--parents", "-n", "1", "main").split(" ");
  assert.deepEqual(mainParents.slice(1), [f.baselineOid, branchTip]);
  const decision = { ...selector, deliveryId: done.delivery!.id };
  const detail = unwrap(await handle.desktop.readDurableWorkflowDelivery(decision));
  assert.equal(unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...decision, viewToken: detail.viewToken })).state, "delivered");
  const snapshot = sqliteSnapshot(f, instanceId);
  const saved = snapshot.fact?.filter(row => row.business_key === `release-decision:${card.id}`);
  assert.equal(saved?.length, 1);
  assert.match(String(saved?.[0]?.data), /"source":"customer"/);
  assert.deepEqual(snapshot.effect?.filter(row => String(row.business_key).startsWith("release-merge:")).map(row => row.state), ["succeeded"]);
  log("r10-current-b-manual-release", { turns, rejectedFrame, accepted, branchTip, mainParents, done, snapshot });
});

for (const mode of ["normal", "pending-card-restart", "daprd-loss-during-handback", "simulated-offline-before-dispatch"] as const) test(`Native Windows Desktop Path B ${mode}`, windowsDapr, async t => {
  const f = await fixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  log("fixture", f);
  let instanceId = "";
  let interrupted: Awaited<ReturnType<typeof daprdListener>>;
  let simulateNetwork: (online: boolean) => void;
  const model = pathBModel(f, () => instanceId, log, {
    async afterScope() {
      if (mode === "simulated-offline-before-dispatch") simulateNetwork(false);
    },
    async afterImplementationReport() {
      if (mode === "daprd-loss-during-handback") {
        // The product has accepted the report candidate. Its terminal event below drives
        // real persistence and handback while the fixture's own daprd is forcibly terminated.
        interrupted = await daprdListener(f);
        assert.ok(interrupted, "locate the isolated sidecar by the fixture's allocated port");
        const from = sqliteSnapshot(f, instanceId);
        assert.equal(b3Reports(from).length, 0);
        process.kill(interrupted.pid, "SIGKILL");
        log("daprd-force-exit", { ...interrupted, applicationPid: process.pid, from });
      }
    },
  });
  const { runs } = model;
  let handle = await app(f, model, log);
  simulateNetwork = handle.simulateNetwork;
  t.after(() => handle.close());
  const selector = { projectRoot: f.root };
  const started = unwrap(await handle.startViaChief({ ...selector, enabled: true, definitionId: "path-b",
    requestId: "w5-normal-chain", summary: "Fix collision threshold in the existing Git project" }));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  log("desktop-started", started);
  const projection = async () => unwrap(await handle.desktop.getDurableWorkflowProjection({ ...selector, instanceId }));
  try {
    const ready = await until("registered real worker", async () => {
      const view = await projection();
      if (view.controlPlane.state === "ready") return view;
      if (view.controlPlane.state === "failed") throw new Error(JSON.stringify(view));
    }, model.errors);
    log("worker-ready", ready);
    let pausedTaskId: string | undefined;
    let originalListener: Awaited<ReturnType<typeof daprdListener>>;
    if (mode === "simulated-offline-before-dispatch") {
      pausedTaskId = await until("persisted B3 parent task while the model transport is offline", async () => {
        const state = await readTaskState(f.root);
        return [...state.records.values()].find(record => record.created?.taskKind === "stage-request" && record.created.stage === "B3")?.taskId;
      }, model.errors);
      const paused = await projection();
      originalListener = await daprdListener(f);
      assert.ok(originalListener);
      assert.equal(paused.controlPlane.state, "ready");
      assert.equal(paused.instance?.engine, "healthy");
      assert.equal(runs.get("convener"), 2);
      assert.equal(runs.get("worker"), 1);
      assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
      log("b3-dispatch-waiting-with-model-transport-offline", { pausedTaskId, originalListener, paused, sqlite: sqliteSnapshot(f, instanceId) });
      simulateNetwork(true);
    }
    const pending = await until("actual B4 customer card", async () => [...handle.cards.values()][0], model.errors);
    const before = await projection();
    assert.equal(pending.request.cardKind, "merge-main");
    assert.equal(pending.request.application, true);
    assert.equal(before.instance?.approval?.requestId, pending.id);
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    log("pre-approval", { before, sqlite: sqliteSnapshot(f, instanceId) });
    if (mode === "pending-card-restart") {
      log("restart-begin", { id: pending.id, definitionDigest: before.instance?.definitionDigest });
      const first = await daprdListener(f);
      assert.ok(first);
      await handle.close();
      assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid, "closing the pending card must preserve main");
      const yaml = "docs/workflows/path-b.yaml";
      const original = await readFile(path.join(f.root, yaml), "utf8");
      await write(f.root, yaml, original.replace("version: 1", "version: 2"));
      handle = await app(f, model, log);
      assert.equal(unwrap(await handle.desktop.validateDurableWorkflow({ ...selector, definitionId: "path-b" })).version, 2);
      const resumed = await until("same customer card after Desktop and Dapr restart", async () => [...handle.cards.values()][0], model.errors);
      const second = await daprdListener(f);
      assert.ok(second);
      assert.notEqual(second.pid, first.pid);
      assert.equal(resumed.id, pending.id);
      const view = await projection();
      assert.equal(view.instance?.definitionVersion, 1);
      assert.equal(view.instance?.definitionDigest, before.instance?.definitionDigest);
      assert.equal(view.instance?.approval?.status, "pending");
      assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
      log("restart-card-restored", { view, id: resumed.id, first, second, sqlite: sqliteSnapshot(f, instanceId) });
    }
    if (mode === "daprd-loss-during-handback") {
      const resumed = await daprdListener(f);
      assert.ok(interrupted && resumed);
      assert.notEqual(resumed.pid, interrupted.pid);
      const reports = b3Reports(sqliteSnapshot(f, instanceId));
      assert.equal(reports.length, 1);
      assert.equal(reports[0].state, "consumed");
      log("handback-recovered", { interrupted, resumed, applicationPid: process.pid, reports });
    }
    if (mode === "simulated-offline-before-dispatch") {
      const { records } = await readTaskState(f.root);
      const parent = [...records.values()].filter(record => record.created?.taskKind === "stage-request" && record.created.stage === "B3");
      assert.equal(parent.length, 1);
      assert.equal(parent[0].taskId, pausedTaskId);
      assert.deepEqual(await daprdListener(f), originalListener);
      assert.deepEqual(Object.fromEntries(runs), { chief: 2, convener: 4, worker: 2 });
      log("original-b3-task-resumed-once", { parent: parent[0], runs: [...runs], originalListener });
      simulateNetwork(false);
    }
    assert.equal((await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
    const complete = await until("delivered", async () => {
      const view = await projection();
      if (view.instance?.status === "delivered") return view;
    }, model.errors);
    const main = git(f.root, "rev-parse", "main");
    assert.notEqual(main, f.baselineOid);
    const parents = git(f.root, "rev-list", "--parents", "-n", "1", "main");
    const [merged, mainParent, taskTip, ...extraParents] = parents.split(" ");
    assert.deepEqual([merged, mainParent, extraParents], [main, f.baselineOid, []]);
    assert.match(taskTip, /^[a-f0-9]{40}$/);
    assert.equal(git(f.root, "rev-list", "--count", `${f.baselineOid}..${taskTip}`), "1");
    assert.equal(git(f.root, "diff", "--name-only", f.baselineOid, "main"), target);
    assert.equal(git(f.root, "show", `main:${target}`), fix.trim());
    assert.equal(git(f.root, "remote"), "");
    assert.equal(git(f.root, "tag"), "");
    assert.equal((await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
    assert.equal((await handle.respond(pending.id, MERGE_MAIN_OPTION_IDS[1])).ok, false);
    assert.equal(git(f.root, "rev-parse", "main"), main);
    assert.deepEqual(Object.fromEntries(runs), { chief: 2, convener: 4, worker: 2 });
    log("delivered", { complete, main, parents, diff: git(f.root, "diff", f.baselineOid, "main") });
  } finally {
    log("final-observation", { projection: await projection(), runs: [...runs], sqlite: sqliteSnapshot(f, instanceId) });
  }
});

test("Native Desktop blocks unsupported repo-local Git config before any instance or task", windowsDapr, async t => {
  const f = await fixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  git(f.root, "config", "core.autocrlf", "false");
  const model = modelFixture(async () => assert.fail("rejected start must not invoke a model"), log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const selector = { projectRoot: f.root };
  const result = await handle.startViaChief({ ...selector, enabled: true, definitionId: "path-b", requestId: "invalid-git-config", summary: "A B1 task must not be created" });
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
