/**
 * 文档只读子视图（Phase 4A）：已列文档清单 → 显式选择阅读 → 只读呈现。
 *
 * - 只消费 opaque `documentScope`/`documentId`（主进程经 listProject 给出）；
 *   不接收 root/路径/URL，不构造文件系统路径；
 * - Markdown 走既有受控管线（html:false）；text 用 `<pre>`；
 * - 错误码如实映射 + 可重试；返回列表/角色资料并恢复焦点；
 * - 文档内 http(s) 链接走 `openExternal`；内部相对链接命中已列文档则打开，
 *   否则如实「此链接尚未提供阅读入口。」；
 * - 切换角色/引擎/项目/关闭使迟到读取失效（drawer-store 版本守卫 + 上下文匹配）。
 */

import { useEffect } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import { useUiStore } from "@/stores/ui-store";
import { useDrawerStore } from "@/stores/drawer-store";
import {
  canRetryDocument,
  DOCUMENT_BACK_LIST_TEXT,
  DOCUMENT_BACK_ROLE_TEXT,
  DOCUMENT_EMPTY_TEXT,
  DOCUMENT_LIST_NOTE,
  DOCUMENT_READ_TEXT,
  DOCUMENT_READING_TEXT,
  DOCUMENT_REFRESH_TEXT,
  DOCUMENT_RETRY_TEXT,
  DOCUMENT_UNLISTED_TEXT,
  documentErrorText,
  documentReadableRef,
  resolveDocumentLink,
} from "@/chat/document-view";
import { createRenderer } from "@/chat/markdown";
import { findRole, roleDisplayName } from "@/chat/role-view";

/**
 * 文档只读 Markdown：复用既有受控管线的安全规则（html:false、图片转义、
 * link_open class/rel、代码块），仅额外放行相对/同源链接（命中已列文档）；
 * 协议头（javascript:/data: 等）仍拒绝。渲染实现只在本组件内，纯模块不依赖 DOM。
 */
const documentRenderer = createRenderer();
const baseValidateLink = documentRenderer.validateLink.bind(documentRenderer);
documentRenderer.validateLink = (url: string) => {
  const value = String(url == null ? "" : url);
  if (/^(https?:\/\/|mailto:)/i.test(value)) return baseValidateLink(value);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
};

function renderDocumentMarkdown(text: unknown): string {
  return documentRenderer.render(String(text == null ? "" : text));
}

