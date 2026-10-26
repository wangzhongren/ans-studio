// src/common/编排/acceptance-triage-record.ts
// **验收分诊记录（2026-10-25 设计 `2026-10-25_design_acceptance-triage.md` §9.1）**。
//
// 路径：`<projectRoot>/.ans/governance/acceptance/<flowId>/triage-v1.json`（与 `rework-routing.json`
// 同目录；`.ans/` 是 app-only 写域，角色不可写）。
//
// 用途：
//   · **幂等键** = `flowId + reportSha256`（同一报告只分诊一次；新报告才允许新一轮）；
//   · **重启恢复**：桌面启动/导入项目后按 `status` 重推分诊卡、重试返工路由或补主理汇报；
//   · **审计**：与账本 `acceptance.triage` 互补（记录是事实来源；账本用于审计/幂等）。
//
// 记录只覆盖「进入分诊」的报告：`pass`（R1 `no-triage`）走既有验收卡路径，**不写记录**。
// 记录有两种形态，不互相猜：
//   · 解析成功（`parseFailure:null`）：带 conclusion / recommendation / severityCounts / itemsDigest；
//     `awaiting-decision` 时 recommendation 只可能是 rework / report-only；R4/R5 的
//     `returned-to-verifier` 记录 recommendation = return-to-verifier；
//   · 结构失败（`parseFailure` = missing / invalid / unsupported-version / ambiguous）：
//     结论/计数一律 null（不猜），`missing` 时 reportSha256 也为 null（无内容不伪造 sha）。
//
// 失败口径（fail-closed，不猜）：
//   · 原子写（同目录临时文件 + fsync + rename；失败不破坏原文件）；
//   · 读取时缺失 → 无记录；坏 JSON / 未知 schema / flowId 不匹配 / 字段非法 → `corrupt`，
//     **按无记录处理**且不猜测旧结论（设计 §10）；
//   · 状态流转只允许 `returned-to-verifier / awaiting-decision / dispatched / report-only / failed`
//     之间的合法迁移；同一报告不允许从终态回退（新报告 = 新记录）。
//
// 分层：编排私有 common；桌面经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费。

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import { atomicWrite } from "../shared/atomic-write.ts";
import type {
  AcceptanceTriageConclusion,
  AcceptanceTriageDisposition,
  AcceptanceTriageItem,
  AcceptanceTriageParseFailureCode,
  AcceptanceTriageRecommendation,
  AcceptanceTriageRecommendationBasis,
  AcceptanceTriageSection,
  AcceptanceTriageSeverity,
} from "./acceptance-triage.ts";

// —————————————————————— 常量与类型 ——————————————————————

/** 分诊记录 schema（记录文件逐字写）。 */
export const ACCEPTANCE_TRIAGE_RECORD_SCHEMA = "acceptance-triage-record/v1" as const;

/** 分诊记录的项目相对目录（与返工路由同目录；设计 §9.1）。 */
export const ACCEPTANCE_TRIAGE_RECORD_REL_DIR = ".ans/governance/acceptance";

/** 分诊记录文件名（固定 v1）。 */
export const ACCEPTANCE_TRIAGE_RECORD_FILENAME = "triage-v1.json";

/**
 * 分诊记录状态（任务口径）：
 *   · `returned-to-verifier`：报告缺/坏/矛盾/不可执行 ⇒ 已退回 Proof 补报告；
 *   · `awaiting-decision`：建议已算出，等待客户（或判断）在分诊卡上作答；
 *   · `dispatched`：已决定「下发统筹修改」并完成返工路由；
 *   · `report-only`：已决定「仅汇报不返工」；
 *   · `failed`：执行失败（路由/记录/汇报失败如实记录；下一次真实事件可重试）。
 */
export const ACCEPTANCE_TRIAGE_RECORD_STATUSES = [
  "returned-to-verifier",
  "awaiting-decision",
  "dispatched",
  "report-only",
  "failed",
] as const;

export type AcceptanceTriageRecordStatus = (typeof ACCEPTANCE_TRIAGE_RECORD_STATUSES)[number];

