import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { initializeGitRepository, createGitQueryPort, readGitProtectionFacts, checkGitProtectionFactsCurrent, readGitInitializationFacts, readGitHostProtectionRequirement, createGitCandidateStore, createGitRefStore, planEmptyGitCandidate, writeGitInitializationRecord, readGitInitializationRecord, createFsTrunkStore, beginGitHostAction, endGitHostAction, recordGitHostInterruption } from "../../src/provider/trunk/public/trunk-store.ts";
const git = process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "/usr/bin/git";

test("NoGit protection absence: private issued facts protect potential metadata and reject a new ancestor association", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "ans-nogit-facts-")), root = path.join(parent, "project"); await fs.mkdir(root);
  const facts = await readGitProtectionFacts(root);
  assert.equal(facts.coverage, "complete", JSON.stringify(facts)); assert.equal(facts.identity, undefined);
  assert.deepEqual(facts.protectedGitRoots, [path.join(await fs.realpath(root), ".git")]);
  assert.equal(checkGitProtectionFactsCurrent(facts), true); assert.equal(checkGitProtectionFactsCurrent(structuredClone(facts)), false);
  await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/ordinary.txt"), "Actual project material");
  assert.equal(checkGitProtectionFactsCurrent(facts), true, "An ordinary file write does not become a Git association");
  await fs.mkdir(path.join(parent, ".git"));
  assert.equal(checkGitProtectionFactsCurrent(facts), false);
  const associated = await readGitProtectionFacts(root); assert.equal(associated.coverage, "unknown"); assert.equal(associated.identity, undefined);
  assert.equal(checkGitProtectionFactsCurrent(associated), false); assert.ok(associated.protectedGitRoots.length > 0);
});

test("Git protection freshness: only the issued observation survives unchanged config/topology", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-o17-protection-"));
  await initializeGitRepository(root);
  const facts = await readGitProtectionFacts(root); assert.equal(facts.coverage, "complete");
  assert.equal(checkGitProtectionFactsCurrent(facts), true);
  assert.equal(checkGitProtectionFactsCurrent(structuredClone(facts)), false);
  const config = path.join(root, ".git/config"), bytes = await fs.readFile(config);
  await fs.appendFile(config, "\n"); assert.equal(checkGitProtectionFactsCurrent(facts), false);
  await fs.writeFile(config, bytes); assert.equal(checkGitProtectionFactsCurrent(facts), true);
  await fs.mkdir(path.join(root, ".git/worktrees")); assert.equal(checkGitProtectionFactsCurrent(facts), false);
  const unknown = await readGitProtectionFacts(root); assert.equal(unknown.coverage, "unknown");
  assert.equal(checkGitProtectionFactsCurrent(unknown), false);
});
const raw = promisify(execFile);
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-git-command-")); await initializeGitRepository(root); return root; }

