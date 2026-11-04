// src/provider/download/impl/node-resolver.ts
// 下载 Provider —— Node DNS 全量解析（2026-11-04，download-requests B1）。
//
// `dns.promises.lookup(host,{all:true,verbatim:true})` 返回 IPv4+IPv6 **全部**地址（去重保序）；
// 任一结果都交给 Pipeline/Service 的公网判表与执行钉扎。解析失败/超时 ⇒ 稳定
// `download-dns-failed`（本函数不抛业务文本；detail 只含稳定原因，不含 URL）。
// IP 字面量直返（交给同一判表；十进制整数等非标准写法由 WHATWG URL 先归一）。

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { DownloadProviderError, type HostResolver, type PinnedAddress, type ResolvedHost } from "../abstract/download-provider.ts";

/** DNS 解析内部超时（固定 10s；不属 G2 的部署方旋钮）。 */
export const DOWNLOAD_DNS_TIMEOUT_MS = 10_000;

function resolveOrThrow(
  host: string,
  signal: AbortSignal | undefined,
): Promise<{ address: string; family: number }[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = (): void => finish(() => reject(new DownloadProviderError("download-aborted", "DNS 解析被中止")));
    const timer = setTimeout(
      () => finish(() => reject(new DownloadProviderError("download-dns-failed", "DNS 解析超时"))),
      DOWNLOAD_DNS_TIMEOUT_MS,
    );
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    lookup(host, { all: true, verbatim: true }).then(
      (entries) => finish(() => resolve(entries)),
      (error: unknown) => {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        finish(() =>
          reject(
            new DownloadProviderError(
              "download-dns-failed",
              typeof code === "string" ? code : "lookup failed",
            ),
          ),
        );
      },
    );
  });
}

/** 生产工厂：真实系统 DNS；无 resolver 覆盖缝（测试用假 HostResolver 注入 Pipeline 测试工厂）。 */
export function createNodeHostResolver(): HostResolver {
  return {
    async resolve(host: string, opts?: { signal?: AbortSignal }): Promise<ResolvedHost> {
      const value = typeof host === "string" ? host.trim() : "";
      if (value === "") throw new DownloadProviderError("download-dns-failed", "empty host");
      const literal = isIP(value);
      if (literal === 4 || literal === 6) {
        return { addresses: [{ address: value, family: literal }] };
      }
      const entries = await resolveOrThrow(value, opts?.signal);
      const seen = new Set<string>();
      const addresses: PinnedAddress[] = [];
      for (const entry of entries) {
        if (entry.family !== 4 && entry.family !== 6) continue;
        const key = `${entry.family}:${entry.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push({ address: entry.address, family: entry.family });
      }
      if (addresses.length === 0) {
        throw new DownloadProviderError("download-dns-failed", "DNS 解析结果为空");
      }
      return { addresses };
    },
  };
}
