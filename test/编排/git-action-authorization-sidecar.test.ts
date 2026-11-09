import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  appendGitActionAuthorization, readGitActionAuthorizations, beginGitHostAction, endGitHostAction,
  writeGitInitializationRecord, readGitInitializationRecord, GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS,
  type GitActionAuthorizationRecord, type GitInitializationRecord,
} from "../../src/provider/trunk/public/trunk-store.ts";
import { acquireVersionLock } from "../../src/provider/version-change/public/version-change-store.ts";

// W3a：Git 动作授权 sidecar（设计 P1.4 §3.4.3 / I0-1 / I0-2）的 Provider 能力测试。
// 覆盖：append/read 往返与白名单投影、路径安全（nlink/链接/越界/非 canonical 根）、
// 预算（4 KiB 行 / 16 次尝试 / 64 KiB 文件）、坏 JSON/未知字段/截断末行、失败注入与 lease/锁。

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sidecarPath = (root: string, operationId: string) => path.join(root, ".ans/trunk/operations", digest(operationId), "authorization.jsonl");

async function projectRoot(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "ans-w3a-sidecar-")); }
function beginLease(root: string): string {
  const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" });
  if (!lease.ok) throw new Error(lease.code);
  return lease.leaseId;
}
async function withLease<T>(root: string, run: (leaseId: string) => Promise<T>): Promise<T> {
  const leaseId = beginLease(root);
  try { return await run(leaseId); } finally { endGitHostAction({ projectRoot: root, leaseId }); }
}
function authorization(root: string, leaseId: string, overrides: Partial<GitActionAuthorizationRecord> = {}): GitActionAuthorizationRecord {
  return {
    source: "git-action-authorization", version: 1, operationId: "w3a-operation-1", template: "commit",
    actorRoleId: "product", coreSessionId: "core-session-1", taskId: "task-1", runId: "run-1", turnId: "turn-1",
    activeTool: "git_candidate", projectRoot: root, rootsDigest: digest("roots"),
    registryRevision: 7, inventoryRevision: "inventory-3", leaseId,
    policyInputDigests: { candidate: digest("candidate-policy") },
    optionalEvidence: {
      toolSurfaceStatus: "unknown", nativeStatus: "unknown", nativeReasonsCount: 2, processCoverage: "unknown",
      configuredForeignMcpServers: ["mcp-foreign"], unknownTools: ["tool.unknown"],
    },
    ...overrides,
  };
}
async function appendOnce(root: string, overrides: Partial<GitActionAuthorizationRecord> = {}): Promise<GitActionAuthorizationRecord> {
  return withLease(root, async leaseId => {
    const record = authorization(root, leaseId, overrides);
    await appendGitActionAuthorization(root, record);
    return record;
  });
}
const auditRejects = async (promise: Promise<unknown>, pattern: RegExp = /^git-action-audit-unavailable/) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, pattern);
    return true;
  });
};

test("sidecar: append/read round-trip at the frozen path with whitelist field projection", async () => {
  const root = await projectRoot(), canonical = await fs.realpath(root);
  const record = await appendOnce(root);
  const file = sidecarPath(root, record.operationId), text = await fs.readFile(file, "utf8");
  assert.equal(text.endsWith("\n"), true);
  const lines = text.split("\n");
  assert.equal(lines.length, 2); assert.equal(lines[1], "");
  const line = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(line), ["source", "version", "operationId", "template", "actorRoleId", "coreSessionId", "taskId", "runId", "turnId",
    "activeTool", "projectRoot", "rootsDigest", "registryRevision", "inventoryRevision", "leaseId", "policyInputDigests", "optionalEvidence"]);
  assert.equal(line.projectRoot, canonical);
  assert.deepEqual(line.policyInputDigests, { candidate: digest("candidate-policy") });
  assert.equal((line.optionalEvidence as Record<string, unknown>).applicationMediation, undefined);
  const read = await readGitActionAuthorizations(root, record.operationId);
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.deepEqual(read.diagnostics, []);
  assert.deepEqual(read.records, [{ ...record, projectRoot: canonical }]);
  // R2 多 verdict：init/文档类动作的 init+candidate+publication 键完整落盘（固定顺序）。
  const multiRoot = await projectRoot();
  await appendOnce(multiRoot, { template: "init", policyInputDigests: { publication: digest("pub"), init: digest("ini"), candidate: digest("can") } });
  const multiText = await fs.readFile(sidecarPath(multiRoot, "w3a-operation-1"), "utf8");
  const multiLine = JSON.parse(multiText.trim()) as { policyInputDigests: Record<string, string> };
  assert.deepEqual(Object.keys(multiLine.policyInputDigests), ["init", "candidate", "publication"]);
});

