# 变更记录：E3-F 终验——全量 T3 回归（会话创建准入按操作审批，2026-11-08）

- 任务节点：**E3-F 终验执行**（团队计划 §5.1/§5.5/§6.1；派发记录 `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §三/§五；B1 v1 §1/§3）
- 角色：测试（独立上下文；**只取证，不判验收**）
- 日期：2026-11-08（本地 13:06–13:48；权威 T3 运行 13:07–13:34，墙钟约 27 分钟）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）
- 证据目录：`角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression-evidence/`（与上一变更 `2026-11-07_E3-T3-full-regression*` 区分）
- 纪律：只读 `src/** app/** test/**`；**未修改任何产品/测试源码**；未 commit / push / 暂存 / 合并 / 发布；未运行真实模型/Electron/CDP（RR 为独立节点）；未删除/放宽断言、未加 skip、**全程未使用 `--test-force-exit`**。

## 0. 结论摘要（先读）

1. **权威 T3 运行（一次，隔离）**：520 文件（上一 E3 参照 510 + 本变更新增 10，删除 0）；**514 个自然完成文件 + 6 个登记挂起文件（90s watchdog，不计通过）**；无未登记 watchdog/停摆、无 no-summary 异常。
2. **计数（自然完成 514 文件）**：**4,979 tests / 4,750 pass / 196 fail / 1 cancelled / 32 skipped / 0 todo**；其中既有 510 文件（504 自然）= 4,891/4,662/196/1/32/0，本变更新增 10 文件 = **88/88 pass（0 skip）**。
3. **与上一变更 E3 T3 参照（`d0d67ff4…`，4,872/4,641/198/1/32）逐条对照（文件+测试名多重集）**：
   - 参照可信失败条目 **198**；本次可信条目 **195**（含 cancelled 1 条经口径对齐，见 §4）；
   - **新增失败 2 条**、**既有失败消失 5 条**（逐条见 §4）；**新增 skip = 0、既有 skip 消失 = 0**（31 条打印名逐条一致；32 总数含 1 条源内未打印 skip）。
   - 2 条新增失败均为**上一 E3 已登记的非确定性类**，且在**同候选/同命令的隔离复跑中不复现**（application-line 3/3 pass；chief-workflow 失败集合变化且 `unmanaged`/ENOTEMPTY 未复现）⇒ **新增确定性失败 = 0**。
   - 5 条消失中：2 条为**设计 §4.5 点名的既有红按本变更转绿**（`shell-gate` readonly 裁定 A、`shell-readonly` 只读档 git status），属预期；3 条为参照侧非确定性/记账类（chief-workflow W29/commit-race 清理类、e-pi 原生崩溃），本轮未复现。
4. **静态门**：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 **exit 0**；范围扫描见独立记录 `2026-11-08_E3-scans-and-checks_session-admission.md`（退役码零生产产生、死规则删除、规则集仅 v4、matcher/规范体单一来源）。
5. **候选与稳定性**：候选 **38 文件** 聚合 **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`**（运行前后同值）；`src app test` manifest 运行前/中/后均 **1,077 文件 / `5308e71a80c93cc3091b09afa95be4f1687736982593f968eef7db01c0cfcd6f`**（diff 0 行）；HEAD `a1b2f66`（tree `3aa82fb7…`）/分支/T1 三文件不变；暂存 0；**未发现候选变化（含并行 `remove-predictive-gates` 写入：无）**。
6. **辅助 B0 差异解释（客户豁免；不作 pass/fail 依据）**：B0 记录 `31e178b3…`（200 fail）与参照 198 的差异逐条见 §6；B0 **未重记**（客户豁免）如实披露。

## 1. 输入与候选身份

| 输入 | 实测 |
| --- | --- |
| 设计 P1.3 | `docs/planning/2026-11-08_design_session-admission-approval-based.md` `2553b97a…`（855 行） |
| B1 v1 | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` `fb881126…`（185 行） |
| 派发记录 | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` `60eed852…` |
| **参照基线（上一变更 E3 T3，订正版）** | `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md` `d0d67ff4…`（原 `76872622…`）；计数 **4,872/4,641/198/1/32**（503 自然文件 + 6 挂起 + 1 watchdog） |
| 候选 | **38 文件**（scope 41 − T1 3）；逐文件 SHA-256/`git hash-object`：`08-candidate-hashes.tsv` |
| 候选聚合 | `<raw_sha256>  <path>` 整行 `LC_ALL=C sort` 后 SHA-256 = **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`** |
| T1 只读三文件 | 哈希不变（`afe70c62…`/`f0db260e…`/`358ac967…`；不计入候选） |
| 测试文件 | **520**（`20-all-test-files.txt`）；与参照 510 逐行 diff：**新增 10、删除 0**（`21-test-file-diff-vs-E3.txt`） |

## 2. 环境与方法

- OS Windows 11 Pro 10.0.26300 / Git Bash / Node v24.22.1 / npm 11.19.1（与参照一致）。
- **逐文件独立进程自然运行**：`timeout -k 5 <TO> node --test --test-concurrency=1 <file>`；每文件记录 exit/signal/watchdog、tests/pass/fail/cancelled/skipped/todo、duration/wall（`31-t3-per-file-results.tsv`，520 行 + DONE）。
- watchdog：**6 个登记挂起文件 90s**（与 B0/E3 同口径）；其余 **300s**（参照为 600s、chief-workflow 360s——本运行统一 300s，仅用于兜底；无文件因该差异被误判，见 §7）；**未使用 `--test-force-exit`/`--test-timeout`**；未删测试、未放宽断言、未加 skip。
- 运行为**隔离运行**（期间无其它测试进程；仅本角色的只读进度检查与 manifest 快照）。
- 逐文件结果解析与失败名抽取沿用上一 E3 的 `40b-compare-b0.sh` 口径（末段 `✖ failing tests:` 的 `test at <loc>` + `✖ <name>` 配对；路径统一 `/`、strip 行号列号与尾部耗时）；可信条件：配对数=summary fail（chief-workflow 例外：父失败不入配对）或 fail=0 且 cancelled=配对数（turn-watch cancelled 口径；与参照对齐）。

## 3. 权威运行结果

| 范围 | 文件 | tests | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 既有文件（E3 参照文件集，含 6 挂起不计） | 504 自然 | 4,891 | 4,662 | 196 | 1 | 32 | 0 |
| 本变更新增文件（10） | 10 | 88 | 88 | 0 | 0 | 0 | 0 |
| **本次权威合计（自然完成）** | **514** | **4,979** | **4,750** | **196** | **1** | **32** | **0** |
| 未计入：6 个登记挂起（90s watchdog，不计通过） | 6 | —（SIGTERM 残段见 `40-comparison/hang-and-timeout.txt`） | | | | | |

- 运行状态分布：`natural-exit 514 / registered-hang-timeout 6`；无 `watchdog-killed`（未登记）、无 `natural-exit-no-summary`（`40-comparison/status-counts.tsv`、`anomalies.txt` 为空）。
- **逐文件计数差 vs 参照**（同路径既有文件，均有归因）：`40-comparison/count-reconciliation.tsv`；合计 +19 tests / +21 pass / −2 fail，分解：e-pi 原生崩溃未复现（+8/+9/−1）、judge.test +2/+2（W5-U 新增 2 例）、operator-channel +2/+2（W5-D 新增 2 例）、shell-rules-public-reexport +1/+1、shell-write-guard +1/+1（W3-G 新增）、interactive-execution-mode +5/+5（参照 watchdog，本轮自然退出）、shell-gate +1 pass/−1 fail 与 shell-readonly +1/−1（既有红转绿）、application-line −1/+1（非确定性，见 §4）。
- 按目录计数：`40-comparison/aggregate-by-dir.tsv`。

## 4. 与参照基线的逐条对照（文件+测试名多重集）

| 指标 | 值 |
| --- | --- |
| 参照可信失败条目 | **198** |
| 本次可信失败条目 | **195**（含 cancelled 1 条经口径对齐；见下） |
| 逐条一致 | 193 |
| **新增失败（本轮有、参照无）** | **2**（逐条与分类见下） |
| **既有失败消失（参照有、本轮无）** | **5**（逐条与分类见下） |
| 新增 skip / 既有 skip 消失 | **0 / 0**（31 条打印名逐条一致；32 总数含 1 条源内未打印 skip） |
| cancelled | 1 条与参照同：`test/测试/turn-watch-verify/b-last-resort.test.ts`（3/2/0/1，`test timed out after 10000ms`） |

**新增失败 2 条（均分类为上一 E3 已登记的非确定性，非本变更新增确定性失败）**：

| # | 文件 | 测试名 | 类别与处置 |
| --- | --- | --- | --- |
| 1 | `test/桌面应用/application-line.test.ts` | 申请直达：来源角色=rapporteur，卡片不镜像，裁决回来源；request.* 事件写 tasks.jsonl | `AssertionError`（事件顺序 `presented/created` 竞态）——上一 E3 §3.5 已登记同文件同断言为顺序竞态（B 失败、C+2 次复跑 3/3 pass）；本次**隔离复跑 3/3 pass**（`52-isolated-application-line-rerun.log`）⇒ 非确定性 |
| 2 | `test/桌面应用/chief-workflow.test.ts` | `unmanaged` | `AggregateError: W10 primary/owned cleanup failures retained` + `ENOTEMPTY rmdir …\.ans\sessions\chief\codex\ans`（fixture 清理期）——上一 E3 §3.4/§3.5 已登记 chief-workflow 清理抖动（4 次运行 fail 数 15/14/11/14、失败名集合随运行变化）；本次**隔离复跑 fail=10 且 `unmanaged` 未复现**（`53-isolated-chief-workflow-rerun.log`）⇒ 非确定性（ENOTEMPTY 清理类） |

**既有失败消失 5 条（逐条说明）**：

| # | 参照条目 | 本轮结果 | 分类 |
| --- | --- | --- | --- |
| 1 | `test/编排/shell-gate.test.ts`「readonly 裁定 A：裸串分类器…」 | 35/35 pass | **设计 §4.5 点名既有红 → 本变更转绿（预期，W3-G）** |
| 2 | `test/编排/shell-readonly.test.ts`「只读档集成（门禁引擎实件）…」 | 9/9 pass | **设计 §4.5 点名既有红 → 本变更转绿（预期，W3-G）** |
| 3 | `test/桌面应用/chief-workflow.test.ts`「W29 默认Core/Chat…document-change…」 | 58/44/14；本轮失败集合不含该名 | 参照侧清理类非确定性未复现（E3 已登记 4 次运行集合不同） |
| 4 | 同文件「commit-race」（W5 子测试） | 同上 | 同上（ENOTEMPTY/AggregateError 清理类） |
| 5 | `test/测试/g5-reasoning-verify/e-pi.test.ts`（file-level） | **11/11 pass** | 参照侧 Node v24.22.1 原生 `CleanupQueue::Add` 断言崩溃未复现（E3 §3.5 已登记；本轮无原生崩溃） |

> 说明：chief-workflow 本轮 fail=14（与参照 C 相同）但失败名集合不同（新增 `unmanaged`、消失 W29/commit-race，W19 次数不同）——与 E3 记录的四次运行 15/14/11/14 同一非确定性族；不构成新增确定性失败。`turn-watch` 的 `✖` 条目在 summary 计 cancelled（fail=0），已按 cancelled 口径对齐（参照同口径）。

## 5. 本变更新增测试文件（单独列出；全部通过）

| 文件 | tests/pass/fail/cancel/skip |
| --- | --- |
| `test/runtime-core/readonly-git-routing.test.ts` | 10/10/0/0/0 |
| `test/runtime-core/session-admission-approval.test.ts` | 11/11/0/0/0 |
| `test/测试/session-admission-approval-integration.test.ts` | 8/8/0/0/0 |
| `test/测试/session-admission-approval-q9-integration.test.ts` | 1/1/0/0/0 |
| `test/编排/readonly-git-transport.test.ts` | 5/5/0/0/0 |
| `test/编排/run-role-admission.test.ts` | 3/3/0/0/0 |
| `test/编排/shell-approval-wiring.test.ts` | 7/7/0/0/0 |
| `test/编排/shell-write-guard-injection.test.ts` | 3/3/0/0/0 |
| `test/门禁引擎/readonly-git-matcher.test.ts` | 21/21/0/0/0 |
| `test/项目管理/shared/shell-approval-binding.test.ts` | 19/19/0/0/0 |
| **合计** | **88/88/0/0/0** |

## 6. 辅助 B0 差异解释（客户豁免；不作 pass/fail 依据）

- **B0 状态**：新 B0 记录 `角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-baseline.md`（`31e178b3…`）按客户豁免**不作为正式基线、未重记**（`docs/communication/2026-11-08_waiver_baseline_session-admission.md`）；本 E3 的报告与判定只使用上一变更 E3 参照（`d0d67ff4…`），**未混用 B0 数据**。
- **旧 B0（e71501c）→ 辅助 B0（a1b2f66）的已知差异**（B0 记录 §10）：chief-workflow 失败 **13→16（+3）**；`门禁引擎/git-shell-acl` 文件级红→绿（**−1**）；故 198→**200**（+2）。其余逐文件计数与旧 B0 一致。
- **辅助 B0（200）vs E3 参照（198）多重集差异（机器对照 `41-b0-vs-reference/`）**：B0-only 5 条目（application-line 1、chief-workflow W20 1、unmanaged 1、W19 ×2）；ref-only 3 条目（chief-workflow W29 1、e-pi 原生崩溃 1、turn-watch cancelled 1[记账口径]）。全部属上述非确定性/记账类，**不是**本变更引入的行为差异。E3 报告本身亦记录其运行 C 相对旧 B0 的 4 新增/5 消失（同一族）。
- **不得混用**：B0 的 200 fail、本 E3 的 196 fail、参照的 198 fail 三者产生于不同候选/方法/运行；本报告的所有判定口径均为「本 E3 运行 vs 参照（文件+测试名多重集）」。

## 7. 已知非确定性/环境项分类（本轮观测）

| 项 | 参照侧记录 | 本轮观测 | 处置 |
| --- | --- | --- | --- |
| `application-line` 顺序竞态 | E3 §3.5（B 失败、C/复跑 pass） | 全量失败 1；隔离 3/3 pass | 非确定性（不计新增确定性失败） |
| `chief-workflow` 清理抖动 | E3 §3.4/§3.5（15/14/11/14，ENOTEMPTY/AggregateError） | 全量 14 fail（含 unmanaged/ENOTEMPTY）；隔离 10 fail（集合不同，unmanaged 未现） | 非确定性（同上） |
| `e-pi` Node 原生 `CleanupQueue::Add` 崩溃 | E3 §3.5/§3.9（C 1 次；隔离 11/11 ×2） | **11/11 自然通过，无崩溃** | 未复现 |
| `git-trunk-store` 原生崩溃/测试后挂起 | E3 §3.5；D1 期曾再现 | **13/13 自然通过（64.2s）** | 未复现 |
| `interactive-execution-mode` post-test 泄漏 | E3 §3.5（C 600s watchdog） | **5/5 自然退出（1.09s）** | 未复现（本轮按 natural 计入） |
| `download-provider` 时序抖动 | W1b §5.3 | 14/14 自然通过 | 未复现 |
| 6 个登记挂起文件 | B0/E3 登记 | 6 个均 90s watchdog（`write-sequencing`、`customer-authorization-plane-integration`、`directive-decision`、`optional-acceptance`、`session-rebuild-race`、`stuck-redispatch`）；同参照 | 不计通过 |
| `--test-force-exit` | E3 未用 | **全程未用** | — |
| 候选并发写入（`remove-predictive-gates`） | 派发提醒 | 运行前/中/后 manifest 与候选聚合不变；未发现写入 | 未触发停止 |

## 8. 静态门与范围扫描

- 静态门全绿（`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0）。
- 范围扫描（退役码零生产产生、旧门零产生、死 `readonly:git` 已删、`SHELL_RULES_VERSION` 全仓 v4/v3 fail-closed、matcher/规范体单一来源）详见独立记录 `2026-11-08_E3-scans-and-checks_session-admission.md` 与证据目录；本记录不重复。

## 9. 稳定性（冻结声明兑现）

- `src app test` manifest：运行前 `11-worktree-src-app-test-sha256.txt`、运行中快照 `31b-manifest-diff-midrun.txt`、运行后 `50-manifest-post.txt` —— 均 **1,077 文件 / `5308e71a…`**，diff 0 行。
- 候选 38 文件聚合：运行前后均 **`b62c7c7c…`**；`git status --porcelain -- src app test` 与开工逐行一致（`50c-scope-diff.txt` 0 行）；HEAD/tree/分支/T1 三文件不变；暂存 0。
- 结论：**全部 T3 运行未改动任何产品/测试源码**；候选在运行期间未被外部改写。

## 10. 限制与披露

1. 方法差异：本运行默认 watchdog **300s**（参照 600s；chief-workflow 参照 360s）；6 挂起 90s 与参照同。300s 未导致任何文件因超时被误判（未登记 watchdog=0；全部长文件均在限内自然完成，最长 git-trunk-store 64.2s）。
2. 参照运行 C 之前有尝试 A/B 重叠；本运行为隔离运行（无并行测试），更严格。
3. 本记录只证明所运行命令/文件集上的观察；未运行真实模型/Electron（RR 另有记录）；不宣称「T3 单次全绿」——fail 196 条均为参照同源既有失败 + 上述 2 条非确定性条目。
4. Node v24.22.1 原生崩溃/清理抖动/顺序竞态为非确定性运行期现象；本轮未复现的条目（e-pi/git-trunk-store/interactive-execution-mode/download-provider）不改变参照基线登记，也不作为本变更的通过项。
5. 本记录不判验收；E3.1/E3 出口由 B2 独立验收依据 B1 v1 判定。

## 11. 纪律声明

- 只写本记录与同名证据目录（含 520 个逐文件原始日志、逐文件结果、对照文件、候选/manifest 快照）；未修改 `src/** app/** test/**` 源码/测试、角色卡/边界/YAML、构建配置、`docs/scheduling|acceptance|communication|planning`。
- 未 commit / push / 暂存 / 合并 / 发布；未 `npm install`；未运行真实模型/Electron/CDP。

## 12. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression-evidence/`

| 文件/目录 | 说明 |
| --- | --- |
| `00-opening-state.log` / `01*.txt` / `06-t1-hashes.txt` | 开工身份/环境/status/T1 |
| `07-candidate-files.txt` / `08-candidate-hashes.tsv` / `09-candidate-aggregate*.txt` | 候选身份（38 文件/聚合） |
| `11-worktree-src-app-test-sha256.txt` / `11-manifest-summary.txt` / `31b-manifest-diff-midrun.txt` / `50-manifest-post.txt` / `50-manifest-diff.txt` | 运行前/中/后 manifest 与稳定性 |
| `20-all-test-files.txt` / `20b-test-file-counts.log` / `21-test-file-diff-vs-E3.txt` | 文件枚举与对参照 diff |
| `31-t3-per-file-results.tsv`（520 行 + DONE）/ `31-t3-progress.log` / `31-node-leftovers.log` | 权威逐文件结果与进度/残留检查 |
| `logs/`（520 个 `.log`） | 逐文件原始日志 |
| `40-compare-vs-e3.sh` / `40-comparison/` | 对参照的多重集对照（summary/new/missing/skip/状态/目录聚合/计数对账/新文件结果/hang） |
| `41-compare-b0-vs-ref.sh` / `41-b0-vs-reference/` | 辅助 B0 与参照的差异解释 |
| `52-isolated-application-line-rerun.log` / `53-isolated-chief-workflow-rerun.log` | 新增失败的非确定性隔离复跑 |
| `50-post-stability.log` / `50b-scope-status-post.txt` / `50c-scope-diff.txt` / `51-t1-hashes-post.txt` | 收工稳定性 |
| `evidence-index.md` | 逐文件 SHA-256/行数/bytes 索引 |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

- 证据索引 `evidence-index.md`：SHA-256 `5642b2cc12cd78a66c5e4e87af2f748086ca1122fdecfd256a1ab84ffa30140f`（596 行 / 81602 bytes；590 个文件）。
