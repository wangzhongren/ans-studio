---
id: ui-platform-phase3b-review
type: design
title: Phase 3B 卡族与输入区设计对齐评审（Nova × 深色石墨）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-nova, ui-platform-phase3b-cards-composer, ui-contract-surface, ui-platform-phase3a-review]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对 Phase 3B 真实确认卡族、judge 双开关、输入区/队列/附件完整接线完成只读设计对齐评审；结论 needs-work，5 项 Phase 4 前必须（SU 视觉语义、shell 详情 chevron、拖入反馈、队列撤回目标、缩略图圆角），其余可随 Phase 4/5
  - date: "2026-10-21"
    kind: reviewed
    summary: Phase 3B 修正复核通过（设计对齐 pass）：SU 档位 600/警告琥珀、shell 详情 Lucide chevron、is-dropping 反馈、撤回 28px、缩略图 8/移除 4/X12 全部实测；45/45 冒烟、18 张截图、缩略图夹具修正
---

# Phase 3B 卡族与输入区设计对齐评审

**评审对象**：桌面UI 的 [Phase 3B 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md)（status: implemented-verified 3B 范围内，2026-10-21），证据 [2026-10-21-phase3b-evidence](../../../桌面UI/docs/change/2026-10-21-phase3b-evidence/)（39 项 Electron 冒烟、14 张 1360/960 截图、build/bench/ime/uiux-v2），实现 `shell/ConfirmCard.tsx`、`shell/Composer.tsx`、`shell/shell.css`、`chat/{ChatRow,ChatStream,VirtualPane,judge,confirm-logic}`、`stores/confirm-store.ts`。
**设计依据**：[Nova × 深色石墨规范](2026-10-21_design_ui-platform-nova.md) §6/§7/§8/§10.6/§10.8。
**评审性质**：只读实现、截图、冒烟/基准证据与旧基线；未改 `app/` 代码、未跑真实模型或网络、未提交。本文是设计对齐意见，不是产品验收、测试结论或实施授权。

## 一、结论

> **3B 修正复核（2026-10-21）**：下述 5 项 Phase 4 前必须已由桌面UI 修正并复核通过（设计对齐 **pass**）；本节保留为 3B 当轮结论，最新实测与剩余项见文末「3B 修正复核」。

**needs-work（不通过设计对齐，需修正后复核）。** 3B 的功能接线与 fail-closed 纪律整体扎实：shell/su/恢复卡的逐字、默认拒绝/取消焦点、显式 allow、失效定格、judge 双开关/一次性警告、发送/停止/队列/附件链路都通过 39 项冒烟与截图核对。仍有 **5 项 Phase 4 前必须** 的可见设计缺口：

1. **SU 审批的视觉语义未落地**：`ShellConfirmCard` 给 overlay 加了 `is-su-approval`，但 shell.css 没有任何 `.is-su-approval` 规则；档位摘要没有旧卡的字重 600，`SU_APPROVAL_WARNING`（绕过写边界）与默认提示同色 `--text-3`，不是琥珀。截图 `1360-su-approval-card.png` 可见 warning 仍是灰色，档位行不加重。
2. **shell 卡「详情（argv / cwd）」没有 disclosure chevron**：`#sc-details > summary` 只有文本，CSS 又隐藏了默认 marker，导致没有展开指示；恢复卡/工具行/judge 行都已有 Lucide `ChevronRight`，shell 卡成了例外。
3. **附件拖入没有视觉反馈**：`Composer` 在 dragenter/over 添加 `.is-dropping`，但新 shell.css 没有该规则（旧基线 `.capsule.is-dropping { border-color: var(--text-3); background: var(--bg-hover); }`），拖拽时胶囊不变；功能可 drop，但用户看不到落点。
4. **队列撤回按钮 20px**：`.queue-withdraw { height:20px; font-size:10.5px }` 低于规范 xs 24 / 旧 28 的命中档，截图里是明显的微型按钮；队列撤回是可点击的操作，不应低于 24。
5. **附件缩略图圆角 10px / 移除圆钮 999px**：`.attach-chip` 用 10px、`.attach-rm` 用 999px 圆形；规范容器 8 / 控件 6 / 微型 4。10 是规范外新值；圆形覆盖钮可作为登记例外，但缩略图容器应收敛到 8。

