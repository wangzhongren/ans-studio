# R4：第三轮三平台测试 CI（B1b 后）结果重归因与批次投影更新

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r4`（分支 `analysis/test-debt-r4`，起点 `8d6a35e` = `origin/main`，含 B1b #110 与 R3 分析 #109）
- 范围：**只分析、只写本文件与同名 `_r4-evidence/` 证据**。未修改任何代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 workflow；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：GitHub Actions run **43812832566**（`test-ci`，`workflow_dispatch` on `main @ 8d6a35e22a2fba1470a84e0fe9ed15031a100b6d`，2026-11-16T05:50:30Z 创建，conclusion failure）。三平台工件（**权威数据源**，GitHub 日志流偶发 CANCEL，本轮不依赖 gh 日志流）：
  - `test-logs-mac-arm64/test-ci-output.log`（job `133118286464`，05:51:06–06:11:30Z）
  - `test-logs-mac-x64/test-ci-output.log`（job `133118286388`，05:51:06–06:27:15Z）
  - `test-logs-win-x64/test-ci-output.log`（job `133118286209`，05:51:05–06:16:10Z）
- CI 命令（`.github/workflows/test-ci.yml`，与 R2/R3 相同）：`node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`；Node 24.14.0；三平台 typecheck 均 success。
- 方法：沿用 R2/R3 脚本集（`extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs`），仅把数据源改为三平台工件、平台键 `windows_x64_cancelled` → `windows_x64`（Windows 首次完整跑完），并新增集合对照/批次投影脚本。分族规则**逐字沿用 R2**（known-red 优先 → 挂起 → e71501c 漂移 → macOS git-config → CI 路径/守卫 → source 门 → VCA → flake → B0 其他 → 未归类）。
- 原始工件：`/tmp/r7-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（本机 Git Bash 的 `/tmp` 映射为 `C:\Users\51054\AppData\Local\Temp`）。**原始工件不入库**。

## 0. 摘要

1. **Windows 首次完整覆盖**：job 24m06s 自然跑完（R3 为 120 分钟取消），tests 5,825 / pass 5,614 / fail 178 / cancelled 1 / skipped 32，**唯一失败名 179**（行级 186）。B1b 的 chief-workflow 清理修复验证有效，**Windows 预算问题解除**；三平台 300s（≥100s）条目 **0**。
2. **新宇宙 188 名**（arm64 188 / x64 188 / Windows 179），是 R3 194 名的**真子集：交集 188、新增 0、消失 6**。6 个消失名均为 R3 已标注的 flake/平台候选（AC-4 300s、W-J5 180s、W36、W29-missing、W48、application-line 顺序名），**单轮样本不判稳定转绿**。
3. **arm64 与 x64 完全一致**：唯一名集合逐名相同（188/188），汇总计数完全相同（pass 5,618 / fail 187 / cancelled 1 / skipped 19）；仅耗时不同（arm64 19m12s vs x64 34m27s，x64 1.79×）。
4. **macOS git-config 族继续为 0**：三平台工件中 `git-config-executable-or-unsupported` / `git-initialization-effects-pending` / `git-config-section-unsupported` / `git-config-value-invalid` 命中 **0**；块级错误码归因 0。
5. **分族**：known-red 33 / ci-path 41 / drift 30 / source-gate 23 / B0 其他 18 / flake 16 / VCA 13 / 未归类 12 / hang 2 / **git-config 0**。与 R3 相比：ci-path −1（W48 未复现）、drift −2（W36、application-line 未复现）、未归类 −1（W29-missing 未复现）、hang −2（AC-4/W-J5 未复现）；其余族逐名不变。
6. **Windows 首覆盖闭合 B0 缺口**：B0 191 中的 61 名（R3 因 Windows 取消而「不能判转绿」）在本轮完整 Windows 中**全部未复现**，且逐名核实仍为活测试（48 字面名 + 11 模板名 + 2 文件级条目；0 skip）。可判「本轮 CI 非红」，不作为永久转绿；B7 重冻结时裁定。
7. **批次投影**：扣除 B3a 已转绿 8 + B3b 13 + B3c 40 + B4 30 后，**预计剩余宇宙 99 名**：known-red 33 / B0 其他 18 / flake 16 / source-gate 残差 15 / 未归类 12 / drift 残差 2（W19/W33）/ ci-path 残差 1（Q2 P2）/ hang 2。**风险**：B4 的 30 名中有 6 名（W29×3、W30×2、W35）在 R4 macOS 仍红且 B4 未改期望，若合入后 macOS 复发，投影回升至 105。
8. **B5/B6 建议**：B5 = flake 16 + 有界 hang 2（12 文件 / 18 名）；B6a = 未归类 12（5 文件，git journal/sidecar 契约优先定性）；B6b = B0 其他 18（12 文件，逐文件 3×）。B3a 残差 15 需 owner 先授权「按 v2.0.0/e71501c 当前语义更新期望」；产品候选 Q2 P2、W19/W33 单列待裁决。
9. **产品候选与 owner 裁决**：W19/W33（close 通知生产侧缺失，B4 已定位）、Q2 P2（macOS-only `file-gate-host-facts-unproven`）、B3a 残差中的 hub flowId 2 名（若 legacy 无 flowId 语义应保留）、C-04/关闭全部两个 10s 有界未结算（产品死锁/清理候选）。

## 1. 三平台计数表

| 平台 | job 结果 | 起止（UTC） | job 耗时 | 测试步骤耗时 | tests | pass | fail | cancelled | skipped | 唯一名 | 行级唯一 ✖（含 section 头） | `duration_ms` |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| macOS arm64 | failure（仅测试步骤） | 05:51:06–06:11:30 | 20m24s | 05:52:12–06:11:25（19m13s） | 5,825 | 5,618 | **187** | 1 | 19 | **188** | **195** | 1,152,165.81（19m12s） |
| macOS x64 | failure（仅测试步骤） | 05:51:06–06:27:15 | 36m09s | 05:52:41–06:27:09（34m28s） | 5,825 | 5,618 | **187** | 1 | 19 | **188** | **195** | 2,066,969.57（34m27s） |
| Windows x64 | failure（仅测试步骤） | 05:51:05–06:16:10 | 25m05s | 05:52:01–06:16:06（24m05s） | 5,825 | 5,614 | **178** | 1 | 32 | **179** | **186** | 1,445,610.17（24m06s） |

口径说明（与协调者数字的精确对账）：

