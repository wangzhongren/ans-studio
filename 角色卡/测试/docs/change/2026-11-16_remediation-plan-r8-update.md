# R8：第七轮三平台测试 CI（KR-33 + file-gate 合并后）结果重归因与批次投影更新

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r8`（分支 `analysis/test-debt-r8`，起点 `5661a73` = `origin/main`，含 w19 #122 / b4fu #123 / b3cfu #124 / misc #125 / R6 文档 #126 / KR-33 分类 #127 / macOS file-gate nlink 修复 #128 / KR-33 修复 #129 / misc2 #130 / misc3 #131）
- 范围：**只分析、只写本文件与同名 `_r8-evidence/` 证据**。未修改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源（**权威**）：GitHub Actions run **43867573699**（`Test matrix (development feedback)`，`workflow_dispatch` on `main @ 5661a73d532f37e92cc872badf9dbf077419b453`，2026-11-16T12:33:01Z 创建，13:23:44Z 完成，conclusion failure——仅三平台测试步骤失败，三平台 Typecheck 均 success）。三平台工件齐全：
  - `test-logs-mac-arm64/test-ci-output.log`（1,047,068 B / 7,841 行）
  - `test-logs-mac-x64/test-ci-output.log`（1,186,101 B / 8,037 行）
  - `test-logs-win-x64/test-ci-output.log`（1,033,617 B / 7,816 行）
- CI 命令：`node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts"`；Node 24.14.0（CI）。
- 对照基线：
  - **R6 第五轮宇宙 63**（run 43848313583，`main @ 82dc180`；x64+Windows，arm64 缺失）——名称级对照用 `_r6-evidence/06-merged-universe.json`。
  - **R7 第六轮**（run **43859105048**，`main @ d1f256f`，创建 11:35:36Z，三平台 fail **46/47/46**）。R7 分析文档/证据目录不在本工作树；其工件仍在本机 `/tmp/r10-art`，本记录用同一提取脚本重新提取到 `_r8-evidence/r7-artifacts/` 做名称级对照（三平台 fail 计数与协调者口径精确一致，见 §7.1 披露）。
- 方法：沿用 R2–R6 脚本集（`extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs`），仅改 run 元数据、三平台工件与块码来源（三平台齐全，`assign-families` 按原有优先序取 `macos_arm64`）。分族规则**逐字沿用 R2–R6**，未调参。另新增 R8 对照/投影/补充脚本（`compare-r6-r7-r8.mjs` / `project-batches-r8.mjs` / `supplement-r8.mjs`）。
- 原始工件：`/tmp/r8-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（本机 Git Bash `/tmp` = `C:\Users\51054\AppData\Local\Temp`）。**原始工件不入库**。

## 0. 摘要

1. **三平台完整跑完（arm64 恢复）**：arm64 tests 5,828 / pass 5,779 / **fail 30** / cancelled 0 / skipped 19；x64 5,828 / 5,769 / **fail 38** / cancelled 2 / skipped 19；Windows 5,829 / 5,769 / **fail 28** / skipped 32（含 1 个 file-level）。**权威唯一名 30 / 40 / 28，行级唯一 ✖ 31 / 41 / 29**——与协调者「arm64 30/31、x64 38/41、Windows 28/29」精确吻合。arm64 job 25m14s 正常完成（R6 的 job 级 cancelled 未复现）。
2. **合并宇宙 42**（R7 53 / R6 63）：R6 交集 **40**、消失 **23**、新增 **2**；R7 交集 **40**、消失 **13**、新增 **2**。R7→R8 三平台转绿 17 / 10 / 19 名，新增 1 / 1 / 0 名。
3. **KR-33 归零确认**：runtime-core 冻结 33 **33/33 未出现在 R8 三平台任何失败名**（R7 仍有 6 名 CI 真红：`主干来源`、Core-managed、D3 linked workspace、dispatch_task 文案×2、doc-freeze 九类）。#129 修复在 CI 生效。
4. **file-gate nlink 修复为部分生效**：`file-gate-host-facts-unproven` 与 `git-file-final-guard-unproven` 在三平台日志**均为 0**；W29×3/W30×2/Q2 P2 与 W34/W35 在 **arm64 + Windows 全部转绿**。但 **macOS x64 全部仍红**，且失败面前移为 `git-core-in-flight-unproven`（`chief-workflow.test.ts:1726`，8 名 400–600ms 快失败）与 `Q2 P2` 300s 超时；另有同组第 4 个变体 `document-change-missing-confirmation` 首次入宇宙（x64）。W34/W35 **未在 x64 自愈**（arm64/Windows 已绿）。
5. **剩余构成（42）**：KR-29 冻结 known-red **27**（门禁 5 + 编排 22，三平台同红；kr29a/kr29b 未合入）+ macOS-x64 file-gate 后续阻塞 **9**（W29×4/W30×2/W33/W34/W35）+ Q2 P2 1 + W-J5 1 + spawn fence 1（arm64+x64）+ task-restart 1（arm64+x64）+ independent C Window 1（arm64-only 新增 flake）+ compatibility-loopback 1（Windows file-level 原生崩溃）。
6. **分族（规则口径，合计 42）**：known-red 27 / e71501c-drift 9 / hang-timeout 3 / unclassified-new 3；VCA / git-config / source-gate / flake / B0-other / ci-path 均为 0。
7. **批次核对（R6→R8 窗口）**：KR-33 33/33 绿；b3cfu 9/9 绿（R7 已生效）；misc2 4/4 目标绿（run-pin/Pipeline/Q74/W36）；misc3 b31 与 multi-runtime ENOTEMPTY 绿；w19 W19 绿、W33 仅 x64 仍红；misc 的 Q normal-new early chain 退役成功，但 **task-restart 仍红且更慢**（arm64 55.6s / x64 158.1s 等待超时，Windows 绿）；file-gate 见摘要 4。
8. **三批投影**：R8 42 − kr29a（5）− kr29b（R8 现存 22；23 个冻结目标中 symlink 名 CI 本已绿）− plat（3：spawn fence / compatibility-loopback / W-J5）= **预计剩余 12**（arm64 2 / x64 11 / Windows 0）：W29×4、W30×2、W33、W34、W35、Q2 P2、task-restart、independent C Window。
9. **B7 收口建议**：合并三批后三平台全量复跑（arm64 继续保留）；三套 known-red 逐名 diff（runtime-core-33 33→0 登记 REMOVED/已修，gates-5→0，orchestration-24→wiring REMOVED + 22 待 kr29b）；B0/B7 基线重建（191/190 → 新基线，REMOVED 与未复现分列）；残差归零报告（x64 共享阻塞应作为单一根因专项）。owner 裁决项见 §6.2。
10. **两处需 owner 优先裁决的新事实**：(a) **x64-only `git-core-in-flight-unproven` 共享阻塞**（9 名 macOS-x64 后续红名中 8 名同根，可能是测试夹具清理/时序而非产品缺陷，一次修复可清 8 名；第 9 名 W29 document-change 为通知断言）；(b) **Q2 P2 由 5.4s 断言失败变为 300s 超时**（x64）。另有 task-restart 与 misc 记录的 3× 绿矛盾、independent C Window 新 flake。

## 1. 计数表与口径对账

| 平台 | job 结果 | 起止（UTC） | job 耗时 | 测试步骤 `duration_ms` | tests | pass | fail | cancelled | skipped | 唯一名（权威） | 行级唯一 ✖ | Typecheck |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| macOS arm64 | failure（仅测试步骤） | 12:33:05–12:58:19 | 25m14s | 1,435,548.91 | 5,828 | 5,779 | **30** | 0 | 19 | **30** | **31** | success |
| macOS x64 | failure（仅测试步骤） | 12:33:06–13:23:44 | 50m38s | 2,877,968.19 | 5,828 | 5,769 | **38** | 2 | 19 | **40** | **41** | success |
| Windows x64 | failure（仅测试步骤） | 12:33:04–12:57:12 | 24m08s | 1,386,883.77 | **5,829** | 5,769 | **28** | 0 | 32 | **28** | **29** | success |

- **权威唯一名口径**（去缩进/耗时、排除 `✖ failing tests:` section 头）：**30 / 40 / 28**；三平台合并 **42**。x64 的 `ℹ fail 38 + ℹ cancelled 2 = 40`；Windows `ℹ fail 28`（含 1 个 file-level 崩溃条目）。
- **协调者「唯一 ✖」**：31 / 41 / 29，三平台**均精确吻合**（唯一名 + 1 个顶层 `✖ failing tests:` section 头；本轮每个平台均恰好 1 个最终 section）。
- **文件级条目**：arm64 0；x64 0；Windows **2 行**（同一文件 `test\测试\g5-reasoning-verify\compatibility-loopback.test.ts` 在内嵌子运行与最终 section 各出现一次，唯一名 1 个）——原生 libuv 崩溃再现（§1.3）。
- **超时条目**（`maxDurationMs ≥ 100000`）：x64 **3**（task-restart 158,106.6ms；W-J5 180,003.4ms；Q2 P2 300,001.3ms）；arm64 0；Windows 0。x64 的 `cancelled 2` 即 W-J5 与 Q2 P2 的测试级超时（`test timed out after`）；task-restart 为测试内「等待超时」失败（计 fail）。
- **工件完整性**：三份工件均含顶层汇总与最终 `✖ failing tests:` section；无 `##[error]The operation was canceled.` 标记；xmark 行数 60 / 80 / 56。
- **耗时变化**：相对 R7，arm64 21m14s→23m56s（+12.7%）、x64 51m44s→47m58s（−7.3%）、Windows 41m23s→23m07s（−44.2%，Windows 本轮失败数大减且无 300s 超时）。

