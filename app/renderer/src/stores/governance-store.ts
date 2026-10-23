/**
 * 治理记录预览 / 建立 / 重新接受 / 迁移的视图状态（Phase 4B）。
 *
 * 预览零写入；只有确认动作调用写通道；`phase === "write"` 是零副作用的唯一依据。
 * 晚到回包按项目守卫丢弃；状态变化只等主进程 `project:changed` 刷新，不自行改模型。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import {
  governanceEstablishPreviewView,
  governanceFailureView,
  governanceMigrationFailureView,
  governanceMigrationPreviewView,
  governanceMigrationSuccessText,
  governanceReacceptFailureView,
  governanceReacceptPreviewView,
  governanceReacceptSuccessText,
  type EstablishPreviewView,
  type MigrationPreviewView,
  type ReacceptPreviewView,
} from "@/chat/governance-view";
import { useLocaleStore, translate, type Locale } from "@/i18n";

/** 当前界面语言（i18n B1）：治理预览/失败的可见文案按当前 locale 渲染。 */
function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export type GovernanceMode = "establish" | "reaccept" | "migrate";
export type GovernanceModelChoice = "single" | "trio";

export interface GovernanceResult {
  kind: "success" | "failure";
  lines: string[];
  noRetry: boolean;
}

export interface GovernancePreviewState {
  open: boolean;
  mode: GovernanceMode;
  modelChoice: GovernanceModelChoice;
  loading: boolean;
  busy: boolean;
  /** 建立/迁移/重新接受预览的原始回包（渲染只做纯映射）。 */
  preview: Record<string, unknown> | null;
  reaccept: ReacceptPreviewView | null;
  establish: EstablishPreviewView | null;
  migration: MigrationPreviewView | null;
  previewDigest: string;
  canConfirm: boolean;
  result: GovernanceResult | null;
  error: { message: string; detail: string } | null;
  /** 主进程 governance:next-step 的状态行（只显示，不打开/切换会话）。 */
  nextStep: string;
}

