# v2.0.0 发布阻断 P0：macOS 根路径规范化产品修复（2026-11-12）

- 角色：ANS「运行时核心」（roleId: 运行时核心）。
- 分支/工作树：`release/v2.0.0-blockers-2`（从 `origin/main` `9e11f16` 切出；工作树
  `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-2`）。
- 范围：分流报告 `角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md`
  （sha256 `98edcb14…`）中批次 1（P0）——macOS 非规范临时根 → 保护范围 `unknown`。
- 声明：**未 commit**（由调度统一提交）、未打 tag、未 push main、未触发 CI（未 `gh workflow run`）。
  未运行 Electron、未占用 9224。
- 写入面：`src/provider/trunk/impl/git-command.ts`、`src/service/runtime/session.ts`（确属必需）、
  `src/common/装配/release-policy.mjs`、`test/runtime-core/project-root-canonicalization.test.ts`（新增）、
  `test/runtime-core/write-gate-context.test.ts`、`test/装配/release-packaging.test.ts`、本记录与
  `_evidence/`。未改 `app/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、其他角色记录。

## 1. 事实与根因

- CI run `43138943189`（运行提交 `7cb9eea`）macOS arm64/x64 的 Regression 在挂起前记录 186 个失败名，
  分流报告把其中 **120 名**归为「macOS 特有（高置信）」，共同机制：
  - macOS `os.tmpdir()` 返回 `/var/folders/...`；其真实路径是 `/private/var/folders/...`
    （`/var` 为符号链接祖先）。
  - `src/provider/trunk/impl/git-command.ts` 的 `readGitHostProtectionRequirement` 旧守卫把
    「`realpath(输入根)` 与输入字符串逐字不等」判为 `noncanonical-project-root` ⇒ 状态 `unknown`。
  - `src/service/runtime/session.ts` 的 `readCoreProtectionScope` 把 `unknown` 原样返回：
    `bindRole`/`composeContext` 抛 `runtime-protection-scope-unknown`，`prepareRole` 记同码 reason。
  - 日志中的 W19 原文 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,...`、
    W1b `desktop.openSession(...).ok === false` 与上述代码路径一一对应。
- 同文件同一缺陷类还有三处「realpath 与输入逐字比较」的根守卫与一处初始化源记录根比较：
  `inspectGitRepository`、`readGitInitializationFacts`、`initializeGitRepository`（含 `.ans`/template
  控制路径按输入拼写 `realpath(dir) !== dir`）、`readGitHostProtectionRequirement` 的
  `source.projectRoot !== root`。它们分别阻塞 Qt 查询/初始化/受保护证据（R14/R15/R16/R20、W3 等）。
- `src/service/runtime/session.ts` 还有一个必需归一：`fileGateProtection.projectRoot` 来自
  `readGitProtectionFacts`（规范根），而 `src/provider/runtime/tools.ts` 的 host-facts 门用
  `resolve(protection.projectRoot) !== resolve(options.projectRoot)` 校验会话根；别名拼写会误判
  coverage unknown（R20、真实 macOS 下 host-facts 写路径）。

## 2. 修复（只放行「同一真实根的不同书写形式」）

### 2.1 `src/provider/trunk/impl/git-command.ts`

| 位置 | 修复 |
| --- | --- |
| `inspectGitRepository` | `root = realpath(projectRoot)` 即规范根；仅 `lstat(projectRoot).isSymbolicLink()`（最终根自身）拒绝，错误码 `git-root-link-unsupported` 不变。移除「realpath ≠ path.resolve 输入」比较。 |
| `readGitInitializationFacts` | 同上：仅最终根自身为链接时 `state="unsupported"` + 原 reason 文本；祖先链接按真实根继续盘点。 |
| `initializeGitRepository` | 仅最终根自身为链接时拒绝（原 `git-init-target-not-empty` 语义）；`.ans` / `git-empty-template` 控制路径改用**规范根**构造并保留 `isSymbolicLink`/`realpath(dir) !== dir` 校验。 |
| `readGitHostProtectionRequirement` | 入口只拒绝最终根自身为链接（`noncanonical-project-root`）；后续 `.git`/`.ans`/`trunk`/`initialization-sources` 检查仍全部落在规范根并保留既有链接/realpath 校验。初始化源记录的 `projectRoot` 改为：必须是绝对路径且 `realpath(record.projectRoot) === 规范根`（同一真实根）；不同真实根/不可解析仍 `invalid-initialization-source` → `unknown`。 |

