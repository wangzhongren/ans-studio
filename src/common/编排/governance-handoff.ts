// src/common/编排/governance-handoff.ts
// 四角色 W6-A：意图交接（`hand_off_intent`）与澄清轮次（`request_clarification`）的**编排侧纯逻辑**。
//
// 依据：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
// §5.2（意图交接机械校验）、§5.4（澄清两轮上限）、§7.1–§7.2（账本事件与写入点）。
//
// 纪律（评审 §5.2，全部 fail-closed）：
//  - 本模块**不写盘、不发消息、不投递**；只读意图文件与治理账本并给出判定/回执文案。
//  - **意图文件是权威**：入参 `goal`/`scope`/`acceptance` 必须与 `docs/intents/<intentId>.md`
//    frontmatter **逐项相等**（去首尾空白后比较）；文件里的 `handoffKind`/`flowId` 若给出且与入参
//    不一致 → 拒绝。不猜测、不截断、不用模型的话覆盖文件。
//  - 去重：`intentId + handoffKind + sha256(原始文件字节)` 已成功交接 → 拒绝；`initial` 每个
//    `intentId` 仅一次；`clarification`/`revision` 必须已有同 `intentId` 的成功交接。
//  - 每轮一次：`turnId` 存在时按账本中同轮 `intent.handed-off` 拒绝第二次；缺失 → 降级为去重 +
//    `initial` 一次性，并在成功结果里返回 warning（调用方记诊断，不假装执行了每轮守卫）。
//  - 账本不可读/含坏行 → 拒绝（fail-closed），提示检查 `.ans/governance/ledger.jsonl`。
//  - 澄清：同一 `flowId`（无则同一 `intentId`）已有 **2 轮** `clarification.requested` → 拒绝，
//    提示在提案卡上请客户决定（带假设/备选）。
//
// 形状单一来源：`src/model/runtime.ts` 的 `HandOffIntentPayload`/`HandOffIntentKind`。
// 桌面窗口经 `src/pipeline/orchestration/govern-session.ts` 的薄再导出使用本模块（不直接导入私有 common）。

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GovernanceFunction, GovernanceModel } from "../../model/role.ts";
import type { HandOffIntentKind } from "../../model/runtime.ts";
import { readGovernanceLedger } from "./governance-ledger.ts";

/** 意图记录目录（项目相对；Liaison 唯一写区）。 */
export const INTENT_DIR_REL = "docs/intents";

/** 意图 id / flowId 共用的 slug 形状（与运行时核心工具 schema 同值）。 */
export const GOVERNANCE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** `summary` 上限（Unicode 码点；超长拒绝，不静默截断）。 */
export const INTENT_SUMMARY_MAX_CHARS = 200;

/** 同一 flow（无 flow 则同一 intent）最多澄清轮次（评审 §5.4）。 */
export const CLARIFICATION_MAX_ROUNDS = 2;

/** `hand_off_intent` 载荷中参与校验的字段（形状对齐 `model/runtime.ts` 的 `HandOffIntentPayload`）。 */
export interface IntentHandoffValidationInput {
  projectRoot: string;
  intentId: string;
  handoffKind: HandOffIntentKind;
  goal: string;
  scope: string;
  acceptance: string;
  summary: string;
  flowId?: string;
}

/**
 * 调用方（编排 `run-role.ts` / 桌面窗口）提供的会话上下文——**防御性再校验**与每轮一次守卫：
 *  - `governanceModel` 给出时必须是 `"trio"`（single 下 Liaison 结构性不可用）；
 *  - `governanceFunction` 给出时必须是 `"liaison"`（能力注入已保证，这里防误接）；
 *  - `turnId`/`sessionId` 用于「同一会话同一轮第二次成功交接」判定（缺失时降级并给出 warning）。
 */
