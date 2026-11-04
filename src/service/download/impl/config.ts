// src/service/download/impl/config.ts
// 下载 Service —— 上限/超时配置解析（2026-11-04，download-requests B1；方案 §5.4/G2 A）。
//
// 只有部署方环境变量可调；模型/申请方没有任何入口。非法/非正值回退默认并返回诊断码
// （不 throw、不改变执行）。`maxRedirects=5`、每项目执行并发 2 为固定常量。

import {
  DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_MAX_BYTES,
  DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS,
} from "../../../model/download.ts";
import type { DownloadConfig } from "../abstract/download-policy.ts";

export const DOWNLOAD_ENV_MAX_BYTES = "ANS_DOWNLOAD_MAX_BYTES";
export const DOWNLOAD_ENV_CONNECT_TIMEOUT_MS = "ANS_DOWNLOAD_CONNECT_TIMEOUT_MS";
export const DOWNLOAD_ENV_IDLE_TIMEOUT_MS = "ANS_DOWNLOAD_IDLE_TIMEOUT_MS";
export const DOWNLOAD_ENV_TOTAL_TIMEOUT_MS = "ANS_DOWNLOAD_TOTAL_TIMEOUT_MS";

export const DOWNLOAD_MAX_REDIRECTS = 5;
export const DOWNLOAD_EXECUTABLE_CONCURRENCY = 2;

function positiveInteger(value: string | undefined, fallback: number, name: string, diagnostics: string[]): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^[1-9][0-9]*$/.test(value.trim())) {
    diagnostics.push(`${name}:invalid`);
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    diagnostics.push(`${name}:invalid`);
    return fallback;
  }
  return parsed;
}

/** 解析部署方 env；缺省值来自 A1 Model 常量（单一来源）。 */
export function resolveDownloadConfig(env: NodeJS.ProcessEnv = process.env): {
  config: DownloadConfig;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const maxBytes = positiveInteger(env[DOWNLOAD_ENV_MAX_BYTES], DOWNLOAD_DEFAULT_MAX_BYTES, DOWNLOAD_ENV_MAX_BYTES, diagnostics);
  const connectTimeoutMs = positiveInteger(
    env[DOWNLOAD_ENV_CONNECT_TIMEOUT_MS],
    DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS,
    DOWNLOAD_ENV_CONNECT_TIMEOUT_MS,
    diagnostics,
  );
  const idleTimeoutMs = positiveInteger(
    env[DOWNLOAD_ENV_IDLE_TIMEOUT_MS],
    DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS,
    DOWNLOAD_ENV_IDLE_TIMEOUT_MS,
    diagnostics,
  );
  const totalTimeoutMs = positiveInteger(
    env[DOWNLOAD_ENV_TOTAL_TIMEOUT_MS],
    DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS,
    DOWNLOAD_ENV_TOTAL_TIMEOUT_MS,
    diagnostics,
  );
  return {
    config: {
      maxBytes,
      connectTimeoutMs,
      idleTimeoutMs,
      totalTimeoutMs,
      maxRedirects: DOWNLOAD_MAX_REDIRECTS,
      executableConcurrency: DOWNLOAD_EXECUTABLE_CONCURRENCY,
    },
    diagnostics,
  };
}
