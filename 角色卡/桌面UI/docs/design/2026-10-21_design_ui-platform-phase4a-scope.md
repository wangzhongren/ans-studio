---
id: ui-platform-phase4a-scope
type: design
title: Phase 4A 范围与写集清单（引擎/设置/资料/工作概览/队列）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented（4A；按 PM §十二补正执行）
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase3b-cards-composer, ui-contract-surface, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: updated
    summary: 按 PM §12.2 补正 4A 写集：Sidebar.tsx 最小修改（#tab-pi 启用/角色角标）与「工作概览定位只做已挂载卡、若须改 chat-store/ChatStream 则留 4B」；QUEUE_VIEW 归 4B；Slider 单文件例外
  - date: "2026-10-21"
    kind: created
    summary: 按 PM 评审 revision 5 §11.3/§11.4 产出 4A 范围与写集清单（功能面、文件写集、驱动方法、测试计划、依赖、热路径影响、风险与待复核点）；仅规划，未写实现代码
---

# Phase 4A 范围与写集清单

**依据**：项目管理评审 revision 5 §11.2（Phase 4 拆 4A→4B）、§11.3（范围约束）、§11.4（4A 派发前置 1）；3B 变更记录与证据、契约面三态表、A/B/C/D 台账。**状态：仅规划。** 本文不写实现代码、不改 `app/`，是 4A 派发前的范围与写集输入，待 PM 复核。

**PM 复核补正（2026-10-21 §十二，已按此执行）**：①`Sidebar.tsx` 加入 4A 写集，仅限启用 `#tab-pi`、角色角标计数、必要 aria/文案；不改树结构/拖拽/收起/宽度/导入（实施中为 RUNTIME 组契约把树分组改为扁平兄弟节点并按组长在前——属同一文件、行为可见且未改上述交互，记录在变更记录）；②工作概览「待处理」定位只做**已挂载** operator 卡（关抽屉 + DOM 滚动/聚焦），完整虚拟行 locator 属 4B；③QUEUE_VIEW 四项归 4B，4A 只做抽屉队列 VISUAL 子集；④Slider 允许新增单文件 `components/ui/slider.tsx`（copy-in，零新增依赖）；⑤不新增渲染侧持久化。

**4A 目标**：把新渲染器从「聊天流 + 卡族」推进到「可用的三引擎工作台」——真实引擎切换与每引擎视图/草稿、三引擎设置、角色资料/文档抽屉、工作概览、队列抽屉。**不包含 4B**：治理三权卡/镜像/排队聚合、治理记录动作、报告全文/persistence/delivery、operator 镜像、`replayAnchorDebug`、single 模式一次性警告刷新。

## 一、4A 功能面逐项

### 1.1 引擎真实切换与每引擎会话/历史/草稿（含 SEND_FACTS P7）

**行为**

- 默认 **Claude**；**显式/已保存的 runtime 优先**：恢复状态（`getRecoveryState().runtime`）或会话三元身份给出的 runtime 覆盖默认值；不新增 localStorage 持久化（旧行为）。
- 引擎选择器（`#runtime-select/#runtime-options/#runtime-option-*`）沿用 2b 的 combobox/listbox/option、键盘（Enter/Space/↑↓/Home/End/Esc/Tab/pointer）与禁用态契约；选择才提交，浏览器项不提交。
- 提交后**真实切换**：保存当前 runtime 的视图快照（`captureRuntimeView` 同义）→ `chat.resetPanes()` 清当前视图 → 安装目标 runtime 视图 → 恢复该引擎的草稿/附件 → 重新打开当前选中角色的会话并读取该引擎历史（`openSession`/`getSessionHistory` 三元身份）。
- 每引擎独立：会话句柄/`sessionOpenRoleId`、历史行、live 事件、角色忙/队列快照、operator 卡与 shell/恢复卡缓存、judge 结果行、抽屉阅读位置、草稿与附件。旧实现为 `runtimeViews[project|runtime]` + `captureRuntimeView/installRuntimeView` + `deliverRuntimePayload`（`renderer.js` L1240–1321）。
- **后台任务继续**：非当前 runtime 的 `session:event(s)/role-state/history/operator-*/shell/recovery/judge-result` 只进入该 runtime 的缓存（不渲染、不打断当前视图；旧项目信封丢弃）；切回时按到达序重放，队列/忙态/历史与卡片恢复。排队聚合行（`op-queue-aggregate`）属 4B，4A 只缓存事实、不渲染。
- **切引擎保各自视图**：切走再切回，历史/后台消息/队列/角色状态/草稿/附件/卡片状态恢复；切换不停止后台会话（不调 `session:stop`）。
- **SEND_FACTS P7**：迟到的「旧引擎拒发」回包不得改写当前引擎会话/草稿；`sessionOpenRoleId` 与发送 target 保持当前引擎三元身份。

