# 基线回归记录：治理分工第 1、3、5 项（阶段 A / N3）

- **任务 ID**：`2026-10-22-governance-split-1-3-5`（flowId `governance-split-1-3-5`）
- **记录角色**：测试
- **日期**：2026-10-22
- **阶段**：阶段 A / 节点 N3「基线回归」（只读）
- **状态**：**基线，未实施、未验收**（本阶段无候选；只记录当前 HEAD 与工作树的只读观测）
- **授权依据**：闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」）；团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` §4.2「测试」、§5.1 N3、§6、§11.2
- **结论摘要**：`npm run typecheck`、`npm run typecheck:renderer` 均通过（exit 0）；全量 `node --test "test/**/*.test.ts"` 两次均为 3416 tests / 18 skipped / 0 todo，确定性失败 10 项（9 项 Windows symlink EPERM + 1 项由工作树中未跟踪 `docs/scheduling/` 管理记录触发的 `real-entry` F3 断言），另有 2 项仅在第一次全量并发运行时出现的时序型偶发失败（第二次全量与单文件复跑均通过）。未发现与实施相关的代码/测试改动。

## 一、环境

| 项 | 值 | 来源/备注 |
| --- | --- | --- |
| OS | Windows 11 Pro 10.0.26300，`MINGW64_NT-10.0-26300`（MSYS 3.6.10） | `uname -a` |
| Shell | Git Bash `/bin/bash.exe`，`BASH_VERSION=5.3.15(2)-release` | `echo $SHELL` / `$BASH_VERSION` |
| Node | **v24.22.1**（exit 0） | `node --version` |
| npm | **11.19.1**（exit 0） | `npm --version` |
| Node 路径 | `C:\Users\51054\AppData\Local\Programs\nodejs`（node、npm 均解析到此目录） | `which node npm` |
| engines 要求 | `node >=23.6`（`package.json`）→ 满足 | 只读查看 |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio` | `pwd` |
| 分支 | `feat/background-tasks-governance-and-reasoning` | `git branch --show-current` |
| PATH 说明 | 每条 bash 调用需先 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`；未导出时 `node: command not found` | 实测 |

`package.json` 相关脚本（只读确认）：

- `typecheck` = `tsc --noEmit`
- `typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`（`app/renderer/tsconfig.json` 内 `noEmit: true`；根 `tsconfig.json` 同样 `noEmit: true`）

## 二、工作树状态（命令前 / 命令后）

### 2.1 命令前（基线初始）

- `git rev-parse HEAD` → `c3693ecdcb78bd83def351c0f2967571dad7174c`（exit 0）
- `git status --short`（exit 0）：

```
 M docs/communication/memo.md
?? docs/communication/2026-10-22_intent_governance-split-1-3-5.md
?? docs/planning/
?? docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md
```

- `git diff --name-only`（exit 0）：`docs/communication/memo.md`；附带 Git 提示 `warning: in the working copy of 'docs/communication/memo.md', LF will be replaced by CRLF the next time Git touches it`
- `git diff --cached --name-only`（exit 0）：空

与任务书给出的预期基线完全一致：仅 `M docs/communication/memo.md`（沟通角色 memo，非本任务候选）与三项未跟踪管理记录（`docs/communication/` 确认记录、`docs/planning/`、`docs/scheduling/` 团队计划）。**无其他已跟踪代码/测试变化，故未触发停止条件。**

### 2.2 命令后

- `git rev-parse HEAD` → `c3693ecdcb78bd83def351c0f2967571dad7174c`（未变，exit 0）
- `git status --short`（exit 0）：

```
 M docs/communication/memo.md
