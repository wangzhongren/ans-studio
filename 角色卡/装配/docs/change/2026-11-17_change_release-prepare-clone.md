---
id: v2.1.0-release-prepare-clone-20261117
type: change
title: v2.1.0 发布阻断修复：冻结源装配由 linked worktree 改为普通本地 clone
created: "2026-11-17"
updated: "2026-11-17"
timezone: Asia/Shanghai
status: implemented
related: []
events:
  - date: "2026-11-17"
    kind: created
    summary: R10 归因后按协调者批准方案 A 修改 release-prepare.mjs——旧 worktree 注册清理 + 本地 clone + checkout，overlay 应用与 provenance 逐项不变
  - date: "2026-11-17"
    kind: verified
    summary: 本机 A/B（同提交 59a5e1a：linked worktree real-entry 11/16、clone 16/16）；fix 工作树 packaging 22/22、typecheck 0；clone 内 real-entry 16/16、main 4/4、packaging 22/22；已注册 worktree 重跑清理路径通过
---

# v2.1.0 发布阻断修复：冻结源装配改用普通本地 clone

改动位于发布流水线的冻结源装配步骤，是打包流程的内部实现替换；稳定功能说明见[桌面运行包构建与发布](../feature/desktop-release-packaging.md)。本记录只讲变化部分，稳定用法（冻结 tag + 精确 overlay、三平台构建、provenance）不变。

- **用户可见入口**：`release.yml` 步骤「Assemble frozen source and explicit overlay」→ `node src/common/装配/release-prepare.mjs`。
- **实际代码位置**：`src/common/装配/release-prepare.mjs` 第 18–41 行（旧状态清理 + 本地 clone + checkout；第 37 行 clone、第 41 行 checkout）；第 42 行 overlay 应用与第 43–49 行 `write-tree` / provenance / 写出物**逐字未动**。

## 根因与证据（R10 归因）

