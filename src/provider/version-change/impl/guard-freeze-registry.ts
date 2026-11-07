// O-owned R9 storage: exact baseline bytes, project lock/fencing, immutable freeze append,
// storage projections and bounded versioned-document reads. No G private I/O or upward calls.
// Source invariants are imported from Model; G owns parsing/validation and installs its own snapshots.
// The existing file remains the Provider implementation; no new shared service is introduced.

import { readFile, mkdir, open, link, unlink, rename, readdir, realpath, stat, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { appendJsonlLine, readJsonlLedger } from "../../../common/shared/jsonl-ledger.ts";
import type { TaskStateEvent } from "../../../model/runtime.ts";
import { validateTaskStateEvent } from "../../../common/编排/task-state.ts";
import { DOC_FREEZE_REASONS, DOC_FREEZE_CUSTOMER_REASONS, isValidDocFreezeRecord, type DocFreezeReason } from "../../../model/version-change.ts";
import { isDirectActionSource, isSnapshotRef, isCompleteSnapshot, isGitOid, type CompleteSnapshot } from "../../../model/trunk.ts";
import path from "node:path";

import type { DocFreezeRecord } from "../../../model/version-change.ts";
import type {
  DraftMarkerInput,
  FreezeRecordInput,
  FreezeRegistryState,
  FreezeRegistryStore,
  VersionBaselineState, VersionBaselineWriteInput, VersionBaselineWriteResult,
  CommittedFreezeBasis,
} from "../abstract/freeze-cache.ts";

/** Raw bytes and fencing only. G Service owns baseline/register/verify business rules. */
export async function readVersionBaselineState(projectRoot: string): Promise<VersionBaselineState> {
  const readOptional = async (rel: string): Promise<string | null> => {
    try { return await readFile(path.join(projectRoot, rel), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  const marker = await readOptional(VERSION_INITIALIZED_REL);
  return { text: await readOptional(VERSION_BASELINE_REL), initialized: marker !== null };
}
export async function writeVersionBaselineState(projectRoot: string, input: VersionBaselineWriteInput): Promise<VersionBaselineWriteResult> {
  try {
    if (!(await ownsVersionLock(projectRoot, input.lockToken))) return { ok: false, reason: "fencing-lost" };
    const state = await readVersionBaselineState(projectRoot);
    const digest = state.text === null ? null : createHash("sha256").update(state.text).digest("hex");
    if (digest !== input.expectedSha256) return { ok: false, reason: "baseline-cas-conflict" };
    if (input.initialize && (state.text !== null || state.initialized)) return { ok: false, reason: "already-initialized" };
    if (!input.initialize && (!state.initialized || state.text === null)) return { ok: false, reason: "baseline-missing" };
    await mkdir(path.join(projectRoot, ".ans/state"), { recursive: true });
    if (!(await ownsVersionLock(projectRoot, input.lockToken))) return { ok: false, reason: "fencing-lost" };
    await atomicWrite(path.join(projectRoot, VERSION_BASELINE_REL), input.text);
    if (input.initialize) {
      if (!(await ownsVersionLock(projectRoot, input.lockToken))) return { ok: false, reason: "fencing-lost" };
      await atomicWrite(path.join(projectRoot, VERSION_INITIALIZED_REL), `${JSON.stringify({ v: 1, initializedAt: new Date().toISOString() })}\n`);
    }
    return { ok: true };
  } catch (error) { return { ok: false, reason: (error as NodeJS.ErrnoException).code ?? String(error) }; }
}

export function completeSnapshotDigest(files: CompleteSnapshot["files"]): string {
  return createHash("sha256").update(JSON.stringify([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(file => [file.path, file.sha256.toLowerCase(), file.bytesBase64]))).digest("hex");
}
export function isStoredCompleteSnapshot(value: unknown): value is CompleteSnapshot {
  return isCompleteSnapshot(value) && /^[a-zA-Z0-9_-]{1,160}$/.test(value.snapshotId)
    && new Set(value.files.map(file => file.path.toLowerCase())).size === value.files.length
    && value.files.every(file => createHash("sha256").update(Buffer.from(file.bytesBase64, "base64")).digest("hex") === file.sha256.toLowerCase()
      && Buffer.from(file.bytesBase64, "base64").toString("base64") === file.bytesBase64)
    && completeSnapshotDigest(value.files) === value.digest;
}
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
  if (!markerPresent) return { ok: false, reason: "marker-missing" };
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


import type { VersionedDocFreezeSnapshot, VersionedDocFreezeEntry } from "../abstract/freeze-cache.ts";
const FREEZE_SNAPSHOT_SCHEMA = "doc-freezes/v1";
function snapshotKey(root: string): string { return path.resolve(root).toLowerCase(); }

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
  | { ok: false; reason: DocBaselineAppendFailureReason; path?: string; detail?: string };

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

/** Under the existing R9 lock, a retained migration receipt may gain actual confirmation evidence.
 * The old bytes/receipt remain immutable; the persisted decision and snapshot must prove this exact version. */
async function confirmsMigratedIntent(projectRoot: string, rel: string, version: number, sha256: string, freeze: DocFreezeRecord): Promise<boolean> {
  if (freeze.reason !== "intent-confirmed" || !isSnapshotRef(freeze.snapshotRef)
    || !/^[a-zA-Z0-9_-]{1,160}$/.test(freeze.snapshotRef.snapshotId) || !isDirectActionSource(freeze.source)
    || (freeze.source.kind !== "customer-decision" && freeze.source.kind !== "chief-delegated")) return false;
  const source = freeze.source, requestId = source.requestId;
  if (!requestId || freeze.applicationId !== `intent-${requestId}`) return false;
  const read = await readOperationEvents(projectRoot); if (!read.ok) return false;
  const rows = read.records.filter(row => row.value.requestId === requestId);
  const createdRows = rows.filter(row => row.value.kind === "request.created"), resolvedRows = rows.filter(row => row.value.kind === "request.resolved");
  if (createdRows.length !== 1 || resolvedRows.length !== 1) return false;
  const created = validateTaskStateEvent(createdRows[0]!.value), resolved = validateTaskStateEvent(resolvedRows[0]!.value);
  if (!created.ok || created.event.kind !== "request.created" || !resolved.ok || resolved.event.kind !== "request.resolved"
    || created.event.sourceRoleId !== "chief" || created.event.cardKind !== "intent-confirm" || created.event.flowId !== flowIdOf(rel)
    || resolved.event.cardKind !== "intent-confirm" || !resolved.event.selectedOptionIds?.includes("confirm")
    || resolved.event.selectedOptionIds.includes("revise") || resolved.event.at !== freeze.frozenAt || source.at !== resolved.event.at) return false;
  if (source.kind === "customer-decision") {
    if (freeze.origin !== "customer" || resolved.event.by !== "customer" || resolved.event.decisionId !== source.decisionId
      || freeze.decisionId !== source.decisionId || resolved.event.judge || resolved.event.directiveId) return false;
  } else if (freeze.origin !== "chief-delegated" || resolved.event.by !== "chief-delegated" || resolved.event.decisionId !== undefined
    || source.disposition !== "select" || JSON.stringify(resolved.event.actionSource) !== JSON.stringify(source)) return false;
  const marker = `[ans-intent-evidence snapshot=${freeze.snapshotRef.snapshotId} path=${rel} sha256=${sha256} version=${version}]`;
  if (typeof created.event.context !== "string" || !created.event.context.includes(marker)) return false;
  try {
    const snapshot: unknown = JSON.parse(await readFile(path.join(projectRoot, ".ans/trunk/snapshots", `${freeze.snapshotRef.snapshotId}.json`), "utf8"));
    return isStoredCompleteSnapshot(snapshot) && snapshot.digest === freeze.snapshotRef.digest
      && snapshot.files.some(file => file.path === rel && file.sha256 === sha256);
  } catch { return false; }
}

/** Exact same bytes may retain migration history and gain their real, already committed effect receipt. */
async function confirmsMigratedPublication(projectRoot: string, rel: string, version: number, sha256: string, freeze: DocFreezeRecord, proof?: CommittedFreezeBasis): Promise<string | undefined> {
  if (!proof || freeze.reason !== "role-direct-applied" || freeze.origin !== "role-direct" || !isDirectActionSource(freeze.source)
    || freeze.source.kind !== "role-direct" || !["version-upgrade", "detail-amendment"].includes(freeze.source.action)
    || !isSnapshotRef(freeze.snapshotRef) || !isSnapshotRef(proof.snapshotRef) || !isGitOid(proof.commit)
    || proof.operationId !== freeze.source.operationId || freeze.applicationId !== freeze.source.applicationId || freeze.actorRoleId !== freeze.source.actorRoleId
    || freeze.frozenAt !== freeze.source.at || JSON.stringify(freeze.source) !== JSON.stringify(proof.source)
    || JSON.stringify(freeze.snapshotRef) !== JSON.stringify(proof.snapshotRef) || versionedDocVersionOf(rel) !== version
    || typeof proof.projectRoot !== "string" || typeof proof.operationId !== "string" || !isObject(proof.operationFile)
    || typeof proof.commitBytesBase64 !== "string" || proof.commitBytesBase64.length > 256 * 1024) return "committed-freeze-tuple-unproven";
  const expected = `.ans/trunk/operations/${createHash("sha256").update(proof.operationId).digest("hex")}/git.json`;
  if (proof.operationFile.path !== expected || !/^[a-f0-9]{64}$/i.test(proof.operationFile.sha256)) return "committed-freeze-operation-path-invalid";
  try {
    const root = await realpath(projectRoot); if (root !== proof.projectRoot) return "committed-freeze-root-mismatch";
    const privateBytes = async (relative: string) => {
      let current = root;
      for (const [index, part] of relative.split("/").entries()) {
        if (!part || part === "." || part === ".." || /[\\:\x00-\x1f]/.test(part)) throw new Error("committed-freeze-path-invalid");
        current = path.join(current, part); const info = await lstat(current);
        if (info.isSymbolicLink() || await realpath(current) !== current || (index === relative.split("/").length - 1 ? !info.isFile() || info.nlink !== 1 || info.size > 16 * 1024 * 1024 : !info.isDirectory()))
          throw new Error("committed-freeze-path-unproven");
      }
      return readFile(current);
    };
    const bytes = await privateBytes(expected);
    if (createHash("sha256").update(bytes).digest("hex") !== proof.operationFile.sha256.toLowerCase()) return "committed-freeze-operation-bytes-changed";
    const journal: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isObject(journal) || journal.operationId !== proof.operationId || journal.ref !== "refs/ans/trunk" || journal.phase !== "published"
      || !isObject(journal.process) || journal.process.termination !== "exited" || journal.process.exitCode !== 0
      || !isGitOid(journal.newOid) || JSON.stringify(journal.newOid) !== JSON.stringify(proof.commit) || !isGitOid(journal.tree)
      || !isObject(journal.businessJournal) || journal.businessJournal.operationId !== proof.operationId || journal.businessJournal.applicationId !== freeze.applicationId
      || journal.businessJournal.flowId !== flowIdOf(rel) || journal.businessJournal.journalId !== freeze.source.journalId
      || JSON.stringify(journal.businessJournal.actionSource) !== JSON.stringify(proof.source) || JSON.stringify(journal.businessJournal.targetSnapshot) !== JSON.stringify(proof.snapshotRef)
      || !isObject(journal.businessJournal.target) || !isObject(journal.businessJournal.target.documents)) return "committed-freeze-journal-source-mismatch";
    const commit = Buffer.from(proof.commitBytesBase64, "base64");
    if (commit.toString("base64") !== proof.commitBytesBase64 || createHash(proof.commit.objectFormat).update(Buffer.from(`commit ${commit.length}\0`)).update(commit).digest("hex") !== proof.commit.hex
      || !commit.toString("utf8").startsWith(`tree ${journal.tree.hex}\n`)) return "committed-freeze-object-mismatch";
    if (!Object.values(journal.businessJournal.target.documents).some(ref => isObject(ref) && ref.path === rel && ref.sha256 === sha256)) return "committed-freeze-document-mismatch";
    const snapshot: unknown = JSON.parse((await privateBytes(`.ans/trunk/snapshots/${proof.snapshotRef.snapshotId}.json`)).toString("utf8"));
    return isStoredCompleteSnapshot(snapshot) && snapshot.digest === proof.snapshotRef.digest && snapshot.files.some(file => file.path === rel && file.sha256 === sha256) ? undefined : "committed-freeze-snapshot-mismatch";
  } catch (error) { return `committed-freeze-read-unproven:${(error as NodeJS.ErrnoException).code ?? String(error)}`; }
}

/** Exact persisted intent evidence only; callers select the business source, never a global latest file. */
export async function readConfirmedIntentEvidence(projectRoot: string, relPath: string): Promise<
  { ok: true; value: { path: string; version: number; sha256: string; confirmationDigest: string; ledgerDigest: string } }
  | { ok: false; reason: string }> {
  const rel = normalizeVersionedDocPath(relPath), invalid = (reason: string) => ({ ok: false as const, reason });
  if (!rel || rel !== relPath || docKindOf(rel) !== "intent") return invalid("intent-path-invalid");
  try {
    const state = await readBaselines(projectRoot); if (!state.ok) return invalid(state.reason);
    const current = latestRecordMap(state.records).get(rel);
    if (!current || current.event !== "frozen" || current.freeze?.reason !== "intent-confirmed"
      || !isValidDocFreezeRecord(current.freeze)) return invalid("intent-confirmation-missing");
    const sha256 = createHash("sha256").update(await readFile(path.join(projectRoot, rel))).digest("hex");
    if (sha256 !== current.sha256 || versionedDocVersionOf(rel) !== current.version) return invalid("intent-confirmation-bytes-changed");
    if (!await confirmsMigratedIntent(projectRoot, rel, current.version, sha256, current.freeze)) return invalid("intent-confirmation-source-invalid");
    const ledger = await readOperationEvents(projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    return { ok: true, value: { path: rel, version: current.version, sha256,
      confirmationDigest: createHash("sha256").update(JSON.stringify(current.freeze)).digest("hex"),
      ledgerDigest: createHash("sha256").update(JSON.stringify(ledger.records.map(row => row.value))).digest("hex") } };
  } catch (error) { return invalid(`intent-confirmation-read-failed:${(error as NodeJS.ErrnoException).code ?? String(error)}`); }
}

async function appendBaselineRecords(
  event: "frozen" | "draft-marker",
  inputs: ReadonlyArray<{ projectRoot: string; relPath: string; sha256?: string; recordedBy?: string; freeze?: DocFreezeRecord }>,
  options: { now?: () => Date; committedOperation?: CommittedFreezeBasis },
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
        if (event === "frozen" && input.freeze?.origin === "role-direct") {
          const ref = input.freeze.snapshotRef;
          if (!isSnapshotRef(ref) || !/^[a-zA-Z0-9_-]{1,160}$/.test(ref.snapshotId)) return { ok: false, reason: "invalid-freeze", path: rel };
          const snapshot: unknown = JSON.parse(await readFile(path.join(projectRoot, ".ans/trunk/snapshots", `${ref.snapshotId}.json`), "utf8"));
          if (!isStoredCompleteSnapshot(snapshot) || snapshot.digest !== ref.digest) return { ok: false, reason: "invalid-freeze", path: rel };
          const file = snapshot.files.find(file => file.path === rel);
          if (!file) return { ok: false, reason: "file-missing", path: rel };
          bytes = Buffer.from(file.bytesBase64, "base64");
        } else bytes = await readFile(path.join(projectRoot, rel));
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
          && existing.freeze.applicationId === input.freeze.applicationId
          && (input.freeze.origin !== "role-direct" || JSON.stringify(existing.freeze) === JSON.stringify(input.freeze))) {
          skipped += 1;
          continue;
        }
        const sameMigration = event === "frozen" && existing.version === version && existing.sha256 === actualSha
          && existing.freeze?.reason === "migrated-legacy" && existing.freeze.origin === "application" && existing.freeze.applicationId === "migration";
        const publicationDetail = sameMigration && input.freeze?.origin === "role-direct" ? await confirmsMigratedPublication(projectRoot, rel, version, actualSha, input.freeze, options.committedOperation) : undefined;
        const confirmedMigration = sameMigration && input.freeze !== undefined && (await confirmsMigratedIntent(projectRoot, rel, version, actualSha, input.freeze)
          || input.freeze.origin === "role-direct" && publicationDetail === undefined);
        if (!confirmedMigration) return { ok: false, reason: "frozen-conflict", path: rel, ...(publicationDetail ? { detail: publicationDetail } : {}) };
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
  options: { now?: () => Date; committedOperation?: CommittedFreezeBasis } = {},
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


export interface GuardFreezeRegistryOptions {
  now?: () => Date;
  /** C2c 迁移完成判定；缺省 false（migration-required 安全向，F29）。 */
  migrationCompleted?: () => boolean | Promise<boolean>;
  /** 测试注入：替代 C2b `refreshVersionedDocFreezeSnapshot`（默认即 C2b）。 */
  refresh?: (
    projectRoot: string,
    options: { migrationCompleted?: boolean; now?: () => Date },
  ) => Promise<VersionedDocFreezeSnapshot>;
}

interface RawBaselineRecord {
  v: 1;
  path: string;
  version: number;
  sha256: string;
  recordedAt: string;
  event: string;
  freeze?: DocFreezeRecord;
}

interface BaselineView {
  snapshot: VersionedDocFreezeSnapshot;
  freezes: FreezeRecordInput[];
  markers: DraftMarkerInput[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}



function isRawBaselineRecord(value: unknown): value is RawBaselineRecord {
  if (!isObject(value)) return false;
  if (value.v !== 1) return false;
  if (typeof value.path !== "string" || value.path.trim() === "") return false;
  if (typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1) return false;
  if (!isSha256Hex(value.sha256)) return false;
  if (typeof value.recordedAt !== "string" || value.recordedAt.trim() === "") return false;
  if (
    value.event !== "baseline" &&
    value.event !== "version-added" &&
    value.event !== "frozen" &&
    value.event !== "draft-updated" &&
    value.event !== "draft-marker" &&
    value.event !== "versioned-doc-baseline"
  ) {
    return false;
  }
  if (value.event === "frozen") {
    if (!isValidDocFreezeRecord(value.freeze)) return false;
  } else if (value.freeze !== undefined) {
    return false;
  }
  return true;
}

/** 实际文件路径：新记录 canonical + `-vN.md`；旧记录 path 已是实际路径时兼容。 */
function actualPathOf(record: RawBaselineRecord): string {
  if (/-v\d+\.md$/i.test(record.path)) return record.path;
  return `${record.path}-v${record.version}.md`;
}

function pathKeyOf(relPath: string): string | undefined {
  const normalized = normalizeVersionedDocPath(relPath);
  if (normalized === undefined) return undefined;
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * 只读投影 R9 baseline（C2b 已判定可读后调用）：latest-record-per-path → 冻结记录/草稿标记。
 * 行结构非法 ⇒ 抛错（fail-closed；与 C2b `baseline-corrupt` 一致，不静默跳过）。
 */
async function readBaselineRecords(
  projectRoot: string,
): Promise<{ freezes: FreezeRecordInput[]; markers: DraftMarkerInput[] }> {
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, VERSION_BASELINE_REL), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return { freezes: [], markers: [] };
    throw new Error(`baseline-unreadable:${code ?? String(err)}`);
  }
  const latest = new Map<string, RawBaselineRecord>();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`baseline-corrupt:invalid-json:line-${index + 1}`);
    }
    if (!isRawBaselineRecord(parsed)) {
      throw new Error(`baseline-corrupt:invalid-record:line-${index + 1}`);
    }
    const actual = actualPathOf(parsed);
    const key = pathKeyOf(actual);
    if (key === undefined) throw new Error(`baseline-corrupt:invalid-path:line-${index + 1}`);
    latest.set(key, parsed);
  }
  const freezes: FreezeRecordInput[] = [];
  const markers: DraftMarkerInput[] = [];
  for (const record of latest.values()) {
    const actual = actualPathOf(record);
    if (record.event === "frozen" && record.freeze !== undefined) {
      freezes.push({
        path: actual,
        version: record.version,
        sha256: record.sha256,
        freeze: { ...record.freeze },
      });
    } else if (record.event === "draft-marker") {
      markers.push({
        path: actual,
        version: record.version,
        sha256: record.sha256,
        markedAt: record.recordedAt,
      });
    }
  }
  freezes.sort((a, b) => (a.path === b.path ? a.version - b.version : a.path < b.path ? -1 : 1));
  markers.sort((a, b) => (a.path === b.path ? a.version - b.version : a.path < b.path ? -1 : 1));
  return { freezes, markers };
}

/** C2b 快照 state → C2c `FreezeRegistryState`（migration-required ⇒ missing：先迁移）。 */
function mapSnapshotState(state: VersionedDocFreezeSnapshot["state"]): FreezeRegistryState {
  if (state === "ready") return "ready";
  if (state === "migration-required") return "missing";
  return "corrupt";
}

function mapAppendFailure(reason: string): { ok: false; code: "conflict" | "io"; message: string } {
  if (reason === "frozen-conflict") return { ok: false, code: "conflict", message: reason };
  return { ok: false, code: "io", message: reason };
}

/**
 * 创建 R9 冻结注册表适配（结构等价 C2c `FreezeRegistryPort`；S2/S3 注入
 * `createVersionChangeService({ freezeRegistry })`）。实例内缓存一次 baseline 视图，
 * 追加后失效、`refreshSnapshot()` 强制刷新（不建第二份同步 Map；同步快照在 C2b）。
 */
export function createGuardFreezeRegistry(
  projectRoot: string,
  options: GuardFreezeRegistryOptions = {},
): FreezeRegistryStore {
  const root = path.resolve(projectRoot);
  const refresh = options.refresh ?? refreshVersionedDocFreezeSnapshot;
  let cached: BaselineView | undefined;

  async function buildView(): Promise<BaselineView> {
    const migrationCompleted =
      options.migrationCompleted === undefined ? false : await options.migrationCompleted();
    const snapshot = await refresh(root, {
      migrationCompleted,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    if (snapshot.state === "corrupt" || snapshot.state === "unknown") {
      return { snapshot, freezes: [], markers: [] };
    }
    const parsed = await readBaselineRecords(root);
    return { snapshot, ...parsed };
  }

  async function view(): Promise<BaselineView> {
    if (cached === undefined) cached = await buildView();
    return cached;
  }

  function invalidate(): void {
    cached = undefined;
  }

  return {
    async state() {
      const current = await view();
      return mapSnapshotState(current.snapshot.state);
    },

    async listFreezes() {
      const current = await view();
      if (current.snapshot.state === "corrupt" || current.snapshot.state === "unknown") {
        throw new Error("baseline-corrupt");
      }
      return current.freezes.map((entry) => ({ ...entry, freeze: { ...entry.freeze } }));
    },

    async listDraftMarkers() {
      const current = await view();
      if (current.snapshot.state === "corrupt" || current.snapshot.state === "unknown") {
        throw new Error("baseline-corrupt");
      }
      return current.markers.map((entry) => ({ ...entry }));
    },

    async appendDocFreezeRecords(records: FreezeRecordInput[], evidence) {
      const result = await appendDocFreezeRecords(
        records.map((record) => ({
          projectRoot: root,
          relPath: record.path,
          sha256: record.sha256,
          freeze: record.freeze,
        })),
        { ...(options.now !== undefined ? { now: options.now } : {}), ...(evidence ? { committedOperation: evidence.committedOperation } : {}) },
      );
      invalidate();
      return result.ok ? { ok: true } : { ...mapAppendFailure(result.reason), ...(result.path ? { message: `${result.reason}: ${result.path}${result.detail ? `; ${result.detail}` : ""}` } : {}) };
    },

    async appendDraftMarkers(markers: DraftMarkerInput[]) {
      const result = await appendDocDraftMarkerRecords(
        markers.map((marker) => ({
          projectRoot: root,
          relPath: marker.path,
          ...(marker.sha256 !== undefined ? { sha256: marker.sha256 } : {}),
        })),
        options.now !== undefined ? { now: options.now } : {},
      );
      invalidate();
      return result.ok ? { ok: true } : mapAppendFailure(result.reason);
    },

    async refreshSnapshot() {
      cached = await buildView();
    },
  };
}

export async function scanVersionedDocuments(projectRoot: string, options: { filePrefix?: string; maxFiles?: number; maxBytesPerFile?: number; strict?: boolean } = {}): Promise<Array<{ path: string; version: number; sha256: string }>> {
  const root = path.resolve(projectRoot), canonicalRoot = await realpath(root);
  const docs: Array<{ path: string; version: number; sha256: string }> = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try { names = await readdir(path.join(root, dir)); } catch (error) {
      if (options.strict === true && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (!isVersionedDocPath(rel) || (options.filePrefix !== undefined && !name.startsWith(options.filePrefix))) continue;
      if (options.maxFiles !== undefined && docs.length >= options.maxFiles) throw new Error("versioned-document-file-budget");
      const abs = await realpath(path.join(root, rel)), relative = path.relative(canonicalRoot, abs);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("versioned-document-path-escape");
      const info = await stat(abs);
      if (!info.isFile() || (options.maxBytesPerFile !== undefined && info.size > options.maxBytesPerFile)) throw new Error("versioned-document-byte-budget");
      const bytes = await readFile(abs);
      if (options.maxBytesPerFile !== undefined && bytes.length > options.maxBytesPerFile) throw new Error("versioned-document-byte-budget");
      docs.push({ path: rel, version: versionedDocVersionOf(rel)!, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  return docs.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export { isValidDocFreezeRecord } from "../../../model/version-change.ts";

/** Idempotent append-only logging for an already verified direct action. No role/approval policy. */
export async function readOperationEvents(projectRoot: string): Promise<{ ok: true; records: Array<{ raw: string; value: Record<string, unknown> }> } | { ok: false; reason: string }> {
  const read = await readJsonlLedger<{ raw: string; value: Record<string, unknown> }>(path.join(projectRoot, ".ans/state/tasks.jsonl"), raw => {
    try { const value: unknown = JSON.parse(raw); return isObject(value) ? { ok: true, value: { raw, value } } : { ok: false, message: "invalid-audit-record" }; }
    catch { return { ok: false, message: "invalid-audit-json" }; }
  });
  return read.errors.length ? { ok: false, reason: "audit-ledger-unreadable" } : { ok: true, records: read.values };
}

export async function appendOperationEvent(projectRoot: string, event: TaskStateEvent): Promise<VersionBaselineWriteResult> {
  const source = "actionSource" in event ? event.actionSource : undefined;
  if (!isDirectActionSource(source) || source.kind !== "role-direct") return { ok: false, reason: "invalid-direct-event-source" };
  return appendTaskLedgerEvent(projectRoot, event);
}

/** Plain append/CAS infrastructure shared by actual task observation and direct-close writers. */
export async function appendTaskLedgerEvent(projectRoot: string, event: TaskStateEvent, options: {
  expectedTask?: { taskId: string; digest: string };
  expectedLedgerDigest?: string;
  expectedParentTask?: { taskId: string; digest: string; flowId: string; runId: string; to: "convener" };
  expectedRun?: { runId: string; sha256: string };
  expectedFiles?: readonly { path: string; sha256: string }[];
  heldLockToken?: string;
} = {}): Promise<VersionBaselineWriteResult & { replay?: boolean }> {
  const source = "actionSource" in event ? event.actionSource : undefined;
  const eventKey = (value: Record<string, unknown>) => JSON.stringify([value.kind, value.op, value.status, value.path]);
  const key = eventKey(event as unknown as Record<string, unknown>), release = options.heldLockToken ? undefined : await acquireVersionLock(projectRoot), lockToken = options.heldLockToken ?? release!.token;
  try {
    if (!await ownsVersionLock(projectRoot, lockToken)) return { ok: false, reason: "task-ledger-fence-lost" };
    const file = path.join(projectRoot, ".ans/state/tasks.jsonl");
    const read = await readJsonlLedger<Record<string, unknown>>(file, raw => {
      try { const value: unknown = JSON.parse(raw); return isObject(value) ? { ok: true, value } : { ok: false, message: "invalid-audit-record" }; }
      catch { return { ok: false, message: "invalid-audit-json" }; }
    });
    if (read.errors.length) return { ok: false, reason: "audit-ledger-unreadable" };
    if (options.expectedLedgerDigest !== undefined && createHash("sha256").update(JSON.stringify(read.values)).digest("hex") !== options.expectedLedgerDigest)
      return { ok: false, reason: "task-ledger-cas-conflict" };
    if (read.values.some(value => JSON.stringify(value) === JSON.stringify(event) || (() => {
      const old = value.actionSource;
      return isDirectActionSource(source) && source.kind === "role-direct" && isDirectActionSource(old) && old.kind === "role-direct" && old.operationId === source.operationId
        && old.targetDigest === source.targetDigest && eventKey(value) === key;
    })())) return { ok: true, replay: true };
    if (options.expectedTask) {
      const rows = read.values.filter(value => value.taskId === options.expectedTask!.taskId);
      if (createHash("sha256").update(JSON.stringify(rows)).digest("hex") !== options.expectedTask.digest) return { ok: false, reason: "task-row-cas-conflict" };
    }
    if (options.expectedParentTask) {
      const expected = options.expectedParentTask, rows = read.values.filter(value => value.taskId === expected.taskId);
      const creates = rows.filter(value => value.kind === "task.created"), created = creates[0];
      if (creates.length !== 1 || !created || created.to !== expected.to || created.flowId !== expected.flowId || created.runId !== expected.runId
        || rows.some(value => value.kind === "task.closed") || event.kind !== "task.created" || event.taskId === expected.taskId
        || event.from !== expected.to || event.flowId !== expected.flowId || event.runId !== expected.runId
        || event.parentTaskRef?.kind !== "assigned-task" || event.parentTaskRef.taskId !== expected.taskId
        || event.parentTaskRef.ledgerSha256.toLowerCase() !== expected.digest.toLowerCase())
        return { ok: false, reason: "task-parent-binding-conflict" };
      if (createHash("sha256").update(JSON.stringify(rows)).digest("hex") !== expected.digest.toLowerCase()) return { ok: false, reason: "task-parent-row-cas-conflict" };
    }
    if (options.expectedRun) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(options.expectedRun.runId)) return { ok: false, reason: "invalid-run-id" };
      const bytes = await readFile(path.join(projectRoot, ".ans/runs", options.expectedRun.runId, "manifest.json"));
      if (createHash("sha256").update(bytes).digest("hex") !== options.expectedRun.sha256) return { ok: false, reason: "task-run-cas-conflict" };
    }
    if (options.expectedFiles) {
      if (!options.expectedFiles.length || options.expectedFiles.length > 32) return { ok: false, reason: "task-file-budget" };
      const canonicalRoot = await realpath(projectRoot);
      let total = 0;
      for (const ref of options.expectedFiles) {
        if (!ref.path || ref.path.includes("\\") || path.isAbsolute(ref.path) || ref.path.split("/").some(part => !part || part === "." || part === "..")
          || /(^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.ssh|\.aws|\.codex|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*))($|\/)/i.test(ref.path)
          || !/^[a-f0-9]{64}$/i.test(ref.sha256)) return { ok: false, reason: "task-file-invalid" };
        const abs = await realpath(path.join(projectRoot, ref.path)), relative = path.relative(canonicalRoot, abs);
        if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, reason: "task-file-path-escape" };
        const info = await stat(abs);
        if (!info.isFile() || info.size > 64 * 1024) return { ok: false, reason: "task-file-budget" };
        const bytes = await readFile(abs); total += bytes.length;
        if (bytes.length > 64 * 1024 || total > 256 * 1024) return { ok: false, reason: "task-file-budget" };
        if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) return { ok: false, reason: "task-file-cas-conflict" };
      }
    }
    if (!(await ownsVersionLock(projectRoot, lockToken))) return { ok: false, reason: "fencing-lost" };
    const written = await appendJsonlLine(file, JSON.stringify(event));
    return written.ok ? { ok: true, replay: false } : { ok: false, reason: written.message };
  } finally { await release?.(); }
}
export async function operationDeliveryRecorded(projectRoot: string, key: string): Promise<boolean> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(projectRoot, ".ans/trunk/deliveries", `${createHash("sha256").update(key).digest("hex")}.json`), "utf8"));
    if (!isObject(raw) || raw.key !== key) throw new Error("delivery-record-corrupt");
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export async function recordOperationDelivery(projectRoot: string, key: string): Promise<VersionBaselineWriteResult> {
  const abs = path.join(projectRoot, ".ans/trunk/deliveries", `${createHash("sha256").update(key).digest("hex")}.json`);
  const release = await acquireVersionLock(projectRoot);
  try {
    if (await operationDeliveryRecorded(projectRoot, key)) return { ok: true };
    await mkdir(path.dirname(abs), { recursive: true });
    await atomicWrite(abs, JSON.stringify({ key })); return { ok: true };
  } catch (error) { return { ok: false, reason: String(error) }; }
  finally { await release(); }
}
