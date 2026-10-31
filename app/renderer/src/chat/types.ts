/**
 * 聊天流核心迁移（Phase 3A）的纯数据类型。
 *
 * 这些类型只描述主进程/编排已经给出的事实与界面行；渲染层不做任何边界判定、
 * 不推导治理结论。纯逻辑模块（model/replay/status/events）不依赖 DOM，供
 * `test/桌面UI/` 的 node 单测直接 import。
 */

export type RuntimeKind = "pi" | "codex" | "claude";

/**
 * 角色根文档元数据（与主进程 `RoleRootDocEntry` 同形，additive）。
 *
 * `path` 是**项目相对**路径（如 `角色卡/A/feature-map.md`），只用于与 opaque
 * `documents[].relativePath` 精确匹配；渲染层不按它拼文件系统路径。白名单/
 * 顺序由后端索引给出，渲染层不复制。
 */
export interface RoleRootDocEntry {
  name: string;
  path: string;
  kind: "file";
}

export interface RoleView {
  roleId: string;
  cardText?: string;
  cardPath?: string;
  boundaryPath?: string;
  boundary?: { entries?: unknown[] };
  builtIn?: boolean;
  governanceFunction?: string;
  group?: string;
  groupDuty?: string;
  changelog?: unknown;
  docs?: unknown[];
  /** 角色根文档（可选；旧 main 缺省时按 `[]` 消费，不显示根文档组）。 */
  rootDocs?: RoleRootDocEntry[];
}

/** 2026-10-31（run-change 触发）：active run 只读摘要（主进程 listProject 附带；旧 main 缺省时按 [] 消费）。 */
export interface ActiveRunSummary {
  runId: string;
  flowId: string;
  state: "draft" | "pinned";
  pinnedAt?: string;
  rosterVersion?: number;
  roles?: string[];
}

export interface Listing {
  projectRoot: string;
  primaryRoleId: string | null;
  hasRoles: boolean;
  roles: RoleView[];
  warnings?: string[];
  governanceModel?: "single" | "trio";
  governanceRecord?: {
    state?: string;
    reason?: string;
    pinFiles?: unknown[];
    pinCount?: number;
  };
  activeRuns?: ActiveRunSummary[];
  activeRunsError?: string;
}

export interface SessionEvent {
  kind?: string;
  runtime?: string;
  roleId?: string;
  turnId?: string;
  at?: string;
  summary?: string;
  detail?: Record<string, unknown>;
  report?: unknown;
  liveReport?: unknown;
  reportPersistence?: unknown;
}

export interface SessionEnvelope {
  projectRoot?: string;
  roleId: string;
  runtime?: string;
  clientMessageId?: string;
  event: SessionEvent;
}

export type RowKind =
  | "user"
  | "assistant"
  | "activities"
  | "injected"
  | "delivery"
  | "replay"
  | "handback"
  | "operator"
  | "queue-aggregate"
  | "tool-lifecycle"
  | "denied"
  | "system"
  | "turn-terminal"
  | "reasoning"
  | "judge-result"
  | "governance-judge-result";