interface GovernanceState extends GovernancePreviewState {
  openPreview: (mode?: GovernanceMode) => Promise<void>;
  selectModel: (model: GovernanceModelChoice) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => void;
  close: () => void;
  setNextStep: (payload: unknown) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function previewOf(res: unknown): Record<string, unknown> | null {
  const record = asRecord(res);
  const value = asRecord(record.value);
  for (const candidate of [record.preview, value.preview, record]) {
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length > 0) {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

function governanceModelKnown(): boolean {
  const model = useChatStore.getState().governanceModel;
  return model === "single" || model === "trio";
}

function defaultAction(): GovernanceMode {
  const record = useChatStore.getState().governanceRecord;
  if (record && record.state === "pin-mismatch") return "reaccept";
  return "establish";
}

const EMPTY_STATE: GovernancePreviewState = {
  open: false,
  mode: "establish",
  modelChoice: "single",
  loading: false,
  busy: false,
  preview: null,
  reaccept: null,
  establish: null,
  migration: null,
  previewDigest: "",
  canConfirm: false,
  result: null,
  error: null,
  nextStep: "",
};

function digestValid(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

export const useGovernanceStore = create<GovernanceState>((set, get) => ({
  ...EMPTY_STATE,

  openPreview: async (mode) => {
    const projectRoot = useChatStore.getState().projectRoot;
    const target = mode || defaultAction();
    // 同一预览（同模式）已打开/在途时幂等（重复点击不重复预览）。
    if (get().open && get().mode === target && (get().loading || get().preview !== null)) {
      return;
    }
    const bridge = getDesktopBridge();
    const known = governanceModelKnown();
    const chat = useChatStore.getState();
    set({
      ...EMPTY_STATE,
      open: true,
      mode: target,
      modelChoice:
        known && chat.governanceModel === "trio" ? "trio" : "single",
      loading: true,
      nextStep: get().nextStep,
    });
    let res: unknown = null;
    try {
      if (!projectRoot) {
        res = {
          ok: false,
          status: "invalid-request",
          message: translate(currentLocale(), "ui.sidebar.noProjectPeriod"),
        };
      } else if (target === "reaccept") {
        res = bridge?.previewGovernanceReacceptance
          ? await bridge.previewGovernanceReacceptance(projectRoot)
          : {
              ok: false,
              status: "invalid-request",
              message: translate(currentLocale(), "ui.governanceStore.previewUnavailable"),
            };
      } else if (target === "migrate") {
        res = bridge?.previewGovernanceMigration
          ? await bridge.previewGovernanceMigration(projectRoot)
          : {
              ok: false,
              status: "not-available",
              message: translate(currentLocale(), "ui.governanceStore.migrationUnavailable"),
            };
      } else {
        if (!bridge?.previewGovernanceRecord) {
          res = {
            ok: false,
            code: "unavailable",
            message: translate(currentLocale(), "ui.governanceStore.previewUnavailable"),
          };
        } else if (known) {
          res = await bridge.previewGovernanceRecord(projectRoot, {
            governanceModel: get().modelChoice,
          });
        } else {
          res = await bridge.previewGovernanceRecord(projectRoot);
        }
      }
    } catch (error) {
      res = {
        ok: false,
        status: "invalid-request",
        code: "error",
        message: String(error),
      };
    }
    if (useChatStore.getState().projectRoot !== projectRoot) return;
    const record = asRecord(res);
    if (record.ok !== true) {
      const status = asString(record.status) || asString(record.code);
      const message =
        asString(record.message) || translate(currentLocale(), "ui.governanceStore.previewFailed");
      if (target === "reaccept") {
        const view = governanceReacceptFailureView("guard", status, message, currentLocale());
        set({
          loading: false,
          error: { message: view.lines[0] || message, detail: view.lines.slice(1).join(" ") },
        });
      } else if (target === "migrate") {
        const view = governanceMigrationFailureView("guard", status, message, currentLocale());
        set({
          loading: false,
          result: { kind: "failure", lines: view.lines, noRetry: view.noRetry },
        });
      } else {
        const view = governanceFailureView(
          "guard",
          asString(record.code),
          message,
          currentLocale(),
        );
        set({
          loading: false,
          result: { kind: "failure", lines: view.lines, noRetry: view.noRetry },
        });
      }
      return;
    }
    const preview = previewOf(res);
    if (target === "reaccept") {
      const view = governanceReacceptPreviewView(preview, currentLocale());
      set({
        loading: false,
        preview,
        reaccept: view,
        previewDigest: view.previewDigest,
        canConfirm: view.canConfirm && digestValid(view.previewDigest) && view.blockerLines.length === 0,
      });
      return;
    }
    if (target === "migrate") {
      const view = governanceMigrationPreviewView(preview, currentLocale());
      set({
        loading: false,
        preview,
        migration: view,
        previewDigest: view.digest,
        canConfirm: view.canConfirm,
      });
      return;
    }
    const view = governanceEstablishPreviewView(preview, currentLocale());
    set({
      loading: false,
      preview,
      establish: view,
      previewDigest: "",
      canConfirm: view.canConfirm && known && view.blockers.length === 0,
    });
  },

  selectModel: async (model) => {
    if (get().mode !== "establish" || get().busy) return;
    set({ modelChoice: model });
    const projectRoot = useChatStore.getState().projectRoot;
    const bridge = getDesktopBridge();
    if (!projectRoot || !bridge?.previewGovernanceRecord || !governanceModelKnown()) return;
    set({ loading: true });
    let res: unknown = null;
    try {
      res = await bridge.previewGovernanceRecord(projectRoot, { governanceModel: model });
    } catch (error) {
      res = { ok: false, code: "error", message: String(error) };
    }
    if (useChatStore.getState().projectRoot !== projectRoot || get().mode !== "establish") return;
    const record = asRecord(res);
    if (record.ok !== true) {
      const view = governanceFailureView(
        "guard",
        asString(record.code),
        asString(record.message),
        currentLocale(),
      );
      set({
        loading: false,
        result: { kind: "failure", lines: view.lines, noRetry: view.noRetry },
      });
      return;
    }
    const preview = previewOf(res);
    const view = governanceEstablishPreviewView(preview, currentLocale());
    set({
      loading: false,
      preview,
      establish: view,
      canConfirm: view.canConfirm && view.blockers.length === 0,
    });
  },

  confirm: async () => {
    const state = get();
    if (!state.open || state.busy || !state.canConfirm) return;
    const projectRoot = useChatStore.getState().projectRoot;
    if (!projectRoot) return;
    const bridge = getDesktopBridge();
    set({ busy: true, result: null, error: null });
    let res: unknown = null;
    try {
      if (state.mode === "reaccept") {
        res = bridge?.reacceptGovernancePins
          ? await bridge.reacceptGovernancePins(projectRoot, state.previewDigest)
          : {
              ok: false,
              phase: "guard",
              status: "invalid-request",
              message: translate(currentLocale(), "ui.governanceStore.reacceptUnavailable"),
            };
      } else if (state.mode === "migrate") {
        res = bridge?.migrateGovernanceModel
          ? await bridge.migrateGovernanceModel(projectRoot, state.previewDigest)
          : {
              ok: false,
              phase: "guard",
              status: "invalid-request",
              message: translate(currentLocale(), "ui.governanceStore.migrationUnavailable"),
            };
      } else {
        const options: Record<string, unknown> = {};
        if (governanceModelKnown()) options.governanceModel = state.modelChoice;
        res = bridge?.establishGovernanceRecord
          ? await bridge.establishGovernanceRecord(projectRoot, options)
          : {
              ok: false,
              phase: "guard",
              code: "unavailable",
              finalize: {
                status: "blocked",
                message: translate(currentLocale(), "ui.governanceStore.establishUnavailable"),
              },
            };
      }
    } catch (error) {
      res = { ok: false, phase: "guard", status: "invalid-request", message: String(error) };
    }
    if (useChatStore.getState().projectRoot !== projectRoot) return;
    const record = asRecord(res);
    const phase = record.phase === "write" ? "write" : "guard";
    if (state.mode === "reaccept") {
      const status = asString(record.status);
      const message = asString(record.message);
      if (record.ok === true && status === "completed") {
        const view = get().reaccept;
        const lines = [
          message ||
            governanceReacceptSuccessText(
              view?.pinCount,
              view?.changed.length,
              currentLocale(),
            ),
        ];
        // 成功时清掉可能残留的「已取消」提示（旧同口径），不与成功文案并存。
        useChatStore.getState().setHint("");
        set({ busy: false, result: { kind: "success", lines, noRetry: true }, canConfirm: false });
        return;
      }
      const view = governanceReacceptFailureView(
        phase,
        status,
        message || translate(currentLocale(), "ui.governanceStore.reacceptFailed"),
        currentLocale(),
      );
      set({ busy: false, result: { kind: "failure", lines: view.lines, noRetry: view.noRetry } });
      return;
    }
    if (state.mode === "migrate") {
      const status = asString(record.status);
      const message = asString(record.message);
      if (record.ok === true && status === "completed") {
        set({
          busy: false,
          result: {
            kind: "success",
            lines: [governanceMigrationSuccessText(currentLocale())],
            noRetry: true,
          },
          canConfirm: false,
        });
        return;
      }
      const view = governanceMigrationFailureView(phase, status, message, currentLocale());
      set({ busy: false, result: { kind: "failure", lines: view.lines, noRetry: view.noRetry } });
      return;
    }
    const finalize = asRecord(record.finalize);
    const code = asString(record.code);
    const message = asString(finalize.message);
    if (record.ok === true && phase === "write" && finalize.status === "completed") {
      set({
        busy: false,
        result: {
          kind: "success",
          lines: [
            message,
            translate(currentLocale(), "ui.governanceStore.reacceptEffect"),
          ].filter((line) => line !== ""),
          noRetry: true,
        },
        canConfirm: false,
      });
      return;
    }
    const view = governanceFailureView(
      phase,
      code,
      message || translate(currentLocale(), "ui.governanceStore.establishFailed"),
      currentLocale(),
    );
    set({ busy: false, result: { kind: "failure", lines: view.lines, noRetry: view.noRetry } });
  },

  cancel: () => {
    if (get().busy) return;
    set({ ...EMPTY_STATE, open: false, nextStep: get().nextStep });
    useChatStore.getState().setHint(translate(currentLocale(), "ui.governanceStore.cancelled"));
  },

  close: () => {
    set({ ...EMPTY_STATE, open: false, nextStep: get().nextStep });
  },

  setNextStep: (payload) => {
    const record = asRecord(payload);
    if (record.version !== 1) return;
    const nextFunction = asString(record.nextFunction);
    const roleId = asString(record.roleId);
    const cardKind = asString(record.cardKind);
    if (!nextFunction && !roleId) return;
    // 兜底步骤名来自 shared key（`ui.governanceStore.stepFallback`）。
    const parts = [
      translate(currentLocale(), "ui.governanceStore.nextStep", {
        step:
          nextFunction ||
          cardKind ||
          translate(currentLocale(), "ui.governanceStore.stepFallback"),
      }),
    ];
    if (roleId) parts.push(roleId);
    if (asString(record.flowId)) {
      parts.push(
        translate(currentLocale(), "ui.governanceStore.flow", {
          flowId: asString(record.flowId),
        }),
      );
    }
    set({ nextStep: parts.join(" · ") });
  },
}));
