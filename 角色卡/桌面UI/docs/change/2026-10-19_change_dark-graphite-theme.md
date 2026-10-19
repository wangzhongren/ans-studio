---
id: desktop-dark-graphite-theme
type: change
created: "2026-10-19"
status: implemented
revision: 1
---

# 深色石墨主题（全局色板）

## 客户决定

客户看过 ANS Studio 主界面后反馈「整体页面风格这种色调不够沉稳」，并选择**深色石墨**方向。本批只换视觉（表面 / 文字 / 边框 / 语义色），布局、尺寸、文案、交互逻辑与可访问性语义一律不动。

## 色板

实现以两处 `:root`（文件头 + 文末 A2 令牌块）为单一来源；后者沿用既有级联习惯做最终覆盖，两处取值一致。

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--bg` | `#14171A` | 主内容区 / 深色石墨底 |
| `--bg-side` | `#1A1E22` | 侧栏 / 标题栏（`--chrome`） |
| `--bg-drawer` | `#171B1F` | 右抽屉底 |
| `--bg-soft` | `#1E2328` | 次级表面：输入胶囊、面板、代码块、表头、卡片 |
| `--bg-hover` | `#252A30` | hover 底 |
| `--bg-selected` | `#2A3037` | 选中项底 |
| `--border` | `#2C3238` | 常规分隔线 |
| `--border-strong` | `#3A4148` | 强分隔线 / 卡片描边 |
| `--border-control` | `#6B757E` | 控件边框（胶囊 / 引擎选择器，≥3:1） |
| `--text` | `#E7E9EB` | 主文字 |
| `--text-2` | `#A7ADB5` | 次级文字 |
| `--text-3` | `#949BA4` | 三级文字 / 占位 / 计数 |
| `--success` | `#6FA08B` | 主强调（选中 / 焦点 / 主按钮） |
| `--success-hover` | `#7FB29B` | 主按钮 hover（深色下提亮） |
| `--success-bg` | `#22302B` | 成功 / 已保存语义底 |
| `--danger` | `#C97A6D` | 拒绝 / 失败 |
| `--danger-bg` | `#2E2220` | 异常语义底 |
| `--danger-border` | `#5C3832` | 异常卡描边 |
| `--danger-line` | `#C97A6D` | 异常卡左竖条 |
| `--amber` | `#C4A15F` | 未决 / 未知 |
| `--amber-bg` | `#24211A` | 未决交互卡暖色暗底 |
| `--amber-border` | `#4E422A` | 未决卡描边 |
| `--focus-ring` | `#6FA08B` | 键盘焦点环 |

`color-scheme: dark`；滚动条拇指 `#4A525A` / hover `#5F6870`；选中文本 `#3A4A44` + `var(--text)`。浮层阴影全部改为低透明黑（`rgba(0,0,0,.32–.55)`），不再使用浅色主题的绿色调阴影。

相对建议值的两处必要偏离（均以对比度为先）：

- `--text-3` 建议 `#7E858E` 在 `--bg-soft` 上仅 4.25:1、在 `--bg-selected` 上 3.96:1；改为 `#949BA4` 后分别 5.64 / 4.75:1。
- 新增 `--border-control: #6B757E`（建议清单未给）：对 `--bg-soft` 3.37:1，满足控件边界 ≥3:1；`--border` / `--border-strong` 仅作分隔线，不承担控件边界。

## 对比度（WCAG 2.x 相对亮度，纯函数实测）

| 前景 / 背景 | 比值 | 要求 |
| --- | --- | --- |
| `--text` / `--bg` | **14.78:1** | 正文 ≥7 |
| `--text` / `--bg-soft` | 13.01:1 | ≥7 |
| `--text-2` / `--bg` | **7.96:1** | 次要 ≥4.5 |
| `--text-2` / `--bg-soft` | 7.00:1 | ≥4.5 |
| `--text-3` / `--bg-soft` | **5.64:1** | ≥4.5 |
| `--text-3` / `--bg-selected` | 4.75:1 | ≥4.5 |
| `--danger` / `--bg` | **5.56:1** | 语义 ≥4.5 |
| `--danger` / `--danger-bg` | 4.75:1 | ≥4.5 |
| `--success` / `--bg` | **6.06:1** | 语义 ≥4.5 |
| `--success` / `--success-bg` | 4.64:1 | ≥4.5 |
| `--amber` / `--bg` | **7.38:1** | 语义 ≥4.5 |
| `--amber` / `--amber-bg` | 6.59:1 | ≥4.5 |
| `--focus-ring` / `--bg-soft` | 5.34:1 | 焦点环 ≥3 |
| `--border-control` / `--bg-soft` | 3.37:1 | 控件边界 ≥3 |
| 主按钮文字 `--bg` / `--success` | 6.06:1 | ≥4.5 |

主按钮与强调按钮在深色下统一使用**深色文字**（`color: var(--bg)`）；白色文字在 `#6FA08B` 上仅 2.97:1，故不使用。

## 硬编码浅色审计

