// G1：公开注册表提示合同，不把提示测试冒充工具/提交/激活链验证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_GOVERNANCE_ROLES, governanceRoleOf } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveBoundary, validateRoleDocumentsSnapshot, refreshAndInstallVersionedDocFreezeSnapshot } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite, resolveWriteReadPreflight, resolveWriteFinal, type FileGateReadContext, type FileGateFinalContext } from "../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import nodeFs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createFsTrunkStore, createGitTrunkStore, createProjectTrunkStore, initializeGitRepository } from "../../src/provider/trunk/public/trunk-store.ts";
import { completeSnapshotDigest, appendDocFreezeRecords as appendProviderFreeze } from "../../src/provider/version-change/public/version-change-store.ts";
import { isValidDocFreezeRecord } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { isValidDocFreezeRecord as modelFreezeValidator, type DocFreezeRecord } from "../../src/model/version-change.ts";
import { invalidateVersionedDocFreezeSnapshot, versionedDocFreezeState, versionedDocOverwriteDecision } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { FROZEN_ROLE_REF_KEYS, TRUNK_MANIFEST_SCHEMA, type CompleteSnapshot, type FrozenRoleEvidence, type TrunkManifest } from "../../src/model/trunk.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const card = (id: string) => governanceRoleOf(id)!.cardText;
const chiefWorkflow = await fs.readFile(new URL("../../src/common/门禁引擎/workflows/chief/chief-workflow.md", import.meta.url), "utf8");
const instructions = (id: string) => id === "chief" ? `${card(id)}\n${chiefWorkflow}` : card(id);

const at = "2026-11-05T00:00:00.000Z";
const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

// These are ordinary data fixtures, not R-issued contexts or evidence that production identity checks are wired.
function pureFileGateFixture() {
  const root = "C:/g15-no-files/project", skillRoot = "C:/g15-no-files/skill", target = `${root}/src/old/a.ts`;
  const boundary: BoundarySection1 = { entries: [{ root: "project", kind: "directory", path: "src/old/", purpose: "implementation" }],
    boundarySource: `${root}/角色卡/worker/boundary.yaml`, acceptance: { accepted: true, source: "unit immutable evidence" },
    frozenEvidence: { roleId: "worker", runId: "run-old", pinDigest: hash("old-pin"), snapshotDigest: hash("old-snapshot") } };
  const scope: TaskScope = { writeSet: ["src/old/a.ts"], conditions: [] };
  const lexical: FileGateReadContext = { stage: "lexical-read", invocationId: "unit-invocation", operationId: "unit-operation", targetPath: target, operation: "write", projectRoot: root, skillRoot };
  const canonical: FileGateReadContext = { ...lexical, stage: "canonical-read", canonicalFacts: { projectRoot: "C:/g15-real/project", skillRoot: "C:/g15-real/skill",
    target: "C:/g15-real/project/src/old/a.ts", protectedRoots: [], coverage: "complete", basisDigest: hash("unit ordinary root inventory"), reasons: [] } };
  const final: FileGateFinalContext = { ...canonical, stage: "final-write", currentFile: { state: "present", sha256: hash("old bytes") }, contentSha256: hash("new bytes") };
  return { root, skillRoot, target, boundary, scope, lexical, canonical, final };
}

test("G15 pure lexical/canonical/final stages authorize only the same accepted frozen scope", () => {
  const f = pureFileGateFixture();
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, f.lexical).allowed, true);
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, f.canonical).allowed, true);
  assert.equal(resolveWriteFinal(f.target, f.boundary, f.scope, f.final).allowed, true);
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, f.final as unknown as FileGateReadContext).allowed, false, "Final data cannot stand in for a read-stage check");
  assert.equal(resolveWriteFinal(f.target, f.boundary, f.scope, f.lexical as unknown as FileGateFinalContext).allowed, false, "Preflight allowed is not permission to write");
  const currentRoleCache = { ...f.boundary, entries: [{ root: "project" as const, kind: "directory" as const, path: "src/new/", purpose: "new trunk" }] };
  assert.equal(currentRoleCache.entries[0]!.path, "src/new/");
  const next = `${f.root}/src/new/a.ts`;
  assert.equal(resolveWriteReadPreflight(next, f.boundary, { writeSet: ["src/new/a.ts"], conditions: [] }, { ...f.lexical, targetPath: next }).allowed, false);
  assert.equal(f.boundary.frozenEvidence?.snapshotDigest, hash("old-snapshot"), "The old pin boundary remains the input; current role data is never substituted");
});

