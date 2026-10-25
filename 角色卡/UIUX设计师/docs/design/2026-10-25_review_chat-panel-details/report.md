# 主理聊天面板 UI/UX 评审（2026-10-25）

> 角色：UIUX设计师。证据来自真实运行中的 app（项目 `bookmark-manager`）截图、DOM 与 `app/renderer/src` 源码。未修改产品代码/测试，未 commit/push。

## 0. 关键更正：客户说的“待批”实为“judge 代批”结果行

- 全仓检索 `待批` 为 0；但截图 `12_daipi-message.png` 明确显示主理聊天中的实际文案：
  **“judge 代批 · 代决策：验收通过（accept）· 流程 bookmark-manager-v1”**
- 这是一条**治理代批结果行**，源码在 `app/renderer/src/chat/judge.ts:423`（治理代批结果行视图，`session:operator-judge`），样式在 `app/renderer/src/shell/shell.css:1928`（“标题用琥珀，不冒充客户手批”）。目前它基本是**普通文字/标题行**，没有独立的状态徽标、卡片、来源/动作分组或清楚的“自动代批≠客户手批”结构。
- 因此：客户说的“待批居然是直接文字显示”，最可能是这行 **“judge 代批”**（自动代批）被当成了普通文字；建议做成明确的 **代批状态卡/徽标**（自动代理来源、决策类型 accept、流程、时间/可展开详情），不要只加粗一行字。
- 其他候选仍保留：工作概览“待处理 0”、输入区“替我审批中/替我决策中”、角色树“P1 空闲”；但截图 12 的证据优先级最高。

## 1. 待批/代批定位结论（完整）

- 源码 `待批` 0 命中；旧调查的 `liaison-term-contexts.json` 也 0 命中。
- **高置信实际元素**：`12_daipi-message.png` 的 `judge 代批 · 代决策：验收通过（accept）` 结果行（见上 §0）。
- **次高候选（仍可能是客户口语）**：工作概览抽屉的「待处理 {count}」标题 +「无待处理请求」空态（`WorkOverview.tsx:68,78-106`，`zh-CN.ts:206,214`，`phase4a.css:111-117,501-515`）；输入区「替我审批中 · 判断 agent / 替我决策中 · 判断 agent」（`Composer.tsx:689-749`）；角色树/资料「P1 空闲」（`dom-evidence.json` sidebarRow/profileStatus）；角色资料「待办 / 队列」（`ProfilePanel.tsx:355-386`，`02_profile-panel.png`）。
- 建议请客户在截图 12 或工作概览上圈一次；A0/A2/B1 的修复会覆盖所有候选。

## 2. Top 问题（按严重度）

### P0

- **A0 代批结果行只有普通文字**：`12_daipi-message.png`；`chat/judge.ts:423`、`shell.css:1928`。建议改成代批状态卡/徽标：自动代理来源 + 决策类型（accept/拒绝/写入）+ 流程 + 可展开原因/回执，明确“自动代批不等于客户手批”。
- **A1 上下文状态重复**：`00_current-view.png`、`01_work-overview.png`、`15_bottom-duplicates.png`；`ChatHeader.tsx:100-108`、`App.tsx:124-138`。标题下“已从本地恢复模型上下文”显示两次且双 live region。建议只保留一处状态 chip（失败原因进 tooltip），单一 `aria-live`。
- **A2 工作概览“待处理”纯文字**：`01_work-overview.png`、`02_profile-panel.png`；`WorkOverview.tsx:78-106`、`phase4a.css:501-515`。无 badge/chip/空态卡片；0 与有数据视觉无差别。建议 14px 图标 + 12px/600 标题 + 数字 badge（>0 琥珀、0 中性）；非空条目 kind chip + 标题 + 定位；空态虚线浅色卡（48–56px）；区块分隔线。
- **A3 治理反馈把内部指令原样展示给客户**：`00/01` 治理反馈卡片；`ChatRow.tsx:450-476`、`shell.css:1677-1704`、`dom-evidence.json.injectedFeedback`。截图可见“来自 验收 的验收状态…请只向客户说明…不要转述…”等提示词。建议 UI 只渲染客户投影（状态、报告链接、需客户动作），内部指令折叠或默认不渲染；缺少可读投影时由桌面窗口补字段。
- **A4 同一验收状态重复三遍 + 每轮“会话结束”**：`00/01/12/15`。助手消息、治理反馈块、“本轮第三份同内容状态通知”重复；`TurnTerminalRow`（`ChatRow.tsx:680-706`）直接渲染 settled summary（`service/runtime/session.ts:366`、`provider/pi/session.ts:240`）。建议连续同 flowId/同内容哈希状态合并为一张卡 + `×3` 计数，可展开；会话结束改为每轮一条低强调分隔线；报告路径只保留一个权威入口。

### P1

