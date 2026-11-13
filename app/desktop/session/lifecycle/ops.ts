// app/desktop/session/lifecycle/ops.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B7、附录 A lifecycle 组）：32 个方法自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动（仅声明行 `private ` 前缀移除——模块内 public 仅为门面委托可调用；
// 门面保留同名同签名同可见性的薄委托）。类外壳重建原 receiver 面：
//  · 本文件使用到的跨方法/跨模块调用以同名同签名薄包装指向 `LifecycleHost`（方法体文本保持
//    `this.<name>(...)` 原样；包装为运行期直转发，不加异步层）；
//  · 状态字段（方案 §3.6 的 11 个 lifecycle 字段）与只读引用经宿主访问器暴露（同一实例，无第二份状态）。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import { createHash, randomUUID } from "node:crypto";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import { readRoleCapabilityProtectionScope, inspectRoleSessionOpenFailure, registerVersionedDocumentAfterWrite } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { OrchestrationEvent, HandbackEvent } from "../../../../src/common/编排/handback.ts";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../../src/common/shared/diagnostics.ts";
import { formatDurationMs, type WatchdogObservation, type WatchdogProjectSnapshot } from "../../watchdog.ts";
import { mainT } from "../../i18n.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  InternalSessionOpenRequest, ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget,
  OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult,
  WithdrawResult, RebuildSessionResult, RedeliverResult, DeliveryAssignment, DeliveryOrigin,
  ActualDispatchSource, ControllerDisposalLease, LiveSession, ControllerResumeDelivery, DeliveryItem,
  PersistedDeliveryItemV1, DeliveryQueueRestoreReport, InstallationCapabilityTool,
  InstallationEffectRefusalObservation, DesktopSessionInventoryFact, DesktopRunStopFact,
  DesktopControllerStopFact, DesktopProjectExecutionInventory,
} from "../contracts/session-types.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import {
  desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory,
  desktopSessionManagers as inventorySessionManagers,
  type SessionInventoryState,
} from "../shared/inventory.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import {
  handbackOwnerRoleId, chiefTaskRoleIdOf, dispatcherRoleIdOf, resolveProofFlowIds,
  findListingForFeedback, roleDisplayName, refreshListingNow,
} from "../shared/roles.ts";
import { Evidence } from "../evidence.ts";
import { beginSessionDisposeLease, buildFixedTaskGitSurface, createTurnGitRuntime, endSessionDisposeLease, gitContextFailure, noteSessionDisposeInterruption } from "../git-ports.ts";
import type { LifecycleHost, LifecycleManagerPeer } from "./host.ts";
import type { ObservedHandleRecord } from "./state.ts";

/** 管理器注册表（与 barrel/run-change 同一单例 Set；元素为门面实例，见 host.LifecycleManagerPeer）。 */
const desktopSessionManagers = inventorySessionManagers as unknown as Set<LifecycleManagerPeer>;

export class LifecycleOps {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

