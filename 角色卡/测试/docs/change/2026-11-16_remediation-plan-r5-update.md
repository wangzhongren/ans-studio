# R5：第四轮三平台测试 CI（B3a/B3b/B3c/B4/R4 合并后）结果重归因与批次投影更新

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r5`（分支 `analysis/test-debt-r5`，起点 `a0baea2` = `origin/main`，含 B3a #111 / B3b #112 / B3c #113 / B4 #114 / R4 分析 #115）
- 范围：**只分析、只写本文件与同名 `_r5-evidence/` 证据**。未修改任何代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 workflow；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：GitHub Actions run **43829367008**（`test-ci`，`workflow_dispatch` on `main @ a0baea22af9a1f5fd4e44d5a66fc983ae7aa614e`，2026-11-16T08:12:18Z 创建，conclusion failure——仅测试步骤失败，三平台 typecheck 均 success）。三平台工件（**权威数据源**）：
  - `test-logs-mac-arm64/test-ci-output.log`（1,748,806 B / 9,371 行；job 08:12:22–08:35:03Z）
  - `test-logs-mac-x64/test-ci-output.log`（1,751,609 B / 9,386 行；job 08:12:21–08:56:31Z）
  - `test-logs-win-x64/test-ci-output.log`（1,198,798 B / 9,306 行；job 08:12:21–08:38:52Z）
- CI 命令（与 R2/R3/R4 相同）：`node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`；Node 24.14.0（CI）。
- 方法：沿用 R2/R3/R4 脚本集（`extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs`），仅改 run 元数据与工件根（`/tmp/r8-art`）；新增 R4→R5 集合对照、R4 投影偏差、批次投影三个脚本。分族规则**逐字沿用 R2**（known-red 优先 → 挂起 → e71501c 漂移 → macOS git-config → CI 路径/守卫 → source 门 → VCA → flake → B0 其他 → 未归类），未调参。
- 原始工件：`/tmp/r8-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（本机 Git Bash 的 `/tmp` 映射为 `C:\Users\51054\AppData\Local\Temp`）。**原始工件不入库**。

## 0. 摘要

1. **三平台全部完整跑完**：tests 5,825 ×3；arm64 pass 5,702 / fail 103 / cancelled 1 / skipped 19；x64 pass 5,700 / **fail 104** / cancelled 2 / skipped 19；Windows pass 5,689 / fail 103 / cancelled 1 / skipped 32。三平台均有顶层汇总与最终 failing section，无 CANCEL 标记。
2. **权威唯一名 104 / 106 / 104，三平台合并宇宙 116**（R4 为 188）。宇宙收缩 72 名，但与 R4 投影剩余 99 相比实际多 17 名：**批次绿名 16 名仍红**（B3c 9 + B4 7）、**新/复现 3 名**（W-J5、W1b、W36）、**伪影 2 名转绿**（`selected`、`required`）。
3. **VCA 归零、B3b 完美吻合**：VCA 流程/通道族 13 → **0**，B3b 13 名逐名消失。B3a 已合入的 8 名也全部转绿。**B3c 部分吻合**：40 名中 31 绿，**9 名 Windows-only 仍红**（macOS 双平台已绿）；**B4 部分吻合**：28 名中 21 绿，**7 名 macOS-only 仍红**（R4 预警的 6 名 + W34）。
4. **平台面首次出现明显分化**：94 名三平台同红 / 10 名 Windows-only（9 个 B3c 残差 + 新 W1b）/ 10 名 mac 双平台（W29×3、W30×2、W34、W35、D3 ENOTDIR、spawn fence、Q2 P2）/ 2 名 x64-only（W-J5、W36）；`windows_only` 由 R4 的 0 升至 10，`mac_only` 12。
5. **x64 出现 1 条 180s 挂起**：`W-J5/J15 judge 代批…` maxDurationMs=180,001.96、count=2、x64-only（R3 同款 180s、R4 未复现）；arm64/Windows 0 条 ≥100s。两个历史有界 hang（`关闭全部…`、`C-04…`）仍为 ~10s 有界失败且被 B5 收口（未合入）。
6. **分族（规则口径）**：known-red 33 / 未归类 22 / B0 其他 17 / flake 16 / source-gate 14 / drift 10 / hang 3 / ci-path 1 / VCA 0 / git-config 0。规则滞后：9 名 B3c Windows-only 残差因 `assign-families` 只读 macOS 块码落入未归类；按 Windows 块码 `git-file-final-guard-unproven` 语义修正后 ci-path 10 / 未归类 13（含新 W1b）。
7. **B0/B7 缺口继续闭合**：B0 191 在 R5 命中 78（R4 130）、B7 190 命中 78；R4→R5 新增转绿 52 名；B0 61 / B7 60 名自 R4 起未复现，R5 仍未复现；缺失名 **0 个出现在 skip 行**。
8. **批次投影（合并 B3a 残差/B5/W19 + 假设 B6a/B6b 全绿）**：116 − 14（B3a 残差）− 16（B5）− 12（B6a）− 18（B6b）− 1（W19）= **预计剩余 55 名**：known-red 33 / B3c 残差 9 / B4 残差 7 / W33 / W36 / W-J5 / W1b / task-restart / Q2 P2。仅合并已就绪批次（B3a 残差 + B5 + W19）后预计剩余 **85 名**；W19 若不同步更新 `direct-role-capabilities.test.ts` 3 个旧语义用例，将 **+3 红**（最坏 58）。
9. **B6 范围更新**：B6a 仍为 12 名 / 5 文件（R5 全部仍红）；B6b 组成变为 **18 名 / 11 文件** = R5 `b0-existing-other` 17 名（`required` 伪影已绿）+ B5 移交 `f-handler` F3 1 名（与 B0 的 F7 同文件）。
10. **owner 裁决项**：W33 消费侧跨 run hub 例外、W19 合并随带的 3 个旧语义测试更新、B3c Windows 残差重开、B4 7 名 macOS 残差（6 no-change + W34）、task-restart restore 语义、Q2 P2 macOS-only、W1b 定性；hub flowId 已由 B3a 残差裁定闭环（按当前语义更新，不再单列产品候选）。

## 1. 三平台计数表与口径对账

