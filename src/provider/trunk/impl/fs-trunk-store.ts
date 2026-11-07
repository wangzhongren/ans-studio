// src/provider/trunk/impl/fs-trunk-store.ts
// trunk 存储 Provider 文件系统实现（2026-11-04 B-3 / S1）。
//
// 纪律（P1 §2.1/§3.1/§4.5）：
// · 原子写：同目录临时文件 + fsync + rename 覆盖，**复用** `src/common/shared/atomic-write.ts`
//   （Windows `EPERM` 有界重试唯一来源；本文件不写第二份重试）；
// · 每文件**进程内串行链**：写与读按调用顺序排队（读后写、写后读均可复现），并发写不撕裂；
// · 坏件容错：读只判别 `missing`/`corrupt`/`io` 并返回，不自动重建/覆盖；写失败不改目标；
// · 结构校验只看**必需字段与枚举**，未知字段保留（新旧版本兼容）；
//   amendment 读侧接受 P1.3 旧状态（`proposed`/`confirmed`/`cancelled`），写侧只接受 P1.6 新状态；
// · history 归档不可变：同版本同内容幂等，不同内容拒绝（`invalid`）。
//
// 不做：冻结判定、trunk 状态机、事件/账本写入、指针变更（S2/S4 职责）。

import { readFile, readdir, mkdir, realpath, stat, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { listGitOperationJournals, listGitInitializationRecords, readGitInitializationRecord, isTrunkApplyJournalShape, readGitInitializationFacts } from "./git-command.ts";
export { isTrunkApplyJournalShape } from "./git-command.ts";
import {
  TRUNK_AMENDMENT_LEGACY_STATUSES,
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_AMENDMENT_STATUSES,
  TRUNK_APPLY_JOURNAL_PHASES,
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_MANIFEST_SCHEMA,
  TRUNK_SOURCES,
  TRUNK_VERSION_MIN,
  COMPLETE_SNAPSHOT_SCHEMA, isCompleteSnapshot, isSnapshotRef, isFrozenRoleEvidence, isActiveRoleEvidence, FROZEN_ROLE_REF_KEYS,
  isDirectActionSource, isSnapshotArtifactRef,
} from "../../../model/trunk.ts";
import type {
  TrunkAmendmentState,
  TrunkApplyJournal,
  TrunkManifest,
  CompleteSnapshot, SnapshotRef, FrozenRoleEvidence, ActiveRoleEvidence,
} from "../../../model/trunk.ts";
import {
  TRUNK_AMENDMENT_REL,
  TRUNK_HISTORY_DIR,
  TRUNK_JOURNAL_REL,
  TRUNK_MANIFEST_REL,
} from "../abstract/trunk-store.ts";
import type { StoreRead, StoreWrite, TrunkStore, ActiveRolesState } from "../abstract/trunk-store.ts";
import { validateTaskStateEvent } from "../../../common/编排/task-state.ts";
import { isTaskWorkSourceRef } from "../../../model/runtime.ts";
import { acquireVersionLock, readOperationEvents, ownsVersionLock, completeSnapshotDigest as snapshotDigest, isStoredCompleteSnapshot as validSnapshot } from "../../version-change/public/version-change-store.ts";

const hash = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
export function artifactRefs(manifest: TrunkManifest): Array<{ path: string; sha256: string }> {
  return [...Object.values(manifest.artifacts.documents), ...Object.values(manifest.artifacts.execution),
    manifest.artifacts.workflow, ...Object.values(manifest.artifacts.roleCards ?? {}),
    ...Object.values(manifest.artifacts.boundaries)].filter((ref): ref is { path: string; sha256: string } => ref != null);
}

// —————————————— 结构校验（只判必需字段/枚举；未知字段放行） ——————————————

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= TRUNK_VERSION_MIN;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isArtifactRef(value: unknown): boolean {
  if (!isObject(value)) return false;
  return isNonEmptyString(value.path) && isSha256Hex(value.sha256);
}

function isStableArtifactRef(value: unknown): boolean {
  if (!isObject(value)) return false;
  return isNonEmptyString(value.kind) && isNonEmptyString(value.path) && isSha256Hex(value.sha256);
}

/** `trunk/v1` manifest 结构校验（C1 形状；artifacts roleCards 可选）。 */
export function isTrunkManifestShape(value: unknown): value is TrunkManifest {
  if (!isObject(value)) return false;
  if (value.schema !== TRUNK_MANIFEST_SCHEMA) return false;
  if (!isPositiveInteger(value.trunkVersion)) return false;
  if (typeof value.source !== "string" || !(TRUNK_SOURCES as readonly string[]).includes(value.source)) return false;
  if (!(value.previous === null || isObject(value.previous))) return false;
  if (!isNonEmptyString(value.flowId)) return false;
  if (!(value.runId === null || typeof value.runId === "string")) return false;
  if (!isObject(value.artifacts)) return false;
  const artifacts = value.artifacts;
  if (!isObject(artifacts.documents)) return false;
  if (!isObject(artifacts.execution)) return false;
  if (artifacts.workflow !== undefined && !isStableArtifactRef(artifacts.workflow)) return false;
  if (!isObject(artifacts.boundaries)) return false;
  for (const boundary of Object.values(artifacts.boundaries)) {
    if (!isStableArtifactRef(boundary)) return false;
  }
  if (artifacts.roleCards !== undefined) {
    if (!isObject(artifacts.roleCards)) return false;
    for (const card of Object.values(artifacts.roleCards)) {
      if (!isStableArtifactRef(card)) return false;
    }
  }
  if (typeof value.digest !== "string") return false;
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.updatedAt)) return false;
  if (value.snapshotRef !== undefined && !isSnapshotRef(value.snapshotRef)) return false;
  if (value.actionSource !== undefined && !isDirectActionSource(value.actionSource)) return false;
  if (value.frozenRoles !== undefined && (!isObject(value.frozenRoles) || !Object.values(value.frozenRoles).every(isFrozenRoleEvidence))) return false;
  if ([value.activeRoles, value.activeRevision, value.activeDigest].some(value => value !== undefined)
    && (!isObject(value.activeRoles) || !Object.values(value.activeRoles).every(isActiveRoleEvidence)
      || !isPositiveInteger(value.activeRevision) || !isSha256Hex(value.activeDigest))) return false;
  return true;
}

