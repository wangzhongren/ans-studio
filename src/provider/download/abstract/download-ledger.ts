// src/provider/download/abstract/download-ledger.ts
// app 私有下载账本 —— 抽象契约与事件形状（2026-11-04，download-requests B1；方案 §8.2，复核 F9）。
//
// 路径：`<projectRoot>/.ans/state/downloads.jsonl`（append-only、可轮转、坏行容错）。
// 复用 `src/common/shared/jsonl-ledger.ts` 的追加/轮转/读取；本模块只定义事件形状与接口。
// `downloadId` 所有路径都有；`requestId` **仅卡片路径**有；预授权路径 `by:"directive"` + `directiveId`。

export const DOWNLOAD_LEDGER_REL = ".ans/state/downloads.jsonl";

export interface DownloadLedgerJudgeInfo {
  engine: string;
  model?: string;
  reasonCode: string;
  durationMs?: number;
  readCalls?: number;
  readBytes?: number;
}

export type DownloadLedgerEventV1 =
  | {
      version: 1;
      kind: "download.requested";
      downloadId: string;
      requestId?: string;
      roleId: string;
      runtime?: string;
      url: string;
      host: string;
      scheme: "http" | "https";
      port?: number;
      filenameSuggestion?: string;
      purpose: string;
      maxBytes: number;
      at: string;
    }
  | {
      version: 1;
      kind: "download.decided";
      downloadId: string;
      requestId?: string;
      by: "customer" | "judge" | "directive";
      directiveId?: string;
      presented: boolean;
      judge?: DownloadLedgerJudgeInfo;
      at: string;
    }
  | {
      version: 1;
      kind: "download.started";
      attemptId: string;
      downloadId: string;
      finalUrl: string;
      filename: string;
      at: string;
    }
  | {
      version: 1;
      kind: "download.completed";
      attemptId: string;
      bytes: number;
      sha256: string;
      /** 项目相对路径 `download/<name>`。 */
      path: string;
      durationMs: number;
      contentType?: string;
      at: string;
    }
  | {
      version: 1;
      kind: "download.failed";
      attemptId: string;
      code: string;
      httpStatus?: number;
      bytesWritten: number;
      detail?: string;
      at: string;
    };

export interface DownloadLedger {
  /** 追加一行；**不抛**（失败返回 `{ok:false}`，主路径继续）。 */
  append(event: DownloadLedgerEventV1): Promise<{ ok: boolean; message?: string }>;
  /** 旧→新读取；坏行/未知事件计数。 */
  read(): Promise<{ events: DownloadLedgerEventV1[]; errors: number; files: string[] }>;
}
