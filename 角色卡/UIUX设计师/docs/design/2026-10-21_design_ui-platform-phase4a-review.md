---
id: ui-platform-phase4a-review
type: design
title: Phase 4A 实现设计对齐评审（引擎/设置/资料/工作概览/队列）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 2
related: [ui-platform-phase4a-design, ui-platform-phase4a-scope, ui-contract-surface, ui-components, ui-platform-phase3b-review, ui-platform-phase4a-prototype]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对 Phase 4A 真实引擎切换、三引擎设置、角色资料/文档、工作概览与队列抽屉完成只读设计对齐评审；结论 needs-work，列 6 项 4B 前必须（队列子视图/撤回回执/Tabs 键盘/保存状态截断/资料状态计数/960 焦点与 200% 证据），其余可随 4B/5
  - date: "2026-10-21"
    kind: reviewed
    summary: 4A M1–M6 修正复核通过（设计对齐 pass）：队列子视图/成功失败回执/Tabs 键盘/保存条两行完整/资料状态-only/960 焦点 Esc inert 与 200% 均实测；99/99 冒烟、28 张截图；剩余仅 4B/5 打磨
---

# Phase 4A 实现设计对齐评审

**评审对象**：桌面UI [Phase 4A 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)（status: implemented-and-verified，2026-10-21）与 [2026-10-21-phase4a-evidence](../../../桌面UI/docs/change/2026-10-21-phase4a-evidence/)（`phase4a-smoke` 70/70、20 张 1360/960 截图、bench/gates/uiux-v2/adjacent）；实现 `shell/{SettingsPanel,ProfilePanel,WorkOverview,QueuePanel,DocumentView,Drawer,ChatHeader,EngineSelect,Sidebar}.tsx`、`components/ui/slider.tsx`、`stores/{settings,drawer}-store.ts`、`chat/{runtime-config,runtime-view,document-view,work-view}.ts`、`shell/phase4a.css`。

**设计依据**：[Phase 4A 设计附录（revision 3）](2026-10-21_design_ui-platform-phase4a-design.md)、[Nova × 深色石墨规范](2026-10-21_design_ui-platform-nova.md)、[契约面](../../../桌面UI/docs/feature/ui-contract-surface.md)、[组件台账](../../../桌面UI/docs/feature/ui-components.md)、旧基线 `app/renderer/{renderer.js,styles.css}`。

**评审性质**：只读实现、截图、冒烟/门禁证据与旧基线；未改 `app/` 代码、未重跑测试、未调用模型/网络、未提交。本文是设计对齐意见，不是产品验收、测试结论或实施授权。

## 一、结论

> **4A M1–M6 复核（2026-10-21）**：下述 6 项已由桌面UI 修正并复核通过（设计对齐 **pass**）；99/99 冒烟、28 张截图，覆盖队列子视图、撤回成功/失败、Tabs 键盘、保存条 1360/960/200%、资料状态-only、960 焦点/Esc/inert 与 Slider。最新实测见文末「4A M1–M6 复核」；前文 needs-work 原文保留为当轮记录。

> **needs-work（需修正后复核）。** 4A 的功能接线和工程证据整体扎实：70/70 冒烟、20 张双档截图、零 console/CSP、typecheck/build/旧基线 679/679/新单测 67/67/IME 24/24/懒挂载 10/10、bench 达标；引擎真实切换、每引擎视图/草稿、三引擎 metadata 设置、机密掩码、Slider、文档只读、工作概览/角标、左树单计数与失效 operator 卡均通过核对。仍有 **6 项 4B 前必须**：
>
> 1. **队列不是带标题/返回的独立子视图**：全量队列内联在「工作概览」，见 `1360/960-queue.png`；「查看更多」仅 >50，设计为 >3；与设计 §5.1/§4.2 不符（或需 PM 书面接受内联并改契约）。
> 2. **撤回回执不完整**：成功删除 feedback、无 system 行；失败只有内联、无 system 行；与设计 §5.2/旧基线不符。
> 3. **设置 Tabs 键盘不完整**：只有 Tab/Enter，无 ←/→/Home/End、无 roving tabindex/`aria-controls`；与设计 §6.4 不符。
> 4. **固定保存条截断已保存状态**：`.pi-status` 单行 ellipsis；截图 `1360-settings-saved.png` 看不到「必填配置已齐备/下一次输入应用」；与设计 §2.7 不符。
> 5. **角色资料角色头仍显示「等待你确认 · 2 待办」**：`statusBadge(status, queue.length)`；与 PM §十三「状态只表达状态」及设计 §3.2 的单计数原则不符。
> 6. **960 焦点/Esc/inert 与 200% 证据缺口**：现有 960 证据覆盖截图/无横向溢出，但 70 项检查没有 960 档的焦点/Esc/inert 独立断言，也没有 200% 文字证据；PM §12.3 #8 要求补测（200% 不可测时须记录并由 PM 接受）。