| 平台 | job 结果 | 起止（UTC） | job 耗时 | 测试步骤耗时 | tests | pass | fail | cancelled | skipped | 唯一名（权威） | 行级唯一 ✖（R2/R3/R4 口径） | `duration_ms` |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| macOS arm64 | failure（仅测试步骤） | 08:12:22–08:35:03 | 22m41s | 21m24s（`duration_ms`） | 5,825 | 5,702 | **103** | 1 | 19 | **104** | **108** | 1,283,872.76（21m23.9s） |
| macOS x64 | failure（仅测试步骤） | 08:12:21–08:56:31 | 44m10s | 41m41s（`duration_ms`） | 5,825 | 5,700 | **104** | 2 | 19 | **106** | **110** | 2,501,114.80（41m41.1s） |
| Windows x64 | failure（仅测试步骤） | 08:12:21–08:38:52 | 26m31s | 25m21s（`duration_ms`） | 5,825 | 5,689 | **103** | 1 | 32 | **104** | **111**（协调者 110，见 §1.2） | 1,521,073.70（25m21.1s） |

口径说明（与协调者数字的精确对账）：

- **权威唯一名口径**（去缩进/耗时、排除 `✖ failing tests:` section 头）：**104 / 106 / 104**，三平台合并 **116**。与 `ℹ fail` 103 / 104 / 103 的差异分别对应 `ℹ cancelled` 1 / 2 / 1（cancelled 测试无失败名）。
- **协调者「唯一 ✖」108 / 110 / 110**：arm64、x64 精确吻合（108 / 110）；Windows 本地按 R2/R3/R4 既定定义得 **111**，比协调者多 1。原因见 §1.2，属计数口径差异而非失败面差异。
- **文件级条目**：三平台均为 **0**（无 `✖ <file>.test.ts (…ms)`）。
- **超时条目**（`maxDurationMs ≥ 100000`）：arm64 0 / x64 **1** / Windows 0。唯一一条为 `W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 仍负例`（x64-only，max 180,001.96ms，count 2，`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`）。
- **工件完整性**：三份工件均含顶层汇总与最终 `✖ failing tests:` section（`artifactIntegrity` 见 `05-platform-counts.json`）；无 `##[error]The operation was canceled.` 标记；xmark 行数 212 / 216 / 216。
- **job 级结论**：三平台仅 `Full regression tests (bounded; development feedback)` 步骤 failure，`Typecheck` 步骤均 success（`gh run view 43829367008 --json jobs` 只读核对）。
- **耗时变化**：相对 R4，arm64 19m13s→21m24s（1.11×）、x64 34m27s→41m41s（1.21×）、Windows 24m06s→25m21s（1.05×）。x64 仍最慢，且本轮唯一 180s 挂起在 x64。

### 1.1 行级口径定义（逐字沿用 R2/R3/R4）

`lineLevelUniqueIncludingHeaders = uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）+ sectionHeaderLines（所有 `✖ failing tests:` 行出现次数）`。本轮明细见 `24-linelevel-reconciliation.json`：

| 平台 | fail | cancelled | 权威唯一名 | 保留缩进去耗时唯一 | section 头行 | 行级唯一 ✖ | 协调者 | 差 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arm64 | 103 | 1 | 104 | 105 | 3 | **108** | 108 | 0 |
| x64 | 104 | 2 | 106 | 107 | 3 | **110** | 110 | 0 |
| Windows | 103 | 1 | 104 | 106 | 5 | **111** | 110 | **+1** |

### 1.2 Windows 行级 110 vs 111 披露

- Windows 工件共 **5** 个 `✖ failing tests:` 头：2 个嵌入子运行的顶层 section（L2345 `W1b`、L2419 `W19`，均带各自 `ℹ tests 1 / fail 1` 汇总）、1 个最终顶层 section（L7129）、2 个最终嵌套 section（L7279、L7317）。
- 保留缩进唯一名 106 = 权威唯一名 104 + 2（`W1b`、`W19` 各以 indent 0 的嵌入 section 行与 indent 2 的最终叶块出现）。
- 若协调者按「4 个头」或把 `W1b` 的两种缩进合并计算，则得 110。R2/R3/R4 的既定定义（全部头出现次数计入）给出 111；R4 三平台按同一脚本与协调者 195 / 195 / 186 精确吻合。**建议以 104 / 106 / 104 权威名为主口径；行级 Windows 以「110–111 口径差」披露，不影响失败面**。

## 2. 新宇宙与集合对照

| 集合 | 数量 | R5 交集 | 说明 |
| --- | ---: | ---: | --- |
| R5 三平台合并宇宙 | **116** | — | arm64 104 / x64 106 / Windows 104 |
| 上一轮 R4 宇宙 | 188 | **113** | **消失 75、新增 3** |
| B0 冻结全量基线 | 191 | **78** | R4 130 → R5 78；缺失 113 = 61（自 R4 起未复现）+ 52（本轮新绿） |
| B7 全量 | 190 | **78** | R4 130 → R5 78；缺失 112 = 60（自 R4 起未复现）+ 52（本轮新绿） |
| 冻结 known-red 62 | 62 | **33** | 与 R4 逐名相同（33/62 全部仍红） |
| 历史 triage 186 | 186 | **18** | KR 6 / MAC 2 / NEW 10（R4 为 21） |

- 其他统计：`current_not_in_any_baseline_or_triage` = **29**（R4 51）；`mac_only_not_windows_log` = **12**（R4 9）；`windows_only` = **10**（R4 0）；未解析文件 0；无仓库命中但有日志映射 11。
- **B0/B7 缺口完整性**：B0 缺失 113 名、B7 缺失 112 名、R4 消失 75 名中，**0 名出现在三平台任何 skip（`﹣`）行**——消失不是因为被跳过。完整逐名见 `19-b0-b7-closure.tsv` 与 `26-b0-b7-closure-summary.json`。

### 2.1 消失 75 名（R4 有、R5 三平台均未复现）

按 R4 族分解（`15-r4-comparison.json`）：

