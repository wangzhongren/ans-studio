/**
 * 队列子视图（Phase 4A，UIUX 设计 §5.1）：同一 424 抽屉内的全量队列视图。
 *
 * - 标题「<角色> · 队列」由 Drawer 负责；返回按钮回到来源视图（工作概览/角色资料）；
 * - 当前工作 + 排队全量（简单上限 50 + 查看更多，不引虚拟库）；
 * - Esc 先返回来源视图（不被 Drawer 当作关闭）；返回后焦点回「查看全部队列」触发；
 * - `#right-queue-body` 在本视图唯一存在；不新增第四会话头图标/第二抽屉。
 */

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { useDrawerStore, queueDrawerFocus } from "@/stores/drawer-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import { queueGroups, QUEUE_EMPTY_TEXT } from "@/chat/work-view";
import { QueuePanel } from "@/shell/QueuePanel";

const SUBVIEW_LIMIT = 50;

export function QueueSubview({
  roleId,
  origin,
}: {
  roleId: string | null;
  origin: "work" | "card";
}) {
  const roles = useChatStore((s) => s.roles);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const runningByRole = useChatStore((s) => s.runningByRole);
  const [showAll, setShowAll] = useState(false);
  const backFromQueue = useDrawerStore((s) => s.backFromQueue);
  const role = findRole(roles, roleId);
  const roleName = role ? roleDisplayName(role) : "未选择角色";
  const backText = origin === "card" ? "角色资料" : "工作概览";

  useEffect(() => {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".queue-back")
        ?.focus({ preventScroll: true });
    });
  }, []);

  // Esc 在队列子视图先返回来源视图；再 Esc 才由 Drawer 关闭。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      useDrawerStore.getState().backFromQueue();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  if (!roleId || !role) {
    return (
      <div className="right-empty">
        <p className="empty-title">选择角色后查看队列</p>
        <p className="empty-sub">先从左侧选择角色，再查看该角色的当前工作与排队消息。</p>
      </div>
    );
  }

  const groups = queueGroups(
    queueByRole[roleId] || [],
    runningByRole[roleId] || null,
  );
  const queued =
    showAll || groups.queued.length <= SUBVIEW_LIMIT
      ? groups.queued
      : groups.queued.slice(0, SUBVIEW_LIMIT);

  return (
    <div className="queue-subview">
      <button
        type="button"
        className="btn-mini queue-back"
        data-queue-action="back"
        aria-label={"返回" + backText}
        onClick={() => {
          queueDrawerFocus(".queue-view-all");
          backFromQueue();
        }}
      >
        <ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" />
        {backText}
      </button>

      <div id="right-queue-body" className="role-work">
        {groups.running.length === 0 && groups.queued.length === 0 ? (
          <div className="muted small">{QUEUE_EMPTY_TEXT}</div>
        ) : null}
        {groups.running.length > 0 ? (
          <section className="work-section" aria-label="当前工作">
            <h3 className="work-heading">当前工作</h3>
            <QueuePanel roleId={roleId} items={groups.running} emptyText={QUEUE_EMPTY_TEXT} />
          </section>
        ) : null}
        {groups.queued.length > 0 ? (
          <section className="work-section" aria-label={"排队 " + groups.queued.length}>
            <h3 className="work-heading">排队 {groups.queued.length}</h3>
            <QueuePanel roleId={roleId} items={queued} emptyText={QUEUE_EMPTY_TEXT} />
            {groups.queued.length > SUBVIEW_LIMIT ? (
              <button
                type="button"
                className="btn-mini q-more"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? "收起队列" : "查看更多队列（" + groups.queued.length + "）"}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      <span className="sr-only">{roleName}</span>
    </div>
  );
}