- **权威唯一名口径**（去缩进/耗时、排除 `✖ failing tests:` section 头）：**188 / 188 / 179**。与 `ℹ fail` 187 / 187 / 178 的 +1 差异对应 `ℹ cancelled 1`；最终 section 块数 186 / 186 / 177 = 唯一名 − 2（W5、W10 两个父测试只有 inline 行、最终 section 无叶块）。
- **行级唯一 ✖（协调者口径）**：协调者 195 / 195 / 186 可精确复现 = **保留缩进的去耗时唯一名 192 / 192 / 183** + **`✖ failing tests:` 头行出现次数 3**（2 个顶层 section + 1 个嵌套 `  ✖ failing tests:`）。原始 `✖` 行数 381 / 381 / 363（含 3 个头；不含头的 xmarkLineCount 为 378 / 378 / 360）。
- **文件级条目**：三平台均为 **0**（无 `✖ <file>.test.ts (…ms)`）。
- **超时条目**：三平台 `maxDurationMs ≥ 100000` 均为 **0**。两个历史挂起（`关闭全部…`、`C-04…`）为 **10,015–10,031ms 有界失败**（B1 deadline 生效），不是超时。
- **工件完整性**：三份工件均含完整顶层汇总与最终 `✖ failing tests:` section（`artifactIntegrity` 字段见 `05-platform-counts.json`）；工件大小 1,814,437 / 1,815,521 / 1,249,849 B，行数 10,687 / 10,687 / 10,440。
- **Windows 首次完整覆盖**：R3 `cancelled @120m` → R4 24m06s 自然结束；skipped 32（macOS 19）差异来自平台条件 skip；cancelled 1 三平台同口径。

## 2. 新宇宙与集合对照

| 集合 | 数量 | R4 交集 | 说明 |
| --- | ---: | ---: | --- |
| R4 三平台合并宇宙 | **188** | — | arm64 188 / x64 188 / win 179 |
| 上一轮 R3 宇宙 | 194 | **188** | **R4 ⊂ R3：新增 0、消失 6** |
| B0 冻结全量基线 | 191 | **130** | 与 R3 完全相同（130）；B0 未出现 61 名见 §2.2 |
| B7 全量 | 190 | **130** | 与 R3 完全相同 |
| 冻结 known-red 62 | 62 | **33** | 与 R2/R3 逐名相同；29 名未出现 |
| 历史 triage 186 | 186 | **21** | KR 6 / MAC 1 / NEW 14（R3 为 24） |

- 其他统计：`current_not_in_any_baseline_or_triage` = **51**（R3 54）；`mac_only_not_windows_log` = **9**（R3 172）、`mac_only_not_windows_log_and_not_b0_b7` = **9**（R3 56）；`windows_only` = **0**（R3 2）；未解析文件 0。
- **消失的 6 名**（R3 有、R4 三平台均未复现；均为 R3 已标注的 flake/平台候选，单轮不判稳定转绿）：

| # | 失败名（缩写） | 文件 | R3 平台/族 | R4 现状与定性 |
| ---: | --- | --- | --- | --- |
| 1 | `申请直达：来源角色=rapporteur…request.* 事件写 tasks.jsonl` | `application-line.test.ts` | arm64+x64 / drift | R4 全绿；B4 本机定性为异步 append 顺序 flake（3× 中 1 次旧顺序） |
| 2 | `AC-4：Claude convener … git_publish delivery 完整链…` | `git-action-delivery-claude-e2e.test.ts` | x64-only / hang（300s） | R4 全绿；x64 总耗时从 50m52s 降至 34m27s，倾向 runner 负载/性能 flake |
| 3 | `W-J5/J15：judge 代批 intent 冻结…` | `2026-11-09_judge-delegated-effectiveness.test.ts` | x64-only / hang（180s 测试自带） | R4 全绿；同为 x64 性能候选 |
| 4 | `W29 … document-change-missing-confirmation…` | `chief-workflow.test.ts` | win-only inline / 未归类 | R4 完整 Windows 未复现；B4 本机 3× 绿（平台候选） |
| 5 | `W36 真实Chief可无M0-plan-D3派五builtin准备…` | `chief-workflow.test.ts` | x64-only / drift | R4 双 macOS + Windows 均未复现；B4 本机 3× 绿 |
| 6 | `W48 … foreign-lease` | `chief-workflow.test.ts` | win-only inline / ci-path | R4 完整 Windows 未复现；B3c 本机 3× 绿；B1b 清理修复已合入 |

- **新增 0**：R4 没有出现 R3 宇宙之外的新失败名；B1b 合入未引入新失败面。

### 2.1 Windows 首次完整覆盖（179 名）

- Windows 179 名**全部与 macOS 重叠**（`windows_only = 0`）；macOS 侧比 Windows 多 **9 名**（mac-only）：

| mac-only 名（9） | 族 | 备注 |
| --- | --- | --- |
| `W29 … document-change` / `-source-loss` / `-wrong-flow`（3） | drift | R3 Windows inline 出现，本轮 Windows 通过、macOS 仍红 |
| `W30 … 连续写入后` / `真实重启迁移后`（2） | drift | 同上 |
| `W35 缺team仍可真实Chief报告派人事准备…`（1） | drift | 同上 |
| `D3 lstat ENOTDIR is a status error…`（1） | unclassified | R2 已登记 macOS 错误文案差异 |
| `Git final spawn fence…`（1） | unclassified | macOS-only git spawn 语义 |
| `Q2 P2 first new project…`（1） | ci-path | macOS-only 产品候选（`file-gate-host-facts-unproven`） |

- R3 的 Windows 22 名（取消前 inline）在 R4 的去向：**14 名仍 Windows 红**；**6 名 Windows 转绿但仍 macOS 红**（W29×3 / W30×2 / W35——与上表一致）；**2 名 R4 未复现**（W29-missing、W48）。
- **错误体归因首次覆盖 Windows**：Windows 工件含最终 section 177 块；块级错误码分布与 macOS 基本一致（`ERR_ASSERTION` 145、`document-planning-source-unavailable` 20、`git-file-final-guard-unproven` 18、canonical metadata roots 17、`vca-channel-unavailable` 5、`worker-dispatch-source-unavailable` 5、`stage-request-required` 3、`D1 test wait expired` 3、`waitFor 超时` 2 等）。R2/R3 的「Windows inline 无错误体」限制解除。
- **新暴露而非新语义**：179 名中 165 名是 R3 取消前未出现的名字，但全部在 macOS 集合内、且族归属不变；Windows 首覆盖扩大的是**暴露面**，没有出现 Windows 特有的新失败面。
- 分族 Windows 分布（179）：known-red 33 / ci-path 40 / drift 24 / source-gate 23 / B0 其他 18 / flake 16 / VCA 13 / 未归类 10 / hang 2。

### 2.2 B0 61 名缺口闭合（Windows 完整覆盖后逐名现状）

