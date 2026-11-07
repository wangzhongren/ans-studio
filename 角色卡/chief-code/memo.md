# 幕僚代码维护角色备忘录（chief-code）

## 2026-11-07 — E1 greenfield：chief 角色模块

- **状态**：E1 本单元实现完成（implemented-unverified；不判验收、不提交/推送/暂存）。E0.3 契约已冻结（`docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`）。
- **交付**：`src/common/roles/chief/`（`index.ts` 唯一 public entry + `internal/` 9 个内部文件）；`test/roles/chief/` 3 个测试文件（41 用例）；`角色卡/chief-code/api-spec.md`；证据 `docs/change/2026-11-07_E1_chief-module-evidence.md`。
- **要点**：
  - 规格数据（card/capabilities/cards）与旧 `governance-roles.ts`/`run-role.ts` 逐字段一致；卡正文的意图入口段复用共享 `intentEntryContractText("chief")`，不复制。
  - `tools()` 按 E1 任务卡声明 5 个 chief 专属 id（trio）；single/未知模型 fail-closed。`closeCreatedTask`/`decidePendingRequest` 因会话模式/独立决策上下文由引擎调用点判定，留给 E2 接口评审。
  - `dispatch()` 按 R-2 只做硬身份/存在性；`reportToRoleId:"chief"` 仅差分期望。hub 纯数据 `CHIEF_HUB_DISPATCH` 可直接供 E2。
  - `preflight` 覆盖 `version-decision`：flowId/action/reason 必填 + 可选 runId/refs/runState/pending；未知键/缺事实 fail-closed；不复制最终校验。
  - `context()` 三段（chief-workflow 资源引用/决策上下文/intent-confirm）；资源 sha256 是数据 pin，资源变化须同步刷新（differential 测试会红）。
- **验证**：`node --test "test/roles/chief/*.test.ts"` 41/41 pass；隔离 `tsc`（本模块+测试）exit 0；模块 import 扫描通过（仅 Model/shared/内部）。
- **风险/遗留**：全仓 `npm run typecheck` 最终复跑 exit 0（过程中 gates-code 在途文件的瞬时 TS2339 已由其修复，非本写集）；E2 切换前旧引擎仍是权威/oracle；i18n key 未登记 locales；`CHIEF_WORKFLOW_RESOURCE.sha256` 需随资源更新维护。
- **续接**：下一步（E2/R-6）由消费 owner 切换工具策略/hub/呈现数据，门面装配 `BuiltInRoleModuleMap` 时删除旧内联规格；届时评估是否把 `closeCreatedTask`/`decidePendingRequest` 纳入模块 `tools()`（接口评审）。

## 2026-11-07 — E2 接口评审 C-1 修复：trio 补入 closeCreatedTask

- **触发**：`docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md` 议题 C-1（X-R6 前置）：chief `tools()` 只声明 5 个 `RoleToolId`，旧 `run-role.ts:1828` 在 `directGovernance` 下为 trio chief 注入 `close_created_task`；按模块 `tools()` 驱动装配会丢该工具。
- **改动**：`CHIEF_TOOL_IDS` 追加 `closeCreatedTask`（6 项，顺序 = 旧注入顺序：五个在前、directGovernance 项在后）；`tools()` trio 返回 6 项；`decidePendingRequest` 维持不声明（仅 `buildChiefDecisionTools` 独立决策上下文）。模块/test/api-spec/证据同步；未改旧引擎、Model、registry、边界、卡、changelog。
- **验证**：`node --test "test/roles/chief/**/*.test.ts"` 41/41 pass（含更新后的 trio 断言与 directGovernance 差分 fixture）；`npm run typecheck` exit 0。
- **遗留**：E2 接线（X-R6）在调用点仍须保留 `directGovernance` 会话模式判定后才真正注入 `close_created_task`；`decidePendingRequest` 仍属独立决策上下文调用点。不判验收。
