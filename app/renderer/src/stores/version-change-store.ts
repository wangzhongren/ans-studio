/**
 * 版本变更/主干面板状态（U1，2026-11-04 trunk-amendment-model）。
 *
 * 纪律（P1.6 §4.10；PM 复审 F10/F17；D1 冻结 IPC）：
 * · **单一状态源**：只订阅 D1 的 `trunk:state`（主→渲）；不设第二套推送。面板打开/手动刷新时
 *   经 `*-list` 只读拉取；**不轮询**。`trunk:state` 到达时按需 debounce 刷新列表快照。
 * · 不本地统计/判定：入口禁用原因、待批计数、冻结健康全部来自 D1 载荷；动作回执原样呈现。
 * · 不新增渲→主提交通道：VCA/重构提交只经发起角色能力工具；本 store 只调用 D1 冻结的
 *   只读/重发卡/主干升级确认通道。
 * · 项目切换清空全部旧项目事实（不串项目）。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import { translate, useLocaleStore } from "@/i18n";
import { useChatStore } from "@/chat/chat-store";
import {
  asTrunkStatePayload,
  trunkUpgradeConfirmReceiptView,
  trunkUpgradeRequestReceiptView,
  type TrunkPanelSegment,
  type TrunkStateView,
} from "@/chat/trunk-view";
import {
  asDocFreezeListReply,
  asRefactorListReply,
  asStableWriteListReply,
  asVersionChangeListReply,
  freezeReplyHealth,
  presentVersionChangeReceiptView,
  versionChangeListNotice,
  type CacheHealth,
  type DocFreezeDocView,
  type RefactorView,
  type StableWriteView,
  type VcaView,
} from "@/chat/version-change-view";

export type { TrunkPanelSegment } from "@/chat/trunk-view";

function currentLocale() {
  return useLocaleStore.getState().locale;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface PresentFeedback {
  kind: "none" | "pending" | "presented" | "answered" | "rejected" | "error";
  text: string;
}

export interface UpgradePreviewChange {
  kind: string;
  roleId?: string;
  path: string;
  oldSha: string;
  newSha: string;
}

export interface UpgradePreviewState {
  previewId: string;
  reason: string;
  scope: string[];
  trunkVersion: number;
  changes: UpgradePreviewChange[];
  expiresAt: string;
}

/** 解析 `trunk:upgrade-request` 回执里的预览事实（只含展示字段；不改写/不推算）。 */
export function parseUpgradePreview(reply: unknown): UpgradePreviewState | null {
  const record = asRecord(reply);
  const preview = asRecord(record?.preview);
  if (!preview) return null;
  const previewId = asString(preview.previewId);
  const trunkVersion = preview.trunkVersion;
  if (previewId === "" || typeof trunkVersion !== "number" || !Number.isFinite(trunkVersion)) {
    return null;
  }
  const changes: UpgradePreviewChange[] = [];
  if (Array.isArray(preview.changes)) {
    for (const item of preview.changes) {
      const change = asRecord(item);
      if (!change) continue;
      const path = asString(change.path);
      const oldSha = asString(change.oldSha);
      const newSha = asString(change.newSha);
      if (path === "" || oldSha === "" || newSha === "") continue;
      changes.push({
        kind: asString(change.kind),
        ...(asString(change.roleId) !== "" ? { roleId: asString(change.roleId) } : {}),
        path,
        oldSha,
        newSha,
      });
    }
  }
  return {
    previewId,
    reason: asString(preview.reason),
    scope: Array.isArray(preview.scope)
      ? preview.scope.filter((item): item is string => typeof item === "string")
      : [],
    trunkVersion,
    changes,
    expiresAt: asString(preview.expiresAt),
  };
}

interface VersionChangeState {
  segment: TrunkPanelSegment;
  /** 面板是否挂载（绘制中）；用于 trunk:state 到达时刷新列表（关闭时不刷新）。 */
  panelVisible: boolean;
  trunkState: TrunkStateView | null;
  trunkStateError: string;
  versionChanges: VcaView[] | null;
  versionChangesError: string;
  stableWrites: StableWriteView[] | null;
  stableWritesError: string;
  refactors: RefactorView[] | null;
  refactorsError: string;
  freezes: DocFreezeDocView[] | null;
  freezesError: string;
  freezeHealth: CacheHealth | null;
  loading: boolean;
  /** 动作成功回执（已翻译；空串 = 无）。 */
  notice: string;
  /** 动作失败回执（D1 原文；空串 = 无）。 */
  error: string;
  presentFeedback: Record<string, PresentFeedback>;
  upgradePreview: UpgradePreviewState | null;
  /** 会话头「主干升级」入口请求的聚焦目标（打开面板后由 TrunkPanels 消费）。 */
  pendingFocus: "upgrade" | null;
  setSegment: (segment: TrunkPanelSegment) => void;
  requestUpgradeFocus: () => void;
  consumePendingFocus: () => void;
  setPanelVisible: (visible: boolean) => void;
  receiveTrunkState: (payload: unknown) => void;
  refresh: (projectRoot: string) => Promise<void>;
  presentVersionChange: (projectRoot: string, applicationId: string) => Promise<void>;
  requestTrunkUpgrade: (
    projectRoot: string,
    reason: "emergency" | "recovery",
    scopeText: string,
  ) => Promise<void>;
  confirmTrunkUpgrade: (projectRoot: string, previewId: string) => Promise<void>;
  dismissUpgradePreview: () => void;
  clearFeedback: () => void;
  reset: () => void;
}

