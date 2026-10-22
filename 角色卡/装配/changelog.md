# 装配 变更记录

- 2026-10-22（**v1.5.0 发布准备**，客户决定发布 1.5.0 未签名 ZIP，先 draft、三平台 CI 通过后由客户/协调方决定公开）：发布范围＝当前 main（UI 平台化＋并行工作流）。① 版本 1.4.0→1.5.0（package.json/package-lock.json 根两处、零依赖变动）；README 当前版本/下载表（三资产 1.5.0 链接）/SHA256 说明（暂写「发布后由 Release 的 SHA256SUMS 校验文件提供」、明确未签名）/要点（React/shadcn Nova、单入口、图标、派发去重、移除 15 分钟自动中止、角色新称）→ v1.5.0；提交 `35cca0b`。② 本地预检（tag 前）：`npm run typecheck` **0**、`npm run typecheck:renderer` **0**、`npm run build:renderer` **0**（gzip 合计约 292.4KB≤300KB）、`node --test "test/**/*.test.ts"` exit 1＝**3315 计 / 3312 过 / 1 红 / 2 跳过**；唯一红 `test/测试/lightweight-permission-repairs.test.ts:164`「D3 AC4…」＝缺真实 rg 二进制的**已知环境红**（未跳过、如实记录），**0 产品红**。③ annotated tag **v1.5.0**（tag 对象 `4b0b8db`）→ **`35cca0bd2ed373c8ed5984dea45a76a608f4e502`**（=SOURCE_SHA），main 与 tag 已推送。④ 配方（tag 后 overlay）：release-policy `SOURCE_REF='v1.5.0'`/`SOURCE_SHA='35cca0b…'`、白名单**重置基础集**（package.json/package-lock.json/release.yml＋src/common/装配/、test/装配/）、v1.4.0 overlay-2 的 5 条精确条目整批移除；release.yml input 默认/concurrency `release-v1.5.0`/gh release view·create·upload·edit → v1.5.0、标题 `ANS Studio 1.5.0`、notes 为本轮说明（UI 平台化、未签名/未公证、macOS 13+、Windows 10/11 x64、Windows 文档限制、包内无密钥、先核对 SHA256、保留 provenance/overlay）、publish 默认仍 **false**；提交 `5513209` 已推送；prepare 预演 exit 0（sourceRef v1.5.0、sourceSha 35cca0b、overlayPaths 2、actualTree `1ae3b77b…`、overlayPatchSha256 `5f8cfd2e…`、excluded 空）。⑤ 首跑三平台 CI run **`39701856151`**（headSha `5513209`）触发后，发现冻结 tag 内 `test/装配/release-packaging.test.ts` 仍钉 v1.4.0/overlay-2（预演树实测 2 红）；经协调方确认 `test/装配/`、`src/common/装配/` 属本角色边界后：取消首跑（`gh run cancel 39701856151`），对齐 `test/装配/release-packaging.test.ts`（SOURCE v1.5.0/35cca0b、新增基础集选中项用例、overlay-2 五条改为 fail-closed/excluded 用例、断言未放宽）与 `release-policy.d.mts` 字面量，提交 `c166914` 并推送；`node --test "test/装配/**/*.test.ts"` **83/83**、`npm run typecheck` **0**；对齐后 prepare 预演 exit 0（overlayPaths 恰 4、actualTree `53441757…`、overlayPatchSha256 `ebf25945…`，预演树内 release-packaging 7/7）。⑥ 重新触发三平台 CI run **`39702128045`**（headSha `c166914`，publish=false；单次快照 pending，未轮询，run id 交协调方）。**未验证**：三平台构建/解压/启动 smoke、真实 SHA256、draft 创建与公开发布。见[变更记录](docs/change/2026-10-22_change_release-v1.5.0-prepare.md)。

- 2026-10-21（应用图标切换·装配，本地打包，**不接发布流水线（M1）**）：桌面窗口交付新图标 `app/desktop/assets/ans-studio-ans-icon.png`（1024×1024 黑底 #14171A 圆角、薄荷绿 ANS 字标，sha256 `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c`）并已把 `app/main.ts` 的 `APP_ICON_PATH` 指向它之后，装配把 `electron-builder.yml` 的 `mac.icon`/`win.icon` 由 `ans-bracket-seal.png` 改为新图标（**仅 2 行，其余行零 diff**），清空 `release-output/local/` 重跑 `package:local`→`verify:local` **exit 0**：ZIP **405,227,230B、sha256 `8e760887879c7f25dc926ce670b2b0e28ea862ef1fcedeb66383a085a868e441`**（比 5B 最终包小 1,280,051B，差异来自图标文件与由它生成的 icns）；包内 main.ts `8c0323aa…`（= 工作树当前文件：5B 版本 + `APP_ICON_PATH` 一行）、preload `98dde83a…`、dist 入口 `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；**新图标在包内**（55,057B、sha 与源文件逐字节一致）、**旧 `ans-bracket-seal.png` 仍在包内**（1,021,946B，未删除、兼容历史）；应用包 `icon.icns` 212,158B、sha `843d9526…`（解出目视确认为新图标）；verify 必含 6/6、必无全过、devDeps 打包 **0/21**、生产依赖 **8/8**、packaged smoke **14/14 全 true**；证据 `release-output/local/local-smoke.json`，打包后无源码新于 ZIP。release.yml/release-policy/依赖/lock 零变化；未运行 release:prepare、未上传。未验证：Finder/Windows 桌面图标目视、全量测试/独立验收。见[变更记录](docs/change/2026-10-21_change_app-icon-electron-builder.md)。

- 2026-10-21（UI 平台化 **Phase 5B 最终包**·本地，**不接发布流水线（M1）**）：步骤 a（桌面UI 删旧渲染器/vendor/旧测试、源入口移至 `app/renderer/index.html`）＋步骤 c（桌面窗口 `renderer-entry.ts` 收敛为唯一 `renderer/dist/index.html`、main.ts 生产默认切换）完成后，装配在冻结候选上清空 `release-output/local/` 重跑 build→package→verify。① 构建：`dist/index.html` 581B/gzip 400B/sha `3c4da2a2…`；JS `index-BVLfGR_D.js` 825,985B/gzip 269,177B/sha `f568e2aa…`；CSS `index-DUBNk8-R.css` 108,501B/gzip 19,601B/sha `76fad7ce…`；gzip 合计 288,778B≤300KB；生产 CSP meta 原样、无 unsafe/内联、相对资源。② `package:local`→`verify:local` **exit 0**：ZIP **406,507,281B、sha256 `edeeef1949d51ee471f5c922f18cb17fdd0e97ddd33e58b5264a8411a7d8f13f`**；包内 main.ts `64a56c33…`（步骤 c 版本）、preload `98dde83a…`、dist 入口 `3c4da2a2…`；必含 6/6、旧渲染器 8 文件/vendor/dist-src 全不在包内、devDeps 打包 0/21、生产依赖 8/8、packaged smoke **14/14 全 true**；证据 `release-output/local/local-smoke.json`，打包后无源码新于 ZIP。③ release 配方零 diff（release.yml/release-policy/release-verify/electron-builder.yml），依赖/lock 零变化（8/21；markdown-it 15.0.3、@types 14.2.0、typescript 7.0.2）；未运行 release:prepare、未上传。**标注：5B 最终包；发布流水线未接（M1），新冻结源发布轮另行客户决定。** 门禁：根 `tsc` **0**、`typecheck:renderer` **0**（测试角色清理旧 import 后转绿）。见[变更记录](docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)。

- 2026-10-21（UI 平台化 Phase 5B·步骤 b 装配：Vite 入口切至 `app/renderer/index.html`；verify 切 5B 清单；**待桌面窗口步骤 c 后重打包**）：步骤 a（桌面UI 删旧渲染器/vendor/旧测试、源入口移到 `app/renderer/index.html`）完成后，① `vite.config.ts` 的 `build.rollupOptions.input` 由 `app/renderer/src/index.html` 改为 **`app/renderer/index.html`**；`root: "app/renderer"`、`base: "./"`、`modulePreload.polyfill:false`、`target: "chrome152"`、dev CSP 插件均未动；产物变为 `app/renderer/dist/index.html`（`emptyOutDir` 清掉旧 `dist/src`）。② `test/装配/verify-local-package.mjs` 切 5B：必含 `app/main.ts`/`app/preload.cjs`/`package.json`/`LICENSE`/`dist/index.html`＋`dist/assets`；必无旧渲染器 8 文件（renderer.js、styles.css、markdown.js、engine-selector.js、role-status.js、runtime-ui.js、tool-rows.js、ui-labels.js）、`vendor/`、`dist/src/`；smoke 入口覆盖改为包内 `dist/index.html`；其余断言（递归禁止项、21 项 devDeps 不入包、8 项生产依赖在位、隔离 HOME smoke、local-smoke.json）保留。③ 构建：`dist/index.html` 581B/gzip 400B/sha `3c4da2a2…`；JS `index-BVLfGR_D.js` 825,985B/gzip 269,177B/sha `f568e2aa…`；CSS `index-DUBNk8-R.css` 108,501B/gzip 19,601B/sha `76fad7ce…`；gzip 合计 288,778B≤300KB；生产 CSP meta 原样、无 unsafe/内联脚本、相对资源引用。④ 打包校验（步骤 b 过渡态）：`package:local`→`verify:local` **exit 0**；ZIP **406,507,563B、sha256 `6a1059ab64a32c717083c73db67a885a8eb2780087f0c3b11dbcb5ebbc7a42be`**；必含 6/6、旧文件/vendor/dist-src 全不在包内、devDeps 打包 0/21、生产依赖 8/8、smoke 14 项全 true；包内 main.ts 仍为 5A 版本 `9e7cef76…`。**verify 能在步骤 c 前通过，是因为 smoke-only `--ans-renderer-entry` 锁定 dist/index.html；生产默认入口仍待桌面窗口步骤 c（renderer-entry.ts/main.ts）切换，落盘后必须重新 build→package→verify，本包数值作废。** release 配方/electron-builder.yml/依赖/lock 零变化；`node --check` 通过。**已知红（非装配边界）**：根 `tsc` 因 `test/测试/uiux-v2-replay-regression.test.ts` 仍 side-effect import 已删旧渲染器 `tool-rows.js`/`ui-labels.js` 报 TS2882，属测试角色 5B 清理范围；`typecheck:renderer` 0。见[变更记录](docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)。

- 2026-10-21（UI 平台化 Phase 5A·本地 build/package/verify 链路，**不接发布流水线**）：按 PM 评审 revision 10 §十七「5A 放行」与 §17.3/§16.6（M1），仅改 `package.json` scripts + 新增 `test/装配/verify-local-package.mjs`。① scripts：`package:local`＝`npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`；`verify:local`＝`node test/装配/verify-local-package.mjs`；`package`/`release:prepare`/`release:verify` 逐字未动；依赖零新增、`package-lock.json` 未变（仅 scripts）。② verify 工具：解包 ZIP（ditto/tar）→包内必含（5A：dist/src/index.html＋assets、旧渲染器三件＋vendor 仍必含；5B 更新点已注释）／必无（.env*/.ans/.git/settings.local.json/*.log/*.map/test 目录）→动态校验 **21 项 devDependencies 零进入安装包**、8 项生产依赖在位→隔离 HOME 跑 `--ans-packaged-smoke`（5A 用 smoke-only `--ans-renderer-entry` 指向包内 dist 入口；`realpath` 消解 macOS `/var`→`/private/var`）→只写 `release-output/local/local-smoke.json`（不读 provenance、不写 release manifest 名、不上传）。③ `electron-builder.yml` 未改，只读核对 `!**/test{,/**/*}`/`!**/tests{,/**/*}`（17–18 行）已排除测试并在打包树确认。④ 自测（5A 最终冻结包，200% 遮挡修复后；macOS arm64/Electron 44.7.0）：`build:renderer` exit 0（JS `index-T1im4gOp.js` gzip 269,177B＋CSS `index-DbPZU_Oj.css` gzip 19,623B＝288,800B≤300KB）；`package:local` exit 0 → ZIP **406,759,699B、sha256 `a22c3c23cd764d16339623346ed8893b7bdbafdc30add436fe94e30e0926a9a6`**（dist 入口 `f372e111…`、JS `f568e2aa…`、CSS `b52cfca1…`、包内 main.ts `9e7cef76…`）；`verify:local` **exit 0**（必含/必无全过、devDepsPackaged=[]、生产依赖 8/8、smoke 全检查 true）；根 `tsc` 0、`typecheck:renderer` 0、`test:assembly` **82/82**。冻结重跑前清空 `release-output/local/`，打包后无源码新于 ZIP；**5B 切换后必须重新打包、冻结值作废**。**真实失败保留**：首包在桌面窗口并行在途时 main.ts 缺 smoke 入口覆盖→旧入口 smoke 三检查红（未伪造，重打包后复跑）；二跑因 `/var` 符号链接误判越界→realpath 修复；期间根 tsc 曾因并行文件在飞红、落盘后复绿。release 文件（release.yml/policy/electron-builder.yml）零 diff、未运行 release:prepare；计划文档 dev 变量名更正为 `ANS_DEV_SERVER_URL`。**未验证**：5B 生产入口切换后的 packaged smoke、全量双端、Windows/DPI/真机、独立验收。见[变更记录](docs/change/2026-10-21_change_ui-platform-phase5a-local-package.md)。

- 2026-10-21（Phase 5A/5B 装配计划·设计记录，未实施）：按 PM 评审 revision 10 §十六「Phase 5 授权（5A→5B）」与 §16.6 约束（M1 不接发布、不改 release.yml/release-policy、零新依赖、5A 前不删旧渲染器/vendor），产出[装配计划](docs/design/2026-10-21_design_ui-platform-phase5a-build.md)（status: proposed，不含实现代码）。只读核对现状：Vite 产物实际在 `app/renderer/dist/src/index.html`（入口在 src/ 下）、`base:"./"`、生产 CSP 由源码 meta 提供；`electron-builder.yml` 的 `files: app/**/*` 覆盖 dist、`output: release-output`、`publish: null`；`.gitignore` 已含 `app/renderer/dist/` 与 `release-output/`；`app/main.ts:211` 生产仍加载旧 `renderer/index.html`；packaged smoke 能力已有但绑定旧 DOM（`.app`/`#runtime-select`/`#tab-pi`/`#right-drawer`）；`release-verify.mjs` 依赖 `release-provenance.json`，不能直接复用于本地。计划要点：①硬顺序 typecheck→build:renderer→dist 静态校验→package:local（内嵌 build 防陈旧 dist）→verify:local→证据；②scripts 5B 语义（`app` 由 main.ts 按 packaged/`ANS_RENDERER_URL` 选择、其余 dev/build/preview/typecheck 语义不变、`package` 原样保留给发布、建议新增 `package:local`/`verify:local`，不新增 dev:app 以免引进程编排依赖）；③本地输出只写 `release-output/local/`、不运行 release:prepare、不写 release 命名证据、`--publish never` 双保险；④零新增依赖，markdown-it 15.0.3/@types 14.2.0/typescript 7.0.2 均为 devDependencies，安装包不携带 node_modules 渲染库（打包树扫描验证）；⑤5A/5B 与桌面窗口（main.ts 切换、packaged smoke 重锚）、桌面UI（XSS 迁移先绿、删旧文件/vendor、入口迁移）、测试（旧端快照→新端全量+packaged smoke）的交接顺序。未决：入口路径方案 A（`dist/src/index.html`）/B（迁到 `dist/index.html`，建议 B）、dev URL 变量名、verify:local 归属与 release 白名单收纳、packaged smoke 新契约面。只写本角色文档，未改代码/配置/依赖，未运行 build/打包。

