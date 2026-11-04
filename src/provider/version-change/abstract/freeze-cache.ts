// src/provider/version-change/abstract/freeze-cache.ts
// R9 冻结注册表适配 + `doc-freezes.json` 派生缓存 Provider 抽象契约
// （2026-11-04 trunk-amendment-model B-6 / S1）。
//
// 纪律（P1 §3.2/§4.1/§4.2；C2b 交接 §八-4；F34）：
// · **权威 = R9 `.ans/state/versions.jsonl`**（C2b 唯一写入者/读者）；`doc-freezes.json`
//   仅为**可重建派生同步缓存**，与 baseline 不一致时**以 baseline 为准**重写并告警；
// · 本 Provider **不复制 R9 实现**：冻结/迁移追加只经 C2b `appendDocFreezeRecords` /
//   `appendDocDraftMarkerRecords`（同 `versions.lock`/fencing），快照构建/安装只经 C2b
//   `refreshVersionedDocFreezeSnapshot`；
// · `FreezeRegistryStore` 与 C2c `FreezeRegistryPort` **结构一致**（state/listFreezes/
//   listDraftMarkers/appendDocFreezeRecords/appendDraftMarkers/refreshSnapshot），由测试类型
//   断言固定；本文件不 import Service（依赖方向 Provider ← Service）；
// · 缓存文件形状 = C2b 冻结同步快照 `VersionedDocFreezeSnapshot`（schema `doc-freezes/v1`），
//   不另造第二形状；`baselineSha256` 仅用于判断「是否需要重建」，不是权威；
// · 对账语义：一致 ⇒ no-op；缓存缺失/陈旧（baseline hash 变化）⇒ 从 baseline 重建并告警；
//   缓存损坏 ⇒ `unusable`（fail-closed，不自动重建）；baseline corrupt/缺失 ⇒ `unusable`，
//   不重写缓存（F29/AC-21/AC-27）。

import type { DocFreezeRecord } from "../../../model/version-change.ts";
import type { VersionedDocFreezeSnapshot } from "../../../common/门禁引擎/versioned-doc-guard.ts";

/** `doc-freezes.json`（派生缓存，app-only；可随时由 R9 baseline 重建）。 */
export const DOC_FREEZES_REL = ".ans/state/doc-freezes.json";

/**
 * 缓存形状 = C2b 冻结同步快照（单一形状，不复制）：
 * `{v:1, schema:"doc-freezes/v1", state, baselineSha256?, entries, builtAt}`。
 */
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
  appendDocFreezeRecords(records: FreezeRecordInput[]): Promise<{ ok: true } | { ok: false; code: "conflict" | "io"; message?: string }>;
  appendDraftMarkers(markers: DraftMarkerInput[]): Promise<{ ok: true } | { ok: false; code: "conflict" | "io"; message?: string }>;
  /** 写后刷新 C2b 安装快照（失败 ⇒ 快照 unknown ⇒ 生产守卫 fail-closed）。 */
  refreshSnapshot(): Promise<void>;
}
