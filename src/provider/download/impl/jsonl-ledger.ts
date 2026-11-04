// src/provider/download/impl/jsonl-ledger.ts
// 下载 Provider —— `downloads.jsonl` 文件账本（2026-11-04，download-requests B1）。
//
// 复用共享 `jsonl-ledger`（追加串行链/按大小轮转/旧→新读取/坏行计数），本文件只做
// 路径计算与事件形状校验。追加失败**不抛**（审计缺失不影响主路径）；读取跳过未知 kind。

import path from "node:path";

import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
  type JsonlLedgerLimits,
  type JsonlParseResult,
} from "../../../common/shared/jsonl-ledger.ts";
import {
  DOWNLOAD_LEDGER_REL,
  type DownloadLedger,
  type DownloadLedgerEventV1,
} from "../abstract/download-ledger.ts";

export interface DownloadLedgerOptions {
  /** 测试注入（缺省 5 MiB / 3 份）。 */
  maxBytes?: number;
  rotations?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSafeNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 路径：`<projectRoot>/.ans/state/downloads.jsonl`（相对路径常量单一来源）。 */
export function downloadLedgerPath(projectRoot: string): string {
  return path.join(projectRoot, ...DOWNLOAD_LEDGER_REL.split("/"));
}

function parseEvent(raw: string): JsonlParseResult<DownloadLedgerEventV1> {
  // 共享 helper 已先行 JSON.parse；这里再解析以获得对象。
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, message: `JSON 坏行：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!isRecord(parsed)) return { ok: false, message: "事件不是对象" };
  if (parsed["version"] !== 1) return { ok: false, message: "version 必须为 1" };
  const kind = parsed["kind"];
  if (typeof kind !== "string") return { ok: false, message: "事件缺 kind" };
  if (
    kind !== "download.requested" &&
    kind !== "download.decided" &&
    kind !== "download.started" &&
    kind !== "download.completed" &&
    kind !== "download.failed"
  ) {
    return { ok: "ignore" };
  }
  if (!isIso(parsed["at"])) return { ok: false, message: "at 非法" };
  switch (kind) {
    case "download.requested": {
      if (!isNonEmptyString(parsed["downloadId"])) return { ok: false, message: "downloadId 非法" };
      if (!isNonEmptyString(parsed["roleId"])) return { ok: false, message: "roleId 非法" };
      if (!isNonEmptyString(parsed["url"])) return { ok: false, message: "url 非法" };
      if (!isNonEmptyString(parsed["host"])) return { ok: false, message: "host 非法" };
      if (parsed["scheme"] !== "http" && parsed["scheme"] !== "https") return { ok: false, message: "scheme 非法" };
      if (!isNonEmptyString(parsed["purpose"])) return { ok: false, message: "purpose 非法" };
      if (!isSafeNonNegativeInt(parsed["maxBytes"])) return { ok: false, message: "maxBytes 非法" };
      return { ok: true, value: parsed as unknown as DownloadLedgerEventV1 };
    }
    case "download.decided": {
      if (!isNonEmptyString(parsed["downloadId"])) return { ok: false, message: "downloadId 非法" };
      if (parsed["by"] !== "customer" && parsed["by"] !== "judge" && parsed["by"] !== "directive") {
        return { ok: false, message: "by 非法" };
      }
      if (typeof parsed["presented"] !== "boolean") return { ok: false, message: "presented 非法" };
      return { ok: true, value: parsed as unknown as DownloadLedgerEventV1 };
    }
    case "download.started": {
      for (const key of ["attemptId", "downloadId", "finalUrl", "filename"]) {
        if (!isNonEmptyString(parsed[key])) return { ok: false, message: `${key} 非法` };
      }
      return { ok: true, value: parsed as unknown as DownloadLedgerEventV1 };
    }
    case "download.completed": {
      for (const key of ["attemptId", "sha256", "path"]) {
        if (!isNonEmptyString(parsed[key])) return { ok: false, message: `${key} 非法` };
      }
      if (!isSafeNonNegativeInt(parsed["bytes"])) return { ok: false, message: "bytes 非法" };
      if (!isSafeNonNegativeInt(parsed["durationMs"])) return { ok: false, message: "durationMs 非法" };
      return { ok: true, value: parsed as unknown as DownloadLedgerEventV1 };
    }
    default: {
      if (!isNonEmptyString(parsed["attemptId"])) return { ok: false, message: "attemptId 非法" };
      if (!isNonEmptyString(parsed["code"])) return { ok: false, message: "code 非法" };
      if (!isSafeNonNegativeInt(parsed["bytesWritten"])) return { ok: false, message: "bytesWritten 非法" };
      return { ok: true, value: parsed as unknown as DownloadLedgerEventV1 };
    }
  }
}

/** 生产工厂：文件账本（append 不抛；read 坏行容错）。 */
export function createDownloadLedger(projectRoot: string, options: DownloadLedgerOptions = {}): DownloadLedger {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("下载账本：projectRoot 必须是非空字符串");
  }
  const file = downloadLedgerPath(projectRoot);
  const limits: JsonlLedgerLimits = {
    maxBytes: options.maxBytes ?? DEFAULT_JSONL_MAX_BYTES,
    rotations: options.rotations ?? DEFAULT_JSONL_ROTATIONS,
  };
  return {
    async append(event: DownloadLedgerEventV1): Promise<{ ok: boolean; message?: string }> {
      let line: string;
      try {
        line = JSON.stringify(event);
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "serialize failed" };
      }
      const result = await appendJsonlLine(file, line, limits);
      return result.ok ? { ok: true } : { ok: false, ...(result.message !== undefined ? { message: result.message } : {}) };
    },
    async read(): Promise<{ events: DownloadLedgerEventV1[]; errors: number; files: string[] }> {
      const result = await readJsonlLedger<DownloadLedgerEventV1>(file, parseEvent, limits);
      return { events: result.values, errors: result.errors.length, files: result.files };
    },
  };
}
