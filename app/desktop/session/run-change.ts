// app/desktop/session/run-change.ts
// B5（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B5、附录 A run-change 组）：run 停止栅栏、精确控制器停止、执行库存事实（L2，
// feature 白名单 []）。
// 9 个类方法（runTaskIsFenced/selectRunChangeForHandle/completeTeamPlanForHandle/ownedRunStopMembers/
// executeOwnedRunStop/resumeDeferredRunChanges/executionInventoryFacts/controllerProducerFacts/
// stopExactController）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原
// receiver 面——
//  · 方案 §3.6 run-change 的 10 个状态字段**由本模块单 owner 持有并创建**（RunChangeState）；门面仅保留
//    同一实例访问器（测试 cast 与未迁出的生命周期方法按原名访问），不造第二份状态；
//  · `observedInventoryRoots`/`inventoryPublicationErrors` 仍经 `shared/inventory.ts` 的
//    `SessionInventoryState` 访问（同一 Set/Map 实例，无第二份状态）；
//  · 跨实例协调经 `shared/inventory.ts` 的同一管理器注册表（同进程各 SessionManager 的结构化只读面）；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*；delivery 尚未迁出的方法（waitForRunStopDeliveryClaims/
//    finishStopPersistence/deliveryQueuePersistenceFacts）经门面同名委托（manager.*，L2 不导入 L3 delivery）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L2 run-change 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。
// 源码钉子兼容：`ownedRunStopMembers`/`executeOwnedRunStop`/`resumeDeferredRunChanges` 三条方法声明前保留
// 注明原 `private` 声明文本的定位注释（chief-workflow 顺序钉按方法边界切片；断言语义不变）。

import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import { isRuntimeSessionDrained } from "../../../src/model/runtime.ts";
import type { CompleteTeamPlanFn, SelectRunChangeFn } from "../../../src/model/runtime.ts";
import { beginGitHostAction, endGitHostAction, finalizeControllerStop, finalizeRunChange, inspectAssignedTask, prepareControllerStop, prepareRunChange, type RunChangeHostPlan } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { ActualDispatchSource, ControllerDisposalLease, DeliveryOrigin, DeliveryQueuePersistenceFacts, DesktopControllerStopFact, DesktopProjectExecutionInventory, DesktopRunStopFact, DesktopSessionInventoryFact, LiveSession, StopResult } from "./contracts/session-types.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { now } from "./shared/clock.ts";
import type { TerminateRoleRunInput, TerminateRoleRunResult } from "./contracts/tasks.ts";
import { sessionKey } from "./shared/keys.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { appendRoleActivity } from "./shared/tasks-store.ts";
import { desktopSessionManagers as inventorySessionManagers, inventoryChanged, type SessionInventoryState } from "./shared/inventory.ts";

/** 队列认领记录的只读形状（原 `drainClaimRecords` 元素的最小子集；类型来源 delivery/queue，L2 不导入 L3）。 */
interface DrainClaimRow {
  projectRoot: string;
  taskIds?: readonly string[];
  owner?: ActualDispatchSource;
}

/**
 * run-change 模块单 owner 的状态（方案 §3.6 run-change 的 10 个字段）。
 * 前 8 项由本模块创建；后 2 项（inventoryPublicationErrors/observedInventoryRoots）是
 * `shared/inventory.ts` 的 `SessionInventoryState` 访问的**同一实例**（不得双写）。
 */
export interface RunChangeState {
  runStopGeneration: number;
  readonly fencedRunTasks: Map<string, Set<string>>;
  readonly fencedRuns: Map<string, Set<string>>;
  readonly runStopFacts: Map<string, { projectRoot: string; fact: DesktopRunStopFact }>;
  readonly controllerStopFacts: Map<string, { projectRoot: string; fact: DesktopControllerStopFact }>;
  readonly controllerDisposalOwners: Set<ControllerDisposalLease>;
  readonly deferredRunChanges: Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>;
  readonly runChangeOperations: Map<string, { plan: RunChangeHostPlan; controller: AbortController }>;
  readonly inventoryPublicationErrors: Map<string, string>;
  readonly observedInventoryRoots: Set<string>;
}

/** run-change 方法读取的跨模块只读状态面（同一实例；延迟取值，两阶段装配）。 */
export interface RunChangeRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  observedHandles: ReadonlyMap<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>;
  openChains: ReadonlyMap<string, Promise<void>>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
  managerId: string;
  deliveryQueues(): ReadonlyMap<string, import("./contracts/session-types.ts").DeliveryItem[]>;
  activeDeliveries(): ReadonlyMap<string, import("./contracts/session-types.ts").DeliveryItem>;
  drainClaimRecords(): ReadonlySet<DrainClaimRow>;
  taskDeliveryCommits(): ReadonlyMap<string, { done: Promise<void>; finish: () => void }>;
  taskHandbackCommits(): ReadonlyMap<string, Promise<void>>;
}

