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

## 2026-10-17 su 命令审批卡：消费字段与呈现契约

- 请求数据面（桌面窗口 `ShellConfirmRequest`）：新增 `policy: "su-approval" | "project"`、`tier: "risky" | "review" | "deny" | null`；其余 `command`/`summary`/`reasonPlain`/`reasonRaw`/`argvLines`/`cwd` 不变。渲染侧**只呈现**，不重写判定；字段缺失按 `project` 原行为。
- 标题（`#sc-title`）：`UiLabels.shellConfirmTitle(policy)`——su ⇒「SU 命令审批」，否则「shell 命令请求」。
- 档位可见行（`#sc-summary`）：`UiLabels.suApprovalTierLabel(tier)`——`风险命令（risky）` / `未自动判定（review）` / `硬拒类（deny）`；未知 tier ⇒ 空（不编档位）。su 且有 summary 时显示「档位 · 摘要」；project 摘要逐字不变。
- 原因（`#sc-reason`）：`reasonPlain` 原文；su 卡额外追加可见单行「命中原因：<reasonRaw>」（CSS `white-space: pre-wrap`）；project 的 `reasonRaw` 仍只在折叠详情 `#sc-reason-raw`。
- 警告（`#sc-hint`）：su 卡前置「批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。」＋既有 fail-closed 提示；project hint 逐字不变。
- 焦点/按钮：`#sc-deny` 默认焦点；拒绝/关闭/Esc ⇒ `allow:false`；恰 `allow:true` 才回传放行；无「记住/不再询问」。
- 样式：`#shell-confirm.is-su-approval` 由渲染侧切换（`.sc-summary` 600、`.sc-hint` 用 `--amber`）；零 HTML 改动。
- 测试：`renderer.test.ts` 的 SU 审批卡用例；`uiux-v2.mjs` 的 `ANS_TERMINAL_UI_ONLY=1` 段（TERMINAL_PASS 14）。

## 2026-10-17 字体契约：整页等宽（客户裁定）

- `styles.css :root`：
  - `--mono: ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Consolas, "Liberation Mono", "Microsoft YaHei", monospace;`
  - `--sans: var(--mono);` —— 单一来源；UI 标签/按钮/标题/消息/表格全部经 `var(--sans)` 或 `var(--mono)` 取同一栈。
- 中文由 `"Microsoft YaHei"` 兜底；**不引入**外部字体文件、`@font-face` 或专有 Anthropic 字体。`index.html` CSP 保持 `default-src 'none'`（本地系统字体无需 `font-src`；未改 HTML）。
- 字号基线不变：body `13px/1.55`、消息 `15px/1.8`（27px）；A1+A2 的 900 内容列、结构线、贴底输入区不变。
- 约束：新增样式不得再写 `system-ui` / `"Segoe UI"` 作为主字体，也不得绕过 `--sans`/`--mono` 自写第二套字体栈（测试守卫）。

## 2026-10-17 可收起左栏：DOM / 状态契约

- 状态单点：`.app.is-sidebar-collapsed`（DOM 唯一判据；渲染侧 `sidebarCollapsedNow()`）。收起时 `.app { grid-template-columns: 0 minmax(0,1fr) }`，`.col-left { opacity:0; visibility:hidden; overflow:hidden; padding-inline:0; border-right-width:0 }`——完全隐藏、不占位。
- DOM：`#sidebar-collapse`（`.col-left` 品牌区右上，`‹`，aria-label「收起左侧栏」，展开态可见）；`#sidebar-expand`（`.col-mid` 左上绝对定位，`›`，aria-label「展开左侧栏」，收起态可见；不在标题栏拖拽区）。原生 `<button>`，Enter/Space 触发；无新增快捷键。
- 持久化：`localStorage["ans.sidebar.collapsed"]`（`"1"` 收起 / `"0"` 展开；默认展开）。读：`try { UiLabels.sidebarCollapsedFromStorage(getItem) } catch { false }`；写：`try { setItem(key, collapsed ? "1" : "0") } catch {}`；坏值/异常回退展开。
- 切换：先记 `#chat.scrollTop`，应用类后回写（正文列宽不变时保持；内容变矮时按浏览器上限夹取）。宽档（≥1101）栅格轨道 160ms 过渡 + 左栏 opacity/padding 160ms；≤1100 不参与栅格过渡（避免窗口跨断点重排），仍保留 opacity；`prefers-reduced-motion: reduce` 全部禁用。
- 几何：收起前后 `.chat-head`/`.composer` 的 y 不变；内容列保持 `--content-max:900px`（960 收起后可容纳 900、展开时 736）；`document.documentElement.scrollWidth === innerWidth`。
- 探针（只增）：`window.__ansRenderer.sidebar = { collapsed(), toggle(), set(collapsed) }`。

