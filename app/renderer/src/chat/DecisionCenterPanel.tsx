/**
 * 决策中心独立面板（E 批）：待办 / 历史 / judge 代批结果，不在聊天流内。
 *
 * 只读 chat-store pendingOperator 与行模型；「处理」打开模态对话框（稍后处理仍留在待办）。
 */

import { useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { useChatStore, getRowModel } from "@/chat/chat-store";
import { decisionView } from "@/chat/decision-dialog";
import { governanceJudgeResultView, shellJudgeResultView } from "@/chat/judge";
import { useDecisionCenterStore } from "@/stores/decision-center-store";
import { useDrawerStore } from "@/stores/drawer-store";
import { useLocaleState, useT } from "@/i18n";

type Filter = "all" | "pending" | "history";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function DecisionCenterPanel() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const pending = useChatStore((s) => s.pendingOperator);
  const queued = useChatStore((s) => s.queuedOperator);
  const roles = useChatStore((s) => s.roles);
  const paneVersions = useChatStore((s) => s.paneVersions);
  const deferred = useDecisionCenterStore((s) => s.deferred);
  const history = useDecisionCenterStore((s) => s.history);
  const open = useDecisionCenterStore((s) => s.open);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const pendingItems = useMemo(
    () => [
      ...Object.entries(pending).map(([id, payload]) => {
        const view = decisionView(payload, locale);
        return {
          id,
          title: view.title,
          sourceRoleId: view.sourceRoleId,
          deferred: deferred.includes(id),
          queued: false,
          priority: view.priority,
        };
      }),
      ...Object.entries(queued).map(([id, payload]) => {
        const view = decisionView(payload, locale);
        return {
          id,
          title: view.title,
          sourceRoleId: view.sourceRoleId,
          deferred: false,
          queued: true,
          priority: view.priority,
        };
      }),
    ],
    [pending, queued, deferred, locale],
  );

  const judgeItems = useMemo(() => {
    void paneVersions;
    const items: Array<{ id: string; title: string; sourceRoleId: string; result: string; at: string }> = [];
    for (const role of roles) {
      const rows = getRowModel(role.roleId)?.rows ?? [];
      for (const row of rows) {
        if (row.kind !== "judge-result" && row.kind !== "governance-judge-result") continue;
        const data = asRecord(row.data);
        const payload = asRecord(data.payload ?? data);
        const view =
          row.kind === "governance-judge-result"
            ? governanceJudgeResultView(payload, locale)
            : shellJudgeResultView(payload);
        const title =
          view && "headline" in view && typeof view.headline === "string" && view.headline !== ""
            ? view.headline
            : t("ui.decisionDialog.judge");
        const at = typeof data.at === "string" ? data.at : "";
        items.push({
          id: "judge-" + row.id,
          title,
          sourceRoleId: role.roleId,
          result: view && "title" in view ? String(view.title) : t("ui.decisionDialog.judge"),
          at,
        });
      }
    }
    return items;
  }, [roles, paneVersions, locale, t]);

  const searchText = (title: string, source: string): boolean => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return title.toLowerCase().includes(q) || source.toLowerCase().includes(q);
  };

  const showPending = filter !== "history";
  const showHistory = filter !== "pending";
  const visiblePending = pendingItems.filter((item) => searchText(item.title, item.sourceRoleId));
  const visibleHistory = history.filter((item) => searchText(item.title, item.sourceRoleId));
  const visibleJudge = judgeItems.filter((item) => searchText(item.title, item.sourceRoleId));
  const empty = (!showPending || (visiblePending.length === 0 && visibleJudge.length === 0)) &&
    (!showHistory || visibleHistory.length === 0);

  const openItem = (id: string) => {
    useDrawerStore.getState().close({ restoreFocus: false });
    open(id);
  };

  return (
    <div className="decision-center" aria-label={t("ui.decisionDialog.panelTitle")}>
      <div className="dc-tools">
        <label className="dc-search-wrap">
          <Search size={12} strokeWidth={1.5} aria-hidden="true" />
          <input
            className="dc-search"
            type="search"
            value={query}
            placeholder={t("ui.decisionDialog.search")}
            aria-label={t("ui.decisionDialog.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="dc-filter"
          aria-label={t("ui.decisionDialog.panelTitle")}
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          <option value="all">{t("ui.decisionDialog.all")}</option>
          <option value="pending">{t("ui.decisionDialog.todo")}</option>
          <option value="history">{t("ui.decisionDialog.history")}</option>
        </select>
      </div>

      {empty ? (
        <div className="dc-empty" role="status">
          <Inbox size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("ui.decisionDialog.empty")}</span>
        </div>
      ) : null}

      {showPending ? (
        <section className="dc-section" id="decision-center-pending" aria-label={t("ui.decisionDialog.todo")}>
          <h3 className="dc-heading">{t("ui.decisionDialog.todo")}</h3>
          <ul className="dc-list" aria-label={t("ui.decisionDialog.queueAria")}>
            {visiblePending.map((item) => (
              <li className="dc-item" data-request-id={item.id} data-deferred={item.deferred ? "true" : "false"} key={item.id}>
                <span className={"dc-status" + (item.deferred ? " is-deferred" : "")}>
                  {item.queued
                    ? t("ui.decisionDialog.statusQueued")
                    : item.deferred
                      ? t("ui.decisionDialog.statusDeferred")
                      : t("ui.decisionDialog.statusPending")}
                </span>
                <span className="dc-title">{item.title}</span>
                <span className="dc-source">{item.sourceRoleId}</span>
                {item.queued ? null : (
                  <button
                    type="button"
                    className="dc-open"
                    onClick={() => openItem(item.id)}
                  >
                    {t("ui.decisionDialog.open")}
                  </button>
                )}
              </li>
            ))}
            {visibleJudge.map((item) => (
              <li className="dc-item is-judge" key={item.id}>
                <span className="dc-status is-judge">{t("ui.decisionDialog.judge")}</span>
                <span className="dc-title">{item.title}</span>
                <span className="dc-source">{item.sourceRoleId}</span>
              </li>
            ))}
            {visiblePending.length === 0 && visibleJudge.length === 0 ? (
              <li className="dc-empty-row">{t("ui.decisionDialog.empty")}</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {showHistory ? (
        <section className="dc-section" id="decision-center-history" aria-label={t("ui.decisionDialog.history")}>
          <h3 className="dc-heading">{t("ui.decisionDialog.history")}</h3>
          <ul className="dc-list">
            {visibleHistory.map((item) => (
              <li className="dc-item is-history" data-request-id={item.id} key={item.id}>
                <span className={"dc-status is-" + item.status}>
                  {item.status === "expired"
                    ? t("ui.decisionDialog.statusExpired")
                    : item.status === "judge"
                      ? t("ui.decisionDialog.judge")
                      : t("ui.decisionDialog.statusDecided")}
                </span>
                <span className="dc-title">{item.title}</span>
                <span className="dc-source">{item.sourceRoleId}</span>
                <span className="dc-result">{item.result}</span>
              </li>
            ))}
            {visibleHistory.length === 0 ? (
              <li className="dc-empty-row">{t("ui.decisionDialog.empty")}</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
