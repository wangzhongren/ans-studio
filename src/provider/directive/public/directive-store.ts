// src/provider/directive/public/directive-store.ts
// 客户指令账本 Provider 公共出口（编排 B-3）。只 re-export，不定义第二份。

export {
  CUSTOMER_DIRECTIVE_STORE_REL,
  type DirectiveStore,
  type DirectiveStoreReplay,
} from "../abstract/directive-store.ts";
export {
  createDirectiveFileStore,
  customerDirectiveLedgerPath,
  type DirectiveFileStoreOptions,
} from "../impl/file-store.ts";
