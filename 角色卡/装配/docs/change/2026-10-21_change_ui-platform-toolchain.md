---
id: ui-platform-toolchain-20261021
type: change
title: UI 平台化 Phase 1：渲染层 Vite 工具链与依赖冻结（仅本地）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按产品 revision 2 §六 Phase 1 与 PM 评审 M1，建立仅本地的渲染层工具链（依赖、Vite 配置、脚本、tsconfig、gitignore）
  - date: "2026-10-21"
    kind: implemented
    summary: 16 个依赖精确装入 devDependencies；根 vite.config.ts 与 4 个渲染层脚本落地；根 typecheck 0 错；vite build 因入口未建（桌面UI Phase 2）如实失败
---

# 渲染层工具链：只做本地构建，不碰发布流水线

UI 平台化的第一阶段由装配搭好「新界面能被构建出来」的最小环境：安装渲染层依赖、建立根级 Vite 配置、加四个 npm 脚本、让根 TypeScript 检查避开渲染层、忽略构建产物。**这次没有改任何 `app/` 源码、没有改发布流水线**：旧渲染器照常可用，正式发布仍走 v1.4.0 冻结配方（PM 评审 M1：发布接入属下一次冻结源/新发布轮）。

以前仓库只有「无构建」的桌面主进程与手写渲染器；现在多了一条只作用于 `app/renderer/` 的构建链（Vite 8 + React 19 + Tailwind v4），主进程与 preload 仍保持无构建。**当前还构建不出完整页面**：新入口 `app/renderer/src/index.html` 与 `app/renderer/tsconfig.json` 由桌面UI 在 Phase 2 创建，缺它们时构建与 `typecheck:renderer` 都会失败——这是排期内的预期状态，不是缺陷。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `package.json` | 16 个依赖以精确版本（无 `^`/`~`）加入 **devDependencies**；新增 4 个脚本：`dev:renderer` / `build:renderer` / `preview:renderer` / `typecheck:renderer`；既有脚本语义未动 |
| `package-lock.json` | `npm install --save-dev --save-exact` 自动更新；**既有依赖版本零变化**（脚本比对：0 个已存在条目被删除、0 个版本变化，仅根条目新增 devDependencies） |
| `vite.config.ts`（新建） | 只构建 `app/renderer`：`root: "app/renderer"`、`base: "./"`、`@` 别名指向 `app/renderer/src`、入口 `app/renderer/src/index.html`、产物 `app/renderer/dist/`、关闭 modulePreload polyfill、`build.target` 钉 `chrome152`、开发端口 5199（strictPort）；仅 serve 时注入放宽的开发 CSP |
| `tsconfig.json` | `exclude` 增加 `app/renderer`（该目录由桌面UI 的独立 `app/renderer/tsconfig.json` 负责），其余未改 |
| `.gitignore` | 增加 `app/renderer/dist/` |
| **未改** | `.github/workflows/release.yml`（M1）、`electron-builder.yml`（`files: app/**/*` 已覆盖 dist）、`app/`、`src/`、`test/`、其他角色文件 |

## 依赖清单（实际安装版本）