### 1.1 行级口径定义（逐字沿用 R2–R7）

`lineLevelUniqueIncludingHeaders = uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）+ sectionHeaderLines（所有 `✖ failing tests:` 行出现次数）`。明细见 `24-linelevel-reconciliation.json`：

| 平台 | fail | cancelled | 权威唯一名 | 保留缩进去耗时唯一 | section 头行 | 行级唯一 ✖ | 协调者 | 差 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arm64 | 30 | 0 | 30 | 30 | 1 | **31** | 31 | 0 |
| x64 | 38 | 2 | 40 | 40 | 1 | **41** | 41 | 0 |
| Windows | 28 | 0 | 28 | 28 | 1 | **29** | 29 | 0 |

### 1.2 三平台工件完整性（arm64 正常跑完）

| 平台 | 顶层 `ℹ tests/pass/fail/cancelled/skipped` | 最终 failing section | 取消标记 | 唯一名 | file-level | 超时 ≥100s |
| --- | --- | --- | --- | ---: | ---: | ---: |
| arm64 | 5,828 / 5,779 / 30 / 0 / 19 | 有 | 无 | 30 | 0 | 0 |
| x64 | 5,828 / 5,769 / 38 / 2 / 19 | 有 | 无 | 40 | 0 | 3 |
| Windows | 5,829 / 5,769 / 28 / 0 / 32 | 有 | 无 | 28 | 2 行（1 名） | 0 |

**arm64 运行结论**：R6 的 job 级 cancelled（0 步骤、无 runner、无工件）**未复现**；本轮 arm64 runner 正常分配、全步骤执行（含 upload-artifact），25m14s 完成。三平台结论首次在第七轮同时具备。

### 1.3 Windows file-level 原生崩溃（第 2 次出现）

- 工件行（内嵌与最终各一）：`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` → `✖ test\测试\g5-reasoning-verify\compatibility-loopback.test.ts (3196.326ms)`。
- 同轮该文件三个真实子用例（Claude/Codex/Pi）均 ✔；崩溃发生在全部断言之后的进程收尾期——**native-infra crash / 平台候选**（与 R6 同形，plat 批的子进程隔离未合入）。
- file-level 计入 `ℹ fail 28` 与唯一名（名称即文件路径）。

## 2. 新宇宙与集合对照

| 集合 | 数量 | 与 R8 交集 | 说明 |
| --- | ---: | ---: | --- |
| **R8 合并宇宙** | **42** | — | arm64 30 / x64 40 / Windows 28（平台矩阵见 §2.3） |
| R6 第五轮宇宙 | 63 | **40** | **消失 23、新增 2** |
| R7 第六轮宇宙 | 53 | **40** | **消失 13、新增 2**（R7 名称级由工件重新提取） |
| B0 冻结全量基线 | 191 | **30** | R7 38 → R8 30（8 名转绿） |
| B7 全量 | 190 | **30** | R7 38 → R8 30（同一批 8 名） |
| 冻结 known-red 62 | 62 | **27** | 门禁 5 + 编排 22；runtime-core 33 全部缺失 |
| 历史 triage 186 | 186 | **9** | 全部 NEW（W29×4/W30×2/W33/W34/W35）；KR/MAC 0 |

