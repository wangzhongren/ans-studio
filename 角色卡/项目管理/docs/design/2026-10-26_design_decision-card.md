---
id: decision-card
type: design
title: 决策卡（cardKind="decision"）——材料性选择交客户、推荐项唯一、与验收分离
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: rules-only
revision: 1
related: [judge-governance-cards-review, proof-gate-reviews, acceptance-triage, invalid-governance-card-guard]
events:
  - date: "2026-10-26"
    kind: created
    summary: 客户新增 decision 卡规则（经任务转达）：主理发现材料性选择不得自定，交统筹发 request_choice(cardKind="decision")；卡内恰好一个推荐项；开启「替我决策」时判断 agent 默认推荐；decision 卡独立于提案/任命/验收，不是客户批准，不触发 gate/验收。项目管理只登记规则、共享 i18n（9 key）、变更记录与工程法案第 13 条；未改模型/编排/桌面/门禁卡，本批未实现、未验证、未验收；其他角色的 decision 卡在飞改动已只读核对，未验证。
---

# 决策卡（decision）：材料性选择由客户决定

> **本轮性质：规则登记（`rules-only`）。** 客户规则已确认；运行时/编排/桌面/门禁卡已有其他角色的未提交在飞实现，**本批未验证、未验收**。本文只登记客户规则与本批冻结的用户可见文案契约。`request_choice(cardKind="decision")`、推荐项字段、判断默认推荐、卡校验与桌面/编排接线属于模型、编排、桌面窗口、桌面UI、门禁卡等属主，须各自授权实施与验收。本批（项目管理）只补共享 i18n、变更记录与规则同步，未改任何能力角色代码。

## 一、客户规则

客户 2026-10-26 新增规则（经主控任务转达；工作树内未见对应 `docs/communication/**` 原文，本记录不伪造沟通文件）：

> 主理发现材料性选择不得自定，交统筹发 `request_choice(cardKind="decision")`；卡内恰好一个推荐项；开启「替我决策」时判断 agent 默认推荐；decision 卡独立于提案/任命/验收，不是客户批准，不触发 gate/验收。

拆成可执行的行为：

1. **主体与通道**：主理（Lead/liaison）遇到**材料性选择**（会影响目标、范围、方案取舍或客户可感知结果的选项）时不得自行拍板；由主理交给统筹（Steward/Convener），统筹以 `request_choice(cardKind="decision")` 向客户发决策卡。
2. **推荐项唯一**：每张 decision 卡**恰好一个推荐项**；推荐项是建议，不是客户决定，也不替客户选择。
3. **默认代批**：「替我决策」开启时，判断 agent（judge）**默认选择唯一推荐项**；判断不得自行发明选项或改动推荐。代批结果必须标 `judge 代批 · 代决策（自动代理）`，**不得写成客户本人**。
4. **与验收分离**：decision 卡独立于提案接受、任命、验收；**不是客户批准、不等于验收通过、不是 gate**；选择结果仅记录材料性选择，**不作为验收/提案/任命决定记账**（应用按 `decisionKind="material-choice"` 单独审计留痕，门禁/收尾/分诊不读它），**不触发 gate 复核、不触发或替代验收**；最终验收与客户批准仍按工程法案第 9、11、12 条及既有验收卡链路执行。
5. **结构 fail-closed**：缺少唯一推荐项、参数非法或卡种不属于允许范围时，**不得向客户发卡**；发起方与应用应如实回执并修正后重试，不得伪造推荐项或代选。

## 二、本批冻结的用户可见文案契约

共享 i18n 新增 9 个 key（zh-CN/en-US 同 key、同语义；详见 [`docs/change/2026-10-26_change_decision-card.md`](../change/2026-10-26_change_decision-card.md)）：

| 类别 | key | 用途 |
| --- | --- | --- |
| 卡面 | `ui.decisionCard.title` | 决策卡标题（材料性选择） |
| 卡面 | `ui.decisionCard.notApprovalBadge` | 「非客户批准」徽标 |
| 卡面 | `ui.decisionCard.recommended` | 唯一推荐项的「推荐」标识 |
| 回执 | `main.decisionCard.selectedRecommended` | 客户选择推荐项 |
| 回执 | `main.decisionCard.selectedOther` | 客户选择非推荐项 |
| 回执 | `main.decisionCard.judgeSelectedRecommended` | 判断代批按推荐项记录（标自动代理，不是客户本人） |
| 系统行 | `main.decisionCard.notApproval` | 决策卡不是验收/客户批准，不构成验收/提案/任命决定，不触发 gate/验收 |
| 回执 | `main.decisionCard.noRecommended` | 缺唯一推荐项：fail-closed，未发卡 |
| 回执 | `main.decisionCard.invalid` | 参数非法：fail-closed，未发卡 |

## 三、实现现状与待定项（只读核对，不得由本批推断为已验证）

只读核对（2026-10-26，worktree `lead-governance-coordination`，HEAD `5bd9fe4`；下列均为**其他角色未提交的在飞改动**，本批未修改、未验证）：

