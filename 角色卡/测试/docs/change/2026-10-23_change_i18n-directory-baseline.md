# 变更基线记录：i18n（T2）与目录级授权（T3）实施前基线

- **任务**：`2026-10-23-i18n`（变更 A，风险档位 **T2**）与 `2026-10-23-directory-ownership`（变更 B，风险档位 **T3**）的实施前基线
- **记录角色**：测试（Testing worker，独立角色上下文）
- **执行者**：测试角色（本记录及全部原始日志均由测试角色执行产生）
- **日期**：2026-10-23
- **阶段**：i18n 节点 I3「基线」/ 目录授权节点 D3「基线」（两节点允许并行，共用同一环境事实）
- **状态**：**基线（baseline-recorded）**；未实施、未验收；本记录只陈述实施前实测，不构成任何验收结论
- **授权依据**：
  - 客户闸门 2 确认与实施授权：`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`「闸门 2 确认记录」「实施授权」
  - i18n 团队计划：`docs/scheduling/2026-10-23-i18n-team-plan.md` §1.2（T2）、§5.1 I3、§5.4、§6.2/§6.3
  - 目录授权团队计划：`docs/scheduling/2026-10-23-directory-ownership-team-plan.md` §1.2（T3）、§5.1 D3、§5.4、§6.2/§6.3
- **基线身份**：分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`ee59296 docs(release): record v1.6.0 published assets and checksums`）
- **工作树前提**：产品代码/测试代码等于 HEAD（`git status --short -- src app test` 为空），只有文档/角色卡边界与未跟踪管理文件/证据变更是既有上下文（见 §一）。

---

## 一、环境与工作树

### 1.1 环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-23 10:41:19 +0800（环境记录时） | `environment.txt` |
| OS | Windows 11 Pro 10.0.26300（`Microsoft Windows [版本 10.0.26300.9711]`）；`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64` | `uname -a`、`cmd /c ver` |
| Shell | Git Bash `/usr/bin/bash`，`GNU bash, version 5.3.15(2)-release (x86_64-pc-cygwin)` | `$BASH_VERSION` |
| Git | 仓库位于 `C:\Users\51054\Desktop\work\ans-studio`；分支 `main` | `pwd`、`git branch --show-current` |
| HEAD | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` | `git rev-parse HEAD` |
| Node PATH（默认 shell） | **不含 Node**：未导出时 `node`/`npm` 均 `command not found` | 实测 |
| Node PATH（执行用） | 每条命令前 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`；实际调用路径 `/c/Users/51054/AppData/Local/Programs/nodejs/node` | `which node` |
| Node | **v24.22.1**（满足 `package.json` engines `node >=23.6`） | `node --version` |
| npm | **11.19.1** | `npm --version` |
| `package.json` 脚本（只读确认） | `typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`；仓库无 `test` 脚本，测试用 `node --test` | 只读查看 |

### 1.2 工作树状态（基线起点）

`git status --short`（2026-10-23 10:41:19，证据 `environment.txt`）：

```
 M docs/communication/memo.md
 M docs/planning/memo.md
 M "角色卡/桌面窗口/boundary.md"
 M "角色卡/桌面窗口/changelog.md"
?? .claude/
?? demos/
?? docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md
?? docs/planning/2026-10-23_design_directory-ownership.md
?? docs/planning/2026-10-23_design_i18n.md
?? docs/scheduling/2026-10-23-directory-ownership-team-plan.md
?? docs/scheduling/2026-10-23-i18n-team-plan.md
?? docs/scheduling/memo.md
```

核验结论：