export interface IntentHandoffValidationContext {
  governanceModel?: GovernanceModel;
  governanceFunction?: GovernanceFunction | null;
  roleId?: string;
  turnId?: string;
  sessionId?: string;
}

/** 校验结果：成功带文件哈希（应用算）与可审计路径；失败带可指导模型下一步的 code/message。 */
export type IntentHandoffValidation =
  | {
      ok: true;
      artifactPath: string;
      artifactSha256: string;
      flowId?: string;
      message: string;
      warnings?: string[];
    }
  | { ok: false; code: string; message: string };

/** 去重键（评审 §5.2 #6）：`intentId + handoffKind + 文件哈希`。 */
export function intentHandoffDedupeKey(input: {
  intentId: string;
  handoffKind: string;
  sha256: string;
}): string {
  return `${input.intentId}\u0000${input.handoffKind}\u0000${input.sha256}`;
}

/** 成功结果里的可审计路径。 */
export function intentArtifactPath(intentId: string): string {
  return `${INTENT_DIR_REL}/${intentId}.md`;
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_SLUG_PATTERN.test(value);
}

function textLength(value: string): number {
  return Array.from(value).length;
}

function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  }
  return value;
}

type FrontmatterParse =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; code: string; message: string };

/**
 * 解析意图文件 frontmatter（**顶层简单 `key: value`**；支持 `|`/`>` 块标量，不支持嵌套/列表）。
 * 文件必须以 `---` 行开头并有闭合 `---` 行；空行与 `#` 注释跳过；同名键后者覆盖前者。
 *
 * 块标量（2026-10-18 真机：客户原话 `customerQuote: |` 曾被误判「第 N 行无法解析」）：
 * · 标记 `|`（保留换行）或 `>`（折叠为空格），可带 chomping `-`/`+` 与可选缩进指示符（如 `|2-`）；
 * · 收集后续**缩进**行直到下一个顶层键/闭合 `---`/文件尾；块内 `#` 是正文，不是注释；
 * · 块内行去掉公共缩进（有缩进指示符时按其值）；chomping：`-` 去尾换行、`+` 保留、缺省单个换行。
 */
function blockScalarLines(lines: readonly string[]): { indent: number } {
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^[ \t]*/.exec(line)![0].length);
  return { indent: indents.length > 0 ? Math.min(...indents) : 0 };
}

/** `>` 折叠：相邻非空行以空格相连；空行按数量保留为换行（不额外多算一个）。 */
function foldBlockLines(lines: readonly string[]): string {
  let out = "";
  let pendingBlank = 0;
  let started = false;
  for (const line of lines) {
    if (line.trim() === "") {
      pendingBlank += 1;
      continue;
    }
    if (!started) {
      out += "\n".repeat(pendingBlank) + line;
      started = true;
    } else {
      out += (pendingBlank > 0 ? "\n".repeat(pendingBlank) : " ") + line;
    }
    pendingBlank = 0;
  }
  return out;
}

/** 把块标量内容行按样式/缩进/chomping 渲染为字段值。 */
function renderBlockScalar(
  style: "|" | ">",
  chomp: "-" | "+" | "",
  lines: readonly string[],
  indentIndicator: number | undefined,
): string {
  const common = blockScalarLines(lines);
  const indent = indentIndicator ?? common.indent;
  const stripped = lines.map((line) =>
    line.trim() === "" ? "" : line.slice(Math.min(indent, /^[ \t]*/.exec(line)![0].length)),
  );
  let trailingBlanks = 0;
  while (trailingBlanks < stripped.length && stripped[stripped.length - 1 - trailingBlanks]!.trim() === "") {
    trailingBlanks += 1;
  }
  const coreLines = stripped.slice(0, stripped.length - trailingBlanks);
  const core = style === ">" ? foldBlockLines(coreLines) : coreLines.join("\n");
  if (core === "") return chomp === "+" ? "\n".repeat(trailingBlanks) : "";
  if (chomp === "-") return core;
  if (chomp === "+") return core + "\n".repeat(1 + trailingBlanks);
  return core + "\n";
}