- B0 191 中未在 R4 宇宙出现的 **61 名**（与 R3 的 61 名完全相同）本轮**全部未在完整 Windows 三平台工件中复现**，且 **0 名出现在 skip 行**。
- 逐名存活核实（`23-b0-closure-detail.tsv`）：**48 名**仍以字面量存在于 `test/**/*.test.ts`；**11 名**为模板生成名（`真实入口失败路径非 0:${c.name}`、`root flag and env reach ${runtime}…`、`actual bin default ${runtime}…`、`T1 actual bin ${command}/${runtime}…`），对应测试仍存在；**2 名**为文件级条目（`test\测试\git-action-delivery-claude-e2e.test.ts`、`test\装配\main.test.ts`），两个文件均存在且 R4 无文件级失败。
- 现状判定：**本轮三平台完整覆盖下未复现 ⇒ 可判「非当前 CI 红」**；不再受 R3「Windows 取消、未跑到」的缺口影响。但**不等于永久转绿**（B0 是 15 段 Windows 本机基线，与 CI 环境、名称生成/重命名仍可能有差异）；建议 B7 重冻结时按「REMOVED / 未复现」登记。
- 集合细节：61 名中 **59 名**同时不在 B7（B0∩B7 的差异）；B0-only 2 名（`重启：未决申请 orphaned…`、`test\测试\git-action-delivery-claude-e2e.test.ts`）；B7-only 1 名（`硬编码守卫：allowlist 之外不得出现中文…`）。完整 61 行见 `19-b0-b7-closure.tsv`，逐名分类见 `23-b0-closure-detail.tsv`。

## 3. 分族重算（互斥分族，合计 188）

| 族 | R4 数量 | 平台分布（arm64/x64/win） | R3 数量 | 变化 | 代表文件（计数） |
| --- | ---: | --- | ---: | --- | --- |
| 冻结 known-red 62 | **33** | 33/33/33 | 33 | 不变 | trunk-upgrade-validation 5、trio-worker-report 3、section1-write-preauthorization 2、appointment-roster 2 |
| CI 路径规范形/守卫族 | **41** | 41/41/40 | 42 | **−1**（W48 未复现） | multi-runtime 22、git-action-authorization-gate 3、wiring 9、cross-runtime 4、run-stop 1、session-admission 1、git-role-workflows Q2 P2（mac-only） |
| e71501c 语义漂移族 | **30** | 30/30/24 | 32 | **−2**（W36、application-line 未复现） | chief-workflow 12、star-routing 7、directive-input 5、stuck-redispatch 3、handback-delivery 2、decision-service 1 |
| source 门测试装配族 | **23** | 23/23/23 | 23 | 不变（R4 CI 仍原样复发；B3a 分支未合入） | run-pin 11、run-change-trigger 9、i-full-chain 2、schema 1（`selected` 伪影） |
| B0 既有红（其他） | **18** | 18/18/18 | 18 | 不变 | h-scope-audit 3、t1-pipeline-integration 3、trunk-stable-write-integration 2、git-role-workflows-e2e 2 |
| flake 时序族 | **16** | 16/16/16 | 16 | 不变 | session-rebuild-race 3、network-state-e2e 3、f2-claim-release 2、e-handler 1… |
| VCA 流程/通道族 | **13** | 13/13/13 | 13 | 不变（B3b 分支未合入） | version-change-integration 9、version-change 4 |
| 未归类 | **12** | 12/12/10 | 13 | **−1**（W29-missing 未复现） | git-operation-sidecar-tolerance 6、git-command 3、git-trunk-store 1、run-role-submit-capabilities 1、file-write-safety 1 |
| 挂起/超时族 | **2** | 2/2/2 | 4 | **−2**（AC-4/W-J5 未复现） | session-rebuild-race 1、stuck-redispatch 1（二者均 ~10s 有界失败，非超时） |
| macOS git-config 平台族 | **0** | 0/0/0 | 0 | **仍为 0** | — |
| **合计** | **188** | 188/188/179 | **194** | **−6** | — |

补充：

- 分族规则与 R2/R3 完全一致，未按 R4 结果调参；仍有 2 处「规则语义滞后」需阅读时修正：①裸名 `selected` / `required` 被 `repoFiles[0]` 挂到 `test/claude-adapter/schema.test.ts`（实际块归属 `chief-workflow.test.ts`，B3a 已定性为伪影）；②`关闭全部…` / `C-04…` 仍按冻结 `HANG_NAMES` 归入挂起族，但实际是 10s 有界失败而非 300s 超时。W48 本轮未出现，R3 的第 3 处滞后自动消失。
- **source-gate / VCA 变化**：R4 CI（B3a/B3b 分支未合入）仍为 R3 的 23 / 13 逐名原样复发；变化仅来自批次本机结果（见 §4），不是 CI 转绿。
- **e71501c / ci-path 变化**：drift 32→30（W36、application-line 未复现）；ci-path 42→41（W48 未复现）。其余逐名不变。W19/W33 仍在 drift（三平台红，产品候选）；Q2 P2 仍 ci-path（mac-only，产品候选）。

### 3.1 macOS git-config 族：0 残留确认

- 三份工件 grep `git-config-executable-or-unsupported|git-initialization-effects-pending|git-config-section-unsupported|git-config-value-invalid`：**0 / 0 / 0**。
- 块级错误码归因（`10-block-codes.json`，macOS 186 块 + Windows 177 块）：无任何 git-config 错误码。
- 分族结果 `macos-git-config = 0`。B2 修复在第三轮 CI 继续有效。

### 3.2 arm64 与 x64 对比

- 唯一名集合**完全一致**：188 / 188，`arm64-only = 0`、`x64-only = 0`；汇总计数完全相同（pass 5,618 / fail 187 / cancelled 1 / skipped 19）。
- 唯一差异是耗时：arm64 `duration_ms` 1,152,165.81（19m12s）vs x64 2,066,969.57（34m27s），x64 为 1.79×；x64 仍明显慢于 arm64，但 R3 的 2 个 x64-only 超时（AC-4 300s、W-J5 180s）本轮未出现。
- 结论：平台语义面完全一致；耗时差异不构成失败面差异。

### 3.3 挂起/超时与 Windows 静默

- 测试级超时（`maxDurationMs ≥ 100000`）：三平台 **0**。
- 两个历史挂起仍红但为有界失败：`关闭全部与双角色刷新扫描交接…`（session-rebuild-race）与 `C-04 decision 开关开启…`（stuck-redispatch），三平台均 ~10.0–10.03s，含状态诊断；属真实未结算行为（产品/测试待 B5 定性），不是 300s 挂起。
- Windows 静默：R3 的 112.12 分钟静默在 R4 未出现（完整跑完、无 cancel 标记）；B1b 修复验证通过。

## 4. 批次投影（B3a/B3b/B3c/B4 合入后的预计剩余宇宙）

