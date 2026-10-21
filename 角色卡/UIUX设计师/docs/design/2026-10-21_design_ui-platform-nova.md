---
id: ui-platform-nova
type: design
title: Nova × 深色石墨——UI 平台化设计规范（令牌 / 组件 / 状态 / 关键屏）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [enterprise-stability-uiux, ui-platform-round]
events:
  - date: "2026-10-21"
    kind: designed
    summary: 完成 Phase 0 设计规范与可检查静态原型；观感门待客户确认，正式应用未实施
---

# Nova × 深色石墨：UI 平台化设计规范

客户 2026-10-21 已确认「UI 平台化」方向：用 shadcn/ui Nova × 深色石墨重建渲染层，产品行为、信息架构与视觉基调不变。产品提案见 [UI 平台化](../../../产品/docs/design/2026-10-21_design_ui-platform-round.md)，项目管理评审与实施口径见 [评审](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)。本文件是 Phase 0 的设计交付，也是后续 Phase 2–4（桌面UI）实现与评审的**唯一设计依据**；可检查原型见 [Nova × 石墨静态原型](2026-10-21_design_ui-platform-nova-prototype.html)。

**状态：仅设计。** 本文件与原型均为设计证据：**未实施、未测试、未部署**；未改 `app/`、`src/`、`test/`、其他角色资料或客户项目；未运行模型或真实业务。设计稿不等于实施授权，实施范围以项目管理评审、产品 revision 2 和逐阶段派发为准。

这份规范回答四个问题：哪些值必须原样保留；Nova 的紧凑密度具体紧在哪里；每个组件允许哪些状态与键盘行为；实现者怎样一眼判断自己做对了。

## 一、设计目标与约束

### 1.1 目标

1. **行为不变**：IPC/preload 契约、治理语义、确认卡 fail-closed、信息架构、交互路径都不变；重建只换生产方式与呈现质量。
2. **风格可复制**：任何界面只用一套令牌、一套组件、一套图标、一套动效、一套状态规则；one-shot 实现也产出同一个系统。
3. **治理可见**：每个界面只用一眼回答三个问题（下表），不用新功能，而是把已有状态如实呈现。
4. **密度更紧但阅读不缩**：Nova 收紧内边距、行高与控件比例；正文仍是 15/27，内容列仍是 900，颜色仍是深色石墨。

### 1.2 一眼三问与五条口味

| 问题 | 界面上的已有对应 |
| --- | --- |
| 现在谁在干活？ | 角色树忙碌/空闲、当前轮次、引擎（Pi/Codex/Claude）、工作中/排队状态 |
| 什么在等我决定？ | shell/写盘确认卡、恢复卡、提案/任命/排期/验收等治理卡、待办与队列角标、「替我审批/替我决策」开关状态 |
| 为什么被拦住、为什么不能做？ | 门禁拒绝（越界路径）、F6/未接受边界、缺配置（引擎/模型/凭据）、恢复空态——如实呈现，不假装可用 |

五条口味作为验收裁判：**干净；信息在对的上下文；常规提示不打扰（只有异常出声）；每样东西有用（没用就删）；诚实呈现（能力缺席就说缺席）**。

### 1.3 不可变的已验收基线

| 基线 | 值 | 来源 |
| --- | --- | --- |
| 深色石墨色板 | `--bg #14171A`、`--bg-side #1A1E22`、`--bg-drawer #171B1F`、`--bg-soft #1E2328`、`--text #F2F4F6` 等；`color-scheme: dark` | [深色石墨变更](../../../桌面UI/docs/change/2026-10-19_change_dark-graphite-theme.md)；`styles.css` 当前最终令牌（`--text` 已按客户「白的有点发灰」提亮为 `#F2F4F6`） |
| 整页等宽 | `--mono` 单栈；`--sans: var(--mono)`；不引入外部字体 | 2026-10-17 客户裁定；`styles.css` 令牌注释 |
| 基础字号 | body 13px；正文 15/27；标签 11/12px | [企业级稳定感](2026-10-17_design_enterprise-stability.md) §4.2 |
| 内容列 | 900px（`--content-max`）；会话头/消息/输入/脚注同列 | 同上 §5.1 |
| 圆角 | 容器 8px、控件 6px；徽标等微型元素 4px | 同上 §4.4；深色石墨实现 |
| 浮层阴影 | 只在输入区、菜单、抽屉、确认卡等「浮起」层级；低透明黑 | 同上 §4.4；深色石墨 |
| fail-closed | 确认卡默认焦点在拒绝/取消；Esc/关闭 = 不放行；等待不设限；等待/恢复卡零忙碌动效 | 2026-10-12 应用内确认卡；2026-10-16 G-2/U1 |
| 颜色不单独传意 | 所有状态都有文字；颜色只是辅助 | [视觉收敛 v3](2026-10-16_design_visual-convergence-v3.md) §(c) |
| 窗口范围 | 960–1440；最小 960×620 | `app/main.ts`；企业级稳定感 §5.4 |

### 1.4 范围与明确不做

- 只覆盖渲染层视觉、组件与交互呈现；不改 IPC/preload、治理判定、门禁、主进程、数据与业务事实。
- 不新增业务功能、不新增路由/图表/日期/状态库、不做多语言、不做安装器。
- 不引入第二套 UI/图标/动画/状态库；不使用 Radix/React Aria 混源。
- 不手绘生产 SVG；不写裸色值；不用 `transition: all`；不在聊天热路径挂动效。
- 不把「看起来更现代」当作理由改变已验收的阅读契约（15/27、900 列、深色石墨）。

### 1.5 Nova 密度变更（观感门确认）

Nova 的紧凑档会改变少数布局常数。下表是本规范的建议值，**待客户观感门确认**；若客户认为偏离既有基调，可回退到括号内旧值，令牌与组件规则不变。

| 项 | 现实现 | Nova 建议 | 说明 |
| --- | --- | --- | --- |
| 会话头高度 | 72px | **64px**（回退 72） | 18px 标题 + 12px 状态仍放得下；窄档 60px |
| 左树行高 | 56px | **48–50px**（回退 56） | 原型实测 49.83px；头像 28px |
| 抽屉头高度 | 80px | **64px**（回退 80） | 标题 16px；抽屉内容仍 20/24px 内边距 |
| 输入区总高 | 约 137.6px | **约 125px**（回退 137.6） | 胶囊 80px；仍保留 28px 空文本框、32px 发送钮 |
| 菜单项高度 | 32px | **32px** | 不缩，保证键盘/触控可达 |
| 控件高度档 | 32px 为主 | **24/28/32/36** | 默认仍 32；只有密集工具条用 24/28 |

## 二、shadcn 令牌映射（单一来源）

### 2.1 原则

1. **`tokens.css` 是唯一颜色/圆角/间距/字阶来源**；组件只引用变量，不写裸色值。
2. shadcn 的 CSS 变量是**语义别名**，不是第二套色板：每个值都来自现有深色石墨令牌；映射后对比度不得下降。
3. `--primary` 对应项目的青灰绿 `--success`；`--amber` 没有 shadcn 标准位，定义项目自定义 `--warning`。
4. `--border` 只做分隔线；控件边界一律用 `--input`（现有 `--border-control`），因为它承担 ≥3:1 的控件边界要求。
5. `--primary` 的语义是「当前操作 / 已知正向 / 确认卡的安全默认动作」，不是「同意」。确认卡里「放行/执行」是 outline，安全侧「拒绝/取消」才是 primary（见 §10.8）。

### 2.2 标准位映射

