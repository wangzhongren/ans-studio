# Phase 3B bench 重基线（PM §10.3，最终构建，含 UIUX 3B 修正）

- 环境：同机同日（2026-10-21），Electron 44.7.0 / Node 24.21.0；旧入口 `app/renderer/index.html`，新入口 `app/renderer/dist/src/index.html`。
- 执行：旧/新**交替**各 4 轮；每目标**首轮预热不计**（`old-1`/`new-1` 原始值保留）；有效轮各 3（`old-2..4`、`new-2..4`）。
- 规则来源：PM 评审 §10.3（主阈值 + 离群护栏），未回溯修改。

## 有效轮原始值

| 指标 | 旧轮 2/3/4 | 旧中位 | 新轮 2/3/4 | 新中位 | 限值 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| `stormA.maxGap` (ms) | 19.8 / 17.8 / 25.3 | 19.8 | 17.6 / 17.7 / 17.6 | **17.6** | max(旧中位, 25) = 25 | PASS |
| `stormB.maxGap` (ms) | 17.6 / 17.4 / 17.4 | 17.4 | 17.7 / 19.5 / 19.2 | **19.2** | max(旧中位, 25) = 25 | PASS |
| `stormA_handler.maxMs` | 11.6 / 9.7 / 9.9 | 9.9 | 0.6 / 0.3 / 0.2 | **0.3** | max(旧×1.2, 旧+5) = 14.9 | PASS |
| `stormB_handler.maxBatchMs` | 0.4 / 1.2 / 1.6 | 1.2 | 0.3 / 0.8 / 1.0 | **0.8** | max(旧×1.2, 旧+5) = 6.2 | PASS |
| `replay.replayMs` | 12.3 / 20.3 / 21.5 | 20.3 | 5.4 / 6.4 / 5.4 | **5.4** | max(旧×1.2, 旧+5) = 25.3 | PASS |
| `scrollToBottom.ms` | 21.0 / 25.2 / 24.9 | 24.9 | 2.5 / 5.7 / 10.7 | **5.7** | max(旧×1.2, 旧+5) = 29.9 | PASS |

## 离群护栏（有效轮 maxGap，stormA+stormB 共 6 值）

- p95 = **19.5ms ≤ 35ms**：PASS。
- 单轮最大 = **19.5ms ≤ 50ms**：PASS。

## 其它读数

- 新入口 `replay.rows`/`mounted`/`scrollToBottom.mounted` 三轮一致（361）；console 0。
- 旧入口本轮 `replay.rows/mounted=1`（旧基准台在本次夹具下的读数；仅记录，不用于阈值比较——阈值只看上表指标）。
- 预热轮原始值保留：`old-1.json`、`new-1.json`。

## 结论

3B 后聊天热路径**不劣化**：全部主阈值与护栏通过；新入口 handler/replay/scroll 显著优于旧端。原始数据：本目录 `old-*.json`/`new-*.json`。
