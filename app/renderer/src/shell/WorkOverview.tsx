/**
 * 工作概览（Phase 4A）：待处理（定位）/ 当前工作 / 排队 / 最近回交。
 *
 * - 待处理只列真实 `pendingOperator` 快照；「定位」关闭抽屉并聚焦已挂载的 operator 卡
 *   （不自动作答、不切角色/引擎）；完整虚拟行 locator 属 4B。
 * - 队列成员唯一来自 `session:role-state` 快照；工作概览与角色资料共用同一队列组件。
 * - 最近回交只列当前 pane 的真实 handback 行，按报告身份去重；完整报告/persistence 属 4B。
 */

import type { ReactElement } from "react";
import { AlertCircle, ArrowDownToLine, CheckSquare } from "lucide-react";
import { useChatStore, getRowModel } from "@/chat/chat-store";
import { useUiStore } from "@/stores/ui-store";
import { useDrawerStore } from "@/stores/drawer-store";
import {
  pendingViews,
  queueGroups,
  recentHandbacks,
} from "@/chat/work-view";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { QueuePanel } from "@/shell/QueuePanel";
import { useLocaleState, useT } from "@/i18n";

/** 工作概览只做队列预览：当前工作 + 前 3 条排队；全量在「队列」子视图。 */
const QUEUE_PREVIEW_LIMIT = 3;

function locateRequest(requestId: string): void {
  // 关闭抽屉（右抽屉状态同步清空；不恢复触发按钮焦点，焦点给原卡）。
  useDrawerStore.getState().close({ restoreFocus: false });
  // 抽屉关闭的 React effect 稍后才摘背景 inert；先同步摘除，否则卡片 focus() 会被浏览器拒绝。
  document.querySelector(".col-left")?.removeAttribute("inert");
  document.querySelector(".col-mid")?.removeAttribute("inert");
  const card = document.querySelector<HTMLElement>(
    '[data-request-id="' + CSS.escape(requestId) + '"]',
  );
  if (!card) return; // 未挂载：4B 的虚拟行 locator；4A 不做假滚动。
  card.removeAttribute("inert");
  if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
  card.scrollIntoView({ block: "center" });
  card.focus({ preventScroll: true });
}

function emptyLine(text: string): ReactElement {
  return <p className="muted small">{text}</p>;
}

export function WorkOverview({ roleId }: { roleId: string | null }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const roles = useChatStore((s) => s.roles);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const runningByRole = useChatStore((s) => s.runningByRole);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const openQueue = useDrawerStore((s) => s.openQueue);
  const role = findRole(roles, roleId);
  const roleName = role ? roleDisplayName(role, locale) : t("ui.role.noneSelected");

  if (!roleId || !role) {
    return (
      <div className="right-empty">
        <p className="empty-title">{t("ui.work.emptyTitle")}</p>
        <p className="empty-sub">{t("ui.work.emptySub")}</p>
      </div>
    );
  }

  const pending = pendingViews(pendingOperator, roleId, locale);
  const groups = queueGroups(queueByRole[roleId] || [], runningByRole[roleId] || null, locale);
  const visibleQueued = groups.queued.slice(0, QUEUE_PREVIEW_LIMIT);
  const rows = getRowModel(roleId)?.rows || [];
  void paneVersions; // 行模型变更信号：重渲染最近回交
  const reports = recentHandbacks(rows, locale);

  return (
    <div className="work-overview">
      <div id="right-queue-body" className="role-work">
        <section
          className="work-section"
          aria-label={t("ui.work.pending", { count: pending.length })}
        >
          <h3 className="work-heading">
            <CheckSquare size={13} strokeWidth={1.5} aria-hidden="true" />
            {t("ui.work.pending", { count: pending.length })}
          </h3>
          {pending.length === 0 ? (
            emptyLine(t("ui.work.emptyPending"))
          ) : (
            <ul className="pending-requests">
              {pending.map((item) => (
                <li key={item.id}>
                  <span className="pending-kind">{item.kindLabel}</span>
                  <span className="pending-title">{item.title}</span>
                  <button
                    type="button"
                    className="btn-mini pending-locate"
                    data-request-id={item.requestId}
                    title={t("ui.work.locateTitle")}
                    onClick={() => locateRequest(item.requestId)}
                  >
                    {t("ui.work.locate")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="work-section"
          aria-label={t("ui.work.currentWork")}
          hidden={groups.running.length === 0}
        >
          <h3 className="work-heading">
            <ArrowDownToLine size={13} strokeWidth={1.5} aria-hidden="true" />
            {t("ui.work.currentWork")}
          </h3>
          <QueuePanel roleId={roleId} items={groups.running} emptyText={t("ui.work.emptyQueue")} />
        </section>

        <section className="work-section" aria-label={t("ui.work.queued")}>
          <h3 className="work-heading">
            <AlertCircle size={13} strokeWidth={1.5} aria-hidden="true" />
            {t("ui.work.queued")}
          </h3>
          <QueuePanel roleId={roleId} items={visibleQueued} emptyText={t("ui.work.emptyQueue")} />
          {groups.total > QUEUE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-mini q-more queue-view-all"
              aria-label={t("ui.work.viewAllQueueAria", { count: groups.total })}
              onClick={(event) => openQueue("work", event.currentTarget)}
            >
              {t("ui.work.viewAllQueue", { count: groups.total })}
            </button>
          ) : null}
        </section>
      </div>

      <section className="recent-reports" aria-label={t("ui.work.recentReports")}>
        <h3 className="work-heading">{t("ui.work.recentReports")}</h3>
        {reports.length === 0 ? (
          emptyLine(t("ui.work.emptyReports"))
        ) : (
          reports.map((report) => (
            <div className="recent-report" key={report.key} data-report-identity={report.key}>
              <p className="recent-report-declaration">{report.declaration}</p>
              <p className="recent-report-summary">{report.summary}</p>
              {report.flags ? (
                <small className="projection-flags">{report.flags}</small>
              ) : null}
            </div>
          ))
        )}
      </section>

      <span className="sr-only">{roleName}</span>
    </div>
  );
}
