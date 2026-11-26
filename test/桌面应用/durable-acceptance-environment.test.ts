import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { acceptanceEnvironmentRestore, acceptedAcceptanceDependencyProof, confirmAcceptanceEnvironmentAssessment, mirrorAcceptanceEnvironmentClosures, prepareAcceptanceEnvironmentDispatch, recordAcceptanceEnvironmentReport, verifyAcceptanceEnvironment } from "../../app/desktop/durable-acceptance-environment.ts";
import type { DesktopDurableWorkflow } from "../../app/desktop/durable-workflow.ts";
import type { LiveSession } from "../../app/desktop/session/contracts/session-types.ts";
import { prepareAcceptanceNpm } from "../../app/desktop/governed-package-lock.ts";
import { inspectAcceptanceDependencies } from "../../app/desktop/workflow-git.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { DurableAcceptanceEnvironmentBasis, DurableAcceptanceEnvironmentMissing, DurableCapabilityEvent, DurableEffectIntent, DurableEffectRecord, DurableFactReceipt, DurableProjection, DurableTaskBinding } from "../../src/model/durable-workflow.ts";

const criteria = "按项目脚本执行本地构建并查看构建结果。\n";
const manifest = Buffer.from(JSON.stringify({
  name: "example-project",
  version: "1.0.0",
  scripts: { build: "esbuild src.js", start: "node dist/index.js" },
  devDependencies: { esbuild: "0.25.0" },
}));

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}

async function candidate(t: TestContext, lock?: Buffer, candidateCriteria = criteria, candidateManifest = manifest) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "ans-environment-desktop-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }));
  git(root, "init", "-b", "ans/task/candidate");
  await mkdir(path.join(root, "docs", "quality"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), ".ans/\ndocs/quality/\nnode_modules/\n");
  await writeFile(path.join(root, "package.json"), candidateManifest);
  if (lock) await writeFile(path.join(root, "package-lock.json"), lock);
  const criteriaPath = "docs/quality/demo-criteria-v1.md";
  await writeFile(path.join(root, criteriaPath), candidateCriteria);
  git(root, "add", "--", ".");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "candidate");
  const basis: DurableAcceptanceEnvironmentBasis = {
    candidateOid: git(root, "rev-parse", "HEAD"), branch: "ans/task/candidate",
    criteria: { path: criteriaPath, sha256: createHash("sha256").update(candidateCriteria).digest("hex") },
    assessmentTask: { stage: "A12b", stageAttempt: 1, executionAttempt: 1, parentTaskId: "instance", taskId: "assessment", roleId: "verifier" },
  };
  return { root, basis };
}

test("preflight binds the actual missing executable to the approved project build without parsing an error message", async t => {
  const { root, basis } = await candidate(t);
  const verified = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(verified.ok, true, JSON.stringify(verified));
  if (!verified.ok) return;
  assert.deepEqual(verified.value?.condition, { kind: "npm-local-executable", script: "build", executable: "esbuild" });
  assert.equal(verified.value?.present, false);
  assert.equal(verified.value?.buildRequiredByStandard, true);
  assert.equal(verified.value?.lock, undefined);
  assert.deepEqual(await readFile(path.join(root, "package.json")), manifest);
  assert.equal(git(root, "status", "--porcelain"), "");
  await writeFile(path.join(root, basis.criteria.path), criteria + "changed\n");
  const drift = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(!drift.ok && drift.code, "workflow-environment-criteria-drift");
});

test("build and startup evidence wording selects a declared compiler without naming npm or its package", async t => {
  const standard = "独立复核者记录构建/启动指令及结果、运行环境和候选提交。\n在声明的目标环境可启动并呈现可操作的应用。";
  const { root, basis } = await candidate(t, undefined, standard);
  const verified = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(verified.ok, true, JSON.stringify(verified));
  if (!verified.ok) return;
  assert.deepEqual(verified.value?.condition, { kind: "npm-local-executable", script: "build", executable: "esbuild" });
  assert.equal(verified.value?.present, false);
});

test("startup criteria admit the candidate's declared development entry and prioritize explicit commands", async t => {
  const named = Buffer.from(JSON.stringify({
    name: "example-project", version: "1.0.0", scripts: { build: "tsc && esbuild src.js", dev: "parcel src.html" },
    devDependencies: { esbuild: "0.25.0", parcel: "2.0.0" },
  }));
  const scenarios = [
    { standard: "首条要求在声明的目标环境可启动。", script: "dev", executable: "parcel" },
    { standard: "Record build/startup commands and results. Run `npm run dev` for review.", script: "dev", executable: "parcel" },
  ];
  for (const { standard, script, executable } of scenarios) {
    const { root, basis } = await candidate(t, undefined, standard, named);
    const verified = await verifyAcceptanceEnvironment(root, basis);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.deepEqual(verified.ok && verified.value?.condition, { kind: "npm-local-executable", script, executable });
  }
});

