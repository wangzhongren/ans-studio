---
id: ui-platform-phase4b-review
type: design
title: Phase 4B 实现设计对齐评审（治理/镜像/记录/报告回执）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 7
related: [ui-platform-phase4b-design, ui-platform-phase4a-review, ui-contract-surface, ui-components, ui-platform-phase3b-cards-composer]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对 Phase 4B 治理三权/镜像/排队聚合、治理记录预览、报告全文/persistence/delivery、菜单状态、queueView、single 警告、judge 重放与 replayAnchorDebug 完成只读设计对齐评审；结论 needs-work，4 项 Phase 5 前必须（960 五角色左树重叠、200% 头部/内容横溢与假通过、报告事实标签粘连、治理预览取消不回焦），其余可随 Phase 5
  - date: "2026-10-21"
    kind: re-reviewed
    summary: 4B 返工复核：960 五角色树、报告 facts、治理预览取消回焦已通过；200% 左树仍空白/配置提示被裁、200% 报告与治理预览截图未展示目标内容，结论维持 needs-work（剩余 2 项 Phase 5 前必须）
  - date: "2026-10-21"
    kind: re-reviewed
    summary: 4B 200% 收口复核通过（设计对齐 pass）：70/70 冒烟、10 张截图；200% 左树可见可滚动、配置提示全宽、报告/完整摘要/治理预览可见且逐容器无横溢，960 报告 facts 可见；C2/锚点/VISUAL/RUNTIME 无回退
  - date: "2026-10-21"
    kind: audited
    summary: PM §十八 追加 Phase 5B 新端视觉审计与 design audit 裁定：可见行不退役（规范化夹具 ≥9/≥8/≥4）、转轮保留 0.9s；12 条重锚仅工作徽标/chip 右对齐有等价 DOM；新端结论 needs-work（P0 200% 输入区不可达、P1 200% 错误态横滚/W10+W11 缺转轮/密度等价未立）
  - date: "2026-10-21"
    kind: re-reviewed
    summary: PM §十九 追加：BOOTSTRAP 中心 CTA/S0 提及非有意删除，需补回；重锚 W9/W10/W11 改为 CSS keyframes 而非 Motion，密度夹具/S2 右缘未落地；新候选 5A 冒烟 19/19 证实 P0/P1 修复，完整 A–L 待新 hash 重跑
  - date: "2026-10-21"
    kind: audited
    summary: 冻结候选最终审计：P0 与旧 P1 清零（composer 可达、200% 失败态无横滚、BusySpinner Motion、密度/1.6、镜像交付 200）；新 P1 为 200% sticky composer 遮挡报告/完整摘要/治理预览/镜像卡目标，结论 needs-work（P0 0、P1 1、P2 3）
---

# Phase 4B 实现设计对齐评审

**评审对象**：桌面UI [Phase 4B 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)（status: delivered 4B 范围内，2026-10-21）与 [2026-10-21-phase4b-evidence](../../../桌面UI/docs/change/2026-10-21-phase4b-evidence/)（53/53 冒烟、1360/960/200% 截图、uiux-v2 逐段、bench/ime/lazy/gates）；实现 `chat/{governance-view,operator-view,report-view,anchor-view}.ts`、`stores/{governance,report}-store.ts`、`shell/{GovernancePanel,ReportCard}.tsx`、`phase4b.css`、`chat/extensions/*`、`driver-extensions/*`。

**设计依据**：[Phase 4B 设计附录](2026-10-21_design_ui-platform-phase4b-design.md)、Nova × 深色石墨规范、[契约面](../../../桌面UI/docs/feature/ui-contract-surface.md)、[组件台账](../../../桌面UI/docs/feature/ui-components.md)、旧 `renderer.js`/`ui-labels.js`/`styles.css`。

**评审性质**：只读实现、截图、冒烟/基准/分段证据与旧基线；未改 `app/` 代码、未重跑测试、未调用模型/网络、未提交。本文是设计对齐意见，不是产品验收或 Phase 5 结论。

## 一、结论

> **4B 200% 收口复核（2026-10-21）**：70/70 冒烟、10 张截图。200% 左树可见且可滚动到第 6 行，行不重叠；缺配条全文换行、按钮首屏内；200% 报告卡/完整摘要与证据/治理预览均可见且逐容器无横溢；960 报告 facts 可见。结论 **pass（设计对齐通过）**，4B 可按 PM 口径关门；Phase 5/真机项另计。前文当轮 needs-work 与返工 needs-work 保留为历史。

> **4B 返工复核（2026-10-21）**：65/65 冒烟已补五角色 960/200%、200% 容器、facts、取消回焦；960 五角色树、报告 facts（1360/960 计算断言）、取消回焦通过。200% 头部换行改善，但 `phase4b-200pct-five-role-tree.png` / `phase4b-200pct-report.png` / `phase4b-200pct-governance-preview.png` 的左树仍为空、配置提示窄条被裁，200% 报告/预览截图未展示目标内容；`treeRowsHealthy` 过滤零高行、容器检查未含配置提示，仍存在假通过。结论维持 **needs-work**（剩余 2 项 Phase 5 前必须，见 §八）；前文当轮 needs-work 保留。

