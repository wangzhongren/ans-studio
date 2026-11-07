// src/common/门禁引擎/versioned-doc-guard.ts
// 2026-10-29（客户追加口径 / v2.8 R6/R9）：版本化文档**旧版只读**的结构性守卫。
//
// 2026-11-04（trunk-amendment-model C2b 契约冻结）：判定从「exists ⇒ 只读」改为「**frozen ⇒ 只读**」。
//   · 唯一同步判定 = `versionedDocOverwriteDecision`（本文件）：接收冻结三态 `DocFreezeLookupState`
//     （C1 `src/model/version-change.ts` 的 `frozen|draft|unknown`，不另造枚举）。
//     frozen ⇒ 拒绝；draft ⇒ 允许（仍受角色写权/写门禁）；unknown/缓存损坏 ⇒ fail-closed 拒绝。
//     覆盖 write/edit/delete/rename/move/pin/re-pin（`operation`）；rename/move 同时判源与目标。
//   · 冻结状态的**生产唯一同步查询** = `versionedDocFreezeState`：只读**已安装**的同步快照
//     （`installVersionedDocFreezeSnapshot` / `refreshVersionedDocFreezeSnapshot`）。
//     快照由 R9 `versions.jsonl` 派生；`doc-freezes.json` 仅是可重建派生缓存，guard 不直接读缓存文件。
//     快照未安装/损坏 ⇒ unknown ⇒ 版本化路径变更一律拒绝（fail-closed，含新建 vN+1）。
//   · R9 权威：`VersionBaselineRecord` 追加 `frozen` / `draft-updated` / `draft-marker` 变体
//     （冻结子形状 = C1 `DocFreezeRecord` type-import，不复制）；同一实际路径以**最后一条记录**为准
//     （latest-record-per-path）；冻结为终态。冻结/draft-marker 记录只经本文件 `appendDocFreezeRecords` /
//     `appendDocDraftMarkerRecords`（同 `versions.lock` / fencing）追加，调用方不得直接写 `versions.jsonl`。
//   · stable 写入（workflow / role-card / boundary）不在冻结判定内：必须经 `stableWriteDecision`
//     一次性许可（C1 `StableWritePermit` 唯一 permit 形状，F13）；许可判定同源、纯函数、fail-closed。
//
// 本模块只做**路径形状 + 冻结状态 + 许可**的机械判定；不扩写权、不新增写通道（F33）。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { link, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { formatMechanicalRejection, makeMechanicalRejection, type MechanicalRejection, type RejectionOwner } from "../编排/mechanical-rejection.ts";
import type { WriteDecision } from "../../model/decision.ts";
import {
  DOC_FREEZE_CUSTOMER_REASONS,
  DOC_FREEZE_REASONS,
  STABLE_WRITE_PERMIT_STATUSES,
  STABLE_WRITE_PERMIT_TTL_MS,
  isValidDocFreezeRecord,
  type DocFreezeLookupState,
  type DocFreezeReason,
  type DocFreezeRecord,
  type StableFileKind,
  type StableWriteDecisionInput,
  type StableWriteErrorCode,
  type StableWritePermit,
} from "../../model/version-change.ts";
import { isBuiltInGovernanceRoleId } from "./governance-roles.ts";
export { isValidDocFreezeRecord } from "../../model/version-change.ts";

const VERSIONED_DOC_PATTERNS: readonly RegExp[] = [
  /^docs\/product\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-intent-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-roster-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-modules-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-topology-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-proposal-v[1-9]\d*\.md$/i,
  // 2026-11-04（C2b / P1.6 §4.6）：修正案文档加入版本化模式（提交 VCA 后冻结，编辑被同一判定拒绝）。
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-amendment-v[1-9]\d*\.md$/i,
  /^docs\/contracts\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-architecture-v[1-9]\d*\.md$/i,
  /^docs\/contracts\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-assets-v[1-9]\d*\.md$/i,
];

/** 项目相对 POSIX 路径归一化（去掉 `./`、反斜杠）；失败返回 undefined。 */
export function normalizeVersionedDocPath(relPath: string): string | undefined {
  if (typeof relPath !== "string") return undefined;
  const value = relPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "" || value.startsWith("/") || value.includes("../") || value.startsWith("..")) return undefined;
  return value;
}

export function isVersionedDocPath(relPath: string): boolean {
  const value = normalizeVersionedDocPath(relPath);
  if (value === undefined) return false;
  return VERSIONED_DOC_PATTERNS.some((pattern) => pattern.test(value));
}

/** 版本号（从文件名 -vN.md 提取）；非版本化返回 undefined。 */
export function versionedDocVersionOf(relPath: string): number | undefined {
  const value = normalizeVersionedDocPath(relPath);
  if (value === undefined) return undefined;
  const match = /-v(\d+)\.md$/i.exec(value);
  if (match === null) return undefined;
  const version = Number(match[1]);
  return Number.isInteger(version) && version >= 1 ? version : undefined;
}

/** 版本化文档操作（C2b 唯一同步判定覆盖全调用点；pin/re-pin 要求目标已冻结）。 */
export type VersionedDocOperation = "write" | "edit" | "delete" | "rename" | "move" | "pin" | "repin";

export type VersionedDocDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      code: "versioned-doc-overwrite" | "versioned-doc-not-frozen";
      rejection: MechanicalRejection;
    };

function versionedDenial(
  code: "versioned-doc-overwrite" | "versioned-doc-not-frozen",
  missing: string,
  docs: readonly string[],
): VersionedDocDecision {
  const rejection = makeMechanicalRejection(code, [missing], { docs: [...docs] });
  return { allowed: false, code, rejection, reason: formatMechanicalRejection(rejection) };
}

/**
 * 唯一同步判定（F33）：版本化路径的「冻结/草稿」真值表。
 *
 * | 场景 | exists | frozen | operation | 结果 |
 * | --- | --- | --- | --- | --- |
 * | 新建版本文件（draft/undefined/migration-required 新路径） | false | draft/undefined | write/edit | allow（仍受写权） |
 * | 原位改草稿 | true | draft | write/edit/delete/rename/move | allow（仍受写权） |
 * | 覆盖/删除/改名/移动已冻结 | true | frozen | 任意 | deny `versioned-doc-overwrite` |
 * | 状态未知/缓存损坏 | 任意 | unknown | 任意 | deny `versioned-doc-overwrite`（fail-closed） |
 * | 未传 frozen（旧调用方/兼容） | true | undefined | 任意 | deny（保留旧「存在即只读」保护） |
 * | 未传 frozen（旧调用方/兼容） | false | undefined | write/edit | allow（新建 vN+1） |
 * | pin/re-pin | true | frozen | pin/repin | allow |
 * | pin/re-pin | 任意 | 非 frozen | pin/repin | deny `versioned-doc-not-frozen` |
 *
 * `destRelPath/destExists/destFrozen` 用于 rename/move 目标（源另判）。非版本化路径一律 allow
 * （本模块不适用；仍受 resolveWrite/禁写约束）。
 */
export function versionedDocOverwriteDecision(input: {
  relPath: string;
  exists: boolean;
  /** C1 `DocFreezeLookupState`；生产由 `versionedDocFreezeState` 提供（禁止硬编码）。 */
  frozen?: DocFreezeLookupState;
  operation?: VersionedDocOperation;
  destRelPath?: string;
  destExists?: boolean;
  destFrozen?: DocFreezeLookupState;
}): VersionedDocDecision {
  const rel = normalizeVersionedDocPath(input.relPath);
  if (rel === undefined || !isVersionedDocPath(rel)) return { allowed: true };
  const operation = input.operation ?? "write";
  const judged = judgeVersionedPath(rel, input.exists, input.frozen, operation);
  if (!judged.allowed) return judged;
  if (operation === "rename" || operation === "move") {
    const dest = input.destRelPath !== undefined ? normalizeVersionedDocPath(input.destRelPath) : undefined;
    if (dest !== undefined && dest !== rel && isVersionedDocPath(dest)) {
      const destJudged = judgeVersionedPath(dest, input.destExists === true, input.destFrozen, operation);
      if (!destJudged.allowed) return destJudged;
    }
  }
  return { allowed: true };
}

function judgeVersionedPath(
  rel: string,
  exists: boolean,
  frozen: DocFreezeLookupState | undefined,
  operation: VersionedDocOperation,
): VersionedDocDecision {
  const pinLike = operation === "pin" || operation === "repin";
  if (pinLike) {
    if (frozen === "frozen" && exists) return { allowed: true };
    if (frozen === "unknown") {
      return versionedDenial(
        "versioned-doc-not-frozen",
        `冻结状态不可用（缓存缺失/损坏）：无法确认 ${rel} 已冻结，pin/re-pin 被拒绝（fail-closed）`,
        [rel],
      );
    }
    if (!exists) {
      return versionedDenial(
        "versioned-doc-not-frozen",
        `pin/re-pin 目标不存在或未冻结：${rel}。只能 pin 已冻结文档；首次 handoff 需先写 doc.freeze(handoff-pin-bootstrap)。`,
        [rel],
      );
    }
    return versionedDenial(
      "versioned-doc-not-frozen",
      `pin/re-pin 目标未冻结：${rel}。请先按 VCA/客户确认路径冻结，再 pin/re-pin。`,
      [rel],
    );
  }
  if (frozen === "unknown") {
    return versionedDenial(
      "versioned-doc-overwrite",
      `冻结状态不可用（缓存缺失/损坏）：${rel} 的变更被拒绝（fail-closed）。请重开会话/刷新冻结快照后重试。`,
      [rel],
    );
  }
  if (frozen === "frozen") {
    return versionedDenial(
      "versioned-doc-overwrite",
      `版本化文档已冻结：${rel}（禁止覆盖/原地修改/删除/重命名/移动；只能新建 vN+1 并提交版本变更申请）`,
      [rel],
    );
  }
  if (frozen === "draft") return { allowed: true };
  // frozen 缺省（旧调用方/兼容口径）：保留既有「存在即只读」保护，新建 vN+1 允许。
  if (exists) {
    return versionedDenial(
      "versioned-doc-overwrite",
      `版本化文档只读：${rel} 已存在（禁止覆盖/原地修改）`,
      [rel],
    );
  }
  return { allowed: true };
}

