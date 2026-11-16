# B3c-followup（2026-11-16）：9 名 Windows-only 残差（`git-file-final-guard-unproven` 族）——8.3 短名 × 同步 `realpathSync` 盲区

- 角色：ANS「测试」（roleId: 测试）。
- 任务：B3c 跟进——9 名 Windows-only 残差（R5 平台差分：macOS 双平台已绿、Windows 仍红），查清
  「B3c 本机 junction/plain 3× 绿 vs CI Windows 红」矛盾并修复。
- 工作树/分支：`.claude/worktrees/b3cfu` / `fix/test-debt-b3c-followup`，起点 `82dc180`（= `origin/main`）。
- 范围：只改相关测试夹具 3 文件 + 本记录与同名 `_evidence/`。未改产品源码/workflow/release.yml/
  角色卡/边界/其它测试；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 本机：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 工件为 v24.14.0），npm 11.19.1。
- CI 工件：`/tmp/r8-art/test-logs-win-x64/test-ci-output.log`（run **43829367008**）。

## 〇、结论摘要（先读）

1. **根因（测试装配，非产品缺陷）**：CI Windows runner 的 `TEMP/TMP` 是 8.3 短名拼写
   `C:\Users\RUNNER~1\AppData\Local\Temp`；B3c 夹具用**同步 JS `realpathSync`** 求规范根，而它在
   Windows **不展开 8.3 短名**（只做 lstat/readlink 游走）；产品 H12 守卫的期望根用
   `canonicalProjectRoot` = **`realpathSync.native`**（展开短名）。同一真实根、两种拼写 ⇒
   `git-file-final-guard-unproven`。断言/产品语义均无问题。
2. **矛盾解释**：junction 模拟**测不出**这条差异——同步 JS `realpathSync` 会解析 junction（readlink），
   plain/junction 两口径下 `realpathSync(root) === realpathSync.native(root)`（探针 C）；只有 8.3 短名
   口径才分叉。B3c 的 wiring 9 文件之所以在 CI Windows 转绿：其夹具**创建根时**用
   `await fs.realpath(...)`（promises 实现是 native 语义，会展开短名），根从源头就是规范形；而本批
   9 名的夹具在**守卫取根时**才 realpath，且用了同步 JS 版。
3. **9 名全部转绿（本地 CI 等价复现）**：用 8.3 短名 TEMP 精确复现 9/9 名的 CI 错误体（§二），修复后
   7 文件 × 三口径（plain / 8.3 短名 / junction）× 3× = **63/63 EXIT=0，零失败名**（§四）。
4. **改法**：3 个夹具 helper 的 `realpathSync(root)` → `realpathSync.native(root)`（与产品
   `canonicalProjectRoot` 同一 native 语义）。断言零放宽、用例零删除、零新增。
5. **验证**：`npm run typecheck` EXIT=0；共享夹具范围外使用方在 plain 根输出逐字不变（探针证明
   plain 下两函数相等），抽查 6 文件全部测试体绿（exit-style flake 见 §五.3，与本次改动无关）。

## 一、9 名残差清单（R5 `16-platform-diff.tsv` + Windows 工件逐名核对）

| # | 失败名（截断） | 文件 | CI Windows 块码 |
| ---: | --- | --- | --- |
| 1 | AC-1/AC-6/AC-7/P1.2-AC-28 Claude actor：多 active 会话… | test/测试/git-action-cross-runtime-init.test.ts | git-file-final-guard-unproven |
| 2 | AC-16 集成：sidecar 写入失败 ⇒ git-action-audit-unavailable… | test/测试/git-action-cross-runtime-audit-failure.test.ts | 同上 |
| 3 | AC-2 Pi actor：受保护 + 角色 ACL 内 git_candidate init… | test/测试/git-action-cross-runtime-pi-init.test.ts | 同上 |
| 4 | P1.2-AC-27 Codex actor：native 事实不可用仍可 init… | test/测试/git-action-cross-runtime-codex-init.test.ts | 同上 |
| 5 | gate active-tool：真实 Core 会话 + host inventory ⇒ ok… | test/编排/git-action-authorization-gate.test.ts | 同上 |
| 6 | gate H13：真实边界未撤销的 prepared 条目… | 同上 | 同上 |
| 7 | gate host-continuation：真正 settled（disposed+drain）的 rapporteur… | 同上 | 同上 |
| 8 | host-continuation：真实 rapporteur 回合结束并 dispose… | test/测试/run-stop-host-continuation-integration.test.ts | 同上 |
| 9 | Q16 取代 P1.3-B1-AC-26：受保护 + 真实 Codex shell 会话… | test/测试/session-admission-approval-q9-integration.test.ts | 同上 |

