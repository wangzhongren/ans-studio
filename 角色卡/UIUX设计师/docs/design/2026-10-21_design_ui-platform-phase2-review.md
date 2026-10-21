---
id: ui-platform-phase2-review
type: design
title: Phase 2 React 骨架设计对齐评审（Nova × 深色石墨）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-nova, ui-platform-phase2-shell, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对 Phase 2 React 骨架（未替换旧入口）完成只读设计对齐评审；结论 needs-work，三项 Phase 3 前必须修正（深色变体未生效、焦点环、primary hover）加一项 Phase 3/4 前契约决定（引擎选择器），其余可随 Phase 3/4 处理
  - date: "2026-10-21"
    kind: reviewed
    summary: Phase 2b 修正复核通过（设计对齐 pass）：dark 变体、焦点环、primary hover/active、EngineSelect combobox/listbox、Checkbox warning、960 scope、滚动条/图标/禁用发送均已实测；剩余项按 Phase 3/4/5 计划
---

# Phase 2 React 骨架设计对齐评审

**评审对象**：桌面UI 的 [Phase 2 React 骨架变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md)（status: implemented-unverified，2026-10-21），以及同批证据 [2026-10-21-phase2-evidence](../../../桌面UI/docs/change/2026-10-21-phase2-evidence/)、实现 `app/renderer/src/`（App、shell/*、stores/*、index.css、components/ui/*）、契约面清单 [ui-contract-surface](../../../桌面UI/docs/feature/ui-contract-surface.md)。
**设计依据**：[Nova × 深色石墨规范](2026-10-21_design_ui-platform-nova.md)（status: designed，revision 1）。
**评审性质**：只读实现与截图/冒烟报告；未改 `app/` 代码、未跑真实模型或网络、未提交。本文是设计对齐意见，不是产品验收、测试结论或实施授权；修正由桌面UI 按 PM 派发执行。

## 一、结论

> **Phase 2b 更新（2026-10-21）**：下述 needs-work 项已由桌面UI 修正并复核通过（设计对齐 **pass**）；本节保留为 Phase 2 当轮结论，最新实测与剩余项见文末[「Phase 2b 复核」](#phase-2b-复核2026-10-21)。

**needs-work（不通过设计对齐，需修正后复核）。** 骨架的令牌单一来源、布局尺寸、组件来源、图标纪律、Motion 范围、确认卡 fail-closed、抽屉焦点、侧栏 resizable 都基本对齐，Phase 2 作为骨架是扎实的；但存在 **3 项 Phase 3 前必须** 的横切问题，外加 **1 项 Phase 3/4 前必须的契约决定**：

1. **深色变体未生效**：`@custom-variant dark` 以 `.dark` 为祖先，但 `src/index.html` 的 `<html>` 没有 `.dark`。所有 `dark:` 工具类被编译成 `.dark *` 作用域，实际不命中。最直接的可见后果：确认卡「放行执行」outline 按钮的边框回退到 `--border #2C3238`（对背景 **1.39:1**），而规范要求控件边界用 `--input #6B757E`（对背景 **3.83:1**）。这不是观感偏好，是控件边界对比度不达标。
2. **全局焦点环未按规范收敛**：Button/Input/Textarea/Checkbox/菜单项使用 `outline-none` + `focus-visible:ring-3 ring-ring/50`（3px、50% 透明、无 offset），规范要求 2px solid `--ring` + 3px offset。确认卡的默认拒绝焦点用了正确的 `confirm-default-focus`（2px/3px，实测通过），但其余键盘焦点没有统一。
3. **primary 按钮 hover 不是 `--success-hover`**：Button 默认变体是 `hover:bg-primary/80`，会在深底上变暗；规范状态矩阵要求 hover 用 `--success-hover #7FB29B`（提亮）。active 也未显式使用 `--primary-active`。
4. **引擎选择器契约未决（Phase 3/4 前必须）**：实现用 DropdownMenu radio，触发器的 `aria-haspopup="menu"`，旧契约是 `role=combobox`/`aria-haspopup=listbox`/`role=option`。交互（方向键/Enter/Esc/单选）可用，但旧 e2e 的选择器与 ARIA 断言会不等价；必须在 Phase 3/4 前二选一：恢复 combobox/listbox 语义，或由 PM/测试批准契约变更并同步更新 e2e，不得静默改变。

其余为可随 Phase 3/4 处理的打磨项（见 §8.3）。Phase 2 骨架本身不要求真实聊天流、发送或治理通道，这些未实现项不构成不通过理由。

## 二、取证与方法

- 只读读取实现、变更记录、契约清单与证据；未运行 npm/构建/测试，未改 `app/`。
- 查看两档截图：`1360x860-default.png`、`960x620-default.png`；Electron 冒烟截图：`electron-file-smoke-default.png`、`electron-drawer.png`、`electron-confirm.png`；冒烟报告 `report.json`/`report.txt`。
- 只读复测：用本机 Google Chrome headless + 本地 HTTP 静态服务载入已构建的 `app/renderer/dist/src/index.html`，通过 CDP 读取计算样式与 ARIA（不写仓库、不改实现）。这是对构建产物的只读抽查，不是 Electron 验收；Electron 证据以桌面UI 的冒烟报告为准。
- 关键实测值：`html.className` 为空；`#sc-allow` computed `border-color: rgb(44,50,56)`、`border-width: 1px`；`#sc-deny` 默认焦点、outline 2px/3px、背景 `rgb(111,160,139)`；`#runtime-select` `aria-haspopup="menu"`；1360 档标题栏 36、侧栏 248、`.chat-pane` 与 `.capsule` 均 900；960 档 `.chat-pane`/`.capsule` 均 664、页面 `scrollWidth=960` 无横向溢出；960 档 `#composer-scope` clientWidth 120、scrollWidth 124（截断 4px）。

## 三、令牌落地（规范 §2）

### 3.1 映射逐项核对

| 规范 §2 项 | 实现 `index.css` | 结果 |
| --- | --- | --- |
| `--background` / `--foreground` | `#14171a` / `#f2f4f6` | 一致（大小写不影响） |
| `--card` / `--card-foreground` | `#1e2328` / `#f2f4f6` | 一致 |
| `--popover` / `--popover-foreground` | `#14171a` / `#f2f4f6` | 一致 |
| `--primary` / `--primary-foreground` | `#6fa08b` / `#14171a` | 一致；主按钮深字正确 |
| `--secondary` / `--secondary-foreground` | `#252a30` / `#f2f4f6` | 一致 |
| `--muted` / `--muted-foreground` | `#1e2328` / `#949ba4` | 一致 |
| `--accent` / `--accent-foreground` | `#252a30` / `#f2f4f6` | 一致 |
| `--destructive` / `--destructive-foreground` | `#c97a6d` / `#14171a` | 一致 |
| `--border` / `--input` / `--ring` | `#2c3238` / `#6b757e` / `#6fa08b` | 一致 |
| `--sidebar` / `--sidebar-foreground` / `--sidebar-primary` / `--sidebar-primary-foreground` / `--sidebar-accent` / `--sidebar-accent-foreground` / `--sidebar-border` / `--sidebar-ring` | `#1a1e22` / `#f2f4f6` / `#6fa08b` / `#14171a` / `#252a30` / `#f2f4f6` / `#2c3238` / `#6fa08b` | 一致 |
| `--warning` / `--warning-foreground` / `--warning-bg` / `--warning-border` | `#c4a15f` / `#14171a` / `#24211a` / `#4e422a` | 一致 |
| `--success-bg` / `--success-hover` / `--primary-active` | `#22302b` / `#7fb29b` / `#5e8f7a` | 一致（但 Button 未使用 hover/active 值，见 §五） |
| `--danger` / `--danger-bg` / `--danger-border` / `--danger-line` | `#c97a6d` / `#2e2220` / `#5c3832` / `#c97a6d` | 一致 |
| `--text-2` / `--text-3` / `--selected` / `--selected-foreground` / `--drawer-surface` / `--hover` | `#a7adb5` / `#949ba4` / `#2a3037` / `#f2f4f6` / `#171b1f` / `#252a30` | 一致 |
| `--radius` 8 / control 6 / micro 4 | `8px` / `6px` / `4px`；`@theme inline` 推导 sm4/md6/lg8/xl12 | 一致；组件已按台账收敛 |
| `--content-max` 900 / `--sidebar-width` 248 / `--titlebar-h` 36 / `--session-head-h` 64 / `--drawer-w` 424 | 同值 | 一致 |
| `--shadow-card` / `--shadow-dock` / `--shadow-drawer` / `--shadow-popover` / 遮罩 | 与规范同值 | 一致 |
| `--font-mono` 单栈 / `--font-sans` 复用 | 同栈；body 实测 13px、等宽 | 一致 |
| 动效令牌 120/160/180ms、ease | 同值 | 一致 |

**规范缺口（已在本轮补齐）**：实现按既有深色石墨加入 `--border-strong: #3a4148` 并映射 `--color-border-strong`；规范 §2.3 此前漏列该既有令牌。UIUX 已在本轮把 `--border-strong #3A4148` 补入规范 §2.3，并注明「强分隔/卡片外框，不用于控件边界」。这不是实现偏差。

### 3.2 裸色值与第二来源

- `app/renderer/src` 的 `.tsx`/`.ts`/`.css`（除 `index.css` 的 `:root` 令牌外）**零** `#hex`/`rgb()`/`hsl()` 命中；shell.css 全部引用变量。通过。
- 组件台账记录 copy-in 来源、CLI 4.22.1、`components.json`、改动 diff；无第二套 UI/图标/动画/状态库。通过。
- `@theme inline` 只做工具类映射，值仍引用 `:root`；通过。

### 3.3 深色变体问题（必须修）

`index.css` 定义 `@custom-variant dark (&:is(.dark *));`，但 `src/index.html` 的 `<html>` 没有 `class="dark"`。构建 CSS 中 52 处 `.dark` 选择器全部以 `.dark *` 为作用域；实测 `html.className` 为空。后果：

- Button `outline` 变体的 `dark:border-input` / `dark:bg-input/30` / `dark:hover:bg-input/50` 不生效，回退到 `border-border` + `bg-background`。确认卡「放行执行」outline 按钮实测 `border-color rgb(44,50,56)` = `--border`，对 `--background` **1.39:1**，低于控件边界 ≥3:1；规范要求 `--input`（对背景 3.83:1、对 card 3.37:1）。
- Input/Textarea `dark:bg-input/30`、Checkbox `dark:data-checked:bg-primary`、Switch 的 dark thumb 等也不生效。Input/Textarea 的基础 `border-input` 仍在，所以当前输入框边界尚可；但 Phase 4 设置字段的深色输入面会回退为透明底，需要一并确认。
- 这是**一根因、多处果**的横切问题，不是只改一个按钮。建议在根节点加 `.dark`（标准 shadcn 做法），或把相关变体改写为直接引用深色 token；修后必须重跑两档截图、Electron 冒烟和控件边界对比度。

## 四、密度与尺寸（规范 §3/§4）

| 检查 | 实测/实现 | 结论 |
| --- | --- | --- |
| 标题栏 36 | Electron 冒烟 36；1360/960 截图一致 | 通过 |
| 侧栏 248（208–360） | 冒烟 248→328→248→272；收起 0、展开保留 272；`aria`/localStorage 同步 | 通过 |
| 内容列 900 | 冒烟 900；CDP 1360 档 `.chat-pane`/`.capsule` 均 900 | 通过 |
| 960 内容列 | 截图与 CDP 均 664；页面 scrollWidth=960，无横向溢出 | 通过 |
| 正文 15/27、13px 基准 | body 13px 实测；聊天正文尚未实现（Phase 3），空态标题 15、输入 14/22 | 基准通过；15/27 待 Phase 3 验证 |
| 8/6/4 圆角 | `--radius:8` 推导 md6/lg8；按钮/输入 6、容器 8、徽标/复选 4 | 通过 |
| 图标 12–20 / 1.5–1.75 | 绝大多数符合；`ChevronDown 13px`、`Square 12px/1.75`、copy-in Check/Chevron 默认 stroke 2 为小偏差 | 基本通过，列 §六 打磨 |
| 浮层阴影 | `--shadow-card`/`dock`/`drawer`/`popover` 与规范同值 | 通过 |
| 会话头 64 / 窄档 60 | 截图与 CDP 一致 | 通过 |
| 抽屉 424 / 确认卡 640 | Electron 冒烟 424/640 | 通过 |
| 960 输入区 | `#composer-scope` 120px，scrollWidth 124，截断 4px（缺的是「· 演示」后缀，角色/引擎仍可见） | 可接受，列 §六 打磨 |

**Nova 密度判断**：64px 会话头、48–50px 树行、80px 胶囊、64px 抽屉头在两档截图中都成立；没有出现挤压或阅读退化。等宽字体与紧凑间距的组合观感正常。

## 五、组件、图标与动效（规范 §5/§7/§8）

### 5.1 组件来源与白名单

- 16 个 base-nova copy-in 组件 + 自绘 shell 组件，未引入白名单外 UI 库；`components.json` 为 `style: base-nova`，CLI 4.22.1，台账可追溯。通过。
- `Dialog`/`Popover`/`Switch`/`Tooltip` 已取件但本轮未使用或仅 Provider；不算违规。
- `ScrollArea` 用于抽屉（规范允许），聊天区未用；通过。
- `Resizable` 用 Group/Panel + 自绘 handle；handle 契约（role/aria/±8/Shift±24/双击/localStorage）经 Electron 冒烟通过。通过。
- `AlertDialog` 提供焦点/portal，卡片皮肤为项目卡片族；符合规范。通过。

### 5.2 图标

- `app/renderer/src` 内零手绘 `<svg>/<path>/<circle>/<rect>` 命中；全部 `lucide-react`；品牌 `ANS` 为文字。通过。
- 尺寸/描边小偏差：`ChevronDown` 13px（规范档 12/14/16/18/20）、`Square` 12px 用 1.75（规范 12px 用 1.5）、copy-in `CheckIcon`/`ChevronRightIcon` 未显式 stroke（Lucide 默认 2）。不影响 Phase 2 骨架，列 §六 打磨。

### 5.3 Motion

- Motion 仅在 `Drawer`（160/120ms）、`ConfirmCard`（180ms 入场）、`Sidebar` 工作转轮（0.9s linear，规范唯一无限动画）使用；无第二套 JS 动画库。通过。
- 确认卡退场 Motion、菜单入场 Motion 未实现（registry 的 `animate-in` 类因未装 `tw-animate-css` 为惰性类）；规范 §7.2 有 120/180ms 要求，属已知缺口，列 §六。
- 聊天热路径（消息/工具行/流式）尚未实现；骨架的 `.chat`/`.chat-pane` 无 transition/animation，未提前埋动画。通过。
- 一处披露箭头 `svg` 用 CSS transform transition（shell.css `sc-details-trigger`），不在聊天热路径；与规范「CSS 仅颜色/背景/边框/opacity」的严格措辞有出入，列 §六 明确。

## 六、状态与可访问性（规范 §6）

### 6.1 已通过

| 检查 | 证据 | 结论 |
| --- | --- | --- |
| 确认卡拒绝默认焦点 | Electron `CONFIRM_DEFAULT_FOCUS_DENY=sc-deny`；CDP `active=sc-deny` | 通过 |
| Esc/×/拒绝 = 不放行 | 冒烟 `CONFIRM_ESC_DENY` lastDecision=deny；`onOpenChange(false)→close("deny")` | 通过 |
| 确认卡宽 640、命令逐字、等待不设限、零忙碌动效 | 冒烟 640/命令逐字；无计时器；仅 180ms 入场 | 通过 |
| 抽屉 424、Esc、焦点返回、Tab 环 | 冒烟 424/`drawer-close`/`tab-card`/aria-modal | 通过 |
| 侧栏拖/双击/Shift+→/收起/展开 | 冒烟 328/248/272/0/272；aria 同步 | 通过 |
| 侧栏隔离 | `role=separator`、`aria-valuenow/min/max`、`localStorage` 两键 | 通过 |
| IME 组合保护 | 代码三重保护（composingRef、isComposing、keyCode 229）；冒烟组合 Enter 未被拦截、提交后普通 Enter 被拦截 | 逻辑通过；真实发送未接，端到端「不发送」待 Phase 3 |
| 禁用态诚实 | 发送/附件/双开关/切换项目/设置 disabled + title/说明；发送有 `aria-describedby` | 功能上通过；视觉见 §6.2 |
| 颜色不单独传意 | 状态均有文字（工作中/1 待办/错误/空闲）；无彩色徽章海 | 通过 |

### 6.2 未通过/需修

| 问题 | 证据 | 影响 | 分类 |
| --- | --- | --- | --- |
| 深色变体未生效 → outline 按钮边界 `--border` | CDP `#sc-allow` border `rgb(44,50,56)`；1.39:1 | 控件边界 <3:1，确认卡风险动作识别变弱 | **Phase 3 前必须** |
| 全局焦点环 3px/50% 无 offset | Button/Input/Textarea/Checkbox 源码 `outline-none focus-visible:ring-3 ring-ring/50`；确认卡默认环例外正确 | 键盘焦点弱于规范；与旧基线不一致 | **Phase 3 前必须** |
| primary hover 用 `bg-primary/80` | `components/ui/button.tsx` variant default | hover 变暗而非 `--success-hover` 提亮；状态矩阵不符 | **Phase 3 前必须** |
| 引擎触发器 menu 语义 | CDP `aria-haspopup="menu"`、无 `role=combobox`；旧契约 combobox/listbox/option | 旧 e2e 与屏读语义不等价 | **Phase 3/4 前必须（契约决定）** |
| 禁用发送仍为 primary 绿（50% 透明） | 截图 1360/960 发送钮呈绿色；`disabled:opacity-50` | 功能禁用且已标注，但视觉上仍可能读作可用 | 可随 Phase 3/4 打磨（建议中性禁用底） |
| 双开关选中色为 primary | `checkbox.tsx data-checked:bg-primary`；规范审批开启态用 `--warning` | Phase 2 开关禁用，未显形；启用前需改 | Phase 3/4 前必须（启用双开关前） |
| 输入/文本域深色底 | `dark:bg-input/30` 未生效，基础 `bg-transparent` | 组合输入区由胶囊提供底，暂可；Phase 4 设置字段需确认 | 可随 Phase 3/4 打磨 |
| 树行 roving tabindex/↑↓/Home/End | 当前每行是独立 button；契约表标 Phase 3 | 角色树键盘导航未完整 | Phase 3 前必须（随树迁移） |

## 七、已知偏差逐项复核

| 偏差 | 复核结论 |
| --- | --- |
| 引擎触发器 DropdownMenu radio（旧 combobox/listbox） | **不通过（契约未决）**。单选/键盘/Esc 可用，但 ARIA 语义变了；Phase 3/4 前必须恢复 combobox/listbox 或由 PM/测试批准契约变更并同步 e2e。契约表已登记，不能只登记不决定。 |
| 960 档输入区右侧文本截断 | **可接受（minor）**。截断的是 `#composer-scope` 的「· 演示」后缀（120 vs 124px），角色/引擎仍完整；建议窄档隐藏演示后缀，由 compose note 与 DEMO 徽标承担。 |
| 标题栏演示徽标 / `window.desktop` 缺失提示 | **通过（诚实呈现）**。浏览器预览显示「演示骨架 + 窗口控制不可用」，Electron 中按钮启用、提示消失；Phase 5 生产入口移除演示标记。符合「能力缺席就说缺席」。 |
| `dist` 入口路径 `dist/src/index.html` | **无设计异议**。Phase 2 构建产物路径由 Vite 入口决定；Phase 5 最终入口由桌面窗口/装配决定，未到切换前不得改 `app/main.ts`。 |
| `--border-strong` 规范未列 | **规范缺口，已补**。实现 #3a4148 与既有深色石墨一致；UIUX 本轮已补入规范 §2.3。 |
| 确认卡无退场动画 / 菜单无入场动画 | **可随 Phase 3/4 处理**。不影响 fail-closed；若观感门要求，用 Motion 补，不引第二套动画库。 |
| 空态文案「会话空态（演示骨架）」 | **Phase 2 可接受**。避免未接会话时假装「会话已开启」；Phase 3 接真实会话后换回规范文案。 |
| 确认卡标题增加 ShieldAlert 图标 | **可接受（minor）**。状态图标+文字符合规范；如坚持与原型一致可去掉，不作为阻塞。 |

## 八、必要修正清单

> Phase 2b 已修正 §8.1 全部、§8.2 第 4/5 项；第 6 项树键盘按计划留 Phase 3；§8.3 多数已做，剩余见文末「Phase 2b 复核」。

### 8.1 Phase 3 前必须

1. **激活深色变体或改写变体**：在根节点加 `.dark`（或把相关 `dark:` 类改为直接引用深色 token），保证 Button outline 的边框为 `--input #6B757E`；复测确认卡「放行执行」边界 ≥3:1，并复查 Input/Textarea/Checkbox/Switch 的深色面。
2. **统一焦点环**：Button/Input/Textarea/Checkbox/菜单项由 `ring-3 ring-ring/50` 收敛为 2px solid `--ring` + 3px offset（或经设计确认的等效可见环）；保留确认卡 `confirm-default-focus` 的 2px/3px。
3. **primary hover/active**：默认 Button hover 改为 `--success-hover #7FB29B`，active 改为 `--primary-active #5E8F7A`；补状态矩阵截图/检查。

### 8.2 Phase 3/4 前必须

4. **引擎选择器契约决定**：Phase 3/4 前二选一——恢复 `role=combobox`/`aria-haspopup=listbox`/`role=option`（Base UI Select 或自绘触发器），或由 PM/测试批准 menu 语义变更并同步 e2e 选择器/断言；在契约表记录旧名→新名与批准依据。
5. **审批 Checkbox 选中色**：启用双开关前改为 `--warning`（或规范确认的 amber 点/文字方案），不要用 primary。
6. **左树键盘导航**：随 Phase 3 树迁移补齐 roving tabindex/↑↓/Home/End（契约表已列）。

### 8.3 可随 Phase 3/4 处理

7. 960 窄档隐藏 `#composer-scope` 的「· 演示」后缀，或给 scope 128px；当前只截断演示后缀。
8. Phase 4 设置字段使用前，确认 Input/Textarea 的深色底为 `--card` 或父面板实底，不依赖未生效的 `dark:bg-input/30`。
9. 确认卡退场 Motion、菜单入场 Motion（若观感门要求）；不引 `tw-animate-css`/第二套动画库。
10. 图标打磨：`ChevronDown` 13→12/14、`Square` 12/1.75→1.5、copy-in Check/Chevron 显式 stroke 1.5/1.75；与 §8 表一致。
11. 抽屉 ScrollArea 的 thumb 由 `bg-border` 改为 `--scrollbar-thumb`（10px 滚动条与全局一致）。
12. Button 默认文字 14→13px（或记录例外）；disabled opacity 0.5→0.45；禁用发送建议用中性底，避免绿色暗示可用。
13. Phase 3 接真实会话后换回规范空态文案「会话已开启，可直接输入消息」。
14. Phase 5 生产入口移除「演示骨架」/DEMO 徽标/窗口控制不可用提示；确认最终 `dist` 入口路径。
15. 披露箭头 CSS transform transition 与「CSS 仅颜色/背景/边框/opacity」的措辞对齐：改成 Motion 或在规范中登记为微动效例外。

## 九、未覆盖与局限

- 未运行真实聊天流、发送、附件、停止、双开关、治理卡、恢复卡、设置与引擎会话；这些是 Phase 3/4 范围，本评审不据此判失败。
- Electron 冒烟是骨架级验证；未覆盖长转录、虚拟窗口、bench、屏读、完整 Tab 链、200% 文字、Windows、DPI、打包安装包、真实模型/网络。
- CDP 抽查在 Chrome headless + 本地 HTTP 构建产物上完成，不是 Electron 运行时；Electron 证据以桌面UI 的 `report.json` 为准。
- IME 冒烟只能证明「组合期 Enter 未被拦截、提交后普通 Enter 被拦截」；由于发送通道未接，不能证明端到端不发送。
- 本评审只读 `app/renderer/src/`、证据与变更记录；未修改实现代码。

## 十、结论与后续

**needs-work（Phase 2 当轮结论；Phase 2b 已修正并复核通过，见文末「Phase 2b 复核」）。** 骨架的令牌/尺寸/组件/图标/Motion/确认卡/抽屉/侧栏基础都对齐，Phase 2 完成度足以作为 Phase 3 的起点；但深色变体、焦点环、primary hover 与引擎契约是横切问题，必须在 Phase 3 前修正，否则会把偏差带进聊天流与所有后续组件。修正后由 UIUX 复核（重点：`#sc-allow` 边界计算值、焦点环计算值、primary hover 截图、引擎触发器 ARIA/键盘、960 scope 截断），再由测试/PM 进入 Phase 3 门。

UIUX 本轮同步：规范 §2.3 补 `--border-strong`，§2.5 增加「深色变体必须生效」「组件库默认环不算规范环」两条规则；[feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md) 各加一条。未改实现代码、其他角色资料或历史文档；未提交。

## Phase 2b 复核（2026-10-21）

**复核对象**：桌面UI [Phase 2b 修正节](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md)（2026-10-21）与 [Phase 2b 证据](../../../桌面UI/docs/change/2026-10-21-phase2b-evidence/)（1360/960 的 default/engine-menu/confirm-allow 截图、`electron-smoke/report.json` 49 项、`cdp-styles.json`）。
**复核方式**：只读实现与证据；另用 Chrome headless + 本地 HTTP 载入构建产物，通过 CDP 抽查 `html.dark`、`#sc-allow` 边框、Checkbox 深色面、确认卡默认焦点与引擎 ARIA。未改 `app/` 代码、未跑真实模型/网络、未提交。
**结论：pass（设计对齐通过）。** Phase 2 评审的 3 项 Phase 3 前必须与 1 项 Phase 3/4 前契约决定均已修正并实测；49/49 Electron 冒烟断言全 true，零 console、零 did-fail-load、零 CSP 违规。剩余项均为原计划的 Phase 3/4/5 工作或非阻塞打磨，不构成 Phase 2b 返工。

### 逐项复核

| # | 评审项 | Phase 2b 结果 | 实测/证据 |
| --- | --- | --- | --- |
| 1 | 深色变体未生效 | **通过** | `<html lang="zh-CN" class="dark">`；`HTML_DARK_CLASS=true`；CDP `html.className="dark"`。`#sc-allow` 边框 `rgb(107,117,126)` = `--input #6B757E`（对背景 3.83:1、对 card 3.37:1），不再是 `--border #2C3238`（1.39:1）。Checkbox 抽查：边框 `rgb(107,117,126)`、未选中背景 `oklab(… / 0.3)`（`dark:bg-input/30` 已生效）；Textarea 在输入胶囊内按规范覆写为透明底（胶囊承担表面）；Input/Switch 的 `dark:bg-input/30`、`dark:data-*` 同类变体现在均在 `.dark` 作用域内。 |
| 2 | 焦点环未收敛 | **通过** | Button/Input/Textarea/Checkbox/Switch/DropdownMenu 项统一 `focus-visible:outline-2 outline-offset-3 outline-ring`；`index.css` 未分层规则把 `--tw-outline-style` 从 `outline-none` 的 none 复原为 solid。冒烟 `FOCUS_RING_2PX_3PX=true`（2px/3px/solid/`rgb(111,160,139)`）；CDP 确认 `#sc-deny` 默认焦点 `outline 2px solid`、offset 3px，且 `active=sc-deny`。Composer Textarea 按规范使用胶囊 `:focus-within`（边框 primary + 1px 内环），是有意例外，不是漏环。 |
| 3 | primary hover/active | **通过** | Button 默认变体改为 `hover:bg-success-hover` / `active:bg-primary-active`；冒烟 `PRIMARY_HOVER_SUCCESS_HOVER` `rgb(127,178,155)`、`PRIMARY_ACTIVE_TOKEN` `rgb(94,143,122)`；默认字号 `text-[13px]`、disabled opacity 0.45。Outline/Ghost/Secondary 的 hover/active 按 `--hover #252A30` / `--selected #2A3037` 收敛；CDP `#sc-allow` hover 背景 `rgb(37,42,48)`；`danger-ghost` 保持 danger-bg/danger-border。 |
| 4 | 引擎选择器契约 | **通过** | 新增自绘 `EngineSelect`，恢复 `#runtime-select` `role=combobox`、`aria-haspopup=listbox`、`aria-controls=runtime-options`、`aria-expanded`、`aria-activedescendant`；`#runtime-options` `role=listbox`，3 个 `role=option` + `aria-selected` + `id=runtime-option-*` + `data-runtime`。冒烟 `ENGINE_SELECTOR_CLOSED_ARIA/OPEN_ARIA/OPTIONS` 全 true；键盘浏览到 Codex、选择后 runtime/label 更新、菜单关闭、焦点回 `runtime-select`；Esc 关闭并回焦点。CDP 补测 Home→Pi、End→Claude、Space 选中 Pi 并回触发器（`runtime=pi`、`hidden=true`、`active=runtime-select`）；菜单 180px、触发器 104×32，1360/960 截图视觉未退化。当前项用勾选 + 前景色标识，活动行用 `--hover`，符合「不只靠底色」。 |
| 5 | 960 scope / Checkbox warning | **通过** | 960 档 `#composer-scope` 的「· 演示」拆为 `.composer-scope-demo` 并在 ≤1100 隐藏；`NARROW_SCOPE_DEMO_HIDDEN=true`（`demoDisplay:none`、`scopeFits:true`、pane 664、无横向溢出），截图显示「产品 / Claude」完整。审批 Checkbox 选中色改为 `--warning`：`CHECKBOX_CHECKED_WARNING=true`（背景/边框 `rgb(196,161,95)`），`CheckIcon` stroke 1.5；Phase 2 仍禁用，未假开启。 |
| 6 | 新增裸色值/第二来源/图标/动画 | **通过** | `src` 内除 `index.css` 令牌外零 `#hex`/`rgb()`/`hsl()`；零手绘 SVG；全部 lucide-react；Motion 仅 Drawer/ConfirmCard/Sidebar 工作转轮（后者为规范唯一无限动画）；无 `transition-all`、无 `@keyframes`；49/49 冒烟零 console/CSP。ScrollArea thumb 改 `--scrollbar-thumb`；ChevronDown 12、Square 12/1.5、Check/Chevron stroke 1.5、Folder 18/1.75 已对齐。 |

### 剩余项（不阻塞 Phase 2b pass）

1. **左树 roving tabindex/↑↓/Home/End**：按原评审与契约表留 Phase 3 树迁移；当前仍是每行独立 button。
2. **确认卡退场 Motion / 引擎菜单入场 Motion**：未做；若观感门要求，Phase 3/4 用 Motion 补，不引第二套动画库。
3. **空态文案、Phase 5 演示标记与最终 `dist` 入口**：按原计划 Phase 3/5 处理；Phase 2b 仍保留「演示骨架」/DEMO/窗口控制不可用提示，诚实标记。
4. **EngineSelect 台账登记**：自绘组件已由 Phase 2b 决策允许；UIUX 已把它补入规范 §5.1 自绘清单；桌面UI 组件台账（`components/ui/README.md`）建议补一行来源/状态/升级负责人（记账项，不影响视觉结论）。
5. **预存在的微动效**：Switch thumb 的 `transition-transform` 与确认卡详情箭头的 CSS transform transition 是 Phase 2 既有，不是 Phase 2b 新引入；若 Phase 4 使用 Switch，建议按规范收敛为 Motion 或登记例外。
6. **DropdownMenu 项字号**：组件仍用 `text-sm`（14px），规范菜单项为 13px；引擎选择已改自绘 13px，DropdownMenu 留作未来行溢出菜单，可在首次使用时收敛。
7. **引擎 Home/End/Space**：CDP 已补测通过（End→Claude、Home→Pi、Space 选中并回触发器）；建议 Phase 3 e2e 固化这三项断言，防止回归。
8. **未使用 variant**：Button `link`、Badge `ghost/link` 等 copy-in 变体仍在组件源码中但未使用；建议守卫/使用审查保持它们不在白名单使用面。

### 状态与边界

- 本次复核只读 `app/renderer/src/`、`app/renderer/dist/` 与桌面UI 证据；未改实现、其他角色资料或历史文档；未提交。
- 评审记录 frontmatter 更新为 `status: designed`，追加本 Phase 2b 复核；原 needs-work 结论保留为当轮历史。UIUX 同步规范 §5.1（EngineSelect 自绘行）、[feature-map](../../feature-map.md)、[memo](../../memo.md)、[changelog](../../changelog.md)。
- 本复核是设计对齐意见，不是独立验收、测试结论或客户批准；Phase 3 仍按 PM/测试门推进。