其余为可随 Phase 4 处理的打磨项（§五）。`1360-attachments.png` 中两张缩略图显示 broken-image 图标：冒烟夹具的粘贴/拖入文件只有 4 字节 PNG 签名，不是有效图片；这是夹具数据问题，但 UI 没有 `onError` 兜底，建议 Phase 4 补通用占位。

## 二、取证与方法

- 只读读取变更记录、39 项 `electron-smoke/report.json`/`report.txt`、14 张截图、`uiux-v2/reached-checks.md`、bench/ime/unit/build 证据；对照旧 `styles.css` 的 `#shell-confirm.is-su-approval`、`.sc-details`、`.capsule.is-dropping`、`.attach-chip`、`.q-withdraw`、`.op-*`。
- 未运行新套件；引用桌面UI 的实际结果；未改实现代码。
- 39/39 冒烟断言 `ok=true`、`failures=[]`、零 console/CSP；新纯逻辑 33/33、旧基线 679/679、IME 24/24、lazy toolgroup 10/10、build/CSP/预算通过；bench 重基线通过；C1 旧 32 → 新 16。
- 截图覆盖：1360/960 的 shell、su、恢复卡、双开关警告、附件、队列撤回、judge 结果行；未截图恢复卡 expired 态（冒烟覆盖）。

## 三、卡族复核

### 3.1 shell 命令确认

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 命令逐字 | **通过** | `#sc-command` 为 `<pre>` 文本；截图 `echo "逐字 原文"`；冒烟 `SHELL_CARD_VERBATIM_AND_DENY_FOCUS` |
| 拒绝默认焦点 | **通过** | 打开即 `denyRef.focus()`；截图拒绝按钮 2px/3px ring；冒烟 true |
| Esc/×/拒绝 = allow:false | **通过** | 冒烟 `SHELL_ESC_DENIES_AND_CLOSES` detail `allow:false`；关闭按钮同 |
| 放行仅显式 | **通过** | 冒烟 `SHELL_EXPLICIT_ALLOW_ONLY` detail `allow:true`；无自动 allow |
| 等待不设限/零忙碌动效 | **通过** | 无计时器；busy 只禁按钮；无 spinner |
| settled/expiry 收起旧卡 | **通过** | 冒烟 `SHELL_SETTLED_CLOSES_STALE_CARD`、`SHELL_EXPIRY_CLOSES_AND_REPORTS_REASON`；不保留全禁用旧卡 |
| 逐字 summary/reason/argv/cwd | **通过** | `sc-summary`/`sc-reason`/`sc-command`/`sc-argv`/`sc-cwd`；reasonRaw 在详情 |
| 详情 disclosure | **不通过** | `#sc-details > summary` 无 ChevronRight；CSS 隐藏 marker，无展开指示（§一.2） |
| 卡片视觉 | **通过** | 640px、8px 圆角、`--border-strong`、`--shadow-card`、`--backdrop-strong`；截图一致 |

### 3.2 SU 命令审批

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 标题/角色名 | **通过** | `shellConfirmTitle`：内置治理角色「命令审批 · Proof / 验收」等；截图「SU 命令审批」+「su 审批」badge |
| 档位标签 | **通过（内容）** | `suApprovalTierLabel` risky/review/deny；截图「硬拒类（deny）」；冒烟三档标签 |
| 命中原因 | **通过** | `reasonText` = reasonPlain + 「命中原因：reasonRaw」；截图可见 |
| 绕过写边界警告 | **不通过（颜色/字重）** | 文案在 `sc-hint` 中，但 CSS 仍 `--text-3`；旧基线 `#shell-confirm.is-su-approval .sc-hint { color: var(--amber) }`；截图灰色 |
| 档位行加粗 | **不通过** | 旧基线 `.is-su-approval .sc-summary { font-weight:600 }`；新无 `.is-su-approval` 规则；截图档位行常规字重 |
| 拒绝默认焦点 | **通过** | 同 shell；截图拒绝 ring |

