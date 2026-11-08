// test/编排/git-operation-sidecar-tolerance.test.ts
// W3b / I0-11（2026-11-08）：write-ahead sidecar-only 操作目录的 journal 扫描容忍与 fail-closed 边界。
//
// 覆盖：
//  - 仅含安全 `authorization.jsonl`（无 git.json/init.json/stable-source.json）的 64-hex 操作目录被
//    `listGitOperationJournals` 识别为合法 write-ahead 状态；上层有效快照（readManifest）可读；
//  - sidecar + 未知额外文件 ⇒ fail-closed（`authorization-sidecar-directory-unknown`）；
//  - 不安全 sidecar（非普通文件/硬链接 nlink≠1/超过 64 KiB）⇒ fail-closed（`authorization-sidecar-file-unsafe`）；
//  - 正常 journal + sidecar 共存不受影响（journal 仍为权威，sidecar 不改变 replay/settlement）。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";

import { initializeGitRepository, migrateLegacyTrunkToGit, createFsTrunkStore, createProjectTrunkStore, beginGitHostAction, endGitHostAction, appendGitActionAuthorization, readGitActionAuthorizations, GIT_ACTION_AUTHORIZATION_MAX_FILE_BYTES, type GitActionAuthorizationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import { listGitOperationJournals } from "../../src/provider/trunk/impl/git-command.ts";
import type { TrunkManifest } from "../../src/model/trunk.ts";
import { TRUNK_MANIFEST_SCHEMA } from "../../src/model/trunk.ts";
import { createTrunkProject } from "./fixtures/trunk-project.ts";

const at = "2026-11-08T00:00:00.000Z";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const operationsDir = (root: string) => path.join(root, ".ans/trunk/operations");
const sidecarPath = (root: string, operationId: string) => path.join(operationsDir(root), sha256(operationId), "authorization.jsonl");

/** 真实 Git-backed trunk（无会话）：bootstrap manifest v1 + 迁移记录（唯一既有 journal）。 */
async function gitTrunkRoot() {
  const project = await createTrunkProject({ withRun: false }), root = project.root, documents = project.snapshot().documents;
  const fsStore = createFsTrunkStore(root);
  const snapshot = await fsStore.captureSnapshot!({ snapshotId: "tol-basis", createdAt: at, files: Object.values(documents) });
  if (!snapshot.ok) throw new Error(`fixture snapshot: ${snapshot.reason}`);
  const initial: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", trunkVersion: 1, previous: null, runId: null, flowId: "demo",
    digest: sha256("tol-basis"), snapshotRef: snapshot.value, createdAt: at, updatedAt: at,
    artifacts: { documents, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await fsStore.compareAndSwapManifest!(null, initial, snapshot.value)).ok);
  await initializeGitRepository(root);
  const migrated = await migrateLegacyTrunkToGit(root, { operationId: "tol-migration", expected: { version: 1, digest: initial.digest } });
  assert.ok(migrated.ok, JSON.stringify(migrated));
  return { root };
}

function authorization(root: string, leaseId: string, operationId: string): GitActionAuthorizationRecord {
  return { source: "git-action-authorization", version: 1, operationId, template: "commit", actorRoleId: "product",
    coreSessionId: "core-session", taskId: "task", runId: "run", turnId: "turn", activeTool: "git_candidate",
    projectRoot: root, rootsDigest: sha256("roots"), registryRevision: 1, inventoryRevision: "inventory-1", leaseId,
    policyInputDigests: { candidate: sha256("candidate") }, optionalEvidence: {} };
}

async function appendSidecar(root: string, operationId: string) {
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!lease.ok) throw new Error(lease.code);
  try { await appendGitActionAuthorization(root, authorization(root, lease.leaseId, operationId)); }
  finally { endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }); }
}

