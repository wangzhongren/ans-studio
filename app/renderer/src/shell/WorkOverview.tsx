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
  QUEUE_EMPTY_TEXT,
  RECENT_REPORTS_EMPTY,
  WORK_EMPTY_PENDING,
} from "@/chat/work-view";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { QueuePanel } from "@/shell/QueuePanel";

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
  const roles = useChatStore((s) => s.roles);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const runningByRole = useChatStore((s) => s.runningByRole);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const openQueue = useDrawerStore((s) => s.openQueue);
  const role = findRole(roles, roleId);
  const roleName = role ? roleDisplayName(role) : "未选择角色";

  if (!roleId || !role) {
    return (
      <div className="right-empty">
        <p className="empty-title">选择角色后查看工作概览</p>
        <p className="empty-sub">先在左侧选择角色，再打开工作概览；内容跟随当前角色。</p>
      </div>
    );
  }

  const pending = pendingViews(pendingOperator, roleId);
  const groups = queueGroups(queueByRole[roleId] || [], runningByRole[roleId] || null);
  const visibleQueued = groups.queued.slice(0, QUEUE_PREVIEW_LIMIT);
  const rows = getRowModel(roleId)?.rows || [];
  void paneVersions; // 行模型变更信号：重渲染最近回交
  const reports = recentHandbacks(rows);

  return (
    <div className="work-overview">
      <div id="right-queue-body" className="role-work">
        <section className="work-section" aria-label={"待处理 " + pending.length}>
          <h3 className="work-heading">
            <CheckSquare size={13} strokeWidth={1.5} aria-hidden="true" />
            待处理 {pending.length}
          </h3>
          {pending.length === 0 ? (
            emptyLine(WORK_EMPTY_PENDING)
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
                    title="定位到原交互卡（不会自动作答）"
                    onClick={() => locateRequest(item.requestId)}
                  >
                    定位
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="work-section"
          aria-label="当前工作"
          hidden={groups.running.length === 0}
        >
          <h3 className="work-heading">
            <ArrowDownToLine size={13} strokeWidth={1.5} aria-hidden="true" />
            当前工作
          </h3>
          <QueuePanel roleId={roleId} items={groups.running} emptyText={QUEUE_EMPTY_TEXT} />
        </section>

        <section className="work-section" aria-label="排队">
          <h3 className="work-heading">
            <AlertCircle size={13} strokeWidth={1.5} aria-hidden="true" />
            排队
          </h3>
          <QueuePanel roleId={roleId} items={visibleQueued} emptyText={QUEUE_EMPTY_TEXT} />
          {groups.total > QUEUE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-mini q-more queue-view-all"
              aria-label={"查看全部队列（" + groups.total + " 项）"}
              onClick={(event) => openQueue("work", event.currentTarget)}
            >
              查看全部队列（{groups.total}）
            </button>
          ) : null}
        </section>
      </div>

      <section className="recent-reports" aria-label="最近回交">
        <h3 className="work-heading">最近回交</h3>
        {reports.length === 0 ? (
          emptyLine(RECENT_REPORTS_EMPTY)
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
