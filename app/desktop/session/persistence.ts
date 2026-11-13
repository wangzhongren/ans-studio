// app/desktop/session/persistence.ts
// B2（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §5 B2、附录 A persistence 组）：报告/投递持久化状态与回执操作（L1，feature 白名单 []）。
// 6 个类方法（persistenceScope/persistenceKey/mergeReportState/rememberReceipt/
// registerPersistenceHistory/persistenceOperation）自 app/desktop/session.ts **逐字搬移**：方法体零改动；
// 类外壳重建原 receiver 面：
//  · 五个实例状态（reportStates/attemptStates/knownReports/knownAttempts/persistenceInFlight）与 `sessions`
//    按方案 §3.6 **暂留门面**，经 `PersistenceState` 显式传入（同一 Map/Set 实例引用；B1 同款口径）；
//  · `handleHandback`/`handbackFlowId`（B2 尚未迁出的门面方法）经 `PersistenceHandbackPort` 回调注入，
//    参数原样转发；
//  · `persistenceScope`/`persistenceKey`/`mergeReportState`/`rememberReceipt`/`sessionKey` 保持同名成员。
// 可见性 `private` → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L1 feature 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import type { PersistenceScope, PersistenceReply, PersistenceValues } from "./contracts/persistence.ts";
import type { LiveSession } from "./contracts/session-types.ts";
import type { ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1 } from "../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { HandbackEvent, TaskHandback } from "../../../src/common/编排/handback.ts";
import { mainT } from "../i18n.ts";
import { sessionKey } from "./shared/keys.ts";

/** persistence 方法读取的实例状态（方案 §3.6 归属 persistence；B2 暂留门面——同一实例引用传入）。 */
export interface PersistenceState {
  sessions: ReadonlyMap<string, LiveSession>;
  reportStates: Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }>;
  attemptStates: Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>;
  knownReports: Set<string>;
  knownAttempts: Set<string>;
  persistenceInFlight: Map<string, Promise<unknown>>;
}

/** 尚未迁出（B2 范围外）的回交门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface PersistenceHandbackPort {
  handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: "memory-only" | "unknown-live", flowId?: string): Promise<boolean>;
  handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined;
}

/** 报告/投递持久化状态与回执操作（原 `SessionManager` 6 方法的同签名实现）。 */
export class Persistence {
  private readonly state: PersistenceState;
  private readonly port: PersistenceHandbackPort;
  constructor(state: PersistenceState, port: PersistenceHandbackPort) { this.state = state; this.port = port; }