| shadcn 变量 | 项目来源 | 取值 | 用途 |
| --- | --- | --- | --- |
| `--background` | `--bg` | `#14171A` | 主内容区、对话框底 |
| `--foreground` | `--text` | `#F2F4F6` | 主文字 |
| `--card` | `--bg-soft` | `#1E2328` | 报告卡、任务卡、输入胶囊、代码块 |
| `--card-foreground` | `--text` | `#F2F4F6` | 卡片文字 |
| `--popover` | `--bg` | `#14171A` | 菜单/浮层；沿用现引擎菜单的 `--bg` + 边框 + 阴影 |
| `--popover-foreground` | `--text` | `#F2F4F6` | 浮层文字 |
| `--primary` | `--success` | `#6FA08B` | 发送、当前操作、安全默认动作、焦点环语义 |
| `--primary-foreground` | `--bg` | `#14171A` | 主按钮上的深色文字（不用白字） |
| `--secondary` | `--bg-hover` | `#252A30` | 中性次级按钮/选中底 |
| `--secondary-foreground` | `--text` | `#F2F4F6` | 次级按钮文字 |
| `--muted` | `--bg-soft` | `#1E2328` | 弱化表面 |
| `--muted-foreground` | `--text-3` | `#949BA4` | 占位、计数、次级元信息；`--text-3` 保留为别名 |
| `--accent` | `--bg-hover` | `#252A30` | 菜单/行 hover |
| `--accent-foreground` | `--text` | `#F2F4F6` | hover 文字 |
| `--destructive` | `--danger` | `#C97A6D` | 拒绝、失败、异常语义 |
| `--destructive-foreground` | `--bg` | `#14171A` | 实心危险按钮上的深色文字 |
| `--border` | `--border` | `#2C3238` | 分隔线（不承担控件边界） |
| `--input` | `--border-control` | `#6B757E` | 输入胶囊、引擎选择器、控件边界（≥3:1） |
| `--ring` | `--focus-ring` | `#6FA08B` | 键盘焦点环 |
| `--sidebar` | `--bg-side` | `#1A1E22` | 左栏、标题栏 |
| `--sidebar-foreground` | `--text` | `#F2F4F6` | 左栏主文字 |
| `--sidebar-primary` | `--success` | `#6FA08B` | 左栏选中竖条/当前动作 |
| `--sidebar-primary-foreground` | `--bg` | `#14171A` | 左栏主按钮文字 |
| `--sidebar-accent` | `--bg-hover` | `#252A30` | 左栏 hover |
| `--sidebar-accent-foreground` | `--text` | `#F2F4F6` | 左栏 hover 文字 |
| `--sidebar-border` | `--border` | `#2C3238` | 左栏分隔 |
| `--sidebar-ring` | `--focus-ring` | `#6FA08B` | 左栏焦点环 |

### 2.3 项目扩展（无标准位）

| 变量 | 来源/取值 | 用途 |
| --- | --- | --- |
| `--warning` | `--amber` `#C4A15F` | 未决、未知、一次性提示 |
| `--warning-foreground` | `--bg` `#14171A` | 实心警示按钮上的文字 |
| `--warning-bg` | `--amber-bg` `#24211A` | 未决卡/提示底 |
| `--warning-border` | `--amber-border` `#4E422A` | 未决卡描边 |
| `--success-bg` | `#22302B` | 成功/已保存语义底、报告头 |
| `--success-hover` | `#7FB29B` | 主按钮 hover |
| `--primary-active` | `#5E8F7A` | 主按钮 active（沿用现有值） |
| `--danger` | `#C97A6D` | 拒绝/失败文字（`--destructive` 同值） |
| `--danger-bg` | `#2E2220` | 停止钮/异常底 |
| `--danger-border` | `#5C3832` | 异常卡描边 |
| `--danger-line` | `#C97A6D` | 异常卡左竖条 |
| `--border-strong` | `#3A4148` | 强分隔线、卡片外框；**不用于控件边界**（控件边界用 `--input`） |
| `--text-2` | `#A7ADB5` | 次级文字（无 shadcn 标准位） |
| `--text-3` | `#949BA4` | 三级文字；与 `--muted-foreground` 同值 |
| `--selected` | `--bg-selected` `#2A3037` | 选中项底（比 hover 高一档） |
| `--selected-foreground` | `--text` `#F2F4F6` | 选中项文字 |
| `--drawer-surface` | `--bg-drawer` `#171B1F` | 右抽屉底 |
| `--content-max` | `900px` | 内容列 |
| `--sidebar-width` | `248px`（可拖 208–360） | 左栏默认宽度 |
| `--radius` | `8px` | shadcn 基准；默认推导 sm 4 / md 6 / lg 8 |
| `--radius-control` | `6px` | 控件圆角别名（`rounded-md`） |
| `--radius-micro` | `4px` | 徽标/代码/微块（`rounded-sm`） |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.32)` | 浮起卡片 |
| `--shadow-dock` | `0 -6px 18px rgba(0,0,0,.35)` | 贴底输入区 |
| `--shadow-drawer` | `-12px 0 42px rgba(0,0,0,.55)` | 右抽屉 |
| `--shadow-popover` | `0 6px 24px rgba(0,0,0,.55)` | 菜单/浮层 |

### 2.4 对比度要求与实测值

要求沿用已验收口径：正文 ≥7:1；次级/三级/语义色 ≥4.5:1；控件边界与焦点环 ≥3:1；主/危险/警示实心按钮上的文字 ≥4.5:1。下表的「来源」区分既有实测与本次实算；新增配对已按 WCAG 2.x 相对亮度实算，比值保留两位小数。

| 前景 / 背景 | 比值 | 要求 | 来源 |
| --- | --- | --- | --- |
| `--foreground` / `--background` | **16.32:1** | ≥7 | 本次按当前令牌 `#F2F4F6` 实算；2026-10-19 记录的 14.78:1 是提亮前 `#E7E9EB` 的值 |
| `--foreground` / `--card` | **14.36:1** | ≥7 | 本次实算 |
| `--text-2` / `--background` | **7.96:1** | ≥4.5 | 2026-10-19 深色石墨实测 |
| `--text-2` / `--card` | **7.00:1** | ≥4.5 | 2026-10-19 深色石墨实测 |
| `--text-3` / `--card` | **5.64:1** | ≥4.5 | 2026-10-19 深色石墨实测 |
| `--text-3` / `--selected` | **4.75:1** | ≥4.5 | 2026-10-19 深色石墨实测 |
| `--primary-foreground` / `--primary` | **6.06:1** | ≥4.5 | 2026-10-19 实测（`--bg` / `--success`） |
| `--primary` / `--background` | **6.06:1** | ≥4.5 | 2026-10-19 实测 |
| `--danger` / `--background` | **5.56:1** | ≥4.5 | 2026-10-19 实测 |
| `--danger` / `--danger-bg` | **4.75:1** | ≥4.5 | 2026-10-19 实测 |
| `--warning` / `--background` | **7.38:1** | ≥4.5 | 2026-10-19 实测（`--amber` / `--bg`） |
| `--warning` / `--warning-bg` | **6.59:1** | ≥4.5 | 2026-10-19 实测（`--amber` / `--amber-bg`） |
| `--input` / `--card` | **3.37:1** | ≥3 | 2026-10-19 实测（`--border-control` / `--bg-soft`） |
| `--ring` / `--card` | **5.34:1** | ≥3 | 2026-10-19 实测（`--focus-ring` / `--bg-soft`） |
| `--sidebar-foreground` / `--sidebar` | **15.20:1** | ≥7 | 本次实算（新增配对） |
| `--text-3` / `--sidebar` | **5.97:1** | ≥4.5 | 本次实算（新增配对） |

