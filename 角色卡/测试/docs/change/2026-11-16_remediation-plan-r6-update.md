# R6：第五轮三平台测试 CI（六批合并后）结果重归因与批次投影更新

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r6`（分支 `analysis/test-debt-r6`，起点 `82dc180` = `origin/main`，含 B3a 残差 #116 / B5 #117 / R5 文档 #118 / B6a #119 / B6b #120 / cife #121）
- 范围：**只分析、只写本文件与同名 `_r6-evidence/` 证据**。未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：GitHub Actions run **43848313583**（`Test matrix (development feedback)`，`workflow_dispatch` on `main @ 82dc18003152bec26851b894aa1e011a7bb22219`，2026-11-16T10:22:55Z 创建，11:09:57Z 完成，conclusion failure——仅测试步骤失败，两平台 typecheck 均 success）。工件（**权威数据源**）：
  - `test-logs-mac-x64/test-ci-output.log`（1,667,750 B）
  - `test-logs-win-x64/test-ci-output.log`（1,113,600 B）
  - **`test-logs-mac-arm64` 不存在**：arm64 job 在 job 级被 cancelled（10:22:57–10:37:57Z，15m00s，**0 个步骤记录、runner_name 为空、job 日志 BlobNotFound、无工件**）——非测试失败，平台覆盖缺口如实披露（见 §1.2）。
- CI 命令（R6 起变化）：`node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts"`（`--test-force-exit` 由 #121/cife 引入，仅影响全部用例完成或命名失败后的进程退出，不改变用例执行与判定语义）；Node 24.14.0（CI）。
- 方法：沿用 R2–R5 脚本集（`extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs`），仅改 run 元数据、工件根（`/tmp/r9-art`）、arm64 缺失处理与块码来源（arm64→x64 回退，见 §3.3）。分族规则**逐字沿用 R2–R5**，未调参。
- 原始工件：`/tmp/r9-art/test-logs-{mac-x64,win-x64}/test-ci-output.log`（本机 Git Bash 的 `/tmp` 映射为 `C:\Users\51054\AppData\Local\Temp`）。**原始工件不入库**。

## 0. 摘要

1. **两平台完整跑完、arm64 缺失**：x64 tests 5,825 / pass 5,755 / **fail 50** / cancelled 1 / skipped 19（44m40.6s）；Windows tests 5,826 / pass 5,743 / **fail 51** / cancelled 0 / skipped 32（25m53.9s）。**权威唯一名 51 / 51，行级唯一 ✖ 55 / 55**——与协调者「fail 50/51、唯一 ✖ 55/55」精确吻合。macOS arm64 job 级 cancelled、无步骤/无工件，本记录不计其为失败。
2. **合并宇宙 63**（R5 为 116）：R5 交集 **60**、消失 **56**、新增 **3**。消失 56 = 已合入批次绿名 **55**（B3a 残差 13 + B5 16 + B6a 10 + B6b 16）+ **W1b 1**（本轮 Windows 已绿，非批次目标）；新增 3 = `b31 路径 B`（x64）、`multi-runtime request_choice abort ENOTEMPTY`（Windows）、`compatibility-loopback.test.ts` 原生崩溃（Windows，file-level）。
3. **集合对照**：B0 191 命中 **41**（缺失 150）、B7 190 命中 **41**（缺失 149）、冻结 known-red 62 命中 **33**（33/33 全部仍红，逐名不变）；缺失名 **0 个**出现在两平台任何 skip 行。
4. **分族（规则口径，合计 63）**：known-red 33 / 未归类 13 / e71501c 漂移 10 / B0 其他 3 / ci-path 2 / flake 1 / hang 1；VCA 0 / git-config 0 / source-gate 0（归零）。平台分布首次高度分化：**39 名两平台同红 / 12 名 macOS-x64-only / 12 名 Windows-only**（arm64 无数据）。
5. **六批核对（对 R5 投影 55）**：R5 投影 55 中 **54 仍红 / 1 已绿（W1b）**；60 个已合入批次目标 **55 绿 / 5 仍红**——B3a 残差 `run-pin：M1/M2/M3`（1）、B6a `Git final spawn fence` 与 `Pipeline initial workflow source`（2）、B6b `Q74` 与 `Q normal-new early chain`（2）。R6 实际 63 vs 「扣除 W19 后的预期 56」= **−1 额外绿（W1b）+5 批次残差 +3 新增**。
6. **剩余 ~55 的构成确认**：每平台行级 55 = known-red 33 + 杂项；合并宇宙 63 中非 known-red 30 名 = 9 名 B3c Windows 残差 + B4 平台残差 8 名（W29×3/W30×2/W34/W35/W36）+ W19/W33 + W-J5 + task-restart + Q2 P2 + spawn fence + Q normal-new early chain + run-pin + Q74 + Pipeline initial workflow + 3 名 R6 新增（b31、multi-runtime ENOTEMPTY、compatibility-loopback）。
7. **跟进批现状**：B3c 9 名全部 Windows-only 仍红（`git-file-final-guard-unproven`，与 R4/R5 同码）；B4 7 名全部 macOS-x64-only 仍红（W29×3/W30×2 为 `file-gate-host-facts-unproven`，W34/W35 为 `git-file-final-guard-unproven`）；W-J5 x64 再次 180s（**R3/R5/R6 三度 x64-only**）；W36 x64-only 仍红（tools 形状 TypeError）；**W1b 本轮 Windows 已绿、不在宇宙**；task-restart 两平台仍红；Q2 P2、spawn fence x64-only 仍红；direct-role e2e 旧名两平台仍红。已合入批次残差 5 名：run-pin、spawn fence、Pipeline initial workflow、Q74、Q normal-new early chain。**R5 §3.2 的「CI Windows `D:\a\...` 工作目录形态」假设由 B3c-fu 推翻，判别变量是 TEMP 的 8.3 短名拼写**（本记录按 §3.3 更正）。
8. **四批投影**（W19/W33 + B4-fu + B3c-fu + misc，按各批记录目标名）：63 − **13**（w19 2 + b4fu 0 + b3cfu 9 + misc 2）= **预计剩余 50**（x64 47 / Windows 38；known-red 33 + 17 杂项）。W1b 已绿，b4fu 的守卫加固是回归保险；W29/W30/W34/W35/W36/W-J5/Q2 P2/spawn fence 均不在四批范围，保持平台/产品候选。
9. **B7 收口建议**：R7 合并四批 + **arm64 重试**，以三平台全量复跑为准；随后三套 known-red（runtime-core-33/gates-5/orchestration-24）验证、B0/B7 基线重建（REMOVED/未复现登记）、残差归零报告（确定性 desktop-known-red 与平台候选分套）。owner 裁决项见 §6.2（W29/W30 macOS file-gate、W34/W35 平台链、W36/W-J5、Q2 P2、spawn fence、R6 新增 3 项、run-pin/Q74/Pipeline 残差、arm64 runner）。

