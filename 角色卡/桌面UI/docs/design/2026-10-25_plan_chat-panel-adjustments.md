---
id: chat-panel-adjustments-plan
type: design
title: 聊天面板细节调整·桌面UI实施计划
created: "2026-10-25"
updated: "2026-10-25"
timezone: Asia/Shanghai
status: implemented-unverified
related: []
events:
  - date: "2026-10-25"
    kind: created
    summary: 依据 UI/UX 评审与桌面窗口对齐计划，产出桌面UI逐项实施计划；仅计划，未改应用代码
  - date: "2026-10-25"
    kind: implementation
    summary: 按本计划实施 A0/A1/A2/A3(UI 侧)/A4/B1–B5(UI 侧)/C1–C5；typecheck 两档、214 项桌面UI单测与 build:renderer 通过；真实 Electron 视觉/宽屏推挤/200% 对比度未验证
  - date: "2026-10-25"
    kind: implementation
    summary: 项目管理补齐共享 i18n 后收尾：A2 用 ui.work.pendingTitle + 计数 badge；B1 用 ui.composer.trustGroupTitle 可见分组标题；A0 显示 ui.judge.autoSource 与 ui.judge.autoNotCustomerNote；A3 statusCode 经 ui.projection.status.* 本地化（缺值回退 statusText）；同步 UI 单测与写集内 e2e 文案；215 项桌面UI单测、两档 typecheck、build:renderer 通过
---

# 聊天面板细节调整·桌面UI实施计划（2026-10-25）

**依据**：UI/UX 评审 [`2026-10-25_review_chat-panel-details/report.md`](../../../UIUX设计师/docs/design/2026-10-25_review_chat-panel-details/report.md)；桌面窗口对齐计划 [`桌面窗口 2026-10-25_plan_chat-panel-adjustments.md`](../../../桌面窗口/docs/design/2026-10-25_plan_chat-panel-adjustments.md)（`ClientProjectionV1` / `fingerprint`）。

**状态：已实施（未验证）。** 计划写完后按计划改完 UI 侧代码；实施结果见 §7。真实 Electron 视觉、宽屏推挤与 200% 对比度未验证。不 commit、不 push、不重启 app。

## 0. 场景与目标

客户在主理聊天面板里看到的问题：一条自动代批结论只是普通文字；上下文状态重复两处；工作概览里的「待处理 0」和真实待处理看起来一样；治理反馈把「不要转述」这类内部指令原样露给客户；同一验收状态在助手消息、治理反馈、轮次结束行里重复；托管开关只有 11px 小字；抽屉盖住聊天和头部按钮；助手消息没有角色/时间；术语混杂。

完成后：客户一眼能分清「judge 自动代批」和「客户手批」；同一条上下文状态只出现一处；工作概览的空态和真实项有明确视觉差别；治理反馈只展示客户可读投影（内部原文折叠可查）；同一指纹的重复状态合并成一张卡并显示 `×N`；托管开关是清楚的 chip；宽屏抽屉推挤聊天列而不是覆盖；助手消息有角色与时间（拿不到时间就不显示）；能在本角色写集内统一的术语先统一，其余列出跨角色依赖。

## 1. 写集与红线

**可写（本角色 boundary Section 1）**：

- `app/renderer/src/**`（React 源码、样式、渲染层 tsconfig 之外的运行代码）
- `test/桌面UI/**`（纯逻辑/组件守卫测试）
- `角色卡/桌面UI/docs/design/**`（本文件）

**不写**：`app/desktop/`、`app/main.ts`、`app/preload.cjs`（桌面窗口）；`src/common/shared/**`（项目管理，含 `i18n/messages/zh-CN.ts`、`en-US.ts`、`keys.ts`）；`package.json`、根 `tsconfig.json`（装配）；`.env`、目标项目、demo。

**红线**：渲染进程不接触 Node/fs；不新增第二份写资格判定；不假造主进程未提供的字段；不改既有 e2e 依赖的 id/class/文案（`#context-state`、`#history-projection-note`、`auto-approve-toggle`、`auto-approve-label`、`judge-decision-toggle`、`judge-decision-label`、`.composer-auto-approve`、`#drawer-close`、`#drawer-title`、`.work-heading`、`#right-queue-body`、`.recent-report`、`.turn-terminal`、`.governance-judge-row` 等）。