> 口径：R4 CI 基线 188 名（批次分支**均未合入** R4）。按协调者简报扣除各批已转绿名（对 R4 宇宙中存在者才扣除）：
> B3a 8（run-change-trigger 7 + run-pin F2 1）、B3b 13（VCA 全部）、B3c 40（ci-path 本地可复现全部，Q2 P2/W48 除外）、B4 30（drift 32 − W19/W33）。
> 扣除合计 **89 名**（B4 的 30 名中 W36、application-line 已在 R4 不存在，实际匹配 28），**预计剩余 99 名**。

| 族 | R4 | 扣除 | 预计剩余 | 预计剩余名 |
| --- | ---: | ---: | ---: | --- |
| 冻结 known-red 62 | 33 | 0 | **33** | 冻结基线，B7 重冻结处理 |
| B0 既有红（其他） | 18 | 0 | **18** | B6b 逐文件 3× 定性 |
| flake 时序族 | 16 | 0 | **16** | B5 硬化 |
| source 门测试装配族 | 23 | 8 | **15** | B3a 停手残差：run-pin 10 / run-change 2 / i-full-chain 2 / `selected` 伪影 1；需 owner 授权后按 B4 类更新期望 |
| 未归类 | 12 | 0 | **12** | B6a：journal/sidecar 契约（6）、git-command 3、trunk-store 1、run-role-capabilities 1、D3 ENOTDIR 1 |
| e71501c 语义漂移族 | 30 | 28 | **2** | W19、W33（产品候选） |
| 挂起/超时族 | 2 | 0 | **2** | 两个 ~10s 有界失败（B5 P1） |
| CI 路径规范形/守卫族 | 41 | 40 | **1** | Q2 P2（macOS-only 产品候选） |
| VCA 流程/通道族 | 13 | 13 | **0** | B3b 全绿（待 CI 复核） |
| **合计** | **188** | **89** | **99** | — |

**投影风险与修正**：

1. **B4 的 6 个「no-change」名在 macOS 仍红**：W29×3、W30×2、W35 在 R4 为 **mac-only 红**（Windows 通过），B4 本机（Windows）3× 绿但**未改期望**、也未在 macOS 复跑。若 B4 合入后 macOS 仍红，投影应 **+6 → 105 名**（它们属于被扣除的 28 名之内）。这是当前投影最大的单点风险。
2. **B3a 的 15 名未扣除**：其中 14 名为 v2.0.0/e71501c 语义漂移（run-pin 10 / run-change 2 / i-full-chain 2），`selected` 为族归属伪影（实为 chief-workflow 子测试）。需 owner 明确「当前语义下更新断言」的授权；若授权，按 B4 类处理；若不授权且判定旧语义受支持，则其中 hub flowId 2 名转为产品候选。
3. **B3c 的 40 名是 Windows 本机 junction/plain 证据**，CI macOS 仍需下一轮复核；Q2 P2 已单列为产品候选（未扣除）。
4. **known-red 33 不是「待修」**：保持冻结；B7 重冻结时按当前真实红更新。
5. **Windows 侧**：预计剩余 99 名中 **96 名在 Windows 红**（仅 D3 ENOTDIR、spawn fence、Q2 P2 三名 mac-only）。下一轮 CI 的 Windows 不再是盲区，可作为 B5/B6 的完整验证平台。

## 5. 下一批治理批次（B5/B6）建议

**Windows 侧新暴露**：R4 Windows 179 名中 **165 名**是 R3 取消前未出现（14 名与 R3 Windows 22 重叠），全部与 macOS 重叠、无 Windows-only 新语义面。按本批剩余清单：B5 **18/18**、B6b **18/18**、B3a 残差 **15/15**、B6a **10/12** 在 Windows 红（仅 D3 ENOTDIR、spawn fence、Q2 P2 三名 mac-only）。Windows 首覆盖后错误体完整（177 块），B5/B6 的 Windows 验证不再依赖 inline 名推断。

### 5.1 B5（P1/P2）：flake 硬化 + 有界挂起收口

范围：**18 名 / 12 文件**（flake 16 + hang 2；全部三平台红，Windows 侧首次有完整错误体）。

| 文件 | 名数 | 备注 |
| --- | ---: | --- |
| `test/桌面应用/session-rebuild-race.test.ts` | 4 | 3 个 flake 窗口 + `关闭全部…` 10s 有界失败（B1 已加 deadline，仍红） |
| `test/桌面应用/stuck-redispatch.test.ts` | 1 | `C-04…` 10s 有界失败；B4 已改同文件其他 3 名，注意避免冲突 |
| `test/测试/network-state-e2e.test.ts` | 3 | 离线/探针事件驱动等待 |
| `test/测试/kanban-fixes-verify/f2-claim-release.test.ts` | 2 | 显式 barrier；`dispatch is not a function` harness |
| `test/测试/g4-skill-verify/e-handler.test.ts` | 1 | 护栏矩阵共享计数器 |
| `test/测试/g4v2-mcp-verify/f-handler.test.ts` | 1 | F3 护栏矩阵（与 e-handler 同 helper 时复用） |
| `test/测试/download-requests-integration.test.ts` | 1 | 坏行账本 flush |
| `test/桌面应用/download-request.test.ts` | 1 | 下载卡排队事件驱动 |
| `test/桌面应用/task-restart.test.ts` | 1 | 重启恢复账本事件 |
| `test/测试/turn-watch-verify/b-last-resort.test.ts` | 1 | 10s 检查时限去抖 |
| `test/测试/queue-recovery-e2e.test.ts` | 1 | 回交持久化 ready 断言 |
| `test/桌面应用/interface.test.ts` | 1 | requestRoleStates 忙锁有界重试 |

优先级：**P1** 两个 10s 有界失败（`关闭全部…`、`C-04…`）先定性（产品死锁/清理 ENOTEMPTY 候选）；**P2** 其余 16 名按 R2 B5 原则只硬化等待/清理、不新增断言、不放宽断言。

### 5.2 B6（P1/P2）：未归类 + B0 其他 + B3a 残差

