/**
 * 虚拟聊天 pane（Phase 3A）：行模型 + 视口 ± 缓冲挂载 + spacer 记账。
 *
 * 行占位口径 = 行包裹元素实测高度（含 CSS 16px 行距 padding）；`rowModelDebug.rowGap`
 * 返回 16。窗口内行才构造 DOM/Markdown；离屏行不挂载。
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getRowModel } from "@/chat/chat-store";
import { reportRendererDiagnostic } from "@/chat/diagnostics";
import { ChatRowView } from "@/chat/ChatRow";
import {
  readingAnchorMatches,
  restoredScrollTop,
  takeReadingAnchor,
} from "@/chat/reading-anchor";
import type { PaneMeta } from "@/chat/types";

export interface VirtualPaneProps {
  roleId: string;
  chatRef: React.RefObject<HTMLDivElement | null>;
  version: number;
  scrollNonce: number;
  paneMeta: PaneMeta;
}

export function VirtualPane({
  roleId,
  chatRef,
  version,
  scrollNonce,
  paneMeta,
}: VirtualPaneProps) {
  const model = getRowModel(roleId);
  const paneRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const stickRef = useRef(true);
  const lastNonce = useRef(scrollNonce);
  const lastVersion = useRef(version);
  const [viewportTick, setViewportTick] = useState(0);
  const [tail, setTail] = useState(true);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    let timer = 0;
    const onScroll = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        const atBottom =
          chat.scrollHeight - chat.scrollTop - chat.clientHeight <= 24;
        stickRef.current = atBottom;
        // 上翻即退出尾部偏好：即使 tail 状态来自上一批贴底，也不再强制挂尾部窗口。
        if (!atBottom) setTail(false);
        setViewportTick((tick) => tick + 1);
      }, 0);
    };
    chat.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      chat.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [chatRef]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onToggle = () => setViewportTick((tick) => tick + 1);
    pane.addEventListener("toggle", onToggle, true);
    return () => pane.removeEventListener("toggle", onToggle, true);
  }, [roleId]);

  // 视口诊断（白名单字段）：只在版本/尾部模式变化时上报，不进入滚动热路径。
  useEffect(() => {
    if (!model) return;
    const count = model.rows.length;
    reportRendererDiagnostic("renderer.viewport", {
      state: tail ? "tail" : "free",
      rowCount: count,
      firstRow: 0,
      lastRow: Math.max(0, count - 1),
      visibleCount: count,
    });
  }, [model, version, roleId, tail]);

  useEffect(() => {
    const force = scrollNonce !== lastNonce.current;
    if (version !== lastVersion.current && (stickRef.current || force)) {
      setTail(true);
    }
    lastNonce.current = scrollNonce;
    lastVersion.current = version;
  }, [version, scrollNonce, roleId]);

  useLayoutEffect(() => {
    const chat = chatRef.current;
    if (!chat || !tail) return;
    chat.scrollTop = chat.scrollHeight;
    stickRef.current = true;
    setTail(false);
    setViewportTick((tick) => tick + 1);
  }, [tail, version, chatRef]);

  useLayoutEffect(() => {
    if (!model) return;
    let changed = false;
    for (const row of model.rows) {
      const el = rowRefs.current.get(row.id);
      if (!el) continue;
      const height = el.getBoundingClientRect().height;
      if (height > 0 && Math.abs(height - row.height) > 0.5) {
        row.height = height;
        changed = true;
      }
      row.measured = true;
    }
    if (changed) {
      model.rebuild();
      const chat = chatRef.current;
      if (chat && stickRef.current) chat.scrollTop = chat.scrollHeight;
      setViewportTick((tick) => tick + 1);
    }
  }, [model, version, viewportTick, tail, chatRef, roleId]);

  // full replay 的阅读锚点还原（PM §十七）：在行高测量之后、同一行仍在窗口内时，
  // 按「新偏移 - 旧偏移」一次性校正 scrollTop 并刷新虚拟窗口。找不到同一行、
  // 或记录时已贴底 ⇒ 什么都不做（不猜行、不播放动画、不加定时器）。
  useLayoutEffect(() => {
    const anchor = takeReadingAnchor(roleId);
    if (!anchor) return;
    const chat = chatRef.current;
    const pane = paneRef.current;
    if (!chat || !pane) return;
    const chatRect = chat.getBoundingClientRect();
    const target = Array.from(
      pane.querySelectorAll<HTMLElement>(".msg, .tool-records, .sys-denied"),
    ).find((element) => readingAnchorMatches(anchor, element.textContent));
    if (!target) return;
    const next = restoredScrollTop(
      anchor,
      chat.scrollTop,
      target.getBoundingClientRect().top,
      chatRect.top,
    );
    if (next === null) return;
    if (Math.abs(next - chat.scrollTop) < 0.5) return;
    chat.scrollTop = next;
    setViewportTick((tick) => tick + 1);
  }, [model, version, roleId, chatRef]);

  if (!model) {
    return <div className="chat-pane" data-role-id={roleId} ref={paneRef} />;
  }

  const chat = chatRef.current;
  const pane = paneRef.current;
  const paneTop =
    pane && chat
      ? pane.getBoundingClientRect().top -
        chat.getBoundingClientRect().top +
        chat.scrollTop
      : 0;
  const viewTop = chat ? Math.max(0, chat.scrollTop - paneTop) : 0;
  const viewBottom = viewTop + (chat ? chat.clientHeight : 0);
  const windowResult = model.getWindow(viewTop, viewBottom, {
    preferTail: tail && stickRef.current,
  });

  return (
    <div
      className="chat-pane"
      data-role-id={roleId}
      ref={paneRef}
      aria-busy={paneMeta.loading ? "true" : undefined}
    >
      <div
        className="virt-spacer"
        aria-hidden="true"
        style={{ height: windowResult.topSpacer }}
      />
      {windowResult.rows.map((row) => {
        // 判断结果行：e2e 直接以 pane 子元素取 `.shell-judge-row` 并读 dataset.toolCallId，
        // 因此把该类挂到行包裹元素（其余行包裹保持 `.chat-row` 不变）。
        const judge =
          row.kind === "judge-result"
            ? (row.data as { view?: { verdict?: string; denyOverride?: boolean; toolCallId?: string } })
            : null;
        const governance =
          row.kind === "governance-judge-result"
            ? (row.data as { view?: { toolCallId?: string } })
            : null;
        const extraClass =
          judge && judge.view
            ? " sys shell-judge-row " +
              (judge.view.verdict === "deny" ? "is-deny" : "is-allow") +
              (judge.view.denyOverride ? " is-deny-override" : "")
            : governance && governance.view
              ? " sys shell-judge-row governance-judge-row is-allow"
              : "";
        const toolCallId =
          (judge && judge.view && judge.view.toolCallId) ||
          (governance && governance.view && governance.view.toolCallId) ||
          "";
        return (
          <div
            key={row.id}
            className={"chat-row" + extraClass}
            data-row-id={row.id}
            data-row-kind={row.kind}
            data-tool-call-id={toolCallId || undefined}
            ref={(element) => {
              if (element) rowRefs.current.set(row.id, element);
              else rowRefs.current.delete(row.id);
            }}
          >
            <ChatRowView row={row} roleId={roleId} dataVersion={row.data} />
          </div>
        );
      })}
      <div
        className="virt-spacer"
        aria-hidden="true"
        style={{ height: windowResult.bottomSpacer }}
      />
    </div>
  );
}
