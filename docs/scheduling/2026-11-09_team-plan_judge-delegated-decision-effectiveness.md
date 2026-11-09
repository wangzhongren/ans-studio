# 团队计划：代理审批/代决策的效力等同客户本人（judge 代批生效，2026-11-09）

- **任务 ID**：`2026-11-09-judge-delegated-decision-effectiveness`
- **产品 flowId（拟）**：`judge-delegated-decision-effectiveness`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-09
- **状态**：团队计划已写盘。闸门 0 已由客户「开始做」确认；闸门 1/2 按 2026-11-07 预授权/全权委托免逐次确认；实施待本计划 + 提案卡修复 PR 合并/冻结后放行。**未派发实施（本计划写盘后派发）。**
- **唯一实施基线（方案 P1.2）**：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（686 行 / 88,988 bytes / SHA-256 `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`；P1.1 `72d36242…`/P1.0 `60c68dad…` 历史保留）。
- **独立复核**：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（`de1d0281d9fb6a309a5e231b095aec068bc77bb86e3bc9ad85b8931be430da7d`，362 行；R1.0 F1–F13 + R1.1 窄复核「建议提交、must-fix 0」；P1.2 处置 G1/S1–S3）。
- **B1 v1（冻结）**：`docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`（347 行 / 54,615 bytes / `2517668c819a0ccd0186a425c7ddad6bc1656619a53c5821d3347afccf55bf12`；BASE-1–7、AC-J1–J12、J1–J17、RR-1–7、EV1–6；R-1–9 残余）。
- **意图记录（闸门 0）**：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`。
- **风险档位**：**T3**（治理/权限/审批/审计语义 + 跨运行时核心/编排/trunk/版本变更/门禁共享契约；不压档）。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `fb1aa39e…`（提案卡修复已提交；父 `c1439ce`）；`git status --porcelain -- src app test` 干净。并行变更：提案卡修复（B2 pass `8af767e2…`，PR 提交中，合并待客户逐 PR）；文档格式（P1.2 `886fef84…`，待 B1/团队计划，实施排最后）。
- **串行次序（方案 §10.2，协调方裁决为准）**：提案卡修复（已冻结/B2）→ **本 judge 变更** → 文档格式。同文件单写者；`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts` 与提案卡修复同文件/同区域，实施须在修复提交后。

---

## 一、任务（按 P1.2，不扩大）

1. 新增诚实的 `judge-delegated` 来源/冻结 origin：judge 代批意图确认（及同受拒的 proposal-confirmed）可生成/读取/复核 `intent-confirmed` 冻结；审计如实记 `by:"judge"`、`operatorId:"judge:<engine>"`、`requestId`、reasonCode/reason/selected/cardKind/engine/at；**不伪造 customer/decisionId/actorRoleId**；`applicationId=intent-/proposal-<requestId>`。
2. 仅允许 `intent-confirmed`/`proposal-confirmed` 两个 reason 接受 judge（VCA/修正案等 Q5 客户主权 reason 不允许）；judge manual/deny/无唯一推荐/不可用回落不变；关闭开关原卡回退客户；`request.resolved`/`CustomerInputOutcome` 形状不变（不新增 actionSource）。
3. D3 统一共享纯函数 `requestResolvedD3DecisionId`/`isJudgeD3Resolution`（customer/judge→真实 decisionId；chief-delegated→requestId；null/非对象 fail-closed）；apply-journal/trunk-runtime/classify-shell 统一消费。
4. 旧记录兼容；客户/chief/application/role-direct 路径逐字不变；测试同步（AC-31/F35 显式修订逐条记录，不得静默放宽）。
5. 真实运行（B1 AC-J10/J11/J12）：真实 Electron+真实 Claude+真实 UI，开启「替我决策」→ judge 代批意图卡 → 冻结成功且证据如实记 judge；关闭开关回退；隔离 9223。

## 二、五维判断与角色

| 维度 | 判断 |
| --- | --- |
| 责任独立性 | 保留现有角色，无新增/拆分/合并：运行时核心（model）、编排（trunk/版本变更 service/provider/task-state）、门禁引擎（classify-shell）、桌面窗口（仅测试）、测试；judge 结果生产在既有 desktop（不改产品）。 |
| 范围归属 | 全部路径在既有 Section 1；**H1 delta=0**；`app/desktop/*`、`app/renderer/*`、`run-manifest.ts`、`tools.ts`、`run-role.ts`、`vca-service.ts`、`model/trunk.ts`、`service/gate/*` 明确排除。 |
| 契约影响 | 有：`DocFreezeOrigin`/source、`DocFreezeEvent`、D3 helpers、`doc.freeze` 校验、AC-31/F35 显式修订；契约先行（I0 冻结形状/对账）；无新数据模型。 |
| 证据独立性 | 各 owner 模块测试；测试跨层；B2 独立验收；统筹不判。 |
| 协调成本 | 高但可控：与提案卡修复同文件串行、与文档格式仅 `model/runtime.ts` 重叠；单写者；T3 全量。 |

## 三、写集与 owner（按 P1.2 §5.1/5.2；零重叠）

- 运行时核心：`src/model/version-change.ts`、`src/model/runtime.ts`；`test/runtime-core/direct-role-capabilities.test.ts`、`test/runtime-core/version-change-contract.test.ts`。
- 编排：`src/service/trunk/impl/apply-journal.ts`、`src/service/version-change/impl/freeze-service.ts`、`src/service/version-change/abstract/version-change-service.ts`、`src/provider/version-change/impl/guard-freeze-registry.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/common/编排/task-state.ts`；`test/编排/direct-role-capabilities.test.ts`、`test/编排/version-change-service.test.ts`、`test/编排/task-state.test.ts`、`test/编排/trunk-events.test.ts`。
- 门禁引擎：`src/common/门禁引擎/classify-shell.ts`；`test/门禁引擎/direct-role-capabilities.test.ts`、`test/门禁引擎/git-shell-acl.test.ts`。
- 桌面窗口（仅测试）：`test/桌面应用/decision-service.test.ts`、`chain-enforcement.test.ts`、`run-pin.test.ts`、`run-change-trigger.test.ts`（回归钉）。
- 测试：`test/测试/git-write-chain-fixture.ts`、`direct-role-capabilities-e2e.test.ts`、`version-change-integration.test.ts`；新增 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（可选）。
- **零重叠**：产品文件按 boundary 唯一 owner；测试目录按 owner 不重叠；无 H1。

## 四、阶段计划

| 节点 | 内容 | 前置 |
| --- | --- | --- |
| G2 | 沟通留痕本计划 + P1.2 + 复核 + B1（预授权） | 本计划写盘 |
| W-J1 运行时核心 | `DocFreezeOrigin`/source/校验、D3 helpers、contract 测试 | 提案卡修复冻结/提交 + I0（如需要） |
| W-J2 编排 | apply-journal judge 分支/verifyReviewIntent/筛选/D3；freeze-service；abstract；guard-freeze-registry；trunk-runtime；version-change-runtime 防御镜像；task-state `doc.freeze`；测试 | W-J1（model 类型） |
| **W-J2b amendment（协调方 2026-11-09 批准）** | **nominator-code**：`src/common/roles/nominator/index.ts` `d3-by` 接受集加入 `"judge"`（单行）+ `test/roles/nominator/` 测试；使 judge D3 经 Runtime 包装层 `activateRoleDocuments` 生效（Service 层已通；客户裁定「judge 代批必须生效」覆盖 D3/激活链）；不改其它角色/职责 | W-J2/W-J5（缺口已证） |
| W-J3 门禁引擎 | classify-shell judge D3 + helper；测试 | W-J1（helper） |
| W-J4 桌面窗口（测试） | decision-service/chain-enforcement/run-pin/run-change-trigger 回归 | W-J1/W-J2 |
| W-J5 测试 | 跨层联调（fixture/e2e），可选新增测试 | W-J1–W-J4 |
| D1 | 受影响套件 + 跨层 + typecheck；基线已知红（optional-acceptance、test/编排 22 fail/2 skip）逐条 | W-J1–W-J5 |
| RR | 真实 judge 代批冻结运行（9223/隔离 userData/目标根；1 消息/卡 ≤1/≤20 分钟/首果即停） | D1 |
| E3-F | 全量 T3（参照上一 E3 记录 + 基线已知红）；typecheck | RR |
| E3-B | 变更包（候选/证据/披露/契约修订） | E3-F |
| E3-V | B2（同一独立验收，判据 B1 `2517668c…`） | E3-B |

## 五、验收与证据（要点）

- 候选身份：`src app test` 逐文件 sha256 + 聚合 + manifest；T1/其它变更证据不混入。
- B1 AC-J1–J12/J1–J17/RR-1–7/EV1–6；旧断言改写逐条（AC-31/F35）；known-red 口径（新增确定性失败=0/新 skip=0）。
- 真实运行：开启「替我决策」→ judge 代批意图卡 → 冻结成功，`by:"judge"`/`operatorId:"judge:<engine>"`/requestId/reasonCode/engine 如实；无伪造 customer/decisionId；关闭开关回退；**隔离 9223、不占用贪吃蛇 9222/其根**；预算/停止；证据原件。
- 披露：Q3/Q9/Q10、F7 信任边界、C-05 引用勘误、judge 不结算 appointment/proposal/acceptance（现状）、G1 不截断策略、与文档格式的串行；发布/tag 未授权。

## 六、协调与下一步

1. 提案卡修复 PR 合并/冻结后放行本变更实施（串行；`apply-journal` 同文件）。
2. 文档格式变更排最后（`src/model/runtime.ts` 重叠）；沟通知会其对方案写集的误述勘误（P1.2 §10.1 已记录）。
3. 实施批次完成后 D1 → RR → E3 → E3-B → B2；合并需客户逐 PR 允许；发布/tag 未授权。
