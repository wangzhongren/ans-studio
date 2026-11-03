// Shared Model contracts for global project state and version decisions. Owner: 运行时核心.
//
// 依赖方向（2026-11-02 A0 冻结）：本文件是纯类型/常量，**不 import `./runtime.ts`**，也不 import
// `src/common/编排/**`。账本事件接口（及其 `kind` 判别）定义在 `runtime.ts` 并单向 `import type`
// 本文件的枚举/常量；本文件只描述视图、卡、请求与回执形状。禁止 type-only 双向循环。
//
// 本层不授予任何写权、不做 I/O、不改变验收/证据/写权/闸门语义。

/** 全局任务状态视图 schema（`project-state/v1`）。 */
export const PROJECT_STATE_SCHEMA = "project-state/v1";
/** 版本决策契约 schema（`version-decision/v1`）。 */
export const VERSION_DECISION_SCHEMA = "version-decision/v1";

/** 版本决策的两个固定动作 id（顺序即卡面顺序；校验在应用/编排侧）。 */
export const VERSION_DECISION_ACTIONS = ["version-modify", "new-version-development"] as const;
export type VersionDecisionAction = (typeof VERSION_DECISION_ACTIONS)[number];

/** 版本决策理由上限（字符数；超限拒绝、不截断）。 */
export const VERSION_DECISION_REASON_MAX = 1000;
/** 版本决策引用上限（条）。 */
export const VERSION_DECISION_REFS_MAX = 5;
/** `project_note` blocker 文本上限（字符数）。 */
export const PROJECT_NOTE_BLOCKER_TEXT_MAX = 500;
/** `project_note` next-step 文本上限（字符数）。 */
export const PROJECT_NOTE_NEXT_STEP_TEXT_MAX = 1000;
/** `project_note` noteKey 上限（字符数；slug）。 */
export const PROJECT_NOTE_KEY_MAX = 64;
/** `project_note` refs 上限（条）。 */
export const PROJECT_NOTE_REFS_MAX = 5;
/** `project_note` next-step 缺省 noteKey。 */
export const PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY = "next-step";
/** `project_state` 工具文本硬上限（UTF-8 字节；工具层截断并标注 truncated）。 */
export const PROJECT_STATE_TOOL_MAX_BYTES = 8 * 1024;
/** 视图有界默认上限（超出置 `truncated=true` 并保留计数）。 */
export const PROJECT_STATE_LIMITS = Object.freeze({
  flows: 50,
  tasks: 500,
  versionsPerFlow: 20,
  evidence: 50,
});

/** 版本化文档种类（topology 随 roster 参与目标版本计算）。 */
export type ProjectStateDocKind = "intent" | "proposal" | "modules" | "roster" | "architecture" | "assets" | "topology";

/** run manifest 状态（视图内全部历史 run）。 */
export type ProjectStateRunState = "draft" | "pinned" | "closed" | "cancelled";
/** 任务自带的 run 锚点状态（沿 `task.created.runState`）。 */
export type ProjectStateTaskRunState = "draft" | "pinned" | "legacy";
/** 任务状态（与 `taskStatusOf` 同值；结构镜像，不 import 编排）。 */
export type ProjectStateTaskStatus = "created" | "delivered" | "reported" | "closed" | "failed";
/** 任务副作用分类（与 `TaskSideEffect` 同值；结构镜像）。 */
export type ProjectStateTaskSideEffect = "read-only" | "docs" | "code" | "external" | "destructive" | "unknown";
/** 任务最后报告状态（与 `TaskReportStatus` 同值）。 */
export type ProjectStateTaskReportStatus = "done" | "blocked" | "failed";
/** 任务收口结论（与 `TaskClosedOutcome` 同值）。 */
export type ProjectStateClosedOutcome = "accepted" | "rework" | "rejected";

/** focus 来源：幕僚事件 / 应用执行（新版本开发）/ 应用派生 / 无。 */
export type ProjectStateFocusSelectedBy = "chief" | "application" | "derived" | "none";
/**
 * 阻塞/卡点种类（恰好十个；`rework-pending` 只表示验收返工待办信号，不是验收结论，
 * 2026-11-02 PM 裁决统一命名）。
 */