- 其他统计：`current_not_in_any_baseline_or_triage` = **5**（spawn fence、independent C Window、Q2 P2、compatibility-loopback、W-J5）；`windows_only` = **1**；`mac_only_not_windows_log` = **14**（11 x64-only + 2 arm64+x64 + 1 arm64-only）；未解析文件 0；无仓库命中但有日志映射 8。
- **B0/B7 缺口完整性**：B0 缺失 161、B7 缺失 160 名中，**0 名出现在三平台任何 skip（`﹣`）行**（skip 扫描 arm64 19 / x64 19 / Windows 32）。逐名见 `19-b0-b7-closure.tsv` 与 `26-b0-b7-closure-summary.json`。

### 2.1 R6 63 → R8 42：消失 23 / 新增 2

**消失 23（按来源批次）**：

| 来源 | 数量 | 名（缩写） |
| --- | ---: | --- |
| KR-33 修复 #129（runtime-core 33 中 CI 可见 6 名） | 6 | 主干来源、Core-managed binding、D3 linked workspace、dispatch_task 文案、dispatch_task promptGuidelines、doc-freeze reason 九类 |
| b3cfu #124（R7 前已生效） | 9 | AC-1/AC-6/AC-7/P1.2-AC-28、AC-16、AC-2 Pi、P1.2-AC-27、gate active-tool、gate H13、gate host-continuation、host-continuation、Q16 取代 |
| misc2 #130 | 4 | run-pin M1/M2/M3、Pipeline initial workflow、Q74、W36 |
| misc3 #131 | 2 | 路径 B（b31）、actual Core request_choice abort（ENOTEMPTY） |
| w19 #122 | 1 | W19 |
| misc #125 | 1 | Q normal-new early chain（旧名退役） |
| **合计** | **23** | — |

**新增 2（R6 宇宙外）**：

| # | 名（缩写） | 平台 | 族 | 定性 |
| ---: | --- | --- | --- | --- |
| 1 | `W29 … document-change-missing-confirmation …` | **x64-only** | e71501c-drift | 同组第 4 个变体；因 §4.1 的 x64 共享 `git-core-in-flight-unproven` 首次入宇宙（R7 无此名） |
| 2 | `independent C Window: initial source save and its notification continue one original delivery…` | **arm64-only** | unclassified-new | `p1p7-window-provenance-integration.test.ts`；`ENOTEMPTY` 临时目录清理（`ans-p1p7-window-report-*`）——flake 候选 |

### 2.2 R7 53 → R8 42：消失 13 / 新增 2（名称级）

**R7 消失 13**：6 名 KR-33 runtime-core + `路径 B` + `AC-4` + `W36` + `run-pin` + `Q74` + `Pipeline initial workflow` + `W48`。

**平台迁移（R7→R8，按平台红名集合）**：

| 平台 | R7 红名 | R8 红名 | 转绿 | 新红 | 净变化 |
| --- | ---: | ---: | ---: | ---: | ---: |
| arm64 | 46 | 30 | **17** | 1 | −16 |
| x64 | 49 | 40 | **10** | 1 | −9 |
| Windows | 47 | 28 | **19** | 0 | −19 |

逐名清单见 `16b-platform-transitions.tsv`。要点：

- arm64 转绿 17：6 KR-33 + b31 + **W29×3 + W30×2 + W33 + W34 + W35 + Q2 P2**（file-gate 修复）+ Q74；新红 1 = independent C Window。
- x64 转绿 10：6 KR-33 + b31 + W36 + Q74 + AC-4（R7 x64 300s 超时，R8 全平台绿；与 file-gate nlink 修复时序一致，**推断**非批次登记目标）；新红 1 = W29 missing-confirmation。
- Windows 转绿 19：6 KR-33 + W29×3 + W30×2 + W34 + W35 + W48 + run-pin + task-restart + Q74 + Q2 P2 + Pipeline。其中 W48（R7 Windows `The actual controller report must be persisted`）与 task-restart 转绿无对应批次登记，单轮样本按自愈/波动记录。

### 2.3 平台矩阵（42）

| 组合 | 数量 | 名 |
| --- | ---: | --- |
| arm64 + x64 + Windows | **27** | 门禁 5（D-10、listProject×2、convener-workflow-write、governance-matrix-service）+ 编排 22（AC-5×5、BUG-3×2、D-1×2、Git team plan publication、P6 集成、Retained intent confirmation、TM-5、applyStableSnapshot、openRoleSession handback、real ACK、v4.1 卡文、人事 Nominator、卡片文本×2、有任务 writeSet、A5 runRole） |
| arm64 + x64 | **2** | `重启恢复：未投递任务重新入队一次…`、`Git final spawn fence…` |
| **arm64-only** | **1** | `independent C Window: initial source save and its notification…`（新增） |
| **x64-only** | **11** | W29×4、W30×2、W33、W34、W35、Q2 P2、W-J5 |
| **Windows-only** | **1** | `test\测试\g5-reasoning-verify\compatibility-loopback.test.ts` |

逐名见 `27-platform-matrix.tsv` 与 `16-platform-diff.tsv`。

### 2.4 B0/B7 缺口闭合

- B0 191：R8 命中 **30**（27 KR + 3 非 KR：task-restart、W33、W34）；缺失 **161** = 150（R6 缺失）+ 11（R6→R8 新绿）。
- B7 190：R8 命中 **30**；缺失 **160**；0 名出现在任何 skip 行。
- 判定口径沿用 R4–R6：**本轮 CI 非红不等于永久转绿**；B7 重冻结时按 REMOVED / 未复现登记。

## 3. 分族重算（互斥分族，规则口径合计 42）

| 族 | R8 数量 | 平台分布（arm64/x64/win） | R6 第五轮（文档） | 代表文件（计数） |
| --- | ---: | --- | ---: | --- |
| 冻结 known-red 62 | **27** | 27/27/27 | 33 | trunk-upgrade-validation 5、trio-worker-report 3、section1-write-preauthorization 2、appointment-roster 2 |
| e71501c 语义漂移 | **9** | 0/9/0 | 10 | chief-workflow 9（W29×4/W30×2/W33/W34/W35） |
| 挂起/超时族 | **3** | 1/3/0 | 1 | task-restart、git-role-workflows-e2e（Q2 P2）、judge-delegated（W-J5） |
| 未归类 | **3** | 2/0/1 | 13 | git-command（spawn fence）、p1p7-window-provenance（independent C Window）、compatibility-loopback |
| B0 既有红（其他） | **0** | 0/0/0 | 3 | — |
| CI 路径规范形/守卫 | **0** | 0/0/0 | 2 | — |
| flake 时序族 | **0**（规则口径） | — | 1 | independent C Window 语义属 flake（未触发规则） |
| source 门测试装配 | **0** | 0/0/0 | 0 | — |
| VCA 流程/通道 | **0** | 0/0/0 | 0 | — |
| macOS git-config 平台族 | **0**（R2–R8 连续 0） | 0/0/0 | 0 | 三平台四类 git-config 错误码均 0 |
| **合计** | **42** | 30/40/28 | — | — |