test("G15 managed read stages reject absent role/scope, secrets, traversal and malformed host bindings", () => {
  const f = pureFileGateFixture();
  for (const boundary of [{ ...f.boundary, acceptance: { accepted: false, source: "" } }, { ...f.boundary, parseError: "missing evidence" }, undefined])
    assert.equal(resolveWriteReadPreflight(f.target, boundary as unknown as BoundarySection1, f.scope, f.lexical).allowed, false);
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, undefined, f.lexical).allowed, false, "Managed absence does not mean unmanaged/no-task");
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, { writeSet: [], conditions: [] }, f.lexical).allowed, false);
  for (const patch of [{ invocationId: "" }, { operationId: "" }, { targetPath: `${f.target}-other` }, { operation: "opaque" }, { projectRoot: "relative" }, { stage: "edit-read" }])
    assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, { ...f.lexical, ...patch } as FileGateReadContext).allowed, false, JSON.stringify(patch));
  const broad = { ...f.boundary, entries: [{ root: "project" as const, kind: "directory" as const, path: ".", purpose: "unit broad boundary" }] };
  for (const file of [".env", ".env.local", ".ssh/id_rsa", ".git/config", ".ans/state/permissions.json", "../outside.txt"]) {
    const target = `${f.root}/${file}`;
    assert.equal(resolveWriteReadPreflight(target, broad, { writeSet: [file], conditions: [] }, { ...f.lexical, targetPath: target }).allowed, false, file);
  }
  const conditional = { ...f.boundary, entries: [{ ...f.boundary.entries[0]!, kind: "conditional-directory" as const, condition: "approved-change" }] };
  assert.equal(resolveWriteReadPreflight(f.target, conditional, f.scope, f.lexical).allowed, false);
  assert.equal(resolveWriteReadPreflight(f.target, conditional, { ...f.scope, conditions: ["approved-change"] }, f.lexical).allowed, true);
});

test("G15 canonical/currentFile unknown, root escape, protected aliases and final hash absence fail closed", () => {
  const f = pureFileGateFixture(), original = f.canonical.canonicalFacts!;
  for (const patch of [{ coverage: "unknown" }, { basisDigest: "" }, { reasons: ["incomplete worktree inventory"] }, { projectRoot: "relative" }, { target: "C:/outside/a.ts" },
    { target: "C:/g15-real/project/src/new/a.ts" }, { target: "C:/g15-real/project/.env" }, { protectedRoots: ["C:/g15-real/project/src/"] }, { protectedRoots: ["relative"] }])
    assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, { ...f.canonical, canonicalFacts: { ...original, ...patch } } as FileGateReadContext).allowed, false, JSON.stringify(patch));
  assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, { ...f.canonical, canonicalFacts: undefined }).allowed, false);
  for (const patch of [{ currentFile: undefined }, { currentFile: { state: "unknown", reason: "EACCES" } }, { currentFile: { state: "present", sha256: "" } }, { contentSha256: "" }])
    assert.equal(resolveWriteFinal(f.target, f.boundary, f.scope, { ...f.final, ...patch } as FileGateFinalContext).allowed, false, JSON.stringify(patch));
  assert.equal(resolveWriteFinal(f.target, f.boundary, f.scope, { ...f.final, currentFile: { state: "missing" } }).allowed, true);
});

test("G15 pure read/final predicates never call fs or the legacy live-boundary diagnostics", t => {
  const f = pureFileGateFixture(); let reads = 0;
  for (const key of ["readFileSync", "statSync", "existsSync", "realpathSync"] as const) t.mock.method(nodeFs, key, () => { reads++; throw new Error("Pure gate touched fs"); });
  syncBuiltinESMExports();
  try {
    assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, f.lexical).allowed, true);
    assert.equal(resolveWriteReadPreflight(f.target, f.boundary, f.scope, f.canonical).allowed, true);
    assert.equal(resolveWriteFinal(f.target, f.boundary, f.scope, f.final).allowed, true);
    const legacyLiveLabel = { ...f.boundary, frozenEvidence: undefined };
    const other = `${f.root}/outside.ts`;
    assert.equal(resolveWriteReadPreflight(other, legacyLiveLabel, { writeSet: ["outside.ts"], conditions: [] }, { ...f.lexical, targetPath: other }).allowed, false);
    assert.equal(reads, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
const workerCard = "# Worker\n" + ["组别", "工作立场", "能力描述", "职责与功能导航", "必读资料", "交接输入输出", "执行原则", "质量职责", "标准工作流", "交付物清单"].map(h => `## ${h}\nworker scope\n`).join("");
function roleSnapshot(roleId = "worker", scope = "src/old") {
  const texts = {
    [`角色卡/${roleId}/role-card.md`]: workerCard,
    [`角色卡/${roleId}/boundary.md`]: `# 边界\n## Section 1\n| 类型 | 可操作路径 | 用途 |\n| --- | --- | --- |\n| 目录 | ${scope}/ | 实现 |\n`,
    [`角色卡/${roleId}/boundary.yaml`]: `role: ${roleId}\nentries:\n  - kind: directory\n    path: ${scope}/\n    purpose: 实现\n`,
    "docs/roster.md": "roster frozen bytes",
    "docs/plan.md": "plan frozen bytes",
    "docs/d3.json": "D3 frozen source bytes",
    "docs/activation.json": "activation frozen source bytes",
    "docs/authorization.json": "authorization frozen source bytes",
  };
  const files = Object.entries(texts).map(([rel, text]) => ({ path: rel, sha256: hash(text), bytesBase64: Buffer.from(text).toString("base64") }));
  const snapshot: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId: `snapshot-${roleId}-${scope.replaceAll("/", "-")}`,
    digest: completeSnapshotDigest(files), files, createdAt: at };
  const refPaths = ["docs/roster.md", "docs/plan.md", "docs/d3.json", "docs/activation.json", `角色卡/${roleId}/role-card.md`,
    `角色卡/${roleId}/boundary.md`, `角色卡/${roleId}/boundary.yaml`, "docs/authorization.json"];
  const evidence = { runId: "run-old", pinDigest: hash("pin-old"), roleId,
    snapshotRef: { snapshotId: snapshot.snapshotId, digest: snapshot.digest },
    ...Object.fromEntries(FROZEN_ROLE_REF_KEYS.map((key, i) => [key, { snapshotId: snapshot.snapshotId, path: refPaths[i]!, sha256: files.find(f => f.path === refPaths[i])!.sha256 }])) } as unknown as FrozenRoleEvidence;
  const role = { roleId, cardPath: evidence.cardRef.path, boundaryMdPath: evidence.boundaryMdRef.path,
    boundaryYamlPath: evidence.boundaryYamlRef.path, allowedPaths: [{ path: `${scope}/`, kind: "directory" as const }] };
  return { snapshot, evidence, role };
}

test("G5 Git-selected missing effective ref never falls back to valid FS projection/live role", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g5-missing-git-ref-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = roleSnapshot(), legacy = createFsTrunkStore(root);
  assert.equal((await legacy.prepareSnapshot!(f.snapshot)).ok, true);
  const { runId: _run, pinDigest: _pin, ...activeEvidence } = f.evidence;
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1, source: "bootstrap", previous: null,
    flowId: "demo", runId: null, artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} },
    snapshotRef: f.evidence.snapshotRef, digest: hash("legacy-projection"), activeRevision: 1, activeDigest: hash("active"), activeRoles: { worker: activeEvidence }, createdAt: at, updatedAt: at };
  assert.equal((await legacy.compareAndSwapManifest!(null, manifest, f.evidence.snapshotRef)).ok, true);
  assert.equal((await legacy.readManifest()).ok, true);
  await initializeGitRepository(root); // actual application init provenance; no fake mode/approved record
  const selected = await createProjectTrunkStore(root).readManifest();
  assert.equal(selected.ok, false); if (!selected.ok) assert.equal(selected.reason, "corrupt");
  await fs.mkdir(path.join(root, "角色卡/worker"), { recursive: true });
  await fs.writeFile(path.join(root, f.evidence.cardRef.path), "# live must not become active");
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: { worker: { card: f.evidence.cardRef.path, boundary: f.evidence.boundaryYamlRef.path } } };
  await assert.rejects(resolveRole("worker", project), /effective-trunk-corrupt/);
  assert.equal((await resolveBoundary("worker", project)).acceptance.accepted, false);
});

