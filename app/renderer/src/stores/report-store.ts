/**
 * 报告持久化 / 交付回执缓存（Phase 4B）。
 *
 * 只保存主进程回包与推送的事实（按 scope×reportId / scope×attemptId 键）；
 * 晚到/旧项目/旧引擎只丢弃；已 saved 不被迟到的 pending/failed 覆盖；
 * 重试只补存已有记录，不重新执行或投递。无 DOM、无持久化。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import { asReportRecord } from "@/chat/report-view";
import { useLocaleStore, translate, type Locale } from "@/i18n";

/** 当前界面语言（i18n B1）：保存/探测失败的可见原因按当前 locale 渲染。 */
function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export interface ReportScope {
  projectRoot: string | null;
  roleId: string;
  runtime: string;
}

export type ReportEntryKind = "report" | "delivery";

export interface ReportEntry {
  key: string;
  kind: ReportEntryKind;
  scope: ReportScope;
  id: string;
  /** 最新保存状态（主进程 value/change.state 原样；显示层做纯映射）。 */
  state: Record<string, unknown> | null;
  /** 交付回执（attempt 事实）。 */
  receipt: Record<string, unknown> | null;
  pending: boolean;
  error: string;
  probed: boolean;
  requestVersion: number;
}

export function reportEntryKey(
  scope: ReportScope,
  kind: ReportEntryKind,
  id: string,
): string {
  return JSON.stringify([
    scope.projectRoot || "",
    scope.roleId || "",
    scope.runtime || "",
    kind,
    id,
  ]);
}

interface ReportState {
  entries: Record<string, ReportEntry>;
  ensureReport: (scope: ReportScope, reportId: string, initial?: unknown) => void;
  ensureDelivery: (scope: ReportScope, attemptId: string, initial?: unknown) => void;
  probeReport: (scope: ReportScope, reportId: string) => Promise<void>;
  probeDelivery: (scope: ReportScope, attemptId: string) => Promise<void>;
  retryReport: (scope: ReportScope, reportId: string) => Promise<void>;
  retryHistory: (scope: ReportScope, attemptId: string) => Promise<void>;
  applyUpdate: (payload: unknown) => void;
  clearProject: (projectRoot: string | null) => void;
}

const SAVE_ERROR_KEYS = {
  SNAPSHOT_EXPIRED: "ui.reportView.saveError.snapshotExpired",
  SESSION_NOT_AVAILABLE: "ui.reportStore.sessionNotAvailable",
  UNSUPPORTED: "ui.reportStore.unsupported",
  PROJECT_NOT_ACTIVE: "ui.reportStore.projectNotActive",
  INVALID_REQUEST: "shared.common.invalidSaveRequest",
} as const;

function saveErrorText(code: string, locale: Locale): string {
  const key = SAVE_ERROR_KEYS[code as keyof typeof SAVE_ERROR_KEYS];
  return translate(locale, key ?? "ui.reportStore.statusUnavailable");
}

function scopeMatches(a: ReportScope, b: ReportScope): boolean {
  return (
    (a.projectRoot || "") === (b.projectRoot || "") &&
    a.roleId === b.roleId &&
    a.runtime === b.runtime
  );
}

function scopeOf(value: unknown): ReportScope | null {
  const record = asReportRecord(value);
  const roleId = typeof record.roleId === "string" ? record.roleId : "";
  if (!roleId) return null;
  return {
    projectRoot: typeof record.projectRoot === "string" ? record.projectRoot : null,
    roleId,
    runtime: typeof record.runtime === "string" ? record.runtime : "",
  };
}

/** 解锁外层信封（`{ok,version,scope,value}`）或返回原始值。 */
function envelopeValue(raw: unknown, scope: ReportScope): { ok: boolean; value: unknown; error: string } {
  const record = asReportRecord(raw);
  if (record.version === 1 && typeof record.ok === "boolean") {
    const envelopeScope = scopeOf(record.scope);
    if (envelopeScope && record.scope && !scopeMatches(envelopeScope, scope)) {
      return {
        ok: false,
        value: null,
        error: translate(currentLocale(), "ui.reportStore.scopeMismatch"),
      };
    }
    if (record.ok !== true) {
      const code = typeof record.code === "string" ? record.code : "";
      return {
        ok: false,
        value: null,
        error: saveErrorText(code, currentLocale()),
      };
    }
    return { ok: true, value: record.value ?? null, error: "" };
  }
  return { ok: true, value: raw ?? null, error: "" };
}

function isSavedState(entry: ReportEntry): boolean {
  const state = entry.state || {};
  const value = state.history ?? state.state;
  return value === "saved" || value === "already-saved";
}

