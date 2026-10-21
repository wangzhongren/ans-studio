---
id: ui-platform-phase2b-independent-reverification
type: change
title: UI 平台化 Phase 2b（UIUX 设计对齐修正）独立复验
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase2-independent-verification, ui-platform-phase2-shell, ui-platform-phase2-review, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 候选变化后按证据溯源重验：干净重建、自写 Electron 冒烟 49 项、真实键盘 focus-visible 探针、旧基线 679 项、契约面引擎行与依赖核对；全部通过
---

# Phase 2b 修正：独立复验（测试角色）

**候选已变化，Phase 2 结论对受影响部分失效**（Governing Invariant：证据只对产生它的候选有效）。本记录对 Phase 2b 修正后的候选重新执行受影响检查，主报告 [Phase 2 独立验证](2026-10-21_change_phase2-independent-verification.md) 中「深色变体/焦点环/primary hover/引擎选择器/960 scope」等条目以本记录为准；旧渲染器零改动、旧基线与依赖结论在本候选上重新执行后仍成立。

受验对象：桌面UI 的 [Phase 2 变更记录 §Phase 2b 修正](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md)、[Phase 2b 证据](../../../桌面UI/docs/change/2026-10-21-phase2b-evidence/)、[UIUX Phase 2 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase2-review.md)（needs-work）与更新后的 [契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md)。本记录由测试角色独立执行，未复用桌面UI 的脚本与结论。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0（Chromium 152.0.7977.130）。证据目录：[2026-10-21-phase2b-verification-evidence](2026-10-21-phase2b-verification-evidence/)。

## 一、结论

**通过。** 派发列出的重验项全部独立执行通过；未发现失败项。未验证项与原因见 §七。

| 重验项 | 结论 | 证据 |
| --- | --- | --- |
| 删除 `dist` 后重建：typecheck / build / CSP / gzip | 通过（exit 0 / exit 0；189,355B ≤ 300KB；零内联） | `typecheck-renderer.*`、`build-renderer.*`、`dist-static-scan.txt` |
| `html.dark` 与深色面 | 通过（`class="dark"`、`color-scheme: dark`） | `electron-smoke/report.json` |
| `#sc-allow` 边界 `--input` | 通过（`rgb(107,117,126)`，1px） | 同上 |
| focus-visible 2px/3px | 通过（2px solid `rgb(111,160,139)`，offset 3px；4 类组件 + 真实键盘探针） | 同上、`probes/focus-visible-keyboard-output.txt` |
| primary hover/active 计算色 | 通过（hover `rgb(127,178,155)` / active `rgb(94,143,122)`，真实鼠标事件） | `electron-smoke/report.json` |
| 引擎 combobox/listbox/option 与键盘 | 通过（ARIA 逐项 + ↑↓/Home/End/Enter/Esc/Tab + 焦点返回） | 同前；`contract-engine-row.txt` |
| 960 scope | 通过（pane 664、无溢出、演示后缀 `display:none`、scope 不截断） | `electron-smoke/report.json` |
| IME 保护 | 通过（组合期不拦截不发送、提交后拦截、229/isComposing/Shift 守护） | 同上 |
| 确认卡默认焦点 | 通过（`sc-deny`、640、命令逐字、Esc=deny） | 同上 |
| 侧栏 resizable | 通过（248→328→248、Shift+→272、±8、收起 0/展开 272、aria/localStorage） | 同上 |
| 无 console/CSP 违规 | 通过（0/0/0/0/0） | 同上 |
| 旧基线抽测 | 通过（679/679，exit 0）；旧渲染器零 diff | `desktop-tests-summary.txt`、`change-surface.txt` |
| 依赖与产物无新增/无禁入 | 通过（16 精确版本、锁 0/0/97、package.json diff 与 Phase 2 证据逐字相同） | `deps-and-artifacts.txt` |
| 契约面引擎行已更新且与实现一致 | 通过（行 8「已满足（Phase 2b）」与实测 ARIA/键盘一致） | `contract-engine-row.txt` |

## 二、变更面与依赖

- 旧渲染器 9 个经典文件、`app/main.ts`、`app/preload.cjs` 与 HEAD 逐字节相同（sha256 见 `change-surface.txt`）；`app/desktop/` 零改动；`app/` 变化仍只有 `app/renderer/{components.json,src/,tsconfig.json}`（Phase 2b 的改动都在 `app/renderer/src/` 内：`index.html` 加 `class="dark"`、新增 `shell/EngineSelect.tsx`、button/checkbox/scroll-area/Composer/shell.css/index.css 调整）。
- 依赖零新增：`package.json` 与 HEAD 的 diff 与 Phase 2 证据 `package-json.diff` **逐字相同**；锁文件仍为 0 删除 / 0 既有版本变化 / 97 新增；直接依赖与锁闭包均无 radix/react-aria/vitest/dnd-kit/tw-animate-css/第二套动画或图标库；`typescript ^7.0.2` 仍是既有待收口项。
- `dist` 仅 3 个文件（`src/index.html` + 1 JS + 1 CSS），无新增产物类别、无 sourcemap。
- 工作树同时含其他角色的并行改动（推理/推理强度轻量修复涉及 `src/provider/`、`src/common/*-adapter/`、`src/model/runtime.ts`、`src/service/runtime/session.ts` 与对应适配器测试；UIUX 评审文档；桌面UI 的 Phase 2b 证据）。这些路径与本次受验面（`app/renderer/`、根依赖、`test/桌面应用/`）不重叠；重建、冒烟与旧基线都在当前工作树上执行，结论只对应当前候选。