除上述外，其余可按 4B/5 处理；没有发现功能越界、假成功、第二套库或热路径动画。

## 二、已通过

### 2.1 引擎选择器真实状态

- 70/70 冒烟中 `DEFAULT_RUNTIME_IS_CLAUDE_WITHOUT_RECOVERY`、`RECOVERY_EXPLICIT_RUNTIME_WINS`、`RECOVERY_OPEN_USES_EXPLICIT_RUNTIME` 通过；默认 Claude、已保存/恢复显式 runtime 优先。
- `SWITCH_*`、`FOREIGN_RUNTIME_*`、`CROSS_ENGINE_DRAFT_*`、`SWITCHING_STATE_ARIA_BUSY_AND_SINGLE_SUBMIT`、`SWITCHING_IGNORES_REPEAT_MENU` 通过：切换保存旧视图、安装目标视图、按三元身份开会话、后台不停止、跨引擎草稿隔离、迟到旧结果不覆盖。
- `EngineSelect.tsx` 保持 `role=combobox`/`listbox`/`option`、`aria-activedescendant`、↑↓/Home/End/Enter/Space/Esc/Tab、右对齐 placement；切换中 `aria-busy`、菜单关闭、重复提交 no-op；失败保留新视图由调用方报错，不自动回退。
- **4B 边界**：菜单项未渲染「已配置/缺配置/配置未知/检查中」文字（变更记录 §5.4）；4A 以当前引擎缺配条/设置面板状态承担。设计 §1.4 的菜单状态摘要留 4B，需在 4B 补齐；不阻塞 4A 当前引擎可见性。

### 2.2 三引擎设置

- `PI_SETTINGS_METADATA_DRIVEN_FIELDS`、`CODEX_FIELDS_SECRET_FALLBACK_AND_HELP`、`SETTINGS_TABS_CHANGE_VIEW_NOT_SESSION_ENGINE` 通过：字段/必填/秘密/choices/control/help 来自主进程 metadata；Pi 3 必填 + 推理 select + 高级两 Slider；Codex/Claude 字段齐全；Tabs 只切配置不切会话。
- 机密：`SECRET_REVEAL_ONLY_LOCAL_INPUT`、`SECRET_HIDE_RESTORES_PASSWORD` 通过；值恒空、显示只作用于本次输入；`SAVE_SUCCESS_CLEARS_SECRET_AND_REPORTS_APPLICATION` 清空。
- Slider：`PI_SLIDER_ACCESSIBLE_VALUE_AND_KEYBOARD`、`SLIDER_KEYBOARD_UPDATES_HIDDEN_CANONICAL_VALUE`、`SLIDER_HOME_SETS_DEFAULT_TIER`、`SLIDER_END_SETS_LAST_TIER` 通过；7 档、`aria-valuemin/max/now`、`aria-valuetext`、←→/Home/End、hidden 规范值；`RANGE_VALUE_OUTSIDE_CHOICES_FALLS_BACK_TO_TEXT` 通过，非预设值回退文本 + amber。
- 保存：`SAVE_FAILURE_KEEPS_DRAFT_AND_HONEST_ERROR`、`SAVE_DOES_NOT_REOPEN_SESSION`、`LATE_OLD_SAVE_CANNOT_OVERWRITE_CURRENT_STATUS`、`SETTINGS_MISSING_ALERT_AND_STATUS` 通过；loading/saved/missing/error/晚到守卫/固定 64px 保存条均在代码与截图中可见。
- 1360/960 设置截图无横向溢出；`960-settings.png` 保存条与字段可读。Slider 的静态截图 `1360-settings-advanced-slider.png` 只滚到「上下文窗口」标签，未见 thumb/output，视觉证据不足（见 §四）。