test("G5 real Git active/old-pin readers ignore raw FS projection and changed live bytes; corrupt journal fails closed", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g5-real-git-reader-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = roleSnapshot(), legacy = createFsTrunkStore(root);
  assert.equal((await legacy.prepareSnapshot!(f.snapshot)).ok, true);
  await initializeGitRepository(root);
  // Lower-layer Git fixture calls the real Provider commit/CAS; it does not impersonate a role publication or customer decision.
  const git = createGitTrunkStore(root), ref = f.evidence.snapshotRef;
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1, source: "bootstrap", previous: null,
    flowId: "demo", runId: null, artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} },
    snapshotRef: ref, digest: hash("git-first"), createdAt: at, updatedAt: at };
  const first = await git.compareAndSwapManifest!(null, manifest, ref); assert.equal(first.ok, true, JSON.stringify(first));
  const { runId: _run, pinDigest: _pin, ...activeEvidence } = f.evidence;
  const active = { revision: 1, digest: hash("active-real-git"), roles: { worker: activeEvidence } };
  const activation = await git.compareAndSwapActiveRoles!({ version: 1, digest: manifest.digest }, { revision: 0, digest: null }, active);
  assert.equal(activation.ok, true, JSON.stringify(activation));
  const newFiles = [{ path: "docs/plan.md", bytesBase64: Buffer.from("new document trunk").toString("base64"), sha256: hash("new document trunk") }];
  const next: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId: "g5-document-next", files: newFiles, digest: completeSnapshotDigest(newFiles), createdAt: at };
  assert.equal((await legacy.prepareSnapshot!(next)).ok, true);
  const nextRef = { snapshotId: next.snapshotId, digest: next.digest };
  const second = await git.compareAndSwapManifest!({ version: 1, digest: manifest.digest }, { ...manifest, trunkVersion: 2, digest: hash("git-second"), snapshotRef: nextRef }, nextRef, { revision: 1, digest: active.digest }, ref);
  assert.equal(second.ok, true, JSON.stringify(second));
  // Sabotage the nonauthoritative projection and remove old staged bytes: immutable Git objects must suffice.
  await fs.writeFile(path.join(root, ".ans/trunk/manifest.json"), "broken raw FS projection");
  await fs.unlink(path.join(root, `.ans/trunk/snapshots/${f.snapshot.snapshotId}.json`));
  await fs.mkdir(path.join(root, "角色卡/worker"), { recursive: true });
  await fs.writeFile(path.join(root, f.evidence.cardRef.path), "# live replacement");
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: {} };
  const activeRole = await resolveRole("worker", project);
  assert.equal(activeRole.cardText, workerCard);
  assert.equal(activeRole.boundary.frozenEvidence?.snapshotDigest, f.snapshot.digest);
  assert.equal((await resolveBoundary("worker", project)).acceptance.accepted, true);
  const pinned: ProjectConfig = { ...project, documentContext: { runId: f.evidence.runId, pinDigest: f.evidence.pinDigest, frozenRoleEvidence: f.evidence } };
  assert.equal((await resolveRole("worker", pinned)).cardText, workerCard);
  assert.equal((await resolveBoundary("worker", pinned)).frozenEvidence?.snapshotDigest, f.snapshot.digest);
  const operations = path.join(root, ".ans/trunk/operations");
  const journals = await fs.readdir(operations, { withFileTypes: true });
  const actual = journals.find(entry => entry.isDirectory()); assert.ok(actual);
  await fs.writeFile(path.join(operations, actual.name, "git.json"), "broken committed journal");
  await assert.rejects(resolveRole("worker", project));
  assert.equal((await resolveBoundary("worker", project)).acceptance.accepted, false);
});