/** 同步存在性探测（门禁层用；调用方仍以注入的 exists 做单测）。 */
export function versionedDocExists(projectRoot: string, relPath: string, exists: (abs: string) => boolean = existsSync): boolean {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined || !isVersionedDocPath(rel)) return false;
  return exists(path.join(projectRoot, rel));
}

/** 受管版本化路径清单（供审批上下文/诊断；只读扫描三个目录一层）。 */
export async function protectedVersionedPaths(projectRoot: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (isVersionedDocPath(rel)) out.push(rel);
    }
  }
  return out.sort();
}

/** 同步版本（shell 守卫同步链路用）：受管版本化路径清单。 */
export function protectedVersionedPathsSync(projectRoot: string): string[] {
  const out: string[] = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = readdirSync(path.join(projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (isVersionedDocPath(rel)) out.push(rel);
    }
  }
  return out.sort();
}

/** R9：旧版 hash 基线（应用独占 .ans 状态，角色不可写）。 */
export const VERSION_BASELINE_REL = ".ans/state/versions.jsonl";
/** R9：基线与 marker 的 TOFU 边界——仅二者都不存在时才能初始化；marker 存在后一律 fail-closed。 */
export const VERSION_INITIALIZED_REL = ".ans/state/versions.initialized";
export const VERSION_LOCK_REL = ".ans/state/versions.lock";

/** 版本化文档类别（C2b：新增 `amendment`）。 */
export type VersionedDocKind =
  | "intent"
  | "proposal"
  | "roster"
  | "modules"
  | "topology"
  | "architecture"
  | "assets"
  | "amendment";

export const VERSIONED_DOC_KINDS: readonly VersionedDocKind[] = Object.freeze([
  "intent",
  "proposal",
  "roster",
  "modules",
  "topology",
  "architecture",
  "assets",
  "amendment",
]);

/**
 * R9 记录事件：
 * · `baseline`/`version-added` —— 既有登记（草稿）；
 * · `frozen` —— 冻结终态（`freeze` 子形状 = C1 `DocFreezeRecord`）；
 * · `draft-updated` —— 同 path/version 草稿原位改后的新 sha（latest-record-per-path）；
 * · `draft-marker` —— `migrated-draft` 迁移证据（不写 doc.freeze）。
 */
export type VersionBaselineEvent = "baseline" | "version-added" | "frozen" | "draft-updated" | "draft-marker";

export interface VersionBaselineRecord {
  v: 1;
  flowId: string;
  doc: VersionedDocKind;
  version: number;
  path: string;
  sha256: string;
  recordedAt: string;
  event: VersionBaselineEvent;
  recordedBy: string;
  /** event === "frozen" 必填；C1 唯一冻结子形状（type-import，不复制）。 */
  freeze?: DocFreezeRecord;
}

const VERSIONED_DIRS = ["docs/product", "docs/proposals", "docs/contracts"] as const;

function isVersionedDocKind(value: unknown): value is VersionedDocKind {
  return typeof value === "string" && (VERSIONED_DOC_KINDS as readonly string[]).includes(value);
}

function isVersionBaselineEvent(value: unknown): value is VersionBaselineEvent {
  return value === "baseline" || value === "version-added" || value === "frozen" || value === "draft-updated" || value === "draft-marker";
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function docKindOf(rel: string): VersionedDocKind | undefined {
  if (/^docs\/product\/[^/]+-intent-v\d+\.md$/i.test(rel)) return "intent";
  if (/^docs\/proposals\/[^/]+-roster-v\d+\.md$/i.test(rel)) return "roster";
  if (/^docs\/proposals\/[^/]+-modules-v\d+\.md$/i.test(rel)) return "modules";
  if (/^docs\/proposals\/[^/]+-topology-v\d+\.md$/i.test(rel)) return "topology";
  if (/^docs\/proposals\/[^/]+-proposal-v\d+\.md$/i.test(rel)) return "proposal";
  if (/^docs\/proposals\/[^/]+-amendment-v\d+\.md$/i.test(rel)) return "amendment";
  if (/^docs\/contracts\/[^/]+-architecture-v\d+\.md$/i.test(rel)) return "architecture";
  if (/^docs\/contracts\/[^/]+-assets-v\d+\.md$/i.test(rel)) return "assets";
  return undefined;
}

function flowIdOf(rel: string): string {
  const base = rel.split("/").pop() ?? "";
  const match = /^(.+?)-(?:intent|roster|modules|topology|proposal|amendment|architecture|assets)?-?v\d+\.md$/i.exec(base);
  return match?.[1] ?? "";
}

/** canonical 逻辑路径（唯一键由 flowId/doc/version 组成；path 不带 -vN）。 */
function canonicalPathFor(flowId: string, doc: VersionedDocKind): string {
  if (doc === "intent") return `docs/product/${flowId}-intent`;
  if (doc === "architecture") return `docs/contracts/${flowId}-architecture`;
  if (doc === "assets") return `docs/contracts/${flowId}-assets`;
  return `docs/proposals/${flowId}-${doc}`;
}

/** 实际文件路径：新记录 canonical + `-vN.md`；v2.10 旧记录 path 已是实际路径时兼容。 */
function actualPathForRecord(record: VersionBaselineRecord): string {
  if (/-v\d+\.md$/i.test(record.path)) return record.path;
  return `${record.path}-v${record.version}.md`;
}

/** 同一实际路径的最后一条记录（latest-record-per-path；文件顺序即追加顺序）。 */
function latestRecordMap(records: readonly VersionBaselineRecord[]): Map<string, VersionBaselineRecord> {
  const latest = new Map<string, VersionBaselineRecord>();
  for (const record of records) {
    const rel = normalizeVersionedDocPath(actualPathForRecord(record));
    if (rel === undefined) continue;
    latest.set(rel, record);
  }
  return latest;
}

type BaselineRead =
  | { ok: true; records: VersionBaselineRecord[]; initialized: boolean }
  | { ok: false; reason: "baseline-missing" | "baseline-corrupt" | "marker-missing" };

async function readBaselines(projectRoot: string, markerExists?: (abs: string) => boolean): Promise<BaselineRead> {
  const marker = markerExists ?? existsSync;
  const markerPresent = marker(path.join(projectRoot, VERSION_INITIALIZED_REL));
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, VERSION_BASELINE_REL), "utf8");
  } catch {
    if (!markerPresent) return { ok: true, records: [], initialized: false }; // 二者都不存在 ⇒ TOFU 候选
    return { ok: false, reason: "baseline-missing" };
  }
  return parseVersionBaselineState({ baselineText: text, initialized: markerPresent });
}

/** Pure parser shared by legacy callers and the Provider-backed G Service. No I/O or capability input. */
export function parseVersionBaselineState(input: { baselineText: string | null; initialized: boolean }): BaselineRead {
  const text = input.baselineText;
  if (text === null) return input.initialized ? { ok: false, reason: "baseline-missing" } : { ok: true, records: [], initialized: false };
  if (!input.initialized) return { ok: false, reason: "marker-missing" };
  if (text.trim() === "") return { ok: false, reason: "baseline-corrupt" };
  const records: VersionBaselineRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { ok: false, reason: "baseline-corrupt" };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "baseline-corrupt" };
    const record = parsed as Partial<VersionBaselineRecord> & { event?: string };
    if (
      record.v !== 1 ||
      typeof record.flowId !== "string" ||
      record.flowId.trim() === "" ||
      !isVersionedDocKind(record.doc) ||
      typeof record.version !== "number" ||
      !Number.isInteger(record.version) ||
      record.version < 1 ||
      typeof record.path !== "string" ||
      !isSha256Hex(record.sha256) ||
      typeof record.recordedAt !== "string" ||
      record.recordedAt.trim() === "" ||
      typeof record.recordedBy !== "string" ||
      record.recordedBy.trim() === ""
    ) {
      return { ok: false, reason: "baseline-corrupt" };
    }
    // v2.12：旧值只读归一化（不追加迁移记录）：event、recordedBy、旧实际 path → canonical。
    const normalized = record as VersionBaselineRecord;
    if ((normalized as { event?: string }).event === "versioned-doc-baseline") normalized.event = "baseline";
    if (!isVersionBaselineEvent(normalized.event)) return { ok: false, reason: "baseline-corrupt" };
    if (normalized.event === "frozen") {
      if (!isValidDocFreezeRecord((record as { freeze?: unknown }).freeze)) return { ok: false, reason: "baseline-corrupt" };
    } else if ((record as { freeze?: unknown }).freeze !== undefined) {
      return { ok: false, reason: "baseline-corrupt" };
    }
    if (normalized.recordedBy === "app") normalized.recordedBy = "app:session";
    const canonical = canonicalPathFor(normalized.flowId, normalized.doc);
    if (/-v\d+\.md$/i.test(normalized.path)) {
      if (normalized.path !== `${canonical}-v${normalized.version}.md`) return { ok: false, reason: "baseline-corrupt" };
      normalized.path = canonical;
    } else if (normalized.path !== canonical) {
      return { ok: false, reason: "baseline-corrupt" };
    }
    records.push(normalized);
  }
  return { ok: true, records, initialized: true };
}

