// app/desktop/requirement-change.ts
// 2026-10-26 需求变更申请（`request_requirement_change`）桌面侧应用能力的**纯逻辑**：
// 载荷二次校验、稳定 requestId、票据路径/形状、需求变更审批 decision 卡与已批准执行任务文本。
//
// 客户纠正（2026-10-26）：需求变更**不由主理审批**；审批由客户（未勾选「替我决策」）或独立判断
// agent（勾选时默认选唯一推荐项）在 `request_choice(cardKind="decision")` 卡上完成。审批卡由
// **统筹（convener）或提案（rapporteur）**发起/持有（其他内置治理角色与项目角色不可），发起方不得
// 自批。批准后应用把**已批准执行任务**交给主理：主理只执行意图变更（更新 `docs/intents/**`）并通知
// 提案修订；拒绝时回执给发起方。本模块只产纯数据与文本，不写盘、不开会话、不调用模型。
//
// 分层纪律：
//  - 契约形状的单一来源＝契约家 `src/model/runtime.ts`（`RequestRequirementChangeInput` /
//    `RequestRequirementChangeResult` / `RequestRequirementChangeKind` / `CustomerInputRequest`）——
//    只读导入、不复制。
//  - 意图路径的单一来源＝编排公共出口（`intentArtifactPath`），本模块不另写第二份路径规则。
//  - **申请 ≠ 批准**：卡片任务只呈现 Draft/统筹 的申请内容与「发起方不得自批」纪律，绝不夹带
//    「客户已批准」「意图已确认」或新授权；票据是应用自有 `.ans` 审计记录（不写治理账本、
//    不写 `customer.decision`、不改变任何写权）。

import { createHash } from "node:crypto";
import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";
import type {
  CustomerInputRequest,
  RequestRequirementChangeInput,
  RequestRequirementChangeKind,
} from "../../src/model/runtime.ts";
import { intentArtifactPath } from "../../src/common/编排/governance-judge-intent.ts";
import { mainT } from "./i18n.ts";

/**
 * 审计票据 schema（应用自有 `.ans/governance/` 记录；不是治理账本条目）。
 * v2（2026-10-26 客户纠正）：申请不再投递主理审批；记录**独立审批 decision 卡**与
 * **已批准执行任务**两段事实，状态机见 `RequirementChangeTicketStatus`。
 */
export const REQUIREMENT_CHANGE_TICKET_SCHEMA = "requirement-change-request/v2";
/** 票据根目录（项目相对）：`<root>/<scopeKey>/<requestId>.json`，原子写、重启可读。 */
export const REQUIREMENT_CHANGE_TICKET_ROOT_REL = ".ans/governance/requirement-changes";

/** 需求变更审批卡种与选项（客户纠正冻结：`decision` 卡、`approve` / `reject`、唯一推荐 `approve`）。 */
export const REQUIREMENT_CHANGE_APPROVAL_CARD_KIND = "decision" as const;
export const REQUIREMENT_CHANGE_APPROVAL_OPTIONS = Object.freeze(["approve", "reject"] as const);
export const REQUIREMENT_CHANGE_RECOMMENDED_OPTION = "approve" as const;

/** 审批卡选项中文标签（卡面文案；选项 **id** 才是机器契约，标签不影响判定）。 */
export const REQUIREMENT_CHANGE_APPROVAL_OPTION_LABELS = Object.freeze({
  approve: "批准",
  reject: "拒绝",
} as const);

/** 发起方白名单（按治理职能，不硬编码角色 id）：统筹（schedule）与提案（proposal）；其他角色不可。 */
export const REQUIREMENT_CHANGE_INITIATOR_FUNCTIONS = Object.freeze(["schedule", "proposal"] as const);

/**
 * 需求变更种类（与契约家 `RequestRequirementChangeKind` 同一枚举；运行时核心工具已在触达能力前
 * 校验，这里是能力入口的第二道）。
 */
export const REQUIREMENT_CHANGE_KINDS: readonly RequestRequirementChangeKind[] = Object.freeze([
  "scope",
  "authorization",
  "constraint",
  "cost",
  "other",
]);

