// src/common/编排/governance-ledger.ts
// 治理账本（三方治理 V1，评审 §5.7）：**append-only** 的 `.ans/governance/ledger.jsonl`。
//
// 契约（`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.7）：
//   · 位置 `<projectRoot>/.ans/governance/ledger.jsonl`，UTF-8，一行一条 JSON；
//   · append-only：只追加、不重写、不删除；进程内按 `projectRoot` **串行**（promise 链）；
//   · `mkdir -p .ans/governance` → 追加 → `fsync`；**失败不回滚、不抛给角色**——只记诊断并如实
//     返回 `{ok:false}`（「账本失败不翻转客户决定」，§九-16）；
//   · **门禁只读账本，不读 Markdown `status`**；读取失败/坏行由调用方（门禁）**fail-closed**；
//   · **角色不可写账本**：`.ans/**` 在三人 `forbiddenWritePaths` 内（门禁引擎注册表），编排的 gate
//     包装先于 `resolveWrite` 判定；本模块只由应用（编排/桌面）调用。
//
// 失败语义（钉死）：
//   · `readGovernanceLedger` 对「文件不存在」返回空账本、**不报错**（尚无决定是正常初始态）；
//   · 对不可读/坏行返回 `errors`（坏行跳过，不猜测内容）；门禁见 `errors` 非空即拒；
//   · `appendGovernanceLedger` 永不抛错；诊断由 `common/shared/diagnostics.ts` 落盘（应用侧）。
//   · `flushGovernanceLedger` 仅用于测试/宿主等待在飞追加落盘；不改变串行链语义。

import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import type { GovernanceJudgeAudit, HandOffIntentKind, RuntimeKind } from "../../model/runtime.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import type {
  AcceptanceTriageConclusion,
  AcceptanceTriageDisposition,
  AcceptanceTriageRecommendationBasis,
} from "./acceptance-triage.ts";
import { FLOW_GATE_KINDS, type FlowGateKind } from "./flow-state.ts";

/** 账本的项目相对路径（评审 §5.7 固定值）。 */
export const GOVERNANCE_LEDGER_REL = ".ans/governance/ledger.jsonl";

/**
 * 账本事件的权力归属（评审 §5.7；2026-10-18 四角色 W6-A 增补）。
 *
 * - `"liaison"`：联络官 Liaison 的**沟通权**（不是决定权）——`intent.handed-off` 与 Liaison 的
 *   `artifact.observed` 使用（四角色评审 §7.1 逐字值；门禁不读 `power`，它只是审计标记）。
 */
export type GovernancePower =
  | "proposal"
  | "nomination"
  | "schedule"
  | "acceptance"
  | "verification"
  | "app"
  | "customer"
  | "liaison"
  /**
   * 项目角色（非内置治理角色）的 `artifact.observed`（2026-10-20 Flow 文件方法化配套：
   * 项目角色 boundary directory 内的新增/变更 `.md` 也观察）。门禁不读 `power`，仅审计标记。
   */
  | "project";

/** 客户决定的细分类型（门禁按它判定，不靠自然语言；评审 §5.7/§5.8）。 */
export type GovernanceDecisionKind =
  | "proposal-accept"
  | "proposal-accept-quick"
  | "proposal-revise"
  | "proposal-reject"
  /**
   * 客户任命（闸门 2）。2026-10-22 治理分工第 1 项起由 Convener 发起，故条目 `power`
   * 由发起角色职能决定（Convener → `schedule`；旧 Nominator 发起的存量条目仍为 `nomination`）。
   * 不新增 power/decision kind：团队计划/标准/报告/变更包一律走 `artifact.observed`。
   */
  | "appointment"
  | "appointment-write"
  | "schedule-write"
  | "acceptance"
  /** 需求确认（Liaison 在 hand_off_intent 前的客户专属卡；判断 agent 永不代批）。 */
  | "intent-confirm"
  | "migration"
  /**
   * 2026-10-26 客户新增 decision 卡（`request_choice(cardKind="decision")`；统筹可发，报告员
   * **仅限需求变更审批**）：客户对**事务性选择**的作答（卡内含推荐项；桌面「替我决策」开启时默认选中
   * 推荐项）。
   *
   * **不是**提案/任命/验收决定：
   *   · `governance-gate.ts` 的 `PROPOSAL_DECISION_KINDS` / `ACCEPTED_DECISION_KINDS` 与任命写入
   *     门都不包含它——不满足任何 gate 门；
   *   · `latestAcceptanceDecision` 只认 `decisionKind:"acceptance"`——不进入验收判定；
   *   · flow 的 `customer-decision` 证据枚举（`flow-state.ts::CUSTOMER_DECISION_KIND_REFS`）不接受
   *     它——不能充当任何步骤的完成证据；
   *   · 也不得被当成客户批准。
   * 只作审计留痕（选中项见 `GovernanceLedgerEntry.selectedOptions`；门禁不读该字段）。
   */
  | "material-choice"
  | "unclassified"; // 缺 cardKind 或选项 id 非标准：门禁一律拒绝，提示重发