**验收面**：`ANS_SELECTOR_UI_ONLY` 26 项；`ANS_RUNTIME_UI_ONLY` 14 项（其中 `expired old shell shown disabled in its own runtime` 是 C2 旧入口既有红，不作为 4A 新红）；`ANS_SEND_FACTS_UI_ONLY` 9 项（关闭最后 1 项）。

### 1.2 三引擎设置（Pi / Codex / Claude）

**行为**

- 设置入口：会话头 `#tab-pi`（标题随引擎：`Pi 设置`/`Codex 设置`/`Claude 设置`）与缺配提示条 `#runtime-config-settings`；抽屉标题 `Pi 配置`/`Codex 配置`/`Claude 配置`。
- 数据源**只读** `getRuntimeConfig(runtime)`（兼容 `getPiConfig` 旧桥）：`fields[{key,label,required,secret,value,isSet,source,fallbackKey,help,choices,choiceLabels,control,integer}]`、`missingKeys`、`path`、`revision`、`application`、`label`。字段列表、必填、秘密键、closed 值域、整数约束全部以主进程元数据为准，**渲染侧不复制第二份校验/字段表**。
- 控件矩阵：`control:"range"` 且长档位（choices >5 或标签 >4 字）⇒ 原生 range + `<output>` + hidden `#pi-inp-<key>` 持规范值；≤5 短档位 ⇒ `<select>`（option 文本用 `choiceLabels`，value 用 raw choices，含「留空（平台默认）」）；自由字段 ⇒ text；`secret` ⇒ password + 「显示/隐藏」，值恒空、placeholder「已设置，留空则不修改」/「未设置」。
- 高级区：`ANS_PI_CONTEXT_WINDOW`、`ANS_PI_PROMPT_TIMEOUT_MS` 折叠；可留空（=适配器默认）；当前值不在预设档位 ⇒ 回退文本 +「当前值不在预设档位；改为预设档位后保存」（不静默覆盖）。
- 保存：`saveRuntimeConfig({runtime, updates})`；updates 只取当前视图字段：secret 非空才提交、非 secret 空值仅在 `isSet` 时提交清除；保存中禁用按钮；成功 → 重读配置、显示「已保存到 .env（改动键：…）」+ application（current/next-session/after-active-turn）+ 必填仍缺/已齐备；失败 → 保留草稿、如实错误、不改状态；保存不重开当前会话。旧实现 L4292–4660（`applyPiView/syncRange/loadPiConfig/savePiConfigFromForm/renderPiConfigWarning`）。
- 缺配提示：项目导入后按当前引擎检查 `missingKeys`；`#runtime-config-notice/#runtime-config-message/#runtime-config-settings` 如实显示「<引擎> 配置不完整，缺：…」/「读取配置失败」，仅缺配时给「打开 <引擎> 设置」；键盘可聚焦并打开设置；晚到的旧引擎/旧项目响应不得覆盖当前提示（load/save version 守卫）。
- `.env` 写入走主进程既有共享原子模块；渲染进程不碰 fs、不构造路径、不回显秘密值。

**验收面**：`ANS_CONFIG_UI_ONLY` 20 项；`ANS_RUNTIME_UI_ONLY` 中 Codex/Claude 设置、掩码、保存失败/成功、application 文案、几何三档；`ANS_SELECTOR_UI_ONLY` 的 `missing entry still opens existing Claude drawer`。

### 1.3 角色资料抽屉（角色资料 / 待办 / 队列两节 / 文档只读）

**行为**

- 抽屉 424、`role=dialog aria-modal`、Esc 关闭、焦点进入抽屉并返回原触发；内容跟随当前选中角色与 runtime。
- 「角色资料」四节 `<details data-section="card|boundary|changes|docs">`：角色卡 Markdown、边界条目表、变更记录 Markdown、文档索引；节开合与滚动位置按角色/runtime 保持（切换角色/引擎不串读）。
- 待办/队列两节归角色（同一 role-state 快照的两个视图）：待处理请求（待确认/待选择 + 定位）、当前工作、排队；位次/来源/全文/撤回就地回执（与 4.5 共用队列组件）。
- 文档只读：`listProject` 的 `documentScope`/`documents`（opaque `documentId/projectViewId`），点击「阅读」调 `readProjectDocument({version:1,projectViewId,documentId})`；`#document-read-status`/`#document-read-text` 只读呈现（Markdown 走既有受控管线，text 用 `<pre>`）；错误码映射（PROJECT_NOT_GRANTED/IO_ERROR/CHANGED_DURING_READ/NOT_FOUND/PERMISSION_DENIED/UNSUPPORTED_ENVIRONMENT/超限）如实 + 可重试；返回列表/返回角色资料并恢复焦点；文档内 http(s) 链接走 `openExternal`，内部相对链接命中已列文档则打开、否则如实「此链接尚未提供阅读入口」；切换角色/引擎/项目/关闭使迟到读取失效。旧实现 L4502–4614（`documentList/readDocument/refreshDocumentList/onDocumentAction`）。
- 渲染侧不接收 root/路径/URL；读取只用 opaque ID；文档 scope 由主进程窗口授权。

