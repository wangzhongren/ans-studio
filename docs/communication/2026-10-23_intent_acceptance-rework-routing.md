# 意图确认：验收返工自动路由到 Steward（i18n 后实施）

- 日期：2026-10-23
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户明确回复「这个可以，先排上，等这个国际化搞完了，在搞」；随后补充「验收返工路由也是1.7 版本的」）
- 排期：**i18n 全部收口后**再启动方案/闸门/实施；**目标版本 v1.7.0**，在 v1.7.0 发布前完成独立验收。本轮只登记，不写设计、不派发、不改代码。
- 目标版本：**v1.7.0**。本变更与 i18n、目录 v3、治理写卡门禁一起纳入 v1.7.0，但保持**独立方案、独立闸门、独立验收**，不以其他变更的验收结论背书。
- 排期补充（2026-10-23）：客户确认把“rejected 验收后重新派 Proof 的收口门修复”一并排期进 v1.7.0（「可以排期进1.7」）；仍按本变更独立 T3 验收。

## 客户原话

> 主要是，这个验收方他就等着，不去补齐啊，这个也是挺尬的。
>
> 就是说验收报告 客户判断之后的结果，自动转交给 steward 是吗
>
> 这个可以，先排上，等这个国际化搞完了，在搞

## 闸门 1 确认记录（2026-10-23）

- **客户原话**：「确认方案 v1，按推荐 Q1–Q13 A；O1–O4 不做。方案确认不等于实施授权，闸门 2 另行确认。」
- **确认对象**：`docs/planning/2026-10-23_design_acceptance-rework-routing.md` **方案 v1**（951 行；SHA-256 `9ceea6420965185ff7e0fd16675c250c9f2c31ffa45baa43cff159957726a4c5`；blob `92f88c03bdfdc0683e81a07392c0d4975bcbe28a`）。
- **确认结论**：Q1–Q13 均按推荐 A；O1–O4 选装均不做。Q1 只 `accepted` 收口、`rejected` 待返工；Q2 fenced YAML `acceptance-rework/v1`；Q3 固定 Convener；Q4 rejection 后 flow 有实质更新才重派；Q5 无可 supersede 旧步骤时 fail-closed gap；Q6 legacy 保持旧行为；Q7 judge 退回不写“客户拒绝”；Q8 有效项先行、未知 owner 逐项 blocked；Q9 `.ans` routing record；Q10 审计失败不阻塞；Q11 报告 vN+1；Q12 T3/v1.7.0/独立验收；Q13 以账本/flow 为自动依据、升级后允许一次重派（要避免重复可在升级前登记 report-v2）。
- **确认边界**：本次只确认方案 v1，**不等于实施授权**；不授权改代码/测试/角色卡/边界/flow/账本，不授权动 `ans-gateway`。下一步由统筹写团队计划并走闸门 2（角色/写集/顺序/验收安排）；实施前另由内置独立验收冻结 T3 标准，实施授权另行取得；发布前完成独立 T3 验收。方案实质性变更需重开闸门 1。

## 闸门 2 确认记录（2026-10-23）