### 2.2 `src/service/runtime/session.ts`

- provider 组装时对 `options.fileGateProtection` 做一次判定：`realpath(protection.projectRoot)` 与
  `realpath(options.projectRoot)` **相等** ⇒ 仅把 `projectRoot` 字段改写为会话根书写（同一真实根，
  语义不变）；不同真实根/不可解析 ⇒ **丢弃保护事实**（`coverage` 保持 `unknown`，写仍 fail-closed）。
- 不改变 `RuntimeSessionOptions`、不改变 `readCoreProtectionScope` 的语义；`git-command.ts` 修复后
  scope 已能返回 `unmanaged`/`required`，本改动只解决 host-facts 写入面的拼写比较。

### 2.3 未放松的 fail-closed 判定（钉在测试中）

- 最终根自身为符号链接（`noncanonical-project-root` / `git-root-link-unsupported` /
  `Project root is not a canonical host root` / `git-init-target-not-empty`）。
- `.git` 为文件/符号链接（`git-association-protection-requirement-unknown`）；
  `.ans/trunk` 为链接（`unsafe-git-control-root`）、初始化源目录/文件链接与预算（原样保留）。
- 初始化源 `projectRoot` 指向**不同真实根**（`invalid-initialization-source`）。
- `git-action-authorization` sidecar 的最终根别名拒绝用例
  （`test/编排/git-action-authorization-sidecar.test.ts`，`/project-root-not-canonical/`）语义未变，
  在编排套件中仍通过（`ok 367`，见 §3.4）。

## 3. 测试与验证

### 3.1 新增回归 `test/runtime-core/project-root-canonicalization.test.ts`（7 条，全绿）

1. 符号链接**祖先**的临时根被接受：`readGitHostProtectionRequirement` 返回 `unmanaged`；初始化源写
   别名拼写后返回 `required`（规范拼写读取同一证据同样 `required`）。
2. 最终根自身为符号链接 ⇒ `unknown` + `noncanonical-project-root`。
3. 初始化源记录指向不同真实根 ⇒ `unknown` + `invalid-initialization-source`。
4. `.ans/trunk` 链接 ⇒ `unknown` + `unsafe-git-control-root`；`.git` 为文件 ⇒ `unknown` +
   `git-association-protection-requirement-unknown`。
5. `readGitInitializationFacts` 在别名根下非 `unsupported`、无误报 reason；真实
   `initializeGitRepository` + `createGitQueryPort().inspect()` + `readGitProtectionFacts`（coverage
   `complete`）成立；最终根链接仍 `unsupported` / `git-root-link-unsupported`。
6. `fileGateProtection` 指向**不同真实根** ⇒ session 丢弃保护事实，`canonical-read` 的 coverage 非
   `complete`，真实 `write_file` 以 `canonical/host coverage unknown` 拒绝且目标文件不存在。
7. `createRuntimeAdapter(...).bindRole` 在别名根下成功；`host-facts-v1` file gate 用规范根读出的
   `fileGateProtection` 完成真实 `write_file`（覆盖 session.ts 归一）。

平台实现：Windows 用 directory junction，POSIX 用目录符号链接；用例本身平台无关。

### 3.2 测试侧拼写修正（断言不放宽）

- `test/runtime-core/write-gate-context.test.ts`：`canonicalFacts.protectedRoots` 期望由输入拼写改为
  `path.join(await realpath(root), ".git")`——`canonicalFacts` 契约本就是真实路径；仍要求**恰好这一个**
  受保护根，无任何条件放宽。

### 3.3 目标/受影响文件运行（Windows junction 模拟 macOS `/var`→`/private/var`）