补充（规则语义滞后，阅读时按语义修正；逐名见 `25-family-semantic-corrections.tsv`）：

1. **W29/W30/W33/W34/W35 的失败码已从 `file-gate-host-facts-unproven` 变为 `git-core-in-flight-unproven`**（除 W29 document-change 为 publisher notification 断言）；`attribute-blocks` 的 CODES 未含该新码，块级仅显示 `ERR_ASSERTION`——族判定仍按文件/名规则，未改规则。
2. **Q2 P2 与 task-restart 被 hang-timeout 规则吸收**（`maxDurationMs ≥ 100000`），语义分别为 x64 真实链 300s 超时与测试内等待超时，不是历史上的文件级挂起族。
3. **independent C Window** 规则落入 unclassified-new，语义应为 flake-timing（ENOTEMPTY，与 R6 multi-runtime abort 同族）。
4. **compatibility-loopback** 仍为 file-level 原生崩溃（native-infra），与 R6 判定相同。
5. **B0-other 与 ci-path 归零**：R6 的 Q normal-new early chain（B0-other）、multi-runtime ENOTEMPTY（ci-path 语义 flake）均转绿/退役。

## 4. 重点确认逐项

### 4.1 file-gate nlink 修复（#128）效果：arm64/Windows 全面转绿，x64 未转绿且失败面前移

**错误码层面**：`file-gate-host-facts-unproven` 在三平台日志出现 **0** 次（R7 macOS 日志 14 次/平台）；`git-file-final-guard-unproven` 亦 **0**（R7 macOS 4 次/平台）。

**逐名结果（R8 实际）**：

| 目标名（R6/R7） | arm64 | x64 | Windows | R8 x64 实际错误（摘要） |
| --- | --- | --- | --- | --- |
| W29 document-change | **绿**（R7 红） | **红** 11.4s | **绿**（R7 红） | `Actual publisher notification must reach its actor[...]`（流量已到 git_candidate prepared，通知未达） |
| W29 document-change-wrong-flow | **绿** | **红** 0.51s | **绿** | `git-core-in-flight-unproven`：`An actual Core session is still preparing/creating/disposing`（chief-workflow.test.ts:1726） |
| W29 document-change-source-loss | **绿** | **红** 0.58s | **绿** | 同上 |
| W29 document-change-missing-confirmation | **绿**（R7 未红） | **红** 0.45s（**新变体**） | **绿** | 同上 |
| W30 连续写入后 | **绿** | **红** 0.60s | **绿** | 同上 |
| W30 真实重启迁移后 | **绿** | **红** 0.40s | **绿** | 同上 |
| Q2 P2 first new project | **绿**（R7 2.5s 红） | **红** 300.0s 超时 | **绿**（R7 300s 超时） | `test timed out after 300000ms`（无断言体） |
| W34（观察项） | **绿**（R7 红） | **红** 0.47s | **绿**（R7 红） | `git-core-in-flight-unproven`（未自愈） |
| W35（观察项） | **绿**（R7 红） | **红** 0.44s | **绿**（R7 红） | 同上（未自愈） |

**结论**：

1. **nlink 修复本身按预期消除了 file-gate 码**：`file-gate-host-facts-unproven` 三平台 0 次；arm64 与 Windows 上目标名全部转绿（含 W34/W35 与 Q2 P2）。
2. **macOS x64 未转绿**，且失败面从 file-gate 前移为两个 x64-only 形态：
   - **共享阻塞**：8 名在 `chief-workflow.test.ts:1726` 快失败（0.4–0.6s），错误为 `git_candidate … status=blocked code=git-core-in-flight-unproven message="An actual Core session is still preparing/creating/disposing"`；随后的工作结果摘要显示「本轮执行超时」级联。该 8 名 = W29 wrong-flow、W29 source-loss、W29 missing-confirmation、W30×2、W33、W34、W35。**9 名 macOS-x64 后续红名中的 8 名同根**，疑似测试夹具残留 Core 会话/清理时序（x64 慢 runner 放大），非 file-gate 产品修复未生效。
   - **W29 document-change**：11.4s 处 `Actual publisher notification must reach its actor`——与 R7 Windows 的失败体同类（R7 Windows 日志该断言共 10 行）；R8 Windows/arm64 已绿，仅 x64 仍红，属通知时延/等待窗口候选。
   - **Q2 P2**：由 R7 的 5.6s 断言失败变为 **300s 超时**（R7 Windows 已出现过 300s 超时，R8 Windows 绿、x64 超时）——可能为慢 runner 上真实链成本/等待窗口问题，需 owner 定性。
3. **W34/W35 未自愈**：x64 仍红（同共享阻塞）；arm64/Windows 已绿，故「macOS 平台链」的剩余面收窄为 x64-only。

### 4.2 KR-33 归零确认

- 冻结 runtime-core 33（`knownred/runtime-core-33.txt`）：**R8 三平台均未出现（0/33）**；R7 中出现 6 名（CI 真红）。逐名状态见 `28-kr33-zero.json`。
- R6 文档口径的「known-red 33（62 中命中 33）」与 KR-33 是不同集合（见 KR-33 分类记录）；本轮 62 命中 **27** = 门禁 5 + 编排 22；未命中 35 = runtime-core 33 + 编排已绿 2（`node test外指符号链接…`、`wiring guards…`）。
- 附注：`wiring guards…` 已由 B3c 修复并在 R7/R8 均绿，B7 重冻结时应按 REMOVED 登记；`node test外指符号链接…` 在 CI 本已绿（本机 symlink 权限项）。

### 4.3 剩余构成（42）逐名与 R6 对照

**按类别**：