/** 尚未迁出（B5 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface RunChangePorts {
  deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts;
}

/** 同进程其他 SessionManager 暴露给 run-change 的结构化只读面（与门面同一实例；跨实例协调用）。 */
interface RunChangePeer {
  managerId: string;
  observedHandles: ReadonlyMap<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>;
  openChains: ReadonlyMap<string, Promise<void>>;
  sessions: ReadonlyMap<string, LiveSession>;
  deliveryStoreArmed: boolean;
  deliveryPersistSeq: number;
  fencedRunTasks: Map<string, Set<string>>;
  fencedRuns: Map<string, Set<string>>;
  runStopGeneration: number;
  runStopFacts: Map<string, { projectRoot: string; fact: DesktopRunStopFact }>;
  controllerStopFacts: Map<string, { projectRoot: string; fact: DesktopControllerStopFact }>;
  controllerDisposalOwners: Set<ControllerDisposalLease>;
  inventoryPublicationErrors: ReadonlyMap<string, string>;
  taskDeliveryCommits: Map<string, { done: Promise<void>; finish: () => void }>;
  taskHandbackCommits: Map<string, Promise<void>>;
  runChangeOperations: Map<string, { plan: RunChangeHostPlan; controller: AbortController }>;
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory, "sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops">;
  inventoryChanged(projectRoot: string, reason: string): void;
  ownsControllerDisposal(handle: RoleSessionHandle, lease: ControllerDisposalLease): boolean;
  disposeObservedHandle(handle: RoleSessionHandle, heldLease?: ControllerDisposalLease): Promise<void>;
  disposeEntry(roleId: string, entry: LiveSession, heldLease?: ControllerDisposalLease): Promise<string | null>;
  waitForRunStopDeliveryClaims(input: { projectRoot: string; taskIds: readonly string[]; signal?: AbortSignal; caller?: ActualDispatchSource }): Promise<{ status: "wait-complete"; count: number } | { status: "blocked"; code: string }>;
  finishStopPersistence(result: StopResult): Promise<StopResult>;
  controllerProducerFacts(projectRoot: string, taskId: string, caller: ActualDispatchSource): DesktopControllerStopFact["knownProducers"] | undefined;
}

/** 管理器注册表的 run-change 强类型视图（与 shared/inventory 单例同一 Set 实例）。 */
const desktopSessionManagers = inventorySessionManagers as unknown as Set<RunChangePeer>;

/** run 停止栅栏、精确控制器停止、执行库存事实（原 SessionManager 9 方法的同签名实现）。 */
export class RunChange {
  readonly state: RunChangeState;
  private readonly refs: RunChangeRefs;
  private readonly port: RunChangePorts;
  private readonly deps: SessionManagerDeps;
  constructor(refs: RunChangeRefs, port: RunChangePorts, deps: SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
    this.state = {
      runStopGeneration: 0,
      fencedRunTasks: new Map<string, Set<string>>(),
      fencedRuns: new Map<string, Set<string>>(),
      runStopFacts: new Map<string, { projectRoot: string; fact: DesktopRunStopFact }>(),
      controllerStopFacts: new Map<string, { projectRoot: string; fact: DesktopControllerStopFact }>(),
      controllerDisposalOwners: new Set<ControllerDisposalLease>(),
      deferredRunChanges: new Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>(),
      runChangeOperations: new Map<string, { plan: RunChangeHostPlan; controller: AbortController }>(),
      inventoryPublicationErrors: new Map<string, string>(),
      observedInventoryRoots: new Set<string>(),
    };
  }

