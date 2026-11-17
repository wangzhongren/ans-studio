import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { MERGE_MAIN_OPTION_IDS } from "../../../app/desktop/customer-input.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { app, businessDb, daprdListener, emptyFixture, git, modelFixture, resourceRoot, sqliteSnapshot,
  successful, target, until, unwrap, write, type Log, type ModelTurn } from "./fixture.ts";

const windowsDapr = { skip: !resourceRoot && "Set ANS_W5_DAPR_ROOT to the verified Windows bundle resources", timeout: 300_000 };
const flowId = "snake";
const intentId = "snake-intent";
const goal = "Build one local threshold module";
const baselineInterruption = "w5-a9-after-git-before-effect";
const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");
const paths = {
  intent: `docs/product/${flowId}-intent-v1.md`, entry: `docs/intents/${intentId}.md`, proposal: `docs/proposals/${flowId}-proposal-v1.md`,
  modules: `docs/proposals/${flowId}-modules-v1.md`, roster: `docs/proposals/${flowId}-roster-v1.md`,
  architecture: `docs/contracts/${flowId}-architecture-v1.md`, plan: `docs/scheduling/${flowId}-team-v1.md`,
  criteria: `docs/quality/${flowId}-criteria-v1.md`, review: `docs/quality/${flowId}-report-v1.md`,
};

const header = (schema: string, extra: string) => `---\nschema: ${schema}\nflowId: ${flowId}\nversion: 1\n${extra}\n---\n`;
const moduleRow = `  - id: core\n    name: Core\n    purpose: Local threshold\n    path: src/core/\n    category: core\n    publicContract: ${target}\n    architectureSource: ${paths.architecture}`;
const moduleList = header("project-modules/v2", `modules:\n${moduleRow}`) + "# Modules\n";
const roster = header("project-roster/v4", `intent: ${paths.intent}\nproposal: ${paths.proposal}\narchitecture: ${paths.architecture}\nenvBootstrap:\n  omitted: true\n  omissionReason: Local native workflow fixture\nroles:\n  - id: worker\n    displayName: Worker\n    purpose: Core implementation\n    capability: TypeScript\n    modules: [core]\nmodules:\n${moduleRow}`)
  + "# Roster\n## 人员+模块拓扑图\n```topology\nschema: project-topology/v2\nmanagement: [convener, worker]\nmodules:\n  - id: core\n    path: src/core/\n    roleId: worker\nroles:\n  - id: worker\n    modules: [core]\n```\n";
const roleFiles = {
  card: { path: "角色卡/worker/role-card.md", content: "---\nroleId: worker\ndisplayName: Worker\n---\n# Core implementation\n" },
  boundaryMd: { path: "角色卡/worker/boundary.md", content: "# 边界\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 目录 | `src/core/` | Core |\n" },
  boundaryYaml: { path: "角色卡/worker/boundary.yaml", content: "role: worker\nentries:\n  - root: project\n    path: src/core/\n    kind: directory\n    purpose: Core\n" },
};

const stageByAction: Readonly<Record<string, string>> = {
  "product-prepare": "A1", "author-intent": "A2", "planning-prepare": "A4", "author-proposal": "A5",
  "personnel-prepare": "A7", "activate-roles": "A8", "team-baseline": "A9", "independent-standard": "A12a",
  "governed-implementation": "A11", "independent-assessment": "A12b",
};
const productionByStage: Readonly<Record<string, string>> = { A1: "product", A2: "product", A4: "rapporteur", A5: "rapporteur", A7: "nominator", A8: "nominator", A11: "worker" };
const cardsByAction: Readonly<Record<string, { kind: string; choices: readonly string[]; approved: string }>> = {
  "confirm-intent": { kind: "intent-confirm", choices: ["confirm", "revise"], approved: "confirm" },
  "confirm-proposal": { kind: "proposal", choices: ["accept", "revise", "reject"], approved: "accept" },
  "confirm-appointment": { kind: "appointment", choices: ["worker"], approved: "worker" },
};

async function exists(file: string) {
  return access(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  });
}