- 发布 CI run **44024770189**（build ref `59a5e1a`，tag `v2.1.0`）**arm64 Regression 26 名失败**，全部落在旧 B0 191 / B7 190 基线内；错误含 `runtime-creation-prepared-api-unavailable`（`run-role.ts:844`：`requirement.state !== "unmanaged"`）与 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,custom-provider-factory-unverified`。
- 根因：旧装配用 `git worktree add --detach .release/source <SOURCE_SHA>`，`.release/source/.git` 是**链接工作树文件**（`gitdir:` 指针）而非目录；产品 protection scope 对 linked worktree 判 unknown 并 fail-closed，测试在该冻结树内运行即红。
- A/B 实证（同一提交 `59a5e1a`、同机、本轮复现）：linked worktree 内 `test/测试/real-entry.test.ts` **11/16**（5 fail，错误与 CI 同因）；普通 clone（`.git` 为目录）**16/16 全绿**。

## 改动（位置 → 改动）

以前：

```js
execFileSync('git', ['worktree', 'add', '--detach', target, sourceSha], { stdio: 'inherit' });
```

现在（`release-prepare.mjs` 第 18–41 行）：

1. **旧状态清理**（第 28–35 行）：若 `.release/source` 已存在，先解析 `git worktree list --porcelain`，以 native realpath 规范化比对目标路径——是**已注册 worktree** 则 `git worktree remove --force <target>`（旧实现留下的注册必须一并移除）；非注册残留（中断的 clone 等）则 `fs.rmSync(target, { recursive: true, force: true })`。
2. `git worktree prune`（第 36 行）：清掉失效注册。
3. **本地 clone**（第 37 行）：`git clone --local --no-checkout --quiet <git rev-parse --show-toplevel> <target>`——`--local` 硬链接对象，`--no-checkout` 后精确 checkout。
4. `git -C <target> config core.longpaths true`（第 40 行）：新 clone 只有自己的本地配置（见披露），与发布 CI 的全局 `core.longpaths true` 对齐。
5. **checkout**（第 41 行）：`git -C <target> checkout --detach <sourceSha>`。
6. **overlay 原样应用**（第 42 行，未改）：`git -C <target> apply --index --binary -`。

不改变的部分：`release.yml`、`release-policy.mjs` / `.d.mts`、`package.json` / `package-lock.json`、其它产品与测试文件**零改动**；产品门禁、fail-closed/excluded 语义、测试断言均未放宽——本修复只替换冻结树的工作树载体（让 `.git` 是真实目录），不改变任何被检查的内容。

## provenance 等价论证

- `release-provenance.json` 的 `sourceRef / sourceSha / overlaySha / actualTree / overlayPaths / overlayPatchSha256 / excludedChanges / runUrl` 字段与 `.release/overlay.patch`、console JSON 输出**逐项保留**；本次只改工作树生成方式，这些字段的产生逻辑未动。
- git 对象按内容寻址：对同一 `sourceSha` 执行 `checkout --detach` 得到同一棵树，`apply --index` 应用同一份二进制 diff 后 index 与旧方式相同，`write-tree` 结果相同。
- 本机两次装配（首次空目录 clone；第二次先删除并模拟「旧实现留下的已注册 linked worktree」再重跑）产出**逐字节相同**的 provenance：`actualTree = ee3c0730a5df5848e4d79d9c332e8cb0d278b362`、`overlayPatchSha256 = 2adb7539df120714ec4649c4c6d1e5037c9698e3dbe34b000911f93f7ea0f51b`。
- 本轮样例（`c289309`（tag v2.1.0）→ `59a5e1a`（origin/main）的实际 diff，4 文件；`package.json`/`package-lock.json` 本轮不在 diff 中）：

```json
{
  "sourceRef": "v2.1.0",
  "sourceSha": "c289309883c7fd2529312519de16d86ccc69d7bb",
  "overlaySha": "59a5e1a99a3706728511fa189ccaf60c5064d8dc",
  "actualTree": "ee3c0730a5df5848e4d79d9c332e8cb0d278b362",
  "overlayPaths": [
    ".github/workflows/release.yml",
    "src/common/装配/release-policy.d.mts",
    "src/common/装配/release-policy.mjs",
    "test/装配/release-packaging.test.ts"
  ],
  "overlayPatchSha256": "2adb7539df120714ec4649c4c6d1e5037c9698e3dbe34b000911f93f7ea0f51b",
  "excludedChanges": []
}
```

## 本地验证（Windows 本机）

环境：Node v24.22.1、git 2.55.0.windows.5；工作树 `.claude/worktrees/fix-release-prepare-clone`（分支 `fix/release-prepare-clone`，HEAD `59a5e1a`，本地 tag `v2.1.0` → `c289309`）。

| 检查 | 命令 / 位置 | 结果 |
| --- | --- | --- |
| 打包测试（fix 工作树） | `node --test --test-concurrency=1 --test-timeout=120000 "test/装配/release-packaging.test.ts"` | 22 tests / **22 pass** / 0 fail |
| 装配 | `node src/common/装配/release-prepare.mjs v2.1.0` | exit 0；`.release/source/.git` 为**目录**（`-d` 成立）；`.release/overlay.patch` 生成（10,053 B） |
| provenance 字段 | `.release/source/release-provenance.json` | 7 字段齐全；`actualTree` 40 位十六进制；`overlayPaths` 见上（含 `release.yml`、`src/common/装配/` 与 `test/装配/` 条目） |
| 冻结树 real-entry | `.release/source` 内跑 `test/测试/real-entry.test.ts` | 16 tests / **16 pass** / 0 fail |
| 冻结树装配主测试 | `.release/source` 内跑 `test/装配/main.test.ts` | 4 tests / **4 pass** / 0 fail |
| 冻结树打包测试 | `.release/source` 内跑 `test/装配/release-packaging.test.ts` | 22 tests / **22 pass** / 0 fail |
| A/B 对照（linked worktree） | 临时 `git worktree add --detach` 的 `59a5e1a` 树内跑 `test/测试/real-entry.test.ts` | 16 tests / **11 pass / 5 fail**；`.git` 为 `gitdir:` 指针文件 |
| 类型门禁 | fix 工作树 `npm run typecheck` | exit **0**（`tsc --noEmit` 无诊断） |
| 已注册 worktree 重跑 | 将 `.release/source` 换成已注册 linked worktree 后重跑 prepare | 旧注册被 `git worktree remove --force` 移除（`git worktree list` 中该路径计数 0）、重新 clone 后 `.git` 为目录、provenance 与首跑逐字节一致 |

A/B 的 5 个失败用例与错误（linked worktree，同 CI 同因）：

- `ans role run 编排 --task T-1 以 0 结束`、`演示输出含角色/边界来源、两笔写入、按根分组、settled`、`演示**不产生新的** docs/scheduling 记录、也不改写既有管理记录(F3)`、`runCli 默认擦洗——跑测进程的 ANS_RUNTIME 与 Pi 凭据不传给子进程（哨兵值实测）`：`ans role run 会话失败：runtime-creation-prepared-api-unavailable`；
- `govern 缺真实 Pi 适配器 provider 配置（环境已擦洗：ANS_PI_*/凭据/ANS_RUNTIME 不入子进程）`：`ans govern 失败：runtime-creation-admission-unproven:runtime-protection-scope-unknown`。

## 清理与留痕

- 验证后删除 `.release/source`（大目录）与临时 `.release/linked-ab`（`git worktree remove --force`），并 `git worktree prune`；`git worktree list --porcelain` 中 `.release` 相关注册数为 **0**。
- fix 工作树 `git status --short` 仅 `M src/common/装配/release-prepare.mjs`（+ 本记录 untracked）；`.release/` 已在 `.gitignore` 第 7 行，无生成物入库。
- 未 commit / push、未触发 CI、未打 tag（本地 tag `v2.1.0` 保持指向 `c289309`）、未碰 main、未读 `.env`、未占用 9222/9223/9224。

## 证据边界与披露

- **core.longpaths 一行为本轮补充**：本机来源仓库的 `core.longpaths=true` 是**本地**配置，新 clone 不会继承；首次本机装配在 checkout 时因 Windows MAX_PATH（`角色卡/` 下证据目录的长文件名）失败。发布 CI 以 `git config --global core.longpaths true` 全局打开长路径，不受影响；脚本在 clone 内显式设置同一配置，使本机与 CI 的 checkout/overlay 路径一致。对 CI 行为无变化。
- **依赖来源**：冻结树未执行 `npm ci`；测试通过 Node 向上查找使用主仓 `C:\Users\51054\Desktop\work\ans-studio\node_modules`（fix 工作树位于其下）。发布 CI 仍按其自身步骤在 `.release/source` 内 `npm ci`，未在本轮验证。
- **未运行**：`build:renderer`、`npm run package`、完整 T3 回归、CI；这些由发布 workflow 作为独立门执行。本修复**已实现并本地验证，尚未 commit/合并/独立验收/发布**。
- 本次改动尚未进入 HEAD，因此本轮本地 overlay diff（基于 HEAD `59a5e1a`）不含新 `release-prepare.mjs` 内容；合并后 `src/common/装配/` 属白名单目录，overlay 会按既有机制把本文件带入后续冻结树。
