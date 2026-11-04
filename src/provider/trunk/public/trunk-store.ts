// src/provider/trunk/public/trunk-store.ts
// trunk 存储 Provider 公共出口（编排 B-3 / S1）。只 re-export，不定义第二份形状；
// 不 wildcard 导出 impl 内部（校验辅助不从公共面暴露）。

export {
  TRUNK_AMENDMENT_REL,
  TRUNK_HISTORY_DIR,
  TRUNK_JOURNAL_REL,
  TRUNK_MANIFEST_REL,
  type StoreRead,
  type StoreReadFailure,
  type StoreReadFailureReason,
  type StoreWrite,
  type StoreWriteFailure,
  type StoreWriteFailureCode,
  type TrunkStore,
  type TrunkStoreError,
} from "../abstract/trunk-store.ts";
export { createFsTrunkStore } from "../impl/fs-trunk-store.ts";