export type ProjectStateBlockerKind =
  | "task-blocked"
  | "task-failed"
  | "request-pending"
  | "rework-pending"
  | "redispatch-exhausted"
  | "version-drift"
  | "reference-invalid"
  | "run-ambiguous"
  | "focus-stale"
  | "chief-note";
/** 阻塞来源：应用机器事实派生 / 幕僚备注。 */
export type ProjectStateBlockerSource = "app" | "chief";
/** 备注种类。 */
export type ProjectStateNoteKind = "blocker" | "next-step";
/** 下一步来源。 */
export type ProjectStateNextStepSource = "chief" | "derived";
/** 证据指针种类。 */
export type ProjectStateEvidenceKind = "acceptance-card" | "verifier-report" | "task-evidence";
/** 证据指针存在性（只是指针，不是有效性结论）。 */
export type ProjectStateEvidenceStatus = "present" | "missing";
/** 视图错误来源（五类；坏行/坏 manifest 不阻塞可读部分）。 */
export type ProjectStateErrorSource = "tasks" | "run-manifest" | "docs" | "roster" | "modules";

/** 版本决策执行状态机（append-only；同一 decisionId 取最新）。 */
export type VersionDecisionStatus = "executing" | "executed" | "failed" | "uncertain";
/**
 * 版本决策决定者：客户本人 / 「替我决策」判断 agent 代批 / 客户事先记录的决策指令
 * （2026-11-03 客户授权平面 Q9 A 加法；`"directive"` 不是客户本人点击，也不是 judge 代批）。
 */
export type VersionDecisionDecidedBy = "customer" | "judge" | "directive";
/** 版本决策稳定错误码（恰 11 项；A1/A2 不得另造同义码）。 */
export const VERSION_DECISION_ERROR_CODES = [
  "version-decision-invalid",
  "flow-not-found",
  "run-ambiguous",
  "run-change-required",
  "decision-pending",
  "channel-unavailable",
  "decision-declined",
  "decision-unavailable",
  "initiator-aborted",
  "execution-failed",
  "execution-uncertain",
] as const;
export type VersionDecisionErrorCode = (typeof VERSION_DECISION_ERROR_CODES)[number];

// —————————————— 视图类型（project-state/v1，设计 §3.3/§7.1） ——————————————

/** 当前焦点（最新有效 `project.focus`；`selectedBy:"derived"` 只在恰好一个候选时）。 */
export interface ProjectStateFocus {
  flowId?: string;
  runId?: string;
  runState?: ProjectStateTaskRunState;
  stage?: string;
  selectedBy: ProjectStateFocusSelectedBy;
  updatedAt?: string;
  /** 指针指向已关闭/不存在的 flow/run；视图列出候选，不自动改。 */
  stale?: boolean;
}

/** 单个 run 的视图（含历史 closed/cancelled；`active` 由部分扫描结果派生）。 */
export interface ProjectStateRunView {
  runId: string;
  state: ProjectStateRunState;
  active: boolean;
  stage?: string;
  createdAt?: string;
  updatedAt?: string;
  pinnedAt?: string;
  closedAt?: string;
  closeReason?: string;
  rosterVersion?: number;
  documentKinds?: string[];
}

/** 单个 flow 的未收口任务计数（blocked/failed 只算活动 flow）。 */
export interface ProjectStateFlowTaskCounts {
  unclosed: number;
  blocked: number;
  failed: number;
}

/** flow 视图（flow 不是独立实体，由 run/任务/文档派生）。 */
export interface ProjectStateFlow {
  flowId: string;
  sources: ("run" | "task" | "docs")[];
  runs: ProjectStateRunView[];
  taskCounts: ProjectStateFlowTaskCounts;
  lastActivityAt?: string;
  /** 由 `version.decision` 记录；旧 flow 已被新 flow 取代。 */
  supersededBy?: string;
}

/** `task.reported` 的结构镜像（model 不 import 编排；A1 加双向可赋值断言防漂移）。 */
export interface ProjectStateReportedEvent {
  v: 1;
  at: string;
  kind: "task.reported";
  taskId: string;
  from: string;
  status: ProjectStateTaskReportStatus;
  summary: string;
  evidence?: string[];
  turnId?: string;
}

