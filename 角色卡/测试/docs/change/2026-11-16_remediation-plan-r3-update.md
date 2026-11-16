# R3：第二轮三平台测试 CI 结果重归因与计划偏差更新

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/analysis-test-debt-r3`（分支 `analysis/test-debt-r3`，起点 `b522e0e` = `origin/main`，含 B1 `b581680` / B2 `b522e0e` 合并）
- 范围：**只分析、只写本文件与同名 `_r3-evidence/` 证据**。未修改任何代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 workflow；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：GitHub Actions run **43793243595**（`test-ci`，`workflow_dispatch` on `main @ b522e0e1260ca3602cba8bcf8d8050140da0ae66`，2026-11-16T02:36:53Z 创建；attempt 1）：
  - macOS arm64 `133056200435`（failure，02:36:56Z–02:55:47Z）
  - macOS x64 `133056200344`（failure，02:36:57Z–03:30:17Z）
  - Windows x64 `133056200177`（**cancelled**，02:36:58Z–04:37:12Z，job `timeout-minutes: 120`）
- CI 命令（`.github/workflows/test-ci.yml`，与 R2 相同）：`node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`（工作树内 629 个 `.test.ts`；workflow 注释仍写 627，本轮不改 workflow）；Node 24.14.0；三平台 typecheck 均 success。
- 方法：沿用 R2 脚本集（`extract-ci-failures.mjs` / `attribute-blocks.mjs` / `classify-failures.mjs` / `assign-families.mjs`，仅更新数据源常量与注释）；分族规则**逐字沿用 R2**（known-red 优先 → 挂起 → e71501c 漂移 → macOS git-config → CI 路径/守卫 → source 门 → VCA → flake → B0 其他 → 未归类）。
- 原始大日志：`/tmp/ci-logs2/{arm64,x64,windows}.log` 与三平台工件解包 `/tmp/ci-logs2/artifact-{mac-arm64,mac-x64,win}/test-ci-output.log`。**原始日志不入库**。

## 0. 摘要

1. **新宇宙 194 名**（arm64 189 / x64 192 / Windows 取消前 22）。R3 宇宙是 R2 289 名的**真子集：交集 194、新增 0、消失 95**（94 名 macOS git-config 族 + 1 名 x64-only 路径 B 断言 `路径 B：B3 accepted…`）。
2. **macOS git-config 113 族清零确认**：三平台日志与工件中 `git-config-executable-or-unsupported` / `git-initialization-effects-pending` / `git-config-section-unsupported` / `git-config-value-invalid` 命中均为 **0**。原 113 名中 **94 名完全转绿消失**，**19 名仍红但错误面已变**：guard 6、未归类 10、x64-only 超时 2、B0 其他 1（详见 §3.1）。
3. **B1 修复生效于两个旧挂起**：`关闭全部与双角色刷新扫描交接…` 与 `C-04 decision 开关开启…` 由 R2 的 300s 超时降为 **~10s 有界快速失败**（B1 加的 10s deadline 生效）。但 **x64 新增 2 个真超时**：`AC-4 Claude convener git_publish delivery…`（300s，全局 timeout）与 `W-J5/J15 judge 代批…`（180s，测试自带 timeout），二者 arm64 均已通过，**x64-only**。
4. **Windows 静默点迁移**：B1 修过的 `git-role-workflows-e2e.test.ts` 本轮未在 Windows 到达；最后一条测试输出为 **02:44:58.603Z**（`test/桌面应用/chief-workflow.test.ts` 末用例 W6/T5 通过），此后静默 **6,727,418ms ≈ 112.12 分钟**，至 120 分钟 job 上限取消。Windows 测试实际只推进约 6 分钟、仅 22 个失败名，**覆盖率比 R2 更低**。B1b（`fix/test-debt-b1b` 工作树）正在以 after-hook 探针抓取 chief-workflow 结束后的存活句柄（未提交，+32 行）。
5. **族结构**：known-red 33 / ci-path 42 / e71501c 32 / source-gate 23 / B0 其他 18 / flake 16 / VCA 13 / 未归类 13 / hang 4；**macOS git-config 0**。与 R2 相比：git-config 清零；ci-path +6（wiring 名从 git-config 迁移）；B0 其他 +1（Q74 迁移）；未归类 +10（B2 后新暴露的 git 子系统断言）；hang 2→4（旧 2 名变快速失败，新 2 名为 x64-only 真超时）。
6. **B3 范围建议**：B3a（source 门 23）与 B3b（VCA 13）**不变**；**B3c 需扩围 36→42 名、13→19 文件**（新增 6 个 wiring document/initial-workflow/publication 名，错误面为 `git-file-final-guard-unproven`）。B4 漂移 33→32，文件范围不变；W36（x64-only）与 W29-missing-confirmation（仅 Windows inline）需 3× 复跑后再改期望。

## 1. 三平台计数表

| 平台 | job 结果 | 起止（UTC） | 耗时 | tests | pass | fail | cancelled | skipped | 唯一名 | `✖` 行 | 备注 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| macOS arm64 | failure | 02:36:56–02:55:47 | 18m51s | 5,825 | 5,617 | **188** | 1 | 19 | **189** | 383（380 + 3 section 头） | 完整汇总；`duration_ms` 1,077,430（17m57s） |
| macOS x64 | failure | 02:36:57–03:30:17 | 53m20s | 5,825 | 5,614 | **189** | 3 | 19 | **192** | 389（386 + 3 section 头） | 完整汇总；`duration_ms` 3,051,979（50m52s）；2 个超时 |
| Windows x64 | **cancelled** | 02:36:58–04:37:12 | 120m14s（触顶） | 无最终汇总 | — | — | — | — | **22** | 24 | 19 顶层 + 3 子测试名（`selected`/`required`/`commit-race`）；最后输出 02:44:58.603Z，静默 112.12 分钟 |

口径说明（与协调者数字的核对）：

- 任务简报中的「协调者提取唯一 `✖` **197**（arm64）/ **200**（x64）」是**行级口径**：保留缩进与耗时、并把 3 条 `✖ failing tests:` section 头逐条计入。可精确复现：arm64 去重后的原始 `✖` 行（含缩进/耗时、不含 section 头）**194** + 3 头 = 197；x64 **197** + 3 = 200。
- 本报告与 R2 一致的**权威唯一名口径**（去缩进/去耗时、排除 section 头）为 **189 / 192**；与 `ℹ fail` 188 / 189 的 +1 / +3 差异来自父/子测试计数：W5、W10 两个父测试只在 inline 出现、最终 section 无块（`attribute-blocks` 187/190 块 vs 189/192 名）。
- **工件对照**：三平台上传的 `test-ci-output.log` 与 gh 日志失败名集合**完全一致**（arm64 189/189、x64 192/192、win 22/22，`sameNameSet=true`；见 `18-artifact-crosscheck.json`），排除日志截断/上传差异。R2 只核了 Windows 工件，本轮将 macOS 工件也纳入核对。
- 三平台 `✖` 文件级条目：**0 条**（无 `✖ <file>.test.ts (…ms)`）；超时条目见 §3.2。
- 合并去重：macOS 并集 192 名（arm64 是 x64 子集，x64 多 3 名）；再加 Windows 的 2 个独有名（均为 inline 子测试名）后**总宇宙 194**。Windows 22 名中 20 名同时出现在 macOS 集合。

## 2. 新宇宙与集合对照

| 集合 | 数量 | R3 交集 | 说明 |
| --- | ---: | ---: | --- |
| R3 三平台合并宇宙 | **194** | — | arm64 189 / x64 192 / win 22 |
| B0 冻结全量基线 | 191 | **130** | 与 R2 的 B0 交集**逐名完全相同**（130 名），无 B0 既有红消失/新增 |
| B7 全量 | 190 | **130** | 与 R2 的 B7 交集逐名完全相同 |
| 冻结 known-red 62 | 62 | **33** | 与 R2 的 33 名**逐名完全相同**；29 名未出现（同 R2） |
| 上一轮 R2 宇宙 | 289 | **194** | R3 ⊂ R2：新增 0、消失 95 |
| 历史 triage 186 | 186 | **24** | KR 6 / MAC 2 / NEW 16（R2 为 KR 6 / MAC 4 / NEW 16） |

- **消失的 95 名**：94 名属于 R2 `macos-git-config` 族（B2 修复直接清零，覆盖 `git-shell-acl`、`git-trunk-store`、`git-capabilities`、`git-command`、`bootstrap-frozen-closure-integration` 等 26 文件），1 名为 R2 未归类的 x64-only `路径 B：B3 accepted…`（`b31-fixed-release-auto-desktop.test.ts`，R3 未出现——单轮样本，不能判稳定转绿）。
- **新增 0 名**：R3 没有出现 R2 宇宙之外的新失败名。
- `current_not_in_any_baseline_or_triage`：**54**（R2 为 147）；`mac_only_not_windows_log_and_not_b0_b7`：**56**（R2 为 128）。两项大幅下降均由 git-config 清零贡献。
- B0 的 61 名未出现、B7 的 60 名未出现：与 R2 相同，且因 Windows 本轮更早取消（仅 ~6 分钟测试），**不构成 Windows 转绿证据**。
- 旧 triage 中消失的 2 个 MAC 名：`R20 default Core/default Chat binds true dual roots…`、`W3 默认Core→默认CodexChat本地HTTP…`，均为真实 git 链，随 B2 转绿。

## 3. 分族重算（互斥分族，合计 194）

| 族 | R3 数量 | 平台分布（arm64/x64/win） | R2 数量 | 变化 | 代表文件（计数） |
| --- | ---: | --- | ---: | --- | --- |
| macOS git-config 平台族 | **0** | 0/0/0 | 113 | **清零** | —（原：git-shell-acl 28、git-trunk-store 13、git-capabilities 12、git-command 11…） |
| CI 路径规范形/守卫族 | **42** | 41/41/1 | 36 | **+6**（wiring 迁移） | multi-runtime 22、git-action-authorization-gate 3、wiring 9、cross-runtime 4、run-stop 1、session-admission 1、git-role-workflows 1、W48 1（win） |
| 冻结 known-red 62 | **33** | 33/33/6 | 33 | 不变 | trunk-upgrade-validation 5、trio-worker-report 3、section1-write-preauthorization 2、appointment-roster 2 |
| e71501c 语义漂移族 | **32** | 31/32/12 | 33 | −1（W29-missing-confirmation 归未归类） | chief-workflow 13、star-routing 7、directive-input 5、stuck-redispatch 3、handback-delivery 2、application-line 1、decision-service 1 |
| source 门测试装配族 | **23** | 23/23/1 | 23 | 不变 | run-pin 11、run-change-trigger 9、i-full-chain 2、claude-adapter/schema 1 |
| B0 既有红（其他） | **18** | 18/18/1 | 17 | +1（Q74 迁移） | h-scope-audit 3、t1-pipeline-integration 3、trunk-stable-write-integration 2、git-role-workflows-e2e 2 |
| flake 时序族 | **16** | 16/16/0 | 16 | 不变 | session-rebuild-race 3、network-state-e2e 3、f2-claim-release 2、e-handler 1… |
| VCA 流程/通道族 | **13** | 13/13/0 | 13 | 不变 | version-change-integration 9、version-change 4 |
| 未归类 | **13** | 12/12/1 | 3 | **+10**（B2 后新暴露） | git-operation-sidecar-tolerance 6、git-command 3、git-trunk-store 1、run-role-submit-capabilities 1、file-write-safety 1、W29(win) 1 |
| 挂起/超时族 | **4** | 2/4/0 | 2 | **+2**（x64-only 真超时） | session-rebuild-race 1、stuck-redispatch 1（二者已 10s 快速失败）、git-action-delivery-claude-e2e 1、judge-delegated-effectiveness 1 |
| **合计** | **194** | 189/192/22 | **289** | −95 | — |

补充：

- 分族规则与 R2 完全一致，未按 R3 结果调参；因此有 3 处「规则语义滞后」需要在阅读时修正：①`关闭全部…`/`C-04…` 仍按冻结 `HANG_NAMES` 归入挂起族，但实际已是 10s 有界失败；②Windows-only 的 `W29 … document-change-missing-confirmation…` 因无最终 section/文件映射落到未归类，语义上属 e71501c 漂移；③`W48 … foreign-lease` 因 `/^W48 /` 规则归 CI 路径族，语义上属漂移/chief-workflow。三者在 §5/§6 的批次建议中按语义处理。
- 平台分布：arm64 与 x64 的族结构几乎一致；Windows 仅覆盖 22 名（6 名 known-red、12 名漂移、1 名 guard、1 名 source、1 名 B0、1 名未归类），且因取消无最终错误体。

### 3.1 macOS git-config 113 族：0 残留的完整核销

- **错误码零命中**：三平台 gh 日志与工件中 `git-config-executable-or-unsupported`、`git-initialization-effects-pending`、`git-config-section-unsupported`、`git-config-value-invalid` 计数均为 **0**；分族结果 `macos-git-config = 0`。
- 原 113 名的去向（逐名核销，见 `15-r2-comparison.json`）：
  - **94 名完全消失**（转绿）：涵盖真实 git 夹具的全部主链（git-shell-acl / git-trunk-store / git-capabilities / git-command / bootstrap/freeze-closure / readonly transport 等）。
  - **19 名仍红、错误面已变**：

| 去向 | 数量 | 名单要点 |
| --- | ---: | --- |
| CI 路径/守卫（`git-file-final-guard-unproven` / canonical metadata roots） | 6 | wiring `document`/`document-audit-failure`/`initial-workflow`/`initial-workflow-audit-failure`/`publication`/`publication-audit-failure` |
| 未归类（真实断言/产品错误码） | 10 | sidecar-tolerance I0-11/I0-12 ×6、git-command ×3（spawn fence / init journal / protection facts）、git-trunk-store operation media ×1、run-role-submit-capabilities ×1 |
| 挂起/超时（x64-only） | 2 | `AC-4 Claude convener git_publish delivery…`（300s）、`W-J5/J15 judge 代批…`（180s） |
| B0 既有红（其他） | 1 | `Q74 owned Git metadata observer…` |

- 结论：**B2 的 `core.precomposeunicode` 白名单修复按预期清除了 git-config 错误面**；仍红的 19 名不是 B2 回退，而是原先被 git-config fail-closed 遮挡的下一层测试/产品问题（guard 夹具、journal/sidecar 契约、x64 性能/超时）。

### 3.2 挂起/超时族与 Windows 静默

**测试级超时（`maxDurationMs ≥ 100000`）仅 2 名，且均 x64-only：**

| 失败名 | 文件 | x64 时长 | arm64 | 性质 |
| --- | --- | ---: | --- | --- |
| `AC-4：Claude convener 在受保护项目完成任务/回合内 git_publish delivery 完整链…` | `test/测试/git-action-delivery-claude-e2e.test.ts` | 300,001.858ms | 通过 | 全局 `--test-timeout=300000` 命中，无断言体 |
| `W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3…` | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 180,004.778ms | 通过 | 测试自带 `{ timeout: 180000 }` 命中 |

- 两名在 R2 均属 `macos-git-config` 族（arm64+x64 双平台失败）；B2 后 arm64 转绿、x64 变成超时。**单轮样本**无法区分「x64 Intel runner 真实 git 链变慢」与「句柄/事件循环泄漏」；需 x64 定向 3× 复跑后再定性（flake 候选，见 §4）。
- R2 的两个 300s 挂起（`关闭全部…`、`C-04…`）本轮均已被 B1 的 10s 有界 deadline 改为**快速失败**：错误信息含 `10000ms 内未结算` 与状态快照，不再是 300s 条目。族规则仍按冻结 `HANG_NAMES` 计入挂起族（4 名 = 2 名旧挂起快速失败 + 2 名新 x64 真超时）。
- **Windows 静默事实（取消前截止）**：
  - 最后一条结果行：`2026-11-16T02:44:58.6034176Z ✔ W6/T5 团队计划宿主绑定：普通消息回合无受派任务 ⇒ host-local plan-task-unavailable (20.7474ms)`。
  - 归属文件：`test/桌面应用/chief-workflow.test.ts`（W6/T5 是该文件末用例；最后一个 `test at` 行也在该文件 `:1348:1`；B1b 工作树把探针 after-hook 追加在 W6/T5 之后，见 `fix/test-debt-b1b` 未提交 diff）。
  - 取消时刻：`2026-11-16T04:37:06.0211141Z ##[error]The operation was canceled.`；静默 **6,727,418ms ≈ 112.12 分钟**（R2 为 88.97 分钟）。
  - 机制（高置信）：chief-workflow 文件全部用例结束（最后多条 W45/W47/W48/W4/W6/T5 均 pass，仅 W48 foreign-lease 在 02:44:54 失败）后，测试文件子进程未退出（存活句柄/事件循环），`node --test` 串行执行不再进入下一文件；`--test-timeout` 不覆盖已结束测试，故无 300s 条目。B1b 的 live-handle 探针正在确认具体句柄（HTTP server/子进程/watcher 待定）。
  - **与 R2 的差异**：R2 静默点在 `test/测试/git-role-workflows-e2e.test.ts`（测试输出约 30 分钟、117 名后才停）；R3 在更早的 `test/桌面应用/chief-workflow.test.ts`（约 6 分钟、22 名）即停。B1 对旧文件的修复**未能在 Windows 得到验证**（本轮根本未跑到该文件）；本轮 Windows 预算元凶是 chief-workflow 的文件级泄漏。

