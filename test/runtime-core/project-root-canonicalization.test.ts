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
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGitQueryPort,
  initializeGitRepository,
  readGitHostProtectionRequirement,
  readGitInitializationFacts,
  readGitProtectionFacts,
} from "../../src/provider/trunk/public/trunk-store.ts";
import { createRuntimeAdapter, inspectRuntimeFileGateContext } from "../../src/service/runtime/session.ts";
import { allow, role } from "./fixtures.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

const linkDir = (target: string, link: string) => symlink(target, link, process.platform === "win32" ? "junction" : "dir");

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
