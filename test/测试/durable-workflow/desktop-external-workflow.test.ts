import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { DEFAULT_APP_RUNTIME_FILES } from "../../../src/common/编排/shell-post-audit.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import type { ToolResult } from "../../../src/model/runtime.ts";
import { analysis, app, emptyFixture, fix, fixture, git, modelFixture, operatorReport, resourceRoot, sqliteSnapshot, successful, target,
  until, unwrap, write, type Log } from "./fixture.ts";

const native = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified Windows bundle resources", timeout: 240_000 };
const definitionId = "external-existing-change";
const definitionPath = fileURLToPath(new URL("fixtures/external-existing-change.yaml", import.meta.url));
const flowId = "snake";
const criteria = `docs/quality/${flowId}-criteria-v1.md`;
const review = `docs/quality/${flowId}-report-v1.md`;
const sha = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

async function trackedAndBusinessState(root: string) {
  const files: Record<string, string> = {};
  async function visit(relative: string) {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (relative === "" && [".ans", ".git"].includes(entry.name)) continue;
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      if (DEFAULT_APP_RUNTIME_FILES.includes(key)) continue;
      if (entry.isDirectory()) await visit(key);
      else if (entry.isFile()) files[key] = sha(await readFile(path.join(root, key)));
      else assert.fail(`Unexpected non-file project input ${key}`);
    }
  }
  await visit("");
  return { files, head: git(root, "rev-parse", "HEAD"), refs: git(root, "show-ref"), status: git(root, "status", "--porcelain=v1") };
}