test("the adopted build and startup standard uses a direct launch fallback without laundering an attempted build failure", async t => {
  const standard = "独立复核者记录构建/启动指令及结果、运行环境和候选提交。\n在声明的目标环境可启动并呈现可操作的应用。";
  const declared = Buffer.from(JSON.stringify({
    name: "example-project", version: "1.0.0", scripts: { build: "tsc --noEmit && vite build", dev: "vite", typecheck: "tsc --noEmit", test: "vitest run" },
    dependencies: { three: "^0.177.0" }, devDependencies: { "@types/three": "^0.177.0", typescript: "^5.8.3", vite: "^6.3.5", vitest: "^3.2.4" },
  }));
  const { root, basis } = await candidate(t, undefined, standard, declared);
  const condition = { kind: "npm-local-executable", script: "dev", executable: "vite" } as const;
  const checked = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  if (!checked.ok || !checked.value) return;
  assert.deepEqual(checked.value.condition, condition);
  assert.deepEqual(checked.value.requiredScripts, ["build", "dev"]);
  assert.equal(checked.value.present, false);
  const reportPath = "docs/quality/demo-report-v1.md";
  const reportBytes = `---\ncandidateOid: ${basis.candidateOid}\noutcome: blocked\nenvironmentMissing: { script: "dev", executable: "vite" }\n---\n# Report\n`;
  await writeFile(path.join(root, reportPath), reportBytes);
  type ReportInput = Parameters<typeof recordAcceptanceEnvironmentReport>[0];
  const view = { ref: { instanceId: "instance" }, projectRoot: root, status: "waiting", engine: "healthy", stepId: "assess", attempt: 1,
    acceptanceEnvironment: { enabled: true, basis } } as ReportInput["view"];
  const pending = { taskId: basis.assessmentTask.taskId, roleId: basis.assessmentTask.roleId, task: basis.assessmentTask,
    stepId: view.stepId, attempt: view.attempt } as ReportInput["pending"];
  const supplied: DurableAcceptanceEnvironmentMissing[] = [];
  const effects: DurableEffectRecord[] = [];
  const store = {
    lookup: () => view, listEffects: () => effects,
    recordAcceptanceEnvironmentMissing: (_ref: unknown, missing: DurableAcceptanceEnvironmentMissing, current: () => boolean) => {
      assert.ok(current());
      supplied.push(missing);
      return Promise.resolve({ ok: true, value: { state: "consumed" } });
    },
  } as unknown as ReportInput["store"];
  const input: ReportInput = { store, view, pending, reportKey: "report:original", originId: "verifier-turn",
    report: { path: "ans-evidence/fixture", sha256: "fixture" }, artifact: { path: reportPath, sha256: createHash("sha256").update(reportBytes).digest("hex") } };
  assert.deepEqual(await recordAcceptanceEnvironmentReport(input), { ok: true, value: "recorded" });
  assert.deepEqual(supplied[0]?.condition, condition);
  const observation = (script: string, decision: string, missingExecutable: string, verifiedExit: string): DurableEffectRecord => ({
    token: "observed", state: "succeeded",
    intent: { key: "check", kind: "acceptance-check-command", stepId: view.stepId, attempt: view.attempt, task: pending.task },
    result: { key: "check", token: "observed", outcome: "succeeded", evidence: "test fixture",
      result: { script, decision, missingExecutable, verifiedExit, turnId: input.originId, receiptId: "actual-result" } },
  });
  for (const attempted of [observation("build", "denied", "", ""), observation("build", "allowed", "", "1"),
    observation("dev", "allowed", "tsc", "1"), observation("dev", "allowed", "", "0")]) {
    effects[0] = attempted;
    assert.deepEqual(await recordAcceptanceEnvironmentReport(input), { ok: true, value: "ordinary" });
  }
  effects[0] = observation("dev", "allowed", "vite", "1");
  assert.deepEqual(await recordAcceptanceEnvironmentReport(input), { ok: true, value: "recorded" });
  assert.equal(supplied[1]?.commandReceiptId, "actual-result");
});

