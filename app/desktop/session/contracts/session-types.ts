// app/desktop/session/contracts/session-types.ts
// B1（2026-11-13，session.ts 重构；方案 §5 B1）：会话/事件/运行/投递/安装/库存共享契约（L0）。
// 声明体自 app/desktop/session.ts **逐字搬移**（仅 import/导出适配；内联 `import("…")` 的相对路径随目录调整）。
// 依赖规则：contracts 只可依赖 src/model 与基础类型（含同目录 contracts 文件），不得导入 shared/feature。

import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { ConfigSourceKind } from "../../../../src/common/shared/config-loader.ts";
import type { SessionEvent, RuntimeTurnOutcome, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, ShellJudgeFn, GovernanceJudgeFn, DispatchTaskPayload, PromptOptions, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeSessionToolSurfaceFacts, RuntimeSessionLifecycleFacts } from "../../../../src/model/runtime.ts";
import type { HandbackEvent, TaskHandback } from "../../../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../../../src/pipeline/orchestration/run-role.ts";
import type { GitHostOpenFailureRef, recordGitHostInventory, resolveDeliveryAssignment } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { DownloadRequestRuntime } from "../../../../src/pipeline/orchestration/download-request.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn } from "../../customer-input.ts";
import type { WorkflowMode } from "../../workflow.ts";

/**
 * 会话事件外推的**信封**（B-2，2026-10-12）：多会话并存后，事件必须携带**它属于哪个角色**
 * （渲染侧按 projectRoot/runtime/roleId 分发——不带标识会串消息）。源报告只保留公开安全投影，raw handback不进入此传输类型。
 */
export type DesktopOrchestrationEvent = SessionEvent | Omit<HandbackEvent, 'handback'>;

export interface SessionEventEnvelope {
  /** Display correlation only, captured from the original client delivery. */
  clientMessageId?: string;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  event: DesktopOrchestrationEvent;
}

/**
 * 治理反馈的**客户投影**（2026-10-25 UI/UX 评审 A3/A4，设计
 * `角色卡/桌面窗口/docs/design/2026-10-25_plan_chat-panel-adjustments.md`）：
 * 附在 `prompt-input` 消息事件的 `detail.clientProjection` 上，供渲染侧只显示客户可读信息；
 * 内部原文仍在 `detail.text`（审计/可折叠），本结构**不含**内部正文。字段可选：缺失时渲染侧
 * 按既有文本归类，行为与现在一致。`fingerprint` 供 UI 合并连续同内容状态行（×N）。
 */
export interface GovernanceClientProjectionV1 {
  version: 1;
  kind: "governance-feedback";
  /** 稳定指纹：sha256(canonical{kind, sourceRoleId, statusCode, flowIds(排序), reportPath, governancePath, textHash})。 */
  fingerprint: string;
  sourceRole: { roleId: string; displayName: string };
  /** 机器可读状态：Proof 为四值终局/unknown；非 Proof 内部反馈为 internal-feedback。 */
  statusCode: "completed" | "failed" | "aborted" | "timed_out" | "unknown" | "internal-feedback";
  /** 与任务正文一致的状态文本（应用生成，非伪造）。 */
  statusText: string;
  flowIds?: string[];
  /** 仅 Proof 指针任务提供。 */
  reportPath?: string;
  governancePath?: string;
  /** 客户侧动作：报告已就绪（可打开/等待验收卡）或等待 Lead 汇总。 */
  action: "report-ready" | "await-lead-summary";
}

/** 点角色开聊天时的参数（无任何范围/授权字段——授权来自导入项目这个动作）。 */
export interface SessionOpenRequest {
  projectRoot: string;
  roleId: string;
  runtime: RuntimeKind;
  /** Host dispatch only; public openSession strips this field and the ledger is rechecked. */
  taskId?: string;
}

