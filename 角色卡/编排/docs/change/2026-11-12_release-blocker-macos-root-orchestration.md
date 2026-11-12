# v2.0.0 发布阻断 P0 残余：macOS 根路径规范化在编排层的第二处比较（2026-11-12）

- 角色：ANS「编排」（roleId: 编排）。
- 分支/工作树：`release/v2.0.0-blockers-2`（基于 `origin/main` `9e11f16`；工作树
  `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-2`）。
- 承接：运行时核心角色的 P0 产品修复（`角色卡/运行时核心/docs/change/2026-11-12_release-blocker-macos-root.md`
  §5.1）中登记为 out-of-area 的**残余 8 名**（chief-workflow W20×2、W21×2、W48×4）。
- 声明：**未 commit**（由调度统一提交）、未 push、未打 tag、未触发 CI；未运行 Electron/未占用 9224。
- 写入面：`src/pipeline/orchestration/run-role.ts`、`test/编排/run-role-managed-root-alias.test.ts`（新增）、
  `src/common/装配/release-policy.mjs`（本轮明确授权：精确 overlay 条目）、
  `test/装配/release-packaging.test.ts`（精确入列钉）、本记录与 `_evidence/`。未改 `src/provider/**`、
  `src/service/**`（运行时核心 P0 工作保持原样）、`app/**`、其他角色记录。

## 1. 事实与根因

- macOS `os.tmpdir()` 返回 `/var/folders/...`，其真实路径为 `/private/var/folders/...`
  （`/var` 是符号链接**祖先**；最终项目根自身不是链接）。运行时核心 P0 修复后，
  `readGitProtectionFacts().projectRoot` = realpath 规范根（`/private/var/...`）。
- 残余链条（代码级确认）：
  1. `src/pipeline/orchestration/run-role.ts:3349` 把 `gitProtection.projectRoot`（规范根）写入
     `managedCoreHandles`；
  2. `inspectManagedRoleSessionEvidence`（原 `run-role.ts:832`）用
     `path.resolve(record.projectRoot).toLowerCase() !== path.resolve(input.projectRoot).toLowerCase()`
     与**会话输入根的别名拼写**（`/var/...`）逐字比较 ⇒ 同一真实根判不等 ⇒ 返回 `undefined`；
  3. `src/pipeline/orchestration/trunk-runtime.ts:1223`（`validParent`）拿不到父 chief 证据 ⇒
     `trunk-runtime.ts:1226` `staleParent()` 拒绝派发，回执原文
     `trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn`；
  4. W20/W21 的产品稿/意图文档链与 W48 的 controller 停止链因此失败（W48 表现为等待 convener 报告超时同因）。
- 本机 Windows junction 别名父目录模拟（`TEMP/TMP/TMPDIR` 指向 junction 别名路径）可**精确复现**：
  修复前 W20×2/W21×2/W48×4 **8/8 失败**，W21 回执含上述 staleParent 原文
  （`_evidence/03-before-fix-w20-w21-w48-alias.txt`）。

## 2. 修复（最小、fail-closed）

### 2.1 `src/pipeline/orchestration/run-role.ts`

- 新增私有判定 `sameManagedProjectRoot(actual, requested)`：
  - `path.resolve` 两侧后，**两侧 `lstatSync` 均不得是符号链接**（最终根自身为链接 ⇒ 不命中，
    沿用 P0「最终根链接 unsupported」立场）；
  - `realpathSync` 两侧（不可解析 ⇒ catch ⇒ 不命中），按既有平台口径（`toLowerCase`）比较相等；
  - 仅此判定改写 `inspectManagedRoleSessionEvidence` 的归属比较。
- **不改 `run-role.ts:3349` 的写入值**（仍存 `readGitProtectionFacts` 的规范根）：
  - record 记录的是**读取保护事实时的真实根**，是更可信的宿主事实；
  - 只改写入值只能修复「开/发使用同一拼写」的偶然一致；一旦某调用方持规范拼写反而失配，
    且 record 不再反映保护事实读取根。比较处按真实根归一可同时命中两种（及以上）书写形式，
    覆盖面严格大于单改写入值，行为面也最小（只影响证据归属判定，不改任何提供/注册路径）。
