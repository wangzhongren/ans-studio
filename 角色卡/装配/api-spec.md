# 装配实现报告

对应项目管理 [ANS-RUNTIME-V2 revision 1](../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)。B0 正常依赖与稳定原生协议已验证；B1 两个 CLI 命令的四运行时接线已实施，自有启动/实际核心 handlers 已验证。桌面和独立最终合并验收由原属主接续，没有在线模型证据。

`package.json/package-lock.json` 精确固定：`@openai/codex@0.162.1`、`@modelcontextprotocol/sdk@1.32.1`、`@anthropic-ai/claude-agent-sdk@0.3.299`、`zod@4.6.7`、`@anthropic-ai/sdk@0.93.0`；Pi `1.1.0`、yaml `2.9.0`、Node `>=23.6` 保持。正常安装元数据及当前候选见 [原证据](docs/change/2026-10-14_change_multi-runtime-assembly.md)。Codex app-server 为实际运输，不是 TS SDK callback；Claude bundled CLI 版本 `2.1.299`，最终 no-bare/disableAllHooks 与真实 hook/updatedInput 回环已由原属主 [A1V](../Claude适配器/docs/fix/2026-10-14_fix_claude-native-hook-identity.md) 验证，24.8天上游限制保留。

稳定 Codex `node test/codex-adapter/native-probe.mjs` exit 0，证明无模型初始化/配置/schema 检查中的 native MCP 全禁用及 read-only/never 实际限制。B0正常核心/Codex/Claude/Pi测试组合239/240，唯一沙箱本地listen EPERM精确回环重测1/1；原始失败保留。B1装配67项+已修边界顺序的窗口session11项共78/78、当前全仓strict tsc0。全仓原结果1165/1168、2失败、1跳过，桌面目录名断言交D1；另一边界顺序项精确重测通过。SDK加载与root接线有当前证据，初次失败均留在报告。无真实模型/登录/线上 API 调用。

root 公开导出 `main(argv,env?,options?:MainOptions)`、`loadInjection(targetDir?)`、`buildDemoProjectConfig()`、`buildDemoTaskScope()`、`resolveProjectRoot()`、`resolveSkillRoot` 及配置类型。`MainOptions.runtimeOptions` 直接引用 Interface `RunRoleCommandDeps.runtimeOptions`；`RunRoleDeps` 是带必需project/scope的Interface依赖类型。入口只持Interface公开操作、不导入Pipeline/Service/Provider对象或类型。命令默认role=demo/govern=pi，flag>ANS_RUNTIME>命令默认；demo默认保留原装配替身，测试显式runtimeOptions可走正常Service。CLI shell gate不在本次授权内。

内置回退新增三份已接受运行时角色卡/各自边界，保持原任务writeSet；外来govern不复用本仓库角色表。README和.env.example仅占位符。B1当时的Codex显式空base问题已由原属主[X1S修复](../Codex适配器/docs/fix/2026-10-14_fix_blank-base-url-default.md)，示例继续省略该可选键。B1原源码/配置候选SHA256 `38f896e0ace0de540606080595e322c3e81cb80d8f3dab2a8b6506fba45a105c`，逐项和命令见[原报告](docs/change/2026-10-14_change_multi-runtime-assembly.md)；当前功能见[CLI运行时接线](docs/feature/cli-runtime-assembly.md)。

B1D仅文档同步：README准确区分CLI四值和桌面正式三选项、当前引擎设置、ans/native隔离与Pi旧JSONL兼容、实际恢复及ANS等待/上游限制。21份自有生产配置测试未变，链接/矛盾/格式检查通过；没有新产品、原生或最终T1验收。当前README指纹及证据见[文档收尾](docs/change/2026-10-14_change_readme-multi-runtime-desktop.md)。

## 2026-10-17 — `ans govern <目录>` 治理模型注入（评审 §5.4「CLI 同步」）

