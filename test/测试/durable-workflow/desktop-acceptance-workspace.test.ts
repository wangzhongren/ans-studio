import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { get as httpGet } from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type * as WorkspaceApi from "../../../app/desktop/durable-acceptance-workspace.ts";
import type { DesktopDurableWorkflow } from "../../../app/desktop/durable-workflow.ts";
import type { SessionManagerDeps } from "../../../app/desktop/session/contracts/deps.ts";
import type { LiveSession } from "../../../app/desktop/session/contracts/session-types.ts";
import type {
  DurableAcceptanceWorkspaceBrowserCaptureReceipt, DurableAcceptanceWorkspaceProjection, DurableCapabilityEvent,
  DurableAcceptancePreparationObservation, DurableEffectIntent, DurableEffectOutcome, DurableEffectRecord, DurablePendingTask, DurableProjection, DurableResult,
  DurableVerificationCapabilitySnapshot,
} from "../../../src/model/durable-workflow.ts";
import { readVerificationPlan } from "../../../src/service/durable-workflow/blocked-routing.ts";
import type { StoredEffect, StoredFact, StoredInstance } from "../../../src/provider/durable-workflow/public.ts";
import type { AcceptanceWorkspaceReviewScope, ShellExecutionOutcome } from "../../../src/model/runtime.ts";
import { app as desktopFixture, businessDb, emptyFixture, git, historicalR19Resources, modelFixture, resourceRoot, until, unwrap, type Log } from "./fixture.ts";

const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const candidateOid = "d05cf2bbf0f9fab633f285d36838117e742fbd08";
const criteriaSha = "fe5abad4eb2ba5a0dcb286340de58a8a7c7d0d704f1dcb5dd551a47fd744f599";
const snapshotSha = "1903adbcfd2f6da031c371e623e254950365deff49cfea8cd3ea8d99a585a79d";
const sourceProject = process.env.ANS_R15_TYPED_STATIC_PROJECT;
const snapshotFile = process.env.ANS_R15_TYPED_STATIC_SNAPSHOT;

type HistoricalRunCall = { roleId: string; turnId: string; toolCallId: string; cwd: string };
type HistoricalWorkspaceApi = Omit<typeof WorkspaceApi, "desktopQueuedAcceptanceIsCurrent"> & {
  desktopQueuedAcceptanceIsCurrent(durable: DesktopDurableWorkflow, projectRoot: string, clientMessageId: string | undefined,
    deps: SessionManagerDeps): Promise<boolean>;
  acceptanceWorkspaceRun(durable: DesktopDurableWorkflow, session: () => LiveSession): (call: HistoricalRunCall) =>
    Promise<DurableResult<{
      argv: readonly string[];
      cwd: string;
      acceptanceWorkspaceScope: AcceptanceWorkspaceReviewScope;
      executeApproved(input: HistoricalRunCall & {
        argv: readonly string[];
        acceptanceWorkspaceScope: AcceptanceWorkspaceReviewScope;
        reviewedBy: string;
        isCurrent(): boolean;
        postAudit(execution: ShellExecutionOutcome): Promise<boolean>;
      }): Promise<DurableResult<{ execution?: ShellExecutionOutcome }>>;
    }>>;
};

async function historicalWorkspace(resources = historicalR19Resources): Promise<HistoricalWorkspaceApi> {
  return import(pathToFileURL(path.join(resources, "app/app/desktop/durable-acceptance-workspace.ts")).href);
}

interface HistoricalSnapshot {
  id: string;
  flowId: string;
  status: string;
  step: string;
  git: { head: string; main: string };
  workspaceAudits: { kind: string; receipt: { kind: string; basis: DurableAcceptanceWorkspaceProjection["basis"]; reason: string } }[];
  effects: { kind: string }[];
  events: {
    state: string;
    stepId: string;
    input: DurableCapabilityEvent["input"];
  }[];
}

