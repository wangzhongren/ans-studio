/**
 * macOS file-gate 回归钉（2026-11-16）：protection topology 不因目录 nlink 变化而失效。
 *
 * 背景：`write_file` 在 canonical-read 与 final-write 之间执行 `ensureParentDir`；首次写
 * `docs/product/...` 会在项目根下创建一级目录。POSIX/APFS 的目录 nlink = 2 + 直接子目录数，
 * 因此根目录 nlink 改变。旧 `protectionTopology().describe()` 把目录 nlink 纳入 digest，
 * final-write 的 `checkGitProtectionFactsCurrent` 复判误失败（file-gate-host-facts-unproven）。
 *
 * 本文件钉住三件事：
 * 1. present-repo（含 `.git`）根下创建一级目录后，已签发的 protection facts 仍 current；
 * 2. 目录 nlink +1 本身不改变 topology digest（Windows NTFS 目录 nlink 恒 1，用与编排
 *    2026-11-16 证据脚本相同的进程内 lstatSync 包装显式构造 POSIX mkdir 效果）；
 * 3. 普通文件 nlink 变化仍被检出拒绝（`.git/config` 硬链接 ⇒ facts 不 current），
 *    fail-closed 防护不放宽。
 *
 * lstatSync 包装必须在动态 import provider 之前安装：provider 以 ESM 命名导入 `lstatSync`，
 * 链接时取得包装后的函数（与 `_evidence/03-nlink-simulation.mjs` 同一机制）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { PathLike, Stats } from "node:fs";
import { link, lstat, mkdir, mkdtemp, realpath, rm, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

type SyncLstat = typeof import("node:fs").lstatSync;
const nodeFs = createRequire(import.meta.url)("node:fs") as { lstatSync: SyncLstat };
const realLstatSync = nodeFs.lstatSync as unknown as (file: PathLike, options?: object) => Stats;
/** 对哪一目录的 nlink 呈现 +1（POSIX mkdir 一级子目录的效果）；undefined = 不干预。 */
let bumpDirectoryNlink: string | undefined;
nodeFs.lstatSync = ((file: PathLike, options?: object): Stats => {
  const info = realLstatSync(file, options);
  if (bumpDirectoryNlink === undefined || String(file) !== bumpDirectoryNlink) return info;
  return new Proxy(info, { get: (target, key) => key === "nlink" ? target.nlink + 1 : Reflect.get(target, key, target) });
}) as unknown as SyncLstat;

const { initializeGitRepository, readGitProtectionFacts, checkGitProtectionFactsCurrent } =
  await import("../../src/provider/trunk/public/trunk-store.ts");

async function presentRepo(prefix: string): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await initializeGitRepository(root);
  return { root, cleanup: async () => { await rm(root, { recursive: true, force: true }); } };
}

test("macOS file-gate：present-repo 根下创建一级目录后 protection facts 仍 current", async t => {
  const fixture = await presentRepo("ans-nlink-mkdir-");
  t.after(fixture.cleanup);
  const facts = await readGitProtectionFacts(fixture.root);
  assert.equal(facts.coverage, "complete", JSON.stringify(facts.reasons));
  const before = await lstat(fixture.root);
  await mkdir(join(fixture.root, "docs"));
  const after = await lstat(fixture.root);
  if (process.platform === "win32")
    assert.equal(after.nlink, before.nlink, "Windows NTFS 目录 nlink 恒 1（nlink 机制样本由下一条模拟钉住）");
  else
    assert.equal(after.nlink, before.nlink + 1, "POSIX/APFS：创建一级子目录使根 nlink +1");
  assert.equal(checkGitProtectionFactsCurrent(facts), true, "普通 mkdir 不得使已签发的 Git protection facts 失效");
});

test("macOS file-gate：目录 nlink +1（POSIX mkdir 效果模拟）不进入 topology digest", async t => {
  const fixture = await presentRepo("ans-nlink-sim-");
  t.after(fixture.cleanup);
  const facts = await readGitProtectionFacts(fixture.root);
  assert.equal(facts.coverage, "complete", JSON.stringify(facts.reasons));
  assert.equal(checkGitProtectionFactsCurrent(facts), true, "fixture: 签发后、nlink 变化前必须 current");
  bumpDirectoryNlink = fixture.root;
  try {
    assert.equal(checkGitProtectionFactsCurrent(facts), true, "根目录 nlink +1 不得改变 protection topology digest");
  } finally { bumpDirectoryNlink = undefined; }
  assert.equal(checkGitProtectionFactsCurrent(facts), true, "nlink 恢复后仍 current");
});

test("macOS file-gate：普通文件 nlink 变化仍 fail-closed（.git/config 硬链接被拒绝）", async t => {
  const fixture = await presentRepo("ans-nlink-file-");
  t.after(fixture.cleanup);
  const facts = await readGitProtectionFacts(fixture.root);
  assert.equal(facts.coverage, "complete", JSON.stringify(facts.reasons));
  const config = join(fixture.root, ".git", "config"), probe = join(fixture.root, ".git", "config.nlink-probe");
  await link(config, probe);
  try {
    assert.equal((await lstat(config)).nlink, 2, "fixture: 硬链接使 config nlink 变为 2");
    assert.equal(checkGitProtectionFactsCurrent(facts), false, "config 文件 nlink ≠ 1 必须使 protection facts 不 current");
  } finally { await unlink(probe); }
  assert.equal((await lstat(config)).nlink, 1, "fixture: 移除硬链接后 config nlink 恢复 1");
  assert.equal(checkGitProtectionFactsCurrent(facts), true, "文件 nlink 防护可逆：恢复后重新 current");
});