> 任务正文的「预计」文件表（wiring/document 等）与实际工件不符：wiring 9 文件在 R5 Windows 已绿；
> 本表 9 名以 R5 evidence 平台差分与工件错误体为准（与 R5 §3.2 清单逐名一致）。
> 9 个失败体的共同错误：`Actual file/edit handlers do not carry the current canonical metadata roots
> and link guard`（`01-ci-windows-failure-bodies.log`）。

## 二、根因与探针（`03-root-cause-probe.log`）

### 2.1 产品侧（非缺陷，B3-2 既有语义）

- H12/B12（`src/pipeline/orchestration/trunk-runtime.ts:197,242`）期望根 =
  `path.join(canonicalProjectRoot(input.projectRoot), ".git")`；
  `canonicalProjectRoot`（`src/pipeline/orchestration/run-role.ts:855`）=
  **`realpathSync.native(path.resolve(value))`**——Windows 展开 8.3 短名、全平台解析链接祖先。
- H7 根发现（同函数 `:201`）用 `readGitProtectionFacts`（`fs/promises.realpath`，同样 native 语义）。
  本次失败的码是 H12 的 `git-file-final-guard-unproven`，**不是** H7 的 `git-root-discovery-unproven`
  ⇒ 失败层精确锁定在「host 提供的 `surface.fileWriteProtection.protectedGitRoots`」与期望根比对，
  产品对真实根的解析/发现本身在 CI Windows 是通的。

### 2.2 夹具侧（缺陷点）

- B3c 在三个 helper 里发布 `protectedGitRoots = [realpathSync(root)/.git]`：
  `test/测试/git-action-cross-runtime-fixture.ts::fileGateOptions`（覆盖 1–4、9）、
  `test/编排/git-action-authorization-gate.test.ts::fileGateOptions`（5–7）、
  `test/测试/run-stop-host-continuation-integration.test.ts::fileGateOptions`（8）。
- Node 事实（本机实测，探针 A/D）：
  - 同步 `fs.realpathSync`（JS 实现，lstat/readlink 游走）**不展开 8.3 短名**；
  - `fs.realpathSync.native` 展开；`fs.promises.realpath` 也展开（native 语义）；
  - junction 下（探针 C）：`realpathSync === realpathSync.native`（都解析到真实目录）⇒ B3c 的
    junction 模拟天然看不见本差异；
  - 8.3 短名下（探针 D）：old（`realpathSync`）与 H12 期望根 key 比对 **false**；new（`.native`）**true**。
- CI 侧根形态（`02-ci-root-shape-evidence.log`）：工件中 mkdtemp 根为
  `C:\Users\RUNNER~1\AppData\Local\Temp\ans-…`（短拼写，68 行），native 规范输出为
  `C:\Users\runneradmin\AppData\Local\Temp\ans-…`（长拼写，14 行）；Node v24.14.0。
  这推翻了 R5 §3.2 的「`D:\a\ans-studio\ans-studio` 工作目录形态」假设——本批夹具根全部来自
  `os.tmpdir()`，与 D: 工作区无关；判别变量是 **TEMP 的 8.3 拼写**。
- 为什么 wiring 9 文件在 CI Windows 已绿（B3c 的修复有效）：其夹具**创建根即**
  `await fs.realpath(mkdtemp(...))`（promises = 展开短名），后续 `w3bFileGateOptions` 的同步
  realpath 对已规范拼写是 no-op；本批 9 名是「mkdtemp 原拼写 → 同步 realpath」路径，故暴露。

### 2.3 复现（本地 CI 等价）

以 `C:\Users\51054\AppData\Local\Temp\ans-b3cfu-shortname-probe-abcdef` 的长目录名取得 8.3 短名
`ANF967~3`（本机 `fsutil behavior query disable8dot3` = 2，系统卷启用 8.3），设
`TEMP=TMP=C:\Users\51054\AppData\Local\Temp\ANF967~3` 运行 7 个文件：修复前**逐名复现 9/9**（`04-baseline-repro-short-temp.log`；
错误体与工件逐字同码同消息），且同文件内其余名保持绿（gate 2 绿、run-stop 2 绿、cross-runtime-init
另一名绿）——与 CI 平台差分完全一致。

## 三、改法（3 文件，仅测试夹具）

| 文件 | 改动 |
| --- | --- |
| test/测试/git-action-cross-runtime-fixture.ts | `fileGateOptions`：`realpathSync` → `realpathSync.native`（注释补 8.3/junction 语义） |
| test/编排/git-action-authorization-gate.test.ts | 同上（本文件内联 `fileGateOptions`） |
| test/测试/run-stop-host-continuation-integration.test.ts | 同上（本文件内联 `fileGateOptions`） |

