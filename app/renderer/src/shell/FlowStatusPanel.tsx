/**
 * 流程状态区块（2026-10-25）：工作概览抽屉内的只读 `docs/flows/*.yaml` 进度视图。
 *
 * - 仅在抽屉打开且区块可见时每 5s 拉一次；关闭即清理。
 * - 七态状态 chip + 四类 kind；默认只显示未完成 + current，可展开全部。
 * - 坏文件在 errors 单独列出，不阻断其他流程；方法缺失/旧 preload 显示 unavailable。
 */

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, GitBranch, RefreshCw } from "lucide-react";
import {
  flowBadgeView,
  loadFlowStatus,
  startFlowStatusPolling,
  type FlowStatusModel,
  type FlowStepView,
  type FlowView,
} from "@/chat/flow-status";
import { BusySpinner } from "@/chat/BusySpinner";
import { getDesktopBridge } from "@/lib/platform";
import { useFlowStatusStore } from "@/stores/flow-status-store";
import { useUiStore } from "@/stores/ui-store";
import { useLocaleState, useT } from "@/i18n";

function FlowState({ step }: { step: FlowStepView }) {
  return (
    <span className={"flow-state " + step.statusClass}>{step.statusLabel}</span>
  );
}

function FlowStepLine({ step }: { step: FlowStepView }) {
  const t = useT();
  return (
    <li className="flow-step" data-step-id={step.id} data-state={step.status}>
      <FlowState step={step} />
      <span className="flow-step-title">{step.title}</span>
      {step.kind ? (
        <span className="flow-kind">{step.kindLabel}</span>
      ) : null}
      {step.owner ? (
        <span className="flow-owner">
          {t("ui.flow.owner")} {step.owner}
        </span>
      ) : null}
    </li>
  );
}

function FlowCard({
  flow,
  expanded,
  onToggle,
}: {
  flow: FlowView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const steps = expanded ? flow.steps : flow.visibleSteps;
  return (
    <div className="flow-card" data-flow-id={flow.flowId}>
      <div className="flow-head">
        <code className="flow-id">{flow.flowId}</code>
        <span className="flow-progress-text">{flow.progressText}</span>
        {flow.updatedAtText ? (
          <span className="flow-updated">
            {t("ui.flow.updatedAt")} {flow.updatedAtText}
          </span>
        ) : null}
      </div>
      <div
        className="flow-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(flow.progressPercent)}
        aria-label={flow.progressText}
      >
        <span
          className="flow-progress-fill"
          style={{ width: flow.progressPercent + "%" }}
        />
      </div>

      <div className="flow-current-block">
        <span className="flow-section-label">{t("ui.flow.current")}</span>
        {flow.currentSteps.length === 0 ? (
          <span className="flow-muted">{t("shared.common.none")}</span>
        ) : (
          <ul className="flow-current-steps">
            {flow.currentSteps.map((step) => (
              <li className="flow-current-step" key={step.id}>
                <FlowState step={step} />
                <span className="flow-step-title">{step.title}</span>
                {step.owner ? (
                  <span className="flow-owner">
                    {t("ui.flow.owner")} {step.owner}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="flow-steps">
        {steps.length === 0 ? (
          <li className="flow-muted">{t("shared.common.none")}</li>
        ) : (
          steps.map((step) => <FlowStepLine step={step} key={step.id} />)
        )}
      </ul>

      {flow.hasDoneSteps ? (
        <button
          type="button"
          className="btn-mini flow-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? t("ui.flow.hideAll") : t("ui.flow.showAll")}
        </button>
      ) : null}
    </div>
  );
}

export function FlowStatusPanel({
  projectRoot,
}: {
  projectRoot: string | null;
}) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const [model, setModel] = useState<FlowStatusModel>({ kind: "loading" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const next = await loadFlowStatus(
      getDesktopBridge(),
      projectRoot || "",
      locale,
    );
    setModel(next);
  }, [projectRoot, locale]);

  useEffect(() => {
    if (!drawerOpen) return;
    return startFlowStatusPolling(() => {
      void refresh();
    }, 5000);
  }, [drawerOpen, refresh]);

  useEffect(() => {
    useFlowStatusStore.getState().setBadge(flowBadgeView(model, locale));
  }, [model, locale]);

  const flows = model.kind === "ready" ? model.flows : [];
  const errors = model.kind === "ready" ? model.errors : [];

  return (
    <section
      className="work-section flow-status"
      aria-label={t("ui.flow.title")}
      aria-busy={model.kind === "loading" ? "true" : undefined}
    >
      <h3 className="work-heading">
        <span className="work-heading-icon" aria-hidden="true">
          <GitBranch size={14} strokeWidth={1.5} />
        </span>
        <span className="work-heading-label">{t("ui.flow.title")}</span>
        <button
          type="button"
          className="btn-mini flow-refresh"
          title={t("ui.flow.refresh")}
          aria-label={t("ui.flow.refresh")}
          onClick={() => void refresh()}
        >
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
          {t("ui.flow.refresh")}
        </button>
      </h3>

      {model.kind === "loading" ? (
        <div className="work-empty flow-note" aria-busy="true">
          <BusySpinner />
        </div>
      ) : null}

      {model.kind === "unavailable" ? (
        <div className="work-empty flow-unavailable" role="status">
          <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("main.flowStatus.unavailable")}</span>
        </div>
      ) : null}

      {model.kind === "error" ? (
        <div className="flow-load-error" role="status">
          <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {t("ui.flow.loadFailed", { detail: model.detail })}
          </span>
        </div>
      ) : null}

      {model.kind === "ready" && flows.length === 0 ? (
        <div className="work-empty flow-empty">
          <GitBranch size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("ui.flow.empty")}</span>
        </div>
      ) : null}

      {flows.map((flow) => (
        <FlowCard
          flow={flow}
          expanded={expanded[flow.flowId] === true}
          key={flow.flowId}
          onToggle={() =>
            setExpanded((previous) => ({
              ...previous,
              [flow.flowId]: !previous[flow.flowId],
            }))
          }
        />
      ))}

      {errors.length > 0 ? (
        <div className="flow-errors" role="status">
          {errors.map((error, index) => (
            <p className="flow-error-line" key={error.file + ":" + index}>
              {t("ui.flow.parseError", {
                file: error.file,
                detail: error.detail,
              })}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
