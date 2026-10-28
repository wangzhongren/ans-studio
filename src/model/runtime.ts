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

// —————————————— 图片查看：同轮工具结果附图优先 + 下一轮附件回退（2026-10-27 客户要求） ——————————————
//
// `view_image` 工具读取项目内图片后，交付方式由 `RUNTIME_VIEW_IMAGE_POLICY` 单一决定（不在工具层写引擎分支）：
// · `tool-result`：图片随**本次工具结果**进入同一模型工具循环（模型紧接着的下一次调用即可看到），
//   不产生队列/系统行；适配器负责映射为各引擎原生工具结果内容。
// · `next-turn`：图片由注入的 `ViewImageFn` 排队为**同一角色下一轮用户提示的图片附件**，工具本轮只回文本
//   （2026-10-26 两轮附件设计；作为不支持同轮引擎的兼容回退）。
// **初始落地四个运行时全部 `next-turn`**（零行为变化）；各适配器完成映射并经真实探针验证后，才逐引擎翻为
// `tool-result`。**2026-10-27 Gate 3：Pi、Claude、Codex 已翻为 `tool-result`**（真实探针证据：
// `角色卡/Pi适配器/docs/change/2026-10-27_probe_pi-tool-result-images.md`、
// `角色卡/Claude适配器/docs/change/2026-10-27_change_tool-result-images-claude.md`、
// `角色卡/Codex适配器/docs/change/2026-10-27_change_tool-result-images-codex.md`——Codex 以客户确认的
// Chat Completions/Pi 网关为主路径；Responses 真实模型证据仍缺，属同 runtime 单开关的已知限制）；
// demo 仍为 `next-turn`。翻表是唯一开关，也是回滚开关。能力未注入 ⇒ 工具不注册（结构性 fail-closed）。
// 路径/类型/大小校验在工具层；能力侧只负责受理并如实回执。本类型不授予任何写权。

/** `view_image` 的交付方式：工具结果同轮附图 / 下一轮用户提示附件（回退）。 */
export type ViewImageDeliveryMode = "tool-result" | "next-turn";

/** `view_image` 能力回执。`ok:false` 的 `message` 原样转达；契约外回执由工具层 fail-closed。 */
export interface ViewImageReceipt {
  ok: boolean;
  /** 本次实际采用的交付方式；缺省按 `"next-turn"` 处理（旧能力实现零破坏）。非法值按契约外回执处理。 */
  mode?: ViewImageDeliveryMode;
  message?: string;
}

/** `view_image` 的注入能力入参：项目内图片路径（原样回显）+ 已转好的 `PromptImage`（base64 + MIME）。 */
export interface ViewImageInput {
  path: string;
  image: PromptImage;
  /** 当前模型轮次 id（工具从 `options.currentTurnId()` 取；回退批量按轮分组用；可选）。 */
  turnId?: string;
}

/**
 * `view_image` 的注入能力：按回执声明的 `mode` 交付图片并如实回执是否受理。
 * 旧实现可只返回 `{ok:true}`（＝`next-turn`）；能力抛错/契约外回执由工具层按「未提供图片」fail-closed 处理。
 */
export type ViewImageFn = (input: ViewImageInput) => Promise<ViewImageReceipt>;

/**
 * 每个运行时的有效图片策略（单一来源；工具层只消费，不写引擎分支）。
 * `delivery` 是唯一开关：`RUNTIME_VIEW_IMAGE_POLICY[runtime].delivery`。
 */
export interface RuntimeViewImagePolicy {
  delivery: ViewImageDeliveryMode;
  /** 有效单图上限（字节）；`tool-result` 交付时工具取 `min(VIEW_IMAGE_MAX_BYTES, maxImageBytes)`。 */
  maxImageBytes: number;
  /** 每模型轮次最多图片数（仅 `tool-result` 交付计数；`next-turn` 保持既有排队行为不变）。 */
  maxImagesPerTurn: number;
  /** 每模型轮次图片原始字节总预算（仅 `tool-result` 交付计数）。 */
  maxBytesPerTurn: number;
}

/**
 * 运行时图片策略表（**目标态**见设计 §6.1）。逐引擎启用（Gate 3）由适配器真实探针证据驱动：
 * **Pi、Claude、Codex 已于 2026-10-27 翻为 `tool-result`**（证据见上方注释）；demo 仍为 `next-turn`。
 * Claude 启用时已按设计 §5.2 把 `maxImageBytes` 收紧为 5 MB（更严格的引擎上限提前 fail-closed）。
 * Codex 以客户确认的 Chat Completions/Pi 网关为主路径启用；Responses 真实模型证据仍缺——本表是
 * **runtime 级单开关**（不区分 wire），应用需配置 `ANS_CODEX_WIRE_API=chat` 才走已验证路径。
 * 翻表是唯一开关，也是回滚开关。
 */
