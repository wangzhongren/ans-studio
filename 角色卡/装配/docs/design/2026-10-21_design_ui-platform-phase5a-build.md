---
id: ui-platform-phase5a-build-20261021
type: design
title: UI 平台化 Phase 5A/5B 装配计划：本地构建、打包与 packaged 冒烟（不接发布流水线）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: proposed
related: [ui-platform-round, ui-platform-round-review]
---

# Phase 5A/5B 装配计划：本地 build → package → 冒烟

依据：PM 评审 revision 10 §十六「Phase 5 授权（5A→5B）」、§16.3 硬顺序、§16.4 角色写集、§16.6 约束（M1：**不接发布流水线；不改 release.yml / release-policy；零新依赖 / DOM 例外；5A 前不得删除旧渲染器 / 旧测试 / vendor**）。本文只写装配侧计划，不含实现代码；实现按阶段派发后仅在装配 Section 1 白名单内落盘。

## 一、只读核对到的现状（计划的事实基础）

| 事实 | 现状 | 对 Phase 5 的含义 |
| --- | --- | --- |
| Vite 构建 | `vite.config.ts`：`root: app/renderer`、`base: "./"`、入口 `app/renderer/src/index.html`、`outDir: dist`、`emptyOutDir: true`、`modulePreload.polyfill: false`、`target: chrome152` | 产物在 **`app/renderer/dist/`**；由于入口在 `src/` 下，HTML 实际落在 **`dist/src/index.html`**（已验证存在），资源在 `dist/assets/` |
| 生产 CSP | 由 `app/renderer/src/index.html` 的 meta 提供，build 不改写；仅 dev serve 放宽 | 打包必须验证 dist HTML 保留生产 CSP 且无内联脚本 |
| 打包配置 | `electron-builder.yml`：`files: app/**/*`、`src/**/*`、`bin/**/*`、`package.json`、`LICENSE`；排除 `.env*`、`.ans`、`*.log/*.map`、`test`；`asar: false`；`output: release-output`；`publish: null` | **dist 通过 `app/**/*` 自动入包**（物理存在即可，不依赖 git）；sourcemap 与测试不入包；`publish: null` 防误发 |
| 忽略规则 | `.gitignore` 已含 **`app/renderer/dist/`** 与 **`release-output/`** | dist 不入库；本地打包输出天然被忽略，无需新增忽略条目 |
| 生产加载路径（当前） | `app/main.ts:211` `win.loadFile(path.join(HERE, "renderer", "index.html"))` —— 旧渲染器 | **5B 切换点归桌面窗口**；必须与 Vite 入口/产物路径同批对齐（见 §二、§七） |
| packaged 冒烟能力 | `app/main.ts` 支持 `--ans-packaged-smoke <abs result> --user-data-dir=<abs>`；`app/desktop/packaged-smoke.ts` 校验 DOM/preload/IPC/envPath | 能力已有；但脚本现绑定**旧渲染器 DOM**（`.app`、`#runtime-select`、`#tab-pi`、`#right-drawer`、`#drawer-close`），5B 前须由桌面窗口按新契约面重锚 |
| 发布校验 | `release-verify.mjs` 读取仓库根 **`release-provenance.json`**（由 `release-prepare` 在 overlay 克隆内生成），校验 ZIP + 原生冒烟 | **不能直接复用于本地**（本地无 provenance，且 release 配方指向 v1.4.0；policy 对未列名 `app/` 变更 fail-closed） |
| release 配方 | `release-policy.mjs`：`SOURCE_REF=v1.4.0`、`SOURCE_SHA=83eec7e…`、白名单 files=package.json/package-lock.json/release.yml、dirs=src/common/装配/、test/装配/ | Phase 5 **不运行 `release:prepare`**、不改 policy/workflow；新冻结源发布轮由客户另行决定 |

## 二、本地 build → package 顺序（5A dry run 与 5B 均适用）

硬顺序，任一步失败即停：