| R4 族 | 消失数 | 对应批次/来源 | 判定 |
| --- | ---: | --- | --- |
| CI 路径规范形/守卫 | 31 | B3c 已转绿 31/40 | 转绿（macOS 双平台）；Windows 9 名残差另计 |
| e71501c 语义漂移 | 21 | B4 已转绿 21/28 | 转绿 |
| VCA 流程/通道 | 13 | B3b 全部 13 | **完美转绿** |
| source 门测试装配 | 9 | B3a 已合入 8 + `selected` 伪影 | 转绿（残差 14 另计） |
| B0 既有红（其他） | 1 | `required` 伪影 | 伪影消失（非真实转绿） |
| **合计** | **75** | — | 与「89 扣除绿名 − 16 仍红 + 2 伪影」恒等 |

### 2.2 新增/复现 3 名（R4 宇宙外）

| # | 名（缩写） | 平台 | 族 | 集合命中 | 定性 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `W-J5/J15：judge 代批 intent 冻结…` | **x64-only** | hang | 无 B0/B7/KR/triage | R3 同款 180s x64-only 挂起，R4 未复现，R5 复现（180,001.96ms，count 2）——runner 性能/泄漏候选 |
| 2 | `W1b 真实无退修选项：chief退修释放原request_choice…` | **Windows-only** | 未归类 | triage **MAC** | 全新失败名（R3/R4 无）；最终 section 真实失败（waitFor 5.87s：`Real chief loop did not settle: shown=[] requests=1`，幕僚要求修订回执未获批准后同 flow 新卡未独立决定）——待定性 |
| 3 | `W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒` | **x64-only** | drift | triage **NEW** | R3 有、R4 未复现、R5 x64 复现；B5 本机 3× 绿（1.72–1.76s）——平台/性能候选 |

### 2.3 平台矩阵（116）

| 组合 | 数量 | 名 |
| --- | ---: | --- |
| arm64+x64+win | 94 | 其余全部 |
| **Windows-only** | **10** | 9 个 B3c Windows 残差（见 §3.2）+ W1b |
| **macOS 双平台（不含 Windows）** | **10** | W29×3、W30×2、W34、W35、`D3 lstat ENOTDIR…`、`Git final spawn fence…`、`Q2 P2 first new project…` |
| **x64-only** | **2** | W-J5、W36 |

- macOS 独有合计 12（10 + 2）；x64 比 arm64 多 2（W-J5、W36）；Windows 独有 10。`16-platform-diff.tsv` 与 `27-platform-matrix.tsv` 为逐名清单。

### 2.4 B0/B7 缺口闭合

- B0 191：R5 命中 **78**；缺失 **113** = 61（R4 已缺失并逐名核实为活测试/活文件、0 skip）+ **52**（R4 仍红、R5 三平台转绿）。
- B7 190：R5 命中 **78**；缺失 **112** = 60 + **同一批 52 名**。
- B0∩B7（189 名）在 R5 命中 **78**；B0-only 2 名、B7-only 1 名在 R5 均未出现。
- 判定口径沿用 R4：**本轮 CI 非红（未复现），不作永久转绿**；B7 重冻结时按 REMOVED / 未复现登记。

## 3. 分族重算（互斥分族，规则口径合计 116）

| 族 | R5 数量 | 平台分布（arm64/x64/win） | R4 数量 | 变化 | 代表文件（计数） |
| --- | ---: | --- | ---: | --- | --- |
| 冻结 known-red 62 | **33** | 33/33/33 | 33 | 不变（逐名相同） | trunk-upgrade-validation 5、trio-worker-report 3、section1-write-preauthorization 2、appointment-roster 2 |
| 未归类 | **22** | 12/12/20 | 12 | **+10** | B3c Windows 残差 9（语义修正后归 ci-path）+ **W1b 1**（全新）；原 12 名（sidecar 6、git-command 3、trunk-store 1、run-role 1、D3 ENOTDIR 1）逐名不变 |
| B0 既有红（其他） | **17** | 17/17/17 | 18 | **−1**（`required` 伪影消失） | h-scope-audit 3、t1-pipeline-integration 3、trunk-stable-write-integration 2、git-role-workflows-e2e 2 |
| flake 时序族 | **16** | 16/16/16 | 16 | 不变（B5 分支未合入） | session-rebuild-race 3、network-state-e2e 3、f2-claim-release 2、e-handler 1… |
| source 门测试装配族 | **14** | 14/14/14 | 23 | **−9**（B3a 合入 8 + `selected` 伪影） | run-pin 10、run-change-trigger 2、i-full-chain 2 |
| e71501c 语义漂移族 | **10** | 9/10/2 | 30 | **−20**（B4 绿 21、W36 复现 +1） | W19、W29×3、W30×2、W33、W34、W35、W36 |
| 挂起/超时族 | **3** | 2/3/2 | 2 | **+1**（W-J5 x64 复现） | `关闭全部…`、`C-04…`（~10s 有界）、W-J5（180s） |
| CI 路径规范形/守卫族 | **1** | 1/1/0 | 41 | **−40**（B3c 绿 31 + 9 名 Windows 残差语义上仍属本族，见下） | Q2 P2（mac-only，产品候选） |
| VCA 流程/通道族 | **0** | 0/0/0 | 13 | **−13（归零）** | — |
| macOS git-config 平台族 | **0** | 0/0/0 | 0 | 仍为 0 | — |
| **合计** | **116** | 104/106/104 | **188** | **−72** | — |

补充（规则语义滞后，阅读时按语义修正）：

1. **9 名 B3c Windows-only 残差被规则归入未归类**：`assign-families.mjs` 只读 `10-block-codes.json` 的 **macOS arm64** 块码；这 9 名在 R5 仅 Windows 红，macOS 块码为空，故未命中 `git-file-final-guard-unproven → ci-path-canonical`。其 Windows 块码全部为 `git-file-final-guard-unproven` + `ERR_ASSERTION` + `Actual file/edit handlers do not carry the current canonical metadata roots and link guard`（与 R4 三平台完全同码）。逐名修正见 `25-family-semantic-corrections.tsv`。**语义修正后：ci-path 10 / 未归类 13 / 其余不变。**
2. **W1b 是真正的未归类新名**（Windows-only，块码仅 `ERR_ASSERTION`），不是规则滞后。
3. **`selected` / `required` 两个裸伪影在 R5 均消失**：R4 的族归属伪影（`selected` → source-gate、`required` → B0 其他）不再出现，本轮 source-gate 与 B0 其他各 −1 均由此解释，**不是真实转绿**。
4. `关闭全部…` / `C-04…` 仍按冻结 `HANG_NAMES` 归挂起族，实际是 ~10s 有界失败；本轮 W-J5 是唯一真 ≥100s 条目。