**验收面**：`ANS_ROLE_RETURN_FOCUS_UI_ONLY`（`roleDocumentFocusChecks`）9 项；`VISUAL_V2` 的抽屉文档/几何/焦点项；`COMPLETE_FLOW` 中文档读取段（若 4A 范围内可达）。

### 1.4 工作概览

**行为**

- `#tab-work` 启用；角标 = 当前角色待处理请求数 + 队列视图行数（真实 role-state / pending 快照，不推测）；打开抽屉 tab=`work`，标题「<角色> · 工作概览」。
- 内容：待处理 N（待确认/待选择 + 定位到聊天卡）、当前工作（进行中）、排队（位次/来源/全文/撤回）、最近回交（来自当前 pane 的 handback 行：来源/声明/摘要片段/状态，去重按真实报告身份；完整报告/持久化/source 文档属 4B）。
- **一份独立工作列表**：`#right-body #right-queue-body` 恰一处；工作概览不重复渲染角色资料文档节（不出现 `details[data-section]`）；空态如实。
- 定位：点击 `待处理` 的定位 → 关闭抽屉/滚动到对应 operator 卡（`data-request-id`），不自动作答。
- 旧实现 L5868–5930、L6015–6050（`pendingRequestsHtml/workListHtml/currentWorkReports/updateWorkReports/updateRightQueue/renderTabs`）。

**验收面**：默认段第 10 项 `one independent work list without duplicated role documents`；`VISUAL_V2` 的工作概览/最近回交相关项。

### 1.5 队列抽屉（位次/来源/撤回）

**行为**

- 抽屉队列区 `#right-queue-body`（工作概览与角色资料共用组件）：`.q-item`、`.q-pos`（进行中 / 第 N 位）、`.q-src` 来源（客户消息/派发·来自 X/回交·来自 X/系统）、`.q-text`、`.q-time`、`.q-toggle`+`.q-full` 全文、`.q-withdraw` 仅客户消息且未投递可撤、`.q-feedback` 就地回执。
- 队列成员唯一来自 `session:role-state` 的 `queue`/`running` 快照；撤回结果成功/无效/异常如实，成功后位次由真实快照前移；不造第二套队列状态。
- 切引擎/恢复不得复活旧排队聚合（队列抽屉只显示当前视图事实；queued operator 聚合行属 4B）。
- 旧实现 `queueViewsFor/queueRowsHtml/withdrawQueuedMessage/updateRightQueue`（L5664–5814、L5916–5929）。

**验收面**：`VISUAL_V2` 队列抽屉项（`snapshot keeps independent role document open`、`snapshot keeps full after independent role document and back`、`keyboard tabs to full`、`keyboard collapses full`、`keyboard expands full`、`keyboard tabs to withdraw`、`halt preserves queued 3/full`、`withdraw pending retains item`、`failed withdraw full retained`、`withdraw failure inline next to action`、`withdraw failure keeps draft image resources`、`thrown withdrawal error inline and retryable`、`keyboard withdrawal response retains same action`、`snapshot preserves failure inline`）；`ANS_QUEUE_VIEW_UI_ONLY` 4 项见 §4 的待复核说明。

## 二、文件写集清单（全部在 `app/renderer/`、`test/桌面UI/`、`角色卡/桌面UI/`）

### 2.1 新增