1. **前置检查**：`node_modules` 与 lock 同步（`npm ci --dry-run` 或 `npm ls` 摘要）；`git status` 记录打包面（生产入口切换批应零 `app/` 未评审外溢）。
2. **`npm run typecheck` ＋ `npm run typecheck:renderer`**：两道类型门先过（PM §六 Phase 1 口径：发布/本地验证都应组合根与渲染层 typecheck）。
3. **`npm run build:renderer`**：Vite 重建 `app/renderer/dist/`（`emptyOutDir` 清旧产物，避免陈旧文件入包）。
4. **dist 静态校验**：`dist/src/index.html` 存在且引用 `../assets/` 相对路径；保留生产 CSP meta；无内联 `<script>`/`<style>`；无 `*.map`；记录入口 HTML 与主 JS/CSS 的 sha256 与大小（预算复核仍按 Q11 ≤300KB gzip 口径，由测试在 Phase 5 复核）。
5. **`npm run package:local`**（新增脚本，见 §三）：脚本内部再次执行 build 以保证顺序不可绕过，然后 `electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`。
6. **`npm run verify:local`**（新增脚本，见 §三/§五）：解包 + 内容断言 + packaged smoke + 本地证据写盘。
7. **证据落盘**：`release-output/local/`（gitignored）内仅保存本地证据；**不生成 release 命名**（不写 `manifest-<platform>-<arch>.json` / `SHA256SUMS-overlay.txt`），避免与发布产物混淆。

关键约束：
- **dist 必须由本次 build 产生**：dist 不入库，electron-builder 从工作树取 `app/**/*`；`package:local` 内嵌 build 是防「陈旧 dist 入包」的硬保证。
- 5A dry run 时生产入口仍是旧渲染器：打包的 `main.ts` 仍加载 `renderer/index.html`，packaged smoke 以旧 DOM 为基线应通过——用于证明「打包链路本身可用」，**不证明新入口**。
- 5B 切换后同链路重跑，packaged smoke 以新契约面为准（见 §七）。

## 三、scripts 调整建议（5B 最终语义）

| 脚本 | 现状 | 5B 建议语义 | 变更 |
| --- | --- | --- | --- |
| `app` | `electron app/main.ts` | 保持命令不变；**语义由 main.ts 决定**：`app.isPackaged` → `renderer/dist/<入口>`；未打包且设 `ANS_DEV_SERVER_URL` → `loadURL(该地址)`（配 `dev:renderer` 的 HMR）；未打包且未设 → `renderer/dist/<入口>`（需先 build） | 脚本不改；桌面窗口改 main.ts |
| `dev:renderer` | `vite --config vite.config.ts` | 不变：只开 Vite dev server（5199，strictPort），供 `ANS_DEV_SERVER_URL=http://localhost:5199/src/index.html` 配对使用（入口路径随 §七 决策同步） | 不变 |
| `build:renderer` | `vite build --config vite.config.ts` | 不变：唯一生产构建入口；5B 若入口迁到 `app/renderer/index.html` 则仅改 `vite.config.ts` 的 `input` | vite.config 可能改 |
| `preview:renderer` | `vite preview --config vite.config.ts` | 不变：开发者静态预览 dist；**不作为 packaged 冒烟替代**（不经 `file://` 与 Electron） | 不变 |
| `typecheck:renderer` | `tsc -p app/renderer/tsconfig.json` | 不变 | 不变 |
| `package` | `electron-builder --config electron-builder.yml` | **保持原样**——发布流水线（`release.yml`）使用它；M1 下不改 | 不变 |
| `package:local`（新增） | — | `npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local` | 新增 |
| `verify:local`（新增） | — | `node src/common/装配/verify-local-package.mjs release-output/local`；本地专用校验（不读 `release-provenance.json`、不写 release 命名、不上传） | 新增（新文件在 `src/common/装配/`，本角色私有目录） |
| `release:prepare` / `release:verify` | 既有 | **不动**；Phase 5 不运行（M1） | 不变 |

不建议新增 `dev:app`/`start:app` 等编排脚本：需要并发进程管理，引入新依赖（违反零新依赖）；由 README 记录「先 `dev:renderer`，再带 `ANS_DEV_SERVER_URL` 运行 `app`」即可。

## 四、release 配方不动的落地口径

