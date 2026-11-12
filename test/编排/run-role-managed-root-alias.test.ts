// test/编排/run-role-managed-root-alias.test.ts
// v2.0.0 发布阻断 P0 残余（2026-11-12）：macOS `os.tmpdir()` 符号链接祖先下的托管会话证据归属。
//
// 背景：`readGitProtectionFacts` 返回 realpath 规范根（`/private/var/...`），而桌面派发/授权路径
// 持有会话输入根的别名拼写（`/var/...`）。`inspectManagedRoleSessionEvidence` 旧实现逐字比较两串
// ⇒ 同一真实根被判不等 ⇒ 父 chief 证据不可见 ⇒ `prepareRoleDispatch` 走 `staleParent()` 拒绝
// （chief-workflow W20×2、W21×2、W48×4 的残余 8 名）。
//
// 本文件钉住修复原则（断言不放宽）：
// - 同一真实根的不同书写形式（符号链接**祖先**；macOS `/var`→`/private/var` 语义）⇒ 命中且投影一致；
// - 不同真实根 ⇒ 不命中；
// - 最终根**自身**是符号链接 ⇒ 不命中（沿用 P0「最终根链接 unsupported」的 fail-closed 立场）；
// - 任一侧不可解析（不存在/悬空）⇒ 不命中。
//
// 平台无关：Windows 用 directory junction，POSIX 用目录符号链接。会话经真实 `openRoleSession`
// 注册（不手工伪造 managed 注册表）；只替换模型/适配器（custom-adapter，与既有编排测试一致）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { openRoleSession, inspectManagedRoleSessionEvidence } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter } from "../../src/model/runtime.ts";

const linkDir = (target: string, link: string) => fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");

/**
 * B3-2（2026-11-12）：Windows 8.3 短名拼写（如 CI TEMP `C:\Users\RUNNER~1\...`）。
 * `fs/promises.realpath`（record 根来源）与 `realpathSync.native` 会展开短名；`realpathSync` 的 JS
 * 实现不会。用系统 ShortPath 取得同一目录的短名拼写（8.3 被禁用时返回 undefined/same，测试跳过）。
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

/** 真实父目录 + 指向它的别名父目录（别名即符号链接祖先；最终根自身不是链接）。 */
async function aliasAncestorFixture(prefix: string): Promise<{ realParent: string; aliasParent: string; realRoot: string; aliasRoot: string; cleanup: () => Promise<void> }> {
  const scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  const realParent = path.join(scratch, "real-parent");
  const aliasParent = path.join(scratch, "alias-parent");
  await fs.mkdir(realParent);
  await linkDir(realParent, aliasParent);
  const realRoot = path.join(realParent, "project");
  await fs.mkdir(realRoot);
  const aliasRoot = path.join(aliasParent, "project");
  assert.equal(await fs.realpath(aliasRoot), realRoot, "fixture: alias 与真实根必须指向同一目录");
  assert.equal((await fs.lstat(aliasRoot)).isSymbolicLink(), false, "fixture: 最终根自身不是链接");
  return { realParent, aliasParent, realRoot, aliasRoot, cleanup: async () => { await fs.rm(scratch, { recursive: true, force: true }); } };
}

function projectOf(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:orchestration-root-alias" } },
  };
}

/** 真实 `openRoleSession` 注册的 custom-adapter 会话（sessionId 显式给出，便于证据查询）。 */
async function openManagedFixture(root: string, sessionId: string) {
  const model: RoleSession = {
    sessionId,
    async prompt(): Promise<void> {},
    events(): AsyncIterable<never> { return (async function* () {})(); },
    async dispose(): Promise<void> {},
  };
  const factory = (): RuntimeAdapter => ({
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole(): Promise<RoleSession> { return model; },
  });
  const handle = await openRoleSession({ roleId: "chief", project: projectOf(root), runtime: "claude", autoRepin: false }, { createAdapter: factory });
  return handle;
}

test("P0 残余：托管会话证据按同一真实根命中（符号链接祖先别名 vs 规范根）", async t => {
  const fixture = await aliasAncestorFixture("ans-orch-root-alias-");
  t.after(fixture.cleanup);
  const handle = await openManagedFixture(fixture.aliasRoot, "root-alias-core-session");
  try {
    const viaAlias = inspectManagedRoleSessionEvidence({ projectRoot: fixture.aliasRoot, sessionId: "root-alias-core-session" });
    assert.ok(viaAlias, "会话输入根的别名拼写必须命中自己的托管句柄（W20/W21/W48 的 staleParent 根因）");
    const viaReal = inspectManagedRoleSessionEvidence({ projectRoot: fixture.realRoot, sessionId: "root-alias-core-session" });
    assert.ok(viaReal, "同一真实根的规范拼写必须命中同一句柄");
    // 两种书写形式投影的是同一条真实证据（字段逐字一致；projectRoot 仍是读取保护事实时的规范根）。
    assert.deepEqual(viaAlias, viaReal);
    assert.equal(viaAlias.sessionId, "root-alias-core-session");
    assert.equal(viaAlias.roleId, "chief");
    assert.equal(viaAlias.runtime, "claude");
    assert.equal(viaAlias.construction, "custom-adapter");
    assert.equal(viaAlias.disposed, false);
    assert.equal(viaAlias.projectRoot, await fs.realpath(fixture.aliasRoot));
    t.diagnostic(JSON.stringify({ platform: process.platform, aliasRoot: fixture.aliasRoot, realRoot: fixture.realRoot, evidenceRoot: viaAlias.projectRoot }));
  } finally { await handle.dispose(); }
});