| 子批 | 族 | 名数 | 文件 | 优先级 | 说明 |
| --- | --- | ---: | --- | --- | --- |
| B6a | 未归类 | 12 | `git-operation-sidecar-tolerance`（6）、`git-command`（3）、`git-trunk-store`（1）、`run-role-submit-capabilities`（1）、`file-write-safety`（1） | **P1** | journal/sidecar 契约可能同根因，先 3× 定性；D3 ENOTDIR（macOS 文案）与 spawn fence（mac-only）单列 |
| B6b | B0 既有红（其他） | 18 | `h-scope-audit`（3）、`t1-pipeline-integration`（3）、`trunk-stable-write-integration`（2）、`git-role-workflows-e2e`（2：Q30/Q74）、`schema.test`（1：`required` 伪影）、`pi-loopback-verify`、`session`、`project`、`entry-role-minimal-d`、`f-handler`、`log-actions`、`direct-role-capabilities-e2e` 各 1 | **P2** | 逐文件 3×（2 隔离 + 1 整文件）三态定性；`required` 实为 chief-workflow 伪影，归漂移族复核 |
| B3a 残差 | source 门（已定性为 v2.0.0/e71501c 漂移） | 15 | `run-pin`（10）、`run-change-trigger`（2）、`i-full-chain`（2）、`schema.test`（`selected` 1，实为 chief-workflow） | **P1（owner-gated）** | 需 owner 先授权「按当前语义更新期望」；hub flowId 2 名需 owner 裁定 legacy 无 flowId 是否受支持 |

### 5.3 产品候选（单列，不排修）与需 owner 裁决项

| 候选 | 证据 | 需裁决 |
| --- | --- | --- |
| **W19 / W33 close 通知** | B4 `w19-w33-close-notify-investigation.txt`：`closeCreatedTask` 不调用 `notify`，消费侧已支持；e71501c 引入 W19/W33 断言与生产缺口；R4 三平台稳定红 | 产品修复（最小恢复：close 成功回执后复用 `notify(receipt)`）或更新期望 |
| **Q2 P2（macOS-only）** | B3c：CI macOS `file-gate-host-facts-unproven`，本机 Windows 3× 绿；R4 仍 mac-only 红 | 产品 host facts/protection currency 修复，或 macOS 定向 3× 定性 |
| **B3a hub flowId 2 名**（P1.1、R2 handoff 无 flowId） | B3a §5 类别 B：`chief-hub-flow-unavailable` 与现行门冲突 | 若 legacy 无 flowId 语义应保留 ⇒ 产品候选；否则授权更新断言 |
| **C-04 / 关闭全部** | 三平台 ~10s 有界未结算，B1 已把 300s 挂起降为有界失败；B4 记录 C-04 清理期 ENOTEMPTY | 产品死锁/清理语义 vs 测试期望（B5 P1 定性） |
| **installMcp/installSkill 能力矩阵**（B0 其他 h-scope-audit） | R2 §2.2 产品候选；R4 三平台仍红 | owner 确认 e71501c 后矩阵是否更新 |
| **journal/sidecar 契约**（未归类 6 名） | 期望 `authorization-sidecar-*` / `stable-work-source-corrupt`，实际 `git-journal-directory-invalid` | 产品契约 vs 测试装配（B6a 定性） |
| **workflow 止血** | B1b/B3b/B3c 均建议 `--test-force-exit` 或 step 级 timeout | owner 决定是否改 `test-ci.yml`（本轮不改） |

### 5.4 与 R2 计划轮次的对应

- R2 原计划 R3 = B3a+B3b+B3c+B4、R4 = B5+B6、R5 = B7。实际执行改为批次分支并行、第三轮 CI 仅含 B1b。
- 建议下一轮 CI（R5）合并 B3a（仅 8 名转绿部分）+ B3b + B3c + B4 后复跑三平台，验证投影；随后 B5+B6 合并为 R6，B7 收口重冻结为 R7。
- B3a 的 15 名残差与 W19/W33、Q2 P2 不阻塞 B5/B6，但必须在 B7 前完成 owner 裁决。

## 6. 与 R3 计划/预期的偏差

| 项 | R3 计划/预期 | R4 实际 | 偏差与处置 |
| --- | --- | --- | --- |
| Windows 预算 | B1b 修复后不再触顶；需验证能否越过 chief-workflow | **24m06s 完整跑完，无静默**；179 名、完整汇总与错误体 | 达成；Windows 首次完整覆盖 |
| 300s 条目 | B1 后旧挂起变快速失败；x64 2 个超时待 3× | **三平台 0 条 ≥100s**；两个旧挂起仍 10s 有界失败 | 达成；x64 超时本轮未复现（单轮） |
| 宇宙规模 | R3 194；若 Windows 完整可能扩张 | **188（⊂ R3，新增 0、消失 6）** | 收敛；6 名消失均为 flake/平台候选，不判永久绿 |
| B3a source 门 23 | 23 名定性；owner 裁决 legacy 派发 | CI 仍 23 原样；本机 8 绿 / 15 残差（14 红 + 1 伪影） | 停手待裁定；建议按 B4 类更新期望（owner-gated） |
| B3b VCA 13 | 13 名定性 | CI 仍 13 原样；本机 13/13 绿（两文件 3×） | 待 CI 复核 |
| B3c ci-path 42 | 42 名定性 | CI 41（W48 未复现）；本机 40 绿；Q2 P2 仍 macOS-only；W48 本机绿 | 待 CI 复核；Q2 P2 产品候选 |
| B4 drift 32 | 30 名按当前语义更新；W36/W29-missing 3× | CI 30（W36/application-line 未复现）；本机 30 绿（含 6 名 macOS 仍红且未改期望） | 合入后需 macOS 复核；投影风险 +6 |
| B5/B6 | flake 16 + B0 17/未归类 3 | 投影后 flake 16 + hang 2；B6a 12 + B6b 18；B3a 残差 15 | 见 §5；B6 扩围（含 Windows 首覆盖名） |
| known-red 基线 | 33/62、B0/B7 交集 130 继续有效 | **33/62、130 逐名不变** | 可继续冻结；B7 处理 61 名未复现 |
| git-config 113 | B2 后清零 | **三平台 0 残留** | 持续有效 |

## 7. 证据边界与披露