- fail-closed 明确保留：不同真实根不命中；任一侧不可解析（不存在/悬空）不命中；最终根自身为
  符号链接不命中。未新增任何放行分支、未删除既有校验、未放宽任何断言。

### 2.2 覆盖的消费方

`inspectManagedRoleSessionEvidence` 的全部消费方（`trunk-runtime.ts` 的派发父门/审读 controller/
Git 动作授权/常驻成员检查、`run-role.ts` 的 stable-write 前置）都经同一比较受益；本修复不改变
各消费方自身的字段级断言（construction/roleKind/roleId/disposed/lifecycle/toolSurface 原样）。

## 3. 测试与验证

### 3.1 新增回归 `test/编排/run-role-managed-root-alias.test.ts`（3 条，全绿）

会话经**真实 `openRoleSession`** 注册（custom-adapter；不手写 managed 注册表）；Windows 用
directory junction、POSIX 用目录符号链接构造「真实父目录 + 别名父目录」：

1. 同一真实根的不同书写形式（别名祖先根 / 规范根）都命中同一句柄，且两种查询的证据投影逐字一致
   （`projectRoot` 仍为规范根）；断言 `sessionId/roleId/runtime/construction/disposed`。
2. 不同真实根（即使同为别名写法）与未知 sessionId 均不命中。
3. 最终根自身为符号链接的书写形式不命中；不可解析路径不命中；真实规范根命中；dispose 后证据仍按
   真实根归属且 `disposed: true` 如实。

普通环境与别名 TEMP 环境下均 3/3 通过（`_evidence/01-new-test-normal.tap`、`02-new-test-alias.tap`）。

### 3.2 残余 8 名别名模拟（W20/W21/W48）

方法：创建真实临时父目录与指向它的 junction 别名父目录，`TEMP/TMP/TMPDIR` 指向别名路径，
`os.tmpdir()` 返回别名拼写（与 macOS `/var`→`/private/var` 同为「祖先链接、最终根非链接」语义）。

| 状态 | 结果 |
| --- | --- |
| 修复前（临时还原 `run-role.ts` 比较后立即恢复） | **8/8 失败**；W21 回执原文即 staleParent（`_evidence/03-before-fix-w20-w21-w48-alias.txt`） |
| 修复后（最终源码） | **8/8 通过**（W20×2、W21×2、W48×4；`_evidence/04-after-fix-w20-w21-w48-alias.tap`） |

平台限制（如实披露）：在后续重复运行中，W20 的测试 `finally` 偶发 Windows `ENOTEMPTY` 清理竞态
（`fs.rm` 遇到 diagnostics 仍落盘；断言已在测试体内通过，失败发生在测试末尾清理）。W21/W48 未出现。
该测试文件属桌面应用角色写区，本轮未改；首次最终源码运行 8/8 通过，重跑样例见
`_evidence/04b-after-fix-w20-w21-w48-alias-cleanup-flake.txt`。POSIX（CI macOS）允许删除打开中的文件，
该清理竞态仅为 Windows 本机现象，不影响产品修复判定。

### 3.3 受影响编排/跨层套件（普通环境，43/43 通过）

`test/编排/run-role-managed-root-alias.test.ts`、`run-role-fixed-b2.test.ts`、
`run-role-task-git.test.ts`、`run-role-admission.test.ts`、`orchestration.test.ts`、
`test/测试/runtime-dispatch-gate-integration.test.ts` ⇒ 43 tests / 43 pass / 0 fail
（`_evidence/05-targeted-suites.txt`）。

### 3.4 三套冻结 known-red 对比（逐名 diff 为空）