| 文件 | 用途 |
| --- | --- |
| `app/renderer/src/chat/runtime-config.ts` | 引擎设置纯逻辑：字段/控件选择（range/select/text/password）、range 下标/标签/规范值、updates 构造、missing/status/application/source 文案、load/save 版本自洽（无 DOM） |
| `app/renderer/src/chat/runtime-view.ts` | 每项目×引擎视图缓存：`key(project,runtime)`、缓存/转发判定、旧项目丢弃、重放顺序（history→events→role-state→operator/cards）、切引擎 generation 守卫（无 DOM） |
| `app/renderer/src/chat/document-view.ts` | 文档只读纯逻辑：错误码→人话、相对链接解析、读取请求/回包形状与 scope/version 校验 |
| `app/renderer/src/chat/work-view.ts` | 工作概览视图：待处理计数/定位项、队列分组、最近回交行视图、tab 角标计数 |
| `app/renderer/src/stores/settings-store.ts` | 设置视图状态：load/save/busy/status/version、缺配提示、晚到响应丢弃 |
| `app/renderer/src/stores/drawer-store.ts` | 抽屉 tab（card/work/pi/document/null）、每角色×runtime 阅读状态、文档视图状态、invoker/焦点恢复 |
| `app/renderer/src/shell/SettingsPanel.tsx` | 三引擎设置面板（字段矩阵、掩码/显示、range/select、保存/状态/路径/高级区） |
| `app/renderer/src/shell/ProfilePanel.tsx` | 角色资料四节 + 文档入口 + 待办/队列两节 |
| `app/renderer/src/shell/WorkOverview.tsx` | 工作概览（待处理/当前工作/排队/最近回交/角标） |
| `app/renderer/src/shell/QueuePanel.tsx` | 队列区（位次/来源/全文/撤回就地回执），供工作概览与角色资料复用 |
| `app/renderer/src/shell/DocumentView.tsx` | 文档列表/只读阅读/错误/重试/返回/焦点 |
| `app/renderer/src/shell/phase4a.css` | 4A 新增样式（抽屉面板/设置/工作/队列/文档）；由 `Drawer.tsx` 导入，**不改 `shell.css`**，给 4B 留出样式面 |
| `app/renderer/src/chat/extensions/`（目录+README；4A 只建注册机制与空目录） | 4B IPC 订阅扩展点：`import.meta.glob("./extensions/*.ts",{eager:true})` 注册 `(bridge)=>cleanup[]` |
| `app/renderer/src/driver-extensions/`（目录+README；4A 只建注册机制与空目录） | 4B 驱动扩展点：`registerDriverExtension(obj)` 合并进 `window.__ansRenderer` |
| `test/桌面UI/runtime-config.test.ts` | 控件矩阵/range/updates/缺配/状态/版本纯逻辑 |
| `test/桌面UI/runtime-view.test.ts` | 缓存键/转发/旧项目/重放顺序/generation |
| `test/桌面UI/document-view.test.ts` | 错误映射/链接解析/回包校验 |
| `test/桌面UI/work-view.test.ts` | 待处理/队列分组/最近回交/角标 |
| `test/桌面UI/phase4a-electron-smoke.mjs` + `phase4a-smoke-preload.cjs` | 4A 真实 Electron 离线 IPC 冒烟 + 1360/960 截图 |
| `角色卡/桌面UI/docs/feature/ui-components.md`（若尚缺） | 4A 新项目组件登记（来源/用途/状态矩阵）；4B 后续另起节追加 |

### 2.2 修改

| 文件 | 4A 改动 |
| --- | --- |
| `app/renderer/src/chat/ipc.ts` | 事件入口加 runtime 路由：当前视图→现有 store；异引擎→`runtime-view` 缓存；旧项目丢弃；安装 `chat/extensions/*` 注册器（4B 接扩展）。不触碰行投影语义 |
| `app/renderer/src/shell/Drawer.tsx` | tab 化（card/work/pi/document）、面板挂载、Esc/遮罩/焦点/inert 保持；内容委托给 ProfilePanel/WorkOverview/SettingsPanel/DocumentView |
| `app/renderer/src/shell/ChatHeader.tsx` | `#tab-work` 启用/角标、`#tab-pi` 设置入口、引擎选择器接真实切换；`onOpenDrawer` 保持与 App 的现有签名（不新增 App 改动） |
| `app/renderer/src/shell/EngineSelect.tsx` | onChange 调真实切换（默认/显式 runtime、缺配提示刷新）；保留现有 ARIA/键盘/placement 契约 |
| `app/renderer/src/shell/Composer.tsx` | 草稿/附件按 **runtime×role** 保存与恢复；切引擎时保存旧稿、恢复目标稿；发送 target 使用当前 runtime |
| `app/renderer/src/test-driver.ts` | 恢复 4A 方法（§三）；`state.rightTab` 扩展；安装 `driver-extensions/*` 注册器（4B 接 `replayAnchorDebug/governance`） |
| `app/renderer/src/lib/platform.ts` | 只读声明 `getRuntimeConfig/saveRuntimeConfig/getPiConfig/savePiConfig/readProjectDocument`；`DesktopBridge` 保持可被 4B 以 `declare module` 新文件扩展 |
| `角色卡/桌面UI/docs/feature/ui-contract-surface.md` | 4A 驱动方法/三态行（#7/#9/#10/#15/#16/#18/#19/#20）更新 |
| `角色卡/桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-*.md`、`docs/change/2026-10-21-phase4a-evidence/` | 4A 交付记录与证据（实现后） |
| `角色卡/桌面UI/{feature-map,memo,changelog,functional-description,api-spec}.md` | 4A 同步（实现后） |

