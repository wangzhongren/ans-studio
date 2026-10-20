// SDK-free public runtime contracts. Primary owner: 运行时核心.
// Legacy Pi public shapes are preserved. SDK adapters confirm native context; ANS replay does not.
import type { ResolvedRole } from "./role.ts";
import type { WriteDecision } from "./decision.ts";
import type { PinEntry } from "./boundary.ts";
import type { RuntimeKind } from "../common/shared/runtime-shared.ts";
import type { createDiagnosticLogger } from "../common/shared/diagnostics.ts";
export type { RuntimeKind } from "../common/shared/runtime-shared.ts";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SessionEvent {
  runtime?: RuntimeKind;
  roleId?: string;
  turnId?: string;
  kind: "tool_call" | "denied" | "accepted" | "message" | "settled";
  summary: string;
  detail?: unknown;
}

/** Trusted input echo identity; consumers use the event's actual turnId, never its summary text. */
export interface PromptInputEventDetail {
  source: "prompt-input";
  text: string;
  inputTextProjection?:RuntimeInputTextProjectionV1;
  inputProvenance?:RuntimeInputProvenanceV1;
  inputPresentation?:RuntimeLiveHandbackPresentationV1;
  imageCount?: number;
}

export interface PromptImage {
  type: "image";

  data: string;

  mimeType: string;
}

export interface PromptTurnStartedMetadata {
  readonly turnId: string;
  readonly roleId: string;
  readonly runtime: RuntimeKind;
}

export interface PromptOptions {
  inputProvenance?:RuntimeInputProvenanceV1;
  inputPresentation?:RuntimeLiveHandbackPresentationV1;
  onDeliveryProgress?:(progress:RuntimeDeliveryProgressV1)=>void;
  /** Synchronous Core-only acknowledgement of an actual new turn, before persistence/native work. */
  onTurnStarted?: (metadata: PromptTurnStartedMetadata) => void;
  images?: PromptImage[];
}

export interface RoleSession {
  readonly persistence?:RuntimeSessionPersistence;
  runtime?: RuntimeKind;
  roleId?: string;

  contextSource?: RuntimeContextSource;
  nativeSessionId?: string;
  contextWarning?: string;

  prompt(text: string, opts?: PromptOptions): Promise<void>;
  events(): AsyncIterable<SessionEvent>;

  abort?(): Promise<void> | void;
  dispose(): Promise<void>;
}

export type WriteGate = (targetPath: string) => WriteDecision;

export interface ShellReviewRequest {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
}

export type ShellReviewResult = { allow: true; by: string } | { allow: false; reason: string; by: string };

export type ShellGate = (req: ShellReviewRequest) => Promise<ShellReviewResult>;

export interface OperatorPrompt {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;

  reason?: string;
}

export type OperatorOutcome =
  | { outcome: "allow"; operatorId?: string; judge?: ShellJudgeAudit }
  | { outcome: "deny"; operatorId?: string; reason?: string; judge?: ShellJudgeAudit }
  | { outcome: "unavailable"; reason?: string };

export type OperatorChannelFn = (
  prompt: OperatorPrompt,
) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined;

export type FinalizeStatus =
  | "completed"
  | "declined"
  | "unavailable"
  | "not-genesis"
  | "nothing-to-pin"
  | "blocked";

export interface FinalizeResult {
  ok: boolean;
  status?: FinalizeStatus;
  message?: string;
  reason?: string;
  wrote: string[];
  pins: PinEntry[];
  roles: string[];
  projectJsonRel: string;
  manifestRel: string;
}

// —————————————— 治理三权协作（Rapporteur / Nominator / Convener）中立形状 ——————————————
//
// 依据：PM 评审《治理三权分立——项目管理评审与 V1 拆发》（2026-10-17，
// `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`）§5.8/§6.3。
// 本模块**只定义中立形状**：流程标识、卡片种类、步骤状态与载荷。提案接受门、任命写入门、
// 派发范围门、账本读取与判定都在编排（`common/编排/governance-gate.ts`、`governance-ledger.ts`）；
// 本层不实现任何判定、不读写账本、不改变任何写权。
//
// **缺席＝旧形状**：下列字段全部可选；旧调用不带 flow 元数据时零行为变化，且缺席的
// flowId/stepId/cardKind **不能**解锁任何治理门禁（门禁只认账本中应用签发的客户决定）。

/** 治理流程/步骤标识的 slug 形状（评审 §5.8）：`^[a-z0-9][a-z0-9-]{1,63}$`。工具层按此校验，不猜测、不截断。 */
export const GOVERNANCE_SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{1,63}$";

/** 治理流程 id（slug；只作标识，不表达权限）。 */
export type GovernanceFlowId = string;

/** 治理流程内步骤 id（slug；与 flowId 一起构成派发去重键，评审 §6.3-5）。 */
export type GovernanceStepId = string;

/** 流程标识对（stepId 语义上从属于 flow；两者均缺席＝旧调用形状）。 */
export interface GovernanceFlowMetadata {
  flowId?: GovernanceFlowId;
  stepId?: GovernanceStepId;
}

/**
 * `request_choice` 允许的治理卡片种类（评审 §5.8）。
 * `intent-confirm`（2026-10-18 客户拍板）：主理（Lead/liaison）在 `hand_off_intent` 前发给客户的
 * **需求确认卡**，选项 id 固定 `confirm`/`revise`；**客户本人专属**，判断 agent 永不代批。
 */
export type GovernanceChoiceCardKind = "proposal" | "appointment" | "acceptance" | "intent-confirm";

/** `request_confirmation` 允许的治理卡片种类（评审 §5.8）。 */
export type GovernanceConfirmCardKind = "write" | "appointment-write" | "schedule-write";

/** 治理决定卡种类（两交互工具的并集；非法/缺席不能解锁任何治理门禁）。 */
export type GovernanceCardKind = GovernanceChoiceCardKind | GovernanceConfirmCardKind;

// —————————————— 治理卡判断 agent 分组（「替我审批」/「替我决策」）单一来源 ——————————————
//
// 依据：PM 评审《「替我审批」/「替我决策」双开关——项目管理评审与 V1 拆发》§3.1/§六。
// `cardKind → group` **只允许这一份实现**（桌面包、编排、测试、UI 全部读这里；不得再写第二张映射表）。
// 组只表达「哪一类卡由哪个开关代批」，不表达任何权限；approval 组可 `deny`（写卡不合规退回重做），
// decision 组正向代批，`manual` 由桌面作为返工原因回投发起角色（见 `GovernanceJudgeOutcome`）。

/** 治理卡判断开关分组：`approval`＝shell＋写盘族；`decision`＝提案/任命/验收。 */
export type GovernanceJudgeGroup = "approval" | "decision";

/**
 * 卡片种类 → 开关分组（冻结；新增卡种必须回到评审更新本表）。
 *
 * **`intent-confirm` 故意缺席**（2026-10-18 客户拍板）：需求确认卡由客户本人回答，
 * 是判断 agent **永不介入**的客户专属卡；缺席 ⇒ `governanceCardGroup` 返回 `undefined` ⇒
 * 即使两个开关都开也不判断、不代批。**不要**为它补键。
 */
export const GOVERNANCE_CARD_GROUP: Readonly<Partial<Record<GovernanceCardKind, GovernanceJudgeGroup>>> = Object.freeze({
  write: "approval",
  "appointment-write": "approval",
  "schedule-write": "approval",
  proposal: "decision",
  appointment: "decision",
  acceptance: "decision",
});

/**
 * 卡片种类所属开关分组。`undefined`/未知/`intent-confirm`（客户专属需求确认）⇒ `undefined` ⇒ **永不判断**。
 * 运行时入参可能来自不可信调用方，故除类型外再做一次自有键检查。
 */
export function governanceCardGroup(kind: GovernanceCardKind | undefined): GovernanceJudgeGroup | undefined {
  if (kind === undefined || typeof kind !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, kind) ? GOVERNANCE_CARD_GROUP[kind] : undefined;
}

/** 客户交互卡的治理元数据：并入 `CustomerInputRequest`（供桌面卡片显示）与 `CustomerInputMetadata`（供账本分类）。 */
export interface GovernanceCardMetadata extends GovernanceFlowMetadata {
  cardKind?: GovernanceCardKind;
}

/** 提案卡固定选项 id（评审 §5.8；非标准 id → 账本 `unclassified`，门禁拒绝并提示重发）。 */
export type GovernanceProposalOptionId = "accept" | "accept-quick" | "revise" | "reject";

/** 验收卡固定选项 id（评审 §5.8）。 */
export type GovernanceAcceptanceOptionId = "accept" | "reject";

/** 提案版本（评审 §6.3-3：一个提案最多 v2）。 */
export type GovernanceProposalVersion = 1 | 2;

/** 流程步骤种类（评审 §6.1 闭环：提案 → 流程/提名 → 派发 → 验收）。 */
export type GovernanceStepKind = "proposal" | "nomination" | "dispatch" | "acceptance";

/**
 * 流程步骤状态（评审 §6.3 机械规则的中立形状；判定在编排，不在本层）：
 * - `in-progress` 必须有主人（无主人的步骤不得 in-progress）；
 * - 同一版本同一步骤第二次 `returned` → `escalated-to-customer`，三人停止转交；
 * - 24h 无状态变化且无客户动作 → 只报 `paused`/`blocked`，不自动催办、不自动换人。
 */
export type GovernanceStepStatus =
  | "pending"
  | "in-progress"
  | "returned"
  | "escalated-to-customer"
  | "paused"
  | "blocked"
  | "done";

/** 流程单中的一个步骤（`docs/flows/<flowId>.md` 的中立形状；解析/判定归编排）。 */
export interface GovernanceFlowStep {
  stepId: GovernanceStepId;
  kind: GovernanceStepKind;
  /** 步骤主人（项目角色 id）；`in-progress` 时必须有主人（规则在编排）。 */
  ownerRoleId?: string;
  status: GovernanceStepStatus;
}

/** 提案步骤载荷（`docs/proposals/<flowId>-v<version>.md`；只定形状，不实现门禁）。 */
export interface GovernanceProposalStepPayload {
  flowId: GovernanceFlowId;
  stepId?: GovernanceStepId;
  cardKind: "proposal";
  /** 提案文件的项目相对路径。 */
  proposalPath: string;
  version: GovernanceProposalVersion;
}

/** 任命步骤载荷（`docs/nominations/<flowId>-v<n>.md`；快捷路径 `accept-quick` 可没有提名文件）。 */
export interface GovernanceAppointmentStepPayload {
  flowId: GovernanceFlowId;
  stepId?: GovernanceStepId;
  cardKind: "appointment";
  nominationPath?: string;
  /** 客户任命的项目角色 id（任命决定的 `targetRoleIds`）。 */
  targetRoleIds: readonly string[];
  version: number;
}

export interface CustomerInputOption {

  id: string;

  label: string;

  description?: string;
}

export type CustomerInputRequest = (
  | {
      kind: "confirm";

      title: string;

      preview?: string;

      detail?: string;

      /**
       * 确认后将**实际写入**的精确项目相对文件路径（2026-10-18 真机修复：预览里既引用大量路径又声明写入目标时，
       * 文本提取无法区分 ⇒ 判断回落）。给出时是写入目标的权威清单（逐文件、≤64 项、posix 化、不得含仅引用的文件）；
       * 缺席＝旧卡（沿用预览文本提取），零行为变化。
       */
      paths?: string[];
    }
  | {
      kind: "choice";
      title: string;
      question?: string;
      options: CustomerInputOption[];

      multiple?: boolean;
      preview?: string;
    }
) &
  GovernanceCardMetadata;

