# 桌面UI API 规格（渲染侧契约）

> 实现报告。源码在 `app/renderer/src/`，归「桌面UI」角色。主进程侧 IPC 通道表与完整导出清单以桌面窗口 api-spec 为准；本页在 Phase 5B 收尾按新渲染器现状重建（顶部「最终口径」为现行契约，后半为历史实现记录）。

## 最终口径（Phase 5B 收尾，2026-10-21）

- **唯一生产入口**：`app/renderer/dist/index.html`，经 `app/desktop/renderer-entry` 解析（显式 `ANS_RENDERER_ENTRY` 仅作覆盖，缺失 fail-fast）；源入口 `app/renderer/index.html`（Vite input，481B）。
- **旧经典脚本渲染器已删除**：`renderer.js`、`styles.css`、7 个经典脚本与 `vendor/` 不再存在；不再有 `globalThis.ANSRoleStatus`/`ANSToolRows`/`ANSUiLabels`/`ANSRuntimeUI` 契约。`window.ANSMarkdown` 由新 `chat/markdown.ts` 兼容暴露（npm markdown-it 15.0.3）。
- **新渲染器模块**（`app/renderer/src/`）：见下表。

> 说明：本页后半部分保留 Phase 3A/3B/4A/4B 的实现历史（旧渲染器时代的文案/守卫记录）；当前可执行契约以本节「最终口径」与 [ui-contract-surface](docs/feature/ui-contract-surface.md) 为准。历史段中提到的旧文件/旧测试均已删除，不再作为现行 API。

| 模块 | 关键导出/职责 |
| --- | --- |
| `chat/markdown.ts` | `esc`（唯一转义源）、`renderMarkdown`、`markdownHtml`、`installMarkdownLinkHandler`；外链只经 `window.desktop.openExternal`，一律 preventDefault |
| `chat/status.ts` | `deriveRoleStatus`/`statusBadge`：等待确认 > 工作中（busy/队列）> 错误 > 其余；`.ti-count` 唯一数字 |
| `chat/tool-summary.ts` | 工具相位合并、折叠摘要、目标/状态/错误纯函数 |
| `chat/replay.ts` | 回放 skip/append/full、canonical key/去重 |
| `chat/events.ts` | SessionEvent/历史 → 行描述（user/assistant/tool/injected/operator/handback/turn-terminal/system-notice） |
| `chat/report-view.ts` | 报告/交付 facts、persistence 文案、安全显示副本 flags |
| `chat/operator-view.ts` | operator 镜像面、`pendingKindFor`（待选择/等待你确认）、治理卡文案 |
| `chat/governance-view.ts` | 治理记录 missing/invalid/pin-mismatch/reaccept 文案与动作谓词 |
| `chat/chat-store.ts` | 行模型/pane 版本/历史回放/阅读锚点/队列与状态；`window.__ansRenderer` 的数据源 |
| `test-driver.ts` | `window.__ansRenderer` 21 个方法/状态字段（e2e 唯一驱动面） |
| `shell/*` + `stores/*` | App/标题栏/左树/会话头/输入区/抽屉/设置/治理面板/work-overview；`lib/platform.ts` 是 `window.desktop` 唯一入口 |

## 对外依赖（只读消费）

- `window.desktop`：preload 白名单通道 + 主→渲染事件（`session:events`/`session:role-state`/`session:history`/`project:changed` 等）——**定义与实现属「桌面窗口」**（其 api-spec.md 为契约单一来源；通道增改由桌面窗口维护并同步本侧）。
- `window.desktop` 通道一览（拆分时现状，供本侧对照；以桌面窗口 api-spec 为准）：`app:pick-project`、`app:list-project`、`session:open/send/stop/live/history/role-state/operator-request/operator-response/abort/withdraw`、`session:event(s)`、`project:changed`、`app:open-external`、`app:pick-image`、`app:attach-image`、`pi-config:get/save`、`window:minimize/toggle-maximize/close/is-maximized/maximized-changed`、`shell:confirm-request/response`、`app:renderer-diagnostic`、`app:recovery-state`、`app:reload-interface`、`app:recovery-ready`。

## 装配说明（最终）

