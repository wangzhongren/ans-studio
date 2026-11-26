// app/desktop/session/lifecycle/index.ts
// B7（2026-11-13，session.ts 重构；方案 §3.2/§3.3/§3.6/§5 B7、附录 A lifecycle 组）：
// lifecycle 模块的组装面（L6）。职责：
//  · 单 owner 创建/持有方案 §3.6 的 11 个 lifecycle 状态（./state.ts；门面仅保留同一实例访问器）；
//  · 构造 5 个方法子模块（open/send/consume/background/ops）并实现其 `LifecycleHost` 宿主面
//    （子模块以同名薄包装调用；宿主方法在此逐名转发——同实例、无第二份状态）；
//  · 对外提供 47 个同名同签名方法（门面 SessionManager 逐一薄委托）、`SessionControl` 实现
//    （openInternal/ensureFresh/disposeEntry/abortTurn）与只读 `SessionDirectory`（./directory.ts）。
// 端口（方案 §3.3）：跨模块上行调用经 `LifecyclePorts`（= LifecycleHost 去掉 lifecycle 自身/状态/
// shared 面），由门面构造以箭头回调注入（运行期调用、参数逐位原样转发）；shared 方法直接调用 L0 实现。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { LifecycleHost } from "./host.ts";
import type { SessionControl, SessionDirectory } from "../contracts/ports.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import { createLifecycleState, type LifecycleState } from "./state.ts";
import { LifecycleOpen } from "./open.ts";
import { LifecycleSend } from "./send.ts";
import { LifecycleConsume } from "./consume.ts";
import { LifecycleBackground } from "./background.ts";
import { LifecycleOps } from "./ops.ts";
import { createLifecycleDirectory } from "./directory.ts";
import { sessionKey, queueKey } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import { contextInfo } from "../shared/session-views.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { findListingForFeedback, refreshListingNow } from "../shared/roles.ts";
import { isFixedTask, readTasks } from "../shared/tasks-store.ts";

/** 状态/自身面键（`LifecyclePorts` 是 `LifecycleHost` 去掉这些键后的端口面）。 */
type LifecycleOwnKey =
  | "sessions"
  | "messageSeq"
  | "lruClock"
  | "activeRoleId"
  | "selectionVersion"
  | "selectionTargetRoleId"
  | "openChains"
  | "observedHandles"
  | "observedHandleIds"
  | "lastGovernanceRuntime"
  | "profileRevisions"
  | "rebuildChains"
  | "boundaryRefreshVersion"
  | "deliveryQueues"
  | "activeDeliveries"
  | "deliveredAppTaskIds"
  | "deliveredDeliveryKeys"
  | "stoppedDeliveryKeys"
  | "resumedDeliveryKeys"
  | "deliveryKeyStopVersions"
  | "deliveryStopVersion"
  | "deliveryStoppedAll"
  | "lastTurns"
  | "lastAssistantText"
  | "reportStates"
  | "attemptStates"
  | "deferredRunChanges"
  | "runChangeOperations"
  | "inventoryPublicationErrors"
  | "loadEffectiveConfig"
  | "manager"
  | "maxLiveSessions"
  | "send"
  | "sendDelivery"
  | "sendFacts"
  | "beginDeliveryOrigin"
  | "captureDeliveryOrigin"
  | "trimDeliveryOrigins"
  | "failDeliveryOrigin"
  | "healStaleOrigin"
  | "consume"
  | "listBackgroundTasks"
  | "readBackgroundTask"
  | "stopBackgroundTask"
  | "open"
  | "openInternal"
  | "openInternalUnsafe"
  | "openObservedRoleSession"
  | "ownsControllerDisposal"
  | "disposeObservedHandle"
  | "disposeEntry"
  | "evictBeyondLimit"
  | "isPrimarySession"
  | "activeEntry"
  | "observeWatchdog"
  | "noteWatchdogActivity"
  | "profileRevision"
  | "profileChanged"
  | "hasBusyRuntime"
  | "hasStaleProfile"
  | "liveSessionViews"
  | "openBackground"
  | "sendBackground"
  | "isRoleBusy"
  | "hasLiveSession"
  | "wasLastTurnAborted"
  | "hasPendingDelivery"
  | "waitForRoleSettle"
  | "waitForRoleIdle"
  | "abort"
  | "stop"
  | "isOpen"
  | "openForRoleId"
  | "liveRoleIds"
  | "findLiveRuntime"
  | "ensureFreshRoleSession"
  | "rebuildSession"
  | "rebuildSessionUnsafe"
  | "isCustomerInitiatedTurn"
  | "contextInfo"
  | "emitDeliveryNote"
  | "findListingForFeedback"
  | "now"
  | "queueKey"
  | "readTasks"
  | "isFixedTask"
  | "refreshListingNow"
  | "sessionKey";