async function applicationRuntimeFiles(root: string) {
  return Object.fromEntries(await Promise.all(DEFAULT_APP_RUNTIME_FILES.map(async relative => {
    const content = await readFile(path.join(root, relative)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    return [relative, content === undefined ? null : sha(content)];
  })));
}

function externalModel(f: Awaited<ReturnType<typeof fixture>>, log: Log, scenario: "read-only" | "authorized-write" | "bundled-b",
  beforeStopReport?: () => Promise<void>) {
  const onlyRead = scenario === "read-only";
  let desktop: Awaited<ReturnType<typeof app>>;
  let instanceId = "";
  let before: Awaited<ReturnType<typeof trackedAndBusinessState>>;
  const issued = new Set<string>();
  const closed = new Set<string>();
  const model = modelFixture(async turn => {
    const taskId = /(?:任务编号：|任务：|任务 )#?([a-zA-Z0-9-]+)/.exec(turn.text)?.[1];
    const task = taskId ? (await readTaskState(f.root)).records.get(taskId)?.created : undefined;
    const report = (summary: string, evidence: string[] = []) => successful(turn, "submit_report", { status: "completed", summary, evidence });
    if (turn.roleId === "chief") {
      if (task?.from === "chief" && task.taskKind !== "stage-request" && /\[工作结果\]|\[回交\]/.test(turn.text)) {
        if (!closed.has(task.taskId)) {
          await successful(turn, "close_created_task", { operationId: `w5-close-${task.taskId}`, taskId: task.taskId, outcome: "accepted" });
          closed.add(task.taskId);
        }
        return;
      }
      const { instance } = unwrap(await desktop.desktop.getDurableWorkflowProjection({ projectRoot: f.root, instanceId }));
      if ((instance?.action === "observe-existing" || instance?.action === "b1-impact-readonly") && !issued.has("B1")) {
        await successful(turn, "dispatch_task", { roleId: "convener", task: "Survey the existing threshold without changing it", flowId, workflowId: instanceId,
          taskKind: "stage-request", workflowPath: "B", stage: "B1", workflowAction: "advance", sideEffect: "read-only",
          requestedEvidence: [target], reason: "Confirm whether the tracked threshold requires the correction requested by the fixture customer" });
        issued.add("B1");
      } else if (instance?.action === "accept-b3-advance-with-b2-scope" && !issued.has("B3")) {
        await successful(turn, "dispatch_task", { roleId: "convener", task: "Implement the needed threshold correction", flowId, workflowId: instanceId,
          taskKind: "stage-request", workflowPath: "B", stage: "B3", workflowAction: "advance", sideEffect: "read-only",
          requestedEvidence: [target], reason: "Current read-only report proves one existing file needs the change" });
        issued.add("B3");
      } else if (instance?.action === "independent-standard" || instance?.action === "independent-assessment") {
        const step = instance.action === "independent-standard" ? "A12a" : "A12b";
        if (issued.has(step)) return;
        await successful(turn, "dispatch_task", { roleId: "verifier", task: `W5 independent ${step} for the existing threshold`, flowId,
          workflowId: instanceId, stage: step, sideEffect: "read-only" });
        issued.add(step);
      }
      return;
    }
    if (!task && turn.roleId === "convener" && beforeStopReport) {
      const view = unwrap(await desktop.desktop.getDurableWorkflowProjection({ projectRoot: f.root, instanceId }));
      assert.equal(view.instance?.action, "verify-stop");
      await beforeStopReport();
      await report("The actual inspection was closed and no project, Git or write effects remain outstanding.", [analysis]);
      return;
    }
    assert.ok(task && task.workflowId === instanceId, `Missing current task for ${turn.roleId}: ${turn.text}`);
    if (turn.roleId === "convener" && task.to === "convener") {
      assert.ok(task.stage === "B1" || task.stage === "B3");
      await successful(turn, "dispatch_task", { roleId: "worker", task: `External graph production ${task.stage} for ${target}`, flowId,
        workflowId: instanceId, stage: task.stage, sideEffect: task.stage === "B1" ? "read-only" : "code", moduleId: "core", modulePaths: [target] });
      return;
    }
    if (turn.roleId === "convener") {
      assert.equal(task.from, "convener");
      if (closed.has(task.taskId)) return;
      const outcome = onlyRead && task.stage === "B1" ? "rejected" : "accepted";
      await successful(turn, "close_created_task", { operationId: `w5-close-${task.taskId}`, taskId: task.taskId, outcome,
        note: outcome === "rejected" ? "No project change is needed; close the existing investigation" : "Accept current evidence" });
      closed.add(task.taskId);
      if (outcome === "accepted") await report("Operations verified the task's current evidence.", [task.stage === "B1" ? analysis : operatorReport]);
      return;
    }
    if (turn.roleId === "worker" && task.stage === "B1") {
      const initialRead = await trackedAndBusinessState(f.root);
      if (scenario === "bundled-b") assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
      else assert.deepEqual(initialRead, before, "third-graph read-only phase precedes any task branch or project write");
      await successful(turn, "read_file", { path: target });
      if (turn.toolNames.includes("write_file")) assert.equal((await turn.call("write_file", { path: target, content: "unauthorized" })).ok, false);
      if (turn.toolNames.includes("run_shell")) assert.equal((await turn.call("run_shell", { command: "git switch -c w5-invalid-readonly" })).ok, false);
      assert.deepEqual(await trackedAndBusinessState(f.root), initialRead);
      await report(onlyRead ? "Existing threshold needs no change." : "The existing threshold needs the scoped fix.", [analysis]);
      return;
    }
    if (turn.roleId === "worker" && task.stage === "B3") {
      assert.equal(onlyRead, false);
      await successful(turn, "write_file", { path: target, content: fix });
      assert.equal((await turn.call("write_file", { path: "src/outside.txt", content: "unauthorized" })).ok, false);
      await successful(turn, "run_shell", { command: `git add ${target}` });
      await successful(turn, "run_shell", { command: 'git commit -m "W5 existing threshold change"' });
      await report("Scoped code committed.", [target]);
      return;
    }
    if (turn.roleId === "verifier" && task.stage === "A12a") {
      await successful(turn, "write_file", { path: criteria, content: "# Independent criteria\n\nAC-1: Change only the approved threshold file.\n" });
      await report("Independent acceptance criteria saved.", [criteria]);
      return;
    }
    if (turn.roleId === "verifier" && task.stage === "A12b") {
      await successful(turn, "read_file", { path: target });
      await successful(turn, "write_file", { path: review, content: `# 独立验收\n\n结论：通过。\n\n当前候选 ${git(f.root, "rev-parse", "HEAD")} 对应当前标准。\n` });
      await report("Independent acceptance report about the committed candidate.", [review]);
      return;
    }
    assert.fail(`Unexpected role ${turn.roleId} received ${task.stage}`);
  }, log);
  return { model, bind(handle: Awaited<ReturnType<typeof app>>, id?: string, input?: Awaited<ReturnType<typeof trackedAndBusinessState>>) {
    desktop = handle;
    if (id !== undefined) instanceId = id;
    if (input !== undefined) before = input;
  } };
}

for (const branch of ["read-only", "authorized-write", "bundled-b"] as const) test(`Windows external graph executes its ${branch} branch`, native, async t => {
  const bundledB = branch === "bundled-b";
  const f = await fixture({ installLegacyPathB: !bundledB, existingIndependentRoster: !bundledB });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const scenario = externalModel(f, log, branch);
  const handle = await app(f, scenario.model, log, { pickWorkflowDefinition: async () => definitionPath });
  t.after(() => handle.close());
  scenario.bind(handle);
  const projectRoot = f.root;
  const selectedId = bundledB ? "path-b" : definitionId;
  const installed = bundledB ? await handle.desktop.copyDurableWorkflowPreset({ projectRoot, definitionId: selectedId })
    : await handle.desktop.importDurableWorkflow({ projectRoot });
  const imported = unwrap(installed);
  assert.equal(imported.id, selectedId);
  assert.equal(imported.version, bundledB ? 2 : 1);
  assert.match(imported.digest ?? "", /^[a-f0-9]{64}$/);
  const input = await readFile(bundledB ? new URL("../../../docs/workflows/path-b.yaml", import.meta.url) : definitionPath);
  assert.deepEqual(await readFile(path.join(f.root, "docs", "workflows", `${selectedId}.yaml`)), input);
  if (!bundledB) assert.equal((await handle.desktop.importDurableWorkflow({ projectRoot })).ok, false);
  const before = await trackedAndBusinessState(f.root);
  const initialRuntimeFiles = await applicationRuntimeFiles(f.root);
  const definition = { definitionId: selectedId, source: "project" as const, expectedDigest: imported.digest };
  const validation = unwrap(await handle.desktop.validateDurableWorkflow({ projectRoot, ...definition }));
  assert.equal(validation.digest, imported.digest);
  const staleSelection = await handle.startViaChief({ projectRoot, ...definition, expectedDigest: "0".repeat(64), enabled: true,
    requestId: "w5-no-stale-selection", summary: "A stale selection cannot start a new instance" });
  assert.equal(staleSelection.ok, false, JSON.stringify(staleSelection));
  if (!staleSelection.ok) assert.equal(staleSelection.code, "workflow-start-definition-changed");
  assert.equal((await readTaskState(f.root)).records.size, 0);
  log("external-stale-selection-rejected", staleSelection);
  const started = unwrap(await handle.startViaChief({ projectRoot, ...definition, enabled: true,
    requestId: `w5-external-${branch}`, summary: branch === "read-only" ? "Inspect the current threshold without changing it" : "Fix the existing threshold from 1 to 2" }));
  assert.ok(started.instance);
  const { instanceId } = started.instance;
  assert.equal(started.instance.definitionId, selectedId);
  assert.equal(started.instance.definitionDigest, imported.digest);
  const selector = { projectRoot, instanceId };
  let lastPhase: string | undefined;
  const projection = async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection(selector));
    const phase = JSON.stringify([view.controlPlane.state, view.instance?.stepId, view.instance?.status, view.instance?.engine]);
    if (phase !== lastPhase) {
      lastPhase = phase;
      log("external-projection-transition", view);
    }
    return view;
  };
  const snapshotOnFailure = async (error: unknown): Promise<never> => {
    log("external-run-incomplete", { projection: await projection(), tasks: (await readTaskState(f.root)).events,
      snapshot: sqliteSnapshot(f, instanceId), workspace: await trackedAndBusinessState(f.root) });
    throw error;
  };
  scenario.bind(handle, instanceId, before);
  log("external-definition-imported", { branch, definition: input.toString("utf8"), fileSha256: sha(input), imported, before, started });
  if (branch === "read-only") {
    const done = await until("imported graph's aliased read-only terminal", async () => {
      const view = (await projection()).instance;
      if (view?.status === "completed") return view;
    }, scenario.model.errors).catch(snapshotOnFailure);
    assert.equal(done.stepId, "inspections-delivered");
    const snapshot = sqliteSnapshot(f, instanceId);
    const kinds = (snapshot.effect ?? []).map(row => JSON.parse(String(row.data)).intent.kind as string);
    assert.equal(kinds.some(kind => ["baseline", "task-write", "task-commit", "release-merge"].includes(kind)), false);
    assert.deepEqual(await trackedAndBusinessState(f.root), before);
    assert.equal(handle.cards.size, 0);
    log("external-readonly-complete", { done, after: await trackedAndBusinessState(f.root), snapshot,
      applicationRuntimeFiles: { before: initialRuntimeFiles, after: await applicationRuntimeFiles(f.root) } });
    return;
  }

  const card = await until("trusted merge card after scoped change and independent archive", async () => {
    await projection();
    return [...handle.cards.values()].find(row => row.request.cardKind === "merge-main");
  }, scenario.model.errors).catch(snapshotOnFailure);
  assert.equal(card.request.application, true);
  assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
  let archive: string | undefined;
  if (!bundledB) {
    const archives = await readdir(path.join(f.root, "docs", "acceptance"));
    assert.equal(archives.length, 1);
    archive = await readFile(path.join(f.root, "docs", "acceptance", archives[0]), "utf8");
    assert.ok(archive.includes(sha(await readFile(path.join(f.root, criteria)))));
    assert.ok(archive.includes(sha(await readFile(path.join(f.root, review)))));
  }
  const approvedTip = git(f.root, "rev-parse", "HEAD");
  assert.equal((await handle.respond(card.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
  const merged = await until("imported graph's aliased delivery terminal", async () => {
    const view = (await projection()).instance;
    if (view?.status === "delivered" && view.delivery) return view;
  }, scenario.model.errors);
  assert.equal(merged.stepId, bundledB ? "delivered" : "applied-threshold-fix");
  const main = git(f.root, "rev-parse", "main");
  assert.ok(git(f.root, "rev-list", "--parents", "-n", "1", "main").split(" ").includes(approvedTip));
  assert.equal(git(f.root, "diff", "--name-only", f.baselineOid, main), target);
  assert.equal(git(f.root, "show", `main:${target}`), fix.trim());
  const delivery = { ...selector, deliveryId: merged.delivery!.id };
  const viewed = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
  const delivered = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: viewed.viewToken }));
  assert.equal(delivered.state, "delivered");
  log("external-authorized-write-complete", { archive, main, approvedTip, approvedRequest: card.id, delivered, snapshot: sqliteSnapshot(f, instanceId) });
});