/**
 * TOFU 仅一次：marker 与 versions.jsonl 都不存在时，记录当前全部版本化文档并写 marker。
 * marker 存在后：**不补齐缺失条目**（旧版缺失由 verify fail-closed）；仅为「版本号高于已记录最大值」
 * 的新版本追加基线（新版本首次出现时登记），返回新增条目数。
 */
function hasVersionRecord(text: string, version: number): boolean {
  // 新版本必须有版本头/版本记录（frontmatter `version: N` 或正文 vN 版本标记）。
  return text.includes(`version: ${version}`) || text.includes(`v${version}`);
}

async function atomicWrite(abs: string, content: string): Promise<void> {
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync(); // v2.13：fsync 后 rename，崩溃不丢已提交基线
  } finally {
    await handle.close();
  }
  await rename(tmp, abs);
}

async function recordVersionedDocBaselinesLocked(input: {
  projectRoot: string;
  now?: () => Date;
  recordedBy?: string;
}, lockToken?: string): Promise<number> {
  const state = await readBaselines(input.projectRoot);
  if (!state.ok) return 0; // 已初始化但 baseline 缺失/坏行/marker 缺失 ⇒ 禁止重建
  const at = (input.now ?? (() => new Date()))().toISOString();
  const recordedBy = input.recordedBy ?? "app:session";
  const maxVersion = new Map<string, number>();
  for (const record of state.records) {
    const key = `${record.flowId}\u0000${record.doc}`;
    maxVersion.set(key, Math.max(maxVersion.get(key) ?? 0, record.version));
  }
  const seen = new Set(state.records.map((record) => `${record.flowId}|${record.doc}|${record.version}`));
  const candidates: Array<{ rel: string; doc: VersionedDocKind; version: number; flowId: string }> = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(input.projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const candidateKey = `${flowIdOf(rel)}|${docKindOf(rel) ?? ""}|${versionedDocVersionOf(rel) ?? 0}`;
      if (!isVersionedDocPath(rel) || seen.has(candidateKey)) continue;
      const doc = docKindOf(rel);
      const version = versionedDocVersionOf(rel);
      if (doc === undefined || version === undefined) continue;
      const flowId = flowIdOf(rel);
      const known = maxVersion.get(`${flowId}\u0000${doc}`) ?? 0;
      if (state.initialized && version <= known) continue; // 旧版缺失/未记录 ⇒ 不自动补齐
      candidates.push({ rel, doc, version, flowId });
    }
  }
  if (state.initialized) {
    // 先校验旧版未改；任一旧版变化 ⇒ 不登记新版本（fail-closed）。
    const violations = await verifyVersionedDocBaselinesLocked({ projectRoot: input.projectRoot });
    if (violations.some((violation) => violation.reason === "changed" || violation.reason === "missing")) return 0;
  }
  const additions: VersionBaselineRecord[] = [];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(path.join(input.projectRoot, candidate.rel));
      const text = bytes.toString("utf8");
      if (state.initialized && !hasVersionRecord(text, candidate.version)) continue; // 非法版本头 ⇒ 不登记
      additions.push({
        v: 1,
        flowId: candidate.flowId,
        doc: candidate.doc,
        version: candidate.version,
        path: canonicalPathFor(candidate.flowId, candidate.doc),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        recordedAt: at,
        event: state.initialized ? "version-added" : "baseline",
        recordedBy,
      });
      seen.add(`${candidate.flowId}|${candidate.doc}|${candidate.version}`);
    } catch {
      /* 并发删除：跳过 */
    }
  }
  if (additions.length === 0) return 0;
  if (lockToken !== undefined && !(await ownsVersionLock(input.projectRoot, lockToken))) return 0; // fencing
  const baselineAbs = path.join(input.projectRoot, VERSION_BASELINE_REL);
  await mkdir(path.dirname(baselineAbs), { recursive: true });
  let existingText = "";
  if (state.initialized) existingText = await readFile(baselineAbs, "utf8");
  const nextText = existingText + additions.map((record) => `${JSON.stringify(record)}\n`).join("");
  await atomicWrite(baselineAbs, nextText);
  if (!state.initialized) {
    await atomicWrite(
      path.join(input.projectRoot, VERSION_INITIALIZED_REL),
      `${JSON.stringify({ v: 1, initializedAt: at })}\n`,
    );
  }
  // 先写后校验：写后重读；解析失败视为登记失败。
  const check = await readBaselines(input.projectRoot);
  if (!check.ok) return 0;
  return additions.length;
}

export interface VersionBaselineViolation {
  path: string;
  expected?: string;
  actual?: string;
  reason: "missing" | "changed" | "baseline-missing" | "baseline-corrupt" | "marker-missing" | "unrecorded";
}

/**
 * 校验基线：初始化后 baseline 缺失/坏行/条目缺失、旧版被改/删 ⇒ 违规（fail-closed）。
 * C2b：同一实际路径以**最后一条记录**为准（latest-record-per-path；draft-updated 不误报旧 sha）。
 */
async function verifyVersionedDocBaselinesLocked(input: { projectRoot: string }): Promise<VersionBaselineViolation[]> {
  const state = await readBaselines(input.projectRoot);
  if (!state.ok) {
    return [{ path: VERSION_BASELINE_REL, reason: state.reason }];
  }
  if (state.records.length === 0 && !state.initialized) {
    // 未初始化：项目还没有受管版本化文档 ⇒ 无物可保护（0 违规）；已有文档 ⇒ fail-closed。
    const hasVersionedDoc = (await protectedVersionedPaths(input.projectRoot)).length > 0;
    return hasVersionedDoc ? [{ path: VERSION_BASELINE_REL, reason: "baseline-missing" }] : [];
  }
  const violations: VersionBaselineViolation[] = [];
  const seen = new Set<string>();
  const maxVersion = new Map<string, number>();
  for (const record of latestRecordMap(state.records).values()) {
    const rel = normalizeVersionedDocPath(actualPathForRecord(record));
    if (rel === undefined || !isVersionedDocPath(rel)) continue;
    seen.add(`${record.flowId}|${record.doc}|${record.version}`);
    const key = `${record.flowId}|${record.doc}`;
    maxVersion.set(key, Math.max(maxVersion.get(key) ?? 0, record.version));
    try {
      const bytes = await readFile(path.join(input.projectRoot, rel));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== record.sha256) violations.push({ path: rel, expected: record.sha256, actual, reason: "changed" });
    } catch {
      violations.push({ path: rel, expected: record.sha256, reason: "missing" });
    }
  }

  // 旧版（版本号 ≤ 已记录最大值）存在但无 baseline 条目 ⇒ fail-closed；新版本允许等待登记。
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(input.projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const candidateKey = `${flowIdOf(rel)}|${docKindOf(rel) ?? ""}|${versionedDocVersionOf(rel) ?? 0}`;
      if (!isVersionedDocPath(rel) || seen.has(candidateKey)) continue;
      const doc = docKindOf(rel);
      const version = versionedDocVersionOf(rel);
      if (doc === undefined || version === undefined) continue;
      const key = `${flowIdOf(rel)}|${doc}`;
      if (version <= (maxVersion.get(key) ?? 0)) violations.push({ path: rel, reason: "unrecorded" });
    }
  }
  return violations;
}

/** shell-post-audit 用：查已记录版本的 baseline sha（latest-record-per-path；未记录返回 undefined）。 */
export type BaselineShaResult =
  | { ok: true; sha256?: string }
  | { ok: false; reason: "baseline-missing" | "baseline-corrupt" | "marker-missing" };

/** Ordinary immutable bytes supplied by the Service after a complete, strict Provider scan. */
export interface VersionBaselineFile { path: string; bytesBase64: string; sha256: string }
export interface VersionBaselineData {
  baselineText: string | null;
  initialized: boolean;
  files: readonly VersionBaselineFile[];
  scanComplete: boolean;
}
export interface VersionBaselineRegistration {
  registered: boolean | undefined;
  violations: VersionBaselineViolation[];
  nextText?: string;
  initialize?: boolean;
}

function baselineFileMap(input: VersionBaselineData): Map<string, VersionBaselineFile> | undefined {
  if (input.scanComplete !== true || !Array.isArray(input.files)) return;
  const files = new Map<string, VersionBaselineFile>(), seen = new Set<string>();
  for (const file of input.files) {
    const rel = normalizeVersionedDocPath(file.path), content = typeof file.bytesBase64 === "string" ? Buffer.from(file.bytesBase64, "base64") : undefined;
    if (rel === undefined || rel !== file.path || !isVersionedDocPath(rel) || seen.has(rel.toLowerCase()) || !content
      || content.toString("base64") !== file.bytesBase64 || !isSha256Hex(file.sha256)
      || createHash("sha256").update(content).digest("hex") !== file.sha256.toLowerCase()) return;
    seen.add(rel.toLowerCase()); files.set(rel, file);
  }
  return files;
}