## 1. 计数表与口径对账

| 平台 | job 结果 | 起止（UTC） | job 耗时 | 测试步骤耗时 | tests | pass | fail | cancelled | skipped | 唯一名（权威） | 行级唯一 ✖ | `duration_ms` |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| macOS arm64 | **cancelled（job 级）** | 10:22:57–10:37:57 | 15m00s | —（0 步骤） | — | — | — | — | — | —（无工件） | — | — |
| macOS x64 | failure（仅测试步骤） | 10:23:00–11:09:56 | 46m56s | 44m40.6s | 5,825 | 5,755 | **50** | 1 | 19 | **51** | **55** | 2,680,564.56 |
| Windows x64 | failure（仅测试步骤） | 10:22:58–10:50:08 | 27m10s | 25m53.9s | **5,826** | 5,743 | **51** | 0 | 32 | **51** | **55** | 1,553,909.97 |

- **权威唯一名口径**（去缩进/耗时、排除 `✖ failing tests:` section 头）：**51 / 51**，两平台合并 **63**。x64 的 `ℹ fail 50 + ℹ cancelled 1 = 51`；Windows `ℹ fail 51 = 51`（含 1 个 file-level 崩溃条目，见 §1.3）。
- **协调者「唯一 ✖ 55」**：两平台均**精确吻合**。55 = 51 唯一名 + 1（W19 以 indent 0/2 两次出现）+ 3 个 section 头行（内嵌子运行顶层 section + 最终顶层 section + 最终嵌套 section）。
- **文件级条目**：x64 0；Windows **2 行**（同一文件 `test\测试\g5-reasoning-verify\compatibility-loopback.test.ts` 在内嵌子运行与最终 section 各出现一次，唯一名 1 个）——**新增原生崩溃事件**（§1.3）。
- **超时条目**（`maxDurationMs ≥ 100000`）：x64 **1**（W-J5/J15，180,003.75ms，count=2）；Windows 0；arm64 无数据。
- **工件完整性**：两份工件均含顶层汇总与最终 `✖ failing tests:` section；无 `##[error]The operation was canceled.` 标记；xmark 行数均 106。
- **Typecheck**：两平台 Typecheck 步骤均 success（`gh api .../jobs` 只读核对）；仅 `Full regression tests (bounded; development feedback)` failure。
- **耗时变化**：相对 R5，x64 41m41s→44m41s（+7.2%）、Windows 25m21s→25m54s（+2.2%）。x64 仍最慢且唯一 180s 挂起在 x64。

### 1.1 行级口径定义（逐字沿用 R2–R5）

`lineLevelUniqueIncludingHeaders = uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）+ sectionHeaderLines（所有 `✖ failing tests:` 行出现次数）`。明细见 `24-linelevel-reconciliation.json`：

| 平台 | fail | cancelled | 权威唯一名 | 保留缩进去耗时唯一 | section 头行 | 行级唯一 ✖ | 协调者 | 差 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x64 | 50 | 1 | 51 | 52 | 3 | **55** | 55 | 0 |
| Windows | 51 | 0 | 51 | 52 | 3 | **55** | 55 | 0 |

### 1.2 macOS arm64 cancelled 披露（**非测试失败**）

| 事实 | 值 | 证据 |
| --- | --- | --- |
| job 名 / id | `test (macos-15, mac, arm64)` / 133234075031 | `gh api .../jobs` |
| 起止 / 耗时 | 10:22:57Z–10:37:57Z（15m00s，远低于 120m `timeout-minutes`） | 同上 |
| 步骤 | **0 个**（无 Set up job，无任何 step） | 同上 |
| runner | `runner_name: ""`（未分配/丢失） | 同上 |
| job 日志 | `BlobNotFound`（HTTP 404，无日志 blob） | `gh api .../jobs/133234075031/logs` |
| 工件 | 无（run 仅 2 个 artifact：mac-x64 / win-x64） | `gh api .../artifacts` |
| 结论 | **runner 容量/队列/分配问题，非测试失败**；arm64 失败面未知 | — |

**影响**：本轮所有 macOS 结论仅来自 `macos-15-intel`（x64）。R5 的 12 名 macOS 独有失败中，10 名（W29×3/W30×2/W34/W35/spawn fence/Q2 P2、D3 ENOTDIR）为 arm64+x64 双平台同红，2 名（W-J5/W36）为 x64-only；本轮它们在 x64 仍红，arm64 是否同样红**无法从本轮工件判定**。B7 的三平台结论必须以 arm64 重跑为准。

### 1.3 Windows file-level 原生崩溃（新增，单列）

- 工件行（内嵌与最终各一）：`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` → `✖ test\测试\g5-reasoning-verify\compatibility-loopback.test.ts (3628.4306ms)`。
- 该文件为真实 provider loopback 测试（同轮其子用例 Claude/Codex/Pi 均 ✔）；崩溃是 **Windows 原生 libuv 断言**，file-level 计入 `ℹ fail 51` 与唯一名（名称即文件路径）。
- 定性：**native-infra crash / 平台候选**（规则分族落入 unclassified-new，语义修正见 `25-family-semantic-corrections.tsv`）。R5 无此事件。

## 2. 新宇宙与集合对照