test("prose cannot create a restoration condition for projects without an eligible or declared executable", async t => {
  const incidental = await candidate(t, undefined, "核对交付说明、审查提交。", Buffer.from(JSON.stringify({
    name: "example-project", version: "1.0.0", scripts: { lint: "eslint src" }, devDependencies: { eslint: "8.0.0" },
  })));
  assert.deepEqual(await verifyAcceptanceEnvironment(incidental.root, incidental.basis), { ok: true, value: undefined });
  const unbound = await candidate(t, undefined, "记录构建/启动指令及结果。", Buffer.from(JSON.stringify({
    name: "example-project", version: "1.0.0", scripts: { build: "unlisted-compiler src.js" },
    devDependencies: { esbuild: "0.25.0" },
  })));
  const verified = await verifyAcceptanceEnvironment(unbound.root, unbound.basis);
  assert.equal(!verified.ok && verified.code, "workflow-environment-script-unsupported");
});

test("the two field standards and unrelated localized wording give the same uninstalled candidate condition", async t => {
  const candidateManifest = Buffer.from(JSON.stringify({
    name: "example-project", version: "1.0.0", scripts: { build: "tsc --noEmit && vite build", dev: "vite" },
    devDependencies: { typescript: "^5.8.3", vite: "^6.3.5" },
  }));
  for (const wording of [
    "独立复核者记录构建/启动指令及结果、运行环境和候选提交。在声明的目标环境可启动。",
    "在干净的约定环境按交付说明安装/启动。保留独立的验收记录。",
    "Assess the approved candidate in its agreed setting. Retain independent evidence.",
  ]) {
    const { root, basis } = await candidate(t, undefined, wording, candidateManifest);
    const verified = await verifyAcceptanceEnvironment(root, basis);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.deepEqual(verified.ok && verified.value?.condition, { kind: "npm-local-executable", script: "dev", executable: "vite" });
    assert.equal(verified.ok && verified.value?.present, false);
  }
});

