# 桌面拆分：UI 与窗口两个角色（桌面UI 侧交付说明）

- 日期：2026-10-14
- 状态：**已确认生效**——客户 2026-10-14 确认原话「桌面UI/桌面窗口 这个可以」；本文件同时是「桌面UI」角色的创建完成文档
- 来源授权：客户原话「**桌面拆分成两个角色吧，一个UI，一个window 相关的。**」
- 关联：[桌面窗口 拆分设计](../../../桌面窗口/docs/design/2026-10-14_design_role-split-window.md)、[旧目录归档说明](../../../桌面应用/归档说明.md)

## 1. 为什么拆、拆成什么

拆分前状态：单一角色「桌面应用」同时持有 Electron 主进程、preload 桥、会话装配与渲染前端（`app/` 整目录 + `test/桌面应用/` 整目录）。两类工作性质不同——**主进程/会话/判定接线**与**界面实现与视觉**——合在一个角色里，任务、测试与资料互相牵连。

拆分为两个角色（Section 1 互不重叠）：

| 角色 | id | 一句话职责 | 持有路径 |
| --- | --- | --- | --- |
| 桌面UI | `桌面UI` | 桌面客户端的**渲染前端**：界面展示与交互（`app/renderer/`），按 UI/UX 已确认设计实现；不接触 Node/文件系统 | `app/renderer/` + 8 个渲染侧测试文件 + 本角色资料 |
| 桌面窗口 | `桌面窗口` | Electron **主进程、窗口生命周期、preload 受限桥与桌面会话装配**（`app/main.ts`、`app/preload.cjs`、`app/desktop/`） | 3 条应用入口/桥/装配路径 + 22 个测试文件 + 本角色资料 |

与既有「UIUX设计师」的区分：设计师产出设计稿/原型、不写实现；「桌面UI」是按已确认设计做正式界面的实现侧。口语与文档中「桌面UI」指本角色，「UIUX设计师」指设计角色，避免只用「UI」二字造成歧义。

## 2. 逐文件路由表（无重叠、无遗漏）

默认**不物理移动** `app/**` 与 `test/**`——只改归属授权，保持既有路径（`package.json` 脚本、文档链接、e2e 路径引用均不动）。

### 2.1 `app/**`（24 个文件）

| 路径 | 属主 | 说明 |
| --- | --- | --- |
| `app/renderer/index.html` | 桌面UI | 视图骨架 |
| `app/renderer/styles.css` | 桌面UI | 视觉 |
| `app/renderer/renderer.js` | 桌面UI | 主脚本 |
| `app/renderer/markdown.js` | 桌面UI | Markdown 封装（纯函数） |
| `app/renderer/role-status.js` | 桌面UI | 状态徽标纯函数 |
| `app/renderer/tool-rows.js` | 桌面UI | 工具行纯函数 |
| `app/renderer/ui-labels.js` | 桌面UI | 回放/队列纯映射 |
| `app/renderer/vendor/{README.md, markdown-it.LICENSE, markdown-it.umd.min.js}` | 桌面UI | vendored 第三方库（整目录随 `app/renderer/`） |
| `app/main.ts` | 桌面窗口 | 主进程入口 |
| `app/preload.cjs` | 桌面窗口 | 受限 IPC 桥 |
| `app/desktop/{chat-adapter, composer-images, customer-input, diagnostics, interface, operator-channel, pi-config, project, push-batcher, request-anchor, session-history, session}.ts` | 桌面窗口 | 桌面 Interface（12 个文件，整目录 `app/desktop/`） |

授权形态：`app/renderer/` 与 `app/desktop/` 用**目录条目**（各自目录内新增文件不需逐文件改边界），`app/main.ts`、`app/preload.cjs` 用**单文件条目**。两条目录 + 两个文件即覆盖 `app/` 全部，无交叠。

### 2.2 `test/桌面应用/**`（30 个文件，按被测对象逐文件路由）

路径沿用拆分前（同目录内按 file 逐条授权）。

| 路径 | 属主 | 被测对象 |
| --- | --- | --- |
| `markdown.test.ts` | 桌面UI | `app/renderer/markdown.js` + vendor pin |
| `renderer.test.ts` | 桌面UI | `app/renderer/*` 源码不变式 |
| `tool-rows.test.ts` | 桌面UI | `app/renderer/tool-rows.js`、`ui-labels.js` |
| `e2e/uiux-v2.mjs` | 桌面UI | 界面交互（真实 renderer） |
| `e2e/ime-enter.mjs` | 桌面UI | 输入区 IME 行为 |
| `e2e/bench-storm.mjs` | 桌面UI | 渲染热路径基准 |
| `e2e/uiux-design-audit.mjs` | 桌面UI | renderer 设计对齐实测夹具 |
| `e2e/uiux-prototype-measure.mjs` | 桌面UI | UIUX 原型实测夹具 |
| `ans-wiring.test.ts` | 桌面窗口 | `.ans` 生效配置接线（project/session） |
| `boundary-refresh.test.ts` | 桌面窗口 | 边界陈旧重建（session） |
| `composer-images.test.ts` | 桌面窗口 | 图片校验（composer-images/interface） |
| `diagnostics.test.ts` | 桌面窗口 | 诊断（diagnostics/交互通道） |
| `dispatch-delivery.test.ts` | 桌面窗口 | 派发投递机（session） |
| `dispatch-fresh-enum.test.ts` | 桌面窗口 | 派发前新鲜枚举（session/interface） |
| `genesis-bootstrap.test.ts` | 桌面窗口 | 创世态配置（project + 引擎） |
| `handback-delivery.test.ts` | 桌面窗口 | 回交自动投递（session） |
| `hot-path.test.ts` | 桌面窗口 | 合帧批推/状态去抖（push-batcher/session） |
| `interface.test.ts` | 桌面窗口 | Interface 处理器（interface） |
| `message-queue.test.ts` | 桌面窗口 | 消息队列与状态快照（session） |
| `operator-channel.test.ts` | 桌面窗口 | 操作者确认通道/arm 分发（operator-channel/session） |
| `operator-wiring.test.ts` | 桌面窗口 | 交互通道与锚点键（customer-input/request-anchor/session） |
| `p0-halt-and-images.test.ts` | 桌面窗口 | 停止/图片端到端（session/interface） |
| `pi-config.test.ts` | 桌面窗口 | Pi 配置读写纪律（pi-config/interface） |
| `project.test.ts` | 桌面窗口 | 枚举构造 ProjectConfig（project） |
| `queue-withdraw-lru.test.ts` | 桌面窗口 | 撤回与 LRU（session） |
| `session-history.test.ts` | 桌面窗口 | JSONL 解析与锚点（session-history/request-anchor） |
| `session-rebuild-race.test.ts` | 桌面窗口 | 并发重建竞态（session） |
| `session.test.ts` | 桌面窗口 | 会话开启/多轮/保活（session/chat-adapter） |
| `su-effective-boundary.test.ts` | 桌面窗口 | su 生效边界（project/interface） |
| `e2e/main.mjs` | 桌面窗口 | 桌面端到端总自检（真实 Electron：主进程装配 + preload + renderer） |