> **needs-work（需修正后复核）。** 4B 功能面与测试证据整体扎实：53/53 Electron 冒烟、UIUX MIRROR 8/8、QUEUE 4/4、GOV 7/7、SELECTOR 27/27、CONFIG 21/21 通过；FLOW/GHOST/VISUAL/COMPLETE_FLOW 在 4B 子集后止于 Phase 5 项；96/96 新纯逻辑、679/679 旧基线、IME/lazy/bench/C1 通过，零 console/CSP；治理卡源面/镜像同 id、只答一次/双面冻结、queued 不物化卡、治理预览、报告/persistence/delivery、菜单状态、queueView、single 警告、judge 重放与 `replayAnchorDebug` 均有真实断言。仍有 **4 项 Phase 5 前必须**：
>
> 1. **960 五角色左树行重叠**：`phase4b-960.png` 中主入口/治理职能角色行内容互相压住，树不可读；现有 960 检查只验 document 无横溢，未验行高/不重叠。
> 2. **200% 头部/内容横溢与假通过**：`phase4b-200pct.png` 中标题/上下文/操作竖向挤压、聊天出现横向滚动条；`200% text reflow` 只检查 `document.documentElement.scrollWidth`，漏掉 `#chat`/`.chat-head`/抽屉内容，检查误通过。
> 3. **报告事实标签与值粘连**：960 报告卡显示「报告存储报告已保存」「独立验收尚未确认」，缺冒号/间距/网格；与设计 §4.1 的 `报告存储：…`/`独立验收：…` 不符。
> 4. **治理预览取消不回焦**：`GovernancePanel` 的取消按钮仅 `store.cancel()`，未把焦点还给触发按钮；面板隐藏后焦点落 body。Esc 回焦已通过，取消路径未覆盖。
>
> 其余为可随 Phase 5 的视觉/证据打磨；未发现功能造假、第二套库、缺配/未授权冒充成功或热路径新增动画。

## 二、已通过

### 2.1 治理三权/镜像/排队

- `five-role listing`、`queued aggregate unique`、`runtime switch no revive`、`repush rebuild`、`expired removes aggregate` 全通过；`#chat .op-queue-aggregate` 唯一、trio 主入口、不可聚焦/无按钮、切引擎/项目清空、不重复计数。
- `mirror card` 在 Liaison 呈现：`.is-mirror`、`data-surface-role-id`、徽标「镜像 · 主入口」、来源「来自 报告员 Rapporteur / 报告员的治理决定 · 客户最终批准」、同 `data-request-id`；5/5 冒烟与 MIRROR 8/8 通过。
- `mirror answer responds exactly once`、`mirror/source face freeze`、`second face cannot answer` 通过；双面动作 hidden、`finalNote` 可见、无第二张审批。
- `queued payload card shows waiting note and no operable actions` 通过；queued 不物化可操作卡，防御卡显示「等待前一个决定」且无按钮。
- 卡预览使用受控 Markdown（`op-preview-body card-md`），流程/步骤/权力/路径/摘要/哈希按字段缺失不显示；与设计一致。

### 2.2 治理记录预览

- `pin-mismatch status row/empty state`、`preview unique non-modal`、`preview file/write/pin/warning`、`cancel zero write`、`confirm once with digest`、`success text` 全通过；`#governance-preview` 唯一、无 backdrop/无焦点陷阱、Esc 回触发。
- 建立：`establish preview declares boundaries and defaults single`、`explicit trio re-previews`、`cancel zero write` 通过；模型选择/写入/pin/采纳旧文档/旧格式/声明/未知模型禁用均有断言。
- 再接受：逐文件 modified/missing/unreadable、pin 重算、warning、blockers、digest、取消零写、确认一次、成功文案通过。
- 迁移：`migration preview not-available is honest with zero write` 通过；实现代码支持真实迁移预览/确认/失败 phase，但本批证据只覆盖 not-available（见 §四）。
- `phase=write` 失败不出现零写入/成功；`cancel` 的提示「已取消，未写入任何文件。」与零写一致。

### 2.3 报告/persistence/delivery

- 报告卡分层：来源/声明/任务/轮次（`ReportCard` 在 53 冒烟与 VISUAL/FLOW 中通过）、180 字/4 行摘要、flags、证据、完整摘要 details、来源文档按钮、独立验收「尚未确认」。
- `persistence`：saved/failed/unknown/disabled/expired、同卡原位更新、失败保留重试、迟到 pending/failed 不覆盖 saved、expired 不保留假重试；`report retry calls once`、`save updates same card` 通过。
- delivery：批次标题「回交投递 · 本批 N 份（不表示全部收齐）」、接收历史/目标输入记录/目标轮次结果、安全显示副本 flags、历史重试、expired 移除重试；`visual-v2-received-960.png` 层级清楚，未出现「全部收齐」。
- 报告来源文档按钮、报告/交付卡焦点与重试焦点有测试；不把报告声明当独立验收，不显示假完整/已持久化。