- 未改断言、未删用例、未加 skip；未改产品/workflow/其它测试；`08-fix.patch` 为完整 diff（12+/5-）。
- 共享夹具的 `bindSession`/`runInitScenario` 等调用方无需改动：根仍以原拼写传入业务 API，只有
  **host 发布的保护事实**改为规范拼写（与产品 `canonicalProjectRoot` 同口径）。
- macOS 语义不变：`realpathSync.native` 与 `fs/promises.realpath` 同解析 `/var → /private/var`，
  B3c 已绿的 macOS 双平台不受影响。

## 四、验证

- **目标 9 名**：8.3 短名口径修复前 9/9 红（§2.3）→ 修复后 9/9 绿；三种口径各 3×：
  plain / 8.3 短名 TEMP / junction TEMP × 7 文件 × 3 次 = **63/63 EXIT=0、零失败名**
  （`05-verify-matrix-3x.tsv`）。
- **零新增**：同一矩阵内目标文件的所有非目标名保持绿（含 cross-runtime-init 的 P1.2-AC-27、
  gate 的 active-tool 负例与 W2 C1–C4、run-stop 的 B1-EV3/AC-8 等）；修复前基线亦仅 9 名红。
- **共享夹具范围外使用方**（activation/commit-claude/commit-pi/delivery/run-stop-e2e/judge-delegated）：
  plain 根下 `realpathSync === realpathSync.native`（探针 C）⇒ 夹具输出逐字不变，属纯回归抽查；
  6 文件测试体全部绿（`06-out-of-scope-fixture-users.log`；activation 自然退出 flake 见 §五.3）。
- **typecheck**：`npm run typecheck`（tsc --noEmit）EXIT=0（`07-typecheck.log`）。
- **CI 复核仍待下一轮**：按约束未触发 CI；本修复在 CI Windows（TEMP=`RUNNER~1`）的等价复现是
  8.3 短名矩阵 3×，预期 9 名转绿。若下一轮 CI 仍有红，需捕获带实际 roots 的错误体（现错误消息不含
  具体根，无法二次判别；给消息加根属产品改动，留 owner 决定）。

## 五、剩余项 / 披露

1. **本族无产品候选**：H7/H12 的产品语义（native 规范根、拒绝非规范 host 事实）在 CI Windows 行为
   正确；失败完全来自测试夹具发布了短名拼写的 host 事实。
2. **R5 假设修正**：R5 §3.2 的「CI Windows 工作目录形态（`D:\a\...`）覆盖缺口」不是本批根因；
   判别变量是 `os.tmpdir()`/TEMP 的 8.3 拼写。建议 R6 归因时更新该条。
3. **exit-style flake 披露（非本次引入）**：`git-action-activation-e2e` 测试体 39.3s 全绿但文件进程
   240s 未退出（`--test-force-exit` 绿）；commit-claude 同型（force-exit 绿）；与 B3c §六.3/§六.4
   披露的 Node 主线程退出残余同族。本次改动在 plain 根输出逐字不变，与该 flake 无因果。
4. **未运行全量套件**：按角色约束只跑相关文件；「其余名不变」以「受影响文件全绿 + 范围外使用方
   抽查绿 + plain 根夹具输出逐字不变」为口径，未宣称全量 104 名基线不变。
5. **平台边界**：本机 Windows；macOS 由同语义（native realpath）推断且 B3c 已双平台绿，最终以下一轮
   三平台 CI 为准。

## 附录：证据索引（`…_evidence/`）

| 文件 | 内容 |
| --- | --- |
| 01-ci-windows-failure-bodies.log | run 43829367008 Windows 工件中 9 个失败体逐字（9 块，全部 `git-file-final-guard-unproven`） |
| 02-ci-root-shape-evidence.log | 工件根形态：RUNNER~1（短）68 行 / runneradmin（长）14 行、Node v24.14.0、D: 工作区 |
| 03-root-cause-probe.log | 探针 A–D：三种 realpath 行为、三口径 equality、old/new 夹具值与 H12 期望根比对 |
| 04-baseline-repro-short-temp.log | 修复前 8.3 短名 TEMP 下 7 文件基线：9 名逐字复现、其余名绿 |
| 05-verify-matrix-3x.tsv | 修复后 3 口径 × 3 次 × 7 文件 = 63 行，全部 EXIT=0 / FAILS=none |
| 06-out-of-scope-fixture-users.log | 共享夹具范围外使用方抽查（plain 不变性论证 + 运行结果 + flake 说明） |
| 07-typecheck.log | `npm run typecheck` EXIT=0 |
| 08-fix.patch | 3 文件完整 diff（12+/5-） |