- **客户原话**：「确认团队计划 v1 的角色、写集、无新增角色/无边界变更、app/main.ts 归桌面窗口、S1–S7 与 T3 验收安排；实施授权另行取得。」
- **确认对象**：`docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md` **团队计划 v1**（389 行；SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`；blob `2e88d2ad39b31911a4c96c8148e79be97e718b44`）。
- **确认结论**：参与角色为编排、桌面窗口、运行时核心、项目管理、测试 5 个现有 worker + 内置独立验收 + 统筹；精确写集按团队计划 §三；**无新增角色、无边界变更**；`app/main.ts` 按权威 `角色卡/桌面窗口/boundary.md` Section 1 归桌面窗口，装配不参与（角色标签校正，非边界变更）；T3；S1–S7；独立验收标准先于实施；目标项目只读；T3 全量回归、真实 Electron、目标复算；不与 i18n/目录 v3/治理写卡门禁合并验收。
- **确认边界**：闸门 2 只确认角色、写集、顺序与验收安排，**不等于实施授权**；不授权派发、改代码/测试/角色卡/边界/flow/账本或动 `ans-gateway`。实施授权另行取得；若角色、写集或顺序实质变化，重开闸门 2。

## 实施授权记录（2026-10-23）

- **客户原话**：「授权按团队计划 v1 与标准 v1 实施 S2–S7；不包含 commit/push/发布/目标项目写入，不新增角色/边界。」
- **授权对象**：团队计划 v1（389 行；SHA-256 `d95fc81733ce824333bad86c74d984c5d045c8545e2373071f8de93c143a48ab`）+ T3 验收标准 v1（961 行；SHA-256 `b62746e9696eb4103718c46386878d7d34a785e5481803749de930128b5de481`）。
- **授权范围**：按团队计划 §三写集与 §四 S2–S7 实施；参与角色 编排、桌面窗口、运行时核心、项目管理、测试；无新增角色/无边界变更；S1 已完成（标准、T3 基线、目标只读快照、边界预检）。
- **明确排除**：不授权 commit、push、合并、发布或对外操作；不授权写 `ans-gateway` 或任何目标项目；不授权改角色卡/边界/枚举/依赖；不授权超出团队计划写集的文件。S7 完成后交内置独立验收按标准 v1 判定；验收通过不自动授权提交或发布。
- **变更控制**：实施中若需改方案、角色、写集或阶段顺序，停止并重开对应闸门（方案实质变更重开闸门 1；角色/写集实质变更重开闸门 2）；不得以实施授权替代闸门。

## 现场事实（只读）

- `ans-gateway` 的 `ai-governance-pipeline` 验收报告 `docs/acceptance/ai-governance-pipeline-report-v1.md` 判“不通过”，§8 给出 F1–F12 及 owner（platform-foundation、qa-verification、convener 等）。
- Proof 只做独立判定，不能改产品、没有派发权；报告不通过后它只能等。
- 应用把判断 agent 的 auto-rework 以 `declined + reason` 退回给**发起验收卡的 Proof**（`app/desktop/customer-input.ts:755-770`），而不是报告里的 Steward/交付角色。
- `governance-advance.ts` 虽识别 `rework-*` 作为 dispatch 证据，但没有创建 `rework-*` 步骤或按 F-item owner 派发的逻辑。
- `src/provider/runtime/tools.ts` 的 `declined` 分支（约 1336/1469）把 judge 的自动退回统一写成“客户拒绝”，未看 `operatorId=judge:*`。
- 判断 agent 提示词要求 reason 可操作、写明“重发给谁”，但应用没有按 reason 路由。
- 2026-10-23 现场复核（`ans-gateway`，只读）：`change-package-v2` 已 `done` 且有 artifact evidence，执行步骤无其他阻塞；但账本 08:05:01 的 verifier `customer.decision{decisionKind:"acceptance", customerDecision:"rejected"}` 被 `evaluateFlowCompletion` 的 `hasAcceptanceDecision` 当成“已有验收决定，流程已收口”，返工后不会自动重派 Proof。现有 `test/桌面应用/acceptance-dispatch.test.ts` 的 rejected 用例也固定了旧行为。

## 沟通的意图理解

1. **只在非通过/返工时转交**：客户选择 `reject`/要求返工，或判断 agent auto-rework 时，应用把验收报告 + 结构化返工清单 + 客户理由交给 Steward/Convener（协调者）。Steward 按清单的 owner 派发任务、必要时建 `rework-*` 流程步骤；Proof 保持独立，不修产品、不直接派发。
2. **客户 accept 不转交**：直接收口；报告不通过但客户尚未决定时，不提前按拒绝处理；客户可以 accept 并明示承担风险。
3. **回执措辞**：judge auto-rework 显示“自动决策未通过，已退回 Steward/交付方返工”并写明接收方；客户手拒才显示“客户拒绝”；不得把 judge 的退回写成客户拒绝。
4. **结构化返工清单**：验收报告模板增加机器可读段（`coordinator` + `items[{id,owner,action,evidence}]`）；自由文本 §8 仅作兜底，不做脆弱解析。
5. **权限不变**：不新增 Proof 写权/派发权；不自动 accept/reject；客户最终决定权不变；Steward 只协调返工，不替客户验收。
6. **返工后可重新验收**：旧 `rejected` 验收决定不得永久关闭流程；rejection 之后 flow 有实质更新（新的 `rework-*`、change-package 或证据）且执行步骤全部完成、验收步骤仍 `pending` 时，应用应允许重新派 Proof；没有新进展时不去重循环。app 仍不自动 accept/reject。

## 非目标

- 不修改 `ans-gateway` 现场流程/账本/角色卡；不代写目标项目。
- 不把“报告不通过”直接当客户拒绝；不自动选择 reject。
- 不扩权、不新增 cardKind/FlowStepKind/Power/Decision 枚举；不改变验收独立性。
- 不与当前 i18n B4、i18n 验收、v1.7.0 发布混在一起。

## 风险档位建议

**T3**：涉及治理流程、验收结果路由、派发行为与 flow 步骤；需要独立方案、团队计划、闸门 2、实施前标准、T3 全量回归与独立验收。补充的 rejected 收口门涉及 `src/common/编排/flow-state.ts`、`app/desktop/interface.ts` 与既有 `test/桌面应用/acceptance-dispatch.test.ts`，同样按 T3 处理。

## 下一步（i18n 后，v1.7.0 发布前）

1. 策划写方案：非通过/auto-rework 的路由、结构化 F-item、回执措辞、Proof/Steward/客户权限边界、rejected 验收的收口/重派语义（只 `accepted` 收口；`rejected` 为待返工；rejection 后需有 flow 新进展才重派）、目标项目只读复算。
2. 统筹团队计划、闸门 2；独立验收标准先于实施。
3. 实施、T3 全量回归、真实 Electron、验收。
4. 与 i18n、目录 v3、治理写卡门禁一起纳入 v1.7.0；返工路由验收通过后再准备 v1.7.0 发布。
