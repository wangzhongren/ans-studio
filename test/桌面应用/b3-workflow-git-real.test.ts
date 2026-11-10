// test/桌面应用/b3-workflow-git-real.test.ts
// T3「两条固定工作流路径」B3（2026-11-10，桌面窗口）：**真实 Git 端口**（`ReleaseGitPort`/`BaselineGitPort`）。
// 覆盖 B1 验收 AC-10/AC-11/AC-14/AC-15/AC-16/AC-22、T-07/T-10/T-12 的桌面端口层：
//   · ensureRepository：git init -b main（新仓库）/既有仓库 no-op/父仓库 `baseline-parent-repository-detected`/
//     路径 B 无仓库 `b-repository-required`（不自动 init）；仓库本地身份缺省；
//   · ensureGitignore：ans-managed 块 + 仅 `.gitignore` 的 baseline commit；幂等；被跟踪且 dirty
//     ⇒ `baseline-gitignore-dirty`；块不完整 ⇒ `baseline-gitignore-malformed`；用户内容保留；
//   · inspectWorktree：dirty 只算 tracked 修改/删除 + 非忽略 untracked（`.ans`/`node_modules` 被 ignore 不计）；
//   · prepareTaskBranch：从 main 建/同名冲突 fail-closed/同 workflow 复用（allowReuse）/路径 B 从 HEAD；
//   · inspectRepository/previewMerge：分支/HEAD/main OID、tracked/untracked、`.gitignore` hash、
//     files/fileCount/diffStat/diffDigest；
//   · mergeMain：main 存在 ⇒ `merge --no-ff`（工作区停在 main）；main unborn ⇒ initial（main=tip）；
//     冲突 ⇒ `release-merge-conflict` + `merge --abort` + 切回任务分支（不 force/reset/clean）；
//     项目级临界区占用 ⇒ `release-main-busy`；不 push/tag。
//
// 夹具为**真实临时 Git 仓库**（node:child_process 直接 git setup；端口自身固定 argv/sanitized env）；
// 不启动 Electron/真实模型；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  acquireProjectGitCriticalSection,
  createDesktopBaselineGitPort,
  createDesktopReleaseGitPort,
  projectGitCriticalSectionOwner,
} from "../../app/desktop/workflow-git.ts";
import { taskBranchName } from "../../src/common/编排/workflow-service.ts";
import type { GitOid } from "../../src/model/trunk.ts";

const WORKFLOW = "wf-b3git00000000000000000001";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

function initRepo(root: string, branch = "main"): void {
  git(root, "init", "-b", branch);
  git(root, "config", "user.name", "B3 Test");
  git(root, "config", "user.email", "b3@test.local");
  // 端口执行使用 sanitized env（不读用户全局 config）；夹具与端口同口径（autocrlf=false），
  // 避免宿主全局 core.autocrlf=true 造成的假 dirty。
  git(root, "config", "core.autocrlf", "false");
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

function oidOf(root: string, rev: string): GitOid {
  return { objectFormat: "sha1", hex: git(root, "rev-parse", rev) };
}

test("ensureRepository：git init -b main（新仓库）/既有仓库 no-op/父仓库检测/路径 B 无仓库不 init", async () => {
  const root = await tempRoot("ans-b3g-init-");
  const parentRoot = await tempRoot("ans-b3g-parent-");
  const childRoot = path.join(parentRoot, "child");
  const noRepoRoot = await tempRoot("ans-b3g-norepo-");
  try {
    const port = createDesktopBaselineGitPort();
    const created = await port.ensureRepository({ projectRoot: root, allowInit: true });
    assert.equal(created.ok, true, created.ok === false ? created.message : "");
    if (!created.ok) return;
    assert.equal(created.repository.state, "initialized");
    assert.equal(created.repository.branch, "main");
    assert.equal(created.repository.mainUnborn, true);
    assert.equal(created.repository.initialBranch, "main");
    assert.equal(created.repository.objectFormat, "sha1");
    assert.equal(created.repository.identityDefaultsApplied, true, "仓库本地身份缺省应写入");
    assert.equal(git(root, "config", "--local", "--get", "user.name"), "ANS");

    // 既有仓库：no-op（不再 init、不丢配置）。
    const existing = await port.ensureRepository({ projectRoot: root, allowInit: true });
    assert.equal(existing.ok, true);
    if (existing.ok) {
      assert.equal(existing.repository.state, "existing");
      assert.equal(existing.repository.mainUnborn, true);
    }

    // 路径 B：无仓库 ⇒ b-repository-required（不自动 init、零 `.git`）。
    const missing = await port.ensureRepository({ projectRoot: noRepoRoot, allowInit: false });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "b-repository-required");
    await assert.rejects(fs.stat(path.join(noRepoRoot, ".git")));

    // 父仓库检测：子目录在父仓库工作树内 ⇒ baseline-parent-repository-detected（不嵌套初始化）。
    initRepo(parentRoot);
    await fs.mkdir(childRoot, { recursive: true });
    const nested = await port.ensureRepository({ projectRoot: childRoot, allowInit: true });
    assert.equal(nested.ok, false);
    if (!nested.ok) assert.equal(nested.code, "baseline-parent-repository-detected");
    await assert.rejects(fs.stat(path.join(childRoot, ".git")));
  } finally {
    await cleanup(root);
    await cleanup(parentRoot);
    await cleanup(noRepoRoot);
  }
});

