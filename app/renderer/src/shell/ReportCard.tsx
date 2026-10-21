/**
 * 报告卡（Phase 4B）：来源 / 声明 / 任务 / 轮次 / 摘要 / flags / 证据 /
 * 持久化状态 / 来源角色文档 / 独立验收声明。
 *
 * 只呈现主进程事实：不根据助手正文造报告；报告声明不等于独立验收；
 * persistence 未 saved 不显示「已持久化」。持久化更新原位重绘（同一 DOM 节点）。
 */

import { useEffect } from "react";
import { renderMarkdown } from "@/chat/markdown";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { runtimeLabel } from "@/chat/runtime-config";
import {
  asReportRecord,
  asReportText,
  deliveryBatchFacts,
  deliveryBatchTitle,
  persistenceView,
  reportDeclaration,
  reportFlags,
  reportOriginLabel,
  reportPreview,
  reportSourceRecord,
  reportSummaryRecord,
  reportVersionSupported,
  retryLabel,
  RETRY_NOTE,
  safeCopyFlags,
  safeCopyText,
  textFlags,
} from "@/chat/report-view";
import { setDrawerInvoker, useDrawerStore } from "@/stores/drawer-store";
import {
  reportEntryFor,
  useReportStore,
  type ReportScope,
} from "@/stores/report-store";

function markdownHtml(text: string): { __html: string } {
  return { __html: renderMarkdown(text) };
}

function SourceDocumentButton({ roleId }: { roleId: string }) {
  return (
    <button
      type="button"
      className="btn report-source-button"
      onClick={(event) => {
        // 关闭抽屉后焦点回到这个「查看来源角色文档」按钮（旧 documentList(roleId, button) 同义）。
        setDrawerInvoker(event.currentTarget);
        void useDrawerStore.getState().openDocumentList(roleId, "report");
      }}
    >
      查看来源角色文档
    </button>
  );
}

export interface ReportBodyProps {
  report: unknown;
  /** 来源 pane 角色（报告归属；交付批内为报告来源角色）。 */
  roleId: string;
  includeSave: boolean;
  /** 行内 details 开合（仅来源报告卡）。 */
  detailsOpen?: boolean;
  onDetailsToggle?: (open: boolean) => void;
  /** 事件内联的初始保存状态（无 reportId 的 live 报告只作展示，不查询）。 */
  initialPersistence?: unknown;
  scope?: ReportScope;
}

