// src/common/编排/governance-judge-verdict.ts
// 治理卡判断 agent 的**唯一规范化点**（编排私有 common；公开入口经 `govern-session.ts` 薄再导出）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md`
// §7.2/§7.3/§7.4（approved）。
//
// 硬口径：
//   1. **只做正向代批**：`approve` 只表示「可以替客户接受/任命/确认/验收」；`revise`/`reject`/`false`/
//      空选择/未知 id/多选冲突一律 `manual`（绝不代拒绝/修改/取消）；
//   2. **不采信模型自报的机械事实**：`pathProbes`/`recommendedRoleIds`/`facts` 来自应用；
//      模型 `pathDecisions` 必须覆盖全部候选路径且全 `ok:true`，任一不满足整卡回落；
//   3. **approve 必须无损且 required-read 满足**：读取被拒/截断/预算耗尽、物证缺失、必读路径未读
//      一律回落 `manual`；模型自报 `reasonCode` 只作提示，最终 code 由本模块安全映射；
//   4. **审计字段有界**（§7.4）：reason ≤1KB、evidence ≤10 条、pathDecisions ≤50 条，超出截断。

import type {
  GovernanceCardKind,
  GovernanceJudgeAudit,
  GovernanceJudgeOutcome,
  GovernanceJudgePathDecision,
  GovernanceJudgeRequest,
  RuntimeKind,
  ShellJudgeReadStats,
} from "../../model/runtime.ts";
import { governanceCardGroup } from "../../model/runtime.ts";
import { boundedJudgeText, redactJudgeText } from "./shell-judge-verdict.ts";
import { readDeniedReason } from "./shell-judge.ts";
import { requiredArtifactPaths } from "./governance-judge-facts.ts";

/** 判断理由/证据/路径结论的文本上限（评审 §7.2：reason ≤2KB；审计再收紧到 1KB）。 */
export const GOVERNANCE_JUDGE_REASON_LIMIT_BYTES = 2 * 1024;
export const GOVERNANCE_JUDGE_AUDIT_REASON_LIMIT_BYTES = 1024;
export const GOVERNANCE_JUDGE_EVIDENCE_LIMIT = 10;
export const GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES = 512;
export const GOVERNANCE_JUDGE_PATH_LIMIT = 50;
export const GOVERNANCE_JUDGE_SELECTED_LIMIT = 50;
/** 选项 id / reasonCode 等短标识上限。 */
const GOVERNANCE_JUDGE_FACT_ID_BYTES = 128;

/** 治理内置角色 id（任命卡不得选；评审 §7.3）。 */
const BUILT_IN_GOVERNANCE_ROLE_IDS: ReadonlySet<string> = new Set([
  "liaison",
  "rapporteur",
  "nominator",
  "convener",
  "su",
]);

