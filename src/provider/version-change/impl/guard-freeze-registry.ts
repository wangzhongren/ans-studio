// src/provider/version-change/impl/guard-freeze-registry.ts
// R9 冻结注册表适配（C2b `versioned-doc-guard` 单一实现之上的 Port 映射；B-6 / S1）。
//
// 纪律（P1 §3.8；C2c §四；C2b 交接 §八-4/F34）：
// · **写只经 C2b**：`appendDocFreezeRecords` / `appendDocDraftMarkerRecords`
//   （同 `versions.lock`/fencing；本文件不写 `versions.jsonl`，不复制锁/追加实现）；
// · **状态/快照只经 C2b**：`refreshVersionedDocFreezeSnapshot`（读 baseline → 构建并安装
//   同步快照，返回快照）；`state()` 由快照 state 映射：
//   `ready`→`ready`、`migration-required`→`missing`（先迁移）、`corrupt|unknown`→`corrupt`；
// · **完整冻结记录读取**：C2b 未导出 baseline 记录列表 API；本文件在 C2b 判定 baseline
//   非损坏后，只做**只读投影**（JSONL 行 → `DocFreezeRecordInput`/`DraftMarkerEntry`，
//   latest-record-per-path），冻结子形状用 C2b 导出的 `isValidDocFreezeRecord` 校验。
//   该投影不写盘、不做迁移/锁/追加语义，**不是第二权威**；C2b 若后续导出读 API，可在
//   不改 Service Port 的前提下替换本投影。
// · `migrationCompleted` 由注入（C2c 迁移完成后置 true）；缺省 false = 安全向
//   （migration-required：既有文档按冻结处理，F29）。

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  appendDocDraftMarkerRecords,
  appendDocFreezeRecords,
  isValidDocFreezeRecord,
  normalizeVersionedDocPath,
  refreshVersionedDocFreezeSnapshot,
  VERSION_BASELINE_REL,
  type VersionedDocFreezeSnapshot,
} from "../../../common/门禁引擎/versioned-doc-guard.ts";
import type { DocFreezeRecord } from "../../../model/version-change.ts";
import type {
  DraftMarkerInput,
  FreezeRecordInput,
  FreezeRegistryState,
  FreezeRegistryStore,
} from "../abstract/freeze-cache.ts";

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

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
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

    async appendDocFreezeRecords(records: FreezeRecordInput[]) {
      const result = await appendDocFreezeRecords(
        records.map((record) => ({
          projectRoot: root,
          relPath: record.path,
          sha256: record.sha256,
          freeze: record.freeze,
        })),
        options.now !== undefined ? { now: options.now } : {},
      );
      invalidate();
      return result.ok ? { ok: true } : mapAppendFailure(result.reason);
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