### 2.3 4A **不修改**（留给 4B，互斥确认见 §八）

`app/renderer/src/App.tsx`、`app/renderer/src/chat/chat-store.ts`、`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/chat/ChatStream.tsx`、`app/renderer/src/chat/events.ts`、`app/renderer/src/chat/judge.ts`、`app/renderer/src/stores/confirm-store.ts`、`app/renderer/src/chat/confirm-logic.ts`、`app/renderer/src/shell/Sidebar.tsx`、`app/renderer/src/shell/shell.css`、`app/renderer/src/main.tsx`、`app/renderer/src/components/ui/**`（现有组件只读使用；新组件放 `shell/` 并登记台账）。

## 三、驱动方法清单（`window.__ansRenderer`）

| 方法/字段 | 旧端调用处（只读对照） | 4A 状态 | 契约面 |
| --- | --- | --- | --- |
| `selectRuntime(runtime)` | uiux-v2 L133/150/165/167/174/280/340/359/364/385/387/398/543/569/624/626/684/776/779/830/849/860/862/868/883/893/900/910/934/950/968/991/1026/1028/1239/1273/1296/1310/1316/1317/1325；main.mjs 多处 | 保留方法名；语义改为真实切换（返回 Promise，可 `await`；无项目/非法/同引擎 no-op） | §3.1 驱动表；§3.3 |
| `openPiPanel(tab?)` | uiux-v2 L883；main.mjs L1322 | 新增（兼容无参 = pi）；打开设置抽屉并加载配置 | §3.3；§四 #15/#18 |
| `loadPiConfig()` | uiux-v2 L871/874/877/881/890 | 新增；返回 `{view,missing}` 或 undefined（失败已就地显示） | §3.3 |
| `savePiConfigFromForm()` | main.mjs L1390（UI 以 `#pi-save` 点击为主：uiux-v2 L884/886/888/890/892/927） | 新增；保存当前表单并刷新状态 | §3.3 |
| `piKeys` | main.mjs L1325 | 新增；Pi 面板键集（按主进程 Pi 元数据顺序；供 main.mjs 逐键/label 对照，不写死字段表） | §3.3 |
| `state.rightTab` | uiux-v2 多处（L150/167/624/844/863 等） | 由 `"card"|null` 扩为 `"card"|"work"|"pi"|"document"|null` | §3.1 |
| `state.runtime` / `sessionOpenRoleId` / `roleBusy` / `roleMeta` / `queueByRole` | uiux-v2 多处；契约面 §3.1 | 保持字段与语义；切引擎后如实反映目标视图 | §3.1 |
| `queuedDebug()` | uiux-v2 L1315/1319/1321/1323 | 保留；排队聚合渲染属 4B | §3.1 |
| `loadProject/refreshProject/selectRole/selectRuntime` | 既有 | 保持；`loadProject` 清空旧项目 runtime 缓存 | §3.1 |
| 4B 专属：`replayAnchorDebug`、`governance*` | uiux-v2 L1047/1051/1491 | **4A 不实现**；通过 driver-extensions 接入 | §四 #17/#19 |

**契约面行号（当前 `ui-contract-surface.md`）**：uiux-v2 驱动表 §3.1 L61–77（`selectRuntime` L61、`loadPiConfig` L67、`openPiPanel` L68、`state.rightTab` L77），main.mjs 驱动表 §3.3 L203–208（`openPiPanel` L203、`piKeys` L204、`savePiConfigFromForm` L208）；三态表 L299–312（#7 L299、#9 L301、#10 L302、#15 L307、#16 L308、#18 L310、#19 L311、#20 L312）。

**三态目标（4A 完成时）**：契约面 #7（会话头/工作概览入口）部分→**已满足**；#9（输入区）保持已满足并加每引擎草稿；#10（附件）保持已满足；#15（右抽屉）部分→**已满足**；#16（导入/工作/设置入口/项目路径）部分→**已满足**；#18（Pi/引擎设置）未满足→**已满足**；#19（驱动）部分→**已满足 4A 方法**（`replayAnchorDebug/governance` 仍 4B）；#20（state 快照）已满足（`rightTab` 扩展）。#17（治理记录）仍 4B。

## 四、测试计划

### 4.1 新纯逻辑单测（`test/桌面UI/`，`.ts` 无 JSX）

