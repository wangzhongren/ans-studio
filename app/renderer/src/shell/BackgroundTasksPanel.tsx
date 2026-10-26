/**
 * 后台任务区块（2026-10-25）：工作概览抽屉内的真实后台任务列表 + 日志 + 停止。
 *
 * - 只消费 `window.desktop.listBackgroundTasks/readBackgroundTask/stopBackgroundTask`；
 *   旧 preload 缺方法 ⇒ unavailable，不抛错、不伪装「没有任务」。
 * - 仅在组件挂载（抽屉工作概览可见）时每 3 秒轮询；卸载即清理。
 * - `kill-timeout` 如实显示「停止超时」，绝不显示成「已停止」。
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Terminal,
} from "lucide-react";
import {
  backgroundRunningCount,
  backgroundStopReducer,
  backgroundTaskKey,
  backgroundTaskRowDurationMs,
  formatBackgroundDuration,
  initialBackgroundStopUiState,
  loadBackgroundTaskLog,
  loadBackgroundTasks,
  startBackgroundTaskPolling,
  stopBackgroundTask,
  backgroundTaskView,
  type BackgroundLogModel,
  type BackgroundTaskListModel,
  type BackgroundTaskRowView,
} from "@/chat/background-tasks";
import { BusySpinner } from "@/chat/BusySpinner";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { useChatStore } from "@/chat/chat-store";
import { getDesktopBridge } from "@/lib/platform";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { useUiStore } from "@/stores/ui-store";
import { useLocaleState, useT } from "@/i18n";

const LOG_TAIL_LINES = 40;

function BackgroundLogView({
  log,
}: {
  log: BackgroundLogModel | "loading" | undefined;
}) {
  const t = useT();
  if (log === undefined || log === "loading") {
    return (
      <div className="background-log" aria-busy="true">
        <BusySpinner />
      </div>
    );
  }
  if (log.kind === "error") {
    return (
      <p className="background-task-error" role="status">
        {t("ui.background.readFailed", { detail: log.detail })}
      </p>
    );
  }
  if (log.empty) {
    return (
      <div className="background-log">
        <p className="background-note">{t("ui.background.logEmpty")}</p>
        {log.truncated ? (
          <p className="background-note">{t("ui.background.logTruncated")}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="background-log">
      {log.truncated ? (
        <p className="background-note">{t("ui.background.logTruncated")}</p>
      ) : null}
      {log.streams.map((stream) => (
        <div
          className="background-log-stream"
          data-stream={stream.stream}
          data-truncated={stream.truncated ? "true" : undefined}
          key={stream.stream}
        >
          <span className="background-log-label">
            {stream.label}
            {stream.truncated ? (
              <span className="background-log-flag">
                {t("shared.common.truncated")}
              </span>
            ) : null}
          </span>
          <pre className="background-log-text">{stream.text}</pre>
        </div>
      ))}
    </div>
  );
}

export function BackgroundTasksPanel({
  projectRoot,
  runtime,
}: {
  projectRoot: string | null;
  runtime: string;
}) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const roles = useChatStore((s) => s.roles);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const [model, setModel] = useState<BackgroundTaskListModel>({
    kind: "loading",
  });
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const [logs, setLogs] = useState<
    Record<string, BackgroundLogModel | "loading">
  >({});
  const [stopState, dispatchStop] = useReducer(
    backgroundStopReducer,
    initialBackgroundStopUiState,
  );
  const [now, setNow] = useState(() => Date.now());

  const roleNameFor = useCallback(
    (id: string) => {
      const role = findRole(roles, id);
      return role ? roleDisplayName(role, locale) : id;
    },
    [roles, locale],
  );

  const refresh = useCallback(async () => {
    const next = await loadBackgroundTasks(
      getDesktopBridge(),
      projectRoot || "",
      runtime,
      locale,
      Date.now(),
      roleNameFor,
    );
    setModel(next);
    useBackgroundTasksStore
      .getState()
      .setRunningCount(backgroundRunningCount(next));
  }, [projectRoot, runtime, locale, roleNameFor]);

  // 抽屉关闭后 WorkOverview 仍保持挂载（阅读状态），必须显式停止轮询。
  useEffect(() => {
    if (!drawerOpen) return;
    return startBackgroundTaskPolling(() => {
      void refresh();
    });
  }, [drawerOpen, refresh]);

  const hasRunning =
    drawerOpen && model.kind === "ready" && model.runningCount > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  const toggleLog = async (task: BackgroundTaskRowView) => {
    const key = backgroundTaskKey(task);
    if (expandedTaskKey === key) {
      setExpandedTaskKey(null);
      return;
    }
    setExpandedTaskKey(key);
    setLogs((previous) => ({ ...previous, [key]: "loading" }));
    const log = await loadBackgroundTaskLog(
      getDesktopBridge(),
      {
        projectRoot: projectRoot || "",
        runtime: task.runtime || runtime,
        roleId: task.roleId,
        taskId: task.taskId,
        stream: "both",
        tailLines: LOG_TAIL_LINES,
      },
      locale,
    );
    setLogs((previous) => ({ ...previous, [key]: log }));
    void refresh();
  };

  const confirmStop = async (task: BackgroundTaskRowView) => {
    const key = backgroundTaskKey(task);
    dispatchStop({ type: "start", taskKey: key });
    const outcome = await stopBackgroundTask(
      getDesktopBridge(),
      {
        projectRoot: projectRoot || "",
        runtime: task.runtime || runtime,
        roleId: task.roleId,
        taskId: task.taskId,
      },
      locale,
    );
    if (outcome.ok) {
      const snapshot = outcome.task;
      dispatchStop({ type: "settle", taskKey: key });
      if (snapshot) {
        setModel((previous) => {
          if (previous.kind !== "ready") return previous;
          const tasks = previous.tasks.map((row) =>
            backgroundTaskKey(row) === key
              ? backgroundTaskView(
                  {
                    ...snapshot,
                    roleId: row.roleId,
                    runtime: row.runtime,
                  },
                  locale,
                  Date.now(),
                  roleNameFor,
                )
              : row,
          );
          return {
            kind: "ready",
            tasks,
            runningCount: tasks.filter((row) => row.running).length,
          };
        });
      }
      await refresh();
    } else {
      dispatchStop({
        type: "settle",
        taskKey: key,
        detail: outcome.detail,
      });
      await refresh();
    }
  };

  const tasks = model.kind === "ready" ? model.tasks : [];
  const runningCount = backgroundRunningCount(model);
  const sectionAriaLabel =
    model.kind === "ready"
      ? t("ui.background.count", { count: tasks.length })
      : t("ui.background.title");

  return (
    <section
      className="work-section background-tasks"
      aria-label={sectionAriaLabel}
      aria-busy={model.kind === "loading" ? "true" : undefined}
    >
      <h3 className="work-heading">
        <span className="work-heading-icon" aria-hidden="true">
          <Terminal size={14} strokeWidth={1.5} />
        </span>
        <span className="work-heading-label">{t("ui.background.title")}</span>
        {model.kind === "ready" ? (
          <span
            className={
              "background-running-summary" +
              (runningCount > 0 ? " is-active" : "")
            }
            data-running={runningCount}
          >
            {t("ui.background.runningSummary", { count: runningCount })}
          </span>
        ) : null}
        <button
          type="button"
          className="btn-mini background-refresh"
          title={t("ui.background.refresh")}
          aria-label={t("ui.background.refresh")}
          onClick={() => void refresh()}
        >
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
          {t("ui.background.refresh")}
        </button>
      </h3>

      {model.kind === "loading" ? (
        <div className="work-empty background-note" aria-busy="true">
          <BusySpinner />
        </div>
      ) : null}

      {model.kind === "unavailable" ? (
        <div className="work-empty background-unavailable" role="status">
          <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("main.backgroundTasks.unavailable")}</span>
        </div>
      ) : null}

      {model.kind === "error" ? (
        <div className="background-load-error" role="status">
          <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("ui.background.loadFailed", { detail: model.detail })}</span>
        </div>
      ) : null}

      {model.kind === "ready" && tasks.length === 0 ? (
        <div className="work-empty background-empty">
          <Terminal size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("ui.background.empty")}</span>
        </div>
      ) : null}

      {model.kind === "ready" && tasks.length > 0 ? (
        <ul className="background-task-list">
          {tasks.map((task) => {
            const key = backgroundTaskKey(task);
            const expanded = expandedTaskKey === key;
            const stopping = stopState.stoppingTaskKey === key;
            const confirming = stopState.confirmingTaskKey === key;
            const durationText = formatBackgroundDuration(
              backgroundTaskRowDurationMs(task, now),
            );
            return (
              <li
                className={"background-task " + task.stateClass}
                key={key}
                data-task-id={task.taskId}
                data-task-key={key}
                data-role-id={task.roleId}
                data-state={task.state}
                aria-busy={stopping ? "true" : undefined}
              >
                <div className="background-task-head">
                  <span className="background-role">{task.roleName}</span>
                  <span className={"background-state " + task.stateClass}>
                    {task.stateLabel}
                  </span>
                  <code className="background-command" title={task.command}>
                    {task.commandShort}
                  </code>
                </div>

                <div className="background-task-meta">
                  {task.pid !== null ? (
                    <span>
                      <span className="background-meta-label">
                        {t("ui.background.pid")}
                      </span>
                      {task.pid}
                    </span>
                  ) : null}
                  {task.startedAtText ? (
                    <span>
                      <span className="background-meta-label">
                        {t("ui.background.startedAt")}
                      </span>
                      {task.startedAtText}
                    </span>
                  ) : null}
                  <span>
                    <span className="background-meta-label">
                      {t("ui.background.duration")}
                    </span>
                    {durationText}
                  </span>
                  {task.exitCode !== null ? (
                    <span>
                      {t("ui.background.exitCode", { code: task.exitCode })}
                    </span>
                  ) : null}
                </div>

                {task.error ? (
                  <p className="background-task-error">{task.error}</p>
                ) : null}

                <div className="background-task-actions">
                  <button
                    type="button"
                    className="btn-mini background-log-toggle"
                    aria-expanded={expanded}
                    onClick={() => void toggleLog(task)}
                  >
                    <ChevronRight
                      className={
                        "disclosure-chevron" + (expanded ? " is-expanded" : "")
                      }
                      size={12}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {expanded
                      ? t("ui.background.hideLog")
                      : t("ui.background.viewLog")}
                  </button>
                  {task.canStop ? (
                    <button
                      type="button"
                      className="btn-mini background-stop"
                      disabled={stopping}
                      onClick={() =>
                        dispatchStop({ type: "ask", taskKey: key })
                      }
                    >
                      {stopping ? <BusySpinner /> : null}
                      {t("ui.background.stop")}
                    </button>
                  ) : null}
                </div>

                {confirming ? (
                  <div
                    className="background-stop-confirm"
                    role="group"
                    aria-label={t("ui.background.stopConfirm")}
                  >
                    <span className="background-stop-confirm-text">
                      {t("ui.background.stopConfirm")}
                    </span>
                    <button
                      type="button"
                      className="btn-mini background-stop-confirm-yes"
                      disabled={stopping}
                      onClick={() => void confirmStop(task)}
                    >
                      {t("ui.background.stop")}
                    </button>
                    <button
                      type="button"
                      className="btn-mini background-stop-confirm-no"
                      disabled={stopping}
                      onClick={() => dispatchStop({ type: "cancel" })}
                    >
                      {t("shared.common.cancel")}
                    </button>
                  </div>
                ) : null}

                {stopState.errors[key] ? (
                  <p className="background-task-error" role="status">
                    {t("ui.background.stopFailed", {
                      detail: stopState.errors[key],
                    })}
                  </p>
                ) : null}

                {expanded ? <BackgroundLogView log={logs[key]} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
