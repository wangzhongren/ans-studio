---
id: ui-platform-phase2-independent-verification
type: change
title: UI 平台化 Phase 2（React 渲染器骨架）独立验证
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase2-shell, ui-contract-surface, ui-platform-toolchain-20261021]
events:
  - date: "2026-10-21"
    kind: created
    summary: 测试角色按阶段门独立复跑：干净重建、真实 Electron file:// 冒烟（48 项）、旧基线与契约面抽查；全部通过，无未通过的阶段门项
---

# Phase 2 渲染器骨架：独立验证（测试角色）

阶段门对象：桌面UI 的 [Phase 2 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase2-shell.md)、[契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md)、装配的 [Phase 1 工具链](../../../装配/docs/change/2026-10-21_change_ui-platform-toolchain.md)，验收口径来自产品提案 revision 2 §六与 PM 评审 M2/A5。本记录由测试角色从当前工作树**重新执行**得出，不复用桌面UI 的结论或脚本。

候选基线：HEAD `fc1a39c14e119faccf442fc8e22bbbbd978d1a04` + 工作树（工作树同时含其他角色的并行改动，见 §二·4；Phase 2 面按路径隔离核对）。环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、npm 11.9.0、Electron 44.7.0（内置 Chromium 152.0.7977.130、Node 24.21.0）。证据目录：[2026-10-21-phase2-verification-evidence](2026-10-21-phase2-verification-evidence/)。

## 一、结论

**通过。** 本轮派发的阶段门项全部经独立执行通过；未发现失败项。未验证项与原因见 §七，其中没有属于「Phase 2 门禁必须项」的遗漏。与桌面UI 自述无实质不一致（三处口径/数字差异见 §八）。

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 变更面：旧渲染器 / 主进程 / preload / `app/desktop/` 零改动 | 通过 | `change-surface.txt`（逐文件 `git diff --quiet` + sha256） |
| 变更面：16 个依赖精确版本、无额外包、无重复版本 | 通过 | `dependencies-check.txt`、`package-lock-diff.txt`、`npm-ls-key-packages.txt` |
| 干净重建：`typecheck:renderer` + `build:renderer` | 通过（exit 0 / exit 0） | `typecheck-renderer.*`、`build-renderer.*` |
| 产物路径 / gzip 预算 / 严格 CSP 静态扫描 | 通过（216,784B ≤ 300KB；零内联） | `dist-static-scan.txt` |
| 真实 Electron `file://` 冒烟（含骨架、侧栏、抽屉、确认卡、IME） | 通过（48/48） | `electron-smoke/report.json`、截图、脚本 |
| 旧基线 `test/桌面应用/*.test.ts` 不回归 | 通过（679/679，exit 0） | `desktop-tests-summary.txt`、`desktop-tests.log` |
| 契约面清单可信、可执行、无虚报 | 通过（计数/ID/选择器/入口/env 逐项吻合） | `contract-spot-check.txt` |
| 依赖/供应链：审计归属、禁入清单 | 通过（8 moderate 全为既有 electron-builder 链；生产 0） | `audit-*.json`、`audit-summary.txt` |

## 二、变更面核对

### 1. 旧渲染器与主进程零改动

对 HEAD 逐文件 `git diff --quiet HEAD -- <file>`：`app/renderer/index.html`、`renderer.js`、`styles.css`、`markdown.js`、`engine-selector.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js`、`app/main.ts`、`app/preload.cjs` **全部 UNCHANGED**（sha256 见证据 `change-surface.txt`）；`app/desktop/` 的 `git status` 为空。`app/main.ts:211` 仍 `loadFile(renderer/index.html)`——生产入口未切换，符合过渡期口径。

`app/` 下的工作树变化只有 Phase 2 新文件：`app/renderer/components.json`、`app/renderer/src/`（35 个文件）、`app/renderer/tsconfig.json`。

### 2. 根配置与依赖