  private get activeDeliveries(): Map<string, DeliveryItem> { return this.host.activeDeliveries; }
  private get activeRoleId(): string | null { return this.host.activeRoleId; }
  private set activeRoleId(value: string | null) { this.host.activeRoleId = value; }
  private get attemptStates(): Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }> { return this.host.attemptStates; }
  private get boundaryRefreshVersion(): number { return this.host.boundaryRefreshVersion; }
  private set boundaryRefreshVersion(value: number) { this.host.boundaryRefreshVersion = value; }
  private get deferredRunChanges(): Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }> { return this.host.deferredRunChanges; }
  private get deliveryKeyStopVersions(): Map<string, number> { return this.host.deliveryKeyStopVersions; }
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.host.deliveryQueues; }
  private get deliveryStopVersion(): number { return this.host.deliveryStopVersion; }
  private set deliveryStopVersion(value: number) { this.host.deliveryStopVersion = value; }
  private get deliveryStoppedAll(): boolean { return this.host.deliveryStoppedAll; }
  private set deliveryStoppedAll(value: boolean) { this.host.deliveryStoppedAll = value; }
  private get inventoryPublicationErrors(): Map<string, string> { return this.host.inventoryPublicationErrors; }
  private get observedHandleIds(): WeakMap<RoleSessionHandle, string> { return this.host.observedHandleIds; }
  private get observedHandles(): Map<string, ObservedHandleRecord> { return this.host.observedHandles; }
  private get profileRevisions(): Map<RuntimeKind, number> { return this.host.profileRevisions; }
  private get rebuildChains(): Map<string, Promise<void>> { return this.host.rebuildChains; }
  private get reportStates(): Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }> { return this.host.reportStates; }
  private get resumedDeliveryKeys(): Set<string> { return this.host.resumedDeliveryKeys; }
  private get runChangeOperations(): Map<string, { plan: RunChangeHostPlan; controller: AbortController }> { return this.host.runChangeOperations; }
  private get selectionTargetRoleId(): string | null { return this.host.selectionTargetRoleId; }
  private set selectionTargetRoleId(value: string | null) { this.host.selectionTargetRoleId = value; }
  private get selectionVersion(): number { return this.host.selectionVersion; }
  private set selectionVersion(value: number) { this.host.selectionVersion = value; }
  private get sessions(): Map<string, LiveSession> { return this.host.sessions; }
  private get stoppedDeliveryKeys(): Set<string> { return this.host.stoppedDeliveryKeys; }
  private appTaskClientMessageId(...args: Parameters<LifecycleHost["appTaskClientMessageId"]>): ReturnType<LifecycleHost["appTaskClientMessageId"]> { return this.host.appTaskClientMessageId(...args); }
  private appTaskClientMessageIdFromSeed(...args: Parameters<LifecycleHost["appTaskClientMessageIdFromSeed"]>): ReturnType<LifecycleHost["appTaskClientMessageIdFromSeed"]> { return this.host.appTaskClientMessageIdFromSeed(...args); }
  private drainQueue(...args: Parameters<LifecycleHost["drainQueue"]>): ReturnType<LifecycleHost["drainQueue"]> { return this.host.drainQueue(...args); }
  private findListingForFeedback(...args: Parameters<LifecycleHost["findListingForFeedback"]>): ReturnType<LifecycleHost["findListingForFeedback"]> { return this.host.findListingForFeedback(...args); }
  private finishStopPersistence(...args: Parameters<LifecycleHost["finishStopPersistence"]>): ReturnType<LifecycleHost["finishStopPersistence"]> { return this.host.finishStopPersistence(...args); }
  private forceResetDeliveryState(...args: Parameters<LifecycleHost["forceResetDeliveryState"]>): ReturnType<LifecycleHost["forceResetDeliveryState"]> { return this.host.forceResetDeliveryState(...args); }
  private inventoryChanged(...args: Parameters<LifecycleHost["inventoryChanged"]>): ReturnType<LifecycleHost["inventoryChanged"]> { return this.host.inventoryChanged(...args); }
  private notifyRoleState(...args: Parameters<LifecycleHost["notifyRoleState"]>): ReturnType<LifecycleHost["notifyRoleState"]> { return this.host.notifyRoleState(...args); }
  private now(...args: Parameters<LifecycleHost["now"]>): ReturnType<LifecycleHost["now"]> { return this.host.now(...args); }
  private openInternal(...args: Parameters<LifecycleHost["openInternal"]>): ReturnType<LifecycleHost["openInternal"]> { return this.host.openInternal(...args); }
  private openInternalUnsafe(...args: Parameters<LifecycleHost["openInternalUnsafe"]>): ReturnType<LifecycleHost["openInternalUnsafe"]> { return this.host.openInternalUnsafe(...args); }
  private persistDeliveryQueues(...args: Parameters<LifecycleHost["persistDeliveryQueues"]>): ReturnType<LifecycleHost["persistDeliveryQueues"]> { return this.host.persistDeliveryQueues(...args); }
  private persistenceScope(...args: Parameters<LifecycleHost["persistenceScope"]>): ReturnType<LifecycleHost["persistenceScope"]> { return this.host.persistenceScope(...args); }
  private queueKey(...args: Parameters<LifecycleHost["queueKey"]>): ReturnType<LifecycleHost["queueKey"]> { return this.host.queueKey(...args); }
  private queueRebuildWritePermitsNotice(...args: Parameters<LifecycleHost["queueRebuildWritePermitsNotice"]>): ReturnType<LifecycleHost["queueRebuildWritePermitsNotice"]> { return this.host.queueRebuildWritePermitsNotice(...args); }
  private send(...args: Parameters<LifecycleHost["send"]>): ReturnType<LifecycleHost["send"]> { return this.host.send(...args); }
  private sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return this.host.sessionKey(...args); }
  private targetKey(...args: Parameters<LifecycleHost["targetKey"]>): ReturnType<LifecycleHost["targetKey"]> { return this.host.targetKey(...args); }

  // —— openObservedRoleSession（B7 自 session.ts 逐字搬移）——
  async openObservedRoleSession(input: Parameters<SessionManagerDeps["openRoleSession"]>[0], deps: Parameters<SessionManagerDeps["openRoleSession"]>[1]): Promise<RoleSessionHandle> {
    const hostHandleId = randomUUID();
    const fact: DesktopSessionInventoryFact = { hostHandleId, projectRoot: input.project.projectRoot, roleId: input.roleId,
      runtime: input.runtime ?? "demo", kind: input.chiefDecisionContext ? "bounded-chief" : "role", phase: "creating", errors: [],
      ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.project.documentContext?.runId ? { runId: input.project.documentContext.runId } : {}) };
    const record: { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle } = { fact };
    // Core's prepared bind is the sole owner of the native session-open admission lease.
    // Publish pending construction before entering Pipeline; this row is not a safety permit.
    this.observedHandles.set(hostHandleId, record); this.inventoryChanged(fact.projectRoot, "session-creating");
    try {
      if (this.inventoryPublicationErrors.has(fact.projectRoot)) throw new Error("会话库存登记失败，会话尚未创建。请检查诊断后重试。");
      const handle = await this.deps.openRoleSession(input, deps); record.handle = handle; fact.phase = "live";
      this.observedHandleIds.set(handle, hostHandleId); this.inventoryChanged(fact.projectRoot, "session-created");
      if (this.inventoryPublicationErrors.has(fact.projectRoot)) throw new Error("会话库存登记失败，无法接纳该会话。请检查诊断。");
      return handle;
    } catch (error) {
      fact.phase = "open-failed"; fact.errors.push("partial-construction-closure-unproven");
      try {
        const ref = await inspectRoleSessionOpenFailure({ error, hostHandleId });
        if (ref !== undefined) fact.openFailureRef = ref;
      } catch {
        // Evidence lookup failure must not replace the actual failed-open error or create authority.
        try { createDiagnosticLogger({ component: "desktop.session", projectRoot: fact.projectRoot, roleId: fact.roleId })
          .record("session.open.failure-ref.unavailable", { reasonCode: "pipeline-lookup-failed" }); } catch { /* preserve the original error */ }
      }
      if (record.handle) {
        try { await record.handle.dispose(); fact.phase = "disposed"; }
        catch { fact.phase = "dispose-failed"; fact.errors.push("failed-admission-disposal-unproven"); }
      }
      this.inventoryChanged(fact.projectRoot, "session-open-failed"); throw error;
    }
  }

  // —— ownsControllerDisposal（B7 自 session.ts 逐字搬移）——
  ownsControllerDisposal(handle: RoleSessionHandle, lease: ControllerDisposalLease): boolean {
    const id = this.observedHandleIds.get(handle), fact = id ? this.observedHandles.get(id)?.fact : undefined;
    return !!id && !!fact && lease.projectRoot === fact.projectRoot && lease.kind === "session-dispose" && !!lease.operationId && lease.hostHandleIds.includes(id) &&
      [...desktopSessionManagers].some(manager => manager.controllerDisposalOwners.has(lease));
  }

  // —— disposeObservedHandle（B7 自 session.ts 逐字搬移）——
  async disposeObservedHandle(handle: RoleSessionHandle, heldLease?: ControllerDisposalLease): Promise<void> {
    const id = this.observedHandleIds.get(handle), record = id === undefined ? undefined : this.observedHandles.get(id);
    const root = record?.fact.projectRoot;
    if (heldLease && !this.ownsControllerDisposal(handle, heldLease)) throw new Error("controller-stop-dispose-owner-unproven");
    const lease = root && !heldLease ? beginSessionDisposeLease(root) : undefined;
    if (root && lease && !lease.ok) noteSessionDisposeInterruption(root, handle.sessionId);
    if (record) { record.fact.phase = "disposing"; this.inventoryChanged(record.fact.projectRoot, "session-disposing"); }
    try { await handle.dispose(); if (record) record.fact.phase = "disposed"; }
    catch (error) { if (record) { record.fact.phase = "dispose-failed"; record.fact.errors.push("disposal-unproven"); } throw error; }
    finally {
      if (record) this.inventoryChanged(record.fact.projectRoot, "session-dispose-observed");
      if (root && lease?.ok) {
        const ended = endSessionDisposeLease(root, lease.leaseId);
        if (!ended.ok) throw new Error("会话处置协调未能完成，请检查诊断。");
      }
    }
  }

  // —— disposeEntry（B7 自 session.ts 逐字搬移）——
  async disposeEntry(roleId: string, entry: LiveSession, heldLease?: ControllerDisposalLease): Promise<string | null> {
    if (heldLease && !this.ownsControllerDisposal(entry.handle, heldLease)) return "controller-stop-dispose-owner-unproven";
    if (!heldLease) recordGitHostInterruption({ projectRoot: entry.projectRoot, reason: "desktop-session-revoked", coreSessionId: entry.handle.sessionId });
    this.inventoryChanged(entry.projectRoot, "session-revocation-requested");
    if (this.sessions.get(roleId) !== entry) return null; // TOCTOU 防误删（见方法注释）
    for (const [id, deferred] of this.deferredRunChanges) if (deferred.entry === entry) {
      deferred.controller.abort(); this.deferredRunChanges.delete(id); this.runChangeOperations.delete(deferred.plan.planId);
    }
    try { entry.unsubscribePersistence?.(); } catch { /* closing a presenter cannot retain a stale handle */ }
    for (const [key, state] of this.reportStates) if (state.owner === entry) {
      if (state.state?.retryAvailable) {
        const reportId = key.slice(key.lastIndexOf('\0') + 1);
        state.state = { state: 'expired', reportId, code: 'SNAPSHOT_EXPIRED', retryAvailable: false };
        try { this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change: { kind: 'report-save', scope: { roleId: entry.roleId, runtime: entry.runtime }, reportId, state: state.state } }); } catch { /* display observers do not prevent disposal */ }
      }
      state.owner = undefined; state.event = undefined;
    }
    for (const state of this.attemptStates.values()) if (state.owner === entry) {
      if (state.receipt.retryHistoryAvailable) {
        state.receipt = { ...state.receipt, retryHistoryAvailable: false };
        try { this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change: { kind: 'delivery-history-save', scope: { roleId: entry.roleId, runtime: entry.runtime }, attemptId: state.receipt.attemptId, state: 'expired', receipt: state.receipt, retryAvailable: false, code: 'SNAPSHOT_EXPIRED' } }); } catch { /* display observers do not prevent disposal */ }
      }
      state.owner = undefined;
    }
    this.sessions.delete(roleId);
    // W6-B：会话被释放 ⇒ 等待者按「未等到 settle」结算（不悬挂、不误判为写入完成）。
    const settleWaiters = entry.settleWaiters;
    entry.settleWaiters = undefined;
    for (const finish of settleWaiters ?? []) finish(false);
    if (this.activeRoleId === roleId) this.activeRoleId = null;
    this.activeDeliveries.delete(this.queueKey(entry.projectRoot, entry.roleId, entry.runtime)); // 会话没了，「进行中」不再成立
    // 2026-10-20 重启续跑：会话释放后内存态变化同步落盘（未投的队列项仍如实保留）。
    this.persistDeliveryQueues();
    // 状态准确性：dispose 即真实信号（会话已移出保活表，busy 判据随之恒 false）——外推快照，
    // 徽标/队列行随之转「已停止」；**不删其投递队列**（未投的待办仍如实保留可见）。
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    this.noteWatchdogActivity(entry.projectRoot, "session-close"); // G-2/W3：会话关 = 真实活动
    entry.origins.byTurn.clear();
    delete entry.origins.running;
    // **「替我审」会话级上下文销毁即清**（PM 评审 §8.1/§十一）：turnText 与判断闭包都不跨会话残留。
    entry.lastUserText = undefined;
    entry.shellJudge = undefined;
    entry.governanceJudge = undefined;
    entry.interactionState.lifetime.abort();
    entry.interactionState.turn.abort();
    // 2026-11-04 下载申请（F2/R2）：会话结束 await B1 每会话运行时 dispose（幂等；中止在途下载、
    // 释放本项目执行槽）。失败只记诊断，不阻断会话释放。
    if (entry.downloadRuntime !== undefined) {
      const downloadRuntime = entry.downloadRuntime;
      entry.downloadRuntime = undefined;
      try {
        await downloadRuntime.dispose();
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).error(
          "download.runtime.dispose.failed",
          error,
        );
      }
    }
    try {
      await this.disposeObservedHandle(entry.handle, heldLease);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  // —— evictBeyondLimit（B7 自 session.ts 逐字搬移）——
  async evictBeyondLimit(keepRoleId?: string): Promise<void> {
    while (this.sessions.size > this.host.maxLiveSessions) {
      let oldestId: string | null = null;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [id, s] of this.sessions) {
        if (s.busy) continue; // 正在跑轮次的不淘汰（暂超限等它 settled——绝不静默掐断后台任务）
        if (keepRoleId !== undefined && id === keepRoleId) continue; // 正在开启的那一个也不淘汰
        if (this.isPrimarySession(s)) continue; // 产品（Lead）常驻：不按容量淘汰
        if (s.lastUsed < oldestUsed) {
          oldestUsed = s.lastUsed;
          oldestId = id;
        }
      }
      if (oldestId === null) return; // 无可回收者（全忙 / 只剩刚开启的）：暂超限（settled 后下一时机再收）
      const entry = this.sessions.get(oldestId);
      if (!entry) return;
      await this.disposeEntry(oldestId, entry);
    }
  }

  // —— isPrimarySession（B7 自 session.ts 逐字搬移）——
  isPrimarySession(entry: LiveSession): boolean {
    const listing = this.findListingForFeedback(entry.projectRoot);
    return typeof listing?.primaryRoleId === "string" && listing.primaryRoleId !== "" && entry.roleId === listing.primaryRoleId;
  }

  // —— activeEntry（B7 自 session.ts 逐字搬移）——
  activeEntry(): LiveSession | undefined {
    return this.activeRoleId !== null ? this.sessions.get(this.activeRoleId) : undefined;
  }

  // —— observeWatchdog（B7 自 session.ts 逐字搬移）——
  observeWatchdog(projectRoot: string, observation: WatchdogObservation): void {
    try {
      this.deps.watchdogObserver?.(projectRoot, observation);
    } catch {
      // 看护观察失败 = 无看护（fail-safe toward 现状），不记录也不上抛（回调自身已带诊断）。
    }
  }

  // —— noteWatchdogActivity（B7 自 session.ts 逐字搬移）——
  noteWatchdogActivity(projectRoot: string, reason: string): void {
    if (!projectRoot) return;
    this.observeWatchdog(projectRoot, { kind: "activity", reason });
  }

  // —— profileRevision（B7 自 session.ts 逐字搬移）——
  profileRevision(runtime: RuntimeKind): number { return this.profileRevisions.get(runtime) ?? 0; }

  // —— profileChanged（B7 自 session.ts 逐字搬移）——
  profileChanged(runtime: RuntimeKind): number {
    const revision = this.profileRevision(runtime) + 1;
    this.profileRevisions.set(runtime, revision);
    return revision;
  }

  // —— hasBusyRuntime（B7 自 session.ts 逐字搬移）——
  hasBusyRuntime(runtime: RuntimeKind): boolean { return [...this.sessions.values()].some((entry) => entry.runtime === runtime && entry.busy); }

  // —— hasStaleProfile（B7 自 session.ts 逐字搬移）——
  hasStaleProfile(runtime: RuntimeKind): boolean { return [...this.sessions.values()].some((entry) => entry.runtime === runtime && entry.profileRevision !== this.profileRevision(runtime)); }

  // —— liveSessionViews（B7 自 session.ts 逐字搬移）——
  liveSessionViews(): { projectRoot: string; roleId: string; runtime: RuntimeKind; profileRevision: number }[] {
    return [...this.sessions.values()].map((entry) => ({ projectRoot: entry.projectRoot, roleId: entry.roleId, runtime: entry.runtime, profileRevision: entry.profileRevision }));
  }

  // —— openBackground（B7 自 session.ts 逐字搬移）——
  async openBackground(req: SessionOpenRequest): Promise<OpenResult> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
    diagnostic.record("session.open-background.start");
    let result: OpenResult;
    try {
      result = await this.openInternal(req, false);
    } catch (error) {
      diagnostic.error("session.open-background.failed", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    diagnostic.record("session.open-background.end", { ok: result.ok });
    if (!result.ok) diagnostic.error("session.open-background.failed", new Error(result.error || "后台会话开启失败"));
    return result;
  }

  // —— sendBackground（B7 自 session.ts 逐字搬移）——
  async sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string; clientMessageId?: string; identitySeed?: string; stableIdentity?: boolean; kind?: "system" }): Promise<SendResult> {
    const clientMessageId =
      input.clientMessageId ??
      (input.stableIdentity === false
        ? undefined
        : input.identitySeed !== undefined
          ? this.appTaskClientMessageIdFromSeed(input.identitySeed)
          : this.appTaskClientMessageId(input.projectRoot, input.roleId, input.runtime, input.text));
    return this.send(
      input.text,
      undefined,
      { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
      { background: true, ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(clientMessageId !== undefined ? { clientMessageId } : {}) },
    );
  }

  // —— isRoleBusy（B7 自 session.ts 逐字搬移）——
  isRoleBusy(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.busy === true;
  }

  // —— hasLiveSession（B7 自 session.ts 逐字搬移）——
  hasLiveSession(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.has(this.sessionKey(projectRoot, roleId, runtime));
  }

  // —— wasLastTurnAborted（B7 自 session.ts 逐字搬移）——
  wasLastTurnAborted(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.lastTurnAborted === true;
  }

  // —— hasPendingDelivery（B7 自 session.ts 逐字搬移）——
  hasPendingDelivery(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    const key = this.queueKey(projectRoot, roleId, runtime);
    const queue = this.deliveryQueues.get(key);
    return (queue !== undefined && queue.length > 0) || this.activeDeliveries.has(key);
  }

  // —— waitForRoleSettle（B7 自 session.ts 逐字搬移）——
  waitForRoleSettle(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    timeoutMs = 60_000,
  ): Promise<boolean> {
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!entry || entry.busy !== true) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (settled: boolean): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        entry.settleWaiters?.delete(finish);
        if (entry.settleWaiters !== undefined && entry.settleWaiters.size === 0) entry.settleWaiters = undefined;
        resolve(settled);
      };
      const timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));
      (entry.settleWaiters ??= new Set()).add(finish);
    });
  }

  // —— waitForRoleIdle（B7 自 session.ts 逐字搬移）——
  waitForRoleIdle(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    timeoutMs = 60_000,
  ): Promise<boolean> {
    const key = this.sessionKey(projectRoot, roleId, runtime);
    const queueKey = this.queueKey(projectRoot, roleId, runtime);
    const deadline = Date.now() + Math.max(1, timeoutMs);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (idle: boolean): void => {
        if (done) return;
        done = true;
        clearInterval(timer);
        resolve(idle);
      };
      const check = (): void => {
        const entry = this.sessions.get(key);
        if (!entry) {
          finish(false); // 会话被释放：没有可等待的轮次，如实失败。
          return;
        }
        const queue = this.deliveryQueues.get(queueKey);
        const idle = entry.busy !== true && (queue === undefined || queue.length === 0);
        if (idle) {
          finish(true);
          return;
        }
        if (Date.now() >= deadline) finish(false);
      };
      const timer = setInterval(check, 50);
      check();
    });
  }

  // —— abort（B7 自 session.ts 逐字搬移）——
  async abort(target: string | SessionTarget): Promise<RoleSessionAbortResult> {
    const key = this.targetKey(target);
    let entry: LiveSession | undefined;
    if (key !== undefined) entry = this.sessions.get(key);
    const roleId = entry?.roleId ?? "";
    if (!entry) {
      return { ok: false, supported: false, error: mainT("main.session.stopNoSession", { roleId }) };
    }
    // 契约：消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回 supported:false 同一处理。
    if (entry.handle.abort === undefined) {
      return { ok: false, supported: false, error: mainT("main.session.stopUnsupported") };
    }
    try {
      // 中止标记（链式治理推进的早失败护栏）：被请求中止 ≠ 正常结束——链路继续轮询等下一次投递/重试。
      recordGitHostInterruption({ projectRoot: entry.projectRoot, reason: "desktop-turn-abort-requested", coreSessionId: entry.handle.sessionId });
      this.inventoryChanged(entry.projectRoot, "turn-abort-requested");
      entry.lastTurnAborted = true;
      entry.interactionState.turn.abort();
      const result = await entry.handle.abort();
      // **P0 手动停止解楔（2026-10-30 现场：10+ 次停止 ~1ms ok 但零变化）**：停止入口必须能强制复位
      // 投递层楔死（origin/busy/activeDeliveries）并让队列继续；`handle.abort` 已如实返回成功才能这样做
      // （不支持/失败 ⇒ 不假装已停）。这里**不伪造 turn**：只复位投递层状态并记 `turn.abort.forced`。
      if (result.ok === true) this.forceResetDeliveryState(entry, "abort-requested");
      return result;
    } catch (err) {
      return { ok: false, supported: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // —— stop（B7 自 session.ts 逐字搬移）——
  async stop(target?: string | SessionTarget | null): Promise<StopResult> {
    let roleId: string | undefined;
    if (target !== undefined && target !== null) roleId = this.targetKey(target);
    if (target && roleId === undefined) return this.finishStopPersistence({ ok: false, note: mainT("main.session.stopNoMatch") });
    for (const manager of desktopSessionManagers) for (const operation of manager.runChangeOperations.values()) {
      const members = operation.plan.handles.filter(member => this.observedHandles.has(member.hostHandleId));
      if (manager !== this.host.manager && !members.length) continue;
      if (!roleId || members.some(member => { const row = this.observedHandles.get(member.hostHandleId)!;
        return this.sessionKey(operation.plan.projectRoot, member.roleId, row.fact.runtime) === roleId; })) operation.controller.abort();
    }
    // Fence before the first await, even if no live entry remains after a failed open.
    if (roleId) {
      this.stoppedDeliveryKeys.add(roleId); this.resumedDeliveryKeys.delete(roleId);
      this.deliveryKeyStopVersions.set(roleId, (this.deliveryKeyStopVersions.get(roleId) ?? 0) + 1);
    } else {
      ++this.deliveryStopVersion; this.deliveryStoppedAll = true; this.resumedDeliveryKeys.clear();
    }
    createDiagnosticLogger({ component: "desktop.session", roleId: roleId ?? undefined }).record("session.stop", { count: this.sessions.size });
    if (typeof roleId !== "string" || roleId === "" || roleId === this.selectionTargetRoleId) {
      ++this.selectionVersion;
      this.selectionTargetRoleId = null;
    }
    // 重建会暂时移出条目。等已在途的链收尾后再释放，避免关闭遗漏重建中的句柄。
    if (typeof roleId === "string" && roleId !== "") {
      await this.rebuildChains.get(roleId);
    } else {
      ++this.boundaryRefreshVersion;
      await Promise.all([...this.rebuildChains.values()]);
    }
    if (typeof roleId === "string" && roleId !== "") {
      const entry = this.sessions.get(roleId);
      if (!entry) {
        return this.finishStopPersistence({ ok: false, note: mainT("main.session.releaseNoSession", { roleId }) });
      }
      const err = await this.disposeEntry(roleId, entry);
      return this.finishStopPersistence(err === null
        ? { ok: true, note: mainT("main.session.releasedRole", { roleId }) }
        : { ok: false, note: mainT("main.session.releaseError", { detail: String(err) }) });
    }
    if (this.sessions.size === 0) {
      return this.finishStopPersistence({ ok: false, note: mainT("main.session.noOpenSessions") });
    }
    const n = this.sessions.size;
    let firstError: string | null = null;
    for (const id of [...this.sessions.keys()]) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      const err = await this.disposeEntry(id, entry);
      if (err !== null && firstError === null) firstError = err;
    }
    if (firstError !== null) return this.finishStopPersistence({ ok: false, note: mainT("main.session.releaseError", { detail: String(firstError) }) });
    return this.finishStopPersistence({ ok: true, note: n === 1 ? mainT("main.session.closed") : mainT("main.session.closedAll", { count: n }) });
  }

  // —— isOpen（B7 自 session.ts 逐字搬移）——
  isOpen(): boolean {
    return this.sessions.size > 0;
  }

  // —— openForRoleId（B7 自 session.ts 逐字搬移）——
  openForRoleId(): string | null {
    return this.activeEntry()?.roleId ?? null;
  }

  // —— liveRoleIds（B7 自 session.ts 逐字搬移）——
  liveRoleIds(): string[] {
    return [...new Set([...this.sessions.values()].map((entry) => entry.roleId))];
  }

  // —— findLiveRuntime（B7 自 session.ts 逐字搬移）——
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(`${projectRoot}\u0000${roleId}\u0000`) && entry.projectRoot === projectRoot && entry.roleId === roleId) return entry.runtime;
    }
    return undefined;
  }

  // —— ensureFreshRoleSession（B7 自 session.ts 逐字搬移）——
  async ensureFreshRoleSession(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<{ ok: boolean; rebuilt: boolean; error?: string }> {
    const key = this.sessionKey(projectRoot, roleId, runtime);
    const entry = this.sessions.get(key);
    if (entry === undefined) return { ok: true, rebuilt: false };
    const deadline = this.now() + 5000;
    while (entry.busy && this.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.sessions.get(key) !== entry) return { ok: true, rebuilt: false };
    if (entry.busy) return { ok: false, rebuilt: false, error: "目标会话仍在运行，未能建立 fresh 会话" };
    const rebuilt = await this.rebuildSession({ projectRoot, roleId, runtime });
    return rebuilt.ok ? { ok: true, rebuilt: true } : { ok: false, rebuilt: false, error: rebuilt.error ?? "fresh 会话重建失败" };
  }

  // —— rebuildSession（B7 自 session.ts 逐字搬移）——
  async rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> {
    const key = this.targetKey(target);
    if (key === undefined) return { ok: false, error: mainT("main.session.recoveryNoMatch") };
    const prev = this.rebuildChains.get(key) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildSessionUnsafe(key, beforeDispose));
    const tail = run.then(() => undefined, () => undefined);
    this.rebuildChains.set(key, tail);
    void tail.then(() => {
      if (this.rebuildChains.get(key) === tail) this.rebuildChains.delete(key);
    });
    return await run;
  }

  // —— rebuildSessionUnsafe（B7 自 session.ts 逐字搬移）——
  async rebuildSessionUnsafe(key: string, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> {
    const entry = this.sessions.get(key);
    if (!entry) return { ok: false, error: mainT("main.session.recoveryNoSession") };
    if (entry.busy) return { ok: false, error: mainT("main.session.recoveryBusy") };
    if (beforeDispose && !(await beforeDispose(entry))) return { ok: false, error: "调用来源或执行范围已变化，未刷新目标会话。" };
    if (this.sessions.get(key) !== entry || entry.busy) return { ok: false, error: mainT("main.session.recoveryConcurrent") }; // TOCTOU
    const { projectRoot, roleId, runtime } = entry;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
    diagnostic.record("session.rebuild.start", { state: "manual" });
    await this.disposeEntry(key, entry);
    this.deps.emitEvent({
      roleId, projectRoot, runtime,
      event: { kind: "message", summary: mainT("main.session.rebuiltByRecovery", { roleId }) },
    });
    const selectionVersion = this.selectionVersion;
    const reopened = await this.openInternalUnsafe({ projectRoot, roleId, runtime, ...((entry.boundAssignment?.taskId ?? entry.assignedTaskId) ? { taskId: entry.boundAssignment?.taskId ?? entry.assignedTaskId } : {}) }, true, selectionVersion, true);
    if (reopened.ok) {
      this.queueRebuildWritePermitsNotice(key); // 入参＝会话键
      void this.drainQueue(projectRoot, roleId, runtime);
    }
    diagnostic.record("session.rebuild.end", { ok: reopened.ok, state: "manual" });
    if (!reopened.ok) return { ok: false, error: reopened.error ?? "重开失败" };
    return {
      ok: true,
      resumed: reopened.resumed,
      ...(reopened.contextSource !== undefined ? { contextSource: reopened.contextSource } : {}),
      ...(reopened.contextWarning !== undefined ? { contextWarning: reopened.contextWarning } : {}),
    };
  }

  // —— isCustomerInitiatedTurn（B7 自 session.ts 逐字搬移）——
  isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean {
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!entry || entry.busy !== true) return false;
    const origin = entry.origins.running;
    return origin !== undefined && !origin.settled && origin.kind === "message";
  }
}
