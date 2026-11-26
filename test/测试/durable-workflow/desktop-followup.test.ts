import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, fixture, git, modelFixture, resourceRoot, sqliteSnapshot, successful, target, until, unwrap, write, type Log } from "./fixture.ts";

test("The same Desktop and operator disposition follow different Path B YAML branches", {
  skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified bundle resource directory",
  timeout: 180_000,
}, async t => {
  const f = await fixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  log("fixture", f);
  const flowId = "snake";
  const counts = new Map<string, number>();
  const model = modelFixture(async turn => {
    const { roleId } = turn;
    const run = (counts.get(roleId) ?? 0) + 1;
    counts.set(roleId, run);
    if (roleId === "chief") {
      await successful(turn, "dispatch_task", { roleId: "convener", task: "Examine the collision threshold", flowId,
        taskKind: "stage-request", workflowPath: "B", stage: "B1", workflowAction: "advance", sideEffect: "read-only" });
      return;
    }
    if (roleId === "worker") {
      await successful(turn, "read_file", { path: target });
      await successful(turn, "submit_report", { status: "completed", summary: "Read-only findings need a follow-up check", evidence: [analysis] });
      return;
    }
    if (roleId === "convener" && run % 2 === 1) {
      await successful(turn, "dispatch_task", { roleId: "worker", task: `Inspect threshold in ${target}`, flowId,
        stage: "B1", sideEffect: "read-only", moduleId: "core", modulePaths: [target] });
      return;
    }
    if (roleId === "convener") {
      const tasks = (await readTaskState(f.root)).records;
      const workers = [...tasks.values()].filter(record => record.created?.to === "worker");
      assert.equal(workers.length, run / 2);
      await successful(turn, "close_created_task", { operationId: `w5-path-b-rework-${run}`, taskId: workers.at(-1)!.taskId, outcome: "rework" });
      return;
    }
    assert.fail(`Unscripted role turn ${roleId}:${run}`);
  }, log);
  const handle = await app(f, model, log);
  t.after(() => handle.close());
  const selector = { projectRoot: f.root };
  const start = async (requestId: string) => unwrap(await handle.startViaChief({ ...selector, definitionId: "path-b", enabled: true,
    requestId, summary: "Examine the collision threshold; report if further checking is needed" })).instance!;
  const blocked = (instanceId: string) => until("Path B terminal or configured follow-up is exhausted", async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ ...selector, instanceId }));
    return view.instance?.status === "blocked" ? view.instance : undefined;
  }, model.errors);
  const initial = await start("w5-path-b-v1-no-followup");
  const old = await blocked(initial.instanceId);
  const approvedFiles = "docs/workflows/path-b.yaml";
  const original = await readFile(path.join(f.root, approvedFiles), "utf8");
  const changed = original.replace("version: 1", "version: 2")
    .replace("needsFollowup: blocked", "needsFollowup: followup")
    .replace("  scope:", "  followup:\n    action: b1-open-followup-attempt\n    next: impact\n    maxVisits: 1\n    onLimit: blocked\n  scope:");
  const v1 = sqliteSnapshot(f, initial.instanceId);
  log("v1-no-followup", { old, original, v1 });
  assert.equal(old.attempt, 1);
  assert.deepEqual(Object.fromEntries(counts), { chief: 1, convener: 2, worker: 1 });
  git(f.root, "switch", "main");
  await write(f.root, approvedFiles, changed);
  const valid = unwrap(await handle.desktop.validateDurableWorkflow({ ...selector, definitionId: "path-b" }));
  assert.equal(valid.version, 2);
  log("v2-enabled-followup", { changed, valid });
  const second = await start("w5-path-b-v2-one-followup");
  try {
    const view = await blocked(second.instanceId);
    assert.equal(view.definitionVersion, 2);
    assert.equal(view.attempt, 2);
    const tasks = [...(await readTaskState(f.root)).records.values()];
    const v2Workers = tasks.filter(record => record.created?.workflowId === second.instanceId && record.created.to === "worker");
    assert.equal(v2Workers.length, 2);
    assert.equal(new Set(v2Workers.map(record => record.taskId)).size, 2);
    assert.ok(v2Workers.every(record => record.created?.sideEffect === "read-only"));
    assert.deepEqual(Object.fromEntries(counts), { chief: 3, convener: 6, worker: 3 });
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    assert.equal(git(f.root, "status", "--porcelain"), "");
    assert.equal(handle.cards.size, 0);
    log("v2-followup-safe-limit", { view, v2Workers, runs: [...counts], main: f.baselineOid });
  } finally {
    log("v2-final-observation", { view: unwrap(await handle.desktop.getDurableWorkflowProjection({ ...selector, instanceId: second.instanceId })),
      sqlite: sqliteSnapshot(f, second.instanceId), runs: [...counts] });
  }
});