| 集合 | 数量 | R6 交集 | 说明 |
| --- | ---: | ---: | --- |
| R6 合并宇宙 | **63** | — | x64 51 / Windows 51（两平台不完全相同，见 §2.3） |
| 上一轮 R5 宇宙 | 116 | **60** | **消失 56、新增 3**（R5 消失=两平台未复现；arm64 无工件） |
| B0 冻结全量基线 | 191 | **41** | R5 78 → R6 41；缺失 150 = 113（R5 起未复现）+ 37（本轮新绿） |
| B7 全量 | 190 | **41** | R5 78 → R6 41；缺失 149 = 112 + 37（同一批新绿） |
| 冻结 known-red 62 | 62 | **33** | 与 R5 逐名相同（33/62 全部仍红） |
| 历史 triage 186 | 186 | **16** | KR 6 / MAC 0 / NEW 10 |

- 其他统计：`current_not_in_any_baseline_or_triage` = **15**（R5 29）；`windows_only` = **12**（R5 10）；`mac_only_not_windows_log` = **12**（R5 12）；未解析文件 0；无仓库命中但有日志映射 6。
- **B0/B7 缺口完整性**：B0 缺失 150、B7 缺失 149 名中，**0 名出现在两平台任何 skip（`﹣`）行**（x64 skip 19 名 / Windows skip 32 名全量扫描）——缺失不是被跳过。逐名见 `19-b0-b7-closure.tsv` 与 `26-b0-b7-closure-summary.json`。

### 2.1 消失 56 名（R5 有、R6 两平台均未复现）

按 R5 族分解（`15-r5-comparison.json`）：

| R5 族 | 消失数 | 对应批次/来源 | 判定 |
| --- | ---: | --- | --- |
| B0 既有红（其他） | 15 | B6b（15 个 b0 名） | 转绿 |
| flake 时序族 | 15 | B5（14 个 flake）+ f-handler F3（B6b） | 转绿 |
| source 门测试装配 | 13 | B3a 残差（14 名中 13） | 转绿，`run-pin：M1/M2/M3` 仍红 |
| 未归类 | 11 | B6a（10）+ **W1b（1，非批次目标）** | B6a 10 转绿；W1b 本轮 Windows 自愈 |
| 挂起/超时 | 2 | B5（`关闭全部`、`C-04` 旧名退役） | 转绿/退役 |
| **合计** | **56** | 批次绿 55 + W1b 1 | R5 116 − 56 = 60 仍红 |

### 2.2 新增/复现 3 名（R5 宇宙外）

| # | 名（缩写） | 平台 | 族（规则） | 集合命中 | 定性 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main…` | **x64-only** | unclassified-new | 无 | `b31-fixed-release-auto-desktop.test.ts:819`：`deriveWorkflowView().closed.outcome` actual `undefined` ≠ expected `delivered`；慢 runner 时序候选，**待定性** |
| 2 | `actual Core request_choice abort preserves accepted/current facts…` | **Windows-only** | ci-path-canonical（语义应为 flake） | **B0+B7** | `ENOTEMPTY: Directory not empty: C:\Users\RUNNER~1\…\ans-d1-ect9pu`——临时目录清理竞态，flake 候选 |
| 3 | `test\测试\g5-reasoning-verify\compatibility-loopback.test.ts` | **Windows-only** | unclassified-new（语义应为 native crash） | 无 | 原生 libuv 断言 `UV_HANDLE_CLOSING`，file-level（§1.3） |

### 2.3 平台矩阵（63）

| 组合 | 数量 | 名 |
| --- | ---: | --- |
| x64 + Windows | **39** | known-red 33 + W19、W33、task-restart、Q normal-new early chain、Q74、run-pin（6） |
| **macOS-x64-only** | **12** | W29×3、W30×2、W34、W35、W36、W-J5、Q2 P2、spawn fence、`b31 路径 B` |
| **Windows-only** | **12** | 9 个 B3c 残差 + `multi-runtime ENOTEMPTY` + `Pipeline initial workflow source` + `compatibility-loopback` |

逐名见 `27-platform-matrix.tsv` 与 `16-platform-diff.tsv`。已知变化：`Pipeline initial workflow source` 由 R5 三平台红变为 **Windows-only**（macOS x64 已绿）；W19/W33 由 R5 三平台红变为两平台红（arm64 未知）。

### 2.4 B0/B7 缺口闭合

- B0 191：R6 命中 **41**（33 KR + 8 非 KR：task-restart、multi-runtime abort、Q normal-new early chain、Q74、run-pin、W19、W33、W34）；缺失 **150** = 113（R5 已缺失，0 skip）+ **37（本轮新绿）**。
- B7 190：R6 命中 **41**；缺失 **149** = 112 + 同一批 37。
- 判定口径沿用 R4/R5：**本轮两平台 CI 非红，不作永久转绿**（arm64 无数据）；B7 重冻结时按 REMOVED / 未复现登记。

## 3. 分族重算（互斥分族，规则口径合计 63）

| 族 | R6 数量 | 平台分布（x64/win） | R5 数量 | 变化 | 代表文件（计数） |
| --- | ---: | --- | ---: | --- | --- |
| 冻结 known-red 62 | **33** | 33/33 | 33 | 不变（逐名相同） | trunk-upgrade-validation 5、trio-worker-report 3、section1-write-preauthorization 2、appointment-roster 2 |
| 未归类 | **13** | 2/11 | 22 | −9 | 9 名 B3c Windows 残差 + b31 + spawn fence + compatibility-loopback + Pipeline initial workflow |
| e71501c 语义漂移 | **10** | 10/2 | 10 | 不变 | chief-workflow：W19、W29×3、W30×2、W33、W34、W35、W36 |
| B0 既有红（其他） | **3** | 3/3 | 17 | −14 | Q normal-new early chain、Q74、run-pin |
| CI 路径规范形/守卫 | **2** | 1/1 | 1 | +1 | Q2 P2（x64）、multi-runtime ENOTEMPTY（Windows，语义应为 flake） |
| flake 时序族 | **1** | 1/1 | 16 | −15 | task-restart |
| 挂起/超时族 | **1** | 1/0 | 3 | −2 | W-J5（x64 180s） |
| source 门测试装配 | **0** | 0/0 | 14 | **−14（归零）** | — |
| VCA 流程/通道 | **0** | 0/0 | 0 | 仍为 0 | — |
| macOS git-config 平台族 | **0** | 0/0 | 0 | 仍为 0 | — |
| **合计** | **63** | 51/51 | **116** | **−53** | — |