补充实算（未在上表逐条列出，但用于本规范的选择）：`--text` / `--selected` 12.08:1；`--text-2` / `--selected` 5.89:1；`--text-3` / `--drawer-surface` 6.17:1；`--text-2` / `--sidebar` 7.41:1；`--success` / `--card` 5.34:1；`--danger` / `--card` 4.89:1；`--warning` / `--card` 6.49:1；`--input` / `--background` 3.83:1；`--input` / `--sidebar` 3.57:1；`--primary-active` 上的 `--bg` 4.87:1；`--bg` / `--success-hover` 7.49:1；`--destructive-foreground` / `--destructive` 5.56:1；`--warning-foreground` / `--warning` 7.38:1。

**不使用白字**：白字在 `#6FA08B` 上仅 2.97:1，主按钮与强调按钮统一用 `--primary-foreground`（深色 `#14171A`）。

**Phase 2 门**：实现后在真实 Electron 上按同一对色板复测；正文 ≥7、次级/三级/语义 ≥4.5、控件边界/焦点环 ≥3，不得以「看起来还行」放宽。机器守卫可复用原型 `audit` 的对比度函数与配对清单。

### 2.5 颜色使用纪律

- **primary 面积克制**：只用于当前操作、已知正向结果、安全默认动作；不做大面积背景。
- **danger 不做安全动作**：确认卡的「拒绝/取消」是安全动作，用 primary；「放行/执行」用 outline。不要反过来。
- **warning 不是错误红**：未决、未知、一次性审批提示一律 amber；不要用 danger 表示「等你决定」。
- **颜色不单独传意**：每个状态必须有文字（工作中/等待确认/错误/空闲/已失效），图标只是辅助。
- **边框分工**：`--border` 只做分隔线（对 bg 1.39:1，不承担可识别边界）；控件边界用 `--input`（3.37:1）；`--border-strong` 只做强分隔/卡片外框。
- **焦点环**：2px `--ring` + 3px offset；任何 `outline: none` 必须同时给出等效可见环。
- **深色变体必须生效**：项目是深色专用。若组件库用 `.dark` 变体表达深色样式，根节点必须带 `.dark`（或等价地改写为直接引用深色 token）；不得让 `border-border` 等浅色回退成为控件边界。outline/输入控件的边界一律 `--input`。
- **组件库默认环不算规范环**：shadcn 默认的 `ring-3 ring-ring/50` 不是本规范的 2px solid 环；实现需收敛为 `2px solid --ring + 3px offset`（或经设计确认的等效可见环），不得只保留 50% 透明环。

## 三、密度与尺寸系统

### 3.1 间距刻度（Nova 紧凑）

组件内只允许 **2 / 4 / 6 / 8 / 12 / 16 / 24** 七档（px）。页面级内容边距 32（宽档）/24（窄档）是布局常数，不进入组件刻度。

| 档 | 典型用途 |
| --- | --- |
| 2 | 图标与 10px 文本的微间隙、行内状态点与文字 |
| 4 | 徽标内边距、菜单项内图标-文字 |
| 6 | 按钮内图标-文字、胶囊底行 gap、抽屉 section 内 |
| 8 | 按钮左右内边距、树行内 gap、工具行列 gap |
| 12 | 卡片内边距、按钮组 gap、抽屉内容块 |
| 16 | 消息行距、区块间距、抽屉 section 间距 |
| 24 | 页面内容边距、抽屉外边距、确认卡大块间距 |

布局常数（不进组件刻度）：内容列 900；左栏 248（208–360）；右抽屉 424；标题栏 36；会话头 64（窄档 60）；抽屉头 64；宽档内容边距 32、窄档 24；聊天滚动条沟槽 10。

### 3.2 组件高度档

| 档 | 高度 | 用途 |
| --- | --- | --- |
| xs | 24px | 密集工具条按钮、徽标关闭、「定位」等行内动作 |
| sm | 28px | 小按钮、输入区内的发送/停止、图标按钮、菜单项可触区 |
| md | 32px | 默认按钮、输入框、引擎触发器、树行内的动作 |
| lg | 36px | 设置页主操作、空态主按钮（本轮原型未用） |

行高：左树行 48–50px（原型 49.83）；工具活动行约 42–46px（原型 46.09）；菜单项 32px；确认卡按钮 32px；抽屉文档行 32px 动作 + 内容自适应。复选框 14×14；Switch（保留未来）32×18；图标按钮 28×28（密集 24×24）。

### 3.3 圆角、边框、焦点环

| 项 | 值 | 说明 |
| --- | --- | --- |
| 容器圆角 | **8px** | 卡片、抽屉内块、输入胶囊、确认卡 |
| 控件圆角 | **6px** | 按钮、输入框、菜单项、引擎触发器 |
| 微型圆角 | **4px** | 徽标、代码、行内标签 |
| 用户气泡 | 8px / 右下 3px | 保持既有「短确认语句」形状 |
| 控件边框 | 1px `--input` | 对 `--card` 3.37:1；对 `--bg` 3.83:1 |
| 分隔线 | 1px `--border` | 只做结构分隔；不用于控件 |
| 焦点环 | 2px `--ring` + 3px offset | 密集/裁剪容器可用 2px offset；不得删除 |
| 默认焦点 | 确认卡拒绝/取消 | 打开即聚焦；Esc/关闭 = 不放行 |