### 3.3 未归类 13 名（B2 后新暴露面）

| 组 | 数量 | 错误首个特征 | 初步判断 |
| --- | ---: | --- | --- |
| `git-operation-sidecar-tolerance.test.ts` I0-11/I0-12 | 6 | `Error: git-journal-directory-invalid`；期望 `authorization-sidecar-directory-unknown` / `authorization-sidecar-file-unsafe` / `stable-work-source-corrupt` 等 | journal 扫描器与 sidecar 容忍契约不一致（产品/测试期望二选一） |
| `git-command.test.ts` | 3 | 期望 `/git-command-failed:null:unknown/` 不匹配；init journal restart 绑定 / protection facts 断言失败 | 错误形状/重启用绑定语义；需 3× 复跑定性 |
| `git-trunk-store.test.ts` operation media | 1 | 严格相等断言失败（restart enumeration 两种格式） | 与上组可能同源（journal/media 扫描） |
| `run-role-submit-capabilities.test.ts` | 1 | `ENOENT: realpath …/.ans/trunk/ope…`（`ok:false, reason:missing`） | fixture/产品操作目录生命周期 |
| `file-write-safety.test.ts` D3 lstat ENOTDIR | 1 | 期望 `/无法读取目标状态.*ENOTDIR/` 不匹配 | R2 已登记（macOS 错误文案差异），B6 遗留 |
| `W29 … document-change-missing-confirmation…`（win） | 1 | 无错误体（Windows inline） | 语义上属 e71501c 漂移；仅 Windows 取消前出现 |

