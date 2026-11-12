# v2.0.0 发布阻断 B3-2b：provider 层 8.3 短名根归一（`authorization-lease-invalid` 族，2026-11-12）

- 角色：ANS「运行时核心」（roleId: 运行时核心）。
- 分支/工作树：`release/v2.0.0-blockers-3`（基于 `origin/main` `12bef7c`；工作树
  `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-3`）。
- 合并态全链验证：因本分支基线 `12bef7c` 早于 PR #88（`1ac7b5c`，blockers-4 的编排侧
  native-realpath 修复），另在**系统 TEMP、所有角色写区之外**建立一次性 detached 验证树
  （`1ac7b5c` + 本 provider 补丁 + 本测试补丁），仅用于验证，不入库、不提交。
- 声明：**未 commit、未 push、未 tag、未触发 CI、未运行 Electron/未占用 9224**；
  未改 `release-policy.mjs`（测试角色统一处理 overlay）、`app/**`、`src/common/**`、
  `src/pipeline/**`。工作树内桌面窗口角色的 `app/desktop/customer-input.ts` 未提交改动与
  测试角色的未跟踪证据目录均未触碰。本分支基线已把 `src/provider/trunk/impl/git-command.ts`
  与 `test/runtime-core/project-root-canonicalization.test.ts` 列入 `release-policy` 精确 overlay，
  本轮不新增 overlay 条目。

## 1. 事实（承接 PR #88 / `1ac7b5c`）

- blockers-4 已把编排侧 `sameManagedProjectRoot` 改为 `realpathSync.native`，CLI Windows
  8.3 短名 TEMP（`C:\Users\RUNNER~1\...`）下 staleParent 归零；CI 继续推进后
  W29×4/W30×2/W33/W34/W35 仍卡 **`authorization-lease-invalid`**。
- `src/provider/trunk/impl/git-command.ts` 的 `hostProjectKey(root)` 当时为
  `process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root)`：
  **不展开 8.3 短名、不解析符号链接祖先**。
- 同一真实根在 provider 内同时出现两种拼写：
  - `beginGitHostAction({ projectRoot: input.projectRoot })` 可能收到短名（CI 会话/派发输入根）；
  - `appendGitActionAuthorization` 内 `checkGitHostAction` 使用 `await realpath(projectRoot)`
    的 native 规范长名。
  两者落入不同 coordinator ⇒ `checkGitHostAction` 找不到 lease ⇒
  `git-action-audit-unavailable:authorization-lease-invalid`。
- 相邻同类口径同样只认逐字拼写：
  - `sameAuthorizationRoot` 仅 `path.resolve`（append 的规范根契约会把短名调用方误判
    `project-root-not-canonical`，记录根比较也无法归一）；
  - `protectionTopology` / `absentProtectionTopology` 的 `realpathSync(...) !== ...` 用
    **JS 版** realpath（不展开 8.3 短名），拓扑/根未变校验会按拼写分裂；
  - `executeGit` 直接使用调用方根拼写，mutating 路径的
    `await realpath(initFile) !== initFile` 会把同一真实根误判
    `git-init-process-evidence-unsafe`（本机全链复现）。

## 2. 修复（最小、同一 native realpath 规则、fail-closed）

文件：`src/provider/trunk/impl/git-command.ts`。

1. 新增唯一归一 helper：
   - `nativeRealRoot(value) = realpathSync.native(path.resolve(value))`；不可解析
     （不存在/悬空链接/权限）返回 `undefined`；
   - `sameRealRoot(left, right)`：两侧都必须可解析，Windows 沿用大小写不敏感；
   - `sameAuthorizationRoot` 使用 `nativeAuthorizationRoot`（native realpath；同真实根的不同拼写归一，
     但**最终根自身**是符号链接/junction 的别名仍返回不可用 ⇒ 保持既有
     `project-root-not-canonical` 拒绝）；只归一**同一真实根**的拼写，不放宽根归属/根集合判定。
