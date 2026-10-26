// src/common/编排/shell-judge-verdict.ts
// 「替我审」判断 agent 的**裁决规范化 / 客户说明合成 / 脱敏**（编排私有 common）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_shell-auto-approve-review.md`
// §6.2/§8.2（approved，revision 2）。运行时核心的 `report_shell_judgement` **只把模型原始参数交回**，
// 取值域校验、缺失补全、客户可转述说明与凭据脱敏全部在本模块完成——**不做第二份裁决语义**。
//
// 三条硬口径：
//   1. 未知 verdict / 缺失 / 空串 → `undefined`（调用方落 `manual/parse-failed`，绝不从散文里猜结论）；
//   2. `allow` 必须有非空 `reason`（不完整判断不得放行）；
//   3. `deny` 的 `customerMessage` 必须是人话、可直接转述、含「关闭『替我审批』后重试」出路；缺失或含内部
//      行话时由本模块合成（`customerMessageSynthesized` 由调用方置位）。

import type { ShellJudgeAlternative, ShellJudgeVerdict } from "../../model/runtime.ts";
import { RUNTIME_CREDENTIAL_ENV_VARS } from "../shared/runtime-shared.ts";

/** 单段文本上限（PM 评审 §8.2：reason / customerMessage / alternative.value ≤2KB）。 */
export const SHELL_JUDGE_TEXT_LIMIT_BYTES = 2 * 1024;
/** 证据条数/单条上限（PM 评审 §8.2：≤10 条、每条 ≤512B）。 */
export const SHELL_JUDGE_EVIDENCE_LIMIT = 10;
export const SHELL_JUDGE_EVIDENCE_ITEM_BYTES = 512;
/** 判断 agent 输出中禁止出现在客户说明里的内部行话（命中即视为不可直接转述）。 */
export const SHELL_JUDGE_INTERNAL_JARGON = [
  "operator:",
  "su-审批档",
  "shell-gate",
  "b-unsure",
  "ruleset:",
  "pm:",
  "hardDenyOverride",
  "(a)",
  "(b)",
  "(c)",
] as const;

/** `deny` 的标准出路句（2026-10-18 双开关后统一为「替我审批」；PM 评审 §8.4）。 */
export const SHELL_JUDGE_EXIT_LINE = "如需执行，请关闭「替我审批」后重试。";

const REDACTED = "[已脱敏]";

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 有界截断（UTF-8 字节）。截断时追加 `…` 并以完整码点收尾，避免切裂多字节序列。
 * 非字符串/空串 → `undefined`（可选字段缺省）。
 */
export function boundedJudgeText(value: unknown, maxBytes: number = SHELL_JUDGE_TEXT_LIMIT_BYTES): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (byteLength(trimmed) <= maxBytes) return trimmed;
  const buffer = Buffer.from(trimmed, "utf8").subarray(0, Math.max(0, maxBytes - byteLength("…")));
  // 回退到最近的可解码前缀（不产生替换字符糊）。
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

/** 内部行话判定（大小写不敏感；命中 ⇒ `customerMessage` 不可直接转述）。 */
export function hasInternalJargon(text: string): boolean {
  const lower = text.toLowerCase();
  return SHELL_JUDGE_INTERNAL_JARGON.some((token) => lower.includes(token.toLowerCase()));
}

function normalizeAlternative(value: unknown): ShellJudgeAlternative | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  if (kind !== "command" && kind !== "tool" && kind !== "instruction") return undefined;
  const text = boundedJudgeText(value.value);
  if (text === undefined) return undefined;
  const alternative: ShellJudgeAlternative = { kind, value: text };
  const rationale = boundedJudgeText(value.rationale);
  if (rationale !== undefined) alternative.rationale = rationale;
  return alternative;
}

function normalizeEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const entry of value) {
    const text = boundedJudgeText(entry, SHELL_JUDGE_EVIDENCE_ITEM_BYTES);
    if (text === undefined) continue;
    items.push(text);
    if (items.length >= SHELL_JUDGE_EVIDENCE_LIMIT) break;
  }
  return items.length > 0 ? items : undefined;
}

/**
 * 严格规范化模型交回的原始参数（PM 评审 §8.2）：
 * - `verdict` 必须恰为 `allow`/`deny`/`manual`；否则 `undefined`；
 * - `allow` 必须有非空 `reason`；否则 `undefined`（→ `manual/parse-failed`）；
 * - 可选文本按字节上限截断；`alternative` 形状不合法即**忽略**（不否决整个裁决）；
 * - `manual` 原样保留（rubric 约束模型不得用 manual 逃避「有风险」判断；本层不改变模型语义）。
 */