补充（规则语义滞后，阅读时按语义修正；逐名见 `25-family-semantic-corrections.tsv`）：

1. **`actual Core request_choice abort…`（Windows）被 `multi-runtime.test.ts$` 规则归入 ci-path**，实际错误为 ENOTEMPTY 临时目录清理 → 语义应属 flake-timing。
2. **`compatibility-loopback.test.ts` file-level 崩溃被归入未归类**，语义应为 native-infra crash（平台候选）。
3. **`run-pin：M1/M2/M3` 由 R5 的 source-gate 变为 R6 的 b0-existing-other**：其失败面已从 source 门错误码变为重复派发抑制断言（`true !== false`），块码不再命中 source-gate 规则。**不是新族，是同一名失败语义变化**。
4. **VCA 与 source-gate 归零**：R5 已 VCA 归零；本轮 source-gate 14→0，仅 `run-pin：M1/M2/M3` 转入 B0 其他（B3a 残差 13/14 生效）。
5. macOS git-config 族连续第五轮 0：两平台工件 grep 四个 git-config 错误码均 0。

### 3.1 已合入代码批次核对（对 R5 投影绿名；#118 文档与 #121 cife 不改变宇宙）

| 批次（已合入） | R5 投影绿名 | R6 实际转绿 | 仍红 | 吻合性 |
| --- | ---: | ---: | ---: | --- |
| B3a 残差（#116） | 14 | **13** | **1** | `run-pin：M1/M2/M3`（run-pin.test.ts:392，重复派发抑制 `true !== false`） |
| B5（#117） | 16 | **16** | 0 | 完全吻合（14 flake + `关闭全部`/`C-04` 旧名退役） |
| B6a（#119） | 12 | **10** | **2** | `Git final spawn fence`（仍 `git-host-lease-invalid-before-command`，macOS-x64-only）+ `Pipeline initial workflow source`（Windows-only，ENOENT realpath stable-source） |
| B6b（#120） | 18 | **16** | **2** | `Q74`（`/已获准并落盘/` 文案断言）+ `Q normal-new early chain`（最新意图缺失；misc 批的目标） |
| **合计** | **60** | **55** | **5** | — |

> R5 投影的 55 还包含 W19（1 名，w19 批未合入本轮）与 W1b（本轮已绿）。R6「扣除 W19 后预期 56」→ 实际 63 的偏差分解见 §4。

### 3.2 跟进批目标名在本轮 CI 的现状

| 批次/跟进项 | 目标名（缩写） | R6 现状 | 平台 | 证据 |
| --- | --- | --- | --- | --- |
| **B3c-fu 9 名** | AC-1/AC-6/AC-7/P1.2-AC-28、AC-16、AC-2 Pi、P1.2-AC-27、gate active-tool、gate H13、gate host-continuation、host-continuation（run-stop）、Q16 | **9/9 仍红**，全部 `git-file-final-guard-unproven` + `Actual file/edit handlers…`（与 R4/R5 同码） | **Windows-only** | `10-block-codes.json`；macOS x64 全绿 |
| **B4 7 名** | W29 document-change/source-loss/wrong-flow；W30 连续写入后/真实重启迁移后 | **5/5 仍红**，`file-gate-host-facts-unproven`（product write_file 被拒） | **x64-only** | W29/W30 耗时 9.5–10.3s |
| | W34、W35 | **2/2 仍红**，`git-file-final-guard-unproven`（W33 遗留 active 条目链） | **x64-only** | 542/527ms |
| | （B4-fu 不改以上 7 名；W1b 见下） | — | — | b4fu 记录 §4 |
| **B4-fu W1b** | `W1b 真实无退修选项…` | **未在 R6 宇宙（Windows 已绿）**；b4fu 的 2.5s→15s 守卫为回归保险 | Windows（R5-only） | `06-merged-universe.json` 无 W1b |
| **W36** | `W36 真实Chief可无M0-plan-D3派五builtin准备…` | **仍红**，`TypeError: Cannot read properties of undefined (reading 'name')` at chief-workflow.test.ts:2111 | **x64-only** | 3.6s |
| **W-J5** | `W-J5/J15：judge 代批 intent 冻结…` | **仍红**，`test timed out after 180000ms`（max 180,003.75ms，count 2） | **x64-only** | R3/R5/R6 三度 x64-only |
| **task-restart** | `重启恢复：未投递任务重新入队一次…` | **仍红**（misc 批目标） | x64+Windows | 2.09s / 2.05s |
| **Q2 P2** | `Q2 P2 first new project…` | **仍红** | **x64-only** | 5.4s；macOS file-gate 候选 |
| **spawn fence** | `Git final spawn fence…` | **仍红**（B6a 未竟；misc 仅分类不改） | **x64-only** | `git-host-lease-invalid-before-command` |
| **direct-role e2e** | `Q normal-new early chain…` | **仍红**（B6b 未竟；misc 批重写并退役旧名） | x64+Windows | 173ms / 141ms |
| R6 新增（无批次） | `b31 路径 B`、`multi-runtime ENOTEMPTY`、`compatibility-loopback` | 见 §2.2 | x64 / win / win | — |

### 3.3 arm64 缺失对结论的影响

1. **平台覆盖缺口**：12 名 macOS-x64-only 失败在 arm64 上是否存在**未知**。R5 证据显示其中 10 名（W29×3/W30×2/W34/W35/spawn fence/Q2 P2 等）在 arm64/x64 双平台同红，W-J5/W36 在 R5 即为 x64-only，但 R6 不能引用 R5 代替本轮 arm64。
2. **集合口径**：本轮所有「转绿/消失/缺口」均为 **x64+Windows 两平台事实**；不判三平台转绿。B7 重冻结必须等 arm64 补齐。
3. **块码来源变化**：`assign-families.mjs` 从 R2–R5 的 `platforms.macos_arm64` 回退到 `platforms.macos_x64`（本轮唯一 macOS 工件）。规则本体未改；块码语义在 R3–R5 平台上同码的历史事实可作参照，但属**方法差异**，已在 `11-families.json` 的 `blockCodeSource` 字段披露。
4. **R5 §3.2 假设更正**：B3c 的 Windows 矛盾不是 `D:\a\ans-studio\ans-studio` 工作目录形态，而是 **CI Windows TEMP 的 8.3 短名拼写**（`C:\Users\RUNNER~1\AppData\Local\Temp`）与同步 `realpathSync` 不展开短名；B3c-fu 已以 CI 等价 8.3 短名口径复现 9/9 并修复（b3cfu 记录 §2）。