## 2. 与桌面窗口的接口对齐（先写接口，UI 可缺省）

桌面窗口已在其计划 §3 定义事件层可选字段：`prompt-input` 的 `event.detail.clientProjection`（`GovernanceClientProjectionV1`）：

```ts
interface GovernanceClientProjectionV1 {
  version: 1;
  kind: "governance-feedback";
  fingerprint: string; // 同来源/状态/流程/指针/正文 ⇒ 同值
  sourceRole: { roleId: string; displayName: string };
  statusCode: "completed" | "failed" | "aborted" | "timed_out" | "unknown" | "internal-feedback";
  statusText: string;  // 主进程已本地化的状态文本，可作兼容兜底
  flowIds?: string[];
  reportPath?: string;
  governancePath?: string;
  action: "report-ready" | "await-lead-summary";
}
```

UI 侧约定：

- 只在 `detail.clientProjection` 通过形状校验（`version===1`、`kind==="governance-feedback"`、`fingerprint` 非空、`sourceRole` 有 `roleId`、`statusCode` 在枚举内、`action` 在枚举内）时消费；否则完全走旧文本归类（`classifyInjected`），行为不变。
- UI 不持久化投影；恢复/回放行没有投影时按旧文本显示。
- 投影的 `statusText`、`sourceRole.displayName`、路径是**数据**，直接按文本呈现；`statusCode` 目前不新造 i18n 文案（见 §4 B5 依赖）。
- `fingerprint` 只用于**连续**同值注入行的合并计数；跨行不合并，不改变已有事实行。

## 3. 逐项计划

### A0 代批结果行 → 可辨识的代批状态卡/徽标（P0，优先）

- **现状**：`app/renderer/src/chat/judge.ts:423` 的 `governanceJudgeResultView` 已产出 title/headline/flow/engine/operator/details；`ChatRow.tsx` 的 `GovernanceJudgeResultBody` 把它渲染成与普通 `.sys` 行同级的文字（标题仅琥珀色，`shell.css:1928`）。
- **目标**：渲染成独立卡片：琥珀「judge 代批 · 代审批/代决策」徽标（复用现有 `ui.judge.titlePrefix` 文案，不冒充客户手批）+ 决策类型主行（`headline`，如「验收通过（accept）」）+ 流程 chip（`flowText`）+ 来源（判断引擎 `engineText`、`operatorText`）+ 时间（`shortTime(at)`）+ 可展开详情（理由/选中项/路径/逐路径结论/证据/统计，保持现有内容）。使用 lucide `Bot` 图标标识自动代理来源；卡片用 `--warning-bg/--warning-border/--warning` 令牌，不新增色值。
- **改动文件**：`app/renderer/src/chat/judge.ts`（增加纯展示分类字段 `kindClass`/`isAuto`，不改变现有字段语义）、`app/renderer/src/chat/ChatRow.tsx`（`GovernanceJudgeResultBody` 结构与图标）、`app/renderer/src/shell/shell.css`（`.governance-judge-row` 卡片样式，保留 `.sj-*` 详情样式）。
- **测试**：`test/桌面UI/judge.test.ts` 增加 `kindClass`/`isAuto` 断言；既有 title/headline/flow 逐字断言不变。保留 `governance-judge-row` 外层 class 与 `data-tool-call-id`，现有 e2e 的 `textContent.includes('judge 代批 · 代决策')` 等继续成立。
- **依赖**：无（文案复用现有 key）。若要在卡内加「自动代批 ≠ 客户手批」独立说明句，需要项目管理在共享 i18n 增 key；本轮不做，徽标与 title 已明确「judge 代批」。

### A1 上下文状态重复（P0）

