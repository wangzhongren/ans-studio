# B5.2 证据索引（2026-11-10）

任务：`2026-11-10-two-fixed-workflow-paths` B5.2（测试角色，独立固定上下文）。
HEAD `e645e4e`；分支 `feat/two-fixed-workflow-paths`。本目录只存本批证据；未提交/未推送。

## 1. 基线与候选

| 文件 | 内容 |
| --- | --- |
| `baseline.txt` | 本批开始前工作树（HEAD/branch/git status/src·app·test 文件 sha256） |
| `candidate-hashes.txt` | 候选（仅 `test/测试/fixed-path-full-chain.test.ts` M）：基线与新 hash、行数/字节、聚合 |
| `deglue-checklist.txt` | 8 处宿主 glue 移除清单 → 生产触发/断言对照 |
| `git-status-writeset.txt` | 写集外检查（`git status --porcelain -- src app test`；B5.1/B5 基线归属说明） |

## 2. 全链复跑（去 glue）

| 文件 | 内容 |
| --- | --- |
| `before-glue-chain.tap` | 过渡态基线（glue 在）全链 2/3：路径 A 在 glue A1 双记处失败（B5.1 已披露） |
| `b52-chain.tap` | 去 glue 后全链 **3/3 pass**（路径 A delivered / 路径 B delivered / B 无仓库 fail-closed） |
| `b52-chain-rerun.tap` | 去 glue 后全链第二次复跑 **3/3 pass**（确定性） |
| `mode-switch.tap` | 回归 3/3 pass |
| `b-change-scope.tap` | 回归 2/2 pass |
| `typecheck-before.txt` / `typecheck-after.txt` | `npm run typecheck` before/after 均 exit 0 |

## 3. D1（受影响域 `test/测试`，同 B5 口径）

- 方法：`run-tests.mjs`（逐文件独立进程 + TAP；登记挂起文件 90s、其余 300s watchdog；未用
  `--test-force-exit`）；文件列表 `d1-test-file-list-{before,after}.txt`（119 文件 = 116 既有 + 3 B5）。
- `d1-before-test-domain/` + `d1-before-run.log.txt`：before（glue 在）711 / 653 / 39 / 1 / 18；
  `d1-before-analysis.txt`：not-ok 40，vs B5 冻结 known-red added 1（= glue 过渡态路径 A）/ removed 0。
- `d1-after-test-domain/` + `d1-after-run.log.txt`：after 原始 709 / 650 / 40 / 1 / 18（3 挂起）；
  `d1-after-adjusted.txt`：一次性环境异常披露 + 修正后 711 / 654 / 38 / 1 / 18，
  修正后 vs B5 冻结 known-red added 0 / removed 0。
  - 域内 V8 原生 abort（exit 134，`git-command.ts noLinks`，一次性）：`judge-delegated-effectiveness`
    （域内第 2 个文件即崩溃，早于本批修改文件执行）、`git-action-delivery-claude-e2e`；
    域内 300s 超时：`git-action-commit-pi-e2e`、`git-run-stop-host-continuation-e2e`。
- `d1-after-rerun/`：上述 4 个异常文件隔离复跑全部 1/1 pass（judge-delegated-effectiveness 复跑 #1
  再次原生 abort、#2 pass 1/1；其余一次通过）⇒ 补足后 after = 711 / 654 / 38 / 1 / 18。
- `d1-diff/`：`diff-failures.mjs` before vs after 失败名集合 diff（原始：added 2 一次性 abort /
  removed 1 glue 过渡态）+ `after-failures-flat-adjusted.txt`（修正后 39 条）。
- 判定：**新增确定性失败 = 0；新 skip = 0；known red 不恶化（39/39 逐名一致）**。

## 4. 依据（只读）

- B1 验收 `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`
  sha256 `b607f100…`；团队计划 `4c63ccbc…`；设计 v1.3 `ae737dcf…`。
- B5 记录 `角色卡/测试/docs/change/2026-11-10_B5_two-fixed-workflow-paths.md` sha256 `6665b1ce…`。
- B5.1 桌面记录 `角色卡/桌面窗口/docs/change/2026-11-10_B5.1_two-fixed-workflow-paths-desktop.md`
  sha256 `4fb9b35c…`；交接证据 `_evidence/chain-no-glue.diff` sha256 `a5b8e019…`、
  `b5-chain-no-glue.tap` sha256 `f1b0358c…`。
