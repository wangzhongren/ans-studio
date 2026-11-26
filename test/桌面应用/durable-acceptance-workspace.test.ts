import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  closeDesktopAcceptanceWorkspace, desktopAssessmentAdmission, desktopQueuedAcceptanceIsCurrent, prepareDesktopAcceptanceWorkspace,
  readCollectionEvidence, verifyDesktopAcceptanceWorkspaceEvidence,
} from "../../app/desktop/durable-acceptance-workspace.ts";
import type { DesktopDurableWorkflow } from "../../app/desktop/durable-workflow.ts";
import type {
  DurableAcceptanceWorkspaceBinding, DurableAcceptanceWorkspaceRunReceipt, DurablePendingTask, DurableProjection,
} from "../../src/model/durable-workflow.ts";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "ans-frozen-acceptance-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 4 }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "ans/task/demo");
  git("config", "core.autocrlf", "false");
  await writeFile(path.join(root, "criteria.md"), "冻结标准\n");
  await writeFile(path.join(root, "index.html"), "<h1>Original input</h1>");
  git("add", "--", "criteria.md", "index.html");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Original");
  const task = { taskId: "dw-assess", parentTaskId: "instance", roleId: "verifier", stage: "A12b" as const, stageAttempt: 1, executionAttempt: 1 };
  const pending: DurablePendingTask = { task, taskId: task.taskId, roleId: task.roleId, stepId: "assess", flowId: "demo",
    state: "pending", attempt: 1, capability: "independent-assessment", dispatch: { flowId: "demo", actor: "application", text: "Assess" } };
  const criteria = { path: "criteria.md", sha256: sha(await readFile(path.join(root, "criteria.md"))) };
  const basis = { candidateOid: git("rev-parse", "HEAD"), branch: "ans/task/demo", criteria, assessmentTask: task };
  const view: DurableProjection = { projectRoot: root, definitionName: "Legacy", stepName: "Assessment", action: "independent-assessment",
    ref: { projectId: "demo", instanceId: "instance", definitionId: "path-a", definitionDigest: sha("definition"), definitionVersion: 7,
      executor: "ans-durable-definition-v2", activityContract: 2 },
    flowId: "demo", stepId: "assess", attempt: 1, pendingTasks: [pending], pendingFacts: 0, metadata: {},
    status: "waiting", engine: "healthy", schema: 2,
    acceptanceWorkspace: { basis, state: "eligible", prepareKey: "prepare", runKey: "run", closeKey: "close", evidenceKey: "evidence" },
  };
  const store = {
    lookup: () => view,
    readEvidence: async (_root: string, file: string) => ({ ok: true, value: { path: file, sha256: sha(await readFile(path.join(root, file))) } }),
    claimEffect: () => assert.fail("reading frozen receipts must not claim a retired effect"),
    settleEffect: () => assert.fail("a missing frozen receipt must not be synthesized"),
  } as unknown as Parameters<typeof prepareDesktopAcceptanceWorkspace>[0];
  return { root, view, pending, store, basis, git, workspace: view.acceptanceWorkspace! };
}

test("a frozen workspace missing original start and close stays held and never allocates files", async t => {
  const { root, view, pending, store, git } = await fixture(t);
  const before = git("status", "--porcelain=v1");
  for (let retry = 0; retry < 2; retry++) {
    assert.deepEqual(await prepareDesktopAcceptanceWorkspace(store, view, pending), { hold: true });
    const closed = await closeDesktopAcceptanceWorkspace(store, view, pending.taskId);
    assert.ok(!closed.ok && closed.code === "acceptance-workspace-close-receipt-missing");
  }
  await assert.rejects(access(path.join(root, ".ans")), { code: "ENOENT" });
  assert.equal(git("status", "--porcelain=v1"), before);
});

