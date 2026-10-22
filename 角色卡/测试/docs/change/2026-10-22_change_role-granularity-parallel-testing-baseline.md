# 基线回归记录：角色粒度与 MapReduce 并行测试（N3）

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`（flowId `role-granularity-parallel-testing`）
- **记录角色**：测试
- **日期**：2026-10-22
- **阶段**：N3「基线回归」（只读）
- **状态**：**基线，未实施、未验收**（本阶段无候选；只记录当前 HEAD 与工作树的只读观测）
- **授权依据**：闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`「闸门 2 确认与实施授权记录」）；团队计划 `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` §4.3「测试」、§5.4 N3、§6、§11.2
- **结论摘要**：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`，基线命令执行期间工作树仅有既有 memo 修改与未跟踪管理记录（报告收尾时出现其他角色的并发 Map A 改动，见 §10.5）。`npm run typecheck`、`npm run typecheck:renderer` 均通过（exit 0）。全量 `node --test "test/**/*.test.ts"` 两次均为 **3448 tests / 3421 pass / 9 fail / 18 skipped / 0 todo**，失败集两次逐条一致，9 项全部为 Windows symlink `EPERM`（确定性既有失败）。定向套件中 `test/编排/` 1 红、`test/runtime-core/` 3 红均属于上述 9 项；其余定向套件全绿。未发现偶发失败、挂起、超时或不可用检查；未发现测试角色写入的代码/测试改动。标准写盘后的官方基线重跑结果见 §十（含一次瞬时挂起与重跑记录）。

## 一、环境

| 项 | 值 | 来源 |
| --- | --- | --- |
| OS | Windows 11 Pro 10.0.26300；`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`（MSYS 3.6.10） | `uname -a` |
| Shell | Git Bash `/bin/bash.exe`，`GNU bash, version 5.3.15(2)-release (x86_64-pc-cygwin)` | `bash --version` |
| Git | `git version 2.55.0.windows.5` | `git --version` |
| Node | **v24.22.1** | `node --version`（exit 0） |
| npm | **11.19.1** | `npm --version`（exit 0） |
| Node 路径 | `C:\Users\51054\AppData\Local\Programs\nodejs` | 每条命令前 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`；未导出时 `node` 不可用 |
| engines 要求 | `node >=23.6`（`package.json`）→ 满足 | 只读查看 |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio` | `pwd` |
| 分支 | `feat/background-tasks-governance-and-reasoning` | `git branch --show-current` |

`package.json` 相关脚本（只读确认）：`typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`。

## 二、工作树状态（命令前 / 命令后）

### 2.1 命令前

- `git rev-parse HEAD` → `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（exit 0）
- `git rev-parse HEAD^{tree}` → `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`（exit 0）
- `git branch --show-current` → `feat/background-tasks-governance-and-reasoning`（exit 0）
- `git status --short`（exit 0）：

```
 M docs/communication/memo.md
 M docs/planning/memo.md
?? docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md
?? docs/planning/2026-10-22_design_role-granularity-parallel-testing.md
?? docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md
```

（本记录写盘前，证据目录尚不存在；上表为测试开始前的初始状态。）

- `git diff --name-only`（exit 0）：`docs/communication/memo.md`、`docs/planning/memo.md`；附 LF→CRLF 警告
- `git diff --cached --name-only`（exit 0）：空

与任务书给出的预期基线一致：仅两份角色自身 memo 修改与三项未跟踪管理记录，**无已跟踪代码/测试改动**。

### 2.2 命令后

- `git rev-parse HEAD` → `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（未变，exit 0）
- `git rev-parse HEAD^{tree}` → `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`（未变，exit 0）
- `git status --short`（exit 0；pre-standard 阶段写盘后的状态；post-standard 最终状态见 §十）：

```
 M docs/communication/memo.md
 M docs/planning/memo.md
