import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGitPolicy, computeGitPolicyDigest, classifyShell, defaultShellRules, type GitPolicyFacts, type GitStableInitialWorkflowSource } from "../../src/service/gate/shell-rules.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { planGitRepositoryInitialization, planEmptyGitCandidate, initializeGitRepository, createGitCandidateStore, planGitRefPublication } from "../../src/provider/trunk/public/trunk-store.ts";
import type { GitDeliveryIntegrationSource, GitDeliveryTaskSource } from "../../src/service/gate/shell-rules.ts";
import type { ActiveRoleEvidence, CompleteSnapshot, TrunkManifest, TrunkApplyJournal } from "../../src/model/trunk.ts";
import type { StableWriteRecord, StableWritePermit } from "../../src/model/version-change.ts";

const oid = { objectFormat: "sha1" as const, hex: "a".repeat(40) }, candidate = { objectFormat: "sha1" as const, hex: "b".repeat(40) };
const prefix = ["--no-pager", "--no-optional-locks", "--literal-pathspecs", ...["core.fsmonitor=false", "core.hooksPath=NUL", "core.untrackedCache=false", "core.excludesFile=NUL", "core.pager=cat", "pager.status=false", "pager.diff=false", "maintenance.auto=false", "gc.auto=0", "protocol.allow=never", "diff.external=", "core.attributesFile=NUL"].flatMap(v => ["-c", v])];
const command = (...body: string[]) => [...prefix, ...body];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const base = (): GitPolicyFacts => ({ repoId: "a".repeat(64), operationId: "op-1", actorRoleId: "product", taskId: "task-1",
  authorizationRevision: 7, currentAuthorizationRevision: 7, objectFormat: "sha1", template: "status", paths: ["docs/product/a.md"], readPaths: ["docs/product/"], writePaths: ["docs/product/"],
  argv: command("status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=all", "--", "docs/product/a.md") });

/** Actual temporary Git objects/plans only. These ordinary grants do not impersonate production settled task evidence. */
async function integrationPlanFixture(format: "sha1" | "sha256", inheritedMetadata = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g16-integrate-")), repo = await initializeGitRepository(root, format), objects = createGitCandidateStore(root);
  const timestamp = "2026-11-06T02:03:04.000Z", file = (path: string, text: string | null) => ({ path, bytesBase64: text === null ? null : Buffer.from(text).toString("base64") });
  const original = await objects.prepare({ operationId: "g16-unit-base", base: null, timestamp, message: "Original code basis",
    files: [file("README.md", "Preserve this exact base file\n"), file("src/impl/a.ts", "old impl\n"), file("src/impl/delete.ts", "delete me\n"), file("src/design/b.ts", "old design\n"),
      ...(inheritedMetadata ? [file(".ans/trunk/manifest.json", "Exact inherited manifest fixture bytes\n"), file("docs/contracts/unit-architecture-v1.md", "Preserve approved document bytes\n")] : [])] });
  const implFiles = [file("src/impl/a.ts", "new impl\n"), file("src/impl/delete.ts", null)], designFiles = [file("src/design/b.ts", "new design\n")];
  const impl = await objects.prepare({ operationId: "g16-unit-impl", base: original.candidate, timestamp, message: "Implementation object fixture", files: implFiles });
  const design = await objects.prepare({ operationId: "g16-unit-design", base: original.candidate, timestamp, message: "Design object fixture", files: designFiles });
  const input = { operationId: "g16-unit-integration", base: original.candidate, parents: [original.candidate, impl.candidate, design.candidate], timestamp,
    message: "Exact accepted-head relationship fixture", files: [...implFiles, ...designFiles] };
  const plan = await objects.plan(input);
  const grants = [{ ownerRoleId: "impl", paths: ["src/impl/"], candidate: impl.candidate, evidenceDigest: sha("unit ordinary impl-source binding") },
    { ownerRoleId: "design", paths: ["src/design/"], candidate: design.candidate, evidenceDigest: sha("unit ordinary design-source binding") }];
  const factsFor = (raw = plan): GitPolicyFacts => ({ ...base(), repoId: repo.repoId, operationId: input.operationId, actorRoleId: "convener", taskId: "unit-assigned-convener", runId: "unit-run",
    objectFormat: format, template: "integrate", paths: raw.input.files.map(file => file.path).sort(), readPaths: ["."], writePaths: [],
    base: original.candidate, candidate: raw.commit.candidate, ref: raw.ref, ownedCandidateRef: raw.ref, worksite: raw.worksite,
    rawObjectPlan: raw, commands: raw.commands, argv: raw.commands[0]!, integrationGrants: structuredClone(grants), readableOids: [original.candidate, impl.candidate, design.candidate],
    allDiff: { complete: true, base: original.candidate, candidate: raw.commit.candidate, entries: raw.diff } });
  return { root, objects, original, impl, design, input, plan, grants, factsFor, file };
}

/** Read real existing object bytes only in an owned fixture; never a production receipt or a publication. */
async function deliveryPlanFixture(format: "sha1" | "sha256") {
  const f = await integrationPlanFixture(format, true), actual = await f.objects.prepare(f.input), flowId = "unit-delivery";
  const hash = (value: unknown) => sha(JSON.stringify(testCanonical(value)));
  const sourceFiles = (files: typeof f.input.files) => files.map(file => ({ path: file.path,
    sha256: file.bytesBase64 === null ? null : createHash("sha256").update(Buffer.from(file.bytesBase64, "base64")).digest("hex") }));
  const worker = (roleId: string, files: typeof f.input.files): GitDeliveryTaskSource => ({ kind: "assigned-run-task", roleId, moduleId: `unit-${roleId}`,
    taskId: `unit-${roleId}-child`, runId: "unit-run", flowId, pinDigest: sha("pin"), taskDigest: sha(`unit-${roleId}-task`), runRecordSha256: sha("run"), scopeDigest: sha(`unit-${roleId}-scope`),
    base: { ref: "refs/ans/trunk", oid: f.original.candidate }, files: sourceFiles(files) });
  const contributors = [
    { operationId: "g16-unit-impl", candidate: f.impl.candidate, source: worker("impl", f.input.files.filter(file => file.path.startsWith("src/impl/"))), closeOperationId: "unit-impl-close", closeEventId: "unit-impl-close-event", reportSha256: sha("impl-report") },
    { operationId: "g16-unit-design", candidate: f.design.candidate, source: worker("design", f.input.files.filter(file => file.path.startsWith("src/design/"))), closeOperationId: "unit-design-close", closeEventId: "unit-design-close-event", reportSha256: sha("design-report") },
  ];
  const source: GitDeliveryIntegrationSource = { kind: "run-integration", roleId: "convener", taskId: "unit-assigned-convener", runId: "unit-run", flowId,
    pinDigest: sha("pin"), taskDigest: sha("convener-task"), runRecordSha256: sha("run"), scopeDigest: hash(contributors.map(row => row.source)),
    base: { ref: "refs/ans/trunk", oid: f.original.candidate }, files: sourceFiles(f.input.files), contributors };
  const ref = `refs/ans/delivery/${flowId}`;
  const firstPlan = await planGitRefPublication(f.root, ref, null, actual.candidate);
  const readCommitBytes = async (oid: typeof actual.candidate) => {
    const result = await promisify(execFile)("git", [...firstPlan.argv.slice(0, -5), "cat-file", "commit", oid.hex], { cwd: f.root, encoding: "buffer", windowsHide: true, maxBuffer: 64 * 1024 });
    return result.stdout.toString("base64");
  };
  const baseTree = await f.objects.listTree(f.original.candidate), baseCommitBytesBase64 = await readCommitBytes(f.original.candidate);
  async function facts(old: typeof actual.candidate | null = null, next = actual.candidate): Promise<GitPolicyFacts> {
    const plan = await planGitRefPublication(f.root, ref, old, next), raw = { ...plan, commitBytesBase64: await readCommitBytes(next), oldCommitBytesBase64: old ? await readCommitBytes(old) : null };
    return { ...f.factsFor(), operationId: "unit-delivery-publication", template: "publish-delivery", base: old, candidate: next, ref, publicationRef: ref,
      ownedCandidateRef: f.plan.ref, paths: [...new Set(plan.diff.flatMap(row => [row.oldPath, row.newPath].filter((p): p is string => !!p)))],
      rawObjectPlan: undefined, worksite: plan.worksite, refPublicationPlan: raw, deliveryBasis: { base: f.original.candidate, baseTree, source, candidateOperationId: f.input.operationId, baseCommitBytesBase64 },
      integrationGrants: contributors.map(row => ({ ownerRoleId: row.source.roleId, paths: row.source.files.map(file => file.path), candidate: row.candidate, evidenceDigest: hash(row.source) })),
      allDiff: { complete: true, base: old, candidate: next, entries: plan.diff }, argv: plan.argv, commands: [plan.argv] };
  }
  return { ...f, actual, source, facts };
}

/** Rebind ordinary source digests without asserting a real production run/accepted task. */
function deliveryFactsWithCodeRef(original: GitPolicyFacts, ref: string): GitPolicyFacts {
  const facts = structuredClone(original), source = facts.deliveryBasis!.source;
  assert.ok(source.kind === "run-integration");
  source.base.ref = ref;
  for (const row of source.contributors) row.source.base.ref = ref;
  source.scopeDigest = sha(JSON.stringify(testCanonical(source.contributors.map(row => row.source))));
  facts.integrationGrants = source.contributors.map(row => ({ ownerRoleId: row.source.roleId, paths: row.source.files.map(file => file.path), candidate: row.candidate,
    evidenceDigest: sha(JSON.stringify(testCanonical(row.source))) }));
  return facts;
}

for (const format of ["sha1", "sha256"] as const) test(`G18 actual ${format} delivery code basis accepts canonical same/cross-flow refs and rejects unrelated refs or changed evidence`, async t => {
  const f = await deliveryPlanFixture(format); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const original = await f.facts(), prefix = original.argv.slice(0, -5);
  for (const ref of ["refs/ans/trunk", "refs/ans/delivery/unit-delivery", "refs/ans/delivery/earlier-source-flow"]) {
    // Owned fixture setup only: create the exact real application ref to the existing code object.
    await promisify(execFile)("git", [...prefix, "update-ref", "--no-deref", ref, f.original.candidate.hex, "0".repeat(format === "sha1" ? 40 : 64)], { cwd: f.root, windowsHide: true });
    assert.deepEqual(await f.objects.readRef(ref), f.original.candidate);
    const facts = deliveryFactsWithCodeRef(original, ref), result = checkGitPolicy(facts);
    assert.equal(result.allowed, true, `${ref}: ${JSON.stringify(result)}`);
    assert.equal(result.inputDigest, computeGitPolicyDigest(facts));
    assert.equal(facts.deliveryBasis!.source.flowId, "unit-delivery", "The source application ref need not belong to the current flow");
  }
  for (const ref of ["HEAD", "refs/heads/main", "refs/heads/codex/otherwise-model-valid", "refs/remotes/origin/main", "refs/ans/candidates/" + "a".repeat(64),
    "refs/ans/trunk/child", "refs/ans/delivery", "refs/ans/delivery/", "refs/ans/delivery/a//b", "refs/ans/delivery/../other", "refs/ans/delivery/a.lock", "refs/ans/delivery/a\\b", "refs/ans/delivery/a\n", ""]) {
    const facts = deliveryFactsWithCodeRef(original, ref);
    assert.equal(checkGitPolicy(facts).code, "git-policy-delivery-source", ref);
  }
  const good = deliveryFactsWithCodeRef(original, "refs/ans/delivery/earlier-source-flow");
  const wrongOid = structuredClone(good); wrongOid.deliveryBasis!.source.base.oid = f.impl.candidate;
  assert.equal(checkGitPolicy(wrongOid).code, "git-policy-delivery-source");
  const wrongWorkerBase = structuredClone(good), integration = wrongWorkerBase.deliveryBasis!.source;
  assert.ok(integration.kind === "run-integration");
  const worker = integration.contributors[0]!.source;
  worker.base.ref = "refs/ans/delivery/another-source";
  integration.scopeDigest = sha(JSON.stringify(testCanonical(integration.contributors.map(row => row.source))));
  wrongWorkerBase.integrationGrants = wrongWorkerBase.integrationGrants!.map((row, index) => index === 0 ? { ...row, evidenceDigest: sha(JSON.stringify(testCanonical(worker))) } : row);
  assert.equal(checkGitPolicy(wrongWorkerBase).code, "git-policy-delivery-contributor", "Coherent new digests cannot hide a worker basis different from its controller");
});

