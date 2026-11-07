# convener-code 工作备忘录

## 当前状态（2026-11-07，E1）

- 模块 `src/common/roles/convener/index.ts` 已落地：`convenerRoleModule: BuiltInRoleModule` + `CONVENER_WORKER_DISPATCH_TARGETS` 纯数据。
- 测试 `test/roles/convener/`：单测 19 + 差分 11 = **30/30 pass**；`npm run typecheck` exit 0（全仓，运行时点见证据）。
- 差分对照：`governance-roles.ts` 零复制投影、`run-role.ts::TRIO_CARD_KINDS`、`role-tool-registry.ts` D1 允许集、`workflow-preconditions.ts::evaluateDispatchAuthorization`；已登记 3 个模块更严格的 dispatch 差异 + 2 类 team-plan fact 类型校验差异（见 `api-spec.md` §4/§5.1）。
- 证据：`docs/change/2026-11-07_E1_convener-module-evidence.md`。
- 未提交/推送；未运行真实模型；不判验收。

## 关键决策

- **R-2**：`dispatch()` 只做来源/目标身份与存在性；run/module/D3/roster/交付属主与报告时点留在引擎。worker 目标以 `CONVENER_WORKER_DISPATCH_TARGETS` 纯数据导出。
- **存在性 fail-closed**：`targetExists` 缺省按 false；内置 verifier 也要求宿主显式 `true`（与旧谓词差异已登记）。
- **D5/Q4**：项目 `docs/workflow.md` 不写成 `resources`；`context()` 文本说明由宿主提供 path/version/hash。
- **preflight 严格事实包**：只读 api-spec 登记的键；未知键/缺键/类型不符 deny；不复制 Service/Provider 最终校验。
- Git 动作前置只消费宿主已核验事实（身份/task/run/base/owner/evidence 布尔与结构），不实现 Git 执行/ACL/证据闭包。
- `tools()`：trio 五项；single 保留旧角色门控两项；未知模型空集 + reason。

## 下一步（E2 / 接口评审）

1. 门禁引擎门面装配 `BuiltInRoleModuleMap`，逐单元删除 `governance-roles.ts` convener 内联规格（D2/D6）。
2. 消费方切换：`run-role.ts` 工具/卡种、`apply-journal.ts` hub/team-plan/git 路由、桌面路由改读模块数据；宿主显式提供 `targetExists` 与 §5 事实包。
3. i18n：`role.convener.*` 消息键在用户可见呈现接入时统一评审/补文案。
4. 保持旧代码冻结；差分 oracle 仍是旧引擎，切换前不得删除旧实现。