test("Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry", async () => {
  const root = await fixture(), objects = createGitCandidateStore(root), dir = path.join(root, ".git/ans/processes"); await fs.mkdir(dir, { recursive: true });
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(lease.ok); if (!lease.ok) return;
  let observed = false;
  const watcher = watch(dir, () => { observed = true; watcher.close(); recordGitHostInterruption({ projectRoot: root, reason: "actual-pending-record-interruption" }); });
  const input = { operationId: "actual-before-spawn-cancel", base: null, timestamp: "2026-11-05T00:00:00.000Z", message: "Real pending write", files: [{ path: "src/impl/result.txt", bytesBase64: Buffer.from("real result\n").toString("base64") }] };
  try { await assert.rejects(objects.prepare(input, undefined, lease.leaseId), /git-command-failed:null:unknown/); }
  finally { watcher.close(); endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
  assert.equal(observed, true, "The real process-fence filesystem write, not a fixture callback, interrupts the held lease");
  const files = await fs.readdir(dir); assert.equal(files.length, 1);
  const processFact = JSON.parse(await fs.readFile(path.join(dir, files[0]!), "utf8"));
  assert.equal(processFact.launch, "cancelled-before-spawn"); assert.equal(processFact.pid, undefined); assert.equal(processFact.exitCode, null);
  assert.equal(processFact.termination, "unknown", "No fake successful OS exit is invented for an unlaunched command");
  assert.equal(await objects.readRef(`refs/ans/candidates/${createHash("sha256").update(input.operationId).digest("hex")}`), null);
  const retryLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(retryLease.ok); if (!retryLease.ok) return;
  try { const result = await objects.prepare(input, undefined, retryLease.leaseId); assert.ok(result.candidate); }
  finally { endGitHostAction({ projectRoot: root, leaseId: retryLease.leaseId }); }
  const retried = await Promise.all((await fs.readdir(dir)).map(file => fs.readFile(path.join(dir, file), "utf8").then(JSON.parse)));
  assert.ok(retried.some(fact => fact.launch === "started" && fact.termination === "exited" && fact.exitCode === 0 && fact.pid));
  const ref = `refs/ans/candidates/${createHash("sha256").update(input.operationId).digest("hex")}`, actualOid = await objects.readRef(ref); assert.ok(actualOid);
  const actual = await objects.readCommit(actualOid), identity = await objects.inspect();
  const binding = { operationId: "cancel-before-publication-spawn", repoId: identity.repoId, ref: "refs/ans/delivery/demo", oldOid: null,
    newOid: actual.candidate, tree: actual.tree, parents: actual.parents, requestDigest: createHash("sha256").update("actual-publication").digest("hex") };
  const publicationLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(publicationLease.ok); if (!publicationLease.ok) return;
  const publicationWatcher = watch(dir, () => { publicationWatcher.close(); recordGitHostInterruption({ projectRoot: root, reason: "actual-publication-pending-interruption" }); });
  try {
    const publication = await createGitRefStore(root, { hostLeaseId: publicationLease.leaseId }).publish(binding);
    assert.equal(publication.status, "blocked"); assert.equal(publication.journal.process?.launch, "cancelled-before-spawn");
    assert.equal(await objects.readRef(binding.ref), null);
  } finally { publicationWatcher.close(); endGitHostAction({ projectRoot: root, leaseId: publicationLease.leaseId }); }
  const publicationRetry = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(publicationRetry.ok); if (!publicationRetry.ok) return;
  try { assert.equal((await createGitRefStore(root, { hostLeaseId: publicationRetry.leaseId }).publish(binding)).status, "published"); }
  finally { endGitHostAction({ projectRoot: root, leaseId: publicationRetry.leaseId }); }
  await fs.writeFile(path.join(dir, "00000000-0000-4000-8000-000000000099.json"), JSON.stringify({ ...processFact, pid: 99999999 }));
  await assert.rejects(objects.prepare({ ...input, operationId: "cannot-clear-possibly-started" }), /git-owned-process-unresolved/, "A missing/dead PID claim cannot reuse the real never-started cancellation path");
});
test("Git init Provider: final real root/file hashes fence initialization and persist original operation process identity", async () => {
  const base = process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Temp") : "/tmp";
  const root = await fs.mkdtemp(path.join(base, "ans-init-fence-")); await fs.mkdir(path.join(root, ".ans"));
  const relative = ".ans/actual-source.json", bytes = "actual binding bytes", sha256 = createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(root, relative), bytes);
  const initial = await readGitInitializationFacts(root), fence = { operationId: "actual-fenced-init", qualificationDigest: initial.qualificationDigest, expectedFiles: [{ path: relative, sha256 }] };
  await fs.writeFile(path.join(root, relative), "changed during await");
  await assert.rejects(initializeGitRepository(root, "sha1", fence), /git-init-binding-stale/);
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false);
  await fs.writeFile(path.join(root, relative), bytes); await fs.writeFile(path.join(root, "foreign-content"), "not the observed root");
  await assert.rejects(initializeGitRepository(root, "sha1", fence), /git-init-root-basis-stale/);
  await fs.unlink(path.join(root, "foreign-content"));
  const identity = await initializeGitRepository(root, "sha1", fence); assert.ok(identity.repoId);
  const observedProcess = JSON.parse(await fs.readFile(path.join(root, ".ans/git-init-process.json"), "utf8"));
  assert.equal(observedProcess.operationId, fence.operationId); assert.equal(observedProcess.termination, "exited"); assert.equal(observedProcess.exitCode, 0);
});
test("Git init journal: restart discovery binds the original operation and excludes FS/ref media", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-init-journal-")); await fs.mkdir(path.join(root, ".ans"));
  const record = { media: "git-initialization/v1" as const, operationId: "unique-init-op", requestDigest: "a".repeat(64), projectRoot: root,
    taskId: "actual-task", runId: "actual-run", flowId: "demo", sourceId: "init-source-" + "b".repeat(64), sourceSha256: "c".repeat(64),
    qualificationDigest: "d".repeat(64), expectedFiles: [], stage: "prepared" as const };
  await writeGitInitializationRecord(root, record); assert.deepEqual(await readGitInitializationRecord(root, record.operationId), record);
  const listed = await createFsTrunkStore(root).listStorageOperations!(); assert.ok(listed.ok); if (listed.ok) assert.deepEqual(listed.value, [{ media: "git-initialization/v1", operationId: record.operationId }]);
  await assert.rejects(writeGitInitializationRecord(root, { ...record, requestDigest: "e".repeat(64) }), /git-init-operation-conflict/);
  const operationHash = createHash("sha256").update(record.operationId).digest("hex");
  await fs.writeFile(path.join(root, `.ans/trunk/operations/${operationHash}.json`), "{}");
  await assert.rejects(readGitInitializationRecord(root, record.operationId), /operation-bound-to-two-media/);
  assert.equal((await createFsTrunkStore(root).listStorageOperations!()).ok, false);
});
test("Git init process fence: a previous unknown instance cannot be overwritten even while .git is absent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-init-unknown-")); await fs.mkdir(path.join(root, ".ans"));
  const bytes = JSON.stringify({ operationId: "prior-unknown-init", processId: "owned-process-instance", termination: "unknown", startedAt: "2000-01-01T00:00:00.000Z", pid: 99999999 });
  await fs.writeFile(path.join(root, ".ans/git-init-process.json"), bytes);
  await assert.rejects(initializeGitRepository(root), /git-init-process-unresolved/);
  assert.equal(await fs.readFile(path.join(root, ".ans/git-init-process.json"), "utf8"), bytes);
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false);
});
test("Git protection requirement: actual source binds scope; deleting evidence cannot clear it; an unknown association is not unmanaged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-requirement-")), canonical = await fs.realpath(root);
  const initial = await readGitHostProtectionRequirement({ projectRoot: root }); assert.equal(initial.state, "unmanaged");
  const sourceId = "init-source-" + "f".repeat(64), sourcePath = path.join(root, `.ans/trunk/initialization-sources/${sourceId}.json`);
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: canonical }));
  const required = await readGitHostProtectionRequirement({ projectRoot: root }); assert.equal(required.state, "required"); assert.ok(required.revision > initial.revision);
  assert.equal((await readGitHostProtectionRequirement({ projectRoot: root })).revision, required.revision);
  await fs.unlink(sourcePath);
  const retained = await readGitHostProtectionRequirement({ projectRoot: root }); assert.equal(retained.state, "required"); assert.ok(retained.revision > required.revision);
  const unknown = await fs.mkdtemp(path.join(os.tmpdir(), "ans-requirement-unknown-")); await fs.writeFile(path.join(unknown, ".git"), "gitdir: unresolved-shared-metadata\n");
  assert.equal((await readGitHostProtectionRequirement({ projectRoot: unknown })).state, "unknown");
});
async function metadata(root: string) {
  const files: Record<string, string> = {};
  async function visit(dir: string) { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await visit(file);
    else files[path.relative(root, file)] = createHash("sha256").update(await fs.readFile(file)).digest("hex"); } }
  await visit(path.join(root, ".git")); return files;
}
for (const objectFormat of ["sha1", "sha256"] as const) test(`Git empty plan: computed ${objectFormat} object bytes match actual fixed-date Git readback`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-empty-plan-"));
  const plan = planEmptyGitCandidate({ operationId: "exact-empty-plan", message: "Actual UTF8 empty tree 中文", timestamp: "2026-11-05T01:02:03.000Z", objectFormat });
  assert.equal(await fs.stat(path.join(root, ".git")).then(() => true, () => false), false, "Planning does not create repository or objects");
  await initializeGitRepository(root, objectFormat);
  const actual = await createGitCandidateStore(root).prepare(plan.input); assert.deepEqual(actual, plan.commit);
  assert.deepEqual(await createGitCandidateStore(root).listTree(actual.candidate), []);
});