- **现状**：`ChatHeader.tsx:100-108` 的 `#context-state`（`role=status` + `aria-live=polite`）与 `App.tsx:124-138` 的 `#history-projection-note` 都渲染同一份 `paneMeta[roleId].contextText`；`chat-store.ts:1689` 把历史投影诊断（`historyProjectionText`）也塞进了 `contextText`。
- **目标**：`#context-state` 只显示真正的上下文状态；历史投影诊断（报告不可读/省略/无效/跳过等）只显示在 `#history-projection-note`。两者不再重复。上下文状态保持单一 live region（`#context-state`）；投影诊断有内容时自己是 `role=status`，没内容时隐藏。
- **改动文件**：`app/renderer/src/chat/types.ts`（`PaneMeta.projectionText?: string`）、`app/renderer/src/chat/chat-store.ts`（applyHistory 同时写 `contextText: meta.contextText` 与 `projectionText`）、`app/renderer/src/App.tsx`（仅渲染 `projectionText`，移除 `.session-notice` 的 `role=status`）。
- **测试**：既有 `history-projection-note` e2e 断言仍能读到投影文本（元素保留、注入文本仍在 DOM）；`context-state` 的 e2e 断言（新会话/恢复失败/标题 tooltip）不受影响。新增纯逻辑断言可选：验证 `historyProjectionText` 与 `meta.contextText` 分离后的 PaneMeta 形状（如抽出小型纯函数则加测）。
- **依赖**：无。

### A2 工作概览「待处理」纯文字（P0）

- **现状**：`WorkOverview.tsx:78-106` 用 13px 标题 + 普通 `<p class="muted small">` 空态；0 与有数据视觉无差别。
- **目标**：统一 `WorkSection` 结构（图标 + 标题 + 状态点）；待处理项用 kind chip + 标题 + 定位按钮（带 14px 图标）；空态改成 48–56px 虚线浅色卡（`.work-empty`），0（中性点）与 >0（琥珀点）视觉可区分；区块间加分隔线；所有内容仍用现有 i18n key（标题自带计数，避免重复数字；真正的「纯数字 badge」需要无计数的标题 key，见依赖）。全部为空时（待处理 0、队列 0、最近交付 0）显示一张 `.work-empty-overview` 总空态卡，三个空态文案仍保留在各自区块 DOM 内（用 `hidden` 保留 textContent 供既有 e2e 断言），视觉上只出现一张卡。
- **改动文件**：`app/renderer/src/shell/WorkOverview.tsx`、`app/renderer/src/shell/phase4a.css`；可选 `app/renderer/src/chat/work-view.ts`（`isWorkOverviewEmpty` 纯函数）。
- **测试**：既有 `#right-queue-body`、`.work-heading`、`.recent-reports`、`无进行中或排队消息`、`待选择` e2e 断言保持；新增 `work-view.test.ts` 的空态判定纯逻辑测试。不添加 `details[data-section]`（e2e 明确禁止）。
- **依赖**：项目管理 i18n 若提供「待处理」无计数 key，可把计数移入独立 badge；本轮用现有 key + 状态点。

### A3 客户端可读投影 / 内部指令折叠（UI 侧）（P0）

- **现状**：`ChatRow.tsx:450-476` 的 `InjectedRow` 对 `kind==="system"` 直接渲染 `data.body`，治理反馈内部指令原样展示；`chat-store` 只存文本。
- **目标**：按 §2 消费 `detail.clientProjection`。有投影时渲染 `.mi-projection` 卡：chip（现有 label）+ 来源角色 displayName + `statusText` + `flowIds`（`ui.judge.flowText`）+ `reportPath`/`governancePath`（等宽路径行）+ `×N`（同指纹合并时）；内部原文放进默认折叠的 `<details class="mi-raw">`（summary 用数据 `foldLabel`，缺省用现有 label），保留 `.mi-body` 供审计/DOM 证据，不默认展开。无投影（旧事件/恢复行）完全走现有渲染，不猜字段。
- **改动文件**：`app/renderer/src/chat/events.ts`（校验并附带 `clientProjection`；prompt-input 与历史行两条路径）、`app/renderer/src/chat/types.ts`（`ClientProjectionV1` 消费类型；`InjectedMessage` 可选字段）、`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/shell/shell.css`（`.mi-projection`/`.mi-raw`）。
- **测试**：`test/桌面UI/event-routing.test.ts` 增加：带合法 projection 的 prompt-input → injected row 含投影；非法/缺字段 → 无投影且行与现在一致；历史行带投影 → 同样消费。新的投影合并纯函数（见 A4）单测。既有注入行 e2e（`.msg-injected.is-system .mi-body`、`.mi-chip`、handback `.mi-body`）保持。
- **依赖**：桌面窗口实施 `detail.clientProjection`（其计划 §3/§4）。UI 先按可缺省字段实现；该字段未落地前行为与现在一致，不假造。