## 4. arm64 / x64 差异逐名（含 flake 标注）

R3 中 arm64 集合（189）是 x64（192）的子集：**arm64-only = 0，x64-only = 3**；另有 2 名双平台超时差异与 2 名 Windows-only（取消前 inline）。逐名如下（`16-platform-diff.tsv`）：

| 失败名 | 文件 | 平台 | R2 平台 | R2 族 → R3 族 | flake/定性标注 |
| --- | --- | --- | --- | --- | --- |
| `AC-4：Claude convener … git_publish delivery 完整链…` | `test/测试/git-action-delivery-claude-e2e.test.ts` | **x64 only**，300s | arm64+x64 | git-config → hang | **flake/超时候选**：R2 双平台红、R3 arm64 绿；单轮无法区分 x64 慢/泄漏；需 x64 3× |
| `W-J5/J15：judge 代批 intent 冻结…` | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | **x64 only**，180s（测试自带 timeout） | arm64+x64 | git-config → hang | 同上；180s 为测试级 deadline，说明链在 x64 上未在 3 分钟内完成 |
| `W36 真实Chief可无M0-plan-D3派五builtin准备…` | `test/桌面应用/chief-workflow.test.ts` | **x64 only**，8.3s 断言 | **win only** | e71501c → e71501c | **跨平台漂移/ flake 候选**：R2 仅 Windows、R3 仅 x64、arm64 均绿；单轮样本，需 3× 双平台 |
| `关闭全部与双角色刷新扫描交接…` | `test/桌面应用/session-rebuild-race.test.ts` | arm64+x64，均 ~10s（已非超时） | arm64+x64，300s | flake/hang → hang | B1 生效；仍红但为有界 10s 失败（真实未结算状态），**不是超时** |
| `C-04 decision 开关开启…` | `test/桌面应用/stuck-redispatch.test.ts` | arm64+x64，均 ~10s（已非超时） | arm64+x64，300s | flake/hang → hang | 同上 |
| `W48 … foreign-lease` | `test/桌面应用/chief-workflow.test.ts` | **win only**（inline） | win only | ci-path → ci-path | Windows 取消前 inline 子测试；无最终错误体，不作平台语义结论 |
| `W29 … document-change-missing-confirmation…` | `test/桌面应用/chief-workflow.test.ts` | **win only**（inline） | arm64+x64+win | e71501c → unclassified | 同上；macOS 本轮该变体通过 |

