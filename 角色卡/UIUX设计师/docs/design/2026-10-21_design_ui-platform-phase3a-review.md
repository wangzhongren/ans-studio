---
id: ui-platform-phase3a-review
type: design
title: Phase 3A 聊天流核心设计对齐评审（Nova × 深色石墨）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-nova, ui-platform-phase3a-chat, ui-contract-surface, ui-platform-phase2-review]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对 Phase 3A 聊天流核心（真实 listing/列表/历史/虚拟窗口/工具行/状态/operator 卡/IME）完成只读设计对齐评审；结论 needs-work，7 项 Phase 3B 前必须，其余可随 Phase 4
  - date: "2026-10-21"
    kind: reviewed
    summary: Phase 3A2 修正复核通过（设计对齐 pass）：Markdown 排版、回放/受阻、工具时间/超时色/异常摘要/chevron、choice 40px/selected/accent/input 边、虚拟状态保持、空态 CTA、sys-config 危险色均实测；剩余 UI 打磨按 Phase 4
---

# Phase 3A 聊天流核心设计对齐评审

**评审对象**：桌面UI 的 [Phase 3A 聊天流核心变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)（status: implemented-unverified，2026-10-21），证据 [2026-10-21-phase3a-evidence](../../../桌面UI/docs/change/2026-10-21-phase3a-evidence/)，实现 `app/renderer/src/chat/*`、`shell/Sidebar`、`shell/Composer`、`shell/shell.css`，契约面 [ui-contract-surface](../../../桌面UI/docs/feature/ui-contract-surface.md)。
**设计依据**：[Nova × 深色石墨规范](2026-10-21_design_ui-platform-nova.md)（status: designed，revision 1）。
**评审性质**：只读实现、截图与冒烟/基准证据；未改 `app/` 代码、未跑真实模型或网络、未提交。本文是设计对齐意见，不是产品验收、测试结论或实施授权。

## 一、结论

> **3A2 更新（2026-10-21）**：下述 7 项 Phase 3B 前必须已由桌面UI 修正并复核通过（设计对齐 **pass**）；本节保留为 Phase 3A 当轮结论，最新实测与剩余项见文末「3A2 复核」。

**needs-work（不通过设计对齐，需修正后复核）。** 聊天流核心的结构、虚拟窗口、状态优先级、operator 锚点、IME 与安全 Markdown 都做对了；15/27、900 列、16px 行距也成立。但聊天行与工具行有几处**从旧基线回退的可见问题**，且 operator choice 卡的可用性/虚拟状态保持不足。以下 **7 项 Phase 3B 前必须**：

1. **Markdown 排版缺失**：`.msg h1/h2/h3`、`ul/ol`、`blockquote`、完整表格样式没有迁移；标题会落回浏览器默认大字号，表格没有表头实底/完整外框，破坏 15/27 阅读层级。
2. **回放/受阻状态未呈现**：`.is-replay` 没有任何 CSS（旧基线 `opacity:.88`）；`.msg-handback.is-blocked` 没有危险左边线（旧基线 3px danger），未完成的回交看起来和成功报告一样。
3. **工具行事实与折叠退化**：`.tool-activity` 保留 42px 时间列但 `ActivityRow` 渲染空 `<span>`；`timed-out` 状态没有语义色类；折叠的 `ActivitiesRow` 摘要只显示「N 个调用」，失败/未放行只在展开后可见；`.tool-records`/`.tool-call-record` 没有旧 `›` 式展开指示。
4. **Operator choice 卡可用性**：选项行没有最小高度/内边距/hover（旧 `.op-option` 56px），原生 radio/checkbox 没有 `accent-color` 令牌；中性「拒绝/取消」按钮用 `--border-strong`（1.74:1）而非 `--input`（3.37:1）。
5. **虚拟行状态不保持**：`chat-store` 给 operator/handback/injected 标了 `keepEl`，但 `VirtualPane` 未消费；离屏再回来时 operator 已选选项、handback/工具组 `<details>` 开合状态会丢失。旧渲染器明确保留这些元素实例。
6. **空态「开始对话」CTA 无样式**：`ChatStream` 使用 `className="btn btn-primary chat-cta"`，但新 shell.css 只有 `.chat-cta`，没有 `.btn`/`.btn-primary`；在深色界面会渲染为浏览器默认按钮。
7. **`sys-config` 错误不带危险色**：`chat-store` 用 `sys-config` 呈现「开启会话失败/历史恢复失败」，旧基线 `.sys-config` 为 danger；新 shell.css 没有该规则，错误行呈灰色。