## 4. 与 R5 批次投影（55）的偏差逐条

> 口径：R5 投影 55 = R5 116 − 61（B3a 残差 14 + B5 16 + B6a 12 + B6b 18 + W19 1）。R6 为六批合并（含其中四批，不含 W19）后的首个真实 CI。若按「扣除 W19」的基准，预期为 56。

| 项 | 数量 | 说明 |
| --- | ---: | --- |
| R5 投影剩余 | **55** | — |
| 其中仍红 | **54** | 符合投影（含 W33、B3c 9、B4 7、W36、W-J5、task-restart、Q2 P2、known-red 33） |
| 其中已绿 | **−1** | **W1b**（R5 投影内含；本轮 Windows 已绿） |
| R6 实际宇宙 | **63** | 对「基准 56」偏差 **+7** |
| 其中：批次残差仍红（已合入批次） | **+5** | run-pin（B3a 残差）、spawn fence + Pipeline initial workflow（B6a）、Q74 + Q normal-new early chain（B6b） |
| 其中：R6 新增 | **+3** | b31 路径 B、multi-runtime ENOTEMPTY、compatibility-loopback |
| 其中：R5 投影外但非新增 | **+1** | **W19**（R5 投影已扣除，但 w19 批未合入本轮） |
| 恒等 | — | 56 − 1（W1b 绿）+ 5 + 3 = **63**；再把 W19（1，投影扣除但实际红）计入：55 − 1 + 5 + 3 + 1 = 63 |

**族偏差（R5 规则族 → R6 规则族）**：known-red 33→33；未归类 22→13；B0 其他 17→3；flake 16→1；source-gate 14→0；drift 10→10；hang 3→1；ci-path 1→2；VCA 0→0；git-config 0→0。逐族新/消失名单见 `15-r5-comparison.json` 的 `familyDelta`。

## 5. 四批在跑批次合入后的预计剩余

> 口径：以 **R6 实际宇宙 63** 为基线，扣除四批记录中的目标名。四批均**未合入本轮 CI**；投影仅用于规划。原始目标名见 `22-batch-projection-r6.json` 与 `23-projected-remaining.tsv`。

### 5.1 逐批扣除

| 批次 | 状态（截至 2026-11-16 晚） | 扣除 | 匹配 R6 | 说明 |
| --- | --- | ---: | ---: | --- |
| **W19/W33**（`w19`，a469a83） | 分支已提交、未合入 main | **2** | 2 | W19 产品 close-notify；W33 hub 跨 run information-only 例外；**direct-role-capabilities 三处旧语义已在批内更新，R5 的 +3 风险已消除**；W19 定向 3×、W33 定向 3×、chief-workflow 全文件 66/66 绿 |
| **B4-fu**（`b4fu`，84c4a3c） | 完成、未合并 | **0** | 0 | 唯一目标 W1b **本轮已绿、不在宇宙**；守卫 2.5s→15s 为回归保险；W29/W30/W34/W35/W36 明确不改（平台/产品候选） |
| **B3c-fu**（`b3cfu`，99adf94） | 完成、未合并 | **9** | 9 | 9 名 Windows-only 残差；8.3 短名 TEMP 本地逐名复现 → 修复后 3 口径 × 3× × 7 文件 = 63/63 EXIT=0；与 R6 Windows 工件 9 名逐名一致 |
| **misc**（`misc`，2c323ff） | 完成、未合并 | **2** | 2 | task-restart（v2.0.0 run-bound 重写，3× 2/2 绿）+ direct-role e2e 旧名退役（fixed A1→A2→A3，3× 3/3 绿）；W-J5/Q2 P2/spawn fence **仅分类不改** |
| **合计** | — | **13** | 13 | — |

### 5.2 预计剩余 50 名

63 − 13 = **50**（x64 47 / Windows 38；合并宇宙 50）：

| 类别 | 预计剩余 | 名 |
| --- | ---: | --- |
| known-red-62（冻结） | **33** | B7 重冻结，不排修 |
| macOS 产品 file-gate（W29×3、W30×2） | **5** | `file-gate-host-facts-unproven`；与 Q2 P2 同源 |
| macOS 平台链（W34、W35） | **2** | `git-file-final-guard-unproven` + W33 遗留 active 条目 |
| x64 平台候选（W36） | **1** | tools 形状 TypeError |
| x64 180s（W-J5） | **1** | R3/R5/R6 三度 x64-only |
| macOS file-gate（Q2 P2） | **1** | host facts/protection |
| macOS FSEvents（spawn fence） | **1** | 两路 fail-closed |
| B6a 未竟（Pipeline initial workflow） | **1** | Windows-only ENOENT realpath |
| B6b 未竟（Q74） | **1** | `/已获准并落盘/` 文案断言 |
| B3a 残差未竟（run-pin M1/M2/M3） | **1** | 重复派发抑制断言 |
| R6 新增（b31 路径 B） | **1** | x64-only，待定性 |
| R6 新增（multi-runtime ENOTEMPTY） | **1** | Windows flake 候选 |
| R6 新增（compatibility-loopback 原生崩溃） | **1** | Windows native-infra |
| **合计** | **50** | — |

**风险与假设**：