## 2026-10-17 左栏宽度调节：token / DOM / 持久化契约

- 宽度单点：`--sidebar-width`（`:root` 默认 `248px`）；`.app { grid-template-columns: var(--sidebar-width) minmax(0,1fr) }`（窄档同）。折叠态 `.app.is-sidebar-collapsed` 把首列置 0，但**不改变** `--sidebar-width`（展开恢复）。
- 范围/默认：`UiLabels.SIDEBAR_WIDTH_DEFAULT=248`、`MIN=208`、`MAX=360`；`clampSidebarWidth(value)`（非数/缺失⇒248、越界⇒边界、四舍五入）、`stepSidebarWidth(current,delta)`（键盘步进先归一再加）。
- DOM：`#sidebar-resizer`（`.sidebar-resizer`，`role="separator"`、`aria-orientation="vertical"`、`aria-valuenow/min/max`、`tabindex="0"`、`cursor:col-resize`）位于 `.col-left` 右缘；视觉线 `::after` 用 `--border-strong`，hover/拖动 `--success`；不与 `#sidebar-collapse` 重叠、不入标题栏拖拽区。
- 交互：pointerdown/move/up（按 `clientX` 位移改变量；拖动期 `.app.is-sidebar-resizing` 禁用过渡、`cursor:col-resize`/`user-select:none`）；`dblclick` 复位 248；`ArrowLeft/ArrowRight` ±8、Shift ±24。
- 持久化：`localStorage["ans.sidebar.width"]`；读 `try/catch` → clamp（坏值回退 248）；写前 clamp、写异常静默；拖动松手/双击/键盘步进时持久化。
- 几何：内容列仍 `--content-max:900px`；1362/1280 展开默认 248 时 pane=900；960 展开默认 248 时 pane=664（无横向溢出）；收起后 960 pane=900。拖动/折叠前后 `.chat-head`/`.composer` 的 y 不变。
- 探针（只增）：`window.__ansRenderer.sidebar = { collapsed(), toggle(), set(), width(), setWidth() }`。

## 2026-10-17 左树选中项滚动定位契约

- 树项 DOM：`.tree-item[data-role-id="<roleId>"]`（渲染侧设置；测试/e2e 用此定位）。
- 纯函数：`UiLabels.roleTreeScrollDelta(treeTop, treeBottom, itemTop, itemBottom)`——条目完整可见（±1px）⇒ `0`；在上方 ⇒ 负位移（对齐顶）；在下方 ⇒ 正位移（对齐底）；非数/缺参 ⇒ `0`。
- 渲染：`ensureRoleTreeVisible(roleId)` 按 rect 求位移后 `tree.scrollTop += delta`（只做最小位移，**不**写 `scrollTop=0`、**不**用 `scrollIntoView`）。调用点：`applyListing` 末尾（`selectedRoleId || primaryRoleId`，导入/刷新）与 `selectRole` 渲染树后。
- 语义：已可见时**绝不打扰**（保留用户手动滚动）；导入/切换项目默认选中主入口 ⇒ 主入口自动进入 `.tree` 视口；选中其他角色 ⇒ 该角色进入视口。

## 2026-10-17 治理记录 pin 不符的重新接受（D1–D3）

任务书：[pin 恢复评审 §5.4](../../项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md)；产品提案 §三。