/**
 * `dispatch.accepted` 的触发来源（四角色评审 §7.1）：区分「客户决定后推进」「意图交接后投递」
 * 「settle 后推进」；三者都仍是 `actorRoleId:"app"`, `power:"app"`，**都不是客户批准**。
 * 旧条目缺 `trigger` 仍合法（不追改历史）。
 *
 * 2026-10-19：`"settle"` 也用于**应用自动派发**——流程齐备（执行步骤全部 done 且均有
 * `dispatch.accepted`、无未结算决定、验收步骤 pending）后自动派发 Proof / 验收时，写
 * `dispatch.accepted{targetRoleId:"verifier", stepId:"verification", trigger:"settle"}`；
 * 该条同时是**自动派发去重键**（同一 flowId+stepId 已存在即不重复派发）。自动派发不是验收决定。
 */
export type GovernanceLedgerTrigger = "customer-decision" | "intent-handoff" | "settle";

/** 账本 `acceptance.triage` 条目的分诊决定 schema（2026-10-25 验收分诊设计 §9.2）。 */
export const ACCEPTANCE_TRIAGE_DECISION_SCHEMA = "acceptance-triage-decision/v1" as const;

/**
 * 账本 `acceptance.triage` 的分诊决定审计（2026-10-25 验收分诊设计 §9.2）。
 *
 * **不是 `customer.decision`**：`latestAcceptanceDecision`、`evaluateFlowCompletion`、收口门都**不读**
 * 它；它只用于审计、幂等（`triageId` 扫描去重）与汇报。分诊决定不伪造客户接受/拒绝：
 * 客户在分诊卡上的选择仍走既有 `customer.decision{decisionKind:"acceptance"}` 结算路径。
 * `flowId` 在条目顶层（`GovernanceLedgerEntry.flowId`）。
 */
export interface AcceptanceTriageLedgerDecision {
  schema: typeof ACCEPTANCE_TRIAGE_DECISION_SCHEMA;
  /** 稳定分诊 id（= `triage-<flowId>-<reportSha 前 8 位>`；与 `.ans` 记录 `triageId` 同值）。 */
  triageId: string;
  disposition: "rework" | "report-only";
  source: "judge" | "customer";
  /**
   * 更细来源（上层约定）：v1 判断代批 = `"judge-rule"`（按确定性建议确认）；客户分诊卡 =
   * `"triage-customer"`；判断无法完成转客户卡可记 `"judge-manual"`。仅审计，不参与任何门禁。
   */
  sourceDetail?: string;
  reportPath: string;
  reportSha256: string;
  conclusion: AcceptanceTriageConclusion;
  /** 决定时间（ISO）。 */
  decidedAt: string;
  /** 当时确定性建议（审计；override = 决定与建议不同）。 */
  recommendation?: AcceptanceTriageDisposition;
  recommendationBasis?: AcceptanceTriageRecommendationBasis;
  override?: boolean;
  /** 分诊卡 / 请求 id（可空）。 */
  requestId?: string | null;
}

/** 账本 `gate.review` 条目的 gate 复核决定 schema（2026-10-26 客户授权；设计 §8.4）。 */
export const GATE_REVIEW_DECISION_SCHEMA = "gate-review-decision/v1" as const;

/** gate 报告的严重度计数（与 `acceptance-triage/v1` 同一组枚举）。 */
export interface GateReviewSeverityCounts {
  blocker: number;
  major: number;
  minor: number;
  nit: number;
}