/** 门面注入的跨模块端口（运行期调用；参数逐位原样转发）。 */
export type LifecyclePorts = Omit<LifecycleHost, LifecycleOwnKey>;

/** 门面构造 Lifecycle 时注入的同一实例状态/引用（方案 §3.6：sessions/deps 留门面，只读暴露）。 */
export interface LifecycleRefs {
  deps: SessionManagerDeps;
  registerManager: () => void;
  sessions: LifecycleHost["sessions"];
  loadEffectiveConfig: LifecycleHost["loadEffectiveConfig"];
  manager: LifecycleHost["manager"];
  maxLiveSessions: LifecycleHost["maxLiveSessions"];
  profileRevisions: () => LifecycleHost["profileRevisions"];
  rebuildChains: () => LifecycleHost["rebuildChains"];
  boundaryRefreshVersion: () => LifecycleHost["boundaryRefreshVersion"];
  setBoundaryRefreshVersion: (value: number) => void;
  lastTurns: () => LifecycleHost["lastTurns"];
  lastAssistantText: () => LifecycleHost["lastAssistantText"];
  reportStates: () => LifecycleHost["reportStates"];
  attemptStates: () => LifecycleHost["attemptStates"];
  deliveryQueues: () => LifecycleHost["deliveryQueues"];
  activeDeliveries: () => LifecycleHost["activeDeliveries"];
  deliveredAppTaskIds: () => LifecycleHost["deliveredAppTaskIds"];
  deliveredDeliveryKeys: () => LifecycleHost["deliveredDeliveryKeys"];
  stoppedDeliveryKeys: () => LifecycleHost["stoppedDeliveryKeys"];
  resumedDeliveryKeys: () => LifecycleHost["resumedDeliveryKeys"];
  deliveryKeyStopVersions: () => LifecycleHost["deliveryKeyStopVersions"];
  deliveryStopVersion: () => LifecycleHost["deliveryStopVersion"];
  setDeliveryStopVersion: (value: number) => void;
  deliveryStoppedAll: () => LifecycleHost["deliveryStoppedAll"];
  setDeliveryStoppedAll: (value: boolean) => void;
  deferredRunChanges: () => LifecycleHost["deferredRunChanges"];
  runChangeOperations: () => LifecycleHost["runChangeOperations"];
  inventoryPublicationErrors: () => LifecycleHost["inventoryPublicationErrors"];
  directory: {
    governanceOwner(projectRoot: string): string | null;
    governanceRuntime(projectRoot: string): RuntimeKind | undefined;
    lastTurn(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: import("../../../../src/model/runtime.ts").RuntimeTurnOutcome; at: string; errorCode?: string } | undefined;
  };
}

/** lifecycle 组装面（LifecycleHost 实现 + SessionControl + SessionDirectory）。 */
export class Lifecycle implements LifecycleHost, SessionControl {
  readonly state: LifecycleState;
  private readonly refs: LifecycleRefs;
  private readonly ports: LifecyclePorts;
  private readonly sendOps: LifecycleSend;
  private readonly consumeOps: LifecycleConsume;
  private readonly backgroundOps: LifecycleBackground;
  private readonly openOps: LifecycleOpen;
  private readonly ops: LifecycleOps;
  private readonly directoryPort: SessionDirectory;

  constructor(refs: LifecycleRefs, ports: LifecyclePorts) {
    this.refs = refs;
    this.ports = ports;
    this.state = createLifecycleState(refs.registerManager);
    this.sendOps = new LifecycleSend(this, refs.deps);
    this.consumeOps = new LifecycleConsume(this, refs.deps);
    this.backgroundOps = new LifecycleBackground(this, refs.deps);
    this.openOps = new LifecycleOpen(this, refs.deps);
    this.ops = new LifecycleOps(this, refs.deps);
    this.directoryPort = createLifecycleDirectory(
      {
        key: (projectRoot, roleId, runtime) => sessionKey(projectRoot, roleId, runtime),
        find: (projectRoot, roleId, runtime) => refs.sessions.get(sessionKey(projectRoot, roleId, runtime)),
        activeRoleId: () => this.state.activeRoleId,
        isBusy: (runtime) => this.ops.hasBusyRuntime(runtime),
        views: () => this.ops.liveSessionViews(),
      },
      refs.directory,
    );
  }