**消费契约**（只读，通道属桌面窗口；按名消费，不另起别名）：
- `listProject.governanceRecord` 新增第四态 `pin-mismatch`，并带 `pinFiles: [{ path, pinned, actual, status: "modified" | "missing" | "unreadable" }]` 与 `pinCount: number`；`present` 形状不变。
- `desktop.previewGovernanceReacceptance(projectRoot)` → `{ok:true, preview:{writePaths, pinPaths, pinCount, changed, canConfirm, blockers, previewDigest}}` 或 `{ok:false, status, message}`。`ok:true + canConfirm:false` 仍展示明细，但确认禁用。
- `desktop.reacceptGovernancePins(projectRoot, previewDigest)` → `{ok, status, phase:"guard"|"precheck"|"write", message, wrote, pins?, changed?}`。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `governanceActionFor(hasProject, hasRoles, recordState)` → `null | "establish" | "reaccept"`——动作可见谓词**唯一入口**；`pin-mismatch ⇒ reaccept`、`hasRoles === true && missing ⇒ establish`、其余 null。`canEstablishGovernance` 保留但委托单点（`=== "establish"`）。
- `governancePinMismatchText(pinCount, changed)` / `governancePinMismatchEmptyState(pinCount, changed)`——状态行与空态文案（只列非零类别；三类均零用「存在不一致」；空态含 hint）。
- `governanceReacceptPreviewView(preview)` → `{title, fileLines, writeLine, pinLine, warning, canConfirm, blockerLines}`；modified 行显示 `pin {旧前8位}… → 现 {新前8位}…`，missing/unreadable 行分别标注；未知状态不展示、不编语义。
- `governanceReacceptSuccessText(pinCount, changedCount)` / `governanceReacceptFailureView(phase, status, message)`——后者 `phase !== "write"` 时追加零写入声明与 status 提示；`phase === "write"` **只逐字 message**，绝不追加「未写入任何文件」、绝不出现「已恢复/已成功」。

**DOM/行为**：
- `state.governanceRecord` 保留 `pinFiles`/`pinCount`；未知状态按 `{state:"present"}` 兜底（fail-closed，不显示动作）。渲染侧**不得**出现 `state === "pin-mismatch"` 直接比较。
- `#governance-status`：`reaccept` ⇒ mismatch 文案＋`button[data-governance-reaccept]`（「检查并重新接受」）；`establish`/`invalid` 行为不变。
- su 空态（`.chat-empty`）：`reaccept` ⇒ mismatch 标题/说明/`.empty-hint` 次行＋主按钮「检查并重新接受」；`establish` 不变。
- `#governance-preview` 共用宿主：`governanceFlow.mode: "establish" | "reaccept"`；`reaccept` 打开调 `previewGovernanceReacceptance`，确认调 `reacceptGovernancePins(projectRoot, preview.previewDigest)`；取消/关闭**零 IPC**；`busy` 或 `canConfirm === false` 时确认按钮 disabled；失败可「重新检查」，`phase === "write"` 不提供重试。
- 成功后不自行伪造刷新：由主进程 `project:changed` → `refreshProject` → `listProject`，状态回 `present`、动作消失；不自动打开会话。
- 样式最小增量：`.governance-preview .gp-file`（明细行等宽）、`.gp-blocker`（限制原因，`--danger`）、`.empty-hint`；既有 900 列与等宽字体未动。

**测试证据**：`tool-rows.test.ts` 新增 5 例（谓词真值表、文案逐字、预览视图、成功/失败分支含 phase=write 与 precheck 差异）；`renderer.test.ts` 新增 5 例（落库/单一谓词/状态行/空态/预览宿主与零 IPC/成功失败路径）。本机 4 红为既有 CRLF 基线（N-1、data-state、P1-3、G-5），与本批无关。真机渲染：`uiux-v2.mjs` 新增 `ANS_GOVERNANCE_REACCEPT_UI_ONLY=1`（受控 IPC 替身＋真实 Electron；7 项 DOM 断言，`GOVERNANCE_REACCEPT_UI_PASS 7`；截图 `%TEMP%/ans-governance-reaccept-ui/governance-reaccept-{mismatch,preview,success}-1360.png`）。实跑修正：成功后清空 `#composer-hint` 的旧「已取消」提示。

## 2026-10-17 P5「替我审」自动判断：消费契约 / DOM / 文案单点

任务书：项目管理评审 `2026-10-17_design_shell-auto-approve-review.md` §6.5、§6.6、§9.3、§10（客户 D1/D2 已拍板）。

