# 桌面UI 模块笔记与代码位置

## 职责与范围

本角色实现 ANS 桌面客户端的渲染前端（`app/renderer/`）：显示与交互；不做判定、不碰 Node/文件系统。主进程侧（会话、通道、判定）属「桌面窗口」。拆分背景与逐文件路由见[拆分设计](docs/design/2026-10-14_design_role-split-ui.md)。

## 代码位置

```
app/renderer/
  index.html                 源入口（Vite input；严格 CSP；#root；/src/main.tsx）
  src/                       React 渲染器（main/App/shell/chat/stores/lib/components）
  dist/                      构建产物（入口 dist/index.html + assets）
  tsconfig.json              渲染层独立 TS 配置（strict / react-jsx / bundler / @/* → src/*）
  components.json            shadcn base-nova 配置（copy-in 组件在 src/components/ui/）
test/桌面UI/
  *.test.ts                  纯逻辑 + 源码/边界守卫（142）
  phase3b/4a/4b/5a-electron-smoke.mjs  真实 Electron 离线冒烟
test/桌面应用/e2e/
  uiux-v2.mjs / ime-enter.mjs / bench-storm.mjs / uiux-design-audit.mjs
                             默认 app/renderer/dist/index.html（ANS_RENDERER_ENTRY 可覆盖）
```

> 旧经典脚本渲染器（`renderer.js`/`styles.css`/7 个经典脚本/vendor）已在 5B 删除；下文「关键实现点」保留同义语义，代码位置以本块与 `src/` 为准。

## 依赖方向

React 渲染器（`src/`）→ `window.desktop`（preload 白名单，属桌面窗口）→ 主进程 Interface（`app/desktop/*`）→ 门禁引擎/编排。渲染进程**只经此一扇门**；不 import 任何 Node/electron/`app/desktop/**`；`src/lib/platform.ts` 是 `window.desktop` 唯一入口；Markdown 用 npm markdown-it 15.0.3，不再有 vendor/经典纯函数全局。

## 关键实现点（拆分时承接，详见归档）

- **渲染侧无第二份判定**：写资格、授权、枚举全部来自主进程；渲染只呈现（核心硬约束，逐版本有源码守卫）。
- **虚拟窗口纪律**：流内行禁用垂直 margin（行模型按「真实行高（rect）+ pane 行距（flex row-gap，实读；仅 pane 已连接时读入缓存——脱离文档读不到样式表）」计行占位——`rowFootprint`，2026-10-14 起），纵向节奏只走 gap/padding。行距量级大于取整误差：任何把行占位退回 `offsetHeight` 的改动都会让窗口构成变化位移正文（锚点漂移），`renderer.test.ts` Q-2 用例守卫。
- **事件订阅单源**：页面级多次订阅同一事件会各自回调（e2e 探针须避免叠加订阅造成观测伪影）。
- **esc 单一来源**：非 Markdown 路径的转义一律走 `Markdown.esc`；模型输出禁直插。
- **无计时器纪律**：交互卡不按时间过期；抽屉过渡纯 CSS。除既有诊断/去抖机制外不新增 setTimeout/setInterval。
- **治理决定卡镜像（W6-C）**：`opRequests[requestId]` 以 `surfaces`/`cards` 承载同一请求的多面呈现；源面沿用锚点/生命周期，镜像面（主入口 Liaison）追加末尾且不自动滚动。作答唯一入口 `submitOperatorDecision`（单点 `operatorRespond`），成功后/失效冻结全部面；排队请求不物化卡，仅主入口聚合行。渲染侧不自行判定是否镜像（只认载荷 `mirrorRoleId`），也不写账本/模型上下文。
- **双自动判断开关（2026-10-18）**：`shellJudge`=「替我审批」（shell + 写盘族）、`decisionJudge`=「替我决策」（提案/任命/验收）；主进程是两组开关的权威，`renderJudgeToggles()` 是唯一重绘点，一次性警告同一块、每组各自 `promptShown`。治理代批结果行（`session:operator-judge`）与 shell 结果行都按 `roleId` 落 pane、按 `toolCallId` 锚定；manual 用卡片 `judgeNotice`（shell `#sc-judge-notice` / 治理 `.op-judge-notice`）。渲染侧不写第二张 `cardKind→group` 映射表。
- 历史沿革（UI/UX v2、设计对齐、IME、抽屉、图片、P1 等）见冻结归档 `角色卡/桌面应用/docs/` 与[功能导航](feature-map.md)链接。

## 已知偏离 / 边界登记

V2r1 选择、设置、事件/请求/历史隔离的当前完整流程见 [runtime-choice](docs/feature/runtime-choice.md)。renderer 保存各 runtime 游离视图；当前 profile 的应用/重建、原生恢复结果、凭据来源和请求失效都由窗口层产生，本侧只消费。[原始自测与截图](docs/change/2026-10-14_change_multi-runtime-ui.md)覆盖自己的渲染候选，独立全链路验收另行记录。

