# B6a：测试债——git 子系统未归类 12 名（5 文件）定性、修复与 3× 验证

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/b6a`（分支 `fix/test-debt-b6a`，起点 `a0baea2` = `origin/main`，含 B3a #111 / B3b #112 / B3c #113 / B4 #114 / R4 #115）
- 范围：**只写 5 个测试文件 + 本记录 + 同名 `_evidence/`**；未修改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：
  - R4/R5 分析（R5 在 `origin/analysis/test-debt-r5` @ `5f5de74`，本工作树只读 `git show` 读取 `2026-11-16_remediation-plan-r5-update.md` 与 `_r5-evidence/11-families.json`；R5 确认 B6a 仍为 12 名 / 5 文件、三平台仍红）。
  - R5 CI（GitHub Actions run **43829367008**，`main @ a0baea2`，Node 24.14.0）三平台工件：`/tmp/r8-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（原始工件不入库，摘录见 `_evidence/07-r5-ci-error-excerpts-*.txt`）。
  - 本机复现环境：Windows 11 / Node v24.22.1 / Git 2.55.0；`node --test --test-timeout=120000 --test-force-exit`（`--test-force-exit` 仅本机防挂起；记录中的 run 均为自然退出）。
- 复现手段（关键）：CI 的 `os.tmpdir()` 可能是**非规范拼写**（macOS `/var` → `/private/var` 符号链接；Windows CI 的临时根拼写与真实根不同，例如 8.3 短名 `RUNNER~1` 对应产品侧 realpath 的 `runneradmin`，见 Windows 工件中产品路径 `C:\Users\runneradmin\...`）。本机用 **junction 临时根**（`TEMP=TMP=.../temp-link` → `real-temp`，见 `_evidence/02`）模拟该条件，3× 稳定复现全部 10 个 Windows-red 名（另 2 名为 macOS-only，本机不可复现）。

## 0. 摘要

1. **12 名全部定性为「测试装配过时」，未发现必须产品修复的确定性缺陷；产品候选 0 个。**
2. **10 名（sidecar 6 / git-command 2 / trunk-store 1 / run-role 1）同一根因**：夹具持有 `os.tmpdir()` 原始拼写，产品（v2.0.0/e71501c 后）以**真实根**做 `realpath(dir) === dir` 安全校验与事实返回（`git-command.ts` listGitOperationJournals:446、`git-trunk-store.ts` writeGitInitialWorkflowSource:215、`readGitProtectionFacts` 等）。非规范根下操作目录被判 `git-journal-directory-invalid` / stable-source 安装被拒 / 保护事实路径不一致。修复：5 处夹具根规范根化（`fs.realpath` / `fs.realpathSync`），不改产品、不放宽断言、不删用例。
3. **1 名（D3 lstat ENOTDIR，macOS-only）为错误文案过时**：现行守卫在 `finalFileProtection` 预检即拒绝，实际文案 `canonical identity unavailable; no write (ENOTDIR: not a directory, lstat '...')`，测试仍期望旧 fs-write 层「无法读取目标状态」。已把非 win32 期望更新为当前守卫文案；「拒绝 + ENOTDIR + 零落盘」断言保留。Windows 分支不变（本机 3× 绿、R5 Windows 绿）。
4. **1 名（Git final spawn fence，macOS-only）为平台文件系统事件时序，保留原样单列**：macOS FSEvents 延迟使中断落在后续 mutating 命令之前（`git-host-lease-invalid-before-command`），而测试假定中断落在 pending 写入→spawn 的最终窗口（`git-command-failed:null:unknown` + `cancelled-before-spawn`）。两路都是 fail-closed（不发布 ref、后续真实重试成功）；本机 Windows 正常/junction 均 3× 绿、R5 Windows 绿。无 macOS 本机环境，无法在不放宽断言/不删用例的前提下重写验证，故**不改**，列为平台时序残留待 macOS 定向复跑/owner 裁决。
5. **验证**：逐文件 3× 自然退出（见 §4）；正常环境与 junction（CI 形态）双口径；目标名 11/12 转绿（第 12 名单列分类）；其余名零变化、零新增；`npm run typecheck` **EXIT=0**。
6. **唯一异常披露**：`git-trunk-store.test.ts` 8 次运行中 1 次 Node 24.22.1 原生崩溃（`node::CleanupQueue::Add` 断言，async_hooks destroyTracking；非测试断言、非产品路径），随后 7 次连续全绿（含 junction 3×）；见 `_evidence/06-trunk-store-node-native-crash.txt`。CI Node 24.14.0 未出现该崩溃。

## 1. 范围 12 名与 R5 状态