test("R15 exact typed static workspace replays frozen live A6 A12a and Git bytes", {
  skip: (!sourceProject || !snapshotFile) && "Set the read-only original project and frozen SQLite snapshot paths",
  timeout: 120_000,
}, async t => {
  assert.ok(sourceProject && snapshotFile);
  const { acceptanceWorkspaceRun, closeDesktopAcceptanceWorkspace, prepareDesktopAcceptanceWorkspace } = await historicalWorkspace();
  const snapshotBytes = await readFile(snapshotFile);
  assert.equal(digest(snapshotBytes), snapshotSha);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as HistoricalSnapshot;
  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.step, "blocked");
  assert.equal(snapshot.git.head, candidateOid);
  assert.notEqual(snapshot.git.main, candidateOid);
  assert.equal(snapshot.effects.some(effect => /release-merge|acceptance-workspace-run/.test(effect.kind)), false);
  const oldAudit = snapshot.workspaceAudits.find(effect => effect.kind === "acceptance-workspace-prepare");
  assert.ok(oldAudit && oldAudit.receipt.kind === "acceptance-workspace-blocked");
  assert.match(oldAudit.receipt.reason, /实际构建/);
  const historicalBasis = oldAudit.receipt.basis;
  assert.equal(historicalBasis.candidateOid, candidateOid);
  assert.equal(historicalBasis.criteria.sha256, criteriaSha);
  const criteria = await readFile(path.join(sourceProject, historicalBasis.criteria.path));
  assert.equal(digest(criteria), criteriaSha);
  assert.match(criteria.toString("utf8").split(/\r?\n/)[82] ?? "", /若候选要求构建，/);
  const approved = snapshot.events.find(row => row.stepId === "confirm-proposal" && row.state === "consumed" && row.input.kind === "card-prepared");
  const decision = snapshot.events.find(row => row.stepId === "confirm-proposal" && row.state === "consumed" && row.input.kind === "card-decided");
  const assign = snapshot.events.find(row => row.stepId === "open-standard" && row.state === "consumed" && row.input.kind === "task-bound");
  assert.ok(approved?.input.kind === "card-prepared" && decision?.input.kind === "card-decided" && assign?.input.kind === "task-bound");
  const saved = decision.input;
  assert.ok(saved.authority && saved.decisionValues && saved.provenance);
  const proposal = approved.input.card.documents.find(doc => /-proposal-v1\.md$/.test(doc.path));
  assert.ok(proposal);
  const selectionDigest = /^proposalDecisionDigest: ([a-f0-9]{64})$/m.exec(criteria.toString("utf8"))?.[1];
  assert.ok(selectionDigest);
  const capabilities = (assign.input as { verificationCapabilities?: DurableVerificationCapabilitySnapshot }).verificationCapabilities;
  assert.ok(capabilities && capabilities.stage === "A12a");
  const signed = unwrap(readVerificationPlan(historicalBasis.criteria, criteria, snapshot.flowId, capabilities));
  assert.ok(signed.requirements.some(row => row.capability === "workspace-browser" && row.stage === "A12b"));
  assert.equal(signed.requirements.some(row => row.capability === "workspace-build" && row.stage === "A12b"), false);

  // Keep the real source and original instance read-only. The replay store drives only the current
  // controller effect interface against an isolated Git checkout, with a new assessment task.
  const { root } = await emptyFixture();
  execFileSync("git", ["clone", "--no-hardlinks", "--no-checkout", "--", sourceProject, root], { stdio: "pipe" });
  git(root, "config", "core.autocrlf", "false");
  git(root, "checkout", "-B", historicalBasis.branch, candidateOid);
  assert.equal(git(root, "rev-parse", "HEAD"), candidateOid);
  await mkdir(path.join(root, ".ans"));
  for (const doc of [...approved.input.card.documents, historicalBasis.criteria]) {
    const target = path.join(root, doc.path);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(sourceProject, doc.path), target);
    assert.equal(digest(await readFile(target)), doc.sha256);
  }
  const task = { ...historicalBasis.assessmentTask, taskId: "r15-typed-static-replay", parentTaskId: "r15-typed-static-fixture" };
  const basis = { ...historicalBasis, assessmentTask: task };
  const pending: DurablePendingTask = { task, taskId: task.taskId, roleId: task.roleId, stepId: "assess", flowId: snapshot.flowId,
    state: "pending", attempt: 2, capability: "independent-assessment", dispatch: { actor: "application", text: "Test the original files" } };
  const workspace: DurableAcceptanceWorkspaceProjection = {
    basis, state: "eligible", prepareKey: "prepare", runKey: "run", closeKey: "close", evidenceKey: "evidence",
  };
  const view: DurableProjection = {
    ref: { projectId: "r15-typed-static-test", instanceId: task.parentTaskId, definitionId: "path-a", definitionVersion: 8,
      definitionDigest: "r15-typed-static-test", executor: "ans-durable-definition-v2", activityContract: 2 },
    schema: 2, action: "independent-assessment", workflowOwnedDispatch: true, projectRoot: root, flowId: snapshot.flowId,
    stepId: "assess", attempt: 2, stepName: "Assess", definitionName: "Path A", pendingFacts: 0, metadata: {}, pendingTasks: [pending],
    status: "waiting", engine: "healthy", acceptanceWorkspace: workspace,
    proposalDecision: { requestId: saved.requestId, digest: saved.digest, generation: saved.generation,
      proposal, selectionDigest, authority: saved.authority, values: saved.decisionValues, provenance: saved.provenance },
    verificationPlan: signed,
  };
  const effects = new Map<string, DurableEffectRecord>();
  const bodies = new Map<string, unknown>();
  const receipts = [approved, decision].map(row => ({ event: { flowId: snapshot.flowId, input: row.input }, receipt: { state: row.state } }));
  const store = {
    lookup: () => view,
    async readEvidence(_root: string, file: string) {
      return { ok: true, value: { path: file, sha256: digest(await readFile(path.join(root, file))) } };
    },
    listCapabilityEvents: () => receipts,
    listEffects: (_ref: unknown, kind?: string) => [...effects.values()].filter(effect => !kind || effect.intent.kind === kind),
    getEvidence: (_ref: unknown, ref: { sha256: string }) => bodies.get(ref.sha256),
    storeEvidence(_ref: unknown, body: unknown) {
      const sha256 = digest(JSON.stringify(body));
      bodies.set(sha256, body);
      return { ok: true, value: { path: "ans-evidence/" + sha256, sha256 } };
    },
    async claimEffect(_ref: unknown, intent: DurableEffectIntent) {
      const row = effects.get(intent.key);
      if (row) return { ok: true, value: { ...row, execute: false } };
      const token = intent.key + "-token";
      effects.set(intent.key, { intent, token, state: "claimed" });
      return { ok: true, value: { execute: true, token } };
    },
    async settleEffect(_ref: unknown, result: DurableEffectOutcome) {
      const row = effects.get(result.key)!;
      row.state = result.outcome === "unknown" ? "unknown" : "succeeded";
      row.result = result;
      const body = bodies.get(String(result.result?.receiptId)) as undefined | (Pick<DurableAcceptanceWorkspaceProjection, "binding" | "receipt" | "closeReceipt">
        & { kind: string; reason?: string });
      if (body?.kind === "acceptance-workspace-prepared") Object.assign(workspace, { binding: body.binding, state: "ready" });
      if (body?.kind === "acceptance-workspace-static-run") Object.assign(workspace, { receipt: body, state: "ready-for-review" });
      if (body?.kind === "acceptance-workspace-closed") Object.assign(workspace, { closeReceipt: body });
      if (body?.kind === "acceptance-workspace-blocked") Object.assign(workspace, { state: "blocked", reason: body.reason });
      return { ok: true, value: true };
    },
  } as unknown as Parameters<typeof prepareDesktopAcceptanceWorkspace>[0];
  t.diagnostic(JSON.stringify({ snapshot: snapshotSha, oldAudit, candidateOid, criteriaSha,
    checks: signed.requirements.filter(row => row.stage === "A12b"), oldMain: snapshot.git.main }));
  if (process.env.ANS_R15_TYPED_STATIC_EXPECT_LEGACY === "1") {
    assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending, true)).hold, true);
    assert.equal(workspace.state, "blocked");
    assert.match(workspace.reason ?? "", /实际构建/);
    assert.equal(workspace.binding, undefined);
    assert.equal(effects.size, 1);
    t.diagnostic(JSON.stringify({ predecessor: workspace }));
    return;
  }
  assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending, true)).hold, true);
  const binding = workspace.binding;
  assert.ok(binding?.operation === "static");
  assert.equal(binding.staticRequirements?.build, false);
  assert.equal(binding.requiresBrowserEvidence, true);
  assert.deepEqual(binding.basis, basis);
  const prepared = effects.get(workspace.prepareKey)!;
  prepared.state = "claimed";
  prepared.result = undefined;
  workspace.binding = undefined;
  workspace.state = "preparing";
  assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending, true)).hold, true);
  assert.deepEqual(workspace.binding, binding);
  const recovered = effects.get(workspace.prepareKey)?.result?.evidence;
  assert.match(recovered ?? "", /Recovered prepared workspace/);
  assert.match((await prepareDesktopAcceptanceWorkspace(store, view, pending, true)).text ?? "", /复制核验过的静态浏览器文件/);
  assert.equal(effects.size, 1);
  assert.deepEqual(await readdir(binding.outputRoot), []);

  const lifetime = new AbortController();
  t.after(() => lifetime.abort());
  const entry = { roleId: task.roleId, runtime: "claude", projectRoot: root, assignedTaskId: task.taskId, busy: true,
    origins: { running: { turnId: "fixture-turn", taskId: task.taskId, clientMessageId: "fixture-dispatch" } },
    interactionState: { turn: { signal: lifetime.signal }, lifetime } } as unknown as LiveSession;
  const durable = { delivery: () => ({ roleId: task.roleId, runtime: "claude", ref: view.ref, intent: { stepId: view.stepId, attempt: view.attempt, task } }),
    lookup: async () => view, store: async () => store } as unknown as DesktopDurableWorkflow;
  const call = { roleId: task.roleId, turnId: "fixture-turn", toolCallId: "fixture-approved-call", cwd: root };
  const allowed = unwrap(await acceptanceWorkspaceRun(durable, () => entry)(call));
  const scope = allowed.acceptanceWorkspaceScope;
  assert.equal(scope.candidateOid, candidateOid);
  assert.equal(scope.operation, "static");
  const run = await allowed.executeApproved({ ...call, argv: allowed.argv, cwd: allowed.cwd, acceptanceWorkspaceScope: scope,
    reviewedBy: "isolated-test-approval", isCurrent: () => true, postAudit: async execution => execution.exitCode === 0 });
  assert.ok(run.ok, JSON.stringify(run));
  assert.equal(run.value.execution, undefined);
  t.after(() => closeDesktopAcceptanceWorkspace(store, view, task.taskId));
  const receipt = workspace.receipt;
  assert.equal(receipt?.kind, "acceptance-workspace-static-run");
  assert.equal(receipt.stage.inputSha256, receipt.stage.outputSha256);
  assert.match(receipt.preview.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const index = execFileSync("git", ["show", `${candidateOid}:index.html`], { cwd: root });
  const served = await fetch(receipt.preview.url);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), index);
  assert.equal(receipt.stage.entrySha256, digest(index));
  assert.equal((await fetch(new URL("test/env-bootstrap/entry.test.mjs", receipt.preview.url))).status, 404);
  assert.deepEqual(await closeDesktopAcceptanceWorkspace(store, view, task.taskId), { ok: true, value: true });
  await assert.rejects(fetch(receipt.preview.url));
  assert.equal(git(root, "rev-parse", "HEAD"), candidateOid);
  assert.equal(git(root, "status", "--porcelain"), "");
  assert.equal(digest(await readFile(snapshotFile)), snapshotSha);
  assert.equal(digest(await readFile(path.join(sourceProject, historicalBasis.criteria.path))), criteriaSha);
  t.diagnostic(JSON.stringify({ recovered, phase: "static-preview-only", receipt, closed: workspace.closeReceipt }));

  const foreign = { ...pending, taskId: "foreign-assessment" };
  assert.deepEqual(await prepareDesktopAcceptanceWorkspace(store, view, foreign, true), { hold: false });
  Object.assign(workspace, { state: "eligible", binding: undefined, prepareKey: "prepare-after-standard-drift" });
  const isolatedCriteria = path.join(root, basis.criteria.path);
  await writeFile(isolatedCriteria, Buffer.concat([criteria, Buffer.from("\nChanged copy for the current-basis negative.\n")]));
  const drift = await prepareDesktopAcceptanceWorkspace(store, view, pending, true);
  assert.equal(drift.hold, false);
  assert.match(drift.text ?? "", /当前独立验收标准已变化/);
  assert.equal(effects.has(workspace.prepareKey), false);
  t.diagnostic(JSON.stringify({ foreignTask: foreign.taskId, drift, originalEffects: [...effects.keys()] }));
});

const r17Id = "dw-3db3163d144bb0a6ba43ac509b82c9a00557";
const r17Assessment = "dw-eaa9d240ab5902afc4004eac7479fec9";
const r17Standard = "dw-954c96e74f94916a3f5b65d0e1a4cb59";
const r17Card = "dw-card:25334616d6756bee96732df05516d763f488b4f81275490e05a32a71eb84e356:1";
const r17Tip = "ca2f334b3dc861afd1d6023ca8aaa83d83734754";
const r17Main = "a9efc58f6adb81b65d75072e6a60e896f5c9dad4";
const r17EntrySha = "e75054dd5d10ff0613ded79cbc49d20c78a6b674ac09535127d9c5cf6b00b496";
const r17ArchitectureSha = "d0246821f566221f43273cc731451f5cfd6df8699e59187a9ea46e548993a69b";
const r17CriteriaSha = "9bd92773eba8a671c3faa3550b4ae5213c7be2a5b175a42915d9ca6d45fe2e1d";
const r17SnapshotSha = "dc023880c22d5538b4e20bceeffb3280925aa8e6c04728353ba12527bc226f2c";
const r17SelectionSha = "915a560bec854a54ad72fdce2468651a7cdc3d801782c5a08b1b5d3073dd0b5d";
const r18Original = process.env.ANS_R18_R17_PROJECT;
const r18HistoricalSqlite = process.env.ANS_R18_R17_SQLITE;
const r18HistoricalSnapshot = process.env.ANS_R18_R17_SNAPSHOT;
const r18ArtifactRoot = process.env.ANS_R18_TEST_ARTIFACT_ROOT;
const releaseResources = process.env.ANS_W5_APP_RESOURCES;
const baselineResources = process.env.ANS_R20_HISTORICAL_APP_RESOURCES ?? releaseResources ?? historicalR19Resources;