`e2e/main.mjs` 的归属理由：该 harness 的主体是**桌面装配**——自建窗口、注册 IPC、构造 Interface/SessionManager（与生产 `app/main.ts` 保持同形是其不变量），renderer 在其中作为被测整体运行；其内 DOM 断言属观察面。界面改动若需同步其中断言，经项目管理协调由桌面窗口侧执行。

## 3. 旧目录交接：原位冻结归档

`角色卡/桌面应用/` **原位保留**为冻结归档（不移动、不改写正文资料），以保住既有交叉链接（其他角色与项目管理文档中的相对路径继续有效）。

- `role-card.md`：顶部加「已拆分冻结」横幅（历史正文保留）。
- `boundary.yaml` **保留原名与全文**，`role:` 之后新增顶层 `archived: true`——**归档键约定**（门禁引擎 2026-10-14 落地）：角色枚举**静默跳过**本目录（无任何提示）、该角色**不可开启**、其边界一律不予采用（一切写被拒），故冻结目录不会成为与两个新角色重叠的第三个活角色。**同日过渡记**：当日上午曾先以「改名屏蔽枚举」过渡，同日按客户决定（「还是加一个已归档吧，归档是合理的」）改为归档键约定，改名已恢复原名、以此收口。**请勿移除该键。** `role-card.md` 内的边界链接指向原文件 `boundary.yaml`。
- 新增 `归档说明.md`：冻结声明、资料去向（UI 侧/窗口侧/双方共用）与引用说明。
- **未动**：`changelog.md`、`memo.md`、`feature-map.md`、`functional-description.md`、`api-spec.md`、`docs/**` 全部原样保留（含当前未提交的设计对齐记录 `docs/fix/2026-10-13_fix_uiux-design-alignment.md` 与 `docs/fix/2026-10-13-design-alignment-selfcheck/`——归 UI 侧，内容一字未改）。

## 4. 跨角色影响与待办（交项目管理派发）

1. **e2e/main.mjs 与「真实枚举」测试须随拆分更新**（属桌面窗口侧）：`test/桌面应用/e2e/main.mjs` 硬编码样例角色 id `"桌面应用"`（树点击、慢轮缝 arm 钩子 `role.id === "桌面应用"`、role-state 驱动等 82 处提及）；`session.test.ts:39`、`operator-channel.test.ts:245`、`project.test.ts:31-33` 以**真实仓库枚举**断言「应有角色 桌面应用」。冻结生效后这些断言将转红，需按新角色 id 更新（建议样例角色改用 `桌面窗口` 或 `桌面UI`，`firstProjectFilePath` 期望值随之改为新角色边界里的首个文件条目）。
2. 其余角色的**正文资料**中对「桌面应用」的引用（feature-map/functional-description/memo/docs，含 UIUX、产品、测试、编排、装配、门禁引擎、Pi适配器、项目管理各目录）：按惯例不改其正文，由各属主/PM 在各自时点改为指向新角色（清单见本次呈报报告）。
3. `角色卡/项目管理/docs/architecture.md` 的角色表与功能文档条目需更新为两个新角色（PM 属主）。
4. `README.md`（装配属主）与 `app` 源码内若干**注释**（角色归属说明、示例路径）按需由属主刷新；`app/main.ts:80` 窗口标题「ANS 桌面应用（受治理会话）」与 `src/**` 中「桌面应用」多指**产品**，经核查非角色名引用，保持不变。

## 5. 证据与确认声明

- 本交付仅治理工件：新建 `角色卡/桌面UI/**`、`角色卡/桌面窗口/**`，冻结标记 `角色卡/桌面应用/{role-card.md, boundary.yaml（archived: true）, 归档说明.md}`，更新 `角色卡/UIUX设计师/role-card.md` 一处只读引用。未触碰 `app/**`、`test/**` 及任何其他角色正文资料。
- **角色卡与边界已获客户确认**（2026-10-14，原话「桌面UI/桌面窗口 这个可以」）：拆分自此生效；上文 §4 各项待办转为派发内容。