test("the bound assessment holds for a pending local preflight fact and defers to formal review after any delivery", async t => {
  const { root, basis } = await candidate(t, undefined, "Independently assess the approved candidate.");
  type Input = Parameters<typeof prepareAcceptanceEnvironmentDispatch>;
  const pending = { taskId: basis.assessmentTask.taskId, roleId: basis.assessmentTask.roleId, task: basis.assessmentTask,
    flowId: "demo", stepId: "assess", attempt: 1, state: "pending", capability: "independent-assessment" } as Input[2];
  const view: Input[1] = { ref: { instanceId: "instance", projectId: "project", definitionId: "path-a", definitionVersion: 7, definitionDigest: "fixture",
    executor: "ans-durable-definition-v2", activityContract: 2 },
    schema: 2, workflowOwnedDispatch: true, action: "independent-assessment", definitionName: "Fixture", stepName: "Independent assessment",
    pendingFacts: 0, metadata: {},
    projectRoot: root, status: "waiting", engine: "healthy", flowId: "demo", stepId: "assess", attempt: 1, pendingTasks: [pending],
    acceptanceEnvironment: { enabled: true, basis, state: "assessment", attempts: 0, maxAttempts: 2 } };
  let live = view;
  const effects: DurableEffectRecord[] = [];
  const facts: { event: DurableCapabilityEvent; receipt: DurableFactReceipt }[] = [];
  const captured: DurableAcceptanceEnvironmentMissing[] = [];
  assert.equal((await appendTaskEvent(root, taskEvent("task.created", { taskId: "earlier", from: "convener", to: "maintainer",
    stage: "A11", flowId: pending.flowId, workflowId: view.ref.instanceId, text: "Prepare", sideEffect: "code", idempotencyKey: "earlier" }))).ok, true);
  assert.equal((await appendTaskEvent(root, taskEvent("task.closed", { taskId: "earlier", by: "convener", outcome: "accepted",
    eventId: "legacy-close" }))).ok, true);
  assert.deepEqual((await readTaskState(root)).errors.map(error => error.message), ["task.closed direct creator/source binding invalid"]);
  const store = {
    lookup: () => live,
    listEffects: () => effects,
    listCapabilityEvents: () => facts,
    recordAcceptanceEnvironmentMissing: (_ref: unknown, missing: DurableAcceptanceEnvironmentMissing, current: () => boolean) => {
      assert.ok(current());
      captured.push(missing);
      const receipt = { key: "preflight", state: "pending" as const };
      facts.push({ receipt, event: { key: receipt.key, stepId: view.stepId, attempt: view.attempt, flowId: pending.flowId,
        source: { roleId: "host", originId: "test" }, input: { kind: "environment-missing", missing } } });
      return Promise.resolve({ ok: true, value: receipt });
    },
  } as unknown as Input[0];
  assert.deepEqual(await prepareAcceptanceEnvironmentDispatch(store, view, pending), { hold: true });
  assert.deepEqual(captured[0], { origin: "preflight", basis, manifest: { path: "package.json", sha256: createHash("sha256").update(manifest).digest("hex") },
    lock: undefined, condition: { kind: "npm-local-executable", script: "build", executable: "esbuild" } });
  assert.deepEqual(await prepareAcceptanceEnvironmentDispatch(store, view, pending), { hold: true });
  assert.equal(captured.length, 1);
  facts.length = 0;
  live = { ...view, attempt: 2 };
  assert.deepEqual(await prepareAcceptanceEnvironmentDispatch(store, view, pending), { hold: true });
  live = view;
  for (const [kind, state] of [["dispatch", "claimed"], ["model-send", "unknown"], ["model-send", "not-started"]] as const) {
    effects[0] = { token: "effect", state, intent: { key: kind, kind, stepId: view.stepId, attempt: view.attempt, task: pending.task } };
    const result = await prepareAcceptanceEnvironmentDispatch(store, view, pending);
    assert.equal(result.hold, false);
    assert.match(!result.hold ? result.instructions : "", /正式报告/);
  }
  effects.length = 0;
  const created = await appendTaskEvent(root, taskEvent("task.created", { taskId: pending.taskId, from: "convener", to: pending.roleId,
    stage: "A12b", flowId: pending.flowId, workflowId: view.ref.instanceId, text: "Review", sideEffect: "docs", idempotencyKey: "assigned" }));
  assert.equal(created.ok, true);
  assert.equal((await prepareAcceptanceEnvironmentDispatch(store, view, pending)).hold, false);
  assert.deepEqual(await prepareAcceptanceEnvironmentDispatch(store, { ...view, acceptanceEnvironment: undefined }, pending), { hold: false, instructions: "" });
  assert.equal(captured.length, 1);

  const bin = path.join(root, "node_modules", ".bin");
  const dependency = path.join(root, "node_modules", "esbuild");
  await Promise.all([mkdir(bin, { recursive: true }), mkdir(dependency, { recursive: true })]);
  await Promise.all([writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: "esbuild", bin: "cli.js" })),
    writeFile(path.join(dependency, "cli.js"), "// test fixture\n")]);
  if (process.platform === "win32") await writeFile(path.join(bin, "esbuild.cmd"), '@echo "%~dp0..\\esbuild\\cli.js"\r\n');
  else await symlink("../esbuild/cli.js", path.join(bin, "esbuild"));
  const rerun: Input[1] = { ...view, acceptanceEnvironment: { ...view.acceptanceEnvironment!, state: "rechecking", attempts: 1 } };
  assert.deepEqual(await confirmAcceptanceEnvironmentAssessment(store, view, pending, "verification-turn"), { ok: true, value: true });
  const unverified = await confirmAcceptanceEnvironmentAssessment(store, rerun, pending, "verification-turn");
  assert.equal(!unverified.ok && unverified.code, "workflow-environment-assessment-unexercised");
  effects.push({ token: "test", state: "succeeded", intent: { key: "build", kind: "acceptance-check-command", stepId: view.stepId,
    attempt: view.attempt, task: pending.task }, result: { key: "build", token: "test", outcome: "succeeded", evidence: "fixture",
    result: { turnId: "verification-turn", script: "build", decision: "allowed", verifiedExit: "0" } } });
  assert.deepEqual(await confirmAcceptanceEnvironmentAssessment(store, rerun, pending, "verification-turn"), { ok: true, value: true });

  const { basis: originalBasis, manifest: originalManifest, condition: originalCondition } = captured[0]!;
  const receipt = { key: "already-consumed", state: "consumed" as const };
  facts.push({ receipt, event: { key: receipt.key, stepId: view.stepId, attempt: view.attempt, flowId: pending.flowId,
    source: { roleId: "host", originId: "test" }, input: { kind: "environment-missing", missing: { origin: "report",
      basis: originalBasis, manifest: originalManifest, condition: originalCondition, originId: "verification-turn",
      reportKey: "formal", report: { path: "ans-evidence/fixture", sha256: "fixture" } } } } });
  await mirrorAcceptanceEnvironmentClosures(store, view);
  await mirrorAcceptanceEnvironmentClosures(store, view);
  const journal = await readTaskState(root);
  assert.equal(journal.records.get(pending.taskId)?.closed?.outcome, "rejected");
  assert.equal(journal.events.filter(event => event.kind === "task.closed" && event.taskId === pending.taskId).length, 1);
  assert.equal(journal.errors.length, 1);
});