1. `runtime-config.test.ts`：range vs select 判定（≤5 短标签 / 长档位）、range 下标/标签/规范值、`updates` 构造（secret 空省略、非 secret 空且 isSet 才提交清除）、缺配/状态/application/source 文案、load/save version 丢弃旧响应。
2. `runtime-view.test.ts`：`key(project,runtime)`；当前/异引擎转发判定；旧项目丢弃；重放顺序与重复抑制；切引擎 generation 使迟到 history/role-state 失效；缓存按项目清理。
3. `document-view.test.ts`：错误码映射、相对/绝对链接解析、`readProjectDocument` 请求/回包形状与 scope/version 校验、超限/未授权如实。
4. `work-view.test.ts`：待处理计数/定位、队列分组（进行中/排队 1..N）、最近回交去重/排序、tab 角标 = pending + queue、空态。

### 4.2 真实 Electron 离线 IPC 冒烟（`phase4a-electron-smoke.mjs`）

- 引擎：默认 Claude；显式/恢复 runtime 优先；选择 Pi/Codex/Claude 真实调用 `openSession/history` 三元身份；切回恢复 Pi/Codex 各自历史/队列/忙态/草稿/附件；后台事件只缓存；旧项目丢弃；迟到拒发不改当前草稿（SEND_FACTS P7 同义）。
- 设置：Pi 三必填 + 高级 range（context/timeout）、Codex/Claude 字段、secret 掩码/显示、保存成功/失败/晚到/缺配提示/打开设置/路径/application；不重开会话；草稿保留。
- 资料/文档：四节 Markdown/边界/变更/文档索引；文档列表→阅读→返回→返回角色资料焦点；错误码/重试；内部/外部链接；切换角色/引擎不串读。
- 工作概览：待处理/定位、当前工作、排队、最近回交、角标、唯一 `#right-queue-body`、无重复角色文档。
- 队列抽屉：位次/来源/全文/撤回就地回执/失败/异常/键盘焦点/切引擎不复活旧聚合。
- 零 console/CSP；1360/960 截图：引擎选择器、Pi/Codex/Claude 设置、角色资料、工作概览、队列抽屉、文档阅读。

### 4.3 uiux-v2 预期关闭的 check 名

| 段 | 预期 |
| --- | --- |
| 默认段 | 关闭 `one independent work list without duplicated role documents`（工作概览）；该段之后进入 4B 报告/持久化检查，4A 不宣称全段通过 |
| `ANS_SELECTOR_UI_ONLY` | 26/26（含 Claude 默认、三引擎提交、键盘/几何/缺配入口） |
| `ANS_CONFIG_UI_ONLY` | 20/20（缺配提示、读取/保存/版本、掩码、application、几何） |
| `ANS_RUNTIME_UI_ONLY` | 14 项中除 `expired old shell shown disabled in its own runtime`（C2 旧基线红）外全部；该 C2 不在 4A 新红内 |
| `ANS_ROLE_RETURN_FOCUS_UI_ONLY` | 9/9（角色资料/文档焦点与阅读保持） |
| `ANS_SEND_FACTS_UI_ONLY` | 9/9（关闭 `P7 old runtime rejected result cannot disable current runtime or overwrite draft`） |
| `ANS_VISUAL_V2_UI_ONLY` 的队列/工作/抽屉子集 | `one independent work list…` + 上列队列抽屉 13 项 + 文档抽屉几何/焦点项 |
| `ANS_QUEUE_VIEW_UI_ONLY` | 4 项：`queued baseline shows two`、`runtime view restore does not revive old queued requests or aggregate`、`main-process repush rebuilds aggregate with new count only`、`clearing queue removes aggregate`。**见 §九 待复核：该段实际断言 operator 排队聚合（`op-queue-aggregate`），PM §11.2 把它列在 4B；若按现文归 4A，需要把聚合渲染纳入 4A 写集；否则 4A 只关闭抽屉队列（VISUAL 子集），QUEUE_VIEW 留 4B。** |

### 4.4 门禁与证据

- `npm run typecheck:renderer`、根 `typecheck`；`npm run build:renderer`；CSP 静态扫描；入口引用 JS+CSS gzip ≤300KB。
- 新纯逻辑单测全绿；旧基线 `node --test test/桌面应用/*.test.ts` 679/679；IME 新入口 24/24；延迟挂载 `phase3a-lazy-toolgroup-check` 10/10。
- 4A 离线冒烟全绿 + 截图；uiux-v2 上述段实跑（报告到达点与失败名；不宣称全量双端等价）。
- **bench 重基线**：因 `ipc.ts` 事件入口/缓存路由与 Composer 草稿键变化，按 PM §10.3 同机同日旧/新交替 ≥3 有效轮（首轮预热、中位/p95/单轮 50ms 规则）；C1 保持 Δ≤32（目标 ≤20）。
- 证据目录 `docs/change/2026-10-21-phase4a-evidence/`；变更记录区分「已实现/已验证」与 Phase 5 未验证。

