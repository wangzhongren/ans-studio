// app/desktop/session/delivery/queue.ts
// B4（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B4、附录 A delivery 组）：投递队列/drain/去重/停止恢复/状态外推（L3）。
// 20 个类方法（deliveryIsStopped/deliveryLifecycle/resumeDelivery/queueDirectNotification/
// forceResetDeliveryState/appTaskClientMessageId/appTaskClientMessageIdFromSeed/appDispatchClientMessageId/
// rememberAppTaskDelivered/pendingAppTaskDelivery/enqueueDelivery/withdraw/notifyRoleState/
// broadcastRoleStates/redeliverNudge/drainAllQueuesFor/drainPiQueuesAcrossProjects/
// waitForRunStopDeliveryClaims/drainQueue/drainQueueUnsafe）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：
// 方法体零改动；类外壳重建原 receiver 面——
//  · 方案 §3.6 delivery 的 19 个状态字段**由本模块单 owner 持有并创建**（DeliveryState）；门面仅保留
//    **同一实例**的访问器（方案 §4.3 测试 cast 兼容面），不造第二份状态；
//  · 跨模块只读状态（sessions/lastGovernanceRuntime/lastRoleActivity/attemptStates/库存根集合，及仅供
//    store 使用的派发键/星形任务/回交键）经显式引用传入（同一实例）；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*（与门面委托同一函数、同一入参）；
//  · 发送实现经 DeliverySink.deliver 端口回接门面 sendDelivery（门面构造时注入箭头回调，运行期调用）；
//  · 尚未迁出的门面方法（openInternal/healStaleOrigin/beginDeliveryOrigin/trimDeliveryOrigins/
//    failDeliveryOrigin/hasBusyRuntime/profileRevision/findLiveRuntime/noteWatchdogActivity/
//    inspectFixedHandbackChild/runTaskIsFenced/isNetworkOffline/rememberReceipt/persistenceScope/
//    persistenceKey/targetKey/managerId/inventoryState）经 DeliveryPorts 回调注入，参数逐位原样转发；
//  · rebuildIfBoundaryStale 直接调用已迁出的 SessionEnv 实例（本模块白名单允许导入 session-env）。
// **R2 时序不变量（逐字保留）**：认领段（shift → 置忙 → 登记 activeDeliveries → 取 send promise 后立即
// 释放链）整段同步；entry.busy = true; 必须先于 await this.sendDelivery(...)（源码顺序未动；
// message-queue 顺序钉经 readSessionModule("lifecycle/send") 回退读门面 send 路径，本模块同款顺序）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L3 delivery 只可导入 L0（contracts/shared）、delivery/store（L1）、session-env（L2）。

import { createHash, randomUUID } from "node:crypto";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { shortenSummary, taskEvent, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import { renderHandbackBatchPrompt, renderWorkReportBatchPrompt, type TaskHandback } from "../../../../src/common/编排/handback.ts";
import { isBuiltInGovernanceRoleId } from "../../../../src/service/boundary/resolve-boundary.ts";
import { inspectAssignedTask, inspectQueuedControllerResume, classifyClosedTaskNotice, prepareRoleDispatch, resolveDeliveryAssignment } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import { inspectAssignedTask as inspectWorkflowAssignedTask } from "../../../../src/common/编排/workflow-service.ts";
import { RuntimeDeliveryError } from "../../../../src/model/runtime.ts";
import type { PromptOptions, RuntimeDeliveryReceiptV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, RuntimeLiveReportViewV1, RuntimeReportSnapshotV1, TaskStateEvent } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { PersistenceScope } from "../contracts/persistence.ts";
import type {
  ActualDispatchSource,
  ControllerResumeDelivery,
  DeliveryAssignment,
  DeliveryItem,
  DeliveryOrigin,
  DeliveryQueuePersistenceFacts,
  DeliveryQueuePersistenceOutcome,
  DeliveryQueueRestoreReport,
  InternalSessionOpenRequest,
  LiveSession,
  OpenResult,
  PersistedDeliveryItemV1,
  RedeliverResult,
  SessionTarget,
  StopResult,
  WithdrawResult,
} from "../contracts/session-types.ts";
import { queueKey, sessionKey } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf, handbackOwnerRoleId, roleDisplayName } from "../shared/roles.ts";
import { appendRoleActivity, appendTaskState, isFixedTask, readTasks } from "../shared/tasks-store.ts";
import { inventoryChanged, publishDeliveryInventory, type SessionInventoryState } from "../shared/inventory.ts";
import { contextInfo } from "../shared/session-views.ts";
import { APP_TASK_CLIENT_MESSAGE_ID_PREFIX, isAppTaskClientMessageId } from "../shared/text.ts";
import { mainT } from "../../i18n.ts";
import type { WorkflowMode } from "../../workflow.ts";
import type { SessionEnv } from "../session-env.ts";
import { DeliveryStore, type DeliveryStoreRefs, type DeliveryStoreState } from "./store.ts";

/** 投递机串行链的认领记录（原 drainClaimRecords 元素形状）。 */
export interface DrainClaimRecord {
  projectRoot: string;
  taskIds?: readonly string[];
  owner?: ActualDispatchSource;
  done: Promise<void>;
}

/** delivery 模块单 owner 的完整状态（方案 §3.6 的 19 个字段；同一对象供 store 只读/读写子集使用）。 */
export interface DeliveryState extends DeliveryStoreState {
  readonly drainChains: Map<string, Promise<void>>;
  readonly drainClaimRecords: Set<DrainClaimRecord>;
  deliveryStopVersion: number;
  deliveryStoppedAll: boolean;
  readonly stoppedDeliveryKeys: Set<string>;
  readonly resumedDeliveryKeys: Set<string>;
  readonly deliveryKeyStopVersions: Map<string, number>;
  readonly suDeliveryBlockedNoted: Set<string>;
  readonly taskDeliveryCommits: Map<string, { done: Promise<void>; finish: () => void }>;
  readonly taskHandbackCommits: Map<string, Promise<void>>;
}

/** delivery 方法读取的跨模块只读状态面（同一实例；方案 §3.6 归属其他模块，B4 只读/按原样写入）。 */
export interface DeliveryRefs extends DeliveryStoreRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  attemptStates: ReadonlyMap<string, { receipt: RuntimeDeliveryReceiptV1 }>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
  observedInventoryRoots: Set<string>;
  inventoryPublicationErrors: Map<string, string>;
}

/** 实际发送端口（方案 §3.4：只暴露「发送」；门面构造时注入箭头回调 → 门面 sendDelivery）。 */
export interface DeliverySink {
  deliver(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback?: boolean, handbackTaskId?: string,
    reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice?: boolean, controllerResume?: ControllerResumeDelivery): Promise<void>;
}

/** 尚未迁出（B4 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发、返回原样返回。 */
export interface DeliveryPorts {
  deliver: DeliverySink["deliver"];
  openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult>;
  healStaleOrigin(entry: LiveSession, reasonCode: string): boolean;
  beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined;
  trimDeliveryOrigins(entry: LiveSession): void;
  failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void;
  hasBusyRuntime(runtime: RuntimeKind): boolean;
  profileRevision(runtime: RuntimeKind): number;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  noteWatchdogActivity(projectRoot: string, reason: string): void;
  inspectFixedHandbackChild(projectRoot: string, handback: TaskHandback, recipientRoleId: string, expectedFlowId: string | undefined): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }>;
  runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean;
  isNetworkOffline(): boolean;
  rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void;
  persistenceScope(entry: LiveSession): PersistenceScope;
  persistenceKey(scope: PersistenceScope, id: string): string;
  targetKey(target: string | SessionTarget): string | undefined;
  managerId(): string;
  inventoryState(): SessionInventoryState;
}

/** queue 方法读取的 deps 切片（原 this.deps 的只读查询）。 */
type DeliveryDeps = Pick<SessionManagerDeps, "emitEvent" | "emitRoleState" | "getListing" | "refreshListing" | "now" | "demoRuntimeAutoDeliver">;

/** 「已投递」应用任务标记的内存上界（FIFO 淘汰；防长跑进程无界增长）。 */
const MAX_DELIVERED_APP_TASK_IDS = 1024;

/** 投递队列/drain/去重/停止恢复/状态外推（原 SessionManager 20 方法的同签名实现）。 */
export class Delivery {
  readonly state: DeliveryState;
  private readonly refs: DeliveryRefs;
  private readonly port: DeliveryPorts;
  private readonly deps: DeliveryDeps;
  private readonly sessionEnv: SessionEnv;
  private readonly store: DeliveryStore;
  constructor(refs: DeliveryRefs, port: DeliveryPorts, deps: DeliveryDeps, sessionEnv: SessionEnv, queueStorePath: string | undefined) {
    const deliveryPersistOutcome: DeliveryQueuePersistenceOutcome = { completedSeq: 0, committedSeq: 0, failureCount: 0 };
    this.state = {
      deliveryQueues: new Map<string, DeliveryItem[]>(),
      drainChains: new Map<string, Promise<void>>(),
      drainClaimRecords: new Set<DrainClaimRecord>(),
      deliveryStopVersion: 0,
      deliveryStoppedAll: false,
      stoppedDeliveryKeys: new Set<string>(),
      resumedDeliveryKeys: new Set<string>(),
      deliveryKeyStopVersions: new Map<string, number>(),
      activeDeliveries: new Map<string, DeliveryItem>(),
      deliveryQueueStorePath: queueStorePath,
      deliveryPersistOutcome,
      deliveryPersistChain: Promise.resolve(deliveryPersistOutcome),
      deliveryPersistSeq: 0,
      deliveredDeliveryKeys: new Set<string>(),
      deliveredAppTaskIds: new Set<string>(),
      deliveryStoreArmed: false,
      suDeliveryBlockedNoted: new Set<string>(),
      taskDeliveryCommits: new Map<string, { done: Promise<void>; finish: () => void }>(),
      taskHandbackCommits: new Map<string, Promise<void>>(),
    };
    this.refs = refs; this.port = port; this.deps = deps; this.sessionEnv = sessionEnv;
    this.store = new DeliveryStore(this.state, this.refs, {
      enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
      drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
      managerId: () => this.port.managerId(),
      inventoryState: () => this.port.inventoryState(),
    }, deps);
  }

