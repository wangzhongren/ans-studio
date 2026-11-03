# 门禁引擎 P1 实现提案：策划卡新增 `contract_check` topic 查询两行（A3）

- **任务 ID**：`2026-11-03-contract-schema-query`（flowId/slug `contract-schema-query`）
- **角色**：门禁引擎（Gate Engine），独立 worker 上下文
- **阶段**：P1 实现提案（团队计划 §4.3 A3；P1 入口 = 实施授权 + V1 + B0 已满足）
- **日期**：2026-11-03
- **状态**：**`proposal-only, no code`**。本文只写 A3 的实现口径与证据计划；未改任何源码/测试/其他路径，未 commit/push。提案不是批准；项目管理 P1 审核通过前 A3 不开工。
- **基线**：worktree `flow-improvements-wave1`；分支 `release/v1.8.4-assets` / HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；Node v24.22.1 / npm 11.19.1。
- **依据（只读实测行数 / SHA-256）**：
  - 方案 P1.3 `docs/planning/2026-11-03_design_contract-schema-query.md`：**911 行 / `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85`**（§5.1/§5.2、§7 AC-11、§8.4、§10.2/§10.3）。
  - V1 `docs/acceptance/contract-schema-query-criteria-v1.md`：**725 行 / `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`**（AC-11、K5、§2.3/§2.4）。
  - 团队计划 `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md`：**539 行 / `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c`**（§4.3 A3、§5.1–§5.3、§6.1/§6.3）。
  - 复核 `docs/planning/2026-11-03_review_contract-schema-query.md`：**282 行 / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`**。
  - B0 `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md`：**171 行 / `314f99414bc45e8affb2c782c5a02dc2c557b6909b8ad0ed88bc1c06c1617c1c`**。
- **写入路径**：`角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-P1-proposal.md`（本阶段唯一写盘文件）。

## 1. 写前基线（只读实测）

- 目标文件 `src/common/门禁引擎/governance-roles.ts`：**615 行**；blob `21ccc7bec05609cc3e5e0639ebde972b4ba1f988`；sha256 `8021761c0e7b767f3a809bb8ffe9a4f799dc6e1738457893cde3541c9439340d`；`git status` 干净。
- `governanceRoleOf("rapporteur").cardText` 运行时实测：**4246 B / 25 行**（与方案 §5.2、复核记录一致）。
- `npm run typecheck` 本次只读复跑：**exit 0**；B0 基线 `typecheck`/`typecheck:renderer` 均 exit 0、受影响三组套件 72/72。
- `test/编排/trio-worker-report.test.ts` 工作树干净；A3 **不写**该文件（A1 在 A3 卡文本落地后追加断言）。

## 2. 卡文本改动（唯一改动）

- 位置：`RAPPORTEUR_CARD_TEXT`（:178–193）数组内，**产物说明条目（:183）之后、「名单是人事招人的唯一依据」条目（:184）之前**插入两个数组元素（`join("\n")` 后即两行）。锚点 `名单是人事招人的唯一依据` 全文唯一。
- 文本（方案 §5.1 原文，逐字；直引号）：

```text
- 写模块清单/名单/拓扑前，先 `contract_check({topic:"modules"|"roster"|"topology"})` 取字段表与最小合法 YAML 示例（只读，不构成放行）。
- 硬约束：`publicContract` 是非空字符串（不能写 true/false）；topology 的 `management` 是含 convener 与全部项目角色 id 的扁平数组（不能写 management.roles）。
```

- 实测（只读内存模拟，未落盘）：两行 169 B + 195 B；插入后 +**366 B** → **4612 B / 27 行**。
- 只加这两行：**不重写任何其它卡文本**，不改角色 id/displayName/function、权限、边界、Section 1、`preauthorizedDirs`/`forbiddenWritePaths`/`capabilities`、判定逻辑。
- 与 A1 断言对齐：`/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/` 四条均在模拟文本命中；`view-image-cards.test.ts` 禁用字符串零命中。

## 3. 活动路径核对（只读；结论：**活动路径，无需停止**）

1. `governance-roles.ts:329-332`：`rapporteur` 注册项 `cardText: RAPPORTEUR_CARD_TEXT`；`governanceRoleOf`（:470-472）返回该 spec。
2. `src/service/role/resolve-role.ts:58-59`：内置角色 id 保留、**项目 `roles` 不能遮蔽**；:97-98 内置角色无角色卡文件时 `cardText = spec.cardText`。
3. `src/pipeline/orchestration/run-role.ts:1455`：`adapter.bindRole(setup.role)`；各 Provider 以 `role.cardText` 拼系统提示：`src/common/pi-adapter/real-adapter.ts:352`、`src/provider/claude/session.ts:192`、`src/provider/codex/session.ts:354`、`src/provider/pi/session.ts:82`、`src/provider/runtime/tools.ts:3616`。
4. `:177` 的 `@deprecated` 注释为**历史遗留**：`f4aa073a`（批次 A）将该注释加在 `LIAISON_CARD_TEXT` 上方，`c2b6cf9`（批次 D1）删除该常量时注释残留，现紧邻 `RAPPORTEUR_CARD_TEXT`；它**不是**对 rapporteur 常量停用的声明。结论：HEAD 仍为活动路径，A3 不改注释（见 §7-1）。

## 4. 精确写集与非目标

- **A3 写集**：仅 `src/common/门禁引擎/governance-roles.ts`（两行插入）；A3 证据写本角色 `角色卡/门禁引擎/docs/change/`。本提案只写本文件。
- **不写**：`test/编排/trio-worker-report.test.ts`（A1）、`test/门禁引擎/**`（只读回归）、其它角色卡/测试、`src/model/**`、`src/provider/**`、`app/**`、共享 i18n、README、边界/YAML/changelog、`docs/scheduling|acceptance|communication|planning`。
- 不 commit / push / 启动应用；不接触客户。

## 5. 测试映射

| 项 | 落点 | 说明 |
| --- | --- | --- |
| AC-11 卡文本/两行位置 | A3 实施证据 + A1 `test/编排/trio-worker-report.test.ts` 断言 | A1 在 A3 后追加，至少锁工具名 + topic + 两硬约束；A3 不自评 AC-11 |
| AC-11 卡内容守卫 | `test/门禁引擎/view-image-cards.test.ts`（只读回归） | 禁用项零命中；无长度硬上限 |
| AC-11 角色列表/卡非空 | `test/门禁引擎/list-project.test.ts`（只读回归） | 内置角色顺序/`cardText` 非空不变 |
| A3 自检 | `npm run typecheck`（exit 0） | 仅类型；测试由 A1/D1 负责 |
| T3 回归 | D1 全量（B0 基线 3462/3435/9 项既有 Windows EPERM/18 skip） | A3 不重复；D1 对照 B0 判新增失败=0、新增 skip=0 |

## 6. T3 证据（A3 退出时产出）

1. **卡文本字符串/长度**：改前 4246 B / 25 行；改后重测（预期 **4612 B / 27 行 / +366 B**）；`governanceRoleOf("rapporteur").cardText` 原文摘录含两行及位置。
2. **活动路径核对**：§3 的 file:line 证据 + 运行时实测记录；若实施时发现路径已变（如被项目卡覆盖/迁移），**停止并回报统筹**，不擅自迁移/扩大写集。
3. **`npm run typecheck` exit 0**：原始输出/退出码（B0 基线 0；A3 改后复跑）。
4. **无权限/边界变化**：diff 仅限 `RAPPORTEUR_CARD_TEXT` 两行；`entries`/`preauthorizedDirs`/`forbiddenWritePaths`/`capabilities`/角色 id/function 零 diff；无新增 i18n key。
5. **候选身份**：改前/改后 blob + sha256、`git status --short`、仅写集 diff；未 commit/push。

## 7. 风险与 PM 裁决点

| # | 风险/裁决点 | 说明与建议 |
| --- | --- | --- |
| 1 | `@deprecated` 注释与活动路径 | 注释是 `c2b6cf9` 删除 `LIAISON_CARD_TEXT` 的残留，易被误读为 rapporteur 卡停用。本任务按两行写集**不改注释**；是否清理交 PM 另定（若改注释，属文案变更，需与 A1/AC-11 证据同步）。 |
| 2 | 卡长 | 4246 → 4612 B（+8.6%），仍是六卡最大；无硬上限（`view-image-cards` 只查禁用项）。若 PM 要求控制长度，备选是仅保留第一行（需方案 §5.2/§8.4 变更并由 PM/策划裁决）。 |
| 3 | 文案精确措辞 | 采用方案 §5.1 原文（直引号 `"`）。任何改字都会使 A1 正则/AC-11 证据失效；A3 不自行润色。 |
| 4 | 与 A1 断言对齐 | A1 断言在 A3 之后追加；A3 不改测试、不预写断言。若 A1 复审要求不同正则，需先同步文案再实施。 |

## 8. 声明

- 本阶段**未写代码/测试**，未改任何写集外路径，未 commit/push；仅写本提案文件。
- 本文不构成 P1 批准或验收结论；A3 开工以项目管理 P1 审核 `recommend approval` + 统筹派发为准。