?? docs/acceptance/role-granularity-parallel-testing-criteria-v1.md
?? docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md
?? docs/planning/2026-10-22_design_role-granularity-parallel-testing.md
?? docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md
?? "\350\247\222\350\211\262\345\215\241/\346\265\213\350\257\225/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/"
?? "\350\247\222\350\211\262\345\215\241/\346\265\213\350\257\225/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md"
```

- `git diff --name-only`（exit 0）：仍仅两份 memo（同 LF→CRLF 警告）
- `git diff --cached --name-only`（exit 0）：空

**并发产物说明（观察，非本角色写入）**：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` 在本轮命令期间出现，文件 mtime 为 `2026-10-22 20:30:55`，晚于第二次全量日志结束时间 `20:30:27`，属内置独立验收按团队计划 N2 并行写盘的实施前标准；它不是测试角色写入，也不是代码/测试变化，未影响任何测试结果。

**结论**：除获准写区内新增的本记录与原始证据外，本角色未改任何产品代码/测试/配置，未暂存任何内容。

## 三、命令、退出码、计数与耗时

> 以下命令均在仓库根、按上表环境执行；日志位于证据目录 `角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/`。

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时（实测） | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | — | — | — | — | — | 1,411 ms | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | — | — | — | — | — | 610 ms | `typecheck-renderer.log` |
| 3 | `node --test "test/编排/**/*.test.ts"` | **1** | 735 | 734 | **1** | 0 | 0 | 1,944 ms | `directed-orchestration.log` |
| 4 | `node --test "test/门禁引擎/**/*.test.ts"` | **0** | 305 | 304 | 0 | 1 | 0 | 574 ms | `directed-gate-engine.log` |
| 5 | `node --test "test/runtime-core/**/*.test.ts"` | **1** | 290 | 283 | **3** | 4 | 0 | 14,642 ms | `directed-runtime-core.log` |
| 6 | `node --test test/桌面应用/interface.test.ts test/桌面应用/acceptance-dispatch.test.ts test/桌面应用/operator-wiring.test.ts` | **0** | 166 | 166 | 0 | 0 | 0 | 17,514 ms | `directed-desktop-files.log` |
| 7 | `node --test "test/桌面UI/**/*.test.ts"` | **0** | 163 | 163 | 0 | 0 | 0 | 307 ms | `directed-desktop-ui.log` |
| 8 | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | **0** | 68 | 68 | 0 | 0 | 0 | 11,414 ms | `directed-governance-e2e-auto.log` |
| 9 | `node --test "test/**/*.test.ts"`（run1） | **1** | 3448 | 3421 | **9** | 18 | 0 | 22,287 ms（Node 自报 22,213.0 ms） | `full-run1.log` |
| 10 | `node --test "test/**/*.test.ts"`（run2） | **1** | 3448 | 3421 | **9** | 18 | 0 | 22,285 ms（Node 自报 22,211.5 ms） | `full-run2.log` |

两次全量均 `cancelled 0`，未出现挂起或超过 15 分钟的现象，无需终止/重跑。

## 四、HEAD blob 快照

`git ls-tree -r HEAD -- "src/model/runtime.ts" "src/common/门禁引擎" "src/common/编排" "src/pipeline/orchestration" "app/desktop" "app/renderer/src/chat" "test/编排" "test/门禁引擎" "test/runtime-core" "test/桌面应用" "test/桌面UI" "test/测试"`（exit 0）输出 471 行，已原样保存为：

- `...-baseline-evidence/git-ls-tree-head-snapshot.txt`

快照对应 HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` / tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`。

## 五、失败清单与分类

### 5.1 A 类：确定性既有失败（run1、run2 完全一致，共 9 项）

**Windows symlink EPERM（9 项，环境型）**——夹具调用 `fs.symlink` / `symlinkSync` 创建符号链接时被 Windows 拒绝：`Error: EPERM: operation not permitted, symlink ...`，`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`（当前进程未具备创建符号链接权限/未开启开发者模式）。

| # | 文件与用例声明行 | 实际抛错行 | 失败用例 |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:637` | `:641` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | `:369` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | `:188` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | `:195` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | `:105` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | `:51` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | `:63` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | `:197` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:103` | `:110` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

分类依据：两项全量各出现同 9 项，规范化标题集合 `diff` 完全一致（`failure-titles-run1.txt` / `failure-titles-run2.txt`）；定向套件中的 4 红（编排 1、runtime-core 3）也逐一落在该 9 项内；错误均为同型 `EPERM`。与上轮基线的 9 项 Windows symlink EPERM 清单及声明行号一致。