1. **w19**：产品语义变更（close 必发通知、hub 跨 run 白名单）面较广；批内 `direct-role-capabilities` 46/47（唯一红为既有 known-red `Retained intent confirmation`）与 chief-workflow 66/66 绿；R7 三平台复核。
2. **b3cfu**：Windows CI 等价性依赖 TEMP 8.3 短名（工件已证 `RUNNER~1`）。若 R7 Windows runner TEMP 非短名，该 9 名可能已自然绿（修复仍是正确语义）。
3. **misc**：direct-role 旧名退役后，R7 宇宙应出现新名 `Q normal-new fixed chain: …` 且为绿；task-restart 单次 ~45–50s，需确认不超 CI 预算。
4. **b4fu**：W1b 已绿，守卫加固不影响其他用例（全文件 64/66，仅 W19/W33 红——该工作树未含 w19）。
5. **未覆盖项**：b31、multi-runtime ENOTEMPTY、compatibility-loopback、Q74、run-pin、Pipeline initial workflow 均无批次覆盖；若 R7 复现，各自 +1。
6. **投影不替代 R7 CI**；arm64 重试是 B7 前置。

## 6. B7 收口建议与 owner 裁决项

### 6.1 建议编排

1. **R7 CI（三平台全量复跑）**：合并四批（w19 + b4fu + b3cfu + misc）→ 触发 test-ci；**arm64 必须重试并产出工件**（若再次 job 级 cancelled，先排查 runner 容量/队列或改用更大 runner，再谈三平台结论）。验收口径：x64 ≤47、Windows ≤38、合并 ≤50；direct-role 新名出现且绿。
2. **三套 known-red 验证**：`runtime-core-33` / `gates-5` / `orchestration-24` 三套冻结基线在 R7 仍逐名红（33 名），作为 B7 冻结的锚；任何 known-red 名消失需单独说明（是否 REMOVED/重命名）。
3. **B0/B7 基线重建**：以 R7 三平台工件重建 B0（191 → 新基线）与 B7（190 → 新基线）；R5/R6 未复现的 150/149 名按 **REMOVED（主动退役/重命名）** 与 **未复现（green，待观察）** 分列；`b31`、`multi-runtime abort`、`compatibility-loopback` 与四批新名按新基线登记。
4. **残差归零报告**：R7 后对每个剩余名给出 owner 类别（确定性 desktop-known-red / macOS 平台 / x64 性能 / Windows 原生 / flake）与处置结论；目标是把「未归类」压缩到 0，或明确标注为平台已知差异。
5. **B7 冻结文档**：B7 重冻结时同步更新 `角色卡/桌面窗口/…/segment3/full/failnames.txt` 与 `b0-frozen-failnames-191.txt`（或新版本号），并在测试角色文档记录变更。

### 6.2 owner 裁决项

| # | 项 | R6 证据 | 需裁决 | 建议 |
| ---: | --- | --- | --- | --- |
| 1 | **W29×3 / W30×2（macOS file-gate）** | `file-gate-host-facts-unproven`；product `write_file` 被拒 5 次；与 Q2 P2 同源（b4fu §1.1） | 产品修 host facts/protection currency（`run-role.ts` / `git-command.ts` 参考点） vs 接受为 macOS 平台已知红 | 优先产品修复；若接受，B7 登记 desktop-known-red（macOS） |
| 2 | **W34 / W35（macOS 平台链）** | `git-file-final-guard-unproven` + W33 遗留 active 条目（macOS 5/7 vs Windows 2）；B4 更新的断言在失败点之后未执行 | W33 合入后是否预期自愈；若不自愈，是否随 #1 一并修 file-gate | R7 先观察（w19 已修 W33 清理链）；仍红则归入 #1 范畴 |
| 3 | **W36（x64 平台候选）** | tools 形状 TypeError at chief-workflow.test.ts:2111；本机 4× 绿 | 夹具加固（记录异常 tools 形状/请求来源） vs 继续观测 | 观测；R7 x64 复现则加固夹具 |
| 4 | **W-J5（x64 180s）** | R3/R5/R6 三次 x64-only；本轮 180,003.75ms；x64 测试步骤 44m41s（arm64 R5 约一半） | x64 性能/泄漏专项 vs 调整测试预算 vs 继续观测 | 第三次复发，建议 R7 后开 x64 性能专项（至少定位 63–71s 正常耗时 vs 180s 超时差异） |
| 5 | **Q2 P2（macOS file-gate）** | 5.4s 失败，`file-gate-host-facts-unproven`；Windows 绿（慢） | 与 #1 同一产品修复；或 macOS 定向复跑 | 与 #1 合并处理 |
| 6 | **spawn fence（macOS FSEvents）** | `git-command-failed:null:unknown` 期望 vs 实际 `git-host-lease-invalid-before-command`；两路 fail-closed | 接受「两路等价 fail-closed」为平台已知差异并改期望 vs 产品修复 | 若 owner 认可语义等价，B7 前更新期望；否则 macOS 定向复跑 |
| 7 | **b31 路径 B（R6 新增，x64）** | `closed.outcome` undefined≠delivered at b31:819；R6 首次 | 测试侧等待屏障（deriveWorkflowView 异步收敛） vs 产品竞态修复 | 先在 x64 复跑定性；倾向测试侧加有界等待（不弱化断言） |
| 8 | **multi-runtime ENOTEMPTY（R6 新增，Windows）** | `ans-d1-ect9pu` 临时目录清理 `ENOTEMPTY` | 清理重试/夹具加固 vs flake 登记 | 归 flake；若复现，清理加有界重试 |
| 9 | **compatibility-loopback 原生崩溃（R6 新增，Windows）** | libuv `UV_HANDLE_CLOSING` assertion（src\win\async.c:76）；file-level | Node/原生基础设施候选 vs 测试进程管理 | 记录为 native-infra；R7 复现则隔离该文件/调整子进程退出 |
| 10 | **run-pin M1/M2/M3（B3a 残差未竟）** | `run-pin.test.ts:392` 实际 `true !== false`；产品已「重复派发抑制」 | 更新期望（新语义） vs 产品回归 | 产品行为看起来是有意新语义；建议 B3a owner 更新期望并核对 10 个 run-pin 用例 |
| 11 | **Q74（B6b 未竟）** | `/已获准并落盘/` 不匹配，输入见工件 | 文案/期望对齐 vs 产品文案修复 | B6b 跟进，按当前产品文案更新 |
| 12 | **Pipeline initial workflow source（B6a 未竟，Windows-only）** | ENOENT realpath `…\.ans\trunk\operations\<hash>\stable-s…` | Windows 清理/真实路径竞态 vs 产品 | B6a 跟进；先在 Windows 复现该 stable-source 读取时序 |
| 13 | **arm64 runner** | job 级 cancelled、0 步骤、无 runner、无日志 | 重试策略/runner 容量 | 立即重试；连续两次失败再升级排查 |
| 14 | **W1b / W19 合并** | W1b 已绿；W19/W33 已修 | 是否仍按计划合入 b4fu/w19 | 合入（回归保险/产品修复），R7 复核 |