### 3.3 恢复确认

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 动作人话 + 原始 token | **通过** | `recoveryActionView` label +「（abort-turn）」；截图 |
| 目标角色/原因 | **通过** | 目标角色经 governanceView；原因行；截图 |
| 证据逐字 | **通过** | `#rc-evidence` `<pre>`；截图 `role_status: … busy=true …` |
| 取消默认焦点 | **通过** | 截图取消 ring；冒烟 `RECOVERY_CARD_VERBATIM_CANCEL_FOCUS` |
| 仅「执行」= allow:true | **通过** | 冒烟 `RECOVERY_EXPLICIT_EXECUTE_ONLY` detail `allow:true` |
| 失效/通道异常定格 | **通过** | 冒烟 `RECOVERY_EXPIRED_STAYS_DISABLED_HONEST`、`RECOVERY_CHANNEL_ERROR_FAIL_CLOSED`；`is-expired`/hint；close 可收起 |
| 详情 chevron | **通过** | `#rc-details` 含 Lucide ChevronRight；截图「详情（提议方 / 时间 / 条目） ›」 |

## 四、输入区 / 队列 / judge / system

### 4.1 发送、停止、附件

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 发送三态 | **通过** | 冒烟 `SEND_ACK_CLIENT_MESSAGE_ID_TARGET`（clientMessageId/target）、`SEND_FAILURE_RESTORES_DRAFT_AND_SAYS_SO`（恢复原文、失败行/提示）；queued 走 `sys-queue` + 位次 |
| 停止三态 | **通过** | `HALT_VISIBLE_WHEN_BUSY`、`HALT_ABORTS_EXACT_TARGET_AND_SAYS_REQUESTED`、`HALT_HIDDEN_WHEN_IDLE`；不乐观「已停止」 |
| 附件选图/粘贴/拖入 | **通过（功能）** | 冒烟 `ATTACH_PICK_THUMBNAIL`/`PASTE`/`DROP`/`REMOVE`；data URL、主进程校验、无 blob |
| 附件缩略图 | **部分** | 有效 pick 红图正常；粘贴/拖入夹具是 4 字节 PNG 签名 → broken image；无 `onError` 兜底；chip 圆角 10 超规范（§一.5） |
| 拖入反馈 | **不通过** | `.is-dropping` 无 CSS；旧基线有边框/底色变化（§一.3） |
| 移除按钮 | **部分** | `attach-rm` 18px 命中区、X 11/1.8；可点但低于 24 档；可随 Phase 4 |
| 角色草稿 | **通过** | per-role `draftsRef`；迟到的选图落发起角色；切换恢复 |
| 写入语义常驻 | **通过** | `#composer-hint` 真实提示 + 右侧「实际写入导入项目，角色边界外的写入会被拒绝。」；截图一致 |

### 4.2 双开关与一次性警告

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 主进程权威/默认关/重载复位 | **通过** | confirm-store 只接受 version1+enabled；`JUDGE_SWITCH_STARTS_AUTHORITATIVE_OFF` |
| 开启琥珀标记 + 一次性警告 | **通过** | 截图 `替我审批中 · 判断 agent` 琥珀点/字；警告浮层 amber 左边线、`知道了`、9s；冒烟 |
| 按组一次 / ack 后不重现 | **通过** | `judgeWarningStep` per group；`JUDGE_ACKNOWLEDGED_WARNING_DOES_NOT_REAPPEAR` |
| 决策组警告 | **通过** | `DECISION_ENABLE_SHOWS_GROUP_WARNING` |
| single 禁用 + 说明 | **通过** | `DECISION_DISABLED_IN_SINGLE_WITH_NOTE`；label/note |
| 桥缺失禁用 | **通过** | `judgeToggleView` available false → 固定文案、不假开启 |
| 原生 checkbox 偏差 | **接受** | 为保留 `#auto-approve-toggle/#judge-decision-toggle` 的 id/checked/label 契约；13px/accent warning；已在契约面登记 |
| 警告文字层级 | **部分** | `jw-strong` 只改颜色，父级已 amber，强段没有字重差异；可随 Phase 4 |

