# E0 契约评审记录（冻结前）：运行时门控与角色模块

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-07
- **性质**：E0 评审汇总与处置记录；**E0 尚未冻结**。不是验收结论，不授权提交/推送/合并/发布。
- **评审对象**：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（**E0.1**，574 行 / 43032 bytes / SHA-256 `3830fe636849a89e5f604546420cffc0e78f862ab1e345cf4904b91ae1ed04b9`；实测一致）。
- **输入**：P1.6（`24150207…`）、B1 v1（`a999dc19…`）与 **B1 v1.1**（`e5027742…`，冻结脏基线/挂起口径）、团队计划（`00e1f76b…`）、H1 卡片/边界、B0 基线（`13553505…`）。

## 一、评审参与方与评估结论

| 参与方 | 形式 | 结论摘要 | 评估证据 |
| --- | --- | --- | --- |
| 运行时核心 | 只读评估 | **无 blocking**；F1 契约 §5.1 import 路径错误（`../model/runtime.ts`→`../../model/runtime.ts`，照抄 typecheck 必败）；F2 Model 内 type-only 双向边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）需在冻结记录/扫描口径豁免「无环」字面；F3 资源根语义/loader owner/pin/context 装配契约缺口（最迟 E1 接口评审）；F4/F5/F6 低危措辞/类型注记 | `角色卡/运行时核心/docs/change/2026-11-07_E0_contract-assessment_runtime-core.md`（124 行 / `ff9c9d0b1869e640f9f784b9babfe8efc576861449ec42c70f5467330cde53a8`） |
| 编排 | 只读评估 | **2 项 blocking**：Q5 `RoleToolId` 闭集不完整（8+1 个现有角色专属工具有缺口）；Q3 `RoleDispatchPolicyInput` 不能表达 hub/legacy/review 路由、convener run/module 规则与报告时点。另：reason 触发文字 3 处与实现不符（文档修订，不改 P1 行为）；E0 §0 锚点漂移；`RoleToolPolicy.capabilities` 双来源；E1 过渡期权威规则需写明；chief-workflow/intent-confirm 迁移归属未定义 | `角色卡/编排/docs/change/2026-11-07_E0_contract-assessment_orchestration.md`（196 行 / `3b181122c950772d6d358bed8d9e1ed9d7394c1aa32243284a938fb3af709fea`） |
| 门禁引擎 | 实施 D1–D8 | D1 已落（`RoleToolId` 五 id + `tools: RoleToolId[]`）；D2 类型已落，完整 `builtInRoleModules` map **未导出**（零数据复制替代：`builtInRoleModuleDataOf` 门面 lookup；理由与 E1/E2 装配计划记录在案）；D3/D4/D5 已落；D6/D7/D8 迁移注释；**Q5 缺口清单（8+1）已报** | `角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md`（314 行 / `971dadde6b30b1b1696cbfdaec7af289b8c62b8df83a2a700f735758e6e80c95`） |
| Pi适配器 | 实施 P-1/P-2/P-3 | P-1 server tools 启用即无应用面事实（fail-closed；默认关闭不变，仅内部诊断码）；P-2 `wrapSession` 条件转发（inner 无方法保持缺失）；P-3 新测试 4 例；Pi 套件 41 文件 357/354/2/0/1 → 42 文件 361/358/2/0/1（新增失败 0/新 skip 0）；typecheck 0 | `角色卡/Pi适配器/docs/change/2026-11-07_E0_pi-server-tools-and-wrap-session-evidence.md`（141 行 / `66d80254308aa9110a33a949e56a4eb85cab364163c8eebb48ba9f910ea3142f`） |
| Claude适配器 | 只读评估 | **无 blocking**；字段/WebSearch/外来 MCP 与 E0 一致；无写集/无变更；4 项低危文档澄清（unknown 层级、外来 MCP 括注、Q11 标题、nativeInstanceId 同源位置） | `角色卡/Claude适配器/docs/change/2026-11-07_E0_contract-assessment_claude-adapter.md`（108 行 / `2bef486e326342bcc22c4ee9821ea7c197f407b5a6abfcdeaf662d58b35538e8`） |
| Codex适配器 | 只读评估 | **无 blocking**；字段/严格路径逐字保留/外来 MCP fail-closed 一致；无写集/无变更；4 项信息级 | `角色卡/Codex适配器/docs/change/2026-11-07_E0_contract-assessment_codex-adapter.md`（62 行 / `320939d8e39930841e7bcd0a85f0ad425110c4fe0674ed72c68e840847070203`） |
| 测试 | （B0/B1 输入） | B0 冻结脏基线 + 22 条差分 fixture 清单已作为 §7 基线输入；P1-D 六套件对照通过 | B0 `13553505…`；P1-D `91e5cbe7…` |
| 独立验收（可判性） | **待沟通安排** | B1 E0.1–E0.9 映射已由 E0 文档 §8 给出；正式「可判性」确认由沟通启动的独立验收主上下文出具（统筹不启动内置管理角色） | 待补 |

