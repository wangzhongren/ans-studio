import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { DurableProblem } from "../../../../src/model/durable-workflow.ts";
import { useChatStore } from "@/chat/chat-store";
import {
  getDurableWorkflowBridge,
  pendingDurableStart,
  submitDurableStart,
  type DesktopDurableDefinition,
  type DesktopDurableInstance,
  type DesktopDurableView,
  type DurableWorkflowBridge,
} from "@/chat/ipc";
import { runtimeLabel } from "@/chat/runtime-config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocaleState, useT, type MessageKey } from "@/i18n";
import { useDecisionCenterStore } from "@/stores/decision-center-store";
import { useUiStore } from "@/stores/ui-store";

const controlKeys = {
  stopped: "ui.durableWorkflow.control.stopped",
  starting: "ui.durableWorkflow.control.starting",
  ready: "ui.durableWorkflow.control.ready",
  failed: "ui.durableWorkflow.control.failed",
} satisfies Record<DesktopDurableView["controlPlane"]["state"], MessageKey>;

const engineKeys = {
  pending: "ui.durableWorkflow.engine.pending",
  healthy: "ui.durableWorkflow.engine.healthy",
  offline: "ui.durableWorkflow.engine.offline",
  incompatible: "ui.durableWorkflow.engine.incompatible",
  "history-missing": "ui.durableWorkflow.engine.historyMissing",
} satisfies Record<NonNullable<DesktopDurableInstance["engine"]>, MessageKey>;

const statusKeys: Readonly<Record<string, MessageKey>> = {
  waiting: "ui.durableWorkflow.status.waiting",
  blocked: "ui.durableWorkflow.status.blocked",
  stopped: "ui.durableWorkflow.status.stopped",
  delivered: "ui.durableWorkflow.status.delivered",
  completed: "ui.durableWorkflow.status.completed",
};

const actionKeys: Readonly<Record<string, MessageKey>> = {
  "b1-impact-readonly": "ui.durableWorkflow.action.b1",
  "b1-open-followup-attempt": "ui.durableWorkflow.action.b1Followup",
  "accept-b3-advance-with-b2-scope": "ui.durableWorkflow.action.b2",
  "b3-implement-and-accept": "ui.durableWorkflow.action.b3",
  "b4-customer-merge-main": "ui.durableWorkflow.action.b4",
  "readonly-report": "ui.durableWorkflow.action.readonlyReport",
  "wait-for-review": "ui.durableWorkflow.action.readonlyReview",
};

const approvalKeys: Readonly<Record<string, MessageKey>> = {
  pending: "ui.durableWorkflow.approval.pending",
  approve: "ui.durableWorkflow.approval.approve",
  reject: "ui.durableWorkflow.approval.reject",
};

const evidenceKeys = {
  analysis: "ui.durableWorkflow.evidence.analysis",
  scope: "ui.durableWorkflow.evidence.scope",
  operator: "ui.durableWorkflow.evidence.operator",
  approval: "ui.durableWorkflow.evidence.approval",
} satisfies Record<NonNullable<DesktopDurableInstance["evidence"]>[number]["kind"], MessageKey>;

function detail(problem: Partial<DurableProblem>): string {
  return [problem.code, problem.path, problem.message].filter(Boolean).join(" · ");
}

function Fact({ label, value, wide }: { label: string; value?: string | number; wide?: boolean }) {
  if (value === undefined || value === "") return null;
  return (
    <div className={wide ? "ps-row col-span-full" : "ps-row"}>
      <dt className="ps-secondary">{label}</dt>
      <dd className="ps-primary m-0">{value}</dd>
    </div>
  );
}