### 2.3 角色资料/文档

- `PROFILE_HEADER_AND_FOUR_SECTIONS`、`PROFILE_LONG_SECTIONS_SCROLL_INDEPENDENTLY` 通过：角色头、角色卡/边界条目/变更记录/文档四节、节内独立滚动（card 1814/docs 1889/changes 2309 的夹具高度）。
- 文档：`DOCUMENT_LIST_OPAQUE_REFS_ONLY`、`DOCUMENT_READ_MARKDOWN_SAFE_NO_SCRIPT_OR_IMAGE`、`DOCUMENT_EXTERNAL_LINK_USES_OPEN_EXTERNAL`、`DOCUMENT_INTERNAL_LINK_OPENS_LISTED_REF`、`DOCUMENT_TOO_LARGE_EXPLICIT_ERROR`、`DOCUMENT_IO_ERROR_RETRYABLE`、`DOCUMENT_RETRY_SUCCEEDS`、`DOCUMENT_BACK_LIST/Role_RESTORES_*_FOCUS`、`LATE_DOCUMENT_READ_INVALIDATED_BY_CLOSE`、`ROLE_SWITCH_INVALIDATES_DOCUMENT_VIEW` 全通过；显式选择、opaque 引用、只读 Markdown/文本、错误码、重试、焦点返回、迟到失效符合设计。
- 空态/焦点：`PROFILE` 无角色空态与文档空态在组件中保留；`Drawer.tsx` 常驻挂载 + `aria-modal`/背景 inert/Esc/焦点环/关闭回触发；`DocumentView` Esc 在阅读态先回列表。

### 2.4 工作概览

- `WORK_OVERVIEW_ONE_QUEUE_BODY_NO_ROLE_DOCUMENTS`、`WORK_OVERVIEW_PENDING_CURRENT_QUEUE`、`WORK_BADGE_AND_ROLE_BADGE_COUNTS` 通过：`#right-queue-body` 唯一；待处理/当前/排队/最近回交均真实快照；工作角标 1、角色角标 4（当前 1+排队 3）。
- `PENDING_LOCATE_CLOSES_DRAWER_AND_FOCUSES_CARD` 通过（已挂载卡）；`RECENT_HANDBACKS_DEDUP_BY_REAL_REPORT_IDENTITY`、`RECENT_HANDBACKS_SECOND_REPORT_AND_DECLARATION` 通过；最近回交只来自聊天流真实 handback 行，按报告身份去重，不显示完整报告/持久化假状态。
- 截图 `1360-work.png`/`960-work.png` 的待处理、当前工作、排队、最近回交层级清楚；`报告声明`/`系统按终态记录` 未冒充独立验收。

### 2.5 队列功能（除结构与回执外）

- `QUEUE_POSITIONS_SOURCES_AND_WITHDRAW_ELIGIBILITY` 通过：位次/来源/时间/摘要/全文；只有客户消息可撤回（fixture 1 条可撤回）。
- `QUEUE_FULL_TOGGLES_IN_PLACE`、`WITHDRAW_PENDING_DISABLES_SAME_ACTION`、`WITHDRAW_FAILURE_INLINE_AND_RETAINED`、`WITHDRAW_THROW_INLINE_AND_FOCUS_RETAINED`、`WITHDRAW_SUCCESS_USES_REAL_SNAPSHOT` 通过（行为层）；失败保留条目/焦点，成功靠真实快照更新。
- `WIDTH_960_NO_HORIZONTAL_OVERFLOW_WORK` 等 960 无横向溢出检查通过；`960-queue.png` 单列可读，撤回按钮 28px 可点。

### 2.6 左树单计数与失效 operator 卡