- 不修改 `.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` / `.d.mts`、`release-prepare.mjs` / `release-verify.mjs` 的行为；`package` 脚本保持原样。
- 本地打包只写 `release-output/local/`（`.gitignore` 已覆盖 `release-output/`）；不写入 `.release/`（release-prepare 的临时区），不生成 provenance/overlay。
- `electron-builder.yml` 的 `publish: null` ＋ CLI `--publish never` 双保险；不调用 `gh release` / 不接触任何凭据。
- 新冻结源的发布轮（含在 CI 中补 `build:renderer` 前置）由客户另行决定；本次计划**只**为 Phase 5 本地验证。
- 注意：`src/common/装配/` 在 release overlay 目录白名单内——新增的 `verify-local-package.mjs` 会随以后冻结源自然带入，属惰性本地工具，不改变发布行为；若 PM 要求发布面零新增文件，可改放 `test/装配/`（测试角色边界）或接受该文件随源进入。

## 五、本地打包 dry run 与产物校验计划

**输出与隔离**
- 输出目录：`release-output/local/`（gitignored）；每次运行前清空，避免多 ZIP 触发「恰好一个」断言失败。
- 打包在**当前工作树**进行（不复制仓库、不 overlay）；`app/renderer/dist/` 必须在场（步骤 §二.3）。

**verify:local 校验项（建议实现）**
1. 输出目录恰好一个 ZIP（`archives.length === 1`）。
2. 解包到系统临时目录（macOS `ditto -x -k`；Windows `tar -xf`；与 release-verify 同法），路径按平台取 `Contents/Resources` 或 `resources`。
3. 必有：`app/app/main.ts`、`app/app/preload.cjs`、**`app/app/renderer/dist/src/index.html`**（5B 若入口迁移则改为 `dist/index.html`）与 `assets/*`。
4. 必无：`.env`、`.ans`、`.git`、`settings.local.json`；dev 工具与测试目录；`*.map`。
5. **渲染库不重复携带**：`node_modules/` 下不得出现 `react`、`react-dom`、`markdown-it`、`@types/*`、`vite`、`tailwindcss` 等 devDependencies；同时保留生产依赖冒烟（`@earendil-works/pi-coding-agent`、`@openai/codex`、`@anthropic-ai/claude-agent-sdk` 存在）。
6. **packaged smoke**：以隔离 `HOME`/`userData` 运行解包后的可执行文件 `--ans-packaged-smoke <abs result> --user-data-dir=<abs temp>`；断言 `ok:true`、`isPackaged:true`、platform/arch 一致；无 `.env` 时各引擎 `missingKeys` 非空属预期。
7. 记录：ZIP 与 dist 入口的 sha256、大小、时间、node/npm/electron-builder 版本，写入 `release-output/local/local-smoke.json`（**不用** `manifest-*.json` 命名）。
8. 可选：`--dir` 解包模式（不产 ZIP）用于快速迭代，但正式 dry run 与 5B 门以 ZIP 冒烟为准。

**5A/5B 分别断言**
- 5A：ZIP 内仍是旧 `renderer/index.html`，packaged smoke 旧 DOM 通过——证明打包链路与既有冒烟基线可用。
- 5B：ZIP 内旧文件/vendor 已消失，入口为 dist 构建产物，packaged smoke 新契约面通过。

## 六、依赖 / 锁与包内容

- **零新增依赖**（PM §16.6）：Phase 5 不装任何新包；`package.json` 仅可能改 `scripts`（不改 dependencies/devDependencies 规格）。
- 当前锁定事实：`markdown-it@15.0.3`（devDependencies，Vite 打包）、`@types/markdown-it@14.2.0`（devDependencies）、`typescript@7.0.2`（精确，无 `^`）；lock 与 package.json 一致。
- 渲染库全部在 **devDependencies** → electron-builder 只收产物 `dependencies` 的 `node_modules`；React/markdown-it/Vite/Tailwind 不进安装包，由其打包进 `dist/assets/*.js`。packaged 校验项 §五.5 为此提供机器证据。
- 若未来构建需要新增工具，按依赖宪法四问 + PM 批准；Phase 5 不开口子。

## 七、与各角色的交接与顺序

**5A（旧渲染器仍为生产默认；5A 门前不得删除旧渲染器/旧测试/vendor）**

