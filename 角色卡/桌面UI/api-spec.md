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


## 2026-10-15 UXv2 A/B/C消费者接线

已按批准总r2实现UI侧六文件，Model类型唯一定义见 `src/model/runtime.ts` 与 `src/model/project-document.ts`；UI不复制投影器、读取策略或公共schema。工具消费actual display/phase，legacy只消费Window保护后的来源/省略字段和opaque hashed定位token。源handback消费report/liveReport/reportPersistence，raw TaskHandback不进入UI；目标inputProvenance/inputPresentation与安全文本标志按可信身份显示，真实报告声明不等验收。

`desktop.readProjectDocument`仅传version/projectViewId/documentId，从当前documentScope及RoleView.documents显选；不传路径/root/URL。`retryReportSave`/`getReportSaveState`、`retryDeliveryHistorySave`/`getDeliveryReceipt`、`getSessionPersistence`仅传version/projectRoot/roleId/runtime与已有reportId或attemptId；外层受限ok与Core value保存结果分读。`onReportPersistenceUpdated`/`onDeliveryHistoryUpdated`按version/scope/change接入，同ID更新原卡，beforeunload调用取消订阅。两类重试保存不构造正文/新ID、不调用send或开启角色；目标历史补存永不Provider，源保存可由Window唯一enqueue首次继续原回交。

角色/引擎/项目切换、关闭/返回/另开文档的本地请求序号拒绝旧结果；不对OS读取作取消保证。固定上下文区 `#context-state`、历史省略/不可读报告区 `#history-projection-note`；文档同抽屉，真实opener回焦和阅读/草稿保持。实际字段/当前哈希、首红和验证边界统一见 `docs/change/2026-10-15_change_complete-flow-ui.md` 与对应manifest，不将离线IPC结果当后端安全或在线验收。


### 2026-10-15 真实停止事实的UI消费补充

沿现有sendSession返回消费Window可选flat事实（不另定义公共schema）：turnId/clientMessageId、inputAccepted:true、RuntimeTurnOutcome、sessionCurrent。与同scope/client/实际turn事件合并；仅typed prompt-input证明接收，ACK不等接收，首可信settled不改绑。正常aborted不回填已接收prompt、不误关会话；unknown保留未知，真失败/未接受拒发仍如实。sessionCurrent不保证ready，旧runtime返回不改当前草稿/按钮。无timer、错误文案判断或新的IPC。

P7当前queuehint是独立来源状态，不删聊天记录；对应client ACK/权威空queue清当前hint。交互终态与提交期间所有决策input/button disabled；非工具denied在live/history均仅显示实际系统事实。P5只用实际open前可读历史事实，P3资料返回恢复等效可见入口焦点。详见本轮change/evidence。


同轮非工具终态展示：在现有project/runtime/role视图内，仅可信非空topturn+相同有效outcome的非工具denied/settled聚合原行；不同诊断原文保留。无turn/不同turn/outcome或工具生命周期不受影响。历史仅复用已观察真实来源的精确replay token；冷历史缺outcome不补猜。无新API/公共schema/generation。


资料阅读状态补充：既有per-runtime/per-role drawerReading除outer/anchor/expanded外，按现有data-section存其唯一.card-text的scrollTop/scrollLeft，展开后先还内层再沿原outer/focus流程；新项目沿原reset清空。纯私有消费者状态，不新增IPC/公共字段，不改文档内容。


## UI-VISUAL-V2-1 当前DOM与消费约定

既有preload/IPC/Model契约不变。#tab-pi移动导航底部；#runtime-select、#tab-work（新增UI入口）、#tab-card位于会话头右；#btn-import导航底部；原win-min/max/close保真实窗口操作。#composer-capsule保原ID，textarea在上，附件/scope/键盘提示/发送/停止在下；原事件与图文/IME/callback身份不变。

work、card、pi、document复用424模态抽屉。仅导航/会话业务面inert，Tab不出资料层；系统窗口按钮不inert。work读取原pending/queue及reportCards/deliveryCards的实际safe reports，同scope真实reportId避免概览重复，不删除不同attempt时间线。来源文档仍只调用既有受限readProjectDocument，显选refs，不从report文字抽路径。

