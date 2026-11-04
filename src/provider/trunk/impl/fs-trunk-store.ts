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

import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import {
  TRUNK_AMENDMENT_LEGACY_STATUSES,
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_AMENDMENT_STATUSES,
  TRUNK_APPLY_JOURNAL_PHASES,
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_MANIFEST_SCHEMA,
  TRUNK_SOURCES,
  TRUNK_VERSION_MIN,
} from "../../../model/trunk.ts";
import type {
  TrunkAmendmentState,
  TrunkApplyJournal,
  TrunkManifest,
} from "../../../model/trunk.ts";
import {
  TRUNK_AMENDMENT_REL,
  TRUNK_HISTORY_DIR,
  TRUNK_JOURNAL_REL,
  TRUNK_MANIFEST_REL,
} from "../abstract/trunk-store.ts";
import type { StoreRead, StoreWrite, TrunkStore } from "../abstract/trunk-store.ts";

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
  if (!isStableArtifactRef(artifacts.workflow)) return false;
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
export function isTrunkApplyJournalShape(value: unknown): value is TrunkApplyJournal {
  if (!isObject(value)) return false;
  if (value.v !== 1 || value.schema !== TRUNK_APPLY_JOURNAL_SCHEMA) return false;
  if (!isNonEmptyString(value.journalId) || !isNonEmptyString(value.flowId)) return false;
  if (typeof value.phase !== "string" || !(TRUNK_APPLY_JOURNAL_PHASES as readonly string[]).includes(value.phase)) {
    return false;
  }
  if (!isObject(value.target) || !isObject(value.before)) return false;
  if (!isNonEmptyString(value.startedAt) || !isNonEmptyString(value.updatedAt)) return false;
  return true;
}

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
export function createFsTrunkStore(projectRoot: string): TrunkStore {
  const root = path.resolve(projectRoot);
  const manifestAbs = path.join(root, TRUNK_MANIFEST_REL);
  const amendmentAbs = path.join(root, TRUNK_AMENDMENT_REL);
  const journalAbs = path.join(root, TRUNK_JOURNAL_REL);
  const historyDir = path.join(root, TRUNK_HISTORY_DIR);

  return {
    readManifest() {
      return readInChain(manifestAbs, isTrunkManifestShape);
    },

    writeManifest(manifest: TrunkManifest) {
      if (!isTrunkManifestShape(manifest)) {
        return Promise.resolve({ ok: false, code: "invalid", message: "invalid-manifest" });
      }
      return writeInChain(manifestAbs, manifest);
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
        const existing = await readJsonFile(abs, isTrunkManifestShape);
        if (existing.ok) {
          // 归档不可变：同版本同内容幂等；不同内容拒绝（不覆盖历史）。
          return JSON.stringify(existing.value) === JSON.stringify(manifest)
            ? { ok: true }
            : { ok: false, code: "invalid", message: "history-conflict" };
        }
        if (existing.reason === "corrupt") {
          return { ok: false, code: "invalid", message: "history-conflict" };
        }
        return writeJsonFile(abs, manifest);
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