## 二、冻结前必须的契约文档修订（**blocking，交策划出 E0.2**）

> 以下 5 项需策划修订 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.2），修订后重新评审受影响部分。统筹不修改策划文档。

| # | 问题 | 证据 | 建议修订 |
| --- | --- | --- | --- |
| R-1（blocking） | **Q5 `RoleToolId` 闭集不完整**：E0 五 id 仅覆盖 chief 专属；现有「角色专属额外注入」还有 `requestRequirementChange`（rapporteur/convener）、`submitVersionChange`（product/rapporteur）、`selectRunChange`（rapporteur）、`completeTeamPlan`（convener）、`activateRoleDocuments`（nominator）、`closeCreatedTask`（chief/convener）、`submitRefactor`（convener）、`requestStableWrite`（convener）、`decidePendingRequest`（chief 独立决策模式） | 编排评估 §1（`run-role.ts:1814-1830,1903-1905`；`provider/runtime/tools.ts:4190-4194`）；门禁引擎 Q5 清单 | 二选一并写清：**(a) 扩闭集**至完整 14 id 并补「RoleToolId→运行时工具名（snake_case）」映射；或 **(b) 明确本闭集只覆盖 chief 五 id**、其余由引擎按角色装配至 E2（并说明 E1 模块如何表达）。推荐 (a)。同时更正「由门禁引擎按 run-role 核对」的归属表述（run-role 属编排） |
| R-2（blocking） | **Q3 `RoleDispatchPolicyInput` 范围**：四字段无法表达 hub/legacy/review 路由、convener run/module 规则与报告时点 creator | 编排评估 §3（`trunk-runtime.ts:935,963`；`apply-journal.ts:3505-3558,3679-3721`；桌面 `session.ts:8936-8958,9081`；`workflow-preconditions.ts:1596-1604`） | 明确 `dispatch()` 只做**硬身份/存在性判定**；run/module/review 路由留引擎；`reportTargetForTaskCreator` 保持编排稳定入口；模块 `reportToRoleId` 作为差分期望（本版不新增字段）。如坚持 convener 模块拥有模块规则，需新增可选事实并重开接口评审 |
| R-3（blocking-accuracy） | §5.1 import 路径错误：`../model/runtime.ts` 应为 `../../model/runtime.ts` | 运行时核心评估 F1 | 更正 import 路径 |
| R-4（准确性） | §5.3 三处触发文字与实现不符：`custom-factory`（严格路径只拒 `custom-override`，demo provenance 可通过）、`application-mediation-ambiguous`（严格路径对 `applicationMediation !== undefined` 即拒，含 unknown）、`parent-kind-invalid`（实现允许 `undefined`） | 编排评估 §2（`trunk-runtime.ts:796-797,783`；测试 `trunk-dispatch-parent.test.ts:82-92,166-190`） | 按实现精确化文字（不改 P1 行为） |
| R-5（一致性） | §0 锚点漂移：文档称门禁引擎草案 +208/−1、契约测试 337 行；当前草案（D1/D2 后）354 行 / 399 行 | 编排评估 §7；门禁引擎证据 | 更新锚点或改为「起草时锚点；D1–D8 落地后以证据文档为准」 |

## 三、Q1–Q12 处置建议（供 E0.2/冻结记录采用）