- `git status --short -- src app test` **为空**：产品代码与测试代码未实施、无改动，等于 HEAD。
- `git diff --cached --name-only` **为空**：无暂存。
- 已跟踪改动只有 4 个文档/角色卡文件：两份 memo、桌面窗口 `boundary.md` 与 `changelog.md`（人事按闸门 2「授权人事补边界条目」完成的 Markdown/YAML 漂移校正）。`git diff --stat` = 4 files / 12 insertions / 1 deletion。
- 边界校正内容（`git diff` 原文）：`角色卡/桌面窗口/boundary.md` 新增恰好两行精确单文件条目——`test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/runtime-resolution.test.ts`；`changelog.md` 为对应校正记录。未改其他路径，未扩大目录权限。
- 未跟踪项均为管理记录/演示/工具目录，不是产品代码。
- **基线记录在修正后的工作树**（含上述 boundary.md 校正）：`角色卡/桌面窗口/boundary.md` 工作区 `git hash-object` = `b13881b8935309c123a6681f1f6017583f5d18da`，`sha256sum` = `1d12d0b4aceb293ed0315986ee82b844603d75bdde71589867bb000f5230744e`；`changelog.md` 工作区 `git hash-object` = `b0e7ca9a12797a52f4f35a59e7936fe87d6c46db`，`sha256sum` = `d41e40f1b6c14a3fc94add1672fcb42ec5f73ce9bf6ec61485275d96bedfd413`。两者与目录授权验收标准 `docs/acceptance/directory-ownership-criteria-v1.md` §二记录的基线边界校正哈希一致（HEAD blob 分别为 `2668bc78…`、`450dff29…`）。

### 1.3 并发观察（非本角色写入，不影响测试计数）

- 基线命令期间，内置独立验收并行写盘了两份实施前标准：`docs/acceptance/i18n-criteria-v1.md`（mtime 2026-10-23 10:43:29.328，70,804 B，sha256 `0d91d179a175dbdad361335a276b5f7b8319539d9dfa0a28f18b409ee204dae9`）与 `docs/acceptance/directory-ownership-criteria-v1.md`（mtime 2026-10-23 10:43:20.214，88,806 B，sha256 `ad0e503179898c1aa9f8225728595b6a0a9d8492f79c50224289e1b3f90546b7`）。二者位于内置独立验收默认写区，是文档而非产品/测试代码。
- T2 套件跑完后（2026-10-23 10:43:31）复核：`git status --short -- src app test` 仍为空，HEAD 未变（证据 `git-status-after-t2.txt`）。
- 本角色未写 `docs/acceptance/`、`docs/scheduling/`、`docs/communication/`、`docs/planning/`、角色卡（除本角色 `docs/change/` 证据区）。

---

## 二、类型检查

| # | 命令 | 退出码 | 错误数 | 开始/结束（本地） | 原始输出尾部 | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | **0**（`grep -c "error TS"` = 0） | 2026-10-23 10:41:29 → 10:41:32 | `> tsc --noEmit`（无错误输出） | `2026-10-23-baseline-evidence/typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | **0**（`grep -c "error TS"` = 0） | 2026-10-23 10:41:35 → 10:41:36 | `> tsc -p app/renderer/tsconfig.json`（无错误输出） | `2026-10-23-baseline-evidence/typecheck-renderer.log` |

两命令均在仓库根、按 §1.1 的 PATH 与 Node v24.22.1 执行；日志包含命令、起止时间与 `exit_code=` 原始记录。

---

## 三、i18n（T2）受影响套件基线

> 口径依据 i18n 团队计划 §6.2/§6.3：T2 默认 = 受影响角色的单元/层测试 + 跨角色集成检查 + 受影响的 typecheck；**不默认全量回归**。共享层（`src/common/shared/`）变更的消费者按 T2 重测；本机基线覆盖计划 §4.3「测试」与 §6.3 列出的受影响套件/消费者文件。
> 全部命令在仓库根执行、互不并发；每个命令单独写原始日志（含命令、起止时间、`exit_code=`）。`skipped` 均为仓库既有的平台型按设计跳过（见 §3.2），不是本轮新增。

