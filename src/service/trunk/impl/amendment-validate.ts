// src/service/trunk/impl/amendment-validate.ts
// 修正案（trunk-amendment/v1）解析/校验/哈希定格/目标版本选择（S2；P1 §2.3-11/§4.4）。
//
// 文档格式（S2 文档化）：`docs/proposals/<flowId>-amendment-vN.md`，首部 YAML frontmatter
// （`---` 包裹，`schema: trunk-amendment/v1` + C1 `TrunkAmendmentDoc` 字段），正文自由；
// items 在 frontmatter 的 `items` 数组（形状 = C1 `TrunkAmendmentItem`）。
//
// 纪律（P1.6 §4.7/§5.3）：
// · 新 detail-amendment item kind 只允许 contract/roster/execution（workflow/boundary 走 stable
//   确认即写，拒绝并提示）；`change:"none"` 不是 target，但保留在 items；
// · 至少一个实际变更项；哈希由应用计算（`fromSha256` 取 trunk/run 基线 ref 或磁盘快照、
//   `toSha256` 取 to 路径当刻字节），发起者不自报；
// · 只读：不写修正案/不开卡；逐项确认由 S4 编排。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { protectedVersionedPaths } from "../../../common/门禁引擎/versioned-doc-guard.ts";
import {
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_AMENDMENT_VCA_ITEM_KINDS,
  type TrunkAmendmentDoc,
  type TrunkAmendmentItem,
  type TrunkAmendmentItemChange,
  type TrunkAmendmentItemKind,
  type TrunkAmendmentState,
  type TrunkAmendmentStatus,
} from "../../../model/trunk.ts";
import type { TrunkStore } from "../../../provider/trunk/abstract/trunk-store.ts";
import type {
  AmendmentValidation,
  SnapshotItem,
  TargetVersionChoice,
  TrunkServiceResult,
} from "../abstract/trunk-service.ts";
import {
  docVersionOfPath,
  normalizeRelPath,
  pathFamilyOfPath,
  sha256File,
  sha256TextOrBytes,
} from "./trunk-common.ts";

const AMENDMENT_DOC_RE = /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-amendment-v[1-9]\d*\.md$/i;
const AMENDMENT_ID_RE = /^am-[0-9]+$/;
const AMENDMENT_STATUSES: readonly TrunkAmendmentStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
  "superseded",
];
const APPLY_STATES = ["idle", "applying", "applied", "apply-failed", "applied-uncertain"] as const;

/** 修正案状态转移表（P1.3 逐项流程 + P1.6 生命周期映射；同状态幂等）。 */
const AMENDMENT_TRANSITIONS: Readonly<Record<TrunkAmendmentStatus, readonly TrunkAmendmentStatus[]>> = Object.freeze({
  draft: Object.freeze(["submitted", "superseded"] as const),
  submitted: Object.freeze(["approved", "rejected", "superseded"] as const),
  approved: Object.freeze(["applied", "superseded"] as const),
  rejected: Object.freeze(["superseded"] as const),
  applied: Object.freeze([] as const),
  superseded: Object.freeze([] as const),
});

export function canTransitionAmendment(from: TrunkAmendmentStatus, to: TrunkAmendmentStatus): boolean {
  return from === to || AMENDMENT_TRANSITIONS[from].includes(to);
}

function invalid(message: string): TrunkServiceResult<never> {
  return { ok: false, code: "trunk-amendment-invalid", message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseFrontmatter(text: string): unknown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null) return undefined;
  try {
    return parseYaml(match[1]!);
  } catch {
    return undefined;
  }
}

function itemKindOf(value: unknown): TrunkAmendmentItemKind | undefined {
  return (TRUNK_AMENDMENT_VCA_ITEM_KINDS as readonly string[]).includes(value as string)
    ? (value as TrunkAmendmentItemKind)
    : undefined;
}

function itemChangeOf(value: unknown): TrunkAmendmentItemChange | undefined {
  return value === "add" || value === "modify" || value === "none" ? value : undefined;
}

