// src/common/shared/intent-entry-contract.ts
// 2026-10-30（§5A 意图入口契约可见性）：意图入口的**单一来源**契约文本与只读解析。
//
// 用途（同一份常量，禁止各写一份）：
//   · 内置角色卡（chief/product/rapporteur/nominator）的格式/命名/检查职责；
//   · `contract_check` 的按角色契约摘要与当前项目意图入口事实；
//   · 判断拒绝文案（missing-frontmatter / intentId 不一致）附带模板与命名规则。
//
// 事实源：产品意图文档 frontmatter 的 intentId 是命名起点；proposal frontmatter 必须原样复制；
// 意图入口文件固定为 `docs/intents/<intentId>.md`。本模块只做纯文本/只读文件解析，不写盘、不判语义。

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";

export const INTENT_ENTRY_DIR = "docs/intents";

/** 意图 id 命名规则（与治理 slug 同一 pattern）。 */
export const INTENT_ENTRY_ID_RULE = `intentId 必须是 ${GOVERNANCE_SLUG_PATTERN} 的小写 slug；不得用 flowId 代替。`;

/** 意图入口命名/来源规则（角色卡 / contract_check / 拒绝文案同源）。 */
export const INTENT_ENTRY_NAMING_RULE =
  `命名与来源：入口文件为 \`${INTENT_ENTRY_DIR}/<intentId>.md\`；${INTENT_ENTRY_ID_RULE}` +
  " intentId 先写入产品意图文档 frontmatter，再由提案 frontmatter 原样复制；两处与意图入口文件名必须一致。";

/** YAML frontmatter 模板（单行 key: value；长文本可用 YAML block scalar `|`）。 */
export const INTENT_ENTRY_TEMPLATE = [
  "---",
  "intentId: <小写 slug；全文唯一；不得用 flowId 代替>",
  "flowId: <flowId>",
  "goal: <目标；单行 key: value，长文本可用 | block scalar>",
  "scope: <范围>",
  "acceptance: <验收标准>",
  "nonGoals: <非目标（可选）>",
  "constraints: <约束（可选）>",
  "---",
].join("\n");

export type IntentContractRole = "chief" | "product" | "rapporteur" | "nominator";

const ROLE_DUTY: Record<IntentContractRole, string> = {
  chief:
    "意图入口（你是唯一写者）：写 `docs/intents/<intentId>.md` 时照抄下方模板；intentId 取自产品意图文档 frontmatter 的 intentId（小写 slug、全文唯一），不得用 flowId 代替，也不得自造。",
  product:
    "意图入口：产品意图文档 `docs/product/<flowId>-intent-vN.md` 必须含 YAML frontmatter，至少 `intentId`/`flowId`/`version`；intentId 为小写 slug 且全文唯一，并作为 `docs/intents/<intentId>.md` 的命名依据（正文目标/范围/验收等照旧）。",
  rapporteur:
    "意图入口：提案 frontmatter 必须含 `intentId`，从产品意图文档 frontmatter 原样复制（不得自造/改写），并与 roster/architecture 引用的 intent 版本指向同一 intentId；缺 intentId 时不得假定 flowId 就是 intentId。",
  nominator:
    "意图入口检查（提交 appointment 前）：先确认产品意图 frontmatter 的 intentId、提案 frontmatter 的 intentId 与 `docs/intents/<intentId>.md` 文件名三者一致且文件存在；不一致/缺失 → 不发 D3、不写卡，退回幕僚让产品/策划修正。你不写意图，但必须知道格式与定位方法。",
};

/** 角色卡用：角色职责 + 命名规则 + 模板（同一份常量）。 */
export function intentEntryContractText(role: IntentContractRole): string {
  return [`${ROLE_DUTY[role]}`, INTENT_ENTRY_NAMING_RULE, "模板：", INTENT_ENTRY_TEMPLATE].join("\n");
}

/** 判断拒绝文案用：命名规则 + 模板片段（与角色卡同源）。 */
export function intentEntryRejectionHint(): string {
  return `${INTENT_ENTRY_NAMING_RULE}\n模板：\n${INTENT_ENTRY_TEMPLATE}`;
}