`loadInjection(targetDir?)` 现在把治理模型写进注入的 `ProjectConfig.governanceModel`：对外来目标目录调用 PM 属主共享组件 `readGovernanceModel(projectRoot)`（`src/common/装配/config-loader.ts` 薄转发、只读导入，不复制实现），判定顺序与 `listProject` 同口径——explicit → 显式值；unreadable → `single`（保留既有 `ans-invalid`/fail-closed 语义）；absent + 无 `.ans/project.json` 记录且无项目角色子目录（`角色卡/`、`role-cards/`，空目录不算）→ `trio`（新空项目）；其余 → `single`（旧项目，行为逐字不变）。`ans govern`（缺省）与显式 `ans govern <ans-cli 根>` 不做目标推断、仍用载入配置；`ans role run` 不经本函数，语义不变。`ConfigInjection`/`governCommand` 契约无需改动——`project.governanceModel` 已随 `GovernSessionInput.project` 透传给 `resolveRole`/`resolveBoundarySection`。修复测试角色报告的阻塞缺陷：新空目录经 `listProject` 选到 rapporteur，但 `resolveRole` 按缺省 `single` 报「三权角色在 single 治理模型下不可用」。新增 `test/装配/governance-model-injection.test.ts` 9 例；`govern-target.test.ts` 空目录链路改用 trio/rapporteur 提案写盘并覆盖 `--function proposal`。证据：`test/装配/` **82/82**、typecheck **0 错**、全量 **2669/2648/18/3**（18 红均为既有环境/他角色：Windows symlink EPERM、桌面UI renderer、schema 文案、vendor pin 等；4 条 CLI 红转绿、0 新红）。

## 2026-10-21 — UI 平台化 Phase 1：渲染层工具链（本地，不接发布流水线）

按产品提案 [UI 平台化](../产品/docs/design/2026-10-21_design_ui-platform-round.md) revision 2 §六 Phase 1 与项目管理评审 M1/M2 落地渲染层构建环境；发布流水线（`release.yml`）与 `electron-builder.yml` 均未改（M1：发布接入属下一次冻结源/新发布轮）。

**构建入口与产物**：根 `vite.config.ts`（本角色新授权单文件）以 `root: "app/renderer"` 限制构建面，入口 `app/renderer/src/index.html`（过渡期独立入口，由桌面UI Phase 2 创建），产物 `app/renderer/dist/`（相对 root；已 gitignore）；`base: "./"` 保证 Electron `loadFile` 的 `file://` 相对路径；`modulePreload.polyfill: false` 守生产严格 CSP；`build.target: "chrome152"` 依据 Electron 44.7.0 实测 Chromium 152.0.7977.130；`resolve.alias` `@` → `app/renderer/src`；主进程/preload 不进入 Vite 管线。生产 CSP（`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`）由源码 HTML meta 提供、构建不改写；仅 dev server 经 `transformIndexHtml` 注入放宽策略（`script-src`/`style-src` 加 `'unsafe-inline'`、`connect-src` 加 `ws: http:`），端口固定 5199、`strictPort`。

**脚本**：`dev:renderer`（`vite --config vite.config.ts`）、`build:renderer`（`vite build --config vite.config.ts`）、`preview:renderer`（`vite preview --config vite.config.ts`）、`typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`，该 tsconfig 由桌面UI Phase 2 创建）；既有脚本语义未动。根 `tsconfig.json` `exclude` 增 `app/renderer`。

