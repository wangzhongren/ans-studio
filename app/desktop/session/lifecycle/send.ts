// app/desktop/session/lifecycle/send.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B7、附录 A lifecycle 组）：8 个方法自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动（仅声明行 `private ` 前缀移除——模块内 public 仅为门面委托可调用；
// 门面保留同名同签名同可见性的薄委托）。类外壳重建原 receiver 面：
//  · 本文件使用到的跨方法/跨模块调用以同名同签名薄包装指向 `LifecycleHost`（方法体文本保持
//    `this.<name>(...)` 原样；包装为运行期直转发，不加异步层）；
//  · 状态字段（方案 §3.6 的 11 个 lifecycle 字段）与只读引用经宿主访问器暴露（同一实例，无第二份状态）。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { OrchestrationEvent, HandbackEvent } from "../../../../src/common/编排/handback.ts";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../../src/common/shared/diagnostics.ts";
import { mainT } from "../../i18n.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../../../src/model/runtime.ts";
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
import {
  shortenText, isAppTaskClientMessageId, APP_TASK_CLIENT_MESSAGE_ID_PREFIX, boundTurnText, filePrint,
  isAssistantTextEvent, shouldSuppressStarTaskReport,
} from "../shared/text.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import {
  taskCreators, rememberTaskCreator, readTasks, isFixedTask, appendTaskStateResult, appendTaskState,
  recordTaskFailure, appendRoleActivity,
} from "../shared/tasks-store.ts";
import type { LifecycleHost } from "./host.ts";
import type { ObservedHandleRecord } from "./state.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";

export class LifecycleSend {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