其余为可随 Phase 4 处理的打磨项（§五）。

## 二、取证与方法

- 只读读取实现、变更记录、契约清单、`electron-smoke/report.{json,txt}`、`electron-phase3a.png`、`ime-new-entry-report.txt`、`bench-new-entry.json`、`uiux-v2-new-entry-report.json`。
- 对照旧基线 `app/renderer/styles.css`（消息/Markdown/工具行/operator/回放/ `is-blocked` / `sys-config`）与规范 §10.5/§6/§7。
- 未运行新套件；引用桌面UI 提供的实际运行结果。`uiux-v2` 新入口当前首个失败为「routine collapsed; failure direct; assistant untouched」，与本评审 §三.3 的失败直呈问题一致；按派发属已知修复中，不单独作为新阻塞。
- 关键证据：`HISTORY_REPLAY`（count 5、gap 16、user/assistant/tool/denied/divider 各 1、mdLink true）、`VIRTUAL_WINDOW`（225 行/61 挂载/2 spacer/scrollHeight 14990/clientHeight 580）、`OPERATOR_ANCHOR`（index 226，opAfterTool true）、`STATUS_AWAITING/WORKING/ERROR_BEHIND_BUSY/ERROR_WHEN_IDLE` 全 true、`MARKDOWN_SAFE` true、`NO_CONSOLE_CSP_ERRORS` true、IME 24/24、bench 跑通。

## 三、逐项复核

### 3.1 聊天流排版

| 检查 | 结果 | 证据/说明 |
| --- | --- | --- |
| 正文 15/27 | **通过** | `.msg { font-size:15px; line-height:1.8 }` = 15/27；截图行距一致 |
| 内容列 900 | **通过** | `.chat-pane { max-width: var(--content-max) }`；smoke `pane` 900；截图左缘 354 |
| 行距 16 | **通过** | `.chat-row { padding-bottom:16px }` + `.chat-pane { gap:0 }`；smoke `ROW_GAP_16=true` |
| 用户/助手层级 | **通过** | 用户右对齐 `--card` 气泡 14/22、助手 15/27 通栏；截图可读 |
| 注入/回交层级 | **通过（受阻态除外）** | `.msg-injected` 左边线 + card；`.msg-handback` 报告头/摘录/证据；`is-blocked` 缺失见 §三.2 |
| 回放淡显 | **不通过** | 行上有 `is-replay` 类，但 shell.css 无 `.is-replay` 规则；旧基线 `opacity:.88` |
| Markdown 标题 | **不通过** | 无 `.msg h1/h2/h3`；旧基线 15/15/14，margin 16/6；默认浏览器字号会破坏层级 |
| Markdown 列表 | **不通过** | 无 `.msg ul/ol`；旧基线 margin 4/18、padding-left 20 |
| Markdown 引用 | **不通过** | 无 `.msg blockquote`；旧基线有独立引用样式 |
| Markdown 表格 | **不通过（部分）** | 有 `display:block`/横向滚动/单元格边框/13px；缺表头实底、表头强底线、完整外框；cell padding 4/8 与旧 6/10 不一致 |
| Markdown 代码/链接 | **通过** | `.md-pre`/`.md-lang`/`inline code`/`.md-link` 有令牌样式；XSS 负例 `MARKDOWN_SAFE` 通过 |
| 长内容换行/滚动 | **通过** | `.msg word-break`；`pre`/表格容器内横向滚动；截图 900 列无页面横向溢出 |

**判断**：行距/列宽/层级骨架正确，但 Markdown 排版是**可见回退**；Phase 3B 前必须补齐标题/列表/引用/表格规则，或明确记录新的 Nova 排版口径。

### 3.2 回放与回交

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 回放分隔 | **通过** | `.sys-replay-divider` 上下边线 + 居中；`HISTORY_REPLAY.divider=1` |
| 回放行淡显 | **不通过** | 缺 `.is-replay`；用户/助手/系统/回交/终局行都带类但无视觉差别 |
| 回放去重/增量 | **通过（功能）** | 变更记录/单测 15/15；回放 skip/append/full 有测试 |
| 回交报告层级 | **通过（主体）** | `report-top`/标题/原文摘录/事实/证据折叠齐全；`report.status` 已显示「报告声明」/「报告状态」 |
| 受阻回交 | **不通过** | `is-blocked` 类无 CSS；旧基线 `border-left:3px solid var(--danger)`，非完成报告应有危险左边线 |

