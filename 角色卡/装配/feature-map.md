# 装配功能导航

本角色负责的**入口、构建与层间接线**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
装配的职责是让各角色实现的能力能被真正启动起来：CLI 入口与命令解析、构建与测试配置、门禁命令与 README；**用户可操作的系统功能属于各能力角色**，见各自 `角色卡/<角色>/feature-map.md`。

CLI 四运行时的当前接线见 [稳定功能说明](docs/feature/cli-runtime-assembly.md)，历史与原始验证见 [装配记录](docs/change/2026-10-14_change_multi-runtime-assembly.md)。

| 功能 | 一句话用途 | 当前状态 | 文档 |
| --- | --- | --- | --- |
| CLI 根入口与可执行脚本（`src/index.ts`、`bin/ans.js`） | 命令分发（`doctor` / `role run` / `govern` / `help`）与对 Interface 层的动态导入接线——入口只持接口层句柄；`bin/ans.js` 免构建直跑（Node 原生 TS 类型擦除）；含入口兜底超时（`ANS_ENTRY_TIMEOUT_MS`，默认 5 分钟） | 已实现四运行时的 Interface 接线（CLI 未注入 ShellGate） | [当前接线](docs/feature/cli-runtime-assembly.md)、[README](../../README.md)（快速开始 / 命令表 / 已知范围外） |
| 命令解析（`src/common/装配/cli-parse.ts`） | argv 规范化与 Invocation 判定、退码口径；`role run` 位形放行 `-h`/`--help` 原样透传；`ans init` 已废 → 未知命令退 2 | 已实现 | [change：`role run` 放行 `--help`](docs/change/2026-10-13_change_role-run-help-passthrough.md) |
| `ans govern <目标目录>` | 目标目录真正生效（`projectRoot` 换根）；外来根＋内置回退注入如实形态与有界创世授权（`genesisBootstrap`）；缺目录 / 非目录 → 明确报错退 2、不静默回退 | 已实现并验证（确定性范围；2026-10-22 治理卡严格口径下测试夹具已适配；真模型端到端属客户跑、未验） | [fix：govern 目标目录边界解析](docs/fix/2026-10-12_fix_govern-target-boundary.md)、[change：严格治理卡夹具适配](docs/change/2026-10-22_change_govern-target-strict-card-fixture.md) |
| `ans doctor` 装配自检 | 打印运行时及其来源、`projectRoot` / `skillRoot`、配置来源（`.ans` / 内置回退）、pin 来源、内嵌演示角色表——不依赖其余角色落盘 | 已实现 | [README](../../README.md)（命令表） |
| `.ans/project.json` 载入接线（`src/common/装配/config-loader.ts`） | 把 `.ans` 有效配置接进入口；现为共享实现的**薄转发**（单一实现、不复制第二份）；accepted 无 pin 即未接受（fail-closed，不静默回退演示 acceptance） | 已实现（T2 落地、T12 收敛为薄转发） | [changelog](changelog.md)（2026-10-11 条目）、[共享组件目录](../项目管理/docs/architecture/shared-components.md) |
| 演示运行时与运行时接线（`src/common/装配/demo-runtime.ts`、`runtime.ts`） | role run 默认 demo、govern 默认 Pi；显式 flag/env 可选 demo/Pi/Codex/Claude，选定引擎失败不降级；类型引用统一 Model，枚举引用共享实现 | 自有启动与真实核心接线已验证 | [当前功能](docs/feature/cli-runtime-assembly.md)、[原证据](docs/change/2026-10-14_change_multi-runtime-assembly.md) |
| 构建与测试配置（`package.json`、`tsconfig.json`） | 包定义、依赖与脚本（`start` / `doctor` / `demo` / `app` / `test:assembly` / `typecheck`）；TS 编译配置（strict、`noEmit`、`nodenext`，覆盖 `src` / `test` / `app`，已排除 `app/renderer`）；类型门禁由「空承诺」改为真跑（渲染层脚本见下一行） | 已实现（typescript 7.0.2；2026-10-21 根 tsconfig exclude `app/renderer`） | [README](../../README.md)（快速开始 / 两道门）、[changelog](changelog.md)（2026-10-11 类型门禁条目） |
| 渲染层工具链（`vite.config.ts`、渲染依赖、`dev:renderer` / `build:renderer` / `preview:renderer` / `typecheck:renderer` / `package:local` / `verify:local`） | 只构建 `app/renderer`：Vite 8.3.4 + React 19.3.1 + Tailwind v4；`base: "./"` 适配 `file://`，生产 CSP 零内联（modulePreload polyfill 关闭）；产物 `app/renderer/dist/`（已 gitignore）；开发服务器固定 5199、仅 dev 放宽 CSP；本地打包输出 `release-output/local/`（`--publish never`），`verify:local` 解包断言 + packaged smoke | 本地工具链已建立（2026-10-21：18 个依赖精确锁版入 devDependencies，含 `markdown-it@15.0.3`＋`@types/markdown-it@14.2.0`；`typescript` 精确 7.0.2；根 typecheck 0 错）；**Phase 5B 已完成（步骤 a/b/c）**：旧渲染器/vendor 已删、入口统一 `app/renderer/index.html` → `dist/index.html`（HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`、gzip 288,778B≤300KB）；**5B 最终包 verify 全绿**（ZIP 406,507,281B、sha256 `edeeef19…`、smoke 14/14 true）；**发布流水线未接（M1），新冻结源发布轮另行客户决定** | [change：Phase 1 工具链](docs/change/2026-10-21_change_ui-platform-toolchain.md)、[change：markdown-it 依赖落盘](docs/change/2026-10-21_change_markdown-it-npm-devdep.md)、[change：5A 本地打包](docs/change/2026-10-21_change_ui-platform-phase5a-local-package.md)、[change：5B 入口切换](docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md)、[计划](docs/design/2026-10-21_design_ui-platform-phase5a-build.md) |
| 两道门（交付前必过） | ① 全量 `node --test "test/**/*.test.ts"`（**必须带引号**，走 Node glob、覆盖三层路径）② `npm run typecheck`——本角色每次交付的验证基线 | 已建立 | [README](../../README.md)（两道门） |
| 装配测试（`test/装配/`，10 文件 71 例） | 启动冒烟与接线测试：命令解析、govern 注入、`.ans` 载入、入口收敛、演示运行时、发布 overlay 与集合校验合约 | 71/71（2026-10-16 v1.2.0 发布配方批；历史 70/70、67/67 见记录） | [test/装配/](../../test/装配/) |
| README（安装与使用说明） | 新用户从下载、导入与配置到任务验收的使用路径，附开发入口与实际限制 | 2026-10-21 同步需求确认代批、失败退回与手动处理条件 | [README.md](../../README.md)、[D3 文案修复](docs/fix/2026-10-21_fix_d3-approval-copy.md)、[读者路径重写](docs/change/2026-10-15_change_readme-reader-flow.md)、[历史核对](docs/change/2026-10-14_change_readme-multi-runtime-desktop.md) |
| `.env` / `.env.example`（本角色归属） | 仓库根环境配置：凭据只落 `.env`（已 gitignore）、示例只含占位符；读写唯一实现＝共享组件 `env-file.ts`（pm 属主；本角色为指定写入者，记档 G-2） | 已实现 | [共享组件目录](../项目管理/docs/architecture/shared-components.md) |
| `.ans/`（条件目录 `project-init`） | 项目初始化产物写权（`.ans/project.json`：角色表、治理边界与接受证据的 SHA-256 pin）；条件目录——写入须在 TaskScope 声明条件，否则门禁按「命中条件目录但缺少条件」拒绝 | 已登记（Governance 授权、客户批准） | [Section 1 授权记档](../项目管理/docs/change/2026-10-11_change_governance-section1-grants.md) |

## 说明

- 本文件 2026-10-14 由本角色建立，修复 role-card 第 11 行「装配功能导航」死链（客户要求统一补建缺失的 feature-map）。
- 文档现状：本次建立四运行时装配的稳定功能、设计与原始变更证据；公开报告见 [api-spec](api-spec.md)。原 govern 修复和 help 透传记录继续保留。
- 用户可操作的系统功能属于各能力角色，见各自 `角色卡/<角色>/feature-map.md`（与装配接线最相关的：[编排](../编排/feature-map.md)、[桌面UI](../桌面UI/feature-map.md)、[桌面窗口](../桌面窗口/feature-map.md)）。
- 装配的启动检查与冒烟不替代测试角色的跨角色联调与回归。

- [桌面运行包构建与发布](docs/feature/desktop-release-packaging.md)：固定 tag 加精确 overlay、三原生架构 ZIP、实际解压程序启动、来源与校验清单。v1.0.0、v1.1.0 已发布实测（v1.1.0：修复后 run 38860421363 四 job 全绿、独立验收后 2026-10-16 公开，验收见[测试角色记录](../测试/docs/change/2026-10-16_change_v1.1-release-verification.md)）；v1.2.0 配方（冻结 `ecca2d3`，白名单**回到纯打包面**，本机 arm64 冒烟通过，待 tag/CI/发布）见[本次变更](docs/change/2026-10-16_change_v1.2-release-packaging.md)。
