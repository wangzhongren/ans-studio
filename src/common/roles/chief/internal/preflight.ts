// chief 角色模块：动作前置策略（preflight；纯函数，无 I/O/账本/会话/时钟/随机数/可变状态）。
//
// 覆盖范围（E0.3 §3.4）：chief 只覆盖 `version-decision`（版本决策申请）；其余动作
// 由对应角色模块覆盖，本模块以固定码 `action-not-covered` 拒绝。
//
// 事实包纪律（E0.3 §3.4/D4；Q13 默认口径）：
//  - `facts` 是宿主已核验的普通数据；本模块只读 `api-spec.md` 登记的键；
//  - 缺必需键/未知键/类型不符 ⇒ deny（fail-closed）；不采集、不推断、不补造；
//  - preflight 只做角色侧前置；**不替代** Service/Provider 最终校验——旧引擎的
//    `src/common/编排/version-decision.ts::validateVersionDecisionRequest`（请求形状）与
//    `validateVersionDecisionContext`（pinned/多 run/pending）仍由宿主执行。
//
// 旧工具纪律（只读 oracle）`src/provider/runtime/schema.ts:1527-1580`：
//  - 两动作固定 `version-modify` / `new-version-development`；
//  - `flowId` 为治理 slug；`reason` 必填且 ≤ `VERSION_DECISION_REASON_MAX` 字符；
//  - `refs` ≤ `VERSION_DECISION_REFS_MAX` 项；pinned run 应走既有 run-change。

import type {
  RolePolicyDecision,
  RolePreflightHooks,
  RolePreflightInput,
} from "../../../../model/role.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../../model/runtime.ts";
import {
  VERSION_DECISION_ACTIONS,
  VERSION_DECISION_REASON_MAX,
  VERSION_DECISION_REFS_MAX,
} from "../../../../model/project-state.ts";
import { CHIEF_MESSAGE_KEYS, CHIEF_POLICY_CODES } from "./codes.ts";

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

/** 本动作允许读取的 fact 键（api-spec 登记；未知键 ⇒ deny）。 */
const VERSION_DECISION_FACT_KEYS: readonly string[] = Object.freeze([
  "flowId",
  "runId",
  "action",
  "reason",
  "refs",
  "runState",
  "pendingVersionDecisionCount",
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deny(
  code: string,
  messageKey: string,
  details?: Readonly<Record<string, unknown>>,
): RolePolicyDecision {
  return details === undefined ? { allow: false, code, messageKey } : { allow: false, code, messageKey, details };
}

function factMissing(key: string): RolePolicyDecision {
  return deny(CHIEF_POLICY_CODES.preflightFactMissing, CHIEF_MESSAGE_KEYS.preflightFactMissing, { key });
}

function factInvalid(key: string, reason: string): RolePolicyDecision {
  return deny(CHIEF_POLICY_CODES.preflightFactInvalid, CHIEF_MESSAGE_KEYS.preflightFactInvalid, { key, reason });
}

function isVersionDecisionAction(value: unknown): boolean {
  return typeof value === "string" && VERSION_DECISION_ACTIONS.some((action) => action === value);
}

/** `version-decision` 的角色侧前置：请求面 + 可选的 pinned/pending 宿主事实。 */
function checkVersionDecision(facts: Readonly<Record<string, unknown>>): RolePolicyDecision {
  for (const key of Object.keys(facts)) {
    if (!VERSION_DECISION_FACT_KEYS.some((allowed) => allowed === key)) return factInvalid(key, "unknown-key");
  }

  const flowId = facts["flowId"];
  if (flowId === undefined) return factMissing("flowId");
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) return factInvalid("flowId", "not-governance-slug");

  const action = facts["action"];
  if (action === undefined) return factMissing("action");
  if (!isVersionDecisionAction(action)) return factInvalid("action", "not-version-decision-action");

  const reason = facts["reason"];
  if (reason === undefined) return factMissing("reason");
  if (typeof reason !== "string" || reason.trim() === "") return factInvalid("reason", "empty");
  if (Array.from(reason).length > VERSION_DECISION_REASON_MAX) return factInvalid("reason", "too-long");

  const runId = facts["runId"];
  if (runId !== undefined && (typeof runId !== "string" || runId.trim() === "")) {
    return factInvalid("runId", "not-non-empty-string");
  }

  const refs = facts["refs"];
  if (refs !== undefined) {
    if (!Array.isArray(refs) || refs.length > VERSION_DECISION_REFS_MAX) return factInvalid("refs", "too-many");
    if (!refs.every((ref) => typeof ref === "string" && ref.trim() !== "")) return factInvalid("refs", "not-non-empty-strings");
  }

  const runState = facts["runState"];
  if (runState !== undefined) {
    if (runState !== "draft" && runState !== "pinned" && runState !== "legacy") {
      return factInvalid("runState", "unknown-run-state");
    }
    if (runState === "pinned") {
      return deny(
        CHIEF_POLICY_CODES.versionDecisionPinnedRun,
        CHIEF_MESSAGE_KEYS.versionDecisionPinnedRun,
        { action },
      );
    }
  }

  const pending = facts["pendingVersionDecisionCount"];
  if (pending !== undefined) {
    if (typeof pending !== "number" || !Number.isSafeInteger(pending) || pending < 0) {
      return factInvalid("pendingVersionDecisionCount", "not-non-negative-integer");
    }
    if (pending > 0) {
      return deny(
        CHIEF_POLICY_CODES.versionDecisionPending,
        CHIEF_MESSAGE_KEYS.versionDecisionPending,
        { pendingVersionDecisionCount: pending },
      );
    }
  }

  return { allow: true };
}

/** chief 的 preflight hooks（冻结对象；`checkAction` 为纯函数）。 */
export const CHIEF_PREFLIGHT: RolePreflightHooks = Object.freeze({
  checkAction(input: RolePreflightInput): RolePolicyDecision {
    const action: unknown = input?.action;
    if (action !== "version-decision") {
      return deny(CHIEF_POLICY_CODES.actionNotCovered, CHIEF_MESSAGE_KEYS.actionNotCovered, {
        action: typeof action === "string" ? action : "missing",
      });
    }
    const facts: unknown = input?.facts;
    if (!isRecord(facts)) return factMissing("facts");
    return checkVersionDecision(facts);
  },
});