### A4 同内容状态行合并 / 轮次结束低强调（P0/P1）

- **现状**：`row-model` 已按同 `turnId`+`outcome` 把终态合成一条（`sources[]`），但 `TurnTerminalRow` 把每条 source 逐行显示，仍像正文；同一治理状态跨事件重复，UI 没有指纹可用。
- **目标**：
  1. `TurnTerminalRow` 改成每轮一条低强调分隔线（顶部细线、11.5px、`--text-3`），主行显示第一条 source；`sources.length > 1` 时显示 `×N` 计数，并把全部 source 收进可展开 `<details>`（沿用 `ui.chatRow.evidence` 作为「证据/来源」summary 的兜底文案）。`.sys-text` 在单 source 时仍逐字等于原文，满足既有 e2e。
  2. 注入投影行按 `fingerprint` **连续**合并：仅当上一条行也是带同一 `fingerprint` 的 injected 行时，不新增行，改为 `projectionCount += 1` 并记录有界 `occurrences: [{at, turnId}]`；显示 `×N`。不同指纹/中间隔了别的行不合并。
  3. 不合并跨轮的助手消息或不同 outcome 的终态行——它们是不同事实，既有 e2e 明确要求保留（`different actual turns retain two independent terminal records` 等）。
- **改动文件**：`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/chat/events.ts`（纯合并函数）、`app/renderer/src/chat/chat-store.ts`（appendDescriptor 的 injected 分支使用合并函数）、`app/renderer/src/shell/shell.css`。
- **测试**：`test/桌面UI/client-projection.test.ts`（或 event-routing）验证同指纹合并、不同指纹不合并、中间隔行不合并、occurrences 上限；`history-dedupe`/`event-routing` 既有断言不变。
- **依赖**：跨事件稳定 `fingerprint` 来自桌面窗口（其计划已提供）；未提供时只有同 turn 终态行合并（现有行为）+ 分隔线样式。

### B1 托管开关是行内小字（P1）

- **现状**：`Composer.tsx:689-749` 两个 11px label + 13px checkbox；≤480px 缩成单字「审/决」（`phase4b.css:910-924`）。
- **目标**：两个开关放进 `.composer-trust` 分组（`role="group"`，无可见「托管」标题——需要新 i18n key，列依赖）；每个开关变成 32px 高 chip：lucide 图标（审批 `ShieldCheck`、决策 `Scale`）+ 现有 label 文本 + checkbox；开启态琥珀底/琥珀边框/勾选；保留现有 id、label 文本、`.composer-auto-approve` 与 `is-on` class（e2e 逐字断言不变）；≤480px 保留图标 + 2 字短标签（CSS `::after` 由「审/决」改为「审批/决策」）且不横溢。
- **改动文件**：`app/renderer/src/shell/Composer.tsx`、`app/renderer/src/shell/shell.css`、`app/renderer/src/shell/phase4b.css`。
- **测试**：既有 `phase3b/4b/uiux-v2` 的 label/checked/disabled/warning 断言不变（不跑 app，静态检查 + typecheck）；新增负向无。
- **依赖**：可见「托管」分组标题、「判断 agent→自动代理」文案属共享 i18n（项目管理）；本轮不改文案。

### B2 抽屉覆盖聊天与头部按钮（P1）

- **现状**：`.drawer` 绝对定位覆盖 424px（`shell.css:858-878`），`.drawer-backdrop` 遮罩整个 `.app`。
- **目标**：≥1200px 时抽屉打开给 `.col-mid` 加 `padding-right: var(--drawer-w)`（带过渡），聊天列收窄、头部按钮仍可见、抽屉不再盖住正文；遮罩在宽屏改透明（仍可点击关闭，保持焦点陷阱/inert/aria-modal 不变）；<1200px 保持现有覆盖 + 遮罩。侧栏宽度不动，无需重算 ResizablePanel 百分比。
- **改动文件**：`app/renderer/src/App.tsx`（`.app` 加 `drawer-open` class，订阅 `useUiStore.drawerOpen`）、`app/renderer/src/shell/shell.css`（宽屏规则与过渡）。
- **测试**：既有 e2e 的 `drawer-close` 焦点、`col-mid.inert`、`right-drawer` 宽度 424、无横溢断言不变（通过 CSS 断点隔离）；宽屏效果需真实 app 截图复核（本轮不重启 app，列为未验证）。
- **风险**：`uiux-design-audit` 若在 1360 打开抽屉测量 `.col-mid` 内容宽度，期望值可能变化；实施后若可运行该夹具再核对，否则在报告注明。