- 2026-10-21（UI 平台化·markdown-it 改 npm 精确版依赖落盘（**安全修正至 15.0.3**）；typescript 精确锁定；**vendor 保留至 Phase 5 删除**）：按产品 revision 2 §4.1/§六 Phase 3 与 PM Q9（「依赖落盘归装配，封装与测试归桌面UI」），`npm install --save-exact -D` 装入 `markdown-it@15.0.3`＋`@types/markdown-it@14.2.0`（npm 最新精确版；DT 无 15.x 线，markdown-it 15.x 自带 `dist/markdown-it.d.cts` 声明，@types 按 PM 决定照装）到 **devDependencies**——Vite 打包进 `dist`、运行时不需 `node_modules` 副本；两包按 Q11 不计入 ≤12 运行时新增预算。**版本经过**：初按原计划装 15.0.2（与 vendored UMD 同版本）后 npm audit 命中 **high `GHSA-gfr2-rv44-r23c`**（CVSS 7.5，多行 link reference definition 二次方渲染、默认配置即触发）＋ **low `GHSA-vfgh-jcmw-g37q`**（html 开启时内联 HTML 二次方 DoS，本项目 `html:false` 可缓解），均修于 15.0.3——经协调方指示安全优先升 15.0.3，两条 advisory 消失。同轮按依赖宪法 §4.3/PM 评审 §2.6「实施中确认」把 `typescript` 由 `"^7.0.2"` 锁为实际安装的精确版 `"7.0.2"`（版本未变、仅声明收敛）。验证：`npm ls markdown-it --all` → 单版本 `15.0.3` exit 0 无重复、`@types/markdown-it@14.2.0`、`typescript@7.0.2` 单版本；lock 仅新增 10 个条目（markdown-it 传递链 argparse/mdurl/linkify-it/entities/punycode.js/uc.micro ＋ @types 链），**既有依赖零删除零版本变化**（脚本逐键比对；根条目变更仅 +markdown-it、+@types/markdown-it、typescript 去 `^` 三处）；`npm audit` 现 8 moderate 全为既有 electron-builder 传递链（安装前即 8，markdown-it 两条已消失）；`npx tsc --noEmit` **exit 0**。**执行口径修正（对 PM「Phase 3 删 vendor」）**：旧渲染器在 Phase 5 切换前仍加载 `app/renderer/vendor/markdown-it.umd.min.js`，本阶段**不删 vendor**——迁移期两处并存、Phase 5 删除（在 `app/` 内、属桌面UI 边界，本角色不越界）。**迁移期残留风险**：vendor 仍为 15.0.2，上述两条 advisory 在旧渲染器路径仍存在（npm 修复只覆盖新渲染器）；如需旧渲染器长期使用，建议 vendor 属主按 `vendor/README.md` 流程同步升 15.0.3，否则随 Phase 5 删 vendor 一并消失。未改 `app/`、`src/`、`test/`、`vite.config.ts`、其他角色文件。见[变更记录](docs/change/2026-10-21_change_markdown-it-npm-devdep.md)。

- 2026-10-21（UI 平台化 Phase 1·本地渲染层工具链，**不接发布流水线**）：按客户「开干」、产品提案 revision 2 §六 Phase 1 与项目管理评审 M1/M2 口径实施。① `package.json`/`package-lock.json`：16 个依赖以 `--save-dev --save-exact` 精确装入 **devDependencies**——运行时库 10（`react@19.3.1`、`react-dom@19.3.1`、`@base-ui/react@1.9.0`、`lucide-react@1.60.0`、`motion@14.4.0`、`react-resizable-panels@4.14.8`、`zustand@5.0.15`、`clsx@2.1.1`、`tailwind-merge@3.7.0`、`class-variance-authority@0.7.1`）＋构建期/类型 6（`vite@8.3.4`、`@vitejs/plugin-react@6.1.2`、`tailwindcss@4.3.3`、`@tailwindcss/vite@4.3.3`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`）；与指定版本逐一相同、无替代解析；未装 dnd-kit/tw-animate-css/vitest/Storybook/radix/aria。lockfile 比对：既有依赖**零删除、零版本变化**，仅根 devDependencies 与新增条目。② 新建根 `vite.config.ts`（本角色新授权文件）：`root: "app/renderer"`、`base: "./"`（file://）、`@`→`app/renderer/src`、入口 `app/renderer/src/index.html`、`outDir: "dist"`＋`emptyOutDir`、`modulePreload.polyfill: false`（生产 CSP 禁内联）、`build.target: "chrome152"`（Electron 44.7.0 实测 Chromium 152.0.7977.130，注释写明依据）、`server.port 5199`/`strictPort`、仅 serve 经 `transformIndexHtml` 注入放宽 CSP（替换源码生产 CSP meta；build 不改 CSP）。③ 脚本：`typecheck:renderer`、`dev:renderer`、`build:renderer`、`preview:renderer`（既有脚本未动）。④ 根 `tsconfig.json` `exclude` 增 `app/renderer`；`.gitignore` 增 `app/renderer/dist/`。⑤ **未改** `.github/workflows/release.yml`（M1）、`electron-builder.yml`（`files: app/**/*` 已覆盖）及任何 `app/`/`src/`/`test/`/他角色文件。验证：`npx tsc --noEmit` 根 **exit 0**；`npm ls react react-dom` 全 `19.3.1` deduped、无重复；`npx vite build` 按预期 `[UNRESOLVED_ENTRY] ... app/renderer/src/index.html`（入口由桌面UI Phase 2 创建）；`npm run typecheck:renderer` 按预期 `TS5058`（`app/renderer/tsconfig.json` 未建）；dev server 冒烟 `ready in 98 ms`、`http://localhost:5199/` HTTP 200、返回 HTML 的 CSP meta 已为 dev 版后停止（无残留进程/产物）；node v24.14.0 / npm 11.9.0 / vite 8.3.4。`npm audit` 8 moderate 全属既有 electron-builder 传递链、本轮无关。**未验证**：真实入口构建成功、真实 Electron `loadFile(dist)` 的 file:// ES 模块/分块加载（Phase 1 首件门）、生产 CSP 静态扫描、≤300KB 预算、Tailwind/Base UI 真机兼容、`typecheck:renderer` 真实结果。见[变更记录](docs/change/2026-10-21_change_ui-platform-toolchain.md)。

- 2026-10-21（治理边界·UI 平台化）：ANS Team Formation 依据客户 2026-10-21 审阅「UI 平台化」方向后的「开干」指示与已接受的默认值「Vite 只构建渲染层、主进程保持无构建」，按项目管理评审 §四边界缺口清单，在本角色 Section 1 新增单文件 `vite.config.ts`（渲染层 Vite 构建配置，仅构建 app/renderer；主进程与 preload 保持无构建）；`boundary.md` 与 `boundary.yaml` 同步逐条对应（各 25 条）。`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore`、`electron-builder.yml`、`.github/workflows/release.yml` 原已在边界内，本次未重复添加、未扩大任何目录权限、未新增角色。未改应用代码或测试、未改角色卡。见[治理记录](docs/change/2026-10-21_change_ui-platform-boundary.md)。

- 2026-10-20（v1.4.0 发布配方/overlay + overlay-2 + overlay-3，**已发布**）：客户指示「发布吧」。冻结源＝当前 main `83eec7ed1966b215d81035cac33d7dda80013f05`（v1.3.0-45，含全部产品代码：`flow_get`/`flow_step_update`/`flow_step_supersede`、Lead 工作流管理者、重启自动续跑、聊天 pane 加载占位、验收重派/收口、角色卡写后门控、artifact 补登、排队 UI 清理、shell/UI 修复）。首版 overlay：package/lock 根版本 1.3.0→1.4.0（lock 仅根两处、零依赖）；release-policy `SOURCE_REF='v1.4.0'`/`SOURCE_SHA='83eec7e…'`，白名单**重置为基础集**（files＝package.json/package-lock.json/release.yml；dirs＝src/common/装配/、test/装配/），v1.3.0 一次性条目（codex session、6 平台真值测试、session-rebuild-race）整批移除；release.yml source_ref 默认/concurrency/release view/create/upload/edit → v1.4.0、标题 `ANS Studio 1.4.0`、notes 首句固定 v1.4.0 源码＋manifest overlay；`test/装配/` 断言同步（v1.4.0/SHA/白名单）并新增「v1.3 一次性条目回到 fail-closed/excluded」；README 当前版本/下载表 → v1.4.0、补本版要点与 v1.3.0 发布验收链接；打包说明新增 v1.4.0 配方段。**overlay-2（首跑 CI run 39389502551 三平台 Regression tests 失败）**：按精确路径增列 1 项产品修复（`src/common/编排/shell-command-guard.ts`——Windows 盘符/UNC 反斜杠被当 POSIX 转义导致漏判 allow）＋4 项测试/夹具修复（`test/编排/shell-command-guard.test.ts`、`test/编排/flow-service.test.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/runtime-resolution.test.ts`），单文件不开目录、断言不放宽；同目录未列名文件仍 fail-closed/excluded。**overlay-3（第二轮 CI run 39391972925 Windows 单条红）**：`test/装配/multi-runtime.test.ts` 夹具超时调整——新增平台常量 `SPAWN_TIMEOUT_MS`（win32 30s / 其他 10s），同文件 4 处 `spawnSync` 统一使用，有界、不取消超时；断言（signal null/status 1/错误文案/密钥不泄漏）未放宽；无需新增 policy 路径（`test/装配/` 已在目录白名单）。验证：typecheck 0 错（ans-cli@1.4.0）；`test/装配/` **82/82**、`test/装配/multi-runtime.test.ts` **13/13**；复算 tag→工作区 selected 恰 **12 文件**、零 `app/`·`src/` 未列名触发；临时 clone 预演 `SOURCE_REF=v1.4.0 node src/common/装配/release-prepare.mjs` exit 0（sourceRef v1.4.0、sourceSha `83eec7e…`、overlayPaths 12、actualTree `07d210ee…`、excludedChanges 为文档面）。**已发布**：最终 CI run `39393657089`（headSha `879eddd`）三平台 build + release 四 job 全绿；draft 经独立校验（3 个 ZIP SHA256 与 GitHub asset digest 一致、manifest sourceRef/SHA/actualTree/overlayPatch 一致、三平台 smoke.ok=true）后于 **2026-10-20T08:41:32Z** 公开（<https://github.com/wangzhongren/ans-studio/releases/tag/v1.4.0>）；未登录下载 `SHA256SUMS-overlay.txt` 与 `ANS-Studio-1.4.0-mac-arm64.zip` 均 200（root 执行）；ZIP SHA256：arm64 `bc0c5bdd…`、x64 `554a0ad6…`、win x64 `cfb1f673…`（完整值与证据边界见变更记录）。`v1.4.0` tag 始终指向冻结源 83eec7e。三平台 smoke 由 CI 原生 runner 执行，装配角色未独立下载/启动 ZIP。见[变更记录](docs/change/2026-10-20_change_v1.4-release-packaging.md)（含[证据目录](docs/change/2026-10-20-release-packaging-v1.4-evidence/)）。

- 2026-10-20（README 增补「流程工具（方法化）」与 Lead 工作流管理者）：客户决定原话「按这个方案做吧」「主理作为工作流管理者」。`README.md`：①五个治理角色表 Lead 行职责补「兼任工作流管理者」、权力改为「客户沟通 · 工作流管理 · 不拥有最终批准权」；②「角色协作怎样约束修改」新增「主理 Lead 是工作流管理者」条目——可用 `flow_get`/`flow_step_update`/`flow_step_supersede` 推进或返工流程，可用 `dispatch_task` 向 Steward 与项目角色派发协调任务，协调/推进 ≠ 客户批准；③「流程状态 YAML」之后新增 `## 流程工具（方法化）」：应用是 `docs/flows/<flowId>.yaml` 唯一写者，角色不再直接写流程文件；`flow_get` 读取流程摘要/步骤/可更新步骤与 revision；`flow_step_update` 按 `expectedRevision` 更新（Steward/Lead 可更新全部未终态步骤，其他角色仅 owner=自己的有限迁移；`done` 必须有账本可对账 evidence；版本冲突 `revision-conflict`、证据不足 `insufficient-evidence`）；`flow_step_supersede` 返工（旧步骤 `superseded` + 新步骤 `pending`，历史保留）；初始创建仍走 `schedule-write` 写卡。只读核对到编排 `src/common/编排/flow-service.ts`、运行时 `src/provider/runtime/schema.ts`、`run-role.ts` 工具注入与门禁引擎 Lead/Steward 卡文本。**跨角色观察（未改）**：①`schema.ts` 的 `flow_step_supersede` 描述仍写「仅 Steward」而服务端允许 Steward/Lead；②Draft/Crew/Proof 卡文本写可记录 `done`，而服务端 `delivered→done` 仅管理者。`test/装配/` 无钉 README 正文用例（`release-packaging.test.ts` 仅把 README 当排除路径夹具），未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**；README 的 YAML 示例经真实 `parseFlowStateYaml` 校验为 `ok: true`；`git diff --check -- README.md` exit 0；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-20_change_readme-flow-tools.md)。

- 2026-10-19（README 增补「流程状态 YAML」小节）：客户决定原文「这些全部改成yaml。」`README.md` 在「角色协作怎样约束修改」之后新增 `## 流程状态 YAML`：`docs/flows/<flowId>.yaml` 为唯一机器状态，应用只解析它做派发与验收判定；同名 `.md` 仅人读视图、不参与判定，Markdown 流程文档仍可保留给人读。小节给出 schema（顶层 `flowId/version/qualityTier/steps`；步骤 `id/title/owner/kind/status/evidence/supersedes/supersededBy`）、枚举（`kind ∈ dispatch|customer-decision|artifact|acceptance`；`status ∈ pending|dispatched|delivered|done|superseded|failed|blocked|aborted`）、`done` 必须有对应 evidence、保留 id `verification/acceptance` 归应用自动派 Proof（Steward 不占用/不派发/不标 done）、被 retake 取代的旧步骤用 `superseded`/`supersededBy`（推荐与新步骤的 `supersedes` 双写），以及非法 YAML fail-closed 不回退 Markdown、无 YAML 才 legacy 兼容。只读核对到编排 `src/common/编排/flow-state.ts`、`governance-gate.ts::flowStepExists`、桌面 `app/desktop/interface.ts` 自动验收门与门禁引擎 Steward 卡文本口径一致。README 的 YAML 示例经真实 `parseFlowStateYaml` 校验为 `ok: true`；`supersedes`/`supersededBy` 按编排 2026-10-19 flow-state 修复后的新口径采用推荐的双写形状（旧步骤 `supersededBy` + 新步骤 `supersedes`；双写归一为一条「旧 → 新」关系，只写一侧也合法，真环与两侧矛盾仍拒绝），不保留首版「同一条关系只写一侧」的临时说明。编排侧验证：`test/编排` 667/667、typecheck exit 0。`test/装配/` 无钉 README 正文用例（`release-packaging.test.ts` 仅把 README 当排除路径夹具），未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**；`git diff --check -- README.md` exit 0；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-19_change_readme-flow-yaml.md)。

- 2026-10-19（README 补充两类判断 agent 的审查边界）：客户新定调——shell 判断 agent 只做**系统风险审查**（卡死、越界、破坏、资源、敏感外发），不判断业务必要性，项目内非破坏性命令由发起角色自行决定；决策判断 agent（「替我决策」）只判断**意图漂移**（目标、范围、非目标、验收标准、已接受决定），不重复审工程质量/架构/测试，由 Proof 在验收阶段核对；读取预算仍 fail-closed，预算/证据不足转手动、不猜测，硬上限可经环境变量调整。`README.md` 第 77 行新增「两类判断 agent 各审各的」条目，第 78 行「判断 agent 只读」尾部补预算与回落口径；第 75–76 行及其余段落逐字未动。只读核对到 `src/common/编排/shell-judge-prompt.ts` 第 33–36/45/56–58 行已体现系统风险定位、`src/common/runtime-core/shell-judge/policy.ts` 第 166–168/216–235 行预算 env（受上下限、非法值回落缺省）。**待收口**：`src/common/编排/governance-judge-prompt.ts` 工作树仍保留「架构门槛」rubric（第 74、79–86 行），与「决策判断不重复审架构」定调有差异，属编排写区、未改、已上报。`test/装配/` 无钉 README 文案用例（检索零命中；`release-packaging.test.ts` 仅把 README 当排除路径夹具），未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**；`git diff --check -- README.md` 通过；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-19_change_readme-judge-scopes.md)。