### 3.4 浮层阴影

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.32)` | 确认卡、一次性提示 |
| `--shadow-dock` | `0 -6px 18px rgba(0,0,0,.35)` | 贴底输入区 |
| `--shadow-drawer` | `-12px 0 42px rgba(0,0,0,.55)` | 右抽屉 |
| `--shadow-popover` | `0 6px 24px rgba(0,0,0,.55)` | 菜单/浮层 |

普通消息、报告卡、任务卡不加阴影；阴影只给「浮起」层级，避免卡片海。

## 四、字体

### 4.1 单一来源

```css
--font-mono: ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Consolas, "Liberation Mono", "Microsoft YaHei", monospace;
--font-sans: var(--font-mono);
```

- 整页等宽（UI/标题/按钮/消息/表格统一走 `--sans`）；中文由 `"Microsoft YaHei"` 兜底；不引入外部字体或专有字体文件。
- 代码/命令/路径继续显式用 `--font-mono`；因为 `--sans` 复用同一栈，视觉一致。
- 数字列（时间、计数、上下文百分比）使用 `font-variant-numeric: tabular-nums`，避免跳宽。

### 4.2 字号 / 行高 / 字重

| 用途 | 字号 / 行高 | 字重 | 备注 |
| --- | --- | --- | --- |
| 元信息、时间、脚注、徽标 | 10.5–11 / 15–16 | 400/500 | 徽标 10；计数 10.5；脚注 10.5–11 |
| 次级 UI、标签、树副行 | 12 / 18 | 400/500/600 | 会话状态、按钮辅助、树标签 |
| 基础 UI、按钮、正文基准 | **13 / 20** | 400/500/600 | body 13px；按钮 13/1 |
| 控件文字、用户气泡 | 14 / 22 | 400 | 用户气泡单行 38–42px（原型 38） |
| 消息正文 | **15 / 27** | 400 | 保持 1.8 行高；不缩 |
| 会话标题 | 18 / 24 | 650 | 角色名 |
| 抽屉标题 | 16 / 22 | 650 | 本轮 Nova 建议 |
| 报告标题 | 21 / 30 | 650 | 保持既有 |
| 品牌字标 | 21 / 25（左栏）；12 / 15（标题栏） | 750 / 600 | 只有品牌用 750；标题栏字距 .08em |

字重只用 400/500/600/650/750；不引入 300/800/900。正文不用字距；只有品牌/eyebrow 使用 0.08–0.12em。行高保持：正文 27px、控件 22px、标签 18px、脚注 16px。

## 五、组件清单与白名单

只允许使用本表组件（shadcn copy-in 清单 + 已登记项目自研组件）。白名单外组件不得进入主界面；临时组件先登记再使用。

| 组件 | 现有界面用途 | 允许 variant / size | 使用场景与约束 |
| --- | --- | --- | --- |
| **Button** | 发送、停止、报告来源、设置保存、确认卡动作、会话头动作、左栏底部 | variant：`primary`/`secondary`/`outline`/`ghost`/`destructive`/项目扩展 `danger-ghost`；size：`xs 24`/`sm 28`/`md 32`/`lg 36`/`icon 28 或 32` | `primary` 只给当前操作与确认卡安全默认动作；`outline` 给放行/执行等风险动作；`ghost` 给工具栏/树底；`danger-ghost` 只给停止本轮。图标按钮必须有 `aria-label`，并配 Tooltip |
| **Input** | 设置字段（Pi/端点/模型/token） | `md 32`；状态：default/invalid/disabled/readOnly | token 字段 `type=password` + 显示按钮；值不回显；错误用文字 + `--danger` 边框，不只靠红 |
| **Textarea** | 输入区 `#inp-message`；其他多行字段 | `sm` 最小高 28；auto-grow 至 160 | 输入区内不加边框（胶囊承担边框）；Enter 发送、Shift+Enter 换行；IME 组合期间不发送 |
| **Dialog** | 保留给非确认类模态面 | `md` | 本轮确认卡用 AlertDialog；Dialog 若使用，内容必须复用卡片族，不自造第二套模态皮肤 |
| **AlertDialog** | shell 确认、恢复确认、su 审批 | 卡片宽 `min(640px, 100%)`；动作 32 | 打开即聚焦「拒绝/取消」；Esc/关闭 = 不放行；等待不设限；零忙碌动效；「放行/执行」为 outline，「拒绝/取消」为 primary |
| **Sheet** | 右抽屉（角色资料/工作概览/设置） | 宽 424；modal | 保留 `role=dialog aria-modal=true`；Esc 关闭；焦点留在抽屉内；关闭后回触发按钮；不改变聊天列宽 |
| **Popover** | 保留给小型上下文浮层 | `md` | 本轮引擎菜单优先 DropdownMenu/Select，不用 Popover 冒充选择器；浮层用 `--popover` + 边框 + `--shadow-popover` |
| **DropdownMenu** | 引擎选择（单选）、未来行溢出菜单 | item 32；radio 组 | 方向键移动、Enter 选中、Esc 关闭并回触发器；当前项有勾选，不只靠底色；与 Select 二选一，不得同时使用 |
| **Select** | 引擎选择（备选实现） | `md 32` | 仅在 ARIA/键盘与现有 `role=combobox`/`aria-haspopup=listbox` 契约逐项对齐后使用；否则用 DropdownMenu radio。二者只允许一个 |
| **Checkbox** | 「替我审批」「替我决策」 | 14×14；label 点击 | 开启态用 `--warning` 点 + 文字；不是错误红；Space 切换；默认关；重载复位 |
| **RadioGroup** | 治理单选卡、模型选择 | 行高 ≥40；无默认 | 无默认答案；未选择时提交禁用；改选不提交；选择行 hover `--hover`，选中 `--selected` + 文字 |
| **Switch** | 保留给设置布尔项 | 32×18 | 本轮不用于治理批准/确认；确认语义继续用 Checkbox/Radio + 明确按钮 |
| **Tooltip** | 窗口按钮、图标按钮、截断路径 | 12/13 文本 | 400ms 延迟；不承载唯一信息；触发元素始终有 `aria-label`/可见文字 |
| **Badge** | 工作概览角标、待办计数、状态标签、治理标签 | `neutral`/`warning`/`danger`/`success`/`outline`；10px | 一行最多一个语义徽标；必须带文字；颜色不单独传意；不做「徽标海」 |
| **Separator** | 抽屉 section、菜单分组 | 1px | 只做内容分组；布局结构线用 CSS border，不引入组件 |
| **Resizable** | 左栏宽度 | 208–360，默认 248 | 必须保留现契约：`role=separator`、`aria-valuenow/min/max`、方向键 ±8/Shift ±24、双击复位、`localStorage` 宽度记忆；react-resizable-panels 若不能等价，保留自绘 handle |
| **ScrollArea** | 抽屉长内容、菜单、文档阅读 | 10px 滚动条 | **聊天区不用**：聊天保留原生 `overflow` + 虚拟窗口 + 锚点/底部跟随；不要在聊天里再套 ScrollArea |
| **Card** | 报告、回交、任务卡、确认卡内容块 | 容器 8；header/content/footer | 在流内不加阴影；外框 `--border-strong`；卡头可用 `--success-bg`；不把每条消息做成卡片 |
| **Collapsible** | 工具详情、报告「完整摘要」、高级设置 | 22–32 触发行 | 统一一种展开语法；若保留原生 `<details>`，也必须有同义 ARIA 与键盘；不出现第二套手风琴 |
| **Tabs** | 保留给抽屉页签；当前入口仍是会话头按钮 | 32 触发行 | 若迁移为页签，保留 `tablist/tab/tabpanel`；方向键切换；不把页签做成纯装饰胶囊；未迁移前不改现有按钮语义 |
| **Alert** | 配置缺失、治理状态、一次性提示 | `info`/`warning`/`danger` | 内联呈现，不用 toast 库；一次性提示浮在输入区上方、不推动消息区；`知道了` 可关 |
| **Avatar** | 角色树/抽屉的角色首字 | 28（树）/36（抽屉） | 首字文本，不用 emoji；品牌字标不是 Avatar |

### 5.1 继续自绘的界面元素

| 元素 | 原因 | 约束 |
| --- | --- | --- |
| 自绘标题栏 + 窗口控制 | 无边框窗口、拖动区、Windows 原生双击最大化；不是 shadcn 组件 | 高度 36；控制 46×36；图标 12/1.5；`-webkit-app-region: drag`，按钮 no-drag；焦点环内嵌 |
| 聊天虚拟行与行容器 | 现有行模型、虚拟窗口、锚点/底部跟随、`rowModelDebug` 是测试契约 | 不引第三方虚拟库；不把行包成 Card；不挂动效；保留 `.virt-spacer` 与行高口径 |
| 卡片族皮肤（shell/恢复/治理/交互卡） | fail-closed 语义、逐字证据、默认焦点、动作顺序 | 可用 AlertDialog/Card 提供焦点/portal，但皮肤与动作布局是项目组件；登记台账 |
| 输入胶囊 | 附件、双开关、作用域、停止/发送、脚注的复合布局 | 用 Textarea + Button + Checkbox 组合；胶囊边框由项目层负责；不引入第二套输入组件 |
| 角色树行 | 头像、名称、权力副标题、状态、徽标、roving tabindex | 用 Button/roving tabindex 实现；行高 48–50；选中 2px 竖条；不改成表格 |
| 引擎选择器（自绘 combobox/listbox） | 旧契约 `role=combobox`/`aria-haspopup=listbox`/`role=option`、↑↓/Home/End/Enter/Space/Esc 与 placement 需逐项保留；Base UI Select 不能等价 | 触发器 104×32；菜单 180；当前项有 check；不引第二套菜单库；Phase 2b 起登记为项目自研组件 |
| 工具行 | 42px 时间列、目标、状态、组摘要、截断/异常呈现 | 保持现有行模型与 grid；不挂动效；失败/未知用文字 + 语义色 |
| 品牌字标 `ANS` | 客户品牌；PM Q13 明确为文字，不属 SVG 守卫对象 | 用 `<span>` 文本；不改成手绘图形 |
| 一次性审批提示 | 浮在输入区上方、不占布局、9 秒自动收起 | 用 Alert 皮肤自绘定位；可复用 Button；不引 toast |
| 状态文字映射 | `ui-labels` 单一来源；状态优先级已定 | 不改文案映射；组件只消费映射结果 |

## 六、状态矩阵

### 6.1 交互组件状态