### 3.3 工具行

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 瘦身（状态+目标） | **通过（基本）** | `ToolLifecycleRow` 摘要 = statusText + target；`ActivityRow` = op + target + status；详情 `<details>` |
| `toolStatus` 事实优先 | **通过（文本）** | denied > timedOut > exitCode≠0 > failed > phase；返回「未放行/超时终止/已执行完成（退出码 N）」 |
| `timed-out` 语义色 | **不通过** | CSS 只覆盖 `failed/denied/exited-nonzero`；`timed-out` 落回 `--text-3` |
| `.tool-records` 分组 | **通过（结构）** | 组摘要 + `N 个调用` + 活动行；但折叠摘要缺失败/异常计数 |
| 失败直呈 | **不通过** | `ActivitiesRow` 摘要只显示数量；`item.denied` 的 `.sys-denied` 嵌在展开内容里，折叠时看不到失败；与 `uiux-v2` 首个失败一致（已知在修） |
| 展开指示 | **不通过** | 旧 `.tool-records > summary` 隐藏默认 marker 并用 `›`；新 summary 无 chevron，只有 Terminal 图标/默认 marker，折叠 affordance 不清 |
| 时间列 | **不通过** | `.tool-activity` 仍是 42px 三列网格，`ActivityRow` 的时间 span 为空；旧基线有 activity 时间 |
| 详情折叠 | **通过（结构）** | `ToolLifecycleRow`/`ActivitiesRow` 使用原生 `<details>`；但开合状态不跨虚拟卸载保持（§三.5） |
| 工具行高度/宽度 | **通过** | 组摘要 22px、活动行约 42–46、max 760；不抢 900 阅读列 |
| 颜色只作辅助 | **基本通过** | 状态都有文字；失败/未知有语义色类；timed-out 颜色缺口见上 |

### 3.4 状态徽标

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 优先级 | **通过** | `deriveRoleStatus`: awaitingConfirm > busy > queueDepth > error > live/hadSession/restored/not-opened；smoke 四组全 true |
| 当前轮 vs 上一轮终局 | **通过** | busy 覆盖上一轮 error；`ChatStream[data-state]` = run/err/idle；smoke `STATUS_ERROR_BEHIND_BUSY` |
| 文案/形状/颜色 | **通过** | 树徽标文字 + Lucide 图标（工作转轮/错误 CircleAlert/等待 ShieldCheck/恢复 Clock）；颜色只辅助 |
| 状态图标来源 | **基本通过** | `Sidebar.statusIcon` 用 Lucide；`status.ts` 的 `RoleBadge.icon` 仍存 `○/●/◐/?/■/✕/◌` 字符串但未被渲染（潜在第二图标源，建议清理） |
| 当前工作尾行 | **部分** | `tool-current` 只有「正在工作…」文字，无 v3 批准的 12px 转轮；树徽标有转轮；可随 Phase 4 统一 |
| 空态/加载/队列 | **基本通过** | 空态分无项目/无角色/未选/未开会话/已开会话；loading 有文本；队列行在流尾；`virt-spacer` 不可见 |
| 空态 CTA | **不通过** | `#btn-start-primary` 使用旧 `.btn btn-primary` 类，新 CSS 无定义；见 §一.6 |

### 3.5 Operator request/choice 卡

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Amber 未决语义 | **通过** | `.op-request` 背景 `--warning-bg`、边 `--warning-border`、左 2px `--warning`；截图一致 |
| 锚点位置 | **通过** | `model.indexOfCallId(toolCallId)` → `insertAt(at+1)`；smoke `OPERATOR_ANCHOR` index 226、`opAfterTool=true` |
| 确认/拒绝语义 | **通过** | `op-confirm`/`op-submit` primary；`op-deny`/`op-cancel` neutral；与旧卡一致 |
| 默认焦点 / fail-closed | **通过（按旧卡）** | 无自动聚焦/自动确认；choice 未选时提交禁用；confirm/deny 需显式点击。Shell/恢复卡的「默认拒绝焦点」属 Phase 3B，不在本卡自动套用 |
| 关闭/失效 | **通过** | `data-state` closed + `finalNote`；按钮禁用；不假装成功 |
| 选项可点性 | **不通过** | `.op-options label` 无 min-height/padding/hover/selected，旧 `.op-option` 56px；当前约 17px 行高，远低于可点目标 |
| 选项颜色 | **不通过** | 原生 radio/checkbox 无 `accent-color`；旧 `.op-option input { accent-color: var(--text) }`；深色下会落回浏览器蓝 |
| 中性动作边界 | **不通过** | `.op-actions button` 统一 `border-strong`（1.74:1）；旧 `.op-deny` 用 `--border-control`（3.37:1） |
| 物理密度 | **可接受（待观感门）** | 新卡 8px 圆角/10×12 padding/28px actions vs 旧卡 0 圆角/15 padding/32px actions；Nova 紧凑档，但需与 3B 完整卡族一起确认 |