test("Windows trusted importer rejects graphs that introduce or bypass authorization", native, async t => {
  const f = await fixture();
  const original = await readFile(definitionPath, "utf8");
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const model = modelFixture(async () => assert.fail("Invalid imported definitions must stay outside role execution"), log);
  const selected = "invalid-external-graph.yaml";
  const handle = await app(f, model, log, { pickWorkflowDefinition: async () => path.join(f.directory, selected) });
  t.after(() => handle.close());
  const before = await trackedAndBusinessState(f.root);
  const invalid = {
    unknownAction: original.replace("action: observe-existing", "action: execute-arbitrary-shell"),
    unknownRole: original.replace("role: module-owner", "role: invented-role"),
    unknownField: original.replace("action: observe-existing", "action: observe-existing\n    unrestricted: true"),
    duplicateKey: original.replace("version: 1", "version: 1\nversion: 2"),
    missingCondition: original.replace(/      needsFollowup: stop-for-research\r?\n/, ""),
    unboundedCycle: original.replace("needsFollowup: stop-for-research", "needsFollowup: inspect-threshold"),
    missingArchive: original.replace("accepted: archive-current-review", "accepted: decide-local-delivery"),
    bypassCustomer: original.replace("next: decide-local-delivery", "next: applied-threshold-fix"),
    bypassWriteTerminal: original.replace("accepted: archive-current-review", "accepted: publish-readonly-findings"),
  };
  for (const [reason, yaml] of Object.entries(invalid)) {
    assert.notEqual(yaml, original);
    await write(f.directory, selected, yaml);
    const denied = await handle.desktop.importDurableWorkflow({ projectRoot: f.root });
    assert.equal(denied.ok, false, `${reason} accepted: ${JSON.stringify(denied)}`);
    assert.deepEqual(await trackedAndBusinessState(f.root), before);
    log("external-import-rejected", { reason, denied });
  }
  assert.equal((await readTaskState(f.root)).records.size, 0);
});

