/**
 * 桌面桥（window.desktop）的安全访问层。
 *
 * 渲染进程只通过 preload 白名单方法访问窗口能力；窗口按钮在桥或方法缺席时
 * 必须禁用并如实标注，绝不假装可用、绝不抛错。
 *
 * 本阶段只消费自绘标题栏的窗口控制方法（通道名与语义见 app/preload.cjs，
 * 属「桌面窗口」角色的 api-spec）。其余通道按 Phase 3/4 逐步接入。
 */

import { PROJECT_STATE_SCHEMA } from "../../../../src/model/project-state.ts";
import type {
  ProjectStateBlockerKind,
  ProjectStateBlockerSource,
  ProjectStateDocKind,
  ProjectStateEvidenceKind,
  ProjectStateEvidenceStatus,
  ProjectStateFocusSelectedBy,
  ProjectStateNextStepSource,
  ProjectStateRunState,
  ProjectStateTaskRunState,
  ProjectStateView,
} from "../../../../src/model/project-state.ts";
import type { MessageKey, Translator } from "../i18n/index.ts";

export type { ProjectStateView } from "../../../../src/model/project-state.ts";

export interface DesktopWindowControls {
  minimizeWindow: () => Promise<unknown>;
  toggleMaximize: () => Promise<unknown>;
  closeWindow: () => Promise<unknown>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

/** 「替我审批」shell 开关状态载荷（`shell:judge-get` / `shell:judge-state`；2026-10-31 加法 `paused`）。 */
export interface ShellJudgeState {
  version: 1;
  ok?: boolean;
  enabled?: boolean;
  available?: boolean;
  /**
   * 「本次运行暂停自动审批」（2026-10-31 判拒升级方案 §4.6/§7.2）：shell-only、应用运行期、
   * 不写偏好、不影响治理 approval 组。旧主进程缺省该字段 ⇒ 渲染侧视为能力/状态未报告，不假造。
   */
  paused?: boolean;
  error?: string;
}

/** 暂停/恢复回执（`shell:judge-pause`）；`ok:false` 时 `paused` 仍为当前真实状态。 */
export interface ShellJudgePauseReply {
  version: 1;
  ok: boolean;
  paused: boolean;
  error?: string;
}

/** 升级卡三选一动作（C1 冻结；渲染侧不能增删或伪造）。 */
export type ShellEscalationAction = "allow-once" | "allow-session" | "deny";

/** preload 暴露面的本阶段子集；方法逐个探测，不假定整体存在。 */
export interface DesktopBridge {
  minimizeWindow?: DesktopWindowControls["minimizeWindow"];
  toggleMaximize?: DesktopWindowControls["toggleMaximize"];
  closeWindow?: DesktopWindowControls["closeWindow"];
  isMaximized?: DesktopWindowControls["isMaximized"];
  onMaximizedChanged?: DesktopWindowControls["onMaximizedChanged"];

  // —— Phase 3A 聊天流消费的受限通道（定义/实现属桌面窗口；这里只按名消费）——
  pickProject?: () => Promise<string | null>;
  listProject?: (projectRoot: string) => Promise<unknown>;
  /**
   * 2026-10-31（run-change 触发）：显式 run-change 入口——主进程呈现三模式卡并回
   * `{ok, status, runId, flowId, mode?}` 或 `{ok:false,error}`；旧主进程缺省 ⇒ 按钮禁用并给原因。
   */
  requestRunChange?: (input: { projectRoot: string; flowId?: string; reason?: string }) => Promise<unknown>;
  openSession?: (input: unknown) => Promise<unknown>;
  sendSession?: (...args: unknown[]) => Promise<unknown>;
  stopSession?: (...args: unknown[]) => Promise<unknown>;
  abortSession?: (...args: unknown[]) => Promise<unknown>;
  getSessionHistory?: (input: unknown) => Promise<unknown>;
  listLiveSessionViews?: () => Promise<unknown>;
  // —— 会话级后台任务（2026-10-25；定义/实现属桌面窗口，此处只按名消费）——
  listBackgroundTasks?: (
    projectRoot: string,
    runtime: string,
  ) => Promise<unknown>;
  readBackgroundTask?: (input: unknown) => Promise<unknown>;
  stopBackgroundTask?: (input: unknown) => Promise<unknown>;
  // —— E 批：任务/运行日志/收口/终止重派（定义/实现属桌面窗口；此处只按名消费）——
  listTasks?: (input: { projectRoot: string }) => Promise<unknown>;
  restoreTasks?: (input: { projectRoot: string }) => Promise<unknown>;
  readRoleActivityLog?: (input: { projectRoot: string; roleId: string; since?: string; limit?: number }) => Promise<unknown>;
  terminateRoleRun?: (input: unknown) => Promise<unknown>;
  redispatchTask?: (input: unknown) => Promise<unknown>;
  closeTask?: (input: unknown) => Promise<unknown>;

