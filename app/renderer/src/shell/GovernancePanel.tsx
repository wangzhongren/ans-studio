/**
 * 治理状态行 + 非模态预览面板（Phase 4B；宿主 = ChatHeader）。
 *
 * `#governance-status` 只读状态 + 动作；`#governance-preview` 唯一、非模态
 * （无 backdrop/无焦点陷阱）、Esc 回触发。预览零写入；确认才写；失败按 phase 如实。
 */

import { useEffect, useRef, type MouseEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import {
  changedEntries,
  governanceActionFor,
  governanceInvalidText,
  governanceMissingText,
  governanceModelStatusText,
  governanceMigrationButtonView,
  governanceModelSuggestText,
  governanceModelUnwiredText,
  governancePinMismatchText,
  projectRoleCount,
  governanceModelOptionText,
} from "@/chat/governance-view";
import { getDesktopBridge } from "@/lib/platform";
import { useGovernanceStore } from "@/stores/governance-store";
import { useLocaleState, useT } from "@/i18n";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function GovernancePanel() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const hasRoles = useChatStore((s) => s.hasRoles);
  const roles = useChatStore((s) => s.roles);
  const governanceModel = useChatStore((s) => s.governanceModel);
  const governanceRecord = useChatStore((s) => s.governanceRecord);
  const open = useGovernanceStore((s) => s.open);
  const mode = useGovernanceStore((s) => s.mode);
  const loading = useGovernanceStore((s) => s.loading);
  const busy = useGovernanceStore((s) => s.busy);
  const canConfirm = useGovernanceStore((s) => s.canConfirm);
  const reaccept = useGovernanceStore((s) => s.reaccept);
  const establish = useGovernanceStore((s) => s.establish);
  const migration = useGovernanceStore((s) => s.migration);
  const result = useGovernanceStore((s) => s.result);
  const error = useGovernanceStore((s) => s.error);
  const modelChoice = useGovernanceStore((s) => s.modelChoice);
  const nextStep = useGovernanceStore((s) => s.nextStep);
  const previewRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  const record = asRecord(governanceRecord);
  const recordState = asString(record.state);
  const action = projectRoot
    ? governanceActionFor(true, hasRoles, recordState)
    : null;
  const changed = changedEntries(record);
  const modelKnown = governanceModel === "single" || governanceModel === "trio";
  const migrationWired =
    typeof getDesktopBridge()?.previewGovernanceMigration === "function" &&
    typeof getDesktopBridge()?.migrateGovernanceModel === "function";
  const migrationButton = governanceMigrationButtonView(migrationWired, locale);

  let statusChip = "";
  let statusDetail = "";
  let statusWarn = false;
  if (projectRoot) {
    let core = "";
    if (recordState === "pin-mismatch") {
      core = governancePinMismatchText(record.pinCount, changed, locale);
      statusWarn = true;
    } else if (recordState === "missing") {
      core = governanceMissingText(projectRoleCount(roles), locale);
      statusWarn = true;
    } else if (recordState === "invalid") {
      core = governanceInvalidText(record.reason, locale);
      statusWarn = true;
    } else if (modelKnown) {
      core = governanceModelStatusText(governanceModel, locale);
    }
    // 正常模型态：模型文本单独成 chip，流程/下一步详情另起一段（窄屏可换行）；
    // 异常态保持原来的单行完整文案（含下一步），不改变既有 textContent 契约。
    if (!statusWarn) {
      statusChip = core;
      statusDetail = nextStep;
    } else {
      statusChip = core;
      if (nextStep) statusChip = statusChip ? statusChip + " · " + nextStep : nextStep;
    }
  }
  const statusText = statusChip + statusDetail;
  const statusVisible = projectRoot !== null && statusText !== "";

  const openPreview = (event: MouseEvent<HTMLElement>) => {
    invokerRef.current = event.currentTarget;
    void useGovernanceStore.getState().openPreview();
  };

  // 打开后焦点移到面板标题；Esc 关闭并回触发（非模态、无焦点陷阱）。
  useEffect(() => {
    if (!open) return;
    const panel = previewRef.current;
    requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!panel.contains(document.activeElement) && document.activeElement !== panel) {
        return;
      }
      event.preventDefault();
      useGovernanceStore.getState().close();
      const invoker = invokerRef.current;
      if (invoker && invoker.isConnected) invoker.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    useGovernanceStore.getState().close();
    const invoker = invokerRef.current;
    if (invoker && invoker.isConnected) invoker.focus({ preventScroll: true });
  };

  const cancelPreview = () => {
    if (busy) return;
    useGovernanceStore.getState().cancel();
    // 取消=关闭预览并回触发（与 Esc 同焦点语义；不调用任何写通道）。
    const invoker = invokerRef.current;
    if (invoker && invoker.isConnected) invoker.focus({ preventScroll: true });
  };

  const success = result?.kind === "success" && (mode === "reaccept" || mode === "migrate" || mode === "establish");

  return (
    <>
      <div
        id="governance-status"
        className="governance-status"
        hidden={!statusVisible}
        data-governance-state={recordState || undefined}
      >
        <span className="gov-shield" aria-hidden="true">
          <ShieldCheck size={13} strokeWidth={1.5} />
        </span>
        <span className={"gov-text" + (statusWarn ? " is-warn" : "")}>
          {statusVisible ? (
            <>
              {statusChip ? <span className="gov-chip">{statusChip}</span> : null}
              {statusDetail ? <span className="gov-detail">{statusDetail}</span> : null}
            </>
          ) : null}
        </span>
        {action === "reaccept" ? (
          <button
            type="button"
            className="gov-action"
            data-governance-reaccept
            aria-expanded={open}
            aria-controls="governance-preview"
            onClick={openPreview}
          >
            {t("ui.governance.checkAndReaccept")}
          </button>
        ) : action === "establish" ? (
          <button
            type="button"
            className="gov-action"
            data-governance-establish
            aria-expanded={open}
            aria-controls="governance-preview"
            onClick={openPreview}
          >
            {t("ui.governance.establish")}
          </button>
        ) : null}
      </div>

      {projectRoot && governanceModel === "single" ? (
        <div id="governance-migration" className="governance-migration" role="status">
          <span className="gov-migration-text">{t("ui.governance.legacyModelHint")}</span>
          <button
            type="button"
            className="gov-action"
            data-governance-migrate
            disabled={migrationButton.disabled}
            title={migrationButton.title}
            aria-expanded={open && mode === "migrate"}
            aria-controls="governance-preview"
            onClick={(event) => {
              invokerRef.current = event.currentTarget;
              void useGovernanceStore.getState().openPreview("migrate");
            }}
          >
            {migrationButton.label}
          </button>
        </div>
      ) : null}

      <div
        id="governance-preview"
        ref={previewRef}
        className="governance-preview"
        hidden={!open}
        data-mode={open ? mode : undefined}
      >
        {open ? (
          <>
            <div className="gp-head">
              <div
                className="gp-title"
                ref={titleRef}
                tabIndex={-1}
                role="status"
                aria-live="polite"
              >
                {loading
                  ? t("ui.governance.readingPreview")
                  : success
                    ? mode === "reaccept"
                      ? t("ui.governance.reacceptPreview")
                      : mode === "migrate"
                        ? t("ui.governance.upgradePreview")
                        : t("ui.governance.establishPreview")
                    : result?.kind === "failure"
                      ? mode === "reaccept"
                        ? t("ui.governance.reacceptPreview")
                        : mode === "migrate"
                          ? t("ui.governance.upgradePreview")
                          : t("ui.governance.establishPreview")
                      : mode === "reaccept"
                        ? reaccept?.title || t("ui.governance.reacceptPreview")
                        : mode === "migrate"
                          ? migration?.title || t("ui.governance.upgradePreview")
                          : establish?.title || t("ui.governance.establishPreview")}
              </div>
              {!success ? (
                <button
                  type="button"
                  className="gp-mini"
                  data-governance-cancel
                  disabled={busy}
                  onClick={cancelPreview}
                >
                  {t("shared.common.cancel")}
                </button>
              ) : (
                <button type="button" className="gp-mini" data-governance-close onClick={close}>
                  {t("shared.common.close")}
                </button>
              )}
            </div>

            {loading ? <p className="gp-muted">{t("ui.governance.readingPreview")}</p> : null}

            {!loading && mode === "reaccept" && reaccept ? (
              <div className="gp-body">
                {reaccept.fileLines.map((file, index) => (
                  <p className="gp-file" key={index}>
                    {file.text}
                  </p>
                ))}
                <p>{reaccept.writeLine}</p>
                <p>{reaccept.pinLine}</p>
                <p className="gp-warning">{reaccept.warning}</p>
                {reaccept.blockerLines.map((line, index) => (
                  <p className="gp-blocker" key={index}>
                    {line}
                  </p>
                ))}
                <div className="gp-actions">
                  <button
                    type="button"
                    className="gp-primary"
                    data-governance-reaccept
                    disabled={!canConfirm || busy}
                    onClick={() => void useGovernanceStore.getState().confirm()}
                  >
                    {busy
                      ? t("ui.governance.reaccepting")
                      : t("ui.governance.confirmAccept")}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && mode === "establish" && establish ? (
              <div className="gp-body">
                <p className="gp-label">{t("ui.governance.modelLabel")}</p>
                <div className="gp-radios" role="radiogroup" aria-label={t("ui.governance.modelAria")}>
                  {(["single", "trio"] as const).map((model) => (
                    <label key={model} className={modelChoice === model ? "is-selected" : undefined}>
                      <input
                        type="radio"
                        name="governance-model"
                        value={model}
                        checked={modelChoice === model}
                        disabled={busy || !modelKnown}
                        onChange={() => void useGovernanceStore.getState().selectModel(model)}
                      />
                      <span>{governanceModelOptionText(model, locale)}</span>
                    </label>
                  ))}
                </div>
                <p>
                  {t("ui.governance.modelToWrite", {
                    model:
                      governanceModelOptionText(modelChoice, locale) ||
                      t("shared.common.notProvided"),
                  })}
                </p>
                {!modelKnown ? (
                  <p className="gp-warning">{governanceModelUnwiredText(locale)}</p>
                ) : null}
                {establish.suggestion === "trio" ? (
                  <p className="gp-warning">{governanceModelSuggestText(locale)}</p>
                ) : null}
                {establish.writeLines.map((line, index) => (
                  <p className="gp-file" key={index}>
                    {line}
                  </p>
                ))}
                <p>
                  {t("ui.governance.pinObjects", {
                    pinCount: establish.pinCount,
                    roleCount: establish.roleCount,
                  })}
                </p>
                {establish.pinPaths.map((path, index) => (
                  <p className="gp-file" key={"pin-" + index}>
                    {path}
                  </p>
                ))}
                <p>{establish.adoptLine}</p>
                {establish.legacyRoleLines.map((line, index) => (
                  <p className="gp-warning" key={"legacy-" + index}>
                    {line}
                  </p>
                ))}
                <p className="gp-declare">{establish.declaration}</p>
                {establish.blockers.map((line, index) => (
                  <p className="gp-blocker" key={index}>
                    {line}
                  </p>
                ))}
                <div className="gp-actions">
                  <button
                    type="button"
                    className="gp-primary"
                    data-governance-establish
                    disabled={!canConfirm || busy}
                    onClick={() => void useGovernanceStore.getState().confirm()}
                  >
                    {busy
                      ? t("ui.governance.establishing")
                      : t("ui.governance.establish")}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && mode === "migrate" && migration ? (
              <div className="gp-body">
                <p>{migration.modelLine}</p>
                {migration.writeLines.map((line, index) => (
                  <p className="gp-file" key={index}>
                    {line}
                  </p>
                ))}
                <p>{migration.modelFieldLine}</p>
                <p>{migration.manifestLine}</p>
                {migration.pinLines.map((line, index) => (
                  <p key={"pin-" + index}>{line}</p>
                ))}
                {migration.retainedLines.map((line, index) => (
                  <p key={"retain-" + index}>{line}</p>
                ))}
                <p>{migration.digestLine}</p>
                <p className="gp-warning">{migration.warning}</p>
                <div className="gp-actions">
                  <button
                    type="button"
                    className="gp-primary"
                    data-governance-migrate
                    disabled={!canConfirm || busy}
                    onClick={() => void useGovernanceStore.getState().confirm()}
                  >
                    {busy ? t("ui.governance.upgrading") : t("ui.governance.confirmUpgrade")}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="gp-body" role="alert">
                <p className="gp-blocker">{error.message}</p>
                {error.detail ? <p className="gp-muted">{error.detail}</p> : null}
              </div>
            ) : null}

            {!loading && result ? (
              <div className="gp-body" role="status">
                {result.lines.map((line, index) => (
                  <p
                    key={index}
                    className={result.kind === "success" ? "gp-success" : "gp-blocker"}
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
