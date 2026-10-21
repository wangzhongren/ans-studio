---
id: ui-platform-phase2-shell
type: change
title: UI 平台化 Phase 2：React 渲染器骨架（shadcn/base-nova × 深色石墨）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review, ui-platform-nova, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按产品 revision 2 §六 Phase 2 与 PM M2，创建新渲染器工程、骨架界面、组件台账与契约面清单；与旧渲染器并存
  - date: "2026-10-21"
    kind: implemented
    summary: typecheck/build 通过；两档截图；真实 Electron file:// 冒烟全绿（零 CSP/console 错误）；旧入口与主进程/preload 未动
  - date: "2026-10-21"
    kind: revised
    summary: 按 UIUX Phase 2 设计对齐评审（needs-work）完成 Phase 2b：dark 变体生效、焦点环 2px/3px、primary hover/active、自绘 combobox/listbox 引擎选择器、审批 Checkbox warning 色与廉价打磨项
---

# React 渲染器骨架：与旧渲染器并存，不替换入口

UI 平台化的第二阶段在 `app/renderer/` 内搭起**新的 React 渲染器骨架**：自绘标题栏、可拖宽/可收起的左栏、会话头、空态、贴底输入区、右抽屉与 shell 确认卡演示。**旧渲染器（`app/renderer/index.html` + 7 个经典脚本）原样保留，仍是生产入口**；新渲染器使用独立源码入口 `app/renderer/src/index.html`，由 Vite 构建到 `app/renderer/dist/src/index.html`。主进程、preload、`vite.config.ts`、根 `package.json`/`package-lock.json` 均未改动。

这次只做**骨架与组件演示**：没有接会话、发送、附件、真实确认卡或治理判定；所有界面数据均显式标记 demo。测试契约面清单见 [ui-contract-surface](../feature/ui-contract-surface.md)。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `app/renderer/tsconfig.json`（新建） | strict、`jsx: react-jsx`、`module/moduleResolution: bundler`、DOM lib、`@/* → ./src/*`、`noEmit`；由 `typecheck:renderer` 使用 |
| `app/renderer/components.json`（新建） | `style: "base-nova"`、`rsc: false`、`tsx: true`、`tailwind.css: "src/index.css"`、`tailwind.config: ""`、baseColor neutral、cssVariables、iconLibrary lucide、aliases |
| `app/renderer/src/index.html`（新建） | 生产严格 CSP meta（`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;`）、`#root`、`<script type="module" src="/src/main.tsx">`、`lang=zh-CN`、title「ANS 治理会话工作台」 |
| `app/renderer/src/index.css`（新建） | `@import "tailwindcss";` + 深色石墨令牌（shadcn 标准位、sidebar 位、项目扩展位、布局/阴影/字体/动效）+ `@theme inline` 映射 + 基础样式（等宽栈、13px 基准、滚动条、selection、focus ring、reduced-motion） |
| `app/renderer/src/lib/utils.ts`（新建） | `cn`（clsx + tailwind-merge） |
| `app/renderer/src/lib/platform.ts`（新建） | `window.desktop` 安全守卫与窗口控制子集类型；缺失/异常不抛错；逐方法可用性 |
| `app/renderer/src/components/ui/`（新建） | shadcn base-nova copy-in 16 个组件 + [台账](../../../../app/renderer/src/components/ui/README.md) |
| `app/renderer/src/main.tsx`、`App.tsx`（新建） | React 挂载、CSP 违规诊断、整体布局、resizable Group/Panel、抽屉/确认卡 |
| `app/renderer/src/shell/`（新建） | `TitleBar`、`Sidebar`、`ChatHeader`、`EngineSelect`、`Composer`、`Drawer`、`ConfirmCard`、`shell.css` |
| `app/renderer/src/stores/`（新建） | `ui-store.ts`（zustand：侧栏宽度/收起、抽屉、演示引擎/角色选择、localStorage 两键）；`confirm-demo-store.ts`（演示卡） |
| `app/renderer/src/demo-data.ts`（新建） | 显式 demo 项目/角色数据 |
| `app/renderer/src/test-driver.ts`（新建） | `window.__ansRenderer` 骨架子集 + `unimplemented` 清单，不造假实现 |
| `角色卡/桌面UI/docs/feature/ui-contract-surface.md`（新建） | M2 契约面清单（四套件 + renderer.test.ts、三态表、双端逐 check 执行方式） |
| `角色卡/桌面UI/docs/change/2026-10-21-phase2-evidence/`（新建） | 两档截图 + Electron 冒烟报告/截图 |
| **未改** | 旧 `app/renderer/index.html`、`renderer.js`、`styles.css` 等经典文件；`app/main.ts`、`app/preload.cjs`、`app/desktop/`；根 `package.json`/`package-lock.json`/`vite.config.ts`/`tsconfig.json`/`.gitignore`；测试目录（本任务不新建测试文件） |

