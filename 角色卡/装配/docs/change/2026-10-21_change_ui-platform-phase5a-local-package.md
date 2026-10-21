---
id: ui-platform-phase5a-local-package-20261021
type: change
title: UI 平台化 Phase 5A：本地 build/package/verify 脚本与 packaged 冒烟工具
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase5a-build]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM 评审 §十七 Phase 5A 放行，新增 package:local / verify:local 脚本与本地打包校验工具
  - date: "2026-10-21"
    kind: implemented
    summary: 本地 build→package→verify 链路跑通；5A 最终冻结包（200% 遮挡修复后）ZIP 406,759,699B、sha256 a22c3c23…；packaged smoke 全检查通过（5A smoke-only 入口覆盖）
---

# Phase 5A：本地 build → package → verify 链路（不接发布流水线）

依据 PM 评审 revision 10 §十七「Phase 5A 放行」与 §17.3（5A 对照与准备）、§16.6 约束（M1：不接发布；不改 `release.yml` / release-policy；零新增依赖；5A 不删旧渲染器/vendor）。实施范围仅 `package.json`（scripts）、`test/装配/` 与 `角色卡/装配/`；**未改** `app/`、`src/`、其他角色、release 文件、`electron-builder.yml`。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `package.json` | scripts 新增：`package:local` = `npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`；`verify:local` = `node test/装配/verify-local-package.mjs`。`package` / `release:prepare` / `release:verify` 逐字未动；dependencies/devDependencies 未动（零新增依赖） |
| `package-lock.json` | **未变**（仅 scripts 变化；mtime 仍为上一次依赖任务时间） |
| `test/装配/verify-local-package.mjs`（新建） | 本地打包校验工具：解包 ZIP（macOS `ditto` / Windows `tar`）→ 包内必含/必无断言 → devDependencies 不重复携带检查 → 生产依赖在位检查 → 隔离 HOME 跑 `--ans-packaged-smoke`（5A 以 `--ans-renderer-entry` 覆盖到包内 dist 入口）→ 写 `release-output/local/local-smoke.json`；不读 `release-provenance.json`、不生成 release manifest 名、不上传 |
| `electron-builder.yml` | **未改**；只读核对 `files` 已含 `!**/test{,/**/*}` 与 `!**/tests{,/**/*}`（第 17–18 行），打包树扫描确认包内无 `test/tests` 目录 |

`verify:local` 的 5A 事实与 5B 更新点（脚本内注释已标注）：
- 必含：`app/main.ts`、`app/preload.cjs`、`package.json`、`LICENSE`、**`app/renderer/dist/src/index.html`** 与 `dist/assets`（≥1 JS、≥1 CSS、无 `.map`）、**旧渲染器三件**（`renderer/index.html`、`renderer.js`、`styles.css`）与 **vendor `markdown-it.umd.min.js`**。
- 5B 更新：旧渲染器/vendor 删除后，上述四项移出必含（vendor 可改为必无）；若入口迁移则 dist 入口改 `renderer/dist/index.html`。
- 必无：`.env*`、`.ans`、`.git`、`settings.local.json`、`*.log`、`*.map`、`test/tests` 目录。
- 渲染库不重复携带：动态读取 `package.json` 的 **devDependencies** 共 21 项（含 react/react-dom/markdown-it/@types/vite/tailwind/electron 等），断言包内 `node_modules` 顶层均不存在；同时断言 **8 个生产 `dependencies`** 均在位。
- packaged smoke：隔离临时 `HOME`/`userData`，环境变量白名单透传；5A 因生产入口仍指旧渲染器，用 smoke-only `--ans-renderer-entry=<包内 dist 入口>` 验证新构建产物。主进程 `validateSmokeRendererEntry` 以 `app.getAppPath()` 做包含判断，macOS 临时目录需 `realpath` 消解 `/var` → `/private/var` 符号链接后传入。

## Dry run 结果（2026-10-21，本机 macOS arm64，Electron 44.7.0）

### 5A 最终冻结包（2026-10-21 20:46，200% 遮挡修复后；本文件最终值）

最终冻结候选包含 200% 遮挡修复（与协调方冻结读数一致：JS `f568e2aa…`、CSS `b52cfca1…`、HTML `f372e111…`）。本次先清空 `release-output/local/`，在最终冻结候选上重新执行 build→package→verify；打包后核对 `app/`、`src/`、`bin/` 无文件新于 ZIP（无陈旧产物）。**5B 切换后必须重新打包，以下数值仅对 5A 最终冻结包有效、随即作废。**