| 角色 | 5A 交付 | 装配依赖 |
| --- | --- | --- |
| 装配（本角色） | `package:local`/`verify:local` 落地；`build:renderer` + 本地打包 dry run + 内容断言 + 旧端 packaged smoke 证据；README 打包说明更新 | — |
| 桌面窗口 | `main.ts` dev/prod 选择实现（生产暂仍指旧入口或开关默认旧）；`packaged-smoke.ts` 新契约面改造方案；与装配确认 dev 的 `ANS_DEV_SERVER_URL` 语义 | 入口产物路径、打包产物结构 |
| 桌面UI | XSS/纯逻辑测试迁移计划与执行（新封装先全绿）；契约面最终版；e2e 目标切换；三项 Phase 5 缺口 | 旧文件/vendor 删除清单与时机 |
| 测试 | 旧端全量快照与逐 check 名台账；删除前快照；packaged smoke 计划 | 打包产物与 verify:local 接口 |

**5B（硬顺序）**

1. **测试**：旧端最终快照/逐名对照签字（5B 删除后不得再声称旧端可复跑）。
2. **桌面UI**：新封装 XSS 负例全绿 → 删除旧渲染器/旧测试/vendor；按决策迁移入口（见 §八.1）。
3. **装配**：若入口迁移，改 `vite.config.ts` 的 `input`；`npm run typecheck && npm run typecheck:renderer && npm run build:renderer`。
4. **桌面窗口**：`main.ts` 生产加载切到 dist 产物；`packaged-smoke.ts` 切新契约面（与第 3 步同批，避免窗口空白）。
5. **装配**：`npm run package:local && npm run verify:local`（ZIP + 新入口 packaged smoke），出本地打包证据。
6. **测试**：新入口全量套件（uiux-v2 / main.mjs / uiux-design-audit / bench）+ packaged smoke + 证据索引。
7. **UIUX**：最终视觉审计；**独立验收**由新固定上下文按先行固定的标准判断（PM §16.5，PM 不自我验收）。

**删除边界**：vendor 在 `app/` 内 → 只能由桌面UI 删除；`test/` 旧测试由测试/桌面UI 按各自边界删除；装配不越界，只保证打包链路在删除后通过。

## 八、未决点与风险（需 PM/相关角色在 5A 定）

1. **入口产物路径（决策项）**：现状 `dist/src/index.html`。方案 A（最小改动）保持现状，`main.ts` 生产加载 `renderer/dist/src/index.html`；方案 B（贴合 PM「`loadFile(dist/index.html)`」表述）在 5B 旧 `app/renderer/index.html` 删除后，把新入口迁到 `app/renderer/index.html`，Vite 输出变 `dist/index.html`，需桌面UI 与装配同批改 `vite.config.ts`。**建议 B**；若选 A，5A dry run 证据可直接沿用。
2. **dev 模式加载语义**：`ANS_DEV_SERVER_URL` 的变量名/default 端口由桌面窗口定；装配只保证 `dev:renderer` 的 root/端口不变。若希望在 `npm run app` 时自动开 dev server，需要进程编排依赖（违反零新依赖），不推荐。
3. **`package:local` 输出位置**：建议 `release-output/local/`（已 gitignored、证据保留）；如需彻底隔离可改系统临时目录，但证据需另存。
4. **verify:local 归属**：新增 `src/common/装配/verify-local-package.mjs` 属本角色私有目录；因该目录在 release overlay 白名单内，需 PM 确认「惰性工具随源进入」可接受（不影响发布行为），否则改由测试角色实现于 `test/装配/`。
5. **packaged smoke 契约**：现脚本绑定旧 DOM；新渲染器须提供等价可检查面（`.app`/运行时选择/抽屉等）或由桌面窗口改写检查项。在契约面定稿前，5B 门不能以「packaged smoke 通过」计。
6. **覆盖边界**：本地打包只覆盖当前平台（本机 macOS arm64）；Windows/DPI/屏读、真实模型/网络不属本地打包证据，按 PM §16.5 列入 missing-evidence。
7. **发布接入（M1）**：新冻结源/发布轮需另行决定，届时要给 CI 增加 `build:renderer` 前置并复评 `release.yml`；本次不改。

## 九、证据清单（实施时产出）

- `release-output/local/`：ZIP、`local-smoke.json`（含 sha256、大小、环境、smoke 结果）。
- dist 静态扫描输出（CSP、无内联、无 map、入口哈希）。
- `npm ls` 摘要（渲染库单版本、typescript 精确）。
- 打包树扫描（§五.5 的 must/must-not 清单）。
- 5A：旧端 packaged smoke 基线；5B：新端全量与 packaged smoke（测试角色汇总复核）。