### 2.4 菜单/queueView/single 警告/锚点

- 菜单：`configured/missing` 状态、缓存重开零额外读取、切引擎恰一次读取、读取失败「配置未知」；208px 两行在 1360/960 菜单截图中可读。
- queueView：工作概览/角色资料/设置/文档 tab 切换清空、抽屉保持打开、标题/焦点正确（35–38）。
- single↔trio：trio 开启一次性警告、single 禁用 decision 并移除 stale line、回 trio 重新提示一次（39–42）；不持久化。
- judge 跨引擎：当前视图/异引擎/切回重放/不泄漏（43–46）；`replayAnchorDebug` 索引与卡落位（47–48）；denied 卡原位冻结（48）。
- C2 重锚 `expired old shell collapses with reason visible` 通过；不保留旧冲突期望。

### 2.5 纪律

- `phase4b.css` 无裸色值；新增组件使用既有 Button/Badge/Alert/Card/native radio；组件台账 4B 节登记 GovernancePanel/ReportCard 等；无新增依赖、无新增 DOM 例外。
- 2px/3px 焦点环、Lucide 图标、治理预览无 backdrop/无 trap、报告/卡无入场动画；热路径零动画；960/200 的 body 宽度检查通过（但见 §三）。
- 53/53 冒烟、零 console/CSP；1360 治理状态行/预览、报告卡、菜单、交付批次层级与 Nova 令牌一致。

## 三、Phase 5 前必须

### M1 960 五角色左树行重叠

**事实**：`phase4b-960.png` 中左树主入口/治理职能角色行内容明显互相压住：主入口的「客户沟通 · 不拥有最终批准权」「Pi 工作中」「内置角色…」与下一组「治理职能（内置）」、报告员/提名官等行重叠，树不可读。该截图是 4B 五角色项目（`phase4b-project`，6 角色）在 960×620 的真实 Electron 截图；1360 档正常。`shell.css` 的 `.tree-item` 只有 `min-height:48px` 且作为 `.tree` 纵向 flex 子项默认可收缩；4B 治理角色多出 `ti-power`/`ti-builtin` 两行后内容高度超过 48，树容器不足时 flex-shrink 把行压到 48，内容溢出到下一行。`phase4b-electron-smoke.mjs:787` 只检查 `documentElement.scrollWidth<=innerWidth`，无法发现行重叠。

**影响**：五角色项目在 960（PM/设计明确必须）左树不可读，用户无法选择/识别治理角色；这是 4B 新增五角色后暴露的实质布局回归，不是 Phase 5 可选打磨。

**要求（Phase 5 前）**：让树行不收缩（如 `.tree-item, .tree-group-block { flex: 0 0 auto; }`）并让 `.tree` 自身滚动；或在 960 档显式压缩/隐藏治理行的 builtin 说明但保留名称/权力/状态。补 960 树行 rect 非重叠断言（每行 next.top ≥ prev.bottom，允许 1px）与五角色截图；1360 保持现状。不得用缩小字号到不可读或隐藏角色来「过图」。

### M2 200% 头部/内容横溢与检查假通过

**事实**：`phase4b-200pct.png`（960×620 窗口、`wc.setZoomFactor(2)`）显示主入口标题「主理 / Lead」与「会话继续使用现有上下文」竖向逐字堆叠，Pi/工作概览/角色资料横向挤压，聊天底部出现横向滚动条；右侧内容被裁切。`phase4b-electron-smoke.mjs:789-792` 只断言 `document.documentElement.scrollWidth<=innerWidth`，而横向滚动可能在 `#chat`、`.chat-head`、`.head-inner` 或抽屉内部；该 check 因此 **假通过**。

**影响**：4B 设计 §7.5 要求 200% 可读/无横向；实际 200% 下不可读，且检查未覆盖真实滚动容器。后续 Phase 5 若沿用该 check 会掩盖回归。

**要求（Phase 5 前）**：在 200%（或等价窄视口）让 `.head-inner`/`.session-actions` 可换行、`session-identity` 保持可读宽度、`context-state` 正常换行；`#chat`/`.chat-pane`/`.composer`/治理预览/报告卡/抽屉内容 `scrollWidth<=clientWidth`；补 200% 治理状态/报告/预览/左树截图。检查改为逐容器断言，不只 document。必要时 200% 下让操作区换行到第二行，不缩成竖排单字。

### M3 报告事实标签与值粘连