function InstanceStatus({ instance }: { instance: DesktopDurableInstance }) {
  const t = useT();
  const locale = useLocaleState((state) => state.locale);
  const runtime = useUiStore((state) => state.runtime);
  const approval = instance.approval;
  const canOpenApproval = useChatStore((state) =>
    approval?.status === "pending" && Boolean(state.pendingOperator[approval.requestId]),
  );
  const statusKey = statusKeys[instance.status];
  const phaseKey = instance.action ? actionKeys[instance.action] : undefined;
  const approvalKey = approval ? approvalKeys[approval.status] : undefined;
  return (
    <>
      <dl className="m-0 grid grid-cols-2 gap-1">
        <Fact label={t("ui.durableWorkflow.instance")} value={instance.instanceId} wide />
        <Fact label={t("ui.durableWorkflow.owner")} value={instance.owner === "dapr" ? "Dapr" : instance.owner} />
        <Fact
          label={t("ui.durableWorkflow.definition")}
          value={instance.definitionName && instance.definitionName !== instance.definitionId
            ? `${instance.definitionName} · ${instance.definitionId}`
            : instance.definitionId}
        />
        <Fact label={t("ui.durableWorkflow.version")} value={instance.definitionVersion} />
        <Fact label={t("ui.durableWorkflow.digest")} value={instance.definitionDigest} wide />
        <Fact label={t("ui.durableWorkflow.phase")} value={phaseKey ? t(phaseKey) : instance.action} wide />
        <Fact
          label={t("ui.durableWorkflow.step")}
          value={instance.stepName === instance.stepId ? instance.stepId : `${instance.stepName} · ${instance.stepId}`}
        />
        <Fact label={t("ui.durableWorkflow.attempt")} value={instance.attempt} />
        <Fact label={t("ui.durableWorkflow.status")} value={statusKey ? t(statusKey) : instance.status} />
        <Fact label={t("ui.durableWorkflow.engine")} value={instance.engine ? t(engineKeys[instance.engine]) : undefined} />
        <Fact label={t("ui.durableWorkflow.waiting")} value={instance.waiting} wide />
        <Fact label={t("ui.durableWorkflow.blocked")} value={instance.blockedReason} wide />
        {approval ? (
          <Fact
            label={t("ui.durableWorkflow.approval")}
            value={`${approvalKey ? t(approvalKey) : approval.status} · ${approval.requestId}`}
            wide
          />
        ) : null}
      </dl>
      {approval && canOpenApproval ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => useDecisionCenterStore.getState().open(approval.requestId)}
        >
          {t("ui.durableWorkflow.openApproval")}
        </Button>
      ) : null}
      {approval?.status === "pending" && !canOpenApproval && instance.runtime && instance.runtime !== runtime ? (
        <p className="ps-note">{t("ui.durableWorkflow.approvalRuntime", { runtime: runtimeLabel(instance.runtime, locale) })}</p>
      ) : null}
      {instance.evidence?.length ? (
        <details className="ps-details">
          <summary>{t("ui.durableWorkflow.evidence")}</summary>
          <dl className="ps-list">
            {instance.evidence.map(({ kind, sha256 }) => (
              <Fact key={kind} label={t(evidenceKeys[kind])} value={sha256} />
            ))}
          </dl>
        </details>
      ) : null}
    </>
  );
}

