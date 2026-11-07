// chief 内置角色模块 —— 唯一 public entry（E0.3 §2/§3.1；团队计划 §4.4①）。
//
// 外部消费者只能经本文件导入（模块内其他文件均为 internal 实现细节）：
//  - 编排（`run-role.ts` 工具策略）、Service（`apply-journal.ts` hub 派发/报告）、桌面（路由/呈现）、
//    门禁引擎门面（聚合卡/矩阵）在 E2 切换时消费 `chiefRoleModule`；
//  - hub 派发/报告期望与 intent-confirm 卡数据以纯数据导出，供 E2 消费；
//  - 模块只依赖 `src/model/` 与 `src/common/shared/` 的 public entry，零跨角色 import。

export { chiefRoleModule } from "./internal/module.ts";

/** Hub 派发纯数据（routing/source/report/purpose/targetRoleIds；不含权限）。 */
export { CHIEF_HUB_DISPATCH } from "./internal/dispatch.ts";
export type { ChiefHubDispatchSpec, ChiefHubTargetRoleId } from "./internal/dispatch.ts";

/** intent-confirm 卡纯数据（固定选项 id / 判断分组；不构造卡）。 */
export { CHIEF_INTENT_CONFIRM_CARD } from "./internal/intent-confirm.ts";
export type {
  ChiefIntentConfirmCardData,
  ChiefIntentConfirmOptionId,
} from "./internal/intent-confirm.ts";

/** chief-workflow 资源引用（path/version/sha256；读取与校验由宿主执行）。 */
export { CHIEF_WORKFLOW_RESOURCE } from "./internal/context.ts";

/** 稳定内部码 / messageKey（诊断与差分；不写用户文案）。 */
export { CHIEF_MESSAGE_KEYS, CHIEF_POLICY_CODES } from "./internal/codes.ts";
export {
  CHIEF_TOOL_MESSAGE_KEYS,
  CHIEF_TOOL_REASON_CODES,
} from "./internal/codes.ts";

/** chief 额外注入工具 id 闭集（6 项，含 E2 C-1 补入的 closeCreatedTask；顺序与旧 run-role 一致）。 */
export { CHIEF_TOOL_IDS } from "./internal/tools.ts";