test("preflight preserves an existing install tree and rejects project npm config", async t => {
  const { root, basis } = await candidate(t);
  await mkdir(path.join(root, "node_modules"));
  const existing = path.join(root, "node_modules", "user-file.txt");
  await writeFile(existing, "retained");
  const present = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(!present.ok && present.code, "workflow-environment-install-target-owned");
  assert.equal(await readFile(existing, "utf8"), "retained");
  await writeFile(path.join(root, ".npmrc"), "registry=https://another-registry.invalid/\n");
  const unsafe = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(!unsafe.ok && unsafe.code, "workflow-environment-package-source");
  assert.equal(await readFile(existing, "utf8"), "retained");
});

test("workspaced rework requires a current consumed attestation and retains the earlier root tree", async t => {
  const build = Buffer.from(JSON.stringify({ name: "example-project", version: "1.0.0",
    scripts: { build: "tsc --noEmit && vite build", dev: "vite" }, devDependencies: { vite: "7.3.1", typescript: "5.9.3" } }));
  const { root, basis: initial } = await candidate(t, undefined, criteria, build);
  await mkdir(path.join(root, "node_modules"));
  const kept = path.join(root, "node_modules", "previous-run.txt");
  await writeFile(kept, "Previous installation remains");
  await writeFile(path.join(root, "index.html"), "<h1>reworked</h1>");
  git(root, "add", "--", "index.html");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "reworked candidate");
  const basis = { ...initial, candidateOid: git(root, "rev-parse", "HEAD"), assessmentTask: { ...initial.assessmentTask, stageAttempt: 7 } };
  const task = basis.assessmentTask;
  type Params = Parameters<typeof prepareAcceptanceEnvironmentDispatch>;
  const pending: Params[2] = { taskId: task.taskId, task, roleId: task.roleId, stepId: "assess", flowId: "demo", attempt: 7, state: "pending",
    capability: "independent-assessment", dispatch: { actor: "application", text: "Verify" } };
  const view: Params[1] = { ref: { instanceId: "instance", projectId: "project", definitionId: "path-a", definitionVersion: 7,
    definitionDigest: "fixture", executor: "ans-durable-definition-v2", activityContract: 2 },
  schema: 2, workflowOwnedDispatch: true, action: "independent-assessment", definitionName: "Fixture", stepName: "Assess", pendingFacts: 0,
  metadata: {}, projectRoot: root, status: "waiting", engine: "healthy", flowId: "demo", stepId: "assess", attempt: 7, pendingTasks: [pending],
  acceptanceWorkspace: { basis, state: "eligible", prepareKey: "prepare", runKey: "run", closeKey: "close", evidenceKey: "evidence" },
  acceptanceEnvironment: { enabled: true, basis, state: "assessment", attempts: 1, maxAttempts: 2 } };
  const events: ReturnType<Params[0]["listCapabilityEvents"]>[number][] = [];
  const effects: DurableEffectRecord[] = [];
  const bodies = new Map<string, unknown>();
  const record = (input: DurableCapabilityEvent["input"]) => events.push({ event: {
    key: input.kind, stepId: view.stepId, attempt: view.attempt, flowId: pending.flowId, source: { roleId: "host", originId: "fixture" }, input,
  }, receipt: { key: input.kind, state: "consumed" } });
  const store = { lookup: () => view, listCapabilityEvents: () => events, listEffects: () => effects,
    getEvidence: (_ref: unknown, proof: { sha256: string }) => bodies.get(proof.sha256),
    recordAcceptanceEnvironmentMissing: (_ref: unknown, missing: DurableAcceptanceEnvironmentMissing, isCurrent: () => boolean) => {
      assert.ok(isCurrent());
      record({ kind: "environment-missing", missing });
      return Promise.resolve({ ok: true, value: { key: "missing", state: "pending" } });
    } } as unknown as Params[0];
  assert.deepEqual(await prepareAcceptanceEnvironmentDispatch(store, view, pending), { hold: true });
  const captured = events[0]?.event.input;
  assert.equal(captured?.kind, "environment-missing");
  const missing = captured.missing;
  assert.equal(missing.installTarget, "assessment-private");
  assert.equal(missing.basis.candidateOid, basis.candidateOid);

  const parentTask: DurableTaskBinding = { ...task, taskId: "operations", roleId: "convener", stageAttempt: 2 };
  const childTask: DurableTaskBinding = { ...parentTask, taskId: "restore-current", roleId: "maintainer", parentTaskId: parentTask.taskId };
  const parent = path.join(root, ".ans", "acceptance-deps", childTask.taskId);
  const actual = path.join(parent, "node_modules");
  await mkdir(path.join(actual, "vite", "bin"), { recursive: true });
  await writeFile(path.join(actual, "vite", "bin", "vite.js"), "export const installedFixture = true;");
  const observedId = async (dir: string) => {
    const stat = await lstat(dir, { bigint: true });
    return { dev: String(stat.dev), ino: String(stat.ino) };
  };
  const identity = await observedId(actual);
  const sha = await inspectAcceptanceDependencies(parent);
  const id = "a".repeat(64);
  const evidence = { path: "ans-evidence/" + "b".repeat(64), sha256: "b".repeat(64) };
  const effectKey = `environment-install:${childTask.taskId}`;
  effects.push({ token: "fixture", state: "succeeded", intent: { key: effectKey, kind: "environment-install", stepId: "restore", attempt: 2, task: childTask },
    result: { key: effectKey, token: "fixture", evidence: "test receipt", outcome: "succeeded", result: { commandReceiptId: id } } });
  const location = { path: actual, identity };
  const installed = { kind: "npm-environment-install", decision: "allowed", result: "installed", candidateOid: basis.candidateOid, taskId: childTask.taskId,
    process: { status: "exited", exitCode: 0, pid: 33 }, git: { root, branch: basis.branch }, dependenciesSha256: sha, dependenciesLocation: location,
    acceptanceEnvironmentScope: { instanceId: view.ref.instanceId, flowId: view.flowId, taskId: childTask.taskId, publishDirectory: actual,
      publishIdentity: await observedId(parent) } };
  bodies.set(id, { ...installed, candidateOid: initial.candidateOid });
  bodies.set(evidence.sha256, { kind: "npm-local-executable-verified", commandReceiptId: id, taskId: childTask.taskId, candidateOid: basis.candidateOid,
    criteria: basis.criteria, manifest: missing.manifest, dependenciesSha256: sha, dependenciesLocation: location });
  record({ kind: "environment-recovery-settled", settlement: { parentTask, childTask,
    outcome: { kind: "restored", commandReceiptId: id, verification: evidence } } });
  assert.equal(await acceptedAcceptanceDependencyProof(store, view, basis, missing), undefined);
  bodies.set(id, installed);
  assert.deepEqual(await acceptedAcceptanceDependencyProof(store, view, basis, missing), { receiptId: id, parent, path: actual, identity, sha256: sha });
  await writeFile(path.join(actual, "unverified.txt"), "private tree drift");
  assert.equal(await acceptedAcceptanceDependencyProof(store, view, basis, missing), undefined);
  assert.equal(await readFile(kept, "utf8"), "Previous installation remains");
});