### B3 抽屉层级/图标语义（P1）

- **现状**：`WorkOverview.tsx:78-155` 待处理勾选、排队警示圆圈（语义错误）、最近回交无图标。
- **目标**：统一 `WorkSection` 图标：待处理 `Inbox`、当前工作 `PlayCircle`、排队 `ListOrdered`、最近交付 `FileCheck2`；标题/aria 不变；空态统一虚线卡。
- **改动文件**：`app/renderer/src/shell/WorkOverview.tsx`、`app/renderer/src/shell/phase4a.css`。
- **测试**：同 A2（保留 e2e 文本/结构断言）。
- **依赖**：无。

### B4 助手消息无角色归属/时间（P1）

- **现状**：`ChatRow.tsx:148-159` 的 `AssistantRow` 只渲染 Markdown；事件映射 `events.ts:571` 丢弃 `event.at`。
- **目标**：在 `.msg-assistant` **外层**加紧凑 meta（首字头像 + 角色名 + `shortTime(at)`），不改变 `.msg-assistant` 自身 textContent（多处 e2e 逐字断言依赖它）；`at` 缺失时只显示角色名，不伪造时间。实时与历史行都带 `at`（事件/历史行有则透传）。用户消息已有底色，本轮不再改右侧对齐。
- **改动文件**：`app/renderer/src/chat/events.ts`（assistant 行 data 增加可选 `at`）、`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/shell/shell.css`（`.msg-meta`）。
- **测试**：`event-routing.test.ts` 增加 assistant `at` 透传断言（只在有值时出现）；既有 `.msg-assistant` textContent e2e 不变。
- **依赖**：无。

### B5 术语混杂（P1，UI 侧可做部分）

- **现状/目标**：报告要求统一：回交→交付/交接、最近回交→最近交付、回交报告→交付报告、会话结束→本轮结束、判断 agent→自动代理、P1 空闲→状态点 +「空闲」chip、待处理/待办统一。
- **本角色可做**：左树 `.ti-status.st-idle` 增加状态点（CSS 仅视觉，保留「空闲」文案）；「本轮结束」的轮次结束行在 A4 已改为低强调分隔线（文案 key `ui.chatRow.turnEnded` 已是「本轮结束」，无需改）。
- **不能做（越界）**：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`keys.ts` 属项目管理；上述术语改名需要项目管理按跨角色需求更新 key 与两种语言。本计划列出清单，实施时不动共享目录。
- **改动文件**：`app/renderer/src/shell/shell.css`（状态点）；共享 i18n 文件**不改**。
- **测试**：无文案改动，既有 e2e 不受影响；共享 i18n 更新后由项目管理/测试角色复验。
- **依赖**：项目管理（i18n keyowner）。

### C1 治理状态行机器标识密集（P2）

- **现状**：`GovernancePanel.tsx:133-141` 把模型/流程/下一步拼成一个 `.gov-text`，窄屏折行。
- **目标**：模型文本单独 `.gov-chip`，下一步/流程文本为可换行的 `.gov-text`（两行布局）；`#governance-status` 的 `textContent` 仍包含既有完整短语（模型行、pin-mismatch、尚无治理记录等），既有 e2e 断言不变；动作按钮不变。进一步的 flow/next-step 拆 chip 需要 store 提供结构化分段（当前 `nextStep` 是 `" · "` 拼接字符串，不在 UI 解析），列为后续依赖。
- **改动文件**：`app/renderer/src/shell/GovernancePanel.tsx`、`app/renderer/src/shell/phase4b.css`（或 shell.css）。
- **测试**：既有 `governance-status` e2e 文本断言保持；无新增。
- **依赖**：无（更深拆分依赖 governance-store/桌面窗口结构化字段）。

### C2 抽屉关闭按钮（P2）