| # | 名（缩写） | 文件 | R5 平台 | R5 首个错误 |
| ---: | --- | --- | --- | --- |
| 1-6 | I0-11 ×4 + I0-12 ×2 | `test/编排/git-operation-sidecar-tolerance.test.ts` | arm64+x64+win | `Error: git-journal-directory-invalid`（win 工件 L8602–8692） |
| 7 | Git final spawn fence… | `test/编排/git-command.test.ts` | arm64+x64（mac-only） | `/git-command-failed:null:unknown/` 实际 `git-host-lease-invalid-before-command` |
| 8 | Git init journal: restart discovery… | 同上 | arm64+x64+win | `assert.ok(listed.ok)` falsy |
| 9 | Git protection facts: actual independent roots… | 同上 | arm64+x64+win | `protectedGitRoots.includes(root/.git)` false !== true |
| 10 | Git operation media: restart enumeration… | `test/编排/git-trunk-store.test.ts` | arm64+x64+win | `assert.ok(all.ok)` falsy |
| 11 | Pipeline initial workflow source… | `test/编排/run-role-submit-capabilities.test.ts` | arm64+x64+win | ENOENT realpath `…/operations/<hash>/stable-source.json` |
| 12 | D3 lstat ENOTDIR is a status error… | `test/runtime-core/file-write-safety.test.ts` | arm64+x64（mac-only） | `/无法读取目标状态.*ENOTDIR/` 实际 `canonical identity unavailable; no write (ENOTDIR…)` |

逐名平台/错误/定性/处置见 `_evidence/01-scope-r5-status.tsv`；R5 原始错误体摘录见 `_evidence/07-r5-ci-error-excerpts-{windows,macos}.txt`。

## 2. 逐文件定性与改法

### 2.1 `test/编排/git-operation-sidecar-tolerance.test.ts`（6 名，测试装配）

- 定性：`gitTrunkRoot()` 用 `createTrunkProject().root`（`fs.mkdtemp(os.tmpdir())` 原始拼写）建真实 Git trunk。`listGitOperationJournals`（`src/provider/trunk/impl/git-command.ts:446`）对 64-hex 操作目录要求 `realpath(dir) === dir`；非规范根（macOS `/var`、Windows `RUNNER~1`）必然不等，直接抛 `git-journal-directory-invalid`，早于 sidecar 容忍分支（I0-11/I0-12），导致 6 名全部误红。产品 sidecar 容忍逻辑本身已实现且正确（本机规范根下 6/6 绿）。
- 改法：`gitTrunkRoot()` 对 `project.root` 取 `fs.realpath` 后再建夹具（真实临时根/真实账本/真实 sidecar 事实不变）。
- 断言：未改任何断言；6 个用例全部保留。

### 2.2 `test/编排/git-command.test.ts`（3 名：2 装配 + 1 单列）

- **Git init journal: restart discovery**（mac+win）：`createFsTrunkStore(root).listStorageOperations()` 内部走 `listGitOperationJournals(root)`，非规范根 → `git-journal-directory-invalid` → `{ok:false, reason:"corrupt"}`。改法：该用例根 `fs.realpath`。
- **Git protection facts: actual independent roots…**（mac+win）：`readGitProtectionFacts` 按真实根返回 `protectedGitRoots`（R5 证据里可见产品路径为 `C:\Users\runneradmin\...`），测试用 mkdtemp 原始拼写 `path.join(root,".git")` 比较 → false。改法：共享 `fixture()` 对 mkdtemp 根 `fs.realpath`；其余断言（hardlink→unknown、worktree 双向 protected roots）不变。
- **Git final spawn fence…**（mac-only）：见 §3。

### 2.3 `test/编排/git-trunk-store.test.ts`（1 名，测试装配）

- **Git operation media: restart enumeration…**（mac+win）：`restart.listStorageOperations!()` 同样因非规范根返回 corrupt，`assert.ok(all.ok)` 失败。改法：`fixture()` 根 `fs.realpath`；媒体枚举/同 id 重绑定拒绝/legacy 读取断言全部保留。

### 2.4 `test/编排/run-role-submit-capabilities.test.ts`（1 名，测试装配）

- **Pipeline initial workflow source…**（mac+win）：`writeGitInitialWorkflowSource`（`git-trunk-store.ts:215`）要求 `realpath(dir) === dir`；非规范根下返回 `workflow-source-directory-unsafe`，stable-source 未安装，测试随后 `readGitInitialWorkflowSource` 得到 ENOENT。改法：该用例根改为 `fs.realpathSync(fs.mkdtempSync(...))`；真实 Core 请求/批准/受门禁写入链与全部断言不变。

### 2.5 `test/runtime-core/file-write-safety.test.ts`（1 名，测试装配：文案）

