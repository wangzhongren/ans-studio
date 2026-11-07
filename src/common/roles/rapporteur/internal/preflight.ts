// 内部文件：rapporteur `preflight.checkAction()` 纯策略。
//
// 覆盖的治理动作（契约 §3.4 rapporteur 行）：
//  - `detail-amendment`：整单修正案策略（整单提交；禁用提案接受 / VCA 批拒 / 修正案逐项 / 最终卡 / 旧批准器）；
//  - `run-change`：run 三模式选择策略（continue-frozen / stop-and-restart / stop + 绑定事实）；
//  - `requirement-change`：需求变更申请（归属键、变更类型、说明；申请≠批准、发起方不得自批）。
// 不在本角色归属内的动作 ⇒ `action-not-covered`（契约 §3.4）。
//
// 事实包规则（契约 §3.4/D4/Q13）：
//  - `facts` 是宿主已核验的普通 JSON 数据；本模块只读，不采集/推断/补造；
//  - 每个动作只允许 `api-spec.md` 登记的键；缺键 / 未知键 / 类型不符 ⇒ deny（fail-closed）；
//  - 这里只做角色侧纯策略，**不复制** Service/Provider 的最终校验（hash、结构、权限、实际 stop 证据、
//    trunk/pin 真实一致性等仍在 Service）；`allow: true` 只表示该纯策略不反对，不是权限票。
//
// `RUN_CHANGE_MODES` 直接取自 Model（`src/model/runtime.ts`），避免第二份模式闭集。
// `RequestRequirementChangeKind` 无运行时常量，故在下方登记一份类型化闭集（测试断言与 Model 一致）。

import type { RolePolicyDecision, RolePreflightInput } from "../../../../model/role.ts";
import type { RequestRequirementChangeKind, RunChangeMode } from "../../../../model/runtime.ts";
import { RUN_CHANGE_MODES } from "../../../../model/runtime.ts";
import { RAPPORTEUR_PREFLIGHT_CODES, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS } from "./codes.ts";

const ACTION_DETAIL_AMENDMENT = "detail-amendment" as const;
const ACTION_RUN_CHANGE = "run-change" as const;
const ACTION_REQUIREMENT_CHANGE = "requirement-change" as const;

/** `request_requirement_change` 的合法变更类型（与 Model `RequestRequirementChangeKind` 同集；测试断言）。 */
export const REQUIREMENT_CHANGE_KINDS: readonly RequestRequirementChangeKind[] = Object.freeze([
  "scope",
  "authorization",
  "constraint",
  "cost",
  "other",
]);

/**
 * 旧（已退役）卡/批准路径的闭集：detail-amendment 整单策略要求这些路径**全部不出现**。
 * 与旧卡文本逐字口径对应：提案接受（proposal-accept）、VCA 批拒（vca-batch-decision）、
 * 修正案逐项确认（amendment-item-confirm）、修正案最终卡（amendment-final-card）、旧批准器（legacy-approver）。
 */
export const RAPPORTEUR_LEGACY_CARD_PATHS = Object.freeze([
  "none",
  "proposal-accept",
  "vca-batch-decision",
  "amendment-item-confirm",
  "amendment-final-card",
  "legacy-approver",
] as const);

const ALLOW: RolePolicyDecision = Object.freeze({ allow: true });

type Facts = Readonly<Record<string, unknown>>;

interface FactOk<T> {
  readonly ok: true;
  readonly value: T;
}
interface FactFail {
  readonly ok: false;
  readonly decision: RolePolicyDecision;
}
type FactRead<T> = FactOk<T> | FactFail;

function denyDecision(code: string, messageKey: string, details?: Readonly<Record<string, unknown>>): RolePolicyDecision {
  return details === undefined
    ? Object.freeze({ allow: false as const, code, messageKey })
    : Object.freeze({ allow: false as const, code, messageKey, details: Object.freeze(details) });
}

function factFail(code: string, messageKey: string, details: Readonly<Record<string, unknown>>): FactFail {
  return { ok: false, decision: denyDecision(code, messageKey, details) };
}

function hasOwn(facts: Facts, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(facts, key);
}