- `SIDEBAR_SINGLE_COUNT_BADGE_ONLY_AND_QUEUE_IN_TITLE` 通过：`.ti-status` 只显示「等待你确认」，`.ti-count` 4 唯一数字，`title`/`aria-label` = 「当前工作 1 项，排队 3 项」；`1360/960-sidebar-badge.png` 可见。
- `EXPIRED_OPERATOR_CARD_HIDES_ALL_ACTIONS_KEEPS_REASON` 与 `1360/960-operator-expired.png` 通过：`.op-actions`/confirm/deny/submit/cancel hidden，`disabled`/`finalNote`/`aria`/卡片容器保留；无死按钮，原因可见。与 PM §13.1 旧 `freezeOperatorCard` 同义，仅此一处。

### 2.7 纪律

- `phase4a.css` 及新增 TSX 扫描零裸色值、零手绘 SVG、零第二套 UI/图标/动画/状态库；颜色/圆角/间距引用 `index.css` 令牌。
- 新增唯一组件 `components/ui/slider.tsx`（Base UI，零新增依赖），组件台账登记了 Slider 与五个 4A 项目组件（来源/用途/状态矩阵/升级责任人）。
- 动效仅 `ans-engine-spin`（0.9s，切换中/reduced-motion 静止）与 Drawer Motion（160/120ms）；聊天热路径无新增动画；`toast/transition-all` 未见。
- 焦点环：设置字段/按钮/Tab/slider/队列/资料 summary 均为 2px `--ring` + 3px offset；`aria-live` 状态在设置/撤回/文档中保留。

## 三、4B 前必须

### M1 队列子视图结构（设计 §5.1/§4.2）

**事实**：`WorkOverview.tsx` 把 `#right-queue-body` 放在工作概览，内部依次渲染「待处理/当前工作/排队」，队列只是其中一个 section；`QueuePanel` 为内联列表（`WorkOverview.tsx:78-135`、`QueuePanel.tsx:33-109`）。截图 `1360-queue.png`、`960-queue.png` 的抽屉标题均为「A · 工作概览」，没有「A · 队列」标题/「返回工作概览」；角色资料「查看全部队列」也 `openTab("work")`（`ProfilePanel.tsx:334-341`）。`QUEUE_RENDER_LIMIT=50`，只有 >50 才出现「查看更多队列」（`WorkOverview.tsx:27,68-71,125-133`），设计 §4.2 为 >3。

**影响**：设计承诺的是带标题/返回、当前/排队全量的队列子视图；当前是工作概览内的长 section，队列深度 >3 时没有「查看全部」入口，用户只能滚动工作概览。`#right-queue-body` 唯一、队列功能本身通过，但结构契约未落地。

**要求（4B 前）**：实现设计 §5.1 的队列子视图（标题 `<角色> · 队列`、返回来源视图、当前/排队全量），或由 PM/设计书面接受「内联在工作概览」并同步修改设计 §5/契约面；无论哪种，保留 `#right-queue-body` 唯一、不新增第四会话头图标/第二抽屉，960 可读。若维持内联，至少把 >3 的「查看全部队列」入口补上并把标题/层级写清楚；不能既称子视图又无标题/返回。

### M2 撤回回执（设计 §5.2）

**事实**：`stores/drawer-store.ts:540-554` 在 `res.ok === true` 时删除 feedback 并 return，未写「已撤回排队消息」也未 append system 行；失败只 `writeFeedback("撤回无效：…")`，没有 `appendSystemRow`。`QueuePanel.tsx:90-94` 只渲染 feedback，无 system 行。70 项冒烟 `WITHDRAW_SUCCESS_USES_REAL_SNAPSHOT` 的 detail 明确 `feedback:null`，`WITHDRAW_FAILURE_INLINE_AND_RETAINED` 只验证内联失败。

**影响**：成功撤回后用户只看到条目消失/位次前移，没有设计要求的就地回执；失败只有抽屉内联、没有设计/旧基线的 system 行。与旧 `renderer.js` 的 `sysRow("已撤回排队消息：…")`/失败 system 行不一致，用户无法确认成功或追溯失败。

**要求（4B 前）**：成功在队列行就地显示「已撤回排队消息：〈摘要〉」或写 system 行；失败在保留内联「撤回无效：…」的同时写 system 行；不做乐观移除，位次仍由真实快照刷新；保持撤回中禁用/焦点归还（现有通过）。

### M3 设置 Tabs 键盘（设计 §6.4）