function validateDocShape(data: unknown, flowId: string, fileNameVersion: number): TrunkServiceResult<TrunkAmendmentDoc> {
  if (!isObject(data)) return invalid("修正案 frontmatter 不是映射");
  if (data.schema !== TRUNK_AMENDMENT_SCHEMA) {
    return invalid(`修正案 schema 必须为 ${TRUNK_AMENDMENT_SCHEMA}`);
  }
  if (!isNonEmptyString(data.amendmentId) || !AMENDMENT_ID_RE.test(data.amendmentId)) {
    return invalid("amendmentId 必须为 am-<n>");
  }
  if (data.flowId !== flowId) return invalid(`修正案 flowId 与提交不一致：${String(data.flowId)}`);
  if (typeof data.docVersion !== "number" || !Number.isInteger(data.docVersion) || data.docVersion < 1) {
    return invalid("docVersion 非法");
  }
  if (data.docVersion !== fileNameVersion) {
    return invalid(`docVersion=${data.docVersion} 与文件名版本 v${fileNameVersion} 不一致`);
  }
  if (data.baseTrunk === null) {
    if (data.bootstrap !== true) return invalid("baseTrunk:null 仅允许 bootstrap:true");
  } else if (!isObject(data.baseTrunk)) {
    return invalid("baseTrunk 形状非法");
  } else {
    if (
      typeof data.baseTrunk.trunkVersion !== "number" ||
      !Number.isInteger(data.baseTrunk.trunkVersion) ||
      data.baseTrunk.trunkVersion < 1
    ) {
      return invalid("baseTrunk.trunkVersion 非法");
    }
    if (data.baseTrunk.runId !== null && typeof data.baseTrunk.runId !== "string") {
      return invalid("baseTrunk.runId 非法");
    }
    if (typeof data.baseTrunk.digest !== "string") return invalid("baseTrunk.digest 非法");
    if (data.bootstrap !== undefined && typeof data.bootstrap !== "boolean") return invalid("bootstrap 非法");
  }
  if (data.summary !== undefined && typeof data.summary !== "string") return invalid("summary 非法");
  if (!Array.isArray(data.items) || data.items.length === 0) return invalid("修正案 items 不得为空");

  const items: TrunkAmendmentItem[] = [];
  const seen = new Set<string>();
  for (const raw of data.items) {
    if (!isObject(raw)) return invalid("item 不是映射");
    if (!isNonEmptyString(raw.itemId)) return invalid("itemId 不得为空");
    if (seen.has(raw.itemId)) return invalid(`itemId 重复：${raw.itemId}`);
    seen.add(raw.itemId);
    const kind = itemKindOf(raw.kind);
    if (kind === undefined) {
      if (raw.kind === "workflow" || raw.kind === "boundary") {
        return invalid(`item kind=${String(raw.kind)} 不在 detail-amendment（stable 文件走确认即写）`);
      }
      return invalid(`item kind 非法：${String(raw.kind)}`);
    }
    const change = itemChangeOf(raw.change);
    if (change === undefined) return invalid(`item change 非法：${String(raw.change)}`);
    const to = normalizeRelPath(raw.to);
    if (to === undefined) return invalid(`item to 路径非法：${String(raw.to)}`);
    const from = raw.from === undefined ? undefined : normalizeRelPath(raw.from);
    if (raw.from !== undefined && from === undefined) return invalid(`item from 路径非法：${String(raw.from)}`);
    if (change === "modify" && from === undefined) return invalid(`item ${raw.itemId} change:modify 必须带 from`);
    items.push({
      itemId: raw.itemId,
      kind,
      change,
      ...(from !== undefined ? { from } : {}),
      to,
      ...(raw.roleId !== undefined ? { roleId: String(raw.roleId) } : {}),
      ...(raw.reason !== undefined ? { reason: String(raw.reason) } : {}),
    });
  }
  if (!items.some((item) => item.change !== "none")) {
    return invalid("修正案没有实际变更项（change:none 不是 target）");
  }
  const baseTrunk =
    data.baseTrunk === null
      ? null
      : {
          trunkVersion: data.baseTrunk.trunkVersion as number,
          runId: (data.baseTrunk.runId ?? null) as string | null,
          digest: data.baseTrunk.digest as string,
        };
  return {
    ok: true,
    value: {
      schema: TRUNK_AMENDMENT_SCHEMA,
      amendmentId: data.amendmentId as string,
      flowId,
      docVersion: data.docVersion,
      baseTrunk,
      ...(data.bootstrap !== undefined ? { bootstrap: data.bootstrap as boolean } : {}),
      ...(data.summary !== undefined ? { summary: data.summary as string } : {}),
      items,
    },
  };
}

interface BaselineRefs {
  byPath: Map<string, string>;
}

