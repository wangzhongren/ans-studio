// app/desktop/session/contracts/persistence.ts
// B1（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md §5 B1）：
// 持久化面共享契约（L0）。声明体自 app/desktop/session.ts **逐字搬移**（仅 import/导出适配）。
// 依赖规则（结构测试 R-b/R-c）：contracts 只可依赖 src/model 与基础类型，不得导入 shared/feature。

import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimePersistenceChangeV1 } from "../../../../src/model/runtime.ts";

export type PersistenceScope = { projectRoot: string; roleId: string; runtime: RuntimeKind };
export type PersistenceReply<T> = { ok: true; version: 1; scope: PersistenceScope; value: T } | { ok: false; version: 1; scope?: PersistenceScope; code: 'INVALID_REQUEST' | 'PROJECT_NOT_ACTIVE' | 'SESSION_NOT_AVAILABLE' | 'SNAPSHOT_EXPIRED' | 'UNSUPPORTED'; message: string };
export type PersistenceCapabilities = { mode: 'enabled' | 'disabled' | 'unknown-live'; reportSaveSupported: boolean; deliveryHistorySaveSupported: boolean; querySupported: boolean };
export interface PersistenceValues { retryReportSave: ReportSaveResultV1; getReportSaveState: ReportSaveStateV1; retryDeliveryHistorySave: DeliverySaveResultV1; getDeliveryReceipt: DeliveryReceiptQueryV1; getSessionPersistence: PersistenceCapabilities }
export type PersistenceUpdated = { version: 1; scope: PersistenceScope; change: RuntimePersistenceChangeV1 };
