# D1 确定性验证证据：删除全部预知式门控（受影响套件 + typecheck）

- 任务：`2026-11-08-remove-predictive-gates` / 节点 **D1 确定性验证**（团队计划 `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md` §5.5、§6.1；派发记录 `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md` §一/§三/§四）。
- 角色：测试（`roleId: 测试`；独立验证上下文；**只取证、不判验收**）。
- 日期：2026-11-08（本地 18:35–19:01；套件运行 18:38:47–18:54:06 UTC+8；隔离复跑至 19:01:38；typecheck 19:01:46）。
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）。
- 纪律：只读 `src/ app/ test/`；**未修改任何产品/测试源码**；未 commit / push / 暂存 / 合并 / 发布；未运行真实模型/Electron/CDP（RR 为独立节点）；未删除/放宽断言、未加 skip、**全程未使用 `--test-force-exit`/`--test-timeout`**。只写本记录与 `2026-11-08_D1_evidence/`。

## 0. 结论摘要（先读）

1. **候选身份**：HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`（tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`）/ 分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` = **38 行（17 修改 + 21 新增、0 删除）**，全部属本变更 delta；T1 三文件已在 HEAD 基线内、不属候选。候选 **38 文件**逐文件 raw SHA-256 与各批证据 **38/38 逐字一致**；可复算聚合 **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（运行前后同值）。
2. **稳定性**：`src app test` manifest **1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**，D1 运行前/后逐行 **diff 0 行**；scope status 前后 diff 0 行；HEAD/tree/分支/暂存 0 不变。
3. **权威运行（276 文件，逐文件独立进程，`node --test --test-concurrency=1`）**：合计 **2,429 tests / 2,291 pass / 111 fail / 2 cancelled / 25 skipped**；2 个 watchdog（90s 登记挂起 `customer-authorization-plane-integration` 与 300s 上限的 `git-role-workflows-e2e`），无未登记挂起/无 no-summary 异常。
4. **对照判定（按批次实施后基线 + 参照记录逐条）**：
   - `test/runtime-core`：59 文件 535/498/33/0/4 —— 与 W1 最终基线**完全一致**；失败 33/33、skip 4/4 名单 diff **0 行**（且与 E3 参照的文件+测试名多重集一致）。
   - `test/编排`：107 文件 1122/1098/22/0/2 —— 与 W2/W3b 最终基线**完全一致**；失败 22/22、skip 2/2 名单 diff **0 行**（对 E3 参照仅少的 2 条为上一变更预期红→绿）。
   - `test/测试`：107 文件 682/623/40/1/18 —— **新增失败 1 条**（`git-role-workflows-e2e` 的 `Q2 P2 first new project…`，机器性能阈值触发的 12s/300s 预算超时；**隔离复跑通过 19/7/0/0/12**，判定环境性、非确定性新增）；其余 106 文件逐文件计数与 W5 基线完全相同；**新 skip = 0**。
   - `test/桌面应用/chief-workflow.test.ts`：59/42/16/1/0 —— 属 W4 已登记波动集；失败名集合为 W4 四次运行同一非确定性族（ENOTEMPTY/清理/时序）；`cancelled 1` = `W29 …document-change` 在 D1 环境 12s 测试超时（W4 基线同用例 5.9–6.7s），并级联 3 个同组变体；隔离复跑（整文件 59/40/18/1、W29 定向 3 fail+1 cancelled）在当前环境复现 **同一 12s 超时**——判定**环境性能阈值差异**，非本候选回归（同候选在 W4 基线通过；全局慢机佐证见 §8）。
   - `test/codex-adapter` 抽检 2 文件（无本变更改动；W6 N/A）：`application-surface` 4/4、`session` 27/26 pass/0 fail/1 skip —— 与 E3 参照一致。
5. **预期红→绿确认**：Q16 q9（`session-admission-approval-q9-integration`）1/1 pass、N15（`runtime-dispatch-gate-integration`）10/10 pass、`run-stop-host-continuation-integration` 3/3、跨运行时 5 文件 8/8 —— 均为绿（W5 改写后转绿，D1 复跑保持）。
6. **静态门**：`npm run typecheck` **exit 0**；渲染/构建 N/A（本变更未触及 `app/renderer/`/`app/main.ts`，候选 `app/` 仅 `app/desktop/session.ts`）。
7. **综合**：**新增确定性失败 = 0、新 skip = 0**；2 处与批证据不一致均已按测试名隔离复跑并逐条分类（均为环境/机器性能类，详见 §8）。本记录只呈证据，不判验收。

## 1. 输入

| 输入 | 实测 |
| --- | --- |
| 团队计划 | `docs/scheduling/2026-11-08_team-plan_remove-predictive-gates.md`（503 行 / `911ff546…`） |
| B1 v1（冻结） | `docs/acceptance/2026-11-08_remove-predictive-gates-criteria-v1.md`（182 行 / `3306b9d4…`；BASE-1/BASE-4、B1-EV1/EV2） |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_remove-predictive-gates.md`（§一 参照 4,982/4,753/196/1/32 = `5cba2d54…`+`54c0db31…`；I0 冻结；批次状态） |
| 各批证据（只读） | W1 `角色卡/运行时核心/docs/change/2026-11-08_W1_remove-predictive-gates.md`（`b6d4f688…`）；W2 `角色卡/编排/docs/change/2026-11-08_W2_remove-predictive-gates.md`（`fa166eed…`）；W3a `…W3a_git-action-authorization-sidecar.md`（`6a07a922…`）；W3b `…W3b_remove-predictive-gates.md`（`1547235e…`）；W4 `角色卡/桌面窗口/docs/change/2026-11-08_W4_remove-predictive-gates.md`（`210d2066…`）；W5 `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md`（`8d678fff…`） |
| 参照记录（只读） | `2026-11-08_E3-T3-full-regression.md`（169 行 / `5cba2d54…`；4,979/4,750/196/1/32）+ `2026-11-08_B2-gap-integration.md`（89 行 / `54c0db31…`；+3/3）⇒ 组合 4,982/4,753/196/1/32 |

