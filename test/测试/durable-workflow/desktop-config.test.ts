import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { analysis, app, fixture, git, modelFixture, resourceRoot, sqliteSnapshot, successful, target, until, unwrap, write,
  type Log, type PackagedRun, type runPackagedPathB } from "./fixture.ts";

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
  const start = async (requestId: string) => handle.startViaChief({ ...selector, definitionId, enabled: true,
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

for (const winner of ["project", "preset"] as const) test(`Windows active ${winner === "project" ? "v1" : "v2"} Path B owner excludes the other executor`, {
  skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified Windows bundle resources",
  timeout: 120_000,
}, async t => {
  const f = await fixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const activeModel = modelFixture(async turn => { assert.equal(turn.roleId, "chief"); }, log);
  const active = await app(f, activeModel, log);
  t.after(() => active.close());
  const selection = { projectRoot: f.root, definitionId: "path-b", enabled: true };
  const winningInstance = unwrap(await active.startViaChief({ ...selection, source: winner,
    requestId: "w5-active-owner", summary: "Review the applicable existing file" })).instance;
  assert.ok(winningInstance);
  const ready = await until("the winner's scheduled native Workflow", async () => {
    const view = unwrap(await active.desktop.getDurableWorkflowProjection({ projectRoot: f.root, instanceId: winningInstance.instanceId }));
    if (view.instance?.engine === "healthy") return view.instance;
  }, activeModel.errors);
  assert.equal(ready.definitionVersion, winner === "project" ? 1 : 2);
  const before = { oid: git(f.root, "rev-parse", "HEAD"), refs: git(f.root, "show-ref"), tasks: (await readTaskState(f.root)).events };
  const contenderDirectory = path.join(f.directory, "other-executor");
  await mkdir(contenderDirectory);
  const contenderModel = modelFixture(async () => assert.fail("A conflicting executor must stay outside role execution"), log);
  const contender = await app({ directory: contenderDirectory, root: f.root, userDataRoot: path.join(contenderDirectory, "data") }, contenderModel, log);
  t.after(() => contender.close());
  const result = await contender.startViaChief({ ...selection, source: winner === "project" ? "preset" : "project",
    requestId: "w5-different-executor", summary: "This second executor must respect the original owner" });
  assert.equal(result.ok, false, JSON.stringify(result));
  const contenderStore = await contender.durable.store();
  const owner = await contenderStore.owner(f.root);
  assert.equal(owner?.instanceId, winningInstance.instanceId);
  assert.equal(owner?.ownedByThisDataDir, false);
  assert.deepEqual(contenderStore.activeProjections(), []);
  assert.deepEqual({ oid: git(f.root, "rev-parse", "HEAD"), refs: git(f.root, "show-ref"), tasks: (await readTaskState(f.root)).events }, before);
  assert.deepEqual(contenderModel.errors, []);
  log("old-and-new-executors-exclusive", { ready, owner, rejected: result, before });
});

const oldPackage = process.env.ANS_W5_OLD_PACKAGE_ROOT;
const newPackage = process.env.ANS_W5_NEW_PACKAGE_ROOT;
const oldZip = process.env.ANS_W5_OLD_PACKAGE_ZIP;
const newZip = process.env.ANS_W5_NEW_PACKAGE_ZIP;

async function sha256File(filename: string) {
  const sha = createHash("sha256");
  for await (const chunk of createReadStream(filename)) sha.update(chunk);
  return sha.digest("hex");
}

test("Actual Windows ZIP binaries and bundled Desktop modules resume the same pending v1 Path B without role replay", {
  skip: !(oldPackage && newPackage && oldZip && newZip) && "Set both independently extracted Windows package roots and their ZIP paths",
  timeout: 240_000,
}, async t => {
  const oldResource = path.join(oldPackage!, "resources");
  const newResource = path.join(newPackage!, "resources");
  assert.notEqual(path.resolve(oldPackage!), path.resolve(newPackage!));
  const readBundledDefinition = (resource: string, id: string) => readFile(path.join(resource, "app", "docs", "workflows", id + ".yaml"), "utf8");
  const oldDefinition = await readBundledDefinition(oldResource, "path-b");
  assert.match(oldDefinition, /^schema: 1$/m);
  assert.match(await readBundledDefinition(newResource, "path-b"), /^schema: 2$/m);
  assert.match(await readBundledDefinition(newResource, "path-a"), /^schema: 2$/m);
  const verifyPackage = async (extracted: string, zip: string) => Object.fromEntries(await Promise.all([
    ["zipSha256", zip], ["electronSha256", path.join(extracted, "ANS Studio.exe")],
    ["desktopSha256", path.join(extracted, "resources/app/app/desktop/interface.ts")],
    ["workflowSha256", path.join(extracted, "resources/app/app/desktop/durable-workflow.ts")],
    ["daprdSha256", path.join(extracted, "resources/dapr-runtime/daprd.exe")],
    ["schedulerSha256", path.join(extracted, "resources/dapr-runtime/scheduler.exe")],
  ].map(async ([label, filename]) => [label, await sha256File(filename)])));
  const [original, candidate] = await Promise.all([verifyPackage(oldPackage!, oldZip!), verifyPackage(newPackage!, newZip!)]);
  assert.equal(original.zipSha256, "3d39ff874033e953067b024f027c84c29f39c50536621ff68c01e058f20f10a8");
  assert.notEqual(original.zipSha256, candidate.zipSha256);
  t.diagnostic(JSON.stringify({ event: "packaged-binary-and-module-provenance", original, candidate }));

  const f = await fixture();
  await write(f.root, "docs/workflows/path-b.yaml", oldDefinition);
  const script = `
    import { runPackagedPathB } from ${JSON.stringify(new URL("./fixture.ts", import.meta.url).href)};
    const log = (event,value) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), event, value }) + "\\n");
    const finished = await runPackagedPathB(JSON.parse(process.argv[1]), log);
    process.stdout.write("PACKAGED_W5_RESULT " + JSON.stringify(finished) + "\\n");
  `;
  const run = async (extracted: string, input: PackagedRun) => {
    const executable = path.join(extracted, "ANS Studio.exe");
    const result = await promisify(execFile)(executable, ["--input-type=module", "-e", script, JSON.stringify(input)], {
      windowsHide: true, timeout: 110_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    }).catch(error => {
      t.diagnostic(error.stdout ?? "");
      t.diagnostic(error.stderr ?? "");
      throw error;
    });
    if (result.stderr) t.diagnostic(result.stderr);
    t.diagnostic(result.stdout);
    const line = result.stdout.split(/\r?\n/).find(row => row.startsWith("PACKAGED_W5_RESULT "));
    assert.ok(line, "Expected the actual packaged Electron process to complete its requested phase");
    return JSON.parse(line.slice("PACKAGED_W5_RESULT ".length)) as Awaited<ReturnType<typeof runPackagedPathB>>;
  };

  const pending = await run(oldPackage!, { f, bundleResources: oldResource });
  assert.equal(path.normalize(pending.child.executable), path.normalize(path.join(oldPackage!, "ANS Studio.exe")));
  assert.ok(pending.child.electron);
  const processActive = (pid: number) => {
    try { process.kill(pid, 0); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  };
  assert.equal(processActive(pending.child.pid), false);
  assert.equal(processActive(pending.child.worker.pid), false);
  const finished = await run(newPackage!, { f, bundleResources: newResource, resume: pending.wait });
  assert.equal(path.normalize(finished.child.executable), path.normalize(path.join(newPackage!, "ANS Studio.exe")));
  assert.ok(finished.child.electron);
  assert.notEqual(finished.child.pid, pending.child.pid);
  assert.notEqual(finished.child.worker.pid, pending.child.worker.pid);
  assert.deepEqual(finished.wait, pending.wait);
  assert.equal(finished.receipt?.state, "delivered");
  assert.notEqual(finished.mergedHead, f.baselineOid);
  t.diagnostic(JSON.stringify({ event: "actual-packaged-hosts-v1-handoff", pending, finished }));
});