function isPlainFacts(value: unknown): value is Facts {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFactFacts(input: RolePreflightInput | null | undefined): Facts | undefined {
  const facts = (input as { facts?: unknown } | null | undefined)?.facts;
  return isPlainFacts(facts) ? facts : undefined;
}

function rejectUnknownKeys(facts: Facts, allowedKeys: readonly string[], action: string): RolePolicyDecision | undefined {
  const unknownKeys = Object.keys(facts).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length === 0) return undefined;
  return denyDecision(RAPPORTEUR_PREFLIGHT_CODES.factsUnknownKey, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsUnknownKey, {
    action,
    unknownKeys: Object.freeze(unknownKeys.sort()),
  });
}

function readString(facts: Facts, key: string, action: string): FactRead<string> {
  if (!hasOwn(facts, key)) {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsMissing, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsMissing, {
      action,
      factKey: key,
    });
  }
  const value = facts[key];
  if (typeof value !== "string") {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action,
      factKey: key,
      expected: "string",
      actualType: typeof value,
    });
  }
  if (value.trim() === "") {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action,
      factKey: key,
      expected: "non-empty string",
    });
  }
  return { ok: true, value };
}

function readBoolean(facts: Facts, key: string, action: string): FactRead<boolean> {
  if (!hasOwn(facts, key)) {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsMissing, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsMissing, {
      action,
      factKey: key,
    });
  }
  const value = facts[key];
  if (typeof value !== "boolean") {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action,
      factKey: key,
      expected: "boolean",
      actualType: typeof value,
    });
  }
  return { ok: true, value };
}

function readOptionalBoolean(facts: Facts, key: string, action: string): FactRead<boolean | undefined> {
  if (!hasOwn(facts, key)) return { ok: true, value: undefined };
  const value = facts[key];
  if (typeof value !== "boolean") {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action,
      factKey: key,
      expected: "boolean",
      actualType: typeof value,
    });
  }
  return { ok: true, value };
}

function readInteger(facts: Facts, key: string, action: string, minimum: number): FactRead<number> {
  if (!hasOwn(facts, key)) {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsMissing, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsMissing, {
      action,
      factKey: key,
    });
  }
  const value = facts[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    return factFail(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action,
      factKey: key,
      expected: `integer >= ${minimum}`,
      actualType: typeof value,
    });
  }
  return { ok: true, value };
}

/** 身份：本模块只回答真实 rapporteur 的动作；缺失/冒用 ⇒ deny。 */
function checkInitiator(facts: Facts, action: string): RolePolicyDecision | undefined {
  const initiator = readString(facts, "initiatorRoleId", action);
  if (!initiator.ok) return initiator.decision;
  if (initiator.value !== "rapporteur") {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.initiatorMismatch,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.initiatorMismatch,
      { action, expectedInitiatorRoleId: "rapporteur", actualInitiatorRoleId: initiator.value },
    );
  }
  return undefined;
}

const DETAIL_AMENDMENT_KEYS = Object.freeze(["initiatorRoleId", "kind", "wholeOrder", "legacyCardPath"]);

/**
 * detail-amendment 整单策略：
 *  - 发起角色必须是 rapporteur，kind 必须是 detail-amendment；
 *  - 提交必须是整单（`wholeOrder: true`）；
 *  - 不得走旧卡/旧批准路径（`legacyCardPath: "none"`）。
 * 实际 targets 校验、hash、base、权限与 trunk 事务仍由 VCA/trunk Service 执行。
 */
