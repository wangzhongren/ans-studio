# 变更记录：E3-F 终验——全量 T3 回归 + 删除清单核实 + typecheck（删除全部预知式门控，2026-11-08）

- 任务节点：**E3-F 终验执行**（团队计划 `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md` §5.1/§5.7/§6.1；派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §一/§三/§四；B1 v1 §1/§4）
- 角色：测试（`roleId: 测试`，独立验证上下文；**只取证，不判验收**）
- 日期：2026-11-08（本地 19:30–20:09；权威 T3 运行 19:32:55–20:00:47，墙钟约 27.9 分钟；隔离复跑 20:04:43–20:05:51；稳定性 20:06:44；typecheck 20:07:06）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 证据目录：`角色卡/测试/docs/change/2026-11-08_E3-F_evidence/`
- 纪律：只读 `src/ app/ test/`；**未修改任何产品/测试源码**（运行前后候选聚合/manifest/status 逐行 diff 0）；未 commit / push / stash / merge / 发布；未运行真实模型/Electron/CDP（RR 为独立节点）；未删测试/放宽断言/加 skip；**全程未使用 `--test-force-exit`/`--test-timeout`**。

## 0. 结论摘要（先读，事实）

1. **候选冻结成立**：HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`）/ 分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` = **38 行（17 M + 21 ??，0 删除）**，与 D1 一致；候选 38 文件逐文件 raw SHA-256 可复算聚合 **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`** = D1 值（运行前/中/后同值）；`src app test` manifest **1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**（运行前/中/后 diff 0 行）。T1 三文件在 HEAD 基线内（哈希 `afe70c62…`/`f0db260e…`/`358ac967…`，不属候选 delta）。
2. **测试文件枚举**：**540** 个 `*.test.ts`；与第一变更 E3 的 520 文件清单对照：**新增 20、删除 0**（19 个本变更新增测试文件 + 1 个第一变更 B2 补证文件）；与参照组合 521 对照：**新增 19、删除 0**。
3. **权威 T3 运行（一次，隔离）**：540 文件逐文件独立进程 `timeout -k 5 <TO> node --test --test-concurrency=1 <file>`；**534 个自然完成文件 + 6 个登记挂起文件（90s watchdog，不计通过）**；无未登记 watchdog、无 no-summary、无解析异常。退出码分布：自然完成 463×exit 0 / 71×exit 1；挂起 6×exit 124（`killed=1`，均为登记的 90s 档）。
4. **计数（自然完成 534 文件）**：**5,032 tests / 4,807 pass / 192 fail / 1 cancelled / 32 skipped / 0 todo**。
   - 参照组合（第一变更 E3 `5cba2d54…` 4,979/4,750/196/1/32 + B2 补证 `54c0db31…` +3/3）＝**4,982 / 4,753 / 196 / 1 / 32**。
   - 差异分解（对账见 `40-comparison/count-reconciliation-vs-ref.md`）：同路径既有文件 4,988/4,763/192/1/32；本变更新增 19 文件 44/44/0/0/0；**+50 tests（新增用例）/ +54 pass / −4 fail / skip 不变**。
5. **与参照失败多重集（文件+测试名）逐条 diff**：参照 195 可信对（实际 fail 196）、本轮 192 对（实际 fail 192）：
   - **新增失败 1 条**：`test/桌面应用/chief-workflow.test.ts`「W20 …真实R9竞争」——**ENOTEMPTY 清理竞态**；同候选隔离复跑中该变体通过、同组另一 W20 变体失败、整组失败集合再次变化 ⇒ **非确定性（清理/时序族），非新增确定性失败**。
   - **既有失败消失 4 条**：chief-workflow「W47 select」「W47 revise」「selected」（隔离复跑中 select/selected 再次失败，波动族；W4/D1/参照均登记）＋ `test/测试/t1-real-cli.test.ts`「T1 actual bin govern/codex…」（参照失败原因 `runtime-prepared-configuration-changed`；本变更 W1 证据明示 F5/R9 后该路径回落工厂不再抛该码 ⇒ **预期红→绿**；该用例在本候选 W5-before/after、D1、本轮主跑与复跑 **5/5 次通过**）。
   - **新增 skip = 0、既有 skip 消失 = 0**（31 条打印 skip 名逐条一致；32 总数含 1 条源内未打印 skip，与参照同口径）；cancelled 1 条与参照同（`turn-watch-verify/b-last-resort` 10s 超时计 cancelled）。
6. **D1 已分类环境性差异在本轮的复现情况**：**均未复现**——`git-role-workflows-e2e` 自然退出 **195.3s**（参照 195.4s；未触 300s watchdog；19/7/0/0/12 与参照一致）；chief-workflow **W29 组 12s 超时未复现**（主跑 5.5–6.2s 全过；隔离复跑亦全过）；Node runner 原生崩溃类（e-pi/git-trunk-store/g5 c-claude）均自然通过（11/11、13/13、6/6）。本轮唯一新增失败为上述 ENOTEMPTY 清理竞态。
7. **本变更新增测试**：19 个新文件 **44 用例全部 pass**（0 fail/0 skip/0 todo）；4 个既有测试文件内新增 **6 用例全部 pass**（session-lifecycle +3、rapporteur +1、stable-write +1、chief-workflow +1）。Q16 改写项 q9（1/1）、N15（10/10）均绿。
8. **删除清单/死代码扫描（限本变更）**：退役 6 码在 `src/` 仅 4 行注释、`app/` 0 命中（生产零产生；测试内均为负向断言/注释）；旧名 `inspectInitializationProtection` 仅 `src/` 1 行溯源注释、`app/` 0、`test/` 7 处注释/源码断言；新码 3 个均存在并被使用；写门零 `applicationMediation`（gate 与调用点零读取；`git-command.ts:164` 仅白名单注释）；drain 无 `native:` 前缀通配（显式逐字白名单，`native:pi-sdk-idle-not-observed` 不在白名单）；sidecar 预算常量 4 KiB/16/64 KiB（`4*1024`/`16`/`64*1024`）且被强制；**无新增运行时回切开关（Q18）**（tracked diff 新增行无 `process.env`/`ANS_*`；新测试文件仅使用既有环境变量夹具）。
9. **静态门**：`npm run typecheck`（`tsc --noEmit`）**exit 0**；`typecheck:renderer`/`build:renderer` **N/A**（候选 `app/` 仅 `app/desktop/session.ts`，`app/renderer/**` 与 `app/main.ts` 零改动——见 `23-renderer-na-basis.log`）。
10. **综合（事实陈述，不判验收）**：**新增确定性失败 = 0、新 skip = 0**；候选运行前后不变；所有与参照的差异均已逐条分类（非确定性清理/时序族、预期红→绿、D1 环境差异未复现）。

## 1. 输入（只读，写盘前实测）

| 输入 | 实测 |
| --- | --- |
| 团队计划 | `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / `911ff546…`） |
| B1 v1（冻结） | `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / `3306b9d4…`；BASE-1/BASE-4、B1-EV1/EV2） |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`（104 行 / `5de8a556…`；§一 参照组合 = `5cba2d54…`+`54c0db31…`；§三 I0 冻结；§四 D1/RR 完成） |
| 参照记录（只读） | `角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`（169 行 / `5cba2d54…`；4,979/4,750/196/1/32）＋ `2026-11-08_B2-gap-integration.md`（89 行 / `54c0db31…`；+3/3）⇒ 组合 **4,982/4,753/196/1/32** |
| 方法参照（第一变更 E3） | 同上 E3 记录 §2（逐文件独立进程、自然 EXIT、挂起登记、不得 force-exit）；证据 `2026-11-08_E3-T3-full-regression-evidence/`（run-t3-per-file.sh、40-compare-vs-e3.sh、ref 失败/skip 集） |
| D1 证据（只读） | `角色卡/测试/docs/change/2026-11-08_D1_remove-predictive-gates.md`（205 行 / `10418f38…`；候选 `9462391e…`、manifest 1,099/`bf190ee5…`、环境性差异 2 处） |
| 各批证据（只读） | W1 `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md`（F5/R9 `runtime-prepared-configuration-changed` 语义）、W2/W3a/W3b（编排）、W4（桌面）、W5 `2026-11-08_W5_remove-predictive-gates.md`（`8d678fff…`）、RR `c40011de…` |
| 渲染依据 | `40-comparison/../23-renderer-na-basis.log` |

## 2. 候选身份（BASE-4 口径）

### 2.1 HEAD / 分支 / scope

- HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`；tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`；分支 `feat/plan-escalation-card`；暂存区 0。
- `git status --porcelain -- src app test`（`01-scope-status-opening.txt`）：**38 行 = 17 ` M` + 21 `??` + 0 删除**。全部属本变更 delta（W1/W2/W3a/W3b/W4/W5）；T1 三文件在 HEAD 基线内、不入 delta（`14-t1-files-hashes.txt`）。

### 2.2 逐文件 raw SHA-256 与聚合（算法明文）

- 38 个候选文件：`02-scope-changed-paths.txt`；逐文件 `sha256sum --text`：`04-candidate-hashes-lines.txt`（38 行）。
- **聚合算法（明文）**：每文件取 raw SHA-256（原字节；`sha256sum --text` 与二进制模式哈希一致，仅分隔符两空格），生成整行 `<raw_sha256>  <path>`（两空格；path 为仓库根相对路径、UTF-8 原字面、正斜杠；非 ASCII 路径经 `git -c core.quotepath=false` 取得）；整行 `LC_ALL=C sort` 后对结果文件取 SHA-256。
- **结果**：**`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（`05-candidate-aggregate.txt`；`04b-candidate-hashes-lines-sorted.txt` 自身哈希 = 该值，可复算）——**与 D1 `9462391e…` 逐字一致**。
- 运行后复算：同值；逐行 diff 0（`24c-candidate-aggregate-post.txt`、`24d-candidate-diff.txt`）。

### 2.3 `src app test` manifest

- 口径：`git -c core.quotepath=false ls-files --cached --others --exclude-standard -- src app test`，`LC_ALL=C sort`；逐文件 `sha256sum --text` 生成 `<sha256>  <path>` 行并 `LC_ALL=C sort`；对结果取 SHA-256。
- **运行前**（`06c-manifest-summary-pre.txt`）：**1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**——与 D1 一致。
- **运行中**（`31b-midrun-manifest-summary.txt`）与**运行后**（`22c-manifest-summary-post.txt`）：同值；`diff` 均 0 行（`31b-manifest-diff-midrun.txt`、`22d-manifest-diff.txt`）。
- scope status 前/后逐行 diff 0 行（`50c-scope-diff.txt`）。

### 2.4 测试文件枚举与对参照 diff

- 当前 `test/**/*.test.ts`：**540**（`20-all-test-files.txt`；按 `src app test` manifest 口径枚举，`test/` 下无 `src/**` 测试文件）。
- 对第一变更 E3 520 文件清单（`2026-11-08_E3-T3-full-regression-evidence/20-all-test-files.txt`）：**新增 20、删除 0**（`21-test-file-diff-vs-E3.txt`）——20 = 本变更 19 个新测试文件 + 第一变更 B2 补证文件 `test/测试/session-admission-approval-b2-gap-integration.test.ts`。
- 对参照组合 521（520 + B2 补证）：**新增 19、删除 0**（`21b-test-file-diff-vs-combined.txt`）。
- 本变更 21 个未跟踪文件含 2 个非测试夹具（`test/测试/git-action-cross-runtime-fixture.ts`、`test/编排/fixtures/git-action-authorization-wiring.ts`），不计入 540。

## 3. 环境与方法

- OS Windows 11 Pro 10.0.26300 / Git Bash（MINGW64）/ Node **v24.22.1** / npm 11.19.1 / Git 2.55.0.windows.5（`00-opening-state.log`）。
- **逐文件独立进程自然运行**：`timeout -k 5 <TO> node --test --test-concurrency=1 <file>`（harness `run-e3f-per-file.sh`；每文件记录 TO/force/ec/killed/summary/tests/pass/fail/cancelled/skipped/todo/duration/wall，`31-t3-per-file-results.tsv` 540 行 + DONE）。
- watchdog：**6 个登记挂起文件 90s**（与 B0/E3 同名单：`test/pi-adapter/write-sequencing.test.ts`、`test/测试/customer-authorization-plane-integration.test.ts`、`test/桌面应用/directive-decision.test.ts`、`test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/session-rebuild-race.test.ts`、`test/桌面应用/stuck-redispatch.test.ts`）；其余 **300s**。`killed=1` 仅当 exit=124（timeout SIGTERM，必要时 -k 5 SIGKILL）。**force 列全为 0：未使用 `--test-force-exit`；命令未使用 `--test-timeout`。**
- 运行隔离：权威运行期间无其它测试进程（开工时仅 1 个既有 Codex artifact host-daemon node 进程，非测试）；运行中仅本轮次 harness 与其子进程；manifest 快照（运行中一次）见 §2.3。隔离复跑在主运行结束后单独执行。
- 解析口径沿用参照 `40-compare-vs-e3.sh`：末段 `✖ failing tests:` 的 `test at <loc>` + `✖ <name>` 配对（路径 `/`、去行号列号/耗时）；可信条件：配对数=summary fail（chief-workflow 例外：配对 ≤ fail）或 fail=0 且 cancelled=配对数（turn-watch cancelled 口径；与参照对齐）。skip 取 `﹣ … # SKIP`。
- 日志目录：`logs/`（540 个逐文件原始日志）。

## 4. 权威运行结果

| 范围 | 文件 | tests | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 参照组合既有文件（同路径，自然完成） | 515 | 4,988 | 4,763 | 192 | 1 | 32 | 0 |
| 本变更新增文件（19） | 19 | 44 | 44 | 0 | 0 | 0 | 0 |
| **本次权威合计（自然完成）** | **534** | **5,032** | **4,807** | **192** | **1** | **32** | **0** |
| 未计入：6 个登记挂起（90s watchdog，不计通过） | 6 | —（部分 summary 见 `40-comparison/hang-and-timeout.txt`） | | | | | |

- 状态分布：`natural-exit 534 / registered-hang-timeout 6`；`watchdog-killed 0`；`natural-exit-no-summary 0`（`40-comparison/status-counts.tsv`；`anomalies.txt`、`parse-not-ok-files.tsv` 为空）。
- 登记挂起（全部 90s、exit 124）：`write-sequencing`、`customer-authorization-plane-integration`、`directive-decision`、`optional-acceptance`、`session-rebuild-race`、`stuck-redispatch`（名单与参照 6 个一致，无变化）。
- 按目录（`40-comparison/aggregate-by-dir.tsv`）：`runtime-core` 59 文件 535/498/33/0/4；`编排` 107 文件 1,122/1,098/22/0/2；`测试` 子树合计 **681/624/38/1/18**（106 自然 + 1 挂起）；`桌面应用` 55 文件 636/556/80/0/0；`桌面UI` 58 文件 443/443/0；`pi-adapter` 42 自然 361/358/2/0/1；`装配` 11 文件 89/77/12；`门禁引擎` 41 文件 449/443/5/0/1；其余与参照一致。
- 逐文件明细：`31-t3-per-file-results.tsv`（540 行）＋ `logs/`（540 日志）。

## 5. 与参照组合的逐条对照

### 5.1 计数对账（详见 `40-comparison/count-reconciliation-vs-ref.md`）

- 同路径文件仅 5 个计数差（`40-comparison/count-deltas-vs-ref.tsv`）：

| 文件 | 参照（t/p/f/c/s） | 本轮 | 归因 |
| --- | --- | --- | --- |
| `test/runtime-core/session-lifecycle.test.ts` | 20/20/0/0/0 | 23/23/0/0/0 | W1 新增 3 个 F7/C9 drain 用例（全 pass） |
| `test/编排/rapporteur-module-consumption.test.ts` | 7/7/0/0/0 | 8/8/0/0/0 | W2 新增 1 个 C5 drain 用例（pass） |
| `test/编排/stable-write-runtime.test.ts` | 7/7/0/0/0 | 8/8/0/0/0 | W2 新增 1 个语义收窄用例（pass） |
| `test/桌面应用/chief-workflow.test.ts` | 58/44/14/0/0 | 59/48/11/0/0 | W4 新增 1 用例（pass）＋波动族（见 §5.2） |
| `test/测试/t1-real-cli.test.ts` | 6/2/4/0/0 | 6/3/3/0/0 | 参照失败 1 条消失（见 §5.2，预期红→绿） |

- 总和：4,982 + 44（新文件）+ 5（上表前三新增）+ 1（chief 新用例）= 5,032 tests；pass/fail 逐项对账成立（见对账文件算式）。

### 5.2 失败/skip 多重集 diff（文件 + 测试名）

| 指标 | 值 |
| --- | --- |
| 参照可信失败对 / 实际 fail | 195 / 196 |
| 本轮可信失败对 / 实际 fail | 192 / 192 |
| **新增失败** | **1**（chief-workflow W20 R9竞争） |
| **既有失败消失** | **4**（chief-workflow W47 select、W47 revise、selected；t1-real-cli govern/codex） |
| 新增 skip / 消失 skip | **0 / 0**（31 条打印名逐条一致；总数 32 与参照同口径） |
| cancelled | 1（`test/测试/turn-watch-verify/b-last-resort.test.ts` 3/2/0/1，与参照同） |

**新增失败 1 条（分类：非确定性清理竞态，非新增确定性失败）**：

| # | 文件 | 测试名 | 事实 |
| --- | --- | --- | --- |
| 1 | `test/桌面应用/chief-workflow.test.ts` | W20 默认Core/Chat产品真实报告落账并到chief 真实R9竞争 | 失败为 fixture 清理竞态 `ENOTEMPTY: … rmdir 'C:\Users\51054\AppData\Local\Temp\ans-w20-product-CdVQYq'`（非产品断言）；**隔离复跑 #1**（`52-isolated-chief-workflow-rerun1.log`）：59/43/16/0/0，W20 R9 变体通过、W20 普通变体失败、失败集合再次变化（W47 select/selected/commit-race/W30 进出）；同族已在第一变更 E3 §3.4/§3.5（4 次 15/14/11/14）、W4（before 58/47/11、after1 59/43/16、after2 59/45/14）、D1（59/42/16）及辅助 B0（W20 为 B0-only 条目）登记 |

**既有失败消失 4 条（逐条分类）**：

| # | 文件 | 测试名 | 分类与证据 |
| --- | --- | --- | --- |
| 1 | chief-workflow | W47 默认Core/Codex本地HTTP：忙Chief独立select… | 波动族：本轮主跑通过；隔离复跑再次失败；W4 三次运行均含 W47 组（before ×2、after1 ×2、after2 select） |
| 2 | chief-workflow | W47 默认Core/Codex本地HTTP：忙Chief独立revise… | 同上（W4 before/after1 均失败；本轮主跑/复跑通过） |
| 3 | chief-workflow | selected | 波动族：主跑通过、复跑失败；W4 after1/after2 与 D1 均失败 |
| 4 | `test/测试/t1-real-cli.test.ts` | T1 actual bin govern/codex: actual adapter and registered handler reject an out-of-boundary write | 参照失败信息 `ans govern 失败：runtime-prepared-configuration-changed`；测试文件不在本变更 delta，但产出模块 `src/service/runtime/session.ts` 在 delta；W1 证据明示 F5/R9 后 `ensureAdapter` 无 adapter 时回落工厂、不再抛该码（设计 F5/P1.2-AC-27）。本候选该用例 **5/5 次通过**（W5-before/after、D1、本轮主跑、本轮复跑）⇒ **预期红→绿**,非新增失败 |

**D1 已分类环境性差异的延续与复现情况**：

| D1 差异 | 本轮观测 | 结论 |
| --- | --- | --- |
| `git-role-workflows-e2e` 300s watchdog（W5 基线 203s；D1 主跑 298.7s/复跑 260.0s） | **自然退出 195.3s**（参照 195.4s；19/7/0/0/12 与参照一致） | **未复现**（机器本轮不为慢机；未触 300s） |
| `chief-workflow` W29 组 12s 测试超时（D1 环境稳定复现） | W29 四变体主跑 **全过**（5.5–6.2s）；隔离复跑亦全过 | **未复现** |
| Node runner 原生崩溃/清理抖动（e-pi、git-trunk-store、g5 c-claude、application-line、download-provider） | e-pi 11/11、git-trunk-store 13/13（59.6s）、c-claude 6/6、download-provider 14/14、interactive-execution-mode 5/5；application-line 1 fail（**与参照同一测试名，非差异**） | 崩溃类**未复现**；application-line 与参照一致 |

### 5.3 预期红→绿 / Q16

- `test/测试/session-admission-approval-q9-integration.test.ts`：**1/1 pass**；`test/测试/runtime-dispatch-gate-integration.test.ts`：**10/10 pass**——Q16 取代改写后保持全绿（参照中两者亦为绿，故无多重集差异；W5 证据的 before 红→after 绿记录为本变更内部对照）。
- F5/R9 相关：`test/测试/t1-real-cli.test.ts` govern/codex 消失失败（§5.2 #4）；`test/runtime-core/codex-native-optional.test.ts` 4/4 pass（含 `ensureAdapter` 不再 `runtime-prepared-configuration-changed` 的确定性用例）。

## 6. 本变更新增测试文件与用例（逐条，全绿）

19 个新文件 = 44 用例，**44/44 pass**（`40-comparison/new-files-results.tsv`；逐用例 `42-new-files-cases.tsv`）：

| 文件 | tests/pass/fail/cancel/skip |
| --- | --- |
| `test/runtime-core/codex-native-optional.test.ts` | 4/4/0/0/0 |
| `test/runtime-core/drain-predicate.test.ts` | 5/5/0/0/0 |
| `test/测试/git-action-cross-runtime-init.test.ts` | 2/2/0/0/0 |
| `test/测试/git-action-cross-runtime-pi-init.test.ts` | 1/1/0/0/0 |
| `test/测试/git-action-cross-runtime-codex-init.test.ts` | 1/1/0/0/0 |
| `test/测试/git-action-cross-runtime-audit-failure.test.ts` | 1/1/0/0/0 |
| `test/测试/run-stop-host-continuation-integration.test.ts` | 3/3/0/0/0 |
| `test/编排/git-action-authorization-gate.test.ts` | 5/5/0/0/0 |
| `test/编排/git-action-authorization-sidecar.test.ts` | 6/6/0/0/0 |
| `test/编排/git-action-authorization-wiring.test.ts` | 2/2/0/0/0 |
| `test/编排/git-action-authorization-wiring-retry.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-publication.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-publication-audit-failure.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-document.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-document-audit-failure.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-initial-workflow.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-initial-workflow-audit-failure.test.ts` | 1/1/0/0/0 |
| `test/编排/git-action-authorization-wiring-audit-failure.test.ts` | 1/1/0/0/0 |
| `test/编排/git-operation-sidecar-tolerance.test.ts` | 6/6/0/0/0 |
| **合计** | **44/44/0/0/0** |

既有测试文件内新增用例（+6，全部 pass；逐名见 §5.1 及 `40-comparison/` 日志）：
- `test/runtime-core/session-lifecycle.test.ts` +3（F7/C9 drain、非 idle Pi 阻断）
- `test/编排/rapporteur-module-consumption.test.ts` +1（C5 run-stop drain）
- `test/编排/stable-write-runtime.test.ts` +1（`git-old-core-programs-unproven` 语义收窄）
- `test/桌面应用/chief-workflow.test.ts` +1（桌面 run-stop drain）
- 未删除任何既有用例（对参照同名用例 diff：除波动进出外无删除；测试文件清单删除 0）。

## 7. 删除清单 / 死代码扫描（限本变更；原始输出见证据目录）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 退役码生产零产生：`git-core-creation-proof-unavailable`/`git-native-surface-unproven`/`git-unclosed-effect-registered`/`official-pure-preparation-unproven`/`required-scope-unconfined-script-tools`/`runtime-protected-scope-unmediated-app-execution-planned` | `src/` **仅 4 行注释**（`model/runtime.ts:401`、`run-role.ts:750`、`service/runtime/session.ts:245,450`）；`app/` **0**；`test/` 均为**负向断言/注释**（断言 `includes(...) === false` / 源码文本不存在） | `26-retired-codes-scan.txt` |
| 旧名 `inspectInitializationProtection` | `src/` 仅 `trunk-runtime.ts:68` 溯源注释 1 处；`app/` 0；`test/` 7 处注释/源码断言；生产函数为 `inspectGitActionAuthorization`（`trunk-runtime.ts:134`） | `25b-inspect-initialization-protection-scan.txt` |
| 新码存在：`git-action-audit-unavailable`/`git-core-in-flight-unproven`/`git-core-inspection-unavailable` | 存在并被使用：`trunk-runtime.ts:210,216,225,230,300,323`；`git-command.ts:180,195,273,361,404`；`public/trunk-store.ts:52`（注释） | `27-new-codes-scan.txt` |
| 写门零 `applicationMediation` | gate 文件 `trunk-runtime.ts` **0 命中**；写路径其余文件无读取（`git-command.ts:164` 仅白名单注释“无 applicationMediation”）；其余命中均为 PR #72 类型/包装层（`model/runtime.ts:244`、`service/runtime/session.ts`、`common/gates/index.ts`、`provider/claude/session.ts`） | `28-write-gate-applicationMediation-scan.txt` |
| drain 无 `native:` 前缀通配 | 显式白名单 `DRAIN_EVIDENCE_ONLY_REASONS`（2 项）/`DRAIN_NATIVE_EVIDENCE_REASONS`（4 项逐字），谓词 `isRuntimeSessionDrained` 仅集合成员判定（`runtime.ts:486–515`）；**无** `startsWith/includes("native:")` 之类通配；`native:pi-sdk-idle-not-observed` 不在白名单（`runtime.ts:494`；发射点 `pi-adapter/real-adapter.ts:1461`，包装层加前缀）；使用点：`app/desktop/session.ts`、`run-role.ts`、`trunk-runtime.ts`、`service/runtime/session.ts`、`apply-journal.ts` | `29-drain-whitelist-scan.txt` |
| sidecar 预算常量 | `GIT_ACTION_AUTHORIZATION_MAX_LINE_BYTES = 4*1024`（4 KiB）、`MAX_ATTEMPTS = 16`、`MAX_FILE_BYTES = 64*1024`（64 KiB），并在 append/read 强制（行/尝试/文件预算） | `30-sidecar-budget-scan.txt` |
| Q18 无新增运行时回切开关 | tracked diff（`src app`）新增行 **无** `process.env`/`ANS_*`；新测试文件仅使用既有变量（`ANS_CODEX_WIRE_API`/`ANS_CODEX_WEB_SEARCH` 与夹具 key） | `25-q18-switch-scan.log` |

## 8. 静态门

- `npm run typecheck`（`tsc --noEmit`）：**exit 0**（`21-typecheck.log`；20:07:06–20:07:08 UTC+8）。
- `typecheck:renderer`/`build:renderer`：**N/A**。依据：候选 `app/` 仅 `app/desktop/session.ts`；`git status --porcelain -- app/renderer app/main.ts` 为空、候选清单 0 个 `app/renderer/` 路径（`23-renderer-na-basis.log`）；与团队计划 §5.7「渲染按需（预期 N/A 并给依据）」一致。

## 9. 候选与稳定性（运行前 / 中 / 后）

| 项 | 运行前 | 运行中 | 运行后 | 结论 |
| --- | --- | --- | --- | --- |
| HEAD / tree / 分支 | `3f249e2…` / `728301d8…` / `feat/plan-escalation-card` | 同 | 同 | 不变 |
| 暂存 | 0 | — | 0 | 不变 |
| scope status（38 行） | `01-scope-status-opening.txt` | — | `50b-scope-status-post.txt` | diff 0 行 |
| 候选聚合（38 文件） | `9462391e…` | — | `9462391e…` | 同值、逐行 diff 0 |
| manifest（1,099 文件） | `bf190ee5…` | `bf190ee5…` | `bf190ee5…` | diff 0 行 |
| T1 三文件 | `afe70c62…`/`f0db260e…`/`358ac967…` | — | 同 | 不变 |

- 结论：**全部 T3 运行未改动任何产品/测试源码**；候选在运行期间未被外部改写（无并行写入）。

## 10. 限制与如实边界

1. 本记录只证明所列命令/文件集/环境下的观察；不判验收；E3-F 出口由 B2 独立验收依据 B1 v1 判定。
2. 失败/skip 对照采用与第一变更 E3 相同口径（文件+测试名多重集；chief-workflow 例外与 cancelled 口径已对齐）。chief-workflow 本轮实际 fail=11 而可配对 10（1 个重复 ✖ 条目未配对）；参照为 fail=14/配对 12。两者均按参照方法以「配对 ≤ fail」接受，并在对账文件中说明。
3. 环境性/非确定性：chief-workflow 清理/时序族（ENOTEMPTY/AggregateError/waitFor）为主观测量结果，本轮主跑与复跑失败集合不同；该族不构成本候选的确定性回归（候选冻结、同候选多轮证据）。
4. `t1-real-cli` govern/codex 的消失归因为「与 W1 证据明示的 F5/R9 语义一致的预期红→绿」是基于（测试文件不在 delta、产出模块在 delta、W1 文档、本候选 5/5 通过）的证据链；E3-F 不作验收判定。
5. 挂起文件按登记 90s 记录部分 summary，不计入通过/失败；未使用 `--test-force-exit`/`--test-timeout` 冒充自然通过。
6. 本轮机器性能与参照 E3 相当（e2e 195.3s vs 195.4s、git-trunk-store 59.6s vs 64.2s），D1 期慢机现象未持续。

## 11. 纪律声明

- 只写本记录与 `2026-11-08_E3-F_evidence/`（含 540 个逐文件原始日志、逐文件结果、对照文件、扫描日志、候选/manifest 快照）；**未修改 `src/`、`app/`、`test/`、`docs/`、角色卡/边界/YAML**（候选运行前后逐行 diff 0 可证）。
- 未 commit / push / 暂存 / merge / 发布；未 `npm install`；未运行真实模型/Electron/CDP。

## 12. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_E3-F_evidence/`（完整逐文件 SHA-256/行数/bytes 见 `evidence-index.md`）

| 文件/目录 | 说明 |
| --- | --- |
| `00-opening-state.log` | 开工身份/环境/status/进程 |
| `01-scope-status-opening.txt` / `02-scope-changed-paths.txt` | 38 文件 scope（17 M + 21 ??） |
| `04-candidate-hashes-lines.txt` / `04b-candidate-hashes-lines-sorted.txt` / `05-candidate-aggregate.txt` | 候选逐文件哈希与聚合 `9462391e…` |
| `06-manifest-*` / `31b-midrun-manifest-*` / `22a-22d-manifest-*` | manifest 前/中/后（1,099 / `bf190ee5…`；diff 0） |
| `14-t1-files-hashes.txt` / `51-t1-hashes-post.txt` | T1 三文件（基线内，不入 delta） |
| `20-all-test-files.txt` / `21-test-file-diff-vs-E3.txt` / `21b-test-file-diff-vs-combined.txt` | 540 测试文件与参照 diff（新增 20/0 删除；组合口径 19/0） |
| `run-e3f-per-file.sh` / `31-t3-per-file-results.tsv`（540 行 + DONE）/ `31-t3-progress.log` / `31-node-leftovers.log` | 权威逐文件运行 |
| `logs/`（540 个 `.log`） | 逐文件原始日志 |
| `40-compare-vs-ref.sh` / `40-comparison/` | 对参照组合的多重集对照（summary/new/missing/skip/状态/hang/count-deltas/count-reconciliation/分类） |
| `42-extract-new-cases.sh` / `42-new-files-cases.tsv` | 新增文件逐用例（44 全 pass） |
| `52-isolated-chief-workflow-rerun1.log` / `53-isolated-t1-real-cli-rerun1.log` | 新增失败与消失失败的隔离复跑 |
| `25-q18-switch-scan.log` / `25b-inspect-initialization-protection-scan.txt` / `26-retired-codes-scan.txt` / `27-new-codes-scan.txt` / `28-write-gate-applicationMediation-scan.txt` / `29-drain-whitelist-scan.txt` / `30-sidecar-budget-scan.txt` | 删除清单/死代码扫描 |
| `23-renderer-na-basis.log` / `21-typecheck.log` | 静态门与渲染 N/A 依据 |
| `50-post-stability.sh` / `50-post-stability.log` / `50b-scope-status-post.txt` / `50c-scope-diff.txt` / `24b-24d-candidate-*` / `22c-22d-manifest-*` | 收工稳定性（全部 diff 0） |
| `99-evidence-index.sh` / `evidence-index.md` | 证据索引（逐文件 SHA-256/行数/bytes） |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。
