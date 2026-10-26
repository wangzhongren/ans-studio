/**
 * 后台任务面板纯逻辑（2026-10-25）：bridge 回执归一化、状态/日志/停止语义与轮询。
 *
 * 数据只来自 preload 白名单方法；本模块不缓存、不持久化、不伪造任务状态。
 * `unavailable` 与「没有任务」严格区分；`kill-timeout` 不得显示成「已停止」。
 */

import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";
import { shortTime } from "./tool-summary.ts";

export type BackgroundTaskState =
  | "running"
  | "exited"
  | "stopped"
  | "failed"
  | "kill-timeout";
export type BackgroundTaskDisplayState = BackgroundTaskState | "unknown";

export interface BackgroundTaskSnapshot {
  taskId: string;
  state: BackgroundTaskState;
  pid?: number;
  command: string;
  startedAt: string;
  exitCode?: number;
  signal?: string;
  error?: string;
  durationMs: number;
}

export interface BackgroundTaskView extends BackgroundTaskSnapshot {
  roleId: string;
  runtime: string;
}

export interface BackgroundTaskReadInput {
  projectRoot: string;
  runtime: string;
  roleId: string;
  taskId: string;
  stream?: "stdout" | "stderr" | "both";
  tailLines?: number;
}

export interface BackgroundTaskStopInput {
  projectRoot: string;
  runtime: string;
  roleId: string;
  taskId: string;
  force?: boolean;
}

export interface BackgroundTasksBridge {
  listBackgroundTasks?: (
    projectRoot: string,
    runtime: string,
  ) => Promise<unknown>;
  readBackgroundTask?: (input: unknown) => Promise<unknown>;
  stopBackgroundTask?: (input: unknown) => Promise<unknown>;
}

export interface BackgroundTaskStateView {
  state: BackgroundTaskDisplayState;
  label: string;
  className: string;
  running: boolean;
  canStop: boolean;
}

export interface BackgroundTaskRowView {
  taskId: string;
  roleId: string;
  runtime: string;
  roleName: string;
  command: string;
  commandShort: string;
  state: BackgroundTaskDisplayState;
  stateLabel: string;
  stateClass: string;
  running: boolean;
  canStop: boolean;
  pid: number | null;
  startedAt: string;
  startedAtText: string;
  durationMs: number;
  durationText: string;
  exitCode: number | null;
  error: string;
}

export interface BackgroundTaskStreamView {
  stream: "stdout" | "stderr";
  label: string;
  text: string;
  truncated: boolean;
}

export type BackgroundLogModel =
  | { kind: "error"; detail: string }
  | {
      kind: "ready";
      streams: BackgroundTaskStreamView[];
      empty: boolean;
      truncated: boolean;
      tailLines: number;
      tailClamped: boolean;
    };

export type BackgroundTaskListModel =
  | { kind: "loading" }
  | { kind: "ready"; tasks: BackgroundTaskRowView[]; runningCount: number }
  | { kind: "unavailable" }
  | { kind: "error"; detail: string };

export type BackgroundStopReason =
  | "unknown-task"
  | "closed"
  | "timeout"
  | "unavailable";