function readHistoricalCheckpoint(file: string, instance: string, criteriaSha256: string) {
  const uri = pathToFileURL(file);
  uri.searchParams.set("immutable", "1");
  // This reads the frozen, checkpointed main file. The R17 snapshot below independently
  // checks the final state and the key consumed facts. Never open the live database for writes.
  const db = new DatabaseSync(uri, { readOnly: true });
  try {
    const json = <T>(name: "instance" | "fact" | "effect") => db.prepare(
      "SELECT data FROM " + name + " WHERE " + (name === "instance" ? "id" : "instance_id") + " = ? ORDER BY rowid",
    ).all(instance).map(({ data }) => JSON.parse(String(data)) as T);
    const [value] = json<StoredInstance>("instance");
    assert.ok(value);
    const facts = json<StoredFact>("fact");
    const effects = json<StoredEffect>("effect");
    const criteria = db.prepare("SELECT content FROM evidence WHERE instance_id = ? AND digest = ?").get(instance, criteriaSha256);
    assert.ok(criteria?.content instanceof Uint8Array);
    const criteriaBytes = Buffer.from(criteria.content);
    assert.equal(digest(criteriaBytes), criteriaSha256);
    return { value, facts, effects, criteriaBytes };
  } finally { db.close(); }
}

const readR17Checkpoint = (file: string) => readHistoricalCheckpoint(file, r17Id, r17CriteriaSha);

function originalBlob(root: string, file: string): Buffer {
  return execFileSync("git", ["--no-optional-locks", "show", r17Tip + ":" + file], { cwd: root, windowsHide: true });
}

