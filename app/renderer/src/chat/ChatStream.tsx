/**
 * 中栏聊天流容器（Phase 3A / 4B）：空态/加载/队列/tool-current + 选中角色的虚拟 pane。
 *
 * `#chat` 是唯一滚动容器；`data-state` 由真实 role-state 快照派生
 * （run/idle/err），不按事件流自行猜测忙闲。
 *
 * 4B：治理记录空态（pin-mismatch / 无记录 / 不可用 / 治理角色说明）、
 * E 批：客户决定/审批移入独立对话框/待办面板；聊天流只保留沟通与系统通知。
 */

import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRowModel, useChatStore } from "@/chat/chat-store";
import { BusySpinner } from "@/chat/BusySpinner";
import { VirtualPane } from "@/chat/VirtualPane";
import { ViewImageLightbox } from "@/chat/ViewImageLightbox";
import { useViewImageLightbox } from "@/chat/view-image-lightbox";
import { roleDisplayName } from "@/chat/role-view";
import {
  queueItemViews,
  withdrawExceptionOutcome,
  withdrawOutcome,
  type QueueItemView,
} from "@/chat/confirm-logic";
import { getDesktopBridge } from "@/lib/platform";
import { useUiStore } from "@/stores/ui-store";
import { useDrawerStore } from "@/stores/drawer-store";
import { translate, useLocaleState, useT } from "@/i18n";

/** 稳定缺省引用：zustand selector 不得每次返回新数组（getSnapshot 缓存要求）。 */
const EMPTY_QUEUE: Array<Record<string, unknown>> = [];