| 组件 | default | hover | focus-visible | active | disabled | loading / error |
| --- | --- | --- | --- | --- | --- | --- |
| Button primary | `--primary` 底 + `--primary-foreground` | `--success-hover` | 2px ring + 3px offset | `--primary-active` | opacity .45，cursor default | loading 时宽度锁定、图标转轮 + 文字；error 不改变按钮本身，由上下文文字呈现 |
| Button outline/ghost | 透明/`--background`，`--text` | `--hover` | ring | `--selected` | opacity .45 | 同上 |
| Button danger-ghost（停止） | `--danger-bg` + `--danger` | `--danger-border` 底 | ring | `--danger-border` | n/a（忙碌时可见） | 不做无限呼吸；只显示文字 |
| Input / Textarea | `--card` 底，`--input` 边框 | 边框不变，背景不变 | Input：边框 `--primary` + 2px ring；Textarea（输入胶囊内）：胶囊 `:focus-within` 边框 `--primary` + 1px 内环，不再叠加外环 | — | opacity .45；placeholder `--text-3` | invalid：`--danger` 边框 + 文字原因；readOnly：背景透明、文字 `--text-2` |
| Checkbox | 14px，`--input` 边框 | 边框 `--text-2` | ring | `--warning` 勾选（审批开关） | opacity .45 | 不支持时禁用 + 文字说明「当前版本不支持…」 |
| Menu item | 透明，`--text` | `--accent` | `--accent` + ring | `--selected` | opacity .45 | 当前项勾选；不做 loading 行 |
| Tree item | 透明，13px 名称 | `--hover` | ring | `--selected` + 2px `--primary` 竖条 + 名称 600 | — | busy：12px 转轮 + 「工作中」；waiting：`--warning` 文字「1 待办」；error：`--danger` 文字 + 图标；idle：`--text-3`「空闲」 |
| Resizer | 透明 + 1px `--border-strong` | 线变 `--primary` | ring（inset） | 拖动中线 `--primary` | — | 无 |
| Tool row | 22px 摘要 + 42–46 活动行 | 弱底 `--hover`（仅活动行） | ring（若可聚焦） | — | — | running：12px 转轮 + 「运行中」；failed/unknown：`--danger`/`--warning` 文字；截断在摘要可见 |
| Confirm action | 同 Button | 同 Button | 同 Button；默认焦点拒绝有可见环 | 同 Button | 未选择/无效时禁用 | 零忙碌动效；失效态文字说明，按钮禁用 |

### 6.2 界面级状态

| 状态 | 何时 | 呈现 | 动作/键盘 |
| --- | --- | --- | --- |
| empty | 无项目/无角色/会话已开启但无消息 | 居中图标 32–36 + 标题 15 + 说明 12.5–13；落在 900 列内；不加卡片 | 空态不抢焦点；主按钮（若有）可 Tab 到达 |
| error | 引擎/模型/凭据缺失、门禁拒绝、恢复失败 | `--danger` 文字 + 原因 + 出路（设置/重试/关闭）；不伪装成功；不用彩色徽章海 | 出路按钮可 Tab；Esc 关闭非模态提示；确认卡错误仍 fail-closed |
| waiting | shell/恢复/治理卡等待确认；队列等待 | `--warning` 边框/左竖条 + 明确文字「等待确认」；无计时器；零忙碌动效 | 默认焦点拒绝/取消；Esc = 不放行；Tab 在卡内循环；关闭回原触发 |
| busy | 角色正在工作、会话加载 | 12px 转轮 + 文字「工作中」；输入区显示停止；发送禁用；不做无效操作 | 停止按钮可 Tab/Space；不自动切角色；不抢阅读 |
| expired / read-only | 确认已失效、请求已答、回放只读 | 文字说明「已失效/已作答」；按钮禁用；保留原记录；不自动重发 | 焦点不困在失效卡；关闭回可见入口 |
| config missing | 引擎未配置/桥缺失 | 头部主提示 + 设置入口；控件禁用并说明「当前版本不支持」；不显示假开启态 | 设置入口可 Tab；Esc 返回原发起按钮 |
| offline / channel error | IPC/通道异常 | 如实标记，不呈现为已执行；提供重试/关闭 | 重试按钮可 Tab；不自动重试循环 |

### 6.3 键盘路径与默认焦点

| 区域 | 行为 |
| --- | --- |
| 全局 | Tab/Shift+Tab 顺序：标题栏 → 左栏 → 会话头 → 消息内可聚焦控件 → 输入区；焦点环始终可见 |
| 确认卡 | 打开即聚焦 **拒绝/取消**；Tab/Shift+Tab 在卡内循环；Esc/关闭（×）= **不放行**；Enter 激活当前焦点；不设默认答案；选择卡未选时提交禁用 |
| 抽屉 | 打开后焦点进入抽屉（容器或关闭钮）；Esc 关闭；焦点返回触发按钮；聊天滚动/草稿/角色/引擎不变 |
| 左栏 | 收起/展开按钮 Enter/Space；resizer 方向键 ±8、Shift ±24、双击复位 248；树行 roving tabindex + ↑/↓/Home/End + Enter |
| 引擎菜单 | 触发器 Enter/Space/↓ 打开；↑/↓ 移动；Enter 选中；Esc 关闭并回触发器；当前项有勾选 |
| 输入区 | Enter 发送；Shift+Enter 换行；IME 组合期间 Enter 不发送；发送禁用时有文字原因；停止与发送并存 |
| 一次性提示 | 不是模态；`知道了` 可 Tab/Enter；不抢焦点；约 9 秒自动收起；Esc 可关（不阻塞） |
| 200% 文字 | 会话头用 `min-height`，卡片/抽屉内容可增长；不裁切；不出现页面横向滚动 |

## 七、动效规范

### 7.1 原则

- **动效只解释层级变化**（抽屉、确认卡、菜单、一次性提示），不装饰内容。
- **聊天热路径禁止挂动效**：虚拟行、工具行、流式消息、消息追加、滚动锚定都不做 transition/animation；不出现打字光标、呼吸、骨架屏、跑马灯。
- **等待确认/恢复卡零忙碌动效**：不能用动画暗示「机器在忙」。
- **全应用只有一种无限动画**：12px 工作转轮（`LoaderCircle`，0.9s linear，transform 旋转）；`prefers-reduced-motion` 下静止弧仍可读。
- **生产只用 `motion/react`**；CSS transition 仅限颜色/背景/边框/opacity 的微状态（≤120ms），不写第二种动画机制；不写 CSS keyframes（转轮由 Motion 驱动）。原型用 CSS transition/keyframes 仅作示意。
- 只动 `transform`/`opacity`/`clip-path`；不动布局属性（宽度/高度/top/left），避免聊天 reflow。

### 7.2 动效令牌与范围

| 场景 | 时长/缓动 | 说明 |
| --- | --- | --- |
| hover / 颜色 / 边框 | 120ms `cubic-bezier(.2,0,0,1)` | Button、菜单项、树行、控件 |
| 抽屉滑入/滑出 | 160ms `cubic-bezier(.2,0,0,1)`；退出 120ms `cubic-bezier(.4,0,1,1)` | clip-path 或 translateX；遮罩 opacity 同步 |
| 确认卡出入场 | 180ms / 120ms | opacity + translateY(4px) + scale(.99)；遮罩 fade |
| 菜单/浮层 | 120ms | opacity + translateY(-4px) |
| 一次性提示 | 160ms | opacity + translateY(4px)；不推动布局 |
| 左栏收起/展开 | 160ms | grid-template-columns + opacity；窄档只做 opacity |
| 工作转轮 | 900ms linear infinite | 仅工作/加载；等待/恢复卡禁用 |

### 7.3 reduced motion