## 2. 候选身份（BASE-4 口径）

### 2.1 HEAD / 分支 / scope

- HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7`；tree `728301d8f9c3aab2c254ba5fe125ca0073c21848`；分支 `feat/plan-escalation-card`；暂存区 0（`git diff --cached --name-only` 空）。
- `git status --porcelain -- src app test`（原始 `01-scope-status-opening.txt`）：**38 行 = 17 ` M` + 21 `??` + 0 删除**。
- **区分**：W1 开工前 `src app test` 实测为空（W1 证据 §1），故 38 行全部为本变更（W1/W2/W3a/W3b/W4/W5）delta。**T1 三文件**（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/schema.test.ts`）已随 `9bca68a` 提交、在 HEAD 基线内且不在本 delta 内（实测哈希 `afe70c62…`/`f0db260e…`/`358ac967…`，`14-t1-files-hashes.txt`）。`docs/communication/memo.md` 的修改在 `docs/`，不入候选。

### 2.2 changedPaths 与逐文件 raw SHA-256（38 文件）

- 修改（17）：`app/desktop/session.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/{run-role,trunk-runtime}.ts`、`src/provider/trunk/{impl/git-command,public/trunk-store}.ts`、`src/service/runtime/session.ts`、`src/service/trunk/impl/apply-journal.ts`、`test/runtime-core/{git-capability-tools,session-lifecycle}.test.ts`、`test/桌面应用/chief-workflow.test.ts`、`test/测试/{git-role-workflows-e2e,runtime-dispatch-gate-integration,session-admission-approval-q9-integration}.test.ts`、`test/编排/{rapporteur-module-consumption,stable-write-runtime,trunk-dispatch-parent}.test.ts`。
- 新增（21）：`test/runtime-core/{drain-predicate,codex-native-optional}.test.ts`；`test/编排/git-action-authorization-{gate,sidecar}.test.ts` + `git-action-authorization-wiring{,-audit-failure,-retry,-publication,-publication-audit-failure,-document,-document-audit-failure,-initial-workflow,-initial-workflow-audit-failure}.test.ts` + `git-operation-sidecar-tolerance.test.ts` + `fixtures/git-action-authorization-wiring.ts`；`test/测试/git-action-cross-runtime-{init,pi-init,codex-init,audit-failure}.test.ts` + `git-action-cross-runtime-fixture.ts` + `run-stop-host-continuation-integration.test.ts`。
- 逐文件哈希：`04b-candidate-hashes-lines-sorted.txt`（38 行）。与各批证据交叉核对 `11-candidate-hash-crosscheck.tsv`：**38/38 一致、mismatch=0**（W1 ×6、W2 ×7、W3a ×3、W3b ×11、W4 ×2、W5 ×9；W2/W3a 中间值按 W3b 最终值核对）。
- **可复算聚合算法（明文）**：对候选每文件取 `sha256sum <file>` 的原字节哈希，生成整行 `<raw_sha256>  <path>`（哈希与路径之间**两个空格**；path 为仓库根相对路径，UTF-8 原字面、正斜杠；非 ASCII 路径以 `git -c core.quotepath=false` 取得）；对全部行做 `LC_ALL=C sort`（整行排序）；对排序结果文件做 SHA-256。
  - 结果：**`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（`05-candidate-aggregate.txt`；`04b-…` 文件自身哈希 = 该聚合值，可复核）。
  - 运行后复算（`24b-candidate-aggregate-post.txt`）：同值；逐行 diff 0（`24c-candidate-diff.txt`）。

### 2.3 `src app test` manifest（运行前 / 后）

- 口径：`git -c core.quotepath=false ls-files --cached --others --exclude-standard -- src app test`（tracked + 未忽略未跟踪），`LC_ALL=C sort` 文件清单；逐文件 `sha256sum` 生成 `<sha256>  <path>` 行并 `LC_ALL=C sort`；对结果做 SHA-256。
- **运行前**（`06c-manifest-summary-pre.txt`）：**1,099 文件 / `bf190ee548575dbd522fdff42a89885476d5e89d1ff03435ad81c3324290946f`**。
- **运行后**（`22c-manifest-summary-post.txt`）：**1,099 文件 / 同值**；`diff 06b-manifest-lines-pre.txt 22b-manifest-lines-post.txt` = **0 行**（`22d-manifest-diff.txt`，空文件）。
- scope status 前后逐行 diff = 0（`23b-scope-diff.txt`，空文件）。

## 3. 环境与方法

- OS Windows 11 Pro 10.0.26300 / Git Bash（MINGW64）/ Node **v24.22.1** / npm 11.19.1 / Git 2.55.0.windows.5（`00-opening-state.log`）。
- **逐文件独立进程自然运行**：`timeout -k 5 <TO> node --test --test-concurrency=1 <file>`（harness `run-d1-per-file.sh`；每文件记录 ec/killed/summary/tests/pass/fail/cancelled/skipped/todo/duration/wall，`08-results-*.tsv`）。
- watchdog：**登记挂起文件 90s**（本 D1 范围内仅 `test/测试/customer-authorization-plane-integration.test.ts`）；其余 **300s 上限**。`signal` 以退出码表达：**124 = watchdog SIGTERM**（`killed=1`），其余退出码原样。**未使用 `--test-force-exit`/`--test-timeout`**；未删测试、未放宽断言、未加 skip。
- 运行隔离：四个套件串行执行（同一后台作业，18:38:47–18:54:06），期间无其它测试进程；隔离复跑（§8）在主运行结束后单独执行。

## 4. 权威运行结果（逐文件明细见 TSV）

| 套件 | 文件 | tests | pass | fail | cancelled | skipped | watchdog | 结果表 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**` | 59 | 535 | 498 | 33 | 0 | 4 | 0 | `08-results-runtime-core.tsv` |
| `test/编排/**` | 107 | 1,122 | 1,098 | 22 | 0 | 2 | 0 | `08-results-pianpai.tsv` |
| `test/测试/**` | 107 | 682 | 623 | 40 | 1 | 18 | 2（见下） | `08-results-ceshi.tsv` |
| `test/桌面应用/chief-workflow.test.ts` + `test/codex-adapter/` 抽检 2 文件 | 3 | 90 | 72 | 16 | 1 | 1 | 0 | `08-results-desktop-codex.tsv` |
| **合计** | **276** | **2,429** | **2,291** | **111** | **2** | **25** | **2** | — |