  // —— 流程状态只读（2026-10-25；定义/实现属桌面窗口，此处只按名消费）——
  getFlowStatus?: (projectRoot: string) => Promise<unknown>;
  /**
   * 全局任务状态只读（2026-11-02，project-state/v1）：preload `getProjectState({projectRoot})`
   * → IPC `project-state:get` → 始终返回 `ProjectStateView`（非法/空 root 返回空视图 + errors，不抛）。
   * 面板只消费此入口；不在渲染层扫描文件或重新派生。
   */
  getProjectState?: (input: { projectRoot: string }) => Promise<unknown>;
  onSessionEvent?: (callback: (payload: unknown) => void) => () => void;
  onRoleState?: (callback: (payload: unknown) => void) => () => void;
  requestRoleStates?: () => Promise<{ ok: boolean }>;
  // —— P2（2026-10-30）：网络状态（定义/实现属桌面窗口；这里只按名消费）——
  getNetworkState?: () => Promise<unknown>;
  reportNetworkHint?: (online: boolean) => Promise<unknown>;
  onNetworkState?: (callback: (payload: unknown) => void) => () => void;
  onSessionHistory?: (callback: (payload: unknown) => void) => () => void;
  onProjectChanged?: (callback: () => void) => () => void;
  onOperatorRequest?: (callback: (payload: unknown) => void) => () => void;
  onOperatorExpired?: (callback: (payload: unknown) => void) => () => void;
  onOperatorQueued?: (callback: (payload: unknown) => void) => () => void;
  operatorRespond?: (input: unknown) => Promise<unknown>;
  pickImage?: () => Promise<unknown>;
  attachImage?: (input: unknown) => Promise<unknown>;
  withdrawQueued?: (target: unknown, id: string) => Promise<unknown>;
  getRecoveryState?: () => Promise<unknown>;
  recoveryReady?: () => Promise<unknown>;

  // —— Phase 4A 引擎设置 / 文档只读（定义/实现属桌面窗口；这里只按名消费）——
  getRuntimeConfig?: (runtime: string) => Promise<unknown>;
  saveRuntimeConfig?: (input: unknown) => Promise<unknown>;
  /** 旧 Pi 面板兼容桥（只在 getRuntimeConfig 缺席时回退）。 */
  getPiConfig?: () => Promise<unknown>;
  savePiConfig?: (updates: unknown) => Promise<unknown>;
  readProjectDocument?: (input: unknown) => Promise<unknown>;
  openExternal?: (url: string) => Promise<unknown>;
  /** 渲染侧诊断事件（白名单 event/fields 由桌面窗口 diagnostics 校验；只读消费）。 */
  reportDiagnostic?: (input: unknown) => Promise<unknown>;