test("ensureGitignore：ans-managed 块 + 仅 .gitignore 的 baseline commit；幂等；dirty/malformed fail-closed", async () => {
  const root = await tempRoot("ans-b3g-ignore-");
  const dirtyRoot = await tempRoot("ans-b3g-ignore-dirty-");
  const malformedRoot = await tempRoot("ans-b3g-ignore-malformed-");
  try {
    const port = createDesktopBaselineGitPort();
    // 用户既有内容保留 + 未跟踪 `.gitignore` ⇒ 写块并 baseline commit（仅 .gitignore）。
    initRepo(root);
    await writeFile(root, ".gitignore", "user-local/\n");
    const first = await port.ensureGitignore({ projectRoot: root });
    assert.equal(first.ok, true, first.ok === false ? first.message : "");
    if (!first.ok) return;
    assert.equal(first.changed, true);
    assert.equal(first.committed, true);
    const ignoreText = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(ignoreText, /user-local\//);
    assert.match(ignoreText, /# >>> ans managed >>>/);
    assert.match(ignoreText, /# <<< ans managed <<</);
    assert.match(ignoreText, /\.ans\//);
    assert.match(ignoreText, /角色卡\//);
    assert.equal(git(root, "status", "--porcelain"), "", "baseline commit 后工作区 clean");
    const commitFiles = git(root, "show", "--name-only", "--format=", "HEAD").split("\n").filter((name) => name !== "");
    assert.deepEqual(commitFiles, [".gitignore"], "baseline commit 只含 .gitignore");
    // 幂等：第二次不要再改/再 commit。
    const second = await port.ensureGitignore({ projectRoot: root });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.changed, false);
    assert.equal(second.committed, false);
    assert.equal(second.sha256, first.sha256);

    // 被跟踪且有未提交修改 ⇒ baseline-gitignore-dirty（不覆盖用户改动）。
    initRepo(dirtyRoot);
    const seeded = await port.ensureGitignore({ projectRoot: dirtyRoot });
    assert.equal(seeded.ok, true);
    await fs.appendFile(path.join(dirtyRoot, ".gitignore"), "# local edit\n", "utf8");
    const dirty = await port.ensureGitignore({ projectRoot: dirtyRoot });
    assert.equal(dirty.ok, false);
    if (!dirty.ok) assert.equal(dirty.code, "baseline-gitignore-dirty");

    // 块标记不完整 ⇒ baseline-gitignore-malformed。
    initRepo(malformedRoot);
    await writeFile(malformedRoot, ".gitignore", "# >>> ans managed >>>\n.ans/\n");
    const malformed = await port.ensureGitignore({ projectRoot: malformedRoot });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.code, "baseline-gitignore-malformed");
  } finally {
    await cleanup(root);
    await cleanup(dirtyRoot);
    await cleanup(malformedRoot);
  }
});

test("inspectWorktree：dirty 只算 tracked 修改/删除 + 非忽略 untracked（.ans/node_modules 被 ignore 不计）", async () => {
  const root = await tempRoot("ans-b3g-worktree-");
  try {
    const port = createDesktopBaselineGitPort();
    initRepo(root);
    await writeFile(root, "src/app.ts", "export const a = 1;\n");
    const ensured = await port.ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "baseline src");
    // 忽略面：.ans/**、node_modules/** 不计 dirty。
    await writeFile(root, ".ans/state/tasks.jsonl", "{}\n");
    await writeFile(root, "node_modules/pkg/index.js", "x\n");
    const cleanIgnored = await port.inspectWorktree({ projectRoot: root });
    assert.equal(cleanIgnored.ok, true);
    if (!cleanIgnored.ok) return;
    assert.equal(cleanIgnored.trackedChanges, 0);
    assert.deepEqual(cleanIgnored.untracked, []);
    assert.equal(cleanIgnored.branch, "main");
    // tracked 修改 + 非忽略 untracked。
    await writeFile(root, "src/app.ts", "export const a = 2;\n");
    await writeFile(root, "src/extra.ts", "export const b = 1;\n");
    const dirty = await port.inspectWorktree({ projectRoot: root });
    assert.equal(dirty.ok, true);
    if (!dirty.ok) return;
    assert.equal(dirty.trackedChanges, 1);
    assert.deepEqual(dirty.untracked, ["src/extra.ts"]);
  } finally {
    await cleanup(root);
  }
});

test("prepareTaskBranch：从 main 建/同名冲突 baseline-branch-exists/同 workflow 复用/路径 B 从 HEAD", async () => {
  const root = await tempRoot("ans-b3g-branch-");
  const headRoot = await tempRoot("ans-b3g-branch-head-");
  try {
    const port = createDesktopBaselineGitPort();
    initRepo(root);
    await writeFile(root, "README.md", "# r\n");
    const ensured = await port.ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "baseline");
    const mainOid = git(root, "rev-parse", "HEAD");
    const created = await port.prepareTaskBranch({ projectRoot: root, workflowId: WORKFLOW, base: "main", allowReuse: false });
    assert.equal(created.ok, true, created.ok === false ? created.message : "");
    if (!created.ok) return;
    assert.equal(created.branch, taskBranchName(WORKFLOW));
    assert.equal(created.reused, false);
    assert.equal(created.baseOid?.hex, mainOid);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WORKFLOW));
    // 同名分支 + allowReuse=false ⇒ baseline-branch-exists（不删除/不强推）。
    git(root, "switch", "main");
    const conflict = await port.prepareTaskBranch({ projectRoot: root, workflowId: WORKFLOW, base: "main", allowReuse: false });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "baseline-branch-exists");
    // 同 workflow allowReuse=true ⇒ 复用（切回自有分支）。
    const reused = await port.prepareTaskBranch({ projectRoot: root, workflowId: WORKFLOW, base: "main", allowReuse: true });
    assert.equal(reused.ok, true);
    if (!reused.ok) return;
    assert.equal(reused.reused, true);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WORKFLOW));

    // 路径 B：既有仓库在非 main 分支 ⇒ 从当前 HEAD 建（不强制 main）。
    initRepo(headRoot, "work");
    await writeFile(headRoot, "README.md", "# head\n");
    const headCommit = commitAll(headRoot, "work head");
    const fromHead = await createDesktopBaselineGitPort().prepareTaskBranch({
      projectRoot: headRoot, workflowId: WORKFLOW, base: "head", allowReuse: false,
    });
    assert.equal(fromHead.ok, true, fromHead.ok === false ? fromHead.message : "");
    if (fromHead.ok) assert.equal(fromHead.baseOid?.hex, headCommit);
    assert.equal(git(headRoot, "symbolic-ref", "--short", "HEAD"), taskBranchName(WORKFLOW));
  } finally {
    await cleanup(root);
    await cleanup(headRoot);
  }
});

