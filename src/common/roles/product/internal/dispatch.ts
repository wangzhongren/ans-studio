// product 角色模块内部：派发目标/报告期望策略（纯函数；E0.3 §3.1 R-2 / §3.5）。
//
// R-2（冻结口径）：`dispatch()` **只做硬身份/存在性判定**——回答「该真实来源能否向该真实目标派发」。
// hub/legacy/review 路由、run/module 规则、报告时点与实际路由仍留在引擎
// （`workflow-preconditions.ts::reportTargetForTaskCreator` 是稳定公开只读入口）。
// `reportToRoleId` 只是**差分期望**（旧 oracle 的期望创建者 = 任务创建者），不驱动实际路由。
//
// 本模块只回答与 product 相关的派发（与 nominator 模块同一口径）：
//  - 目标是 product：只有真实来源 `chief` 的星形任务派发可通过；报告期望回到创建者 `chief`；
//  - 来源是 product：product 不派发（能力位 dispatchTask=false；旧 oracle `unknown-source`）；
//  - 其它 (source,target) 组合不属于本模块范围 ⇒ deny（由对应角色模块/引擎回答）。
//
// 与旧 `evaluateDispatchAuthorization` 的差异（E1 差分列明）：
//  1. 旧 oracle 对 chief→builtin 目标不检查 `targetExists`；本模块按 E0 §3.5「目标不存在 ⇒ deny」
//     要求 `targetExists === true`（fail-closed；生产调用点对内置 id 恒传 true）。
//  2. 旧 oracle 的 convener→verifier 属于 convener 模块/引擎；本模块对非 product 目标一律
//     `dispatch-not-in-module-scope`。
//  3. 内置 product 目标声明为 project 类别属身份自相矛盾 ⇒ `dispatch-input-invalid`（fail-closed）。

import type {
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
} from "../../../../model/role.ts";

/** 稳定内部码（沿用旧 oracle 同名码；新增/改名走 E0.3 §4.4 接口评审）。 */
export const PRODUCT_DISPATCH_CODES = Object.freeze({
  inputInvalid: "dispatch-input-invalid",
  selfDispatch: "self-dispatch",
  unknownSource: "unknown-source",
  notInModuleScope: "dispatch-not-in-module-scope",
  chiefToProjectForbidden: "chief-to-project-forbidden",
  targetCardMissing: "target-card-missing",
  convenerTargetForbidden: "convener-target-forbidden",
});

/** 稳定 i18n messageKey（文案由共享 i18n 渲染；当前为模块登记键，E1 接口评审登记文案）。 */
export const PRODUCT_DISPATCH_MESSAGE_KEYS = Object.freeze({
  inputInvalid: "role.product.dispatch.inputInvalid",
  selfDispatch: "role.product.dispatch.selfDispatch",
  unknownSource: "role.product.dispatch.unknownSource",
  notInModuleScope: "role.product.dispatch.notInModuleScope",
  chiefToProjectForbidden: "role.product.dispatch.chiefToProjectForbidden",
  targetCardMissing: "role.product.dispatch.targetCardMissing",
  convenerTargetForbidden: "role.product.dispatch.convenerTargetForbidden",
});

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function deny(
  code: string,
  messageKey: string,
  details?: Readonly<Record<string, unknown>>,
): RoleDispatchPolicy {
  const decision: RolePolicyDecision =
    details === undefined
      ? Object.freeze({ allow: false as const, code, messageKey })
      : Object.freeze({ allow: false as const, code, messageKey, details: Object.freeze(details) });
  return Object.freeze({ decision });
}

/**
 * 纯函数：product 侧的派发硬身份/存在性判定。不读盘、不推断、不补造目标。
 *
 * 判定顺序：
 * 1. 输入形状（来源可选；目标 id/类别必填且合法；targetExists 若出现必须是 boolean）；
 * 2. 自我派发 ⇒ self-dispatch；
 * 3. 来源缺失或不是 chief/convener ⇒ unknown-source（旧 oracle：只有幕僚或运营可派发）；
 * 4. 目标不是 product ⇒ dispatch-not-in-module-scope；
 * 5. 来源 chief：目标类别必须是 built-in-governance（否则 chief-to-project-forbidden），
 *    目标必须存在（target-card-missing），通过后 reportToRoleId = 真实创建者 chief；
 * 6. 来源 convener：内置目标禁止（convener-target-forbidden）；project 类别与内置 id 冲突 ⇒
 *    dispatch-input-invalid。
 */
