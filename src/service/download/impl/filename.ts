// src/service/download/impl/filename.ts
// 下载 Service —— 文件名解析与净化（2026-11-04，download-requests B1；方案 §6.2）。
//
// 两阶段（F9）：卡片阶段只允许 URL basename → caller → 兜底；执行阶段 Content-Disposition
// 优先（filename* 优先于 filename），其次 URL basename → caller → 兜底。
// 本文件纯函数；最终只产出**单个文件名**（无目录段），净化失败由调用方兜底。

import type {
  DownloadCardFilenameSource,
  DownloadExecutionFilenameSource,
  NormalizedUrl,
} from "../abstract/download-policy.ts";
import {
  DOWNLOAD_FILENAME_MAX_BYTES,
  DOWNLOAD_FILENAME_MAX_CHARS,
} from "../../../model/download.ts";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const ILLEGAL_NAME_CHARS = /[/\\<>:"|?*]/g;
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function usableName(name: string): boolean {
  return name !== "" && !/^_+$/.test(name);
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 兜底名：`download-<yyyyMMdd-HHmmss>`（UTC，稳定可测）。 */
export function fallbackFilename(now: Date = new Date()): string {
  return (
    `download-${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `-${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`
  );
}

function truncateToLimits(name: string): string {
  if (codePointLength(name) <= DOWNLOAD_FILENAME_MAX_CHARS && byteLength(name) <= DOWNLOAD_FILENAME_MAX_BYTES) {
    return name;
  }
  const lastDot = name.lastIndexOf(".");
  const hasExtension = lastDot > 0 && name.length - lastDot - 1 <= 16 && name.length - lastDot - 1 > 0;
  const extension = hasExtension ? name.slice(lastDot) : "";
  let stem = hasExtension ? name.slice(0, lastDot) : name;
  const maxBytes = Math.max(0, DOWNLOAD_FILENAME_MAX_BYTES - byteLength(extension));
  const maxChars = Math.max(0, DOWNLOAD_FILENAME_MAX_CHARS - codePointLength(extension));
  let points = Array.from(stem);
  if (points.length > maxChars) points = points.slice(0, maxChars);
  stem = points.join("");
  while (stem !== "" && byteLength(stem) > maxBytes) {
    points = Array.from(stem);
    points.pop();
    stem = points.join("");
  }
  stem = stem.replace(/[ .]+$/g, "");
  return `${stem}${extension}`;
}

/**
 * 文件名净化（方案 §6.2；逐条）：
 * NFC → 去控制字符 → 路径分隔符/Windows 非法字符替换 `_` → 去首尾空白与尾部点/空格 →
 * 去前导点 → Windows 保留设备名加 `_` → UTF-8 ≤200B 且 ≤128 码点（保留 ≤16 字符扩展名）。
 * 返回可能为空（调用方用兜底名）；**绝不产生目录段**。
 */
export function sanitizeFilename(raw: string): { name: string } {
  if (typeof raw !== "string") return { name: "" };
  let name = raw.normalize("NFC").replace(CONTROL_CHARS, "").replace(ILLEGAL_NAME_CHARS, "_");
  name = name.trim().replace(/[ .]+$/g, "").replace(/^\.+/g, "");
  if (name === "") return { name: "" };
  const firstDot = name.indexOf(".");
  const stem = firstDot === -1 ? name : name.slice(0, firstDot);
  if (RESERVED_DEVICE.test(stem)) name = `_${name}`;
  name = truncateToLimits(name).replace(/[ .]+$/g, "");
  return { name };
}

function urlBasename(url: NormalizedUrl): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url.url).pathname;
  } catch {
    return undefined;
  }
  const rawLast = pathname.split("/").pop() ?? "";
  let last = rawLast;
  try {
    last = decodeURIComponent(rawLast);
  } catch {
    last = rawLast;
  }
  if (last === "" || last === "/") return undefined;
  const cleaned = sanitizeFilename(last).name;
  return usableName(cleaned) ? cleaned : undefined;
}

/**
 * 解析 `Content-Disposition`：`filename*`（RFC 5987）优先于 `filename`；
 * 解析/解码失败视为该项缺失（继续尝试 `filename`）。
 */
export function filenameFromContentDisposition(header: string | undefined): string | undefined {
  if (typeof header !== "string" || header.trim() === "") return undefined;
  const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (star !== null) {
    const raw = star[1]!.trim();
    const rfc5987 = /^[^']*'[^']*'(.*)$/.exec(raw);
    const encoded = rfc5987 !== null ? rfc5987[1]! : raw;
    try {
      const decoded = decodeURIComponent(encoded);
      if (decoded !== "") return decoded;
    } catch {
      // 视为该项缺失，继续尝试 filename=。
    }
  }
  const plain = /filename\s*=\s*("((?:\\.|[^"])*)"|([^;]+))/i.exec(header);
  if (plain !== null) {
    const quoted = plain[2];
    const raw = quoted !== undefined ? quoted.replace(/\\"/g, '"') : (plain[3] ?? "").trim();
    if (raw !== "") return raw;
  }
  return undefined;
}

export function pickCardFilename(input: {
  url: NormalizedUrl;
  callerSuggestion?: string;
  now?: Date;
}): { name: string; source: DownloadCardFilenameSource } {
  const fromUrl = urlBasename(input.url);
  if (fromUrl !== undefined) return { name: fromUrl, source: "url-basename" };
  if (typeof input.callerSuggestion === "string" && input.callerSuggestion.trim() !== "") {
    const fromCaller = sanitizeFilename(input.callerSuggestion).name;
    if (usableName(fromCaller)) return { name: fromCaller, source: "caller" };
  }
  return { name: fallbackFilename(input.now), source: "fallback" };
}

export function pickExecutionFilename(input: {
  contentDisposition?: string;
  url: NormalizedUrl;
  callerSuggestion?: string;
  now?: Date;
}): { name: string; source: DownloadExecutionFilenameSource } {
  const fromHeader = filenameFromContentDisposition(input.contentDisposition);
  if (fromHeader !== undefined) {
    const cleaned = sanitizeFilename(fromHeader).name;
    if (usableName(cleaned)) return { name: cleaned, source: "content-disposition" };
  }
  return pickCardFilename({
    url: input.url,
    ...(input.callerSuggestion !== undefined ? { callerSuggestion: input.callerSuggestion } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}