  // —— Phase 3B 确认卡与双开关（定义/实现属桌面窗口；这里只按名消费）——
  onShellConfirm?: (callback: (payload: unknown) => void) => () => void;
  shellConfirmRespond?: (input: unknown) => Promise<unknown>;
  /**
   * 升级卡回包（`{kind:"escalation", id, action}`；2026-10-31 判拒升级方案 §7.2）。
   * 旧主进程/preload 缺省该方法 ⇒ 升级能力禁用并给出说明，绝不假造回执。
   */
  shellEscalationRespond?: (input: {
    kind?: "escalation";
    id: string;
    action: ShellEscalationAction | string;
  }) => Promise<unknown>;
  onRecoveryConfirm?: (callback: (payload: unknown) => void) => () => void;
  recoveryConfirmRespond?: (input: unknown) => Promise<unknown>;
  getShellJudgeState?: () => Promise<ShellJudgeState>;
  setShellJudgeEnabled?: (enabled: boolean) => Promise<unknown>;
  /**
   * 「本次运行暂停自动审批」（`{paused:boolean}` → `{version:1, ok, paused, error?}`）。
   * 旧主进程/preload 缺省该方法 ⇒ 能力禁用并给出说明（不显示假暂停态）。
   */
  setShellJudgePaused?: (paused: boolean) => Promise<unknown>;
  onShellJudgeState?: (callback: (payload: ShellJudgeState) => void) => () => void;
  onShellJudgeResult?: (callback: (payload: unknown) => void) => () => void;
  getDecisionJudgeState?: () => Promise<unknown>;
  setDecisionJudgeEnabled?: (enabled: boolean) => Promise<unknown>;
  onDecisionJudgeState?: (callback: (payload: unknown) => void) => () => void;
  onOperatorJudgeResult?: (callback: (payload: unknown) => void) => () => void;

  // —— Phase 4B 治理记录 / 报告持久化 / 交付回执（定义/实现属桌面窗口；只按名消费）——
  previewGovernanceRecord?: (projectRoot: string, options?: unknown) => Promise<unknown>;
  establishGovernanceRecord?: (projectRoot: string, options?: unknown) => Promise<unknown>;
  previewGovernanceReacceptance?: (projectRoot: string) => Promise<unknown>;
  reacceptGovernancePins?: (projectRoot: string, previewDigest: string) => Promise<unknown>;
  previewGovernanceMigration?: (projectRoot: string) => Promise<unknown>;
  migrateGovernanceModel?: (projectRoot: string, previewDigest: string) => Promise<unknown>;
  onGovernanceNextStep?: (callback: (payload: unknown) => void) => () => void;
  getSessionPersistence?: (input: unknown) => Promise<unknown>;
  getReportSaveState?: (input: unknown) => Promise<unknown>;
  retryReportSave?: (input: unknown) => Promise<unknown>;
  getDeliveryReceipt?: (input: unknown) => Promise<unknown>;
  retryDeliveryHistorySave?: (input: unknown) => Promise<unknown>;
  onReportPersistenceUpdated?: (callback: (payload: unknown) => void) => () => void;
  onDeliveryHistoryUpdated?: (callback: (payload: unknown) => void) => () => void;

  // —— i18n 应用级语言偏好（定义/实现属桌面窗口；这里只按名消费）——
  // 权威文件为 <userData>/ans/preferences.json；本地镜像仅用于首屏快速读取。
  getPreferences?: () => Promise<{
    version: 1;
    locale: "zh-CN" | "en-US";
    supported: string[];
  }>;
  setLocale?: (locale: string) => Promise<{
    ok: boolean;
    locale: "zh-CN" | "en-US";
    error?: string;
  }>;
  onLocaleChanged?: (
    callback: (payload: { locale: "zh-CN" | "en-US" }) => void,
  ) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export type WindowControlName = keyof DesktopWindowControls;

export interface WindowControlAvailability {
  bridge: boolean;
  minimize: boolean;
  maximize: boolean;
  close: boolean;
  isMaximized: boolean;
}

/** 读取桥对象；不存在或形状不对都返回 null（不抛错）。 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.desktop;
  if (!bridge || typeof bridge !== "object") return null;
  return bridge;
}

function hasMethod<K extends WindowControlName>(
  bridge: DesktopBridge | null,
  name: K,
): bridge is DesktopBridge & Required<Pick<DesktopBridge, K>> {
  return !!bridge && typeof bridge[name] === "function";
}

/** 逐个方法的可用性（标题栏按钮据此禁用/标注）。 */
export function getWindowControlAvailability(): WindowControlAvailability {
  const bridge = getDesktopBridge();
  return {
    bridge: bridge !== null,
    minimize: hasMethod(bridge, "minimizeWindow"),
    maximize: hasMethod(bridge, "toggleMaximize"),
    close: hasMethod(bridge, "closeWindow"),
    isMaximized: hasMethod(bridge, "isMaximized"),
  };
}

/** 安全调用窗口方法：失败静默（按钮状态由可用性决定，不制造假成功）。 */
export function callWindowControl(
  name: "minimizeWindow" | "toggleMaximize" | "closeWindow",
): void {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, name)) return;
  try {
    const result = bridge[name]();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    /* 桥异常不影响渲染；窗口状态以主进程为准。 */
  }
}