**事实**：`SettingsPanel.tsx:359-383` 用普通 `<button role="tab">`，只绑定 `onClick`，没有 `onKeyDown`；三个 tab 都可 Tab 聚焦，无 roving `tabIndex`、无 `aria-controls`/`tabpanel`。组件台账 §四也写成「Tabs（按钮 Tab/Enter）」，低于设计 §6.4 的「←/→/Home/End」。

**影响**：ARIA Tabs 键盘模式不完整；键盘用户必须逐个 Tab 穿过三个 tab，不能按方向键切换，读屏无法从 tab 关联到面板。

**要求（4B 前）**：Tabs 加 ←/→/Home/End（循环/首尾）、roving tabindex、`aria-controls` 与 `role=tabpanel`/`aria-labelledby`；Tab 仅离开 tablist；保持当前会话引擎点与选中态可读；补键盘断言。

### M4 固定保存条状态截断（设计 §2.7）

**事实**：`phase4a.css:407-416` `.pi-status` 为 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`；截图 `1360-settings-saved.png` 底部只显示「已保存到 .env（改动键：ANTHROPIC_AUTH_TOK…」，看不到「必填配置已齐备」「当前轮次继续使用原配置；结束后下一次输入应用新配置」；`title`/`aria-live` 有全文但不能替代视觉可读。

**影响**：保存成功的最关键信息（是否齐备、何时应用）被截断；用户可能误以为配置已连接/当前生效。PM §12.3 #5 还要求 64px 在 1360/960/200% 可用。

**要求（4B 前）**：在 64px 保存条内允许 2 行/换行或压缩为「已保存 · 齐备 · 下一次输入应用」的完整短句；不得省略应用时点；在 1360/960 截图复核，200% 可测时补测；`aria-live` 保留全文。

### M5 角色资料状态计数（设计 §3.2 / PM §十三）

**事实**：`ProfilePanel.tsx:197` 调用 `statusBadge(status, queue.length)`，`status.ts:93-106` 会把 `· N 待办` 拼进标签；`960-profile.png` 角色头显示「等待你确认 · 2 待办」，而同屏左树 `.ti-count` 为 3、状态为「等待你确认」。PM §13.4 的标题是左树双徽标，但其「状态标签只表达状态」原则与设计 §3.2 的角色头 Badge（状态/文字+图标）同向；当前角色头把待办数塞进状态，形成第二个语义不同的数字。

**影响**：同一个面板出现两个数字（状态里的待办 2、角色的当前+排队 3），语义不同且无说明；与紧邻左树的单计数规则冲突，用户难以判断哪个是「队列深度」。

**要求（4B 前）**：ProfilePanel 改用 `statusBadge(status, 0)`（状态只表达等待/工作中/空闲/错误），待办/队列数量只放在角色资料角标、待办列表标题/QueuePanel「查看全部队列（N）」；若产品要保留角色头待办数，需作为独立、带标签的计数并回 PM，不与状态混写。若 PM 明确「仅左树适用」，也请把角色头计数改成语义明确的独立数字，避免与状态混写。

### M6 960 焦点/Esc/inert 与 200% 证据（PM §12.3 #8）

**事实**：`phase4a-smoke/report.json` 70 项包含 `WIDTH_960_WORK/SETTINGS/PROFILE_NO_OVERFLOW` 与 960 截图；`SETTINGS_CLOSE_RETURNS_TO_NOTICE_INVOKER` 在 1360 执行并包含 inert detail，但没有 960 档的焦点/Esc/inert 独立 check；全目录与 smoke 脚本未见 `200%`/zoom/deviceScaleFactor 证据。

**影响**：PM §12.3 #8 要求 960 真实 Electron 复测焦点/Esc/inert、200% 可行时验证；当前能证明 960 布局无横溢，不能证明模态焦点/键盘/200% 可读。该缺口不否定现有 960 截图，但 4A 门证据不完整。

**要求（4B 前）**：补 960 档真实 Electron 断言/截图：打开设置/资料/工作概览后的焦点进入、Tab 环、Esc 关闭回触发、背景 inert；200% 若环境可测则补，若不可测记录原因并由 PM 接受。不要用 1360 结果代替 960。

## 四、可随 4B/5

- **菜单项配置状态文字**：设计 §1.4 的「已配置/缺配置/配置未知/检查中」未在 `EngineSelect` 菜单渲染；变更记录 §5.4 为避免破坏 SELECTOR「每次提交恰一次读取」而留 4B。4A 当前引擎缺配条/设置面板状态可见；4B 沿用 PM §12.3 #4 的按需读取/缓存策略补齐。不是 4A 新缺陷，但 4B 必须兑现设计。
- **设置当前引擎点语义**：`.pi-engine-dot` 恒为 `--primary`，实际表示「当前会话引擎」（台账 §三也如此写），设计 §2.3 写的是「状态点」；`1360-settings-missing.png` 中 Claude 缺配时仍显示绿点，容易被误读为已配置。建议状态文本保留为主、点改为状态色/形状或明确「当前会话」图例；可随 4B/5。
- **当前工作行缺少「进行中」文字**：`QueuePanel` 对 `running` 不渲染 `q-pos`（`QueuePanel.tsx:50`），`1360-work.png` 当前工作行只有「客户消息/时间/摘要」，依赖绿色卡与 section 标题；设计 §4.2 要求行内「进行中」。建议在行首补 11px「进行中」或等价文字，不只靠颜色。
- **队列时间格式**：`work-view.ts:91-95` 使用 `toLocaleTimeString()` 默认格式，截图显示 `18:01:00`（含秒）；旧基线/原型为 HH:MM。建议固定 `hour/minute` 两位 24 小时，减少噪声。
- **角色资料待办预览无「定位」**：`ProfilePanel.tsx:321-329` 只列类型/标题，设计 §3.2 要求待办列表带「定位」；工作概览已有定位。可随 4B/5 补同一动作/焦点协议。
- **抽屉关闭按钮用文字 `×`**：`Drawer.tsx:199-210` 未用 Lucide X；其余图标均为 Lucide。属图标纪律小项，换 `X` 12/1.5 即可，建议 4B/5。
- **设置关闭后未保存字段草稿**：`Drawer` 常驻挂载 `SettingsPanel`，关闭抽屉不会重置 `drafts`；设计 §2.3 写「关闭抽屉丢弃未保存草稿（旧行为）」。当前更保守但契约不一致；建议在 4B/5 明确保留并更新设计，或关闭时清空。
- **Slider 视觉证据不足**：`1360-settings-advanced-slider.png` 只显示「上下文窗口」标签，未见 thumb/output；`PI_SLIDER_*` 冒烟断言通过，但视觉证据需补一张展开到滑块的 1360/960 截图。
- **虚拟行定位、judge 跨引擎重放、完整报告/persistence、长队列虚拟化、C2 重锚**：均按 PM §13/§12.3 和变更记录归 4B/5；4A 不宣称完整恢复。
- **Profile 角色头副标题**：`960-profile.png` 显示「3 条边界条目」而非设计示例的权力/职责；这是 `roleSubtitle` 在 fixture 无卡文本时的 fallback，真实角色应验证首行权力/职责；若真实角色也回退，4B/5 调整 fallback 文案。

## 五、逐项对照

| 评审重点 | 结论 | 说明 |
| --- | --- | --- |
| 1. 引擎选择器真实状态/菜单摘要与 4B | 基本通过 | 默认/显式/切换/缺配/未知/检查中/切换中/失败不回退均通过；菜单状态文字留 4B。 |
| 2. 设置面板/字段/Slider/保存/960 | **needs-work** | metadata、机密、Slider、保存矩阵、960 无横溢通过；Tabs 键盘、保存状态截断、当前引擎点语义、200% 证据需处理。 |
| 3. 角色资料/文档/滚动/焦点/空态 | 基本通过 | 四节、独立滚动、文档只读/错误/重试/焦点/迟到失效通过；角色头状态计数需改为状态-only（M5），待办定位可 4B/5。 |
| 4. 工作概览/定位/角标/最近回交 | 基本通过 | 待处理/当前/排队/最近回交真实、角标拆分、最近回交无假完整；已挂载定位通过，虚拟定位归 4B；当前工作缺「进行中」/时间秒为打磨项。 |
| 5. 队列抽屉/唯一 body/撤回/960 | **needs-work** | `#right-queue-body` 唯一、位次/来源/全文/仅客户撤回/失败焦点通过；子视图结构与成功/失败回执需修正（M1/M2）。 |
| 6. 左树单计数/状态/队列深度 | 通过 | `.ti-count` 唯一可见数字，`statusBadge(status,0)`，title/aria 含当前+排队；截图 1360/960 通过。 |
| 7. 失效 operator 卡 | 通过 | 动作 hidden、原因可见、容器/aria 保留、无死按钮；截图 1360/960 通过。 |
| 8. 纪律/焦点/图标/动效/零裸色/新组件 | 基本通过 | 零裸色、零第二套库、Slider 台账、热路径零动画；关闭按钮 `×` 与 Tabs 键盘为缺口。 |