## 三、干净重建

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0（vite 8.3.4，208ms）
```

产物与预算（入口引用资产，`zlib.gzipSync(level:9)`）：

| 资产 | raw | gzip9 |
| --- | ---: | ---: |
| `dist/assets/index-Bzf05pFB.js` | 556,265B | 176,970B |
| `dist/assets/index-BFI8-SVa.css` | 64,016B | 11,998B |
| `dist/src/index.html` | 583B | 387B |
| **合计** | — | **189,355B ≤ 300KB（307,200B）** |

与桌面UI 的 Phase 2b 报告（188,883B）相差 +472B，属重建实例差异；两者均远低于预算。静态扫描：恰 1 个外部 module script + 1 个外部 stylesheet，**无内联脚本、无 `<style>`、无 `style=`、无 `unsafe-*`、无 modulepreload**，严格 CSP meta 逐字在位；运行时 `document.querySelectorAll('style')` 为 0。引擎选择器改自绘后 JS raw 从 638.8kB 降到 556.3kB（Base UI menu 代码被 tree-shake），与桌面UI 自述一致。

## 四、真实 Electron `file://` 冒烟（自写，49/49）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase2b-verification-evidence/electron-smoke/independent-smoke.cjs)（本角色从零编写）。窗口：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、`show:false`、真实 preload、`loadFile(dist/src/index.html)`，1360×860。结果 **49/49 true、exit 0**，零 console 错误、零 CSP 违规、零 did-fail-load/preload-error/render-gone。

**逐项实测值**：

- **深色变体**：`document.documentElement.className === "dark"`、`color-scheme: dark`、body 背景 `rgb(20,23,26)`。
- **确认卡「放行执行」边界**：`border: 1px solid rgb(107,117,126)`（`--input`）；拒绝按钮背景 `rgb(111,160,139)`（primary）；按钮字号 13px。
- **焦点环**：隐藏窗口（`show:false`）下 `document.hasFocus()=false`，Chromium 不匹配 `:focus-visible`（实测 Tab/`focus({focusVisible:true})` 均不匹配）——主冒烟用 CDP `CSS.forcePseudoState` 强制并等 300ms 过渡结束：`#sc-allow`、`#sc-deny`、`#inp-message`、`#runtime-select` 均为 **outline 2px solid `rgb(111,160,139)`、offset 3px**；确认卡默认拒绝环静态规则同样 2px/3px。**补充探针**（`probes/focus-visible-keyboard.cjs`，可见窗口 + 真实 Tab）：`hasFocus=true`，首个 Tab 焦点 `sc-close`、`sc-allow`、`#inp-message`、`#runtime-select` 全部 `matches(':focus-visible')=true` 且 2px/solid/`rgb(111,160,139)`/3px（`FOCUS_ALL_PASS=true`）。
- **primary hover/active**：真实鼠标事件（隐藏窗口下有效）。`#sc-deny` hover 200ms 后 `rgb(127,178,155)`（`--success-hover`）、mouseDown 200ms 后 `rgb(94,143,122)`（`--primary-active`）；mouseUp 完成点击按拒绝关闭卡片（不会因此放行）。
- **Checkbox 选中色**：置 `data-checked` 后等 250ms（`transition-colors` 120ms），背景/边框均为 `rgb(196,161,95)`（`--warning`）。
- **引擎选择器**：闭合 `role=combobox`/`aria-haspopup=listbox`/`aria-controls=runtime-options`/`aria-expanded=false`/`value=claude`；打开 `role=listbox`、3 个 `role=option` + `aria-selected`（claude=true）+ `data-runtime`、菜单宽 180、`aria-activedescendant=runtime-option-claude`；键盘 ↑→codex、Home→pi、End→claude、Enter 提交后焦点回触发器且菜单隐藏；Esc 关闭并回焦（preventDefault）；Tab 关闭不拦截；选项选择仅改本地演示状态。
- **960 窄档**：`960×620`、`scrollWidth=960` 无横向溢出、`.chat-pane`/`.capsule` 均 664、会话头 60、`.composer-scope-demo` 计算 `display:none`、`#composer-scope` 不截断（client/scroll 相等）、角色与引擎保持可见。
- **IME**：组合期 Enter 未拦截未发送；组合结束后 Enter 拦截并显示「演示：发送未接入业务，本条未发送。」；`keyCode 229`、`isComposing:true`、Shift+Enter 均不拦截；发送按钮仍禁用。
- **侧栏**：拖拽 248→328（同轮 `aria-valuenow=328`、localStorage 328）、双击 248、Shift+→272 / →264 / →272、收起（过渡结束）宽 0、展开保留 272。
- **抽屉**：424、`role=dialog`/`aria-modal=true`、焦点 `drawer-close`、Esc 关闭并回焦 `tab-card`。
- **禁用发送**：背景 `rgb(37,42,48)`、文字 `rgb(167,173,181)`、opacity 1、字号 13px（中性禁用底，不再绿色暗示可用）。