/** 读取最大化状态；不可用时返回 false（不猜测）。 */
export async function queryMaximized(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, "isMaximized")) return false;
  try {
    return (await bridge.isMaximized()) === true;
  } catch {
    return false;
  }
}

/** 订阅最大化状态；不可用时返回空退订函数。 */
export function subscribeMaximized(
  callback: (maximized: boolean) => void,
): () => void {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, "onMaximizedChanged")) return () => undefined;
  try {
    const off = bridge.onMaximizedChanged(callback);
    return typeof off === "function" ? off : () => undefined;
  } catch {
    return () => undefined;
  }
}

// —————————————— 全局任务状态：纯解析/视图（project-state/v1，A4） ——————————————
// 这些函数只读入参，不访问 window/document/fs，不聚合、不重算、不排序；渲染层不实现
// 第二套 `taskStatusOf`。桥访问只发生在 getDesktopBridge()/panel 的调用点（函数内）。

export interface ProjectStateBadgeView {
  key: "unclosed" | "blocked" | "failed" | "pendingRequests";
  text: string;
}

export interface ProjectStateSummaryView {
  focusLine: string;
  selectedBy: ProjectStateFocusSelectedBy;
  stale: boolean;
  pinned: boolean;
  readOnlyLabel: string;
  badges: ProjectStateBadgeView[];
}

export interface ProjectStateRunRow {
  runId: string;
  label: string;
  active: boolean;
}

export interface ProjectStateFlowRow {
  flowId: string;
  runsText: string;
  superseded: boolean;
  runs: ProjectStateRunRow[];
}

export interface ProjectStateRow {
  id: string;
  primary: string;
  secondary?: string;
}

export interface ProjectStateDetailsView {
  flows: ProjectStateFlowRow[];
  tasks: ProjectStateRow[];
  blockers: ProjectStateRow[];
  versions: ProjectStateRow[];
  evidence: ProjectStateRow[];
  nextStep: { text: string; source: string } | null;
  errors: string[];
  truncated: boolean;
}

const RUN_STATE_KEYS: Record<ProjectStateRunState, MessageKey> = {
  draft: "ui.run.state.draft",
  pinned: "ui.run.state.pinned",
  closed: "ui.run.state.closed",
  cancelled: "ui.run.state.cancelled",
};

const FOCUS_RUN_STATE_KEYS: Record<ProjectStateTaskRunState, MessageKey> = {
  draft: "ui.run.state.draft",
  pinned: "ui.run.state.pinned",
  legacy: "ui.run.state.legacy",
};

const BLOCKER_KIND_KEYS: Record<ProjectStateBlockerKind, MessageKey> = {
  "task-blocked": "ui.projectState.blocker.kind.taskBlocked",
  "task-failed": "ui.projectState.blocker.kind.taskFailed",
  "request-pending": "ui.projectState.blocker.kind.requestPending",
  "rework-pending": "ui.projectState.blocker.kind.acceptanceRework",
  "redispatch-exhausted": "ui.projectState.blocker.kind.redispatchExhausted",
  "version-drift": "ui.projectState.blocker.kind.versionDrift",
  "reference-invalid": "ui.projectState.blocker.kind.referenceInvalid",
  "run-ambiguous": "ui.projectState.blocker.kind.runAmbiguous",
  "focus-stale": "ui.projectState.blocker.kind.focusStale",
  "chief-note": "ui.projectState.blocker.kind.chiefNote",
};

const BLOCKER_SOURCE_KEYS: Record<ProjectStateBlockerSource, MessageKey> = {
  app: "ui.projectState.blocker.source.app",
  chief: "ui.projectState.blocker.source.chief",
};