补充的跨轮平台漂移（非 R3 平台差异但需记录）：

- `申请直达：来源角色=rapporteur…`（`application-line.test.ts`）：R2 为 x64+win、arm64 通过；**R3 双 macOS 均失败**。arm64 新增失败，属语义/断言漂移，单轮样本 → flake/变更候选，B4 处理时先 3×。
- `路径 B：B3 accepted…`（`b31-fixed-release-auto-desktop.test.ts`）：R2 x64-only、R3 未出现（转绿）。单轮不判稳定绿。
- Windows 22 名与 macOS 的 20 名重叠是「同名跨平台稳定红」的延续（known-red/漂移/B0），没有观察到新的 Windows 特有语义面（除 2 个 inline 变体）。

## 5. 与 R2 计划的偏差

| 项 | R2 计划/预期 | R3 实际 | 偏差与处置 |
| --- | --- | --- | --- |
| B1 旧挂起（2×300s） | R1 后变快速失败/自然完成 | **已变 ~10s 有界失败**（`10000ms 内未结算` 诊断） | 达成；族名仍保留在挂起族，阅读时按快速失败处理 |
| B1 Windows 静默 | 预期消除 `git-role-workflows-e2e` 泄漏后 Windows 预算改善 | 旧文件未跑到；**静默点移到 `chief-workflow.test.ts`**，112.12 分钟，Windows 仍 120 分钟触顶 | 未达成；B1b 正在定位（live-handle 探针）。Windows 覆盖率反而下降（117→22 名） |
| B2 macOS git-config 113 | 预期 113 清零或只剩非 git-config 面 | **错误码 0 残留；94 名转绿、19 名迁移** | 达成且符合 R2 §4.3 的 downstream 预期；19 名按新错误面分流到 B3c/B6 |
| B3a source 门 23 | 23–30 名定性转绿/冻结 | **23 名原样复发**（run-pin 11 / run-change-trigger 9 / i-full-chain 2 / schema 1） | 范围不变；owner 的 legacy 直接派发裁决仍未落，B3a 阻塞 |
| B3b VCA 13 | 13–18 名转绿/冻结 | **13 名原样复发** | 范围不变；owner 的 `submitDirect` legacy 裁决仍未落 |
| B3c CI 路径 36 | 36 名定性 | **42 名**：原 36 名全在 + 6 个 wiring 名从 git-config 迁移（错误码 `git-file-final-guard-unproven` / canonical metadata roots） | **扩围**；19 文件（原 13 + 6） |
| B4 漂移 33 | 按 e71501c 当前语义更新期望 | **32 名**（W29-missing-confirmation 仅 Windows inline，落未归类；其余 32 名原样） | 文件范围不变；W36 x64-only、W29 变体需 3× 后再改 |
| B5 flake 16 | 按族硬化 | **16 名原样复发** + 2 个新 x64-only 真超时 | B5 范围 +超时候选；先 x64 3× |
| B6 B0 其他 17 + 未归类 3 | 逐文件 3× 定性 | **18 + 13 = 31 名**（Q74 迁移 + 10 个 B2 后 git 子系统断言 + W29 变体） | **扩围**；建议拆出「B2 后新暴露」子组优先定性 |
| Windows 117 名 | 取消前部分清单 | 22 名（19 顶层 + 3 子测试） | 不可与 R2 直接比较；B0/B7 的 130 名稳定交集中有 14 名在 Windows 本轮出现（含 6 名 known-red） |