async function r18AssessmentReplay(root: string, sqlite: string, snapshotName: string, resources: string | undefined, log: Log, entry?: string | null) {
  const { value, facts, effects, criteriaBytes } = readR17Checkpoint(sqlite);
  const snapshotBytes = await readFile(snapshotName);
  assert.equal(digest(snapshotBytes), r17SnapshotSha);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as HistoricalSnapshot;
  assert.equal(snapshot.id, r17Id);
  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.step, "blocked");
  assert.equal(snapshot.workspaceAudits.length, 0);
  assert.equal(snapshot.git.head, r17Tip);
  assert.equal(snapshot.git.main, r17Main);
  assert.equal(value.status, "blocked");
  assert.equal(value.stepId, "blocked");
  assert.equal(value.graph?.flowId, snapshot.flowId);
  assert.equal(value.graph?.proofs.implementationTip, r17Tip);
  assert.ok(value.graph && value.baseline);
  const { graph, baseline } = value;
  const task = graph.tasks.find(item => item.taskId === r17Assessment);
  const standard = graph.tasks.find(item => item.taskId === r17Standard);
  const criteria = standard?.documents?.find(item => item.sha256 === r17CriteriaSha);
  assert.ok(task?.state === "rejected" && standard?.state === "accepted" && criteria);
  const keys = ["card-prepared:" + r17Card, "card-decided:" + r17Card, "workflow-bind:" + r17Standard,
    graph.proofs["standard-open"], "workflow-bind:" + r17Assessment];
  const sourceEvents = keys.map(key => {
    const row = facts.find(candidate => candidate.fact.key === key);
    assert.ok(row?.fact.kind === "capability-event" && row.receipt.state === "consumed", key);
    const { event } = row.fact;
    const historical = snapshot.events.find(candidate => candidate.state === "consumed"
      && JSON.stringify(candidate.input) === JSON.stringify(event.input));
    assert.ok(historical, key);
    return event;
  });
  const [prepared, approved, standardBound, standardClosed] = sourceEvents;
  assert.ok(prepared?.input.kind === "card-prepared" && approved?.input.kind === "card-decided"
    && standardBound?.input.kind === "task-bound" && standardClosed?.input.kind === "task-closed");
  assert.equal(approved.input.decision, "approve");
  assert.deepEqual(approved.input.decisionValues, { platform: "desktop-static-browser", laps: 3 });
  assert.equal(standardBound.input.task.taskId, r17Standard);
  assert.equal(standardClosed.input.task.taskId, r17Standard);
  assert.ok(prepared.input.card.documents.some(item => item.sha256 === r17ArchitectureSha));
  assert.equal(digest(originalBlob(root, "index.html")), r17EntrySha);
  const preserve = () => ({
    refs: git(root, "--no-optional-locks", "show-ref", "--heads"),
    status: git(root, "--no-optional-locks", "status", "--porcelain"),
  });
  const historicalGit = preserve();
  assert.deepEqual(historicalGit, { refs: r17Tip + " refs/heads/" + baseline.branch + "\n" + r17Main + " refs/heads/main", status: "" });
  const f = await emptyFixture(process.env.ANS_R18_TEST_SCRATCH);
  execFileSync("git", ["clone", "--no-hardlinks", "--no-checkout", "--", root, f.root], { stdio: "pipe", windowsHide: true });
  git(f.root, "config", "core.autocrlf", "false");
  git(f.root, "branch", "-f", "main", r17Main);
  git(f.root, "checkout", "-B", baseline.branch, r17Tip);
  git(f.root, "remote", "remove", "origin");
  if (entry !== undefined) {
    if (entry === null) await unlink(path.join(f.root, "index.html"));
    else await writeFile(path.join(f.root, "index.html"), entry);
    git(f.root, "add", "-A", "--", "index.html");
    git(f.root, "-c", "user.name=ANS R18 isolation", "-c", "user.email=r18@test.invalid", "commit", "-m", "Isolated static validation input");
  }
  const candidateOid = git(f.root, "rev-parse", "HEAD");
  const materials = [...prepared.input.card.documents, criteria];
  for (const { path: file, sha256 } of materials) {
    const target = path.join(f.root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
    assert.equal(digest(await readFile(target)), sha256, file);
  }
  const roles = graph.activatedRoles ?? [];
  const configuration = [".ans/project.json", "角色卡/governance-boundary.yaml",
    ...roles.flatMap(role => ["role-card.md", "boundary.md", "boundary.yaml"].map(file => "角色卡/" + role + "/" + file))];
  for (const file of configuration) {
    const target = path.join(f.root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  const provider = resources
    ? await import(pathToFileURL(path.join(resources, "app/src/provider/durable-workflow/public.ts")).href) as typeof import("../../../src/provider/durable-workflow/public.ts")
    : await import("../../../src/provider/durable-workflow/public.ts");
  const repo = await provider.repositoryIdentity(f.root);
  const dataDir = path.join(f.userDataRoot, "business");
  const ledger = new provider.DurableLedger(dataDir);
  try {
    const owner = { engine: "dapr" as const, instanceId: r17Id, dataDir: ledger.dataDir };
    provider.reserveWorkspace(repo.root, { ...owner, projectId: value.ref.projectId, requestId: value.requestId,
      fingerprint: value.startupFingerprint!, state: "active", source: "preset", definition: value.definition });
    assert.ok(provider.reserveOwner(repo, owner));
    const occurrence = { ...task, state: "pending" as const, outcome: undefined, report: undefined, documents: undefined };
    const checkpoint = { ...value, projectRoot: repo.root, commonDir: repo.commonDir, stepId: "assess", entry: 12,
      status: "waiting" as const, engine: "healthy" as const, businessReason: undefined, engineReason: undefined, scheduled: false,
      graph: { ...graph, proofs: { ...graph.proofs, implementationTip: candidateOid },
        tasks: graph.tasks.map(row => row.taskId === task.taskId ? occurrence : row) } };
    const knownFacts = facts.filter(({ fact, receipt }) => receipt.state === "consumed"
      && (fact.stepId !== "assess" && fact.stepId !== "blocked" || fact.key === "workflow-bind:" + task.taskId));
    const knownEffects = effects.filter(row => row.intent.stepId !== "assess" && row.intent.stepId !== "blocked");
    ledger.transaction(() => {
      ledger.pin(value.ref.projectId, value.definition);
      ledger.save(checkpoint);
      ledger.saveEvidence(r17Id, r17CriteriaSha, criteriaBytes);
      for (const row of knownFacts) ledger.saveFact(r17Id, row);
      for (const row of knownEffects) ledger.saveEffect(r17Id, row);
    });
    assert.equal(ledger.effects(r17Id).some(row => row.intent.task?.taskId === task.taskId), false);
    log("r18-isolated-assess-checkpoint", { fixture: f, original: { snapshot: r17SnapshotSha, state: value.status, git: historicalGit },
      copiedFacts: knownFacts.length, copiedEffects: knownEffects.length, seededAssessment: occurrence.task,
      candidate: candidateOid, materials, sourceEvents: sourceEvents.map(({ key, stepId, attempt }) => ({ key, stepId, attempt })) });
  } finally { ledger.close(); }
  return { f, ref: value.ref, architecture: materials.find(row => row.sha256 === r17ArchitectureSha)!,
    basis: { candidateOid, criteria, branch: baseline.branch, assessmentTask: task.task },
    async verifyHistory() {
      assert.deepEqual(preserve(), historicalGit);
      assert.deepEqual(readR17Checkpoint(sqlite), { value, facts, effects, criteriaBytes });
      assert.equal(digest(await readFile(snapshotName)), r17SnapshotSha);
      for (const { path: file, sha256 } of materials) assert.equal(digest(await readFile(path.join(root, file))), sha256);
      log("r18-history-before-and-after-match", { historicalGit, snapshot: r17SnapshotSha, criteria: criteria.sha256 });
    },
  };
}

test("R18 sealed Electron prepares and delivers the original R17 noscript candidate", {
  skip: !(r18Original && r18HistoricalSqlite && r18HistoricalSnapshot && r18ArtifactRoot && releaseResources && resourceRoot && process.versions.electron
    && !process.env.ELECTRON_RUN_AS_NODE) && "Requires sealed GUI Electron, resource path and the read-only R17 checkpoint",
  timeout: 75_000,
}, async t => {
  assert.ok(r18Original && r18HistoricalSqlite && r18HistoricalSnapshot && r18ArtifactRoot && releaseResources);
  const { app, BrowserWindow } = await import("electron");
  assert.equal(app.isReady(), true);
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const { f, ref, basis, verifyHistory } = await r18AssessmentReplay(r18Original, r18HistoricalSqlite, r18HistoricalSnapshot, releaseResources, log);
  t.after(verifyHistory);
  const workspaceApi = await import(pathToFileURL(path.join(releaseResources, "app/app/desktop/durable-acceptance-workspace.ts")).href) as
    typeof import("../../../app/desktop/durable-acceptance-workspace.ts");
  const requests: { url: string; statusCode: number; method: string }[] = [];
  const onWindow = (_event: Electron.Event, window: Electron.BrowserWindow) => {
    window.webContents.session.webRequest.onCompleted({ urls: ["http://127.0.0.1/*"] }, row => {
      const { url, statusCode, method } = row;
      requests.push({ url, statusCode, method });
    });
  };
  app.on("browser-window-created", onWindow);
  t.after(() => app.removeListener("browser-window-created", onWindow));
  await mkdir(r18ArtifactRoot, { recursive: true });
  const evidenceRoot = r18ArtifactRoot;
  let delivered = 0;
  let result: unknown;
  const model = modelFixture(async turn => {
    if (turn.roleId === "chief") return;
    assert.equal(turn.roleId, "verifier");
    assert.equal(++delivered, 1);
    assert.ok(turn.text.includes(r17Tip) && turn.text.includes(r17SelectionSha));
    const store = await handle.durable.store();
    const ready = store.lookup(ref)!;
    const binding = ready.acceptanceWorkspace?.binding;
    assert.ok(binding && binding.operation === "static" && !binding.staticRequirements?.build);
    assert.deepEqual(binding.basis, basis);
    assert.equal(ready.proposalDecision?.selectionDigest, r17SelectionSha);
    const run = await turn.call("run_acceptance_workspace", {});
    assert.equal(run.ok, true, run.message);
    const current = store.lookup(ref)!;
    const receipt = current.acceptanceWorkspace?.receipt;
    assert.ok(receipt?.kind === "acceptance-workspace-static-run");
    assert.equal(receipt.stage.entrySha256, r17EntrySha);
    assert.equal(receipt.stage.outputSha256, receipt.stage.inputSha256);
    assert.match(receipt.stage.reviewedBy, /\boperator:/);
    const { url } = receipt.preview;
    const page = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    const csp = page.headers.get("content-security-policy");
    const bytes = Buffer.from(await page.arrayBuffer());
    assert.equal(page.status, 200);
    assert.deepEqual(bytes, originalBlob(f.root, "index.html"));
    assert.equal(csp?.split(";").map(part => part.trim()).find(part => part.startsWith("script-src ")), "script-src 'self'");
    assert.ok(csp?.includes("script-src-attr 'none'"));
    const resources = await Promise.all(receipt.stage.files.filter(file => file.path !== "index.html").map(async ({ path: file }) => {
      const response = await fetch(new URL(file, url), { signal: AbortSignal.timeout(2_000) });
      const actual = Buffer.from(await response.arrayBuffer());
      assert.equal(response.status, 200, file);
      assert.deepEqual(actual, originalBlob(f.root, file), file);
      return { file, sha256: digest(actual), status: response.status, contentType: response.headers.get("content-type") };
    }));
    assert.equal((await fetch(new URL("test/env-bootstrap/entry.test.mjs", url))).status, 404);
    const rejectedHost = await new Promise<number>((resolve, reject) => {
      const request = httpGet(url, { headers: { host: "untrusted.invalid" }, signal: AbortSignal.timeout(2_000) }, response => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.once("error", reject);
    });
    assert.equal(rejectedHost, 403);
    const capture = await turn.call("exercise_acceptance_browser", {
      actions: [{ kind: "wait", ms: 500 }], capture: { name: "r18-original-candidate", criteriaIds: ["AC-1"] },
    });
    assert.equal(capture.ok, true, capture.message);
    assert.match(capture.message ?? "", /CIRCUIT[\s\S]*THREE/i);
    const captureId = /实际浏览器取证回执 ([a-f0-9]{64})/.exec(capture.message ?? "")?.[1];
    assert.ok(captureId);
    const body = store.getEvidence(ref, { path: "ans-evidence/" + captureId, sha256: captureId }) as DurableAcceptanceWorkspaceBrowserCaptureReceipt;
    assert.equal(body.kind, "acceptance-workspace-browser-capture");
    assert.equal(body.url, url);
    assert.equal(body.runReceiptId, current.acceptanceWorkspace?.runReceiptId);
    assert.equal(body.turnId, turn.turnId);
    assert.equal(body.screenshots.length, 1);
    const png = await readFile(path.join(f.root, body.screenshots[0]!.path));
    assert.equal(digest(png), body.screenshots[0]!.sha256);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 900]);
    assert.ok(requests.some(row => row.url === url && row.statusCode === 200));
    assert.ok(requests.some(row => row.url === new URL("src/scene/main.js", url).href && row.statusCode === 200));
    assert.ok(requests.every(row => new URL(row.url).origin === new URL(url).origin));
    await writeFile(path.join(evidenceRoot, "r17-original-entry.html"), bytes, { flag: "wx" });
    await writeFile(path.join(evidenceRoot, "r17-original-chromium.png"), png, { flag: "wx" });
    await copyFile(path.join(f.root, body.events.path), path.join(evidenceRoot, "r17-original-chromium-events.json"));
    assert.ok(BrowserWindow.getAllWindows().length === 1);
    assert.equal(unwrap(await workspaceApi.closeDesktopAcceptanceWorkspace(store, current, basis.assessmentTask.taskId)), true);
    const freshConnection = new Promise((resolve, reject) => {
      const request = httpGet(url, { agent: false, signal: AbortSignal.timeout(2_000) }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.once("error", reject);
    });
    await assert.rejects(freshConnection, error => error instanceof Error && (error as NodeJS.ErrnoException).code === "ECONNREFUSED");
    await until("closed Chromium preview window", async () => BrowserWindow.getAllWindows().length === 0 ? true : undefined, [], 2_000);
    const after = store.lookup(ref)!;
    assert.equal(after.acceptanceWorkspace?.closeReceipt?.url, url);
    assert.equal(after.status, "waiting");
    assert.ok(!after.pendingTasks?.find(row => row.taskId === basis.assessmentTask.taskId)?.report);
    assert.equal(git(f.root, "rev-parse", "HEAD"), r17Tip);
    assert.equal(git(f.root, "rev-parse", "main"), r17Main);
    assert.equal(git(f.root, "status", "--porcelain"), "");
    result = { receipt, csp, resources, requests, rejectedHost, capture: body, visible: capture.message,
      close: after.acceptanceWorkspace?.closeReceipt, openChromiumWindowsAfterClose: BrowserWindow.getAllWindows().length };
  }, log);
  const handle = await desktopFixture(f, model, log, {
    bundleResources: releaseResources, nativeAcceptanceBrowser: true, modelRuntime: "claude", assessmentReplayRef: ref,
    shellOperatorPresenter: {
      async present(prompt, display, metadata) {
        const scope = prompt.acceptanceWorkspaceScope;
        assert.ok(scope && display.acceptanceWorkspaceScope && metadata?.roleId === "verifier");
        assert.equal(scope.operation, "static");
        assert.equal(scope.taskId, basis.assessmentTask.taskId);
        assert.equal(scope.candidateOid, r17Tip);
        assert.equal(scope.criteriaSha256, r17CriteriaSha);
        assert.equal(scope.projectRoot, await realpath(f.root));
        log("r18-original-preview-scoped-approval", { scope, argv: prompt.argv, roleId: metadata.roleId });
        return { allow: true };
      },
    },
  });
  t.after(() => handle.close());
  const store = await handle.durable.store();
  assert.equal(store.lookup(ref)?.acceptanceWorkspace?.state, "eligible");
  assert.equal(store.lookup(ref)?.proposalDecision?.selectionDigest, r17SelectionSha);
  assert.deepEqual(store.lookup(ref)?.acceptanceWorkspace?.basis, basis);
  const plan = store.lookup(ref)?.verificationPlan;
  assert.ok(plan);
  assert.ok(plan?.requirements.some(row => row.stage === "A12b" && row.capability === "workspace-browser"));
  assert.equal(plan.requirements.some(row => row.stage === "A12b" && row.capability === "workspace-build"), false);
  if (process.env.ANS_R18_PREDECESSOR === "1") {
    const current = store.lookup(ref)!;
    const pending = current.pendingTasks?.find(row => row.taskId === basis.assessmentTask.taskId);
    assert.ok(pending);
    const verdict = await workspaceApi.prepareDesktopAcceptanceWorkspace(store, current, pending, true);
    assert.equal(verdict.hold, false);
    assert.match(verdict.text ?? "", /当前静态入口无法按原模块合同核验/);
    assert.equal(store.lookup(ref)?.acceptanceWorkspace?.binding, undefined);
    assert.equal(store.listEffects(ref).some(row => row.intent.task?.taskId === pending.taskId), false);
    log("r17-calibration-original-candidate-rejected-before-preparation", { verdict, basis, plan });
    return;
  }
  await until("the real desktop delivery and original Chromium preview", async () => {
    if (result !== undefined) return result;
    await handle.observeNow(r17Id);
  }, model.errors, 45_000);
  const assessmentEffects = store.listEffects(ref).filter(row => row.intent.task?.taskId === basis.assessmentTask.taskId);
  assert.equal(assessmentEffects.filter(row => row.intent.kind === "model-send").length, 1);
  assert.equal(assessmentEffects.filter(row => row.intent.kind === "acceptance-workspace-prepare" && row.state === "succeeded").length, 1);
  log("r18-original-chromium-witness", { process: { pid: process.pid, executable: process.execPath, versions: process.versions },
    effects: assessmentEffects, witness: result });
});

type R18Store = Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
type R18Replay = Awaited<ReturnType<typeof r18AssessmentReplay>>;
const r18ReplayAvailable = r18Original && r18HistoricalSqlite && r18HistoricalSnapshot && resourceRoot;

test("R20 exact old signed requirements hold without executing the retired workspace after reopen", {
  skip: !r18ReplayAvailable && "Requires the read-only R17 source and checkpoint",
  timeout: 75_000,
}, async t => {
  assert.ok(r18Original && r18HistoricalSqlite && r18HistoricalSnapshot && resourceRoot);
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ at: new Date().toISOString(), event, value }));
  const { f, ref, basis, verifyHistory } = await r18AssessmentReplay(r18Original, r18HistoricalSqlite, r18HistoricalSnapshot, baselineResources, log);
  t.after(verifyHistory);
  const model = modelFixture(async turn => {
    assert.fail(`Old A12b should not get a model delivery in the new host: ${turn.roleId}/${turn.turnId}`);
  }, log);
  let handle = await desktopFixture(f, model, log, { assessmentReplayRef: ref });
  t.after(() => handle.close());
  const show = (resources: string) => readFile(path.join(resources, "app", "docs", "workflows", "path-a.yaml"), "utf8");
  assert.match(await show(baselineResources), /^version: 8$/m);
  if (releaseResources) {
    assert.match(await show(releaseResources), /^version: 9$/m);
    await assert.rejects(readFile(path.join(releaseResources, "app", "app", "desktop", "durable-acceptance-browser.ts")), { code: "ENOENT" });
  }
  const project = () => handle.desktop.getDurableWorkflowProjection({ projectRoot: f.root, instanceId: ref.instanceId });
  const facts = async () => {
    const store = await handle.durable.store();
    return store.listCapabilityEvents(ref).filter(row => row.event.input.kind === "evidence-audit-blocked" && row.receipt.state !== "ignored");
  };
  const blocked = await until("old frozen assessment has one current missing-evidence card", async () => {
    await handle.observeNow(ref.instanceId);
    const response = unwrap(await project());
    const card = [...handle.cards.values()].find(item => item.request.cardKind === "workflow-blocked-scope");
    if (response.instance?.evidenceAudit?.state === "blocked" && card) return { response, card };
  }, model.errors);
  assert.equal(blocked.response.instance?.definitionVersion, ref.definitionVersion);
  assert.equal(blocked.response.instance?.evidenceAudit?.basis.candidateOid, basis.candidateOid);
  assert.equal(blocked.response.instance?.evidenceAudit?.basis.standard.sha256, basis.criteria.sha256);
  assert.equal((await facts()).length, 1);
  const store = await handle.durable.store();
  const persisted = store.lookup(ref);
  assert.ok(persisted && persisted.acceptanceWorkspace?.receipt === undefined);
  assert.equal(persisted.acceptanceWorkspace?.binding, undefined);
  assert.equal(git(f.root, "rev-parse", "HEAD"), basis.candidateOid);
  assert.equal(git(f.root, "rev-parse", "main"), r17Main);
  await handle.close();
  handle = await desktopFixture(f, model, log, { assessmentReplayRef: ref });
  const restored = await until("one original missing legacy card is restored", async () => {
    await handle.observeNow(ref.instanceId);
    const response = unwrap(await project());
    const card = handle.cards.get(blocked.card.id);
    if (response.instance?.evidenceAudit?.state === "blocked" && card) return { response, card };
  }, model.errors);
  assert.deepEqual(restored.card.request, blocked.card.request);
  assert.equal((await facts()).length, 1);
  assert.deepEqual(model.errors, []);
  log("r20-legacy-original-requirement-and-frozen-block-after-restart", { blocked, restored, facts: await facts() });
});