- 2026-10-19（README 增补「架构与可扩展性」提案与验收要求）：客户新批评原文「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个架构方案啊。」`README.md` 第 97–100 行在「工程质量基线与验收演示」小节、九条质量基线列表之后新增「架构与可扩展性」块：①提案必须含架构方案（新项目）或架构影响分析（变更），覆盖模块分解与职责、依赖方向、数据流、扩展点、数据 schema 与 API 版本迁移、横切关注点与权衡；②角色写区与架构模块一一对应，验收核对实现与架构声明一致；③缺失架构章节或实现偏离声明不得建议 `accept`。九条基线列表与 Proof 纪律段逐字未动。`test/装配/` 无钉 README 正文用例（`release-packaging.test.ts` 仅把 README 当排除路径夹具），按任务要求未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**；`git diff --check -- README.md` 通过；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-19_change_readme-architecture-requirement.md)。

- 2026-10-19（README 增补「工程质量基线与验收演示」产品规则）：客户批准原文「可以，按你说的改」。`README.md` 第 82–97 行在「角色协作怎样约束修改」之后新增 `## 工程质量基线与验收演示`：默认生产级质量档位，客户在意图阶段明确选原型档才可放宽；提案、角色卡、流程派发与验收携带同一份质量基线；正文逐字采用客户批准的九条基线（正确性、健壮性、安全、可维护性、可观测性、性能与容量、前端、测试、交付）；Proof 出验收卡前逐条核对证据，交付未真实启动并演示（启动命令与访问地址，或截图/录屏）时不得建议 `accept`，仅有测试输出或代码阅读不算演示。与桌面验收派发任务 `app/desktop/governance-advance.ts::buildAcceptanceTaskMessage` 的四条硬要求对齐（八项基线逐项核对、真实启动/演示、未演示不得建议 accept、演示证据落 `docs/verification/<flowId>-v1.md`）；五张内置治理角色卡的基线条文由门禁引擎归属角色并行落地，本任务未触碰。`test/装配/` 无钉 README 文案用例（`release-packaging.test.ts` 仅把 README 当排除路径夹具），未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**；`git diff --check -- README.md` 通过；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-19_change_readme-quality-baseline.md)。

- 2026-10-19（README 同步客户新规则「所有角色都接 shell、一律经审批」）：客户原文「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，只不过都要提交审批，按照原有的流程审批。」门禁引擎已把五个内置治理角色（liaison/rapporteur/nominator/convener/verifier）统一为 `shell: "operator-approve"`，桌面接线由桌面窗口角色并行完成；本任务只改 `README.md` 旧口径四处：①第 9 行引言「只读写治理文件与证据」→「文件写入限于治理文件与证据」并补「shell 命令与其他角色一样全部经审批链」；②第 17 行角色表 Proof 职责「独立只读核对证据」→「独立核对证据」；③第 52 行首用流程「Proof 独立只读核对交付与回交证据」→「Proof 独立核对交付与回交证据」；④第 75 行「治理角色只读」整条改写为「所有角色都具备 shell 能力」——读写与任意命令全部走既有审批流程（只读白名单直接执行；risky/review/deny 逐条由客户或判断 agent 审批；拒绝/超时/通道不可用一律不放行），shell 副作用不受文件写入门禁约束、审批链是唯一控制，文件写入仍优先 `write_file` 并经写盘确认，shell 裁决审计仍落 `docs/audit/shell-gate.jsonl`。第 76/77/129 行经核对仍准确未动。`.env.example` 无审批变量、按任务要求不新增（未动）。`test/装配/` 无钉 README 文案用例（`release-packaging.test.ts` 仅把 README 当排除路径夹具），未新增测试。验证：`node --test "test/装配/**/*.test.ts"` **82/82**（0 红/0 跳过）；`git diff --check -- README.md` 通过；未跑全仓/typecheck（纯文档改动）、未读 `.env`、未 git 提交。见[变更记录](docs/change/2026-10-19_change_readme-all-roles-shell.md)。

- 2026-10-19（编排「写盘确认卡呈现前 preview 完整性闸」下的装配夹具修复）：编排在 `src/common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness` + `run-role.ts` 呈现前新增确定性闸——`request_confirmation` 声明了写入路径时，preview 必须对**每条**路径给出可核对正文/结构（标题/围栏说明/声明行作锚点 + 其后至少一行非空正文），否则不发卡、不发行写入路径、工具返回失败。本角色 `test/装配/govern-target.test.ts` 第 7 例（`ans govern <空目录>` 经 `governCommand` + 假适配器）随之转红：原 preview 只有「一行一个路径」声明行、无正文 ⇒ 放行桩未被调用（`confirmRequests.length` `0 !== 1`）。修复仅动该夹具 preview：保留原声明行，为该路径补 `## docs/proposals/demo-v1.md` 标题 + 与实际写出一致的正文（`proposalContent` 单一来源）；**断言零放宽**（EXIT_OK、stderr 排除项、落盘内容、确认恰好一次、`nothing-to-pin` 零副作用全部逐字保留）。验证：专项 `govern-target.test.ts` **11/11**（修复前 10/11）；全装配 `node --test "test/装配/**/*.test.ts"` **82 计 / 82 过 / 0 红 / 0 跳过**。未跑全仓/typecheck（范围仅装配夹具，工作树含他人未提交改动）；未读 `.env`、未跑真实模型/凭据/网络、未 git 提交。见[修复记录](docs/fix/2026-10-19_fix_write-confirm-preview-fixture.md)。

- 2026-10-17（治理三权 CLI 同步·测试角色阻塞项修复）：`src/index.ts::loadInjection` 对外来目标目录调用共享 `readGovernanceModel`（PM 属主，只读导入、不复制实现），把模型写入注入的 `ProjectConfig.governanceModel`。判定与 `listProject` 同口径：explicit → 显式值；unreadable → `single`（保留既有 `ans-invalid`/fail-closed 语义）；absent + 无 `.ans/project.json` 记录且无项目角色子目录（`角色卡/`、`role-cards/`，空目录不算）→ `trio`（新空项目）；其余 → `single`（旧项目逐字不变）。`ans govern`（缺省）/显式 ans-cli 根仍用载入配置、不做目标推断；`ans role run` 不经 `loadInjection`，语义不变。`ConfigInjection`/`governCommand` 契约未改——`project.governanceModel` 已随会话输入透传给 `resolveRole`/`resolveBoundarySection`。修复效果：`ans govern <空目录> --function proposal` 不再报「三权角色在 single 治理模型下不可用/治理边界解析失败」。测试：新增 `test/装配/governance-model-injection.test.ts` **9 例**（空目录 trio、空角色目录 trio、旧项目 single、英文 `role-cards/`、显式 trio/single、`.ans` 有记录无模型 single、`.ans` 不可解析 single、ans-cli 自身不推断）；`govern-target.test.ts` 第 7 例改为新空项目 trio/rapporteur 提案写盘并加 `--function proposal`，同时锁定无 pin 之物时 `nothing-to-pin` 零副作用（原 su 骨架断言按新契约改写，未放宽其余断言）。证据：`test/装配/` **82/82**；typecheck **0 错**；全量 `node --test "test/**/*.test.ts"` **2669 计 / 2648 过 / 18 红 / 3 跳过**——4 条 CLI 红（real-entry 1 + t1-real-cli govern×3）**转绿**，其余 18 红均为既有环境/他角色（Windows symlink EPERM、桌面UI renderer、schema 文案、vendor pin 等），**0 新红**。未读 `.env`、未跑真实模型/凭据/网络、未 git 提交。

- 2026-10-17（v1.3.0 overlay-5·第四跑 Windows CI 处置）：run `38931760696`（Windows runner）新红 1 处——`test/桌面应用/session-rebuild-race.test.ts:346`（`:357` 期望 ok:false 实得 ok:true；同 runner 前三跑均绿）。桌面窗口判定＝**时序脆弱**（非平台真值、非产品竞态）：等长重写（5B→5B）×`filePrint` 缓存 (mtimeMs,size) 命中×平台时间戳粒度合并；受控实验复现＋免疫证明；**产品零改**。修复＝夹具尺寸可判化＋守卫＋免疫回归钉（原用例本体未动）。按精确路径**增列**该文件至 release-policy（单文件、不开目录）；policy 注释追加 overlay-5 短节。复算：落盘形态 45（tracked 44＋untracked 1）→ **selected 恰 14＝13＋本批 1**、excluded 31 全文档/角色卡面、零 `app//src/` 触发；改前对照该文件落 excluded（Windows 必红路径）。机制预演（临时 clone，未污染）：prepare 退出 0、`overlayPaths` 恰 14、`actualTree 4fc82ecc…`、excludedChanges 31 全文档面。验证：`test/装配/` **73/73**（+1 例锁定精确入选＋同目录排除面）、typecheck **0 错**、全量 **2114/2113/0/1 退出 0**（0 新红）。未动测试本体（桌面窗口属主）；未提交/未触发（归 root）。见[变更记录 overlay-5 节](docs/change/2026-10-16_change_v1.3-release-packaging.md)。

- 2026-10-16（v1.3.0 overlay-2·首跑 Windows CI 处置）：run `38924209553`（headSha `74a34c9`）Windows 8 红全部处置——判别：**仅 1 处产品修复**、其余 6 处验证套件平台真值分支（G-3/G-4/G-5 用例首上 Windows；断言本体零放宽）。按工作树实况**精确增列 7 条**至 release-policy files（单文件、不开目录）：生产＝`src/provider/codex/session.ts`（win32 taskkill 清收上界 120ms→2000ms **仍为有界**；姊妹用例峰值负载 212ms 通过为证；测试文件零改动）；测试 6＝`test/pi-adapter/installed-mcp-servers.test.ts`、`test/测试/g4-skill-verify/b-render-double-check.test.ts`、`test/测试/g4-skill-verify/f-fingerprint.test.ts`、`test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts`、`test/测试/g4v2-mcp-verify/j-pi.test.ts`、`test/测试/g5-reasoning-verify/h-scope-audit.test.ts`（十键豁免/分隔符原生形/无信号面/控制字符不可建盘）。policy 注释：overlay-1「无随版修复需求」句标注 overlay-2 更正＋追加 overlay-2 节。复算：落盘形态 40（tracked 32＋untracked 8）→ **selected 恰 13＝overlay-1 的 6＋本批 7**、excluded 27 全文档/角色卡面、零 `app//src/` 触发；改前对照 7 条中 src 抛错/测试落 excluded（即 Windows 必红路径）。机制预演（临时 clone，未污染）：prepare 退出 0、`overlayPaths` 恰 13、`actualTree dc618f40…`、excludedChanges 27 全文档面。验证：`test/装配/` **72/72**（+1 例锁定 7 条精确入选＋同目录排除面；反例面 codex session.ts 由反例转已授权、`client.ts` 保留——未放松）、typecheck **0 错**、全量 **2111/2110/0/1 退出 0**（0 新红）。未动 7 文件本体（各属主）；未提交/未触发（归 root）。附记：`git diff --check` 报 `角色卡/Pi适配器/memo.md` 尾部空行一处（非本角色、未动、如实报）。见[变更记录 overlay-2 节](docs/change/2026-10-16_change_v1.3-release-packaging.md)。

- 2026-10-16（v1.3.0 发布 overlay 准备·客户「发布新运行包」）：冻结源＝tag `v1.3.0`＝`16963ee3f59acc1f812141709858690f1a24501b`（已推送；**源内已含全部产品代码**——G-3 联网搜索＋工具行折叠、G-4 V1 技能安装/V2 外来 MCP 安装、G-5 推理强度、全部修复）。overlay **重置回纯打包面**：policy 指 v1.3.0 且白名单回基础集（files＝`package.json`/`package-lock.json`/`release.yml`＋dirs 不变；v1.2.0 两项一次性条目（`src/provider/codex/session.ts` 生产修复、`test/测试/kanban-fixes-verify/f1-timeout.test.ts` 测试健壮化）随冻结源吸收**整批移除**）、版本 1.2.0→1.3.0（package/lock 根两处、**零依赖变动**——pi-mcp 声明已在 tag 内）、workflow source_ref 默认/concurrency（`release-v1.3.0`）/发布段→v1.3.0（notes 首句「基于固定 v1.3.0 源码…」）、README 下载表→v1.3.0（`ANS-Studio-1.3.0-*`；补 v1.2.0 发布验收链接、保留 v1.1.0/v1.0.0）、release-packaging 测试断言同步（v1.3.0/`16963ee`；反例位恢复 codex `session.ts`；一次性用例改写为重置后「纯打包面精确性」锁定；净 73→71 属条目移除必然、**非放松**）。复算（tag→工作区＝落盘形态）：selected **恰 6**（workflow、lock、package.json、policy×2、release-packaging.test）、excluded 全文档/角色卡面（README＋pm 登记＋装配文档面）、**零 app//src/ 触发**；`git diff v1.3.0 HEAD` 本时点为空（overlay 未提交）。机制预演（临时 clone；真实仓库未污染）：tag 解析 `16963ee` ✓ → 模拟 overlay 提交 → `SOURCE_REF=v1.3.0 node src/common/装配/release-prepare.mjs` **退出 0**、`overlayPaths` 恰 6、`actualTree bac2ea1f…` 稳定、excludedChanges 仅文档面（文档面落盘后完全形态复跑同值：selected 仍 6、actualTree 不变；预演目录已清理）。验证：typecheck **0 错**（ans-cli@1.3.0）；`test/装配/` **71/71**；全量 **2110/2109/0/1 退出 0**。未提交/未触发（归 root；tag 已推）；发布说明素材要点见 change 文档。见[变更记录](docs/change/2026-10-16_change_v1.3-release-packaging.md)（含[证据目录](docs/change/2026-10-16-release-packaging-v1.3-evidence/)）。

- 2026-10-16（V2 收尾件·PM 派发）：`@earendil-works/pi-mcp` 补**显式依赖声明**。来源：Pi适配器 P3/G-4 V2 自持 StdioTransport 落地后发现该包（`src/common/pi-adapter/real-adapter.ts::loadPiMcp` 动态导入；其注释「本轮已上报，未越界改 package.json」即本派发由来）仅经传递依赖（pi-coding-agent→`^1.1.0`）可解析。**版本钉法（以 lock 为准钉同版）**：lock/实装均 `1.1.0`（integrity `sha512-xGKwvu3…`、已顶层提升），沿本仓运行时依赖全精确钉法声明 `"@earendil-works/pi-mcp": "1.1.0"`（父包范围同满足、npm 树合一 deduped）。**改动**：`package.json`/`package-lock.json` 各 **+1 行**（根依赖表镜像同步；`npm install --package-lock-only --no-audit --no-fund --prefer-offline` 更新；全量 diff 核对＝仅此两行——零其他依赖变动、零 resolved/integrity 改写；幂等复跑与 `npm ci --dry-run --offline` 均「up to date」通过）。验证：`npm ls @earendil-works/pi-mcp` 直连层级正确（根直连 ＋ pi-coding-agent 下 deduped，exit 0）；`npm run typecheck` **0 错**；`node --test "test/pi-adapter/**/*.test.ts"` **278/278 通过、0 失败**；全量 **1934 计 / 1933 过 / 0 红 / 1 跳过、退出 0**——派发时基线 8 红（test/测试 g1-verify/g4-skill-verify 旧钉，PM 明示不处理）由「测试」并行翻新落盘转绿（并行实况、非本改动所致；本改动 0 新红）。**部署边界**：仅落 main、**不入任何发布 overlay**——`package.json`/`package-lock.json` 在发布白名单内，须 **成对**提交（`npm ci` 同步要求）并随**下版**发布流程再评审（发布后 main 批次）；未 git 提交（归 root）；未动 node_modules 实装（该包已顶层在位，仅声明面变化）。