test("P0 残余：不同真实根/未知会话不命中托管证据（fail-closed，不放宽跨根）", async t => {
  const fixture = await aliasAncestorFixture("ans-orch-root-foreign-");
  const foreign = await aliasAncestorFixture("ans-orch-root-foreign-other-");
  t.after(async () => { await fixture.cleanup(); await foreign.cleanup(); });
  const handle = await openManagedFixture(fixture.aliasRoot, "root-foreign-core-session");
  try {
    assert.equal(inspectManagedRoleSessionEvidence({ projectRoot: foreign.aliasRoot, sessionId: "root-foreign-core-session" }), undefined,
      "不同真实根（即使同为符号链接祖先写法）不得命中");
    assert.equal(inspectManagedRoleSessionEvidence({ projectRoot: fixture.realRoot, sessionId: "missing-core-session" }), undefined,
      "未知会话 id 不得命中");
  } finally { await handle.dispose(); }
});

test("P0 残余：最终根自身是符号链接不命中；不可解析路径不命中（沿用 P0 fail-closed）", async t => {
  const fixture = await aliasAncestorFixture("ans-orch-root-final-link-");
  t.after(fixture.cleanup);
  const finalLink = path.join(fixture.realParent, "final-link");
  await linkDir(fixture.realRoot, finalLink);
  assert.equal(await fs.realpath(finalLink), fixture.realRoot, "fixture: 最终根链接指向同一真实根");
  assert.equal((await fs.lstat(finalLink)).isSymbolicLink(), true, "fixture: 最终根自身是链接");
  const handle = await openManagedFixture(fixture.realRoot, "root-final-link-core-session");
  try {
    assert.ok(inspectManagedRoleSessionEvidence({ projectRoot: fixture.realRoot, sessionId: "root-final-link-core-session" }),
      "真实规范的会话根本身必须命中");
    assert.equal(inspectManagedRoleSessionEvidence({ projectRoot: finalLink, sessionId: "root-final-link-core-session" }), undefined,
      "最终根自身为符号链接的书写形式必须拒绝（与 noncanonical-project-root 同立场）");
    assert.equal(inspectManagedRoleSessionEvidence({ projectRoot: path.join(fixture.realParent, "does-not-exist"), sessionId: "root-final-link-core-session" }), undefined,
      "不可解析的请求根不得命中");
  } finally { await handle.dispose(); }
  const disposedEvidence = inspectManagedRoleSessionEvidence({ projectRoot: fixture.realRoot, sessionId: "root-final-link-core-session" });
  assert.equal(disposedEvidence?.disposed, true, "dispose 后的句柄证据仍按真实根归属（disposed 事实如实为真）");
});

test("B3-2：Windows 8.3 短名拼写与规范长名命中同一托管证据；不同真实根仍拒绝", async t => {
  if (process.platform !== "win32") { t.skip("8.3 short names only exist on Windows"); return; }
  const scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ans-orch-root-83-")));
  t.after(async () => { await fs.rm(scratch, { recursive: true, force: true }); });
  const realRoot = path.join(scratch, "project-with-a-long-directory-name");
  const foreignRoot = path.join(scratch, "foreign-with-a-long-directory-name");
  await fs.mkdir(realRoot); await fs.mkdir(foreignRoot);
  const shortRoot = shortPathOf(realRoot), shortForeign = shortPathOf(foreignRoot);
  if (!shortRoot || shortRoot.toLowerCase() === realRoot.toLowerCase()) { t.skip("8.3 short names are disabled on this volume"); return; }
  assert.notEqual(shortRoot.toLowerCase(), realRoot.toLowerCase(), "fixture: 短名与长名必须是两种拼写");
  assert.equal(await fs.realpath(shortRoot), await fs.realpath(realRoot), "fixture: 短名与长名必须指向同一真实根");
  const handle = await openManagedFixture(shortRoot, "root-83-core-session");
  try {
    const viaShort = inspectManagedRoleSessionEvidence({ projectRoot: shortRoot, sessionId: "root-83-core-session" });
    const viaReal = inspectManagedRoleSessionEvidence({ projectRoot: realRoot, sessionId: "root-83-core-session" });
    assert.ok(viaShort, "会话输入根的 8.3 短名拼写必须命中自己的托管句柄（CI Windows 23 名 staleParent 的根因）");
    assert.ok(viaReal, "规范长名拼写必须命中同一句柄");
    assert.deepEqual(viaShort, viaReal);
    assert.equal(viaShort.projectRoot, await fs.realpath(realRoot));
    if (shortForeign) assert.equal(inspectManagedRoleSessionEvidence({ projectRoot: shortForeign, sessionId: "root-83-core-session" }), undefined,
      "另一真实根的短名拼写不得命中（fail-closed，不因短名归一放宽跨根）");
    t.diagnostic(JSON.stringify({ platform: process.platform, shortRoot, realRoot, evidenceRoot: viaShort.projectRoot }));
  } finally { await handle.dispose(); }
});