- 全部 276 行均有 summary（2 个 killed 文件为 SIGTERM 前的**部分** summary；无 `natural-exit-no-summary`）。
- watchdog 清单（`08-watchdog-postcheck.log`）：
  1. `test/测试/customer-authorization-plane-integration.test.ts`：**90s 登记挂起**，ec=124，部分 summary 1/0/1 —— 与 W5 基线同口径、同结果；
  2. `test/测试/git-role-workflows-e2e.test.ts`：300s 上限，ec=124，部分 summary 19/6/1/0/12 —— **与批证据不一致的偏差**（详见 §8.1，隔离复跑通过）。
- 无其它非零 killed；`test/桌面应用/session.test.ts` **不存在**（该目录仅 `session-history.test.ts`/`session-rebuild-race.test.ts`，HEAD 与工作树均无），任务中「如可行」项 **N/A**。
- `test/codex-adapter/` 本变更**零改动**（W6 默认 N/A；scope status 无该目录），按任务抽检 `application-surface.test.ts`（4/4）与 `session.test.ts`（27/26 pass、1 skip）。

## 5. 失败 / skip 对照与分类（文件+测试名逐条）

> 解析口径与 W5/E3 一致：`✖ failing tests:` 段内 `✖ <name> (<dur>ms)` 配对（文件由逐文件日志路径还原）；skip 取 `﹣ <name>… # SKIP`。对照文件均在 `2026-11-08_D1_evidence/`。

