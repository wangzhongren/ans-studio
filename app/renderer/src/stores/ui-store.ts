/// <reference lib="dom" />
/**
 * 视图状态（zustand）：只做投影 + 纯视图偏好。
 *
 * 边界（PM Q8）：不判边界、不持久化治理事实、不写「卡已批准」；
 * 主进程仍是唯一权威。本阶段只承载骨架的视图偏好与演示选择。
 *
 * localStorage 键沿用旧渲染器（2026-10-17 客户确认）：
 *   ans.sidebar.width      左栏宽度（208–360，默认 248）
 *   ans.sidebar.collapsed  "1" 收起 / "0" 展开
 */

import { create } from "zustand";

export const SIDEBAR_MIN = 208;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 248;

export const SIDEBAR_WIDTH_STORAGE_KEY = "ans.sidebar.width";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "ans.sidebar.collapsed";

export type RuntimeId = "pi" | "codex" | "claude";

export interface RuntimeOption {
  id: RuntimeId;
  label: string;
}

/** 顺序沿用旧选择器（Pi / Codex / Claude）；默认为 Claude（客户 2026-10-17 指令）。 */
export const RUNTIME_OPTIONS: RuntimeOption[] = [
  { id: "pi", label: "Pi" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
];

export const DEFAULT_RUNTIME: RuntimeId = "claude";

/** 与旧实现同义的宽度收敛：数字、四舍五入、越界 clamp、坏值回退 248。 */
export function clampSidebarWidth(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(parsed)));
}

function readStoredWidth(): number {
  try {
    return clampSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 存储不可用：本次会话仍可操作，只是不持久化。 */
  }
}

export interface UiState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  runtime: RuntimeId;
  selectedRoleId: string;
  /** 宽度持久化在动作内完成；返回收敛后的值，便于探针同步读取。 */
  setSidebarWidth: (width: unknown) => number;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDrawerOpen: (open: boolean) => void;
  setRuntime: (runtime: RuntimeId) => void;
  selectRole: (roleId: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarWidth: readStoredWidth(),
  sidebarCollapsed: readStoredCollapsed(),
  drawerOpen: false,
  runtime: DEFAULT_RUNTIME,
  selectedRoleId: "demo-product",
  setSidebarWidth: (width) => {
    const next = clampSidebarWidth(width);
    set({ sidebarWidth: next });
    writeStorage(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    return next;
  },
  setSidebarCollapsed: (collapsed) => {
    const next = collapsed === true;
    set({ sidebarCollapsed: next });
    writeStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
  setDrawerOpen: (open) => set({ drawerOpen: open === true }),
  setRuntime: (runtime) => set({ runtime }),
  selectRole: (roleId) => set({ selectedRoleId: roleId }),
}));