- `package.json`：16 个新依赖全部在 **devDependencies**、全部**精确版本**（无 `^`/`~`），与批准清单逐一相同（React 19.3.1 / react-dom 19.3.1 / @base-ui/react 1.9.0 / lucide-react 1.60.0 / motion 14.4.0 / react-resizable-panels 4.14.8 / zustand 5.0.15 / clsx 2.1.1 / tailwind-merge 3.7.0 / class-variance-authority 0.7.1 / vite 8.3.4 / @vitejs/plugin-react 6.1.2 / tailwindcss 4.3.3 / @tailwindcss/vite 4.3.3 / @types/react 19.3.0 / @types/react-dom 19.3.0）；无额外包。
- `package-lock.json`：与 HEAD 相比 **0 删除、0 既有条目版本变化**，仅新增 97 条目（16 直接 + 传递）。`motion@14.4.0` 依赖同版本 `framer-motion@14.4.0` 是其自身包结构（motion 为 framer-motion 的新入口），不是第二套动画库。
- `npm ls react react-dom @base-ui/react motion`：全部单一版本且子依赖 `deduped`，无重复/多版本。
- `vite.config.ts`（新）/`tsconfig.json`（根排除 `app/renderer`）/`.gitignore`（`app/renderer/dist/`）均在 PM Q2 与装配 Phase 1 批准范围内；`electron-builder.yml`、`.github/workflows/release.yml` 未动（M1 成立）。
- 遗留关注（非本轮引入）：`typescript` 仍为 `^7.0.2`，与精确锁版规则不一致；这是 PM 评审 Q1 的「实施中确认」项、装配记录已如实登记，不计 Phase 2 缺陷。
- 禁入清单扫描：直接依赖与锁定依赖（含传递）均无 `@radix-ui/*`、react-aria、vitest、`@dnd-kit/*`、`tw-animate-css`、Storybook、第二套动画/状态/图标库、react-markdown/remark/rehype；锁定文件中唯一命中的 `lodash@4.18.1` 在 HEAD 锁里已存在（既有传递，非本轮引入）。

### 3. 边界与产物

`app/renderer/dist/` 是 gitignore 的构建产物；本轮按派发要求删除后重建，未改任何源码。重建后 `git status` 的 `app/` 面仍只有上述 3 个新路径。

### 4. 工作树中的并行改动（不属于本轮）

工作树另含其他角色的并行改动（D3 轻量权限修复的 `src/*` 与 `test/门禁引擎`/`test/测试` 等、UIUX 的 Nova 设计、PM 评审、独立验收目录等）。这些路径与 Phase 2 面不重叠；Phase 2 面的判断均按 `app/renderer/`、根配置与 `test/桌面应用/` 单独核对。`test/桌面应用/` 零改动。

## 三、干净重建

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0（tsc -p app/renderer/tsconfig.json，无输出）
npm run build:renderer       # exit 0（vite v8.3.4，2748 modules，213ms）
```

产物：`app/renderer/dist/src/index.html`（570B）、`dist/assets/index-BWBazLK6.js`（638,808B）、`dist/assets/index-DJnGQDXW.css`（62,742B）；无 `.map`、无 `sourceMappingURL`。

入口引用资产 gzip（Node `zlib.gzipSync(level:9)`）：JS **204,662B** + CSS **11,741B** + HTML **381B** = **216,784B（约 211.7KiB）≤ 300KB（307,200B）**，预算通过。Vite 构建器自报 gzip 206.90/11.79/0.38kB（其压缩口径与 level 9 不同），同样低于 300KB。

`dist/src/index.html` 静态断言（`dist-static-scan.txt`）：恰 1 个外部 `<script type="module" src="../assets/…">`、1 个外部 `<link rel=stylesheet>`；**无内联脚本、无 `<style>`、无 `style=`、无 `unsafe-inline`/`unsafe-eval`、无 modulepreload**；CSP meta 逐字为 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;`。运行时 `document.querySelectorAll('style').length === 0`（Base UI `CSPProvider disableStyleElements` 生效）。

## 四、真实 Electron `file://` 冒烟（本次独立编写，48/48）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase2-verification-evidence/electron-smoke/independent-smoke.cjs)（本角色从零编写，未参考/复用桌面UI 的 `/tmp` 脚本）。窗口配置：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、`show:false`、真实 `app/preload.cjs`、`loadFile(app/renderer/dist/src/index.html)`，1360×860。