### 5.1 `test/runtime-core`（对 W1 最终基线 535/498/33/0/4）

- 计数**完全一致**。失败名 33/33 `diff` = **0 行**（`12-diff-vs-w1.txt`，空）；skip 名 4/4 `diff` = 0 行（`12-diff-skips-vs-w1.txt`，空）。
- 对 E3 参照（`40-comparison/ref-failures.sorted.tsv` 的 runtime-core 子集）文件+测试名多重集 `diff` = **0 行**（`12-diff-vs-e3ref.txt`，空）。
- **新增确定性失败 = 0；新 skip = 0**。

### 5.2 `test/编排`（对 W2/W3b 最终基线 1122/1098/22/0/2）

- 计数**完全一致**。失败名单（测试名）22/22 `diff` = **0 行**（`15-diff-names-vs-w3b.txt`，空）；skip 2/2 `diff` = 0 行（`15-diff-skips-vs-w3b.txt`，空）。
- 对 E3 参照子集（24 行多重集）：D1 仅**少 2 条**（`test/编排/shell-gate.test.ts`「readonly 裁定 A…」、`test/编排/shell-readonly.test.ts`「只读档集成…」）——均为**上一变更（会话准入）设计点名既有红→绿**，在 E3 参照中已消失、与本次改动无关（`15-diff-vs-e3ref.txt`）；无新增。
- **新增确定性失败 = 0；新 skip = 0**。

### 5.3 `test/测试`（对 W5 最终基线 682/624/39/1/18）

- 汇总：682/623/40/1/18 —— 与基线差 **+1 fail / −1 pass**，来自唯一 1 个文件（见下）；**逐文件计数对照 107 文件：106 个完全一致，仅 `git-role-workflows-e2e.test.ts` 不同**（W5：19/7/0/0/12；D1：19/6/1/0/12）。
- 失败/skip 多重集：**新增失败 1 条**、消失 0 条（`18-new-failures-vs-w5.txt`）；**新 skip 0、消失 skip 0**（`18-new-skips-vs-w5.txt`，空；`18-disappeared-skips-vs-w5.txt`，空）。18 条 skip 名单逐条一致。
- 新增失败条目：`test/测试/git-role-workflows-e2e.test.ts`「Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards」——`AssertionError: 143 !== 0`（业务子进程达自身 300s 预算被 SIGTERM；文件同时触发 300s 上限 watchdog）。**判定：环境性能阈值（机器慢）**，隔离复跑通过（§8.1）。
- 登记挂起文件 `customer-authorization-plane-integration.test.ts`：90s watchdog、部分 summary 1/0/1 —— 与 W5 基线**逐项一致**。
- 预期红→绿（单独标注）：`session-admission-approval-q9-integration.test.ts` **1/1 pass**（W5 前 1 fail）、`runtime-dispatch-gate-integration.test.ts` **10/10 pass**（W5 前 9/1）——均已绿，符合 W5 改写后基线。

### 5.4 `test/桌面应用/chief-workflow.test.ts`（对 W4 波动集 58/47/11、59/43/16、59/45/14）

