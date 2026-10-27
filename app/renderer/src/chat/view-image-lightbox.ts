/**
 * view_image 放大层（lightbox）的单例状态（2026-10-27 客户追加要求）。
 *
 * 同一时刻只允许一个放大层：所有缩略图共用本 store，打开新图即替换旧图。
 * 状态与 Esc 判定是纯逻辑（不依赖 DOM），供 `test/桌面UI/` 直接 import；
 * 弹层组件（`ViewImageLightbox.tsx`）只消费本 store。
 *
 * URL 契约：`src` 必须是调用方已经用 `viewImagePreviewUrl(projectRoot, target)`
 * 得到的安全 file URL；本模块**不拼接、不改写、不导航**路径。
 */

import { create } from "zustand";

export interface ViewImageLightboxItem {
  /** 已通过 `viewImagePreviewUrl` 校验的安全 file URL。 */
  src: string;
  /** 项目相对路径（展示与 aria 标签；原样来自工具 target）。 */
  target: string;
  /** 打开者实例 id：卸载清理只关闭自己的弹层，不误关后来者。 */
  ownerId: string;
}

interface ViewImageLightboxStore {
  item: ViewImageLightboxItem | null;
  /** 打开/替换放大层；非法载荷（空 URL/路径/owner）一律忽略（fail-closed）。 */
  open: (item: ViewImageLightboxItem) => void;
  /** 关闭；传 ownerId 时仅当当前弹层属于该 owner 才关闭。 */
  close: (ownerId?: string) => void;
}

function validItem(item: unknown): item is ViewImageLightboxItem {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.src === "string" &&
    // 只接受 `viewImagePreviewUrl` 产出的 file URL；http/data 等外部来源一律不弹层。
    record.src.startsWith("file://") &&
    typeof record.target === "string" &&
    record.target !== "" &&
    typeof record.ownerId === "string" &&
    record.ownerId !== ""
  );
}

export const useViewImageLightbox = create<ViewImageLightboxStore>((set, get) => ({
  item: null,
  open: (item) => {
    if (!validItem(item)) return;
    set({ item });
  },
  close: (ownerId) => {
    if (ownerId !== undefined && get().item?.ownerId !== ownerId) return;
    if (get().item !== null) set({ item: null });
  },
}));

/**
 * Esc 关闭判定（纯函数，测试不构造真实 KeyboardEvent）：
 * 只认 `Escape`，且事件未被其他处理者 `preventDefault`（已处理的不重复关闭）。
 */
export function isLightboxCloseKey(
  event: { key?: unknown; defaultPrevented?: unknown } | null | undefined,
): boolean {
  return !!event && event.defaultPrevented !== true && event.key === "Escape";
}