- **运行时核心/模型契约（在飞）**：`src/model/runtime.ts` 的 `GovernanceChoiceCardKind` 已包含 `"decision"`；`GOVERNANCE_CARD_GROUP` 已登记 `decision: "decision"`；`CustomerInputOption` 新增可选 `recommended?: boolean`。`src/provider/runtime/schema.ts` 的 `request_choice` 已把 `decision` 加入 `cardKind` 枚举，并在 options 项新增 `recommended: boolean`；`src/provider/runtime/tools.ts` 的 `CHOICE_CARD_KINDS` 已含 `decision`，`readOptions` 只透传 `recommended`（不代选、不补默认值）。
- **推荐项结构（已由在飞契约给出）**：`options[].recommended?: boolean`；decision 卡要求**恰有一个** `recommended: true`，个数校验在应用/角色侧（运行时核心只透传）。本批的 `ui.decisionCard.recommended` 是该推荐项的展示标识。
- **编排/账本（在飞）**：`src/pipeline/orchestration/run-role.ts` 的 `TRIO_CARD_KINDS` 已把 `decision` 仅加入 convener（统筹）白名单；选中项分类为 `decisionKind:"material-choice"`、`customerDecision:"accepted"`、`selectedOptions:[选中项 id]`；`src/common/编排/governance-ledger.ts` 的 `GovernanceDecisionKind` 已含 `"material-choice"`（条目仍在 `customer.decision` 下，但 `material-choice` 仅供审计，门禁/收尾/分诊不认），`selectedOptions` 只作审计，不进入提案/任命/验收语义。
- **门禁卡文本（在飞）**：`src/common/门禁引擎/governance-roles.ts` 的 Lead/Steward 角色卡已加入 decision 卡纪律（主理交统筹、统筹必须发卡、恰好一个 `recommended: true`、不触发 gate/验收）。
- **桌面窗口（在飞，部分接线）**：`app/desktop/customer-input.ts` 的未提交在飞改动已实现 decision 卡发卡前校验（仅统筹可发、choice＋合法 flowId、至少两个选项、id 非空且不重复、恰一个 `recommended: true`；0 个/多个均拒）和「替我决策」确定性默认推荐（`group:"decision"`、`judge 代批`、不调用模型、不伪装客户；异常回落客户卡），并引用本批的 `main.decisionCard.invalid` / `noRecommended` / `judgeSelectedRecommended` / `notApproval`。**本批未修改、未运行其测试、未验证。**
- **未接线/未验证（跨角色）**：
  - 渲染层卡面（`ui.decisionCard.title` / `notApprovalBadge` / `recommended`）与客户手选回执（`main.decisionCard.selectedRecommended` / `selectedOther`）**尚未被产品代码引用**；需桌面窗口/桌面UI 接线后才能验证真实卡面与系统行。
  - 应用是否在所有路径机械执行上述校验、是否在未获明确选择时 fail-closed，需由实现与验收证明；文案本身不构成校验。
  - 未跑真实 Electron、决策卡 e2e、真实模型端到端；未做独立验收。其他角色的在飞实现仍在演进，本节的只读核对仅代表 2026-10-26 本批最终核对时点。
- **与工程法案第 12 条的关系**：第 12 条「不新增 cardKind」只约束 gate 复核实现范围；本条是独立客户规则，在飞实现已新增 `cardKind="decision"`，不受该款限制，但仍须走各自的授权与验收。

## 四、不做与风险

1. **本批未实现**：项目管理只登记规则、共享 i18n 与文档；decision 卡的运行时契约、编排分类、门禁卡文本与桌面窗口发卡前校验/判断默认推荐由其他角色以未提交在飞改动提供（见 §三），渲染层卡面与客户手选回执仍待接线。本批不把在飞改动当作已验证功能。
2. **未验证**：未跑真实 Electron、未跑决策卡 e2e、未接入判断 agent；9 个 key 中 4 个 `main.decisionCard.*` 已被桌面在飞改动引用，3 个 `ui.decisionCard.*` 与 2 个客户手选回执 key 仍待接线。
3. **误用风险**：decision 卡选择按 `decisionKind="material-choice"` 单独审计留痕是允许的；但若实现把它当成验收/提案/任命决定（`acceptance` / `proposal-*` / `appointment`）或据此触发 gate/验收，即违反本规则。实施验收必须机械核对账本与流程状态，确认门禁/收尾/分诊不读 `material-choice`。
4. **推荐项唯一性**：卡面/回执文案已写明「唯一推荐项」，但唯一性校验必须在应用/角色层机械保证；运行时核心只透传 `recommended`，仅靠文案不构成约束。
5. **授权原文不在工作树**：见文首说明；独立验收如要求原始客户沟通记录，需由主控/治理补齐。

## 五、验证计划（供实施批次）

- 模型/工具层：`cardKind="decision"` 合法；`options[].recommended` 按布尔透传，不补默认值。
- 应用/角色层：decision 卡**恰有一个** `recommended: true`；缺失、重复、非法或卡参数不合规时 fail-closed（未向客户发卡）；仅统筹可发 decision 卡。
- 桌面/编排层：客户选择推荐项/非推荐项回执正确；「替我决策」开启时判断默认唯一推荐项并标「自动代理 / 不是客户本人」，开关关闭或判断不可用时交客户手动；与 `GOVERNANCE_CARD_GROUP` 的分组口径一致。
- 账本/流程层：选择以 `decisionKind="material-choice"` 单独审计留痕，不作为验收/提案/任命决定；不触发 gate 复核、不触发/替代验收；最终验收链路不受影响。
- i18n：9 个 key 的 zh/en 存在性、占位符、语义断言与 `npm run typecheck`；消费方接线后补真实系统行测试。