- D1：**59 tests / 42 pass / 16 fail / 1 cancelled / 0 skip**（自然退出 1，43.6s；退出码仅由断言失败产生）。
- 失败名集合（16）：W19、W28×2、W29×4、W30×2、W33、W34、W35、selected、W14、W23、W22。与 W4 after1（14 条解析名）逐名 diff：11 处状态翻转——W4 fail→D1 pass：W10 父项、W47×2、commit-race、unmanaged；W4 pass→D1 fail：W29×3 变体、W30×2、W35。**所有条目均属 W4 证据已登记的同一非确定性族**（ENOTEMPTY/AggregateError 清理、`waitFor` 时序、W29/W30/W47 交替红绿）。
- **`cancelled 1` 归因**：`W29 … document-change 保专业规划scope…` 在 D1 环境 **`test timed out after 12000ms`**（D1 两次整文件运行均如此；W4 基线同用例 5.9–6.7s 通过）；该超时后同组 3 个变体（wrong-flow/source-loss/missing-confirmation）以 `git-file-final-guard-unproven` 级联失败。
- 分类与证据（§8.2）：**环境性能阈值差异**，非本候选引入的确定性回归。隔离复跑（整文件 59/40/18/1、W29 定向 3 fail+1 cancelled）在当前环境复现同一 12s 超时；但同一候选在 W4 基线（before/after1/after2）与 E3 参照中 W29 组均为 5.5–6.7s 通过/波动。
- **新增确定性失败 = 0**（按测试名逐条分类；无新 skip；cancelled 1 属上述环境超时）。

### 5.5 `test/codex-adapter` 抽检（无本变更改动）

| 文件 | D1 | E3 参照 | 结论 |
| --- | --- | --- | --- |
| `application-surface.test.ts` | 4/4/0/0/0 | 4/4/0/0/0 | 一致 |
| `session.test.ts` | 27/26 pass/0 fail/0 cancelled/1 skip | 27/26/0/0/1 | 一致 |

### 5.6 综合判定

- **新增确定性失败 = 0**；**新 skip = 0**。
- 与批证据不一致 2 处（`git-role-workflows-e2e`、`chief-workflow` W29 组），均已隔离复跑并按（文件+测试名）分类为环境/机器性能类（§8），无代码/断言差异。
- 既有失败/环境性分类：`test/runtime-core` 33、`test/编排` 22、`test/测试` 40（含 1 registered-hang）与各批基线逐条一致；`chief-workflow` 16 条属 W4 已登记波动族。

## 6. typecheck 与渲染

- `npm run typecheck`（`tsc --noEmit`）：**exit 0**（`21-typecheck.log`）。
- 渲染/构建：**N/A**。依据：本变更候选 `app/` 仅 `app/desktop/session.ts`，未触及 `app/renderer/**` 或 `app/main.ts`（scope status 可证）；与团队计划 §5.5「渲染按需（预期 N/A 并给依据）」一致。W1–W5 各批亦仅跑 `npm run typecheck`。

## 7. 候选与稳定性（运行前后）

| 项 | 运行前 | 运行后 | 结论 |
| --- | --- | --- | --- |
| HEAD / tree / 分支 | `3f249e2…` / `728301d8…` / `feat/plan-escalation-card` | 同 | 不变 |
| 暂存 | 0 | 0 | 不变 |
| scope status（`src app test`，38 行） | `01-scope-status-opening.txt` | `23-scope-status-post.txt` | diff 0 行 |
| 候选聚合（38 文件） | `9462391e…` | `9462391e…` | 同值、逐行 diff 0 |
| manifest（1,099 文件） | `bf190ee5…` | `bf190ee5…` | diff 0 行 |

## 8. 隔离复跑记录（与批证据不一致项的确定性判定）

### 8.1 `test/测试/git-role-workflows-e2e.test.ts`（主运行 300s watchdog；W5 基线自然退出 203.2s）

- 主运行：`Q2 P2 …` 子进程 298,651ms 达自身 300s 预算被 SIGTERM（`143 !== 0`），文件随即触 300s 上限，ec=124、部分 summary 19/6/1/0/12。
- **隔离复跑 #1**（同命令、同 300s 上限，`19-e2e-isolated-rerun1.log`）：**19/7/0/0/12、自然退出 0**；`Q2 P2 …` **260,048ms 通过**（仍接近 300s，属性能边界）。
- 结论：该失败为**机器性能阈值**触发的非确定性（同一候选在 W5 基线 201.8s 通过；本次主运行 298.7s、复跑 260.0s）；非本变更行为差异。**如实披露**：在当前机器状态下该文件耗时贴近 300s 上限，后续终验若沿用 300s 上限可能再现。

### 8.2 `test/桌面应用/chief-workflow.test.ts`（W29 组 12s 测试超时）