### 3.1 命令与计数（逐条）

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时（Node 自报） | 原始日志（`2026-10-23-baseline-evidence/`） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test "test/项目管理/shared/**/*.test.ts"` | **0** | 137 | 132 | 0 | 5 | 0 | 5,189.3 ms | `t2-project-management-shared.log` |
| 2 | `node --test "test/桌面UI/**/*.test.ts"` | **0** | 163 | 163 | 0 | 0 | 0 | 462.3 ms | `t2-desktop-ui.log` |
| 3 | `node --test test/桌面应用/interface.test.ts` | **0** | 83 | 83 | 0 | 0 | 0 | 11,230.4 ms | `t2-desktop-app-interface.log` |
| 4 | `node --test test/桌面应用/multi-runtime.test.ts` | **0** | 38 | 38 | 0 | 0 | 0 | 986.6 ms | `t2-desktop-app-multi-runtime.log` |
| 5 | `node --test test/桌面应用/pi-config.test.ts` | **0** | 16 | 16 | 0 | 0 | 0 | 342.0 ms | `t2-desktop-app-pi-config.log` |
| 6 | `node --test test/桌面应用/session.test.ts` | **0** | 32 | 32 | 0 | 0 | 0 | 952.5 ms | `t2-desktop-app-session.log` |
| 7 | `node --test test/桌面应用/dispatch-delivery.test.ts` | **0** | 52 | 52 | 0 | 0 | 0 | 17,948.1 ms | `t2-desktop-app-dispatch-delivery.log` |
| 8 | `node --test test/桌面应用/composer-images.test.ts` | **0** | 3 | 3 | 0 | 0 | 0 | 221.9 ms | `t2-desktop-app-composer-images.log` |
| 9 | `node --test test/桌面应用/operator-channel.test.ts` | **0** | 53 | 53 | 0 | 0 | 0 | 759.4 ms | `t2-desktop-app-operator-channel.log` |
| 10 | `node --test test/测试/g5-reasoning-verify/f-settings.test.ts` | **0** | 8 | 8 | 0 | 0 | 0 | 163.1 ms | `t2-cross-role-g5-f-settings.log` |
| 11 | `node --test test/测试/t29-pi-config-roundtrip.test.ts` | **0** | 11 | 11 | 0 | 0 | 0 | 274.7 ms | `t2-cross-role-t29-pi-config-roundtrip.log` |
| 12 | `node --test test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | **0** | 5 | 5 | 0 | 0 | 0 | 217.2 ms | `t2-cross-role-turn-watch-c-cross-runtime-settings.log` |

**合计：601 tests / 596 pass / 0 fail / 5 skipped / 0 todo；12/12 命令退出码 0。**

路径存在性核对：任务书列出的 12 个条件/消费者文件**全部存在**（10 个精确文件 + 2 个目录 glob），**无 N/A 项**。

### 3.2 失败与跳过

- **失败：无。** 12 个命令 `fail` 均为 0，退出码均为 0；无需区分新增/既有失败。
- **跳过：5 项，全部在 `test/项目管理/shared/atomic-write.test.ts`**，均为仓库既有的 Windows 平台按设计跳过（`# SKIP`，POSIX 权限语义用例）：`D3 finalMode 应用普通权限位，未传时保持既有安全创建行为`、`D3 严格 umask 下 finalMode 不丢执行位（独立子进程）`、`D3 chmod 失败不提交内容或权限，并清理临时文件`、`D3 sync 失败不提交内容或权限，并清理临时文件`、`D3 chmod 完成后中止仍保留原文件及权限`（见 `t2-project-management-shared.log` 第 32–36 行）。这是与全量基线一致的既有平台跳过，不是本轮新增。
- **i18n T2 基线判定：绿。** 受影响套件全部通过；既有平台跳过单独列出。T2 后续判定「新增失败」时以本表为对照，**不以全量回归为默认要求**（全量仅作 T3 基线，见 §四）。

---

## 四、目录授权（T3）串行全量回归基线

> 口径依据目录授权团队计划 §6.3：T3 适用全量回归，实施前 D3 对同一 HEAD/工作树跑同一组命令，终验与基线逐项对照，区分「本次新增失败」「既有失败」「环境不可用/跳过」。