/** Pure baseline verification. Missing physical files are meaningful only after a complete Provider scan. */
export function verifyVersionBaselineData(input: VersionBaselineData): VersionBaselineViolation[] {
  const state = parseVersionBaselineState(input);
  if (!state.ok) return [{ path: VERSION_BASELINE_REL, reason: state.reason }];
  const files = baselineFileMap(input);
  if (!files) return [{ path: VERSION_BASELINE_REL, reason: "baseline-corrupt" }];
  if (!state.initialized) return files.size ? [{ path: VERSION_BASELINE_REL, reason: "baseline-missing" }] : [];
  const violations: VersionBaselineViolation[] = [], seen = new Set<string>(), max = new Map<string, number>();
  for (const record of latestRecordMap(state.records).values()) {
    const rel = actualPathForRecord(record), file = files.get(rel);
    seen.add(`${record.flowId}|${record.doc}|${record.version}`);
    const key = `${record.flowId}|${record.doc}`; max.set(key, Math.max(max.get(key) ?? 0, record.version));
    if (!file) violations.push({ path: rel, expected: record.sha256, reason: "missing" });
    else if (file.sha256.toLowerCase() !== record.sha256.toLowerCase()) violations.push({ path: rel, expected: record.sha256, actual: file.sha256, reason: "changed" });
  }
  for (const rel of files.keys()) {
    const flowId = flowIdOf(rel), doc = docKindOf(rel), version = versionedDocVersionOf(rel)!;
    if (!seen.has(`${flowId}|${doc}|${version}`) && version <= (max.get(`${flowId}|${doc}`) ?? 0)) violations.push({ path: rel, reason: "unrecorded" });
  }
  return violations;
}

/** Pure latest-record lookup; preserves legacy canonical/actual-path read compatibility. */
export function readVersionBaselineShaData(input: { baselineText: string | null; initialized: boolean; relPath: string }): BaselineShaResult {
  const rel = normalizeVersionedDocPath(input.relPath);
  if (rel === undefined) return { ok: false, reason: "baseline-corrupt" };
  const state = parseVersionBaselineState(input);
  if (!state.ok) return { ok: false, reason: state.reason };
  const record = latestRecordMap(state.records).get(rel) ?? state.records.find(record => record.path === rel || actualPathForRecord(record) === rel);
  return { ok: true, ...(record ? { sha256: record.sha256 } : {}) };
}

/** Plan registration without reading files, taking locks, installing caches or invoking a Provider. */
export function planVersionBaselineRegistration(input: VersionBaselineData & { relPath: string; recordedBy?: string; at: string }): VersionBaselineRegistration {
  const rel = normalizeVersionedDocPath(input.relPath);
  if (rel !== undefined && !isVersionedDocPath(rel)) return { registered: undefined, violations: [] };
  const fail = (violations: VersionBaselineViolation[] = []): VersionBaselineRegistration => ({ registered: false, violations });
  if (rel === undefined) return fail();
  const state = parseVersionBaselineState(input);
  if (!state.ok) return fail([{ path: VERSION_BASELINE_REL, reason: state.reason }]);
  const files = baselineFileMap(input), recordedBy = input.recordedBy ?? "app:session";
  if (!files || !files.has(rel) || !recordedBy.trim() || !Number.isFinite(Date.parse(input.at))) return fail([{ path: VERSION_BASELINE_REL, reason: "baseline-corrupt" }]);
  const append = (records: VersionBaselineRecord[], initialize = false): VersionBaselineRegistration => {
    const previous = input.baselineText ?? "", separator = previous.length && !previous.endsWith("\n") ? "\n" : "";
    return { registered: true, violations: [], nextText: previous + separator + records.map(record => `${JSON.stringify(record)}\n`).join(""), ...(initialize ? { initialize: true } : {}) };
  };
  const recordFor = (path: string, event: VersionBaselineEvent): VersionBaselineRecord => ({ v: 1, flowId: flowIdOf(path), doc: docKindOf(path)!,
    version: versionedDocVersionOf(path)!, path: canonicalPathFor(flowIdOf(path), docKindOf(path)!), sha256: files.get(path)!.sha256.toLowerCase(),
    event, recordedAt: input.at, recordedBy });
  if (!state.initialized) return append([...files.keys()].map(path => recordFor(path, "baseline")), true);
  const version = versionedDocVersionOf(rel)!, flowId = flowIdOf(rel), doc = docKindOf(rel)!;
  if (!hasVersionRecord(Buffer.from(files.get(rel)!.bytesBase64, "base64").toString("utf8"), version)) return fail();
  const prior = latestRecordMap(state.records).get(rel) ?? state.records.find(record => record.flowId === flowId && record.doc === doc && record.version === version);
  if (prior) {
    if (state.records.some(record => actualPathForRecord(record) === rel && record.event === "frozen")) return fail();
    if (prior.sha256.toLowerCase() === files.get(rel)!.sha256.toLowerCase()) return { registered: true, violations: [] };
    return append([recordFor(rel, "draft-updated")]);
  }
  const violations = verifyVersionBaselineData(input);
  if (violations.length) return fail(violations);
  const max = Math.max(0, ...state.records.filter(record => record.flowId === flowId && record.doc === doc).map(record => record.version));
  return version === max + 1 ? append([recordFor(rel, "version-added")]) : fail();
}

/** shell-post-audit 用：baseline 缺失/坏行/字段缺失 ⇒ fail-closed（不得静默跳过）。 */
export async function baselineShaFor(projectRoot: string, relPath: string): Promise<BaselineShaResult> {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined) return { ok: false, reason: "baseline-corrupt" };
  const state = await readBaselines(projectRoot);
  if (!state.ok) return { ok: false, reason: state.reason };
  const latest = latestRecordMap(state.records).get(rel);
  if (latest !== undefined) return { ok: true, sha256: latest.sha256 };
  return {
    ok: true,
    sha256: state.records.find((record) => actualPathForRecord(record) === rel || record.path === rel)?.sha256,
  };
}

// —————————————— 冻结同步快照（C2b 单一实现，F7/F33） ——————————————

export type VersionedDocFreezeSnapshotState = "ready" | "migration-required" | "corrupt" | "unknown";

export interface VersionedDocFreezeEntry {
  /** 实际项目相对路径（含 -vN.md）。 */
  path: string;
  version: number;
  sha256: string;
  frozen: boolean;
  reason?: DocFreezeReason;
  applicationId?: string;
  /** 仅 `draft-marker` 迁移标注（`migrated-draft`，不是 doc.freeze）。 */
  migratedDraft?: boolean;
}

export interface VersionedDocFreezeSnapshot {
  v: 1;
  schema: "doc-freezes/v1";
  state: VersionedDocFreezeSnapshotState;
  /** 快照构建时 `versions.jsonl` 文件字节 hash（一致性键；缓存对账用）。 */
  baselineSha256?: string;
  entries: readonly VersionedDocFreezeEntry[];
  builtAt: string;
}

const FREEZE_SNAPSHOT_SCHEMA = "doc-freezes/v1";

function snapshotKey(projectRoot: string): string {
  const resolved = path.resolve(projectRoot);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

const freezeSnapshotStore = new Map<string, VersionedDocFreezeSnapshot>();

function isValidFreezeSnapshot(value: unknown): value is VersionedDocFreezeSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<VersionedDocFreezeSnapshot>;
  if (snapshot.v !== 1 || snapshot.schema !== FREEZE_SNAPSHOT_SCHEMA) return false;
  if (
    snapshot.state !== "ready" &&
    snapshot.state !== "migration-required" &&
    snapshot.state !== "corrupt" &&
    snapshot.state !== "unknown"
  ) {
    return false;
  }
  if (typeof snapshot.builtAt !== "string" || snapshot.builtAt.trim() === "") return false;
  if (snapshot.baselineSha256 !== undefined && !isSha256Hex(snapshot.baselineSha256)) return false;
  if (!Array.isArray(snapshot.entries)) return false;
  for (const entry of snapshot.entries) {
    if (entry === null || typeof entry !== "object") return false;
    const item = entry as Partial<VersionedDocFreezeEntry>;
    const rel = typeof item.path === "string" ? normalizeVersionedDocPath(item.path) : undefined;
    if (rel === undefined || !isVersionedDocPath(rel)) return false;
    if (typeof item.version !== "number" || !Number.isInteger(item.version) || item.version < 1) return false;
    if (!isSha256Hex(item.sha256)) return false;
    if (typeof item.frozen !== "boolean") return false;
    if (item.reason !== undefined && !DOC_FREEZE_REASONS.includes(item.reason)) return false;
    if (item.applicationId !== undefined && (typeof item.applicationId !== "string" || item.applicationId.trim() === "")) return false;
    if (item.migratedDraft !== undefined && typeof item.migratedDraft !== "boolean") return false;
  }
  return true;
}

/**
 * 从 R9 baseline 记录构建冻结同步快照（纯函数，不读盘）：
 * · `migration.completed=false` ⇒ `migration-required`：既有文档视为 frozen、新路径视为 draft（F29）；
 * · `completed=true` ⇒ `ready`：有冻结记录 ⇒ frozen；否则 draft（含 `draft-marker` 迁移草稿）；
 * · 记录结构非法 ⇒ `corrupt`（查询 fail-closed）。
 */
export function buildVersionedDocFreezeSnapshot(input: {
  records: readonly VersionBaselineRecord[];
  migration: { completed: boolean };
  baselineSha256?: string;
  now?: () => Date;
}): VersionedDocFreezeSnapshot {
  const builtAt = (input.now ?? (() => new Date()))().toISOString();
  const corrupt = input.records.some(
    (record) =>
      record === null ||
      typeof record !== "object" ||
      record.v !== 1 ||
      !isVersionedDocKind(record.doc) ||
      typeof record.version !== "number" ||
      !Number.isInteger(record.version) ||
      record.version < 1 ||
      !isSha256Hex(record.sha256) ||
      !isVersionBaselineEvent(record.event) ||
      (record.event === "frozen" ? !isValidDocFreezeRecord(record.freeze) : record.freeze !== undefined),
  );
  if (corrupt) {
    return {
      v: 1,
      schema: FREEZE_SNAPSHOT_SCHEMA,
      state: "corrupt",
      ...(input.baselineSha256 !== undefined ? { baselineSha256: input.baselineSha256 } : {}),
      entries: [],
      builtAt,
    };
  }
  const entries: VersionedDocFreezeEntry[] = [];
  for (const record of latestRecordMap(input.records).values()) {
    const rel = normalizeVersionedDocPath(actualPathForRecord(record));
    if (rel === undefined || !isVersionedDocPath(rel)) continue;
    if (record.event === "frozen" && record.freeze !== undefined) {
      entries.push({
        path: rel,
        version: record.version,
        sha256: record.sha256,
        frozen: true,
        reason: record.freeze.reason,
        applicationId: record.freeze.applicationId,
      });
    } else if (record.event === "draft-marker") {
      entries.push({ path: rel, version: record.version, sha256: record.sha256, frozen: false, migratedDraft: true });
    } else {
      entries.push({ path: rel, version: record.version, sha256: record.sha256, frozen: false });
    }
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    v: 1,
    schema: FREEZE_SNAPSHOT_SCHEMA,
    state: input.migration.completed ? "ready" : "migration-required",
    ...(input.baselineSha256 !== undefined ? { baselineSha256: input.baselineSha256 } : {}),
    entries,
    builtAt,
  };
}