| 类别 | 数量 | 名 / 说明 | R6 63 中是否存在 |
| --- | ---: | --- | --- |
| KR-29 冻结 known-red | **27** | 门禁 5：<br>`D-10：质检卡保留可选质量核对与截图上限，不要求录屏`<br>`listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`<br>`listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`<br>`卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`<br>`渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`<br>编排 22：AC-5×5、BUG-3×2、D-1×2、Git team plan publication、P6 集成、Retained intent confirmation、TM-5、applyStableSnapshot、openRoleSession handback、real ACK、v4.1 卡文、人事 Nominator、卡片文本×2、有任务 writeSet、A5 runRole（逐字名单见 `28-kr33-zero.json` 与 canonical `knownred` 文件） | 是（R6 命中 27；29 目标中 2 名已绿） |
| macOS-x64 file-gate 后续阻塞 | **9** | W29×4（document-change / missing-confirmation / source-loss / wrong-flow）、W30×2（连续写入后 / 真实重启迁移后）、W33、W34、W35 | W29×3/W30×2/W33/W34/W35 是（9 名对应 R6 的 8 名 + 1 新变体）；W29 missing-confirmation 为新增 |
| macOS-x64 300s 超时 | **1** | Q2 P2 first new project | 是 |
| x64 180s | **1** | W-J5/J15 | 是 |
| macOS FSEvents 平台候选 | **1** | Git final spawn fence（arm64+x64） | 是 |
| misc 未竟 | **1** | 重启恢复：未投递任务重新入队一次…（arm64+x64） | 是 |
| R8 新增 flake 候选 | **1** | independent C Window…（arm64-only） | 否 |
| Windows 原生崩溃 | **1** | compatibility-loopback.test.ts（file-level） | 是 |
| **合计** | **42** | — | — |

- 与 R6 63 名对照的完整逐名映射见 `16-platform-diff.tsv`（含 R6 平台分布、R7 平台分布、R8 平台分布与超时）。
- **R6 宇宙中已不在 R8 的 23 名**见 §2.1；**R8 中 R6 没有的 2 名**见 §2.1 新增表。

### 4.4 平台候选与 R6 新 3 项现状

| 项 | R6 状态 | R7 状态 | R8 状态 | 平台 | 备注 |
| --- | --- | --- | --- | --- | --- |
| R6 新 1：b31 路径 B | x64-only | arm64+x64 红 | **绿（三平台未出现）** | — | misc3 屏障修复生效 |
| R6 新 2：multi-runtime ENOTEMPTY | Windows-only | 未出现 | **绿（三平台未出现）** | — | R7 未复现，R8 未复现；misc3 有界清理已合入 |
| R6 新 3：compatibility-loopback | Windows file-level | Windows file-level | **Windows file-level 再现** | win | plat 子进程隔离未合入；断言已在子用例后，原生收尾崩溃 |
| W36 | x64-only | x64 红 | **绿** | — | misc2 夹具形状修复生效 |
| W-J5 | x64 180s | x64 180s | **x64 180s**（180,003.4ms） | x64 | R3/R5/R6/R7/R8 五度 x64-only；plat 仅预算观测 |
| spawn fence | x64-only | arm64+x64 | **arm64+x64** | arm64+x64 | R7 已双 macOS 红；plat 两路分类待合入 |
| W48 | 未入宇宙 | Windows-only 红 | **绿** | — | R7 `controller report must be persisted`；无批次登记，按自愈/波动 |
| AC-4 | 未入宇宙 | x64 300s 超时 | **绿** | — | 与 file-gate nlink 修复时序一致（推断） |
| independent C Window | 未入宇宙 | 未出现 | **arm64-only ENOTEMPTY** | arm64 | R8 新增；flake 候选 |

## 5. 批次投影

### 5.1 R6 投影（50）与实际（42）对账

> R6 投影 = 63 − 13（w19 2 + b4fu 0 + b3cfu 9 + misc 2）= 50。

| 项 | 数量 | 说明 |
| --- | ---: | --- |
| R6 投影剩余 | **50** | — |
| 其中 R8 仍红 | **38** | known-red 27 + W29×3/W30×2/W34/W35/W-J5/Q2 P2/spawn fence/compatibility-loopback |
| 其中 R8 已绿 | **12** | 6 KR-33 + b31 + multi-runtime ENOTEMPTY + run-pin + Q74 + Pipeline + W36 |
| R8 实际宇宙 | **42** | 对投影净差 **−8** |
| 其中：投影外仍红 | **+2** | task-restart、W33（R6 投影已按批次扣除，但实际仍红） |
| 其中：宇宙外新增 | **+2** | independent C Window、W29 missing-confirmation |
| 恒等 | — | 50 − 12 + 2 + 2 = **42** |

**四批存活（R6 投影）**：W19/W33 **1/2**（W19 绿、W33 x64 红）；B4-fu **0/0**（W1b 早已绿）；B3c-fu **9/9**；misc **1/2**（Q normal-new 绿、task-restart 红）。逐项见 `20-r6-projection-vs-r8.json` 与 `21-r6-projection-deviations.tsv`。

### 5.2 本轮窗口已合入批次审计（R7→R8）

| 批次 | 目标 | R8 结果 | 判定 |
| --- | --- | --- | --- |
| **KR-33 #129** | runtime-core 冻结 33 | **0/33 出现**（R7 6 名 CI 真红全绿） | **完全生效** |
| **macOS file-gate nlink #128** | W29×3/W30×2/Q2 P2；观察 W34/W35 | arm64/Windows 全绿；x64 全红（失败面前移） | **部分生效**：file-gate 码 0；x64 由新共享阻塞主导 |
| **misc2 #130** | run-pin、Pipeline、Q74、W36；spawn fence 仅记录 | 4/4 目标绿；spawn fence 仍红 | **目标全部生效** |
| **misc3 #131** | b31、multi-runtime ENOTEMPTY；compat/W-J5 仅记录 | b31、ENOTEMPTY 绿；compat/W-J5 仍红 | **目标全部生效** |
| **w19 #122**（R7 前合入，R8 复核） | W19/W33 | W19 绿；W33 仅 x64 红 | 部分生效 |
| **b4fu #123** | W1b | 未入宇宙 | 无观测面（早已绿） |
| **b3cfu #124** | 9 名 Windows 残差 | 未入宇宙（R7 起） | **完全生效** |
| **misc #125** | task-restart、Q normal-new early chain | Q normal-new 退役；task-restart arm64/x64 红 | **1/2**：task-restart 与批内 3× 绿矛盾，需重开 |

### 5.3 未合入三批扣除与预计剩余

> 口径：以 R8 实际宇宙 **42** 为基线，按各批记录的目标名扣除；三批均**未合入本轮 CI**，批内验证为定向 3×（见各批记录），投影不替代 CI。