- 2026-10-16（v1.2.0 发布前 CI 检查追加·overlay-3 归因更正）：**更正下一条**——run 38881759770 macos-15-intel 2 红**不在** `test/runtime-core/shell-exec-timeout.test.ts`（同 run 7/7 全绿），逐字落点为 `test/测试/kanban-fixes-verify/f1-timeout.test.ts:40/:76` 的镜像 F-1 用例（慢 runner 微小时限未适配，非产品缺陷）。增一减一（release-policy files）：**增列** f1-timeout（真红修复本体；「测试」同口径健壮化不放松断言、32 增/19 删、已落盘）；**移除** shell-exec-timeout（列入唯一依据即误归属；其硬化依赖 `test/runtime-core/fixtures.ts` 新增可选参——只列测试不列夹具则构建树「新测试配旧夹具」（第二参被静默忽略、退化 1500ms，且 CI `tsc` 会以「多传参」报错），两文件同列则非必需＋两块新构建面；按最小差集随发布后 main 常规批次、不入本 overlay）。复算：已提交面（tag→HEAD `21351a7`）26 文件 → selected 7 不变；**落盘形态（修正后）＝26＋f1-timeout＝27 文件 → selected 恰 8**（原 8 增一减一）；新旧对照（同一 29 文件输入＝26＋两测试文件＋fixtures，脚本化实测）差集恰 **gained {f1-timeout}/lost {shell-exec-timeout}**、fixtures 恒 excluded；原始 tag→工作区 50 跟踪文件喂 policy 仍抛 `Unreviewed production overlay: app/renderer/renderer.js`。**在飞提醒**：`src/provider/codex/session.ts`（白名单内）现叠加搜索批（Codex web search）未评审改动——overlay-3 提交**按名提交、不含该文件**（勿 `git add -A`；折叠批 `app/renderer` 等若被带入则会响亮抛错）。验证：`test/装配/` **73/73**（原 shell-exec「精确入选」用例改写为 f1-timeout 精确入选 ＋ **新增 1 例**锁死 runtime-core 两文件仍 excluded；未放松）、`npm run typecheck` **0 错**（含全部在飞工作区状态）。未动 `test/测试/**`、`test/runtime-core/**`（两属主边界，只读参考）；未提交/未触发（归 root）。见[变更记录更正节](docs/change/2026-10-16_change_v1.2-release-packaging.md)。

- 2026-10-16（v1.2.0 发布前 CI 检查追加·overlay-3）：v1.2.0 CI（run 38881759770）macos-15-intel 两条 F-1 用例红＝`test/runtime-core/shell-exec-timeout.test.ts` 计时断言未适配慢 runner（非产品缺陷；该文件属**运行时核心**，时序健壮化由其并行实施、不放松断言）。精确白名单下该文件会被**静默 excluded**（`test/` 既不触发 fail-closed 也不命中白名单）⇒ 构建树沿用 tag 旧断言、macos-15-intel 必再红。决定：按 **v1.1.0 同文件先例**（同一文件曾因平台断言小修精确列入、selected 7→8）再次精确加入 files（单文件、不开目录；fail-closed 与生产反例未动——`app/main.ts`、`src/provider/claude/session.ts` 仍拒；`release-policy.d.mts` 无描述文字无需同步）。复算：已提交面（tag→HEAD `21351a7`）26 文件 → selected 7 不变、excluded 19 全文档面；原始 tag→工作区 37 文件喂旧 policy **抛** `Unreviewed production overlay: app/renderer/renderer.js`（在飞折叠批 `app/` 若入 overlay 提交即被拒）；落盘形态 27 文件 → **selected 恰 8＝原 7＋该测试文件**、excluded 19 全文档/角色卡面（含 pm G-3 登记）；改前对照该文件落 excluded（新旧差集恰为该文件：gained 1/lost 0）。验证：`test/装配/` **72/72**（原「纯打包面精确性」用例改写为「按精确路径入选、不开目录」——反例位同目录 `tools.test.ts` 与 codex-adapter 仍 excluded、未放松）、`npm run typecheck` **0 错**。未动运行时核心文件（只读参考）；未提交/未触发（归 root；**overlay-3 提交须含该修复本体**——截至本记录尚未落盘；macos-15-intel 消解以 CI 复跑实测为准）。见[变更记录追加节](docs/change/2026-10-16_change_v1.2-release-packaging.md)。

- 2026-10-16（v1.2.0 发布前 CI 检查追加）：v1.2.0 CI（run 38879484184）Windows 仅 1 红＝原生进程用例收尾 `rmdir …\ans-codex-…\work` EBUSY；定位根因在**产品清理路径**（`nativeEngine` 删 workRoot 早于 stdio 全闭；`test/codex-adapter/session.test.ts` 逐字节未变、断言零放松）。「Codex适配器」经评审的随版修复＝`src/provider/codex/session.ts`（15 行：等 `'close'` ＋ `rm` 经共享 `retryOnTransient` 有界重试；测试健壮性同源：真机进程清理更稳）。该文件属 `src/`——不列白名单则 prepare 直接抛错拒绝构建（改前复算实证 `Unreviewed production overlay: src/provider/codex/session.ts`），按 **v1.0.0 先例**（旧白名单本就精确含此文件）精确加入 files（单文件、不开目录；fail-closed 与生产反例未放松——反例位 `src/provider/codex/session.ts`→`src/provider/claude/session.ts`；`release-policy.d.mts` 无描述文字无需同步）。复算：tag→工作区 32 文件＝overlay-1 已提交 21＋本修复 1＋并行在飞 10；已提交面 21→selected 6 不变；落盘形态 23→**selected 恰 7＝原 6＋session.ts**、excluded 16 全文档/角色卡面。验证：`test/装配/` **72/72**（+1 例锁定精确路径入选/不开目录/测试面零改动；原断言未放松）、`npm run typecheck` **0 错**（末次复跑含该修复工作区状态）。未动 codex 两文件（只读参考）；未提交/未触发（仍归 root；overlay-2 提交需含该修复本体，Windows 侧待 CI 复跑实测）。见[变更记录追加节](docs/change/2026-10-16_change_v1.2-release-packaging.md)。

- 2026-10-16：按客户「发布」指示制作 **v1.2.0 发布配方**（机制沿用：冻结 tag ＋后置 overlay；v1.0.0/v1.1.0 tag 与证据不动——v1.1.0 已实测发布）。冻结源＝`ecca2d3`（tag `v1.2.0` 由 root 打）；overlay **回到纯打包面**：policy 指 v1.2.0 且白名单＝`package.json`/`package-lock.json`/`release.yml` ＋ `src/common/装配/`、`test/装配/`（v1.1.0 的 runtime-core 测试文件条目移除——其平台小修已含于冻结 tag；本批产品改动 v3/U1/收束 30s/自检台全部在 tag 内、无产品/测试文件入列）、版本 1.1.0→1.2.0、workflow `source_ref` 默认/concurrency/发布段→v1.2.0、README 下载表→v1.2.0（补 v1.1.0 历史验收链接、保留 v1.0.0）、release-packaging 测试断言同步（runtime-core 用例改写为纯打包面精确性锁定）。验证：typecheck 退出 0；`test/装配/` **71/71**；全量 **1678/1677/0/1 跳过**；机制在临时 clone 预演通过（prepare 无参＋env 产出 selected 恰 6 文件、错误 ref 明确拒绝；真实仓库**未** tag/提交/推送）；本机 mac arm64 模拟构建树打包＋`release-verify` 解压实跑**退出 0**（`version=1.2.0`、7 项 UI 检查、SDK/WASM、Codex 0.162.1、Claude 2.1.299；ZIP SHA256 `4291d00c…`），本机结果不替代 Windows/x64。tag/overlay 提交/触发/发布全部交 root 按 runbook 执行。见[变更记录](docs/change/2026-10-16_change_v1.2-release-packaging.md)（含[证据目录](docs/change/2026-10-16-release-packaging-v1.2-evidence/)）。

- 2026-10-16（发布前 CI 检查追加）：Windows 平台 `test/runtime-core/shell-exec-timeout.test.ts` 3 条断言假定 Unix 信号名语义而红（产品行为无缺陷；该文件属运行时核心，平台自适应小修由该角色并行实施）。精确白名单下该文件会被**静默 excluded**、构建树沿用旧断言 ⇒ Windows 必然再红。按 v1.0.0 惯例（overlay 本就含 test/* 文件）把该**经评审的具体测试文件**精确加入 files（单文件、不开目录；fail-closed 守卫未动；`release-policy.d.mts` 无描述文字无需同步）。复算：`git -c core.quotePath=false diff --name-only v1.1.0 HEAD`（已提交面）21 文件 → selected **7**；`git -c core.quotePath=false diff --name-only v1.1.0`（tag 对工作区＝overlay 提交落地形态，25 文件；运行时核心小修当日已落工作区、未提交）→ selected **恰 8**（原 7 ＋ 该文件）、excluded 17 全为文档/角色卡面（含运行时核心 3 篇）；改前对照该文件落 excluded。验证：`test/装配/` **71/71**（+1 例锁定精确路径入选、不开目录；原断言未放松）、`npm run typecheck` **0 错**（末次复跑含运行时核心小修状态）。未动运行时核心文件（只读参考）；未提交/未触发（仍归 root）。见[变更记录追加节](docs/change/2026-10-16_change_v1.1-release-packaging.md)。
- 2026-10-16：按客户「发布新运行包」指示制作 **v1.1.0 发布配方**（机制沿用：冻结 tag ＋后置 overlay；既有 v1.0.0 tag 与证据不动）。冻结源＝`e4556cc`（tag `v1.1.0` 由 root 打）；overlay 仅本角色打包面：policy 指 v1.1.0 且白名单**收敛为精确集合**（生产白名单清零；`app/`·`src/` 未知变更 fail-closed 不变）、`release-prepare` 错误文案参数化、版本 1.0.0→1.1.0（package/lock 根两处）、workflow `source_ref` 默认/concurrency/发布段→v1.1.0、README 下载表→v1.1.0、release-packaging 测试断言同步。验证：typecheck 退出 0；`node --test "test/装配/**/*.test.ts"` **70/70**；机制在临时 clone 预演通过（无参/显式 v1.1.0 的 prepare 产出 7 文件 overlay、错误 ref 明确拒绝；真实仓库**未** tag/提交/推送）；本机 mac arm64 模拟构建树打包＋`release-verify` 解压实跑**退出 0**（`version=1.1.0`、7 项 UI 检查、SDK/WASM、Codex 0.162.1、Claude 2.1.299；ZIP SHA256 `efc147b5…`），本机结果不替代 Windows/x64。tag/overlay 提交/触发/发布全部交 root 按 runbook 执行。见[变更记录](docs/change/2026-10-16_change_v1.1-release-packaging.md)（含[证据目录](docs/change/2026-10-16-release-packaging-evidence/)）。
- 2026-10-15：ANS Governance 依据客户“让相关角色配置打包流程，基于 v1.0.0 编译 macOS 和 Windows 运行包，测试通过后上传 Release”明确授权，新增 `.github/workflows/release.yml` 与 `electron-builder.yml` 两个精确单文件；同步 MD 中漏列的现有 YAML 条目，不放开 `.github/` 目录、不修改 tag/pin 或应用代码。见[治理记录](docs/change/2026-10-15_change_release-packaging-boundary.md)。

## 2026-10-14 — README 过时表述核改（客户指示「修改一下，并且提交」；PM 转达漂移点，逐条实读核实）

PM 初查给出 5 类漂移点；本任务**每条先对现行代码 / 记录核实再改**（不照抄转述），并顺带扫同类过时处。**由 PM 统一提交**（本角色不 commit）。

- **① 图片已接通（原表述两个方向都反了）——改**：
  - 快速开始 7：删「『图片随消息送进模型』尚未接线」，改为「可选图（png/jpeg/webp/gif、≤5MB）随消息预览 → 发送时经主进程重校验（解码 / 魔数 / 限额，**任一张不合格整条拒发**；忙时入队即定格）→ 随消息一并**送进模型**（不单独发图）」。
  - 「已知范围外」整条「图片发送未接通」**删除**（无残余限制可留——类型 / 大小 / 随消息发送属常规约束，不是「未做」）。
  - 依据：`角色卡/桌面窗口/feature-map.md`（「停止与图片端到端」＝已实现）、`角色卡/Pi适配器/feature-map.md`（「图片 prompt 透传（K-2）」＝已实现）、归档 change `角色卡/桌面应用/docs/change/2026-10-13_change_p0-halt-and-images.md`（主进程重校验 / 队列入队定格 / 整包透传、**退役「图片未发送」提示**）、实读 `app/desktop/composer-images.ts`（`MAX_IMAGE_BYTES=5MB`、`ALLOWED_IMAGE_MIMES`=png/jpeg/webp/gif）。
- **② 两道门用例数——改**：`859 用例、856 通过` → **`1054 用例、1051 通过、1 跳过`**。依据：本任务实跑 `node --test "test/**/*.test.ts"` → **1054 计 / 1051 过 / 2 红 / 1 skip**（两红＝既有环境红：`pi-config` 目录名、pm `path-primitives` macOS `/var`），与 PM 当晨记录一致；第 93 行两条红的描述经核对仍准，未动。
- **③ 右栏布局——改**：快速开始 4 的「右栏『待办 / 队列』」→ **右上角图标簇「角色资料」抽屉内「当前工作 / 排队」两节**（图标角标 = 该角色待办深度）；6 的「右上『Pi 设置』面板」→ **右上角「Pi 设置」图标打开抽屉面板**。依据：实读 `app/renderer/renderer.js`（`workListHtml` 现行文案 `<h3 class="work-heading">当前工作</h3>` / `排队`）、`app/renderer/index.html`（`#right-tabs` 两枚图标簇、Pi 面板迁入抽屉）、归档 change `2026-10-13_change_drawer-two-icons-and-pi-fit.md`。
- **④ shell 闸状态——改写**：原「**只对项目角色 arm**（su 自身不 arm）」已过时。改为：桌面已 arm（**(c) 实件与 (a) 通道两件同备才 arm**）；**项目角色**三层链——(b) 结论经 `report_shell_verdict` 工具交回、「危险」类即使 (b) 放行也必过 (a)；**已授权项目的精确常规检查**（`npm test` / `npm run typecheck` / 项目内 `node --test test/*.test.ts` 窄匹配）在 (b) 明确放行后**自动执行**；**su 走只读档**（客户裁定「su 也要有 shell，但是只读」：只接 (c)、白名单直接放行、`risky`/`review`/`deny` 全拒、**不接 (b)/(a)**）。「CLI 未 arm」与「无 OS 沙箱」两条保留（核实仍真实）。依据：实读 `src/pipeline/orchestration/shell-arming.ts`（`assembleProjectShellGate` / `assembleReadonlyShellGate`）、`src/common/编排/routine-shell-policy.ts`、`src/common/编排/shell-gate.ts`（delegated-routine 分支：b 明确 allow 可免重复 a）、`app/main.ts`（两档分发注释 + 两件同备才 arm）、`app/desktop/session.ts`（routine 注入条件＝非内置角色且 accepted）、`app/desktop/operator-channel.ts`（`DESKTOP_SHELL_GATE_ARMED=true`）、`src/index.ts`（CLI 仍不注入 `ShellGate`）。
- **⑤ 顺带核**：**七态徽标**（快速开始 7）——实读 `app/renderer/role-status.js` 恰为七态（含 `idle-restored`），**准确、未动**。**「真实 Pi 此后未再复验」条——改写**：原「真机 shell 语义验证同样**未做**」与真机证据矛盾（`角色卡/编排/changelog.md` R-1/M-2/X-2 条目引真机审计数据：`c-allow ×31`、`c-deny ×2`、客户多次放行、审读不可解析 / 重复投递均**真机暴露并修复**；另 2026-10-12 首次桌面 + 真模型端到端有会话记录）。改为：「已不止一次真机运行（2026-10-12 起，客户在真机上使用）……真机 shell 已有放行 / 拒绝 / 审计留痕记录；但此后改动很多、**未再系统复验——当前端到端状态未验证**；su 只读 shell、工具化审读等现行档位的真机复核**属客户跑**」。
- **未改而存疑（如实报告，供 PM 裁定）**：a) 快速开始 7 未提**停止钮**（P0-2 已发布的输入区特性）——属遗漏非过时表述，按任务口径未加（**同日 PM 裁定补入，见下条 ⑥**）；b) Pi 设置「3 必填 + 1 可选」经实读 `app/desktop/pi-config.ts`（`PI_PANEL_KEYS`=4 / `PI_REQUIRED_KEYS`=3，无超时键）仍准，未动；c) P0-3「120s 超时进面板」未见落地，README 原未涉及、无需改。
- **⑥ 停止钮（PM 同日裁定补入）**：快速开始 7 补一句「忙碌时另现**停止钮**，与发送钮并存——只结束**当前轮次**，排队消息 / 草稿 / 资料保留，空闲时隐藏」。依据：归档 change `2026-10-13_change_p0-halt-and-images.md`（P0-2：停的是**当前一轮**——会话保留、轮次仍以既有 settled 收尾、非「结束会话」的恢复；与发送钮并存、忙碌时发消息＝入队语义不变）＋实读 `app/renderer/renderer.js`（`#btn-halt`：输入框区、发送钮左侧、**仅忙碌时出现**）与 `index.html`（默认 `hidden`、title「停止当前轮次」）。
- **验证**：`git diff --check` → **通过**（无空白问题）；stale 扫描（`尚未接线`/`未接通`/`859`/`右栏`/`只对项目角色 arm`/`跑通一次`）→ **零残留**。本任务只改 `README.md`（＋本 changelog、`memo.md`），未碰代码与他角色文件；**未 commit**（客户已指示提交，由 PM 统一执行）。