**依赖冻结**（全部精确版本、全部 `devDependencies`）：运行时库 10——`react`/`react-dom@19.3.1`、`@base-ui/react@1.9.0`、`lucide-react@1.60.0`、`motion@14.4.0`、`react-resizable-panels@4.14.8`、`zustand@5.0.15`、`clsx@2.1.1`、`tailwind-merge@3.7.0`、`class-variance-authority@0.7.1`；构建期/类型 6——`vite@8.3.4`、`@vitejs/plugin-react@6.1.2`、`tailwindcss@4.3.3`、`@tailwindcss/vite@4.3.3`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`。与指定版本逐一相同；未装 dnd-kit/tw-animate-css/vitest/Storybook/radix/aria。lockfile 只新增条目，既有依赖版本零变化（脚本比对 0 删除、0 版本变化）。`motion` 包自身依赖 `framer-motion` 属其内部结构，非第二套动画库。

**证据**：根 `npx tsc --noEmit` **exit 0**；`npm ls react react-dom` 全 `19.3.1` deduped；`npx vite build` 按预期 `[UNRESOLVED_ENTRY] Cannot resolve entry module app/renderer/src/index.html`（配置可加载）；`npm run typecheck:renderer` 按预期 `TS5058`（`app/renderer/tsconfig.json` 未建）；dev server `ready in 98 ms`、`http://localhost:5199/` HTTP 200、CSP meta 替换为 dev 版后停止；node v24.14.0 / npm 11.9.0 / vite 8.3.4。`npm audit` 8 moderate 均属既有 electron-builder 传递链。

**未验证**：真实入口构建、真实 Electron `loadFile(dist)` 的 file:// ES 模块/分块加载（Phase 1 首件门）、生产 CSP 静态扫描、≤300KB gzip 预算、Tailwind v4/Base UI 在 Chromium 152 的兼容性、`typecheck:renderer` 真实结果。详见[变更记录](docs/change/2026-10-21_change_ui-platform-toolchain.md)。

## 2026-10-21 — markdown-it 依赖落盘（npm 精确版 15.0.3；vendor 迁移期并存；typescript 精确锁定）

按产品提案 [UI 平台化](../产品/docs/design/2026-10-21_design_ui-platform-round.md) revision 2 §4.1/§六 Phase 3 与项目管理评审 Q9（「封装与测试归桌面UI，依赖落盘归装配」）落依赖：

| 包 | 版本 | 位置 | 用途 |
| --- | --- | --- | --- |
| `markdown-it` | `15.0.3`（精确；安全修正后版本） | `devDependencies` | 渲染层 Markdown 解析/渲染；由 Vite 打包进 `app/renderer/dist/`，运行时安装包不携带 `node_modules` 副本；按 Q11 不计入 ≤12 运行时新增预算。初按原计划装 15.0.2（与 vendor 同版本），因 audit 命中两条 advisory（`GHSA-gfr2-rv44-r23c` high、`GHSA-vfgh-jcmw-g37q` low，均修于 15.0.3）经协调方指示升 15.0.3 |
| `@types/markdown-it` | `14.2.0`（精确，npm latest；DT 无 15.x 线） | `devDependencies` | 类型声明兜底（markdown-it 15.x 自身已带 `dist/markdown-it.d.cts`，TS 优先用包内声明）；按 PM 决定照装 |
| `typescript` | `7.0.2`（由 `^7.0.2` 改为精确，实际安装版本未变） | `devDependencies` | 依赖宪法 §4.3「精确锁定、无 `^`/`~`」；对应 PM 评审 §2.6「实施中确认」项，本轮一并收敛 |

- lockfile 仅新增 10 个条目（markdown-it 传递依赖 `argparse`/`mdurl`/`linkify-it`/`entities`/`punycode.js`/`uc.micro` 与 `@types/markdown-it` 链），**既有依赖零删除、零版本变化**；`package.json` 既有依赖仅 `typescript` 规格去 `^`，其余逐字未变。
- 验证：`npm ls markdown-it --all` 单版本 `15.0.3`、`@types/markdown-it@14.2.0`、`typescript@7.0.2` 均单版本；`npm audit` 中 markdown-it 两条 advisory **消失**（全仓 8 moderate 全为既有 electron-builder 传递链，安装前即 8）；`npx tsc --noEmit` **exit 0**。
- **vendor 保留（对 PM「Phase 3 删 vendor」的执行时点修正）**：旧渲染器在 Phase 5 切换前仍加载 `app/renderer/vendor/markdown-it.umd.min.js`，故本阶段不删；迁移期两处并存（npm 15.0.3 / vendor 15.0.2 双版本，安全优先），删除由 Phase 5 执行（vendor 属桌面UI 边界，本角色不越界删除）。**残留风险**：vendor 15.0.2 仍带上述两条 advisory，旧渲染器路径持续暴露至 Phase 5 或 vendor 同步升级（建议 vendor 属主按 `vendor/README.md` 流程评估）。
- **未验证**：真实渲染层 `import markdown-it` 的 Vite 打包与浏览器行为（由桌面UI Phase 3 随聊天流迁移验证）。详见[变更记录](docs/change/2026-10-21_change_markdown-it-npm-devdep.md)。

