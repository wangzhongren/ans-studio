// src/service/download/abstract/download-policy.ts
// 下载 Service —— 抽象契约与跨层类型（2026-11-04，download-requests B1）。
//
// 归属：编排（B-3 模块私有根 `src/service/download/`）。职责：纯业务规则——
// URL/协议/凭据校验、主机归一化、IP 分类（IPv4 拒绝清单 + IPv6 `2000::/3` 正向 + 特殊段排除）、
// 同域判定、文件名解析/净化、配置解析、judge 事实有界化。
// 本层无 I/O、不联网、不做文件系统访问；不 import Pipeline/Interface/Provider。

import type { DownloadJudgeFacts } from "../../../model/download.ts";

/** 下载执行配置（值来自部署方 env；模型/申请方不可改）。 */
export interface DownloadConfig {
  maxBytes: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  /** 固定 5（方案 §5.3）。 */
  maxRedirects: number;
  /** 固定 2（方案 §5.6：每项目执行并发上限）。 */
  executableConcurrency: number;
}

/** 归一化 URL（无 userinfo；host 小写/去尾点/punycode；IPv6 去括号）。 */
export interface NormalizedUrl {
  /** 归一化后的完整 URL（无 userinfo、无 fragment；≤2048B）。 */
  url: string;
  scheme: "http" | "https";
  /** punycode 小写、去尾点；IPv6 为无括号字面量。 */
  host: string;
  /** 仅显式非默认端口。 */
  port?: number;
  /** TLS SNI/证书主机名（非 IP 字面量时才给出）。 */
  hostForTls?: string;
}

export type UrlCheckResult =
  | { ok: true; url: NormalizedUrl }
  | { ok: false; code: "download-unsafe-url"; reason: string };

export interface IpDecision {
  allowed: boolean;
  family: 4 | 6;
  reason?: string;
}

/** 卡片阶段文件名来源（A1 `DownloadJudgeFacts.filenameSource` 的取值集合）。 */
export type DownloadCardFilenameSource = "url-basename" | "caller" | "fallback";
/** 执行阶段文件名来源（可被 Content-Disposition 覆盖；B1 自有类型，不写入 A1 Model）。 */
export type DownloadExecutionFilenameSource = DownloadCardFilenameSource | "content-disposition";

export type RedirectDecision =
  | { kind: "same" }
  | { kind: "cross-host" }
  | { kind: "scheme-downgrade" }
  | { kind: "unsafe"; reason: string };

export interface DownloadPolicy {
  /** URL 形状/协议/凭据/端口/主机归一化。 */
  checkUrl(raw: string): UrlCheckResult;
  /**
   * IP 公网判定：IPv4 拒绝清单；IPv6 必须落在 `2000::/3` 且不在特殊段。
   * 非法输入一律 `allowed:false`。
   */
  classifyIp(ip: string): IpDecision;
  /** 重定向同域判定（host 归一相等；端口不参与；`https→http` 降级不算同域）。 */
  isSameHostForRedirect(from: NormalizedUrl, to: NormalizedUrl): RedirectDecision;
  /** 卡片阶段文件名：URL basename → caller → 兜底；**永不返回 content-disposition**。 */
  suggestCardFilename(input: {
    url: NormalizedUrl;
    callerSuggestion?: string;
    now?: Date;
  }): { name: string; source: DownloadCardFilenameSource };
  /** 执行阶段文件名：Content-Disposition 优先，其次 URL basename → caller → 兜底。 */
  resolveExecutionFilename(input: {
    contentDisposition?: string;
    url: NormalizedUrl;
    callerSuggestion?: string;
    now?: Date;
  }): { name: string; source: DownloadExecutionFilenameSource };
  /** 文件名净化（单文件名；不含目录段）。空结果由调用方兜底。 */
  sanitizeFilename(name: string): { name: string };
  /** 把 `request.download` 压到 ≤2048B（只截断展示型字段；校验字段不动）。 */
  boundJudgeFacts(facts: DownloadJudgeFacts): DownloadJudgeFacts;
  /** 解析部署方 env；非法值回退默认并返回诊断码。 */
  resolveConfig(env?: NodeJS.ProcessEnv): { config: DownloadConfig; diagnostics: string[] };
  /** 错误消息里的 URL：去 userinfo、去 fragment、≤2048B。 */
  sanitizeUrlForMessage(raw: string): string;
}