for (const format of ["sha1", "sha256"] as const) test(`G17 actual ${format} ref-only first-null and existing delivery distinguish CAS diff from code-basis ACL`, async t => {
  const f = await deliveryPlanFixture(format); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  for (const old of [null, f.original.candidate, f.impl.candidate]) {
    const facts = await f.facts(old), result = checkGitPolicy(facts); assert.equal(result.allowed, true, JSON.stringify(result));
    assert.equal(result.inputDigest, computeGitPolicyDigest(facts));
    assert.equal(checkGitPolicy(structuredClone(facts)).allowed, true, "Ordinary clones preserve data, not host nonce/authority; O must reject copied preparations");
    assert.deepEqual(facts.refPublicationPlan!.candidateTree.find(row => row.path === ".ans/trunk/manifest.json"), facts.deliveryBasis!.baseTree.find(row => row.path === ".ans/trunk/manifest.json"));
    if (old === null) assert.ok(facts.allDiff!.entries.some(row => row.newPath === ".ans/trunk/manifest.json"), "First full CAS includes inherited metadata without granting its mutation");
    assert.equal(facts.commands!.length, 1); assert.equal(facts.ownedIndexId, undefined);
  }
  assert.equal(await f.objects.readRef("refs/ans/delivery/unit-delivery"), null, "Planning/ACL never publishes the delivery ref");
});

test("G17 ref-only denies wrong actor/ref/CAS/source/parents/commit bytes/tree/grants and extra commands", async t => {
  const f = await deliveryPlanFixture("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const facts = await f.facts(), plan = facts.refPublicationPlan!, basis = facts.deliveryBasis!;
  for (const patch of [
    { actorRoleId: "chief" }, { taskId: "other" }, { runId: "other" }, { currentAuthorizationRevision: 999 }, { template: "commit" }, { writePaths: ["src/"] },
    { ref: "refs/ans/trunk" }, { publicationRef: "refs/ans/delivery/other" }, { ownedCandidateRef: f.impl.candidate.hex }, { base: f.original.candidate }, { candidate: f.impl.candidate },
    { worksite: { kind: "ref-only", index: "fake-index", checkout: "not-used" } }, { ownedIndexId: "fake", currentIndexId: "fake" },
    { rawObjectPlan: f.plan }, { appGeneratedFiles: [] }, { businessJournal: {} }, { refPublicationPlan: undefined }, { deliveryBasis: undefined },
    { refPublicationPlan: { ...plan, commitBytesBase64: undefined } }, { refPublicationPlan: { ...plan, oldCommitBytesBase64: plan.commitBytesBase64 } },
    { refPublicationPlan: { ...plan, commitBytesBase64: Buffer.from("forged commit").toString("base64") } },
    { refPublicationPlan: { ...plan, commit: { ...plan.commit, tree: f.original.tree } } },
    { refPublicationPlan: { ...plan, commit: { ...plan.commit, parents: [...plan.commit.parents].reverse() } } },
    { refPublicationPlan: { ...plan, commit: { ...plan.commit, message: "forged" } } },
    { refPublicationPlan: { ...plan, candidateTree: plan.candidateTree.filter(row => row.path !== "README.md") } },
    { refPublicationPlan: { ...plan, diff: plan.diff.slice(1) } }, { allDiff: { ...facts.allDiff, complete: false } }, { paths: facts.paths.slice(1) },
    { deliveryBasis: { ...basis, baseCommitBytesBase64: plan.commitBytesBase64 } }, { deliveryBasis: { ...basis, base: f.impl.candidate } },
    { deliveryBasis: { ...basis, baseTree: basis.baseTree.filter(row => row.path !== ".ans/trunk/manifest.json") } },
    { deliveryBasis: { ...basis, candidateOperationId: "other" } }, { deliveryBasis: { ...basis, source: { ...basis.source, flowId: "other" } } },
    { deliveryBasis: { ...basis, source: { ...basis.source, scopeDigest: sha("wrong") } } }, { integrationGrants: [] },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, evidenceDigest: sha("wrong") })) },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, paths: ["src/"] })) },
    { commands: [...facts.commands!, command("reset", "--hard")] }, { argv: command("update-ref", "--no-deref", facts.ref!, facts.candidate!.hex, f.original.candidate.hex) },
  ]) assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  const existing = await f.facts(f.original.candidate);
  for (const raw of [{ ...existing.refPublicationPlan!, oldCommitBytesBase64: null }, { ...existing.refPublicationPlan!, baseTree: [] }, { ...existing.refPublicationPlan!, oldOid: f.impl.candidate }])
    assert.equal(checkGitPolicy({ ...existing, refPublicationPlan: raw }).allowed, false);
});

test("G17 recomputed real candidate plans still cannot alter inherited metadata/other owners/modes", async t => {
  const f = await deliveryPlanFixture("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  for (const extra of [f.file(".ans/trunk/manifest.json", "forged authority"), f.file("docs/contracts/unit-architecture-v1.md", "forged document"), f.file("src/unowned.ts", "unowned"),
    f.file("README.md", null), { ...f.file("src/impl/a.ts", "new impl\n"), executable: true }]) {
    const files = f.input.files.filter(file => file.path !== extra.path).concat(extra), actual = await f.objects.prepare({ ...f.input, operationId: `g17-bad-${sha(JSON.stringify(extra))}`, files });
    const facts = await f.facts(null, actual.candidate), result = checkGitPolicy(facts); assert.equal(result.allowed, false, JSON.stringify(result));
    assert.ok(["git-policy-delivery-write-scope", "git-policy-delivery-mode-change"].includes(result.code!), "Complete real commit/tree/diff binding passes before semantic ACL rejection");
  }
});

for (const format of ["sha1", "sha256"] as const) test(`G16 actual ${format} raw-object integrate recomputes full tree, ordered parents, deletion grants and commands`, async t => {
  const f = await integrationPlanFixture(format); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const facts = f.factsFor(), verdict = checkGitPolicy(facts); assert.equal(verdict.allowed, true, JSON.stringify(verdict));
  assert.equal(verdict.inputDigest, computeGitPolicyDigest(facts));
  const actual = await f.objects.prepare(f.input); assert.deepEqual(actual, f.plan.commit, "Read-only plan matches real multi-parent Git object bytes");
  assert.deepEqual(actual.parents, [f.original.candidate, f.impl.candidate, f.design.candidate]);
  const before = f.plan.baseTree.find(file => file.path === "README.md"), after = (await f.objects.listTree(actual.candidate)).find(file => file.path === "README.md");
  assert.deepEqual(after, before, "All unchanged base files survive the complete-tree integration");
  assert.equal(Buffer.from((await f.objects.readBlob(actual.candidate, "README.md")).bytesBase64, "base64").toString(), "Preserve this exact base file\n");
  assert.ok(f.plan.diff.some(row => row.status === "D" && row.oldPath === "src/impl/delete.ts"));
  assert.equal(await fs.stat(path.join(f.root, ".git/refs/ans/trunk")).then(() => true, () => false), false, "Owned object fixture is not a production publication");
});

test("G16 integrate refuses wrong actor/run/grants/parents/ref/commands and cannot pretend to be commit", async t => {
  const f = await integrationPlanFixture("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true })); const facts = f.factsFor();
  for (const patch of [{ actorRoleId: "chief" }, { actorRoleId: "impl" }, { taskId: undefined }, { runId: undefined }, { currentAuthorizationRevision: 99 },
    { template: "commit" }, { template: "publish-documents" }, { base: null }, { writePaths: ["src/"] }, { ref: "refs/heads/main" },
    { ownedIndexId: "fake-no-index", currentIndexId: "fake-no-index" }, { integrationGrants: undefined }, { integrationGrants: facts.integrationGrants!.slice(1) },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, ownerRoleId: "convener" })) },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, evidenceDigest: "unknown" })) },
    { integrationGrants: [facts.integrationGrants![1]!, facts.integrationGrants![0]!] },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, paths: ["../outside/"] })) },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, paths: ["src/impl/", "src/design/"] })) },
    { commands: [...facts.commands!, command("reset", "--hard")] }, { appGeneratedFiles: [] },
    { rawObjectPlan: { ...f.plan, commit: { ...f.plan.commit, parents: [f.original.candidate, f.design.candidate, f.impl.candidate] } } },
    { rawObjectPlan: { ...f.plan, input: { ...f.input, parents: [f.original.candidate, f.impl.candidate, f.impl.candidate] } } },
    { rawObjectPlan: { ...f.plan, input: { ...f.input, parents: Array(66).fill(f.original.candidate) } } },
    { rawObjectPlan: { ...f.plan, input: { ...f.input, parents: undefined } } },
    { allDiff: { ...facts.allDiff, entries: facts.allDiff!.entries.slice(1) } },
    { rawObjectPlan: { ...f.plan, baseTree: f.plan.baseTree.filter(file => file.path !== "README.md") } },
  ]) assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  const reversed = await f.objects.plan({ ...f.input, parents: [f.original.candidate, f.design.candidate, f.impl.candidate] });
  assert.equal(checkGitPolicy(f.factsFor(reversed)).allowed, false, "Recomputed parent order still requires the matching original grant order");
  const changed = { ...f.plan, commands: [command("hash-object", "-w", "--stdin"), ...f.plan.commands.slice(1)] };
  assert.equal(checkGitPolicy(f.factsFor(changed)).allowed, false, "The fixed no-filters command cannot be weakened");
});

test("G16 complete Provider replans cannot integrate metadata, controller-owned paths, ungranted deletes or mode changes", async t => {
  const f = await integrationPlanFixture("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  for (const input of [
    { ...f.input, files: [...f.input.files, f.file(".ans/state/permissions.json", "injected authority\n")] },
    { ...f.input, files: [...f.input.files, f.file("docs/scheduling/unit-team-v1.md", "controller's own docs are not a worker grant\n")] },
    { ...f.input, files: [...f.input.files, f.file("src/unowned.ts", "ungranted\n")] },
    { ...f.input, files: [...f.input.files, f.file("README.md", null)] },
    { ...f.input, files: f.input.files.map(file => file.path === "src/impl/a.ts" ? { ...file, executable: true } : file) },
  ]) {
    const plan = await f.objects.plan(input), verdict = checkGitPolicy(f.factsFor(plan)); assert.equal(verdict.allowed, false, JSON.stringify(verdict));
    assert.ok(["git-policy-raw-integration-scope", "git-policy-raw-mode-change"].includes(verdict.code!), "Recomputed bytes reach ownership/mode validation");
  }
  for (const mode of ["120000", "160000"]) {
    const facts = f.factsFor(), bad = structuredClone(facts.allDiff!); bad.entries = bad.entries.map(row => row.newPath === "src/impl/a.ts" ? { ...row, newMode: mode } : row);
    assert.equal(checkGitPolicy({ ...facts, allDiff: bad }).allowed, false, `Symlink/gitlink mode ${mode} cannot be injected into full diff`);
  }
});

