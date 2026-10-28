/**
 * 客户决定/审批模态对话框（E 批，2026-10-28）。
 *
 * 全部 operator 裁决（decision/proposal/appointment/acceptance/intent-confirm/appointment-write
 * 与普通确认）在应用窗口内以独立模态呈现：一次一卡、聊天流不出现可作答卡。
 * - 「稍后处理」/ Esc / 关闭 = 移入待办，不代答、不默认；
 * - 默认焦点不在确认；破坏性/审批卡二次确认；判断代批成功的卡不会到达这里（主进程已结算）；
 * - 内容未就绪不可提交；来源/标题/预览/选项/推荐/风险与「还有 N 张」可见。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/chat/chat-store";
import { decisionView, pendingMoreCount, type DecisionOptionView } from "@/chat/decision-dialog";
import { operatorFinalNote } from "@/chat/operator-view";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { useConfirmStore } from "@/stores/confirm-store";
import { useDecisionCenterStore } from "@/stores/decision-center-store";
import { translate, useLocaleState, useT } from "@/i18n";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionLabel(option: DecisionOptionView): string {
  return `${option.label}${option.recommended ? " ★" : ""}`;
}

export function DecisionDialog() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const pending = useChatStore((s) => s.pendingOperator);
  const queued = useChatStore((s) => s.queuedOperator);
  const roles = useChatStore((s) => s.roles);
  const activeId = useDecisionCenterStore((s) => s.activeId);
  const defer = useDecisionCenterStore((s) => s.defer);
  const resolve = useDecisionCenterStore((s) => s.resolve);
  const shellBlocking = useConfirmStore((s) => Boolean(s.shellConfirm || s.recoveryConfirm));
  const [selected, setSelected] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const laterRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const payload = activeId ? pending[activeId] : undefined;
  const view = payload ? decisionView(payload, locale) : null;
  const role = view ? findRole(roles, view.sourceRoleId) : null;
  const roleName = role ? roleDisplayName(role, locale) : view?.sourceRoleId || t("ui.role.noneSelected");
  const more = activeId ? pendingMoreCount(pending, activeId) + Object.keys(queued).length : 0;

  useEffect(() => {
    if (!activeId) {
      setSelected([]);
      setArmed(false);
      setBusy(false);
      setError("");
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      restoreRef.current = document.activeElement;
    }
    const recommended = view?.options.filter((option) => option.recommended).map((option) => option.id) ?? [];
    setSelected(recommended);
    setArmed(false);
    setBusy(false);
    setError("");
    requestAnimationFrame(() => laterRef.current?.focus({ preventScroll: true }));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        defer(activeId);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeId, defer]);

  if (shellBlocking || !activeId || !view || !payload) return null;

  const toggle = (id: string) => {
    if (view.multiple) {
      setSelected((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
    } else {
      setSelected([id]);
    }
    setError("");
  };

  const canSubmit =
    view.kind === "confirm"
      ? view.answerable
      : view.answerable && selected.length > 0 && (view.multiple || selected.length === 1);

  const send = async (decision: unknown) => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError("");
    await useChatStore.getState().respondOperator(activeId, decision);
    const remaining = useChatStore.getState().pendingOperator[activeId];
    setBusy(false);
    if (remaining) {
      setError(translate(locale, "ui.operator.retryFailed", { detail: translate(locale, "ui.chatStore.operatorChannelNotAccepted") }));
      setArmed(false);
      return;
    }
    resolve(activeId, operatorFinalNote(decision, locale), locale);
  };

  const confirm = () => {
    if (view.destructive && !armed) {
      setArmed(true);
      return;
    }
    void send({ kind: "confirm", confirmed: true });
  };

  const reject = () => {
    if (view.kind === "choice") {
      void send({ kind: "choice", cancelled: true });
    } else {
      void send({ kind: "confirm", confirmed: false });
    }
  };

  const submitChoice = () => {
    if (!canSubmit) return;
    void send({ kind: "choice", selected });
  };

  const dialog = (
    <div className="decision-dialog-overlay" data-decision-overlay="true">
      <div
        id="decision-dialog"
        ref={dialogRef}
        className={
          "decision-dialog" +
          (view.highRisk ? " is-high-risk" : "") +
          (view.destructive ? " is-destructive" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="dd-title"
        aria-describedby="dd-source dd-risk"
        data-request-id={view.id}
        data-priority={view.priority}
      >
        <div className="dd-head">
          <div className="dd-heading">
            <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
            <span id="dd-title" className="dd-title">
              {view.title}
            </span>
            {view.cardKind ? (
              <Badge variant="outline" className="dd-kind">
                {view.cardKind}
              </Badge>
            ) : null}
            {view.destructive ? (
              <Badge variant="outline" className="dd-risk-badge">
                {t("ui.decisionDialog.destructive")}
              </Badge>
            ) : null}
          </div>
          <button
            type="button"
            className="dd-close"
            aria-label={t("ui.decisionDialog.closeLater")}
            title={t("ui.decisionDialog.closeLater")}
            onClick={() => defer(activeId)}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <p id="dd-source" className="dd-source">
          {t("ui.decisionDialog.sourceRole", { role: roleName })}
        </p>
        <p id="dd-risk" className={"dd-risk" + (view.highRisk ? " is-high" : "")}>
          {view.highRisk ? (
            <>
              <AlertTriangle size={12} strokeWidth={1.75} aria-hidden="true" />{" "}
              {t("ui.decisionDialog.highRisk")}
            </>
          ) : (
            t("ui.decisionDialog.highRisk")
          )}
        </p>
        {view.judgeNotice ? <p className="dd-judge">{view.judgeNotice}</p> : null}

        {view.preview ? (
          <pre className="dd-preview">{view.preview}</pre>
        ) : null}
        {view.detail ? <p className="dd-detail">{view.detail}</p> : null}
        {view.question ? <p className="dd-question">{view.question}</p> : null}

        {view.kind === "choice" ? (
          <div className="dd-options" role="group" aria-label={t("ui.decisionDialog.optionsAria")}>
            {view.options.length === 0 ? (
              <p className="dd-empty" role="alert">
                {t("ui.decisionDialog.noOptions")}
              </p>
            ) : (
              view.options.map((option) => {
                const checked = selected.includes(option.id);
                return (
                  <label className={"dd-option" + (checked ? " is-checked" : "")} key={option.id}>
                    <input
                      type={view.multiple ? "checkbox" : "radio"}
                      name={"dd-option-" + view.id}
                      value={option.id}
                      checked={checked}
                      onChange={() => toggle(option.id)}
                    />
                    <span className="dd-option-label">{optionLabel(option)}</span>
                    {option.description ? (
                      <span className="dd-option-desc">{option.description}</span>
                    ) : null}
                  </label>
                );
              })
            )}
            {view.multiple && selected.length === 0 ? (
              <p className="dd-hint">{t("ui.decisionDialog.selectMany")}</p>
            ) : null}
            {!view.multiple && selected.length === 0 ? (
              <p className="dd-hint">{t("ui.decisionDialog.selectOne")}</p>
            ) : null}
          </div>
        ) : (
          <p className="dd-hint">{view.answerable ? "" : t("ui.decisionDialog.loading")}</p>
        )}

        {view.destructive && armed ? (
          <p className="dd-second-confirm" role="alert">
            {t("ui.decisionDialog.secondConfirmHint")}
          </p>
        ) : null}
        {error ? (
          <p className="dd-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dd-actions">
          <button
            ref={laterRef}
            type="button"
            className="dd-later"
            onClick={() => defer(activeId)}
          >
            {t("ui.decisionDialog.later")}
          </button>
          {view.kind === "choice" ? (
            <>
              <button type="button" className="dd-reject" disabled={busy} onClick={reject}>
                {t("ui.decisionDialog.reject")}
              </button>
              <Button
                type="button"
                className="dd-submit"
                disabled={!canSubmit || busy}
                onClick={submitChoice}
              >
                {t("ui.decisionDialog.submit")}
              </Button>
            </>
          ) : (
            <>
              <button type="button" className="dd-reject" disabled={busy} onClick={reject}>
                {t("ui.decisionDialog.reject")}
              </button>
              <Button
                type="button"
                className="dd-confirm"
                disabled={!canSubmit || busy}
                onClick={confirm}
              >
                {armed ? t("ui.decisionDialog.secondConfirm") : t("ui.decisionDialog.confirm")}
              </Button>
            </>
          )}
        </div>
        {more > 0 ? (
          <p className="dd-more" role="status">
            {t("ui.decisionDialog.pendingMore", { count: more })}
          </p>
        ) : null}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}

export type { DecisionOptionView };