export type CustomerInputOutcome =
  | {
      outcome: "answered";
      value: { confirmed?: boolean; selected?: string[] };
      operatorId?: string;
      /**
       * 判断 agent 代批的审计归因（2026-10-18 双开关评审 §6.1/§四）：只有 `approve` 结算时才出现；
       * 客户手批不带本字段（仍是 `decisionEvidence.kind:"customer-input"`）。`declined`/`unavailable` 不加。
       */
      judge?: GovernanceJudgeAudit;
    }
  | { outcome: "declined"; operatorId?: string; reason?: string }
  | { outcome: "unavailable"; reason?: string };

/** Captured at invocation. Issuers must reject late consent when this original signal is aborted. */
export interface CustomerInputMetadata {
  signal?: AbortSignal;
  turnId?: string;
  roleId?: string;
  runtime?: RuntimeKind;
  /** Original handler call identity for presentation only; missing legacy IDs stay missing. */
  toolCallId?: string;
  /** 治理流程元数据（评审 §5.8）：仅当工具入参显式给出时透传；缺席＝旧形状，且不能解锁任何治理门禁。 */
  flowId?: GovernanceFlowId;
  stepId?: GovernanceStepId;
  cardKind?: GovernanceCardKind;
  /**
   * 确认卡显式给出的**实际写入路径**（2026-10-18 真机修复）：仅当工具入参 `paths` 合法时透传；
   * 项目相对、逐文件、posix 化、≤64 项。缺席＝旧卡（由预览文本提取，零行为变化）。
   */
  paths?: string[];
  /**
   * 治理卡判断上下文（2026-10-18 双开关评审 §5.2）：**唯一计算点**是编排 `run-role.ts::governedInput`
   * （paths/写根/禁写/物证/推荐集/账本事实）；桌面只消费、不重算、不读 `.ans`。
   * 缺席＝旧调用零变化；出现 `unavailableReason` 时判断必须回落 `manual`。
   */
  judgeContext?: GovernanceJudgeContext;
}

export type CustomerInputFn = (
  req: CustomerInputRequest,
  metadata?: CustomerInputMetadata,
) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined;

export interface ReportHandbackPayload {

  status: "completed" | "blocked";

  summary: string;

  evidence?: string[];
}

export interface ReportHandbackReceipt {
  state?:"accepted-memory";
  ok: boolean;
  message?: string;
}

export interface ReportHandbackMetadata {
  turnId: string;
  roleId?: string;
  runtime?: RuntimeKind;
}

export type ReportHandbackFn = (
  report: ReportHandbackPayload,
  metadata?: ReportHandbackMetadata,
) =>
  | ReportHandbackReceipt
  | null
  | undefined
  | void
  | Promise<ReportHandbackReceipt | null | undefined | void>;

export interface DispatchTaskPayload {

  roleId: string;

  task: string;

  reason?: string;

  /**
   * 治理流程元数据（评审 §5.8/§6.3-5）：治理角色（Convener）派发须带 flowId+stepId
   * （去重键在 `roleId\0task\0reason` 之外增 `flowId\0stepId`）；旧 su 调用可缺席＝旧行为。
   * 字段本身不构成授权，派发范围门只认账本中的客户决定（判定在编排）。
   */
  flowId?: GovernanceFlowId;
  stepId?: GovernanceStepId;
}

export interface DispatchReceipt {
  ok: boolean;
  message?: string;
}

export type DispatchTaskFn = (
  dispatch: DispatchTaskPayload,
  metadata?: ReportHandbackMetadata,
) => DispatchReceipt | null | undefined | void | Promise<DispatchReceipt | null | undefined | void>;

// —————————————— 治理四角色：意图交接与澄清（W6-A；2026-10-18 PM 评审 §5.1/§5.4） ——————————————
//
// 依据：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`（四角色
// liaison → rapporteur → nominator → convener；治理模型仍 `trio`）。本模块**只定义中立形状**：
// 工具层不读文件、不写账本、不投递，只把载荷交给注入的能力（校验/去重/后台投递/账本在编排与
// 桌面窗口）。**交接 ≠ 客户批准**：本类型不产生任何能解锁门禁的客户决定；谁拥有
// `hand_off_intent`（仅联络官 Liaison）/`request_clarification`（仅报告员 Rapporteur）由能力
// 注入面保证，本层不硬编码角色 id、不做治理判定。

/** 意图交接种类（评审 §5.1）：`initial` 每个 intentId 仅一次；`clarification`/`revision` 须引用既有成功交接。 */
export type HandOffIntentKind = "initial" | "clarification" | "revision";

/**
 * `hand_off_intent` 载荷（评审 §5.1；形状冻结）。四要素 `goal`/`scope`/`acceptance`/`summary`
 * 由工具层严格校验（非空、summary 1..200 字，超长拒绝不截断）；意图文件
 * `docs/intents/<intentId>.md` 是权威，入参与文件不一致由编排侧校验拒绝。
 */
export interface HandOffIntentPayload {
  /** 意图记录 slug（`GOVERNANCE_SLUG_PATTERN`）；对应 `docs/intents/<intentId>.md`。 */
  intentId: string;
  handoffKind: HandOffIntentKind;
  goal: string;
  scope: string;
  acceptance: string;
  /** 一句话摘要（1..200 字）。 */
  summary: string;
  /** 可选流程 id（slug）；clarification/revision 建议携带。 */
  flowId?: GovernanceFlowId;
}

/** `hand_off_intent` 回执：`ok:false` 的 `message` 必须能指导模型下一步；工具层对缺失/非法回执 fail-closed。 */
export interface HandOffIntentReceipt {
  ok: boolean;
  message?: string;
}

export type HandOffIntentFn = (
  payload: HandOffIntentPayload,
  metadata?: ReportHandbackMetadata,
) => HandOffIntentReceipt | Promise<HandOffIntentReceipt>;

/**
 * `request_clarification` 载荷（评审 §5.4）。`flowId` 与 `intentId` **至少给一个**（同一 flow 的
 * 2 轮上限由注入能力按账本计数判定）；本工具不弹客户决定卡、不占「一项目一卡」队列。
 */
export interface RequestClarificationPayload {
  flowId?: GovernanceFlowId;
  intentId?: string;
  /** 给客户看的一句话问题（非空）。 */
  question: string;
  /** 可选摘要（≤200 字）。 */
  summary?: string;
}

/** `request_clarification` 回执：`ok:false` 的 `message` 必须能指导模型下一步；工具层对缺失/非法回执 fail-closed。 */
export interface RequestClarificationReceipt {
  ok: boolean;
  message?: string;
}

export type RequestClarificationFn = (
  payload: RequestClarificationPayload,
  metadata?: ReportHandbackMetadata,
) => RequestClarificationReceipt | Promise<RequestClarificationReceipt>;

// —————————————— 看护只读工具与恢复提议（G-2；只给内置治理角色 注入，注入才注册） ——————————————
//
// 依据：客户 2026-10-16 批准 G-2（设计 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`
// §四/§六）。三个工具均**只给内置治理角色**——由调用方（编排注入端，判据沿 dispatch_task 的
// suppressHandback 先例）决定「注入才注册」；未注入 ⇒ 工具不存在（最强 fail-closed）。
// 本层纪律：role_status / session_tail **纯读**（无任何副作用）；propose_recovery **只提交载荷、如实
// 转达回执**——提议 ≠ 执行、执行以客户确认为准、不得承诺。
//
// **形状单一来源＝本模块**（编排 `common/编排/watchdog.ts` 转发出同一符号、不另立第二份形状；编排
// `withWatchdogCapabilities` 把桌面实现的能力并入 `GovernedToolsOptions` 的同名能力位——字段名即契约，
// 任一侧改名/改形 = 工具静默零注册或 fail-closed，不放大权限）。

/** `role_status` 查询载荷（G-2 §4.1）：`roleId` 缺省＝全项目角色概览；给出＝单角色详情。 */
export interface RoleStatusPayload {
  roleId?: string;
  /** true ⇒ 附该角色近日志尾部（≤20 条，白名单元数据——写盘时已 scrub，读侧不扩面）。 */
  includeDiagnostics?: boolean;
}

/** `session_tail` 查询载荷（G-2 §4.2）：`lines` 由工具层归一为 1..200（缺省 40）后传入——实现无需再判缺省。 */
export interface SessionTailPayload {
  roleId: string;
  lines?: number;
}

/**
 * `role_status` / `session_tail` 的如实回执（纯读两工具共用）。
 * `ok:true` 时 `text` 为结构化输出（超限由工具层截断并如实标注 `truncated`）；
 * `ok:false` 时 `message` 为如实原因（「无会话历史」「读坏」等——不抛、不猜）。
 */
export interface WatchdogToolResult {
  ok: boolean;
  text?: string;
  message?: string;
}

/**
 * `role_status` 的注入数据源（桌面主进程按**同源快照**渲染结构化文本；G-2 §4.1）。契约（实现方＝桌面窗口 W1）：
 * - **纯读**：调用无任何副作用（不写盘、不入队、不改 busy、不动任何判定链）；
 * - 输出为结构化文本（项目/时间/各角色 busy·队列·最近一轮/待确认数/看护状态），超 **8 KiB** 由
 *   工具层按字节截断并如实标注 `truncated`；
 * - 数据层失败（如诊断写盘故障）以 `{ok:false, message}` 如实表达（「不可用＋lastError」），**不要抛**
 *   ——抛出的异常由工具层按「读取未完成」如实转达，绝不编造状态。
 */
export type RoleStatusFn = (
  query: RoleStatusPayload,
  metadata?: ReportHandbackMetadata,
) => WatchdogToolResult | null | undefined | void | Promise<WatchdogToolResult | null | undefined | void>;

/**
 * `session_tail` 的注入数据源（桌面主进程经**受保护投影管线**产出；G-2 §4.2）。契约（实现方＝桌面窗口 W5）：
 * - **纯读**；必须沿既有受保护投影（凭据清洗 / display 保护，`runtime-history.ts::getSessionHistory`
 *   同路径）产出——**不得**直读裸 JSONL、不得输出未脱敏的原文敏感面；
 * - 返回该角色会话文件**尾部规范化行**（`<at> [user|assistant|tool] <一行文本，≤200 字/行、超长截断标注>`），
 *   头部**如实**给「来源文件 / 总行数 / 跳过的坏行数」；
 * - 「无会话历史」「读坏 / header 非法」以 `{ok:false, message}` 如实表达，**不抛、不猜**。
 */
export type SessionTailFn = (
  query: SessionTailPayload,
  metadata?: ReportHandbackMetadata,
) => WatchdogToolResult | null | undefined | void | Promise<WatchdogToolResult | null | undefined | void>;

/** 恢复动作集（G-2 §6.3，客户批准恰三值；不含禁用角色/删会话/改边界类动作）。 */
export type RecoveryAction = "abort-turn" | "rebuild-session" | "redeliver";

