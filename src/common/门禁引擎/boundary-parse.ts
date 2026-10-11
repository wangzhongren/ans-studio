// 门禁引擎私有辅助：把边界文档（Markdown）的 Section 1 表格解析为 BoundaryEntry[]
// 支持中文与英文的类型标签；解析失败的行跳过（宽松解析）。

import type { BoundaryEntry, EntryKind, Root } from "../../model/boundary.ts";
import { isValidConditionSlug } from "../../model/boundary.ts";
import { normalizeLexical } from "./paths.ts";

/** 类型列 → EntryKind；无法识别返回 null */
function classifyKind(cell: string): EntryKind | null {
  const c = cell.toLowerCase();
  // 先判"条件"，因为"条件目录"同时含"目录"
  if (c.includes("条件") || c.includes("conditional")) return "conditional-directory";
  if (c.includes("目录") || c.includes("directory") || c.includes("folder")) return "directory";
  if (c.includes("单文件") || c.includes("文件") || c.includes("file")) return "file";
  return null;
}

/** 从路径列抽取路径：优先反引号内的首个条目，否则取整格并去掉说明 */
function extractPath(cell: string): string {
  const tick = /`([^`]+)`/.exec(cell);
  let p = tick ? tick[1] : cell;
  p = p.replace(/[（(].*$/s, "").trim(); // 去掉括号说明
  p = p.split(/\s+or\s+/i)[0].trim(); // "a or b" 取 a
  p = p.trim();
  if (!p) return "";
  return normalizeLexical(p);
}

/** 是否为表格分隔行（--- / :---:） */
function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c));
}

/** 类型关键词，避免把它们误当作 slug */
const KIND_TOKENS = new Set([
  "file",
  "directory",
  "folder",
  "conditional",
  "conditional-directory",
  "单文件",
  "文件",
  "目录",
  "条件",
  "条件目录",
]);

/**
 * 从一行抽取 conditional-directory 的 slug。
 * 来源：类型列（如 "条件目录 `role-restructuring`"）与额外列；
 * 散文说明不参与。找不到合法 slug 返回 ""（视为解析失败）。
 */
function extractConditionSlug(cells: string[]): string {
  const candidates: string[] = [];
  const collect = (text: string): void => {
    for (const m of text.matchAll(/`([^`]+)`/g)) candidates.push(m[1].trim());
    for (const tok of text.split(/[\s,;:()[\]（）【】]+/)) {
      const t = tok.trim();
      if (t) candidates.push(t);
    }
  };
  collect(cells[0] ?? ""); // 类型列
  for (let i = 3; i < cells.length; i++) collect(cells[i]); // 额外列
  for (const c of candidates) {
    if (KIND_TOKENS.has(c)) continue;
    if (isValidConditionSlug(c)) return c;
  }
  return "";
}

/**
 * 解析边界文档，抽取 "Section 1: 可修改文件与目录" 下的表格行。
 * defaultRoot 为本边界文档内条目默认所属的根（由文件位于哪个根决定）。
 */
export function parseBoundarySection1(markdown: string, defaultRoot: Root): BoundaryEntry[] {
  const entries: BoundaryEntry[] = [];
  const lines = markdown.split(/\r?\n/);
  let inSection1 = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 标题行：进入/离开 Section 1
    if (/^#{1,6}\s/.test(trimmed)) {
      if (/section\s*1/i.test(trimmed) || /可修改文件与目录/.test(trimmed)) {
        inSection1 = true;
      } else if (inSection1) {
        // 遇到任何后续标题即结束 Section 1
        inSection1 = false;
      }
      continue;
    }
    if (!inSection1) continue;
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    if (isSeparatorRow(cells)) continue;

    const [typeCell, pathCell, purposeCell] = cells;
    if (/^(类型|type)$/i.test(typeCell)) continue; // 表头

    const kind = classifyKind(typeCell);
    if (!kind) continue;
    const path = extractPath(pathCell);
    if (!path) continue;

    const entry: BoundaryEntry = {
      root: defaultRoot,
      path,
      kind,
      purpose: purposeCell,
    };
    if (kind === "conditional-directory") {
      // condition 必须为固定格式 slug；缺 slug 或格式非法 → 解析失败，不放行。
      const slug = extractConditionSlug(cells);
      if (!isValidConditionSlug(slug)) continue;
      entry.condition = slug;
    }
    entries.push(entry);
  }

  return entries;
}
