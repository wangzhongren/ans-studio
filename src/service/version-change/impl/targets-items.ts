// src/service/version-change/impl/targets-items.ts
// targets↔items 一致性 + 作者写区/版本/路径纯函数（2026-11-04 C2c 契约冻结）。
//
// 依据 P1.6 §4.4/§4.7、F36/F39/F38、AC-26/AC-28/AC-29：
// · 每个 VCA target 必须对应修正案一个 `to` 项（kind/roleId/toSha256 一致），不得有额外 target；
// · `change:"none"` 不是 target；无实际变更项拒绝提交；
// · target 必须在**作者角色**写区（发起者不因提交 VCA 获得写权）：
//   contract/roster = rapporteur（docs/proposals/、docs/contracts/），execution = convener
//   （docs/scheduling/、docs/flows/）；
// · workflow/boundary/product-intent 不在 VCA（stable 确认即写 / 闸门 0/1）。
// 本文件无 I/O、无判定副作用；哈希由应用经注入 hasher 计算。

import {
  TRUNK_AMENDMENT_VCA_ITEM_KINDS,
  type TrunkAmendmentItem,
} from "../../../model/trunk.ts";
import type { VersionChangeTarget, VersionChangeTargetKind } from "../../../model/version-change.ts";

/** 项目相对 POSIX 路径归一化（去 `./`/反斜杠；拒绝绝对/`..`/空）。 */
export function normalizeServiceRelPath(relPath: string): string | undefined {
  if (typeof relPath !== "string") return undefined;
  const value = relPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "" || value.startsWith("/") || value.startsWith("..") || value.includes("../")) return undefined;
  return value;
}

/** 版本号（`-vN.md` / `-amendment-vN.md` / `-team-vN.md`）；非版本化返回 undefined。 */
export function docVersionOf(relPath: string): number | undefined {
  const value = normalizeServiceRelPath(relPath);
  if (value === undefined) return undefined;
  const match = /-(?:amendment-|team-)?v(\d+)\.md$/i.exec(value);
  if (match === null) return undefined;
  const version = Number(match[1]);
  return Number.isInteger(version) && version >= 1 ? version : undefined;
}

/** 路径族（去 `-vN.md`/`-amendment-vN.md`/`-team-vN.md`；用于「新版本」monotonic 查询）。 */
export function pathFamilyOf(relPath: string): string | undefined {
  const value = normalizeServiceRelPath(relPath);
  if (value === undefined) return undefined;
  const stripped = value.replace(/-(?:amendment-|team-)?v\d+\.md$/i, "");
  return stripped === value ? undefined : stripped;
}

const CONTRACT_PATTERNS: readonly RegExp[] = [
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-(?:proposal|modules|topology)-v[1-9]\d*\.md$/i,
  /^docs\/contracts\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-(?:architecture|assets)-v[1-9]\d*\.md$/i,
];
const ROSTER_PATTERN = /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-roster-v[1-9]\d*\.md$/i;
const EXECUTION_PATTERNS: readonly RegExp[] = [
  /^docs\/scheduling\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-team-v[1-9]\d*\.md$/i,
  /^docs\/flows\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]\.ya?ml$/i,
];

/** target kind → 作者角色（P1.6 §4.4 映射表；发起者 ≠ 作者，写权不扩大 — AC-19）。 */
export const AUTHOR_ROLE_BY_TARGET_KIND: Readonly<Record<VersionChangeTargetKind, "rapporteur" | "convener">> =
  Object.freeze({
    contract: "rapporteur",
    roster: "rapporteur",
    execution: "convener",
  });

export function authorRoleForTargetKind(kind: string): "rapporteur" | "convener" | undefined {
  return (AUTHOR_ROLE_BY_TARGET_KIND as Readonly<Record<string, "rapporteur" | "convener">>)[kind];
}

/** 目标路径是否在作者角色写区（按 kind 的文档形状；未知 kind 一律 false）。 */
export function targetPathInAuthorArea(kind: string, relPath: string): boolean {
  const value = normalizeServiceRelPath(relPath);
  if (value === undefined) return false;
  switch (kind) {
    case "contract":
      return CONTRACT_PATTERNS.some((pattern) => pattern.test(value));
    case "roster":
      return ROSTER_PATTERN.test(value);
    case "execution":
      return EXECUTION_PATTERNS.some((pattern) => pattern.test(value));
    default:
      return false;
  }
}

