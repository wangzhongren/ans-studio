# 桌面UI API 规格（渲染侧契约）

> 实现报告。源码在 `app/renderer/`，归「桌面UI」角色。**拆分初始版**：IPC 通道表（主进程侧）与完整导出清单在冻结归档 `角色卡/桌面应用/api-spec.md`（只读，拆分前冻结形态）；本角色将在下一次界面交付时按现状重建本页。

## 渲染侧导出（供 node 同源加载的纯函数模块）

| 模块 | 全局名 | 关键导出 |
| --- | --- | --- |
| `app/renderer/markdown.js` | `globalThis.ANSMarkdown` | `esc`（转义单一来源）、`renderMarkdown`、`options`、`createRenderer`（测试钉子面） |
| `app/renderer/role-status.js` | `globalThis.ANSRoleStatus` | 角色状态七态派生（图标/文案/样式的唯一映射） |
| `app/renderer/tool-rows.js` | `globalThis.ANSToolRows` | `activityOf`、`slimToolRow` 等活动分类与工具行纯函数 |
| `app/renderer/ui-labels.js` | `globalThis.ANSUiLabels` | `replayPlan`（回放策略）、队列视图与文案纯映射 |

`renderer.js` 为经典脚本（IIFE，依赖 `window.desktop`），不导出模块；其对外契约 = DOM id/类名与 `data-state` 等既有钩子（e2e 与渲染测试按此断言）。另暴露 `window.__ansRenderer` 调试探针面（`selectRole`/`rowModelDebug`/`replayAnchorDebug` 等，e2e 时序断言用）：字段**只增不改**——`rowModelDebug` 新增 `rowGap`（2026-10-14 口径缓存不变量断言用）。

## 对外依赖（只读消费）

- `window.desktop`：preload 白名单通道 + 主→渲染事件（`session:events`/`session:role-state`/`session:history`/`project:changed` 等）——**定义与实现属「桌面窗口」**（其 api-spec.md 为契约单一来源；通道增改由桌面窗口维护并同步本侧）。
- `window.desktop` 通道一览（拆分时现状，供本侧对照；以桌面窗口 api-spec 为准）：`app:pick-project`、`app:list-project`、`session:open/send/stop/live/history/role-state/operator-request/operator-response/abort/withdraw`、`session:event(s)`、`project:changed`、`app:open-external`、`app:pick-image`、`app:attach-image`、`pi-config:get/save`、`window:minimize/toggle-maximize/close/is-maximized/maximized-changed`、`shell:confirm-request/response`、`app:renderer-diagnostic`、`app:recovery-state`、`app:reload-interface`、`app:recovery-ready`。

## 装配说明

- 装载顺序（index.html，有测试钉）：`vendor/markdown-it.umd.min.js` → `markdown.js` → `role-status.js`/`tool-rows.js`/`ui-labels.js` → `renderer.js`。
- vendor 升级纪律：同步 `vendor/README.md`、`markdown.js` 头注释与 `test/桌面应用/markdown.test.ts` 的版本号与 sha256 pin；不得带红升级。

## 合规/偏离与测试证据

- 硬约束「渲染进程无第二份判定」「不接触 Node/fs」由 `test/桌面应用/renderer.test.ts` 全量守卫；Markdown 安全（XSS 负例/vendor pin）由 `markdown.test.ts` 守卫。
- 拆分初始版无新增导出；本页导出清单此后未变（2026-10-14 锚点漂移修复只改行模型内部记账口径，不改导出与 DOM 契约）。证据与候选哈希：设计对齐批见归档 `角色卡/桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md`；其渲染源码指纹已被本角色[虚拟行锚点漂移修复](docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md)取代（新指纹见该记录 §6）。