- Vite `root=app/renderer`、`base="./"`、`modulePreload.polyfill=false`、`build.target=chrome152`；输入 `app/renderer/index.html`，产物 `app/renderer/dist/index.html` + `dist/assets/*`。
- 生产 CSP 严格：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`；无内联脚本/样式。
- 依赖：npm `markdown-it` 15.0.3（lockfile pin）；不再有 vendor 目录或经典脚本装载顺序。

## 合规/偏离与测试证据（最终）

- 硬约束「渲染进程无第二份判定」「不接触 Node/fs/网络」由 `test/桌面UI/source-guard.test.ts` 守卫；Markdown 安全（XSS 负例/npm pin/外链拦截）由 `test/桌面UI/markdown.test.ts` 守卫；旧 178 项逐名迁移台账见 `docs/change/2026-10-21_phase5a-test-migration-ledger.md`。
- 5B 收尾证据：5A 36/36、4B 70/70、3B 45/45、4A 99/99、IME 26/0、design audit 31/0、单测 142/142；生产入口 `dist/index.html`；packaged smoke 完成。详见 `docs/change/2026-10-21-phase5b-evidence/`。

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
- `shellJudgeToggleView(available, enabled, busy)` → `{available, enabled, checked, disabled, label, title, warningVisible}`：off「替我审」/悬停「手动逐条确认 shell 命令（默认）」；on「替我审批中 · 判断 agent」/悬停「判断 agent 先评估 shell 命令必要性；可随时关闭」；桥缺失固定文案；桥缺失时即使传入 enabled 也 **checked=false / warningVisible=false**。**`warningVisible` 是兼容字段（= enabled），实际警告显隐由 `shellJudgeWarningStep` 决定**。
- `shellJudgeWarningStep(enabled, shown)` → `{shown, show}`：客户 2026-10-18「提示只出现一次」的一次性状态迁移——关闭 ⇒ `{false,false}`（复位「已提示」）；开启且未提示 ⇒ `{true,true}`（显示一次）；开启且已提示（重绘/收消息/切角色/重复推送）⇒ `{true,false}`（不重复）。不持久化：重启后再次开启会再提示一次。
- `shellJudgeToggleResult(previousEnabled, res)` → `{enabled, error}`：`ok:true` 且有布尔 `enabled` 才采用主进程值；失败/坏件保持 `previousEnabled` 并给错误文案。
- `shellJudgeWarningLines()` → §10.2 三段逐字（返回副本）；`SHELL_JUDGE_WARNING_CLOSE_LABEL` =「知道了」；`SHELL_JUDGE_WARNING_AUTO_DISMISS_MS` = 9000（客户 8–10 秒口径；渲染侧唯一计时器）。
- `shellJudgeNoticeText(reasonCode)` → 一般 manual「判断 agent 未能完成判断：<人话原因>。已转你手动确认。」；`row-failed`「判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。」。
- `shellJudgeReasonText(reasonCode)` → manual reasonCode 人话映射（与桌面通道 `judgeManualHumanReason` 同解；未知 ⇒「判断未完成」）。
- `shellJudgeResultView(payload)` → `{verdict, denyOverride, title, label, summary, engineText, operatorText, tierText, at, lines, retryHint, toolCallId, details}`；`manual`/未知裁决 ⇒ `null`（**manual 不产生结果行**）。allow 标题「已替你放行（判断 agent）」；deny 档放行标题「已替你放行（判断 agent · deny 档）」＋徽标「deny 档 · judge 放行」＋「该命令属于硬拒类，判断 agent 判定必要后放行；请复核」；deny 标题「未放行（判断 agent）」＋理由/替代方案/客户说明＋「可关闭「替我审」后重试（改为手动确认），或按替代方案调整命令。」；summary 空 ⇒「无法概括命令；展开查看原文」。
- `shellJudgeEngineLabel(engine)` → Claude/Pi/Codex（未知如实原文，缺省「未报告」）。

**DOM/行为**：
- `index.html` `.composer-bottom`：附件按钮之后、`#composer-scope` 之前新增 §10.1 逐字复选框 `label.composer-auto-approve > input#auto-approve-toggle + span#auto-approve-label`；错误状态位 `#auto-approve-status`（aria-live）。开启警告 `#shell-judge-warning.judge-warning`（默认 `hidden`，琥珀色，非错误红）为**一次性浮层**：内含 `#shell-judge-warning-text`（三段）+ `#shell-judge-warning-close`（「知道了」）；绝对定位于 `.composer` 上方（`bottom:calc(100% + 8px)`），**不占聊天布局、不推动消息区**。shell 卡新增 `#sc-judge-notice.sc-judge-notice`（摘要之后、原因之前，默认 `hidden`）。
- `renderer.js`：`initShellJudge()` 判桥四方法齐备 → 订阅 state/result → `getShellJudgeState()`；复选框 change 只调 `setShellJudgeEnabled`，由 `shellJudgeToggleResult` 落主进程实际值（失败保持原值并显示 `#auto-approve-status`）；`shell:judge-state` 只接受 `version:1 + 布尔 enabled`。警告显隐只经 `syncShellJudgeWarning()` → `shellJudgeWarningStep`（首次开启显示、`setTimeout` 约 9 秒自动收起、「知道了」手动收起；关闭开关复位），**重绘/收消息/切角色/重复推送不重现**。**不写 localStorage/.env/项目文件，不自动开会话/切角色，不触碰已挂起卡。**
- 结果行：`onShellJudgeResult` 按 `roleId` 落该角色 pane，按 `toolCallId` 扫描行表（工具组 `.items[].callId`、生命周期 `activityStages`、operator `toolCallId`、`data.toolCallId`）并插到其后；定位不到 ⇒ 追加流尾（不丢行优先）；`payload.id` 幂等去重；仅在原 pane 处于底部附近时贴底。行类 `.sys.shell-judge-row`，钩子 `.sj-head/.sj-title/.sj-badge/.sj-cmd/.sj-meta/.sj-line/.sj-exit/.sj-details`。**不自动切换当前角色/视图。**
- 样式：`.composer-auto-approve(.is-on/.is-unsupported)`、`.composer-judge-status`、`.judge-warning`（绝对定位浮层 + `.judge-warning-close`）、`.shell-judge-row` 族、`.sc-judge-notice`；开启态与警告一律 `--amber`（不是 `--danger`）；警告宽度 `min(var(--content-max), calc(100% - 32px))` 且继承整页等宽字体。
- 探针（只增）：`window.__ansRenderer.shellJudge = { state(), onState, onResult }`（只读快照 + 直接注入推送/结果；桥缺失时 `state.available=false`）。

**测试证据**：`tool-rows.test.ts` 新增 9 例（开关三态/一次性警告状态机/结果自洽/警告逐字/allow/deny 档/deny/manual/notice）→ 47/47；`renderer.test.ts` 新增/改写 5 例（DOM 与样式钩子（一次性浮层/「知道了」）、开关三态与失败回退、一次性接线（step/计时器/关闭按钮/无重绘重显）、结果行锚定与 deny 徽标、judgeNotice、边界「不自动开会话/不写持久化」）；`uiux-v2.mjs` 独立模式 `ANS_JUDGE_UI_ONLY=1`（受控 IPC 替身＋真实 Electron；断言已按一次性行为更新：首次显示/「知道了」后紧凑标记保持/重复推送与切角色不重现/关闭再开启再显示/约 9 秒自动消失；实跑 **JUDGE_UI_PASS 21**，无真实模型/网络）。全量 `node --test "test/**/*.test.ts"` 2670 计 /2648 过 /19 红 /3 skip：其中 3 红是测试角色 `test/测试/` 的「renderer 全文零 setTimeout」守卫，需其属主豁免本批唯一一次性计时器；其余 16 红为此前基线。`npx tsc --noEmit` 本轮未跑（渲染侧为 JS 经典脚本，无类型面改动）。

## 2026-10-17 W4 治理三权：左树/空态/状态行/决定卡（评审 §8）