async function assertContenderBlocked(f: Awaited<ReturnType<typeof emptyFixture>>, log: Log, checkpoint: string, projectRoot = f.root) {
  const before = await readTaskState(projectRoot);
  const directory = path.join(f.directory, `contender-${checkpoint}`);
  await mkdir(directory);
  const isolatedContender = { directory, root: projectRoot, userDataRoot: path.join(directory, "data") };
  const childScript = `
    import { app, modelFixture } from ${JSON.stringify(new URL("./fixture.ts", import.meta.url).href)};
    const input = JSON.parse(process.argv[1]);
    const turns = [];
    const model = modelFixture(async turn => { turns.push(turn.roleId); }, () => {});
    const handle = await app(input, model, () => {});
    try {
      const result = await handle.desktop.startDurableWorkflow({ projectRoot: input.root, definitionId: "path-a",
        source: "preset", enabled: true, requestId: "w5-contender", summary: "An independent window requests the occupied project" });
      process.stdout.write("W5_CONTENDER " + JSON.stringify({ pid: process.pid, result, turns }) + "\\n");
    } finally { await handle.close(); }
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", childScript, JSON.stringify(isolatedContender)],
    { windowsHide: true, timeout: 45_000 });
  const result = stdout.split(/\r?\n/).find(line => line.startsWith("W5_CONTENDER "));
  assert.ok(result, stdout);
  const resultData = JSON.parse(result.slice("W5_CONTENDER ".length));
  assert.notEqual(resultData.pid, process.pid);
  assert.equal(resultData.result.ok, false, JSON.stringify(resultData));
  assert.equal(resultData.result.code, "workflow-workspace-busy");
  assert.deepEqual(resultData.turns, []);
  assert.deepEqual((await readTaskState(projectRoot)).events, before.events, "a blocked competing app must not add a task or approval");
  log("cross-process-owner-conflict", { checkpoint, originalPid: process.pid, contenderAppData: isolatedContender.userDataRoot, contender: resultData });
}

for (const checkpoint of ["intent-reopen", "baseline-recovery", "full-chain", "release-recovery"] as const) test(`Native Windows external Path A from empty directory: ${checkpoint}`, windowsDapr, async t => {
  const f = await emptyFixture();
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  log("empty-project-input", { ...f, initialEntries: await readdir(f.root) });
  assert.deepEqual(await readdir(f.root), []);
  const scenario = newPathAModel(f, log, checkpoint === "baseline-recovery");
  let handle = await app(f, scenario.model, log);
  scenario.bind(handle);
  t.after(async () => { scenario.pauseForRestart(); scenario.unblockFixture(); await handle.close(); });
  const definition = { projectRoot: f.root, definitionId: "path-a" };
  const projectDefinition = checkpoint === "intent-reopen"
    ? unwrap(await handle.desktop.copyDurableWorkflowPreset(definition))
    : undefined;
  const startRequest = { ...definition,
    source: projectDefinition ? "project" : "preset", expectedDigest: projectDefinition?.digest, enabled: true,
    requestId: `w5-path-a-${checkpoint}`, summary: "Create an isolated local threshold module from an empty project" };
  const result = unwrap(await handle.desktop.startDurableWorkflow(startRequest));
  assert.ok(result.instance);
  const { instanceId, projectId, definitionDigest } = result.instance;
  scenario.bind(handle, instanceId);
  const selector = { projectRoot: f.root, instanceId };
  let lastPhase: string | undefined;
  const projection = async () => {
    const view = unwrap(await handle.desktop.getDurableWorkflowProjection(selector));
    const phase = JSON.stringify([view.controlPlane.state, view.instance?.stepId, view.instance?.status, view.instance?.engine, view.instance?.blockedReason]);
    if (phase !== lastPhase) {
      lastPhase = phase;
      log("path-a-projection-transition", view);
    }
    return view;
  };
  const cardOf = (kind: string) => until(`real ${kind} card`, async () => {
    await projection();
    return [...handle.cards.values()].find(card => card.request.cardKind === kind);
  }, scenario.model.errors).catch(async error => {
    log("path-a-card-not-reached", { kind, projection: await projection(), tasks: (await readTaskState(f.root)).events,
      sqlite: sqliteSnapshot(f, instanceId), gitExists: await exists(path.join(f.root, ".git")) });
    throw error;
  });
  const reopen = async (whileStopped?: () => void) => {
    scenario.pauseForRestart();
    await handle.close();
    whileStopped?.();
    handle = await app(f, scenario.model, log);
    scenario.bind(handle);
    scenario.resume();
    const after = await until("reopened native sidecar", () => daprdListener(f), scenario.model.errors);
    const view = (await projection()).instance;
    assert.equal(view?.instanceId, instanceId);
    assert.equal(view?.projectId, projectId);
    assert.equal(view?.definitionDigest, definitionDigest);
    return after;
  };
  const reopenPendingCard = async (card: Awaited<ReturnType<typeof cardOf>>, kind: string) => {
    const before = await daprdListener(f);
    assert.ok(before);
    const after = await reopen();
    assert.notEqual(after.pid, before.pid);
    const resumed = await cardOf(kind);
    assert.equal(resumed.id, card.id);
    assert.deepEqual(resumed.request, card.request);
    log("original-pending-card-restored", { kind, before, after, resumed, sqlite: sqliteSnapshot(f, instanceId) });
    return resumed;
  };
  const intentCard = await cardOf("intent-confirm");
  assert.equal(await exists(path.join(f.root, ".git")), false);
  if (!projectDefinition) assert.equal(await exists(path.join(f.root, "docs/workflows/path-a.yaml")), false);
  const product = await readFile(path.join(f.root, paths.intent));
  await access(path.join(f.root, paths.entry));
  const created = (await readTaskState(f.root)).events.find(event => event.kind === "request.created" && event.requestId === intentCard.id);
  assert.ok(created?.kind === "request.created");
  assert.equal(created.documentRefs?.find(document => document.path === paths.intent)?.sha256, sha256(product));
  log("a3-before-git", { id: intentCard.id, request: intentCard.request, intentSha: sha256(product), sqlite: sqliteSnapshot(f, instanceId) });
  if (checkpoint === "intent-reopen") {
    await assertContenderBlocked(f, log, "before-git");
    const replay = unwrap(await handle.desktop.startDurableWorkflow(startRequest));
    assert.equal(replay.instance?.instanceId, instanceId);
    const conflict = await handle.desktop.startDurableWorkflow({ ...startRequest, summary: "Different request under the original key" });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "start-key-conflict");
    log("same-start-key-identity-and-conflict", { replay, conflict });
    const yamlPath = "docs/workflows/path-a.yaml";
    const originalYaml = await readFile(path.join(f.root, yamlPath), "utf8");
    const brokenYaml = originalYaml.replace("action: product-prepare", "action: unregistered-w5-action");
    assert.notEqual(brokenYaml, originalYaml);
    await write(f.root, yamlPath, brokenYaml);
    const rejected = await handle.desktop.validateDurableWorkflow({ ...definition, source: "project" });
    assert.equal(rejected.ok, false, JSON.stringify(rejected));
    log("selected-project-definition-invalid", { original: sha256(originalYaml), broken: sha256(brokenYaml), rejected });
    const resumed = await reopenPendingCard(intentCard, "intent-confirm");
    assert.equal(await exists(path.join(f.root, ".git")), false);
    assert.equal((await handle.respond(resumed.id, "confirm")).ok, true);
    const advanced = await until("original intent approval consumed", async () => {
      const view = (await projection()).instance;
      if (view && view.action !== "confirm-intent") return view;
    }, scenario.model.errors);
    const resolutions = (await readTaskState(f.root)).events.filter(event => event.kind === "request.resolved" && event.requestId === resumed.id);
    assert.equal(resolutions.length, 1);
    log("a3-restored-original-no-git", { advanced, sqlite: sqliteSnapshot(f, instanceId) });
    return;
  }

  assert.equal((await handle.respond(intentCard.id, "confirm")).ok, true);
  const proposalCard = await reopenPendingCard(await cardOf("proposal"), "proposal");
  assert.equal(await exists(path.join(f.root, ".git")), false);
  const proposalRequest = (await readTaskState(f.root)).events.find(event => event.kind === "request.created" && event.requestId === proposalCard.id);
  assert.ok(proposalRequest?.kind === "request.created");
  const proposalDocuments = [paths.intent, paths.proposal, paths.modules, paths.roster, paths.architecture];
  assert.equal(proposalRequest.documentRefs?.length, proposalDocuments.length);
  for (const filename of proposalDocuments) {
    assert.equal(proposalRequest.documentRefs?.find(document => document.path === filename)?.sha256,
      sha256(await readFile(path.join(f.root, filename))));
  }
  if (checkpoint === "baseline-recovery") {
    assert.match(instanceId, /^dw-[0-9a-f]+$/);
    // Abort only the fixture SQLite write of the actual Git success. The app still
    // performs and verifies its original Git and team-plan operations.
    businessDb(f, db => db.exec(`
      CREATE TRIGGER w5_interrupt_baseline BEFORE UPDATE OF state ON effect
      WHEN NEW.instance_id = '${instanceId}' AND NEW.business_key LIKE 'git:baseline:%' AND NEW.state = 'succeeded'
      BEGIN SELECT RAISE(ABORT, '${baselineInterruption}'); END;
    `), true);
  }
  assert.equal((await handle.respond(proposalCard.id, "accept")).ok, true);
  let recoveredBaseline: string | undefined;
  if (checkpoint === "baseline-recovery") {
    const interrupted = await until("actual task ref before baseline success can be recorded", async () => {
      if (!scenario.baselineInterrupted || !await exists(path.join(f.root, ".git"))) return;
      const effects = sqliteSnapshot(f, instanceId).effect?.filter(row => String(row.business_key).startsWith("git:baseline:"));
      assert.equal(effects?.length, 1);
      assert.equal(effects?.[0].state, "claimed");
      assert.equal((await projection()).instance?.action, "team-baseline");
      assert.equal(git(f.root, "symbolic-ref", "--short", "HEAD"), `ans/task/${instanceId}`);
      return { oid: git(f.root, "rev-parse", "HEAD"), refs: git(f.root, "show-ref"), effects };
    }, scenario.model.errors);
    assert.equal([...handle.cards.values()].some(card => card.request.cardKind === "appointment"), false);
    await assertContenderBlocked(f, log, "git-written-before-baseline-bookkeeping");
    const before = await daprdListener(f);
    assert.ok(before);
    const after = await reopen(() => businessDb(f, db => db.exec("DROP TRIGGER w5_interrupt_baseline"), true));
    assert.notEqual(after.pid, before.pid);
    assert.equal(git(f.root, "show-ref"), interrupted.refs);
    recoveredBaseline = interrupted.oid;
    log("a9-actual-refs-before-ledger-and-reopen", { interrupted, before, after });
  }
  const appointment = await cardOf("appointment");
  assert.equal(await exists(path.join(f.root, ".git")), true);
  assert.equal(git(f.root, "symbolic-ref", "--short", "HEAD"), `ans/task/${instanceId}`);
  const baselineOid = git(f.root, "rev-parse", "HEAD");
  await access(path.join(f.root, ".gitignore"));
  assert.match(git(f.root, "show", "-s", "--format=%s", baselineOid), /ANS baseline/);
  assert.equal(git(f.root, "ls-files", "--", ".ans/state"), "", "shared ownership state must be absent from the Git baseline");
  if (recoveredBaseline) {
    assert.equal(baselineOid, recoveredBaseline);
    const settled = sqliteSnapshot(f, instanceId).effect?.filter(row => String(row.business_key).startsWith("git:baseline:"));
    assert.equal(settled?.length, 1);
    assert.equal(settled?.[0].state, "succeeded");
    log("a9-single-recovered-baseline", { baselineOid, settled, appointmentId: appointment.id, sqlite: sqliteSnapshot(f, instanceId) });
    return;
  }
  await assertContenderBlocked(f, log, "after-git");
  const otherWorktree = path.join(f.directory, "other-worktree");
  git(f.root, "worktree", "add", "--detach", otherWorktree, baselineOid);
  assert.equal(git(otherWorktree, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    git(f.root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  await assertContenderBlocked(f, log, "same-common-dir-other-worktree", otherWorktree);
  const beforeA10Replay = await daprdListener(f);
  assert.ok(beforeA10Replay);
  process.kill(beforeA10Replay.pid, "SIGKILL");
  await until("the isolated sidecar exits", async () => await daprdListener(f) ? undefined : true, scenario.model.errors);
  const appointmentDecision = await handle.respond(appointment.id, ["worker"]);
  assert.equal(appointmentDecision.ok, true, JSON.stringify(appointmentDecision));
  const pendingConsumption = sqliteSnapshot(f, instanceId);
  const decisionKey = `card-decided:${appointment.id}`;
  assert.equal(pendingConsumption.fact?.filter(row => row.business_key === decisionKey && row.state === "pending").length, 1);
  assert.equal(pendingConsumption.outbox?.filter(row => row.business_key === decisionKey).length, 1);
  const afterA10Replay = await reopen();
  assert.notEqual(afterA10Replay.pid, beforeA10Replay.pid);
  await until("original appointment decision consumed", async () => {
    const rows = sqliteSnapshot(f, instanceId).fact?.filter(row => row.business_key === decisionKey) ?? [];
    return rows.length === 1 && rows[0].state === "consumed" ? true : undefined;
  }, scenario.model.errors);
  assert.equal(handle.cards.has(appointment.id), false);
  log("a10-original-decision-replayed", { decisionKey, beforeA10Replay, afterA10Replay, pendingConsumption, after: sqliteSnapshot(f, instanceId) });
  const release = await cardOf("merge-main");
  const archives = await readdir(path.join(f.root, "docs", "acceptance"));
  assert.equal(archives.length, 1);
  const archive = await readFile(path.join(f.root, "docs", "acceptance", archives[0]), "utf8");
  assert.ok(archive.includes(sha256(await readFile(path.join(f.root, paths.criteria)))));
  assert.ok(archive.includes(sha256(await readFile(path.join(f.root, paths.review)))));
  const branchTip = git(f.root, "rev-parse", "HEAD");
  const taskEvents = (await readTaskState(f.root)).events;
  const standardOpened = taskEvents.findIndex(event => event.kind === "task.created" && event.stage === "A12a");
  const implementationOpened = taskEvents.findIndex(event => event.kind === "task.created" && event.stage === "A11" && event.to === "worker");
  assert.ok(standardOpened >= 0 && implementationOpened > standardOpened);
  log("a13-ready-with-current-proof", { baselineOid, branchTip, taskEvents, archive, before: await projection(), sqlite: sqliteSnapshot(f, instanceId) });
  let mergeBeforeSettlement: string | undefined;
  const releaseEffects = (snapshot: ReturnType<typeof sqliteSnapshot>) =>
    snapshot.effect?.filter(row => String(row.business_key).startsWith("release-merge:")) ?? [];
  if (checkpoint === "release-recovery") {
    assert.match(instanceId, /^dw-[0-9a-f]+$/);
    businessDb(f, db => db.exec(`
      CREATE TRIGGER w5_interrupt_a13 BEFORE UPDATE OF state ON effect
      WHEN NEW.instance_id = '${instanceId}' AND NEW.business_key LIKE 'release-merge:%' AND NEW.state = 'succeeded'
      BEGIN SELECT RAISE(ABORT, 'w5-a13-after-merge-before-effect'); END;
    `), true);
    const beforeApproval = await daprdListener(f);
    assert.ok(beforeApproval);
    process.kill(beforeApproval.pid, "SIGKILL");
    await until("the original A13 sidecar exits", async () => await daprdListener(f) ? undefined : true, scenario.model.errors);
    assert.equal((await handle.respond(release.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
    const savedDecision = sqliteSnapshot(f, instanceId);
    const approvalKey = `release-decision:${release.id}`;
    assert.equal(savedDecision.fact?.filter(row => row.business_key === approvalKey && row.state === "pending").length, 1);
    assert.equal(savedDecision.outbox?.filter(row => row.business_key === approvalKey).length, 1);
    assert.equal(git(f.root, "rev-parse", "main"), baselineOid);
    assert.equal(releaseEffects(savedDecision).length, 0);
    const afterApproval = await reopen();
    assert.notEqual(afterApproval.pid, beforeApproval.pid);
    log("a13-approval-persisted-before-merge", { beforeApproval, afterApproval, approvalKey, savedDecision });
    const partial = await until("the original merge changes main with its success receipt interrupted", async () => {
      const head = git(f.root, "rev-parse", "main");
      if (head === baselineOid) return;
      const raw = sqliteSnapshot(f, instanceId);
      const effects = releaseEffects(raw);
      assert.equal(effects.length, 1);
      assert.ok(effects[0].state === "claimed" || effects[0].state === "unknown");
      assert.equal(raw.fact?.filter(row => row.business_key === `release-result:${release.id}`).length, 0);
      assert.equal(raw.delivery_note?.length, 0);
      return { head, raw };
    }, scenario.model.errors);
    mergeBeforeSettlement = partial.head;
    const afterMerge = await reopen(() => businessDb(f, db => db.exec("DROP TRIGGER w5_interrupt_a13"), true));
    assert.notEqual(afterMerge.pid, afterApproval.pid);
    log("a13-original-merge-before-settlement", { partial, afterApproval, afterMerge });
  } else {
    assert.equal((await handle.respond(release.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
  }
  const done = await until("A13 merged and delivery explanation pending", async () => {
    const view = (await projection()).instance;
    if (view?.status === "delivered" && view.delivery?.state === "pending") return view;
  }, scenario.model.errors);
  const mergeOid = git(f.root, "rev-parse", "main");
  if (mergeBeforeSettlement) assert.equal(mergeOid, mergeBeforeSettlement);
  assert.ok(git(f.root, "rev-list", "--parents", "-n", "1", "main").split(" ").includes(branchTip));
  assert.equal(git(f.root, "diff", "--name-only", baselineOid, mergeOid), target);
  assert.equal(await exists(path.join(f.root, "src/outside.txt")), false);
  const delivery = { ...selector, deliveryId: done.delivery!.id };
  const viewing = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
  const acknowledged = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: viewing.viewToken }));
  assert.equal(acknowledged.state, "delivered");
  const settled = sqliteSnapshot(f, instanceId);
  assert.deepEqual(releaseEffects(settled).map(row => row.state), ["succeeded"]);
  assert.equal(settled.fact?.filter(row => row.business_key === `release-result:${release.id}`).length, 1);
  log("path-a-delivery", { done, mergeOid, approved: release.id, acknowledged, sqlite: settled });
});

function taskInPrompt(text: string) {
  return /(?:任务编号：|任务：|任务 )#?([a-zA-Z0-9-]+)/.exec(text)?.[1];
}

async function writeAs(turn: ModelTurn, pathname: string, content: string) {
  await successful(turn, "write_file", { path: pathname, content });
}

async function reportAs(turn: ModelTurn, summary: string, evidence: string[] = []) {
  await successful(turn, "submit_report", { status: "completed", summary, evidence });
}

function newPathAModel(f: Awaited<ReturnType<typeof emptyFixture>>, log: Log, interruptBaseline: boolean) {
  let desktop: Awaited<ReturnType<typeof app>>;
  let instanceId = "";
  let closingForRestart = false;
  let baselineInterrupted = false;
  const implementationStarted = Promise.withResolvers<void>();
  const standardsClosed = Promise.withResolvers<void>();
  const issuedStageRequests = new Set<string>();
  const recorded = new Set<string>();
  const sha = async (relative: string) => sha256(await readFile(path.join(f.root, relative)));
  const current = () => desktop.desktop.getDurableWorkflowProjection({ projectRoot: f.root, instanceId }).then(unwrap);

  async function servedTask(turn: ModelTurn, stage: string) {
    const taskId = taskInPrompt(turn.text);
    assert.ok(taskId, `Expected a real task identifier in ${turn.roleId} ${stage} prompt: ${turn.text}`);
    const task = (await readTaskState(f.root)).records.get(taskId)?.created;
    assert.ok(task);
    assert.equal(task.workflowId, instanceId);
    return task;
  }

  async function requestStage(turn: ModelTurn, stage: string, targetRole: string) {
    if (issuedStageRequests.has(stage)) return;
    const direct = stage === "A12a" || stage === "A12b";
    await successful(turn, "dispatch_task", { roleId: targetRole, task: `W5 request ${stage} for a local threshold example`, flowId,
      workflowId: instanceId, stage, sideEffect: "read-only",
      ...(!direct ? { taskKind: "stage-request", workflowPath: "A", workflowAction: "advance" } : {}) });
    issuedStageRequests.add(stage);
  }

  async function askChief(turn: ModelTurn, action: string) {
    const card = cardsByAction[action];
    if (!card) {
      const stage = stageByAction[action];
      if (stage) await requestStage(turn, stage, stage === "A12a" || stage === "A12b" ? "verifier" : "convener");
      return;
    }
    if (action === "confirm-intent" && !await exists(path.join(f.root, paths.entry))) {
      await writeAs(turn, paths.entry, `---\nintentId: ${intentId}\nflowId: ${flowId}\ngoal: ${goal}\n---\n# Intent entry\n`);
    }
    const result = await turn.call("request_choice", { title: `W5 ${card.kind}`, question: "Confirm this isolated project fact?", flowId,
      cardKind: card.kind, options: card.choices.map(id => ({ id, label: id, ...(id === card.approved ? { recommended: true } : {}) })),
      ...(card.kind === "intent-confirm" ? { intentId } : {}), ...(card.kind === "appointment" ? { multiple: true } : {}) });
    if (!closingForRestart) assert.equal(result.ok, true, result.message);
  }

  async function closeAs(turn: ModelTurn, taskId: string, stage: string) {
    if (recorded.has(taskId)) return;
    await successful(turn, "close_created_task", { operationId: `w5-close-${taskId}`, taskId, outcome: "accepted", note: `Verified ${stage}` });
    recorded.add(taskId);
  }

  async function runOperations(turn: ModelTurn, task: Awaited<ReturnType<typeof servedTask>>) {
    const stage = task.stage!;
    if (task.from === "convener") {
      await closeAs(turn, task.taskId, stage);
      if (stage === "A11") await reportAs(turn, "Operations accepted the exact committed implementation.", [target]);
      return;
    }
    assert.equal(task.to, "convener");
    if (stage === "A9") {
      assert.equal(await exists(path.join(f.root, ".git")), false);
      const modulesSha = await sha(paths.modules);
      const rosterSha = await sha(paths.roster);
      await writeAs(turn, paths.plan, header("teamPlanSchema:3", `modules:\n  path: ${paths.modules}\n  sha256: ${modulesSha}\nroster:\n  path: ${paths.roster}\n  sha256: ${rosterSha}\nroleRows:\n  - roleId: worker\n    modules: [core]\n    writesets: [src/core/]\n    dependsOn: []`) + "# Team plan\n");
      const request = { operationId: "w5-a9-git-baseline", flowId, workflowId: instanceId,
        plan: { path: paths.plan, version: 1, sha256: await sha(paths.plan) } };
      if (interruptBaseline) {
        const result = await turn.call("complete_team_plan", request).catch(error => ({ ok: false, message: String(error) }));
        assert.equal(result.ok, false);
        assert.ok(result.message?.includes(baselineInterruption) || result.message?.includes("结果未知或回执不完整"), result.message);
        baselineInterrupted = true;
        return;
      }
      await successful(turn, "complete_team_plan", request);
      await reportAs(turn, "A9 baseline prepared by the application.", [paths.plan]);
      return;
    }
    const recipient = productionByStage[stage];
    assert.ok(recipient, `Unexpected operations stage ${stage}`);
    await successful(turn, "dispatch_task", { roleId: recipient, task: `W5 production ${stage}`, flowId, workflowId: instanceId,
      stage, sideEffect: stage === "A11" ? "code" : "docs",
      ...(stage === "A11" ? { moduleId: "core", modulePaths: [target] } : {}) });
    if (stage !== "A11") await reportAs(turn, `Operations dispatched ${stage}.`);
  }

  async function produce(turn: ModelTurn, stage: string) {
    if (stage === "A1" || stage === "A4" || stage === "A7") {
      await reportAs(turn, `${stage} preparation received.`);
      return;
    }
    if (stage === "A2") {
      await writeAs(turn, paths.intent, header("project-intent/v1", `intentId: ${intentId}\ngoal: ${goal}`) + "# Project intent\nOne isolated local threshold module.\n");
      await reportAs(turn, "Product intent is ready for customer decision.", [paths.intent]);
      return;
    }
    if (stage === "A5") {
      await writeAs(turn, paths.proposal, header("project-proposal/v2", `intent: ${paths.intent}`) + "# Proposal\nBuild one bounded local module.\n");
      await writeAs(turn, paths.modules, moduleList);
      await writeAs(turn, paths.roster, roster);
      await writeAs(turn, paths.architecture, header("project-architecture/v1", `proposal: ${paths.proposal}`) + `# Architecture\nproposal: ${paths.proposal}\n`);
      await reportAs(turn, "Proposal, modules, roster and architecture are ready.", [paths.proposal, paths.modules, paths.roster, paths.architecture]);
      return;
    }
    if (stage === "A8") {
      assert.equal(await exists(path.join(f.root, ".git")), false);
      for (const { path, content } of Object.values(roleFiles)) await writeAs(turn, path, content);
      const decision = (await readTaskState(f.root)).events.find(event => event.kind === "request.resolved" && event.cardKind === "proposal"
        && event.workflowId === instanceId);
      assert.ok(decision?.kind === "request.resolved" && decision.decisionId, "Expected bound A6 customer decision for activation");
      const documents: Record<string, { path: string; sha256: string }> = {};
      for (const [key, doc] of Object.entries(roleFiles)) documents[key] = { path: doc.path, sha256: await sha(doc.path) };
      await successful(turn, "activate_role_documents", { operationId: "w5-a8-worker", flowId, workflowId: instanceId,
        proposalDecisionId: decision.decisionId, targetRoleId: "worker", roster: { path: paths.roster, sha256: await sha(paths.roster) }, documents });
      await reportAs(turn, "Worker role documents were activated.", Object.values(roleFiles).map(doc => doc.path));
      return;
    }
    if (stage === "A12a") {
      await implementationStarted.promise;
      await writeAs(turn, paths.criteria, "# Independent criteria\n\n- AC-1: Only the approved module is changed in the reviewed commit.\n");
      await reportAs(turn, "Independent standard delivered during A11.", [paths.criteria]);
      log("a12a-report-while-a11-active", { task: taskInPrompt(turn.text), criteriaSha: await sha(paths.criteria) });
      return;
    }
    if (stage === "A11") {
      implementationStarted.resolve();
      await writeAs(turn, target, "export const SNAKE = 2;\n");
      const illegal = await turn.call("write_file", { path: "src/outside.txt", content: "unauthorized" });
      assert.equal(illegal.ok, false);
      await successful(turn, "run_shell", { command: `git add ${target}` });
      await successful(turn, "run_shell", { command: 'git commit -m "W5 initial implementation"' });
      await standardsClosed.promise;
      await reportAs(turn, "Implementation committed within the approved code module.", [target]);
      return;
    }
    if (stage === "A12b") {
      await successful(turn, "read_file", { path: target });
      await successful(turn, "read_file", { path: paths.criteria });
      await writeAs(turn, paths.review, `# 独立验收报告\n\n结论：通过。\n\n本次提交 ${git(f.root, "rev-parse", "HEAD")} 与已收口标准的静态证据对应。\n`);
      await reportAs(turn, "Independent assessment passes the current candidate.", [paths.review]);
      return;
    }
    assert.fail(`Unexpected production stage ${stage} for ${turn.roleId}`);
  }

  const model = modelFixture(async turn => {
    const taskId = taskInPrompt(turn.text);
    const task = taskId === undefined ? undefined : (await readTaskState(f.root)).records.get(taskId)?.created;
    if (turn.roleId === "chief") {
      if (task && task.from === "chief" && /\[工作结果\]|\[回交\]/.test(turn.text)) {
        await closeAs(turn, task.taskId, task.stage!);
        if (task.stage === "A12a") standardsClosed.resolve();
        return;
      }
      const { instance } = await current();
      assert.ok(instance?.action, `Missing live action in chief turn ${turn.text}`);
      await askChief(turn, instance.action);
      return;
    }
    const bound = await servedTask(turn, task?.stage ?? "unidentified");
    if (turn.roleId === "convener") await runOperations(turn, bound);
    else {
      assert.equal(bound.to, turn.roleId);
      await produce(turn, bound.stage!);
    }
  }, log);
  return { model,
    get baselineInterrupted() { return baselineInterrupted; },
    bind(handle: Awaited<ReturnType<typeof app>>, id?: string) { desktop = handle; if (id !== undefined) instanceId = id; },
    pauseForRestart() { closingForRestart = true; },
    resume() { closingForRestart = false; },
    unblockFixture() { implementationStarted.resolve(); standardsClosed.resolve(); },
  };
}
