// app/desktop/session/lifecycle/consume.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B7、附录 A lifecycle 组）：1 个方法自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动（仅声明行 `private ` 前缀移除——模块内 public 仅为门面委托可调用；
// 门面保留同名同签名同可见性的薄委托）。类外壳重建原 receiver 面：
//  · 本文件使用到的跨方法/跨模块调用以同名同签名薄包装指向 `LifecycleHost`（方法体文本保持
//    `this.<name>(...)` 原样；包装为运行期直转发，不加异步层）；
//  · 状态字段（方案 §3.6 的 11 个 lifecycle 字段）与只读引用经宿主访问器暴露（同一实例，无第二份状态）。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import { RuntimeDeliveryError, REQUEST_TIMEOUT_ERROR_CODES, MODEL_REQUEST_RETRY_EXHAUSTED, GOVERNANCE_SLUG_PATTERN, WORKFLOW_LEDGER_SCHEMA, isRuntimeSessionDrained, isTaskWorkSourceRef, isDispatchTaskResumeController, isWorkflowPath, isWorkflowStage } from "../../../../src/model/runtime.ts";
import { isRequestFailureCode } from "../../../../src/common/runtime-core/request-timeout.ts";
import { isNetworkOfflineFailureCode } from "../../../../src/common/runtime-core/network-gate.ts";
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../../src/common/shared/diagnostics.ts";
import { classifyProcessOutcome, pickLatestSessionFile, sessionsDirFor } from "../../session-history.ts";
import { mainT } from "../../i18n.ts";
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
import {
  desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory,
  desktopSessionManagers as inventorySessionManagers,
  type SessionInventoryState,
} from "../shared/inventory.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import type { LifecycleHost } from "./host.ts";
import type { ObservedHandleRecord } from "./state.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";

export class LifecycleConsume {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

