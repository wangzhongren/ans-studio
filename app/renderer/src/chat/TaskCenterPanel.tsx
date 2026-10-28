/**
 * 任务与运行日志面板（E 批，B-10 收口）：任务卡、状态/短报、收口动作、角色日志徽标/视图、
 * 终止/安全重派入口。数据只经 preload 白名单 IPC；失败如实显示，不伪造成功。
 */

import { useEffect, useMemo, useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import {
  lastLogActionFromText,
  lastLogTimeFromText,
  roleLogBadgeView,
} from "@/chat/role-log-view";
import { getDesktopBridge } from "@/lib/platform";
import { useUiStore } from "@/stores/ui-store";
import { translate, useLocaleState, useT } from "@/i18n";
import type { Locale } from "@/i18n";

interface TaskCard {
  taskId: string;
  targetRoleId: string;
  text: string;
  expectedOutput?: string;
  requestedEvidence?: string[];
  sideEffect: string;
  status: string;
  createdAt: string;
  deliveredAt?: string;
  lastReport?: { status?: string; summary?: string; at?: string };
  closed?: { outcome: string; at: string };
  reports?: Array<{ status?: string; summary?: string; at?: string }>;
}

interface TaskList {
  tasks: TaskCard[];
  errors: number;
  unclosed: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asTaskList(value: unknown): TaskList {
  const record = asRecord(value);
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((item) => asRecord(item) as unknown as TaskCard).filter((task) => typeof task.taskId === "string")
    : [];
  return {
    tasks,
    errors: typeof record.errors === "number" ? record.errors : 0,
    unclosed: typeof record.unclosed === "number" ? record.unclosed : 0,
  };
}

function taskStatusLabel(task: TaskCard, locale: Locale): string {
  if (task.closed) return task.closed.outcome;
  if (task.lastReport?.status) return task.lastReport.status;
  return task.status;
}

export function TaskCenterPanel() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const roles = useChatStore((s) => s.roles);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const pending = useChatStore((s) => s.pendingOperator);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const runtime = useUiStore((s) => s.runtime);
  const [tasks, setTasks] = useState<TaskList>({ tasks: [], errors: 0, unclosed: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [logText, setLogText] = useState("");
  const [logError, setLogError] = useState("");
  const [armed, setArmed] = useState("");

  const roleName = (roleId: string): string => {
    const role = findRole(roles, roleId);
    return role ? roleDisplayName(role, locale) : roleId;
  };

  const refresh = async () => {
    const bridge = getDesktopBridge();
    if (!projectRoot || !bridge?.listTasks) {
      setTasks({ tasks: [], errors: 0, unclosed: 0 });
      return;
    }
    setLoading(true);
    setError("");
    try {
      setTasks(asTaskList(await bridge.listTasks({ projectRoot })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // paneVersions 变化提示任务状态可能更新；刷新失败不覆盖已有列表。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, paneVersions]);

  useEffect(() => {
    if (selectedRole === "" && roles.length > 0) {
      setSelectedRole(useChatStore.getState().primaryRoleId || roles[0]!.roleId);
    }
  }, [roles, selectedRole]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    if (!projectRoot || selectedRole === "" || !bridge?.readRoleActivityLog) {
      setLogText("");
      setLogError("");
      return;
    }
    void bridge
      .readRoleActivityLog({ projectRoot, roleId: selectedRole, limit: 200 })
      .then((result) => {
        if (cancelled) return;
        const record = asRecord(result);
        if (record.ok === true) {
          setLogText(typeof record.text === "string" ? record.text : "");
          setLogError("");
        } else {
          setLogText("");
          setLogError(typeof record.message === "string" ? record.message : "");
        }
      })
      .catch((err) => {
        if (!cancelled) setLogError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, selectedRole, paneVersions]);

  const lastLogTime = useMemo(() => lastLogTimeFromText(logText), [logText]);
  const lastAction = useMemo(() => lastLogActionFromText(logText), [logText]);
  const selectedPending = Object.values(pending).filter(
    (payload) => asRecord(payload).roleId === selectedRole,
  ).length;
  const badge = roleLogBadgeView(
    {
      busy: roleBusy[selectedRole] === true,
      pending: selectedPending,
      lastActivityAt: lastLogTime || null,
    },
    locale,
  );

  const action = async (key: string, run: () => Promise<unknown>) => {
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed("");
    setError("");
    try {
      const result = asRecord(await run());
      if (result.ok !== true) {
        setError(typeof result.message === "string" ? result.message : t("ui.taskCenter.logUnavailable", { detail: "" }));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const closeTask = (task: TaskCard, outcome: "accepted" | "rework" | "rejected") => {
    const bridge = getDesktopBridge();
    if (!projectRoot || !bridge?.closeTask) return;
    const key = `${task.taskId}:close:${outcome}`;
    void action(key, () => bridge.closeTask!({ projectRoot, taskId: task.taskId, outcome }) as Promise<unknown>);
  };

  const terminate = (task: TaskCard) => {
    const bridge = getDesktopBridge();
    if (!projectRoot || !bridge?.terminateRoleRun) return;
    const key = `${task.taskId}:terminate`;
    void action(key, () =>
      bridge.terminateRoleRun!({ projectRoot, roleId: task.targetRoleId, runtime, taskId: task.taskId }) as Promise<unknown>,
    );
  };

  const redispatch = (task: TaskCard) => {
    const bridge = getDesktopBridge();
    if (!projectRoot || !bridge?.redispatchTask) return;
    const key = `${task.taskId}:redispatch`;
    void action(key, () => bridge.redispatchTask!({ projectRoot, taskId: task.taskId }) as Promise<unknown>);
  };

  return (
    <div className="task-center">
      <div className="tc-tools">
        <span className="tc-title">
          <ListChecks size={14} strokeWidth={1.5} aria-hidden="true" />
          {t("ui.taskCenter.title")}
        </span>
        {tasks.unclosed > 0 ? (
          <span className="tc-unclosed">{t("ui.taskCenter.unclosed", { count: tasks.unclosed })}</span>
        ) : null}
        <button type="button" className="tc-refresh" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
          {t("ui.taskCenter.refresh")}
        </button>
      </div>
      {error ? (
        <p className="tc-error" role="alert">
          {error}
        </p>
      ) : null}
      {tasks.errors > 0 ? (
        <p className="tc-error" role="status">
          {t("ui.taskCenter.logUnavailable", { detail: String(tasks.errors) })}
        </p>
      ) : null}

      <section className="tc-section" aria-label={t("ui.taskCenter.tasks")}>
        <h3 className="dc-heading">{t("ui.taskCenter.tasks")}</h3>
        {tasks.tasks.length === 0 ? (
          <p className="tc-empty">{t("ui.taskCenter.empty")}</p>
        ) : (
          <ul className="task-list">
            {tasks.tasks.map((task) => (
              <li
                className={"task-card is-" + task.status}
                key={task.taskId}
                data-task-id={task.taskId}
                aria-label={t("ui.taskCenter.taskAria", { taskId: task.taskId, status: taskStatusLabel(task, locale) })}
              >
                <div className="task-head">
                  <span className="task-id">{task.taskId}</span>
                  <span className="task-status">{taskStatusLabel(task, locale)}</span>
                  <span className="task-target">{roleName(task.targetRoleId)}</span>
                </div>
                <p className="task-text">{task.text}</p>
                {task.expectedOutput ? (
                  <p className="task-expected">
                    {t("ui.taskCenter.action", { action: task.expectedOutput })}
                  </p>
                ) : null}
                {task.lastReport?.summary ? (
                  <p className="task-report">
                    {task.lastReport.status ?? ""} · {task.lastReport.summary}
                  </p>
                ) : null}
                {task.closed ? null : (
                  <div className="task-actions">
                    <button type="button" onClick={() => closeTask(task, "accepted")}>
                      {armed === `${task.taskId}:close:accepted` ? t("ui.taskCenter.confirmClose") : t("ui.taskCenter.accept")}
                    </button>
                    <button type="button" onClick={() => closeTask(task, "rework")}>
                      {t("ui.taskCenter.rework")}
                    </button>
                    <button type="button" onClick={() => closeTask(task, "rejected")}>
                      {t("ui.taskCenter.reject")}
                    </button>
                    <button type="button" onClick={() => terminate(task)}>
                      {armed === `${task.taskId}:terminate` ? t("ui.taskCenter.confirmTerminate") : t("ui.taskCenter.terminate")}
                    </button>
                    <button type="button" onClick={() => redispatch(task)}>
                      {t("ui.taskCenter.redispatch")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tc-section role-log" aria-label={t("ui.taskCenter.logs")}>
        <h3 className="dc-heading">{t("ui.taskCenter.logs")}</h3>
        <div className="role-log-tools">
          <select
            className="role-log-select"
            aria-label={t("ui.taskCenter.logs")}
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
          >
            {roles.map((role) => (
              <option value={role.roleId} key={role.roleId}>
                {roleName(role.roleId)}
              </option>
            ))}
          </select>
          <span className={badge.className} data-status={badge.status}>
            {badge.label}
          </span>
          {lastLogTime ? (
            <span className="role-log-time">
              {t("ui.taskCenter.lastLog", { time: lastLogTime })}
            </span>
          ) : null}
        </div>
        {lastAction ? (
          <p className="role-log-action">{t("ui.taskCenter.action", { action: lastAction })}</p>
        ) : null}
        {logError ? (
          <p className="role-log-error" role="alert">
            {t("ui.taskCenter.logUnavailable", { detail: logError })}
          </p>
        ) : (
          <pre className="role-log-view">{logText || t("ui.taskCenter.logEmpty")}</pre>
        )}
      </section>
    </div>
  );
}