### 4.3 队列、judge、system

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 队列位次/来源 | **通过** | `queueItemViews` + 截图「进行中 / 第 1 位 / 第 2 位」「客户消息 / 派发 · 来自 B」 |
| 仅客户消息可撤回 | **通过** | `canWithdraw`；冒烟 `QUEUE_POSITIONS_AND_WITHDRAW_ONLY_FOR_MESSAGES` |
| 撤回就地回执 | **通过** | 截图「已撤回排队消息：客户排队消息」；`QUEUE_WITHDRAW_INLINE_RECEIPT` |
| 撤回按钮命中 | **不通过** | 20px / 10.5px 低于 xs 24（§一.4） |
| judge 结果行锚定 | **通过** | `appendJudgeResultRow` 按 toolCallId 插 tool 后；冒烟 `SHELL_JUDGE_ALLOW_ROW_ANCHORED_AND_PROMINENT` |
| manual 无行 + judgeNotice | **通过** | `shellJudgeResultView` verdict manual → null；`sc-judge-notice`/`op-judge-notice` 逐字；冒烟 |
| 治理代批行 | **通过** | 标题「judge 代批 · 代审批/代决策」+ badge/结论/理由/路径/证据；截图 |
| judge 详情 chevron | **通过** | Shell/Governance 详情均 Lucide ChevronRight；瞬时旋转 |
| system 注入（看护/收束） | **通过** | `.msg-injected.is-system` 琥珀左线 + chip；截图「系统消息 · 看护」；`SYSTEM_ALERT_INJECTED_STYLE` |
| 发送失败 system 行 | **部分** | 「发送失败：离线拒发」为 `sys-call` 灰行；文字如实，但失败语义未用 danger；可随 Phase 4 |

## 五、视觉与纪律

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 卡片层级/圆角/阴影 | **通过** | sc-card 8px / border-strong / shadow-card；`--backdrop-strong` |
| 按钮状态矩阵 | **基本通过** | shell/recovery 用 shadcn Button；primary/outline/ghost 状态；队列撤回 20、attach-rm 18 低于 xs（§一.4/§五剩余） |
| 焦点环 2px/3px | **通过** | 拒绝/取消默认 ring；按钮 focus-visible；截图 |
| chevron 来源 | **部分** | recovery/tool/judge 均 Lucide；shell 详情缺 chevron（§一.2） |
| 表格 13px | **通过** | `.msg table { font-size:13px }` |
| C1 36px 呼吸位 | **通过** | `.chat-pane { padding-bottom:36px }`；C1 Δ=16 |
| `--backdrop-strong` | **通过** | shell/recovery overlay、attach-rm 底色均用令牌 |
| 裸色/第二图标 | **通过** | `src` 除 index.css 零 `#hex/rgb/hsl`；零手绘 SVG；status glyph 已删；无第二图标库 |
| 热路径动画 | **通过** | `.disclosure-chevron` 无 transition、瞬时旋转；chat 行/工具行无 animation；Motion 仅 Drawer/Sidebar 转轮；无 `transition-all`/`@keyframes` |
| 卡族入场 Motion | **部分** | 真实卡为静态 div，未用 §7.2 的 180/120ms Motion；旧卡也静态；可随 Phase 4 统一或登记例外 |
| Phase 2 演示角标 | **通过** | TitleBar 已移除；Electron 截图无「演示骨架」 |
| 原生 checkbox / data URL 偏差 | **接受** | 原生 checkbox 保留旧契约；data URL 遵守 `img-src 'self' data:`，无 blob |

## 六、Phase 4 前必须

> 3B 修正已关闭以下 5 项并复核通过；本节保留为当轮清单，实测见文末「3B 修正复核」。

