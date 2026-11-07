// 内部文件：rapporteur `dispatch()` 纯策略（R-2：只做硬身份/存在性）。
//
// 现行（E1 过渡期）oracle：编排公开只读入口
// `workflow-preconditions.ts::evaluateDispatchAuthorization`——trio 下只有幕僚（chief）或运营
// （convener）可以派发；来源为 rapporteur 时一律 `unknown-source` 拒绝（无论目标）。
// R-2 将 `dispatch()` 收窄为「该真实来源能否向该真实目标派发」：本模块据实回答——
//  - 来源身份必须是本模块的真实角色 `rapporteur`；缺失/冒用 ⇒ deny；
//  - 目标 id/类别/存在性必须是宿主核验过的真实事实；缺失 ⇒ deny（fail-closed）；
//  - 即便目标合法，rapporteur 也不在可派发来源集合内 ⇒ deny（`dispatchTask: false`）。
//
// hub/legacy/review 路由、报告时点与实际 `reportTargetForTaskCreator` 均不在此（契约 §3.1 R-2），
// 因此本模块**任何分支都不返回 `reportToRoleId`**；报告期望在 `context()` 中静态声明。

import type {
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
} from "../../../../model/role.ts";
import { RAPPORTEUR_DISPATCH_CODES, RAPPORTEUR_DISPATCH_MESSAGE_KEYS } from "./codes.ts";

const RAPPORTEUR_ROLE_ID = "rapporteur" as const;

function deny(code: string, messageKey: string, details?: Readonly<Record<string, unknown>>): RoleDispatchPolicy {
  const decision: RolePolicyDecision =
    details === undefined
      ? Object.freeze({ allow: false as const, code, messageKey })
      : Object.freeze({ allow: false as const, code, messageKey, details: Object.freeze(details) });
  return Object.freeze({ decision });
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * 纯函数：rapporteur 的派发判定。不读盘、不推断、不补造目标；所有分支均为 deny。
 *
 * 判定顺序（与 R-2 的硬身份/存在性一致）：来源身份 → 目标身份/类别 → 目标存在性 → 来源授权。
 */
export function dispatchPolicy(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  const sourceRoleId = nonEmptyString((input as { sourceRoleId?: unknown } | null | undefined)?.sourceRoleId);
  if (sourceRoleId === undefined) {
    return deny(RAPPORTEUR_DISPATCH_CODES.sourceMissing, RAPPORTEUR_DISPATCH_MESSAGE_KEYS.sourceMissing, {
      expectedSourceRoleId: RAPPORTEUR_ROLE_ID,
    });
  }
  if (sourceRoleId !== RAPPORTEUR_ROLE_ID) {
    return deny(RAPPORTEUR_DISPATCH_CODES.sourceMismatch, RAPPORTEUR_DISPATCH_MESSAGE_KEYS.sourceMismatch, {
      expectedSourceRoleId: RAPPORTEUR_ROLE_ID,
      actualSourceRoleId: sourceRoleId,
    });
  }
  const targetRoleId = nonEmptyString((input as { targetRoleId?: unknown }).targetRoleId);
  const targetKind = (input as { targetKind?: unknown }).targetKind;
  if (targetRoleId === undefined || (targetKind !== "project" && targetKind !== "built-in-governance")) {
    return deny(RAPPORTEUR_DISPATCH_CODES.targetInvalid, RAPPORTEUR_DISPATCH_MESSAGE_KEYS.targetInvalid, {
      targetRoleId: targetRoleId ?? null,
      targetKind: typeof targetKind === "string" ? targetKind : null,
    });
  }
  if ((input as { targetExists?: unknown }).targetExists !== true) {
    return deny(RAPPORTEUR_DISPATCH_CODES.targetMissing, RAPPORTEUR_DISPATCH_MESSAGE_KEYS.targetMissing, {
      targetRoleId,
      targetKind,
    });
  }
  return deny(RAPPORTEUR_DISPATCH_CODES.notAuthorized, RAPPORTEUR_DISPATCH_MESSAGE_KEYS.notAuthorized, {
    sourceRoleId,
    targetRoleId,
    targetKind,
  });
}