**本次独立复现（48 项断言全部 true，`SMOKE_DONE=1`，exit 0）**：

- 挂载与骨架：`#root > .app-shell` 挂载；标题栏 36px、会话头 64px、侧栏 248px、内容列与输入胶囊均 900px；`#role-tree` 5 个 demo 角色；`#chat-role/-sub/#context-state`、`#chat[data-state=idle]`、`.chat-empty`、`.chat-pane[data-role-id]`、`#inp-message`、`#btn-send` 禁用、`#btn-halt` 隐藏、附件/双开关/切换项目/设置占位禁用——均带「演示」如实标注。
- 驱动与桥：`window.__ansRenderer` 存在且含 `state/selectRole/selectRuntime/openConfirmDemo/sidebar/drawer/confirmDemo/send/composer`，`unimplemented` 列 20 项；`window.desktop` 五方法齐备，三窗口按钮启用；无 preload 时按钮禁用并显示「窗口控制不可用」（负例独立探针）。
- 外观/CSP 面：body 背景 `rgb(20, 23, 26)`（深色石墨）；`.titlebar` 计算样式 `-webkit-app-region: drag`；运行时零 `<style>` 元素。
- 侧栏：指针拖拽 248→328（同事件轮次 `aria-valuenow=328`、`localStorage['ans.sidebar.width']='328'`）；双击复位 248；键盘 Shift+→ +24=272、→ -8=264、→ +8=272；收起后 `.app.is-sidebar-collapsed`、宽度 0（`.col-left` 自身有 160ms padding/opacity 过渡，轮询到过渡结束）、`#sidebar-expand` 可见、`collapsed=1`；展开回到 272 并保留宽度、`collapsed=0`。
- IME：`compositionstart` 后 Enter **未被 preventDefault、未发送**；组合结束后的普通 Enter 被拦截并如实显示「演示：发送未接入业务，本条未发送。」；覆写 `keyCode=229` 路径与 `isComposing:true` 路径均**不拦截**（守护生效）；Shift+Enter 不被拦截；文本保留、发送按钮仍禁用。
- 右抽屉：点击 `#tab-card` 打开，宽 424、`role=dialog`/`aria-modal=true`、焦点在 `#drawer-close`；Esc 关闭、焦点返回 `#tab-card`。
- 确认卡：`openConfirmDemo({command:'echo "hello world"'})` 打开，宽 640、默认焦点 `#sc-deny`、命令逐字；Esc 关闭且 `lastDecision='deny'`（不放行）；另测「放行执行」按钮单独得到 `'allow'`（两条路径可区分）。
- 运行环境：页面 CSP 违规数组为空；console 错误 0、CSP/CORS/模块加载错误 0、`did-fail-load` 0、preload-error 0、render-process-gone 0。截图见 `electron-smoke/smoke-default.png`（真实渲染，非空白）。
- 说明：裸夹具（不经 `app/main.ts`）会由 Electron 主进程打印一行 `No handler registered for 'window:is-maximized'`——这是夹具未注册主进程 handler 的预期现象，产品 `app/main.ts:611` 已注册该 handler；渲染侧 console 仍为零错误。

**补充独立探针**：`960×620` 窄档（`extra-probes.txt`）：垂直/水平无溢出（`scrollWidth 960 = clientWidth 960`）、内容列 664、会话头 60、键盘提示与标题栏副标按 `max-width:1100px` 规则隐藏，截图 `electron-smoke/smoke-960x620.png`。

**对方报告已覆盖、本次未独立复现的冒烟项**：引擎下拉菜单的打开/3 个 radio/`aria-expanded`/选择演示引擎（对方 `ENGINE_MENU_*` 5 项）；窗口按钮点击后的真实最小化/最大化/关闭效果（本次只验证按钮启用、桥与主进程 handler 存在，未驱动窗口状态变化）；`prefers-reduced-motion` 逐项实测。

## 五、旧基线回归

命令（shell glob，未改任何测试文件）：