| 批次 | 状态 | 扣除 | 匹配 R8 | 说明 |
| --- | --- | ---: | ---: | --- |
| **kr29a 门禁 5**（`fix/test-debt-kr29-gates`） | 完成、未合并 | **5** | 5 | 5 个 `test/门禁引擎/` 文件断言更新；门禁全量 3× 577/576/0/1；typecheck 0 |
| **kr29b 编排 23**（`fix/test-debt-kr29-orchestration`） | 完成、未合并 | **22** | 22（23 目标中 symlink 名 CI 本已绿） | 14 个 `test/编排/` 文件 + `run-role.ts` 空根守卫；137 文件 1375/1373/0/2 + git-trunk-store 13/13；typecheck 0 |
| **plat 平台硬化**（`fix/test-debt-platform`） | 完成、未合并 | **3** | 3 | spawn fence 两路分类（macOS）、compatibility-loopback 子进程隔离+有界重试（Windows）、W-J5 预算观测（x64） |
| **KR-29 分类（docs）** | 完成、未合并 | 0 | 0 | 不改宇宙 |
| **合计** | — | **30** | 30 | — |

**预计剩余 12 名**（42 − 30；arm64 2 / x64 11 / Windows 0）：

| 类别 | 剩余 | 名 |
| --- | ---: | --- |
| macOS-x64 file-gate 后续阻塞（共享 `git-core-in-flight-unproven`） | **8** | W29 document-change / missing-confirmation / source-loss / wrong-flow；W30 连续写入后 / 真实重启迁移后；W33；W34；W35（9 名中 8 名同根；W29 document-change 为通知断言） |
| macOS-x64 300s 超时 | **1** | Q2 P2 |
| misc 未竟 | **1** | 重启恢复：未投递任务重新入队一次…（arm64+x64） |
| R8 新增 flake | **1** | independent C Window（arm64-only） |
| **合计** | **12** | 平台：arm64 2（task-restart、independent C Window；W-J5/spawn fence 已扣除）/ x64 11（全部 12 名中除 independent C Window 外均在 x64）/ Windows 0（compat 由 plat 扣除） |

**风险与假设**：

1. **kr29a/kr29b 假定测试名逐字保留**（两批记录均以冻结名逐字保留为前提）；若合并时改名，投影失效。两批均为本机 3× 绿，但 CI 三平台未验证。
2. **kr29b 的 23 目标中 1 名（symlink）CI 本已绿**；R8 现存 22 名。合入后预计编排红 22→0。
3. **plat 不改变 W-J5 语义/上限**（仅预算观测），合入后 W-J5 仍可能 x64 180s；spawn fence/compat 的修复依赖 plat 判定逻辑在 CI 复现。
4. **x64 共享阻塞不在任何在跑批次内**：即使三批全部合入，预计剩余 12 名中的 9 名（8+Q2 P2）仍需一个 x64 专项；task-restart 需 misc 重开；independent C Window 需 flake 处置。
5. **投影不替代三平台 CI**；合入后应以 R9 全量复跑为准。

## 6. B7 收口建议与 owner 裁决项

### 6.1 建议编排

1. **合并三批（kr29a + kr29b + plat）→ 触发三平台全量复跑（R9）**。验收口径：合并宇宙 ≤12；Windows 预期 0；arm64 ≤2；x64 ≤11；三平台工件齐全。
2. **x64 共享阻塞专项（优先于三批之外单独立项）**：8 名 `git-core-in-flight-unproven` 同根（`chief-workflow.test.ts:1726`）+ Q2 P2 300s。建议先以 `--test-name-pattern` 在 x64 等价环境定向复现，区分「测试夹具残留 Core 会话/清理未等待」与「产品 guard 时序」；若为夹具清理，补有界等待/显式 drain（不改断言）；若为产品，按 x64 慢 runner 语义出最小修复。
3. **三套 known-red 验证**：runtime-core-33 **33→0**（本轮已达成，B7 重冻结登记 REMOVED/已修）；gates-5 **5→0**（kr29a）；orchestration-24 **22 红→0、wiring guards 已绿登记 REMOVED**（kr29b）。任何名单外新红需单独说明。
4. **B0/B7 基线重建**：以 R9 三平台工件重建 B0（191 → 新基线）与 B7（190 → 新基线）；R6→R8 未复现的 161/160 名按 **REMOVED（主动退役/重命名）** 与 **未复现（green，待观察）** 分列；b31、ENOTEMPTY、AC-4、W48 与 R8 新名（independent C Window、W29 missing-confirmation）按新基线登记。
5. **残差归零报告**：对预计剩余 12 名逐名给出 owner 类别（x64 平台时序 / x64 性能 / flake / 产品）与处置结论；目标是把 unclassified 压缩到 0 或明确标注为平台已知差异。
6. **B7 冻结文档**：同步更新 `角色卡/桌面窗口/…/segment3/full/failnames.txt`、`b0-frozen-failnames-191.txt`（或新版本号）与 `knownred/*.txt`；在测试角色文档记录 REMOVED/新增名单与理由。

### 6.2 owner 裁决项