## 前后差别（用户能看到什么）

- **旧界面**：`electron app/main.ts` 仍加载 `app/renderer/index.html`，行为逐字不变。
- **新界面（骨架）**：只能通过 `vite` dev/preview 或直接 `loadFile(app/renderer/dist/src/index.html)` 看到。它按 UIUX Nova × 石墨规范呈现：36px 标题栏、248px 左栏（208–360）、900 内容列、15/27 正文、64px 会话头、424px 右抽屉、640px 确认卡；标题栏窗口按钮在真实 Electron 中生效，在浏览器中禁用并显示「窗口控制不可用」。
- **演示边界**：角色树/项目/会话/空态/设置均为 demo；发送按钮禁用并标注「演示骨架：发送未接入业务」；附件、停止、双开关禁用占位；确认卡仅由 `window.__ansRenderer.openConfirmDemo(payload)` 打开，不调用 IPC、不执行命令。

## 组件取件（shadcn CLI）

- CLI：`npx shadcn@latest` **4.22.1**；`style: base-nova`（Base UI）。
- 命令与组件清单：见 [组件台账](../../../../app/renderer/src/components/ui/README.md)。
- 取件过程两个 CLI 行为已处理并留痕：
  1. CLI 要求目标目录有 `package.json` 才能读取 `components.json`；使用**临时存根**（列出根已安装依赖，避免安装），取件后删除。根清单零改动。
  2. CLI 把 `@/lib/utils` 误解析为 npm 包 `cn`，并在 `app/renderer/` 下生成了重复 `node_modules`/`package-lock.json`；已删除，15 处导入改回 `@/lib/utils`。**没有引入 `cn` 包。**
- 圆角/过渡/遮罩/阴影按规范就地收敛（控件 6 / 容器 8 / 徽标 4；无 `transition: all`；遮罩用 `--backdrop-strong`；浮层阴影用 `--shadow-popover`），逐项见台账。
- `tw-animate-css` 未安装；registry 的 `animate-in` 类为惰性类。抽屉动画由 `motion/react` 实现。

## 实现要点

- **令牌单一来源**：`src/index.css` 的 `:root` 是唯一色值/圆角/布局/字体/动效来源；`@theme inline` 只做工具类映射；组件与 shell 样式无裸色值（机器扫描零命中）。
- **左栏**：`react-resizable-panels`（shadcn resizable 封装）的 `Group/Panel` 负责布局；交互手柄按 UIUX Q4 允许**自绘**（旧契约 ±8/Shift ±24、双击复位 248、`aria-valuenow` px、pointer 拖动、localStorage 两键）。`flushSync` 保证同一事件轮次内宽度/aria 更新（旧 e2e 口径）。
- **输入法保护**：`compositionstart/end` 状态、`isComposing`、`keyCode 229` 三重保护；组合期 Enter 不拦截、不发送；组合结束后普通 Enter 被拦截（本阶段无发送通道，显示演示提示）。
- **抽屉**：`AnimatePresence` + `motion.aside`（160ms 入 / 120ms 出，`prefers-reduced-motion` 由全局媒体查询降级）；遮罩点击/Esc 关闭；打开聚焦关闭钮、关闭回 `#tab-card`；Tab 在抽屉内循环。
- **确认卡**：`AlertDialog` + Motion 入场（180ms）；命令逐字 `<pre>`；拒绝为默认焦点（`initialFocus` + 可见环）；Esc/×/拒绝 = 不放行；「放行执行」为 outline；等待不设限、零忙碌动效；卡片宽 640、遮罩 `--backdrop-strong`。
- **CSP**：生产 meta 严格；Base UI 官方 `CSPProvider disableStyleElements` 关闭 `ScrollArea` 的内联 `<style>`（否则 `style-src-elem` 违规）；不补 `base-ui-disable-scrollbar` 隐藏规则，保留令牌化 10px 滚动条。
- **测试驱动**：`window.__ansRenderer` 仅实现骨架真实具备的成员（`state`、`selectRole`、`selectRuntime`、`openConfirmDemo`、`sidebar`、`drawer`、`confirmDemo`、`send.disabled`、`composer.state`）；其余列入 `unimplemented`（`loadProject`、`rowModelDebug`、`paneDebug`、`replayAnchorDebug`、`governance`、`shellJudge`、`decisionJudge`、`onRecoveryConfirm` 等），不造假。

