import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { buildMergeMainCardRequest, createCustomerInputChannel, MERGE_MAIN_OPTION_IDS } from "../../app/desktop/customer-input.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { createDesktopTaskGitShellPort, mergeDurableMain, previewDurableMerge, verifyDurableMerge, verifyDurableTaskCommit } from "../../app/desktop/workflow-git.ts";
import type { DurableReleaseSnapshot } from "../../src/model/durable-workflow.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function repository(t: TestContext) {
  const temporary = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, "ans-durable-desktop-"));
  t.after(async () => {
    assert.equal(path.dirname(root), temporary);
    await fs.rm(root, { recursive: true, force: true });
  });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "ANS desktop test");
  git(root, "config", "user.email", "desktop-test@example.invalid");
  await fs.writeFile(path.join(root, ".gitignore"), ".ans/\n");
  await fs.writeFile(path.join(root, "feature.txt"), "before\n");
  git(root, "add", "--", ".gitignore", "feature.txt");
  git(root, "commit", "-m", "fixture");
  const baselineOid = git(root, "rev-parse", "HEAD");
  const branch = "ans/task/dw-test";
  git(root, "switch", "-c", branch);
  return { root, baselineOid, branch };
}

test("durable IPC requires a directory chosen in the current window", async () => {
  const desktop = createDesktopInterface({
    envFilePath: path.join(os.tmpdir(), "ans-unused-workflow-env"),
    pickDirectory: async () => null,
    emitEvent: () => {},
  });
  const response = await desktop.startDurableWorkflow({
    projectRoot: os.tmpdir(), enabled: true, definitionId: "path-b", requestId: "id", summary: "Change",
  });
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.code, "workflow-project-unselected");
  desktop.disposeProjectDocuments();
});

test("only an explicit customer choice reaches durable storage and IPC waits for the receipt", async () => {
  const presented: string[] = [];
  const channel = createCustomerInputChannel({ operatorId: "customer", presenter: payload => { presented.push(payload.id); } });
  const context = { roleId: "chief", requestId: "durable-release-1", projectRoot: "/fixture" };
  const card = buildMergeMainCardRequest({ workflowId: "dw-test", flowId: "test", releaseId: "rel-1",
    mainBaseOid: "main", branchTipOid: "tip", branchBaseOid: "base", nonMainBaseline: false,
    fileCount: 1, diffStat: "feature.txt", mergeKind: "merge", highRiskNotes: [] });
  const barrier = Promise.withResolvers<void>();
  let stored: "approve" | "reject" | undefined;
  const outcome = channel.customerInput(card, { ...context, persistReleaseDecision: async choice => {
    await barrier.promise;
    if (stored !== undefined && stored !== choice) return { ok: false, message: "Opposite decision was already recorded." };
    stored = choice;
    return { ok: true, decisionId: "decision-one" };
  } });
  assert.deepEqual(presented, [context.requestId]);
  const approve = { id: context.requestId, decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[0]] } };
  assert.equal(channel.respond(approve).ok, false);
  assert.equal((await channel.respondDurable({ id: context.requestId, decision: { kind: "choice", cancelled: true } }))?.ok, false);
  let returned = false;
  const submitting = channel.respondDurable(approve).then(reply => { returned = true; return reply; });
  await Promise.resolve();
  assert.equal(returned, false);
  assert.equal(channel.pendingCount(), 1);
  barrier.resolve();
  assert.deepEqual(await submitting, { ok: true });
  assert.deepEqual(await channel.respondDurable(approve), { ok: true });
  assert.equal((await channel.respondDurable({ id: context.requestId,
    decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[1]] } }))?.ok, false);
  assert.equal((await outcome)?.outcome, "answered");
  assert.equal(channel.pendingCount(), 0);
});