test("approval inputs use ci only for a verified lock and otherwise forbid creating one", async t => {
  const lock = Buffer.from(JSON.stringify({ name: "example-project", version: "1.0.0", lockfileVersion: 3,
    packages: {
      "": { name: "example-project", version: "1.0.0", devDependencies: { esbuild: "0.25.0" } },
      "node_modules/esbuild": { version: "0.25.0", resolved: "https://registry.npmjs.org/esbuild/-/esbuild-0.25.0.tgz", integrity: "sha512-YWJj", bin: { esbuild: "bin/esbuild" } },
    },
  }));
  const { root, basis } = await candidate(t, lock);
  const checked = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.ok && checked.value?.present, false);
  if (!checked.ok || !checked.value) return;
  assert.equal(checked.value.lock?.sha256, createHash("sha256").update(lock).digest("hex"));
  for (const bytes of [checked.value.lockBytes, undefined]) {
    const prepared = await prepareAcceptanceNpm(root, checked.value.isolatedManifest, bytes);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) continue;
    t.after(prepared.value.dispose);
    const { cwd, argv } = prepared.value;
    assert.equal(path.dirname(cwd), path.join(root, ".ans"));
    assert.equal(argv[1], bytes ? "ci" : "install");
    assert.equal(argv.includes("--no-package-lock"), !bytes);
    assert.ok(argv.includes("--ignore-scripts") && argv.includes("--registry=https://registry.npmjs.org/") && argv.includes("--allow-remote=none"));
    assert.equal(await readFile(path.join(cwd, "user.npmrc"), "utf8"), "");
    assert.equal(await readFile(path.join(cwd, "global.npmrc"), "utf8"), "");
    assert.equal(Object.hasOwn(JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")), "scripts"), false);
  }
});