上述为当轮 needs-work 判断；M1–M6 的修正复核结论为 **pass**，见 §八。

## 六、证据与限制

- **冒烟**：`phase4a-smoke/report.json` checks 70、failures 0、console `[]`、csp `[]`；`1360/960` 共 20 张截图；`bench/summary.json`、`gates/summary.txt` 记录 typecheck/build/CSP/gzip 263,098B、旧 679/679、新 67/67、IME 24/24、lazy 10/10、C1 Δ=16。
- **uiux-v2**：SELECTOR 26/26、CONFIG 20/20、ROLE_FOCUS 9/9、SEND_FACTS 8/8；RUNTIME 13/14（唯一 C2 同因既有红）；默认段/VISUAL 到 4B/5 边界；QUEUE_VIEW 归 4B 未运行。
- **截图核对**：`1360-settings-missing/saved/error/advanced-slider/codex/claude`、`960-settings`、`1360/960-work`、`1360/960-queue`、`1360/960-profile`、`1360-document-read`、`1360/960-operator-expired`、`1360/960-sidebar-badge`、`1360-switching`、`1360-engine-claude`。
- **限制**：本文只做设计对齐，不是测试/产品验收；未重跑 70 项、未重跑 bench、未运行真实模型/网络/.env；200% 与 960 焦点/Esc/inert 未独立验证；Slider 视觉截图未显示 thumb/output；`1360-profile.png` 处于滚动位置，角色头以 `960-profile.png` 为准。

