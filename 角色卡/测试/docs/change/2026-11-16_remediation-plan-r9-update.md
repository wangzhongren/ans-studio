# R9：第八轮三平台测试 CI（kr29a/kr29b/plat/x64fu 合入后、#137 前）残差归因与第九轮收尾方案

- 日期：2026-11-16
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r9`（分支 `analysis/test-debt-r9`，起点 `da805ec` = `origin/main`，含 #137 的 600s CI 调参）
- 范围：**只分析、只写本文件与同名 `_r9-evidence/` 证据**。未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源（**权威**）：GitHub Actions run **43887939365**（`Test matrix (development feedback)`，`workflow_dispatch` on `main @ 77d3505703785ced0d3a760515f18d40bd553219`，2026-11-16T14:38:57Z 创建，15:37:37Z 完成，conclusion failure——仅三平台测试步骤失败，三平台 Typecheck 均 success）。
  - 该 run 的 SHA **77d3505 在 #137 之前**：workflow 仍为 `--test-timeout=300000`（`git show 77d3505:.github/workflows/test-ci.yml` 已核对；`da805ec` 才是 600000）。
  - 三平台工件齐全（`gh run download 43887939365 -D /tmp/r11-art`，一次成功、无重试）：
    - `test-logs-mac-arm64/test-ci-output.log`（953,740 B）
    - `test-logs-mac-x64/test-ci-output.log`（1,652,441 B）
    - `test-logs-win-x64/test-ci-output.log`（1,630,118 B）
  - **原始工件不入库**（本机 Git Bash `/tmp` = `C:\Users\51054\AppData\Local\Temp`）。
- 对照基线：
  - **R8 第七轮**（run 43867573699，`main @ 5661a73`，三平台 fail 30/38/28）——本机 `/tmp/r8-art` 保留，名称级/耗时级对照。
  - **R7 第六轮**（run 43859105048，`main @ d1f256f`）——AC-4/W-J5/Q2 的历史对照。
  - 批次记录：`x64fu`（`2026-11-16_test-debt-x64-followup.md`）、`plat`（`2026-11-16_test-debt-platform-hardening.md`）、`kr29b`（`角色卡/编排/docs/change/2026-11-16_kr29-orchestration.md`）、`kr29a`、`kr33`。
- 方法：自写提取/分类脚本（`_r9-evidence/extract-r9.py` 可复现），逐平台解析 `✖ failing tests:` 段；对 W 家族解析断言后的全量 `trace` 并逐行标注；对 26 个 `W52 init actual Core registry` 转储做在途条目核对；用 R8/R7 工件做耗时与名称级对照；用本机 Node 探针实证 per-test timeout 与 CLI 优先级。

## 0. 摘要

1. **三平台计数**：arm64 tests 5,828 / pass 5,806 / **fail 3** / skipped 19；x64 5,828 / 5,798 / **fail 6 + cancelled 5（5 个测试级超时）** / skipped 19；Windows 5,828 / 5,788 / **fail 8** / skipped 32。**权威唯一失败名 3 / 11 / 8，三平台合并 13**；行级 ✖（含 section 头）4 / 12 / 9。三平台均无 file-level 条目，Typecheck 全 success。
2. **残差构成（13）**：三平台共同 2（`Git team plan publication`、`Q2 P2`）；x64+Windows 5（W29×3、W30 真实重启迁移后、W34）；x64 单独 4（W-J5、AC-4、W30 连续写入后、W35）；arm64 单独 1（spawn fence）；Windows 单独 1（pending-card-restart ENOTEMPTY）。协调者清单有两处计数偏差：**Windows 的 W30 只有 1 名**（“连续写入后”通过）、“W34 x64 是 18s 测试级超时”而非 16–21s 快失败。
3. **x64fu 生效确认（core-in-flight 已解）**：R8 x64 的 8 名共享 `git-core-in-flight-unproven`（0.4–0.6s 快失败）**未再现**；本轮 26 个 init 转储中**没有任何** product/preparing/creating/disposing 在途条目（`06-registry-quiescence-r9.tsv` 全部 `unexpected=[]`）。W33、W29 missing-confirmation、task-restart、independent C Window 均已转绿。
4. **W 家族 7 名同根（平台失败实例 12：x64 7 + Windows 5）**：失败面从 R8 的 “core-in-flight” 前移为**product 发布回合被夹具 `turnLastResortMs: 4500` 中止为 `timed_out`**（`handback.ts:543` “本轮执行超时”）→ `closeBasis` 永不产生 → `chief-workflow.test.ts:1945` 的 “Actual publication/notice turns must settle and creator basis arrive” 失败。W34 x64 是同一发布回合叠加预算矛盾（用例 18s < 通知等待 20s；trace 未见失败回交行，需 B 批复核）；W35 x64 是 W34 超时后 product 会话 `disposing` 滞留导致的**级联**。
5. **Git team plan publication（三平台同错）**：不是产品回归，而是**夹具根未 canonicalize**——`createTrunkProject → makeRoot()` 用 `fs.mkdtemp(os.tmpdir())`，macOS `/var/...` 与 Windows `RUNNER~1` 都使产品 `listGitOperationJournals` 的 `realpath(dir) !== dir` 安全检查（`git-command.ts:446`）抛 `git-journal-directory-invalid`。该名属 orchestration-24，kr29b 修好了旧断言但未覆盖 CI 规范路径；R9 known-red 因此为 **0 / 0 / 1**，不是 0/0/0。
6. **Q2 P2 不是 #137 能覆盖的“仅预算”问题**：父测试显式 timeout **300000**（`:2306`/`:1310`）覆盖 CLI；子进程另有硬编码 300s 绝对预算（`:1317-1319`、`:1341`）；阶段 bounded 默认 90s（driver `:520`/`:736`）。本轮 arm64（258.1s）与 Windows（278.4s）已在 **90s 阶段预算**内自然失败（`Q2_TIMEOUT actual worker required surface / scoped write`，`errors/waits` 为空）；x64 300s 时仅到 `Q_PERSISTED_CHILD_OBSERVED`（252s）。#137 后 x64 仍会被 300s 显式超时/子进程看门狗杀。
7. **AC-4 x64：预算-only，#137 覆盖**（该测试无显式 timeout，继承 CLI）。R8 x64 已在 300s 内以 **246,302ms** 自然通过；R9 同链 x64 超时，arm64/Windows 106.2s/138.9s 通过。
8. **W-J5 x64：预算-only 未证，#137 不覆盖**：测试显式 `{ timeout: 180000 }`（`:55`），显式选项覆盖 CLI（本机 Node 探针实证）。R8/R9 x64 均 180s 触顶；arm64/Windows 81.8s/102.0s。需先改该用例预算再复跑。
9. **spawn fence arm64（227ms）**：plat 两路分类漏了**第三路**——中断在首个 mutating 命令 lease 预检前被观察，产品以 `git-host-lease-invalid-before-command` fail-closed 拒绝且**零进程记录**；路 A（无 started ⇒ 恰好 1 条 cancelled）不成立。R8 旧版工件已证明该路径消息与栈（`git-command.ts:728`）。测试侧补路 C 即可，安全性不降。
10. **Windows pending-card-restart（149ms）**：`fs.rm(root, {recursive,force})` 与 `mgr.stop(null)` 后的异步落盘竞态 → `.ans/state` ENOTEMPTY；按既有先例加 `maxRetries/retryDelay`。
11. **批次与验收**：6 个可并行写区（A 夹具规范根 / B chief-workflow 发布预算 / C spawn fence 路 C / D pending-card-restart 清理 / E Q2 预算体系 / F W-J5 显式预算），AC-4 无需改动。第九轮三平台全量复跑按 §6 验收：目标合并宇宙 0；known-red 0/0/0；B0/B7 基线重建；x64fu/plat 已绿项零回退。

## 1. 计数与口径对账

| 平台 | job 结果 | 起止（UTC） | job 耗时 | `duration_ms` | tests | pass | fail | cancelled | skipped | 唯一名 | 行级 ✖ | Typecheck |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| macOS arm64 | failure（仅测试步骤） | 14:44:01–15:15:32 | 31m31s | 1,811,212.5 | 5,828 | 5,806 | **3** | 0 | 19 | **3** | **4** | success |
| macOS x64 | failure（仅测试步骤） | 14:39:03–15:37:36 | 58m33s | 3,364,129.7 | 5,828 | 5,798 | **6** | **5** | 19 | **11** | **12** | success |
| Windows x64 | failure（仅测试步骤） | 14:39:00–15:17:40 | 38m40s | 2,235,170.0 | 5,828 | 5,788 | **8** | 0 | 32 | **8** | **9** | success |

- x64 的 5 个 cancelled = W34（18s）、W35（30s）、W-J5（180s）、AC-4（300s）、Q2 P2（300s）五个测试级超时；其余 6 个为断言失败。`fail 6 + cancelled 5 = 11` 与唯一名精确一致。
- 三平台测试集合大小一致（5,828）；R8 Windows 的 5,829 来自 file-level 崩溃条目，本轮无。
- 协调者口径对账、R8→R9 迁移（arm64 30→3 / x64 40→11 / Windows 28→8）与 known-red 三套核对详见 `_r9-evidence/10-count-reconciliation.md`、`07-knownred-r9.json`、`08-r8-r9-transition.json`。

## 2. 残差逐条表（13）

> 完整逐平台矩阵/错误头见 `_r9-evidence/02-platform-matrix.tsv`，错误体摘录见 `03-error-bodies.md`。

| # | 残差（缩写） | arm64 | x64 | Windows | 断言/错误 | 定性 | 属主 | 批次 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Git team plan publication and active-only activation | 60,228.8ms ✖ | 111,347.3ms ✖ | 62,859.6ms ✖ | `{"ok":false,"code":"trunk-item-invalid","message":"Error: git-journal-directory-invalid"}` @ git-capabilities:658 | 测试夹具根非规范拼写（realpath 不一致）；产品安全不变量正确 | 测试（kr29b follow-up） | A |
| 2 | Q2 P2 first new project | 258,059.9ms ✖（断言） | 300,000.3ms ✖（超时） | 278,365.6ms ✖（断言） | 子进程 exitCode 1；`Q2_TIMEOUT actual worker required surface / scoped write`（driver:740） | 阶段/绝对预算 + 慢 runner；非 #137 可覆盖 | 测试（Q2 owner）+ owner 裁决 | E |
| 3 | W29 document-change | - | 21,019.0ms ✖ | 16,574.3ms ✖ | `Actual publication/notice turns must settle and creator basis arrive` @ chief-workflow:1945 | product 发布回合 4.5s 兜底 timed_out | 测试 | B |
| 4 | W29 document-change-wrong-flow | - | 21,212.9ms ✖ | 16,814.3ms ✖ | 同上 | 同上 | 测试 | B |
| 5 | W29 document-change-source-loss | - | 21,309.9ms ✖ | 14,830.4ms ✖ | 同上 | 同上 | 测试 | B |
| 6 | W30 连续写入后 | - | 21,276.2ms ✖ | -（10,495.8ms ✔） | 同上 | 同上 | 测试 | B |
| 7 | W30 真实重启迁移后 | - | 20,235.6ms ✖ | 16,683.3ms ✖ | 同上 | 同上 | 测试 | B |
| 8 | W34 真实首文档发布…团队规划独立scope | - | 18,001.1ms ✖（超时） | 9,535.4ms ✖ | Windows：`:1915` 断言；x64：用例 18s < 通知等待 20s | 同一发布回合 + 预算自相矛盾 | 测试 | B |
| 9 | W35 缺team…D3写动作拒绝 | - | 30,001.6ms ✖（超时） | -（4,083.7ms ✔） | pre-open `Core registry not quiescent`（product `ca24da13` disposing） | W34 级联 | 测试 | B |
| 10 | AC-4 git_publish delivery | - | 300,002.3ms ✖（超时） | - | `test timed out after 300000ms` | 预算-only；#137 覆盖 | 测试/CI | 验证 |
| 11 | W-J5/J15 judge 代批 | - | 180,002.8ms ✖（超时） | - | `test timed out after 180000ms` | 显式 180s；#137 不覆盖 | 测试 + owner 裁决 | F |
| 12 | Git final spawn fence | 227.4ms ✖ | -（1,511.4ms ✔） | -（1,200.4ms ✔） | `cancelled 0 !== 1` @ git-command:88 | plat 两路分类缺第三路（零进程记录） | 测试（plat follow-up） | C |
| 13 | 重启：未决申请 orphaned / 审批 expired | -（101.4ms ✔） | -（139.7ms ✔） | 149.3ms ✖ | `ENOTEMPTY ... rmdir ...\.ans\state` | Windows 清理竞态 | 测试 | D |

## 3. 逐项定性

### 3.1 Git team plan publication：夹具根规范拼写（测试假设，非产品）

- 失败点 `service.prepareCreatedTaskClose(nominationTaskId, "chief")`（`git-capabilities.test.ts:658`）→ `listGitOperationJournals(root)` → `git-command.ts:446`。
- `listGitOperationJournals` 用调用方传入的 `root` 拼 `.ans/trunk/operations/<sha>`，并要求 `realpath(dir) === dir`（防符号链接/重定向的安全不变量）。`createTrunkProject` 的 `makeRoot()` 直接返回 `fs.mkdtemp(os.tmpdir())`：
  - macOS：`/var/folders/...` → realpath `/private/var/...`；
  - Windows runner：`C:\Users\RUNNER~1\AppData\Local\Temp\...` → realpath `C:\Users\runneradmin\...`。
- 结果：三平台确定性失败，与平台/负载无关。kr29b 在本地 Windows（temp 无 8.3 短名）3× 绿，CI 规范路径暴露该缺口；该名仍在 orchestration-24 中（R9 known-red 0/0/1）。
- 最小修复（批次 A）：夹具持有规范根——`makeRoot()` 返回 `fs.realpath(mkdtemp(...))`（`test/编排/git-command.test.ts:41-43` 已有同法先例）；或仅在该测试把 `project.root` canonicalize。建议全夹具统一，顺带审计其他 `mkdtemp(os.tmpdir())` 后直接传入 `listGitOperationJournals`/路径安全校验的夹具。
- 是否产品缺陷：否。产品 `executeGit` 自身会对根做 realpath（`git-command.ts:704-708`），说明规范根是上游契约；`listGitOperationJournals` 的严格检查不应放宽。

### 3.2 Q2 P2：阶段预算 + 慢 runner（#137 不覆盖）

- 父测试显式 timeout 300s、子进程绝对预算 300s、first-bootstrap 驱动阶段默认 90s（详见 `09-budget-evidence.md` §4）。
- 本轮时间线（`04-q2p2-timeline.tsv`）：
  - arm64：persisted-child 96.3s、worker candidate 122.0s、integrated 141.5s、verifier HTTP 168.6s；verifier 后 **87.6s 无新请求**，bounded 阶段耗尽 → `Q2_TIMEOUT`（requests=108）。
  - Windows：persisted-child 114.8s、verifier 206.1s；verifier 后 **71.2s 无新请求** → `Q2_TIMEOUT`（requests=106）。
  - x64：persisted-child **251.7s**（R8 226.2s），300s 时尚未到 worker candidate；父测试超时。
- R8 同链：persisted-child arm64 69.6s / Windows 67.1s / x64 226.2s，arm64/Windows 全程 214.0s/195.6s 通过。本轮三平台整体慢化（arm64 1.4×、Windows 1.7×、x64 1.1× 于该阶段），把 90s 阶段预算推到边界。
- 定性：**不是产品报错**（`errors:[]`、`waits` 无 cycle/orphan/external）；是链成本 + 阶段预算。边界：verifier 后具体停在哪个角色回合尚无 instrument（末请求后无 HTTP），需 E 批加“超时时刻 pending 角色/阶段”诊断；若诊断显示某回合永不结束，再升级产品候选。
- #137 覆盖判断：**不覆盖**。父测试显式 300s 覆盖 CLI；子进程 300s 看门狗不读 `--test-timeout`；arm64/Windows 还在 90s 阶段预算内自然失败。不能把 Q2 P2 记为“600s 后应过”。
- 最小修复（批次 E，owner 决策）：(a) 把 first-bootstrap 阶段 `timeoutMs`（90s）与子进程绝对预算、父测试 timeout 三者按同一目标（如 600s 口径）对齐；(b) 超时诊断输出当前 `roleProgress`/last HTTP/pending 卡；(c) 若真实链成本确超 600s，按 #137 记录改为拆测试（不得静默抬预算）。属主：测试（Q2 owner）+ owner 裁决。
- **批 E 实测更正（2026-11-17）**：CI 子进程经 `ANS_Q39_BUSINESS=1` 触发 q39→…→q26 闭锁，`first-bootstrap` 实际走 driver 的 `q26Business ? 150000` 分支，而非默认 90s；R9 arm64/Windows 的 bounded 过期点与该 150s 分支吻合（默认 90s 仅直接/诊断模式）。两者同样被 R9 慢化推到边界，§3.2 定性不变。批 E 已把 q26 与默认分支统一到 240s，并新增 `q2-timeout-diagnostic/v1`（roleProgress/lastHttp/pendingCards/stageTimeline），见 `2026-11-16_r9-batch-e-q2p2-budgets-diagnostics.md`。

### 3.3 W 家族（7 名 / 12 个平台失败实例）：发布回合 4.5s 兜底 + W34 预算矛盾 + W35 级联

- 共享断言 `chief-workflow.test.ts:1945` 的三个条件中，`closeBasis` 由 `:1786-1789` 的 `[工作结果] ... W21 publication completed` 回交写入；trace 证明该回交被替换成 `[工作结果] ... 状态：failed ... 本轮执行超时`（`handback.ts:543`，仅 `timed_out` 产生；`timed_out` 仅由 `turnLastResortMs` 产生）。
- 测试注入 `turnLastResortMs: 4500`（`:1813`）。发布回合包含真实 Git 应用（version-upgrade）+ 通知入队，慢 runner 上 >4.5s 即被中止；通知随后到达（发布其实 applied），但 `submit_report` 工具不再执行 → 无完成回交 → `closeBasis` 缺失。
- 平台矩阵：x64 五名（W29×3、W30×2）与 Windows 四名（W29×3、W30 restart）都是此形态；Windows W30 连续写入后（10.5s）通过，说明同一链在较快时可在 4.5s 内完成。arm64 全部通过（W29/W30/W34 总耗时 7.2–9.2s），W29 missing-confirmation（3.0/8.0/4.0s）与 W33（3.2/5.7/3.6s）通过。
- W34：
  - Windows 9.5s：通知到达、`w34-close-publication` 未产生——未观察到 `W21 publication completed` 完成回交（trace 无失败回交行；与 W29 同根推断为 4.5s 兜底/超时，B 批以放宽后 trace 复核）；
  - x64 18.0s：**用例预算 18000ms（`:1703`）小于通知等待 20000ms（`:1934`）**；测试级超时先发生，teardown 打印 `:1915` primary assertion；未留 notification 行。
- W35 x64：W34 超时后 product 会话 `ca24da13` 在 `disposing` 滞留；`waitForCoreRegistryQuiescent`（`:117`，15s）在 `pre-open`（`:1811`）抛出；随后 teardown 再耗时，30s 用例预算耗尽。Windows W35（4.1s）通过。
- 同窗口产品改动只有 `run-role.ts` 空根短路（kr29b），不作用于非空 temp 根；R8→R9 Windows 的“新红”是 runner 慢化（整体 +61%）触发的阈值问题，不是批次回归。
- **linked-worktree/平台差分**：本轮 W 家族不涉及 linked worktree——各变体在独立 `mkdtemp` 根内做真实 git init/对象/发布，无 worktree 增删；R8 中与 linked worktree 相关的 known-red（D3 linked workspace 等）属 runtime-core-33，本轮 0 命中。平台差分只体现在发布回合耗时：arm64 发布回合 <4.5s（全绿），x64/Windows >4.5s（红）；Windows W30 连续写入后 10.5s 通过说明同一平台也随时序波动。
- 最小修复（批次 B，单文件）：
  1. `turnLastResortMs` 按用例类型放宽（如 `documentChange ? 30_000 : 4_500`，`:1813`）；这是根因修复，一次覆盖 7 名；
  2. 用例预算同步上调：teamPlanning 从 18000 提到 ≥ 通知等待 + 团队派发余量（建议 45–60s，`:1703`）；documentChange 的 30000 也建议提到 ≥45s（turn 兜底提高后需覆盖“慢回合 + 后续收口/改写”最坏链）；
  3. 保留 `waitForCoreRegistryQuiescent`（x64fu）并有条件把 teardown 诊断保留；turn 不再被杀后，disposing 级联应消失；
  4. 失败诊断已含 trace/DIAG，无需新增断言（零断言放宽）。
- 验收：x64/Windows 上该家族 7 名转绿；W29 missing-confirmation、W33、W35（Windows）保持绿。

### 3.4 AC-4（x64）：预算-only，#137 覆盖

- 测试无显式 timeout（`git-action-delivery-claude-e2e.test.ts:34`），继承 CLI。R8 x64 **246,302.4ms 通过**；R9 x64 300s 超时；arm64 106.2s、Windows 138.9s 通过。R7 x64 亦 300s 超时。
- 结论：链在 x64 可完成，只是接近 300s；#137 后 600s 有充足余量。**无需代码改动**，第九轮验证即可（若仍超时再按拆测试处理）。
- 边界：日志无阶段标记，无法给出 300s 时刻的进度位置；预算-only 依据是 R8 同测试 x64 自然通过 + 跨平台耗时。

### 3.5 W-J5（x64）：显式 180s，#137 不覆盖

- `2026-11-09_judge-delegated-effectiveness.test.ts:55` 显式 `{ timeout: 180000 }`；Node 显式选项覆盖 CLI（探针见 `09-budget-evidence.md` §1）。因此 #137 的 600s **不会**作用于 W-J5。
- R8/R9 x64 均 180s 触顶；arm64 81.8s、Windows 102.0s（R8 65.8s/73.2s）。同轮 x64/arm64 同类慢化比 2.2–2.5×，外推 x64 W-J5 约 180–210s——放宽后大概率通过，但**未证**。
- 最小修复（批次 F，owner 决策）：把该用例 per-test timeout 提到 300000（或 owner 议定值），由 x64 CI 复跑验证；仍触顶则拆测试。**不要**把 #137 当作 W-J5 的修复凭证。

### 3.6 spawn fence（arm64）：plat 第三路

- 详见 `11-spawn-fence-third-route.md`。R9 arm64：`processFacts.length = 0`，`launched=0` 进入路 A，但 `cancelled=0`。
- R8 arm64/x64 旧版失败体证明早期路径消息为 `git-host-lease-invalid-before-command`（`executeGit:728`，发生在 pending 记录写入之前）。这是**零 owned 进程的安全 fail-closed**，不是产品缺陷。
- 最小修复（批次 C）：在 `git-command.test.ts` 三分支前增加“路 C：`processFacts.length === 0` ⇒ 消息必须匹配 `git-host-lease-invalid-before-command`，ref 仍为 null”；路 A/B 原样保留。可选把失败断言携带 `message` 便于诊断。

### 3.7 Windows pending-card-restart：清理竞态

- `finally` 的 `fs.rm(root, {recursive:true, force:true})`（`pending-card-restart.test.ts:87`）与 `mgr.stop(null)` 之后的异步 `.ans/state` 落盘竞争 → ENOTEMPTY。arm64/x64 通过（101.4/139.7ms）。
- 最小修复（批次 D）：`fs.rm` 加 `maxRetries: 10, retryDelay: 100`（与 misc3/p1p7 同法）；是否仍失败如实抛错。属主：测试。

### 3.8 已转绿/非残差（保持项）

- **KR-29**：gates-5 0 命中、orchestration-24 仅剩 team plan 1 名；runtime-core-33 0 命中。
- **x64fu**：`git-core-in-flight-unproven` 零出现；26 个 init 转储无 product disposing；W33、W29 missing-confirmation、task-restart（arm64 69.3s / x64 162.6s / Windows 101.5s 全绿）、independent C Window（三平台绿）均生效。
- **plat**：compatibility-loopback 三平台绿（R8 Windows file-level 崩溃未再现）；spawn fence x64/Windows 绿；W-J5 的预算观测未改变语义（仍 x64 180s）。
- **AC-4**：R8 x64 246s 绿、R9 arm64/Windows 绿（x64 仅预算）。
- 第九轮验收需检查这些项零回退。

## 4. 批次分组（可并行写区）

> 原则：每批只动一个（或一组同源）测试文件；不触碰产品/workflow；断言不放宽；批间文件无重叠，可并行开发或同轮合并（同轮可减少 CI 轮次，参考 R8 建议）。

| 批次 | 内容 | 文件（写区） | 覆盖残差 | 属主 | 前置/裁决 |
| --- | --- | --- | ---: | --- | --- |
| **A** | 夹具根 canonicalize（`makeRoot` → `fs.realpath`）或该测试局部 realpath | `test/编排/fixtures/trunk-project.ts`（或 `test/编排/git-capabilities.test.ts`） | 1 名 ×3 平台 | 测试（kr29b follow-up） | 无；修后 known-red orchestration 0 |
| **B** | `turnLastResortMs` 按 documentChange 放宽 + 用例预算同步上调（documentChange ≥45s、teamPlanning 45–60s） | `test/桌面应用/chief-workflow.test.ts` | 7 名（W29×3、W30×2、W34、W35 级联） | 测试 | 无；需 x64/Windows CI 复核 |
| **C** | spawn fence 路 C（零进程记录分类） | `test/编排/git-command.test.ts` | 1 名（arm64） | 测试（plat follow-up） | 无 |
| **D** | `fs.rm` 有界重试 | `test/桌面应用/pending-card-restart.test.ts` | 1 名（Windows） | 测试 | 无 |
| **E** | Q2 P2 预算体系统一 + 超时阶段诊断（或拆测试） | `test/测试/git-role-workflows-e2e.test.ts`、`test/测试/git-role-workflows-driver.ts` | 1 名 ×3 平台 | 测试（Q2 owner）+ owner | **需 owner 裁决**（#137 记录：600s 不够则拆并报告） |
| **F** | W-J5 per-test timeout 180s→300s（或议定值） | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 1 名（x64） | 测试 + owner | **需 owner 裁决**（门禁口径） |
| — | AC-4 不改；#137 已在 main | — | 1 名（x64） | 验证 | 无 |

- A/B/C/D 为纯夹具/分类修复，可先合；E/F 涉及预算/门禁口径，按 owner 裁决单独记录。
- B 与 C/D/A 文件互不重叠；E 与 F 亦互不重叠——全部可并行写区。
- **执行状态（2026-11-17）**：A–F 已按本表实现为分支 `fix/test-debt-r9a`…`fix/test-debt-r9f`（A 夹具根 realpath、B 发布回合预算、C 路 C、D 有界重试、E 三层预算+诊断、F 显式 300s），各批本机定向验证绿；E/F 每处预算旧值/新值/依据在各自批次记录逐项披露，最终以第九轮三平台 CI 为权威验收。AC-4 无需改动。
- C 建议同时把失败断言携带实际 `message`，为下一轮路 C 提供直接证据。
- A 修改全局夹具 `makeRoot()` 时需审计使用方（至少 `test/编排/git-capabilities.test.ts` 与同夹具测试）；若担心面过大，可只在失败测试或 `createTrunkProject` 内 canonicalize。

## 5. 第九轮验收口径（下一次三平台全量）

1. **前置**：A–F 按 owner 裁决合并（AC-4 无需改动）；合并后三平台全量 CI（`Test matrix`），三份工件齐全、Typecheck success。
2. **主目标**：合并宇宙 **0**；若 E 被 owner 裁定延后/拆分，则剩余必须逐名标注 owner 接受理由（预期仅为 Q2 P2 一项）。可接受平台矩阵：所有已修名三平台绿。
3. **known-red 三套**：runtime-core-33 **0**；gates-5 **0**；orchestration-24 **0**（A 批修掉 team plan）——即 **0/0/0**。
4. **零回退清单**：x64fu（core-in-flight 零出现、W33、W29 missing-confirmation、task-restart）、plat（compatibility-loopback、spawn fence x64/Windows）、w19（W19）、misc2/misc3（run-pin/Pipeline/Q74/W36、b31、ENOTEMPTY）、AC-4（600s 下绿）。
5. **工件与基线**：以第九轮三平台工件重建 B0（191 → 新基线）与 B7（190 → 新基线）；REMOVED 与“未复现（本轮绿，待观察）”分列；三套 known-red 逐名 diff（33→0、5→0、24→0）登记 REMOVED/已修。
6. **残差归零报告**：13 名逐名给出“已修/预算/平台”结论；unclassified 压缩到 0 或明确平台已知差异（含证据）。
7. **发布门禁**：release.yml 零改动；上述批次不改变产品语义；发布验证仍以 release.yml 命令为准。

## 6. 证据边界与披露

1. **单轮样本**：R9 为单轮三平台；W 家族 Windows 新红是“同根 + 慢化”的单轮观测；B 批修复后以 CI 复核为准。
2. **#137 不在本 run**：本 run SHA `77d3505` 为 300s 口径；#137（`da805ec`）只影响下一次 run。AC-4 的“应过”属推断（R8 x64 246s + 本轮跨平台耗时），不是已观测事实。
3. **Q2 P2 归因边界**：verifier 之后 71–88s 无 HTTP 请求；`waits` 无死锁边。具体停在哪个角色回合需 E 批诊断；不排除真实 Git/会话慢化或某个回合等待。
4. **W 家族断言边界**：`:1945` 有三个条件（product settled ≥3、无 product activeDeliveries、`closeBasis` 已定义）；trace 只能直接证明 `closeBasis` 缺失（失败回交替换了完成回交），另外两个条件无法从 trace 单独判定。修复验收以整条断言转绿为准。
5. **spawn fence 路 C 消息**：R9 断言在检查消息前失败（`:88`），消息未打印；路由判断基于 `processFacts.length=0` 与 R8 同路径 `git-host-lease-invalid-before-command` 证据。C 批应把消息纳入断言。
6. **x64 本地不可复现**：本机 Windows；macOS 结论来自工件 + 夹具审计；未在本机 macOS 复跑。
7. **原始工件不入库**：只在 `/tmp/r11-art`（本机 Temp）；证据目录只保留摘要与脚本。
8. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224。
9. **只读引用其他工作树**：`analysis-test-debt-r8`（R8 文档/证据，未提交状态）、`x64fu`、`plat`、`kr29b`、`kr29a`、`kr33ana` 等仅只读引用。

## 7. 未决问题（owner 裁决）

1. **Q2 P2 处置**：统一三项预算 vs 拆分测试？（E 批；owner 裁决；不得静默抬预算。）
2. **W-J5 预算**：180s→300s 是否接受？是否影响门禁口径？（F 批。）
3. **A 批修法**：全局 `makeRoot()` canonicalize 还是单测试局部？是否顺带审计其他 CI 路径敏感夹具？
4. **B 批 `turnLastResortMs` 取值**：20s/30s？是否只对 documentChange/teamPlanning 生效（其余 4.5s 保留）？
5. **C 批路 C 口径**：接受“零进程记录 + lease-invalid 消息”为合法 fail-closed 路，还是改为夹具等待首个目录事件？（建议前者。）
6. **Windows W 家族回归**：若 B 批后 Windows 仍偶发，是否按平台候选记录（而非继续放宽）？
7. **第九轮编排**：A–D 先合、E/F 待裁决，是否拆两轮 CI？建议同轮（减少轮次），但 E/F 未裁决时先跑 A–D 也可接受。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r9-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-run-metadata.json` | run/jobs/steps/artifacts/SHA/CI 命令/本地工件路径与对照 run |
| `01-ci-summary-and-unique-names.json` | 三平台 summary、唯一名、超时/断言分类、13 名唯一矩阵 |
| `02-platform-matrix.tsv` | 13 名逐平台耗时/类型/文件行号/错误头 |
| `03-error-bodies.md` | 逐项断言/栈/错误体摘录（含 Q2 子进程 AggregateError、W trace 形态、ENOTEMPTY） |
| `04-q2p2-timeline.tsv` | Q2 P2 三平台 child 阶段时间线与阶段预算耗尽点 |
| `05-chief-workflow-trace-labels.md` | W 家族 trace 逐行标注与“通过变体”对照 |
| `06-registry-quiescence-r9.tsv` | 26 个 init 转储的 live/unexpected 条目核对（x64fu 生效证据） |
| `07-knownred-r9.json` | 三套 known-red 逐名单匹配（0/0/1） |
| `08-r8-r9-transition.json` | R8→R9 名称级迁移（保留/新红/转绿） |
| `09-budget-evidence.md` | Node per-test timeout 优先级探针、AC-4/W-J5/Q2 预算矩阵与 #137 覆盖判断 |
| `10-count-reconciliation.md` | 协调者口径对账、平台矩阵、known-red 与 #137 覆盖修正 |
| `11-spawn-fence-third-route.md` | spawn fence 第三路证据与最小修法 |
| `extract-r9.py` | 只读复现脚本（工件根 → summary/matrix/knownred） |