test("G2 pure activation check binds complete bytes and rejects half-set/mismatch/widened/shared ownership", () => {
  const f = roleSnapshot();
  const valid = validateRoleDocumentsSnapshot({ snapshot: f.snapshot, roles: [f.role] });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  if (valid.ok) assert.deepEqual(valid.roleDocumentChecks[0], { roleId: "worker", snapshotDigest: f.snapshot.digest,
    cardSha256: f.evidence.cardRef.sha256, boundaryMdSha256: f.evidence.boundaryMdRef.sha256, boundaryYamlSha256: f.evidence.boundaryYamlRef.sha256, ok: true });
  const missing = { ...f.snapshot, files: f.snapshot.files.filter(file => file.path !== f.evidence.boundaryMdRef.path) };
  missing.digest = completeSnapshotDigest(missing.files);
  assert.equal(validateRoleDocumentsSnapshot({ snapshot: missing, roles: [f.role] }).ok, false);
  assert.equal(validateRoleDocumentsSnapshot({ snapshot: f.snapshot, roles: [{ ...f.role, allowedPaths: [{ path: "src/other/", kind: "directory" }] }] }).ok, false);
  assert.equal(validateRoleDocumentsSnapshot({ snapshot: f.snapshot, roles: [f.role, { ...f.role, roleId: "another" }] }).ok, false);
  for (const target of [f.evidence.cardRef.path, f.evidence.boundaryMdRef.path, f.evidence.boundaryYamlRef.path]) {
    const files = f.snapshot.files.map(file => file.path === target ? { ...file, bytesBase64: Buffer.from("bad data").toString("base64"), sha256: hash("bad data") } : file);
    const changed = { ...f.snapshot, files, digest: completeSnapshotDigest(files) };
    assert.equal(validateRoleDocumentsSnapshot({ snapshot: changed, roles: [f.role] }).ok, false, target);
  }
});

test("G2 real Provider-backed new old-run session re-resolves frozen bytes after live change and deletion", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g2-old-run-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = roleSnapshot(), store = createFsTrunkStore(root);
  const prepared = await store.prepareSnapshot!(f.snapshot); assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: { worker: { card: f.evidence.cardRef.path, boundary: f.evidence.boundaryYamlRef.path } },
    documentContext: { runId: f.evidence.runId, pinDigest: f.evidence.pinDigest, frozenRoleEvidence: f.evidence } };
  const before = await resolveRole("worker", project);
  await fs.mkdir(path.join(root, "角色卡/worker"), { recursive: true });
  await fs.writeFile(path.join(root, f.evidence.cardRef.path), "new live card with broader permissions");
  await fs.writeFile(path.join(root, f.evidence.boundaryYamlRef.path), "role: worker\nentries:\n - kind: directory\n   path: src/\n   purpose: live\n");
  const newSessionRole = await resolveRole("worker", structuredClone(project));
  assert.notEqual(newSessionRole, before);
  assert.equal(newSessionRole.cardText, workerCard);
  assert.deepEqual(newSessionRole.boundary.entries, before.boundary.entries);
  const boundary = await resolveBoundary("worker", structuredClone(project));
  await fs.mkdir(path.join(root, "src/old"), { recursive: true });
  assert.equal(resolveWrite(path.join(root, "src/old/output.ts"), boundary, undefined, { projectRoot: root, skillRoot: path.join(root, "skill") }).allowed, true);
  assert.equal(resolveWrite(path.join(root, "src/new.ts"), boundary, undefined, { projectRoot: root, skillRoot: path.join(root, "skill") }).allowed, false);
  await fs.unlink(path.join(root, f.evidence.cardRef.path));
  assert.equal((await resolveRole("worker", structuredClone(project))).cardText, workerCard);
});