- `app/renderer/styles.css`：全部 148 处颜色字面量逐条核对/替换；旧浅色表面（`#FFF/#FFFFFF/#FAFBF8/#FCFCFB/#FBFCF8/#F4F8F2/#F0F3ED/#F1F4EE/...`）、旧深绿文字（`#232C29/#55625B/#2D634E/...`）、浅色语义底（`#FBEFED/#E5EEE7/...`）与浅色边框（`#CCD6CB/#D7DDD3/#CAD8CD/...`）已清零；组件层改为引用令牌或深色语义底，不只改 `:root`。
- `app/renderer/index.html`、`renderer.js`、`role-status.js`、`tool-rows.js`、`ui-labels.js`、`runtime-ui.js`、`engine-selector.js`、`markdown.js`：grep `#hex / rgb() / rgba() / hsl()` **零命中**；全部图标走 `fill=none stroke=currentColor`，无需改动。vendor 第三方库不含颜色。
- 备注：`attach-rm` 的 `rgba(0,0,0,.55)` 深色遮罩保留（图片缩略图上的关闭钮，主题无关），文字改 `var(--text)`。

## 变更文件

- `app/renderer/styles.css`：两处 `:root` 令牌；滚动条 / 选中文本；标题栏/侧栏/抽屉/输入区/卡片/表格/代码块/工具行/治理卡等全部表面、文字、边框与阴影；`color-scheme: dark`；仅颜色与相关注释变化（`git diff` 无非颜色属性改动）。
- `test/桌面应用/renderer.test.ts`：A1/A2 两处输入区断言改用 `var(--bg-soft)` / 深色阴影；A2 token 与对比度断言改为深色口径（阈值不放宽：正文 ≥7、次级 ≥5、三级 ≥4.5、控件边框/焦点 ≥3，另加语义色 ≥4.5）；新增「深色石墨主题」用例（color-scheme、首层令牌、滚动条/选中文本、旧浅色字面量清零守卫）。
- `test/桌面应用/e2e/uiux-v2.mjs`：`.report-top` 计算背景断言由 `rgb(244, 248, 242)` → `rgb(34, 48, 43)`（`--success-bg`）；`visualChecks` 新增 4 条真实渲染树「无可见亮底元素」扫描（1360/960 两档主视图 + 抽屉态），按计算样式（相对亮度 >0.5 且 alpha >0.5）判定，失败时输出违规元素清单。

## 不改清单

布局、栅格/列宽、间距、字号/行高、圆角、交互状态机、按钮文案、DOM 结构与无障碍属性均未改动。`uiux-design-audit` 的几何口径与 900 内容列不变；`visualChecks` 的 `V2 real geometry` 两档断言继续通过。

## 测试与证据

- `node --test test/桌面应用/renderer.test.ts` → **105 计 / 105 过 / 0 红**。
- `test/桌面应用/tool-rows.test.ts` 52/52、`markdown.test.ts` 5/5。
- `test/桌面应用/runtime-ui.test.ts` 12 计 / 11 过 / 1 红：`renderer 仅消费 IPC…无持久化` 的 `localStorage` 源码守卫；**HEAD 即红**（`git show HEAD:app/renderer/renderer.js` 已含侧栏 localStorage），与本次纯视觉改动无关。
- `npx tsc --noEmit` → **exit 0**（全仓 0 错）。
- 真实 Electron 离线夹具 `ANS_VISUAL_V2_UI_ONLY=1 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` → **VISUAL_V2_PASS 54**（含新增 4 条暗色扫描；改前同夹具基线为 50）。
- 全量交互套件 `ANS_UIUX_INTERACTIVE=1 ... uiux-v2.mjs` → 前 100 项通过，最后一项 `expired old shell shown disabled in its own runtime` 失败；**A/B 已证**：把 `styles.css` 换回 `git show HEAD:app/renderer/styles.css` 重跑，同点同断言同样失败（他角色在飞的 `renderer.js` 改动/夹具既有红，非本批引入）。未修改该断言。
- `uiux-design-audit.mjs` 在本工作树因缺少 `shell:judge-get` / `decision:judge-get` 假 IPC 处理器提前退出（夹具与在飞 renderer 不同步，与 CSS 无关）；几何回归由 `uiux-v2` 的 `V2 real geometry` 两档断言覆盖并通过。

截图（改前 = `git show HEAD:...styles.css` 原浅色主题；改后 = 本批深色石墨；同一夹具同一状态）：

- 证据目录：`角色卡/桌面UI/docs/change/2026-10-19-dark-graphite-evidence/`
  - `before-visual-v2-1360.png` / `after-visual-v2-1360.png`
  - `before-visual-v2-960.png` / `after-visual-v2-960.png`
  - `before-visual-v2-drawer-1360.png` / `after-visual-v2-drawer-1360.png`
  - `before-visual-v2-drawer-960.png` / `after-visual-v2-drawer-960.png`
  - `before-visual-collapsed-1362.png` / `after-visual-collapsed-1362.png`
  - 两档 `report.json`
- 原始运行目录（含全量截图）：`/private/tmp/ans-dark-theme-before`、`/private/tmp/ans-dark-theme-after`（已删除 `user-data/`）。

## 残余风险

- 深色主题下**图片/附件缩略图**仍按原图显示（内容本身可能偏亮），不在色板控制范围内。
- 第三方/未来新增组件的颜色若写成字面量，仍可能破坏主题；已在单测中加旧浅色清零守卫，但无法覆盖未来新色值，需评审时继续要求走令牌。
- Windows 原生控件（checkbox/select 下拉展开层）依赖 `color-scheme: dark` 的 Chromium 实现；本机 macOS 实测正常，Windows 真机未验。
- 高对比度系统模式（forced-colors）未单独适配（与改前一致，本批不扩大范围）。
- 语义色的「小面积」纪律不变；若后续把 `--success` 用作大面积背景，需重新核算深色文字对比度。