  /* 原实例状态的本类视图（同一对象；方案 §3.6 单 owner）。 */
  private get runStopGeneration(): number { return this.state.runStopGeneration; }
  private set runStopGeneration(value: number) { this.state.runStopGeneration = value; }
  private get fencedRunTasks(): Map<string, Set<string>> { return this.state.fencedRunTasks; }
  private get fencedRuns(): Map<string, Set<string>> { return this.state.fencedRuns; }
  private get runStopFacts(): Map<string, { projectRoot: string; fact: DesktopRunStopFact }> { return this.state.runStopFacts; }
  private get controllerStopFacts(): Map<string, { projectRoot: string; fact: DesktopControllerStopFact }> { return this.state.controllerStopFacts; }
  private get controllerDisposalOwners(): Set<ControllerDisposalLease> { return this.state.controllerDisposalOwners; }
  private get deferredRunChanges(): Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }> { return this.state.deferredRunChanges; }
  private get runChangeOperations(): Map<string, { plan: RunChangeHostPlan; controller: AbortController }> { return this.state.runChangeOperations; }
  private get inventoryPublicationErrors(): Map<string, string> { return this.state.inventoryPublicationErrors; }
  private get observedInventoryRoots(): Set<string> { return this.state.observedInventoryRoots; }

  /* 跨模块只读状态（同一实例；延迟取值）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get observedHandles(): ReadonlyMap<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }> { return this.refs.observedHandles; }
  private get openChains(): ReadonlyMap<string, Promise<void>> { return this.refs.openChains; }
  private get managerId(): string { return this.refs.managerId; }
  private get deliveryQueues(): ReadonlyMap<string, import("./contracts/session-types.ts").DeliveryItem[]> { return this.refs.deliveryQueues(); }
  private get activeDeliveries(): ReadonlyMap<string, import("./contracts/session-types.ts").DeliveryItem> { return this.refs.activeDeliveries(); }
  private get drainClaimRecords(): ReadonlySet<DrainClaimRow> { return this.refs.drainClaimRecords(); }
  private get taskDeliveryCommits(): ReadonlyMap<string, { done: Promise<void>; finish: () => void }> { return this.refs.taskDeliveryCommits(); }
  private get taskHandbackCommits(): ReadonlyMap<string, Promise<void>> { return this.refs.taskHandbackCommits(); }
  private deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts { return this.port.deliveryQueuePersistenceFacts(); }

  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 run-change 单 owner）。 */
  get inventoryState(): SessionInventoryState {
    return { observedInventoryRoots: this.state.observedInventoryRoots, inventoryPublicationErrors: this.state.inventoryPublicationErrors };
  }
  inventoryChanged(projectRoot: string, reason: string): void { inventoryChanged(projectRoot, reason, this.inventoryState); }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private now(): number { return now(this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.refs.lastRoleActivity, now: () => this.now() });
  }
  // —— runTaskIsFenced（B5 自 session.ts 逐字搬移）——
  runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean {
    return !!(taskId && this.fencedRunTasks.get(projectRoot)?.has(taskId) || runId && this.fencedRuns.get(projectRoot)?.has(runId));
  }

  // —— selectRunChangeForHandle（B5 自 session.ts 逐字搬移）——
  async selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<SelectRunChangeFn>> => ({ ok: false, status: "blocked",
      operationId: request.operationId, runId: request.runId, baseDigest: request.expectedPinDigest, targetDigest: null, errorCode, message });
    const key = this.sessionKey(projectRoot, "rapporteur", runtime), entry = this.sessions.get(key), origin = entry?.origins.running;
    const current = () => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry && entry.origins.running === origin &&
      entry.busy && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || !origin.turnId || !handle?.sessionId || signal?.aborted)
      return blocked("run-change-source-unavailable", "缺少当前真实受派策划回合，未改变运行状态。");
    const pendingKey = `${handle.sessionId}\u0000${origin.turnId}\u0000${request.operationId}`;
    if (this.deferredRunChanges.has(pendingKey)) return blocked("run-stop-deferred", "同一运行变更正在等待本轮真实结束，未重复执行。");
    const prepared = await prepareRunChange({ projectRoot, request, requesterTaskId: origin.taskId });
    if (!prepared.ok) return blocked(prepared.code, prepared.message);
    if (!current() || signal?.aborted || prepared.value.requesterCoreSessionId !== handle.sessionId || prepared.value.requesterTurnId !== origin.turnId)
      return blocked("run-change-source-changed", "准备期间真实发起回合已变化，未停止运行。");
    const plan = prepared.value, owners = this.ownedRunStopMembers(plan);
    if (!owners.ok) return blocked(owners.code, owners.message);
    const controller = new AbortController(); this.runChangeOperations.set(plan.planId, { plan, controller });
    // Fence exact old task/run producers before allowing another dispatch or prompt; no other run is suspended.
    for (const [manager, members] of owners.groups) {
      const tasks = manager.fencedRunTasks.get(projectRoot) ?? new Set<string>();
      for (const taskId of plan.taskIds) tasks.add(taskId);
      manager.fencedRunTasks.set(projectRoot, tasks);
      const runs = manager.fencedRuns.get(projectRoot) ?? new Set<string>(); runs.add(plan.runId); manager.fencedRuns.set(projectRoot, runs);
      const fact: DesktopRunStopFact = { managerId: manager.managerId, operationId: plan.operationId, runId: plan.runId, requestDigest: plan.requestDigest,
        generation: ++manager.runStopGeneration, state: "fenced", hostHandleIds: members.map(row => row.member.hostHandleId), targetSeq: manager.deliveryPersistSeq };
      manager.runStopFacts.set(`${projectRoot}\u0000${plan.operationId}`, { projectRoot, fact });
      manager.inventoryChanged(projectRoot, "run-stop-producers-fenced");
    }
    if (plan.deferred) {
      this.deferredRunChanges.set(pendingKey, { plan, entry: entry!, origin, controller });
      return blocked("run-stop-deferred", "已保留同一操作；本轮真实结束后由宿主继续停止，当前尚未提交运行变更。");
    }
    try { return await this.executeOwnedRunStop(plan, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal); }
    finally { this.runChangeOperations.delete(plan.planId); }
  }

  // —— completeTeamPlanForHandle（B5 自 session.ts 逐字搬移）——
  /**
   * W6（团队计划登记 run 绑定，B1 AC-6/P-12）：与 `selectRunChangeForHandle` 同款「当前真实回合」校验——
   * 只信当前 busy 的受派 convener 回合的 `origin.taskId`，经 `inspectAssignedTask` 取该任务的实际 run
   * 并注入 `runId`；模型自报 runId 只作断言（不一致 ⇒ 既有 service 码 `plan-run-conflict`）。
   * inspect 失败直通其原码（`trunk-item-invalid`，不重写）；仅宿主本地前置用 host-local 码
   * （`plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict`——沿用 run-change-source-* 先例，
   * 不登记共享稳定码，S2）。
   */
  async completeTeamPlanForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0], direct: { completeTeamPlan: CompleteTeamPlanFn },
    signal?: AbortSignal): Promise<Awaited<ReturnType<CompleteTeamPlanFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<CompleteTeamPlanFn>> => ({ ok: false, status: "blocked",
      operationId: request.operationId, baseDigest: request.baseDigest ?? null, targetDigest: null, errorCode, message });
    const key = this.sessionKey(projectRoot, "convener", runtime), entry = this.sessions.get(key), origin = entry?.origins.running;
    const current = () => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry && entry.origins.running === origin &&
      entry.busy && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || signal?.aborted)
      return blocked("plan-task-unavailable", "缺少当前真实受派运营回合或任务，未登记团队计划。");
    const assigned = await inspectAssignedTask({ projectRoot, actorRoleId: "convener", taskId: origin.taskId });
    if (!assigned.ok) return blocked(assigned.code, assigned.message ?? assigned.code);
    if (assigned.value.flowId !== request.flowId)
      return blocked("plan-flow-conflict", "团队计划 flow 与实际受派任务不一致，未登记团队计划。");
    if (request.runId !== undefined && request.runId !== assigned.value.runId)
      return blocked("plan-run-conflict", "Plan task refers to a different or unavailable real run");
    if (!current() || signal?.aborted)
      return blocked("plan-task-changed", "核验期间真实受派回合已变化，未登记团队计划。");
    return direct.completeTeamPlan({ ...request, runId: assigned.value.runId }, signal);
  }

  /** 原 `private ownedRunStopMembers`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */
  // —— ownedRunStopMembers（B5 自 session.ts 逐字搬移）——
  ownedRunStopMembers(plan: Pick<RunChangeHostPlan, "projectRoot" | "handles">) {
    const groups = new Map<RunChangePeer, { member: RunChangeHostPlan["handles"][number]; handle: RoleSessionHandle }[]>();
    const invalid = (message: string) => ({ ok: false as const, code: "run-stop-host-instance-unproven", message });
    if (!plan.handles.length) return invalid("实际停止句柄集合不可用。");
    try {
      for (const member of plan.handles) {
        const owners = [...desktopSessionManagers].filter(manager => manager.observedHandles.has(member.hostHandleId));
        if (owners.length !== 1) return invalid("实际句柄没有唯一宿主，未停止运行。");
        const manager = owners[0]!, observed = manager.observedHandles.get(member.hostHandleId)!;
        const fact = manager.executionInventoryFacts(plan.projectRoot).sessions.find(row => row.hostHandleId === member.hostHandleId);
        const lifecycle = observed.handle?.inspectLifecycle?.();
        // P1.4 §3.2 C8 / I0-5 / Q8：native instance 为可选证据——absent 允许；
        // present-but-changed（instance/role 不符）拒绝。Core session/role/task/project 身份与宿主就绪检查不变。
        if (!fact || !observed.handle?.stopAndInspect || observed.handle.sessionId !== member.coreSessionId || fact.taskId !== member.taskId ||
            fact.roleId !== member.roleId || fact.projectRoot !== plan.projectRoot || !["live", "disposed"].includes(fact.phase) ||
            lifecycle?.sessionId !== member.coreSessionId ||
            (lifecycle.native !== undefined && member.nativeInstanceId !== undefined &&
              (lifecycle.native.instanceId !== member.nativeInstanceId || lifecycle.native.roleId !== member.roleId)))
          return invalid("原任务、Core 或 native 实例已变化，未停止运行。");
        if (!manager.deliveryStoreArmed || manager.openChains.size) return invalid("队列持久化或仍在创建的宿主尚未就绪，未停止运行。");
        const members = groups.get(manager) ?? []; members.push({ member, handle: observed.handle }); groups.set(manager, members);
      }
      return { ok: true as const, groups };
    } catch { return invalid("真实句柄生命周期无法读取，未停止运行。"); }
  }

  /** 原 `private async executeOwnedRunStop`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */
  // —— executeOwnedRunStop（B5 自 session.ts 逐字搬移）——
  async executeOwnedRunStop(plan: RunChangeHostPlan, signal: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<SelectRunChangeFn>> => ({ ok: false, status: "blocked",
      operationId: plan.operationId, runId: plan.runId, baseDigest: null, targetDigest: null, errorCode, message });
    const owned = this.ownedRunStopMembers(plan); if (!owned.ok) return blocked(owned.code, owned.message);
    try {
      for (const [manager, members] of owned.groups) for (const { member, handle } of members) {
        if (signal.aborted) return blocked("run-change-cancelled", "宿主运行变更已取消，未提交。");
        const fresh = handle.inspectLifecycle?.();
        const stopped = await handle.stopAndInspect!({ expectedSessionId: member.coreSessionId,
          ...(fresh?.turnId ? { expectedTurnId: fresh.turnId } : {}), timeoutMs: 5000 }, signal);
        // P1.4 §3.2 C8 / §3.7：终止判定=运行时中立 drain 谓词（status/processCoverage 仅证据、
        // native 可选：absent 允许、present-but-changed 拒绝）；5s 仅上限（W1 已 drain 即返回）。
        if (stopped.sessionId !== member.coreSessionId ||
            (stopped.native !== undefined && member.nativeInstanceId !== undefined &&
              (stopped.native.instanceId !== member.nativeInstanceId || stopped.native.roleId !== member.roleId)) ||
            !isRuntimeSessionDrained(stopped))
          return blocked("run-stop-lifecycle-unproven", "同一真实实例尚未排空，运行变更未提交。");
        const entry = [...manager.sessions.entries()].find(([, value]) => value.handle === handle);
        // Close the actual SDK stream while its original W consumer still owns the entry:
        // terminal reports must be consumed before removing their handback/persistence owner.
        if (entry) {
          await manager.disposeObservedHandle(handle);
          await entry[1].eventConsumerDone;
          if (entry[1].eventConsumerFailed) return blocked("run-stop-event-consumer-unproven", "原实例事件消费失败，未提交运行变更。");
          const error = await manager.disposeEntry(entry[0], entry[1]); if (error) return blocked("run-stop-dispose-failed", error);
        }
      }
      for (const [manager] of owned.groups) {
        const taskIds = new Set(plan.taskIds), rootPrefix = `${plan.projectRoot}\u0000`;
        const claimed = await manager.waitForRunStopDeliveryClaims({ projectRoot: plan.projectRoot, taskIds: plan.taskIds, signal });
        if (claimed.status !== "wait-complete") return blocked(claimed.code, "投递认领归属或结束状态尚未核实，未提交运行变更。");
        // Capture detached producers after affected claims have finished their actual send handoff.
        const deliveries = [...manager.taskDeliveryCommits.entries()].filter(([key]) => key.startsWith(rootPrefix) && taskIds.has(key.slice(rootPrefix.length))).map(([, row]) => row.done);
        const handbacks = [...manager.taskHandbackCommits.entries()].filter(([key]) => key.startsWith(rootPrefix) && taskIds.has(key.slice(rootPrefix.length))).map(([, promise]) => promise);
        await Promise.all([...deliveries, ...handbacks]);
        const cutoff = await manager.finishStopPersistence({ ok: true, note: "" });
        if (!cutoff.ok || !cutoff.deliveryQueuePersistence) return blocked("run-stop-persistence-unproven", cutoff.note);
        const row = manager.runStopFacts.get(`${plan.projectRoot}\u0000${plan.operationId}`);
        if (!row || row.fact.requestDigest !== plan.requestDigest) return blocked("run-stop-host-fence-unproven", "真实运行暂停来源已变化。");
        row.fact = { ...row.fact, targetSeq: cutoff.deliveryQueuePersistence.targetSeq };
        manager.inventoryChanged(plan.projectRoot, "run-stop-cutoff-completed");
        if (manager.inventoryPublicationErrors.has(plan.projectRoot)) return blocked("run-stop-inventory-unavailable", "停止事实发布失败，未提交运行变更。");
      }
      if (signal.aborted) return blocked("run-change-cancelled", "宿主运行变更已取消，未提交。");
      return await finalizeRunChange({ projectRoot: plan.projectRoot, planId: plan.planId, requestDigest: plan.requestDigest }, signal);
    } catch (error) { return blocked("run-stop-host-failed", error instanceof Error ? error.message : String(error)); }
  }

  /** 原 `private resumeDeferredRunChanges`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */
  // —— resumeDeferredRunChanges（B5 自 session.ts 逐字搬移）——
  resumeDeferredRunChanges(entry: LiveSession, origin: DeliveryOrigin): void {
    for (const [key, held] of this.deferredRunChanges) {
      if (held.entry !== entry || held.origin !== origin || held.plan.requesterTurnId !== origin.turnId) continue;
      this.deferredRunChanges.delete(key);
      if (origin.outcome !== "completed" || entry.interactionState.lifetime.signal.aborted || held.controller.signal.aborted) {
        held.controller.abort(); this.runChangeOperations.delete(held.plan.planId); continue;
      }
      void Promise.resolve().then(() => this.executeOwnedRunStop(held.plan, held.controller.signal)).then(receipt => {
        this.emitDeliveryNote(entry.projectRoot, entry.runtime, entry.roleId, entry.roleId,
          receipt.message ?? (receipt.ok ? "原运行已停止。" : `运行变更尚未提交：${receipt.errorCode ?? receipt.status}`));
      }).catch(error => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).error("run-change.continuation.failed", error);
      }).finally(() => { this.runChangeOperations.delete(held.plan.planId); });
    }
  }

  // —— executionInventoryFacts（B5 自 session.ts 逐字搬移）——
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory, "sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops"> {
    const sessions: DesktopSessionInventoryFact[] = [];
    for (const { fact, handle } of this.observedHandles.values()) {
      if (fact.projectRoot !== projectRoot) continue;
      const current = structuredClone(fact);
      const entry = [...this.sessions.values()].find(entry => entry.handle === handle);
      const assignment = entry?.origins.running ? entry.origins.running.assignment : entry?.boundAssignment;
      const taskId = entry ? (entry.origins.running ? entry.origins.running.taskId : assignment?.taskId ?? entry.assignedTaskId) : current.taskId;
      if (taskId !== undefined) current.taskId = taskId; else if (entry) delete current.taskId;
      if (assignment?.runId) current.runId = assignment.runId;
      if (handle !== undefined) {
        if (handle.sessionId !== undefined) current.coreSessionId = handle.sessionId;
        try { if (handle.inspectToolSurface) current.toolSurface = structuredClone(handle.inspectToolSurface());
          else current.errors.push("tool-surface-observation-unavailable"); } catch { current.errors.push("tool-surface-observation-failed"); }
        try { if (handle.inspectLifecycle) current.lifecycle = structuredClone(handle.inspectLifecycle());
          else current.errors.push("lifecycle-observation-unavailable"); } catch { current.errors.push("lifecycle-observation-failed"); }
      }
      sessions.push(current);
    }
    return { sessions, deliveryQueuePersistence: [this.deliveryQueuePersistenceFacts()],
      controllerStops: [...this.controllerStopFacts.values()].filter(row => row.projectRoot === projectRoot).map(row => structuredClone(row.fact)),
      runStops: [...this.runStopFacts.values()].filter(row => row.projectRoot === projectRoot).map(row => structuredClone(row.fact)), pendingOpens: [...this.openChains.keys()].filter(key => key.startsWith(`${projectRoot}\u0000`)),
      queuedDispatches: [...this.deliveryQueues.entries()].filter(([key]) => key.startsWith(`${projectRoot}\u0000`)).flatMap(([, items]) => items.map(item => ({ queueEntryId: item.queueEntryId ?? "unknown", roleId: item.targetRoleId, runtime: item.runtime,
        taskId: item.taskId, kind: item.kind, sourceRoleId: item.sourceRoleId || "unknown",
        notificationSourceState: item.notificationSource ? "recorded" as const : "unknown" as const,
        ...(item.notificationSource ? { notificationSource: structuredClone(item.notificationSource), operationId: item.notificationSource.operationId } : {}),
        systemAssignmentState: item.kind !== "system" ? "not-system" as const : item.systemAssignment === undefined ? "unknown" as const : item.systemAssignment === null ? "unassigned" as const : "bound" as const,
        ...(item.systemAssignment ? { systemAssignmentTaskId: item.systemAssignment.taskId } : {}),
        lastAttempt: item.lastAttempt ? { ...item.lastAttempt } : { state: "unknown" as const } }))),
      activeDeliveries: [...this.activeDeliveries.entries()].filter(([key]) => key.startsWith(`${projectRoot}\u0000`)).map(([, item]) => ({ roleId: item.targetRoleId, runtime: item.runtime, taskId: item.taskId, kind: item.kind })) };
  }

  // —— controllerProducerFacts（B5 自 session.ts 逐字搬移）——
  /**
   * **终止角色当前轮次 + 后台子进程树**（B-08）。失败/无法确认 ⇒ `terminationConfirmed:false`，
   * 调用方（重派）不得自动重派。记录 `role.terminated`（子进程数/退出/信号）到运行日志。
   */
  controllerProducerFacts(projectRoot: string, taskId: string, caller: ActualDispatchSource): DesktopControllerStopFact["knownProducers"] | undefined {
    const claims = [...this.drainClaimRecords].filter(row => row.projectRoot === projectRoot &&
      !(row.owner?.entry === caller.entry && row.owner.origin === caller.origin));
    if (claims.some(row => !row.taskIds?.length)) return undefined;
    const key = `${projectRoot}\u0000${taskId}`;
    return { openChains: [...this.openChains.keys()].filter(key => key.startsWith(`${projectRoot}\u0000convener\u0000`)).length,
      deliveryClaims: claims.filter(row => row.taskIds?.includes(taskId)).length + (this.taskDeliveryCommits.has(key) ? 1 : 0),
      handbackCommits: this.taskHandbackCommits.has(key) ? 1 : 0 };
  }

  // —— stopExactController（B5 自 session.ts 逐字搬移）——
  async stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult> {
    const base: TerminateRoleRunResult = { ok: false, roleId: input.roleId, terminationConfirmed: false, childProcesses: 0, childProcessesStopped: 0,
      childResults: [], partialArtifacts: [], isolatedArtifacts: [], sessionFresh: false, abort: { ok: false, supported: false } };
    const blocked = (code: string, message: string): TerminateRoleRunResult => ({ ...base, message: `${code}：${message}` });
    const current = () => !!caller && caller.entry.roleId === "chief" && caller.entry.projectRoot === input.projectRoot &&
      this.sessions.get(this.sessionKey(input.projectRoot, "chief", caller.entry.runtime)) === caller.entry && caller.entry.origins.running === caller.origin &&
      caller.entry.busy && !caller.origin.settled && !caller.entry.interactionState.lifetime.signal.aborted && !caller.entry.interactionState.turn.signal.aborted;
    if (!input.taskId) return blocked("controller-stop-task-required", "受管运营停止必须明确真实任务，未按角色猜测当前目标。");
    if (!caller?.entry.handle.sessionId || !caller.origin.turnId || !current()) return blocked("controller-stop-caller-unproven", "缺少当前真实幕僚终止调用，未停止。");
    const prepared = await prepareControllerStop({ projectRoot: input.projectRoot, taskId: input.taskId, chiefCoreSessionId: caller.entry.handle.sessionId, chiefTurnId: caller.origin.turnId });
    if (!current()) return blocked("controller-stop-source-changed", "准备期间发起回合已变化。");
    if (!prepared.ok) return blocked(prepared.code, prepared.message);
    const plan = prepared.value;
    if (plan.scope.taskId !== input.taskId || plan.scope.actorRoleId !== "convener" || plan.scope.creatorRoleId !== "chief" ||
        plan.requesterCoreSessionId !== caller.entry.handle.sessionId || plan.requesterTurnId !== caller.origin.turnId)
      return blocked("controller-stop-target-mismatch", "公开停止计划与真实目标不一致。");
    const owned = this.ownedRunStopMembers(plan); if (!owned.ok) return blocked(owned.code, owned.message);
    for (const [manager, members] of owned.groups) {
      if (!manager.controllerProducerFacts(input.projectRoot, input.taskId, caller)) return blocked("controller-stop-producer-unknown", "目标投递认领归属尚未核实。");
      if (members.some(({ member }) => manager.executionInventoryFacts(input.projectRoot).sessions.find(row => row.hostHandleId === member.hostHandleId)?.runId !== plan.scope.runId))
        return blocked("controller-stop-target-mismatch", "目标当前任务或运行已变化。");
    }
    const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "session-dispose" });
    if (!lease.ok) return blocked(lease.code, "项目正在进行另一真实宿主动作，未停止。");
    const heldLease: ControllerDisposalLease = { projectRoot: input.projectRoot, leaseId: lease.leaseId, operationId: plan.operationId, kind: "session-dispose", hostHandleIds: plan.handles.map(member => member.hostHandleId) };
    this.controllerDisposalOwners.add(heldLease);
    let activeLease: { projectRoot: string; leaseId: string } | undefined = heldLease;
    const signal = AbortSignal.any([caller.entry.interactionState.lifetime.signal, caller.entry.interactionState.turn.signal]);
    let outcome: TerminateRoleRunResult = blocked("controller-stop-incomplete", "停止未完成。");
    try {
      outcome = await (async (): Promise<TerminateRoleRunResult> => {
        for (const [manager, members] of owned.groups) {
          const tasks = manager.fencedRunTasks.get(input.projectRoot) ?? new Set<string>(); tasks.add(plan.scope.taskId); manager.fencedRunTasks.set(input.projectRoot, tasks);
          const producers = manager.controllerProducerFacts(input.projectRoot, plan.scope.taskId, caller); if (!producers) return blocked("controller-stop-producer-unknown", "目标归属已变化。");
          manager.controllerStopFacts.set(`${input.projectRoot}\u0000${plan.operationId}`, { projectRoot: input.projectRoot, fact: {
            managerId: manager.managerId, operationId: plan.operationId, taskId: plan.scope.taskId, runId: plan.scope.runId, requestDigest: plan.requestDigest,
            generation: ++manager.runStopGeneration, state: "fenced", hostHandleIds: members.map(row => row.member.hostHandleId), targetSeq: manager.deliveryPersistSeq, knownProducers: producers } });
          manager.inventoryChanged(input.projectRoot, "controller-stop-producers-fenced");
        }
        for (const [manager, members] of owned.groups) for (const { member, handle } of members) {
          if (!current() || signal.aborted) return blocked("controller-stop-cancelled", "发起回合已取消。");
          const before = handle.inspectLifecycle?.();
          if (before?.sessionId !== member.coreSessionId || before.native?.instanceId !== member.nativeInstanceId)
            return blocked("controller-stop-instance-changed", "原Core或native实例已变化，未停止错误实例。");
          const stopped = await handle.stopAndInspect!({ expectedSessionId: member.coreSessionId, ...(before.turnId ? { expectedTurnId: before.turnId } : {}), timeoutMs: 5000 }, signal);
          if (stopped.sessionId !== member.coreSessionId || stopped.native?.instanceId !== member.nativeInstanceId || stopped.status !== "quiescent" || !stopped.providerFinished || stopped.activeTools.length)
            return blocked("controller-stop-terminal-unproven", "原实例尚未排空，未确认停止。");
          const entry = [...manager.sessions.entries()].find(([, value]) => value.handle === handle);
          if (entry) {
            await manager.disposeObservedHandle(handle, heldLease); await entry[1].eventConsumerDone;
            if (entry[1].eventConsumerFailed) return blocked("controller-stop-event-consumer-unproven", "原实例事件消费失败。");
            const error = await manager.disposeEntry(entry[0], entry[1], heldLease); if (error) return blocked("controller-stop-dispose-failed", error);
          }
        }
        for (const [manager] of owned.groups) {
          const claims = await manager.waitForRunStopDeliveryClaims({ projectRoot: input.projectRoot, taskIds: [plan.scope.taskId], signal, caller });
          if (claims.status !== "wait-complete") return blocked(claims.code, "目标认领尚未结束。");
          const key = `${input.projectRoot}\u0000${plan.scope.taskId}`;
          await Promise.all([manager.taskDeliveryCommits.get(key)?.done, manager.taskHandbackCommits.get(key)]);
          const producers = manager.controllerProducerFacts(input.projectRoot, plan.scope.taskId, caller);
          if (!producers || Object.values(producers).some(count => count !== 0)) return blocked("controller-stop-producers-unproven", "目标仍有在途生产者，未确认停止。");
          const cutoff = await manager.finishStopPersistence({ ok: true, note: "" });
          if (!cutoff.ok || !cutoff.deliveryQueuePersistence) return blocked("controller-stop-cutoff-unproven", cutoff.note);
          const row = manager.controllerStopFacts.get(`${input.projectRoot}\u0000${plan.operationId}`)!;
          row.fact = { ...row.fact, targetSeq: cutoff.deliveryQueuePersistence.targetSeq, knownProducers: producers };
          manager.inventoryChanged(input.projectRoot, "controller-stop-cutoff-completed");
          if (manager.inventoryPublicationErrors.has(input.projectRoot)) return blocked("controller-stop-inventory-unavailable", "真实停止事实发布失败。");
        }
        const expectedHandles = plan.handles.map(member => member.hostHandleId).sort();
        if (!current() || signal.aborted || !this.controllerDisposalOwners.has(heldLease) || heldLease.projectRoot !== plan.projectRoot ||
            heldLease.operationId !== plan.operationId || heldLease.kind !== "session-dispose" || heldLease.leaseId !== lease.leaseId ||
            JSON.stringify([...heldLease.hostHandleIds].sort()) !== JSON.stringify(expectedHandles) ||
            [...owned.groups].some(([manager, members]) => members.some(({ handle }) => !manager.ownsControllerDisposal(handle, heldLease))))
          return blocked("controller-stop-disposal-owner-changed", "原停止操作或精确句柄归属已变化。");
        // Core stop/dispose truthfully interrupted the effect lease. End only our own lease, then
        // acquire an inspection-only lease in this synchronous stack; this is not OS/process atomicity.
        const endedEffects = endGitHostAction({ projectRoot: heldLease.projectRoot, leaseId: heldLease.leaseId });
        if (!endedEffects.ok) return blocked(endedEffects.code, "原停止动作的协调未能结束，不能进行最终核验。");
        const inspection = beginGitHostAction({ projectRoot: input.projectRoot, kind: "session-dispose", expectedCoordinatorRevision: endedEffects.coordinatorRevision });
        activeLease = inspection.ok ? { projectRoot: input.projectRoot, leaseId: inspection.leaseId } : undefined;
        this.controllerDisposalOwners.delete(heldLease);
        if (!inspection.ok) return blocked(inspection.code, "最终停止核验尚未取得当前协调边界。");
        const finalized = await finalizeControllerStop({ projectRoot: input.projectRoot, plan, hostLeaseId: inspection.leaseId }, signal);
        if (!finalized.ok) return blocked(finalized.code, finalized.message);
        this.appendRoleActivity(input.projectRoot, "convener", { kind: "role.terminated", taskId: plan.scope.taskId, status: "confirmed",
          summary: `原运营任务已精确停止：${finalized.operationId}；未关闭任务、未取消整run、未批准质量或发布。` });
        return { ...base, ok: true, terminationConfirmed: true, childProcesses: finalized.childProcesses, childProcessesStopped: finalized.childProcessesStopped,
          sessionFresh: true, abort: { ok: true, supported: true }, message: finalized.message };
      })();
    } catch (error) { outcome = blocked("controller-stop-host-failed", error instanceof Error ? error.message : String(error)); }
    finally {
      const ended = activeLease ? endGitHostAction(activeLease) : undefined; this.controllerDisposalOwners.delete(heldLease);
      if (ended && !ended.ok) outcome = blocked(ended.code, "原停止动作的宿主协调尚未完成，不能确认停止。");
    }
    return outcome;
  }

}