**事实**：`visual-v2-960.png` 报告卡显示「报告存储报告已保存 独立验收尚未确认」；`shell.css:1745-1760` 的 `.report-facts` 用 inline `dt`/`dd`，`phase4b.css` 的 `.report-facts .persistence-state` 只做 inline-flex，没有给 `dt` 加分隔或 `dd` 前间距；短值（「报告已保存」）与标签直接相连。1360 长失败文案碰巧形成空格，掩盖了问题。

**影响**：报告卡是 4B 核心；960 下「报告存储：报告已保存」「独立验收：尚未确认」不可区分，用户可能误读保存状态/验收状态。设计 §4.1 明确要求「报告存储：<state>」「独立验收：尚未确认」。

**要求（Phase 5 前）**：给 report facts 使用明确标签/值分隔：`dt::after { content:"：" }` + `dd` 间距，或改 grid 两列/小屏单列（label 与 value 分行/分列）；960/1360/200 截图复核；delivery 三列 facts 已正确，不要回归。

### M4 治理预览取消不回焦

**事实**：`GovernancePanel.tsx:115-121` 打开预览记录 `invokerRef`；Esc handler 会 `invoker.focus()`，成功「关闭」调用 `close()` 回焦；但面板顶部「取消」按钮直接 `useGovernanceStore.getState().cancel()`，`cancel` 只重置 store/设 hint，不恢复 `invokerRef` 焦点。取消后面板 `hidden`，焦点留在被隐藏的取消按钮或落 body。53 冒烟 `cancel performs zero write and hides preview` 未断言焦点。

**影响**：非模态预览的键盘用户取消后丢失位置；与设计 §3.1「Esc 回触发」/4B 焦点纪律不一致，且每次取消都需要重新找入口。

**要求（Phase 5 前）**：取消按钮统一走与 Esc 相同的关闭+回焦路径（`cancel` 后 `invokerRef` 可见则 focus）；失败/结果后的取消同样；补焦点断言（取消后 activeElement 为触发按钮）。若 store.cancel 被其他入口复用，焦点恢复放在 GovernancePanel 的 cancel handler，不放 store。

## 四、可随 Phase 5

- **200% 治理/报告/预览证据**：现有 200% 只有 `phase4b-200pct.png` 一张，未覆盖治理预览、报告卡、delivery、菜单；M2 修复后应补这些 200% 截图/断言。
- **镜像卡截图**：MIRROR 8/8 有 DOM 断言但无 1360/960 镜像卡截图；视觉证据不足，Phase 5 可补（不影响当前功能判断）。
- **迁移预览实际回包**：本批只测 `not-available` 如实；真实 `previewGovernanceMigration` 回包/字段/snapshotDigest 的视觉未截图。代码存在，Phase 5 用真实桥补。
- **治理状态行 flow/四态**：`governance-view.governanceStatusText` 支持「当前流程：… · 等待客户决定/进行中/阻塞/已升级客户」，但 `GovernancePanel` 当前只显示模型 + `nextStep`，未接 `flowId/flowStatus`；若主进程提供 flow，4B 设计 §2.1 的完整状态行未落地。需确认接口是否供值；供值则 Phase 5 补，不猜。
- **聚合行图标**：`ChatRow.QueueAggregateRow` 用 `SystemIcon cls="sys-queue"`，而 `SystemIcon` 只识别 sys-denied/delivery-note/config/call，`sys-queue` 落到 Info 图标；旧实现/设计用 Clock。属小视觉差，建议 Phase 5 补 `sys-queue` Clock 分支。
- **治理预览按钮尺寸**：`gp-mini` 24、`gp-primary` 30，设计 §3.1/§7.2 动作 28；可随 Phase 5 统一 28/32。
- **报告完整 details 高度**：`report-complete-body` 无 max-height，超长全文可能把卡拉得很长；设计建议卡内滚动；Phase 5 用长文补。
- **delivery 内 blocked 报告**：`DeliveryCard` 内 `ReportBody` 没有 `msg-handback.is-blocked` 包装；报告状态文字可见，但左侧 danger 竖条只对顶层报告卡生效；若需同语义，Phase 5 补 `.delivery-report` 状态样式。
- **C2/Phase 5 既有缺口**：左树身份/树视口、虚拟窗口 full replay 阅读锚点、角色树待选择文案等由 uiux-v2 Phase 5 项中止；非 4B 写集，不阻塞 4B。
- **200% 字号/长路径**：M2 修好后仍建议覆盖 200% 治理预览长路径、报告长证据、菜单 208 的换行。

## 五、逐项对照

