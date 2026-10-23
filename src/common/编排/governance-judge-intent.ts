// src/common/编排/governance-judge-intent.ts
// 决策判断的**意图基准**（编排私有 common，2026-10-19 客户定位修正）。
//
// 客户原话：「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」
// 因此 proposal / appointment / acceptance（decision 组）只判「是否偏离客户已确认的意图」；
// 工程质量、架构章节、测试覆盖、证据充分性、实现细节不归判断 agent（由 Draft/Proof 的工作流与验收负责）。
//
// 本模块只做**确定性解析**（不调用模型、不做语义判断）：
//   · 从账本 `intent.handed-off` / 提案 frontmatter `intentId` / `docs/intents/<flowId>.md` 定位意图文件；
//   · 解析意图 frontmatter 的 goal/scope/acceptance/非目标/客户原话（`parseIntentFrontmatter` 同一实现）；
//   · 用账本 `customer.decision{decisionKind:"intent-confirm"}` 的**最后一条**判定意图是否经客户确认
//     （客户先确认后改口 revise ⇒ 旧 accepted 不得放行，与 `validateIntentHandoff` §5.1 同口径）；
//   · 缺失/歧义/未确认一律给出 fail-closed 的 reasonCode，由证据包 builder 直接回落 manual。

import type { GovernanceLedgerEntry } from "./governance-ledger.ts";
import {
  GOVERNANCE_SLUG_PATTERN,
  intentArtifactPath,
  parseIntentFrontmatter,
} from "./governance-handoff.ts";

/** 意图摘要单字段上限（goal/scope/acceptance/非目标/客户原话各自有界）。 */
export const DECISION_INTENT_FIELD_MAX_BYTES = 2 * 1024;
/** 意图正文摘录总量上限（客户原话/非目标等章节）。 */
export const DECISION_INTENT_EXCERPT_MAX_BYTES = 4 * 1024;

export type IntentReferenceSource = "ledger" | "proposal" | "flow-id";

export interface ResolvedIntentReference {
  intentId: string;
  source: IntentReferenceSource;
}

export type IntentFailureCode = "intent-missing" | "intent-ambiguous" | "intent-unconfirmed";

export type IntentResolveResult =
  | { ok: true; reference: ResolvedIntentReference }
  | { ok: false; reasonCode: IntentFailureCode; detail: string };

export interface IntentExcerpt {
  label: string;
  text: string;
  truncated: boolean;
}

/** 意图摘要（证据包 `intent` 段的确定性子集；路径/哈希/确认态由 builder 补齐）。 */
export interface DecisionIntentSummary {
  intentId: string;
  path: string;
  source: IntentReferenceSource;
  goal: string;
  scope: string;
  acceptance: string;
  nonGoals?: string;
  customerWords?: string;
  excerpts: IntentExcerpt[];
  /** 任一字段/摘录被截断（仍可判断；完整文件可经 requiredReadPaths 定点抽查）。 */
  truncated: boolean;
}

export type IntentSummaryResult =
  | { ok: true; summary: DecisionIntentSummary }
  | { ok: false; reasonCode: IntentFailureCode; detail: string };

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

function trimValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstField(fields: Readonly<Record<string, string>>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = trimValue(fields[name]);
    if (value !== "") return value;
  }
  return undefined;
}

/**
 * 定位本次 flow 的意图文件（**确定性优先级**）：
 *   1. 账本最后一条 `intent.handed-off`（同一 flowId）；同一 flow 出现多个不同 intentId ⇒ 歧义（fail-closed）；
 *   2. 提案 frontmatter 的 `intentId`（旧项目/未走交接时的兼容来源）；
 *   3. `docs/intents/<flowId>.md`（角色卡口径；文件是否存在由调用方核对）。
 * `flowId` 已由 driver 校验为合法 slug。
 *
 * 2026-10-22 slug 收紧（设计 `2026-10-22_design_governance-slug-no-trailing-hyphen.md` §4.2）：
 * 账本 `intent.handed-off` 或提案 frontmatter 中**非空但不符合现行 slug** 的 `intentId` 不得静默
 * 跳过/回落其他来源，一律 `intent-unconfirmed` fail-closed（detail 点名旧值与现行规则）；空/缺席
 * 保持既有回落语义。
 */