| Q | 处置建议 | 依据 |
| --- | --- | --- |
| Q1 共享 public entry | **确认**：保持 per-component public entry，不新增伞状 `index.ts` | 运行时核心/编排无异议；shared-directories 修订一致 |
| Q2 `TrustedToolPolicyInput` 最小面 | **维持最小（仅 governanceModel）**；宿主事实留在注入层 | 运行时核心 F4/Q2、编排 §6 均判断无需扩展 |
| Q3 dispatch 范围 | 按 R-2 明确为硬身份矩阵 | 编排评估（blocking 澄清） |
| Q4 资源根 | **默认应用资源根、本版不增 `root` 字段**；loader owner/版本/hash 与 `RoleContextSection[]` 装配规则列入 E1 接口评审 | 运行时核心 F3（非冻结 blocking） |
| Q5 RoleToolId | 按 R-1 处理（推荐扩闭集 + 映射） | 编排/门禁引擎 |
| Q6 编排公开只读入口 | **确认不迁移**；所有权/唯一实现证据充分（无第二实现/复制；打包副本与证据副本在 E3 扫描排除） | 编排评估 §4 |
| Q7 Pi server tools | **确认**「启用即不提供应用面事实（fail-closed）」；不新增 Model 字段 | Pi P-1 已落 |
| Q8 wrapSession 转发 | **确认**；另记录：Pi 其他 native 方法（`inspectNativeToolSurface`/`inspectLifecycle`/`stopAndInspect`）legacy 路径也未转发——不属于本 E0 范围，Pi 适配器按需在后续接口评审处理 | Pi P-2；运行时核心 F6 |
| Q9 gates 类型/所有权 | **确认**：`src/common/gates/index.ts` 使用 §5.1 类型；P1 D-minimal 本地类型 E2 删除/别名 | 契约 §5.4；编排 D7 评估 |
| Q10 nativeInstanceId | **确认**：P1-A Amendment-1 必填字段纳入 gate accepted evidence | 运行时核心/Claude/Codex 评估一致 |
| Q11 客户可见限制复述 | **确认不重开**；文字按 Claude/Codex 建议澄清（标题覆盖 L1–L3） | 三适配器评估 |
| Q12 共享目录迁移/测试历史名 | **确认**：catalog 迁至 shared-code 目录（E1 单写者）；`test/项目管理/shared/` 历史名保留 | H1 落地；shared-directories 修订 |

## 四、非 blocking 处置与记录项（写入冻结记录）

1. **E0.6/E3.5「无环」扫描口径**：豁免 Model 内 type-only 边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；冻结记录与扫描脚本口径明示「禁止 value import 反向/环，type-only 共享原语单列」。
2. **D2 门面的替代方案**：接受 `builtInRoleModuleDataOf`（零复制 lookup）作为 E0 产物；完整 `builtInRoleModules: BuiltInRoleModuleMap` 在 E1 六模块落地后由门面装配、E2 切换时删除内联规格（记入冻结记录的迁移清单）。
3. **`RoleToolPolicy.capabilities` 与 `GovernanceRoleSpec.capabilities` 双来源**：在 E1 接口评审前声明唯一真源（建议以模块数据为唯一，策略输出仅作派生），并加类型/测试约束。
4. **E1 过渡期权威规则**：旧引擎（`governance-roles.ts`/`run-role.ts`/`apply-journal.ts`）在 E2 切换前保持权威；模块构建与差分以旧引擎为 oracle；E1.6 可判性依赖此声明。
5. **chief-workflow/intent-confirm 数据迁移归属**：当前实现位于 `provider/runtime/tools.ts` 与 `run-role.ts`；E0 §3.2 列为 chief 模块内容——E1 接口评审须明确迁移边界与差分方式。
6. **reason 码闭集**：18 项与 P1-C 实现逐项一致（字符串层）；文档触发文字按 R-4 修正后更可判；B1 N22 等按「拒绝」取证，不硬编码单一 reason。
7. **P1 本地类型/夹具**：E2 切 gates 时换完整 Model 类型并补齐测试夹具必填字段（D7/D9 预期工作）。
8. **Pi `ANS_PI_SERVER_TOOLS` 真机**：本 E0 仅离线桩件；启用时真机派发拒绝未实测（如实标注）。

## 五、E0 出口状态与下一步

- **E0 未冻结**：存在 R-1/R-2 两项 blocking 文档修订（R-3 为准确性阻断）。B1 E0.1–E0.9 中 E0.1/E0.2（public API 清单齐备/契约细化）与 E0.6（无环口径）在修订前**不可判**；E0.3–E0.5/E0.7–E0.9 已具备可判输入（待独立验收确认可判性）。
- **下一步（按序）**：
  1. 沟通转策划：按 §二 R-1～R-5 出 **E0.2**（只修订受影响部分；版本递增；哈希更新；不改 P1.6/B1/H1）。
  2. 门禁引擎：按 E0.2 的 Q5 处置落地（若扩闭集：`RoleToolId` 扩展 + 映射 + 测试；若保持五 id：写明装配规则）；更新 D 证据。
  3. 统筹：复评 R-1～R-5 关闭情况；取得独立验收「E0 可判性」确认（沟通启动）；写冻结记录 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（契约路径/版本/SHA-256、评审参与方与结论、Q 处置、delta 落地证据、B1 E0.1–E0.9 可判性）。
  4. 冻结后通知沟通 → E1 派发（八角色并行）。
- **纪律**：本记录只写 `docs/scheduling/`；未改方案/契约/产品/测试/角色卡/边界；不判验收；不提交/推送/合并/发布。