## 7. 证据边界与披露

1. **工件为准**：两平台分析全部基于上传工件；run 元数据（SHA/结论/步骤/起止/runner）经 `gh api` 只读核对并记录于 `00-run-metadata.json`。
2. **arm64 缺口**：job 级 cancelled、0 步骤、无 runner、日志 404、无工件；本轮无 arm64 失败面。所有「消失/转绿」均为两平台事实，**不判三平台转绿**；macOS-only 名在 arm64 的状态未知。
3. **单轮样本**：b31、multi-runtime ENOTEMPTY、compatibility-loopback 均为 R6 首次观测；W1b 本轮自愈（R5 为 Windows-only 单次），不判永久转绿。W29/W30/W34/W35、W-J5、W36、Q2 P2、spawn fence 均有 R3/R5 历史复发证据。
4. **W-J5 第三次 x64-only 180s**：本轮无断言失败，仅测试自带 180s 上限到点（max 180,003.75ms，count 2）；x64 总耗时 44m41s 仍显著高于 Windows 25m54s，平台/性能解释成立但尚未定位根因。
5. **Windows file-level 崩溃**：`ℹ fail 51` 与唯一名均包含该 file-level 条目；它是原生 libuv 断言而非用例断言失败，单列披露（§1.3）。
6. **分族规则语义滞后 3 处**（§3 补充 1–3），规则本体逐字沿用未改；`run-pin` 跨族变化由失败语义变化解释，不是规则漂移。
7. **块码来源**：本轮 arm64 无工件，`assign-families` 的 macOS 块码取自 x64（R2–R5 为 arm64）；`11-families.json` 已标注 `blockCodeSource=macos_x64`。
8. **B0/B7 缺口的边界**：缺失 150/149 名中 0 名出现在 skip 行；但 CI 环境与 B0/B7 的 Windows 本机 15 段基线、动态命名/重命名仍可能有差异。仅判「本轮两平台 CI 非红」，永久转绿由 B7 重冻结裁定。
9. **批次投影的假设性**：四批均有记录级证据（各自工作树只读引用）且本机 3×/矩阵验证，但均未合入 R6 CI；投影不替代 R7 CI。misc 的 direct-role 新名在 R7 前不存在于任何宇宙。
10. **R5 §3.2 更正**：B3c 根因由「D: 工作目录形态」更正为「TEMP 8.3 短名 × 同步 realpathSync」；本记录 §3.3.4 已更新。
11. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境）。
12. **只读引用其他工作树**：`w19`（a469a83）、`b4fu`（84c4a3c）、`b3cfu`（99adf94）、`misc`（2c323ff）为只读引用；本工作树仅新增 R6 文档与证据。

## 8. 未决问题（更新）

1. **arm64 runner**：为何 job 级 cancelled（0 步骤/无 runner/无日志）？重试是否恢复？连续失败需升级排查。
2. **W29/W30 + Q2 P2 的 macOS file-gate**：产品修复范围（`run-role.ts` / `git-command.ts` host facts/protection currency）与优先级；W34/W35 是否随 W33 修复自愈。
3. **W-J5**：第三次 x64 180s，是否启动 x64 性能专项（或调整测试预算）？
4. **R6 新增 3 项**：b31（x64）、multi-runtime ENOTEMPTY（win）、compatibility-loopback（win）——各自产品/测试/平台归属与 R7 复现策略。
5. **B3a/B6a/B6b 残差 5 名**：run-pin（期望更新 vs 产品）、spawn fence（平台接受 vs 产品）、Pipeline initial workflow（B6a 跟进）、Q74（文案）、Q normal-new early chain（misc 已修）。
6. **B7 口径**：known-red 33 冻结；B0/B7 新基线如何登记 REMOVED/未复现；剩余 17 名非 KR 如何分套（desktop-known-red / 平台 / flake）。
7. **四批合并顺序与 PR 拆分**：w19（产品 + 测试 + direct-role 更新）、b3cfu（夹具 3 文件）、misc（2 测试文件）、b4fu（1 行守卫）是否同 PR/同轮 CI。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r6-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` | R6 脚本：run 43848313583、工件根 `/tmp/r9-art`、arm64 缺失处理；唯一名/行级/超时/工件完整性 |
| `attribute-blocks.mjs` | 两平台最终 section 逐块错误码归因（新增 `file-gate-host-facts-unproven` / `test timed out after` 观测码） |
| `classify-failures.mjs` | 与 B0 191 / B7 190 / known-red 62 / triage 186 合并去重（arm64 缺失适配） |
| `assign-families.mjs` | 规则逐字沿用 R2–R5；块码来源 arm64→x64 回退（`blockCodeSource` 标注） |
| `summarize-r6.mjs` | 三平台计数速览（两平台 + arm64 cancelled）与超时事实 |
| `compare-r5.mjs` | R5 116 vs R6 63、平台差异、B0/B7 缺口 |
| `project-batches-r6.mjs` | R5 投影 55 vs R6 偏差、六批存活核对、四批扣除与预计剩余 50 |
| `supplement-r6.mjs` | 行级对账（24）、族语义修正（25）、B0/B7 缺口汇总（26）、平台矩阵（27） |
| `00-run-metadata.json` | run/jobs/artifacts/arm64 证据与工件摘要 |
| `01-ci-failures.json` | 两平台完整提取（汇总、唯一名、超时、failing section、行级计数、工件完整性、arm64 状态） |
| `03-failnames-macos-x64.txt` / `04-failnames-windows-x64.txt` | 逐平台唯一失败名 + 文件（51 / 51） |
| `05-platform-counts.json` | 两平台计数速览 + arm64 cancelled 披露 |
| `06-merged-universe.json` | 63 名并集：平台出现、日志/仓库文件映射、集合命中、首个错误行 |
| `07-by-file.tsv` | 按测试文件分组的失败名清单 |
| `08-set-summary.json` | 集合交集与平台独有统计（B0/B7/KR/triage、mac-only 12、windows-only 12） |
| `10-block-codes.json` | 逐名块级错误码（x64 51 / Windows 51 块） |
| `11-families.json` | 互斥分族全量（规则口径；`blockCodeSource`） |
| `12-family-summary.tsv` | 族汇总（族/数量/top 文件） |
| `14-timeouts-and-stall.json` | 超时条目（x64 W-J5 180s）与 arm64 cancelled 披露 |
| `15-r5-comparison.json` | R5 116 vs R6 63：交集 60 / 消失 56 / 新增 3、逐族增减、逐名详情 |
| `16-platform-diff.tsv` | 平台差异清单（x64/win、超时、R5→R6 平台变化） |
| `17-windows-coverage.tsv` | Windows 51 名全量对照（macOS 重叠、R5 Windows 命中、族、错误首行） |
| `19-b0-b7-closure.tsv` | B0 150 / B7 149 名缺口逐名现状（含 R5 是否出现过） |
| `20-r5-projection-vs-r6.json` | R5 投影 55 vs R6 63：54 仍红 / 1 已绿 / 5 批次残差 / 3 新增 / 1 投影外 |
| `21-r5-projection-deviations.tsv` | 逐名偏差（kind/batch/family/platform） |
| `22-batch-projection-r6.json` | 四批扣除 13、预计剩余 50、风险与假设 |
| `23-projected-remaining.tsv` | 预计剩余 50 名逐名（族/平台/裁决类别）+ 四批扣除名单 |
| `24-linelevel-reconciliation.json` | 行级口径对账（51/55、51/55；W19 双缩进 + 3 section 头） |
| `25-family-semantic-corrections.tsv` | 3 处规则语义修正（multi-runtime ENOTEMPTY、compatibility-loopback 原生崩溃、b31 待定性） |
| `26-b0-b7-closure-summary.json` | B0/B7 命中/缺口/新绿 37 名汇总；skip 扫描 0 命中 |
| `27-platform-matrix.tsv` | 63 名平台组合矩阵（39/12/12） |

## 附录 B：复现命令

```bash
# 数据源：两平台工件（原始工件只放 /tmp，不入库；arm64 无工件）
# /tmp/r9-art/test-logs-mac-x64/test-ci-output.log
# /tmp/r9-art/test-logs-win-x64/test-ci-output.log

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r6-evidence
R5=角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence
B7=角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3

