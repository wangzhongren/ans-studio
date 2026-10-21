# bench 阈值预注册（执行前写入，待 PM 批准）

- 写入时间：2026-10-21（在本次 bench 执行之前）
- 依据：产品提案 revision 2 §六 Phase 3 门「bench-storm 不劣化」、PM 评审 Q5（bench 为基准台，阈值由测试在 Phase 3 前书面定义）、Q10；协调者建议口径。
- 状态：**待 PM 批准**。本验证按此临时口径判定，并保留原始数据供 PM 调整。

## 方法

1. 同机、同 Electron 44.7.0、离线；旧/新交替 3 轮：O1 → N1 → O2 → N2 → O3 → N3，每轮独立启动 `bench-storm.mjs`。
2. 旧目标：默认旧入口 `app/renderer/index.html`（不设 `ANS_RENDERER_ENTRY`）。
3. 新目标：`ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/src/index.html`。
4. 每轮独立 `BENCH_OUT`；取 3 轮**中位数**判定；同时记录每轮值与分布。

## 主判定阈值（必须全部满足）

| # | 指标 | 阈值 |
| --- | --- | --- |
| 1 | `stormA.maxGap`（ms） | 新中位 ≤ max(旧中位, **25ms**) |
| 2 | `stormB.maxGap`（ms） | 新中位 ≤ max(旧中位, **25ms**) |
| 3 | `stormA_handler.maxMs` | 新中位 ≤ max(旧中位 × **1.2**, 旧中位 + **5ms**) |
| 4 | `stormB_handler.maxBatchMs` | 新中位 ≤ max(旧中位 × **1.2**, 旧中位 + **5ms**) |
| 5 | `replay.replayMs` | 新中位 ≤ max(旧中位 × **1.2**, 旧中位 + **5ms**) |
| 6 | `scrollToBottom.ms` | 新中位 ≤ max(旧中位 × **1.2**, 旧中位 + **5ms**) |

## 有效性护栏（不达标则本轮数据作废，需重跑）

- 新旧 `stormA.frames` / `stormB.frames` 中位差 ≤ ±20%（保证采样窗口可比）。
- `replay.mounted` 与 `scrollToBottom.mounted` 新旧一致（预期均 1）。
- 每轮 `BENCH_DONE=1`、无超时/致命错误；`histPending.r1/r2` 与 `histDirect` 如实记录。

## 次要观察（记录不阻断）

- 每轮 maxGap 的 min/max 与 3 轮极差；`naive.storm300Ms` / `naive.replay2000Ms`（改造前机制代价参考）；console 消息数量。