async function r18OpenReplay(log: Log, entry?: string | null) {
  assert.ok(r18Original && r18HistoricalSqlite && r18HistoricalSnapshot && resourceRoot);
  const incoming = await r18AssessmentReplay(r18Original, r18HistoricalSqlite, r18HistoricalSnapshot, baselineResources, log, entry);
  const packaged = (file: string) => pathToFileURL(path.join(baselineResources, "app/app/desktop", file)).href;
  const { DesktopDurableWorkflow: Controller } = await import(packaged("durable-workflow.ts")) as typeof import("../../../app/desktop/durable-workflow.ts");
  const workspace = await historicalWorkspace(baselineResources);
  const reopen = () => new Controller({ userDataRoot: incoming.f.userDataRoot, resourceRoot: resourceRoot!,
    presetRoot: path.join(baselineResources, "app") });
  return { ...incoming, workspace, reopen, controller: reopen() };
}

function r18Current(store: R18Store, replay: R18Replay) {
  const view = store.lookup(replay.ref);
  assert.ok(view?.acceptanceWorkspace?.preparationGate);
  const pending = view.pendingTasks?.find(row => row.taskId === replay.basis.assessmentTask.taskId);
  assert.ok(pending && pending.state === "pending");
  return { view, pending, space: view.acceptanceWorkspace };
}

function r18VerifyNoDelivery(store: R18Store, replay: R18Replay) {
  const { view, pending } = r18Current(store, replay);
  for (const [key, kind] of [["dispatch:", "dispatch"], ["model:", "model-send"]] as const) {
    const blocked = store.claimEffect(replay.ref, { key: key + pending.taskId, kind, stepId: view.stepId, attempt: view.attempt,
      task: pending.task, ...(kind === "model-send" ? { expected: { roleId: pending.roleId, runtime: "claude" } } : {}) });
    assert.equal(blocked.ok, false, JSON.stringify(blocked));
  }
  assert.deepEqual(store.listEffects(replay.ref).filter(row => row.intent.task?.taskId === pending.taskId
    && ["dispatch", "model-send", "acceptance-workspace-run", "acceptance-workspace-browser-capture"].includes(row.intent.kind)), []);
}

const validHtml = (body: string, head = "") => "<!doctype html><html><head><title>R18</title>" + head
  + '<script type="module" src="./src/scene/main.js"></script></head><body>' + body + "</body></html>";