function WorkflowStartForm({
  bridge,
  projectRoot,
  refreshVersion,
  onStarted,
}: {
  bridge: DurableWorkflowBridge;
  projectRoot: string;
  refreshVersion: number;
  onStarted: (view: DesktopDurableView) => void;
}) {
  const t = useT();
  const definitionLabelId = useId();
  const summaryLabelId = useId();
  const [definitions, setDefinitions] = useState<DesktopDurableDefinition[]>();
  const [listError, setListError] = useState<true | DurableProblem>();
  const [selectedFile, setSelectedFile] = useState("");
  const [pending, setPending] = useState(() => pendingDurableStart(projectRoot));
  const [summary, setSummary] = useState(pending?.summary ?? "");
  const [validated, setValidated] = useState<DesktopDurableDefinition>();
  const [error, setError] = useState<true | DurableProblem>();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const busyLock = useRef(false);
  const listRevision = useRef(0);
  const selected = definitions?.find(({ file }) => file === selectedFile);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    listRevision.current += 1;
    setDefinitions(undefined);
    setValidated(undefined);
    setListError(undefined);
    setError(undefined);
    void bridge.listDurableWorkflows({ projectRoot }).then((result) => {
      if (!current) return;
      if (result.ok) setDefinitions(result.value.definitions);
      else setListError(result);
    }).catch(() => {
      if (current) setListError(true);
    });
    return () => { current = false; };
  }, [bridge, projectRoot, refreshVersion]);

  const validate = async () => {
    if (!selected || busyLock.current || pending) return;
    const revision = listRevision.current;
    busyLock.current = true;
    setBusy(true);
    setError(undefined);
    setValidated(undefined);
    try {
      const result = await bridge.validateDurableWorkflow({ projectRoot, definitionId: selected.id });
      if (!mounted.current || revision !== listRevision.current) return;
      if (!result.ok) setError(result);
      else if (result.value.error) setError(result.value.error);
      else setValidated(result.value);
    } catch {
      if (mounted.current && revision === listRevision.current) setError(true);
    } finally {
      busyLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const start = async () => {
    const draft = pending ?? (validated && summary.trim()
      ? { projectRoot, definitionId: validated.id, summary: summary.trim() }
      : undefined);
    if (!draft || busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await submitDurableStart(bridge, draft);
      if (!mounted.current) return;
      if (result.ok) {
        setSummary("");
        setValidated(undefined);
        setSelectedFile("");
        onStarted(result.value);
      } else {
        setError(result);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      busyLock.current = false;
      if (mounted.current) {
        setPending(pendingDurableStart(projectRoot));
        setBusy(false);
      }
    }
  };

  const issue = error || listError;
  const definition = validated ?? selected;
  return (
    <form
      className="ps-section"
      aria-label={t("ui.durableWorkflow.start")}
      aria-busy={busy}
      onSubmit={(event) => { event.preventDefault(); void start(); }}
    >
      {issue ? (
        <p className="ps-error break-all" role="alert">
          {issue === true ? t("ui.durableWorkflow.requestError") : detail(issue)}
        </p>
      ) : null}
      {pending ? (
        <p className="ps-note" role="status">{t("ui.durableWorkflow.startUnknown")}</p>
      ) : null}
      {!pending && definitions?.length === 0 ? (
        <p className="ps-note">{t("ui.durableWorkflow.none")}</p>
      ) : null}
      {!pending && !definitions && !listError ? (
        <p className="ps-note" role="status">{t("ui.durableWorkflow.loading")}</p>
      ) : null}
      {pending ? (
        <dl className="ps-list"><Fact label={t("ui.durableWorkflow.definition")} value={pending.definitionId} /></dl>
      ) : definitions?.length ? (
        <>
          <label className="ps-heading" htmlFor={definitionLabelId}>{t("ui.durableWorkflow.definition")}</label>
          <select
            id={definitionLabelId}
            className="role-log-select max-w-full"
            value={selectedFile}
            disabled={busy}
            onChange={(event) => {
              setSelectedFile(event.target.value);
              setValidated(undefined);
              setError(undefined);
            }}
          >
            <option value="">{t("ui.durableWorkflow.choose")}</option>
            {definitions.map(({ id, file }) => <option key={file} value={file}>{id} · {file}</option>)}
          </select>
          {definition?.error && !error ? (
            <p className="ps-error break-all" role="alert">{detail(definition.error)}</p>
          ) : null}
          {definition && !definition.error ? (
            <dl className="ps-list">
              <Fact label={t("ui.durableWorkflow.version")} value={definition.version} />
              <Fact label={t("ui.durableWorkflow.digest")} value={definition.digest} />
            </dl>
          ) : null}
          {validated ? <p className="ps-note" role="status">{t("ui.durableWorkflow.validated")}</p> : null}
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={!selected || busy} onClick={() => void validate()}>
            {t("ui.durableWorkflow.validate")}
          </Button>
        </>
      ) : null}
      {pending || definitions?.length ? (
        <>
          <label className="ps-heading" htmlFor={summaryLabelId}>{t("ui.durableWorkflow.summary")}</label>
          <Textarea
            id={summaryLabelId}
            value={pending?.summary ?? summary}
            disabled={Boolean(pending) || busy}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={12_000}
            rows={3}
          />
          <Button type="submit" size="sm" className="self-start" disabled={busy || (!pending && (!validated || !summary.trim()))}>
            {t(pending ? "ui.durableWorkflow.retryStart" : "ui.durableWorkflow.start")}
          </Button>
        </>
      ) : null}
    </form>
  );
}

export function DurableWorkflowPanel({ projectRoot }: { projectRoot: string }) {
  const t = useT();
  const drawerOpen = useUiStore((state) => state.drawerOpen);
  const instanceLabelId = useId();
  const bridge = getDurableWorkflowBridge();
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [view, setView] = useState<DesktopDurableView>();
  const [projectionError, setProjectionError] = useState<true | DurableProblem>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [query, setQuery] = useState({ instanceId: "" });
  const [instanceInput, setInstanceInput] = useState("");
  const { instanceId } = query;

  useEffect(() => {
    if (!bridge || !expanded || !drawerOpen) return;
    let timer: number | undefined;
    let current = true;
    const refresh = async () => {
      try {
        const result = await bridge.getDurableWorkflowProjection({ projectRoot, instanceId: query.instanceId || undefined });
        if (!current) return;
        if (result.ok) {
          setView(result.value);
          setProjectionError(undefined);
        } else {
          setProjectionError(result);
        }
      } catch {
        if (current) setProjectionError(true);
      } finally {
        if (current) timer = window.setTimeout(() => void refresh(), 2_000);
      }
    };
    void refresh();
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [bridge, expanded, drawerOpen, projectRoot, query, refreshVersion]);

  if (!bridge) return null;

  const changeInstance = (id: string) => {
    if (id !== instanceId) setView(undefined);
    setProjectionError(undefined);
    setQuery({ instanceId: id });
  };
  const control = view?.controlPlane;

  return (
    <details
      className="project-state"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      data-durable-workflow
    >
      <summary className="ps-title cursor-pointer">{t("ui.durableWorkflow.title")}</summary>
      {expanded ? (
        <>
          <div className="ps-tools">
            <p className="ps-readonly">{t("ui.durableWorkflow.readonly")}</p>
            <button type="button" className="ps-refresh" onClick={() => setRefreshVersion((value) => value + 1)}>
              <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
              {t("ui.projectState.refresh")}
            </button>
          </div>
          {projectionError ? (
            <p className="ps-error break-all" role="status">
              {projectionError === true ? t("ui.durableWorkflow.statusError") : detail(projectionError)}
            </p>
          ) : null}
          {control ? (
            <dl className="ps-list">
              <Fact label={t("ui.durableWorkflow.control")} value={t(controlKeys[control.state])} />
            </dl>
          ) : null}
          {control?.code || control?.message ? (
            <p className="ps-error break-all" role="status">{detail(control)}</p>
          ) : null}
          {view?.instance ? <InstanceStatus instance={view.instance} /> : null}
          {view && !view.instance ? (
            <p className="ps-note" role="status">{t(instanceId ? "ui.durableWorkflow.notFound" : "ui.durableWorkflow.empty")}</p>
          ) : null}
          {!view && !projectionError ? <p className="ps-note" role="status">{t("ui.durableWorkflow.loading")}</p> : null}

          <form
            className="ps-section"
            aria-label={t("ui.durableWorkflow.find")}
            onSubmit={(event) => { event.preventDefault(); changeInstance(instanceInput.trim()); }}
          >
            <label className="ps-heading" htmlFor={instanceLabelId}>{t("ui.durableWorkflow.instance")}</label>
            <input
              id={instanceLabelId}
              className="role-log-select px-2"
              maxLength={160}
              value={instanceInput}
              onChange={(event) => setInstanceInput(event.target.value)}
            />
            <div className="ps-tools">
              <Button type="submit" variant="outline" size="sm" disabled={!instanceInput.trim()}>
                {t("ui.durableWorkflow.find")}
              </Button>
              {instanceId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setInstanceInput(""); changeInstance(""); }}>
                  {t("ui.durableWorkflow.latest")}
                </Button>
              ) : null}
            </div>
          </form>

          <label className="ps-primary flex items-start gap-2">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            {t("ui.durableWorkflow.enable")}
          </label>
          {enabled && drawerOpen ? (
            <WorkflowStartForm
              bridge={bridge}
              projectRoot={projectRoot}
              refreshVersion={refreshVersion}
              onStarted={(startedView) => {
                const id = startedView.instance?.instanceId ?? "";
                setQuery({ instanceId: id });
                setInstanceInput(id);
                setView(startedView);
                setProjectionError(undefined);
              }}
            />
          ) : null}
        </>
      ) : null}
    </details>
  );
}
