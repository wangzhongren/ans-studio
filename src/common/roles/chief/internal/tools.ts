// chief 角色模块：工具/能力装配策略（纯函数；无 I/O、无会话、无时钟、无可变状态）。
//
// 门控语义来源（只读 oracle）：`src/pipeline/orchestration/run-role.ts:1694-1705`、`:1828`
//  - `roleActivityLog` / `terminateRoleRun` / `redispatchTask` / `projectNote`：`trioSpec?.id === "chief"`；
//  - `requestVersionDecision`：`canRequestVersionDecision(trioSpec.id)`（仅 chief，`:2344-2346`）；
//  - `closeCreatedTask`：chief/convener 共享的直接能力，旧注入为
//    `directGovernance && (role.id === "chief" || role.id === "convener")`（`:1824`/`:1828`）。
//
// 本模块只声明**角色专属额外注入**的稳定 id 闭集（E0.3 §3.1 R-1）；宿主是否真的提供对应能力仍由
// 注入层决定（`input.xxx !== undefined` 才注册）。`projectState` 等内置治理角色共有工具不在此列。
//
// E2 接口评审 C-1（2026-11-07）：trio 声明补入 `closeCreatedTask`——注册表允许 chief，且旧
// `directGovernance` 下 trio chief 会注入；按模块 `tools()` 驱动装配时不得丢失该工具。模块只声明
// 允许集；`directGovernance`（会话模式：trio + builtInGovernance + isTrio + 非独立决策上下文）
// 仍由注入层在真实注入时判定（E0.3 Q2：TrustedToolPolicyInput 保持最小）。
//
// `decidePendingRequest` 仍**不由本模块声明**：仅 chief 独立决策上下文
// （`chiefIndependentDecisionOnly`），由引擎调用点 `buildChiefDecisionTools` 装配；普通会话不得
// 因 `tools()` 声明获得。理由写入 `角色卡/chief-code/api-spec.md` 与证据。

import type { RoleToolId, RoleToolPolicy, TrustedToolPolicyInput } from "../../../../model/role.ts";
import { CHIEF_CAPABILITIES } from "./spec.ts";
import { CHIEF_TOOL_MESSAGE_KEYS, CHIEF_TOOL_REASON_CODES } from "./codes.ts";

/**
 * chief 额外注入工具 id（顺序与旧 run-role 注入顺序一致：`:1697-1705` 五个在前，
 * `directGovernance` 的 `closeCreatedTask`（`:1828`）在后）。
 * `RoleToolId` 闭集内的允许项；越界/未知 id 由引擎装配 fail-closed（E0.3 §3.1 R-1）。
 */
export const CHIEF_TOOL_IDS: readonly RoleToolId[] = Object.freeze([
  "roleActivityLog",
  "terminateRoleRun",
  "redispatchTask",
  "projectNote",
  "requestVersionDecision",
  "closeCreatedTask",
]);

const NO_TOOLS: readonly RoleToolId[] = Object.freeze([]);

/**
 * `tools()`：按治理模型返回 chief 可额外注入的工具 id。
 *
 * - `trio`：返回 6 个 chief 专属 id（含 `closeCreatedTask`；宿主是否注入仍看能力存在与会话模式）。
 * - `single`：按 `TrustedToolPolicyInput` 契约注释（single 不装配 trio 角色工具）返回空集，
 *   并给出结构化原因（非 deny）。
 * - 未知/缺失治理模型：fail-closed（空集 + 原因），不猜测。
 *
 * 返回的 `capabilities` 恒为模块 spec 的同一引用（D10 单一真源）。
 */
export function chiefTools(input: TrustedToolPolicyInput): RoleToolPolicy {
  const governanceModel: unknown = input?.governanceModel;
  if (governanceModel === "trio") {
    return { capabilities: CHIEF_CAPABILITIES, tools: CHIEF_TOOL_IDS, reasons: [] };
  }
  if (governanceModel === "single") {
    return {
      capabilities: CHIEF_CAPABILITIES,
      tools: NO_TOOLS,
      reasons: Object.freeze([
        Object.freeze({
          code: CHIEF_TOOL_REASON_CODES.governanceModelSingle,
          messageKey: CHIEF_TOOL_MESSAGE_KEYS.governanceModelSingle,
        }),
      ]),
    };
  }
  return {
    capabilities: CHIEF_CAPABILITIES,
    tools: NO_TOOLS,
    reasons: Object.freeze([
      Object.freeze({
        code: CHIEF_TOOL_REASON_CODES.governanceModelUnknown,
        messageKey: CHIEF_TOOL_MESSAGE_KEYS.governanceModelUnknown,
        details: { governanceModel: typeof governanceModel === "string" ? governanceModel : "missing" },
      }),
    ]),
  };
}