?? docs/communication/2026-10-22_intent_governance-split-1-3-5.md
?? docs/planning/
?? docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md
?? "\350\247\222\350\211\262\345\215\241/\346\265\213\350\257\225/docs/change/2026-10-22-governance-split-1-3-5-baseline-evidence/"
```

（最后一项为本基线记录与原始日志，位于获准写区 `角色卡/测试/docs/`，未跟踪。）

- `git diff --name-only`（exit 0）：仍仅 `docs/communication/memo.md`（同 LF/CRLF 提示）
- `git diff --cached --name-only`（exit 0）：空

**结论**：除获准写区内新增的基线证据外，本角色未改任何产品代码/测试/配置，未暂存任何内容。

**并发产物说明（观察，非本角色写入）**：收尾时（约 17:33）`git status --short` 新增一条未跟踪文件 `?? docs/acceptance/governance-split-1-3-5-criteria-v1.md`（独立验收按计划 N2 与 N3 并行写入的实施前标准，文件头标明「标准版本 criteria-v1 / 待判定」）。该文件在两次全量测试与复跑**之后**才出现，不影响本记录任何测试结果；它属于 `docs/acceptance/`（内置独立验收写区），非测试角色写入，也非代码/测试变化。

## 三、命令、退出码与耗时

| # | 命令（均在仓库根运行） | 退出码 | 耗时（实测） | 关键输出 |
| --- | --- | --- | --- | --- |
| 1 | `git rev-parse HEAD` | 0 | — | `c3693ecdcb78bd83def351c0f2967571dad7174c` |
| 2 | `git status --short` | 0 | — | 见 §2（前后一致，后含本证据目录） |
| 3 | `git diff --name-only` | 0 | — | `docs/communication/memo.md`（LF→CRLF 警告） |
| 4 | `git diff --cached --name-only` | 0 | — | 空 |
| 5 | `npm run typecheck` | **0** | **1,459 ms** | 仅 npm banner + `tsc --noEmit`，无诊断输出 |
| 6 | `npm run typecheck:renderer` | **0** | **638 ms** | 仅 npm banner + `tsc -p app/renderer/tsconfig.json`，无诊断输出 |
| 7 | `node --test "test/**/*.test.ts"`（run1，基线主记录） | **1** | **23,129 ms**（Node 自报 duration 23,053.9 ms） | 3416 tests / 3386 pass / **12 fail** / 18 skipped / 0 todo；详见 §四、§五 |
| 8 | `node --test "test/**/*.test.ts"`（run2，稳定性对照） | **1** | **23,236 ms**（Node 自报 23,162.4 ms） | 3416 tests / 3388 pass / **10 fail** / 18 skipped / 0 todo；失败集 = run1 的确定性 10 项 |

补充复跑（用于失败分类，只读）：

| 命令 | 退出码 | 耗时 | 结果 |
| --- | --- | --- | --- |
| `node --test test/桌面应用/acceptance-dispatch.test.ts` | 0 | 16,147 ms | 34/34 pass，0 fail |
| `node --test test/桌面应用/dispatch-delivery.test.ts` | 0 | 17,811 ms | 52/52 pass，0 fail |

## 四、全量测试计数

| 轮次 | tests | pass | fail | cancelled | skipped | todo | duration_ms（Node） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| run1（基线主记录） | 3416 | 3386 | **12** | 0 | 18 | 0 | 23,053.8906 |
| run2（对照） | 3416 | 3388 | **10** | 0 | 18 | 0 | 23,162.3869 |

两次运行 fixtures 均使用临时目录，未在仓库内留下测试产物（见 §2.2 工作树核对）。

## 五、失败清单与分类

### 5.1 A 类：确定性既有失败（run1、run2 均出现，共 10 项）

**A1. Windows symlink EPERM（9 项，环境型）**——用例夹具调用 `fs.symlink`/`symlinkSync` 创建符号链接时被 Windows 拒绝（`EPERM`，errno -4048；当前进程未具备创建符号链接权限/未开启开发者模式）：

| # | 文件:行 | 失败用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:637` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:103` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

错误摘要（9 项同型）：`Error: EPERM: operation not permitted, symlink '<src>' -> '<dest>'`，发生在 `fs.symlink`/`symlinkSync`，属主机环境能力缺失，非产品缺陷；与历史基线记录的「Windows symlink EPERM」一致。

**A2. 工作树管理记录触发的既有失败（1 项，非产品缺陷）**

| 文件:行 | 失败用例 | 原因 |
| --- | --- | --- |
| `test/测试/real-entry.test.ts:38` | 真实入口:演示**不产生** docs/scheduling 记录(F3) | 该用例断言 `REPO_ROOT/docs/scheduling` 不存在（`existsSync === false`）；但当前工作树已有未跟踪的团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`，目录客观存在，断言为 `true !== false` |

分类说明：这是**基线工作树状态**导致的红（管理记录先于本任务已存在），不是产品行为缺陷、不是缺依赖、不是超时。终验（阶段 E）时只要该调度记录仍在工作树中，此用例预计仍会红；应作为「既有失败」对照，不得通过删除调度记录或改动断言来消除。

### 5.2 B 类：全量并发下的偶发时序失败（仅 run1 出现 2 项）

| 文件:行 | 失败用例 | 错误摘要 | 复核 |
| --- | --- | --- | --- |
| `test/桌面应用/acceptance-dispatch.test.ts:1265` | 2026-10-20 verifier settle ⇒ Lead 系统行含报告路径（同 flow+报告版本去重；不伪造结论；不重派 verifier） | `Error: 等待测试条件超时`（waitFor 上界约 3,143 ms 内未满足） | run2 全量通过；单文件复跑 34/34 通过 |
| `test/桌面应用/dispatch-delivery.test.ts:1023` | G-2/W1 role_status 呈现消歧（实机反馈 2026-10-17）：busy 时「当前轮：进行中」与「上一轮终局」分行、语义分开 | 断言期望「当前轮：进行中」，实测该角色 `busy=false`、`最近一轮：timed_out`（脚本轮次在全量负载下超时后已结束） | run2 全量通过；单文件复跑 52/52 通过 |