test("G2 run requires matching full evidence; corrupt or missing snapshot cannot fall back to live", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g2-bad-run-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = roleSnapshot();
  const prepared = await createFsTrunkStore(root).prepareSnapshot!(f.snapshot); assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: {}, documentContext: { runId: f.evidence.runId, pinDigest: f.evidence.pinDigest, frozenRoleEvidence: f.evidence } };
  for (const context of [ { runId: "run-old" }, { ...project.documentContext, pinDigest: hash("stale") },
    { ...project.documentContext, frozenRoleEvidence: { ...f.evidence, roleId: "other" } },
    { ...project.documentContext, frozenRoleEvidence: { ...f.evidence, authorizationRef: undefined } },
    { ...project.documentContext, frozenRoleEvidence: { ...f.evidence, cardRef: { ...f.evidence.cardRef, sha256: hash("wrong") } } } ]) {
    const invalid = { ...project, documentContext: context } as ProjectConfig;
    await assert.rejects(resolveRole("worker", invalid));
    assert.equal((await resolveBoundary("worker", invalid)).acceptance.accepted, false);
  }
  const missing = structuredClone(project);
  missing.documentContext!.frozenRoleEvidence!.snapshotRef.snapshotId = "missing";
  for (const key of FROZEN_ROLE_REF_KEYS) missing.documentContext!.frozenRoleEvidence![key].snapshotId = "missing";
  await assert.rejects(resolveRole("worker", missing));
});

test("G3 no-run uses independent active pointer after doc-only update; old-run pin remains unchanged", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g2-trunk-role-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = roleSnapshot(), store = createFsTrunkStore(root);
  const prepared = await store.prepareSnapshot!(f.snapshot); assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, trunkVersion: 1, source: "bootstrap", previous: null,
    flowId: "demo", runId: null, artifacts: { documents: {}, execution: { teamPlan: null, flow: null },
      workflow: { kind: "workflow", path: "docs/plan.md", sha256: f.snapshot.files.find(file => file.path === "docs/plan.md")!.sha256 }, boundaries: {} },
    snapshotRef: f.evidence.snapshotRef, digest: hash("manifest"), createdAt: at, updatedAt: at };
  assert.equal((await store.compareAndSwapManifest!(null, manifest, f.evidence.snapshotRef)).ok, true); // planning-only is publishable
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, governanceModel: "trio", roles: {} };
  await assert.rejects(resolveRole("worker", project)); // execution needs activation evidence
  assert.match((await resolveRole("chief", project)).cardText, /唯一客户入口/);
  const { runId: _runId, pinDigest: _pinDigest, ...activeEvidence } = f.evidence;
  const active = { revision: 1, digest: hash("active-revision-1"), roles: { worker: activeEvidence } };
  assert.equal((await store.compareAndSwapActiveRoles!({ version: 1, digest: manifest.digest }, { revision: 0, digest: null }, active)).ok, true);
  const activeBefore = await resolveRole("worker", project);
  assert.equal(activeBefore.cardText, workerCard);
  assert.ok(activeBefore.boundary.frozenEvidence && "activeRevision" in activeBefore.boundary.frozenEvidence);
  assert.equal("runId" in activeBefore.boundary.frozenEvidence!, false);
  assert.equal("pinDigest" in activeBefore.boundary.frozenEvidence!, false);
  const nextBytes = "# New planning document only\n";
  const files = [{ path: "docs/plan.md", sha256: hash(nextBytes), bytesBase64: Buffer.from(nextBytes).toString("base64") }];
  const docSnapshot: CompleteSnapshot = { schema: "complete-snapshot/v1", snapshotId: "new-document-only", createdAt: at, files, digest: completeSnapshotDigest(files) };
  assert.equal((await store.prepareSnapshot!(docSnapshot)).ok, true);
  const docRef = { snapshotId: docSnapshot.snapshotId, digest: docSnapshot.digest };
  const docOnly = { ...manifest, trunkVersion: 2, digest: hash("manifest2"), snapshotRef: docRef,
    artifacts: { ...manifest.artifacts, workflow: { kind: "workflow" as const, path: "docs/plan.md", sha256: hash(nextBytes) } } };
  assert.equal((await store.compareAndSwapManifest!({ version: 1, digest: manifest.digest }, docOnly, docRef, { revision: 1, digest: active.digest })).ok, true);
  const after = await resolveRole("worker", structuredClone(project));
  assert.deepEqual(after.boundary, activeBefore.boundary);
  assert.equal(after.cardText, workerCard);
  const oldRun: ProjectConfig = { ...project, documentContext: { runId: f.evidence.runId, pinDigest: f.evidence.pinDigest, frozenRoleEvidence: f.evidence } };
  const frozen = await resolveRole("worker", oldRun);
  assert.equal(frozen.cardText, workerCard);
  assert.equal(frozen.boundary.frozenEvidence && "pinDigest" in frozen.boundary.frozenEvidence && frozen.boundary.frozenEvidence.pinDigest, f.evidence.pinDigest);
  const missing = { revision: 2, digest: hash("active-empty"), roles: {} };
  assert.equal((await store.compareAndSwapActiveRoles!({ version: 2, digest: docOnly.digest }, { revision: 1, digest: active.digest }, missing)).ok, true);
  await assert.rejects(resolveRole("worker", structuredClone(project)), /active-role-evidence/);
  assert.equal((await resolveBoundary("worker", project)).acceptance.accepted, false);
  assert.equal((await resolveRole("worker", oldRun)).cardText, workerCard);
});