## 验证命令与真实结果

| 命令/检查 | 结果 |
| --- | --- |
| `npm run typecheck:renderer` | **通过**（0 错；TypeScript 7，`baseUrl` 已移除、使用相对 paths） |
| `npm run build:renderer` | **通过**；`dist/src/index.html` 0.58kB、JS 556.3kB（gzip 176,510B）、CSS 63.8kB（gzip 11,984B）（Phase 2b 最终） |
| 生产产物 CSP 扫描 | `dist/src/index.html` 仅 1 个外部 `<script type="module" src=...>`；0 内联脚本、0 `<style>`、0 `style=`、无 `unsafe-inline/unsafe-eval`；CSP meta 逐字为严格策略 |
| gzip 预算（入口引用资产，`gzip.compress(level=9)`） | JS 176,510B + CSS 11,984B + HTML 389B = **188,883B**（约 184KiB / 189kB）≤300KB（Phase 2b 最终；引擎选择器改自绘后 Base UI menu 代码被 tree-shake） |
| 两档截图 | `docs/change/2026-10-21-phase2-evidence/1360x860-default.png`、`960x620-default.png`（Chrome 155 headless；本机 `vite preview --port 5199`） |
| 真实 Electron `file://` 冒烟（Phase 2b 最终） | `SMOKE_DONE=1`，**49 项断言全 true**：`#root` 挂载、模块脚本执行、样式加载、深色面、标题栏 36、侧栏 248、内容列 900、胶囊 900、发送禁用、preload 桥、窗口按钮可用；引擎选择器 combobox/listbox/option/零 CSP、抽屉 424/Esc/焦点返回；确认卡 640/默认焦点 `sc-deny`/命令逐字/Esc 拒绝；侧栏拖 328/双击 248/Shift+→272/收起/展开保留；IME 组合 Enter 不发送；`html.dark` 生效、`#sc-allow` 边界 `rgb(107,117,126)`、焦点环 2px solid/offset 3px、primary hover `rgb(127,178,155)`/active `rgb(94,143,122)`、Checkbox 选中 `rgb(196,161,95)`、引擎选择器 combobox/listbox/option ARIA 与键盘选择、960 窄档 scope 后缀隐藏；`NO_DID_FAIL_LOAD=true`、`NO_CSP_OR_MODULE_CONSOLE_ERRORS=true`、`CONSOLE_MESSAGES=0` |
| `git diff --check` | exit 0（全局与 `app/renderer`/`角色卡/桌面UI`/`test/桌面UI` 范围） |

补充：Vite 对 raw JS >500kB 给出提示（556.3kB），这是**未压缩**体积提示；入口引用资产 gzip 合计 188,883B，Phase 2 预算达标。若 Phase 5 需要进一步缩小首屏，可在不改变行为的前提下做按需拆分（不在 Phase 2 范围）。

Electron 冒烟脚本在 `/tmp/ans-phase2-file-smoke.cjs`（不在仓库内），报告与截图在 `docs/change/2026-10-21-phase2-evidence/electron-smoke/`；证据目录已删除 `user-data`。

## 未验证项（如实列出）

1. **真实聊天流**：消息行、回放、虚拟窗口、行模型/`rowModelDebug`、锚点、工具行、系统行均未实现（Phase 3）。
2. **真实发送/附件/停止/双开关**：发送禁用占位；`#attach-row .attach-chip`、`#btn-halt` 行为、主进程权威开关均未接（Phase 3/4）。
3. **真实确认卡/恢复卡/治理卡**：只用演示载荷；无 `shell:confirm-request`/`recovery:confirm-request`/`operator-*` 订阅（Phase 3）。
4. **真实引擎选择/设置/Pi 面板**：自绘 EngineSelect 只改本地演示状态；无 runtime 会话、无设置字段（Phase 4）。
5. **真实窗口控制**：仅在开发态 Electron 冒烟中验证 preload 桥与按钮启用；未在打包安装包中验证（Phase 5）。
6. **Tailwind v4/Base UI 在 Chromium 152 的完整兼容性**：冒烟覆盖骨架控件；长列表/菜单/抽屉滚动/200% 文字/屏读未验。
7. **bench-storm**：未运行；Phase 3 前由测试固化旧基线并定义阈值。
8. **`prefers-reduced-motion`**：仅全局媒体查询与 Motion 组合；未在真实 Electron 中逐项实测。
9. **Windows 字体回退/DPI/窗口最小尺寸**：未测。
10. **`dist/index.html` 路径**：本阶段产物是 `dist/src/index.html`；Phase 5 入口切换由桌面窗口/装配决定最终路径。