export function normalizeShellJudgeVerdict(input: unknown): ShellJudgeVerdict | undefined {
  if (!isRecord(input)) return undefined;
  const verdict = input.verdict;
  if (verdict !== "allow" && verdict !== "deny" && verdict !== "manual") return undefined;

  const reason = boundedJudgeText(input.reason);
  if (verdict === "allow" && reason === undefined) return undefined;

  const normalized: ShellJudgeVerdict = { verdict };
  if (reason !== undefined) normalized.reason = reason;
  const customerMessage = boundedJudgeText(input.customerMessage);
  if (customerMessage !== undefined) normalized.customerMessage = customerMessage;
  const evidence = normalizeEvidence(input.evidence);
  if (evidence !== undefined) normalized.evidence = evidence;
  const alternative = normalizeAlternative(input.alternative);
  if (alternative !== undefined) normalized.alternative = alternative;
  return normalized;
}

function containsExitLine(text: string): boolean {
  return text.includes("关闭") && text.includes("替我审批") && text.includes("重试");
}

/** 把标准出路并入已有说明：已含则不重复（PM 评审 §6.2「已含则不重复」）。 */
export function withSynthesizedExitLine(message: string): string {
  const trimmed = message.trim();
  if (trimmed === "") return SHELL_JUDGE_EXIT_LINE;
  if (containsExitLine(trimmed)) return trimmed;
  const separator = /[。！？.!?]$/.test(trimmed) ? "" : "。";
  return `${trimmed}${separator}${SHELL_JUDGE_EXIT_LINE}`;
}

/**
 * 合成可直接转述给客户的说明（`deny` 缺 `customerMessage` 或含内部行话时由驱动调用）。
 * 输出**保证**非空且含「关闭『替我审批』后重试」出路；不夹带内部行话/档位 token/凭据。
 */
export function synthesizeCustomerMessage(verdict: ShellJudgeVerdict): string {
  const existing = verdict.customerMessage?.trim();
  if (existing !== undefined && existing !== "" && !hasInternalJargon(existing)) {
    return withSynthesizedExitLine(existing);
  }
  const reason = verdict.reason?.trim();
  const core = reason !== undefined && reason !== "" && !hasInternalJargon(reason)
    ? `自动代理认为该命令存在系统风险或无法确认安全：${reason}`
    : "自动代理认为该命令存在系统风险或无法确认安全。";
  return withSynthesizedExitLine(core);
}

/**
 * 凭据脱敏（PM 评审 §6.2/§7.2 硬要求）：去掉 `RUNTIME_CREDENTIAL_ENV_VARS` 中**长度 ≥8** 的实际值、
 * Bearer/api-key 形态，并做有界截断。判断 agent 不得在 reason/customerMessage/alternative/evidence
 * 里复述凭据；驱动在返回前统一过这一层。
 */
export function redactJudgeText(
  text: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (typeof text !== "string" || text === "") return "";
  let out = text;
  for (const name of RUNTIME_CREDENTIAL_ENV_VARS) {
    const value = env[name];
    if (typeof value === "string" && value.length >= 8) out = out.split(value).join(REDACTED);
  }
  out = out
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/\b(api[-_]?key|token|secret|password|passwd)\s*[:=]\s*[^\s,;]{8,}/gi, `$1=${REDACTED}`);
  return boundedJudgeText(out) ?? "";
}

/** 判断结果里所有模型可写文本字段的脱敏（驱动返回前调用；空串/缺省保持缺省）。 */
export function redactJudgeVerdict(verdict: ShellJudgeVerdict, env?: Record<string, string | undefined>): ShellJudgeVerdict {
  const out: ShellJudgeVerdict = { verdict: verdict.verdict };
  const reason = verdict.reason !== undefined ? redactJudgeText(verdict.reason, env) : undefined;
  if (reason !== undefined && reason !== "") out.reason = reason;
  const customerMessage = verdict.customerMessage !== undefined ? redactJudgeText(verdict.customerMessage, env) : undefined;
  if (customerMessage !== undefined && customerMessage !== "") out.customerMessage = customerMessage;
  if (verdict.evidence !== undefined) {
    const evidence = verdict.evidence
      .map((item) => redactJudgeText(item, env))
      .filter((item) => item !== "")
      .slice(0, SHELL_JUDGE_EVIDENCE_LIMIT);
    if (evidence.length > 0) out.evidence = evidence;
  }
  if (verdict.alternative !== undefined) {
    const value = redactJudgeText(verdict.alternative.value, env);
    if (value !== "") {
      const alternative: ShellJudgeAlternative = { kind: verdict.alternative.kind, value };
      const rationale = verdict.alternative.rationale !== undefined ? redactJudgeText(verdict.alternative.rationale, env) : undefined;
      if (rationale !== undefined && rationale !== "") alternative.rationale = rationale;
      out.alternative = alternative;
    }
  }
  return out;
}
