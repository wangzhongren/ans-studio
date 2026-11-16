# macOS file-gate `file-gate-host-facts-unproven` 产品修复：目录 nlink 退出 protection topology（2026-11-16）

- 角色：ANS「运行时核心」（roleId: 运行时核心）。
- 工作树/分支：`.claude/worktrees/macgate`，`fix/test-debt-macos-file-gate`，起点 `d1f256f` = `origin/main`。
- 来源：协调者按 R6 §6.2 owner 裁决项 #1/#5 批准的跨角色产品修复。根因、工件证据与建议补丁见
  `角色卡/编排/docs/change/2026-11-16_macos-file-gate-host-facts.md` 及其 `_evidence/`
  （本记录不复制其证据，只记录本角色修复与验证）。
- 写入面：`src/provider/trunk/impl/git-command.ts`（产品，1 处表达式）、
  `test/runtime-core/git-protection-topology-nlink.test.ts`（新增回归钉）、本记录与 `_evidence/`。
  未改其他产品/测试/workflow/release.yml/角色卡/边界；未 commit/push、未触发 CI、未 tag、未碰 main；
  未读 `.env`；未占用 9222/9223/9224。

## 0. 结论

`file-gate-host-facts-unproven` 的 macOS 根因是 provider 的 protection topology 把**目录 nlink**
计入 digest：POSIX/APFS 目录 `nlink = 2 + 直接子目录数`，`write_file` 的 `ensureParentDir` 在
canonical-read 与 final-write 之间创建首个顶层目录（如 `docs/`），根 nlink 改变 ⇒ final-write 复判
`checkGitProtectionFactsCurrent` 误失败。本批在 `protectionTopology().describe()` 中让目录 nlink
不进入 digest（统一为 0），普通文件 nlink 保留；`.git/config` 的 `nlink===1` 校验与 host-facts
目标文件 nlink 防护逐字未动。回归钉在旧代码上红、修复后 3× 绿；runtime-core 全量与冻结 33 名
known-red 逐名 diff 为空。

## 1. 产品 diff（唯一产品改动）

文件：`src/provider/trunk/impl/git-command.ts`，`protectionTopology()` 内的 `describe()`：

```diff
@@ -598,7 +598,11 @@ function protectionTopology(root: string): string {
   const describe = (file: string) => {
     try {
       const info = lstatSync(file);
-      return [realpathSync.native(file), info.dev, info.ino, info.birthtimeMs, info.isDirectory(), info.isSymbolicLink(), info.nlink];
+      // 2026-11-16（macOS file-gate W29/W30）：POSIX 目录 nlink = 2 + 直接子目录数，普通 mkdir
+      // （如首个 docs/）就会改变它，但目录 nlink 不是保护身份事实（目录不可硬链接；链接替换由
+      // isSymbolicLink/realpath 覆盖）。仅普通文件保留 nlink；`.git/config` 的 nlink===1 校验
+      // （下方）与 host-facts 目标文件 nlink 防护均不变。
+      return [realpathSync.native(file), info.dev, info.ino, info.birthtimeMs, info.isDirectory(), info.isSymbolicLink(), info.isDirectory() ? 0 : info.nlink];
     } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
   };
```

- 补丁后产品文件 sha256：`3227f37c34046a352f55bf998298a8fe04b29049a5995e08ee5cd0e2f238063f`
  （`_evidence/01-product-diff.txt`）。
- 未新增第二份 topology 计算：digest 仍只由同一 `protectionTopology()` 计算；未改
  `checkGitProtectionFactsCurrent`/`readGitProtectionFacts` 的调用链与 `run-role.ts`、
  `provider/runtime/tools.ts`。

## 2. fail-closed 保持论证

`describe()` 仍把以下事实纳入 digest：`realpathSync.native(file)`、`dev`、`ino`、`birthtimeMs`、
`isDirectory()`、`isSymbolicLink()`；普通文件另含 `nlink`。`protectionTopology` 仍覆盖
`describe(root)`、`describe(gitDir)`、`describe(config)`、**config 内容 digest** 与全部 sentinel
（`.gitmodules`、`commondir`、`worktrees`、`objects/info/alternates` 等）的缺席。签发对象仍由
WeakMap 身份（`protectionFreshness`）约束，复制/自报的 facts 依旧不 current。