test("G23 shared raw observations retain special modes and R/C without enabling unsupported revert", async t => {
  const f = await integrationPlanFixture("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  const facts = f.factsFor();
  assert.equal(checkGitPolicy({ ...facts, template: "revert", target: f.impl.candidate }).code, "git-policy-revert-basis");
  const observed: NonNullable<GitPolicyFacts["rawObjectPlan"]>["baseTree"] = f.plan.baseTree.map(row => row.path === "README.md" ? { ...row, mode: "120000" } : row);
  assert.equal(checkGitPolicy({ ...facts, rawObjectPlan: { ...f.plan, baseTree: observed } }).code, "git-policy-raw-base-tree");
  for (const status of ["R", "C"] as const) {
    const entries: NonNullable<GitPolicyFacts["allDiff"]>["entries"] = [{ status, oldPath: "src/impl/a.ts", newPath: "src/impl/renamed.ts", oldMode: "160000", newMode: "120000", oldOid: f.original.candidate, newOid: f.impl.candidate }];
    assert.equal(checkGitPolicy({ ...facts, allDiff: { ...facts.allDiff!, entries } }).allowed, false);
  }
  // Derived fields are ordinary observations, not implemented revert semantics or a grant.
  const commit = { commit: f.original.candidate, commitBytesBase64: "", tree: f.original.tree, entries: f.plan.baseTree };
  const plan = { ...f.plan, revertBasis: { target: commit, selectedParent: null, codeBasis: commit, inverseChanges: [], conflicts: [], complete: true } };
  assert.equal(checkGitPolicy({ ...facts, rawObjectPlan: plan }).code, "git-policy-raw-worksite");
});

for (const format of ["sha1", "sha256"] as const) test(`revert actual ${format} inverse preserves unrelated current entries and rejects false observations`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g-revert-policy-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const identity = await initializeGitRepository(root, format), objects = createGitCandidateStore(root), timestamp = "2026-11-06T13:00:00.000Z";
  const file = (path: string, text: string | null) => ({ path, bytesBase64: text === null ? null : Buffer.from(text).toString("base64") });
  const p = await objects.prepare({ operationId: "revert-parent", base: null, timestamp, message: "root", files: [file("src/impl/a.ts", "before\n"), file("README.md", "original\n"), file(".ans/trunk/manifest.json", "unchanged metadata\n")] });
  const target = await objects.prepare({ operationId: "revert-target", base: p.candidate, timestamp, message: "target", files: [file("src/impl/a.ts", "target\n")] });
  const current = await objects.prepare({ operationId: "revert-current", base: target.candidate, timestamp, message: "later unrelated changes", files: [file("README.md", "later\n"), file("src/impl/new.ts", "new\n")] });
  const conflict = await objects.prepare({ operationId: "revert-conflict", base: current.candidate, timestamp, message: "later competing change", files: [file("src/impl/a.ts", "competing\n")] });
  const input = { operationId: "unit-revert-candidate", base: current.candidate, timestamp, message: "revert target as a new candidate", files: [file("src/impl/a.ts", "before\n")] };
  const plan = await objects.plan(input), prefix = plan.commands[0]!.slice(0, -4);
  const read = async (commit: typeof p.candidate) => {
    const actual = await objects.readCommit(commit), bytes = await promisify(execFile)("git", [...prefix, "cat-file", "commit", commit.hex], { cwd: root, encoding: "buffer", windowsHide: true });
    return { commit, tree: actual.tree, entries: await objects.listTree(commit), commitBytesBase64: bytes.stdout.toString("base64") };
  };
  const basis = { target: await read(target.candidate), selectedParent: { ...await read(p.candidate), index: 1 }, codeBasis: await read(current.candidate), inverseChanges: plan.diff, conflicts: [] as import("../../src/model/trunk.ts").GitRawRevertConflict[], complete: true };
  const facts: GitPolicyFacts = { ...base(), repoId: identity.repoId, objectFormat: format, operationId: input.operationId, actorRoleId: "convener", runId: "unit-revert-run", template: "revert", target: target.candidate,
    paths: ["src/impl/a.ts"], writePaths: [], base: current.candidate, candidate: plan.commit.candidate, ref: plan.ref, ownedCandidateRef: plan.ref, worksite: plan.worksite,
    rawObjectPlan: { ...plan, revertBasis: basis }, argv: plan.commands[0]!, commands: plan.commands, integrationGrants: [{ ownerRoleId: "impl", paths: ["src/impl/"], candidate: target.candidate, evidenceDigest: sha("unit-ordinary-owner-source-not-authority") }],
    allDiff: { complete: true, base: current.candidate, candidate: plan.commit.candidate, entries: plan.diff } };
  assert.equal(checkGitPolicy(facts).allowed, true, JSON.stringify(checkGitPolicy(facts)));
  assert.equal(checkGitPolicy({ ...facts, rawObjectPlan: undefined, worksite: undefined, ownedIndexId: "legacy-index", currentIndexId: "legacy-index", ownedWorktreeId: "legacy-worktree", currentWorktreeId: "legacy-worktree" }).code, "git-policy-revert-plan-missing");
  const actual = await objects.prepare(input); assert.deepEqual(actual, plan.commit);
  assert.equal(Buffer.from((await objects.readBlob(actual.candidate, "README.md")).bytesBase64, "base64").toString(), "later\n");
  assert.equal(Buffer.from((await objects.readBlob(actual.candidate, "src/impl/new.ts")).bytesBase64, "base64").toString(), "new\n");
  const ref = "refs/ans/delivery/unit-revert", publication = await planGitRefPublication(root, ref, null, actual.candidate);
  const ownerGrants = facts.integrationGrants!.map(({ candidate: _candidate, ...grant }) => grant);
  const source: import("../../src/service/gate/shell-rules.ts").GitDeliveryRevertSource = { kind: "run-revert", roleId: "convener", taskId: facts.taskId!, runId: facts.runId!, flowId: "unit-revert",
    pinDigest: sha("unit-pin"), taskDigest: sha("unit-task"), runRecordSha256: sha("unit-run"), scopeDigest: sha(JSON.stringify(testCanonical(ownerGrants))), base: { ref: "refs/ans/trunk", oid: current.candidate },
    files: [{ path: "src/impl/a.ts", sha256: sha("before\n") }], target: target.candidate, revertBasis: basis, ownerGrants };
  const delivery: GitPolicyFacts = { ...facts, template: "publish-delivery", operationId: "unit-revert-publication", base: null, candidate: actual.candidate, ref, publicationRef: ref,
    rawObjectPlan: undefined, worksite: publication.worksite, argv: publication.argv, commands: [publication.argv],
    paths: [...new Set(publication.diff.flatMap(row => [row.oldPath, row.newPath].filter((p): p is string => !!p)))],
    allDiff: { complete: true, base: null, candidate: actual.candidate, entries: publication.diff },
    refPublicationPlan: { ...publication, commitBytesBase64: (await read(actual.candidate)).commitBytesBase64, oldCommitBytesBase64: null },
    deliveryBasis: { base: current.candidate, baseTree: basis.codeBasis.entries, baseCommitBytesBase64: basis.codeBasis.commitBytesBase64, candidateOperationId: input.operationId, source } };
  assert.equal(checkGitPolicy(delivery).allowed, true, JSON.stringify(checkGitPolicy(delivery)));
  const changedSources = [
    { ...source, contributors: [] }, { ...source, kind: "run-integration", contributors: [] }, { ...source, scopeDigest: sha("bad-scope") },
    { ...source, target: p.candidate }, { ...source, mainline: 1 }, { ...source, ownerGrants: [] }, { ...source, files: [] },
    { ...source, revertBasis: { ...basis, inverseChanges: [] } }, { ...source, revertBasis: { ...basis, codeBasis: basis.target } },
  ];
  for (const changed of changedSources) assert.equal(checkGitPolicy({ ...delivery, deliveryBasis: { ...delivery.deliveryBasis!, source: changed } } as GitPolicyFacts).allowed, false);
  const extraParent = { ...publication.commit, parents: [current.candidate, target.candidate] };
  assert.equal(checkGitPolicy({ ...delivery, refPublicationPlan: { ...delivery.refPublicationPlan!, commit: extraParent } }).code, "git-policy-delivery-parents");
  assert.equal(await objects.readRef(ref), null, "Pure publication plan does not mutate the real delivery ref");
  for (const patch of [
    { target: p.candidate }, { actorRoleId: "impl" }, { mainline: 1 }, { writePaths: ["src/"] }, { integrationGrants: [] },
    { integrationGrants: facts.integrationGrants!.map(row => ({ ...row, paths: ["src/other/"] })) },
    { rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, complete: false } } },
    { rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, inverseChanges: [] } } },
    { rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, selectedParent: null } } },
    { rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, codeBasis: { ...basis.codeBasis, commitBytesBase64: basis.target.commitBytesBase64 } } } },
    { rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, target: { ...basis.target, entries: basis.target.entries.slice(1) } } } },
    { commands: [...facts.commands!, command("reset", "--hard")] }, { ref: "refs/ans/trunk" },
  ]) assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  const conflictPlan = await objects.plan({ ...input, base: conflict.candidate }), conflictBasis = { ...basis, codeBasis: await read(conflict.candidate) };
  const denied = { ...facts, base: conflict.candidate, candidate: conflictPlan.commit.candidate, rawObjectPlan: { ...conflictPlan, revertBasis: conflictBasis }, argv: conflictPlan.commands[0]!, commands: conflictPlan.commands,
    allDiff: { complete: true, base: conflict.candidate, candidate: conflictPlan.commit.candidate, entries: conflictPlan.diff } };
  assert.equal(checkGitPolicy(denied).code, "git-policy-revert-derived-binding", "Forged empty conflicts do not hide the actual competing entry");
  const conflictRow = { path: "src/impl/a.ts", parent: basis.selectedParent.entries.find(row => row.path === "src/impl/a.ts")!, target: basis.target.entries.find(row => row.path === "src/impl/a.ts")!, current: conflictBasis.codeBasis.entries.find(row => row.path === "src/impl/a.ts")!, reason: "current-entry-differs-from-target" };
  denied.rawObjectPlan.revertBasis = { ...conflictBasis, conflicts: [conflictRow] };
  assert.equal(checkGitPolicy(denied).code, "git-policy-revert-conflict");
  const wrong = await objects.plan({ ...input, files: [file("src/impl/a.ts", "arbitrary owned bytes\n")] });
  assert.equal(checkGitPolicy({ ...facts, candidate: wrong.commit.candidate, rawObjectPlan: { ...wrong, revertBasis: basis }, argv: wrong.commands[0]!, commands: wrong.commands,
    allDiff: { complete: true, base: current.candidate, candidate: wrong.commit.candidate, entries: wrong.diff } }).code, "git-policy-revert-result-tree");
  const merge = await objects.prepare({ operationId: "revert-merge-target", base: p.candidate, parents: [p.candidate, current.candidate], timestamp, message: "merge target fixture", files: [file("src/impl/a.ts", "target\n")] });
  const mergeFacts = { ...facts, target: merge.candidate, mainline: 1, integrationGrants: facts.integrationGrants!.map(row => ({ ...row, candidate: merge.candidate })),
    rawObjectPlan: { ...facts.rawObjectPlan!, revertBasis: { ...basis, target: await read(merge.candidate) } } };
  assert.equal(checkGitPolicy(mergeFacts).allowed, true, JSON.stringify(checkGitPolicy(mergeFacts)));
  for (const mainline of [undefined, 0, 3, 1.5]) assert.equal(checkGitPolicy({ ...mergeFacts, mainline }).code, "git-policy-revert-mainline");
  const rootPlan = await objects.plan({ ...input, base: p.candidate, files: basis.selectedParent.entries.map(row => file(row.path, null)) });
  const rootBasis = { ...basis, target: basis.selectedParent, selectedParent: null, codeBasis: basis.selectedParent, inverseChanges: rootPlan.diff };
  const rootFacts = { ...facts, target: p.candidate, base: p.candidate, candidate: rootPlan.commit.candidate, paths: rootPlan.input.files.map(row => row.path),
    integrationGrants: facts.integrationGrants!.map(row => ({ ...row, paths: rootPlan.input.files.map(file => file.path), candidate: p.candidate })), rawObjectPlan: { ...rootPlan, revertBasis: rootBasis }, argv: rootPlan.commands[0]!, commands: rootPlan.commands,
    allDiff: { complete: true, base: p.candidate, candidate: rootPlan.commit.candidate, entries: rootPlan.diff } };
  assert.equal(checkGitPolicy(rootFacts).code, "git-policy-raw-integration-scope", "Real root has an empty parent but cannot erase inherited application metadata");
  assert.equal(checkGitPolicy({ ...rootFacts, mainline: 1 }).code, "git-policy-revert-root-parent");
});

/** Lower-layer fixture: no customer approval, active roles, run authorization or production lease is invented. */
async function documentPlanFixture(format: "sha1" | "sha256") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g8-policy-")), identity = await initializeGitRepository(root, format);
  const objects = createGitCandidateStore(root), at = "2026-11-05T01:02:03.000Z", operationId = "unit-document-publication";
  const documents = [{ path: "docs/product/unit-intent-v1.md", text: "Unit intent bytes\n" }, { path: "docs/proposals/unit-proposal-v1.md", text: "Unit planning bytes\n" }];
  const files = documents.map(file => ({ path: file.path, sha256: sha(file.text), bytesBase64: Buffer.from(file.text).toString("base64") }));
  const digest = sha(JSON.stringify(files.map(file => [file.path, file.sha256, file.bytesBase64])));
  const snapshot: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId: `s-${sha("unit-snapshot")}`, digest, files, createdAt: at };
  const snapshotRef = { snapshotId: snapshot.snapshotId, digest }, targetDigest = sha("Service-checked target fixture"), proposal = files[1]!;
  const source = { kind: "role-direct" as const, action: "version-upgrade" as const, actorRoleId: "product", operationId, applicationId: "unit-application", baseDigest: null, targetDigest, at, journalId: "unit-journal" };
  const manifest: TrunkManifest = { schema: "trunk/v1", trunkVersion: 1, source: "upgrade", previous: null, flowId: "unit", runId: null,
    artifacts: { documents: { proposal: { path: proposal.path, sha256: proposal.sha256, version: 1 } }, execution: { teamPlan: null, flow: null }, boundaries: {} },
    digest: targetDigest, createdAt: at, updatedAt: at, snapshotRef, actionSource: source };
  const journal: TrunkApplyJournal = { v: 1, schema: "trunk-apply-journal/v1", journalId: source.journalId, operationId, applicationId: source.applicationId,
    flowId: "unit", phase: "prepared", actionSource: source, targetSnapshot: snapshotRef, startedAt: at, updatedAt: at,
    target: { trunkVersion: 1, runId: null, documents: { proposal: { path: proposal.path, sha256: proposal.sha256 } }, execution: manifest.artifacts.execution },
    before: { trunkVersion: 0, runId: null, documents: {}, execution: manifest.artifacts.execution } };
  const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
  const contents = new Map(files.map(file => [file.path, Buffer.from(file.bytesBase64, "base64")]));
  contents.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify(manifest))); contents.set(`.ans/trunk/snapshots/${snapshot.snapshotId}.json`, Buffer.from(JSON.stringify(snapshot)));
  async function facts(content = contents): Promise<GitPolicyFacts> {
    const input = { operationId, base: null, files: [...content].map(([file, bytes]) => ({ path: file, bytesBase64: bytes.toString("base64") })), message: `ANS trunk 1 ${targetDigest}`, timestamp: at };
    const plan = await objects.plan(input);
    return { ...base(), repoId: identity.repoId, operationId, objectFormat: format, template: "commit", taskId: "unit-planning-task", paths: [...content.keys()],
      readPaths: ["."], writePaths: ["docs/product/"], base: null, candidate: plan.commit.candidate, ref: plan.ref, ownedCandidateRef: plan.ref,
      worksite: plan.worksite, rawObjectPlan: plan, argv: plan.commands[0]!, commands: plan.commands,
      allDiff: { complete: true, base: null, candidate: plan.commit.candidate, entries: plan.diff },
      businessPublication: { kind: "direct-document-publication", flowId: "unit", operationId, actorRoleId: "product", applicationId: source.applicationId,
        action: source.action, snapshot: snapshotRef, documents: manifest.artifacts.documents, execution: manifest.artifacts.execution },
      appGeneratedFiles: [...content].map(([file, bytes]) => ({ path: file, sha256: createHash("sha256").update(bytes).digest("hex"),
        oid: plan.diff.find(row => row.newPath === file)!.newOid!, kind: file === ".ans/trunk/manifest.json" ? "manifest" : file.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" : "snapshot-content" })),
      manifestSha256: createHash("sha256").update(content.get(".ans/trunk/manifest.json")!).digest("hex"), journalDigest: sha(JSON.stringify(canonical(binding))), businessJournal: journal };
  }
  return { root, contents, manifest, facts };
}

const testCanonical = (value: unknown): unknown => Array.isArray(value) ? value.map(testCanonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, testCanonical(item)])) : value;
const testJson = (value: unknown) => JSON.stringify(testCanonical(value));
const testSnapshot = (snapshotId: string, files: CompleteSnapshot["files"], createdAt: string): CompleteSnapshot => ({ schema: "complete-snapshot/v1", snapshotId, createdAt, files,
  digest: sha(JSON.stringify([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => [file.path, file.sha256, file.bytesBase64]))) });