/** `propose_recovery` 载荷（G-2 §6.1）：su 只能**提议**——校验、确认卡与执行都在注入能力侧。 */
export interface ProposeRecoveryPayload {
  roleId: string;
  action: RecoveryAction;
  /** 支撑提议的证据（非空才提交；无证据不提议）。 */
  evidence: string;
  reason?: string;
  /** 仅 `redeliver` 有意义：针对该排队条目（队列期去重键类 id）。 */
  itemId?: string;
}

/**
 * 恢复回执结果（G-2 §6.3/§九）——四值中**恰 `executed` 为已执行**、其余三值一律**未执行**：
 * · `executed`＝客户已确认且已执行（成功）；
 * · `declined`＝**未执行**——客户取消/关窗/未确认（fail-closed，**绝不当「没人问就执行」**）；
 * · `unsupported`＝**未执行**——运行时不支持该动作（绝不假装已执行）；
 * · `error`＝**未执行**——执行失败/前提不满足（如 rebuild 遇在跑轮次拒绝），原因进 `message`。
 */
export type RecoveryOutcome = "executed" | "declined" | "unsupported" | "error";

/** 恢复提议回执（G-2 §6.1）：`executed` 仅在**客户已确认且已执行**（恰一次）时给出。 */
export interface RecoveryReceipt {
  outcome: RecoveryOutcome;
  /** 如实说明（成功细节 / 未执行原因 / 不支持原因 / 错误原文）。 */
  message?: string;
  /** 确认者标识（操作者 id 先例，`operator-channel.ts`）。 */
  operatorId?: string;
  /** 回执时间（ISO 8601）。 */
  at?: string;
}

/**
 * `propose_recovery` 的注入能力（桌面窗口 W4/W5 路由：校验 → 恢复确认卡 →（恰 allow:true 才）执行
 * → 回执；G-2 §6）。
 *
 * 纪律（沿 `dispatch_task` 先例）：本工具**只提交载荷、如实转达回执**——**提议 ≠ 执行**，无客户
 * 确认＝零执行；能力实现方不得据此授予任何写权、不得静默执行、不得把未执行当作已执行。契约外返回
 * （`null`/`undefined`/未知 outcome）由工具层按「未获明确结果」fail-closed 处理，绝不当已执行。
 */
export type ProposeRecoveryFn = (
  proposal: ProposeRecoveryPayload,
  metadata?: ReportHandbackMetadata,
) => RecoveryReceipt | null | undefined | void | Promise<RecoveryReceipt | null | undefined | void>;

// —————————————— 角色能力安装：技能安装/卸载（G-4 V1；只给内置治理角色 注入，注入才注册） ——————————————
//
// 依据：客户 2026-10-16 批准 G-4 V1（设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`
// §3.2/§3.3；PM 派发「运行时核心＝I1/I2」）。两工具均**只给内置治理角色**——由调用方注入能力表达
// 「注入才注册」（未注入 ⇒ 工具不存在，沿 dispatch_task 先例）。本层纪律：**工具不写盘**——落盘
// 永远由 su 的 `write_file` 完成（「先落盘再激活」＝G-1「先落盘再派发」的镜像）；工具只
// **校验＋激活＋回执**（校验/激活在注入能力侧＝桌面 handler；激活复用既有重建，在跑不打断）。
//
// **形状单一来源＝本模块**（桌面窗口按此接线；三适配器经能力注入读取）。

/** `install_skill` / `uninstall_skill` 载荷（G-4 §3.2）：目标角色与技能名（稳定短 slug，与目录名一致）。 */
export interface InstallSkillPayload {
  /** 目标项目角色 id（不能是内置治理角色；校验在能力实现侧）。 */
  roleId: string;
  /** 技能名（稳定短 slug；落盘位置 `docs/skills/<name>/`）。 */
  name: string;
}

/**
 * 技能安装/卸载回执（G-4 §3.2，形状冻结；测试逐条钉住）——三态如实：
 * - `ok:true`＋`action:"installed"|"uninstalled"`＝**已校验（登记/含角色）且已尝试激活**；
 *   `effective:"rebuilt"`＝目标会话已重建、即刻生效；`effective:"next-session"`＝目标正在跑轮次、
 *   不打断——新会话起生效（**如实延迟态，不是错误**）；`path`＝技能文件路径（`docs/skills/<name>/SKILL.md`）、
 *   `digest`＝运行期算的 sha256（展示可截前 12 位）；`note` 为可选如实补充。
 * - `ok:false`＋`reason`＋`message`＝**未执行、零副作用**。`reason` 机读标识（建议枚举：
 *   `not-registered` 落盘/登记不存在、`role-not-listed` 登记未含目标角色、`role-not-found`
 *   角色不存在或为内置治理角色、`not-customer-turn` 非客户消息发起的轮次（护栏）、
 *   `registration-unchanged` 卸载时登记未撤销、`rebuild-failed` 激活失败）；`message` 一句人话，
 *   文案枚举沿产品设计 §3.3。
 */
export type InstallSkillReceipt =
  | {
      ok: true;
      action: "installed" | "uninstalled";
      roleId: string;
      name: string;
      path: string;
      digest: string;
      effective: "rebuilt" | "next-session";
      note?: string;
    }
  | { ok: false; reason: string; message: string };

/**
 * `install_skill` 的注入能力（**只给内置治理角色**；未注入 ⇒ 工具不注册）。
 * 纪律（沿 `dispatch_task` 先例）：**工具不写盘**——本能力只**校验（角色/登记/含角色；护栏①：仅
 * 客户消息发起的轮次可执行，非客户轮次以 `not-customer-turn` 如实拒绝）→ 激活（复用既有重建；
 * 在跑不打断 ⇒ `effective:"next-session"`）→ 回执**；失败一律 fail-closed＝**未执行、零副作用**。
 * **安装不改变任何角色的写边界**（技能是必读资料，不是边界/写权）——能力实现不得据此授予任何写权。
 */
export type InstallSkillFn = (
  payload: InstallSkillPayload,
  metadata?: ReportHandbackMetadata,
) => Promise<InstallSkillReceipt>;

/**
 * `uninstall_skill` 的注入能力（**只给内置治理角色**；未注入 ⇒ 工具不注册）。
 * 纪律同 `InstallSkillFn`；卸载专有两钉：**先改登记再卸载**——能力须校验登记确已撤销，未撤销以
 * `registration-unchanged` 拒绝（防「工具说撤了、登记没变」）；**文件保留**——只撤登记语义、不删
 * `docs/skills/<name>/` 文件本体（「效果已撤」与「字节已清」如实二分陈述）。**卸载不改变任何角色的
 * 写边界**。
 */
export type UninstallSkillFn = (
  payload: InstallSkillPayload,
  metadata?: ReportHandbackMetadata,
) => Promise<InstallSkillReceipt>;

// —————————————— 角色能力安装：MCP 安装/卸载（G-4 V2 wave A；只给内置治理角色 注入，注入才注册） ——————————————
//
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2（外来 MCP 按角色安装）分批实施（设计
// `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §五/§九，实施 P1 Claude→P2 Codex→P3 Pi；
// 本波 wave A＝契约层）。符号冻结（单一来源＝本模块）：读取器在 `src/common/runtime-core/mcp-declarations.ts`、
// Service 在 providerFor 按角色读取并注入 `RuntimeProviderOptions.installedMcpServers`（适配器纯消费，
// 三平台装配属各自批次）。两工具均**只给内置治理角色**——未注入 ⇒ 工具不存在（沿技能版「注入才注册」）。
// 本层纪律同技能版：**工具不写盘**（落盘＝su 的 `write_file`，「先落盘再激活」的镜像）；工具只
// **校验＋激活＋回执**（校验/激活在注入能力侧＝桌面 handler；激活复用既有重建，在跑不打断）。
//
// 诚实面（V2 定格，评估＋三平台 P0 探针实证；面向客户文案不得宣称逐调用受审）：外来 MCP 工具在
// server 进程内执行、**不经过 ANS 门禁**（不属于 `write_file`/`run_shell` 任一受治理面）——安装一个
// MCP＝给该角色开一片**门禁之外的新动作面**（动作面边界＝server 自己提供什么）＝**能力级授予**；
// 卸载＝下次会话摘除（进程随会话消亡、零平台残留），但**已发生的副作用不可撤**。安装不改变任何
// 角色的写边界（那是 ANS 门禁面的事，与 MCP 执行面是两个事实——回执与文案如实二分，不混说）。

/**
 * 已安装 MCP server 的中立声明视图（G-4 V2；**stdio 限定**——HTTP/URL 不列入，裁定③）。
 * `env` 值只允许**字面量**或 `env:NAME` **引用**（真值由各平台适配器自持展开自进程环境，
 * **绝不落声明文件**；`!` 开头形态＝坏件，读取器拒）；`name` 仅 `[A-Za-z0-9_-]`（读取器校验）。
 * 消费面：Service 读取后随 `RuntimeProviderOptions.installedMcpServers` 注入（适配器纯消费、
 * **不各自去找文件**——单一来源、三平台同形）。
 */
export interface InstalledMcpServerV1 {
  name: string;
  /** 可执行命令（按 argv 直接 spawn、**不经 shell**——沿 run_shell 先例；参数走 `args`）。 */
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
}

/** `install_mcp` / `uninstall_mcp` 载荷（G-4 V2 §5.1）：目标角色与 MCP 名（稳定短 slug，与 `docs/mcp/<name>.md` 一致）。 */
export interface InstallMcpPayload {
  /** 目标项目角色 id（不能是内置治理角色；校验在能力实现侧）。 */
  roleId: string;
  /** MCP 名（稳定短 slug；声明文件位置 `docs/mcp/<name>.md`）。 */
  name: string;
}

/**
 * MCP 安装/卸载回执（G-4 V2，形状冻结、**沿 `InstallSkillReceipt` 体格**；测试逐条钉住）——三态如实：
 * - `ok:true`＋`action:"installed"|"uninstalled"`＝**已校验（声明/含角色）且已尝试激活**；
 *   `effective:"rebuilt"`＝目标会话已重建、即刻生效；`effective:"next-session"`＝目标正在跑轮次、
 *   不打断——新会话起生效（**如实延迟态，不是错误**）；`path`＝声明文件路径（`docs/mcp/<name>.md`）、
 *   `digest`＝声明文件**当刻字节** sha256（运行期算——「哈希只能由代码算」，展示可截前 12 位）；
 *   `note` 为可选如实补充。
 * - `ok:false`＋`reason`＋`message`＝**未执行、零副作用**。`reason` 机读标识（枚举沿技能版：
 *   `not-registered` 声明文件不存在、`role-not-listed` 声明未含目标角色、`role-not-found`
 *   角色不存在或为内置治理角色、`not-customer-turn` 非客户消息发起的轮次（护栏）、
 *   `registration-unchanged` 卸载时声明未撤销、`rebuild-failed` 激活失败）；`message` 一句人话，
 *   文案枚举沿技能版逐字体格（`MCP 未登记：docs/mcp/<name>.md 不存在——先落盘再安装；未执行。` 等）。
 */
export type InstallMcpReceipt =
  | {
      ok: true;
      action: "installed" | "uninstalled";
      roleId: string;
      name: string;
      path: string;
      digest: string;
      effective: "rebuilt" | "next-session";
      note?: string;
    }
  | { ok: false; reason: string; message: string };