移除的只有**目录** nlink，理由：

1. POSIX 目录 nlink 只是「直接子目录数」，不是身份或链接防护事实；普通目录创建/删除不应使已签发
   protection facts 失效（本缺陷）。
2. 目录不能被硬链接；目录被替换/链接化仍由 `dev`/`ino`/`birthtimeMs`/`isSymbolicLink`/realpath
   检查覆盖（`git-protection-root-changed` 文案与判定未改）。
3. 硬链接攻击面保留：`.git/config` 的 `info.nlink !== 1` 校验逐字未动（补丁后
   `git-command.ts` 内该行仍在 `describe` 之后的 config 检查处）；`src/provider/runtime/tools.ts`
   的 host-facts 目标文件 nlink 防护不在本 diff 内（该文件未修改）。
4. 无 `.git` 的 `absentProtectionTopology` 不变（原本就不含 nlink；`absent-git-root-link-unproven`
   与 bare/关联检查原样）。
5. 仍然拒绝的既有语义：根/`.git` 被替换、config 内容或文件 nlink 变化、sentinel 出现、根或 `.git`
   变成链接、facts 被复制。回归钉与既有 `test/编排/git-command.test.ts` 共同钉住。

## 3. 回归钉

新增 `test/runtime-core/git-protection-topology-nlink.test.ts`（3 条，sha256
`bb5ef2b7b5fac3be96021b991cf02422c0679caee99ccf601edf5ceede0941d4`）：

1. **present-repo 根下创建一级目录后 facts 仍 current**：真实 `initializeGitRepository` → 
   `readGitProtectionFacts`（coverage `complete`）→ `mkdir("docs")` → `checkGitProtectionFactsCurrent`
   必须为 `true`。断言同时核对机制：POSIX 上根 nlink 必须 `+1`，Windows 上必须不变（诊断性区分，
   不放宽 current 断言）。
2. **目录 nlink +1 不进入 digest**：Windows 目录 nlink 恒 1，故在动态 import provider **之前**包装
   `node:fs.lstatSync`，对指定项目根呈现 `nlink + 1`（与编排 `_evidence/03-nlink-simulation.mjs`
   同一机制、同一种显式构造）⇒ `checkGitProtectionFactsCurrent` 必须仍为 `true`；恢复后仍 `true`。
3. **普通文件 nlink 变化仍 fail-closed**：对 `.git/config` 创建硬链接（nlink=2）⇒ facts 必须
   `false`；移除硬链接（nlink=1）⇒ 恢复 `true`（防护可逆、未被放宽）。

修复前红态（`_evidence/02-regression-pin-pre-fix-red.txt`）：HEAD 原文下第 2 条失败
（`false !== true`），第 1/3 条在 Windows/旧代码为绿；修复后 3× 全绿
（`_evidence/03-regression-pin-post-fix-3x.txt`，RUN1/2/3 EXIT=0）。该红态是按旧代码逐字重跑捕获
（临时还原 → 运行 → 从备份恢复，恢复后 sha256 与补丁态一致）。

## 4. 验证（Windows 11 Pro x64；Node v24.22.1）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **EXIT=0** | `_evidence/04-typecheck.txt` |
| 回归钉 3× | **3/3、3/3、3/3**（RUN1/2/3 EXIT=0） | `_evidence/03-regression-pin-post-fix-3x.txt` |
| `test/编排/git-command.test.ts` | **17/17 pass**（0 fail） | `_evidence/05-git-command-test.tap` |
| 相关 provider/trunk 套件（readonly-git-transport、trunk-store、git-trunk-store、git-capability-tools、project-root-canonicalization、write-gate-context、trunk-contract、session-lifecycle） | **123 tests / 115 pass / 8 fail**；8 名全部在冻结 runtime-core-33 基线内，**基线外新增 0** | `_evidence/06-provider-trunk-related.tap` |
| runtime-core 全量（`--test-concurrency=1`） | **607 tests / 570 pass / 33 fail / 4 skipped**；失败名与冻结基线 `04a-knownred-runtime-core-33.txt` **逐名 diff 为空**（33/33 仍是另一批）；新增 3 条回归钉在 `ok 213-215` | `_evidence/07-runtime-core-full.tap`、`_evidence/07-runtime-core-knownred-diff.txt` |
| 编排 nlink 模拟脚本（真实 provider 函数） | present-repo 模拟根 nlink+1 由修复前 `false` 变为 **`true`**；absent 分支、Windows 真实 mkdir、恢复后均 `true` | `_evidence/08-nlink-simulation-post-fix.txt`（修复前输出见编排 `_evidence/03-nlink-simulation-output.txt`） |