2. `hostProjectKey`：coordinator 键改为 native 真实根（Windows 小写）；不可解析返回
   `undefined`；`hostCoordinator` 对不可解析根不再创建可被其它拼写命中的状态。
   - `beginGitHostAction` / `endGitHostAction` / `checkGitHostAction` /
     `recordGitHostInventory`：不可解析 ⇒ `{ ok:false, code:"git-host-project-root-unresolvable" }`；
   - `readGitHostProtectionRequirement`：不可解析 ⇒ `state:"unknown"`（非 permit）；
   - `recordGitHostInterruption`：不可解析根自身无 coordinator（返回 revision 0），但仍
     中断其它 `git-mutation` lease（紧急停止不因拼写缺口失效）；
   - `inspectGitHostCoordinator`：不可解析 ⇒ 空 inventory、`coverage:"unknown"`。
   - `endGitHostAction` 的 inventory 根一致性改用 `sameRealRoot`。
3. `protectionTopology` / `absentProtectionTopology` 的 `realpathSync` 全部改为
   `realpathSync.native`（与 record 根来源 `fs/promises.realpath` 同一语义；不可解析即
   按既有错误 fail-closed）。
4. `executeGit` 入口统一到真实根：`root = identity?.root ?? await realpath(root)`。固定传输
   （cwd/env/过程证据/`GIT_CEILING_DIRECTORIES`）只落在规范根；最终根自身为链接的拒绝仍由
   `inspectGitRepository` / `initializeGitRepository` 保留；不可解析 ⇒ realpath 抛错 fail-closed。

未删除/放宽任何既有校验；不同真实根、最终根链接、`.git` 文件、共享 common-dir、额外
worktree 根等仍按原语义拒绝。

## 3. 测试

`test/runtime-core/project-root-canonicalization.test.ts`（已在 overlay）新增 3 条：

1. `B3-2b 根规范化：host coordinator 按真实根归一符号链接祖先；不同真实根仍隔离`
   —— `begin(alias)` 的 lease 必须被 `check(real)` 命中，`end(real)` 清理成功；另一真实根不命中。
2. `B3-2b 根规范化：Windows 8.3 短名与规范长名命中同一 coordinator；authorization append
   不再 authorization-lease-invalid` —— 用系统 ShortPath 取同一目录短名；`begin(short)` 后
   `append(long)`/`append(short)` 均成功，sidecar 记录根为规范长名；另一真实根短名不命中。
3. `B3-2b 根规范化：不可解析根 fail-closed` —— 不存在根 `begin/check` 均返回
   `git-host-project-root-unresolvable`。

8.3 被禁用的卷上第 2 条以 diagnostic 跳过；符号链接祖先用例仍覆盖同一 helper 的 native
语义（平台无关）。另跑 `test/编排/git-action-authorization-sidecar.test.ts` **6/6**，确认
“最终根自身是 junction/符号链接的别名”仍按既有 `project-root-not-canonical` 拒绝
（`_evidence/18-sidecar-safety.tap`）。

## 4. 验证

### 4.1 Typecheck

`npm run typecheck`（`tsc --noEmit`）exit 0（本工作树与合并态验证树均 0）。

### 4.2 8.3 短名矩阵（本机 Node v24.22.1，8.3 可用）

`_evidence/11a-83-realpath-matrix.txt`：

- `realpathSync(short)` 原样返回短名；`realpathSync.native(short)` 与
  `fs/promises.realpath(short)` 均展开为同一长名；
- 旧 `hostProjectKey`：`oldKey(short) !== oldKey(long)`；
- 新 `hostProjectKey`：`newKey(short) === newKey(long)`。

