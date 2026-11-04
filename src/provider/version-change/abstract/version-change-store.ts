// src/provider/version-change/abstract/version-change-store.ts
// 版本变更申请（VCA）/ 重构申请 / stable-write 记录与一次性许可的存储 Provider 抽象契约
// （2026-11-04 trunk-amendment-model B-6 / S1）。
//
// 归属：编排（`src/provider/version-change/` 模块私有根，B-6）。职责：**纯存储**——
// `.ans/state/` 下 JSON 记录文件的原子写、坏件判别、进程内串行链；**不做状态判定、
// 不发事件、不写项目文档、不写 R9 `versions.jsonl`**（判定归 C2c Service，R9 写入经 C2b）。
//
// 与 C2c 冻结 Port 对齐（P1 §3.2/§3.4；形状单一来源 = C1 `src/model/version-change.ts`）：
// · `VersionChangeStore` ↔ `VersionChangeRepositoryPort`（list/findById/findByFlow/insert/
//   updateWithExpectedStatus）；
// · `StableWriteStore` ↔ `StableWriteRepositoryPort`；
// · `StableWritePermitStore` ↔ `StablePermitPort`（list/upsert/installSnapshot）。
// 结构化兼容由 `test/编排/version-change-store.test.ts` 的类型断言固定；本文件**不 import
// Service**（依赖方向 Provider ← Service）。
//
// F13：`StableWriteRecord` 与 `StableWritePermit` **分表存储**（两个文件），record 只以
// `permitId` 关联 permit，不内嵌、不出现第三形状（C1 唯一 permit 形状）。
//
// 坏件语义：读 `missing`（文件不存在 ≡ 空集合）/`corrupt`（JSON 非法或结构不合法）/
// `io`；`list()` 在 corrupt/io 时**抛错**（不静默当空，防止丢记录/ID 复用），
// `insert`/`updateWithExpectedStatus` 返回 `{ok:false, code:"io"}` 且不改文件。
// 未知字段保留（记录按对象原样读回/写回；更新时以现有记录为基底合并）。

import type {
  RefactorRequestRecord,
  RefactorRequestStatus,
  StableWritePermit,
  StableWriteRecord,
  StableWriteStatus,
  VersionChangeRecord,
  VersionChangeStatus,
} from "../../../model/version-change.ts";

/** VCA 记录文件（`.ans/state/`，app-only）。 */
export const VERSION_CHANGES_REL = ".ans/state/version-changes.json";
/** 重构申请记录文件（`.ans/state/`，app-only）。 */
export const REFACTOR_REQUESTS_REL = ".ans/state/refactor-requests.json";
/** stable-write 记录文件（`.ans/state/`，app-only；不含 permit，F13 分表）。 */
export const STABLE_WRITES_REL = ".ans/state/stable-writes.json";
/** stable-write 一次性许可文件（`.ans/state/`，app-only；C1 `StableWritePermit[]`）。 */
export const STABLE_WRITE_PERMITS_REL = ".ans/state/stable-write-permits.json";

/** 记录文件读结果（与 trunk Provider 同族判别；`missing` ≡ 空集合）。 */
export type JsonRecordReadFailureReason = "missing" | "corrupt" | "io";

export type JsonRecordRead<T> =
  | { ok: true; value: T }
  | { ok: false; reason: JsonRecordReadFailureReason; message?: string };

/**
 * 记录写结果：与 C2c `PortWriteResult` **结构一致**（`conflict` = 乐观并发/唯一键冲突；
 * `io` = 落盘失败或待写记录结构不合法，`message` 区分）。原子写失败不改目标文件。
 */
export type RepositoryWriteResult =
  | { ok: true }
  | { ok: false; code: "conflict" | "io"; message?: string };

/** VCA 记录存储（C2c `VersionChangeRepositoryPort` 的 Provider 实现形状）。 */
export interface VersionChangeStore {
  list(): Promise<VersionChangeRecord[]>;
  findById(applicationId: string): Promise<VersionChangeRecord | undefined>;
  findByFlow(flowId: string): Promise<VersionChangeRecord[]>;
  insert(record: VersionChangeRecord): Promise<RepositoryWriteResult>;
  /** 乐观并发：仅当现有记录 `status === expected` 时以 `record` 更新（按 `applicationId`）。 */
  updateWithExpectedStatus(
    record: VersionChangeRecord,
    expected: VersionChangeStatus,
  ): Promise<RepositoryWriteResult>;
  /** 诊断/测试用：区分 missing/corrupt；不静默清空。 */
  readRaw(): Promise<JsonRecordRead<VersionChangeRecord[]>>;
}

/** 重构申请记录存储（S4 `refactor-runtime` 消费；无客户决定记录）。 */
export interface RefactorRequestStore {
  list(): Promise<RefactorRequestRecord[]>;
  findById(requestId: string): Promise<RefactorRequestRecord | undefined>;
  findByFlow(flowId: string): Promise<RefactorRequestRecord[]>;
  insert(record: RefactorRequestRecord): Promise<RepositoryWriteResult>;
  updateWithExpectedStatus(
    record: RefactorRequestRecord,
    expected: RefactorRequestStatus,
  ): Promise<RepositoryWriteResult>;
  readRaw(): Promise<JsonRecordRead<RefactorRequestRecord[]>>;
}

/** stable-write 记录存储（C2c `StableWriteRepositoryPort` 的 Provider 实现形状）。 */
export interface StableWriteStore {
  list(): Promise<StableWriteRecord[]>;
  findById(requestId: string): Promise<StableWriteRecord | undefined>;
  insert(record: StableWriteRecord): Promise<RepositoryWriteResult>;
  updateWithExpectedStatus(
    record: StableWriteRecord,
    expected: StableWriteStatus,
  ): Promise<RepositoryWriteResult>;
  readRaw(): Promise<JsonRecordRead<StableWriteRecord[]>>;
}

/**
 * 一次性许可存储（C2c `StablePermitPort` 的 Provider 实现形状；F13 与 record 分表）。
 * `installSnapshot` 只调用 C2b `installStableWritePermitSnapshot`（同步许可快照唯一实现，
 * 编排不自建第二份 Map）；Provider 不实现判定。
 */
export interface StableWritePermitStore {
  list(): Promise<StableWritePermit[]>;
  upsert(permit: StableWritePermit): Promise<RepositoryWriteResult>;
  installSnapshot(permits: readonly StableWritePermit[]): Promise<void>;
  readRaw(): Promise<JsonRecordRead<StableWritePermit[]>>;
}