### 3.1 macOS git-config 族：0 残留确认（连续第四轮）

- 三份工件 grep `git-config-executable-or-unsupported|git-initialization-effects-pending|git-config-section-unsupported|git-config-value-invalid`：**0 / 0 / 0**。
- 块级错误码归因（macOS 104/106 块、Windows 104 块）：无任何 git-config 错误码。分族结果 `macos-git-config = 0`。B2 修复持续有效。

### 3.2 VCA 归零与 B3a/B3b/B3c/B4 投影吻合性（对 R4 投影逐批核对）

| 批次（已合入） | R4 投影绿名 | R5 实际转绿 | 仍红 | 吻合性 |
| --- | ---: | ---: | ---: | --- |
| B3a（#111，仅 8 名转绿部分） | 8 | **8** | 0 | **完全吻合** |
| B3b（#112，VCA 全部） | 13 | **13** | 0 | **完全吻合；VCA 族归零** |
| B3c（#113，ci-path） | 40 | **31** | **9** | **不吻合**：9 名 Windows-only 仍红（macOS 双平台已绿） |
| B4（#114，drift） | 28（R4 实匹配） | **21** | **7** | **不吻合**：R4 预警 6 名 + **W34 额外 1 名**（均 macOS-only） |
| **合计** | **89** | **73** | **16** | — |

**9 名 B3c Windows-only 残差**（全部 Windows 最终 section 真实失败，块码与 R4 相同）：

1. `AC-1/AC-6/AC-7/P1.2-AC-28 Claude actor：多 active 会话…`（`git-action-cross-runtime-init.test.ts`）
2. `AC-16 集成：sidecar 写入失败 ⇒ git-action-audit-unavailable…`（`git-action-cross-runtime-audit-failure.test.ts`）
3. `AC-2 Pi actor：受保护 + 角色 ACL 内 git_candidate init…`（`git-action-cross-runtime-pi-init.test.ts`）
4. `P1.2-AC-27 Codex actor：native 事实不可用仍可 init…`（`git-action-cross-runtime-codex-init.test.ts`）
5. `gate active-tool：真实 Core 会话 + host inventory ⇒ ok…`（`git-action-authorization-gate.test.ts`）
6. `gate H13：真实边界未撤销的 prepared 条目…`（同上）
7. `gate host-continuation：真正 settled（disposed+drain）的 rapporteur…`（同上）
8. `host-continuation：真实 rapporteur 回合结束并 dispose…`（`run-stop-host-continuation-integration.test.ts`）
9. `Q16 取代 P1.3-B1-AC-26：受保护 + 真实 Codex shell 会话…`（`session-admission-approval-q9-integration.test.ts`）

定性：B3c 本机证据为 **Windows junction/plain** 3× 绿，但 **Windows CI 仍原样失败**；macOS CI 反而已绿。失败体与 R4 三平台完全相同，说明 B3c 的 canonical root/guard 夹具修复未覆盖 **CI Windows 工作目录形态**（`D:\a\ans-studio\ans-studio`）或与 CI Windows 环境存在差异。这不是新语义，是 **B3c 的 Windows CI 覆盖缺口**，需要 B3c owner 重开/跟进。

**7 名 B4 macOS-only 残差**（Windows 全部已绿）：

| 名 | R4 macOS | R5 平台 | B4 处置 | 判定 |
| --- | --- | --- | --- | --- |
| W29 `document-change` | 红 | arm64+x64 | no-change | R4 预警复发（连续 3 轮 macOS 红） |
| W29 `document-change-source-loss` | 红 | arm64+x64 | no-change | 同上 |
| W29 `document-change-wrong-flow` | 红 | arm64+x64 | no-change | 同上 |
| W30 `连续写入后` | 红 | arm64+x64 | no-change | 同上 |
| W30 `真实重启迁移后` | 红 | arm64+x64 | no-change | 同上 |
| W35 `缺team仍可真实Chief报告派人事准备…` | 红 | arm64+x64 | no-change | 同上 |
| **W34** `真实首文档发布与原创建者关闭后派团队规划保独立scope` | 红（三平台） | arm64+x64 | **已按新语义更新** | **未在 R4 预警内**：Windows 转绿、macOS 仍红 ⇒ B4 期望更新对 macOS 不足 |

### 3.3 挂起/超时与平台静默

- 测试级超时（`maxDurationMs ≥ 100000`）：x64 **1** 条（W-J5 180,001.96ms），arm64/Windows 0。
- 两个历史有界 hang 仍红但为 ~10s 有界失败（`关闭全部…` 与 `C-04…`，三平台）；B5 已在本机定性并收口（B5 分支未合入，见 §5）。
- 三平台均无静默/CANCEL 标记；Windows 预算问题持续解除（26m31s job）。
- x64 cancelled 2（arm64/Windows 各 1），与 x64 独有的 180s W-J5 同平台；不改变权威唯一名与 `ℹ fail` 的差额解释（fail 104 + cancelled 2 = 106）。

### 3.4 arm64 与 x64 对比

- 唯一名集合差异 **2**（x64-only：W-J5、W36）；arm64-only 0。
- 计数差异：fail 103→104、cancelled 1→2、pass 5,702→5,700；skipped 相同 19。
- 耗时：arm64 21m24s vs x64 41m41s（1.95×，R4 为 1.79×）。x64 性能面继续显著慢于 arm64，且唯一 180s 挂起在 x64。

## 4. 与 R4 批次投影（99）的偏差逐条

> 口径：R4 投影 99 = R4 188 − B3a 8 − B3b 13 − B3c 40 − B4 28（B4 的 30 名中 W36、application-line 在 R4 不存在）。R5 为五批合入后的首个真实 CI。

