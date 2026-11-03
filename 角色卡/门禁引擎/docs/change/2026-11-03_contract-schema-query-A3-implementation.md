# A3 变更记录：策划卡新增 `contract_check` topic 查询两行

- 任务 ID：`2026-11-03-contract-schema-query`（节点 A3：门禁引擎）
- 角色：门禁引擎（独立 worker 上下文）
- 状态：`implemented-unverified`（卡文本两行已实施；`npm run typecheck` exit 0；未经独立验收；未 commit/push、未启动应用）
- 日期：2026-11-03（Asia/Shanghai）
- 基线：worktree `flow-improvements-wave1`；分支 `release/v1.8.4-assets` / HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；Node v24.22.1 / npm 11.19.1
- 依据：方案 P1.3（911 行 / `4d61d376…`）§5.1/§5.2/§8.4；团队计划（539 行 / `a93bd02f…`）§4.3 A3/§5.1–§5.3；V1（725 行 / `1100184…`）AC-11/K5；P1 提案（81 行 / `f44f1b98…`）；P1 审核（293 行 / `d547b90d…`，结论 `recommend approval`，P1-CSQ-10）
- 范围：只改 `src/common/门禁引擎/governance-roles.ts`；不写测试/其它路径；未 commit/push

## 1. 结论摘要

- 在 `RAPPORTEUR_CARD_TEXT` 的产物说明条目之后、`名单是人事招人的唯一依据` 之前，逐字插入方案 §5.1 两行（数组元素，`join("\n")` 后为两行）。
- 卡文本运行时实测：**4246 B / 25 行 → 4612 B / 27 行（+366 B）**；位置/文本与 P1 提案及方案 §5.1 逐字一致。
- `governanceRoleOf("rapporteur").cardText` 仍为活动路径（注册表 → `resolve-role.ts:97-98` → `run-role.ts:1455` → 各 Provider `role.cardText`）；`@deprecated` 历史注释**保留不改**（P1-CSQ-10），来源记录见 §4。
- `npm run typecheck` exit 0（无诊断）；只读预检 `view-image-cards.test.ts` + `list-project.test.ts` + `trio-worker-report.test.ts` 现有用例 **24/24 pass / 0 fail / 0 skip / 0 todo**（A1 的新增卡断言尚未追加；D1 负责最终回归与 T3）。

## 2. 逐文件改动与 before/after

| 文件 | 行数 before → after | blob before → after | sha256 before → after |
| --- | --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | 615 → 617 | `21ccc7bec05609cc3e5e0639ebde972b4ba1f988` → `8926ec3faa354ad2716ae01168d2ec46fa741f54` | `8021761c0e7b767f3a809bb8ffe9a4f799dc6e1738457893cde3541c9439340d` → `e1639969069a90b1aada42850da0bcbf4aac35dbdc4fd1a976f6996ee3842f40` |
| `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-A3-implementation.md`（本记录） | 新增 | — | — |

候选 diff（`git diff -U0`，仅 1 文件 2 行新增）：

```diff
@@ -183,0 +184,2 @@ const RAPPORTEUR_CARD_TEXT = [
+  "- 写模块清单/名单/拓扑前，先 `contract_check({topic:\"modules\"|\"roster\"|\"topology\"})` 取字段表与最小合法 YAML 示例（只读，不构成放行）。",
+  "- 硬约束：`publicContract` 是非空字符串（不能写 true/false）；topology 的 `management` 是含 convener 与全部项目角色 id 的扁平数组（不能写 management.roles）。",
```

## 3. 卡文本实测

- `governanceRoleOf("rapporteur").cardText`：**4612 B / 27 行**（改前 4246 B / 25 行；+366 B）。
- 两行插入位置：产物条目（数组源 `:183`）之后、「名单是人事招人的唯一依据」（源 `:186`，插入后）之前；锚点全文唯一。
- A1 四条断言正则在实施后文本均命中：`/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/`。
- `view-image-cards.test.ts` 禁用字符串零命中（`必须调用 view_image`/`必须真实运行`/`强制证据`/`flow_get`/`request_acceptance` 等）。

## 4. 活动路径与 P1-CSQ-10 落点

- 注册表：`governance-roles.ts:329-332` `rapporteur` → `cardText: RAPPORTEUR_CARD_TEXT`；`governanceRoleOf`（`:470-472`）返回该 spec。
- `src/service/role/resolve-role.ts:58-59` 内置角色 id 保留、项目 `roles` 不能遮蔽；`:97-98` 内置角色无角色卡文件时 `cardText = spec.cardText`。
- `src/pipeline/orchestration/run-role.ts:1455` `adapter.bindRole(setup.role)`；Provider 使用 `role.cardText`：`src/common/pi-adapter/real-adapter.ts:352`、`src/provider/claude/session.ts:192`、`src/provider/codex/session.ts:354`、`src/provider/pi/session.ts:82`、`src/provider/runtime/tools.ts:3616`。
- **P1-CSQ-10 落点**：文件 `:177` 的 `@deprecated` 注释为历史遗留——`f4aa073a`（批次 A）加在 `LIAISON_CARD_TEXT` 上方，`c2b6cf9`（批次 D1）删除该常量时注释残留，现紧邻 `RAPPORTEUR_CARD_TEXT`；它**不是**对 rapporteur 常量停用的声明。**本节点保留注释不改**（改注释属另一文案整理，会扩大 diff 并与 A1/AC-11 证据同步）；已在本记录与 P1 提案 §3/§7 记录来源。
- 若实施发现路径已变，应停止并回报；本次核对仍为活动路径，无停止项。

## 5. 检查与证据

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck`（改后） | **0** | `tsc --noEmit` 无诊断（输出：`> ans-cli@1.8.4 typecheck` / `> tsc --noEmit`） |
| 2 | `git hash-object` + `sha256sum` + `wc -l` | 0 | 见 §2 |
| 3 | `git diff -U0 -- src/common/门禁引擎/governance-roles.ts` | 0 | 仅 2 行新增（见 §2） |
| 4 | `git status --porcelain -- src app test` | 0 | 本节点 `governance-roles.ts` + 并行 A0a/A0b 的 `src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts` + 并行 A1 的 `src/common/编排/workflow-preconditions.ts`；A3 无其它改动 |
| 5 | `node --test --test-concurrency=1 test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts test/编排/trio-worker-report.test.ts`（改后只读预检） | **0** | tests 24 / pass 24 / fail 0 / cancelled 0 / skipped 0 / todo 0 |

- 环境：Node v24.22.1 / npm 11.19.1 / Windows 11 Pro；Git Bash。
- 第 5 项仅为 A3 改后只读预检（现有用例，不含 A1 待追加的两行卡断言）；AC-11 的 `trio-worker-report.test.ts` 新断言由 A1 在 A3 后追加，门禁只读回归与 T3 全量由 D1 正式执行。本记录不把预检当 AC-11 判定。

## 6. 写集与无越权声明

- 本节点改动仅限 `src/common/门禁引擎/governance-roles.ts` 两行 + 本记录；`test/**`、`app/**`、`src/model/**`、`src/provider/**`、其他角色卡/边界/YAML/i18n/README 未改。
- 工作区中 `src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/common/编排/workflow-preconditions.ts` 为 A0a/A0b/A1 并行改动；其它 `角色卡/*/docs/change` 提案/审核/B0 记录为各角色并行产物，均非本节点所写。
- 未 commit / push；未启动应用；未改角色权限/边界/判定；未放宽 parser 接受/拒绝集合。
- 偏差：无。未决：A1 卡断言、D1 回归、E2 验收未进行（按团队计划顺序）。