/**
 * 账本 `gate.review` 的 gate 复核判定审计（2026-10-26 客户授权；设计
 * `2026-10-26_design_proof-gate-reviews.md` §8.4）。
 *
 * **不是 `customer.decision`**：`latestAcceptanceDecision`、`evaluateFlowCompletion`、收口门、验收分诊都
 * **不读**它；它只用于审计、幂等（`gateId + reportSha256` 去重）与汇报。gate 完成事实仍以 flow 步骤
 * `done` + `artifact.observed` 为准；本审计不是完成证据的替代。
 *
 * **防吹毛求疵**（客户追加要求）：`conclusion=fail/conditional` 必须至少一个 `blocker`/`major`；只有
 * `minor`/`nit` 的 fail 按结构不符退回 Proof、不得触发返工；`pass` 可带 `minor`/`nit` 备注。
 * `flowId` 在条目顶层（`GovernanceLedgerEntry.flowId`）。
 */
export interface GateReviewLedgerDecision {
  schema: typeof GATE_REVIEW_DECISION_SCHEMA;
  gateId: string;
  gateKind: FlowGateKind;
  reportPath: string;
  reportVersion: number;
  reportSha256: string;
  conclusion: AcceptanceTriageConclusion;
  severityCounts: GateReviewSeverityCounts;
  itemCount: number;
  requestId: string;
  flowRevision: string;
  decidedAt: string;
}