function pathKey(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function baselineRefs(store: TrunkStore): Promise<BaselineRefs> {
  const refs: BaselineRefs = { byPath: new Map() };
  const read = await store.readManifest();
  if (!read.ok) return refs;
  const manifest = read.value;
  for (const ref of Object.values(manifest.artifacts.documents)) {
    if (ref !== undefined) refs.byPath.set(pathKey(ref.path), ref.sha256);
  }
  if (manifest.artifacts.execution.teamPlan !== null) {
    refs.byPath.set(pathKey(manifest.artifacts.execution.teamPlan.path), manifest.artifacts.execution.teamPlan.sha256);
  }
  if (manifest.artifacts.execution.flow !== null) {
    refs.byPath.set(pathKey(manifest.artifacts.execution.flow.path), manifest.artifacts.execution.flow.sha256);
  }
  return refs;
}

/** 计算 items 的 from/to 哈希（from 取基线 ref 优先、磁盘兜底；to 必须存在）。 */
export async function snapshotItemHashes(
  input: { projectRoot: string; store: TrunkStore; items: readonly TrunkAmendmentItem[] },
): Promise<TrunkServiceResult<SnapshotItem[]>> {
  const refs = await baselineRefs(input.store);
  const items: SnapshotItem[] = [];
  for (const item of input.items) {
    const to = normalizeRelPath(item.to);
    if (to === undefined) return { ok: false, code: "trunk-item-invalid", message: `item to 路径非法：${String(item.to)}` };
    const toSha256 = await sha256File(input.projectRoot, to);
    if (toSha256 === undefined) {
      return { ok: false, code: "trunk-item-invalid", message: `item to 文件不存在：${to}` };
    }
    let fromSha256: string | null = null;
    if (item.change !== "add" && item.change !== "none") {
      const from = item.from === undefined ? undefined : normalizeRelPath(item.from);
      if (from === undefined) {
        return { ok: false, code: "trunk-item-invalid", message: `item ${item.itemId} change:modify 缺少 from` };
      }
      fromSha256 =
        refs.byPath.get(pathKey(from)) ??
        (await sha256File(input.projectRoot, from)) ??
        null;
      if (fromSha256 === null) {
        return { ok: false, code: "trunk-item-invalid", message: `item from 基线不可用：${from}` };
      }
    }
    items.push({ ...item, fromSha256, toSha256 });
  }
  return { ok: true, value: items };
}

/** 解析并校验修正案文档（只读），返回哈希定格后的 items。 */
export async function validateAmendment(input: {
  projectRoot: string;
  store: TrunkStore;
  amendmentDocPath: string;
  flowId: string;
}): Promise<TrunkServiceResult<AmendmentValidation>> {
  const rel = normalizeRelPath(input.amendmentDocPath);
  if (rel === undefined || !AMENDMENT_DOC_RE.test(rel)) {
    return invalid(`修正案文档路径非法：${String(input.amendmentDocPath)}`);
  }
  if (!rel.startsWith(`docs/proposals/${input.flowId}-amendment-v`)) {
    return invalid(`修正案文档必须属于 flowId=${input.flowId}：${rel}`);
  }
  const version = docVersionOfPath(rel);
  if (version === undefined) return invalid(`修正案文档缺少版本号：${rel}`);
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(input.projectRoot, rel));
  } catch {
    return { ok: false, code: "trunk-amendment-not-found", message: `修正案文档不存在：${rel}` };
  }
  const text = bytes.toString("utf8");
  const data = parseFrontmatter(text);
  if (data === undefined) return invalid("修正案 frontmatter 缺失或 YAML 非法");
  const doc = validateDocShape(data, input.flowId, version);
  if (!doc.ok) return doc;
  const snapshot = await snapshotItemHashes({
    projectRoot: input.projectRoot,
    store: input.store,
    items: doc.value.items,
  });
  if (!snapshot.ok) return snapshot;
  return {
    ok: true,
    value: {
      doc: doc.value,
      path: rel,
      docSha256: sha256TextOrBytes(bytes),
      docVersion: version,
      items: snapshot.value,
    },
  };
}

/** 目标版本候选（同路径族已存在的版本化文档；0/1/多候选由 S4 决定客户选择）。 */
export async function selectTargetVersion(input: {
  projectRoot: string;
  path: string;
}): Promise<TargetVersionChoice> {
  const rel = normalizeRelPath(input.path);
  const family = rel === undefined ? undefined : pathFamilyOfPath(rel);
  if (family === undefined) return { candidates: [] };
  const all = await protectedVersionedPaths(input.projectRoot);
  const candidates = all
    .filter((candidate) => pathFamilyOfPath(candidate) === family)
    .map((candidate) => ({ path: candidate, version: docVersionOfPath(candidate) ?? 0 }))
    .filter((candidate) => candidate.version >= 1)
    .sort((a, b) => (a.version === b.version ? (a.path < b.path ? -1 : 1) : a.version - b.version));
  return candidates.length === 1 ? { selected: candidates[0]!.version, candidates } : { candidates };
}

/** 修正案状态结构校验（recordAmendment 用；旧状态不可写）。 */
export function validateAmendmentState(state: TrunkAmendmentState): string | undefined {
  if (
    state.v !== 1 ||
    state.schema !== TRUNK_AMENDMENT_SCHEMA ||
    !isNonEmptyString(state.amendmentId) ||
    !isNonEmptyString(state.flowId)
  ) {
    return "amendment state 形状非法";
  }
  if (!(AMENDMENT_STATUSES as readonly string[]).includes(state.status)) {
    return `amendment status 非法：${String(state.status)}`;
  }
  if (!(APPLY_STATES as readonly string[]).includes(state.applyState)) {
    return `amendment applyState 非法：${String(state.applyState)}`;
  }
  return undefined;
}
