# v2.0.0 发布阻断 B3-2：CI Windows 8.3 短名 TEMP 下的 staleParent 23 名（2026-11-12）

- 角色：ANS「编排」（roleId: 编排）。
- 分支/工作树：`release/v2.0.0-blockers-4`（基于 `origin/main` `12bef7c`；工作树
  `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-4`）。
- 承接：`blockers-2`（PR #87，`12bef7c`）的 macOS 符号链接祖先修复在 CI Windows 仍红；
  `角色卡/测试/docs/change/2026-11-12_release-blocker-windows-residual.md` 登记 23 名 staleParent。
- 声明：未 tag、未触发 CI、未 push `main`；只提交/推送本分支。写入面仅
  `src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、
  `test/编排/run-role-managed-root-alias.test.ts`、`src/common/装配/release-policy.mjs`（本轮授权）、
  `test/装配/release-packaging.test.ts`、本记录与 `_evidence/`。**未改** `src/common/gates/index.ts`、
  `src/provider/**`、`src/service/**`、`app/**`。

## 1. CI 事实（run 43155352545 / job 130973900842，overlay `12bef7c`）

- 回执原文（`src/pipeline/orchestration/trunk-runtime.ts` 的 `staleParent()`）：
  `trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn`。
- CI Windows TEMP 为 8.3 短名：作业日志真实路径形如
  `C:\Users\RUNNER~1\AppData\Local\Temp\ans-w19-assignment-AWdBY7\...`。
- 最终 `failing tests` 清单中 chief-workflow 共 24 项；剔除 W19（Windows `ENOTEMPTY` 清理竞态，
  回执非 staleParent）后**恰为 23 名**：W14、W20×2、W21×2、W22、W23、W28×2、W29×4、W30×2、
  W33、W34、W35、W36、W48×4（逐名位置见 `_evidence/12-ci-23-names.txt`）。
- 此前 W5/W10 仅出现在中间轮次、未进入最终失败清单，视为瞬时失败，不在本阻断名单。

## 2. 根因（定位结论）

### 2.1 拼写差异（平台语义）

- `managedCoreHandles` 记录的 `projectRoot` 来自 `readGitProtectionFacts()`
  （`src/provider/trunk/impl/git-command.ts:589`）的 `await realpath(root)`（`node:fs/promises`）。
  Node 在 Windows 上对 promises 版 `realpath` 使用 **native 语义**：展开 8.3 短名、解析符号链接。
- `blockers-2` 的 `sameManagedProjectRoot`（`src/pipeline/orchestration/run-role.ts`）用的是
  **`node:fs` 同步 JS 版 `realpathSync`**；本机实测（`_evidence/11-83-realpath-matrix.txt`，Node v24.22.1）：
  - `realpathSync(short)` 原样返回短名 ⇒ 与长名逐字不等；
  - `realpathSync.native(short)` / `fs.promises.realpath(short)` 均展开为同一长名 ⇒ 相等。
- 结论：CI 上 record 根为长名、派发/授权输入根为 `RUNNER~1` 短名；旧比较用 JS 版 realpath 归一，
  短名不被展开 ⇒ 同一真实根被判不等 ⇒ `inspectManagedRoleSessionEvidence` 返回 `undefined` ⇒
  `evaluateChiefDispatchParent({host, core: undefined})` 返回 `reasons: ["evidence-missing"]` ⇒
  `validParent()` false ⇒ `staleParent()`。本地 junction 模拟只覆盖「符号链接祖先」，不覆盖 8.3。

### 2.2 同一拼写缺口在编排层的另两处（CI 上会接着阻断）

1. `inspectGitActionAuthorization` H7（`trunk-runtime.ts`）：`expected = [path.join(input.projectRoot, ".git")]`
   （短名）与 `readGitProtectionFacts().protectedGitRoots`（native 规范长名）逐字比较 ⇒
   `git-root-discovery-unproven`（W29 系列首先命中）。
2. `appendGitActionAuthorizationBeforeEffects`（`trunk-runtime.ts`）：provider 的既有契约要求
   `appendGitActionAuthorization` 的 `projectRoot` 必须已是规范根（provider 内
   `realpath(projectRoot) === path.resolve(projectRoot)`，否则 `project-root-not-canonical`）；
   编排调用方传短名 ⇒ `git-action-audit-unavailable`。

## 3. 修复（最小、同一条归一规则、fail-closed）

新增**唯一归一规则** `canonicalProjectRoot(value)`（`run-role.ts`，导出）：
`realpathSync.native(path.resolve(value))`；不可解析（不存在/悬空）返回 `undefined`，调用方 fail-closed。
与 record 根的 `fs/promises.realpath` 同一 native 语义（展开 8.3 短名 + 解析符号链接祖先）。

- `sameManagedProjectRoot`：保留原「最终根自身不得为符号链接」与不可解析拒绝；两侧改用
  `canonicalProjectRoot` 后按既有平台口径（`toLowerCase`）比较。
- `inspectGitActionAuthorization` H7：`expected` 由 `canonicalProjectRoot(input.projectRoot)` 构造；
  不可解析 ⇒ `git-root-discovery-unproven`；根数量/集合仍逐项精确比较（额外 metadata/其他 worktree
  根仍拒绝）。
- `appendGitActionAuthorizationBeforeEffects`：sidecar 记录根与 append 入参统一为规范根；
  不可解析 ⇒ `git-action-audit-unavailable`（不执行效果）。

未新增放行分支、未删除既有校验、未放宽任何断言；不同真实根、最终根为链接、不可解析路径、
额外 worktree 根、未列名文件均保持 fail-closed。

## 4. 测试与验证

### 4.1 新增/扩展回归

`test/编排/run-role-managed-root-alias.test.ts` 新增第 4 条：
`B3-2：Windows 8.3 短名拼写与规范长名命中同一托管证据；不同真实根仍拒绝`。
- 用系统 `ShortPath` 取得同一目录的短名拼写（8.3 被禁用时跳过，并如实 diagnostic）；
- 经真实 `openRoleSession` 注册会话（不伪造 managed 注册表）；
- 断言短名/长名两种查询命中同一证据且投影逐字一致；另一真实根的短名仍不命中。
- 普通 TEMP 4/4 通过；8.3 短名 TEMP 4/4 通过（`_evidence/01-alias-suite-short.tap`）。

### 4.2 staleParent 消除（CI 语义复现）

方法：在**任何 git 仓库之外**创建长名临时目录并取其 8.3 短名（`C:\Users\51054\...\Temp\AN8D29~5`），
`TEMP/TMP` 指向短名 ⇒ `os.tmpdir()` 为短名（与 CI `RUNNER~1` 同语义）。
（注意：若短名 TEMP 位于 git worktree 内，`.git` 祖先会使 protection coverage=unknown，属模拟假象，
不作为结论。）

| 状态 | 结果 |
| --- | --- |
| 修复前（`12bef7c` + 短名 TEMP） | W20 普通 1/1 失败，回执原文即 staleParent（`_evidence/02-before-fix-staleparent-w20-short.tap`） |
| 修复后（本分支） | W20 普通 1/1 通过（`_evidence/03-after-fix-w20-short.tap`） |
| 修复后 23 名批量（短名 TEMP） | **0 条 staleParent 回执**；8 绿；6 条主断言已过、仅测试末尾 Windows `ENOTEMPTY` 清理竞态；9 条推进到 provider lease 断言（见 §6） |

23 名批量输出：`_evidence/04-after-fix-23-names-short.tap`（全量，含每条失败码）。

### 4.3 普通环境回归

- 23 名批量（普通 TEMP）：16 绿；6 条 `ENOTEMPTY` 清理竞态；W33 失败 —— W33 在**未修改的
  `12bef7c` 工作树**同样失败（`_evidence/10-baseline-w33-unmodified-12bef7c.tap`），为既有 Windows
  问题，非本修复引入（`_evidence/09-23-names-normal.tap`）。
- 受影响套件（`run-role-managed-root-alias`、`run-role-fixed-b2`、`run-role-task-git`、
  `run-role-admission`、`orchestration`、`runtime-dispatch-gate-integration`）：
  普通 TEMP **44/44**（基线 43 + 本角色新增 1 条）；8.3 短名 TEMP **44/44**
  （`_evidence/05-affected-suites-normal.tap`、`05b-affected-suites-short.tap`）。
- `test/装配/release-packaging.test.ts`：15/15 通过（含本轮精确入列钉）。

### 4.4 三套冻结 known-red（逐名 diff 为空）

| 套件 | 基线 | 本次 | 新增红 |
| --- | --- | --- | --- |
| `test/runtime-core/**` | 33 名 | 599 tests / 562 pass / **33 fail**，逐名一致 | **0** |
| `test/门禁引擎/**` | 5 名 | 577 tests / 571 pass / **5 fail**，逐名一致 | **0** |
| `test/编排/**` | 24 名 | 1386 tests / 1360 pass / **24 fail**，逐名一致（基线 1385 + 新增 1 条全绿） | **0** |

- 门禁套件沿用 LF 归一流程：`git cat-file blob` 临时写回 `src/common/门禁引擎/workflows/chief/*.md`
  （本工作树 `core.autocrlf=true` 检出为 CRLF），运行后 `git checkout --` 还原，工作树无残留改动。
- `test/编排/**` 首次全量运行 1 条环境性瞬时红
  `provider：空闲/总超时、连接超时、AbortSignal；服务端请求次数符合无自动重试`
  （与根路径无关；单文件重跑 14/14 通过），第二次全量 24==24 逐名一致——与 blockers-2 记录同现象。
- 证据：`_evidence/06-knownred-runtime-core*`、`07-knownred-gates*`、`08-knownred-orchestration*`。

### 4.5 Typecheck

`npm run typecheck`（`tsc --noEmit`）exit 0（`_evidence/00-typecheck.txt`）。

## 5. 发布 overlay（精确条目，单文件不开目录）

`src/common/装配/release-policy.mjs` `files` 新增 2 条精确路径（注释理由、断言未放宽）：

- `src/pipeline/orchestration/trunk-runtime.ts`（本轮生产修复；`run-role.ts` 已在 blockers-2 入列）；
- `test/编排/run-role-managed-root-alias.test.ts`（8.3 回归钉；该文件不在冻结 tag v2.0.0 内，
  未列名会被静默 excluded、CI overlay 不会运行它）。

`test/装配/release-packaging.test.ts` 同步：
- 原「trunk-runtime.ts 必须 throw Unreviewed」的断言改为按精确路径入选；
- 同目录其它 src/ 文件与未列名 test/ 仍 fail-closed/excluded（断言不放宽）。

## 6. 残余阻断（按属主，未越界修改）

修复后 23 名均不再出现 staleParent；CI 继续推进时仍会命中以下**非本写区**问题：

1. **provider 8.3 短名归一缺口（`src/provider/trunk/impl/git-command.ts`，运行时核心属主）**：
   `hostProjectKey` 仅 `path.resolve(...).toLowerCase()`、不展开 8.3 短名，而
   `appendGitActionAuthorization` 要求规范根 ⇒ `beginGitHostAction`（短名键）与 append 内
   `checkGitHostAction`（规范根键）落在不同 coordinator ⇒ `authorization-lease-invalid`。
   本轮在编排侧已把 sidecar 根归一为规范根（满足 provider 既有契约），但 begin/check 键语义
   属 provider 真实根规则；需运行时核心角色把 `hostProjectKey`（及 `protectionTopology`/
   `absentProtectionTopology` 的 `realpathSync(dir) !== dir` 口径）统一到 native realpath。
   W29×4/W30×2/W33/W34/W35 当前即卡在此处（`_evidence/04-after-fix-23-names-short.tap`）。
2. **测试清理 `ENOTEMPTY`（`test/桌面应用/chief-workflow.test.ts`，测试/桌面应用属主）**：
   `finally` 的 `fs.rm(recursive)` 与仍在落盘的会话目录竞态；主断言已通过。W14/W20 普通/
   W22/W23/W28×2/W30 普通/W34 普通命中；CI W19 在修复前也命中同一形态，属既有 Windows 清理
   竞态（blockers-1 已对 optional-acceptance 采用有界等待 + `fs.rm` 重试的先例，可复用）。
3. W33 普通环境失败在未修改的 `12bef7c` 同样出现（见 §4.3 证据），非本修复引入。

## 7. 文件

| 文件 | 变更 |
| --- | --- |
| `src/pipeline/orchestration/run-role.ts` | `canonicalProjectRoot` 唯一归一规则；`sameManagedProjectRoot` 使用之（8.3 短名） |
| `src/pipeline/orchestration/trunk-runtime.ts` | H7 根集合按规范根构造；authorization sidecar 记录/append 规范根 |
| `test/编排/run-role-managed-root-alias.test.ts` | 新增 Windows 8.3 短名回归（第 4 条） |
| `src/common/装配/release-policy.mjs` | 精确 overlay 2 条 + 注释 |
| `test/装配/release-packaging.test.ts` | 入列钉同步（断言不放宽） |

SHA-256：见 `_evidence/13-file-sha256.txt`。
