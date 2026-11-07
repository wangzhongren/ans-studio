// src/provider/version-change/public/version-change-store.ts
// 版本变更 / 重构 / stable-write 存储与 R9 冻结缓存 Provider 公共出口（编排 B-6 / S1）。
// 只 re-export，不定义第二份形状；不 wildcard 导出 impl 内部。

export {
  DOC_FREEZES_REL,
  type CacheRebuildResult,
  type CacheReconcileResult,
  type CacheUnusableReason,
  type DocFreezeCache,
  type DraftMarkerInput,
  type FreezeCacheStore,
  type FreezeRecordInput,
  type CommittedFreezeBasis,
  type FreezeRegistryState,
  type FreezeRegistryStore,
  type VersionBaselineState, type VersionBaselineWriteInput, type VersionBaselineWriteResult,
} from "../abstract/freeze-cache.ts";
export {
  REFACTOR_REQUESTS_REL,
  STABLE_WRITE_PERMITS_REL,
  STABLE_WRITES_REL,
  VERSION_CHANGES_REL,
  type JsonRecordRead,
  type JsonRecordReadFailureReason,
  type RefactorRequestStore,
  type RepositoryWriteResult,
  type StableWritePermitStore,
  type StableWriteStore,
  type VersionChangeStore,
} from "../abstract/version-change-store.ts";
export { createFreezeCacheStore, isDocFreezeCacheShape, type FreezeCacheStoreOptions } from "../impl/fs-freeze-cache.ts";
export {
  createRefactorRequestStore,
  createStableWritePermitStore,
  createStableWriteStore,
  createVersionChangeStore,
} from "../impl/fs-version-change-store.ts";
export { createGuardFreezeRegistry, type GuardFreezeRegistryOptions } from "../impl/guard-freeze-registry.ts";

export { refreshVersionedDocFreezeSnapshot, appendDocFreezeRecords, appendDocDraftMarkerRecords, acquireVersionLock, ownsVersionLock, releaseVersionLock, isValidDocFreezeRecord } from "../impl/guard-freeze-registry.ts";
export type { VersionedDocFreezeSnapshot, VersionedDocFreezeEntry, VersionedDocFreezeSnapshotState } from "../abstract/freeze-cache.ts";

export { completeSnapshotDigest, isStoredCompleteSnapshot } from "../impl/guard-freeze-registry.ts";

export { scanVersionedDocuments } from "../impl/guard-freeze-registry.ts";
export { readVersionBaselineState, writeVersionBaselineState, readConfirmedIntentEvidence } from "../impl/guard-freeze-registry.ts";
export { appendOperationEvent, appendTaskLedgerEvent, readOperationEvents, operationDeliveryRecorded, recordOperationDelivery } from "../impl/guard-freeze-registry.ts";