### 5.2 B 类：偶发失败

**无。** run1 与 run2 的失败集合逐条一致（9 项）；两次全量、六组定向套件均未出现仅一次出现的失败，因此无需隔离/整文件/串行复跑分类。未观察到桌面时序型偶发。

### 5.3 C 类：跳过（18 项，均为平台/环境型，按设计 skip）

| 数量 | 文件与用例声明行 | 跳过原因 |
| --- | --- | --- |
| 1 | `test/codex-adapter/session.test.ts:473`（owned native process group cleanup kills a wrapper and child that ignore SIGTERM） | `skip: process.platform === "win32"`（Windows 无 POSIX 进程组/信号语义） |
| 1 | `test/pi-adapter/session-persistence.test.ts:157`（会话目录不可写：明确抛错…） | `t.skip("chmod 语义在 Windows 不适用")` |
| 2 | `test/runtime-core/file-write-safety.test.ts:132`、`:151`（D3 write/edit 保留普通模式；D3 strict umask handler） | `skip: process.platform === "win32"` |
| 2 | `test/runtime-core/file-write-safety.test.ts:176` 模板生成的 `D3 chmod failure…`、`D3 sync failure…` | `skip: process.platform === "win32"` |
| 6 | `test/测试/lightweight-permission-repairs.test.ts:133`、`:164`、`:199`、`:218`、`:240`、`:257`（D3 AC3/5、AC4、AC5、AC6×2、AC7） | `skip: !posix`（`process.platform === "win32"`） |
| 1 | `test/门禁引擎/pin-evidence.test.ts:145`（unreadable（权限）：文件不可读…） | `skip: process.platform === "win32" || uid === 0` |
| 5 | `test/项目管理/shared/atomic-write.test.ts:299`、`:313`、`:353`、`:330` 模板生成的 chmod/sync 两项（D3 finalMode、严格 umask、chmod/sync 失败、chmod 完成后中止） | `skip: process.platform === "win32"` |

合计 **18 skipped / 0 todo**，与全量输出一致；未发现因缺依赖、缺凭据或路径不可用导致的跳过。

### 5.4 D 类：不可用 / 超时

**无。** 两次全量均在约 22 秒内完成；所有定向命令均正常结束，无超时、无进程挂起、无「不可运行」检查。

### 5.5 定向套件失败归属

| 套件 | fail | 归属 |
| --- | --- | --- |
| `test/编排/` | 1 | A 类 EPERM（#9） |
| `test/runtime-core/` | 3 | A 类 EPERM（#5、#6、#7） |
| `test/门禁引擎/`、`test/桌面应用/` 三文件、`test/桌面UI/`、`test/测试/governance-e2e-auto/` | 0 | — |

## 六、与上轮基线对照（仅作格式与分类参考）

| 项 | 上轮基线（`c3693ec`，2026-10-22） | 本次基线（`64ed44a`） |
| --- | --- | --- |
| 全量 run1 | 3416 / 3386 pass / 12 fail / 18 skip | **3448 / 3421 pass / 9 fail / 18 skip** |
| 全量 run2 | 3416 / 3388 pass / 10 fail / 18 skip | **3448 / 3421 pass / 9 fail / 18 skip** |
| 确定性既有失败 | 9 项 Windows symlink EPERM + 1 项 `real-entry` F3 工作树型 | **9 项 Windows symlink EPERM**（同一清单与行号） |
| 偶发 | run1 出现 2 项桌面时序失败 | **无** |

本次 `real-entry` F3 未失败（上轮该用例因 `docs/scheduling/` 管理记录存在而红）；本基线只记录该用例在两次全量中均通过，不对其断言语义是否变化做独立判定。测试总数较上轮 +32，属仓库既有的前一阶段用例增长；本基线仅记录实测，不对其做验收判断。

## 七、异常、残余观察与未执行项