const DOC_KIND_KEYS: Record<ProjectStateDocKind, MessageKey> = {
  intent: "ui.projectState.version.docKind.intent",
  proposal: "ui.projectState.version.docKind.proposal",
  modules: "ui.projectState.version.docKind.modules",
  roster: "ui.projectState.version.docKind.roster",
  topology: "ui.projectState.version.docKind.topology",
  architecture: "ui.projectState.version.docKind.architecture",
  assets: "ui.projectState.version.docKind.assets",
};

const EVIDENCE_KIND_KEYS: Record<ProjectStateEvidenceKind, MessageKey> = {
  "acceptance-card": "ui.projectState.evidence.kind.acceptanceCard",
  "verifier-report": "ui.projectState.evidence.kind.verifierReport",
  "task-evidence": "ui.projectState.evidence.kind.taskEvidence",
};

const EVIDENCE_STATUS_KEYS: Record<ProjectStateEvidenceStatus, MessageKey> = {
  present: "ui.projectState.evidence.status.present",
  missing: "ui.projectState.evidence.status.missing",
};

const NEXT_STEP_SOURCE_KEYS: Record<ProjectStateNextStepSource, MessageKey> = {
  chief: "ui.projectState.nextStep.source.chief",
  derived: "ui.projectState.nextStep.source.derived",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function labelOf<K extends string>(
  map: Record<K, MessageKey>,
  value: K,
  t: Translator,
): string {
  const key: MessageKey | undefined = map[value];
  return t(key ?? "shared.common.unknown");
}

/**
 * 仅校验 `project-state/v1` 的 schema 与顶层形状；非法返回 null（不补默认值、不算计数）。
 * 元素内部字段由 A1/A2 的 builder 保证；渲染层不做二次派生。
 */
export function asProjectStateView(value: unknown): ProjectStateView | null {
  if (!isRecord(value)) return null;
  if (value.schema !== PROJECT_STATE_SCHEMA) return null;
  if (typeof value.generatedAt !== "string" || typeof value.projectRoot !== "string") return null;
  if (typeof value.truncated !== "boolean") return null;
  const focus = value.focus;
  if (!isRecord(focus)) return null;
  const selectedBy = focus.selectedBy;
  if (
    selectedBy !== "chief" &&
    selectedBy !== "application" &&
    selectedBy !== "derived" &&
    selectedBy !== "none"
  ) {
    return null;
  }
  const counts = value.counts;
  if (!isRecord(counts)) return null;
  for (const key of [
    "unclosed",
    "supersededUnclosed",
    "activeUnclosed",
    "blocked",
    "failed",
    "pendingRequests",
    "flows",
    "tasks",
  ] as const) {
    if (!isFiniteNumber(counts[key])) return null;
  }
  for (const key of ["flows", "tasks", "blockers", "versions", "evidence", "notes", "errors"] as const) {
    if (!Array.isArray(value[key])) return null;
  }
  return value as unknown as ProjectStateView;
}

function focusLineOf(focus: ProjectStateView["focus"], t: Translator): string {
  if (focus.selectedBy === "none" || !focus.flowId) {
    return t("ui.projectState.focus.none");
  }
  const runStateKey: MessageKey | undefined = focus.runState
    ? FOCUS_RUN_STATE_KEYS[focus.runState]
    : undefined;
  const parts: string[] = [
    t("ui.projectState.focus.label"),
    `${focus.flowId} / ${focus.runId ?? t("shared.common.none")} / ${t(runStateKey ?? "shared.common.unknown")}`,
    focus.stage ?? t("ui.projectState.focus.stageUndefined"),
    t("ui.projectState.focus.updatedAt", {
      time: focus.updatedAt ?? t("shared.common.unknown"),
    }),
  ];
  if (focus.selectedBy === "derived") parts.push(t("ui.projectState.focus.derived"));
  if (focus.selectedBy === "application") parts.push(t("ui.projectState.focus.application"));
  if (focus.stale === true) parts.push(t("ui.projectState.focus.stale"));
  return parts.join(" · ");
}

/** 顶部常显区：focus 一行 + 徽标。计数只读 `state.counts.*`，不本地派生。 */
export function projectStateSummaryView(
  state: ProjectStateView,
  t: Translator,
): ProjectStateSummaryView {
  return {
    focusLine: focusLineOf(state.focus, t),
    selectedBy: state.focus.selectedBy,
    stale: state.focus.stale === true,
    pinned: state.focus.runState === "pinned",
    readOnlyLabel: t("ui.projectState.readOnly"),
    badges: [
      {
        key: "unclosed",
        text: t("ui.taskCenter.unclosed", { count: state.counts.unclosed }),
      },
      {
        key: "blocked",
        text: t("ui.projectState.badge.blocked", { count: state.counts.blocked }),
      },
      {
        key: "failed",
        text: t("ui.projectState.badge.failed", { count: state.counts.failed }),
      },
      {
        key: "pendingRequests",
        text: t("ui.projectState.badge.pendingRequests", {
          count: state.counts.pendingRequests,
        }),
      },
    ],
  };
}

/** 展开区：按 payload 顺序映射为已翻译行；只做格式化，不做过滤/聚合/排序。 */
export function projectStateDetailsView(
  state: ProjectStateView,
  t: Translator,
): ProjectStateDetailsView {
  const flows: ProjectStateFlowRow[] = state.flows.map((flow) => {
    const runs: ProjectStateRunRow[] = flow.runs.map((run) => ({
      runId: run.runId,
      label: labelOf(RUN_STATE_KEYS, run.state, t),
      active: run.active === true,
    }));
    const parts = [t("ui.projectState.flow.runs", { count: runs.length })];
    if (flow.supersededBy) {
      parts.push(`${t("ui.projectState.flow.superseded")} ${flow.supersededBy}`);
    }
    return {
      flowId: flow.flowId,
      runsText: parts.join(" · "),
      superseded: Boolean(flow.supersededBy),
      runs,
    };
  });

  const tasks: ProjectStateRow[] = state.flows.map((flow) => ({
    id: flow.flowId,
    primary: flow.flowId,
    secondary: t("ui.projectState.flow.taskCounts", {
      unclosed: flow.taskCounts.unclosed,
      blocked: flow.taskCounts.blocked,
      failed: flow.taskCounts.failed,
    }),
  }));

  const blockers: ProjectStateRow[] = state.blockers.map((blocker) => ({
    id: blocker.id,
    primary: labelOf(BLOCKER_KIND_KEYS, blocker.kind, t),
    secondary: [blocker.summary, labelOf(BLOCKER_SOURCE_KEYS, blocker.source, t)]
      .filter((part) => part.length > 0)
      .join(" · "),
  }));

  const versions: ProjectStateRow[] = state.versions.map((version) => {
    const latest = version.latest
      ? t("ui.projectState.version.latest", { version: version.latest.version })
      : t("ui.projectState.version.missing");
    const pinned = version.pinned
      ? t("ui.projectState.version.pinned", {
          version: version.pinned.version ?? t("shared.common.unknown"),
        })
      : t("shared.common.none");
    const parts = [latest, pinned];
    if (version.newerThanPinned) parts.push(t("ui.projectState.version.newerThanPinned"));
    if (version.referenceIssue) parts.push(version.referenceIssue);
    return {
      id: `${version.flowId}:${version.docKind}`,
      primary: `${version.flowId} · ${labelOf(DOC_KIND_KEYS, version.docKind, t)}`,
      secondary: parts.join(" · "),
    };
  });

  const evidence: ProjectStateRow[] = state.evidence.map((item) => ({
    id: `${item.flowId}:${item.kind}:${item.ref}`,
    primary: `${labelOf(EVIDENCE_KIND_KEYS, item.kind, t)} · ${item.ref}`,
    secondary: [labelOf(EVIDENCE_STATUS_KEYS, item.status, t), item.summary ?? ""]
      .filter((part) => part.length > 0)
      .join(" · "),
  }));

  const nextStep = state.nextStep
    ? {
        text: state.nextStep.text,
        source: labelOf(NEXT_STEP_SOURCE_KEYS, state.nextStep.source, t),
      }
    : null;

  const errors = state.errors.map((error) => {
    const location = error.file
      ? ` (${error.file}${typeof error.line === "number" ? `:${error.line}` : ""})`
      : "";
    return `${error.source}: ${error.message}${location}`;
  });

  return {
    flows,
    tasks,
    blockers,
    versions,
    evidence,
    nextStep,
    errors,
    truncated: state.truncated === true,
  };
}
