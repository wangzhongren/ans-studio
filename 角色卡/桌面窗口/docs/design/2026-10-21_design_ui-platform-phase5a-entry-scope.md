---
id: ui-platform-phase5a-entry-scope
type: design
title: UI 平台化 Phase 5A——桌面入口、dev/prod 加载与 packaged smoke 方案
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: proposed
revision: 1
related: [ui-platform-round, ui-platform-round-review, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM Phase 5 授权（§16.2/§16.4）只做 5A 规划：定最终入口 dist/index.html、dev/prod 加载与回退、main.ts/diagnostics/packaged-smoke 写集、main.mjs 目标切换与 323 行报告影响、5A/5B 边界、风险与交接；未改代码
---

# Phase 5A 桌面入口方案（规划，不含实现）

本文件是「桌面窗口」角色在 UI 平台化 Phase 5A 的入口与主进程方案。依据产品提案 revision 2 §六 Phase 5、PM 评审 revision 10 §十六（Phase 5 授权、顺序 5A→5B、最终入口、CSP、packaged smoke、main.mjs、约束）与桌面UI 的 [渲染层契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md)。**本文只做设计，不写实现代码、不改 `app/`、不改测试、不启动应用、不运行构建或测试。**

## 一、结论摘要

| 项 | 结论 |
| --- | --- |
| 最终入口 | **`app/renderer/dist/index.html`**（方案 A）。5B 由桌面UI 把源入口 `app/renderer/src/index.html` 移到 `app/renderer/index.html`（与删除旧渲染器同批），装配把 Vite `rollupOptions.input` 改为根 `index.html`；产出自 `dist/src/index.html` 变为 `dist/index.html` |
| 生产加载 | `app.isPackaged` ⇒ `loadFile(<app>/renderer/dist/index.html)`；5A 生产默认仍是旧 `app/renderer/index.html`，**5B 才切换** |
| 开发加载 | 默认与生产同一 `loadFile`；仅 `!app.isPackaged` 且显式 `ANS_DEV_SERVER_URL`（回环地址）时 `loadURL` Vite dev server。dev 不可用⇒一次性回退到已构建入口；无构建⇒恢复页。**dev 是便利项，不是门禁** |
| 生产 CSP | 逐字维持 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`；主进程不设 CSP 头、不加 `connect-src`/`unsafe-*`；dev 放宽仍由现有 Vite `apply:'serve'` 插件负责，build 不经过 |
| main.ts 写集 | `app/main.ts`（入口解析、加载分支、dev 回退、诊断、smoke 接线）、`app/desktop/diagnostics.ts`（可选 hook）、`app/desktop/packaged-smoke.ts`（新断言）、**新增** `app/desktop/renderer-entry.ts`（唯一路径事实源）；**preload 零改动、无新 IPC** |
| main.mjs 写集 | `test/桌面应用/e2e/main.mjs`：`ANS_RENDERER_ENTRY` 目标切换（三处写死路径）、默认跟随唯一路径事实源、报告加一行 `RENDERER_ENTRY=`（323→324 行，旧名全保留）、运行健壮化（失败不吞后续 300+ 行，不改判据） |
| 5A/5B 边界 | 5A 只准备：生产默认不切、旧渲染器不删、双端快照 + packaged dry run；5B 才切默认、删旧、移源、改 Vite input、跑新入口全量。**5B 后旧入口不可复跑，证据以 5A 快照为准** |
| 依赖 | **零新增依赖**；不改 `package.json`、`electron-builder.yml`、`release.yml`/`release-policy.mjs`；不接发布流水线 |

## 二、最终入口路径：选 `app/renderer/dist/index.html`

### 2.1 二选一比较

| 方案 | 产物入口 | 优点 | 代价 | 结论 |
| --- | --- | --- | --- | --- |
| **A（采用）** | `app/renderer/dist/index.html` | PM §16.2 明确「优先 `dist/index.html`」；`dist/` 根下只有一个入口，语义常规；dev URL 为 `/index.html`；对下一次冻结源/发布轮（`release-verify` 属装配）断言「包内 dist 入口」最直观 | 5B 需要一次跨角色批次：桌面UI 移源（`src/index.html` → 根 `index.html`）、装配改 Vite input；旧入口删除与移源必须同批，避免同一路径两个文件 | **采用** |
| B（不采用） | `app/renderer/dist/src/index.html` | 零构建改动；Phase 2/3A/4A/4B 的全部 Electron `file://` 冒烟已按此路径取证 | 把过渡期「源结构映进 dist」永久化；PM 要求保留时逐项说明；未来清理要再切一次（等同把 A 的成本推后并叠加一次全量回归）；main/e2e/冒烟/发布脚本长期多一层 `src/` 心智负担 | 不采用；若 PM 否决 A，B 是现成回退（仅常量与冒烟默认值不同，见 §2.4） |

**为什么不是「只改 Vite root」而不移 HTML**：把 `root` 改为 `app/renderer/src` 也能产出 `dist/index.html`，但会同时改变 dev server 根、HTML 内 `/src/main.tsx` 的引用（需改脚本路径）、`public/` 与相对资源根，属于为同一结果引入更多变量。5B 旧根 `index.html` 本来就要删除，**移源只动一个文件**，比改 root 更小、更接近常规 Vite 工程。故本方案保持 `root: "app/renderer"` 不变，只改 `rollupOptions.input`。

### 2.2 5B 落地机制（跨角色单批）

1. **桌面UI**（`app/renderer/**`）：删除旧 `index.html`、`renderer.js`、`styles.css`、7 个经典脚本、`vendor/` 与旧源码守卫测试；同时把 `app/renderer/src/index.html` **移动**为 `app/renderer/index.html`（内容逐字不变，`<script type="module" src="/src/main.tsx">` 仍相对 root 解析到 `app/renderer/src/main.tsx`）。
2. **装配**（`vite.config.ts`）：`rollupOptions.input` 由 `./app/renderer/src/index.html` 改为 `./app/renderer/index.html`（或直接删除 input，用 root 默认 `index.html`）；`root`、`base:'./'`、`modulePreload.polyfill=false`、`outDir:'dist'`、`build.target` 不变。构建结果：`dist/index.html` + `dist/assets/*`，HTML 内资源为 `./assets/...`。
3. **桌面窗口**：唯一路径事实源切到 `renderer/dist/index.html`；`app/main.ts` 生产 `loadFile` 指向它；`main.mjs` 默认目标随之切换。
4. **装配/测试**：本地 `npm run build:renderer` 先于 `npm run package`；`electron-builder.yml` **无需改动**（`files: app/**/*` 覆盖 `app/renderer/dist/**`，`asar:false` 下直接读盘；`!**/*.map` 不涉及）。

### 2.3 唯一路径事实源（新增 `app/desktop/renderer-entry.ts`）

为避免 `main.ts`、`main.mjs`、packaged smoke 各写一份字符串，新增本角色目录内的单文件：

```ts
// app/desktop/renderer-entry.ts（设计意图，非最终代码）
export const PRODUCTION_RENDERER_RELATIVE = ["renderer", "dist", "index.html"] as const; // 5B
export const BUILT_RENDERER_RELATIVE = PRODUCTION_RENDERER_RELATIVE;                      // 5B
export function resolveRendererEntry(appDir: string): string { /* path.join(...) */ }
```

- **5A 取值**：`PRODUCTION_RENDERER_RELATIVE = ["renderer", "index.html"]`（旧入口，生产默认不切）；`BUILT_RENDERER_RELATIVE = ["renderer", "dist", "src", "index.html"]`（dev 回退与 5A 新端验证目标）。
- **5B 取值**：两者都收敛为 `["renderer", "dist", "index.html"]`（旧常量删除，只保留一个事实）。
- `app/main.ts` 以 `HERE`（`app/` 目录）解析；`main.mjs` 以 `APP_DIR` 解析；packaged smoke 的期望入口由 `main.ts` 传入，不另存字符串。
- 该文件位于 boundary Section 1 的 `app/desktop/` 目录授权内，不新增目录、不新增依赖、不引入 IPC。

### 2.4 四类消费者统一表

| 消费者 | 5A | 5B（最终） |
| --- | --- | --- |
| `app/main.ts` 生产加载 | `loadFile(renderer/index.html)`（不变） | `loadFile(renderer/dist/index.html)` |
| `test/桌面应用/e2e/main.mjs` 默认 | 跟随 `PRODUCTION_RENDERER_RELATIVE`（旧） | 跟随同一常量（dist） |
| packaged smoke 期望入口 | 由 `main.ts` 传入实际加载入口 | 同左（dist） |
| `electron-builder.yml` | `app/**/*` 已包含 | 同左，**不改** |
| 桌面UI 三个 Electron 冒烟（phase3b/4a/4b） | 默认 `dist/src/index.html`（现状） | 由桌面UI 改为 `dist/index.html`（5B 同批） |
| `uiux-v2`/`ime-enter`/`bench-storm` | 已支持 `ANS_RENDERER_ENTRY`，5A 新端指向 `dist/src/index.html` | 指向 `dist/index.html` |
| `uiux-design-audit.mjs` | 仍写死旧入口（桌面UI 属主）；5A 双端对照前需补目标切换，否则该项只跑旧端并如实记录 | 指向 dist 入口 |

## 三、dev/prod 加载策略

### 3.1 分支判定

| 场景 | 判定 | 加载方式 | 说明 |
| --- | --- | --- | --- |
| 打包运行 | `app.isPackaged === true` | `win.loadFile(<app>/renderer/dist/index.html)` | 生产唯一路径；**忽略** `ANS_DEV_SERVER_URL` |
| 开发默认 | `!app.isPackaged` 且未设 `ANS_DEV_SERVER_URL` | `win.loadFile(生产入口)` | 5A 旧入口即开即用；5B 需先 `npm run build:renderer`（未构建则恢复页，见 §3.4） |
| 开发 HMR（可选） | `!app.isPackaged` 且设 `ANS_DEV_SERVER_URL` | `win.loadURL(<回环 URL>)` | 便利项，不是门禁；Vite 端口固定 5199（`server.port/strictPort`） |
| dev 失败回退 | 上一行加载失败/超时 | 一次性 `loadFile(已构建入口)` | 仅本窗口；之后重载直接用已构建入口 |

- **环境变量**：`ANS_DEV_SERVER_URL`（完整 URL，含路径）。不设默认值，避免 5A/5B 过渡期默认 URL 指错渲染器。示例：
  - 5A：`ANS_DEV_SERVER_URL=http://localhost:5199/src/index.html npm run app`
  - 5B：`ANS_DEV_SERVER_URL=http://localhost:5199/index.html npm run app`
- **安全校验**（只在此处）：必须是 `http:`/`https:` 且主机为 `localhost`、`127.0.0.1` 或 `[::1]`；拒绝带凭据、拒绝其它主机。非法值只记诊断并按文件入口启动，**绝不**用带完整 preload 能力的窗口加载任意远端页面。
- **dev server 探测**：不单独发 HTTP 探测请求；以「限时 `loadURL` + `did-fail-load`」为探测。限时 8s，超时调用 `webContents.stop()` 并按失败处理；记录 `reason: "timeout" | "load-failed"` 与错误码（不记凭据）。
- **回退一次性**：第一次 dev 失败后，本窗口记 `devServerUnavailable = true`；随后 `app:reload-interface` 不再尝试 dev URL（直接文件入口），避免每次重载都等 8s。重启应用后重新允许。回退失败（构建入口不存在）⇒ 现有恢复页。

### 3.2 CSP

- **生产**：完全维持现有 meta：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`。主进程**不**通过 `session.webRequest.onHeadersReceived` 注入 CSP，不新增 `connect-src`，不出现 `unsafe-inline`/`unsafe-eval`。构建产物静态扫描（装配/测试既有门）覆盖零内联脚本、零 `style=`、零 `unsafe-*`。
- **开发**：使用 `vite.config.ts` 现有 `devCspPlugin`（`apply: 'serve'`）把源码 meta 替换为 `DEV_CSP`（`script-src 'self' 'unsafe-inline'`、`style-src 'self' 'unsafe-inline'`、`connect-src 'self' ws: http:`）。仅 dev server 生效，build 不经过；本阶段不改该插件（归装配），也不把任何 dev 放宽带进打包产物。
- **恢复页**：`RECOVERY_PAGE` 为 `data:` URL，含内联 `onclick`，无 CSP meta；**保持现状**（加严格 CSP 会使其按钮失效），不作为产品页面。

### 3.3 窗口诊断与恢复

- 既有 `observeWindowDiagnostics` 继续处理 `did-fail-load`（主帧且非 -3）、`preload-error`、`render-process-gone` → `showFailure()`（恢复页）。
- 新增**仅用于 dev 回退**的可选 hook：`observeWindowDiagnostics(win, logger, showFailure, options?)`，其中 `options.onMainFrameLoadFailure?: () => boolean`；返回 `true` 表示「已由回退接管」，诊断函数不再显示恢复页。e2e harness 的三参调用保持兼容。
- 新增诊断事件（只记事实、不记敏感值）：`window.renderer.target`（`kind: "file" | "dev-url"`，file 记相对 app 目录路径，dev 记 host+path）、`window.dev-server.fallback`（`reason`、`errorCode`）、`window.dev-server.disabled`（一次）。
- `loadInterface()` 仍保持既有纪律：每次加载前复位两个 judge 开关（不持久化），加载成功后推送真实状态；失败路径不推假状态。

### 3.4 恢复页与「未构建」如实呈现

5B 后 `npm run app` 若未先构建，`loadFile` 失败 ⇒ 既有恢复页（「界面暂时无法显示 / 点击重新加载」）。这是如实呈现，不自动构建、不静默换旧入口（旧入口已删除）。README/装配文档需注明：5B 起开发运行前先 `npm run build:renderer`（`package.json` 属装配，本角色不改脚本）。

## 四、`app/main.ts` 写集与改动点

### 4.1 文件与函数级写集

| 文件 | 改动点 | 说明 |
| --- | --- | --- |
| `app/desktop/renderer-entry.ts`（新增） | `PRODUCTION_RENDERER_RELATIVE`、`BUILT_RENDERER_RELATIVE`、`resolveRendererEntry()` | 唯一路径事实源；5A 旧/新两个值，5B 收敛为一个 |
| `app/main.ts` | ① 引入 `resolveRendererEntry` 与 `pathToFileURL`（smoke 期望 URL 用）；② `loadInterface()`（现 L205–219）把固定 `win.loadFile(path.join(HERE,"renderer","index.html"))` 换成 `loadRenderer(win)`；③ 新增 `resolveRendererTarget()`/`loadRenderer()`/`loadDevServerWithFallback()`；④ `observeWindowDiagnostics` 调用（现 L220）传入 dev 回退 hook；⑤ packaged smoke 块（现 L647–661）传入期望入口并收集控制台错误；⑥ `app:reload-interface`（现 L230–235）语义不变，仍调 `loadInterface()`；⑦ 恢复页调用不变；⑧ 顶部注释说明 5A/5B 默认差异 | 不改 `webPreferences`（`contextIsolation`/`nodeIntegration:false`/`sandbox:false` 原样）、不改窗口尺寸/生命周期、不改任何业务 IPC |
| `app/desktop/diagnostics.ts` | `observeWindowDiagnostics` 增可选第 4 参 `options.onMainFrameLoadFailure`；`did-fail-load` 分支先问 hook，再决定是否 `showFailure()` | 向后兼容（e2e/main.mjs 三参调用不变） |
| `app/desktop/packaged-smoke.ts` | `parsePackagedSmokeArguments` 增可选 `--ans-renderer-entry=<绝对路径>`（仅随 `--ans-packaged-smoke` 生效，须位于 `<appPath>/app/renderer/dist/` 内）；`packagedSmokeScript(expectedEnvPath, expectedEntryUrl)` 增入口/CSP/驱动/根挂载/违规/就绪等待断言，重锚 `settings` | 见 §五 |
| `test/桌面应用/pi-config.test.ts` | 扩展 `parsePackagedSmokeArguments` 用例（新参数合法/越界/非绝对/缺 smoke 上下文）；路径常量与 5A/5B 值断言 | 既有文件，不新增测试文件 |
| `test/桌面应用/ans-wiring.test.ts` | 源码级接线钉：`main.ts` 使用 `resolveRendererEntry`、不再出现写死 `renderer/index.html`；三处 e2e 加载点由共享常量派生（跨文件静态断言） | 不导入 electron |
| `test/桌面应用/diagnostics.test.ts` | hook 行为：主帧失败且 hook 返回 true ⇒ 不显示恢复页；返回 false ⇒ 显示 | 既有文件 |
| `test/桌面应用/e2e/main.mjs` | 见 §六 | 本角色属主 |

**明确不做**：不改 `app/preload.cjs`（无新 IPC）；不改 `app/desktop/interface.ts` 与会话/投递/门禁逻辑；不改 `package.json`/`electron-builder.yml`/`vite.config.ts`/`release.yml`/`release-policy.mjs`；不改 CSP meta（属桌面UI 的 `index.html`）。

### 4.2 `loadInterface()` 状态机（设计）

```
loadInterface():
  showingFailure = false; reset shell/decision judge switches
  target = resolveRendererTarget()           // file(production) | dev-url
  try:
    if target dev-url:
      log window.renderer.target
      await loadWithTimeout(8s)              // 失败/超时 ⇒ devServerUnavailable = true
    else:
      await win.loadFile(target.file)
  catch(e):
    if target dev-url && builtEntryExists:
      log window.dev-server.fallback; await win.loadFile(builtEntry)   // 一次
    else:
      log window.interface.failed; showFailure(); return
  push shellJudgeState(); push decisionJudgeState()
```

- dev 的 `did-fail-load` 与 `loadURL` rejection 共用同一个 `fallbackStarted` 守卫，杜绝双重跳转。
- `showingFailure` 只在最终失败时置位；回退成功不显示恢复页。
- `app:reload-interface` 返回 `{ok: !showingFailure}` 语义不变。

### 4.3 packaged smoke 接线点

- `did-finish-load` 后先**有界等待**（≤5s，50ms 步进）`#root` 有子节点且 `window.__ansRenderer` 就绪，再执行 smoke 脚本；React 异步挂载不再依赖「load 完成即已渲染」的时序假设。
- 将 `pathToFileURL(实际加载入口)`、严格 CSP、`app.getVersion()` 等作为 JSON 注入脚本。
- 在 smoke 窗口上收集 `console-message` 中 error 级且含 CSP/CORS/`ERR_` 的消息；与 `did-fail-load` 计数一起写入结果，`ok` 要求两者为空。
- 结果文件仍 `0600`、仍 `app.exit(ok ? 0 : 1)`；`ok` 仍要求 `app.isPackaged === true`。

## 五、packaged smoke 断言计划

### 5.1 检查项（旧 → 新）

| 检查键 | 5A/5B 口径 | 说明 |
| --- | --- | --- |
| `entry`（新增） | `win.webContents.getURL() === pathToFileURL(实际入口).href` | 证明打包后加载的确实是构建入口，不是旧入口或恢复页（路径含中文/空格时用 URL 比较） |
| `dom` | `.app` 存在且 `#runtime-select` 存在 | 保留 |
| `rootMounted`（新增） | `#root` 至少一个子元素 | React 已挂载 |
| `preload` | `window.desktop.getRecoveryState/getRuntimeConfig` 为函数 | 保留 |
| `ipc` | `getRecoveryState` + 三引擎 `getRuntimeConfig` 返回结构正确 | 保留 |
| `driver`（新增） | `window.__ansRenderer.loadProject/selectRole` 为函数且 `state` 为对象 | 同名测试驱动进入生产构建（Phase 2 起既有事实） |
| `csp`（新增） | CSP meta 指令集合**恰好**为 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`；无 `connect-src`、无 `unsafe-inline`/`unsafe-eval` | 逐指令比较，忽略空白与尾分号 |
| `cspViolations`（新增） | `window.__ansCspViolations` 长度 0 | 页面已内建记录（`main.tsx`） |
| `consoleErrors`（新增，主进程侧） | 无 error 级 CSP/CORS/`ERR_` 控制台消息 | 由 `main.ts` 收集 |
| `importDisabled` | 无项目 ⇒ `#runtime-select.disabled === true` | 保留 |
| `missingConfiguration` | 全新 userData 下三引擎 `missingKeys` 均非空 | 保留 |
| `settingsEntryDisabled`（重锚，原 `settings`） | 无项目 ⇒ `#tab-pi.disabled === true` 且 `#right-drawer` 关闭（`aria-hidden="true"`） | **语义变化**：4A 起设置入口「按项目」启用（PM §12.3 #2、§13.4）；旧 smoke 在无项目时打开设置，与新批准行为冲突。旧 `settings` 的「开/关抽屉」正向断言迁到有项目的 e2e（main.mjs 已覆盖），packaged smoke 改为如实断言禁用态 |
| `envPathMatches` | 三引擎 `view.path` 均等于预期 `.env` 路径 | 保留 |

### 5.2 smoke-only 入口参数

`--ans-renderer-entry=<绝对路径>`：

- 只接受与 `--ans-packaged-smoke` 同时出现；`resolve` 后必须位于 `<app.getAppPath()>/app/renderer/dist/` 下且以 `.html` 结尾；否则解析失败退出（不静默忽略）。
- 目的：**5A 在不切换生产默认的前提下**，用真实打包主进程验证新构建入口（`dist/src/index.html`）；5B 不传该参数，验证默认 `dist/index.html`。
- 它不是产品能力：不暴露给渲染进程、不改变普通启动，只在显式冒烟模式下生效。列为 PM 复核点（§十-3）。

### 5.3 运行矩阵

| 阶段 | 命令形态 | 期望 |
| --- | --- | --- |
| 5A dry run | 本地打包（`npm run package` 或装配等价的 unpacked 构建）→ 启动可执行文件 `--ans-packaged-smoke <abs.json> --user-data-dir=<abs>` | 默认入口仍为旧渲染器；`ok=true` 证明打包/主进程/preload 基线未坏 |
| 5A 新端预验 | 同一包 + `--ans-renderer-entry=<...>/app/renderer/dist/src/index.html` | `entry` 指向 dist/src；CSP/驱动/IPC 全 true；提前暴露 5B 风险 |
| 5B 最终 | 重新构建/打包后不传入口参数 | `entry` 指向 `app/renderer/dist/index.html`；全部 true |

## 六、`main.mjs`（桌面窗口属主）目标切换与报告影响

### 6.1 目标切换

- 新增解析（靠近顶部常量区）：

```js
const RENDERER_ENTRY = process.env.ANS_RENDERER_ENTRY
  ? path.resolve(process.env.ANS_RENDERER_ENTRY)
  : resolveRendererEntry(APP_DIR);   // 唯一路径事实源（§2.3）
```

- 校验：绝对路径、`.html`、`fs.existsSync`；不合法 ⇒ 写 `RENDERER_ENTRY_ERROR=...` 报告并退出，不静默回退（避免把「目标写错」误当通过）。
- **三处写死路径全部替换**（现状 `win.loadFile(path.join(APP_DIR, "renderer", "index.html"))`）：
  1. `registerIpc()` 内 `app:reload-interface`（L80）；
  2. 崩溃恢复后重建窗口的加载（L1614）；
  3. `whenReady` 首次加载（L1661）。
- 环境变量名与桌面UI 三个套件一致（`ANS_RENDERER_ENTRY`），5A 新端：`ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/src/index.html`。

### 6.2 323 条 report 行影响

- 现状：`log("...")` 恰 **323** 行（契约面 §3.3 与测试台账一致）。目标切换**不改任何既有行名**；新增首行 `RENDERER_ENTRY=<path>`（324 行）。双端对照规则「新端须包含旧端全部名字；新增检查允许」——同一改后脚本跑双端，行数一致。
- 值型行（`PROJECT=`、`OUTDIR=`、截图标记等）按名字比较时必须先归一化路径/实例差异；测试角色按 `NAME=` 建清单，值差异逐条登记。
- **运行健壮化（不改判据）**：现有 `repairCheck` 失败即 `throw`，且部分表达式直接解引用可能为 null 的节点（例如 `#switch-confirm`）。新入口上任何一处缺失都会让报告在 323 行中途截断，后续检查名全部「缺失」。5A 需做两处机械改动：
  1. `repairCheck` 改为累计失败并继续（末尾新增 `E2E_PASS=<all>`），使每一行都产出；
  2. 可能 null 解引用的表达式改为可空判定（缺失 ⇒ 该项 `false`）。
  这是**让失败可见**而非放宽断言：旧端全绿时行为不变；新端失败照旧为 false，并由 `E2E_PASS` 汇总。此项列入 PM 复核（§十-5）。

### 6.3 5A 快照与 5B 运行计划

| 阶段 | 运行 | 产物 | 判定 |
| --- | --- | --- | --- |
| 5A 旧端 | 默认（旧入口） | `5a-main-old/report.txt` + 截图 | 既有基线（应全绿/已知红单列） |
| 5A 新端 | `ANS_RENDERER_ENTRY=<...>/dist/src/index.html` | `5a-main-new/report.txt` + 截图 | 与旧端**逐 NAME 对照**：集合相等、布尔相等；允许差异逐条「旧名→新名/旧值→新值/批准依据」 |
| 5A 台账 | 测试角色 | A/B/C/D 分类（同 3A 台账格式） | B=新入口尚未实现/未迁移；C=既有基线红；D=新入口新增检查 |
| 5B 新端 | 默认（dist/index.html，旧入口已删） | `5b-main-new/report.txt` + 截图 | 对齐 5A 新端快照；**不得**声称旧端可复跑 |

- `OUTDIR` 必须是绝对路径并先建目录（既有约束）；旧/新用不同目录，禁止互相覆盖截图与报告。
- 5A 新端预计差异（**静态预判，需运行证实**，不是结论）：`op-kind-preview/select/multi`、`is-flash`、`switch-confirm*`、`inp-runtime`、`.rt-select`、`#right-queue-overview`、`sys-readonly/sys-nowrite/sys-ok`、`hb-status` 等旧渲染器载体在新渲染器不存在；其中多数为「断言元素不存在」的负向检查（新端仍为 true），正向检查需重锚。
- **重点待裁定缺口（静态发现）**：main.mjs 的 P1-3「忙时切换项目内联确认条」（`SWITCH_CONFIRM_ON_BUSY`/`SWITCH_BAR_NOT_IN_CHAT`/`SWITCH_CANCEL_NOOP`/`SWITCH_CONFIRM_RELOADED`/`SWITCH_NO_CONFIRM_WHEN_IDLE`/`SWITCH_IDLE_HINT`）在契约面中**没有新渲染器对应项**；新 `Sidebar.importProject` 直接 `loadProject`，`chat-store.loadProject` 不停止旧项目会话。5A 必须以运行证据确认，并由 PM 裁定：桌面UI 补等价确认流，或批准按新语义重锚（含「切换时旧项目会话如何处理」），**不得静默删除**。

## 七、5A/5B 边界

| 项 | 5A（准备，不切换） | 5B（切换与下线） |
| --- | --- | --- |
| 生产默认入口 | 旧 `renderer/index.html` | `renderer/dist/index.html` |
| `main.ts` | 实现入口解析、dev/prod 分支、dev 回退、smoke 新断言；**默认常量仍指旧入口** | 常量切 dist；`LEGACY`/`BUILT` 双值收敛为一个 |
| Vite input / 源入口 | 不动（仍 `src/index.html` → `dist/src/index.html`） | 装配改 input；桌面UI 移源到根 `index.html` |
| 旧渲染器/vendor/旧测试 | **不得删除**；双端快照必须先完成 | 桌面UI 删除；旧文件不再存在 |
| main.mjs | 加目标切换/健壮化；跑旧+新双端快照 | 默认切 dist；只跑新端；对照 5A 快照 |
| packaged | dry run（默认旧 + smoke-only 新端预验） | 重新打包，默认新入口 smoke |
| 证据 | 双端逐 NAME 对照、允许差异清单、packaged 预验 | 新端全量、packaged smoke、对照 5A 快照；**旧端不可复跑** |
| 失败回退 | 保持旧生产可用 | 入口不可用 ⇒ 恢复页；回退到经典脚本单包/自定义协议须回 PM（§八 R10） |

## 八、风险与回退

| # | 风险 | 事实/影响 | 缓解与验证 |
| --- | --- | --- | --- |
| R1 | `file://` 下 ESM/分块 | Phase 2/3A/4A/4B 的真实 Electron `file://` 冒烟（真实 preload、零 CSP/CORS、零 did-fail-load）已证明可加载 `dist/src/index.html`；但那些冒烟以独立 harness 建窗，**尚未经真实 `app/main.ts` 生命周期** | 5A：`ANS_DEV_SERVER_URL` 验证 dev；文件模式经 e2e/new main.mjs；packaged smoke（smoke-only 入口）在真实打包主进程复验。5B：最终入口再验一次 |
| R2 | dev/prod CSP 分叉 | dev 放宽（inline/ws/http）若泄漏到生产即红线 | 生产 meta 不由主进程改写；构建后静态扫描零内联/unsafe（装配/测试既有门）；packaged smoke 断言完整指令集；代码评审检查主进程无 CSP header |
| R3 | packaged 路径 | `asar:false` 下 `path.join(HERE,"renderer","dist","index.html")` 可直接读；中文/空格安装路径 | 用 `pathToFileURL` 比较；macOS 本机打包实测；Windows 另见 R4 |
| R4 | Windows 差异 | `loadFile`/`file://` 盘符与 URL 编码、路径分隔符、electron-builder zip | 代码只用 `path.join`/`pathToFileURL`；本机不声称 Windows 已验证（PM §16.5：Windows/DPI/屏读另列 missing-evidence 或真机轮） |
| R5 | main.mjs 旧契约差异 | 新渲染器载体变化（`op-kind-*`、`is-flash`、`switch-confirm*` 等）；忙时切换确认流缺失（§6.3） | 5A 逐 NAME 台账 + PM 裁定；先补等价断言/实现，再删旧载体；不静默豁免 |
| R6 | packaged smoke `settings` 重锚 | 无项目时新 UI 设置入口按设计禁用；旧断言必然失败 | 按 §5.1 重锚为禁用态并说明批准依据（PM §12.3#2/§13.4）；有项目的开/关由 main.mjs 覆盖；列入 PM 复核 |
| R7 | dev URL 安全 | 带完整 preload 的窗口若可加载远端页面即高危 | 仅回环 + http(s) + 无凭据；非法即忽略并文件启动；仅 `!app.isPackaged`；不持久化 |
| R8 | 未构建/未打包 | 5B 后 `npm run app` 未 build 会进恢复页 | 如实恢复页；文档注明先 `build:renderer`；不静默回退旧入口 |
| R9 | dist 不入 git | `.gitignore` 第 9 行忽略 `app/renderer/dist/`；CI/发布尚未接（M1） | 本地构建先于打包；packaged smoke 防「空入口」；下一次冻结源由装配在 `release-verify` 增断言（本轮不做） |
| R10 | 入口方案失败回退 | 若真实主进程仍无法加载模块产物：① Vite 构建经典脚本单包（`format:'iife'`、禁分块/动态导入，仍是纯 Vite）；② 桌面窗口注册受控自定义协议（如 `app://`）并 `loadURL` | ②会引入主进程加载路径变更与更多工作量，**必须回 PM**；本轮证据未显示需要回退，不在 5A 自行决定 |
| R11 | 恢复页与 preload | 恢复页为 `data:` URL，靠 preload 的 `reloadInterface`；无 CSP meta | 保持现状；packaged smoke 不把恢复页当通过（`entry` 检查会暴露） |
| R12 | 入口切换顺序 | 源移动与 Vite input/默认常量若不同批，构建可能产出旧入口或空入口 | 5B 单批顺序：删旧+移源 → 改 input → build → 切 main.ts 常量 → main.mjs 默认 → packaged smoke；任一步失败停在该步，不切默认 |

## 九、依赖、顺序与零新增

| 角色 | 交接项 | 时点 |
| --- | --- | --- |
| 桌面窗口 | 本文设计 → 5A 实现（`renderer-entry.ts`、`main.ts`、`diagnostics.ts`、`packaged-smoke.ts`、main.mjs、既有测试扩展）→ 5B 常量切换 | 5A/5B |
| 桌面UI | 5A：保持旧渲染器；三个 Electron 冒烟可继续用 `dist/src`；补 `uiux-design-audit` 目标切换（其属主）；5B：删除清单 + 移源 + 冒烟默认改 dist | 5A 前/5B 同批 |
| 装配 | 5B：`vite.config.ts` input 改根 `index.html`；`build:renderer` 先于本地打包；`electron-builder.yml` 不改；不接 release | 5B |
| 测试 | 5A：旧/新双端快照、逐 NAME 台账、允许差异清单、独立验证；5B：新端全量 + packaged smoke + 对照 5A 快照 | 5A/5B |
| PM | 裁定入口 A/B、smoke-only 参数、`settings` 重锚、main.mjs 健壮化与允许差异、忙时切换缺口 | 5A 派发前/门 |
| UIUX/产品 | 不受入口影响；最终视觉审计与产品复核仍按 Phase 5 计划 | 5B |

**零新增依赖**：不装包、不改锁文件；`renderer-entry.ts` 仅用 `node:path`。**不改 preload、不新增 IPC**；如需新增 IPC，另按角色卡与 PM/契约评审。

**建议实施顺序（5A）**：① `renderer-entry.ts` + main.ts 分支 + diagnostics hook（生产默认不动）；② packaged-smoke 参数/脚本 + 既有测试扩展；③ main.mjs 目标切换与健壮化；④ 旧/新双端跑 + packaged dry run + 新端 smoke-only 预验；⑤ 台账与证据，交测试独立复核。

## 十、待 PM 复核点

1. **入口方案 A**：`dist/index.html` + 5B 移源/改 input；若 PM 选 B（`dist/src/index.html`），本方案仅需把常量与冒烟默认改为现状，其余（dev 策略、smoke、main.mjs）不变。
2. **跨角色单批**：桌面UI 移源与删除旧渲染器同批、装配改 Vite input；确认 5B 写集与顺序（§2.2、§八 R12）。
3. **smoke-only `--ans-renderer-entry`**：新增仅冒烟模式的主机参数（限制在包内 `app/renderer/dist/`），用于 5A 预验新入口；是否批准。
4. **packaged smoke 重锚**：无项目时 `#tab-pi` 禁用替代旧「打开设置」断言；新增 entry/CSP/驱动/根挂载/违规/控制台检查。
5. **main.mjs 健壮化与允许差异**：`repairCheck` 累计失败、null 安全化（不改判据）；5A 双端差异按 A/B/C/D 台账逐条批准；**忙时切换项目确认流缺口**（§6.3）需明确「桌面UI 补实现」或「批准重锚」。
6. **dev server 便利项**：仅 `!app.isPackaged` + 回环 URL；不是门禁，不进发布。
7. **新增单文件** `app/desktop/renderer-entry.ts`：在 `app/desktop/` 目录授权内，作为唯一路径事实源；如不同意新增，则退回 main.ts/main.mjs 两处显式常量并在 5B 同批核对。
8. **恢复页不改**：保持 `data:` + 内联 onclick；不作为产品页面。
9. **5A 不切生产默认**：本文实现完成后生产仍加载旧入口；只有 5B 门通过才切换，最终验收由独立验收角色在独立上下文判断（PM §16.5）。

## 附：核对方式与状态声明

- 只读核对：角色卡/桌面窗口 role-card/boundary（MD/YAML）、PM 评审 revision 10 §十六、产品提案 revision 2 §六、`app/main.ts`、`app/preload.cjs`（头部与桥面）、`app/desktop/packaged-smoke.ts`、`app/desktop/diagnostics.ts`、`test/桌面应用/e2e/main.mjs`（入口/加载/repair/切换项目段与全部选择器静态提取）、`vite.config.ts`、`package.json`、`electron-builder.yml`、`release-verify.mjs`、`app/renderer/src/index.html`、`app/renderer/dist/src/index.html`（现构建产物）、桌面UI [契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md)、Phase 2 变更记录与 Electron `file://` 冒烟报告、`app/renderer/src/{App,main,Sidebar,ChatHeader,ChatRow,chat-store,test-driver}.ts(x)` 的入口/驱动/切换相关片段。
- 执行过的只读命令：`ls`、`find`、`wc -l`、`grep`、`sed -n` 读取片段。**未运行**应用、Electron、e2e、构建、打包、`node --test`、模型或网络；未读 `.env`。文中行号与产物路径为 2026-10-21 工作树读数，实施前按当时树复核。
- **状态**：本文是 5A 入口方案设计（status: proposed，revision 1），不是实施记录、测试记录或验收结论；不表示任何代码已修改。5A 完成后由测试独立验证，5B 与最终验收另按 PM §16.3/§16.5 执行。