const AMENDMENT_READ_STATUSES: ReadonlySet<string> = new Set([
  ...TRUNK_AMENDMENT_STATUSES,
  ...TRUNK_AMENDMENT_LEGACY_STATUSES,
]);
const AMENDMENT_WRITE_STATUSES: ReadonlySet<string> = new Set(TRUNK_AMENDMENT_STATUSES);

function isAmendmentShape(value: unknown, statuses: ReadonlySet<string>): value is TrunkAmendmentState {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== TRUNK_AMENDMENT_SCHEMA) return false;
  if (!isNonEmptyString(value.amendmentId) || !isNonEmptyString(value.flowId)) return false;
  if (!isNonEmptyString(value.docPath) || !isSha256Hex(value.docSha256)) return false;
  if (!isPositiveInteger(value.docVersion)) return false;
  if (!(value.baseTrunk === null || isObject(value.baseTrunk))) return false;
  if (typeof value.status !== "string" || !statuses.has(value.status)) return false;
  if (typeof value.applyState !== "string") return false;
  if (!Array.isArray(value.items)) return false;
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.updatedAt)) return false;
  return true;
}

/** `trunk-apply-journal/v1` 结构校验（phase 仅审计；内容匹配由 S2 对账）。 */
// —————————————— 串行链 + 原子读写 ——————————————

/** 进程内每文件串行链（key = 规范化绝对路径）；失败不阻断后续任务。 */
const chains = new Map<string, Promise<unknown>>();

function chainKey(abs: string): string {
  const resolved = path.resolve(abs);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function serialize<T>(abs: string, op: () => Promise<T>): Promise<T> {
  const key = chainKey(abs);
  const previous = chains.get(key) ?? Promise.resolve();
  // 前一任务失败也继续执行本任务（错误由各自调用方消化）。
  const run = previous.then(op, op);
  chains.set(key, run.catch(() => undefined));
  return run;
}

async function readJsonFile<T>(
  abs: string,
  validate: (value: unknown) => value is T,
): Promise<StoreRead<T>> {
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return { ok: false, reason: "missing" };
    return { ok: false, reason: "io", message: code ?? String(err) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "corrupt", message: "invalid-json" };
  }
  if (!validate(parsed)) return { ok: false, reason: "corrupt", message: "invalid-shape" };
  return { ok: true, value: parsed };
}