## 2026-10-14 — 补建 `角色卡/装配/feature-map.md`（role-card 死链修复；客户要求统一补建）

role-card.md 第 11 行「当前导航见[装配功能导航](feature-map.md)」此前是**死链**——该文件自 bootstrap 起从未建立（客户普查发现 5 个角色同缺、要求统一补建）。本任务按「名称 / 一句话用途 / 当前状态 / 文档链接」建立本角色导航页。

- **内容（12 条交付物/职责）**：① CLI 根入口与可执行脚本（`src/index.ts`、`bin/ans.js`；含入口兜底超时与「CLI 入口未 arm shell 闸」如实登记）② 命令解析（`cli-parse.ts`）③ `ans govern <目标目录>` ④ `ans doctor` 装配自检 ⑤ `.ans/project.json` 载入接线（`config-loader.ts` 薄转发）⑥ 演示运行时与运行时接线（`demo-runtime.ts` / `runtime.ts`）⑦ 构建与测试配置（`package.json` / `tsconfig.json`）⑧ 两道门 ⑨ 装配测试（`test/装配/`，8 文件 54 例）⑩ README ⑪ `.env` / `.env.example`（指定写入者 G-2）⑫ `.ans/`（条件目录 `project-init` 写权）。
- **文档现状如实标注（不预链、不产生死链）**：本角色暂无 `docs/feature/` 稳定功能文档；`docs/design/` 未建立；`functional-description.md` / `api-spec.md`（边界已列路径）尚未落盘。链到实际存在的 `docs/change/`（1 篇）、`docs/fix/`（1 篇）、`changelog.md` / `memo.md`、README、PM 共享组件与 Section 1 授权记档。
- **链接自检**：页内全部相对链接 **24 条**逐一 `test -e`——**全部存在、零死链**（含 `../../README.md`、`../../test/装配/`、`../项目管理/docs/…`、`../编排|桌面UI|桌面窗口/feature-map.md` 等跨层相对路径）；表格 12 个数据行经 awk 复核全部 5 竖线、反引号成对；role-card:11 死链随之解析。
- **本任务只动**：`角色卡/装配/feature-map.md`（新建）、本 changelog、`memo.md`；未碰其余文件；未 git 操作。

## 2026-10-14 — README 同步「桌面应用」角色拆分（→ 桌面UI ＋ 桌面窗口）

「桌面应用」按客户确认拆分为 **桌面UI**（渲染前端，`app/renderer/`）与 **桌面窗口**（Electron 主进程、preload 受限桥、桌面会话装配；`app/main.ts`、`app/preload.cjs`、`app/desktop/`），客户 2026-10-14 确认名称（原话「桌面UI/桌面窗口 这个可以」）；旧目录 `角色卡/桌面应用/` 原位冻结归档——**终止形态为「归档键约定」**：`boundary.yaml` 保留原名 ＋ 顶层 `archived: true`（客户同日定案「还是加一个已归档吧，归档是合理的」），角色枚举**静默跳过（零提示）**、该角色**不可开启**、其边界不予采用；当日上午曾短暂使用 `.frozen` 改名过渡（会出「缺少 boundary.yaml，已跳过」提示），**同日按客户决定演进为归档键约定**（本条目初稿据上午形态撰写，此处按同日演进更正）——详见 `归档说明.md` 与 `角色卡/桌面应用/boundary.yaml` 头部注记。PM 已更新 `docs/architecture.md`（角色表）与 `docs/project-rules.md`（共享组件消费方名单）。两份拆分设计的 §4 均注明：README 属装配、按需由属主刷新（`角色卡/桌面UI/docs/design/2026-10-14_design_role-split-ui.md`、`角色卡/桌面窗口/docs/design/2026-10-14_design_role-split-window.md`）。本任务即按此同步 `README.md`。

- **README 改动（旧 → 新）**：
  1. 「目录与职责」角色表行：``| **桌面应用** | `app/**`（Electron 主进程、preload 桥、渲染进程与 vendored 前端库）、`test/桌面应用/**` |`` → **桌面UI**、**桌面窗口** 两行——按两个新角色 `boundary.yaml` 实读：`app/renderer/`（渲染前端）↔ `app/main.ts`／`app/preload.cjs`／`app/desktop/`（主进程、窗口生命周期、preload 受限桥、桌面会话装配）；测试路径**沿用** `test/桌面应用/`（拆分设计：路径不变、逐文件授权），两行分别标注「渲染侧用例」/「窗口侧用例」。
  2. 同节计数句「全项目共 **7 个角色**」→「**10 个角色**」，并在表尾补录 **产品**、**UIUX设计师** 两行——拆分的**直接后果修正**（任务清单「角色表行」之外的必做配套）：拆行使表行 7→8，只拆行不动计数句会留下「计 7 对 8 行」的自相矛盾；而真实角色数经两处核实为 **10**（PM `architecture.md`「本项目有 10 个角色」；`角色卡/` 实测 10 个活角色目录＋1 个冻结归档），**8 不是任何口径下的真值**，故按真实值补全。两补录行内容源自 PM 已更新的架构表同名行，写入面与两角色 `boundary.yaml` 实读一致（均为各自 `角色卡/<角色>/**`）。
  3. 共享组件段：`消费方（**装配、桌面应用**）` → `消费方（**装配、桌面窗口**）`——app 侧消费方为桌面窗口（渲染进程不经 Node、不消费共享模块），与 PM `project-rules.md` §一.5 的消费方更新一致。
- **刻意未改（产品称谓，5 处）**：L1 标题「v1：CLI + 桌面应用」、L12「CLI 与 Electron 桌面应用」、L34「CLI 与桌面应用共用同一套…」、L43 节题「桌面应用（主推路径）」、L50「桌面应用是一个治理会话工作台」——均指**整个桌面产品**而非角色名，保留不动。表内 `test/桌面应用/` 为**物理路径字面量**（目录仍在、逐文件分属两角色），照留。
- **验证（两道门；首跑于当日上午 `.frozen` 过渡形态，归档键约定落地后同日复跑——两次均如实记录）**：
  - **首跑** `node --test "test/**/*.test.ts"` → **1046 tests / 1042 pass / 3 fail / 1 skipped**；3 红＝① `test/桌面应用/pi-config.test.ts:60` 仓库目录名 `ans-cli` 基线红、② `test/项目管理/shared/path-primitives.test.ts:254` macOS `/var` 基线红、③ `test/门禁引擎/list-project.test.ts:41` 遇 `.frozen` 过渡方案的「缺少 boundary.yaml，已跳过」提示。
  - **演进后复跑** → **1054 tests / 1050 pass / 3 fail / 1 skipped**；③ list-project 随**静默跳过**转绿；现 3 红＝① 同上基线红、② 同上基线红、③ `test/桌面应用/project.test.ts:29` 仍期望「跳过**并提示**」（上午形态、与归档键约定**零提示**不符）——属**他角色（桌面窗口）待同步**，未动。
  - `npm run typecheck` → **0 错**（两次）；本角色 `test/装配/` → **54/54**；**本角色两次零红**。
- **格式自检**：编辑后角色表 10 个数据行经 awk 复核全部 3 竖线、反引号成对；`grep` 复核「桌面应用」余 5 处皆产品称谓。
- **只动**：`README.md`、本 changelog、`memo.md`。未碰 `app/**`、`src/**`、`test/**`、他角色目录；未 git 操作（不 commit）。

## 2026-10-13 — P1-4 配套：`ans role run --help` 真实入口放行（编排转达的跨角色缺口）

编排的 P1-4（CLI 定位指路，客户批准提案）命令层已就位但**真实入口到不了**：`ans role run --help`（无 `--task`）被本角色 `src/common/装配/cli-parse.ts::parseInvocation` 判为「缺少 --task」的 `unknown` ⇒ stderr + 全局 USAGE、退 2。本任务即编排 change 文档（`角色卡/编排/docs/change/2026-10-13_change_cli-positioning.md`）「跨角色登记（归装配）」一节的最小改动。

- **改动（`src/common/装配/cli-parse.ts`，只加一个分支）**：`role run` 位形里出现 `-h`/`--help`（`--task` 缺失/存在均可）时照常返回 `role-run`、整段 argv 原样透传给命令层 `runRoleCommand`（帮助文本与退码归它；令牌集与命令层一致：仅 `-h`/`--help`，裸 `help` 不算）。其余解析/退码路径**逐字未动**——`role run`（无角色）仍「缺少角色 id」、`role run <角色>`（无 help、无 --task）仍「缺少 --task」，均退 2。
- **测试（`test/装配/cli-parse.test.ts`，52 → 54 例）**：① 放行矩阵——`--help`/`-h`/`装配 --help`/`编排 --task T-1 --help` 四种位形解析为 `role-run` 且 argv 原样透传（`deepEqual`），带 `--task` 位形字段逐字不变；② 防放宽过度——无 help 缺 --task 仍是「缺少 --task」（消息级断言）、裸 `help` 令牌不放行。
- **真实入口实测**（`node bin/ans.js`）：`ans role run --help` → **退 0**、stdout 含用法行与指路句「本命令不提供 shell 与会话保持（一次性执行）；需要交互式治理会话请使用桌面应用。」；`ans role run -h` 同；`ans role run`（无参）→ 仍退 2「缺少角色 id」（改前实测即此，简报口径写作「缺 --task」，如实校正）；`ans role run 编排`（无 help）→ 仍退 2「缺少 --task」；`ans role run 编排 --task T-1 --help` → 退 0，与改前逐字相同。
- **验证**：`test/装配/` **54/54**；全量 `node --test "test/**/*.test.ts"` **950 tests / 947 pass / 2 fail / 1 skipped**（两红=既有基线红：`test/桌面应用/pi-config.test.ts:43` 仓库目录名、`test/项目管理/shared/path-primitives.test.ts:251` macOS `/var`；比 P1-4 记录的 948 恰 +2 例=本次新增）；`npm run typecheck` **0 错**。Node v24.14.0 / HEAD 4b69afb（工作区未提交）。
- **只动本角色文件**：`src/common/装配/cli-parse.ts`、`test/装配/cli-parse.test.ts`、本角色 changelog/memo、`docs/change/2026-10-13_change_role-run-help-passthrough.md`（新建，本角色 docs/change/ 首篇）。未 git 操作、未重启桌面应用（在飞批次未打扰）、未发真实模型请求、未读 `.env`。变更记录：`角色卡/装配/docs/change/2026-10-13_change_role-run-help-passthrough.md`（status: verified）。

## 2026-10-12 — README 更新到当前状态（客户直接指示；逐条读实件核实）

重写 `README.md` 的过时面：**收口已废**（改确认制：su 写盘前经 `request_confirmation` 预览获客户同意，编排把已预览且校验在边界内的路径发行进本次会话 writeSet、F4 拒未确认路径；**客户确认不设超时**，等待期间该轮硬超时暂停；同意且写入后 **settle 自动收尾**写 `.ans`(pin)+治理边界文档+manifest）；**回交/派发/队列/重启恢复**（`submit_report` 自动投递 su 验收；su `dispatch_task` 落盘后自动开工、每角色一条队列、客户消息同样入队、右栏「待办/队列」+ 徽标待办数；D-1 `<项目>/.ans/sessions/<角色>/` 恢复历史与上下文，已 gitignore）；**shell 闸改写**（桌面已 arm 三层链 (c)→(b) su 审读→(a) 客户确认；不可解析 ⇒ 直接拒、不打扰客户；只对项目角色 arm；**已知风险：无 OS 沙箱**；**CLI 入口仍未 arm**——实读 `src/index.ts`）；**边界格式**（散文 ⇒ 响亮报错；改边界需重开会话，拒写提示带「旧边界快照」线索）；**桌面呈现**（胶囊输入框 + 图片采集 ≤5MB、**送模型未接**；虚拟渲染 >150 行；Markdown 化 = vendored markdown-it 15.0.2 + sha256 pin；七态徽标；取消 runtime 选择器即默认 pi——旧 README 的「顶栏 runtime 选择器」已删）；文档纪律（文档面随边界授予 + 代码与文档同批交回 + `temp/<角色>/` 暂存区）。「已知范围外」节按实件重写（图片送模型未接、多任务派发引擎仍二期、真机 shell 语义未验、真实 Pi 会话未复验、CLI 与桌面差异）。**只改 `README.md`**。验证：`test/装配/` **52/52**；全量 **859/856/2/1**（两红=既有环境红）；`npm run typecheck` **0 错**；Node v24.14.0 / HEAD d933537。来源：客户「修改 readme.md」直接指示。


## 2026-10-12 — 修复 `ans govern <目标目录>` 的「治理边界解析失败」（M1+M2+O1，客户批准）

客户报障：`ans govern /tmp/ans-pi-e2e`（空目录）→ `治理边界解析失败：读取边界文件失败：ENOENT …/角色卡/门禁引擎/boundary.yaml`，退出码 1。**根因（已核对到源码）**：T34 只把注入配置的 `projectRoot` 换成目标目录，而**无 `.ans` 时回退的内置演示配置**里的 `governanceBoundary.path`（`src/index.ts:120`）与六个角色的 `card`/`boundary` 全是**相对 ans-cli 自身**的项目相对路径——su 不在 `project.roles` ⇒ `resolveBoundarySection` 走「治理边界覆盖」分支，去**目标目录**下读该文件 ⇒ ENOENT ⇒ `govern-session.ts` 以 `parseError` 抛错。