## 五、依赖结论

**4A 零新增依赖。** 复用现有：React/react-dom、zustand、lucide-react、Base UI 组件（Button/Input/Textarea/Checkbox/DropdownMenu/Tooltip）、motion（抽屉既有）、markdown-it；设置控件用原生 `select/range`，文档只读用既有 Markdown 管线。无新图标/动画/状态/Markdown 库；不引 dnd-kit（无拖拽需求）、不引虚拟库/日期库。若实施中出现确需依赖，按 PM 四问提交包名/原因/版本并精确锁定，未批准不安装。

## 六、热路径影响评估

- **不触碰**：`chat/chat-store.ts` 行模型/回放、`ChatRow.tsx`、`ChatStream.tsx`、`VirtualPane.tsx`、工具组折叠/懒挂载、`shell.css` 聊天行样式、C1 呼吸位。故工具组/聊天行渲染无需因 4A 改基线。
- **触碰但非渲染**：`chat/ipc.ts` 的 session/role-state/history 入口增加「当前视图转发 vs 异引擎缓存」判定（每事件一次 Map/数组操作，不解析正文）；`Composer` 草稿键加 runtime 维度（输入/切换时）。为稳妥按 PM §11.3 视为聊天热路径相邻变更：**4A 完成后重跑 bench-storm 同机同日旧/新交替 ≥3 有效轮**（预热排除、maxGap 中位 ≤max(旧,25ms)、handler/replay/scroll 中位 ≤max(旧×1.2,旧+5ms)、p95≤35ms、单轮≤50ms）与**延迟挂载 10/10**；若缓存开销使阈值超标，优化为只存 payload 引用、按项目清理、避免逐事件 JSON 解析。
- 工作概览/队列角标由 role-state 变化驱动，不按 token/事件逐条重排；抽屉关闭时不更新 DOM。

## 七、风险与未决项

| # | 风险/未决 | 对策/待确认 |
| --- | --- | --- |
| R1 | `.env` 写入与校验 | 只调 `saveRuntimeConfig`（主进程共享原子写/白名单/URL/整数/choices 校验）；渲染侧不碰 fs、不复制校验、不回显秘密值 |
| R2 | 设置字段漂移 | 字段/必填/秘密/choices/control 全部以 `getRuntimeConfig` 元数据为准；不写第二份 `RUNTIME_SETTINGS`/`PI_REQUIRED_KEYS`；渲染侧只做控件选择（含短档位规则） |
| R3 | 每引擎缓存内存/顺序 | 缓存按项目×引擎、项目切换清理；旧项目信封丢弃；重放按到达序；限制为引用存储，不深拷贝正文；必要时加上限并回 PM |
| R4 | 竞态 | load/save version、document version/scope、切引擎 generation：晚到响应只丢弃不写状态；发送 target/草稿按 runtime 精确匹配 |
| R5 | 默认/显式 runtime 语义 | 默认 Claude；恢复状态/会话显式 runtime 优先；**不新增持久化**（旧行为）。若产品要求记住上次选择，需 PM/产品决定 |
| R6 | QUEUE_VIEW 归属 | 该段断言 `op-queue-aggregate`（operator 排队聚合），PM §11.2 列 4B；与本任务“4A 含 QUEUE_VIEW”存在口径冲突，需 PM 裁定（§九.1） |
| R7 | 工作概览“最近回交”深度 | 4A 只呈现聊天流现有 handback 行；完整报告/持久化/source 文档按钮属 4B，避免提前实现 |
| R8 | 抽屉文档 scope/授权 | 只用 `documentScope`/opaque ID；PROJECT_NOT_GRANTED/scope 失效如实；导入提交时机沿用桌面窗口 B 修复语义；不构造路径 |
| R9 | C2 旧基线红 | `expired old shell shown disabled in its own runtime` 属旧端既有红，不因 4A 未跑到而掩盖；随 Phase 5 下线退役 |
| R10 | 4B 写集冲突 | 通过扩展点隔离（§八）；若实施中发现必须改 4A 文件，先回 PM，不静默扩围 |
| R11 | 抽屉可达性 | 424 模态、Esc、焦点进入/返回、inert、Tab 循环、960 档不横向溢出；UIUX 状态矩阵复核 |
| R12 | 证据口径 | 4A 只报 4A 范围；全量双端/main.mjs/打包/真实模型留 Phase 5 |

## 八、4A / 4B 互斥确认

**4A 写集与 4B 功能无交集**：4A 不实现、不修改以下 4B 面——治理三权卡/镜像/排队聚合、治理记录建立/重新接受/迁移预览、报告全文/persistence/delivery 回执、operator 镜像、`replayAnchorDebug`、single 模式一次性警告刷新。