/** Real objects are stored only in an owned temporary repository; these are planning-layer fixtures, not task/approval evidence. */
async function teamPlanPolicyFixture(format: "sha1" | "sha256", noOp = false) {
  const original = await documentPlanFixture(format), objects = createGitCandidateStore(original.root), at = "2026-11-05T02:03:04.000Z";
  const rosterText = `---\n${JSON.stringify({ schema: "project-roster/v3", flowId: "unit", version: 1, roles: [{ id: "impl", modules: ["impl-core"] }], modules: [{ id: "impl-core", path: "src/impl/" }] })}\n---\n# Unit roster\n`;
  const documents = ["proposal", "modules", "roster"].map(kind => { const text = kind === "roster" ? rosterText : `Unit ${kind}\n`;
    return { path: `docs/proposals/unit-${kind}-v1.md`, sha256: sha(text), bytesBase64: Buffer.from(text).toString("base64") }; });
  const planText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: "unit", version: 1,
    modules: { path: documents[1]!.path, sha256: documents[1]!.sha256 }, roster: { path: documents[2]!.path, sha256: documents[2]!.sha256 },
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# Unit team plan\n`;
  const plan = { path: "docs/scheduling/unit-team-v1.md", sha256: sha(planText), version: 1 };
  const planFile = { path: plan.path, sha256: plan.sha256, bytesBase64: Buffer.from(planText).toString("base64") };
  const oldSnapshot = testSnapshot("unit-plan-base", [...documents, ...(noOp ? [planFile] : [])], at);
  const previous: TrunkManifest = { ...original.manifest, actionSource: undefined, snapshotRef: { snapshotId: oldSnapshot.snapshotId, digest: oldSnapshot.digest },
    artifacts: { documents: Object.fromEntries(documents.map((file, i) => [["proposal", "modules", "roster"][i]!, { path: file.path, sha256: file.sha256, version: 1 }])),
      execution: { teamPlan: noOp ? { path: plan.path, sha256: plan.sha256 } : null, flow: null }, boundaries: {} } };
  const oldBytes = Buffer.from(JSON.stringify(previous));
  const stored = await objects.prepare({ operationId: "g9-real-fixture-base", base: null, message: "Unit actual object basis", timestamp: at,
    files: [...oldSnapshot.files, { path: ".ans/trunk/manifest.json", bytesBase64: oldBytes.toString("base64") },
      { path: `.ans/trunk/snapshots/${oldSnapshot.snapshotId}.json`, bytesBase64: Buffer.from(JSON.stringify(oldSnapshot)).toString("base64") }] });
  type Mutation = (value: { manifest: TrunkManifest; marker: Record<string, unknown>; content: Map<string, Buffer> }) => void;
  async function facts(mutate?: Mutation): Promise<GitPolicyFacts> {
    const operationId = "g9-real-fixture-plan", opHash = sha(JSON.stringify(operationId)), applicationId = `plan-${sha(testJson(["unit", operationId]))}`;
    const projectRef = (file: { path: string; sha256: string }) => ({ path: file.path, sha256: file.sha256 });
    const marker: Record<string, unknown> = { schema: "team-plan-completion/v1", operationId, actorRoleId: "convener", flowId: "unit", plan,
      modules: projectRef(documents[1]!), roster: projectRef(documents[2]!) };
    const content = new Map([...documents, planFile].map(file => [file.path, Buffer.from(file.bytesBase64, "base64")]));
    const manifest: TrunkManifest = { ...structuredClone(previous), source: noOp ? previous.source : "team-plan", trunkVersion: noOp ? 1 : 2,
      previous: noOp ? previous.previous : { trunkVersion: previous.trunkVersion, runId: previous.runId }, updatedAt: at,
      artifacts: { ...structuredClone(previous.artifacts), execution: { teamPlan: projectRef(plan), flow: null } } };
    mutate?.({ manifest, marker, content });
    const markerPath = `.ans/trunk/plan-completions/${opHash}.json`; content.set(markerPath, Buffer.from(testJson(marker)));
    const snapshot = testSnapshot("g9-unit-plan-result", [...content].map(([file, bytes]) => ({ path: file, sha256: createHash("sha256").update(bytes).digest("hex"), bytesBase64: bytes.toString("base64") })), at);
    const snapshotRef = { snapshotId: snapshot.snapshotId, digest: snapshot.digest }; manifest.snapshotRef = snapshotRef;
    manifest.digest = noOp ? previous.digest : sha(testJson({ flowId: manifest.flowId, trunkVersion: manifest.trunkVersion, artifacts: manifest.artifacts, snapshotRef }));
    const source = { kind: "role-direct" as const, action: "complete-team-plan" as const, actorRoleId: "convener", operationId, applicationId,
      baseDigest: previous.digest, targetDigest: manifest.digest, at, journalId: `j-plan-${opHash.slice(0, 24)}` }; manifest.actionSource = source;
    const docProjection = (refs: TrunkManifest["artifacts"]["documents"]) => Object.fromEntries(Object.entries(refs).map(([kind, ref]) => [kind, projectRef(ref!)]));
    const journal: TrunkApplyJournal = { v: 1, schema: "trunk-apply-journal/v1", operationId, applicationId, journalId: source.journalId, flowId: "unit", phase: "prepared",
      beforeSnapshot: previous.snapshotRef, targetSnapshot: snapshotRef, actionSource: source, startedAt: at, updatedAt: at,
      before: { trunkVersion: previous.trunkVersion, runId: null, documents: docProjection(previous.artifacts.documents), execution: previous.artifacts.execution },
      target: { trunkVersion: manifest.trunkVersion, runId: manifest.runId, documents: docProjection(manifest.artifacts.documents), execution: manifest.artifacts.execution } };
    const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
    content.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify(manifest))); content.set(`.ans/trunk/snapshots/${snapshot.snapshotId}.json`, Buffer.from(JSON.stringify(snapshot)));
    content.set(".ans/trunk/history/manifest-v1.json", oldBytes);
    const raw = await objects.plan({ operationId, base: stored.candidate, files: [...content].map(([file, bytes]) => ({ path: file, bytesBase64: bytes.toString("base64") })), message: `ANS trunk ${manifest.trunkVersion} ${manifest.digest}`, timestamp: at });
    const table = [...content].map(([file, bytes]) => ({ path: file, sha256: createHash("sha256").update(bytes).digest("hex"),
      oid: { objectFormat: format, hex: createHash(format).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex") },
      kind: file === ".ans/trunk/manifest.json" ? "manifest" as const : file.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" as const
        : file.startsWith(".ans/trunk/history/") ? "history" as const : file.startsWith(".ans/") ? "frozen-application-evidence" as const : "snapshot-content" as const }));
    return { ...base(), repoId: (await objects.inspect()).repoId, operationId, actorRoleId: "convener", objectFormat: format, template: "commit", paths: [...content.keys()], writePaths: ["docs/scheduling/"],
      base: stored.candidate, candidate: raw.commit.candidate, ref: raw.ref, ownedCandidateRef: raw.ref, worksite: raw.worksite, rawObjectPlan: raw, commands: raw.commands, argv: raw.commands[0]!,
      allDiff: { complete: true, base: stored.candidate, candidate: raw.commit.candidate, entries: raw.diff }, businessJournal: journal,
      businessBaseManifestBytesBase64: oldBytes.toString("base64"), manifestSha256: sha(JSON.stringify(manifest)), journalDigest: sha(testJson(binding)), appGeneratedFiles: table,
      businessPublication: { kind: "direct-document-publication", flowId: "unit", operationId, actorRoleId: "convener", applicationId, action: source.action,
        snapshot: snapshotRef, documents: manifest.artifacts.documents, execution: manifest.artifacts.execution } };
  }
  return { root: original.root, facts, objects };
}