  get sessions(): LifecycleHost["sessions"] { return this.refs.sessions; }
  get messageSeq(): LifecycleHost["messageSeq"] { return this.state.messageSeq; }
  set messageSeq(value: LifecycleHost["messageSeq"]) { this.state.messageSeq = value; }
  get lruClock(): LifecycleHost["lruClock"] { return this.state.lruClock; }
  set lruClock(value: LifecycleHost["lruClock"]) { this.state.lruClock = value; }
  get activeRoleId(): LifecycleHost["activeRoleId"] { return this.state.activeRoleId; }
  set activeRoleId(value: LifecycleHost["activeRoleId"]) { this.state.activeRoleId = value; }
  get selectionVersion(): LifecycleHost["selectionVersion"] { return this.state.selectionVersion; }
  set selectionVersion(value: LifecycleHost["selectionVersion"]) { this.state.selectionVersion = value; }
  get selectionTargetRoleId(): LifecycleHost["selectionTargetRoleId"] { return this.state.selectionTargetRoleId; }
  set selectionTargetRoleId(value: LifecycleHost["selectionTargetRoleId"]) { this.state.selectionTargetRoleId = value; }
  get openChains(): LifecycleHost["openChains"] { return this.state.openChains; }
  get observedHandles(): LifecycleHost["observedHandles"] { return this.state.observedHandles; }
  get observedHandleIds(): LifecycleHost["observedHandleIds"] { return this.state.observedHandleIds; }
  get lastGovernanceRuntime(): LifecycleHost["lastGovernanceRuntime"] { return this.state.lastGovernanceRuntime; }
  get profileRevisions(): LifecycleHost["profileRevisions"] { return this.refs.profileRevisions(); }
  get rebuildChains(): LifecycleHost["rebuildChains"] { return this.refs.rebuildChains(); }
  get boundaryRefreshVersion(): LifecycleHost["boundaryRefreshVersion"] { return this.refs.boundaryRefreshVersion(); }
  set boundaryRefreshVersion(value: LifecycleHost["boundaryRefreshVersion"]) { this.refs.setBoundaryRefreshVersion(value); }
  get deliveryQueues(): LifecycleHost["deliveryQueues"] { return this.refs.deliveryQueues(); }
  get activeDeliveries(): LifecycleHost["activeDeliveries"] { return this.refs.activeDeliveries(); }
  get deliveredAppTaskIds(): LifecycleHost["deliveredAppTaskIds"] { return this.refs.deliveredAppTaskIds(); }
  get deliveredDeliveryKeys(): LifecycleHost["deliveredDeliveryKeys"] { return this.refs.deliveredDeliveryKeys(); }
  get stoppedDeliveryKeys(): LifecycleHost["stoppedDeliveryKeys"] { return this.refs.stoppedDeliveryKeys(); }
  get resumedDeliveryKeys(): LifecycleHost["resumedDeliveryKeys"] { return this.refs.resumedDeliveryKeys(); }
  get deliveryKeyStopVersions(): LifecycleHost["deliveryKeyStopVersions"] { return this.refs.deliveryKeyStopVersions(); }
  get deliveryStopVersion(): LifecycleHost["deliveryStopVersion"] { return this.refs.deliveryStopVersion(); }
  set deliveryStopVersion(value: LifecycleHost["deliveryStopVersion"]) { this.refs.setDeliveryStopVersion(value); }
  get deliveryStoppedAll(): LifecycleHost["deliveryStoppedAll"] { return this.refs.deliveryStoppedAll(); }
  set deliveryStoppedAll(value: LifecycleHost["deliveryStoppedAll"]) { this.refs.setDeliveryStoppedAll(value); }
  get lastTurns(): LifecycleHost["lastTurns"] { return this.refs.lastTurns(); }
  get lastAssistantText(): LifecycleHost["lastAssistantText"] { return this.refs.lastAssistantText(); }
  get reportStates(): LifecycleHost["reportStates"] { return this.refs.reportStates(); }
  get attemptStates(): LifecycleHost["attemptStates"] { return this.refs.attemptStates(); }
  get deferredRunChanges(): LifecycleHost["deferredRunChanges"] { return this.refs.deferredRunChanges(); }
  get runChangeOperations(): LifecycleHost["runChangeOperations"] { return this.refs.runChangeOperations(); }
  get inventoryPublicationErrors(): LifecycleHost["inventoryPublicationErrors"] { return this.refs.inventoryPublicationErrors(); }
  get loadEffectiveConfig(): LifecycleHost["loadEffectiveConfig"] { return this.refs.loadEffectiveConfig; }
  get manager(): LifecycleHost["manager"] { return this.refs.manager; }
  get maxLiveSessions(): LifecycleHost["maxLiveSessions"] { return this.refs.maxLiveSessions; }

  /** 只读会话目录（方案 §3.3 SessionDirectory；lifecycle 实现，纯投影）。 */
  directory(): SessionDirectory { return this.directoryPort; }

  /** `SessionControl.ensureFresh`（= 原 `ensureFreshRoleSession`；同名语义、参数逐位转发）。 */
  ensureFresh(projectRoot: string, roleId: string, runtime: RuntimeKind): ReturnType<LifecycleOps["ensureFreshRoleSession"]> {
    return this.ops.ensureFreshRoleSession(projectRoot, roleId, runtime);
  }