- **现状**：文字「×」、28px 热区（`Drawer.tsx:214-225`、`shell.css:896-905`）。
- **目标**：lucide `X` 图标（`aria-hidden`），32×32 热区，保留 `id="drawer-close"`、`aria-label`、title 与焦点行为；`drawer-title` 改为真正的 `<h2>`（保留 id/class）。
- **改动文件**：`app/renderer/src/shell/Drawer.tsx`、`app/renderer/src/shell/shell.css`。
- **测试**：既有 `document.activeElement.id==='drawer-close'`、`drawer-title.textContent`、Tab 陷阱 e2e 不变。
- **依赖**：无。

### C3 确认卡按钮层级（P2）

- **现状**：`ConfirmCard.tsx:210-229` 拒绝=绿色主按钮，放行=描边。
- **目标**：两者等权（都用中性描边按钮），保留拒绝按钮默认焦点与 `confirm-default-focus` 焦点安全行为；风险说明文案不变。避免把「放行」做成绿色主按钮的鼓励性视觉。
- **改动文件**：`app/renderer/src/shell/ConfirmCard.tsx`（`sc-deny` variant 改 outline），必要时 `shell.css`。
- **测试**：既有拒绝默认焦点、disabled、Esc/关闭不放行 e2e 不变（只改视觉 variant）。
- **依赖**：无。

### C4 抽屉四行空态（P2）

- 并入 A2：全空时一张 `.work-empty-overview` 总空态卡，各区块空态文本保留在 DOM（`hidden`），视觉上只出现一张卡；非全空时显示区块空态卡。
- **改动文件/测试/依赖**：同 A2。

### C5 小字号/对比度（P2）

- **现状**：空态 11px、开关 11px、chip 10.5px。
- **目标**：新增/涉及文本 ≥12px（`.work-empty` 12px、托管 chip 12px）；辅助 chip 提到 11.5px；沿用现有 token 对比度，不新增色值；≤480px 仍按现有媒体查询收窄，不横溢。200% 缩放的真实对比度需 UIUX/真实 app 复核（本轮不重启 app，列未验证）。
- **改动文件**：`app/renderer/src/shell/shell.css`、`phase4a.css`、`phase4b.css`。
- **测试**：`uiux-design-audit` 的既有 `.mi-body` 1.6 行高等断言不变；字号测量项如与新值冲突，按报告目标更新夹具需另行授权（本轮不改夹具断言）。
- **依赖**：UIUX 视觉复核。

## 4. 阶段

1. **P0 结构与语义（A0/A1/A3 投影消费/A4 合并与分隔线）**：先落纯逻辑（judge view、projection 校验/合并、paneMeta 拆分），再接组件与样式。
2. **P0/P1 工作概览与输入区（A2/B1/B3/C4/C5）**：统一 section、空态卡、托管 chip、状态点。
3. **P1 抽屉与消息（B2/B4/C2/C3）**：宽屏推挤、助手 meta、图标按钮、按钮层级。
4. **P2（C1 + B5 UI 侧）**：治理状态 chip、空闲状态点。
5. **验证**：`npm run typecheck`、`npm run typecheck:renderer`、`node --test test/桌面UI/*.test.ts`（相关子集）、`npm run build:renderer`；记录结果。真实 Electron e2e 不跑（不重启 app）。

## 5. 风险与不做

- **风险**：宽屏推挤改变 1360 抽屉打开时的内容宽度，可能影响未运行的 design-audit 测量；注入投影依赖桌面窗口字段，未落地前 A3 只对旧路径保持原样；共享 i18n 术语未改，B5 只能完成 UI 侧部分；全空合并卡依赖 `hidden` 保留 textContent，若未来 e2e 改为可见性断言需同步。
- **不做**：不合并跨轮助手消息或不同 outcome 终态（事实保留）；不解析本地化拼接字符串来拆分治理流程 chip；不改共享 i18n/主进程/preload；不新增 IPC；不改既有 e2e 断言；不 commit/push。

## 6. 验证与成功标准

