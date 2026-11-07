// product 角色模块内部：工具/能力装配策略（纯函数；E0.3 §3.1 R-1 / §10.2 D10）。
//
// 旧 run-role 门控（oracle）：`submitVersionChange` 只注入 product / rapporteur
// （`src/pipeline/orchestration/run-role.ts`「product/rapporteur → submit_version_change」），
// 工具内再按 kind 限定唯一发起角色（version-upgrade = product）。
// 因此 product 模块声明的**角色专属额外注入**只有 `submitVersionChange`；
// id→运行时工具名→允许角色的校验由引擎装配表 `role-tool-registry.ts` 执行（未知/越权 fail-closed），
// 本模块不 import 私有 common、不做第二份映射。
//
// 治理模型（Model `TrustedToolPolicyInput`）：trio 装配角色专属工具；single 不装配 trio 角色工具；
// 运行期未知模型 fail-closed（空表 + 稳定 reason），不猜测、不兜底。

import type {
  RolePolicyReason,
  RoleToolId,
  RoleToolPolicy,
  TrustedToolPolicyInput,
} from "../../../../model/role.ts";
import { PRODUCT_CAPABILITIES } from "./capabilities.ts";

/** product 可声明的角色专属工具稳定 id（闭集成员；顺序稳定）。 */
export const PRODUCT_TOOL_IDS: readonly RoleToolId[] = Object.freeze(["submitVersionChange"]);

const EMPTY_TOOLS: readonly RoleToolId[] = Object.freeze([]);
const EMPTY_REASONS: readonly RolePolicyReason[] = Object.freeze([]);

/** 运行期未知治理模型（类型上不可达；防御性 fail-closed，不声明角色专属工具）。 */
const UNKNOWN_MODEL_REASON: RolePolicyReason = Object.freeze({
  code: "role-tools-model-unknown",
  messageKey: "role.product.tools.modelUnknown",
});

/**
 * 工具/能力装配策略。
 * - `capabilities` 直接返回模块 spec 的同一引用（D10 单一真源）。
 * - `tools` 只含 product 允许的 id；越权/未知 id 由引擎装配 fail-closed（不在此兜底）。
 * - `reasons` 只用于运行期未知模型的防御性说明；正常模型返回空数组。
 */
export function productTools(input: TrustedToolPolicyInput): RoleToolPolicy {
  const governanceModel: unknown =
    typeof input === "object" && input !== null
      ? (input as { governanceModel?: unknown }).governanceModel
      : undefined;

  if (governanceModel === "trio") {
    return Object.freeze({
      capabilities: PRODUCT_CAPABILITIES,
      tools: PRODUCT_TOOL_IDS,
      reasons: EMPTY_REASONS,
    });
  }
  if (governanceModel === "single") {
    return Object.freeze({
      capabilities: PRODUCT_CAPABILITIES,
      tools: EMPTY_TOOLS,
      reasons: EMPTY_REASONS,
    });
  }
  return Object.freeze({
    capabilities: PRODUCT_CAPABILITIES,
    tools: EMPTY_TOOLS,
    reasons: Object.freeze([
      Object.freeze({
        ...UNKNOWN_MODEL_REASON,
        details: Object.freeze({ governanceModel: String(governanceModel) }),
      }),
    ]),
  });
}
