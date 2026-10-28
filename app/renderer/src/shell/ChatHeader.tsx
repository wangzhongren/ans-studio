/**
 * 会话头（Phase 4A）：真实角色名/副标题/上下文状态 + 引擎选择器 + 工作概览/角色资料。
 *
 * - `#runtime-select` 接真实切换（`switchRuntime`：每引擎视图/会话/草稿）；
 * - `#tab-work` 启用，角标 = 待确认/待选择数（真实 pendingOperator 快照）；
 * - `#tab-card` 角标 = 当前工作 + 排队数；
 * - 会话头下 `#runtime-config-notice`：仅当前引擎缺配/读取失败时显示，
 *   「打开 X 设置」为上下文入口（键盘可聚焦，不遮聊天、不抢焦点）。
 */

import { useEffect, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { useChatStore } from "@/chat/chat-store";
import { switchRuntime } from "@/chat/ipc";
import {
  backgroundRunningCount,
  loadBackgroundTasks,
} from "@/chat/background-tasks";
import { getDesktopBridge } from "@/lib/platform";
import {
  badgeText,
  pendingCountFor,
  roleBadgeAria,
  roleBadgeCount,
  workBadgeAria,
  workBadgeCount,
} from "@/chat/work-view";
import { openEngineSettingsLabel, runtimeLabel } from "@/chat/runtime-config";
import {
  chatWorkingChipView,
  RoleStatusChip,
} from "@/chat/role-status-view";
import {
  openSettingsDrawer,
  setDrawerInvoker,
  useDrawerStore,
} from "@/stores/drawer-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { useUiStore } from "@/stores/ui-store";
import { EngineSelect } from "@/shell/EngineSelect";
import { useLocaleState, useT } from "@/i18n";
import "@/shell/phase4b.css";
export interface ChatHeaderProps {
  onOpenDrawer: () => void;
}

export function ChatHeader({ onOpenDrawer }: ChatHeaderProps) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const runtime = useUiStore((s) => s.runtime);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const drawerTab = useDrawerStore((s) => s.tab);
  const roles = useChatStore((s) => s.roles);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const paneMeta = useChatStore((s) => s.paneMeta);
  const roleMeta = useChatStore((s) => s.roleMeta);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const notice = useSettingsStore((s) => s.notice);
  const backgroundRunning = useBackgroundTasksStore((s) => s.runningCount);
  const anyRoleBusy = Object.values(roleBusy).some((busy) => busy === true);
  // 入口徽标的一次性读取（不是轮询）：面板未打开时也能显示最近运行中任务数。
  useEffect(() => {
    let cancelled = false;
    if (!projectRoot) {
      useBackgroundTasksStore.getState().setRunningCount(0);
      return () => {
        cancelled = true;
      };
    }
    const bridge = getDesktopBridge();
    if (typeof bridge?.listBackgroundTasks !== "function") {
      useBackgroundTasksStore.getState().setRunningCount(0);
      return () => {
        cancelled = true;
      };
    }
    void loadBackgroundTasks(
      bridge,
      projectRoot,
      runtime,
      locale,
    ).then((model) => {
      if (!cancelled) {
        useBackgroundTasksStore
          .getState()
          .setRunningCount(backgroundRunningCount(model));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, runtime, locale, anyRoleBusy]);

  const role = findRole(roles, selectedRoleId);
  const roleName = roleDisplayName(role, locale);
  const contextText =
    (selectedRoleId ? paneMeta[selectedRoleId]?.contextText : "") ||
    (selectedRoleId ? roleMeta[selectedRoleId]?.contextText : "") ||
    t("ui.chatHeader.noSession");
  // 恢复失败原因如实放在 title（旧 renderer 同义）：文案里不把失败说成「已从本地恢复」。
  const contextWarning =
    selectedRoleId ? roleMeta[selectedRoleId]?.contextWarning || "" : "";
  const contextWarningMatch = /恢复失败：(.+)）$/.exec(contextText);

  const pendingCount = pendingCountFor(pendingOperator, selectedRoleId || null);
  const pendingTotal = Object.keys(pendingOperator).length;
  const roleCount = roleBadgeCount(
    !!selectedRoleId && roleBusy[selectedRoleId] === true,
    selectedRoleId ? (queueByRole[selectedRoleId] || []).length : 0,
  );
  const workingChip = chatWorkingChipView(
    {
      busy: !!selectedRoleId && roleBusy[selectedRoleId] === true,
      queueDepth: selectedRoleId ? (queueByRole[selectedRoleId] || []).length : 0,
    },
    locale,
  );
  const noticeVisible = !!projectRoot && notice.visible;
  const workAriaParts: string[] = [];
  if (pendingCount > 0) workAriaParts.push(workBadgeAria(pendingCount, locale));
  if (backgroundRunning > 0) {
    workAriaParts.push(
      t("ui.background.runningSummary", { count: backgroundRunning }),
    );
  }
  const workAriaLabel =
    workAriaParts.length === 0
      ? t("ui.chatHeader.tabWork")
      : pendingCount > 0
        ? workAriaParts.join(" · ")
        : t("ui.chatHeader.tabWork") + " · " + workAriaParts.join(" · ");

  const openWork = (event: MouseEvent<HTMLButtonElement>) => {
    setDrawerInvoker(event.currentTarget);
    useDrawerStore.getState().openTab("work");
  };

  const toggleCard = (event: MouseEvent<HTMLButtonElement>) => {
    setDrawerInvoker(event.currentTarget);
    // 顶层 tab 切换统一经 drawer-store：任何 tab 命令都先清空 queueView，
    // 再显示目标 tab 的基础视图（PM §14.2；抽屉保持打开、标题/焦点正确）。
    useDrawerStore.getState().openTab("card");
  };

  return (
    <>
      <header className="session-head chat-head">
        <div className="head-inner">
          <div className="session-identity">
            <div className="session-title-row">
              <span id="chat-role" className="chat-role">
                {role ? roleName : t("ui.role.noneSelected")}
              </span>
              {workingChip.visible ? (
                <RoleStatusChip
                  className="chat-role-working role-status-chip is-working"
                  label={workingChip.label}
                  title={workingChip.title}
                  dot
                  status="working"
                />
              ) : null}
              <span id="chat-role-sub" className="chat-role-sub" hidden={!!role}>
                {role ? "" : t("ui.chatHeader.selectRoleHint")}
              </span>
            </div>
            <span
              id="context-state"
              className="context-state"
              role="status"
              aria-live="polite"
              title={contextWarning || (contextWarningMatch ? contextWarningMatch[1] : undefined)}
            >
              {contextText}
            </span>
          </div>

          <div className="session-actions" id="right-tabs">
            <EngineSelect
              value={runtime}
              disabled={!projectRoot}
              onChange={(next) => switchRuntime(next)}
            />

            <Button
              id="tab-work"
              variant="ghost"
              size="sm"
              className={drawerOpen && drawerTab === "work" ? "active" : undefined}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen && drawerTab === "work"}
              aria-label={workAriaLabel}
              onClick={openWork}
            >
              {t("ui.chatHeader.tabWork")}
              {workBadgeCount(pendingCount) > 0 ? (
                <span className="tab-badge" aria-hidden="true">
                  {badgeText(pendingCount)}
                </span>
              ) : null}
              {backgroundRunning > 0 ? (
                <span
                  className="tab-badge is-background"
                  aria-hidden="true"
                  title={t("ui.background.runningSummary", {
                    count: backgroundRunning,
                  })}
                >
                  {badgeText(backgroundRunning)}
                </span>
              ) : null}
            </Button>
            <Button
              id="tab-decisions"
              variant="ghost"
              size="sm"
              className={drawerOpen && drawerTab === "decisions" ? "active" : undefined}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen && drawerTab === "decisions"}
              aria-label={t("ui.decisionDialog.panelTitle")}
              onClick={() => useDrawerStore.getState().openTab("decisions")}
            >
              {t("ui.decisionDialog.panelEntry")}
              {pendingTotal > 0 ? (
                <span className="tab-badge" aria-hidden="true">
                  {badgeText(pendingTotal)}
                </span>
              ) : null}
            </Button>
            <Button
              id="tab-tasks"
              variant="ghost"
              size="sm"
              className={drawerOpen && drawerTab === "tasks" ? "active" : undefined}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen && drawerTab === "tasks"}
              aria-label={t("ui.taskCenter.title")}
              onClick={() => useDrawerStore.getState().openTab("tasks")}
            >
              {t("ui.taskCenter.panelEntry")}
            </Button>
            <Button
              id="tab-card"
              variant="ghost"
              size="sm"
              className={drawerOpen && (drawerTab || "card") === "card" ? "active" : undefined}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen && (drawerTab || "card") === "card"}
              aria-label={roleCount > 0 ? roleBadgeAria(roleCount, locale) : t("ui.chatHeader.tabCard")}
              onClick={toggleCard}
            >
              {t("ui.chatHeader.tabCard")}
              {roleCount > 0 ? (
                <span className="tab-badge is-neutral" aria-hidden="true">
                  {badgeText(roleCount)}
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </header>

      <div
        id="runtime-config-notice"
        className={
          "runtime-config-notice" +
          (notice.kind === "warn" ? " is-warn" : notice.kind === "err" ? " is-err" : "")
        }
        role="status"
        aria-live="polite"
        hidden={!noticeVisible}
      >
        <span id="runtime-config-message">{noticeVisible ? notice.message : ""}</span>
        <button
          id="runtime-config-settings"
          className="runtime-config-settings"
          type="button"
          hidden={!noticeVisible || !notice.actionable}
          onClick={(event) => {
            openSettingsDrawer(runtime, event.currentTarget);
          }}
        >
          {openEngineSettingsLabel(runtimeLabel(runtime, locale), locale)}
        </button>
      </div>
    </>
  );
}