| 评审重点 | 结论 | 说明 |
| --- | --- | --- |
| 1. 治理三权卡/镜像 | 通过（视觉截图不足） | 固定文案、同 id、镜像徽标/来源、只答一次/双面冻结、queued 不物化卡、受控 Markdown 均通过；无镜像截图。 |
| 2. 治理记录预览 | 基本通过 | 唯一非模态、Esc 回焦、建立/再接受/迁移、逐文件、pin、canConfirm、phase=write 均通过；取消不回焦（M4）；迁移实际回包证据不足。 |
| 3. 报告/持久化/交付 | **needs-work（M3）** | 分层/完整/证据/source/persistence/delivery/安全副本通过；960 facts 标签粘连；200% 布局未过。 |
| 4. operator 聚合 | 通过（图标小差） | 唯一 `.op-queue-aggregate`、不可聚焦/无按钮、原位更新、切引擎/项目清空、不重复计数通过；Info 图标待 Clock。 |
| 5. 菜单配置状态 | 通过 | 208px 两行、状态文字/未知/检查中、按需缓存、读取次数断言通过；1360/960 菜单截图可读。 |
| 6. queueView/单警告 | 通过 | tab 切换清空、抽屉保持、标题/焦点、single↔trio 警告刷新均有断言。 |
| 7. 视觉纪律/960/200 | **needs-work（M1/M2）** | 1360 良好、令牌/焦点/图标/无裸色/新组件台账通过；960 五角色树重叠、200% 头部/内容横溢且检查假通过。 |

## 六、证据与限制

- **53/53** `phase4b-electron-smoke`：治理/镜像/队列/预览/报告/菜单/queueView/single/judge/anchor 覆盖；1360/960/200% 三张截图；零 console/CSP。
- **96/96** 4B 纯逻辑单测、679/679 旧基线、IME 26 true、lazy 10/10、bench 全部阈值、C1 Δ=16；gzip 284,157B。
- **uiux-v2**：MIRROR 8/8、QUEUE 4/4、GOV 7/7、SELECTOR 27/27、CONFIG 21/21 通过；FLOW 18/20（P7 待选择文案）、GHOST 7/9（builtin identity）、VISUAL 48 项通过后止于 Phase 5 树视口、DELIVERY_NOTE 7/9（builtin identity）、COMPLETE_FLOW 18/20（P7）；这些中止项是 Phase 5 既有缺口，不是 4B 新增红。
- **截图核对**：`phase4b-1360.png`（治理状态/五角色/树）、`phase4b-960.png`（树重叠）、`phase4b-200pct.png`（200%横溢/竖排）、`GOV/reaccept-preview-1360.png`、`SELECTOR/selector-1360/960-open.png`、`FLOW/02-source-report.png`、`VISUAL/visual-v2-960.png`（报告 facts 粘连）、`VISUAL/visual-v2-received-960.png`（delivery 正常）。
- **限制**：只读评审，未重跑 53/96/679；未启动真实模型/网络/`.env`；未验证真实迁移回包、镜像卡截图、200% 治理/报告/预览；200% 检查本身覆盖不足（M2）。

## 七、同步与边界

- 本记录仅写 `角色卡/UIUX设计师/`；同步 memo/changelog/feature-map。
- 未改 `app/`、`src/`、`test/`、`package.json`、其他角色或历史设计文档；未提交。
- M1–M4 修正后复核；其余 4B/5 不阻塞 4B 门。

## 八、4B 返工复核（2026-10-21）

**结论：needs-work（剩余 2 项 Phase 5 前必须）。** 桌面UI 已修 4B 真红与上轮 4 项；本角色只读新 [65/65 冒烟与 9 张截图](../../../桌面UI/docs/change/2026-10-21-phase4b-evidence/smoke/)、变更记录返工节、`phase4b.css`/`GovernancePanel`/`ReportCard`/`confirm-store`/`chat-store`/`ChatRow`。下表的「通过」只代表本轮可见证据；未通过项见 §八.2。

### 八.1 逐项结果

| 上轮项 | 本轮结果 | 证据/说明 |
| --- | --- | --- |
| M1 960 五角色树 | **pass** | `phase4b-960-five-role-tree.png` 行不重叠、树可滚动；`five-role tree rows do not overlap at 960`、`1360`、`200%` check 通过；`#role-tree > .tree-group-block/.tree-item { flex:0 0 auto }` 已生效；960 左树维护 6 行、行内容可读。 |
| M2 200% 头部/内容 | **needs-work** | 头部 `.head-inner` 已 `flex-wrap`，标题/上下文/Pi/操作分行；但 `phase4b-200pct-five-role-tree.png` 左树在 200% 为**空白**（品牌/项目/「工作空间」后无角色行），`phase4b-200pct-governance-preview.png` 同；配置提示「Pi 配置不完整…」在 200% 变成窄条并出现横向滚动条。`treeRowsHealthy` 用 `r.height>0` 过滤，零高/不可见行可让 check 通过；`200% containers` 只查 `#chat/.chat-head/.head-inner/#right-body`，未含 `.runtime-config-notice`/`.governance-status`/`#role-tree`。 |
| M3 报告 facts | **pass（960 视觉证据不足）** | `.report-facts > div` inline-flex + 4px gap + `dt::after{content:"："}`；`report facts label/value separated at 1360/960` 计算断言通过；`phase4b-1360-report.png` 可见「报告存储：报告已保存 独立验收：尚未确认」。`phase4b-960-report.png` 截在摘要上方未显示 facts；`phase4b-200pct-report.png` 只显示头部/配置提示、未显示报告卡，视觉证据不完整（非代码失败）。 |
| M4 治理预览取消 | **pass** | `GovernancePanel.cancelPreview` 调 `cancel()` 后对 `invokerRef` 回焦；`cancel returns focus to the preview invoker` 与 `200% cancel ...` 均通过；常规与 200% 覆盖。 |
| C2 / 已答卡锚点 / VISUAL | **pass** | C2 `expired shell collapses with reason visible`（48）、已答卡 full rebuild 锚点（51）通过；VISUAL **54/54**、RUNTIME **17/17** 通过；4B 真红关闭。 |

