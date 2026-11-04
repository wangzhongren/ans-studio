// src/provider/download/abstract/download-consumer-epoch.ts
// G8 A 项目级下载启用 epoch —— 抽象契约（2026-11-04，download-requests B1；方案 §7.4）。
//
// 路径：`<projectRoot>/.ans/state/download-consumer.json`；形状 `{version:1, enabledAt, appVersion}`。
// 缺失由 `download-request.ts` 的 `ready()`/`consumerEpoch()` 首次创建；**不可读/非法 ⇒ unreadable
// 且不重写**（避免重置门槛）。`read()` 只读、不创建（指令面板投影使用）。
// app 私有运行数据，不是仓库候选、不是治理批准依据。

export const DOWNLOAD_CONSUMER_STATE_REL = ".ans/state/download-consumer.json";
export const DOWNLOAD_CONSUMER_STATE_VERSION = 1;

export type DownloadConsumerEpochState =
  | { state: "ready"; enabledAt: string; appVersion: string }
  | { state: "missing" }
  | { state: "unreadable"; reason: string };

export interface DownloadConsumerEpochStore {
  /** 缺失创建（`open("wx")` + fsync）；不可读不重写；成功 ⇒ ready。 */
  ensure(appVersion: string): Promise<DownloadConsumerEpochState>;
  /** 只读：missing / ready / unreadable。 */
  read(): Promise<DownloadConsumerEpochState>;
}