## 2026-10-21 — Phase 5A 本地构建/打包/校验（不接发布流水线）

按 PM 评审 revision 10 §十七（5A 放行）与 §16.6（M1）落地装配侧本地链路；只改 `package.json` scripts 与新增 `test/装配/verify-local-package.mjs`，零新增依赖、lock 未变。

| 脚本 | 语义 |
| --- | --- |
| `package:local` | `npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`——先构建再打包，输出本地专用目录（已 gitignored） |
| `verify:local` | `node test/装配/verify-local-package.mjs`——解包 ZIP、包内必含/必无断言、devDependencies 不重复携带、生产依赖在位、隔离 HOME 的 packaged smoke，证据写 `release-output/local/local-smoke.json` |
| `package` / `release:prepare` / `release:verify` | 逐字未动（发布配方；Phase 5 不运行 `release:prepare`） |

- **5A 必含清单**：`app/main.ts`、`app/preload.cjs`、`package.json`、`LICENSE`、`app/renderer/dist/src/index.html`＋`dist/assets`（≥1 JS/≥1 CSS、无 `.map`）、旧渲染器 `index.html`/`renderer.js`/`styles.css`、vendor `markdown-it.umd.min.js`。**5B 更新点**：旧渲染器与 vendor 改为必无、入口若迁移则 `dist/index.html`。
- **packaged smoke**：5A 生产入口仍指旧渲染器，使用 smoke-only `--ans-renderer-entry` 指向包内 dist 入口验证新构建产物；隔离 `HOME`/`userData`，无 `.env` 时各引擎 missingKeys 非空属预期。
- **实测（5A 最终冻结包；200% 遮挡修复后；macOS arm64 / Electron 44.7.0）**：`build:renderer` exit 0（JS `index-T1im4gOp.js` 825,985B / gzip 269,177B；CSS `index-DbPZU_Oj.css` 108,586B / gzip 19,623B；入口 583B；gzip 合计 288,800B≤300KB）；`package:local` exit 0 → ZIP **406,759,699B、sha256 `a22c3c23cd764d16339623346ed8893b7bdbafdc30add436fe94e30e0926a9a6`**（包内 main.ts `9e7cef76…`、dist 入口 `f372e111…`、JS `f568e2aa…`、CSS `b52cfca1…`）；`verify:local` exit 0（必含/必无全过、devDepsPackaged=[]、生产依赖 8/8、smoke 检查全 true）；根 `tsc` 0、`typecheck:renderer` 0、`test:assembly` 82/82。**5A 最终冻结包数值仅对冻结候选有效；5B 切换后必须重新打包、数值作废。**
- **边界**：`electron-builder.yml` 未改（只读核对 `!**/test{,/**/*}` 已排除测试）；`.github/workflows/release.yml`、`release-policy`、`release-*` 零 diff；未上传、未生成 release manifest 名。
- **未验证**：5B 生产入口切换后的 packaged smoke、全量双端逐 check、Windows/DPI/屏读、真实模型/网络、独立验收。详见[变更记录](docs/change/2026-10-21_change_ui-platform-phase5a-local-package.md)。

## 2026-10-21 — Phase 5B（装配步骤 b）：渲染入口切换与 5B 打包校验

步骤 a（桌面UI 删除旧渲染器/vendor/旧测试、源入口移至 `app/renderer/index.html`）完成后，装配执行步骤 b：