async function activationPolicyFixture(format: "sha1" | "sha256") {
  const planning = await teamPlanPolicyFixture(format), planFacts = await planning.facts(), objects = planning.objects;
  const baseCommit = await objects.prepare(planFacts.rawObjectPlan!.input), at = "2026-11-05T03:04:05.000Z";
  const baseContent = new Map(planFacts.rawObjectPlan!.input.files.filter(file => !file.path.startsWith(".ans/trunk/history/")).map(file => [file.path, Buffer.from(file.bytesBase64!, "base64")]));
  const previous = JSON.parse(baseContent.get(".ans/trunk/manifest.json")!.toString()) as TrunkManifest;
  const canonicalRef = (ref: { path: string; sha256: string }) => ({ path: ref.path, sha256: ref.sha256 });
  const plan = previous.artifacts.execution.teamPlan!, roster = previous.artifacts.documents.roster!;
  type Mutation = (input: { manifest: TrunkManifest; activation: Record<string, unknown>; auth: Record<string, unknown>; resolved: Record<string, unknown>; content: Map<string, Buffer> }) => void;
  async function facts(mutate?: Mutation, delegated = false, judged = false): Promise<GitPolicyFacts> {
    const operationId = "g10-unit-activation", opHash = sha(testJson(operationId)), idHash = sha(testJson(["unit", operationId])), snapshotId = `s-activation-${idHash}`;
    const requestId = "g10-unit-d3", decisionId = judged ? `decision-${requestId}` : "unit-customer-d3", sourceBy = judged ? "judge" : delegated ? "chief-delegated" : "customer";
    const delegatedSource = { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "nominator", requestId, baseDigest: sha("historical delegation basis"), delegationRevision: 2,
      disposition: "select", selected: ["impl"], reason: "Recorded delegated selection", at };
    // 2026-11-09 judge-delegated（W-J3）：审计按账本事实自洽（engine/operatorId/group），decisionId 为应用真实回填值。
    const judgeAudit = { group: "decision", cardKind: "appointment", engine: "claude", reasonCode: "sufficient", selected: ["impl"], at };
    const created = { v: 1, at, kind: "request.created", requestId, flowId: "unit", sourceRoleId: "nominator", cardKind: "appointment" };
    const resolved: Record<string, unknown> = { v: 1, at, kind: "request.resolved", requestId, cardKind: "appointment", by: sourceBy, targetRoleIds: ["impl"], rosterVersion: 1,
      rosterSha256: roster.sha256, ...(judged ? { decisionId, operatorId: "judge:claude", judge: judgeAudit } : delegated ? { actionSource: delegatedSource } : { decisionId }) };
    const content = new Map(baseContent);
    const roleTexts = { "role-card.md": "# Unit implementation\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接", "执行原则", "质量职责", "标准工作流", "交付物清单"].map(section => `## ${section}\nMaintain assigned files.\n`).join(""),
      "boundary.md": "# Boundary\n## Section 1: 可修改文件与目录\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录（私有） | `src/impl/` | implementation |\n",
      "boundary.yaml": "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: implementation\n" };
    for (const [file, text] of Object.entries(roleTexts)) content.set(`角色卡/impl/${file}`, Buffer.from(text));
    const fileRef = (file: string) => ({ path: file, sha256: createHash("sha256").update(content.get(file)!).digest("hex") });
    const input = { operationId, flowId: "unit", targetRoleId: "impl", d3DecisionId: delegated ? requestId : decisionId,
      planRef: { ...canonicalRef(plan), snapshotId: previous.snapshotRef!.snapshotId, version: 1 }, rosterRef: { ...canonicalRef(roster), snapshotId: previous.snapshotRef!.snapshotId },
      documents: { card: fileRef("角色卡/impl/role-card.md"), boundaryMd: fileRef("角色卡/impl/boundary.md"), boundaryYaml: fileRef("角色卡/impl/boundary.yaml") } };
    const activation: Record<string, unknown> = { schema: "role-activation/v1", actorRoleId: "nominator", input };
    const auth: Record<string, unknown> = { schema: "role-authorization/v1", roleId: "impl", flowId: "unit", plan: canonicalRef(plan), roster: canonicalRef(roster),
      d3RequestId: requestId, d3Source: sourceBy, writesets: ["src/impl/"], ...(delegated ? { actionSource: delegatedSource } : { decisionId }) };
    const manifest = structuredClone(previous); mutate?.({ manifest, activation, auth, resolved, content });
    const d3Path = `.ans/role-evidence/d3-${sha(testJson(requestId))}.json`, activationPath = `.ans/role-evidence/activation-${opHash}.json`, authPath = ".ans/role-evidence/authorization-impl.json";
    content.set(d3Path, Buffer.from(testJson({ createdBytesBase64: Buffer.from(JSON.stringify(created)).toString("base64"), resolvedBytesBase64: Buffer.from(JSON.stringify(resolved)).toString("base64") })));
    content.set(activationPath, Buffer.from(testJson(activation))); content.set(authPath, Buffer.from(testJson(auth)));
    const paths = [roster.path, plan.path, d3Path, activationPath, "角色卡/impl/role-card.md", "角色卡/impl/boundary.md", "角色卡/impl/boundary.yaml", authPath];
    const snapshot = testSnapshot(snapshotId, paths.map(file => ({ ...fileRef(file), bytesBase64: content.get(file)!.toString("base64") })), at), snapshotRef = { snapshotId, digest: snapshot.digest };
    const ref = (file: string) => ({ ...fileRef(file), snapshotId });
    const evidence: ActiveRoleEvidence = { roleId: "impl", snapshotRef, rosterRef: ref(roster.path), planRef: ref(plan.path), d3Ref: ref(d3Path), activationRef: ref(activationPath),
      cardRef: ref("角色卡/impl/role-card.md"), boundaryMdRef: ref("角色卡/impl/boundary.md"), boundaryYamlRef: ref("角色卡/impl/boundary.yaml"), authorizationRef: ref(authPath) };
    const targetActive = { revision: 1, digest: sha(testJson({ impl: evidence })), roles: { ...manifest.activeRoles, impl: evidence } };
    manifest.activeRevision = 1; manifest.activeDigest = targetActive.digest; manifest.activeRoles = targetActive.roles;
    const expectedActive = { revision: 0, digest: null }, applicationId = `activation-${idHash}`;
    const source = { kind: "role-direct" as const, actorRoleId: "nominator", action: "activate-role-documents" as const, operationId, applicationId, journalId: `j-activation-${opHash.slice(0, 24)}`, baseDigest: null, targetDigest: targetActive.digest, at };
    const documentState = planFacts.businessJournal!.target;
    const metadata = { input, evidence, expectedActive, expectedTrunk: { version: previous.trunkVersion, digest: previous.digest }, targetActive: { revision: 1, digest: targetActive.digest }, noOp: false,
      role: { roleId: "impl", cardPath: evidence.cardRef.path, boundaryMdPath: evidence.boundaryMdRef.path, boundaryYamlPath: evidence.boundaryYamlRef.path, allowedPaths: [{ path: "src/impl/", kind: "directory" }] }, writesets: ["src/impl/"] };
    const journal: TrunkApplyJournal = { v: 1, schema: "trunk-apply-journal/v1", operationId, applicationId, journalId: source.journalId, flowId: "unit", phase: "prepared", actionSource: source,
      targetSnapshot: snapshotRef, beforeSnapshot: previous.snapshotRef, target: documentState, before: documentState, startedAt: at, updatedAt: at, message: testJson(metadata) };
    const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
    content.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify(manifest))); content.set(`.ans/trunk/snapshots/${snapshotId}.json`, Buffer.from(JSON.stringify(snapshot)));
    const raw = await objects.plan({ operationId, base: baseCommit.candidate, files: [...content].map(([file, bytes]) => ({ path: file, bytesBase64: bytes.toString("base64") })), message: `ANS trunk ${manifest.trunkVersion} ${manifest.digest}`, timestamp: manifest.updatedAt });
    return { ...planFacts, operationId, actorRoleId: "nominator", writePaths: ["角色卡/impl/"], paths: [...content.keys()], base: baseCommit.candidate, candidate: raw.commit.candidate,
      rawObjectPlan: raw, ref: raw.ref, ownedCandidateRef: raw.ref, argv: raw.commands[0]!, commands: raw.commands, allDiff: { complete: true, base: baseCommit.candidate, candidate: raw.commit.candidate, entries: raw.diff },
      businessPublication: { kind: "role-activation-publication", flowId: "unit", operationId, actorRoleId: "nominator", action: "activate-role-documents", applicationId, snapshot: snapshotRef,
        documentSnapshot: previous.snapshotRef!, targetRoleId: "impl", evidence, expectedActive, targetActive, documents: manifest.artifacts.documents, execution: manifest.artifacts.execution },
      businessJournal: journal, businessBaseManifestBytesBase64: baseContent.get(".ans/trunk/manifest.json")!.toString("base64"), manifestSha256: sha(JSON.stringify(manifest)), journalDigest: sha(testJson(binding)),
      appGeneratedFiles: [...content].map(([file, bytes]) => ({ path: file, sha256: createHash("sha256").update(bytes).digest("hex"),
        oid: { objectFormat: format, hex: createHash(format).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex") },
        kind: file === ".ans/trunk/manifest.json" ? "manifest" : file.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" : file.startsWith(".ans/trunk/history/") ? "history" : file.startsWith(".ans/") ? "frozen-application-evidence" : "snapshot-content" })) };
  }
  return { root: planning.root, facts, objects };
}

/** Stored raw objects exercise the pure policy; this fixture does not invent production approval or run-list observations. */
async function initialWorkflowPolicyFixture(format: "sha1" | "sha256", alreadyBound = false) {
  const activation = await activationPolicyFixture(format), activeFacts = await activation.facts(), objects = activation.objects;
  const baseContent = new Map(activeFacts.rawObjectPlan!.input.files.map(file => [file.path, Buffer.from(file.bytesBase64!, "base64")]));
  const previous = JSON.parse(baseContent.get(".ans/trunk/manifest.json")!.toString()) as TrunkManifest;
  if (alreadyBound) { previous.artifacts.workflow = { kind: "workflow", path: "docs/workflow.md", sha256: sha("Existing workflow\n") };
    baseContent.set("docs/workflow.md", Buffer.from("Existing workflow\n")); baseContent.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify(previous))); }
  const baseCommit = await objects.prepare({ ...activeFacts.rawObjectPlan!.input, operationId: "g11-actual-raw-basis", files: [...baseContent].map(([file, value]) => ({ path: file, bytesBase64: value.toString("base64") })) });
  const document = JSON.parse(baseContent.get(`.ans/trunk/snapshots/${previous.snapshotRef!.snapshotId}.json`)!.toString()) as CompleteSnapshot;
  const at = "2026-11-05T04:05:06.000Z", expiresAt = "2026-11-05T04:35:06.000Z", requestId = "g11-unit-stable-request", permitId = "g11-unit-permit";
  const operationId = `initial-workflow-${sha(JSON.stringify(["unit", requestId, permitId]))}`, sourcePath = `.ans/trunk/operations/${sha(operationId)}/stable-source.json`;
  type Mutation = (value: { source: GitStableInitialWorkflowSource; record: StableWriteRecord; permit: StableWritePermit; manifest: TrunkManifest; content: Map<string, Buffer>; input: Record<string, unknown>; history: { bytes: Buffer } }) => void;
  async function facts(mutate?: Mutation): Promise<GitPolicyFacts> {
    const workflow = "# Unit actual workflow bytes\nChief coordinates the assigned implementation.\n", targetSha256 = sha(workflow), authority = { decisionId: "unit-stable-execution-approval" };
    const source: GitStableInitialWorkflowSource = { schema: "stable-initial-workflow-source/v1", kind: "stable-initial-workflow", operationId, flowId: "unit", taskId: "unit-convener-task", runId: "unit-planning-run",
      coreSessionId: "unit-core-source", coreTurnId: "unit-request-turn", roleId: "convener", requestId, permitId, path: "docs/workflow.md", baseSha256: "", targetSha256,
      authority, documentCommit: { version: previous.trunkVersion, digest: previous.digest }, documentSnapshot: previous.snapshotRef! };
    const record: StableWriteRecord = { v: 1, schema: "stable-write/v1", requestId, permitId, roleId: "convener", path: source.path, kind: "workflow", baseSha256: "", targetSha256,
      status: "written", diffPreview: "Unit approved change", at, decisionId: authority.decisionId, approvedAt: at, expiresAt, writtenAt: at, consumedAt: at };
    const permit: StableWritePermit = { v: 1, schema: "stable-write/v1", requestId, permitId, roleId: "convener", path: source.path, kind: "workflow", baseSha256: "", targetSha256,
      status: "consumed", authority, approvedAt: at, issuedAt: at, expiresAt, consumedAt: at };
    const input: Record<string, unknown> = { kind: "workflow", roleId: "convener", path: source.path, oldSha: "", newSha: targetSha256, decisionId: authority.decisionId, at };
    const manifest: TrunkManifest = { ...structuredClone(previous), updatedAt: at, artifacts: { ...structuredClone(previous.artifacts),
      workflow: { kind: "workflow", path: source.path, sha256: targetSha256, updatedAt: at, ...authority } } };
    const content = new Map(document.files.map(file => [file.path, Buffer.from(file.bytesBase64, "base64")])); content.set(source.path, Buffer.from(workflow));
    const history = { bytes: baseContent.get(".ans/trunk/manifest.json")! };
    mutate?.({ source, record, permit, manifest, content, input, history });
    const recordsPath = ".ans/state/stable-writes.json", permitsPath = ".ans/state/stable-write-permits.json";
    content.set(recordsPath, Buffer.from(JSON.stringify([record], null, 2) + "\n")); content.set(permitsPath, Buffer.from(JSON.stringify([permit], null, 2) + "\n")); content.set(sourcePath, Buffer.from(testJson(source)));
    const hashBytes = (file: string) => createHash("sha256").update(content.get(file)!).digest("hex");
    const id = `s-initial-workflow-${sha(JSON.stringify([previous.snapshotRef, requestId, source.targetSha256, hashBytes(recordsPath), hashBytes(permitsPath)]))}`;
    const snapshot = testSnapshot(id, [...content].map(([file, value]) => ({ path: file, sha256: hashBytes(file), bytesBase64: value.toString("base64") })), at);
    const snapshotRef = { snapshotId: id, digest: snapshot.digest }; manifest.snapshotRef = snapshotRef;
    const project = (ref: { path: string; sha256: string }) => ({ path: ref.path, sha256: ref.sha256 });
    const before = { trunkVersion: previous.trunkVersion, runId: previous.runId, documents: Object.fromEntries(Object.entries(previous.artifacts.documents).map(([kind, ref]) => [kind, project(ref!)])),
      execution: previous.artifacts.execution, boundaries: previous.artifacts.boundaries };
    const journal: TrunkApplyJournal = { v: 1, schema: "trunk-apply-journal/v1", operationId, applicationId: `stable:${requestId}`, journalId: `j-${operationId}`, flowId: "unit", phase: "prepared",
      before, target: { ...before, workflow: { path: "docs/workflow.md", sha256: source.targetSha256 } }, beforeSnapshot: previous.snapshotRef, targetSnapshot: snapshotRef, startedAt: at, updatedAt: at,
      message: testJson({ schema: "stable-initial-workflow/v1", source, sourceFile: { path: sourcePath, sha256: hashBytes(sourcePath) }, record, permit, input }) };
    const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
    content.set(`.ans/trunk/snapshots/${id}.json`, Buffer.from(JSON.stringify(snapshot)));
    for (const evidence of Object.values(previous.activeRoles ?? {})) { const file = `.ans/trunk/snapshots/${evidence.snapshotRef.snapshotId}.json`; content.set(file, baseContent.get(file)!); }
    content.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify(manifest))); const archive = `.ans/trunk/history/manifest-v${previous.trunkVersion}.json`;
    content.set(archive, history.bytes);
    const raw = await objects.plan({ operationId, base: baseCommit.candidate, files: [...content].map(([file, value]) => ({ path: file, bytesBase64: value.toString("base64") })), message: `ANS trunk ${manifest.trunkVersion} ${manifest.digest}`, timestamp: manifest.updatedAt });
    return { ...activeFacts, operationId, actorRoleId: "convener", taskId: source.taskId, runId: source.runId, paths: [...content.keys()], writePaths: ["docs/workflow.md"],
      base: baseCommit.candidate, candidate: raw.commit.candidate, ref: raw.ref, ownedCandidateRef: raw.ref, rawObjectPlan: raw, argv: raw.commands[0]!, commands: raw.commands,
      allDiff: { complete: true, base: baseCommit.candidate, candidate: raw.commit.candidate, entries: raw.diff }, businessBaseManifestBytesBase64: baseContent.get(".ans/trunk/manifest.json")!.toString("base64"),
      businessJournal: journal, journalDigest: sha(testJson(binding)), manifestSha256: sha(JSON.stringify(manifest)),
      businessPublication: { kind: "stable-initial-workflow-publication", actorRoleId: "convener", flowId: "unit", operationId, source, record, permit, snapshot: snapshotRef,
        documentSnapshot: previous.snapshotRef!, documents: manifest.artifacts.documents, execution: manifest.artifacts.execution },
      appGeneratedFiles: [...content].map(([file, value]) => ({ path: file, sha256: hashBytes(file), oid: { objectFormat: format, hex: createHash(format).update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex") },
        kind: file === ".ans/trunk/manifest.json" ? "manifest" : file.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot" : file.startsWith(".ans/trunk/history/") ? "history" : file.startsWith(".ans/") ? "frozen-application-evidence" : "snapshot-content" })) };
  }
  return { root: activation.root, facts };
}

for (const format of ["sha1", "sha256"] as const) test(`G11 actual ${format} approved-source/written-consumed initial workflow preserves active and document authority`, async t => {
  const fixture = await initialWorkflowPolicyFixture(format); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const facts = await fixture.facts(), result = checkGitPolicy(facts); assert.equal(result.allowed, true, JSON.stringify(result));
  assert.equal(facts.businessJournal!.actionSource, undefined, "Initial stable workflow source is not a role-direct action");
  const publication = { ...facts, template: "publish-documents" as const, ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk",
    commands: [...facts.commands!, command("update-ref", "--no-deref", "refs/ans/trunk", facts.candidate!.hex, facts.base!.hex)] };
  assert.equal(checkGitPolicy(publication).allowed, true, JSON.stringify(checkGitPolicy(publication)));
  assert.equal(await fs.stat(path.join(fixture.root, ".git/refs/ans/trunk")).then(() => true, () => false), false, "Pure approval bindings cannot publish");
});

test("G11 full replans reject false source, unconsumed permission, changed mainline/active/history/workflow and transport", async t => {
  const fixture = await initialWorkflowPolicyFixture("sha1"); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const mutations: Parameters<typeof fixture.facts>[0][] = [
    ({ source }) => { source.coreSessionId = ""; }, ({ source }) => { source.flowId = "other"; }, ({ source }) => { source.targetSha256 = ""; },
    ({ source }) => { source.documentCommit.digest = sha("other"); }, ({ source }) => { Object.assign(source, { safe: true }); },
    ({ permit }) => { permit.status = "approved"; }, ({ record }) => { record.status = "approved"; }, ({ record }) => { record.decisionId = "false"; },
    ({ permit }) => { permit.authority = { decisionId: "false" }; }, ({ permit }) => { permit.consumedAt = "2026-11-05T05:05:06.000Z"; },
    ({ manifest }) => { manifest.trunkVersion++; }, ({ manifest }) => { manifest.source = "upgrade"; }, ({ manifest }) => { manifest.runId = "future-pin"; },
    ({ manifest }) => { manifest.activeRevision!++; }, ({ manifest }) => { manifest.frozenRoles = {}; },
    ({ manifest }) => { manifest.artifacts.documents.proposal!.sha256 = sha("changed"); },
    ({ content }) => { content.set("docs/workflow.md", Buffer.from("different workflow\n")); },
    ({ content }) => { content.set("docs/proposals/unit-proposal-v1.md", Buffer.from("different old document\n")); },
    ({ content }) => { content.set(".ans/state/permissions.json", Buffer.from("injected authority")); },
    ({ content }) => { content.set(".ans/trunk/history/manifest-v99.json", Buffer.from("invented history")); },
    ({ history }) => { history.bytes = Buffer.concat([history.bytes, Buffer.from("\n")]); },
    ({ input }) => { input.newSha = sha("other"); },
  ];
  for (const mutate of mutations) { const facts = await fixture.facts(mutate), result = checkGitPolicy(facts); assert.equal(result.allowed, false, JSON.stringify(result));
    assert.ok(!["git-policy-raw-object-binding", "git-policy-raw-complete-diff"].includes(result.code!), "Recomputed Provider plans reach stable-source semantics"); }
  const facts = await fixture.facts();
  for (const patch of [{ actorRoleId: "product" }, { taskId: "other" }, { runId: "other" }, { currentAuthorizationRevision: "other" }, { ref: "refs/heads/main" },
    { commands: [...facts.commands!, command("reset", "--hard")] }, { businessJournal: { ...facts.businessJournal, actionSource: { kind: "customer-decision", decisionId: "fake", at: "2026-11-05" } } }])
    assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  const existing = await initialWorkflowPolicyFixture("sha1", true); t.after(() => fs.rm(existing.root, { recursive: true, force: true }));
  assert.equal(checkGitPolicy(await existing.facts()).code, "git-policy-workflow-initial-basis");
});

for (const format of ["sha1", "sha256"] as const) test(`G10 actual ${format} independent eight-ref activation preserves document mainline and accepts historical D3 source`, async t => {
  const fixture = await activationPolicyFixture(format); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  for (const delegated of [false, true]) {
    const facts = await fixture.facts(undefined, delegated); assert.equal(checkGitPolicy(facts).allowed, true, JSON.stringify(checkGitPolicy(facts)));
    const pub = { ...facts, template: "publish-documents" as const, ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk", commands: [...facts.commands!, command("update-ref", "--no-deref", "refs/ans/trunk", facts.candidate!.hex, facts.base!.hex)] };
    assert.equal(checkGitPolicy(pub).allowed, true, JSON.stringify(checkGitPolicy(pub)));
    assert.ok(facts.businessPublication?.kind === "role-activation-publication");
    assert.equal("runId" in facts.businessPublication.evidence, false); assert.equal("pinDigest" in facts.businessPublication.evidence, false);
  }
});

// 2026-11-09 judge-delegated（方案 §3.7/I-35、B1 J11/AC-J7）：active D3 接受诚实 judge 审计，
// 授权期望形状为 `d3Source:"judge"` + 应用真实 `decisionId`（`decision-<requestId>`，不是客户 decisionId、无 actionSource）。
for (const format of ["sha1", "sha256"] as const) test(`G10 actual ${format} judge-delegated D3 accepts honest judge audit with the real application decisionId`, async t => {
  const fixture = await activationPolicyFixture(format); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const facts = await fixture.facts(undefined, false, true), result = checkGitPolicy(facts);
  assert.equal(result.allowed, true, JSON.stringify(result));
  const pub = { ...facts, template: "publish-documents" as const, ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk", commands: [...facts.commands!, command("update-ref", "--no-deref", "refs/ans/trunk", facts.candidate!.hex, facts.base!.hex)] };
  assert.equal(checkGitPolicy(pub).allowed, true, JSON.stringify(checkGitPolicy(pub)));
});

test("G10 judge-delegated D3 variants reject malformed audit, mismatched operatorId/decisionId and mixed sources", async t => {
  const fixture = await activationPolicyFixture("sha1"); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const baseline = await fixture.facts(undefined, false, true);
  assert.equal(checkGitPolicy(baseline).allowed, true, JSON.stringify(checkGitPolicy(baseline)));
  const judgeShape = (patch: Record<string, unknown>): Parameters<typeof fixture.facts>[0] => ({ resolved }) => Object.assign(resolved, patch);
  const mutations: Parameters<typeof fixture.facts>[0][] = [
    judgeShape({ judge: null }), judgeShape({ judge: "sufficient" }), judgeShape({ judge: [] }), judgeShape({ judge: {} }),
    ({ resolved }) => { delete resolved.judge; },
    ({ resolved }) => { (resolved.judge as Record<string, unknown>).engine = ""; },
    ({ resolved }) => { (resolved.judge as Record<string, unknown>).reasonCode = ""; },
    ({ resolved }) => { (resolved.judge as Record<string, unknown>).cardKind = "stable-write"; },
    ({ resolved }) => { (resolved.judge as Record<string, unknown>).group = "approval"; },
    ({ resolved }) => { resolved.operatorId = "judge:codex"; },
    ({ resolved }) => { delete resolved.operatorId; },
    ({ resolved }) => { resolved.decisionId = "unit-customer-d3"; },
    ({ resolved }) => { resolved.decisionId = "decision-other-request"; },
    ({ resolved }) => { delete resolved.decisionId; },
    ({ resolved }) => { resolved.actionSource = { kind: "chief-delegated" }; },
    ({ resolved }) => { resolved.directiveId = "d-1"; },
  ];
  for (const mutate of mutations) {
    const result = checkGitPolicy(await fixture.facts(mutate, false, true));
    assert.equal(result.allowed, false, JSON.stringify(result));
    assert.equal(result.code, "git-policy-active-judge-d3", JSON.stringify(result));
  }
  // 授权期望形状只消费 d3Source 与真实 decisionId；伪造/混入其他来源必须拒绝。
  const authMutations: Parameters<typeof fixture.facts>[0][] = [
    ({ auth }) => { auth.decisionId = "invented"; }, ({ auth }) => { auth.d3Source = "customer"; },
    ({ auth }) => { delete auth.decisionId; }, ({ auth }) => { auth.actionSource = { kind: "judge-delegated" }; },
  ];
  for (const mutate of authMutations) {
    const result = checkGitPolicy(await fixture.facts(mutate, false, true));
    assert.equal(result.allowed, false, JSON.stringify(result));
    assert.equal(result.code, "git-policy-active-authorization", JSON.stringify(result));
  }
  // 既有 customer/chief fixture 伪造 `by:"judge"` 但无审计：继续拒绝（不因新增 judge 分支放行）。
  const forged = await fixture.facts(({ resolved }) => { resolved.by = "judge"; });
  assert.equal(checkGitPolicy(forged).allowed, false, JSON.stringify(checkGitPolicy(forged)));
});

test("G10 complete replans reject activation changes to authority, document bytes, role evidence, history and transport", async t => {
  const fixture = await activationPolicyFixture("sha1"); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const mutations: Parameters<typeof fixture.facts>[0][] = [
    ({ manifest }) => { manifest.trunkVersion++; }, ({ manifest }) => { manifest.digest = sha("other"); },
    ({ manifest }) => { manifest.artifacts.workflow = { kind: "workflow", path: "docs/workflow.md", sha256: sha("future") }; },
    ({ manifest }) => { manifest.frozenRoles = {}; }, ({ manifest }) => { manifest.roles = ["impl"]; },
    ({ manifest }) => { manifest.activeRoles = { other: {} as ActiveRoleEvidence }; },
    ({ resolved }) => { resolved.targetRoleIds = ["other"]; }, ({ resolved }) => { resolved.rosterSha256 = sha("other"); },
    ({ resolved }) => { resolved.by = "judge"; }, ({ activation }) => { activation.actorRoleId = "product"; },
    ({ auth }) => { auth.writesets = ["src/admin/"]; }, ({ auth }) => { auth.roleId = "other"; },
    ({ auth }) => { auth.decisionId = "invented"; },
    ({ content }) => { content.set("角色卡/impl/role-card.md", Buffer.from("# Incomplete card\n")); },
    ({ content }) => { content.set("角色卡/impl/boundary.yaml", Buffer.from("role: impl\nentries:\n  - kind: directory\n    path: src/admin/\n    purpose: admin\n")); },
    ({ content }) => { content.set(".ans/trunk/history/manifest-v2.json", Buffer.from("injected history")); },
    ({ content }) => { content.set(".ans/state/permissions.json", Buffer.from("injected authorization")); },
    ({ content }) => { content.set("角色卡/other/role-card.md", Buffer.from("other role")); },
    ({ content }) => { content.set("docs/proposals/unit-proposal-v1.md", Buffer.from("rewritten old planning")); },
  ];
  for (const mutate of mutations) { const result = checkGitPolicy(await fixture.facts(mutate)); assert.equal(result.allowed, false, JSON.stringify(result));
    assert.ok(!["git-policy-raw-object-binding", "git-policy-raw-complete-diff"].includes(result.code!), "Provider-recomputed valid plans must reach activation semantics"); }
  const facts = await fixture.facts();
  assert.ok(facts.businessPublication?.kind === "role-activation-publication");
  for (const patch of [{ actorRoleId: "convener" }, { currentAuthorizationRevision: 99 }, { ref: "refs/heads/main" }, { commands: [...facts.commands!, command("reset", "--hard")] },
    { businessPublication: { ...facts.businessPublication, kind: "direct-document-publication" } },
    { businessPublication: { ...facts.businessPublication, targetRoleId: "other" } }, { businessPublication: { ...facts.businessPublication, evidence: { ...facts.businessPublication!.evidence, runId: "fake" } } },
    { businessPublication: { ...facts.businessPublication, evidence: { ...facts.businessPublication!.evidence, authorizationRef: undefined } } },
    { businessJournal: { ...facts.businessJournal, actionSource: { ...facts.businessJournal!.actionSource, actorRoleId: "product" } } }])
    assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
});

for (const format of ["sha1", "sha256"] as const) test(`G9 actual ${format} existing-base team-plan completion preserves other authority and supports exact no-op`, async t => {
  for (const noOp of [false, true]) {
    const fixture = await teamPlanPolicyFixture(format, noOp); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
    const facts = await fixture.facts(); assert.equal(checkGitPolicy(facts).allowed, true, JSON.stringify(checkGitPolicy(facts)));
    const publication = { ...facts, template: "publish-documents" as const, ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk",
      commands: [...facts.commands!, command("update-ref", "--no-deref", "refs/ans/trunk", facts.candidate!.hex, facts.base!.hex)] };
    assert.equal(checkGitPolicy(publication).allowed, true, JSON.stringify(checkGitPolicy(publication)));
    assert.equal(facts.businessJournal!.target.trunkVersion, noOp ? 1 : 2);
    assert.equal(await fs.stat(path.join(fixture.root, ".git/refs/ans/trunk")).then(() => true, () => false), false, "Ordinary policy does not publish a plan or no-op");
  }
});

test("G9 fully re-planned team-plan tampering cannot change refs, authorization, marker, versions or unrelated bytes", async t => {
  const fixture = await teamPlanPolicyFixture("sha1"); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const mutations: Parameters<typeof fixture.facts>[0][] = [
    ({ manifest }) => { Object.assign(manifest, { unrecognizedAuthorization: true }); },
    ({ manifest }) => { manifest.activeRoles = {}; }, ({ manifest }) => { manifest.d3 = { decisionId: "fake", targetRoleIds: ["impl"] }; },
    ({ manifest }) => { manifest.artifacts.workflow = { kind: "workflow", path: "docs/workflow.md", sha256: sha("fake") }; },
    ({ manifest }) => { manifest.artifacts.documents.proposal!.sha256 = sha("different"); },
    ({ manifest }) => { manifest.artifacts.execution.flow = { path: "docs/flows/unit-flow-v1.md", sha256: sha("different"), version: 1 }; },
    ({ manifest }) => { manifest.trunkVersion = 1; }, ({ manifest }) => { manifest.trunkVersion = 3; },
    ({ marker }) => { marker.operationId = "other"; }, ({ marker }) => { marker.actorRoleId = "product"; },
    ({ marker }) => { marker.schema = "unknown"; }, ({ marker }) => { marker.extraAuthorization = true; },
    ({ marker }) => { marker.plan = { path: "docs/scheduling/other-team-v1.md", sha256: sha("other"), version: 1 }; },
    ({ content }) => { content.set("docs/proposals/unit-proposal-v1.md", Buffer.from("different bytes")); },
    ({ content }) => { content.set(".ans/state/permissions.json", Buffer.from("injected")); },
  ];
  for (const mutation of mutations) {
    const facts = await fixture.facts(mutation), result = checkGitPolicy(facts); assert.equal(result.allowed, false, JSON.stringify(result));
    assert.ok(!["git-policy-raw-object-binding", "git-policy-raw-complete-diff"].includes(result.code!), "Real Provider replans reach semantic checks");
  }
  const facts = await fixture.facts();
  for (const patch of [{ actorRoleId: "product" }, { currentAuthorizationRevision: 9 }, { businessPublication: { ...facts.businessPublication, action: "version-upgrade" } },
    { base: null }, { businessBaseManifestBytesBase64: undefined }, { ref: "refs/heads/main" }, { commands: [...facts.commands!, command("reset", "--hard")] }])
    assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  const noOp = await teamPlanPolicyFixture("sha1", true); t.after(() => fs.rm(noOp.root, { recursive: true, force: true }));
  assert.equal(checkGitPolicy(await noOp.facts(({ manifest }) => { manifest.trunkVersion = 2; })).code, "git-policy-plan-version");
});

for (const format of ["sha1", "sha256"] as const) test(`G8 actual Provider ${format} full first-document tree/no-index plan and exact publication CAS`, async t => {
  const fixture = await documentPlanFixture(format); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const facts = await fixture.facts(), result = checkGitPolicy(facts); assert.equal(result.allowed, true, JSON.stringify(result));
  const publish = { ...facts, template: "publish-documents" as const, ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk",
    commands: [...facts.commands!, command("update-ref", "--no-deref", "refs/ans/trunk", facts.candidate!.hex, "0".repeat(format === "sha1" ? 40 : 64))] };
  assert.equal(checkGitPolicy(publish).allowed, true, JSON.stringify(checkGitPolicy(publish)));
  assert.equal(await fs.stat(path.join(fixture.root, ".git/refs/ans/trunk")).then(() => true, () => false), false, "Pure plans/verdicts do not publish");
  assert.equal(facts.ownedIndexId, undefined); assert.equal(facts.base, null);
  const ordinary = { ...facts, businessPublication: undefined, appGeneratedFiles: undefined, businessJournal: undefined, manifestSha256: undefined, journalDigest: undefined };
  assert.equal(checkGitPolicy(ordinary).allowed, false, "Ordinary product candidates cannot acquire rapporteur or metadata scope");
  for (const patch of [{ currentAuthorizationRevision: "stale" }, { actorRoleId: "chief" }, { ref: "refs/heads/main" }, { taskId: undefined },
    { ownedIndexId: "fake-index", currentIndexId: "fake-index" }, { worksite: { kind: "raw-object-plumbing", index: "shared", checkout: "not-used" } },
    { manifestSha256: sha("other") }, { journalDigest: sha("other") }, { businessJournal: { ...facts.businessJournal, operationId: "other" } },
    { businessPublication: { ...facts.businessPublication, actorRoleId: "rapporteur" } }, { appGeneratedFiles: facts.appGeneratedFiles!.slice(1) },
    { commands: [...facts.commands!, command("reset", "--hard")] }, { allDiff: { ...facts.allDiff, entries: facts.allDiff!.entries.slice(1) } },
    { rawObjectPlan: { ...facts.rawObjectPlan, commit: { ...facts.rawObjectPlan!.commit, parents: [oid] } } }])
    assert.equal(checkGitPolicy({ ...facts, ...patch } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
});

test("G8 recomputed malicious metadata/content/modes remain rejected beyond object-hash binding", async t => {
  const fixture = await documentPlanFixture("sha1"); t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  for (const mutate of [
    (files: Map<string, Buffer>) => files.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify({ ...fixture.manifest, activeRoles: {} }))),
    (files: Map<string, Buffer>) => files.set(".ans/trunk/manifest.json", Buffer.from(JSON.stringify({ ...fixture.manifest, actionSource: { ...fixture.manifest.actionSource, operationId: "other" } }))),
    (files: Map<string, Buffer>) => files.set(".ans/authorization.json", Buffer.from("injected authorization")),
    (files: Map<string, Buffer>) => files.set("docs/proposals/unbound-proposal-v1.md", Buffer.from("unbound cross-owner proposal")),
    (files: Map<string, Buffer>) => files.set("docs/proposals/unit-proposal-v1.md", Buffer.from("different planning bytes")),
    (files: Map<string, Buffer>) => {
      const original = JSON.parse([...files].find(([file]) => file.startsWith(".ans/trunk/snapshots/"))![1].toString("utf8"));
      const snapshotId = `s-${sha("unreferenced-snapshot")}`; files.set(`.ans/trunk/snapshots/${snapshotId}.json`, Buffer.from(JSON.stringify({ ...original, snapshotId })));
    },
  ]) {
    const changed = new Map(fixture.contents); mutate(changed); const facts = await fixture.facts(changed);
    const result = checkGitPolicy(facts); assert.equal(result.allowed, false, JSON.stringify(result));
    assert.ok(!["git-policy-raw-object-binding", "git-policy-raw-complete-diff"].includes(result.code!), "Recomputed complete Provider plan must reach semantic metadata checks");
  }
  const facts = await fixture.facts(), raw = facts.rawObjectPlan!;
  const changed = await createGitCandidateStore(fixture.root).plan({ ...raw.input, files: raw.input.files.map(file => ({ ...file, executable: true })) });
  const executable = { ...facts, rawObjectPlan: changed, candidate: changed.commit.candidate, argv: changed.commands[0]!, commands: changed.commands,
    allDiff: { ...facts.allDiff!, candidate: changed.commit.candidate, entries: changed.diff }, appGeneratedFiles: facts.appGeneratedFiles!.map(row => ({ ...row, oid: changed.diff.find(file => file.newPath === row.path)!.newOid! })) };
  assert.equal(checkGitPolicy(executable).code, "git-policy-raw-write-scope");
});
function mutation(roleId = "product", file = "docs/product/a.md"): GitPolicyFacts {
  const cmds = [command("commit-tree", candidate.hex, "-p", oid.hex, "-F", "-"), command("update-ref", "--no-deref", `refs/ans/candidates/${"c".repeat(64)}`, candidate.hex, "0".repeat(40))];
  return { ...base(), actorRoleId: roleId, template: "commit", paths: [file], writePaths: [file], base: oid, candidate,
    ref: `refs/ans/candidates/${"c".repeat(64)}`, ownedCandidateRef: `refs/ans/candidates/${"c".repeat(64)}`,
    ownedWorktreeId: "worksite-1", currentWorktreeId: "worksite-1", ownedIndexId: "index-1", currentIndexId: "index-1",
    argv: cmds[0]!, commands: cmds, allDiff: { complete: true, base: oid, candidate, entries: [{ status: "M", oldPath: file, newPath: file, oldMode: "100644", newMode: "100644", oldOid: oid, newOid: candidate }] } };
}

async function initialPlans(format: "sha1" | "sha256") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g6-init-policy-"));
  const init = await planGitRepositoryInitialization(root, format);
  const plan = planEmptyGitCandidate({ operationId: "real-plan-fixture-operation", message: "First empty candidate 中文", timestamp: "2026-11-05T01:02:03.000Z", objectFormat: format });
  const source = "explicit unit source bytes, not a customer decision";
  const common = { ...base(), repoId: "uninitialized", operationId: plan.input.operationId, actorRoleId: "convener", taskId: "initial-plan-unit-task",
    objectFormat: format, paths: [], writePaths: [], base: null, ref: plan.ref, ownedCandidateRef: plan.ref, worksite: init.worksite,
    initializationBasis: { kind: "uninitialized-root" as const, projectRoot: init.projectRoot, qualificationDigest: init.qualificationDigest,
      operationId: plan.input.operationId, requestDigest: sha(JSON.stringify([init.projectRoot, plan.commit, source])), sourceId: "unit-source-id", sourceSha256: sha(source) } };
  const initFacts: GitPolicyFacts = { ...common, template: "init", candidate: null, approvedInitRoot: init.projectRoot, ownedTemplateDir: init.templateDir,
    allDiff: { complete: true, base: null, candidate: null, entries: [] }, argv: init.argv, commands: [init.argv] };
  const commitFacts: GitPolicyFacts = { ...common, template: "commit", candidate: plan.commit.candidate,
    allDiff: { complete: true, base: null, candidate: plan.commit.candidate, entries: [] }, argv: plan.commands[0]!, commands: plan.commands };
  return { root, initFacts, commitFacts };
}

for (const format of ["sha1", "sha256"] as const) test(`G6 actual Provider ${format} first-init/empty-candidate plans have honest no-repo/no-index policy`, async t => {
  const f = await initialPlans(format); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  for (const facts of [f.initFacts, f.commitFacts]) {
    const result = checkGitPolicy(facts); assert.equal(result.allowed, true, JSON.stringify(result));
    assert.equal(result.inputDigest, computeGitPolicyDigest(facts));
    assert.equal(facts.repoId, "uninitialized"); assert.equal(facts.ownedIndexId, undefined);
  }
  assert.equal(await fs.stat(path.join(f.root, ".git")).then(() => true, () => false), false, "Read-only Provider plans must not initialize or create objects");
  // Plausible source/root digests are bindings, not self-proving authority. O must re-read the real source before effects.
  const changed = { ...f.commitFacts, initializationBasis: { ...f.commitFacts.initializationBasis!, sourceSha256: sha("different actual source bytes") } };
  assert.notEqual(computeGitPolicyDigest(changed), computeGitPolicyDigest(f.commitFacts));
});

test("G6 narrow first-init facts cannot exempt an existing repo, actor, worksite, nonempty diff, root or command", async t => {
  const f = await initialPlans("sha1"); t.after(() => fs.rm(f.root, { recursive: true, force: true }));
  for (const facts of [f.initFacts, f.commitFacts]) {
    const bad: unknown[] = [
      { repoId: "a".repeat(64) }, { repoId: "not-a-repo" }, { actorRoleId: "chief" }, { actorRoleId: "product" }, { taskId: undefined },
      { template: "publish-documents" }, { template: "status" }, { base: oid }, { paths: ["docs/scheduling/a.md"] }, { writePaths: ["docs/scheduling/"] },
      { initializationBasis: undefined }, { initializationBasis: { ...facts.initializationBasis, kind: "existing-root" } },
      { initializationBasis: { ...facts.initializationBasis, projectRoot: "relative/root" } },
      { initializationBasis: { ...facts.initializationBasis, projectRoot: `${f.root}/../other` } },
      { initializationBasis: { ...facts.initializationBasis, operationId: "other-operation" } },
      { initializationBasis: { ...facts.initializationBasis, sourceId: "" } },
      { initializationBasis: { ...facts.initializationBasis, sourceSha256: "short" } },
      { initializationBasis: { ...facts.initializationBasis, requestDigest: undefined } },
      { initializationBasis: { ...facts.initializationBasis, qualificationDigest: "unknown" } },
      { worksite: undefined }, { worksite: { kind: "raw-object-plumbing", index: "shared", checkout: "not-used" } },
      { worksite: { ...facts.worksite, safe: true } }, { ownedIndexId: "fake-not-used", currentIndexId: "fake-not-used" },
      { ownedWorktreeId: "fake-not-used", currentWorktreeId: "fake-not-used" },
      { allDiff: { ...facts.allDiff, complete: false } },
      { allDiff: { ...facts.allDiff, entries: [{ status: "A", newPath: "docs/scheduling/a.md", newMode: "100644", newOid: oid }] } },
      { ref: "refs/heads/main" }, { ref: `refs/ans/candidates/${"b".repeat(64)}`, ownedCandidateRef: `refs/ans/candidates/${"b".repeat(64)}` },
      { approvedInitRoot: `${f.root}-other` }, { ownedTemplateDir: `${f.root}/untrusted-template` },
      { currentAuthorizationRevision: 99 },
    ];
    for (const patch of bad) assert.equal(checkGitPolicy({ ...facts, ...patch as object } as GitPolicyFacts).allowed, false, JSON.stringify(patch));
  }
  const alterCommands = (facts: GitPolicyFacts, commands: readonly (readonly string[])[]) => ({ ...facts, commands, argv: commands[0]! });
  assert.equal(checkGitPolicy(alterCommands(f.initFacts, [command("init", "--", `${f.root}-other`)])).allowed, false);
  const plans = f.commitFacts.commands!;
  for (const commands of [[plans[1]!, plans[0]!, ...plans.slice(2)], [...plans.slice(0, 1), command("commit-tree", oid.hex, "-F", "-"), ...plans.slice(2)],
    [...plans.slice(0, 3), command("update-ref", "--no-deref", f.commitFacts.ref!, f.commitFacts.candidate!.hex, oid.hex)],
    [...plans, command("reset", "--hard")], [command("mktree", "-z"), command("commit-tree", oid.hex, "-p", candidate.hex, "-F", "-"), ...plans.slice(2)]])
    assert.equal(checkGitPolicy(alterCommands(f.commitFacts, commands)).allowed, false);
  assert.equal(checkGitPolicy({ ...mutation(), worksite: f.commitFacts.worksite }).allowed, false, "Raw no-index facts cannot widen normal existing-repo candidate ACL");
});

test("pure ACL all six roles/worker may use an exactly planned readable query; digest binds every field", () => {
  for (const actorRoleId of ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "impl"]) {
    const facts = { ...base(), actorRoleId };
    assert.equal(checkGitPolicy(facts).allowed, true, actorRoleId);
    assert.equal(checkGitPolicy(facts).inputDigest, computeGitPolicyDigest(facts));
  }
  const reversed = Object.fromEntries(Object.entries(base()).reverse()) as unknown as GitPolicyFacts;
  assert.equal(computeGitPolicyDigest(reversed), computeGitPolicyDigest(base()));
  for (const patch of [{ repoId: "b".repeat(64) }, { operationId: "op-2" }, { actorRoleId: "chief" }, { authorizationRevision: 8 }, { runId: "new-run" }])
    assert.notEqual(computeGitPolicyDigest({ ...base(), ...patch }), computeGitPolicyDigest(base()));
});

test("query refuses malicious config/argv, hidden paths, ungranted history, pathspec and stale revision", () => {
  for (const argv of [["-c", "alias.status=!helper", ...base().argv], [...base().argv, "--output=evil"], [...base().argv.slice(0, -1), ":(glob)**"], command("status")])
    assert.equal(checkGitPolicy({ ...base(), argv }).allowed, false);
  for (const patch of [{ currentAuthorizationRevision: 8 }, { readPaths: ["src/"] }, { paths: ["../outside"] }, { paths: [".git/config"] }, { paths: ["a\\b"] }])
    assert.equal(checkGitPolicy({ ...base(), ...patch }).allowed, false);
  const show = { ...base(), template: "show" as const, target: oid, argv: command("cat-file", "blob", `${oid.hex}:docs/product/a.md`) };
  assert.equal(checkGitPolicy(show).code, "git-policy-read-oid");
  assert.equal(checkGitPolicy({ ...show, readableOids: [oid] }).allowed, true);
  assert.equal(checkGitPolicy({ ...show, target: { ...oid, hex: "a123" } }).allowed, false);
});

test("candidate ACL gives each role a valid own-path case and rejects other-role content", () => {
  const cases = { chief: "docs/intents/a.md", product: "docs/product/a.md", rapporteur: "docs/contracts/a.md", nominator: "角色卡/impl/boundary.md", convener: "docs/scheduling/a.md", verifier: "docs/quality/a.md", impl: "src/impl/a.ts" };
  for (const [roleId, file] of Object.entries(cases)) {
    const facts = { ...mutation(roleId, file), d3SelectedRoleIds: ["impl"] };
    assert.equal(checkGitPolicy(facts).allowed, true, `${roleId}:${JSON.stringify(checkGitPolicy(facts))}`);
    const other = mutation(roleId, roleId === "impl" ? "角色卡/impl/boundary.yaml" : "src/unowned.ts");
    assert.equal(checkGitPolicy(other).allowed, false, roleId);
  }
  assert.equal(checkGitPolicy(mutation("nominator", "角色卡/chief/role-card.md")).allowed, false);
  assert.equal(checkGitPolicy(mutation("nominator", "角色卡/impl/boundary.md")).allowed, false);
});

test("complete base→candidate diff checks deletion/rename both sides, mixed staged data, modes and revocation", () => {
  const good = mutation(), entry = good.allDiff!.entries[0]!;
  for (const patch of [{ complete: false }, { base: candidate }, { candidate: oid },
    { entries: [entry, { ...entry, oldPath: "src/hidden.ts", newPath: "src/hidden.ts" }] },
    { entries: [{ ...entry, status: "R" as const, oldPath: "docs/product/a.md", newPath: "src/other.ts" }] },
    { entries: [{ ...entry, status: "D" as const, oldPath: "src/other.ts", newPath: undefined, newOid: null, newMode: undefined }] },
    { entries: [{ ...entry, newMode: "120000" }] }, { entries: [{ ...entry, newMode: "160000" }] }, { entries: [{ ...entry, newMode: "100755" }] } ])
    assert.equal(checkGitPolicy({ ...good, allDiff: { ...good.allDiff!, ...patch } }).allowed, false, JSON.stringify(patch));
  assert.equal(checkGitPolicy({ ...good, currentAuthorizationRevision: 9 }).code, "git-policy-stale-authorization");
  assert.equal(checkGitPolicy({ ...good, currentIndexId: "other" }).code, "git-policy-unowned-worksite");
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main", "refs/ans/trunk", "refs/replace/1"])
    assert.equal(checkGitPolicy({ ...good, ref }).allowed, false);
  assert.equal(checkGitPolicy({ ...good, commands: [command("reset", "--hard")], argv: command("reset", "--hard") }).allowed, false);
  assert.equal(checkGitPolicy(mutation("impl", ".gitattributes")).allowed, false);
});

test("publish roles and convener integration use full owner-bound diffs without granting chief decisions Git power", () => {
  const good = mutation("convener", "src/impl/a.ts");
  const ref = "refs/ans/delivery/demo";
  const commands = [command("update-ref", "--no-deref", ref, candidate.hex, oid.hex)];
  const delivery: GitPolicyFacts = { ...good, template: "publish-delivery", ref, publicationRef: ref, commands, argv: commands[0]!,
    integrationGrants: [{ ownerRoleId: "impl", paths: ["src/impl/"], candidate, evidenceDigest: "e".repeat(64) }] };
  assert.equal(checkGitPolicy(delivery).allowed, true);
  assert.equal(checkGitPolicy({ ...delivery, actorRoleId: "chief" }).allowed, false);
  assert.equal(checkGitPolicy({ ...delivery, integrationGrants: [] }).allowed, false);
  assert.equal(checkGitPolicy({ ...delivery, commands: [command("update-ref", "--no-deref", ref, candidate.hex, candidate.hex)], argv: command("update-ref", "--no-deref", ref, candidate.hex, candidate.hex) }).allowed, false);
});

test("raw Git：只读精确形态 allow/pass（固定传输）；别名/写形态/全局选项仍硬拒", () => {
  const boundary: BoundarySection1 = { entries: [], boundarySource: "<test>", acceptance: { accepted: true, source: "fixture" } };
  // 2026-11-08（W3-G，设计 P1.3 §2.4.3）：只读精确白名单 ⇒ 分类器 allow、写守卫 pass（前台）。
  // 程序名带路径也按 basename 匹配（模型提供的程序名只用于匹配；执行层经固定传输，不按 PATH/cwd 解析）。
  for (const argv of [["git", "status"], ["git", "log", "-5"], ["C:/Program Files/Git/cmd/git.exe", "status"]]) {
    assert.equal(classifyShell(argv, defaultShellRules()), "allow", argv.join(" "));
    const result = evaluateShellWriteTargets({ argv, cwd: process.cwd(), projectRoot: process.cwd(), skillRoot: process.cwd(), boundary, forbiddenPrefixes: [], checkWrite: () => ({ allowed: true }) });
    assert.equal(result.kind, "pass", argv.join(" "));
  }
  for (const argv of [["git", "my-alias"], ["C:/Program Files/Git/cmd/git.exe", "commit", "-m", "x"], ["git", "-c", "core.fsmonitor=helper", "status"]]) {
    assert.equal(classifyShell(argv, defaultShellRules()), "deny");
    const result = evaluateShellWriteTargets({ argv, cwd: process.cwd(), projectRoot: process.cwd(), skillRoot: process.cwd(), boundary, forbiddenPrefixes: [], checkWrite: () => ({ allowed: true }) });
    assert.equal(result.kind, "deny");
    if (result.kind === "deny") { assert.equal(result.code, "shell-write-hard-deny"); assert.match(result.reason, /git_query/); }
  }
});

test("actual write_file/edit_file handlers protect .git, canonical host roots and directory-link aliases", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g4-file-gate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".git")); await fs.writeFile(path.join(root, ".git/config"), "original");
  await fs.mkdir(path.join(root, "metadata")); await fs.writeFile(path.join(root, "metadata/config"), "original");
  const boundary: BoundarySection1 = { entries: [".git", "metadata", "alias"].map(p => ({ root: "project", kind: "directory", path: p, purpose: "test role permits path" })), boundarySource: "<test>", acceptance: { accepted: true, source: "test host" } };
  const ctx = { projectRoot: root, skillRoot: path.join(root, "skill"), protectedGitRoots: [path.join(root, "metadata")] };
  const tools = new Map(buildGovernedTools(target => resolveWrite(target, boundary, undefined, ctx), { writeRoot: root }).map(tool => [tool.name, tool]));
  for (const file of [".git/config", "metadata/config"]) {
    assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: file, content: "attack" } })).ok, false);
    assert.equal((await tools.get("edit_file")!.handler({ name: "edit_file", args: { path: file, oldText: "original", newText: "attack" } })).ok, false);
    assert.equal(await fs.readFile(path.join(root, file), "utf8"), "original");
  }
  await fs.symlink(path.join(root, ".git"), path.join(root, "alias"), "junction");
  assert.equal((await tools.get("write_file")!.handler({ name: "write_file", args: { path: "alias/config", content: "attack" } })).ok, false);
  assert.equal(await fs.readFile(path.join(root, ".git/config"), "utf8"), "original");
});

