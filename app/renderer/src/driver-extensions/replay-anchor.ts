/**
 * 4B 驱动扩展：`window.__ansRenderer.replayAnchorDebug(roleId)`。
 *
 * 返回每角色锚点表（`anchorKey/requestIndex/conclusionIndex/rowsAtReplay`）；
 * 无表返回 []。只读，接真实 chat-store。
 */

import { getReplayAnchors } from "@/chat/chat-store";

export const extend = {
  replayAnchorDebug(roleId: string) {
    return getReplayAnchors(String(roleId || ""));
  },
};