test("I0-11: a safe sidecar-only operation directory is tolerated by the journal scanner and effective-manifest reads", async () => {
  const { root } = await gitTrunkRoot();
  const before = await listGitOperationJournals(root);
  assert.equal(before.length, 1, "迁移 journal 是唯一既有操作记录");
  await appendSidecar(root, "tol-sidecar-only");
  // 该目录此刻只有 authorization.jsonl（write-ahead：journal 尚未写入）。
  assert.deepEqual(await fs.readdir(path.join(operationsDir(root), sha256("tol-sidecar-only"))), ["authorization.jsonl"]);
  const journals = await listGitOperationJournals(root);
  assert.equal(journals.length, 1, "sidecar-only 目录不产生 journal、也不再被当作损坏 journal");
  const manifest = await createProjectTrunkStore(root).readManifest();
  assert.equal(manifest.ok, true, manifest.ok ? "" : JSON.stringify(manifest));
  const read = await readGitActionAuthorizations(root, "tol-sidecar-only");
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.equal(read.records.length, 1, "sidecar 内容校验仍由 readGitActionAuthorizations 负责");
});

test("I0-11: sidecar plus an unknown extra file stays fail-closed", async () => {
  const { root } = await gitTrunkRoot();
  const dir = path.join(operationsDir(root), sha256("tol-unknown-layout"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "authorization.jsonl"), "not-json\n");
  await fs.writeFile(path.join(dir, "extra.json"), "{}\n");
  await assert.rejects(listGitOperationJournals(root), /authorization-sidecar-directory-unknown/);
  assert.equal((await createProjectTrunkStore(root).readManifest()).ok, false, "未知布局使有效快照读取 fail-closed");
});