- `npm run typecheck` 0 错；`npm run typecheck:renderer` 0 错；`npm run build:renderer` 成功。
- `node --test test/桌面UI/judge.test.ts test/桌面UI/event-routing.test.ts test/桌面UI/work-view.test.ts test/桌面UI/history-dedupe.test.ts`（及新增投影测试）全过。
- `test/桌面UI/source-guard.test.ts` 全过（无 Node/fs、无自绘 SVG、Markdown 单一管线）。
- 既有 DOM 契约 id/class/文案保持不变；新增行为有纯逻辑测试；未验证项（真实 Electron 视觉/宽屏推挤/200% 对比度）在报告中如实标注。

## 7. 实施结果（2026-10-25）

**已实施（UI 侧）**

| 项 | 实际改动 |
| --- | --- |
| A0 | `judge.ts` 增加 `kindClass`/`isAuto`/`sourceLabel`/`customerNote` 纯展示字段；`ChatRow.tsx` 把治理代批结果行改为 `.governance-judge-card`（Bot 图标 + 琥珀「judge 代批 · …」徽标 + `ui.judge.autoSource`「自动代理」来源 chip + 决策主行 + 流程 chip + 引擎/operator/时间 + `ui.judge.autoNotCustomerNote`「自动代批 ≠ 客户手批」说明 + 可展开详情）；`shell.css` 卡片样式。外层 `.governance-judge-row`/`data-tool-call-id` 与既有 textContent 契约保留。 |
| A1 | `PaneMeta` 增加 `projectionText`；`chat-store.applyHistory` 把历史投影诊断与 `contextText` 分开；`App.tsx` 的 `#history-projection-note` 只渲染投影文本（无内容隐藏），`.session-notice` 不再整块 `role=status`，`#context-state` 保持单一上下文 live region。 |
| A2/B3/C4 | `WorkOverview.tsx` 统一 `WorkSection`（图标 + 标题 + 状态点）；待处理标题用无计数 `ui.work.pendingTitle`，计数进独立 `.work-heading-count` badge（0 中性、>0 琥珀；aria-label 在有计数时复用 `ui.work.pending`）；空态改 `.work-empty` 虚线卡；全空时显示一张 `.work-empty-overview` 总空态卡（各区块 `hidden` 保留 DOM 文本）；`work-view.ts` 新增 `isWorkOverviewEmpty`。 |
| A3 | `events.ts` 校验 `detail.clientProjection` 并附到注入行；新增 `chat/projection-view.ts` 把 `statusCode` 经 `ui.projection.status.*` 本地化（六个值逐字映射，未知/缺值回退主进程 `statusText`，不猜）；`ChatRow.tsx` 有投影时渲染 `.mi-projection`（来源角色/本地化状态/流程/报告与治理路径），内部原文折叠进 `.mi-raw`（`.mi-body` 仍在 DOM）；无投影走旧渲染。 |
| A4 | `events.ts` 新增 `mergeClientProjectionData`（同指纹、只合并连续注入行、occurrences 最多 8 条）；`chat-store.appendDescriptor` 合并到上一行并累计 `projectionCount`；`TurnTerminalRow` 改低强调分隔线，同轮多来源显示 `×N` 并收进可展开 `<details>`。跨轮/不同 outcome 的终态仍分开。 |
| B1 | `Composer.tsx` 双开关包进 `.composer-trust`（`role=group`），加可见分组标题与 `aria-label` `ui.composer.trustGroupTitle`（「托管」），加 `ShieldCheck`/`Scale` 图标与 32px chip 样式；id、label 文本、`is-on` class 不变；≤480px 短标签改「审批/决策」，分组标题保留、不退化；200% 极窄档只省略装饰图标（复选框/短标签/标题保留），保证 composer 无横向溢出。 |
| B2 | `App.tsx` 在 `.app` 增加 `drawer-open`；`shell.css` ≥1200px 给 `.col-mid` 增加 `padding-right: var(--drawer-w)`（带过渡），宽屏遮罩透明；窄屏保持覆盖 + 遮罩；焦点陷阱/inert/aria-modal 不变。 |
| B4 | `events.ts` 的 assistant 行透传可选 `at`；`ChatRow.tsx` 在 `.msg-assistant` 外层加 `.msg-meta`（首字头像 + 角色名 + 短时间，缺时间不显示）；`.msg-assistant` 自身 textContent 不变。 |
| B5（UI 侧） | 共享 i18n 已由项目管理更新（回交→交付、会话结束→本轮结束、判断 agent→自动代理、待办→待处理等）；本侧确认可见文案全部经 key/数据渲染，唯一保留的旧词是 `events.ts` 的 `[回交]` **协议前缀**（分类必需，不是 UI 文案）；左树 `.ti-status.st-idle` 加状态点；写集内单测/e2e 的旧文案字面量已同步。 |
| C1 | `GovernancePanel.tsx` 正常模型态拆为 `.gov-chip`（模型文本）+ `.gov-detail`（流程/下一步）；异常态保持原单行完整文案；`phase4b.css` 增 chip 样式。 |
| C2 | `Drawer.tsx` 关闭按钮改 lucide `X`（32px 热区），标题改 `<h2 id="drawer-title">`；`shell.css` 同步。 |
| C3 | `ConfirmCard.tsx` 的拒绝按钮改 `variant="outline"`（与放行等权），保留拒绝默认焦点与 `confirm-default-focus`。 |
| C5 | 工作概览空态 12px、托管 chip 12px、chip 11.5px；未新增色值。 |