- 主运行：W29 主变体 12,009ms `test timed out after 12000ms`（cancelled 1）→ 同组 3 变体级联失败。
- **隔离复跑 #1（整文件，`20-chief-isolated-rerun1.log`）**：59/40/18/1/0；W29 主变体 **12,000ms 超时**、3 变体再次级联；其余失败集合与主运行不同（W36、selected、commit-race 等进出）——同一非确定性族。
- **按测试名定向复跑（仅 W29 组，`20b-chief-W29-targeted.log`）**：4 tests = **3 fail + 1 cancelled**；主变体 **12,017ms 超时**、3 变体级联——复现同一 12s 超时。
- 结论：在**当前 D1 环境**下 W29 主变体稳定超过其 12s 测试超时（W4 基线同用例 5.5–6.7s，约 2× 慢机），属**环境性能阈值差异**；同候选在 W4 基线通过，且全局慢机有其他佐证（`git-trunk-store` 112.6s vs E3 参照 64.2s；e2e 子进程 298.7s vs W5 201.8s）。不判为本候选的确定性回归；如实披露其在当前环境的可复现性。

## 9. 限制与如实边界

1. **本记录只证明所列命令/文件集/环境下的观察**；未运行真实模型/Electron/CDP（RR 独立节点）；未做全量 T3（E3-F 负责）与死代码扫描。
2. **机器性能差异**：D1 运行期机器明显慢于批次证据采集时（佐证见 §8.2），导致上述 2 处偏差；均以隔离复跑与批基线对照处置，未改测试求绿。
3. watchdog 仅作挂起兜底：90s 仅用于登记挂起文件；其余 300s 上限；SIGTERM 以 ec=124 记录，无 `--test-force-exit`/`--test-timeout`。
4. `test/桌面应用/session.test.ts` 不存在（任务「如可行」项 N/A）；`test/codex-adapter` 无本变更改动，仅抽检 2 文件。
5. D1 范围内登记挂起文件仅 `customer-authorization-plane-integration.test.ts`；其它已登记挂起文件在其他目录、不在本节点范围（仅在 E3 全量时按登记处理）。
6. 测试内部生成的临时目录/子进程由其自身清理；本次未清理仓库外临时证据目录（测试夹具行为，不改仓库）。
7. 本记录不判验收；D1 出口由独立验收/统筹按 B1 与团队计划判定。

## 10. 纪律声明

- 只写本记录与 `2026-11-08_D1_evidence/`；**未修改 `src/`、`app/`、`test/`（含 `test/测试/`）、`docs/`、角色卡/边界/YAML、方案、B1、团队计划/派发记录**。
- 未 commit / push / 暂存 / 合并 / 发布；未 `npm install`；未运行真实模型/Electron/CDP。
- 未删除测试、未放宽断言、未新增 skip、未使用 `--test-force-exit`/`--test-timeout`。

## 11. 证据索引（`角色卡/测试/docs/change/2026-11-08_D1_evidence/`）

