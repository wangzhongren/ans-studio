---
id: ui-platform-round
type: design
title: UI 平台化——用 shadcn/ui Nova × 深色石墨重建渲染层
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented
revision: 3
related: [enterprise-stability-uiux, post-v1-product-roadmap]
events:
  - date: "2026-10-21"
    kind: created
    summary: 客户确认 UI 平台化方向并指示「开干」，接受六个推荐默认值；提案交项目管理评审
  - date: "2026-10-21"
    kind: revised
    summary: 按项目管理评审结论修订（需修订）：M1 发布冻结冲突、M2 切换判据不可执行逐条落实；同步 PM 已确定技术结论
  - date: "2026-10-21"
    kind: implemented
    summary: Phase 0–5 实施完成，唯一生产入口切换为 app/renderer/dist/index.html（旧渲染器/vendor/旧守卫测试下线）；5A/5B 门通过（测试 5B 最终验证 verified、UIUX 生产入口终审 pass）；独立验收 AC1–AC8 全部 pass（报告 status 为 verified，AC3/AC8 补正已收口）；验收通过不授予发布，发布流水线未接（M1）
---

# UI 平台化：界面行为不变，生产方式换一套

现在桌面界面的信息架构、深色石墨外观和交互语义都已被客户接受，问题不在「长什么样」，而在「怎么做出来」：界面逻辑集中在一个 6833 行的单文件里，样式是 2086 行、靠文末覆盖层层叠加的 CSS，控件、图标、拖拽、动画全部手写，没有组件层、没有设计系统、没有构建步骤。结果是每加一个界面都像重新发明一次控件，风格与质量靠写的人当场把握——AI 一次性实现时尤其明显，同样的需求，不同轮次产出不同的样子。

本提案把客户 2026-10-21 已确认的方向写成正式提案：**产品行为不变，用一套被钉死的设计系统（shadcn/ui Nova × 深色石墨）与仅作用于渲染层的构建步骤重建界面，让每个界面、每次 AI 实现都产出同一个风格、同一套交互、同一条质量底线。** 同时把「让治理可见」定为产品方向：每个界面只用一眼回答三个问题——谁在干活、什么在等我决定、为什么被拦住。