/**
 * `install_mcp` 的注入能力（**只给内置治理角色**；未注入 ⇒ 工具不注册）。纪律同 `InstallSkillFn`：
 * **工具不写盘**——本能力只**校验（角色/声明/含角色；护栏：仅客户消息发起的轮次可执行，非客户
 * 轮次以 `not-customer-turn` 如实拒绝）→ 激活（复用既有重建；在跑不打断 ⇒ `effective:"next-session"`）
 * → 回执**；失败一律 fail-closed＝**未执行、零副作用**。**安装不改变任何角色的写边界**；但安装
 * 改变的是「该角色新会话装配哪些外来 MCP」——外来 MCP 工具本就在 ANS 门禁之外执行＝**能力级授予**
 * （非逐调用受审，§5.3 诚实面）——能力实现与回执文案**不得宣称逐调用受审**。
 */
export type InstallMcpFn = (
  payload: InstallMcpPayload,
  metadata?: ReportHandbackMetadata,
) => Promise<InstallMcpReceipt>;

/**
 * `uninstall_mcp` 的注入能力（**只给内置治理角色**；未注入 ⇒ 工具不注册）。
 * 纪律同 `InstallMcpFn`；卸载专有两钉：**先改声明再卸载**——能力须校验声明确已撤销，未撤销以
 * `registration-unchanged` 拒绝（防「工具说撤了、声明没变」）；**声明文件保留**——只撤装配语义、
 * 不删 `docs/mcp/<name>.md`（「效果已撤」与「文件仍在」如实二分）。**卸载＝下次会话摘除**；已发生的
 * 副作用不可撤（历史事实如实陈述）。**卸载不改变任何角色的写边界**。
 */
export type UninstallMcpFn = (
  payload: InstallMcpPayload,
  metadata?: ReportHandbackMetadata,
) => Promise<InstallMcpReceipt>;

// —————————————— Flow 文件方法化（2026-10-20 客户拍板；最小闭环） ——————————————
//
// 客户批准「按这个方案做」：把 flow 文件从「只能整文件读写」升级为**方法化**——模型经三只工具
// （`flow_get` / `flow_step_update` / `flow_step_supersede`）读取结构化视图并推进步骤状态。
// 本模块只承载**中立类型**；三工具只调用注入能力并如实转达回执，**权限/状态迁移/证据完整性/
// revision 冲突/Steward/Lead 权限等全部裁决在编排 flow-service**（`src/common/编排/**` 属编排角色）。
// 未注入对应能力 ⇒ 工具不注册（结构性 fail-closed，沿 dispatch_task 先例）。
// 诚实面：flow 步骤推进 ≠ 客户批准——需要客户决定的步骤仍须走 request_confirmation/request_choice。

/** flow 步骤状态（合法取值；状态迁移合法性由编排 flow-service 裁决，本层不判）。 */
export type FlowToolStatus = "pending" | "dispatched" | "delivered" | "done" | "superseded" | "failed" | "blocked" | "aborted";

/** flow 步骤状态枚举的运行时单一来源（schema 与工具层参数校验共用，避免两处漂移）。 */
export const FLOW_TOOL_STATUSES: readonly FlowToolStatus[] = Object.freeze([
  "pending", "dispatched", "delivered", "done", "superseded", "failed", "blocked", "aborted",
]);

/** flow 步骤种类（dispatch＝派发型；customer-decision＝客户决定型；artifact＝产物型；acceptance＝验收型）。 */
export type FlowToolStepKind = "dispatch" | "customer-decision" | "artifact" | "acceptance";

/** flow 步骤种类枚举的运行时单一来源（schema 与工具层参数校验共用）。 */
export const FLOW_TOOL_STEP_KINDS: readonly FlowToolStepKind[] = Object.freeze([
  "dispatch", "customer-decision", "artifact", "acceptance",
]);

/** 步骤证据：kind＝证据类别，ref＝项目相对路径或任务事实（合法性/存在性由编排 flow-service 校验）。 */
export interface FlowToolEvidence {
  kind: FlowToolStepKind;
  ref: string;
}

/** `flow_get` 返回的步骤视图（服务端投影；工具层原样转达，不重算）。 */
export interface FlowToolStepView {
  id: string;
  title: string;
  owner: string;
  kind: FlowToolStepKind;
  status: FlowToolStatus;
  evidence?: FlowToolEvidence;
  supersedes?: string[];
  supersededBy?: string;
}

/** `flow_get` 返回的流程视图。`canUpdate` 是服务端按调用角色计算的**可更新步骤 id**（权限裁决在服务端）。 */
export interface FlowToolView {
  flowId: string;
  revision: string;
  qualityTier: string;
  steps: FlowToolStepView[];
  canUpdate: string[];
}

/**
 * 三只 flow 工具的统一回执（形状冻结；工具层**原样**转达，不解释为批准/不重算状态）。
 * - `ok:true`：`revision` 为本次操作后的新 revision；`flow` 为服务端视图（可选）；`idempotent:true`
 *   表示同一 `idempotencyKey` 重放、未重复变更；
 * - `ok:false`：`code` 机读原因（如 `revision-conflict`/`invalid-transition`/`insufficient-evidence`/
 *   `forbidden`），`error` 一句人话，`issues` 供修正的逐条问题。
 */
export interface FlowToolResult {
  ok: boolean;
  revision?: string;
  flow?: FlowToolView;
  idempotent?: boolean;
  error?: string;
  code?: string;
  issues?: string[];
}

/** `flow_get` 注入能力：读 flow 结构化视图；`flowId` 缺席＝当前/默认 flow（由服务端归一）。 */
export type FlowGetFn = (input: { flowId?: string }) => Promise<FlowToolResult>;

/** `flow_step_update` 注入能力：更新单个步骤状态（迁移/权限/证据/revision 裁决在服务端）。 */
export type FlowStepUpdateFn = (input: {
  flowId: string;
  stepId: string;
  status: FlowToolStatus;
  evidence?: FlowToolEvidence;
  expectedRevision: string;
  idempotencyKey?: string;
  note?: string;
}) => Promise<FlowToolResult>;

/** `flow_step_supersede` 注入能力：用新步骤取代旧步骤（旧步骤转 superseded；**仅 Steward/Lead（工作流管理者）**，服务端校验）。 */
export type FlowStepSupersedeFn = (input: {
  flowId: string;
  oldStepId: string;
  newStepId: string;
  title: string;
  owner: string;
  kind: FlowToolStepKind;
  expectedRevision: string;
  reason?: string;
  idempotencyKey?: string;
}) => Promise<FlowToolResult>;

// —————————————— 推理与推理强度（G-5 wave 1 契约层；冻结符号，单一来源＝本模块） ——————————————
//
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝ G-5（推理与推理强度）；评估
// `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`（§五 请求面/§六 呈现面）、
// 产品设计 `角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`。两层：
//
// ①请求面＝中立档位 `ReasoningEffortV1`（PM 冻结恰五值）＋`RuntimeProviderOptions.reasoningEffort`。
// Service 在 providerFor 按运行时读 env（`ANS_CLAUDE_REASONING_EFFORT`/`ANS_CODEX_REASONING_EFFORT`
// /`ANS_PI_REASONING_EFFORT`）、归一（合法五值，trim＋忽略大小写；未设/空串＝未设；其余＝按未设处理
// ＋诊断，**绝不毁会话**）后注入。**未设（字段缺席）＝逐字现状**——适配器不得因字段缺席改变任何既有
// 行为；适配器**纯消费**（三平台原生接线属各适配器批次＝wave 2；各平台落点见
// `RuntimeProviderOptions.reasoningEffort` 注释）。
//
// ②呈现面＝推理事实通道（三段式，沿工具事件"事实→核心投影→呈现"纪律）：
// · 适配器只产事实 `RuntimeReasoningFactsV1`（经 `kind:"message"` 事件的 `detail` 承载，
//   `RuntimeReasoningEventDetailV1`；**绝不直上屏、绝不自行脱敏**）；
// · **核心投影单点**＝`createToolDisplayContext().projectReasoningDetail`（实现于
//   `src/common/runtime-core/tool-display.ts`），Service 在 emit/历史读取对 `detail.source==="reasoning"`
//   恰一次调用——脱敏＋预算在此发生；
// · 消费方（桌面渲染/回放）只渲染投影形 `RuntimeReasoningDisplayDetailV1`（或如实诊断形
//   `RuntimeReasoningDisplayDiagnosticDetailV1`）。折叠行文案「已思考 N 秒 ▸」由消费方从
//   `status`/`durationMs` 合成：**有真实时长信号才显示秒数、平台省略内容时不假装有内容**
//   （无时长文案用「推理内容 ▸」类如实措辞；文案终形归桌面UI，本层只冻数据面）。

/** 中立推理强度档位（PM 冻结；v1 恰五值。`off`＝显式关闭扩展思考（各平台落点见上）；`xhigh`＝「极高」）。 */
export type ReasoningEffortV1 = "off" | "low" | "medium" | "high" | "xhigh";

/** 单段推理完成事实（适配器只产事实；呈现前必须过核心投影单点，绝不直上屏）。 */
export interface RuntimeReasoningFactsV1 {
  /** 平台给出的推理正文（可能为空串——仅签名/零长正文）；`status:"omitted"` 时契约义务为空串。 */
  text: string;
  /**
   * `complete`＝平台给出的正文已完整送达；`omitted`＝平台省略正文（只有「发生过」，
   * 如 Claude `display:'omitted'`/redacted 块）——如实不假装（绝不拿摘要冒充原文、绝不拿「发生」冒充「内容」）。
   */
  status: "complete" | "omitted";
  /** 仅**真实**起止信号时携带（毫秒，有限且 ≥0）；无真实信号不携带、绝不猜测。 */
  durationMs?: number;
}

/** 推理事件的原始载荷（适配器 → 核心投影单点的入参形状；经 message 事件 `detail` 承载）。 */
export interface RuntimeReasoningEventDetailV1 {
  version: 1;
  source: "reasoning";
  reasoning: RuntimeReasoningFactsV1;
}

/** 投影后的推理呈现详情（桌面渲染/回放消费的**冻结点**；`text` 已经核心脱敏＋预算）。 */
export interface RuntimeReasoningDisplayDetailV1 {
  version: 1;
  source: "reasoning";
  reasoning: {
    text: DisplayTextV1;
    status: "complete" | "omitted";
    durationMs?: number;
  };
}

/** 推理投影失败诊断（绝不抛、绝不伪造内容；消费方按如实文案呈现「推理内容无法安全显示」）。 */
export interface RuntimeReasoningDisplayDiagnosticDetailV1 {
  version: 1;
  source: "reasoning-diagnostic";
  code: "PROJECTION_FAILED";
}

/**
 * 推理投影单点签名（实现＝core display context 的 `projectReasoningDetail`）。
 * 入参接受原始事实或已投影详情（重复投影幂等——历史读取路径对存量投影形再投影不改变形状）。
 * 坏件一律返回 `RuntimeReasoningDisplayDiagnosticDetailV1`，**绝不抛**。
 */
export type RuntimeReasoningDetailProjector = (
  detail: RuntimeReasoningEventDetailV1 | RuntimeReasoningDisplayDetailV1,
  redactText?: (value: string) => string,
) => RuntimeReasoningDisplayDetailV1 | RuntimeReasoningDisplayDiagnosticDetailV1;

