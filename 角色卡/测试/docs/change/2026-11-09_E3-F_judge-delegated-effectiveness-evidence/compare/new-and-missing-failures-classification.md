# E3-F (2026-11-09 judge-delegated-effectiveness) — new/missing failure classification vs reference E3-F (540 files, 5,032/4,807/192/1/32)

方法：对受信任失败对（file + test name）多重集 diff（`compare/new-failures.tsv` / `missing-failures.tsv`），随后逐条以同候选隔离复跑分类（`isolated/runs/`）。

## 多重集对照（机器结果，`compare/summary.txt`）

- 参照受信任失败对：**192**（实际 fail 192）
- 本轮受信任失败对：**196**（实际 fail 197；chief-workflow fail 15/配对 13、turn-watch cancelled 1 计入配对——与参照同解析口径）
- **新增失败：4；既有失败消失：0；新增 skip：0；既有 skip 消失：0**

## NEW failures = 4（逐条）

### 1–3. `test/桌面应用/chief-workflow.test.ts` — `W47 …select…`、`W47 …revise…`、`selected`

- 主跑失败原文（`logs/test__桌面应用__chief-workflow.test.ts.log`）：
  - `W47 默认Core/Codex本地HTTP：忙Chief独立select释放真实卡调用` → `[Error: ENOTEMPTY: directory not empty, rmdir '…\ans-w47-default-chief-<rand>\.ans\sessions\chief\codex\ans']`
  - 同上 `…revise…` → 同类 `ENOTEMPTY`（fixture 清理竞态，非产品断言）
  - `selected` → 同类 `ENOTEMPTY`（`ans-w4-selected-…`）
- **同候选隔离复跑**（`isolated/runs/chief-workflow-rerun-1/`，同一文件、同一命令、300s watchdog）：
  - 本体 summary 63 tests / **51 pass / 12 fail**（主跑 48/15）；进程在 300s 内未退出（exit 124，watchdog；summary 完整）。
  - 失败集合再次变化：复跑含 `commit-race`、`W47 select`、`selected`；主跑的 `W20`、`W47 revise`、`unmanaged` 在复跑中通过；`W14/W19/W22/W23/W28×2/W33/W34` 两轮同名失败（基线族）。
  - 同族先例：提案卡修复 D1 两轮 63/51/12 与 63/49/14（失败并集 = 基线名 + {W20、W29、W10/unmanaged、W47 revise}）；W-J4 before/after1/after2 与 E3 四次 15/14/11/14；W20/W29/W10/W47 隔离复跑均记录 ENOTEMPTY/原生 teardown 抖动。
- 分类：**既有非确定性清理/时序族（ENOTEMPTY/AggregateError/waitFor），非新增确定性失败**；未改任何断言（候选冻结且该文件属 HEAD 基线中间提交内容，非本变更写集）。

### 4. `test/测试/git-run-stop-host-continuation-e2e.test.ts`（HEAD 基线新增文件，非本变更）— 文件级合成条目

- 主跑（`logs/test__测试__git-run-stop-host-continuation-e2e.test.ts.log`）：进程原生崩溃——
  `node::CleanupQueue::Add(Callback, void *) at src\cleanup_queue-inl.h:24` / `Assertion failed: (insertion_info.second) == (true)`，
  随后 TAP 出现文件级 `✖ test\测试\git-run-stop-host-continuation-e2e.test.ts`（`test failed`，21.2s）；非测试断言失败。
- **同候选隔离复跑**（`isolated/runs/run-stop-e2e-rerun-1/`）：自然 exit 0，**1 test / 1 pass / 0 fail**，43.7s。
- 同族先例：E3 §3.5 / E3-F §3.5 与 W-J5 §4.3 已登记 Node v24.22.1 原生 `CleanupQueue::Add` teardown 崩溃（同候选多次运行随机出现；`git-action-activation-e2e`/`git-action-delivery-claude-e2e`/`e-pi`/`git-trunk-store` 等）。
- 分类：**环境性原生崩溃（非确定性），非新增确定性失败**；文件属 HEAD 基线（不在 25 文件写集）。

## MISSING failures = 0

参照 192 条受信任失败对在本轮全部复现（含 `W20`、`unmanaged` 等波动名——本轮与参照侧同族但集合不同，恰好全部命中；`missing` 为空）。无“既有失败消失/转绿”需分类。

## 与 D1 / W-J5 amendment 基线的差异（test-role 7 文件，如实）

| 项 | D1 组合（同一候选） | 本轮 E3-F |
| --- | --- | --- |
| D1 7 文件 raw | 9 tests / 8 pass / 1 fail（effectiveness 进程未退出 → 文件级合成） | 8 tests / 7 pass / 1 fail（run-stop e2e 原生崩溃 → 文件级合成） |
| 真实用例（归一化） | 8/8 pass | 7/7 pass（effectiveness 自然 1/1 65.4s；run-stop 隔离复跑 1/1） |
| 文件级合成条目 | effectiveness（本文件本轮不存在——自然退出） | run-stop e2e（D1 中自然 1/1） |

说明：两者均为**同一原生/挂起族在不同文件上的随机命中**；本轮的 effectiveness 自然退出（改善），run-stop e2e 原生崩溃经隔离复跑排除（环境性）。新增确定性失败仍为 0。

## Summary for B1-EV1 / BASE-3

- 新增确定性失败 = **0**；新 skip = **0**（skip 多重集 31/31 一致）。
- 4 条 NEW 配对：3 条 chief-workflow ENOTEMPTY 清理竞态（隔离复跑集合漂移）+ 1 条 run-stop e2e Node 原生 `CleanupQueue::Add` 崩溃（隔离复跑 1/1 自然通过）——均环境性/非确定性。
- 既有失败消失 = 0。
- 未删除/弱化任何断言；未新增 skip/todo；未 force-exit。