**测量口径说明（重要，供 Phase 3 e2e 参考）**：`transition-colors`（120ms）包含 `outline-color` 与 `background-color`，瞬时读数会落在过渡中间值（曾读得 `rgb(119,165,146)` 中间色）；hover/active 用 CDP `forcePseudoState` 在页面 `getComputedStyle` 中不可复现，须用真实鼠标事件。详见 [measurement-notes.txt](2026-10-21-phase2b-verification-evidence/measurement-notes.txt)。

## 五、旧基线

`node --test test/桌面应用/*.test.ts`（shell glob，未改任何测试）→ **679 tests / 679 pass / 0 fail / 0 skip，exit 0**（16.9s）。旧渲染器与主进程/preload 与 HEAD 逐字节相同（§二），本候选未引入旧基线回归。完整 e2e 双端对照仍按阶段计划留 Phase 5，未运行。

## 六、契约面清单（引擎行）

- 行 8 已从「部分（DropdownMenu radio）」更新为 **「已满足（Phase 2b）」**：`role=combobox` / `aria-haspopup=listbox` / `aria-controls` / `aria-expanded` / `aria-activedescendant`，弹层 `role=listbox`、选项 `role=option`+`aria-selected`+`id=runtime-option-*`+`data-runtime`，键盘 ↑↓/Home/End/Enter/Space/Esc/Tab——与本次实测**逐项一致**（`contract-engine-row.txt`）。
- 行 6（左树 roving tabindex/↑↓/Home/End）仍标「部分/Phase 3」，与 UIUX 评审「随 Phase 3 树迁移处理」一致；未发现清单把未实现项写成已满足。
- 其余行（深色/焦点环/Checkbox 等）属源码/样式面，清单的 Phase 2b 摘要与实测值一致（`rgb(107,117,126)`/`rgb(111,160,139)`/`rgb(127,178,155)`/`rgb(94,143,122)`/`rgb(196,161,95)`）。

## 七、未验证项与原因

1. **完整 e2e 双端逐 check 名对照**：按阶段计划属 Phase 5；套件目标切换仍未实现。
2. **打包安装包内加载**：Phase 5；`release.yml` 按 M1 未改。
3. **真实聊天流/发送/附件/停止/双开关/真实确认卡 IPC/设置面板**：Phase 2 范围外（骨架不含）。
4. **角色树键盘导航（roving tabindex/↑↓/Home/End）**：UIUX 允许随 Phase 3 树迁移，本轮确认仍未实现（契约行 6 一致）。
5. **确认卡退场 Motion、引擎菜单入场 Motion**：桌面UI 与评审均列为后续观感项，未实现（不引第二套动画库）。
6. **Windows 字体/DPI/最小窗口、200% 文字、屏读、`prefers-reduced-motion` 逐项**：本机 macOS 无对应环境。
7. **引擎选择器在真实会话中的行为**：仅切换本地演示状态（Phase 2 口径），未接 runtime 会话。

## 八、与桌面UI 自述的差异

无实质不一致。口径差异三处：

1. **gzip 精确值**：其 176,510 + 11,984 + 389 = 188,883B；本次独立重建 176,970 + 11,998 + 387 = **189,355B**（+472B），构建实例差异，均远低于 300KB。
2. **测量方式**：其 `cdp-styles.json` 的 `allowBg rgb(37,42,48)` 是 hover 态读数（截图名 confirm-allow 即「hover+焦点」）；本次分别测静态边界与 hover/active，数值一致。隐藏窗口下 `:focus-visible` 不匹配，其 Electron 冒烟能直接读到 2px/3px，推测其夹具为可见窗口或强制伪类——不影响结论；本记录用「强制伪类 + 过渡等待 + 可见窗口真实 Tab」双路复核。
3. **过渡读数**：Checkbox/焦点环/hover 的 `transition-colors` 120ms 会制造中间值，双方结论一致但读数时点需注意（已写入证据口径说明）。

## 九、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase2b-verification-evidence/`、本角色 `feature-map.md`、`memo.md`、`changelog.md`。均在 `角色卡/测试/` 内。
- 未改：产品代码、构建配置、测试文件、其他角色文件；未 commit/push。
- 按派发删除并重建 `app/renderer/dist/`（gitignore 构建产物）；未触碰源码。

## 附：复跑命令

```bash
rm -rf app/renderer/dist
npm run typecheck:renderer && npm run build:renderer
node 角色卡/测试/docs/change/2026-10-21-phase2b-verification-evidence/probes/dist-static-scan.cjs
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase2b-verification-evidence/electron-smoke/independent-smoke.cjs
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase2b-verification-evidence/probes/focus-visible-keyboard.cjs
node --test test/桌面应用/*.test.ts
```