**消费契约**（只读，通道属桌面窗口；按名消费冻结桥，不另起别名）：
- `desktop.getShellJudgeState()` → `{version:1, ok, enabled?, error?}`；启动默认 `false`。
- `desktop.setShellJudgeEnabled(enabled)` → `{version:1, ok, enabled?, error?}`；失败**不改状态**。
- `desktop.onShellJudgeState(cb)` ← `shell:judge-state`：`{version:1, enabled}`（开关变化/重载复位/初次加载后推送）。
- `desktop.onShellJudgeResult(cb)` ← `shell:judge-result`：`ShellJudgeResultPayload`（`verdict/engine/reasonCode/operator/command/summary/policy/tier/hardDenyOverride/label/reason/customerMessage/alternative/evidence`）。
- `ShellConfirmRequest` 新增可选 `judgeNotice`（手动回落提示；渲染侧原样逐字呈现，不进 `reasonRaw`）。
- **桥缺失/主进程未接线**：复选框禁用，标签「当前版本不支持自动判断，保持手动」；**不显示假开启态**。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `shellJudgeToggleView(available, enabled, busy)` → `{available, enabled, checked, disabled, label, title, warningVisible}`：off「替我审」/悬停「手动逐条确认 shell 命令（默认）」；on「替我审批中 · 判断 agent」/悬停「判断 agent 先评估 shell 命令必要性；可随时关闭」；桥缺失固定文案；桥缺失时即使传入 enabled 也 **checked=false / warningVisible=false**。
- `shellJudgeToggleResult(previousEnabled, res)` → `{enabled, error}`：`ok:true` 且有布尔 `enabled` 才采用主进程值；失败/坏件保持 `previousEnabled` 并给错误文案。
- `shellJudgeWarningLines()` → §10.2 三段逐字（返回副本）。
- `shellJudgeNoticeText(reasonCode)` → 一般 manual「判断 agent 未能完成判断：<人话原因>。已转你手动确认。」；`row-failed`「判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。」。
- `shellJudgeReasonText(reasonCode)` → manual reasonCode 人话映射（与桌面通道 `judgeManualHumanReason` 同解；未知 ⇒「判断未完成」）。
- `shellJudgeResultView(payload)` → `{verdict, denyOverride, title, label, summary, engineText, operatorText, tierText, at, lines, retryHint, toolCallId, details}`；`manual`/未知裁决 ⇒ `null`（**manual 不产生结果行**）。allow 标题「已替你放行（判断 agent）」；deny 档放行标题「已替你放行（判断 agent · deny 档）」＋徽标「deny 档 · judge 放行」＋「该命令属于硬拒类，判断 agent 判定必要后放行；请复核」；deny 标题「未放行（判断 agent）」＋理由/替代方案/客户说明＋「可关闭「替我审」后重试（改为手动确认），或按替代方案调整命令。」；summary 空 ⇒「无法概括命令；展开查看原文」。
- `shellJudgeEngineLabel(engine)` → Claude/Pi/Codex（未知如实原文，缺省「未报告」）。

**DOM/行为**：
- `index.html` `.composer-bottom`：附件按钮之后、`#composer-scope` 之前新增 §10.1 逐字复选框 `label.composer-auto-approve > input#auto-approve-toggle + span#auto-approve-label`；错误状态位 `#auto-approve-status`（aria-live）。输入区下方常驻警告 `#shell-judge-warning.judge-warning`（默认 `hidden`，琥珀色，非错误红）。shell 卡新增 `#sc-judge-notice.sc-judge-notice`（摘要之后、原因之前，默认 `hidden`）。
- `renderer.js`：`initShellJudge()` 判桥四方法齐备 → 订阅 state/result → `getShellJudgeState()`；复选框 change 只调 `setShellJudgeEnabled`，由 `shellJudgeToggleResult` 落主进程实际值（失败保持原值并显示 `#auto-approve-status`）；`shell:judge-state` 只接受 `version:1 + 布尔 enabled`。**不写 localStorage/.env/项目文件，不自动开会话/切角色，不触碰已挂起卡。**
- 结果行：`onShellJudgeResult` 按 `roleId` 落该角色 pane，按 `toolCallId` 扫描行表（工具组 `.items[].callId`、生命周期 `activityStages`、operator `toolCallId`、`data.toolCallId`）并插到其后；定位不到 ⇒ 追加流尾（不丢行优先）；`payload.id` 幂等去重；仅在原 pane 处于底部附近时贴底。行类 `.sys.shell-judge-row`，钩子 `.sj-head/.sj-title/.sj-badge/.sj-cmd/.sj-meta/.sj-line/.sj-exit/.sj-details`。**不自动切换当前角色/视图。**
- 样式：`.composer-auto-approve(.is-on/.is-unsupported)`、`.composer-judge-status`、`.judge-warning`、`.shell-judge-row` 族、`.sc-judge-notice`；开启态与警告一律 `--amber`（不是 `--danger`）；警告随 `--content-max`（900）且继承整页等宽字体。
- 探针（只增）：`window.__ansRenderer.shellJudge = { state(), onState, onResult }`（只读快照 + 直接注入推送/结果；桥缺失时 `state.available=false`）。