- 拆分未物理移动 `test/桌面应用/`；渲染侧测试文件按 file 逐条授权（见 [boundary.yaml](boundary.yaml)）。
- `e2e/main.mjs`（桌面总自检台）归「桌面窗口」；本角色界面改动如牵动其中 DOM 断言，经项目管理协调由桌面窗口侧同步。


## React 渲染器（最终，Phase 5B 收尾）

React 新渲染器已是唯一生产渲染器；生产入口 `app/renderer/dist/index.html`（renderer-entry 解析），源入口 `app/renderer/index.html`。旧经典脚本渲染器与 vendor 已删除。

```
app/renderer/
  index.html                 源入口（Vite input，CSP，/src/main.tsx）
  src/main.tsx               React 挂载 + CSP 违规只读诊断
  src/App.tsx                骨架布局 + shadcn resizable Group/Panel + CSPProvider
  src/shell/                 TitleBar/Sidebar/ChatHeader/EngineSelect/Composer/Drawer/ConfirmCard/治理面板/work-overview
  src/chat/                  行模型/回放/事件/状态/Markdown/报告/operator/治理/阅读锚点
  src/stores/                ui/drawer/chat/operator/report/governance 等视图状态
  src/lib/platform.ts        window.desktop 安全守卫（唯一入口）
  src/test-driver.ts         window.__ansRenderer 21 个方法/状态字段
  src/components/ui/         shadcn copy-in 组件 + README 台账
  dist/                      构建产物（入口 dist/index.html）
```

- 窗口控制/会话/历史/确认/判断/设置/治理通道均按名接入；渲染进程不做边界判定、不 import Node。
- 契约面与三态见 [ui-contract-surface](docs/feature/ui-contract-surface.md)；5B 变更/证据见 [5B 变更记录](docs/change/2026-10-21_change_ui-platform-phase5b-cutover.md) 与 [5B 证据](docs/change/2026-10-21-phase5b-evidence/)。
- Phase 2/3A/3B/4A/4B 段落保留为历史实现记录；旧文件/旧测试已删除，不再作为现行代码位置。


## Phase 3A 聊天流（2026-10-21）

```
app/renderer/src/chat/
  types.ts        行/事件/listing/role metadata 类型
  row-model.ts    虚拟窗口纯模型（150/30、spacer、debug）
  replay.ts       回放 skip/append/full + 实时去重
  status.ts       角色状态优先级/徽标
  events.ts       信封路由/事件→行/工具事实/注入分类
  markdown.ts     npm markdown-it 15.0.3 受控封装 + window.ANSMarkdown
  role-view.ts    角色显示名/副标题/左树分组
  chat-store.ts   listing/会话/历史/事件投影 + RowModel + operator 最小卡
  ipc.ts          preload 订阅接线
  ChatStream.tsx  #chat 空/加载/队列/tool-current + 虚拟 pane
  VirtualPane.tsx 视口±30 挂载 + 上下 spacer + 实测回写
  ChatRow.tsx     user/assistant/activities/tool-lifecycle/injected/handback/operator/system/turn-terminal/reasoning
```

- 旧实现对应：`renderer.js` 的 `rowListFor/registerRow/updateVirtualWindow`（行模型）、`appendEvent/appendOneEvent`（事件）、`replayHistory/appendReplayRow`（回放）、`appendOperatorRequest`（锚点）、`role-status.js`（状态）；新实现为纯 TS + React，行口径 16px 由 `.chat-row` padding 承担、`.chat-pane` gap 0。
- 输入区非受控 textarea（旧 e2e 直接写 value）；send/pickImage 真实通道；停止/双开关仍 3B/4。
- 目标切换：`uiux-v2`/`ime-enter`/`bench-storm` 的 `ANS_RENDERER_ENTRY`；`main.mjs` 属桌面窗口未改。
- 未实现/差距与门禁证据见 [Phase 3A 变更记录](docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)。


## Phase 3B 卡族、双开关与输入区（2026-10-21）

```
app/renderer/src/
  chat/judge.ts           双开关视图/一次性警告/开关回包自洽/shell 与治理结果行/标题档位/恢复动作（纯逻辑）
  chat/confirm-logic.ts   卡状态机（重推/busy/失效收起）、回包结果、settled 失效判定、队列位次/撤回、附件快速筛（纯逻辑）
  stores/confirm-store.ts shell/recovery 卡记录 + approval/decision 开关状态 + 一次性警告（唯一业务计时器 ≈9s）
  shell/ConfirmCard.tsx   常驻 DOM 的 shell/su/恢复卡（#shell-confirm/#recovery-confirm/#sc-*/#rc-*；默认焦点/Esc/×/焦点循环/失效定格）
  shell/Composer.tsx      发送三态、停止三态、附件（选/粘/拖/data URL 缩略图/移除）、双开关、一次性警告、按角色草稿
  chat/ChatStream.tsx     QueueRows：进行中/第 N 位/来源 + 撤回就地回执
  chat/ChatRow.tsx        judge-result / governance-judge-result、operator .op-judge-notice、Lucide ChevronRight
```