| 项 | 数量 | 说明 |
| --- | ---: | --- |
| R4 投影剩余 | **99** | — |
| R5 实际宇宙 | **116** | **偏差 +17** |
| 其中：R4 投影内仍红 | 97 | 符合投影 |
| 其中：R4 投影内已绿（好于投影） | **−2** | `selected`、`required` 两个裸伪影消失 |
| 其中：批次绿名仍红（差于投影） | **+16** | B3c 9（Windows-only）+ B4 7（macOS-only） |
| 其中：R4 宇宙外新增/复现 | **+3** | W-J5（x64）、W1b（Windows，全新）、W36（x64） |
| 恒等 | — | 99 − 2 + 16 + 3 = **116** |

逐条偏差（逐名见 `20-r4-projection-vs-r5.json` / `21-r4-projection-deviations.tsv`）：

1. **B3c 9 名 Windows-only 残差（+9）**：见 §3.2。R5 macOS 双平台已绿，Windows CI 仍红；与 B3c 本机 Windows 3× 绿矛盾，需 Windows CI 定向复跑/重开。
2. **B4 7 名 macOS-only 残差（+7）**：R4 已预警的 6 名（W29×3、W30×2、W35）全部复发（风险从「预计 +6 → 105」实际兑现）；额外 **W34** 在 B4 已更新期望后 macOS 仍红（Windows 绿）。R4 风险清单由此修正为 7 名。
3. **W-J5 x64-only 180s 复现（+1）**：R3 同款、R4 未复现；本轮 maxDurationMs=180,001.96、count=2，且 x64 总耗时 41m41s。倾向 runner 负载/性能 flake，但需要下一轮观察是否稳定复现。
4. **W1b Windows-only 全新（+1）**：R3/R4 无此名；最终 section 真实失败（父测试 waitFor 5.87s 未等到独立决定卡），嵌入子运行输出中另有重复；triage 历史标签 MAC。需 3× 定性（Windows 定向）。
5. **W36 x64-only 复现（+1）**：R3 有、R4 无、R5 x64 复现；B5 本机 Windows 3× 绿（1.72–1.76s），倾向平台/性能候选。
6. **`selected` / `required` 伪影转绿（−2）**：两者本就是族归属伪影（裸名经 `repoFiles[0]` 误挂），R5 不再出现；不计为真实修复。

**族偏差（R4 投影族计数 → R5 实际，规则口径）**：

| 族 | R4 投影 | R5 实际 | 偏差 | 解释 |
| --- | ---: | ---: | ---: | --- |
| known-red | 33 | 33 | 0 | 逐名不变 |
| B0 其他 | 18 | 17 | −1 | `required` 伪影 |
| flake | 16 | 16 | 0 | B5 未合入 |
| source-gate | 15 | 14 | −1 | `selected` 伪影 |
| 未归类 | 12 | 22 | +10 | 9 B3c Windows 残差（规则滞后）+ W1b |
| drift | 2 | 10 | +8 | B4 7 名复发 + W36 复现 |
| hang | 2 | 3 | +1 | W-J5 复现 |
| ci-path | 1 | 1 | 0 | Q2 P2 保持 |
| VCA | 0 | 0 | 0 | 归零 |
| **合计** | **99** | **116** | **+17** | — |

## 5. 在跑批次并入后的预计剩余（B5 / B6a / B6b / B3a 残差 / W19）

> 口径：以 **R5 实际宇宙 116** 为基线，扣除各批记录/在跑状态中的转绿名。**批次分支均未合入 R5 CI**，投影仅用于规划。B6a/B6b 截至本记录尚无批次证据（工作树 clean），按「全部转绿」假设；每未完成 1 名 +1。

### 5.1 逐批扣除

| 批次 | 状态（截至 2026-11-16 晚） | 扣除 | 匹配 R5 | 说明 |
| --- | --- | ---: | ---: | --- |
| B3a 残差（`b3ar`） | 记录完成、未提交 | **14** | 14 | 裁定「按当前有意语义更新期望」；run-pin 10 / run-change 2 / i-full-chain 2 本机 3× 全绿；`selected` 伪影 R5 已无；typecheck EXIT=0 |
| B5（`b5new`） | 记录完成、未提交 | **16** | 16 | 14 个 flake 名 + 2 个有界 hang（`关闭全部`、`C-04` 旧名退役）；task-restart 1 名保持红（产品/夹具候选）；f-handler F3 移交 B6b |
| B6a（`b6a`） | **未开始（工作树 clean）** | 12 | 12 | R4 未归类 12 名（R5 全部仍红；sidecar 6 / git-command 3 / trunk-store 1 / run-role 1 / D3 ENOTDIR 1）；假设全绿 |
| B6b（`b6b`） | **未开始（工作树 clean）** | 18 | 18 | R5 B0 其他 17（`required` 已绿）+ B5 移交 f-handler F3 = 18 名 / 11 文件；假设全绿 |
| W19（`w19`） | 产品修复完成、未提交 | **1** | 1 | W19 定向 5× 绿；W33 消费侧阻断保持红（3× 红） |
| 合计 | — | **61** | 61 | — |

### 5.2 预计剩余 55 名

116 − 61 = **55**：

| 族 | 预计剩余 | 名 |
| --- | ---: | --- |
| known-red-62 | **33** | 冻结基线（B7 重冻结） |
| 未归类（语义修正后） | **10** | 9 个 B3c Windows 残差 + W1b |
| e71501c-drift | **9** | W29×3、W30×2、W33、W34、W35、W36 |
| flake-timing | **1** | task-restart（产品/夹具候选） |
| hang-timeout | **1** | W-J5（x64 180s） |
| ci-path-canonical | **1** | Q2 P2（macOS-only 产品候选） |
| **合计** | **55** | — |

**分批场景**：

- **仅合并已就绪批次**（B3a 残差 14 + B5 16 + W19 1）：116 − 31 = **85 名**。
- **再加 B6a**：73；**再加 B6b**：**55**。
- **W19 合并风险**：`test/编排/direct-role-capabilities.test.ts` 仍有 3 个旧语义用例（`:63` `noticeRecipients` 必须为空；`:711-717` 两个 missingSink 用例），w19 记录实测修复后 **新增 3 红**（该文件基线 46 pass / 1 pre-existing fail）。若不同步更新，投影 **+3 → 58**（ready-only 场景 85 → 88）。该文件不在 w19 允许写入范围，需 owner/测试角色同步。
- **B6 假设风险**：B6a/B6b 尚未产生证据；若各未完成 N 名，则在 55 上 +N。