**测试证据**：`tool-rows.test.ts` 新增 8 例（开关三态/结果自洽/警告逐字/allow/deny 档/deny/manual/notice）；`renderer.test.ts` 新增 5 例（DOM 与样式钩子、开关三态与失败回退、结果行锚定与 deny 徽标、judgeNotice、边界「不自动开会话/不写持久化」）；`uiux-v2.mjs` 新增独立模式 `ANS_JUDGE_UI_ONLY=1`（受控 IPC 替身＋真实 Electron；**JUDGE_UI_PASS 14**，含启动关闭态、开启/取消、失败回退、state 推送、deny 档 allow 锚点、deny 行、manual 不落行、judgeNotice、已挂起卡不受切换影响、后台角色 pane 隔离）；既有 `ANS_TERMINAL_UI_ONLY=1` 增加启动态断言（**TERMINAL_PASS 15**）。全仓 2454 计 /2431 过 /20 红（与改动前基线红集一致）/3 skip；`npx tsc --noEmit` 0 错。

## 2026-10-17 W4 治理三权：左树/空态/状态行/决定卡（评审 §8）

任务书：项目管理评审 `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §8（全部）、§九 UI 相关、§十一 W4。

**消费契约（只读；桌面窗口 W3 透传）**：
- `listProject.governanceModel?: "single" | "trio"`。渲染侧只在值恰为 `single`/`trio` 时落 `state.governanceModelKnown=true`；缺失/坏值 ⇒ `known=false`：状态行模型与旧模型提示条一律不显示（**不猜模型**），树仍按角色自身的 `governanceFunction` 分组。
- `RoleView.governanceFunction?: "proposal" | "nomination" | "schedule"`（trio 内置角色，`builtIn:true`）。渲染侧**不硬编码** `rapporteur`/`nominator`/`convener` 任何 id；显示名、权力副标题、内置标识、专属空态全部经 `UiLabels.governanceRoleView/ governanceRoleEmptyState` 由 function 派生。`single` 旧内置 su（无 governanceFunction）逐字走原路径。
- `listProject.governanceFlow?: { flowId?: string; status?: string }`（可选）。`status` 只认 `awaiting-customer` / `in-progress` / `blocked` / `escalated-to-customer`；未知值不显示（不拿 Markdown/角色自述猜状态）。
- `CustomerInputRequest` 的可选治理字段：W0 冻结的 `flowId`/`stepId`/`cardKind`；另有可选展示字段 `paths?: string[]`、`summary?: string`、`artifactSha256?: string`（未给不显示；渲染侧不从 preview/正文抽取或自算）。
- `session:operator-request` payload 可选 `queued: boolean`（直接或在 `request.queued`）：桌面窗口是决定队列权威。`queued:true` ⇒ 卡显示「等待前一个决定」、全部作答控件禁用；同请求重推 `queued:false` ⇒ 解冻。**UI 不自动合并、不自动批准**（到达路径零 `operatorRespond`）。
- S1 建立治理记录：`previewGovernanceRecord(projectRoot, { governanceModel })` / `establishGovernanceRecord(projectRoot, { governanceModel })`。`governanceModelKnown !== true` 时模型单选与建立按钮 disabled 并显示「当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。」；旧窗口忽略第二实参（防御式兼容）。
- 预览可选返回 `governanceModel` / `suggestedGovernanceModel: "trio"` / `detectedGovernanceArtifacts: true`：前者与所选不一致时如实显示「（与所选不同）」；后者只显示「建议选择 trio」提示，**不自动切换**（必须客户点选）。
- 迁移桥 `previewGovernanceMigration(projectRoot)` / `migrateGovernanceModel(projectRoot, previewDigest)`：两者都存在时旧模型提示条按钮启用（「查看差异 / 升级」），否则「升级入口待本版后续」禁用。点击只打开**零写入**非模态预览（复用 `#governance-preview`）；取消/关闭零 IPC 写调用。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `governanceRoleView(fn) → {cn,en,name,power,builtinNote,emptyHint} | null`：`报告员 Rapporteur`「提案权 · 不拥有最终批准权」/`提名官 Nominator`「提名权 · 不拥有最终批准权」/`召集人 Convener`「编排权 · 不拥有最终批准权」；内置标识「内置角色：随应用发布，无角色目录」；未知/缺失 ⇒ null。
- `governanceRoleEmptyState(fn)`：提名「通常由流程单提名步骤打开；仅在客户明确要求时直接使用」、编排「通常由已接受提案开启流程；只负责排步骤与派发，不批准方案」；提案 ⇒ null（沿用既有 S0/S1 空态）。
- `governanceStatusText(model, flowId, status)`：`治理模型：三权|旧模型（su）`、`当前流程：<flowId>`、四态人话，以 ` · ` 连接；未知/缺失项不出现。
- `governanceMigrationButtonView(wired) → {label, disabled, title}`；`GOVERNANCE_MIGRATION_TEXT` 逐字「本项目使用旧治理模型（su）。可升级为三权模型。」。
- `governanceModelOptionText(model)`：`单模型（single）` / `三权（trio）`。
- `governanceCardMetaView(request) → {governance,badge,power,flowId,stepId,lines}`：`cardKind`→权力（`proposal→提案`、`appointment/appointment-write→提名`、`schedule-write→编排`、`acceptance→验收`）；治理决定徽标「治理决定 · 客户最终批准」；`lines` = 流程/步骤/权力类型/将写路径（逐条）/摘要/哈希（接口给了才出现）；普通 `write` 与缺失不是治理决定（无徽标/权力行）；`GOVERNANCE_QUEUE_NOTE`「等待前一个决定」。
- `GOVERNANCE_GROUP_LABEL`「治理职能（内置）」、`GOVERNANCE_ROLE_BUILTIN_NOTE`、`GOVERNANCE_DECISION_BADGE`、`GOVERNANCE_MODEL_SUGGEST`、`GOVERNANCE_MODEL_UNWIRED`。

