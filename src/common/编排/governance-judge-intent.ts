// src/common/编排/governance-judge-intent.ts
// 决策判断的**意图基准**（编排私有 common，2026-10-19 客户定位修正）。
//
// 客户原话：「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」
// 因此 proposal / appointment / acceptance（decision 组）只判「是否偏离客户已确认的意图」；
// 工程质量、架构章节、测试覆盖、证据充分性、实现细节不归判断 agent（由 Draft/Proof 的工作流与验收负责）。
//
// 本模块只做**确定性解析**（不调用模型、不做语义判断）：
//   · 从请求显式 `intentId` / 提案 frontmatter `intentId` / `docs/intents/<flowId>.md`（flow-id 回落）定位意图文件；
//   · 解析意图 frontmatter 的 goal/scope/acceptance/非目标/客户原话（`parseIntentFrontmatter` 同一实现）；
//   · D 批已无账本：意图文件存在即作为判断基准（`intent.confirmed=true` 由证据 builder 写入，不伪造客户决定）；
//   · 缺失/歧义/未确认一律给出 fail-closed 的 reasonCode，由证据包 builder 直接回落 manual。

import {
  intentEntryRejectionHint,
  resolveIntentEntryReference,
  type IntentReferenceSource,
} from "../shared/intent-entry-contract.ts";
export type { IntentReferenceSource } from "../shared/intent-entry-contract.ts";

export const INTENT_DIR_REL = "docs/intents";

/** 意图记录项目相对路径（`docs/intents/<intentId>.md`）。 */
export function intentArtifactPath(intentId: string): string {
  return `${INTENT_DIR_REL}/${intentId}.md`;
}

/** 意图摘要单字段上限（goal/scope/acceptance/非目标/客户原话各自有界）。 */
export const DECISION_INTENT_FIELD_MAX_BYTES = 2 * 1024;
/** 意图正文摘录总量上限（客户原话/非目标等章节）。 */
export const DECISION_INTENT_EXCERPT_MAX_BYTES = 4 * 1024;

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
 *   1. 请求显式携带的 `intentId`（§5A；来源记为 `request`）；
 *   2. 提案 frontmatter 的 `intentId`（来源记为 `proposal`）；
 *   3. `docs/intents/<flowId>.md`（仅作为**显式 `flow-id` 回落**，来源随证据保留；不再把 flowId
 *      当作 intentId 的默认语义）。文件是否存在由调用方核对。
 * `flowId` 已由 driver 校验为合法 slug。
 *
 * 2026-10-22 slug 收紧（设计 `2026-10-22_design_governance-slug-no-trailing-hyphen.md` §4.2）：
 * 账本 `intent.handed-off` 或提案 frontmatter 中**非空但不符合现行 slug** 的 `intentId` 不得静默
 * 跳过/回落其他来源，一律 `intent-unconfirmed` fail-closed（detail 点名旧值与现行规则）；空/缺席
 * 保持既有回落语义。
 */
export function resolveIntentReference(input: {
  flowId: string;
  /** 新系统优先使用申请显式携带的意图 id（无 flow/ledger 机器）。 */
  intentId?: string;
  /** intentId 的来源；缺省按请求显式（request）处理。 */
  intentIdSource?: IntentReferenceSource;
  proposalText?: string;
}): IntentResolveResult {
  const { flowId, proposalText } = input;
  const explicit = typeof input.intentId === "string" ? input.intentId.trim() : "";
  let proposalIntentId: string | undefined;
  if (typeof proposalText === "string" && proposalText.trim() !== "") {
    const parsed = parseIntentFrontmatter(proposalText);
    if (parsed.ok) {
      const value = parsed.fields["intentId"]?.trim() ?? "";
      if (value !== "") proposalIntentId = value;
    }
  }
  const resolution = resolveIntentEntryReference({
    flowId,
    ...(explicit !== "" ? { requestIntentId: explicit } : {}),
    ...(proposalIntentId !== undefined ? { proposalIntentId } : {}),
  });
  if (!resolution.ok) {
    return { ok: false, reasonCode: resolution.code, detail: `${resolution.detail}\n${intentEntryRejectionHint()}` };
  }
  const source = explicit !== "" ? input.intentIdSource ?? resolution.source : resolution.source;
  return { ok: true, reference: { intentId: resolution.intentId, source } };
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
      detail: `意图文件 ${path} 的 intentId=${fileIntentId} 与定位到的 ${reference.intentId} 不一致\n${intentEntryRejectionHint()}`,
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

/** 意图 frontmatter 解析结果。 */
type FrontmatterParse =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; code: string; message: string };

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  }
  return value;
}