### 八.2 剩余 Phase 5 前必须

1. **200% 左树不可见 + 配置提示被裁（含检查假通过）**：
   - 事实：`phase4b-200pct-five-role-tree.png` 与 `phase4b-200pct-governance-preview.png` 左树在「工作空间」标签下为空；`phase4b-200pct-report.png` 配置提示呈窄条并带横向滚动条；截图均 200%、960×620 物理窗口。
   - 原因：200% CSS 视口约 480×310，左栏品牌/项目/标签/footer 占满高度，`.tree` 作为 `flex:1 1 auto` 可收缩到 0；`.runtime-config-notice`/`.governance-status` 未纳入 200% 换行/宽度规则。`treeRowsHealthy` 过滤 `height>0`，零高/滚出视口的行仍可能通过；`200% containers` 未查这些节点。
   - 要求：200% 下让左栏可滚动或给 `#role-tree` 可见 min-height，保证至少选中行 + 治理角色可滚动到达；配置提示/治理状态行允许换行、按钮独占行、无横向滚动；补 `#role-tree.clientHeight>0`、行 rect 与 tree viewport 相交、`.runtime-config-notice`/`.governance-status` 的 scrollWidth 断言；截取能看到角色行/提示全文的 200% 图。
2. **200% 报告/治理预览截图未展示目标 + 报告 details 内部溢出未断言**：
   - 事实：`phase4b-200pct-report.png` 实际画面停在头部/配置提示，未出现报告卡；`phase4b-200pct-governance-preview.png` 未出现预览面板；`200% containers` 的 `offenders` 中 `report-complete-body`（sw40/cw32）、`hb-complete-summary`（sw12/cw2）、`hb-evidence`（sw30/cw18）仍有横向溢出，但 check 只断言 selectors 通过。
   - 要求：200% 截图先滚到报告卡/展开完整摘要与证据/打开治理预览，确保目标内容可见；容器检查把 `.report-complete-body`/`.hb-complete-summary`/`.hb-evidence`/`.governance-preview` 纳入 `scrollWidth<=clientWidth+1`（或明确允许的局部滚动并标注）；960 报告截图滚到 facts，补「报告存储：」「独立验收：」可见证据。当前 4B 行为/1360 证据通过，但 200% 可读性未闭环。

### 八.3 仍可随 Phase 5

- 200% 字号/长路径/长证据的进一步 typography 微调；镜像卡 1360/960 视觉截图；真实迁移回包截图；治理 flow 四态接入；聚合行 Clock 图标；gp 按钮 24/30→28；delivery blocked 报告竖条；C2/Phase 5 既有树视口/身份/虚拟窗口缺口。
- 4B 功能与 1360 视觉证据整体通过；上述两项 200% 布局/证据是 Phase 5 前最后阻塞。

### 八.4 边界

本轮只读新证据/实现并更新角色文档；未改 app/、未重跑 65 项、未提交。M1 960/ M3 facts/ M4 cancel 已闭环；M2 200% 需再修再复核。

## 九、4B 200% 收口复核（2026-10-21）