for (const privateInstall of [false, true]) test(`the bound desktop restore pins the ${privateInstall ? "private" : "root"} publish target before approval`, async t => {
  const { root, basis } = await candidate(t);
  const inspected = await verifyAcceptanceEnvironment(root, basis);
  assert.ok(inspected.ok && inspected.value);
  const bound: DurableTaskBinding = { ...basis.assessmentTask, taskId: "restore-task", roleId: "maintainer", parentTaskId: "operations" };
  const stepId = "environment";
  const flowId = "flow";
  const ref = { instanceId: "instance", projectId: "project", definitionId: "path-a", definitionVersion: 7, definitionDigest: "fixture",
    executor: "ans-durable-definition-v2", activityContract: 2 };
  const effectKey = `environment-install:${bound.taskId}`;
  const oldTree = path.join(root, "node_modules");
  const retained = path.join(oldTree, "untouched.txt");
  if (privateInstall) {
    await mkdir(oldTree);
    await writeFile(retained, "User dependencies remain");
  }
  const view: DurableProjection = {
    ref, schema: 2, workflowOwnedDispatch: true, action: "operations-environment-recovery", definitionName: "Fixture", stepName: "Restore",
    pendingFacts: 0, metadata: {}, projectRoot: root, status: "waiting", engine: "healthy", flowId, stepId, attempt: 1,
    pendingTasks: [{ task: bound, taskId: bound.taskId, roleId: bound.roleId, stepId, flowId, attempt: 1, state: "pending",
      environmentRecovery: "child", capability: "operations-environment-recovery", dispatch: { actor: "application", text: "Restore" } }],
    acceptanceEnvironment: { enabled: true, basis, state: "recovering", attempts: 1, maxAttempts: 2, childTask: bound, effectKey,
      missing: { origin: "preflight", basis, manifest: inspected.value.manifest, condition: inspected.value.condition,
        ...(privateInstall ? { installTarget: "assessment-private" } : {}) } },
  };
  const receipts: Record<string, unknown>[] = [];
  const effects: DurableEffectRecord[] = [];
  const store = { lookup: () => view, listEffects: () => effects,
    async claimEffect(_ref: unknown, intent: DurableEffectIntent) {
      effects.push({ intent, token: "claim", state: "claimed" });
      return { ok: true, value: { token: "claim", execute: true } };
    },
    storeEvidence(_ref: unknown, body: Record<string, unknown>) {
      receipts.push(body);
      return { ok: true, value: { sha256: "receipt" } };
    },
    async settleEffect() { return { ok: true, value: true }; },
  };
  const durable = { lookup: async () => view, store: async () => store, delivery: () => ({
    ref, roleId: bound.roleId, runtime: "claude", intent: { stepId, attempt: 1, task: bound },
  }) } as unknown as DesktopDurableWorkflow;
  const signal = new AbortController().signal;
  const entry = { projectRoot: root, roleId: bound.roleId, runtime: "claude", assignedTaskId: bound.taskId, busy: true,
    origins: { running: { turnId: "turn", taskId: bound.taskId, clientMessageId: "message" } },
    interactionState: { turn: { signal }, lifetime: { signal } } } as unknown as LiveSession;
  const prepare = acceptanceEnvironmentRestore(durable, () => entry, async () => ({ ok: true, value: true }));
  const call = { cwd: root, turnId: "turn", roleId: bound.roleId, toolCallId: "call" };
  assert.equal((await prepare({ ...call, turnId: "retired" })).ok, false);
  assert.equal(effects.length, 0);
  const prepared = await prepare(call);
  assert.ok(prepared.ok);
  const { acceptanceEnvironmentScope: scope, cwd, argv, isCurrent, executeApproved } = prepared.value;
  const identity = await lstat(cwd, { bigint: true });
  assert.deepEqual(scope.stagingIdentity, { dev: String(identity.dev), ino: String(identity.ino) });
  assert.equal(scope.stagingDirectory, cwd);
  const expectedParent = privateInstall ? path.join(root, ".ans", "acceptance-deps", bound.taskId) : root;
  assert.equal(scope.publishDirectory, path.join(expectedParent, "node_modules"));
  if (privateInstall) {
    const originalParent = await lstat(expectedParent, { bigint: true });
    assert.deepEqual(scope.publishIdentity, { dev: String(originalParent.dev), ino: String(originalParent.ino) });
    assert.equal(effects[0]?.intent.expected?.installTarget, "assessment-private");
    assert.equal(effects[0]?.intent.expected?.publishDirectory, scope.publishDirectory);
  } else assert.equal(scope.publishIdentity, undefined);
  assert.equal(scope.manifestSha256, createHash("sha256").update(await readFile(path.join(cwd, "package.json"))).digest("hex"));
  assert.equal(scope.candidateOid, basis.candidateOid);
  assert.equal(scope.criteriaSha256, basis.criteria.sha256);
  assert.equal(scope.taskId, bound.taskId);
  assert.equal(scope.turnId, call.turnId);
  assert.equal(scope.toolCallId, call.toolCallId);
  assert.equal(scope.effectKey, effectKey);
  assert.equal(isCurrent(), true);
  effects[0]!.state = "unknown";
  assert.equal(isCurrent(), false);
  effects[0]!.state = "claimed";
  const result = await executeApproved({ ...call, cwd, argv, reviewedBy: "test-operator", isCurrent: () => true,
    acceptanceEnvironmentScope: { ...scope, publishDirectory: path.join(root, "other") } });
  assert.equal(!result.ok && result.code, "workflow-environment-restore-blocked");
  assert.equal(receipts[0]?.process, undefined);
  assert.deepEqual(receipts[0]?.acceptanceEnvironmentScope, scope);
  await assert.rejects(lstat(scope.publishDirectory), { code: "ENOENT" });
  if (privateInstall) assert.equal(await readFile(retained, "utf8"), "User dependencies remain");
  assert.deepEqual(await readFile(path.join(root, "package.json")), manifest);
});

