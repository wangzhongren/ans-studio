/**
 * 角色资料“文档”分组的纯展示逻辑（role-root-docs-display S4）。
 *
 * - 根文档：只按后端 `RoleView.rootDocs` 数组原顺序展示（白名单与顺序由主进程
 *   索引给出）；`path` 是项目相对路径，只用于与 opaque `documents[].relativePath`
 *   精确匹配，渲染层不拼文件系统路径、不生成 `documentId`。
 * - `docs/`：内容/顺序沿用既有 `docs` 索引（角色相对），目录带尾 `/`。
 * - 计数：根文档 file 数 + `docs` 中 file 数；目录不计。
 * - 空态：两组都没有条目才为空（有根文档但没有 docs 时不显示“无 docs/”整节空）。
 * - `memo.md`、`role-card.md`、`boundary.yaml`/`boundary.md` 是显示兜底排除
 *   （安全边界在 Service/Provider：memo 不入索引、非法候选不铸造引用）。
 * - 无 DOM/无 Node/fs/electron/网络。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";
import type { DocumentRef } from "./document-view.ts";

/** 根文档行（只保留展示所需字段；不含正文）。 */
export interface RootDocItem {
  /** 展示文件名（后端 `name`；缺失时取 `path` 末段，仅显示）。 */
  name: string;
  /** 项目相对路径（精确匹配 opaque ref 用；不拼文件系统路径）。 */
  path: string;
}

/** `docs/` 条目（路径基准仍是角色目录；与根文档不混用）。 */
export interface DocsGroupEntry {
  path: string;
  kind: "file" | "directory";
}

export interface ProfileDocsView {
  rootDocs: RootDocItem[];
  docsEntries: DocsGroupEntry[];
  /** `docs` 中 file 数（目录不计）。 */
  docsFiles: number;
  /** 节 count：根文档数 + docs file 数。 */
  count: number;
  /** 两组都为空（含内置角色/无根文档且无 docs 的角色）。 */
  isEmpty: boolean;
}

/** 可选副标签：文件名 → S5 key（文件名本身不翻译）。 */
export const ROOT_DOC_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  "feature-map.md": "ui.profile.rootDoc.featureMap",
  "functional-description.md": "ui.profile.rootDoc.functionalDescription",
  "api-spec.md": "ui.profile.rootDoc.apiSpec",
};

/** 显示兜底排除：这几类路径已有专门栏或明确不展示（memo）。 */
const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  "memo.md",
  "role-card.md",
  "boundary.yaml",
  "boundary.md",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 仅显示用的文件名：优先后端 `name`，否则取 `path` 末段（不构造路径）。 */
export function rootDocDisplayName(entry: Record<string, unknown>): string {
  const name = asString(entry.name).trim();
  if (name) return name;
  const path = asString(entry.path);
  const index = path.lastIndexOf("/");
  return (index >= 0 ? path.slice(index + 1) : path).trim();
}

function pathTailName(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

/**
 * 根文档显示列表：按后端顺序；过滤空 `path`、`kind === "directory"`、
 * `memo.md`/role-card/boundary 显示兜底与重复路径；不排序、不补占位。
 */
export function roleRootDocs(role: unknown): RootDocItem[] {
  const record = asRecord(role);
  const list = Array.isArray(record.rootDocs) ? record.rootDocs : [];
  const items: RootDocItem[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const entry = asRecord(raw);
    const path = asString(entry.path);
    if (!path.trim()) continue;
    if (entry.kind === "directory") continue;
    const name = rootDocDisplayName(entry);
    if (!name) continue;
    if (EXCLUDED_NAMES.has(name) || EXCLUDED_NAMES.has(pathTailName(path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    items.push({ name, path });
  }
  return items;
}

/** `docs/` 显示条目：保持后端顺序；畸形条目丢弃；路径原样（角色相对）。 */
export function roleDocsEntries(role: unknown): DocsGroupEntry[] {
  const record = asRecord(role);
  const list = Array.isArray(record.docs) ? record.docs : [];
  const entries: DocsGroupEntry[] = [];
  for (const raw of list) {
    const entry = asRecord(raw);
    const path = asString(entry.path);
    if (!path) continue;
    entries.push({ path, kind: entry.kind === "directory" ? "directory" : "file" });
  }
  return entries;
}

/** “文档”节视图模型：两组、计数与空态由同一处判定。 */
export function profileDocsView(role: unknown): ProfileDocsView {
  const rootDocs = roleRootDocs(role);
  const docsEntries = roleDocsEntries(role);
  const docsFiles = docsEntries.filter((entry) => entry.kind === "file").length;
  return {
    rootDocs,
    docsEntries,
    docsFiles,
    count: rootDocs.length + docsFiles,
    isEmpty: rootDocs.length === 0 && docsEntries.length === 0,
  };
}

/** `docs/` 组的既有 Markdown 列表（目录带尾 `/`；只展示，不解析路径）。 */
export function docsIndexMarkdown(entries: readonly DocsGroupEntry[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((entry) => "- " + entry.path + (entry.kind === "directory" ? "/" : ""))
    .join("\n");
}

/** 根文档副标签 key（仅三个白名单文件名有；其余返回 null）。 */
export function rootDocLabelKey(name: string): MessageKey | null {
  return ROOT_DOC_LABEL_KEYS[name] || null;
}

/** 根文档按钮 title/aria：`ui.profile.openRootDoc` + 原样文件名。 */
export function rootDocOpenText(
  name: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.profile.openRootDoc", { name });
}

/**
 * 按 `relativePath` 精确匹配 opaque 引用（不构造路径、不生成 documentId）。
 * 未命中返回 null（调用方停留列表态并展示既有结构化错误）。
 */
export function matchDocumentRefByPath(
  refs: readonly DocumentRef[],
  relativePath: string,
): DocumentRef | null {
  if (!relativePath) return null;
  return refs.find((ref) => ref.relativePath === relativePath) || null;
}