/** 账本条目（评审 §5.7 逐字形状；只增不改，未知字段读取时原样保留）。 */
export interface GovernanceLedgerEntry {
  at: string; // ISO
  kind:
    | "customer.decision"
    | "dispatch.accepted"
    | "artifact.observed"
    | "governance.established"
    | "governance.reaccepted"
    | "governance.migrated"
    // W6-A（四角色评审 §7.1）：意图交接与澄清。两者都**不是**客户批准，任何门禁不读。
    | "intent.handed-off"
    | "clarification.requested"
    /**
     * 2026-10-25 验收分诊：只审计「返工 / 仅汇报」的分诊决定，**不是客户决定**；
     * 收口门与 `latestAcceptanceDecision` 不读它（设计 §9.2）。
     */
    | "acceptance.triage"
    /**
     * 2026-10-26 gate 复核（客户授权 `request_gate_review`）：只审计独立 gate 复核结论，
     * **不是客户决定**、不进入验收分诊/最终验收；收口门与 `latestAcceptanceDecision` 不读它
     * （设计 `2026-10-26_design_proof-gate-reviews.md` §8.4）。
     */
    | "gate.review";
  flowId?: string;
  /** 流程步骤 id。`dispatch.accepted` 的去重键是 flowId+stepId（与 targetRoleId 无关）。 */
  stepId?: string;
  /** 本事件的动作人（角色 id，或 "app"/"customer"）。 */
  actorRoleId: string;
  power: GovernancePower;
  /** 仅 customer.decision：决定类型（门禁判定用；`material-choice` 仅供审计，门禁不认）。 */
  decisionKind?: GovernanceDecisionKind;
  artifactPath?: string; // 项目相对路径
  artifactVersion?: number;
  artifactSha256?: string; // 应用算，角色不自算
  /** 仅写盘确认：本次客户确认/发行的具体路径（逐条）。 */
  paths?: string[];
  /** 本次事件的目标角色（派发/写卡/验收）。应用自动派发 Proof / 验收时 = `"verifier"`。 */
  targetRoleId?: string;
  targetRoleIds?: string[];
  /**
   * 2026-10-26 decision 卡：仅 `customer.decision{decisionKind:"material-choice"}` 条目携带——
   * 客户在卡上恰好选中的一个选项 id（同一选择同时出现在 tool 回执/会话，账本只作审计）。
   * 可选、向后兼容（旧条目/旧读取方零变化）。**不是** `targetRoleIds`（不伪装成任命），也不是
   * 写盘 `paths`；任何门禁/验收/收口判定都**不读**本字段。
   */
  selectedOptions?: string[];
  /** W6-A：意图交接/澄清所引用的意图记录（`docs/intents/<intentId>.md` 的 slug）。 */
  intentId?: string;
  /** W6-A：仅 intent.handed-off——交接种类（initial 每个 intentId 仅一次）。 */
  handoffKind?: HandOffIntentKind;
  /** W6-A：仅 dispatch.accepted——触发来源（见 GovernanceLedgerTrigger）；缺席＝旧条目。 */
  trigger?: GovernanceLedgerTrigger;
  /**
   * W6-A：仅 intent.handed-off——所属轮次（每轮一次守卫；同会话同轮第二次成功交接被拒）。
   * 不属于客户决定的 `decisionEvidence`；`sessionId` 与它合起来定位一轮。
   */
  turnId?: string;
  customerDecision?: "accepted" | "accepted-quick" | "appointed" | "rejected" | "changes-requested" | "none";
  /**
   * 2026-10-25 验收分诊：仅 `kind:"acceptance.triage"` 条目携带的分诊决定审计。
   * **不是**客户决定；`decisionKind` / `customerDecision` 不得与它同时出现（写入校验拒绝）。
   */
  acceptanceTriage?: AcceptanceTriageLedgerDecision;
  /**
   * 2026-10-26 gate 复核：仅 `kind:"gate.review"` 条目携带的 gate 复核判定审计。
   * **不是**客户决定；`decisionKind` / `customerDecision` 不得与它同时出现（写入校验拒绝）。
   */
  gateReview?: GateReviewLedgerDecision;
  decisionEvidence?: {
    /**
     * 2026-10-18 双开关评审 §7.4/§10.1：`"judge"` 表示该决定由客户委托的判断 agent 代批；
     * `judge` 子对象是**有界审计证据**。`actorRoleId`/`power` 照旧（仍是发起治理角色/职能），
     * 绝不写 `actorRoleId:"judge"`；`kind` 不参与任何门禁（门禁只读 `decisionKind`/`customerDecision`）。
     *
     * 2026-10-25 写入预授权：`"system-preauthorization"` 表示该写盘确认由系统按角色 Section 1 边界
     * 直接放行（`operatorId` 以 `system:` 开头，如 `system:write-preauthorization`）——**不是客户
     * 手批、不是 judge 代批**。此类条目只做审计：**不携带 `decisionKind`**（门禁键），
     * `customerDecision` 只记结算结果 `"accepted"`；收口门/`latestAcceptanceDecision` 不据此推进
     * 任何治理决定（写入校验强制，见 `systemPreauthorizationEvidenceShapeError`）。
     */
    kind: "customer-input" | "judge" | "system-preauthorization" | "desktop-governance-record" | "customer-message";
    toolCallId?: string;
    turnId?: string;
    sessionId?: string;
    action?: "establish" | "reaccept" | "migrate";
    previewDigest?: string;
    /** 仅 `kind:"judge"`：有界判断审计（reason ≤1KB、evidence ≤10 条、pathDecisions ≤50 条）。 */
    judge?: GovernanceJudgeAudit;
    /** 仅 `kind:"system-preauthorization"`：系统预授权操作者（`system:` 前缀；不是客户/judge 身份）。 */
    operatorId?: string;
  };
  messageSummary?: string;
  runtime?: RuntimeKind;
  sessionId?: string;
}

/** 只读快照（同步门禁消费；由会话在 open/send 时异步刷新）。 */
export interface GovernanceLedgerSnapshot {
  entries: readonly GovernanceLedgerEntry[];
  errors: readonly string[];
}

/** 空快照（无账本/无决定时的缺省值；门禁据此 fail-closed）。 */
export const EMPTY_GOVERNANCE_LEDGER_SNAPSHOT: GovernanceLedgerSnapshot = {
  entries: [],
  errors: [],
};

/** 追加结果：失败只如实返回，不抛。 */
export type GovernanceLedgerAppendResult = { ok: true } | { ok: false; message: string };

/**
 * 追加原语（**仅测试注入**）：覆盖 `open(..., "a")` 返回的句柄。
 * 生产调用不给——单一实现仍走 node:fs/promises。给测试用是为了在离线环境模拟 fsync 失败
 * （不能也不应通过真实磁盘故障来测）。
 */
export interface GovernanceLedgerAppendOptions {
  openFile?: (absPath: string) => Promise<{
    write(content: string): Promise<unknown>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }>;
}

/** 进程内按项目根的串行链（评审 §5.7：按 `projectRoot` 串行）。 */
const appendChains = new Map<string, Promise<void>>();