export function ReportBody({
  report,
  roleId,
  includeSave,
  detailsOpen,
  onDetailsToggle,
  initialPersistence,
  scope,
}: ReportBodyProps) {
  const roles = useChatStore((s) => s.roles);
  const entries = useReportStore((s) => s.entries);
  const reportRecord = asReportRecord(report);
  const reportId = asReportText(reportRecord.reportId);
  const supported = reportVersionSupported(report);
  const source = reportSourceRecord(report);
  const summary = reportSummaryRecord(report);
  const full = asReportText(summary.text);
  const preview = reportPreview(full);
  const evidence = Array.isArray(reportRecord.evidence)
    ? (reportRecord.evidence as Array<Record<string, unknown>>)
    : [];
  const flags = reportFlags({
    summary,
    evidence,
    evidenceOmitted: reportRecord.evidenceOmitted,
  });
  const folded = preview.length < Array.from(full).length;
  const sourceRoleId = asReportText(source.roleId);
  const sourceName = sourceRoleId
    ? roleDisplayName(findRole(roles, sourceRoleId)) || sourceRoleId
    : "未知";
  const entry = includeSave ? reportEntryFor(entries, scope || null, "report", reportId) : null;
  const persistence = entry?.state || (includeSave ? asReportRecord(initialPersistence) : {});
  const view = persistenceView(persistence, false);
  const pending = entry?.pending === true;
  const message = pending ? "正在保存报告…" : view.text;
  const retry = view.retry && !!reportId && !!scope;

  useEffect(() => {
    if (!includeSave || !reportId || !scope) return;
    const store = useReportStore.getState();
    store.ensureReport(scope, reportId);
    const current = reportEntryFor(useReportStore.getState().entries, scope, "report", reportId);
    if (current && !current.probed && current.state === null) {
      void store.probeReport(scope, reportId);
    }
  }, [includeSave, reportId, scope]);

  if (!supported) {
    return <p>不支持此报告版本，未生成成果摘要。</p>;
  }

  return (
    <>
      <div className="report-top">
        <div className="report-eyebrow">
          来源 {sourceName} · {reportOriginLabel(reportRecord.origin)}
        </div>
        <h2 className="report-title">任务报告</h2>
        <div className="hb-head">
          <strong>{reportDeclaration(report)}</strong>
        </div>
        <p className="hb-meta">
          {asReportText(source.runtime) ? runtimeLabel(asReportText(source.runtime)) : "引擎未知"}
          {" · "}
          {reportRecord.taskId ? "任务 " + asReportText(reportRecord.taskId) : "任务关联未知"}
          {" · "}
          {asReportText(source.turnId) ? "轮次 " + asReportText(source.turnId) : "轮次未提供"}
        </p>
      </div>
      <div className="report-body">
        <div className="excerpt-label">报告原文摘录</div>
        <div className="hb-summary card-md" dangerouslySetInnerHTML={markdownHtml(preview)} />
        <p className="projection-flags">
          {[flags, folded ? "摘要已折叠，完整可用显示副本见下方" : ""]
            .filter(Boolean)
            .join("；")}
        </p>
        <dl className="report-facts">
          {includeSave ? (
            <div>
              <dt>报告存储</dt>
              <dd>
                <div className="persistence-state" role="status" aria-live="polite">
                  <span className="persistence-message" tabIndex={-1}>
                    {message}
                  </span>
                  {retry ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini persistence-retry"
                      disabled={pending}
                      onClick={() => {
                        if (scope && reportId) {
                          void useReportStore.getState().retryReport(scope, reportId);
                        }
                      }}
                    >
                      {retryLabel(false)}
                    </button>
                  ) : null}
                  {entry?.error ? (
                    <span className="persistence-error">{entry.error}</span>
                  ) : null}
                </div>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>独立验收</dt>
            <dd>尚未确认</dd>
          </div>
        </dl>
        <p className="report-disclaimer">以上为报告或终态记录，不等于独立验收通过。</p>
        <div className="report-actions">
          {sourceRoleId ? <SourceDocumentButton roleId={sourceRoleId} /> : null}
          <details
            className="report-complete"
            open={detailsOpen === true}
            onToggle={(event) => {
              const next = event.currentTarget.open;
              if (next === (detailsOpen === true)) return;
              onDetailsToggle?.(next);
            }}
          >
            <summary>查看完整报告摘要与证据</summary>
            <div className="report-complete-body">
              <div
                className="hb-complete-summary card-md"
                dangerouslySetInnerHTML={markdownHtml(full)}
              />
              <p className="projection-flags">{flags}</p>
              <ul className="hb-evidence">
                {evidence.length === 0 ? (
                  <li>（未提供证据）</li>
                ) : (
                  evidence.map((item, index) => (
                    <li key={index}>
                      {asReportText(item.text)}
                      <small className="projection-flags">{textFlags(item)}</small>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

export interface ReportCardProps {
  report: unknown;
  roleId: string;
  data: Record<string, unknown>;
  detailsOpen: boolean;
  onDetailsToggle: (open: boolean) => void;
}

export function ReportCard({
  report,
  roleId,
  data,
  detailsOpen,
  onDetailsToggle,
}: ReportCardProps) {
  const scope = (data.scope || null) as ReportScope | null;
  return (
    <div
      className={
        "msg-handback" + (asReportRecord(report).status !== "completed" ? " is-blocked" : "")
      }
    >
      <ReportBody
        report={report}
        roleId={roleId}
        includeSave
        detailsOpen={detailsOpen}
        onDetailsToggle={onDetailsToggle}
        initialPersistence={data.persistence}
        scope={scope || undefined}
      />
    </div>
  );
}

export interface DeliveryCardProps {
  data: Record<string, unknown>;
  roleId: string;
  replay?: boolean;
}

export function DeliveryCard({ data, roleId, replay }: DeliveryCardProps) {
  const entries = useReportStore((s) => s.entries);
  const provenance = asReportRecord(data.provenance);
  const presentation = asReportRecord(data.presentation);
  const identity = Object.keys(provenance).length > 0 ? provenance : presentation;
  const reports = Array.isArray(identity.reports) ? identity.reports : [];
  const attemptId = asReportText(identity.attemptId);
  const scope = (data.scope || null) as ReportScope | null;
  const projection = asReportRecord(data.projection);
  const entry = reportEntryFor(entries, scope, "delivery", attemptId);

  useEffect(() => {
    if (!attemptId || !scope) return;
    const store = useReportStore.getState();
    store.ensureDelivery(scope, attemptId);
    const current = reportEntryFor(useReportStore.getState().entries, scope, "delivery", attemptId);
    if (current && !current.probed && current.receipt === null && current.state === null) {
      void store.probeDelivery(scope, attemptId);
    }
  }, [attemptId, scope]);

  const receipt = entry?.receipt || null;
  const stateRecord = asReportRecord(entry?.state);
  const effective =
    stateRecord.history !== undefined
      ? stateRecord
      : receipt
        ? {
            history: asReportRecord(receipt).history,
            retryHistoryAvailable: asReportRecord(receipt).retryHistoryAvailable,
            code: asReportRecord(receipt).code,
          }
        : stateRecord;
  const pending = entry?.pending === true;
  const facts = deliveryBatchFacts(receipt, {
    ...effective,
    ...(pending ? { state: "pending" } : {}),
  });
  const view = persistenceView(effective, true);
  const historyLabel = pending ? "正在保存历史…" : facts.history;
  const retry = view.retry && !!attemptId && !!scope;

  return (
    <div className={"msg msg-injected msg-delivery" + (replay ? " is-replay" : "")}>
      <p>{deliveryBatchTitle(reports.length)}</p>
      <div className="persistence-state" role="status" aria-live="polite">
        <dl className="report-facts delivery-batch-facts">
          <div>
            <dt>接收历史</dt>
            <dd className="persistence-message" tabIndex={-1}>
              {historyLabel}
            </dd>
          </div>
          <div>
            <dt>目标输入记录</dt>
            <dd>{facts.input}</dd>
          </div>
          <div>
            <dt>目标轮次结果</dt>
            <dd>{facts.outcome}</dd>
          </div>
        </dl>
        {retry ? (
          <button
            type="button"
            className="btn btn-ghost btn-mini persistence-retry"
            disabled={pending}
            onClick={() => {
              if (scope && attemptId) {
                void useReportStore.getState().retryHistory(scope, attemptId);
              }
            }}
          >
            {retryLabel(true)}
          </button>
        ) : null}
        {effective.history === "failed" || (view.kind === "err" && retry) ? (
          <p className="muted small">{RETRY_NOTE}</p>
        ) : null}
        {entry?.error ? <p className="persistence-error">{entry.error}</p> : null}
      </div>
      {reports.map((report, index) => (
        <section className="delivery-report" key={index}>
          <ReportBody
            report={report}
            roleId={
              asReportText(asReportRecord(asReportRecord(report).source).roleId) || roleId
            }
            includeSave={false}
            scope={scope || undefined}
          />
        </section>
      ))}
      <details className="safe-input-copy">
        <summary>交接内容（安全显示副本）</summary>
        <p className="projection-flags">{safeCopyFlags(projection)}</p>
        <pre>{safeCopyText(projection, asReportText(data.text))}</pre>
      </details>
    </div>
  );
}