test("sidecar: same operationId retries append new lines and never change journal replay/settlement identity", async () => {
  const root = await projectRoot(), operationId = "w3a-journal-isolation";
  const init: GitInitializationRecord = {
    media: "git-initialization/v1", operationId, requestDigest: digest("request"), projectRoot: root,
    taskId: "task-init", runId: "run-init", flowId: "demo", sourceId: "init-source-" + digest("source"),
    sourceSha256: digest("source-bytes"), qualificationDigest: digest("qualification"), expectedFiles: [], stage: "prepared",
  };
  await writeGitInitializationRecord(root, init);
  const initFile = path.join(root, ".ans/trunk/operations", digest(operationId), "init.json");
  const before = digest(await fs.readFile(initFile));
  const first = await appendOnce(root, { operationId }), second = await appendOnce(root, { operationId });
  assert.notEqual(first.leaseId, second.leaseId);
  const read = await readGitActionAuthorizations(root, operationId);
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.equal(read.records.length, 2);
  assert.deepEqual(read.records.map(entry => entry.leaseId), [first.leaseId, second.leaseId]);
  assert.deepEqual(await readGitInitializationRecord(root, operationId), init);
  assert.equal(digest(await fs.readFile(initFile)), before, "sidecar 追加不触碰既有 init.json");
  assert.deepEqual(await readGitActionAuthorizations(root, "operation-without-sidecar"), { ok: true, records: [], diagnostics: [] },
    "旧 journal 没有 sidecar 天然兼容（读取为空，不报错）");
  assert.deepEqual(await readGitActionAuthorizations(await projectRoot(), "fresh-project"), { ok: true, records: [], diagnostics: [] });
});