- `vite.config.ts`：`build.rollupOptions.input` 改为 `app/renderer/index.html`；`root`/`base: "./"`/`modulePreload.polyfill: false`/`target: chrome152`/dev CSP 插件不变。产物为 **`app/renderer/dist/index.html`**＋`assets/`，旧 `dist/src/` 由 `emptyOutDir` 清空。
- `test/装配/verify-local-package.mjs` 切 5B：必含 main.ts/preload.cjs/package.json/LICENSE/`dist/index.html`＋`dist/assets`；必无旧渲染器 8 文件（renderer.js、styles.css、markdown.js、engine-selector.js、role-status.js、runtime-ui.js、tool-rows.js、ui-labels.js）、`vendor/`、`dist/src/`；packaged smoke 入口覆盖改为包内 `dist/index.html`；其余断言保留。
- **构建（步骤 b 实测）**：`dist/index.html` 581B/gzip 400B/sha `3c4da2a2…`；JS `index-BVLfGR_D.js` 825,985B/gzip 269,177B/sha `f568e2aa…`；CSS `index-DUBNk8-R.css` 108,501B/gzip 19,601B/sha `76fad7ce…`；gzip 合计 288,778B≤300KB；生产 CSP 原样、无 unsafe/内联、相对资源。
- **打包校验（过渡态）**：`package:local`→`verify:local` exit 0；ZIP **406,507,563B、sha256 `6a1059ab64a32c717083c73db67a885a8eb2780087f0c3b11dbcb5ebbc7a42be`**；必含 6/6、旧文件/vendor/dist-src 不在包内、devDeps 打包 0/21、生产依赖 8/8、smoke 14 项全 true。
- **待步骤 c**：包内 `app/main.ts` 仍为 5A 版本（`9e7cef76…`），verify 通过 smoke-only `--ans-renderer-entry` 锁定 `dist/index.html`；桌面窗口把 `renderer-entry.ts`/`main.ts` 生产默认切到构建产物后，**必须重新 build→package→verify，本包数值作废**。
- release 配方/electron-builder.yml/依赖/lock 零变化。**当时已知红（非装配边界）**：根 `tsc` 因 `test/测试/uiux-v2-replay-regression.test.ts` 仍 import 已删旧渲染器 `tool-rows.js`/`ui-labels.js` 报 TS2882，属测试角色 5B 清理范围；`typecheck:renderer` 0。该红后由测试角色清理，最终包复跑根 `tsc` 0（见下节）。详见[变更记录](docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)。

## 2026-10-21 — Phase 5B 最终包（步骤 b/c 完成，本地）

步骤 c（`renderer-entry.ts` 收敛为唯一 `renderer/dist/index.html`、`main.ts` 生产默认切换）完成后，在冻结候选上清空 `release-output/local/` 重跑：

- **构建**：`dist/index.html` 581B/gzip 400B/sha `3c4da2a2…`；JS `index-BVLfGR_D.js` 825,985B/gzip 269,177B/sha `f568e2aa…`；CSS `index-DUBNk8-R.css` 108,501B/gzip 19,601B/sha `76fad7ce…`；gzip 合计 288,778B≤300KB。
- **打包校验**：`package:local`→`verify:local` exit 0；ZIP **406,507,281B、sha256 `edeeef1949d51ee471f5c922f18cb17fdd0e97ddd33e58b5264a8411a7d8f13f`**；包内 main.ts `64a56c33…`、dist 入口 `3c4da2a2…`；必含 6/6、旧渲染器 8 文件/vendor/dist-src 全不在包内、devDeps 打包 0/21、生产依赖 8/8、packaged smoke **14/14 全 true**；证据 `release-output/local/local-smoke.json`。
- **口径**：**5B 最终包；发布流水线未接（M1）**——`release.yml`/release-policy/electron-builder.yml 零 diff、依赖/lock 零变化、未运行 `release:prepare`、未上传；新冻结源发布轮另行客户决定。
- 门禁：根 `tsc` **0**、`typecheck:renderer` **0**（测试角色清理旧渲染器 import 后转绿）。
- **未验证**：Windows/DPI/屏读、真实模型/网络、独立验收。