/**
 * T3 B8.1（2026-11-11，RR3 根因 `fixed-dispatch-target-opened-legacy`）：**进程内部**的打开请求扩展。
 * `forcedWorkflowMode` 只供固定路径/投递机在内部打开**固定任务**的目标会话时强制会话级 workflow 模式
 * （fixed 派发的目标会话必须是 fixed）。它不是公共 `SessionOpenRequest`/IPC 契约的一部分——`openSession`
 * 仍只透传 projectRoot/roleId/runtime，渲染侧无法携带；用户点角色打开/legacy 调用不传，行为逐字不变。
 */
export interface InternalSessionOpenRequest extends SessionOpenRequest {
  /** 仅内部投递/固定路由使用；仅 `"fixed"` 在 trio 项目生效（否则忽略，走既有 task/chat 解析）。 */
  forcedWorkflowMode?: WorkflowMode;
}

/**
 * 2026-10-31（run-change 触发）：active run 的只读摘要（`activeRunViews` 返回；UI「契约变更 · 重开 run」
 * 入口据此启用/禁用并显示原因）。字段全部来自 manifest，不读正文、不伪装 pinned。
 */
export interface ActiveRunView {
  runId: string;
  flowId: string;
  state: "draft" | "pinned";
  pinnedAt?: string;
  rosterVersion?: number;
  roles?: string[];
  documents: Array<{ kind: string; path: string; sha256?: string }>;
}

/**
 * 生效配置来源与接受状态（供界面**如实呈现**；界面只读此结构、不另作判定）。
 *  · kind="ans"               → 用了项目 `.ans/project.json`（accepted 时应 pin-backed）；
 *  · kind="builtin-fallback"  → 无 `.ans`，回退运行期同意（登记的非-pin 例外）；
 *  · kind="ans-invalid"       → `.ans` 存在但不可用 → fail-closed 未接受（**不回退**运行期同意）。
 */
export interface EffectiveConfigInfo {
  kind: ConfigSourceKind;
  accepted: boolean;
  /** 生效 acceptance 的来源说明（未接受时为空——如实，不留貌似有证据的说明）。 */
  acceptanceSource: string;
  /** pin 条数（如实展示：有 pin 才是 pin-backed）。 */
  pinCount: number;
  /** fail-closed 降级原因（accepted:true 无 pin；或 `.ans` 不可解析）。 */
  reason?: string;
}

export interface SessionMessageMetadata {
  clientMessageId?: string;
  /** **应用代客户推进治理流程**（2026-10-18 客户修正）：后台投递标记——不抢 `activeRoleId`/当前 pane，
   *  边界陈旧重建也按「非用户发起」处理。仅桌面主进程内部使用（渲染侧传了也不构成任何权限）。 */
  background?: boolean;
  /**
   * **投递类别**（2026-10-26 客户真机反馈）：`system` = 治理唤醒（交付核证/协调/自动推进）——入队时按
   * `DeliveryItem kind:"system"` 记类（UI 队列显示「系统」、不可撤回），不再冒充客户消息。缺省 `message`
   * （真实客户消息语义逐字不变）。仅桌面主进程内部使用；渲染侧/客户输入不构成权限。
   */
  kind?: "system";
}

export interface SessionTarget { projectRoot?: string; roleId: string; runtime?: RuntimeKind }

export interface OpenResult {
  runtime?: RuntimeKind;
  projectRoot?: string;
  profileRevision?: number;
  ok: boolean;
  error?: string;
  /** 续接等情形的说明（ok=true 时也可能有）。 */
  note?: string;
  /** 本次会话生效的配置来源与接受状态（供界面如实呈现）。 */
  config?: EffectiveConfigInfo;
  /**
   * 是否**续接**了已保活的会话（B-2）：true = 句柄与模型上下文原样保留；false = 本次新建。
   */
  resumed?: boolean;
  /** 桌面 resumed=复用活句柄；recovered=引擎确证原生恢复成功；fresh=新上下文，恢复失败时带 warning。 */
  contextSource?: "resumed" | "recovered" | "fresh";
  /** 引擎实际恢复失败或其他上下文警告。 */
  contextWarning?: string;
}