async function writeJsonFile(abs: string, value: unknown): Promise<StoreWrite> {
  try {
    await mkdir(path.dirname(abs), { recursive: true });
    await atomicWrite(abs, `${JSON.stringify(value, null, 2)}\n`);
    return { ok: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    return { ok: false, code: "io", message: code ?? String(err) };
  }
}

function readInChain<T>(
  abs: string,
  validate: (value: unknown) => value is T,
): Promise<StoreRead<T>> {
  return serialize(abs, () => readJsonFile(abs, validate));
}

function writeInChain(abs: string, value: unknown): Promise<StoreWrite> {
  return serialize(abs, () => writeJsonFile(abs, value));
}

// —————————————— history ——————————————

const HISTORY_FILE_RE = /^manifest-v([1-9]\d*)\.json$/i;

// —————————————— 工厂 ——————————————

/** 创建文件系统 trunk 存储（`projectRoot` 绑定；所有读写限定 `.ans/trunk/`）。 */
/** Original Provider storage check, called only while its caller owns R9. No role/session authority is minted. */
export async function checkRunChangeRequester(root: string, source: import("../abstract/trunk-store.ts").RunChangeSource, flowId: string): Promise<string | undefined> {
  if (!source || Object.keys(source).length !== 5 || !/^[a-f0-9]{64}$/.test(source.oldSha256) || !/^[a-f0-9]{64}$/.test(source.requesterDigest) || !/^[a-f0-9]{64}$/.test(source.requestDigest)) return "run-change-source-invalid";
  const ledger = await readOperationEvents(root); if (!ledger.ok) return "run-change-requester-ledger-unavailable";
  const rows = ledger.records.filter(row => row.value.taskId === source.requesterTaskId), creates = rows.filter(row => row.value.kind === "task.created");
  const checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
  if (!checked?.ok || checked.event.kind !== "task.created" || hash(JSON.stringify(checked.event)) !== source.requesterDigest || checked.event.to !== "rapporteur"
    || checked.event.flowId !== flowId || rows.some(row => row.value.kind === "task.closed") || !checked.event.runId) return "run-change-requester-changed";
  const task = checked.event, store = createFsTrunkStore(root, { legacyCommitProofOnly: true }), run = await store.readRunRecord!(task.runId!);
  if (!run.ok || run.value.value.flowId !== flowId || (!["draft", "pinned"].includes(String(run.value.value.state)) && !(task.runId === source.oldRunId && run.value.value.state === "cancelled"))) return "run-change-requester-run-unavailable";
  if (task.runId !== source.oldRunId) {
    const ref = task.workSourceRef;
    if (task.from !== "chief" || task.hubRouting !== "chief-hub-v1" || !isTaskWorkSourceRef(ref)) return "run-change-requester-hub-source-required";
    const read = await store.readInitializationSource!(ref.sourceId);
    if (!read.ok || read.value.path !== ref.path || read.value.sha256 !== ref.sha256.toLowerCase()) return "run-change-requester-source-bytes-changed";
    const value: unknown = JSON.parse(Buffer.from(read.value.bytesBase64, "base64").toString("utf8"));
    if (!isObject(value) || value.schema !== "repository-work-source/v1" || value.purpose !== "builtin-preparation" || value.hubRouting !== task.hubRouting
      || value.sourceId !== ref.sourceId || value.kind !== (ref.kind === "chief-creator-report" ? "creator-report" : "customer-turn")
      || !isObject(value.parent) || value.parent.roleId !== "chief" || value.flowId !== flowId || value.projectRoot !== await realpath(root) || value.targetRoleId !== "rapporteur"
      || value.planningRunId !== task.runId || run.value.value.builtinPreparationSource !== ref.sourceId) return "run-change-requester-source-binding-invalid";
  }
  return undefined;
}

export function createFsTrunkStore(projectRoot: string, options: { legacyCommitProofOnly?: boolean } = {}): TrunkStore {
  const root = path.resolve(projectRoot);
  const manifestAbs = path.join(root, TRUNK_MANIFEST_REL);
  const amendmentAbs = path.join(root, TRUNK_AMENDMENT_REL);
  const journalAbs = path.join(root, TRUNK_JOURNAL_REL);
  const historyDir = path.join(root, TRUNK_HISTORY_DIR);
  const gitModePresent = async () => { try { await stat(path.join(root, ".ans/trunk/git-mode.json")); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } };

  function snapshotAbs(ref: SnapshotRef): string | undefined {
    return isSnapshotRef(ref) && /^[a-zA-Z0-9_-]{1,160}$/.test(ref.snapshotId)
      ? path.join(root, ".ans/trunk/snapshots", `${ref.snapshotId}.json`) : undefined;
  }
  async function readSnapshot(ref: SnapshotRef): Promise<StoreRead<CompleteSnapshot>> {
    const abs = snapshotAbs(ref);
    if (abs === undefined) return { ok: false, reason: "corrupt", message: "invalid-snapshot-ref" };
    const read = await readInChain(abs, validSnapshot);
    if (!read.ok) return read;
    return read.value.digest === ref.digest ? read : { ok: false, reason: "corrupt", message: "snapshot-digest-mismatch" };
  }
  async function prepareSnapshot(snapshot: CompleteSnapshot): Promise<StoreRead<SnapshotRef>> {
    if (!validSnapshot(snapshot)) return { ok: false, reason: "corrupt", message: "invalid-snapshot-bytes" };
    const ref = { snapshotId: snapshot.snapshotId, digest: snapshot.digest };
    const abs = snapshotAbs(ref)!;
    return serialize(abs, async () => {
      let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
      try {
        release = await acquireVersionLock(root);
        const existing = await readJsonFile(abs, validSnapshot);
        if (existing.ok) return existing.value.digest === ref.digest
          ? { ok: true, value: ref } : { ok: false, reason: "corrupt", message: "snapshot-immutable-conflict" };
        if (existing.reason !== "missing") return existing;
        const written = await writeJsonFile(abs, snapshot);
        return written.ok ? { ok: true, value: ref } : { ok: false, reason: "io", message: written.message };
      } catch (error) {
        return { ok: false, reason: "io", message: String(error) };
      } finally { await release?.(); }
    });
  }
  async function verifyClosure(manifest: TrunkManifest, ref: SnapshotRef): Promise<StoreRead<CompleteSnapshot>> {
    const read = await readSnapshot(ref);
    if (!read.ok) return read;
    const all = new Map(read.value.files.map(file => [file.path, file.sha256.toLowerCase()]));
    if (!artifactRefs(manifest).every(artifact => all.get(artifact.path.split("#")[0]!) === artifact.sha256.toLowerCase()))
      return { ok: false, reason: "corrupt", message: "incomplete-manifest-snapshot" };
    // Activated role snapshots have their own immutable pointers. A document publication preserves them.
    for (const [roleId, evidence] of [...Object.entries(manifest.frozenRoles ?? {}), ...Object.entries(manifest.activeRoles ?? {})]) {
      if (evidence.roleId !== roleId) return { ok: false, reason: "corrupt", message: "active-role-identity-mismatch" };
      const roleSnapshot = await readSnapshot(evidence.snapshotRef);
      if (!roleSnapshot.ok) return roleSnapshot;
      const files = new Map(roleSnapshot.value.files.map(file => [file.path, file.sha256.toLowerCase()]));
      if (!FROZEN_ROLE_REF_KEYS.every(key => files.get(evidence[key].path) === evidence[key].sha256.toLowerCase()))
        return { ok: false, reason: "corrupt", message: "incomplete-active-role-evidence" };
    }
    return read;
  }
  async function readActiveRoleEvidence(evidence: ActiveRoleEvidence): Promise<StoreRead<CompleteSnapshot>> {
    if (!isActiveRoleEvidence(evidence)) return { ok: false, reason: "corrupt", message: "missing-active-role-evidence" };
    const snapshot = await readSnapshot(evidence.snapshotRef); if (!snapshot.ok) return snapshot;
    const files = new Map(snapshot.value.files.map(file => [file.path, file.sha256]));
    return FROZEN_ROLE_REF_KEYS.every(key => files.get(evidence[key].path) === evidence[key].sha256.toLowerCase())
      ? snapshot : { ok: false, reason: "corrupt", message: "incomplete-active-role-evidence" };
  }
  const activeStateShape = (value: unknown): value is ActiveRolesState => isObject(value) && isPositiveInteger(value.revision)
    && isSha256Hex(value.digest) && isObject(value.roles) && Object.values(value.roles).every(isActiveRoleEvidence);
  async function readManifestVersion(version: number): Promise<StoreRead<TrunkManifest>> {
    if (!Number.isSafeInteger(version) || version < 1) return { ok: false, reason: "corrupt", message: "invalid-manifest-version" };
    const current = await readInChain(manifestAbs, isTrunkManifestShape);
    if (!current.ok && current.reason !== "missing") return current;
    const read = current.ok && current.value.trunkVersion === version ? current
      : await readInChain(path.join(historyDir, `manifest-v${version}.json`), isTrunkManifestShape);
    if (read.ok && read.value.snapshotRef) { const closure = await verifyClosure(read.value, read.value.snapshotRef); if (!closure.ok) return closure; }
    return read;
  }

  return {
    readGitInitializationFacts() { return readGitInitializationFacts(root); },
    async readInitializationSource(sourceId) {
      if (!/^init-source-[a-f0-9]{64}$/.test(sourceId)) return { ok: false, reason: "corrupt", message: "initialization-source-id-invalid" };
      const rel = `.ans/trunk/initialization-sources/${sourceId}.json`;
      try { const canonicalRoot = await realpath(root), file = await realpath(path.join(root, rel)), relative = path.relative(canonicalRoot, file), info = await lstat(file);
        if (relative.startsWith("..") || path.isAbsolute(relative) || !info.isFile() || info.nlink > 1 || info.size > 128 * 1024) return { ok: false, reason: "corrupt", message: "initialization-source-path-invalid" };
        const bytes = await readFile(file); return { ok: true, value: { path: rel, sha256: hash(bytes), bytesBase64: bytes.toString("base64") } };
      } catch (error) { return { ok: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "io", message: String(error) }; }
    },
    async writeInitializationSource(sourceId, bytesBase64) {
      const bytes = Buffer.from(bytesBase64, "base64");
      if (!/^init-source-[a-f0-9]{64}$/.test(sourceId) || bytes.length > 128 * 1024 || bytes.toString("base64") !== bytesBase64) return { ok: false, reason: "corrupt", message: "initialization-source-input-invalid" };
      const rel = `.ans/trunk/initialization-sources/${sourceId}.json`, release = await acquireVersionLock(root);
      try { let dir = await realpath(root); for (const part of [".ans", "trunk", "initialization-sources"]) { dir = path.join(dir, part); await mkdir(dir, { recursive: true });
          const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) return { ok: false, reason: "corrupt", message: "initialization-source-control-path-invalid" }; }
        const file = path.join(root, rel); let old: Buffer | undefined;
        try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) return { ok: false, reason: "corrupt", message: "initialization-source-file-invalid" }; old = await readFile(file); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (old && !old.equals(bytes)) return { ok: false, reason: "corrupt", message: "initialization-source-immutable-conflict" };
        if (!old) { if (!await ownsVersionLock(root, release.token)) return { ok: false, reason: "io", message: "initialization-source-fencing-lost" }; await atomicWrite(file, bytes); }
        return { ok: true, value: { path: rel, sha256: hash(bytes) } };
      } catch (error) { return { ok: false, reason: "io", message: String(error) }; } finally { await release(); }
    },
    async listRunRecords() {
      const dir = path.join(root, ".ans/runs");
      try {
        const names = (await readdir(dir)).filter(name => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(name));
        if (names.length > 2048) return { ok: false, reason: "corrupt", message: "run-record-read-budget" };
        const records: Record<string, unknown>[] = [];
        for (const runId of names) {
          const read = await readInChain(path.join(dir, runId, "manifest.json"), isObject);
          if (!read.ok) return read;
          if (read.value.runId !== runId) return { ok: false, reason: "corrupt", message: "run-record-identity" };
          records.push(read.value);
        }
        return { ok: true, value: records };
      } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { ok: true, value: [] } : { ok: false, reason: "io", message: String(error) }; }
    },
    async readRunRecord(runId) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(runId)) return { ok: false, reason: "corrupt", message: "invalid-run-id" };
      try {
        const bytes = await readFile(path.join(root, ".ans/runs", runId, "manifest.json"));
        const value: unknown = JSON.parse(bytes.toString("utf8"));
        if (!isObject(value) || value.runId !== runId) return { ok: false, reason: "corrupt", message: "run-record-identity" };
        return { ok: true, value: { value, sha256: hash(bytes) } };
      } catch (error) { return { ok: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : error instanceof SyntaxError ? "corrupt" : "io", message: String(error) }; }
    },
    async compareAndSwapRunRecord(runId, expectedSha256, value, expectedBasis) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(runId) || !isObject(value) || value.runId !== runId
        || (expectedSha256 !== null && !isSha256Hex(expectedSha256))) return { ok: false, code: "invalid", message: "invalid-run-record-cas" };
      const abs = path.join(root, ".ans/runs", runId, "manifest.json");
      return serialize(abs, async () => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
          release = await acquireVersionLock(root);
          if (expectedBasis) {
            const basis = await readJsonFile(manifestAbs, isTrunkManifestShape);
            if (!basis.ok || basis.value.trunkVersion !== expectedBasis.trunk.version || basis.value.digest !== expectedBasis.trunk.digest
              || (basis.value.activeRevision ?? 0) !== expectedBasis.active.revision || (basis.value.activeDigest ?? null) !== expectedBasis.active.digest)
              return { ok: false, code: "conflict", message: "run-document-active-cas-conflict" };
          }
          if (expectedBasis?.runChangeSource) {
            const source = expectedBasis.runChangeSource, old = await createFsTrunkStore(root, { legacyCommitProofOnly: true }).readRunRecord!(source.oldRunId);
            if (!old.ok || old.value.sha256 !== source.oldSha256 || old.value.value.state !== "pinned" || old.value.value.flowId !== value.flowId
              || JSON.stringify(value.runChangeSource) !== JSON.stringify(source) || runId === source.oldRunId) return { ok: false, code: "conflict", message: "run-change-old-source-cas-conflict" };
            const error = await checkRunChangeRequester(root, source, String(value.flowId)); if (error) return { ok: false, code: "conflict", message: error };
          }
          let actual: string | null = null;
          try {
            const bytes = await readFile(abs);
            const old: unknown = JSON.parse(bytes.toString("utf8"));
            if (!isObject(old) || old.runId !== runId) return { ok: false, code: "invalid", message: "existing-run-record-corrupt" };
            actual = hash(bytes);
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { ok: false, code: "io", message: String(error) }; }
          if (actual !== expectedSha256) return { ok: false, code: "conflict", message: "run-record-cas-conflict" };
          if (!(await ownsVersionLock(root, release.token))) return { ok: false, code: "conflict", message: "run-record-fencing-lost" };
          return await writeJsonFile(abs, value);
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },
    async readProjectFile(rel, options) {
      if (!rel || /[\\:\x00-\x1f]/.test(rel) || rel.startsWith("/") || rel.split("/").some(p => !p || p === "." || p === ".."))
        return { ok: false, reason: "corrupt", message: "invalid-project-path" };
      try {
        const realRoot = await realpath(root), abs = await realpath(path.join(root, rel));
        const relative = path.relative(realRoot, abs);
        if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, reason: "corrupt", message: "project-path-escape" };
        const info = await stat(abs);
        if (!info.isFile() || (options?.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0 || info.size > options.maxBytes)))
          return { ok: false, reason: "corrupt", message: "project-file-size-or-kind-invalid" };
        const bytes = await readFile(abs);
        if (options?.maxBytes !== undefined && bytes.length > options.maxBytes) return { ok: false, reason: "corrupt", message: "project-file-size-limit" };
        return { ok: true, value: { bytesBase64: bytes.toString("base64"), sha256: hash(bytes) } };
      } catch (error) { return { ok: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "io", message: String(error) }; }
    },
    async readManifestAt(ref, expectedSnapshot) {
      if (!options.legacyCommitProofOnly && await gitModePresent()) return { ok: false, reason: "corrupt", message: "git-media-requires-project-selector" };
      if (!Number.isSafeInteger(ref.version) || ref.version < 1 || typeof ref.digest !== "string")
        return { ok: false, reason: "corrupt", message: "invalid-commit-ref" };
      let read = await readManifestVersion(ref.version);
      if (read.ok && expectedSnapshot !== undefined && JSON.stringify(read.value.snapshotRef) !== JSON.stringify(expectedSnapshot))
        read = await readInChain(path.join(historyDir, `manifest-v${ref.version}.json`), isTrunkManifestShape);
      if (!read.ok) return read;
      if (read.value.digest !== ref.digest) return { ok: false, reason: "corrupt", message: "manifest-digest-mismatch" };
      if (expectedSnapshot !== undefined && JSON.stringify(read.value.snapshotRef) !== JSON.stringify(expectedSnapshot)) return { ok: false, reason: "corrupt", message: "manifest-snapshot-mismatch" };
      if (read.value.snapshotRef !== undefined) {
        const closure = await verifyClosure(read.value, read.value.snapshotRef); if (!closure.ok) return closure;
      }
      return read;
    },
    readManifestVersion,
    async readOperation(operationId) {
      if (await readGitInitializationRecord(root, operationId)) return { ok: false, reason: "corrupt", message: "operation-bound-to-init-media" };
      try { await stat(path.join(root, ".ans/trunk/operations", hash(operationId), "git.json")); return { ok: false, reason: "corrupt", message: "operation-bound-to-git-media" }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { ok: false, reason: "io", message: String(error) }; }
      return readInChain(path.join(root, ".ans/trunk/operations", `${hash(operationId)}.json`), isTrunkApplyJournalShape);
    },
    async listStorageOperations() {
      try {
        const git = await listGitOperationJournals(root), initializations = await listGitInitializationRecords(root);
        let names: string[]; try { names = (await readdir(path.join(root, ".ans/trunk/operations"))).filter(name => /^[a-f0-9]{64}\.json$/i.test(name)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; names = []; }
        if (names.length + git.length + initializations.length > 2048) throw new Error("operation-record-read-budget");
        const values: Array<{ media: "fs" | "git-ref/v1" | "git-initialization/v1"; operationId: string }> = [...git.map(value => ({ media: "git-ref/v1" as const, operationId: value.operationId })), ...initializations.map(value => ({ media: "git-initialization/v1" as const, operationId: value.operationId }))];
        for (const name of names) {
          const old = await readInChain(path.join(root, ".ans/trunk/operations", name), isTrunkApplyJournalShape);
          if (!old.ok) return old;
          if (!old.value.operationId || `${hash(old.value.operationId)}.json` !== name) throw new Error("operation-record-identity");
          values.push({ media: "fs", operationId: old.value.operationId });
        }
        return { ok: true, value: values };
      } catch (error) { return { ok: false, reason: "corrupt", message: String(error) }; }
    },
    async listOperationRecords() {
      const dir = path.join(root, ".ans/trunk/operations");
      try {
        if ((await listGitOperationJournals(root)).length || (await listGitInitializationRecords(root)).length) return { ok: false, reason: "corrupt", message: "git-operation-media-requires-explicit-recovery" };
        const names = (await readdir(dir)).filter(name => /^[a-f0-9]{64}\.json$/i.test(name));
        if (names.length > 2048) return { ok: false, reason: "corrupt", message: "operation-record-read-budget" };
        const values: TrunkApplyJournal[] = [];
        for (const name of names) {
          const read = await readInChain(path.join(dir, name), isTrunkApplyJournalShape);
          if (!read.ok) return read;
          if (!read.value.operationId || `${hash(read.value.operationId)}.json` !== name) return { ok: false, reason: "corrupt", message: "operation-record-identity" };
          values.push(read.value);
        }
        return { ok: true, value: values };
      } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { ok: true, value: [] } : { ok: false, reason: "io", message: String(error) }; }
    },
    async writeOperation(journal) {
      if (!journal.operationId || !isTrunkApplyJournalShape(journal)) return { ok: false, code: "invalid", message: "invalid-operation-journal" };
      const operationHash = hash(journal.operationId), abs = path.join(root, ".ans/trunk/operations", `${operationHash}.json`);
      return serialize(abs, async () => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
        release = await acquireVersionLock(root);
        if (await readGitInitializationRecord(root, journal.operationId!)) return { ok: false, code: "invalid", message: "operation-bound-to-init-media" };
        try { await stat(path.join(root, ".ans/trunk/operations", operationHash, "git.json")); return { ok: false, code: "invalid", message: "operation-bound-to-git-media" }; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const existing = await readJsonFile(abs, isTrunkApplyJournalShape);
        if (existing.ok && JSON.stringify([existing.value.flowId, existing.value.target, existing.value.before, existing.value.actionSource, existing.value.targetSnapshot, existing.value.message])
            !== JSON.stringify([journal.flowId, journal.target, journal.before, journal.actionSource, journal.targetSnapshot, journal.message]))
          return { ok: false, code: "invalid", message: "operation-replay-conflict" };
        if (!existing.ok && existing.reason !== "missing") return { ok: false, code: "io", message: `operation-${existing.reason}` };
        return await writeJsonFile(abs, journal);
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },
    async readManifest() {
      if (!options.legacyCommitProofOnly && await gitModePresent()) return { ok: false, reason: "corrupt", message: "git-media-requires-project-selector" };
      return serialize(manifestAbs, async () => {
        const read = await readJsonFile(manifestAbs, isTrunkManifestShape);
        if (!read.ok || read.value.snapshotRef === undefined) return read;
        const snapshot = await verifyClosure(read.value, read.value.snapshotRef);
        return snapshot.ok ? read : snapshot;
      });
    },

    prepareSnapshot,
    readSnapshot,
    async readSnapshotArtifact(ref) {
      if (!isSnapshotArtifactRef(ref) || !/^[a-zA-Z0-9_-]{1,160}$/.test(ref.snapshotId)) return { ok: false, reason: "corrupt", message: "invalid-artifact-ref" };
      const snapshot = await readInChain(path.join(root, ".ans/trunk/snapshots", `${ref.snapshotId}.json`), validSnapshot);
      if (!snapshot.ok) return snapshot;
      const file = snapshot.value.files.find(file => file.path === ref.path && file.sha256 === ref.sha256.toLowerCase());
      return file ? { ok: true, value: { snapshot: snapshot.value, bytesBase64: file.bytesBase64, sha256: file.sha256 } }
        : { ok: false, reason: "corrupt", message: "snapshot-artifact-binding-mismatch" };
    },
    async captureSnapshot(input) {
      const files: Array<{ path: string; sha256: string; bytesBase64: string }> = [];
      const base = input.baseSnapshotRef === undefined ? undefined : await readSnapshot(input.baseSnapshotRef);
      if (base !== undefined && !base.ok) return base;
      try {
        const realRoot = await realpath(root);
        for (const ref of input.files) {
          const rel = ref.path.split("#")[0]!;
          if (!rel || /[\\:\x00-\x1f]/.test(rel) || rel.startsWith("/") || rel.split("/").some(p => !p || p === "." || p === ".."))
            return { ok: false, reason: "corrupt", message: "invalid-snapshot-path" };
          const duplicate = files.find(file => file.path.toLowerCase() === rel.toLowerCase());
          if (duplicate !== undefined) {
            if (duplicate.path !== rel || duplicate.sha256 !== ref.sha256.toLowerCase())
              return { ok: false, reason: "corrupt", message: "snapshot-ref-conflict" };
            continue;
          }
          const prior = base?.ok ? base.value.files.find(file => file.path === rel && file.sha256.toLowerCase() === ref.sha256.toLowerCase()) : undefined;
          if (prior !== undefined) { files.push({ ...prior }); continue; }
          const abs = await realpath(path.join(root, rel));
          const relative = path.relative(realRoot, abs);
          if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, reason: "corrupt", message: "snapshot-path-escape" };
          const bytes = await readFile(abs);
          if (hash(bytes) !== ref.sha256.toLowerCase()) return { ok: false, reason: "corrupt", message: `snapshot-hash-drift:${rel}` };
          files.push({ path: rel, sha256: hash(bytes), bytesBase64: bytes.toString("base64") });
        }
        return prepareSnapshot({ schema: COMPLETE_SNAPSHOT_SCHEMA, snapshotId: input.snapshotId,
          digest: snapshotDigest(files), files, createdAt: input.createdAt });
      } catch (error) { return { ok: false, reason: "io", message: String(error) }; }
    },
    async readFrozenRoleEvidence(evidence: FrozenRoleEvidence) {
      if (!isFrozenRoleEvidence(evidence)) return { ok: false, reason: "corrupt", message: "missing-frozen-role-evidence" };
      const read = await readSnapshot(evidence.snapshotRef);
      if (!read.ok) return read;
      const files = new Map(read.value.files.map(file => [file.path, file.sha256.toLowerCase()]));
      if (!FROZEN_ROLE_REF_KEYS.every(key => files.get(evidence[key].path) === evidence[key].sha256.toLowerCase()))
        return { ok: false, reason: "corrupt", message: "incomplete-frozen-role-evidence" };
      return read;
    },
    readActiveRoleEvidence,
    async readActiveRolesAt(ref) {
      if (!isPositiveInteger(ref.revision) || !isSha256Hex(ref.digest)) return { ok: false, reason: "corrupt", message: "invalid-active-ref" };
      const current = await readInChain(manifestAbs, isTrunkManifestShape);
      if (!current.ok && current.reason !== "missing") return current;
      const read = current.ok && current.value.activeRevision === ref.revision
        ? { ok: true as const, value: { revision: current.value.activeRevision, digest: current.value.activeDigest!, roles: current.value.activeRoles! } }
        : await readInChain(path.join(root, ".ans/trunk/active-history", `revision-${ref.revision}.json`), activeStateShape);
      if (!read.ok) return read;
      if (!activeStateShape(read.value) || read.value.digest !== ref.digest) return { ok: false, reason: "corrupt", message: "active-state-digest-mismatch" };
      for (const evidence of Object.values(read.value.roles)) { const bytes = await readActiveRoleEvidence(evidence); if (!bytes.ok) return bytes; }
      return read;
    },
    async compareAndSwapActiveRoles(expectedTrunk, expectedActive, next) {
      if (options.legacyCommitProofOnly || await gitModePresent()) return { ok: false, code: "invalid", message: "fs-publication-disabled-in-git-media" };
      if (!isSha256Hex(next.digest) || next.revision !== expectedActive.revision + 1 || !isObject(next.roles)
        || !Object.values(next.roles).every(isActiveRoleEvidence)) return { ok: false, code: "invalid", message: "invalid-active-target" };
      return serialize(manifestAbs, async () => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
          release = await acquireVersionLock(root);
          if (options.legacyCommitProofOnly || await gitModePresent()) return { ok: false, code: "invalid", message: "fs-publication-disabled-in-git-media" };
          const current = await readJsonFile(manifestAbs, isTrunkManifestShape);
          if (!current.ok) return { ok: false, code: "invalid", message: `manifest-${current.reason}` };
          if (current.value.trunkVersion !== expectedTrunk.version || current.value.digest !== expectedTrunk.digest
            || (current.value.activeRevision ?? 0) !== expectedActive.revision || (current.value.activeDigest ?? null) !== expectedActive.digest)
            return { ok: false, code: "conflict", message: "active-document-cas-conflict" };
          for (const [roleId, evidence] of Object.entries(next.roles)) {
            if (roleId !== evidence.roleId) return { ok: false, code: "invalid", message: "active-role-identity-mismatch" };
            const read = await readActiveRoleEvidence(evidence); if (!read.ok) return { ok: false, code: "invalid", message: read.message ?? read.reason };
          }
          if (current.value.activeRevision !== undefined) {
            const old: ActiveRolesState = { revision: current.value.activeRevision, digest: current.value.activeDigest!, roles: current.value.activeRoles! };
            const historyPath = path.join(root, ".ans/trunk/active-history", `revision-${old.revision}.json`);
            const existing = await readJsonFile(historyPath, activeStateShape);
            if (existing.ok ? JSON.stringify(existing.value) !== JSON.stringify(old) : existing.reason !== "missing")
              return { ok: false, code: "invalid", message: "active-history-conflict" };
            if (!existing.ok) { const archived = await writeJsonFile(historyPath, old); if (!archived.ok) return archived; }
          }
          if (!(await ownsVersionLock(root, release.token))) return { ok: false, code: "conflict", message: "active-fencing-lost" };
          return await writeJsonFile(manifestAbs, { ...current.value, activeRevision: next.revision, activeDigest: next.digest, activeRoles: next.roles });
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },
    async compareAndSwapManifest(expected, next, snapshot, expectedActive, expectedSnapshot) {
      if (options.legacyCommitProofOnly || await gitModePresent()) return { ok: false, code: "invalid", message: "fs-publication-disabled-in-git-media" };
      if (!isTrunkManifestShape(next) || JSON.stringify(next.snapshotRef) !== JSON.stringify(snapshot))
        return { ok: false, code: "invalid", message: "invalid-commit-manifest" };
      return serialize(manifestAbs, async () => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
          release = await acquireVersionLock(root);
          if (options.legacyCommitProofOnly || await gitModePresent()) return { ok: false, code: "invalid", message: "fs-publication-disabled-in-git-media" };
          const current = await readJsonFile(manifestAbs, isTrunkManifestShape);
          if (!current.ok && current.reason !== "missing") return { ok: false, code: "io", message: `manifest-${current.reason}` };
          if (expected === null ? current.ok : !current.ok || current.value.trunkVersion !== expected.version || current.value.digest !== expected.digest)
            return { ok: false, code: "conflict", message: "manifest-cas-conflict" };
          if (current.ok && current.value.flowId !== next.flowId) return { ok: false, code: "conflict", message: "manifest-flow-conflict" };
          if (expectedSnapshot !== undefined && (!current.ok || JSON.stringify(current.value.snapshotRef) !== JSON.stringify(expectedSnapshot)))
            return { ok: false, code: "conflict", message: "manifest-snapshot-cas-conflict" };
          if ((current.ok && current.value.activeRevision !== undefined && expectedActive === undefined)
            || (expectedActive !== undefined && ((current.ok ? current.value.activeRevision ?? 0 : 0) !== expectedActive.revision
              || (current.ok ? current.value.activeDigest ?? null : null) !== expectedActive.digest)))
            return { ok: false, code: "conflict", message: "manifest-active-cas-conflict" };
          // Re-read and merge under the shared lock. Document callers never publish role activation changes.
          const merged = { ...next, activeRevision: current.ok ? current.value.activeRevision : undefined,
            activeDigest: current.ok ? current.value.activeDigest : undefined, activeRoles: current.ok ? current.value.activeRoles : undefined };
          const closure = await verifyClosure(merged, snapshot);
          if (!closure.ok) return { ok: false, code: "invalid", message: closure.message ?? closure.reason };
          if (!(await ownsVersionLock(root, release.token))) return { ok: false, code: "conflict", message: "manifest-fencing-lost" };
          // Await inside try: finally must retain the lock until the atomic pointer write has completed.
          return await writeJsonFile(manifestAbs, merged);
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },

    writeManifest(manifest: TrunkManifest) {
      if (!isTrunkManifestShape(manifest)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-manifest" });
      }
      return serialize(manifestAbs, async () => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
        release = await acquireVersionLock(root);
        if (options.legacyCommitProofOnly || await gitModePresent()) return { ok: false, code: "invalid", message: "fs-publication-disabled-in-git-media" };
        const current = await readJsonFile(manifestAbs, isTrunkManifestShape);
        if (manifest.snapshotRef !== undefined || (current.ok && current.value.snapshotRef !== undefined))
          return { ok: false, code: "invalid", message: "snapshot-manifest-requires-cas" };
        return await writeJsonFile(manifestAbs, manifest);
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },

    readAmendment() {
      return readInChain(amendmentAbs, (value): value is TrunkAmendmentState =>
        isAmendmentShape(value, AMENDMENT_READ_STATUSES),
      );
    },

    writeAmendment(amendment: TrunkAmendmentState) {
      if (!isAmendmentShape(amendment, AMENDMENT_WRITE_STATUSES)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-amendment" });
      }
      return writeInChain(amendmentAbs, amendment);
    },

    readJournal() {
      return readInChain(journalAbs, isTrunkApplyJournalShape);
    },

    writeJournal(journal: TrunkApplyJournal) {
      if (!isTrunkApplyJournalShape(journal)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-journal" });
      }
      return writeInChain(journalAbs, journal);
    },

    archiveHistory(version: number, manifest: TrunkManifest) {
      if (!isPositiveInteger(version)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-version" });
      }
      if (!isTrunkManifestShape(manifest)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-manifest" });
      }
      if (manifest.trunkVersion !== version) {
        return Promise.resolve({ ok: false, code: "invalid", message: "version-mismatch" });
      }
      const abs = path.join(historyDir, `manifest-v${version}.json`);
      return serialize(abs, async (): Promise<StoreWrite> => {
        let release: Awaited<ReturnType<typeof acquireVersionLock>> | undefined;
        try {
        release = await acquireVersionLock(root);
        const existing = await readJsonFile(abs, isTrunkManifestShape);
        if (existing.ok) {
          // 归档不可变：同版本同内容幂等；不同内容拒绝（不覆盖历史）。
          const identical = JSON.stringify(existing.value) === JSON.stringify(manifest);
          const sameMaterializedContent = (existing.value.snapshotRef === undefined) !== (manifest.snapshotRef === undefined)
            && existing.value.digest === manifest.digest && JSON.stringify(existing.value.artifacts) === JSON.stringify(manifest.artifacts)
            && JSON.stringify([existing.value.flowId, existing.value.runId, existing.value.rosterVersion, existing.value.d3, existing.value.roles, existing.value.frozenRoles, existing.value.previous])
              === JSON.stringify([manifest.flowId, manifest.runId, manifest.rosterVersion, manifest.d3, manifest.roles, manifest.frozenRoles, manifest.previous]);
          const sameDocumentContent = existing.value.digest === manifest.digest && JSON.stringify(existing.value.artifacts) === JSON.stringify(manifest.artifacts)
            && JSON.stringify([existing.value.flowId, existing.value.runId, existing.value.rosterVersion, existing.value.d3, existing.value.roles, existing.value.frozenRoles, existing.value.previous, existing.value.snapshotRef])
              === JSON.stringify([manifest.flowId, manifest.runId, manifest.rosterVersion, manifest.d3, manifest.roles, manifest.frozenRoles, manifest.previous, manifest.snapshotRef]);
          const unchangedInitialDocuments = existing.value.digest === manifest.digest
            && (existing.value.artifacts.workflow === undefined) !== (manifest.artifacts.workflow === undefined)
            && JSON.stringify([existing.value.artifacts.documents, existing.value.artifacts.execution, existing.value.artifacts.roleCards, existing.value.artifacts.boundaries,
              existing.value.flowId, existing.value.runId, existing.value.rosterVersion, existing.value.d3, existing.value.roles, existing.value.frozenRoles, existing.value.previous, existing.value.source, existing.value.actionSource])
              === JSON.stringify([manifest.artifacts.documents, manifest.artifacts.execution, manifest.artifacts.roleCards, manifest.artifacts.boundaries,
                manifest.flowId, manifest.runId, manifest.rosterVersion, manifest.d3, manifest.roles, manifest.frozenRoles, manifest.previous, manifest.source, manifest.actionSource]);
          return identical || sameMaterializedContent || sameDocumentContent || unchangedInitialDocuments
            ? { ok: true }
            : { ok: false, code: "invalid", message: "history-conflict" };
        }
        if (existing.reason !== "missing") {
          return { ok: false, code: "invalid", message: "history-conflict" };
        }
        return await writeJsonFile(abs, manifest);
        } catch (error) { return { ok: false, code: "io", message: String(error) }; }
        finally { await release?.(); }
      });
    },

    async listHistory(options?: { onDiagnostic?: (message: string) => void }) {
      return serialize(historyDir, async () => {
        let names: string[];
        try {
          names = await readdir(historyDir);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (code === "ENOENT") return [];
          throw err;
        }
        const versions: number[] = [];
        for (const name of names) {
          const match = HISTORY_FILE_RE.exec(name);
          if (match === null) continue;
          const version = Number(match[1]);
          const read = await readJsonFile(path.join(historyDir, name), isTrunkManifestShape);
          if (!read.ok) {
            options?.onDiagnostic?.(`history-skipped:${name}:${read.reason}`);
            continue;
          }
          if (read.value.trunkVersion !== version) {
            options?.onDiagnostic?.(`history-skipped:${name}:version-mismatch`);
            continue;
          }
          versions.push(version);
        }
        versions.sort((a, b) => a - b);
        return versions;
      });
    },
  };
}