function checkDetailAmendment(facts: Facts): RolePolicyDecision {
  const unknown = rejectUnknownKeys(facts, DETAIL_AMENDMENT_KEYS, ACTION_DETAIL_AMENDMENT);
  if (unknown !== undefined) return unknown;
  const initiator = checkInitiator(facts, ACTION_DETAIL_AMENDMENT);
  if (initiator !== undefined) return initiator;

  const kind = readString(facts, "kind", ACTION_DETAIL_AMENDMENT);
  if (!kind.ok) return kind.decision;
  if (kind.value !== ACTION_DETAIL_AMENDMENT) {
    return denyDecision(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action: ACTION_DETAIL_AMENDMENT,
      factKey: "kind",
      expected: ACTION_DETAIL_AMENDMENT,
      actual: kind.value,
    });
  }

  const wholeOrder = readBoolean(facts, "wholeOrder", ACTION_DETAIL_AMENDMENT);
  if (!wholeOrder.ok) return wholeOrder.decision;
  if (!wholeOrder.value) {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.amendmentNotWholeOrder,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.amendmentNotWholeOrder,
      { action: ACTION_DETAIL_AMENDMENT, expectedWholeOrder: true },
    );
  }

  const legacyCardPath = readString(facts, "legacyCardPath", ACTION_DETAIL_AMENDMENT);
  if (!legacyCardPath.ok) return legacyCardPath.decision;
  if (!(RAPPORTEUR_LEGACY_CARD_PATHS as readonly string[]).includes(legacyCardPath.value)) {
    return denyDecision(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action: ACTION_DETAIL_AMENDMENT,
      factKey: "legacyCardPath",
      expected: [...RAPPORTEUR_LEGACY_CARD_PATHS],
      actual: legacyCardPath.value,
    });
  }
  if (legacyCardPath.value !== "none") {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.amendmentLegacyCardPath,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.amendmentLegacyCardPath,
      { action: ACTION_DETAIL_AMENDMENT, legacyCardPath: legacyCardPath.value },
    );
  }
  return ALLOW;
}

const RUN_CHANGE_KEYS = Object.freeze([
  "initiatorRoleId",
  "mode",
  "operationId",
  "runId",
  "expectedPinDigest",
  "targetTrunkVersion",
  "targetTrunkDigest",
  "reason",
]);

/**
 * run-change 三模式选择策略：
 *  - 发起角色必须是 rapporteur；mode 必须属于 Model `RUN_CHANGE_MODES`；
 *  - 绑定事实必须齐备（runId / pinDigest / 目标 trunk version+digest / operationId / reason）；
 *  - 实际 pin/目标一致性、停稳证据与两阶段事务由 Service/宿主核验，本模块不采集、不判定。
 */
function checkRunChange(facts: Facts): RolePolicyDecision {
  const unknown = rejectUnknownKeys(facts, RUN_CHANGE_KEYS, ACTION_RUN_CHANGE);
  if (unknown !== undefined) return unknown;
  const initiator = checkInitiator(facts, ACTION_RUN_CHANGE);
  if (initiator !== undefined) return initiator;

  const mode = readString(facts, "mode", ACTION_RUN_CHANGE);
  if (!mode.ok) return mode.decision;
  if (!RUN_CHANGE_MODES.includes(mode.value as RunChangeMode)) {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.runChangeModeInvalid,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.runChangeModeInvalid,
      { action: ACTION_RUN_CHANGE, factKey: "mode", allowedModes: [...RUN_CHANGE_MODES], actual: mode.value },
    );
  }
  for (const key of ["operationId", "runId", "expectedPinDigest", "targetTrunkDigest", "reason"] as const) {
    const read = readString(facts, key, ACTION_RUN_CHANGE);
    if (!read.ok) return read.decision;
  }
  const targetTrunkVersion = readInteger(facts, "targetTrunkVersion", ACTION_RUN_CHANGE, 1);
  if (!targetTrunkVersion.ok) return targetTrunkVersion.decision;
  return ALLOW;
}

const REQUIREMENT_CHANGE_KEYS = Object.freeze([
  "initiatorRoleId",
  "changeKind",
  "flowId",
  "intentId",
  "taskId",
  "summary",
  "rationale",
  "impact",
  "proposedIntentPatch",
  "claimsApproved",
  "selfApproval",
]);

const REQUIREMENT_CHANGE_ATTRIBUTION_KEYS = Object.freeze(["flowId", "intentId", "taskId"] as const);

/**
 * requirement-change 申请策略：
 *  - 发起角色必须是 rapporteur；changeKind 属于 Model 闭集；
 *  - flowId / intentId / taskId **至少一个**（归因键）；
 *  - summary / rationale 必填；impact / proposedIntentPatch 可选；
 *  - 申请 ≠ 批准：`claimsApproved` / `selfApproval` 若声明必须为 false（发起方不得自批）。
 * 去重、归属校验、审批卡登记与派发由应用能力实现；本模块不产生批准。
 */
