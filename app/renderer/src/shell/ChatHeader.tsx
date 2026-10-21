/**
 * 会话头（Phase 4A）：真实角色名/副标题/上下文状态 + 引擎选择器 + 工作概览/角色资料。
 *
 * - `#runtime-select` 接真实切换（`switchRuntime`：每引擎视图/会话/草稿）；
 * - `#tab-work` 启用，角标 = 待确认/待选择数（真实 pendingOperator 快照）；
 * - `#tab-card` 角标 = 当前工作 + 排队数；
 * - 会话头下 `#runtime-config-notice`：仅当前引擎缺配/读取失败时显示，
 *   「打开 X 设置」为上下文入口（键盘可聚焦，不遮聊天、不抢焦点）。
 */

import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { useChatStore } from "@/chat/chat-store";
import { switchRuntime } from "@/chat/ipc";
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
  openSettingsDrawer,
  setDrawerInvoker,
  useDrawerStore,
} from "@/stores/drawer-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { EngineSelect } from "@/shell/EngineSelect";
import { GovernancePanel } from "@/shell/GovernancePanel";
import "@/shell/phase4b.css";

export interface ChatHeaderProps {
  onOpenDrawer: () => void;
}

export function ChatHeader({ onOpenDrawer }: ChatHeaderProps) {
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

  const role = findRole(roles, selectedRoleId);
  const contextText =
    (selectedRoleId ? paneMeta[selectedRoleId]?.contextText : "") ||
    (selectedRoleId ? roleMeta[selectedRoleId]?.contextText : "") ||
    "尚未开启会话";
  // 恢复失败原因如实放在 title（旧 renderer 同义）：文案里不把失败说成「已从本地恢复」。
  const contextWarning =
    selectedRoleId ? roleMeta[selectedRoleId]?.contextWarning || "" : "";
  const contextWarningMatch = /恢复失败：(.+)）$/.exec(contextText);

  const pendingCount = pendingCountFor(pendingOperator, selectedRoleId || null);
  const roleCount = roleBadgeCount(
    !!selectedRoleId && roleBusy[selectedRoleId] === true,
    selectedRoleId ? (queueByRole[selectedRoleId] || []).length : 0,
  );
  const noticeVisible = !!projectRoot && notice.visible;

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
                {role ? roleDisplayName(role) : "未选择角色"}
              </span>
              <span id="chat-role-sub" className="chat-role-sub" hidden={!!role}>
                {role ? "" : "从左侧选择一个角色开始聊天"}
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
              aria-label={
                pendingCount > 0 ? workBadgeAria(pendingCount) : "工作概览"
              }
              onClick={openWork}
            >
              工作概览
              {workBadgeCount(pendingCount) > 0 ? (
                <span className="tab-badge" aria-hidden="true">
                  {badgeText(pendingCount)}
                </span>
              ) : null}
            </Button>
            <Button
              id="tab-card"
              variant="ghost"
              size="sm"
              className={drawerOpen && (drawerTab || "card") === "card" ? "active" : undefined}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen && (drawerTab || "card") === "card"}
              aria-label={roleCount > 0 ? roleBadgeAria(roleCount) : "角色资料"}
              onClick={toggleCard}
            >
              角色资料
              {roleCount > 0 ? (
                <span className="tab-badge is-neutral" aria-hidden="true">
                  {badgeText(roleCount)}
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </header>

      <GovernancePanel />

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
          {openEngineSettingsLabel(runtimeLabel(runtime))}
        </button>
      </div>
    </>
  );
}