方法：创建真实临时父目录与指向它的 junction 别名父目录，`TEMP/TMP/TMPDIR` 指向别名路径，测试从
干净别名 cwd 启动（模拟 CI `.release/source` 无 `.git`）。**该模拟在修复前可精确复现**
`runtime-protection-scope-unknown`（例如 `session-admission-approval` 11 条中 10 条同步失败），修复后转绿。

- 16 个分流目标文件 + 10 个其余含 MAC 失败名的 runtime-core 文件（共 27 个文件，含新增回归）：
  - **23 个文件全绿**；`test/runtime-core/session.test.ts` 仅剩既有 **KR**
    `Core-managed binding rejects a provider that did not register its display profile before first prompt`；
    `test/runtime-core/file-write-safety.test.ts` 仅剩既有 **KR**
    `D3 linked workspace root remains usable; linked target itself is not replaced`（Windows 建**文件**符号
    链接 EPERM，测试夹具平台限制，非产品失败；其 MAC 同族 `D3 lstat ENOTDIR…` 已绿）。
  - `test/pi-adapter/injected-runtime.test.ts` 2 条失败为 Windows `fs.symlink` **EPERM** 夹具限制
    （`store validate callback rejects directory symlink…` / `Pi storage refuses file symlink…`），
    不在 CI 的 186/120 失败名内；其 3 条 MAC 名全绿。
  - `test/桌面应用/chief-workflow.test.ts`：别名模拟下 66 tests / 37 pass / 29 fail；其中 **8 名**为本任务
    根因链的残余（见 §5.1），其余 21 名为分流报告的 **NEW**（Windows 基线亦红：W5 家族、W10/W14/W19/
    W22/W23/W28/W29/W30/W33/W34/W35/W36 等）。MAC 14 名中 **W1b×3、W3×2、W47 select 已转绿**。
- 普通 Windows 环境（真实临时目录、干净 cwd）同一批 27 个文件：无新增失败；失败仅为既有 KR
  （session 1、file-write-safety 1）、Windows 符号链接权限限制（pi-adapter 2）与分流报告 NEW 桌面集
  （chief-workflow 21 fail + 1 cancelled）。`write-gate-context` 11/11、`project-root-canonicalization` 6/6。
- 证据：`_evidence/01-alias-*.tap` / `01-alias-summary.txt`；`_evidence/02-windows-*.tap` /
  `02-windows-summary.txt`。

### 3.4 三套冻结 known-red 对比（diff 均为空）

| 套件 | 基线 | 本次 | 新增红 |
| --- | --- | --- | --- |
| `test/runtime-core/**` | WJ1 33 名（`runtime-core-post-full.tap.txt`；排除 reporter 头 `failing tests:`） | 599 tests / 562 pass / **33 fail**，逐名一致 | **0** |
| `test/门禁引擎/**` | B2 5 名（`07-gates-failure-names.txt`） | 577 tests / 571 pass / **5 fail**，逐名一致 | **0** |
| `test/编排/**` | B17 24 名（`b17-05-known-red-failnames.txt`） | 1382 tests / 1356 pass / **24 fail**，逐名一致 | **0** |

- 说明：本工作树因系统 `core.autocrlf=true` 把 `src/common/门禁引擎/workflows/chief/*.md` 检出为 CRLF，
  首次门禁运行多出 9 条「legacy 资源字节 hash」红；用 `git cat-file blob` 临时写回 LF（与 CI
  `.release/source` 一致）后 5==5 精确一致；运行后已 `git checkout --` 还原，工作树不保留该文件改动。
- 证据：`_evidence/03-knownred-*.tap`、`*-baseline-names.txt`、`*-now-names.txt`、`*-diff.txt`。

### 3.5 Typecheck

- `npm run typecheck`（`tsc --noEmit`）exit 0；证据 `_evidence/00-typecheck.txt`。

## 4. 发布 overlay（精确条目，单文件不开目录）

`src/common/装配/release-policy.mjs` 的 `files` Set 新增 4 条（`test/装配/release-packaging.test.ts` 增
精确入列/排除钉，14/14 全绿）：

- 生产 2 条：`src/provider/trunk/impl/git-command.ts`、`src/service/runtime/session.ts`；
- 测试 2 条：`test/runtime-core/project-root-canonicalization.test.ts`、
  `test/runtime-core/write-gate-context.test.ts`。

