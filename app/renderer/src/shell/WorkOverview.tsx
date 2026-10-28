/**
 * 工作概览（Phase 4A；2026-10-25 UI/UX 调整）：待处理（定位）/ 当前工作 / 排队 / 最近交付。
 *
 * - 待处理只列真实 `pendingOperator` 快照；「定位」关闭抽屉并聚焦已挂载的 operator 卡
 *   （不自动作答、不切角色/引擎）；完整虚拟行 locator 属 4B。
 * - 队列成员唯一来自 `session:role-state` 快照；工作概览与角色资料共用同一队列组件。
 * - 最近交付只列当前 pane 的真实 handback 行，按报告身份去重；完整报告/persistence 属 4B。
 * - 空态：各区块一张虚线空态卡；全部为空时只显示一张总空态卡，各区块仍保留在 DOM
 *   （hidden）供既有 textContent 契约读取，不新增 `details[data-section]`。
 */

import type { ReactElement, ReactNode } from "react";
import { FileCheck2, Inbox, ListOrdered, MapPin, PlayCircle } from "lucide-react";
import { useChatStore, getRowModel } from "@/chat/chat-store";
import { useUiStore } from "@/stores/ui-store";
import { useDrawerStore } from "@/stores/drawer-store";
import { useDecisionCenterStore } from "@/stores/decision-center-store";
import {
  badgeText,
  isWorkOverviewEmpty,
  pendingViews,
  queueGroups,
  recentHandbacks,
} from "@/chat/work-view";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { QueuePanel } from "@/shell/QueuePanel";
import { BackgroundTasksPanel } from "@/shell/BackgroundTasksPanel";
import { useLocaleState, useT } from "@/i18n";

/** 工作概览只做队列预览：当前工作 + 前 3 条排队；全量在「队列」子视图。 */
const QUEUE_PREVIEW_LIMIT = 3;

function locateRequest(requestId: string): void {
  // E 批：客户决定在独立模态对话框处理；关闭抽屉后打开该卡（不自动作答）。
  useDrawerStore.getState().close({ restoreFocus: false });
  useDecisionCenterStore.getState().open(requestId);
}

function WorkSection({
  icon,
  title,
  ariaLabel,
  badge,
  active,
  dot = true,
  hidden,
  children,
}: {
  icon: ReactElement;
  title: string;
  ariaLabel: string;
  badge?: string;
  active: boolean;
  dot?: boolean;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={"work-section" + (active ? " has-items" : " is-empty")}
      aria-label={ariaLabel}
      hidden={hidden}
    >
      <h3 className="work-heading">
        <span className="work-heading-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="work-heading-label">{title}</span>
        {badge !== undefined ? (
          <span
            className={"work-heading-count" + (active ? " is-active" : "")}
            aria-hidden="true"
          >
            {badge}
          </span>
        ) : null}
        {dot ? (
          <span
            className="work-heading-dot"
            data-active={active ? "true" : "false"}
            aria-hidden="true"
          />
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function WorkEmpty({ text }: { text: string }) {
  return (
    <div className="work-empty">
      <Inbox size={14} strokeWidth={1.5} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
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
  const projectRoot = useChatStore((s) => s.projectRoot);
  const runtime = useUiStore((s) => s.runtime);
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
  void paneVersions; // 行模型变更信号：重渲染最近交付
  const reports = recentHandbacks(rows, locale);
  const allEmpty = isWorkOverviewEmpty(pending.length, groups.total, reports.length);

  return (
    <div className={"work-overview" + (allEmpty ? " is-all-empty" : "")}>
      {allEmpty ? (
        <div className="work-empty-overview" role="status">
          <span className="work-empty-overview-icon" aria-hidden="true">
            <Inbox size={16} strokeWidth={1.5} />
          </span>
          <div className="work-empty-overview-copy">
            <p className="work-empty-overview-title">{t("ui.work.emptyPending")}</p>
            <p className="work-empty-overview-sub">
              {t("ui.work.emptyQueue")} · {t("ui.work.emptyReports")}
            </p>
          </div>
        </div>
      ) : null}

      <div id="right-queue-body" className="role-work" hidden={allEmpty}>
        <WorkSection
          icon={<Inbox size={14} strokeWidth={1.5} />}
          title={t("ui.work.pendingTitle")}
          ariaLabel={
            pending.length > 0
              ? t("ui.work.pending", { count: pending.length })
              : t("ui.work.pendingTitle")
          }
          badge={badgeText(pending.length)}
          active={pending.length > 0}
          dot={false}
        >
          {pending.length === 0 ? (
            <WorkEmpty text={t("ui.work.emptyPending")} />
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
                    <MapPin size={12} strokeWidth={1.5} aria-hidden="true" />
                    {t("ui.decisionDialog.open")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WorkSection>

        <WorkSection
          icon={<PlayCircle size={14} strokeWidth={1.5} />}
          title={t("ui.work.currentWork")}
          ariaLabel={t("ui.work.currentWork")}
          active={groups.running.length > 0}
          hidden={groups.running.length === 0}
        >
          <QueuePanel
            roleId={roleId}
            items={groups.running}
            emptyText={t("ui.work.emptyQueue")}
          />
        </WorkSection>

        <WorkSection
          icon={<ListOrdered size={14} strokeWidth={1.5} />}
          title={t("ui.work.queued")}
          ariaLabel={t("ui.work.queued")}
          active={groups.total > 0}
        >
          {groups.total === 0 ? (
            <WorkEmpty text={t("ui.work.emptyQueue")} />
          ) : (
            <>
              <QueuePanel
                roleId={roleId}
                items={visibleQueued}
                emptyText={t("ui.work.emptyQueue")}
              />
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
            </>
          )}
        </WorkSection>
      </div>


      <BackgroundTasksPanel projectRoot={projectRoot} runtime={runtime} />

      <section
        className={"recent-reports" + (reports.length === 0 ? " is-empty" : "")}
        aria-label={t("ui.work.recentReports")}
        hidden={allEmpty}
      >
        <h3 className="work-heading">
          <span className="work-heading-icon" aria-hidden="true">
            <FileCheck2 size={14} strokeWidth={1.5} />
          </span>
          <span className="work-heading-label">{t("ui.work.recentReports")}</span>
          <span
            className="work-heading-dot"
            data-active={reports.length > 0 ? "true" : "false"}
            aria-hidden="true"
          />
        </h3>
        {reports.length === 0 ? (
          <WorkEmpty text={t("ui.work.emptyReports")} />
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