**构建**（`npm run build:renderer`，exit 0）：
- `app/renderer/dist/src/index.html` 583 B（gzip 401 B），sha256 `f372e111d49665578029083991bd4a02b10d535707d6a642184ba2f267a5b5cc`
- `dist/assets/index-DbPZU_Oj.css` 108,586 B（gzip 19,623 B），sha256 `b52cfca1d79b90cb622caea83cb46e6f2be8f6d89c753eea7f8e317fe74271fe`
- `dist/assets/index-T1im4gOp.js` 825,985 B（gzip 269,177 B），sha256 `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`
- 首屏 JS+CSS gzip 合计 **288,800 B ≤ 300 kB**（本机 gzip CLI 实测；协调方冻结读数 288,552 B，差异为压缩实现口径，均 ≤300 kB；测试在 Phase 5 复核）
- Vite 提示单 chunk >500 kB（未压缩），属提示不阻断；未新增分包/依赖。资产文件名带内容哈希（本轮最终为 `index-T1im4gOp.js` / `index-DbPZU_Oj.css`）。

**打包**（`npm run package:local`，exit 0）：
- ZIP：`release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`
- 大小 **406,759,699 B**；sha256 **`a22c3c23cd764d16339623346ed8893b7bdbafdc30add436fe94e30e0926a9a6`**
- 包内 `app/main.ts` sha256 `9e7cef7691324d493a4da2f24b9d04125b4fe487ed091d0e535a3a9f3d04f1c7`；`app/preload.cjs` sha256 `98dde83a4930c7f586a4dd5bee8d7697cffc6fd95c3771149dea2fcf3cbc3e5b`
- electron-builder 26.15.3，`identity: null`（unsigned），`npmRebuild: false`，`publish: null` + `--publish never`

**校验**（`npm run verify:local`，exit 0；冻结候选重跑）：
- 必含/必无全部通过；`devDependenciesPackaged: []`（21 项 devDeps 零进入安装包）；生产依赖 8/8 在位；证据内归档哈希与 `shasum -a 256` 实测一致（`a22c3c23…`）。
- packaged smoke：`ok:true`、`isPackaged:true`、`arch:arm64`、`platform:darwin`；检查项全 true——`entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load`。
- 证据：`release-output/local/local-smoke.json`（含 ZIP 哈希、包内 `main.ts`/`preload.cjs`/dist 入口/旧入口哈希、包内容断言、smoke 结果；非发布 manifest）。

**过程中的真实失败（均在冻结前，如实保留）**：
1. 首次打包（17:20）时桌面窗口并行 5A 尚在途：包内 `main.ts` 缺 smoke-only 入口覆盖，smoke 按旧入口运行，新检查 `entry/rootMounted/settingsEntryDisabled` 为 false → 失败。未伪造通过；待并行改动落盘后重新打包。
2. 第二次 smoke 因 macOS `/var` → `/private/var` 符号链接使入口包含判断误判越界，进程 exit 1 无结果；verify 工具改用 `realpath` 后通过。
3. 期间根 `tsc` 曾因并行 `app/main.ts` / `test/桌面应用/pi-config.test.ts` 在飞状态红；并行落盘后复跑 **exit 0**。上述失败均非本工具逻辑外的产品结论。

**最终门禁读数**：根 `npx tsc --noEmit` **0**；`npm run typecheck:renderer` **0**；`npm run test:assembly` **82/82**；`npm run verify:local` **exit 0**。

## 边界与未验证

- release 文件零 diff：`.github/workflows/release.yml`、`electron-builder.yml`、`src/common/装配/release-policy.mjs`/`.d.mts`、`release-prepare.mjs`/`release-verify.mjs` 均未改；未运行 `release:prepare`。
- 文档更正：5A 计划中的 dev 环境变量名统一为 **`ANS_DEV_SERVER_URL`**（原 `ANS_RENDERER_URL` 为笔误），与桌面窗口 main.ts 实现一致。
- **未验证 / 5B 待重打包**：本文哈希与烟测结论均针对 **5A 冻结候选**；进入 5B（生产入口切换、旧渲染器/vendor 删除、入口可能迁移）后必须重新 build→package→verify，冻结值作废。全量双端逐 check（测试角色）、Windows/DPI/屏读、真实模型/网络、最终独立验收同属未验证。
- 5A 门前旧渲染器/vendor 未删除；删除由 5B 桌面UI 执行。