test("Windows existing-change graph refuses a new empty project without creating a repository or tasks", native, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const model = modelFixture(async () => assert.fail("An ineligible new project must stay outside role execution"), log);
  const handle = await app(f, model, log, { pickWorkflowDefinition: async () => definitionPath });
  t.after(() => handle.close());
  const selection = { projectRoot: f.root, definitionId, source: "project" as const };
  const installed = unwrap(await handle.desktop.importDurableWorkflow({ projectRoot: f.root }));
  const rejected = await handle.startViaChief({ ...selection, enabled: true, requestId: "w5-new-project-ineligible",
    expectedDigest: installed.digest, summary: "Create a new module with no existing project baseline" });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "workflow-existing-change-unavailable");
  assert.equal((await readTaskState(f.root)).records.size, 0);
  await assert.rejects(access(path.join(f.root, ".git")), { code: "ENOENT" });
  log("existing-change-refused-on-empty-root", { installed, rejected, projectEntries: await readdir(f.root) });
});

test("Windows verified stop releases the original v2 owner for a different saved definition", native, async t => {
  const f = await fixture({ existingIndependentRoster: true });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const projectRoot = f.root;
  const yaml = await readFile(definitionPath, "utf8");
  const firstId = "external-stop-after-inspection";
  const nextId = "external-threshold-next-review";
  const firstFile = path.join(f.directory, "stop-first.yaml");
  const nextFile = path.join(f.directory, "new-definition.yaml");
  await write(f.directory, "stop-first.yaml", yaml.replace(`id: ${definitionId}`, `id: ${firstId}`)
    .replace("action: finish-readonly", "action: verify-stop").replace("terminal: completed", "terminal: stopped"));
  await write(f.directory, "new-definition.yaml", yaml.replace(`id: ${definitionId}`, `id: ${nextId}`));
  const reporting = Promise.withResolvers<void>();
  let atStop = false;
  const scenario = externalModel(f, log, "read-only", async () => { atStop = true; await reporting.promise; });
  const handle = await app(f, scenario.model, log, { pickWorkflowDefinition: async () => firstFile });
  t.after(() => { reporting.resolve(); return handle.close(); });
  scenario.bind(handle);
  const stopGraph = unwrap(await handle.desktop.importDurableWorkflow({ projectRoot }));
  const newData = path.join(f.directory, "next-controller");
  await mkdir(newData);
  const nextModel = modelFixture(async turn => assert.equal(turn.roleId, "chief"), log);
  const next = await app({ directory: newData, userDataRoot: path.join(newData, "data"), root: projectRoot }, nextModel, log,
    { pickWorkflowDefinition: async () => nextFile });
  t.after(() => next.close());
  const alternative = unwrap(await next.desktop.importDurableWorkflow({ projectRoot }));
  const initial = await trackedAndBusinessState(projectRoot);
  const started = unwrap(await handle.startViaChief({ projectRoot, definitionId: firstId, source: "project", expectedDigest: stopGraph.digest,
    requestId: "w5-stop-original", enabled: true, summary: "Inspect the existing threshold, then finish only after operations verifies no work remains" })).instance!;
  scenario.bind(handle, started.instanceId, initial);
  const startAlternative = () => next.startViaChief({ projectRoot, definitionId: nextId, source: "project", expectedDigest: alternative.digest,
    requestId: "w5-after-verified-stop", enabled: true, summary: "Begin a separate review after the earlier operation has come to a verified stop" });
  await until("actual stop-verification role before report submission", async () => atStop ? true : undefined, scenario.model.errors);
  const refused = await startAlternative();
  log("alternative-refused-before-original-stop", refused);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "workflow-owner-conflict");
  assert.deepEqual(await trackedAndBusinessState(projectRoot), initial);
  reporting.resolve();
  const stopped = await until("trusted operations report permits terminal stop", async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ projectRoot, instanceId: started.instanceId })).instance;
    if (view?.status === "stopped" && !(await (await handle.durable.store()).owner(projectRoot))) return view;
  }, scenario.model.errors);
  const rows = sqliteSnapshot(f, started.instanceId);
  assert.equal(rows.fact?.filter(row => String(row.business_key).startsWith("stop-verified:") && row.state === "consumed").length, 1);
  const nextStart = unwrap(await startAlternative()).instance!;
  assert.notEqual(nextStart.instanceId, started.instanceId);
  assert.equal(nextStart.definitionId, nextId);
  assert.equal(nextStart.action, "observe-existing");
  assert.deepEqual(await trackedAndBusinessState(projectRoot), initial);
  log("verified-stop-and-distinct-definition", { refused, stopped, rows, nextStart, alternative });
});