| # | 项 | R8 证据 | 需裁决 | 建议 |
| ---: | --- | --- | --- | --- |
| 1 | **x64 共享 `git-core-in-flight-unproven`（8 名）** | `chief-workflow.test.ts:1726`；`An actual Core session is still preparing/creating/disposing`；400–600ms 快失败；arm64/Windows 绿 | 测试夹具残留 Core 会话/清理等待 vs 产品 guard 在慢 runner 的时序 | 优先夹具专项：显式等待上一会话 drain/dispose 或隔离 fixture 根；不改产品 fail-closed |
| 2 | **W29 document-change（x64）publisher notification** | 11.4s；`Actual publisher notification must reach its actor[...]`；R7 Windows 同形、R8 Windows/arm64 绿 | 通知投递等待窗口 vs 产品通知丢失 | 先在 x64 定向复现，确认是否同一通知链的时延；必要时加有界等待（不改断言强度） |
| 3 | **Q2 P2（x64）300s 超时** | `test timed out after 300000ms`；无断言体；R7 Windows 亦曾 300s、R8 Windows 绿 | 真实链成本/等待预算 vs 产品挂起 | 用 plat 式分段预算观测定位；若为真实链成本，owner 决定是否提高该 E2E 预算或拆分（不静默放宽） |
| 4 | **W33/W34/W35（x64）** | 同共享阻塞；arm64/Windows 已绿 | 是否随 #1 一并自愈 | #1 修复后 x64 定向复核；仍红再单列 |
| 5 | **task-restart（arm64+x64）** | arm64 55.6s / x64 158.1s，「恢复投递未发生：等待超时 record={reports:[]}」；Windows 绿；misc 批内 3× 绿 | misc 重开 vs 平台候选 | 重开 misc：按 v2.0.0 run-bound 语义在 macOS 等价环境复现；确认等待窗口/清理链 |
| 6 | **independent C Window（arm64-only ENOTEMPTY）** | `ans-p1p7-window-report-*` 临时目录清理；duration 51.6ms | flake 登记 vs 有界清理修复 | 按 R6 multi-runtime ENOTEMPTY 先例：`rmSync` 有界重试；单轮样本先观察一轮 |
| 7 | **spawn fence / compatibility-loopback / W-J5** | 均仍红；plat 未合入 | 合入 plat 后是否转绿/是否接受语义 | 合入 plat；spawn fence 两路分类、compat 有界重试、W-J5 预算观测；R9 复核；W-J5 若再 180s，开 x64 性能专项 |
| 8 | **KR-29 投影假设** | kr29a 5 / kr29b 22 现存；批内 3× 绿 | 合并顺序与是否同 PR | 三批同轮 CI 或分轮；建议同轮（减少 CI 轮次），保留逐批记录 |
| 9 | **B7 重冻结口径** | runtime-core-33 33→0；gates/orchestration 待 kr29a/b | REMOVED 与「已修复」如何在冻结名单登记 | runtime-core-33 全部按 REMOVED/已修登记；orchestration wiring REMOVED；新基线以 R9 三平台为准 |
| 10 | **R7 名称级数据缺口** | R7 分析文档/证据未在本工作树；由工件重新提取 | 是否补写 R7 记录（追溯） | 建议补写 R7 更新文档或在 R9 文档中并入；本记录已给名称级对照 |

## 7. 证据边界与披露

1. **工件为准**：三平台分析全部基于上传工件；run 元数据（SHA/结论/步骤/起止/runner/artifact 大小）经 `gh api` 只读核对并记录于 `00-run-metadata.json`。
2. **R7 名称级数据来源**：R7（第六轮）分析文档/证据目录不在本工作树。本记录将本机 `/tmp/r10-art` 的 R7 工件（run **43859105048**，`main @ d1f256f`，三平台 fail 46/47/46，与协调者口径一致）用同一提取脚本重新提取到 `_r8-evidence/r7-artifacts/`，仅作 R7→R8 名称级对照；R7 的族/块码未重新计算，相关表述只引用名称与时长事实。
3. **工件目录校正**：初始 `/tmp/r10-art` 中已有上一轮工件（汇总 46/47/46）；本轮按要求重新 `gh run download 43867573699 -D /tmp/r8-art`，以 01 汇总核对为 30/38/28 后使用；两套工件未混用。
4. **单轮样本**：W48、AC-4、independent C Window、W29 missing-confirmation 均为单轮观测；「转绿/新红」不判永久，B7 重冻结前需 R9 复核。compatibility-loopback 为 R6/R8 两次、W-J5 为 R3/R5/R6/R7/R8 五次，属稳定平台候选。
5. **x64 共享阻塞的归因边界**：`git-core-in-flight-unproven` 在 x64 的 8 名同根判断基于同一错误码、同一行号（1726）与相近快失败时长；是否确为单一根因需定向复现（§6.2 #1）。
6. **分族规则语义滞后 5 处**（§3 补充 1–5），规则本体逐字沿用未改；族计数以规则口径为准，语义修正单列。
7. **B0/B7 缺口的边界**：缺失 161/160 名中 0 名出现在三平台 skip 行；仍可能有 CI 与本机基线、动态命名/重命名的差异。仅判「本轮 CI 非红」，永久转绿由 B7 重冻结裁定。
8. **批次投影的假设性**：kr29a/kr29b/plat 均有记录级证据与本机 3×/定向验证，但均未合入 R8 CI；投影不替代 R9 CI。
9. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境）。
10. **只读引用其他工作树**：`kr29a`、`kr29b`、`plat`、`macgate`、`kr29ana`、`kr33ana` 及各批记录为只读引用；本工作树仅新增 R8 文档与证据。

## 8. 未决问题（更新）