- **B1 托管开关是行内小字**：`00/01/18`；`Composer.tsx:689-749`、`shell.css:694-737`、`phase4b.css:910-924`。11px 文字 + 13px checkbox；≤480px 缩成单字“审/决”。建议“托管”分组 + 两个 toggle chip（图标 + 替我审批/替我决策），开启态琥珀底 + 勾选；32px 热区；窄屏图标 + 2 字短标签；“判断 agent”改“自动代理/判断代理”。
- **B2 抽屉覆盖聊天与头部按钮**：`01_work-overview.png` 正文被截断、触发按钮被盖；`Drawer.tsx:1-8,191-253`、`shell.css:858-878`、`index.css:72,76`（content-max 900、drawer 424）。建议 ≥1200px 推挤/收窄聊天列；窄屏遮罩；入口在抽屉打开时仍可见。
- **B3 抽屉层级/图标语义不一致**：`01`；`WorkOverview.tsx:78-155`、`phase4a.css:495-515,669-697`。待处理用勾选、排队用警示圆圈（语义错误）、最近回交无图标；空“当前工作”隐藏。建议统一 section 组件、排队改队列图标、回交用交付/回退图标。
- **B4 助手消息无角色归属/时间**：`00/01/12`；`ChatRow.tsx:148-159` 只渲染 Markdown。建议每轮一次紧凑 meta（头像/首字 + 角色名 + 短时间）；用户消息右侧或底色。
- **B5 术语混杂**：`00/01/02`；`zh-CN.ts:213-216,635,648,654`。建议统一：回交→交付/交接、最近回交→最近交付、回交报告→交付报告、会话结束→本轮结束、判断 agent→自动代理、P1 空闲→状态点 + “空闲” chip、待处理/待办统一。

### P2

- **C1 治理状态行机器标识密集**：`00`、`18_narrow-800.png` 折行；`GovernancePanel.tsx:133-141`。建议主信息只留“三权 · 五角色”，下一步/流程拆成带标签 chip 或收进详情。
- **C2 抽屉关闭按钮**：文字“×”、28px 热区（`Drawer.tsx:214-225`、`shell.css:896-905`）；建议 Lucide X、32px 热区、标题真正 heading。
- **C3 确认卡按钮层级**：`03_confirm-card-demo.png`（演示数据）；`ConfirmCard.tsx:210-229`。拒绝为绿色主按钮、放行执行为描边；保留焦点安全行为，但视觉上拒绝用中性描边、放行执行用带风险提示的主按钮或两者等权。
- **C4 抽屉四行空态**：`01`；建议合并为一个总空态卡 + 次级入口。
- **C5 小字号/对比度**：空态 11px、开关 11px、chip 10.5px（`phase4a.css:111-117,694-697`、`shell.css:694-737`）；建议正文/空态 ≥12px、辅助 ≥11.5px，核对深色对比度与 200% 缩放。

## 3. 需要桌面UI / 桌面窗口实现的具体项

**桌面UI（app/renderer，另行授权）**
- A0 `chat/judge.ts` 代批结果行改状态卡/徽标；`shell.css` 视觉。
- A1 合并 `App.tsx:124-138` 重复状态、单一 live region。
- A2/B3/C4 重构 `WorkOverview.tsx` + `phase4a.css` 为统一 section/空态卡片。
- A3 `ChatRow.tsx` 的 `InjectedRow` 增客户可读投影分支，内部指令折叠。
- A4 行模型层合并同内容状态行；`TurnTerminalRow` 改分隔样式。
- B1/B5 `Composer.tsx` 托管分组 chip + `shell.css`/`phase4b.css` 窄屏规则 + `zh-CN.ts` 文案。
- B2 `Drawer.tsx`/`shell.css` 宽屏推挤布局。
- B4 `AssistantRow` 角色/时间 meta。
- C1/C2/C3 `GovernancePanel`、`Drawer`、`ConfirmCard` 层级/图标/按钮调整。

**桌面窗口（app/main、app/desktop、preload）**
- A3 若事件载荷只有内部 body，主进程需提供结构化客户投影字段（状态、报告路径、动作），内部原文仅供审计。
- A4 若要源头去重，需要投递/事件层提供稳定 fingerprint；UI 视觉合并可先落地。
- A1 单一权威 `contextText` 已在 renderer 可读，仅需 UI 收敛。

## 4. 未验证 / 边界

- “待批”是客户口语；截图 12 的 `judge 代批` 为最高置信对应，仍建议客户圈选确认。
- 未执行 `cdp.mjs`，未重新测量 480/900/1366 之外状态；`03` 确认卡为演示数据。
- 运行时是否已有 `displayBody` 投影未追到生产者；A3 的桌面窗口改动需实现角色确认字段。

## 5. 证据与路径

- 本报告：`角色卡/UIUX设计师/docs/design/2026-10-25_review_chat-panel-details/report.md`
- 关键截图：同目录 `12_daipi-message.png`（代批结果行）、`00_current-view.png`、`01_work-overview.png`、`02_profile-panel.png`、`03_confirm-card-demo.png`、`15_bottom-duplicates.png`、`18_narrow-800.png`
- 其他证据：同目录 `dom-evidence.json`、`liaison-term-contexts.json` 及 04–14 截图
- 关键源码：`app/renderer/src/chat/judge.ts`、`chat/ChatRow.tsx`、`shell/WorkOverview.tsx`、`shell/ChatHeader.tsx`、`shell/Composer.tsx`、`shell/Drawer.tsx`、`shell/ConfirmCard.tsx`、`shell/GovernancePanel.tsx`、`app/renderer/src/App.tsx`、`app/renderer/src/shell/*.css`、`src/common/shared/i18n/messages/zh-CN.ts`