test("I0-11: unsafe sidecars (hardlink nlink≠1, oversized file, non-regular file) stay fail-closed", async () => {
  // 硬链接（nlink=2）——目录内仍只有 authorization.jsonl。
  const hardlinked = await gitTrunkRoot();
  await appendSidecar(hardlinked.root, "tol-hardlink");
  await fs.link(sidecarPath(hardlinked.root, "tol-hardlink"), path.join(hardlinked.root, "sidecar-alias"));
  await assert.rejects(listGitOperationJournals(hardlinked.root), /authorization-sidecar-file-unsafe/);
  assert.equal((await createProjectTrunkStore(hardlinked.root).readManifest()).ok, false);
  // 超过 64 KiB 的普通文件。
  const oversized = await gitTrunkRoot();
  const oversizedFile = sidecarPath(oversized.root, "tol-oversized");
  await fs.mkdir(path.dirname(oversizedFile), { recursive: true });
  await fs.writeFile(oversizedFile, "a".repeat(GIT_ACTION_AUTHORIZATION_MAX_FILE_BYTES + 1));
  await assert.rejects(listGitOperationJournals(oversized.root), /authorization-sidecar-file-unsafe/);
  // 非普通文件（junction 目录占位；Windows 上 file symlink 需特权，非普通文件路径与 symlink 共用 isFile/isSymbolicLink 拒绝）。
  const junctioned = await gitTrunkRoot();
  const outside = await fs.mkdtemp(path.join(path.dirname(junctioned.root), "ans-tol-outside-"));
  await fs.mkdir(path.dirname(sidecarPath(junctioned.root, "tol-junction")), { recursive: true });
  await fs.symlink(outside, sidecarPath(junctioned.root, "tol-junction"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(listGitOperationJournals(junctioned.root), /authorization-sidecar-file-unsafe/);
});

test("I0-11: a normal journal with a sidecar is unaffected (journal remains authoritative)", async () => {
  const { root } = await gitTrunkRoot();
  const before = await listGitOperationJournals(root);
  assert.equal(before.length, 1);
  // 给既有迁移 journal 追加 sidecar 行（真实 lease；sidecar 不进入 journal 身份/重放）。
  await appendSidecar(root, "tol-migration");
  const after = await listGitOperationJournals(root);
  assert.deepEqual(after, before, "sidecar 不改变 journal 记录（replay/settlement 身份不变）");
  assert.equal(await fs.readFile(path.join(operationsDir(root), sha256("tol-migration"), "git.json"), "utf8").then(text => JSON.parse(text).operationId), "tol-migration");
  const manifest = await createProjectTrunkStore(root).readManifest();
  assert.equal(manifest.ok, true);
  const read = await readGitActionAuthorizations(root, "tol-migration");
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.equal(read.records.length, 1);
});

/** 真实 stable-write source 文件（scanner 只校验 schema/kind/operationId/digest）。 */
async function writeStableSource(root: string, operationId: string): Promise<string> {
  const dir = path.join(operationsDir(root), sha256(operationId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "stable-source.json"), JSON.stringify({ schema: "stable-initial-workflow-source/v1", kind: "stable-initial-workflow", operationId }));
  return dir;
}

test("I0-12: stable-source plus only a safe authorization.jsonl is tolerated; unknown extra files and unsafe sidecars stay fail-closed", async () => {
  // 容忍：stable-source + 安全 authorization.jsonl（无 git.json）→ journal 扫描/有效快照读取正常。
  const tolerated = await gitTrunkRoot();
  await writeStableSource(tolerated.root, "tol-stable-source");
  assert.equal((await createProjectTrunkStore(tolerated.root).readManifest()).ok, true, "无 sidecar 时既有 stable-source 分支不变");
  await appendSidecar(tolerated.root, "tol-stable-source");
  assert.deepEqual((await fs.readdir(path.join(operationsDir(tolerated.root), sha256("tol-stable-source")))).sort(), ["authorization.jsonl", "stable-source.json"]);
  const journals = await listGitOperationJournals(tolerated.root);
  assert.equal(journals.length, 1, "stable-source+sidecar 的 write-ahead 目录不产生 journal、也不再被当作未知布局");
  const manifest = await createProjectTrunkStore(tolerated.root).readManifest();
  assert.equal(manifest.ok, true, manifest.ok ? "" : JSON.stringify(manifest));
  // 未知额外文件：仍 fail-closed。
  const unknown = await gitTrunkRoot();
  const unknownDir = await writeStableSource(unknown.root, "tol-stable-unknown");
  await fs.writeFile(path.join(unknownDir, "authorization.jsonl"), "not-json\n");
  await fs.writeFile(path.join(unknownDir, "extra.json"), "{}\n");
  await assert.rejects(listGitOperationJournals(unknown.root), /stable-work-source-directory-unknown/);
  assert.equal((await createProjectTrunkStore(unknown.root).readManifest()).ok, false);
  // 不安全 sidecar（硬链接 nlink≠1）：fail-closed（stable-source 安全检查不变）。
  const unsafe = await gitTrunkRoot();
  await writeStableSource(unsafe.root, "tol-stable-hardlink");
  await appendSidecar(unsafe.root, "tol-stable-hardlink");
  await fs.link(sidecarPath(unsafe.root, "tol-stable-hardlink"), path.join(unsafe.root, "stable-sidecar-alias"));
  await assert.rejects(listGitOperationJournals(unsafe.root), /authorization-sidecar-file-unsafe/);
});

test("I0-12: a corrupted stable-source stays fail-closed even with a sidecar present", async () => {
  const { root } = await gitTrunkRoot();
  const dir = await writeStableSource(root, "tol-stable-corrupt");
  await fs.writeFile(path.join(dir, "stable-source.json"), JSON.stringify({ schema: "stable-initial-workflow-source/v1", kind: "stable-initial-workflow", operationId: "not-the-directory-operation" }));
  await fs.writeFile(path.join(dir, "authorization.jsonl"), "not-json\n");
  await assert.rejects(listGitOperationJournals(root), /stable-work-source-corrupt/);
  assert.equal((await createProjectTrunkStore(root).readManifest()).ok, false);
});