### 5.3 B5/B6 范围与偏差并入建议

- **B5 收口确认**：16/18 绿；task-restart 1 名产品/夹具候选（v2.0.0 来源门要求 runId+flowId+run record，restore 的裸 legacy 任务被 drain 移除且二次 restore 再入队——需 owner 裁定 restore 策略或改用 run-bound 夹具）；f-handler F3 移交 B6b。B5 还顺带定性：Q2 P2 实际文件为 `test/测试/git-role-workflows-e2e.test.ts`（非 `git-action-delivery-claude-e2e.test.ts`），本机 Windows 3× 绿；W36/W29-missing 本机 3× 绿。
- **B6a 不变**：12 名 / 5 文件（sidecar 契约 6、git-command 3、trunk-store 1、run-role 1、D3 ENOTDIR 1）；R5 三平台仍红。D3 ENOTDIR / spawn fence 为 macOS-only，Windows 侧不可验证。
- **B6b 组成更新**：18 名 / 11 文件 = R5 B0 其他 17 + f-handler F3 1。注意 f-handler 文件内有两个不同失败名：F7（B0 其他）与 F3（B5 移交），B6b 需一并处理/复用 e-handler 两层结论。
- **B3c/B4 残差不并入 B6**：9 名 B3c Windows 残差与 7 名 B4 macOS 残差需要各自 owner 重开（见 §6），不属 B5/B6 的「flake/未归类/B0 其他」范围；若强行并入 B6 会混淆产品/平台归因。

## 6. B7/收口建议与 owner 裁决项

### 6.1 建议编排

1. **R6 CI**：合并 **B3a 残差 + B5 + W19**（W19 必须同时更新 `direct-role-capabilities.test.ts` 3 个旧语义用例或由 owner 明确接受 +3 红）→ 验证预计剩余 85（或 88）。若 B6a/B6b 完成，一并合入 → 验证 55。
2. **B3c 跟进（新小批）**：9 名 Windows-only 残差按 B3c 同类定性（Windows CI `D:\a\...` 根形态/junction 语义），在本机复现 CI 形态后修夹具或产品；不要只用 Windows 本机 3× 绿作为关闭依据。
3. **B4 跟进/裁定**：7 名 macOS-only 残差（6 no-change + W34）在无 macOS 本机环境的条件下只能通过下一轮 macOS CI 观察；owner 先裁定「B4 期望是否按 macOS 再更新」或产品修复。若继续 no-change，则 B7 冻结时登记为 macOS 平台已知红。
4. **B7 重冻结**：在 R6（最好含 B3c/B4 跟进）之后执行；known-red 33 继续冻结；B0/B7 缺口按 REMOVED/未复现登记（B0 113 / B7 112 未在 R5 出现，其中 52 名为本轮新绿）；把剩余 22 名非 known-red 分类为 `desktop-known-red`（确定性）与 flake/平台候选两套。
5. **test-ci force-exit / step timeout（`cife`，小 PR）**：属 workflow 止血，不影响宇宙计数；建议 owner 决定是否在 R6 前合入，以减少偶发挂起对预算的影响（本轮 W-J5 180s 在 300s 上限内自然结束）。

### 6.2 owner 裁决项

| # | 项 | 证据 | 需裁决 | 建议 |
| ---: | --- | --- | --- | --- |
| 1 | **W33 消费侧跨 run** | w19：close 通知已入队，`classifyClosedTaskNotice` 返回 `closed-task-notice-unproven`；跨 run 例外只认 legacy `document-preparation`，hub 为 `builtin-preparation`/`hubRouting`/`builtinPreparationSource` | `apply-journal.ts` 扩展 hub 跨 run 例外（同等 provenance）vs 更新 W33 期望 | 若语义上 hub 准备是同 flow 合法链路，优先扩展消费侧（产品修复）；否则更新期望 |
| 2 | **W19 随带测试更新** | w19 §4：`direct-role-capabilities.test.ts` 3 个旧语义用例（:63、:711-717） | 授权测试角色按新 close-notify 语义更新 | 与 W19 同 PR 更新，避免 +3 红 |
| 3 | **B3c Windows 残差 9 名** | §3.2：Windows CI 同码复发、macOS 绿 | 重开 B3c（Windows CI 形态）| 按 B3c 同类定性；不关闭 B3c 直到 Windows CI 复跑绿 |
| 4 | **B4 macOS 残差 7 名** | §3.2：6 名 no-change 连续复发 + W34 更新后仍红 | 产品修复 vs 按 macOS 更新期望 | 先下一轮 macOS CI 确认；W34 单独回看 B4 diff 是否漏 macOS 分支 |
| 5 | **task-restart** | B5 §1.8：restore 重新入队裸 legacy 任务 → v2.0.0 来源门 fail-closed 移除；二次 restore 再入队 | restore 对不可投递条目的保留/提前拒绝策略，或 run-bound 夹具 | owner 裁定产品策略；测试侧可改为 v2.0.0 真实 run-bound 任务（更大改动） |
| 6 | **Q2 P2（macOS-only）** | B3c/B5：本机 Windows 3× 绿；CI macOS `file-gate-host-facts-unproven` | 产品 host facts/protection 修复 vs macOS 定向复跑定性 | 下一轮 macOS CI 观察；不阻塞 B5/B6 |
| 7 | **W1b（Windows-only 新名）** | §2.2：最终 section 真实失败；triage MAC | Windows 定向 3× 定性（产品诘问 vs Windows 时序） | 在 B7 前定性；若 flake 则登记平台候选 |
| 8 | **W36 / W-J5（x64-only）** | B5：W36 本机 3× 绿；W-J5 R3 同款 180s | 是否做 x64 性能/泄漏专项，或仅下一轮观察 | 观测为主，暂不排修；R6 后复核 |
| 9 | **hub flowId（B3a 残差）** | b3ar 裁定：hub 派发必须带 flowId、handoff 提前 pin 已删除、worker 执行走 trunk preflight 冻结 | **已闭环**：按当前有意语义更新期望 | 不再作为产品候选；随 B3a 残差合并 |
| 10 | **test-ci force-exit** | B1b/B3b/B3c/B5 多次提出 | 是否改 `test-ci.yml` | 小 PR 由 owner 决定 |