/** 账本绝对路径。 */
export function governanceLedgerPath(projectRoot: string): string {
  return path.join(projectRoot, ".ans", "governance", "ledger.jsonl");
}

function normalizeRoot(projectRoot: string): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  return path.resolve(projectRoot);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `acceptance.triage` 条目的最小写入校验（设计 §9.2）：字段齐全、枚举合法、且**绝不携带**
 * 客户决定字段（`decisionKind` / `customerDecision`），避免把分诊审计误当 `customer.decision`。
 */
function acceptanceTriageEntryShapeError(value: Record<string, unknown>): string | undefined {
  if (typeof value.flowId !== "string" || value.flowId.trim() === "") {
    return "kind=acceptance.triage 时缺少字符串字段 flowId";
  }
  const triage = value.acceptanceTriage;
  if (!isPlainObject(triage)) return "kind=acceptance.triage 时缺少对象字段 acceptanceTriage";
  if (triage.schema !== ACCEPTANCE_TRIAGE_DECISION_SCHEMA) {
    return `acceptanceTriage.schema 必须是 ${ACCEPTANCE_TRIAGE_DECISION_SCHEMA}（当前 ${JSON.stringify(triage.schema)}）`;
  }
  for (const key of ["triageId", "reportPath", "decidedAt"] as const) {
    if (typeof triage[key] !== "string" || triage[key].trim() === "") {
      return `acceptanceTriage 缺少字符串字段 ${key}`;
    }
  }
  if (typeof triage.reportSha256 !== "string" || !/^[a-f0-9]{64}$/.test(triage.reportSha256)) {
    return "acceptanceTriage.reportSha256 必须是 64 位小写十六进制 sha256";
  }
  if (Number.isNaN(Date.parse(triage.decidedAt as string))) {
    return "acceptanceTriage.decidedAt 必须是 ISO 时间字符串";
  }
  if (triage.disposition !== "rework" && triage.disposition !== "report-only") {
    return "acceptanceTriage.disposition 必须是 rework / report-only";
  }
  if (triage.source !== "judge" && triage.source !== "customer") {
    return "acceptanceTriage.source 必须是 judge / customer";
  }
  if (triage.conclusion !== "pass" && triage.conclusion !== "fail" && triage.conclusion !== "conditional") {
    return "acceptanceTriage.conclusion 必须是 pass / fail / conditional";
  }
  if (value.decisionKind !== undefined || value.customerDecision !== undefined) {
    return "acceptance.triage 不是客户决定，不得携带 decisionKind / customerDecision";
  }
  return undefined;
}

/**
 * `gate.review` 条目的最小写入校验（2026-10-26 客户授权；设计 §8.4）：
 *   · 只允许应用记录（`actorRoleId`/`power` 均为 `app`）；
 *   · `gateReview` 字段齐全、枚举合法、sha256/版本/时间形状合法；
 *   · **绝不携带**客户决定字段（`decisionKind` / `customerDecision`）或验收分诊字段；
 *   · **防吹毛求疵**：`fail`/`conditional` 必须至少一个 `blocker`/`major`——只有 `minor`/`nit` 的 fail
 *     按结构不符退回 Proof、不得作为返工依据；`pass` 可带 `minor`/`nit` 备注。
 */
