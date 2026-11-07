// product 角色模块内部：version-upgrade（VCA 提交）前置策略（纯函数 + 宿主事实；E0.3 §3.4/§3.5）。
//
// 归属：product 只覆盖 `version-upgrade`（§3.4 表）；其他动作一律 `action-not-covered`。
// 本策略只做**角色侧提交前置**，不复制 Service 的最终校验：
// - 覆盖（旧 VCA/trunk 角色侧条件）：
//   · trusted actor / initiator 必须是 product（vca-service `vca-role-not-allowed`；
//     version-change-runtime / apply-journal `prepareDirectSubmission` 的 actor 校验）；
//   · kind 必须是 version-upgrade（`VERSION_CHANGE_INITIATOR_BY_KIND`，产品不提交修正案）；
//   · 直接提交必须带 operationId 与显式 baseTrunk（`prepareDirectSubmission`）；
//   · baseTrunk 形状 `{version, digest}`（TrunkCommitRef）或 null；null 必须配 `bootstrap:true`
//     （`vca-service.validateBaseTrunk` 的配对条件）；
//   · 每个 target 必须带 `expectedFromSha256`（直接 CAS 前置）；
//   · version-upgrade 不得引用修正案/items（`vca-service.validateAmendmentRefs`）。
// - 不覆盖（Service/Provider 最终校验，不因 preflight allow 而省略）：
//   文件字节/hash 重算、target kind/path 的作者写区与版本链、base 与当前 trunk 的全等、
//   flowId/summary 结构、同 flow pending、快照/冻结/apply/journal。
//
// 事实包规则（E0 D4）：只读取本文件声明的键；缺键/未知键/类型不符一律 deny（fail-closed）。
// 返回值只含普通数据与判定，不携带权限、不抛异常作控制流。

import type {
  RolePolicyDecision,
  RolePreflightHooks,
  RolePreflightInput,
} from "../../../../model/role.ts";

/** 稳定内部码（`action-not-covered` 为契约 §3.5 冻结码；其余模块自定义并登记）。 */
export const PRODUCT_PREFLIGHT_CODES = Object.freeze({
  actionNotCovered: "action-not-covered",
  factsMissing: "product-facts-missing",
  factsInvalid: "product-facts-invalid",
  factsUnknownKey: "product-facts-unknown-key",
  initiatorMismatch: "product-initiator-mismatch",
  kindMismatch: "product-kind-mismatch",
  amendmentRefForbidden: "product-amendment-ref-forbidden",
  operationIdMissing: "product-operation-id-missing",
  bootstrapMismatch: "product-bootstrap-mismatch",
  baseTrunkInvalid: "product-base-trunk-invalid",
  targetsInvalid: "product-targets-invalid",
});

/** 稳定 i18n messageKey（E1 接口评审时登记文案；当前只作稳定内部诊断键）。 */
export const PRODUCT_PREFLIGHT_MESSAGE_KEYS = Object.freeze({
  actionNotCovered: "role.product.preflight.actionNotCovered",
  factsMissing: "role.product.preflight.factsMissing",
  factsInvalid: "role.product.preflight.factsInvalid",
  factsUnknownKey: "role.product.preflight.factsUnknownKey",
  initiatorMismatch: "role.product.preflight.initiatorMismatch",
  kindMismatch: "role.product.preflight.kindMismatch",
  amendmentRefForbidden: "role.product.preflight.amendmentRefForbidden",
  operationIdMissing: "role.product.preflight.operationIdMissing",
  bootstrapMismatch: "role.product.preflight.bootstrapMismatch",
  baseTrunkInvalid: "role.product.preflight.baseTrunkInvalid",
  targetsInvalid: "role.product.preflight.targetsInvalid",
});

/** 该动作要求提供的事实键（缺一即 deny）。 */
const REQUIRED_FACT_KEYS = Object.freeze([
  "initiatorRoleId",
  "kind",
  "operationId",
  "baseTrunk",
  "targets",
]);

