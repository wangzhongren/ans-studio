---
id: ui-platform-phase5b-renderer-entry-20261021
type: change
title: UI 平台化 Phase 5B（装配）：Vite 入口切至 app/renderer/index.html 与 verify 5B 清单
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase5a-build, ui-platform-phase5a-local-package]
events:
  - date: "2026-10-21"
    kind: created
    summary: 步骤 a（桌面UI 删除旧渲染器/vendor/旧测试、源入口移到 app/renderer/index.html）后，装配执行步骤 b
  - date: "2026-10-21"
    kind: implemented
    summary: vite.config input 切到 app/renderer/index.html，产出 dist/index.html；verify-local-package.mjs 改为 5B 必含/必无清单并锁定 dist/index.html 入口；步骤 c 后最终包 ZIP 406,507,281B、sha256 edeeef19…；packaged smoke 14/14 全绿；发布流水线未接（M1）
---

# Phase 5B 装配：入口切换与 5B 打包校验清单

依据 PM 评审 §十六 Phase 5B 与协调方步骤划分：**步骤 a**（桌面UI）已完成——旧渲染器文件、vendor、旧测试删除，新渲染器源入口移到 `app/renderer/index.html`；本文记录**步骤 b**（装配：Vite 入口与 verify 清单）及**步骤 c**（桌面窗口：`renderer-entry.ts` 收敛为唯一 `renderer/dist/index.html`、`main.ts` 生产默认切换）完成后的最终包。下方仍保留步骤 b 过渡态的历史数值，便于对照；**最终值以「5B 最终包」小节为准**。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `vite.config.ts` | `build.rollupOptions.input`：`app/renderer/src/index.html` → **`app/renderer/index.html`**；`root: "app/renderer"`、`base: "./"`、`modulePreload.polyfill: false`、`target: "chrome152"`、dev CSP 插件均未动。产物由 `dist/src/index.html` 变为 **`dist/index.html`**（`emptyOutDir` 会清掉旧 `dist/src`） |
| `test/装配/verify-local-package.mjs` | 清单切 5B：必含 `app/main.ts`、`app/preload.cjs`、`package.json`、`LICENSE`、`app/renderer/dist/index.html`＋`dist/assets`（≥1 JS/≥1 CSS、无 `.map`）；必无旧渲染器 8 文件（`renderer.js`、`styles.css`、`markdown.js`、`engine-selector.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js`）、`app/renderer/vendor/`、旧产物 `app/renderer/dist/src/`；packaged smoke 入口覆盖改为包内 `dist/index.html`；保留递归禁止项扫描、devDependencies 不入包、生产依赖在位、隔离 HOME smoke 与 `local-smoke.json` 证据 |
| **未改** | `package.json` scripts（`package:local`/`verify:local` 语义不变）、`package-lock.json`、依赖、`electron-builder.yml`、`release.yml` / release-policy、`app/`、`src/`、其他角色文件 |

## 构建结果（2026-10-21，macOS arm64 / Electron 44.7.0）

`npm run build:renderer` exit 0，产物为 `app/renderer/dist/index.html` + `assets/`（旧 `dist/src/` 已被清空）：

| 产物 | 原始大小 | gzip | sha256 |
| --- | --- | --- | --- |
| `dist/index.html` | 581 B | 400 B | `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301` |
| `dist/assets/index-BVLfGR_D.js` | 825,985 B | 269,177 B | `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095` |
| `dist/assets/index-DUBNk8-R.css` | 108,501 B | 19,601 B | `76fad7ce7c7b449d7e3b5f61517555f7f5c9d97e169a81d504289131d6ffc0f6` |

- 首屏 JS+CSS gzip 合计 **288,778 B ≤ 300 kB**（Q11 口径）。
- 生产 CSP meta 原样保留：`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`；dist HTML 无 `unsafe-inline` / `unsafe-eval`、无内联脚本；入口只引用 `./assets/...` 相对资源（file:// 可用）；单 `<script type="module">`。
- JS 内容哈希与 5A 最终冻结包相同（`f568e2aa…`），入口路径/HTML/CSS 哈希变化符合「入口迁移 + 200% 遮挡修复」预期。

## 5B 最终包（步骤 b/c 完成，2026-10-21 21:07）

步骤 c 已由桌面窗口完成：`app/desktop/renderer-entry.ts` 收敛为唯一常量 `RENDERER_RELATIVE = ["renderer","dist","index.html"]`，`app/main.ts` 生产默认即该构建产物。装配在冻结候选上清空 `release-output/local/` 后重新执行 build→package→verify：

