// 下载申请共享 Model 契约（download-request/v1，2026-11-04 A1 冻结）。
//
// 依赖方向：只允许 `import type { RuntimeKind } from "../common/shared/runtime-shared.ts"`
// （与 `runtime.ts` 同一单一来源）；**不** import `./runtime.ts`，避免 type-only 双向循环
// （`runtime.ts` 单向 type-import 本文件）。本层无 I/O、无运行层依赖；不执行判定、不读写账本。
//
// 形状依据：方案 P1.1 §3.3（工具契约）/§4.1（judge facts）/§5.4（默认上限/超时）/§6.2（文件名上限）；
// 错误码是机器值，不是用户文案（用户可见文案/i18n 归 A2 与各消费方）。

import type { RuntimeKind } from "../common/shared/runtime-shared.ts";

/** 下载申请契约标识（冻结）。 */
export const DOWNLOAD_REQUEST_SCHEMA = "download-request/v1";

/** 单次下载默认字节上限（100 MB；G2 A：仅部署方环境变量可调，模型/申请方不可改）。 */
export const DOWNLOAD_DEFAULT_MAX_BYTES = 104_857_600;
/** `url` 参数 UTF-8 字节上限（工具层形状校验）。 */
export const DOWNLOAD_URL_MAX_BYTES = 2048;
/** `purpose` 参数 UTF-8 字节上限（工具层形状校验）。 */
export const DOWNLOAD_PURPOSE_MAX_BYTES = 1024;
/** 文件名 Unicode 码点上限（工具层形状校验；§6.2 的 128 字符）。 */
export const DOWNLOAD_FILENAME_MAX_CHARS = 128;
/** 文件名整名 UTF-8 字节上限（B1 净化消费；§6.2）。 */
export const DOWNLOAD_FILENAME_MAX_BYTES = 200;
/** `request.download` 序列化上限（≤2 KiB；独立于 `GovernanceJudgeFacts` 的 8 KiB）。 */
export const DOWNLOAD_JUDGE_FACTS_MAX_BYTES = 2048;
/** 默认连接超时（毫秒；§5.4；部署方 env 可调）。 */
export const DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
/** 默认空闲超时（毫秒；§5.4；部署方 env 可调）。 */
export const DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS = 30_000;
/** 默认总超时（毫秒；§5.4；部署方 env 可调）。 */
export const DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS = 300_000;

/**
 * 下载失败稳定错误码（§3.3；全部 `download-` 前缀）。
 * B1 的 `mechanical-rejection.ts` `RULES` 必须由 `DOWNLOAD_ERROR_CODES` 派生/对照，
 * 不复制第二份字面量。
 */
export type DownloadErrorCode =
  | "download-invalid-arguments"
  | "download-unsafe-url"
  | "download-dns-failed"
  | "download-denied-by-directive"
  | "download-declined"
  | "download-unavailable"
  | "download-facts-missing"
  | "download-rebinding-detected"
  | "download-redirect-cross-host"
  | "download-http-error"
  | "download-too-large"
  | "download-unsupported-encoding"
  | "download-timeout"
  | "download-network-error"
  | "download-write-failed"
  | "download-busy"
  | "download-aborted";

/** 全部错误码（冻结顺序；运行时白名单/测试唯一来源）。 */
export const DOWNLOAD_ERROR_CODES: readonly DownloadErrorCode[] = Object.freeze([
  "download-invalid-arguments",
  "download-unsafe-url",
  "download-dns-failed",
  "download-denied-by-directive",
  "download-declined",
  "download-unavailable",
  "download-facts-missing",
  "download-rebinding-detected",
  "download-redirect-cross-host",
  "download-http-error",
  "download-too-large",
  "download-unsupported-encoding",
  "download-timeout",
  "download-network-error",
  "download-write-failed",
  "download-busy",
  "download-aborted",
]);

/** `request_download` 工具参数（工具层已做形状校验；能力侧只按本形状消费）。 */
export interface DownloadRequestInput {
  url: string;
  /** 可选文件名建议；可能被 Content-Disposition/URL basename 覆盖。 */
  filename?: string;
  purpose: string;
}

/**
 * 工具层转交能力的请求上下文（不含 projectRoot/目录：下载根由注入能力的闭包绑定，
 * **模型与工具参数都不能指定根/子目录**）。
 */
export interface DownloadRequestMetadata {
  signal?: AbortSignal;
  roleId?: string;
  runtime?: RuntimeKind;
  turnId?: string;
  toolCallId?: string;
}

/** 成功结果的审批来源（归属如实：客户/判断 agent/审批指令）。 */
export type DownloadApprovalSource =
  | { by: "customer" }
  | { by: "judge"; engine: RuntimeKind; model?: string }
  | { by: "directive"; directiveId: string };

/**
 * `RequestDownloadFn` 的如实回执（判别联合）：
 * - 成功：`message` 为模型可读回执；`path` 恒为项目相对 `download/<单文件名>`；
 *   `sha256` 为最终文件 hex；`approval` 必填（归属如实）。
 * - 失败：`message` 含人话原因/下一步；`code` 必填且属于 `DOWNLOAD_ERROR_CODES`。
 * 工具层按本联合做运行时复核；契约外回执 fail-closed，**绝不伪装成功**。
 */
export type DownloadRequestResult =
  | {
      ok: true;
      message: string;
      path: string;
      bytes: number;
      sha256: string;
      finalUrl: string;
      approval: DownloadApprovalSource;
    }
  | { ok: false; message: string; code: DownloadErrorCode };

/** `request_download` 注入能力（注入才注册；未注入 ⇒ 工具不存在，结构性 fail-closed）。 */
export type RequestDownloadFn = (
  input: DownloadRequestInput,
  metadata?: DownloadRequestMetadata,
) => Promise<DownloadRequestResult> | DownloadRequestResult;

/**
 * 下载卡请求级判断事实（§4.1；应用计算、不可由模型自报）。
 * 仅当 `cardKind==="download"` 时放入 `GovernanceJudgeContext.download`，
 * 再由 `planJudge` 原样并入 `GovernanceJudgeRequest.download`（W-4/W-5）；
 * **不进入** `GovernanceJudgeFacts`（账本级）。
 */
export interface DownloadJudgeFacts {
  /** 归一化后的 URL（无 userinfo）；≤2048 字节。 */
  url: string;
  scheme: "http" | "https";
  /** punycode 小写、去尾点；≤253。 */
  host: string;
  /** 仅显式非默认端口；1–65535。 */
  port?: number;
  /** 本次解析出的 IP（展示上限 8；校验/钉扎作用于全部结果）。 */
  resolvedIps: string[];
  /** 解析结果总数（不受展示上限影响）。 */
  resolvedIpsTotal: number;
  /** 是否因展示上限被截断（只影响展示，不影响校验与钉扎）。 */
  resolvedIpsTruncated: boolean;
  /** 净化后的预期文件名（卡片阶段；≤128 字符）。 */
  filename: string;
  /** 卡片阶段文件名来源（执行阶段可被 Content-Disposition 覆盖，属 B1 自有类型）。 */
  filenameSource: "url-basename" | "caller" | "fallback";
  /** 用途原文；≤1024 字节。 */
  purpose: string;
  /** 上限（默认 104857600；模型不可改）。 */
  maxBytes: number;
  /** 确定性安全摘要；全为 true 才会发卡。 */
  mechanical: {
    schemeOk: boolean;
    credentialsAbsent: boolean;
    hostPublic: boolean;
    ipsPublic: boolean;
    filenameSafe: boolean;
  };
}
