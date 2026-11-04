// src/provider/download/public/download-provider.ts
// 下载 Provider 公共出口（编排 B-3）。只 re-export 支持的类型、常量与生产工厂，不 wildcard。
//
// 生产工厂**不暴露** resolver 覆盖/地址放行/`lookupOverride`/`agent`/TLS 关闭等测试缝；
// 测试装配直接使用 `impl/` 的有缝工厂（仅 test/编排/** 引用，结构检查保证生产不引用）。

export {
  DownloadProviderError,
  type PinnedAddress,
  type ResolvedHost,
  type HostResolver,
  type DownloadLimits,
  type RedirectFollowDecision,
  type TransportRequest,
  type TransportResult,
  type DownloadTransport,
} from "../abstract/download-provider.ts";
export {
  DOWNLOAD_LEDGER_REL,
  type DownloadLedgerJudgeInfo,
  type DownloadLedgerEventV1,
  type DownloadLedger,
} from "../abstract/download-ledger.ts";
export {
  DOWNLOAD_CONSUMER_STATE_REL,
  DOWNLOAD_CONSUMER_STATE_VERSION,
  type DownloadConsumerEpochState,
  type DownloadConsumerEpochStore,
} from "../abstract/download-consumer-epoch.ts";
export { createNodeHostResolver, DOWNLOAD_DNS_TIMEOUT_MS } from "../impl/node-resolver.ts";
export { createNodeDownloadTransportProduction } from "../impl/node-http.ts";
export {
  createDownloadLedger,
  downloadLedgerPath,
  type DownloadLedgerOptions,
} from "../impl/jsonl-ledger.ts";
export {
  createDownloadConsumerEpochStore,
  downloadConsumerStatePath,
} from "../impl/consumer-epoch-store.ts";