/** 有界文本上限（按 Unicode 码点计；**超长拒绝、绝不静默截断**——与工具层同口径）。 */
export const REQUIREMENT_CHANGE_LIMITS = Object.freeze({
  summary: 500,
  rationale: 4000,
  impact: 2000,
  proposedIntentPatch: 4000,
});

export type RequirementChangeAssessmentOk = {
  ok: true;
  /** 显式给出的流程 id（未给则缺席；不凭空编造）。 */
  flowId?: string;
  /** 显式给出的意图 id（未给则缺席；不凭空编造）。 */
  intentId?: string;
  /** C 批：无 flow/intent 时的 task 归属键。 */
  taskId?: string;
  /** 票据目录与「同一 flow 去重」的归属键：`flowId ?? intentId ?? taskId`。 */
  scopeKey: string;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact?: string;
  proposedIntentPatch?: string;
};

export type RequirementChangeAssessmentFailure = {
  ok: false;
  detail: string;
};

export type RequirementChangeAssessment = RequirementChangeAssessmentOk | RequirementChangeAssessmentFailure;

function governanceSlugOrFailure(raw: unknown, label: string): { ok: true; value?: string } | { ok: false; detail: string } {
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || !new RegExp(GOVERNANCE_SLUG_PATTERN).test(raw)) {
    return { ok: false, detail: `${label} 非法（须为匹配 ${GOVERNANCE_SLUG_PATTERN} 的 slug 字符串）` };
  }
  return { ok: true, value: raw };
}

function requiredText(
  raw: unknown,
  label: string,
  max: number,
): { ok: true; value: string } | { ok: false; detail: string } {
  if (typeof raw !== "string") return { ok: false, detail: `${label} 必须是字符串` };
  const value = raw.trim();
  if (value === "") return { ok: false, detail: `${label} 不能为空` };
  const length = Array.from(value).length;
  if (length > max) return { ok: false, detail: `${label} 超过 ${max} 字（${length} 字；有界文本，不截断）` };
  return { ok: true, value };
}

function optionalText(
  raw: unknown,
  label: string,
  max: number,
): { ok: true; value?: string } | { ok: false; detail: string } {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "string") return { ok: false, detail: `${label} 必须是字符串（可省略）` };
  const value = raw.trim();
  if (value === "") return { ok: false, detail: `${label} 已给出但不能为空（可省略）` };
  const length = Array.from(value).length;
  if (length > max) return { ok: false, detail: `${label} 超过 ${max} 字（${length} 字；有界文本，不截断）` };
  return { ok: true, value };
}

/**
 * 能力入口的第二道校验（工具层已做形状校验；外部调用方/测试可绕过工具直接调用）：
 *  1. `flowId` / `intentId` 各自须为合法 slug，且**至少给出一个**；
 *  2. `changeKind` 必须在冻结枚举内；
 *  3. `summary` / `rationale` 必填非空且有界；`impact` / `proposedIntentPatch` 可选有界；
 *  4. 值做 trim（票据/稳定哈希使用同一份归一值）；超长**拒绝**、不截断。
 *
 * 本函数**不读盘**：意图/流程是否存在由调用方（interface.ts）检查，便于保持纯逻辑可单测。
 */