/** 安装冻结同步快照；结构非法 ⇒ 安装 `corrupt`（fail-closed，不沿用旧快照）。 */
export function installVersionedDocFreezeSnapshot(projectRoot: string, snapshot: VersionedDocFreezeSnapshot): void {
  freezeSnapshotStore.set(
    snapshotKey(projectRoot),
    isValidFreezeSnapshot(snapshot)
      ? snapshot
      : { v: 1, schema: FREEZE_SNAPSHOT_SCHEMA, state: "corrupt", entries: [], builtAt: new Date().toISOString() },
  );
}

/** 使冻结快照失效（单项目或全部）；失效后查询返回 unknown（fail-closed）。 */
export function invalidateVersionedDocFreezeSnapshot(projectRoot?: string): void {
  if (projectRoot === undefined) {
    freezeSnapshotStore.clear();
    return;
  }
  freezeSnapshotStore.delete(snapshotKey(projectRoot));
}

/** Pure cache metadata: a conservative migration-required lookup is not proof of completed migration. */
export function hasReadyVersionedDocFreezeSnapshot(projectRoot: string): boolean {
  return freezeSnapshotStore.get(snapshotKey(projectRoot))?.state === "ready";
}

/**
 * 生产唯一同步冻结查询（C2b）：只读**已安装**快照，不读 `doc-freezes.json`。
 * 返回 C1 `DocFreezeLookupState`：frozen / draft / unknown（未安装/损坏 ⇒ unknown，fail-closed）。
 */
export function versionedDocFreezeState(projectRoot: string, relPath: string, exists: boolean): DocFreezeLookupState {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined || !isVersionedDocPath(rel)) return "draft"; // 非版本化：本模块不适用
  const snapshot = freezeSnapshotStore.get(snapshotKey(projectRoot));
  if (snapshot === undefined) return "unknown";
  if (snapshot.state === "corrupt" || snapshot.state === "unknown") return "unknown";
  const entry = snapshot.entries.find((candidate) => pathKeyEqual(candidate.path, rel));
  if (entry !== undefined && entry.frozen) return "frozen";
  if (snapshot.state === "migration-required") return exists ? "frozen" : "draft";
  return "draft";
}

