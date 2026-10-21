---
id: app-icon-electron-builder-20261021
type: change
title: 应用图标切换（装配）：electron-builder mac/win icon 指向 ans-studio-ans-icon.png 并重打包校验
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ans-lettermark-app-icon, ui-platform-phase5b-renderer-entry]
events:
  - date: "2026-10-21"
    kind: created
    summary: 桌面窗口交付 ans-studio-ans-icon.png（1024×1024，sha256 ff88e313…）并在 app/main.ts 接线后，装配执行 electron-builder 图标切换与本地重打包
  - date: "2026-10-21"
    kind: implemented
    summary: electron-builder.yml mac.icon/win.icon 改指新图标（仅 2 行）；package:local→verify:local exit 0；新 ZIP 405,227,230B、sha256 8e760887…；smoke 14/14、devDeps 0/21 保持
---

# 应用图标切换：electron-builder 配置与本地重打包

依据桌面窗口变更记录（`角色卡/桌面窗口/docs/change/2026-10-21_change_ans-lettermark-app-icon.md`）的「待装配」交接：运行时图标资源与 `app/main.ts` 的 `APP_ICON_PATH` 已由桌面窗口切换为 `app/desktop/assets/ans-studio-ans-icon.png`（1024×1024，黑底 `#14171A` 圆角、薄荷绿 ANS 字标，sha256 `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c`）；本批由装配完成安装包配置切换并重新打包校验。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `electron-builder.yml` | `mac.icon`、`win.icon`：`app/desktop/assets/ans-bracket-seal.png` → **`app/desktop/assets/ans-studio-ans-icon.png`**（2 行；其余逐字未动：appId/productName/copyright/asar/npmRebuild/directories/files/artifactName/target/category/identity/minimumSystemVersion/publish） |
| **未改** | `.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`/`.d.mts`、`release-prepare.mjs`/`release-verify.mjs`、`package.json`/`package-lock.json`（依赖/lock 零变化：dependencies 8 / devDependencies 21）、`app/`、`src/`、`test/`、`bin/` |

## 打包与校验（2026-10-21，macOS arm64 / Electron 44.7.0 / electron-builder 26.15.3）

清空 `release-output/local/` 后 `npm run package:local` → `npm run verify:local` **exit 0**：

- **ZIP**：`release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，**405,227,230 B**，sha256 **`8e760887879c7f25dc926ce670b2b0e28ea862ef1fcedeb66383a085a868e441`**。
- 构建产物（与 5B 最终包相同，未受影响）：`dist/index.html` `3c4da2a2…`（581 B）、`assets/index-BVLfGR_D.js` `f568e2aa…`（825,985 B）、`assets/index-DUBNk8-R.css` `76fad7ce…`（108,501 B）。
- 包内入口哈希：`app/main.ts` **`8c0323aac8ad3053e50148fa352bf40ae903674d6d8f8a44fd3f101c1912c525`**（= 当前工作树文件：5B 版本 + `APP_ICON_PATH` 一行切换）；`app/preload.cjs` `98dde83a…`；`dist/index.html` `3c4da2a2…`。
- **图标在包内确认**（手工解包 ZIP 核验；`verify-local-package.mjs` 清单不含图标项、本轮未改脚本）：
  - `app/desktop/assets/ans-studio-ans-icon.png` 在包内，55,057 B，sha256 **`ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c`**，与源文件逐字节一致；
  - 旧 `ans-bracket-seal.png` **仍在包内**，1,021,946 B，sha256 `60da7fbd721fe0d1abd762a7fc124a6c4abafd33304bbbd18fd0dca21345c092`（= 源文件，未删除，兼容历史引用）；
  - `ans-bracket-seal-concept.png` 亦仍在包内（1,021,946 B）。
- 应用包图标：`ANS Studio.app/Contents/Resources/icon.icns` 212,158 B、sha256 `843d9526c526de1b063599f4b4e75ae333905d0d9316cf2d84b98b3c3befb43e`（electron-builder 由新 PNG 经标准链路生成；主表征 1024×1024；`sips` 转为 PNG 后目视确认为黑底圆角 + 薄荷绿 ANS 字标，即新图标）。
- verify 内容断言：必含 **6/6**（`app/main.ts`/`app/preload.cjs`/`package.json`/`LICENSE`/`app/renderer/dist/index.html`/`app/renderer/dist/assets`）；必无全过（私有数据与噪声 `.env*`/`.ans`/`.git`/`settings.local.json`/`*.log`/`*.map`、test/tests 目录）；旧渲染器 8 文件、`vendor/`、`dist/src/` 全部不在包内。
- devDependencies 打包 **0/21**；生产依赖 **8/8** 在位（@anthropic-ai/claude-agent-sdk、@anthropic-ai/sdk、@earendil-works/pi-coding-agent、@earendil-works/pi-mcp、@modelcontextprotocol/sdk、@openai/codex、yaml、zod）。
- packaged smoke **14/14 全 true**（entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load），`ok=true`、`isPackaged=true`、arch arm64、platform darwin。
- 证据：`release-output/local/local-smoke.json`；打包后无源码新于 ZIP。
- ZIP 比 5B 最终包小 **1,280,051 B**（406,507,281 → 405,227,230）：入口/资产/依赖未变，差异来自新图标文件（55,057 B vs 1,021,946 B）与由它生成的 `icon.icns`。

## 边界与零变化

- `electron-builder.yml` 仅 2 行改动（`git diff --numstat`：2 增 2 删），其余行零 diff。
- release 配方零 diff：`.github/workflows/release.yml`、release-policy/`release-prepare`/`release-verify` 均未改；未运行 `release:prepare`、未上传。
- 依赖/锁零变化：`package.json`/`package-lock.json` 未动。
- 本批改动尚未提交（工作区形态）；发布轮另行客户决定。

## 未验证

- 未在真实 macOS Finder / Windows 桌面目视检查安装包图标外观（icns 内容已由 `sips` 转 PNG 目视确认为新图标；Windows 图标生成链路本轮未在本机运行）。
- 未运行全量测试与独立验收（本轮范围为配置切换 + 本地打包验证）。