for (const deniedPurpose of ["new-work", "untracked-file"] as const) test(`Windows existing-change graph denies ${deniedPurpose} in an initialized repository`, native, async t => {
  const f = await fixture({ existingIndependentRoster: true });
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  let instanceId = "";
  let refusal: ToolResult | undefined;
  const model = modelFixture(async turn => {
    assert.equal(turn.roleId, "chief");
    const newWork = deniedPurpose === "new-work";
    refusal = await turn.call("dispatch_task", {
      roleId: "convener", task: newWork ? "Prepare an entirely new module" : "Check a file absent from the tracked tree",
      flowId, workflowId: instanceId, stage: newWork ? "A1" : "B1", taskKind: "stage-request", workflowPath: newWork ? "A" : "B",
      workflowAction: "advance", sideEffect: "read-only",
      ...(newWork ? {} : { requestedEvidence: ["src/core/absent.ts"], reason: "Verify whether this claimed existing file is actually tracked" }),
    });
    assert.equal(refusal.ok, false, refusal.message);
  }, log);
  const handle = await app(f, model, log, { pickWorkflowDefinition: async () => definitionPath });
  t.after(() => handle.close());
  const projectRoot = f.root;
  const definition = unwrap(await handle.desktop.importDurableWorkflow({ projectRoot }));
  const before = await trackedAndBusinessState(projectRoot);
  const started = unwrap(await handle.startViaChief({ projectRoot, definitionId, source: "project", expectedDigest: definition.digest,
    requestId: `w5-existing-purpose-${deniedPurpose}`, enabled: true,
    summary: deniedPurpose === "new-work" ? "Use the full new-work governance to create an unrelated new module" : "Review the purported current behavior in src/core/absent.ts" }));
  assert.ok(started.instance);
  instanceId = started.instance.instanceId;
  const rejection = await until("the actual chief tool refusal", async () => refusal, model.errors);
  assert.equal(rejection.ok, false);
  if (deniedPurpose === "new-work") assert.match(rejection.message ?? "", /workflow-existing-purpose-unverified/);
  const view = unwrap(await handle.desktop.getDurableWorkflowProjection({ projectRoot, instanceId }));
  assert.equal(view.instance?.action, "observe-existing");
  const snapshot = sqliteSnapshot(f, instanceId);
  assert.equal(snapshot.fact?.some(row => String(row.business_key).startsWith("existing-purpose:")), false);
  assert.equal(snapshot.effect?.some(row => String(row.business_key).startsWith("git:baseline")), false);
  assert.equal((await readTaskState(projectRoot)).records.size, 0);
  assert.deepEqual(await trackedAndBusinessState(projectRoot), before);
  log("existing-purpose-tool-refused", { deniedPurpose, rejection, view, before, snapshot });
});