test("G3 awaited Service refresh installs real Provider confirmation freeze and fails closed on damaged evidence", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g3-service-freeze-"));
  t.after(async () => { invalidateVersionedDocFreezeSnapshot(root); await fs.rm(root, { recursive: true, force: true }); });
  const rel = "docs/product/focus-intent-v1.md";
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.writeFile(path.join(root, rel), "version: 1\n# Actual intent bytes\n");
  invalidateVersionedDocFreezeSnapshot(root);
  const persisted = await appendProviderFreeze([{ projectRoot: root, relPath: rel,
    freeze: { schema: "doc-freeze/v1", reason: "intent-confirmed", origin: "customer", decidedBy: "customer", decisionId: "unit-confirmation-request", applicationId: "intent-unit-confirmation-request", frozenAt: at } }]);
  assert.equal(persisted.ok, true, JSON.stringify(persisted));
  assert.equal(versionedDocFreezeState(root, rel, true), "unknown", "Provider must not upcall G to install its cache");
  const installed = await refreshAndInstallVersionedDocFreezeSnapshot(root, { migrationCompleted: true });
  assert.equal(installed.state, "ready");
  assert.equal(versionedDocFreezeState(root, rel, true), "frozen");
  assert.equal(versionedDocOverwriteDecision({ relPath: rel, exists: true, operation: "edit", frozen: versionedDocFreezeState(root, rel, true) }).allowed, false);
  await fs.writeFile(path.join(root, ".ans/state/versions.jsonl"), "broken evidence\n");
  assert.equal((await refreshAndInstallVersionedDocFreezeSnapshot(root, { migrationCompleted: true })).state, "corrupt");
  assert.equal(versionedDocFreezeState(root, rel, true), "unknown");
  assert.equal(versionedDocOverwriteDecision({ relPath: rel, exists: true, operation: "edit", frozen: versionedDocFreezeState(root, rel, true) }).allowed, false);
});

test("G3 judge-delegated intent freeze is accepted by the gate's own versions.jsonl consumer (single Model validator)", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "g3-judge-freeze-"));
  t.after(async () => { invalidateVersionedDocFreezeSnapshot(root); await fs.rm(root, { recursive: true, force: true }); });
  const rel = "docs/product/judge-intent-v1.md";
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.writeFile(path.join(root, rel), "version: 1\n# Judge-delegated intent bytes\n");
  invalidateVersionedDocFreezeSnapshot(root);
  const freeze: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "intent-unit-judge-request", reason: "intent-confirmed", origin: "judge-delegated", frozenAt: at,
    source: { kind: "judge-delegated", requestId: "unit-judge-request", engine: "claude", model: "claude-unit", operatorId: "judge:claude", reasonCode: "sufficient",
      reason: "checked the intent evidence", selected: ["confirm"], cardKind: "intent-confirm", at } };
  const persisted = await appendProviderFreeze([{ projectRoot: root, relPath: rel, freeze }]);
  assert.equal(persisted.ok, true, JSON.stringify(persisted));
  const installed = await refreshAndInstallVersionedDocFreezeSnapshot(root, { migrationCompleted: true });
  assert.equal(installed.state, "ready");
  assert.equal(versionedDocFreezeState(root, rel, true), "frozen");
  assert.equal(versionedDocOverwriteDecision({ relPath: rel, exists: true, operation: "edit", frozen: versionedDocFreezeState(root, rel, true) }).allowed, false);
});

test("G2 freeze source validates real direct/delegated kinds and rejects fabricated customer approvals", () => {
  assert.equal(isValidDocFreezeRecord, modelFreezeValidator, "G consumes the exact Model invariant without its own duplicate implementation");
  const direct = { schema: "doc-freeze/v1", applicationId: "vc-1", reason: "role-direct-applied", origin: "role-direct", actorRoleId: "product", frozenAt: at,
    snapshotRef: { snapshotId: "s1", digest: hash("s") }, source: { kind: "role-direct", actorRoleId: "product", action: "version-upgrade", operationId: "op-1", applicationId: "vc-1", baseDigest: null, targetDigest: hash("target"), at } };
  assert.equal(isValidDocFreezeRecord(direct), true);
  for (const patch of [{ decisionId: "fake" }, { decidedBy: "customer" }, { actorRoleId: "rapporteur" }, { source: undefined }, { origin: "customer" }, { snapshotRef: undefined }])
    assert.equal(isValidDocFreezeRecord({ ...direct, ...patch }), false);
  const delegated = { schema: "doc-freeze/v1", applicationId: "real-business-request", reason: "proposal-confirmed", origin: "chief-delegated", actorRoleId: "chief", frozenAt: at,
    source: { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "rapporteur", requestId: "request-1", baseDigest: hash("base"), delegationRevision: 2,
      disposition: "select", selected: ["accept"], reason: "evidence checked", at } };
  assert.equal(isValidDocFreezeRecord(delegated), true);
  assert.equal(isValidDocFreezeRecord({ ...delegated, decisionId: "fake-customer" }), false);
  assert.equal(isValidDocFreezeRecord({ ...delegated, source: { ...delegated.source, disposition: "revise", selected: undefined } }), false);
  assert.equal(isValidDocFreezeRecord({ schema: "doc-freeze/v1", applicationId: "legacy", reason: "proposal-confirmed", origin: "customer", decisionId: "real-old", decidedBy: "customer", frozenAt: at }), true);
  // 2026-11-09 judge-delegated（W-J3 / 方案 J11 / AC-J9）：门禁经同一 Model 不变量接受诚实 judge 冻结记录。
  const judged = { schema: "doc-freeze/v1", applicationId: "intent-unit-judge-request", reason: "intent-confirmed", origin: "judge-delegated", frozenAt: at,
    source: { kind: "judge-delegated", requestId: "unit-judge-request", engine: "claude", model: "claude-unit", operatorId: "judge:claude", reasonCode: "sufficient",
      reason: "checked the intent evidence", selected: ["confirm"], cardKind: "intent-confirm", at } };
  assert.equal(isValidDocFreezeRecord(judged), true);
  assert.equal(modelFreezeValidator(judged), true, "judge record acceptance is the exact Model branch, not a gate-local copy");
  for (const patch of [{ decidedBy: "customer" }, { decisionId: "decision-unit-judge-request" }, { actorRoleId: "chief" }, { applicationId: "intent-other" },
    { applicationId: "proposal-unit-judge-request" }, { frozenAt: "2026-11-05T00:00:01.000Z" }, { reason: "vca-approved" }, { source: null },
    { source: { ...judged.source, engine: "" } }, { source: { ...judged.source, operatorId: "judge:codex" } }, { source: { ...judged.source, kind: "chief-delegated" } },
    { source: { ...judged.source, cardKind: "proposal" } }])
    assert.equal(isValidDocFreezeRecord({ ...judged, ...patch }), false, JSON.stringify(patch));
});