  private get activeDeliveries(): Map<string, DeliveryItem> { return this.host.activeDeliveries; }
  private get deliveredDeliveryKeys(): Set<string> { return this.host.deliveredDeliveryKeys; }
  private get lastAssistantText(): Map<string, { turnId?: string; text: string }> { return this.host.lastAssistantText; }
  private get lastTurns(): Map<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }> { return this.host.lastTurns; }
  private get sessions(): Map<string, LiveSession> { return this.host.sessions; }
  private captureDeliveryOrigin(...args: Parameters<LifecycleHost["captureDeliveryOrigin"]>): ReturnType<LifecycleHost["captureDeliveryOrigin"]> { return this.host.captureDeliveryOrigin(...args); }
  private displayHandback(...args: Parameters<LifecycleHost["displayHandback"]>): ReturnType<LifecycleHost["displayHandback"]> { return this.host.displayHandback(...args); }
  private drainAllQueuesFor(...args: Parameters<LifecycleHost["drainAllQueuesFor"]>): ReturnType<LifecycleHost["drainAllQueuesFor"]> { return this.host.drainAllQueuesFor(...args); }
  private drainPiQueuesAcrossProjects(...args: Parameters<LifecycleHost["drainPiQueuesAcrossProjects"]>): ReturnType<LifecycleHost["drainPiQueuesAcrossProjects"]> { return this.host.drainPiQueuesAcrossProjects(...args); }
  private emitDeliveryNote(...args: Parameters<LifecycleHost["emitDeliveryNote"]>): ReturnType<LifecycleHost["emitDeliveryNote"]> { return this.host.emitDeliveryNote(...args); }
  private evictBeyondLimit(...args: Parameters<LifecycleHost["evictBeyondLimit"]>): ReturnType<LifecycleHost["evictBeyondLimit"]> { return this.host.evictBeyondLimit(...args); }
  private inventoryChanged(...args: Parameters<LifecycleHost["inventoryChanged"]>): ReturnType<LifecycleHost["inventoryChanged"]> { return this.host.inventoryChanged(...args); }
  private lookupGovernanceClientProjection(...args: Parameters<LifecycleHost["lookupGovernanceClientProjection"]>): ReturnType<LifecycleHost["lookupGovernanceClientProjection"]> { return this.host.lookupGovernanceClientProjection(...args); }
  private mergeReportState(...args: Parameters<LifecycleHost["mergeReportState"]>): ReturnType<LifecycleHost["mergeReportState"]> { return this.host.mergeReportState(...args); }
  private mirrorGovernanceFeedback(...args: Parameters<LifecycleHost["mirrorGovernanceFeedback"]>): ReturnType<LifecycleHost["mirrorGovernanceFeedback"]> { return this.host.mirrorGovernanceFeedback(...args); }
  private noteWatchdogActivity(...args: Parameters<LifecycleHost["noteWatchdogActivity"]>): ReturnType<LifecycleHost["noteWatchdogActivity"]> { return this.host.noteWatchdogActivity(...args); }
  private notifyRoleState(...args: Parameters<LifecycleHost["notifyRoleState"]>): ReturnType<LifecycleHost["notifyRoleState"]> { return this.host.notifyRoleState(...args); }
  private now(...args: Parameters<LifecycleHost["now"]>): ReturnType<LifecycleHost["now"]> { return this.host.now(...args); }
  private observeRoleEvent(...args: Parameters<LifecycleHost["observeRoleEvent"]>): ReturnType<LifecycleHost["observeRoleEvent"]> { return this.host.observeRoleEvent(...args); }
  private observeWatchdog(...args: Parameters<LifecycleHost["observeWatchdog"]>): ReturnType<LifecycleHost["observeWatchdog"]> { return this.host.observeWatchdog(...args); }
  private persistDeliveryQueues(...args: Parameters<LifecycleHost["persistDeliveryQueues"]>): ReturnType<LifecycleHost["persistDeliveryQueues"]> { return this.host.persistDeliveryQueues(...args); }
  private queueKey(...args: Parameters<LifecycleHost["queueKey"]>): ReturnType<LifecycleHost["queueKey"]> { return this.host.queueKey(...args); }
  private rememberAppTaskDelivered(...args: Parameters<LifecycleHost["rememberAppTaskDelivered"]>): ReturnType<LifecycleHost["rememberAppTaskDelivered"]> { return this.host.rememberAppTaskDelivered(...args); }
  private rememberReceipt(...args: Parameters<LifecycleHost["rememberReceipt"]>): ReturnType<LifecycleHost["rememberReceipt"]> { return this.host.rememberReceipt(...args); }
  private resumeDeferredRunChanges(...args: Parameters<LifecycleHost["resumeDeferredRunChanges"]>): ReturnType<LifecycleHost["resumeDeferredRunChanges"]> { return this.host.resumeDeferredRunChanges(...args); }
  private trimDeliveryOrigins(...args: Parameters<LifecycleHost["trimDeliveryOrigins"]>): ReturnType<LifecycleHost["trimDeliveryOrigins"]> { return this.host.trimDeliveryOrigins(...args); }

  // —— consume（B7 自 session.ts 逐字搬移）——
  consume(key: string, entry: LiveSession): void {
    const { roleId, handle, projectRoot, runtime } = entry;
    entry.eventConsumerDone = (async () => {
      try {
        for await (const ev of handle.events()) {
          if (this.sessions.get(key) !== entry) break;
          this.inventoryChanged(projectRoot, "runtime-event-observed");
          const origin = this.captureDeliveryOrigin(entry, ev);
          if (origin && ev.kind === 'message') {
            const detail = ev.detail as { source?: unknown; text?: unknown } | undefined;
            if (detail?.source === 'prompt-input' && typeof detail.text === 'string') origin.inputAccepted = true;
          }
          if (origin && ev.kind === 'settled') {
            const outcome = (ev.detail as { outcome?: unknown } | undefined)?.outcome;
            if (outcome === 'completed' || outcome === 'failed' || outcome === 'aborted' || outcome === 'timed_out') origin.outcome ??= outcome;
          }
          const envelope: SessionEventEnvelope = { roleId, projectRoot, runtime, event: ev.kind === 'handback' ? this.displayHandback(ev) : ev };
          // B 批（2026-10-28）：应用侧运行日志观察器（摘要 ≤200、脱敏；失败只诊断，不影响事件流）。
          // 非持久会话（persistSession=false）不创建 `.ans/state`——保留「纯内存会话零项目写入」既有契约。
          if (entry.handle.persistenceMode !== "disabled") this.observeRoleEvent(projectRoot, roleId, ev);
          // `clientMessageId` 的对外语义是**客户消息显示关联**（渲染侧乐观行 ACK 用）；应用任务的稳定
          // 身份（`ans-app-task:`）只在投递层去重使用，不冒充客户消息 ID 外推（匿名派发的事件仍匿名）。
          if (
            ev.kind !== "handback" &&
            typeof ev.turnId === "string" &&
            ev.turnId !== "" &&
            origin?.clientMessageId !== undefined &&
            !isAppTaskClientMessageId(origin.clientMessageId)
          ) {
            envelope.clientMessageId = origin.clientMessageId;
          }
          // E-1/H-1：settled ⇒ 该会话离开「忙」，并尝试按序放行**本项目各队列**的积压投递。
          // 投递触发**不挑目标**（历史上单队列按项目存放时就是如此）：一轮结束=下一次放行时机（E-1 的
          // 重试时机之一），各队列在 drainQueue 里各自检查「目标忙/未开」后再决定是否真投。
          const sourceMatches = ev.kind !== "handback" && (ev.runtime === undefined || ev.runtime === runtime) && (ev.roleId === undefined || ev.roleId === roleId);
          // **P0 收尾不变量（2026-10-30 现场）**：settled 按 turnId 兜底清 busy——即便 origin 精确匹配
          // 不成立（origin 缺失/被失败投递删掉/事件缺 turnId），也不得让 busy 永久残留（现场 turn.end 后
          // 无 delivery.end、busy 不复位、target-busy 冻结队列）。唯一例外：**两个已知 turnId 明确不同**
          // ——迟到旧回合的 settled 不得清掉正在跑的新回合（多 runtime 既有语义）。
          const runningOrigin = entry.origins.running;
          const eventTurnId = ev.kind !== "handback" && typeof ev.turnId === "string" && ev.turnId !== "" ? ev.turnId : undefined;
          const trackedTurnId = runningOrigin?.turnId;
          const differentKnownTurn = trackedTurnId !== undefined && eventTurnId !== undefined && trackedTurnId !== eventTurnId;
          const originMatchesRunning = origin !== undefined && origin === runningOrigin;
          if (ev.kind === "settled" && sourceMatches && !differentKnownTurn) {
            // 收尾推进：`origin` 可能为 undefined（旧式空 turnId / origin 已缺失），本轮投递事实仍在
            // `origins.running` 上——先定格，再删除。
            const settledOrigin = origin ?? runningOrigin;
            if (origin) origin.settled = true;
            delete entry.origins.running;
            this.trimDeliveryOrigins(entry);
            const originMissing = !originMatchesRunning;
            const settledDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
            if (entry.busy || originMatchesRunning) {
              const settledDetail = ev.detail as { outcome?: unknown; errorCode?: unknown; attempts?: unknown; replaySafe?: unknown } | undefined;
              const settledOutcomeRaw = settledDetail?.outcome;
              const settledErrorCodeRaw = settledDetail?.errorCode;
              settledDiagnostic.record("turn.settled", {
                ...(eventTurnId !== undefined ? { turnId: eventTurnId } : {}),
                state: originMissing ? "origin-missing" : "origin-matched",
                busy: entry.busy,
                ...(typeof settledOutcomeRaw === "string" ? { outcome: settledOutcomeRaw } : {}),
                ...(typeof settledErrorCodeRaw === "string" ? { errorCode: settledErrorCodeRaw } : {}),
                // P3：诊断沿用既有白名单字段承载 attempts/replaySafe（attempt←attempts、replayPlan←replaySafe）。
                ...(typeof settledDetail?.attempts === "number" && Number.isFinite(settledDetail.attempts) ? { attempt: settledDetail.attempts } : {}),
                ...(typeof settledDetail?.replaySafe === "boolean" ? { replayPlan: settledDetail.replaySafe ? "safe" : "unsafe" } : {}),
              });
            }
            if (originMissing && entry.busy) {
              settledDiagnostic.record("turn.origin-missing", {
                reasonCode: eventTurnId === undefined ? "settled-without-turn-id" : trackedTurnId === undefined ? "settled-before-turn-ack" : "settled-origin-mismatch",
                ...(eventTurnId !== undefined ? { turnId: eventTurnId } : {}),
              });
            }
            entry.interactionState.turn.abort();
            const en = this.sessions.get(key);
            if (en) {
              const wasBusy = en.busy; // G-2：只有真实「忙→闲」翻转才产生看护观察（重复/迟到的 settled 不重复计数）
              en.busy = false;
              en.busySince = undefined;
              // W6-B 真机阻塞修复：settle = 来源本轮写入完成——结算所有「等这一轮收尾」的等待者
              // （`advanceGovernanceFlow` 的 appointment 时序），再放行队列。
              const settleWaiters = en.settleWaiters;
              en.settleWaiters = undefined;
              for (const finish of settleWaiters ?? []) finish(true);
              // G-2/W1+W3：先读「进行中」条目再撤销——本轮是否由 `kind:"system"` 投递持有（看护自身的告警/
              // 收束/恢复回执）决定该 settle 是否算**真实活动**（刻意排除 ⇒ 防「总结完→又被立即催」的骚扰
              // 回路；静默阈值默认 30s＝一个 tick 的最小防抖——客户 2026-10-16 run-5 裁定，隔离更须严格）。
              const finishedDelivery = this.activeDeliveries.get(this.queueKey(en.projectRoot, roleId, runtime));
              // **P0（2026-10-30）：settle 收尾补 delivery 终态**。回合已经跑完 ⇒ 该投递的输入已被运行时接收；
              // 若 send promise 尚未记账（快适配器/挂起续段），由 settle 关闭并落**恰一次** `delivery.end`
              // （现场「turn.end 后无 delivery.end」的对账缺口）；随后续段不再重复记账。
              if (finishedDelivery !== undefined && finishedDelivery.terminalRecorded !== true) {
                finishedDelivery.terminalRecorded = true;
                this.deliveredDeliveryKeys.add(`${this.queueKey(en.projectRoot, roleId, runtime)}\u0000${finishedDelivery.dedupKey}`);
                this.rememberAppTaskDelivered(finishedDelivery.clientMessageId);
                createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId }).record("delivery.end", {
                  ok: true,
                  count: 1,
                  state: finishedDelivery.kind,
                  phase: "turn-settled",
                });
              }
              this.activeDeliveries.delete(this.queueKey(en.projectRoot, roleId, runtime)); // 「进行中」随本轮结束撤销
              // 2026-10-20 重启续跑：本轮结束 ⇒ 清理已完成标记并落盘（持久项已在 delivery.end 移除）。
              // P0：由 settle 补记账的条目**保留**「已投递」标记（防写盘竞态后重启重投）。
              if (finishedDelivery !== undefined && finishedDelivery.terminalRecorded !== true) {
                this.deliveredDeliveryKeys.delete(`${this.queueKey(en.projectRoot, roleId, runtime)}\u0000${finishedDelivery.dedupKey}`);
              }
              this.persistDeliveryQueues();
              // 状态准确性：settled = 「本角色离开工作中」的**真实信号**（B-2 下切走的后台轮次结束也走这里）
              // ——先外推再放行队列（放行时 busy 复位已可见）。
              this.notifyRoleState(en.projectRoot, roleId, runtime);
              // G-2/W1：转发放行前的结构化事实（lastTurn 落表 + 看护观察；outcome 只认四值终局——缺事实不猜）。
              if (wasBusy) {
                // 2026-10-18 客户反馈：trio 内部内置角色的收尾正文经投递机转成**[系统·治理反馈] 汇总任务**
                // 投给主入口（Lead）——由 Lead 向客户汇总，不再原文贴到 pane。取出即删 ⇒ 同一轮只投一次。
                // 用**事件循环的 projectRoot**（与 lastAssistantText 的 queueKey 同源）——不要用 en.projectRoot
                // （会话 entry 的 root 可能是斜杠变体，getListing 精确匹配会静默 miss）。
                // 2026-10-24（治理协调）：带本轮 flowId/终局——Proof 只发状态+报告指针（不转全文）。
                const settledOutcomeRaw = origin?.outcome ?? (ev.detail as { outcome?: unknown } | undefined)?.outcome;
                const settledOutcome =
                  settledOutcomeRaw === "completed" || settledOutcomeRaw === "failed" || settledOutcomeRaw === "aborted" || settledOutcomeRaw === "timed_out"
                    ? settledOutcomeRaw
                    : undefined;
                // P1（2026-10-30）：请求超时/请求失败的结构化 errorCode（来自 Service settled.detail）——
                // 只用于人话系统行 + lastTurn 小状态；**不**进入客户可见文案（不显示技术 code/堆栈/URL）。
                // P2：网络离线超窗（`network-offline-timeout`）同口径，用网络人话文案。
                const settledErrorCodeRaw = (ev.detail as { errorCode?: unknown } | undefined)?.errorCode;
                const settledErrorCode = typeof settledErrorCodeRaw === "string" && (isRequestFailureCode(settledErrorCodeRaw) || isNetworkOfflineFailureCode(settledErrorCodeRaw)) ? settledErrorCodeRaw : undefined;
                void this.mirrorGovernanceFeedback(projectRoot, runtime, roleId, {
                  ...(settledOrigin?.flowIds !== undefined && settledOrigin.flowIds.length > 0 ? { flowIds: settledOrigin.flowIds } : {}),
                  ...(settledOutcome !== undefined ? { outcome: settledOutcome } : {}),
                });
                if (settledOutcome !== undefined) {
                  this.lastTurns.set(this.queueKey(en.projectRoot, roleId, runtime), { outcome: settledOutcome, at: new Date(this.now()).toISOString(), ...(settledErrorCode !== undefined ? { errorCode: settledErrorCode } : {}) });
                }
                if (settledOutcome === "failed" && settledErrorCode !== undefined) {
                  // 人话系统行（客户卡不出现技术模板/code）：来源 i18n；delivery-note 只呈现，不触发模型/门禁。
                  const human = isNetworkOfflineFailureCode(settledErrorCode)
                    ? mainT("main.networkStatus.offlineTimeout")
                    : settledErrorCode === MODEL_REQUEST_RETRY_EXHAUSTED
                      ? mainT("main.requestStatus.retryExhausted")
                      : settledErrorCode === REQUEST_TIMEOUT_ERROR_CODES["first-byte"]
                        ? mainT("main.requestStatus.timeoutFirstByte")
                        : settledErrorCode === REQUEST_TIMEOUT_ERROR_CODES.idle
                          ? mainT("main.requestStatus.timeoutIdle")
                          : mainT("main.requestStatus.failed");
                  this.emitDeliveryNote(en.projectRoot, runtime, roleId, roleId, human);
                }
                this.observeWatchdog(en.projectRoot, {
                  kind: "settled",
                  roleId,
                  ...(settledOutcome !== undefined ? { outcome: settledOutcome } : {}),
                  at: this.now(),
                  fromSystemDelivery: finishedDelivery?.kind === "system",
                });
                if (finishedDelivery?.kind !== "system") this.noteWatchdogActivity(en.projectRoot, "settled");
              }
              void this.drainAllQueuesFor(en.projectRoot);
              if (runtime === "pi") void this.drainPiQueuesAcrossProjects();
              // P1-2：某会话离开 busy = LRU 回收的「下一时机」（暂超限的账在这里还——只收非 busy 者）。
              void this.evictBeyondLimit();
            }
          }
          // E-1：回交到达 ⇒ 自动投递主人（去重 + 排队 + 失败如实/保留；见 handleHandback）。
          if (ev.kind === "handback") {
            this.mergeReportState(entry, ev);
          }
          // 2026-10-18 客户反馈「内部治理角色，应该都向联络官反馈」：只记**普通 assistant 正文**
          // （系统行/投递状态/推理/工具事件不记；live 的正文可能带 `display`，照记）。
          // 同一回复可能拆多个 text block ⇒ 同 turnId 用 "\n" 累积（turnId 变化重置；总长 ≤4000 码点）。
          if (isAssistantTextEvent(ev)) {
            const textKey = this.queueKey(projectRoot, roleId, runtime);
            const prev = this.lastAssistantText.get(textKey);
            const accumulated = prev !== undefined && prev.turnId === ev.turnId ? `${prev.text}\n${ev.summary}` : ev.summary;
            const chars = Array.from(accumulated);
            this.lastAssistantText.set(textKey, {
              turnId: ev.turnId,
              text: chars.length > 4000 ? `…${chars.slice(chars.length - 3999).join("")}` : accumulated,
            });
          }
          if (ev.kind === 'message') {
            const detail = ev.detail as { source?: string; text?: string; inputProvenance?: RuntimeInputProvenanceV1; inputPresentation?: RuntimeLiveHandbackPresentationV1; receipt?: RuntimeDeliveryReceiptV1 } | undefined;
            if (detail?.source === 'prompt-input' && (detail.inputProvenance || detail.inputPresentation)) {
              const attemptId = detail.inputProvenance?.attemptId ?? detail.inputPresentation?.attemptId;
              const active = this.activeDeliveries.get(this.queueKey(projectRoot, roleId, runtime));
              if (active && attemptId === active.attemptId) active.safeText = detail.text;
            }
            if (detail?.source === 'delivery-receipt' && detail.receipt) this.rememberReceipt(entry, detail.receipt);
            if (detail?.source === 'delivery-boundary' || detail?.source === 'delivery-receipt') envelope.event = { ...ev, summary: mainT("main.history.deliveryState") };
            // 2026-10-25 A3/A4：治理反馈的输入回显 → 附带客户投影（找到才附加；miss 时事件逐字不变）。
            if (detail?.source === 'prompt-input' && typeof detail.text === 'string') {
              const projection = this.lookupGovernanceClientProjection(projectRoot, roleId, runtime, detail.text);
              if (projection !== undefined) {
                envelope.event = {
                  ...ev,
                  detail: { ...(detail as unknown as Record<string, unknown>), clientProjection: projection },
                };
              }
            }
          }
          // G-2/W1 信号 #3：命令超时限（F-1 事实）——只认 `display.process` 结构化投影（`timedOut === true`），
          // 判据复用 session-history.ts 的同一实现（不解析文本、不另写一份）；低频高信号 ⇒ 看护侧单次即报。
          if ((ev.kind === "accepted" || ev.kind === "denied") && classifyProcessOutcome((ev.detail as { display?: unknown } | undefined)?.display) === "timed-out") {
            this.observeWatchdog(projectRoot, { kind: "command-timed-out", roleId, at: this.now() });
          }
          try {
            this.deps.emitEvent(envelope);
          } catch {
            // 外推失败（如窗口已关）不得影响会话本身。
          }
          if (ev.kind === "settled" && origin && origin.settled) this.resumeDeferredRunChanges(entry, origin);
        }
      } catch (err) {
        entry.eventConsumerFailed = true;
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("session.events.failed", err);
        if (this.sessions.get(key) !== entry) return;
        entry.interactionState.turn.abort();
        entry.busy = false;
        entry.busySince = undefined;
        this.notifyRoleState(projectRoot, roleId, runtime);
        this.deps.emitEvent({
          roleId, projectRoot, runtime,
          event: { kind: "message", summary: mainT("main.session.eventStreamError", { detail: err instanceof Error ? err.message : String(err) }) },
        });
      }
    })();
    void entry.eventConsumerDone.catch(error => {
      entry.eventConsumerFailed = true;
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("session.events.completion.failed", error);
    });
  }
}