export type BackgroundStopOutcome =
  | {
      ok: true;
      task: BackgroundTaskSnapshot | null;
      alreadyEnded: boolean;
    }
  | { ok: false; reason: BackgroundStopReason; message: string; detail: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeBackgroundTaskState(
  value: unknown,
): BackgroundTaskDisplayState {
  if (
    value === "running" ||
    value === "exited" ||
    value === "stopped" ||
    value === "failed" ||
    value === "kill-timeout"
  ) {
    return value;
  }
  return "unknown";
}

export function backgroundStateView(
  state: BackgroundTaskDisplayState,
  locale: Locale = DEFAULT_LOCALE,
): BackgroundTaskStateView {
  switch (state) {
    case "running":
      return {
        state,
        label: translate(locale, "ui.background.state.running"),
        className: "is-running",
        running: true,
        canStop: true,
      };
    case "exited":
      return {
        state,
        label: translate(locale, "ui.background.state.exited"),
        className: "is-exited",
        running: false,
        canStop: false,
      };
    case "stopped":
      return {
        state,
        label: translate(locale, "ui.background.state.stopped"),
        className: "is-stopped",
        running: false,
        canStop: false,
      };
    case "failed":
      return {
        state,
        label: translate(locale, "ui.background.state.failed"),
        className: "is-failed",
        running: false,
        canStop: false,
      };
    case "kill-timeout":
      return {
        state,
        label: translate(locale, "ui.background.state.killTimeout"),
        className: "is-kill-timeout",
        running: false,
        canStop: true,
      };
    default:
      return {
        state: "unknown",
        label: translate(locale, "shared.common.unknownStatus"),
        className: "is-unknown",
        running: false,
        canStop: false,
      };
  }
}

/** 运行中按 startedAt 实时计算；已结束用快照 durationMs；坏时间回退快照值。 */
export function backgroundTaskDurationMs(
  task: Pick<BackgroundTaskSnapshot, "state" | "startedAt" | "durationMs">,
  now: number,
): number {
  const snapshot = Math.max(0, Math.floor(asFiniteNumber(task.durationMs) ?? 0));
  if (task.state !== "running") return snapshot;
  const started = new Date(task.startedAt).getTime();
  if (Number.isNaN(started)) return snapshot;
  return Math.max(0, Math.floor(now - started));
}

export function formatBackgroundDuration(ms: number): string {
  const total = Math.max(0, Math.floor(asFiniteNumber(ms) ?? 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? hours + ":" + pad(minutes) + ":" + pad(seconds)
    : minutes + ":" + pad(seconds);
}

/** 已归一化行在 1 秒 ticker 下的实时时长；非 running 用快照 durationMs。 */
export function backgroundTaskRowDurationMs(
  row: Pick<BackgroundTaskRowView, "running" | "startedAt" | "durationMs">,
  now: number,
): number {
  if (!row.running) return Math.max(0, Math.floor(row.durationMs));
  const started = new Date(row.startedAt).getTime();
  if (Number.isNaN(started)) return Math.max(0, Math.floor(row.durationMs));
  return Math.max(0, Math.floor(now - started));
}

export function truncateBackgroundCommand(
  command: string,
  maxLength = 80,
): string {
  const text = String(command ?? "");
  const characters = Array.from(text);
  if (characters.length <= maxLength) return text;
  return characters.slice(0, Math.max(1, maxLength - 1)).join("") + "…";
}

export function normalizeBackgroundTaskSnapshot(
  value: unknown,
): BackgroundTaskSnapshot | null {
  const record = asRecord(value);
  const taskId = asString(record.taskId);
  if (taskId === "") return null;
  const pid = asFiniteNumber(record.pid);
  const exitCode = asFiniteNumber(record.exitCode);
  return {
    taskId,
    state: normalizeBackgroundTaskState(record.state) as BackgroundTaskState,
    ...(pid !== null ? { pid } : {}),
    command: asString(record.command),
    startedAt: asString(record.startedAt),
    ...(exitCode !== null ? { exitCode } : {}),
    ...(asString(record.signal) ? { signal: asString(record.signal) } : {}),
    ...(asString(record.error) ? { error: asString(record.error) } : {}),
    durationMs: Math.max(0, Math.floor(asFiniteNumber(record.durationMs) ?? 0)),
  };
}

export function backgroundTaskView(
  task: BackgroundTaskView,
  locale: Locale = DEFAULT_LOCALE,
  now: number = Date.now(),
  roleNameFor?: (roleId: string) => string,
): BackgroundTaskRowView {
  const state = backgroundStateView(normalizeBackgroundTaskState(task.state), locale);
  const roleName = roleNameFor ? roleNameFor(task.roleId) : task.roleId;
  const durationMs = backgroundTaskDurationMs(task, now);
  return {
    taskId: task.taskId,
    roleId: task.roleId,
    runtime: task.runtime,
    roleName: roleName || task.roleId,
    command: task.command,
    commandShort: truncateBackgroundCommand(task.command),
    state: state.state,
    stateLabel: state.label,
    stateClass: state.className,
    running: state.running,
    canStop: state.canStop,
    pid: typeof task.pid === "number" ? task.pid : null,
    startedAt: task.startedAt,
    startedAtText: shortTime(task.startedAt),
    durationMs,
    durationText: formatBackgroundDuration(durationMs),
    exitCode: typeof task.exitCode === "number" ? task.exitCode : null,
    error: task.error || "",
  };
}

/** preload 列表回执 → 视图模型；方法缺席/无项目即 unavailable，绝不显示成「没有任务」。 */
export async function loadBackgroundTasks(
  bridge: BackgroundTasksBridge | null | undefined,
  projectRoot: string,
  runtime: string,
  locale: Locale = DEFAULT_LOCALE,
  now: number = Date.now(),
  roleNameFor?: (roleId: string) => string,
): Promise<BackgroundTaskListModel> {
  if (!bridge || typeof bridge.listBackgroundTasks !== "function" || !projectRoot) {
    return { kind: "unavailable" };
  }
  try {
    const reply = asRecord(
      await bridge.listBackgroundTasks(projectRoot, runtime),
    );
    if (reply.ok !== true) {
      return {
        kind: "error",
        detail: asString(reply.error) || translate(locale, "shared.common.unknownReason"),
      };
    }
    if (reply.unavailable === true) return { kind: "unavailable" };
    const tasks: BackgroundTaskRowView[] = [];
    for (const raw of asArray(reply.tasks)) {
      const record = asRecord(raw);
      const snapshot = normalizeBackgroundTaskSnapshot(record);
      if (!snapshot) continue;
      tasks.push(
        backgroundTaskView(
          {
            ...snapshot,
            roleId: asString(record.roleId),
            runtime: asString(record.runtime) || runtime,
          },
          locale,
          now,
          roleNameFor,
        ),
      );
    }
    return {
      kind: "ready",
      tasks,
      runningCount: tasks.filter((task) => task.running).length,
    };
  } catch (error) {
    return {
      kind: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 读取日志（stream=both, 尾 40 行）；失败/方法缺席都如实返回 error 模型。 */
export async function loadBackgroundTaskLog(
  bridge: BackgroundTasksBridge | null | undefined,
  input: BackgroundTaskReadInput,
  locale: Locale = DEFAULT_LOCALE,
): Promise<BackgroundLogModel> {
  if (!bridge || typeof bridge.readBackgroundTask !== "function") {
    return {
      kind: "error",
      detail: translate(locale, "main.backgroundTasks.unavailable"),
    };
  }
  try {
    const reply = asRecord(await bridge.readBackgroundTask(input));
    const result = asRecord(reply.result);
    if (reply.ok !== true || Object.keys(result).length === 0) {
      return {
        kind: "error",
        detail: asString(reply.error) || translate(locale, "shared.common.unknownReason"),
      };
    }
    const streams: BackgroundTaskStreamView[] = [];
    for (const stream of ["stdout", "stderr"] as const) {
      const record = asRecord(result[stream]);
      const text = asString(record.text);
      if (text === "") continue;
      streams.push({
        stream,
        label: translate(
          locale,
          stream === "stdout" ? "ui.chatRow.stdout" : "ui.chatRow.stderr",
        ),
        text,
        truncated: record.truncated === true,
      });
    }
    const tailClamped = result.tailClamped === true;
    return {
      kind: "ready",
      streams,
      empty: streams.length === 0,
      truncated: tailClamped || streams.some((stream) => stream.truncated),
      tailLines: Math.max(0, Math.floor(asFiniteNumber(result.tailLines) ?? 0)),
      tailClamped,
    };
  } catch (error) {
    return {
      kind: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 停止失败 detail：timeout 明确「停止超时」，绝不出现「已停止」。 */
export function backgroundStopFailureDetail(
  reason: BackgroundStopReason,
  message: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  let base = translate(locale, "shared.common.unknownReason");
  if (reason === "timeout") {
    base = translate(locale, "ui.background.state.killTimeout");
  } else if (reason === "unavailable") {
    base = translate(locale, "main.backgroundTasks.unavailable");
  } else if (reason === "unknown-task") {
    base = translate(locale, "shared.common.unknown");
  } else if (reason === "closed") {
    base = translate(locale, "shared.common.close");
  }
  return message ? base + " · " + message : base;
}

/** stop 回执原样归一；失败 reason 不改写成成功。 */
export async function stopBackgroundTask(
  bridge: BackgroundTasksBridge | null | undefined,
  input: BackgroundTaskStopInput,
  locale: Locale = DEFAULT_LOCALE,
): Promise<BackgroundStopOutcome> {
  if (!bridge || typeof bridge.stopBackgroundTask !== "function") {
    const message = translate(locale, "main.backgroundTasks.unavailable");
    return {
      ok: false,
      reason: "unavailable",
      message,
      detail: backgroundStopFailureDetail("unavailable", message, locale),
    };
  }
  try {
    const reply = asRecord(await bridge.stopBackgroundTask(input));
    if (reply.ok === true) {
      return {
        ok: true,
        task: normalizeBackgroundTaskSnapshot(reply.task),
        alreadyEnded: reply.alreadyEnded === true,
      };
    }
    const rawReason = asString(reply.reason);
    const reason: BackgroundStopReason =
      rawReason === "unknown-task" ||
      rawReason === "closed" ||
      rawReason === "timeout" ||
      rawReason === "unavailable"
        ? rawReason
        : "unavailable";
    const message = asString(reply.message);
    return {
      ok: false,
      reason,
      message,
      detail: backgroundStopFailureDetail(reason, message, locale),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: "unavailable",
      message,
      detail: backgroundStopFailureDetail("unavailable", message, locale),
    };
  }
}

export function backgroundRunningCount(model: BackgroundTaskListModel): number {
  return model.kind === "ready" ? model.runningCount : 0;
}

/** 任务身份 = 角色 + 会话内 taskId（taskId 形如 bg-1，跨角色会重复）。 */
export function backgroundTaskKey(
  task: Pick<BackgroundTaskView, "roleId" | "taskId">,
): string {
  return task.roleId + "\u0000" + task.taskId;
}

export interface BackgroundStopUiState {
  confirmingTaskKey: string | null;
  stoppingTaskKey: string | null;
  errors: Record<string, string>;
}

export const initialBackgroundStopUiState: BackgroundStopUiState = {
  confirmingTaskKey: null,
  stoppingTaskKey: null,
  errors: {},
};

export type BackgroundStopAction =
  | { type: "ask"; taskKey: string }
  | { type: "cancel" }
  | { type: "start"; taskKey: string }
  | { type: "settle"; taskKey: string; detail?: string };

export function backgroundStopReducer(
  state: BackgroundStopUiState,
  action: BackgroundStopAction,
): BackgroundStopUiState {
  if (action.type === "ask") {
    const errors = { ...state.errors };
    delete errors[action.taskKey];
    return { ...state, confirmingTaskKey: action.taskKey, errors };
  }
  if (action.type === "cancel") {
    return { ...state, confirmingTaskKey: null };
  }
  if (action.type === "start") {
    return {
      ...state,
      confirmingTaskKey: null,
      stoppingTaskKey: action.taskKey,
    };
  }
  const errors = { ...state.errors };
  if (action.detail) errors[action.taskKey] = action.detail;
  else delete errors[action.taskKey];
  return {
    ...state,
    confirmingTaskKey: null,
    stoppingTaskKey: null,
    errors,
  };
}

/**
 * 抽屉可见时轮询：立即拉一次，之后每 intervalMs 拉一次；返回清理函数。
 * 注入 schedule/cancel 便于单测验证清理（组件用 window.setInterval/clearInterval）。
 */
export function startBackgroundTaskPolling(
  load: () => void,
  intervalMs = 3000,
  schedule: (handler: () => void, timeout: number) => unknown = (
    handler,
    timeout,
  ) => window.setInterval(handler, timeout),
  cancel: (id: unknown) => void = (id) =>
    window.clearInterval(id as ReturnType<typeof window.setInterval>),
): () => void {
  load();
  const id = schedule(load, intervalMs);
  return () => cancel(id);
}
