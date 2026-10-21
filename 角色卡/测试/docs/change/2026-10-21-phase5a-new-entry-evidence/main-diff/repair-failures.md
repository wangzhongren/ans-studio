# 5A main.mjs 10 项新端 repair 失败归因

> 旧/新值来自独立旧端/新端 `report.txt`；真实产品缺陷必须 5A 前修复，不能以允许差异静默豁免。

| # | check | 旧值 | 新值 | 归因/处置 | PM |
| --- | --- | --- | --- | --- | --- |
| 1 | `SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND` | `true` | `false` | 真实行为缺陷候选：同角色再点击未触发后端重新确认（会话修复） | proposed |
| 2 | `SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE` | `true` | `false` | 真实行为缺陷候选：显式恢复后投递非恰一次 | proposed |
| 3 | `SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND` | `true` | `false` | 真实行为缺陷候选：补开失败仍发送（fail-closed） | proposed |
| 4 | `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` | `true` | `false` | 真实行为缺陷候选：补开失败用户气泡行数不符 | proposed |
| 5 | `SESSION_REPAIR_FAILED_OPEN_NO_REPLAY` | `true` | `false` | 真实行为缺陷候选：补开失败后回放/发送计数变化 | proposed |
| 6 | `PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE` | `true` | `false` | 真实行为缺陷候选：重载后同角色待确认卡/按钮不可见 | proposed |
| 7 | `RECOVERY_SAME_PENDING_CARD_ONCE` | `false` | `false` | C 类旧端同因（旧/新均 false，同 id 2 张）；新端另有恢复链失败，需复判 | proposed |
| 8 | `RECOVERY_OLD_REQUEST_STILL_ANSWERABLE` | `true` | `false` | 真实行为缺陷候选：恢复后旧请求不可作答 | proposed |
| 9 | `RECOVERY_ENDED_REQUEST_NOT_REPLAYED` | `true` | `false` | 真实行为缺陷候选：恢复重放复活已结束请求 | proposed |
| 10 | `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` | `true` | `false` | 诊断字段差异候选：缺 renderer.event-error/viewport/replay/recovery 等事件；非用户行为，但无等价新检查 | proposed |

## 判定

- **真实行为缺陷候选（9）**：5 项 SESSION_REPAIR、1 项 PENDING、RECOVERY_OLD/ENDED（2 项）以及 RECOVERY_SAME 的新端恢复链部分；5A 门不得通过，停手回 PM。
- **C 类同因（1）**：RECOVERY_SAME_PENDING_CARD_ONCE 旧端同因；但新端同名为 false 且伴随旧端没有的恢复失败，不能仅按旧 C 豁免。
- **诊断字段候选（1）**：DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS 缺 renderer.* 事件；若 PM 认定属调试字段且提供等价新检查，可登记允许差异，否则按产品可观测性缺口处理。
- 只有 PM 批准的“载体/调试字段差异 + 等价新检查”才可进入 5B；其余必须修复后重跑。