const INITIAL = {
  segment: "version-change" as TrunkPanelSegment,
  panelVisible: false,
  trunkState: null as TrunkStateView | null,
  trunkStateError: "",
  versionChanges: null as VcaView[] | null,
  versionChangesError: "",
  stableWrites: null as StableWriteView[] | null,
  stableWritesError: "",
  refactors: null as RefactorView[] | null,
  refactorsError: "",
  freezes: null as DocFreezeDocView[] | null,
  freezesError: "",
  freezeHealth: null as CacheHealth | null,
  loading: false,
  notice: "",
  error: "",
  presentFeedback: {} as Record<string, PresentFeedback>,
  upgradePreview: null as UpgradePreviewState | null,
  pendingFocus: null as "upgrade" | null,
};

let refreshSeq = 0;
let panelRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function clearPanelRefreshTimer(): void {
  if (panelRefreshTimer !== undefined) {
    clearTimeout(panelRefreshTimer);
    panelRefreshTimer = undefined;
  }
}

async function safeInvoke(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const useVersionChangeStore = create<VersionChangeState>((set, get) => {
  const schedulePanelRefresh = (): void => {
    clearPanelRefreshTimer();
    panelRefreshTimer = setTimeout(() => {
      panelRefreshTimer = undefined;
      const projectRoot = useChatStore.getState().projectRoot;
      if (projectRoot && get().panelVisible) void get().refresh(projectRoot);
    }, 350);
  };

  return {
    ...INITIAL,

    setSegment: (segment) => set({ segment }),

    requestUpgradeFocus: () => set({ segment: "trunk", pendingFocus: "upgrade" }),

    consumePendingFocus: () => set({ pendingFocus: null }),

    setPanelVisible: (visible) => {
      if (!visible) {
        clearPanelRefreshTimer();
        set({ panelVisible: false });
        return;
      }
      set({ panelVisible: true });
      const projectRoot = useChatStore.getState().projectRoot;
      if (projectRoot) void get().refresh(projectRoot);
    },

    receiveTrunkState: (payload) => {
      const parsed = asTrunkStatePayload(payload);
      if (parsed === null) {
        set({
          trunkState: null,
          trunkStateError: translate(currentLocale(), "ui.versionChange.schemaUnsupported"),
        });
        return;
      }
      set({ trunkState: parsed, trunkStateError: "" });
      if (get().panelVisible) schedulePanelRefresh();
    },

    refresh: async (projectRoot) => {
      const seq = (refreshSeq += 1);
      const bridge = getDesktopBridge();
      const locale = currentLocale();
      if (!bridge) {
        set({
          loading: false,
          versionChangesError: translate(locale, "ui.versionChange.disabledUnavailable"),
          stableWritesError: translate(locale, "ui.versionChange.disabledUnavailable"),
          refactorsError: translate(locale, "ui.refactor.disabledUnavailable"),
          freezesError: translate(locale, "ui.freeze.unavailable"),
        });
        return;
      }
      set({ loading: true });
      const [vcaRaw, stableRaw, refactorRaw, freezeRaw] = await Promise.all([
        typeof bridge.listVersionChanges === "function"
          ? safeInvoke(() => bridge.listVersionChanges!({ projectRoot }))
          : Promise.resolve(undefined),
        typeof bridge.listStableWrites === "function"
          ? safeInvoke(() => bridge.listStableWrites!({ projectRoot }))
          : Promise.resolve(undefined),
        typeof bridge.listRefactorRequests === "function"
          ? safeInvoke(() => bridge.listRefactorRequests!({ projectRoot }))
          : Promise.resolve(undefined),
        typeof bridge.listDocFreezes === "function"
          ? safeInvoke(() => bridge.listDocFreezes!({ projectRoot }))
          : Promise.resolve(undefined),
      ]);
      if (seq !== refreshSeq) return;

      const vca = asVersionChangeListReply(vcaRaw);
      const stable = asStableWriteListReply(stableRaw);
      const refactor = asRefactorListReply(refactorRaw);
      const freeze = asDocFreezeListReply(freezeRaw);

      set({
        loading: false,
        versionChanges: vca?.ok === true ? vca.items : null,
        versionChangesError:
          vcaRaw === undefined
            ? translate(locale, "ui.versionChange.disabledUnavailable")
            : versionChangeListNotice(vca, locale),
        stableWrites: stable?.ok === true ? stable.items : null,
        stableWritesError:
          stableRaw === undefined
            ? translate(locale, "ui.versionChange.disabledUnavailable")
            : stable === null
              ? translate(locale, "ui.versionChange.schemaUnsupported")
              : stable.ok === false
                ? translate(locale, "ui.versionChange.loadError", { detail: stable.error })
                : "",
        refactors: refactor?.ok === true ? refactor.items : null,
        refactorsError:
          refactorRaw === undefined
            ? translate(locale, "ui.refactor.disabledUnavailable")
            : refactor === null
              ? translate(locale, "ui.versionChange.schemaUnsupported")
              : refactor.ok === false
                ? refactor.error
                : "",
        freezes: freeze?.ok === true ? freeze.items : null,
        freezesError:
          freezeRaw === undefined
            ? translate(locale, "ui.freeze.unavailable")
            : freeze === null
              ? translate(locale, "ui.freeze.unavailable")
              : freeze.ok === false
                ? freeze.error
                : "",
        freezeHealth: freezeRaw === undefined ? null : freezeReplyHealth(freezeRaw),
      });
    },

    presentVersionChange: async (projectRoot, applicationId) => {
      const bridge = getDesktopBridge();
      const locale = currentLocale();
      if (typeof bridge?.presentVersionChange !== "function") {
        set((state) => ({
          presentFeedback: {
            ...state.presentFeedback,
            [applicationId]: {
              kind: "error",
              text: translate(locale, "ui.versionChange.disabledUnavailable"),
            },
          },
        }));
        return;
      }
      const raw = await safeInvoke(() =>
        bridge.presentVersionChange!({ projectRoot, applicationId }),
      );
      const receipt = presentVersionChangeReceiptView(raw, locale);
      set((state) => ({
        presentFeedback: {
          ...state.presentFeedback,
          [applicationId]: { kind: receipt.kind, text: receipt.text },
        },
      }));
      if (receipt.kind === "presented" || receipt.kind === "answered" || receipt.kind === "pending") {
        void get().refresh(projectRoot);
      }
    },

    requestTrunkUpgrade: async (projectRoot, reason, scopeText) => {
      const bridge = getDesktopBridge();
      const locale = currentLocale();
      set({ notice: "", error: "" });
      if (typeof bridge?.requestTrunkUpgrade !== "function") {
        set({ error: translate(locale, "ui.trunk.upgrade.disabledUnavailable"), upgradePreview: null });
        return;
      }
      const raw = await safeInvoke(() =>
        bridge.requestTrunkUpgrade!({
          projectRoot,
          reason,
          ...(scopeText !== "" ? { scope: [scopeText] } : {}),
        }),
      );
      const receipt = trunkUpgradeRequestReceiptView(raw, locale);
      const preview = receipt.kind === "preview" ? parseUpgradePreview(raw) : null;
      if (receipt.kind === "preview" && preview !== null) {
        set({ upgradePreview: preview, notice: receipt.text, error: "" });
        return;
      }
      set({
        upgradePreview: null,
        error: receipt.kind === "error" ? receipt.text : translate(locale, "shared.common.unknownReason"),
      });
    },

    confirmTrunkUpgrade: async (projectRoot, previewId) => {
      const bridge = getDesktopBridge();
      const locale = currentLocale();
      if (typeof bridge?.confirmTrunkUpgrade !== "function") {
        set({ error: translate(locale, "ui.trunk.upgrade.disabledUnavailable") });
        return;
      }
      const raw = await safeInvoke(() =>
        bridge.confirmTrunkUpgrade!({ projectRoot, previewId, acknowledged: true }),
      );
      const receipt = trunkUpgradeConfirmReceiptView(raw, locale);
      if (receipt.kind === "applied") {
        set({ upgradePreview: null, notice: receipt.text, error: "" });
        void get().refresh(projectRoot);
        return;
      }
      set({ error: receipt.text });
    },

    dismissUpgradePreview: () => set({ upgradePreview: null, error: "", notice: "" }),

    clearFeedback: () => set({ notice: "", error: "" }),

    reset: () => {
      refreshSeq += 1;
      clearPanelRefreshTimer();
      set({ ...INITIAL });
    },
  };
});
