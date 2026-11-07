// chief 角色模块：派发策略（R-2 收窄：只做硬身份/存在性）+ hub 目标纯数据（供 E2 消费）。
//
// R-2（E0.3 §3.1/§3.5）：`dispatch()` 只回答“该真实来源能否向该真实目标派发”（来源/目标身份与
// 目标存在性）；hub/legacy/review 路由、报告时点、run/module 规则都留在引擎。`reportToRoleId`
// 仅作差分期望（旧引擎 oracle 的期望创建者），不驱动实际报告路由。
//
// 硬授权 oracle（只读）：`src/common/编排/workflow-preconditions.ts:1530-1573`
// `evaluateDispatchAuthorization`——幕僚只能派五个内置角色（product/rapporteur/nominator/convener/
// verifier），不得派给自己、不得直接派项目 worker；稳定码 `self-dispatch` /
// `chief-to-project-forbidden` / `target-card-missing` 与本模块逐字一致。
//
// hub 数据来源（只读）：`src/service/trunk/impl/apply-journal.ts:2923`（新内置任务要求
// `hubRouting === "chief-hub-v1"`、`from === "chief"`、`to ∈ 五内置`）与
// `src/model/runtime.ts:1211`（`TASK_HUB_ROUTING`）。本模块只导出纯数据，不实现 Hub 路由。

import type {
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
} from "../../../../model/role.ts";
import { TASK_HUB_ROUTING } from "../../../../model/runtime.ts";
import { CHIEF_MESSAGE_KEYS, CHIEF_POLICY_CODES } from "./codes.ts";

/** 幕僚可派发的五个内置目标（旧 `CHIEF_DISPATCHABLE_BUILT_INS` 逐字）。 */
export type ChiefHubTargetRoleId = "product" | "rapporteur" | "nominator" | "convener" | "verifier";

/**
 * chief hub 派发的纯数据描述（E2 消费；本模块不实现路由/账本/报告时点）。
 * 与 `apply-journal.ts` 的运行时校验同值：路由 `chief-hub-v1`、来源 `chief`、目标五内置、
 * 工作源 schema `repository-work-source/v1`、用途 `builtin-preparation`、报告回 chief。
 */
export interface ChiefHubDispatchSpec {
  /** 任务 hub 路由 token（`TASK_HUB_ROUTING`，单一来源在 Model）。 */
  readonly routing: typeof TASK_HUB_ROUTING;
  /** 创建者/来源角色。 */
  readonly sourceRoleId: "chief";
  /** 报告期望：任务正式报告回到真实创建者 chief。 */
  readonly reportToRoleId: "chief";
  /** 工作源用途（`repository-work-source/v1` 的 purpose）。 */
  readonly purpose: "builtin-preparation";
  /** 工作源 schema（应用写出的仓库工作源）。 */
  readonly workSourceSchema: "repository-work-source/v1";
  /** 可派发的内置目标（顺序即展示/差分顺序）。 */
  readonly targetRoleIds: readonly ChiefHubTargetRoleId[];
}

/** hub 派发纯数据（冻结；不含权限）。 */
export const CHIEF_HUB_DISPATCH: ChiefHubDispatchSpec = Object.freeze({
  routing: TASK_HUB_ROUTING,
  sourceRoleId: "chief" as const,
  reportToRoleId: "chief" as const,
  purpose: "builtin-preparation" as const,
  workSourceSchema: "repository-work-source/v1" as const,
  targetRoleIds: Object.freeze([
    "product",
    "rapporteur",
    "nominator",
    "convener",
    "verifier",
  ] as const),
});

function isChiefHubTargetRoleId(value: unknown): value is ChiefHubTargetRoleId {
  return typeof value === "string"
    && CHIEF_HUB_DISPATCH.targetRoleIds.some((roleId) => roleId === value);
}

function deny(
  code: string,
  messageKey: string,
  details?: Readonly<Record<string, unknown>>,
): RoleDispatchPolicy {
  const decision: RolePolicyDecision = details === undefined
    ? { allow: false, code, messageKey }
    : { allow: false, code, messageKey, details };
  return { decision };
}

/**
 * `dispatch()`：chief 作为来源的硬身份/存在性判定。
 *
 * 允许（唯一分支）：来源恰为 chief、目标是五个可派发内置角色之一、目标类别为内置治理角色、
 * 且宿主显式核验 `targetExists === true`；允许时报告期望回到 chief。
 *
 * 其余一律 fail-closed（缺事实不解释为允许），包括：来源缺失/非 chief、自派、项目 worker、
 * 闭集外目标、`targetExists` 缺省/false、目标类别未知。
 */
export function chiefDispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  const sourceRoleId: unknown = input?.sourceRoleId;
  if (typeof sourceRoleId !== "string" || sourceRoleId === "") {
    return deny(CHIEF_POLICY_CODES.dispatchSourceMissing, CHIEF_MESSAGE_KEYS.dispatchSourceMissing);
  }
  if (sourceRoleId !== "chief") {
    return deny(CHIEF_POLICY_CODES.dispatchSourceNotChief, CHIEF_MESSAGE_KEYS.dispatchSourceNotChief, {
      sourceRoleId,
    });
  }

  const targetRoleId: unknown = input?.targetRoleId;
  if (typeof targetRoleId !== "string" || targetRoleId === "") {
    return deny(CHIEF_POLICY_CODES.dispatchTargetMissing, CHIEF_MESSAGE_KEYS.dispatchTargetMissing, {
      targetRoleId: "missing",
    });
  }
  if (targetRoleId === "chief") {
    return deny(CHIEF_POLICY_CODES.dispatchSelf, CHIEF_MESSAGE_KEYS.dispatchSelf, { targetRoleId });
  }

  const targetKind: unknown = input?.targetKind;
  if (targetKind !== "built-in-governance" && targetKind !== "project") {
    return deny(
      CHIEF_POLICY_CODES.dispatchTargetKindInvalid,
      CHIEF_MESSAGE_KEYS.dispatchTargetKindInvalid,
      { targetRoleId, targetKind: typeof targetKind === "string" ? targetKind : "missing" },
    );
  }
  if (targetKind === "project") {
    return deny(
      CHIEF_POLICY_CODES.dispatchTargetProjectForbidden,
      CHIEF_MESSAGE_KEYS.dispatchTargetProjectForbidden,
      { targetRoleId },
    );
  }
  if (!isChiefHubTargetRoleId(targetRoleId)) {
    return deny(CHIEF_POLICY_CODES.dispatchTargetMissing, CHIEF_MESSAGE_KEYS.dispatchTargetMissing, {
      targetRoleId,
    });
  }
  // 宿主核验的目标存在性：缺省 false ⇒ 拒绝（fail-closed；旧引擎对内置目标不查此字段，本模块按
  // RoleDispatchPolicyInput 契约收紧，差异见 api-spec/差分证据）。
  if (input?.targetExists !== true) {
    return deny(CHIEF_POLICY_CODES.dispatchTargetMissing, CHIEF_MESSAGE_KEYS.dispatchTargetMissing, {
      targetRoleId,
      targetExists: input?.targetExists === undefined ? "missing" : false,
    });
  }

  return { decision: { allow: true }, reportToRoleId: CHIEF_HUB_DISPATCH.reportToRoleId };
}