任务书：项目管理评审 `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §8（全部）、§九 UI 相关、§十一 W4。

**消费契约（只读；桌面窗口 W3 透传）**：
- `listProject.governanceModel?: "single" | "trio"`。渲染侧只在值恰为 `single`/`trio` 时落 `state.governanceModelKnown=true`；缺失/坏值 ⇒ `known=false`：状态行模型与旧模型提示条一律不显示（**不猜模型**），树仍按角色自身的 `governanceFunction` 分组。
- `RoleView.governanceFunction?: "liaison" | "proposal" | "nomination" | "schedule"`（trio 内置角色，`builtIn:true`）。渲染侧**不硬编码** `liaison`/`rapporteur`/`nominator`/`convener` 任何 id；显示名、权力副标题、内置标识、专属空态全部经 `UiLabels.governanceRoleView/ governanceRoleEmptyState` 由 function 派生。`single` 旧内置 su（无 governanceFunction）逐字走原路径。
- `listProject.governanceFlow?: { flowId?: string; status?: string }`（可选）。`status` 只认 `awaiting-customer` / `in-progress` / `blocked` / `escalated-to-customer`；未知值不显示（不拿 Markdown/角色自述猜状态）。
- `CustomerInputRequest` 的可选治理字段：W0 冻结的 `flowId`/`stepId`/`cardKind`；另有可选展示字段 `paths?: string[]`、`summary?: string`、`artifactSha256?: string`（未给不显示；渲染侧不从 preview/正文抽取或自算）。
- `session:operator-request` payload 可选 `queued: boolean`（直接或在 `request.queued`）：桌面窗口是决定队列权威。`queued:true` ⇒ 卡显示「等待前一个决定」、全部作答控件禁用；同请求重推 `queued:false` ⇒ 解冻。**UI 不自动合并、不自动批准**（到达路径零 `operatorRespond`）。
- S1 建立治理记录：`previewGovernanceRecord(projectRoot, { governanceModel })` / `establishGovernanceRecord(projectRoot, { governanceModel })`。`governanceModelKnown !== true` 时模型单选与建立按钮 disabled 并显示「当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。」；旧窗口忽略第二实参（防御式兼容）。
- 预览可选返回 `governanceModel` / `suggestedGovernanceModel: "trio"` / `detectedGovernanceArtifacts: true`：前者与所选不一致时如实显示「（与所选不同）」；后者只显示「建议选择 trio」提示，**不自动切换**（必须客户点选）。
- 迁移桥 `previewGovernanceMigration(projectRoot)` / `migrateGovernanceModel(projectRoot, previewDigest)`：两者都存在时旧模型提示条按钮启用（「查看差异 / 升级」），否则「升级入口待本版后续」禁用。点击只打开**零写入**非模态预览（复用 `#governance-preview`）；取消/关闭零 IPC 写调用。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `governanceRoleView(fn) → {cn,en,name,power,primaryEntrance,builtinNote,emptyHint} | null`：`联络官 Liaison`「客户沟通 · 不拥有最终批准权」（`primaryEntrance:true`，仅供渲染侧附加职责提示）/`报告员 Rapporteur`「提案权 · 不拥有最终批准权」/`提名官 Nominator`「提名权 · 不拥有最终批准权」/`召集人 Convener`「编排权 · 不拥有最终批准权」；内置标识「内置角色：随应用发布，无角色目录」；未知/缺失 ⇒ null。
- `governanceRoleEmptyState(fn)`：联络官「客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。本版起默认入口为联络官；报告员与历史提案不变。」、报告员「通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。」、提名「通常由流程单提名步骤打开；仅在客户明确要求时直接使用」、编排「通常由已接受提案开启流程；只负责排步骤与派发，不批准方案」。
- `governanceStatusText(model, flowId, status)`：`治理模型：三权 · 四角色|旧模型（su）`、`当前流程：<flowId>`、四态人话，以 ` · ` 连接；未知/缺失项不出现（迁移预览等仍用 `governanceModelText` 的「三权」）。
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

## 2026-10-18 W6-C 四角色左树 / 决定卡镜像 / 排队聚合（四角色评审 §6/§9）

任务书：项目管理 `角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md` §6（镜像契约）、§9（UI 最小面）、§十 AC2/AC8–AC11/AC20。

**消费契约（只读；桌面窗口 W6-B 已透传）**：
- `listProject.primaryRoleId` trio 下为 `liaison`（主入口），`roles` 顺序 `liaison/rapporteur/nominator/convener`；渲染侧仍只按字段与 `governanceFunction` 派生，不硬编码任何治理角色 id。
- `session:operator-request` payload 新增可选 `mirrorRoleId?: string`——**同一请求 id 的第二呈现面**（trio 治理决定卡的主入口 Liaison）。渲染侧**不重复判据**（不读模型、不按 `cardKind` 猜）；缺省 ⇒ 单面零变化。single 不下发该字段，因此不镜像。
- `session:operator-queued` payload `{...request, waitingFor}`（原有通道）：同一项目已有待决定卡时后续请求入队，**不呈现可操作卡**。渲染侧仅在 trio 主入口显示聚合行；single/su 不出现该行。
- `session:operator-expired` 按请求 `id` 命中后冻结**全部**呈现面（不再要求 `payload.roleId` 等于来源角色）。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `governanceRoleView` 增 `liaison`（`联络官 Liaison` / `客户沟通 · 不拥有最终批准权` / `primaryEntrance:true`）；四项内置标识仍为「内置角色：随应用发布，无角色目录」。
- `governanceRoleEmptyState`：Liaison 客户入口说明、Rapporteur 交接说明逐字（见上节）；Nominator/Convener 既有说明不变。
- `governanceStatusText`：三权模型显示「三权 · 四角色」；`governanceModelText` / 迁移预览仍显示「三权」。
- `governanceMirrorSourceLabel(sourceName)` ⇒「来自 <发起角色> 的治理决定 · 客户最终批准」；`governanceQueueAggregateText(n)` ⇒「还有 N 个决定等待前一个决定」（n≤0 ⇒ 空串）；`GOVERNANCE_MIRROR_BADGE`「镜像 · 主入口」。

**DOM/行为**：
- 左树：主入口组＝`primaryRoleId`（trio 下 Liaison）；「治理职能（内置）」组恰为 Rapporteur/Nominator/Convener；每行 `.ti-name` 中文+英文、`.ti-power` 权力副标题、`.ti-builtin` 内置标识。single 旧树输出逐字不变。
- 空态优先级：`hasRoles===false`（S0）→ `reaccept`/`establish`（治理记录 CTA）→ 治理角色专属空态 → 默认。Liaison 的职责说明在 S0/治理记录分支作**附加提示**（`primaryEntrance` 标记，非硬编码 id）；专属空态分支不重复「开始与 <自己> 对话」CTA。`resetPanes`/`refreshEmptyStates` 的 `#chat` 空态按当前主入口取文案（single 输出不变）。
- 镜像：`opRequests[requestId] = { id, roleId, mirrorRoleId, surfaces[], cards{roleId→Element}, ... }`；`openRequestIdsFor` 按 `surfaces` 命中。源面沿用既有锚点/生命周期；镜像面追加所辖 pane 末尾、不参与源面锚点表、**不自动滚动**。镜像卡 `.op-request.is-mirror` + `.op-mirror-badge` + `.op-mirror-source`（来源标签），卡内容/选项与源面相同。
- 作答：唯一入口 `submitOperatorDecision(entry, decision, …)` → `d.operatorRespond({id, decision})`；`entry.submitting` 与终态双闸，成功后 `freezeEntryCards` 冻结 `surfaces` 全部卡（按钮 hidden+disabled、同一 finalNote）；失效同样全冻结。渲染侧只有 **一个** `operatorRespond` 调用点。
- 排队：`onOperatorQueued` 仅在 trio 记录事实；主入口 pane 的 `.op-queue-aggregate` 显示聚合数量，排队请求不物化卡；同一 id 被呈现/失效后从聚合移除。`refreshEntryAwaiting`/`updateQueuedOperatorCard` 遍历 `surfaces`，两侧徽标/chip/队列/启停一致。
- 风格：`styles.css` 仅新增 `.op-request.is-mirror`、`.op-mirror-badge`、`.op-mirror-source`、`.op-queue-aggregate`；900 列与等宽字体未动。