function mergeReportState(entry: ReportEntry, value: unknown): ReportEntry {
  const record = asReportRecord(value);
  if (Object.keys(record).length === 0) return entry;
  const incoming = record.history ?? record.state;
  // 已保存不被迟到 pending/failed 覆盖（expired 仍撤销恢复能力）。
  if (isSavedState(entry) && incoming !== "saved" && incoming !== "already-saved" && incoming !== "expired") {
    return entry;
  }
  return { ...entry, state: record, error: "" };
}

function mergeDeliveryReceipt(entry: ReportEntry, value: unknown): ReportEntry {
  const record = asReportRecord(value);
  if (Object.keys(record).length === 0) return entry;
  // 回执：`{state:"known", receipt}` / `{ok:true,state:"saved",receipt}` / 直接 receipt（version 1）。
  if (record.receipt && typeof record.receipt === "object") {
    return {
      ...entry,
      receipt: asReportRecord(record.receipt),
      state: record,
      error: "",
    };
  }
  if (record.version === 1 && record.attemptId) {
    return { ...entry, receipt: record, state: record, error: "" };
  }
  const incoming = record.history ?? record.state;
  if (isSavedState(entry) && incoming !== "saved" && incoming !== "already-saved" && incoming !== "expired") {
    return entry;
  }
  return { ...entry, state: record, error: "" };
}

