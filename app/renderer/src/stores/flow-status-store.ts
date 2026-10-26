/**
 * 流程状态头部徽标快照（2026-10-25）。
 *
 * 面板可见时随 5s 拉取更新；会话头另按 30s 拉取（窗口隐藏跳过）。
 * 方法缺失/不可用时由调用方写入不可见徽标，不抛错。
 */

import { create } from "zustand";

export interface FlowStatusBadgeState {
  visible: boolean;
  text: string;
  title: string;
  setBadge: (badge: { visible?: boolean; text?: string; title?: string }) => void;
}

export const useFlowStatusStore = create<FlowStatusBadgeState>((set) => ({
  visible: false,
  text: "",
  title: "",
  setBadge: (badge) =>
    set({
      visible: badge.visible === true,
      text: typeof badge.text === "string" ? badge.text : "",
      title: typeof badge.title === "string" ? badge.title : "",
    }),
}));