/** 该动作允许出现的事实键（含显式禁止的修正案引用键；其余键视为未知并拒绝）。 */
const DECLARED_FACT_KEYS: ReadonlySet<string> = new Set([
  ...REQUIRED_FACT_KEYS,
  "bootstrap",
  "amendmentId",
  "amendmentDocPath",
  "amendmentItems",
]);

/** 明确禁止的修正案引用键（version-upgrade 不得引用修正案/items）。 */
const FORBIDDEN_AMENDMENT_FACT_KEYS = Object.freeze([
  "amendmentId",
  "amendmentDocPath",
  "amendmentItems",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(facts: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(facts, key);
}

function deny(
  code: string,
  messageKey: string,
  details: Readonly<Record<string, unknown>>,
): RolePolicyDecision {
  return Object.freeze({
    allow: false as const,
    code,
    messageKey,
    details: Object.freeze({ roleId: "product", ...details }),
  });
}

function factsMissing(key: string): RolePolicyDecision {
  return deny(PRODUCT_PREFLIGHT_CODES.factsMissing, PRODUCT_PREFLIGHT_MESSAGE_KEYS.factsMissing, {
    action: "version-upgrade",
    factKey: key,
  });
}

function factsInvalid(key: string, expected: string, actualType: string): RolePolicyDecision {
  return deny(PRODUCT_PREFLIGHT_CODES.factsInvalid, PRODUCT_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
    action: "version-upgrade",
    factKey: key,
    expected,
    actualType,
  });
}

/**
 * version-upgrade 提交前置校验（纯函数）。
 *
 * 事实键（api-spec.md 登记）：
 * - `initiatorRoleId` string：可信会话角色，必须为 `"product"`；
 * - `kind` string：必须为 `"version-upgrade"`；
 * - `operationId` string：直接提交的 operation id（非空）；
 * - `baseTrunk` object|null：`{version: integer>=1, digest: string}` 或 null（bootstrap）；
 * - `bootstrap` boolean（可选）：`baseTrunk === null` 时必须为 true，否则不得为 true；
 * - `targets` array：至少一项，每项带 `expectedFromSha256: string|null`；
 * - `amendmentId`/`amendmentDocPath`/`amendmentItems`：必须缺席。
 */
export function productPreflightCheck(input: RolePreflightInput): RolePolicyDecision {
  if (input.action !== "version-upgrade") {
    return deny(
      PRODUCT_PREFLIGHT_CODES.actionNotCovered,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.actionNotCovered,
      { action: input.action },
    );
  }

  const facts: unknown = input.facts;
  if (!isPlainObject(facts)) {
    return deny(PRODUCT_PREFLIGHT_CODES.factsInvalid, PRODUCT_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action: "version-upgrade",
      factKey: "facts",
      expected: "object",
      actualType: typeof facts,
    });
  }

  const unknownKeys = Object.keys(facts)
    .filter((key) => !DECLARED_FACT_KEYS.has(key))
    .sort();
  if (unknownKeys.length > 0) {
    return deny(
      PRODUCT_PREFLIGHT_CODES.factsUnknownKey,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.factsUnknownKey,
      { action: "version-upgrade", unknownKeys: Object.freeze(unknownKeys) },
    );
  }

  for (const key of REQUIRED_FACT_KEYS) {
    if (!hasOwn(facts, key) || facts[key] === undefined) return factsMissing(key);
  }

  const initiatorRoleId = facts["initiatorRoleId"];
  if (typeof initiatorRoleId !== "string") {
    return factsInvalid("initiatorRoleId", "string", typeof initiatorRoleId);
  }
  if (initiatorRoleId !== "product") {
    return deny(
      PRODUCT_PREFLIGHT_CODES.initiatorMismatch,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.initiatorMismatch,
      { action: "version-upgrade", expected: "product", actual: initiatorRoleId },
    );
  }

  const kind = facts["kind"];
  if (typeof kind !== "string") return factsInvalid("kind", "string", typeof kind);
  if (kind !== "version-upgrade") {
    return deny(PRODUCT_PREFLIGHT_CODES.kindMismatch, PRODUCT_PREFLIGHT_MESSAGE_KEYS.kindMismatch, {
      action: "version-upgrade",
      expected: "version-upgrade",
      actual: kind,
    });
  }

  for (const key of FORBIDDEN_AMENDMENT_FACT_KEYS) {
    if (hasOwn(facts, key) && facts[key] !== undefined) {
      return deny(
        PRODUCT_PREFLIGHT_CODES.amendmentRefForbidden,
        PRODUCT_PREFLIGHT_MESSAGE_KEYS.amendmentRefForbidden,
        { action: "version-upgrade", factKey: key },
      );
    }
  }

  const operationId = facts["operationId"];
  if (typeof operationId !== "string") {
    return factsInvalid("operationId", "string", typeof operationId);
  }
  if (operationId.trim() === "") {
    return deny(
      PRODUCT_PREFLIGHT_CODES.operationIdMissing,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.operationIdMissing,
      { action: "version-upgrade", factKey: "operationId" },
    );
  }

  const bootstrapRaw = facts["bootstrap"];
  if (bootstrapRaw !== undefined && typeof bootstrapRaw !== "boolean") {
    return factsInvalid("bootstrap", "boolean", typeof bootstrapRaw);
  }
  const bootstrap = bootstrapRaw === true;

  const baseTrunk = facts["baseTrunk"];
  if (baseTrunk === null) {
    if (!bootstrap) {
      return deny(
        PRODUCT_PREFLIGHT_CODES.bootstrapMismatch,
        PRODUCT_PREFLIGHT_MESSAGE_KEYS.bootstrapMismatch,
        { action: "version-upgrade", baseTrunk: "null", bootstrap },
      );
    }
  } else if (!isPlainObject(baseTrunk)) {
    return deny(
      PRODUCT_PREFLIGHT_CODES.baseTrunkInvalid,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.baseTrunkInvalid,
      {
        action: "version-upgrade",
        factKey: "baseTrunk",
        expected: "object-or-null",
        actualType: Array.isArray(baseTrunk) ? "array" : typeof baseTrunk,
      },
    );
  } else {
    const version = baseTrunk["version"];
    const digest = baseTrunk["digest"];
    if (
      typeof version !== "number"
      || !Number.isSafeInteger(version)
      || version < 1
      || typeof digest !== "string"
      || digest.trim() === ""
    ) {
      return deny(
        PRODUCT_PREFLIGHT_CODES.baseTrunkInvalid,
        PRODUCT_PREFLIGHT_MESSAGE_KEYS.baseTrunkInvalid,
        { action: "version-upgrade", factKey: "baseTrunk", reason: "shape" },
      );
    }
    if (bootstrap) {
      return deny(
        PRODUCT_PREFLIGHT_CODES.bootstrapMismatch,
        PRODUCT_PREFLIGHT_MESSAGE_KEYS.bootstrapMismatch,
        { action: "version-upgrade", baseTrunk: "object", bootstrap },
      );
    }
  }

  const targets = facts["targets"];
  if (!Array.isArray(targets) || targets.length === 0) {
    return deny(
      PRODUCT_PREFLIGHT_CODES.targetsInvalid,
      PRODUCT_PREFLIGHT_MESSAGE_KEYS.targetsInvalid,
      { action: "version-upgrade", factKey: "targets", reason: "missing-or-empty" },
    );
  }
  for (let index = 0; index < targets.length; index += 1) {
    const target: unknown = targets[index];
    if (
      !isPlainObject(target)
      || !hasOwn(target, "expectedFromSha256")
      || !(target["expectedFromSha256"] === null || typeof target["expectedFromSha256"] === "string")
    ) {
      return deny(
        PRODUCT_PREFLIGHT_CODES.targetsInvalid,
        PRODUCT_PREFLIGHT_MESSAGE_KEYS.targetsInvalid,
        { action: "version-upgrade", factKey: "targets", reason: "expectedFromSha256", index },
      );
    }
  }

  return Object.freeze({ allow: true });
}

/** 冻结的 preflight 钩子（`BuiltInRoleModule["preflight"]`）。 */
export const productPreflight: RolePreflightHooks = Object.freeze({
  checkAction: productPreflightCheck,
});