**结论：pass（设计对齐通过）。** 桌面UI 已修上轮剩余 2 项 200% 收口；本角色只读 [70/70 冒烟与 10 张截图](../../../桌面UI/docs/change/2026-10-21-phase4b-evidence/smoke/)、`phase4b.css`、`GovernancePanel`/`ReportCard` 与 C2/锚点证据。前文 needs-work/返工 needs-work 保留为历史，本节为最新结论。

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 200% 左树可见/可滚动 | **pass** | `phase4b-200pct-five-role-tree.png` 显示主入口/治理职能角色行；`treeCH 643`、`leftSH 923`、`count 6`、`firstVisible/lastVisible true`；`200% tree visible on screen and scrollable to last role`、`visible rows intersect`、`rows do not overlap` 通过；行 rect 不重叠。 |
| 200% 缺配条/状态行 | **pass** | `phase4b-200pct.png` 缺配条全文「Pi 配置不完整，缺：ANTHROPIC_AUTH_TOKEN、ANS_PI_MODEL。请补齐后保存。」换行、按钮在首屏；`msgSW=msgCW=198`、`msgSH=msgCH=55`、`btnInside=true`；容器检查新增 `.runtime-config-notice/.governance-status/#role-tree/.col-mid/.session-notice/.composer`，`offenders=[]`。 |
| 200% 报告/完整摘要 | **pass** | `phase4b-200pct-report.png` 报告卡可见；`phase4b-200pct-report-details.png` 完整摘要+证据可见；`.msg-handback` 196/196、`.report-complete-body` 166/166、`.hb-complete-summary` 136/136、`.hb-evidence` 146/146，内部无横溢；`200% report details nodes stay within width`、`report card visible` 通过。 |
| 200% 治理预览 | **pass** | `phase4b-200pct-governance-preview.png` 预览面板可见；`200% governance preview visible and fits`、`cancel ... returns focus` 通过；面板内滚动、无横溢，取消回触发。 |
| 960 报告 facts | **pass** | `phase4b-960-report.png` 滚到 facts，可见「报告存储：报告已保存 独立验收：尚未确认」；`960 report facts labels visible inside chat viewport`、`facts separated 1360/960` 通过。 |
| 回归 | **pass** | C2 收起+原因（48）、已答卡 full rebuild 锚点（51）、RUNTIME 17/17、VISUAL 54/54；70/70、零 console/CSP；无新裸色/第二图标/热路径动画（`phase4b.css` 扫描为空，新增仅既有 Lucide/原生 radio）。 |

**剩余可随 Phase 5（不阻塞）**

- 镜像卡 1360/960 视觉截图、真实迁移回包截图（本批仍只覆盖 not-available）、治理 flow 四态接入（`governanceStatusText` 支持但 GovernancePanel 只显示模型 + nextStep）。
- 聚合行 `sys-queue` 仍落 Info 图标而非 Clock；`gp-mini` 24/`gp-primary` 30 vs 设计 28；delivery 内 blocked 报告无 danger 竖条；报告完整 details 长文阈值。
- Phase 5：`main.mjs`、全量双端、生产入口、打包/Windows/DPI/屏读、真实模型/网络、C2/树视口/身份/虚拟窗口既有缺口。

**边界**：本轮只读新证据/实现并更新角色文档；未改 app/、未重跑 70 项、未提交。4B 设计对齐通过；Phase 4 完成不等于 Phase 5/最终验收。

## 十、Phase 5B 新端视觉审计与 design audit 裁定（2026-10-21，PM §十八）

**结论：needs-work（P0 ×1、P1 ×3、P2 ×4、missing ×1、证据注记 ×1）。** 详见 [Phase 5B 新端视觉审计](2026-10-21_design_ui-platform-phase5b-new-visual-audit.md) 与[证据](2026-10-21-phase5b-new-visual-evidence/)（75 张三档 + 75 metrics + 11 keyboard + 16 张 4B 冒烟图；manifest/findings）。本节只摘与本评审相关的裁定与必须项。

### 十.1 两条裁定

1. **`6-可见行≥9`：不退役。** 旧 9 是旧夹具/614.4px 视口值；新 6 是另一夹具（2 张 operator 卡，其中一张为上一场景残留 `audit-pending`；系统行 57.2/54 vs 17.8）与 576.4px 视口（57.8px 提示条叠），不可直接比较。新口径：规范化夹具下 **1360×860 无提示条 ≥9、有提示条 ≥8、960×620 有提示条 ≥4**；逐行 16±1、活动行 ≤48、转录 ≤850、输入区 ≤140 保留。当前 6 低于等价 8，**needs-work（P1）**；先清残留/规范夹具，再压 chrome，不压正文、不降到 6。
2. **`9-W9-转轮0.9±0.2s`：保留 900ms。** 新端 `.status-spinner` + Lucide `LoaderCircle` 12px + Motion 0.9s linear infinite 已正确；旧检查只是还在找 CSS `.spin-arc`。重锚为 `.status-spinner svg` + 运行时角速度（或 source guard）+ reduced-motion 静止弧；不批准静态默认。`sys-loading`/`tool-current` 必须复用同一枚转轮（当前缺失，P1）。

### 十.2 12 条重锚复核结论

- **可重锚 pass**：W1 行距（`.chat-row` 下内边距 16）、S3 尾行兜底（chip 隐藏时「正在工作」）、W6b 去前缀（`classifyInjected` 已转 label）、S1 截断（需超长目标夹具）、W9 12px/0.9s（新 DOM）、reduced-motion（工作徽标已静态弧）、无第二转轮（改为 `.status-spinner`）。
- **登记设计差异**：S2 chip 由左对齐改为**右对齐阅读列右缘**（chip.right 与 pane.right 对齐；本角色批准，重锚为右缘 ≤8）。
- **真实产品缺口**：W11 loading 转轮、W10 尾行转轮（P1）；W6 注入盒 line-height 1.6（P2）。
- **未落地**：新 DOM 多数已在（`.chat-row` 内边距、`tool-current`、`mi-body`/`mi-chip`、`tool-records`、`.status-spinner`、Motion），但可复核的等价测量只有工作徽标与 chip 右对齐；其余仍需测试选择器/夹具/测量口径，测试仍用旧 `.spin-arc`，不能按“已重锚”记 pass。