  /* 本模块状态的同名视图（同一 Map/Set/标量字段；方案 §3.6 delivery 单 owner）。 */
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.state.deliveryQueues; }
  private get drainChains(): Map<string, Promise<void>> { return this.state.drainChains; }
  private get drainClaimRecords(): Set<DrainClaimRecord> { return this.state.drainClaimRecords; }
  private get deliveryStopVersion(): number { return this.state.deliveryStopVersion; }
  private get deliveryStoppedAll(): boolean { return this.state.deliveryStoppedAll; }
  private get stoppedDeliveryKeys(): Set<string> { return this.state.stoppedDeliveryKeys; }
  private get resumedDeliveryKeys(): Set<string> { return this.state.resumedDeliveryKeys; }
  private get deliveryKeyStopVersions(): Map<string, number> { return this.state.deliveryKeyStopVersions; }
  private get activeDeliveries(): Map<string, DeliveryItem> { return this.state.activeDeliveries; }
  private get deliveredDeliveryKeys(): Set<string> { return this.state.deliveredDeliveryKeys; }
  private get deliveredAppTaskIds(): Set<string> { return this.state.deliveredAppTaskIds; }
  private get suDeliveryBlockedNoted(): Set<string> { return this.state.suDeliveryBlockedNoted; }
  private get taskDeliveryCommits(): Map<string, { done: Promise<void>; finish: () => void }> { return this.state.taskDeliveryCommits; }

  /* 跨模块只读状态的本类同名视图（同一实例）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }
  private get activeDispatchKeys(): Set<string> { return this.refs.activeDispatchKeys; }
  private get attemptStates(): ReadonlyMap<string, { receipt: RuntimeDeliveryReceiptV1 }> { return this.refs.attemptStates; }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string { return queueKey(projectRoot, targetRoleId, runtime); }
  private targetKey(target: string | SessionTarget): string | undefined { return this.port.targetKey(target); }
  private now(): number { return now(this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  private async isFixedTask(projectRoot: string, taskId: string | undefined): Promise<boolean> { return isFixedTask(projectRoot, taskId); }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> { return appendTaskState(projectRoot, event); }
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.refs.lastRoleActivity, now: () => this.now() });
  }
  private inventoryChanged(projectRoot: string, reason: string): void { inventoryChanged(projectRoot, reason, this.inventoryState); }
  private publishDeliveryInventory(reason: string): void { publishDeliveryInventory(reason, this.inventoryState); }
  private get inventoryState(): SessionInventoryState {
    return { observedInventoryRoots: this.refs.observedInventoryRoots, inventoryPublicationErrors: this.refs.inventoryPublicationErrors };
  }
  private contextInfo(handle: Parameters<typeof contextInfo>[0]): ReturnType<typeof contextInfo> { return contextInfo(handle); }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult> { return this.port.openInternal(req, userInitiated); }
  private healStaleOrigin(entry: LiveSession, reasonCode: string): boolean { return this.port.healStaleOrigin(entry, reasonCode); }
  private beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined { return this.port.beginDeliveryOrigin(entry, clientMessageId); }
  private trimDeliveryOrigins(entry: LiveSession): void { this.port.trimDeliveryOrigins(entry); }
  private failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void { this.port.failDeliveryOrigin(entry, origin); }
  private hasBusyRuntime(runtime: RuntimeKind): boolean { return this.port.hasBusyRuntime(runtime); }
  private profileRevision(runtime: RuntimeKind): number { return this.port.profileRevision(runtime); }
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined { return this.port.findLiveRuntime(projectRoot, roleId); }
  private noteWatchdogActivity(projectRoot: string, reason: string): void { this.port.noteWatchdogActivity(projectRoot, reason); }
  private inspectFixedHandbackChild(projectRoot: string, handback: TaskHandback, recipientRoleId: string, expectedFlowId: string | undefined): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }> {
    return this.port.inspectFixedHandbackChild(projectRoot, handback, recipientRoleId, expectedFlowId);
  }
  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean { return this.port.runTaskIsFenced(projectRoot, taskId, runId); }
  private isNetworkOffline(): boolean { return this.port.isNetworkOffline(); }
  private rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void { this.port.rememberReceipt(entry, receipt); }
  private persistenceScope(entry: LiveSession): PersistenceScope { return this.port.persistenceScope(entry); }
  private persistenceKey(scope: PersistenceScope, id: string): string { return this.port.persistenceKey(scope, id); }
  private rebuildIfBoundaryStale(roleId: string, userInitiated: boolean): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    return this.sessionEnv.rebuildIfBoundaryStale(roleId, userInitiated);
  }
  private sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback?: boolean, handbackTaskId?: string,
    reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice?: boolean, controllerResume?: ControllerResumeDelivery): Promise<void> {
    return this.port.deliver(entry, origin, text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume);
  }

  /* store 同名同义委托（→ delivery/store.ts；同一状态实例；public 供门面薄委托调用）。 */
  persistDeliveryQueues(): void { this.store.persistDeliveryQueues(); }
  deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts { return this.store.deliveryQueuePersistenceFacts(); }
  finishStopPersistence(result: StopResult): Promise<StopResult> { return this.store.finishStopPersistence(result); }
  async restorePersistedDeliveries(): Promise<DeliveryQueueRestoreReport> { return this.store.restorePersistedDeliveries(); }
  persistableDeliveryItem(item: DeliveryItem): PersistedDeliveryItemV1["item"] | undefined { return this.store.persistableDeliveryItem(item); }
  deliveryStoreItems(): PersistedDeliveryItemV1[] { return this.store.deliveryStoreItems(); }
  parsePersistedDeliveryItem(raw: unknown): { projectRoot: string; roleId: string; runtime: RuntimeKind; item: DeliveryItem } | undefined { return this.store.parsePersistedDeliveryItem(raw); }

  // —— deliveryIsStopped（B4 自 session.ts 逐字搬移）——
  deliveryIsStopped(key: string): boolean {
    return this.stoppedDeliveryKeys.has(key) || this.deliveryStoppedAll && !this.resumedDeliveryKeys.has(key);
  }

  // —— deliveryLifecycle（B4 自 session.ts 逐字搬移）——
  deliveryLifecycle(key: string): string {
    return `${this.deliveryStopVersion}:${this.deliveryKeyStopVersions.get(key) ?? 0}`;
  }

  // —— resumeDelivery（B4 自 session.ts 逐字搬移）——
  resumeDelivery(key: string): void {
    this.stoppedDeliveryKeys.delete(key); this.resumedDeliveryKeys.add(key);
  }

  // —— queueDirectNotification（B4 自 session.ts 逐字搬移）——
  /** Idempotent host notification: enqueue acknowledgement never waits for the recipient's current turn. */
  async queueDirectNotification(projectRoot: string, input: { key: string; recipientRoleId: string; message: string;
    source: Extract<import("../../../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }> }): Promise<void> {
    const allowed = ["chief", "convener", input.source.actorRoleId];
    if (!input.key || !allowed.includes(input.recipientRoleId)) throw new Error("Invalid direct notification recipient");
    const runtime = this.findLiveRuntime(projectRoot, input.recipientRoleId) ?? this.lastGovernanceRuntime.get(projectRoot);
    if (runtime === undefined) throw new Error("No actual runtime is selected for the notification recipient");
    const clientMessageId = this.appTaskClientMessageIdFromSeed(input.key);
    const key = this.queueKey(projectRoot, input.recipientRoleId, runtime);
    if (this.deliveredAppTaskIds.has(clientMessageId)
      || this.deliveryQueues.get(key)?.some(item => item.clientMessageId === clientMessageId)
      || this.activeDeliveries.get(key)?.clientMessageId === clientMessageId) return;
    this.enqueueDelivery(projectRoot, input.recipientRoleId, { kind: "system", runtime, targetRoleId: input.recipientRoleId,
      sourceRoleId: input.source.actorRoleId, text: `[应用·文档更新] ${input.message}`, summary: shortenSummary(input.message),
      dedupKey: input.key, clientMessageId, notificationSource: structuredClone(input.source) });
    // Do not await drain: the publisher may itself be waiting inside the current recipient turn.
    void this.drainQueue(projectRoot, input.recipientRoleId, runtime);
  }

  // —— forceResetDeliveryState（B4 自 session.ts 逐字搬移）——
  /**
   * **强制复位投递层状态（P0，2026-10-30）**：仅在「停止已成功请求」后由 `abort` 调用——
   * 复位 `origins.running`/`busy`/`activeDeliveries`，为被放弃的在途投递落**恰一次**终态（`delivery.end`
   * `mode:"aborted"`，at-most-once，不重投），结算 settle 等待者并放行队列。**不伪造回合终局**：
   * 运行时若稍后仍发 settled，按既有幂等路径处理（busy 已复位，不产生第二次收尾）。
   * 无忙态/无 origin/无在途 ⇒ no-op（幂等，不产生噪声）。
   */
  forceResetDeliveryState(entry: LiveSession, reasonCode: string): void {
    const key = this.queueKey(entry.projectRoot, entry.roleId, entry.runtime);
    const origin = entry.origins.running;
    const active = this.activeDeliveries.get(key);
    const wasBusy = entry.busy;
    if (!wasBusy && origin === undefined && active === undefined) return;
    if (origin !== undefined) {
      origin.settled = true;
      delete entry.origins.running;
      this.trimDeliveryOrigins(entry);
    }
    let activeClosed = 0;
    if (active !== undefined && active.terminalRecorded !== true) {
      active.terminalRecorded = true;
      activeClosed = 1;
      this.deliveredDeliveryKeys.add(`${key}\u0000${active.dedupKey}`);
      this.rememberAppTaskDelivered(active.clientMessageId);
      createDiagnosticLogger({ component: "desktop.delivery", projectRoot: entry.projectRoot, roleId: entry.roleId }).record("delivery.end", {
        ok: true,
        count: 1,
        state: active.kind,
        mode: "aborted",
        reasonCode,
      });
    }
    if (active !== undefined) this.activeDeliveries.delete(key);
    entry.busy = false;
    entry.busySince = undefined;
    const settleWaiters = entry.settleWaiters;
    entry.settleWaiters = undefined;
    for (const finish of settleWaiters ?? []) finish(true);
    createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).record(
      "turn.abort.forced",
      {
        reasonCode,
        ...(origin?.turnId !== undefined ? { turnId: origin.turnId } : {}),
        mode: "forced",
        count: activeClosed,
        queueDepth: (this.deliveryQueues.get(key) ?? []).length,
        busy: wasBusy,
      },
    );
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    this.persistDeliveryQueues();
    void this.drainAllQueuesFor(entry.projectRoot);
    if (entry.runtime === "pi") void this.drainPiQueuesAcrossProjects();
  }

  // —— appTaskClientMessageId（B4 自 session.ts 逐字搬移）——
  /** 应用任务的**内容稳定键**（2026-10-25）：同项目×目标×引擎×正文 ⇒ 同键；任一变化 ⇒ 新键。 */
  appTaskClientMessageId(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    const digest = createHash("sha256")
      .update(`${projectRoot}\u0000${roleId}\u0000${runtime}\u0000${text}`, "utf8")
      .digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  // —— appTaskClientMessageIdFromSeed（B4 自 session.ts 逐字搬移）——
  /** 调用方自带**语义去重键**（如 flow revision 指纹）时的稳定键：同键同任务，键变 ⇒ 新任务。 */
  appTaskClientMessageIdFromSeed(seed: string): string {
    const digest = createHash("sha256").update(`seed\u0000${seed}`, "utf8").digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  // —— appDispatchClientMessageId（B4 自 session.ts 逐字搬移）——
  /** 派发条目的稳定键：既有内容 `dedupKey`（含 project/runtime/target/正文/reason/flowId/stepId）的 sha256。 */
  appDispatchClientMessageId(dedupKey: string): string {
    const digest = createHash("sha256").update(`dispatch\u0000${dedupKey}`, "utf8").digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  // —— rememberAppTaskDelivered（B4 自 session.ts 逐字搬移）——
  /** 记「已投递」标记（仅应用任务；有界 FIFO）。重复记录只刷新存在性（不重排）。 */
  rememberAppTaskDelivered(clientMessageId: string | undefined): void {
    if (!isAppTaskClientMessageId(clientMessageId) || this.deliveredAppTaskIds.has(clientMessageId)) return;
    this.deliveredAppTaskIds.add(clientMessageId);
    while (this.deliveredAppTaskIds.size > MAX_DELIVERED_APP_TASK_IDS) {
      const oldest = this.deliveredAppTaskIds.values().next().value;
      if (oldest === undefined) break;
      this.deliveredAppTaskIds.delete(oldest);
    }
  }

  // —— pendingAppTaskDelivery（B4 自 session.ts 逐字搬移）——
  /** 同一应用任务是否已在内存队列/在途（队列键内）——返回排队位次（1 起；在途 ⇒ queued:false）。 */
  pendingAppTaskDelivery(
    projectRoot: string,
    targetRoleId: string,
    runtime: RuntimeKind,
    clientMessageId: string,
  ): { queued: boolean; position?: number } | undefined {
    const key = this.queueKey(projectRoot, targetRoleId, runtime);
    const queue = this.deliveryQueues.get(key);
    if (queue !== undefined) {
      const idx = queue.findIndex((item) => item.clientMessageId === clientMessageId);
      if (idx >= 0) return { queued: true, position: idx + 1 };
    }
    if (this.activeDeliveries.get(key)?.clientMessageId === clientMessageId) return { queued: false };
    return undefined;
  }

  // —— enqueueDelivery（B4 自 session.ts 逐字搬移）——
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    this.inventoryChanged(projectRoot, "delivery-enqueue-requested");
    const key = this.queueKey(projectRoot, targetRoleId, item.runtime);
    const q = this.deliveryQueues.get(key) ?? [];
    const entry = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, item.runtime));
    const activeAssignment = entry?.origins.running ? entry.origins.running.assignment : entry?.boundAssignment;
    const systemAssignment = item.kind === "system" ? (item.systemAssignment !== undefined ? item.systemAssignment : activeAssignment ?? null) : undefined;
    q.push({ ...item, queueEntryId: item.queueEntryId ?? randomUUID(), ...(item.kind === "system" ? { systemAssignment: systemAssignment ? structuredClone(systemAssignment) : null } : {}), enqueuedAt: new Date(this.now()).toISOString() }); // 入队时间**入队即定格**（显示用，非执行时间；经注入时钟——与看护同源）
    this.deliveryQueues.set(key, q);
    // G-2/W3：派发/回交/客户消息**入队** = 真实活动（重武装）；`kind:"system"`（看护自身投递）**不记**——
    // 否则「告警/收束投递本身」会把静默窗口反复重置或反过来触发骚扰回路。
    if (item.kind !== "system") this.noteWatchdogActivity(projectRoot, `enqueue-${item.kind}`);
    this.notifyRoleState(projectRoot, targetRoleId, item.runtime); // L-1：入队即外推（队列行/徽标如实可见）
    // 2026-10-20 重启续跑：入队即持久化（原子写；失败只诊断，不影响内存投递）。
    this.deliveredDeliveryKeys.delete(`${this.queueKey(projectRoot, targetRoleId, item.runtime)}\u0000${item.dedupKey}`);
    // 2026-10-25：显式重新入队＝新的一次派发意图（返工同文再派仍放行）——清除该应用任务的「已投递」标记；
    // 重建续投/应用侧重复调用不经本函数（它们在发送前被 stable id 去重拦下），所以不会被这一次清除误放行。
    if (item.clientMessageId !== undefined) this.deliveredAppTaskIds.delete(item.clientMessageId);
    this.persistDeliveryQueues();
  }

  // —— withdraw（B4 自 session.ts 逐字搬移）——
  /**
   * **撤回一条未投递的排队消息（P1-1，2026-10-13 客户裁定）**：`id` = 快照条目视图给出的 `id`
   * （即 `dedupKey`，单一来源）。语义钉死：
   * - **仅未投递者可撤**：条目仍在队列里 ⇒ 删除，`notifyRoleState` 快照外推（位次自然前移）；返回 `summary`
   *   供聊天流如实一行「已撤回排队消息：〈摘要〉」；
   * - **已进「进行中」（drain 已 shift、正投递）⇒ 撤回无效**：如实回错，**绝不**从执行里抽掉已在跑的东西；
   * - 不在队列（已投递完/已撤回/不存在）⇒ 如实回错；
   * - **仅「客户消息」类可撤**（客户自己的话）：派发/回交条目属治理流（单方面撤会破坏 su 验收/派发的
   *   因果）——本层拒绝非 message 条目，界面侧派发/回交**不给撤回钮**（呈现与语义同口径）。
   * 界面不碰内部结构：只凭快照的 `id` 说话（**不造第二套数据源**）。
   */
  withdraw(targetInput: string | SessionTarget, id: string): WithdrawResult {
    let roleId: string;
    if (typeof targetInput === "string") roleId = targetInput;
    else roleId = targetInput.roleId;
    if (typeof roleId !== "string" || roleId === "" || typeof id !== "string" || id === "") {
      return { ok: false, error: mainT("main.session.withdrawIncomplete") };
    }
    // ① 先查「**进行中**」：在跑条目已在 shift 后**不在队列里**（其队列键也可能已随清空删除）——
    // 直接沿 activeDeliveries 找：命中即撤回无效（如实，与「已投递完」区分开）。
    for (const [key, item] of this.activeDeliveries) {
      const target = key.split("\u0000")[1] ?? "";
      if (target === roleId && item.dedupKey === id) {
        return { ok: false, error: mainT("main.session.withdrawRunning") };
      }
    }
    // ② 再查排队中的条目：仅「客户消息」类可撤（派发/回交属治理流——只读）；找到即删 + 快照外推位次前移。
    for (const [key, q] of this.deliveryQueues) {
      const parts = key.split("\u0000");
      const projectRoot = parts[0] ?? "";
      const target = parts[1] ?? "";
      if (typeof targetInput !== "string" && ((targetInput.projectRoot && parts[0] !== targetInput.projectRoot) || (targetInput.runtime && parts[2] !== targetInput.runtime))) continue;
      if (target !== roleId) continue; // 只看该角色的队列（一套机多目标）
      const idx = q.findIndex((i) => i.dedupKey === id);
      if (idx < 0) continue;
      const item = q[idx];
      if (item.kind !== "message") {
        // G-2/W2：`system`（看护告警/收束/恢复回执）与派发/回交同归**治理流只读**面——本判据已覆盖第四类，
        // 不可撤回（呈现与语义同口径：界面侧对非 message 条目不给撤回钮）；文案保持原文（渲染侧源码钉在
        // 桌面UI 的 test/桌面应用/renderer.test.ts，本角色不改动他角色断言）。
        return { ok: false, error: mainT("main.session.withdrawNotCustomer") };
      }
      q.splice(idx, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      this.notifyRoleState(projectRoot, roleId, item.runtime); // 位次前移/角标随之（既有快照机制；不造第二套）
      this.persistDeliveryQueues(); // 2026-10-20 重启续跑：撤回同步持久化
      return { ok: true, summary: item.summary };
    }
    return { ok: false, error: mainT("main.session.withdrawNotQueued") };
  }

  // —— notifyRoleState（B4 自 session.ts 逐字搬移）——
  /** L-1/状态准确性 + 右栏「待办 / 队列」：**真实状态快照**外推（忙/闲 × 队列；变化时）——徽标/队列行/
   *  右栏待办组**都只信它**（同一通道、**不造第二套数据源**）。含：结构化的排队条目（来源/摘要/入队时间）
   *  与**正在跑的那条投递**（若有；标注「进行中」——排队 ≠ 已执行）。
   *  **P1-1（2026-10-13 客户裁定）**：条目视图增 `id`（= `dedupKey`，撤回的定位键）与 `full`（入队即定格的
   *  **全文**——抽屉内「展开看全文」用；摘要字段照旧只作列表显示）。 */
  notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void {
    this.inventoryChanged(projectRoot, "role-state-observed");
    if (targetRoleId === "") return;
    const q = this.deliveryQueues.get(this.queueKey(projectRoot, targetRoleId, runtime)) ?? [];
    const entry = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime));
    const busy = entry?.busy === true;
    const running = this.activeDeliveries.get(this.queueKey(projectRoot, targetRoleId, runtime));
    const now = this.now();
    /** **P0 队列可见性（2026-10-30）**：每条排队项的等待时长（ms；入队时刻定格，显示用）。 */
    const ageOf = (i: DeliveryItem): number => {
      const parsed = Date.parse(i.enqueuedAt);
      return Number.isFinite(parsed) ? Math.max(0, now - parsed) : 0;
    };
    const view = (i: DeliveryItem) => ({ runtime: i.runtime, kind: i.kind, sourceRoleId: i.sourceRoleId, summary: i.summary, at: i.enqueuedAt, id: i.dedupKey, full: i.kind === "handback" ? i.safeText ?? mainT("main.session.safeCopyPending") : i.text, ageMs: ageOf(i) });
    let contextInfo: Pick<OpenResult, "contextSource" | "contextWarning"> = {};
    if (entry) contextInfo = this.contextInfo(entry.handle);
    // **为什么没动**（单一来源＝会话内存态，不造第二套）：队首类别 / 阻塞原因 / 当前回合 id。
    // `origin-missing` = 忙态但无对应在跑回合（收尾异常，可用「停止本轮」复位）；
    // `target-busy` = 正常等待上一轮；`session-closed` = 目标会话未开且没有自动开启链；
    // `network`（P2）= 主进程网络离线，队列安全暂停（恢复后按既有顺序继续）。
    const runningOrigin = entry?.origins.running;
    const headKind = q.length > 0 ? q[0].kind : null;
    const blockedReason: "target-busy" | "origin-missing" | "session-closed" | "network" | null =
      q.length === 0
        ? null
        : this.deliveryIsStopped(this.queueKey(projectRoot, targetRoleId, runtime))
          ? "session-closed"
          : this.isNetworkOffline()
          ? "network"
          : busy
            ? (runningOrigin === undefined || runningOrigin.settled === true ? "origin-missing" : "target-busy")
            : entry === undefined
              ? (this.drainChains.has(projectRoot) ? null : "session-closed")
              : null;
    this.deps.emitRoleState?.({
      ...contextInfo,
      roleId: targetRoleId, projectRoot, runtime, profileRevision: entry?.profileRevision ?? this.profileRevision(runtime),
      busy,
      summaries: q.map((i) => i.summary),
      queue: q.map(view),
      running: running !== undefined && busy ? view(running) : null,
      headKind,
      blockedReason,
      activeTurnId: runningOrigin?.turnId ?? null,
    });
  }

  // —— broadcastRoleStates（B4 自 session.ts 逐字搬移）——
  /** 界面（重）加载后请求重放全部在场会话的角色状态快照：状态只在变化时外推，晚订阅的渲染侧否则会丢失忙/闲与队列。 */
  broadcastRoleStates(): void {
    for (const entry of this.sessions.values()) {
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    }
  }

  // —— redeliverNudge（B4 自 session.ts 逐字搬移）——
  /**
   * **`redeliver` 恢复动作**（W4）——队列重试 nudge：包装既有 `drainQueue`（不新造投递路径）。
   * 给 `itemId` 时针对该排队条目：**条目已投出/不存在 ⇒ 如实回执**；触发后按**触发后的真实队列状态**
   * 如实回报（仍排队 ⇒ 目标忙/未开，保留待重试——绝不把「已触发重试」写成「已投出」）。
   */
  async redeliverNudge(target: string | SessionTarget, itemId?: string): Promise<RedeliverResult> {
    const key = this.targetKey(target);
    if (key === undefined) return { ok: false, message: mainT("main.session.redeliverNoMatch") };
    const [projectRoot = "", roleId = "", runtime = "pi"] = key.split("\u0000");
    const qKey = this.queueKey(projectRoot, roleId, runtime as RuntimeKind);
    const queue = this.deliveryQueues.get(qKey) ?? [];
    const inFlight = this.activeDeliveries.get(qKey);
    if (typeof itemId === "string" && itemId !== "") {
      const idxBefore = queue.findIndex((i) => i.dedupKey === itemId);
      if (idxBefore < 0) {
        if (inFlight?.dedupKey === itemId) return { ok: true, message: mainT("main.session.redeliverInFlight") };
        return { ok: false, message: mainT("main.session.redeliverNotQueued") };
      }
      await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
      const after = this.deliveryQueues.get(qKey) ?? [];
      const idxAfter = after.findIndex((i) => i.dedupKey === itemId);
      if (idxAfter >= 0) {
        return { ok: true, message: mainT("main.session.redeliverQueued", { position: idxAfter + 1 }) };
      }
      const nowInFlight = this.activeDeliveries.get(qKey);
      return nowInFlight?.dedupKey === itemId
        ? { ok: true, message: mainT("main.session.redeliverSent") }
        : { ok: true, message: mainT("main.session.redeliverGone") };
    }
    await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
    const after = this.deliveryQueues.get(qKey) ?? [];
    const nowInFlight = this.activeDeliveries.get(qKey);
    if (after.length === 0) {
      return nowInFlight !== undefined
        ? { ok: true, message: mainT("main.session.redeliverCleared") }
        : { ok: true, message: mainT("main.session.redeliverEmpty") };
    }
    return { ok: true, message: mainT("main.session.redeliverRemaining", { count: after.length, inflight: nowInFlight !== undefined ? mainT("main.session.redeliverInFlightOne") : mainT("main.session.redeliverNoInflight") }) };
  }

  // —— drainAllQueuesFor（B4 自 session.ts 逐字搬移）——
  /** 某项目**全部**队列的放行尝试（settled 触发的重试时机——投递触发不挑目标，各队列自判忙/开）。 */
  async drainAllQueuesFor(projectRoot: string): Promise<void> {
    const prefix = `${projectRoot}\u0000`;
    const targets: string[] = [];
    for (const k of [...this.deliveryQueues.keys()]) {
      if (k.startsWith(prefix)) targets.push(k.slice(prefix.length));
    }
    for (const t of targets) {
      const [target, runtime] = t.split("\u0000");
      await this.drainQueue(projectRoot, target, runtime as RuntimeKind);
    }
  }

  // —— drainPiQueuesAcrossProjects（B4 自 session.ts 逐字搬移）——
  async drainPiQueuesAcrossProjects(): Promise<void> {
    if (this.hasBusyRuntime("pi")) return;
    const projects = new Set<string>();
    for (const key of this.deliveryQueues.keys()) {
      const [projectRoot, , runtime] = key.split("\u0000");
      if (runtime === "pi") projects.add(projectRoot);
    }
    for (const projectRoot of projects) await this.drainAllQueuesFor(projectRoot);
  }

  // —— waitForRunStopDeliveryClaims（B4 自 session.ts 逐字搬移）——
  /**
   * 投递机的**安全壳 + 串行门**（真机崩溃修复 + L-1 并发修正）：本方法经 `void` fire-and-forget 调用，
   * **绝不允许上抛**（上抛＝未捕获拒绝）；且同项目的多次调用**串行**（见 `drainChains`）——真正的投递
   * 逻辑在 `drainQueueUnsafe`。**F-2-M1 起串行只覆盖「认领段」**：投递开跑（`sendDelivery` 取到 promise）
   * 后链即释放，成功/失败记账在**分离续段**执行（其自身带同款拦截——见 `drainQueueUnsafe` 尾部）。
   */
  /** Host transport barrier only: completion is not native-stop evidence or execution permission. */
  async waitForRunStopDeliveryClaims(input: { projectRoot: string; taskIds: readonly string[]; signal?: AbortSignal; caller?: ActualDispatchSource }): Promise<{ status: "wait-complete"; count: number } | { status: "blocked"; code: string }> {
    const blocked = (code: string) => ({ status: "blocked" as const, code });
    if (input.signal?.aborted) return blocked("run-stop-claim-wait-cancelled");
    if (!input.taskIds.length || input.taskIds.some(taskId => !taskId)) return blocked("run-stop-claim-source-unproven");
    const taskIds = new Set(input.taskIds), current = () => [...this.drainClaimRecords].filter(row => row.projectRoot === input.projectRoot &&
      !(input.caller && row.owner?.entry === input.caller.entry && row.owner.origin === input.caller.origin));
    const observed = current();
    if (observed.some(row => !row.taskIds?.length)) return blocked("run-stop-claim-source-unproven");
    const claims = observed.filter(row => row.taskIds!.some(taskId => taskIds.has(taskId)));
    if (claims.length) {
      const completed = await new Promise<boolean>(resolve => {
        const abort = () => { input.signal?.removeEventListener("abort", abort); resolve(false); };
        input.signal?.addEventListener("abort", abort, { once: true });
        if (input.signal?.aborted) { abort(); return; }
        void Promise.all(claims.map(row => row.done)).then(() => { input.signal?.removeEventListener("abort", abort); resolve(true); });
      });
      if (!completed || input.signal?.aborted) return blocked("run-stop-claim-wait-cancelled");
    }
    const fresh = current();
    if (fresh.some(row => !row.taskIds?.length)) return blocked("run-stop-claim-source-unproven");
    if (fresh.some(row => row.taskIds!.some(taskId => taskIds.has(taskId)))) return blocked("run-stop-claim-source-changed");
    return { status: "wait-complete", count: claims.length };
  }

  // —— drainQueue（B4 自 session.ts 逐字搬移）——
  async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    const key = projectRoot;
    let completeClaim!: () => void;
    const claim: { projectRoot: string; taskIds?: readonly string[]; owner?: ActualDispatchSource; done: Promise<void> } = { projectRoot, done: new Promise<void>(resolve => { completeClaim = resolve; }) };
    this.drainClaimRecords.add(claim);
    const prev = this.drainChains.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainQueueUnsafe(projectRoot, targetRoleId, runtime, claim))
      .catch((err) => {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          "(投递机)",
          `投递机异常已拦截（不产生未捕获拒绝）：${err instanceof Error ? err.message : String(err)}`
        );
      });
    this.drainChains.set(key, next);
    this.publishDeliveryInventory("delivery-claim-queued");
    try {
      await next;
    } finally {
      // 链尾清理（若期间又有新链悬挂在更后面，让新链自己的 finally 收尾——防泄漏）。
      if (this.drainChains.get(key) === next) this.drainChains.delete(key);
      this.drainClaimRecords.delete(claim); completeClaim(); this.publishDeliveryInventory("delivery-claim-settled");
    }
  }

  // —— drainQueueUnsafe（B4 自 session.ts 逐字搬移）——
  /**
   * 尝试投递队首：目标 **忙** → 排队（settled 后按序放行，**绝不并发 send**）；目标 **未开** → **自动开启**再投；
   * 开启/投递失败 → **如实系统行 + 放回队首保留待重试**（下次时机：目标打开 / 下一次入队 / 一轮结束）。
   * 目标为空（回交入队时主入口暂未枚举到）→ 每次尝试重解析主入口；仍无 → 提示一次并保留。
   *
   * **F-2-M1（2026-10-16 客户批准）——链持有收窄到「认领段」**：本方法在**认领段**（读队首/合批 → shift →
   * 形状防御 → 置忙 + 登记 `activeDeliveries` + `delivery.start` → 组装发送载荷 → **调用** `sendDelivery`
   * 取得 promise）内同步完成全部队列/归属改动，随后**立即返回**（链释放）。成功/失败的全部记账
   * （`delivery.end`/`delivery.failed`、去重键释放、失败回队首、忙态复位、如实系统行）移入**分离续段**
   * ——IIFE 内的 try/catch 与旧代码**逐字同体**（含「成功支抛错也落失败支」的逐支语义）；旧实现把链持有
   * 贯穿 `await sendDelivery` 完成＝目标**整轮**结束（真机实测：单链持有 16 分 55 秒，实现者一轮把同项目
   * 测试者的投递整段压住）。续段整段**同步、无 await 断点**，不会与后续认领交错；其内共享状态改动均带
   * 同一性守卫（settled 可能先于 send promise 的续段到达）。**防护逐条保真**（同队列不并发双 drain/双 shift
   * ——认领段仍全在链上；不并发 send 同一会话——`busy=true` 在释放链**之前**同步置位；自动开目标不双开
   * ——`openInternal` 调用仍在认领段内且另有 F-2-opt2 按会话键互斥；失败回队首 + 忙态复位——续段在同一
   * settle 微任务链里同步完成，无中间窗口）。
   *
   * **F-2-opt3（2026-10-16 客户批准）**：认领段起止各记一条诊断（`delivery.claim.start/end`）——下一轮真机
   * 可一眼区分「认领耗时」vs「轮次时长」（本轮 F-2 破案正是靠既有 `delivery.start/end`）。
   */
  async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim: { taskIds?: readonly string[]; owner?: ActualDispatchSource }): Promise<void> {
    const resolvedTarget =
      targetRoleId !== null && targetRoleId !== "" ? targetRoleId : (this.handbackOwnerRoleId(projectRoot) ?? "");
    const key = this.queueKey(projectRoot, resolvedTarget, runtime);
    if (this.deliveryIsStopped(key)) return;
    const lifecycle = this.deliveryLifecycle(key);
    const stopped = () => this.deliveryIsStopped(key) || this.deliveryLifecycle(key) !== lifecycle;
    const q = this.deliveryQueues.get(key);
    if (!q || q.length === 0) return;
    // 2026-10-20 真机（Convener 卡 1h、队列 24 条回交被 system 看护项堵住）：**回交/派发优先于 system**。
    // 认领时跳过 system 看护项、取第一个非 system 条目（回交/派发/客户消息的相对顺序不变——客户消息屏障
    // 语义保留；同类仍按到达序）。只有在队列全是 system 时才投 system。
    const priorityIndex = q.findIndex((i) => i.kind !== "system");
    const headIndex = priorityIndex >= 0 ? priorityIndex : 0;
    const item = q[headIndex];
    // These identities come from the selected transport item, never from the latest role/task.
    const claimTaskId = item.kind === "dispatch" ? item.taskId : item.kind === "system" ? item.systemAssignment?.taskId : undefined;
    claim.taskIds = claimTaskId ? [claimTaskId] : undefined;
    this.publishDeliveryInventory("delivery-claim-assigned");
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId: resolvedTarget });
    if (this.runTaskIsFenced(projectRoot, item.kind === "dispatch" ? item.taskId : item.kind === "system" ? item.systemAssignment?.taskId : undefined, item.kind === "system" ? item.systemAssignment?.runId : undefined)) {
      item.lastAttempt = { state: "blocked", code: "run-stop-host-fenced", at: new Date(this.now()).toISOString() }; return;
    }

    if (resolvedTarget === "") {
      const noteKey = this.queueKey(projectRoot, "", runtime);
      if (!this.suDeliveryBlockedNoted.has(noteKey)) {
        this.suDeliveryBlockedNoted.add(noteKey);
        this.emitDeliveryNote(projectRoot, runtime,
          null,
          item.sourceRoleId,
          mainT("main.session.delivery.noTarget", { kind: item.kind === "handback" ? mainT("main.watchdog.kind.handback") : mainT("ui.events.dispatchTask"), sourceRoleId: item.sourceRoleId })
        );
      }
      return;
    }

    const inspectResume = async (): Promise<boolean> => {
      if (!item.controllerResume) return true;
      const sealed = item.controllerResume;
      const actual = await inspectQueuedControllerResume({ projectRoot, resumeController: sealed.expected, resumeKey: sealed.resumeKey, basisDigest: sealed.basisDigest });
      if (stopped()) return false;
      if (actual.ok && item.taskId === actual.value.taskId && item.flowId === actual.value.flowId && resolvedTarget === "convener") return true;
      const code = actual.ok ? "controller-resume-identity-changed" : actual.code;
      const detail = actual.ok ? "队列任务身份与原运营不一致" : actual.message ?? actual.code;
      item.lastAttempt = { state: "failed", code, at: new Date(this.now()).toISOString() };
      const index = q.indexOf(item); if (index !== -1) q.splice(index, 1); if (!q.length) this.deliveryQueues.delete(key);
      this.activeDispatchKeys.delete(item.dedupKey);
      diagnostic.record("controller.resume.delivery-rejected", { errorCode: code, errorMessage: detail });
      this.emitDeliveryNote(projectRoot, runtime, item.sourceRoleId, "convener", `运营续接未投递：${code}：${detail}。原任务事实保留，请幕僚核对后明确重试；此结果不证明旧执行已停止。`);
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues(); void this.drainQueue(projectRoot, resolvedTarget, runtime);
      return false;
    };
    if (!await inspectResume()) return;
    // Only the exact persisted close receipt can retire its original assignment's notice.
    // This is information already committed by the creator, never another model turn or assignment.
    if (item.kind === "system" && item.systemAssignment && item.notificationSource) {
      const closed = await classifyClosedTaskNotice({ projectRoot, recipientRoleId: resolvedTarget,
        boundTaskId: item.systemAssignment.taskId, operationId: item.notificationSource.operationId,
        source: item.notificationSource });
      if (stopped()) return;
      if (closed.ok) {
        const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        this.deliveredDeliveryKeys.add(`${key}\u0000${item.dedupKey}`);
        this.rememberAppTaskDelivered(item.clientMessageId);
        diagnostic.record("delivery.notice.information-only", { taskId: closed.value.taskId, operationId: closed.value.operationId });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
        void this.drainQueue(projectRoot, resolvedTarget, runtime);
        return;
      }
    }

    // P2（2026-10-30）：离线期间**不认领新的模型投递**——队列保留并标 `blockedReason:"network"`
    // （数据面可见）；恢复后由 `applyNetworkState` 走同一 `drainAllQueuesFor` 继续（不把离线当完成/丢弃）。
    if (this.isNetworkOffline()) {
      diagnostic.record("delivery.blocked", { reasonCode: "network", queueDepth: q.length });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      return;
    }

    let childRequiresCurrentAssignment = false, taskBoundReview = false;
    // **2026-10-29（BUG-5）**：任务在排队期间已完成（已报告/已收口）⇒ 该派发项不得再投递。
    // 完成后的重复投递只记诊断与丢弃队列项，不产生 task.delivered/新一轮事件；不触碰其他条目。
    if (item.kind === "dispatch" && typeof item.taskId === "string" && item.taskId !== "") {
      const record = (await this.readTasks(projectRoot)).records.get(item.taskId);
      childRequiresCurrentAssignment = !!(record?.created?.parentTaskRef || record?.created?.workSourceRef);
      taskBoundReview = record?.created?.reviewBasisRef !== undefined;
      if (record !== undefined && (record.closed !== undefined || !item.controllerResume && record.reports.length > 0)) {
        q.splice(headIndex, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        diagnostic.record("delivery.skip.task-terminal", {
          taskId: item.taskId,
          closed: record.closed !== undefined,
          reports: record.reports.length,
        });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime);
        this.persistDeliveryQueues();
        void this.drainQueue(projectRoot, resolvedTarget, runtime); // 继续处理后续条目（不因丢弃一条而停滞）
        return;
      }
    }

    // **2026-10-25 重复投递修复——重建后续投只重发未投递成功的消息**：同一应用任务（稳定
    // `clientMessageId`）已 ACK/投递成功 ⇒ 队列里残留的同键条目直接丢弃（不重开会话、不再发第二遍）。
    // 显式重新入队（返工同文再派）已在 `enqueueDelivery` 清掉标记，不会走到这里。
    if (isAppTaskClientMessageId(item.clientMessageId) && this.deliveredAppTaskIds.has(item.clientMessageId)) {
      q.splice(headIndex, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      diagnostic.record("delivery.skip.delivered", { state: item.kind, queueDepth: q.length });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      this.persistDeliveryQueues();
      return;
    }

    let pendingControllerAssignment: DeliveryAssignment | undefined;
    const inspectHandbackAssignment = async () => {
      if (item.kind !== "handback" || resolvedTarget !== "convener") return true;
      const members = item.batchItems ?? [item];
      let selected: DeliveryAssignment | undefined;
      let sawFixedChild = false;
      let sawLegacyChild = false;
      let droppedClosedFixed = 0;
      const deliverable: DeliveryItem[] = [];
      // T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交（`task.created.workflowId` 命名空间）只按
      // tasks/workflows 账本事实校验并投递，**不调用** legacy `resolveDeliveryAssignment`（后者要求 child
      // `parentTaskRef`/run，会把 fixed 生产任务回交误判 `delivery-child-source-invalid`）。legacy 子任务
      // （无 workflowId）逐字走下方原解析（旧行为不变）。fixed 校验不通过 ⇒ fail-closed 诊断、不误投。
      // T3 B11.1（2026-11-11，RR6 根因）：fixed 子任务**已收口**（`task.closed`）⇒ 该回交成员是确定终态，
      // 丢弃并继续 drain（诊断 `delivery.skip.fixed-child-closed`；不投递、不阻塞后续条目、不伪造
      // task.delivered/report）。open fixed child 照常投递；legacy 路径逐字不变。
      const childState = await this.readTasks(projectRoot);
      for (const member of members) {
        if (!member.handback?.taskId) {
          diagnostic.record("delivery.blocked", { reasonCode: "delivery-child-source-invalid" });
          return false;
        }
        const childRecord = childState.records.get(member.handback.taskId);
        if (childRecord?.created?.workflowId !== undefined) {
          const verified = await this.inspectFixedHandbackChild(projectRoot, member.handback, resolvedTarget, member.flowId);
          if (stopped()) return false;
          if (!verified.ok) {
            item.lastAttempt = { state: "blocked", code: "fixed-handback-unverifiable", at: new Date(this.now()).toISOString() };
            diagnostic.record("delivery.blocked", { reasonCode: "fixed-handback-unverifiable", taskId: member.handback.taskId, message: verified.message });
            this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, member.handback.roleId,
              `固定任务回交未投递（安全校验未通过，消息已保留）：${verified.message}。`);
            return false;
          }
          if (verified.closed) {
            // B19（2026-11-11，RR14）：已收口 **stage-request** 的回交仍须投递给 chief——幕僚通常在
            // 运营交最终报告前就关闭调度请求；该最终报告是阶段完成/下一阶段的唯一唤醒来源，
            // 丢弃会让工作流停在 A2→A3（RR14 实测）。
            if (childRecord.created.taskKind === "stage-request") {
              diagnostic.record("delivery.deliver.fixed-stage-request-closed", { taskId: verified.taskId, workflowId: verified.workflowId });
            } else {
              // B11.1：已收口 **生产** fixed 子任务 ⇒ 跳过该成员（不投递、不写任何任务事件），
              // 继续处理其余成员/后续队列（RR6 行为不变）。
              droppedClosedFixed += 1;
              diagnostic.record("delivery.skip.fixed-child-closed", { taskId: verified.taskId, workflowId: verified.workflowId });
              continue;
            }
          }
          sawFixedChild = true;
          deliverable.push(member);
          continue;
        }
        sawLegacyChild = true;
        const actual = await resolveDeliveryAssignment({ projectRoot, recipientRoleId: resolvedTarget,
          source: { kind: "child-report", childTaskId: member.handback.taskId, childRoleId: member.handback.roleId },
          ...(member.flowId ? { expectedFlowId: member.flowId } : {}) });
        if (stopped()) return false;
        if (!actual.ok) {
          item.lastAttempt = { state: "blocked", code: actual.code, at: new Date(this.now()).toISOString() };
          diagnostic.record("delivery.blocked", { reasonCode: actual.code, message: actual.message });
          this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, member.handback.roleId,
            `回交当前任务来源不可用，未打开或续投，消息已保留：${actual.code}：${actual.message}`);
          return false;
        }
        if (selected && (selected.taskId !== actual.value.taskId || selected.flowId !== actual.value.flowId || selected.runId !== actual.value.runId)) {
          diagnostic.record("delivery.blocked", { reasonCode: "delivery-assignment-mixed" });
          return false;
        }
        selected = actual.value;
        deliverable.push(member);
      }
      if (droppedClosedFixed > 0) {
        if (deliverable.length === 0) {
          // 整条回交的成员全部是已收口 fixed 子任务 ⇒ 丢弃队列项并继续 drain（不阻塞后续回交）。
          const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
          if (q.length === 0) this.deliveryQueues.delete(key);
          this.notifyRoleState(projectRoot, resolvedTarget, runtime);
          this.persistDeliveryQueues();
          void this.drainQueue(projectRoot, resolvedTarget, runtime); // 继续处理后续条目（不因丢弃一条而停滞）
          return false;
        }
        // 同一批 batchItems 混有 closed/open：只丢 closed 成员，open 成员继续投递（不整批阻塞、不误投）。
        item.batchItems = deliverable;
        const [only] = deliverable;
        if (deliverable.length === 1 && only !== undefined) {
          // 单条剩余：用该成员**入队时定格**的正文/摘要（已收口成员的正文绝不投出）。
          if (typeof only.text === "string" && only.text !== "") item.text = only.text;
          if (typeof only.summary === "string" && only.summary !== "") item.summary = only.summary;
        } else {
          const batchHandbacks = deliverable.map((member) => member.handback).filter((hb): hb is TaskHandback => hb !== undefined);
          if (batchHandbacks.length === deliverable.length) {
            item.text = renderHandbackBatchPrompt(batchHandbacks);
            item.summary = mainT("main.session.delivery.handbackBatch", { count: deliverable.length, roles: deliverable.map((member) => member.sourceRoleId).join("、") });
          }
        }
      }
      if (!sawLegacyChild) {
        // 全部（剩余）成员都是 fixed 子任务：无 legacy assignment（不绑定 run/candidate；目标会话按 B8.1/下方 fixed 重绑）。
        pendingControllerAssignment = undefined;
        return sawFixedChild;
      }
      pendingControllerAssignment = selected;
      return selected !== undefined;
    };
    if (!await inspectHandbackAssignment()) return;
    let entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
    const taskBoundWorker = item.kind === "dispatch" && !!item.taskId && !isBuiltInGovernanceRoleId(resolvedTarget);
    const taskBoundSession = taskBoundWorker || taskBoundReview || pendingControllerAssignment !== undefined;
    const assignedDeliveryId = pendingControllerAssignment?.taskId ?? item.taskId;
    const boundTaskOf = (current: LiveSession | undefined) => current?.boundAssignment?.taskId ?? current?.assignedTaskId;
    const inspectQueuedChild = async () => {
      if (!(taskBoundWorker || childRequiresCurrentAssignment) || !item.taskId) return true;
      // T3 B1（AC-12/AC-23）：fixed 任务（workflowId 命名空间）只认编排 tasks 账本事实
      // （`workflowService.inspectAssignedTask`），不经 legacy trunk 的 run/candidate 绑定；
      // legacy 任务仍走下方原检查（逐字不变）。
      if (await this.isFixedTask(projectRoot, item.taskId)) {
        const fixedAssigned = await inspectWorkflowAssignedTask({ projectRoot, taskId: item.taskId, actorRoleId: resolvedTarget });
        if (fixedAssigned.ok && fixedAssigned.task.open && !fixedAssigned.task.stopped) return true;
        const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        diagnostic.record("delivery.skip.task-unavailable", {
          taskId: item.taskId,
          reasonCode: fixedAssigned.ok ? "task-not-open" : fixedAssigned.code,
          ...(fixedAssigned.ok ? {} : { message: fixedAssigned.message }),
        });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
        return false;
      }
      const assigned = await inspectAssignedTask({ projectRoot, taskId: item.taskId, actorRoleId: resolvedTarget });
      if (assigned.ok) {
        if (!taskBoundWorker) {
          const created = (await this.readTasks(projectRoot)).records.get(item.taskId)?.created;
          if (created?.from === "convener" && !created.reviewBasisRef && created.flowId && created.runId) {
            const checked = await prepareRoleDispatch({ projectRoot, fromRoleId: "convener", targetRoleId: resolvedTarget,
              flowId: created.flowId, runId: created.runId, ...(created.moduleId ? { moduleId: created.moduleId } : {}) });
            if (!checked.ok) { diagnostic.record("delivery.blocked", { taskId: item.taskId, reasonCode: checked.code, message: checked.message }); return false; }
          }
        }
        return true;
      }
      const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      diagnostic.record("delivery.skip.task-unavailable", { taskId: item.taskId, reasonCode: assigned.code, message: assigned.message });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
      return false;
    };
    if (!await inspectQueuedChild()) return;
    // T3 B8.1（2026-11-11，RR3）：投递**固定任务**时自动开启的目标会话同样强制 fixed（与
    // `routeFixedPathDispatch` 同口径：任务账本 `task.created.workflowId` 命名空间）；legacy 任务
    // 不传（旧路径逐字不变）。既有非 fixed 条目也走安全重绑（busy/不可关闭 ⇒
    // `fixed-session-rebind-blocked`，条目保留待重试——绝不把 fixed 任务投进 legacy 会话）。
    // T3 B8.2：回交条目同样按 `handback.taskId` 判定 fixed（重启恢复条目/未登记 `starTaskIds` 时
    // `item.taskId` 可能缺席，回交载荷仍在）——worker→convener 的 fixed 回交目标会话同样 forced fixed。
    const deliveryFixedTaskId = item.taskId !== undefined && item.taskId !== ""
      ? item.taskId
      : item.kind === "handback" ? item.handback?.taskId : undefined;
    const forcedDeliveryMode: WorkflowMode | undefined =
      deliveryFixedTaskId !== undefined && await this.isFixedTask(projectRoot, deliveryFixedTaskId) ? "fixed" : undefined;
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed **派发**条目（dispatch）的
    // `taskId` 是目标角色本次真实受派任务——自动打开/重绑时传入（会话 `assignedTaskId` 与 run-role
    // `input.taskId`，`submit_report` 关联的来源）。已打开但未绑定本次任务（聊天/上一任务）⇒ 安全重绑。
    // 回交条目的 `taskId` 是**子任务**（创建者要收口的对象，不是目标会话自己的受派任务），不用于会话
    // 绑定（误绑会让创建者自己的报告关联到子任务）；B8.2 的 forced fixed 重绑照旧。
    const fixedOpenTaskId = forcedDeliveryMode === "fixed" && item.kind === "dispatch"
      && typeof item.taskId === "string" && item.taskId !== "" ? item.taskId : undefined;
    const needsFixedRebind = forcedDeliveryMode === "fixed" && entry !== undefined && entry.projectRoot === projectRoot &&
      entry.sessionWorkflowMode !== "fixed";
    const needsFixedTaskBind = fixedOpenTaskId !== undefined && entry !== undefined && entry.projectRoot === projectRoot
      && entry.sessionWorkflowMode === "fixed" && boundTaskOf(entry) !== fixedOpenTaskId;
    // 目标忙且尚未绑定本次任务 ⇒ 保持排队（settle 后重试再安全重开）；绝不把任务投进未绑定/别的任务的会话。
    if (entry?.busy && (taskBoundSession && boundTaskOf(entry) !== assignedDeliveryId || needsFixedTaskBind)) return;
    if (stopped()) return;
    if (!entry || entry.projectRoot !== projectRoot || taskBoundSession && boundTaskOf(entry) !== assignedDeliveryId || needsFixedRebind || needsFixedTaskBind) {
      // 2026-11-05（真机缺陷「又卡住」）：生产宿主（Interface）把 `demoRuntimeAutoDeliver` 置 false ⇒
      // **演示运行时（demo）不自动开会话**。demo 适配器执行内置演示脚本（对 `src/evil.ts` 的越界写，
      // 用于演示"写前被拒"），自动唤醒只会得到被门禁拒绝的回合，失败结果再经回交/派发级联成 blocked
      // （重启后持久队列里的历史 demo 项会连锁触发）。demo 仅供用户显式体验：只投给已打开的 demo 会话；
      // 未打开则保持排队（不丢消息、不自动开启）。缺省 true 保持测试/演示宿主既有语义。
      if (runtime === "demo" && this.deps.demoRuntimeAutoDeliver === false) {
        diagnostic.record("delivery.skip.demo-not-opened", { state: item.kind, targetRoleId: resolvedTarget, queueDepth: q.length });
        return;
      }
      // 目标会话**未开**（或属于别的项目/需 fixed 重绑/未绑定本次任务）→ 自动开启再投（su=治理主入口；
      // 派发目标=被派角色）。后台开启（`userInitiated=false`）：**不抢活动角色**。
      // B8.1/B10.1：固定派发条目携带 taskId + forced fixed（legacy 任务不传）。
      const openTaskId = taskBoundSession ? assignedDeliveryId : fixedOpenTaskId;
      const opened = await this.openInternal({ projectRoot, roleId: resolvedTarget, runtime,
        ...(openTaskId !== undefined ? { taskId: openTaskId } : {}),
        ...(forcedDeliveryMode !== undefined ? { forcedWorkflowMode: forcedDeliveryMode } : {}) }, false);
      if (!opened.ok) {
        item.lastAttempt = { state: "blocked", code: "unknown", at: new Date(this.now()).toISOString() };
        this.emitDeliveryNote(projectRoot, runtime,
          item.kind === "handback" ? resolvedTarget : item.sourceRoleId,
          item.sourceRoleId,
          item.kind === "handback"
            ? mainT("main.session.delivery.openFailedHandback", { sourceRoleId: item.sourceRoleId, target: resolvedTarget, detail: opened.error ?? mainT("shared.common.unknownReason") })
            : mainT("main.session.delivery.openFailedDispatch", { sourceRoleId: item.sourceRoleId, target: resolvedTarget, detail: opened.error ?? mainT("shared.common.unknownReason") })
        );
        return;
      }
      entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      this.suDeliveryBlockedNoted.delete(this.queueKey(projectRoot, "", runtime));
    }
    if (stopped() || !entry || entry.projectRoot !== projectRoot) return; // 停止或仍不可用：保持排队
    this.healStaleOrigin(entry, "stale-origin-before-drain");
    if (entry.busy || entry.origins.running !== undefined || (runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
      diagnostic.record("delivery.blocked", { reasonCode: "target-busy", queueDepth: q.length });
      return;
    }

    // O-1：投递前查边界快照——陈旧 ⇒ 先作废重建（投递落到新边界会话上；失败则队列保留待重试）。
    const rebuilt = await this.rebuildIfBoundaryStale(this.sessionKey(projectRoot, resolvedTarget, runtime), false);
    if (rebuilt !== undefined) {
      if (!rebuilt.reopened.ok) return; // 队列保留（下次时机自动重试；失败已有如实一行）
      entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      if (!entry || entry.projectRoot !== projectRoot) return; // 防御：重开后仍不可用
    }
    // **P0 turn lease 复核（2026-10-30）**：上面的忙判据在 `await rebuildIfBoundaryStale` 之前读取——
    // 该 await 期间另一条路径可能已开跑（busy/origin 置位）。认领前必须**再验一次**，否则会覆盖
    // 正在运行回合的 origins.running（现场「失败回交覆盖 origin → turn.end 后 busy 不复位」根因类）。
    this.healStaleOrigin(entry, "stale-origin-after-rebuild");
    if (entry.busy || entry.origins.running !== undefined) {
      diagnostic.record("delivery.blocked", { reasonCode: "target-busy", queueDepth: q.length });
      return;
    }

    if (!await inspectQueuedChild() || !await inspectHandbackAssignment() || !await inspectResume()) return;
    if (stopped() || this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime)) !== entry || entry.busy || entry.origins.running !== undefined ||
        entry.interactionState.lifetime.signal.aborted) return;

    // —— F-2-opt3：认领段开始（自此到 claim.end 之间的同步改动都在串行链内；随后链即释放）——
    diagnostic.record("delivery.claim.start", { state: item.kind, queueDepth: q.length });
    // 仅回交主人队首连续回交合批；客户消息/派发是屏障，正文仍由编排唯一生成。
    // B 批：幕僚的星形工作结果也合批（渲染用 `renderWorkReportBatchPrompt`，`[工作结果]` 固定字段）。
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const handbackOwner = this.handbackOwnerRoleId(projectRoot);
    let batchCount = 1;
    // v2.0.0 B8 回归修复：合批目标 = **回交主人**（single=`primaryRoleId`/trio=Convener）**或**幕僚
    // chief——与 `e71501c` 之前一致；该提交把 `handbackOwner` 分支误删为仅 chief（注释与渲染分支仍按
    // 两者写），导致单模型（su）队首连续回交逐条投递、队列不清空。owner 未枚举到 ⇒ 只按 chief 判。
    const batchesForHandbackOwner = handbackOwner !== null && resolvedTarget === handbackOwner;
    if (headIndex === 0 && (batchesForHandbackOwner || resolvedTarget === chiefRoleId) && item.kind === "handback" && item.handback && !item.deliveryId) {
      while (batchCount < q.length && q[batchCount].kind === "handback" && q[batchCount].handback) batchCount += 1;
    }
    let text = item.text;
    let summary = item.summary;
    if (batchCount > 1) {
      const batchHandbacks = q.slice(0, batchCount).map((queued) => queued.handback as TaskHandback);
      text = resolvedTarget === chiefRoleId && chiefRoleId !== null
        ? renderWorkReportBatchPrompt(batchHandbacks)
        : renderHandbackBatchPrompt(batchHandbacks);
      summary = mainT("main.session.delivery.handbackBatch", { count: batchCount, roles: q.slice(0, batchCount).map((queued) => queued.sourceRoleId).join("、") });
    }
    const removedItems = q.splice(headIndex, batchCount);
    const sentItems = item.deliveryId && item.batchItems ? [...item.batchItems] : removedItems;
    const selectedClaimTasks = sentItems.map(row => row.kind === "dispatch" ? row.taskId : row.kind === "system" ? row.systemAssignment?.taskId : row.kind === "handback" ? row.handback?.taskId : undefined);
    claim.taskIds = selectedClaimTasks.every((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0) ? [...new Set(selectedClaimTasks)] : undefined;
    this.publishDeliveryInventory("delivery-claim-selected");
    const sent: DeliveryItem = item.deliveryId ? item : { ...sentItems[0], text, summary, batchItems: sentItems, ...(item.kind === 'handback' ? { deliveryId: randomUUID() } : {}) };
    if (q.length === 0) this.deliveryQueues.delete(key);
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // L-1：出队即外推（队列行/徽标随之更新）
    // 形状防御（真机崩溃修复的姊妹项）：条目坏了就**不投**——如实一行，绝不把 undefined 喂给 send。
    if (!sent || typeof sent.text !== "string" || sent.text === "") {
      this.emitDeliveryNote(projectRoot, runtime,
        sent && typeof sent.sourceRoleId === "string" ? sent.sourceRoleId : null,
        "(投递机)",
        mainT("main.session.delivery.malformedItem")
      );
      diagnostic.record("delivery.claim.end", { state: item.kind, count: batchCount });
      this.persistDeliveryQueues(); // 2026-10-20：坏条目已丢弃，持久态同步（不留幽灵 in-flight）
      return;
    }
    // 先置忙再 await（防「open 尾部放行」与本次调用竞态导致并发 send）；失败则复位。
    const origin = this.beginDeliveryOrigin(entry, sent.clientMessageId);
    if (origin === undefined) {
      // turn lease 争用（防御分支：同步段内不应发生）——**放回队首**，绝不覆盖正在运行的 origin。
      q.unshift(...removedItems);
      this.deliveryQueues.set(key, q);
      diagnostic.record("delivery.blocked", { reasonCode: "turn-lease-busy", queueDepth: q.length });
      diagnostic.record("delivery.claim.end", { state: item.kind, count: batchCount });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      this.persistDeliveryQueues();
      return;
    }
    // 收尾推进（2026-10-18）：把本轮的投递类别/流程 id/回交证据定格在 origin 上——settle 后据此决定
    // 是否请 Interface 检查「流程全部完成」。多流程批次保留集合；客户消息/系统消息无 flowId。
    origin.kind = sent.kind;
    const originFlows = [...new Set(sentItems.map((queued) => queued.flowId).filter((id): id is string => typeof id === "string" && id !== ""))];
    if (originFlows.length > 0) origin.flowIds = originFlows;
    if (sent.kind === "handback") {
      origin.handbackEvidence = [
        ...new Set(sentItems.flatMap((queued) => queued.handback?.evidence ?? []).filter((item): item is string => typeof item === "string" && item !== "")),
      ].slice(0, 10);
    }
    entry.interactionState.turn = new AbortController();
    claim.owner = { entry, origin };
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准）
    entry.lastTurnAborted = undefined; // 新一轮开始：上一轮的中止标记不再适用于本轮
    this.activeDeliveries.set(key, sent); // 与 busy 同时登记；settled/失败/dispose 精确撤销。
    this.persistDeliveryQueues(); // 2026-10-20：认领即记 in-flight（崩溃重启后重投；delivery.end 后移除）
    diagnostic.record("delivery.start", { count: batchCount, queueDepth: q.length, state: sent.kind });
    // G-2/W3：drain 出队投出 = 真实活动（重武装）；`kind:"system"`（看护自身投递）不记（同 enqueueDelivery 口径）。
    if (sent.kind !== "system") this.noteWatchdogActivity(projectRoot, "delivery-claim");
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 状态准确性：投递开跑即外推「工作中」（shift 时快照尚为闲）
    let deliveryCommit: { key: string; value: { done: Promise<void>; finish: () => void } } | undefined;
    if (sent.kind === "dispatch" && sent.taskId) {
      let finish!: () => void;
      const value = { done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() };
      const taskKey = `${projectRoot}\u0000${sent.taskId}`;
      this.taskDeliveryCommits.set(taskKey, value); deliveryCommit = { key: taskKey, value };
    }
    // —— F-2-M1：分离续段（**不再持有串行链**）——IIFE 同步执行到 `await this.sendDelivery(...)` 即挂起，
    // 本方法随后返回（链释放）。try/await/catch 与旧实现**逐字同体**：成功支抛错同样落失败支（逐支等价）。
    void (async () => {
      try {
      // P0-1：入队定格载荷与真实条目来源一起投递；图片数组保持原引用。
      let sendOptions = sent.opts;
      if (sent.kind === 'handback') {
        const members = sent.batchItems ?? [sent];
        const snapshots = members.map(m => m.report);
        const liveViews = members.map(m => m.liveReport ?? (m.report ? { source: m.report.source, taskId: m.report.taskId, origin: m.report.origin, status: m.report.status, summary: m.report.summary, evidence: m.report.evidence, evidenceOmitted: m.report.evidenceOmitted, at: m.report.at } : undefined));
        if (snapshots.every((r): r is RuntimeReportSnapshotV1 => !!r) || liveViews.every((r): r is RuntimeLiveReportViewV1 => !!r)) {
          sent.attemptId = randomUUID();
          const identity = { deliveryId: sent.deliveryId!, attemptId: sent.attemptId, target: { roleId: resolvedTarget, runtime } };
          sendOptions = { ...sent.opts,
            ...(snapshots.every((r): r is RuntimeReportSnapshotV1 => !!r) ? { inputProvenance: { version: 1, kind: 'handback', ...identity, reports: snapshots } as RuntimeInputProvenanceV1 } : { inputPresentation: { version: 1, kind: 'handback-live', durability: members.some(m => m.liveDurability === 'unknown-live') ? 'unknown-live' : 'memory-only', ...identity, reports: liveViews } as RuntimeLiveHandbackPresentationV1 }),
            onDeliveryProgress: progress => {
              if (this.sessions.get(key) === entry) this.rememberReceipt(entry!, progress.receipt);
              sent.opts?.onDeliveryProgress?.(progress);
            } };
        }
      }
      await this.sendDelivery(entry, origin, sent.text, sendOptions, sent.kind === "dispatch", sent.taskId,
        sent.kind === "handback" ? sentItems.flatMap(member => member.handback?.taskId ? [{ childTaskId: member.handback.taskId,
          childRoleId: member.handback.roleId, ...(member.flowId ? { flowId: member.flowId } : {}) }] : []) : undefined,
        sent.kind === "system" ? sent.systemAssignment ?? null : undefined,
        sent.kind === "system" && sent.notificationSource !== undefined, sent.controllerResume);
      // P0（2026-10-30）：settle 收尾可能已先行记账（`terminalRecorded`）——终态诊断恰一次。
      if (sent.terminalRecorded !== true) {
        sent.terminalRecorded = true;
        diagnostic.record("delivery.end", { ok: true, count: batchCount, state: sent.kind });
        // 2026-10-20 重启续跑：投递成功（delivery.end）即从持久队列移除——崩溃重启不重投已完成项。
        this.deliveredDeliveryKeys.add(`${key}\u0000${sent.dedupKey}`);
        // 2026-10-25：应用任务投递成功 ⇒ 记「已投递」（重建续投/应用侧同任务调用不再发第二遍）。
        this.rememberAppTaskDelivered(sent.clientMessageId);
      }
      this.persistDeliveryQueues();
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 立即外推（running 行即时可见）
      if (sent.kind === "dispatch") this.activeDispatchKeys.delete(sent.dedupKey); // 送达即释放窗口去重（返工可再派）
      // B 批：任务送达事件（仅星形任务携带 taskId；旧 flow 派发不写 tasks.jsonl）。
      if (sent.kind === "dispatch" && typeof sent.taskId === "string" && sent.taskId !== "") {
        // BUG-5：发送期间任务已完成（已报告/已收口）⇒ 不再补写 delivered（重复投递只留诊断）。
        const latest = (await this.readTasks(projectRoot)).records.get(sent.taskId);
        const terminal = latest !== undefined && (latest.closed !== undefined || latest.reports.length > 0);
        if (terminal) {
          diagnostic.record("tasks.delivered.suppressed-terminal", {
            taskId: sent.taskId,
            closed: latest?.closed !== undefined,
            reports: latest?.reports.length ?? 0,
          });
        } else {
          // durability（发布竞态修复）：投递成功后先落盘 task.delivered，再继续通知/收尾——
          // 观察者读到「适配器已接收」时，任务的已投递状态应已可读（不改变“投递异步”的队列语义）。
          await this.appendTaskState(projectRoot, taskEvent("task.delivered", {
            taskId: sent.taskId,
            to: resolvedTarget,
          }, () => new Date(this.now())));
          await this.appendRoleActivity(projectRoot, resolvedTarget, {
            kind: "task.delivered",
            summary: `收到任务 #${sent.taskId}`,
            taskId: sent.taskId,
            status: "delivered",
          });
        }
      }
      deliveryCommit?.value.finish();
      if (sent.kind === "handback") {
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, mainT("main.session.delivery.autoDelivered", { roles: sentItems.map((queued) => queued.sourceRoleId).join("、"), target: resolvedTarget }));
      } else if (sent.kind === "dispatch") {
        // 派发成功：目标 pane 看得见"任务到货"，派发主人的 pane 有一条受理回执行（受理≠已完成，如实）。
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, mainT("main.session.delivery.receivedDispatch", { role: this.roleDisplayName(projectRoot, sent.sourceRoleId) }));
        this.emitDeliveryNote(projectRoot, runtime, sent.sourceRoleId, sent.sourceRoleId, mainT("main.session.delivery.dispatchedNote", { target: this.roleDisplayName(projectRoot, resolvedTarget) }));
      }
      // message 类（排队后的客户消息投递）：**不加额外文案**——消息本体随会话事件出现（真实 pi 的
      // 「用户指令：」回显走注入样式行），此前误落进派发分支（「已接收…派发任务」对消息是错口径，已修）。
    } catch (err) {
      const lastAttempt = { state: "failed" as const, code: origin.assignmentRejectionCode ?? "unknown", at: new Date(this.now()).toISOString() };
      sent.lastAttempt = lastAttempt;
      for (const member of sentItems) member.lastAttempt = lastAttempt;
      // P0（2026-10-30）：终态已由 settle 收尾记账（`delivery.end` phase:"turn-settled"）⇒ 本续段不再重复
      // delivery.failed、也不再回队重投（at-most-once；回合已真实跑完）。
      const terminalRecorded = sent.terminalRecorded === true;
      if (!terminalRecorded) {
        if (sent.kind === 'handback') diagnostic.record('delivery.failed', { count: batchCount, state: sent.kind });
        else diagnostic.error("delivery.failed", err, { count: batchCount, state: sent.kind });
      }
      const receipt = err instanceof RuntimeDeliveryError ? err.receipt : sent.attemptId ? this.attemptStates.get(this.persistenceKey(this.persistenceScope(entry), sent.attemptId))?.receipt : undefined;
      if (receipt) this.rememberReceipt(entry, receipt);
      const cAttempt = sent.kind === 'handback' && !!sent.attemptId;
      // **2026-10-25 重复投递修复：已 ACK 的不再按「未投递」重试**。
      // `origin.turnId` 由运行时**同步开轮回执**（onTurnStarted）绑定；`inputAccepted` 是 prompt-input
      // 真实回显。任一成立 ⇒ 输入已交给运行时，失败（如会话在收尾窗口被重建 dispose）不得回队重投，
      // 否则同一任务会在重建后以第二条 user 消息再出现（客户真机缺陷）。未 ACK 的失败仍按既有语义
      // 放回队首保留重试（失败重试仍允许）；回交保留 receipt 判据（providerMayHaveStarted）不变。
      // P0：settle 已记 `delivery.end` ⇒ 视为已处理（更不允许重投）。
      const acked = origin.turnId !== undefined || origin.inputAccepted === true || terminalRecorded;
      const canRetry = terminalRecorded || sent.controllerResume && origin.assignmentRejectionCode ? false : cAttempt
        ? !!receipt && !receipt.providerMayHaveStarted && receipt.retryDeliveryAllowed
        : !acked;
      const mayBeActive = terminalRecorded ? false : cAttempt && (!receipt || receipt.providerMayHaveStarted);
      const ownsRunningDelivery = entry.origins.running === origin;
      if (!mayBeActive) this.failDeliveryOrigin(entry, origin);
      // 投递失败：**如实提示 + 放回队首**（保持顺序）待重试——绝不静默丢。
      const en = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      if (en === entry && ownsRunningDelivery && !mayBeActive) {
        en.interactionState.turn.abort();
        en.busy = false;
        en.busySince = undefined;
      }
      if (this.activeDeliveries.get(key) === sent && !mayBeActive) this.activeDeliveries.delete(key);
      const waiting = this.deliveryQueues.get(key) ?? q;
      if (canRetry) {
        waiting.unshift(...(sent.kind === 'handback' ? [sent] : sentItems));
        this.deliveryQueues.set(key, waiting);
      }
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 放回队首：队列快照恢复（如实）
      // 2026-10-20 重启续跑：失败重试项保持 queued（下次重启可再重投）；清除可能残留的「已完成」标记。
      // 2026-10-25：已 ACK 的失败**不重投** ⇒ 记「已完成」键（持久快照排除该在途项；重启也不重投）。
      if (canRetry) {
        this.deliveredDeliveryKeys.delete(`${key}\u0000${sent.dedupKey}`);
      } else if (acked) {
        this.deliveredDeliveryKeys.add(`${key}\u0000${sent.dedupKey}`);
        this.rememberAppTaskDelivered(sent.clientMessageId);
      }
      this.persistDeliveryQueues();
      if (terminalRecorded) {
        // 回合已完成、终态已记账：不再向 pane 发「投递失败/保留重试」的错误口径系统行。
        return;
      }
      const base = sent.kind === "handback" && cAttempt ? !canRetry ? mainT("main.session.delivery.maybeProcessed") : mainT("main.session.delivery.retained") : err instanceof Error ? err.message : String(err);
      // 已 ACK 的非回交失败：如实说明「可能已处理，未自动重发」——绝不沿用「已保留待重试」的假话。
      const ackedNote = `${base}——${mainT("main.session.delivery.maybeProcessed")}`;
      this.emitDeliveryNote(projectRoot, runtime,
        sent.kind === "handback" ? resolvedTarget : sent.sourceRoleId,
        sent.sourceRoleId,
        sent.kind === "handback"
          ? (cAttempt
              ? mainT("main.session.delivery.handbackFailedShort", { sourceRoleId: sent.sourceRoleId, detail: base })
              : mainT("main.session.delivery.handbackFailed", { sourceRoleId: sent.sourceRoleId, detail: base }))
          : acked
            ? ackedNote
            : sent.kind === "dispatch"
              ? mainT("main.session.delivery.dispatchFailed", { target: resolvedTarget, detail: base })
              : sent.kind === "system"
                ? mainT("main.session.delivery.systemFailed", { target: resolvedTarget, detail: base })
                : mainT("main.session.delivery.queuedFailed", { target: resolvedTarget, detail: base })
      );
    } finally {
      if (deliveryCommit) {
        deliveryCommit.value.finish();
        if (this.taskDeliveryCommits.get(deliveryCommit.key) === deliveryCommit.value) this.taskDeliveryCommits.delete(deliveryCommit.key);
      }
    }
    })().catch((err) => {
      // 与 drainQueue 安全壳同款：续段已脱离链，其抛错必须**就地**拦截——绝不产生未捕获拒绝
      // （旧实现里该抛错由 drainQueue 的 catch 收口；F-2-M1 后续段在链外，等价物移到这里）。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        "(投递机)",
        mainT("main.session.delivery.machineryException", { detail: err instanceof Error ? err.message : String(err) })
      );
    });
    diagnostic.record("delivery.claim.end", { state: sent.kind, count: batchCount });
  }

}
