/**
 * 客户授权平面 C2：指令确认对话框（`directive:confirm-request` → `directive:confirm-response`）。
 *
 * - 只消费 C1 冻结载荷（原文/动作/范围/资源/期限/未识别片段/高危原因/`confirmable`）；
 * - 高危原因只显示、不重算；未勾选风险确认时确认按钮禁用（主进程仍会复核）；
 * - `confirmable === false` 时确认禁用并说明；
 * - Esc/关闭 = 取消（fail-closed）；Tab 在 capture 阶段自陷并 `stopImmediatePropagation`，
 *   避免触发下层 shell/recovery 卡的 Esc/Tab 陷阱；
 * - 面板（z-index 95）在对话框（90）之上时，Esc/Tab 交由面板处理。
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  directiveDialogView,
  useDirectiveStore,
} from "@/stores/directive-store";
import { useT } from "@/i18n";

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

export function DirectiveDialog() {
  const t = useT();
  const pending = useDirectiveStore((state) => state.pending);
  const acknowledged = useDirectiveStore((state) => state.dialogAcknowledged);
  const busy = useDirectiveStore((state) => state.busy);
  const errorKey = useDirectiveStore((state) => state.errorKey);
  const errorText = useDirectiveStore((state) => state.errorText);
  const panelOpen = useDirectiveStore((state) => state.panelOpen);
  const setAcknowledged = useDirectiveStore((state) => state.setDialogAcknowledged);
  const respond = useDirectiveStore((state) => state.respondConfirm);

  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  const view = pending ? directiveDialogView(pending) : null;
  const highRiskUnacknowledged = !!view && view.highRiskVisible && !acknowledged;
  const confirmDisabled =
    !view || !view.confirmable || highRiskUnacknowledged || busy;
  const errorMessage = errorText || (errorKey ? t(errorKey) : "");

  useEffect(() => {
    if (pending && !openRef.current) {
      openRef.current = true;
      if (document.activeElement instanceof HTMLElement) {
        restoreRef.current = document.activeElement;
      }
      cancelRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!pending && openRef.current) {
      openRef.current = false;
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    }
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // 面板在对话框之上：由面板的 capture 处理器接管 Esc/Tab。
      if (panelOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void respond("cancel");
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables(dialogRef.current);
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      event.preventDefault();
      event.stopImmediatePropagation();
      const index = active ? list.indexOf(active) : -1;
      if (event.shiftKey) {
        (index <= 0 ? last : (list[index - 1] ?? last)).focus();
      } else {
        (index < 0 || index === list.length - 1 ? first : (list[index + 1] ?? first)).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [pending, panelOpen, respond]);

  if (!pending || !view) return null;

  const scopeText = t(view.scopeKey, view.scopeParams);
  const resourceText = view.resourceKey
    ? t(view.resourceKey, view.resourceParams)
    : "";

  return createPortal(
    <div id="directive-dialog" className="directive-dialog-overlay">
      <div
        ref={dialogRef}
        className="directive-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directive-dialog-title"
        data-request-id={pending.id}
      >
        <div className="directive-dialog-head">
          <span id="directive-dialog-title" className="directive-dialog-title">
            {t(view.titleKey)}
          </span>
          <button
            id="directive-dialog-close"
            type="button"
            className="directive-dialog-close"
            title={t("ui.directive.dialog.cancel")}
            aria-label={t("ui.directive.dialog.cancel")}
            disabled={busy}
            onClick={() => void respond("cancel")}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <p className="directive-field-label">
          {t("ui.directive.dialog.field.rawText")}
        </p>
        <pre id="directive-raw-text" className="directive-raw-text">
          {view.rawText}
        </pre>

        <dl className="directive-fields">
          <div className="directive-field">
            <dt>{t("ui.directive.dialog.field.action")}</dt>
            <dd>
              {t(view.actionKey)}
              {view.actionDetail ? (
                <span className="directive-field-detail"> {view.actionDetail}</span>
              ) : null}
            </dd>
          </div>
          {view.isRevoke ? (
            <div className="directive-field">
              <dt>{t("ui.directive.dialog.field.revokeTarget")}</dt>
              <dd id="directive-revoke-target">{view.revokeTarget}</dd>
            </div>
          ) : null}
          <div className="directive-field">
            <dt>{t("ui.directive.dialog.field.scope")}</dt>
            <dd id="directive-scope">{scopeText}</dd>
          </div>
          {view.resourceKey ? (
            <div className="directive-field">
              <dt>{t("ui.directive.dialog.field.resource")}</dt>
              <dd id="directive-resource">{resourceText}</dd>
            </div>
          ) : null}
          <div className="directive-field">
            <dt>{t("ui.directive.dialog.field.until")}</dt>
            <dd id="directive-until">{t(view.untilKey)}</dd>
          </div>
        </dl>

        {view.scopeNoteKey ? (
          <p id="directive-scope-note" className="directive-note">
            {t(view.scopeNoteKey)}
          </p>
        ) : null}
        {view.resourceNoteKey ? (
          <p id="directive-resource-note" className="directive-note">
            {t(view.resourceNoteKey)}
          </p>
        ) : null}

        {pending.target === "decision" ? (
          <p id="directive-switch-state" className="directive-note">
            {t("ui.directive.dialog.switch.decision", {
              state: view.decisionGroupEnabled
                ? t("ui.directive.dialog.switch.on")
                : t("ui.directive.dialog.switch.off"),
            })}
          </p>
        ) : null}

        {view.unrecognized.length > 0 ? (
          <p id="directive-unrecognized" className="directive-note is-warning">
            {t("ui.directive.dialog.unrecognizedFragments", {
              fragments: view.unrecognized.join(" · "),
            })}
          </p>
        ) : null}

        {view.highRiskVisible ? (
          <section id="directive-high-risk" className="directive-high-risk">
            <p className="directive-high-risk-banner">
              <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{t("ui.directive.dialog.highRisk.banner")}</span>
            </p>
            <ul className="directive-high-risk-list">
              {view.highRisk.map((reason, index) => (
                <li key={index}>{t(reason.key, reason.params)}</li>
              ))}
            </ul>
            <label className="directive-ack">
              <input
                id="directive-highrisk-ack"
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked === true)}
              />
              <span>{t("ui.directive.dialog.highRisk.acknowledge")}</span>
            </label>
          </section>
        ) : null}

        {!view.confirmable ? (
          <p id="directive-not-confirmable" className="directive-note is-error">
            {t("ui.directive.error.incompleteParse")}
          </p>
        ) : null}
        {errorMessage ? (
          <p id="directive-dialog-error" className="directive-note is-error" role="status">
            {errorMessage}
          </p>
        ) : null}

        <div className="directive-dialog-actions">
          <Button
            id="directive-confirm"
            variant="outline"
            className="min-w-[88px]"
            disabled={confirmDisabled}
            onClick={() => void respond("confirm")}
          >
            {t("ui.directive.dialog.confirm")}
          </Button>
          <Button
            id="directive-cancel"
            ref={cancelRef}
            variant="outline"
            className="confirm-default-focus min-w-[88px]"
            disabled={busy}
            onClick={() => void respond("cancel")}
          >
            {t("ui.directive.dialog.cancel")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