**文件级隔离**：

- 4A **不修改**：`App.tsx`、`chat/chat-store.ts`、`chat/ChatRow.tsx`、`chat/ChatStream.tsx`、`chat/events.ts`、`chat/judge.ts`、`stores/confirm-store.ts`、`chat/confirm-logic.ts`、`shell/Sidebar.tsx`、`shell/shell.css`、`main.tsx`、`components/ui/**`。这些留给 4B（治理/报告/镜像/回放锚点）。
- 4B **接入点**（新增文件、不改 4A 文件）：
  - `chat/extensions/*.ts`：导出 `install(bridge) => cleanup`，由 4A 在 `ipc.ts` 用 `import.meta.glob("./extensions/*.ts",{eager:true})` 注册（4B 新增 `governance.ts`/`reports.ts` 等）。
  - `driver-extensions/*.ts`：导出驱动扩展对象，由 4A 在 `test-driver.ts` 合并（4B 新增 `replay-anchor.ts`/`governance.ts`）。
  - `lib/platform.ts` 的类型扩展用新文件 `declare module "@/lib/platform"`（4B 不编辑 platform.ts）。
  - 4B 新组件/样式放自己的文件（如 `chat/GovernanceCard.tsx`、`shell/reports.css`），不改 `phase4a.css`。
- 若 4B 必须修改 4A 文件（如 `ChatRow.tsx` 用于报告全文/镜像属 4B 自己的文件，不在 4A 写集），按 PM 默认顺序在 4A 门后追加；任何 4A 未列文件/4B 提前实现均需回 PM。
- **共享文档按节隔离**：`docs/feature/ui-contract-surface.md`、`feature-map.md`、`memo.md`、`changelog.md`、`docs/feature/ui-components.md` 是跨阶段活文档；4A 只写 4A 行/节并保留 4B 行（治理/回执/镜像/`replayAnchorDebug`）原样，4B 在 4A 门后追加自己的行/节，不覆盖 4A 内容。

## 九、待 PM 复核点

1. **QUEUE_VIEW 口径**：`ANS_QUEUE_VIEW_UI_ONLY` 的 4 个 check 实际断言 `#chat .op-queue-aggregate`（operator 排队聚合），PM §11.2 将「排队聚合」列入 4B；而 4A 任务描述写「队列抽屉（位次/来源/撤回、QUEUE_VIEW）」。请裁定：(a) QUEUE_VIEW 归 4B，4A 只关闭抽屉队列（VISUAL 子集）；或 (b) 把 operator 排队聚合纳入 4A（需扩 4A 写集并调整 4B 边界）。
2. **runtime 持久化**：确认 4A 维持「默认 Claude、恢复/显式优先、不持久化」；若要求记住上次选择，请给出口径。
3. **工作概览“最近回交”深度**：4A 用聊天流 handback 行；完整报告/持久化按钮 4B。请确认。
4. **扩展点机制**：接受 `chat/extensions/*` 与 `driver-extensions/*` 的 Vite glob 注册作为 4A/4B 文件隔离方式，还是要求 4B 在 4A 门后直接修改共享文件（后者会打破本文“无重叠”承诺）。
5. **组件台账**：4A 新项目组件（SettingsPanel/ProfilePanel/WorkOverview/QueuePanel/DocumentView）登记到 `docs/feature/ui-components.md` 是否由 4A 新建该文件（当前缺失），4B 后追加。
6. **C2**：确认 `expired old shell shown disabled in its own runtime` 仍按旧基线红处理，不作为 4A 门失败项。

## 附：核对方式与状态声明

- 只读核对：PM 评审 revision 5 §11.2–§11.4；3B 变更记录/证据/契约面/台账；旧渲染器 `renderer.js` 的 runtime 视图（L1240–1321）、设置（L4292–4660）、文档（L4502–4614）、抽屉/工作概览/队列（L5664–6080）、驱动（L6680–6720 等）；`app/preload.cjs` 与桌面窗口 api-spec；`test/桌面应用/e2e/uiux-v2.mjs` 的 SELECTOR/CONFIG/RUNTIME/ROLE_FOCUS/VISUAL/QUEUE_VIEW/SEND_FACTS 段与调用行号；现有 `app/renderer/src/{shell,chat,stores,lib}` 结构。
- 未运行应用/测试/构建，未调用模型/网络，未读 `.env`；未改任何 `app/` 代码、依赖、主进程/preload/desktop、旧渲染器或根配置；只写本文件与 memo/changelog 的必要更正。
- 本文是 4A 范围与写集规划（status: proposed），不是实施、测试或验收记录；4A 派发与写集以 PM 复核结论为准。
