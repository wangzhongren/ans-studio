// 门禁引擎私有：角色专属工具装配表（`RoleToolId` → 运行时工具名 → 允许角色）与 fail-closed 校验。
//
// 契约来源：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.2）§3.1 的
// 14 行表 + §10.2 D1。该表是 **id→name→允许角色** 的唯一冻结清单；本文件是它在代码里的唯一承载：
//  - `src/model/role.ts` 只定义 `RoleToolId` / `RoleToolName` 字面量闭集（类型，不承载映射值）；
//  - 本文件定义 14 项逐项映射与允许角色集合，供 E1 引擎装配在角色模块 `tools()` 输出上校验；
//  - 契约测试 `test/门禁引擎/role-module-contract.test.ts` 逐项断言本表与 §3.1 表一致。
// 新增/改名必须先走契约 §4.4 接口评审并更新 §3.1 表，再同步 Model 类型、本表与契约测试；不得只改一处。
//
// fail-closed 口径（契约 §3.1 R-1、§10.2 D1）：
//  - 未知 id（含 Model 闭集已扩、本表未同步的“映射不一致”）→ 拒绝，**不注入、不静默忽略**；
//    Model 与装配表的逐项一致由契约测试断言，lookup 未命中即按未知 id 拒绝。
//  - 声明了该角色允许集之外的 id（越权）→ 拒绝；整单拒绝时任何 id 都不得注入。
//  - `decidePendingRequest` 的允许角色只有 chief，但**仅 chief 独立决策上下文**可用；
//    本表/校验函数只判角色允许集，普通 chief 会话是否获得该工具由引擎调用点的会话模式
//    （`chiefDecisionContext` / `buildChiefDecisionTools`）决定，不得仅凭模块 `tools()` 声明注入。
//
// 本文件是纯模块：只 import Model 类型；无 I/O、账本、会话、时钟、随机数、可变状态。

import type { BuiltInRoleId, RolePolicyReason, RoleToolId, RoleToolName } from "../../model/role.ts";

/** 角色专属工具的一条装配项（契约 §3.1 表的一行）。 */
export interface RoleToolCatalogEntry {
  /** 模块声明的稳定 camelCase id（`RoleToolId` 闭集）。 */
  readonly id: RoleToolId;
  /** 运行时注册的工具名（snake_case；`RoleToolName` 闭集，契约 §3.1 逐字）。 */
  readonly name: RoleToolName;
  /** 允许声明该工具的角色 id 集合（契约 §3.1「允许角色」列）。 */
  readonly allowedRoleIds: readonly BuiltInRoleId[];
  /**
   * `true`：仅 chief 独立决策上下文（`buildChiefDecisionTools`）可用。普通 chief 会话
   * **不因 `tools()` 声明**获得；校验函数只判角色允许集，引擎调用点必须另行核会话模式。
   */
  readonly chiefIndependentDecisionOnly?: true;
}

function catalogEntry(
  id: RoleToolId,
  name: RoleToolName,
  allowedRoleIds: readonly BuiltInRoleId[],
  chiefIndependentDecisionOnly?: true,
): RoleToolCatalogEntry {
  return Object.freeze({
    id,
    name,
    allowedRoleIds: Object.freeze([...allowedRoleIds]),
    ...(chiefIndependentDecisionOnly === true ? { chiefIndependentDecisionOnly: true as const } : {}),
  });
}

/** 14 项唯一来源（顺序与契约 §3.1 表一致；冻结防运行时改写）。 */
export const ROLE_TOOL_CATALOG: readonly RoleToolCatalogEntry[] = Object.freeze([
  catalogEntry("roleActivityLog", "role_activity_log", ["chief"]),
  catalogEntry("terminateRoleRun", "terminate_role_run", ["chief"]),
  catalogEntry("redispatchTask", "redispatch_task", ["chief"]),
  catalogEntry("projectNote", "project_note", ["chief"]),
  catalogEntry("requestVersionDecision", "request_version_decision", ["chief"]),
  catalogEntry("requestRequirementChange", "request_requirement_change", ["rapporteur", "convener"]),
  catalogEntry("submitVersionChange", "submit_version_change", ["product", "rapporteur"]),
  catalogEntry("selectRunChange", "select_run_change", ["rapporteur"]),
  catalogEntry("completeTeamPlan", "complete_team_plan", ["convener"]),
  catalogEntry("activateRoleDocuments", "activate_role_documents", ["nominator"]),
  catalogEntry("closeCreatedTask", "close_created_task", ["chief", "convener"]),
  catalogEntry("submitRefactor", "submit_refactor", ["convener"]),
  catalogEntry("requestStableWrite", "request_stable_write", ["convener"]),
  catalogEntry("decidePendingRequest", "decide_pending_request", ["chief"], true),
]);