1. **Node PATH**：默认 shell 无 Node；每条命令前按计划导出 `C:\Users\51054\AppData\Local\Programs\nodejs`，版本实测 v24.22.1 / npm 11.19.1。
2. **并发写入**：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` 于全量测试结束后（20:30:55）由内置独立验收写盘，非本角色产物；已记录在 §2.2。
3. **既有失败对照**：9 项 EPERM 为 Windows 主机能力限制，不是产品缺陷；终验（N7）与本次基线对照时，只有新增失败才需归因于候选。
4. **按任务书在 pre-standard 阶段未执行**：`npm run build:renderer`（写 `app/renderer/dist/`，属桌面UI，N3 不跑）；post-standard 的构建验证见 §10.5（`--outDir` 重定向到仓库外，未写 `app/renderer/dist/`）。`npm run app` / Electron e2e（属 Reduce 阶段真实启动演示）未执行。未运行 `npm install`，未改 `package.json`/`package-lock.json`。
5. **无候选**：本阶段只记录 HEAD 与工作树观测，不构成候选身份或验收结论。

## 八、证据文件

目录：`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `typecheck.log` / `typecheck-summary.txt` | `npm run typecheck` 原始输出；exit 0 / 1,411 ms |
| `typecheck-renderer.log` / `typecheck-renderer-summary.txt` | `npm run typecheck:renderer` 原始输出；exit 0 / 610 ms |
| `directed-orchestration.log` / `-summary.txt` | `test/编排/**` 原始输出与计数；exit 1 / 735 / 734 / 1 / 0 / 0 |
| `directed-gate-engine.log` / `-summary.txt` | `test/门禁引擎/**`；exit 0 / 305 / 304 / 0 / 1 / 0 |
| `directed-runtime-core.log` / `-summary.txt` | `test/runtime-core/**`；exit 1 / 290 / 283 / 3 / 4 / 0 |
| `directed-desktop-files.log` / `-summary.txt` | 三个精确桌面测试文件；exit 0 / 166 / 166 / 0 / 0 / 0 |
| `directed-desktop-ui.log` / `-summary.txt` | `test/桌面UI/**`；exit 0 / 163 / 163 / 0 / 0 / 0 |
| `directed-governance-e2e-auto.log` / `-summary.txt` | `test/测试/governance-e2e-auto/**`；exit 0 / 68 / 68 / 0 / 0 / 0 |
| `full-run1.log` / `full-run1-summary.txt` | 全量 run1 原始 stdout/stderr；exit 1 / 3448 / 3421 / 9 / 18 / 0 |
| `full-run2.log` / `full-run2-summary.txt` | 全量 run2 原始 stdout/stderr；exit 1 / 3448 / 3421 / 9 / 18 / 0 |
| `failure-titles-run1.txt` / `failure-titles-run2.txt` | 两次全量失败标题规范化清单（9 项，diff 一致） |
| `git-head*.txt`、`git-head-tree*.txt`、`git-branch*.txt` | 命令前后 HEAD / tree / branch |
| `git-status-pre.txt` / `git-status-post.txt` | 命令前后 `git status --short` |
| `git-diff-pre.txt` / `git-diff-post.txt`、`git-diff-cached-pre.txt` / `git-diff-cached-post.txt` | 命令前后 diff 与暂存区 |
| `git-status-final.txt`、`git-diff-final.txt`、`git-diff-cached-final.txt` | 本记录写盘后的最终工作树状态 |
| `git-ls-tree-head-snapshot.txt` | 受影响路径的 HEAD blob 快照（471 行） |
| `git-version.txt`、`node-version.txt`、`npm-version.txt`、`uname.txt`、`bash-version.txt` | 环境版本原始输出 |

本记录：`角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md`

## 九、边界声明

本阶段只在获准写区 `角色卡/测试/docs/change/` 内写本记录与原始证据。未修改产品代码、测试源码、角色卡、边界、方案、沟通记录、`docs/scheduling/`、`docs/acceptance/` 或验收文档；未在 `test/桌面应用/` 新建文件；未暂存、提交、推送、合并或发布；pre-standard 阶段未运行 `npm install`、`npm run build:renderer`、`npm run app` 或 Electron e2e（post-standard 的构建验证见 §10.5）。本记录只陈述基线实测，不宣布验收通过，不启动 Map A。