export function DocumentView() {
  const docsView = useDrawerStore((s) => s.document);
  const roles = useChatStore((s) => s.roles);
  const readDocument = useDrawerStore((s) => s.readDocument);
  const refreshDocumentList = useDrawerStore((s) => s.refreshDocumentList);
  const backToList = useDrawerStore((s) => s.backToList);
  const backToRole = useDrawerStore((s) => s.backToRole);
  const role = docsView ? findRole(roles, docsView.roleId) : null;
  const roleName = role ? roleDisplayName(role) : docsView?.roleId || "角色";

  // 阅读态 Esc 先回列表（再 Esc 才由 Drawer 关闭）。
  useEffect(() => {
    if (!docsView || docsView.mode === "list") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      useDrawerStore.getState().backToList();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [docsView]);

  // 返回列表：焦点回到原阅读按钮（显式选择可复现）。
  useEffect(() => {
    if (!docsView || docsView.mode !== "list" || !docsView.selectedId) return;
    const id = docsView.selectedId;
    requestAnimationFrame(() => {
      const button = document.querySelector<HTMLElement>(
        '[data-doc-id="' + CSS.escape(id) + '"]',
      );
      button?.focus({ preventScroll: true });
    });
  }, [docsView]);

  if (!docsView) {
    return <div className="muted small">文档上下文已失效。</div>;
  }

  if (docsView.mode === "list") {
    return (
      <div className="document-view">
        <button
          type="button"
          className="btn-mini"
          data-doc-action="back-role"
          onClick={() => flushSync(() => backToRole())}
        >
          <ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" />
          {DOCUMENT_BACK_ROLE_TEXT}
        </button>
        <p className="document-source-note">{DOCUMENT_LIST_NOTE}</p>
        {!docsView.scope ? (
          <p className="document-scope-error" role="status">
            {documentErrorText(docsView.unavailable || "PROJECT_NOT_GRANTED")}
          </p>
        ) : null}
        {docsView.listError ? (
          <p className="document-scope-error" role="status">
            {docsView.listError}
          </p>
        ) : null}
        {docsView.loadingRefs ? (
          <p className="muted small" role="status">
            正在读取已列文档…
          </p>
        ) : null}
        {docsView.refs.length > 0 ? (
          <ul className="document-list">
            {docsView.refs.map((ref) => {
              const readable = documentReadableRef(ref, docsView.scope);
              return (
                <li key={ref.documentId}>
                  <div className="document-list-meta">
                    <strong>{ref.label}</strong>
                    <small>{ref.relativePath}</small>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="document-read-button"
                    data-doc-id={ref.documentId}
                    disabled={!readable}
                    title={readable ? "只读打开此文档" : "当前项目/范围不可读"}
                    onClick={() => void readDocument(ref)}
                  >
                    <FileText size={12} strokeWidth={1.5} aria-hidden="true" />
                    {DOCUMENT_READ_TEXT}
                  </Button>
                </li>
              );
            })}
          </ul>
         ) : !docsView.loadingRefs && !docsView.listError ? (
          <p className="muted small">{DOCUMENT_EMPTY_TEXT}</p>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="document-refresh"
          data-doc-action="refresh"
          onClick={() => void refreshDocumentList()}
        >
          <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
          {DOCUMENT_REFRESH_TEXT}
        </Button>
        <span className="sr-only">{roleName}</span>
      </div>
    );
  }

  const result = docsView.result;
  return (
    <div className="document-view">
      <button
        type="button"
        className="btn-mini"
        data-doc-action="back-list"
        onClick={() => flushSync(() => backToList())}
      >
        <ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" />
        {DOCUMENT_BACK_LIST_TEXT}
      </button>
      <p className="document-path">{docsView.ref?.relativePath || ""}</p>
      <div id="document-read-status" className="document-read-status" role="status" aria-live="polite">
        {docsView.mode === "loading" ? DOCUMENT_READING_TEXT : null}
        {docsView.mode === "error" ? docsView.errorText : null}
        {docsView.mode === "content" ? docsView.statusText : null}
        {docsView.mode === "error" && canRetryDocument(docsView.errorCode) ? (
          <button
            type="button"
            className="btn-mini"
            data-doc-action="retry"
            onClick={() => {
              if (docsView.ref) void readDocument(docsView.ref);
            }}
          >
            {DOCUMENT_RETRY_TEXT}
          </button>
        ) : null}
      </div>
      <div
        id="document-read-text"
        className="document-read-text"
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (!anchor) return;
          event.preventDefault();
          const href = anchor.getAttribute("href") || "";
          const resolution = resolveDocumentLink(
            href,
            docsView.ref?.relativePath || "",
            docsView.refs,
          );
          if (resolution.kind === "external") {
            const bridge = getDesktopBridge();
            if (bridge?.openExternal) void bridge.openExternal(resolution.url);
            return;
          }
          if (resolution.kind === "internal") {
            void readDocument(resolution.ref);
            return;
          }
          if (resolution.kind === "unavailable") {
            const status = document.getElementById("document-read-status");
            if (status) status.textContent = DOCUMENT_UNLISTED_TEXT;
          }
        }}
      >
        {docsView.mode === "content" && result ? (
          result.format === "markdown" ? (
            <div
              className="card-md"
              dangerouslySetInnerHTML={{ __html: renderDocumentMarkdown(result.text) }}
            />
          ) : (
            <pre>{result.text}</pre>
          )
        ) : null}
      </div>
      <span className="sr-only">
        {useUiStore.getState().runtime} / {roleName}
      </span>
    </div>
  );
}
