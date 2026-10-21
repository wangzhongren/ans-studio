/**
 * 角色资料抽屉（Phase 4A）：角色头 + 四节资料（角色卡/边界条目/变更记录/文档索引，
 * 只读）+ 待办/队列预览 + 文档只读子视图入口。
 *
 * - 节开合与内层/外层滚动按 角色×引擎×项目 保存（切换角色/引擎不串读）；
 * - Markdown 一律走 `chat/markdown` 受控管线；边界表只读、不改权限；
 * - 文档索引不含正文，显式点「查看已列文档」才列清单（不自动读第一份）。
 */

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { ReactElement, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useChatStore } from "@/chat/chat-store";
import { useUiStore } from "@/stores/ui-store";
import {
  useDrawerStore,
  currentReadingKey,
} from "@/stores/drawer-store";
import { renderMarkdown } from "@/chat/markdown";
import { findRole, roleDisplayName, roleSubtitle } from "@/chat/role-view";
import { deriveRoleStatus, statusBadge } from "@/chat/status";
import {
  pendingViews,
  queueGroups,
  QUEUE_EMPTY_TEXT,
  WORK_EMPTY_PENDING,
} from "@/chat/work-view";
import type { RoleView } from "@/chat/types";
import { QueuePanel } from "@/shell/QueuePanel";