## 与 UIUX 规范的偏差（需评审确认或后续阶段处理）

1. **引擎触发器（Phase 2b 已解决）**：改为自绘 `EngineSelect`，恢复旧 `role=combobox` / `aria-haspopup=listbox` / `aria-controls` / `aria-expanded` / `aria-activedescendant` 与 `role=listbox` + `role=option` + `aria-selected`；`DropdownMenu` 组件保留供未来行溢出菜单，不再用于引擎选择。
2. **右抽屉用 ScrollArea**：Base UI ScrollArea 的内联样式元素被 `CSPProvider disableStyleElements` 关闭；`base-ui-disable-scrollbar` 隐藏规则有意不补，滚动条保持令牌化 10px。若 UIUX 要求滚动时隐藏，需要 CSP 兼容方案（nonce/外部 CSS）。
3. **确认卡动画**：已有 Motion 入场（180ms，opacity + translateY(4px) + scale(.99)）；退场动画仍缺（AlertDialog 卸载时序），引擎菜单入场动画也缺（registry `animate-in` 类惰性）。若观感门要求，Phase 3 用 Motion 补。
4. **空态文案**：使用「会话空态（演示骨架）」而非生产「会话已开启，可直接输入消息」，避免在未接会话时假装会话已开启；演示说明另起一行。
5. **演示徽标**：「演示骨架」在标题栏左侧、DEMO 徽标在树/项目/角色资料处；Phase 5 生产入口需移除这些演示标记。
6. **`--border-strong` 令牌**：规范 §2.5/§10 引用但 §2.3 未列出；按既有深色石墨 `styles.css` 的 `#3A4148` 加入 `:root`，并映射 `--color-border-strong`。
7. **窄档内容列**：按规范公式 `max(32px, (100%-900px)/2)`；960 展开时 664、收起时约 896（与旧实现「900」的记录可能差几像素，按 CSS 公式为准）。
8. **焦点环**：确认卡默认焦点用静态 `outline` 类常显（原型 `is-default-focus` 同法）；真实键盘 modality 下的 `:focus-visible` 细化留 Phase 3。
9. **组件隐藏 input**：Base UI Checkbox 的 `id` 落在隐藏 input 上；旧 e2e 若直接读 `#auto-approve-toggle.checked`，Phase 3/4 需按真实 DOM 调整。
10. **未装 `tw-animate-css`**：菜单/弹层入场动画惰性；如需，走 PM 准入。
11. **Motion 覆盖范围**：抽屉使用 `motion/react`（160ms 入 / 120ms 出）；确认卡使用 Motion 入场（180ms，opacity + translateY(4px) + scale(.99)）；工作转轮使用 Motion（UIUX §7.1 唯一无限动画，0.9s linear）。确认卡的**退场**动画与引擎菜单的入场动画暂缺（AlertDialog/DropdownMenu 的 registry `animate-in` 类惰性）；若观感门要求，Phase 3 用 Motion 补，不引入第二套动画库。
12. **演示文案**：标题栏「演示骨架」、树/项目/角色资料的 DEMO 徽标、`#composer-demo-status` 的演示提示均为 Phase 2 标记；Phase 5 生产入口移除。

## 边界核对

