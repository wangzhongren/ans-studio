// chief 角色模块：intent-confirm 卡纯数据（供桌面/编排/E2 消费；不构造卡、不写账本）。
//
// 来源（只读 oracle）：
//  - `src/model/runtime.ts:780-788`（`intent-confirm` 是主理在意图交接前发给客户的需求确认卡；
//    选项 id 固定 `confirm` / `revise`）；
//  - `src/model/runtime.ts:837-865`（自 2026-10-20 起纳入 `decision` 组：客户开启「替我决策」时
//    判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色）；
//  - `src/pipeline/orchestration/run-role.ts:2859-2880`（`TRIO_CARD_KINDS.chief` 唯一卡种）与
//    `:2808-2825`（chief 缺 `cardKind` 且选项含 `confirm` 时默认 intent-confirm）；
//  - `src/provider/runtime/schema.ts:521-556`（`request_choice` 的 intent-confirm 文案纪律）。
//
// 本数据只描述卡面固定形状；发卡资格、客户回答、判断代理与账本分类仍由应用/引擎判定。

/** intent-confirm 卡固定选项 id（顺序即展示顺序）。 */
export type ChiefIntentConfirmOptionId = "confirm" | "revise";

/** intent-confirm 卡的纯数据描述（不携带权限、不含客户正文）。 */
export interface ChiefIntentConfirmCardData {
  /** 治理卡种 token（`GovernanceCardKind` 成员）。 */
  readonly cardKind: "intent-confirm";
  /** 发卡工具名（choice 卡，不是 confirm 卡）。 */
  readonly toolName: "request_choice";
  /** 固定选项 id。 */
  readonly optionIds: readonly ChiefIntentConfirmOptionId[];
  /** 发卡必须具备的选项 id（缺 `confirm` 时旧引擎拒绝发卡）。 */
  readonly requiredOptionId: "confirm";
  /** 判断开关分组（`GovernanceJudgeGroup`；决定「替我决策」能否代批）。 */
  readonly judgeGroup: "decision";
  /** 判断 agent 可代批的唯一选项（仍须客户开启「替我决策」）。 */
  readonly judgeDelegableOptionId: "confirm";
  /** 只由客户/发起角色处理的选项（判断 agent 不得代选）。 */
  readonly customerOnlyOptionIds: readonly "revise"[];
  /** 是否应用自有卡（intent-confirm 由角色发起 ⇒ false）。 */
  readonly applicationOwned: false;
}

/** intent-confirm 卡纯数据（冻结）。 */
export const CHIEF_INTENT_CONFIRM_CARD: ChiefIntentConfirmCardData = Object.freeze({
  cardKind: "intent-confirm" as const,
  toolName: "request_choice" as const,
  optionIds: Object.freeze(["confirm", "revise"] as const),
  requiredOptionId: "confirm" as const,
  judgeGroup: "decision" as const,
  judgeDelegableOptionId: "confirm" as const,
  customerOnlyOptionIds: Object.freeze(["revise"] as const),
  applicationOwned: false as const,
});
