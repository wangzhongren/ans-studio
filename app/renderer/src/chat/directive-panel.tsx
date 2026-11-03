/**
 * 客户授权平面 C2：指令面板（审批 / 决策两个逻辑面板）。
 *
 * - 数据只来自 `directive:list`/`directive:state` 的冻结双视图；项目切换由 store 清空；
 * - active 行显示“撤销”（`directive:revoke`），历史组只读；
 * - 不占 `shellCardSlot`、不进一项目一卡队列、不计 `pendingCount/pendingRoles/judgingCount`；
 * - 面板打开时若 shell/recovery 卡待答，顶部显示只读徽标（不自动关闭/合并卡片）；
 * - Esc/Tab 在 capture 阶段自陷并 `stopImmediatePropagation`（z-index 95，高于对话框 90）。
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  directiveRowView,
  groupDirectiveList,
  useDirectiveStore,
  type DirectiveItemView,
  type DirectiveListView,
  type DirectiveRuntime,
  type DirectiveTarget,
} from "@/stores/directive-store";
import { useT } from "@/i18n";
import type { Translator } from "@/i18n";

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function rowField(t: Translator, labelKey: Parameters<Translator>[0], value: string) {
  return (
    <span className="directive-row-field">
      <span className="directive-row-label">{t(labelKey)}</span>
      <span className="directive-row-value">{value}</span>
    </span>
  );
}

function DirectiveRow({
  item,
  roleId,
  runtime,
}: {
  item: DirectiveItemView;
  roleId?: string;
  runtime?: DirectiveRuntime;
}) {
  const t = useT();
  const busy = useDirectiveStore((state) => state.busy);
  const revoke = useDirectiveStore((state) => state.revoke);
  const view = directiveRowView(item);
  return (
    <li id={"directive-row-" + item.id} className="directive-row" data-status={item.status}>
      <div className="directive-row-head">
        <span className="directive-row-id">{item.id}</span>
        <span className="directive-row-status">{t(view.statusKey)}</span>
      </div>
      <div className="directive-row-fields">
        {rowField(
          t,
          "ui.directive.dialog.field.action",
          t(view.actionKey) + (view.actionDetail ? " " + view.actionDetail : ""),
        )}
        {rowField(
          t,
          "ui.directive.dialog.field.scope",
          t(view.scopeKey, view.scopeParams),
        )}
        {view.resourceKey
          ? rowField(
              t,
              "ui.directive.dialog.field.resource",
              t(view.resourceKey, view.resourceParams),
            )
          : null}
        <span className="directive-row-field">
          <span className="directive-row-label">{t("ui.directive.dialog.field.until")}</span>
          <span className="directive-row-value">
            {t(view.untilKey)}
            {view.untilHintKey ? (
              <span className="directive-row-hint"> · {t(view.untilHintKey)}</span>
            ) : null}
          </span>
        </span>
        <span className="directive-row-field">
          <span className="directive-row-value">{t(view.consumerKey)}</span>
        </span>
      </div>
      {view.resourceNoteKey ? (
        <p className="directive-row-note">{t(view.resourceNoteKey)}</p>
      ) : null}
      <p className="directive-row-meta" id={"directive-meta-" + item.id}>
        {t("ui.directive.panel.itemMeta", {
          id: item.id,
          createdAt: item.createdAt,
        })}
      </p>
      {view.canRevoke ? (
        <button
          id={"directive-revoke-" + item.id}
          type="button"
          className="directive-row-revoke"
          disabled={busy}
          onClick={() => void revoke(item.id, item.target, { roleId, runtime })}
        >
          {t("ui.directive.panel.revoke")}
        </button>
      ) : null}
    </li>
  );
}

function DirectiveGroup({
  titleKey,
  items,
  roleId,
  runtime,
}: {
  titleKey: Parameters<Translator>[0];
  items: DirectiveItemView[];
  roleId?: string;
  runtime?: DirectiveRuntime;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="directive-group">
      <p className="directive-group-title">{t(titleKey)}</p>
      <ul className="directive-row-list">
        {items.map((item) => (
          <DirectiveRow item={item} roleId={roleId} runtime={runtime} key={item.id} />
        ))}
      </ul>
    </div>
  );
}

function DirectiveSection({
  target,
  titleKey,
  list,
  roleId,
  runtime,
}: {
  target: DirectiveTarget;
  titleKey: Parameters<Translator>[0];
  list: DirectiveListView;
  roleId?: string;
  runtime?: DirectiveRuntime;
}) {
  const t = useT();
  const groups = groupDirectiveList(list);
  return (
    <section id={"directive-panel-" + target} className="directive-section">
      <h3 className="directive-section-title">{t(titleKey)}</h3>
      {groups.active.length === 0 && groups.history.length === 0 ? (
        <p className="directive-empty">{t("ui.directive.panel.empty")}</p>
      ) : null}
      <DirectiveGroup
        titleKey="ui.directive.panel.status.active"
        items={groups.active}
        roleId={roleId}
        runtime={runtime}
      />
      <DirectiveGroup
        titleKey="ui.directive.panel.historyGroup"
        items={groups.history}
        roleId={roleId}
        runtime={runtime}
      />
    </section>
  );
}

export function DirectivePanel({
  roleId,
  runtime,
}: {
  roleId?: string;
  runtime?: DirectiveRuntime;
}) {
  const t = useT();
  const open = useDirectiveStore((state) => state.panelOpen);
  const approval = useDirectiveStore((state) => state.approval);
  const decision = useDirectiveStore((state) => state.decision);
  const ledgerErrors = useDirectiveStore((state) => state.ledgerErrors);
  const errorKey = useDirectiveStore((state) => state.errorKey);
  const errorText = useDirectiveStore((state) => state.errorText);
  const close = useDirectiveStore((state) => state.closePanel);
  const shellPending = useConfirmStore(
    (state) => state.shellConfirm !== null || state.recoveryConfirm !== null,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  const errorMessage = errorText || (errorKey ? t(errorKey) : "");

  useEffect(() => {
    if (open && !openRef.current) {
      openRef.current = true;
      if (document.activeElement instanceof HTMLElement) {
        restoreRef.current = document.activeElement;
      }
      closeRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!open && openRef.current) {
      openRef.current = false;
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables(panelRef.current);
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
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div id="directive-panel" className="directive-panel-overlay">
      <div
        ref={panelRef}
        className="directive-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directive-panel-title"
      >
        <div className="directive-dialog-head">
          <span id="directive-panel-title" className="directive-dialog-title">
            {t("ui.directive.panel.title")}
          </span>
          <button
            id="directive-panel-close"
            ref={closeRef}
            type="button"
            className="directive-dialog-close"
            title={t("ui.directive.panel.close")}
            aria-label={t("ui.directive.panel.close")}
            onClick={close}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {shellPending ? (
          <div id="directive-panel-shell-badge" className="directive-shell-badge">
            <span className="directive-shell-badge-text">
              {t("ui.directive.cardEntry.pendingShell.badge")}
            </span>
            <span className="directive-shell-badge-note">
              {t("ui.directive.cardEntry.pendingShell.note")}
            </span>
          </div>
        ) : null}

        {errorMessage ? (
          <p id="directive-panel-error" className="directive-note is-error" role="status">
            {errorMessage}
          </p>
        ) : null}
        {ledgerErrors > 0 ? (
          <p id="directive-panel-ledger-errors" className="directive-note is-error">
            {t("ui.directive.panel.ledgerErrors", { count: ledgerErrors })}
          </p>
        ) : null}

        <DirectiveSection
          target="approval"
          titleKey="ui.directive.panel.approvalTitle"
          list={approval}
          roleId={roleId}
          runtime={runtime}
        />
        <DirectiveSection
          target="decision"
          titleKey="ui.directive.panel.decisionTitle"
          list={decision}
          roleId={roleId}
          runtime={runtime}
        />
      </div>
    </div>,
    document.body,
  );
}
