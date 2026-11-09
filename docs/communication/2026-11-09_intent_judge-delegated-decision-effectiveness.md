# 意图记录：代理审批/代决策的效力等同客户本人（judge 代批须可生效）（2026-11-09）

- 日期：2026-11-09
- 记录角色：ANS 沟通（Communication）
- 客户原话：「替我审批应该等同于我自己审批啊」；随后指示：「开始做」。

## 背景（真实运行观测）

在贪吃蛇真实开发测试中，幕僚发出「意图确认」卡（`intent-confirm`），客户已开启「替我决策」，判断 agent（judge:claude）按唯一推荐项代选 `confirm`（reasonCode `sufficient`，逐项核对了意图文档摘要）。但应用下游 `finalizeIntentConfirmation` 以 `outcome.judge` 为由拒绝生成 `intent-confirmed` 冻结证据（`pending-recovery` / `trunk-item-invalid`），幕僚据此要求客户关闭「替我决策」并本人点卡。客户本人点击后（`by:"customer"`、`operatorId:"51054"`）才通过。

## 客户裁定（本变更依据）

- 客户开启「替我审批」/「替我决策」即为**明确委托**：judge 的代理批准/代选**必须等同于客户本人**的批准/选择，**任何门禁不得仅因其来源为 judge 而拒绝生效**。
- **审计真实性不可弱化**：证据与账本必须如实记录 `by:"judge"`、`operatorId:"judge:<engine>"`、judge 理由与摘要；**不得伪造成 `by:"customer"`、不得伪造 decisionId**。
- 既有回落语义保留：judge `manual`/`deny`/无唯一推荐/不可用 ⇒ 按既有规则退回发起角色（declined）；「关闭开关 ⇒ 原卡回落客户」不变；Q5 高风险清单（发布/删除/支付/外部服务/权限/数据迁移等）既有「即使开关开启也由客户本人」的规则不变。
- 本裁定覆盖所有「客户决策类」卡与由其派生的冻结/生效证据路径；已知被拒绝的是 `intent-confirmed` 冻结（`src/service/trunk/impl/apply-journal.ts`：`finalizeIntentConfirmation` 的 `outcome.judge` 拒绝及 `resolved.by !== "customer"` 约束；约 :1697 的二次来源校验），以及冻结记录数据模型 `DocFreezeRecord.origin` 不含 judge 来源（`src/model/version-change.ts`；`src/service/version-change/impl/freeze-service.ts`）。策划须**全量清点**同类拒绝点（含 `proposal-confirmed` 等），逐一给出处置。

## 非目标

- 不改写既有高风险卡「仍由客户本人」的规则；不关闭客户本人直接确认的路径。
- 不伪造身份/来源；不放宽 judge 不可用时的 fail-closed 回落。
- 发布/tag 不在本变更范围。

## 流程与授权

- 闸门 0：客户以「开始做」明确确认上述理解。
- 闸门 1/2：按既有**预授权与全量委托**（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`；客户「后续你负责……后面我全部同意。不需要我来同意了。」）免逐次确认，由策划出方案（含独立评审）与 B1 标准、统筹出团队计划并派发实施。
- 真实验证：实现后须以真实运行复现「开着替我决策 → 意图卡 judge 代批 → 冻结成功、证据如实记 judge」的全链。
- 提交/推送/PR 按既有授权；**合并仍需客户逐 PR 明确「允许我合并」**；发布/tag 未授权。

## 关联

- 观测证据：`角色卡/测试/docs/change/` 本轮贪吃蛇真实运行（进行中，仓库外 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09`）。
- 既有语义依据：`docs/acceptance/entry-role-minimal-criteria-v1.md` C-05（judge 代批审计如实记 judge、不得写成客户本人；intent-confirm 在 decision 组 rubric 内）。
- 相关模型/服务：`src/model/version-change.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/service/version-change/impl/freeze-service.ts`。