`prefers-reduced-motion: reduce` 下：所有非必要 transition/animation 时长 ≤0.001ms、iteration 1；抽屉/菜单/确认卡直接出现；转轮静止弧仍可辨；状态文字不依赖动画；不得因为降级而隐藏状态或让焦点丢失。

## 八、图标规范

### 8.1 唯一来源

- **Lucide（lucide-react）是唯一图标来源**；不新增手绘 SVG、图标字体或第二套图标库。
- 品牌字标 `ANS` 是文字（`<span>`），不属 SVG 守卫对象；应用图标 PNG 不在渲染层守卫范围。PM Q13 的豁免清单初始为空；确需保留的手绘资源逐项登记理由与来源。
- 原型内的内联 SVG 只是示意占位，**不是生产资产**；生产一律替换为 Lucide 同名图标。

### 8.2 尺寸 / 描边 / 颜色

| 尺寸 | stroke-width | 用途 |
| --- | --- | --- |
| 12px | 1.5 | 行内状态、徽标、chevron、窗口控制 |
| 14px | 1.5 | 紧凑按钮、菜单项、发送箭头 |
| 16px | 1.5 | 默认按钮、树/抽屉动作、文档行 |
| 18px | 1.75 | 输入区附件、醒目图标按钮 |
| 20px | 1.75 | 工具栏/确认卡标题、较大动作 |
| 32–36px | 1.5 | 空态插图（不是 UI 图标档） |

- 颜色一律 `currentColor`，由父级文字色控制；不在图标上写裸色值/渐变/填充色。
- 线端/线接头 `round`；除 Lucide 自带形状外不改路径。
- 图标不单独传意：状态图标必须配文字；图标按钮必须有 `aria-label`，并用 Tooltip 补充。
- 推荐图标名：`Minus`、`Square`、`Copy`（最大化/还原）、`X`、`ChevronDown`、`ChevronRight`、`PanelLeftClose`、`PanelLeftOpen`、`ImagePlus`、`ArrowUp`、`LoaderCircle`、`Clock`、`CircleAlert`、`CircleCheck`、`MessageSquareText`、`FileText`、`ListOrdered`、`ClipboardList`、`Settings`、`Folder`、`Terminal`、`ShieldCheck`、`ShieldAlert`、`Users`。
- 品牌/空态例外：空态用 Lucide 的 `MessageSquareText`/`FileText` 32–36；品牌 `ANS` 用文本；不画吉祥物/装饰插画。

## 九、One-shot 施工契约（设计侧）

### 9.1 五个单一事实源

| 事实 | 唯一来源 | 规则 |
| --- | --- | --- |
| 设计令牌 | `tokens.css` | 颜色/圆角/间距/字阶只此一处；组件禁写裸色值 |
| 界面文案 | 现有 `ui-labels.js`（迁移后 TS 模块） | 文案不散落在组件里；状态词/按钮词走映射 |
| 图标 | `lucide-react` | 不新增手绘 SVG；品牌字标例外 |
| 动画 | `motion/react` | 不写第二种动画机制；尊重 `prefers-reduced-motion` |
| 状态 | zustand store（投影 + 视图状态） | 主进程唯一权威；store 不判边界、不落业务事实 |

### 9.2 组件白名单与台账

- 只允许 §五表内组件；新组件先在桌面UI 的组件台账登记（来源：shadcn 原样/改动 diff、用途、状态矩阵、升级负责人）再使用。
- copy-in 组件源码入仓；记录 shadcn CLI 版本、`components.json` 与生成参数；与源码同批提交。
- 组件改动必须能在台账里重放；升级时按 diff 重放，不直接覆盖。

### 9.3 页面完成定义（DoD）

每个页面/组件在提交评审前逐项自检：

1. **令牌**：组件源码无 `#hex`/`rgb()`/`hsl()` 字面量；颜色/圆角/间距/字阶全部来自 `tokens.css`。
2. **状态矩阵**：§6.1/§6.2 覆盖本页出现的状态；缺状态不上线。
3. **键盘**：Tab 顺序、Esc、Enter、方向键、焦点返回；确认卡默认拒绝；焦点环可见。
4. **双档截图**：960×620 与 1360×860；内容列 900/664；无页面横向溢出；抽屉 424；详情见 §12。
5. **对比度**：按 §2.4 配对实测；正文 ≥7、次级/三级/语义 ≥4.5、控件边界/焦点环 ≥3。
6. **图标**：全部 Lucide；无手绘 SVG；图标按钮有 `aria-label`。
7. **动效**：聊天热路径零动效；等待/恢复卡零忙碌动效；reduced-motion 通过。
8. **DOM 契约**：`window.__ansRenderer`、`#inp-message`、`#btn-send`、`#btn-attach-image`、`#attach-row .attach-chip`、`#chat .msg-user`、`#sidebar-resizer` 的 role/aria/键盘、`.virt-spacer`、`rowModelDebug` 等按 PM M2 契约清单保留。
9. **边界**：渲染层不出现 `node:`/`require(`/`src/` import；不判边界；不落治理事实。
10. **预算**：首屏 JS+CSS ≤300KB gzip；`npm ls` 无重复版本。

### 9.4 禁止模式

- 裸色值、裸圆角/间距；内联样式只允许动态值（宽度、transform、滚动位置），且不得承载颜色/间距/圆角。
- 手绘 SVG、图标字体、第二套图标/动画/状态/拖拽/Markdown 库。
- `transition: all`；聊天热路径 transition/animation；等待/恢复卡忙碌动效。
- 在 store/渲染层做边界判定、持久化治理事实、写「卡已批准」。
- `danger` 用于安全动作；`primary` 绿用于「同意/放行」；颜色单独传意。
- 移除 focus ring；用 `outline: none` 无替代；默认焦点放在「放行/执行」。
- 运行时注入 `<style>`/内联脚本；生产 CSP 放宽。
- 以「更现代」为由改 15/27、900 列、深色石墨或信息架构。

### 9.5 机器守卫

- 依赖宪法/禁入清单/`npm ls`：`test/测试/`（测试角色）。
- 源码级守卫：无裸色值、无手绘 SVG、无 Node/`src/` import、无第二套动画/图标——桌面UI 渲染测试（扩展既有文件或 `test/桌面UI/`）。
- 构建后静态扫描 `dist/index.html`：无内联 `<script>`、`unsafe-inline`、`unsafe-eval`；`modulePreload.polyfill=false`。
- 预算：构建后入口 HTML 实际引用的 JS+CSS gzip ≤300KB。
- 双端 e2e：同一套件按环境变量指向旧/新入口，逐 check 名对照（PM M2）。

### 9.6 黄金样板与实施顺序

**会话头 + 输入区**是黄金样板：组件结构、令牌使用、状态矩阵、文案、测试与守卫全部按最高标准实现。后续每个组件与样板对照评审，「像不像同一个系统」有实物参照。建议顺序：tokens.css → Button/Input/Textarea/Checkbox → 会话头 + 输入区（黄金样板）→ 左栏/Resizable → 聊天行/工具行 → 抽屉/Sheet → 确认卡族 → 设置/文档。

## 十、关键屏说明

以下尺寸为 1360×860 原型实测（960×620 见括号）；颜色/圆角/间距全部来自 §二/§三。

### 10.1 自绘标题栏

- **目的**：窗口身份与窗口控制；不是业务工具条。
- **层级**：36px 高，`--sidebar` 底，下边线 `--border-strong`；品牌 `ANS` 居中（12/600，字距 .08em）；窗口控制 46×36 靠右。
- **状态**：默认 `--text-2`；hover `--hover` + `--foreground`；active `--selected`；关闭 hover `--danger-bg` + `--danger`；焦点环内嵌 2px。
- **键盘**：三个按钮 Tab 可达，Enter/Space 触发；拖动区不抢焦点；双击最大化由系统原生处理。
- **约束**：整条 `-webkit-app-region: drag`；按钮 no-drag；生产不显示「原型」徽标（原型内为演示标记）。