/** 各治理角色的 `write` 来源写区（评审 §7.3；`角色卡/**` 只能走 appointment-write）。 */
const SOURCE_WRITE_ROOTS: Readonly<Record<string, readonly string[]>> = {
  rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
  nominator: ["docs/nominations/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
  convener: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
};

function writeSourceMatches(roleId: string, path: string): boolean {
  const roots = SOURCE_WRITE_ROOTS[roleId];
  if (roots === undefined) return false; // 未知来源角色 ⇒ 无法核对 ⇒ 整卡回落
  return roots.some((root) => pathCovers(root, path));
}

function appointmentWriteTarget(path: string): string | undefined {
  const match = /^角色卡\/([^/]+)\/(.+)$/.exec(normalizeRel(path));
  return match !== null ? match[1] : undefined;
}

function scheduleWriteMatches(flowId: string, path: string): boolean {
  const normalized = normalizeRel(path);
  return normalized === "docs/workflow.md" || normalized === `docs/flows/${flowId}.md`;
}

/** 任何卡都不得确认的危险写路径（评审 §十一-7；应用探测之外的第二道机械复核）。 */
const HARD_FORBIDDEN_PREFIXES: readonly string[] = [
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
  "角色卡/liaison/",
  "角色卡/rapporteur/",
  "角色卡/nominator/",
  "角色卡/convener/",
  "角色卡/su/",
];

/** 模型自报 manual reasonCode 的安全名单（其余一律 `model-manual`，防审计污染）。 */
const SAFE_MANUAL_REASON_CODES: ReadonlySet<string> = new Set([
  "insufficient-evidence",
  "not-recommended",
  "artifact-missing",
  "artifact-not-read",
  "path-unverified",
  "path-outside-boundary",
  "group-mismatch",
  "ledger-unavailable",
]);

const DEFAULT_MANUAL_REASON = "判断 agent 自报无法完成判断，已转手动确认。";

/** 规范化后的模型原始结论（只保留白名单字段；未知字段丢弃）。 */
export interface NormalizedGovernanceJudgeVerdict {
  verdict: "approve" | "manual";
  group?: string;
  cardKind?: string;
  reasonCode?: string;
  reason?: string;
  evidence?: string[];
  selected?: string[];
  confirmed?: boolean;
  pathDecisions?: GovernanceJudgePathDecision[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, maxBytes: number): string | undefined {
  return boundedJudgeText(value, maxBytes);
}

function normalizeEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    const text = normalizeText(entry, GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES);
    if (text === undefined) continue;
    out.push(text);
    if (out.length >= GOVERNANCE_JUDGE_EVIDENCE_LIMIT) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeSelected(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  // 超上限不截断后猜：截断可能掩盖重复/额外 id，使任命「恰等推荐集」被误判成立。
  if (value.length > GOVERNANCE_JUDGE_SELECTED_LIMIT) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    const text = normalizeText(entry, GOVERNANCE_JUDGE_FACT_ID_BYTES);
    if (text === undefined) continue;
    out.push(text);
  }
  return out.length > 0 ? out : undefined;
}

function normalizePathDecisions(value: unknown): GovernanceJudgePathDecision[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: GovernanceJudgePathDecision[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const path = normalizeText(entry.path, GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES);
    if (path === undefined || typeof entry.ok !== "boolean") continue;
    const reason = normalizeText(entry.reason, GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES);
    out.push({ path, ok: entry.ok, ...(reason !== undefined ? { reason } : {}) });
    if (out.length >= GOVERNANCE_JUDGE_PATH_LIMIT) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 严格规范化 `report_governance_judgement` 的原始参数（评审 §7.2）：
 * - `verdict` 必须恰为 `approve`/`manual`；否则 `undefined`（调用方落 `manual/parse-failed`）；
 * - `approve` 必须有非空 `reason`；缺失 ⇒ `undefined`（不完整判断不得放行）；
 * - 其余字段按上限截断；`pathDecisions` 的非法项丢弃（覆盖检查会把它变成 `path-unverified`）。
 */
export function normalizeGovernanceJudgeVerdict(input: unknown): NormalizedGovernanceJudgeVerdict | undefined {
  if (!isRecord(input)) return undefined;
  const verdict = input.verdict;
  if (verdict !== "approve" && verdict !== "manual") return undefined;

  const reason = normalizeText(input.reason, GOVERNANCE_JUDGE_REASON_LIMIT_BYTES);
  if (verdict === "approve" && reason === undefined) return undefined;

  const normalized: NormalizedGovernanceJudgeVerdict = { verdict };
  const group = normalizeText(input.group, 32);
  if (group !== undefined) normalized.group = group;
  const cardKind = normalizeText(input.cardKind, 32);
  if (cardKind !== undefined) normalized.cardKind = cardKind;
  const reasonCode = normalizeText(input.reasonCode, GOVERNANCE_JUDGE_FACT_ID_BYTES);
  if (reasonCode !== undefined) normalized.reasonCode = reasonCode;
  if (reason !== undefined) normalized.reason = reason;
  const evidence = normalizeEvidence(input.evidence);
  if (evidence !== undefined) normalized.evidence = evidence;
  const selected = normalizeSelected(input.selected);
  if (selected !== undefined) normalized.selected = selected;
  if (typeof input.confirmed === "boolean") normalized.confirmed = input.confirmed;
  const pathDecisions = normalizePathDecisions(input.pathDecisions);
  if (pathDecisions !== undefined) normalized.pathDecisions = pathDecisions;
  return normalized;
}

// —————————————————————— 逐路径机械复核 ——————————————————————

function normalizeRel(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function caseKey(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

/** 路径是否等于前缀或在其下（按段比较）。 */
function pathCovers(prefix: string, path: string): boolean {
  const root = caseKey(stripTrailingSlash(normalizeRel(prefix)));
  if (root === "") return false;
  const target = caseKey(normalizeRel(path));
  return target === root || target.startsWith(`${root}/`);
}

function uniquePaths(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRel(value);
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function damageCode(stats: ShellJudgeReadStats | undefined): string | undefined {
  if (stats === undefined) return undefined;
  if (stats.budgetExceeded) return "budget";
  if (stats.truncatedReads > 0) return "read-truncated";
  if (stats.deniedReads > 0) return "read-denied";
  return undefined;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  if (set.size !== left.length) return false;
  return right.every((item) => set.has(item));
}

export interface EvaluateGovernanceJudgeVerdictArgs {
  request: GovernanceJudgeRequest;
  verdict: NormalizedGovernanceJudgeVerdict | undefined;
  stats?: ShellJudgeReadStats;
  /** driver 计算的必读物证（含存在的候选文件）；approve 前必须 ⊆ `stats.readPaths`。 */
  requiredReadPaths?: readonly string[];
  engine: RuntimeKind;
  model?: string;
  durationMs?: number;
}

/**
 * `artifact-missing` 的 reason 文案（2026-10-18 客户反馈：只写「规范物证缺失」看不出缺哪个文件）：
 * 有约定路径 ⇒ 逐条列出；无路径 ⇒ 保留原泛化文案（向后兼容）。
 */
export function artifactMissingReason(missingPaths?: readonly string[]): string {
  const paths = [...new Set((missingPaths ?? []).map((path) => path.trim()).filter((path) => path !== ""))];
  return paths.length === 0
    ? "规范物证缺失，无法核对判断，已转手动确认。"
    : `规范物证缺失：${paths.join("、")}（判断无法核对），已转手动确认。`;
}

function manualOutcome(
  args: EvaluateGovernanceJudgeVerdictArgs,
  reasonCode: string,
  reason: string,
): GovernanceJudgeOutcome {  const stats = args.stats;
  return {
    verdict: "manual",
    group: args.request.group,
    cardKind: args.request.cardKind,
    reasonCode,
    reason: redactJudgeText(reason),
    engine: args.engine,
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    ...(stats !== undefined ? { readCalls: stats.readCalls, readBytes: stats.readBytes } : {}),
  };
}

/**
 * 把模型结论 + 应用事实归一化为最终 `GovernanceJudgeOutcome`（评审 §7.2 表逐行）：
 * 不抛错；所有不确定都回落 `manual`（fail-closed）。
 */
export function evaluateGovernanceJudgeVerdict(args: EvaluateGovernanceJudgeVerdictArgs): GovernanceJudgeOutcome {
  const { request, verdict, stats } = args;
  if (verdict === undefined) {
    return manualOutcome(args, "parse-failed", "判断输出无法解析（缺少合法的 report_governance_judgement 结论），已转手动确认。");
  }

  if (verdict.verdict === "manual") {
    const reasonCode = verdict.reasonCode !== undefined && SAFE_MANUAL_REASON_CODES.has(verdict.reasonCode)
      ? verdict.reasonCode
      : "model-manual";
    return manualOutcome(args, reasonCode, verdict.reason ?? DEFAULT_MANUAL_REASON);
  }

  // —— approve 的机械门槛（顺序固定，便于测试与审计）——

  // 1) 分组/卡种必须与请求一致（防御；channel 已从 cardKind 派生）。
  const derivedGroup = governanceCardGroup(request.cardKind);
  if (derivedGroup === undefined || request.group !== derivedGroup) {
    return manualOutcome(args, "group-mismatch", "判断请求的分组与卡种不一致，已转手动确认。");
  }
  if (verdict.group !== undefined && verdict.group !== request.group) {
    return manualOutcome(args, "group-mismatch", "判断结论的分组与请求不一致，已转手动确认。");
  }
  if (verdict.cardKind !== undefined && verdict.cardKind !== request.cardKind) {
    return manualOutcome(args, "group-mismatch", "判断结论的卡种与请求不一致，已转手动确认。");
  }

  // 2) 账本事实不可读/有坏行 ⇒ 禁止 approve（fail-closed）。
  if (request.facts === undefined || request.facts.ledgerErrors !== 0) {
    return manualOutcome(args, "ledger-unavailable", "治理账本不可读或存在坏行，无法保证判断无损，已转手动确认。");
  }

  // 3) 读取损伤：approve 必须无损（与 shell judge 同口径；预算优先）。
  const damage = damageCode(stats);
  if (damage !== undefined) {
    const reason = damage === "budget"
      ? "判断预算耗尽（读取次数/总读取字节达上限），无法保证无损判断，已转手动确认。"
      : damage === "read-truncated"
        ? "判断所需文件被截断，无法保证无损判断，已转手动确认。"
        : readDeniedReason(stats);
    return manualOutcome(args, damage, reason);
  }

  // 4) 逐卡种门槛。
  switch (request.cardKind) {
    case "proposal": {
      const selected = verdict.selected ?? [];
      if (request.card.kind !== "choice" || !request.card.options.some((option) => option.id === "accept")) {
        return manualOutcome(args, "not-recommended", "卡片没有可代批的 accept 选项，已转手动确认。");
      }
      if (!sameSet(selected, ["accept"])) {
        return manualOutcome(args, "not-recommended", "提案卡只能代批 accept（accept-quick/revise/reject 一律交回客户），已转手动确认。");
      }
      break;
    }
    case "acceptance": {
      const selected = verdict.selected ?? [];
      if (request.card.kind !== "choice" || !request.card.options.some((option) => option.id === "accept")) {
        return manualOutcome(args, "not-recommended", "卡片没有可代批的 accept 选项，已转手动确认。");
      }
      if (!sameSet(selected, ["accept"])) {
        return manualOutcome(args, "not-recommended", "验收卡只能代批 accept，已转手动确认。");
      }
      if (request.facts.proposalDecision !== "accepted" && request.facts.proposalDecision !== "accepted-quick") {
        return manualOutcome(args, "insufficient-evidence", "提案尚未被客户接受，不能代批验收，已转手动确认。");
      }
      if (request.facts.unresolvedClarificationCount !== 0) {
        return manualOutcome(args, "insufficient-evidence", "仍有未闭环的澄清，不能代批验收，已转手动确认。");
      }
      break;
    }
    case "appointment": {
      const recommended = request.recommendedRoleIds;
      if (request.card.kind !== "choice") {
        return manualOutcome(args, "insufficient-evidence", "任命卡形状非法，已转手动确认。");
      }
      if (!Array.isArray(recommended) || recommended.length === 0 || new Set(recommended).size !== recommended.length) {
        return manualOutcome(args, "insufficient-evidence", "提名文件缺少唯一的机器可读推荐集，已转手动确认。");
      }
      const optionIds = new Set(request.card.options.map((option) => option.id));
      if (!recommended.every((id) => optionIds.has(id))) {
        return manualOutcome(args, "insufficient-evidence", "推荐集不在任命卡选项中，已转手动确认。");
      }
      if (recommended.some((id) => BUILT_IN_GOVERNANCE_ROLE_IDS.has(id))) {
        return manualOutcome(args, "not-recommended", "推荐集含内置治理角色，已转手动确认。");
      }
      if (recommended.length > 1 && request.card.multiple !== true) {
        return manualOutcome(args, "not-recommended", "推荐多个角色但卡片不是多选，已转手动确认。");
      }
      const selected = verdict.selected ?? [];
      if (selected.length === 0 || new Set(selected).size !== selected.length) {
        return manualOutcome(args, "not-recommended", "任命选择为空或含重复项，已转手动确认。");
      }
      if (selected.some((id) => BUILT_IN_GOVERNANCE_ROLE_IDS.has(id))) {
        return manualOutcome(args, "not-recommended", "任命选择含内置治理角色，已转手动确认。");
      }
      if (!sameSet(selected, recommended)) {
        return manualOutcome(args, "not-recommended", "任命选择必须恰等于应用解析的推荐集，已转手动确认。");
      }
      break;
    }
    case "write":
    case "appointment-write":
    case "schedule-write": {
      if (verdict.confirmed !== true) {
        return manualOutcome(args, "not-recommended", "写盘卡未给出 confirmed:true，已转手动确认。");
      }
      if (request.card.kind !== "confirm") {
        return manualOutcome(args, "path-unverified", "写盘卡形状非法，已转手动确认。");
      }
      const paths = uniquePaths(Array.isArray(request.paths) ? request.paths : []);
      if (paths.length === 0) {
        return manualOutcome(args, "path-unverified", "写盘卡没有可复核的具体路径，已转手动确认。");
      }
      if (paths.length > GOVERNANCE_JUDGE_PATH_LIMIT) {
        // 不截断后猜：候选超过逐路径复核上限 ⇒ 整卡回落（评审 §7.2 pathDecisions ≤50）。
        return manualOutcome(args, "path-unverified", "写盘卡候选路径超过逐路径复核上限，已转手动确认。");
      }

      // 应用机械探测：每个候选路径必须有 allowed:true 的 probe。
      const probes = Array.isArray(request.pathProbes) ? request.pathProbes : [];
      for (const path of paths) {
        const probe = probes.find((entry) => normalizeRel(entry.path) === path);
        if (probe === undefined || probe.allowed !== true) {
          return manualOutcome(args, "path-outside-boundary", `路径 ${path} 未通过应用机械探测（越界/敏感/不可写），已转手动确认。`);
        }
      }

      // 写根/禁写：第二道机械复核（不依赖模型自报）。
      const roots = Array.isArray(request.allowedPathRoots) ? request.allowedPathRoots : [];
      if (roots.length === 0) {
        return manualOutcome(args, "path-outside-boundary", "缺少角色可写根事实，无法复核路径，已转手动确认。");
      }
      const forbidden = [
        ...HARD_FORBIDDEN_PREFIXES,
        ...(Array.isArray(request.forbiddenPaths) ? request.forbiddenPaths : []),
      ];
      for (const path of paths) {
        if (!roots.some((root) => pathCovers(root, path))) {
          return manualOutcome(args, "path-outside-boundary", `路径 ${path} 不在角色可写根内，已转手动确认。`);
        }
        if (forbidden.some((prefix) => pathCovers(prefix, path))) {
          return manualOutcome(args, "path-outside-boundary", `路径 ${path} 属于禁写路径，已转手动确认。`);
        }
      }

      // 来源匹配（评审 §7.3）：write 只能写来源角色写区；appointment-write 目标必须在最新任命名单
      // 且非内置；schedule-write 必须匹配 flowId。
      if (request.cardKind === "write") {
        if (!paths.every((path) => writeSourceMatches(request.roleId, path))) {
          return manualOutcome(args, "path-outside-boundary", "写盘路径与来源角色的写区不匹配，已转手动确认。");
        }
      } else if (request.cardKind === "appointment-write") {
        const appointed = new Set(request.facts.appointmentTargetRoleIds ?? []);
        for (const path of paths) {
          const target = appointmentWriteTarget(path);
          if (target === undefined || BUILT_IN_GOVERNANCE_ROLE_IDS.has(target) || !appointed.has(target)) {
            return manualOutcome(args, "path-outside-boundary", `路径 ${path} 不在最新任命名单内或指向内置治理角色，已转手动确认。`);
          }
        }
      } else if (request.cardKind === "schedule-write") {
        if (!paths.every((path) => scheduleWriteMatches(request.flowId, path))) {
          return manualOutcome(args, "path-outside-boundary", "流程写盘路径与 flowId 不一致，已转手动确认。");
        }
      }

      // 模型逐路径结论必须**恰好**覆盖全部候选且全 ok:true。
      const decisions = verdict.pathDecisions;
      if (decisions === undefined || decisions.length !== paths.length) {
        return manualOutcome(args, "path-unverified", "判断结论的逐路径结论未覆盖全部候选路径，已转手动确认。");
      }
      const seen = new Set<string>();
      for (const decision of decisions) {
        const path = normalizeRel(decision.path);
        if (seen.has(path) || !paths.includes(path)) {
          return manualOutcome(args, "path-unverified", "判断结论的逐路径结论含重复或额外路径，已转手动确认。");
        }
        seen.add(path);
        if (decision.ok !== true) {
          return manualOutcome(args, "path-unverified", `路径 ${path} 被判断为不可确认，已转手动确认。`);
        }
      }
      break;
    }
    default:
      return manualOutcome(args, "group-mismatch", "未知治理卡种，已转手动确认。");
  }

  // 5) 规范物证必须存在且真的被读过（required-read 门槛）。
  const requiredArtifacts = requiredArtifactPaths(request);
  if (requiredArtifacts.missing) {
    return manualOutcome(args, "artifact-missing", artifactMissingReason(requiredArtifacts.missingPaths));
  }
  const readPaths = new Set((stats?.readPaths ?? []).map(normalizeRel));
  const requiredReadPaths = uniquePaths([
    ...requiredArtifacts.paths,
    ...(args.requiredReadPaths ?? []),
  ]);
  if (requiredReadPaths.some((path) => !readPaths.has(path))) {
    return manualOutcome(args, "artifact-not-read", "判断 agent 未实际读取全部必读物证，已转手动确认。");
  }
  // required-read 超预算：不降低门槛（评审 §5.4）。
  const maxCalls = 8;
  if (requiredReadPaths.length > maxCalls) {
    return manualOutcome(args, "budget", "必读物证数量超出判断读取预算，已转手动确认。");
  }

  // 6) approve 必须有可核对证据。
  if (verdict.evidence === undefined || verdict.evidence.length === 0) {
    return manualOutcome(args, "insufficient-evidence", "代批结论缺少可核对证据，已转手动确认。");
  }

  const reason = redactJudgeText(verdict.reason ?? "");
  const evidence = verdict.evidence
    .map((item) => redactJudgeText(item))
    .filter((item) => item !== "")
    .slice(0, GOVERNANCE_JUDGE_EVIDENCE_LIMIT);
  if (reason === "" || evidence.length === 0) {
    return manualOutcome(args, "insufficient-evidence", "代批结论缺少可核对证据，已转手动确认。");
  }

  const isConfirm = request.cardKind !== "proposal"
    && request.cardKind !== "appointment"
    && request.cardKind !== "acceptance";
  const paths = isConfirm ? uniquePaths(Array.isArray(request.paths) ? request.paths : []) : [];
  const pathDecisions = isConfirm
    ? (verdict.pathDecisions ?? []).map((decision) => {
        const decisionReason = decision.reason !== undefined ? redactJudgeText(decision.reason) : undefined;
        return {
          path: normalizeRel(decision.path),
          ok: true as const,
          ...(decisionReason !== undefined && decisionReason !== "" ? { reason: decisionReason } : {}),
        };
      })
    : undefined;

  return {
    verdict: "approve",
    group: request.group,
    cardKind: request.cardKind,
    reasonCode: "sufficient",
    reason,
    engine: args.engine,
    ...(args.model !== undefined ? { model: args.model } : {}),
    value: isConfirm
      ? { confirmed: true }
      : { selected: [...(verdict.selected ?? [])] },
    ...(isConfirm ? { paths } : {}),
    ...(pathDecisions !== undefined ? { pathDecisions } : {}),
    evidence,
    ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    ...(stats !== undefined ? { readCalls: stats.readCalls, readBytes: stats.readBytes } : {}),
  };
}

/** 由最终 outcome 构造账本审计对象（字段与评审 §7.4 一致；未做有界处理）。 */
export function governanceJudgeAuditFromOutcome(outcome: GovernanceJudgeOutcome): GovernanceJudgeAudit {
  return {
    group: outcome.group,
    cardKind: outcome.cardKind,
    engine: outcome.engine,
    ...(outcome.model !== undefined ? { model: outcome.model } : {}),
    reasonCode: outcome.reasonCode,
    ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
    ...(outcome.value?.selected !== undefined ? { selected: outcome.value.selected } : {}),
    ...(outcome.value?.confirmed === true ? { confirmed: true as const } : {}),
    ...(outcome.paths !== undefined ? { paths: outcome.paths } : {}),
    ...(outcome.pathDecisions !== undefined ? { pathDecisions: outcome.pathDecisions } : {}),
    ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
    ...(outcome.readCalls !== undefined ? { readCalls: outcome.readCalls } : {}),
    ...(outcome.readBytes !== undefined ? { readBytes: outcome.readBytes } : {}),
  };
}

/** 把账本 `judge` 证据压到有界（评审 §7.4：reason ≤1KB、evidence ≤10 条、pathDecisions ≤50 条）。 */
export function boundedGovernanceJudgeAudit(audit: GovernanceJudgeAudit): GovernanceJudgeAudit {
  const reason = audit.reason !== undefined ? redactJudgeText(audit.reason) : undefined;
  const evidence = audit.evidence !== undefined
    ? audit.evidence
        .map((item) => boundedJudgeText(redactJudgeText(item), GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES))
        .filter((item): item is string => item !== undefined && item !== "")
        .slice(0, GOVERNANCE_JUDGE_EVIDENCE_LIMIT)
    : undefined;
  const paths = audit.paths !== undefined ? uniquePaths(audit.paths).slice(0, GOVERNANCE_JUDGE_PATH_LIMIT) : undefined;
  const pathDecisions = audit.pathDecisions !== undefined
    ? audit.pathDecisions.slice(0, GOVERNANCE_JUDGE_PATH_LIMIT).map((decision) => {
        const itemReason = decision.reason !== undefined ? boundedJudgeText(redactJudgeText(decision.reason), GOVERNANCE_JUDGE_EVIDENCE_ITEM_BYTES) : undefined;
        return {
          path: normalizeRel(decision.path),
          ok: decision.ok,
          ...(itemReason !== undefined ? { reason: itemReason } : {}),
        };
      })
    : undefined;
  const selected = audit.selected !== undefined
    ? audit.selected.slice(0, GOVERNANCE_JUDGE_SELECTED_LIMIT)
    : undefined;
  const boundedReason = reason !== undefined && reason !== ""
    ? boundedJudgeText(reason, GOVERNANCE_JUDGE_AUDIT_REASON_LIMIT_BYTES)
    : undefined;
  return {
    group: audit.group,
    cardKind: audit.cardKind,
    engine: audit.engine,
    ...(audit.model !== undefined ? { model: audit.model } : {}),
    reasonCode: boundedJudgeText(audit.reasonCode, GOVERNANCE_JUDGE_FACT_ID_BYTES) ?? "manual",
    ...(boundedReason !== undefined ? { reason: boundedReason } : {}),
    ...(evidence !== undefined && evidence.length > 0 ? { evidence } : {}),
    ...(selected !== undefined ? { selected } : {}),
    ...(audit.confirmed === true ? { confirmed: true as const } : {}),
    ...(paths !== undefined && paths.length > 0 ? { paths } : {}),
    ...(pathDecisions !== undefined ? { pathDecisions } : {}),
    ...(audit.durationMs !== undefined ? { durationMs: audit.durationMs } : {}),
    ...(audit.readCalls !== undefined ? { readCalls: audit.readCalls } : {}),
    ...(audit.readBytes !== undefined ? { readBytes: audit.readBytes } : {}),
  };
}
