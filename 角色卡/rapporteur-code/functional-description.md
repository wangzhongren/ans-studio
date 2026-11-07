# 策划代码维护角色：实际职责、交接与代码位置

## 实际职责

维护产品内置 **rapporteur（策划）** 角色的代码模块：角色卡文本与 Section 1 数据、capabilities、可发起卡种、工具声明、派发判定、动作前置纯策略（detail-amendment 整单 / run-change 三模式 / requirement-change）、上下文提示块（决策上下文 / 报告期望 / decision 卡数据）。

本角色**没有独立的用户可操作业务功能**：模块是纯 TypeScript 数据与纯策略函数，由门禁引擎门面、编排、Service 与桌面窗口消费后才进入用户流程。它是 E0 契约（`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`）下 8 个开发侧维护角色之一，不是产品内置角色扩张。

## 职责边界

- **在模块内**：`BuiltInRoleModule` 的规格数据 + `tools` / `dispatch` / `preflight` / `context` 四个纯策略面。
- **不在模块内**：VCA/run-change Service 事务、停稳证据、账本、会话装配、工具执行、客户卡渲染、报告实际路由、写权/边界判定。
- 模块不携带权限；`allow: true` 只是纯策略不反对，引擎/Service 仍执行全部安全边界与最终校验。
- 旧引擎（`governance-roles.ts` / `run-role.ts` / `apply-journal.ts` 等）在 E2 切换前仍是权威 oracle，本角色只读。

## 输入与交接

| 方向 | 内容 | 来源/去向 |
| --- | --- | --- |
| 输入 | E0 冻结契约、E1 任务、B1 E1.1–E1.7、旧规格/消费点（只读） | 策划 `docs/planning/`、统筹 `docs/scheduling/`、内置验收 `docs/acceptance/` |
| 输入 | 角色卡 / 边界 / YAML / 交付要求 | 人事 `角色卡/rapporteur-code/` |
| 输出 | `src/common/roles/rapporteur/` 模块与 `test/roles/rapporteur/` 测试/差分 fixture | E2 消费者：门禁引擎门面、编排、Service、桌面 |
| 输出 | 本目录 `api-spec.md` / `memo.md` / `docs/change/` 证据 | 统筹排期、独立验收取证 |

## 代码位置（2026-11-07 E1）

| 位置 | 内容 |
| --- | --- |
| `src/common/roles/rapporteur/index.ts` | 唯一 public entry；导出 `rapporteurRoleModule: BuiltInRoleModule` |
| `src/common/roles/rapporteur/internal/spec.ts` | 规格数据（卡文本/条目/预授权/禁写/能力位/卡种） |
| `src/common/roles/rapporteur/internal/tools.ts` | `tools()` 纯策略（trio 3 工具；非 trio fail-closed） |
| `src/common/roles/rapporteur/internal/dispatch.ts` | `dispatch()` 纯策略（R-2 硬身份/存在性） |
| `src/common/roles/rapporteur/internal/preflight.ts` | 三类动作纯策略 + 事实包校验 |
| `src/common/roles/rapporteur/internal/context.ts` | 静态提示块（4 section / 非 trio 不可用声明） |
| `src/common/roles/rapporteur/internal/codes.ts` | 稳定内部码与 i18n messageKey 登记 |
| `test/roles/rapporteur/` | 单测、差分 fixture、模块边界/纯度扫描 |

## 关键外部只读锚点

- 规格 oracle：`src/common/门禁引擎/governance-roles.ts`（rapporteur 行）。
- 工具/卡种 oracle：`src/pipeline/orchestration/run-role.ts`（注入门控 / `TRIO_CARD_KINDS`）。
- 动作服务 oracle：`src/service/trunk/impl/apply-journal.ts`、`src/provider/runtime/schema.ts`、`src/common/编排/decision-card.ts`。
- 派发硬授权 oracle：`src/common/编排/workflow-preconditions.ts::evaluateDispatchAuthorization`。

## 当前状态与遗留

- E1 模块、单测、差分、边界扫描与证据已完成并自测（64/64）；仓级 typecheck 绿。
- 未提交/未推送；未运行真实模型；未判验收。
- 后续（E2）：门禁引擎门面改为装配本模块并删除内联规格；编排/Service/桌面按单元切换并双跑；切换后删除旧实现。差分 fixture 的旧文件 provenance 哈希届时需随删除清单更新。
