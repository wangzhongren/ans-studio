// src/service/download/impl/download-service.ts
// 下载 Service —— 组合实现（2026-11-04，download-requests B1）。
//
// 组装纯规则并提供 `request.download` 的有界化（≤2 KiB，独立于 GovernanceJudgeFacts 的 8 KiB）。
// 本文件无 I/O；配置默认来自部署方 env，模型/申请方无入口。

import {
  DOWNLOAD_JUDGE_FACTS_MAX_BYTES,
} from "../../../model/download.ts";
import type { DownloadJudgeFacts } from "../../../model/download.ts";
import type { DownloadPolicy, DownloadConfig } from "../abstract/download-policy.ts";
import { resolveDownloadConfig } from "./config.ts";
import { classifyIp } from "./ip-policy.ts";
import { pickCardFilename, pickExecutionFilename, sanitizeFilename } from "./filename.ts";
import { checkUrl, isSameHostForRedirect, sanitizeUrlForMessage } from "./url-policy.ts";

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

/**
 * 把 `request.download` 压到 ≤2048B（方案 §4.1，复核 F11）：
 * 只截断**展示型**字段（`url` 保留 scheme+host+路径前段、`purpose` 截断）；
 * `scheme`/`host`/`resolvedIps`/`resolvedIpsTotal`/`resolvedIpsTruncated`/`filename`/
 * `filenameSource`/`maxBytes`/`mechanical` 等校验字段**不截断**。
 */
export function boundJudgeFacts(facts: DownloadJudgeFacts): DownloadJudgeFacts {
  const measure = (value: DownloadJudgeFacts): number => byteLength(JSON.stringify(value));
  if (measure(facts) <= DOWNLOAD_JUDGE_FACTS_MAX_BYTES) return facts;
  const copy: DownloadJudgeFacts = { ...facts, resolvedIps: [...facts.resolvedIps], mechanical: { ...facts.mechanical } };
  const prefix = `${copy.scheme}://${copy.host}${copy.port !== undefined ? `:${copy.port}` : ""}`;
  let url = copy.url;
  let purpose = copy.purpose;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate: DownloadJudgeFacts = { ...copy, url, purpose };
    if (measure(candidate) <= DOWNLOAD_JUDGE_FACTS_MAX_BYTES) return candidate;
    if (purpose !== "") {
      const target = Math.floor(byteLength(purpose) / 2);
      const next = truncateUtf8(purpose, target);
      purpose = next === "…" || next === "" ? "" : next;
      continue;
    }
    if (byteLength(url) > byteLength(prefix)) {
      const target = Math.max(byteLength(prefix), Math.floor(byteLength(url) * 3 / 4));
      const next = truncateUtf8(url, target);
      url = byteLength(next) < byteLength(prefix) ? prefix : next;
      continue;
    }
    break;
  }
  return { ...copy, url, purpose };
}

export interface CreateDownloadPolicyOptions {
  /** 部署方 env（缺省 process.env）；测试可注入。 */
  env?: NodeJS.ProcessEnv;
}

/** 生产工厂：组合全部纯规则；无 resolver/provider/loopback 放行等测试缝。 */
export function createDownloadPolicy(options: CreateDownloadPolicyOptions = {}): DownloadPolicy {
  const env = options.env ?? process.env;
  return {
    checkUrl,
    classifyIp,
    isSameHostForRedirect,
    suggestCardFilename: pickCardFilename,
    resolveExecutionFilename: pickExecutionFilename,
    sanitizeFilename,
    boundJudgeFacts,
    resolveConfig: (override?: NodeJS.ProcessEnv): { config: DownloadConfig; diagnostics: string[] } =>
      resolveDownloadConfig(override ?? env),
    sanitizeUrlForMessage,
  };
}
