/**
 * v2.0.0 发布阻断 P0（2026-11-12）：项目根规范化。
 *
 * macOS `os.tmpdir()` 返回 `/var/folders/...`，其真实路径为 `/private/var/folders/...`
 * （`/var` 是符号链接祖先）。旧实现把「realpath(根) ≠ 输入的逐字字符串」判为
 * `noncanonical-project-root`，导致保护范围 `unknown` ⇒ 所有 Core 绑定以
 * `runtime-protection-scope-unknown` 失败（CI 120 名同因）。
 *
 * 本文件钉住修复原则：
 * - 同一真实根的不同书写形式（符号链接**祖先**；macOS 临时目录语义）必须被接受；
 * - 最终根**自身**是符号链接仍 fail-closed 拒绝；
 * - `.git` 为文件、`.ans/trunk`/初始化源符号链接等既有拒绝不放宽；
 * - 初始化源记录的 `projectRoot` 按 realpath 比较（同一真实根），不同真实根仍拒绝。
 *
 * 平台无关：Windows 用 directory junction，POSIX 用目录符号链接。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendGitActionAuthorization,
  beginGitHostAction,
  checkGitHostAction,
  createGitQueryPort,
  endGitHostAction,
  initializeGitRepository,
  readGitActionAuthorizations,
  readGitHostProtectionRequirement,
  readGitInitializationFacts,
  readGitProtectionFacts,
  type GitActionAuthorizationRecord,
} from "../../src/provider/trunk/public/trunk-store.ts";
import { createRuntimeAdapter, inspectRuntimeFileGateContext } from "../../src/service/runtime/session.ts";
import { allow, role } from "./fixtures.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

const linkDir = (target: string, link: string) => symlink(target, link, process.platform === "win32" ? "junction" : "dir");

/**
 * B3-2b（2026-11-12）：Windows 8.3 短名拼写（CI TEMP `C:\Users\RUNNER~1\...`）。
 * `fs/promises.realpath` 与 `realpathSync.native` 会展开短名；`realpathSync` 的 JS 实现不会。
 * 用系统 ShortPath 取得同一目录的短名拼写（8.3 被禁用时返回 undefined/同形，测试跳过）。
 */
function shortPathOf(target: string): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const quoted = target.replace(/'/g, "''");
    const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${quoted}').ShortPath`], { encoding: "utf8", windowsHide: true }).trim();
    return result.length > 0 ? result : undefined;
  } catch { return undefined; }
}

/** 真实父目录 + 指向它的别名父目录（别名即符号链接祖先）。 */
async function aliasAncestorFixture(prefix: string): Promise<{ realParent: string; aliasParent: string; realRoot: string; aliasRoot: string; cleanup: () => Promise<void> }> {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  const realParent = join(scratch, "real-parent");
  const aliasParent = join(scratch, "alias-parent");
  await mkdir(realParent);
  await linkDir(realParent, aliasParent);
  const realRoot = join(realParent, "project");
  await mkdir(realRoot);
  const aliasRoot = join(aliasParent, "project");
  assert.equal(await realpath(aliasRoot), realRoot, "fixture: alias 与真实根必须指向同一目录");
  assert.equal((await lstat(aliasRoot)).isSymbolicLink(), false, "fixture: 最终根自身不是链接");
  return { realParent, aliasParent, realRoot, aliasRoot, cleanup: async () => { await rm(scratch, { recursive: true, force: true }); } };
}