const plainNoscript = "<noscript>Offline help &amp; keyboard controls</noscript>";
const unsafeStaticCandidates = [
  ["outside-body", validHtml("", plainNoscript)],
  ["attribute", validHtml("<noscript class=help>Help</noscript>")],
  ["child-tag", validHtml("<noscript><span>Help</span></noscript>")],
  ["absent-close", validHtml("<noscript>Help")],
  ["nested", validHtml("<noscript><noscript>Help</noscript></noscript>")],
  ["comment-imitates-body", validHtml("").replace("<body>", "<!-- <body> -->" + plainNoscript)],
  ["quoted-attribute-imitates-body", validHtml("").replace("<body>", '<main aria-label="<body>"></main>' + plainNoscript)],
  ["style-imitates-body", validHtml("").replace("<body>", '<style>main::before{content:"<body>"}</style>' + plainNoscript)],
  ["title-imitates-body", validHtml("").replace("<body>", '<title>Literal <body></title>' + plainNoscript)],
  ["module-string-imitates-body", validHtml("").replace("<body>", '<script type="module">const marker = "<body>"; void marker;</script>' + plainNoscript)],
  ["foreign-namespace", validHtml("<svg>" + plainNoscript + "</svg>")],
  ["malformed-body", validHtml(plainNoscript).replace("<body>", "<body/data-case='invalid'>")],
  ["duplicate-body", validHtml(plainNoscript).replace("</body>", "</body><body></body>")],
  ["null-byte", validHtml(plainNoscript).replace("Offline", "\0Offline")],
  ["inline-event-attribute", validHtml('<main onclick="void 0"></main>')],
  ["external-script", validHtml('<script type="module" src="https://example.invalid/external.js"></script>')],
  ["traversal-script", validHtml('<script type="module" src="../src/scene/main.js"></script>')],
  ["unapproved-classic-script", validHtml('<script src="./src/scene/main.js"></script>')],
  ["missing-entry", null],
] as const;

test("R18 real Git rejects untrusted static markup before launch and classifies each path", {
  skip: !r18ReplayAvailable && "Requires application runtime resources and the read-only R17 checkpoint",
  timeout: 120_000,
}, async t => {
  for (const [name, entry] of unsafeStaticCandidates) await t.test(name, async leaf => {
    const replay = await r18OpenReplay((event, value) => leaf.diagnostic(JSON.stringify({ event, value })), entry);
    leaf.after(() => replay.controller.close());
    const store = await replay.controller.store();
    const { view, pending, space } = r18Current(store, replay);
    assert.equal(space.preparation, undefined);
    r18VerifyNoDelivery(store, replay);
    const verdict = await replay.workspace.prepareDesktopAcceptanceWorkspace(store, view, pending, true);
    assert.equal(verdict.hold, true);
    const recorded = r18Current(store, replay).space.preparation;
    assert.ok(recorded && recorded.result.kind === "candidate-defect");
    assert.equal(recorded.prepareKey, space.prepareKey);
    assert.equal(recorded.generation, 1);
    assert.deepEqual(recorded.basis, replay.basis);
    assert.equal(recorded.result.stage, "entry");
    assert.equal(recorded.result.code, entry === null ? "static-entry-missing" : "static-entry-rejected");
    assert.deepEqual(recorded.result.paths, [{ path: "index.html", state: entry === null ? "missing" : "present" }]);
    assert.deepEqual(recorded.result.candidate, { state: "verified", branch: replay.basis.branch, oid: replay.basis.candidateOid });
    assert.equal(recorded.rework, undefined, "the isolated negative commit has no original application work-item write receipt");
    assert.ok(!store.lookup(replay.ref)?.blockedRouting?.options.some(row => row.id === "rework"));
    assert.deepEqual(store.listEffects(replay.ref, "acceptance-workspace-prepare"), []);
    r18VerifyNoDelivery(store, replay);
    assert.equal(git(replay.f.root, "status", "--porcelain"), "");
    leaf.diagnostic(JSON.stringify({ name, recorded, noWorkspaceEffects: true, noDeliveryEffects: true }));
  });
});

test("R18 durable preparation failure and SQLite write refusal keep actual delivery closed", {
  skip: !r18ReplayAvailable && "Requires application runtime resources and the read-only R17 checkpoint",
  timeout: 45_000,
}, async t => {
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ event, value }));
  const replay = await r18OpenReplay(log);
  t.after(replay.verifyHistory);
  let controller = replay.controller;
  t.after(() => controller.close());
  let store = await controller.store();
  const prepare = async () => {
    const { view, pending } = r18Current(store, replay);
    return replay.workspace.prepareDesktopAcceptanceWorkspace(store, view, pending, true);
  };
  const live = () => r18Current(store, replay).space;
  const initial = live();
  r18VerifyNoDelivery(store, replay);
  const criteria = path.join(replay.f.root, replay.basis.criteria.path);
  const signed = await readFile(criteria);
  await unlink(criteria);
  businessDb(replay.f, db => db.exec("CREATE TRIGGER r18_observation_refusal BEFORE INSERT ON fact "
    + "WHEN NEW.business_key LIKE 'acceptance-preparation-observed:%' BEGIN SELECT RAISE(ABORT, 'R18 controlled write refusal'); END;"), true);
  const refused = await prepare();
  assert.equal(refused.hold, true);
  assert.match(refused.text ?? "", /无法保存当期 A12b 工作区准备事实/);
  assert.equal(live().preparation, undefined);
  r18VerifyNoDelivery(store, replay);
  businessDb(replay.f, db => db.exec("DROP TRIGGER r18_observation_refusal"), true);
  assert.equal((await prepare()).hold, true);
  const missing = live().preparation;
  assert.ok(missing?.result.kind === "material-conflict");
  assert.equal(missing.generation, 1);
  assert.equal(missing.prepareKey, initial.prepareKey);
  assert.deepEqual(missing.result.paths, [{ path: replay.basis.criteria.path, state: "missing" }]);
  assert.equal(store.listEffects(replay.ref, "acceptance-workspace-prepare").length, 0);
  assert.equal(await prepare().then(result => result.hold), true);
  assert.deepEqual(live().preparation, missing);
  await controller.close();
  controller = replay.reopen();
  store = await controller.store();
  assert.deepEqual(live().preparation, missing);
  r18VerifyNoDelivery(store, replay);
  await writeFile(criteria, signed);
  const blockedDirectory = path.join(replay.f.root, ".ans", "acceptance-runs", replay.basis.assessmentTask.taskId);
  await mkdir(blockedDirectory, { recursive: true });
  const userBytes = "Isolated obstruction. This directory predates the prepare action.";
  await writeFile(path.join(blockedDirectory, "owner-marker"), userBytes);
  assert.equal((await prepare()).hold, true);
  const settled = live().preparation;
  assert.ok(settled?.result.kind === "unavailable");
  assert.equal(settled.prepareKey, initial.prepareKey);
  assert.equal(settled.generation, 2);
  assert.equal(settled.result.stage, "workspace");
  assert.equal(settled.result.code, "workspace-prepare-failed");
  assert.equal(settled.effect?.state, "unknown");
  assert.equal(store.listEffects(replay.ref, "acceptance-workspace-prepare").length, 1);
  assert.equal(await readFile(path.join(blockedDirectory, "owner-marker"), "utf8"), userBytes);
  r18VerifyNoDelivery(store, replay);
  log("r18-failed-observation-recovery-and-after-claim-block", { refused, missing, settled, retained: userBytes });
});