| 文件 | 说明 | SHA-256 |
| --- | --- | --- |
| `00-opening-state.log` | 开工身份/环境/status | — |
| `01-scope-status-opening.txt` / `23-scope-status-post.txt` / `23b-scope-diff.txt` | scope status 前/后与 diff（空） | diff=`e3b0c442…`（空文件） |
| `02-scope-changed-paths.txt` / `03-candidate-files.txt` | 候选 38 文件清单 | — |
| `04b-candidate-hashes-lines-sorted.txt` | 38 行 `<sha256>  <path>`（排序） | `9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`（=聚合） |
| `05-candidate-aggregate.txt` | 候选聚合 | `02409b0d…` |
| `11-candidate-hash-crosscheck.tsv` / `11b-crosscheck-result.txt` | 38/38 与批证据一致 | — |
| `06c-manifest-summary-pre.txt` / `22c-manifest-summary-post.txt` | manifest 1,099 文件 / `bf190ee5…` | 前=后=`8d12b69a…`（文件哈希） |
| `06b-manifest-lines-pre.txt` / `22b-manifest-lines-post.txt` / `22d-manifest-diff.txt` | manifest 逐行前/后与 diff（空） | diff=`e3b0c442…` |
| `07-suite-*-files.txt` / `07-all-run-files.txt` | 套件文件枚举（59/107/107/3；合计 276） | — |
| `08-results-runtime-core.tsv` | 逐文件结果（59 行 + DONE） | `5da63fad…` |
| `08-results-pianpai.tsv` | 逐文件结果（107 行 + DONE） | `e2f02cfd…` |
| `08-results-ceshi.tsv` | 逐文件结果（107 行 + DONE） | `0c87b60c…` |
| `08-results-desktop-codex.tsv` | 逐文件结果（3 行 + DONE） | `2a638189…` |
| `08-watchdog-postcheck.log` | watchdog 清单（2 条，均为 90s/300s 登记口径） | — |
| `logs-runtime-core/` / `logs-pianpai/` | 逐文件原始日志（166 个，哈希见 `16-…`） | `16-log-hashes-runtime-core+pianpai.txt` |
| `logs-ceshi/` / `logs-desktop-codex/` | 逐文件原始日志 | — |
| `12-d1-runtime-core-*.txt` / `12-diff-vs-w1.txt`（空）/ `12-diff-skips-vs-w1.txt`（空）/ `12-diff-vs-e3ref.txt`（空） | runtime-core 失败/skip 与对照 | — |
| `15-d1-pianpai-*` / `15-diff-names-vs-w3b.txt`（空）/ `15-diff-skips-vs-w3b.txt`（空）/ `15-diff-vs-e3ref.txt`（4 行：2 条上一变更红→绿） | 编排 失败/skip 与对照 | — |
| `18-d1-ceshi-*` / `18-new-failures-vs-w5.txt`（1 条）/ `18-disappeared-failures-vs-w5.txt`（空）/ `18-new-skips-vs-w5.txt`（空）/ `18-disappeared-skips-vs-w5.txt`（空） | test/测试 失败/skip 与对照 | new-failures=`9cc72321…` |
| `19-d1-desktop-codex-*` / `09-baseline-w4-chief-*` / `09-baseline-w1-runtime-core-*` / `13-*` | 桌面/codex 与批基线解析件 | — |
| `19-e2e-isolated-rerun1.log` | e2e 隔离复跑 #1（19/7/0/0/12，自然退出 0） | `dd3189cf…` |
| `20-chief-isolated-rerun1.log` | chief-workflow 隔离复跑 #1（59/40/18/1/0） | `7e7e1da4…` |
| `20b-chief-W29-targeted.log` | W29 定向复跑（3 fail + 1 cancelled） | `21aeb878…` |
| `21-typecheck.log` | `npm run typecheck`（exit 0） | `22d52cc9…` |
| `24b-candidate-aggregate-post.txt` / `24c-candidate-diff.txt`（空） | 运行后候选聚合复算 | post=`9462391e…` |
| `17-evidence-topfiles-hashes.txt` / `16-log-hashes-runtime-core+pianpai.txt` | 证据文件哈希索引（运行中版本；如需最新以现场重算为准） | — |
| `run-d1-per-file.sh` / `parse-d1.py` | 运行/解析 harness（可复算） | — |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

## D1-R1 增补（W7 后重算）

- 上下文：W7（B2 v1 补证：确定性完整效果链 E2E/夹具）完成后，按派发记录 §四 W7 与 B2 v1 §4 要求重算候选并复跑受影响套件。本增补**只追加**，不改 D1 正文；D1 原记录为 W1–W5 候选（38 文件）身份。
- 依据/证据：`角色卡/测试/docs/change/2026-11-08_W7_b2-gap-e2e.md` 与 `2026-11-08_W7_b2-gap-e2e-evidence/`（逐文件结果、日志、sidecar/journal/ref 快照、复算脚本）。HEAD `3f249e2fee1753531d6b566eefc7a64016e863a7` / tree `728301d8f9c3aab2c254ba5fe125ca0073c21848` / 分支 `feat/plan-escalation-card` / 暂存 0（前后不变）。

### D1-R1.1 候选（W7 后，`src app test`）