export interface ShellVerdictPayload {

  verdict: "allow" | "deny" | "unsure";

  reason?: string;
}

export type ShellVerdictFn = (verdict: ShellVerdictPayload) => void | Promise<void>;

// —————————————— 判断 agent（「替我审」）中立契约（2026-10-17，PM 评审 revision 2 §6.1） ——————————————
//
// 分层（PM 钉死）：中立类型＝本模块；只读工具/读取策略＝`src/common/runtime-core/shell-judge/`；
// 一次性判断会话驱动＝编排（`createShellJudge`）。**`RuntimeAdapter` 不增加 `judgeShell`**——适配器
// 只按注入工具集开会话。能力注入（非工具注入）：`GovernedToolsOptions.shellJudge` 注入后 Service 必须
// 走 `buildShellJudgeTools`、不得走 `buildGovernedTools`；`RuntimeProviderOptions.judgeMode` 为中性标志
// （Claude 适配器据此强制关闭 WebSearch/外来 MCP）。
//
// 客户拍板 D1：judge `allow` **可以放行 su `deny` 档**，但审计/聊天行必须标「deny 档 · judge 放行」
// （`ShellJudgeAudit.tier === "deny"` + `hardDenyOverride === true`），不伪装成普通放行。

/** 判断来源：su 审批档 / 项目角色升级。 */
export type ShellJudgePolicy = "su-approval" | "project";

/** 审批档位；`null`＝无档位（如普通项目升级）。 */
export type ShellJudgeTier = "risky" | "review" | "deny" | null;

/** 一次判断请求（由会话闭包按请求会话的 engine/projectRoot 组装；不信任渲染侧）。 */
export interface ShellJudgeRequest {
  command: string;
  argv: string[];
  cwd: string;
  toolCallId: string;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  policy: ShellJudgePolicy;
  tier: ShellJudgeTier;
  /** (b) 升级原因 / su 审批档原因。 */
  reason?: string;
  /** 当前轮投递给该角色的文本（≤4KB）；不读原始转录/历史回放。 */
  turnText?: string;
}

/** `deny` 的替代方案（文本；应用**不自动执行**）。 */
export interface ShellJudgeAlternative {
  kind: "command" | "tool" | "instruction";
  value: string;
  rationale?: string;
}

/** 模型可给出的裁决（经 `report_shell_judgement` 原样回调，规范化在编排侧）。 */
export interface ShellJudgeVerdict {
  verdict: "allow" | "deny" | "manual";
  reason?: string;
  customerMessage?: string;
  evidence?: string[];
  alternative?: ShellJudgeAlternative;
}

/** 运行时/编排补全后的结果（模型只能给 `ShellJudgeVerdict`）。 */
export interface ShellJudgeOutcome extends ShellJudgeVerdict {
  /** §6.4 状态码（`necessary` / `safer-alternative` / `no-alternative` / `manual` 等组）。 */
  reasonCode: string;
  customerMessageSynthesized?: boolean;
  /** 实际使用的模型标识（可得则记；不参与 operatorId）。 */
  model?: string;
  /** 模型原始裁决（规范化时如实保留；客户 D1 的 deny 档放行**不转换**为 deny）。 */
  modelVerdict?: "allow" | "deny" | "manual";
  /** 请求的审批档位（客户 D1：`deny` 档放行须可见标注）。 */
  tier?: ShellJudgeTier;
  /** 客户 D1：judge `allow` 放行 su `deny` 档——审计/聊天行标「deny 档 · judge 放行」。 */
  hardDenyOverride?: true;
}

export type ShellJudgeFn = (input: ShellJudgeRequest, signal?: AbortSignal) => Promise<ShellJudgeOutcome>;

/**
 * 判断 agent 自己做出 allow/deny 时的审计归因（`OperatorOutcome.allow/deny.judge`）。
 * `manual` 后的客户手批是人工归因，**不写**本字段。
 */
export interface ShellJudgeAudit {
  /**
   * 所属开关分组（2026-10-18 双开关评审 §6.1）：shell judge 固定 `"approval"`。
   * 可选加法——旧读者忽略；客户手批不写本字段。
   */
  group?: "approval";
  engine: RuntimeKind;
  /** 实际使用的模型标识（可得则记；不参与 operatorId）。 */
  model?: string;
  /** 模型原始裁决（规范化时如实保留；客户 D1 的 deny 档放行**不转换**为 deny）。 */
  modelVerdict?: "allow" | "deny" | "manual";
  verdict: "allow" | "deny";
  reasonCode: string;
  reason?: string;
  customerMessage?: string;
  alternative?: ShellJudgeAlternative;
  customerMessageSynthesized?: boolean;
  /** 请求的审批档位（客户 D1：`deny` 档放行须可见标注）。 */
  tier?: ShellJudgeTier;
  /** 客户 D1：judge `allow` 放行了 su `deny` 档——审计/聊天行标「deny 档 · judge 放行」。 */
  hardDenyOverride?: true;
}

/**
 * 判断读取拒绝原因码（中立契约；实现/策略在 `runtime-core/shell-judge/policy.ts`，该模块 re-export 同一符号）。
 * 2026-10-18 从 policy 上移到本模块：`ShellJudgeReadStats.deniedPaths` 的诊断形状需要引用它。
 */
export type JudgeReadCode =
  | "empty"
  | "invalid-path"
  | "outside-root"
  | "sensitive"
  /** 应用私有数据（`.ans/**` 中除只读开放白名单外的内容）：与普通敏感文件区分，便于审计/诊断。 */
  | "app-private"
  | "not-found"
  | "not-a-file"
  | "not-a-directory"
  | "binary"
  | "budget"
  | "read-failed"
  /**
   * 范围参数非法（2026-10-19 定点抽查）：负数/非整数/limit=0/字节与行参数混用/endLine<startLine。
   * 与 `empty`/`invalid-path` 同口径：不消耗调用预算，**不计入** `deniedReads`（调用错误，不是读取受损）。
   */
  | "range-invalid"
  /**
   * 请求范围越过文件（2026-10-19 定点抽查）：offset/startLine 超出文件末尾，或行扫描超过上限。
   * 信息性结果（同 `not-found`）：**不计入** `deniedReads`，只记 `deniedPaths` 诊断。
   */
  | "out-of-range";

/** 判断读取路径类别（诊断/文案用；**不携带原路径**）。 */
export type JudgePathClass =
  | "env"
  | "key-material"
  | "credential"
  | "credential-dir"
  | "vcs"
  | "audit"
  /** 历史值：`.ans/sessions` 曾为独立类别；现默认 `app-private`（白名单路径除外）。 */
  | "session"
  /** 应用私有数据（`.ans/**` 中除只读开放白名单外的内容）。 */
  | "app-private"
  | "outside-root"
  | "binary"
  | "non-regular"
  | "budget"
  | "unknown";

/** 一次被拒读取的诊断（`ShellJudgeReadStats.deniedPaths`；仅项目相对路径，根外只记类别）。 */
export interface ShellJudgeDeniedPath {
  /** 请求的项目相对路径（posix）；根外/无法安全表示时为 `""`（只看 `code`/`pathClass`）。 */
  path: string;
  code: JudgeReadCode;
  pathClass: JudgePathClass;
}

/** 判断会话的读取统计（由只读工具累加；编排据此做「`allow` 必须无损」检查）。 */
export interface ShellJudgeReadStats {
  readCalls: number;
  readBytes: number;
  /**
   * 策略拒绝次数（敏感/越界/非法/二进制/读取失败）；预算耗尽只记 `budgetExceeded`，**不并入**本项。
   * **信息性读取结果**（`not-found`/`not-a-file`/`not-a-directory`）不计入本项（正常探测，不构成读取受损）。
   */
  deniedReads: number;
  /**
   * `.ans/**`（应用私有数据，白名单除外）拒绝次数（2026-10-18 真机修复）：**不计入 `deniedReads`**，
   * 也**不参与**驱动的 damageCode/allow 降级——账本/会话已在应用事实里，读不到 `.ans` 不构成「读取受损」。
   * 仅作诊断/审计（可选加法，旧读者忽略）。
   */
  appPrivateDeniedReads?: number;
  truncatedReads: number;
  /** 预算耗尽（调用次数/总读取上限）——独立于 `deniedReads`；编排优先据此判 `budget`。 */
  budgetExceeded: boolean;
  /**
   * 成功读取的项目相对路径（2026-10-18 双开关评审 §5.4/§6.1）：去重、最多 16 条。
   * 治理 judge 以 `requiredReadPaths ⊆ readPaths` 做「approve 必须真的读过物证」门槛；
   * shell judge 也会累积（可选加法，旧读者忽略）。被拒/截断未成功的读取不记录。
   */
  readPaths?: string[];
  /**
   * 被拒读取的逐路径诊断（2026-10-18 客户反馈：手动回落卡只写「无法读取」看不懂）。
   * 只记**项目相对路径**与原因码/类别；根外路径不记绝对路径（`path` 为 `""`，只留类别）。
   * 按 `(path, code, pathClass)` 去重、最多 16 条；仅诊断，不参与 damageCode/降级判定。
   */
  deniedPaths?: ShellJudgeDeniedPath[];
}

/**
 * shell 判断会话的读取预算（**跨角色只读契约**，2026-10-19 登记）。
 *
 * 所有权＝运行时核心；`src/common/runtime-core/shell-judge/policy.ts` **re-export 同一符号**并实现
 * `resolveShellJudgeBudget`，既有导入路径（`.../shell-judge/policy.ts`）不变、不保留第二份定义。
 * 编排 `src/common/编排/shell-judge.ts` 只读导入本类型与 `resolveShellJudgeBudget`，把**本次实际生效**
 * 的预算注入判断提示——提示数值必须与只读工具实际生效值同源，编排不得复制第二份 env/默认值解析。
 *
 * 只读语义：读取方只消费，不写入、不扩展判定；新增字段须可选（旧读者忽略）。
 */
export interface ShellJudgeBudget {
  /** 读取/列举调用上限（`judge_read_file` 与 `judge_list_dir` 合计）。 */
  maxCalls: number;
  /** 单次判断会话的总读取字节上限。 */
  maxBytes: number;
  /** 单文件读取字节上限。 */
  maxFileBytes: number;
  /** 行范围定位的扫描上限（字节）；只约束「找行号」的 I/O，不计入 `readBytes`。 */
  maxScanBytes: number;
}

/** 判断会话的只读工具选项（`GovernedToolsOptions.shellJudge`；能力注入，非工具注入）。 */
export interface ShellJudgeToolOptions {
  /** 请求会话的 projectRoot——读取根与越界判定基准。 */
  projectRoot: string;
  /** `report_shell_judgement` 回调：只收模型原始参数，**不在运行时核心做裁决规范化**。 */
  report: (raw: unknown) => void;
  /** 工具累加；驱动创建（`allow` 必须无损）。 */
  stats: ShellJudgeReadStats;
  /**
   * 缺省：maxCalls 12、maxBytes 512KB、maxFileBytes 128KB；maxScanBytes（行范围定位扫描上限）8MiB。
   * `buildShellJudgeTools` 还会读取 `ANS_SHELL_JUDGE_MAX_CALLS`/`ANS_SHELL_JUDGE_MAX_BYTES`/
   * `ANS_SHELL_JUDGE_MAX_FILE_BYTES`（正整数、受上下限约束，非法回落缺省）；显式字段优先于 env。
   * env 只在构造判断会话时读取，不进入模型可见能力。
   */
  budget?: Partial<ShellJudgeBudget>;
}