### 10.2 左栏（可拖宽/收起）

- **目的**：项目身份 + 角色树 + 稳定入口；回答「谁在干活」。
- **尺寸**：默认 248px（208–360）；右缘 1px `--border`；内边距 18/16/12；品牌 21/750；项目图标 30；树行 48–50（原型 49.83）；底部按钮 32。
- **层级**：品牌 → 项目 → 「工作空间」标签 10.5 → 角色树（头像 28、名称 13/600、权力副标题 10.5 `--text-3`、状态 10.5）→ 底部入口（切换项目/设置/角色计数）。
- **状态**：hover `--hover`；选中 `--selected` + 内侧 2px `--primary` 竖条 + 名称 600；忙碌 12px 转轮 + 「工作中」；等待 `--warning`「1 待办」；错误 `--danger` + 图标；空闲 `--text-3`。
- **拖宽**：热区 9px，视觉线 1px；hover/拖动 `--primary`；方向键 ±8/Shift ±24；双击复位 248；`aria-valuenow/min/max` 同步。
- **收起**：宽 0，`opacity 0`，`visibility hidden`；内容区左上保留 24×24 展开按钮；状态持久化；900 列与贴底不变。
- **键盘**：收起/展开 Enter/Space；resizer 可聚焦；树行 roving tabindex + ↑/↓/Home/End + Enter。

### 10.3 会话头

- **目的**：当前角色、上下文状态、引擎与两个抽屉入口。
- **尺寸**：min-height 64（960 档 60），下边线 1px；内容 900 列居中（窄档流式 664）；左右内边距 `max(32px, (100%-900px)/2)` / 24。
- **层级**：角色名 18/650 + 副标题 11 `--text-3`；上下文状态 12 `--text-2`；右侧引擎触发器 32（边框 `--input`）+ 工作概览（角标 amber）+ 角色资料。
- **状态**：引擎禁用时降级底色 + 文字；缺配保留主提示与设置入口；上下文状态用文字（已恢复/未开启/错误），不用色点单独传意。
- **键盘**：动作 Tab 可达；引擎菜单 Enter/Space/↓ 打开，↑/↓ 移动，Enter 选中，Esc 关闭回触发器。

### 10.4 聊天空态

- **目的**：诚实说明当前能做什么、为什么不能做；不是营销页。
- **尺寸**：居中于 900 列；图标 32–36 `--text-3`；标题 15/24 `--foreground`；说明 12.5/20 `--text-2`，最大宽 420。
- **场景**：会话已开启但无消息：「会话已开启，可直接输入消息」+「发送第一条消息后，这里会显示对话与工具记录。写入由治理引擎把关，越界操作会在对话中直接提示。」
- **状态**：无项目/无角色用同版式但文案换成对应的真实状态；缺配置给设置入口；不显示假记录、不自动生成摘要。
- **键盘**：空态不抢焦点；主按钮（若有）可 Tab；输入区仍可用。

### 10.5 消息与工具行

- **目的**：按阅读顺序呈现用户消息、助手正文、工具事实与状态。
- **尺寸**：内容列 900（960 档 664）；行距 16；用户气泡 14/22、内边距 8×14、圆角 8/3、最大宽 88%、右对齐；助手 15/27 通栏；系统行左侧 2px 竖条 + 12–12.5；工具组左 2px `--border-strong`，摘要 22px，活动行约 42–46（原型 46.09），时间列 42。
- **层级**：用户气泡 `--card`；助手无背景；工具摘要 `--text-3`，操作 `--text-2`，目标 `--text-3`；状态 10（运行中转轮/失败 `--danger`/未知 `--warning`）。
- **状态**：流式只增加高度，不改列宽；回放淡显；工具失败/截断在折叠摘要可见；等待确认卡不物化为行尾（按锚点落位）。
- **键盘**：消息内按钮/链接可 Tab；工具行可聚焦时 ring；不做整行点击；不以 hover 作为唯一提示。

### 10.6 输入区

- **目的**：发送消息、附件、停止、自动审批开关；始终贴底，回答「什么在等我决定」。
- **尺寸**：通栏 `--card` 底 + 1px 上边线 + `--shadow-dock`；内边距 12/32/10（960 档 10/24/8）；胶囊 900（664），圆角 8，边框 `--input`，内边距 8×12，gap 6；文本框 14/22，min 28，auto-grow 至 160；底行 11；发送/停止 28–32；脚注 10.5。
- **层级**：附件 18 → 替我审批/替我决策（14 复选框 + 11 标签，开启 amber 点）→ 作用域 `--text-2` → 键盘提示 `--text-3`（960 隐藏）→ 发送（primary）/停止（danger-ghost）。
- **状态**：空态占位；聚焦胶囊边框 `--primary` + 1px 内环；未选角色发送禁用；忙碌停止可见；附件行在胶囊上方；一次性警告浮在输入区上方，宽 ≤900，amber 左竖条，不推动消息区。
- **键盘**：Enter 发送、Shift+Enter 换行、IME 组合期间不发送；Space 切换复选框；停止/发送 Tab 可达。

### 10.7 右抽屉

- **目的**：角色资料、待办/队列、设置；不挤压聊天列宽。
- **尺寸**：424px 覆盖层，`--drawer-surface`，左边线 `--border-strong`，`--shadow-drawer`，遮罩 `rgba(0,0,0,.45)`；抽屉头 64（标题 16/650，关闭 28）；内容 16/20，section 间距 16。
- **层级**：角色块（头像 36）→ 待办（amber 卡 + 定位）→ 队列（来源标签 10.5 + 位次）→ 资料（文件行 + 查看 24）。
- **状态**：打开/关闭用 clip-path 160ms；Esc 关闭；关闭回触发；待办角标与抽屉内容同源；无默认打开的业务动作。
- **键盘**：焦点进入抽屉；Tab 在抽屉内；Esc 关闭；关闭后焦点返回「角色资料」。

### 10.8 确认卡（shell / 恢复 / su 审批）

- **目的**：把不可逆/越界动作的请求、逐字证据与安全默认动作放在同一个卡里；fail-closed。
- **尺寸**：宽 `min(640px, 100%)`（原型 640）；max-height 视口 −32；内边距 16/18/14；gap 10；圆角 8；`--background` 底 + `--border-strong` + `--shadow-card`；遮罩 `.55`。
- **层级**：标题 13/600 + 关闭 × → 命令/动作 `pre` 12.5 `--card` → 摘要 13 → 原因 13 `--text-2` → 详情折叠 12.5 → 动作行（风险动作 outline 在左、安全动作 primary 在右）→ 提示 11.5 `--text-3`。
- **状态**：等待无计时器；已答/失效文字说明 + 按钮禁用；su 审批显示档位、命中原因、绕过写边界警告（amber）；恢复卡显示动作/角色/逐字证据；零忙碌动效。
- **键盘**：打开即聚焦「拒绝/取消」（可见环）；Tab 在卡内循环；Esc/关闭 = 不放行；Enter 激活焦点；「放行/执行」永远不是默认焦点。
- **颜色**：安全动作 primary（青灰绿），风险动作 outline；不要用 danger 表示「拒绝」，也不要用 primary 表示「同意」。

| 卡型 | 特有内容 | 动作 | 默认焦点 |
| --- | --- | --- | --- |
| shell 确认 | 命令逐字 `pre`、命中写盘规则、argv/cwd 折叠、逐字证据 | 放行执行（outline）/ 拒绝（primary） | 拒绝 |
| 恢复确认 | 动作、目标角色、逐字证据、详情折叠；等待不设限 | 执行（outline）/ 取消（primary） | 取消 |
| su 审批 | 档位（风险/评审/硬拒）、可见命中原因、绕过写边界警告（amber） | 放行执行（outline）/ 拒绝（primary） | 拒绝 |