export interface ActivityItem {
  toolName: string;
  target: string;
  status: string;
  statusText: string;
  summary: string;
  /** 首行可见摘要（失败/未放行直显行的来源；不含正文换行）。 */
  visibleSummary?: string;
  /** 未放行事件的完整摘要（门禁原因原样显示；仅 denied 事件非空）。 */
  deniedSummary?: string;
  callId?: string;
  turnId?: string;
  phase?: string;
  /** 事件身份相位：start / result / blocked（用于同一次调用的相位合并）。 */
  identityPhase?: string;
  denied?: boolean;
  failed?: boolean;
  /** 未放行/失败/超时：必须直显为 .sys-denied，不能只藏在工具组里。 */
  exceptional?: boolean;
  /** 展示型工具事件（display v1）：独立生命周期行，不进入工具组。 */
  barrier?: boolean;
  /** live = 实时事件；history = 历史回放。默认开合只作用于 live。 */
  origin?: "live" | "history";
  /** 事件时间（原始 ISO 字符串；渲染只格式化，不猜）。 */
  at?: string;
  completed?: boolean;
  returned?: boolean;
  exitCode?: number;
  timedOut?: boolean;
  detailText?: string;
  hasDisplay?: boolean;
  /** display v1 原始安全详情（工具生命周期行按相位展开；不解析正文）。 */
  display?: unknown;
  /** 有 display 但不是受支持版本（只显示「不支持此详情版本」，不回退原始参数）。 */
  displayUnsupported?: boolean;
  /** 未截断目标（display.target.value.text 原样；摘要行优先）。 */
  fullTarget?: string;
  /** 相位标签（旧 tool-rows label 同口径：调用发起/执行完成/执行失败/已拒绝/…）。 */
  label?: string;
  /** 历史文本投影（安全显示副本 flags 来源）。 */
  legacyTextProjection?: unknown;
  metadataOmissions?: unknown[];
  legacyStatusSource?: string;
}

export interface ChatRow {
  id: string;
  kind: RowKind;
  /** 行内容（按 kind 的联合；为减少跨模块类型噪声，这里用 unknown + 访问器）。 */
  data: unknown;
  /** 行占位（px，已含行距；组件测量后修正）。 */
  height: number;
  measured?: boolean;
  turnId?: string;
  requestId?: string;
  callId?: string;
  replay?: boolean;
  /** 回放锚点键（历史行来自主进程单一算法；交互卡据此落回发生位置）。 */
  anchorKey?: string;
  /** 回放锚点位置：request | conclusion（仅历史行）。 */
  anchor?: string;
  /** 行内 `<details>` 的手动开合状态（按 key 保存；虚拟卸载/重挂后保持）。 */
  detailsOpen?: Record<string, boolean>;
}

/**
 * 事件层可选客户投影（桌面窗口 `GovernanceClientProjectionV1`，消费副本）。
 *
 * 来源：`prompt-input` 事件 `detail.clientProjection`；仅当桌面窗口实现后附带。
 * 渲染层只读、不持久化；字段缺失/形状不符 ⇒ 完全回退旧文本归类。
 */
export interface ClientProjectionV1 {
  version: 1;
  kind: "governance-feedback";
  fingerprint: string;
  sourceRole: { roleId: string; displayName: string };
  statusCode:
    | "completed"
    | "failed"
    | "aborted"
    | "timed_out"
    | "unknown"
    | "internal-feedback";
  statusText: string;
  flowIds?: string[];
  reportPath?: string;
  governancePath?: string;
  action: "report-ready" | "await-lead-summary";
}

export interface PaneMeta {
  loading: boolean;
  emptyNote: boolean;
  contextText: string;
  /** 历史投影诊断（报告不可读/省略/无效/跳过）；与 contextText 分开，避免重复。 */
  projectionText?: string;
  error?: string;
  historyLoaded?: boolean;
}

export interface RoleMeta {
  error: boolean;
  hadSession: boolean;
  restored: boolean;
  live?: boolean;
  contextText: string;
  /** 主进程给的恢复失败原因（title/追溯；缺省不猜）。 */
  contextWarning?: string;
  /** 会话 record 已恢复但模型未恢复（结构化标记；用于追加历史保留说明，不解析文案）。 */
  readableHistoryRetained?: boolean;
  lastEvent?: string;
}

/**
 * **P0 队列可见性（2026-10-30）**：主进程 `session:role-state` 快照里的「为什么没动」事实——
 * 队首类别 / 阻塞原因 / 当前回合 id。界面只读它，不自行推测（单一来源＝主进程会话内存态）。
 */
export interface RoleQueueMeta {
  headKind: string | null;
  blockedReason: "target-busy" | "origin-missing" | "session-closed" | "network" | null;
  activeTurnId: string | null;
}