## 附录 B：复现命令

```bash
# 数据源（原始工件只放 /tmp，不入库）
gh run download 43887939365 -D /tmp/r11-art
# /tmp/r11-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r9-evidence
KR=角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/knownred
python -I "$EV/extract-r9.py" /tmp/r11-art /tmp/r9-out "$KR"
# 产出 01/02/07 三件；03–06、09–11 为人工摘录/标注（生成方法见各文件抬头）

# 对照
# R8 工件：/tmp/r8-art（run 43867573699，main @ 5661a73）
# R7 工件：/tmp/r10-art（run 43859105048，main @ d1f256f）
```

## 附录 C：关键结论速览

- 三平台唯一失败名 **3 / 11 / 8**，合并 **13**；x64 的 11 = fail 6 + cancelled 5（超时）。
- **x64fu 生效**：core-in-flight 共享阻塞消失（26 个 init 转储零在途 product）；W33/missing-confirmation/task-restart/independent C Window 转绿。
- **7 名 W 家族同根（12 个平台失败实例）**：夹具 `turnLastResortMs=4500` 在慢 runner 上中止 product 发布回合（“本轮执行超时”），`closeBasis` 缺失；W34 x64 另有 18s<20s 预算矛盾；W35 x64 是 W34 级联。
- **Git team plan**：夹具根未 realpath（macOS /var、Windows RUNNER~1）→ 产品安全校验 `git-journal-directory-invalid`；测试假设，known-red orchestration 24→1。
- **Q2 P2 #137 不覆盖**：显式 300s + 子进程 300s 看门狗 + 90s 阶段预算；arm64/Windows 已自然失败，x64 只到 persisted-child 252s。
- **AC-4 #137 覆盖（预算-only）**：R8 x64 246.3s 绿。
- **W-J5 #137 不覆盖**：显式 180s；需改选项后复跑。
- **spawn fence**：plat 两路缺第三路（零进程记录 + `git-host-lease-invalid-before-command`）。
- **Windows restart**：ENOTEMPTY 清理竞态，加有界重试。
- **批次**：A 夹具根 / B chief-workflow 发布预算 / C spawn fence 路 C / D restart 清理 / E Q2 预算 / F W-J5 预算；AC-4 验证。第九轮验收：宇宙 0（或 owner 接受的 Q2 单项）、known-red 0/0/0、B0/B7 基线重建、已绿项零回退。