function gateReviewEntryShapeError(value: Record<string, unknown>): string | undefined {
  if (typeof value.flowId !== "string" || value.flowId.trim() === "") {
    return "kind=gate.review 时缺少字符串字段 flowId";
  }
  if (value.actorRoleId !== "app" || value.power !== "app") {
    return "kind=gate.review 只能由应用记录（actorRoleId/power 必须是 app）";
  }
  const review = value.gateReview;
  if (!isPlainObject(review)) return "kind=gate.review 时缺少对象字段 gateReview";
  if (review.schema !== GATE_REVIEW_DECISION_SCHEMA) {
    return `gateReview.schema 必须是 ${GATE_REVIEW_DECISION_SCHEMA}（当前 ${JSON.stringify(review.schema)}）`;
  }
  if (typeof review.gateId !== "string" || review.gateId.trim() === "") {
    return "gateReview 缺少字符串字段 gateId";
  }
  if (typeof review.gateKind !== "string" || !(FLOW_GATE_KINDS as readonly string[]).includes(review.gateKind)) {
    return `gateReview.gateKind 必须是 ${FLOW_GATE_KINDS.join(" / ")}（当前 ${JSON.stringify(review.gateKind)}）`;
  }
  for (const key of ["reportPath", "requestId", "flowRevision", "decidedAt"] as const) {
    if (typeof review[key] !== "string" || review[key].trim() === "") {
      return `gateReview 缺少字符串字段 ${key}`;
    }
  }
  if (
    typeof review.reportVersion !== "number" ||
    !Number.isSafeInteger(review.reportVersion) ||
    review.reportVersion < 1
  ) {
    return "gateReview.reportVersion 必须是正整数";
  }
  if (typeof review.reportSha256 !== "string" || !/^[a-f0-9]{64}$/.test(review.reportSha256)) {
    return "gateReview.reportSha256 必须是 64 位小写十六进制 sha256";
  }
  if (Number.isNaN(Date.parse(review.decidedAt as string))) {
    return "gateReview.decidedAt 必须是 ISO 时间字符串";
  }
  if (review.conclusion !== "pass" && review.conclusion !== "fail" && review.conclusion !== "conditional") {
    return "gateReview.conclusion 必须是 pass / fail / conditional";
  }
  const counts = review.severityCounts;
  if (!isPlainObject(counts)) return "gateReview 缺少对象字段 severityCounts";
  const severities = ["blocker", "major", "minor", "nit"] as const;
  for (const severity of severities) {
    const count = counts[severity];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      return `gateReview.severityCounts.${severity} 必须是非负整数`;
    }
  }
  if (typeof review.itemCount !== "number" || !Number.isSafeInteger(review.itemCount) || review.itemCount < 0) {
    return "gateReview.itemCount 必须是非负整数";
  }
  const blocking = (counts.blocker as number) + (counts.major as number);
  if (review.conclusion === "pass" && blocking > 0) {
    return "gateReview.conclusion=pass 不得包含 blocker/major（通过报告只允许 minor/nit 备注）";
  }
  if (review.conclusion !== "pass" && blocking === 0) {
    return "gateReview.conclusion=fail/conditional 必须至少有一个 blocker/major（只有 minor/nit 的 fail 按结构不符退回 Proof，不构成返工依据）";
  }
  if (value.decisionKind !== undefined || value.customerDecision !== undefined) {
    return "gate.review 不是客户决定，不得携带 decisionKind / customerDecision";
  }
  if (value.acceptanceTriage !== undefined) {
    return "gate.review 不是验收分诊，不得携带 acceptanceTriage";
  }
  return undefined;
}

/**
 * `decisionEvidence.kind="system-preauthorization"` 的最小写入校验（2026-10-25 写入预授权）：
 * 它**不是客户决定**——强制 `operatorId` 为 `system:` 前缀、禁止 `decisionKind`（门禁只读该键）、
 * 只记放行结果 `customerDecision:"accepted"`、禁止夹带 judge 审计。这样 `latestAcceptanceDecision`、
 * `evaluateFlowCompletion` 等收口门不可能把系统预授权读成客户决定/未结算决定。
 */
function systemPreauthorizationEvidenceShapeError(value: Record<string, unknown>): string | undefined {
  const evidence = value.decisionEvidence;
  if (!isPlainObject(evidence) || evidence.kind !== "system-preauthorization") return undefined;
  if (typeof evidence.operatorId !== "string" || !evidence.operatorId.startsWith("system:")) {
    return "decisionEvidence.kind=system-preauthorization 时 operatorId 必须是 system: 前缀字符串";
  }
  if (value.decisionKind !== undefined) {
    return "system-preauthorization 不是客户决定，不得携带 decisionKind（收口门只读客户决定）";
  }
  if (value.customerDecision !== "accepted") {
    return "system-preauthorization 只记录放行结果，customerDecision 必须是 accepted";
  }
  if (evidence.judge !== undefined) {
    return "system-preauthorization 不是判断代批，不得携带 judge";
  }
  return undefined;
}

