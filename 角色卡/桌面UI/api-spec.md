# 桌面UI API 规格（渲染侧契约）

> 实现报告。源码在 `app/renderer/`，归「桌面UI」角色。**拆分初始版**：IPC 通道表（主进程侧）与完整导出清单在冻结归档 `角色卡/桌面应用/api-spec.md`（只读，拆分前冻结形态）；本角色将在下一次界面交付时按现状重建本页。

## 渲染侧导出（供 node 同源加载的纯函数模块）

| 模块 | 全局名 | 关键导出 |
| --- | --- | --- |
| `app/renderer/markdown.js` | `globalThis.ANSMarkdown` | `esc`（转义单一来源）、`renderMarkdown`、`options`、`createRenderer`（测试钉子面） |
| `app/renderer/role-status.js` | `globalThis.ANSRoleStatus` | 角色状态七态派生（图标/文案/样式的唯一映射）；`deriveRoleStatus` 优先级 **`awaitingConfirm > working（busy/队列待办）> error > 其余`**——`error` 是上一轮终局，不代表当前轮（新轮 busy 时显示「工作中」） |
| `app/renderer/tool-rows.js` | `globalThis.ANSToolRows` | `activityOf`、`slimToolRow` 等活动分类与工具行纯函数 |
| `app/renderer/ui-labels.js` | `globalThis.ANSUiLabels` | `replayPlan`（回放策略）、队列视图与文案纯映射；I4 治理记录：`canEstablishGovernance`（动作可见谓词唯一入口）、`projectRoleCount`（**项目**角色计数，过滤 `builtIn !== true`——S1 文案只用它）、`governanceMissingText`、`governanceInvalidText`、`governanceEmptyState`、`governanceFailureView`（失败行唯一构造点，`phase` 是零副作用唯一依据） |
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

## 2026-10-17 I4 治理记录：消费契约与 DOM/探针

**消费（只读，通道属桌面窗口；按名消费，不另起别名）**：
- `listProject` 结果新增 `governanceRecord: { state: "present" | "missing" | "invalid"; reason?: string }`。渲染侧原样落 `state.governanceRecord`；字段缺失按 `{state:"present"}` 兜底（旧主进程 ⇒ 动作不可达、不崩）。`reason` 仅 `invalid` 使用。
- `desktop.previewGovernanceRecord(projectRoot)` → `{ok:true, preview:{projectRoot, governanceBoundaryRel, writePaths, pinPaths, roleIds, adoptExistingGovernanceDoc, acceptanceSource, legacyBoundaryRoleIds}}` 或 `{ok:false, code, message}`。
- `desktop.establishGovernanceRecord(projectRoot)` → `{ok, phase:"guard"|"precheck"|"write", code?, finalize:{status,message,wrote,pins,roles,...}}`；`finalize` 逐字展示，`phase` 是「是否零副作用」的唯一依据（`phase === "write"` 失败不得出现「未写入任何文件」）。

**可见谓词（唯一）**：`UiLabels.canEstablishGovernance(hasProject, hasRoles, recordState)` = `hasProject && hasRoles === true && recordState === "missing"`。`state.projectRoot` 为空串/非字符串均视为无项目。

**DOM（非模态；均在既有中栏，不新增模态层）**：
- `#governance-status.governance-status`：动态创建并 append 到既有 `.session-notice`（`hidden` 属性驱动）。S1＝`.gs-text` ＋ `button[data-governance-establish]`（「建立治理记录」）；invalid＝`.gs-text.gs-invalid`（「治理记录不可用：<reason>；本版不自动覆盖」，无按钮）；present/S0 隐藏。`.session-notice` 空态隐藏规则已纳入 `:has(#governance-status[hidden])`。
- `#governance-preview.governance-preview`：动态创建、紧随 `.session-notice`。内容钩子：`.gp-title`、`.gp-line`、`.gp-list`、`.gp-legacy`、`.gp-declare`、`.gp-note`、`.gp-error`、`.gp-success`、`.gp-actions`；按钮由 `data-governance-establish` / `data-governance-cancel` / `data-governance-dismiss` 委托。预览含 `writePaths`、`pinPaths` 与 `roleIds.length`、`adoptExistingGovernanceDoc`、`acceptanceSource`（逐字）、`legacyBoundaryRoleIds` 单行提示、「不扩大任何角色写边界、不修改任何角色边界文件内容。」。
- S1 空态（`.chat-empty`）：标题「尚无治理记录」、说明含角色数/主入口/`ans govern <项目目录>`、主按钮 `data-governance-establish`；S0 空态文案逐字不变。**角色数只计项目角色**：`UiLabels.projectRoleCount(state.roles)` 过滤 `builtIn === true`（内置治理主入口不计入；不硬编码角色名/id）。
- 文案：取消「已取消，未写入任何文件。」；建立中「正在建立治理记录…」＋disabled；成功 `finalize.message`＋「治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。」；失败按 `governanceFailureView`（§4.5 的 `already-established`/`busy`/`invalid-record` 文案）。

