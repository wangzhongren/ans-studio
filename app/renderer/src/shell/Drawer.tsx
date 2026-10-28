/**
 * 右抽屉（424px 覆盖层，Phase 4A）：card / work / pi / document 四类面板，
 * Motion 滑入/滑出 + 遮罩 + Esc + 焦点陷阱 + 背景 inert + 焦点返回触发元素。
 *
 * - 抽屉常驻挂载（关闭时 aria-hidden/inert 且移出视口）：设置面板状态与
 *   `#pi-status` 在关闭时仍可按既有契约读取，切回不丢；
 * - 内容委托给 ProfilePanel / WorkOverview / SettingsPanel / DocumentView；
 * - 文档阅读态 Esc 先回列表（DocumentView 捕获），再 Esc 关闭抽屉。
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { useUiStore } from "@/stores/ui-store";
import {
  useDrawerStore,
  currentReadingKey,
  consumeDrawerFocus,
} from "@/stores/drawer-store";
import { useSettingsStore } from "@/stores/settings-store";
import { engineSettingsTitle, runtimeLabel } from "@/chat/runtime-config";
import { profileTitle, queueTitle, workTitle } from "@/chat/work-view";
import { documentSourceTitle } from "@/chat/document-view";
import { SettingsPanel } from "@/shell/SettingsPanel";
import { ProfilePanel } from "@/shell/ProfilePanel";
import { WorkOverview } from "@/shell/WorkOverview";
import { DecisionCenterPanel } from "@/chat/DecisionCenterPanel";
import { TaskCenterPanel } from "@/chat/TaskCenterPanel";
import { DocumentView } from "@/shell/DocumentView";
import { QueueSubview } from "@/shell/QueueSubview";
import { useLocaleState, useT } from "@/i18n";
import "@/shell/phase4a.css";

export function Drawer() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const open = useUiStore((s) => s.drawerOpen);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const runtime = useUiStore((s) => s.runtime);
  const tab = useDrawerStore((s) => s.tab);
  const queueView = useDrawerStore((s) => s.queueView);
  const nonce = useDrawerStore((s) => s.nonce);
  const docsView = useDrawerStore((s) => s.document);
  const settingsEngine = useSettingsStore((s) => s.engine);
  const roles = useChatStore((s) => s.roles);
  const closeRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const lastScrollTarget = useRef("");
  // 关闭动画后再 display:none：transform 后的离屏抽屉不得撑大 body/.app 的 scrollWidth；
  // display:none 时 DOM（#pi-status 等）仍可按既有契约读取。
  const [rendered, setRendered] = useState(open);
  const effective = tab || "card";
  const roleKey = currentReadingKey(selectedRoleId);

  const role = findRole(roles, selectedRoleId);
  const roleName = role ? roleDisplayName(role, locale) : t("ui.role.noneSelected");
  const documentRole = docsView ? findRole(roles, docsView.roleId) : null;
  const documentRoleName = documentRole
    ? roleDisplayName(documentRole, locale)
    : docsView?.roleId || t("shared.common.role");

  const showingQueue =
    queueView !== null && (effective === "work" || effective === "card");
  const title = showingQueue
    ? queueTitle(roleName, locale)
    : effective === "pi"
      ? engineSettingsTitle(runtimeLabel(settingsEngine, locale), locale)
      : effective === "work"
        ? workTitle(roleName, locale)
        : effective === "decisions"
          ? t("ui.decisionDialog.panelTitle")
          : effective === "tasks"
            ? t("ui.taskCenter.title")
            : effective === "document" && docsView
          ? documentSourceTitle(documentRoleName, locale)
          : profileTitle(roleName, locale);

  useEffect(() => {
    if (open) {
      setRendered(true);
      requestAnimationFrame(() => {
        // 打开瞬间若焦点已被内容控件接走（脚本/键盘连续操作），不抢回关闭钮。
        if (asideRef.current?.contains(document.activeElement)) return;
        closeRef.current?.focus();
      });
    } else {
      const timer = setTimeout(() => setRendered(false), 130);
      wasOpen.current = open;
      return () => clearTimeout(timer);
    }
    wasOpen.current = open;
  }, [open]);

  // 背景 inert / aria-hidden（确认卡打开时抽屉让位；AlertDialog 自身带模态语义）。
  useEffect(() => {
    const left = document.querySelector<HTMLElement>(".col-left");
    const mid = document.querySelector<HTMLElement>(".col-mid");
    const target = open ? "" : null;
    for (const element of [left, mid]) {
      if (!element) continue;
      if (open) element.setAttribute("inert", target as string);
      else element.removeAttribute("inert");
    }
    return () => {
      left?.removeAttribute("inert");
      mid?.removeAttribute("inert");
    };
  }, [open]);

  // 打开/切面/返回：外层滚动恢复（按角色×引擎×项目）。
  useLayoutEffect(() => {
    if (!open || effective === "pi" || effective === "document") return;
    const element = bodyRef.current;
    if (!element) return;
    const target = (open ? "1" : "0") + "|" + roleKey + "|" + effective;
    const sameTarget = lastScrollTarget.current === target;
    lastScrollTarget.current = target;
    const saved = useDrawerStore.getState().reading[roleKey]?.scrollTop || 0;
    // 同一面板的 nonce 刷新不应把用户/脚本刚设置的滚动位置拉回旧值；
    // 真正切面/重开（target 变化）仍按阅读键恢复。
    if (sameTarget && element.scrollTop > 0) return;
    element.scrollTop = saved;
  }, [open, effective, roleKey, nonce]);

  // 跨视图焦点（如「返回角色资料」→ 等价入口）。
  useEffect(() => {
    if (!open) return;
    const selector = consumeDrawerFocus();
    if (!selector) return;
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && element.getClientRects().length > 0) {
        element.focus({ preventScroll: true });
      }
    });
  }, [open, effective, nonce, selectedRoleId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // 确认卡在最上层时，Esc 归它（关闭 = 不放行）。
      if (document.querySelector('[data-slot="alert-dialog-content"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        useDrawerStore.getState().close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const trapTab = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !asideRef.current) return;
    const focusables = Array.from(
      asideRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.offsetParent !== null &&
        element.getClientRects().length > 0 &&
        !element.closest("[hidden]"),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="drawer-backdrop"
            key="backdrop"
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            onClick={() => useDrawerStore.getState().close()}
          />
        ) : (
          <div id="drawer-backdrop" className="drawer-backdrop" hidden />
        )}
      </AnimatePresence>
      <motion.aside
        id="right-drawer"
        ref={asideRef}
        className={"drawer" + (open ? " open" : "")}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-hidden={!open}
        aria-labelledby="drawer-title"
        tabIndex={-1}
        data-open={open ? "true" : "false"}
        initial={false}
        animate={{ x: open ? 0 : "100%" }}
        transition={{ duration: open ? 0.16 : 0.12, ease: open ? [0.2, 0, 0, 1] : [0.4, 0, 1, 1] }}
        onKeyDown={trapTab}
        style={{
          pointerEvents: open ? "auto" : "none",
          display: open || rendered ? undefined : "none",
        }}
      >
        <div className="drawer-head">
          <h2 className="drawer-title" id="drawer-title">
            {title}
          </h2>
          <button
            id="drawer-close"
            ref={closeRef}
            className="drawer-close"
            type="button"
            title={t("ui.drawer.collapseTitle")}
            aria-label={t("shared.common.collapse")}
            tabIndex={open ? 0 : -1}
            onClick={() => useDrawerStore.getState().close()}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <SettingsPanel hidden={effective !== "pi"} />

        <div
          id="right-body"
          className="drawer-body"
          ref={bodyRef}
          hidden={effective === "pi"}
          onScroll={(event) => {
            if (effective === "card" || effective === "work") {
              useDrawerStore
                .getState()
                .setScrollTop(roleKey, event.currentTarget.scrollTop);
            }
          }}
        >
          {showingQueue ? (
            <QueueSubview
              roleId={selectedRoleId || null}
              origin={queueView?.origin || "work"}
            />
          ) : null}
          {!showingQueue && effective === "card" ? <ProfilePanel roleId={selectedRoleId || null} /> : null}
          {!showingQueue && effective === "work" ? <WorkOverview roleId={selectedRoleId || null} /> : null}
          {effective === "decisions" ? <DecisionCenterPanel /> : null}
          {effective === "tasks" ? <TaskCenterPanel /> : null}
          {effective === "document" ? <DocumentView /> : null}
        </div>
      </motion.aside>
    </>
  );
}