  /* 原实例状态的本类只读/同名视图（同一 Map/Set 实例；方案 §3.6 暂留门面口径）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.state.sessions; }
  private get reportStates(): PersistenceState["reportStates"] { return this.state.reportStates; }
  private get attemptStates(): PersistenceState["attemptStates"] { return this.state.attemptStates; }
  private get knownReports(): Set<string> { return this.state.knownReports; }
  private get knownAttempts(): Set<string> { return this.state.knownAttempts; }
  private get persistenceInFlight(): Map<string, Promise<unknown>> { return this.state.persistenceInFlight; }

  /** 原 `SessionManager.sessionKey` 的同义委托（→ shared/keys.ts；签名/行为逐字一致）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
  }

  /** 回交提交端口（原 `this.handleHandback`；B2 仍在门面，参数逐位原样转发）。 */
  private handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: "memory-only" | "unknown-live", flowId?: string): Promise<boolean> {
    return this.port.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
  }

  /** 回交流程 id 端口（原 `this.handbackFlowId`；B2 仍在门面）。 */
  private handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined {
    return this.port.handbackFlowId(entry, hb);
  }

  persistenceScope(entry: LiveSession): PersistenceScope { return { projectRoot: entry.projectRoot, roleId: entry.roleId, runtime: entry.runtime }; }

  persistenceKey(scope: PersistenceScope, id: string): string { return `${scope.projectRoot}\0${scope.roleId}\0${scope.runtime}\0${id}`; }

  mergeReportState(entry: LiveSession, event?: HandbackEvent, update?: ReportSaveStateV1, updatedId?: string): void {
    const id = updatedId ?? event?.reportPersistence?.reportId ?? event?.report?.reportId;
    if (!id) {
      const state = event?.reportPersistence?.state;
      const liveCompatible = state === 'disabled' || state === 'unknown-live' || state === undefined && entry.handle.persistenceMode !== 'enabled';
      if (event && liveCompatible) void this.handleHandback(entry.projectRoot, entry.runtime, event.handback, undefined, event.liveReport, state === 'unknown-live' ? 'unknown-live' : state === 'disabled' || entry.handle.persistenceMode === 'disabled' ? 'memory-only' : 'unknown-live', this.handbackFlowId(entry, event.handback));
      return;
    }
    const key = this.persistenceKey(this.persistenceScope(entry), id);
    this.knownReports.add(key);
    const record = this.reportStates.get(key) ?? { owner: entry, queued: false };
    if (record.owner !== entry && record.owner !== undefined) return;
    record.owner = entry;
    if (event) record.event = structuredClone(event);
    if (update && (record.state?.state !== 'saved' || update.state === 'saved' || update.state === 'expired')) record.state = structuredClone(update);
    else if (!update && event?.reportPersistence && (!record.state || event.reportPersistence.state === 'saved')) record.state = { state: event.reportPersistence.state === 'unknown-live' ? 'unsupported' : event.reportPersistence.state, reportId: id, ...(event.report ? { report: event.report } : {}), retryAvailable: event.reportPersistence.retryAvailable, ...(event.reportPersistence.code ? { code: event.reportPersistence.code } : {}) };
    if (record.state?.state === 'saved' && !record.state.report && event?.report) record.state = { ...record.state, report: event.report };
    if (record.state?.state === 'expired') record.event = undefined;
    this.reportStates.set(key, record);
    if (record.event && record.state?.state === 'saved' && record.state.report && !record.queued && !record.inFlight) {
      record.inFlight = true; // Claim processing, never success/delivery before the actual ledger accepts it.
      void this.handleHandback(entry.projectRoot, entry.runtime, record.event.handback, record.state.report, record.event.liveReport, undefined, this.handbackFlowId(entry, record.event.handback))
        .then(queued => { record.queued = queued; record.inFlight = false; }, () => { record.inFlight = false; });
    }
  }

  rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void {
    const key = this.persistenceKey(this.persistenceScope(entry), receipt.attemptId);
    this.knownAttempts.add(key); this.attemptStates.set(key, { owner: entry, receipt });
  }

  registerPersistenceHistory(history: import('../runtime-history.ts').SessionHistoryView): void {
    const scope = { projectRoot: history.projectRoot, roleId: history.roleId, runtime: history.runtime };
    for (const report of history.reports ?? []) this.knownReports.add(this.persistenceKey(scope, report.reportId));
    for (const row of history.rows) {
      const id = row.deliveryReceipt?.attemptId ?? row.deliveryBoundary?.attemptId ?? row.inputProvenance?.attemptId;
      if (id) this.knownAttempts.add(this.persistenceKey(scope, id));
    }
  }

  async persistenceOperation<K extends keyof PersistenceValues>(scope: PersistenceScope, operation: K, id?: string): Promise<PersistenceReply<PersistenceValues[K]>> {
    const entry = this.sessions.get(this.sessionKey(scope.projectRoot, scope.roleId, scope.runtime));
    const failed = (code: 'SESSION_NOT_AVAILABLE' | 'SNAPSHOT_EXPIRED' | 'UNSUPPORTED'): PersistenceReply<PersistenceValues[K]> => ({ ok: false, version: 1, scope, code, message: code === 'SNAPSHOT_EXPIRED' ? mainT("main.session.saveSnapshotExpired") : mainT("main.session.saveUnsupported") });
    if (!entry) {
      const key = id ? this.persistenceKey(scope, id) : undefined;
      const known = key && (operation === 'retryReportSave' || operation === 'getReportSaveState' ? this.knownReports.has(key) : this.knownAttempts.has(key));
      return failed(known ? 'SNAPSHOT_EXPIRED' : 'SESSION_NOT_AVAILABLE');
    }
    const mode = entry.handle.persistenceMode ?? 'unknown-live';
    if (operation === 'getSessionPersistence') return { ok: true, version: 1, scope, value: { mode, reportSaveSupported: mode !== 'unknown-live' && !!entry.handle.retryReportPersistence, deliveryHistorySaveSupported: mode !== 'unknown-live' && !!entry.handle.retryDeliveryHistoryPersistence, querySupported: mode !== 'unknown-live' && !!entry.handle.getReportPersistence && !!entry.handle.getDeliveryReceipt } as PersistenceValues[K] };
    const key = this.persistenceKey(scope, id!);
    const source = operation === 'retryReportSave' || operation === 'getReportSaveState';
    if (!(source ? this.knownReports : this.knownAttempts).has(key)) return failed('SNAPSHOT_EXPIRED');
    if (mode === 'unknown-live') return failed('UNSUPPORTED');
    if (operation === 'retryReportSave' && this.reportStates.get(key)?.owner !== entry || operation === 'retryDeliveryHistorySave' && this.attemptStates.get(key)?.owner !== entry) return failed('SNAPSHOT_EXPIRED');
    const isRetry = operation === 'retryReportSave' || operation === 'retryDeliveryHistorySave';
    const work = async () => {
      let value: ReportSaveResultV1 | ReportSaveStateV1 | DeliverySaveResultV1 | DeliveryReceiptQueryV1 | undefined;
      if (operation === 'retryReportSave') value = await entry.handle.retryReportPersistence?.(id!);
      else if (operation === 'getReportSaveState') value = await entry.handle.getReportPersistence?.(id!);
      else if (operation === 'retryDeliveryHistorySave') value = await entry.handle.retryDeliveryHistoryPersistence?.(id!);
      else value = await entry.handle.getDeliveryReceipt?.(id!);
      if (this.sessions.get(this.sessionKey(scope.projectRoot, scope.roleId, scope.runtime)) !== entry) return failed('SNAPSHOT_EXPIRED');
      if (!value) return failed('UNSUPPORTED');
      if (operation === 'retryReportSave') {
        const result = value as ReportSaveResultV1;
        const state: ReportSaveStateV1 = result.ok ? { state: 'saved', reportId: result.report.reportId, report: result.report, retryAvailable: false } : { state: result.state, reportId: result.reportId ?? id, report: result.report, code: result.code, retryAvailable: result.retryAvailable };
        this.mergeReportState(entry, undefined, state, id);
      }
      if (operation === 'retryDeliveryHistorySave') { const receipt = (value as DeliverySaveResultV1).receipt; if (receipt) this.rememberReceipt(entry, receipt); }
      return { ok: true, version: 1, scope, value: value as PersistenceValues[K] } as PersistenceReply<PersistenceValues[K]>;
    };
    if (!isRetry) return work().catch(() => failed("UNSUPPORTED"));
    const inflightKey = operation + '\0' + key;
    const existing = this.persistenceInFlight.get(inflightKey); if (existing) return existing as Promise<PersistenceReply<PersistenceValues[K]>>;
    const promise = work().catch(() => failed("UNSUPPORTED")).finally(() => { if (this.persistenceInFlight.get(inflightKey) === promise) this.persistenceInFlight.delete(inflightKey); });
    this.persistenceInFlight.set(inflightKey, promise); return promise;
  }
}
