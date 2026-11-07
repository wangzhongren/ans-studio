// 内部文件：rapporteur `tools()` 纯策略。
//
// 现行（E1 过渡期）oracle：编排 `run-role.ts` 的注入门控——
//  - `requestRequirementChange`：`isTrio && canRequestRequirementChange(id)`（rapporteur 命中）；
//  - `submitVersionChange`：`setup.role.id === "product" || "rapporteur"`；
//  - `selectRunChange`：`directGovernance`（trio + 内置治理 + rapporteur + 非 chief 决策上下文）。
// 归并到本模块后，模块只声明**该角色允许的额外注入 id**；会话模式（如 chief 独立决策上下文）、
// 通道可用性与最终装配校验仍由引擎执行（契约 Q2 / R-2 / §3.1）。
//
// 契约 §3.1：`tools().tools` 只能使用 `RoleToolId` 闭集；未知 id / 越权 id 由引擎装配
// （门禁引擎 `role-tool-registry.ts::validateRoleToolDeclaration`）fail-closed。本模块只返回
// registry 允许的 3 个 id，不返回任何闭集外值；也不自行维护第二份映射表。
//
// D10（capabilities 单一真源）：`RoleToolPolicy.capabilities` 是模块 spec `capabilities` 的派生，
// 这里直接返回同一冻结对象，保证两份不会漂移。

import type { RoleToolId, RoleToolPolicy, TrustedToolPolicyInput } from "../../../../model/role.ts";
import { RAPPORTEUR_CAPABILITIES } from "./spec.ts";
import { RAPPORTEUR_TOOLS_CODES, RAPPORTEUR_TOOLS_MESSAGE_KEYS } from "./codes.ts";

/**
 * rapporteur 的额外注入工具稳定 id（契约 §3.1 表：requestRequirementChange / submitVersionChange /
 * selectRunChange）。顺序固定，便于差分与呈现；重复调用返回同一冻结数组。
 */
export const RAPPORTEUR_TRIO_TOOL_IDS: readonly RoleToolId[] = Object.freeze([
  "requestRequirementChange",
  "submitVersionChange",
  "selectRunChange",
]);

const EMPTY_REASONS = Object.freeze([]);

/**
 * 纯函数：按治理模型装配 rapporteur 的额外工具声明。
 *
 * - `trio`（唯一可开启内置 rapporteur 的模型；single 下门禁引擎结构性拒绝该角色）⇒ 3 个 id；
 * - 其它/未知/运行时畸形输入 ⇒ `tools: []` + 稳定 reason（fail-closed，不猜测、不兜底）；
 * - 返回值是普通数据，不携带权限；实际注入仍由引擎校验并执行。
 */
export function toolsPolicy(input: TrustedToolPolicyInput): RoleToolPolicy {
  const governanceModel =
    typeof input === "object" && input !== null ? (input as { governanceModel?: unknown }).governanceModel : undefined;
  if (governanceModel === "trio") {
    return Object.freeze({
      capabilities: RAPPORTEUR_CAPABILITIES,
      tools: RAPPORTEUR_TRIO_TOOL_IDS,
      reasons: EMPTY_REASONS,
    });
  }
  return Object.freeze({
    capabilities: RAPPORTEUR_CAPABILITIES,
    tools: Object.freeze([]),
    reasons: Object.freeze([
      Object.freeze({
        code: RAPPORTEUR_TOOLS_CODES.modelUnsupported,
        messageKey: RAPPORTEUR_TOOLS_MESSAGE_KEYS.modelUnsupported,
        details: Object.freeze({ governanceModel: governanceModel ?? "unknown" }),
      }),
    ]),
  });
}