function newEntry(kind: ReportEntryKind, scope: ReportScope, id: string): ReportEntry {
  return {
    key: reportEntryKey(scope, kind, id),
    kind,
    scope,
    id,
    state: null,
    receipt: null,
    pending: false,
    error: "",
    probed: false,
    requestVersion: 0,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  entries: {},

  ensureReport: (scope, reportId, initial) => {
    if (!reportId) return;
    const key = reportEntryKey(scope, "report", reportId);
    set((state) => {
      const existing = state.entries[key];
      let entry = existing || newEntry("report", scope, reportId);
      if (initial !== undefined && initial !== null) {
        entry = mergeReportState(entry, initial);
      }
      return { entries: { ...state.entries, [key]: entry } };
    });
  },

  ensureDelivery: (scope, attemptId, initial) => {
    if (!attemptId) return;
    const key = reportEntryKey(scope, "delivery", attemptId);
    set((state) => {
      const existing = state.entries[key];
      let entry = existing || newEntry("delivery", scope, attemptId);
      if (initial !== undefined && initial !== null) {
        entry = mergeDeliveryReceipt(entry, initial);
      }
      return { entries: { ...state.entries, [key]: entry } };
    });
  },

  probeReport: async (scope, reportId) => {
    if (!reportId) return;
    const key = reportEntryKey(scope, "report", reportId);
    const entry = get().entries[key];
    if (!entry || entry.probed || !getDesktopBridge()?.getReportSaveState) return;
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...(state.entries[key] || entry), probed: true },
      },
    }));
    const bridge = getDesktopBridge();
    let raw: unknown = null;
    try {
      raw = await bridge?.getReportSaveState?.({
        version: 1,
        projectRoot: scope.projectRoot,
        roleId: scope.roleId,
        runtime: scope.runtime,
        reportId,
      });
    } catch {
      raw = null;
    }
    const parsed = envelopeValue(raw, scope);
    set((state) => {
      const current = state.entries[key];
      if (!current || !scopeMatches(current.scope, scope)) return state;
      if (!parsed.ok) {
        return {
          entries: {
            ...state.entries,
            [key]: { ...current, error: parsed.error, probed: true },
          },
        };
      }
      return {
        entries: {
          ...state.entries,
          [key]: { ...mergeReportState(current, parsed.value), probed: true },
        },
      };
    });
  },

  probeDelivery: async (scope, attemptId) => {
    if (!attemptId) return;
    const key = reportEntryKey(scope, "delivery", attemptId);
    const entry = get().entries[key];
    if (!entry || entry.probed || !getDesktopBridge()?.getDeliveryReceipt) return;
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...(state.entries[key] || entry), probed: true },
      },
    }));
    const bridge = getDesktopBridge();
    let raw: unknown = null;
    try {
      raw = await bridge?.getDeliveryReceipt?.({
        version: 1,
        projectRoot: scope.projectRoot,
        roleId: scope.roleId,
        runtime: scope.runtime,
        attemptId,
      });
    } catch {
      raw = null;
    }
    const parsed = envelopeValue(raw, scope);
    set((state) => {
      const current = state.entries[key];
      if (!current || !scopeMatches(current.scope, scope)) return state;
      if (!parsed.ok) {
        return {
          entries: {
            ...state.entries,
            [key]: { ...current, error: parsed.error, probed: true },
          },
        };
      }
      return {
        entries: {
          ...state.entries,
          [key]: { ...mergeDeliveryReceipt(current, parsed.value), probed: true },
        },
      };
    });
  },

  retryReport: async (scope, reportId) => {
    const key = reportEntryKey(scope, "report", reportId);
    const current = get().entries[key];
    if (!current || current.pending) return;
    const sequence = current.requestVersion + 1;
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...current, pending: true, requestVersion: sequence, error: "" },
      },
    }));
    const bridge = getDesktopBridge();
    let raw: unknown = null;
    try {
      raw = bridge?.retryReportSave
        ? await bridge.retryReportSave({
            version: 1,
            projectRoot: scope.projectRoot,
            roleId: scope.roleId,
            runtime: scope.runtime,
            reportId,
          })
        : null;
    } catch {
      raw = null;
    }
    const parsed = envelopeValue(raw, scope);
    set((state) => {
      const entry = state.entries[key];
      if (!entry || entry.requestVersion !== sequence) return state;
      const next = { ...entry, pending: false };
      if (!parsed.ok) return { entries: { ...state.entries, [key]: { ...next, error: parsed.error } } };
      return {
        entries: {
          ...state.entries,
          [key]: mergeReportState(next, parsed.value),
        },
      };
    });
  },

  retryHistory: async (scope, attemptId) => {
    const key = reportEntryKey(scope, "delivery", attemptId);
    const current = get().entries[key];
    if (!current || current.pending) return;
    const sequence = current.requestVersion + 1;
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...current, pending: true, requestVersion: sequence, error: "" },
      },
    }));
    const bridge = getDesktopBridge();
    let raw: unknown = null;
    try {
      raw = bridge?.retryDeliveryHistorySave
        ? await bridge.retryDeliveryHistorySave({
            version: 1,
            projectRoot: scope.projectRoot,
            roleId: scope.roleId,
            runtime: scope.runtime,
            attemptId,
          })
        : null;
    } catch {
      raw = null;
    }
    const parsed = envelopeValue(raw, scope);
    set((state) => {
      const entry = state.entries[key];
      if (!entry || entry.requestVersion !== sequence) return state;
      const next = { ...entry, pending: false };
      if (!parsed.ok) return { entries: { ...state.entries, [key]: { ...next, error: parsed.error } } };
      return {
        entries: {
          ...state.entries,
          [key]: mergeDeliveryReceipt(next, parsed.value),
        },
      };
    });
  },

  applyUpdate: (payload) => {
    const record = asReportRecord(payload);
    if (record.version !== 1) return;
    const scope = scopeOf(record.scope);
    const change = asReportRecord(record.change);
    const changeScope = asReportRecord(change.scope);
    if (!scope) return;
    // change.scope 只携带 roleId/runtime（旧口径）；显式值必须与载荷范围一致，缺省不猜。
    if (typeof changeScope.roleId === "string" && changeScope.roleId !== scope.roleId) return;
    if (typeof changeScope.runtime === "string" && changeScope.runtime !== scope.runtime) return;
    if (
      typeof changeScope.projectRoot === "string" &&
      changeScope.projectRoot !== "" &&
      (scope.projectRoot || "") !== changeScope.projectRoot
    ) {
      return;
    }
    if (change.kind === "report-save") {
      const reportId = typeof change.reportId === "string" ? change.reportId : "";
      if (!reportId) return;
      const key = reportEntryKey(scope, "report", reportId);
      set((state) => {
        const entry = state.entries[key] || newEntry("report", scope, reportId);
        return {
          entries: {
            ...state.entries,
            [key]: mergeReportState(entry, change.state),
          },
        };
      });
      return;
    }
    if (change.kind === "delivery-history-save") {
      const attemptId = typeof change.attemptId === "string" ? change.attemptId : "";
      if (!attemptId) return;
      const key = reportEntryKey(scope, "delivery", attemptId);
      const receipt = change.receipt;
      const value =
        change.state === "expired"
          ? {
              state: "expired",
              history: "expired",
              receipt,
              retryHistoryAvailable: false,
              code: change.code,
            }
          : receipt && typeof receipt === "object"
            ? receipt
            : {
                history: change.state,
                retryHistoryAvailable: change.retryHistoryAvailable,
                code: change.code,
              };
      set((state) => {
        const entry = state.entries[key] || newEntry("delivery", scope, attemptId);
        const withReceipt =
          receipt && typeof receipt === "object"
            ? { ...entry, receipt: asReportRecord(receipt) }
            : entry;
        return {
          entries: {
            ...state.entries,
            [key]: mergeDeliveryReceipt(withReceipt, value),
          },
        };
      });
    }
  },

  clearProject: (projectRoot) => {
    set((state) => {
      const entries: Record<string, ReportEntry> = {};
      for (const [key, entry] of Object.entries(state.entries)) {
        if ((entry.scope.projectRoot || "") === (projectRoot || "")) continue;
        entries[key] = entry;
      }
      return { entries };
    });
  },
}));

/** 供卡片组件使用的只读选择器（缺省返回 null）。 */
export function reportEntryFor(
  entries: Record<string, ReportEntry>,
  scope: ReportScope | null,
  kind: ReportEntryKind,
  id: string,
): ReportEntry | null {
  if (!scope || !id) return null;
  return entries[reportEntryKey(scope, kind, id)] || null;
}
