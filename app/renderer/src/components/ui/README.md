# shadcn/ui copy-in 组件台账（base-nova）

- **拉取日期**：2026-10-21
- **registry 来源**：shadcn/ui 官方 registry，`style: "base-nova"`（Base UI 基底，`@base-ui/react` 运行时）
- **CLI**：`npx shadcn@latest`（实测版本 **4.22.1**）
- **命令**：

  ```bash
  npx shadcn@latest add -c app/renderer --yes \
    button input textarea dialog alert-dialog popover dropdown-menu checkbox \
    switch tooltip badge separator resizable scroll-area card collapsible
  ```

- **配置**：见 `app/renderer/components.json`；设计令牌唯一来源 `app/renderer/src/index.css`。
- **依赖**：未新增任何依赖。命令解析出的 `react-resizable-panels` 已在仓库根 `devDependencies`（4.14.8）；`@base-ui/react`、`class-variance-authority`、`lucide-react` 等同样已在。根 `package.json` / `package-lock.json` 未被本角色修改。

## 取件过程留痕（重要）

1. CLI 要求目标目录存在 `package.json` 才肯读取 `components.json`；本次在 `app/renderer/` 临时放置了一个仅用于解析的 `package.json` 存根（其中列出根已安装的依赖版本，避免 CLI 触发安装），**取件完成后已删除**；仓库根清单未动。
2. CLI 4.22.1 把 `@/lib/utils` 别名误解析成 npm 包 `cn`：
   - 生成了 `import { cn } from "cn"`（15 个文件）；
   - 在 `app/renderer/` 下安装了重复的 `node_modules/` 与 `package-lock.json`（含 `cn@0.5.0`）。
   两者均已删除；15 处导入统一改回 `from "@/lib/utils"`。**没有引入 `cn` 这个 npm 包。**
3. `tw-animate-css` 未安装（不在 Phase 1 依赖清单，且新增依赖须 PM 批准）。registry 组件里的 `data-open:animate-in` / `fade-in-0` / `zoom-in-95` 等类因此是**惰性类**（无 CSS 产出），不影响功能；Phase 2 的抽屉动画由 `motion/react` 实现，菜单/浮层只保留 ≤120ms 的颜色/背景微状态（符合 UIUX §7.1）。
4. Base UI 的 `ScrollArea` 默认会注入一份内联 `<style>`（`base-ui-disable-scrollbar`），在严格 CSP `style-src 'self'` 下被拦截。`App.tsx` 用 Base UI 官方 `CSPProvider` 的 `disableStyleElements` 关闭内联样式元素；类名对应的滚动条隐藏规则**有意不补**，保留令牌化的 10px 滚动条。

## 组件清单