function pathKeyEqual(a: string, b: string): boolean {
  const left = normalizeVersionedDocPath(a);
  const right = normalizeVersionedDocPath(b);
  if (left === undefined || right === undefined) return false;
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** stable 路径绑定比较：大小写不敏感（C18，跨平台一致；stable 路径集合固定）。 */
function stablePathKeyEqual(a: string, b: string): boolean {
  const left = normalizeVersionedDocPath(a);
  const right = normalizeVersionedDocPath(b);
  if (left === undefined || right === undefined) return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * 从 R9 baseline 读取并构建 + 安装冻结同步快照（编排启动/会话打开/`doc.freeze` 后调用）。
 * baseline/marker 缺失或损坏 ⇒ 安装 corrupt 快照（查询未知/拒绝，不自动重建）。
 */
export async function refreshVersionedDocFreezeSnapshot(
  projectRoot: string,
  options: { migrationCompleted?: boolean; now?: () => Date } = {},
): Promise<VersionedDocFreezeSnapshot> {
  const state = await readBaselines(projectRoot);
  const baselineAbs = path.join(projectRoot, VERSION_BASELINE_REL);
  let baselineSha256: string | undefined;
  try {
    baselineSha256 = createHash("sha256").update(await readFile(baselineAbs)).digest("hex");
  } catch {
    baselineSha256 = undefined;
  }
  const builtAt = (options.now ?? (() => new Date()))().toISOString();
  const snapshot: VersionedDocFreezeSnapshot = state.ok
    ? buildVersionedDocFreezeSnapshot({
        records: state.records,
        migration: { completed: options.migrationCompleted ?? false },
        ...(baselineSha256 !== undefined ? { baselineSha256 } : {}),
        ...(options.now !== undefined ? { now: options.now } : {}),
      })
    : {
        v: 1,
        schema: FREEZE_SNAPSHOT_SCHEMA,
        state: "corrupt",
        ...(baselineSha256 !== undefined ? { baselineSha256 } : {}),
        entries: [],
        builtAt,
      };
  installVersionedDocFreezeSnapshot(projectRoot, snapshot);
  return snapshot;
}

// —————————————— 冻结 / 迁移标记追加（R9 单一写入者） ——————————————

export type DocBaselineAppendFailureReason =
  | "invalid-path"
  | "invalid-freeze"
  | "file-missing"
  | "hash-mismatch"
  | "baseline-missing"
  | "baseline-corrupt"
  | "marker-missing"
  | "frozen-conflict"
  | "fencing-lost";

export type DocBaselineAppendResult =
  | { ok: true; appended: number; skipped: number }
  | { ok: false; reason: DocBaselineAppendFailureReason; path?: string };

export interface DocFreezeAppendRequest {
  projectRoot: string;
  /** 实际文件路径（含 -vN.md）；canonical 路径亦可（需文件存在）。 */
  relPath: string;
  /** C1 唯一冻结子形状（type-import，不复制）。 */
  freeze: DocFreezeRecord;
  /** 可选：调用方已计算的文件 hash；提供时必须等于当前字节 hash（防冻结错内容）。 */
  sha256?: string;
  recordedBy?: string;
}

async function appendBaselineRecords(
  event: "frozen" | "draft-marker",
  inputs: ReadonlyArray<{ projectRoot: string; relPath: string; sha256?: string; recordedBy?: string; freeze?: DocFreezeRecord }>,
  options: { now?: () => Date },
): Promise<DocBaselineAppendResult> {
  if (inputs.length === 0) return { ok: true, appended: 0, skipped: 0 };
  const projectRoot = inputs[0]!.projectRoot;
  const key = snapshotKey(projectRoot);
  const release = await acquireVersionLock(projectRoot);
  try {
    const token = release.token;
    const state = await readBaselines(projectRoot);
    if (!state.ok) return { ok: false, reason: state.reason };
    const at = (options.now ?? (() => new Date()))().toISOString();
    const latest = latestRecordMap(state.records);
    const additions: VersionBaselineRecord[] = [];
    let skipped = 0;
    for (const input of inputs) {
      if (snapshotKey(input.projectRoot) !== key) return { ok: false, reason: "invalid-path" };
      const rel = normalizeVersionedDocPath(input.relPath);
      if (rel === undefined || !isVersionedDocPath(rel)) return { ok: false, reason: "invalid-path", path: input.relPath };
      const doc = docKindOf(rel);
      const version = versionedDocVersionOf(rel);
      const flowId = flowIdOf(rel);
      if (doc === undefined || version === undefined || flowId === "") return { ok: false, reason: "invalid-path", path: rel };
      if (event === "frozen" && !isValidDocFreezeRecord(input.freeze)) {
        return { ok: false, reason: "invalid-freeze", path: rel };
      }
      let bytes: Buffer;
      try {
        bytes = await readFile(path.join(projectRoot, rel));
      } catch {
        return { ok: false, reason: "file-missing", path: rel };
      }
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (input.sha256 !== undefined && input.sha256.toLowerCase() !== actualSha) {
        return { ok: false, reason: "hash-mismatch", path: rel };
      }
      const existing = latest.get(rel);
      if (existing !== undefined && existing.event === "frozen") {
        if (event === "frozen" && existing.sha256 === actualSha && existing.freeze !== undefined && input.freeze !== undefined
          && existing.freeze.reason === input.freeze.reason
          && existing.freeze.applicationId === input.freeze.applicationId) {
          skipped += 1;
          continue;
        }
        return { ok: false, reason: "frozen-conflict", path: rel };
      }
      if (existing !== undefined && event === "draft-marker" && existing.event === "draft-marker" && existing.sha256 === actualSha) {
        skipped += 1;
        continue;
      }
      const record: VersionBaselineRecord = {
        v: 1,
        flowId,
        doc,
        version,
        path: canonicalPathFor(flowId, doc),
        sha256: actualSha,
        recordedAt: at,
        event,
        recordedBy: input.recordedBy ?? "app:session",
        ...(event === "frozen" && input.freeze !== undefined ? { freeze: input.freeze } : {}),
      };
      additions.push(record);
      latest.set(rel, record); // 同批次重复目标按最后一条判定
    }
    if (additions.length === 0) return { ok: true, appended: 0, skipped };
    if (!(await ownsVersionLock(projectRoot, token))) return { ok: false, reason: "fencing-lost" };
    const baselineAbs = path.join(projectRoot, VERSION_BASELINE_REL);
    await mkdir(path.dirname(baselineAbs), { recursive: true });
    const existingText = state.initialized ? await readFile(baselineAbs, "utf8") : "";
    await atomicWrite(baselineAbs, existingText + additions.map((record) => `${JSON.stringify(record)}\n`).join(""));
    if (!state.initialized) {
      if (!(await ownsVersionLock(projectRoot, token))) return { ok: false, reason: "fencing-lost" };
      await atomicWrite(
        path.join(projectRoot, VERSION_INITIALIZED_REL),
        `${JSON.stringify({ v: 1, initializedAt: at })}\n`,
      );
    }
    const check = await readBaselines(projectRoot);
    if (!check.ok) return { ok: false, reason: "baseline-corrupt" };
    return { ok: true, appended: additions.length, skipped };
  } finally {
    await release();
  }
}

/**
 * 冻结记录追加（唯一写入者；同 `versions.lock` / fencing）：
 * 首次调用可在 baseline/marker 都不存在时建立 R9 基线（bootstrap/handoff-pin）。
 * 已冻结同路径：同 sha + 同 reason/applicationId ⇒ 幂等跳过；否则 `frozen-conflict`（冻结终态）。
 */
export function appendDocFreezeRecords(
  inputs: readonly DocFreezeAppendRequest[],
  options: { now?: () => Date } = {},
): Promise<DocBaselineAppendResult> {
  return appendBaselineRecords("frozen", inputs, options);
}

export interface DocDraftMarkerAppendRequest {
  projectRoot: string;
  relPath: string;
  sha256?: string;
  recordedBy?: string;
}

/** `migrated-draft` 迁移标注（`draft-marker`，不写 doc.freeze；冻结后拒绝标注）。 */
export function appendDocDraftMarkerRecords(
  inputs: readonly DocDraftMarkerAppendRequest[],
  options: { now?: () => Date } = {},
): Promise<DocBaselineAppendResult> {
  return appendBaselineRecords("draft-marker", inputs, options);
}

// —————————————— stable-write 一次性许可（F13 单一形状 + 同源判定） ——————————————

/**
 * F13：`StableWritePermitView` 是 C1 `StableWritePermit` 的**类型别名**——不得另造字段/
 * 状态枚举；许可快照存 `StableWritePermit[]`。需要 diffPreview 等展示字段时用
 * `Pick`/交叉附加（record 侧承载），不得扩 permit。
 */
export type StableWritePermitView = StableWritePermit;

/** stable 路径识别结果（kind/roleId 由路径唯一推导；不判写权）。 */
export interface StableWritePathInfo {
  kind: StableFileKind;
  roleId?: string;
  /** canonical 项目相对路径（实际大小写按输入；比较用大小写不敏感）。 */
  path: string;
}

/**
 * stable 文件路径识别：`docs/workflow.md`（workflow/convener）、
 * `角色卡/<roleId>/role-card.md`、`角色卡/<roleId>/boundary.yaml`（单层非内置角色目录）。
 * `角色卡/governance-boundary.yaml`（应用治理边界）不匹配。复用 `normalizeVersionedDocPath` 逃逸拒绝。
 */
export function stableWritePathOf(relPath: string): StableWritePathInfo | undefined {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined) return undefined;
  const segments = rel.split("/");
  if (segments.length === 2 && segments[0]!.toLowerCase() === "docs" && segments[1]!.toLowerCase() === "workflow.md") {
    return { kind: "workflow", roleId: "convener", path: "docs/workflow.md" };
  }
  if (segments.length === 3 && segments[0] === "角色卡") {
    const roleId = segments[1]!;
    if (roleId === "" || roleId === "." || roleId === ".." || roleId.includes("\\")) return undefined;
    if (isBuiltInGovernanceRoleId(roleId)) return undefined;
    const file = segments[2]!.toLowerCase();
    if (file === "role-card.md") return { kind: "role-card", roleId, path: `角色卡/${roleId}/role-card.md` };
    if (file === "boundary.yaml") return { kind: "boundary", roleId, path: `角色卡/${roleId}/boundary.yaml` };
  }
  return undefined;
}

const permitSnapshotStore = new Map<string, readonly StableWritePermit[]>();

function isValidPermitShape(value: unknown): value is StableWritePermit {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const permit = value as Partial<StableWritePermit>;
  if (permit.v !== 1 || permit.schema !== "stable-write/v1") return false;
  for (const field of ["permitId", "requestId", "roleId", "path", "approvedAt", "expiresAt", "issuedAt"] as const) {
    if (typeof permit[field] !== "string" || permit[field]!.trim() === "") return false;
  }
  if (typeof permit.kind !== "string" || !["workflow", "role-card", "boundary"].includes(permit.kind)) return false;
  if (permit.baseSha256 === undefined || (permit.baseSha256 !== "" && !isSha256Hex(permit.baseSha256))) return false;
  if (!isSha256Hex(permit.targetSha256)) return false;
  if (typeof permit.status !== "string" || !(STABLE_WRITE_PERMIT_STATUSES as readonly string[]).includes(permit.status)) return false;
  const authority = permit.authority;
  if (authority === null || typeof authority !== "object") return false;
  const decisionId = (authority as { decisionId?: unknown }).decisionId;
  const confirmationId = (authority as { confirmationId?: unknown }).confirmationId;
  const hasDecision = typeof decisionId === "string" && decisionId.trim() !== "";
  const hasConfirmation = typeof confirmationId === "string" && confirmationId.trim() !== "";
  if (!hasDecision && !hasConfirmation) return false;
  if (decisionId !== undefined && !hasDecision) return false;
  if (confirmationId !== undefined && !hasConfirmation) return false;
  return true;
}

/** 安装许可同步快照（唯一实现；编排/D1 只调用，不自建第二份 Map）。非法许可被丢弃。 */
export function installStableWritePermitSnapshot(projectRoot: string, permits: readonly StableWritePermit[]): void {
  const valid = permits.filter(isValidPermitShape).map((permit) => ({ ...permit }));
  permitSnapshotStore.set(snapshotKey(projectRoot), Object.freeze(valid));
}

/** 许可快照失效（单项目或全部）⇒ `stableWriteDecision` 拒绝（fail-closed）。 */
export function invalidateStableWritePermitSnapshot(projectRoot?: string): void {
  if (projectRoot === undefined) {
    permitSnapshotStore.clear();
    return;
  }
  permitSnapshotStore.delete(snapshotKey(projectRoot));
}

/**
 * post-write `completeWrite` 消费后同步内存许可快照（标记 consumed + consumedAt）。
 * 不写盘、不发事件（持久化/账本归编排 B-11/C2c）；随后应由编排刷新许可快照。
 */
export function noteStableWritePermitConsumed(projectRoot: string, permitId: string, at?: string): void {
  const key = snapshotKey(projectRoot);
  const existing = permitSnapshotStore.get(key);
  if (existing === undefined) return;
  const consumedAt = at ?? new Date().toISOString();
  permitSnapshotStore.set(
    key,
    Object.freeze(
      existing.map((permit) =>
        permit.permitId === permitId ? { ...permit, status: "consumed" as const, consumedAt } : permit,
      ),
    ),
  );
}

function stableOwnerOf(kind: StableFileKind | undefined): RejectionOwner {
  if (kind === "workflow") return "convener";
  if (kind === "role-card" || kind === "boundary") return "nominator";
  return "app";
}

function legacyStableWriteDenied(
  code: StableWriteErrorCode,
  missing: string[],
  options: { owner?: RejectionOwner; action?: string; retryable?: boolean; docs?: string[] } = {},
): StableWriteDeniedDecision {
  const rejection = makeMechanicalRejection(code, missing, {
    owner: options.owner ?? "app",
    action: options.action ?? "重新走 stable-write 确认卡 / appointment-write；不得用普通写通道绕过。",
    retryable: options.retryable ?? true,
    ...(options.docs !== undefined ? { docs: options.docs } : {}),
  });
  const reason = formatMechanicalRejection(rejection);
  return {
    allowed: false,
    code,
    rejection,
    reason,
    writeDecision: { allowed: false, reason, allowedByRoot: { skill: [], project: [] }, code, rejection },
  };
}

/** G-owned ordinary rejection value; the managed path does not call another owner's private formatter. */
function stableWriteDeniedFromFacts(code: StableWriteErrorCode, missing: string[], options: {
  owner?: RejectionOwner; action?: string; retryable?: boolean; docs?: string[];
} = {}): StableWriteDeniedDecision {
  const rejection: MechanicalRejection = { code, missing: missing.filter(value => value.trim()).slice(0, 5),
    owner: options.owner ?? "app", action: options.action ?? "重新取得实际 stable-write 许可与文件事实后重试。",
    retryable: options.retryable ?? true, docs: (options.docs ?? []).slice(0, 5) };
  const reason = `${rejection.missing.join("；")}。下一步：${rejection.action} 谁来做：${rejection.owner}。[技术 code：${code}]`;
  return { allowed: false, reason, code, rejection, writeDecision: { allowed: false, reason, code, rejection, allowedByRoot: { skill: [], project: [] } } };
}

export type StableWriteDeniedDecision = {
  allowed: false;
  reason: string;
  code: StableWriteErrorCode;
  rejection: MechanicalRejection;
  /**
   * F13 映射：可直接作为 `WriteGate` 的拒绝返回（`allowedByRoot` 空集 + code/rejection）。
   * run-role：denied ⇒ 返回本字段；allowed ⇒ 继续 `baseGate` 并返回其 `WriteDecision`
   * （`matchedEntry` 由 baseGate 提供，本判定不构造 allowed 的 WriteDecision）。
   */
  writeDecision: Extract<WriteDecision, { allowed: false }>;
};

export type StableWriteDecision =
  | {
      allowed: true;
      permitId: string;
      requestId: string;
      /** `decisionId` / `confirmationId` 至少一个（与 permit.authority 同源）。 */
      decisionId?: string;
      confirmationId?: string;
    }
  | StableWriteDeniedDecision;

/**
 * stable 写入**一次性许可**判定（F13；同步、纯函数、只读、fail-closed）：
 * 入参 = C1 `StableWriteDecisionInput` `{projectRoot, relPath, sha256, permit?, now?}`。
 *
 * 校验：stable 路径/kind/roleId 一致；permit 必须在**已安装的快照**中且与快照逐字段一致
 * （防伪造/陈旧对象）；`status==="approved"`；authority 至少一个 id；`approvedAt`/`expiresAt`
 * 合法且未过期，TTL ≤ 30 分钟（C1 `STABLE_WRITE_PERMIT_TTL_MS`）；未消费；
 * `sha256===targetSha256`（写入最终字节）；`baseSha256` 与当前文件一致（`""` = 写入前不存在）。
 *
 * 不做状态变更：不写盘、不消费、不发事件（消费在 post-write `completeWrite(actualSha)`）。
 */
export type StableCurrentFileFacts = { state: "missing" } | { state: "present"; sha256: string } | { state: "unknown"; reason: string };
export type StableWriteFactsInput = StableWriteDecisionInput & { currentFile: StableCurrentFileFacts };

/** Explicit legacy effect path, retained only until the real callers migrate together. */
export function stableWriteDecision(input: StableWriteDecisionInput): StableWriteDecision {
  return evaluateStableWriteDecision(input, () => {
    try { return { state: "present", sha256: createHash("sha256").update(readFileSync(path.join(input.projectRoot, normalizeVersionedDocPath(input.relPath)!))).digest("hex") }; }
    catch { return { state: "missing" }; }
  });
}

/** Managed synchronous predicate: only ordinary current-file facts, no filesystem access or live fallback. */
export function stableWriteDecisionFromFacts(input: StableWriteFactsInput): StableWriteDecision {
  return evaluateStableWriteDecision(input, () => input.currentFile, true);
}

// The private reader preserves the legacy call's read-after-permit ordering; the managed entry only supplies data.
function evaluateStableWriteDecision(input: StableWriteDecisionInput, currentFile: () => StableCurrentFileFacts | undefined, pure = false): StableWriteDecision {
  const stableWriteDenied = pure ? stableWriteDeniedFromFacts : legacyStableWriteDenied;
  const rel = normalizeVersionedDocPath(input.relPath);
  if (rel === undefined) {
    return stableWriteDenied("stable-write-invalid", [`路径非法（absolute/逃逸）：${String(input.relPath)}`]);
  }
  const stable = stableWritePathOf(rel);
  if (stable === undefined) {
    return stableWriteDenied("stable-write-path-mismatch", [`不是 stable 文件（workflow/role-card/boundary）：${rel}`], {
      docs: [rel],
    });
  }
  const owner = stableOwnerOf(stable.kind);
  if (!isSha256Hex(input.sha256)) {
    return stableWriteDenied("stable-write-invalid", [`写入内容 sha256 非法（需 64 位十六进制）：${rel}`], {
      owner,
      docs: [rel],
    });
  }
  const permit = input.permit;
  if (permit === undefined) {
    return stableWriteDenied(
      "stable-write-permit-missing",
      [`stable 写入缺少一次性许可：${rel}（须先经 stable-write 确认卡 / appointment-write 批准）`],
      { owner, docs: [rel] },
    );
  }
  const snapshot = permitSnapshotStore.get(snapshotKey(input.projectRoot));
  if (snapshot === undefined) {
    return stableWriteDenied(
      "stable-write-invalid",
      [`stable 许可快照不可用（未安装/刷新失败）：${rel} 的写入被拒绝（fail-closed）`],
      { owner, docs: [rel] },
    );
  }
  const authoritative = snapshot.find((candidate) => candidate.permitId === permit.permitId);
  if (authoritative === undefined) {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`许可不在已安装的许可快照中（伪造/未签发/已作废）：${permit.permitId}`],
      { owner, docs: [rel] },
    );
  }
  // 先按**快照**判定一次性/有效期状态（调用方对象陈旧时仍应给出 consumed/expired 语义）；
  // 放行前仍要求调用方对象与快照逐字段一致（防伪造/陈旧对象）。
  if (authoritative.status === "consumed" || authoritative.consumedAt !== undefined) {
    return stableWriteDenied(
      "stable-write-permit-consumed",
      [`许可已被消费（一次性）：${authoritative.permitId}`],
      { owner, docs: [rel] },
    );
  }
  if (authoritative.status === "expired") {
    return stableWriteDenied(
      "stable-write-permit-expired",
      [`许可已过期：${authoritative.permitId}（TTL 30 分钟；请重新确认，不自动补发）`],
      { owner, docs: [rel] },
    );
  }
  if (authoritative.status !== "approved") {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`许可状态不可用（${authoritative.status}）：${authoritative.permitId}`],
      { owner, docs: [rel] },
    );
  }
  if (!samePermit(authoritative, permit)) {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`许可与已安装快照不一致（篡改/陈旧对象）：${permit.permitId}`],
      { owner, docs: [rel] },
    );
  }
  if (!stablePathKeyEqual(authoritative.path, stable.path) || authoritative.kind !== stable.kind) {
    return stableWriteDenied(
      "stable-write-path-mismatch",
      [`许可路径/kind 与写入目标不一致：许可 ${authoritative.path}（${authoritative.kind}）≠ 目标 ${rel}（${stable.kind}）`],
      { owner, docs: [rel] },
    );
  }
  if (stable.kind === "workflow") {
    if (authoritative.roleId !== "convener") {
      return stableWriteDenied(
        "stable-write-path-mismatch",
        [`workflow 写入许可只允许 convener：许可 roleId=${authoritative.roleId}`],
        { owner, docs: [rel] },
      );
    }
  } else if (authoritative.roleId !== stable.roleId) {
    return stableWriteDenied(
      "stable-write-path-mismatch",
      [`许可 roleId 与路径角色目录不一致：${authoritative.roleId} ≠ ${stable.roleId}`],
      { owner, docs: [rel] },
    );
  }
  const decisionId = authoritative.authority.decisionId;
  const confirmationId = authoritative.authority.confirmationId;
  if ((decisionId === undefined || decisionId.trim() === "") && (confirmationId === undefined || confirmationId.trim() === "")) {
    return stableWriteDenied(
      "stable-write-confirmation-missing",
      [`许可缺少客户确认绑定（decisionId / confirmationId 至少一个）：${authoritative.permitId}`],
      { owner, docs: [rel] },
    );
  }
  const nowMs = (input.now ?? (() => new Date()))().getTime();
  const approvedMs = Date.parse(authoritative.approvedAt);
  const expiresMs = Date.parse(authoritative.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(approvedMs) || !Number.isFinite(expiresMs)) {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`许可时间字段非法（approvedAt/expiresAt 需 ISO 时间）：${authoritative.permitId}`],
      { owner, docs: [rel] },
    );
  }
  if (nowMs >= expiresMs) {
    return stableWriteDenied(
      "stable-write-permit-expired",
      [`许可已过期：${authoritative.permitId}（expiresAt=${authoritative.expiresAt}）`],
      { owner, docs: [rel] },
    );
  }
  if (expiresMs <= approvedMs || expiresMs - approvedMs > STABLE_WRITE_PERMIT_TTL_MS) {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`许可有效期超出 TTL 上限（30 分钟）：${authoritative.permitId}`],
      { owner, docs: [rel] },
    );
  }
  if (input.sha256.toLowerCase() !== authoritative.targetSha256.toLowerCase()) {
    return stableWriteDenied(
      "stable-write-hash-mismatch",
      [`写入内容 hash 不等于批准的 targetSha256：${rel}（批准 ${authoritative.targetSha256}，实际 ${input.sha256}）`],
      { owner, docs: [rel] },
    );
  }
  const current = currentFile();
  if (!current || current.state === "unknown" || (current.state !== "missing" && !(current.state === "present" && isSha256Hex(current.sha256))))
    return stableWriteDenied("stable-write-permit-invalid", [`当前文件事实缺失/未知；不得猜作missing：${rel}`], { owner, docs: [rel] });
  const currentSha = current.state === "present" ? current.sha256.toLowerCase() : undefined;
  if (currentSha === undefined) {
    if (authoritative.baseSha256 !== "") {
      return stableWriteDenied(
        "stable-write-permit-invalid",
        [`文件不存在但许可要求既有 baseSha256=${authoritative.baseSha256}：${rel}（批准后文件状态已变化，请重新确认）`],
        { owner, docs: [rel] },
      );
    }
  } else if (authoritative.baseSha256 === "" || authoritative.baseSha256.toLowerCase() !== currentSha) {
    return stableWriteDenied(
      "stable-write-permit-invalid",
      [`批准后文件已变化（baseSha256 不一致）：${rel}（当前 ${currentSha}，许可 ${authoritative.baseSha256 || "（不存在）"}）；请重新确认`],
      { owner, docs: [rel] },
    );
  }
  return {
    allowed: true,
    permitId: authoritative.permitId,
    requestId: authoritative.requestId,
    ...(decisionId !== undefined && decisionId.trim() !== "" ? { decisionId } : {}),
    ...(confirmationId !== undefined && confirmationId.trim() !== "" ? { confirmationId } : {}),
  };
}