  private get activeRoleId(): string | null { return this.host.activeRoleId; }
  private set activeRoleId(value: string | null) { this.host.activeRoleId = value; }
  private get deliveredAppTaskIds(): Set<string> { return this.host.deliveredAppTaskIds; }
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.host.deliveryQueues; }
  private get messageSeq(): number { return this.host.messageSeq; }
  private set messageSeq(value: number) { this.host.messageSeq = value; }
  private get observedHandleIds(): WeakMap<RoleSessionHandle, string> { return this.host.observedHandleIds; }
  private get observedHandles(): Map<string, ObservedHandleRecord> { return this.host.observedHandles; }
  private get selectionVersion(): number { return this.host.selectionVersion; }
  private get sessions(): Map<string, LiveSession> { return this.host.sessions; }
  private activeEntry(...args: Parameters<LifecycleHost["activeEntry"]>): ReturnType<LifecycleHost["activeEntry"]> { return this.host.activeEntry(...args); }
  private deliveryIsStopped(...args: Parameters<LifecycleHost["deliveryIsStopped"]>): ReturnType<LifecycleHost["deliveryIsStopped"]> { return this.host.deliveryIsStopped(...args); }
  private enqueueDelivery(...args: Parameters<LifecycleHost["enqueueDelivery"]>): ReturnType<LifecycleHost["enqueueDelivery"]> { return this.host.enqueueDelivery(...args); }
  private hasBusyRuntime(...args: Parameters<LifecycleHost["hasBusyRuntime"]>): ReturnType<LifecycleHost["hasBusyRuntime"]> { return this.host.hasBusyRuntime(...args); }
  private isFixedTask(...args: Parameters<LifecycleHost["isFixedTask"]>): ReturnType<LifecycleHost["isFixedTask"]> { return this.host.isFixedTask(...args); }
  private noteWatchdogActivity(...args: Parameters<LifecycleHost["noteWatchdogActivity"]>): ReturnType<LifecycleHost["noteWatchdogActivity"]> { return this.host.noteWatchdogActivity(...args); }
  private notifyRoleState(...args: Parameters<LifecycleHost["notifyRoleState"]>): ReturnType<LifecycleHost["notifyRoleState"]> { return this.host.notifyRoleState(...args); }
  private now(...args: Parameters<LifecycleHost["now"]>): ReturnType<LifecycleHost["now"]> { return this.host.now(...args); }
  private pendingAppTaskDelivery(...args: Parameters<LifecycleHost["pendingAppTaskDelivery"]>): ReturnType<LifecycleHost["pendingAppTaskDelivery"]> { return this.host.pendingAppTaskDelivery(...args); }
  private profileRevision(...args: Parameters<LifecycleHost["profileRevision"]>): ReturnType<LifecycleHost["profileRevision"]> { return this.host.profileRevision(...args); }
  private queueKey(...args: Parameters<LifecycleHost["queueKey"]>): ReturnType<LifecycleHost["queueKey"]> { return this.host.queueKey(...args); }
  private readTasks(...args: Parameters<LifecycleHost["readTasks"]>): ReturnType<LifecycleHost["readTasks"]> { return this.host.readTasks(...args); }
  private rebuildIfBoundaryStale(...args: Parameters<LifecycleHost["rebuildIfBoundaryStale"]>): ReturnType<LifecycleHost["rebuildIfBoundaryStale"]> { return this.host.rebuildIfBoundaryStale(...args); }
  private rememberAppTaskDelivered(...args: Parameters<LifecycleHost["rememberAppTaskDelivered"]>): ReturnType<LifecycleHost["rememberAppTaskDelivered"]> { return this.host.rememberAppTaskDelivered(...args); }
  private runTaskIsFenced(...args: Parameters<LifecycleHost["runTaskIsFenced"]>): ReturnType<LifecycleHost["runTaskIsFenced"]> { return this.host.runTaskIsFenced(...args); }
  private sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return this.host.sessionKey(...args); }
  private targetKey(...args: Parameters<LifecycleHost["targetKey"]>): ReturnType<LifecycleHost["targetKey"]> { return this.host.targetKey(...args); }

  // —— send（B7 自 session.ts 逐字搬移）——
  async send(text: string, opts?: PromptOptions, target?: SessionTarget, metadata?: SessionMessageMetadata): Promise<SendResult> {
    // **目标角色在入口定格（2026-10-13 状态机修复）**：并发作废重建（settle 触发的 refreshStaleBoundaries
    // 与本次 send 各自的重建赛跑）会在窗口里清空/替换 `activeRoleId`——按「当下的 activeRoleId」取条目会让
    // 本条消息**落空**（旧实现会回「会话尚未开启」且消息丢失）。用户的意图是入口那一刻的活动角色，照它走。
    let clientMessageId: string | undefined;
    if (typeof metadata?.clientMessageId === "string" && metadata.clientMessageId !== "") clientMessageId = metadata.clientMessageId;
    // 应用代客户推送（2026-10-18）：后台投递——不抢 activeRoleId、不把「当前为空」复位成目标角色。
    const background = metadata?.background === true;
    // 2026-10-26 客户真机：治理唤醒按 `system` 入队（UI 显示「系统」、不可撤回）；缺省仍是客户消息类别。
    // 只认可 `background` 投递上的 system 标记——渲染侧即便伪造 metadata 也不会把客户消息伪装成系统条目。
    const deliveryKind: "message" | "system" = background && metadata?.kind === "system" ? "system" : "message";
    let targetRoleId = this.activeRoleId;
    if (target !== undefined) targetRoleId = this.targetKey(target) ?? null;
    const selectionVersion = this.selectionVersion;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: this.activeEntry()?.projectRoot, roleId: targetRoleId ?? undefined });
    diagnostic.record("session.send.start");
    // **2026-10-25 重复投递修复**：应用任务的稳定键已投递过（ACK/成功）⇒ 本次调用不再发送。
    // 判据只认应用后台投递（`sendBackground`）生成的 `ans-app-task:` 键；真实客户消息（渲染侧 UUID、
    // 无 background 标记）不会命中——「同文重复发送是两个意图」的语义不受影响。
    const appTaskId = background && isAppTaskClientMessageId(clientMessageId) ? clientMessageId : undefined;
    if (appTaskId !== undefined && this.deliveredAppTaskIds.has(appTaskId)) {
      diagnostic.record("session.send.duplicate", { reasonCode: "delivered" });
      return { ok: true, clientMessageId: appTaskId, duplicate: true };
    }
    // O-1（2026-10-12）：发言前先查**边界快照**——陈旧 ⇒ 先作废重建（本条发言直接落到新边界会话上；
    // 重建失败 ⇒ 如实回错、本条不发送）。在跑的轮次由 rebuild 内部跳过（不打断）。
    if (targetRoleId !== null) {
      const rebuilt = await this.rebuildIfBoundaryStale(targetRoleId, !background);
      if (rebuilt !== undefined && !rebuilt.reopened.ok) {
        diagnostic.error("session.send.failed", new Error(rebuilt.reopened.error || "重开失败"));
        return { ok: false, error: mainT("main.session.rebuildFailedNoSend", { detail: rebuilt.reopened.error ?? mainT("shared.common.unknownReason") }) };
      }
    }
    const entry = targetRoleId !== null ? this.sessions.get(targetRoleId) : undefined;
    if (!entry) {
      diagnostic.record("session.send.failed", { reasonCode: "session-not-open" });
      return { ok: false, error: mainT("main.session.notOpen") };
    }
    // **同一应用任务已在队列/在途（含直接 send 开跑的那一轮）⇒ 不重复入队/发送**——重建前后、两条应用
    // 链路各调一次时，客户侧只看到一条 user 消息（重复调用方拿到 `duplicate:true`，仍视为已受理）。
    if (appTaskId !== undefined) {
      const pending =
        this.pendingAppTaskDelivery(entry.projectRoot, entry.roleId, entry.runtime, appTaskId) ??
        (entry.origins.running?.clientMessageId === appTaskId ? { queued: false } : undefined);
      if (pending !== undefined) {
        diagnostic.record("session.send.duplicate", { reasonCode: pending.queued ? "queued" : "in-flight" });
        return {
          ok: true,
          clientMessageId: appTaskId,
          duplicate: true,
          ...(pending.queued ? { queued: true, ...(pending.position !== undefined ? { position: pending.position } : {}) } : {}),
        };
      }
    }
    // 并发重建可能把活动指针清掉（dispose 置 null、后台重开不抢位）——用户意图仍指向 targetRoleId：复位。
    // （若用户期间开了**别的**角色，activeRoleId 非 null，不动它——不抢位。）
    // **后台投递不复位活动指针**（应用代客户派发 ≠ 用户切换 pane；当前 pane 保持原样）。
    if (this.activeRoleId === null && this.selectionVersion === selectionVersion && !background) this.activeRoleId = targetRoleId;
    this.noteWatchdogActivity(entry.projectRoot, background ? "governance-advance" : "customer-send"); // G-2/W3：客户消息 = 真实活动（无论直发还是入队，都在此定格）
    // P0（2026-10-30）：先自愈「busy 已复位但 origin 残留」的陈旧归属；忙/已有 origin 一律入队（不覆盖）。
    this.healStaleOrigin(entry, "stale-origin-before-send");
    const queueBecauseBusy = (): SendResult => {
      const roleId = entry.roleId;
      this.enqueueDelivery(entry.projectRoot, roleId, {
        kind: deliveryKind,
        clientMessageId,
        runtime: entry.runtime,
        targetRoleId: roleId,
        sourceRoleId: roleId,
        text,
        // 系统条目摘要不写「你：」（队列行已按 kind 显示「系统」）；客户消息文案逐字不变。
        summary: deliveryKind === "system" ? shortenText(text, 40) : mainT("main.session.youMessage", { text: shortenText(text, 40) }),
        // 客户消息逐条独立（**不去重**——同文重复发送是两个意图）：键含自增序号+时间。
        dedupKey: `msg\u0000${++this.messageSeq}\u0000${Date.now()}`,
        // P0-1：**入队即定格**——原包存进条目；投递组合来源和 ACK，图片引用不变。
        ...(opts !== undefined ? { opts } : {}),
      });
      const q = this.deliveryQueues.get(this.queueKey(entry.projectRoot, roleId, entry.runtime));
      diagnostic.record("session.send.queued", { queueDepth: q?.length ?? 0 });
      return { ok: true, queued: true, position: q ? q.length : 1, ...(clientMessageId !== undefined ? { clientMessageId } : {}) };
    };
    if (entry.busy || entry.origins.running !== undefined || (entry.runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
      return queueBecauseBusy();
    }
    const roleId = entry.roleId;
    // L-1 顺序修正（与投递机同款，防竞态）：**先置忙再 await**——快适配器（如演示 runtime）的事件
    // （含 `settled`）可能在 `send` 返回前就被消费循环处理完；若此刻才置忙，settled 的复位会被反向覆盖，
    // 忙态将**永不复位**（队列也永不放行）。失败 ⇒ 复位 + 外推（并没有在跑，如实）。
    const origin = this.beginDeliveryOrigin(entry, clientMessageId);
    if (origin === undefined) return queueBecauseBusy(); // turn lease 争用（同步段不可达；防御：入队不覆盖）
    // Direct and queued inputs retain the same actual source kind, including customer messages.
    origin.kind = deliveryKind;
    entry.interactionState.turn = new AbortController();
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准；busy 期间才被读取）
    entry.lastTurnAborted = undefined; // 新一轮开始：上一轮的中止标记不再适用于本轮
    // P0-2 前置修正（2026-10-13，随停止入口同批）：**开跑即外推 busy=true**——与投递机同款
    //（先置忙即推快照）。旧版只在 round 结束后推：长轮次（真实 pi 一轮数分钟）期间界面根本收不到
    // 「工作中」快照——停止钮与左树徽标都无从在轮次**进行中**出现（快适配器掩盖了这条缝；停止入口
    // 把缝暴露出来）。此处开跑即推（如实）；结束后那次保留（兜底快适配器「settled 先于 send 返回
    // 被消费」的竞态）。
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    try {
      // P0-1：组合聊天来源与 ACK；图片数组保持原引用。
      await this.sendDelivery(entry, origin, text, opts);
      this.rememberAppTaskDelivered(clientMessageId); // 投递成功 ⇒ 应用任务记「已投递」（同任务不再重发）
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime); // 状态准确性：真开跑即外推「工作中」（繁忙与否以会话条目为准）
      diagnostic.record("session.send.end", { ok: true });
      return { ok: true, ...this.sendFacts(entry, origin) };
    } catch (err) {
      diagnostic.error("session.send.failed", err);
      // **已 ACK（turnId 已绑定）后再失败：输入已交给运行时，不再当未投递**——记「已投递」标记，
      // 应用侧同一任务的重试调用会被 `duplicate` 拦下（at-most-once；失败重试只对未 ACK 的成立）。
      if (origin.turnId !== undefined) this.rememberAppTaskDelivered(clientMessageId);
      const ownsRunningDelivery = entry.origins.running === origin;
      this.failDeliveryOrigin(entry, origin);
      if (ownsRunningDelivery) {
        entry.interactionState.turn.abort();
        entry.busy = false;
        entry.busySince = undefined;
      }
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
      return { ok: false, error: err instanceof Error ? err.message : String(err), ...this.sendFacts(entry, origin) };
    }
  }

  // —— sendDelivery（B7 自 session.ts 逐字搬移）——
  async sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback = false, handbackTaskId?: string,
    reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice = false, controllerResume?: ControllerResumeDelivery): Promise<void> {
    const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
    const current = () => this.sessions.get(key) === entry && entry.origins.running === origin && !origin.settled &&
      !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted && !this.deliveryIsStopped(key);
    if (!current()) throw new Error("delivery-assignment-source-changed:当前会话或投递来源已变化");
    let assignment: DeliveryAssignment | undefined;
    const resolve = async (source: Parameters<typeof resolveDeliveryAssignment>[0]["source"], flowId?: string, runId?: string) => {
      const result = await resolveDeliveryAssignment({ projectRoot: entry.projectRoot, recipientRoleId: entry.roleId, source,
        ...(flowId ? { expectedFlowId: flowId } : {}), ...(runId ? { expectedRunId: runId } : {}) });
      if (!current()) throw new Error("delivery-assignment-source-changed:核验期间当前会话或投递来源已变化");
      if (!result.ok) { origin.assignmentRejectionCode = result.code; throw new Error(`${result.code}:${result.message}`); }
      if (assignment && (assignment.taskId !== result.value.taskId || assignment.flowId !== result.value.flowId || assignment.runId !== result.value.runId))
        throw new Error("delivery-assignment-mixed:不同父任务的回交不能共用一次任务回合");
      assignment = result.value;
    };
    if (requiresHandback && handbackTaskId) {
      // T3 B1（AC-12/AC-23）：fixed 任务（task.created 携带 workflowId）不是 trunk run assignment——
      // 跳过 legacy 的 assigned-task 绑定解析（否则无 runId 的 fixed 任务必然
      // `delivery-assignment-unavailable` 而无法投递）。legacy 任务路径逐字不变。
      // T3 B8.2（2026-11-11，RR3 根因 2）：但 fixed 派发**必须把本轮 origin 绑定到真实任务 id/flow**
      // （task.created 账本事实，无 run/assignment）——否则运营回合的 `dispatch_task` 拿不到
      // `source.origin.taskId`，生产派发无法自动绑定 workflowId（B8.2 的绑定证据恰在此）。
      const fixedTaskRecord = (await this.readTasks(entry.projectRoot)).records.get(handbackTaskId);
      const fixedCreated = fixedTaskRecord?.created;
      if (fixedCreated?.workflowId !== undefined) {
        origin.taskId = handbackTaskId;
        if (typeof fixedCreated.flowId === "string" && fixedCreated.flowId !== "") origin.flowIds = [fixedCreated.flowId];
      } else {
        await resolve({ kind: "assigned-task", taskId: handbackTaskId }, origin.flowIds?.length === 1 ? origin.flowIds[0] : undefined);
      }
    } else if (origin.kind === "handback" && entry.roleId === "convener") {
      if (!reportedChildren?.length) throw new Error("delivery-child-source-invalid:缺少真实报告child来源，未按旧任务续投");
      for (const child of reportedChildren) {
        // T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交已在 drain 的
        // `inspectHandbackAssignment` 按 tasks/workflows 账本事实校验（child 无 legacy `parentTaskRef`/run），
        // 这里**跳过** legacy `resolveDeliveryAssignment`（否则 fixed 回交会在发送前被误判
        // `delivery-child-source-invalid`）；legacy 子任务逐字走旧解析（旧行为不变）。
        if (await this.isFixedTask(entry.projectRoot, child.childTaskId)) continue;
        await resolve({ kind: "child-report", childTaskId: child.childTaskId, childRoleId: child.childRoleId }, child.flowId);
      }
    } else if (origin.kind === "system") {
      const bound = queuedSystemAssignment === undefined ? entry.boundAssignment : queuedSystemAssignment;
      if (bound) await resolve({ kind: "assigned-task", taskId: bound.taskId }, bound.flowId, bound.runId);
    } else if (origin.kind === "message") {
      delete entry.boundAssignment; // A new customer chat explicitly clears any older assignment, including constructor taskId.
    }
    if (!current()) throw new Error("delivery-assignment-source-changed:发送前当前投递已失效");
    if (assignment && this.runTaskIsFenced(entry.projectRoot, assignment.taskId, assignment.runId)) {
      origin.assignmentRejectionCode = "run-stop-host-fenced"; throw new Error("run-stop-host-fenced:原运行正在停止，未重新投递。");
    }
    entry.lastUserText = boundTurnText(text);
    if (assignment) { origin.taskId = assignment.taskId; origin.assignment = assignment; origin.flowIds = [assignment.flowId]; }
    const acceptAssignment = () => { if (assignment && this.sessions.get(key) === entry && !entry.interactionState.lifetime.signal.aborted) {
      entry.boundAssignment = assignment;
      const id = this.observedHandleIds.get(entry.handle), observed = id ? this.observedHandles.get(id) : undefined;
      if (observed) { observed.fact.taskId = assignment.taskId; if (assignment.runId) observed.fact.runId = assignment.runId; }
    } };
    // Task identity remains fresh for explicit reports/tools. An application receipt notice is not
    // another assigned work round; its acknowledgement alone must not manufacture a fallback report.
    // Ordinary system continuations and real child reports retain their work/report obligation.
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed 派发按 B1 不解析 legacy
    // assignment——但本轮 origin 已由 B8.2 绑定真实 fixed 任务（`origin.taskId`，task.created 账本事实）。
    // handback intent 必须带上该 taskId：run-role 的 `withHandback` 只用 intent.taskId 构造回交事件，
    // 缺它时 convener/product/verifier 的 `submit_report` 一律以「任务关联未知」到达、`task.reported`
    // 不写、close accepted 报 `close-report-missing`（RR5 实测）。legacy 路径中 `origin.taskId` 恒等于
    // `assignment.taskId`，行为逐字不变；无任务聊天/回交条目不带 taskId（沿用旧语义）。
    // fixed 回交回合（worker→convener 等）：目标会话自身已绑定真实受派任务（`assignedTaskId`）时，
    // 创建者在该回合向幕僚的进度/阻塞报告同样关联到自己的任务（否则又会是「任务关联未知」）。
    // 该回合 intent.required=false（无自动回交）；只有模型显式 submit_report 才会产生关联报告。
    const handbackIntentTaskId = assignment?.taskId
      ?? (typeof origin.taskId === "string" && origin.taskId !== "" ? origin.taskId
        : origin.kind === "handback" && entry.sessionWorkflowMode === "fixed"
          && typeof entry.assignedTaskId === "string" && entry.assignedTaskId !== "" ? entry.assignedTaskId : undefined);
    let promptOptions: RoleSessionSendOptions = { ...opts, handback: { required: requiresHandback || assignment !== undefined && !applicationNotice,
      ...(handbackIntentTaskId !== undefined ? { taskId: handbackIntentTaskId } : {}) } };
    const handbackInput = origin.kind === "handback" && opts?.inputProvenance?.kind === "handback" ? opts.inputProvenance : undefined;
    const creatorReports = handbackInput?.target.roleId === entry.roleId && handbackInput.target.runtime === entry.runtime &&
      handbackInput.reports.length > 0 && handbackInput.reports.length <= 16 && handbackInput.reports.every(report =>
        typeof report.taskId === "string" && report.taskId !== "" && report.reportId !== "" && report.source.roleId !== "" && report.source.turnId !== "")
      ? handbackInput.reports.map(report => ({ taskId: report.taskId!, roleId: report.source.roleId, reportId: report.reportId, turnId: report.source.turnId })) : undefined;
    if (entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined) {
      const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
        const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
        if (this.sessions.get(key) !== entry || (origin.settled && origin.turnId === undefined)) return;
        if (metadata.runtime !== entry.runtime || metadata.roleId !== entry.roleId || typeof metadata.turnId !== "string" || metadata.turnId === "") return;
        if (origin.turnId === undefined) {
          origin.turnId = metadata.turnId;
          if (creatorReports) origin.creatorReports = structuredClone(creatorReports);
          acceptAssignment();
          entry.origins.byTurn.set(metadata.turnId, origin);
          // **ACK 即已投递**（2026-10-25）：应用任务的稳定键在运行时同步开轮回执时即记「已投递」——
          // 之后即便发送 promise 因重建/收尾阶段报错，同一任务也不会被重投（at-most-once）。
          this.rememberAppTaskDelivered(origin.clientMessageId);
          // **P0 队列可见性（2026-10-30）**：ACK 绑定 turnId 后立刻外推一次快照——
          // `activeTurnId` 才能如实到达界面（claim 时的快照早于 ACK，会显示空）。
          this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
        }
        opts?.onTurnStarted?.(metadata);
      };
      promptOptions = { ...promptOptions, onTurnStarted };
    }
    if (controllerResume) {
      const inspected = await inspectQueuedControllerResume({ projectRoot: entry.projectRoot, resumeController: controllerResume.expected, resumeKey: controllerResume.resumeKey, basisDigest: controllerResume.basisDigest });
      if (!inspected.ok) { origin.assignmentRejectionCode = inspected.code; throw new Error(`${inspected.code}:${inspected.message ?? inspected.code}`); }
      if (!current() || assignment?.taskId !== inspected.value.taskId || assignment.runId !== inspected.value.runId || assignment.flowId !== inspected.value.flowId)
        { origin.assignmentRejectionCode = "controller-resume-source-changed"; throw new Error("controller-resume-source-changed:实际运营输入身份已变化"); }
    }
    await entry.handle.send(text, promptOptions);
    acceptAssignment();
  }

  // —— sendFacts（B7 自 session.ts 逐字搬移）——
  sendFacts(entry: LiveSession, origin: DeliveryOrigin): Pick<SendResult, 'turnId' | 'clientMessageId' | 'inputAccepted' | 'outcome' | 'sessionCurrent'> {
    return {
      ...(origin.turnId !== undefined ? { turnId: origin.turnId } : {}),
      ...(origin.clientMessageId !== undefined ? { clientMessageId: origin.clientMessageId } : {}),
      ...(origin.inputAccepted ? { inputAccepted: true } : {}),
      ...(origin.outcome !== undefined ? { outcome: origin.outcome } : {}),
      sessionCurrent: this.sessions.get(this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime)) === entry,
    };
  }

  // —— beginDeliveryOrigin（B7 自 session.ts 逐字搬移）——
  beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined {
    if (entry.busy || entry.origins.running !== undefined) return undefined;
    const origin: DeliveryOrigin = { settled: false };
    if (clientMessageId !== undefined) origin.clientMessageId = clientMessageId;
    entry.origins.running = origin;
    return origin;
  }

  // —— captureDeliveryOrigin（B7 自 session.ts 逐字搬移）——
  captureDeliveryOrigin(entry: LiveSession, event: OrchestrationEvent): DeliveryOrigin | undefined {
    if (event.kind === "handback") return undefined;
    if (event.runtime !== undefined && event.runtime !== entry.runtime) return undefined;
    if (event.roleId !== undefined && event.roleId !== entry.roleId) return undefined;
    if (typeof event.turnId !== "string" || event.turnId === "") return undefined;
    return entry.origins.byTurn.get(event.turnId); // Only the original prompt's real ack creates this mapping.
  }

  // —— trimDeliveryOrigins（B7 自 session.ts 逐字搬移）——
  trimDeliveryOrigins(entry: LiveSession): void {
    if (entry.origins.byTurn.size <= 128) return;
    for (const [turnId, origin] of entry.origins.byTurn) {
      if (!origin.settled || origin === entry.origins.running) continue;
      entry.origins.byTurn.delete(turnId);
      if (entry.origins.byTurn.size <= 128) break;
    }
  }

  // —— failDeliveryOrigin（B7 自 session.ts 逐字搬移）——
  failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void {
    // A bound real turn keeps its original ID for the delayed failed/aborted terminal.
    origin.settled = true;
    if (entry.origins.running === origin) delete entry.origins.running;
    this.trimDeliveryOrigins(entry);
  }

  // —— healStaleOrigin（B7 自 session.ts 逐字搬移）——
  healStaleOrigin(entry: LiveSession, reasonCode: string): boolean {
    const stale = entry.origins.running;
    if (entry.busy || stale === undefined) return false;
    stale.settled = true;
    delete entry.origins.running;
    this.trimDeliveryOrigins(entry);
    createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).record(
      "turn.origin-missing",
      {
        reasonCode,
        ...(stale.turnId !== undefined ? { turnId: stale.turnId } : {}),
        queueDepth: (this.deliveryQueues.get(this.queueKey(entry.projectRoot, entry.roleId, entry.runtime)) ?? []).length,
      },
    );
    return true;
  }
}