全部装入 `devDependencies`、全部精确锁版。**运行时库 10 个**（按提案 §4.4 的 ≤12 预算口径计入）：`react@19.3.1`、`react-dom@19.3.1`、`@base-ui/react@1.9.0`、`lucide-react@1.60.0`、`motion@14.4.0`、`react-resizable-panels@4.14.8`、`zustand@5.0.15`、`clsx@2.1.1`、`tailwind-merge@3.7.0`、`class-variance-authority@0.7.1`。**构建期/类型包 6 个**：`vite@8.3.4`、`@vitejs/plugin-react@6.1.2`、`tailwindcss@4.3.3`、`@tailwindcss/vite@4.3.3`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`。

- 与任务指定的 16 个版本逐一相同，npm 未做任何替代解析（安装前逐一 `npm view` 核对全部存在）。
- 未安装：`@dnd-kit/*`（按需）、`tw-animate-css`、`vitest`、Storybook、任何 `@radix-ui/*` / react-aria 包。
- 说明：`motion@14.4.0` 自身依赖 `framer-motion@14.4.0`（`motion/react` 是其新一代入口）。这是该包内部结构，不是另外装了第二套动画库；禁入清单禁止的是「motion + framer-motion 双装」式的第二套选择。
- `typescript` 保持既有 `^7.0.2` 未动：它不在本轮安装清单内；PM 评审 Q1 把 `typescript` 的 `^` 规范化列为「实施中确认」项，如要收紧应随依赖台账一并处理。

## Vite 配置要点与依据

- `base: "./"`：Electron 用 `loadFile` 走 `file://`，绝对路径会失效。
- `build.target: "chrome152"`：本机 Electron **44.7.0** 实测内置 Chromium **152.0.7977.130**（2026-10-21，`ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "console.log(process.versions.chrome)"`）；应用只跑在打包的 Electron 里，无需兼容更旧浏览器。配置内注释写明了这一依据。
- `build.modulePreload.polyfill: false`：Vite 默认 polyfill 会以内联脚本/动态预取方式出现，在 `default-src 'none'` 的生产 CSP 下会被拦截。
- `build.rollupOptions.input` 显式指向 `app/renderer/src/index.html`：过渡期旧入口 `app/renderer/index.html` 继续可用，新入口用独立路径，避免把旧页与 7 个经典脚本打进构建（PM 过渡期入口口径）。
- CSP：生产策略 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:` 由渲染层源码 HTML 的 meta 提供，**本构建不改写**；仅在 dev server（`apply: "serve"` 的 `transformIndexHtml`）把现有 CSP meta 替换为开发版（`script-src`/`style-src` 允许 `'unsafe-inline'`、`connect-src` 允许 `ws: http:`），源码里若没有 meta 则注入一个。
- 开发服务器固定 `port: 5199`、`strictPort: true`，端口占用即报错而不是漂移。

## 命令与真实结果

| 命令 | 结果 |
| --- | --- |
| `node -v` / `npm -v` | v24.14.0 / 11.9.0 |
| `npx vite --version` | `vite/8.3.4 darwin-arm64 node-v24.14.0` |
| `npm install --save-dev --save-exact <16 包>` | `added 51 packages, and audited 517 packages`；`8 moderate severity vulnerabilities`（见下） |
| `npm ls react react-dom` | 全部 `react@19.3.1` / `react-dom@19.3.1`，子依赖全部 `deduped`，**无重复版本** |
| `npx tsc --noEmit`（根） | **exit 0**（工作树含其他并行会话对 `src/` 的改动，本轮未出现相关报错） |
| `npx vite build --config vite.config.ts` | **按预期失败**：`[UNRESOLVED_ENTRY] Cannot resolve entry module app/renderer/src/index.html.`（入口由桌面UI Phase 2 创建）；证明配置可加载、Vite 8（Rolldown）已接受 target/别名/插件配置 |
| `npm run typecheck:renderer` | **按预期失败**：`error TS5058: The specified path does not exist: .../app/renderer/tsconfig.json`（该 tsconfig 由桌面UI Phase 2 创建） |
| 开发服务器冒烟（`vite --config vite.config.ts`，随后停止） | `VITE v8.3.4 ready in 98 ms`，`http://localhost:5199/` 返回 HTTP 200；依赖扫描对缺失入口给出 `failed to resolve rolldownOptions.input` 警告（预期）。经 dev server 返回的 HTML 中 CSP meta 已按插件替换为开发版，逐字为 `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: http:`，验证了 serve 分支插件生效；服务已停止，无残留进程与产物 |

补充观察：

- 开发服务器默认监听 `localhost`（本机解析为 `::1`）：`curl http://localhost:5199/` 成功，`curl http://127.0.0.1:5199/` 连接失败。这是本机 IPv6 解析差异，不是配置问题；Vite 启动输出即以 `http://localhost:5199/` 提示。
- `npm audit` 的 8 个 moderate 全部来自既有 devDependency `electron-builder@26.15.3` 的传递链（`sprintf-js` ← `roarr` ← `global-agent` ← `@electron/get` ← `app-builder-lib`/`dmg-builder`），**与本轮新增的渲染层依赖无关**；`npm audit fix --force` 会把 electron-builder 降级到 26.5.0（破坏性变更），本轮不做。

## 未验证项（如实列出）

1. **真实入口的构建成功**：`app/renderer/src/index.html` 尚不存在（桌面UI Phase 2），`vite build` 只验证到「配置可加载、入口缺失」。
2. **真实 Electron `loadFile(dist)` 下 ES 模块/分块在 `file://` 的加载**：提案 §六 Phase 1 的「首件」门，需要入口与真实 Electron 夹具；本机尚未执行。若失败，回退方案为经典脚本单包或自定义协议（后者须回 PM 评审）。
3. **生产构建产物的 CSP 静态扫描**（无内联 `<script>`/`unsafe-*`）与 **≤300KB gzip 首屏预算**（Q11）：都要等真实构建产物。
4. **Tailwind v4 / Base UI 在真实 Electron（Chromium 152）下的兼容性**（评审 R13）：未有组件代码可测。
5. **`typecheck:renderer` 的真实类型结果**：`app/renderer/tsconfig.json` 由桌面UI 创建后才可运行。
6. **发布链路**：按 M1 明确未接入（`release.yml` 未改）；`electron-builder.yml` 也无需改（`files: app/**/*` 已覆盖 dist）。
7. **桌面窗口的 dev 加载路径**（`app/main.ts` 目前固定 `loadFile(renderer/index.html)`）：本阶段不涉及，切换属 Phase 5。

## 边界核对

本轮只写：`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`.gitignore`、本角色 `角色卡/装配/` 内文档。`git status` 中本角色相关改动仅为上述 5 个根文件（4 改 1 新增）；未触碰 `app/`、`src/`、`test/`、发布工作流及其他角色目录。工作树中其他改动来自并行会话，与本记录无关。
