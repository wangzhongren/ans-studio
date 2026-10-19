# 2026-10-19 tool 行「目标未保存」占位改为中性「无文件目标」

客户看到 tool 行「目标未保存」，误以为「未保存」导致流程被挡。实际这是
`app/renderer/renderer.js` 在 `display.target` 缺失时的占位文案——`request_confirmation` /
`dispatch_task` 等交互/派发类工具本来就没有文件目标。**工具行为、生命周期、判定零改动，只改文案。**

## 改动

- `app/renderer/renderer.js::toolDetails`（详情面，原「目标未保存」）：
  `display.target` 缺失 ⇒ **「本次调用无文件目标（交互/派发类工具）」**。
  工具名已在同一行的摘要 `<strong>` 显示，详情面继续 display 驱动、不按工具名分支
  （既有「详情面零工具名依赖」守卫保持通过）。
- `app/renderer/renderer.js::refreshToolLifecycle`（摘要行目标兜底，原「目标未保存」）：
  改为 **「无文件目标」**。摘要形如 `request_confirmation 无文件目标 调用发起`，不再暗示失败/保存动作。
- 未改 `目标未记录` 等其他占位（拒绝行/未知目标语义不同），未改工具行结构/样式/交互。

## 测试（真实输出）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/renderer.test.ts test/桌面应用/tool-rows.test.ts` | **160 计 / 160 过 / 0 红**（新增「无文件目标的工具行」用例：旧文案清零、中性文案、display 驱动不按工具名分支、摘要兜底、行为接线未动） |
| Electron 离线夹具 `ANS_NOTICE_UI_ONLY=1` | **SYSTEM_NOTICE_UI_PASS 6**（新增断言：`request_confirmation` 摘要含「无文件目标」且详情含「本次调用无文件目标（交互/派发类工具）」，两处均不含「未保存/失败」） |
| `npm run typecheck` | 0 错 |

## 截图

- [tool-row-no-file-target-1360.png](2026-10-19-notice-flat-evidence/tool-row-no-file-target-1360.png)
  ——`request_confirmation` 工具行展开：摘要「无文件目标」，详情「本次调用无文件目标（交互/派发类工具）」+ 结果「等待客户确认。」。
- 运行目录：`/private/tmp/ans-notice-flat-ui-final5`（隔离 user-data）。

## 残余风险

- 文案「交互/派发类工具」覆盖当前所有「有 display 但无文件目标」的工具；若未来出现既非交互也非派发、
  又无文件目标的工具，该括注需再核对（工具名仍由摘要行如实显示）。
- 仅呈现层改动；`display.target` 的结构化事实与工具执行结果不变。

## 改动文件

- `app/renderer/renderer.js`
- `test/桌面应用/renderer.test.ts`
- `test/桌面应用/e2e/uiux-v2.mjs`
- 本文件、`changelog.md`、`docs/change/2026-10-19-notice-flat-evidence/`（截图刷新）

未提交 git。