export function productDispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  const sourceRoleId: unknown = input.sourceRoleId;
  const targetRoleId: unknown = input.targetRoleId;
  const targetKind: unknown = input.targetKind;
  const targetExists: unknown = input.targetExists;

  if (sourceRoleId !== undefined && !isNonEmptyText(sourceRoleId)) {
    return deny(PRODUCT_DISPATCH_CODES.inputInvalid, PRODUCT_DISPATCH_MESSAGE_KEYS.inputInvalid, {
      field: "sourceRoleId",
    });
  }
  if (!isNonEmptyText(targetRoleId)) {
    return deny(PRODUCT_DISPATCH_CODES.inputInvalid, PRODUCT_DISPATCH_MESSAGE_KEYS.inputInvalid, {
      field: "targetRoleId",
    });
  }
  if (targetKind !== "project" && targetKind !== "built-in-governance") {
    return deny(PRODUCT_DISPATCH_CODES.inputInvalid, PRODUCT_DISPATCH_MESSAGE_KEYS.inputInvalid, {
      field: "targetKind",
    });
  }
  if (targetExists !== undefined && typeof targetExists !== "boolean") {
    return deny(PRODUCT_DISPATCH_CODES.inputInvalid, PRODUCT_DISPATCH_MESSAGE_KEYS.inputInvalid, {
      field: "targetExists",
    });
  }

  if (sourceRoleId !== undefined && sourceRoleId === targetRoleId) {
    return deny(PRODUCT_DISPATCH_CODES.selfDispatch, PRODUCT_DISPATCH_MESSAGE_KEYS.selfDispatch, {
      roleId: sourceRoleId,
    });
  }

  // 来源缺失/未知：旧 oracle 的 `unknown-source`（只有 chief/convener 可派发）。
  if (sourceRoleId === undefined || (sourceRoleId !== "chief" && sourceRoleId !== "convener")) {
    return deny(PRODUCT_DISPATCH_CODES.unknownSource, PRODUCT_DISPATCH_MESSAGE_KEYS.unknownSource);
  }

  // 非 product 目标：不在本模块范围（由目标角色模块/引擎回答）。
  if (targetRoleId !== "product") {
    return deny(
      PRODUCT_DISPATCH_CODES.notInModuleScope,
      PRODUCT_DISPATCH_MESSAGE_KEYS.notInModuleScope,
      { targetRoleId },
    );
  }

  if (sourceRoleId === "chief") {
    if (targetKind !== "built-in-governance") {
      return deny(
        PRODUCT_DISPATCH_CODES.chiefToProjectForbidden,
        PRODUCT_DISPATCH_MESSAGE_KEYS.chiefToProjectForbidden,
      );
    }
    if (targetExists !== true) {
      return deny(
        PRODUCT_DISPATCH_CODES.targetCardMissing,
        PRODUCT_DISPATCH_MESSAGE_KEYS.targetCardMissing,
        { targetRoleId },
      );
    }
    return { decision: { allow: true }, reportToRoleId: "chief" };
  }

  // sourceRoleId === "convener"：旧 oracle 禁止 convener 向 product 等内置角色派发。
  if (targetKind === "built-in-governance") {
    return deny(
      PRODUCT_DISPATCH_CODES.convenerTargetForbidden,
      PRODUCT_DISPATCH_MESSAGE_KEYS.convenerTargetForbidden,
    );
  }
  // 目标 id 是内置 product，却声明为 project：输入自相矛盾，fail-closed。
  return deny(PRODUCT_DISPATCH_CODES.inputInvalid, PRODUCT_DISPATCH_MESSAGE_KEYS.inputInvalid, {
    field: "targetKind",
    reason: "built-in-target-declared-project",
  });
}