node $EV/extract-ci-failures.mjs \
  --x64-artifact /tmp/r9-art/test-logs-mac-x64/test-ci-output.log \
  --win-artifact /tmp/r9-art/test-logs-win-x64/test-ci-output.log \
  --outdir $EV
node $EV/attribute-blocks.mjs \
  --x64 /tmp/r9-art/test-logs-mac-x64/test-ci-output.log \
  --win /tmp/r9-art/test-logs-win-x64/test-ci-output.log \
  --out $EV/10-block-codes.json
node $EV/summarize-r6.mjs --ci $EV/01-ci-failures.json --outdir $EV
node $EV/classify-failures.mjs --ci $EV/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt \
  --kr-dir $B7/knownred --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md \
  --tests-root test --outdir $EV
node $EV/assign-families.mjs --universe $EV/06-merged-universe.json \
  --blocks $EV/10-block-codes.json --outdir $EV
node $EV/compare-r5.mjs --r5 $R5/06-merged-universe.json --r6 $EV/06-merged-universe.json \
  --r5-families $R5/11-families.json --r6-families $EV/11-families.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt --outdir $EV
node $EV/project-batches-r6.mjs --r6-universe $EV/06-merged-universe.json \
  --r6-families $EV/11-families.json --r5-projection $R5/22-batch-projection-r5.json \
  --r5-universe $R5/06-merged-universe.json --outdir $EV
node $EV/supplement-r6.mjs --ci $EV/01-ci-failures.json --universe $EV/06-merged-universe.json \
  --families $EV/11-families.json --b0 $B7/full/b0-frozen-failnames-191.txt \
  --b7 $B7/full/failnames.txt \
  --x64-log /tmp/r9-art/test-logs-mac-x64/test-ci-output.log \
  --win-log /tmp/r9-art/test-logs-win-x64/test-ci-output.log --outdir $EV
```

## 附录 C：关键结论速览

- **三平台计数**：x64 fail 50 / 唯一名 51 / 行级 ✖ 55；Windows fail 51 / 唯一名 51 / 行级 ✖ 55；**arm64 job 级 cancelled（0 步骤、无工件、无日志）**。
- **合并宇宙 63**；vs R5 116：交集 60 / 消失 56 / 新增 3；vs B0 191：41；vs B7 190：41；known-red 33/62 全部仍红；缺失名 0 skip。
- **平台分化**：39 两平台 / 12 macOS-x64-only / 12 Windows-only。
- **六批核对**：B3a 残差 13/14、B5 16/16、B6a 10/12、B6b 16/18；R5 投影 55 → 54 仍红 / W1b 已绿。
- **剩余 55 构成**：每平台 33 known-red + 18 杂项（行级 55 含 W19 双缩进与 3 个 section 头）；合并 63 的杂项 30 名见 §0.6/§5.2。
- **四批投影**：63 − 13 = **50**（x64 47 / Windows 38）；W19/W33 的 +3 旧语义风险已在 w19 批内消除；B4-fu 的 W1b 目标本轮已绿。
- **跟进批现状**：B3c 9 全红（Windows）；B4 7 全红（macOS x64）；W-J5 三度 x64 180s；W36 x64；W1b 已绿；task-restart/Q2 P2/spawn fence/direct-role 旧名仍红；R6 新增 3 项（b31、multi-runtime ENOTEMPTY、compatibility-loopback 原生崩溃）。
- **B7 建议**：R7 合四批 + arm64 重试 → 三平台全量；三套 known-red 验证；B0/B7 基线重建；残差归零报告；owner 裁决 14 项（§6.2）。