  /** `SessionControl.abortTurn`（= 原 `abort`；同名语义、参数逐位转发）。 */
  abortTurn(target: Parameters<LifecycleOps["abort"]>[0]): ReturnType<LifecycleOps["abort"]> {
    return this.ops.abort(target);
  }

  send(...args: Parameters<LifecycleSend["send"]>): ReturnType<LifecycleSend["send"]> { return this.sendOps.send(...args); }
  sendDelivery(...args: Parameters<LifecycleSend["sendDelivery"]>): ReturnType<LifecycleSend["sendDelivery"]> { return this.sendOps.sendDelivery(...args); }
  sendFacts(...args: Parameters<LifecycleSend["sendFacts"]>): ReturnType<LifecycleSend["sendFacts"]> { return this.sendOps.sendFacts(...args); }
  beginDeliveryOrigin(...args: Parameters<LifecycleSend["beginDeliveryOrigin"]>): ReturnType<LifecycleSend["beginDeliveryOrigin"]> { return this.sendOps.beginDeliveryOrigin(...args); }
  captureDeliveryOrigin(...args: Parameters<LifecycleSend["captureDeliveryOrigin"]>): ReturnType<LifecycleSend["captureDeliveryOrigin"]> { return this.sendOps.captureDeliveryOrigin(...args); }
  trimDeliveryOrigins(...args: Parameters<LifecycleSend["trimDeliveryOrigins"]>): ReturnType<LifecycleSend["trimDeliveryOrigins"]> { return this.sendOps.trimDeliveryOrigins(...args); }
  failDeliveryOrigin(...args: Parameters<LifecycleSend["failDeliveryOrigin"]>): ReturnType<LifecycleSend["failDeliveryOrigin"]> { return this.sendOps.failDeliveryOrigin(...args); }
  healStaleOrigin(...args: Parameters<LifecycleSend["healStaleOrigin"]>): ReturnType<LifecycleSend["healStaleOrigin"]> { return this.sendOps.healStaleOrigin(...args); }
  consume(...args: Parameters<LifecycleConsume["consume"]>): ReturnType<LifecycleConsume["consume"]> { return this.consumeOps.consume(...args); }
  listBackgroundTasks(...args: Parameters<LifecycleBackground["listBackgroundTasks"]>): ReturnType<LifecycleBackground["listBackgroundTasks"]> { return this.backgroundOps.listBackgroundTasks(...args); }
  readBackgroundTask(...args: Parameters<LifecycleBackground["readBackgroundTask"]>): ReturnType<LifecycleBackground["readBackgroundTask"]> { return this.backgroundOps.readBackgroundTask(...args); }
  stopBackgroundTask(...args: Parameters<LifecycleBackground["stopBackgroundTask"]>): ReturnType<LifecycleBackground["stopBackgroundTask"]> { return this.backgroundOps.stopBackgroundTask(...args); }
  open(...args: Parameters<LifecycleOpen["open"]>): ReturnType<LifecycleOpen["open"]> { return this.openOps.open(...args); }
  openInternal(...args: Parameters<LifecycleOpen["openInternal"]>): ReturnType<LifecycleOpen["openInternal"]> { return this.openOps.openInternal(...args); }
  openInternalUnsafe(...args: Parameters<LifecycleOpen["openInternalUnsafe"]>): ReturnType<LifecycleOpen["openInternalUnsafe"]> { return this.openOps.openInternalUnsafe(...args); }
  openObservedRoleSession(...args: Parameters<LifecycleOps["openObservedRoleSession"]>): ReturnType<LifecycleOps["openObservedRoleSession"]> { return this.ops.openObservedRoleSession(...args); }
  ownsControllerDisposal(...args: Parameters<LifecycleOps["ownsControllerDisposal"]>): ReturnType<LifecycleOps["ownsControllerDisposal"]> { return this.ops.ownsControllerDisposal(...args); }
  disposeObservedHandle(...args: Parameters<LifecycleOps["disposeObservedHandle"]>): ReturnType<LifecycleOps["disposeObservedHandle"]> { return this.ops.disposeObservedHandle(...args); }
  disposeEntry(...args: Parameters<LifecycleOps["disposeEntry"]>): ReturnType<LifecycleOps["disposeEntry"]> { return this.ops.disposeEntry(...args); }
  evictBeyondLimit(...args: Parameters<LifecycleOps["evictBeyondLimit"]>): ReturnType<LifecycleOps["evictBeyondLimit"]> { return this.ops.evictBeyondLimit(...args); }
  isPrimarySession(...args: Parameters<LifecycleOps["isPrimarySession"]>): ReturnType<LifecycleOps["isPrimarySession"]> { return this.ops.isPrimarySession(...args); }
  activeEntry(...args: Parameters<LifecycleOps["activeEntry"]>): ReturnType<LifecycleOps["activeEntry"]> { return this.ops.activeEntry(...args); }
  observeWatchdog(...args: Parameters<LifecycleOps["observeWatchdog"]>): ReturnType<LifecycleOps["observeWatchdog"]> { return this.ops.observeWatchdog(...args); }
  noteWatchdogActivity(...args: Parameters<LifecycleOps["noteWatchdogActivity"]>): ReturnType<LifecycleOps["noteWatchdogActivity"]> { return this.ops.noteWatchdogActivity(...args); }
  profileRevision(...args: Parameters<LifecycleOps["profileRevision"]>): ReturnType<LifecycleOps["profileRevision"]> { return this.ops.profileRevision(...args); }
  profileChanged(...args: Parameters<LifecycleOps["profileChanged"]>): ReturnType<LifecycleOps["profileChanged"]> { return this.ops.profileChanged(...args); }
  hasBusyRuntime(...args: Parameters<LifecycleOps["hasBusyRuntime"]>): ReturnType<LifecycleOps["hasBusyRuntime"]> { return this.ops.hasBusyRuntime(...args); }
  hasStaleProfile(...args: Parameters<LifecycleOps["hasStaleProfile"]>): ReturnType<LifecycleOps["hasStaleProfile"]> { return this.ops.hasStaleProfile(...args); }
  liveSessionViews(...args: Parameters<LifecycleOps["liveSessionViews"]>): ReturnType<LifecycleOps["liveSessionViews"]> { return this.ops.liveSessionViews(...args); }
  openBackground(...args: Parameters<LifecycleOps["openBackground"]>): ReturnType<LifecycleOps["openBackground"]> { return this.ops.openBackground(...args); }
  sendBackground(...args: Parameters<LifecycleOps["sendBackground"]>): ReturnType<LifecycleOps["sendBackground"]> { return this.ops.sendBackground(...args); }
  isRoleBusy(...args: Parameters<LifecycleOps["isRoleBusy"]>): ReturnType<LifecycleOps["isRoleBusy"]> { return this.ops.isRoleBusy(...args); }
  hasLiveSession(...args: Parameters<LifecycleOps["hasLiveSession"]>): ReturnType<LifecycleOps["hasLiveSession"]> { return this.ops.hasLiveSession(...args); }
  wasLastTurnAborted(...args: Parameters<LifecycleOps["wasLastTurnAborted"]>): ReturnType<LifecycleOps["wasLastTurnAborted"]> { return this.ops.wasLastTurnAborted(...args); }
  hasPendingDelivery(...args: Parameters<LifecycleOps["hasPendingDelivery"]>): ReturnType<LifecycleOps["hasPendingDelivery"]> { return this.ops.hasPendingDelivery(...args); }
  waitForRoleSettle(...args: Parameters<LifecycleOps["waitForRoleSettle"]>): ReturnType<LifecycleOps["waitForRoleSettle"]> { return this.ops.waitForRoleSettle(...args); }
  waitForRoleIdle(...args: Parameters<LifecycleOps["waitForRoleIdle"]>): ReturnType<LifecycleOps["waitForRoleIdle"]> { return this.ops.waitForRoleIdle(...args); }
  abort(...args: Parameters<LifecycleOps["abort"]>): ReturnType<LifecycleOps["abort"]> { return this.ops.abort(...args); }
  stop(...args: Parameters<LifecycleOps["stop"]>): ReturnType<LifecycleOps["stop"]> { return this.ops.stop(...args); }
  isOpen(...args: Parameters<LifecycleOps["isOpen"]>): ReturnType<LifecycleOps["isOpen"]> { return this.ops.isOpen(...args); }
  openForRoleId(...args: Parameters<LifecycleOps["openForRoleId"]>): ReturnType<LifecycleOps["openForRoleId"]> { return this.ops.openForRoleId(...args); }
  liveRoleIds(...args: Parameters<LifecycleOps["liveRoleIds"]>): ReturnType<LifecycleOps["liveRoleIds"]> { return this.ops.liveRoleIds(...args); }
  findLiveRuntime(...args: Parameters<LifecycleOps["findLiveRuntime"]>): ReturnType<LifecycleOps["findLiveRuntime"]> { return this.ops.findLiveRuntime(...args); }
  ensureFreshRoleSession(...args: Parameters<LifecycleOps["ensureFreshRoleSession"]>): ReturnType<LifecycleOps["ensureFreshRoleSession"]> { return this.ops.ensureFreshRoleSession(...args); }
  rebuildSession(...args: Parameters<LifecycleOps["rebuildSession"]>): ReturnType<LifecycleOps["rebuildSession"]> { return this.ops.rebuildSession(...args); }
  rebuildSessionUnsafe(...args: Parameters<LifecycleOps["rebuildSessionUnsafe"]>): ReturnType<LifecycleOps["rebuildSessionUnsafe"]> { return this.ops.rebuildSessionUnsafe(...args); }
  isCustomerInitiatedTurn(...args: Parameters<LifecycleOps["isCustomerInitiatedTurn"]>): ReturnType<LifecycleOps["isCustomerInitiatedTurn"]> { return this.ops.isCustomerInitiatedTurn(...args); }

  sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return sessionKey(...args); }
  queueKey(...args: Parameters<LifecycleHost["queueKey"]>): ReturnType<LifecycleHost["queueKey"]> { return queueKey(...args); }
  now(): number { return now(this.refs.deps); }
  contextInfo(...args: Parameters<LifecycleHost["contextInfo"]>): ReturnType<LifecycleHost["contextInfo"]> { return contextInfo(...args); }
  emitDeliveryNote(...args: Parameters<LifecycleHost["emitDeliveryNote"]>): ReturnType<LifecycleHost["emitDeliveryNote"]> { emitDeliveryNote(...args, this.refs.deps); }
  findListingForFeedback(projectRoot: string): ReturnType<LifecycleHost["findListingForFeedback"]> { return findListingForFeedback(projectRoot, this.refs.deps); }
  refreshListingNow(projectRoot: string): ReturnType<LifecycleHost["refreshListingNow"]> { return refreshListingNow(projectRoot, this.refs.deps); }
  readTasks(projectRoot: string): ReturnType<LifecycleHost["readTasks"]> { return readTasks(projectRoot); }
  isFixedTask(projectRoot: string, taskId: string | undefined): ReturnType<LifecycleHost["isFixedTask"]> { return isFixedTask(projectRoot, taskId); }

  afterAppointmentWriteApproved(...args: Parameters<LifecyclePorts["afterAppointmentWriteApproved"]>): ReturnType<LifecyclePorts["afterAppointmentWriteApproved"]> { return this.ports.afterAppointmentWriteApproved(...args); }
  afterStableWrite(...args: Parameters<LifecyclePorts["afterStableWrite"]>): ReturnType<LifecyclePorts["afterStableWrite"]> { return this.ports.afterStableWrite(...args); }
  appTaskClientMessageId(...args: Parameters<LifecyclePorts["appTaskClientMessageId"]>): ReturnType<LifecyclePorts["appTaskClientMessageId"]> { return this.ports.appTaskClientMessageId(...args); }
  appTaskClientMessageIdFromSeed(...args: Parameters<LifecyclePorts["appTaskClientMessageIdFromSeed"]>): ReturnType<LifecyclePorts["appTaskClientMessageIdFromSeed"]> { return this.ports.appTaskClientMessageIdFromSeed(...args); }
  appendRoleActivity(...args: Parameters<LifecyclePorts["appendRoleActivity"]>): ReturnType<LifecyclePorts["appendRoleActivity"]> { return this.ports.appendRoleActivity(...args); }
  applyMcpChange(...args: Parameters<LifecyclePorts["applyMcpChange"]>): ReturnType<LifecyclePorts["applyMcpChange"]> { return this.ports.applyMcpChange(...args); }
  applySkillChange(...args: Parameters<LifecyclePorts["applySkillChange"]>): ReturnType<LifecyclePorts["applySkillChange"]> { return this.ports.applySkillChange(...args); }
  closeCreatedTaskFixedForSession(...args: Parameters<LifecyclePorts["closeCreatedTaskFixedForSession"]>): ReturnType<LifecyclePorts["closeCreatedTaskFixedForSession"]> { return this.ports.closeCreatedTaskFixedForSession(...args); }
  completeTeamPlanFixedForHandle(...args: Parameters<LifecyclePorts["completeTeamPlanFixedForHandle"]>): ReturnType<LifecyclePorts["completeTeamPlanFixedForHandle"]> { return this.ports.completeTeamPlanFixedForHandle(...args); }
  completeTeamPlanForHandle(...args: Parameters<LifecyclePorts["completeTeamPlanForHandle"]>): ReturnType<LifecyclePorts["completeTeamPlanForHandle"]> { return this.ports.completeTeamPlanForHandle(...args); }
  contractCheckText(...args: Parameters<LifecyclePorts["contractCheckText"]>): ReturnType<LifecyclePorts["contractCheckText"]> { return this.ports.contractCheckText(...args); }
  currentSkillPaths(...args: Parameters<LifecyclePorts["currentSkillPaths"]>): ReturnType<LifecyclePorts["currentSkillPaths"]> { return this.ports.currentSkillPaths(...args); }
  deliveryIsStopped(...args: Parameters<LifecyclePorts["deliveryIsStopped"]>): ReturnType<LifecyclePorts["deliveryIsStopped"]> { return this.ports.deliveryIsStopped(...args); }
  deliveryLifecycle(...args: Parameters<LifecyclePorts["deliveryLifecycle"]>): ReturnType<LifecyclePorts["deliveryLifecycle"]> { return this.ports.deliveryLifecycle(...args); }
  displayHandback(...args: Parameters<LifecyclePorts["displayHandback"]>): ReturnType<LifecyclePorts["displayHandback"]> { return this.ports.displayHandback(...args); }
  docFormatText(...args: Parameters<LifecyclePorts["docFormatText"]>): ReturnType<LifecyclePorts["docFormatText"]> { return this.ports.docFormatText(...args); }
  drainAllQueuesFor(...args: Parameters<LifecyclePorts["drainAllQueuesFor"]>): ReturnType<LifecyclePorts["drainAllQueuesFor"]> { return this.ports.drainAllQueuesFor(...args); }
  drainPiQueuesAcrossProjects(...args: Parameters<LifecyclePorts["drainPiQueuesAcrossProjects"]>): ReturnType<LifecyclePorts["drainPiQueuesAcrossProjects"]> { return this.ports.drainPiQueuesAcrossProjects(...args); }
  drainQueue(...args: Parameters<LifecyclePorts["drainQueue"]>): ReturnType<LifecyclePorts["drainQueue"]> { return this.ports.drainQueue(...args); }
  enqueueDelivery(...args: Parameters<LifecyclePorts["enqueueDelivery"]>): ReturnType<LifecyclePorts["enqueueDelivery"]> { return this.ports.enqueueDelivery(...args); }
  enrichAppointmentWriteBoundaryCard(...args: Parameters<LifecyclePorts["enrichAppointmentWriteBoundaryCard"]>): ReturnType<LifecyclePorts["enrichAppointmentWriteBoundaryCard"]> { return this.ports.enrichAppointmentWriteBoundaryCard(...args); }
  evidenceCheckText(...args: Parameters<LifecyclePorts["evidenceCheckText"]>): ReturnType<LifecyclePorts["evidenceCheckText"]> { return this.ports.evidenceCheckText(...args); }
  finishStopPersistence(...args: Parameters<LifecyclePorts["finishStopPersistence"]>): ReturnType<LifecyclePorts["finishStopPersistence"]> { return this.ports.finishStopPersistence(...args); }
  forceResetDeliveryState(...args: Parameters<LifecyclePorts["forceResetDeliveryState"]>): ReturnType<LifecyclePorts["forceResetDeliveryState"]> { return this.ports.forceResetDeliveryState(...args); }
  inventoryChanged(...args: Parameters<LifecyclePorts["inventoryChanged"]>): ReturnType<LifecyclePorts["inventoryChanged"]> { return this.ports.inventoryChanged(...args); }
  lookupGovernanceClientProjection(...args: Parameters<LifecyclePorts["lookupGovernanceClientProjection"]>): ReturnType<LifecyclePorts["lookupGovernanceClientProjection"]> { return this.ports.lookupGovernanceClientProjection(...args); }
  mergeReportState(...args: Parameters<LifecyclePorts["mergeReportState"]>): ReturnType<LifecyclePorts["mergeReportState"]> { return this.ports.mergeReportState(...args); }
  mirrorGovernanceFeedback(...args: Parameters<LifecyclePorts["mirrorGovernanceFeedback"]>): ReturnType<LifecyclePorts["mirrorGovernanceFeedback"]> { return this.ports.mirrorGovernanceFeedback(...args); }
  notifyRoleState(...args: Parameters<LifecyclePorts["notifyRoleState"]>): ReturnType<LifecyclePorts["notifyRoleState"]> { return this.ports.notifyRoleState(...args); }
  observeRoleEvent(...args: Parameters<LifecyclePorts["observeRoleEvent"]>): ReturnType<LifecyclePorts["observeRoleEvent"]> { return this.ports.observeRoleEvent(...args); }
  pendingAppTaskDelivery(...args: Parameters<LifecyclePorts["pendingAppTaskDelivery"]>): ReturnType<LifecyclePorts["pendingAppTaskDelivery"]> { return this.ports.pendingAppTaskDelivery(...args); }
  persistDeliveryQueues(...args: Parameters<LifecyclePorts["persistDeliveryQueues"]>): ReturnType<LifecyclePorts["persistDeliveryQueues"]> { return this.ports.persistDeliveryQueues(...args); }
  persistenceScope(...args: Parameters<LifecyclePorts["persistenceScope"]>): ReturnType<LifecyclePorts["persistenceScope"]> { return this.ports.persistenceScope(...args); }
  projectNote(...args: Parameters<LifecyclePorts["projectNote"]>): ReturnType<LifecyclePorts["projectNote"]> { return this.ports.projectNote(...args); }
  projectStateTool(...args: Parameters<LifecyclePorts["projectStateTool"]>): ReturnType<LifecyclePorts["projectStateTool"]> { return this.ports.projectStateTool(...args); }
  queueDirectNotification(...args: Parameters<LifecyclePorts["queueDirectNotification"]>): ReturnType<LifecyclePorts["queueDirectNotification"]> { return this.ports.queueDirectNotification(...args); }
  queueRebuildWritePermitsNotice(...args: Parameters<LifecyclePorts["queueRebuildWritePermitsNotice"]>): ReturnType<LifecyclePorts["queueRebuildWritePermitsNotice"]> { return this.ports.queueRebuildWritePermitsNotice(...args); }
  rebuildIfBoundaryStale(...args: Parameters<LifecyclePorts["rebuildIfBoundaryStale"]>): ReturnType<LifecyclePorts["rebuildIfBoundaryStale"]> { return this.ports.rebuildIfBoundaryStale(...args); }
  redispatchTask(...args: Parameters<LifecyclePorts["redispatchTask"]>): ReturnType<LifecyclePorts["redispatchTask"]> { return this.ports.redispatchTask(...args); }
  refuseUnprovenInstallation(...args: Parameters<LifecyclePorts["refuseUnprovenInstallation"]>): ReturnType<LifecyclePorts["refuseUnprovenInstallation"]> { return this.ports.refuseUnprovenInstallation(...args); }
  rememberAppTaskDelivered(...args: Parameters<LifecyclePorts["rememberAppTaskDelivered"]>): ReturnType<LifecyclePorts["rememberAppTaskDelivered"]> { return this.ports.rememberAppTaskDelivered(...args); }
  rememberReceipt(...args: Parameters<LifecyclePorts["rememberReceipt"]>): ReturnType<LifecyclePorts["rememberReceipt"]> { return this.ports.rememberReceipt(...args); }
  reportPlanEscalation(...args: Parameters<LifecyclePorts["reportPlanEscalation"]>): ReturnType<LifecyclePorts["reportPlanEscalation"]> { return this.ports.reportPlanEscalation(...args); }
  requestIdFor(...args: Parameters<LifecyclePorts["requestIdFor"]>): ReturnType<LifecyclePorts["requestIdFor"]> { return this.ports.requestIdFor(...args); }
  requestVersionDecision(...args: Parameters<LifecyclePorts["requestVersionDecision"]>): ReturnType<LifecyclePorts["requestVersionDecision"]> { return this.ports.requestVersionDecision(...args); }
  resumeDeferredRunChanges(...args: Parameters<LifecyclePorts["resumeDeferredRunChanges"]>): ReturnType<LifecyclePorts["resumeDeferredRunChanges"]> { return this.ports.resumeDeferredRunChanges(...args); }
  resumeDelivery(...args: Parameters<LifecyclePorts["resumeDelivery"]>): ReturnType<LifecyclePorts["resumeDelivery"]> { return this.ports.resumeDelivery(...args); }
  roleActivityLogText(...args: Parameters<LifecyclePorts["roleActivityLogText"]>): ReturnType<LifecyclePorts["roleActivityLogText"]> { return this.ports.roleActivityLogText(...args); }
  roleStatusText(...args: Parameters<LifecyclePorts["roleStatusText"]>): ReturnType<LifecyclePorts["roleStatusText"]> { return this.ports.roleStatusText(...args); }
  routeDispatch(...args: Parameters<LifecyclePorts["routeDispatch"]>): ReturnType<LifecyclePorts["routeDispatch"]> { return this.ports.routeDispatch(...args); }
  runTaskIsFenced(...args: Parameters<LifecyclePorts["runTaskIsFenced"]>): ReturnType<LifecyclePorts["runTaskIsFenced"]> { return this.ports.runTaskIsFenced(...args); }
  selectRunChangeForHandle(...args: Parameters<LifecyclePorts["selectRunChangeForHandle"]>): ReturnType<LifecyclePorts["selectRunChangeForHandle"]> { return this.ports.selectRunChangeForHandle(...args); }
  sessionTailText(...args: Parameters<LifecyclePorts["sessionTailText"]>): ReturnType<LifecyclePorts["sessionTailText"]> { return this.ports.sessionTailText(...args); }
  targetKey(...args: Parameters<LifecyclePorts["targetKey"]>): ReturnType<LifecyclePorts["targetKey"]> { return this.ports.targetKey(...args); }
  terminateRoleRun(...args: Parameters<LifecyclePorts["terminateRoleRun"]>): ReturnType<LifecyclePorts["terminateRoleRun"]> { return this.ports.terminateRoleRun(...args); }
  withRequestLifecycle(...args: Parameters<LifecyclePorts["withRequestLifecycle"]>): ReturnType<LifecyclePorts["withRequestLifecycle"]> { return this.ports.withRequestLifecycle(...args); }
}