**状态：已实施（revision 3，2026-10-21）。** 本提案经 PM 评审通过后由属主角色分阶段实施；最终生产入口为 **`app/renderer/dist/index.html`**（HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`），旧渲染器/vendor/旧守卫测试已下线。5A 门与 5B 门均通过（[测试 5B 最终验证](../../../测试/docs/change/2026-10-21_change_phase5b-final-verification.md)、[UIUX 生产入口终审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)）；[独立验收](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)已按 AC1–AC8 重判 **全部 pass**（status: verified；AC3/AC8 补正已收口）——**验收通过不授予提交/发布**，发布流水线未接（M1），公开版本仍为 v1.4.0，发布决定属客户；实施状态、证据与未覆盖项见 §十四。撰写时点本角色只做只读复核，未改任何代码、依赖、构建配置或他人文件。

## 本文的四种标记

| 标记 | 含义 |
| --- | --- |
| **【事实】** | 本角色在写作时点（HEAD `fc1a39c`，2026-10-21）只读核对过的仓库事实，附来源链接 |
| **【客户已确认】** | 客户 2026-10-21 审阅方向后指示「开干」，方向正文与六个推荐默认值被接受；不等于对某个具体文件写入的逐一授权 |
| **【建议】** | 本提案在产品视角给出的建议，待项目管理评审或客户选择，未生效 |
| **【未实施】** | 计划中的行为，代码还没做、没测、没部署 |

行号与行数是写作时点读数，实施前须按当时工作树复核（沿本角色既往记录惯例）。

## 一、问题与依据

### 1.1 问题

桌面界面已经能用，客户也认可它的布局与配色；但它当前的「生产方式」有三个结构性弱点，随功能增长会越来越贵：

1. **单文件 + 级联叠加**：界面逻辑、模板、状态拼装集中在一个大文件里；样式表早期规则不删，靠文末 V2/A2 令牌块逐层覆盖。改一处要先判断哪一层在生效，回滚与评审都靠人记住历史。
2. **没有组件层与设计系统**：按钮、卡片、确认卡、图标、拖拽、动画各自手写。同一类控件在不同界面有细微差异，新界面靠抄旧代码延续风格；「统一设计语言」只能靠人工守护。
3. **质量底线不可执行**：测试对渲染源码做子串断言（因为纯浏览器 IIFE 无法在 node 下 import），无法用「行为」表达质量底线；一次 AI 实现是否合格，取决于当次会话是否恰好遵守了所有未写下来的约定。

这三条都是**维护者视角**的成本：客户看不到它们，但它们决定了下一个界面要花多少返工。产品方向（§二）要求界面承担更清晰的治理表达，如果生产方式不变，每加一个状态面都会放大上述成本。

### 1.2 事实依据（只读核对）

| 事实 | 读数 | 来源 |
| --- | --- | --- |
| 渲染层规模 | `renderer.js` **6833 行**、`styles.css` **2086 行**、`index.html` **326 行**（`wc -l`，写作时点） | [renderer.js](../../../../app/renderer/renderer.js)、[styles.css](../../../../app/renderer/styles.css)、[index.html](../../../../app/renderer/index.html) |
| 配套脚本 | 另有 `engine-selector.js`、`markdown.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js` 六个经典脚本 + `vendor/` | [app/renderer/](../../../../app/renderer/) |
| 无前端框架、无构建步骤 | `package.json` 依赖中没有 React/Vue/Svelte 或打包器；桌面以 `electron app/main.ts` 直接运行（Electron **44.7.0**，原生 TS 擦除） | [package.json](../../../../package.json) |
| 唯一 vendor 第三方库 | `markdown-it` **15.0.2**（MIT，UMD 单文件，sha256 已钉；现状——Phase 3 将改 npm 同版本并删除 vendor，见 §4.1） | [vendor/README.md](../../../../app/renderer/vendor/README.md) |
| 图标 | 全部为内联手绘 SVG（`index.html` 14 处、`renderer.js` 21 处、`role-status.js` 1 处，grep 行计数） | [index.html](../../../../app/renderer/index.html)、[renderer.js](../../../../app/renderer/renderer.js)、[role-status.js](../../../../app/renderer/role-status.js) |
| 动画 | 只有 CSS `transition` / `animation`（`styles.css` 28 处），无 JS 动画库 | [styles.css](../../../../app/renderer/styles.css) |
| 左栏拖拽 | 手写：`#sidebar-resizer`（`role=separator`，键盘 ±8/Shift ±24），renderer 内 pointer 逻辑，宽度存 localStorage | [index.html](../../../../app/renderer/index.html)、[renderer.js](../../../../app/renderer/renderer.js) |
| 样式级联叠加 | 文件头注释自述「早期规则保留供旧组件维护，文末 V2 令牌/布局为当前正式覆盖」；全文 **4 个 `:root` 块**（第 8 / 1513 / 1742 / 1778 行） | [styles.css](../../../../app/renderer/styles.css) |
| 测试形态 | 渲染单测是**源码子串/结构守卫**（文件头明说原因：IIFE 无法在 node 下 import，DOM 行为由真实 Electron e2e 覆盖）；e2e 已有 `main.mjs`、`uiux-v2.mjs`、`ime-enter.mjs`、`bench-storm.mjs`、`uiux-design-audit.mjs`，且**依赖测试驱动 `window.__ansRenderer`**（`uiux-v2.mjs` 180 处、`main.mjs` 94 处、`bench-storm.mjs` 8 处，行计数）与 class/data 属性、写死入口路径；仅 `bench-storm.mjs` 支持 `BENCH_RENDERER_DIR` 指向其他渲染目录 | [renderer.test.ts](../../../../test/桌面应用/renderer.test.ts)、[e2e/](../../../../test/桌面应用/e2e/) |
| CSP 现状（生产） | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:` | [index.html](../../../../app/renderer/index.html) |
| 深色石墨主题 | 2026-10-19 客户选择并已实现：正文对比度 **14.78:1**、次级 7.96:1、三级 5.64:1、语义色 ≥4.5:1、控件边框 3.37:1；`color-scheme: dark` | [深色石墨变更记录](../../../桌面UI/docs/change/2026-10-19_change_dark-graphite-theme.md) |
| 布局基线 | 900 内容列、8/6 圆角、正文 15/27、极轻浮层阴影，2026-10-17 企业级稳定感 A1/A2 已验收 | [企业级稳定感设计](../../../UIUX设计师/docs/design/2026-10-17_design_enterprise-stability.md) |
| 整页等宽 | 2026-10-17 客户裁定「字体设置成和 claude code 一样的字体」并选择整页等宽；`--sans` 复用 `--mono` | [styles.css](../../../../app/renderer/styles.css)（令牌段注释） |

### 1.3 结论

不改信息架构与视觉基调的前提下，**换掉界面的生产方式**：引入组件库与设计令牌，把样式与交互从「人工约定」变成「可检查的单一事实源」，把质量底线从「子串守卫」变成「行为断言 + 机器守卫」。这正是客户方向的落点。

## 二、客户原则与产品方向

### 2.1 客户原则（逐字，2026-10-21）

> 优先复用成熟库、组件源代码可控、统一设计语言、严格限制重复依赖；配合指定好各种库，就算 one-shot 也能出很不错的前端。

### 2.2 产品方向：让治理可见（一眼三问）

桌面的独特价值不是「能聊天」，而是**让受治理的工作过程看得见**。每个界面只用一眼回答三个问题：

| 问题 | 界面上对应什么（已有行为，不新增语义） |
| --- | --- |
| 1. 现在谁在干活？ | 角色树忙碌/空闲、当前轮次、引擎（Pi/Codex/Claude）、工作中/排队状态 |
| 2. 什么在等我决定？ | shell/写盘确认卡、恢复卡、提案/任命/排期/验收等治理卡、待办与队列角标、「替我审批/替我决策」开关状态 |
| 3. 为什么被拦住、为什么不能做？ | 门禁拒绝（越界路径）、F6/未接受边界、缺配置（引擎/模型/凭据）、恢复空态——如实呈现，不假装可用 |

配合已确认的五条口味作为验收裁判：**干净；信息在对的上下文；常规提示不打扰（只有异常出声）；每样东西有用（没用就删）；诚实呈现（能力缺席就说缺席）**。

这三个问题不是新功能，而是**对现有状态的呈现契约**：任何新界面若说不清这三件事之一，就是设计缺陷；任何界面若为了「好看」隐藏了其中一件，就违反「诚实呈现」。

### 2.3 行为不变的承诺

本轮**只换生产方式与呈现质量**：IPC/preload 契约不变、治理语义不变、界面文案只在必要时重审、现有交互路径保持不变。新渲染器与旧渲染器在切换前**行为等价**是硬判据（§五、§六）。

## 三、设计语言：Nova × 深色石墨

### 3.1 shadcn/ui Nova 与 base-nova

- **Nova**：2025-12 随 `npx shadcn create` 发布的紧凑样式，减少内边距/间距，面向仪表盘与数据密集界面；它管**密度、圆角、组件比例**，不换颜色和字体。【客户已确认（方向记载）】
- **base-nova**：以 **Base UI** 为无障碍原语（2026-07 起 CLI 默认基底）。【客户已确认（方向记载）】
- 说明：以上两条是客户确认方向中的记载；其发布时间与 CLI 默认值发生在写作时点知识范围之外，**Phase 0 以当时 CLI 实际行为核对**（见 Q3、§八 R8）。

### 3.2 不可逆提醒

`components.json` 的 `style` 在初始化后**不可改**。因此：

1. Phase 0 先以**可检查原型**确认观感（客户确认「观感门」）再初始化；
2. 一旦选定 Nova/base-nova 并开始 copy-in，后续换风格意味着重新 init、重新拷组件、重做视觉回归；
3. 该决定记录在案，不留给实现阶段「顺手调整」。

### 3.3 保留项（不随重建改变）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 深色石墨主题 | 现有令牌色板与实测对比度（正文 14.78:1 等）保留；`color-scheme: dark` | [深色石墨变更记录](../../../桌面UI/docs/change/2026-10-19_change_dark-graphite-theme.md) |
| 整页等宽 | 沿用现有 `--mono` 栈；不引入外部字体 | 2026-10-17 客户裁定 |
| 内容列与字阶 | 900 内容列、正文 15/27、8/6 圆角、极轻浮层阴影 | [企业级稳定感设计](../../../UIUX设计师/docs/design/2026-10-17_design_enterprise-stability.md) |
| 交互语义 | 确认卡默认焦点拒绝/取消、忙碌不做无效操作、状态不靠颜色单独传意 | 同上（§六/§七） |

### 3.4 令牌映射（单一来源）

现有语义令牌（`--bg`、`--bg-side`、`--bg-soft`、`--border`、`--text/--text-2/--text-3`、`--success`、`--danger`、`--amber`、`--focus-ring` 等）映射为 shadcn 的 CSS 变量命名（`--background`、`--foreground`、`--primary`、`--destructive`、`--border`、`--radius` 等），由**唯一令牌文件 `tokens.css`** 承载；组件代码只许引用变量，不许写裸色值。映射过程中对比度实测值不得下降（Phase 2 门）。

### 3.5 组件与状态

Phase 0（UIUX）交付：Nova×石墨规范、令牌映射表、组件清单、**状态矩阵**、关键屏原型。组件清单进入白名单（§七），状态矩阵是每个组件的完成定义（DoD）。

## 四、依赖宪法

### 4.1 唯一选择表

| 用途 | 唯一选择 | 形态/时机 |
| --- | --- | --- |
| UI 组件 | **shadcn/ui** | copy-in，**组件源码入仓** |
| 无障碍原语 | **@base-ui/react** | 运行时依赖（base-nova 基底） |
| 样式 | **Tailwind CSS v4 + CSS 变量** | 构建期 |
| 图标 | **lucide-react** | 运行时依赖 |
| 动画 | **motion**（`motion/react`） | 运行时依赖 |
| 分栏 | **react-resizable-panels**（shadcn resizable 封装） | 运行时依赖 |
| 拖拽 | **@dnd-kit** | 白名单；**首个真实拖拽需求出现才安装** |
| 状态 | **zustand** | 仅做投影 + 视图状态；**主进程仍是唯一权威** |
| Markdown | **markdown-it**（现有 15.0.2） | Phase 3 改 **npm 精确同版本 15.0.2**（`devDependencies`）+ `@types/markdown-it`，删除 `vendor/` 单文件；安全与可复现性不降（PM 2026-10-21 已确定）；不换第二套 |
| 样式工具 | **clsx + tailwind-merge + class-variance-authority** | 运行时/工具 |
| 构建 | **vite + @vitejs/plugin-react + @tailwindcss/vite** | 仅渲染层；构建期 |

### 4.2 禁入清单（客户已确认）

第二套 UI 库（MUI/AntD/Chakra/Mantine）、第二套图标、第二套 JS 动画（GSAP/react-spring/auto-animate/framer-motion 双装）、第二套状态库（Redux/Jotai/Recoil/MobX）、第二套拖拽、第二套 Markdown（react-markdown/remark/rehype）、CSS-in-JS（styled-components/emotion）、路由库、日期库（用 `Intl.DateTimeFormat`）、lodash、Storybook、Radix/React Aria 混源。

### 4.3 准入规则

任何新依赖须回答四问：**现有依赖能否覆盖？shadcn 是否自带？维护状态与体积？谁负责升级？** 由**项目管理批准**、由**装配**落 `package.json`；所有版本**精确锁定**（无 `^`/`~`）；`npm ls` 重复版本检查**本地先做**（CI/发布链路检查延到新冻结源，见 Q1）。

### 4.4 预算

- 运行时**新增直接依赖 ≤ 12 个**；
- 首屏 **JS+CSS ≤ 300KB gzip**（度量方式与执行点见 Q11）。

> **PM 技术结论（2026-10-21，已同步）**：React 等渲染库放 **`devDependencies`**——Vite 打包进 `dist/`，安装包不重复携带 `node_modules`；但**预算口径仍按渲染运行时库计入 ≤12（含 React/react-dom）**：现有清单 10 个（React、react-dom、@base-ui/react、lucide-react、motion、react-resizable-panels、zustand、clsx、tailwind-merge、class-variance-authority），dnd-kit 安装后为 11；构建工具、类型包与「从 vendor 改为 npm 的 markdown-it」不计入新增。其余渲染侧依赖的精确版本在 Phase 1 冻结（Q1）。

## 五、架构影响与治理红线

| # | 约束 | 具体口径 |
| --- | --- | --- |
| A1 | 构建只覆盖渲染层 | Vite `root=app/renderer`、`base './'`、产物 `app/renderer/dist/`、`modulePreload.polyfill=false`（守严格 CSP） |
| A2 | 主进程/preload 保持无构建 | `app/main.ts`、`app/preload.cjs`、`app/desktop/` 不进入 Vite 管线 |
| A3 | 契约零变更 | IPC/preload 契约不变；渲染层不碰 Node/fs；**不出现第二份边界判定**（门禁仍是唯一判定源） |
| A4 | 虚拟滚动 | 移植现有行模型（真实行高 + 行距口径），**不引第三方虚拟库** |
| A5 | 测试翻译与契约面 | 源码子串守卫 → 行为断言；DOM 契约（id/class/data/aria）迁移期原样保留；**同一套 e2e 在新旧渲染器上逐 check 名对照等价**作为切换判据。现有 e2e 依赖 `window.__ansRenderer` 测试驱动与写死入口路径，Phase 2 须产出**契约面清单**（id/class/data/aria/驱动方法），新渲染器提供**同名驱动**接真实 store/动作，各套件可切换目标（M2，见 §十三） |
| A6 | CSP | 生产维持 `script-src 'self'`、`style-src 'self'`；仅 dev 放宽（机制见 Q7） |
| A7 | 边界变更 | 根级新文件 `vite.config.ts` 需 **ANS Team Formation 更新装配 Section 1**；本提案不自行扩权 |
| A8 | 过渡窗口有界 | 旧渲染器保留到切换阶段；过渡期 UI 新需求**只进新渲染器**，旧渲染器**只修阻断缺陷**；切换后旧渲染器下线 |
| A9 | 单一设计源 | 不出现第二套设计系统/令牌/图标/动画/状态库；机器守卫测试兜底（§七） |

## 六、分阶段路线（不写日历工期）

| 阶段 | 产出 | 牵头角色 | 验收口径（门） |
| --- | --- | --- | --- |
| **0 设计门** | Nova×石墨规范、令牌映射、组件清单、状态矩阵、关键屏原型 | UIUX设计师 | **客户确认观感**（components.json 初始化前） |
| **1 工具链** | Vite/Tailwind/shadcn 配置、依赖、scripts、tsconfig、gitignore；**仅本地构建，不接发布流水线** | 装配 | 根 `typecheck` 与 `typecheck:renderer` 通过；脚手架可构建；**首件：真实 Electron `loadFile(dist)` 验证 file:// 下 ES 模块/分块加载** |
| **2 骨架** | 标题栏、左栏 resizable、会话头、输入区、抽屉 Motion、基础组件；**测试契约面清单（id/class/data/aria/驱动方法）** | 桌面UI | 双档截图 + 对比度实测 + 构建通过；**契约面清单产出并通过评审** |
| **3 聊天流** | 虚拟窗口移植、Markdown、工具行、状态徽标、确认/恢复/审批卡族 | 桌面UI | IME 组合输入（现有 `e2e/ime-enter.mjs`；方向口径 26 项，项数以切换时套件为准，见 Q5）、锚点断言、`bench-storm` 不劣化；**契约面清单逐项提供、双端逐 check 名对照通过** |
| **4 资料与设置** | 角色资料/队列、三引擎设置、引擎选择器、治理三权卡 | 桌面UI | 功能回归 |
| **5 切换与审计** | 旧渲染器下线、依赖审计、bundle 预算、**本地打包与真实 Electron 冒烟（不接发布流水线）** | 测试（主导）+ 各属主 | **同一套 e2e 双端逐 check 名对照等价（含 `window.__ansRenderer` 驱动面）**、本地发布包冒烟 |

说明：

- 阶段门槛是**通过/不通过的证据**，不是时间表；每阶段的门由该阶段牵头角色提交、测试角色独立复核（涉及产品面时产品参加）。
- 阶段 3 的「IME 26 项」是客户确认方向中的口径；写作时点现有 `e2e/ime-enter.mjs` 的 `check(` 计数与之不一致（grep 9 处），实际项数须在 Phase 3 前按套件版本核对并重锚（已列入 Q5）——不把未核对的数字写成已验证事实。
- 阶段 2/3/4 都在**新渲染器**内完成；旧渲染器在阶段 5 之前一直可用，且只接阻断缺陷修复。
- **M1 发布冻结（PM 评审，2026-10-21）**：`release.yml` 绑定 `SOURCE_REF=v1.4.0` / `SOURCE_SHA=83eec7ed1966b215d81035cac33d7dda80013f05`；`src/common/装配/release-policy.mjs` 的 overlay 白名单对未列名 `app/` 变更直接抛错；且 v1.4.0 冻结源没有 Vite——在 Phase 1 接 release 会让发布 CI 直接失败。故 Phase 1 只做**本地**工具链与构建，Phase 5 只做**本地**打包/真实 Electron 冒烟；**发布流水线接入留到下一次冻结源/新发布轮，由客户决定**。
- **M2 契约面（PM 评审，2026-10-21）**：现有 e2e 依赖 `window.__ansRenderer` 测试驱动（`uiux-v2.mjs` 约 180 行、`main.mjs` 约 94 行）、class/data 属性与写死入口路径（除 `bench-storm` 的 `BENCH_RENDERER_DIR`）。Phase 2 产出契约面清单（id/class/data/aria/驱动方法）；新渲染器提供**同名驱动**接真实 store/动作；各套件可切换目标；Phase 3/5 双端**逐 check 名对照**。
- **PM 技术结论（2026-10-21，已同步）**：单元测试只测纯逻辑（`.ts`，无 JSX），DOM 行为交 Electron e2e，不引 vitest；Phase 1 **不做** `node --test` 的 JSX 转译，如后续确有需要按准入四问与逐项 PM 批准另议；桌面UI 新测试目录 `test/桌面UI/`（待 ANS Team Formation 更新边界后生效）；markdown-it 在 Phase 3 改 npm 精确同版本 15.0.2 并删除 `vendor/` 单文件；React 等渲染库放 `devDependencies`。
- Phase 1 的 `loadFile(dist)` 若不通过，回退方案二选一：**经典脚本单包**（不走 ES 模块/分块），或**自定义协议**——后者须回 PM 评审。
- **过渡期入口（PM 口径）**：旧入口继续叫 `app/renderer/index.html`；新渲染器在过渡期使用独立 HTML 入口（如 `index.react.html`）并在 Vite 显式指定 `build.rollupOptions.input`，避免把旧 `index.html` 与 7 个经典脚本打进构建；Phase 5 再切换为 `index.html`，使生产 `loadFile(dist/index.html)` 成立。**【已实施】** 5B（2026-10-21）已按 PM §17.1 方案 A 完成：旧 `app/renderer/index.html` 删除、`src/index.html` 移为 `app/renderer/index.html`（内容逐字）、Vite `input` 指向它，生产 `loadFile(dist/index.html)` 成立；本段过渡期措辞仅作历史。
- **类型检查（PM 口径）**：Phase 5 本地验证与新冻结源的发布步骤都应组合根 `typecheck` 与 `typecheck:renderer`，否则渲染层类型错误在发布链路里不可见。

## 七、One-shot 施工契约

客户要的「one-shot 也能出很不错的前端」，靠的不是更强的模型，而是**把约束变成写下来的、可机器检查的事实源**。约定如下：

### 7.1 五个单一事实源

| 事实 | 唯一来源 | 规则 |
| --- | --- | --- |
| 设计令牌 | `tokens.css` | 颜色/圆角/间距/字阶只此一处；组件禁写裸色值 |
| 界面文案 | 现有 `ui-labels.js`（迁移后为 TS 模块） | 文案不散落在组件里 |
| 图标 | `lucide-react` | 不新增手绘 SVG（品牌字标例外，见 Q13） |
| 动画 | `motion/react` | 不写第二种动画机制；尊重 `prefers-reduced-motion` |
| 状态 | zustand store（投影 + 视图状态） | 主进程唯一权威；store 不判边界、不落业务事实 |

### 7.2 组件白名单与台账

- 只允许使用**白名单内**组件（shadcn copy-in 清单 + 明确登记的项目自研组件）；
- 每个组件在台账登记：来源（shadcn 原样/改过的 diff）、用途、状态矩阵、负责升级的人；
- 白名单外组件不进主界面；临时组件须先登记再使用。

### 7.3 状态矩阵即完成定义（DoD）

每个组件在实现前先写状态矩阵：默认/悬停/聚焦/禁用/加载/错误/空/只读/危险操作等；矩阵未覆盖的状态不得上线；确认卡类组件必须保留「无默认答案、默认焦点拒绝/取消、零忙碌动效」的既有纪律。

### 7.4 机器守卫测试

- 依赖白名单：`package.json` 依赖集与宪法一致，`npm ls` 无重复版本；
- 令牌外无裸色值：组件源码 grep 色值字面量（沿深色主题「硬编码浅色审计」先例）；
- 无手绘 SVG：新图标一律 lucide-react（豁免清单另行登记）；
- 无第二套库：禁入清单机器可查；
- 预算：首屏体积检查（执行点见 Q11）。

### 7.5 黄金样板

**会话头 + 输入区**作为黄金样板：组件结构、令牌使用、状态矩阵、文案、测试与守卫全部按最高标准实现；后续每个组件与样板对照评审，「像不像同一个系统」有实物参照。

## 八、风险与对策

| # | 风险 | 表现 | 对策 | 验证点 |
| --- | --- | --- | --- | --- |
| R1 | 聊天流移植回归 | IME 组合输入、虚拟窗口、锚点、滚动跟随在 React 下行为漂移；`window.__ansRenderer` 驱动面与新渲染器不一致 | Phase 2 契约面清单 + 同名驱动；阶段 3 用同一套 e2e 与 bench-storm 把关；移植行列模型不重写语义；U1 偶发项按既有基线登记、不因迁移放松 | 阶段 2/3 门 |
| R2 | 首屏预算超标 | React + Base UI + motion 叠加后超 300KB gzip | 阶段 1/2 早测；motion 按需引入、避免整包；shadcn 只 copy 用到的组件 | 阶段 2/5 门 |
| R3 | copy-in 组件漂移 | 改过的 shadcn 组件与上游脱节，形成第二个设计源 | 台账记录 diff；升级时按台账重放；令牌单一来源 + 裸色值守卫 | 每次组件升级 |
| R4 | `components.json` 风格不可逆 | 初始化后才发现观感不对 | 阶段 0 原型先过客户观感门再 init | 阶段 0 门 |
| R5 | 依赖重复/混源 | Radix 与 Base UI 混用、framer-motion 与 motion 双装 | 精确锁版、禁入清单、`npm ls` 检查、PM 批准新依赖 | 阶段 1/5 审计 |
| R6 | 双渲染器过渡期维护翻倍 | 同一缺陷两边修、UI 需求分叉 | 过渡窗口有界（A8）；新需求只进新渲染器；旧渲染器只修阻断缺陷；阶段 5 下线 | 阶段 5 |
| R7 | 测试守卫短期弱化 | 源码子串卫删掉后，行为断言没补齐 | 先补行为断言再删守卫；DOM 契约（id/class/data/aria）迁移期不变；机器守卫补位 | 阶段 1–5 每门 |
| R8 | Nova/base-nova 事实时点偏差 | 方向记载的 CLI 默认值/可用性与实际不符 | 阶段 0 以当时 CLI 实测核对；不可用即回 PM 重新选择，不硬套 | 阶段 0 |
| R9 | dev/prod 构建差异与 CSP | dev 内联样式/脚本、生产 strict CSP 下行为不同；file:// 下 ES 模块/分块加载失败 | 仅 dev 放宽；生产 CSP 不放宽；**Phase 1 首件 `loadFile(dist)` 验证**，失败回退经典脚本单包或自定义协议（回 PM 评审）；本地发布包上跑 e2e 冒烟 | 阶段 1/5 |
| R10 | 视觉回归 | 令牌映射后对比度或密度偏移 | 阶段 2 复测深色石墨对比度（正文 ≥7 等阈值不放宽）；双档截图对比 | 阶段 2 门 |
| R11 | one-shot 仍靠运气 | AI 不读契约、自由发挥 | 五个事实源 + 白名单 + 状态矩阵 + 机器守卫 + 黄金样板；每批实现先过守卫再接评审 | 每批交付 |
| R12 | 供应链与可复现 | shadcn CLI 取件无记录、组件来源不可复现 | copy-in 源码入仓；记录 CLI 版本与生成参数；运行时不联网 | 阶段 1 审计 |
| R13 | 目标环境差异 | Tailwind v4 / Base UI 与 Electron 44 的 Chromium 版本兼容性 | 阶段 1 设 build target 并在真实 Electron 夹具验证 | 阶段 1 门 |
| R14 | Markdown 安全路径 | 换 React 封装或换 npm 来源时把受控渲染改坏 | Phase 3 改 npm 精确同版本 15.0.2、删除 `vendor/` 单文件；现有受控渲染配置不变；XSS 负例测试必须继续全绿 | 阶段 3 门 |
| R15 | 发布流水线冻结冲突 | `release.yml` 绑 `v1.4.0`/`83eec7e`、overlay 白名单拒未列名 `app/` 变更、冻结源无 Vite；接 release 即 CI 失败 | 本轮**不接发布流水线**：Phase 1 只本地工具链与构建，Phase 5 只本地打包/真实 Electron 冒烟；发布接入留到下一次冻结源/新发布轮，由客户决定 | Phase 5 本地；发布轮另行 |

## 九、客户已确认的决定（2026-10-21「开干」，接受推荐值）

客户审阅「UI 平台化」方向后明确指示「开干」，等于**确认方向并接受下列六个推荐默认值**。逐条记录：

| # | 拍板点 | 客户确认值 | 日期 |
| --- | --- | --- | --- |
| 1 | 构建步骤 | **Vite 只构建渲染层，主进程保持无构建** | 2026-10-21 已确认 |
| 2 | 迁移方式 | **分阶段替换 + 最后切换** | 2026-10-21 已确认 |
| 3 | 虚拟滚动 | **移植现有实现，不引 TanStack Virtual** | 2026-10-21 已确认 |
| 4 | 组件测试 | **不引 vitest，沿用 `node --test`；如需组件级测试用 jsdom + testing-library** | 2026-10-21 已确认 |
| 5 | dnd-kit | **入白名单，首个真实拖拽需求出现才安装** | 2026-10-21 已确认 |
| 6 | Nova 基底 | **base-nova（Base UI）** | 2026-10-21 已确认 |

同批被接受的还有：客户原则（§2.1，逐字）、产品方向「让治理可见」（§2.2）、设计语言（§三）、依赖宪法（§四）、架构影响与治理红线（§五）、分阶段路线（§六）、One-shot 施工契约（§七）。**这些确认不等于对某个具体文件写入的逐一授权**：实施范围、顺序与归属以项目管理评审结论和派发为准。

## 十、与 post-v1 路线图的关系

这不是被暂缓的「再次整体改版 V2」。与 [1.0 之后的产品路线图](2026-10-15_design_post-v1-product-roadmap.md) 的关系：

- **信息架构、深色石墨、整页等宽、交互语义都不变**；改的是**界面生产方式**，服务于路线图 A（真实用户跑通一次交付）/ B（单需求成果验收）阶段的交付质量与一致性；
- 路线图的阶段、目标与未决项不因本提案改变；本提案**不在本轮新增业务功能**；
- 反过来，本提案的切换判据（同一套 e2e 双端逐 check 名对照等价）就是路线图 A 阶段「用发布包真实走通」的前置质量保证之一。

## 十一、交项目管理评审的问题清单

以下问题需要项目管理评审时逐条给出结论或归属；产品侧的建议仅作输入，标【建议】。**PM 已答复项以「PM 结论」标注并保留供追溯；仍未解决的部分继续作为待评审项。**

### A. 归属与边界

**Q1 依赖落地与版本冻结。** 装配落 `package.json`/`package-lock.json`；所有新增版本**精确锁定**（无 `^`/`~`），具体版本由 Phase 1 解析后写入依赖台账并交 PM 按四问批准；安装顺序先构建工具链（`vite`、`@vitejs/plugin-react`、`@tailwindcss/vite`、`tailwindcss`），再按阶段加入运行时库；shadcn CLI 以 **npx 固定版本**使用，不作为项目依赖。`npm ls` 重复版本检查**本地先做**（脚本 + `test/测试/` 守卫），CI/发布链路检查延到新冻结源（当前无通用 CI，release.yml 本轮不改）。**PM 结论（2026-10-21）：React 等渲染库放 `devDependencies`**（Vite 打包进 `dist/`，安装包不重复携带 `node_modules`），但预算仍按渲染运行时库**计入 ≤12**（见 Q11）。**实施中确认**：具体版本与 Electron 44 Chromium 构建目标；`typescript: "^7.0.2"` 与精确锁版规则不一致，Phase 1 一并规范化或由装配记录例外。

**Q2 根级构建配置的写入边界。** **PM 结论（2026-10-21）**：本轮唯一必须新增的根级授权是 **`vite.config.ts`**（归装配，须 Team Formation 更新装配 Section 1 的 `boundary.yaml` 与 `boundary.md`、经客户确认后生效）；`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore` 已在装配边界内；`electron-builder.yml` **无需改动**（`files: app/**/*` 已覆盖 `app/renderer/dist/**`）；`release.yml` 本轮不改（M1）。`app/renderer/` 内的 `components.json`、`tsconfig.json`、`src/`、`dist/` 落在桌面UI 的目录授权内。**tsconfig 拆分（PM 口径）**：根 `tsconfig.json` 排除 `app/renderer`；`app/renderer/tsconfig.json` 归桌面UI（`jsx: "react-jsx"`、DOM lib、`moduleResolution: "bundler"`、`noEmit`）；`package.json` 增 `typecheck:renderer` 归装配。

**Q3 shadcn 取件与可复现。** **PM 结论（2026-10-21）**：桌面UI 负责取件与留痕——记录 shadcn CLI 版本、`components.json` 全文、生成参数与每个 copy-in 组件的来源（原样/改动 diff），与源码同批提交；装配审依赖变更但不代取件。运行时不联网；Phase 0 以固定 CLI 版本实际生成一组组件核对是否提供 `base-nova`，不可用即回 PM。

**Q4 组件目录、台账与测试归属。** **PM 结论（2026-10-21）**：copy-in 组件放 **`app/renderer/src/components/ui/`**（桌面UI）；台账放桌面UI 的 **`docs/feature/ui-components.md`**；守卫按归属拆分——跨仓库的依赖宪法/禁入清单/`npm ls` 守卫放 `test/测试/`（测试角色），渲染源码级守卫（无裸色值、无手绘 SVG、无 Node import、无 `src/` import）由桌面UI 在渲染测试中维护。**桌面UI 新测试目录为 `test/桌面UI/`**（待 ANS Team Formation 更新边界后生效）。

### B. 工程与验证

**Q5 测试迁移与「双端等价」判据（PM 已答复框架，M2）。** 五个套件**全部保留**：`main.mjs`（桌面窗口）整机自检继续跑，新增目标切换，Phase 5 验证新入口；`uiux-v2.mjs`、`ime-enter.mjs`、`uiux-design-audit.mjs`（桌面UI）原样保留断言，增加环境变量目标切换，新渲染器须满足同一 check 名；`bench-storm.mjs`（桌面UI）作为基准台而非通过/失败套件，先固化旧基线，Phase 3 前由测试定义「不劣化」阈值。源码子串守卫**先补行为断言/机器守卫、再删对应守卫**，禁止一次删除整份文件后再补。IME 项数以套件实际 check 为准，Phase 3 前重锚并记录。双端证据由测试按套件输出**逐 check 名对照**，记录到 Phase 5 验收材料。

**Q6 组件级测试的运行方式（PM 已答复，2026-10-21）。** 不引 vitest，不引测试侧转译加载器：**单元测试只测纯逻辑（`.ts`，无 JSX、无 DOM），DOM/组件行为交真实 Electron e2e**；Phase 1 不做 `node --test` 的 JSX 转译。客户已确认的 **jsdom + testing-library 保留为已批准备选**：仅当某组件的纯逻辑无法从 JSX 拆出、且 e2e 无法经济覆盖时，由 PM 逐项批准启用（候选，未启用）。**机制约束**：根 tsconfig 的 `exclude` 只过滤根文件集合，被 `test/` import 的渲染模块仍受根配置约束，因此可被单测 import 的渲染模块必须是不依赖 DOM 的纯逻辑 `.ts`。

**Q7 严格 CSP、dev/prod 差异与 file:// 加载。** **PM 结论（2026-10-21）**：生产 `index.html` 保持现有严格 meta；构建后静态断言 `dist` 无内联 `<script>`、无 `unsafe-inline`/`unsafe-eval`；dev 通过 Vite 插件 `apply:'serve'` 放宽（或 dev 不设 meta），源码 HTML 不长期保留弱策略；`modulePreload.polyfill=false` 并断言产物无内联 polyfill。**额外门**：Phase 1 首件用真实 Electron `loadFile(dist 入口)` 验证 file:// 下 ES 模块/分块加载（脚本执行、`securitypolicyviolation` 零事件、控制台零 CSP/CORS 错误）；失败回退经典脚本单包，或自定义协议（回 PM 评审并计入桌面窗口工作量）。`index.html` 更改归桌面UI，桌面窗口在 Phase 5 一起确认打包载入路径与 CSP。

**Q8 zustand 的边界评审（PM 已阶段性答复，2026-10-21）。** 批准「仅投影 + 视图状态，主进程唯一权威」。Phase 2 前冻结允许切片：项目/角色列表投影、当前选择（角色/引擎/右栏 tab）、按角色的事件/历史行投影、待确认卡与队列的只读投影、纯视图偏好（左栏宽度/收起，沿用现有 localStorage 键）；禁止：边界判定、治理事实持久化、把「卡已批准」写入 store、任何绕过 IPC 的写入；行/卡投影必须来自主进程事件。**待办**：门禁引擎与桌面窗口的只读评估须在各自固定上下文给出，未收到前切片清单不得视为冻结。

**Q9 Markdown 集成形态（PM 已答复，2026-10-21）。** 改为 npm **`markdown-it@15.0.2`** 精确版本（`devDependencies`）+ `@types/markdown-it`，删除 `vendor/` UMD 单文件；保留全部受控渲染配置（`html:false`、链接白名单、图片/表格禁用、类名与 `rel` 规则）并迁移为 TS 封装；XSS 负例先在新封装上全绿，再删 vendor 与旧 sha256 pin 测试（改为版本 + 锁文件断言）。归属：封装与测试归桌面UI，依赖落盘归装配；Phase 3 随聊天流迁移一并完成。离线环境备选（vendor ESM）须 PM 另行批准。

**Q10 虚拟滚动移植的验收面（PM 已答复，2026-10-21）。** 移植行模型、`rowGap` 口径、锚点物化、底部跟随、惰性挂载；保留 `rowModelDebug` 同义字段（`count/lastIndex/operators/rowGap`）与 `.virt-spacer` 行结构供 e2e；2026-10-14 的 `rowGap` 缓存修复必须在 React 实现中保持。U1 偶发项以「同一时段旧渲染器基线是否复现」判定，不在新渲染器上单独放宽；阈值与采样数量由测试在 Phase 3 前书面定义。

**Q11 预算度量与执行点（PM 已答复，2026-10-21）。** React/react-dom **计入** ≤12 口径：现有清单 10 个（React、react-dom、@base-ui/react、lucide-react、motion、react-resizable-panels、zustand、clsx、tailwind-merge、class-variance-authority），dnd-kit 安装后为 11；构建工具、类型包与从 vendor 改 npm 的 markdown-it 不计入新增。度量：构建后入口 HTML 实际引用的 JS+CSS（`<script src>`、`<link rel=stylesheet>`、`<link rel=modulepreload>`）分别 gzip 求和 ≤300KB；装配构建脚本输出数字、测试在 Phase 5 复核；Phase 2 报告不阻断、Phase 5 阻断；超标交 PM 与客户裁定，不静默放宽。

**Q12 过渡窗口与切换权（PM 已答复，2026-10-21）。** 切换由 PM 在收齐「测试**双端逐 check 名对照**证据 + UIUX 视觉确认 + 产品复核 + 客户验收」后宣布；「阻断缺陷」定义为：崩溃/数据丢失、治理卡无法确认或拒绝、IME 误发/无法发送、越界提示失真、打包冒烟失败——由桌面UI 修复，争议由 PM 裁定、测试复验。旧渲染器在 Phase 5 一次性下线，旧文件随同批变更删除，**Git 历史即归档**，不另建归档目录。

### C. 设计与视觉

**Q13 图标守卫与豁免（PM 已答复，2026-10-21）。** 功能性图标全部 `lucide-react`，**包括窗口控制（最小化/最大化/还原/关闭）**与空态插图（用 lucide 对应图形）；品牌字标 `ANS` 是文字（`<span>`），不属 SVG 守卫对象；应用图标 PNG 不在渲染层守卫范围。豁免清单由 UIUX 在 Phase 0 给出，**初始应为空**；确需保留的手绘资源逐项登记理由与来源。

**Q14 发布与 CI 的接入批次（PM 已答复，2026-10-21）。** **本轮不接发布流水线**：Phase 1 只做本地工具链与构建，Phase 5 只做本地打包/真实 Electron 冒烟。依据：`release.yml` 绑定 `SOURCE_REF=v1.4.0` / `SOURCE_SHA=83eec7ed…`，`release-policy.mjs` 的 overlay 白名单对未列名 `app/` 变更直接抛错，且 v1.4.0 冻结源没有 Vite。发布流水线接入留到**下一次冻结源/新发布轮，由客户决定**；届时由装配更新 release 配方与 `release-verify`（断言 dist 入口并冒烟载入它）。**是否新建通用 CI（如 `.github/workflows/ci.yml`）为客户可选决策**，需 Team Formation 给装配新增边界；本轮建议不建。

## 十二、非范围（本轮明确不做）

- 不改信息架构（三栏、抽屉、会话流结构不变）；
- 不改深色石墨主题与已实测对比度；
- 不改整页等宽与字体栈；
- 不改 IPC/preload 契约、治理语义与门禁判定；
- 不做多语言；
- 不引入 Storybook、图表库、路由库、日期库；
- 不做安装器与代码签名；
- 不在本轮新增业务功能；
- 不重开路线图之外的功能范围（O1–O3 等选装不因本提案自动进入）。

## 十三、项目管理评审响应（revision 2，2026-10-21）

评审记录：[项目管理评审与实施口径](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（status: needs-revision）。评审结论：**需修订**（方向与六个默认值成立，无需重议）。两处「实施前必须修订」已在本 revision 落定：

| 编号 | 评审意见 | 本 revision 的落实 | 落点 |
| --- | --- | --- | --- |
| **M1** | 发布冻结冲突：`release.yml` 绑定 `SOURCE_REF=v1.4.0` / `SOURCE_SHA=83eec7ed1966b215d81035cac33d7dda80013f05`；`src/common/装配/release-policy.mjs` 的 overlay 白名单对未列名 `app/` 变更直接抛错；且 v1.4.0 冻结源没有 Vite。Phase 1 接 release 会让发布 CI 直接失败 | **删除 Phase 1 中任何 release 流水线接入**：Phase 1 只做本地工具链与构建；Phase 5 只做本地打包/真实 Electron 冒烟；**发布流水线接入留到下一次冻结源/新发布轮，由客户决定** | §六 Phase 1/5 与说明、§八 R15、Q2、Q14 |
| **M2** | 切换判据不可执行：现有 e2e 依赖 `window.__ansRenderer` 测试驱动（`uiux-v2.mjs` 约 180 行、`main.mjs` 约 94 行）、class/data 属性与写死入口路径（除 `bench-storm` 的 `BENCH_RENDERER_DIR`） | §五 A5 扩为**契约面清单**；Phase 2 产出契约清单（id/class/data/aria/驱动方法）；新渲染器提供**同名驱动**接真实 store/动作；各套件可切换目标；Phase 3/5 双端**逐 check 名对照** | §五 A5、§六 Phase 2/3/5 与说明、§八 R1、Q5、Q12 |

同步进提案的 PM 技术结论（2026-10-21；Q1–Q14 已按评审结论回填，逐条见 §十一）：

1. **React 等渲染库放 `devDependencies`**（Vite 打包进 `dist/`，安装包不重复携带 `node_modules`）；但预算仍按渲染运行时库**计入 ≤12**——现有 10 个、dnd-kit 后 11 个——§4.4、Q1、Q11。
2. **markdown-it 在 Phase 3 改 npm 精确同版本 15.0.2**（`devDependencies`）+ `@types/markdown-it`，删除 `vendor/` 单文件；安全与可复现性不降；封装与测试归桌面UI——§4.1、§六说明、§八 R14、Q9。
3. **不引 vitest**：单元测试只测纯逻辑（`.ts`，无 JSX、无 DOM），DOM 行为交 Electron e2e；Phase 1 不做 `node --test` 的 JSX 转译；jsdom + testing-library 保留为已批准备选（逐项 PM 批准才启用）——§六说明、Q6。
4. **桌面UI 新测试目录为 `test/桌面UI/`**（待 ANS Team Formation 更新边界后生效）；组件落 `app/renderer/src/components/ui/`、台账 `docs/feature/ui-components.md`、守卫按跨仓库/源码级拆分——Q4。
5. **Phase 1 首件包含真实 Electron `loadFile(dist)` 验证 file:// 下 ES 模块/分块加载**（脚本执行、零 CSP/CORS 错误）；失败回退经典脚本单包，或自定义协议（回 PM 评审）——§六 Phase 1、§八 R9、Q7。
6. **构建与类型边界**：唯一新增根级授权 `vite.config.ts`；`electron-builder.yml` 无需改动；`release.yml` 本轮不改；根 tsconfig 排除 `app/renderer`、新增 `app/renderer/tsconfig.json` 与 `typecheck:renderer`——§六 Phase 1 与说明、Q2。
7. **过渡期入口**：新渲染器用独立 HTML 入口并显式指定 `build.rollupOptions.input`，避免把旧 `index.html` 与 7 个经典脚本打进构建；Phase 5 再切换为 `index.html`——§六说明。
8. **契约与套件**：五个 e2e 套件全部保留；Phase 2 契约清单；各套件环境变量切换目标；双端逐 check 名对照；bench 先固化旧基线、Phase 3 前由测试定义「不劣化」阈值——§六、Q5。
9. **zustand 边界**：批准「仅投影 + 视图状态」并列明允许/禁止切片；门禁引擎与桌面窗口的只读评估未收到前，切片清单不视为冻结——Q8。
10. **图标**：功能性图标（含窗口控制与空态插图）全部 lucide-react；品牌字标 `ANS` 是文字、不属 SVG 守卫；豁免清单初始为空——Q13。

## 十四、实施与验证状态（revision 3，2026-10-21）

### 14.1 实施状态

| 阶段 | 状态 | 证据（属主报告，本角色只读引用） |
| --- | --- | --- |
| 0 设计门 | 完成（客户确认 Nova × 石墨观感后初始化） | [UIUX Nova 设计](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-nova.md) |
| 1 工具链 | 完成（Vite/Tailwind/shadcn、`loadFile(dist)` 首件验证） | [装配工具链](../../../装配/docs/change/2026-10-21_change_ui-platform-toolchain.md) |
| 2 骨架 | 完成（PM 门通过，契约面清单产出） | [桌面UI 2 骨架](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md) 等 |
| 3 聊天流 | 完成（PM 门通过：IME/锚点/bench/双端对照） | [桌面UI 3A](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)、[3B](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md)；PM §十/§十一 |
| 4 资料与设置 | 完成（4A/4B 门通过） | [桌面UI 4A](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)、[4B](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)；PM §十二–§十六 |
| 5A 对照与准备 | 门 pass（2026-10-21） | [测试 5A 最终验证](../../../测试/docs/change/2026-10-21_change_phase5a-final-verification.md)、[UIUX 最终视觉审计](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)（revision 3）；PM §二十 |
| 5B 切换与下线 | 门 pass（2026-10-21） | [测试 5B 最终验证](../../../测试/docs/change/2026-10-21_change_phase5b-final-verification.md)、[装配 5B 记录](../../../装配/docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)、[UIUX 生产入口终审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)（revision 4） |
| 独立验收（AC1–AC8） | **pass（全部满足；补正已收口）** | [独立验收报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)（status: verified）：AC1–AC8 全部 pass；AC3 记录旧 uiux 套件版本限制并以 424 名 0 回归证实质等价，AC8 以独立 378 文件候选清单补齐 |

### 14.2 最终生产入口与产物

- **唯一生产入口**：`app/renderer/dist/index.html`（581 B），由 `app/desktop/renderer-entry.ts` 的单一常量解析；`app/main.ts` 生产 `app.isPackaged ⇒ loadFile` 该入口；dev 仅 `ANS_DEV_SERVER_URL` 回环。
- **产物哈希**：HTML `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301`；JS `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`（`index-BVLfGR_D.js`，825,985 B）；CSS `76fad7ce7c7b449d7e3b5f61517555f7f5c9d97e169a81d504289131d6ffc0f6`（`index-DUBNk8-R.css`，108,501 B）。产品复核时本角色 `shasum -a 256` 独立复算一致。
- **预算与 CSP**：gzip 288,530 B（UIUX/装配，含 HTML）/289,095 B（测试，入口 JS+CSS）≤307,200 B；严格 CSP 保持 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`，产物无内联/unsafe。
- **本地包（非发布件）**：`release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，406,507,281 B，sha256 `edeeef19…`；packaged smoke 14/14；`.github/workflows/release.yml`、`release-policy.mjs` 零 diff（M1）。

### 14.3 验证结论（引用，不重跑）

- **测试 5B**：uiux-v2 23/23、main 397 名 `E2E_PASS=true`、IME 26 true、design audit 31/31、单测 142/142、旧基线 504/504、懒挂载 10/10、bench 六指标全过、gzip/CSP/typecheck 通过；G1–G5 无未批准行、`MATCH-FAIL=0`（`OPEN_CARD_AT_ARRIVAL` 已补列 G3，见下）。
- **UIUX 终审**：生产入口 1360/960/200% A–L 全通过，P0 0 / P1 0 / P2 5（登记不阻塞）。
- **独立验收**：**pass**——AC1–AC8 全部满足（[报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)，status: verified）：AC3 的 `OPEN_CARD_AT_ARRIVAL` 已补列 G3（207→206，独立机器核对 380 行、值不匹配 0），旧 uiux 套件版本限制以 424 个旧通过名 0 回归证实质等价；AC8 的契约面/产品复核已收口、同期无关改动已分离、计数与探针口径已修正，独立 378 文件候选清单补齐候选身份。范围限 macOS 本机离线夹具/本地构建/本地打包；验收通过不授予提交/发布。
- **产品面复核**：[2026-10-21 产品面最终轻量复核](../change/2026-10-21_change_ui-platform-final-review.md)——「让治理可见 / 一眼三问」在本轮证据范围内保持，生产方式升级完成，IA/视觉/交互语义未变；结论限产品面，不代替独立验收。

### 14.4 未覆盖（按验收 missing-evidence 原样保留）

真实模型/网络/`.env`、Windows 原生/DPI/屏读、签名/公证/安装器/自动更新、发布流水线/CI、Linux/其他平台、真实主进程卡通道/真实引擎会话——本轮均**未判**，不能用 macOS 离线、zoom factor 200% 或本地包冒充。UIUX P2 ×5 与 `test/测试` 环境红（缺真实 `rg`）如实验证记录在案。

## 附：核对方式与状态声明

- **核对方式**：写作时点（revision 1）HEAD `fc1a39c`，工作树除一份他角色未跟踪文件外干净；revision 2 复核时工作树含其他角色的并行改动，本角色只改提案与三个登记文件。`wc -l` 读数见 §1.2；`package.json`、`styles.css` 令牌段、`index.html` 头部、`renderer.js` 文件头、`vendor/README.md`、`renderer.test.ts` 文件头均为只读阅读；e2e 套件仅列目录、文件头与驱动出现位置，未运行；revision 2 另只读核对 `.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 与 `release-prepare.mjs` 的冻结来源/白名单事实，并只读对照[项目管理评审与实施口径](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)。revision 3（2026-10-21）另只读核对 Phase 5 实施结果：`app/renderer/` 与 `app/renderer/dist/` 目录、三个产物 `shasum -a 256`（与冻结值一致）、`app/desktop/renderer-entry.ts` 与 `app/main.ts` 的唯一入口接线、`dist/index.html` 严格 CSP，以及[测试 5B 最终验证](../../../测试/docs/change/2026-10-21_change_phase5b-final-verification.md)、[UIUX 生产入口终审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)、[装配 5B 记录](../../../装配/docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)、[独立验收](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)与 PM 评审 §十六–§二十。**未启动应用、未重跑测试/e2e/打包、未调用模型或网络、未读 `.env`、未改任何代码/依赖/测试/他人文件。**
- **状态**：本文件是**已实施提案**（status: implemented，revision 3）。Phase 0–5 已由属主角色完成，唯一生产入口为 `app/renderer/dist/index.html`，5A/5B 门通过；独立验收 AC1–AC8 **全部 pass**（status: verified；AC3/AC8 补正已收口），但验收通过不授予提交/发布，发布流水线未接（M1），公开版本仍为 v1.4.0，发布决定属客户。实施状态、证据与未覆盖项见 §十四；产品面复核见[最终轻量复核](../change/2026-10-21_change_ui-platform-final-review.md)。文中的第三方事实（Nova/base-nova 发布时间与 CLI 默认值）来自客户确认的方向正文，本角色未独立复核，Phase 0 以实际 CLI 核对（属主记录）。