export function resolveIntentReference(input: {
  flowId: string;
  ledgerEntries: readonly GovernanceLedgerEntry[];
  proposalText?: string;
}): IntentResolveResult {
  const { flowId, ledgerEntries, proposalText } = input;
  const handoffIntentIds: string[] = [];
  const invalidHandoffIntentIds: string[] = [];
  for (const entry of ledgerEntries) {
    if (entry === null || typeof entry !== "object") continue;
    if (entry.kind !== "intent.handed-off" || entry.flowId !== flowId) continue;
    const intentId = trimValue(entry.intentId);
    if (intentId === "") continue;
    if (!GOVERNANCE_SLUG_PATTERN.test(intentId)) {
      // 非空旧值不合现行规则：显式 fail-closed，不当作「没有意图」。
      if (!invalidHandoffIntentIds.includes(intentId)) invalidHandoffIntentIds.push(intentId);
      continue;
    }
    if (!handoffIntentIds.includes(intentId)) handoffIntentIds.push(intentId);
  }
  if (invalidHandoffIntentIds.length > 0) {
    return {
      ok: false,
      reasonCode: "intent-unconfirmed",
      detail:
        `账本 intent.handed-off 的 intentId（${invalidHandoffIntentIds.join("、")}）不符合现行 slug 规则` +
        `（${GOVERNANCE_SLUG_PATTERN}；2–64 位、首尾小写字母/数字、禁止首尾连字符）；` +
        "不得静默跳过或回落其他意图来源，请修正意图记录/账本后重试",
    };
  }
  if (handoffIntentIds.length > 1) {
    return {
      ok: false,
      reasonCode: "intent-ambiguous",
      detail:
        `同一 flow（${flowId}）关联多个意图（${handoffIntentIds.join("、")}），` +
        "无法确定客户已确认的出发点",
    };
  }
  if (handoffIntentIds.length === 1) {
    return { ok: true, reference: { intentId: handoffIntentIds[0]!, source: "ledger" } };
  }

  if (typeof proposalText === "string" && proposalText.trim() !== "") {
    const parsed = parseIntentFrontmatter(proposalText);
    if (parsed.ok) {
      const intentId = trimValue(parsed.fields["intentId"]);
      if (intentId !== "") {
        if (!GOVERNANCE_SLUG_PATTERN.test(intentId)) {
          // 非空旧值不合现行规则：显式 fail-closed，不静默回落 `flow-id` 来源。
          return {
            ok: false,
            reasonCode: "intent-unconfirmed",
            detail:
              `提案 frontmatter 的 intentId「${intentId}」不符合现行 slug 规则` +
              `（${GOVERNANCE_SLUG_PATTERN}；2–64 位、首尾小写字母/数字、禁止首尾连字符）；` +
              "不得静默回落 docs/intents/<flowId>.md，请修正提案 frontmatter 后重试",
          };
        }
        return { ok: true, reference: { intentId, source: "proposal" } };
      }
    }
  }

  return { ok: true, reference: { intentId: flowId, source: "flow-id" } };
}

const INTENT_SECTION_KEYWORDS =
  /(目标|范围|验收|非目标|不做|约束|限制|客户原话|客户要求|goal|scope|acceptance|non[- ]?goal|constraint|out[- ]?of[- ]?scope)/i;

function stripFrontmatter(text: string): string {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(normalized);
  return match !== null ? normalized.slice(match[0].length) : normalized;
}

/**
 * 意图正文摘录（确定性标题/行启发式）：只取与意图要素相关的章节或客户原话行；
 * 有界、截断标记；不做语义摘要。
 */
export function extractIntentBodyExcerpts(text: string): IntentExcerpt[] {
  const body = stripFrontmatter(text);
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const picked: Array<{ label: string; text: string }> = [];
  let heading = "";
  let collecting = false;
  let buffer: string[] = [];
  const flush = (): void => {
    if (!collecting || heading === "") return;
    const content = buffer.join("\n").trim();
    if (content !== "") picked.push({ label: heading, text: content });
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const match = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (match !== null) {
      flush();
      heading = match[2]!.trim();
      collecting = INTENT_SECTION_KEYWORDS.test(heading);
      buffer = [];
      continue;
    }
    if (collecting) {
      buffer.push(rawLine);
      continue;
    }
    if (/^(客户原话|客户要求|customer words)/i.test(trimmed)) {
      picked.push({ label: "客户原话", text: trimmed });
    }
  }
  flush();

  const out: IntentExcerpt[] = [];
  let used = 0;
  for (const entry of picked) {
    if (used >= DECISION_INTENT_EXCERPT_MAX_BYTES) break;
    const remaining = DECISION_INTENT_EXCERPT_MAX_BYTES - used;
    const text = truncateUtf8(entry.text, remaining);
    if (text.trim() === "") continue;
    out.push({ label: entry.label, text, truncated: text !== entry.text });
    used += byteLength(text);
  }
  return out;
}

