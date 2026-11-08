# 变更记录：E3 范围扫描与静态检查（会话创建准入按操作审批，2026-11-08）

- 任务节点：**E3-F 辅助范围扫描/静态检查**（团队计划 §5.5 E3-F；派发记录 §三 §五）
- 角色：测试（只取证，不判验收）
- 日期：2026-11-08
- **文件区分**：本文件是**本变更**的扫描记录（`_session-admission` 后缀）。上一变更的 `角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks.md`（312 行 / `73175db7…`）及其同名目录为**既有证据（B2 已引用）**，本任务**未覆盖、未改写**。本记录的原始日志在 `2026-11-08_E3-scans-and-checks_session-admission-evidence/`。
- 纪律：只读产品/测试源码；只写 `角色卡/测试/docs/change/`；未改任何代码/配置；未 commit/push。

## 1. 静态门（exit 0）

| 命令 | exit | 日志 |
| --- | --- | --- |
| `npm run typecheck` | **0** | `…-evidence/static-typecheck.log` |
| `npm run typecheck:renderer` | **0** | `…-evidence/static-typecheck-renderer.log` |
| `npm run build:renderer` | **0**（仅既有 Vite chunk/动态导入提示） | `…-evidence/static-build-renderer.log` |

## 2. 范围扫描（仅限本变更删除/收窄项；原始输出 `scope-scans.log`）

| # | 检查 | 结果 |
| --- | --- | --- |
| 1 | `hasUnconfinedScriptTools` 零引用 | **仅 1 处退役注释**（`src/service/runtime/session.ts:244`），无任何代码引用 |
| 2 | `required-scope-unconfined-script-tools` 生产路径零产生 | **仅 1 处退役注释**（`session.ts:245`）；`src/` 无产生点 |
| 3 | `runtime-protected-scope-unmediated-app-execution-planned` 零产生 | **仅 1 处退役注释**（`src/pipeline/orchestration/run-role.ts:748`）；旧门删除，替换为防御断言（`protected-scope-approval-chain-unproven`） |
| 4 | 死 `readonly:git` 规则已删 | `classify-shell.ts` 仅保留 `allow:readonly:git:<id>` 前缀（新 ruleId）与删除说明注释（`:1112/:1996/:2137`）；`defaultReadOnly()` 无死条目；规则集 id = `ans-default-v4` |
| 5 | `SHELL_RULES_VERSION` 全仓仅 v4 / v3 残留 | `SHELL_RULES_VERSION = "4"`（`classify-shell.ts:1115`，全仓唯一定义）；**`ans-default-v3` 零命中**。`version:"3"` 命中 2 处：①`test/roles/product/fixtures/product-differential-fixtures.ts:333`（`baseTrunk` 夹具，与 shell 规则集无关）；②`test/门禁引擎/readonly-git-matcher.test.ts:308`（**故意的 v3 负例**，断言整条拒绝）。`validateRules` 只接受常量版本（`classify-shell.ts:1186-1187`）⇒ 外部/项目级 v3 pin **fail-closed**（不静默放宽），与设计 §4.4/I0-5 一致 |
| 6 | matcher/规范体单一来源 | `matchReadonlyGit`（`classify-shell.ts:1532`）与 `buildReadonlyGitBody`（`:1698`）**唯一定义**（`grep` 定义点仅该文件 2 个函数）；`src/service/gate/shell-rules.ts` 逐字再导出（同一引用，非复制）；消费方 `shell-gate`/`run-role`/`git-command`/trunk 公共出口均经 `shell-rules` 导入；`shell-write-guard` 在同一 owner 私有模块内 import 同一函数；**无第二份 matcher/规范体实现** |

## 3. 结论（只陈述事实）

- 本变更的退役码/旧门/死规则均无生产产生点（仅保留退役注释供历史对照）；规则集版本单一 v4 且 v3 fail-closed；只读 Git matcher/规范体为单一来源；静态门全绿。
- 本记录不判验收；E3 出口由统筹/独立验收按 B1 v1 判定。

## 4. 证据索引

目录：`角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks_session-admission-evidence/`

| 文件 | 说明 |
| --- | --- |
| `static-typecheck.log` / `static-typecheck-renderer.log` / `static-build-renderer.log` | 静态门原始日志 |
| `scope-scans.log` | 上述 6 项扫描的原始 grep/sed 输出 |
| `evidence-index.md` | 逐文件 SHA-256/行数/bytes |

> 本记录 SHA-256 于写盘后计算并在交付回报中给出。

- 证据索引 `evidence-index.md`：SHA-256 `478c0e44b0e9f8fb08cda8823ad9f1f6dce9581fc853ded017210c3b0e261172`（10 行 / 622 bytes；4 个文件）。