1. **工件为准**：本轮 GitHub 日志流偶发 CANCEL，三平台分析全部基于上传工件 `test-ci-output.log`；三份工件均含完整顶层汇总与最终 failing section，且运行元数据（job/时间/结论/typecheck）经 `gh run view 43812832566 --json` 只读核对。未做 gh 日志流 vs 工件集合对照（R3 已证明同源一致；本轮工件自含完整汇总）。
2. **单轮样本**：6 个消失名（尤其 x64 两个超时、W36、W48、W29-missing、application-line）均为 R3 已知 flake/平台候选；R4 单轮未复现**不构成稳定转绿**，下一轮 CI 必须复核。x64 超时的消失与 x64 总耗时下降（50m52s→34m27s）同时出现，支持 runner 负载/性能解释，但仍不能排除偶发泄漏。
3. **B0 61 名闭合的边界**：61 名在完整 Windows 未复现，且逐名核实为活测试/活文件（48 字面 + 11 模板 + 2 文件级，0 skip）；但 B0 为 15 段 Windows 本机基线，CI 环境差异、动态命名与重命名仍可能造成「名字不在日志但行为未覆盖」；因此仅判「本轮 CI 非红」，永久转绿由 B7 重冻结裁定。
4. **错误体归因**：R4 首次拥有 Windows 最终 section 错误体（177 块），块级错误码与 macOS 高度一致；分族仍按 R2 规则使用 macOS 块码，Windows 码用于交叉核对，未参与分族调参。
5. **规则语义滞后**：`selected` / `required` 裸名经 `repoFiles[0]` 误挂 `schema.test.ts`（实为 chief-workflow 子测试）；`HANG_NAMES` 两名实际为 10s 有界失败。阅读 §3/§4 时按语义修正；规则本身按「逐字沿用」未改。
6. **批次投影的假设性**：B3a/B3b/B3c/B4 分支均未合入 R4 CI；扣除基于各批 3× 本机证据（B3a/B4 为 Windows 本机，B3c 为 Windows junction/plain 模拟）。B4 的 6 个 macOS-only no-change 名是投影最大风险（+6 → 105）；B3c 的 40 名需 macOS CI 复核。
7. **跳过/取消口径**：Windows skipped 32 vs macOS 19 为平台条件 skip；cancelled 1 三平台同口径；唯一名与 `ℹ fail` 的 +1 对应 cancelled 口径，最终 section 块数 = 唯一名 − 2（W5/W10 父名）。
8. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境），平台结论均来自 CI 工件。
9. **B3a 证据读取**：投影读取了 `fix-test-debt-b3a` 工作树的 `02-family-vs-local.tsv`（只读，未改其分支）；B3b/B3c/B4 的目标名单来自 R3 `11-families.json` 与各批报告。

## 8. 未决问题（更新）

1. **W19/W33**：close 通知是否按 B4 建议在 `closeCreatedTask` 成功回执后调用 `notify(receipt)`？产品修复或更新期望需 owner 裁决。
2. **Q2 P2**：macOS-only `file-gate-host-facts-unproven` 是产品 host facts/protection 归一缺陷还是 runner 环境差异？需 macOS 定向复跑（owner 提供环境或下一轮 CI macOS job 观察）。
3. **B3a 残差授权**：是否授权按 v2.0.0/e71501c 当前语义更新 14 名期望？hub flowId 2 名（legacy 无 flowId）是否属受支持语义？
4. **B5 有界挂起**：`关闭全部…` / `C-04…` 的 10s 未结算根因是产品死锁、清理 ENOTEMPTY 还是测试等待？B5 P1 先定性。
5. **B6 未归类 12 名**：journal/sidecar 契约（I0-11/I0-12）与 spawn fence/protection facts/operation media 是否同一根因？产品契约还是测试装配？
6. **B7 重冻结口径**：B0 61 名未复现如何登记（REMOVED / 未复现）？是否新增 `desktop-known-red` 第四套（确定性名 + flake 族分开）？
7. **workflow 止血**：`test-ci.yml` 是否加 `--test-force-exit` 或 step 级 timeout（B1b/B3b/B3c 多次提出；本轮不改）。
8. **下一轮 CI 编排**：是否按 B3a(8)+B3b+B3c+B4 合并 R5、B5+B6 合并 R6、B7 收口 R7？B3a 残差/产品候选是否在 B7 前必须裁决？

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` | R3 脚本适配：三平台**工件**输入、平台键 `windows_x64`、行级计数与工件完整性 |
| `attribute-blocks.mjs` | R3 原件 + 可选 `--win`；三平台最终 section 逐块错误码归因 |
| `classify-failures.mjs` | R3 原件（平台键适配）；与 B0 191 / B7 190 / known-red 62 / triage 186 合并去重 |
| `assign-families.mjs` | 逐字沿用 R2/R3；互斥分族 |
| `summarize-r4.mjs` | 由 `01` 派生三平台计数与超时事实 |
| `compare-r3.mjs` | R4 188 vs R3 194 / B0 / B7 集合对照、平台差异、Windows 首覆盖、B0/B7 缺口闭合 |
| `analyze-b0-closure.mjs` | B0 61 名逐存活核实（字面/模板/文件级 + skip 检查） |
| `project-batches.mjs` | 批次投影：B3a 8 / B3b 13 / B3c 40 / B4 30 扣除，预计剩余 99 名与 B5/B6 清单 |
| `01-ci-failures.json` | 三平台完整提取（汇总、唯一名、超时、failing section、行级计数、工件完整性） |
| `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt` / `04-failnames-windows-x64.txt` | 逐平台唯一失败名 + 文件（188 / 188 / 179） |
| `05-platform-counts.json` | 三平台计数速览（job、汇总、唯一名、行级、超时、工件完整性） |
| `06-merged-universe.json` | 188 名并集：平台出现、日志/仓库文件映射、集合命中、首个错误行 |
| `07-by-file.tsv` | 按测试文件分组的失败名清单 |
| `08-set-summary.json` | 集合交集与平台独有统计（B0/B7/KR/triage、mac-only 9、windows-only 0） |
| `10-block-codes.json` | 逐名块级错误码（macOS 186 / 186 块，Windows 177 块） |
| `11-families.json` | 互斥分族全量（族/平台计数/文件计数/跨列/产品候选标记） |
| `12-family-summary.tsv` | 族汇总（族/数量/top 文件） |
| `14-timeouts-and-stall.json` | 超时条目（0）与 Windows 完整覆盖事实 |
| `15-r3-comparison.json` | 194 vs 188：交集/新增/消失、逐族增减、逐名详情 |
| `16-platform-diff.tsv` | 平台差异清单（arm64/x64 无差异；179 行 Windows 首覆盖平台变化） |
| `17-windows-full-coverage.tsv` | Windows 179 名全量对照（macOS 重叠、R3 Windows 22 命中、族、集合命中、错误首行） |
| `19-b0-b7-closure.tsv` | B0 61 / B7 60 名缺口逐名现状（R4 完整覆盖未复现） |
| `20-batch-projection.json` | 批次投影详情（逐批匹配/缺失名、扣除合计 89、预计剩余 99、逐族剩余名单） |
| `21-batch-projection.tsv` | 逐族投影表（R4 / 扣除 / 预计剩余 / 名单） |
| `22-next-batches.tsv` | 下一批 B5/B6/B3a 残差/产品候选逐名清单（batch/族/文件/平台/产品候选/备注） |
| `23-b0-closure-detail.tsv` | B0 61 名逐分类（literal 48 / template-generated 11 / file-level 2）、命中文件、skip、现状判定 |

## 附录 B：复现命令

```bash
# 数据源：三平台工件（原始工件只放 /tmp，不入库）
# /tmp/r7-art/test-logs-mac-arm64/test-ci-output.log
# /tmp/r7-art/test-logs-mac-x64/test-ci-output.log
# /tmp/r7-art/test-logs-win-x64/test-ci-output.log

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence
R3=角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence
B7=角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3