export interface SendResult {
  ok: boolean;
  /** Observed facts for this exact invocation. ACK is not input acceptance. */
  turnId?: string;
  clientMessageId?: string;
  inputAccepted?: true;
  outcome?: RuntimeTurnOutcome;
  /** Original handle is still current, not a promise that provider cleanup has finished. */
  sessionCurrent?: boolean;
  error?: string;
  /** L-1：本次消息**已入队**（角色忙）——按到达序在当前任务结束后执行；`position` 为排队位次（1 起）。 */
  queued?: boolean;
  /** 入队位次（`queued:true` 时给出）。 */
  position?: number;
  /**
   * **同一应用任务已投递/已入队，本次没有再次投递**（2026-10-25 真机重复投递修复）：
   * 仅对带稳定 `clientMessageId`（`ans-app-task:` 前缀）的应用任务成立——同文＝同一任务，
   * 重建前后至多投递一次；真实客户消息不走此判据（同文重复发送仍是两个意图）。
   */
  duplicate?: true;
  /**
   * **客户授权平面（C1，2026-11-03）**：命中 `@审批`/`@决策` 标记且落账成功——本次不产生角色轮次
   * （`turnId`/`inputAccepted`/`outcome`/`sessionCurrent` 均不设置）。`id` 为账本 `d-<seq>`。
   */
  directive?: { id: string; target: "approval" | "decision" };
  /**
   * **仅取消/关窗**：`{ok:false,error,directiveCancelled:true}`——Composer 据此恢复草稿；
   * 未落账、未投递、无「已记录」回执。
   */
  directiveCancelled?: true;
}

export interface DeliveryQueuePersistenceOutcome {
  completedSeq: number; committedSeq: number; failureCount: number;
  lastError?: { seq: number; code: string; path: string };
}
export interface DeliveryQueuePersistenceFacts extends DeliveryQueuePersistenceOutcome {
  managerId: string;
  path?: string; armed: boolean; enqueuedSeq: number; pending: number;
  knownProducers: { openChains: number; deliveryClaims: number; handbackCommits: number };
}

export interface StopResult {
  ok: boolean;
  note: string;
  /** A finite queue-write barrier, not proof that all external/late producers have stopped. */
  deliveryQueuePersistence?: DeliveryQueuePersistenceOutcome & { managerId: string; targetSeq: number; pending: number; armed: boolean; path?: string };
}

/** P1-1（2026-10-13 客户裁定）：撤回一条**未投递**排队消息的结果——`summary` 供聊天流如实一行
 *  「已撤回排队消息：〈摘要〉」；失败（不在队列/已在投递中）如实给 `error`，绝不假装撤掉。 */
export interface WithdrawResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

// —————————————— G-2/W5：恢复提议（`propose_recovery`）的载荷与回执 ——————————————
//
// **形状单一来源＝契约家 `src/model/runtime.ts`**（`ProposeRecoveryPayload` / `RecoveryReceipt` /
// `ProposeRecoveryFn` / `RoleStatusFn` / `SessionTailFn`；编排 `common/编排/watchdog.ts` 同名转发——
// 本文件从彼处只读导入，**不自立第二份形状**）。模型输入一律不可信：本层对载荷**全量重校验**。

/** `rebuild-session` 恢复动作的结果（W4 公共入口）。 */
export interface RebuildSessionResult {
  ok: boolean;
  error?: string;
  resumed?: boolean;
  contextSource?: OpenResult["contextSource"];
  contextWarning?: string;
}

/** `redeliver` 恢复动作的结果（W4 队列重试 nudge）。 */
export interface RedeliverResult {
  ok: boolean;
  message: string;
}

