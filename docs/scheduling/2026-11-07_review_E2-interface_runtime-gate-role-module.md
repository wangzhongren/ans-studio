# E2 接口评审与处置记录：逐角色差异 / 切换前置

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-07
- **性质**：E2 接线前置接口评审的统筹汇总与处置；不是验收结论；不授权提交/推送/合并/发布。
- **依据**：E0.3 契约（`067e3d2e…`，685 行）、B1 v1/v1.1（`a999dc19…`/`e5027742…`）、团队计划（`00e1f76b…`）§7.5、E1 交付证据（各角色 `docs/change/2026-11-07_E1_*-evidence.md`）。
- **评审输入（只读评估文档）**：
  - 编排：`角色卡/编排/docs/change/2026-11-07_E2_interface-review_orchestration.md`（323 行 / `bdd8f48226ee553399bfd88d65be02f7e06a0927199cb345ba099d2784957551`）；
  - 门禁引擎：`角色卡/门禁引擎/docs/change/2026-11-07_E2_interface-review_gate-engine.md`（334 行 / `9732baec59fca5d9bca59990242db59e258189fd407ea19f48f76073f626b9f9`）；
  - shared-code：`角色卡/shared-code/docs/change/2026-11-07_E2_interface-review_role-i18n-keys.md`（382 行 / `f4b6ae0cff637d6ec94959a5b9210dd28462a411bb686a5ba40efbe6dca5b5af`）；
  - 测试：`角色卡/测试/docs/change/2026-11-07_E2_switch-gate-checklist.md`（885 行 / `ffa763fe049a6849e89963dd76512e20dfee521f576d9be080af72e0d2db4e9f`）。
- **独立复核（门禁引擎）**：六角色模块单测+差分+契约测试 226/226 pass；typecheck 0；module-graph 5/5；旧规格 vs 模块规格 0/6 差异；cards 0/6；派发 allow 位 0 差异（仅内部码差异）；reportToRoleId 7/7。

## 一、评审结论（无“不可执行”硬阻断；X-G 与 X-R1 数据层可立即开始）

| 议题 | 结论与处置 | 后续 |
| --- | --- | --- |
| 派发消费约定（P0/P1） | **来源模块权威**：生产派发门只调用**来源角色**为 `chief`/`convener` 的模块；product/rapporteur/nominator/verifier 的 `dispatch()` 仅作差分证据，不进生产链。**single/su 保留旧路径**（模块 id 不含 su；无条件替换会使 single 派发回归）。 | 写入各 X-R 单元派发单 |
| E2.2 比较口径（P3） | 双跑比较基准 = **公开回执（allow 位、外部 code/message、report 路由）+ 受影响套件**；内部诊断码按映射表比对。E1 已列明的更严/边界差异属 B1 E2.2「方案明确差异」，**登记映射后继续**（无需改 B1）。 | 每单元差分报告附差异映射 |
| i18n（shared-code 评审） | 112 个 `role.*` 键：96 内部诊断（A，不登记）、0 需新增（B）、16 可复用既有 `main.*`（C）。**共享 i18n 零变更**；不登记 `role.*` 命名空间。 | 模块保持内部键；呈现走既有 main.* |
| dispatch 文案来源（F7） | `evaluateDispatchAuthorization` 是客户可见派发文案唯一来源（E0 §4.3 稳定公开只读入口）：E2 只把**判定逻辑**改读来源模块，**保留该入口/文案渲染**；不整段删除。 | 各 X-R dispatch 接线单明示 |
| matrix 展示数据（B7） | `matrix` 留在门禁引擎 `BUILT_IN_ROLE_MATRIX`，不进入角色模块；门面切换逐字迁移。 | X-R6 收口 |
| **D-1（阻断 X-R3 preflight）** | nominator `intentEntryConsistent` 为旧 D3/激活路径不存在的新增强制：选 **(a) 模块调整为可选/诊断或等价豁免**（不改契约、不扩范围）。 | **派 nominator-code 修复**（前置） |
| **C-1（X-R6 前置）** | chief `tools()` 缺 `closeCreatedTask`（旧 `directGovernance` 下 trio chief 注入）：**派 chief-code 补入 `CHIEF_TOOL_IDS`**；`decidePendingRequest` 保持引擎独立决策上下文。 | **派 chief-code 修复**（前置） |
| **P5（X-R5 前置）** | verifier `preflight` 未拒绝未登记事实键（违反 §3.4/D4）：**派 verifier-code 补 `Object.keys` 白名单 + 负例**。 | **派 verifier-code 修复**（前置） |
| context 接线 | 六角色 `context()` 无现消费点；E2 **不接**（另立呈现评审），仅保留模块数据。 | 记录 |
| E0.3 §4.2 陈旧消费者文字 | `intent-entry-contract` 消费者文字（编排/门禁/Pipeline/桌面）待策划下一版本处理；不改当前冻结契约。 | 记录（非阻断） |