test("real core handle inventory in an isolated unprotected fixture is per-session, never whole-team proof", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g6-core-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const boundary: BoundarySection1 = { entries: [], boundarySource: "<fixture>", acceptance: { accepted: true, source: "fixture" } };
  const role: ResolvedRole = { id: "chief", kind: "built-in-governance", cardText: "# Chief", boundary, boundarySource: boundary.boundarySource, location: { card: "", boundary: "" } };
  const session = await createRuntimeAdapter({ runtime: "demo", projectRoot: root, skillRoot: root, gate: () => ({ allowed: true, matchedEntry: { root: "project", kind: "file", path: "fixture", purpose: "no writes in inventory test" } }) }).bindRole(role);
  try {
    const surface = session.inspectToolSurface!(), lifecycle = session.inspectLifecycle!();
    assert.equal(surface.sessionId, lifecycle.sessionId); assert.equal(surface.sessionId, session.sessionId);
    assert.equal(surface.source, "core-provider-assembly"); assert.equal(surface.status, "observed");
    assert.equal(surface.appTools.includes("run_shell"), false); assert.equal(surface.appTools.includes("start_background_task"), false);
    assert.deepEqual(surface.configuredForeignMcpServers, []);
    assert.equal(surface.nativeToolRegistry, "unknown"); assert.equal(surface.filesystemConfinement, "unknown");
  } finally { await session.dispose(); }
  assert.equal(session.inspectToolSurface!().status, "unknown");
});