node $EV/extract-ci-failures.mjs --outdir $EV
node $EV/attribute-blocks.mjs \
  --arm64 /tmp/r7-art/test-logs-mac-arm64/test-ci-output.log \
  --x64 /tmp/r7-art/test-logs-mac-x64/test-ci-output.log \
  --win /tmp/r7-art/test-logs-win-x64/test-ci-output.log \
  --out $EV/10-block-codes.json
node $EV/summarize-r4.mjs --ci $EV/01-ci-failures.json --outdir $EV
node $EV/classify-failures.mjs --ci $EV/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt \
  --kr-dir $B7/knownred --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md \
  --tests-root test --outdir $EV
node $EV/assign-families.mjs --universe $EV/06-merged-universe.json --blocks $EV/10-block-codes.json --outdir $EV
node $EV/compare-r3.mjs --r3 $R3/06-merged-universe.json --r4 $EV/06-merged-universe.json \
  --r3-families $R3/11-families.json --r4-families $EV/11-families.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt --outdir $EV
node $EV/analyze-b0-closure.mjs --closure $EV/19-b0-b7-closure.tsv \
  --tests-root test --artifacts /tmp/r7-art --out $EV/23-b0-closure-detail.tsv
node $EV/project-batches.mjs --universe $EV/06-merged-universe.json --families $EV/11-families.json \
  --r3-families $R3/11-families.json \
  --b3a-family-vs-local ../fix-test-debt-b3a/角色卡/测试/docs/change/2026-11-16_test-debt-b3a-source-gate_evidence/02-family-vs-local.tsv \
  --outdir $EV
