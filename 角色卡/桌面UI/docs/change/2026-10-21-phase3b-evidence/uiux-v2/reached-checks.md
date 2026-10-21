# Phase 3B uiux-v2 相关段（新入口）到达点

目标切换：`ANS_RENDERER_ENTRY=$PWD/app/renderer/dist/src/index.html`；断言未改、未弱化。各段原始 `report.json` 与运行日志在本目录各子目录。

| 段 | 运行方式 | 到达 check | 失败名 |
| --- | --- | --- | --- |
| 默认段 | 无 `*_UI_ONLY` | 10 | `one independent work list without duplicated role documents`（工作概览/队列抽屉，Phase 4；台账 B1） |
| JUDGE | `ANS_JUDGE_UI_ONLY=1` | 33 | 无（33/33 true） |
| G2_RECOVERY | `ANS_G2_RECOVERY_UI_ONLY=1` | 5 | 无（5/5 true） |
| TERMINAL | `ANS_TERMINAL_UI_ONLY=1` | 22 | 无（22/22 true） |
| TOOLFOLD | `ANS_TOOLFOLD_UI_ONLY=1` | 17 布尔 + 2 条锚点信息 | 无；C1 由 51→16px 转绿 |
| SEND_FACTS | `ANS_SEND_FACTS_UI_ONLY=1` | 9 | `P7 old runtime rejected result cannot disable current runtime or overwrite draft`（依赖每引擎会话状态，Phase 4） |
| QUEUE_VIEW | `ANS_QUEUE_VIEW_UI_ONLY=1` | 2 | `queued baseline shows two`（抽屉队列内容，Phase 4） |

说明：

- 这些失败名均为台账/PM 已登记的 Phase 4/5 范围；3B 未为通过它们拉入工作概览、队列抽屉或引擎切换。
- G2 段主进程 stdout 的 `No handler registered for 'recovery:confirm-response'` 是套件替身**故意缺通道**，用于验证「通道缺席 ⇒ fail-closed 不执行」；渲染侧行为符合断言。
- `TOOLFOLD_UI_PASS 19` 为套件内部计数（17 个布尔 check + 2 条锚点信息）。
- 旧入口 toolfold 同日基线（`old-toolfold/report.json`）：到达 14 个布尔 check，13 通过；C1 失败（150→182，Δ=32），套件在 C1 处终止（后续 3 项未运行）。