## 十、N3 官方基线（标准写盘后）

### 10.1 目的与时间关系

- **标准**：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`，写盘 mtime **2026-10-22 20:30:55**，风险档位 T3。
- **本节证据时间**：2026-10-22 20:33:19（phase start）至 20:48:18（最后一个命令结束），**晚于标准写盘**，满足标准 §3.2「证据生成时间必须晚于本标准写盘时间」。
- **基线身份**：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` / tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`；分支 `feat/background-tasks-governance-and-reasoning`。
- **phase start 工作树**：与 §2.1 相同（两份 memo 修改 + 三项未跟踪管理记录 + 本角色前序证据/报告），**无已跟踪 src/test 改动**。phase start 原始输出见 `post-standard/git-status-pre.txt`。
- **前序证据**：§三–§五的 pre-standard run1/run2 保留为参考；其证据时间早于标准写盘，**不作为官方基线**。官方基线以本节为准。

### 10.2 命令、退出码、计数与耗时（官方基线）

日志目录：`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/post-standard/`

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时 | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | — | — | — | — | — | 1,422 ms | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | — | — | — | — | — | 611 ms | `typecheck-renderer.log` |
| 3 | `node --test "test/**/*.test.ts"`（官方 run1；首次尝试） | 挂起终止 | — | — | — | — | — | 约 621,000 ms 后由 TaskStop 终止 | `full-run1-hung-2026-10-22T2033.log` |
| 4 | `timeout 300 node --test "test/**/*.test.ts"`（官方 run1；重跑） | **1** | **3448** | **3421** | **9** | **18** | **0** | 22,394 ms（Node 自报 22,313.9 ms） | `full-run1-rerun.log` |
| 5 | `timeout 300 node --test "test/**/*.test.ts"`（官方 run2） | **1** | **3448** | **3421** | **9** | **18** | **0** | 22,326 ms（Node 自报 22,248.3 ms） | `full-run2.log` |
| 6 | `npm run build:renderer -- --outDir C:/Users/51054/AppData/Local/Temp/ans-renderer-build-poststandard`（构建验证；产物重定向到仓库外） | **0** | — | — | — | — | — | 891 ms | `build-renderer-temp-outdir.log` |
| 7 | `timeout 180 node --test test/pi-adapter/write-sequencing.test.ts`（挂起隔离复跑） | **124**（外部超时） | 4（不完整） | 3 | 1（外部终止所致） | 0 | 0 | 180,921 ms | `isolate-write-sequencing.log` |

两次官方全量（#4、#5）均 `cancelled 0`；失败标题规范化后 `diff` 完全一致（`full-run1-rerun-failure-titles.txt` / `full-run2-failure-titles.txt`，各 9 条）。

### 10.3 挂起与重跑记录（环境/瞬时观察，不伪造结果）

1. **官方 run1 首次尝试（20:33:19 起）**：最后一个日志写入为 20:33:55，停止在 `test/pi-adapter/write-sequencing.test.ts` 的 `B 主组（修复后原样）…` 完成行之后；此后约 10 分钟无新输出。20:43:40 由 TaskStop 终止，**未产生最终计数**。原始输出完整保留为 `full-run1-hung-2026-10-22T2033.log`，终止事实与时间见 `full-run1-hung-attempt-record.txt`。该次不记为通过或失败，只作为环境/瞬时挂起观察。
2. **官方 run1 重跑**：`timeout 300` 下 22,394 ms 正常结束，计数 3448/3421/9/18/0；作为官方 run1。
3. **官方 run2**：22,326 ms 正常结束，同一计数；作为官方 run2。
4. **挂起隔离复跑**：`timeout 180 node --test test/pi-adapter/write-sequencing.test.ts` 在 180,921 ms 后被外部超时终止（exit 124）。该文件实际只有 3 个 `test()`；日志显示 3 个用例均已完成（3 pass），随后进程未退出；Node 在外部终止后输出的「4 tests / 1 fail」是文件级收尾被终止所致，**不是断言失败**。按调度要求未再重试。两次官方全量均未把该文件列为失败（9 项失败全部为 EPERM），说明该挂起为环境/瞬时型，与产品断言无关；后续如需可交 Pi适配器 owner 排查未释放句柄。
5. **分类**：以上挂起单列为「环境/瞬时挂起观察」，不计入产品失败，也不影响两次官方全量的计数与失败分类。

### 10.4 失败清单与分类（官方基线）

两次官方全量失败集相同，**9 项全部为 Windows symlink EPERM**（错误 `EPERM: operation not permitted, symlink ...`，`errno -4048`），无新增失败、无偶发断言失败：

| # | 文件与用例声明行 | 实际抛错行 | 失败用例 |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:637` | `:641` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | `:369` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | `:188` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | `:195` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | `:105` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | `:51` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | `:63` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | `:197` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:103` | `:110` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- **偶发断言失败**：无；两次官方全量失败集完全一致。
- **skipped**：18 项，原因同 §5.3（Windows 平台/chmod/umask/权限语义按设计跳过），0 todo。
- **不可用**：无；除 §10.3 的挂起外，所有命令均取得最终退出码与计数。
- **定向套件**：pre-standard 的六组定向套件见 §三；本节官方基线按标准 §3.4 只要求 T3 全量命令组，未重复定向套件。

### 10.5 build:renderer、dist 与 git 状态

- **构建结果**：`npm run build:renderer -- --outDir C:/Users/51054/AppData/Local/Temp/ans-renderer-build-poststandard` **exit 0，891 ms**，2654 modules transformed，产出 `index.html` / `index-s5ZMUClC.css` / `index-CM_oPpfU.js` / `ans-studio-ans-icon-DOpmqMAU.png`（仓库外临时目录）。原始日志见 `post-standard/build-renderer-temp-outdir.log`。
- **为什么没有执行写 `app/renderer/dist` 的 exact form**：`app/renderer/dist/` 属桌面UI角色的 Section 1，测试角色 boundary 未授权写该路径（团队计划 §4.3「测试」明确「测试角色不写 `app/renderer/dist/`」，复用桌面UI 对同候选的构建证据）；原 N3 任务书也明确不运行 `npm run build:renderer`。验收标准 §8 声明「本文件不扩张任何角色的文件写权」。因此本轮只做了**产物重定向到仓库外的等价构建验证**，未写 `app/renderer/dist/`。若验收要求 exact `npm run build:renderer` 写 dist 的原始证据，应由桌面UI owner 对同一 HEAD 执行并提供日志，或先经人事/闸门 2 授权测试角色写该目录；测试角色不自行越界。
- **dist 状态**：`app/renderer/dist/` 在 phase start 时已存在（mtime `2026-10-22 19:18`，4 个文件）；构建前后 `sha256sum` 清单逐行相同（`renderer-dist-before.sha256` vs `renderer-dist-after.sha256`，diff 为空）。`git check-ignore -v app/renderer/dist` → `.gitignore:9:app/renderer/dist/	app/renderer/dist`（exit 0），确认被忽略、非候选。
- **git 状态（phase end，20:48:34 起捕获；两项并发改动 mtime 为 20:48:34/20:48:36）**：

```
 M docs/communication/memo.md
 M docs/planning/memo.md
 M "src/common/门禁引擎/governance-roles.ts"
 M src/model/runtime.ts
 M test/runtime-core/governance-flow-metadata.test.ts
 M "test/门禁引擎/governance-trio.test.ts"
 M "角色卡/运行时核心/api-spec.md"
 M "角色卡/运行时核心/memo.md"