/** 一个**保活**中的角色会话（B-2：每角色一个句柄 + LRU）。 */
export type DeliveryAssignment = Extract<Awaited<ReturnType<typeof resolveDeliveryAssignment>>, { ok: true }>["value"];
export interface DeliveryOrigin {
  assignmentRejectionCode?: string;
  taskId?: string;
  assignment?: DeliveryAssignment;
  inputAccepted?: true;
  /** Immutable identities from this turn's actual host handback input, never from message text. */
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
  outcome?: RuntimeTurnOutcome;
  clientMessageId?: string;
  turnId?: string;
  settled: boolean;
  /** 本轮由哪类投递开跑（settle 后「收尾推进」据此只认回交轮）。 */
  kind?: DeliveryItem["kind"];
  /** 本轮关联的治理流程 id（dispatch/handback 条目携带；去重；多流程批次按集合处理）。 */
  flowIds?: string[];
  /** 回交轮携带的证据路径（≤10，供验收汇总任务引用）。 */
  handbackEvidence?: string[];
}

export interface ActualDispatchSource { entry: LiveSession; origin: DeliveryOrigin }
export interface ControllerDisposalLease { projectRoot: string; leaseId: string; operationId: string; kind: "session-dispose"; hostHandleIds: readonly string[] }

export interface LiveSession {
  eventConsumerDone?: Promise<void>;
  eventConsumerFailed?: true;
  unsubscribePersistence?: () => void;
  readonly origins: { byTurn: Map<string, DeliveryOrigin>; running?: DeliveryOrigin };
  readonly roleId: string;
  readonly runtime: RuntimeKind;
  readonly profileRevision: number;
  readonly interactionState: { lifetime: AbortController; turn: AbortController };
  readonly handle: RoleSessionHandle;
  readonly assignedTaskId?: string;
  /** Exact accepted assignment, never a latest-role lookup or a model-supplied task ID. */
  boundAssignment?: DeliveryAssignment;
  /** 建会话时的项目根——换项目重开同一角色前须先释放旧句柄（角色 id 可能跨项目同名）。 */
  readonly projectRoot: string;
  readonly config: EffectiveConfigInfo;
  /** T3 B8.1（2026-11-11）：建会话时定格的会话级 workflow 模式（fixed/legacy）。固定派发据此判断既有
   *  目标会话是否需要安全重绑（`openInternalUnsafe` 的 forced fixed 分支）；用户/legacy 打开只记录，不改变行为。 */
  readonly sessionWorkflowMode: WorkflowMode;
  /** LRU 使用序号（越大越近；open/续接时刷新）。 */
  lastUsed: number;
  /**
   * **本会话是否确认制**（内置治理角色 su + 客户交互通道已接线注入——见 `openInternal` 的判据）：
   * 只有确认制会话的 gate 收窄到「客户确认才发行的 writeSet」，重建才会**清零已发行写权**。
   * F-5-opt1（2026-10-16 客户批准）据此决定重建后是否向模型排「写权不自动保留」注记。
   */
  confirmGated: boolean;
  /** **是否有轮次在跑**（E-1/H-1 排队判据）：send 成功置真、收到该角色的 `settled` 事件置假。 */
  busy: boolean;
  /**
   * **本轮起始时刻**（ms epoch；G-2/W1）：busy 置真时同步定格——看护信号 #1「轮次逼近超时」的 elapsed 基准
   * （90% × 生效时限；求值与运行时核心 `resolveRuntimeTimeouts` 单一来源同源，见 watchdog.ts）。
   * 读取方一律以 `busy === true` 为先决条件（置假路径不强制清零——防漏改不引入误报）。
   */
  busySince?: number;
  /**
   * **上一轮是否被「请求中止」**（2026-10-20 链式治理推进的早失败护栏）：`abort()`（客户停止 / 看护
   * 自动中止）置真，下一轮开始置空。链式推进在「会话仍活着、不在跑、无排队投递」时允许短宽限后如实失败；
   * 但被中止的回合**不算正常结束**——继续有界轮询等下一次投递/重试（真机：看护中止后由后续投递写出 YAML）。
   */
  lastTurnAborted?: boolean;
  /**
   * **O-1（2026-10-12）：本会话持有的边界快照**——开会话时定格的参与文件（绝对路径）与各自**内容哈希**。
   * 任一处变了 ⇒ 本会话的规则集已陈旧（真机：su 改好 boundary.yaml 后，活会话仍按开会话时解析的旧边界
   * 拒写）——`boundaryDiff` 检出后**作废重建**。信号只来自读盘哈希（**不得**靠界面推测）。
   */
  boundaryPaths: string[];
  boundaryPrints: Record<string, string>;
  /**
   * **G-4 裁定⑤（2026-10-16 客户批准）**：本会话定格的「该角色已安装技能」参与文件集
   * （`docs/skills/<name>/` 的 `SKILL.md`＋`install.md` **绝对路径**；开会话/重建当刻按登记推导一次，
   * 检查时由 `boundaryDiff` 以**同一推导**重算当前集合、比对集合差——新增/移除/内容编辑 ⇒ 陈旧）。
   * **零技能＝空数组**（既有指纹语义逐字不变）。
   */
  skillPaths: string[];
  /**
   * **当前轮投递给该角色的文本**（PM 评审 §8.1：≤4KB，内存内；判断 agent 的 `turnText` 输入）。
   * 每次真实投递（直发/出队/派发/回交）写入；**不展示、不入审计**；会话销毁即清。
   */
  lastUserText?: string;
  /**
   * **W6-B 真机阻塞修复**：等待「本会话下一轮 settle」的解析器（`waitForRoleSettle` 登记）。
   * settled 到达或会话被 dispose 时逐个结算（true/false）并清空；不跨轮残留。
   */
  settleWaiters?: Set<(settled: boolean) => void>;
  /** **每会话判断闭包**（编排 `createShellJudge`；同一份 `runtimeOptions`/`createAdapter` 工厂）。
   *  会话 dispose 即清（PM 评审 §十一）。 */
  shellJudge?: ShellJudgeFn;
  /**
   * **「替我审批/决策」每会话判断闭包**（编排 `createGovernanceJudge`，2026-10-18 双开关评审 §8.2）：
   * 只在 trio + 客户交互通道已接的会话构造；与 `shellJudge` 同一份 `runtimeOptions`/`createAdapter`。
   * 会话 dispose 即清；缺失 ⇒ 通道按「判断能力缺席」回落原卡（fail-closed，绝不代批）。
   */
  governanceJudge?: GovernanceJudgeFn;
  /**
   * **每会话下载运行时**（2026-11-04 download-requests C1/F2）：`open()` 创建，
   * `disposeEntry` 中 `await dispose()` 中止在途下载并释放执行槽；缺省 ⇒ 本会话无下载能力。
   */
  downloadRuntime?: DownloadRequestRuntime;
  /**
   * **需求变更审批卡通道**（2026-10-26 客户纠正）：仅**统筹（schedule）/提案（proposal）**会话构造，
   * 绑定本会话的客户卡上下文（roleId/signal/治理模型/判断闭包）与 `onPresented`。应用能力
   * `request_requirement_change` 经它呈现 `cardKind="decision"` 审批卡；decision 卡角色/结构仍由共享
   * `validateDecisionCardRequest` 单一来源校验（统筹/提案在其白名单内），发起方不能作答（作答只来自
   * 客户/独立判断 agent）。
   */
  requirementChangeCard?: (
    request: CustomerInputRequest,
    metadata?: CustomerInputMetadata,
    onPresented?: () => void,
  ) => Promise<CustomerInputOutcome> | CustomerInputOutcome;
  /**
   * 2026-11-02（版本决策）：chief 会话的**原始**客户卡上下文构造（含 roleId/sessionSignal/judge/turnText）。
   * 只被 `requestVersionDecision` 使用；调用方必须经 `withRequestLifecycle` 落 request.*（不绕过审计）。
   */
  governedCardContext?: (
    request: CustomerInputRequest,
    extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1 },
  ) => Parameters<DesktopCustomerInputFn>[1];
}