const SECTION_IDS = ["card", "boundary", "changes", "docs"] as const;
type SectionId = (typeof SECTION_IDS)[number];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boundaryTable(boundary: RoleView["boundary"]): ReactElement {
  const record = asRecord(boundary);
  const entries = Array.isArray(record.entries) ? record.entries : [];
  if (entries.length === 0) {
    return (
      <div className="muted small">
        （无条目{record.parseError ? "；解析失败：" + asString(record.parseError) : ""}）
      </div>
    );
  }
  return (
    <table className="boundary">
      <tbody>
        {entries.map((entry, index) => {
          const item = asRecord(entry);
          const kind = asString(item.kind);
          const rowClass =
            kind === "directory"
              ? "row-dir"
              : kind === "conditional-directory"
                ? "row-cond"
                : "row-file";
          return (
            <tr key={index} className={rowClass}>
              <td className="entry">
                <div className="bnd-head">
                  <span className="bnd-root">{asString(item.root)}</span>
                  <span className={"badge " + (kind === "directory" ? "dir" : kind === "conditional-directory" ? "cond" : "")}>
                    {kind === "directory"
                      ? "directory"
                      : kind === "conditional-directory"
                        ? "conditional"
                        : "file"}
                  </span>
                  <span className="bnd-path">{asString(item.path)}</span>
                </div>
                <div className="bnd-note">
                  <span className="purpose">{asString(item.purpose)}</span>
                  {item.condition ? (
                    <span className="badge cond">{asString(item.condition)}</span>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function docsIndex(role: RoleView): string {
  const docs = Array.isArray(role.docs) ? role.docs : [];
  if (docs.length === 0) return "";
  return docs
    .map((entry) => {
      const item = asRecord(entry);
      const path = asString(item.path);
      return "- " + path + (item.kind === "directory" ? "/" : "");
    })
    .join("\n");
}

function Section({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  count?: number | string | null;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="sec"
      data-section={id}
      open={open}
      onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <ChevronRight size={11} strokeWidth={2.2} className="sec-chev" aria-hidden="true" />
        <span className="sec-label">{title}</span>
        {count == null ? null : <span className="sec-count">{count}</span>}
      </summary>
      <div className="sec-body">{children}</div>
    </details>
  );
}

export function ProfilePanel({ roleId }: { roleId: string | null }) {
  const roles = useChatStore((s) => s.roles);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const roleMeta = useChatStore((s) => s.roleMeta);
  const queueByRole = useChatStore((s) => s.queueByRole);
  const runningByRole = useChatStore((s) => s.runningByRole);
  const pendingOperator = useChatStore((s) => s.pendingOperator);
  const role = findRole(roles, roleId);
  const key = currentReadingKey(roleId);
  const reading = useDrawerStore((s) => s.reading[key]);
  const setSectionOpen = useDrawerStore((s) => s.setSectionOpen);
  const setSectionScroll = useDrawerStore((s) => s.setSectionScroll);
  const openDocumentList = useDrawerStore((s) => s.openDocumentList);
  const openQueue = useDrawerStore((s) => s.openQueue);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  // 重挂/切回：仅在阅读键（角色×引擎×项目）变化或重新挂载时恢复每节内层滚动；
  // 滚动过程中保存状态不反向重置其它节（外层滚动由 Drawer 依 reading.scrollTop 恢复）。
  useEffect(() => {
    const saved = useDrawerStore.getState().reading[key];
    for (const id of SECTION_IDS) {
      const element = sectionRefs.current[id];
      if (!element) continue;
      const position = saved?.sectionScroll?.[id];
      element.scrollTop = position ? position.top : 0;
      element.scrollLeft = position ? position.left : 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, roleId]);

  if (!roleId || !role) {
    return (
      <div className="right-empty">
        <p className="empty-title">选择角色后查看资料</p>
        <p className="empty-sub">
          先在左侧选择角色，再从会话头部的“角色资料”或“工作概览”打开对应面板；内容跟随当前角色。
        </p>
      </div>
    );
  }

  const displayName = roleDisplayName(role);
  const subtitle = roleSubtitle(role);
  const initial = Array.from(displayName).slice(0, 1).join("") || "?";
  const awaiting = Object.values(pendingOperator).some(
    (payload) => asString(payload.roleId) === role.roleId,
  );
  const queue = queueByRole[role.roleId] || [];
  const status = deriveRoleStatus({
    awaitingConfirm: awaiting,
    busy: roleBusy[role.roleId] === true,
    queueDepth: queue.length,
    error: roleMeta[role.roleId]?.error === true,
    live: roleMeta[role.roleId]?.live === true,
    hadSession: roleMeta[role.roleId]?.hadSession === true,
    restored: roleMeta[role.roleId]?.restored === true,
  });
  // PM §十三 / UIUX M5：状态只表达状态；数量只在角标/队列视图。
  const badge = statusBadge(status, 0);
  const docs = Array.isArray(role.docs) ? role.docs : [];
  const fileDocs = docs.filter((entry) => asRecord(entry).kind === "file");
  const changelog = asRecord(role.changelog);
  const pending = pendingViews(pendingOperator, role.roleId);
  const groups = queueGroups(queue, runningByRole[role.roleId] || null);
  const preview = [...groups.running, ...groups.queued.slice(0, 3)];
  const sectionOpen = (id: SectionId) => reading?.sections?.[id] === true;

  return (
    <div className="profile-panel">
      <div className="role-block">
        <div className="role-avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="role-identity">
          <div className="role-name">{displayName}</div>
          <div className="role-sub">{subtitle}</div>
        </div>
        <span className={"ti-status role-status " + badge.className} title={badge.title}>
          {badge.label}
        </span>
      </div>

      <Section
        id="card"
        title="角色卡"
        open={sectionOpen("card")}
        onToggle={(open) => setSectionOpen(key, "card", open)}
      >
        <div className="kv">{role.cardPath || ""}</div>
        <div
          className="card-text card-md"
          onScroll={(event) => {
            const target = event.currentTarget;
            setSectionScroll(key, "card", target.scrollTop, target.scrollLeft);
          }}
          ref={(element) => {
            sectionRefs.current.card = element;
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(role.cardText || "（空）") }} />
        </div>
      </Section>

      <Section
        id="boundary"
        title="边界条目"
        count={role.boundary && Array.isArray(role.boundary.entries) ? role.boundary.entries.length : 0}
        open={sectionOpen("boundary")}
        onToggle={(open) => setSectionOpen(key, "boundary", open)}
      >
        {boundaryTable(role.boundary)}
      </Section>

      <Section
        id="changes"
        title="变更记录"
        count={changelog.text ? null : "无"}
        open={sectionOpen("changes")}
        onToggle={(open) => setSectionOpen(key, "changes", open)}
      >
        {changelog.text ? (
          <>
            <div className="kv">{asString(changelog.path)}</div>
            <div
              className="card-text card-md"
              onScroll={(event) => {
                const target = event.currentTarget;
                setSectionScroll(key, "changes", target.scrollTop, target.scrollLeft);
              }}
              ref={(element) => {
                sectionRefs.current.changes = element;
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog.text) }}
            />
          </>
        ) : (
          <div className="muted small">（无 changelog.md）</div>
        )}
      </Section>

      <Section
        id="docs"
        title="文档"
        count={fileDocs.length > 0 ? fileDocs.length : "无"}
        open={sectionOpen("docs")}
        onToggle={(open) => setSectionOpen(key, "docs", open)}
      >
        {docs.length === 0 ? (
          <div className="muted small">（无 docs/ 目录或为空）</div>
        ) : (
          <div
            className="card-text card-md"
            onScroll={(event) => {
              const target = event.currentTarget;
              setSectionScroll(key, "docs", target.scrollTop, target.scrollLeft);
            }}
            ref={(element) => {
              sectionRefs.current.docs = element;
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(docsIndex(role)) }}
          />
        )}
      </Section>

      <button
        type="button"
        className="btn-mini role-document-entry"
        onClick={() =>
          flushSync(() => {
            void openDocumentList(role.roleId, "card");
          })
        }
      >
        查看已列文档
      </button>

      <div className="profile-todo">
        <h3 className="work-heading">待办 / 队列</h3>
        {pending.length === 0 && preview.length === 0 ? (
          <div className="muted small">{QUEUE_EMPTY_TEXT}</div>
        ) : (
          <>
            {pending.length > 0 ? (
              <ul className="pending-requests">
                {pending.map((item) => (
                  <li key={item.id}>
                    <span className="pending-kind">{item.kindLabel}</span>
                    <span className="pending-title">{item.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {preview.length > 0 ? (
              <QueuePanel roleId={role.roleId} items={preview} emptyText={WORK_EMPTY_PENDING} />
            ) : null}
            {groups.total > 3 ? (
              <button
                type="button"
                className="btn-mini queue-view-all"
                aria-label={"查看全部队列（" + groups.total + " 项）"}
                onClick={(event) => openQueue("card", event.currentTarget)}
              >
                查看全部队列（{groups.total}）
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