- **M1（`src/index.ts`，`loadInjection`）**：目标目录 ≠ ans-cli 根（`path.resolve` 比较，新私有函数 `isSelfProjectRoot`）且 `configSource.kind === "builtin-fallback"` 时，改注入目标项目的**如实形态**——`roles = {}`、`governanceBoundary = { path: "", acceptance: DEMO_ACCEPTANCE }`（回到既有约定：空串不参与治理边界覆盖分支；finalize 落点由 `path || DEFAULT_GOVERNANCE_BOUNDARY_REL` 给出——与桌面「无 `.ans` 传空串」同款）。`ans govern`（无目录）与 `ans govern <ans-cli 根>` 行为逐字不变。
- **O1（客户批准）**：同一分支补 `genesisBootstrap`（source = `cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`）——`ans govern <空目录>` 真能 bootstrap（与桌面「导入空文件夹」同一条有界创世授权；项目自己的治理边界文档一经写出并经 pin 接受即**结构性自终止**）。不加则命令「成功」但 su 一个字也写不了。
- **M2（`test/装配/govern-target.test.ts`，49 → 52 例）**：新增「注入合同」「自根不变」；原第 6 例拆为两条更严用例——`governCommand` + 假适配器驱动（`EXIT_OK`、边界解析不再失败、创世授权下骨架写入**真落盘**）与 `main` 入口（**先清空 Pi 相关环境变量**：非 0、不含边界/目录错、如实报缺 provider 配置）。**未放宽、未删除原断言**；注释里「非 0 因缺 Pi 凭据」的旧说法一并纠正（适配器**惰性构造**，真实原因就是边界 ENOENT）。
- **证据**：`test/装配/` **52/52**；全量 `node --test "test/**/*.test.ts"` **681 tests / 678 pass / 2 fail / 1 skipped**（两红与基线完全相同、均他角色环境红，无新增红）；`npm run typecheck` **0 错**。复现对照：修复前（`--env-file=.env`）ENOENT、退出码 1 → 修复后（无凭据环境）`缺少 base URL…`、退出码 1。真实模型端到端（有凭据）**未跑**，属「客户跑」。
- **未做**：未改 README（O1 已批准，原措辞准确，O3 未触发）；未动他角色文件；未读 `.env`；未发真实模型请求。修复记录：`角色卡/装配/docs/fix/2026-10-12_fix_govern-target-boundary.md`（status: verified，确定性范围）。
> **注（2026-10-12 同日更晚）：本 bullet 所述机制已被 A 组确认制替换删除，证据失效，保留为实录。**
- **同日后续轮（2026-10-12）**：编排在 `src/interface/cli/govern.ts` arm 创世收口（注入带 `genesisBootstrap` ⇒ `finalizeBootstrap: true`；新增可选 `GovernDeps.operatorChannel`）后，本角色 `test/装配/govern-target.test.ts` 的 `governCommand` 用例因缺省 CLI 终端通道读 stdin 而**挂起**（实测：45 s 看门狗杀死、退出码 142）。应对：给该例注入**放行桩** `operatorChannel` 并断言挂起**恰好一次**；原断言全部保留（加强，非放宽）。复跑：`test/装配/` **52/52**；全量 **687 tests / 684 pass / 2 fail / 1 skipped**（两红=既有环境红）**自然退出**；`npm run typecheck` **0 错**。

- **同日第三轮（2026-10-12）**：编排按客户批准的 A 组以**确认制**替换收口（删句柄 `settled`/`finalize`/`operatorChannel`；新增 `request_confirmation`/`request_choice`，确认后**发行 writeSet**、未确认路径被 F4 拒；settle 时**自动收尾**写 `.ans`+治理边界文档+manifest）。本角色 `test/装配/govern-target.test.ts` 第 7 例改为：脚本先 `request_confirmation`（预览列出将写路径）再写；deps 注入放行桩 `customerInput`（计次）；适配器工厂转发 `capabilities`；新增「确认恰好一次」「`.ans` 收尾产物存在」断言，原断言全部保留。证据：`test/装配/` **52/52**；全量 **715 tests / 700 pass / 14 fail / 1 skipped**（14 红=他人在途 12 + 既有环境红 2，本目录零红）**自然退出**；typecheck 我方零错。

## 2026-10-11 — 改准 README「两道门」用例数（621 → 677），并全核数字类陈述

上一轮同步 README「Pi 配置」节时，本角色**如实报出**一处不在当时范围内的过时：`README.md:71`
的「**621 用例、621 通过**」与实际不符。本任务处理它，并连同**同类过时数字 / 事实陈述**一并核。

- **实测（以实测为准，不照抄简报给的 677）**：`node --test "test/**/*.test.ts"`（**必须带引号**，
  走 Node 原生 glob、覆盖三层测试路径）→ **677 tests / 677 pass / 0 fail**。**连跑 3 次，三次皆
  677/677/0、稳定**——**未撞到**项目管理正在查的并发 flake（`test/项目管理/shared/atomic-write.test.ts`，
  仅全量并发下偶发挂），**观测到的波动 = 0**；未动该文件。
- **改动（唯一一处）**：`README.md:71` 注释 `全量测试：621 用例、621 通过` → **`677 用例、677 通过`**。
- **数字类全核（实读比对，逐条列结论）**：
  - `README:137` **全项目 7 个角色** —— 实测 `角色卡/` 下 **7** 个目录（项目管理/编排/门禁引擎/Pi适配器/
    桌面应用/测试/装配），与正文表 7 行**一致**。**准**，未动。
  - `README:35` **Node ≥ 23.6（本机 v24.11.1）** —— 实测 `node --version` = **v24.11.1**、`package.json`
    `engines.node` = **`>=23.6`**。**准**，未动。
  - `README:79` **3 项必填 + 1 项可选** —— 实读 `app/desktop/pi-config.ts`：`PI_PANEL_KEYS` = **4**、
    `PI_REQUIRED_KEYS` = **3**（可选者为 `ANS_PI_CONTEXT_WINDOW`）。**准**，未动。
  - `README:84-85` **默认 32768、reserveTokens 16384** —— 实读 `src/common/pi-adapter/provider-config.ts`：
    `DEFAULT_PI_CONTEXT_WINDOW = 32768`；`settings.ts` `reserveTokens = 16384`。**准**，未动。
  - `README:37` 依赖 `yaml` / `@earendil-works/pi-coding-agent`（桌面 devDependency `electron`）——
    实读 `package.json` dependencies/devDependencies。**准**，未动。
  - **未发现**其他过时数字或事实陈述（无「角色数 / 命令 / 路径 / 能力有无」类过时）。
- **未改**：`README` 除第 71 行外一字未动；未碰任何他角色文件；未读 `.env`、未发真实网络请求、未打印凭据值。
- **验证（两道门，改后复跑）**：`node --test "test/**/*.test.ts"` → **677 / 677 / 0**；
  `npm run typecheck` → **0 错**。来源：派发任务「处理上一轮报出的 README 过时用例数」。

## 2026-10-11 — 同步 README「Pi 配置」节 + `.env.example` 到桌面面板新语义（5→4：3 必填 + 1 可选）

客户问「这个 pi 为啥需要配置 5 个呢」→ 桌面应用据此改了「Pi 设置」面板（属**桌面角色**：`app/`、`test/桌面应用/`），
`README.md` 的「Pi 配置」节随之**过时**（仍把 `ANS_PI_PROVIDER` 列为面板键、把 `ANS_PI_CONTEXT_WINDOW` 写成
「必填、无默认值」）。本角色据**代码核实**同步 README 该节与对应的 `.env.example`（均在装配边界内）。
**不照抄简报——凡核实后不符者如实纠正。**

- **核实（实读，只读）**：
  - `app/desktop/pi-config.ts`：`PI_PANEL_KEYS` = **4 键**（`ANTHROPIC_AUTH_TOKEN` / `ANS_PI_BASE_URL` /
    `ANS_PI_MODEL` / `ANS_PI_CONTEXT_WINDOW`）；`PI_REQUIRED_KEYS` = **3 键**（token / base URL / model）。
    `ANS_PI_PROVIDER` **不在**面板键集合、保存时**不写**它。
  - `src/common/pi-adapter/provider-config.ts`：`DEFAULT_PI_CONTEXT_WINDOW = 32768`；`contextWindow` **可选**
    （优先级：显式 > 环境变量 > 保守默认），缺失**不硬失败**、回落 32768，`renderContextWindowNotice` 产出可见提示；
    非法值（0 / 负 / 非数）**仍明确失败**。`ANS_PI_PROVIDER` **仍被读取**（`resolvePiProviderConfig`，缺省 `ans-gateway`）。
- **README「Pi 配置」节改后要点**：**3 项必填 + 1 项可选（收在「高级」）**——必填 = `ANTHROPIC_AUTH_TOKEN`（掩码）/
  `ANS_PI_BASE_URL`（拒回落默认端点）/ `ANS_PI_MODEL`；可选 = `ANS_PI_CONTEXT_WINDOW`（**可留空**，留空 = 不下发该键、
  Pi适配器回落**保守默认 `32768`**，缺失不硬失败、只在日志与事件流提示，填了就覆盖）；**`ANS_PI_PROVIDER` 不进面板**
  （代码有默认 `ans-gateway`、是**内部标签**；底层仍支持该环境变量，`.env` 里已有那行原样保留）。附一句默认值理由
  （须**严格大于** `reserveTokens` 16384，否则压缩阈值 ≤ 0 而退化；宁可偏小不可偏大）。「从哪填」段补一句：
  `ANS_PI_CONTEXT_WINDOW` 收在可折叠「高级」、可留空。
- **`.env.example`（本角色边界）同步**：Pi provider 段标题由泛指的「无默认值；缺失即明确失败」收窄为**端点/模型**的性质；
  `ANS_PI_CONTEXT_WINDOW` 注释由「**必填，无默认值**」改为「**可选**：留空 = 保守默认 32768、缺失不硬失败」；
  `ANS_PI_PROVIDER` 注明是**内部标签、不在面板**、底层仍支持该环境变量。
- **别处描述 Pi 配置/面板的核对**：
  - `README.md` 第 56 行「**Pi 设置**：右上「Pi 设置」面板填 Pi 配置并保存到 `.env`」——**仍准确**，未动。
  - `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` 第 715 行**仍把 `ANS_PI_PROVIDER`
    列为面板键**——**非本角色边界（pm 属主），未动、如实回报**，需 pm 同步（桌面角色 changelog 亦有同条旁注）。
  - 本角色 `角色卡/装配/{memo,changelog}.md` 里的历史 Pi 记录属**既往事实**，不回改。
- **测试同步**：`test/装配/` **无**断言 README / `.env.example` 内容的用例（grep 确认：仅读边界 YAML 与自建临时文件），**无需同步**。
- **验证（两道门）**：`npm run typecheck` → **0 错**；`node --test "test/**/*.test.ts"`（**带引号**）→ **675 tests /
  673 pass / 2 fail**；**本角色 `test/装配/` 49 pass / 0 fail**。2 红在 `test/测试/t29-pi-config-roundtrip.test.ts:75`
  与 `test/测试/t29-write-discipline.test.ts:151`（**测试角色**：因桌面把 `ANS_PI_PROVIDER` 移出 `PI_PANEL_KEYS` 而失效的旧断言，
  已排该角色修复）——**落我边界之外、未动、如实回报**。**未读 `.env`、未发真实网络请求、未打印任何凭据值**。
  来源：客户提问 + 协调方定位。

## 2026-10-11 — T42：如实登记「V1 shell 闸未接线」（两个入口；只加说明与注释，零行为改动）

派发任务 T42。背景：shell 闸三层链——**(c) 确定性硬地板 → (b) pm 审读 → (a) 客户确认**——**已实现、已测试、
逻辑验过**，但**从任何入口都到不了**：桌面**刻意不 arm**（`DESKTOP_SHELL_GATE_ARMED === false`，不注入
`ShellGate`），**CLI 入口从未注入**。**客户裁定 V1 就这样——不 arm**（V1 无 OS 沙箱，`run_shell` 起的子进程
写入**不受 `resolveWrite` 约束**，arm 风险大）。风险是那段代码**看起来像在生效**（绿灯测试加深误解）。本任务
**不删代码**（该链为将来备），只让**文档与代码都读得出来「现在没接」**。

- **`src/index.ts`（唯一运行时说明落点）**：在 `buildRoleRunDeps` 的函数文档注释内新增一段**明注**（该函数正是
  构造 `createAdapter` 的接线点）：本 CLI 入口对**任一** runtime 都**不注入 `ShellGate`**——pi 分支调
  `createPiAdapterFactory(project)` **只传 project、略去第二参 `shellGate`**（其签名 `(project, shellGate?)`），
  demo 假替身本不涉 shell；据设计 §7.5.1「能力缺席 = 最强 fail-closed」，**未注入 `ShellGate` ⇒ Pi 适配器
  根本不注册 `run_shell`** ⇒ **本入口下模型没有 shell 能力**；三层链**已实现并已测试**但**从本入口到不了**、
  **运行时不影响任何行为**。措辞显式写明：**这是客户确认的 V1 范围**（非缺陷 / 欠账）、**将来要启用须新的
  裁定**（另行评审并在此显式接线）、**不会自行启用**——并明说「别把这段读成『已经在跑』」。**无任何行为改动**
  （不注入就是不注入；未动 `createPiAdapterFactory` 调用）。
- **`README.md`「已知范围外 / 未验证」**：原条目 **`- **桌面 shell 闸 V1 不 arm**` 改写为**涵盖**两个入口**的
  条目 **`- **shell 闸三层链已实现并测试，但 V1 两个入口均未接线**`**——如实写清：`run_shell` 仅在会话构造
  路径注入 `ShellGate` 时才注册；三层链**已实现并经测试**；但 V1 **两个入口都不注入**（**桌面刻意不 arm**，
  `DESKTOP_SHELL_GATE_ARMED === false`；**CLI 入口从未注入**，见 `src/index.ts` 的 `buildRoleRunDeps`）；
  因此**模型在任何入口都没有 shell 能力**、这条链**当前不影响任何运行时行为**；并注明**客户确认的 V1 范围**
  （V1 无 OS 沙箱、`run_shell` 子进程写入不受 `resolveWrite` 约束）、**将来启用需新裁定、不会自行生效**。
  **为何改写而非另加一条**：原条目已在本节、且近义，另加会造成近乎重复——改写为**入口中立**的一条更准更省。
- **README 别处「把 shell 闸说成生效」的核对与修正**：grep README 全部 `shell`/`闸` 命中（第 134/160/162/164 行）。
  第 134 行是 pm 角色路径里的**条件名** `shell-gate`（非「已启用」主张，**未动**）；第 **160 行**「多任务派发引擎」
  条目把 `shell 闸` 列为 V1 已达成的清单项（`V1 只到「… + shell 闸」`）——**这是唯一一处读起来像「V1 含 shell 闸」**，
  已**加限定**为「`shell 闸`（三层链已实现，但 V1 两个入口均未接线，见下）」。**未发现**其他把 shell 闸写成
  「生效 / 已启用」的措辞。
- **只读核实（未动他角色文件）**：`app/main.ts`（桌面侧 `DESKTOP_SHELL_GATE_ARMED === false` ⇒ 会话构造路径
  不注入 `ShellGate`，第 265–273 行的 arm 分支恒为死分支）；`app/desktop/operator-channel.ts`（客户确认的
  「不 arm」裁定原文与理由）；`src/pipeline/orchestration/run-role.ts`（只读：`createPiAdapterFactory(project, shellGate?)`
  具接缝，`selectAdapterFactory` 经 `deps.shellGate` 转发）；`src/provider/pi/tools.ts`（只读：`buildGovernedTools`
  **仅 `shellGate !== undefined`** 时 `push(makeRunShellTool(...))`——能力缺席即不注册的结构性保证）。