/**
 * 解析意图文件为有界摘要。校验（fail-closed）：
 *   · frontmatter 不可解析 / goal/scope/acceptance 任一缺失 ⇒ `intent-missing`；
 *   · 文件 `intentId`/`flowId` 与定位结果不一致 ⇒ `intent-ambiguous`（文件属于别的意图/流程）。
 * `nonGoals`/`customerWords` 是可选要素（客户原话也在正文摘录中提取）。
 */
export function summarizeIntent(input: {
  text: string;
  reference: ResolvedIntentReference;
  flowId: string;
}): IntentSummaryResult {
  const { text, reference, flowId } = input;
  const path = intentArtifactPath(reference.intentId);
  const parsed = parseIntentFrontmatter(text);
  if (!parsed.ok) {
    return { ok: false, reasonCode: "intent-missing", detail: `意图文件 ${path} 无法解析：${parsed.message}` };
  }
  const fields = parsed.fields;
  const fileIntentId = trimValue(fields["intentId"]);
  if (fileIntentId !== "" && fileIntentId !== reference.intentId) {
    return {
      ok: false,
      reasonCode: "intent-ambiguous",
      detail: `意图文件 ${path} 的 intentId=${fileIntentId} 与定位到的 ${reference.intentId} 不一致`,
    };
  }
  const fileFlowId = trimValue(fields["flowId"]);
  if (fileFlowId !== "" && fileFlowId !== flowId) {
    return {
      ok: false,
      reasonCode: "intent-ambiguous",
      detail: `意图文件 ${path} 的 flowId=${fileFlowId} 与请求 flowId=${flowId} 不一致`,
    };
  }

  const goal = trimValue(fields["goal"]);
  const scope = trimValue(fields["scope"]);
  const acceptance = trimValue(fields["acceptance"]);
  const missing: string[] = [];
  if (goal === "") missing.push("goal");
  if (scope === "") missing.push("scope");
  if (acceptance === "") missing.push("acceptance");
  if (missing.length > 0) {
    return {
      ok: false,
      reasonCode: "intent-missing",
      detail: `意图文件 ${path} 缺少 ${missing.join("、")}（无法核对客户出发点）`,
    };
  }

  const nonGoals = firstField(fields, ["nonGoals", "non_goals", "non-goals", "nonGoal", "outOfScope", "out_of_scope"]);
  const customerWords = firstField(fields, [
    "customerWords",
    "customer_words",
    "customerQuote",
    "customer_quote",
  ]);

  let truncated = false;
  const bounded = (value: string): string => {
    const boundedValue = truncateUtf8(value, DECISION_INTENT_FIELD_MAX_BYTES);
    if (boundedValue !== value) truncated = true;
    return boundedValue;
  };

  return {
    ok: true,
    summary: {
      intentId: reference.intentId,
      path,
      source: reference.source,
      goal: bounded(goal),
      scope: bounded(scope),
      acceptance: bounded(acceptance),
      ...(nonGoals !== undefined ? { nonGoals: bounded(nonGoals) } : {}),
      ...(customerWords !== undefined ? { customerWords: bounded(customerWords) } : {}),
      excerpts: extractIntentBodyExcerpts(text),
      truncated,
    },
  };
}

/**
 * 意图是否经客户确认：账本中**最后一条**匹配的 `customer.decision{decisionKind:"intent-confirm"}`
 * 必须为 `accepted`（客户先确认后改口 revise ⇒ 不放行；与 `validateIntentHandoff` 同口径）。
 * 匹配口径：flowId、意图 id（无 flowId 的旧交接把 intentId 作为 flowId 写入）、或条目自带 intentId。
 */
export function intentConfirmedByLedger(
  entries: readonly GovernanceLedgerEntry[],
  flowId: string,
  intentId: string,
): boolean {
  const last = [...entries].reverse().find(
    (entry) =>
      entry !== null
      && typeof entry === "object"
      && entry.kind === "customer.decision"
      && entry.decisionKind === "intent-confirm"
      && (entry.flowId === flowId || entry.flowId === intentId || entry.intentId === intentId),
  );
  return last?.customerDecision === "accepted";
}