test("R18 durable preparation recovers a real registered workspace and retires its dispatch permit on material drift", {
  skip: !r18ReplayAvailable && "Requires application runtime resources and the read-only R17 checkpoint",
  timeout: 40_000,
}, async t => {
  const log: Log = (event, value) => t.diagnostic(JSON.stringify({ event, value }));
  const replay = await r18OpenReplay(log);
  t.after(replay.verifyHistory);
  let controller = replay.controller;
  t.after(() => controller.close());
  let store = await controller.store();
  const prepare = () => {
    const { view, pending } = r18Current(store, replay);
    return replay.workspace.prepareDesktopAcceptanceWorkspace(store, view, pending, true);
  };
  const live = () => r18Current(store, replay).space;
  const task = replay.basis.assessmentTask;
  const key = live().prepareKey;
  businessDb(replay.f, db => db.exec("CREATE TRIGGER r18_settlement_refusal BEFORE UPDATE ON effect "
    + "WHEN NEW.business_key LIKE 'acceptance-workspace-prepare:%' AND NEW.state = 'succeeded' "
    + "BEGIN SELECT RAISE(ABORT, 'R18 controlled settlement refusal'); END;"), true);
  assert.equal((await prepare()).hold, true);
  const unsettled = live().preparation;
  assert.ok(unsettled && unsettled.result.kind === "unavailable" && unsettled.effect);
  assert.equal(unsettled.prepareKey, key);
  assert.ok(["claimed", "unknown"].includes(unsettled.effect.state));
  const working = path.join(replay.f.root, ".ans", "acceptance-runs", task.taskId);
  const registration = await readFile(path.join(working, "workspace.json"));
  assert.deepEqual(await readdir(path.join(working, "output")), []);
  assert.deepEqual(await readdir(path.join(working, "evidence")), []);
  r18VerifyNoDelivery(store, replay);
  assert.equal(store.acceptanceDispatchPermit(replay.ref, task).ok, false);
  await controller.close();
  controller = replay.reopen();
  store = await controller.store();
  assert.deepEqual(live().preparation, unsettled);
  businessDb(replay.f, db => db.exec("DROP TRIGGER r18_settlement_refusal"), true);
  assert.equal((await prepare()).hold, true);
  const recovered = live().preparation;
  assert.ok(recovered?.result.kind === "prepared");
  assert.equal(recovered.prepareKey, key);
  assert.equal(recovered.generation, unsettled.generation + 1);
  assert.deepEqual(await readFile(path.join(working, "workspace.json")), registration);
  const [effect] = store.listEffects(replay.ref, "acceptance-workspace-prepare");
  assert.equal(effect?.token, unsettled.effect.token);
  assert.match(effect?.result?.evidence ?? "", /Recovered prepared workspace/);
  const permit = unwrap(store.acceptanceDispatchPermit(replay.ref, task));
  assert.ok(permit.prepareKey && permit.generation !== undefined);
  const queuedId = "r18-queued-before-material-drift";
  const queuedIntent = { key: "model:" + task.taskId, kind: "model-send" as const, task,
    stepId: r18Current(store, replay).view.stepId, attempt: task.stageAttempt,
    expected: { roleId: task.roleId, runtime: "claude", clientMessageId: queuedId,
      prepareKey: permit.prepareKey, preparationGeneration: String(permit.generation) } };
  controller.registerDelivery(replay.f.root, queuedId, { ref: replay.ref, roleId: task.roleId, runtime: "claude",
    intent: queuedIntent, assignmentTaskId: task.taskId, workflowOwnedDispatch: true });
  const consumeQueued = () => replay.workspace.desktopQueuedAcceptanceIsCurrent(controller, replay.f.root, queuedId,
    {} as Parameters<typeof replay.workspace.desktopQueuedAcceptanceIsCurrent>[3]);
  const architecture = path.join(replay.f.root, replay.architecture.path);
  const original = await readFile(architecture);
  await writeFile(architecture, Buffer.concat([original, Buffer.from("\nControlled isolated architecture drift.\n")]));
  assert.equal((await prepare()).hold, true);
  const drift = live().preparation;
  assert.ok(drift?.result.kind === "material-conflict");
  assert.equal(drift.generation, recovered.generation + 1);
  assert.equal(drift.prepareKey, key);
  assert.ok(drift.materials.some(row => row.ref.path === replay.architecture.path && row.state === "drifted"));
  assert.equal(store.acceptanceDispatchPermit(replay.ref, task).ok, false);
  assert.equal(await consumeQueued(), false);
  r18VerifyNoDelivery(store, replay);
  const scope = store.lookup(replay.ref)?.blockedRouting;
  assert.ok(scope?.a12bPrepareKey === key);
  unwrap(await store.decideBlockedScopeChange(replay.ref, { ...scope.binding, option: "wait", provenance: { source: "customer" } }, () => true));
  const confirmation = unwrap(await store.requestAcceptancePreparationStop(replay.ref, key, () => true));
  assert.equal(confirmation.confirmation, "stop");
  const stop = store.lookup(replay.ref)?.blockedRouting;
  assert.ok(stop?.a12bPrepareKey === key && stop.binding.generation === confirmation.generation);
  await writeFile(architecture, original);
  const [, oldStop] = await Promise.all([
    prepare(),
    store.decideBlockedScopeChange(replay.ref, { ...stop.binding, option: "stop", provenance: { source: "customer" } }, () => true),
  ]);
  assert.ok(!oldStop.ok && oldStop.code === "workflow-blocked-scope-stale");
  await until("the restored signed bytes reauthorize the current preparation", async () => {
    if (live().preparation?.result.kind === "prepared") return true;
    await prepare();
  }, [], 5_000);
  const current = unwrap(store.acceptanceDispatchPermit(replay.ref, task));
  assert.notDeepEqual(current, permit);
  assert.ok((live().preparation?.generation ?? 0) > confirmation.generation);
  assert.equal(store.lookup(replay.ref)?.blockedRouting, undefined);
  assert.equal(await consumeQueued(), false);
  const stale = store.claimEffect(replay.ref, queuedIntent);
  assert.ok(!stale.ok && stale.code === "acceptance-preparation-generation-stale");
  assert.deepEqual(store.listEffects(replay.ref, "model-send").filter(row => row.intent.task?.taskId === task.taskId), []);
  log("r18-registration-recovered-with-current-dispatch-permit", { unsettled, recovered, drift, permit, current, stale, confirmation, oldStop,
    currentQueueDeliveryRefused: true, registrationSha256: digest(registration) });
});

const r19HistoricalRoot = process.env.ANS_R19_R18_PROJECT;
const r19HistoricalSnapshot = process.env.ANS_R19_R18_SNAPSHOT;
const r19HistoricalSqlite = process.env.ANS_R19_R18_SQLITE;
const r19DiagnosticMode = process.env.ANS_R19_DIAGNOSTIC_HANDOFF;
const r18LiveId = "dw-5eb9ebfa5bd3c26f6a72b7c3b080c01df5f0";
const r18LiveInitial = "84085e46438d71899dbe487bd9d6539dfef62a2f";
const r18LiveProse = "252e164645565e7087acbea4f177d36e6295beb2";
const r18LiveTip = "122db7eb06f37cbb8d8b288685b51714f2486d7f";
const r18LiveMain = "c7dcac9895fe359ffbfb09d2d437c268a7e4aa79";
const r18LiveSnapshotSha = "7269c17f6f223e2edb15e31a61b60eb68a5215ac59cd7267f7a5261a2d5aa6e4";
const r18LiveCriteriaSha = "54542573317ae0401893c98591a4560936de6cf2101104882a578e79e950094b";

