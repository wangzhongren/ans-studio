import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCustomerInputChannel, type DurableCustomerAnswer } from "../../app/desktop/customer-input.ts";
import { createDurableGraphBaselineGitPort, durableBaselineOrigin, verifyDurableGraphBaseline } from "../../app/desktop/workflow-git.ts";
import type { DurableResult } from "../../src/model/durable-workflow.ts";

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

test("the same Git operation resumes after init and branch creation without repeating either effect", async t => {
  const temporary = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, "ans-v2-baseline-"));
  t.after(() => {
    assert.equal(path.dirname(root), temporary);
    return fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const definitionFile = "docs/workflows/a.yaml";
  await fs.mkdir(path.dirname(path.join(root, definitionFile)), { recursive: true });
  await fs.writeFile(path.join(root, definitionFile), "name: Example\n");
  const workflowId = "dw-recover-a9";
  const token = "recorded-effect-token";
  const origin = unwrap(await durableBaselineOrigin(root, workflowId));
  assert.equal(origin.repositoryBefore, "absent");
  const resume = async () => unwrap(await createDurableGraphBaselineGitPort({
    projectRoot: root, workflowId, token, origin, definitionFile,
  }));
  let port = await resume();
  const initialized = await port.ensureRepository({ projectRoot: root, allowInit: true });
  assert.equal(initialized.ok && initialized.repository.state, "initialized");
  const foreign = await createDurableGraphBaselineGitPort({ projectRoot: root, workflowId, token: "foreign", origin, definitionFile });
  assert.equal(foreign.ok, false);
  port = await resume();
  const recovered = await port.ensureRepository({ projectRoot: root, allowInit: true });
  assert.equal(recovered.ok && recovered.repository.state, "existing");
  const ignore = await port.ensureGitignore({ projectRoot: root });
  assert.equal(ignore.ok && ignore.committed, true);
  const main = git(root, "rev-parse", "main");
  assert.equal(git(root, "rev-list", "--count", "main"), "1");
  const worktree = await port.inspectWorktree({ projectRoot: root });
  assert.ok(worktree.ok);
  assert.deepEqual(worktree.untracked, []);
  const secondDefinition = path.join(root, "docs/workflows/unselected.yaml");
  await fs.writeFile(secondDefinition, "name: Unselected\n");
  const other = await port.inspectWorktree({ projectRoot: root });
  assert.ok(other.ok);
  assert.deepEqual(other.untracked, ["docs/workflows/unselected.yaml"]);
  await fs.unlink(secondDefinition);
  const branch = await port.prepareTaskBranch({ projectRoot: root, workflowId, base: "main", allowReuse: false });
  assert.equal(branch.ok && branch.reused, false);
  port = await resume();
  const replay = await port.prepareTaskBranch({ projectRoot: root, workflowId, base: "main", allowReuse: false });
  assert.equal(replay.ok && replay.reused, true);
  assert.equal(git(root, "rev-list", "--count", "main"), "1");
  assert.deepEqual(unwrap(await verifyDurableGraphBaseline(root, workflowId, token, origin)), {
    branch: `ans/task/${workflowId}`, oid: main,
  });
  git(root, "add", "--", definitionFile);
  const tracked = await port.inspectWorktree({ projectRoot: root });
  assert.ok(tracked.ok);
  assert.equal(tracked.trackedChanges, 1);
});

test("workflow cards acknowledge only explicit offered choices after actual durable persistence", async () => {
  const receipts: DurableCustomerAnswer[] = [];
  const ids: string[] = [];
  const open = () => {
    const channel = createCustomerInputChannel({ operatorId: "local-customer", presenter: payload => { ids.push(payload.id); } });
    const answer = channel.customerInput({
      kind: "choice", cardKind: "appointment", title: "Appoint the current roles", flowId: "example", multiple: true,
      options: [{ id: "worker", label: "Worker" }, { id: "reviewer", label: "Reviewer" }],
    }, { roleId: "chief", requestId: "dw-card-same", projectRoot: "/fixture", governanceModel: "trio",
      persistWorkflowDecision: async selected => { receipts.push(selected); return { ok: true, decisionId: "saved-appointment" }; } });
    return { channel, answer };
  };
  const prior = open();
  const response = (decision: unknown) => ({ id: "dw-card-same", decision });
  assert.equal((await prior.channel.respondDurable(response({ kind: "choice", cancelled: true })))?.ok, false);
  assert.equal((await prior.channel.respondDurable(response({ kind: "choice", selected: ["foreign"] })))?.ok, false);
  prior.channel.rejectAllPending("window closed");
  await prior.answer;
  assert.equal(receipts.length, 0);
  const current = open();
  assert.deepEqual(ids, ["dw-card-same", "dw-card-same"]);
  assert.equal((await current.channel.respondDurable(response({ kind: "choice", selected: ["worker"] })))?.ok, true);
  assert.deepEqual(receipts, [{ kind: "choice", selected: ["worker"], acknowledged: undefined }]);
  assert.equal((await current.answer)?.outcome, "answered");
});