## 七、同步与边界

- 本记录仅写 `角色卡/UIUX设计师/`；同步 memo/changelog/feature-map。
- 未改 `app/`、`src/`、`test/`、`package.json`、其他角色或历史设计文档；未提交。
- 待桌面UI 修正 M1–M6 后复核；其余 4B/5 项不阻塞 4A 门。

## 八、4A M1–M6 复核（2026-10-21）

**结论：pass（设计对齐通过）。** 桌面UI 已按 M1–M6 修正；本角色只读新 [phase4a-smoke 证据](../../../桌面UI/docs/change/2026-10-21-phase4a-evidence/phase4a-smoke/)（99/99、28 张截图、零 console/CSP）、实现源码与截图。下列各项均实测通过；剩余仅为 4B/5 打磨，不阻塞 4A。

| 项 | 复核结果 | 证据 |
| --- | --- | --- |
| M1 队列子视图 | **pass**：标题「A · 队列」、返回「工作概览」/「角色资料」、Esc 先返回来源、焦点回「查看全部队列」、`#right-queue-body` 唯一（body=1）、工作概览 >3 显示「查看全部队列（4）」、960 单列可读 | `QUEUE_SUBVIEW_TITLE_BACK_UNIQUE_BODY`（title/back/body/items 4）、`QUEUE_SUBVIEW_ESC/BACK_RETURNS_WORK_AND_FOCUS`、`WORK_OVERVIEW_QUEUE_PREVIEW_AND_VIEW_ALL_ENTRY`、`WIDTH_960_QUEUE_SUBVIEW_READABLE`、`QUEUE_SUBVIEW_FROM_PROFILE_*`；`1360/960-queue.png` |
| M2 撤回回执 | **pass**：成功写 system 行「已撤回排队消息：客户排队消息」；失败/异常就地「撤回无效/失败：…」并写 system 行；不乐观移除；撤回中禁用/焦点归还保留 | `WITHDRAW_SUCCESS_USES_REAL_SNAPSHOT`（chat 文本含成功句）、`WITHDRAW_FAILURE_INLINE_AND_RETAINED`、`WITHDRAW_THROW_INLINE_AND_FOCUS_RETAINED`（detail 含 chat 两者）、`WITHDRAW_PENDING_DISABLES_SAME_ACTION`；`1360-withdraw-success/failure.png` |
| M3 Tabs 键盘 | **pass**：`onKeyDown` 实现 ←/→ 循环、Home/End；roving `tabIndex`；`aria-controls="pi-engine-panel"` + `role=tabpanel`/`aria-labelledby`；焦点环保留 | `SETTINGS_TABS_ARROW_RIGHT_ROVING_AND_ARIA`、`SETTINGS_TABS_END_SELECTS_LAST`、`SETTINGS_TABS_HOME_SELECTS_FIRST`、`SETTINGS_TABS_ARROW_LEFT_WRAPS_TO_LAST`；`1360-tabs-keyboard.png` |
| M4 保存条 | **pass**：64px 两行完整状态「已保存到 .env（改动键 4 个）。必填配置已齐备。当前轮次继续使用原配置；下一次输入应用。」；`scrollHeight=clientHeight=28`；title 全文逐键/完整 application；1360/960/200% 不截断 | `SAVE_STATUS_VISUALLY_COMPLETE_IN_64PX_BAR`、`WIDTH_960_SAVE_STATUS_NOT_CLIPPED`、`ZOOM_200_SETTINGS_READABLE_AND_NO_OVERFLOW`；`1360-settings-saved.png`、`960-settings.png`、`1360-200-settings.png` |
| M5 资料状态-only | **pass**：`statusBadge(status, 0)`；角色头「等待你确认」无「· N 待办」；计数只在角标/队列 | `PROFILE_STATUS_ONLY_NO_PENDING_COUNT`（值「等待你确认」）；`960-profile.png`、`1360-200-profile.png` |
| M6 960/200% | **pass**：960 焦点进入抽屉/背景 inert/Tab 留抽屉/关闭回焦点、设置/资料/队列 Esc 返回、无横溢；200% 设置/资料无横溢且保存条完整；Slider 视觉 thumb/output 在 960 可见 | `RUNTIME_960_*`（WORK/PROFILE/SETTINGS FOCUS+INERT、TAB、ESC、CLOSE）、`WIDTH_960_*`、`ZOOM_200_SETTINGS/PROFILE`、`WIDTH_960_SLIDER_VISUAL_IN_DRAWER`、`SLIDER_VISUAL_THUMB_AND_OUTPUT_IN_VIEW`；`960-*-focus.png`、`1360-200-*.png`、`960-settings-slider.png` |