- **ZIP**：`release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，**406,507,281 B**，sha256 **`edeeef1949d51ee471f5c922f18cb17fdd0e97ddd33e58b5264a8411a7d8f13f`**。
- 包内 `app/main.ts` sha256 `64a56c33647bed252415fdd5601e38531a64c43a4acc6ddb3b9660d1e8fe0671`（步骤 c 版本）；`app/preload.cjs` `98dde83a…`；`dist/index.html` `3c4da2a2…`。
- 包内**仅** `dist/index.html`＋`assets/` 作为渲染产物；旧渲染器 8 文件、`vendor/`、`dist/src/` 全部不在包内；必含 6/6；私有数据/噪声/test 目录扫描通过。
- devDependencies 打包 **0/21**；生产依赖 **8/8** 在位。
- packaged smoke **14/14 全 true**（entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load）。
- 证据：`release-output/local/local-smoke.json`；打包后无源码新于 ZIP。
- 门禁复跑：根 `npx tsc --noEmit` **0**、`typecheck:renderer` **0**（测试角色清理旧渲染器 import 后转绿）、`node --check` 通过。
- **口径**：本包是 **5B 最终包**；**发布流水线未接（M1）——`release.yml` / release-policy 零 diff，未运行 `release:prepare`，未上传**；新冻结源发布轮另行客户决定。下方「步骤 b 过渡态」小节保留为历史，其 ZIP/哈希已被本最终包取代。

## 本地打包校验（步骤 b 过渡态，历史）

`npm run package:local` → `npm run verify:local` **exit 0**：

- ZIP：`release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，**406,507,563 B**，sha256 **`6a1059ab64a32c717083c73db67a885a8eb2780087f0c3b11dbcb5ebbc7a42be`**。
- 包内 `app/main.ts` sha256 `9e7cef76…`（仍是 5A 版本，**步骤 c 将改**）；`app/preload.cjs` `98dde83a…`；`dist/index.html` `3c4da2a2…`。
- 必含 6/6 通过；旧渲染器 8 文件、`vendor/`、`dist/src/` **全部不在包内**；私有数据/噪声/test 目录扫描通过。
- devDependencies 打包 **0/21**；生产依赖 **8/8** 在位。
- packaged smoke 14 项全 true（`entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load`）。
- 证据：`release-output/local/local-smoke.json`（非发布 manifest）。

**为何步骤 c 前也能跑通**：verify 通过 smoke-only `--ans-renderer-entry=<包内 dist/index.html>` 锁定新入口，不依赖主进程默认值；生产默认加载路径仍由桌面窗口步骤 c 切换（`app/main.ts` / `app/desktop/renderer-entry.ts` 的常量仍为 5A 值）。**步骤 c 落盘后必须重新 build→package→verify，本包 ZIP/哈希随即作废。**

## 边界与零变化

- release 配方零 diff：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`/`.d.mts`、`release-prepare.mjs`/`release-verify.mjs` 均未改；`electron-builder.yml` 未改（`files: app/**/*` 继续覆盖 dist，且已排除 test）。
- 依赖/锁零变化：`package.json` scripts 未改、`package-lock.json` 未动；dependencies 8 / devDependencies 21（markdown-it 15.0.3、@types-markdown-it 14.2.0、typescript 7.0.2）。
- 打包前清空 `release-output/local/`；打包后无源码新于 ZIP。
- `node --check test/装配/verify-local-package.mjs` → exit 0。

## 待办（5B 收尾）

- **步骤 c（桌面窗口）**：已完成——`renderer-entry.ts` 收敛为唯一 `RENDERER_RELATIVE = ["renderer","dist","index.html"]`，`main.ts` 生产默认切到构建产物；装配已重打包并复跑 verify（见「5B 最终包」）。
- **测试角色 5B 清理（非装配边界）**：步骤 b 期间根 `tsc` 曾因 `test/测试/uiux-v2-replay-regression.test.ts` 仍 side-effect import 已删除的旧渲染器文件 `app/renderer/tool-rows.js`、`ui-labels.js` 而红（TS2882）；测试角色清理后最终包复跑根 `tsc` **0**、`typecheck:renderer` **0**。
- 5B 收尾：测试新入口全量套件与 packaged smoke、最终 UIUX 审计、独立验收（PM §16.5）。
- 发布流水线未接（M1）：新冻结源发布轮另行客户决定。
- 未验证：Windows/DPI/屏读、真实模型/网络。
