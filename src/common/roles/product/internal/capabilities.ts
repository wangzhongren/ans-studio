// product 角色模块内部：能力位与卡种（纯数据；E0.3 D8/D10）。
//
// - `capabilities` 是**唯一真源**（Model §10.2 D10）：`tools()` 输出的 `capabilities`
//   必须与此处为同一引用，不得两份不一致。
// - `cards` 只列当前有效卡种；product 不发起治理卡（旧 `TRIO_CARD_KINDS.product = []`），
//   旧 `"write"` 等 legacy token 不进入模块数据（D8）。

import type { GovernanceCapabilities, GovernanceCardKind } from "../../../../model/role.ts";

/**
 * product 能力位（逐字段与旧 `governance-roles.ts` product 规格一致）：
 * 客户通道/派发/角色状态/会话尾/技能/MCP 均不开启；shell 为统一审批档。
 * 能力位只表达「注入哪些工具/通道」，不是权限（执行与安全边界由引擎判定）。
 */
export const PRODUCT_CAPABILITIES: GovernanceCapabilities = Object.freeze({
  customerInput: false,
  dispatchTask: false,
  roleStatus: false,
  sessionTail: false,
  installSkill: false,
  installMcp: false,
  shell: "operator-approve",
});

/** product 可发起的治理卡种（无；空数组冻结）。 */
export const PRODUCT_CARDS: readonly GovernanceCardKind[] = Object.freeze(
  [] as GovernanceCardKind[],
);

/**
 * fixed 派发矩阵（`matrix:"two-fixed-paths/v1"`）的卡种白名单（T3 v1.3 §3.4 / MF-IR-4 冻结值）。
 *
 * - 冻结值：product fixed = `[]`——固定路径的意图确认卡由幕僚（chief）呈，product 不发起任何卡；
 *   fixed 矩阵**只读本字段**（门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")`），**不从 legacy
 *   `cards` 过滤/推导**（G-2）；
 * - 纯数据、冻结、无 I/O；legacy `PRODUCT_CARDS` 逐字不变，legacy 消费点不得改读本字段。
 */
export const PRODUCT_FIXED_CARDS: readonly GovernanceCardKind[] = Object.freeze(
  [] as GovernanceCardKind[],
);