export function assessRequirementChangeRequest(input: unknown): RequirementChangeAssessment {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, detail: "请求载荷必须是对象" };
  }
  const record = input as Record<string, unknown>;
  const flowId = governanceSlugOrFailure(record["flowId"], "flowId");
  if (!flowId.ok) return flowId;
  const intentId = governanceSlugOrFailure(record["intentId"], "intentId");
  if (!intentId.ok) return intentId;
  const taskIdRaw = record["taskId"];
  const taskId = typeof taskIdRaw === "string" ? taskIdRaw.trim() : undefined;
  if (taskIdRaw !== undefined && (typeof taskIdRaw !== "string" || taskId === "")) {
    return { ok: false, detail: "taskId 已给出但不能为空" };
  }
  if (flowId.value === undefined && intentId.value === undefined && taskId === undefined) {
    return { ok: false, detail: "缺少 flowId/intentId/taskId（至少给出一个，用于归属校验/去重）" };
  }
  const changeKind = record["changeKind"];
  if (typeof changeKind !== "string" || !(REQUIREMENT_CHANGE_KINDS as readonly string[]).includes(changeKind)) {
    return { ok: false, detail: `changeKind 非法（须为 ${REQUIREMENT_CHANGE_KINDS.join(" / ")} 之一）` };
  }
  const summary = requiredText(record["summary"], "summary", REQUIREMENT_CHANGE_LIMITS.summary);
  if (!summary.ok) return summary;
  const rationale = requiredText(record["rationale"], "rationale", REQUIREMENT_CHANGE_LIMITS.rationale);
  if (!rationale.ok) return rationale;
  const impact = optionalText(record["impact"], "impact", REQUIREMENT_CHANGE_LIMITS.impact);
  if (!impact.ok) return impact;
  const proposedIntentPatch = optionalText(
    record["proposedIntentPatch"],
    "proposedIntentPatch",
    REQUIREMENT_CHANGE_LIMITS.proposedIntentPatch,
  );
  if (!proposedIntentPatch.ok) return proposedIntentPatch;
  return {
    ok: true,
    ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
    ...(intentId.value !== undefined ? { intentId: intentId.value } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    scopeKey: flowId.value ?? intentId.value ?? taskId!,
    changeKind: changeKind as RequestRequirementChangeKind,
    summary: summary.value,
    rationale: rationale.value,
    ...(impact.value !== undefined ? { impact: impact.value } : {}),
    ...(proposedIntentPatch.value !== undefined ? { proposedIntentPatch: proposedIntentPatch.value } : {}),
  };
}

/**
 * 稳定 requestId：发起角色 + flowId/intentId + 全部申请内容（trim）的 SHA-256 前 16 hex。
 * 同一内容（重试/重建前后）⇒ 同一票据 id 与同一执行任务投递键；内容变化 ⇒ 新 id（但同一 flow 有
 * 待处理/已批准申请时仍由 `already-dispatched` 挡住，不重复提交）。
 */
