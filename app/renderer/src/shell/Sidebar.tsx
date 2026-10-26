/**
 * 左栏（Phase 3A）：真实项目/角色树（主入口/治理职能/工作角色）、状态徽标、
 * roving tabindex + ↑↓/Home/End、点击即开聊；无项目/无角色空态如实。
 *
 * 拖宽/收起契约沿用 Phase 2（shadcn resizable Group/Panel + 自绘手柄）。
 */

import { Fragment, useRef } from "react";
import { flushSync } from "react-dom";
import {
  CircleAlert,
  Clock,
  Folder,
  PanelLeftClose,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ansIcon from "@/assets/ans-studio-ans-icon.png";
import { getDesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import {
  flattenRoles,
  governanceView,
  groupRoles,
  roleDisplayName,
} from "@/chat/role-view";
import { deriveRoleStatus, statusBadge } from "@/chat/status";
import {
  RoleStatusChip,
  roleStatusChipView,
} from "@/chat/role-status-view";
import { BusySpinner } from "@/chat/BusySpinner";
import type { RoleView } from "@/chat/types";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  RUNTIME_OPTIONS,
  useUiStore,
} from "@/stores/ui-store";
import { openSettingsDrawer } from "@/stores/drawer-store";
import { runtimeLabel } from "@/chat/runtime-config";
import { roleBadgeCount, badgeText } from "@/chat/work-view";
import { pendingKindFor } from "@/chat/operator-view";
import { useLocaleState, useT } from "@/i18n";
import type { Locale } from "@/i18n";

function statusIcon(kind: string) {
  if (kind === "st-error") {
    return <CircleAlert size={12} strokeWidth={1.5} aria-hidden="true" />;
  }
  if (kind === "st-confirm") {
    return <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />;
  }
  if (kind === "st-restored") {
    return <Clock size={12} strokeWidth={1.5} aria-hidden="true" />;
  }
  return null;
}

function RoleRow({
  role,
  primary,
  tabbable,
  onSelect,
  locale,
}: {
  role: RoleView;
  primary: boolean;
  tabbable: boolean;
  onSelect: () => void;
  locale: Locale;
}) {
  const t = useT();
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const runtime = useUiStore((s) => s.runtime);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const roleMeta = useChatStore((s) => s.roleMeta);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const gov = governanceView(role.governanceFunction, locale);
  const displayName = roleDisplayName(role, locale);
  const runtimeLabel =
    RUNTIME_OPTIONS.find((option) => option.id === runtime)?.label || "Claude";
  // PM §十七：待选择与待确认是两种不同的未决语义；只按呈现面（源/镜像）聚合，
  // 任一 choice ⇒「待选择」，否则「等待你确认」；无 pending ⇒ null（回真实状态）。
  const pendingKind = pendingKindFor(pendingOperator, role.roleId, locale);
  const awaiting = pendingKind !== null;
  const status = deriveRoleStatus({
    awaitingConfirm: awaiting,
    busy: roleBusy[role.roleId] === true,
    queueDepth: (queueByRole[role.roleId] || []).length,
    error: roleMeta[role.roleId]?.error === true,
    live: roleMeta[role.roleId]?.live === true,
    hadSession: roleMeta[role.roleId]?.hadSession === true,
    restored: roleMeta[role.roleId]?.restored === true,
  });
  // PM §十三/§十七：状态标签只表达状态；唯一可见数字徽标是 .ti-count（当前+排队）。
  // 等待态文案用未决种类替换，不附带数量；作答/失效后 pending 清空即回真实状态。
  const badge = statusBadge(status, 0, locale);
  const statusLabel =
    status === "awaiting-confirm" && pendingKind ? pendingKind : badge.label;
  const statusView = roleStatusChipView(status, locale, statusLabel);
  const workCount = roleBadgeCount(
    roleBusy[role.roleId] === true,
    (queueByRole[role.roleId] || []).length,
  );
  const description = [
    primary ? t("ui.sidebar.primaryHint") : "",
    gov ? gov.builtinNote : role.builtIn ? t("ui.sidebar.builtinRoleNote") : "",
  ]
    .filter(Boolean)
    .join(locale === "zh-CN" ? "；" : "; ");
  const active = selectedRoleId === role.roleId;
  return (
    <button
      type="button"
      className={
        "tree-item" +
        (role.builtIn ? " builtin" : "") +
        (primary ? " primary" : "") +
        (active ? " active" : "") +
        (statusView.rowClass ? " " + statusView.rowClass : "")
      }
      data-role-id={role.roleId}
      data-tab={tabbable ? "0" : "-1"}
      data-primary={primary ? "true" : undefined}
      data-builtin={role.builtIn ? "true" : undefined}
      data-status={status}
      tabIndex={tabbable ? 0 : -1}
      aria-current={active ? "true" : undefined}
      aria-description={description || undefined}
      title={displayName + (description ? (locale === "zh-CN" ? "；" : "; ") + description : "")}
      onClick={onSelect}
    >
      <span className="ti-icon" aria-hidden="true">
        <span className={"ti-avatar" + (statusView.avatarClass ? " " + statusView.avatarClass : "")}>
          {Array.from(displayName).slice(0, 1).join("")}
        </span>
      </span>
      <span className="ti-main">
        <span className="ti-name">{displayName}</span>
        {workCount > 0 ? (
          <span
            className="ti-count"
            title={
              t("ui.sidebar.busyAria", {
                busy: roleBusy[role.roleId] === true ? 1 : 0,
                queued: (queueByRole[role.roleId] || []).length,
              })
            }
            aria-label={
              t("ui.sidebar.busyAria", {
                busy: roleBusy[role.roleId] === true ? 1 : 0,
                queued: (queueByRole[role.roleId] || []).length,
              })
            }
          >
            {badgeText(workCount)}
          </span>
        ) : null}
        {gov ? <span className="ti-power">{gov.power}</span> : null}
        {role.groupDuty ? <span className="ti-group-duty">{role.groupDuty}</span> : null}
        <span className="ti-sub">
          <span>{runtimeLabel}</span>
          <RoleStatusChip
            className={statusView.chipClass}
            label={statusView.label}
            title={statusView.title}
            dot={statusView.dot}
            status={status}
            icon={
              statusView.working ? (
                <BusySpinner />
              ) : (
                statusIcon(badge.className)
              )
            }
          />
        </span>
        {gov || role.builtIn ? (
          <span className="ti-builtin">{gov?.builtinNote || t("ui.sidebar.builtinRoleNote")}</span>
        ) : null}
      </span>
    </button>
  );
}

export function Sidebar() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const runtime = useUiStore((s) => s.runtime);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const selectRole = useChatStore((s) => s.selectRole);
  const loadProject = useChatStore((s) => s.loadProject);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const roles = useChatStore((s) => s.roles);
  const primaryRoleId = useChatStore((s) => s.primaryRoleId);
  const warnings = useChatStore((s) => s.warnings);

  const resizerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startWidth: 0 });
  const treeRef = useRef<HTMLElement>(null);

  const applyWidth = (width: number) => {
    let next = useUiStore.getState().sidebarWidth;
    flushSync(() => {
      next = useUiStore.getState().setSidebarWidth(width);
    });
    resizerRef.current?.setAttribute("aria-valuenow", String(next));
    return next;
  };

  const endDrag = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    document.querySelector(".app")?.classList.remove("is-sidebar-resizing");
  };

  const onResizerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      dragging: true,
      startX: event.clientX,
      startWidth: useUiStore.getState().sidebarWidth,
    };
    event.currentTarget.focus({ preventScroll: true });
    document.querySelector(".app")?.classList.add("is-sidebar-resizing");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 合成事件/异常环境：仍可由元素 pointermove 完成拖动。 */
    }
    event.preventDefault();
  };

  const onResizerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    applyWidth(
      dragRef.current.startWidth + (event.clientX - dragRef.current.startX),
    );
    event.preventDefault();
  };

  const onResizerPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    endDrag();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
  };

  const onResizerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 24 : 8;
    applyWidth(
      useUiStore.getState().sidebarWidth +
        (event.key === "ArrowRight" ? step : -step),
    );
  };

  const collapse = () => {
    setSidebarCollapsed(true);
    requestAnimationFrame(() => {
      document.getElementById("sidebar-expand")?.focus();
    });
  };

  // 组内组长在前（旧 roleGroups 同口径；只在渲染前排序，不改仓库数据）。
  const groups = groupRoles(roles, primaryRoleId, locale).map((group) => ({
    ...group,
    roles: group.roles.slice().sort(
      // 「组长」是角色数据里的分组职责值（机器/用户数据），不是 UI 文案。
      (a, b) => Number(b.groupDuty === "组长") - Number(a.groupDuty === "组长"),
    ),
  }));
  const flat = flattenRoles(groups);
  const activeId =
    flat.find((role) => role.roleId === selectedRoleId)?.roleId ||
    flat[0]?.roleId ||
    "";

  const focusRole = (roleId: string) => {
    requestAnimationFrame(() => {
      const element = treeRef.current?.querySelector<HTMLElement>(
        `[data-role-id="${CSS.escape(roleId)}"]`,
      );
      element?.focus();
    });
  };

  const onTreeKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (flat.length === 0) return;
    const current = Math.max(
      0,
      flat.findIndex((role) => role.roleId === activeId),
    );
    let next = current;
    if (event.key === "ArrowDown") next = Math.min(flat.length - 1, current + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = flat.length - 1;
    else return;
    event.preventDefault();
    const roleId = flat[next].roleId;
    void selectRole(roleId);
    focusRole(roleId);
  };

  const importProject = async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.pickProject) return;
    try {
      const root = await bridge.pickProject();
      if (typeof root === "string" && root !== "") {
        await loadProject(root);
      }
    } catch {
      useChatStore.getState().setHint(t("ui.sidebar.selectProjectFailed"));
    }
  };

  const projectName = projectRoot
    ? projectRoot.split(/[\\/]/).filter(Boolean).pop() || projectRoot
    : t("ui.sidebar.noProject");
  const pickAvailable = !!getDesktopBridge()?.pickProject;

  return (
    <aside className="col-left">
      <div className="sidebar-brand-row">
        <div className="workspace-brand">
          <img
            className="workspace-brand-mark"
            src={ansIcon}
            alt="ANS"
            width={30}
            height={30}
          />
          <span>AGENT WORKSPACE</span>
        </div>
        <button
          id="sidebar-collapse"
          className="sidebar-toggle sidebar-collapse"
          type="button"
          aria-label={t("ui.sidebar.collapse")}
          title={t("ui.sidebar.collapse")}
          aria-expanded={!sidebarCollapsed}
          onClick={collapse}
        >
          <PanelLeftClose size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="project-summary">
        <div className="project-icon" aria-hidden="true">
          <Folder size={18} strokeWidth={1.75} />
        </div>
        <div className="project-identity">
          <div id="project-name" className="project-name" title={projectName}>
            {projectName}
          </div>
          <div
            id="project-path"
            className={"project-path" + (projectRoot ? "" : " is-empty")}
            title={projectRoot || t("ui.sidebar.noProject")}
          >
            {projectRoot || t("ui.sidebar.noProject")}
          </div>
        </div>
      </div>

      <div className="tree-label-row">
        <span className="tree-label">{t("ui.sidebar.workspace")}</span>
      </div>

      <nav
        id="role-tree"
        className="tree"
        aria-label={t("ui.sidebar.roleListAria")}
        ref={treeRef}
        onKeyDown={onTreeKeyDown}
      >
        {flat.length === 0 ? (
          <div className="tree-empty">
            {projectRoot ? t("ui.sidebar.noRolesInProject") : t("ui.sidebar.noProjectPeriod")}
          </div>
        ) : (
          groups.map((group) => (
            <Fragment key={group.label}>
              <div className="tree-group">{group.label}</div>
              {group.roles.map((role) => (
                <RoleRow
                  key={role.roleId}
                  role={role}
                  primary={role.roleId === primaryRoleId}
                  tabbable={role.roleId === activeId}
                  onSelect={() => void selectRole(role.roleId)}
                  locale={locale}
                />
              ))}
            </Fragment>
          ))
        )}
      </nav>

      <div
        id="sidebar-resizer"
        ref={resizerRef}
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("ui.sidebar.resizeAria")}
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        title={t("ui.sidebar.resizeTitle")}
        onPointerDown={onResizerPointerDown}
        onPointerMove={onResizerPointerMove}
        onPointerUp={onResizerPointerUp}
        onPointerCancel={onResizerPointerUp}
        onDoubleClick={() => applyWidth(SIDEBAR_DEFAULT)}
        onKeyDown={onResizerKeyDown}
      />

      <div className="sidebar-foot">
        <Button
          id="btn-import"
          variant="ghost"
          className="w-full justify-start font-normal"
          disabled={!pickAvailable}
          title={
            pickAvailable
              ? projectRoot
                ? t("ui.sidebar.switchProject")
                : t("ui.sidebar.importProject")
              : t("ui.sidebar.pickUnavailable")
          }
          onClick={() => void importProject()}
        >
          {projectRoot ? t("ui.sidebar.switchProject") : t("ui.sidebar.importProject")}
        </Button>
        <Button
          id="tab-pi"
          variant="ghost"
          className="w-full justify-start font-normal"
          disabled={!projectRoot}
          title={
            projectRoot
              ? t("ui.sidebar.runtimeSettings", { runtime: runtimeLabel(runtime, locale) })
              : t("ui.sidebar.settingsDisabled")
          }
          aria-label={
            projectRoot
              ? t("ui.sidebar.runtimeSettings", { runtime: runtimeLabel(runtime, locale) })
              : t("ui.sidebar.settingsDisabled")
          }
          onClick={(event) => openSettingsDrawer(runtime, event.currentTarget)}
        >
          {t("ui.sidebar.settings")}
        </Button>
        <div id="sidebar-role-count" className="sidebar-role-count">
          {projectRoot ? t("ui.sidebar.roleCount", { count: roles.length }) : t("ui.sidebar.noProject")}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div id="warnings" className="warnings" role="status">
          {warnings.map((warning, index) => (
            <div key={index} className="warning-line">
              {String(warning)}
            </div>
          ))}
        </div>
      ) : null}

    </aside>
  );
}
