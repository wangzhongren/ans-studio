# 5A uiux-v2 / design audit 双端差异台账（新端全量后）

**旧端**：`2026-10-21-phase5a-old-baseline-evidence/raw/uiux/*`；**新端**：本目录 `raw/uiux/*`；入口分别为 `app/renderer/index.html` 与 `app/renderer/dist/src/index.html`。逐名文件在两端 `check-names/`。PM 决定均 proposed；未批准不得进入 5B。

| suite/mode | 旧 exit/失败名 | 新 exit/失败名 | 状态 | 旧→新依据 | 替代覆盖/处置 | PM |
| --- | --- | --- | --- | --- | --- | --- |
| FRESH | 0 / — | 0 / — | MATCH | 同名同值 | — | — |
| ROLE_FOCUS | 0 / — | 0 / — | MATCH | 11 条（9 布尔）全过 | — | — |
| TERMINAL | 0 / — | 0 / — | MATCH | 22/22 | — | — |
| SEND_FACTS | 0 / — | 0 / — | MATCH | 8/8 | — | — |
| VISUAL | 0 / — | 0 / — | MATCH | 54/54（52 布尔 + 2 测量） | — | — |
| DELIVERY_NOTE | 0 / — | 0 / — | MATCH（缺口关闭） | 9/9；`builtin identity…` 新端 true | Sidebar 身份徽标已关闭 | proposed |
| CONFIG | 0 / — | 0 / — | MATCH | 21/21 | — | — |
| RUNTIME | 1 / `expired old shell collapses with reason visible in its own runtime` | 0 / — | OLD-ONLY/REMOVED | 旧端无 C2 重锚载体；新端 C2 真值 true（17/17） | 旧失败登记为旧端基线，不占新端门 | proposed |
| SELECTOR | 1 / `selector dimensions and viewport 1360` | 0 / — | OLD-ONLY/REMOVED | 旧菜单 180px/旧几何；新端 208px 27/27 | 旧实现差异 | proposed |
| MIRROR | 1 / `W6-C five-role tree…` | 0 / — | OLD-ONLY/REMOVED | 旧端四角色夹具；新端五角色 8/8 | 旧夹具差异 | proposed |
| TOOLFOLD | 1 / `tail fold movement bounded…`；`fold anchor offsets=null` | 0 / — | OLD-ONLY/REMOVED | 旧端 C1 旧口径；新端 19/19、Δ=16 | 旧基线 | proposed |
| QUEUE_VIEW | 0 / — | 0 / — | MATCH | 4/4 | — | — |
| GOV | 0 / — | 0 / — | MATCH | 7/7 | — | — |
| JUDGE | 0 / — | 0 / — | MATCH | 33/33 | — | — |
| G2 | 0 / — | 0 / — | MATCH | 5/5 | — | — |
| MERGE | 0 / — | 1 / `full rebuild retains unpersisted live report settled and original pending card` | **NEW-FAIL** | 新端 full rebuild 保留/卡身份/终端行之一不满足；旧端 12/12 | 真实候选缺陷/需修复或重锚并 PM 批准；不得静默豁免 | proposed |
| DUP | 0 / — | 1 / `history first then typed live still one` | **NEW-FAIL** | 旧端 32/32；新端 history-first 后 live 出现重复载体 | 真实/载体差异待判；需等价新检查 | proposed |
| PROJECT_RESET | 0 / — | 1 / `new project first DOM clears old badges before events` | **NEW-FAIL** | 新项目首次 DOM/会话重置条件不满足 | 真实会话重置缺陷/夹具候选；需修复或重锚 | proposed |
| NOTICE | 0 / — | 1 / `live system notice is its own sys row with 系统 badge, not a user bubble` | **NEW-FAIL** | 新端实时系统通知未呈独立 sys 行；旧端 6/6 | 真实呈现缺陷候选 | proposed |
| BLANK | 0 / — | 1 / `fixture: background pane has queue/status rows but no transcript` | **NEW-FAIL** | 新端后台 pane fixture 未建立/呈现队列状态行 | 真实/夹具候选；需修复或重锚 | proposed |
| TERMINAL_MERGE | 0 / — | 1 / `same actual turn and outcome denied plus settled has one readable terminal` | **NEW-FAIL** | 新端同轮 denied+settled 出现两条「本轮已中止」；旧端合并为一条 | 真实合并缺陷候选 | proposed |
| DEFAULT | 1 / `expired old shell collapses…` | 1 / raw `anchor paragraph materialized 960` | **BOTH-FAIL（不同）** | `incremental reader anchor`/`full replay preserves content identity` 报告值相等；随后 toggleDrift 960 锚点段落未物化 | 虚拟窗口阅读锚点仍未完全关闭（Phase 5）；需修复 | proposed |
| COMPLETE_FLOW | 0 / — | 1 / raw `role reading fixture must really scroll`（报告 37 条全 true） | **NEW-FAIL（Phase 5）** | P7 与 C/P3 名单全过；随后角色文档阅读夹具未真滚动 | P7 缺口已关闭；role-reading Phase 5 缺口仍在 | proposed |
| uiux-design-audit | 1 / S1 夹具 `#chat .tool-records` null（script eval） | 1 / 12 条 v3 断言失败（旧 DOM 夹具不匹配） | **BOTH-FAIL** | 新端 v3 失败：行距/可见行/chip/W6b/注入行高/S2/截断/loading/徽标/转轮/reduced-motion 等 12 条 | 建议：v3 旧 DOM 夹具重锚到新载体，或退役并由新端等价检查覆盖；测试不改产品断言，需桌面UI/PM 决定 | proposed |
| lazy（补充） | 2 / `LAZY_DENIED_DIRECT_VISIBLE=false` | 0 / 10/10 | NEW-ONLY（旧 N/A） | 新端专用工具组正向检查 | 旧端不适用 | — |

**结论**：三项缺口 Sidebar 与 P7 已关闭；虚拟锚点 `full replay` 通过但 toggleDrift 仍红；另 6 个 uiux 模式新端早停（MERGE/DUP/PROJECT_RESET/NOTICE/BLANK/TERMINAL_MERGE），design audit 12 条旧 DOM 夹具失配。除旧端专属/新端已过项外，**NEW-FAIL 均不得进入 5B**，需修复或 PM 批准的等价重锚。
