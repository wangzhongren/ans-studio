// src/provider/trunk/abstract/trunk-store.ts
// trunk 存储 Provider 抽象契约（2026-11-04 trunk-amendment-model B-3 / S1）。
//
// 归属：编排（`src/provider/trunk/` 模块私有根，B-2/B-3 既有条目）。职责：**纯存储**——
// `.ans/trunk/{manifest,amendment,apply-journal}.json` 与 `history/` 的原子读写、坏件判别、
// history 归档；**不判断冻结/状态、不发事件、不改指针、不重建/覆盖坏件**（判定归 S2
// `src/service/trunk/` 与 S4）。
//
// 形状单一来源（C1 冻结）：`TrunkManifest`/`TrunkAmendmentState`/`TrunkApplyJournal` 从
// `src/model/trunk.ts` type-import，本文件不复制记录形状，只定义读写结果判别与相对路径常量。
// 依赖方向：Model → Provider；Provider 不 import Service/Pipeline/Interface。
//
// 判别语义（P1 §2.1/§3.1/§4.5）：
// · 读：`missing`（文件不存在）/`corrupt`（JSON 非法或结构不合法）/`io`（其它读失败）；
//   一律 `ok:false` 返回，**不自动重建、不自动覆盖**；
// · 写：原子（同目录临时文件 + fsync + rename，复用 `src/common/shared/atomic-write.ts`
//   的 Windows EPERM 有界重试）+ 每文件进程内串行链；
// · history：`history/manifest-v<N>.json` 归档；同版本同内容幂等、不同内容拒绝（不可变）。

import type {
  TrunkAmendmentState,
  TrunkApplyJournal,
  TrunkManifest,
} from "../../../model/trunk.ts";

/** 当前主干 manifest 相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_MANIFEST_REL = ".ans/trunk/manifest.json";
/** 进行中修正案状态相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_AMENDMENT_REL = ".ans/trunk/amendment.json";
/** 跨文件提交日志相对路径（`.ans/trunk/`，app-only）。 */
export const TRUNK_JOURNAL_REL = ".ans/trunk/apply-journal.json";
/** history 归档目录（`.ans/trunk/history/`，app-only）。 */
export const TRUNK_HISTORY_DIR = ".ans/trunk/history/";

/** 读失败原因：缺失 / 坏件 / 其它 I/O。 */
export type StoreReadFailureReason = "missing" | "corrupt" | "io";

export interface StoreReadFailure {
  ok: false;
  reason: StoreReadFailureReason;
  message?: string;
}

/** 判别式读结果：`ok:false` 时调用方决定迁移/恢复，Provider 不自行处理。 */
export type StoreRead<T> = { ok: true; value: T } | StoreReadFailure;

/** 写失败：`invalid` = 待写对象结构不合法；`io` = 落盘失败（原子写失败不改目标）。 */
export type StoreWriteFailureCode = "invalid" | "io";

export interface StoreWriteFailure {
  ok: false;
  code: StoreWriteFailureCode;
  message?: string;
}

export type StoreWrite = { ok: true } | StoreWriteFailure;

/** Provider 错误判别形状（读/写两族；不抛出业务码，不映射 C1 `TrunkErrorCode`）。 */
export type TrunkStoreError = StoreReadFailure | StoreWriteFailure;

/**
 * trunk 存储接口（S2 `TrunkService`/S4 `trunk-runtime` 消费；测试可注入替身）。
 * 全部方法以**项目相对路径常量**定位，不接受任意路径；`projectRoot` 在工厂期绑定。
 */
export interface TrunkStore {
  readManifest(): Promise<StoreRead<TrunkManifest>>;
  writeManifest(manifest: TrunkManifest): Promise<StoreWrite>;
  readAmendment(): Promise<StoreRead<TrunkAmendmentState>>;
  writeAmendment(amendment: TrunkAmendmentState): Promise<StoreWrite>;
  readJournal(): Promise<StoreRead<TrunkApplyJournal>>;
  writeJournal(journal: TrunkApplyJournal): Promise<StoreWrite>;
  /** 归档某一主干版本（`history/manifest-v<N>.json`）；同版本同内容幂等。 */
  archiveHistory(version: number, manifest: TrunkManifest): Promise<StoreWrite>;
  /** 已归档版本号（升序）；坏件跳过，可用 `onDiagnostic` 收集诊断。 */
  listHistory(options?: { onDiagnostic?: (message: string) => void }): Promise<number[]>;
}