?? docs/acceptance/role-granularity-parallel-testing-criteria-v1.md
?? docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md
?? docs/planning/2026-10-22_design_role-granularity-parallel-testing.md
?? docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md
?? "角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-baseline-evidence/"
?? "角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md"
```

- **并发 Map A 改动（非本角色写入，重要）**：phase end 首次捕获到：
  - `src/model/runtime.ts`：mtime `2026-10-22 20:48:34.501`；首次 worktree `git hash-object` `4b96ae9db3f8f962913e2d010d5ab47bba110389`，HEAD blob `120db534d7952f3320d34f21afe222067b2b744c`。
  - `src/common/门禁引擎/governance-roles.ts`：首次 mtime `2026-10-22 20:48:36.891`，worktree blob `125c1ff8369e300f4acbc16c074a0b97ff02a32a`，HEAD blob `4573b5cc2da48f79e5abd3ed5e76503ac120a471`；`20:49:08` 又被更新。

  报告收尾时（20:49:19）并发改动继续扩展到 `test/runtime-core/governance-flow-metadata.test.ts`（mtime 20:48:41.810）、`test/门禁引擎/governance-trio.test.ts`（20:49:12.241）、`角色卡/运行时核心/api-spec.md`（20:49:12.692）、`角色卡/运行时核心/memo.md`（20:49:19.701）。截至 20:49:19 的 `git diff --stat` 为 8 files / 243 insertions / 26 deletions（含两份 memo 共 6 行）；该数字会随并发写入继续变化，仅作观测。
  - **时间边界**：本节所有官方命令（最后一次命令于 20:48:18 结束）均在上述 Map A 改动 mtime 之前完成；phase start 与各命令日志也未见这些改动。因此**官方基线计数仍对应 HEAD `64ed44a` 的未改动工作树**，不受这些后续 Map A 改动影响。
  - **但**：phase end 已无法确认「除证据目录外无变化」；这些是其他角色在 N3 期间并发写入的 Map A 产物（源码、测试、角色文档），不是测试角色写入。请统筹核对 N3→N4 串行纪律，并在需要时以独立候选/证据重新标识；本报告不把它们计入基线候选，也不评审其内容。
- `git diff --cached --name-only` 为空；无暂存、无提交、无推送、无合并、无发布。

### 10.6 本节证据文件

`post-standard/` 目录主要文件：

| 文件 | 内容 |
| --- | --- |
| `phase-start-time.txt` / `phase-end-time.txt` | 本节起止时间 |
| `git-head.txt` / `git-head-tree.txt` / `git-branch.txt` / `git-status-pre.txt` / `git-diff-pre.txt` / `git-diff-cached-pre.txt` | phase start 身份与工作树 |
| `typecheck.log` / `typecheck-summary.txt` | 官方 typecheck；exit 0 / 1,422 ms |
| `typecheck-renderer.log` / `typecheck-renderer-summary.txt` | 官方 typecheck:renderer；exit 0 / 611 ms |
| `full-run1-hung-2026-10-22T2033.log` / `full-run1-hung-attempt-record.txt` | 官方 run1 首次尝试挂起与终止记录 |
| `full-run1-rerun.log` / `full-run1-rerun-summary.txt` / `full-run1-rerun-failure-titles.txt` | 官方 run1 重跑；3448/3421/9/18/0 |
| `full-run2.log` / `full-run2-summary.txt` / `full-run2-failure-titles.txt` | 官方 run2；同一计数 |
| `isolate-write-sequencing.log` / `isolate-write-sequencing-summary.txt` | 挂起隔离复跑；exit 124 / 180,921 ms |
| `build-renderer-temp-outdir.log` / `build-renderer-temp-outdir-summary.txt` | 重定向构建；exit 0 / 891 ms |
| `renderer-dist-before.sha256` / `renderer-dist-after.sha256` / `renderer-dist-before.stat` / `renderer-dist-after.stat` | dist 前后哈希/元数据（diff 为空） |
| `git-check-ignore-dist.txt` / `git-check-ignore-dist-final.txt` | `.gitignore:9:app/renderer/dist/` |
| `git-status-final.txt` / `git-diff-final.txt` / `git-diff-cached-final.txt` | phase end 工作树状态（含并发 Map A 观测） |

### 10.7 本节边界声明

本节仍只做基线/验证：只在获准写区 `角色卡/测试/docs/change/` 内写报告与证据；未修改产品代码、测试源码、角色卡、边界、方案、沟通记录、`docs/scheduling/`、`docs/acceptance/` 或验收文档；未写 `app/renderer/dist/`（构建产物重定向到仓库外临时目录）；未暂存、提交、推送、合并或发布；未启动 Map A。§10.5 所列的并发 Map A 改动（源码、测试与角色文档，mtime 均晚于本节全部命令）为其他角色写入，不是测试角色产物。本报告不宣布验收通过，不继续 Map A。