/** 分诊决定来源（不伪造客户决定；`judge` 在 v1 = 按确定性建议代批，`sourceDetail:"judge-rule"`）。 */
export type AcceptanceTriageDecisionSource = "judge" | "customer";

/** 记录里的处置（与状态分开：status 表达生命周期，disposition 表达决定内容）。 */
export type AcceptanceTriageRecordDisposition = "rework" | "report-only";

/** 分诊记录（`.ans/.../triage-v1.json` 的逐字形状）。 */
export interface AcceptanceTriageRecord {
  schema: typeof ACCEPTANCE_TRIAGE_RECORD_SCHEMA;
  flowId: string;
  reportPath: string;
  /** 报告版本（`report-vN.md` 的 N；正整数）。 */
  reportVersion: number;
  /**
   * 报告内容 sha256；报告缺失/不可读（`parseFailure` 非 null 且无内容）时为 null
   * （没有内容就没有 sha——不伪造）。
   */
  reportSha256: string | null;
  /** 分诊段结构失败码；`null` = 解析成功（字段见下方 triage 派生项）。 */
  parseFailure: AcceptanceTriageParseFailureCode | null;
  conclusion: AcceptanceTriageConclusion | null;
  recommendation: AcceptanceTriageDisposition | null;
  recommendationBasis: AcceptanceTriageRecommendationBasis | null;
  /** `parseFailure` 非 null 时为 null（未解析出分诊项，不猜计数）。 */
  severityCounts: Record<AcceptanceTriageSeverity, number> | null;
  itemCount: number;
  itemsDigest: string | null;
  status: AcceptanceTriageRecordStatus;
  disposition: AcceptanceTriageRecordDisposition | null;
  source: AcceptanceTriageDecisionSource | null;
  /** 更细来源（v1：`judge-rule` / `triage-customer` / `judge-manual` 等上层约定）；仅审计。 */
  sourceDetail: string | null;
  override: boolean;
  requestId: string | null;
  /** 稳定分诊 id（`triage-<flowId>-<reportSha 前 8 位>`；无报告内容时为 `triage-<flowId>-noreport`）。 */
  triageId: string;
  triageCardId: string | null;
  decidedAt: string | null;
  reportedAt: string | null;
  /** 同一 flow 上一份报告的 sha（新报告覆盖写时自动保留；审计用）。 */
  previousReportSha256: string | null;
  error: string | null;
  at: string;
}

/** 读取结果：坏件不返回记录（`corrupt` 供上层如实提示，不猜旧结论）。 */
export interface AcceptanceTriageRecordReadResult {
  record?: AcceptanceTriageRecord;
  corrupt?: string;
}

export interface AcceptanceTriageRecordReadOptions {
  /** 测试注入：覆盖 `readFile`（缺省 node:fs/promises）。 */
  readFile?: (absPath: string) => Promise<string>;
}

export interface AcceptanceTriageRecordWriteOptions extends AcceptanceTriageRecordReadOptions {
  /** 测试注入：覆盖原子写（缺省 `common/shared/atomic-write.ts::atomicWrite`）。 */
  writeFile?: (absPath: string, data: string) => Promise<void>;
}

export type AcceptanceTriageRecordWriteResult =
  | { ok: true; record: AcceptanceTriageRecord; path: string }
  | { ok: false; error: string };

export type AcceptanceTriageRecordValidation =
  | { ok: true; record: AcceptanceTriageRecord }
  | { ok: false; errors: string[] };

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const SHA256_RE = /^[a-f0-9]{64}$/;
const DISPOSITION_SET: ReadonlySet<string> = new Set(["rework", "report-only"]);
const RECOMMENDATION_SET: ReadonlySet<string> = new Set([
  "rework",
  "report-only",
  "no-triage",
  "return-to-verifier",
]);
const BASIS_SET: ReadonlySet<string> = new Set([
  "pass",
  "blocker-major-feasible",
  "minor-only",
  "blocker-major-infeasible",
  "feasibility-unavailable",
  "invalid-structure",
]);
const STATUS_SET: ReadonlySet<string> = new Set(ACCEPTANCE_TRIAGE_RECORD_STATUSES);
const SOURCE_SET: ReadonlySet<string> = new Set(["judge", "customer"]);
const CONCLUSION_SET: ReadonlySet<string> = new Set(["pass", "fail", "conditional"]);
const SEVERITY_KEYS: readonly AcceptanceTriageSeverity[] = ["blocker", "major", "minor", "nit"];