test("六角色明确未注入能力不得虚构或恢复取消卡", () => {
  assert.deepEqual(BUILT_IN_GOVERNANCE_ROLES.map(r => r.id), ["chief", "product", "rapporteur", "nominator", "convener", "verifier"]);
  for (const role of BUILT_IN_GOVERNANCE_ROLES) {
    assert.match(role.cardText, /实际注入.*实现中\/待注入/s);
    assert.match(role.cardText, /不得虚构工具.*appointment-write.*团队计划确认卡/s);
    assert.match(role.cardText, /不改 ANS 技能及其治理闸门/);
  }
});

test("产品/策划整单直接提交，来源和旧run冻结约束可见", () => {
  for (const [id, kind] of [["product", "version-upgrade"], ["rapporteur", "detail-amendment"]]) {
    assert.ok(card(id).includes(`submit_version_change(kind=${kind})`));
    assert.match(card(id), /整单.*直接/s);
    assert.match(card(id), /role-direct.*chief-delegated.*不得.*伪造/s);
    assert.match(card(id), /校验失败整单拒绝、no-op 不升版、提交后失败报已提交待恢复/);
    assert.match(card(id), /旧 run.*同一 pin.*缺物证即阻塞.*不从 live/s);
    assert.doesNotMatch(card(id), /request_choice\W+cardKind=proposal/);
  }
});

test("策划独占三模式，旧pin与停稳失败不能绕过", () => {
  const text = card("rapporteur");
  assert.match(text, /仅由策划.*runId\/pinDigest.*operationId/s);
  assert.match(text, /continue-frozen（仅登记、旧 pin 不变）/);
  assert.match(text, /stop-and-restart（先停稳旧链.*冻结完整新依据/s);
  assert.match(text, /stop（停止旧链，不自动回滚文档 trunk）/);
  assert.match(text, /过期 pin\/目标摘要拒绝，停稳不明不得新派/);
});

