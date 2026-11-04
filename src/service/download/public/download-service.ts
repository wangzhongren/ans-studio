// src/service/download/public/download-service.ts
// 下载 Service 公共出口（编排 B-3）。只 re-export 支持的类型与工厂，不 wildcard。

export type {
  DownloadConfig,
  NormalizedUrl,
  UrlCheckResult,
  IpDecision,
  DownloadCardFilenameSource,
  DownloadExecutionFilenameSource,
  RedirectDecision,
  DownloadPolicy,
} from "../abstract/download-policy.ts";
export {
  createDownloadPolicy,
  boundJudgeFacts,
  type CreateDownloadPolicyOptions,
} from "../impl/download-service.ts";
export {
  DOWNLOAD_ENV_MAX_BYTES,
  DOWNLOAD_ENV_CONNECT_TIMEOUT_MS,
  DOWNLOAD_ENV_IDLE_TIMEOUT_MS,
  DOWNLOAD_ENV_TOTAL_TIMEOUT_MS,
  DOWNLOAD_MAX_REDIRECTS,
  DOWNLOAD_EXECUTABLE_CONCURRENCY,
} from "../impl/config.ts";