理由：macOS 根路径 realpath 规范化；只放行同一真实根的不同书写形式；最终根链接/路径逃逸/控制目录
混淆仍 fail-closed；断言未放宽。未列名 `src/` 仍使 prepare 明确失败，未列名 `test/` 仍 excluded。

## 5. 限制与残余（如实披露）

### 5.1 out-of-area 残余：8 个 MAC 名（W20×2、W21×2、W48×4）

- 现象：别名模拟下 W20/W21/W48 仍失败。W20/W21 的拒绝回执原文为
  `trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn`
  （`src/pipeline/orchestration/trunk-runtime.ts:1226`）；W48 等待 convener 报告超时同因。
- 根因（代码级结论，未修改该文件）：`src/pipeline/orchestration/run-role.ts:3349` 把
  `gitProtection.projectRoot`（`readGitProtectionFacts` 的 realpath 规范根）写入 `managedCoreHandles`，
  而 `run-role.ts:832` `inspectManagedRoleSessionEvidence` 用
  `path.resolve(record.projectRoot).toLowerCase() !== path.resolve(input.projectRoot).toLowerCase()`
  与会话输入根逐字比较；macOS `/var` vs `/private/var` 判不等 ⇒ 父 chief 证据不可见 ⇒ `staleParent()`。
- 建议最小修复（需协调方授权/由 `src/pipeline/orchestration` 所有者执行）：
  `run-role.ts:3349` 改为 `projectRoot: input.project.projectRoot`（或让
  `inspectManagedRoleSessionEvidence` 两侧按 realpath 比较）。属同一根因链、单行级，但不在本角色写区，
  本轮未改。
- 因此 120 名中 **112 名**已由别名模拟验证转绿；**8 名**需上述 out-of-area 单行修复后在 macOS CI 复验。

### 5.2 平台差异

- 本机为 Windows 11；未在真实 macOS 上运行。junction 别名父目录与 macOS `/var`→`/private/var` 同为
  「最终根不是链接、祖先为链接」语义，修复前可复现同错误码；但最终结论仍需 macOS arm64/x64 CI 复跑。
- Windows 无权限创建**文件**符号链接（EPERM），
  `test/pi-adapter/injected-runtime.test.ts` 2 条、`file-write-safety` 的 D3 KR 属测试夹具限制；
  macOS 上这些夹具可创建链接，不影响产品修复。
- CRLF 检出（`core.autocrlf=true`）会使按原始字节哈希的资源断言出现环境性红；CI `.release/source`
  为 LF，本地对比时已按 LF 归一（见 §3.4）。

### 5.3 其它

- 未修改 `session.ts` 的 `readCoreProtectionScope`；确认无需改（scope 由 `git-command.ts` 规范化后
  已返回 `unmanaged`/`required`）。
- 未运行 Electron/9224；未 commit/tag/push main/CI。

## 6. 候选文件 SHA-256（提交前值）

| 文件 | SHA-256 |
| --- | --- |
| `src/provider/trunk/impl/git-command.ts` | `e573cce3e749ef933dd961d126386a73e38d727d885c89c87004559d6df86409` |
| `src/service/runtime/session.ts` | `3a9da0907f1c9aa178ac8e13209f1acea3cca142cebecd01ecf5486b9937fb84` |
| `src/common/装配/release-policy.mjs` | `14e1d5c4723600349be30fd5e4865dc6eaf9fc5b15b5a84c1a756b50ed5964b6` |
| `test/runtime-core/project-root-canonicalization.test.ts` | `6cfc59e068a04f3544e1e632cffd4c24f94d24feb0c99dbd3ae96564cfe03d2e` |
| `test/runtime-core/write-gate-context.test.ts` | `7992b3e7a32a2f32f614523f880f728ad7f2b1092d8128b0b80f77ad60fde939` |
| `test/装配/release-packaging.test.ts` | `4d07b02f01899e7ae52faba81946d41c7fb53f222d2309d0fa22c7a53cac9b09` |

（本记录不自嵌自身 SHA。）