function entryShapeError(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "不是 JSON 对象";
  for (const key of ["at", "kind", "actorRoleId", "power"] as const) {
    if (typeof value[key] !== "string" || value[key].trim() === "") return `缺少字符串字段 ${key}`;
  }
  if (value.kind === "gate.review") {
    return gateReviewEntryShapeError(value);
  }
  if (value.gateReview !== undefined) {
    return "gateReview 仅允许出现在 kind=gate.review 条目";
  }
  if (value.kind === "acceptance.triage") {
    return acceptanceTriageEntryShapeError(value);
  }
  if (value.acceptanceTriage !== undefined) {
    return "acceptanceTriage 仅允许出现在 kind=acceptance.triage 条目";
  }
  return systemPreauthorizationEvidenceShapeError(value);
}

/**
 * 追加一条账本条目（append-only + fsync；失败只诊断，不回滚、不抛给角色）。
 * 进程内按 `projectRoot` 串行：并发调用按进入顺序逐条落盘，不交错、不丢行。
 */
export async function appendGovernanceLedger(
  projectRoot: string,
  entry: GovernanceLedgerEntry,
  options: GovernanceLedgerAppendOptions = {},
): Promise<GovernanceLedgerAppendResult> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return { ok: false, message: "projectRoot 缺失，未写治理账本。" };
  const shapeError = entryShapeError(entry);
  if (shapeError !== undefined) return { ok: false, message: `账本条目形状非法（${shapeError}），未写治理账本。` };

  const absPath = governanceLedgerPath(root);
  const key = root;

  const run = async (): Promise<GovernanceLedgerAppendResult> => {
    const log = createDiagnosticLogger({ component: "orchestration.governance-ledger", projectRoot: root });
    try {
      await mkdir(path.dirname(absPath), { recursive: true });
      const handle = options.openFile !== undefined ? await options.openFile(absPath) : await open(absPath, "a");
      try {
        await handle.write(JSON.stringify(entry) + "\n");
        // fsync：失败不回滚（行可能已落盘但不保证持久）；只如实失败。
        await handle.sync();
      } finally {
        await handle.close();
      }
      log.record("governance.ledger.append", { kind: entry.kind, actorRoleId: entry.actorRoleId });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("governance.ledger.append.failed", err, { kind: entry.kind, actorRoleId: entry.actorRoleId });
      return { ok: false, message: `治理账本追加失败：${message}（客户决定不变、门禁不放宽、写盘不阻断）。` };
    }
  };

  const previous = appendChains.get(key) ?? Promise.resolve();
  const current = previous.then(run, run); // 前一条失败不影响下一条（链只保证顺序）
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  appendChains.set(key, tail);
  try {
    return await current;
  } finally {
    // 链尾仍是自己 → 清理（避免 Map 无限增长）；否则由更晚的调用清理。
    if (appendChains.get(key) === tail) appendChains.delete(key);
  }
}

/**
 * 等待某项目在飞账本追加全部落盘（测试/宿主收口用）。
 * 返回后不代表写入成功——单条结果仍由 `appendGovernanceLedger` 的返回值/诊断表达。
 */
export async function flushGovernanceLedger(projectRoot: string): Promise<void> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return;
  await (appendChains.get(root) ?? Promise.resolve());
}

/**
 * 读取账本。文件不存在 → 空账本（无错误）；不可读/坏行 → `errors`（坏行跳过，不猜内容）。
 * 门禁见 `errors` 非空即 fail-closed（评审 §6.2）。
 */
export async function readGovernanceLedger(
  projectRoot: string,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return { entries: [], errors: ["projectRoot 缺失，无法读取治理账本。"] };
  const absPath = governanceLedgerPath(root);
  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { entries: [], errors: [] };
    return { entries: [], errors: [`治理账本不可读：${err instanceof Error ? err.message : String(err)}`] };
  }

  const entries: GovernanceLedgerEntry[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push(`第 ${i + 1} 行不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const shapeError = entryShapeError(parsed);
    if (shapeError !== undefined) {
      errors.push(`第 ${i + 1} 行账本条目形状非法：${shapeError}`);
      continue;
    }
    entries.push(parsed as GovernanceLedgerEntry);
  }
  return { entries, errors };
}

/** 读取并转换为只读快照（会话 open/send 时刷新用；评审 §5.7「同步门禁消费」）。 */
export async function refreshGovernanceLedgerSnapshot(projectRoot: string): Promise<GovernanceLedgerSnapshot> {
  const { entries, errors } = await readGovernanceLedger(projectRoot);
  return { entries, errors };
}
