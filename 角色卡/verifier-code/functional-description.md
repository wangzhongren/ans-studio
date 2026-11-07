# verifier-code 实际职责、交接与代码位置

## 实际职责

维护产品内置 verifier（质检）角色模块：角色卡文本与 Section 1 条目、capabilities、cards、工具/派发策略、review 目标（含 CID/最终候选/criteria）角色侧前置策略、acceptance 卡数据与报告期望。产物是纯 TypeScript 数据与纯策略函数，由 Service 与桌面窗口的 review/acceptance 路由按 E0.3 冻结契约消费。

**不做**：验收判定（归内置独立验收）、Git 候选证据核验、账本、会话装配、工具执行、客户卡渲染、派发路由/报告时点（留引擎/Service/编排）。旧引擎在 E2 切换前仍是权威；本角色不写旧引擎/Model/shared/gates/其他角色。

## 交接输入

- 冻结契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` E0.3（`067e3d2e…`）。
- Model 公开类型：`src/model/role.ts`（`BuiltInRoleModule` 等；门禁引擎维护，只读）。
- 旧规格/消费点（只读 oracle）：`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/common/编排/workflow-preconditions.ts`、桌面 review/acceptance 路由。

## 交接输出

- `src/common/roles/verifier/index.ts`：`verifierRoleModule: BuiltInRoleModule`（唯一 public entry）。
- `test/roles/verifier/`：单测 + 差分 fixture（旧/新逐字段对照）。
- `角色卡/verifier-code/api-spec.md`：public API/事实键/错误码/差分结论。
- `角色卡/verifier-code/docs/change/`：变更证据（哈希、测试计数、写集/import 扫描、遗留）。

## 代码位置

- 模块：`src/common/roles/verifier/`（模块根只有 `index.ts`）。
- 测试：`test/roles/verifier/`（`verifier-module.test.ts`、`verifier-differential.test.ts`、`fixtures/`）。
- 导航：`feature-map.md`；续接线索：`memo.md`。