| 组件 | 来源 | 拉取日期 | 本地修改（相对 registry 原样） | Phase 2 用途 |
| --- | --- | --- | --- | --- |
| `button.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 `@/lib/utils`；`rounded-lg`→`rounded-md`（控件 6px）；`transition-all`→`transition-colors` | 标题栏/会话头/输入区/抽屉/确认卡按钮 |
| `input.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`rounded-lg`→`rounded-md` | 已拉取，Phase 4 设置字段使用 |
| `textarea.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`rounded-lg`→`rounded-md` | 输入区 `#inp-message`（胶囊承担边框，使用处覆写为无边框） |
| `dialog.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；内容/页脚 `rounded-xl`→`rounded-lg`；遮罩 `bg-black/10`→`bg-[var(--backdrop-strong)]` | 已拉取，非确认类模态留用 |
| `alert-dialog.tsx` | base-nova | 2026-10-21 | 同 dialog（含 `rounded-b-xl`→`rounded-b-lg`） | shell 确认卡演示（默认焦点拒绝） |
| `popover.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`shadow-md`→`shadow-[var(--shadow-popover)]` | 已拉取，小型上下文浮层留用 |
| `dropdown-menu.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；内容/子内容 `rounded-lg`→`rounded-md`；`shadow-md`/`shadow-lg`→`shadow-[var(--shadow-popover)]`；菜单项加 2px/3px focus-visible outline；Check/Chevron 显式 stroke 1.5。**使用约束**：`DropdownMenuLabel`（Base UI `GroupLabel`）必须放在 `DropdownMenuGroup` 或 `DropdownMenuRadioGroup` 内；放在 Popup 顶层会在打开时抛 Base UI error #31（MenuGroupContext missing） | Phase 2b 起**不再用于引擎选择**（改为自绘 EngineSelect）；保留供未来行溢出菜单 |
| `checkbox.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 | 「替我审批 / 替我决策」占位（禁用） |
| `switch.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`transition-all`→`transition-colors` | 已拉取，Phase 4 设置布尔项留用 |
| `tooltip.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 | 图标按钮提示（`TooltipProvider delay=400`） |
| `badge.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`rounded-4xl`→`rounded-[4px]`（微型 4px）；`transition-all`→`transition-colors` | DEMO/演示数据/角标 |
| `separator.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 | 抽屉分组 |
| `resizable.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 | 左栏 Group/Panel（拖宽；交互手柄按 UIUX Q4 自绘） |
| `scroll-area.tsx` | base-nova | 2026-10-21 | `cn` 导入改回 | 抽屉长内容 |
| `card.tsx` | base-nova | 2026-10-21 | `cn` 导入改回；`rounded-xl`→`rounded-lg`；头/图 `rounded-t-xl`/`rounded-b-xl`→`-lg` | 抽屉占位块 |
| `collapsible.tsx` | base-nova | 2026-10-21 | 无（文件本身不导入 `cn`） | 确认卡「详情（argv / cwd）」 |

## 设计对齐说明

- 圆角按 UIUX 规范 §3.3：容器 8px（`rounded-lg`）、控件 6px（`rounded-md`）、微型 4px（`rounded-[4px]`）。registry 的 Nova 默认使用 8px 控件圆角与 12px 容器圆角，本台账已逐项收敛。
- 浮层阴影改为项目令牌 `--shadow-popover`；遮罩改为 `--backdrop-strong`。组件源码内无裸色值（`#hex`/`rgb()`/`hsl()`/`white`/`black`）。
- 动画：抽屉用 `motion/react`；确认卡用 AlertDialog + 默认焦点环；registry 的 `animate-in` 类为惰性类（见上）。未发现第二套动画机制。
- 图标：registry 与项目代码全部使用 `lucide-react`；无手绘 SVG（品牌 `ANS` 为文字）。

## 维护规则

- 升级组件时按本台账的「本地修改」逐项重放，不直接覆盖；新增修改必须更新本表。
- 新增组件须先在 UIUX 白名单/台账登记；不引入 Radix/第二套 UI 库。


## Phase 2b 修正（2026-10-21，UIUX 设计对齐评审）

| 组件 | 本地修改（相对 registry / Phase 2 版本） | 原因 |
| --- | --- | --- |
| `button.tsx` | 默认变体 `hover:bg-success-hover` / `active:bg-primary-active`；outline/ghost/secondary 按 `--hover`/`--selected` 收敛；outline 增加 `dark:hover:bg-hover` / `dark:active:bg-selected`；字号 `text-[13px]`（sm 同步）；disabled `opacity-[0.45]`；焦点环 `focus-visible:outline-2 outline-offset-3 outline-ring`；`transition-colors duration-[120ms]` | 评审 §8.1：primary hover/active、焦点环、字号/禁用透明度；outline hover 不被 `dark:bg-input/30` 盖住 |
| `input.tsx` / `textarea.tsx` / `checkbox.tsx` / `switch.tsx` | 焦点环统一 2px/3px；`transition-colors duration-[120ms]`；Checkbox 选中色 primary→`--warning`（背景/边框/对勾文字），dark 同步；CheckIcon stroke 1.5 | 评审 §8.1/§8.2；Input/Textarea 深色面随 `.dark` 生效 |
| `scroll-area.tsx` | thumb `bg-border`→`bg-[var(--scrollbar-thumb)]` | 评审 §8.3：滚动条与全局令牌一致 |
| `dropdown-menu.tsx` | 菜单项/子触发器加 2px/3px focus-visible outline；Check/Chevron stroke 1.5 | 评审 §8.3；组件仍保留但引擎不再使用 |
| `index.css` | 基础 `*` 规则移除 `outline-ring/50`；新增未分层规则把 `--tw-outline-style` 从 `outline-none` 复原为 solid，并固定 `outline-color: var(--ring)` | Tailwind v4 的 `outline-none` 会把 focus-visible 环压成 none/50% 透明；规范要求 2px solid + 3px offset |
| `src/index.html` | `<html lang="zh-CN" class="dark">` | 深色变体必须生效；outline 控件边界回 `--input` |

**自查**：`dark` 生效后 `#sc-allow` border `rgb(107,117,126)`；焦点环 `rgb(111,160,139)` 2px/3px；primary hover `rgb(127,178,155)`、active `rgb(94,143,122)`；Checkbox 选中 `rgb(196,161,95)`。详见 `角色卡/桌面UI/docs/change/2026-10-21-phase2b-evidence/`。