function QueueRows({ roleId }: { roleId: string }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const queue = useChatStore(
    (s) => s.queueByRole[roleId] ?? EMPTY_QUEUE,
  );
  const running = useChatStore((s) => s.runningByRole[roleId] ?? null);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const runtime = useUiStore((s) => s.runtime);
  const appendSystemRow = useChatStore((s) => s.appendSystemRow);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const views = queueItemViews(queue, running, locale);

  const withdraw = async (view: QueueItemView) => {
    if (!view.canWithdraw || pending[view.id]) return;
    const bridge = getDesktopBridge();
    setPending((current) => ({ ...current, [view.id]: true }));
    setFeedback((current) => {
      const next = { ...current };
      delete next[view.id];
      return next;
    });
    let outcome;
    try {
      if (!bridge?.withdrawQueued) {
        outcome = {
          ok: false,
          text: t("ui.chatStream.withdrawUnavailable"),
        };
      } else {
        outcome = withdrawOutcome(
          await bridge.withdrawQueued({ projectRoot, roleId, runtime }, view.id),
          locale,
        );
      }
    } catch (error) {
      outcome = withdrawExceptionOutcome(error, locale);
    }
    setPending((current) => {
      const next = { ...current };
      delete next[view.id];
      return next;
    });
    setFeedback((current) => ({ ...current, [view.id]: outcome.text }));
    // 就地回执已足够；撤回成功后的位次前移由主进程 role-state 快照自然刷新。
    if (!outcome.ok) {
      appendSystemRow(roleId, "sys-call", outcome.text);
    }
  };

  return (
    <>
      {views.map((view) => (
        <div
          className={"queue-row" + (view.running ? " is-running" : "")}
          key={view.id || view.position}
          data-queue-id={view.id || undefined}
        >
          <span className="q-pos">
            {view.running
              ? translate(locale, "ui.confirm.queueRunning")
              : translate(locale, "ui.chatStream.queuePosition", {
                  position: view.position,
                })}
          </span>
          <span className="q-text" title={view.text}>
            {view.text}
          </span>
          <span className="queue-src">{view.sourceLabel}</span>
          {view.canWithdraw ? (
            <button
              className="queue-withdraw"
              type="button"
              data-id={view.id}
              disabled={pending[view.id] === true}
              title={t("ui.queue.withdrawTitle")}
              onClick={() => void withdraw(view)}
            >
              {pending[view.id]
                ? t("ui.queue.withdrawing")
                : t("ui.queue.withdraw")}
            </button>
          ) : null}
          {feedback[view.id] ? (
            <div className="queue-feedback" role="status">
              {feedback[view.id]}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function ChatStream() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const hasRoles = useChatStore((s) => s.hasRoles);
  const roles = useChatStore((s) => s.roles);
  const governanceModel = useChatStore((s) => s.governanceModel);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const sessionOpenRoleId = useChatStore((s) => s.sessionOpenRoleId);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const roleMeta = useChatStore((s) => s.roleMeta);
  const paneMeta = useChatStore((s) => s.paneMeta);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const scrollNonce = useChatStore((s) => s.scrollNonce);
  const queueCount = useChatStore((s) =>
    selectedRoleId ? (s.queueByRole[selectedRoleId] || []).length : 0,
  );
  const selectRole = useChatStore((s) => s.selectRole);
  const chatRef = useRef<HTMLDivElement>(null);

  // 切换角色/项目时关闭 view_image 放大层（缩略图/弹层卸载清理再兜底一次）。
  useEffect(() => {
    useViewImageLightbox.getState().close();
  }, [selectedRoleId, projectRoot]);

  const role = roles.find((item) => item.roleId === selectedRoleId) || null;
  const meta = selectedRoleId ? paneMeta[selectedRoleId] : undefined;
  const version = selectedRoleId ? paneVersions[selectedRoleId] || 0 : 0;
  const busy = selectedRoleId ? roleBusy[selectedRoleId] === true : false;
  const error = selectedRoleId ? roleMeta[selectedRoleId]?.error === true : false;
  const model = selectedRoleId ? getRowModel(selectedRoleId) : null;
  const rowCount = model ? model.rows.length : 0;
  const sessionOpen = sessionOpenRoleId === selectedRoleId;
  const loading = meta?.loading === true;
  let emptyTitle = "";
  let emptySub = "";
  let emptyHint = "";
  let showStart = false;
  if (!projectRoot) {
    emptyTitle = t("ui.sidebar.noProject");
    emptySub = t("ui.chatStream.empty.noProjectSub");
  } else if (hasRoles === false) {
    // S0 真实空项目（hasRoles=false 仍返回内置角色）：与主入口对话，让它把角色建出来。
    emptyTitle = t("ui.chatStream.empty.notBootstrappedTitle");
    emptySub =
      selectedRoleId && role
        ? t("ui.chatStream.empty.notBootstrappedSubWithRole", {
            roleName: roleDisplayName(role, locale),
          })
        : t("ui.chatStream.empty.notBootstrappedSubPrimary");
    showStart = !!selectedRoleId;
  } else if (roles.length === 0) {
    emptyTitle = t("ui.chatStream.empty.noRolesTitle");
    emptySub = t("ui.chatStream.empty.noRolesSub");
  } else if (!selectedRoleId) {
    emptyTitle = t("ui.chatStream.empty.selectRoleTitle");
    emptySub = t("ui.chatStream.empty.selectRoleSub");
  } else if (rowCount === 0 && !loading) {
    if (!sessionOpen) {
      emptyTitle = t("ui.chatStream.startConversation", {
        roleName: roleDisplayName(role, locale),
      });
      emptySub = t("ui.chatStream.empty.startSub");
      showStart = true;
    } else {
      emptyTitle = t("ui.chatStream.empty.openedTitle");
      emptySub = t("ui.chatStream.empty.openedSub");
    }
  }

  return (
    <div
      id="chat"
      className="chat"
      data-state={busy ? "run" : error ? "err" : "idle"}
      ref={chatRef}
    >
      {loading ? (
        <div className="sys sys-loading" role="status" aria-live="polite">
          <BusySpinner />
          <span className="sys-text">
            {rowCount === 0 && !busy && queueCount === 0
              ? t("ui.chatStream.openingSession", {
                  roleName: roleDisplayName(role, locale),
                })
              : t("ui.chatStream.loadingHistory")}
          </span>
        </div>
      ) : null}

      {emptyTitle ? (
        <div className="chat-empty">
          <MessageSquareText size={36} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <p className="empty-title">{emptyTitle}</p>
          <p className="empty-sub">{emptySub}</p>
          {emptyHint ? <p className="empty-hint muted small">{emptyHint}</p> : null}
          {showStart && selectedRoleId ? (
            <Button
              id="btn-start-primary"
              className="chat-cta"
              type="button"
              onClick={() => void selectRole(selectedRoleId)}
            >
              {t("ui.chatStream.startConversation", {
                roleName: roleDisplayName(role, locale),
              })}
            </Button>
          ) : null}
        </div>
      ) : null}

      {selectedRoleId ? (
        <VirtualPane
          roleId={selectedRoleId}
          chatRef={chatRef}
          version={version}
          scrollNonce={scrollNonce}
          paneMeta={meta || { loading: false, emptyNote: true, contextText: "" }}
        />
      ) : null}

      {selectedRoleId ? <QueueRows roleId={selectedRoleId} /> : null}
      {busy && selectedRoleId ? (
        <div className="tool-current">
          <BusySpinner />
          <span className="sys-text">{t("ui.chatStream.working")}</span>
        </div>
      ) : null}
      {/* E 批：客户决定/审批只在独立对话框/待办面板处理；聊天流无可作答卡。 */}
      <button id="op-chip" className="op-chip" type="button" hidden aria-hidden="true" />
      {/* view_image 放大层：fixed + portal 到 body，不占聊天流布局。 */}
      <ViewImageLightbox />
    </div>
  );
}
