// src/provider/download/abstract/download-provider.ts
// 下载执行 Provider —— 抽象契约（2026-11-04，download-requests B1）。
//
// 归属：编排（B-3 模块私有根 `src/provider/download/`）。Provider 只做基础设施：
// DNS 全量解析、Node http/https 流式传输（钉扎/逐跳回调/超时/上限/状态码/TLS）、
// 文件 sink（占位/临时/原子 rename）。**不做业务判定**——URL/IP/同域/文件名策略由
// Pipeline 经 Service 注入（`onRedirect`/`planFile`）；Provider 不 import Service。
//
// 不 import Pipeline/Interface；公共出口只经 `public/download-provider.ts`。

import type { DownloadErrorCode } from "../../../model/download.ts";

/** Provider 稳定错误（HostResolver 使用；Transport 以结果联合返回，不靠抛错做业务流）。 */
export class DownloadProviderError extends Error {
  readonly code: DownloadErrorCode;
  readonly detail?: string;

  constructor(code: DownloadErrorCode, detail?: string) {
    super(detail !== undefined ? `${code}: ${detail}` : code);
    this.name = "DownloadProviderError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

/** DNS 全量解析结果（去重保序；校验与钉扎作用于全部）。 */
export interface ResolvedHost {
  addresses: PinnedAddress[];
}

export interface HostResolver {
  /** 失败以 `DownloadProviderError(code:"download-dns-failed")` reject。 */
  resolve(host: string, opts?: { signal?: AbortSignal }): Promise<ResolvedHost>;
}

/** Provider 自有的上限/超时子集（Pipeline 从 Service Config 取值传入；Provider 不 import Service）。 */
export interface DownloadLimits {
  maxBytes: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  maxRedirects: number;
}

export type RedirectFollowDecision =
  | { action: "follow"; url: string; pinnedAddresses: readonly PinnedAddress[] }
  | { action: "stop"; code: DownloadErrorCode; detail?: string; redirectTo?: string };

export interface TransportRequest {
  /** 初始 URL（归一化、无 userinfo）。 */
  url: string;
  /** 执行时已校验的地址集合；lookup 只返回其中地址。 */
  pinnedAddresses: readonly PinnedAddress[];
  limits: DownloadLimits;
  /** 项目根（下载目录固定为 `<projectRoot>/download/`）。 */
  projectRoot: string;
  signal?: AbortSignal;
  /** 每一跳重定向由 Pipeline 重新校验/解析/钉扎；返回 stop 时不跟随。 */
  onRedirect(info: { fromUrl: string; toUrl: string; hop: number }): Promise<RedirectFollowDecision>;
  /** 200 响应头到达后由 Pipeline（Service）决定净化后的单文件名。 */
  planFile(info: { finalUrl: string; contentDisposition?: string }): Promise<{ fileName: string }>;
  /** 占位文件创建成功、正文开始前通知（审计 `download.started`）。 */
  onStarted(info: { finalUrl: string; fileName: string }): void | Promise<void>;
}

export type TransportResult =
  | {
      ok: true;
      finalUrl: string;
      fileName: string;
      /** 项目相对路径：`download/<name>`（不含绝对路径）。 */
      pathRel: string;
      bytes: number;
      sha256: string;
      contentType?: string;
      durationMs: number;
    }
  | {
      ok: false;
      code: DownloadErrorCode;
      httpStatus?: number;
      bytesWritten: number;
      detail?: string;
      redirectTo?: string;
    };

export interface DownloadTransport {
  execute(req: TransportRequest): Promise<TransportResult>;
}