说明：33 名 known-red（session/capability/abort/文案类）属测试债另一批，不在本批范围；本批未改其
断言、未删除或放宽任何测试。Windows 目录 nlink 恒 1，故本机对目录 nlink 变化的机制验证由回归钉
第 2 条与模拟脚本承担；macOS 真实 `mkdir ⇒ nlink+1` 语义仍需 CI 复核（§5）。

## 5. macOS CI 待复核项（R7）

1. 合并后三平台全量：期望 **W29×3（document-change / wrong-flow / source-loss）、W30×2、Q2 P2
   转绿**；W29 document-change-missing-confirmation 保持绿；无需修改任何用例期望。
2. 若仍红，按编排 §5.1 收集：`file-gate-host-facts-unproven` 是否仍**只在「写入前复核未通过」**；
   若是说明 topology 还有第二个可变分量；若错误码变为 canonical/coverage 类，另行定性。
3. W34/W35（`git-file-final-guard-unproven`）按编排 §5.2 观察：W33 写入应成功 ⇒ 清理链自愈；
   W34/W35 init 时 active 条目应为 own 2。仍红则保留为 follow-up，不改期望、不并入本修复。
4. arm64 runner 若 job 级 cancelled，先按 R6 §6.1 重试；两平台结论分开记录。

## 6. 限制与披露

- 本机无 macOS；`mkdir ⇒ 目录 nlink +1` 的 macOS 真实行为按 POSIX/APFS 语义与 CI 工件证据处理，
  本批只在本机验证「仅 nlink 变化」对 digest 的影响（模拟 + 回归钉）。
- 产品 diff 仅 1 个数组表达式；未引入第二份 topology、未改动 `.git/config` nlink 守卫、未改动
  `provider/runtime/tools.ts`。
- 本批未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。

## 附录：证据索引（`角色卡/运行时核心/docs/change/2026-11-16_macos-file-gate-nlink_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-product-diff.txt` | 写入面 `git status`、产品完整 diff、产品/回归钉 sha256 |
| `02-regression-pin-pre-fix-red.txt` | 旧代码回归钉红态（第 2 条 `false !== true`） |
| `03-regression-pin-post-fix-3x.txt` | 修复后回归钉 3× 全绿原始输出 |
| `04-typecheck.txt` | `npm run typecheck` EXIT=0 |
| `05-git-command-test.tap` | `test/编排/git-command.test.ts` TAP：17/17 |
| `06-provider-trunk-related.tap` | 相关 provider/trunk 套件 TAP：123/115/8（8 名均在冻结 33 内） |
| `07-runtime-core-full.tap` | runtime-core 全量 TAP：607/570/33/4 |
| `07-runtime-core-knownred-diff.txt` | 与冻结 runtime-core-33 的逐名 diff（空） |
| `08-nlink-simulation-post-fix.txt` | 编排模拟脚本修复后输出（present 模拟 +1 = true） |

## 复现命令

```bash
cd .claude/worktrees/macgate

node --test --test-timeout=120000 --test-force-exit "test/runtime-core/git-protection-topology-nlink.test.ts"
node --test --test-timeout=120000 --test-force-exit "test/编排/git-command.test.ts"
node --test --test-timeout=120000 --test-force-exit --test-concurrency=1 "test/runtime-core/"*.test.ts
node "角色卡/编排/docs/change/2026-11-16_macos-file-gate-host-facts_evidence/03-nlink-simulation.mjs"
npm run typecheck
```