## 2026-10-22 — v1.5.0 发布准备（冻结源 35cca0b）

客户决定发布 1.5.0（未签名 ZIP，同 v1.4.0 形态）：先创建 draft Release，三平台原生 CI 通过后由客户/协调方决定公开；范围＝当前 main（UI 平台化＋并行工作流）。

- **版本与冻结源**：`package.json`/`package-lock.json` 1.4.0→1.5.0（仅根两处、零依赖变动）；准备提交 `35cca0b`；annotated tag `v1.5.0`（tag 对象 `4b0b8db`）→ commit `35cca0bd2ed373c8ed5984dea45a76a608f4e502`（= `release-policy.mjs` 的 `SOURCE_SHA`），main 与 tag 已推送 origin。
- **README**：当前版本、下载表（mac-arm64/mac-x64/win-x64，`ANS-Studio-1.5.0-*`，指向 `releases/download/v1.5.0/`）与 SHA256 说明更新；SHA256 暂写「发布后由 Release 的 SHA256SUMS 校验文件提供」并明确未签名；要点改为 UI 平台化（React/shadcn Nova、单入口 `app/renderer/dist/index.html`、新图标、派发投射去重、默认移除 15 分钟自动中止、角色显示名统一）；未签名/Windows 文档限制/最低系统要求说明保留。
- **发布配方**：`release-policy.mjs` → `SOURCE_REF='v1.5.0'`、`SOURCE_SHA='35cca0b…'`，白名单重置基础集（files＝package.json/package-lock.json/release.yml；dirs＝src/common/装配/、test/装配/），v1.4.0 overlay-2 的 5 条精确条目整批移除；`release.yml` input 默认/concurrency `release-v1.5.0`/`gh release view|create|upload|edit` → v1.5.0、标题 `ANS Studio 1.5.0`、notes 为本轮说明、`publish` 默认 false。配方提交 `5513209` 已推送。
- **本地预检**：`npm run typecheck` 0；`npm run typecheck:renderer` 0；`npm run build:renderer` 0（gzip 合计约 292.4KB≤300KB）；`node --test "test/**/*.test.ts"` 3315 计 / 3312 过 / 1 红 / 2 跳过——唯一红 `test/测试/lightweight-permission-repairs.test.ts:164` 为缺真实 `rg` 二进制的已知环境红（未跳过、如实记录），0 产品红。prepare 预演 exit 0（overlayPaths 2、actualTree `1ae3b77b…`）。
- **测试夹具对齐（提交 `c166914`）**：`test/装配/release-packaging.test.ts` 断言更新到 v1.5.0（SOURCE_REF/SHA、新增基础集选中项用例、v1.4.0 overlay-2 五条改为 fail-closed/excluded 用例，断言未放宽）；`release-policy.d.mts` 字面量同步。验证：`node --test "test/装配/**/*.test.ts"` **83/83**、`npm run typecheck` **0**；对齐后 prepare 预演 exit 0（overlayPaths 恰 4、actualTree `53441757…`、overlayPatchSha256 `ebf25945…`）。
- **Windows 修复批次（overlay 追加，提交 `1685f19`）**：协调方四修复 `8784b45`（桌面UI source-guard 路径）、`7884979`（runtime-core ENOTDIR）、`1b62023`（test/测试 loopback EBUSY）、`0d7f5fb`（Codex CRLF 产品修复＋测试）合入 main 后，`release-policy.mjs` 按精确路径增列 7 文件——`src/common/codex-adapter/reasoning-catalog.ts`、`test/codex-adapter/reasoning-catalog.test.ts`、`test/codex-adapter/fixtures.ts`、`test/桌面UI/source-guard.test.ts`、`test/runtime-core/file-write-safety.test.ts`、`test/测试/g5-reasoning-verify/helpers.ts`、`test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`（唯一 `src/` 变更即 `reasoning-catalog.ts`，无 `app/` 变更）；`release.yml` 在 Typecheck 后、Regression tests 前新增跨平台 ripgrep 安装（macOS `brew install ripgrep`、Windows `choco install ripgrep -y --no-progress`、Linux apt 兜底，`rg --version` 验证；矩阵/超时/其他步骤未改）；packaging 测试增精确批次用例。验证：装配 **84/84**、typecheck **0**；prepare 预演 exit 0（selected 恰 **11**、actualTree `ca3e8ba…`、overlayPatchSha256 `734e6fe…`，预演树 packaging 8/8）。
- **CI**：首跑 run `39701856151`（headSha `5513209`）因冻结 tag 内测试仍钉 v1.4.0 已取消；run `39702128045`（headSha `c166914`）三平台 build failure、release skipped；run `39703920167`（headSha `1685f19`）三平台 packaged smoke 因包内缺 `app/renderer/dist/index.html` 失败——workflow 在 Package 前补 `npm run build:renderer`（Regression tests 后，非零即停；提交 `31e70c1`，装配 84/84、typecheck 0，prepare selected 仍 11、actualTree `1d1a1d7c…`）；run `39705028954`（headSha `31e70c1`）三平台 build **全 success**，release job 在 `release-assets.mjs` 因旧 `settings` 键失败——已把必需 UI checks 改为**全 14 键 true**（`settingsEntryDisabled` 取代 `settings`，并加 entry/rootMounted/driver/csp/cspViolations/console/load；与主进程 `ok` 语义一致、fail-closed 不降强度），测试夹具同步并加 `settingsEntryDisabled:false`/`console:false` 负例（提交 `e507b4a`；装配 84/84、typecheck 0、预演树 8/8；prepare selected 恰 **12**＝上一轮 11＋`release-assets.mjs`，actualTree `db9d82ee…`、overlayPatchSha256 `114ec91c…`）；重新触发 run **`39706385498`**（headSha `e507b4a`，`publish=false`）——macOS arm64/x64 两 build success、Windows 因 `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` 时序失败；协调方 `5cc91d6` 修复（仅该文件、无放宽）后 overlay 按精确路径增列该文件（恰 **13** 文件），packaging 修复批次夹具同步为 7 条测试并加同目录未列名 `d-dispatch-listing.test.ts` excluded 断言（提交 `d886771`；装配 84/84、typecheck 0；prepare actualTree `d506ea75…`、overlayPatchSha256 `380e0edf…`）；重新触发 run **`39709141335`**（headSha `d886771`）——macOS arm64/x64 两 build success；Windows Regression 通过、失败在 `Verify extracted archive and actual packaged UI` 的 `tar -xf`（electron-builder ZIP 条目名不兼容）；`release-verify.mjs` 的 win32 解压改为优先 7-Zip（PATH/Program Files，`x -y -o<dir>`）→ PowerShell `Expand-Archive -Force` 回退，macOS ditto 未动（提交 `ac404e4`；`node --check` 通过、装配 84/84、typecheck 0；prepare selected **14**＝上一轮 13＋`release-verify.mjs`，actualTree `1fe754e4…`、overlayPatchSha256 `7dc4c614…`）；重新触发 run **`39710450596`**（headSha `ac404e4`）——三平台 build + release **四 job 全绿**；**v1.5.0 已公开发布**（draft=false，publishedAt **2026-10-22T02:42:41Z**，<https://github.com/wangzhongren/ans-studio/releases/tag/v1.5.0>）。README SHA256 表填入真实值（arm64 `af5a80e8…`、x64 `4f415244…`、win x64 `cb2941b6…`、overlay.patch `7dc4c614…`、release-provenance.json `d17b6ebd…`）；9 项公开资产 HEAD 全部 **200**，Release 校验文件与 README 逐字一致。**证据边界**：未独立下载/启动 ZIP，三平台 smoke 由 CI 原生 runner 执行。详见[变更记录](docs/change/2026-10-22_change_release-v1.5.0-prepare.md)。