### 3.6 虚拟窗口、滚动、动效

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 窗口化 | **通过** | 225 行/61 挂载/2 spacer；视口 ±30；`rowModelDebug` count/lastIndex/operators/rowGap(16) |
| 贴底/上翻 | **通过（冒烟）** | 初始 tail、scroll 到顶 mounted 61；`scrollHeight 14990/client 580`；bench scrollToBottom 13.4ms（旧 16.3） |
| spacer 不可见 | **通过** | `aria-hidden` + 仅高度；无背景/边框 |
| 滚动条令牌 | **通过** | 全局 10px `--scrollbar-thumb`；chat `scrollbar-gutter:stable` |
| 虚拟状态保持 | **不通过** | `keepEl` 标记但未消费；operator 选项、handback/工具组/推理 details 离屏会丢状态 |
| 聊天热路径动效 | **通过** | `.msg`/`.chat-row`/`.tool-*` 无 transition/animation；运行图标静态；Motion 只在 Sidebar 工作转轮（规范唯一无限动画）、Drawer、ConfirmCard |
| 基准 | **通过（无阈值）** | 新入口 bench 跑通；handler/replay/scroll 优于旧；storm maxGap 23.9/20 vs 旧 20.9/17.7 略高，阈值按派发留测试定；不作为设计否决 |
| `uiux-v2` | **已知差距** | 新入口默认段首个失败「routine collapsed; failure direct; assistant untouched」；属工具组折叠修复中，与本评审 §三.3 一致，不单独重复计为新阻塞 |

## 四、必要修正清单

### 4.1 Phase 3B 前必须

> 3A2 已修正以下 7 项并复核通过；本节保留为当轮清单，实测见文末「3A2 复核」。

1. **补齐 Markdown 排版**：恢复旧基线的 `.msg h1/h2/h3`（15/15/14，margin 16/6）、`ul/ol`（margin 4/18、padding-left 20）、`blockquote`、`p` margin（10，或明确记录 Nova 8）；表格补表头 `--card` 实底、表头 `--border-strong` 底线、完整外框、cell padding 6/10、13/20；保留现有 `.md-pre`/`.md-lang`/`.md-link`/inline code。
2. **回放/受阻状态**：加 `.is-replay { opacity:.88 }`；加 `.msg-handback.is-blocked` 危险左边线（3px `--danger`，配 `--danger-border`）；确认回放分隔、回放行淡显、受阻报告与成功报告可区分。
3. **工具行事实与折叠**：折叠的 `ActivitiesRow` 摘要显示失败/未放行计数（如「N 个调用 · 异常 M」），不能只把 `.sys-denied` 放在展开内容里；补 `activity-state.timed-out` 语义色；补 `.tool-records`/`.tool-call-record`/`.sys-denied` 的显式展开 chevron；42px 时间列要么填真实时间，要么移除并同步规范（不要留空列）。
4. **Operator choice 卡可用性**：选项行恢复至少 40–56px 最小高度、内边距、hover/selected 背景；原生 radio/checkbox 加 `accent-color`（旧 `--text` 或规范确认的 warning/primary）；中性「拒绝/取消」按钮边界改 `--input`；确认/提交保持 primary、拒绝/取消保持中性；不放默认焦点/不自动确认。
5. **虚拟状态保持**：消费 `keepEl` 或把状态提升到 store——operator 已选选项、handback/工具组/推理的 `<details>` 开合、活动组开合在离屏/回窗后保持；旧渲染器已用 `keepEl` 保留元素实例。
6. **空态 CTA 样式**：`#btn-start-primary` 改 shadcn `Button` 或补 `.chat-cta` 的完整令牌样式；当前旧 `.btn`/`.btn-primary` 类在新 CSS 中不存在。
7. **`sys-config` 语义色**：补 `.sys-config { color:var(--danger) }` / `.sys-config .sys-text`，让「开启会话失败/历史恢复失败」不再灰显。