/**
 * 任务视图：`TaskCardView` 字段集（结构镜像，不 import 编排）＋
 * `from`/`blocked`/`failed`/`redispatchCount`。
 * `blocked` 只在最后报告 `status==="blocked"`；`failed` 只在 `status==="failed"`，两者不合并。
 */
export interface ProjectStateTask {
  taskId: string;
  retryOf?: string;
  targetRoleId: string;
  text: string;
  expectedOutput?: string;
  requestedEvidence?: string[];
  moduleId?: string;
  moduleDirectory?: string;
  modulePaths?: string[];
  flowId?: string;
  runId?: string;
  runState?: ProjectStateTaskRunState;
  runStage?: string;
  sideEffect: ProjectStateTaskSideEffect;
  status: ProjectStateTaskStatus;
  createdAt: string;
  deliveredAt?: string;
  lastReport?: ProjectStateReportedEvent;
  closed?: { outcome: ProjectStateClosedOutcome; note?: string; at: string };
  reports: ProjectStateReportedEvent[];
  from: "chief" | "convener";
  blocked: boolean;
  failed: boolean;
  redispatchCount: number;
}

/** 阻塞/卡点（信号，不是失败判决，也不是验收结论）。 */
export interface ProjectStateBlocker {
  id: string;
  kind: ProjectStateBlockerKind;
  flowId?: string;
  runId?: string;
  taskId?: string;
  requestId?: string;
  summary: string;
  since?: string;
  source: ProjectStateBlockerSource;
}

/** 最新版本文档指针（`version` 必填：存在即已解析）。 */
export interface ProjectStateLatestVersionPointer {
  path: string;
  version: number;
  sha256?: string;
}

/** pin 住的版本文档指针（版本号可能未知）。 */
export interface ProjectStatePinnedVersionPointer {
  path: string;
  version?: number;
  sha256?: string;
}

/** 版本指针（只做「最新/pin/版本号」比较，不做内容判定）。 */
export interface ProjectStateVersion {
  flowId: string;
  docKind: ProjectStateDocKind;
  latest?: ProjectStateLatestVersionPointer;
  pinned?: ProjectStatePinnedVersionPointer;
  newerThanPinned: boolean;
  referenceIssue?: string;
}

/** 证据指针（不读正文、不判有效性；`status` 只是存在性）。 */
export interface ProjectStateEvidence {
  flowId: string;
  kind: ProjectStateEvidenceKind;
  ref: string;
  summary?: string;
  status: ProjectStateEvidenceStatus;
  at?: string;
}

/** 幕僚备注（append-only 事件的最新 active 状态；不是机器事实）。 */
export interface ProjectStateNote {
  noteKey: string;
  kind: ProjectStateNoteKind;
  text: string;
  refs?: string[];
  at: string;
  roleId: "chief";
  active: boolean;
}

/** 下一步（幕僚备注优先，否则应用派生建议）。 */
export interface ProjectStateNextStep {
  text: string;
  source: ProjectStateNextStepSource;
  at: string;
}

/** 视图错误（坏行/坏 manifest/文档扫描失败；不阻塞可读部分）。 */
export interface ProjectStateError {
  source: ProjectStateErrorSource;
  message: string;
  file?: string;
  line?: number;
}

/** 顶层计数（F4 口径：unclosed 含 superseded；blocked/failed 只算活动 flow）。 */
export interface ProjectStateCounts {
  unclosed: number;
  supersededUnclosed: number;
  activeUnclosed: number;
  blocked: number;
  failed: number;
  pendingRequests: number;
  flows: number;
  tasks: number;
}

/** `project-state/v1` 完整只读视图（UI 与工具同一 builder；工具只做文本投影）。 */
export interface ProjectStateView {
  schema: typeof PROJECT_STATE_SCHEMA;
  generatedAt: string;
  projectRoot: string;
  focus: ProjectStateFocus;
  flows: ProjectStateFlow[];
  tasks: ProjectStateTask[];
  blockers: ProjectStateBlocker[];
  versions: ProjectStateVersion[];
  evidence: ProjectStateEvidence[];
  notes: ProjectStateNote[];
  nextStep?: ProjectStateNextStep;
  errors: ProjectStateError[];
  truncated: boolean;
  counts: ProjectStateCounts;
}

