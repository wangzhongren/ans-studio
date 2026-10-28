/**
 * 决策中心 UI 状态（E 批）：当前对话框、稍后处理待办、到达序与历史。
 *
 * 唯一权威仍是主进程 `pendingOperator`：本 store 不持有第二份请求数据、不代答、
 * 不把「稍后处理」当拒绝。历史是 UI 状态，可随重启丢失（E-10）。
 */

import { create } from "zustand";
import { useChatStore } from "../chat/chat-store.ts";
import {
  decisionPriority,
  decisionSourceRoleId,
  decisionView,
  nextDecisionId,
  orderedDecisionIds,
} from "../chat/decision-dialog.ts";
import { DEFAULT_LOCALE, translate, type Locale } from "../i18n/index.ts";

export interface DecisionHistoryEntry {
  id: string;
  title: string;
  sourceRoleId: string;
  status: "decided" | "expired" | "judge";
  result: string;
  at: string;
}

interface DecisionCenterState {
  activeId: string | null;
  deferred: string[];
  order: string[];
  history: DecisionHistoryEntry[];
  /** 用户正在输入时只显示角标，不抢焦点自动弹窗。 */
  suppressed: boolean;
  sync: (pending: Record<string, Record<string, unknown>>) => void;
  open: (id: string) => void;
  defer: (id: string) => void;
  resolve: (id: string, result: string, locale?: Locale) => void;
  expire: (id: string, reason: string) => void;
  recordJudge: (entry: Omit<DecisionHistoryEntry, "status" | "id"> & { id: string }) => void;
  reset: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTyping(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable === true;
}

function entryFor(
  id: string,
  payload: Record<string, unknown>,
  result: string,
  status: DecisionHistoryEntry["status"],
  locale: Locale,
): DecisionHistoryEntry {
  const view = decisionView(payload, locale);
  return {
    id,
    title: view.title,
    sourceRoleId: view.sourceRoleId || decisionSourceRoleId(payload),
    status,
    result,
    at: nowIso(),
  };
}

export const useDecisionCenterStore = create<DecisionCenterState>((set, get) => ({
  activeId: null,
  deferred: [],
  order: [],
  history: [],
  suppressed: false,

  sync: (pending) => {
    const state = get();
    const ids = Object.keys(pending);
    const order = [...state.order.filter((id) => pending[id] !== undefined), ...ids.filter((id) => !state.order.includes(id))];
    const deferred = state.deferred.filter((id) => pending[id] !== undefined);
    let activeId = state.activeId && pending[state.activeId] ? state.activeId : null;
    const suppressed = isTyping();
    const best = nextDecisionId(pending, deferred, order);
    if (!suppressed && best !== null) {
      const bestPriority = decisionPriority(pending[best]);
      const activePriority = activeId !== null ? decisionPriority(pending[activeId]) : Number.POSITIVE_INFINITY;
      // 一次一卡；新到的高优先级可打断当前低优先级卡（高风险可打断但不自动聚焦确认）。
      if (activeId === null || bestPriority < activePriority) activeId = best;
    }
    set({ order, deferred, activeId, suppressed });
  },

  open: (id) => {
    const pending = useChatStore.getState().pendingOperator;
    if (!pending[id]) return;
    set({
      activeId: id,
      deferred: get().deferred.filter((item) => item !== id),
      suppressed: false,
    });
  },

  defer: (id) => {
    const pending = useChatStore.getState().pendingOperator;
    const deferred = pending[id] ? [...new Set([...get().deferred, id])] : get().deferred;
    const activeId = nextDecisionId(pending, deferred, get().order, id);
    set({ deferred, activeId: activeId === id ? null : activeId });
  },

  resolve: (id, result, locale = DEFAULT_LOCALE) => {
    const pending = useChatStore.getState().pendingOperator;
    const payload = pending[id];
    const history = [...get().history];
    if (payload) history.unshift(entryFor(id, payload, result, "decided", locale));
    const deferred = get().deferred.filter((item) => item !== id);
    const order = get().order.filter((item) => item !== id);
    const activeId = nextDecisionId(pending, deferred, order, id);
    set({ history, deferred, order, activeId: activeId === id ? null : activeId });
  },

  expire: (id, reason) => {
    const pending = useChatStore.getState().pendingOperator;
    const payload = pending[id];
    const history = [...get().history];
    if (payload) history.unshift(entryFor(id, payload, reason, "expired", DEFAULT_LOCALE));
    const deferred = get().deferred.filter((item) => item !== id);
    const order = get().order.filter((item) => item !== id);
    const activeId = nextDecisionId(pending, deferred, order, id);
    set({ history, deferred, order, activeId: activeId === id ? null : activeId });
  },

  recordJudge: (entry) => {
    set({
      history: [
        {
          ...entry,
          status: "judge",
          result: entry.result || translate(DEFAULT_LOCALE, "ui.decisionDialog.judge"),
          at: entry.at || nowIso(),
        },
        ...get().history,
      ],
    });
  },

  reset: () => set({ activeId: null, deferred: [], order: [], history: [], suppressed: false }),
}));

let installed = false;

/** 安装 chat-store 订阅：新请求到达时按优先级弹出；输入中只标记 suppressed。 */
export function installDecisionCenter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  useDecisionCenterStore.getState().sync(useChatStore.getState().pendingOperator);
  useChatStore.subscribe((state, previous) => {
    if (state.pendingOperator === previous.pendingOperator) return;
    useDecisionCenterStore.getState().sync(state.pendingOperator);
  });
  document.addEventListener("focusin", () => {
    const state = useDecisionCenterStore.getState();
    if (state.activeId !== null) return;
    state.sync(useChatStore.getState().pendingOperator);
  });
}