// —————————————————————— 路径 / 幂等 / 摘要 ——————————————————————

/** 分诊记录项目相对路径：`.ans/governance/acceptance/<flowId>/triage-v1.json`。 */
export function acceptanceTriageRecordRelPath(flowId: string): string {
  return `${ACCEPTANCE_TRIAGE_RECORD_REL_DIR}/${flowId}/${ACCEPTANCE_TRIAGE_RECORD_FILENAME}`;
}

/** 分诊记录绝对路径（调用方须先保证 flowId 是合法 slug）。 */
export function acceptanceTriageRecordAbsPath(projectRoot: string, flowId: string): string {
  return path.join(projectRoot, ...acceptanceTriageRecordRelPath(flowId).split("/"));
}

/**
 * 分诊幂等键 = `flowId + reportSha256`（设计 §9.3）：同一报告只分诊一次；报告变了才重新分诊。
 * 使用 NUL 分隔，避免 flowId/sha 拼接歧义。报告缺失/不可读（无 sha）时以 `no-report` 哨兵参与
 * 幂等（同一 flow 的「无报告」只记一次；不伪造内容 sha）。
 */
export function acceptanceTriageIdempotencyKey(flowId: string, reportSha256: string | null): string {
  return `${flowId}\u0000${reportSha256 ?? "no-report"}`;
}

/** 稳定分诊 id（= 分诊卡 id；设计 §7.1）：`triage-<flowId>-<reportSha 前 8 位>`。 */
export function acceptanceTriageIdForReport(flowId: string, reportSha256: string | null): string {
  return `triage-${flowId}-${reportSha256 === null ? "noreport" : reportSha256.slice(0, 8)}`;
}

/** 记录是否对应同一份报告（幂等键比较；坏件不参与；null sha 与 null 相等）。 */
export function acceptanceTriageRecordMatchesReport(
  record: AcceptanceTriageRecord,
  flowId: string,
  reportSha256: string | null,
): boolean {
  return record.flowId === flowId && record.reportSha256 === reportSha256;
}

