/**
 * 项目状态（project-state/v1，A4）：任务中心顶部的只读聚合区。
 *
 * 唯一数据入口是 preload 的 `getProjectState({projectRoot})`（IPC `project-state:get`）；
 * 解析/视图函数在 `lib/platform.ts`（纯函数，Node 可测）。本组件只渲染，不扫描文件、
 * 不重算计数、不实现第二套任务状态判定；写操作仍走任务中心/幕僚工具。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { useT } from "@/i18n";
import type { Translator } from "@/i18n";
import {
  asProjectStateView,
  getDesktopBridge,
  projectStateDetailsView,
  projectStateSummaryView,
} from "@/lib/platform";
import type {
  ProjectStateDetailsView,
  ProjectStateFlowRow,
  ProjectStateRow,
  ProjectStateSummaryView,
  ProjectStateView,
} from "@/lib/platform";

type LoadIssue = "" | "unavailable" | "schema" | "error";

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function RowList({ rows, t }: { rows: ProjectStateRow[]; t: Translator }) {
  if (rows.length === 0) {
    return <p className="ps-empty">{t("shared.common.none")}</p>;
  }
  return (
    <ul className="ps-list">
      {rows.map((row) => (
        <li className="ps-row" key={row.id}>
          <span className="ps-primary">{row.primary}</span>
          {row.secondary ? <span className="ps-secondary">{row.secondary}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function FlowList({ flows, t }: { flows: ProjectStateFlowRow[]; t: Translator }) {
  if (flows.length === 0) {
    return <p className="ps-empty">{t("shared.common.none")}</p>;
  }
  return (
    <ul className="ps-list">
      {flows.map((flow) => (
        <li
          className="ps-row"
          key={flow.flowId}
          data-superseded={flow.superseded ? "true" : "false"}
        >
          <span className="ps-primary">{flow.flowId}</span>
          <span className="ps-secondary">{flow.runsText}</span>
          {flow.runs.length > 0 ? (
            <ul className="ps-runs">
              {flow.runs.map((run) => (
                <li
                  key={run.runId}
                  data-run-id={run.runId}
                  data-active={run.active ? "true" : "false"}
                >
                  {run.runId} · {run.label}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ps-section" aria-label={title}>
      <h4 className="ps-heading">{title}</h4>
      {children}
    </section>
  );
}

export function ProjectStatePanel() {
  const t = useT();
  const projectRoot = useChatStore((s) => s.projectRoot);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const [view, setView] = useState<ProjectStateView | null>(null);
  const [issue, setIssue] = useState<LoadIssue>("");
  const [errorDetail, setErrorDetail] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!projectRoot) {
      setView(null);
      setIssue("");
      setErrorDetail("");
      setLoading(false);
      return;
    }
    if (!bridge?.getProjectState) {
      setView(null);
      setIssue("unavailable");
      setErrorDetail("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorDetail("");
    try {
      const parsed = asProjectStateView(
        await bridge.getProjectState({ projectRoot }),
      );
      if (!parsed) {
        setView(null);
        setIssue("schema");
      } else {
        setView(parsed);
        setIssue("");
      }
    } catch (error) {
      setView(null);
      setIssue("error");
      setErrorDetail(asMessage(error));
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void refresh();
    // paneVersions 变化提示任务/申请状态可能更新；与任务中心共用刷新信号，不额外轮询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, paneVersions]);

  const summary: ProjectStateSummaryView | null = useMemo(
    () => (view ? projectStateSummaryView(view, t) : null),
    [view, t],
  );
  const details: ProjectStateDetailsView | null = useMemo(
    () => (view ? projectStateDetailsView(view, t) : null),
    [view, t],
  );

  return (
    <section className="project-state" aria-label={t("ui.projectState.title")}>
      <div className="ps-tools">
        <span className="ps-title">{t("ui.projectState.title")}</span>
        <button
          type="button"
          className="ps-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
          {t("ui.projectState.refresh")}
        </button>
      </div>

      {!projectRoot ? (
        <p className="ps-empty">{t("ui.projectState.empty")}</p>
      ) : null}
      {projectRoot && issue === "unavailable" ? (
        <p className="ps-empty">{t("ui.projectState.unavailable")}</p>
      ) : null}
      {projectRoot && issue === "schema" ? (
        <p className="ps-empty">{t("ui.projectState.schemaUnsupported")}</p>
      ) : null}
      {projectRoot && issue === "error" ? (
        <p className="ps-error" role="alert">
          {t("ui.projectState.loadError", { detail: errorDetail })}
        </p>
      ) : null}
      {projectRoot && !view && issue === "" && !loading ? (
        <p className="ps-empty">{t("ui.projectState.empty")}</p>
      ) : null}

      {view && summary && details ? (
        <>
          <p className={summary.stale ? "ps-focus is-stale" : "ps-focus"}>
            {summary.focusLine}
          </p>
          <div className="ps-badges">
            {summary.badges.map((badge) => (
              <span className="ps-badge" data-badge={badge.key} key={badge.key}>
                {badge.text}
              </span>
            ))}
          </div>
          {summary.pinned ? (
            <p className="ps-pinned-hint">{t("ui.projectState.pinnedHint")}</p>
          ) : null}
          <p className="ps-readonly">{summary.readOnlyLabel}</p>

          {details.truncated ? (
            <p className="ps-note">{t("ui.projectState.truncated")}</p>
          ) : null}
          {details.errors.length > 0 ? (
            <div className="ps-errors">
              <p className="ps-error" role="status">
                {t("ui.projectState.errors", { count: details.errors.length })}
              </p>
              <ul className="ps-list">
                {details.errors.map((message, index) => (
                  <li className="ps-row" key={`${index}:${message}`}>
                    <span className="ps-secondary">{message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="ps-details">
            <summary>{t("ui.projectState.title")}</summary>
            <Section title={t("ui.projectState.section.flows")}>
              <FlowList flows={details.flows} t={t} />
            </Section>
            <Section title={t("ui.projectState.section.tasks")}>
              <RowList rows={details.tasks} t={t} />
            </Section>
            <Section title={t("ui.projectState.section.blockers")}>
              <RowList rows={details.blockers} t={t} />
            </Section>
            <Section title={t("ui.projectState.section.versions")}>
              <RowList rows={details.versions} t={t} />
            </Section>
            <Section title={t("ui.projectState.section.evidence")}>
              <RowList rows={details.evidence} t={t} />
            </Section>
            <Section title={t("ui.projectState.section.nextStep")}>
              {details.nextStep ? (
                <>
                  <p className="ps-primary">{details.nextStep.text}</p>
                  <p className="ps-secondary">{details.nextStep.source}</p>
                </>
              ) : (
                <p className="ps-empty">{t("shared.common.none")}</p>
              )}
            </Section>
          </details>
        </>
      ) : null}
    </section>
  );
}