- **测试同步**：`test/装配/` **无**断言 README 内容或 `src/index.ts` 注释文本的用例（grep 确认：仅 `import`/调用
  `main()` 断言 stdout 行为，注释不进输出），**无需同步**。
- **验证（两道门）**：`npm run typecheck` → **0 错**（含 `src/index.ts`，注释段类型合法）。`node --test
  "test/**/*.test.ts"`（**必须带引号**，走 Node glob）→ **621 tests / 600 pass / 21 fail**——**本角色
  `test/装配/` 全绿（49 pass / 0 fail）**；**21 个失败全在他角色边界**：`test/门禁引擎/classify-shell.test.ts`
  （15，门禁引擎）+ `test/测试/t9-block3-pin-shell.test.ts`（6，测试）。失败形态为 `classifyShellDetailed`
  返回 `deny:rules-invalid`（规则集不可用），与「shell 规则集正在被门禁引擎角色并行改动」吻合——**落在我边界
  之外，未动、如实回报**（上一轮 README 更新时基线为 621/0，故此为**并行改动的中间态**，非本任务引入；
  本任务只加注释/文档，理论与实测均不触碰 classify-shell）。**未读 `.env`、未发真实网络请求、未打印任何凭据值**。
  来源：派发任务 T42 + 客户「V1 不 arm」裁定。

## 2026-10-11 — 更新 README 至当今状态（客户指出并放行）

客户指出「readme.MD 没有更新」，`README.md` 已严重过时。本任务逐条**按代码核实后重写** README，并补定位与新增章节。
不照抄旧 README（过时）、也不照抄简报（同样可能有错）——**凡核实后与简报不符，如实纠正并回报**。

- **重写依据（实读）**：`package.json` scripts、`src/index.ts`（命令面）、`src/interface/cli/{run,govern}.ts`、
  `app/{main.ts,desktop/*}`、七个角色 `boundary.yaml`、`src/pipeline/orchestration/govern-session.ts`、
  `src/common/编排/{finalize,shell-gate}.ts`、`src/common/门禁引擎/classify-shell.ts`、设计文档
  `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`、以及既有 changelog。
- **新 README 结构**：①`ANS 是什么`（role-first/RFSG × Pi，三点逐字取自技能 README，`ANS` 是名字非缩写）
  ②`这是什么`（核心主张 + 分层：入口→Interface→Pipeline→Service→Provider）
  ③`快速开始`（桌面主推路径 / CLI / **两道门**）④`Pi 配置`（面板键、从哪填、CLI 怎么读）
  ⑤`角色链`（su 对话式 bootstrap、收口需确认、每轮 settle 自动重 pin、回交）
  ⑥`命令表`（删 `ans init`）⑦`目录与职责`（**全 7 角色** + `src/common/shared/` 共享组件）
  ⑧`安全与凭据` ⑨`已知范围外 / 未验证`。
- **删掉的不成立说法**：`ans govern`「最小占位链路」→ 已是**真治理会话**且**接受目标目录**；
  「真实 Pi 适配器**尚未真实跑通**」→ 改为如实（此前已跑通一次、此后改动多、**未再复验**，标「未验证」）；
  「不产生 `docs/scheduling/` 记录（F3 偏离）」→ 该偏离已被取代，删去该段与整节「契约 §7 演示输出」；
  「免 `npm install`」→ **不成立**（运行需 `yaml`，Pi 路径需 Pi SDK）；旧「桌面应用（Electron）」那节只讲
  怎么跑起来 → 改为讲**产品本身**（工作台：导入 / su 对话 / 收口确认 / Pi 设置 / 角色资料栏）。
- **核实后纠正旧 README 与简报**：①项目**全 7 个角色**（多「桌面应用」）——但 `src/index.ts` 的
  **内嵌演示配置确为 6 角色**（`DEMO_ROLES` 不含桌面应用，`test/装配/config.test.ts` 亦如此断言）；
  故旧 README 两处「六角色」描述的是**演示配置**、**并不算错**（简报称两处都应改 7，实为只有
  「项目角色数」那层需讲成 7）。②shell 闸三层链**已实现**，但**默认入口未 arm**：桌面 V1 刻意不注入
  `ShellGate`（`DESKTOP_SHELL_GATE_ARMED === false`），**CLI 入口当前亦未注入**——故写「未注入即
  `run_shell` 不注册」，**不夸大成「已 arm」**。
- **顺带修（本角色文件、纯文案）**：`src/index.ts` 的 `USAGE` 里 `ans govern [...]  治理 bootstrap 会话（占位链路）`
  与首行「（v1 原型）」仍陈旧——改为**真治理会话**、**接受目标目录**的描述。**无行为改动**（无测试断言该文案；
  `test/测试/real-entry.test.ts` 仅断言 govern 用法错误的**退出码**）。
- **验证（两道门）**：`node --test "test/**/*.test.ts"`（**必须带引号**）→ **621 tests / 621 pass / 0 fail**；
  `npm run typecheck` → **0 错**。`test/装配/` 内**无**断言 README 内容的用例（grep 确认），无需同步。
- **未读 `.env`、未发真实网络请求、未打印任何凭据值**。来源：客户「readme.MD 没有更新」+ 协调方补充定位（role-first × Pi）。

## 2026-10-11 — T34：`ans govern <目标目录>` 的 `projectRoot` 真正生效（缺目录即明确报错）

派发任务 T34（设计 §12.3/§12.7）。原 `ans govern` **不取目标目录**——只在装配注入的 project
（`resolveProjectRoot()` = ans-cli 自身）上工作，CLI 连「对某个空文件夹做 bootstrap」都办不到（§12.1-3）。
T32（编排）已解析位置参数并导出 §6 安全的出口 `resolveGovernTargetDir(argv, deps?)`（argv 位置参数优先于
`deps.targetDir`）。装配的作用是**据它把注入的 `project.projectRoot` 设为 `path.resolve(dir)`**。

- **接线（`src/index.ts` govern 分支）**：`const targetDir = mod.resolveGovernTargetDir(invocation.argv)`——
  经由**动态导入**的 `govern.ts` 出口取值，**不**导入编排私有的 `src/common/编排/args.ts`（入口本已动态导入
  `govern.ts`，故该出口用起来 §6 安全）。据此 `loadInjection(targetDir)` 注入；`governCommand` 照原样调用。
- **`projectRoot` 设置（`loadInjection(targetDir?)`）**：给出目录 → `projectRoot = path.resolve(targetDir)`
  （绝对化）；缺省 → `resolveProjectRoot()`（ans-cli 自身，行为不变）。显式目标目录**优先于** `.ans/project.json`
  自带的 `projectRoot`——用户 `ans govern <dir>` 意在为「那个」目录 bootstrap。为便于测试直接断言注入结果，
  `loadInjection` 由私有改为**导出**（main 的 govern 分支缺 Pi 凭据会先失败，测试无法走完整链路）。
- **回退根（`loadConfig(projectRoot)`）**：`projectRoot` 改为入参（缺省仍 `resolveProjectRoot()`）；无 `.ans`
  时的**内置回退**也把 `projectRoot` 覆为该生效根——否则 `ans govern <空目录>`（尚无 `.ans`）会回退到 ans-cli，
  写入落在工具自身而非目标目录（正是本任务要修的）。doctor / role run 不传参，行为逐字不变。
- **目录不存在/非目录——判断与选择（`validateGovernTargetDir`）**：**明确报错、返回退出码 2、不静默回退 ans-cli**。
  理由：①「空文件夹 → 与 su 对话 → su 建角色」这一客户场景里，目标目录**本就存在**（用户导入/新建的空目录），
  目录不存在**多半是笔误**；②静默回退会把「对空目录 bootstrap」变成「对工具自身（ans-cli 仓库）bootstrap」——
  这是最坏的一类静默降级（§12.1 的根因正是它）；③**不新建目录**——建目录本身亦是一次应受治理的写，且会让
  拼写错误的路径被静默创建。给出但**不是目录**（是文件）同样报错。退出码取 2（用法/入参错误），与既有
  「非法 `--runtime` → 2」同档。
- **顺带清注释（本角色文件）**：`src/common/装配/config-loader.ts` 顶部文档注释里的**导入点清单**仍列着
  **已删**的 `test/编排/bootstrap.test.ts`（T32 删）——移除之；并据现状把清单校正为**现存两处**
  （`src/index.ts`、`test/装配/config-loader.test.ts`；原列的 `test/编排/govern.test.ts`、
  `test/编排/govern-engine.test.ts` 已改从共享模块导入，不再是本转发路径的消费点）。
- **测试（`test/装配/govern-target.test.ts`，新增 8 例）**：①目标目录 → `projectRoot` 即该目录（绝对化）；
  ②相对路径 → 绝对化（相对 cwd）；③缺省 → 仍 ans-cli 自身；④目标目录含 `.ans/project.json` → 角色照常载入且
  `projectRoot` 仍取目标目录；⑤显式目录优先于 `.ans` 自带 `projectRoot`；⑥不存在的目录 → 码 2 且 stderr 明说
  「不会回退 ans-cli」；⑦非目录（文件）→ 码 2；⑧存在的目录 → 目录校验放行、缺 Pi 凭据时如实非 0。
  该测试的 `capture()` **只劫持 stderr**——`node:test` 报告器自己也写 `process.stdout`，替换它会令报告器丢行、
  表现为「测试数偏少」（已实证并规避）。
- **验证**：`node --test test/装配/*.test.ts` → **49 pass / 0 fail**；全量 `node --test "test/**/*.test.ts"`
  （带引号）→ **572 tests / 570 pass / 2 fail**（2 失败均在 `test/测试/t9-block1-bootstrap.test.ts`——测试角色
  边界、用已退役的 `bootstrap` 选项，属 **T35**，未改他角色文件）；`npm run typecheck` → **装配边界 0 错**
  （1 错在 `test/测试/t9-block1-bootstrap.test.ts:90`，他角色）。来源：设计 §12.3/§12.7 T34。

## 2026-10-11 — T24 消费共享模块：`runtime.ts`/`index.ts` 删本地副本，改从 `runtime-shared.ts` 导入

派发任务 T24（设计 §3.11-2/3/4）。pm（T23）已建 `src/common/shared/runtime-shared.ts`（**属主项目管理，只读**），
把 §6 逼出的三处镜像收成单一来源：`RuntimeKind`/`RUNTIME_KINDS`/`DEFAULT_RUNTIME`、`PI_CREDENTIAL_ENV_VARS`、
`resolveSkillRoot(env?)`。装配改为只读导入并**删本地副本**，行为逐字不变。

- **`src/common/装配/runtime.ts`**：删本地 `export type RuntimeKind = "demo" | "pi"`、`export const DEFAULT_RUNTIME`、
  `export const PI_CREDENTIAL_ENV_VARS`。改从 `../shared/runtime-shared.ts` 导入后**按原名再导出**
  （`export type { RuntimeKind }` / `export { DEFAULT_RUNTIME, PI_CREDENTIAL_ENV_VARS }`），使本模块公开面不变。
  `RUNTIME_VALUES`（非 pm 点名项，但同物）改为 `RUNTIME_KINDS` 的别名：`export const RUNTIME_VALUES: readonly RuntimeKind[] = RUNTIME_KINDS;`
  ——**不再自持第二份取值**。`extractRuntimeArg`/`resolveRuntime`/`hasPiCredential` 逻辑一字未动。
- **`src/index.ts`**：删本地 `resolveSkillRoot()`（连同只服务于它的 `import os from "node:os"`），改从
  `./common/shared/runtime-shared.ts` 导入并在原位置 `export { resolveSkillRoot }`（公开面不变）；`PI_CREDENTIAL_ENV_VARS`
  的导入由 `./common/装配/runtime.ts` 改指共享模块。两处调用点（`buildDemoProjectConfig`/`loadConfig`）仍写 `resolveSkillRoot()`，
  走 shared 默认参数读 `process.env`，语义不变。
- **为何用「再导出」而非彻底删除导出**：pm 的收敛窗口期一致性核对测试 `test/项目管理/shared/runtime-shared.test.ts`
  （**非本角色边界，未动**）**只读导入** `RUNTIME_VALUES`/`DEFAULT_RUNTIME`/`PI_CREDENTIAL_ENV_VARS` 自本模块以核对旧副本取值。
  再导出使其**照旧解析**，且因指向单一来源，取值天然不分叉。**未新增任何第三形状**。
- **行为逐字不变的确认**：①原 `test/装配/runtime.test.ts`、`test/装配/entry.test.ts`（经 `PI_CREDENTIAL_ENV_VARS` 清洗凭据）未改即通过；
  ②pm 的 `runtime-shared.test.ts` 6 例（含「shared 与装配旧副本一致」）全过——证明再导出取值等于 shared；
  ③全量测试通过数与基线一致（445）。
- **桌面侧镜像（只回报，未动）**：`app/desktop/project.ts:22` 仍有一份**逐字** `resolveSkillRoot(env = process.env)`
  本地实现（第 22–26 行），与 `runtime-shared.ts` 的第 45–49 行同源；另有 `app/desktop/session.ts:36` 的本地
  `RuntimeKind`。**归 T22（桌面应用）**，非本角色边界，不改。
- **验证**：`node --test test/装配/*.test.ts` → **41 pass / 0 fail**；全量 `node --test "test/**/*.test.ts"` →
  **445 pass / 0 fail**；`npm run typecheck` → **装配边界 0 错**（余错在 `src/common/pi-adapter/real-adapter.ts`、
  `test/桌面应用/*`、`test/编排/*`，均他角色，未动）。来源：设计 §3.11-2/3/4 与派发清单 T24。

## 2026-10-11 — 建立类型门禁：装 `typescript`、跑通 `typecheck`、清掉 `src/index.ts` 对已删 `init` 模块的引用

派发任务「把类型门禁真正建起来」。此前 `package.json` 早有 `"typecheck": "tsc --noEmit"`，但 `typescript`
**从未安装**——脚本是**空承诺**，从未生效（`node --test` 靠类型擦除，不看类型；T14 给 `ProjectListing`
加字段后桌面应用构造处未同步，无人报错）。

- **安装 `typescript`（诚实交代）**：本机 `registry.npmjs.org` **不可达**——`npm install` 报
  `ECONNRESET`；`curl` 直连亦 `failed to receive handshake`，`npmmirror` 报 `CRYPT_E_REVOCATION_OFFLINE`
  （证书吊销在线校验失败）。**关沙箱重试仍失败**，故为真实网络限制而非沙箱所致。改用可达的镜像
  `npm install -D typescript --registry https://registry.npmmirror.com` → 装得 **`typescript@7.0.2`**
  （即 npm `latest`，已核对 dist-tags `latest: '7.0.2'`）。`node_modules/.bin/tsc --version` → `Version 7.0.2`。
  **替代方案（若客户网络同样受限）**：在可联网机 `npm install -D typescript` 后提交 lockfile，或
  为该机配置可达的 npm 镜像。**未伪造“已装好”**。
- **`package-lock.json` 归一**：镜像安装把 **21 条** `resolved` 写成 `registry.npmmirror.com`
  （typescript 7 的 `@typescript/typescript-<platform>` 平台包 + `typescript` 本体），而 lockfile 其余
  **176 条仍为 `registry.npmjs.org`**——混注册表会使 `npm ci` 不可移植。已用脚本**逐条归一**回
  `registry.npmjs.org`（路径结构与 npmjs 一致，`integrity` 不变），JSON 校验通过。**边界说明**：
  `package-lock.json` **未列在** `角色卡/装配/boundary.yaml` Section 1，但它是 `package.json`（本角色，
  用途「依赖与脚本」）依赖管理的必然产物；已在报告中请 Governance 考虑显式纳入边界。