export const RUNTIME_VIEW_IMAGE_POLICY: Readonly<Record<RuntimeKind, RuntimeViewImagePolicy>> = Object.freeze({
  demo: Object.freeze({ delivery: "next-turn", maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 }),
  pi: Object.freeze({ delivery: "tool-result", maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 }),
  claude: Object.freeze({ delivery: "tool-result", maxImageBytes: 5 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 }),
  codex: Object.freeze({ delivery: "tool-result", maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 }),
});

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

  /**
   * 当前会话保留的后台任务快照（桌面任务面板展示用；2026-10-25）。
   * 服务会话直接转调本会话唯一的管理器；无管理器（未注入 `ShellGate`、判断会话）或会话已关闭
   * （含 `dispose()` 开始后）返回 `[]`。只读：任务表/日志/pid 只在内存，且只存在于本会话生命周期内；
   * 不授予写权、不绕过审核，也不改变四工具与门禁语义。
   */
  listBackgroundTasks?(): BackgroundTaskSnapshot[];
  /**
   * 读取当前会话某个后台任务的状态与 stdout/stderr 尾部（默认 both / 40 行、上限 200，与
   * `read_background_task` 同源）。无管理器、会话已关闭或 taskId 未知/已过期时返回 `undefined`；
   * 不抛异常、不猜测任务状态。
   */
  readBackgroundTask?(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined;
  /**
   * 按会话管理器的既有终止语义停止任务（`force` 同 `stop_background_task`）。无管理器或会话已关闭时
   * 返回明确失败（`{ok:false, reason:"closed", …}`），**不抛异常、不伪造“已停止”**；未知 taskId 交给
   * 管理器返回 `unknown-task`；`kill-timeout` 必须如实展示为“可能仍在运行”。
   */
  stopBackgroundTask?(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult>;

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

/**
 * 治理流程/步骤标识的 slug 形状（评审 §5.8；2026-10-22 客户确认收紧，设计
 * `角色卡/项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md` §2.1）：
 * `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` —— 2–64 位，首尾均为小写字母/数字，内部可含连字符
 * （连续连字符仍允许），禁止首/尾连字符。工具层按此校验，不猜测、不截断。
 */
export const GOVERNANCE_SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$";

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
 * **需求确认卡**，选项 id 固定 `confirm`/`revise`。**2026-10-20 客户新要求「勾了替我决策就不用我管」**：
 * 该卡纳入 `decision` 组，判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色（不替客户修改）。
 * `decision`（2026-10-26 客户要求）：**材料性选择卡**——主理发现材料性选择（如演示/验收证据方式、
 * 范围、标准/契约偏离、成本或客户可见行为）时**不自行决定**，交统筹（Steward）发本卡；卡内**恰有一个**
 * `recommended: true` 推荐项（校验在应用/角色侧）。**独立于提案/任命/验收**：不触发门禁、不触发验收，
 * 也不等于验收/客户批准；纳入 `decision` 组——客户开启「替我决策」时判断 agent 默认选推荐项。
 */
export type GovernanceChoiceCardKind = "proposal" | "appointment" | "acceptance" | "intent-confirm" | "decision";

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

/** 治理卡判断开关分组：`approval`＝shell＋写盘族；`decision`＝提案/任命/验收/需求确认/材料性选择。 */
export type GovernanceJudgeGroup = "approval" | "decision";

/**
 * 卡片种类 → 开关分组（冻结；新增卡种必须回到评审更新本表）。
 *
 * **`intent-confirm`**：2026-10-18 客户曾拍板「需求确认卡由客户本人回答、判断 agent 永不介入」；
 * **2026-10-20 客户新要求「勾了替我决策就不用我管」**推翻该口径——需求确认卡纳入 `decision` 组，
 * 判断 agent 可在开关开启时代批 `confirm`（`revise` 仍交回客户/发起角色）。此处是唯一映射来源。
 *
 * **`decision`（材料性选择，2026-10-26 客户要求）**：纳入 `decision` 组，客户开启「替我决策」时
 * 判断 agent 默认选卡内**唯一** `recommended: true` 的推荐项。组只表达开关分组，**不表达权限**——
 * decision 卡独立于提案/任命/验收，不触发门禁/验收，也不构成客户批准。
 */
export const GOVERNANCE_CARD_GROUP: Readonly<Partial<Record<GovernanceCardKind, GovernanceJudgeGroup>>> = Object.freeze({
  write: "approval",
  "appointment-write": "approval",
  "schedule-write": "approval",
  proposal: "decision",
  appointment: "decision",
  acceptance: "decision",
  "intent-confirm": "decision",
  decision: "decision",
});

/**
 * 卡片种类所属开关分组。`undefined`/未知 ⇒ `undefined` ⇒ **永不判断**。
 * `intent-confirm` 自 2026-10-20 起纳入 `decision` 组（客户「勾了替我决策就不用我管」）。
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

/**
 * 流程步骤种类（评审 §6.1 闭环：提案 → 流程/团队计划 → 派发 → 验收）。
 *
 * **2026-10-22 治理分工第 1/3/5 项（§9.3 Q4 A）契约冻结**：保留现有值与形状，本层**不新增**
 * `team-plan`（也不得改 `FlowStepKind`）——新流程用 step id 表达角色/阶段（如 `team-plan`、
 * `role-cards`），`kind` 仍取现有值；旧 flow 继续可解析。
 */
export type GovernanceStepKind =
  | "proposal"
  /** @deprecated legacy：旧流程的「提名」步骤；新流程用团队计划 + 现有 kind，不再新增 nomination 步骤。 */
  | "nomination"
  | "dispatch"
  | "acceptance";

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

/**
 * 任命步骤载荷（2026-10-22 治理分工第 1 项）。
 * 团队计划（`docs/scheduling/<flowId>-team-v<n>.md`）是任命与推荐集的权威物证；
 * `nominationPath` 保留为 **legacy**（旧提名文件时代；新流程不再产生）。
 * 快捷路径 `accept-quick` 可没有物证文件（按既有快捷语义处理）。
 */
export interface GovernanceAppointmentStepPayload {
  flowId: GovernanceFlowId;
  stepId?: GovernanceStepId;
  cardKind: "appointment";
  /** 团队计划文件的项目相对路径（`docs/scheduling/<flowId>-team-v<n>.md`；第 1 项）。 */
  teamPlanPath?: string;
  /** @deprecated legacy：旧提名文件路径（`docs/nominations/<flowId>-v<n>.md`）；新流程用 `teamPlanPath`。 */
  nominationPath?: string;
  /** 客户任命的项目角色 id（任命决定的 `targetRoleIds`）。 */
  targetRoleIds: readonly string[];
  version: number;
}

export interface CustomerInputOption {

  id: string;

  label: string;

  description?: string;

  /**
   * `decision`（材料性选择）卡的推荐项标记（2026-10-26 客户要求）：每张 decision 卡**至多一个**
   * `recommended: true`（decision 卡整体要求**恰有一个**）；客户开启「替我决策」时判断 agent
   * 默认选推荐项。类型层只提供字段——推荐项数量等校验在应用/角色侧完成，本层不代选、不补默认值。
   */
  recommended?: boolean;
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

/**
 * 验收分诊卡上客户实际选择的**结构化归因**（2026-10-25 验收分诊设计 §7.3 / §12.3）。
 *
 * 只在桌面把被拦住的验收请求按分诊结果结算时出现：它说明这次结算来自「下发统筹修改 / 仅汇报不返工」
 * 的分诊卡，而不是客户在验收卡上直接选择了 accept/reject。可选、向后兼容——旧生产者不置位，
 * 工具回执文案逐字不变。`report-only` 按既有 accepted 结算，但**不得**被回执说成「客户选择了 accept」。
 */
export interface CustomerInputTriageOutcome {
  disposition: "rework" | "report-only";
  /** `judge` = 判断代批（v1 为确定性规则 `judge-rule`）；`customer` = 客户在分诊卡上选择。 */
  source: "judge" | "customer";
  /** 报告结论（原样；分诊不改变验收结论）。 */
  conclusion: "pass" | "fail" | "conditional";
  /** 稳定分诊 id（`triage-<flowId>-<reportSha 前 8 位>`）。 */
  triageId: string;
}

/**
 * 客户输入结算结果。`operatorId` 前缀是工具回执分流依据（2026-10-25）：`judge:<engine>` = 判断
 * agent 代批；`system:<机制>` = 系统裁决（如 `system:write-preauthorization` 边界内写入预授权，
 * **不是客户手批**，也不是判断代批）；其余/缺席 = 客户或旧通道来源（既有语义逐字不变）。
 */
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
      /** 验收分诊归因（2026-10-25；仅分诊结算置位；不是客户在验收卡上的直接选择）。 */
      triage?: CustomerInputTriageOutcome;
    }
  | {
      outcome: "declined";
      operatorId?: string;
      reason?: string;
      /**
       * 卡片**从未呈现给客户**（2026-10-22 无效治理卡守卫设计 §4.6）：应用在触达客户通道之前
       * 拒绝发卡（如治理角色缺 `flowId`/`cardKind`）时置位。可选、向后兼容——既有 `declined`
       * 生产者（客户拒绝、判断 manual 退回、通道故障等）不设置，下游文案逐字不变。
       * 工具处理器据此区分「系统拒绝发卡」与「客户拒绝」：不得回报「未获客户同意」。
       */
      notPresented?: true;
      /** 验收分诊归因（2026-10-25；自动处置/退回等不呈现验收卡时的来源说明）。 */
      triage?: CustomerInputTriageOutcome;
    }
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

// —————————————— B 批：任务/汇报主干与最小状态（2026-10-28） ——————————————
//
// 形状单一来源＝本模块：`tasks.jsonl` 事件、每角色运行日志条目、星形派发载荷扩展与
// `role_activity_log` 能力。编排 `task-state.ts`/`role-log.ts` 只按这些形状读写；
// 桌面窗口只接线、运行时核心只声明工具面——任一层不得另立第二份字段名。

/** 任务副作用分类（B-08）：幕僚声明，应用**只升不降**校验。 */
export type TaskSideEffect = "read-only" | "docs" | "code" | "external" | "destructive" | "unknown";

/** `task.reported` 的工作结果状态（B-05；内部 `completed` 落盘为 `done`）。 */
export type TaskReportStatus = "done" | "blocked" | "failed";

/** 任务收口结论（B-03）。 */
export type TaskClosedOutcome = "accepted" | "rework" | "rejected";

/** 重派安全结论（B-08）：仅 `safe` 允许自动重派。 */
export type TaskRedispatchSafety = "safe" | "unsafe" | "needs-review";

/** 所有任务事件的公共字段（`v=1`；时间 ISO 8601；坏行读取侧跳过并记日志）。 */
export interface TaskStateEventBase {
  v: 1;
  at: string;
}

export interface TaskCreatedEvent extends TaskStateEventBase {
  kind: "task.created";
  taskId: string;
  flowId?: string;
  /** B 批新任务只由幕僚派发（星形路由）；旧 flow 派发不写本事件。 */
  from: "chief";
  to: string;
  text: string;
  expectedOutput?: string;
  requestedEvidence?: string[];
  sideEffect: TaskSideEffect;
  /** 必填：同键视为同一任务（重派沿用原键，任务 id 另给）。 */
  idempotencyKey: string;
}

export interface TaskDeliveredEvent extends TaskStateEventBase {
  kind: "task.delivered";
  taskId: string;
  to: string;
  sessionId?: string;
}

export interface TaskReportedEvent extends TaskStateEventBase {
  kind: "task.reported";
  taskId: string;
  from: string;
  status: TaskReportStatus;
  /** 单行摘要，≤200 字（写入侧截断并标注）。 */
  summary: string;
  evidence?: string[];
  turnId?: string;
}

export interface TaskClosedEvent extends TaskStateEventBase {
  kind: "task.closed";
  taskId: string;
  by: "chief";
  outcome: TaskClosedOutcome;
  note?: string;
}

export interface TaskRedispatchEvent extends TaskStateEventBase {
  kind: "task.redispatch";
  /** 重派产生的新任务 id。 */
  taskId: string;
  retryOf: string;
  to: string;
  reason: "stuck";
  safety: TaskRedispatchSafety;
}

/** 委派变更（可选；B 批只定义形状，不改变任何权限）。 */
export interface DelegationChangedEvent extends TaskStateEventBase {
  kind: "delegation.changed";
  roleId: string;
  from?: string;
  to?: string;
  reason?: string;
}

/** `.ans/state/tasks.jsonl` 的单行事件联合（append-only；每行一个事件）。 */
export type TaskStateEvent =
  | TaskCreatedEvent
  | TaskDeliveredEvent
  | TaskReportedEvent
  | TaskClosedEvent
  | TaskRedispatchEvent
  | DelegationChangedEvent;

/** 每角色运行日志条目（B-04；字段白名单，写入侧脱敏/截断）。 */
export interface RoleLogEntry {
  v: 1;
  at: string;
  roleId: string;
  taskId?: string;
  turnId?: string;
  /** 事件类别：turn.start/turn.end/tool.call/tool.result/delivery/task/terminate/redispatch/patrol/... */
  kind: string;
  /** 工具名（仅工具事件；名称白名单由写入侧清洗）。 */
  tool?: string;
  /** 单行摘要，≤200 字；不写完整 prompt/完整命令参数/凭据。 */
  summary: string;
  status?: string;
  /** 证据引用（项目相对路径或稳定 id；不写绝对路径）。 */
  ref?: string;
}

/** `role_activity_log` 查询载荷（仅幕僚可用；缺省 limit=50，上限 200）。 */
export interface RoleActivityLogPayload {
  roleId: string;
  /** ISO 时间下界（含）；缺省不限。 */
  since?: string;
  limit?: number;
}

/**
 * `role_activity_log` 的注入数据源（桌面主进程读 `.ans/state/logs/<roleId>.jsonl`）。
 * 纯读、字段白名单、项目相对路径；失败以 `{ok:false,message}` 如实表达，不抛、不编造。
 */
export type RoleActivityLogFn = (
  query: RoleActivityLogPayload,
  metadata?: ReportHandbackMetadata,
) => WatchdogToolResult | null | undefined | void | Promise<WatchdogToolResult | null | undefined | void>;

/** `terminate_role_run` 载荷（B-07；幕僚确认卡死后终止当前轮次 + 子进程树）。 */
export interface TerminateRoleRunPayload {
  roleId: string;
  taskId?: string;
}

/** `terminate_role_run` 回执（B-08）：终止是否确认/子进程数/部分写入如实；未确认 ⇒ 禁止自动重派。 */
export interface TerminateRoleRunReceipt {
  ok: boolean;
  terminationConfirmed: boolean;
  childProcesses: number;
  childProcessesStopped: number;
  partialArtifacts?: string[];
  message?: string;
}

export type TerminateRoleRunFn = (
  payload: TerminateRoleRunPayload,
  metadata?: ReportHandbackMetadata,
) => TerminateRoleRunReceipt | null | undefined | void | Promise<TerminateRoleRunReceipt | null | undefined | void>;

/** `redispatch_task` 载荷（B-07/B-08；按安全分类重派，目标缺省沿用原任务）。 */
export interface RedispatchTaskPayload {
  taskId: string;
  to?: string;
}

/** `redispatch_task` 回执：仅 `safety:"safe"` 且 `ok:true` 产生新任务。 */
export interface RedispatchTaskReceipt {
  ok: boolean;
  taskId?: string;
  retryOf?: string;
  safety: "safe" | "unsafe" | "needs-review";
  autoAllowed: boolean;
  reasons?: string[];
  message: string;
}

export type RedispatchTaskFn = (
  payload: RedispatchTaskPayload,
  metadata?: ReportHandbackMetadata,
) => RedispatchTaskReceipt | null | undefined | void | Promise<RedispatchTaskReceipt | null | undefined | void>;

export interface DispatchTaskPayload {

  roleId: string;

  task: string;

  reason?: string;

  /** B 批：幕僚声明的副作用分类（缺填/非法由应用按 `unknown` 处理，只升不降）。 */
  sideEffect?: TaskSideEffect;

  /** B 批：期望产出（任务卡固定字段；纯展示/派发文本用）。 */
  expectedOutput?: string;

  /** B 批：建议证据（≤5 条路径的提示；不构成验收结论）。 */
  requestedEvidence?: string[];

  /** B 批：幂等键（缺省由应用按 from/to/正文生成）。 */
  idempotencyKey?: string;

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

/**
 * `flow_get` 返回的步骤视图（服务端投影；工具层原样转达，不重算）。
 *
 * 2026-10-22 角色粒度/MapReduce 方案 A（`implemented-unverified`）：可选承载 `parallelGroup`/
 * `dependsOn`。本层**只定字段**；并行组语法、依赖目标存在性/环、同 Map 组无依赖、Reduce 覆盖
 * 全部 Map 等静态校验在编排 `flow-state`，dispatch 前置 `done` 检查在编排 `governance-gate`。
 * 两个字段均可选：旧 flow 不填 ⇒ 字段缺席，视图形状与旧行为逐字不变（不新增 `FlowToolStepKind`）。
 */
export interface FlowToolStepView {
  id: string;
  title: string;
  owner: string;
  kind: FlowToolStepKind;
  status: FlowToolStatus;
  evidence?: FlowToolEvidence;
  supersedes?: string[];
  supersededBy?: string;
  /** 并行组（可选）：`map-<slug>` 或 `reduce`；仅承载，校验在编排。 */
  parallelGroup?: string;
  /** 前置 step id 列表（可选）：仅承载，环检测与前置 `done` 检查在编排。 */
  dependsOn?: string[];
}

/** `flow_get` 返回的流程视图。`canUpdate` 是服务端按调用角色计算的**可更新步骤 id**（权限裁决在服务端）；步骤视图可携带可选 `parallelGroup`/`dependsOn`（本层只承载）。 */
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
  /**
   * 新步骤的并行组（可选；2026-10-22 角色粒度/MapReduce 方案 A）：`map-<slug>` 或 `reduce`。
   * 仅承载；语法/静态校验在编排 flow-service（本层不判）。
   */
  parallelGroup?: string;
  /** 新步骤的前置 step id 列表（可选；仅承载，存在性/环/前置 `done` 校验在编排）。 */
  dependsOn?: string[];
}) => Promise<FlowToolResult>;

// —————————————— 独立复核请求（2026-10-25 客户要求；request_acceptance） ——————————————
//
// 背景：统筹（Steward）在交付完成后应能**直接提交独立复核**，而不是等应用的一次 settle/账本事件
// 才派 Proof。为此新增内置治理角色可用的 `request_acceptance` 工具：**工具面只路由载荷并如实转达
// 回执**——真正的派发（Proof/验收）、验收标准/变更包/风险档/流程完整性校验、flow/账本写入全部由
// **应用注入的能力**实现（本层不实现业务、不写 flow/账本、不做治理判定）。
// 纪律：请求复核 ≠ 客户决定、不代表客户批准；能力未注入 ⇒ 工具不注册（沿 flowGet 先例，最强 fail-closed）。

/** `request_acceptance` 载荷：`flowId` 缺席＝当前/默认流程（由应用归一）；`note` 为可选说明。 */
export interface RequestAcceptanceInput {
  flowId?: string;
  note?: string;
}

/**
 * `request_acceptance` 的如实回执（形状冻结；工具层**原样**转达，不解释为客户批准）。
 * `ok:true`＋`code:"dispatched"`＝应用已派发独立复核；其余 code 为如实的未派发/已派发原因。
 */
export interface RequestAcceptanceResult {
  ok: boolean;
  code: "dispatched" | "flow-not-found" | "criteria-missing" | "change-package-missing" | "change-package-no-risk" | "flow-incomplete" | "runtime-unresolved" | "already-dispatched" | "unavailable";
  message: string;
  flowId?: string;
  runtime?: RuntimeKind;
}

/** `request_acceptance` 注入能力（派发/校验/flow/账本由应用实现；未注入 ⇒ 工具不注册）。 */
export type RequestAcceptanceFn = (input: RequestAcceptanceInput) => Promise<RequestAcceptanceResult>;

// —————————————— Gate 复核请求（2026-10-26 客户授权；request_gate_review） ——————————————
//
// 依据：客户 2026-10-26 确认「独立复核的权威只放在验收角色（Proof）；统筹只协调与检查证据完整性；
// 对关键节点设置验收门禁（gate），由 Proof 独立判定」，授权在运行时核心落 Model/Provider 契约与工具
// （设计 `2026-10-26_design_proof-gate-reviews.md` §5.2/§5.5/§10-A4/§12）。
// gate 复核是**独立于最终验收**的通道：`request_acceptance` 保持原义（最终验收唯一主动通道），
// `request_gate_review` 只用于关键节点 gate。本层只路由载荷并**如实转达回执**——gate 步骤查找、
// 前置/证据/标准校验、Proof 派发、gate 记录与账本写入全部由**应用注入的能力**实现（本层不写
// flow/账本、不做治理判定）。纪律：**gate 复核 ≠ 验收通过 ≠ 客户批准**；`dispatched` 只表示已派
// Proof；gate fail 只按 blocker/major 判失败，只有 minor/nit 不构成返工依据（防吹毛求疵）。
// 能力未注入 ⇒ 工具不注册（沿 requestAcceptance 先例，能力缺席＝最强 fail-closed）。

/**
 * `request_gate_review` 载荷：`flowId` 缺席＝当前/默认流程（由应用归一）；`gateId` 必填
 * （gate 步骤 id，匹配 `GOVERNANCE_SLUG_PATTERN` 的 slug，如 `gate-vertical-slice`）；
 * `note` 为可选有界说明（工具层有上限，不写账本、不参与判定）。
 */
export interface RequestGateReviewInput {
  flowId?: string;
  gateId: string;
  note?: string;
}

/**
 * `request_gate_review` 的如实回执（形状冻结；工具层**原样**转达）。
 * `ok:true`＋`code:"dispatched"`＝应用已派 Proof 做 gate 复核——**不等于 gate 通过、不代表验收通过、
 * 不代表客户批准**；其余 code 为如实的未派发/已派发原因（`rejected`＝应用在派发前退回统筹）。
 *
 * **`flow-busy`（2026-10-27 客户要求）**：流程仍有在途工作（在途交付/轮次/回交等），gate **暂不派发**，
 * 可稍后重试——这是**可重试的独立返回码**，不是故障、不是 gate 失败，也不代表已派发；`message` 必须带原因。
 */
export interface RequestGateReviewResult {
  ok: boolean;
  code: "dispatched" | "already-dispatched" | "flow-busy" | "gate-not-found" | "criteria-missing" | "flow-incomplete" | "unavailable" | "rejected";
  message: string;
  flowId?: string;
  gateId?: string;
  runtime?: RuntimeKind;
}

/** `request_gate_review` 注入能力（gate 校验/派发/记录/账本由应用实现；未注入 ⇒ 工具不注册）。 */
export type RequestGateReviewFn = (input: RequestGateReviewInput) => Promise<RequestGateReviewResult>;

// —————————————— 边界变更请求（2026-10-26 客户要求；request_boundary_change） ——————————————
//
// 真机缺口：治理门禁规定「内置治理角色不可被派发、治理角色之间不 dispatch」，统筹无法让组队（Crew）
// 修改项目角色的写集/边界（例：castle 项目 app-shell 缺 `tsconfig.node.json` 写权，只能上报等客户手动
// 触发组队）。为此新增内置治理角色可用的 `request_boundary_change` 工具：**工具面只提交精确增删路径
// 与理由并如实转达回执**——真正的 Crew 派发、确定性校验、AI 门禁审核、appointment-write 与客户/判断确认
// 全部由**应用注入的能力**实现（本层不派发、不写盘、不做治理判定）。
// 纪律：本工具只提交请求 ≠ 客户批准、不代表边界已修改；能力未注入 ⇒ 工具不注册（沿 requestAcceptance 先例）。

/**
 * `request_boundary_change` 载荷：只提交**精确增删路径**与理由（不重写整个边界、不扩其它路径）。
 * `addPaths`/`removePaths` 至少一个非空；`flowId` 缺席＝当前/默认流程（由应用归一）。
 */
export interface RequestBoundaryChangeInput {
  roleId: string;
  addPaths?: string[];
  removePaths?: string[];
  rationale: string;
  flowId?: string;
}

/**
 * `request_boundary_change` 的如实回执（形状冻结；工具层**原样**转达）。
 * `ok:true`＋`code:"dispatched"`＝应用已把精确修改请求派发给组队；其余 code 为如实的未派发/已派发原因。
 * `code:"rejected"`＝应用在派发给组队前的确定性校验／AI 门禁审核未通过（deny/manual/超时）——请求被退回
 * 统筹，**不自动放行**，也不代表客户拒绝（message 写明原因）。
 */
export interface RequestBoundaryChangeResult {
  ok: boolean;
  code: "dispatched" | "already-dispatched" | "rejected" | "invalid-role" | "invalid-path" | "no-change" | "unavailable";
  message: string;
  roleId?: string;
  ticketId?: string;
}

/** `request_boundary_change` 注入能力（派发/确定性校验/AI 门禁/客户确认/appointment-write 由应用实现；未注入 ⇒ 工具不注册）。 */
export type RequestBoundaryChangeFn = (input: RequestBoundaryChangeInput) => Promise<RequestBoundaryChangeResult>;

// —————————————— 需求变更申请（2026-10-26 客户要求；request_requirement_change） ——————————————
//
// 背景：报告员（Draft/rapporteur）起草提案时若发现需要**新的客户授权/范围**（或约束/成本变化），
// 不应把未获授权的诉求塞进提案卡「顺带获批」；应提交**需求变更审批**，进入**独立审批**。
// **审批不由主理完成**（2026-10-26 客户纠正）：申请由**提案角色（Rapporteur）或统筹**发起；审批卡由
// 应用在申请成功后自动经发起方会话呈现（decision 卡）——「替我决策」开启时由判断 agent 按推荐项决定，
// 未开启时由客户手选；**发起方不得自批、不得重复发卡**；主理不审批，只在批准后执行意图变更。本工具是报告员可用的专用申请通道：本层只做参数形状
// 校验并**如实转达回执**——意图记录校验、去重/派发、账本/系统行与 decision 卡触发全部由**应用注入
// 的能力**实现（本层不写盘、不弹客户卡、不做治理判定、不改变任何写权）。
// 纪律：**申请≠批准，也不代表意图已变更**；`dispatched` 只表示已提交、不代表通过；
// 不要把新授权写进提案卡；`proposedIntentPatch` 只是建议，绝不替客户改意图；能力未注入 ⇒ 工具不注册
// （沿 requestAcceptance / requestClarification 先例）。

/** 需求变更种类：范围 / 授权 / 约束 / 成本 / 其它。 */
export type RequestRequirementChangeKind = "scope" | "authorization" | "constraint" | "cost" | "other";

/**
 * `request_requirement_change` 载荷：`flowId` 与 `intentId` **至少给一个**（归属校验/去重由应用判定）。
 * `summary`/`rationale` 必填非空且有界；`impact`/`proposedIntentPatch` 可选有界（工具层上限见 schema）。
 * `proposedIntentPatch` 只是给主理的**建议**文本——本工具不替客户修改意图文件，也不产生客户确认。
 */
export interface RequestRequirementChangeInput {
  flowId?: string;
  intentId?: string;
  changeKind: RequestRequirementChangeKind;
  summary: string;
  rationale: string;
  impact?: string;
  proposedIntentPatch?: string;
}

/**
 * `request_requirement_change` 的如实回执（形状冻结；工具层**原样**转达）。
 * `ok:true`＋`code:"dispatched"`＝应用已登记申请并进入**需求变更审批**（审批卡可由**提案角色
 * Rapporteur 或统筹**发起/持有；「替我决策」开启时由判断 agent 按推荐项决定，未开启时客户手选）——
 * **`dispatched` 只表示已提交、不代表通过**，申请≠批准，也不代表意图已变更；**发起方不得自批**；
 * 主理不审批，只在批准后执行意图变更。其余 code 为如实的未提交/已提交原因（`rejected`＝应用在派发
 * 前退回报告员，不代表客户拒绝）。
 */
export interface RequestRequirementChangeResult {
  ok: boolean;
  code: "dispatched" | "already-dispatched" | "invalid" | "intent-not-found" | "flow-not-found" | "unavailable" | "rejected";
  message: string;
  flowId?: string;
  intentId?: string;
  requestId?: string;
}

/** `request_requirement_change` 注入能力（意图校验/去重/派发/账本/系统行由应用实现；未注入 ⇒ 工具不注册）。 */
export type RequestRequirementChangeFn = (input: RequestRequirementChangeInput) => Promise<RequestRequirementChangeResult>;

// —————————————— 验收标准产物汇报（2026-10-27 客户要求；report_artifact_ready） ——————————————
//
// 背景（客户 2026-10-27 新设计）：验收标准由质检写完后，**质检只向应用汇报，应用校验后决定是否收口**；
// 质检不再盯文件自动勾卡、也不自行修改 flow 状态。本层只定义中立形状与工具路由：
// `report_artifact_ready` 工具仅在 `GovernedToolsOptions.reportArtifact` 注入时注册（未注入 ⇒ 工具不
// 存在，最强 fail-closed，沿 request_acceptance 先例）；工具**不写盘、不读写 flow、不做治理判定、
// 不假装应用已接受**——只把输入原样交给注入能力并如实转达回执。**汇报成功不等于自动完成**：
// `accepted:true` 只表示应用已收到并接受该产物；是否收口/推进 flow 步骤由应用校验后决定并写入
// （不由本工具或质检代做）。能力实现（路径/步骤/哈希/收口校验与 flow 写入）属编排/桌面注入端。

/**
 * `report_artifact_ready` 载荷（2026-10-27 客户要求）：质检把已写好的验收标准产物汇报给应用。
 * `flowId`/`stepId`/`path` 由工具层做**基本非空字符串**校验；路径是否存在、步骤是否属于该 flow、
 * 摘要/哈希与文件内容是否一致、是否满足收口条件等**全部由应用注入的能力校验**（本层不读文件、
 * 不判 flow、不写盘）。`sha256` 为可选的内容摘要（十六进制字符串；**格式与是否与文件一致由能力侧
 * 校验**，本层不重算）。
 */
export interface ReportArtifactInput {
  flowId: string;
  stepId: string;
  path: string;
  summary?: string;
  sha256?: string;
}

/**
 * `report_artifact_ready` 的如实回执（形状冻结；工具层原样转达）。
 * - `ok`：应用是否已受理本次汇报并给出明确结果（false＝未受理/校验失败/应用不可用）；
 * - `accepted`：应用对产物的校验决定——`true`＝已接受（**是否收口/推进 flow 仍由应用决定**）、
 *   `false`＝明确拒绝、缺席＝未声明接受（工具层**不得**宣称已接受）；
 * - `message`：一句如实说明（拒绝原因/已接受细节），工具层原样转达。
 */
export interface ReportArtifactReceipt {
  ok: boolean;
  accepted?: boolean;
  message?: string;
}

/**
 * `report_artifact_ready` 注入能力（校验/收口/flow 写入由应用实现；未注入 ⇒ 工具不注册）。
 * 纪律：能力侧必须自行校验路径/步骤/flow 与产物一致性后再决定是否收口；**接受 ≠ 已完成**——
 * 能力不得因本调用授予任何写权，也不得跳过既有门禁/验收标准规则。
 */
export type ReportArtifactFn = (input: ReportArtifactInput) => Promise<ReportArtifactReceipt>;

// —————————————— 推理与推理强度（G-5 wave 1 契约层；冻结符号，单一来源＝本模块） ——————————————
//
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝ G-5（推理与推理强度）；评估
// `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`（§五 请求面/§六 呈现面）、
// 产品设计 `角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`。两层：
//
// ①请求面＝中立档位 `ReasoningEffortV1`（PM 冻结恰五值）＋`RuntimeProviderOptions.reasoningEffort`。
// Service 在 providerFor 按运行时读 env（`ANS_CLAUDE_REASONING_EFFORT`/`ANS_CODEX_REASONING_EFFORT`
// /`ANS_PI_REASONING_EFFORT`）、归一（合法五值，trim＋忽略大小写；未设/空串＝未设；其余＝按未设处理
// ＋诊断，**绝不毁会话**）后注入。**未设（字段缺席）＝交给平台默认策略**，不等于原生请求零参数，
// 也不允许恢复时无意沿用旧显式档位；适配器消费中立配置（各平台默认与兼容落点见
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
  /**
   * 规范物证路径（由编排按 cardKind 计算；缺失 ⇒ manual）。
   * 2026-10-22 治理分工第 1/3/5 项（方案 §8.2）可选新增：`teamPlanPath`（第 1 项，团队计划）、
   * `acceptanceCriteriaPath`/`acceptanceReportPath`/`changePackagePath`（第 3 项）；
   * `nominationPath` 保留为 **legacy**。与 `GovernanceJudgeContext.artifacts` 同形（单一字段集，
   * 不另建第二份类型）；全部新增字段可选，旧调用零变化。
   */
  artifacts?: {
    proposalPath?: string;
    /** @deprecated legacy：旧提名文件路径；新流程用 `teamPlanPath`。 */
    nominationPath?: string;
    /** 团队计划路径（`docs/scheduling/<flowId>-team-v<n>.md`；第 1 项）。 */
    teamPlanPath?: string;
    flowPath?: string;
    /** 实施前验收标准路径（`docs/acceptance/<flowId>-criteria-v1.md`；第 3 项）。 */
    acceptanceCriteriaPath?: string;
    /** 验收报告路径（`docs/acceptance/<flowId>-report-v1.md`；第 3 项）。 */
    acceptanceReportPath?: string;
    /** 变更包路径（`docs/scheduling/<flowId>-change-v1.md`；第 3 项）。 */
    changePackagePath?: string;
  };
  /** appointment：应用解析团队计划（legacy：提名文件）得到的机器可读推荐集（模型只能选恰该集合）。 */
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
  /**
   * 规范物证路径（与 `GovernanceJudgeRequest.artifacts` 同形；单一字段集，不另建第二份类型）。
   * 新增字段全部可选：`teamPlanPath`（第 1 项）、`acceptanceCriteriaPath`/`acceptanceReportPath`/
   * `changePackagePath`（第 3 项）；`nominationPath` 保留为 **legacy**。
   */
  artifacts?: {
    proposalPath?: string;
    /** @deprecated legacy：旧提名文件路径；新流程用 `teamPlanPath`。 */
    nominationPath?: string;
    /** 团队计划路径（`docs/scheduling/<flowId>-team-v<n>.md`；第 1 项）。 */
    teamPlanPath?: string;
    flowPath?: string;
    /** 实施前验收标准路径（`docs/acceptance/<flowId>-criteria-v1.md`；第 3 项）。 */
    acceptanceCriteriaPath?: string;
    /** 验收报告路径（`docs/acceptance/<flowId>-report-v1.md`；第 3 项）。 */
    acceptanceReportPath?: string;
    /** 变更包路径（`docs/scheduling/<flowId>-change-v1.md`；第 3 项）。 */
    changePackagePath?: string;
  };
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
  /**
   * 风险档位（2026-10-22 治理分工第 3 项；方案 §8.2）：T0–T3，定义以 `references/testing.md` 为
   * 唯一口径；**不是** `qualityTier`（prototype/production）。可选；缺失＝应用未提供（判定回落规则在编排）。
   */
  riskTier?: "T0" | "T1" | "T2" | "T3";
  /**
   * 最新 appointment 决定是否绑定了团队计划物证（第 1 项；方案 §8.2）。
   * 可选；缺失＝未知（旧账本/旧调用），不得据此解锁任何门禁。
   */
  teamPlanConfirmed?: boolean;
  /**
   * 团队计划 schema 版本（2026-10-22 角色粒度/MapReduce；2026-10-23 目录级授权 v3）。
   * `1` = legacy 缺省、`2` = 角色粒度/MapReduce v2、`3` = 目录级授权 v3（v2 字段 + 授权目录/目录规范）。
   * 可选；缺失＝应用未提供/未解析，不得据此假定任何版本（尤其不得假定 v3）。
   * 物证仍沿用 `artifacts.teamPlanPath`，不新增 artifact kind。
   */
  teamPlanSchema?: 1 | 2 | 3;
  /**
   * 团队计划模块 id 摘要（有界、去重；供 prompt/审计）。可选；缺失＝应用未提供。
   * 只是机器摘要，**不**代表应用已做粒度语义判断（语义复核仍在 Convener readiness）。
   */
  teamPlanModules?: string[];
  /**
   * 团队计划授权目录摘要（v3；有界、去重；只作 judge 事实摘要，供 prompt/审计）。可选；缺失＝应用未提供，
   * 不得据此假定 v3（v1/v2 计划通常无目录列）。长度/内容由生产方（编排）裁剪；目录是否合规仍由
   * V-D/V12/布局核对与 readiness 判定，本字段不构成写权、授权或语义结论。
   */
  teamPlanDirectories?: string[];
}