### 4.1 命令与结果状态

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 "test/**/*.test.ts"`（串行；Node v24.22.1） |
| 开始（本地） | 2026-10-23 10:42:51 |
| 日志最后输出 | 2026-10-23 10:44:02.493（此后无任何新输出） |
| 挂起位置 | `test/pi-adapter/write-sequencing.test.ts`（该文件 3 个 `test()` 全部已打印 `✔`，进程不退出） |
| 终止 | 2026-10-23 10:54:00 由 TaskStop 终止后台任务 `b89ris01v`（运行器 node PID 26164 与当前测试子进程 node PID 19528 随之结束；Electron 应用进程未受影响） |
| 无输出静默时长 | 约 **597.5 s（9 分 57.5 秒）**；运行器总存活 10:42:51→10:54:00 ≈ **669 s（11 分 09 秒）** |
| 最终汇总 | **无**：日志中没有 `ℹ tests/pass/fail/skipped` 汇总块，也没有 `exit_code=`；**全量总计数不可得** |
| 已报告用例计数（部分） | **463 pass / 4 fail / 2 skipped / 0 todo**（=469 个已报告结果；仅统计已打印的 `✔`/`✖`/`﹣` 行，不是全量 totals） |
| 未执行范围 | 基线共 350 个 `test/**/*.test.ts` 文件（`test-file-inventory.txt`）；运行停在 `test/pi-adapter/write-sequencing.test.ts`，其后文件未执行。串行 spec reporter 不逐文件打印文件名，**已完整跑完的文件数不伪造**，只记录「运行到该文件为止」 |
| 原始日志 | `2026-10-23-baseline-evidence/full-regression-serial.log`（530 行，截断保留，未编辑）；挂起记录 `full-regression-serial-hang.txt` |

### 4.2 部分运行中已报告的失败与跳过

- **失败 4 项，全部为 Windows symlink `EPERM` 既有环境失败**（与历史基线同一清单的前 4 项，错误 `EPERM: operation not permitted, symlink ...`）：
  1. `native symlink and storage runtime mismatch fail before SDK query`（`test/claude-adapter/session.test.ts`）
  2. `native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary`（`test/codex-adapter/session.test.ts`）
  3. `store validate callback rejects directory symlink before Pi parse or new native write`（`test/pi-adapter/injected-runtime.test.ts`）
  4. `Pi storage refuses file symlink and role/runtime mismatch without touching other storage`（`test/pi-adapter/injected-runtime.test.ts`）
- **跳过 2 项，均为既有平台型按设计跳过**：`owned native process group cleanup kills a wrapper and child that ignore SIGTERM`（`skip: process.platform === "win32"`）、`会话目录不可写：明确抛错…`（`chmod 语义在 Windows 不适用`）。
- 已报告部分**无其他失败**；失败原文见 `full-regression-partial-failures.txt` 与原始日志。

### 4.3 挂起分类与判定

- **类型**：环境/瞬时挂起（进程未退出），**不是断言失败**。证据：`test/pi-adapter/write-sequencing.test.ts` 仅有 3 个 `test()`；日志中这 3 个用例（`describeTool…`、`A 对照组…`、`B 主组…`）**全部打印 `✔`**，随后进程在 597.5 s 内无任何输出、也不退出。与 2026-10-22 基线记录的同一文件挂起（3 个用例完成、进程不退出；当时 `timeout 180` 隔离复跑也以 124 超时结束）**同型复现**。
- **处置**：按统筹指示不在本轮无限等待、不重跑整套全量；已保留截断原始日志与挂起/进程证据，未伪造总计数。
- **T3 全量基线结论（首轮）：未完成（部分/挂起），不是通过。** 本记录不能把 §4.2 的 469 个已报告结果当作全量 totals，也不宣布 T3 全量回归通过。（首轮挂起事实保留于本节；**补跑结果见 §九**。）

---

## 五、基线结论

### 5.1 两变更各自的基线红/绿

| 变更 | 档位 | 基线状态 | 可用性判定 |
| --- | --- | --- | --- |
| i18n（`2026-10-23-i18n`） | T2 | **绿**：typecheck ×2 全 0 错误；受影响套件 12/12 命令 exit 0，合计 601 tests / 596 pass / 0 fail / 5 skipped（既有平台跳过） | **可用**作 T2 后续「新增失败」对照；T2 **不默认全量回归**（团队计划 §1.2/§6.3），全量日志只作 T3 基线参考 |
| 目录级授权（`2026-10-23-directory-ownership`） | T3 | **首轮全量未完成（挂起，§四）；已按统筹指示完成补跑（§九）**：B0 后工作树、排除已知挂起 `write-sequencing.test.ts` 的串行全量 **3591 tests / 3563 pass / 10 fail / 18 skipped / 0 todo**（exit 1）；10 fail = 9 项既有 Windows symlink `EPERM` + 1 项桌面时序偶发（隔离两次全绿） | **可用**作「B0 后、目录 v3 实施前」的基线（排除项与理由已记录，见 §九）；终验仍须对当前候选重跑并对照本基线 |

### 5.2 既有失败/跳过清单（后续「新增失败」判定口径）

**(A) Windows symlink `EPERM` 确定性既有失败（历史基线 9 项；环境型，非产品缺陷）**

来源：2026-10-22 基线（HEAD `64ed44a`，全量两次均 3448/3421/9/18，失败集逐条一致；同日阶段 E 终验为 3528/3501/9/18，失败组成相同），记录于 `角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md` §5.1。本次（HEAD `ee59296`）部分运行**确认其中前 4 项仍以同型 `EPERM` 失败**；完整 9 项因全量未完成**未在本轮逐条复验**，仅作对照清单：

| # | 失败用例 | 文件（历史基线声明行） |
| --- | --- | --- |
| 1 | native symlink and storage runtime mismatch fail before SDK query | `test/claude-adapter/session.test.ts:637` |
| 2 | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | `test/codex-adapter/session.test.ts:351` |
| 3 | store validate callback rejects directory symlink before Pi parse or new native write | `test/pi-adapter/injected-runtime.test.ts:185` |
| 4 | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | `test/pi-adapter/injected-runtime.test.ts:193` |
| 5 | D3 linked workspace root remains usable; linked target itself is not replaced | `test/runtime-core/file-write-safety.test.ts:97` |
| 6 | store: traversal, mismatched scope and symlinked runtime directories rejected | `test/runtime-core/session-store.test.ts:46` |
| 7 | store: native validation stays lazy and native symlink is rejected before effects | `test/runtime-core/session-store.test.ts:58` |
| 8 | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` |
| 9 | node test外指符号链接路径不获委托；项目内测试路径获委托 | `test/编排/shell-authorized-routine.test.ts:103` |