**改动文件**：`app/renderer/src/{App.tsx, chat/ChatRow.tsx, chat/chat-store.ts, chat/events.ts, chat/judge.ts, chat/types.ts, chat/projection-view.ts(新增), chat/work-view.ts, shell/Composer.tsx, shell/ConfirmCard.tsx, shell/Drawer.tsx, shell/GovernancePanel.tsx, shell/WorkOverview.tsx, shell/shell.css, shell/phase4a.css, shell/phase4b.css}`；测试 `test/桌面UI/{judge.test.ts, work-view.test.ts, client-projection.test.ts(新增), report-view.test.ts, status.test.ts, i18n-b1-b2.test.ts}` 与写集内 e2e `test/桌面UI/{phase3b,phase4a,phase4b,phase5a}-electron-smoke.mjs`、`test/桌面应用/e2e/uiux-v2.mjs` 的文案字面量。

**验证结果（第二轮收尾后）**

- `npm run typecheck`：通过（0 错）。
- `npm run typecheck:renderer`：通过（0 错）。
- `node --test test/桌面UI/*.test.ts`：215 项全过（含新增投影校验/合并/statusCode 本地化测试）。
- `npm run build:renderer`：成功（2664 modules；仅既有 >500kB chunk 提示）。
- 未运行：真实 Electron e2e/`uiux-design-audit`/`uiux-v2`/宽屏与 200% 截图（不重启 app）。

**未完成/依赖**

- **桌面窗口**：A3/A4 的 `detail.clientProjection` 由其并行实施（本工作树已见 `app/desktop/session.ts` 改动）；本侧字段与其实施一致，未落地时 UI 自动回退旧行为。
- **共享 i18n**：项目管理已补齐本轮所需 key（`ui.work.pendingTitle`、`ui.composer.trustGroupTitle`、`ui.judge.autoSource`、`ui.judge.autoNotCustomerNote`、`ui.projection.status.*` 及 B5 术语值）；本角色未改 i18n。
- **其他角色测试**：共享 i18n 术语变更后，桌面窗口/测试角色拥有的 `test/桌面应用/e2e/main.mjs`、`test/桌面应用/handback-delivery.test.ts` 等仍可能有旧文案断言（如「回交投递 · 本批」「已自动投递 X 的回交」），不在本角色写集，需其 owner 同步。
- **UIUX/验收**：宽屏推挤、200% 对比度、A0/A2 视觉需真实 app 复核；助手 meta 会增加 transcript 高度，若 `uiux-design-audit` 的阈值断言失败需同步夹具（本轮未改夹具）。

**偏差与理由**

- A2 未做纯数字 badge：现有标题 key 自带计数，另加 badge 会重复数字；改用状态点 + 空态卡区分，待共享 i18n 提供无计数 key 后再加。
- A4 未合并跨轮助手消息或不同 outcome 终态：它们是不同事实，且既有 e2e 明确要求保留；同轮多来源已合并显示 `×N`。
- C4 的「总空态卡」实现为：全空时一张卡 + 各区块 `hidden` 保留 DOM 文本，以同时满足视觉合并与既有 textContent 断言。
- A3 旧事件（无投影）保持原样显示，不按文案猜测是否内部反馈；待桌面窗口投影落地后自动切换为投影卡。