## 二、逐单元切换前置与状态

| 单元 | 前置（本记录后） | 状态 |
| --- | --- | --- |
| **X-G 门控** | 无阻断；测试先取 pre-switch 基线；编排切 `trunk-runtime.ts` 调 `src/common/gates/`；gates-code 将 `test/gates/differential-trunk-runtime.test.ts` 转金样；测试更新 `test/测试/runtime-dispatch-gate-integration.test.ts` import 并复跑 | **可开始** |
| X-R1 product | 数据层零差异（评审已测）；dispatch 目标侧不进生产；preflight 只在 `version-change-runtime` direct 路径且 schema 已保证事实 | 可开始（数据层先行） |
| X-R2 rapporteur | 同前；`preflight-run-change-stop` 保留 Service `run-stop-unverified`；**E0.3 §4.2 措辞 vs R-2 按 R-2 口径** | 可开始 |
| X-R3 nominator | **S4 preflight 待 D-1 模块修复**；S1–S3（数据/工具/卡种/dispatch）可先行 | 修复后全单元 |
| X-R4 convener | 来源模块权威（convener 为来源）；保留桌面 `chief-hub-review-owner-required` 与 apply-journal/卡文本限制；git-action 仅角色侧条件（Git Service 另单元） | 可开始 |
| X-R5 verifier | **待 P5 修复**；review preflight 仅在 `prepareReviewTask` 产出 `reviewBasisRef` 后调用 | 修复后 |
| X-R6 chief | **待 C-1 修复**；hub 纯数据与 apply-journal/trunk 五内置一致；`matrix` 保留 | 修复后 |

## 三、证据流水线（每单元固定，from 测试检查单）

1. **pre-switch 基线**（B0 在 E2 写盘后失效，每单元重取）：受影响套件 plain 运行计数/失败分类/候选哈希。
2. **金样冻结**：任何依赖旧引擎 oracle 的测试，在删除 oracle 前转为金样（输入+期望输出+文件哈希）。
3. **双跑差分**：旧/新逐字段（或按 §一 E2.2 口径）一致；差异映射表（方案明确差异）。
4. **回滚演练**：单元内临时开关切回旧实现 → 受影响套件通过 → 恢复新实现；开关与旧实现同批删除。
5. **切换即删**：删除被替换旧实现/符号；引用扫描确认无残留；删除清单入切换日志/变更包。
6. **切换日志**：`docs/scheduling/2026-11-07_switch-log_runtime-gate-role-modularization.md`（统筹维护；每单元：差分、套件、回滚、删除清单、证据链接）。
7. 单元出口 = 上述证据齐备 + 测试复跑（新增确定性失败 0/新 skip 0 相对 pre-switch 基线）。

## 四、状态

- 评审完成、处置已记录；**E2 可启动**（X-G 先行；三项模块修复为 X-R3/R5/R6 前置，已派发）。
- 无需要修改 E0.3 冻结契约/写集的实质问题；无需要客户决策的新增范围。
- 本记录只写 `docs/scheduling/`；未改源码/测试/角色卡/边界；不判验收；不提交/推送/合并/发布。