1. **x64 共享 `git-core-in-flight-unproven`**：8 名同根（外加 Q2 P2 300s 与 W29 通知断言）——夹具清理时序还是产品 guard？
2. **Q2 P2 x64 300s**：真实链成本、等待窗口还是产品挂起？R7 Windows 曾 300s、R8 绿，平台/负载因素强。
3. **task-restart**：misc 批内 3× 绿与 CI arm64/x64 红矛盾；macOS 等价环境如何复现 55–158s 等待超时？
4. **independent C Window**：arm64-only ENOTEMPTY 是否与 R6 multi-runtime ENOTEMPTY 同族（清理竞态）？
5. **KR-29 三批合并编排**：同 PR/分 PR？合并后 R9 验收阈值（≤12）。
6. **B7 口径**：runtime-core-33 33→0 的 REMOVED/已修登记；新基线 42→12 后的冻结名单版本与路径。
7. **W34/W35 是否随 #1 自愈**：arm64/Windows 已绿，x64 需复核。
8. **R7 记录追溯**：是否补写 R7（第六轮）更新文档，以保留独立证据链。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r8-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs` | R6→R8 适配的沿用脚本（仅元数据/三平台；分族规则逐字未改） |
| `compare-r6-r7-r8.mjs` / `project-batches-r8.mjs` / `summarize-r8.mjs` / `supplement-r8.mjs` | R8 对照、投影与补充证据脚本 |
| `00-run-metadata.json` | run/jobs/artifacts/工件路径与 R7 基线元数据 |
| `01-ci-failures.json` | 三平台完整提取（汇总、唯一名、超时、failing section、行级计数、工件完整性） |
| `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt` / `04-failnames-windows-x64.txt` | 逐平台唯一失败名 + 文件（30 / 40 / 28） |
| `05-platform-counts.json` / `14-timeouts-and-stall.json` | 三平台计数速览、超时条目（x64 3 条）与耗时 |
| `06-merged-universe.json` | 42 名并集：平台出现、日志/仓库文件映射、集合命中、首错 |
| `07-by-file.tsv` / `08-set-summary.json` | 按测试文件分组；集合交集与平台独有统计 |
| `10-block-codes.json` | 逐名块级错误码（arm64 30 / x64 40 / Windows 28 块） |
| `11-families.json` / `12-family-summary.tsv` | 互斥分族全量（规则口径；块码来源 arm64） |
| `15-r6-comparison.json` | R6 63 vs R8 42：交集 40 / 消失 23 / 新增 2、逐族增减 |
| `15b-r7-comparison.json` | R7 53 vs R8 42：交集 40 / 消失 13 / 新增 2（R7 工件重新提取） |
| `16-platform-diff.tsv` | 42 名逐名：R6/R7/R8 平台分布、族、超时、错误首行 |
| `16b-platform-transitions.tsv` | R7→R8 各平台转绿/新红逐名 |
| `17-windows-coverage.tsv` | Windows 28 名全量（arm64/x64 重叠、R7 命中、族、首错） |
| `18-artifact-crosscheck.json` | 协调者计数 vs 提取计数（30/31、38/41、28/29 精确吻合） |
| `19-b0-b7-closure.tsv` | B0 161 / B7 160 缺口逐名现状（R6/R7 是否出现） |
| `20-r6-projection-vs-r8.json` / `21-r6-projection-deviations.tsv` | R6 投影 50 vs R8：38 仍红 / 12 转绿 / 4 投影外 |
| `22-batch-projection-r8.json` / `23-projected-remaining.tsv` | 已合入批次审计、未合入三批扣除 30、预计剩余 12 |
| `24-linelevel-reconciliation.json` | 行级口径对账（31/41/29） |
| `25-family-semantic-corrections.tsv` | 11 处规则语义修正（file-gate 后续阻塞、Q2 P2、task-restart、新 flake、原生崩溃等） |
| `26-b0-b7-closure-summary.json` | B0/B7 命中/缺口/新绿 8 名汇总；skip 扫描 0 命中 |
| `27-platform-matrix.tsv` | 42 名平台组合矩阵（27/2/1/11/1） |
| `28-kr33-zero.json` | runtime-core-33 逐名 0/33 归零确认 + KR-29（gates 5 / orchestration 24）逐名状态 |
| `29-focused-confirmations.tsv` | W29/W30/Q2 P2/W34/W35/KR-33/W36/W-J5/spawn fence/compat/task-restart/b31/ENOTEMPTY/新名的 R7/R8 逐项对照 |
| `30-remaining-composition.tsv` | 42 名逐名构成分类（KR-29 / x64 后续阻塞 / flake / 平台候选） |
| `r7-artifacts/` | R7 第六轮工件重新提取（04 名称表、01 提取 JSON）——仅对照用 |

## 附录 B：复现命令

```bash
# 数据源：run 43867573699 三平台工件（原始工件只放 /tmp，不入库）
# /tmp/r8-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log
# R7 对照：/tmp/r10-art（run 43859105048）重新提取到 r7-artifacts/

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r8-evidence
R6=角色卡/测试/docs/change/2026-11-16_remediation-plan_r6-evidence
B7=角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3

node $EV/extract-ci-failures.mjs \
  --arm64-artifact /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log \
  --x64-artifact /tmp/r8-art/test-logs-mac-x64/test-ci-output.log \
  --win-artifact /tmp/r8-art/test-logs-win-x64/test-ci-output.log \
  --outdir $EV
node $EV/attribute-blocks.mjs \
  --arm64 /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log \
  --x64 /tmp/r8-art/test-logs-mac-x64/test-ci-output.log \
  --win /tmp/r8-art/test-logs-win-x64/test-ci-output.log \
  --out $EV/10-block-codes.json
node $EV/summarize-r8.mjs --ci $EV/01-ci-failures.json --outdir $EV
node $EV/classify-failures.mjs --ci $EV/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt \
  --kr-dir $B7/knownred --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md \
  --tests-root test --outdir $EV
node $EV/assign-families.mjs --universe $EV/06-merged-universe.json \
  --blocks $EV/10-block-codes.json --outdir $EV
node $EV/compare-r6-r7-r8.mjs --r8-universe $EV/06-merged-universe.json \
  --r8-families $EV/11-families.json --r6-universe $R6/06-merged-universe.json \
  --r6-families $R6/11-families.json --r7-ci $EV/r7-artifacts/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt --outdir $EV
node $EV/project-batches-r8.mjs --r8-universe $EV/06-merged-universe.json \
  --r8-families $EV/11-families.json --r6-projection $R6/22-batch-projection-r6.json \
  --r6-universe $R6/06-merged-universe.json --kr-dir $B7/knownred --outdir $EV
node $EV/supplement-r8.mjs --ci $EV/01-ci-failures.json --universe $EV/06-merged-universe.json \
  --families $EV/11-families.json --b0 $B7/full/b0-frozen-failnames-191.txt \
  --b7 $B7/full/failnames.txt --kr-dir $B7/knownred --r7-ci $EV/r7-artifacts/01-ci-failures.json \
  --arm64-log /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log \
  --x64-log /tmp/r8-art/test-logs-mac-x64/test-ci-output.log \
  --win-log /tmp/r8-art/test-logs-win-x64/test-ci-output.log --outdir $EV
```

## 附录 C：关键结论速览

- **三平台计数**：arm64 fail **30** / 唯一 **30** / 行级 ✖ **31**；x64 fail **38**（+cancelled 2）/ 唯一 **40** / 行级 ✖ **41**；Windows fail **28**（含 1 file-level）/ 唯一 **28** / 行级 ✖ **29**。arm64 正常跑完（25m14s）。
- **宇宙**：R8 **42**；vs R6 63：交集 40 / 消失 23 / 新增 2；vs R7 53：交集 40 / 消失 13 / 新增 2。
- **KR-33**：**0/33 出现**（R7 6 名真红全部转绿）。
- **file-gate**：`file-gate-host-facts-unproven` 三平台 0；arm64+Windows 的 W29×3/W30×2/Q2 P2 与 W34/W35 全绿；**x64 全红**，新共享 `git-core-in-flight-unproven`（8 名同根）+ Q2 P2 300s；W34/W35 在 x64 未自愈。
- **剩余 42 构成**：KR-29 **27** + macOS-x64 后续阻塞 **9** + Q2 P2 / W-J5 / spawn fence / task-restart / independent C Window / compatibility-loopback 各 1。
- **批次**：KR-33、b3cfu、misc2、misc3 目标全部生效；w19 1/2；misc 1/2（task-restart 仍红）；file-gate 部分（arm64/win 生效、x64 未）。
- **三批投影**：42 − 30 = **12**（arm64 2 / x64 11 / Windows 0）。
- **B7 建议**：三批合入后 R9 三平台全量；三套 known-red 逐名 diff；B0/B7 基线重建；残差归零；x64 共享阻塞单独立项（8 名一次修复潜力）。