### 5.1 B3a/B3b/B3c 批次范围结论

- **B3a（source 门）**：保持 4 文件 / 23 名不变。R3 证据与 R2 完全同名复发，说明不是 flake；等待 owner 裁决「legacy 直接派发是否受支持」。
- **B3b（VCA）**：保持 2 文件 / 13 名（+ trunk-upgrade KR 跨列 5 名只复跑）不变；等待 owner 裁决 `submitDirect` legacy 能力面。
- **B3c（CI 路径/守卫）**：**需扩围 36 → 42 名，13 → 19 文件**。新增 6 名全部来自 `git-action-authorization-wiring-{document,document-audit-failure,initial-workflow,initial-workflow-audit-failure,publication,publication-audit-failure}.test.ts`，错误面为 `git-file-final-guard-unproven` / 「Actual file/edit handlers do not carry the current canonical metadata roots and link guard」，与 B3c 既有根因同类，应并入同一批的夹具修复，而不是留在 B6。
- **B4（漂移）**：33 → 32 名，7 文件不变；`路径 B：B3 accepted…` 已消失（不再占未归类）。建议：W36（x64-only）与 W29-missing-confirmation（Windows-only inline）先做 3× 复跑再改期望，其余 30 名可按当前语义更新。

## 6. 对后续批次与优先级的建议