源与received报告共享reportBody：来源眉题/标题/声明，真实summary有界视图预览，完整可用safe summary/evidence可展开；source保存与独立验收分开，target回执在batch层。公开typedflags与unknown/省略照留，不改预算/modelPromptText。原文折叠仅实际report/source-turn关联：live等真实settled，cold非活动历史仅中性入口；无turn legacy不猜。记录自己的explicit open与既有replaytoken，保原位置，不合并工具/系统诊断/决定/终态。

布局按accepted V2（208/176、800、424、32）及180px右对齐引擎菜单；菜单只调用既有公开ANSEngineSelector.placement，未修改readonly selector模块或复制其viewport规则。当前字节/实际测试/有效图与排除图见本轮own evidence manifest；普通chat不生成报告、报告声明不等独立验收仍为不变量。

## 2026-10-16 视觉收敛 v3 实施面（批准①–⑦）

新增/变化的**渲染侧导出**（node 同源加载面）：
- `app/renderer/role-status.js`（`ANSRoleStatus`）：新增 `SPINNER_SVG`（全应用唯一一枚 12px SVG 弧线转轮图源，
  静止可读；`.spin-arc` 钩子）；`statusBadge()` 返回新增 `iconHtml`（目前仅 `working` 带 = `SPINNER_SVG`；
  `icon` 文本字形字段保留——一态一图标断言不变）。
- `app/renderer/tool-rows.js`（`ANSToolRows`）：新增 `mergePhases(items)`（S1 相位合并下标映射
  `[{index, phases[]}]`；同 toolCallId+turn 合并、无 callId 不并、不折叠重复调用）与 `callSummary(items)`
  （**折叠口径修订 2026-10-16**：`{calls, denied, failed, unknown, tools}`——`tools` 为按调用行的工具分解
  `[{name, count}]`（首现序）；`denied`=含未放行相位的行数、`failed`=含失败/超时终止相位的行数（同一行
  两类皆有 ⇒ 未放行优先）；旧 `exceptional` 字段按批准口径拆分为 denied/failed）；
  `classifyInjectedMessage` 的 system 结果新增 `displayBody`
  （W6b 展示正文，剥离 `[系统·<子类>] ` 前缀；`body` 原文与判据不改）。

**DOM/呈现契约**（e2e 与源码守卫按此断言；旧钩子全部保留）：
- 执行记录组：合并行 `.tool-activity` 携带 `data-activity-index`（首相位下标，读取捕获口径不变）与新增
  `data-activity-phases`（空格分隔的各相位下标，恢复兜底选择器）；行态为相位标签链（「调用发起 → …」），
  各相位安全详情仍以 `data-legacy-index`（原下标）折叠呈现。**组开合与摘要（工具行折叠口径，2026-10-16
  客户批准）**：摘要文案＝「本轮 N 个调用：a / b ×k / c（· 含 X 条未放行）（· 含 Y 条失败）（· 含状态未
  记录）」（计数经 `Tr.callSummary` 单点）；**运行中该轮（live 且未 settled 且 `roleBusy`）默认展开（逐条
  实时）**，**settled 收为折叠一行**（`foldTurnGroups`，批尾挂点 `flushDeferredFolds`——批内不折、不用
  计时器）；用户手动开合记入 `activityOpen[roleId][组 id]` 并在会话内**优先于默认态**（settled 也不收），
  键盘焦点在组内时不收；未放行/失败相位（同轮同 callId）并入组行且**独立未放行行照旧直显**（治理信号）。
- `#chat > .op-chip` 新增定位规则（左缘对齐 `.chat-pane`，随列宽自适应）；chip 可见时 `.tool-current`
  「等待你确认」不渲染（`renderCurrentWork`↔`updateOpChip` 同源联动；「正在工作」保留且带转轮）。
- 转轮类 `.spin-arc`（12px SVG）出现在：`.ti-status.st-working .ts-ico`（工作徽标）、`.tool-current`
  （正在工作尾行）、`.sys-loading`（开会话 loading）；动画唯二规则 `v3spin 0.9s linear infinite`；边框转轮
  `.spinner` 与 `@keyframes spin` **已退役**（不得回潮，守卫钉死）；reduced-motion 走全局既有规则（静止弧）。

**契约边界**：以上均为渲染侧内部呈现面；IPC 通道、事件形状与主进程契约**零变化**（跨边界需求仍走桌面窗口）。
验收与证据：`docs/fix/2026-10-16_fix_visual-convergence-v3-implementation.md`（§4 逐条断言 + 截图对照）。