**探针（只增）**：`window.__ansRenderer.onOperatorQueued(payload)`（按 IPC 契约直接注入）。

**测试证据（本批）**：`tool-rows.test.ts` 48/48（四角色文案、四项空态、状态行四角色、镜像来源/聚合文案逐字）；`renderer.test.ts` 100 计/96 过（4 红为既有 CRLF 基线 N-1、data-state、P1-3、G-5），新增 6 例覆盖四角色树/空态优先级/镜像物化/只答一次/排队聚合/两侧一致。真实 Electron：`ANS_MIRROR_UI_ONLY=1` 新段 `mirrorChecks`，`MIRROR_UI_PASS 8`（离线受控 IPC，无模型/网络/凭据）。全量 `node --test "test/**/*.test.ts"`：2735 计/2709 过/23 红/3 skip；红集为他域预期红：旧三权断言（`test/测试/governance-trio-verify/*`、`test/编排/*`）、Windows symlink EPERM、vendor CRLF pin、既有渲染器基线与 `abort running shell` 环境红（详见当轮报告）。

## 2026-10-18 P5 双开关「替我审批 / 替我决策」：控件 / 状态 / 结果行 / 回落（评审 §三/§八/§九/§十二 P5）

任务书：项目管理评审 `2026-10-18_design_judge-governance-cards-review.md` §3.3、§8、§9、§12 P5（P4 桌面窗口 IPC 在本批联调时已落树；本角色按冻结契约消费）。

**消费契约（只读；通道属桌面窗口）**：
- approval 组沿用：`desktop.getShellJudgeState()` / `setShellJudgeEnabled(enabled)` / `onShellJudgeState(cb)` / `onShellJudgeResult(cb)`（`shell:judge-get/set/state/result`）。
- decision 组新增（按名消费）：`desktop.getDecisionJudgeState()` / `setDecisionJudgeEnabled(enabled)` / `onDecisionJudgeState(cb)` / `onOperatorJudgeResult(cb)`（`decision:judge-get/set/state`、结果行 `session:operator-judge`）。
- 状态回包/推送同形 `{version:1, ok?, enabled?, error?, available?}`；**`available:false` 与桥缺失同样处理**：按组禁用并显示「当前版本不支持自动判断，保持手动」，绝不显示假开启态。
- `session:operator-request` payload 新增可选 `judgeNotice?: string`：手动回落提示，渲染侧**原样转义呈现**（不合并进 `reason`、无 HTML 注入口）。
- `OperatorJudgeResultPayload`（`session:operator-judge`，§8.1）：`version:1, id, requestId, anchorKey, toolCallId, roleId, projectRoot?, runtime?, at, group, cardKind, flowId?, engine, model?, reasonCode, reason?, selected?, confirmed?, paths?, pathDecisions?, evidence?, durationMs?, readCalls?, readBytes?`。只覆盖 approve；`manual` 用卡片 `judgeNotice`。
- 分组文案只按载荷里的 `group`（`approval|decision`）显示，渲染侧**不写第二张 `cardKind→group` 映射表**。

**渲染侧导出（`ui-labels.js`，全部纯映射）**：
- `judgeToggleView(group, available, enabled, busy, {singleDisabled})` → `{group, available, enabled, checked, disabled, singleDisabled, label, title, note, warningVisible}`：approval off/on「替我审批」/「替我审批中 · 判断 agent」；decision off/on「替我决策」/「替我决策中 · 判断 agent」；桥缺失固定文案；decision + single ⇒ 禁用、`checked=false`、`note=旧治理模型（single）不支持代决策`。`shellJudgeToggleView` 保留为 approval 别名。
- `judgeWarningStep(enabled, shown)`（`shellJudgeWarningStep` 别名）→ 每组各自的一次性状态迁移（关闭复位、首次显示一次、已提示不重复）。
- `judgeWarningLines(groups)` → `[{text, strong}]`：同一块按开启组列行（approval 段 / decision 段 + 三段共享说明：只读范围/回落、accept-quick 与 single 说明、成本与审计标记）；`shellJudgeWarningLines()` 保留为 approval 仅文字别名。
- `governanceJudgeResultView(payload)` → `{group, groupLabel, cardKind, title, badge, headline, engineText, operatorText, flowText, at, lines, toolCallId, requestId, details}`；标题「judge 代批 · 代审批/代决策」；结论按 `cardKind`：proposal「接受提案（accept）」、appointment「任命 <ids>」、acceptance「验收通过（accept）」、write 族「确认写入 N 个路径（前 3 个 + 等 N 个）」；未知 group/坏件 ⇒ `null`（不编结论）。
- `governanceJudgeNoticeText(group, reasonCode)`：一般 manual「判断 agent 未代批（代审批/代决策）：<人话原因>；已转你手动确认。」；`row-failed`「判断 agent 已完成判断，但结果无法在聊天中显示（…）；已转你手动确认。」。`governanceJudgeReasonText` 为 driver 安全名单的人话映射。
- shell 结果标题按 §10.2 加分组标记：「已替你放行（判断 agent · 代审批）」「已替你放行（判断 agent · 代审批 · deny 档）」「未放行（判断 agent · 代审批）」；deny 出路改「关闭「替我审批」后重试」。

