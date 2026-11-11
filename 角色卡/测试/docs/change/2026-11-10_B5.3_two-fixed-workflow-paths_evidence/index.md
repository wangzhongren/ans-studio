# B5.3 证据索引（2026-11-10）

任务：`2026-11-10-two-fixed-workflow-paths` B5.3（测试角色，独立固定上下文；B2.1 后全链/D1 复跑）。
HEAD `89e0ed6`；分支 `feat/two-fixed-workflow-paths`。本目录只存本批证据；未提交/未推送。
候选 = 无（本批 `test/测试/**` 零改动）；记录见 `../2026-11-10_B5.3_two-fixed-workflow-paths.md`。

## 1. 基线与候选

| 文件 | 内容 |
| --- | --- |
| `baseline.txt` | 本批开始前工作树（HEAD/branch/git status/src·app·test 域文件 sha256 + 119 文件清单） |
| `candidate-hashes.txt` | 候选=无；三个 fixed-path 测试文件 hash（与 B5.2 候选/`e28923c` 一致）；B2/B2.1 改动域 |
| `git-status-writeset.txt` | 写集外检查（`git status --porcelain -- src app test` 空） |

## 2. 全链复跑（B2.1 后）

| 文件 | 内容 |
| --- | --- |
| `b53-chain.tap` / `b53-chain-rerun.tap` | 全链 **3/3 pass** 两次（TAP；路径 A delivered / 路径 B delivered / B 无仓库 fail-closed） |
| `b53-chain.spec.txt` / `b53-chain-rerun.spec.txt` | 同两次的 spec 输出（另两次运行同样 3/3） |
| `mode-switch.tap` / `mode-switch.spec.txt` | 回归 3/3 pass |
| `b-change-scope.tap` / `b-change-scope.spec.txt` | 回归 2/2 pass |
| `typecheck-before.txt` / `typecheck-after.txt` | `npm run typecheck` before/after 均 exit 0（同树） |

## 3. D1（受影响域 `test/测试`，同 B5.2 口径）

- 方法：`run-tests.mjs`（逐文件独立进程 + TAP；登记挂起文件 90s、其余 300s watchdog；未用
  `--test-force-exit`/新增超时）。文件列表 `d1-test-file-list-before.txt` / `d1-test-file-list-after.txt`
  （119 文件，一致）；文件 hash 快照 `d1-test-file-hashes-before.txt` / `d1-test-file-hashes-after.txt`；
  复现命令见 `d1-analysis-commands.txt`。
- **before/after 语义**：本批无候选改动（树层面 before≡after）；before 参照 = B5.2 验收态冻结
  known-red（`ref-knownred-b52-flat.txt`，39 条；对应域树 = 提交 `e28923c`）；after = 本批在 HEAD
  `89e0ed6` 的域运行。`d1-after-test-domain/` + `d1-after-run.log.txt` 为原始语料
  （results.tsv / failing-names.json / totals.json / 每文件 TAP）。
- `ref-knownred-b52.json` 为参照的 JSON 形态（`ref-flat-to-json.mjs` 转换）。
- `d1-diff/`：`diff-failures.mjs` 失败名集合 diff（参照 → after 原始/修正后）。
- `d1-after-adjusted/`（如有一次性环境异常）：`build-adjusted.mjs` 以隔离复跑结果替换异常文件后的
  计数与失败名集合；`d1-after-rerun/` 为隔离复跑 TAP。
- 判定口径：known red 不恶化；新增确定性失败 = 0；新 skip = 0。

## 4. 依据（只读）

- B1 验收 v1 `b607f100…`、v1.1 `e2ad4701…`；团队计划 `4c63ccbc…`；设计 v1.3 `ae737dcf…`。
- B5.2 记录 `0ac3a0d9…`；B2.1 编排记录 `a7bb4bff…`；B2.1 桌面记录 `c110313a…`。
- B2.1 提交：`5820fe4`（编排 basis amend/verified 节流/A12a/A12b `verifyBasisForStage`）、
  `b203e98`（桌面收口门/派发门接线）。
