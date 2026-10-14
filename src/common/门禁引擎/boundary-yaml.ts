// 门禁引擎私有辅助：边界文档 YAML 固定格式解析（严格校验，fail-closed）
// 任一违规 → 抛错，由 boundary-core 转成"边界解析失败"，resolveWrite 对一切写入拒绝。
// 注意：不要只丢弃出错条目继续放行——那会让坏配置静默变成"没写就没权限"。
// 顶层键：role / entries / archived（客户 2026-10-14 归档约定——archived: true 表示该角色目录为
// 冻结归档；解析器只负责如实回传该标记，跳过/拒绝语义在 resolve-role 与 boundary-core）。

import { parse as parseYaml } from "yaml";
import type { BoundaryEntry, EntryKind, Root } from "../../model/boundary.ts";
import { isValidConditionSlug } from "../../model/boundary.ts";
import { normalizeLexical } from "./paths.ts";

const KINDS = new Set(["file", "directory", "conditional-directory"]);
const ROOTS = new Set(["project", "skill"]);
const TOP_KEYS = new Set(["role", "entries", "archived"]);
const ENTRY_KEYS = new Set(["kind", "path", "purpose", "root", "condition"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(msg: string): never {
  throw new Error(msg);
}

/** 严格解析边界 YAML；任何违规抛错（整个边界视为解析失败） */
export function parseBoundaryYaml(text: string): BoundaryEntry[] {
  return parseBoundaryYamlDoc(text).entries;
}

/** 解析结果的完整文档形态：条目 + 顶层归档标记（archived: true 时给出；否则不出现该字段）。
 *  `archived` 严格校验为布尔——`archived: "true"`（字符串）等一律解析失败，不给模糊地带。 */
export function parseBoundaryYamlDoc(text: string): { entries: BoundaryEntry[]; archived?: boolean } {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    return fail(`YAML 语法错误：${(err as Error).message}`);
  }
  if (!isPlainObject(doc)) fail("顶层必须是映射（mapping）");

  const top = doc as Record<string, unknown>;
  for (const k of Object.keys(top)) {
    if (!TOP_KEYS.has(k)) fail(`未知顶层键：${k}`);
  }
  if (top.archived !== undefined && typeof top.archived !== "boolean") {
    fail("archived 必须是布尔值（true = 该角色目录为冻结归档）");
  }
  const entriesRaw = top.entries;
  if (entriesRaw === undefined) fail("缺少必填键：entries");
  if (!Array.isArray(entriesRaw)) fail("entries 必须是数组");

  const out: BoundaryEntry[] = [];
  entriesRaw.forEach((raw, i) => {
    if (!isPlainObject(raw)) fail(`entries[${i}] 必须是映射`);
    const e = raw as Record<string, unknown>;
    for (const k of Object.keys(e)) {
      if (!ENTRY_KEYS.has(k)) fail(`entries[${i}] 含未知键：${k}`);
    }

    const kind = e.kind;
    if (typeof kind !== "string") fail(`entries[${i}] 缺少必填 kind`);
    if (!KINDS.has(kind)) fail(`entries[${i}] 的 kind 非法：${String(kind)}`);

    const path = e.path;
    if (typeof path !== "string" || path.trim() === "") fail(`entries[${i}] 缺少必填 path`);
    const purpose = e.purpose;
    if (typeof purpose !== "string" || purpose.trim() === "") fail(`entries[${i}] 缺少必填 purpose`);

    let root: Root = "project"; // 缺省 project
    if (e.root !== undefined) {
      if (typeof e.root !== "string" || !ROOTS.has(e.root)) {
        fail(`entries[${i}] 的 root 非法：${String(e.root)}`);
      }
      root = e.root as Root;
    }

    const entry: BoundaryEntry = {
      root,
      path: normalizeLexical(path as string),
      kind: kind as EntryKind,
      purpose: purpose as string,
    };
    if (kind === "conditional-directory") {
      const cond = e.condition;
      if (!isValidConditionSlug(cond)) {
        fail(`entries[${i}] 的 conditional-directory 缺少或非法 condition`);
      }
      entry.condition = cond;
    }
    out.push(entry);
  });

  return top.archived === true ? { entries: out, archived: true } : { entries: out };
}
