# 桌面拆分：窗口侧交付说明（桌面窗口创建文档）

- 日期：2026-10-14
- 状态：**已确认生效**——客户 2026-10-14 确认原话「桌面UI/桌面窗口 这个可以」；本文件同时是「桌面窗口」角色的创建完成文档
- 来源授权：客户原话「**桌面拆分成两个角色吧，一个UI，一个window 相关的。**」
- 关联：[桌面UI 拆分设计](../../../桌面UI/docs/design/2026-10-14_design_role-split-ui.md)（含 `app/**` 与 `test/桌面应用/**` 的**完整逐文件路由表**）、[旧目录归档说明](../../../桌面应用/归档说明.md)

## 1. 拆分结果（窗口侧）

「桌面应用」拆为「桌面UI」（渲染前端）与「桌面窗口」（本角色）。本角色承接 Electron 主进程、窗口生命周期、preload 受限桥与桌面会话装配——渲染进程一切能力的提供方；渲染前端（`app/renderer/`）不属本角色。

## 2. 本角色 Section 1 覆盖（无重叠、无遗漏；不物理移动文件）

### 2.1 应用代码

| 路径 | 说明 |
| --- | --- |
| `app/main.ts`（单文件条目） | Electron 主进程入口：建窗（无边框/自绘标题栏接线/mac 重开）、IPC 注册、诊断与恢复接线 |
| `app/preload.cjs`（单文件条目） | 受限 IPC 桥（contextBridge 白名单，不暴露 Node） |
| `app/desktop/`（目录条目，12 文件） | `interface.ts`、`session.ts`、`project.ts`、`session-history.ts`、`request-anchor.ts`、`customer-input.ts`、`operator-channel.ts`、`pi-config.ts`、`composer-images.ts`、`chat-adapter.ts`、`push-batcher.ts`、`diagnostics.ts`——桌面 Interface（主进程侧纯逻辑） |

`app/renderer/` 整目录归「桌面UI」；`package.json`/`README.md`/`bin/`/`tsconfig.json` 归装配；三者与本角色互不重叠。

### 2.2 测试（`test/桌面应用/` 路径沿用拆分前，逐文件授权；详见桌面UI 拆分设计 §2.2 全表）

本角色持有的 22 个：`ans-wiring`、`boundary-refresh`、`composer-images`、`diagnostics`、`dispatch-delivery`、`dispatch-fresh-enum`、`genesis-bootstrap`、`handback-delivery`、`hot-path`、`interface`、`message-queue`、`operator-channel`、`operator-wiring`、`p0-halt-and-images`、`pi-config`、`project`、`queue-withdraw-lru`、`session-history`、`session-rebuild-race`、`session`、`su-effective-boundary`（`.test.ts`）与 `e2e/main.mjs`。

`e2e/main.mjs` 归属理由：该 harness 主体是桌面装配（自建窗口、注册 IPC、构造 Interface/SessionManager，与生产 `app/main.ts` 保持同形）；renderer 在其中作为被测整体运行、DOM 断言是观察面。界面改动需同步其中断言时，经项目管理协调由本角色执行。

## 3. 旧目录交接

`角色卡/桌面应用/` 原位冻结为只读归档（未移动、未改写正文资料）：`role-card.md` 加冻结横幅；`boundary.yaml` 保留原名，`role:` 后置顶层 `archived: true`（**归档键约定**：枚举静默跳过、不可开启、边界不予采用，防止被当作活角色；同日过渡记与细化说明见桌面UI 拆分设计 §3 与归档说明）；新增 `归档说明.md`（资料去向表）。

## 4. 跨角色影响与待办（交项目管理派发）

1. **本角色侧测试更新（拆分落地后）**：`e2e/main.mjs`（82 处 `"桌面应用"`：树点击、慢轮缝 arm 钩子、role-state 驱动）、`session.test.ts:39`、`operator-channel.test.ts:245`、`project.test.ts:31-33`（真实枚举断言与 `firstProjectFilePath` 期望）须改用新角色 id。
2. 渲染侧（桌面UI）与主进程侧的接口契约不变：通道名、载荷形状、事件名在拆分中零改动——本次拆分**不改变任何运行时行为**（除旧目录冻结使「桌面应用」不再被枚举）。
3. 其他角色正文资料引用、PM 架构文档、README、`app`/`src` 注释中的「桌面应用」字样：清单与建议见呈报报告；`app/main.ts:80` 窗口标题与 `src/**` 多为**产品**称谓，经核查非角色名引用。

## 5. 证据与确认声明

- 本交付仅治理工件（与桌面UI 同批）：新建 `角色卡/桌面窗口/**`；冻结标记 `角色卡/桌面应用/{role-card.md, boundary.yaml（archived: true）, 归档说明.md}`。未触碰 `app/**`、`test/**` 及任何其他角色正文资料。
- **角色卡与边界已获客户确认**（2026-10-14，原话「桌面UI/桌面窗口 这个可以」）：拆分自此生效；上文 §4 各项待办转为派发内容。
