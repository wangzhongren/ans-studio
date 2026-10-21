# 5B 候选分离清单（AC8 §2.3）

**用途**：候选 `git-status.txt` 同时包含 UI 平台 Phase 5 改动与同期无关改动。本清单按 AC8 §2.3 把无关改动单独列名，说明其**不进入 Phase 5 判定**，并记录对构建/共享配置/证据的影响判断。测试角色只做分离与影响说明，不评价这些改动的业务正确性，也不把它们算作 Phase 5 产品行为证据。

**候选**：HEAD `224cf83` + 冻结时未提交工作树；生产入口 `app/renderer/dist/index.html`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`。完整状态见 [git-status.txt](git-status.txt)。

## 一、无关改动（不进入 Phase 5 判定）

### 1. 运行时/适配器/共享代码（`src/common|provider|model|service`）

| 文件 | 性质 |
| --- | --- |
| `src/common/codex-adapter/protocol.ts` | Codex 适配器协议 |
| `src/common/pi-adapter/real-adapter.ts` | Pi 适配器 |
| `src/common/runtime-core/fs-write.ts` | 运行时文件写入安全 |
| `src/common/shared/atomic-write.ts` | 共享原子写 |
| `src/common/门禁引擎/classify-shell.ts` | shell 分类/门禁 |
| `src/model/runtime.ts` | 运行时模型 |
| `src/provider/claude/session.ts` | Claude 会话 |
| `src/provider/codex/session.ts` | Codex 会话 |
| `src/provider/runtime/tools.ts` | 运行时工具 |
| `src/service/gate/resolve-write.ts` | 写授权门禁 |
| `src/service/runtime/session.ts` | 运行时会话服务 |
| `src/common/codex-adapter/reasoning-catalog.ts`（新增） | Codex reasoning catalog |

### 2. 适配器/运行时测试（不属 UI 平台）

| 文件 | 性质 |
| --- | --- |
| `test/claude-adapter/reasoning-loopback.probe.ts` | Claude reasoning 探针 |
| `test/claude-adapter/session.test.ts` | Claude 会话测试 |
| `test/codex-adapter/fixtures.ts`、`reasoning.test.ts`、`session.test.ts`、`web-search.test.ts` | Codex 适配器测试 |
| `test/pi-adapter/installed-mcp-servers.test.ts`、`real-adapter.timeout.test.ts`、`reasoning-effort.test.ts` | Pi 适配器测试 |
| `test/codex-adapter/reasoning-catalog.test.ts`、`test/pi-adapter/compatibility-loopback.test.ts`、`test/runtime-core/file-write-safety.test.ts`（新增） | 同期新增测试 |
| `test/门禁引擎/classify-shell.test.ts`、`test/门禁引擎/resolve-write.test.ts`、`test/项目管理/shared/atomic-write.test.ts` | 门禁/共享代码测试 |
| `test/测试/g3-search-verify/codex-websearch-verify.test.ts`、`test/测试/g4v2-mcp-verify/j-pi.test.ts`、`test/测试/g5-reasoning-verify/{c-claude,d-codex,e-pi}.test.ts`、`test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`、`test/测试/lightweight-permission-repairs.test.ts` | 同期权限/reasoning 轻量修复验证 |

### 3. 角色文档/证据（非产品）

`角色卡/Claude适配器`、`Codex适配器`、`Pi适配器`、`运行时核心`、`门禁引擎`、`项目管理`、`装配`、`UIUX设计师`、`独立验收` 等目录下的 memo/changelog/feature-map/docs 变更，以及 `角色卡/测试/` 自身的证据与本报告。均属角色记录，不是产品代码，不进入 Phase 5 判定。

## 二、Phase 5 范围内的改动（对照）

- 入口/主进程：`app/desktop/{renderer-entry,navigation-policy,navigation-guard,diagnostics,packaged-smoke}.ts`、`app/main.ts`。
- 新渲染器：`app/renderer/src/**`、`app/renderer/dist/**`、`app/renderer/index.html`、`app/renderer/components.json`、`app/renderer/tsconfig.json`。
- 构建/工具链：`vite.config.ts`、`tsconfig.json`、`package.json`、`package-lock.json`（Vite 8/React 19/Tailwind v4/markdown-it 15 等 UI 平台依赖）。
- UI 平台测试/清理：`test/桌面UI/**`、`test/桌面应用/e2e/**`、`test/桌面应用/{hot-path,message-queue,pi-config,diagnostics,ans-wiring}.test.ts`、`test/测试/**`（含 5B 测试域清理与 `retired-5b/`）。
- 旧渲染器删除：`app/renderer/{renderer,styles,engine-selector,markdown,role-status,runtime-ui,tool-rows,ui-labels}.js/css` 与 `app/renderer/vendor/**`。
- 图标资产：`app/desktop/assets/ans-*.png`（品牌 lettermark，入口/打包用）。

## 三、影响判断

1. **Phase 5 判定**：§一列出的改动**不进入** Phase 5 的 G1–G5 台账、AC1–AC8 行为结论或 UIUX 判定；本报告不以其测试结果替代 Phase 5 证据。
2. **构建/共享配置**：§一未修改 `vite.config.ts`、`tsconfig.json`、`package.json`、`package-lock.json`；渲染器源码 `app/renderer/src/**` 未 import `src/common|provider|model|service`（仅有 `@/` 与第三方 import），因此这些运行时改动**不进入 5B renderer dist 产物**，不改变入口/CSP/gzip/静态扫描结论。dist 哈希在冻结候选中保持一致（见 `dist-sha256.txt`）。
3. **被候选/本地包包含**：这些改动确实在候选工作树与本地包内，已由 5B 全量单测、旧基线、main E2E、packaged smoke 间接执行；通过不等同于测试角色对其业务正确性签字，缺陷仍归属主角色。
4. **共享代码风险**：`src/common/shared/atomic-write.ts`、`src/common/runtime-core/fs-write.ts` 等属共享代码，若其行为变化影响主进程持久化，可能间接影响 UI 流程；5B 的 main E2E/packaged smoke 只覆盖既有场景，未对新语义做专门验收。该风险作为**边界**交给 PM/属主，不并入 Phase 5 通过结论。

**结论**：候选分离完成；Phase 5 证据只对 §二范围内的 UI 平台改动下结论。§一改动需由各自属主与 PM 按其变更记录单独验收。