- 只写：`app/renderer/`、`角色卡/桌面UI/`（含 `docs/change/2026-10-21-phase2-evidence/`、`docs/feature/ui-contract-surface.md`、本记录）。
- 未写：`test/桌面UI/`（本任务不新建测试文件）；`app/main.ts`、`app/preload.cjs`、`app/desktop/`；根 `package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`.gitignore`；旧 `app/renderer/index.html`/`renderer.js`/`styles.css` 及 7 个经典脚本；其他角色目录。
- 渲染进程无 Node/fs import、无 `src/` import、无边界判定（机器扫描零命中）。


## Phase 2b 修正（2026-10-21，UIUX 设计对齐评审 needs-work 后）

评审记录：[UIUX Phase 2 设计对齐评审](../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase2-review.md)（只读，status: needs-revision）。按评审 §8.1/§8.2 与协调者派发，逐项修正如下；只改 `app/renderer/` 与 `角色卡/桌面UI/`。

| # | 评审项 | 修正 | 证据（计算样式/ARIA） |
| --- | --- | --- | --- |
| 1 | 深色变体未生效 | `src/index.html` 的 `<html>` 加 `class="dark"`；Base UI 的 `dark:` 工具类全部生效；outline Button 边界回 `--input`；Input/Textarea/Checkbox/Switch 深色面复核 | `HTML_DARK_CLASS=true`；`#sc-allow` `border-color: rgb(107,117,126)`（--input，对 bg 3.83:1） |
| 2 | 焦点环未收敛 | Button/Input/Textarea/Checkbox/Switch/菜单项统一 `focus-visible:outline-2 outline-offset-3 outline-ring`；`index.css` 增加未分层规则把 `--tw-outline-style` 从 `outline-none` 的 none 复原为 solid；确认卡默认拒绝环保留 2px/3px | `FOCUS_RING_2PX_3PX=true`（2px solid `rgb(111,160,139)`，offset 3px） |
| 3 | primary hover/active 方向 | Button 默认变体 `hover:bg-success-hover`（#7FB29B）、`active:bg-primary-active`（#5E8F7A）；outline/ghost/secondary 的 hover/active 按 `--hover`/`--selected` 收敛；disabled opacity 0.50→0.45；默认字号 14→13 | `PRIMARY_HOVER_SUCCESS_HOVER=true`（rgb(127,178,155)）；`PRIMARY_ACTIVE_TOKEN=true`（rgb(94,143,122)）；`BUTTON_FONT_13=true` |
| 4 | 引擎选择器契约未决 | 评审决定**不改契约**；新增自绘 `src/shell/EngineSelect.tsx`（旧 engine-selector 的 combobox/listbox/option + ↑↓/Home/End/Enter/Space/Esc/Tab + 视口 placement），替换 DropdownMenu；Electron 冒烟实测 ARIA/键盘 | `ENGINE_SELECTOR_CLOSED_ARIA`、`ENGINE_SELECTOR_OPEN_ARIA`、`ENGINE_SELECTOR_KEYBOARD_BROWSE/SELECT`、`ENGINE_SELECTOR_FOCUS_RETURN/ESC` 全 true；菜单 180px、触发器 104×32 |
| 5 | 审批 Checkbox 选中色 | `checkbox.tsx` 的 `data-checked` 由 primary 改 `--warning`（背景/边框/对勾文字），`dark:data-checked` 同步 | `CHECKBOX_CHECKED_WARNING=true`（rgb(196,161,95)） |
| 6 | 角色树 roving tabindex/↑↓/Home/End | **本轮未做**（评审允许随 Phase 3 树迁移处理）；已保留 `data-role-id`/`aria-current`，契约表标注 Phase 3 | 变更记录未验证项 |
| 7 | 960 窄档 scope 后缀 | `#composer-scope` 的「· 演示」拆成 `.composer-scope-demo`，≤1100px 隐藏；角色/引擎保持可见 | `NARROW_SCOPE_DEMO_HIDDEN=true`（960 档 pane 664、无横向溢出） |
| 8 | ScrollArea thumb | `scroll-area.tsx` thumb `bg-border`→`bg-[var(--scrollbar-thumb)]` | 组件源码/台账 |
| 9 | 图标尺寸/描边 | ChevronDown 13→12；Square 1.75→1.5；Check/ChevronRight 显式 stroke 1.5；Folder 18→1.75 | 组件源码/台账 |
| 10 | 禁用发送视觉 | `#btn-send` 禁用时 `bg-secondary` + `text-text-2` + opacity 1（中性底，不再绿色暗示可用） | `SEND_DISABLED_NEUTRAL=true`（rgb(37,42,48) / rgb(167,173,181)） |

**验证（Phase 2b）**：
- `npm run typecheck:renderer` 通过；`npm run build:renderer` 通过。
- 真实 Electron 44.7.0 `file://` 冒烟：**49 项断言全 true、零 console、零 did-fail-load、零 CSP 违规**；报告 `docs/change/2026-10-21-phase2b-evidence/electron-smoke/report.json`。
- 两档截图（覆盖默认/引擎菜单/确认卡放行 hover+焦点）：`docs/change/2026-10-21-phase2b-evidence/1360x860-{default,engine-menu,confirm-allow}.png`、`960x620-{default,engine-menu,confirm-allow}.png`；CDP 计算样式 `cdp-styles.json`。
- CSP 扫描：`dist/src/index.html` 仅 1 个外部 module script、0 内联脚本/`<style>`/`style=`/`unsafe-*`。
- gzip 预算（level 9）：JS 176,510B + CSS 11,984B + HTML 389B = **188,883B** ≤300KB。
- `git diff --check` exit 0。

**Phase 2b 未修正/留待后续**：
- 角色树 roving tabindex/↑↓/Home/End（Phase 3 树迁移）。
- 确认卡退场 Motion、引擎菜单入场 Motion（若观感门要求；不引第二套动画库）。
- 空态文案、Phase 5 演示标记与 `dist` 最终入口（按评审留对应阶段）。
- 960 档 scope 只隐藏「· 演示」后缀；角色/引擎完整。