**DOM/行为**：
- `index.html` `.composer-bottom`：两个并排复选框 `#auto-approve-toggle` + `#judge-decision-toggle`（标签「替我审批」「替我决策」），各自状态位 `#auto-approve-status` / `#judge-decision-status`（aria-live；single 说明走 `.is-note` 琥珀）。一次性警告仍是**同一块** `#shell-judge-warning`（两个开关共用；按开启组重建文本）。
- `renderer.js`：`initJudgeSwitches()` 分组判桥（各四方法）→ 各自订阅 state/result → 启动读取；`renderJudgeToggles()` 是唯一重绘点（两开关 + 警告同步）。点击只调对应 set，由 `shellJudgeToggleResult` 落主进程实际值（失败保持原值并显示错误）；`available:false` 通过 state/推送/读取落为不可用。`applyListing` 落 `governanceModel` 后重绘——single 禁用 decision、trio 恢复。
- 结果行：shell `onShellJudgeResult` 保持原锚定；治理 `onOperatorJudgeResult` 按 `roleId` 落 pane、按 `toolCallId` 锚定（复用 `shellJudgeAnchorIndex`），定位不到追加流尾；`payload.id` 幂等；仅在底部附近贴底；行类 `.sys.shell-judge-row.governance-judge-row`，标题/徽标用琥珀表达「judge 代批」，详情折叠含理由/选中项/路径/逐路径结论/证据/耗时/读取量/toolCallId/requestId。
- 手动回落：shell 卡沿用 `#sc-judge-notice`；治理交互卡新增 `.op-judge-notice`（主进程 `judgeNotice` 原文 `esc` 落入；同一请求重推可补/更新；卡仍可作答，UI 不自动批准）。
- 边界：**不自动开会话/切角色、不写 localStorage/.env/项目文件、不触碰已挂起卡**；两开关默认关、互不影响、重载复位（主进程权威）。
- 探针（只增）：`window.__ansRenderer.decisionJudge = { state(), onState, onResult }`（桥缺失时 `available=false`；`state()` 附 `singleDisabled`）。

**测试证据**：`tool-rows.test.ts` 51/51（双开关矩阵、警告按开启组列行、治理结果行结论/路径截断、回落 notice 两类）；`renderer.test.ts` **152 计/148 过**（4 红＝既有 CRLF 基线 N-1/data-state/P1-3/G-5），新增/改写覆盖两复选框 DOM、两组桥与状态机、一次性警告按组、治理结果行接线/幂等/esc、交互卡 `judgeNotice`、single 禁用；真实 Electron 离线 `ANS_JUDGE_UI_ONLY=1` → **JUDGE_UI_PASS 33**（decision 开关读取/设置/推送/失败回退、结果行锚定、写盘代批行、回落卡、single/trio 矩阵），`ANS_TERMINAL_UI_ONLY=1` → **TERMINAL_PASS 22**（含真机卡收起 7 项）。全量三层 glob（最新）：**2972 计/2953 过/16 红/3 skip**；本域仅 4 条既有基线，红集分类见 [changelog](changelog.md) 同日条目。

### 2026-10-18 真机追加：settled/失效回执收起 shell 确认卡

- `appendOneEvent` 在本轮 `settled` 时调用 `closeStaleShellConfirm(env)`：只收起同 `roleId` + `runtime` + `projectRoot` 的当前 `state.shellConfirm`；其它角色/本轮仍在等待的卡不动。
- `session:operator-expired` 按 `id` 命中当前 shell 卡 ⇒ `closeShellConfirm()` + `setHint(payload.reason)`（旧 id 不误收、不回建）。
- `respondShellConfirm` 的 `ok:true`、`expired:true`、通道失败三条路径都收起；过期/失败以 `setHint` 如实说明「未获放行」。删除 shell 卡 `markShellConfirmExpired`/`is-expired` 终态；卡移除后迟到/非法回包在 `if (!cur) return;` 直接返回。
- 测试：`renderer.test.ts` +1 源码守卫；`ANS_TERMINAL_UI_ONLY=1` +7 DOM 断言 → **TERMINAL_PASS 22**；JUDGE 33 不回归。`test/桌面应用/e2e/main.mjs`（桌面窗口属主）仍断言 Esc 后保留 `is-expired` 可见卡，需按新 UX 更新。


## React 渲染器（UI 平台化 Phase 2，2026-10-21）