/** stable 文件路径（workflow / role-card / boundary；stable 写入不走 VCA/freeze）。 */
export function isStableDocPath(relPath: string): boolean {
  const value = normalizeServiceRelPath(relPath);
  if (value === undefined) return false;
  if (value === "docs/workflow.md") return true;
  if (/(^|\/)role-card\.md$/i.test(value)) return true;
  if (/(^|\/)boundary\.ya?ml$/i.test(value)) return true;
  return false;
}

export type TargetsItemsCheck =
  | { ok: true }
  | { ok: false; code: "vca-invalid"; message: string };

/**
 * targets↔items 一致性（F36/AC-28/AC-32；提交/批准前调用）。
 * · 每个 target 必须对应修正案一个 `to` 项（change ≠ none，kind/roleId 精确、toSha256 全等）；
 * · 不得有额外 target；`change:"none"` 不是 target；
 * · 新 detail 的 item kind 限 `contract`/`roster`/`execution`（workflow/boundary 仅旧文档读兼容）；
 * · 无实际变更项 ⇒ 拒绝。
 */
export function matchTargetsToItems(input: {
  targets: readonly Pick<VersionChangeTarget, "kind" | "path" | "roleId" | "toSha256">[];
  items: readonly TrunkAmendmentItem[];
}): TargetsItemsCheck {
  const actualItems = input.items.filter((item) => item.change !== "none");
  if (actualItems.length === 0) {
    return { ok: false, code: "vca-invalid", message: "detail-amendment 无实际变更项（no-applicable-changes）" };
  }
  for (const item of actualItems) {
    if (!(TRUNK_AMENDMENT_VCA_ITEM_KINDS as readonly string[]).includes(item.kind)) {
      return {
        ok: false,
        code: "vca-invalid",
        message: `修正案 item ${item.itemId} 的 kind=${item.kind} 不能作为 VCA target（workflow/boundary 走 stable 确认即写）`,
      };
    }
  }
  const seen = new Set<string>();
  const usedItems = new Set<TrunkAmendmentItem>();
  for (const target of input.targets) {
    const rel = normalizeServiceRelPath(target.path);
    if (rel === undefined) {
      return { ok: false, code: "vca-invalid", message: `target 路径非法：${target.path}` };
    }
    if (seen.has(rel)) {
      return { ok: false, code: "vca-invalid", message: `target 路径重复：${rel}` };
    }
    seen.add(rel);
    const matched = input.items.find((item) => {
      const to = normalizeServiceRelPath(item.to);
      return (
        item.change !== "none" &&
        to === rel &&
        item.kind === target.kind &&
        (item.roleId ?? undefined) === (target.roleId ?? undefined)
      );
    });
    if (matched === undefined) {
      return { ok: false, code: "vca-invalid", message: `target ${rel} 无对应修正案 item` };
    }
    if (usedItems.has(matched)) {
      return { ok: false, code: "vca-invalid", message: `修正案 item ${matched.itemId} 对应多个 target` };
    }
    usedItems.add(matched);
    if (matched.toSha256 !== undefined && matched.toSha256 !== target.toSha256) {
      return { ok: false, code: "vca-invalid", message: `target ${rel} 与修正案 item 哈希不一致` };
    }
  }
  for (const item of actualItems) {
    if (!usedItems.has(item)) {
      return { ok: false, code: "vca-invalid", message: `修正案 item ${item.itemId} 无对应 target（不得有额外/遗漏）` };
    }
  }
  return { ok: true };
}

/** 三时点哈希重验辅助（提交/批准/apply；F38/AC-26）。返回首个漂移路径或 undefined。 */
export async function findHashDrift(
  targets: readonly Pick<VersionChangeTarget, "path" | "toSha256">[],
  sha256File: (relPath: string) => Promise<string | undefined>,
): Promise<{ path: string; actual: string | undefined; expected: string } | undefined> {
  for (const target of targets) {
    const actual = await sha256File(target.path);
    if (actual !== target.toSha256) {
      return { path: target.path, actual, expected: target.toSha256 };
    }
  }
  return undefined;
}