async function seedMergeRepo(root: string): Promise<{ base: GitOid; tip: GitOid; branch: string }> {
  initRepo(root);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3\n");
  await writeFile(root, "src/old.ts", "old\n");
  const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  assert.equal(ensured.ok, true);
  commitAll(root, "main base");
  const base = oidOf(root, "HEAD");
  const branch = taskBranchName(WORKFLOW);
  git(root, "switch", "-c", branch);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3-changed\n");
  await writeFile(root, "src/new.ts", "new\n");
  const tipHex = commitAll(root, "task change");
  return { base, tip: { objectFormat: "sha1", hex: tipHex }, branch };
}

test("inspectRepository/previewMerge：分支/HEAD/main OID、dirty 事实、files/fileCount/diffStat/diffDigest", async () => {
  const root = await tempRoot("ans-b3g-preview-");
  try {
    const { base, tip, branch } = await seedMergeRepo(root);
    const port = createDesktopReleaseGitPort();
    const facts = await port.inspectRepository({ projectRoot: root });
    assert.equal(facts.ok, true, facts.ok === false ? facts.message : "");
    if (!facts.ok) return;
    assert.equal(facts.facts.branch, branch);
    assert.equal(facts.facts.headOid.hex, tip.hex);
    assert.equal(facts.facts.mainOid?.hex, base.hex);
    assert.equal(facts.facts.trackedChanges, 0);
    assert.deepEqual(facts.facts.untracked, []);
    assert.equal(facts.facts.gitignoreTrackedDirty, false);
    assert.match(facts.facts.gitignoreSha256 ?? "", /^[a-f0-9]{64}$/);
    const preview = await port.previewMerge({ projectRoot: root, mainOid: base, tipOid: tip });
    assert.equal(preview.ok, true, preview.ok === false ? preview.message : "");
    if (!preview.ok) return;
    assert.equal(preview.fileCount, 2);
    const byPath = new Map(preview.files.map((file) => [file.path, file.status]));
    assert.equal(byPath.get("src/app.ts"), "M");
    assert.equal(byPath.get("src/new.ts"), "A");
    assert.match(preview.diffStat, /2 files changed/);
    assert.match(preview.diffDigest, /^[a-f0-9]{64}$/);
  } finally {
    await cleanup(root);
  }
});