export function parseIntentFrontmatter(text: string): FrontmatterParse {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return {
      ok: false,
      code: "missing-frontmatter",
      message: "意图文件必须以 `---` 开头并在 frontmatter 内给出 intentId/goal/scope/acceptance。",
    };
  }
  const fields: Record<string, string> = {};
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      closed = true;
      break;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (match === null) {
      return {
        ok: false,
        code: "invalid-frontmatter",
        message: `意图文件 frontmatter 第 ${i + 1} 行无法解析（只支持顶层 key: value）。`,
      };
    }
    const rawValue = match[2].trim();
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
        // 空行属于块内容；非空且无缩进 ⇒ 块结束（下一个顶层键或闭合 `---`）。
        if (next.trim() !== "" && !/^[ \t]/.test(next)) break;
        content.push(next);
      }
      fields[match[1]] = renderBlockScalar(style, chomp, content, indentIndicator);
      i = j - 1; // 外层循环 i++ 后正好落在结束行
      continue;
    }
    fields[match[1]] = unquote(rawValue);
  }
  if (!closed) {
    return { ok: false, code: "missing-frontmatter", message: "意图文件 frontmatter 没有闭合的 `---`。" };
  }
  return { ok: true, fields };
}

/**
 * 机械校验意图交接（评审 §5.2 十条；任一不满足 → `ok:false`，**不投递、不写账本**）。
 * 只读文件与账本；不投递、不写盘。
 */