// —————————————— 会话级后台任务（2026-10-22 客户确认设计 B1–B4） ——————————————
//
// 依据：`角色卡/项目管理/docs/design/2026-10-22_design_background-tasks.md`（客户 2026-10-22 确认必需项
// B1–B4）。后台任务**只属于当前角色会话**：任务表、日志、pid 只在内存，不跨重启；会话关闭（dispose）
// 或模型显式 `stop_background_task` 才终止；轮次结束/停止本轮**不终止**后台任务。
// 管理器实现＝`src/common/runtime-core/background-tasks.ts`（唯一 spawn 入口）；Service 在
// `providerFor` 创建并注入，Provider 四工具只消费注入能力。判断会话（shellJudge/governanceJudge）
// 结构性不经过 `buildGovernedTools`，因此看不到四工具。

/** 后台任务状态（只由真实事件驱动）：运行中 / 自然退出 / 被停止 / 启动后运行错误 / 终止预算内未收口。 */
export type BackgroundTaskState = "running" | "exited" | "stopped" | "failed" | "kill-timeout";

/** 后台任务快照（`list` 与各工具回执共用；`command` 为原始命令文本，展示截断由工具层负责）。 */
export interface BackgroundTaskSnapshot {
  taskId: string;
  state: BackgroundTaskState;
  pid?: number;
  command: string;
  /** 实际 spawn 成功的时间（ISO 8601）。 */
  startedAt: string;
  exitCode?: number;
  signal?: string;
  /** 启动后运行错误（如底层 error 事件）的如实文本；启动失败不产生任务。 */
  error?: string;
  /** 已运行时长（运行中为至今，已结束为启动到 close）。 */
  durationMs: number;
}