```
node --test test/桌面应用/*.test.ts
```

结果：**679 tests / 679 pass / 0 fail / 0 skip，exit 0**（16.9s，`desktop-tests-summary.txt`、`desktop-tests.log`）。本机当前 HEAD 无已知基线红；即无需要单独归因的既有失败。`test/桌面应用/` 无任何工作树改动。

未运行完整 e2e 全套（按阶段计划留待 Phase 5 做双端逐 check 名对照）。因此**未覆盖**：`uiux-v2.mjs`、`ime-enter.mjs`、`main.mjs`、`uiux-design-audit.mjs` 在新旧入口上的行为对照，`bench-storm.mjs` 基线与阈值；各套件的 `ANS_RENDERER_ENTRY` 目标切换本身也尚未实现（契约清单 §5.1 将其列为 Phase 3 前由属主落地的内容）。

## 六、契约面清单抽查

抽查方法：直接读四个 e2e 套件、`renderer.test.ts` 与新渲染器 `test-driver.ts`，用 grep/脚本逐项对表（`contract-spot-check.txt`）。**未发现遗漏或虚报**，计数类声明全部精确吻合：

| 声明 | 清单值 | 独立复核 |
| --- | ---: | --- |
| `uiux-v2.mjs` `check(` 出现点（含函数定义） | 394 | **394** |
| `uiux-v2.mjs` 唯一字面 check 名 | 384 | **384** |
| `uiux-v2.mjs` 驱动方法出现次数（loadProject/selectRole/selectRuntime/rowModelDebug/paneDebug/queuedDebug/replayAnchorDebug/refreshProject/loadPiConfig/openPiPanel/onRecoveryConfirm） | 39/59/43/17/6/4/3/3/6/1/1 | **逐项相同** |
| `ime-enter.mjs` check 调用点 / 运行时 check 名 | 9 / 24 | **9 / 24**（4 个 assertIgnored×3 + 4 个 assertSent×2 + 4 个直接 check，名字逐项相等） |
| `main.mjs` `log("` 行 | 323 | **323** |
| `renderer.test.ts` `test()` 运行时数 | 108 | **108** |
| 入口行号（uiux-v2 L1331 / ime-enter L83 / main L80+1614+1661 / bench L21+L75） | 同左 | **逐一命中** |
| `uiux-v2` id 块 / `main` id 块 | 82 / 51 | 各自代码块**恰 82 / 51**，且**全部**出现在对应套件源码（缺失 0） |
| `uiux-v2` 附录唯一选择器 | 199 | **199**，全部可在源码中找到（缺失 0） |
| 环境变量（`ANS_UIUX_OUTDIR/INTERACTIVE/WIDTH`、`ANS_IME_OUTDIR/VISIBLE`、`ANS_E2E_PROJECT/OUTDIR`、`BENCH_RENDERER_DIR/OUT`） | 同左 | 源码中一一存在；uiux-v2 的 22 个 `*_UI_ONLY` 模式开关与清单所列 22 个**同数同集** |

驱动面：套件实际使用的顶层成员（uiux-v2 11 方法 + `state`；main 11 方法 + `state`；ime 2；bench 3）与清单逐项一致，无「清单有、源码无」或「源码有、清单漏」。新渲染器对 Phase 2 子集提供**同名**驱动并接真实 zustand store/DOM（无测试专用分支），其余 20 个方法集中列入 `unimplemented`；在 `app/renderer/src` 内搜 `loadProject`/`rowModelDebug` 仅命中该清单与注释，**无假实现**。三态表抽查：扁平 demo 角色树（无分组/主入口/内置）、引擎触发器确为 DropdownMenu radio（与旧 combobox/listbox 的差异已登记）、`#attach-row` 为空、无 `#pi-panel`/`#recovery-confirm`/`.op-request`/`.virt-spacer`/治理预览——与「部分/未满足」标注一致。

结论：**契约面清单可执行、可作为 Phase 3/4/5 的对照输入**；本轮未发现需要返工的遗漏或虚报。

## 七、未验证项与原因

