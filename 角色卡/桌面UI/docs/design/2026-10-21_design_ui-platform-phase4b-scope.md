---
id: ui-platform-phase4b-scope
type: design
title: Phase 4B 范围与写集清单（QUEUE_VIEW/治理/镜像/回执/锚点/收尾）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: proposed
related: [ui-platform-round-review, ui-platform-phase4a-scope, ui-platform-phase4a-design, ui-contract-surface, check-ledger-phase3a, ui-platform-phase4a-review]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM §十四 4B 授权与派发前置 1，产出 4B 范围/写集清单（功能面、冻结文件解冻、扩展点、驱动/契约、测试计划、热路径、风险与待复核）；仅规划，未写实现代码
---

# Phase 4B 范围与写集清单

**依据**：PM [4A 门关闭与 4B 授权 §十四](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（§14.2 queueView tab 切换、§14.3 授权范围、§14.4 派发前置、§14.5 约束）；4A [范围与写集](2026-10-21_design_ui-platform-phase4a-scope.md)、[实施变更](../../change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)与[契约面](../feature/ui-contract-surface.md)；测试台账 §七；旧渲染器治理三权/镜像/报告回执/operator 聚合/replayAnchor 段；UIUX [4A 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4a-review.md) 的 4B/5 清单。

**状态：仅规划。** 本文不写实现代码、不改 `app/`，是 4B 派发前的范围与写集输入，待 PM 复核。**不包含 Phase 5**：`main.mjs`、全量双端逐 check、生产入口切换、打包/发布/安装包、真实模型/网络/`.env` 验收。

## 一、4B 功能面逐项

### 1.1 QUEUE_VIEW / operator 排队聚合

**行为**

- 仅 **trio**（`listing.governanceModel === "trio"`）出现；`session:operator-queued` 的 `{id, roleId, mirrorRoleId?, waitingFor?, projectRoot?, runtime?}` 进入 `queuedOperator`，**不物化可操作卡**。
- 主入口角色（`primaryRoleId`）的 pane 内唯一聚合行 `.op-queue-aggregate`（`.sys.sys-queue`），文案「还有 N 个决定等待前一个决定」；N = 当前项目内唯一 id 数；同一项目只一行、原位更新；排队清空即移除；single 不出现。
- 聚合行是**运行期事实、不是视图状态**：切引擎/恢复不得从 runtime view 复活旧排队（4A 缓存当前会重放 `operatorQueued`，4B 必须排除）；切回后主进程重推才重建；旧项目信封丢弃。
- 请求被正常呈现（`operator-request`）或失效（`operator-expired`）后，同 id 从 `queuedOperator` 删除并刷新聚合；`queuedDebug()` 返回当前 id 列表。
- 旧实现：`renderer.js` `queuedRequests`/`onOperatorQueued`/`queuedCountForProject`/`renderQueueAggregate`（L3305、L3668–3708）、`selectRuntime` 清空（L1307–1318）、项目切换清空（L1444）、`queuedDebug`（L6797–6801）。

**验收面**：`ANS_QUEUE_VIEW_UI_ONLY` 四项：`queued baseline shows two`、`runtime view restore does not revive old queued requests or aggregate`、`main-process repush rebuilds aggregate with new count only`、`clearing queue removes aggregate`。

### 1.2 治理三权卡 / 镜像 / 排队提示

**行为**

- 治理卡元信息只取请求载荷的可选字段（`cardKind`/`flowId`/`stepId` 等），缺省不显示、不猜；卡头徽标「治理决定 · 客户最终批准」等（`ui-labels` 逐字）；`.op-gov-badge`/`.op-meta`。
- **镜像**：请求带 `mirrorRoleId`（且≠来源角色）时，同一 `request id` 在来源角色 pane 与镜像角色 pane 各呈现一张卡；镜像卡 `.is-mirror` + `.op-mirror-badge`「镜像 · 主入口」+ `.op-mirror-source`（「同一请求 · 来源 <role>」逐字）。同一 id 只建一个请求条目；任一侧作答/失效/冻结**同时**作用于全部呈现面；只发一次 `operatorRespond`；重复提交由共享 submitting/终态挡住；镜像面后补/重推幂等补挂，不建第二请求。
- 排队中的请求（`queued:true` 或 `session:operator-queued`）不显示可操作按钮，注记「等待前一个决定」；被呈现时移除聚合、两镜像面同时出现可操作卡。
- 可见性指针：请求的所有呈现面都不是当前查看角色时，在当前 pane 放只读提示（旧 `sysRow` 同义）。
- 旧实现：`renderer.js` `onOperatorRequest`/`materializeOperatorCard`/`submitOperatorDecision`/`freezeEntryCards`（L3580–3760）、`ui-labels.js` governanceCardMetaView/MIRROR/queue 文案。

**验收面**：`ANS_MIRROR_UI_ONLY` 8 项（同 id 镜像/只答一次/冻结两面/无操作排队卡/聚合）；默认段 4B 的待办/预览/决定项（见 §4.3）。

### 1.3 治理记录建立 / 重新接受 / 迁移预览

**行为**

- `#governance-status`（既有 `.session-notice` 位置，非模态）：显示治理模型状态（`旧模型（su）`/`三权 · N 角色`，N 取真实角色数或按 PM/测试重锚）、当前流程/状态（接口给才显示）；按 `governanceRecord.state` 与 `hasRoles` 显示动作：
  - `establish`：建立治理记录（single→trio 选择默认 single、trio 须客户显式点选；预览「将写入什么」；`canConfirm` 决定可用性）。
  - `reaccept`（pin-mismatch）：状态行「治理记录与盘上边界不一致」「共 N 条 pin」+「检查并重新接受」；预览列出 changed（path、pin 前 8 位→actual 前 8 位/不存在）、writePaths、pinPaths、pin 数、警告与 blockers，`canConfirm===false` 时确认禁用；确认只回传 `{projectRoot, confirm:true, previewDigest}`。
  - `invalid`：`.ans` 存在但不可用，原因原文，**不自动覆盖**。
  - `present`：仅模型/流程状态行。
- 迁移预览（单模型→三权）：旧模型提示条「本项目使用旧治理模型（su）。可升级为三权模型。」+「查看差异 / 升级」；桥齐备才可打开零写入预览；本版主进程 `not-available` 时如实「升级入口待本版后续」，不假升级。
- `#governance-preview` 非模态、唯一、位于提示条之后；取消不调用写通道；每次打开重新预览；成功/失败按 `phase`（guard/write）/`status`/`message` 如实；写成功后不自行改模型，等 `project:changed`→`listProject` 刷新。
- 空态：主入口（Liaison）空态说明客户入口、不自带 CTA；无治理记录/pin-mismatch/invalid 的空态复用 `ChatStream` 空态宿主；`governance-next-step` 只显示状态行，不打开/切换会话。
- 数据来源：`listing.governanceModel/governanceRecord`（chat-store 已保存）+ preload `previewGovernanceRecord/establishGovernanceRecord/previewGovernanceReacceptance/reacceptGovernancePins/previewGovernanceMigration/migrateGovernanceModel`；渲染侧不读文件、不构造路径、不复制判定。
- 旧实现：`renderer.js` L500–1230（status/preview/establish/reaccept/migrate）、`ui-labels.js` L657–810、L919–1075。

**验收面**：`ANS_GOVERNANCE_REACCEPT_UI_ONLY` 5 项（pin-mismatch 状态/空态/预览/取消/确认/成功）；MIRROR 前三项（四角色树/状态行/Liaison 空态）；主进程 `not-available` 与 establish 的 4B 冒烟项。

### 1.4 报告全文 / persistence / delivery 回执

**行为**

- handback 报告卡：分层 `report-top`/`report-body`（来源/声明/引擎/任务关联）、摘要预览 + 「查看完整报告摘要与证据」（`report-complete`）、证据列表与净化/截断/省略标记、来源角色文档按钮（显式选择、opaque ID）；「报告声明」不等于独立验收；只有 `submitted-report`/`terminal-fallback` 与真实报告身份；错误版本如实。
- `报告存储`/`persistence-state`：`unsupported/disabled/failed/saved/expired/unknown-live` 等按 `getSessionPersistence`/`getReportSaveState`/`retryReportSave` 如实；失败可重试（`retryAvailable`），成功同卡更新、不重开会话；`report-persistence-updated` 事件按 scope/report 精确更新同一卡；迟到/过期不覆盖新状态。
- delivery 目标卡：`msg-delivery` + `delivery-report`（每个报告）、`delivery-batch-facts`（接收历史/目标输入/目标轮次结果）、`safe-input-copy`（安全显示副本 flags：净化/截断/未记录完整模型输入）、`persistence-state` 保存历史失败/重试；`delivery-history-updated` 同 attempt 更新；`inputProvenance` 报告来源按钮打开来源角色文档，不切会话/引擎；`delivery-note`/`delivery-receipt`/`delivery-boundary` 系统行归类。
- task-request / reply-original：只有真实结构化报告 + 精确 `turnId` + settled 才折叠原任务/原回复；报告声明本身不折叠；迟到精确 turn 回复按 settled 规则；普通聊天不生成报告/不折叠。
- 去重：同 `reportId` + 来源身份只呈现一次；不同 delivery attempt 各自可见；历史快照重复不重复卡片；cold/reverse 时间按线序、不猜。
- 旧实现：`renderer.js` L2401–2605（reportBody/sourceDocumentButton/reportCards/deliveryCards/persistence）、L2425–2455（task/reply folding）、`updateWorkReports`（L5897）；契约行 #12。

**验收面**：`ANS_VISUAL_V2_UI_ONLY` 报告卡/交付/源文档/焦点/几何子集（4A 已通过 3 项）；`ANS_COMPLETE_FLOW_UI_ONLY` 的 C/B/P3 报告、持久化、交付、来源文档项；`ANS_DELIVERY_NOTE_UI_ONLY`；4B 冒烟新增项。

### 1.5 operator 镜像

并入 §1.2（同 id 两侧、只答一次、排队提示）；不新增第二个请求/独立窗口/第四入口。

### 1.6 `replayAnchorDebug`

- 每角色锚点表：`{anchorKey, requestIndex, conclusionIndex, rowsAtReplay}`；`anchorKey` 来自 operator payload（缺省 null），卡在（重）物化时按 `anchorKey` 与回放行精确关联；请求/结论行索引在完整回放后正确；未带 anchor 走首物化位/兜底落尾，不丢卡。
- 驱动：`window.__ansRenderer.replayAnchorDebug(roleId)` 返回数组；供 DUP/默认段检查「legacy decided full replay reuses original card…」「denied conclusion anchor…」。
- 旧实现：`renderer.js` `paneAnchors`/`replayAnchorDebug`（L6823–6831）、operatorAnchorIndex（L3780 一带）。

### 1.7 single 警告刷新

- 项目治理模型从 trio→single（或 single→trio）后，「替我决策」可用性变化：single 立即禁用并显示既有文案；**一次性警告块**移除 decision 组，不残留「替我决策中」旧警告行；再回 trio 恢复可用性与一次性提示语义（不重复未确认的提示）。
- 旧 3B 观察项（2026-10-21 变更记录）：切 single 后旧警告行残留 → 4B 修。
- 实现落点：`confirm-store` 的 warning 同步需可由治理模型变化触发（或订阅 `governanceModel`）；不改主进程权威。

### 1.8 judge 结果行跨引擎历史重放

- 4A 已记录缺口：`onShellJudgeResult/onOperatorJudgeResult` 由 `confirm-store.initJudgeSwitches` 直接订阅，切回旧引擎不重放历史 judge 行；4B 在切引擎时把 judge 结果行按引擎缓存并按到达序重放（同 id 幂等），不重复、不跨引擎覆盖当前视图。
- 落点：`chat/ipc.ts`/`runtime-view` 记录 payload + `confirm-store` 提供订阅回调 hook（或扩展点），不改变主进程判定。
- 新 check：`JUDGE_RESULT_REPLAY_PER_RUNTIME`、`JUDGE_RESULT_NOT_LEAK_ACROSS_RUNTIME`。

### 1.9 菜单配置状态文字

- 引擎菜单每项显示状态：`已配置`/`缺配置（缺项键名在缺配条/设置）`/`配置未知`/`检查中…`；当前项勾选+前景色，状态不靠颜色单独传意。
- **按需读取/缓存**：不在导入/恢复时预取三引擎；项目切换/引擎切换/保存成功后读取当前引擎；菜单打开时只读取**未缓存/未知**的引擎（可三引擎并行一次），已缓存不重复读。必须保持 SELECTOR 既有断言：每次切换/提交恰一次读取、当前项 Enter 只关闭不重读、打开菜单不产生重复读取。实现为 `settings-store` 的 per-engine summaries + 版本/项目守卫，`EngineSelect` 只读展示。
- 旧设计：UIUX 4A 设计 §1.2/§1.4；4A 变更记录 §5.4 留 4B。

### 1.10 queueView tab 切换清空（PM §14.2）

- 任何顶层 tab 切换（`tab-work`/`tab-card`/`tab-pi`/document）都清空 `queueView`，显示目标 tab 基础视图；抽屉保持打开、标题/焦点正确；Esc/返回仍按来源语义。
- 现状：`ChatHeader.toggleCard` 直接 `setState({tab:"card"})` 未清 `queueView`；`openSettingsDrawer` 也未清。4B 统一经 `drawer-store` 顶层切换动作清空。
- 新 check：`QUEUE_VIEW_TAB_SWITCH_TO_CARD_CLEARS_SUBVIEW`、`QUEUE_VIEW_TAB_SWITCH_TO_WORK_CLEARS_SUBVIEW`。

### 1.11 C2 重锚 / 退役

- `expired old shell shown disabled in its own runtime` 与 2026-10-18 批准的「失效卡收起 + 原因可见」语义冲突，属同因既有红；4B/Phase 5 前由测试重锚为「卡收起 + hint 原因可见/可追溯」或退役，不保留冲突期望。桌面UI 记录结果，不修改测试断言（测试角色属主）。

## 二、写集清单

### 2.1 新增（`app/renderer/src/`）

| 文件 | 用途 |
| --- | --- |
| `chat/governance-view.ts` | 治理状态/动作/预览/空态/迁移文案映射（纯逻辑，无 DOM；逐字沿用 ui-labels，不复制判定） |
| `chat/operator-view.ts` | 治理卡元信息/镜像面/排队聚合文案/去重/身份（纯逻辑） |
| `chat/report-view.ts` | 报告/persistence/delivery 状态→文案、报告身份/去重、安全显示 flags（纯逻辑） |
| `chat/anchor-view.ts` | 回放锚点键/索引/去重纯逻辑（无 DOM） |
| `stores/governance-store.ts` | 预览打开/模式/模型选择/loading/busy/版本守卫/挂起项目守卫 |
| `stores/report-store.ts` | 报告持久化/交付回执缓存（scope/report/attempt 键、晚到丢弃、能力探测） |
| `shell/GovernancePanel.tsx` | `#governance-status` + `#governance-preview` 非模态面板（建立/reaccept/migrate） |
| `shell/ReportCard.tsx`、`shell/DeliveryCard.tsx` | 报告全文/证据/来源/持久化/交付回执卡（供 ChatRow 组合） |
| `shell/phase4b.css` | 4B 治理/报告/交付/镜像/聚合样式；**不编辑 `phase4a.css`/`shell.css`** |
| `chat/extensions/reports.ts` | 经 4A glob 注册：`onReportPersistenceUpdated`/`onDeliveryHistoryUpdated` → report-store；不编辑 4A 注册器 |
| `chat/extensions/governance.ts` | 经 4A glob 注册：`onGovernanceNextStep` 状态行；可选 judge/queue 事件扩展 |
| `driver-extensions/replay-anchor.ts` | `replayAnchorDebug(roleId)` 合并进 `window.__ansRenderer` |
| `driver-extensions/governance.ts` | `governance` 驱动（预览/确认/状态；供测试） |
| `types/platform-4b.d.ts` | `declare module "@/lib/platform"` 扩展 4B 只读方法（不改 4A `platform.ts` 类型结构，若必须改则按 §2.2） |
| `test/桌面UI/{governance-view,operator-view,report-view,anchor-view}.test.ts` | 纯逻辑单测（`.ts` 无 JSX） |
| `test/桌面UI/phase4b-electron-smoke.mjs` + `phase4b-smoke-preload.cjs` | 4B 真实 Electron 离线冒烟 + 1360/960/200% 截图 |

### 2.2 修改（含 4A 冻结文件解冻）

| 文件 | 解冻/修改理由与范围（仅 4B 项） |
| --- | --- |
| `chat/chat-store.ts`（**解冻**） | operator 共享条目/镜像面（同 id 两侧、共享 submitting/终态、pending 按 surfaces 计数）；`queuedOperator` 删除/清空与聚合行同步；`report/delivery` 行按身份更新；anchor 表；project/runtime 守卫。**不做 4B 之外的 store 重构** |
| `chat/ChatRow.tsx`（**解冻**） | 治理卡 meta/badge/preview/queued/mirror；queue-aggregate 行；报告全文/证据/来源/持久化/交付/安全显示；task-request/reply-original 折叠。**不重写聊天行/工具组/虚拟窗口语义** |
| `chat/ChatStream.tsx`（**解冻**） | 治理空态（主入口/无记录/mismatch/invalid）与必要 pane 级呈现（若聚合采用行模型则只改空态）；不改变滚动/虚拟窗口/贴底 |
| `stores/confirm-store.ts`（**解冻**） | judge 结果订阅 hook（跨引擎缓存/重放）、single↔trio 警告刷新、decision 可用性同步；保持主进程权威与 fail-closed |
| `chat/events.ts`（**解冻，最小**） | delivery 输入 provenance/text-projection、report 字段/身份所需 descriptor；不改变既有行分类语义（除新增 kind） |
| `chat/ipc.ts`（4A 文件） | judge/报告持久化/交付/治理下一步路由与每引擎缓存；切换时清空 `queuedOperator` 且**不重放**；扩展注册保持 4A 机制 |
| `chat/runtime-view.ts`（4A 文件） | 视图快照**排除 operatorQueued**（运行期事实）；judge 结果按引擎缓存/重放；报告/交付缓存按引用与 scope |
| `shell/ChatHeader.tsx`（4A 文件） | 挂载 `GovernancePanel`（状态/预览）；顶层 tab 切换清 `queueView`；single 警告刷新触发 |
| `shell/EngineSelect.tsx`（4A 文件） | 菜单项配置状态文字（读 settings-store 摘要，不新增读取） |
| `stores/drawer-store.ts` / `shell/Drawer.tsx`（4A 文件） | 顶层 tab 切换统一清 `queueView`；治理/报告子视图（若有）焦点/返回；不改 424/焦点/inert 基线 |
| `stores/settings-store.ts`（4A 文件） | per-engine 配置摘要缓存/状态（menu 展示），保持既有版本/读取次数契约 |
| `chat/work-view.ts` / `shell/WorkOverview.tsx` / `shell/ProfilePanel.tsx`（4A 文件） | pending 按 surfaces 计数；最近回交「查看来源角色文档」/报告身份；资料待办定位（可选，4B 顺带） |
| `lib/platform.ts`（4A 文件） | 只读声明 4B preload 方法（治理预览/确认/迁移、persistence/receipt、事件订阅；见 §2.3）；或用 `types/platform-4b.d.ts` 扩展，优先不改 |
| `chat/row-model.ts` / `chat/replay.ts`（按需） | anchor 索引/报告身份去重所需的最小 API；不改变行高/虚拟窗口/回放语义 |

**明确不解冻**：`App.tsx`（治理状态/预览由 ChatHeader 片段承载，无需全局宿主）、`shell/shell.css`（4B 样式新文件）、`Sidebar.tsx`、`main.tsx`、现有 `components/ui/**`、`package.json`/`package-lock.json`、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器、根配置、其他角色。若实施中发现 App 必须改动，停手回 PM。

### 2.3 依赖的既有 preload 通道（只读消费，定义属桌面窗口）

- 治理：`previewGovernanceRecord/establishGovernanceRecord/previewGovernanceReacceptance/reacceptGovernancePins/previewGovernanceMigration/migrateGovernanceModel/onGovernanceNextStep`。
- 报告/交付：`getSessionPersistence/retryReportSave/getReportSaveState/retryDeliveryHistorySave/getDeliveryReceipt/onReportPersistenceUpdated/onDeliveryHistoryUpdated`。
- operator：`onOperatorRequest/onOperatorQueued/onOperatorExpired/operatorRespond`（4A 已消费）。
- 全部按名消费、缺失禁用/如实，不构造路径/不读 fs。

### 2.4 扩展点用法

- `chat/extensions/reports.ts`、`governance.ts`：导出 `install(bridge) => cleanup`，4A `ipc.ts` 的 `import.meta.glob("./extensions/*.ts",{eager:true})` 自动注册；4B 不编辑 4A 注册器。
- `driver-extensions/replay-anchor.ts`、`governance.ts`：导出 `{extend:{...}}`，4A `test-driver.ts` 自动合并；不编辑 4A 驱动方法。
- 与 4A 文件边界：4A 文件只做 §2.2 列出的最小修改；新逻辑优先放新文件/扩展；不改 4A 已通过行为（引擎切换/设置/资料/工作/队列子视图）。

## 三、驱动方法 / 契约面三态

### 3.1 驱动增量（`window.__ansRenderer`）

| 方法/字段 | 语义 |
| --- | --- |
| `replayAnchorDebug(roleId)` | 返回锚点数组 `{anchorKey, requestIndex, conclusionIndex, rowsAtReplay}`（无表返回 `[]`） |
| `governance`（对象） | 4B 测试驱动：`state()`（模式/模型/loading/busy/preview/result）、`open(mode?)`、`selectModel(model)`、`confirm()`、`cancel()`；只调真实 store/动作，不提供假实现 |
| `queuedDebug()` | 保持；4B 断言 id 集合并验证切引擎清空、重推重建 |
| `state.governanceModel/Record` | 保持（listing 原样）；新增只读 `state.governancePreview`（打开/模式/previewDigest/canConfirm），不改变既有字段语义 |
| `state.rightTab` | 保持 `card|work|pi|document|null`；队列子视图仍不新增值 |

### 3.2 契约面三态目标

| # | 契约项 | 4A 状态 | 4B 目标 |
| --- | --- | --- | --- |
| 12 | `.msg-user/.msg-assistant/.msg-injected/.sys-*/.tool-*/.virt-spacer`、回放/锚点 | 已满足（3B/4A 聊天行；报告全文/persistence/delivery 未满足） | **已满足**（报告全文/证据/来源/持久化/交付回执/安全显示；锚点索引；不改变行模型） |
| 13 | 交互卡 `.op-*`、治理卡镜像/排队、恢复卡 | 部分（3B/4A operator/恢复；镜像/聚合未满足） | **已满足**（同 id 镜像、只答一次、排队提示/聚合、治理 meta/preview） |
| 17 | 治理记录 `#governance-status/#governance-preview/[data-governance-*]` | 未满足 | **已满足**（建立/重新接受/迁移预览、零写入、pin-mismatch、空态/状态行） |
| 19 | `window.__ansRenderer` 全量方法 | 部分（4A 方法） | **已满足 4B 方法**（`replayAnchorDebug`、`governance`；4A 方法保持） |
| 15 | 右抽屉 | 已满足（4A） | 保持；queueView 顶层 tab 切换修复（PM §14.2） |
| 18 | 设置 | 已满足（4A） | 保持；菜单配置状态文字（§1.9） |

### 3.3 新增/对齐 check 名（建议，测试属主定稿）

- QUEUE_VIEW 既有 4 名（不改名）。
- 新增：`QUEUE_VIEW_TAB_SWITCH_TO_CARD_CLEARS_SUBVIEW`、`QUEUE_VIEW_TAB_SWITCH_TO_WORK_CLEARS_SUBVIEW`、`OPERATOR_MIRROR_SAME_ID_ANSWER_ONCE`、`OPERATOR_QUEUE_AGGREGATE_COUNT_AND_CLEAR`、`OPERATOR_QUEUE_NOT_IN_RUNTIME_SNAPSHOT`。
- 治理：`GOVERNANCE_STATUS_PIN_MISMATCH`、`GOVERNANCE_REACCEPT_PREVIEW_ZERO_WRITE`、`GOVERNANCE_REACCEPT_CONFIRM_ONCE`、`GOVERNANCE_ESTABLISH_MODEL_CHOICE`、`GOVERNANCE_MIGRATION_NOT_AVAILABLE_HONEST`、`GOVERNANCE_EMPTY_STATE_ENTRANCE`。
- 报告/交付：`REPORT_CARD_FULL_EVIDENCE_AND_SOURCE`、`REPORT_PERSISTENCE_STATES_HONEST`、`DELIVERY_RECEIPT_CARD_AND_SAFE_COPY`、`REPORT_IDENTITY_DEDUP`。
- 驱动/回放：`REPLAY_ANCHOR_REQUEST_CONCLUSION_INDICES`、`JUDGE_RESULT_REPLAY_PER_RUNTIME`、`JUDGE_RESULT_NOT_LEAK_ACROSS_RUNTIME`。
- 收尾：`SINGLE_SWITCH_DROPS_DECISION_WARNING`、`MENU_CONFIG_STATUS_TEXT_CACHED_NO_EXTRA_READ`。
- C2：由测试角色重锚/退役（`expired old shell shown disabled…` → 「收起 + 原因可见」或删除），桌面UI 记录，不自行改名。

## 四、测试计划

### 4.1 纯逻辑单测（`test/桌面UI/`，`.ts` 无 JSX）

1. `governance-view.test.ts`：动作选择（hasProject/hasRoles/recordState→establish/reaccept/invalid/present）、状态/缺项/mismatch/空态文案逐字、模型选择与 suggested、预览形状/`canConfirm`/blockers/digest 校验、迁移 not-available/honest、失败 phase（guard vs write）。
2. `operator-view.test.ts`：镜像面（mirrorRoleId 缺省/相同/不同）、同 id 去重、queued 不入可操作/呈现后移除、聚合计数（项目过滤/唯一 id）、排队文案、治理 meta 映射、pending 按 surfaces。
3. `report-view.test.ts`：报告身份（reportId/source/turn）、去重、声明/状态/来源文案、摘要预览 180/4 行、flags/evidenceOmitted、persistence 状态→文案/可重试、delivery 回执字段、安全显示 flags、版本不支持。
4. `anchor-view.test.ts`：anchorKey 缺省/关联、request/conclusion 索引、回放后行索引、重复锚点去重、无锚落尾。
5. 4A 既有 67 项保持全绿。

### 4.2 4B Electron 离线 IPC 冒烟（`phase4b-electron-smoke.mjs`）

- 引擎/项目：trio 四角色 listing、pin-mismatch listing；切换/项目清空排队聚合。
- QUEUE_VIEW：两条排队→聚合 2；切引擎/切回→无旧聚合且 `queuedDebug=[]`；重推 1→聚合 1；expired→聚合移除。
- 镜像：同一 id 在 liaison/rapporteur 两面；一面答→两面冻结；只一次 `operator-response`；排队卡无按钮；呈现后聚合一减一、两面出现。
- 治理：pin-mismatch 状态行/空态→预览（changed/write/pin/warning/blockers）→取消零写→确认一次（digest）→成功文案；establish 模型选择 single/trio 与零写入预览；invalid 不覆盖；migration not-available 如实。
- 报告/交付：handback 全文/证据/来源按钮/持久化 saved/failed/expired/disabled 与重试、同卡更新、迟到不覆盖；delivery 卡批次事实/安全副本/回执重试/过期。
- 驱动：`replayAnchorDebug` 索引；judge 行跨引擎重放/不串引擎；single 切换警告清除；菜单状态文字且读取次数不增。
- 960/200%：治理预览/报告卡/交付卡无横向溢出、焦点/Esc/inert（适用）、200% 设置/报告；零 console/CSP。

### 4.3 uiux-v2 预期关闭

| 段 | 预期 |
| --- | --- |
| `ANS_QUEUE_VIEW_UI_ONLY` | **4/4**（既有四项；`.op-queue-aggregate`、`queuedDebug`） |
| 默认段 | **剩余 4B 项**：`denied conclusion anchor and decided card retained`、`pending locator visible after role click`、`open pending supersedes true busy`、`pending entry fully reachable with card/pi 960`、`covered pending actions unavailable card/pi`、`keyboard locate closes card/pi and exposes all actions`、`keyboard reaches/expands original preview`、`expanded preview renders controlled markdown`、`expanded preview stays inside card width`、`keyboard enters original confirm action`、`keyboard reaches deny action`、`answered pending returns to true busy`、`idle after answered removes work`、`pending arrival preserves drawer`、`expired request restores actual true busy`、`ordinary question creates no pending`（20 项；以台账 §7.2 为准） |
| `ANS_VISUAL_V2_UI_ONLY` | 4A 已过 3 项（普通聊天/结构/工作概览）；4B 目标报告卡与剩余项：`V2 source report uses separate layered top and facts before primary source and full copy`、`V2 preview is deterministic real summary while complete safe copy is independently reachable`、`V2 report status unknown association redaction truncation omission and save facts remain visible`、`V2 report declaration alone cannot fold an active assistant message`、`V2 true settled folds only the exact report turn assistant original in place`、`V2 late exact turn reply follows settled rule and other turns remain ordinary`、`V2 task request folds only by exact structured report actual turn without reordering ordinary chat`、`V2 local state refresh preserves full report and original task expansion`、`V2 modal …inert`、`V2 document drawer matches 18px heading…`、`V2 native window controls…`、`V2 Shift Tab/Tab/background focus/Escape…`、`V2 real geometry`、`V2 dark theme…`、`V2 modal width 424`、`SV13 cold report…` 与 `cold reports reverse/sorted/unknown time` 等 |
| `ANS_MIRROR_UI_ONLY` | **8/8**（含四角色树/状态行/Liaison 空态/镜像/只答一次/聚合；状态行 `三权 · 四角色` 与旧常量 `五角色` 的口径需先由测试/PM 重锚，见 §七） |
| `ANS_GOVERNANCE_REACCEPT_UI_ONLY` | **5/5** |
| `ANS_DELIVERY_NOTE_UI_ONLY` | 交付 note 分类项（若台账归 4B） |
| `ANS_COMPLETE_FLOW_UI_ONLY` | C/B/P3 报告/持久化/交付/来源文档项（41 项中的 4B 子集） |
| `ANS_JUDGE_UI_ONLY` | 保持 **33/33**（回归）；`ANS_SINGLE_SWITCH…` 为 4B 新增项 |
| `ANS_G2_RECOVERY_UI_ONLY` | 保持 **5/5**（回归） |
| `TERMINAL`/`TOOLFOLD`/4A 四段 | 保持 4A 基线全绿（回归，不弱化） |
| C2 | 重锚/退役后无冲突红 |

### 4.4 门禁

- `typecheck:renderer`/根 `typecheck`、`build:renderer`、CSP 扫描、入口引用 gzip ≤300KB。
- 新纯逻辑单测全绿；4A 67/67 保持；旧基线 679/679；IME 24/24；懒挂载 10/10。
- 4B 冒烟全绿 + 1360/960/200% 截图（治理状态/预览/确认、镜像双面、聚合、报告卡/持久化/交付、菜单状态、queueView 切换）。
- uiux-v2 上述段实跑，逐段记录到达/通过/失败名与归属；不宣称全量双端/Phase 5。
- bench：触碰 chat-store/ChatStream/confirm-store/ChatRow，按 §五重基线。

## 五、依赖

**4B 零新增依赖**。复用 React/zustand/lucide/Base UI/markdown-it/Motion；治理预览/报告/交付用既有 Button/Input/Badge/Separator/ScrollArea/Collapsible/Alert。若确需新包，按 PM 四问提交包名/原因/版本并精确锁版，未批准不安装。

## 六、热路径影响与基准计划

- **触碰热路径**：`chat-store` 事件/行追加（镜像/聚合/报告/交付行更新）、`ChatRow` 渲染（新增分支/卡）、`ChatStream`（空态/聚合）、`confirm-store`（judge 重放/警告）、`ipc.ts` 路由（judge/持久化/治理事件）。按 PM §14.4 #6 视为热路径变更。
- **原则**：队列聚合只原位更新文本/计数，不逐 token 重建；镜像仅在 trio 且带 mirrorRoleId；报告/交付卡与持久化更新按 reportId/attemptId 定点；新缓存只存引用、按项目清理、不逐事件 JSON 解析/深拷贝；聊天行无新动画；`phase4b.css` 不覆盖聊天行/工具组/呼吸位。
- **重基线**：同机同日旧/新交替 ≥3 有效轮（首轮预热），maxGap 中位 ≤max(旧,25ms)、handler/replay/scroll 中位 ≤max(旧×1.2,旧+5ms)、p95≤35ms、单轮≤50ms；延迟挂载 10/10；C1 保持 Δ≤32（目标≤20，4A Δ=16）；IME 24/24。
- **虚拟窗口/锚点**：报告/回执卡挂载时不改变行高口径；anchor 索引在窗口化/回放下正确；大工具组延迟挂载例外不变。

## 七、风险 / 未决

| # | 风险/未决 | 对策/待确认 |
| --- | --- | --- |
| R1 | 镜像/聚合需改 `chat-store`/`ChatStream`/`confirm-store`（4A 冻结） | 本清单已列解冻范围/理由；PM 复核批准后才动；任何超出清单停手回 PM |
| R2 | `MIRROR` 状态行期望「三权 · 四角色」与旧常量「三权 · 五角色」（Proof 验收角色）冲突 | 测试/PM 先重锚口径（动态角色数或固定文案）；4B 不自行改断言 |
| R3 | 治理记录数据来源：listing 只给 state/pins，完整预览走 preload；空态/状态行角色数/名称 | 只用主进程数据；不读文件；`governanceModel` 未知不猜 |
| R4 | 报告 persistence 安全呈现：错误不回显提交值/路径，source 只用 opaque ID | 沿用 4A 文档口径；所有文案主进程/纯映射；不假 saved |
| R5 | 排队聚合复活/去重 | 快照不含 operatorQueued、切引擎清空、只信主进程重推；按项目/唯一 id 计数 |
| R6 | 菜单状态读取与 SELECTOR 读取次数断言冲突 | per-engine 缓存 + 版本守卫；菜单只读缺失/未知，不重复读；新增读取次数检查 |
| R7 | queueView tab 切换（PM §14.2）涉及 `ChatHeader` 直接 setState | 统一经 drawer-store 顶层切换清空；新增双向检查 |
| R8 | C2 重锚/退役属测试角色 | 桌面UI 提供同因证据与批准语义，不自行改名/豁免 |
| R9 | 4B UIUX 设计确认尚未产出 | 新组件（GovernancePanel/ReportCard/DeliveryCard/aggregate/mirror）先经 UIUX 白名单/状态矩阵；本文不预设视觉细节 |
| R10 | 扩展点/类型扩展 | 优先 `chat/extensions`/`driver-extensions`/`types/platform-4b.d.ts`；不改 4A 注册器/驱动；若需改 `platform.ts` 主结构，回 PM |
| R11 | App.tsx 是否必须 | 本计划不需要；治理状态/预览由 ChatHeader 承载、空态由 ChatStream 承载；若实施发现必须改 App，停手回 PM |
| R12 | 热路径回归 | 5 个热路径文件变更后按 §六全量重基线；不弱化断言 |

## 八、4B/Phase 5 边界

- **4B 做**：§一 1.1–1.11；QUEUE_VIEW、治理三权/镜像/聚合、治理记录动作、报告全文/persistence/delivery、operator 镜像、replayAnchorDebug、single 警告刷新、judge 跨引擎重放、菜单状态、queueView tab 切换、C2 重锚配合、契约面行 8/3B 笔误同步。
- **4B 不做**：Phase 5 的 `main.mjs`、全量双端逐 check、生产入口切换、打包/发布/安装包、真实模型/网络/`.env` 写入、Windows/DPI/屏读最终验收；不改旧渲染器核心、`app/main.ts`、preload、`app/desktop/`、发布流水线；不新增依赖/DOM 例外；不弱化/删除断言。
- UIUX 4A 打磨项（当前引擎点语义、进行中文字、HH:MM、资料待办定位、Drawer × 图标、草稿关闭语义、保存条字号）可在 4B 顺带，但**不进 4B 门**；若纳入需在本清单点名并经 PM 复核。

## 九、待 PM 复核点

1. **解冻清单**：是否批准 §2.2 的 `chat-store`/`ChatRow`/`ChatStream`/`confirm-store`/`events.ts`（最小）解冻与范围；`App.tsx` 本计划不动。
2. **MIRROR 状态行口径**：`三权 · 四角色`（测试期望）与旧 `五角色`（含 Proof 验收角色）以哪个为准，或改动态角色数；由测试/PM 重锚后再实施。
3. **QUEUE_VIEW 聚合落点**：计划用 chat-store 行模型 + ChatRow 渲染（不改 ChatStream 的行分发/虚拟窗口）；若要求 pane 级元素（旧 DOM），需改 ChatStream，请确认。
4. **菜单状态读取策略**：per-engine 缓存 + 菜单只读缺失/未知，是否满足设计 §1.4/PM §12.3 #4；读取次数检查由测试定稿。
5. **治理空态/状态行宿主**：计划 ChatStream 空态 + ChatHeader 状态/预览（不动 App）；请确认。
6. **C2 重锚/退役**：由测试角色在 4B 门前列名执行，桌面UI 只记录；请确认责任分工。
7. **报告/交付范围**：`ANS_DELIVERY_NOTE_UI_ONLY` 与 `ANS_COMPLETE_FLOW_UI_ONLY` 的 4B 子集是否全部纳入 4B 门，或部分随 Phase 5；请给门清单。
8. **UIUX 4B 设计**：新组件白名单/状态矩阵/几何（1360/960/200%）待 UIUX 确认后再开工。

## 附：核对方式与状态声明

- 只读核对：PM §十四、4A 范围/变更/契约面、测试台账 §七、旧 `renderer.js`（治理 L500–1230、报告 L2401–2605、operator/镜像/聚合 L3300–3760、锚点 L6823）、`ui-labels.js`（治理/镜像/报告文案）、preload 治理/持久化/交付通道、`uiux-v2.mjs` 的 QUEUE_VIEW/MIRROR/GOVERNANCE_REACCEPT/COMPLETE_FLOW/VISUAL/JUDGE/G2 段、新渲染器存储/行模型结构。
- 未运行应用/测试/构建，未调用模型/网络，未读 `.env`；未改 `app/` 代码、依赖、主进程/preload/desktop、旧渲染器或根配置；只写本文件与 memo/changelog 的必要更正。
- 本文是 4B 范围与写集规划（status: proposed），不是实施、测试或验收记录；4B 派发与写集以 PM 复核结论为准。