/** 单路日志尾部读取结果；`truncated` 表示 256 KiB 环形缓冲曾丢弃更早内容（不假装日志完整）。 */
export interface BackgroundTaskStreamRead {
  text: string;
  truncated: boolean;
}

/** `read_background_task` 可选流与尾部行数（默认 both / 40；上限 200，由工具层与本接口共同钳制）。 */
export interface BackgroundTaskReadOptions {
  stream?: "stdout" | "stderr" | "both";
  tailLines?: number;
}

/** 后台任务读取结果（未知任务由管理器返回 `undefined`，由工具层如实报「未知任务」）。 */
export interface BackgroundTaskReadResult {
  task: BackgroundTaskSnapshot;
  /** 实际返回的尾部行数（已按上限钳制）。 */
  tailLines: number;
  /** 请求行数超过上限（200）时为 true——如实标注，不静默改变请求。 */
  tailClamped: boolean;
  stdout?: BackgroundTaskStreamRead;
  stderr?: BackgroundTaskStreamRead;
}

/** 管理器 `start` 入参：审核通过后由启动工具传入；cwd/env 由工具层按 run_shell 同源规则构造。 */
export interface BackgroundTaskStartInput {
  command: string;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
}

/** 启动结果：只有实际拿到 spawn 成功（pid）才返回任务号；失败不保留半成品任务。 */
export type BackgroundTaskStartResult =
  | { ok: true; task: BackgroundTaskSnapshot }
  | { ok: false; reason: "limit" | "closed" | "spawn-failed"; message: string };