test("Git transport: real fixed executable, identity and literal query ignore inherited GIT execution config", async () => {
  const root = await fixture(), port = createGitQueryPort(root), identity = await port.inspect();
  assert.match(identity.repoId, /^[a-f0-9]{64}$/); assert.equal(identity.commonDir, identity.gitDir); assert.equal(identity.objectFormat, "sha1");
  await fs.writeFile(path.join(root, "actual.txt"), "Actual file");
  const before = await metadata(root), planned = await port.plan({ operationId: "query-actual", template: "status", paths: ["actual.txt"] });
  const previous = process.env.GIT_DIR; process.env.GIT_DIR = "Z:/untrusted/absent";
  try {
    const facts = await port.query({ operationId: "query-actual", template: "status", paths: ["actual.txt"] });
    assert.equal(facts.termination, "exited"); assert.equal(facts.exitCode, 0); assert.match(facts.stdout, /actual.txt/);
    assert.ok(facts.pid); assert.ok(facts.endedAt); assert.equal(facts.outputTruncated, false);
    assert.equal(path.isAbsolute(facts.executable), true); assert.equal(facts.argv.includes("--no-optional-locks"), true);
    assert.deepEqual(facts.argv, planned.argv); assert.deepEqual(await metadata(root), before, "Safe query/plan cannot alter any Git metadata, index, ref or process evidence");
    console.log(JSON.stringify({ repoId: identity.repoId, executable: facts.executable, argv: facts.argv, termination: facts.termination }));
  } finally { if (previous === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previous; }
  await assert.rejects(port.query({ operationId: "bad-path", template: "status", paths: [":(top)*"] }), /git-path-invalid/);
  await assert.rejects(port.query({ operationId: "bad-oid", template: "rev-parse", target: { objectFormat: "sha1", hex: "HEAD" } }), /git-oid-invalid/);
  const aborted = new AbortController(); aborted.abort();
  const cancelled = await port.query({ operationId: "cancelled", template: "status" }, aborted.signal);
  assert.equal(cancelled.aborted, true); assert.equal(cancelled.pid, undefined); assert.equal(cancelled.termination, "unknown");
});

test("Git transport: executable local fsmonitor is a real unsafe control and is rejected before the product query", async () => {
  const root = await fixture(), marker = path.join(root, "executed.marker"), script = path.join(root, "probe.cjs");
  await fs.writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'real config execution');`);
  const command = `"${process.execPath.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}"`;
  await raw(git, ["-C", root, "config", "core.fsmonitor", command], { windowsHide: true });
  await raw(git, ["-C", root, "status", "--porcelain"], { windowsHide: true });
  assert.equal(await fs.readFile(marker, "utf8"), "real config execution", "Normal-environment control proves this fixture can execute Git config");
  await fs.unlink(marker);
  await assert.rejects(createGitQueryPort(root).query({ operationId: "safe-status", template: "status" }), /git-config-executable-or-unsupported/);
  assert.equal(await fs.stat(marker).then(() => true, () => false), false);
});

// —————————————— B30（2026-11-11，RR26）：桌面 A9 基线写入的 repo-local `[user]` 默认身份 ——————————————
test("B30 user section accepted: desktop identity defaults (name=ANS/email=ans@local) no longer block inspect or status", async () => {
  const root = await fixture(), port = createGitQueryPort(root);
  await raw(git, ["-C", root, "config", "--local", "user.name", "ANS"], { windowsHide: true });
  await raw(git, ["-C", root, "config", "--local", "user.email", "ans@local"], { windowsHide: true });
  const config = await fs.readFile(path.join(root, ".git/config"), "utf8");
  assert.match(config, /\[user\]\r?\n\tname = ANS\r?\n\temail = ans@local/, "fixture holds the real identity defaults written by Git itself");
  const identity = await port.inspect();
  assert.match(identity.repoId, /^[a-f0-9]{64}$/);
  assert.equal(identity.objectFormat, "sha1");
  await fs.writeFile(path.join(root, "identity-defaults.txt"), "ok");
  const facts = await port.query({ operationId: "b30-identity-defaults-status", template: "status" });
  assert.equal(facts.termination, "exited"); assert.equal(facts.exitCode, 0, facts.stderr);
  assert.match(facts.stdout, /identity-defaults\.txt/, "real status output is only readable when config inspection passes first");
});

test("B30 user section stays fail-closed: illegal keys/values and every other dangerous section still reject", async () => {
  const cases: Array<[string, string, RegExp]> = [
    ["illegal key signingkey", "\n[user]\n\tsigningkey = ABCDEF\n", /git-config-executable-or-unsupported/],
    ["semicolon injection", "\n[user]\n\tname = ANS; rm -rf /\n", /git-config-value-invalid/],
    ["quote injection", "\n[user]\n\temail = \"ans@local\"\n", /git-config-value-invalid/],
    ["backslash continuation", "\n[user]\n\tname = ANS\\\n\temail = x\n", /git-config-value-invalid/],
    ["boolean key without equals", "\n[user]\n\tname\n", /git-config-executable-or-unsupported/],
    ["alias section", "\n[alias]\n\tstatus = !echo pwned\n", /git-config-section-unsupported/],
    ["include section", "\n[include]\n\tpath = ../evil\n", /git-config-section-unsupported/],
    ["includeIf subsection", "\n[includeIf \"gitdir:x\"]\n\tpath = ../evil\n", /git-config-executable-or-unsupported/],
    ["core.hooksPath", "\n[core]\n\thooksPath = C:/evil\n", /git-config-executable-or-unsupported/],
  ];
  for (const [label, extra, expected] of cases) {
    const root = await fixture(), config = path.join(root, ".git/config"), original = await fs.readFile(config);
    await fs.appendFile(config, extra);
    await assert.rejects(createGitQueryPort(root).inspect(), expected, label);
    await fs.writeFile(config, original);
  }
});

test("Git transport: alternates, gitfile/common-dir and symbolic application refs are unsupported", async () => {
  const root = await fixture(), port = createGitQueryPort(root);
  await fs.mkdir(path.join(root, ".git/objects/info"), { recursive: true });
  await fs.writeFile(path.join(root, ".git/objects/info/alternates"), path.join(root, "external-objects"));
  await assert.rejects(port.inspect(), /git-indirection-unsupported/); await fs.unlink(path.join(root, ".git/objects/info/alternates"));
  await fs.mkdir(path.join(root, ".git/refs/ans"), { recursive: true }); await fs.writeFile(path.join(root, ".git/refs/ans/trunk"), "ref: refs/heads/ans-unpublished\n");
  await assert.rejects(port.inspect(), /git-symbolic-ref-unsupported/);
  const other = await fs.mkdtemp(path.join(os.tmpdir(), "ans-gitfile-")); await fs.writeFile(path.join(other, ".git"), `gitdir: ${path.join(root, ".git")}\n`);
  await assert.rejects(createGitQueryPort(other).inspect(), /git-gitfile-or-link-unsupported/);
});

test("Git protection facts: actual independent roots, hardlink identity and linked common-dir stay explicit", async () => {
  const root = await fixture(), original = await readGitProtectionFacts(root);
  assert.equal(original.coverage, "complete"); assert.equal(original.protectedGitRoots.includes(path.join(root, ".git")), true);
  const alias = path.join(root, "head-alias"); await fs.link(path.join(root, ".git/HEAD"), alias);
  const linkedFile = await readGitProtectionFacts(root); assert.equal(linkedFile.coverage, "unknown"); assert.match(linkedFile.reasons.join(" "), /metadata-link/);
  await fs.unlink(alias);
  const commit = await createGitCandidateStore(root).prepare({ operationId: "linked-fixture-basis", base: null, message: "Actual linked fixture", files: [{ path: "a.txt", bytesBase64: Buffer.from("a").toString("base64") }] });
  const worktree = path.join(root, "other-worktree"); await raw(git, ["-C", root, "worktree", "add", "--detach", worktree, commit.candidate.hex], { windowsHide: true });
  const main = await readGitProtectionFacts(root), other = await readGitProtectionFacts(worktree);
  assert.equal(main.coverage, "unknown"); assert.equal(other.coverage, "unknown");
  assert.equal(main.protectedGitRoots.includes(worktree), true); assert.equal(other.protectedGitRoots.includes(path.join(root, ".git")), true);
  assert.equal(other.protectedGitRoots.includes(worktree), false, "The current worktree's files are not mislabeled as another protected worktree");
});