### 4.2 可随 Phase 4

- `tool-current`/`sys-loading` 的 12px 工作转轮（v3 W10/W11 曾批准；当前文字-only 诚实，但可统一）。
- 终局行失败颜色：旧基线也是 `--text-2`，当前靠文字+树错误；若产品要求 danger，再改。
- 树键盘语义：`Sidebar.onTreeKeyDown` 目前方向键即 `selectRole`（会开会话）；标准树通常方向键移焦点、Enter/Space 选择。建议确认/收敛，避免方向键连续开会话。
- 回交标题/事实完整度（当前固定「任务报告」+ 独立验收一行；旧报告字段可按需补）。
- Operator 确认卡的物理密度（28 actions/10×12 padding vs 旧 32/15）；Nova 紧凑档可接受，随 3B 完整卡族统一。
- `ToolLifecycleRow` 失败/未放行状态色（文字已清楚；颜色辅助）。
- 角色级错误无行时的提示（当前靠树错误徽标；如需流内提示再加）。
- 附件 chip 缩略图/粘贴/拖入（3B/4 完整 UX）。
- `status.ts` 的 glyph 字符串未渲染；清理或改 Lucide 字段，防止第二图标源。
- `uiux-v2` 其余双端等价（3B/4/5 范围）。

## 五、未覆盖与局限

- 未运行真实模型/网络、未跑新 e2e；引用桌面UI 的实际运行结果。截图仅 `electron-phase3a.png` 一张主态，未覆盖用户气泡、注入、回交、choice 卡、错误/加载各态。
- `uiux-v2` 新入口未通过默认段；本评审不宣称双端等价，只核对设计与当前实现。
- 未测长转录滚动手感、IME 真机组合、屏读、Windows、200% 文字、打包安装包；bench 阈值未定义。
- 本评审只读 `app/renderer/src/chat/*`、相关 shell、证据与旧 `styles.css`；未改实现代码、其他角色资料或历史文档。

## 六、边界与同步

- 只写 `角色卡/UIUX设计师/` 内文件；未改 `app/`、`test/`、其他角色资料或历史文档；未提交。
- 本角色同步：[feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)。
- 本结论是设计对齐意见，不是产品验收、测试结论或客户批准；Phase 3B 修正后由 UIUX 复核。

## 3A2 复核（2026-10-21）

**复核对象**：桌面UI [Phase 3A2 修正节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md) 与 [3A2 证据](../../../桌面UI/docs/change/2026-10-21-phase3a2-evidence/)（`chat-1360/960.png`、`choice-1360/960.png`、`electron-smoke/report.json` 的 12 组行为断言、ime/bench/uiux-v2 报告）。
**复核方式**：只读实现、截图、smoke 报告与旧基线；未改 `app/` 代码、未跑真实模型/网络、未提交。
**结论：pass（设计对齐通过）。** 3A 评审的 **7 项 Phase 3B 前必须全部关闭**；12 组行为断言均返回预期值，零 console、零 did-fail-load；`ime` 24/24、新纯逻辑 18/18、旧基线 679/679、bench 跑通。剩余项为 Phase 4/规范口径打磨，不构成 3A2 返工。

### 逐项复核