修复前对照（临时换回 `HEAD` 版 provider，跑完立即还原，SHA-256 与修复版一致）：
`_evidence/01-before-fix-windows-83-append-lease-invalid.tap` 原文
`Error: git-action-audit-unavailable:authorization-lease-invalid`；
`_evidence/02-before-fix-b3-2b-tests.tap` 3/3 失败。
修复后：`_evidence/13-after-fix-b3-2b-tests.tap` 3/3 通过；
`_evidence/14-after-fix-provider-tests-full.tap` 本文件 10/10 通过。

### 4.3 全链短名 TEMP（合并态 `1ac7b5c` + 本补丁）

方法：TEMP 指向 git 仓库之外的 8.3 短名目录（`C:\Users\51054\AppData\Local\Temp\ANE090~2`），
`test/桌面应用/chief-workflow.test.ts` 全量（66 tests）。

| 状态 | 结果 |
| --- | --- |
| 修复前（`1ac7b5c`，provider 未修） | 44 pass / 22 fail；W29 普通原文 `git-action-audit-unavailable:authorization-lease-invalid`（`_evidence/10-full-chain-short-before-fix.tap`） |
| 修复后（最终补丁） | 48 pass / 18 fail；**0 条** `authorization-lease-invalid` / `staleParent` / `git-root-discovery-unproven` / `project-root-not-canonical` / `git-init-process-evidence-unsafe`（`_evidence/11b-full-chain-short-after-fix.tap`） |

修复后同补丁前一次运行为 49 pass / 17 fail，差异仅 W28 stop 的 Windows `ENOTEMPTY` 清理竞态
（既有不稳定项）；两次运行的目标阻断码均为 0。

逐名结果（短名 TEMP，修复后）：

| 名称 | 结果 | 修复前阻断码 | 修复后说明 |
| --- | --- | --- | --- |
| W29 document-change（普通） | ✖ | `authorization-lease-invalid` | init 成功；发布阶段 `vca-apply-failed: git-control-path-unsafe`（跨写区残余，见 §5）；普通 TEMP 通过 |
| W29 document-change-wrong-flow | ✖ | 同上（批量中） | 同上 |
| W29 document-change-source-loss | ✖ | 同上 | 同上 |
| W29 document-change-missing-confirmation | ✔ | 同上 | 通过 |
| W30 连续写入后 | ✖ | 同上 | init/确认推进；发布阶段 `git-control-path-unsafe` |
| W30 真实重启迁移后 | ✖ | 同上 | 同上 |
| W33 真实DocRun关闭通知 | ✖ | 同上 | close notice 断言 + 测试清理 `ENOTEMPTY`；普通 TEMP 同形，属既有失败（非本修复/非短名特有） |
| W34 团队规划 | ✖ | 同上 | `run-plan-` 断言 + 测试清理 `ENOTEMPTY`；普通 TEMP 同形，属既有失败（非本修复/非短名特有） |
| W35 缺 team 人事准备 | ✔ | 同上 | 通过 |

普通 TEMP 对照（同补丁全量 66 tests）：**53 pass / 13 fail**；W29×4、W30×2、W35 全部通过；
W33/W34 为既有 close notice / `run-plan-` 断言 + `ENOTEMPTY`（blockers-4 普通批量亦红），
其余失败为既有 Windows 清理竞态（`_evidence/12-full-chain-normal-after-fix.tap`）。

### 4.4 受影响套件

套件：`run-role-managed-root-alias`、`run-role-fixed-b2`、`run-role-task-git`、
`run-role-admission`、`orchestration`、`runtime-dispatch-gate-integration`。

| 工作树 | 普通 TEMP | 8.3 短名 TEMP |
| --- | --- | --- |
| `release/v2.0.0-blockers-3`（`12bef7c` + 本补丁） | **43/43**（`_evidence/05`） | 38/43（`_evidence/06`）；5 条 P1-D 均为本分支缺少 PR #88 的 staleParent 族，非 provider 回退 |
| 合并态 `1ac7b5c` + 本补丁 | **44/44**（`_evidence/07`） | **44/44**（`_evidence/08`） |