export function requirementChangeRequestId(input: {
  requestedBy: string;
  flowId?: string;
  intentId?: string;
  taskId?: string;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact?: string;
  proposedIntentPatch?: string;
}): string {
  const canonical = JSON.stringify([
    input.requestedBy.trim(),
    input.flowId ?? null,
    input.intentId ?? null,
    input.taskId ?? null,
    input.changeKind,
    input.summary.trim(),
    input.rationale.trim(),
    input.impact?.trim() ?? null,
    input.proposedIntentPatch?.trim() ?? null,
  ]);
  return `req-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/** 稳定 clientMessageId（`ans-app-task:` 前缀；同一 requestId 的已批准执行任务至多投递一次）。 */
export function requirementChangeClientMessageId(requestId: string): string {
  const digest = createHash("sha256").update(`requirement-change\u0000${requestId}`).digest("hex").slice(0, 32);
  return `ans-app-task:${digest}`;
}

/** 票据项目相对路径 `.ans/governance/requirement-changes/<scopeKey>/<requestId>.json`。 */
export function requirementChangeTicketRelPath(scopeKey: string, requestId: string): string {
  return `${REQUIREMENT_CHANGE_TICKET_ROOT_REL}/${scopeKey}/${requestId}.json`;
}

/**
 * 票据状态机（应用自有审计记录）：
 *  · `requested`  — 已登记、审批卡尚未呈现；
 *  · `dispatched` — 审批 decision 卡已呈现，等待客户/判断 agent 审批（**不是批准**）；
 *  · `approved`   — 独立审批通过，已/正在把已批准执行任务交给主理（仍在途：意图变更/提案修订未完）；
 *  · `rejected`   — 独立审批明确选择 `reject`（终态；可重新申请）；
 *  · `failed`     — 提交或审批通道失败 / 未获明确结果（终态；可重试）。
 */
export type RequirementChangeTicketStatus = "requested" | "dispatched" | "approved" | "rejected" | "failed";

/** 待处理（未关闭）的票据状态：同一 flow 命中即 `already-dispatched`，不重复提交。 */
export function isPendingRequirementChangeStatus(status: unknown): status is "requested" | "dispatched" | "approved" {
  return status === "requested" || status === "dispatched" || status === "approved";
}

/** 独立审批结果（客户/判断 agent 在 decision 卡上的结算；应用审计，不是治理账本条目）。 */
export interface RequirementChangeApprovalRecord {
  /** `no-decision`＝卡片被取消/超时/通道不可用（未获明确审批，不是客户拒绝）。 */
  outcome: "approved" | "rejected" | "no-decision";
  /** `judge`＝「替我决策」判断 agent 代批（默认推荐项）；`customer`＝客户在卡上选择。 */
  source: "customer" | "judge";
  /** 卡上实际选中的选项 id（未作答为空数组）。 */
  selected: string[];
  operatorId: string | null;
  decidedAt: string;
  reason: string | null;
}

/** 已批准执行任务投递记录（批准后交给主理；失败/超时如实记录，不谎称已交接）。 */
export interface RequirementChangeLeadDispatchRecord {
  clientMessageId: string;
  sentAt: string;
  runtime: string;
  queued?: boolean;
  /** 投递任务文本的 SHA-256（消息摘要；不存全文）。 */
  messageSha256?: string;
  /** 投递失败/超时原因（status 仍 approved；执行任务可能未送达/可能已送达，请核对）。 */
  error?: string;
}

/** 审计票据（应用自有 `.ans` 记录；不写 `customer.decision`、不伪造批准）。 */
export interface RequirementChangeTicketRecord {
  schema: typeof REQUIREMENT_CHANGE_TICKET_SCHEMA;
  requestId: string;
  /** 发起/持卡角色（统筹 convener 或提案 rapporteur；其他角色不可发起）。 */
  requestedBy: string;
  /** 显式给出的流程 id；未给出为 null（不编造）。 */
  flowId: string | null;
  /** 显式给出的意图 id；未给出为 null（不编造）。 */
  intentId: string | null;
  /** C 批：显式给出的 taskId；未给出为 null。 */
  taskId: string | null;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact: string | null;
  proposedIntentPatch: string | null;
  status: RequirementChangeTicketStatus;
  /** 首次登记时间（ISO；重试保留）。 */
  at: string;
  /** 最近一次状态更新时间（ISO）。 */
  updatedAt: string;
  attempts: number;
  /** 审批卡提交事实（dispatched/approved/rejected 时非 null）。 */
  submission: null | {
    cardRoleId: string;
    cardKind: typeof REQUIREMENT_CHANGE_APPROVAL_CARD_KIND;
    options: readonly ["approve", "reject"];
    recommended: typeof REQUIREMENT_CHANGE_RECOMMENDED_OPTION;
    submittedAt: string;
  };
  /** 独立审批结果（客户/判断 agent 的 decision 卡结算）。 */
  approval: RequirementChangeApprovalRecord | null;
  /** 已批准执行任务投递（只允许 approved 后出现）。 */
  leadDispatch: RequirementChangeLeadDispatchRecord | null;
  /** 失败原因（failed 时如实记录；可重试）。 */
  error: string | null;
}

/** 有界诊断/回执 detail（超长截断；仅用于文案与票据 error，不影响稳定哈希）。 */
export function requirementChangeDetailText(text: unknown, max = 500): string {
  const value = typeof text === "string" ? text.trim() : "";
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join("")}…`;
}

/** 审批来源的人话（`{source}` 参数；判断代批必须如实标注，不伪装客户本人）。 */
export function requirementChangeApprovalSourceText(source: "customer" | "judge"): string {
  return source === "judge" ? "判断 agent（「替我决策」）代批 · 默认推荐项" : "客户在 decision 卡上选择";
}

/**
 * 需求变更**审批卡**（客户纠正：由发起方会话的客户卡通道呈现；不是主理审批、不是发起方自批）。
 * 选项 id 冻结为 `approve` / `reject`，**恰好一个** `recommended: true`（推荐 `approve`）；
 * 发起方只能发卡，不能作答——作答只来自客户（未勾选「替我决策」）或独立判断 agent（勾选时）。
 */