function samePermit(a: StableWritePermit, b: StableWritePermit): boolean {
  const samePath = stablePathKeyEqual(a.path, b.path);
  const sameAuthority =
    ((a.authority.decisionId ?? "") === (b.authority.decisionId ?? "")) &&
    ((a.authority.confirmationId ?? "") === (b.authority.confirmationId ?? ""));
  return (
    samePath &&
    a.v === b.v &&
    a.schema === b.schema &&
    a.permitId === b.permitId &&
    a.requestId === b.requestId &&
    a.roleId === b.roleId &&
    a.kind === b.kind &&
    sameAuthority &&
    a.baseSha256.toLowerCase() === b.baseSha256.toLowerCase() &&
    a.targetSha256.toLowerCase() === b.targetSha256.toLowerCase() &&
    a.status === b.status &&
    a.approvedAt === b.approvedAt &&
    a.expiresAt === b.expiresAt &&
    (a.consumedAt ?? "") === (b.consumedAt ?? "") &&
    a.issuedAt === b.issuedAt
  );
}

// 2026-10-29（v2.12）：`versions.lock` O_EXCL 独占锁——内容 {pid,startedAt,token}。
export interface VersionLockInfo {
  pid: number;
  startedAt: string;
  token: string;
}

export class VersionLockError extends Error {
  readonly code = "version-lock-timeout";
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 获取项目级独占锁；陈旧锁（pid 不存在/超龄）凭 token 安全接管；超时 fail-closed。 */
export type VersionLockRelease = (() => Promise<void>) & { token: string };

/** 校验自己仍持有锁（fencing）：旧 holder 在接管后的写入必须无效。 */
export async function ownsVersionLock(projectRoot: string, token: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(projectRoot, VERSION_LOCK_REL), "utf8");
    const info = JSON.parse(raw) as Partial<VersionLockInfo>;
    return info.token === token;
  } catch {
    return false;
  }
}