// —————————————— 工具输入/回执（只读视图 + 受控备注 + 版本决策申请） ——————————————

/** `project_state` 查询入参：仅可选 flowId（裁剪域由会话身份注入，不接受 roleId）。 */
export interface ProjectStateQuery {
  flowId?: string;
}

/** `project_state` 能力回执（文本摘要；工具层再按 8 KiB 硬截断并标注）。 */
export interface ProjectStateToolResult {
  ok: boolean;
  text?: string;
  message?: string;
}

/** `project_note` 的 op 白名单。 */
export type ProjectNoteOp = "set-focus" | "blocker" | "next-step";

/** `project_note` 入参（op-specific 必填/长度校验在工具层与应用侧）。 */
export interface ProjectNoteInput {
  op: ProjectNoteOp;
  flowId?: string;
  runId?: string;
  note?: string;
  cleared?: boolean;
  noteKey?: string;
  text?: string;
  active?: boolean;
  refs?: string[];
}

/** `project_note` 回执（append-only 事件无 id；审计用 `at`+`noteKey`+`roleId`）。 */
export interface ProjectNoteResult {
  ok: boolean;
  message: string;
  at?: string;
}

/** `request_version_decision` 入参（幕僚提议的路线；reason 必填）。 */
export interface VersionDecisionRequest {
  flowId: string;
  runId?: string;
  action: VersionDecisionAction;
  reason: string;
  refs?: string[];
}

/** 版本决策事实清单中的单个文档指针（应用只读派生，不生成第二建议）。 */
export interface VersionDecisionFactDocPointer {
  docKind: ProjectStateDocKind;
  version?: number;
  path?: string;
  sha256?: string;
}

/** 卡面事实清单（帮助客户/判断 agent 理解现状；不替代幕僚选择）。 */
export interface VersionDecisionFacts {
  flowId: string;
  runId?: string;
  runState?: ProjectStateTaskRunState;
  stage?: string;
  unclosedCount: number;
  blockedCount: number;
  failedCount: number;
  pendingRequestCount: number;
  acceptanceRejectedCount: number;
  priorVersionDecisionCount: number;
  latestDocs: VersionDecisionFactDocPointer[];
  pinnedDocs?: VersionDecisionFactDocPointer[];
  newerThanPinned: ProjectStateDocKind[];
}

/** decision 卡选项（恰两个固定 id；恰一个 recommended，由应用/编排校验）。 */
export interface VersionDecisionCardOption {
  id: VersionDecisionAction;
  label: string;
  description?: string;
  recommended?: boolean;
}

/**
 * 版本决策卡（application-owned decision 卡；`cardKind:"decision"`、`application:true`、
 * `sourceRoleId:"application"` 由应用在构造 `CustomerInputRequest` 时附加）。标签经 i18n 注入。
 */
export interface VersionDecisionCard {
  schema: typeof VERSION_DECISION_SCHEMA;
  requestId: string;
  flowId: string;
  runId?: string;
  /** 幕僚提议的路线（卡内 recommended 标记即此动作）。 */
  action: VersionDecisionAction;
  reason: string;
  facts: VersionDecisionFacts;
  title: string;
  question: string;
  options: VersionDecisionCardOption[];
  preview?: string;
}

/** `request_version_decision` 回执（工具层原样转达 `ok/code/message`）。 */
export interface VersionDecisionResult {
  ok: boolean;
  code?: VersionDecisionErrorCode;
  message: string;
  decisionId?: string;
  action?: VersionDecisionAction;
  flowId?: string;
  runId?: string;
  targetVersions?: Record<string, number>;
  newFlowId?: string;
  newRunId?: string;
  closedRunIds?: string[];
  orphanedRequestIds?: string[];
  /** legacy/无 run 时的 draft 锚点结果（`created`/`existing`）或 `unavailable`。 */
  runAnchor?: "created" | "existing" | "unavailable";
}