```

## 附录 C：关键结论速览

- 三平台：arm64 **188 fail 187 / 唯一 188 / 行级 195**；x64 与 arm64 **完全一致**（188/187/188/195，仅慢 1.79×）；Windows **首次完整跑完**：fail 178 / 唯一 179 / 行级 186，24m06s。**300s 条目 0**。
- 新宇宙 **188 ⊂ R3 194**：**新增 0、消失 6**（AC-4、W-J5、W36、W29-missing、W48、application-line，均为已知 flake/平台候选）。
- **macOS git-config 仍 0**；known-red 33 / B0/B7 交集 130 逐名不变。
- **Windows 首覆盖**：179 名全部 macOS 重叠、0 Windows-only、9 mac-only；R3 Windows 22 → 14 仍红、6 Windows 绿但 macOS 红、2 未复现；Windows 错误体首次可用（177 块）。B0 61 名缺口闭合：完整覆盖下全部未复现、逐名活测试核实（48+11+2，0 skip）。
- **批次投影**：扣除 89 → **预计剩余 99**：known-red 33 / B0 其他 18 / flake 16 / source-gate 残差 15 / 未归类 12 / drift 残差 2（W19/W33）/ ci-path 残差 1（Q2 P2）/ hang 2。风险：B4 的 6 名 macOS-only no-change 若复发 → 105。
- **B5**：18 名 / 12 文件（flake 16 + 有界 hang 2）；**B6**：未归类 12（P1）+ B0 其他 18（P2）+ B3a 残差 15（owner-gated）；产品候选 W19/W33、Q2 P2、hub flowId 2 名、C-04/关闭全部待 owner 裁决。

## 附录 D：B0 61 名未复现逐名清单（Windows 首次完整覆盖后）

> 状态口径：61 名均不在 R4 宇宙（三平台完整工件），且逐名核实为活测试/活文件、0 skip ⇒ **本轮 CI 非红（未复现）**；永久转绿由 B7 重冻结裁定。完整分类与命中文件见 `_r4-evidence/23-b0-closure-detail.tsv`。

| # | 名 | 核实类别 | 命中文件 | 现状 |
| ---: | --- | --- | --- | --- |
| 1 | `差分：契约冻结文件哈希（E0.3 067e3d2e…，差分输入未漂移）` | literal | `test/roles/chief/differential.test.ts` | 未复现（本轮 CI 非红） |
| 2 | `底层永不 settle：仍需拒绝后续 prompt（fail-closed），清理失败不等于放行` | literal | `test/测试/abort-cleanup-verify.test.ts` | 未复现（本轮 CI 非红） |
| 3 | `读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛` | literal | `test/测试/g4-skill-verify/b-render-double-check.test.ts` | 未复现（本轮 CI 非红） |
| 4 | `非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话` | literal | `test/runtime-core/reasoning-effort.test.ts` | 未复现（本轮 CI 非红） |
| 5 | `接线:门禁引擎的 F4 收窄经真实装配配置生效(判定来自 resolveWrite)` | literal | `test/测试/wiring.test.ts` | 未复现（本轮 CI 非红） |
| 6 | `入口退出码可靠：demo 路径以 0 退出且无警告` | literal | `test/装配/entry.test.ts` | 未复现（本轮 CI 非红） |
| 7 | `未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席` | literal | `test/runtime-core/reasoning-effort.test.ts` | 未复现（本轮 CI 非红） |
| 8 | `已 bootstrap（有角色）：su 的 gate 拒绝 角色卡/<新角色>/role-card.md（不再有创世授权）` | literal | `test/桌面应用/genesis-bootstrap.test.ts` | 未复现（本轮 CI 非红） |
| 9 | `真实入口:演示**不产生新的** docs/scheduling 记录、也不改写既有管理记录(F3)` | literal | `test/测试/real-entry.test.ts` | 未复现（本轮 CI 非红） |
| 10 | `真实入口:演示输出含角色/边界来源、两笔写入、按根分组、settled` | literal | `test/测试/real-entry.test.ts` | 未复现（本轮 CI 非红） |
| 11 | `真实入口:ans role run 编排 --task T-1 以 0 结束` | literal | `test/测试/real-entry.test.ts` | 未复现（本轮 CI 非红） |
| 12 | `真实入口:runCli 默认擦洗——跑测进程的 ANS_RUNTIME 与 Pi 凭据不传给子进程（哨兵值实测）` | literal | `test/测试/real-entry.test.ts` | 未复现（本轮 CI 非红） |
| 13 | `真实入口失败路径非 0:govern 缺真实 Pi 适配器 provider 配置（环境已擦洗：ANS_PI_*/凭据/ANS_RUNTIME 不入子进程）` | template-generated | `test/测试/real-entry.test.ts` | 未复现（本轮 CI 非红） |
| 14 | `诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响）` | literal | `test/runtime-core/reasoning-effort.test.ts` | 未复现（本轮 CI 非红） |
| 15 | `重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等` | literal | `test/桌面应用/pending-card-restart.test.ts` | 未复现（本轮 CI 非红） |
| 16 | `abort 抛错但底层稍后 settle：隔离解除，后续 prompt 可再次进入，不永久卡在「中止清理中」` | literal | `test/测试/abort-cleanup-verify.test.ts` | 未复现（本轮 CI 非红） |
| 17 | `abort rejection keeps quarantine when the underlying turn never settles` | literal | `test/runtime-core/abort-quarantine.test.ts` | 未复现（本轮 CI 非红） |
| 18 | `abort rejection no longer quarantines forever once the underlying turn settles later` | literal | `test/runtime-core/abort-quarantine.test.ts` | 未复现（本轮 CI 非红） |
| 19 | `acknowledged turns keep aborted/timed_out outcomes and single matching terminal` | literal | `test/runtime-core/prompt-start-acknowledgement.test.ts` | 未复现（本轮 CI 非红） |
| 20 | `active and disposed prompt rejections have no turn acknowledgement` | literal | `test/runtime-core/prompt-start-acknowledgement.test.ts` | 未复现（本轮 CI 非红） |
| 21 | `actual bin default claude Provider fails honestly for missing configuration in role and govern` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 22 | `actual bin default codex Provider fails honestly for missing configuration in role and govern` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 23 | `actual bin default pi Provider fails honestly for missing configuration in role and govern` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 24 | `actual bin missing SDK errors are honest and masked without starting model requests` | literal | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 25 | `actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 26 | `all runtimes read the same inspection env; Service still uses the fixed 1h last resort` | literal | `test/runtime-core/effective-timeouts.test.ts` | 未复现（本轮 CI 非红） |
| 27 | `I-1 补丁（**真正接通**核查）：真实 openRoleSession + 真实装配——(c) 实件在场时能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）` | literal | `test/桌面应用/operator-channel.test.ts` | 未复现（本轮 CI 非红） |
| 28 | `new accepted runtime role cards can be reached from root fallback without adding task writes` | literal | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 29 | `node test外指符号链接路径不获委托；项目内测试路径获委托` | literal | `test/编排/shell-authorized-routine.test.ts` | 未复现（本轮 CI 非红） |
| 30 | `normal abort without cleanup failure keeps its existing quarantine lifecycle` | literal | `test/runtime-core/abort-quarantine.test.ts` | 未复现（本轮 CI 非红） |
| 31 | `outer aborted result stays aborted and a settled underlying lifts quarantine despite failing cleanup` | literal | `test/runtime-core/session.test.ts` | 未复现（本轮 CI 非红） |
| 32 | `outer timeout remains timed_out when abort cleanup emits inner aborted terminals` | literal | `test/runtime-core/session.test.ts` | 未复现（本轮 CI 非红） |
| 33 | `P0-2 abort 三态：demo 替身 ⇒ supported:false（「当前运行时不支持停止」如实，绝不假装已停）` | literal | `test/桌面应用/p0-halt-and-images.test.ts` | 未复现（本轮 CI 非红） |
| 34 | `Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort` | literal | `test/runtime-core/effective-timeouts.test.ts` | 未复现（本轮 CI 非红） |
| 35 | `Pi storage refuses file symlink and role/runtime mismatch without touching other storage` | literal | `test/pi-adapter/injected-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 36 | `quarantined prompt rejection has no acknowledgement after one stopped actual turn` | literal | `test/runtime-core/prompt-start-acknowledgement.test.ts` | 未复现（本轮 CI 非红） |
| 37 | `R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 38 | `R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 39 | `R12 interruption during async factory preparation prevents the subsequent native bind` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 40 | `R2 chief timeout is finite and normal sessions still receive injected narrow capabilities` | literal | `test/runtime-core/submit-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 41 | `R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget` | literal | `test/runtime-core/submit-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 42 | `R8 a custom factory cannot self-report the default Codex Chat production provenance` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 43 | `R8 active HTTP inference alone is not treated as an uncontrolled execution program` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 44 | `R8 native registry/instance/role/runtime/activity mismatches remain unknown` | literal | `test/runtime-core/git-capability-tools.test.ts` | 未复现（本轮 CI 非红） |
| 45 | `root command defaults reach demo and Pi respectively through actual Service injection` | literal | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 46 | `root flag and env reach claude through actual Interface/Pipeline/Service handlers in both commands` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 47 | `root flag and env reach codex through actual Interface/Pipeline/Service handlers in both commands` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 48 | `root flag and env reach demo through actual Interface/Pipeline/Service handlers in both commands` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 49 | `root flag and env reach pi through actual Interface/Pipeline/Service handlers in both commands` | template-generated | `test/装配/multi-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 50 | `Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形）` | literal | `test/runtime-core/reasoning-effort.test.ts` | 未复现（本轮 CI 非红） |
| 51 | `Service explicit Pi timing overrides env, including the legacy disabled-timer values` | literal | `test/runtime-core/effective-timeouts.test.ts` | 未复现（本轮 CI 非红） |
| 52 | `store validate callback rejects directory symlink before Pi parse or new native write` | literal | `test/pi-adapter/injected-runtime.test.ts` | 未复现（本轮 CI 非红） |
| 53 | `store: native validation stays lazy and native symlink is rejected before effects` | literal | `test/runtime-core/session-store.test.ts` | 未复现（本轮 CI 非红） |
| 54 | `store: traversal, mismatched scope and symlinked runtime directories rejected` | literal | `test/runtime-core/session-store.test.ts` | 未复现（本轮 CI 非红） |
| 55 | `synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn` | literal | `test/runtime-core/prompt-start-acknowledgement.test.ts` | 未复现（本轮 CI 非红） |
| 56 | `T1 actual bin role/claude: actual adapter and registered handler reject an out-of-boundary write` | template-generated | `test/测试/t1-real-cli.test.ts` | 未复现（本轮 CI 非红） |
| 57 | `T1 actual bin role/codex: actual adapter and registered handler reject an out-of-boundary write` | template-generated | `test/测试/t1-real-cli.test.ts` | 未复现（本轮 CI 非红） |
| 58 | `T1 actual bin role/pi: actual adapter and registered handler reject an out-of-boundary write` | template-generated | `test/测试/t1-real-cli.test.ts` | 未复现（本轮 CI 非红） |
| 59 | `test\测试\git-action-delivery-claude-e2e.test.ts` | file-level-entry | `test/测试/git-action-delivery-claude-e2e.test.ts` | 未复现（本轮 CI 非红） |
| 60 | `test\装配\main.test.ts` | file-level-entry | `test/装配/main.test.ts` | 未复现（本轮 CI 非红） |
| 61 | `wiring guards: append sits after current gate and before effects with the frozen R2 digest mapping; run-change/stop paths never append` | literal | `test/编排/git-action-authorization-wiring.test.ts` | 未复现（本轮 CI 非红） |