export interface BackgroundTaskStopOptions {
  /** true＝跳过 SIGTERM 直接 SIGKILL；默认 false＝SIGTERM→250ms→SIGKILL→1s 收口。 */
  force?: boolean;
}

/**
 * 停止结果：
 * - `ok:true`：底层 `close` 已观察到（`alreadyEnded` 表示调用前任务早已结束，本次未发送终止信号）；
 * - `ok:false`：未知任务/会话已关闭，或终止预算内未收口（`reason:"timeout"`，快照 state=`kill-timeout`，
 *   **可能仍在运行**）。
 */
export type BackgroundTaskStopResult =
  | { ok: true; task: BackgroundTaskSnapshot; alreadyEnded: boolean }
  | { ok: false; reason: "unknown-task" | "closed" | "timeout"; message: string; task?: BackgroundTaskSnapshot };

/**
 * 会话级后台任务管理器（中立能力接口；实现＝`common/runtime-core/background-tasks.ts`）。
 * Service 创建并注入 `GovernedToolsOptions.backgroundTasks`；四个工具只在同时注入 `ShellGate` 与
 * 本能力时注册。`start` 是**唯一 spawn 入口**：工具层只有在审核结果恰为 `allow:true` 时才调用它。
 */
export interface BackgroundTaskCapability {
  /** 当前占用名额的任务数（含正在等待 spawn 确认的启动，防止并行调用一起突破上限）。 */
  readonly runningCount: number;
  start(input: BackgroundTaskStartInput): Promise<BackgroundTaskStartResult>;
  list(): BackgroundTaskSnapshot[];
  read(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined;
  stop(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult>;
  /** 幂等：标记管理器失效、并行终止全部任务并清空任务/日志。 */
  dispose(): Promise<void>;
}

/** 后台任务工具的向后兼容结构化事实（`ToolResult.backgroundTask`；旧读者忽略）。 */
export interface BackgroundTaskToolFactsV1 {
  taskId: string;
  state: BackgroundTaskState;
  pid?: number;
  exitCode?: number;
  signal?: string;
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
export interface ToolResult {
  ok: boolean;
  message: string;
  /**
   * 本轮工具结果附带的**模型可见**图片（2026-10-27 同轮设计；可选、向后兼容）。
   * 仅 `view_image` 在 `ok:true` 且交付方式为 `tool-result` 时非空；适配器负责映射为原生工具结果内容。
   * **不得**进入 `details`、诊断、工具展示事件或 ANS 回放（只允许计数/字节/MIME 摘要等元数据）。
   */
  images?: readonly PromptImage[];
  /** 审计/展示用的交付方式（同轮附图 / 下一轮附件回退）；不携带图片字节。 */
  imageDelivery?: ViewImageDeliveryMode;
  execution?: RuntimeToolExecutionFactsV1;
  /**
   * 后台任务结构化事实（2026-10-22 B4；可选、向后兼容）：任务号/状态/pid/退出码。
   * 只用于工具结果与聊天行；诊断不落 taskId（共享白名单不含该字段）。
   */
  backgroundTask?: BackgroundTaskToolFactsV1;
}

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
  /**
   * B 批（2026-10-28）：`role_activity_log` 数据源——每角色运行日志（`.ans/state/logs/<roleId>.jsonl`）。
   * **只给幕僚（trio chief）注入**；其他角色（含 convener、项目角色）未注入 ⇒ 工具不注册。
   * 纯读、字段白名单、脱敏/项目相对路径由数据源保证；不写盘、不入队、不改任何判定链。
   */
  roleActivityLog?: RoleActivityLogFn;
  /** B 批：终止动作（只给幕僚；未注入 ⇒ `terminate_role_run` 不注册）。 */
  terminateRoleRun?: TerminateRoleRunFn;
  /** B 批：安全重派动作（只给幕僚；未注入 ⇒ `redispatch_task` 不注册）。 */
  redispatchTask?: RedispatchTaskFn;
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
   * 独立复核请求（2026-10-25 客户要求）：`request_acceptance` 能力——交付/证据/变更包已就绪后，
   * 由统筹直接请应用派 Proof / 验收做**独立复核**，不再等待应用的一次 settle/账本事件。
   * **只给内置治理角色 注入**（判据在编排/桌面注入端，本层不硬编码角色 id）；
   * 未注入 ⇒ 工具不注册（结构性 fail-closed，沿 flowGet 先例）。派发/校验/flow/账本由能力实现；
   * 本层只路由载荷并如实转达回执——**请求复核 ≠ 客户决定，不代表客户批准**。
   */
  requestAcceptance?: RequestAcceptanceFn;
  /**
   * Gate 复核请求（2026-10-26 客户授权）：`request_gate_review` 能力——关键节点验收门禁（gate）的
   * 证据完整性检查通过后，由统筹直接请应用派 Proof 做**独立 gate 复核**；与最终验收
   * （`requestAcceptance`）是两条独立通道，互不替代。**只给统筹（convener）会话注入**（判据在
   * 编排/桌面注入端，本层不硬编码角色 id）；未注入 ⇒ 工具不注册（结构性 fail-closed，沿
   * requestAcceptance 先例）。gate 校验/派发/gate 记录/账本由能力实现；本层只做参数形状校验并如实
   * 转达回执——**gate 复核 ≠ 验收通过 ≠ 客户批准**；`dispatched` 只表示已派 Proof；gate fail 只按
   * blocker/major 判失败，只有 minor/nit 不返工。
   */
  requestGateReview?: RequestGateReviewFn;
  /**
   * 边界变更请求（2026-10-26 客户要求）：`request_boundary_change` 能力——项目角色写集/边界不足时，
   * 由统筹直接请应用把**精确增删路径**派发给组队（Crew）修改角色卡/边界，不绕过 appointment-write
   * 与客户/判断确认。**只给内置治理角色 注入**（判据在编排/桌面注入端，本层不硬编码角色 id）；
   * 未注入 ⇒ 工具不注册（结构性 fail-closed，沿 requestAcceptance 先例）。派发/角色/路径校验/
   * AI 门禁审核/确认/写入由能力实现；本层只做参数形状校验并如实转达回执——**请求变更 ≠ 客户批准**。
   */
  requestBoundaryChange?: RequestBoundaryChangeFn;
  /**
   * 需求变更申请（2026-10-26 客户要求）：`request_requirement_change` 能力——报告员（Draft/rapporteur）
   * 起草提案时发现需要**新的客户授权/范围**（或约束/成本变化）时，**不把未获授权的诉求塞进提案卡**，
   * 而是提交需求变更审批，进入**独立审批**：申请由**提案角色（Rapporteur）或统筹**发起；审批卡由应用
   * 在申请成功后自动经发起方会话呈现（decision 卡）——「替我决策」开启时由判断 agent 按推荐项决定，
   * 未开启时由客户手选；**发起方不得自批、不得重复发卡**；**主理不审批，只在批准后执行意图变更**。
   * **只给报告员（Draft/rapporteur）与统筹（Convener）会话注入**（判据在编排/桌面注入端，本层不硬编码角色 id）；
   * 未注入 ⇒ 工具不注册（结构性 fail-closed，沿 requestAcceptance/requestClarification 先例）。
   * 意图校验/去重/派发/账本/系统行由能力实现；本层只做参数形状校验并如实转达回执——
   * **申请≠批准，也不代表意图已变更**；`dispatched` 只表示已提交、不代表通过；
   * 不要把新授权写进提案卡；`proposedIntentPatch` 只是建议，不替客户改意图。
   */
  requestRequirementChange?: RequestRequirementChangeFn;
  /**
   * 验收标准产物汇报（2026-10-27 客户要求）：`report_artifact_ready` 能力——质检写完验收标准后
   * **只向应用汇报**，由应用校验路径/步骤/产物一致性后**决定是否收口**（质检不盯文件自动勾卡、
   * 不自行修改 flow 状态）。**只给质检（内置 verifier）会话注入**（判据在编排/桌面注入端，本层不
   * 硬编码角色 id）；未注入 ⇒ 工具不注册（结构性 fail-closed，沿 requestAcceptance 先例）。
   * 工具层只做基本参数形状校验并**原样转达**回执（`ok`/`accepted`/`message`）——不写盘、不写 flow、
   * 不做治理判定、不假装应用已接受；**汇报成功 ≠ 自动完成**（是否收口由应用决定）。
   */
  reportArtifact?: ReportArtifactFn;
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
  /**
   * 会话级后台任务管理器（2026-10-22 客户确认设计 B1/B3）：Service 在 `providerFor` 中、走
   * `buildGovernedTools` 且注入了 `ShellGate` 时创建并注入；`RuntimeSessionOptions` 以 `Omit` 排除本字段，
   * 外部调用方不能自行注入。**只有 `ShellGate` 与本能力同时存在时**，`start_background_task` /
   * `list_background_tasks` / `read_background_task` / `stop_background_task` 才一起注册（注入才注册）。
   * 判断会话不经过 `buildGovernedTools`，天然看不到这四个工具。未注入 ⇒ 工具不存在（fail-closed）。
   */
  backgroundTasks?: BackgroundTaskCapability;
  /**
   * 图片查看能力（2026-10-26 客户要求；2026-10-27 同轮设计修订）：工具 `view_image` 读取项目内图片后，
   * 按 `viewImagePolicy.delivery` 交付——`tool-result` 时图片随本次工具结果同轮附图（不触达本能力，
   * Service 注入内联受理回执）；`next-turn` 时调用本能力把图片排队为**同一角色下一轮用户提示的图片附件**，
   * 工具本轮只返回文本。**未注入 ⇒ 工具不注册**（能力缺席 = 最强 fail-closed，沿 dispatch_task 先例）；
   * 路径/类型/大小校验在工具层，能力侧只负责受理并**如实回执**（`ok:false`/抛错 ⇒ 不谎报已提供）。
   * 本能力不写盘、不联网、不改变任何写权。
   */
  viewImage?: ViewImageFn;
  /**
   * `view_image` 的运行时图片策略（2026-10-27 同轮设计）：由 Service 按 `RUNTIME_VIEW_IMAGE_POLICY`
   * 单一注入（`RuntimeSessionOptions` 以 `Omit` 排除本字段，外部调用方不能自行改策略——与
   * `backgroundTasks` 同款）。缺省＝`next-turn` + 10 MB / 4 张 / 20 MB（工具层 fallback，零行为变化）。
   */
  viewImagePolicy?: RuntimeViewImagePolicy;
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
   * G-5：会话级推理强度（Service 在 providerFor 按运行时读 env 并归一后注入）。
   * ANS-REASONING-LIGHT D1：未设/清空时字段缺席，交给各平台默认策略，不保证原生请求零参数。
   * Pi 新建/恢复均重新选择：显式值 → 模型设置 → 全局设置 → Pi 1.1.0 命名默认 medium；
   * 经 SDK 能力钳位后应用，不继承转录中的旧显式等级、不改保存偏好。默认与显式档都须预算保护。
   * 各适配器只在明确参数拒绝时按获准兼容路径继续；成功兼容状态只属当前活会话，重建后重置。
   * 普通网络/鉴权/限流错误不改变请求策略。配置/兼容提示在活动 prompt 内用普通 message 与
   * detail.source="system"，不得冒充 source="reasoning" 的思考事实或声称服务端实际采纳。
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