test("mergeMain（main 已存在）：merge --no-ff 合并到 main；工作区停在 main；不 push/tag", async () => {
  const root = await tempRoot("ans-b3g-merge-");
  try {
    const { base, tip, branch } = await seedMergeRepo(root);
    const port = createDesktopReleaseGitPort();
    const merged = await port.mergeMain({
      projectRoot: root, workflowId: WORKFLOW, flowId: "snake", branch, baseOid: base, tipOid: tip, mergeKind: "merge",
    });
    assert.equal(merged.ok, true, merged.ok === false ? merged.message : "");
    if (!merged.ok) return;
    assert.equal(merged.mergeKind, "merge");
    assert.equal(merged.tipOid.hex, tip.hex);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main", "工作区停在 main");
    assert.equal(git(root, "rev-parse", `HEAD^2`), tip.hex, "--no-ff 合并提交的第二父为任务分支 tip");
    assert.equal(await fs.readFile(path.join(root, "src", "app.ts"), "utf8"), "line-1\nshared\nline-3-changed\n");
    assert.equal(await fs.readFile(path.join(root, "src", "new.ts"), "utf8"), "new\n");
    // 不 push / 不打 tag：本地 refs 只有 main 与任务分支，无 tag。
    assert.equal(git(root, "tag"), "");
    // 幂等由服务层 release:<wf>:<tip> 处理；端口只做本地合并。
  } finally {
    await cleanup(root);
  }
});

