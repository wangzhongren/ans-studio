/**
 * 中栏聊天流容器（Phase 3A / 4B）：空态/加载/队列/tool-current + 选中角色的虚拟 pane。
 *
 * `#chat` 是唯一滚动容器；`data-state` 由真实 role-state 快照派生
 * （run/idle/err），不按事件流自行猜测忙闲。
 *
 * 4B：治理记录空态（pin-mismatch / 无记录 / 不可用 / 治理角色说明）、
 * 待确认 chip（同状态源 pendingOperator；定位原卡）、chip 可见时尾行让位。
 */

import { useRef, useState } from "react";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRowModel, useChatStore } from "@/chat/chat-store";
import { BusySpinner } from "@/chat/BusySpinner";
import { VirtualPane } from "@/chat/VirtualPane";
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
import { useGovernanceStore } from "@/stores/governance-store";
import {
  changedEntries,
  governanceInvalidText,
  governanceMissingText,
  governancePinMismatchEmptyState,
  governanceRoleEmptyHint,
  projectRoleCount,
} from "@/chat/governance-view";
import { operatorSurfaces } from "@/chat/operator-view";

/** 稳定缺省引用：zustand selector 不得每次返回新数组（getSnapshot 缓存要求）。 */
const EMPTY_QUEUE: Array<Record<string, unknown>> = [];