1. **SU 审批视觉语义**：补 `.is-su-approval .sc-summary { font-weight:600 }`；把 `SU_APPROVAL_WARNING` 用 `--warning` 呈现（单独 span 或整段 hint amber，保留默认提示 `--text-3`），确保截图/计算色为 amber；档位行加粗。
2. **shell 详情 chevron**：`#sc-details > summary` 加 Lucide `ChevronRight`（同 recovery），保留 `list-style:none`；点击展开有可见指示。
3. **拖入反馈**：恢复 `.capsule.is-dropping` 的边框/底色变化（`--text-3` / `--hover` 或 tokens），拖拽时可见落点。
4. **队列撤回命中**：`.queue-withdraw` 高度 20→至少 24（建议 28），字号 10.5→11/12；保持边框 `--input`、hover/disabled。
5. **缩略图圆角**：`.attach-chip` 10→`var(--radius)` 8；`.attach-rm` 圆形 999 可登记为覆盖钮例外，或改 `--radius-micro` 4；同时把 X 11/1.8 收敛到 12/1.5。

## 七、可随 Phase 4/5

- 卡族入场/退场 Motion（§7.2 180/120ms；旧卡静态；若观感门要求再补）。
- `judge-warning` 强段字重（`jw-strong` 只改色；可加 600）。
- 缩略图 `onError` 兜底（证据中的 broken image 是夹具 4 字节 PNG；加通用占位更稳）。
- 发送失败 system 行 danger 语义（文字已如实；颜色可后调）。
- `attach-rm` 命中区 18→24、X 图标档（与 §六.5 一并）。
- 原生 checkbox 13px vs 规范 14（保留旧契约优先；可加 token 化尺寸例外说明）。
- `sc-details-trigger` 旧 CSS 仍有 transform transition，但当前无引用；清理死样式。
- `tool-current`/`sys-loading` 12px 转轮（3A 遗留；v3 W10/W11）。
- uiux-v2 剩余：默认段第 10 项（工作概览/队列抽屉）、SEND_FACTS 1 项（每引擎会话）、QUEUE_VIEW 1 项（抽屉队列）；均 Phase 4；双端全量等价 Phase 5。
- `main.mjs`、`uiux-design-audit`、打包/安装包、真实模型/网络：Phase 5/未验证。

## 八、未覆盖与局限

- 未运行真实模型/网络；全部证据来自 Electron 离线 IPC 替身/套件夹具；未在真实角色会话中触发 shell/su/恢复卡。
- 未截图 expired 恢复卡视觉（冒烟已覆盖行为）；未测屏读、200% 文字、Windows、打包安装包。
- 未复核 `main.mjs`/`uiux-design-audit`/全量双端；`uiux-v2` 只按 `reached-checks.md` 的到达点判断。
- 只读 `app/renderer/src`、证据与旧 `styles.css`；未改实现代码、其他角色资料或历史文档。

## 九、边界与同步

- 只写 `角色卡/UIUX设计师/` 内文件；未改 `app/`、`test/`、其他角色资料或历史文档；未提交。
- 本角色同步：[feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)。
- 本结论是设计对齐意见，不是产品验收、测试结论或客户批准；Phase 4 修正后由 UIUX 复核。

## 3B 修正复核（2026-10-21）

**复核对象**：桌面UI [Phase 3B 修正 D 节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md) 与 [同一证据目录](../../../桌面UI/docs/change/2026-10-21-phase3b-evidence/electron-smoke/)（45 项 `report.json`、18 张 1360/960 截图，新增 `su-approval`/`shell-details-open`/`drop-state`/`queue-withdraw`/`attachments` 等）。
**复核方式**：只读实现、截图、45 项冒烟与旧基线；未改 `app/` 代码、未跑真实模型/网络、未提交。
**结论：pass（设计对齐通过）。** 3B 评审的 **5 项 Phase 4 前必须全部关闭**；45/45 冒烟 `ok=true`、`failures=[]`、零 console/CSP；缩略图夹具已改为完整 1×1 PNG，截图无 broken image。剩余项为 Phase 4/5 打磨，不构成 3B 返工。