test("closing the window leaves the durable approval unanswered and the same card can be presented again", async () => {
  const card = buildMergeMainCardRequest({ workflowId: "dw-test", flowId: "test", releaseId: "rel-2",
    mainBaseOid: "main", branchTipOid: "tip", branchBaseOid: "base", nonMainBaseline: false,
    fileCount: 1, diffStat: "feature.txt", mergeKind: "merge", highRiskNotes: [] });
  let persisted = 0;
  const present = (observe: (id: string) => void) => {
    const channel = createCustomerInputChannel({ operatorId: "customer", presenter: payload => observe(payload.id) });
    const outcome = channel.customerInput(card, { roleId: "chief", requestId: "same-card", persistReleaseDecision: async () => {
      persisted++;
      return { ok: true, decisionId: "same-record" };
    } });
    return { channel, outcome };
  };
  const ids: string[] = [];
  const first = present(id => ids.push(id));
  first.channel.rejectAllPending("window closed");
  await first.outcome;
  assert.equal(persisted, 0);
  const second = present(id => ids.push(id));
  assert.deepEqual(ids, ["same-card", "same-card"]);
  assert.equal((await second.channel.respondDurable({ id: "same-card", decision: { kind: "choice", selected: [MERGE_MAIN_OPTION_IDS[1]] } }))?.ok, true);
  assert.equal(persisted, 1);
  await second.outcome;
});

test("the actual Git commit and merge use their effect claim and can be verified from repo facts", async t => {
  const { root, baselineOid, branch } = await repository(t);
  await fs.writeFile(path.join(root, "feature.txt"), "after\n");
  const commits: Array<{ expected: Readonly<Record<string, string | readonly string[]>>; result: unknown }> = [];
  const port = createDesktopTaskGitShellPort(root, async input => ({
    ok: true,
    value: { execute: true, finish: async (outcome, _evidence, result) => {
      assert.equal(outcome, "succeeded");
      if (input.kind === "task-commit") commits.push({ expected: input.expected, result });
    } },
  }));
  assert.equal((await port.add(["feature.txt"])).exitCode, 0);
  const unlock = port.acquireCriticalSection("test-authorized-task");
  assert.ok(unlock);
  try {
    assert.equal((await port.commit(["git", "commit", "-m", "Implement feature"])).exitCode, 0);
  } finally { unlock(); }
  assert.equal(commits.length, 1);
  assert.deepEqual(await verifyDurableTaskCommit(root, commits[0]!.expected), commits[0]!.result);
  const preview = await previewDurableMerge({ projectRoot: root, branch, baselineOid });
  assert.ok(preview.ok);
  const { mainOid, tipOid, diffDigest, files } = preview.value;
  const snapshot: DurableReleaseSnapshot = { mainOid, tipOid, diffDigest, files, branch, baselineOid,
    b3CloseKey: "close-key", operatorReport: { path: "ans-evidence/accepted", sha256: "b".repeat(64) } };
  const release = { projectRoot: root, workflowId: "dw-test", flowId: "test", requestId: "decision-one", snapshot,
    confirmation: { by: "customer" as const, decisionId: "decision-one" } };
  let entered = 0;
  const refused = await mergeDurableMain({ ...release, claim: async () => {
    entered++;
    return { ok: false, code: "stale-test-approval", message: "Approval replaced." };
  } });
  assert.equal(refused.ok, false);
  assert.equal(git(root, "rev-parse", "main"), mainOid);
  assert.equal(git(root, "branch", "--show-current"), branch);
  const merged = await mergeDurableMain({ ...release, claim: async () => { entered++; return { ok: true }; } });
  assert.ok(merged.ok);
  assert.equal(entered, 2);
  const actual = await verifyDurableMerge({ ...release, writePaths: files });
  assert.ok(actual.ok);
  assert.equal(actual.value.mainOid, git(root, "rev-parse", "main"));
  assert.deepEqual(actual.value.files, ["feature.txt"]);
  assert.equal((await verifyDurableMerge({ ...release, requestId: "wrong-request", writePaths: files })).ok, false);
});