- 旧实现对应：`renderer.js` 的 `onShellConfirm/renderShellConfirm/respondShellConfirm/closeStaleShellConfirm`、恢复卡四函数、`onOperatorExpired`、`initJudgeSwitches/renderJudgeToggles/syncShellJudgeWarning`、`onSend/onHaltClick/pickImageViaMain/attachBrowserFile/withdrawQueuedMessage`；`ui-labels.js` 的开关/结果/标题纯映射；`tool-rows.js::classifyInjectedMessage`。
- 卡与开关只在 `confirm-store` 落状态；渲染组件不判定。`settled`/失效回执收起旧 shell 卡；恢复卡失效原地定格。
- `#composer-hint` 只显示真实提示（空即空）；提示来源区分 queue/send，权威空队列与真实 turn 终态分别收口。
- 附件缩略图使用 data URL（生产 CSP 只允许 `img-src 'self' data:`）；渲染侧不碰 Node/fs，校验在主进程。
- C1：`.chat-pane` 36px 底部呼吸位，尾部折叠 Δ=16px；工具行密度保持 3A2 口径。
- 门禁与证据见 [Phase 3B 变更记录](docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md)。

## Phase 4A 模块与代码位置（2026-10-21）

| 面 | 代码位置 |
| --- | --- |
| 引擎视图缓存/路由/重放 | `app/renderer/src/chat/runtime-view.ts`；接线与切换编排 `chat/ipc.ts`（`switchRuntime`） |
| 设置纯逻辑/状态/面板 | `chat/runtime-config.ts`、`stores/settings-store.ts`、`shell/SettingsPanel.tsx`、`components/ui/slider.tsx` |
| 抽屉/阅读/文档/撤回状态 | `stores/drawer-store.ts`、`shell/Drawer.tsx`、`shell/ProfilePanel.tsx`、`shell/DocumentView.tsx`、`chat/document-view.ts` |
| 工作概览/队列 | `chat/work-view.ts`、`shell/WorkOverview.tsx`、`shell/QueuePanel.tsx`、`shell/QueueSubview.tsx`（同一抽屉的队列子视图） |
| 样式 | `shell/phase4a.css`（由 Drawer 导入；不改 shell.css） |
| 扩展点 | `chat/extensions/`（IPC）、`driver-extensions/`（`window.__ansRenderer`） |
| 状态事实 | 主进程是唯一权威：`getRuntimeConfig/saveRuntimeConfig`、三元 `openSession/getSessionHistory`、`session:role-state`、opaque `readProjectDocument`；渲染侧只做展示与版本守卫 |

## Phase 4B 模块与代码位置（2026-10-21）

| 面 | 代码位置 |
| --- | --- |
| 治理状态/预览/动作 | `chat/governance-view.ts`、`stores/governance-store.ts`、`shell/GovernancePanel.tsx`（挂载于 `ChatHeader`）；空态在 `chat/ChatStream.tsx` |
| 治理卡 meta/镜像/排队/聚合 | `chat/operator-view.ts`、`chat/ChatRow.tsx`（`OperatorRow`/`QueueAggregateRow`）、`chat/chat-store.ts`（共享条目/双面冻结/queuedOperator/聚合行） |
| 报告/持久化/交付 | `chat/report-view.ts`、`stores/report-store.ts`、`shell/ReportCard.tsx`（`ReportCard/ReportBody/DeliveryCard`）；推送经 `chat/extensions/reports.ts` |
| 回放锚点 | `chat/anchor-view.ts`、`chat/chat-store.ts`（锚点表/卡回插/full 重建保留行对象）、`driver-extensions/replay-anchor.ts` |
| judge 跨引擎/警告刷新 | `chat/ipc.ts`（sink/缓存路由）、`stores/confirm-store.ts`（sink/`installGovernanceModelWatch`） |
| 菜单配置状态 | `stores/settings-store.ts`（per-engine 摘要/项目守卫）、`shell/EngineSelect.tsx`（208 两行） |
| queueView tab 切换 | `stores/drawer-store.ts`（openTab/openSettingsDrawer/openDocumentList/backToRole）、`shell/ChatHeader.tsx` |
| 样式 | `shell/phase4b.css`（由 ChatHeader 导入；不改 shell.css/phase4a.css） |
| 驱动 | `driver-extensions/governance.ts`、`driver-extensions/replay-anchor.ts`；`test-driver.ts` 合并与 `state.governancePreview` |
| 测试/证据 | `test/桌面UI/{governance-view,operator-view,report-view,anchor-view}.test.ts`、`test/桌面UI/phase4b-electron-smoke.mjs`（+preload）、`docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md`、`docs/change/2026-10-21-phase4b-evidence/` |