export async function validateIntentHandoff(
  input: IntentHandoffValidationInput,
  context: IntentHandoffValidationContext = {},
): Promise<IntentHandoffValidation> {
  // 1) 模型与角色（防御性再校验；调用方给出时生效）。
  if (context.governanceModel !== undefined && context.governanceModel !== "trio") {
    return {
      ok: false,
      code: "wrong-model",
      message: `意图交接只在三权治理模型（trio）下可用（当前 ${context.governanceModel}）；未交接。`,
    };
  }
  if (context.governanceFunction !== undefined && context.governanceFunction !== "liaison") {
    return {
      ok: false,
      code: "wrong-role",
      message: `意图交接只由联络官（liaison）发起（当前职能 ${context.governanceFunction ?? "未知"}）；未交接。`,
    };
  }

  // 2) slug 与四要素（防路径穿越；summary 非空且 ≤200 字，超长拒绝、不截断）。
  if (!isSlug(input.intentId)) {
    return {
      ok: false,
      code: "invalid-intent-id",
      message: `intentId「${input.intentId}」不是合法 slug（应为小写字母/数字/连字符，2–64 字符）；未交接。`,
    };
  }
  const goal = trimValue(input.goal);
  const scope = trimValue(input.scope);
  const acceptance = trimValue(input.acceptance);
  const summary = trimValue(input.summary);
  for (const [name, value] of [
    ["goal", goal],
    ["scope", scope],
    ["acceptance", acceptance],
  ] as const) {
    if (value === "") {
      return {
        ok: false,
        code: "missing-field",
        message: `意图缺少 ${name}（四要素必须非空）；请先向客户澄清并更新 docs/intents/${input.intentId}.md，未交接。`,
      };
    }
  }
  if (summary === "") {
    return { ok: false, code: "summary-invalid", message: "summary 不能为空（1..200 字）；未交接。" };
  }
  if (textLength(summary) > INTENT_SUMMARY_MAX_CHARS) {
    return {
      ok: false,
      code: "summary-too-long",
      message: `summary 超过 ${INTENT_SUMMARY_MAX_CHARS} 字（${textLength(summary)} 字）——未交接；请压缩后重试（不会静默截断）。`,
    };
  }
  if (input.flowId !== undefined && !isSlug(input.flowId)) {
    return {
      ok: false,
      code: "invalid-flow-id",
      message: `flowId「${input.flowId}」不是合法 slug；未交接。`,
    };
  }

  // 3) 文件存在、可读、UTF-8。
  const artifactPath = intentArtifactPath(input.intentId);
  const absPath = path.join(input.projectRoot, INTENT_DIR_REL, `${input.intentId}.md`);
  let bytes: Buffer;
  try {
    bytes = await readFile(absPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        code: "missing-file",
        message: `意图文件 ${artifactPath} 不存在；请先写出意图记录（或检查 intentId），未交接。`,
      };
    }
    return {
      ok: false,
      code: "unreadable-file",
      message: `意图文件 ${artifactPath} 不可读：${err instanceof Error ? err.message : String(err)}；未交接。`,
    };
  }
  const text = bytes.toString("utf8");

  // 4) frontmatter 与文件权威。
  const parsed = parseIntentFrontmatter(text);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };
  const fields = parsed.fields;
  if (trimValue(fields["intentId"]) !== input.intentId) {
    return {
      ok: false,
      code: "intent-id-mismatch",
      message: `意图文件 frontmatter 的 intentId「${fields["intentId"] ?? "缺"}」与入参「${input.intentId}」不一致；未交接。`,
    };
  }
  for (const [name, value] of [
    ["goal", goal],
    ["scope", scope],
    ["acceptance", acceptance],
  ] as const) {
    const fileValue = trimValue(fields[name]);
    if (fileValue === "") {
      return {
        ok: false,
        code: "missing-field",
        message: `意图文件 ${artifactPath} 缺少 ${name}；请先更新文件，未交接。`,
      };
    }
    if (fileValue !== value) {
      return {
        ok: false,
        code: "input-file-mismatch",
        message:
          `入参 ${name} 与意图文件 ${artifactPath} 不一致（文件是权威）——请按文件内容更正入参，未交接；` +
          "不要用聊天转述覆盖文件。",
      };
    }
  }
  const fileKind = trimValue(fields["handoffKind"]);
  if (fileKind !== "" && fileKind !== input.handoffKind) {
    return {
      ok: false,
      code: "handoff-kind-mismatch",
      message: `意图文件 handoffKind「${fileKind}」与入参「${input.handoffKind}」不一致；未交接。`,
    };
  }
  const fileFlowId = trimValue(fields["flowId"]);
  if (fileFlowId !== "" && input.flowId !== undefined && fileFlowId !== input.flowId) {
    return {
      ok: false,
      code: "flow-id-mismatch",
      message: `意图文件 flowId「${fileFlowId}」与入参「${input.flowId}」不一致；未交接。`,
    };
  }
  const flowId = input.flowId ?? (fileFlowId !== "" && isSlug(fileFlowId) ? fileFlowId : undefined);
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");

  // 5) 账本可读（dedupe / initial / 每轮一次都依赖账本；不可读 → fail-closed）。
  const ledger = await readGovernanceLedger(input.projectRoot);
  if (ledger.errors.length > 0) {
    return {
      ok: false,
      code: "ledger-unreadable",
      message:
        `治理账本不可读（${ledger.errors[0]}）——无法判定重复/轮次；未交接。` +
        "请检查 .ans/governance/ledger.jsonl。",
    };
  }
  const handoffs = ledger.entries.filter((entry) => entry.kind === "intent.handed-off");

  // 6) 去重：同一 intentId + handoffKind + 文件哈希已成功交接 → 拒绝。
  const dedupeKey = intentHandoffDedupeKey({
    intentId: input.intentId,
    handoffKind: input.handoffKind,
    sha256: artifactSha256,
  });
  if (
    handoffs.some(
      (entry) =>
        entry.intentId === input.intentId &&
        entry.handoffKind === input.handoffKind &&
        entry.artifactSha256 === artifactSha256 &&
        intentHandoffDedupeKey({
          intentId: entry.intentId ?? "",
          handoffKind: entry.handoffKind ?? "",
          sha256: entry.artifactSha256 ?? "",
        }) === dedupeKey,
    )
  ) {
    return {
      ok: false,
      code: "duplicate",
      message: "同一意图已交接，不重复派发；如需求变化请用 clarification/revision（并更新意图文件），未交接。",
    };
  }

  // 7) initial 每个 intentId 仅一次。
  if (input.handoffKind === "initial" && handoffs.some((entry) => entry.intentId === input.intentId)) {
    return {
      ok: false,
      code: "initial-exists",
      message:
        `意图「${input.intentId}」已有成功交接，initial 仅一次；需求变化请用 clarification/revision，` +
        "新一轮工作请写新 intentId，未交接。",
    };
  }

  // 8) clarification/revision 必须已有同 intentId 的成功交接。
  if (
    input.handoffKind !== "initial" &&
    !handoffs.some((entry) => entry.intentId === input.intentId)
  ) {
    return {
      ok: false,
      code: "no-prior-handoff",
      message:
        `意图「${input.intentId}」还没有成功交接，不能用 ${input.handoffKind} 修订；` +
        "请先用 initial 交接，未交接。",
    };
  }

  // 9) 每轮一次：同会话同一轮第二次成功交接 → 拒绝；turnId 缺失 → 降级并如实 warning。
  const warnings: string[] = [];
  if (context.turnId !== undefined && context.turnId !== "") {
    const sameTurn = handoffs.some((entry) => {
      if (entry.turnId !== context.turnId) return false;
      if (context.sessionId === undefined || entry.sessionId === undefined) return true;
      return entry.sessionId === context.sessionId;
    });
    if (sameTurn) {
      return {
        ok: false,
        code: "turn-limit",
        message: "同一轮已交接过一次意图（每轮至多一次）；未交接；请在本轮结束后再交接。",
      };
    }
  } else {
    warnings.push("未收到 turnId：每轮一次守卫降级为去重 + initial 一次性（诊断）。");
  }

  return {
    ok: true,
    artifactPath,
    artifactSha256,
    ...(flowId !== undefined ? { flowId } : {}),
    message: `意图记录 ${artifactPath} 校验通过（handoffKind=${input.handoffKind}）。`,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** 澄清轮次统计目标（至少一个；`flowId` 优先，与评审 §5.4 一致）。 */
export interface ClarificationRoundTarget {
  flowId?: string;
  intentId?: string;
}

export type ClarificationRoundCount =
  | { ok: true; rounds: number; scope: "flow" | "intent" }
  | { ok: false; message: string };

/**
 * 读账本统计同一 `flowId`（无则同一 `intentId`）的 `clarification.requested` 条数。
 * 账本不可读/坏行 → `ok:false`（fail-closed：宁可拒绝澄清，也不无限追问客户）。
 */
export async function countClarificationRounds(
  projectRoot: string,
  target: ClarificationRoundTarget,
): Promise<ClarificationRoundCount> {
  if (target.flowId === undefined && target.intentId === undefined) {
    return { ok: false, message: "澄清请求缺少 flowId/intentId，无法判定轮次；未提交。" };
  }
  const ledger = await readGovernanceLedger(projectRoot);
  if (ledger.errors.length > 0) {
    return {
      ok: false,
      message:
        `治理账本不可读（${ledger.errors[0]}）——为避免超过 ${CLARIFICATION_MAX_ROUNDS} 轮澄清，本次拒绝提交；` +
        "请检查 .ans/governance/ledger.jsonl。",
    };
  }
  const scope = target.flowId !== undefined ? "flow" : "intent";
  const rounds = ledger.entries.filter(
    (entry) =>
      entry.kind === "clarification.requested" &&
      (target.flowId !== undefined ? entry.flowId === target.flowId : entry.intentId === target.intentId),
  ).length;
  return { ok: true, rounds, scope };
}