test("disallowed lock source, staged drift and reparse output are rejected before execution", async t => {
  const { root, basis } = await candidate(t);
  await writeFile(path.join(root, "package.json"), "changed");
  git(root, "add", "--", "package.json");
  const changed = await verifyAcceptanceEnvironment(root, basis);
  assert.equal(!changed.ok && changed.code, "workflow-environment-candidate-drift");
  git(root, "restore", "--staged", "--worktree", "--", "package.json");
  const elsewhere = path.join(root, ".ans", "preserved");
  const output = path.join(root, "node_modules");
  const marker = "Existing dependency output";
  await mkdir(elsewhere, { recursive: true });
  await writeFile(path.join(elsewhere, "original.txt"), marker);
  let linked = true;
  try {
    await symlink(elsewhere, output, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    linked = false;
    t.diagnostic("This Windows container denies junction creation. The ordinary-file target is checked independently.");
  }
  if (linked) {
    const redirect = await verifyAcceptanceEnvironment(root, basis);
    // POSIX Git rejects the directory pathspec before installation target verification.
    assert.equal(!redirect.ok && redirect.code, process.platform === "win32"
      ? "workflow-environment-install-target" : "workflow-environment-candidate-drift");
    assert.equal((await lstat(output)).isSymbolicLink(), true);
    assert.equal(path.relative(elsewhere, await realpath(output)), "");
    assert.deepEqual(await readdir(elsewhere), ["original.txt"]);
    assert.equal(await readFile(path.join(elsewhere, "original.txt"), "utf8"), marker);
    assert.deepEqual(await readFile(path.join(root, "package.json")), manifest);
  }
  const occupied = await candidate(t);
  const occupiedOutput = path.join(occupied.root, "node_modules");
  await writeFile(occupiedOutput, marker);
  const ordinaryFile = await verifyAcceptanceEnvironment(occupied.root, occupied.basis);
  assert.equal(!ordinaryFile.ok && ordinaryFile.code, "workflow-environment-install-target");
  assert.equal((await lstat(occupiedOutput)).isFile(), true);
  assert.equal(await readFile(occupiedOutput, "utf8"), marker);
  assert.deepEqual(await readFile(path.join(occupied.root, "package.json")), manifest);
  const hostile = await candidate(t, Buffer.from(JSON.stringify({ name: "example-project", version: "1.0.0", lockfileVersion: 3, packages: {
    "": { name: "example-project", version: "1.0.0", devDependencies: { esbuild: "0.25.0" } },
    "node_modules/esbuild": { resolved: "https://unapproved.invalid/esbuild.tgz", integrity: "sha512-YWJj" },
  } })));
  const lockSource = await verifyAcceptanceEnvironment(hostile.root, hostile.basis);
  assert.equal(!lockSource.ok && lockSource.code, "workflow-environment-inputs-unverified");
});