1. **完整 e2e 双端逐 check 名对照**：按阶段计划属 Phase 5；本轮按派发不运行，且套件目标切换（`ANS_RENDERER_ENTRY` 等）尚未实现（Phase 3 前属主落地）。
2. **引擎下拉菜单交互**（打开/3 单选/选择）：桌面UI 报告已覆盖（`ENGINE_MENU_*`）；本轮未重复执行，不据此判通过。
3. **窗口按钮的真实效果**（最小化/最大化/关闭）：只验证了桥、启用状态与主进程 handler 存在；未点击（隐藏窗口会改变夹具状态）。
4. **Phase 2 范围外的业务面**：真实聊天流/发送/附件/停止/双开关/真实确认卡 IPC/恢复卡/治理卡/设置面板——骨架本就不含，桌面UI 已如实列为未实现（Phase 3/4）。
5. **打包安装包内加载与新发布轮**：Phase 5；`release.yml` 按 M1 未改。
6. **Windows 字体/DPI/最小窗口、200% 文字、屏读、`prefers-reduced-motion` 逐项行为**：本机 macOS 无对应环境，未测（桌面UI 同样列为未验证）。
7. **真实 960 档 Chrome-headless 截图**：对方用 vite preview 截两档；本角色用真实 Electron 960×620 实测了布局指标与截图（§四），不是同一套截图产物。

## 八、与桌面UI 自述的差异

无实质不一致。三处口径/数字差异，均不影响结论：

1. **gzip 精确值**：桌面UI 报告 JS 204,292B / CSS 11,725B / HTML 384B（合计 216,401B）；本次干净重建为 204,662 / 11,741 / 381B（合计 **216,784B**，+383B），应为构建实例差异（产物 hash `index-BWBazLK6.js`）；两口径都远低于 300KB。Vite 自报 gzip（206.90kB/11.79kB）与其 level-9 口径不同，引用时应明确度量方式。
2. **收起宽度读数时点**：桌面UI 报告 `width:0`；本角色首轮在点击后 2 个 rAF 读到 26px，原因是 `.col-left` 自身有 160ms padding/opacity 过渡（设计值），而面板宽度本身在第一个 rAF 已为 0。轮询到过渡结束（约 150ms）后为 0，复现其结论。**给 Phase 3 e2e 的提示**：收起断言应等待过渡或直接读 panel 宽度，避免把过渡中间值当失败。
3. **console 口径**：桌面UI 报告 `CONSOLE_MESSAGES=0`；本角色在渲染侧同样为 0。裸 Electron 夹具会额外出现一行主进程 stderr（`window:is-maximized` 未注册 handler），这是夹具不跑 `app/main.ts` 的预期现象，不属于页面 console，也不说明产品问题。

另外，`typescript ^7.0.2` 未规范化（PM「实施中确认」项）仍开放，建议随依赖台账收口。

## 九、边界核对

- 只写：`角色卡/测试/docs/change/2026-10-21_change_phase2-independent-verification.md`、`角色卡/测试/docs/change/2026-10-21-phase2-verification-evidence/`、本角色 `feature-map.md`、`memo.md`、`changelog.md`。均在 `角色卡/测试/` 与边界授权内。
- 未改：任何产品代码、构建配置、测试文件、其他角色文件；未 commit/push。
- 按派发删除并重建了 `app/renderer/dist/`（gitignore 的构建产物，可重建；未触碰源码）。
- 未触碰边界外文件。

## 附：复跑命令

```bash
# 干净重建
rm -rf app/renderer/dist
npm run typecheck:renderer && npm run build:renderer

# 静态扫描 + gzip（脚本已存档，输出见 dist-static-scan.txt）
node 角色卡/测试/docs/change/2026-10-21-phase2-verification-evidence/probes/dist-static-scan.cjs

# 真实 Electron file:// 冒烟（独立脚本，48 项）
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase2-verification-evidence/electron-smoke/independent-smoke.cjs

# 旧基线
node --test test/桌面应用/*.test.ts

# 依赖
npm ls react react-dom @base-ui/react motion
npm audit --json ; npm audit --omit=dev --json
```