## 7. 证据边界与披露

1. **工件为准**：三平台分析全部基于上传工件；运行元数据（run SHA/结论/步骤/起止时间）经 `gh run view 43829367008` 只读核对。三份工件均含顶层汇总与最终 failing section，无 CANCEL 标记。
2. **单轮样本**：W36、W-J5、W1b、Q2 P2、9 名 B3c Windows 残差均为单轮观测；W36/W-J5 有 R2/R3 历史同类证据，W1b 为首次出现。单轮不判稳定转绿/转红，R6 必须复核。
3. **B4 的 macOS 残差已非单轮**：W29×3、W30×2、W35 在 R3/R4/R5 连续 macOS 红；W34 在 R4/R5 连续 macOS 红（Windows 已绿）。R4 投影的 +6 风险实际兑现，且 +1（W34）。
4. **B3c 的 macOS/Windows 反转**：B3c 本机证据为 Windows junction/plain 3× 绿，但 R5 CI 结果相反（macOS 绿、Windows 红，且失败体与 R4 完全同码）。本记录只报告，不推断 B3c 修复无效——需要 Windows CI 形态复现后再定性。
5. **分族规则语义滞后**：① 9 名 B3c Windows 残差因 `assign-families` 只读 macOS 块码落入未归类（`25-family-semantic-corrections.tsv` 逐名修正为 ci-path）；② `selected`/`required` 伪影已消失；③ `HANG_NAMES` 两名实际为 10s 有界失败；④ 新 W1b 未归类。规则本体按「逐字沿用」未改。
6. **行级口径**：Windows `unique ✖` 协调者 110 vs 本地 111，差值来自 section 头计数（2 个嵌入子运行顶层 section + 1 个最终顶层 + 2 个最终嵌套；`W1b`/`W19` 各以两种缩进出现）。权威唯一名 104 不受影响；详见 §1.2 与 `24-linelevel-reconciliation.json`。
7. **B0/B7 缺口的边界**：R5 缺失 113/112 名中 0 名出现在 skip 行；但 CI 环境与 B0/B7 的 15 段 Windows 本机基线、动态命名/重命名仍可能有差异。仅判「本轮 CI 非红」，永久转绿由 B7 重冻结裁定。
8. **批次投影的假设性**：B3a 残差/B5/W19 有记录级证据（b3ar/b5new/w19 工作树，只读引用），但均未合入 R5 CI；B6a/B6b 截至本记录 **未开始（工作树 clean）**，按全部转绿假设。W19 的 +3 旧语义冲突为实测风险。投影不替代 R6 CI。
9. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境），平台结论均来自 CI 工件。
10. **只读引用其他工作树**：`b3ar`（B3a 残差记录）、`b5new`（B5 记录）、`w19`（W19/W33 记录）为只读引用，未修改其分支；`b6a`/`b6b`/`cife` 经 `git status`/`git log` 只读确认无批次改动。

## 8. 未决问题（更新）

1. **W33**：消费侧跨 run hub 例外是否扩展（`apply-journal.ts`）？W33 在 R5 三平台仍红。
2. **W19**：`direct-role-capabilities.test.ts` 3 个旧语义用例是否随 W19 同步更新？（否则 +3 红）
3. **B3c Windows 9 名**：为何本机 Windows 3× 绿而 Windows CI 同码红？需要 CI 形态复现（`D:\a\...` 根、junction/plain）。
4. **B4 macOS 7 名**：6 名 no-change 是否接受为 macOS 平台已知红？W34 的期望更新为何未覆盖 macOS？
5. **task-restart**：restore 对不可投递 legacy 条目的保留/拒绝策略？是否改用 run-bound 夹具？
6. **Q2 P2**：macOS-only `file-gate-host-facts-unproven` 是产品还是 runner 环境？需 macOS 定向复跑。
7. **W1b**：Windows-only 新名是产品诘问还是 Windows 时序 flake？需 3× 定性。
8. **W36 / W-J5**：x64 性能/泄漏专项还是继续观测？
9. **B6a/B6b 启动与完成时间**：B7 重冻结前必须完成或明确移出。
10. **B7 重冻结口径**：known-red 33 冻结；B0/B7 缺口 REMOVED/未复现登记；剩余 22 名非 known-red 如何分套（desktop-known-red 确定性 vs flake/平台候选）。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` | R4 脚本适配：run 43829367008、工件根 `/tmp/r8-art`；三平台唯一名/行级/超时/工件完整性 |
| `attribute-blocks.mjs` | R4 原件：三平台最终 section 逐块错误码归因 |
| `classify-failures.mjs` | R4 原件：与 B0 191 / B7 190 / known-red 62 / triage 186 合并去重 |
| `assign-families.mjs` | 逐字沿用 R2/R3/R4；互斥分族（注意 macOS 块码口径） |
| `summarize-r5.mjs` | 由 `01` 派生三平台计数与超时事实 |
| `compare-r4.mjs` | R5 116 vs R4 188 / B0 / B7、平台差异、B0/B7 缺口 |
| `compare-r4-projection.mjs` | R5 实际 vs R4 投影 99 逐名偏差与逐批存活 |
| `project-batches-r5.mjs` | 批次投影：B3a 残差/B5/B6a/B6b/W19 扣除，预计剩余 55 与风险 |
| `01-ci-failures.json` | 三平台完整提取（汇总、唯一名、超时、failing section、行级计数、工件完整性） |
| `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt` / `04-failnames-windows-x64.txt` | 逐平台唯一失败名 + 文件（104 / 106 / 104） |
| `05-platform-counts.json` | 三平台计数速览（job、汇总、唯一名、行级、超时、工件完整性） |
| `06-merged-universe.json` | 116 名并集：平台出现、日志/仓库文件映射、集合命中、首个错误行 |
| `07-by-file.tsv` | 按测试文件分组的失败名清单 |
| `08-set-summary.json` | 集合交集与平台独有统计（B0/B7/KR/triage、mac-only 12、windows-only 10） |
| `10-block-codes.json` | 逐名块级错误码（arm64 104 / x64 106 / Windows 104 块） |
| `11-families.json` | 互斥分族全量（规则口径） |
| `12-family-summary.tsv` | 族汇总（族/数量/top 文件） |
| `14-timeouts-and-stall.json` | 超时条目（x64 W-J5 1 条 180s）与完整覆盖事实 |
| `15-r4-comparison.json` | R4 188 vs R5 116：交集 113 / 消失 75 / 新增 3、逐族增减、逐名详情 |
| `16-platform-diff.tsv` | 平台差异清单（arm64/x64/win、时间线、R4→R5 平台变化） |
| `17-windows-coverage.tsv` | Windows 104 名全量对照（macOS 重叠、R4 Windows 命中、族、错误首行） |
| `19-b0-b7-closure.tsv` | B0 113 / B7 112 名缺口逐名现状（含 R4 是否出现过） |
| `20-r4-projection-vs-r5.json` | R4 投影 99 vs R5 116：97 仍红 / 2 已绿 / 16 批次残差 / 3 新增；逐批存活 |
| `21-r4-projection-deviations.tsv` | 逐名偏差（kind/batch/family） |
| `22-batch-projection-r5.json` | 批次投影详情（61 扣除、预计剩余 55、假设与风险） |
| `23-projected-remaining.tsv` | 预计剩余 55 名逐名（族/平台/裁决类别） |
| `24-linelevel-reconciliation.json` | 行级口径对账（108/110/111）与 Windows +1 披露 |
| `25-family-semantic-corrections.tsv` | 9 名 B3c Windows 残差从未归类修正为 ci-path（Windows 块码依据） |
| `26-b0-b7-closure-summary.json` | B0/B7 命中/缺口/新绿 52 名汇总 |
| `27-platform-matrix.tsv` | 116 名平台组合矩阵（94/10/10/2） |

## 附录 B：复现命令

```bash
# 数据源：三平台工件（原始工件只放 /tmp，不入库）
# /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log
# /tmp/r8-art/test-logs-mac-x64/test-ci-output.log
# /tmp/r8-art/test-logs-win-x64/test-ci-output.log

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence
R4=角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence
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
node $EV/summarize-r5.mjs --ci $EV/01-ci-failures.json --outdir $EV
node $EV/classify-failures.mjs --ci $EV/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt \
  --kr-dir $B7/knownred --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md \
  --tests-root test --outdir $EV
