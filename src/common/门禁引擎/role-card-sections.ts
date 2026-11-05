// 门禁引擎私有：角色卡结构化章节解析（治理权力矩阵 C1a；共享解析的唯一实现）。
//
// 消费者纪律（`角色卡/门禁引擎/api-spec.md`）：外部消费者不得导入本私有解析器，也不得自行解析
// `cardText`——跨角色只经 `src/service/role/resolve-role.ts` 的公开出口
// `ProjectRoleSummary.cardSections` 消费。
//
// 单一来源：章节标签与匹配规则只从 `ROLE_CARD_REQUIRED_SECTIONS`（governance-roles.ts）按 label
// 取得，不复制第二份规则表。本文件为**纯函数**：无 I/O、无权限、无判定。

import { ROLE_CARD_REQUIRED_SECTIONS } from "./governance-roles.ts";

/** 矩阵渲染的 worker 数据块分隔标记（单一来源；矩阵渲染器同样从这里导入）。 */
export const ROLE_DATA_BLOCK_START_PREFIX = "--- 角色数据开始：";
export const ROLE_DATA_BLOCK_END = "--- 角色数据结束 ---";

/** 角色卡结构化章节（仅展示用；不含原始 cardText）。 */
export interface RoleCardSections {
  /** 首个一级标题（H1）文本：worker 的 displayName 来源（经 listing 公开字段映射）。 */
  title?: string;
  /** 「能力描述」。 */
  ability?: string;
  /** 「职责与功能导航」。 */
  responsibility?: string;
  /** 「交接输入输出」。 */
  handoff?: string;
  /** 「标准工作流」。 */
  workflow?: string;
  /** 「执行原则」（只取短摘录，不注入长文）。 */
  executionPrinciples?: string;
}

/** 章节字段 → `ROLE_CARD_REQUIRED_SECTIONS` 的 label（label 是单一来源；规则仍取该常量的 test）。 */
const SECTION_FIELDS: ReadonlyArray<{
  label: string;
  field: "ability" | "responsibility" | "handoff" | "workflow" | "executionPrinciples";
}> = [
  { label: "能力描述", field: "ability" },
  { label: "职责与功能导航", field: "responsibility" },
  { label: "交接输入输出", field: "handoff" },
  { label: "标准工作流", field: "workflow" },
  { label: "执行原则", field: "executionPrinciples" },
];

const TITLE_MAX_CODEPOINTS = 200;
const SECTION_MAX_CODEPOINTS = 4000;

/** 按 Unicode 码点截断（避免截断代理对）；超长追加原长说明。 */
function truncateCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return `${points.slice(0, max).join("")}…（已截断，原长 ${points.length}）`;
}

/** 去掉矩阵渲染块分隔标记，防止角色卡文本伪造块边界。 */
export function stripRoleDataMarkers(text: string): string {
  const withoutStart = text.replace(/---\s*角色数据开始：[^\n]*---/g, "[marker removed]");
  return withoutStart.replace(/---\s*角色数据结束\s*---/g, "[marker removed]");
}

/** 规范化章节文本：CRLF→LF、去控制字符（保留 \n/\t）、折叠 3+ 空行、修剪首尾空白。 */
function normalizeSectionText(raw: string): string {
  const unified = raw.replace(/\r\n?/g, "\n");
  const withoutControls = unified.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const withoutMarkers = stripRoleDataMarkers(withoutControls);
  const collapsed = withoutMarkers.replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

interface HeadingRecord {
  level: number;
  text: string;
  lineIndex: number;
}

/** 扫描 Markdown 标题（忽略 fenced code block 内的 `#` 行）。 */
function scanHeadings(lines: readonly string[]): HeadingRecord[] {
  const headings: HeadingRecord[] = [];
  let fence: "```" | "~~~" | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (fence !== null) {
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (trimmed.startsWith("```")) {
      fence = "```";
      continue;
    }
    if (trimmed.startsWith("~~~")) {
      fence = "~~~";
      continue;
    }
    const match = /^(#{1,6})[ \t]+(.*)$/.exec(lines[i]);
    if (match === null) continue;
    const text = match[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
    if (text === "") continue;
    headings.push({ level: match[1].length, text, lineIndex: i });
  }
  return headings;
}

function requiredSectionTest(label: string): RegExp | undefined {
  return ROLE_CARD_REQUIRED_SECTIONS.find((section) => section.label === label)?.test;
}

/**
 * 解析角色卡的结构化章节。
 *
 * 规则：
 * - 标题行 `#{1,6} + 空白 + 标题`；忽略 fenced code block（``` / ~~~）内的行。
 * - H1 取首个一级标题作为 `title`。
 * - 每个字段取**第一个**匹配 `ROLE_CARD_REQUIRED_SECTIONS` 对应 label 规则的非 H1 标题；
 *   正文到下一个层级 ≤ 当前标题的标题为止（更深子标题保留）。
 * - 空/仅空白的正文视为缺失（undefined），不产生空 known 值。
 * - `title` ≤ 200 码点；每章节 ≤ 4,000 码点（超长截断并标注原长）。
 */
export function parseRoleCardSections(cardText: string): RoleCardSections {
  const lines = cardText.split(/\r\n?|\n/);
  const headings = scanHeadings(lines);
  const result: RoleCardSections = {};

  const titleHeading = headings.find((heading) => heading.level === 1);
  if (titleHeading !== undefined) {
    const title = normalizeSectionText(titleHeading.text);
    if (title !== "") result.title = truncateCodePoints(title, TITLE_MAX_CODEPOINTS);
  }

  for (const { label, field } of SECTION_FIELDS) {
    const test = requiredSectionTest(label);
    if (test === undefined) continue; // 常量缺该 label：按缺失处理，不复制规则兜底
    const heading = headings.find((candidate) => candidate.level > 1 && test.test(candidate.text));
    if (heading === undefined) continue;
    const next = headings.find(
      (candidate) => candidate.lineIndex > heading.lineIndex && candidate.level <= heading.level,
    );
    const bodyEnd = next === undefined ? lines.length : next.lineIndex;
    const body = normalizeSectionText(lines.slice(heading.lineIndex + 1, bodyEnd).join("\n"));
    if (body === "") continue;
    result[field] = truncateCodePoints(body, SECTION_MAX_CODEPOINTS);
  }

  return result;
}