test("人事保留真实D3，三文档整体激活，不再逐次写卡审批", () => {
  const text = card("nominator");
  assert.match(text, /request_choice\(cardKind=appointment/);
  assert.match(text, /D3 未答可等待.*团队计划不能冒充 D3/s);
  assert.match(text, /role-card\.md.*boundary\.md.*boundary\.yaml/s);
  assert.match(text, /md\/yaml 同步.*唯一属主.*授权/s);
  assert.match(text, /名单版本\/hash 漂移、未选中、无 D3 均拒绝/);
  assert.match(text, /真实激活回执与 activationDigest.*任一失败保留旧有效卡/s);
  assert.doesNotMatch(text, /request_confirmation\(cardKind=appointment-write/);
  assert.match(text, /不扩大任意 stable 写权/);
});

test("运营直接完成计划与主动环境卡，真实恢复条件先行", () => {
  const text = card("convener");
  assert.match(text, /convener\/schedule.*模块属主、写区、分工、依赖.*直接完成/s);
  assert.match(text, /完成计划不等于 D3，不授权名单外角色/);
  assert.match(text, /环境阻塞可主动发.*request_choice\(cardKind=decision\)/);
  assert.match(text, /task\/run\/依据摘要、错误证据、已尝试动作.*方案前置\/代价\/推荐/s);
  assert.match(text, /无新事实不重弹.*卡取消不等于任务取消.*过期选择不直接恢复/s);
  assert.match(text, /核实际阻塞解除后.*条件仍错保持 blocked.*故障\/重派预算/s);
});

test("chief/convener收口必须为原创建者，报告不等于关闭", () => {
  for (const id of ["chief", "convener"]) {
    if (id === "chief") {
      assert.match(instructions(id), /仅真实 task\.created\.from.*当前报告\/依据\/合法状态/s);
      assert.match(instructions(id), /submit_report 只是报告，不是 closed/);
      assert.match(instructions(id), /不手写 closed 或 delivered/);
      continue;
    }
    assert.match(card(id), /可信身份等于 task\.created\.from.*run\/依据\/报告和合法状态/s);
    assert.match(card(id), /submit_report 只是报告，不是 closed.*未合法收口不得释放依赖/s);
    assert.match(card(id), /不固定冒充 chief、不收口他人任务/);
  }
});

test("真实chief委托能选非推荐项/拒绝/退修，且受revision单次结算约束", () => {
  const text = instructions("chief");
  assert.match(text, /关闭时客户本人决定.*开启时只由真实 chief.*证据与合法选项/s);
  assert.match(text, /可选非推荐项、拒绝或要求修订/);
  assert.match(text, /卡无修订选项时反馈退修并保留未决/);
  assert.match(text, /delegationRevision.*单次结算.*关闭撤销未提交代选.*不复用旧 revision/s);
  assert.match(text, /chief 忙\/失败\/缺证据.*恢复入口.*不默认批准、不无限自派/s);
  assert.match(text, /不替代独立质检.*shell\/下载\/stable 专门执行审批/s);
  assert.match(card("verifier"), /独立质检结论及物证必须由你真实核对/);
});

test("提示变化不扩充工具布尔位、写区或派发权", () => {
  const expected = {
    chief: [true, true, true, true, false, false],
    product: [false, false, false, false, false, false],
    rapporteur: [true, false, false, false, false, false],
    nominator: [true, false, false, false, true, true],
    convener: [true, true, false, false, false, false],
    verifier: [true, false, false, false, false, false],
  };
  for (const role of BUILT_IN_GOVERNANCE_ROLES) {
    const c = role.capabilities;
    assert.deepEqual([c.customerInput, c.dispatchTask, c.roleStatus, c.sessionTail, c.installSkill, c.installMcp], expected[role.id]);
    assert.equal(c.shell, "operator-approve");
    assert.ok(role.forbiddenWritePaths.includes(".ans/"));
  }
  assert.deepEqual(governanceRoleOf("product")!.entries.map(e => e.path), ["docs/product/"]);
  assert.deepEqual(governanceRoleOf("convener")!.entries.map(e => e.path), ["docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"]);
  assert.ok(governanceRoleOf("nominator")!.forbiddenWritePaths.includes("角色卡/chief/"));
});

test("Chief枢纽在六卡区分普通准备和动作授权，历史创建者保持真实", () => {
  for (const role of BUILT_IN_GOVERNANCE_ROLES) {
    if (role.id === "chief") {
      assert.match(chiefWorkflow, /新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告/);
      assert.match(chiefWorkflow, /M0、前序 close、plan\/D3 不是通用派发票/);
      assert.match(chiefWorkflow, /不重写旧 creator、parent、review 或 accepted/);
      continue;
    }
    assert.match(role.cardText, /新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告/);
    assert.match(role.cardText, /只读准备、并行、跳过、返工、改类或停止/);
    assert.match(role.cardText, /不以 M0、前序 close、plan\/D3 为通用派发票/);
    assert.match(role.cardText, /具体 write\/activate\/publish\/execute.*冻结8refs.*stopfacts/s);
    assert.match(role.cardText, /历史任务仍按真实 task\.created\.from.*不重写旧 creator/s);
  }
  const chief = governanceRoleOf("chief")!, convener = governanceRoleOf("convener")!, verifier = governanceRoleOf("verifier")!;
  assert.match(chiefWorkflow, /accepted review.*显式续接原仍 live.*不先关闭 controller/s);
  assert.match(chiefWorkflow, /返工，不要求先 accepted 失败质量/);
  assert.match(convener.cardText, /仅派项目实现 worker.*不创建新的 Verifier/s);
  assert.match(verifier.cardText, /缺证或失败正式 blocked\/failed 回 Chief，不静默等待/);
  assert.match(chief.matrix!.dispatchScope!, /Product\/Rapporteur\/Nominator\/Convener\/Verifier/);
  assert.match(convener.matrix!.dispatchScope!, /仅限.*worker.*不得创建Verifier/);
  for (const role of [chief, convener, verifier]) {
    assert.doesNotMatch(JSON.stringify(role.matrix), /按序派发|worker与质检|worker 与质检|由运营发起或幕僚调度/);
  }
});

test("Chief资源正文独立且卡只声明真实注入来源，两套workflow分开", () => {
  assert.ok(chiefWorkflow.startsWith("# Chief 工作流\n\n资源版本：chief-workflow/v1\n"));
  assert.match(card("chief"), /chief-workflow\.md.*全文、资源path、内容SHA256、资源版本和实际应用版本/);
  assert.match(card("chief"), /未提供全文.*明确阻塞/);
  assert.match(card("chief"), /docs\/workflow\.md.*Convener.*run\.workflowRef冻结字节/s);
  assert.doesNotMatch(card("chief"), /质检通过且你真实 accepted review|## 接需求|四类闭环：/);
  assert.match(chiefWorkflow, /同一轮并行派发，不限制为一次 dispatch/);
  assert.match(chiefWorkflow, /不从项目同名文件.*猜测正文/);
});