async function writeProtectedSource(root: string, projectRoot: string, sourceId = `init-source-${"a".repeat(64)}`): Promise<string> {
  const dir = join(root, ".ans", "trunk", "initialization-sources");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sourceId}.json`), JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot }));
  return sourceId;
}

test("P0 根规范化：符号链接祖先的临时根被接受（同一真实根的不同书写形式）", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-alias-");
  t.after(fixture.cleanup);
  const unmanaged = await readGitHostProtectionRequirement({ projectRoot: fixture.aliasRoot });
  assert.equal(unmanaged.state, "unmanaged", JSON.stringify(unmanaged.reasons));
  assert.deepEqual(unmanaged.reasons, []);
  // 初始化源记录写别名拼写：两侧 realpath 相同 ⇒ 仍构成 required（记录根比较不再逐字相等）。
  const sourceId = await writeProtectedSource(fixture.aliasRoot, fixture.aliasRoot);
  const required = await readGitHostProtectionRequirement({ projectRoot: fixture.aliasRoot });
  assert.equal(required.state, "required", JSON.stringify(required.reasons));
  assert.ok(required.revision > unmanaged.revision);
  // 规范拼写读取同一真实根的证据同样成立。
  const canonicalRead = await readGitHostProtectionRequirement({ projectRoot: fixture.realRoot });
  assert.equal(canonicalRead.state, "required", JSON.stringify(canonicalRead.reasons));
  const bytes = await readFile(join(fixture.aliasRoot, ".ans/trunk/initialization-sources", `${sourceId}.json`), "utf8");
  assert.equal(JSON.parse(bytes).projectRoot, fixture.aliasRoot);
  t.diagnostic(JSON.stringify({ platform: process.platform, aliasRoot: fixture.aliasRoot, realRoot: fixture.realRoot, state: required.state }));
});

test("P0 根规范化：最终根自身是符号链接仍拒绝（noncanonical-project-root）", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-final-link-");
  t.after(fixture.cleanup);
  const finalLink = join(fixture.realParent, "final-link");
  await linkDir(fixture.realRoot, finalLink);
  assert.equal((await realpath(finalLink)), fixture.realRoot);
  const fact = await readGitHostProtectionRequirement({ projectRoot: finalLink });
  assert.equal(fact.state, "unknown");
  assert.ok(fact.reasons.some(reason => /noncanonical-project-root/.test(reason)), JSON.stringify(fact.reasons));
});

test("P0 根规范化：初始化源记录指向不同真实根仍 fail-closed 拒绝", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-foreign-source-");
  const foreign = await aliasAncestorFixture("ans-p0-foreign-root-");
  t.after(async () => { await fixture.cleanup(); await foreign.cleanup(); });
  await writeProtectedSource(fixture.aliasRoot, foreign.realRoot);
  const fact = await readGitHostProtectionRequirement({ projectRoot: fixture.aliasRoot });
  assert.equal(fact.state, "unknown");
  assert.ok(fact.reasons.some(reason => /invalid-initialization-source/.test(reason)), JSON.stringify(fact.reasons));
});

test("P0 根规范化：既有控制路径符号链接拒绝不放宽（.ans/trunk、.git 文件）", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-control-link-");
  t.after(fixture.cleanup);
  const outside = await mkdtemp(join(tmpdir(), "ans-p0-outside-"));
  t.after(async () => { await rm(outside, { recursive: true, force: true }); });
  await mkdir(join(fixture.aliasRoot, ".ans"), { recursive: true });
  await linkDir(outside, join(fixture.aliasRoot, ".ans", "trunk"));
  const linkedTrunk = await readGitHostProtectionRequirement({ projectRoot: fixture.aliasRoot });
  assert.equal(linkedTrunk.state, "unknown");
  assert.ok(linkedTrunk.reasons.some(reason => /unsafe-git-control-root/.test(reason)), JSON.stringify(linkedTrunk.reasons));
  // .git 为文件（linked worktree 语义）沿用既有 unknown，不因根规范化被当作 unmanaged。
  const gitFileRoot = await aliasAncestorFixture("ans-p0-gitfile-");
  t.after(gitFileRoot.cleanup);
  await writeFile(join(gitFileRoot.aliasRoot, ".git"), "gitdir: foreign-worktree-metadata\n");
  const gitFile = await readGitHostProtectionRequirement({ projectRoot: gitFileRoot.aliasRoot });
  assert.equal(gitFile.state, "unknown");
  assert.ok(gitFile.reasons.some(reason => /git-association-protection-requirement-unknown/.test(reason)), JSON.stringify(gitFile.reasons));
});

test("P0 根规范化：初始化事实/真实 Git 初始化在符号链接祖先根下成立，最终根链接仍拒绝", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-init-");
  t.after(fixture.cleanup);
  const before = await readGitInitializationFacts(fixture.aliasRoot);
  assert.notEqual(before.state, "unsupported", JSON.stringify(before.reasons));
  assert.equal(before.reasons.includes("Project root is not a canonical host root"), false);
  assert.equal(before.projectRoot, fixture.realRoot);
  const identity = await initializeGitRepository(fixture.aliasRoot);
  assert.equal(identity.root, fixture.realRoot);
  assert.equal((await createGitQueryPort(fixture.aliasRoot).inspect()).root, fixture.realRoot);
  const protection = await readGitProtectionFacts(fixture.aliasRoot);
  assert.equal(protection.coverage, "complete", JSON.stringify(protection.reasons));
  assert.equal(protection.projectRoot, fixture.realRoot);
  // 最终根自身为链接：初始化事实 unsupported，Git 初始化/检查拒绝。
  const finalLink = join(fixture.realParent, "linked-project");
  await linkDir(fixture.realRoot, finalLink);
  const unsupported = await readGitInitializationFacts(finalLink);
  assert.equal(unsupported.state, "unsupported");
  assert.ok(unsupported.reasons.includes("Project root is not a canonical host root"));
  await assert.rejects(createGitQueryPort(finalLink).inspect(), /git-root-link-unsupported/);
  // 独立的空真实根 + 最终根链接：真实 Git 初始化仍拒绝（否则空根本可成功）。
  const emptyReal = join(fixture.realParent, "empty-project"); await mkdir(emptyReal);
  const emptyLink = join(fixture.realParent, "empty-link"); await linkDir(emptyReal, emptyLink);
  await assert.rejects(initializeGitRepository(emptyLink), /git-init-target-not-empty/);
  await assert.rejects(lstat(join(emptyReal, ".ans")), { code: "ENOENT" });
});

test("P0 根规范化：fileGateProtection 指向不同真实根 ⇒ 丢弃事实、写 fail-closed", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-gate-root-");
  const foreign = await aliasAncestorFixture("ans-p0-gate-foreign-");
  t.after(async () => { await fixture.cleanup(); await foreign.cleanup(); });
  // 外部根的完整保护事实不得被会话根冒用：session 丢弃 ⇒ coverage unknown ⇒ 写拒绝。
  const protection = await readGitProtectionFacts(foreign.aliasRoot);
  assert.equal(protection.coverage, "complete");
  const stageFacts: string[] = [];
  const gate: WriteGate = (target, context) => {
    const facts = context?.stage && context.operation ? inspectRuntimeFileGateContext(context, target, context.operation, context.stage) : undefined;
    stageFacts.push(`${context?.stage ?? "none"}:${facts?.canonicalFacts?.coverage ?? "no-canonical-facts"}`);
    if (!facts) return { allowed: false, reason: "issued host identity unavailable", allowedByRoot: { project: [], skill: [] } };
    return facts.stage === "lexical-read" || facts.canonicalFacts?.coverage === "complete"
      ? { allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "p0 foreign gate fixture" } }
      : { allowed: false, reason: "canonical/host coverage unknown", allowedByRoot: { project: [], skill: [] } };
  };
  const session = await createRuntimeAdapter({ runtime: "demo", gate, projectRoot: fixture.aliasRoot, skillRoot: fixture.aliasRoot, writeRoot: fixture.aliasRoot,
    fileGateProtocol: "host-facts-v1", fileGateProtection: protection, script: [{ name: "write_file", args: { path: "must-not-write.txt", content: "foreign root" } }] })
    .bindRole(role("p0-foreign-gate-writer"));
  const denied: string[] = [];
  const pump = (async () => { for await (const event of session.events()) if (event.kind === "denied") denied.push(event.summary); })();
  try { await session.prompt("foreign protection facts must not authorize this root"); }
  finally { await session.dispose(); await pump; }
  await assert.rejects(lstat(join(fixture.aliasRoot, "must-not-write.txt")), { code: "ENOENT" });
  assert.ok(denied.some(summary => /canonical\/host coverage unknown/.test(summary)), JSON.stringify(denied));
  assert.ok(stageFacts.some(value => value.startsWith("canonical-read:") && !value.endsWith(":complete")), JSON.stringify(stageFacts));
});

test("P0 根规范化：Core 绑定与 host-facts file gate 在符号链接祖先根下工作", async t => {
  const fixture = await aliasAncestorFixture("ans-p0-core-");
  t.after(fixture.cleanup);
  const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: fixture.aliasRoot, skillRoot: fixture.aliasRoot, script: [] })
    .bindRole(role("p0-alias-root-worker"));
  try {
    assert.ok(session.sessionId);
    assert.equal(session.inspectToolSurface!().sessionId, session.sessionId);
  } finally { await session.dispose(); }
  // fileGateProtection 由规范根读出（readGitProtectionFacts），会话根为别名拼写：同一真实根 ⇒ 写仍成立。
  const protection = await readGitProtectionFacts(fixture.aliasRoot);
  const gate: WriteGate = (target, context) => {
    const facts = context?.stage && context.operation ? inspectRuntimeFileGateContext(context, target, context.operation, context.stage) : undefined;
    if (!facts) return { allowed: false, reason: "issued host identity unavailable", allowedByRoot: { project: [], skill: [] } };
    // lexical-read 无 canonicalFacts；canonical-read/final-write 必须有完整的宿主保护事实（同一真实根）。
    return facts.stage === "lexical-read" || facts.canonicalFacts?.coverage === "complete"
      ? { allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "p0 alias fixture" } }
      : { allowed: false, reason: "canonical/host coverage unknown", allowedByRoot: { project: [], skill: [] } };
  };
  const writing = await createRuntimeAdapter({ runtime: "demo", gate, projectRoot: fixture.aliasRoot, skillRoot: fixture.aliasRoot, writeRoot: fixture.aliasRoot,
    fileGateProtocol: "host-facts-v1", fileGateProtection: protection, script: [{ name: "write_file", args: { path: "alias-written.txt", content: "同一真实根" } }] })
    .bindRole(role("p0-alias-root-writer"));
  try { await writing.prompt("write through the real host gate"); }
  finally { await writing.dispose(); }
  assert.equal(await readFile(join(fixture.aliasRoot, "alias-written.txt"), "utf8"), "同一真实根");
  assert.equal(createHash("sha256").update("同一真实根").digest("hex"),
    createHash("sha256").update(await readFile(join(fixture.aliasRoot, "alias-written.txt"))).digest("hex"));
  t.diagnostic(JSON.stringify({ platform: process.platform, session: session.sessionId, protectionRoot: protection.projectRoot, sessionRoot: fixture.aliasRoot }));
});

test("B3-2b 根规范化：host coordinator 按真实根归一符号链接祖先；不同真实根仍隔离", async t => {
  const fixture = await aliasAncestorFixture("ans-b3-2b-alias-");
  const foreign = await aliasAncestorFixture("ans-b3-2b-foreign-");
  t.after(async () => { await fixture.cleanup(); await foreign.cleanup(); });
  const lease = beginGitHostAction({ projectRoot: fixture.aliasRoot, kind: "git-mutation" });
  assert.equal(lease.ok, true, JSON.stringify(lease));
  if (!lease.ok) return;
  try {
    // W29 根因：begin 用别名拼写、append 内 check 用规范根，旧键仅 path.resolve ⇒ 不同 coordinator
    // ⇒ authorization-lease-invalid。同一真实根必须命中同一 lease。
    assert.equal(checkGitHostAction({ projectRoot: fixture.realRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok, true,
      "同一真实根的 alias/规范拼写必须命中同一 coordinator");
    assert.equal(checkGitHostAction({ projectRoot: foreign.realRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok, false,
      "不同真实根不得命中同一 lease（不放宽根隔离）");
    t.diagnostic(JSON.stringify({ platform: process.platform, aliasRoot: fixture.aliasRoot, realRoot: fixture.realRoot, leaseId: lease.leaseId }));
  } finally {
    const ended = endGitHostAction({ projectRoot: fixture.realRoot, leaseId: lease.leaseId });
    assert.equal(ended.ok, true, "按另一拼写结束必须命中同一 coordinator");
  }
});

test("B3-2b 根规范化：Windows 8.3 短名与规范长名命中同一 coordinator；authorization append 不再 authorization-lease-invalid", async t => {
  if (process.platform !== "win32") { t.skip("8.3 short names only exist on Windows"); return; }
  const scratch = await realpath(await mkdtemp(join(tmpdir(), "ans-b3-2b-short-")));
  t.after(async () => { await rm(scratch, { recursive: true, force: true }); });
  const longRoot = join(scratch, "project-with-a-very-long-directory-name");
  const foreignRoot = join(scratch, "foreign-with-a-very-long-directory-name");
  await mkdir(longRoot); await mkdir(foreignRoot);
  const shortRoot = shortPathOf(longRoot), shortForeign = shortPathOf(foreignRoot);
  if (!shortRoot || shortRoot.toLowerCase() === longRoot.toLowerCase()) { t.skip("8.3 short names are disabled on this volume"); return; }
  assert.notEqual(shortRoot.toLowerCase(), longRoot.toLowerCase(), "fixture: 短名与长名必须是两种拼写");
  assert.equal(await realpath(shortRoot), await realpath(longRoot), "fixture: 短名与长名必须指向同一真实根");
  const canonicalRoot = await realpath(longRoot);
  // CI 语义：begin 收到短名（RUNNER~1）拼写，append/check 使用 provider 读出的规范根。
  const lease = beginGitHostAction({ projectRoot: shortRoot, kind: "git-mutation" });
  assert.equal(lease.ok, true, JSON.stringify(lease));
  if (!lease.ok) return;
  const operationId = "b3-2b-short-name-operation";
  const record: GitActionAuthorizationRecord = {
    source: "git-action-authorization", version: 1, operationId, template: "commit",
    actorRoleId: "convener", coreSessionId: "core-b3-2b", turnId: "turn-b3-2b", activeTool: "git_candidate",
    projectRoot: canonicalRoot, rootsDigest: "a".repeat(64), registryRevision: 0, inventoryRevision: 0,
    leaseId: lease.leaseId, policyInputDigests: { candidate: "b".repeat(64) }, optionalEvidence: {},
  };
  try {
    // 修复前该 append 内的 check 落在长名 coordinator ⇒ authorization-lease-invalid（W29×4/W30×2/W33/W34/W35）。
    await appendGitActionAuthorization(longRoot, record);
    assert.equal(checkGitHostAction({ projectRoot: longRoot, leaseId: lease.leaseId, kind: "git-mutation" }).ok, true,
      "短名 begin 的 lease 必须被规范长名 check 命中");
    // 相邻口径（sameAuthorizationRoot）：调用方传短名拼写仍按同一真实根归一并写出规范根。
    await appendGitActionAuthorization(shortRoot, { ...record, projectRoot: shortRoot });
    const read = await readGitActionAuthorizations(longRoot, operationId);
    assert.equal(read.ok, true, JSON.stringify(read));
    if (read.ok) {
      assert.equal(read.records.length, 2);
      assert.ok(read.records.every(item => item.projectRoot === canonicalRoot), JSON.stringify(read.records));
    }
    if (shortForeign) assert.equal(checkGitHostAction({ projectRoot: shortForeign, leaseId: lease.leaseId, kind: "git-mutation" }).ok, false,
      "另一真实根的短名不得命中本 lease");
    t.diagnostic(JSON.stringify({ platform: process.platform, shortRoot, canonicalRoot, leaseId: lease.leaseId }));
  } finally {
    endGitHostAction({ projectRoot: longRoot, leaseId: lease.leaseId });
  }
});

test("B3-2b 根规范化：不可解析根 fail-closed（不为未知拼写创建可命中的 coordinator）", () => {
  const missing = join(tmpdir(), `ans-b3-2b-missing-${process.pid}-${Date.now()}`);
  assert.deepEqual(beginGitHostAction({ projectRoot: missing, kind: "arm" }), { ok: false, code: "git-host-project-root-unresolvable" });
  assert.deepEqual(checkGitHostAction({ projectRoot: missing, leaseId: "unresolvable-lease" }), { ok: false, code: "git-host-project-root-unresolvable" });
});
