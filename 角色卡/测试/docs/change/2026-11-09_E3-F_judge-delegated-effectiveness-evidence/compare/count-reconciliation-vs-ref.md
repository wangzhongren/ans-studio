# E3-F (2026-11-09 judge-delegated-effectiveness) — count reconciliation vs reference E3-F (540 files)

Reference E3-F (2026-11-08 remove-predictive-gates, `41a4a215…`): **534 naturally-completed files = 5,032 / 4,807 / 192 / 1 / 32 / 0**
(6 registered-hang files excluded from counts, same 6 names as this run).

Ours (this run): **541 naturally-completed files = 5,075 / 4,845 / 197 / 1 / 32 / 0**
(6 registered-hang files excluded; no unregistered watchdog; no natural-exit-no-summary.)

## Totals by origin

| origin | files | tests | pass | fail | cancelled | skipped |
| --- | --- | --- | --- | --- | --- | --- |
| existing (same path as reference, natural) | 534 | 5,067 | 4,838 | 196 | 1 | 32 |
| baseline-added (in HEAD after reference run; 5 e2e files) | 5 | 5 | 4 | 1 | 0 | 0 |
| change-new (this change; 2 files) | 2 | 3 | 3 | 0 | 0 | 0 |
| **TOTAL** | **541** | **5,075** | **4,845** | **197** | **1** | **32** |

delta vs reference: **+43 tests / +38 pass / +5 fail / 0 cancelled / 0 skipped**；参照测试用例删除 = 0（文件清单 540→547 仅新增 7，无删除）。

## Decomposition of +43 tests

同路径既有文件（13 个，+35；逐文件实测见 `count-deltas-vs-ref.tsv`）：

| # | 文件 | ref(t/p/f) → ours(t/p/f) | Δtests | 归因 |
| --- | --- | --- | --- | --- |
| 1 | test/runtime-core/direct-role-capabilities.test.ts | 11/11/0 → 13/13/0 | +2 | W-J1 |
| 2 | test/runtime-core/version-change-contract.test.ts | 15/14/1 → 18/17/1 | +3 | W-J1 |
| 3 | test/编排/direct-role-capabilities.test.ts | 35/34/1 → 43/42/1 | +8 | 提案卡修复 A′ +5 / W-J2 +3 |
| 4 | test/编排/task-state.test.ts | 19/19/0 → 20/20/0 | +1 | W-J2 |
| 5 | test/编排/trunk-events.test.ts | 4/4/0 → 5/5/0 | +1 | W-J2 |
| 6 | test/编排/version-change-service.test.ts | 15/15/0 → 16/16/0 | +1 | W-J2 |
| 7 | test/门禁引擎/direct-role-capabilities.test.ts | 22/22/0 → 23/23/0 | +1 | W-J3 |
| 8 | test/门禁引擎/git-shell-acl.test.ts | 36/36/0 → 39/39/0 | +3 | W-J3 |
| 9 | test/桌面应用/decision-service.test.ts | 20/20/0 → 22/22/0 | +2 | W-J4 |
| 10 | test/桌面应用/run-change-trigger.test.ts | 9/0/9 → 10/1/9 | +1 | W-J4 |
| 11 | test/roles/nominator/nominator-module.test.ts | 13/13/0 → 15/15/0 | +2 | W-J2b |
| 12 | test/claude-adapter/session.test.ts | 65/65/0 → 71/71/0 | +6 | HEAD 基线中间提交 `6ab0d2d`（非本变更） |
| 13 | test/桌面应用/chief-workflow.test.ts | 59/48/11 → 63/48/15 | +4 | HEAD 基线中间提交 `fb1aa39`（+4 新用例全 pass）；fail +4 为清理竞态波动族（见 classification） |

新增测试文件（7 个，+8）：

- 本变更 change-new（2）：`test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts` 2/2、`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` 1/1（自然退出 65.4s）。
- HEAD 基线 baseline-added（5）：`git-action-activation-e2e` 1/1、`git-action-commit-claude-e2e` 1/1、`git-action-commit-pi-e2e` 1/1、`git-action-delivery-claude-e2e` 1/1、`git-run-stop-host-continuation-e2e` 1/0/1（Node 原生 `CleanupQueue::Add` 崩溃的文件级条目；隔离复跑 1/1 自然通过 43.7s）。

Sum: 35 + 8 = **+43** ✔

## Pass/fail reconciliation (measured)

- pass: 4,807 + 35（同路径新增用例全部 pass）+ 7（新文件 pass）− 4（chief-workflow 波动族 fail +4）= **4,845** ✔
  - chief-workflow：ref 59/48/11 → ours 63/48/15（+4 新用例 pass；fail +4，均为 ENOTEMPTY/清理竞态族：W20、W47 select、W47 revise、selected、unmanaged 进出；参照/各批/隔离复跑集合逐轮漂移）。
- fail: 192 + 4（chief-workflow 波动族）+ 1（run-stop e2e 原生崩溃文件级）= **197** ✔（分类见 `new-and-missing-failures-classification.md`）
- cancelled 1 = `test/测试/turn-watch-verify/b-last-resort.test.ts`（3/2/0/1，与参照同）。
- skipped 32 = 32；31 条打印 skip 名多重集与参照逐条一致（new=0 / missing=0）。

## Registered hangs (not counted; same 6 as reference; partial summaries identical)

`hang-and-timeout.txt`：write-sequencing 4/3/1、directive-decision 1/0/1、optional-acceptance 3/2/1、session-rebuild-race 17/14/3、stuck-redispatch 7/4/3、customer-authorization-plane-integration 1/0/1——6 个部分 summary 与参照逐项相同。
（B1 BASE-3 的 optional-acceptance 6/2/1/3/0 为另一命令口径；本 E3-F 按参照挂起口径 90s 记录其部分 summary 3/2/1，不计入合计。）