/** 获取项目级独占锁：临时文件+link 原子创建带内容锁；活锁不被超龄接管；超时 fail-closed。 */
export async function acquireVersionLock(
  projectRoot: string,
  options: { timeoutMs?: number; staleMs?: number; now?: () => Date } = {},
): Promise<VersionLockRelease> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());
  const lockPath = path.join(projectRoot, VERSION_LOCK_REL);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const startedAt = now().toISOString();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tmp = `${lockPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
    const handle = await open(tmp, "wx");
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt, token }), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const release = (async () => {
      await releaseVersionLock(projectRoot, token);
    }) as VersionLockRelease;
    release.token = token;
    try {
      await link(tmp, lockPath); // 原子：目标已存在 ⇒ EEXIST
      await unlink(tmp).catch(() => undefined);
      return release;
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (code !== "EEXIST") {
        await unlink(tmp).catch(() => undefined);
        throw error;
      }
    }
    // 陈旧接管：仅 pid 不存在（活锁即使超龄也不接管）。
    // v2.15：带新 token 的临时锁原子 rename 覆盖，再重读确认；不是 rename 旧锁到旁路再删。
    try {
      const raw = await readFile(lockPath, "utf8");
      const info = JSON.parse(raw) as Partial<VersionLockInfo>;
      if (!pidAlive(Number(info.pid))) {
        await rename(tmp, lockPath); // 原子覆盖
        const confirm = await readFile(lockPath, "utf8").catch(() => undefined);
        if (confirm !== undefined) {
          try {
            const confirmed = JSON.parse(confirm) as Partial<VersionLockInfo>;
            if (confirmed.token === token) return release;
          } catch {
            /* 被其他接管者覆盖：继续竞争 */
          }
        }
        continue;
      }
    } catch {
      /* 空内容窗口/坏锁：不接管，重试到超时 */
    }
    await unlink(tmp).catch(() => undefined);
    if (Date.now() >= deadline) throw new VersionLockError(`版本登记锁超时（${timeoutMs}ms）；请稍后重试。`);
    await delay(25);
  }
}

/** 只释放自己 token 的锁。 */
export async function releaseVersionLock(projectRoot: string, token: string): Promise<void> {
  const lockPath = path.join(projectRoot, VERSION_LOCK_REL);
  try {
    const raw = await readFile(lockPath, "utf8");
    const info = JSON.parse(raw) as Partial<VersionLockInfo>;
    if (info.token === token) await unlink(lockPath);
  } catch {
    /* 已被接管/不存在：不报错 */
  }
}

async function withProjectVersionLock<T>(projectRoot: string, fn: (token: string) => Promise<T>): Promise<T> {
  const release = await acquireVersionLock(projectRoot);
  try {
    return await fn(release.token);
  } finally {
    await release();
  }
}

/** 属主写成功后 guard 锁内追加/回退入口：只登记本次写入的文件（不扫描补齐其他文件）。 */
export async function registerVersionedDocAfterWrite(input: {
  projectRoot: string;
  absPath: string;
  recordedBy?: string;
  now?: () => Date;
}): Promise<boolean | undefined> {
  const rel = path.relative(input.projectRoot, input.absPath).split(path.sep).join("/");
  if (!isVersionedDocPath(rel)) return; // 非版本化文档：不登记，也不阻断写入
  const doc = docKindOf(rel);
  const version = versionedDocVersionOf(rel);
  const flowId = flowIdOf(rel);
  if (doc === undefined || version === undefined || flowId === "") return false;
  const release = await acquireVersionLock(input.projectRoot);
  try {
    const token = release.token;
    const state = await readBaselines(input.projectRoot);
    if (!state.ok) return false; // marker/baseline 坏：fail-closed，不重建
    if (!state.initialized) {
      // TOFU 初始化：首次属主写成功后，把现有版本化文档整体快照为基线（之后仅单文件追加）。
      const added = await recordVersionedDocBaselinesLocked(
        { projectRoot: input.projectRoot, recordedBy: "app:session", ...(input.now !== undefined ? { now: input.now } : {}) },
        token,
      );
      return added >= 0;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(input.absPath);
    } catch {
      return false;
    }
    const text = bytes.toString("utf8");
    // v2.15：完整预检——版本头/版本记录章节/当前最大 N+1（旧版未改由 verify 兜底）。
    if (!hasVersionRecord(text, version)) return false;
    if (!state.initialized && version !== 1) return false;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const latest = latestRecordMap(state.records);
    const existing = latest.get(rel) ?? state.records.find(
      (record) => record.flowId === flowId && record.doc === doc && record.version === version,
    );
    if (existing !== undefined) {
      // 冻结是终态：写后登记一律拒绝（冻结覆盖应在 gate 已拒绝；此处 fail-closed）。
      const frozenRecord = state.records.find(
        (record) => actualPathForRecord(record) === rel && record.event === "frozen",
      );
      if (frozenRecord !== undefined || existing.event === "frozen") return false;
      if (existing.sha256 === sha256) return true;
      // C2b：草稿原位改 ⇒ 追加 draft-updated（latest-record-per-path），不误报旧 sha。
      if (!(await ownsVersionLock(input.projectRoot, token))) return false;
      const record: VersionBaselineRecord = {
        v: 1,
        flowId,
        doc,
        version,
        path: canonicalPathFor(flowId, doc),
        sha256,
        recordedAt: (input.now ?? (() => new Date()))().toISOString(),
        event: "draft-updated",
        recordedBy: "app:session",
      };
      const baselineAbs = path.join(input.projectRoot, VERSION_BASELINE_REL);
      const existingText = await readFile(baselineAbs, "utf8");
      await atomicWrite(baselineAbs, existingText + `${JSON.stringify(record)}\n`);
      return true;
    }
    if (state.initialized) {
      const violations = await verifyVersionedDocBaselinesLocked({ projectRoot: input.projectRoot });
      if (violations.some((violation) => violation.reason === "changed" || violation.reason === "missing")) return false;
      const max = Math.max(
        0,
        ...state.records.filter((record) => record.flowId === flowId && record.doc === doc).map((record) => record.version),
      );
      if (version !== max + 1) return false; // 只允许当前最大 N+1（不跳号/不回填旧版）
    }
    // fencing：写基线/rename 前重读锁，旧 holder 不得写入。
    if (!(await ownsVersionLock(input.projectRoot, token))) return false;
    const record: VersionBaselineRecord = {
      v: 1,
      flowId,
      doc,
      version,
      path: canonicalPathFor(flowId, doc),
      sha256,
      recordedAt: (input.now ?? (() => new Date()))().toISOString(),
      event: state.initialized ? "version-added" : "baseline",
      recordedBy: "app:session",
    };
    const baselineAbs = path.join(input.projectRoot, VERSION_BASELINE_REL);
    await mkdir(path.dirname(baselineAbs), { recursive: true });
    const existingText = state.initialized ? await readFile(baselineAbs, "utf8") : "";
    await atomicWrite(baselineAbs, existingText + `${JSON.stringify(record)}\n`);
    if (!state.initialized) {
      if (!(await ownsVersionLock(input.projectRoot, token))) return false;
      await atomicWrite(
        path.join(input.projectRoot, VERSION_INITIALIZED_REL),
        `${JSON.stringify({ v: 1, initializedAt: record.recordedAt })}\n`,
      );
    }
    return true;
  } finally {
    await release();
  }
}

/** 串行入口：TOFU 初始化 + 新版本登记。 */
export function recordVersionedDocBaselines(input: {
  projectRoot: string;
  now?: () => Date;
  recordedBy?: string;
}): Promise<number> {
  return withProjectVersionLock(input.projectRoot, (token) => recordVersionedDocBaselinesLocked(input, token));
}

/** 串行入口：基线校验（与登记同一锁，避免读到写一半）。 */
export function verifyVersionedDocBaselines(input: { projectRoot: string }): Promise<VersionBaselineViolation[]> {
  return withProjectVersionLock(input.projectRoot, () => verifyVersionedDocBaselinesLocked(input));
}