test("a frozen receipt is re-read from its original registration, output and signed bytes", async t => {
  const { root, view, pending, store, basis, workspace } = await fixture(t);
  const workspaceRoot = path.join(root, ".ans", "frozen");
  const inputRoot = path.join(workspaceRoot, "input"), outputRoot = path.join(workspaceRoot, "output");
  const evidenceRoot = path.join(workspaceRoot, "evidence"), launcherPath = path.join(workspaceRoot, "build.mjs");
  await Promise.all([inputRoot, outputRoot, evidenceRoot].map(directory => mkdir(directory, { recursive: true })));
  const identity = async (directory: string) => {
    const stat = await lstat(directory, { bigint: true });
    return { dev: String(stat.dev), ino: String(stat.ino) };
  };
  const launcher = 'throw new Error("historic launcher must never execute");';
  const config = "export default { envDir: false, publicDir: 'public', css: { postcss: { plugins: [] } }, build: { emptyOutDir: false } };\n";
  const entry = "<h1>Original recorded output</h1>";
  await Promise.all([writeFile(launcherPath, launcher), writeFile(path.join(workspaceRoot, "vite-app.config.mjs"), config),
    writeFile(path.join(outputRoot, "index.html"), entry)]);
  const binding: DurableAcceptanceWorkspaceBinding = { projectRoot: root, workspaceRoot, inputRoot, outputRoot, evidenceRoot, launcherPath,
    basis, workspaceIdentity: await identity(workspaceRoot), launcherSha256: sha(launcher), requiresBrowserEvidence: false };
  await writeFile(path.join(workspaceRoot, "workspace.json"), JSON.stringify({ binding, inputIdentity: await identity(inputRoot),
    outputIdentity: await identity(outputRoot), evidenceIdentity: await identity(evidenceRoot) }));
  const url = "http://127.0.0.1:42000/";
  const receipt: DurableAcceptanceWorkspaceRunReceipt = { kind: "acceptance-workspace-run", binding,
    build: { reviewedBy: "operator", toolCallId: "build", turnId: "original-turn", argv: ["node", launcherPath], cwd: inputRoot, pid: 9000,
      exitCode: 0, outputSha256: sha(JSON.stringify([["index.html", Buffer.byteLength(entry), sha(entry)]])), entrySha256: sha(entry), writeAuditPassed: true },
    preview: { reviewedBy: "operator", url, port: 42000, openedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T00:10:00Z", httpStatus: 200 },
  };
  Object.assign(workspace, { binding, receipt, runReceiptId: sha(JSON.stringify(receipt)) });
  assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending)).hold, true);
  assert.equal((await verifyDesktopAcceptanceWorkspaceEvidence(store, view, pending, "original-turn", [])).ok, false);
  Object.assign(workspace, { closeReceipt: { kind: "acceptance-workspace-closed", binding, url, closedAt: "2026-01-01T00:09:00Z" } });
  assert.equal((await closeDesktopAcceptanceWorkspace(store, view, pending.taskId)).ok, true);
  assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending)).hold, false);
  assert.equal((await verifyDesktopAcceptanceWorkspaceEvidence(store, view, pending, "other-turn", [])).ok, false);
  assert.equal((await verifyDesktopAcceptanceWorkspaceEvidence(store, view, pending, "original-turn", [])).ok, true);
  await writeFile(path.join(outputRoot, "index.html"), "substituted result");
  assert.equal((await verifyDesktopAcceptanceWorkspaceEvidence(store, view, pending, "original-turn", [])).ok, false);
  await writeFile(path.join(root, "criteria.md"), "unapproved standard");
  assert.equal((await prepareDesktopAcceptanceWorkspace(store, view, pending)).hold, true);
});

test("an old queued audit cannot execute when its recorded generation changes", async t => {
  const { view, pending } = await fixture(t);
  view.evidenceAuditEnabled = true;
  let generation = 3;
  let originalReadable = true;
  const store = { lookup: () => view, evidenceAuditDispatchPermit: () => ({ ok: true, value: { generation } }),
    verifyEvidenceAudit: async () => ({ ok: originalReadable }) } as unknown as Parameters<typeof desktopAssessmentAdmission>[0];
  const admission = await desktopAssessmentAdmission(store, view, pending.task);
  assert.equal(admission?.expected.evidenceAuditGeneration, "3");
  const durable = { store: async () => store, delivery: () => ({ ref: view.ref, intent: { task: pending.task, expected: admission?.expected } }) } as unknown as DesktopDurableWorkflow;
  assert.equal(await desktopQueuedAcceptanceIsCurrent(durable, view.projectRoot, "dispatch"), true);
  originalReadable = false;
  assert.equal(await desktopQueuedAcceptanceIsCurrent(durable, view.projectRoot, "dispatch"), false);
  originalReadable = true;
  generation++;
  assert.equal(await desktopQueuedAcceptanceIsCurrent(durable, view.projectRoot, "dispatch"), false);
});

test("collector handback accepts structured references and rejects invented source facts", () => {
  assert.deepEqual(readCollectionEvidence([
    '{"requirementId":"AC-1","path":"src/start.js","source":"candidate-file"}',
    '{"requirementId":"AC-2","path":"","source":"task-command","receiptId":"actual-command"}',
    '{"requirementId":"AC-3","reason":"缺实际外部会话来源"}',
  ]), { artifacts: [
    { requirementId: "AC-1", path: "src/start.js", source: "candidate-file" },
    { requirementId: "AC-2", path: "", source: "task-command", receiptId: "actual-command" },
  ], missing: [{ requirementId: "AC-3", reason: "缺实际外部会话来源" }] });
  for (const reference of ["handwritten.md", '{"requirementId":"AC-1","path":"fixture.png","source":"manual"}',
    '{"requirementId":"AC-1","path":"fixture.png","source":"external-session","outcome":"passed"}']) {
    assert.equal(readCollectionEvidence([reference]), undefined);
  }
});