function checkRequirementChange(facts: Facts): RolePolicyDecision {
  const unknown = rejectUnknownKeys(facts, REQUIREMENT_CHANGE_KEYS, ACTION_REQUIREMENT_CHANGE);
  if (unknown !== undefined) return unknown;
  const initiator = checkInitiator(facts, ACTION_REQUIREMENT_CHANGE);
  if (initiator !== undefined) return initiator;

  const changeKind = readString(facts, "changeKind", ACTION_REQUIREMENT_CHANGE);
  if (!changeKind.ok) return changeKind.decision;
  if (!(REQUIREMENT_CHANGE_KINDS as readonly string[]).includes(changeKind.value)) {
    return denyDecision(RAPPORTEUR_PREFLIGHT_CODES.factsInvalid, RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid, {
      action: ACTION_REQUIREMENT_CHANGE,
      factKey: "changeKind",
      expected: [...REQUIREMENT_CHANGE_KINDS],
      actual: changeKind.value,
    });
  }

  let attributionKeys = 0;
  for (const key of REQUIREMENT_CHANGE_ATTRIBUTION_KEYS) {
    if (!hasOwn(facts, key)) continue;
    const read = readString(facts, key, ACTION_REQUIREMENT_CHANGE);
    if (!read.ok) return read.decision;
    attributionKeys += 1;
  }
  if (attributionKeys === 0) {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.requirementChangeRefMissing,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.requirementChangeRefMissing,
      { action: ACTION_REQUIREMENT_CHANGE, requiredAnyOf: [...REQUIREMENT_CHANGE_ATTRIBUTION_KEYS] },
    );
  }

  for (const key of ["summary", "rationale"] as const) {
    const read = readString(facts, key, ACTION_REQUIREMENT_CHANGE);
    if (!read.ok) return read.decision;
  }
  for (const key of ["impact", "proposedIntentPatch"] as const) {
    if (!hasOwn(facts, key)) continue;
    const read = readString(facts, key, ACTION_REQUIREMENT_CHANGE);
    if (!read.ok) return read.decision;
  }

  const claimsApproved = readOptionalBoolean(facts, "claimsApproved", ACTION_REQUIREMENT_CHANGE);
  if (!claimsApproved.ok) return claimsApproved.decision;
  if (claimsApproved.value === true) {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.requirementChangeApprovalClaimed,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.requirementChangeApprovalClaimed,
      { action: ACTION_REQUIREMENT_CHANGE },
    );
  }

  const selfApproval = readOptionalBoolean(facts, "selfApproval", ACTION_REQUIREMENT_CHANGE);
  if (!selfApproval.ok) return selfApproval.decision;
  if (selfApproval.value === true) {
    return denyDecision(
      RAPPORTEUR_PREFLIGHT_CODES.requirementChangeSelfApproval,
      RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.requirementChangeSelfApproval,
      { action: ACTION_REQUIREMENT_CHANGE },
    );
  }
  return ALLOW;
}

/**
 * 纯函数入口：按动作分派到对应的纯策略。
 *
 * 未覆盖动作 ⇒ `action-not-covered`（契约 §3.4 指定稳定码）；`facts` 不是普通对象 ⇒ deny。
 * 不抛异常、不读盘、不写盘、无状态。
 */
export function checkRapporteurAction(input: RolePreflightInput): RolePolicyDecision {
  const action = (input as { action?: unknown } | null | undefined)?.action;
  if (action === ACTION_DETAIL_AMENDMENT || action === ACTION_RUN_CHANGE || action === ACTION_REQUIREMENT_CHANGE) {
    const facts = readFactFacts(input);
    if (facts === undefined) {
      return denyDecision(
        RAPPORTEUR_PREFLIGHT_CODES.factsInvalid,
        RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.factsInvalid,
        { action, reason: "facts must be a plain object" },
      );
    }
    if (action === ACTION_DETAIL_AMENDMENT) return checkDetailAmendment(facts);
    if (action === ACTION_RUN_CHANGE) return checkRunChange(facts);
    return checkRequirementChange(facts);
  }
  return denyDecision(
    RAPPORTEUR_PREFLIGHT_CODES.actionNotCovered,
    RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS.actionNotCovered,
    { action: typeof action === "string" && action !== "" ? action : "unknown" },
  );
}