### 逐项复核

| # | 3B 评审项 | 修正结果 | 实测/证据 |
| --- | --- | --- | --- |
| 1 | SU 视觉语义 | **通过** | `.sc-overlay.is-su-approval .sc-summary { font-weight:600 }`；`SU_APPROVAL_WARNING` 拆为 `.sc-su-warning`（`--warning`），默认「拒绝/关闭=不放行」提示仍 `--text-3`；文案逐字。冒烟 `SU_WARNING_AMBER_SUMMARY_BOLD` true；截图 `1360-su-approval-card.png` 档位行加粗、警告琥珀、默认提示灰色。 |
| 2 | shell 详情 chevron | **通过** | `#sc-details > summary` 增加 Lucide `ChevronRight`（`.disclosure-chevron`，瞬时旋转、无 transition）；CSS 仍隐藏 `::before` marker；冒烟 `SHELL_DETAILS_LUCIDE_CHEVRON_VISIBLE_AND_ROTATED` true；截图 `1360-shell-details-open.png` 展开后 chevron 旋转、cwd/argv/raw note 可见。 |
| 3 | 拖入反馈 | **通过** | `.capsule.is-dropping { border-color: var(--text-3); background: var(--hover) }`；`onDragLeave` 清除类；冒烟 `DROP_FEEDBACK_VISIBLE_TOKENS`/`DROP_FEEDBACK_CLEARED_ON_LEAVE` true；截图 `1360-drop-state.png` 胶囊有可见边框/底色变化。 |
| 4 | 队列撤回命中 | **通过** | `.queue-withdraw` 高 **28px**、字号 **11px**、圆角 `--radius-control`、边框 `--input`；冒烟 `QUEUE_WITHDRAW_HIT_TARGET_AND_INPUT_BORDER` true；截图 `1360-queue-withdraw.png` 按钮明显增大、就地回执保留。 |
| 5 | 缩略图圆角/图标 | **通过** | `.attach-chip` `var(--radius)` **8px**；`.attach-rm` `var(--radius-micro)` **4px**；X `size=12 strokeWidth=1.5`；冒烟 `ATTACH_CHIP_RADIUS_AND_REMOVE_ICON` true；夹具改为完整 1×1 PNG，`1360-attachments.png` 三张缩略图正常、无 broken image。 |

### 附带与纪律

- 45/45 冒烟 true、零 console/CSP；18 张截图含 `su-approval`、`shell-details-open`、`drop-state`、`queue-withdraw`、`attachments` 的 1360/960 两档。
- `src` 除 `index.css` 外零裸色值、零手绘 SVG；Motion 仅 Drawer/Sidebar 工作转轮；无 `transition-all`/`@keyframes`；`disclosure-chevron` 无 transition，chat 热路径零动画。
- `.attach-rm` 命中区仍 18px（低于 24）——Phase 4 打磨，不影响 3B pass。
- `.sc-details-trigger` 旧 CSS 仍有一条未被引用的 transform transition；死样式清理，Phase 4。
- 卡族入/退场 Motion（§7.2 180/120ms）仍缺；旧卡静态，Phase 4/观感门决定。
- `judge-warning` 强段字重、发送失败 system 行 danger、原生 checkbox 13 vs 14、`tool-current`/`sys-loading` 转轮仍按 Phase 4。
- uiux-v2 默认段第 10、SEND_FACTS 1、QUEUE_VIEW 1 仍属 Phase 4；`main.mjs`/`uiux-design-audit`/打包/真实模型仍 Phase 5。

### 状态与边界

- 只读 `app/renderer/src`、3B 证据与旧 `styles.css`；未改实现代码、其他角色资料或历史文档；未提交。
- 评审记录 frontmatter 更新为 `status: designed`，追加本 3B 修正复核；原 needs-work 结论保留为当轮历史。已同步 [feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)。
- 本结论是设计对齐意见，不是产品验收、测试结论或客户批准；Phase 4 仍按 PM/测试门推进。