/** 按 id 查装配项；未知 id 返回 `undefined`（调用方必须 fail-closed，不得兜底）。 */
export function roleToolCatalogEntryOf(id: string): RoleToolCatalogEntry | undefined {
  return ROLE_TOOL_CATALOG.find((entry) => entry.id === id);
}

/** 允许注入的映射项（校验通过时按声明顺序给出）。 */
export interface RoleToolBinding {
  readonly id: RoleToolId;
  readonly name: RoleToolName;
}

/** 模块 `tools()` 声明的校验结果（纯数据，不携带权限）。 */
export interface RoleToolDeclarationValidation {
  /** 整单判定：仅当全部声明合法时为 `true`。 */
  readonly allow: boolean;
  /** 允许注入的映射；`allow === false` 时为空数组（**整单不注入、不静默忽略**）。 */
  readonly tools: readonly RoleToolBinding[];
  /** `allow === false` 时的稳定内部原因（只供测试/诊断，不写用户文案）。 */
  readonly reasons: readonly RolePolicyReason[];
}

/** 稳定 reason 码（内部诊断；新增/改名走接口评审）。 */
export const ROLE_TOOL_VALIDATION_CODES = Object.freeze({
  idUnknown: "role-tool-id-unknown",
  notAllowed: "role-tool-not-allowed",
  duplicate: "role-tool-declaration-duplicate",
});

/** `messageKey`：E1 若对外呈现再登记 i18n；当前只作稳定内部诊断键。 */
const ROLE_TOOL_VALIDATION_MESSAGE_KEYS = Object.freeze({
  idUnknown: "role.tools.idUnknown",
  notAllowed: "role.tools.notAllowed",
  duplicate: "role.tools.duplicate",
});

/**
 * 校验一个角色模块声明的额外工具（E1 引擎装配调用；纯函数、无 I/O）。
 *
 * - 输入 `roleId` + 声明（运行时按 `string` 收，才能对未类型化数据 fail-closed）；
 * - 空声明恒 `allow: true`、`tools: []`（不注入任何工具，故不因角色身份拒绝）；
 * - 任一未知 id / 越权 id / 重复声明 ⇒ 整单 `allow: false`、`tools: []`、`reasons` 逐项给出；
 *   调用方**不得**从 deny 结果中挑合法项注入（不静默忽略）。
 * - 本函数只判角色允许集；`decidePendingRequest` 的“仅 chief 独立决策上下文”由引擎调用点
 *   另行判定（见 `RoleToolCatalogEntry.chiefIndependentDecisionOnly`）。
 */
export function validateRoleToolDeclaration(
  roleId: string,
  declaredToolIds: readonly string[],
): RoleToolDeclarationValidation {
  const bindings: RoleToolBinding[] = [];
  const reasons: RolePolicyReason[] = [];
  const seen = new Set<string>();
  for (const declaredId of declaredToolIds) {
    const entry = roleToolCatalogEntryOf(declaredId);
    if (entry === undefined) {
      reasons.push({
        code: ROLE_TOOL_VALIDATION_CODES.idUnknown,
        messageKey: ROLE_TOOL_VALIDATION_MESSAGE_KEYS.idUnknown,
        details: { roleId, toolId: declaredId },
      });
      continue;
    }
    if (!entry.allowedRoleIds.some((allowed) => allowed === roleId)) {
      reasons.push({
        code: ROLE_TOOL_VALIDATION_CODES.notAllowed,
        messageKey: ROLE_TOOL_VALIDATION_MESSAGE_KEYS.notAllowed,
        details: { roleId, toolId: declaredId },
      });
      continue;
    }
    if (seen.has(declaredId)) {
      reasons.push({
        code: ROLE_TOOL_VALIDATION_CODES.duplicate,
        messageKey: ROLE_TOOL_VALIDATION_MESSAGE_KEYS.duplicate,
        details: { roleId, toolId: declaredId },
      });
      continue;
    }
    seen.add(declaredId);
    bindings.push({ id: entry.id, name: entry.name });
  }
  if (reasons.length > 0) return { allow: false, tools: [], reasons };
  return { allow: true, tools: bindings, reasons: [] };
}