## 十一、待验证项与开放问题

| # | 问题 | 现状/建议 | 何时验证 |
| --- | --- | --- | --- |
| Q1 | base-nova CLI 是否可用、实际生成物 | 方向记载 base-nova 为默认基底；Phase 0 以当时 CLI 实测为准；不可用回 PM 重新选择，不硬套 | Phase 0 观感门/取件时 |
| Q2 | Nova 密度 × 整页等宽的观感 | 原型用 64px 会话头、48–50px 树行、64px 抽屉头、约 125px 输入区；可能偏紧或偏松 | 客户观感门 |
| Q3 | AlertDialog/Base UI 的初始焦点 | 必须打开即聚焦拒绝/取消；若 primitives 默认聚焦第一项，需显式 `initialFocus`/ref focus + 可见环 | Phase 2 首件 |
| Q4 | Resizable 与现有 handle 契约 | `react-resizable-panels` 未必提供 ±8/Shift±24/双击复位/相同 aria；不等价就保留自绘 handle | Phase 2 左栏 |
| Q5 | 引擎选择器用 DropdownMenu 还是 Select | 二选一；需与 `role=combobox`/`aria-haspopup=listbox`、方向键/Enter/Esc 逐项对齐 | Phase 2 会话头 |
| Q6 | 聊天区是否用 ScrollArea | 建议不用；保留原生 overflow + 虚拟窗口 + 锚点/底部跟随；ScrollArea 只用于抽屉/菜单/文档 | Phase 3 聊天流 |
| Q7 | `--popover` 取 `#14171A` 还是提亮到 `#1E2328` | 现引擎菜单用 `--bg` + 边框/阴影；提亮会改变菜单观感 | 观感门 |
| Q8 | 「primary = 安全动作」语义 | 确认卡拒绝/取消用 primary，放行/执行用 outline；需产品/PM 确认这是长期语义，不是临时配色 | Phase 0 评审 |
| Q9 | `--text` 以 `#F2F4F6` 还是变更记录的 `#E7E9EB` 为准 | `styles.css` 最终令牌与注释显示客户已提亮；本规范按 `#F2F4F6` 实算；若回退，正文对比度从 16.32 降至 14.78，仍达标 | Phase 2 复测 |
| Q10 | Tailwind v4 的 radius 推导 | `--radius: 8px` 默认推导 sm 4/md 6/lg 8；需确认生成的 Button/Input/Card 使用 md/lg 而非 xl | Phase 1 工具链 |
| Q11 | CSP 与 Motion | 生产 `style-src 'self'`；PM 评审称 React style prop 与 Motion 通过 CSSOM 不受 `<style>`/style 属性限制；需在真实 Electron 验证无 CSP 违规、无 `<style>` 注入 | Phase 1/2 |
| Q12 | 空态文案 | 原型用「会话已开启，可直接输入消息」的角色级空态；无项目/无角色用既有全局空态；需产品确认两套文案的边界 | 观感门/Phase 2 |
| Q13 | 程序化默认焦点的可见环 | 原型用 `is-default-focus` 强制可见；生产需在键盘 modality 下也显示，且不误伤鼠标用户 | Phase 2 |
| Q14 | 960 档抽屉打开时的内容可见性 | 424 抽屉覆盖后仅约 536px 可见；真实 Electron 需确认聊天仍可读、无横向溢出、关闭后回原滚动位置 | Phase 2/5 |
| Q15 | 中文字体回退（Windows） | 等宽栈含 `"Microsoft YaHei"`；Windows 真机未验；不引入外部字体 | Phase 5/发布前 |

**待验证项**：上述 Q1–Q15；另加 Phase 2 的真实 Electron 双档截图、对比度复测、`prefers-reduced-motion` 实机、屏读/键盘完整链、性能与虚拟窗口。设计阶段的原型自检不能替代这些。

## 十二、原型检查记录（2026-10-21）

原型：[2026-10-21_design_ui-platform-nova-prototype.html](2026-10-21_design_ui-platform-nova-prototype.html)。检查证据目录：[2026-10-21-nova-prototype-evidence](2026-10-21-nova-prototype-evidence/)。

### 12.1 方法

- 本机 Google Chrome（headless=new）打开本地 `file://` 原型，`capture=1` 固定窗口为 1360×860 / 960×620；`audit=1` 输出机读 JSON（令牌、对比度、几何、状态）。
- 截图：`1360-chat.png`、`1360-drawer.png`、`1360-shell.png`、`1360-collapsed.png`、`1360-empty.png`、`1360-warning.png`、`960-chat.png`、`960-empty.png`、`960-drawer.png`。
- 原型 SHA-256：`6ebc196aee6300caf54e28137c53971a0bfafc43365b1fc3f44d11be9cf2f72b`；本记录的截图与 `audit-1360.json`/`audit-960.json` 对应此文件，修改原型需重跑。
- 自检模式关闭过渡（`capture`/`no-motion`），量取终态；正常浏览仍用 CSS transition 示意。**这是原型自检，不是真实 Electron、真实业务或屏读验收。**

### 12.2 结果

| 检查项 | 1360×860 | 960×620 |
| --- | --- | --- |
| 窗口尺寸 | 1360×860 | 960×620 |
| 标题栏 / 会话头 | 36 / 64 | 36 / 60 |
| 内容列（会话头/消息/胶囊/脚注） | 均 900；左缘差 **0.0px** | 均 664；左缘差 **0.0px** |
| 右抽屉 | 424 | 424 |
| 正文 | 15px / 27px | 15px / 27px |
| body | 13px / 20.15px | 13px / 20.15px |
| 树行 / 工具行 | 49.83 / 46.09 | 49.83 / 46.09 |
| 页面横向溢出 | 无（1360=1360） | 无（960=960） |
| 抽屉关闭/打开 | classOpen false/true；424 | 同左 |
| 左栏收起/拖宽 | 宽 0；拖到 320；展开回 248 | 同左 |
| shell 卡 | 打开；宽 640；activeElement=`sc-deny`；默认焦点环可见 | 同左 |
| 场景计数 | 1 用户 + 1 助手 + 1 工具行；空态可见 | 同左 |
| 核心对比度配对 | 16/16 通过（§2.4 表内） | 16/16 通过 |

机读结果：`audit-1360.json`、`audit-960.json` 的 `ok=true`，`stateChecks` 全 true。

### 12.3 覆盖与局限

- **覆盖**：两档窗口；标题栏；左栏展开/收起/拖宽；会话头；聊天会话（2 消息 + 1 工具行）；空态；输入区（含双开关/一次性提示）；右抽屉打开；shell 确认卡（拒绝默认焦点）；令牌取值与 16 组对比度。
- **未覆盖**：真实 Electron 44 渲染（字体/滚动条/DPI）、真实数据与长转录虚拟窗口、IME 组合输入、屏读/完整 Tab 链、真实模型/接口、性能、Windows、生产 CSP、Motion 实机、抽屉打开时关闭后的滚动位置。这些不因原型自检通过而通过。
- 原型内联 SVG 只是示意；生产一律 Lucide。原型的 CSS transition/keyframes 只是动效示意；生产由 Motion 实现，聊天热路径不挂动效。

## 十三、同步与边界声明

- 本角色同步更新：[feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)。
- 只写 `角色卡/UIUX设计师/` 内文件；未修改 `app/`、`src/`、`test/`、`package.json`、其他角色目录或历史设计文档；未 git 提交、未部署。
- 本文件是设计规范（status: designed），不是实施、测试或验收记录。观感门与实施范围由客户/PM 确认；Phase 2–4 的实现由桌面UI 按本规范与 PM M1/M2 口径执行。