test("sidecar: unsafe path shapes (nlink, junction links, non-canonical root) are rejected fail-closed", async () => {
  // 文件 nlink ≠ 1：硬链接别名使审计文件不可追加。
  const hardlinked = await projectRoot(), first = await appendOnce(hardlinked), file = sidecarPath(hardlinked, first.operationId);
  await fs.link(file, file + ".alias");
  await auditRejects(withLease(hardlinked, async leaseId => appendGitActionAuthorization(hardlinked, authorization(hardlinked, leaseId, { operationId: first.operationId }))), /authorization-file-unsafe/);
  assert.equal((await readGitActionAuthorizations(hardlinked, first.operationId)).ok, false);
  // authorization.jsonl 被目录占位（写入 store 阻断注入，AC-16 方式）：拒绝且不执行。
  const blocked = await projectRoot(), blockedId = "w3a-blocked-store";
  await fs.mkdir(sidecarPath(blocked, blockedId), { recursive: true });
  await auditRejects(withLease(blocked, async leaseId => appendGitActionAuthorization(blocked, authorization(blocked, leaseId, { operationId: blockedId }))));
  assert.equal((await readGitActionAuthorizations(blocked, blockedId)).ok, false);
  // operation 目录是指向外部目录的 junction/符号链接：拒绝且链接目标不被写入。
  const linked = await projectRoot(), outside = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3a-outside-"));
  await fs.mkdir(path.join(linked, ".ans/trunk/operations"), { recursive: true });
  await fs.symlink(outside, path.join(linked, ".ans/trunk/operations", digest("w3a-linked")), process.platform === "win32" ? "junction" : "dir");
  await auditRejects(withLease(linked, async leaseId => appendGitActionAuthorization(linked, authorization(linked, leaseId, { operationId: "w3a-linked" }))));
  assert.equal((await readGitActionAuthorizations(linked, "w3a-linked")).ok, false);
  assert.deepEqual(await fs.readdir(outside), [], "链接目标目录没有被写入");
  // operations 目录本身是链接：拒绝。
  const linkedOps = await projectRoot(), outsideOps = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3a-outside-ops-"));
  await fs.mkdir(path.join(linkedOps, ".ans/trunk"), { recursive: true });
  await fs.symlink(outsideOps, path.join(linkedOps, ".ans/trunk/operations"), process.platform === "win32" ? "junction" : "dir");
  await auditRejects(withLease(linkedOps, async leaseId => appendGitActionAuthorization(linkedOps, authorization(linkedOps, leaseId))));
  assert.deepEqual(await fs.readdir(outsideOps), []);
  // projectRoot 非 canonical（junction 别名）：拒绝。
  const real = await projectRoot(), alias = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3a-alias-")), "alias");
  await fs.symlink(real, alias, process.platform === "win32" ? "junction" : "dir");
  await auditRejects(withLease(alias, async leaseId => appendGitActionAuthorization(alias, authorization(alias, leaseId))), /project-root-not-canonical/);
});

test("sidecar: frozen budgets (4 KiB line / 16 attempts / 64 KiB file) reject with git-action-audit-unavailable", async () => {
  // 单行 > 4 KiB：合法字段组合（32 个 128 字符工具名）超出预算。
  const lineRoot = await projectRoot();
  const bigTools = Array.from({ length: 32 }, (_, index) => `${index}`.padStart(2, "0") + "x".repeat(126));
  await auditRejects(withLease(lineRoot, async leaseId => appendGitActionAuthorization(lineRoot, authorization(lineRoot, leaseId, { optionalEvidence: { unknownTools: bigTools } }))), /authorization-line-budget/);
  assert.equal(await fs.stat(sidecarPath(lineRoot, "w3a-operation-1")).then(() => true, () => false), false, "超预算不创建审计文件");
  // 第 17 次尝试被拒。
  const attemptRoot = await projectRoot();
  for (let index = 0; index < GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS; index++) await appendOnce(attemptRoot);
  await auditRejects(appendOnce(attemptRoot), /authorization-attempt-budget/);
  const readAttempts = await readGitActionAuthorizations(attemptRoot, "w3a-operation-1");
  assert.equal(readAttempts.ok, true); if (!readAttempts.ok) return;
  assert.equal(readAttempts.records.length, GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS);
  // 文件 > 64 KiB（写入 store 损坏注入超长单行）。
  const fileRoot = await projectRoot(), fileId = "w3a-large-file", largeFile = sidecarPath(fileRoot, fileId);
  await fs.mkdir(path.dirname(largeFile), { recursive: true });
  await fs.writeFile(largeFile, "a".repeat(64 * 1024 + 1));
  await auditRejects(withLease(fileRoot, async leaseId => appendGitActionAuthorization(fileRoot, authorization(fileRoot, leaseId, { operationId: fileId }))), /authorization-file-budget/);
  const readFileBudget = await readGitActionAuthorizations(fileRoot, fileId);
  assert.equal(readFileBudget.ok, false); if (readFileBudget.ok) return;
  assert.match(readFileBudget.message, /authorization-file-budget/);
  // 既有完整行 > 4 KiB：读取与追加均 fail-closed。
  const oversizedRoot = await projectRoot(), oversizedId = "w3a-oversized-line", oversizedFile = sidecarPath(oversizedRoot, oversizedId);
  await fs.mkdir(path.dirname(oversizedFile), { recursive: true });
  await fs.writeFile(oversizedFile, "a".repeat(4097) + "\n");
  assert.equal((await readGitActionAuthorizations(oversizedRoot, oversizedId)).ok, false);
  await auditRejects(withLease(oversizedRoot, async leaseId => appendGitActionAuthorization(oversizedRoot, authorization(oversizedRoot, leaseId, { operationId: oversizedId }))), /authorization-line-budget/);
  // 既有文件 > 16 行：读取与追加均 fail-closed。
  const rowsRoot = await projectRoot(), rowsId = "w3a-too-many-rows", rowsFile = sidecarPath(rowsRoot, rowsId);
  await fs.mkdir(path.dirname(rowsFile), { recursive: true });
  const validLine = JSON.stringify({
    source: "git-action-authorization", version: 1, operationId: rowsId, template: "commit", actorRoleId: "product",
    coreSessionId: "session", turnId: "turn", activeTool: "git_candidate", projectRoot: await fs.realpath(rowsRoot),
    rootsDigest: digest("roots"), registryRevision: 1, inventoryRevision: 1, leaseId: "lease-row",
    policyInputDigests: { candidate: digest("candidate") }, optionalEvidence: {},
  });
  await fs.writeFile(rowsFile, Array.from({ length: GIT_ACTION_AUTHORIZATION_MAX_ATTEMPTS + 1 }, () => validLine).join("\n") + "\n");
  assert.equal((await readGitActionAuthorizations(rowsRoot, rowsId)).ok, false);
  await auditRejects(withLease(rowsRoot, async leaseId => appendGitActionAuthorization(rowsRoot, authorization(rowsRoot, leaseId, { operationId: rowsId }))), /authorization-attempt-budget/);
});