/** 意图 id 形状校验（不做归一化；非法即 undefined）。 */
export function isValidIntentId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${GOVERNANCE_SLUG_PATTERN}$`).test(value);
}

/** 从文本 frontmatter 读取顶层 `intentId`（单行/引号值；不解析正文）。 */
export function intentIdFromFrontmatter(text: string | undefined): string | undefined {
  if (typeof text !== "string") return undefined;
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0]!.trim() !== "---") return undefined;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line === "---") break;
    const match = /^intentId\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    let value = match[1]!.trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value === "" ? undefined : value;
  }
  return undefined;
}

export interface IntentEntryFacts {
  productIntentPath?: string;
  productIntentId?: string;
  proposalPath?: string;
  proposalIntentId?: string;
  /** 产品意图优先；缺失时用提案 frontmatter（与判断定位口径一致）。 */
  resolvedIntentId?: string;
  /** 期望的意图入口文件（`docs/intents/<intentId>.md`）。 */
  intentEntryPath?: string;
  intentEntryExists?: boolean;
  intentEntryIntentId?: string;
  /** 产品意图与提案的 intentId 是否一致；任一侧缺失 ⇒ undefined。 */
  intentIdsMatch?: boolean;
  /** 入口文件 intentId 是否等于解析到的 intentId；文件缺失/无 frontmatter ⇒ undefined。 */
  entryMatches?: boolean;
}

async function readText(projectRoot: string, rel: string | undefined, readFileFn: typeof readFile): Promise<string | undefined> {
  if (rel === undefined || rel.trim() === "") return undefined;
  try {
    return await readFileFn(path.join(projectRoot, ...rel.split("/")), "utf8") as string;
  } catch {
    return undefined;
  }
}

async function latestVersioned(
  projectRoot: string,
  dir: string,
  flowId: string,
  kind: string,
  readdirFn: typeof readdir,
): Promise<string | undefined> {
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-${kind}-v(\\d+)\\.md$`);
  let names: string[];
  try {
    names = await readdirFn(path.join(projectRoot, ...dir.split("/")));
  } catch {
    return undefined;
  }
  let best: { version: number; name: string } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (best === undefined || version > best.version) best = { version, name };
  }
  return best === undefined ? undefined : `${dir}/${best.name}`;
}

/**
 * 只读解析当前项目的意图入口事实。显式路径（如 pinned run 的 documents.intent/proposal）优先；
 * 否则按 `<flowId>-intent-vN.md` / `<flowId>-proposal-vN.md` 取最新版本。不猜、不写。
 */
export async function readIntentEntryFacts(input: {
  projectRoot: string;
  flowId: string;
  productIntentPath?: string;
  proposalPath?: string;
  readdirFn?: typeof readdir;
  readFileFn?: typeof readFile;
}): Promise<IntentEntryFacts> {
  const readdirFn = input.readdirFn ?? readdir;
  const readFileFn = input.readFileFn ?? readFile;
  const flowId = input.flowId.trim();
  if (flowId === "") return {};
  const productIntentPath = input.productIntentPath ?? await latestVersioned(input.projectRoot, "docs/product", flowId, "intent", readdirFn);
  const proposalPath = input.proposalPath ?? await latestVersioned(input.projectRoot, "docs/proposals", flowId, "proposal", readdirFn);
  const productText = await readText(input.projectRoot, productIntentPath, readFileFn);
  const proposalText = await readText(input.projectRoot, proposalPath, readFileFn);
  const productRawIntentId = intentIdFromFrontmatter(productText);
  const proposalRawIntentId = intentIdFromFrontmatter(proposalText);
  // 只有合法 slug 才用于拼 `docs/intents/<intentId>.md`，防止文档内自报路径穿越。
  const productIntentId = isValidIntentId(productRawIntentId) ? productRawIntentId : undefined;
  const proposalIntentId = isValidIntentId(proposalRawIntentId) ? proposalRawIntentId : undefined;
  const resolvedIntentId = productIntentId ?? proposalIntentId;
  const intentEntryPath = resolvedIntentId !== undefined ? `${INTENT_ENTRY_DIR}/${resolvedIntentId}.md` : undefined;
  const entryText = await readText(input.projectRoot, intentEntryPath, readFileFn);
  const intentEntryIntentId = intentIdFromFrontmatter(entryText);
  return {
    ...(productIntentPath !== undefined ? { productIntentPath } : {}),
    ...(productIntentId !== undefined ? { productIntentId } : {}),
    ...(proposalPath !== undefined ? { proposalPath } : {}),
    ...(proposalIntentId !== undefined ? { proposalIntentId } : {}),
    ...(resolvedIntentId !== undefined ? { resolvedIntentId } : {}),
    ...(intentEntryPath !== undefined ? { intentEntryPath } : {}),
    ...(intentEntryPath !== undefined ? { intentEntryExists: entryText !== undefined } : {}),
    ...(intentEntryIntentId !== undefined ? { intentEntryIntentId } : {}),
    ...(productIntentId !== undefined && proposalIntentId !== undefined ? { intentIdsMatch: productIntentId === proposalIntentId } : {}),
    ...(resolvedIntentId !== undefined && intentEntryIntentId !== undefined ? { entryMatches: intentEntryIntentId === resolvedIntentId } : {}),
  };
}
