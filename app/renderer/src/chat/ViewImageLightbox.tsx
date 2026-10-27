/**
 * view_image 放大层（2026-10-27 客户追加要求：点击缩略图在应用内放大）。
 *
 * - 单例：状态在 `view-image-lightbox.ts`，同一时刻只开一个；
 * - portal 到 `document.body` + `position: fixed`，不参与聊天行布局/虚拟窗口行高；
 * - 不做 file:// 导航、不打开新窗口、不改 CSP：大图仍用缩略图已算好的安全 file URL；
 * - Esc / 点击遮罩关闭；关闭后焦点回到触发按钮；`role="dialog"` + `aria-modal="true"`。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/i18n";
import {
  isLightboxCloseKey,
  useViewImageLightbox,
} from "@/chat/view-image-lightbox";

/** 大图加载失败：不显示破图，保留路径与关闭按钮并如实标注（复用缩略图文案）。 */
function LightboxImage({ src, target }: { src: string; target: string }) {
  const t = useT();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return <p className="view-image-note">{t("ui.viewImage.previewLoadFailed")}</p>;
  }
  return (
    <img
      className="view-image-lightbox-image"
      src={src}
      alt={target}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}

export function ViewImageLightbox() {
  const t = useT();
  const item = useViewImageLightbox((s) => s.item);
  const close = useViewImageLightbox((s) => s.close);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // 打开时记录触发元素并把焦点移入弹层；关闭时把焦点还给触发按钮。
  useEffect(() => {
    if (item) {
      if (wasOpenRef.current) return;
      wasOpenRef.current = true;
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement ? active : null;
      const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    target?.focus();
  }, [item]);

  // 组件卸载（例如切换角色导致聊天流重建）时归还焦点并清空单例，避免重挂后复活。
  useEffect(
    () => () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      useViewImageLightbox.getState().close();
      target?.focus();
    },
    [],
  );

  // Esc 关闭（document 捕获；只订阅于弹层打开期间，关闭后立即移除）。
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLightboxCloseKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      useViewImageLightbox.getState().close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [item]);

  if (!item) return null;

  return createPortal(
    <div
      className="view-image-lightbox"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="view-image-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.viewImage.lightboxLabel", { path: item.target })}
      >
        <div className="view-image-lightbox-head">
          <p className="view-image-lightbox-path" title={item.target}>
            {item.target}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            className="view-image-lightbox-close"
            aria-label={t("shared.common.close")}
            onClick={() => close()}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="view-image-lightbox-body">
          <LightboxImage key={item.src} src={item.src} target={item.target} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