- **D3 lstat ENOTDIR…**（mac-only）：R5 macOS 实际消息为
  `write_file 拒绝写入：[file-write-protection] canonical identity unavailable; no write (ENOTDIR: not a directory, lstat '<root>/file.txt/child.txt')`
  ——现行 `finalFileProtection` → `canonicalProtectionPath` 对 `lstat` 非 ENOENT（ENOTDIR）直接 fail-closed（`src/provider/runtime/tools.ts:607-615`），早于旧 fs-write 层文案。产品语义与测试名一致（ENOTDIR 是状态错误、绝不回退新建文件、零落盘）。
- 改法：`process.platform !== "win32"` 分支期望更新为 `/canonical identity unavailable; no write \(ENOTDIR/`；Windows 分支（ENOTDIR 或 建目录 EEXIST 两形态）不变；`readdir(root)===["file.txt"]` 与原文不变断言保留。
- 验证边界：该分支本机 Windows 不可执行；依据 R5 macOS 工件错误体更新，待下一轮 macOS CI 复核。

## 3. Git final spawn fence（mac-only，保留原样，单列平台时序残留）

- R5 macOS 实际：`AssertionError: The input did not match /git-command-failed:null:unknown/. Input: 'Error: git-host-lease-invalid-before-command'`，栈在 `executeGit … git-command.ts:724`（mutating 命令前的 host lease 终检）；R5 Windows 绿（本机 3× 绿）。
- 机制：测试用 `fs.watch(.git/ans/processes)` 在真实 pending 记录写入时调用 `recordGitHostInterruption`，期望中断命中「pending 写入后、spawn 前」的最终窗口（`executeGit:749`），从而记录 `launch=cancelled-before-spawn` + `git-command-failed:null:unknown`。macOS FSEvents 有延迟/合并，回调落在第一个 `hash-object -w` 完成之后、下一个 mutating 命令之前 → `executeGit:724` 抛 `git-host-lease-invalid-before-command`，且目录中已有 1 条 `started/exited` 进程事实。
- 语义判定：两路都是 fail-closed —— 不产生候选 ref（`update-ref` 不执行）、不伪造退出回执、后续真实重试可发布；差异仅是「中断落在哪个命令的边界」与对应错误码/进程事实。测试的 `files.length===1` + `cancelled-before-spawn` 断言只在 Windows 时序成立，属**平台时序假设**，不是产品契约缺陷（产品两路均有显式代码与注释）。
- 处置：**不改**（无 macOS 本机可验证；改为接受两码会放宽断言、改为 skip 会删覆盖）。单列残留，建议：
  1) 下一轮 macOS CI 观察是否稳定复现；
  2) 或在有 macOS 环境时做定向 3×，由 owner 裁定是否接受「两种 fail-closed 码 + 无 ref + 真实重试」的等价语义重写。
- 产品候选：**不计为产品缺陷**；仅记录「中断落点跨平台不一致」这一事实（`git-host-lease-invalid-before-command` vs `git-command-failed:null:unknown`）。

## 4. 3× 验证

口径：`node --test --test-timeout=120000 --test-force-exit <file>`；正常环境与 junction（CI 非规范根形态）双口径；`--test-force-exit` 仅本机防挂起，所有 run 自然退出（无超时/无挂起）。

### 4.1 正常环境（Windows 本机）

| 文件 | 3× 结果 | 说明 |
| --- | --- | --- |
| `git-operation-sidecar-tolerance.test.ts` | 6/6 pass ×3，EXIT=0 | 6 名全绿 |
| `git-command.test.ts` | 17/17 pass ×3，EXIT=0 | 含 spawn fence（Windows 绿） |
| `git-trunk-store.test.ts` | run1 Node 原生崩溃；runs 2–8 连续 13/13 pass ×7，EXIT=0 | 崩溃为 Node 24.22.1 CleanupQueue 断言（见 §0.6/证据 06），非断言失败 |
| `run-role-submit-capabilities.test.ts` | 14/14 pass ×3，EXIT=0 | 整文件 |
| `file-write-safety.test.ts` | pass 6 / fail 1 / skipped 4 ×3（EXIT=1） | 唯一失败为 known-red-62「D3 linked workspace…」（EPERM symlink，CI 双平台同红，非 B6a）；D3 ENOTDIR ✔；零新增 |

### 4.2 junction 临时根（CI 非规范根形态）

| 文件 | 3× 结果 |
| --- | --- |
| `git-operation-sidecar-tolerance.test.ts` | 6/6 pass ×3 |
| `git-command.test.ts` | 17/17 pass ×3 |
| `git-trunk-store.test.ts` | 13/13 pass ×3 |
| `run-role-submit-capabilities.test.ts`（目标名） | 1/1 pass ×3 |
| `file-write-safety.test.ts` | 与正常基线一致（pass 6 / fail 1 / skipped 4 ×3，零新增） |