### 十.3 5B 前必须（与 4B 相关）

1. **P0 200% 输入区不可达**：`#chat` 随虚拟转录总高撑开，composer 被推到 5,075–1,341,790px；200% 长历史下输入区实际不可达。需保持聊天内部滚动/输入区贴底，补可达性断言。
2. **P1 200% 错误态横滚**：无角色/会话失败态中栏横向滚动条；正常态 200% 容器检查未覆盖该状态。
3. **P1 W10/W11 转轮**：`sys-loading`/`tool-current` 补同一 12px 转轮，跑 0.9s/reduced-motion。
4. **P1 密度等价**：清残留+规范化夹具，按 ≥9/≥8/≥4 复测。

**已关闭的旧端 200% 项**：左树可见/滚动、正常态头部/缺配条/输入区无横溢、治理预览 ≤900、Esc 回 `gov-action`、200% 报告/完整摘要/治理预览目标可见。**仍缺**：200% 镜像/交付目标截图；phase4b 冒烟图的「窗口控制不可用」是测试壳标记，不作产品 L pass。

**边界**：本节只读新证据/实现并更新角色文档；未改 app/src/test、其他角色或历史设计；未提交。UIUX 结论不代替测试独立验证/PM 门/独立验收；新端旧 e2e 补充运行 `E2E_PASS=false`（10 项）属测试/桌面UI 行为缺口，不是视觉 pass。

### 十.4 PM §十九 追加（2026-10-21 19:25）

- **BOOTSTRAP**：旧「完成 bootstrap」入口条删除是 2026-10-12 A-5 有意裁定，不补回；但新端把 S0「项目尚未 bootstrap」唯一提及与「开始与 <主入口> 对话」中心 CTA 一并删除，**不是已批准差异**。PM §10.3/§10.7 与 2026-10-18 Liaison §9.2 明确要求保留；桌面UI 需补回。详见 [BOOTSTRAP 空态设计依据](2026-10-21_design_ui-platform-phase5b-bootstrap-empty-state.md)。
- **重锚**：W1/S3/W6b/W6/W9-12px/W10/W11/reduced-motion 新 DOM 基本成立；但 W9/W10/W11 被改成 CSS `@keyframes v3spin`，不是 Motion，违反 Nova §7.1 与 PM §十九重锚要求；密度规范夹具、S2 右缘、旧审计选择器仍未落地。详见 [重锚落地复核](2026-10-21_design_ui-platform-phase5b-reanchor-review.md)。
- **新候选修复**：`d1f76147…` 5A 冒烟 19/19，200% 长历史 composer 可达、空态无横溢（长会话失败文案仍需定向复测）；完整 A–L 待冻结后按新 hash 重跑。

### 十.5 冻结候选最终审计（2026-10-21 20:25）

候选冻结 `c9d13918/f568e2aa/57d9575c` 后重跑：design audit 31/31、带提示条密度 8/576.4（测试夹具 11/539.4）、5A 冒烟 24/24、4B 冒烟 70/70、main E2E_PASS=true、51 张三档截图。**P0 与旧 P1 清零**（长历史 composer 可达、200% 失败态无横滚、BusySpinner Motion、密度/1.6、镜像交付 200）。**新 P1**：200%（480/680 CSS）sticky composer 遮挡报告卡/完整摘要/治理预览/镜像卡动作；目标截图只剩顶部，computed 检查只验宽度/存在。结论 **needs-work（P0 0、P1 1、P2 3）**，5A 门未通过。详见 [冻结候选最终审计](2026-10-21_design_ui-platform-phase5b-final-audit.md)。

**最终生产入口（2026-10-21 21:15，`app/renderer/dist/index.html`，`3c4da2a2/f568e2aa/76fad7ce`）**：5A 36/36（680/480 遮挡门全过）、4B 70/70、design audit 31/31、带提示条密度 32/32、main E2E_PASS；480 composer/header 无横溢，报告/详情/预览/镜像/交付/S0 目标 bottom ≤ composer.top。**P0/P1 清零，结论 pass（P2 5 条登记：480 镜像 chip/动作重叠、480 完整卡片标题在视口外、480 缺配条下半/按钮被 composer 覆盖、main 3× 200 截图位/命名、harness 标记）**。详见 [最终审计](2026-10-21_design_ui-platform-phase5b-final-audit.md) §十一。