分类说明：两项均是时序敏感断言在 `node --test` 多文件并发负载下的偶发失败；当前无候选，不涉及本轮实施。若阶段 E 全量复现，应按「全量负载时序」归因并复跑单文件确认，不直接判为产品回归。

### 5.3 C 类：跳过（18 项，均为环境/平台型，按设计 skip）

- 1 项进程组收尾：`owned native process group cleanup kills a wrapper and child that ignore SIGTERM`（Windows 无 POSIX 信号语义）
- 1 项权限：`会话目录不可写：明确抛错（含目录与原因），绝不静默退化成「不落盘」`（`# chmod 语义在 Windows 不适用`）
- 15 项 D3 权限/模式/umask 用例（`D3 write and edit preserve existing ordinary modes…`、`D3 handler under strict umask…`、`D3 chmod failure…`、`D3 sync failure…`、`D3 AC3/5…`、`D3 AC4…`、`D3 AC5…`、`D3 AC6…`×2、`D3 AC7…`、`D3 finalMode…`、`D3 严格 umask…`、`D3 chmod 失败…`、`D3 sync 失败…`、`D3 chmod 完成后中止…`）
- 1 项权限读取：`unreadable（权限）：文件不可读 → status=unreadable、actual=null`

### 5.4 失败按目录归类（run1）

| 目录 | fail 数 | 分类 |
| --- | --- | --- |
| `test/claude-adapter/` | 1 | A1 环境（EPERM） |
| `test/codex-adapter/` | 1 | A1 环境（EPERM） |
| `test/pi-adapter/` | 2 | A1 环境（EPERM） |
| `test/runtime-core/` | 3 | A1 环境（EPERM） |
| `test/桌面应用/` | 2 | B 偶发时序（run2 未复现） |
| `test/测试/` | 2 | A1 环境（EPERM）1 + A2 工作树状态 1 |
| `test/编排/` | 1 | A1 环境（EPERM） |

## 六、候选身份

- **本阶段无候选**：仅记录 `HEAD = c3693ecdcb78bd83def351c0f2967571dad7174c`（命令前后一致）。
- 未修改任何产品代码/测试文件；`git diff` 的已跟踪改动前后均只有既有的 `docs/communication/memo.md`（非本任务产物）；无暂存内容。
- 未运行 `npm install`；`package.json`/`package-lock.json` 未改动。

## 七、未执行项与限制

- 按任务书**未运行** `npm run build:renderer`（会写 `app/renderer/dist/`，属桌面UI 目录，不在测试角色写区）。
- 按任务书**未运行** `npm run app`（真实启动/演示属阶段 E）。
- 本基线只覆盖 Node 层全量测试与两项 typecheck；未跑 Electron e2e（`test/桌面应用/e2e/main.mjs`）、uiux 套件、真实模型/网络、打包检查——这些留阶段 E 按验收标准执行。
- `node --test` 默认并发运行测试文件，本机负载下存在偶发时序失败（§5.2 已实证），终验对照时需留意。

## 八、证据文件

目录：`角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `typecheck.log` | `npm run typecheck` 原始输出（exit 0） |
| `typecheck-renderer.log` | `npm run typecheck:renderer` 原始输出（exit 0） |
| `full-test-node.log` | run1 全量原始 stdout/stderr（含失败详情与汇总） |
| `full-test-summary.txt` | run1 退出码与耗时（exit_code=1，duration_ms=23129） |
| `full-test-node-run2.log` | run2 全量原始输出（稳定性对照） |
| `full-test-summary-run2.txt` | run2 退出码与耗时（exit_code=1，duration_ms=23236） |
| `rerun-acceptance-dispatch.log` | `acceptance-dispatch.test.ts` 单文件复跑（34/34，exit 0） |
| `rerun-dispatch-delivery.log` | `dispatch-delivery.test.ts` 单文件复跑（52/52，exit 0） |

本记录：`角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-baseline.md`

## 九、边界声明

本阶段仅写 `角色卡/测试/docs/`（本记录与上述证据目录）。未修改产品代码、测试源码、角色卡、边界、`docs/scheduling/`、`docs/acceptance/`；未在 `test/桌面应用/` 新建文件；未暂存、提交、推送、合并或发布；未运行 `npm install`、未改 `package.json`/`package-lock.json`。