/** 按严重度计数（四档固定顺序；记录/建议同源）。 */
export function acceptanceTriageSeverityCounts(
  items: readonly AcceptanceTriageItem[],
): Record<AcceptanceTriageSeverity, number> {
  const counts: Record<AcceptanceTriageSeverity, number> = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

/**
 * 分诊项摘要（sha256；规范化字段顺序、忽略未知字段）：用于记录 `itemsDigest` 与重启后
 * 「同报告同内容」判定（防止报告文件被替换但 sha 未变等异常；本函数仍只对结构摘要）。
 */
export function acceptanceTriageItemsDigest(items: readonly AcceptanceTriageItem[]): string {
  const canonical = items.map((item) => ({
    id: item.id,
    severity: item.severity,
    owner: item.owner,
    reason: item.reason,
    action: item.action,
    targets: item.targets,
    criteria: item.criteria,
    evidence: item.evidence,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

// —————————————————————— 记录构建 ——————————————————————

export interface AcceptanceTriageRecordInput {
  flowId: string;
  reportPath: string;
  reportVersion: number;
  /** 报告内容 sha256；报告缺失/不可读时为 null（无内容不伪造 sha）。 */
  reportSha256: string | null;
  /** 解析成功时给出（与 `parseFailure` 二选一；两者都给时 parseFailure 优先、triage 字段置 null）。 */
  triage?: AcceptanceTriageSection;
  recommendation?: AcceptanceTriageRecommendation;
  /** 结构失败码（missing / invalid / unsupported-version / ambiguous）；成功时为 null/缺省。 */
  parseFailure?: AcceptanceTriageParseFailureCode | null;
  status: AcceptanceTriageRecordStatus;
  /** 缺省由 `acceptanceTriageIdForReport` 生成（账本 `triageId` 同值）。 */
  triageId?: string;
  /** 缺省同 `triageId`。 */
  triageCardId?: string | null;
  disposition?: AcceptanceTriageRecordDisposition | null;
  source?: AcceptanceTriageDecisionSource | null;
  sourceDetail?: string | null;
  override?: boolean;
  requestId?: string | null;
  decidedAt?: string | null;
  reportedAt?: string | null;
  previousReportSha256?: string | null;
  error?: string | null;
  /** 记录写入时间（ISO；缺省 now）。 */
  at?: string;
}

/**
 * 从解析结果 + 默认建议（或结构失败码）构建记录。
 * 解析成功时填充 severityCounts / itemCount / itemsDigest / 建议字段；结构失败时这些字段一律 null
 * （不猜结论/计数），只保留 `parseFailure` 与有限错误说明（`error`）。
 */
export function buildAcceptanceTriageRecord(input: AcceptanceTriageRecordInput): AcceptanceTriageRecord {
  const triageId = input.triageId ?? acceptanceTriageIdForReport(input.flowId, input.reportSha256);
  const parseFailure = input.parseFailure ?? null;
  const triage = parseFailure === null ? input.triage : undefined;
  const recommendation = parseFailure === null ? input.recommendation : undefined;
  return {
    schema: ACCEPTANCE_TRIAGE_RECORD_SCHEMA,
    flowId: input.flowId,
    reportPath: input.reportPath,
    reportVersion: input.reportVersion,
    reportSha256: input.reportSha256,
    parseFailure,
    conclusion: triage?.conclusion ?? null,
    recommendation: recommendation?.disposition ?? null,
    recommendationBasis: recommendation?.basis ?? null,
    severityCounts: triage !== undefined ? acceptanceTriageSeverityCounts(triage.items) : null,
    itemCount: triage?.items.length ?? 0,
    itemsDigest: triage !== undefined ? acceptanceTriageItemsDigest(triage.items) : null,
    status: input.status,
    disposition: input.disposition ?? null,
    source: input.source ?? null,
    sourceDetail: input.sourceDetail ?? null,
    override: input.override ?? false,
    requestId: input.requestId ?? null,
    triageId,
    triageCardId: input.triageCardId ?? triageId,
    decidedAt: input.decidedAt ?? null,
    reportedAt: input.reportedAt ?? null,
    previousReportSha256: input.previousReportSha256 ?? null,
    error: input.error ?? null,
    at: input.at ?? new Date().toISOString(),
  };
}

// —————————————————————— 校验 ——————————————————————

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * 严格校验分诊记录（记录是 app 私有状态；坏件不得进入恢复流程）。
 * `expectedFlowId` 给出时（读取路径）要求记录 flowId 与文件路径一致。
 *
 * 未知字段按「同一 schema 的向前兼容」保留（返回原对象），但显式枚举的字段必须合法。
 */
export function validateAcceptanceTriageRecord(
  value: unknown,
  expectedFlowId?: string,
): AcceptanceTriageRecordValidation {
  if (!isPlainObject(value)) return { ok: false, errors: ["记录不是 JSON 对象"] };
  const errors: string[] = [];

  if (value.schema !== ACCEPTANCE_TRIAGE_RECORD_SCHEMA) {
    errors.push(`schema 必须是 ${ACCEPTANCE_TRIAGE_RECORD_SCHEMA}（当前 ${JSON.stringify(value.schema)}）`);
  }

  if (!isNonEmptyString(value.flowId)) {
    errors.push("缺少字符串字段 flowId");
  } else {
    if (!FLOW_ID_RE.test(value.flowId)) {
      errors.push(`flowId 非法：${JSON.stringify(value.flowId)}；要求 ${GOVERNANCE_SLUG_PATTERN}`);
    }
    if (expectedFlowId !== undefined && value.flowId !== expectedFlowId) {
      errors.push(`flowId 不匹配：记录为 ${JSON.stringify(value.flowId)}，路径为 ${JSON.stringify(expectedFlowId)}`);
    }
  }

  if (!isNonEmptyString(value.reportPath)) errors.push("缺少字符串字段 reportPath");
  if (!Number.isInteger(value.reportVersion) || (value.reportVersion as number) < 1) {
    errors.push("reportVersion 必须是 ≥1 的整数");
  }

  // —— 报告 sha / 结构失败码（缺失报告无 sha；结构失败不猜结论/计数） ——
  if (
    value.reportSha256 !== null &&
    (!isNonEmptyString(value.reportSha256) || !SHA256_RE.test(value.reportSha256))
  ) {
    errors.push("reportSha256 必须是 64 位小写十六进制 sha256 或 null");
  }
  const parseFailureValid =
    value.parseFailure === null ||
    value.parseFailure === "missing" ||
    value.parseFailure === "invalid" ||
    value.parseFailure === "unsupported-version" ||
    value.parseFailure === "ambiguous";
  if (!parseFailureValid) {
    errors.push("parseFailure 必须是 null / missing / invalid / unsupported-version / ambiguous");
  }
  const hasParseFailure = value.parseFailure !== null;

  if (hasParseFailure) {
    if (value.parseFailure === "missing" && value.reportSha256 !== null) {
      errors.push("parseFailure=missing 时 reportSha256 必须为 null（无报告内容不伪造 sha）");
    }
    if (value.parseFailure !== "missing" && value.reportSha256 === null) {
      errors.push("parseFailure 非 missing 时必须记录 reportSha256（报告内容已读到）");
    }
    for (const key of ["conclusion", "recommendation", "recommendationBasis", "severityCounts", "itemsDigest"] as const) {
      if (value[key] !== null) {
        errors.push(`parseFailure 非 null 时 ${key} 必须为 null（未解析出分诊结构，不猜）`);
      }
    }
    if (value.itemCount !== 0) errors.push("parseFailure 非 null 时 itemCount 必须为 0");
  } else {
    if (value.reportSha256 === null) {
      errors.push("parseFailure 为 null（解析成功）时必须记录 reportSha256");
    }
    if (typeof value.conclusion !== "string" || !CONCLUSION_SET.has(value.conclusion)) {
      errors.push("conclusion 必须是 pass / fail / conditional");
    }
    if (typeof value.recommendation !== "string" || !RECOMMENDATION_SET.has(value.recommendation)) {
      errors.push("recommendation 必须是 rework / report-only / no-triage / return-to-verifier");
    }
    if (typeof value.recommendationBasis !== "string" || !BASIS_SET.has(value.recommendationBasis)) {
      errors.push("recommendationBasis 非法");
    }

    let severitySum: number | undefined;
    if (!isPlainObject(value.severityCounts)) {
      errors.push("severityCounts 必须是对象 { blocker, major, minor, nit }");
    } else {
      let sum = 0;
      let countsOk = true;
      for (const key of SEVERITY_KEYS) {
        const count = value.severityCounts[key];
        if (!Number.isInteger(count) || (count as number) < 0) {
          errors.push(`severityCounts.${key} 必须是 ≥0 的整数`);
          countsOk = false;
          continue;
        }
        sum += count as number;
      }
      if (countsOk) severitySum = sum;
    }

    if (!Number.isInteger(value.itemCount) || (value.itemCount as number) < 0) {
      errors.push("itemCount 必须是 ≥0 的整数");
    } else if (severitySum !== undefined && severitySum !== value.itemCount) {
      errors.push(`severityCounts 合计（${severitySum}）与 itemCount（${String(value.itemCount)}）不一致`);
    }
    if (!isNonEmptyString(value.itemsDigest) || !SHA256_RE.test(value.itemsDigest)) {
      errors.push("itemsDigest 必须是 64 位小写十六进制 sha256");
    }
  }

  const statusValid = typeof value.status === "string" && STATUS_SET.has(value.status);
  if (!statusValid) {
    errors.push(`status 必须是 ${ACCEPTANCE_TRIAGE_RECORD_STATUSES.join(" / ")}`);
  } else if (value.status === "returned-to-verifier" && !hasParseFailure && value.recommendation !== "return-to-verifier") {
    errors.push("status=returned-to-verifier 且 parseFailure 为 null 时 recommendation 必须是 return-to-verifier");
  } else if (value.status === "awaiting-decision" && value.recommendation !== "rework" && value.recommendation !== "report-only") {
    errors.push("status=awaiting-decision 时 recommendation 必须是 rework / report-only");
  }
  if (value.disposition !== null && (typeof value.disposition !== "string" || !DISPOSITION_SET.has(value.disposition))) {
    errors.push("disposition 必须是 null / rework / report-only");
  }
  if (value.source !== null && (typeof value.source !== "string" || !SOURCE_SET.has(value.source))) {
    errors.push("source 必须是 null / judge / customer");
  }
  if (typeof value.override !== "boolean") errors.push("override 必须是布尔值");
  for (const key of ["sourceDetail", "requestId", "triageCardId", "previousReportSha256", "error"] as const) {
    if (!isNullableString(value[key])) errors.push(`${key} 必须是字符串或 null`);
  }
  if (!isNonEmptyString(value.triageId)) errors.push("缺少字符串字段 triageId");
  if (value.previousReportSha256 !== null && typeof value.previousReportSha256 === "string" &&
      !SHA256_RE.test(value.previousReportSha256)) {
    errors.push("previousReportSha256 必须是 64 位小写十六进制 sha256 或 null");
  }
  if (value.decidedAt !== null && !isIsoTimestamp(value.decidedAt)) {
    errors.push("decidedAt 必须是 ISO 时间字符串或 null");
  }
  if (value.reportedAt !== null && !isIsoTimestamp(value.reportedAt)) {
    errors.push("reportedAt 必须是 ISO 时间字符串或 null");
  }
  if (!isIsoTimestamp(value.at)) errors.push("at 必须是 ISO 时间字符串");

  // 状态 / 决定一致性（不猜：终态不回退、未决不带处置与来源）。
  if (value.status === "dispatched") {
    if (value.disposition !== "rework") errors.push("status=dispatched 时 disposition 必须是 rework");
    if (value.source === null) errors.push("status=dispatched 时 source 必须是 judge / customer");
    if (value.decidedAt === null) errors.push("status=dispatched 时 decidedAt 必须非 null");
  } else if (value.status === "report-only") {
    if (value.disposition !== "report-only") errors.push("status=report-only 时 disposition 必须是 report-only");
    if (value.source === null) errors.push("status=report-only 时 source 必须是 judge / customer");
    if (value.decidedAt === null) errors.push("status=report-only 时 decidedAt 必须非 null");
  } else if (value.status === "awaiting-decision" || value.status === "returned-to-verifier") {
    if (value.disposition !== null) errors.push(`status=${value.status} 时 disposition 必须为 null（尚无决定）`);
    if (value.source !== null) errors.push(`status=${value.status} 时 source 必须为 null（尚无决定）`);
  }
  // status=failed：允许 disposition/source 为 null 或已尝试的决定（失败如实记录）。

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, record: value as unknown as AcceptanceTriageRecord };
}

// —————————————————————— 状态流转 ——————————————————————

/**
 * 同一报告（同 flowId+reportSha256）内的合法状态迁移：
 *   · 未决（awaiting-decision）→ dispatched / report-only / returned-to-verifier / failed；
 *   · 失败（failed）→ 重试后可到 awaiting-decision / dispatched / report-only / returned-to-verifier；
 *   · dispatched → failed（路由/发送失败如实回写）；
 *   · report-only / returned-to-verifier 对同一报告是终态（新报告 = 新记录，不继承旧结论）；
 *   · 同状态重复写 = 幂等（允许）。
 * 首次写入（无既有记录）不受限制。
 */
export function isAcceptanceTriageStatusTransitionAllowed(
  from: AcceptanceTriageRecordStatus,
  to: AcceptanceTriageRecordStatus,
): boolean {
  if (from === to) return true;
  switch (from) {
    case "awaiting-decision":
      return to === "dispatched" || to === "report-only" || to === "returned-to-verifier" || to === "failed";
    case "failed":
      return (
        to === "awaiting-decision" || to === "dispatched" || to === "report-only" || to === "returned-to-verifier"
      );
    case "dispatched":
      return to === "failed";
    case "report-only":
    case "returned-to-verifier":
      return false;
  }
}

// —————————————————————— 读 / 写 ——————————————————————

/**
 * 读取分诊记录。缺失 → `{}`（正常初始态）；坏件 → `{ corrupt }` 且**不返回记录**
 * （调用方按 §10 回落原验收卡路径，不猜旧结论）。读取绝不抛错。
 */
export async function readAcceptanceTriageRecord(
  projectRoot: string,
  flowId: string,
  options: AcceptanceTriageRecordReadOptions = {},
): Promise<AcceptanceTriageRecordReadResult> {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    return { corrupt: "projectRoot 缺失，无法读取分诊记录" };
  }
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { corrupt: `flowId 非法：${JSON.stringify(flowId)}` };
  }
  const absPath = acceptanceTriageRecordAbsPath(projectRoot, flowId);
  let text: string;
  try {
    text = await (options.readFile ?? ((target: string) => readFile(target, "utf8")))(absPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return {};
    return { corrupt: `分诊记录不可读：${err instanceof Error ? err.message : String(err)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { corrupt: `分诊记录不是合法 JSON：${err instanceof Error ? err.message : String(err)}` };
  }
  const validation = validateAcceptanceTriageRecord(parsed, flowId);
  if (!validation.ok) {
    return { corrupt: `分诊记录形状非法：${validation.errors.join("；")}` };
  }
  return { record: validation.record };
}

/**
 * 原子写分诊记录（同目录临时文件 + fsync + rename；失败不破坏原文件）。
 *
 * 幂等 / 覆盖规则（设计 §9.1 / §9.3）：
 *   · 同一 `flowId + reportSha256`：允许更新（状态流转须合法），不产生第二份记录；
 *   · 新报告 sha：覆盖写新记录，自动保留 `previousReportSha256`（未显式给出时）；
 *   · 既有记录损坏：按无记录处理（不猜旧内容），直接写新记录；
 *   · 校验失败 / 状态流转非法 / 写盘失败 ⇒ `{ok:false}`，**不写**。
 */
export async function writeAcceptanceTriageRecord(
  projectRoot: string,
  record: AcceptanceTriageRecord,
  options: AcceptanceTriageRecordWriteOptions = {},
): Promise<AcceptanceTriageRecordWriteResult> {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    return { ok: false, error: "projectRoot 缺失，未写分诊记录。" };
  }
  if (!isPlainObject(record) || !isNonEmptyString(record.flowId) || !FLOW_ID_RE.test(record.flowId)) {
    return { ok: false, error: `分诊记录 flowId 非法：${JSON.stringify((record as { flowId?: unknown })?.flowId)}，未写分诊记录。` };
  }

  let finalRecord = record;
  const existing = await readAcceptanceTriageRecord(projectRoot, record.flowId, options);
  if (existing.record !== undefined) {
    if (existing.record.reportSha256 === record.reportSha256) {
      if (!isAcceptanceTriageStatusTransitionAllowed(existing.record.status, record.status)) {
        return {
          ok: false,
          error:
            `分诊记录状态流转非法：${existing.record.status} → ${record.status}` +
            `（同一报告 ${record.reportSha256 === null ? "no-report" : record.reportSha256.slice(0, 8)}；` +
            "终态不回退，新报告才允许新一轮）。",
        };
      }
    } else if (record.previousReportSha256 === null || record.previousReportSha256 === undefined) {
      finalRecord = { ...record, previousReportSha256: existing.record.reportSha256 };
    }
  }

  const validation = validateAcceptanceTriageRecord(finalRecord);
  if (!validation.ok) {
    return { ok: false, error: `分诊记录形状非法，未写分诊记录：${validation.errors.join("；")}` };
  }

  const relPath = acceptanceTriageRecordRelPath(finalRecord.flowId);
  const absPath = acceptanceTriageRecordAbsPath(projectRoot, finalRecord.flowId);
  try {
    await mkdir(path.dirname(absPath), { recursive: true });
    const data = `${JSON.stringify(finalRecord, null, 2)}\n`;
    await (options.writeFile ?? atomicWrite)(absPath, data);
  } catch (err) {
    return {
      ok: false,
      error: `分诊记录写盘失败（原文件未被替换）：${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true, record: finalRecord, path: relPath };
}