**DOM/行为**：
- 左树 `renderRoleTree`：`主入口`（`primaryRoleId`）→ `治理职能（内置）`（其余带 `governanceFunction` 的内置角色）→ 其余项目角色沿用 `Rt.roleGroups`（`group`/`groupDuty`）。治理行 `.ti-name`＝「中文名 英文名」、`.ti-power`＝权力副标题、`.ti-builtin`＝内置标识；`aria-description`/`title` 同步。single 旧树逐字不变。
- 空态 `emptyStateHtml(roleId)`：提名/编排 pane 显示专属标题+说明（无 CTA）；Rapporteur 保留「建立治理记录 / 检查并重新接受」；S0/S1 文案逐字保留。
- `#governance-status`：`.gs-model` 模型/流程行（模型未知不显示）；单模型项目追加 `.gs-banner`（提示条 + `button[data-governance-migrate][disabled]`）。既有 `data-governance-establish/reaccept` 动作不变。
- 决定卡：`.op-gov-badge`（治理决定徽标）、`.op-meta`（元信息逐行 esc）、`.op-queued`（等待前一个决定）；`queued` 时作答控件 disabled；同一请求重推 `queued` 只更新排队呈现。
- `#governance-preview` 建立模式：`.gp-model` 单选（`input[data-governance-model]`，默认 single）、`将写入的治理模型` 行、`.gp-model-note`（建议 trio / 未接线说明）；确认按钮在未报告模型时 disabled。
- 探针（只增）：`window.__ansRenderer.governance.state()` 追加 `governanceModel`/`governanceModelKnown`/`governanceFlow`/`previewModel`。

**测试证据（本批）**：`tool-rows.test.ts` +5（角色文案/专属空态/状态行/迁移按钮/决定卡元信息逐字）；`renderer.test.ts` +5（三组树与无硬编码 id/空态接线/状态行与迁移条/S1 模型选择与透传/决定卡与排队不自动批准）。边界内 `renderer+tool-rows` 134 计/130 过/4 红（4 红＝既有 CRLF 基线：N-1、data-state、P1-3、G-5，与本批无关）。全量 `node --test "test/**/*.test.ts"`：2596 计/2538 过/55 红/3 skip；红集为既有/他域在飞（W0–W3）与上述 4 条 CRLF 基线，另有 1 条 `test/测试/.../e-contract-wiring` E2 因 `establishGovernanceRecord` 新增第二实参（模型选择透传）的旧正则失配，待测试角色 W5 同步。`uiux-v2.mjs` 未加 UI-only 模式（真实 Electron 夹具成本高；DOM 行为由源码守卫覆盖，真机验收留 W5）。