**复核后剩余（均不阻塞 4A）**

- **菜单项配置状态文字**仍留 4B（设计 §1.4；变更记录 §5.4）；4A 当前引擎缺配条/设置面板可见。
- **设置当前引擎点语义**：`.pi-engine-dot` 仍是 current-engine 标记（绿色），非状态色；缺配时需靠状态文本/Alert 判读。建议 4B/5 区分「当前会话」与「配置状态」。
- **当前工作行「进行中」文字**仍缺；队列时间仍含秒（`18:01:00`）；建议 4B/5 补标签并固定 HH:MM。
- **角色资料待办预览无「定位」**、**Drawer 关闭按钮仍是文字 `×`**、**关闭设置抽屉仍保留未保存字段草稿**（设计 §2.3 说丢弃；当前更保守）——均 4B/5 打磨/契约确认。
- **保存条可见状态字号 10.5**（设计 §2.2 为 11.5）；两行可读已达成，字号差异登记为小偏差，若 PM 要求按 11.5 可再调 CSS。
- **长队列虚拟化、虚拟行 locator、judge 跨引擎重放、完整报告/persistence、C2 重锚**按 4B/5；4A 不宣称完整恢复。
- **200% 证据**已补设置/资料；若环境允许，4B 可再加 960 队列 200% 截图，但当前 PM 条件已满足（200% 设置/资料不截断/无横溢）。

**边界**：本轮只读新证据/实现并更新角色文档；未改 app/、未重跑测试、未提交。M1–M6 复核通过后，4A 门可按 PM 口径关闭（其余 4B/5 不阻塞）。