**入口与构建（Phase 2 历史记录）**：Phase 2 当时源码入口 `app/renderer/src/index.html`；Vite `root=app/renderer`、`base="./"`、`modulePreload.polyfill=false`、`build.target=chrome152`。5B 收尾后源入口为 `app/renderer/index.html`、唯一生产入口 `app/renderer/dist/index.html`（见本页顶部「最终口径」）。生产 CSP 严格：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;`。

**模块与导出**：

| 位置 | 职责 |
| --- | --- |
| `src/main.tsx` | `createRoot(#root)`；CSP 违规诊断（`window.__ansCspViolations`，只读记录，不改行为） |
| `src/App.tsx` | 骨架布局：TitleBar + shadcn resizable Group/Panel + ChatHeader/空态/Composer + Drawer + ConfirmCard；`CSPProvider disableStyleElements` |
| `src/shell/TitleBar.tsx` | 36px 自绘标题栏；`minimizeWindow/toggleMaximize/closeWindow/isMaximized/onMaximizedChanged` 经 `window.desktop`，缺失逐方法禁用并可见标注 |
| `src/shell/Sidebar.tsx` | 品牌/项目 demo/角色树 demo/底部入口；`#sidebar-resizer` 自绘交互（pointer/dblclick/键盘 ±8/Shift±24；`aria-valuenow` px） |
| `src/shell/ChatHeader.tsx` | 会话头（角色/状态/引擎选择器/工作概览/角色资料） |
| `src/shell/EngineSelect.tsx` | 自绘引擎选择器：`role=combobox`/`aria-haspopup=listbox`/`aria-activedescendant` + `role=listbox` + `role=option`；↑↓/Home/End/Enter/Space/Esc/Tab、视口 placement；仅本地演示选择 |
| `src/shell/Composer.tsx` | `#inp-message` + IME 组合保护 + 禁用发送/附件/停止/双开关占位 |
| `src/shell/Drawer.tsx` | Motion 424px 右抽屉；`#right-drawer/#right-body/#drawer-*`；Esc/焦点返回/Tab 循环 |
| `src/shell/ConfirmCard.tsx` | AlertDialog 演示卡；`#shell-confirm/#sc-*`；命令逐字、拒绝默认焦点、Esc/关闭=不放行 |
| `src/stores/ui-store.ts` | zustand 视图状态：`sidebarWidth/sidebarCollapsed/drawerOpen/runtime/selectedRoleId`；localStorage 键 `ans.sidebar.width`/`ans.sidebar.collapsed` |
| `src/stores/confirm-demo-store.ts` | 演示确认卡 `open/payload/lastDecision` |
| `src/lib/platform.ts` | `window.desktop` 安全守卫（`getDesktopBridge/getWindowControlAvailability/callWindowControl/queryMaximized/subscribeMaximized`） |
| `src/test-driver.ts` | `window.__ansRenderer` 骨架子集 + `unimplemented` |
| `src/components/ui/` | shadcn base-nova copy-in 16 组件；台账见该目录 `README.md` |

**对外契约**：

- 消费 `window.desktop` 的**窗口控制子集**（通道名以 `app/preload.cjs` 与桌面窗口 api-spec 为准）：`minimizeWindow`、`toggleMaximize`、`closeWindow`、`isMaximized`、`onMaximizedChanged`。其余通道（会话/历史/确认/判断/设置）未消费，Phase 3/4 按名接入。
- `window.__ansRenderer`（Phase 2 子集）：`state`（getter 快照；`demo:true`）、`selectRole(roleId)`、`selectRuntime(runtime)`、`openConfirmDemo(payload?)`、`sidebar.{collapsed,toggle,set,width,setWidth}`、`drawer.{open,close,toggle,isOpen}`、`confirmDemo.{open,close,state}`、`send.disabled()`、`composer.state()`、`unimplemented`。
- 未实现（列名，不提供假实现）：`loadProject`、`refreshProject`、`refreshLiveRoles`、`openPiPanel`、`loadPiConfig`、`savePiConfigFromForm`、`appendOperatorRequest`、`piKeys`、`governance`、`onRoleState`、`onOperatorExpired`、`onOperatorQueued`、`onShellConfirm`、`shellJudge`、`decisionJudge`、`onRecoveryConfirm`、`rowModelDebug`、`queuedDebug`、`paneDebug`、`replayAnchorDebug`。
- DOM id/class/data/aria 的逐项三态与双端 e2e 执行方式见 [ui-contract-surface](docs/feature/ui-contract-surface.md)。

**已满足的既有 DOM 契约（Phase 2）**：`#titlebar/#win-min/#win-max/#win-close`、`#sidebar-collapse/#sidebar-expand/#sidebar-resizer`、`.app.is-sidebar-collapsed`、`.col-left/.col-mid`、`#role-tree/.tree-item[data-role-id]/.ti-*`、`#chat/.chat-pane/.chat-empty`、`#chat-role/#chat-role-sub/#context-state`、`#right-tabs/#tab-work/#tab-card/#tab-pi/#btn-import`、`#project-name/#project-path/#sidebar-role-count`、`#runtime-select/#runtime-options/#runtime-option-*`、`#composer-capsule/#inp-message/#btn-send/#btn-halt/#btn-attach-image/#composer-scope/#composer-hint/#history-projection-note/#runtime-note`、`#auto-approve-toggle/-label/-status`、`#judge-decision-toggle/-label/-status`、`#attach-row`、`#right-drawer/#right-body/#drawer-title/#drawer-close/#drawer-backdrop`、`#shell-confirm/#sc-title/#sc-close/#sc-command/#sc-summary/#sc-reason/#sc-details/#sc-allow/#sc-deny/#sc-hint`、`data-role-id/data-runtime/data-demo/data-state`、`aria-label/expanded/haspopup/modal/orientation/valuenow/valuemin/valuemax/current/live`。

**Phase 2b 修正（2026-10-21）**：`<html class="dark">` 使深色变体生效（`#sc-allow` 边界 `--input`）；Button/Input/Textarea/Checkbox/Switch/菜单项焦点环统一 2px solid `--ring` + 3px offset；Button primary hover `--success-hover` / active `--primary-active`、默认字号 13、disabled 0.45；Checkbox 选中 `--warning`；引擎选择器改为自绘 `EngineSelect`（旧 combobox/listbox/option 契约）；960 窄档隐藏「· 演示」后缀；ScrollArea thumb/图标描边/禁用发送中性底按 §8.3 打磨。

**已知偏离（Phase 2b 历史，均已由 3A–5B 关闭）**：当时 `#btn-send` 禁用、附件/停止/双开关占位；聊天行/虚拟窗口/`rowModelDebug` 未实现；确认卡为演示；抽屉内容占位；构建路径为当时的 src 子目录产物。5B 后上述项全部实现并迁移，生产入口唯一 `dist/index.html`。详见变更记录与 5B 证据。

**验证（Phase 2b 最终）**：`typecheck:renderer` 0 错；`build:renderer` 通过；入口引用资产 gzip（level 9）**188,883B**（JS 176,510 + CSS 11,984 + HTML 389）；Chrome 两档截图（默认/引擎菜单/确认卡放行 hover+焦点）；真实 Electron 44.7.0 `file://` 冒烟 **49 项断言全 true**、零 console/CSP/did-fail-load。证据：`docs/change/2026-10-21-phase2b-evidence/`。


## React 渲染器聊天流（Phase 3A，2026-10-21）

**模块**：

| 位置 | 职责 |
| --- | --- |
| `src/chat/row-model.ts` | 虚拟窗口纯模型：`VIRT_MIN_ROWS=150`、`VIRT_BUFFER=30`、prefix/spacer、`preferTail/preferIndex`、`debug()` |
| `src/chat/replay.ts` | 回放 `skip/append/full`、`rowSignature`、`eventKey`、`classifyLiveDuplicate` |
| `src/chat/status.ts` | `deriveRoleStatus`（等待确认 > 工作中 > 错误 > 空闲/已停止/已恢复/未开启）与徽标 |
| `src/chat/events.ts` | `normalizeEnvelopes`/`envelopeMatches`（project/runtime/role）、`describeEvent`、`activityFromEvent`/`toolStatus`、注入分类、历史行映射 |
| `src/chat/markdown.ts` | npm markdown-it **15.0.3** 受控封装（html:false、链接白名单、图片原文、表格、`.md-pre`/`.md-lang`、唯一 `esc`）；`window.ANSMarkdown` |
| `src/chat/role-view.ts` | 角色显示名/副标题/主入口/治理职能/工作角色分组 |
| `src/chat/chat-store.ts` | listing/会话/历史/事件/角色状态投影；每角色 RowModel；pending history；operator 最小卡/锚点；本地用户气泡 |
| `src/chat/ipc.ts` | 订阅 `session:event(s)`/`session:role-state`/`session:history`/`project:changed`/`session:operator-request|expired|queued`；`app:recovery-state`/`app:recovery-ready` |
| `src/chat/ChatStream.tsx`/`VirtualPane.tsx`/`ChatRow.tsx` | 中栏容器、虚拟 pane、行渲染 |
| `src/shell/Sidebar.tsx` | 真实 listing/角色树/分组/状态/roving tabindex/导入切换 |
| `src/shell/Composer.tsx` | 非受控 textarea、Enter/Shift+Enter/IME、`sendSession`、`pickImage` 最小附件 |

**消费的 preload 通道**：`pickProject`、`listProject`、`openSession`、`getSessionHistory`、`listLiveSessionViews`、`sendSession`、`pickImage`、`onSessionEvent`、`onRoleState`、`onSessionHistory`、`onProjectChanged`、`onOperatorRequest`、`onOperatorExpired`、`onOperatorQueued`、`operatorRespond`、`getRecoveryState`、`recoveryReady`（全部按 `app/preload.cjs` 实际方法名；缺方法时界面如实降级）。

**驱动**：新增 `loadProject/refreshProject/refreshLiveRoles/selectRole/selectRuntime/rowModelDebug/paneDebug/onRoleState/onOperatorExpired/onOperatorQueued/appendOperatorRequest/queuedDebug`；`state` 为真实快照（`demo:false`）。未实现：`openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys/governance/onShellConfirm/shellJudge/decisionJudge/onRecoveryConfirm/replayAnchorDebug`。

**DOM/行为**：`#role-tree` 分组 `.tree-group`/`.tree-item[data-role-id]` + `.ti-status.st-*`；`#chat[data-state]`（busy→run、error→err、否则 idle）；`.chat-pane[data-role-id]` + `.virt-spacer` + `.chat-row`；user/assistant/activities/tool-lifecycle/tool-call-record/injected/handback/operator/sys-denied/turn-terminal/system 行；`.sys-loading`/`.sys-replay-divider`/`.queue-row`/`.tool-current`；`#attach-row .attach-chip`；`#btn-start-primary`。

**验证（3A）**：typecheck/build；CSP 0 内联/0 unsafe；gzip 246,608B；`ime-enter` 新入口 24/24；`bench-storm` 新入口 BENCH_DONE=1；`test/桌面UI` 15/15；旧基线 679/679；Electron 冒烟 16/16。证据：`docs/change/2026-10-21-phase3a-evidence/`。uiux-v2 目标切换已接但全量等价未达（默认段首个失败），不宣称通过。

## Phase 3B 渲染侧契约（2026-10-21）

### 新增纯逻辑模块（node 同源加载，无 DOM/存储依赖）

| 模块 | 关键导出 | 用途 |
| --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | `shellConfirmTitle`、`suApprovalTierLabel`、`governanceRoleDisplayNameById`、`judgeToggleView`、`judgeWarningStep`、`judgeWarningLines`、`shellJudgeToggleResult`、`judgeBridgeAvailable`、`shellJudgeResultView`、`governanceJudgeResultView`、`recoveryActionView`、`recoveryTimeText` | 双开关/一次性警告/结果行/卡标题与档位的单一文案与映射来源（对齐旧 `ui-labels.js`） |
| `app/renderer/src/chat/confirm-logic.ts` | `receiveCard`、`startResponding`、`shellResponseOutcome`、`recoveryResponseOutcome`、`staleShellOnSettled`、`expiryHitsCard`、`payloadMatchesView`、`queueItemViews`、`withdrawOutcome`、`withdrawExceptionOutcome`、`clientImageProblem`、`attachmentTitle` | 卡状态机/失效收起、队列位次与撤回、附件快速筛 —— 纯函数，`test/桌面UI/{judge,confirm-logic}.test.ts` 覆盖 |

### store 与驱动面

- `stores/confirm-store.ts`：`shellConfirm/recoveryConfirm`（`{id,payload,busy,expiredReason}`）、`judge.approval/decision`（`available/enabled/busy/error/promptShown`）、`warning`；动作 `receiveShell/respondShell/expireShell/closeStaleShell/dismissShell`、`receiveRecovery/respondRecovery/dismissRecovery`、`initJudgeSwitches/setJudgeEnabled/acknowledgeWarning`。主进程是唯一权威；卡回包恰 `allow:true` 才放行/执行。
- `window.__ansRenderer` 3B 增补：`state.shellConfirm/recoveryConfirm`（真实卡记录）、`onShellConfirm/shellConfirmRespond`、`onRecoveryConfirm/recoveryConfirmRespond`、`shellJudge.state()/onResult()`、`decisionJudge.state()/onResult()`；`unimplemented` 仅余 `openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys/governance/replayAnchorDebug`。

### DOM 契约（3B 保持/新增）

- 保持：`#shell-confirm/#sc-title/#sc-close/#sc-command/#sc-summary/#sc-reason/#sc-details/#sc-allow/#sc-deny/#sc-hint/#sc-judge-notice`；`#recovery-confirm/#rc-title/#rc-action/#rc-role/#rc-note/#rc-reason/#rc-evidence/#rc-details/#rc-allow/#rc-deny/#rc-close/#rc-hint`；`#auto-approve-toggle/-label/-status`、`#judge-decision-toggle/-label/-status`、`#shell-judge-warning/-text/-close`、`#attach-row .attach-chip`、`.attach-rm`、`#btn-halt`、`.sys-queue`、`.queue-row`。
- 常量：`SHELL_JUDGE_WARNING_AUTO_DISMISS_MS=9000`（一次性警告自动收起；全应用唯一业务计时器）。
- 判断结果行：行包裹元素同时带 `.chat-row .sys.shell-judge-row`（治理行另加 `.governance-judge-row`），并带 `data-tool-call-id`；`manual` 不产生行。`#chat` 直接子元素查询与 `rowModelDebug` 均可用。
- 3B 评审修正：SU 档位摘要 `.sc-overlay.is-su-approval .sc-summary`（600）；`#sc-hint .sc-su-warning`（`--warning`）；`#sc-details > summary .disclosure-chevron`；`.capsule.is-dropping`；`.queue-withdraw` 28px/11px/`--input`；`.attach-chip` 8px、`.attach-rm` 4px、X 12/1.5。
- 失效形态：恢复卡 overlay/card 带 `.is-expired`，`rc-allow/rc-deny` 禁用、`rc-close` 可关、`rc-hint` 如实文案；shell 卡失效即卸载（`hidden`），不保留全禁用卡。
- 附件缩略图 `<img src="data:…;base64,…">`（不使用 `blob:`，遵守生产 CSP `img-src 'self' data:`）。
- `#composer-hint` 只由真实提示驱动（无提示时为空串；旧 e2e 依赖）。

### 消费的 preload 通道（只读；定义属桌面窗口）

`onShellConfirm`/`shellConfirmRespond`、`onRecoveryConfirm`/`recoveryConfirmRespond`、`getShellJudgeState`/`setShellJudgeEnabled`/`onShellJudgeState`/`onShellJudgeResult`、`getDecisionJudgeState`/`setDecisionJudgeEnabled`/`onDecisionJudgeState`/`onOperatorJudgeResult`、`abortSession`、`withdrawQueued`、`pickImage`/`attachImage`、`sendSession`（含 `clientMessageId`）。通道名与载荷以 `app/preload.cjs` 与桌面窗口 api-spec 为准。

### 证据

`docs/change/2026-10-21-phase3b-evidence/`：Electron 离线 IPC 冒烟 45/45 + 18 张截图；uiux-v2 JUDGE/G2/TERMINAL/TOOLFOLD 全绿；新纯逻辑 33/33；旧基线 679/679；IME 24/24；延迟挂载 10/10；bench 8 轮全阈值；gzip 240,133B；C1 Δ=16px。

## Phase 4A 渲染侧驱动与 DOM 契约增量（2026-10-21）

- 驱动：`selectRuntime`（真实切换、Promise<boolean>、无项目/非法/同引擎/切换中=false）；`openPiPanel(tab?)`、`loadPiConfig()`、`savePiConfigFromForm()`、`piKeys`（getter）；`state.rightTab` 扩为 `card|work|pi|document|null`；`drawer.open/close` 走抽屉 store（关闭还原触发焦点）；`driver-extensions/*.ts` 合并进驱动（4B）。
- DOM：`#runtime-config-notice/#runtime-config-message/#runtime-config-settings`；`#pi-panel`（常驻挂载，`hidden` 由 tab 驱动）、`.pi-engine-tabs/.pi-engine-tab[data-engine]`、`#pi-panel-path`、`.pi-field/.pi-field-label/.pi-input/.pi-select/.pi-secret-tag/.pi-secret-toggle-*`、`.pi-range-wrap/.pi-range-out/.pi-range-note`、`.slider/.slider-control/.slider-track/.slider-indicator/.slider-thumb`（thumb 内隐藏 input 带 slider 语义与 aria 三值/valuetext）、`.pi-advanced/.pi-advanced-body/.pi-advanced-hint`、`#pi-save/#pi-status`、`.pi-save-bar`；`details[data-section=card|boundary|changes|docs]`、`.card-text`、`.role-document-entry`、`.document-list/.document-list-meta/.document-source-note/[data-doc-id]/[data-doc-action=back-list|back-role|refresh|retry]/#document-read-status/#document-read-text`；`#right-queue-body`、`.q-item/.q-pos/.q-src/.q-time/.q-text/.q-actions/.q-toggle/.q-withdraw/.q-feedback/.q-full`、`.pending-requests/.pending-locate[data-request-id]`、`.recent-reports/.recent-report`、`.work-heading`；`.ti-count`（左树当前+排队）。
- 无新增 DOM 例外；大工具组延迟挂载例外 `DEFER_TOOL_ROWS_WHEN_CLOSED=40` 仍唯一。

### PM §十三 增量（2026-10-21）

- 左树：`.ti-status` 只表达状态（无「N 待办」）；`.ti-count` 唯一可见数字（当前+排队），`title/aria-label` 为「当前工作 X 项，排队 Y 项」。
- operator 卡：`closed` 时 `.op-actions` 与 `op-confirm/op-deny/op-submit/op-cancel` 带 `hidden`（保留 `disabled`/`finalNote`/`aria`/卡片容器）；属 PM §十三 唯一冻结写集例外。
- judge 跨引擎重放属 4B；C2 同因既有红待 4B/5。

### UIUX M1–M6 增量（2026-10-21）

- 队列子视图：同一 424 抽屉；`.queue-subview`、`.queue-back`、唯一 `#right-queue-body`；标题 `<角色> · 队列`，返回来源视图；工作概览/角色资料仅预览当前 + 前 3 条排队，`groups.total>3` 显示 `.queue-view-all`；Esc 先返回来源；`state.rightTab` 仍为 `work|card`（不新增值）。
- 撤回：成功聊天流 `.sys-call`「已撤回排队消息：〈摘要〉」；失败/异常 `.q-feedback` + 同名 system 行。
- 设置 Tabs：`#pi-engine-tab-<engine>`、roving tabindex、`aria-controls="pi-engine-panel"`、`#pi-engine-panel[role=tabpanel]`；←/→/Home/End。
- 保存条：`.pi-status` 两行完整状态；完整逐键/完整 application 在 `title`（`savedStatusTitle`）。
- 角色头：`.role-status` 只表达状态（`statusBadge(status,0)`），数量只在 `.ti-count`/队列预览。
- 证据：960 工作/资料/设置三面焦点/Esc/inert 断言；200%（Electron zoom 2）设置/资料无溢出与保存条完整状态。

## Phase 4B 渲染侧驱动与 DOM 契约增量（2026-10-21）

- 驱动：`replayAnchorDebug(roleId)` → `[{anchorKey,requestIndex,conclusionIndex,rowsAtReplay}]`（无表 `[]`）；`governance` → `{state(),open(mode?),selectModel(model),confirm(),cancel()}`（接真实 governance-store）；`state.governancePreview:{open,mode,loading,busy,previewDigest,canConfirm,nextStep}`；`queuedDebug()` 保持插入序；judge 结果行跨引擎缓存/重放（同 id 幂等）。扩展经 `driver-extensions/*.ts`（`extend`）合并，4A 驱动方法保持。
- DOM：`#governance-status`（`[data-governance-state]`）、`#governance-preview`（class 精确 `governance-preview`；`[data-governance-reaccept]`/`[data-governance-cancel]`/`[data-governance-close]`/`[data-governance-establish]`/`[data-governance-migrate]`、`data-mode`）、`#governance-migration`；治理卡 `.op-gov-badge/.op-meta/.op-mirror-badge/.op-mirror-source/.op-queued/.op-preview/.op-preview-body/.is-mirror[data-surface-role-id]`；聚合 `.op-queue-aggregate`；`#op-chip/.op-chip-text`；报告 `.msg-handback .report-*/.persistence-state/.persistence-message/.persistence-retry/.persistence-error`；交付 `.msg-delivery > .persistence-state`、`.delivery-batch-facts`、`.delivery-report`、`.safe-input-copy`；折叠 `.task-request/.reply-original/.task-request-body/.original-flags`；菜单 `.engine-option-main/.engine-option-status[data-menu-status]`。
- 状态/焦点：治理预览非模态、标题聚焦、Esc 回触发、无陷阱；聚合行不可聚焦；镜像不抢焦点；报告重试 pending 保留同按钮（disabled）；`#op-chip` 点击先 close 抽屉再滚到原卡并聚焦；`.op-request[inert] .op-actions{visibility:hidden}`（抽屉覆盖）。
- 无新增 DOM 例外；既有 `DEFER_TOOL_ROWS_WHEN_CLOSED=40` 与失效 operator 动作 `hidden` 保持唯一。C2 检查重锚为「收起 + 原因可见」。