**调试探针（只增不改）**：`window.__ansRenderer.governance = { state(), openPreview, cancelPreview, confirm }`。`state()` 返回 `{record, visible, open, busy, preview, error, result}`（只读快照）；`visible` 仍由 `governanceActionVisible()` 单点计算。

## 2026-10-17 助手消息渲染语义（修订）

三种适配器（Pi `message_end` / Codex `item/completed` / Claude assistant text block）只发**完整消息**，渲染层无增量文本更新——`appendAssistant` 新建行**恒 `mdReady: true`**，经唯一构造点 `buildAssistantRow(rec)` 立即 `Md.renderMarkdown`；**不再读 `roleBusy`/`settledTurns`**，也不等待 settled。`upgradeStreamingMarkdown` 与 `.msg-assistant.is-streaming` 仅保留为**旧行/异常行安全网**（正常路径不可达；CSS 注释注明唯一用途），不得据此理解为存在第二套正常渲染路径。`uiux-v2.mjs` 的活动轮断言改为「助手消息即时渲染、不挂 `is-streaming`」。跨边界提示：`test/桌面应用/hot-path.test.ts` 仍以旧语义字面量断言（安全网使其保持绿），归属角色可按新语义更新。

## 2026-10-17 A1+A2 企业级稳定感：CSS token / 几何契约

**生产改动仅 `app/renderer/styles.css`**（文件末尾 A1、A2 两个覆盖块，可分别回滚）；HTML/JS/桌面窗口零改动。

**A1 结构**
- `:root { --content-max: 900px; }`。
- 三条结构线：`.col-left { border-right: 1px solid var(--border); }`；`.titlebar { border-bottom: 1px solid var(--border-strong); }`；`.chat-head { border-bottom: 1px solid var(--border); height:auto; min-height:72px; }`；`.composer { border-top: 1px solid var(--border); background:#FAFBF8; box-shadow:0 -6px 18px rgba(21,31,26,.035); }`。
- 同列：`.chat-pane`、`.capsule, .attach-row, .compose-note` 均 `max-width: var(--content-max)`；`.chat-head, .session-notice` 用 `padding-inline: max(32px, calc((100% - var(--content-max)) / 2))`，≤1100 档 24px（不给 head/composer 加滚动条宽度；`.chat` 的 22/14px + scrollbar-gutter 承担）。
- `#chat > .op-chip` 定位公式改 `min(var(--content-max), 100%)`。
- 实测（Electron 1360/960）：pane＝capsule＝900/736；head/capsule/note 左缘差 <2px；`document.documentElement.scrollWidth === innerWidth`。