export function buildRequirementChangeApprovalCard(input: {
  requestId: string;
  flowId: string;
  intentId: string;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact?: string;
  proposedIntentPatch?: string;
}): CustomerInputRequest {
  const ticketLine = mainT("main.requirementChange.ticket", {
    requestId: input.requestId,
    flowId: input.flowId,
    intentId: input.intentId,
    detail: `${input.changeKind}：${input.summary}`,
  });
  const question = [
    ticketLine,
    `理由：${input.rationale}`,
    `影响：${input.impact ?? "（未提供）"}`,
    ...(input.proposedIntentPatch !== undefined
      ? ["建议的意图补丁（仅供参考，不得替客户改意图）：", input.proposedIntentPatch]
      : []),
    "审批由客户或「替我决策」判断 agent 在 decision 卡上完成；发起方不得自批、不得代选；批准 ≠ 产品已完成意图变更。",
  ].join("\n");
  return {
    kind: "choice",
    cardKind: REQUIREMENT_CHANGE_APPROVAL_CARD_KIND,
    flowId: input.flowId,
    title: mainT("main.requirementChange.taskLabel"),
    question,
    options: [
      {
        id: REQUIREMENT_CHANGE_RECOMMENDED_OPTION,
        label: REQUIREMENT_CHANGE_APPROVAL_OPTION_LABELS.approve,
        recommended: true,
      },
      {
        id: "reject",
        label: REQUIREMENT_CHANGE_APPROVAL_OPTION_LABELS.reject,
      },
    ],
  };
}

/**
 * **已批准执行任务**文本（独立审批通过后由应用交给主理；主理不审批、只执行意图变更并通知提案修订）。
 * 任务自足：写明审批证据（decision 结果 / 来源 / 同一 requestId）与硬性禁止；主理按角色卡先核验证据。
 *
 * 任务头取共享 i18n `main.requirementChange.leadExecuteTask`；正文是发给 agent 的任务指令，沿用本仓库
 * 既有议定语言（中文）。
 */
export function buildRequirementChangeLeadExecutionTaskText(input: {
  requestId: string;
  flowId: string;
  intentId: string;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact?: string;
  proposedIntentPatch?: string;
  ticketRelPath: string;
  approvalSource: "customer" | "judge";
  approvedAt: string;
}): string {
  const header = mainT("main.requirementChange.leadExecuteTask", {
    flowId: input.flowId,
    intentId: input.intentId,
    requestId: input.requestId,
    source: requirementChangeApprovalSourceText(input.approvalSource),
  });
  const intentRel = intentArtifactPath(input.intentId);
  return [
    header,
    `独立审批证据：decision 卡结果 approve；审批来源：${requirementChangeApprovalSourceText(input.approvalSource)}；批准时间：${input.approvedAt}；申请票据 ${input.requestId}。`,
    "这不是申请任务，也不是客户要求你审批：你（产品）**不审批、不代批、不代选**；执行前按角色卡核对同一 flowId / requestId 的审批证据，未获独立审批证据不得执行。",
    `变更种类：${input.changeKind}`,
    `摘要：${input.summary}`,
    `理由：${input.rationale}`,
    `影响：${input.impact ?? "（未提供）"}`,
    "建议的意图补丁（仅供参考，不得替客户改意图、不得照抄当客户意图）：",
    input.proposedIntentPatch ?? "（未提供）",
    `票据：${input.ticketRelPath}`,
    "请按以下顺序处理：",
    `1) 读意图 ${intentRel} 与上述票据，核对批准的授权确属新授权及其影响；只在批准范围内执行。`,
    "2) 按需更新 docs/intents/**（goal / scope / acceptance 与客户原话）：写清变更点、理由与影响，保留客户原话与原需求、写清变更前后差异；不得静默扩权、不得借机删减既有需求。",
    "3) 更新后通知策划 / Draft 依据已批准的新意图修订提案；由 Draft 出新版本提案并重发提案卡，不由你改提案。",
    "硬性禁止：",
    "- 不得自行批准 / 拒绝 / 代选需求变更，也不得再发 intent-confirm 充当需求变更审批（审批已在 decision 卡完成）。",
    "- 不得把新授权写进提案卡，不得让 Draft 以提案卡替代需求变更审批。",
    "- 不得通过删除、改写、拆分需求绕过 gate 0。",
    "- 不得声称客户本人点击批准；判断 agent 代批必须如实标注「judge 代批」。",
  ].join("\n");
}