1. **B1b（P0，进行中）**：以 chief-workflow after-hook 探针定位文件级存活句柄；完成前不建议发起下一轮全量三平台 CI——Windows 只跑 ~6 分钟，信号价值极低，且 120 分钟预算继续被 112 分钟静默消耗。建议 B1b 修复后单独跑一轮 CI 验证 Windows 是否越过 chief-workflow（R2 的旧泄漏是否真正消除需等 Windows 跑到 `test/测试/git-role-workflows-e2e.test.ts` 才能确认）。
2. **B3c 先于 B4？** 从 R3 结果看，B3c 的 42 名全部确定性复发（guard 错误码稳定、无 flake 证据），且与 B4 文件不重叠；建议维持 R2 计划的「B3a+B3b+B3c+B4 同一 CI 轮次（R2 计划称 R3）」合并方式，但 B3c 使用扩围后的 19 文件清单。
3. **B2 后新暴露的 10 名 git 子系统断言**：建议作为 **B2b/B6 子组**立即 3× 定性（优先 `git-operation-sidecar-tolerance` 6 名，错误集中在 journal/sidecar 契约），它们可能是同一根因的一小组产品/测试对齐，不宜散落在 B6 逐文件处理。若确认产品契约变化，需要 owner/桌面角色裁决。
4. **x64-only 真超时 2 名**：先做 x64 定向 3×（可在下一轮 CI 的 x64 job 观察，或由 owner 提供 macOS Intel 环境）；若稳定超时，按 B5 的「不新增断言、只硬化等待/清理」原则处理；若漂移，登记为 flake 族，不进 B4 期望更新。
5. **B5/B6**：B5 维持 16 名 + 2 超时候选；B6 扩为 31 名（18 + 13），其中 D3 lstat ENOTDIR（R2 遗留）与 W29 变体单独标注。
6. **基线重冻结（B7）**：本轮的 130 名 B0/B7 稳定交集与 33 名 known-red 逐名未变，可继续作为冻结集；新增的「x64-only 超时」「B2 后 git 子系统」不要写入 known-red，先按 flake/待定性登记。

## 7. 证据边界与披露

