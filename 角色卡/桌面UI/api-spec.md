# 桌面UI API 规格（渲染侧契约）

> 实现报告。源码在 `app/renderer/`，归「桌面UI」角色。**拆分初始版**：IPC 通道表（主进程侧）与完整导出清单在冻结归档 `角色卡/桌面应用/api-spec.md`（只读，拆分前冻结形态）；本角色将在下一次界面交付时按现状重建本页。

## 渲染侧导出（供 node 同源加载的纯函数模块）

| 模块 | 全局名 | 关键导出 |
| --- | --- | --- |
| `app/renderer/markdown.js` | `globalThis.ANSMarkdown` | `esc`（转义单一来源）、`renderMarkdown`、`options`、`createRenderer`（测试钉子面） |
| `app/renderer/role-status.js` | `globalThis.ANSRoleStatus` | 角色状态七态派生（图标/文案/样式的唯一映射） |
| `app/renderer/tool-rows.js` | `globalThis.ANSToolRows` | `activityOf`、`slimToolRow` 等活动分类与工具行纯函数 |
| `app/renderer/ui-labels.js` | `globalThis.ANSUiLabels` | `replayPlan`（回放策略）、队列视图与文案纯映射 |
| `app/renderer/runtime-ui.js` | `globalThis.ANSRuntimeUI` | `runtimeLabel`、`viewKey`、`matchesView`、`roleGroups`、`sourceLabel`、`applicationLabel`（纯展示，不读文件或判断授权） |

`renderer.js` 为经典脚本（IIFE，依赖 `window.desktop`），不导出模块；其对外契约 = DOM id/类名与 `data-state` 等既有钩子（e2e 与渲染测试按此断言）。另暴露 `window.__ansRenderer` 调试探针面（`selectRole`/`rowModelDebug`/`replayAnchorDebug` 等，e2e 时序断言用）：字段**只增不改**——`rowModelDebug` 新增 `rowGap`（2026-10-14 口径缓存不变量断言用）。

## 对外依赖（只读消费）

- `window.desktop`：preload 白名单通道 + 主→渲染事件（`session:events`/`session:role-state`/`session:history`/`project:changed` 等）——**定义与实现属「桌面窗口」**（其 api-spec.md 为契约单一来源；通道增改由桌面窗口维护并同步本侧）。
- `window.desktop` 通道一览（拆分时现状，供本侧对照；以桌面窗口 api-spec 为准）：`app:pick-project`、`app:list-project`、`session:open/send/stop/live/history/role-state/operator-request/operator-response/abort/withdraw`、`session:event(s)`、`project:changed`、`app:open-external`、`app:pick-image`、`app:attach-image`、`pi-config:get/save`、`window:minimize/toggle-maximize/close/is-maximized/maximized-changed`、`shell:confirm-request/response`、`app:renderer-diagnostic`、`app:recovery-state`、`app:reload-interface`、`app:recovery-ready`。

## 装配说明

- 装载顺序（index.html，有测试钉）：`vendor/markdown-it.umd.min.js` → `markdown.js` → `role-status.js`/`tool-rows.js`/`ui-labels.js` → `renderer.js`。
- V2r1 增加 `runtime-ui.js`，同样在 `renderer.js` 前装载。
- vendor 升级纪律：同步 `vendor/README.md`、`markdown.js` 头注释与 `test/桌面应用/markdown.test.ts` 的版本号与 sha256 pin；不得带红升级。

## 合规/偏离与测试证据

- 硬约束「渲染进程无第二份判定」「不接触 Node/fs」由 `test/桌面应用/renderer.test.ts` 全量守卫；Markdown 安全（XSS 负例/vendor pin）由 `markdown.test.ts` 守卫。
- 拆分初始版无新增导出；锚点漂移修复阶段导出未变（V2r1新增见下文）。证据与候选哈希：设计对齐批见归档 `角色卡/桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md`；其渲染源码指纹已被本角色[虚拟行锚点漂移修复](docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md)取代（新指纹见该记录 §6）。

## V2r1 实际消费与 DOM（2026-10-14）

`#runtime-select` 在聊天头角色名旁提供 Pi/Codex/Claude；`#tab-pi` / `#pi-panel` / `#pi-save` 和旧探针函数保留作为兼容名称，抽屉内容跟随所选引擎。字段来自 `getRuntimeConfig(runtime)` 的实际 metadata，不维护第二份新引擎字段表。旧 Pi-only bridge 保留 `getPiConfig` / `savePiConfig` fallback；正常桥使用通用 API。

开会话和读取历史传 `{projectRoot,roleId,runtime}`；发送第三参同形；abort/withdraw 使用同形对象目标。通过 `listLiveSessionViews` 匹配活动会话，旧 roleId 数组只兼容 Pi。事件、历史、状态与请求按显式三元身份投递，异引擎只更新自己的缓存，旧项目不投递。缺 runtime 的旧替身按 Pi 处理。组摘要直接取 `role.group/groupDuty`；分组只改变展示。

`onOperatorExpired` 同时消费客户与 shell 请求失效，原 ID 关联到原身份；不根据 UI 计时或显示状态发行权限。`SessionEvent.detail.outcome` 只读取终态，失败/超时保留错误；工具行保留 callId/turnId/runtime，从明确 args.path/command 或 call/result 消费实际目标和布尔结果；同 turn/call/name 以行表内索引继承已知目标，缺结果继续未知，detail 正文不直接渲染。窗口的 desktop contextSource 为 resumed（活句柄）、recovered（真实原生恢复）、fresh（新建或失败后重建）；rebuild 原因从 contextWarning 如实转述。

`window.__ansRenderer` 新增 `selectRuntime`、`onOperatorExpired`，`state.runtime` 可读；其余既有钩子继续保留。当前用户流程见[功能说明](docs/feature/runtime-choice.md)，源码候选与原始检查见[U1 报告](docs/change/2026-10-14_change_multi-runtime-ui.md)。

## U1R 接口（前版已验证，最新U1R2重验中）

sendSession第四参为optional `{clientMessageId}`，每个输入使用独立浏览器UUID；窗口从原投递与Core实际turn ack产生信封optional clientMessageId。UI只按该ID与原role/runtime/project的气泡绑定权威turnId，旧三参继续兼容；未知旧流不猜latest/同文本。历史optional顶层turnId/eventKind由窗口透传Core原metadata；逐次出现匹配并保留未落盘记录、回交/收尾及确认卡。runtime-ui.js新增replayKey/replayCounts/tokenId；ui-labels判等增加turn/event字段。前一静态守卫候选的自有60项与独立真实main23项通过，当时生产fingerprint匹配；阶段9项受控metadata和静态守卫分别记录，真实ack/主进程证据见[U1R记录](docs/fix/2026-10-14_fix_live-history-merge.md)。

U1R2新增真实卡锚点保留修复：有窗口request/conclusion标识时，原保留operator延后按operatorAnchorIndex插入，复用原DOM并更新后续索引；显式null replayToken保持未知。当前自有60/离线Electron12通过，产品字节变化后的独立实际23及旧UI/锚点回归待T1重验，前版23只作历史。见[当前修复记录](docs/fix/2026-10-14_fix_preserved-card-replay-anchor.md)。
