/**
 * 后台任务入口角标快照（2026-10-25）。
 *
 * 只在工作概览面板可见时由面板轮询写入；不做全局轮询。
 * 关闭抽屉后保留最后一次快照，供入口角标展示（下一次打开立即刷新）。
 */

import { create } from "zustand";

export interface BackgroundTasksBadgeState {
  runningCount: number;
  setRunningCount: (count: unknown) => void;
}

export const useBackgroundTasksStore = create<BackgroundTasksBadgeState>(
  (set) => ({
    runningCount: 0,
    setRunningCount: (count) => {
      const value =
        typeof count === "number" && Number.isFinite(count)
          ? Math.max(0, Math.floor(count))
          : 0;
      set({ runningCount: value });
    },
  }),
);