1. **计数口径**：协调者 197/200 是行级口径（含缩进/耗时/3 个 section 头）；本报告权威唯一名为 189/192（`ℹ fail` 188/189）。两套口径已在 §1 精确对账，后续引用请以唯一名为准。
2. **Windows 不完整**：job 在 120 分钟被取消，只覆盖 02:39:00–02:44:58 约 6 分钟测试输出、22 个失败名；无最终 `✖ failing tests:` section 与错误体。117→22 的下降**不是转绿**，而是停得更早。B0 的 61 名未出现同样不能当作 Windows 转绿。
3. **Windows 静默归属**：最后结果行属于 chief-workflow 末用例；「文件级泄漏」是高置信推断（文件已跑完、后续文件零输出、无 300s 条目），具体句柄待 B1b 探针确认。不能排除与 B1/B2 改动的间接关联，也无证据表明 R2 的 git-role-workflows-e2e 泄漏已被 Windows 实测消除。
4. **x64 超时的单轮性**：AC-4/W-J5 只在 x64 出现一次；可能受 runner 负载、Intel 速度、真实 git 链耗时影响。未做 3× 复跑，不判定为确定性产品或测试缺陷。
5. **错误体归因限制**：块级错误码（`10-block-codes.json`）只覆盖 macOS 最终 section；Windows inline 名没有错误体；W5/W10 父测试只在 inline 出现、按子测试族归属。分族规则原样沿用 R2，未为 R3 特调；3 处规则语义滞后已在 §3 明确标注。
6. **flake 证据**：本轮 `ENOTEMPTY=1`（x64 的 C-04 失败块正文内，属清理期错误；未单独成族）、Node `CleanupQueue` 断言 0、`AggregateError` 0；flake 族 16 名与 R2 同名复发，依据仍是既有 E3/E3-F/D1/B8.2 登记与本轮时序错误（`D1 test wait expired` 3、`waitFor 超时` 2、`等待实际事件超时` 2、`离线回交未入队` 2、`等待超时` 1）。x64-only 3 名（AC-4/W-J5/W36）是跨轮漂移的最强线索，但均为单轮样本。
7. **R3 ⊂ R2 的偶然性**：本轮没有 R2 宇宙外的新名，说明 B1/B2 未引入新失败面；但下一轮若 Windows 完整跑完或 x64 超时漂移，宇宙可能重新扩张——不能把 194 当作收敛下限。
8. **未做的事**：未改代码/测试/配置/workflow/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未在 macOS 本机复跑（无 macOS 环境），平台结论均来自 CI 日志与工件。

## 8. 未决问题（更新）

1. **B1b**：chief-workflow 文件结束后的存活句柄是什么？修复后 Windows 能否越过该文件并验证 `git-role-workflows-e2e` 旧泄漏已消除？
2. **B3a owner 裁决**：legacy 项目是否允许无真实 accepted 客户轮次的直接派发（23 名阻塞）。
3. **B3b owner 裁决**：`submitDirect` 是否接受 legacy/测试宿主路径（13 名阻塞）。
4. **B3c 扩围确认**：6 个 wiring document/initial-workflow/publication 名是否随 guard 夹具一并修复；`git-file-final-guard-unproven` 是产品 guard 应 canonicalize 还是测试夹具缺真实 handler 元数据根。
5. **x64-only 超时**：AC-4（300s）/ W-J5（180s）是 x64 性能/泄漏还是确定性缺陷？需要 x64 定向 3×。
6. **B2 后 git 子系统 10 名**：journal/sidecar 契约、spawn fence 错误形状、operation media 重启用是否同一根因？归 B2b 还是 B6？
7. **W19 close 通知**（R2 遗留）：产品候选仍未裁决；R3 中仍在漂移族复发。
8. **基线重冻结**：known-red 33/62 与 B0/B7 130 名交集继续有效；是否新增 `desktop-known-red` 由 B7 决定。
9. **workflow 止血**：`test-ci.yml` 是否加 step 级 timeout 或 `--test-force-exit`（仅开发反馈 workflow，需 owner 决策；本报告不改 workflow）。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/`）

| 文件 | 内容 |
| --- | --- |
| `extract-ci-failures.mjs` | R2 脚本最小适配（run 43793243595 / job 133056200435·133056200344·133056200177 / `/tmp/ci-logs2`）；三平台日志 + Windows 工件提取 |
| `attribute-blocks.mjs` | 原样沿用；macOS 最终 section 逐块错误码归因 |
| `classify-failures.mjs` | 原样沿用；与 B0 191 / B7 190 / known-red 62 / triage 186 合并去重 |
| `assign-families.mjs` | 原样沿用；互斥分族 |
| `summarize-r3.mjs` | 新增；由 `01` 派生 `05-platform-counts.json` 与 `14-timeouts-and-stall.json` |
| `compare-r2.mjs` | 新增；R2 289 vs R3 194 集合/逐族对照、平台差异清单、Windows 22 名对照 |
| `crosscheck-artifacts.mjs` | 新增；三平台 gh 日志 vs 上传工件的失败名集合一致性核对 |
| `01-ci-failures.json` | 三平台完整提取（汇总、唯一名、超时、静默、artifactCheck） |
| `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt` / `04-failnames-windows-cancelled.txt` | 逐平台唯一失败名 + 文件（tab 分隔） |
| `05-platform-counts.json` | 三平台计数速览（job、汇总、唯一名、xmark 行、超时、静默） |
| `06-merged-universe.json` | 194 名并集：平台出现、日志/仓库文件映射、集合命中、首个错误行 |
| `07-by-file.tsv` | 按测试文件分组的失败名清单 |
| `08-set-summary.json` | 集合交集与平台独有统计 |
| `10-block-codes.json` | 逐名块级错误码（187/190 块） |
| `11-families.json` | 互斥分族全量（族/平台计数/文件计数/跨列） |
| `12-family-summary.tsv` | 族汇总（族/数量/top 文件） |
| `14-timeouts-and-stall.json` | 超时条目与 Windows 静默事实 |
| `15-r2-comparison.json` | 289 vs 194：交集/新增/消失、逐族增减、R3 新进与消失名单 |
| `16-platform-diff.tsv` | arm64/x64 差异 + 超时 + Windows-only 逐名清单（含 flake 标注线索） |
| `17-windows-names.tsv` | Windows 取消前 22 名与 macOS/R2 对照 |
| `18-artifact-crosscheck.json` | 三平台日志 vs 工件失败名一致性（均 `sameNameSet=true`） |

## 附录 B：复现命令

```bash
# 下载（原始日志只放 /tmp，不入库）
mkdir -p /tmp/ci-logs2
cd <repo-worktree>
gh run view 43793243595 --job 133056200435 --log > /tmp/ci-logs2/arm64.log
gh run view 43793243595 --job 133056200344 --log > /tmp/ci-logs2/x64.log
gh run view 43793243595 --job 133056200177 --log > /tmp/ci-logs2/windows.log
gh run download 43793243595 -n test-logs-win-x64 -D /tmp/ci-logs2/artifact-win
gh run download 43793243595 -n test-logs-mac-arm64 -D /tmp/ci-logs2/artifact-mac-arm64
gh run download 43793243595 -n test-logs-mac-x64 -D /tmp/ci-logs2/artifact-mac-x64

