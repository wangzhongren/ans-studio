// src/service/trunk/impl/amendment-expansion.ts
// 边界扩大检测（S2；P1 §2.3-12/§4.4/§4.7；只读、不写边界）。
//
// P1.6 口径：workflow/boundary 走 stable 确认即写，不在 detail-amendment；本检测仅保留给
// **旧/遗留 boundary item**（C1 `TrunkAmendmentItemKind` 的读兼容）与确认预览的只读判定。
// 解析复用门禁引擎 `boundary-yaml.ts`（单一来源）；解析失败按**扩大**处理（fail-closed，
// 需客户勾选确认），不静默放行。

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseBoundaryYaml, parseBoundaryYamlDoc } from "../../../common/门禁引擎/boundary-yaml.ts";
import type { BoundaryEntry } from "../../../model/boundary.ts";
import type { TrunkAmendmentItem } from "../../../model/trunk.ts";
import type {
  ExpansionResult,
  StableBoundaryExpansionInput,
  StableBoundaryExpansionResult,
} from "../abstract/trunk-service.ts";
import { normalizeRelPath } from "./trunk-common.ts";

/** 旧条目是否覆盖新条目（根相同；file 精确、directory 子树、conditional 仅完全相同）。 */
function covers(oldEntry: BoundaryEntry, newEntry: BoundaryEntry): boolean {
  if (oldEntry.root !== newEntry.root) return false;
  if (oldEntry.kind === "file") {
    return newEntry.kind === "file" && newEntry.path === oldEntry.path;
  }
  if (oldEntry.kind === "directory") {
    const prefix = oldEntry.path.endsWith("/") ? oldEntry.path : `${oldEntry.path}/`;
    return newEntry.path === oldEntry.path || newEntry.path.startsWith(prefix);
  }
  // conditional-directory：条件语义不同即视为扩大（保守）。
  return newEntry.kind === "conditional-directory" && newEntry.path === oldEntry.path &&
    (newEntry.condition ?? "") === (oldEntry.condition ?? "");
}

function expansionOf(oldEntries: readonly BoundaryEntry[], newEntries: readonly BoundaryEntry[]): BoundaryEntry[] {
  return newEntries.filter((candidate) => !oldEntries.some((oldEntry) => covers(oldEntry, candidate)));
}

async function readBoundary(projectRoot: string, relPath: string): Promise<BoundaryEntry[] | undefined> {
  const rel = normalizeRelPath(relPath);
  if (rel === undefined) return undefined;
  try {
    const text = await readFile(path.join(projectRoot, rel), "utf8");
    return parseBoundaryYaml(text);
  } catch {
    return undefined;
  }
}

/**
 * 对 items 中 kind=boundary 的项做扩大检测：`from` 缺失/不可读/解析失败 ⇒ 视为扩大
 * （全部新条目需确认）；`to` 不可读/解析失败 ⇒ 视为扩大（fail-closed）。
 */
export async function detectBoundaryExpansion(input: {
  projectRoot: string;
  items: readonly TrunkAmendmentItem[];
}): Promise<ExpansionResult> {
  const expansions: string[] = [];
  for (const item of input.items) {
    if (item.kind !== "boundary") continue;
    const toEntries = await readBoundary(input.projectRoot, item.to);
    if (toEntries === undefined) {
      expansions.push(`${item.itemId}: boundary-to-unreadable:${item.to}`);
      continue;
    }
    if (item.from === undefined) {
      for (const entry of toEntries) expansions.push(`${item.itemId}: ${entry.root}:${entry.path}`);
      continue;
    }
    const fromEntries = await readBoundary(input.projectRoot, item.from);
    if (fromEntries === undefined) {
      expansions.push(`${item.itemId}: boundary-from-unreadable:${item.from}`);
      continue;
    }
    for (const entry of expansionOf(fromEntries, toEntries)) {
      expansions.push(`${item.itemId}: ${entry.root}:${entry.path}`);
    }
  }
  return { expanded: expansions.length > 0, expansions };
}

/**
 * AC-13：stable boundary **预览文本**扩大检测（D2 确认卡/acknowledgments 用；只读、不写盘）。
 * `fromPath` = 当前 boundary.yaml；`toYamlText` = 预览的最终 body。复用 `parseBoundaryYamlDoc`
 * 与条目级覆盖判定；预览不可解析 ⇒ fail-closed（expanded:true + 原因）；无可比较基线 ⇒ 全部新条目
 * 视为扩大。
 */
export async function detectStableBoundaryExpansion(
  input: StableBoundaryExpansionInput,
): Promise<StableBoundaryExpansionResult> {
  const fromRel = normalizeRelPath(input.fromPath);
  let fromEntries: BoundaryEntry[] | undefined;
  if (fromRel !== undefined) {
    try {
      fromEntries = parseBoundaryYaml(await readFile(path.join(input.projectRoot, fromRel), "utf8"));
    } catch {
      fromEntries = undefined;
    }
  }
  let toEntries: BoundaryEntry[];
  try {
    toEntries = parseBoundaryYamlDoc(input.toYamlText).entries;
  } catch (err) {
    return {
      expanded: true,
      expansions: [`to-yaml-invalid:${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (fromEntries === undefined) {
    return {
      expanded: toEntries.length > 0,
      expansions: toEntries.map((entry) => `${entry.root}:${entry.path}`),
    };
  }
  const expansions = expansionOf(fromEntries, toEntries).map((entry) => `${entry.root}:${entry.path}`);
  return { expanded: expansions.length > 0, expansions };
}