function QueueRows({ roleId }: { roleId: string }) {
  const queue = useChatStore(
    (s) => s.queueByRole[roleId] ?? EMPTY_QUEUE,
  );
  const running = useChatStore((s) => s.runningByRole[roleId] ?? null);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const runtime = useUiStore((s) => s.runtime);
  const appendSystemRow = useChatStore((s) => s.appendSystemRow);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const views = queueItemViews(queue, running);

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
        outcome = { ok: false, text: "撤回无效：当前版本未提供撤回通道。" };
      } else {
        outcome = withdrawOutcome(
          await bridge.withdrawQueued({ projectRoot, roleId, runtime }, view.id),
        );
      }
    } catch (error) {
      outcome = withdrawExceptionOutcome(error);
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
            {view.running ? "进行中" : "第 " + view.position + " 位"}
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
              title="撤回该条排队消息（仅未投递者可撤）"
              onClick={() => void withdraw(view)}
            >
              {pending[view.id] ? "撤回中…" : "撤回"}
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

function pendingIdsFor(
  pending: Record<string, Record<string, unknown>>,
  roleId: string | null,
): string[] {
  if (!roleId) return [];
  const ids: string[] = [];
  for (const [id, payload] of Object.entries(pending)) {
    if (operatorSurfaces(payload).indexOf(roleId) >= 0) ids.push(id);
  }
  return ids;
}

/** 定位到该角色的第一张未决卡：先按行模型算位置，再滚到位、聚焦卡（不自动作答）。 */
function locatePendingCard(
  roleId: string,
  requestId: string,
  chat: HTMLDivElement | null,
): void {
  if (!chat) return;
  const model = getRowModel(roleId);
  if (model) {
    const index = model.rows.findIndex(
      (row) => row.kind === "operator" && row.requestId === requestId,
    );
    if (index >= 0) {
      const sums = model.rebuild();
      const pane = chat.querySelector<HTMLElement>(
        '.chat-pane[data-role-id="' + CSS.escape(roleId) + '"]',
      );
      const paneTop = pane
        ? pane.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop
        : 0;
      const height = Math.max(1, model.rows[index].height || 0);
      const target = paneTop + sums[index] - Math.max(0, (chat.clientHeight - height) / 2);
      chat.scrollTop = Math.max(0, target);
    }
  }
  const focus = () => {
    const card = chat.querySelector<HTMLElement>(
      '[data-request-id="' + CSS.escape(requestId) + '"]',
    );
    if (!card) return;
    if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

export function ChatStream() {
  const projectRoot = useChatStore((s) => s.projectRoot);
  const hasRoles = useChatStore((s) => s.hasRoles);
  const roles = useChatStore((s) => s.roles);
  const governanceModel = useChatStore((s) => s.governanceModel);
  const governanceRecord = useChatStore((s) => s.governanceRecord);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const sessionOpenRoleId = useChatStore((s) => s.sessionOpenRoleId);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const roleMeta = useChatStore((s) => s.roleMeta);
  const paneMeta = useChatStore((s) => s.paneMeta);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const scrollNonce = useChatStore((s) => s.scrollNonce);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const queueCount = useChatStore((s) =>
    selectedRoleId ? (s.queueByRole[selectedRoleId] || []).length : 0,
  );
  const selectRole = useChatStore((s) => s.selectRole);
  const chatRef = useRef<HTMLDivElement>(null);

  const role = roles.find((item) => item.roleId === selectedRoleId) || null;
  const meta = selectedRoleId ? paneMeta[selectedRoleId] : undefined;
  const version = selectedRoleId ? paneVersions[selectedRoleId] || 0 : 0;
  const busy = selectedRoleId ? roleBusy[selectedRoleId] === true : false;
  const error = selectedRoleId ? roleMeta[selectedRoleId]?.error === true : false;
  const model = selectedRoleId ? getRowModel(selectedRoleId) : null;
  const rowCount = model ? model.rows.length : 0;
  const sessionOpen = sessionOpenRoleId === selectedRoleId;
  const loading = meta?.loading === true;
  const pendingIds = pendingIdsFor(pendingOperator, selectedRoleId);
  const record = (governanceRecord || {}) as Record<string, unknown>;
  const recordState = typeof record.state === "string" ? record.state : "";
  const governanceHint = role
    ? governanceRoleEmptyHint(role.governanceFunction)
    : "";

  let emptyTitle = "";
  let emptySub = "";
  let emptyHint = "";
  let emptyActions: "governance" | null = null;
  let showStart = false;
  if (!projectRoot) {
    emptyTitle = "尚未导入项目";
    emptySub = "在左侧点击「导入项目」选择项目根目录；导入后点击任意角色开始聊天。";
  } else if (hasRoles === false) {
    // S0 真实空项目（hasRoles=false 仍返回内置角色）：与主入口对话，让它把角色建出来。
    emptyTitle = "项目尚未 bootstrap";
    emptySub =
      selectedRoleId && role
        ? "与 " + roleDisplayName(role) + " 对话，让它把角色建出来；左树会随之长出。"
        : "与主入口对话，让它把角色建出来；左树会随之长出。";
    showStart = !!selectedRoleId;
  } else if (roles.length === 0) {
    emptyTitle = "该项目下未枚举到角色";
    emptySub = "请确认项目包含角色卡目录与治理边界；重新导入项目后重试。";
  } else if (!selectedRoleId) {
    emptyTitle = "选择角色开始聊天";
    emptySub = "从左侧角色树选择角色；每个角色保留自己的会话历史。";
  } else if (rowCount === 0 && !loading && recordState === "pin-mismatch") {
    // 治理记录与盘上边界不一致：复用 su 空态宿主（说明 + 检查入口），不自动开会话。
    const view = governancePinMismatchEmptyState(record.pinCount, changedEntries(record));
    emptyTitle = view.title;
    emptySub = view.sub;
    emptyHint = view.hint;
    emptyActions = "governance";
  } else if (rowCount === 0 && !loading && recordState === "missing") {
    emptyTitle = "尚无治理记录";
    emptySub = governanceMissingText(projectRoleCount(roles));
    emptyActions = "governance";
  } else if (rowCount === 0 && !loading && recordState === "invalid") {
    emptyTitle = "治理记录不可用";
    emptySub = governanceInvalidText(record.reason);
    emptyActions = "governance";
  } else if (rowCount === 0 && !loading && governanceHint !== "") {
    // 治理角色空态（主入口 Liaison 等）：说明客户入口，不自带 CTA。
    emptyTitle = roleDisplayName(role);
    emptySub = governanceHint;
  } else if (rowCount === 0 && !loading) {
    if (!sessionOpen) {
      emptyTitle = "开始与 " + roleDisplayName(role) + " 对话";
      emptySub = "点下方按钮开启会话；发送消息后，这里会显示对话与工具记录。";
      showStart = true;
    } else {
      emptyTitle = "会话已开启，可直接输入消息";
      emptySub =
        "发送第一条消息后，这里会显示对话与工具记录。写入由治理引擎把关，越界操作会在对话中直接提示。";
    }
  }

  const openGovernancePreview = () => {
    void useGovernanceStore.getState().openPreview(
      recordState === "pin-mismatch" ? "reaccept" : undefined,
    );
  };

  const onChipClick = () => {
    if (!selectedRoleId || pendingIds.length === 0) return;
    const first = pendingIds[0];
    // 主动定位先关闭抽屉（普通到达/刷新不关），再滚到原卡并聚焦。
    if (useUiStore.getState().drawerOpen) {
      useDrawerStore.getState().close();
    }
    locatePendingCard(selectedRoleId, first, chatRef.current);
  };

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
              ? "正在开启与角色 " + roleDisplayName(role) + " 的会话…"
              : "正在载入会话历史…"}
          </span>
        </div>
      ) : null}

      {emptyTitle ? (
        <div className="chat-empty">
          <MessageSquareText size={36} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <p className="empty-title">{emptyTitle}</p>
          <p className="empty-sub">{emptySub}</p>
          {emptyHint ? <p className="empty-hint muted small">{emptyHint}</p> : null}
          {emptyActions === "governance" ? (
            <Button
              id="btn-governance-empty-action"
              className="chat-cta"
              type="button"
              onClick={openGovernancePreview}
            >
              {recordState === "pin-mismatch" ? "检查并重新接受" : "建立治理记录"}
            </Button>
          ) : null}
          {showStart && selectedRoleId ? (
            <Button
              id="btn-start-primary"
              className="chat-cta"
              type="button"
              onClick={() => void selectRole(selectedRoleId)}
            >
              开始与 {roleDisplayName(role)} 对话
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
      {busy && selectedRoleId && pendingIds.length === 0 ? (
        <div className="tool-current">
          <BusySpinner />
          <span className="sys-text">正在工作</span>
        </div>
      ) : null}
      {selectedRoleId && pendingIds.length > 0 ? (
        <button
          id="op-chip"
          className="op-chip"
          type="button"
          aria-label={"有 " + pendingIds.length + " 条待确认 · 定位"}
          onClick={onChipClick}
        >
          <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
          <span className="op-chip-text">
            {"有 " + pendingIds.length + " 条待确认 · 定位"}
          </span>
        </button>
      ) : (
        <button id="op-chip" className="op-chip" type="button" hidden aria-hidden="true" />
      )}
    </div>
  );
}