- **`tsconfig.json`（改动最小、不降档）**：核对现实——零构建、直接跑 `.ts`、Node 原生擦除、ESM。
  既有配置**已正确**：`allowImportingTsExtensions: true`（源码 import 带 `.ts` 后缀）、`noEmit: true`、
  `module`/`moduleResolution: nodenext`、`verbatimModuleSyntax`、`erasableSyntaxOnly`（与 Node 只擦除
  「可擦除语法」一致）、`isolatedModules`、`types: ["node"]`（`@types/node@26.6.5` 在位）。**唯一改动：
  `include` 由 `["src","test"]` 增为 `["src","test","app"]`**——此前 `app/` 仅经传递导入被检查，未导入
  的桌面应用文件会**漏检**；显式纳入后覆盖面与 T14 漏网那类错误对齐（实测加入后错误数**不变**，即
  `app/` 本已基本被覆盖，此举仅堵住未来的漏网）。**strict 档位：保持 `strict: true`，不降档**——实测
  全仓仅 **12 处**错误，不构成“海量噪声”，**没有理由关到底**；若强开 `noUncheckedIndexedAccess` 才会
  引入成片索引噪声，故**未加**。
- **`npm run typecheck` 结果：全部错误在他角色边界；装配边界 0 处**。首跑 **12 处**；会话期间（本仓多角色并行）**编排**自修了 `bootstrap.test.ts` 的 init 引用 → **末跑 11 处**。以下按角色归类（末跑快照）：
  - **桌面应用 1**：`app/desktop/session.ts:239` `TS2345` `OrchestrationEvent` 不能赋给 `SessionEvent`（`kind` 判别不兼容）。
  - **Pi适配器 1**：`src/common/pi-adapter/real-adapter.ts:234` `TS2353` 字面量含未知属性 `toolCallId`（目标类型 `{name,args}`）。
  - **测试 2**：`test/测试/f7-symlink.test.ts:58,64` `TS2345` `entries[].root: string` 不是 `Root`。
  - **编排 5→4**：`test/编排/bootstrap.test.ts:198` `TS2307` 找不到**已删**的 `src/interface/cli/init.ts`（**会话期间已由编排自行修复**）；`test/编排/shell-review-chain.test.ts:418,421,424` `TS18049` 值可能为 null/undefined（×3）、`:487` `TS2769` 重载不匹配。
  - **门禁引擎 3**：`test/门禁引擎/pin-acceptance.test.ts:129,145,154` `TS2345` `string|undefined` 不能赋给 `string`。
  - **装配 0**：本角色边界内**无错误**（下述 init 清理即修掉了 `src/index.ts:382` 唯一一处）。
- **清除对已删 `init` 模块的引用（协调方同批指令，编排 T16 已删 `src/interface/cli/init.ts`）**：
  - `src/common/装配/cli-parse.ts`：`Invocation` 联合**删除 `init` kind**、删 `"init"` 解析分支与文档行。
    结果 `ans init` 落到**既有**「未知命令」分支（`未知命令：init` → 退出码 **2**）。
  - `src/index.ts`：删 `case "init"` 分发块（含 `mod.initCommand` 强转与 `reportUnavailable("init")`）；
    help 文本删 `ans init [...] 初始化` 行；头部职责注释、`loadInjection`/`ConfigInjection` 注释同步为「仅 govern」。
  - `test/装配/cli-parse.test.ts`：把 `init → {kind:"init"}` 断言改为 `init → unknown`。
  - `README.md`（命令表 + 层间句柄句）与 `src/common/装配/config-loader.ts`（转发点清单，原列了已不存在
    的 `init.ts` / `test/编排/init.test.ts`）一并去 init。
  - **未动** `test/测试/real-entry.test.ts` 的 init 断言（属测试角色，已排 T18）。
- **测试**：`node --test test/装配/*.test.ts` — **41 pass / 0 fail**（较前 40 增 1，即新增的 `init→unknown` 用例）。
  全量 `node --test "test/**/*.test.ts"`：**本角色跑时为 446 总 / 445 pass / 1 fail**，**该失败** = `test/测试/real-entry.test.ts:97`
  「`ans init <临时目录>` 以 0 结束」正例——即删除 init 子命令的**预期后果**，**归测试角色 T18**（同文件 `:89`
  「无参 init 以 2 结束」因 unknown 恰好也是 2 而**仍通过**）。**会话末**测试角色已并行落地 T18（改写 init 断言）→
  全量转为 **445 总 / 445 pass / 0 fail**。未读 `.env`、未打印凭据。
- **两道门（本仓库）**：①**全量测试** `node --test "test/**/*.test.ts"`（**必须带引号**，走 Node 自身 glob，覆盖
  `test/项目管理/shared/` 等三层路径；`test/*/*.test.ts` 两层写法会漏）；②**`npm run typecheck`**。二者是
  装配每次交付的验证基线。
- **建议（未擅自改他角色文件；`package.json` 属本角色，此处**仅建议**不改）**：在 `package.json` 加组合脚本
  如 `"verify": "npm run typecheck && node --test \"test/**/*.test.ts\""`，或将其接入 CI/提交钩子，令两道门
  一键可跑。**现状**：`verify` 会因 ~11 处他角色类型错误（随他角色修复递减）与 1 处 T18 测试失败而**为红**——这正是门禁**在做本职**
  （在上述错误派发修复前不应变绿）。

## 2026-10-11 — T12：去掉 `config-loader` 的重复实现（旧路径改纯转发，采方案 (a)）

按设计 `2026-10-11_design_v1-full-implementation.md` §3.10 与派发清单 T12 行实现。
共享组件 `src/common/shared/config-loader.ts` 由 T11 从装配私有 `src/common/装配/config-loader.ts`
**整体搬迁**而来（搬迁非 fork）。工程法案 §一.5 与 `docs/architecture/shared-components.md` 要求消费方
**只读导入、不得留第二份实现**。本任务由装配收敛旧路径（pm 不能动装配边界）。

- **采用的方案：(a) 薄转发**。`src/common/装配/config-loader.ts` 改为一行
  `export * from "../shared/config-loader.ts";`（上方为说明性注释），**删除本地全部实现**
  （`loadEffectiveConfig` / `enforcePinBackedAcceptance` / `ansProjectPath` / 常量 / 类型 / 全部私有解析函数）。
- **不采 (b)（删文件 + 改导入）的理由**：方案 (b) 需改 4 处 import，其中 `src/interface/cli/init.ts`
  **不属于装配边界**、`test/编排/init.test.ts` **属编排边界**——选 (b) 须回报并请编排自查；而 (a) 只动
  **本角色边界内**的一个文件，四个消费点（`src/index.ts`、`src/interface/cli/init.ts`、
  `test/装配/config-loader.test.ts`、`test/编排/init.test.ts`）导入路径**照旧解析、零改动**。设计 §3.10 与 pm 的
  change 记录亦明列「re-export 薄转发」为许可选项。故 (a) 面上更小、兼容更好、免跨角色协调。
- **搬迁前逐字核实**：`diff` 比对两文件代码体（旧自第 20 行、新自第 30 行起）→ **逐字相同**，仅顶部 `//` 头注释不同。
- **行为不变（硬要求）**：转发使消费方解析到的正是共享文件——即搬迁前**同一份代码**。两条 fail-closed 原样保留：
  ①`.ans` 存在且 `accepted:true` 无 pin → 置未接受并清空 source；②`.ans` 存在但不可解析 → 未接受、**绝不**回退演示 acceptance。
  `test/装配/config-loader.test.ts`（经旧路径导入）**未改一行**仍全绿，即证转发解析正确、行为等价。
- **无第二份实现**：grep 确认 `loadEffectiveConfig`、`enforcePinBackedAcceptance`、`ansProjectPath` 及
  `parseAcceptance`/`parsePin`/`parseRoles`/`buildFromAns`/`invalidConfig`/`fallbackSource` **仅存于**共享文件。
- **测试**：`node --test test/装配/*.test.ts` — **40 pass / 0 fail**；
  全量 `node --test "test/**/*.test.ts"`（含三层路径如 `test/项目管理/shared/`）— **343 pass / 0 fail**（与基线一致）。
- **跨角色协调**：**无**（采 (a)，未触碰编排边界）。若日后要彻底删除旧路径（方案 b），须另请编排同步改 `test/编排/init.test.ts`。

## 2026-10-11 — T2：加载 `.ans/project.json` + 为 init/govern 补配置注入（含「无 pin 即未接受」fail-closed）

按设计 `2026-10-11_design_v1-full-implementation.md` §3.3/§3.8/§5.3/§2.5 与派发清单 T2 行实现。

- **`.ans` 加载落点**：新增 `src/common/装配/config-loader.ts`——`loadEffectiveConfig()` 读 `<projectRoot>/.ans/project.json`，
  取出 `roles`（仅保留 card/boundary 均为非空字符串的条目）、`governanceBoundary`、`pins`、`acceptance` 注入为
  `ProjectConfig`；`LoadConfigOptions.fallback` 为缺文件时的现行为兜底。形状：`governanceBoundary:{path,acceptance}`，
  `acceptance` 可内联 `pin`，也可顶层 `pins` 兜底（`PinEntry={path,sha256}`，与门禁引擎 T1 形状一致）。
- **「无 pin 即未接受」的强制点**：`config-loader.ts::enforcePinBackedAcceptance()`——`accepted===true` 且 `pin` 非非空数组 →
  置于 `{accepted:false, source:""}`（同时清空 source，与引擎 `unaccepted()` 一致），并在 `ConfigSource.downgradeReason` 留因。
  **凡经 `.ans` 载入的 acceptance 一律适用**，无自填例外标记——`parseAcceptance()` 在载入路径上无条件调用它。
  本层只判「**有没有 pin**」；「**pin 对不对**」（逐文件 SHA-256）仍是门禁引擎 `boundary-core.ts::verifyPins` 在其上加的一层。
- **两个登记的非-pin 例外（写死理由）**：(1) `src/index.ts::DEMO_ACCEPTANCE`——CLI 演示内嵌配置，**注释里写死**其为
  设计 §3.3 登记例外（原型演示替身、本进程内嵌纯值、不经 `.ans` 载入、故无也不该有客户 pin）；(2) 桌面应用导入的运行期同意
  （属 T10，非本角色）。二者外**没有第三档**。
- **缺 `.ans` 回退**：无 `.ans/project.json` → 回退 `buildDemoProjectConfig()`（现行为，**不放松**）；`.ans` 存在但不可解析
  → **fail-closed** 未接受（**不**回退演示 acceptance，避免「损坏的 .ans 换来一份已接受」）。全项目当前无 `.ans`，故既有测试照常。
- **配置注入通道**：`src/index.ts` 为 `govern` / `init` 以**超集第二参** `ConfigInjection{project, configSource}` 注入（`governCommand`/`initCommand`
  的契约 §5 冻结签名只收 argv，是 govern 占位码 2 的根因；按设计 §3.2 由装配补通道，编排侧 T4/T5 接收）。**编排接收前占位行为不变**——`ans govern` 仍码 2、`ans init` 仍码 0（`test/测试/real-entry.test.ts` 明列此二断言）。
- **doctor 打印 pin 来源**：新增行 `配置来源:`（`.ans` 路径 / 内置回退）、`acceptance: accepted=...`、`pin 来源:`（N 条 pin 及路径，或如实标注非-pin 例外 / 已降级）；保留既有 `边界接受来源:` 行与角色表。
- **测试**：新增 `test/装配/config-loader.test.ts`（10 例）：`.ans` 合法带 pin → 注入正确；`accepted:true` 无 pin → 置为未接受；
  pin 与 hash 不符 → 引擎判未接受（载入层保留 pin）；无 `.ans` → 回退不崩；`.ans` 不可解析 → fail-closed；doctor 打印来源与 pin。
- **验证**：`node --test test/装配/*.test.ts` — **40 pass / 0 fail**；全量 `node --test test/*/*.test.ts` — **271 pass / 0 fail**。
  手动 `doctor` 在临时 `.ans` 下打印「配置来源: .ans/project.json」「pin 来源: 1 条 pin」，核后已 `rm -rf .ans`（未留残留）。未读 `.env`、未打印凭据。
- **跨角色协调**：T4（编排）产出的 `.ans/project.json` **shape 须与本 T2 载入器一致**（`roles`/`governanceBoundary.path`/`acceptance.pin`，且按 §3.3 写 `accepted:true`+逐文件 `pin`）；`governCommand`/`initCommand` 须由 T5/T4 加收该第二参方能「不再码 2」。

## 2026-10-11 — 同步 .env.example 的 ANS_PI_CONTEXT_WINDOW 注释到 Pi 适配器新策略（必填 / fail-closed）

Pi适配器角色把 `ANS_PI_CONTEXT_WINDOW` 由「可选、缺失沿用模板值并告警」改为**必填、缺失即明确失败**
（与 `ANS_PI_BASE_URL`/`ANS_PI_MODEL` 同一 fail-closed 策略）。本角色据其实现
`src/common/pi-adapter/provider-config.ts` 的 `resolvePiProviderConfig`（**只读**）同步 `.env.example` 注释。

- **改后注释**（`` `` 省略反引号包裹）：
  「真实模型的上下文窗口（tokens）。**必填，无默认值**：缺失即明确失败（fail-closed），
  与 baseUrl/model 同一策略，绝不回落到模板值。模型克隆自 anthropic 模板，其 contextWindow
  为 1,000,000，与网关上的真实模型无关；沿用模板值会让 Pi 的自动上下文压缩阈值永远够不着，
  长会话会先收到服务端超长报错，而不是优雅压缩。请填写网关真实模型的上下文窗口。示例：131072」
- **依据**：`resolvePiProviderConfig` 在缺 `contextWindow` 时抛错（位置紧跟缺 `modelId` 之后、缺凭据之前），
  错误信息让用户设 `opts.contextWindow` / 环境变量 `ANS_PI_CONTEXT_WINDOW`，并说明模板值 1,000,000 与网关真实模型无关。
  删除了原文「不设则沿用模板的 1,000,000」的表述，改为与 baseUrl/model 同风格的 fail-closed。
- **透传**：无需改动 `bin/ans.js` / `src/index.ts`（沿 `node --env-file=.env` + `resolvePiProviderConfig(opts, process.env)` 的既有路径）。
- **测试**：`test/装配/` 下无断言 `.env.example` 内容的用例，**无需同步**（未改测试）。
- **验证**：`node --test test/装配/*.test.ts` — **34 pass / 0 fail**。未读 `.env`，未打印任何凭据。

## 2026-10-11 — .env.example 记录 ANS_PI_CONTEXT_WINDOW（顶层越界改动，经本角色复核采纳）

顶层会话越过角色边界，直接改了本角色所属的 `.env.example`（「Pi provider」段新增 `ANS_PI_CONTEXT_WINDOW`）。
按客户决定「代码保留、由负责角色复核并补记录」，本角色独立复核后采纳，并补此记录。

- **要点**：`.env.example` 新增 `ANS_PI_CONTEXT_WINDOW=`（真实模型的上下文窗口，tokens；注释示例 131072），
  与 `src/common/pi-adapter/provider-config.ts` 读取的环境变量名 `ANS_PI_CONTEXT_WINDOW` **拼写一致**。
  行为与 `parseContextWindow` 一致：未设（或空白）→ 返回 undefined → real-adapter 沿用 anthropic 模板的
  1,000,000 并告警；非法值（非正数/非有限）→ 明确抛错、fail-closed。
- **透传**：**无需改动** `bin/ans.js` / `src/index.ts`。`src/provider/pi/session.ts` 以
  `resolvePiProviderConfig(opts, process.env)` 直读 `process.env`，配合 `node --env-file=.env` 自然生效
  （与 `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_PROVIDER` 同一路径）。
- **安全**：`.gitignore` 第 2 行确为 `.env`——凭据只落 `.env`、不入库；`.env.example` 仅含占位符，可入库。
- **验证**：`node --test test/装配/*.test.ts` — 34 pass / 0 fail。