**(B) 平台/权限型按设计跳过（历史基线 18 项；非失败、不计入 pass）**

历史清单（同一基线报告 §5.3）：codex-adapter 1（Windows 无 POSIX 进程组）、pi-adapter 1（chmod 语义）、runtime-core `file-write-safety` 4、`test/测试/lightweight-permission-repairs` 6、门禁引擎 `pin-evidence` 1、`test/项目管理/shared/atomic-write` 5。本轮已直接观测到其中 7 项（T2 的 `atomic-write` 5 项 + T3 部分运行的 2 项）；其余因全量未完成未逐条复验。

**(C) 挂起（环境/瞬时，不计 pass/fail）**

`test/pi-adapter/write-sequencing.test.ts`：3 个 `test()` 全部完成并打印 `✔`，进程不退出；2026-10-22 基线曾复现同型（隔离复跑 `timeout 180` 亦 exit 124）。本轮无输出静默 597.5 s 后由 TaskStop 终止。终验时该文件需按同一处置（隔离/排除并记录理由），不得用「环境问题」笼统带过，也不得记作通过或失败。

**(D) 本轮新增失败**

- 首轮部分运行范围内：**无**（T2 全部套件 0 fail；T3 部分运行的 4 个失败全部命中 (A) 清单第 1–4 项）。
- 补跑（§九）范围内：**0 项确定性新增失败**；1 项桌面时序偶发（`interface.test.ts` readiness/ledger 兄弟用例交替失败，整文件复跑两次全绿）单列于 §9.4，不计为 B0 确定性新增失败。

### 5.3 后续使用条件

1. **i18n（T2）**：以 §三 的 12 个命令为受影响基线；实施后按同命令复跑并对照本表判定新增失败。T2 不以全量回归为默认要求。
2. **目录级授权（T3）**：首轮全量挂起（§四）；已按统筹指示在当前（B0 后）工作树完成**排除 `test/pi-adapter/write-sequencing.test.ts`** 的串行全量补跑（§九），作为「B0 后、目录 v3 实施前」基线。排除理由与文件数已记录；`write-sequencing.test.ts` 在终验时仍需按同一处置（隔离/排除并记录理由）。
3. 无论采用哪种补跑方式，T3 终验都必须对**当前候选**重跑全量，并只对「相对已完成基线的新增失败」负责；既有 `EPERM`、平台跳过、桌面时序偶发与 `write-sequencing` 挂起必须分别列示。
4. 基线绑定：产品代码/测试代码等于 HEAD `ee59296`；本记录与边界校正哈希（§1.2）共同标识基线工作树；测试期间 `src/`、`app/`、`test/` 保持零改动（§1.2、`git-status-after-full-run-attempt.txt`）。

---

## 六、证据边界声明