EV=角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence
B7=角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3

node $EV/extract-ci-failures.mjs --arm64 /tmp/ci-logs2/arm64.log --x64 /tmp/ci-logs2/x64.log \
  --win /tmp/ci-logs2/windows.log --win-artifact /tmp/ci-logs2/artifact-win/test-ci-output.log --outdir $EV
node $EV/attribute-blocks.mjs --arm64 /tmp/ci-logs2/arm64.log --x64 /tmp/ci-logs2/x64.log --out $EV/10-block-codes.json
node $EV/classify-failures.mjs --ci $EV/01-ci-failures.json \
  --b0 $B7/full/b0-frozen-failnames-191.txt --b7 $B7/full/failnames.txt --kr-dir $B7/knownred \
  --triage 角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md --tests-root test --outdir $EV
node $EV/assign-families.mjs --universe $EV/06-merged-universe.json --blocks $EV/10-block-codes.json --outdir $EV
node $EV/summarize-r3.mjs --ci $EV/01-ci-failures.json --outdir $EV
node $EV/compare-r2.mjs \
  --r2 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/06-merged-universe.json \
  --r3 $EV/06-merged-universe.json \
  --r2-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/11-families.json \
  --r3-families $EV/11-families.json --outdir $EV
node $EV/crosscheck-artifacts.mjs --arm64 /tmp/ci-logs2/arm64.log --arm64-artifact /tmp/ci-logs2/artifact-mac-arm64/test-ci-output.log \
  --x64 /tmp/ci-logs2/x64.log --x64-artifact /tmp/ci-logs2/artifact-mac-x64/test-ci-output.log \
  --win /tmp/ci-logs2/windows.log --win-artifact /tmp/ci-logs2/artifact-win/test-ci-output.log --out $EV/18-artifact-crosscheck.json
```

## 附录 C：关键结论速览

- 三平台：arm64 **188 fail / 189 唯一名**（5,825 tests）；x64 **189 / 192**；Windows **cancelled @120m，22 唯一名，最后输出 02:44:58Z 后静默 112.12 分钟**。
- 新宇宙 **194**，是 R2 289 的真子集：**新增 0、消失 95**（94 git-config + 1 x64-only 路径 B）。
- **macOS git-config 113 族清零确认**：错误码 0；94 名转绿、19 名迁移（guard 6 / 未归类 10 / x64 超时 2 / B0 其他 1）。
- 分族：known-red 33、ci-path 42、drift 32、source 23、B0 其他 18、flake 16、VCA 13、未归类 13、hang 4、git-config 0。
- B1 生效：两个旧 300s 挂起变 ~10s 有界失败；**B1b 新战场**：Windows 静默点移到 `chief-workflow.test.ts`（112.12 分钟，B1b 探针进行中）。
- x64-only：AC-4（300s）、W-J5（180s）、W36（8.3s）——均需 3× 后再定性；arm64-only 0。
- B3 建议：B3a/B3b 不变；**B3c 扩为 42 名/19 文件**；B4 32 名、文件不变；B6 扩为 31 名并拆出「B2 后 git 子系统」子组。