node $EV/assign-families.mjs --universe $EV/06-merged-universe.json --blocks $EV/10-block-codes.json --outdir $EV
node $EV/compare-r4.mjs --r4 $R4/06-merged-universe.json --r5 $EV/06-merged-universe.json \
  --r4-families $R4/11-families.json --r5-families $EV/11-families.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt --outdir $EV
node $EV/compare-r4-projection.mjs --r4-universe $R4/06-merged-universe.json \
  --r5-universe $EV/06-merged-universe.json --r4-projection $R4/20-batch-projection.json \
  --r4-families $R4/11-families.json --r5-families $EV/11-families.json --outdir $EV
node $EV/project-batches-r5.mjs --universe $EV/06-merged-universe.json --families $EV/11-families.json \
  --r4-families $R4/11-families.json --r4-projection $R4/20-batch-projection.json \
  --b3a-dispositions ../b3ar/角色卡/测试/docs/change/2026-11-16_test-debt-b3a-residual_evidence/dispositions.tsv \
  --outdir $EV
```

## 附录 C：关键结论速览

- 三平台完整跑完：**fail 103 / 104 / 103**，权威唯一名 **104 / 106 / 104**，合并宇宙 **116**；行级 ✖ 108 / 110 / 111（Windows 与协调者 110 差 1，口径披露）；x64 **1 条 180s**（W-J5）。
- 新宇宙 vs R4 188：**交集 113 / 消失 75 / 新增 3**；消失全部为批次绿名（73）+ 两个伪影（2），无未解释消失；新增为 W-J5、W1b、W36。
- **VCA 归零 13→0**；B3a 8/8、B3b 13/13 完美；**B3c 31/40（9 名 Windows-only 残差）**；**B4 21/28（7 名 macOS-only 残差，含 W34）**。
- R4 投影 99 → 实际 116：**−2 伪影 +16 批次残差 +3 新增**。
- 批次投影：B3a 残差 14 + B5 16 + B6a 12 + B6b 18 + W19 1 后 **预计剩余 55**（known-red 33 / B3c 9 / B4 7 / W33 / W36 / W-J5 / W1b / task-restart / Q2 P2）；仅已就绪批次后 85；W19 未同步旧语义测试风险 +3。
- 平台分化：Windows-only 10、macOS-only 12、x64-only 2；known-red 33 与 git-config 0 持续稳定；B0/B7 ∩ R5=78，52 名本轮新绿、0 名 skip。

## 附录 D：批次合并后预计剩余 55 名中的非 known-red 22 名（owner 裁决视角）

> known-red 33 名继续冻结（B7 重冻结处理）；以下 22 名为 55 − 33。完整机读见 `23-projected-remaining.tsv`。

| 类别 | 数量 | 名（缩写） |
| --- | ---: | --- |
| B3c Windows-only 残差 | 9 | AC-1/AC-6/AC-7/P1.2-AC-28 Claude actor、AC-16 sidecar 写入失败、AC-2 Pi actor、P1.2-AC-27 Codex actor、gate active-tool、gate H13、gate host-continuation、host-continuation（run-stop）、Q16（session-admission） |
| B4 macOS-only 残差 | 7 | W29 `document-change` / `document-change-source-loss` / `document-change-wrong-flow`、W30 `连续写入后` / `真实重启迁移后`、W34、W35 |
| W33（消费侧跨 run） | 1 | `W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续` |
| W36（x64-only 复现） | 1 | `W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒` |
| W-J5（x64-only 180s） | 1 | `W-J5/J15：judge 代批 intent 冻结…` |
| W1b（Windows-only 新名） | 1 | `W1b 真实无退修选项…` |
| task-restart（产品/夹具候选） | 1 | `重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过` |
| Q2 P2（macOS-only 产品候选） | 1 | `Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards` |
| **合计** | **22** | — |