- **未启用 task_ops**：本项目无 `.ans/project.json`；本记录不伪造任务令牌、锁、审批或机器预检记录。
- **不声称验收通过**：本记录只是实施前基线实测，不是候选验收；不启动 I4/D4 实施，不代替独立验收判定。
- **未改产品/测试源码**：`src/`、`app/`、`test/` 全部等于 HEAD（§1.2）；未修改任何测试断言；未新建 `test/桌面应用/` 文件。
- **未使用真实 `.env`/凭据**：测试全部使用仓库既有夹具/临时目录；未读取、打印或写入真实 `.env` 或任何密钥。
- **未 commit/push/合并/发布**：无暂存、无提交、无推送。
- **写入边界**：只写 `角色卡/测试/docs/change/`（本记录与 `2026-10-23-baseline-evidence/` 原始证据），符合测试角色 Section 1。
- **并发上下文**：§1.3 的验收标准文件为内置独立验收写入；§1.2 的 `boundary.md`/`changelog.md` 校正为人事按闸门 2 写入。均非测试角色产物，不纳入任何产品候选。

---

## 七、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 环境事实、HEAD/分支、`git status --short`、diff 摘要、边界校正哈希、产品代码等于 HEAD 的核验 |
| `git-status-after-t2.txt` | T2 套件跑完后工作树复核（`src/app/test` 仍为空） |
| `git-status-after-full-run-attempt.txt` | 全量回归挂起终止后的工作树复核（`src/app/test` 仍为空、无暂存） |
| `concurrent-acceptance-notes.txt` | 并发出现的验收标准文件哈希/mtime 观察 |
| `typecheck.log` / `typecheck-renderer.log` | 两条类型检查命令原始输出（含起止时间、`exit_code=`） |
| `t2-*.log`（12 个） | T2 受影响套件的逐命令原始输出（含命令、起止时间、`exit_code=`、全部用例行与 `ℹ` 计数） |
| `t2-summary.tsv` | T2 各日志计数的机读汇总（tests/pass/fail/skipped/todo/duration/exit） |
| `test-file-inventory.txt` | `test/**/*.test.ts` 全量基线范围清单（350 个文件） |
| `full-regression-serial.log` | T3 串行全量回归的**截断**原始 stdout/stderr（命令、Node 版本、起止；**无最终 totals、无 `exit_code=`**；530 行，未编辑） |
| `full-regression-serial-hang.txt` | 挂起记录：时间线、日志 mtime、部分计数、进程快照、TaskStop 终止与终止后进程检查 |
| `full-regression-partial-failures.txt` | 部分运行的 4 个失败 + 2 个跳过原文；`write-sequencing.test.ts` 测试名与 3 个 `test()` 声明核对 |
| `pre-b0-baseline-process-check.txt` | 补跑前 9222 监听与 Electron/Node 进程检查（无 LISTENING、无 Electron） |
| `b0-baseline-worktree-start.txt` / `b0-baseline-worktree-end.txt` | B0 后工作树身份与 `git status`/`diff` 快照（命令前后） |
| `b0-candidate-hashes-start.txt` / `b0-candidate-hashes-end.txt` | B0 的 26 个 `src/app/test` 改动/新增文件 SHA-256（前后逐字节一致） |
| `full-regression-excluded-file-list.txt` | 补跑测试文件清单（353 个，排除 `write-sequencing.test.ts`） |
| `full-regression-serial-excluding-write-sequencing.log` | 补跑原始 stdout/stderr（3591/3563/10/18/0，exit 1，293 s） |
| `full-regression-serial-excluding-write-sequencing-summary.txt` | 补跑计数、10 失败分类、18 跳过、与历史基线差额核对 |
| `full-regression-isolation-interface.log` / `-run2.log` / `-run3.log` | 桌面时序偶发的三次整文件隔离复跑（96/97、97/97、97/97） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾时生成；覆盖上述全部证据） |

**本记录行数与 SHA-256**：见 §八。

---

## 八、证据哈希

- 本记录定稿后，由收尾命令对 `2026-10-23-baseline-evidence/` 内全部文件与本记录生成 SHA-256 清单：`2026-10-23-baseline-evidence/sha256.txt`（`sha256sum` 原始输出，含本记录文件本身）。
- 本记录与证据文件的身份以该清单为准；调用方回报中的 SHA-256 取自该清单。
- 关键原始证据（同样在清单中）：
  - `environment.txt`：环境、HEAD、工作树、边界校正哈希。
  - `full-regression-serial.log`：T3 串行全量的截断原始日志（530 行；无最终 totals / 无 exit code）。
  - `full-regression-serial-hang.txt`：挂起与终止的时间线、部分计数、进程证据。
  - `t2-*.log` / `typecheck.log` / `typecheck-renderer.log`：T2 与类型检查原始输出。