test("R19 exact historical R18 entries classify and preserve their original signed graph", {
  skip: !(r19DiagnosticMode && r19HistoricalRoot && r19HistoricalSnapshot && r19HistoricalSqlite && resourceRoot)
    && "Requires the read-only R18 project and historical files with a selected production runtime",
  timeout: 70_000,
}, async t => {
  assert.ok(r19HistoricalRoot && r19HistoricalSnapshot && r19HistoricalSqlite && resourceRoot);
  const source = r19HistoricalRoot, sqlite = r19HistoricalSqlite, snapshotName = r19HistoricalSnapshot;
  const frozen = await readFile(snapshotName);
  assert.equal(digest(frozen), r18LiveSnapshotSha);
  const snapshot = JSON.parse(frozen.toString("utf8")) as Omit<HistoricalSnapshot, "events"> & {
    events: (HistoricalSnapshot["events"][number] | { stepId: string; state: string;
      input: { kind: "acceptance-preparation-observed"; observation: DurableAcceptancePreparationObservation } })[];
  };
  assert.equal(snapshot.id, r18LiveId);
  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.git.head, r18LiveTip);
  assert.equal(snapshot.git.main, r18LiveMain);
  assert.equal(snapshot.workspaceAudits.length, 0);
  const saved = readHistoricalCheckpoint(sqlite, r18LiveId, r18LiveCriteriaSha);
  assert.equal(saved.value.status, "blocked");
  const { graph, baseline } = saved.value;
  assert.ok(graph && baseline);
  const refs = () => git(source, "--no-optional-locks", "show-ref", "--heads");
  const historicalRefs = refs();
  assert.equal(historicalRefs, r18LiveTip + " refs/heads/" + baseline.branch + "\n" + r18LiveMain + " refs/heads/main");
  const observations = snapshot.events.flatMap(row => row.input.kind === "acceptance-preparation-observed" && "observation" in row.input
    ? [row.input.observation] : []);
  const first = observations.find(item => item.basis.candidateOid === r18LiveInitial);
  const prose = observations.find(item => item.basis.candidateOid === r18LiveProse);
  assert.ok(first && prose);
  assert.equal(first.basis.criteria.sha256, r18LiveCriteriaSha);
  assert.deepEqual(first.basis.criteria, prose.basis.criteria);
  const prepared = saved.facts.find(row => row.fact.key === "card-prepared:" + graph.approvedProposalRequestId);
  const approved = saved.facts.find(row => row.fact.key === graph.proofs["proposal-approved"]);
  const standard = saved.facts.find(row => row.fact.key === graph.proofs["standard-open"]);
  assert.ok([prepared, approved, standard].every(row => row?.receipt.state === "consumed"));
  assert.ok(prepared?.fact.kind === "capability-event" && prepared.fact.event.input.kind === "card-prepared");
  assert.ok(approved?.fact.kind === "capability-event" && approved.fact.event.input.kind === "card-decided");
  const approvedValues = approved.fact.event.input.decisionValues;
  assert.deepEqual(approvedValues, { deliveryFormat: "local-html-native-esm", drivingScope: "single-oval",
    gameGoal: "playable-3d-three-laps", graphics: "native-webgl", lapValidation: "ordered-forward-gates",
    verification: "app-preview-real-drive-three-laps" });
  const materials = [...prepared.fact.event.input.card.documents, first.basis.criteria];
  const artifact = async (root: string, oid: string, file: string) =>
    execFileSync("git", ["--no-optional-locks", "show", oid + ":" + file], { cwd: root, windowsHide: true });
  const initialEntry = await artifact(source, r18LiveInitial, "index.html");
  const initialText = initialEntry.toString("utf8");
  const proseEntry = await artifact(source, r18LiveProse, "index.html");
  const nestedLine = (entry: string) => entry.split(/\r?\n/).findIndex(line => /<noscript><div\b/.test(line)) + 1;
  assert.ok(nestedLine(initialText) > 0 && nestedLine(proseEntry.toString("utf8")) > 0);
  assert.notEqual(digest(initialEntry), digest(proseEntry));
  assert.deepEqual(git(source, "diff", "--name-only", r18LiveInitial, r18LiveProse).split("\n"), ["index.html"]);
  const pureText = initialText.replace(/<noscript><div class="noscript">([^<]+)<\/div><\/noscript>/, "<noscript>$1</noscript>");
  assert.notEqual(initialText, pureText);
  const unsigned = (entry: string) => entry.replace('<script type="module"', '<script>void 0;</script>\n  <script type="module"');
  const cases = [
    { name: "historical-nested", old: first, bytes: initialEntry, change: false, diagnostic: "noscript" },
    { name: "historical-later-prose", old: prose, bytes: proseEntry, change: false, diagnostic: "noscript" },
    { name: "unsigned-inline", old: first, bytes: Buffer.from(unsigned(pureText)), change: true, diagnostic: "script" },
    { name: "combined", old: first, bytes: Buffer.from(unsigned(initialText)), change: true, diagnostic: "both" },
    { name: "generic", old: first, bytes: Buffer.from(pureText.replace("<body>", "<body>\0")), change: true, diagnostic: "generic" },
    { name: "same-original-module-with-pure-noscript", old: first, bytes: Buffer.from(pureText), change: true, diagnostic: "prepared" },
  ] as const;
  const packageRoot = path.join(baselineResources, "app");
  const provider = await import(pathToFileURL(path.join(packageRoot, "src/provider/durable-workflow/public.ts")).href) as
    typeof import("../../../src/provider/durable-workflow/public.ts");
  const { DesktopDurableWorkflow: Controller } = await import(pathToFileURL(path.join(packageRoot, "app/desktop/durable-workflow.ts")).href) as
    typeof import("../../../app/desktop/durable-workflow.ts");
  const workspace = await historicalWorkspace(baselineResources);
  t.after(async () => {
    assert.equal(refs(), historicalRefs);
    assert.equal(git(source, "--no-optional-locks", "status", "--porcelain"), "");
    assert.deepEqual(readHistoricalCheckpoint(sqlite, r18LiveId, r18LiveCriteriaSha), saved);
    assert.equal(digest(await readFile(snapshotName)), r18LiveSnapshotSha);
    for (const item of materials) assert.equal(digest(await readFile(path.join(source, item.path))), item.sha256);
    t.diagnostic(JSON.stringify({ event: "r19-r18-historical-before-after", originalRefs: historicalRefs, snapshot: r18LiveSnapshotSha, materials }));
  });
  for (const item of cases) await t.test(item.name, async leaf => {
    const f = await emptyFixture();
    execFileSync("git", ["clone", "--no-hardlinks", "--no-checkout", "--", source, f.root], { stdio: "pipe", windowsHide: true });
    git(f.root, "config", "core.autocrlf", "false");
    git(f.root, "checkout", "-B", baseline.branch, item.old.basis.candidateOid);
    git(f.root, "branch", "-f", "main", r18LiveMain);
    git(f.root, "remote", "remove", "origin");
    if (item.change) {
      await writeFile(path.join(f.root, "index.html"), item.bytes);
      git(f.root, "add", "--", "index.html");
      git(f.root, "-c", "user.name=ANS isolation", "-c", "user.email=r19@test.invalid", "commit", "-m", "Isolated diagnostic control");
    }
    const candidateOid = git(f.root, "rev-parse", "HEAD");
    assert.deepEqual(await artifact(f.root, candidateOid, "index.html"), item.bytes);
    for (const material of materials) {
      const target = path.join(f.root, material.path);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(source, material.path), target);
      assert.equal(digest(await readFile(target)), material.sha256);
    }
    const repo = await provider.repositoryIdentity(f.root);
    const ledger = new provider.DurableLedger(path.join(f.userDataRoot, "business"));
    const taskId = item.old.basis.assessmentTask.taskId;
    const attempt = item.old.basis.assessmentTask.stageAttempt;
    const { ref } = saved.value;
    const task = graph.tasks.find(task => task.taskId === taskId);
    assert.ok(task && task.state === "pending");
    try {
      const owner = { engine: "dapr" as const, instanceId: r18LiveId, dataDir: ledger.dataDir };
      provider.reserveWorkspace(repo.root, { ...owner, projectId: ref.projectId, requestId: saved.value.requestId,
        fingerprint: saved.value.startupFingerprint!, state: "active", source: "preset", definition: saved.value.definition });
      assert.ok(provider.reserveOwner(repo, owner));
      const proofs: Record<string, string> = { ...graph.proofs, implementationTip: candidateOid };
      delete proofs["preparation-rework-observation"];
      ledger.transaction(() => {
        ledger.pin(ref.projectId, saved.value.definition);
        ledger.save({ ...saved.value, projectRoot: repo.root, commonDir: repo.commonDir, stepId: "assess", entry: item.old.entry, attempt,
          status: "waiting", engine: "healthy", businessReason: undefined, engineReason: undefined, scheduled: false, visits: {},
          graph: { ...graph, proofs, tasks: graph.tasks.filter(row => row.attempt <= attempt) } });
        ledger.saveEvidence(r18LiveId, r18LiveCriteriaSha, saved.criteriaBytes);
        for (const row of saved.facts) if (row.receipt.state === "consumed"
          && (row.fact.stepId !== "assess" && row.fact.attempt <= attempt || row.fact.key === "workflow-bind:" + taskId)) ledger.saveFact(r18LiveId, row);
        for (const row of saved.effects) if (row.intent.stepId !== "assess" && row.intent.attempt <= attempt) ledger.saveEffect(r18LiveId, row);
      });
    } finally { ledger.close(); }
    const desktop = new Controller({ userDataRoot: f.userDataRoot, resourceRoot: resourceRoot!, presetRoot: packageRoot });
    leaf.after(() => desktop.close());
    const store = await desktop.store();
    const view = store.lookup(ref);
    assert.ok(view?.acceptanceWorkspace?.preparationGate);
    assert.equal(view.acceptanceWorkspace.basis.candidateOid, candidateOid);
    assert.equal(view.acceptanceWorkspace.basis.assessmentTask.taskId, taskId);
    const signedPlan = view.verificationPlan;
    assert.ok(signedPlan);
    assert.ok(signedPlan?.requirements.some(requirement => requirement.stage === "A12b" && requirement.capability === "workspace-browser"));
    assert.deepEqual(view.proposalDecision?.values, approvedValues);
    assert.equal((await workspace.prepareDesktopAcceptanceWorkspace(store, view, task, true)).hold, true);
    const after = store.lookup(ref)?.acceptanceWorkspace;
    assert.ok(after?.preparation && after.prepareKey === view.acceptanceWorkspace.prepareKey);
    const { result } = after.preparation;
    if (item.diagnostic === "prepared") {
      assert.equal(result.kind, "prepared");
      const binding = after.binding;
      assert.ok(binding?.operation === "static" && binding.staticRequirements?.build === false);
      assert.deepEqual(await readFile(path.join(binding.inputRoot, "index.html")), item.bytes);
      assert.deepEqual(await readFile(path.join(binding.inputRoot, "src/main.js")), await artifact(source, r18LiveInitial, "src/main.js"));
      assert.deepEqual(await readdir(binding.outputRoot), []);
    } else {
      assert.ok(result.kind === "candidate-defect");
      assert.equal(result.code, "static-entry-rejected");
      assert.deepEqual(result.paths, [{ path: "index.html", state: "present" }]);
      assert.equal(result.candidate.oid, candidateOid);
      assert.equal(after.binding, undefined);
      assert.equal(store.acceptanceDispatchPermit(ref, task.task).ok, false);
      assert.equal(store.listEffects(ref, "acceptance-workspace-prepare").length, 0);
      if (r19DiagnosticMode === "control") {
        assert.equal(result.reason, "当前候选的 index.html 未通过签发静态入口的安全核验。");
      } else {
        const html = item.bytes.toString("utf8");
        if (item.diagnostic === "noscript" || item.diagnostic === "both") {
          assert.ok(result.reason.includes("index.html 第 " + nestedLine(html) + " 行的正文 noscript 含子标签"));
        }
        if (item.diagnostic === "script" || item.diagnostic === "both") {
          const scriptLine = html.split(/\r?\n/).findIndex(line => line.includes("<script>void 0;</script>")) + 1;
          assert.ok(result.reason.includes("index.html 第 " + scriptLine + " 行的脚本未通过当前签发脚本规则"));
        }
        if (item.diagnostic === "generic") assert.match(result.reason, /无法按签发静态入口安全核验/);
        assert.doesNotMatch(result.reason, /<div\b|void 0|[A-Za-z]:[\\/]/i);
      }
    }
    assert.equal(store.listEffects(ref).some(row => row.intent.task?.taskId === taskId
      && ["acceptance-workspace-run", "acceptance-workspace-browser-capture", "model-send", "dispatch"].includes(row.intent.kind)), false);
    leaf.diagnostic(JSON.stringify({ event: "r19-original-object-classification", name: item.name, isolatedGit: candidateOid, replayRoot: f.root,
      originalBase: item.old.basis.candidateOid, entrySha: digest(item.bytes), result, verificationPlan: signedPlan.standard }));
  });
});