test("sidecar: truncated tail tolerated with diagnostics and repaired before append; bad JSON/unknown fields fail closed", async () => {
  const root = await projectRoot(), operationId = "w3a-truncated", file = sidecarPath(root, operationId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const complete = {
    source: "git-action-authorization", version: 1, operationId, template: "commit", actorRoleId: "product",
    coreSessionId: "core", turnId: "turn", activeTool: "git_candidate", projectRoot: await fs.realpath(root),
    rootsDigest: digest("roots"), registryRevision: 1, inventoryRevision: 1, leaseId: "lease-complete",
    policyInputDigests: { candidate: digest("candidate") }, optionalEvidence: {},
  };
  await fs.writeFile(file, JSON.stringify(complete) + "\n" + '{"source":"git-action');
  const tolerant = await readGitActionAuthorizations(root, operationId);
  assert.equal(tolerant.ok, true); if (!tolerant.ok) return;
  assert.equal(tolerant.records.length, 1);
  assert.equal(tolerant.diagnostics.length, 1);
  assert.match(tolerant.diagnostics[0]!, /^authorization-tail-truncated-ignored:/);
  const appended = await appendOnce(root, { operationId });
  const repaired = await readGitActionAuthorizations(root, operationId);
  assert.equal(repaired.ok, true); if (!repaired.ok) return;
  assert.deepEqual(repaired.diagnostics, []);
  assert.equal(repaired.records.length, 2);
  assert.equal(repaired.records[1]!.leaseId, appended.leaseId);
  assert.equal((await fs.readFile(file, "utf8")).endsWith("\n"), true);
  // 坏 JSON 中间行：读取失败；追加被拒（不回滚/不改写既有行）。
  const badRoot = await projectRoot(), badId = "w3a-bad-json", badFile = sidecarPath(badRoot, badId), badBytes = JSON.stringify({ ...complete, operationId: badId, projectRoot: await fs.realpath(badRoot) }) + "\nnot-json\n";
  await fs.mkdir(path.dirname(badFile), { recursive: true }); await fs.writeFile(badFile, badBytes);
  assert.equal((await readGitActionAuthorizations(badRoot, badId)).ok, false);
  await auditRejects(withLease(badRoot, async leaseId => appendGitActionAuthorization(badRoot, authorization(badRoot, leaseId, { operationId: badId }))), /authorization-json-invalid/);
  assert.equal(await fs.readFile(badFile, "utf8"), badBytes);
  // 未知字段（顶层）：读取失败；追加被拒。
  const unknownRoot = await projectRoot(), unknownId = "w3a-unknown-field", unknownFile = sidecarPath(unknownRoot, unknownId);
  await fs.mkdir(path.dirname(unknownFile), { recursive: true });
  await fs.writeFile(unknownFile, JSON.stringify({ ...complete, operationId: unknownId, projectRoot: await fs.realpath(unknownRoot), evidence: "x" }) + "\n");
  assert.equal((await readGitActionAuthorizations(unknownRoot, unknownId)).ok, false);
  await auditRejects(withLease(unknownRoot, async leaseId => appendGitActionAuthorization(unknownRoot, authorization(unknownRoot, leaseId, { operationId: unknownId }))), /authorization-record-invalid/);
  // 未知字段（optionalEvidence 内嵌 applicationMediation）：不读取、不写盘。
  const nestedRoot = await projectRoot(), nestedId = "w3a-nested-unknown", nestedFile = sidecarPath(nestedRoot, nestedId);
  await fs.mkdir(path.dirname(nestedFile), { recursive: true });
  await fs.writeFile(nestedFile, JSON.stringify({ ...complete, operationId: nestedId, projectRoot: await fs.realpath(nestedRoot), optionalEvidence: { applicationMediation: "verified" } }) + "\n");
  assert.equal((await readGitActionAuthorizations(nestedRoot, nestedId)).ok, false);
  // 追加输入里的未知字段同样被拒（投影不吞字段）。
  const inputRoot = await projectRoot();
  await auditRejects(withLease(inputRoot, async leaseId => {
    const record = { ...authorization(inputRoot, leaseId), applicationMediation: "verified" } as unknown as GitActionAuthorizationRecord;
    return appendGitActionAuthorization(inputRoot, record);
  }), /authorization-record-invalid/);
  assert.equal(await fs.stat(sidecarPath(inputRoot, "w3a-operation-1")).then(() => true, () => false), false);
});

test("sidecar: audit failures are fail-closed git-action-audit-unavailable (lease, lock, blocked store)", async () => {
  const root = await projectRoot(), file = sidecarPath(root, "w3a-operation-1");
  // 无 live lease：拒绝且无文件副作用。
  await auditRejects(appendGitActionAuthorization(root, authorization(root, "no-such-lease")), /authorization-lease-invalid/);
  assert.equal(await fs.stat(file).then(() => true, () => false), false);
  // 已结束 lease 与伪造 leaseId 均无效。
  const ended = beginLease(root); endGitHostAction({ projectRoot: root, leaseId: ended });
  await auditRejects(appendGitActionAuthorization(root, authorization(root, ended)), /authorization-lease-invalid/);
  await withLease(root, async () => { await auditRejects(appendGitActionAuthorization(root, authorization(root, "forged-lease")), /authorization-lease-invalid/); });
  // record.projectRoot 与写入根不一致：拒绝。
  const other = await projectRoot();
  await auditRejects(withLease(root, async leaseId => appendGitActionAuthorization(root, authorization(other, leaseId))), /authorization-project-root-mismatch/);
  // heldLockToken fencing：错误 token 拒绝；真实持有的 token 允许。
  await auditRejects(withLease(root, async leaseId => appendGitActionAuthorization(root, authorization(root, leaseId), { heldLockToken: "not-the-held-token" })), /authorization-lock-lost/);
  const release = await acquireVersionLock(root);
  try { await withLease(root, async leaseId => appendGitActionAuthorization(root, authorization(root, leaseId), { heldLockToken: release.token })); }
  finally { await release(); }
  const read = await readGitActionAuthorizations(root, "w3a-operation-1");
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.equal(read.records.length, 1);
});
