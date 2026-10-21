# Phase 5A uiux-v2 官方到达点（新入口）

入口：`app/renderer/dist/src/index.html`（5A 显式新入口；生产默认仍旧入口）。

## 三项缺口（官方段，无探针/补测替代）

| 段 | 官方 check 名 | 值 | 报告 |
| --- | --- | --- | --- |
| `ANS_DELIVERY_NOTE_UI_ONLY=1` | `builtin identity stays data and accessible without duplicate third visible line` | **true**（段 9/9 PASS） | `GHOST/report.json` |
| `ANS_COMPLETE_FLOW_UI_ONLY=1` | `P7 choice pending separated from empty queue` | **true** | `FLOW/report.json` |
| 默认段（无模式 env） | `full replay preserves content identity` | **true**（before/after text 相同，offset −610 → −610，差 0） | `DEFAULT/report.json` |

## 官方段后续止点（非三项缺口，未冒充通过）

- COMPLETE_FLOW：通过 P7 后止于既有 `role reading fixture must really scroll`（右栏角色资料夹具滚动；官方报告 `error` 字段记录）。
- 默认段：通过阅读锚点后止于既有 toggleDrift `anchor paragraph materialized 960`。原断言要求 `.msg` 直接挂在 `.chat-pane` 下；新渲染器为 `.chat-row` 包裹。未改断言，登记为 5B allowed-diff 候选。
- `uiux-design-audit.mjs`：`ANS_RENDERER_ENTRY` 生效；显式新入口运行有 12 项旧 DOM 夹具断言不匹配（旧选择器/转轮/行距），交 UIUX 5A 双端审计；未改断言。

## 5A 冒烟（独立，非 uiux 段）

`phase5a-electron-smoke.mjs` 16/16：三项缺口 + Markdown 外链点击（`webContents.getURL()` 不变、`will-navigate` 0、`app:open-external` 记录 `https://example.com/x`、rel=noopener noreferrer、`data-open-result=opened`）。

## 其他段（同最终构建）

MIRROR 8/8、QUEUE_VIEW 4/4、GOVERNANCE_REACCEPT 7 项报表、JUDGE 33/33、G2 5/5、SELECTOR 27/27、CONFIG 21/21、ROLE_RETURN_FOCUS 11/11、SEND_FACTS 8/8、TERMINAL 22/22、RUNTIME 17/17、FRESH_CONTEXT 4/4、VISUAL 54/54、TOOLFOLD 19/19（C1 150→170 Δ=20）。原始 `report.json` 见 `../segments/` 与 `VISUAL/`、`TOOLFOLD/`。