- 候选 **44 文件 = 38 既有 + 6 新增**（0 删除）：5 个 W7 E2E 测试文件 + 1 个共享夹具（`test/测试/git-write-chain-fixture.ts`）。
- 新增 6 文件逐文件 raw SHA-256（完整 44 行见 W7 证据 `02-candidate-hashes-lines.txt`）：
  - `d370b95126aa97c14d453be726258ea42f1aade1d7f7eb5218454616ead16335` `test/测试/git-action-commit-claude-e2e.test.ts`
  - `79fe9ab0570ab7c50a1aa3d6fa6c8c618a48d838414b38a0b4776c65e59f774c` `test/测试/git-action-commit-pi-e2e.test.ts`
  - `5ae311d2096120dfa25e8937d4b67888d9f7be3eb24691e9fc35e91b712d2868` `test/测试/git-action-delivery-claude-e2e.test.ts`
  - `be863b4c9e3a6d55f01ada1c291ffbde1b1c7e1db1781e26f210e36ffcc722f1` `test/测试/git-action-activation-e2e.test.ts`
  - `908fb651bde3dc74ccae19866f460d943022777daeeb17f3d38cd61ceb890212` `test/测试/git-run-stop-host-continuation-e2e.test.ts`
  - `b1b43b1e44a26656c4effda341b47d8f5a38d42c6cc5f13162e62e812196dbd4` `test/测试/git-write-chain-fixture.ts`
- **聚合（算法同 D1 §2.2）**：**`787bd9109c6ce13f27eed4dbd396b0dc9a6fce26834b96c7f6c3e37391ff2475`**（44 文件；`03-candidate-aggregate.txt`）。
- **原 38 文件零改动**：逐文件 hash 与本记录 `04b-candidate-hashes-lines-sorted.txt` **逐字一致（38/38）**；其子集聚合复算 = **`9462391e33c0e169812bb2d47526539cc6607f979e64225c202bba56f7dfe12c`**（`06-candidate-38-subset-lines.txt`）；`src app` 仍仅 8 个既有修改文件，**本批产品零改动**。
- **manifest（`src app test`，D1 §2.3 口径）**：**1,105 文件 / `4b5ed42fff69013b66c09bff3820ca820512220ec8f5ca18756965d1ebe7a128`**（`05-manifest-summary.txt`）；对 D1 1,099/`bf190ee5…` 逐行 diff **仅 6 行新增、0 修改/删除**（`07-manifest-diff-vs-d1.txt`）。

### D1-R1.2 运行与稳定性（套件前后）

- **稳定性**：候选/manifest/scope status 运行前后 **diff 0 行**（`16-candidate-stability-diff.txt` / `17-manifest-stability-diff.txt` / `19-scope-stability-diff.txt` 均空；`12-post-…`/`13-post-…`/`14-post-…`/`15-post-…` 同值）；HEAD/tree/分支/暂存不变。

| 套件 | 基线（W5/D1） | W7 后 | 对照 |
| --- | --- | --- | --- |
| `test/测试/**`（112 文件；含 5 个 W7 新文件） | 107 文件 682/624/39/1/18 | **112 文件 687/629/39/1/18** | +5/+5/0/0/0；107 个既有文件逐文件计数 0 差异；失败/skip 名单对 W5 **diff 0 行**；**新增确定性失败 0、新 skip 0**；登记挂起 90s 同基线 |
| `test/编排/**`（107 文件，只读执行） | 1122/1098/22/0/2 | **1122/1098/22/0/2** | 逐文件计数 107/107 一致；失败/skip 名字集合相等（22/2，0 名称差异）；**新增确定性失败 0、新 skip 0** |
| W7 新增 5 文件 | — | 5/5 pass（ec=0；51.1/51.1/85.0/44.7/44.8s） | 全部绿色（逐文件独立进程） |
| `npm run typecheck` | exit 0 | **exit 0** | `typecheck.log` |

- 口径：`timeout -k 5 <TO> node --test --test-concurrency=1 <file>` 逐文件独立进程；登记挂起 `customer-authorization-plane-integration.test.ts` 90s，其余 300s；**未使用 `--test-force-exit`/`--test-timeout`**；未删除/放宽断言、未加 skip。原始日志/TSV：`after-logs/` / `after-results.tsv` / `pianpai-logs/` / `pianpai-results.tsv` / `21-suite-summary.txt`。
- 覆盖：本增补仅按 W7 任务运行 `test/测试/**` 与 `test/编排/**`；`test/runtime-core` 等无本批文件改动，沿用 W1/D1/E3 证据。真实模型/Electron/CDP 未运行（W7 为确定性/桩件回合）。

### D1-R1.3 边界

- 本增补只呈 W7 后候选与受影响套件证据，不判验收；B2 复判由独立验收按 B1 与 B2 v1 §4 关闭条件执行。
- 角色命名/custom provider 收口/host fence 形态等如实披露见 W7 记录 §12。
- 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。
