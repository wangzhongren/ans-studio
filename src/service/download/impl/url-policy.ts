// src/service/download/impl/url-policy.ts
// 下载 Service —— URL 解析/主机归一化/同域判定（2026-11-04，download-requests B1；方案 §5.2/§5.3）。
//
// 仅 http/https、拒绝 userinfo、端口 1–65535、URL ≤2048B；host 小写/去尾点/punycode
// （WHATWG URL 已做 punycode），IPv6 去括号。同域 = 归一 host 相等（端口不参与）；
// `https→http` 降级不算同域安全跳转。

import { isIP } from "node:net";

import { DOWNLOAD_URL_MAX_BYTES } from "../../../model/download.ts";
import type {
  NormalizedUrl,
  RedirectDecision,
  UrlCheckResult,
} from "../abstract/download-policy.ts";

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host.replace(/\.+$/g, "");
}

function sanitizeUrlText(raw: string): string {
  let text = raw;
  try {
    const parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    text = parsed.href;
  } catch {
    text = raw.replace(/\/\/[^/@\s]+@/g, "//");
  }
  return truncateUtf8(text, DOWNLOAD_URL_MAX_BYTES);
}

/** URL 形状/协议/凭据/端口校验与主机归一化。 */
export function checkUrl(raw: string): UrlCheckResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "download-unsafe-url", reason: "URL 必须是字符串" };
  }
  const text = raw.trim();
  if (text === "") {
    return { ok: false, code: "download-unsafe-url", reason: "URL 不能为空" };
  }
  if (byteLength(text) > DOWNLOAD_URL_MAX_BYTES) {
    return { ok: false, code: "download-unsafe-url", reason: `URL 超过 ${DOWNLOAD_URL_MAX_BYTES} 字节` };
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, code: "download-unsafe-url", reason: "URL 不能被解析" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, code: "download-unsafe-url", reason: "只允许 http/https 协议" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, code: "download-unsafe-url", reason: "URL 不得包含 userinfo（user:pass@）" };
  }
  const host = normalizeHostname(parsed.hostname);
  if (host === "") {
    return { ok: false, code: "download-unsafe-url", reason: "URL 主机不能为空" };
  }
  const hostIpVersion = isIP(host);
  if (hostIpVersion === 0 && host.length > 253) {
    return { ok: false, code: "download-unsafe-url", reason: "主机名超过 253 字符" };
  }
  let port: number | undefined;
  if (parsed.port !== "") {
    const parsedPort = Number(parsed.port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { ok: false, code: "download-unsafe-url", reason: "端口必须在 1–65535" };
    }
    port = parsedPort;
  }
  const scheme = parsed.protocol === "https:" ? "https" : "http";
  const hostForUrl = hostIpVersion === 6 ? `[${host}]` : host;
  const url = `${scheme}://${hostForUrl}${port !== undefined ? `:${port}` : ""}${parsed.pathname}${parsed.search}`;
  if (byteLength(url) > DOWNLOAD_URL_MAX_BYTES) {
    return { ok: false, code: "download-unsafe-url", reason: `归一化 URL 超过 ${DOWNLOAD_URL_MAX_BYTES} 字节` };
  }
  return {
    ok: true,
    url: {
      url,
      scheme,
      host,
      ...(port !== undefined ? { port } : {}),
      ...(hostIpVersion === 0 ? { hostForTls: host } : {}),
    },
  };
}

/** 重定向同域判定：先判 `https→http` 降级，再比较归一 host（端口不参与）。 */
export function isSameHostForRedirect(from: NormalizedUrl, to: NormalizedUrl): RedirectDecision {
  if (from.scheme === "https" && to.scheme === "http") return { kind: "scheme-downgrade" };
  return from.host === to.host ? { kind: "same" } : { kind: "cross-host" };
}

/** 错误消息/审计用 URL：去 userinfo/fragment、限长。 */
export function sanitizeUrlForMessage(raw: string): string {
  return sanitizeUrlText(raw);
}
