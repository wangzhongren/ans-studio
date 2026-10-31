/**
 * 队列子视图（Phase 4A，UIUX 设计 §5.1）：同一 424 抽屉内的全量队列视图。
 *
 * - 标题「<角色> · 队列」由 Drawer 负责；返回按钮回到来源视图（工作概览/角色资料）；
 * - 当前工作 + 排队全量（简单上限 50 + 查看更多，不引虚拟库）；
 * - Esc 先返回来源视图（不被 Drawer 当作关闭）；返回后焦点回「查看全部队列」触发；
 * - `#right-queue-body` 在本视图唯一存在；不新增第四会话头图标/第二抽屉。
 */

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { useDrawerStore, queueDrawerFocus } from "@/stores/drawer-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { queueGroups } from "@/chat/work-view";
import { QueuePanel } from "@/shell/QueuePanel";
import { useLocaleState, useT } from "@/i18n";

const SUBVIEW_LIMIT = 50;

export function QueueSubview({
  roleId,
  origin,
}: {
  roleId: string | null;
  origin: "work" | "card";
}) {
  const roles = useChatStore((s) => s.roles);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const queueMetaByRole = useChatStore((s) => s.queueMetaByRole);
  const runningByRole = useChatStore((s) => s.runningByRole);
  const [showAll, setShowAll] = useState(false);
  const backFromQueue = useDrawerStore((s) => s.backFromQueue);
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const role = findRole(roles, roleId);
  const roleName = role ? roleDisplayName(role, locale) : t("ui.role.noneSelected");
  const backText = origin === "card" ? t("ui.chatHeader.tabCard") : t("ui.chatHeader.tabWork");

  useEffect(() => {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".queue-back")
        ?.focus({ preventScroll: true });
    });
  }, []);

  // Esc 在队列子视图先返回来源视图；再 Esc 才由 Drawer 关闭。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      useDrawerStore.getState().backFromQueue();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  if (!roleId || !role) {
    return (
      <div className="right-empty">
        <p className="empty-title">{t("ui.queueSubview.emptyTitle")}</p>
        <p className="empty-sub">{t("ui.queueSubview.emptySub")}</p>
      </div>
    );
  }

  const groups = queueGroups(
    queueByRole[roleId] || [],
    runningByRole[roleId] || null,
    locale,
  );
  const queued =
    showAll || groups.queued.length <= SUBVIEW_LIMIT
      ? groups.queued
      : groups.queued.slice(0, SUBVIEW_LIMIT);

  return (
    <div className="queue-subview">
      <button
        type="button"
        className="btn-mini queue-back"
        data-queue-action="back"
        aria-label={origin === "card" ? t("ui.queueSubview.backRole") : t("ui.queueSubview.backWork")}
        onClick={() => {
          queueDrawerFocus(".queue-view-all");
          backFromQueue();
        }}
      >
        <ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" />
        {backText}
      </button>

      <div id="right-queue-body" className="role-work">
        {groups.running.length === 0 && groups.queued.length === 0 ? (
          <div className="muted small">{t("ui.work.emptyQueue")}</div>
        ) : null}
        {groups.running.length > 0 ? (
          <section className="work-section" aria-label={t("ui.work.currentWork")}>
            <h3 className="work-heading">{t("ui.work.currentWork")}</h3>
            <QueuePanel
              roleId={roleId}
              items={groups.running}
              emptyText={t("ui.work.emptyQueue")}
              meta={queueMetaByRole[roleId] || null}
            />
          </section>
        ) : null}
        {groups.queued.length > 0 ? (
          <section
            className="work-section"
            aria-label={t("ui.queueSubview.queued", { count: groups.queued.length })}
          >
            <h3 className="work-heading">
              {t("ui.queueSubview.queued", { count: groups.queued.length })}
            </h3>
            <QueuePanel
              roleId={roleId}
              items={queued}
              emptyText={t("ui.work.emptyQueue")}
              meta={queueMetaByRole[roleId] || null}
            />
            {groups.queued.length > SUBVIEW_LIMIT ? (
              <button
                type="button"
                className="btn-mini q-more"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll
                  ? t("ui.queueSubview.collapse")
                  : t("ui.queueSubview.showAll", { count: groups.queued.length })}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      <span className="sr-only">{roleName}</span>
    </div>
  );
}