/** 一次**系统投递**（E-1 回交投 su / H-1 派发投目标角色 / L-1 客户消息）——投递机的队列条目（**一套机，多调用方**）。 */
export type ControllerResumeDelivery = { expected: NonNullable<DispatchTaskPayload["resumeController"]>; resumeKey: string; basisDigest: string };
export interface DeliveryItem {
  /** Host-sealed expected tuple and actual prepare receipt; not a model permission. */
  controllerResume?: ControllerResumeDelivery;
  queueEntryId?: string;
  lastAttempt?: { state: "blocked" | "failed"; code: string; at: string };
  /** Captured host notification source, never a model-supplied authority receipt. */
  notificationSource?: Extract<import("../../../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }>;
  /** Undefined only for direct send; queued system messages freeze their original assignment or explicit absence. */
  systemAssignment?: DeliveryAssignment | null;
  report?: RuntimeReportSnapshotV1;
  liveReport?: RuntimeLiveReportViewV1;
  liveDurability?: 'memory-only' | 'unknown-live';
  deliveryId?: string;
  safeText?: string;
  attemptId?: string;
  clientMessageId?: string;
  runtime: RuntimeKind;
  /**
   * 投递类别：`handback` 回交 / `dispatch` 派发 / `message` 客户消息 / **`system` 系统消息**
   * （G-2/W2，2026-10-16 客户批准——看护告警、收束提示与恢复回执，经**同一套投递机**真投递给 su；
   * **不可撤回**（归入治理流只读面）、去重键由看护自持命名空间（`watchdog\0…`）与 handback/dispatch 键隔离；
   * 来源标注恒空（呈现面按文首 `[系统·<子类>] ` 定格标记归类——桌面UI tool-rows.js 已在树））。
   */
  kind: "handback" | "dispatch" | "message" | "system";
  /** 目标角色 id（回交→su；派发/客户消息→被派角色）。 */
  targetRoleId: string;
  /** 治理流程 id（2026-10-18 收尾推进）：dispatch/handback 条目携带；客户消息/系统消息缺席。 */
  flowId?: string;
  /** B 批：星形任务 id（dispatch/handback 条目携带；旧 flow/客户消息缺席）。 */
  taskId?: string;
  /** 发起者（回交=产出角色；派发=派发者 su；客户消息=本端的当前角色）。 */
  sourceRoleId: string;
  /** 投递输入正文（**入队时定格**；重试用同一份，不重渲染）。 */
  text: string;
  /** 队列行用的一句摘要（L-1 可见性；**绝不**当作已执行呈现）。 */
  summary: string;
  /** 去重键（回交=`handbackKey`；派发=内容键，见 `routeDispatch` 的写明；客户消息=每次一条，独立键）。 */
  dedupKey: string;
  /** 入队时间（ISO；入队即定格——右栏「待办 / 队列」组显示用；**绝不**当作执行时间）。 */
  enqueuedAt: string;
  /**
   * **P0-1（2026-10-13 客户批准）**：随条目**入队即定格**的整包载荷（`PromptOptions`，契约单一来源
   * `src/model/runtime.ts`；投递时组合编排来源与 ACK 回调，images 数组保持原引用。
   * 缺省（undefined）= 无图片；纯文本也明确传本轮 handback.required。
   */
  opts?: PromptOptions;
  handback?: TaskHandback;
  batchItems?: readonly DeliveryItem[];
  /**
   * **P0 收尾不变量（2026-10-30）**：该投递的终态记账（`delivery.end`/`delivery.failed`）是否已落——
   * settle 收尾与 send promise 续段可能先后到达；**恰一次**，不重复、不静默。
   */
  terminalRecorded?: boolean;
}

/**
 * **持久化投递队列的磁盘形状**（2026-10-20 客户要求：重启后任务自动续跑）。
 * 只存 **JSON 安全字段**：`opts`（含图片/回调）、活动 `batchItems`、attempt 标识不落盘——恢复时按原文本
 * 重新投递（任务文本自足，允许模型续做/重做）。`state:"in-flight"` 表示崩溃/退出时正在投递的条目，
 * 重启后按 queued 重投一次。
 */
export interface PersistedDeliveryItemV1 {
  key: { projectRoot: string; roleId: string; runtime: RuntimeKind };
  item: {
    kind: DeliveryItem["kind"];
    runtime: RuntimeKind;
    targetRoleId: string;
    sourceRoleId: string;
    text: string;
    summary: string;
    dedupKey: string;
    enqueuedAt: string;
    flowId?: string;
    /** B 批：星形任务 id（重启续投保持同一任务关联）。 */
    taskId?: string;
    queueEntryId?: string;
    controllerResume?: ControllerResumeDelivery;
    systemAssignment?: DeliveryAssignment | null;
    notificationSource?: Extract<import("../../../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }>;
    deliveryId?: string;
    /** 应用任务的稳定身份（2026-10-25）：跨重启恢复后与新的同任务调用相认（「已投递」标记本身只在内存）。 */
    clientMessageId?: string;
    handback?: TaskHandback;
    report?: RuntimeReportSnapshotV1;
    liveReport?: RuntimeLiveReportViewV1;
    liveDurability?: "memory-only" | "unknown-live";
  };
  state: "queued" | "in-flight";
  enqueuedAt: string;
}

/** `restorePersistedDeliveries()` 的如实报告（Interface 据此落 Lead 系统行「已恢复 N 条并重投」）。 */
export interface DeliveryQueueRestoreReport {
  restored: number;
  skipped: number;
  items: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    kind: DeliveryItem["kind"];
    summary: string;
  }[];
}

export type InstallationCapabilityTool = "install_skill" | "uninstall_skill" | "install_mcp" | "uninstall_mcp";
/** Plain observations of an actual refused callback invocation; never effect-scope authority. */
export interface InstallationEffectRefusalObservation {
  bindingId: string; toolName: InstallationCapabilityTool; projectRoot: string; actorRoleId: string; runtime: RuntimeKind;
  observedAt: string; coreSessionId?: string; toolTurnId?: string; activeTurnId?: string; originKind?: string;
  disposition: "refused-before-activation"; reasonCode: "effect-scope-unproven";
}

export interface DesktopSessionInventoryFact {
  hostHandleId: string; projectRoot: string; roleId: string; runtime: RuntimeKind; kind: "role" | "bounded-chief";
  phase: "creating" | "live" | "open-failed" | "disposing" | "disposed" | "dispose-failed";
  coreSessionId?: string; taskId?: string; runId?: string;
  openFailureRef?: GitHostOpenFailureRef;
  toolSurface?: RuntimeSessionToolSurfaceFacts; lifecycle?: RuntimeSessionLifecycleFacts;
  errors: string[];
}
export type DesktopRunStopFact = NonNullable<Parameters<typeof recordGitHostInventory>[0]["runStops"]>[number];
export type DesktopControllerStopFact = NonNullable<Parameters<typeof recordGitHostInventory>[0]["controllerStops"]>[number];
export interface DesktopProjectExecutionInventory {
  source: "desktop-session-manager"; projectRoot: string; observedAt: string; revision: number;
  coverage: "unknown"; reasons: string[]; sessions: DesktopSessionInventoryFact[];
  pendingOpens: string[]; queuedDispatches: Array<{ queueEntryId: string; roleId: string; runtime: RuntimeKind; taskId?: string; kind: string;
    sourceRoleId: string; notificationSource?: DeliveryItem["notificationSource"]; notificationSourceState: "recorded" | "unknown";
    operationId?: string; systemAssignmentTaskId?: string; systemAssignmentState: "bound" | "unassigned" | "unknown" | "not-system";
    lastAttempt: NonNullable<DeliveryItem["lastAttempt"]> | { state: "unknown" } }>;
  activeDeliveries: Array<{ roleId: string; runtime: RuntimeKind; taskId?: string; kind: string }>;
  deliveryQueuePersistence: DeliveryQueuePersistenceFacts[];
  runStops: DesktopRunStopFact[];
  controllerStops: DesktopControllerStopFact[];
}
