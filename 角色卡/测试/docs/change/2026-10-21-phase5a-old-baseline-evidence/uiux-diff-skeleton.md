# 5A uiux-v2 双端差异台账骨架（旧端已测，新端待冻结）

> 旧端结果见 [suite-index.md](suite-index.md) 与 `check-names/uiux-*.txt`；新端列在候选冻结后填写；不得用旧端结果代替新端。

| mode | 旧 exit | 旧报告条目 | 旧失败名（逐名） | 新 exit/report | 新失败名 | 分类（待定） | 依据/替代覆盖 | PM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BLANK | 0 | 6 | — | TBD | TBD | TBD | TBD | proposed |
| COMPLETE_FLOW | 0 | 41 | — | TBD | TBD | TBD | TBD | proposed |
| CONFIG | 0 | 21 | — | TBD | TBD | TBD | TBD | proposed |
| DEFAULT | 1 | 101 | `expired old shell collapses with reason visible in its own runtime` | TBD | TBD | TBD | TBD | proposed |
| DELIVERY_NOTE | 0 | 9 | — | TBD | TBD | TBD | TBD | proposed |
| DUP | 0 | 32 | — | TBD | TBD | TBD | TBD | proposed |
| FRESH | 0 | 4 | — | TBD | TBD | TBD | TBD | proposed |
| G2 | 0 | 5 | — | TBD | TBD | TBD | TBD | proposed |
| GOV | 0 | 7 | — | TBD | TBD | TBD | TBD | proposed |
| MERGE | 0 | 12 | — | TBD | TBD | TBD | TBD | proposed |
| MIRROR | 1 | 2 | `W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier` | TBD | TBD | TBD | TBD | proposed |
| NOTICE | 0 | 6 | — | TBD | TBD | TBD | TBD | proposed |
| PROJECT_RESET | 0 | 7 | — | TBD | TBD | TBD | TBD | proposed |
| QUEUE_VIEW | 0 | 4 | — | TBD | TBD | TBD | TBD | proposed |
| ROLE_FOCUS | 0 | 11 | — | TBD | TBD | TBD | TBD | proposed |
| RUNTIME | 1 | 16 | `expired old shell collapses with reason visible in its own runtime` | TBD | TBD | TBD | TBD | proposed |
| SELECTOR | 1 | 21 | `selector dimensions and viewport 1360` | TBD | TBD | TBD | TBD | proposed |
| SEND_FACTS | 0 | 8 | — | TBD | TBD | TBD | TBD | proposed |
| TERMINAL | 0 | 22 | — | TBD | TBD | TBD | TBD | proposed |
| TERMINAL_MERGE | 0 | 12 | — | TBD | TBD | TBD | TBD | proposed |
| TOOLFOLD | 1 | 15 | `tail fold movement bounded and non accumulating with the reading row still in view` | TBD | TBD | TBD | TBD | proposed |
| VISUAL | 0 | 54 | — | TBD | TBD | TBD | TBD | proposed |

## 旧端红的预设分类（待新端确认）

- DEFAULT/RUNTIME `expired old shell collapses with reason visible in its own runtime`：旧端无 C2 重锚载体，C 类；新端应 pass（4B 已通过）。
- SELECTOR `selector dimensions and viewport 1360`：旧菜单 180px vs 新 208px，旧端基线；新端应 pass。
- MIRROR five-role：旧端四角色夹具；新端五角色应 pass。
- TOOLFOLD `tail fold movement bounded…` / `fold anchor offsets=null`：旧端 C1 旧口径，C 类；新端 Δ=16 应 pass。
- design audit：旧端不支持新工具组载体，old-only/N/A；新端 5A-0 目标切换后应 pass。
- lazy：新端专用，old N/A。
- main `RECOVERY_SAME_PENDING_CARD_ONCE=false`：旧/新同名为 false；旧端相邻恢复检查 true，单点同 id 回放去重；C 类，新端需复判是否同因。

## 新端待填

1. 对每个 mode 用 `ANS_RENDERER_ENTRY=app/renderer/dist/src/index.html` 重跑，填 new exit/report/失败名。
2. 旧/新 check 名逐名对账；新增/删除/值差异进入允许差异清单并请 PM 批准。
3. 新端失败若为产品缺陷，不填成“预期差异”。