// —————————————— 治理卡判断 agent（「替我审批」/「替我决策」）中立契约（2026-10-18，PM 评审 §六） ——————————————
//
// 分层与 shell judge 一致：中立类型＝本模块；只读工具/读取策略＝`src/common/runtime-core/governance-judge/`
// （读/列复用 `shell-judge/policy.ts`，并整体排除 `.ans/**`）；规范化/驱动/账本证据＝编排（P2）。
// 判断可 `approve`；**approval 组**可 `deny` 退回发起角色重做；**decision 组正向代批，不得 deny**，
// `manual` 由桌面作为返工原因回投发起角色。`revise`/`reject`/`false`/空选择/未知 id 一律由编排归一化 `manual`；
// 本层不实现任何判定、不读写账本、不改变任何写权。分组映射＝上方 `GOVERNANCE_CARD_GROUP`（单一来源）。

/** 判断卡范围（desktop/orchestration 与驱动共用；字段逐字按评审 §6.1）。 */
export interface GovernanceJudgeRequest {
  group: GovernanceJudgeGroup;
  cardKind: GovernanceCardKind;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  governanceModel: "single" | "trio";
  flowId: string;
  stepId?: string;
  toolCallId?: string;
  turnId?: string;
  /** 当前轮投递给该角色的文本（≤4KB）；不读原始转录/历史回放。 */
  turnText?: string;
  /** 客户交互卡原样（**不可信数据**；其中的指令一律不执行）。 */
  card: CustomerInputRequest;
  /** confirm 卡：应用提取的候选路径（与 issuer 同一份）。 */
  paths?: string[];
  /** `resolveWrite` 机械探测结果（应用计算；driver 复核，不靠模型自报）。 */
  pathProbes?: Array<{ path: string; allowed: boolean; reason?: string }>;
  /** 只读事实：发起角色 Section 1 可写根。 */
  allowedPathRoots?: string[];
  /** 只读事实：禁写路径。 */
  forbiddenPaths?: string[];
  /** 规范物证路径（由编排按 cardKind 计算；缺失 ⇒ manual）。 */
  artifacts?: { proposalPath?: string; nominationPath?: string; flowPath?: string };
  /** appointment：应用解析提名文件得到的机器可读推荐集（模型只能选恰该集合）。 */
  recommendedRoleIds?: string[];
  /** 有界治理事实快照（账本不可读/错误 ⇒ 禁止 approve）。 */
  facts: GovernanceJudgeFacts;
  at: string;
}

/** confirm 卡的逐路径结论（模型自报；driver 必须与 `pathProbes` 机械复核）。 */
export interface GovernanceJudgePathDecision { path: string; ok: boolean; reason?: string }

/** 判断代批的审计归因（`CustomerInputOutcome.answered.judge`；客户手批不带）。 */
export interface GovernanceJudgeAudit {
  group: GovernanceJudgeGroup;
  cardKind: GovernanceCardKind;
  engine: RuntimeKind;
  model?: string;
  reasonCode: string;
  reason?: string;
  evidence?: string[];
  selected?: string[];
  confirmed?: true;
  paths?: string[];
  pathDecisions?: GovernanceJudgePathDecision[];
  durationMs?: number;
  readCalls?: number;
  readBytes?: number;
}

/** 驱动补全后的判断结果（模型只能经 `report_governance_judgement` 交回原始参数）。 */
export interface GovernanceJudgeOutcome {
  /**
   * `approve` = 正向代批；`deny` = **仅 approval 组**（写卡内容/路径/完整性/一致性可由发起角色修正时
   * 退回重做）；`manual` = 判断无法完成，由桌面转成退回发起角色重做的原因（不呈现客户卡）。
   * decision 组不得 deny。
   */
  verdict: "approve" | "deny" | "manual";
  group: GovernanceJudgeGroup;
  cardKind: GovernanceCardKind;
  reasonCode: string;
  reason?: string;
  engine: RuntimeKind;
  model?: string;
  value?: { selected?: string[]; confirmed?: true };
  paths?: string[];
  pathDecisions?: GovernanceJudgePathDecision[];
  evidence?: string[];
  durationMs?: number;
  readCalls?: number;
  readBytes?: number;
}

export type GovernanceJudgeFn = (
  request: GovernanceJudgeRequest,
  signal?: AbortSignal,
) => Promise<GovernanceJudgeOutcome>;

/** 治理 judge 只读工具选项（`GovernedToolsOptions.governanceJudge`；能力注入，非工具注入）。 */
export interface GovernanceJudgeToolOptions {
  projectRoot: string;
  /** `report_governance_judgement` 回调：只收模型原始参数，**不在运行时核心做规范化**。 */
  report: (raw: unknown) => void;
  stats: ShellJudgeReadStats;
  /** 缺省：maxCalls 12、maxBytes 512KB、maxFileBytes 128KB；maxScanBytes（行范围定位扫描上限）8MiB。 */
  budget?: { maxCalls?: number; maxBytes?: number; maxFileBytes?: number; maxScanBytes?: number };
}

/**
 * 编排在 `run-role.ts::governedInput` 计算并放入 `CustomerInputMetadata.judgeContext` 的应用事实。
 * 桌面只把 `ctx` + 本对象拼成 `GovernanceJudgeRequest`；**不读账本、不 import 编排私有模块**。
 */
export interface GovernanceJudgeContext {
  flowId: string;
  stepId?: string;
  toolCallId?: string;
  turnId?: string;
  paths?: string[];
  pathProbes?: Array<{ path: string; allowed: boolean; reason?: string }>;
  allowedPathRoots?: string[];
  forbiddenPaths?: string[];
  artifacts?: { proposalPath?: string; nominationPath?: string; flowPath?: string };
  recommendedRoleIds?: string[];
  facts: GovernanceJudgeFacts;
  /** 事实计算失败/账本不可读；出现即禁止 approve。 */
  unavailableReason?: string;
}

/** 有界、机读的治理事实快照（评审 §5.3；`ledgerErrors > 0` ⇒ 所有 approve 归一化 manual）。 */
export interface GovernanceJudgeFacts {
  governanceModel: "trio";
  flowId: string;
  /** >0 ⇒ 禁止 approve（fail-closed）。 */
  ledgerErrors: number;
  proposalDecision?: "accepted" | "accepted-quick" | "revise" | "reject";
  /** 最新 appointment 决定。 */
  appointmentTargetRoleIds?: string[];
  /** 该 flow 的 `dispatch.accepted` 步骤（去重，≤50）。 */
  dispatchedStepIds?: string[];
  /** >0 ⇒ acceptance 禁止 approve（启发式，宁可高估）。 */
  unresolvedClarificationCount: number;
  /** 有界（≤20），供 prompt/审计。 */
  latestDecisionKinds: string[];
}

export interface RuntimeAdapter {
  composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }>;
  bindRole(role: ResolvedRole): Promise<RoleSession>;
}

export type RuntimeContextSource = "in-memory" | "fresh" | "resumed" | "recovered";
export type RuntimeTurnOutcome = "completed" | "failed" | "aborted" | "timed_out";
export type JsonSchema = Record<string, unknown>;
export type DiagnosticLog = ReturnType<typeof createDiagnosticLogger>;

export interface InteractionGate {
  begin(): void;
  end(): void;
  isWaiting(): boolean;
  onChange(listener: (waiting: boolean) => void): () => void;
}

export interface ToolExecutionCall extends ToolCall {
  toolCallId?: string;
  signal?: AbortSignal;
}
export interface ToolResult { ok: boolean; message: string; execution?: RuntimeToolExecutionFactsV1 }

export interface ToolDefinition {
  displayInputRule?: ToolDisplayInputRuleV1;
  name: string;
  description: string;
  inputSchema: JsonSchema;
  promptGuidelines?: string[];
  executionMode?: "sequential" | "parallel";
  handler(call: ToolExecutionCall): Promise<ToolResult>;
}

export interface GovernedToolsOptions {
  extraCredentialEnvVars?: readonly string[];
  currentTurnId?: () => string | undefined;
  roleId?: string;
  runtime?: RuntimeKind;
  diagnostics?: DiagnosticLog;
  readRoot?: string;
  writeRoot?: string;
  shellGate?: ShellGate;
  shellCwd?: string;
  shellReviewTimeoutMs?: number;
  /**
   * 命令级执行时限（F-1）：spawn 之后命令自身的最长运行时长（毫秒）。
   * 生效链：本选项 ?? 环境变量 `ANS_PI_SHELL_EXEC_TIMEOUT_MS` ?? 默认 600000（非法/0/负一律回退默认，
   * **不可禁用**）。到期命令被终止、工具如实返回「超时已终止（N ms）」，轮次继续。
   */
  shellExecTimeoutMs?: number;
  customerInput?: CustomerInputFn;
  customerInputTimeoutMs?: number;
  interactionGate?: InteractionGate;
  reportHandback?: ReportHandbackFn;
  dispatchTask?: DispatchTaskFn;
  /**
   * W6-A：`hand_off_intent` 能力（意图交接：校验/去重/后台投递/账本在注入能力侧）。
   * **只给联络官 Liaison 会话注入**（判据在注入端＝编排/桌面窗口，本层不硬编码角色 id）；
   * 未注入 ⇒ 工具不注册（结构性 fail-closed）。交接 ≠ 客户批准。
   */
  handOffIntent?: HandOffIntentFn;
  /**
   * W6-A：`request_clarification` 能力（澄清请求：账本＋主入口系统行在注入能力侧；同一 flow 最多 2 轮）。
   * **只给报告员 Rapporteur 会话注入**（判据在注入端，本层不硬编码角色 id）；
   * 未注入 ⇒ 工具不注册（结构性 fail-closed）。
   */
  requestClarification?: RequestClarificationFn;
  shellVerdict?: ShellVerdictFn;
  /**
   * G-2/R1：`role_status` 数据源（看护只读快照）。**只给内置治理角色 会话注入**（编排注入端判据沿
   * dispatch_task 的 suppressHandback 先例）；未注入 ⇒ 工具不注册（结构性 fail-closed）。
   */
  roleStatus?: RoleStatusFn;
  /** G-2/R1：`session_tail` 数据源（受保护投影后的会话尾线）。只给内置治理角色 注入；未注入 ⇒ 工具不注册。 */
  sessionTail?: SessionTailFn;
  /** G-2/R2：恢复提议能力（只提交载荷、三态回执）。只给内置治理角色 注入；未注入 ⇒ 工具不注册。 */
  proposeRecovery?: ProposeRecoveryFn;
  /**
   * G-4/I2：`install_skill` 能力（校验＋激活＋回执，**不写盘**）。只给内置治理角色 注入（判据沿
   * dispatch_task 的 suppressHandback 先例）；未注入 ⇒ 工具不注册（结构性 fail-closed）。
   */
  installSkill?: InstallSkillFn;
  /** G-4/I2：`uninstall_skill` 能力（校验＋激活＋回执，不写盘）。只给内置治理角色 注入；未注入 ⇒ 工具不注册。 */
  uninstallSkill?: UninstallSkillFn;
  /**
   * G-4 V2：`install_mcp` 能力（校验＋激活＋回执，**不写盘**）。只给内置治理角色 注入（判据沿
   * dispatch_task 的 suppressHandback 先例）；未注入 ⇒ 工具不注册（结构性 fail-closed）。
   */
  installMcp?: InstallMcpFn;
  /** G-4 V2：`uninstall_mcp` 能力（校验＋激活＋回执，不写盘）。只给内置治理角色 注入；未注入 ⇒ 工具不注册。 */
  uninstallMcp?: UninstallMcpFn;
  /**
   * Flow 文件方法化（2026-10-20 客户拍板，最小闭环）：`flow_get` / `flow_step_update` /
   * `flow_step_supersede` 三能力的注入面。能力实现＝编排 flow-service（权限/状态迁移/证据/
   * revision 冲突/Steward/Lead 权限全部在服务端裁决）；本层只调用并如实转达回执。
   * 每项**未注入 ⇒ 对应工具不注册**（结构性 fail-closed，沿 dispatch_task 先例）。
   */
  flowGet?: FlowGetFn;
  /** `flow_step_update` 能力；未注入 ⇒ 工具不注册。 */
  flowStepUpdate?: FlowStepUpdateFn;
  /** `flow_step_supersede` 能力（仅 Steward/Lead 可成功，服务端校验）；未注入 ⇒ 工具不注册。 */
  flowStepSupersede?: FlowStepSupersedeFn;
  /**
   * 判断 agent（「替我审」）只读能力注入。**这是能力注入，不是工具注入**：注入后 Service 必须走
   * `buildShellJudgeTools`（`src/common/runtime-core/shell-judge/`），**不得**走 `buildGovernedTools`——
   * 判断会话结构性不构造写/编辑/shell/客户交互/回交/派发/MCP 工具。未注入 ⇒ 判断模式不成立。
   * `RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions, …>` 继承本字段，无需另行声明。
   */
  shellJudge?: ShellJudgeToolOptions;
  /**
   * 治理卡判断 agent（「替我审批」/「替我决策」）只读能力注入（2026-10-18 双开关评审 §6.1/§6.2）。
   * 与 `shellJudge` **恰一**：同时给出＝配置错误（Service 抛错，不静默择一）；给出时 Service 只走
   * `buildGovernanceJudgeTools`（恰 `judge_read_file`/`judge_list_dir`/`report_governance_judgement`），
   * 同样 `judgeMode:true` 且 `installedMcpServers:[]`。未注入 ⇒ 判断路径不进入（逐字现状）。
   */
  governanceJudge?: GovernanceJudgeToolOptions;
}