---

## 九、补跑：B0 后、目录 v3 实施前串行全量（排除 write-sequencing）

### 9.1 授权与目的

- **统筹指示（2026-10-23）**：在同一测试角色上下文补跑目录授权（T3）实施前的串行全量基线。当前工作树已包含 **i18n B0**（shared i18n、渲染层 locale store/设置语言区、主进程 preferences/IPC/窗口标题），本次补跑作为「B0 后、目录 v3 实施前」基线。
- 约束：不改产品/测试源码；只写 `角色卡/测试/docs/` 证据；不 commit。

### 9.2 环境与工作树身份（B0 后）

| 项 | 值 |
| --- | --- |
| 时间 | 2026-10-23 11:26:39 起（快照）；命令 11:26:59–11:31:52 |
| HEAD / tree | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` / `1149238a834f31588797016d6ee2289a4ac3e97b`（main） |
| 9222 / Electron | **无 LISTENING 9222**（仅历史 TIME_WAIT）；**无 Electron 进程**（`pre-b0-baseline-process-check.txt`）；无遗留测试 Node 进程 |
| 暂存区 | `git diff --cached --name-only` 为空 |
| B0 工作树内容 | 26 个 `src/app/test` 改动/新增文件：修改 `app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/src/App.tsx`、`app/renderer/src/lib/platform.ts`、`app/renderer/src/shell/SettingsPanel.tsx`、`test/桌面UI/source-guard.test.ts`、`test/桌面应用/interface.test.ts`；新增 `app/desktop/{i18n,preferences}.ts`、`app/renderer/src/i18n/{index,locale-store}.ts`、`src/common/shared/i18n/**`（8 文件）、`test/桌面UI/i18n-{store,view}.test.ts`、`test/项目管理/shared/i18n{,-guard}.test.ts` 及 guard 辅助 2 文件 |
| 基线稳定性 | 上述 26 个文件在命令前后 **SHA-256 逐字节一致**（`b0-candidate-hashes-start.txt` vs `b0-candidate-hashes-end.txt`，`diff` 为空）；`git status --short -- src app test` 前后相同；无并发写入混入本次基线 |
| 身份口径 | B0 属 i18n 变更候选；本基线只把它作为「v3 前工作树」身份，不评审其内容、不为其验收背书 |

### 9.3 命令、文件数与排除

| 项 | 值 |
| --- | --- |
| 命令（实际） | `mapfile -t FILES < full-regression-excluded-file-list.txt; node --test --test-concurrency=1 "${FILES[@]}"`（单次 Node 进程、串行） |
| 文件清单 | `full-regression-excluded-file-list.txt`（`find test -name '*.test.ts' ! -path 'test/pi-adapter/write-sequencing.test.ts' \| sort`，**353 个文件**；路径总长 15,764 字符，未触发命令行长度问题） |
| 排除文件 | `test/pi-adapter/write-sequencing.test.ts`（3 个 `test()`） |
| 排除理由 | **已知挂起**：2026-10-22 基线与 2026-10-23 首轮 T3 基线（§四）均在该文件 3 个用例打印 `✔` 后进程不退出；不属于可完成的断言结果 |
| 运行方式 | 后台运行并轮询，未提前杀进程（本轮未再出现其他挂起） |
| 原始日志 | `full-regression-serial-excluding-write-sequencing.log`；摘要与分类 `full-regression-serial-excluding-write-sequencing-summary.txt` |

### 9.4 结果与失败分类

| 指标 | 值 |
| --- | --- |
| 退出码 | **1** |
| tests / pass / fail / skipped / todo / cancelled | **3591 / 3563 / 10 / 18 / 0 / 0** |
| 耗时 | **293 s**（Node 自报 `duration_ms` 292,946.6） |
| 开始 / 结束 | 2026-10-23 11:26:59 / 11:31:52 |

**失败分类（10 项）：**

- **(A) 既有 Windows symlink `EPERM`：9 项**——与 §5.2(A) 历史清单逐条一致（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core 2、file-write-safety 1、g4-skill-verify 1、编排 shell-authorized-routine 1），错误均为 `EPERM: operation not permitted, symlink ...`（`errno -4048`）。本轮在 B0 工作树上**完整复验了全部 9 项**。
- **(B) 桌面时序偶发：1 项**——`test/桌面应用/interface.test.ts`「2026-10-22 第 5 项迁移策略：existing 角色只做最低检查（warning 不阻塞）⇒ 仍派 Convener readiness」，断言 `readiness 派发入账 stepId=role-readiness` 为 false（发送已发生、账本写入未在断言时可见）。
  - 隔离复跑：run1（`full-regression-isolation-interface.log`）96/97，失败换为**同族兄弟用例**「2026-10-22 V12：existing 角色计划写集未覆盖 boundary ⇒ 只 warning、仍派 readiness」；run2/run3（`...-run2.log`/`...-run3.log`）均 **97/97 全绿**。
  - 分类依据：同文件两个 readiness/ledger 兄弟用例在不同运行中交替失败、整文件复跑两次全绿 ⇒ **非确定性桌面时序偶发**，不记为 B0 确定性新增失败。B0 对 `interface.ts` 的 diff 仅是 preferences IPC/服务增量，未触及 `advanceGovernanceFlow`/dispatch/ledger 路径。**保留观察**：该偶发出现在 B0 工作树，若 D7 终验再现，按桌面时序流程隔离/整文件复跑并交桌面窗口 owner 排查，不能笼统归为环境问题。
- **跳过 18 项**：与 §5.2(B) 历史清单逐条一致（18/18），无新增 skip/todo。

### 9.5 与历史基线的差异

| 基线 | tests | pass | fail | skipped | 说明 |
| --- | --- | --- | --- | --- | --- |
| N3 / v1.6.0 基线（HEAD `64ed44a`，2026-10-22） | 3448 | 3421 | 9 | 18 | 9 项 Windows symlink EPERM（`docs/acceptance/governance-split-1-3-5-report-v1.md`、2026-10-22 baseline 记录） |
| 角色粒度阶段 E（2026-10-22） | 3528 | 3501 | 9 | 18 | 同一 9 项 EPERM；较 N3 +80 tests |
| 本次 T2 基线（pre-B0，§三；受影响套件子集，非全量） | 601 | 596 | 0 | 5 | 仅 i18n 受影响命令；全绿 |
| **本次 B0 后补跑（排除 write-sequencing）** | **3591** | **3563** | **10** | **18** | 9 EPERM + 1 桌面时序偶发；exit 1 |

**差额核对**：`3591 = 3448 + 80（角色粒度阶段新增）+ 66（B0 新增测试）- 3（本轮排除 write-sequencing 的 3 例）`；pass `3563 = 3421 + 146 - 3 - 1（桌面偶发）`；fail 9 → 10 仅因该 1 次偶发；skip 保持 18。B0 新增的 i18n 测试（shared 目录、桌面UI store/view、interface 偏好 IPC 断言等）在本次全量中全部通过；唯一非 EPERM 失败落在 B0 未改动的既有 readiness 用例上（偶发）。

### 9.6 基线结论（B0 后、目录 v3 实施前）

1. **可用**：本次补跑是「B0 后、目录 v3 实施前」的已完成串行全量基线；确定性失败仅 9 项既有 Windows symlink `EPERM`，**无 B0 确定性新增失败**；1 项桌面时序偶发已隔离复跑并单独列示。
2. **排除项**：`test/pi-adapter/write-sequencing.test.ts`（3 例）不纳入计数，理由是已知挂起（两轮基线复现）；D7 终验仍按同一处置，并在终验报告中列明排除清单与理由。
3. **对照口径**：D7 终验只对「相对本基线的新增确定性失败」负责；`EPERM`、18 项平台跳过、桌面时序偶发、write-sequencing 挂起必须分别列示，不得笼统归为环境问题。
4. **边界**：本基线不评价 B0 自身正确性（B0 验收归 i18n T2）；B0 候选身份以 §9.2 的 26 文件哈希为准，命令前后未变。

---

**状态再次声明**：本文件是实施前基线记录（baseline-recorded），不是候选、不是验收报告；T2 基线可用；T3 首轮全量挂起已如实记录（§四），补跑基线已完成（§九，排除 `write-sequencing.test.ts` 并记录理由），**不宣布 T3 全量「通过」**。未 commit、未 push、未合并、未发布；未改产品/测试源码。
