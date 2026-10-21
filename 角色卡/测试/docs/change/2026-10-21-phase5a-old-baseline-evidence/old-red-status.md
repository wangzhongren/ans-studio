# Phase 5A 旧端快照：红/差异登记（测试角色）

**entry**：`app/renderer/index.html`；**旧端结果只作 5A 基线，不代表新端**。完整命令/退出码见 [suite-index.md](suite-index.md)，逐名见 `check-names/`。

> **套件版本限制（2026-10-21 补记）**：本文件 uiux 报告生成于 18:04–18:05，套件 `d568bf82…`；旧端 main 的 357 名也是该时点旧套件快照。20:44 旧端 main 已用最终套件 `fa3f74d4…` 复跑为 **391 名**（final3 `raw/main-old/report.txt`）；旧端 uiux 未用最终套件复跑，旧端已删除、不可补跑。旧通过名 424 个在新端全为 true（0 旧通过→新失败），见 [5a-old-vs-final3-uiux.txt](../2026-10-21-phase5b-new-entry-evidence/main-diff/5a-old-vs-final3-uiux.txt)。

## uiux-v2 失败模式（报告仍落盘）

| mode | exit | 失败名 | 观测/归类 |
| --- | --- | --- | --- |
| DEFAULT | 1 | `expired old shell collapses with reason visible in its own runtime` | 旧端无 C2 重锚语义（卡/原因载体不同）；旧端基线，C 类 |
| SELECTOR | 1 | `selector dimensions and viewport 1360` | 旧端菜单 180px/旧几何，新端 4B 改为 208px；旧端基线，B/C 类 |
| RUNTIME | 1 | `expired old shell collapses with reason visible in its own runtime` | 同 DEFAULT；旧端无 C2 重锚语义，C 类 |
| MIRROR | 1 | `W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier` | 旧端四角色口径，无 verifier；旧端基线，B/C 类 |
| TOOLFOLD | 1 | `tail fold movement bounded and non accumulating with the reading row still in view` | 旧端 C1 Δ=32（历史口径），新端 Δ=16；旧端基线，C 类 |

旧端通过的其余 uiux 模式（exit 0，共 18）：FRESH、ROLE_FOCUS、TERMINAL、SEND_FACTS、TERMINAL_MERGE、VISUAL、DELIVERY_NOTE、COMPLETE_FLOW、PROJECT_RESET、DUP、CONFIG、MERGE、G2、JUDGE、GOV、NOTICE、BLANK、QUEUE_VIEW。旧端 VISUAL/DELIVERY_NOTE/COMPLETE_FLOW 的报告见 `raw/uiux/*/report.json`（COMPLETE_FLOW 41 条含 40 true + 1 报告对象；旧端 P7 已通过，旧端该段无 Phase 5 缺口）。

## 其他旧端红/不适用

| 套件 | 结果 | 归类 |
| --- | --- | --- |
| main.mjs | exit 0，`E2E_DONE=1`，`E2E_PASS=false`，`E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE` | **C 类旧端基线**：恢复后同 id 卡 2 张；旧端相邻 `RECOVERY_*`（VIBIBLE/NO_AUTO/OLD_STILL_ANSWERABLE/ENDED_NOT_REPLAYED/DIAGNOSTICS）均 true，仅此一条 false；与 2026-10-14 干净夹具 true 对照，当前仓库真实会话历史下复现，非入口切换引入 |
| uiux-design-audit | exit 1，无 report.json；`error.txt` lastJs 在 S1 折叠摘要夹具取 `#chat .tool-records` 为 null → renderer eval 失败 | 旧端不支持新工具组载体；**old-only/不适用**，C 类 |
| 懒挂载 | exit 2；`LAZY_DENIED_DIRECT_VISIBLE=false`、`#chat .tool-records` null | 新端专用正向检查；旧端 **new-only/N/A**，不作为旧端红 |
| Node 单测 / 旧基线 | 96/96、683/683 exit 0 | 通过（raw `raw/node/baseline.txt`；679 基线 +4 桌面窗口 5A 检查 = 683） |

## 旧端与桌面窗口 5A 报告的关系

桌面窗口已产出 main.mjs 双端 `report-diff`（old 357/new 366/common 356/only-old 1/only-new 10/值差异 103）。测试本轮**独立复跑旧端 main**，得到同样的 357 名与同一 `RECOVERY_SAME_PENDING_CARD_ONCE=false`；新端 366 名/103 值差异引用其证据建立允许差异台账骨架（[main-diff/allowed-diff-ledger.md](main-diff/allowed-diff-ledger.md)）。新端全量与最终值判定等候选冻结后由测试重跑，不把桌面窗口新端结果直接当作测试结论。

## 待新端冻结后核对

1. 上述 5 个 uiux 失败名在新端是否 pass/rename；逐名登记允许差异。
2. main.mjs 新端 10 项 only-new/103 值差异逐名分类（尤其 `NAVIGATION_BLOCKED`、`PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 是否为 5A 新端缺口）。
3. `RECOVERY_SAME_PENDING_CARD_ONCE` 新端是否仍 false；若仍 false，判定与旧端同因还是新端恢复链新增缺陷。
4. design audit/lazy 新端目标切换后是否能跑；旧端不适用项登记 NEW-ONLY。
5. 所有未批准差异不得进入 5B。
