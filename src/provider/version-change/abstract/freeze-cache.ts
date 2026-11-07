// O-owned Provider contracts for R9 freeze records, raw baseline CAS and derived snapshot storage.
// The returned snapshots are plain data. G Service performs business validation/installation.

import type { DocFreezeRecord, DocFreezeReason } from "../../../model/version-change.ts";


/** `doc-freezes.json`（派生缓存，app-only；可随时由 R9 baseline 重建）。 */
export const DOC_FREEZES_REL = ".ans/state/doc-freezes.json";
export interface VersionBaselineState { text: string | null; initialized: boolean }
export interface VersionBaselineWriteInput {
  text: string;
  expectedSha256: string | null;
  initialize?: boolean;
  lockToken: string;
}
export type VersionBaselineWriteResult = { ok: true } | { ok: false; reason: string };

/**
 * 缓存形状 = Provider普通数据投影（G纯消费者结构兼容）：
 * `{v:1, schema:"doc-freezes/v1", state, baselineSha256?, entries, builtAt}`。
 */
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



export type DocFreezeCache = VersionedDocFreezeSnapshot;

export type CacheUnusableReason = "cache-corrupt" | "baseline-corrupt" | "baseline-missing" | "io";

/** 对账结果（P1 §4.1；`rebuilt` 携带告警文案，供面板/审计展示）。 */
export type CacheReconcileResult =
  | { state: "consistent"; cache: DocFreezeCache }
  | { state: "rebuilt"; cache: DocFreezeCache; warning: string }
  | { state: "unusable"; reason: CacheUnusableReason; message: string };

/** 从 baseline 重建结果（不自动处理迁移；missing/corrupt ⇒ fail-closed）。 */
export type CacheRebuildResult =
  | { ok: true; cache: DocFreezeCache }
  | { ok: false; reason: CacheUnusableReason; message: string };

/**
 * 派生缓存存储（S2/S3 `ensureCache()`/面板/恢复入口消费）。
 * `load` 只判别文件本身；`rebuildFromBaseline`/`reconcile` 经注入的 C2b 刷新读 baseline。
 */
export interface FreezeCacheStore {
  load(): Promise<
    { ok: true; value: DocFreezeCache } | { ok: false; reason: "missing" | "corrupt" | "io"; message?: string }
  >;
  /** 显式写缓存（原子；结构不合法 ⇒ `{ok:false, code:"io", message:"invalid-cache"}`）。 */
  write(cache: DocFreezeCache): Promise<{ ok: true } | { ok: false; code: "io"; message?: string }>;
  rebuildFromBaseline(): Promise<CacheRebuildResult>;
  reconcile(): Promise<CacheReconcileResult>;
}

// —————————————— R9 冻结注册表适配（C2b Port 映射） ——————————————

/** 冻结注册表状态（与 C2c `FreezeRegistryState` 结构一致；missing ⇒ 先迁移）。 */
export type FreezeRegistryState = "missing" | "ready" | "corrupt";

/** 冻结记录输入（与 C2c `DocFreezeRecordInput` 结构一致；`freeze` = C1 唯一子形状）。 */
export interface FreezeRecordInput {
  path: string;
  version: number;
  sha256: string;
  freeze: DocFreezeRecord;
}
/** Ordinary exact committed-storage evidence, issued after native Git ancestry/object readback. Not a model parameter. */
export interface CommittedFreezeBasis {
  projectRoot: string; operationId: string;
  operationFile: { path: string; sha256: string };
  source: Extract<import("../../../model/trunk.ts").DirectActionSource, { kind: "role-direct" }>;
  snapshotRef: import("../../../model/trunk.ts").SnapshotRef;
  commit: import("../../../model/trunk.ts").GitOid;
  commitBytesBase64: string;
}

/** `migrated-draft` 证据标记（与 C2c `DraftMarkerEntry` 结构一致；不写 `doc.freeze`）。 */
export interface DraftMarkerInput {
  path: string;
  version: number;
  sha256?: string;
  evidence?: string;
  markedAt: string;
}

/**
 * R9 冻结注册表适配接口（C2c `FreezeRegistryPort` 的结构等价；S1 提供 C2b 适配实现，
 * S2/S3 以 deps 注入 `createVersionChangeService`）。
 */
export interface FreezeRegistryStore {
  state(): Promise<FreezeRegistryState>;
  listFreezes(): Promise<FreezeRecordInput[]>;
  listDraftMarkers(): Promise<DraftMarkerInput[]>;
  appendDocFreezeRecords(records: FreezeRecordInput[], evidence?: { committedOperation: CommittedFreezeBasis }): Promise<{ ok: true } | { ok: false; code: "conflict" | "io"; message?: string }>;
  appendDraftMarkers(markers: DraftMarkerInput[]): Promise<{ ok: true } | { ok: false; code: "conflict" | "io"; message?: string }>;
  /** 写后刷新 C2b 安装快照（失败 ⇒ 快照 unknown ⇒ 生产守卫 fail-closed）。 */
  refreshSnapshot(): Promise<void>;
}