| 套件 | 基线 | 本次 | 新增红 |
| --- | --- | --- | --- |
| `test/runtime-core/**` | 33 名 | 599 tests / 562 pass / **33 fail**，逐名一致 | **0** |
| `test/门禁引擎/**` | 5 名 | 577 tests / 571 pass / **5 fail**，逐名一致 | **0** |
| `test/编排/**` | 24 名 | 1385 tests / 1359 pass / **24 fail**，逐名一致（基线 1382 + 本角色新增 3 条全绿） | **0** |

- 说明 1：基线 names 文件含 TAP reporter 头行 `failing tests:`，比对时已归一剔除；三套均逐名一致。
- 说明 2：门禁套件沿用运行时核心 P0 的 LF 归一流程（本工作树 `core.autocrlf=true` 把
  `src/common/门禁引擎/workflows/chief/*.md` 检出为 CRLF，会使资源字节 hash 断言误红）；运行时用
  `git cat-file blob` 临时写回 LF，运行后 `git checkout --` 还原（工作树不保留改动）。
- 说明 3：`test/编排/**` 首次全量运行出现 1 条环境性瞬时红
  `provider：空闲/总超时、连接超时、AbortSignal；服务端请求次数符合无自动重试`
  （`download-provider.test.ts`，与根路径无关）；单独重跑 14/14 通过，第二次全量运行 24==24 逐名一致。
  如实记录，不当作基线变化。
- 证据：`_evidence/06-knownred-runtime-core*`、`07-knownred-gates*`、`08-knownred-orchestration*`。

### 3.5 Typecheck

`npm run typecheck`（`tsc --noEmit`）exit 0（`_evidence/00-typecheck.txt`）。

## 4. 发布 overlay（精确条目，单文件不开目录）

`src/common/装配/release-policy.mjs` 的 `files` Set 在运行时核心第二批条目（保留）之后追加 1 条：

- `src/pipeline/orchestration/run-role.ts`

理由：macOS 根路径规范化在编排层的第二处比较——托管句柄证据按**同一真实根的不同书写形式**归属；
不同真实根/不可解析/最终根自身为符号链接仍 fail-closed；既有断言/门禁未放宽。未列名 `src/` 变更仍使
prepare 明确失败；未列名 `test/` 仍 excluded。`test/装配/release-packaging.test.ts` 增该文件的精确
入列钉（同目录 `trunk-runtime.ts`/`run-role-extra.ts` 仍 fail-closed，编排测试仍 excluded），
15/15 通过（`test/装配/release-packaging.test.ts` 全量；含运行时核心既有断言原样保留）。

## 5. 限制与残余

- 本机为 Windows 11；别名模拟与 macOS `/var`→`/private/var` 语义相同（祖先链接、最终根非链接），
  修复前可精确复现 staleParent、修复后 8/8 通过；**最终结论仍需 macOS arm64/x64 CI 复跑**。
- W20 测试清理的 Windows `ENOTEMPTY` 竞态属桌面应用测试夹具（out of area），不是产品断言失败；
  如需彻底消除应由该文件所有者按 v2.0.0 optional-acceptance 的「等待落盘 + fs.rm 重试」模式处理。
- 未运行 Electron/9224；未 commit/tag/push/CI。

## 6. 候选文件 SHA-256（提交前值）

| 文件 | SHA-256 |
| --- | --- |
| `src/pipeline/orchestration/run-role.ts` | `52928e8f2d25c264b65ea17ad80c92775525245e30f77e18beaf2fde91204b62` |
| `test/编排/run-role-managed-root-alias.test.ts` | `1334a19eb1fe72826474d23e2130278dda811c775c8dddcfee74ac099c24bc40` |
| `src/common/装配/release-policy.mjs`（含运行时核心第二批条目） | `216175e880919d63fb4cee5f2e7fd0abf209f31207794f789a9b5cf3dc1d63dc` |
| `test/装配/release-packaging.test.ts`（含运行时核心精确入列钉） | `5401f7ef8cf8593bae844f9bc211a186643f012c966dc41137dda5f55fca4fa4` |

（本记录不自嵌自身 SHA；证据见 `_evidence/09-candidate-sha256.txt`。）