export interface RuntimeSessionRecord {
  version: 1;
  id: string;
  roleId: string;
  runtime: RuntimeKind;
  contextSource: RuntimeContextSource;
  nativeSessionId?: string;
  contextWarning?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeReplayEntry {
  entryId?:string;
  inputProvenance?:RuntimeInputProvenanceV1;
  inputTextProjection?:RuntimeInputTextProjectionV1;
  at: string;
  kind: "user" | "event";
  text?: string;
  event?: SessionEvent;
  turnId?: string;
}

export interface RuntimeSessionStorage {
  saveReport?(report:RuntimeReportSnapshotV1):Promise<"saved"|"already-saved">;
  readReports?():Promise<{reports:RuntimeReportSnapshotV1[];reportErrors:{reportId?:string;code:string}[]}>;
  checkpointReplay?():Promise<RuntimeReplayCheckpoint>;
  repairReplayTail?(checkpoint:RuntimeReplayCheckpoint,entries:readonly RuntimeReplayEntry[],record?:RuntimeSessionRecord):Promise<void>;
  readonly runtime: RuntimeKind;
  readonly roleId: string;
  readonly directory: string;
  readonly nativeDirectory: string;

  readonly legacyDirectory?: string;
  /** Validate before native read/resume; does not create directories. */
  validateNativeDirectory?(): Promise<void>;
  /** Invoke at actual native persistence, not at store construction/read. */
  prepareNativeDirectory?(): Promise<void>;
  readLatest(): Promise<RuntimeSessionRecord | undefined>;
  saveSession(record: RuntimeSessionRecord): Promise<void>;
  appendReplay(entries: readonly RuntimeReplayEntry[]): Promise<void>;
  readReplay(): Promise<RuntimeReplayEntry[]>;
}

export interface RuntimeProviderOptions {
  toolDisplayMode?: "required-v1" | "legacy-standalone";
  projectToolEvent?: RuntimeToolEventProjector;
  registerToolDisplayProfile?: RegisterRuntimeToolDisplayProfileV1;
  toolDisplayCredentialEnvNames?: readonly string[];
  runtime: RuntimeKind;
  projectRoot: string;
  skillRoot: string;
  tools: readonly ToolDefinition[];
  storage?: RuntimeSessionStorage;
  interactionGate: InteractionGate;
  currentTurnId: () => string | undefined;
  modelId?: string;
  baseUrl?: string;
  providerId?: string;
  apiKeyEnvVar?: string;
  /**
   * **到点检查时限**（历史字段名，客户裁定 2026-10-17 起**不用于 abort**）：看护据此判断该轮
   * 是否「到点」需要检查；到点只通知 su 核对是否卡死，**不中止整轮**。缺省
   * `DEFAULT_PROMPT_TIMEOUT_MS`（Pi 可经 `ANS_PI_PROMPT_TIMEOUT_MS` 调整）。
   */
  promptTimeoutMs?: number;
  /**
   * **整轮最后兜底**（毫秒）：唯一自动整轮上限，到点才中止。缺省 **1 小时**
   * （`DEFAULT_TURN_LAST_RESORT_MS`＝3600000），固定、不暴露 env；本字段供测试/宿主注入小值。
   * 按有效运行时间计（确认卡挂起期间暂停）。
   */
  turnLastResortMs?: number;
  constructTimeoutMs?: number;
  /**
   * G-4 V2：该角色会话构造时装配的外来 MCP 声明（Service 在 providerFor 读取 `docs/mcp/**` 后注入；
   * **纯消费面**——适配器不得各自去找文件、不得写盘；缺省＝无声明可装配）。装配/放行/呈现属各平台
   * 批次（P1 Claude→P2 Codex→P3 Pi），消费前本字段对既有行为零影响。
   */
  installedMcpServers?: readonly InstalledMcpServerV1[];
  /**
   * G-5：会话级推理强度（Service 在 providerFor 按运行时读 env 并归一后注入；**未设＝字段缺席＝
   * 逐字现状**——适配器不得因字段缺席改变任何既有行为；**纯消费面**，三平台原生接线属各适配器批次）。
   *
   * 冻结映射（中立值 → 各平台原生落点；依据＝评估 `2026-10-16_assess_reasoning-and-effort.md`
   * §五 与 sdk.d.ts 实据）：
   * · `off`：Claude＝`queryOptions.thinking:{type:'disabled'}`（sdk.d.ts ThinkingDisabled）；
   *   Pi＝`setThinkingLevel("off")`（**前置**把克隆模型 `thinkingLevelMap.off` 由 null 收窄为
   *   undefined，否则被 SDK 钳到 minimal＝假关闭——Pi适配器角色实施注记，评估 §4.3/R6）；
   *   Codex＝平台无「关」档——**不注入 `model_reasoning_effort`（零参数）＋如实说明**（不假装关闭）。
   * · `low`/`medium`/`high`/`xhigh`：Claude＝`queryOptions.effort:'<值>'`（EffortLevel 直通，thinking
   *   缺省＝支持模型的 adaptive）；Codex＝`-c model_reasoning_effort="<值>"`（目录面含此四档）；
   *   Pi＝`setThinkingLevel("<值>")`（预算映射 2048/8192/16384/16384——`xhigh` 预算钳到 high 但档位
   *   语义保留）。
   */
  reasoningEffort?: ReasoningEffortV1;
  /**
   * 判断 agent 会话的中性标志（2026-10-17 PM 评审 §6.1；2026-10-18 双开关评审复用）：
   * Service 在 `shellJudge` **或** `governanceJudge` 注入时置 `true`，同时把 `installedMcpServers` 置 `[]`。
   * Claude 适配器据此**强制**关闭 WebSearch（忽略 `ANS_CLAUDE_WEB_SEARCH`）与外来 MCP，只保留注入的
   * judge 工具；Pi/Codex 可忽略本字段。未设＝字段缺席＝逐字现状。
   */
  judgeMode?: true;
}
export type RuntimeProviderFactory = (options: RuntimeProviderOptions) => RuntimeAdapter | Promise<RuntimeAdapter>;

// A4 public display contracts. No SDK or desktop types.
export type DisplayTextV1 = {
  text: string;
  truncated: boolean; // 展示预算裁去字符，或源已明确截断
  redacted: boolean;  // 这段文本实际发生替换
};
export type ToolDisplayV1 = {
  version: 1;
  target?: { kind: 'path' | 'command'; value: DisplayTextV1 };
  resultText?: DisplayTextV1;
  error?: DisplayTextV1;
  process?: {
    exitCode?: number;
    /** 进程因**命令级执行时限**被终止（F-1；与「停止本轮」的 ABORTED 语义区分）。 */
    timedOut?: boolean;
    signal?: string;
    stdout?: DisplayTextV1;
    stderr?: DisplayTextV1;
  };
  durationMs?: number;
  omissions: ('budget' | 'unsupported-input' | 'unsupported-content')[];
};
export type ToolEventDetailV1 = {
  toolName: string; toolCallId?: string; turnId?: string;
  phase: 'start' | 'blocked' | 'result';
  ok?: boolean; status?: 'completed' | 'failed'; errorCode?: string;
  display?: ToolDisplayV1;
};

export type ToolDisplayInputRuleV1 = 'core-path-v1' | 'core-command-v1' | 'none';
export type RuntimeToolExecutionFactsV1 = {
  exitCode?:number; signal?:string;
  stdout?:string; stderr?:string; error?:string;
  stdoutTruncated?:boolean; stderrTruncated?:boolean;
  /** 命令因**命令级执行时限**被终止（F-1，可选向后兼容字段；与「停止本轮」的 ABORTED 语义区分）。 */
  timedOut?:boolean;
  /** 触发终止的**生效**时限（毫秒；仅 timedOut 时携带）。 */
  timeoutMs?:number;
};
export type RuntimeToolResultFactsV1 = {
  ok:boolean; message:string; execution?:RuntimeToolExecutionFactsV1;
};
export type RuntimeToolErrorFactsV1 = { message?:string; code?:string };
export type RuntimeNativeToolResultFactsV1 = {
  isError:boolean;
  content:readonly ({type:'text';text:string}|{type:'unsupported'})[];
};
export type RuntimeToolEventIdentityV1 = {
  toolName:string; toolCallId?:string; turnId?:string;
  runtime?:RuntimeKind; roleId?:string;
};
export type RuntimeToolInputFactsV1 = {
  rule?:ToolDisplayInputRuleV1;
  args:Readonly<Record<string,unknown>>;
};
export type RuntimeToolEventFactsV1 = RuntimeToolEventIdentityV1 & {
  input?:RuntimeToolInputFactsV1;
  durationMs?:number;
} & (
  | {phase:'start';origin:'native-start'|'handler-start'}
  | {phase:'blocked';origin:'governance-hook';
     result?:{ok:false;message:string};error?:RuntimeToolErrorFactsV1}
  | {phase:'result';origin:'handler-result'|'native-result';
     result?:RuntimeToolResultFactsV1;error?:RuntimeToolErrorFactsV1;
     native?:RuntimeNativeToolResultFactsV1}
);
export type RuntimeToolEventSource = RuntimeToolEventFactsV1
  | {origin:'projected-event';event:SessionEvent}
  | {origin:'legacy-event';event:SessionEvent}
  | {origin:'diagnostic';code:'CALL_CONTEXT_UNATTRIBUTED'};
export type RuntimeToolDisplayDiagnosticDetailV1 = {
  version:1;source:'tool-display-diagnostic';
  code:'IDENTITY_TOO_LARGE'|'PROJECTION_FAILED'|'RESULT_OUTCOME_UNAVAILABLE'
    |'DISPLAY_PROFILE_NOT_READY'|'CALL_CONTEXT_UNATTRIBUTED';
};
export type ProjectedRuntimeToolEventV1 = Omit<SessionEvent,'kind'|'detail'> & (
  | {kind:'tool_call'|'accepted'|'denied';detail:ToolEventDetailV1}
  | {kind:'message';detail:RuntimeToolDisplayDiagnosticDetailV1}
);
export type RuntimeToolEventProjector = (
  source:RuntimeToolEventSource,
  redactText?:(text:string)=>string
) => ProjectedRuntimeToolEventV1;
// ToolResult兼容增加 execution?:RuntimeToolExecutionFactsV1。
// ToolDefinition兼容增加 displayInputRule?:ToolDisplayInputRuleV1。

export type RuntimeToolDisplayProfileV1 = {
  apiKeyEnvVar?:string;
  credentials:readonly {name:string;value?:string}[];
};
export type RegisterRuntimeToolDisplayProfileV1 = (profile:RuntimeToolDisplayProfileV1)=>void;
// RuntimeProviderOptions新增：
// toolDisplayMode?: 'required-v1'|'legacy-standalone';
// projectToolEvent?:RuntimeToolEventProjector;
// registerToolDisplayProfile?:RegisterRuntimeToolDisplayProfileV1;
// toolDisplayCredentialEnvNames?:readonly string[];

export type LegacyAnchorTokenV1 = {
  token:string; position:'request'|'conclusion';
  nativeCallId?:string;
};
export type RuntimeLegacyToolFactsV1 = {
  toolName:string;
  phase:'start'|'result';
  toolCallId?:string;
  turnId?:string; // 只保当时实际details.turnId；不假装新Core ACK
  ok?:boolean;
  reportedStatus?:'completed'|'returned'|'failed'|'unknown';
  statusSource?:'native-result'|'tool-details'|'legacy-classifier';
  target?:{
    kind:'path'|'command';value:string;
    source:'argument'|'tool-detail'|'same-call';
  };
};
export type RuntimeLegacyHistoryEntryV1 = {
  at?:string;
  anchor?:LegacyAnchorTokenV1;
} & (
  | {kind:'user-text'|'assistant-text';text:string}
  | {kind:'tool-record';text:string;tool:RuntimeLegacyToolFactsV1}
);
export type RuntimeLegacyHistoryProjectionInputV1 = {
  scope:{roleId:string;runtime:'pi'};
  readOk:boolean;
  entries:readonly RuntimeLegacyHistoryEntryV1[];
  source?:string; // 原reader选中的文件名，仅显示值，不是读指令
  error?:string;
  skipped:number;
  credentialEnvNames?:readonly string[];
};
export type RuntimeProtectedLegacyToolFactsV1 = Omit<RuntimeLegacyToolFactsV1,'target'> & {
  target?:{
    kind:'path'|'command';value:DisplayTextV1;
    source:'argument'|'tool-detail'|'same-call';
  };
  display?:ToolDisplayV1;
};
export type RuntimeProtectedLegacyHistoryEntryV1 = {
  at?:string;anchor?:LegacyAnchorTokenV1;
  metadataOmissions:readonly ('timestamp'|'anchor-token'|'oversize-identity')[];
} & (
  | {kind:'user-text'|'assistant-text';text:DisplayTextV1}
  | {kind:'tool-record';text:DisplayTextV1;tool:RuntimeProtectedLegacyToolFactsV1}
  | {kind:'projection-diagnostic';text:DisplayTextV1;
     code:'IDENTITY_TOO_LARGE'|'INVALID_ENTRY'}
);
export type RuntimeLegacyHistoryProjectionV1 =
  | {
      ok:true;version:1;scope:{roleId:string;runtime:'pi'};
      origin:'legacy-native';
      entries:readonly RuntimeProtectedLegacyHistoryEntryV1[];
      reader:{ok:boolean;source?:DisplayTextV1;error?:DisplayTextV1;skipped:number};
      projection:{invalidEntries:number;omittedEntries:number;truncated:boolean};
      protection:'current-known-values-and-patterns';
    }
  | {
      ok:false;version:1;code:'INVALID_INPUT'|'PROJECTION_FAILED';
      message:DisplayTextV1;entries:readonly [];
    };

// C2 / text policy 1 public contracts.
export interface RuntimeSessionPersistence {
  readonly mode: 'enabled' | 'disabled';
  readonly scope: { readonly roleId:string; readonly runtime:RuntimeKind };
  recordFinalReport(draft: RuntimeReportDraftV1): Promise<ReportSaveResultV1>;
  retryReportPersistence(reportId:string): Promise<ReportSaveResultV1>;
  getReportPersistence(reportId:string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence(attemptId:string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt(attemptId:string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange(listener:(change:RuntimePersistenceChangeV1)=>void):()=>void;
}
// RoleSession.persistence?: RuntimeSessionPersistence

export type RuntimeReportDraftV1 = {
  source: { roleId:string; runtime:RuntimeKind; turnId:string };
  taskId:string|null;
  origin:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:string; evidence:readonly string[]; at:string;
};
export type RuntimeReportSnapshotV1 = Omit<RuntimeReportDraftV1,'summary'|'evidence'> & {
  version:1; reportId:string;
  summary:DisplayTextV1; evidence:readonly DisplayTextV1[]; evidenceOmitted:number;
};
export type RuntimeInputProvenanceV1 = {
  version:1; kind:'handback'; deliveryId:string; attemptId:string;
  target:{roleId:string;runtime:RuntimeKind};
  reports:readonly RuntimeReportSnapshotV1[];
};
export type RuntimeDeliveryReceiptV1 = {
  version:1; deliveryId:string; attemptId:string; turnId?:string;
  inputSaved:boolean;
  providerMayHaveStarted:boolean;
  history:'pending'|'saved'|'failed'|'disabled';
  outcome?:RuntimeTurnOutcome;
  retryHistoryAvailable:boolean;
  retryDeliveryAllowed:boolean;
  code?:RuntimePersistenceErrorCode;
};

export type ReportSaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';report:RuntimeReportSnapshotV1;retryAvailable:false}
  | {ok:false;state:'failed'|'disabled'|'expired'|'unsupported';
     code:'PERSIST_FAILED'|'CONFLICT'|'INVALID'|'PERSISTENCE_DISABLED'|'SNAPSHOT_EXPIRED'|'UNSUPPORTED';
     reportId?:string;report?:RuntimeReportSnapshotV1;retryAvailable:boolean;message:string};
// getReportPersistence: 同样state/reportId/retryAvailable与既有安全snapshot，绝不触发写或prompt。

export type RuntimePersistenceErrorCode = 'INVALID'|'CONFLICT'|'PERSIST_FAILED'|'PERSISTENCE_DISABLED'
  |'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'PROVENANCE_TOO_LARGE'
  |'REPLAY_DAMAGED'|'REPLAY_CHANGED'|'ATTEMPT_ALREADY_STARTED'|'RECEIPT_UNAVAILABLE'|'TEXT_PROJECTION_FAILED';
export type ReportSaveStateV1 = {
  state:'saved'|'failed'|'disabled'|'expired'|'unsupported';
  reportId?:string; report?:RuntimeReportSnapshotV1;
  code?:RuntimePersistenceErrorCode; retryAvailable:boolean;
};
export type DeliveryReceiptQueryV1 =
  | {state:'known';receipt:RuntimeDeliveryReceiptV1}
  | {state:'expired'|'unsupported';code:'SNAPSHOT_EXPIRED'|'UNSUPPORTED'|'UNSUPPORTED_VERSION'|'REPLAY_DAMAGED';retryAvailable:false};
export type DeliverySaveResultV1 =
  | {ok:true;state:'saved'|'already-saved';receipt:RuntimeDeliveryReceiptV1}
  | {ok:false;state:'failed'|'expired'|'unsupported'|'disabled';
     code:RuntimePersistenceErrorCode;receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;message:string};
export type RuntimePersistenceChangeV1 =
  | {kind:'report-save';scope:{roleId:string;runtime:RuntimeKind};reportId:string;state:ReportSaveStateV1}
  | {kind:'delivery-history-save';scope:{roleId:string;runtime:RuntimeKind};attemptId:string;
     state:'saved'|'failed'|'expired'|'disabled';receipt?:RuntimeDeliveryReceiptV1;retryAvailable:boolean;code?:RuntimePersistenceErrorCode};
export type RuntimeDeliveryProgressV1 = {
  stage:'turn-created'|'input-saved'|'provider-may-start'|'settled';
  receipt:RuntimeDeliveryReceiptV1;
};
// PromptOptions.onDeliveryProgress?: (progress:RuntimeDeliveryProgressV1)=>void
// RuntimeDeliveryError extends Error { readonly receipt:RuntimeDeliveryReceiptV1 }

export type RuntimeLiveReportViewV1 = {
  source:{roleId:string;runtime?:RuntimeKind;turnId?:string};
  taskId:string|null;origin?:'submitted-report'|'terminal-fallback';
  status:'completed'|'blocked'|'unreported'|'failed'|'aborted';
  summary:DisplayTextV1;evidence:readonly DisplayTextV1[];evidenceOmitted:number;at:string;
};
export type RuntimeLiveReportDraftV1 = Omit<RuntimeLiveReportViewV1,'summary'|'evidence'|'evidenceOmitted'> & {
  summary:string;evidence:readonly string[];
};
export type RuntimeLiveHandbackPresentationV1 = {
  deliveryId?:string;attemptId?:string;target?:{roleId:string;runtime:RuntimeKind};
  version:1;kind:'handback-live';durability:'memory-only'|'unknown-live';
  reports:readonly RuntimeLiveReportViewV1[];
};

export type RuntimeInputTextProjectionV1 = {
  version:1;
  source:'trusted-handback-display';
  modelInputRecorded:false;
  redacted:boolean;
  truncated:boolean; // detail.text/user.text相对modelPromptText是否截断
  summaryTruncated:boolean;
};
// RuntimeReplayEntry.inputTextProjection?:RuntimeInputTextProjectionV1
// PromptInputEventDetail.inputTextProjection?:RuntimeInputTextProjectionV1

export interface RuntimeReplayCheckpoint {bytes:number;sha256:string}
export class RuntimeDeliveryError extends Error {
  readonly receipt:RuntimeDeliveryReceiptV1;
  constructor(message:string,receipt:RuntimeDeliveryReceiptV1){super(message);this.name="RuntimeDeliveryError";this.receipt=structuredClone(receipt);}
}