test("mergeMain（main unborn）：initial ⇒ main 创建于任务分支 tip", async () => {
  const root = await tempRoot("ans-b3g-initial-");
  try {
    initRepo(root, "work");
    await writeFile(root, "src/app.ts", "hello\n");
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    const tipHex = commitAll(root, "work base");
    const port = createDesktopReleaseGitPort();
    const branch = taskBranchName(WORKFLOW);
    const created = await createDesktopBaselineGitPort().prepareTaskBranch({
      projectRoot: root, workflowId: WORKFLOW, base: "head", allowReuse: false,
    });
    assert.equal(created.ok, true);
    const tip = { objectFormat: "sha1" as const, hex: tipHex };
    const merged = await port.mergeMain({
      projectRoot: root, workflowId: WORKFLOW, flowId: "snake", branch, baseOid: null, tipOid: tip, mergeKind: "initial",
    });
    assert.equal(merged.ok, true, merged.ok === false ? merged.message : "");
    if (!merged.ok) return;
    assert.equal(merged.mergeKind, "initial");
    assert.equal(merged.mergeOid.hex, tipHex);
    assert.equal(git(root, "rev-parse", "refs/heads/main"), tipHex);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main");
  } finally {
    await cleanup(root);
  }
});

test("mergeMain 冲突：release-merge-conflict + merge --abort + 切回任务分支（不 force/reset/clean）", async () => {
  const root = await tempRoot("ans-b3g-conflict-");
  try {
    initRepo(root);
    await writeFile(root, "src/app.ts", "v1\n");
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "base");
    const branch = taskBranchName(WORKFLOW);
    git(root, "switch", "-c", branch);
    await writeFile(root, "src/app.ts", "branch-side\n");
    const tipHex = commitAll(root, "branch side");
    git(root, "switch", "main");
    await writeFile(root, "src/app.ts", "main-side\n");
    commitAll(root, "main side");
    const mainAfter = git(root, "rev-parse", "HEAD");
    git(root, "switch", branch); // 真实流程：应用从任务分支执行合并（preview/前置要求当前分支=任务分支）

    const merged = await createDesktopReleaseGitPort().mergeMain({
      projectRoot: root, workflowId: WORKFLOW, flowId: "snake", branch,
      baseOid: { objectFormat: "sha1", hex: mainAfter }, tipOid: { objectFormat: "sha1", hex: tipHex }, mergeKind: "merge",
    });
    assert.equal(merged.ok, false);
    if (!merged.ok) assert.equal(merged.code, "release-merge-conflict");
    // 不 force/reset/clean：main 未变；工作区回到任务分支且 clean；无进行中的 merge。
    assert.equal(git(root, "rev-parse", "refs/heads/main"), mainAfter);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), branch, "冲突后切回任务分支");
    assert.equal(git(root, "status", "--porcelain"), "", "merge --abort 后工作区 clean");
    const mergeHead = await fs.stat(path.join(root, ".git", "MERGE_HEAD")).then(() => true, () => false);
    assert.equal(mergeHead, false, "无进行中的 merge");
  } finally {
    await cleanup(root);
  }
});

test("mergeMain：项目级临界区被占用 ⇒ release-main-busy（不并发合并）", async () => {
  const root = await tempRoot("ans-b3g-busy-");
  try {
    const { base, tip, branch } = await seedMergeRepo(root);
    const release = acquireProjectGitCriticalSection(root, "test-holder");
    assert.ok(release !== undefined);
    try {
      assert.equal(projectGitCriticalSectionOwner(root), "test-holder");
      const busy = await createDesktopReleaseGitPort().mergeMain({
        projectRoot: root, workflowId: WORKFLOW, flowId: "snake", branch, baseOid: base, tipOid: tip, mergeKind: "merge",
      });
      assert.equal(busy.ok, false);
      if (!busy.ok) assert.equal(busy.code, "release-main-busy");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), branch, "未开始合并（仍停在任务分支）");
    } finally {
      release!();
    }
    assert.equal(projectGitCriticalSectionOwner(root), undefined);
    const merged = await createDesktopReleaseGitPort().mergeMain({
      projectRoot: root, workflowId: WORKFLOW, flowId: "snake", branch, baseOid: base, tipOid: tip, mergeKind: "merge",
    });
    assert.equal(merged.ok, true, merged.ok === false ? merged.message : "");
  } finally {
    await cleanup(root);
  }
});