function blockScalarLines(lines: readonly string[]): { indent: number } {
  const indents = lines.filter((line) => line.trim() !== "").map((line) => /^[ \t]*/.exec(line)![0].length);
  return { indent: indents.length > 0 ? Math.min(...indents) : 0 };
}

function foldBlockLines(lines: readonly string[]): string {
  let out = "";
  let pendingBlank = 0;
  let started = false;
  for (const line of lines) {
    if (line.trim() === "") { pendingBlank += 1; continue; }
    if (!started) { out += "\n".repeat(pendingBlank) + line; started = true; }
    else out += (pendingBlank > 0 ? "\n".repeat(pendingBlank) : " ") + line;
    pendingBlank = 0;
  }
  return out;
}

function renderBlockScalar(style: "|" | ">", chomp: "-" | "+" | "", lines: readonly string[], indentIndicator: number | undefined): string {
  const common = blockScalarLines(lines);
  const indent = indentIndicator ?? common.indent;
  const stripped = lines.map((line) => (line.trim() === "" ? "" : line.slice(Math.min(indent, /^[ \t]*/.exec(line)![0].length))));
  let trailingBlanks = 0;
  while (trailingBlanks < stripped.length && stripped[stripped.length - 1 - trailingBlanks]!.trim() === "") trailingBlanks += 1;
  const coreLines = stripped.slice(0, stripped.length - trailingBlanks);
  const core = style === ">" ? foldBlockLines(coreLines) : coreLines.join("\n");
  if (core === "") return chomp === "+" ? "\n".repeat(trailingBlanks) : "";
  if (chomp === "-") return core;
  if (chomp === "+") return core + "\n".repeat(1 + trailingBlanks);
  return core + "\n";
}

function parseIntentFrontmatter(text: string): FrontmatterParse {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0]!.trim() !== "---") {
    return { ok: false, code: "missing-frontmatter", message: `意图文件必须以 \`---\` 开头并在 frontmatter 内给出 intentId/goal/scope/acceptance。\n${intentEntryRejectionHint()}` };
  }
  const fields: Record<string, string> = {};
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") { closed = true; break; }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (match === null) {
      return { ok: false, code: "invalid-frontmatter", message: `意图文件 frontmatter 第 ${i + 1} 行无法解析（只支持顶层 key: value）。` };
    }
    const rawValue = match[2]!.trim();
    const block = /^([|>])([+-]?)([1-9]?)([+-]?)\s*(?:#.*)?$/.exec(rawValue);
    if (block !== null) {
      const style = block[1] as "|" | ">";
      const chompGroup = block[2] !== "" ? block[2] : block[4];
      const chomp = chompGroup === "+" ? "+" : chompGroup === "-" ? "-" : "";
      const indentIndicator = block[3] !== "" ? Number(block[3]) : undefined;
      const content: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j]!;
        if (next.trim() !== "" && !/^[ \t]/.test(next)) break;
        content.push(next);
      }
      fields[match[1]!] = renderBlockScalar(style, chomp, content, indentIndicator);
      i = j - 1;
      continue;
    }
    fields[match[1]!] = unquote(rawValue);
  }
  if (!closed) return { ok: false, code: "missing-frontmatter", message: `意图文件 frontmatter 没有闭合的 \`---\`。\n${intentEntryRejectionHint()}` };
  return { ok: true, fields };
}
