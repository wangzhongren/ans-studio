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
  retryNoteText,
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
import { useLocaleState, useT } from "@/i18n";

function markdownHtml(text: string): { __html: string } {
  return { __html: renderMarkdown(text) };
}

function SourceDocumentButton({ roleId }: { roleId: string }) {
  const t = useT();
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
      {t("ui.reportCard.viewSource")}
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
  const flags = reportFlags(
    {
      summary,
      evidence,
      evidenceOmitted: reportRecord.evidenceOmitted,
    },
    locale,
  );
  const folded = preview.length < Array.from(full).length;
  const sourceRoleId = asReportText(source.roleId);
  const sourceName = sourceRoleId
    ? roleDisplayName(findRole(roles, sourceRoleId), locale) || sourceRoleId
    : t("shared.common.unknown");
  const entry = includeSave ? reportEntryFor(entries, scope || null, "report", reportId) : null;
  const persistence = entry?.state || (includeSave ? asReportRecord(initialPersistence) : {});
  const view = persistenceView(persistence, false, locale);
  const pending = entry?.pending === true;
  const message = pending ? t("ui.reportView.savingReport") : view.text;
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
    return <p>{t("ui.reportCard.unsupportedVersion")}</p>;
  }

  return (
    <>
      <div className="report-top">
        <div className="report-eyebrow">
          {t("ui.reportCard.sourceLine", {
            sourceName,
            origin: reportOriginLabel(reportRecord.origin, locale),
          })}
        </div>
        <h2 className="report-title">{t("ui.reportCard.title")}</h2>
        <div className="hb-head">
          <strong>{reportDeclaration(report, locale)}</strong>
        </div>
        <p className="hb-meta">
          {asReportText(source.runtime)
            ? runtimeLabel(asReportText(source.runtime), locale)
            : t("ui.reportCard.runtimeUnknown")}
          {" · "}
          {reportRecord.taskId
            ? t("ui.reportCard.task", { taskId: asReportText(reportRecord.taskId) })
            : t("ui.reportCard.taskUnknown")}
          {" · "}
          {asReportText(source.turnId)
            ? t("ui.reportCard.turn", { turnId: asReportText(source.turnId) })
            : t("ui.reportCard.turnNotProvided")}
        </p>
      </div>
      <div className="report-body">
        <div className="excerpt-label">{t("ui.reportCard.excerptLabel")}</div>
        <div className="hb-summary card-md" dangerouslySetInnerHTML={markdownHtml(preview)} />
        <p className="projection-flags">
          {[flags, folded ? t("ui.reportCard.folded") : ""]
            .filter(Boolean)
            .join(locale === "zh-CN" ? "；" : "; ")}
        </p>
        <dl className="report-facts">
          {includeSave ? (
            <div>
              <dt>{t("ui.reportCard.storage")}</dt>
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
                      {retryLabel(false, locale)}
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
            <dt>{t("ui.reportCard.independentAcceptance")}</dt>
            <dd>{t("ui.reportCard.notConfirmed")}</dd>
          </div>
        </dl>
        <p className="report-disclaimer">{t("ui.reportCard.disclaimer")}</p>
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
            <summary>{t("ui.reportCard.viewFull")}</summary>
            <div className="report-complete-body">
              <div
                className="hb-complete-summary card-md"
                dangerouslySetInnerHTML={markdownHtml(full)}
              />
              <p className="projection-flags">{flags}</p>
              <ul className="hb-evidence">
                {evidence.length === 0 ? (
                  <li>{t("ui.reportCard.noEvidence")}</li>
                ) : (
                  evidence.map((item, index) => (
                    <li key={index}>
                      {asReportText(item.text)}
                      <small className="projection-flags">{textFlags(item, locale)}</small>
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
  const facts = deliveryBatchFacts(
    receipt,
    {
      ...effective,
      ...(pending ? { state: "pending" } : {}),
    },
    locale,
  );
  const view = persistenceView(effective, true, locale);
  const historyLabel = facts.history;
  const retry = view.retry && !!attemptId && !!scope;

  return (
    <div className={"msg msg-injected msg-delivery" + (replay ? " is-replay" : "")}>
      <p>{deliveryBatchTitle(reports.length, locale)}</p>
      <div className="persistence-state" role="status" aria-live="polite">
        <dl className="report-facts delivery-batch-facts">
          <div>
            <dt>{t("ui.reportCard.receiptHistory")}</dt>
            <dd className="persistence-message" tabIndex={-1}>
              {historyLabel}
            </dd>
          </div>
          <div>
            <dt>{t("ui.reportCard.targetInput")}</dt>
            <dd>{facts.input}</dd>
          </div>
          <div>
            <dt>{t("ui.reportCard.targetTurn")}</dt>
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
            {retryLabel(true, locale)}
          </button>
        ) : null}
        {effective.history === "failed" || (view.kind === "err" && retry) ? (
          <p className="muted small">{retryNoteText(locale)}</p>
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
        <summary>{t("shared.common.safeCopyTitle")}</summary>
        <p className="projection-flags">{safeCopyFlags(projection, locale)}</p>
        <pre>{safeCopyText(projection, asReportText(data.text), locale)}</pre>
      </details>
    </div>
  );
}
