/**
 * 队列区（Phase 4A）：位次/来源/时间/摘要/全文 + 仅客户消息未投递可撤回 + 就地回执。
 *
 * 成员唯一来自主进程 `session:role-state` 的 queue/running 快照（经 chat-store），
 * 不造第二套队列状态；展开/回执/阅读状态按角色×引擎×项目保存在 drawer-store。
 * 供工作概览与角色资料预览复用（`#right-queue-body` 只出现一次）。
 */

import { useDrawerStore, currentReadingKey } from "@/stores/drawer-store";
import { queueTimeText } from "@/chat/work-view";
import type { QueueItemView } from "@/chat/confirm-logic";
import { useT } from "@/i18n";

export function QueuePanel({
  roleId,
  items,
  emptyText,
}: {
  roleId: string;
  items: readonly QueueItemView[];
  emptyText: string;
}) {
  const t = useT();
  const key = currentReadingKey(roleId);
  const reading = useDrawerStore((s) => s.reading[key]);
  const withdraw = useDrawerStore((s) => s.withdraw[key]);
  const pending = useDrawerStore((s) => s.withdrawPending);
  const toggleFull = useDrawerStore((s) => s.toggleFull);
  const withdrawQueued = useDrawerStore((s) => s.withdrawQueued);

  if (items.length === 0) {
    return <div className="muted small">{emptyText}</div>;
  }

  return (
    <ul className="queue-list">
      {items.map((item) => {
        const running = item.running;
        const opened = reading?.full?.[item.id] === true;
        const expandable =
          item.full !== "" && Array.from(item.full).length > Array.from(item.text).length;
        const pendingKey = key + "\u0000" + item.id;
        const withdrawing = pending[pendingKey] === true;
        const feedback = withdraw?.text?.[item.id] || "";
        const safeInput = item.kind === "handback";
        return (
          <li
            key={item.id}
            data-queue-id={encodeURIComponent(item.id)}
            className={"q-item" + (running ? " is-running" : "")}
          >
            {running ? null : <span className="q-pos">{item.position}</span>}
            <div className="q-content">
              <div className="q-head">
                <span className="q-src">{item.sourceLabel}</span>
                <span className="q-time q-meta">{queueTimeText(item.at)}</span>
              </div>
              <p className="q-text">{item.text}</p>
              {expandable || item.canWithdraw ? (
                <div className="q-actions">
                  {expandable ? (
                    <button
                      className="q-toggle"
                      type="button"
                      data-safe-input={safeInput ? "true" : "false"}
                      data-id={encodeURIComponent(item.id)}
                      aria-expanded={opened}
                      title={opened ? t("ui.queue.collapse") : t("ui.queue.expand")}
                      onClick={() => toggleFull(key, item.id, !opened)}
                    >
                      {opened
                        ? t("shared.common.collapse")
                        : safeInput
                          ? t("shared.common.safeCopyTitle")
                          : t("ui.queue.fullText")}
                    </button>
                  ) : null}
                  {item.canWithdraw ? (
                    <button
                      className="q-withdraw"
                      type="button"
                      data-id={encodeURIComponent(item.id)}
                      title={t("ui.queue.withdrawTitle")}
                      disabled={withdrawing}
                      onClick={() => void withdrawQueued(roleId, item.id)}
                    >
                      {withdrawing ? t("ui.queue.withdrawing") : t("ui.queue.withdraw")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {feedback ? (
                <div className="q-feedback" role="status">
                  {feedback}
                </div>
              ) : null}
              {expandable ? (
                <div
                  className="q-full"
                  data-full-id={encodeURIComponent(item.id)}
                  hidden={!opened}
                >
                  {item.full}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
