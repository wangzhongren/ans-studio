import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, fixture, git, modelFixture, resourceRoot, sqliteSnapshot, successful, target, until, unwrap, write, type Log } from "./fixture.ts";

test("Desktop keeps an active read-only definition pinned when external YAML is invalid or upgraded", {
  skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified bundle resource directory",
  timeout: 180_000,
}, async t => {
  const f = await fixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  log("fixture", f);
  const definitionId = "read-only-example";
  const relativeYaml = `docs/workflows/${definitionId}.yaml`;
  const original = await readFile(path.join(f.root, relativeYaml), "utf8");
  const changed = original.replace("version: 1", "version: 2")
    .replace("accepted: completed", "accepted: reviewed")
    .replace("completed: { terminal", "reviewed: { terminal");
  const hold = Promise.withResolvers<void>();
  const received = Promise.withResolvers<void>();
  const flowId = "snake";
  const runs = new Map<string, number>();
  const model = modelFixture(async turn => {
    const roleId = turn.roleId;
    const run = (runs.get(roleId) ?? 0) + 1;
    runs.set(roleId, run);
    if (roleId === "chief") {
      await successful(turn, "dispatch_task", { roleId: "convener", task: "Read-only examination of collision threshold", flowId,
        taskKind: "stage-request", workflowPath: "B", stage: "B1", workflowAction: "advance", sideEffect: "read-only" });
      return;
    }
    if (roleId === "convener" && run % 2 === 1) {
      await successful(turn, "dispatch_task", { roleId: "worker", task: `Read-only inspection of ${target}`, flowId,
        stage: "B1", sideEffect: "read-only", moduleId: "core", modulePaths: [target] });
      return;
    }
    if (roleId === "worker") {
      await successful(turn, "read_file", { path: target });
      if (run === 1) {
        received.resolve();
        await hold.promise;
      }
      await successful(turn, "submit_report", { status: "completed", summary: "Read-only report about collision threshold", evidence: [analysis] });
      return;
    }
    if (roleId === "convener") {
      const tasks = (await readTaskState(f.root)).records;
      const workers = [...tasks.values()].filter(record => record.created?.to === "worker");
      assert.equal(workers.length, run / 2);
      await successful(turn, "close_created_task", { operationId: `w5-readonly-close-${run}`, taskId: workers.at(-1)!.taskId, outcome: "accepted" });
      return;
    }
    assert.fail(`Unscripted role turn ${roleId}:${run}`);
  }, log);
  const handle = await app(f, model, log);
  t.after(() => { hold.resolve(); return handle.close(); });
  const selector = { projectRoot: f.root };
  const start = async (requestId: string) => handle.desktop.startDurableWorkflow({ ...selector, definitionId, enabled: true,
    requestId, summary: "Read the collision threshold with the existing module owner" });
  const initial = unwrap(await start("w5-old-definition")).instance!;
  const projection = async (instanceId: string) => unwrap(await handle.desktop.getDurableWorkflowProjection({ ...selector, instanceId }));
  try {
    let read = false;
    void received.promise.then(() => { read = true; });
    await until("original graph's read-only worker waiting to report", async () => read ? true : undefined, model.errors);
    assert.equal(initial.definitionVersion, 1);
    const invalidDefinitions = [
      original.replace("role: module-owner", "role: unknown-role"),
      original.replace("action: readonly-report", "action: shell"),
      original.replace("      blocked: blocked\n", ""),
      original.replace("      accepted: completed", "      accepted: inspect"),
      original.replace("    next: review", "    next: completed"),
      original.replace("    role: module-owner", "    role: module-owner\n    shell: echo unauthorized"),
    ];
    for (const invalid of invalidDefinitions) {
      await write(f.root, relativeYaml, invalid);
      const validation = await handle.desktop.validateDurableWorkflow({ ...selector, definitionId });
      const denied = await start("w5-must-not-start-invalid");
      assert.equal(validation.ok, false, JSON.stringify(validation));
      assert.equal(denied.ok, false, JSON.stringify(denied));
      log("external-config-rejected", { invalid, validation, denied });
    }
    await write(f.root, relativeYaml, changed);
    const valid = unwrap(await handle.desktop.validateDurableWorkflow({ ...selector, definitionId }));
    assert.equal(valid.version, 2);
    assert.notEqual(valid.digest, initial.definitionDigest);
    const pinned = await projection(initial.instanceId);
    assert.equal(pinned.instance?.definitionDigest, initial.definitionDigest);
    log("changed-external-config", { original, changed, valid, pinned });
    hold.resolve();
    const complete = async (id: string) => until("read-only graph completion", async () => {
      const view = await projection(id);
      if (view.instance?.status === "completed") return view;
    }, model.errors);
    const old = await complete(initial.instanceId);
    assert.equal(old.instance?.stepId, "completed");
    assert.equal(old.instance?.definitionVersion, 1);
    const fresh = unwrap(await start("w5-new-definition")).instance!;
    assert.equal(fresh.definitionVersion, 2);
    const newView = await complete(fresh.instanceId);
    assert.equal(newView.instance?.stepId, "reviewed");
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    assert.equal(git(f.root, "status", "--porcelain"), "");
    assert.equal(git(f.root, "branch", "--format=%(refname:short)"), "main");
    assert.equal(handle.cards.size, 0);
    assert.deepEqual(Object.fromEntries(runs), { chief: 2, convener: 4, worker: 2 });
    log("read-only-complete", { old, newView, newLedger: sqliteSnapshot(f, fresh.instanceId), main: f.baselineOid });
  } finally {
    hold.resolve();
    log("final-observation", { projection: await projection(initial.instanceId), runs: [...runs], sqlite: sqliteSnapshot(f, initial.instanceId) });
  }
});