### 4.5 三套冻结 known-red

| 套件 | 基线 | 本次 | 新增红 |
| --- | --- | --- | --- |
| `test/runtime-core/**` | 33 名 | 602 tests / 565 pass / **33 fail**（4 skipped；基线 599 + 本文件新增 3 条全绿）；逐名 diff 为空 | **0** |
| `test/门禁引擎/**` | 5 名 | 577 tests / 571 pass / **5 fail**（1 skipped）；逐名 diff 为空 | **0** |
| `test/编排/**` | 24 名 | 1385 tests / 1359 pass / **24 fail**（2 skipped）；逐名 diff 为空 | **0** |

- runtime-core 基线 599 + 本文件新增 3 条全绿 = 602。
- 门禁套件沿用 LF 归一流程：`git cat-file blob` 临时写回
  `src/common/门禁引擎/workflows/chief/*.md`，运行后 `git checkout --` 还原。
- 证据：`_evidence/14b-knownred-runtime-core.tap`、`_evidence/15-knownred-gates.tap`、
  `_evidence/16-w2935-per-name.txt`、`_evidence/17-knownred-diffs.txt` 与编排 TAP（见下）。
- 编排套件 TAP：`_evidence/16b-knownred-orchestration.tap`（1385 tests / 1359 pass / 24 fail / 2 skipped；
  首轮曾出现 1 条由 `sameAuthorizationRoot` 过宽导致的新红，收紧为“最终根链接仍拒绝”后消失）。

## 5. 残余（跨写区 / 其他属主，未修改）

1. **provider 相邻文件同类口径**：`src/provider/trunk/impl/git-trunk-store.ts:1160`
   `assertControlPaths` 仍用 `await realpath(abs) !== abs`（abs 由调用方根拼写构造）；短名根下
   同一真实目录会被误判 `git-control-path-unsafe`。修复后 W29×3/W30×2 的全链短名失败
   即 `vca-apply-failed: git-control-path-unsafe`（TAP 内 40 次该码 / 20 次 `vca-apply-failed`），
   **不再是** `authorization-lease-invalid`；W33/W34 的断言失败在普通 TEMP 下同形，属既有失败，
   与本残余无因果关系。该文件不在本轮允许写区（仅 `git-command.ts`），
   需运行时核心后续以同一 native realpath 规则修复（建议在 store 构造入口 canonicalize root
   或两侧都用 `realpathSync.native` 比较；不可解析 fail-closed）。
2. **测试清理 `ENOTEMPTY`**：`test/桌面应用/chief-workflow.test.ts` 的 `fs.rm(recursive)`
   与仍在落盘的会话目录竞态（W33/W34/W19 等；普通/短名 TEMP 均出现），测试/桌面应用属主。
3. **分支基线缺少 PR #88**：`release/v2.0.0-blockers-3` 基于 `12bef7c`，短名 TEMP 下
   `runtime-dispatch-gate-integration` 的 P1-D staleParent 族需由合并 #88 后消除；合并态
   `1ac7b5c` + 本补丁已 44/44。
4. **8.3 不可用的卷**：新 8.3 用例以 diagnostic 跳过；`sameRealRoot` 的符号链接祖先语义仍由
   平台无关用例覆盖。

## 6. 文件与 SHA-256

| 文件 | 变更 |
| --- | --- |
| `src/provider/trunk/impl/git-command.ts` | native realpath 根归一；coordinator fail-closed；authorization/拓扑/executeGit 统一 |
| `test/runtime-core/project-root-canonicalization.test.ts` | 新增 3 条 B3-2b 回归（符号链接祖先、Windows 8.3、不可解析 fail-closed） |
| `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider.md` | 本记录 |
| `..._evidence/` | typecheck、矩阵、修复前后 TAP、受影响套件、known-red |

SHA-256 见 `_evidence/19-file-sha256.txt`。
