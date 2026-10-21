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
  governancePinMismatchText,
  projectRoleCount,
  GOVERNANCE_MIGRATION_TEXT,
  GOVERNANCE_MODEL_SUGGEST,
  GOVERNANCE_MODEL_UNWIRED,
  governanceModelOptionText,
} from "@/chat/governance-view";
import { getDesktopBridge } from "@/lib/platform";
import { useGovernanceStore } from "@/stores/governance-store";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function GovernancePanel() {
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
  const migrationButton = governanceMigrationButtonView(migrationWired);

  let statusText = "";
  if (projectRoot) {
    if (recordState === "pin-mismatch") {
      statusText = governancePinMismatchText(record.pinCount, changed);
    } else if (recordState === "missing") {
      statusText = governanceMissingText(projectRoleCount(roles));
    } else if (recordState === "invalid") {
      statusText = governanceInvalidText(record.reason);
    } else if (modelKnown) {
      statusText = governanceModelStatusText(governanceModel);
    }
    if (nextStep) statusText = statusText ? statusText + " · " + nextStep : nextStep;
  }
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
        <span className="gov-text">{statusVisible ? statusText : ""}</span>
        {action === "reaccept" ? (
          <button
            type="button"
            className="gov-action"
            data-governance-reaccept
            aria-expanded={open}
            aria-controls="governance-preview"
            onClick={openPreview}
          >
            检查并重新接受
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
            建立治理记录
          </button>
        ) : null}
      </div>

      {projectRoot && governanceModel === "single" ? (
        <div id="governance-migration" className="governance-migration" role="status">
          <span className="gov-migration-text">{GOVERNANCE_MIGRATION_TEXT}</span>
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
                  ? "正在读取预览…"
                  : success
                    ? mode === "reaccept"
                      ? "重新接受治理边界（预览）"
                      : mode === "migrate"
                        ? "升级为三权治理模型（预览）"
                        : "建立治理记录（预览）"
                    : result?.kind === "failure"
                      ? mode === "reaccept"
                        ? "重新接受治理边界（预览）"
                        : mode === "migrate"
                          ? "升级为三权治理模型（预览）"
                          : "建立治理记录（预览）"
                      : mode === "reaccept"
                        ? reaccept?.title || "重新接受治理边界（预览）"
                        : mode === "migrate"
                          ? migration?.title || "升级为三权治理模型（预览）"
                          : establish?.title || "建立治理记录（预览）"}
              </div>
              {!success ? (
                <button
                  type="button"
                  className="gp-mini"
                  data-governance-cancel
                  disabled={busy}
                  onClick={cancelPreview}
                >
                  取消
                </button>
              ) : (
                <button type="button" className="gp-mini" data-governance-close onClick={close}>
                  关闭
                </button>
              )}
            </div>

            {loading ? <p className="gp-muted">正在读取预览…</p> : null}

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
                    {busy ? "正在重新接受…" : "确认接受"}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && mode === "establish" && establish ? (
              <div className="gp-body">
                <p className="gp-label">治理模型（建立时写入 .ans）：</p>
                <div className="gp-radios" role="radiogroup" aria-label="治理模型">
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
                      <span>{governanceModelOptionText(model)}</span>
                    </label>
                  ))}
                </div>
                <p>将写入的治理模型：{governanceModelOptionText(modelChoice) || "（未报告）"}</p>
                {!modelKnown ? <p className="gp-warning">{GOVERNANCE_MODEL_UNWIRED}</p> : null}
                {establish.suggestion === "trio" ? (
                  <p className="gp-warning">{GOVERNANCE_MODEL_SUGGEST}</p>
                ) : null}
                {establish.writeLines.map((line, index) => (
                  <p className="gp-file" key={index}>
                    {line}
                  </p>
                ))}
                <p>
                  将 pin 的对象（{establish.pinCount} 项）及角色（{establish.roleCount} 个）：
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
                    {busy ? "正在建立治理记录…" : "建立治理记录"}
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
                    {busy ? "正在升级…" : "确认升级"}
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
