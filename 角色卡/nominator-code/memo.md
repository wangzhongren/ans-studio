# 人事代码维护角色工作备忘录

## 2026-11-07 E1：nominator 角色模块 greenfield（implemented-unverified）

- **输入**：E0.3 冻结契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）§3.1/§3.2/§3.3/§3.4/§3.5/§7/§10 D1/D9/D10；团队计划 §4.4④/§7.4；B1 E1.1–E1.7。
- **交付**：`src/common/roles/nominator/index.ts`（唯一 public entry）、`test/roles/nominator/`（单测 + 差分 fixture）、`api-spec.md`、本 memo、证据 `docs/change/2026-11-07_E1_nominator-module-evidence.md`。
- **结果**：模块单测 + 差分 **22/22 pass**；定向与全仓 `tsc --noEmit` 均 exit 0；规格/卡文本/能力位/卡种/工具门控/三文档结构与旧 oracle 0 差异；派发 2 条 fail-closed 差异已列明（旧 oracle 对 chief→builtin 不查 `targetExists`；非 nominator 目标由目标模块回答）。
- **关键决定**：
  - `tools()`：trio 声明 `activateRoleDocuments`；single 空表；未知模型 fail-closed reason。`capabilities` 唯一真源，`tools()` 同引用派生（D10）。
  - `dispatch()`：目标 nominator 只允许真实 `chief` 普通派发，报告期望 `chief`；nominator 不派发；非 nominator 目标不在本模块范围。hub/legacy/review/run/module/报告时点留引擎（R-2）。
  - `preflight`：只覆盖 `appointment`；`stage: "d3-card" | "role-documents"` 两阶段，事实包登记在 api-spec，缺键/未知键/类型不符 deny。**未实现** `resolveWrite`、边界解析、stable-write、账本；不替代 Service 最终校验。
  - `context()`：静态 3 段（D3 卡数据、appointment-write 卡数据、报告期望），无资源引用、不读盘。
- **遗留/交接**：
  1. 新 `messageKey`（`role.nominator.*` / `role.preflight.actionNotCovered`）尚未登记 shared i18n（shared-code 写集）；E2 前由 shared-code/引擎统一登记。
  2. preflight 事实 producer（D3/计划/三文档结构）尚在旧 Service；E2 单元接线时按 api-spec 表提供事实，并保留 Service 最终校验。
  3. `dispatch()` 的模块作用域语义（目标模块 vs 来源模块）需在 E2 接口评审确认消费点；本实现按「与 nominator 相关（目标为 nominator 或来源为 nominator）」fail-closed，非 nominator 目标 deny。
  4. `cards` 的 `appointment-write` 为当前有效兼容卡种（D8）；旧卡文本主路径已改为直接写三文档后 `activateRoleDocuments`。E2 门面兼容映射时确认。
  5. 本节点未改旧引擎/Model/共享/门控/其他角色，未 commit/push，未跑真实模型。
- **续接入口**：先读 `api-spec.md` 的 preflight 事实表与证据文件；代码入口 `src/common/roles/nominator/index.ts`；测试入口 `test/roles/nominator/`。