**A2 重量**
- token：`--chrome #EDF0EA`（`--bg-side` 别名）、`--border #D7DDD4`、`--border-strong #C4CEC2`、`--border-control #8A968B`、`--text #232C29`、`--text-2 #55625B`、`--text-3 #6A756E`、`--success #2D634E`、`--success-hover #244F3E`、`--success-bg #E5EEE7`、`--danger #A1433C`、`--danger-bg #FBEFED`、`--amber #8A5B23`、`--focus-ring #2D634E`、`--radius 8px`、`--radius-sm 6px`、`--shadow-card`、`--shadow-dock`。
- 控件边框：`.capsule`、`#runtime-select` 用 `--border-control`（3.08:1）。
- 圆角：容器 8（胶囊/报告/交付/任务请求/附件/`sc-card`）、控件 6（按钮/引擎选择器/菜单项/发送停止）、用户气泡 `8px 8px 3px 8px`。
- 表格：`.msg table` 13/20 + `outline:1px solid var(--border-strong); outline-offset:-1px` + th/td `6px 10px` + 表头 `--bg-soft`/强底线；**不改** `display:block`/`overflow-x:auto`。`.card-md` 仅随 token。
- 阴影：仅 `.composer`（dock）与 `.sc-card`（card）；普通消息/报告卡/任务请求零新增阴影。
- D6：`.tree-item.active { box-shadow: inset 2px 0 0 var(--success); }`（类名以实现为准）。
- D7：正文保持 `15px/1.8 = 27px`；A3 间距/字号/左树高度未动。

## 2026-10-17 Pi「高级」设置组：键表与渲染契约

- **高级区唯一来源**：`ADVANCED_SETTING_KEYS = ["ANS_PI_CONTEXT_WINDOW", "ANS_PI_PROMPT_TIMEOUT_MS"]`（顺序即渲染顺序）；主字段区以同一表 `indexOf(f.key) < 0` 排除。新键加入只改此表与 `PI_KEYS`，不得另立判据。
- 字段形状由共享元数据提供：`label`（如「整轮超时（ms）」）、`help`、integer 约束；渲染侧只呈现，不硬编码文案/value 校验。正整数仍为 `type="text"` 输入（不引入新控件）。
- 渲染：`.pi-advanced` 在至少一个高级字段存在时显示；`.pi-advanced-body` 按白名单顺序 `map → filter(Boolean)` 渲染 `fieldHtml`（缺件跳过 ⇒ 旧窗口视图只给 `CONTEXT_WINDOW` 时兼容）；两项之间插入既有 `.pi-advanced-hint` 分隔说明「以下高级项均可留空；留空 = 使用默认值。」（不新增样式体系）。
- 预填/保存沿用 `piView.fields` 循环（新键自动纳入）；保存校验由桌面窗口执行，渲染侧不复制。
- 测试：`test/桌面应用/renderer.test.ts` 的 T28 扩展用例（两键归属/顺序/单项兼容/分隔/文本控件/元数据文案）。

## 2026-10-17 Pi 高级预设档位滑块（range）DOM 契约

- `fieldHtml` 分支条件：`f.control === "range" && Array.isArray(f.choices) && f.choices.length > 0`。
- 可见控件：`<input id="pi-range-<key>" class="pi-range" type="range" min="0" max="choices.length-1" step="1" value="<index>" aria-valuetext="<label>">` + `<output id="pi-range-out-<key>" class="pi-range-out" for="pi-range-<key>"><label></output>`。
- **保存值来源不变**：`<input id="pi-inp-<key>" type="hidden" value="<choices[index]>">`（默认档 `""`）；既有保存循环读 `#pi-inp-<key>`，保存链零改动。label 的 `for` 指向滑块（range）或文本输入（非 range）。
- 纯映射（`ui-labels.js`）：`rangeChoiceIndex(choices,value)`（不在档位 ⇒ -1）、`rangeChoiceValue(choices,index)`（越界 ⇒ ""）、`rangeChoiceLabel(choices,choiceLabels,index)`（缺标签回退 raw value）。
- 预填/同步：`syncRange(key)` 读 hidden → index → slider/output/aria（并把 hidden 规范化为规范值）；`bindRangeControl(key)` 在 `input` 事件写回 hidden 规范值 + output + aria。自定义值（index=-1）回退 `type="text"` 并显示 `.pi-range-note`「当前值不在预设档位；改为预设档位后保存」。
- CSS：`.pi-range-wrap`（flex、gap 10）、`.pi-range-out`（12px、`--text-2`）、`.pi-range-note`（11px、`--amber`）；range 轨道 `--border`、滑块 `--success`、focus 环 `--focus-ring`。
- 跨边界：`test/桌面应用/e2e/main.mjs` 若按 `label[for="pi-inp-<key>"]` 取标签，会因 range label 指向 `pi-range-<key>` 而取空——归桌面窗口调整。
