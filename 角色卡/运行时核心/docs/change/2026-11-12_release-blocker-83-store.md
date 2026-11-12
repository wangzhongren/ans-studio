# v2.0.0 发布阻断 B3-2c：git trunk store 控制路径的 8.3 短名根归一（2026-11-12）

- 角色：ANS「运行时核心」（roleId: 运行时核心）。
- 分支/工作树：`release/v2.0.0-blockers-5`，从 `origin/main` `6f96656`（PR #89 已合并）切出；
  工作树 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-5`。
- 声明：**未 push main、未打 tag、未触发 CI（未 `gh workflow run`）、未运行 Electron/未占用 9224**；
  只改本角色写区文件（见 §6）。未改 `app/**`、`src/common/编排/**`、`src/pipeline/**`、
  `src/common/门禁引擎/**`、`src/provider/trunk/impl/git-command.ts` 及其它角色记录。

## 1. 事实（承接 PR #89 / `6f96656`）

- B3-2b 已把 provider 的 host coordinator / authorization / protection topology / `executeGit`
  统一为 native realpath（`realpathSync.native`，展开 Windows 8.3 短名）；普通 TEMP 下
  W29×4/W30×2/W35 全绿，8.3 短名 TEMP 下 W29×3/W30×2 仍卡 **`git-control-path-unsafe`**
  （W29 missing-confirmation/W35 通过）。
- 根因：`src/provider/trunk/impl/git-trunk-store.ts` 的 `assertControlPaths` 用
  `await realpath(abs) !== abs` 比较；`abs` 由调用方根拼写逐字构造，而 `fs/promises.realpath`
  是 **native 语义**（Windows 下展开 8.3 短名，本机矩阵见 `_evidence/01-83-realpath-matrix.txt`：
  `realpathSync` JS 版保持短名、`realpathSync.native` 与 `fs/promises.realpath` 均展开长名）。
  短名根下同一真实控制目录因此被误判非规范。
- 相邻残余：只修 `assertControlPaths` 时，短名根下 `listJournals()` 仍会在
  `listGitOperationJournals` 的 `realpath(dir) !== dir` 处失败（探针复现
  `git-journal-directory-invalid`，见 `_evidence/16-store-probe-before-after.txt`）；故 store 内
  `listJournals` 也必须以规范根遍历（不修改不在写区的 `git-command.ts`）。

## 2. 修复（最小、同一 native realpath 规则、fail-closed）

文件：`src/provider/trunk/impl/git-trunk-store.ts`。

1. 新增 `nativeControlRoot(root)`：`realpathSync.native(path.resolve(root))`；**最终根自身**是
   符号链接/junction（`lstatSync(resolved).isSymbolicLink()`）或不可解析 ⇒ `undefined`
   （与 `git-command.ts` 的 `nativeAuthorizationRoot` 同一口径）。
2. `assertControlPaths`：控制路径比较改为
   `await realpath(abs) !== path.join(nativeControlRoot(root), rel)`，即同一真实根的不同拼写
   （8.3 短名/长名/符号链接祖先）归一；`canonicalRoot === undefined`（不可解析/最终根链接）
   ⇒ 既有 `git-control-path-unsafe` 拒绝。返回值改为本次归一出的规范根（无既有控制路径时为
   `undefined`，保持“缺失控制路径不报错”的原语义）。
3. `listJournals`：`listGitOperationJournals(canonicalRoot ?? root)`——短名根下以规范根遍历，
   避免同一拼写缺口在相邻层级复发。

未删除/放宽任何既有校验：控制路径自身（`.ans`、`.ans/state`、`.ans/trunk`、`.ans/trunk/operations`）
仍必须是**真实目录**且非符号链接；非目录/链接混淆/最终根为链接/不可解析仍拒绝；不同真实根仍隔离。
普通 TEMP、macOS 规范根、符号链接祖先根的行为不变（`_evidence/03`、`06`、`07`）。

## 3. 测试（`test/runtime-core/project-root-canonicalization.test.ts`，本角色写区）

新增 2 条回归钉：

1. `B3-2c git 控制路径：8.3 短名根与规范长名同序（不再 git-control-path-unsafe）`
   ——系统 ShortPath 取同一长目录的 8.3 短名；短名根的 `readJournal` 返回 null、
   `listJournals` 返回 `[]`，与规范长名根一致；8.3 被禁用的卷上以 diagnostic 跳过。
2. `B3-2c git 控制路径：符号链接祖先根归一；最终根/控制路径自身链接仍拒`
   ——符号链接祖先根（平台无关）通过；最终根自身为链接仍 `git-control-path-unsafe`；
   `.ans/trunk` 被换成链接仍拒绝（语义不放宽）。

修复前对照：`_evidence/02-b3-2c-tests-before-fix.txt` 两条均失败于
`Error: git-control-path-unsafe`（`git-trunk-store.ts:1160`）；修复后 2/2 通过
（`_evidence/03-b3-2c-tests-after-fix.txt`）。

## 4. 验证

### 4.1 Typecheck

`npm run typecheck`（`tsc --noEmit`）exit 0（`_evidence/00-typecheck.txt`）。

### 4.2 8.3 短名全链（W29×3/W30×2）

方法：TEMP=TMP 指向 git 仓库之外的 8.3 短名目录
（`C:\Users\51054\AppData\Local\Temp\ANS-BL~1`，Node v24.22.1），运行
`--test-name-pattern "W29|W30" test/桌面应用/chief-workflow.test.ts`。

| 状态 | 结果 |
| --- | --- |
| 修复前（HEAD 版 store 临时替换） | 1 pass / **5 fail**；5 条失败均为 `git-control-path-unsafe`（`_evidence/04`） |
| 修复后 run2 | **6/6 pass**（`_evidence/05b`） |
| 修复后 run3 | **6/6 pass**（`_evidence/05c`） |
| 普通 TEMP 对照 | **6/6 pass**（`_evidence/06`） |

逐名结果见 `_evidence/15-w29-w30-per-name.txt`。首次修复后运行（`_evidence/05`）中
W30 真实重启迁移后曾出现一次 `versions.jsonl` migrated-legacy 行时序断言失败；run2/run3 与单条
短名/普通隔离运行（`_evidence/09`、`09b`）均绿，属既有测试时序抖动（非本改动引入；
普通 TEMP 全量批量在 blockers-3 记录中亦出现过同类抖动）。

### 4.3 受影响套件（普通/8.3 双口径）

六文件同跑：`run-role-managed-root-alias`、`run-role-fixed-b2`、`run-role-task-git`、
`run-role-admission`、`orchestration`、`runtime-dispatch-gate-integration`。

| 工作树 | 普通 TEMP | 8.3 短名 TEMP |
| --- | --- | --- |
| `release/v2.0.0-blockers-5`（本补丁） | **44/44**（`_evidence/07`） | **44/44**（`_evidence/08`） |

### 4.4 三套冻结 known-red

| 套件 | 基线 | 本次 | 新增红 |
| --- | --- | --- | --- |
| `test/runtime-core/**` | 33 名 | 604 tests / 567 pass / **33 fail**（4 skipped；基线 602 + 本文件新增 2 条全绿） | **0** |
| `test/门禁引擎/**` | 5 名 | 577 tests / 571 pass / **5 fail**（1 skipped） | **0** |
| `test/编排/**` | 24 名 | 1386 tests / 1360 pass / **24 fail**（2 skipped） | **0** |

- 逐名 diff 为空：`_evidence/13-knownred-diffs.txt`（new-red/missing-red 均 0）。
  证据 TAP：`_evidence/10`、`11`、`12`。
- 编排套件本次 1386 条（基线 1385 条）：`origin/main` `6f96656` 较 blockers-3 验证基线多 1 条
  既有测试；失败名集合与冻结基线逐名相同，无新增红。
- 门禁套件沿用 LF 归一流程：备份工作树文件 → `git show HEAD:<path>` 写回 LF 字节 → 运行 →
  `cp` 还原并 `cmp` 逐字节确认（`git status` 干净）。

### 4.5 Overlay 与装配钉

- `src/common/装配/release-policy.mjs`：`files` 精确加入
  `src/provider/trunk/impl/git-trunk-store.ts`（单文件不开目录），注释标注 v2.0.0 发布阻断
  B3-2c 理由与“断言未放宽”。
- `test/装配/release-packaging.test.ts`：新增同条目的精确路径入列钉（同目录其它 src/ 文件仍
  fail-closed）；该文件 17/17 通过（`_evidence/14-release-packaging.tap`）。

## 5. 残余/说明

- 修复前失败运行中 Node 进程在 TAP 汇总落盘后仍持有开放句柄未自行退出（既有测试清理残余候
  选），本记录在全部测试点记录完成后手动终止进程，不影响结果。
- 未在本轮扩展到 `git-command.ts` 的相邻调用面（不在允许写区）；store 内 `listJournals`
  已以规范根调用，W29/W30 全链与受影响套件短名口径均绿。

## 6. 文件与 SHA-256

| 文件 | 变更 |
| --- | --- |
| `src/provider/trunk/impl/git-trunk-store.ts` | `assertControlPaths` native realpath 归一 + `listJournals` 规范根遍历 |
| `test/runtime-core/project-root-canonicalization.test.ts` | 新增 2 条 B3-2c 回归（8.3 短名、符号链接祖先/最终根/控制路径链接） |
| `src/common/装配/release-policy.mjs` | overlay 精确加入 `git-trunk-store.ts` + 理由注释 |
| `test/装配/release-packaging.test.ts` | 同条目精确路径入列钉 |
| `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-store.md` | 本记录 |
| `..._evidence/` | typecheck、矩阵、修复前后 TAP、W29/W30 逐名、受影响套件、known-red |

SHA-256 见 `_evidence/17-file-sha256.txt`。