| # | 3A 评审项 | 3A2 结果 | 实测/证据 |
| --- | --- | --- | --- |
| 1 | Markdown 排版 | **通过** | `MARKDOWN_TYPOGRAPHY`：h1/h2 15px、h3 14px、margin 16/6；ul 4/18/20；blockquote 2px `--border-strong`；p margin 10；table outline 1px `--border-strong`、th bg `rgb(30,35,40)` = `--card`、th bottom strong、cell 6×10。`chat-1360/960` 截图标题/列表/引用/表格可读。注：table font 12.5/1.5 vs 旧 13/20（见剩余项）。 |
| 2 | 回放/受阻 | **通过** | `REPLAY_AND_BLOCKED`：`.is-replay` opacity **0.88**；blocked 左边 **3px** `rgb(201,122,109)` = `--danger`；`choice-1360` 顶部受阻回交卡左边红线可见。 |
| 3 | 工具行事实/折叠 | **通过** | `TOOL_FACTS`：时间 18:00 + ISO title；timed-out danger；折叠摘要「本轮 1 个调用：run_shell · 含 1 条失败」且摘要 danger；`TOOL_DEBUG` groups 摘要含失败条数；`EXPAND_CHEVRONS` records/denied 为 `›`（源码 `.tool-call-record` 同规则）；失败/未放行 `.sys-denied` 直显。 |
| 4 | Operator choice | **通过** | `OPERATOR_CHOICE`：选项 label 高 **40px**、padding 8px、accent `rgb(242,244,246)` = `--foreground`、取消边 `rgb(107,117,126)` = `--input`、提交 bg primary、选中背景 `rgb(42,48,55)` = `--selected`；`choice-1360/960` 截图选项可点、选中态清晰。 |
| 5 | 虚拟状态保持 | **通过** | `OFFSCREEN_DEBUG`：上翻后 operatorIndex=-1、仅 39 行挂载；`VIRTUAL_STATE_RESTORED` before/after 的 group/reason/handback/selected/checked 全 true；源码 `detailsOpen`/`selected` 存 store、`preferTail: tail && stickRef.current`。 |
| 6 | 空态 CTA | **通过** | `CTA_STYLED`：`#btn-start-primary` 为 shadcn Button，computed bg `rgb(111,160,139)`、颜色 `rgb(20,23,26)`、高 32、13px；不再是浏览器默认按钮。 |
| 7 | `sys-config` 危险色 | **通过** | `SYS_CONFIG_DANGER`：开启会话失败行 computed `rgb(201,122,109)` = `--danger`；源码 `.sys-config`/`.sys-config .sys-text` 已补。 |
| 附 | 选中角色副标题去重 / 写入语义 | **通过** | `ChatHeader` 选中角色时 `#chat-role-sub` hidden；`HEADER_DEBUG` selected=A、role=A、context=新会话、无重复副标题；`Composer` 右侧恢复「实际写入导入项目，角色边界外的写入会被拒绝。」，`#composer-hint` 同时保留「写入由治理引擎把关…」；1360/960 截图一致。 |

### 剩余项（不阻塞 pass）

1. **披露 chevron 的图标/动效口径**：`.tool-records`/`.tool-call-record`/`.sys-denied` 的 `::before` 使用 CSS `content: "\203A"` 文本字形，不是 Lucide 组件（旧基线同款）；同时带 `transition: transform 0.12s ease`。按规范 §8「Lucide 唯一」与 §7.1「聊天热路径零动画」的字面口径，这是唯一两处偏离：建议改用 Lucide `ChevronRight`（已有依赖）并改为瞬时旋转，或在规范中登记为 disclosure 例外（仅用户开合、≤120ms、transform，字形例外需登记理由）。它是展开控制、不作用于内容行，故不作为 3A2 返工。
2. **表格字号**：12.5/1.5 vs 旧 13/20（规范 §4.2 的表行也需统一口径）；0.5px 级密度差，随 Phase 4 视觉复核决定收敛到 13/20 或登记 Nova 12.5。
3. **`tool-current`/`sys-loading` 转轮**：仍文字-only；v3 W10/W11 曾批准 12px 工作转轮，可随 Phase 4 统一（树徽标转轮已存在）。
4. **终局失败色**：旧基线也是 `--text-2`，当前靠「本轮失败」文字 + 树错误徽标；若产品要求 danger，再改。
5. **树方向键语义**：当前方向键即 `selectRole`（会开会话）；建议确认「移焦点 vs 选择」后收敛，避免连续开会话。
6. **Operator 确认卡物理密度**：28px actions/10×12 padding vs 旧 32/15；Nova 紧凑档可接受，随 3B 完整卡族统一。
7. **`status.ts` 的 glyph 字符串**：未被渲染（Sidebar 用 Lucide）；建议清理，避免第二图标源。
8. **uiux-v2 剩余**：默认段第 9 项（工作概览/队列，3B/4）与 toolfold 第 13 项（尾部折叠锚点，3B/5）未过；不宣称双端等价。

### 纪律与边界

- `src` 除 `index.css` 外零裸色值、零手绘 SVG；Motion 仅在 Drawer/Sidebar 工作转轮/ConfirmCard；无 `transition-all`/`@keyframes`。唯一非 Lucide 可见图标是三处披露 chevron 的 CSS `\203A` 字形，唯一 CSS transform transition 也是它们（均见剩余项 1）。
- 只读 `app/renderer/src`、3A2 证据与旧 `styles.css`；未改实现代码、其他角色资料或历史文档；未提交。
- 已同步 [feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)；本结论是设计对齐意见，不是产品验收、测试结论或客户批准。