### 4.3 typecheck

`npm run typecheck` → **EXIT=0**（`_evidence/05-typecheck.log`）。

### 4.4 基线 → 修复后对照

- junction 基线（修复前）：sidecar 6 fail ×3；git-command 2 fail ×3；trunk-store 1 fail ×3；run-role 目标 1 fail ×3（`_evidence/02`）。
- junction 修复后：上述 10 名全部转绿 3×（`_evidence/04`）。
- 正常环境：修改前 5 文件与修改后失败集合一致（file-write-safety 仅既有 known-red-62），**零新增**。

## 5. 转绿/剩余名与产品候选

- **转绿（装配修复）**：11 名 —— sidecar 6 + Git init journal + Git protection facts + Git operation media + Pipeline initial workflow source（10 名由规范根修复；D3 ENOTDIR 由文案更新，按 CI 证据待复核，Windows 分支原本即绿）。
- **剩余/单列（1 名）**：Git final spawn fence（macOS-only 平台时序；保留原样，待 macOS 定向复跑）。
- **产品候选**：无新增。未发现确定性产品缺陷；`git-host-lease-invalid-before-command` 与 `git-command-failed:null:unknown` 的跨平台落点差异仅记录，不排修。
- **其余名不变**：5 文件中除上述 12 名外的用例在正常环境零变化；`file-write-safety` 的 known-red-62「D3 linked workspace…」为既有基线（R5 `11-families.json` known-red-62，CI mac+win 同红），本批未触碰。

## 6. 约束与证据边界

1. 只改 5 个允许测试文件（`git status` 仅 5 M；diff 20 insertions / 7 deletions，见 `_evidence/08-fix.diff`）；本记录与 `_evidence/` 为新增文档。
2. 未改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。
3. 本机为 Windows，macOS-only 的 D3 ENOTDIR 与 spawn fence 无法在本机执行/复现；两者结论分别来自 R5 macOS 工件错误体与代码路径分析。
4. junction 模拟的是「非规范拼写指向同一真实根」这一 CI 环境特征（macOS `/var` 符号链接、Windows `RUNNER~1` 短名），不是产品语义替代；修复后正常环境与 junction 双口径均验证。
5. Node 原生崩溃（trunk-store run1）为 Node 24.22.1 `node::CleanupQueue::Add` 断言，发生在 `lstat`/async_hooks destroyTracking 路径；与本次测试改动（仅在 mkdtemp 后加 realpath）无代码因果，且随后 7 次连续全绿（含 junction 3×）；CI Node 24.14.0 未出现。完整披露于 `_evidence/06`。
6. 工件为准：R5 错误体摘录自三平台工件；本机复现使用同一代码起点 `a0baea2`。

## 附录 A：证据索引（`2026-11-16_test-debt-b6a-git-subsystems_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-scope-r5-status.tsv` | 12 名逐名 R5 平台/错误、本机复现、定性、处置 |
| `02-baseline-repro-junction-3x.txt` | 修复前基线：junction 形态 3× 失败名/错误 |
| `03-after-normal-3x.tsv` | 修复后正常环境逐 run 结果（含 trunk-store 8 run） |
| `04-after-junction-3x.txt` | 修复后 junction（CI 形态）3× 结果 |
| `05-typecheck.log` | `npm run typecheck` 输出（EXIT=0） |
| `06-trunk-store-node-native-crash.txt` | Node 原生崩溃摘录（run1） |
| `07-r5-ci-error-excerpts-windows.txt` / `07-r5-ci-error-excerpts-macos.txt` | R5 三平台工件原始错误体摘录 |
| `08-fix.diff` | 5 文件修复 diff |

## 附录 B：复现命令

```bash
# 正常环境 3×
node --test --test-timeout=120000 --test-force-exit test/编排/git-operation-sidecar-tolerance.test.ts
node --test --test-timeout=120000 --test-force-exit test/编排/git-command.test.ts
node --test --test-timeout=120000 --test-force-exit test/编排/git-trunk-store.test.ts
node --test --test-timeout=120000 --test-force-exit test/编排/run-role-submit-capabilities.test.ts
node --test --test-timeout=120000 --test-force-exit test/runtime-core/file-write-safety.test.ts

# junction（CI 非规范根形态）模拟
BASE=C:/Users/51054/AppData/Local/Temp/b6a-repro
mkdir -p "$BASE/real-temp"
node -e "require('fs').symlinkSync('$BASE/real-temp','$BASE/temp-link','junction')"
TEMP="$BASE/temp-link" TMP="$BASE/temp-link" node --test --test-timeout=120000 --test-force-exit <file>

# typecheck
npm run typecheck
```