### V1b 迁移界面（2026-10-17 追加）

**消费契约（桌面窗口已接线）**：
- `desktop.previewGovernanceMigration(projectRoot)` → `{ok:true, preview:{model, targetModel, writePaths, modelField, manifestLine, pinChanges, retainedFiles, snapshotDigest}}` 或 `{ok:false, code, message}`；预览**零写入**。
- `desktop.migrateGovernanceModel(projectRoot, previewDigest)` → `{ok, phase:"guard"|"write", status:"completed"|"already-trio"|"no-record"|"blocked"|"write-failed"|"preview-stale"|"busy"|"invalid-request", model, message}`。
- 两个桥方法都存在时提示条按钮启用（`governanceMigrationButtonView(true)`）；否则「升级入口待本版后续」禁用。**不新增模态**：迁移预览复用 `#governance-preview`（`governanceFlow.mode = "migrate"`）。

**渲染侧导出（`ui-labels.js`）**：
- `governanceMigrationButtonView(wired)`：wired ⇒「查看差异 / 升级」可用；否则待后续禁用。
- `governanceMigrationPreviewView(preview)` → `{title, modelLine, writeLines, modelFieldLine, manifestLine, pinLines, retainedLines, digestLine, warning, canConfirm, digest}`：模型「旧模型（su） → 三权」、写路径逐条、`modelField`（`null` ⇒「字段缺失，将新增 `governanceModel: "trio"`」）、`manifestLine`、pin 变更（空 ⇒「无（不重算 pin）」；非空显示 path + 新旧前 8 位）、保留文件、`snapshotDigest` 前 8 位；`canConfirm` 只在摘要非空时 true（fail-closed）。
- `governanceMigrationSuccessText()` 逐字「已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。」。
- `governanceMigrationFailureView(phase, status, message)`：`phase !== "write"` 按 status 声明零写入（already-trio/no-record/blocked/preview-stale/busy/invalid-request）；`phase === "write"` 只逐字 message +「可能已写入部分文件，请核对现场」，**绝不**出现「已升级」或「未写入任何文件」。`noRetry` = write 阶段 / already-trio / no-record。

**DOM/行为**：
- 提示条按钮 `button[data-governance-migrate]`：点击 → `openGovernanceMigrationPreview()`（只调 preview）。
- 预览：复用 `.gp-title/.gp-line/.gp-note/.gp-declare/.gp-actions`；按钮 `data-governance-migrate-confirm`（「确认升级」/「正在升级…」）、`data-governance-cancel`、失败时的 `data-governance-migrate-recheck`（「重新检查」）、终态 `data-governance-dismiss`。摘要缺失/忙 ⇒ 确认 disabled。
- 确认：`d.migrateGovernanceModel(projectRoot, preview.snapshotDigest)`；成功只认 `ok === true && status === "completed"`，显示成功文案并**等主进程 `project:changed` 刷新**（不自行改 `state.governanceModel`、不自行刷新）。失败按 status/phase 显示；`phase === "write"` 不提供重试。
- 取消/关闭：只重置面板状态，**零 IPC 写调用**。
- S1 模型选择：仍以 `(projectRoot, { governanceModel })` 透传 preview/establish；listing 回报 `governanceModel` 后 `governanceModelKnown=true`，按钮不再因「模型未知」禁用；建议 trio 只提示、必须客户点选。

**测试证据（V1b 追加）**：`tool-rows.test.ts` +2（迁移按钮启用/禁用；预览字段/成功/失败逐字，含 pinChanges 防御与 phase=write 不假成功）；`renderer.test.ts` +4（按钮能力与零写入预览、预览字段与 fail-closed、确认摘要/成功/失败/取消零写、S1 透传与默认 single）。边界内 **140 计 /136 过 /4 基线红**。**跨角色对齐（已核）**：`app/preload.cjs` 的 `previewGovernanceRecord`/`establishGovernanceRecord` 已接受 `(projectRoot, options)` 并把 `governanceModel` 并入 IPC 载荷（Interface 同字段校验）；渲染侧调用形状与之一致（`{ governanceModel }`）。
