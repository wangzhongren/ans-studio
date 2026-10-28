/**
 * 测试驱动：`window.__ansRenderer`（Phase 4A）。
 *
 * 同名同语义接入真实 store/动作；仅暴露已具备的能力。未实现的方法集中列入
 * `unimplemented`，不提供假实现。4B 通过 `driver-extensions/*.ts` 追加方法。
 */

import { flushSync } from "react-dom";
import { useChatStore } from "@/chat/chat-store";
import {
  judgeToggleView,
  JUDGE_GROUP_APPROVAL,
  JUDGE_GROUP_DECISION,
} from "@/chat/judge";
import { switchRuntime } from "@/chat/ipc";
import { saveSettingsFormFromDom } from "@/shell/SettingsPanel";
import { useConfirmStore } from "@/stores/confirm-store";
import { useDrawerStore, openSettingsDrawer } from "@/stores/drawer-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  RUNTIME_OPTIONS,
  useUiStore,
  type RuntimeId,
} from "@/stores/ui-store";
import { isRuntimeId } from "@/chat/runtime-config";

export type ConfirmDemoDecision = "allow" | "deny";

export interface AnsRendererStateSnapshot {
  demo: boolean;
  projectRoot: string | null;
  primaryRoleId: string | null;
  selectedRoleId: string | null;
  runtime: RuntimeId;
  sessionOpenRoleId: string | null;
  rightTab: "card" | "work" | "pi" | "document" | "decisions" | "tasks" | null;
  roleBusy: Record<string, boolean>;
  roleMeta: Record<string, unknown>;
  hasRoles: boolean;
  roles: Array<Record<string, unknown>>;
  queueByRole: Record<string, unknown[]>;
  shellConfirm: { id: string; payload: Record<string, unknown> } | null;
  recoveryConfirm: { id: string; payload: Record<string, unknown> } | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  confirmOpen: boolean;
  confirmLastDecision: ConfirmDemoDecision;
  governanceModel: "single" | "trio" | null;
  governanceRecord: Record<string, unknown> | null;
  hint: string;
}

export interface JudgeDriverView {
  available: boolean;
  enabled: boolean;
  busy: boolean;
  error: string;
  singleDisabled: boolean;
  label: string;
}

export interface AnsRendererDriver {
  readonly state: AnsRendererStateSnapshot;
  loadProject: (projectRoot: string) => Promise<unknown>;
  refreshProject: () => Promise<void>;
  refreshLiveRoles: () => Promise<void>;
  selectRole: (roleId: string) => Promise<boolean>;
  selectRuntime: (runtime: string) => Promise<boolean>;
  openPiPanel: (tab?: string) => Promise<void>;
  loadPiConfig: () => Promise<{ view: unknown; missing: string[] } | undefined>;
  savePiConfigFromForm: () => Promise<boolean>;
  readonly piKeys: string[];
  openConfirmDemo: (payload?: Record<string, unknown>) => void;
  sidebar: {
    collapsed: () => boolean;
    toggle: () => void;
    set: (collapsed: boolean) => void;
    width: () => number;
    setWidth: (width: number) => number;
  };
  drawer: {
    open: () => void;
    close: () => void;
    toggle: () => void;
    isOpen: () => boolean;
  };
  confirmDemo: {
    open: (payload?: Record<string, unknown>) => void;
    close: (decision?: ConfirmDemoDecision) => void;
    state: () => {
      open: boolean;
      payload: Record<string, unknown> | null;
      lastDecision: ConfirmDemoDecision;
    };
  };
  onShellConfirm: (payload: unknown) => void;
  shellConfirmRespond: (input: unknown) => Promise<void>;
  onRecoveryConfirm: (payload: unknown) => void;
  recoveryConfirmRespond: (input: unknown) => Promise<void>;
  shellJudge: {
    state: () => JudgeDriverView;
    onResult: (payload: unknown) => void;
  };
  decisionJudge: {
    state: () => JudgeDriverView;
    onResult: (payload: unknown) => void;
  };
  rowModelDebug: (roleId: string) => unknown;
  paneDebug: (roleId: string) => unknown;
  onRoleState: (payload: unknown) => void;
  onOperatorExpired: (payload: unknown) => void;
  onOperatorQueued: (payload: unknown) => void;
  appendOperatorRequest: (payload: unknown) => void;
  queuedDebug: () => string[];
  send: {
    disabled: () => boolean;
  };
  composer: {
    state: () => { text: string; sendDisabled: boolean };
  };
  unimplemented: readonly string[];
  [key: string]: unknown;
}

declare global {
  interface Window {
    __ansRenderer?: AnsRendererDriver;
  }
}

const UNIMPLEMENTED: readonly string[] = [];

interface DriverExtensionModule {
  default?: Record<string, unknown>;
  extend?: Record<string, unknown>;
}

/** 4B 驱动扩展点：`driver-extensions/*.ts` 导出对象，合并进 `window.__ansRenderer`。 */
const driverExtensionModules = import.meta.glob<DriverExtensionModule>(
  "./driver-extensions/*.ts",
  { eager: true },
);

let lastDemoDecision: ConfirmDemoDecision = "deny";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function cardState(
  card: { id: string; payload: Record<string, unknown> } | null,
): { id: string; payload: Record<string, unknown> } | null {
  return card ? { id: card.id, payload: card.payload } : null;
}

function snapshot(): AnsRendererStateSnapshot {
  const ui = useUiStore.getState();
  const chat = useChatStore.getState();
  const confirm = useConfirmStore.getState();
  const drawer = useDrawerStore.getState();
  const rightTab = ui.drawerOpen ? drawer.tab || "card" : null;
  // 旧驱动快照的 queueByRole 是「摘要字符串数组」（message-queue/renderer 口径）；
  // 新 store 内部保存完整队列记录（含 id/full/撤回资格），快照层只投影摘要，避免改变旧消费方。
  const queueByRole = Object.fromEntries(
    Object.entries(chat.queueByRole).map(([roleId, queue]) => [
      roleId,
      queue.map((item) => (typeof item.summary === "string" ? item.summary : "")),
    ]),
  );
  return {
    demo: false,
    projectRoot: chat.projectRoot,
    primaryRoleId: chat.primaryRoleId,
    selectedRoleId: ui.selectedRoleId || null,
    runtime: ui.runtime,
    sessionOpenRoleId: chat.sessionOpenRoleId,
    rightTab,
    roleBusy: chat.roleBusy,
    roleMeta: chat.roleMeta,
    hasRoles: chat.hasRoles,
    roles: chat.roles as unknown as Array<Record<string, unknown>>,
    queueByRole,
    shellConfirm: cardState(confirm.shellConfirm),
    recoveryConfirm: cardState(confirm.recoveryConfirm),
    sidebarWidth: ui.sidebarWidth,
    sidebarCollapsed: ui.sidebarCollapsed,
    drawerOpen: ui.drawerOpen,
    confirmOpen: !!confirm.shellConfirm,
    confirmLastDecision: lastDemoDecision,
    governanceModel: chat.governanceModel,
    governanceRecord: chat.governanceRecord,
    hint: chat.hint,
  };
}

function sendDisabled(): boolean {
  const el = document.getElementById("btn-send");
  return !(el instanceof HTMLButtonElement) || el.disabled;
}

function judgeView(group: "approval" | "decision"): JudgeDriverView {
  const state = useConfirmStore.getState().judge[group];
  const singleDisabled =
    group === JUDGE_GROUP_DECISION &&
    useChatStore.getState().governanceModel === "single";
  const view = judgeToggleView(
    group === JUDGE_GROUP_DECISION ? JUDGE_GROUP_DECISION : JUDGE_GROUP_APPROVAL,
    state.available,
    state.enabled,
    state.busy,
    { singleDisabled },
  );
  return {
    available: view.available,
    enabled: view.enabled,
    busy: state.busy,
    error: state.error,
    singleDisabled,
    label: view.label,
  };
}

function createDriver(): AnsRendererDriver {
  const driver: AnsRendererDriver = {
    get state() {
      return snapshot();
    },
    loadProject: (projectRoot) =>
      useChatStore.getState().loadProject(projectRoot),
    refreshProject: () => useChatStore.getState().refreshProject(),
    refreshLiveRoles: () => useChatStore.getState().refreshLiveRoles(),
    selectRole: async (roleId) => {
      if (!roleId) return false;
      await useChatStore.getState().selectRole(roleId);
      return true;
    },
    selectRuntime: async (runtime) => {
      if (!isRuntimeId(runtime)) return false;
      if (!RUNTIME_OPTIONS.some((option) => option.id === runtime)) return false;
      return switchRuntime(runtime as RuntimeId);
    },
    openPiPanel: async (tab) => {
      const engine = isRuntimeId(tab) ? tab : useUiStore.getState().runtime;
      openSettingsDrawer(engine);
      await useSettingsStore.getState().load(engine);
    },
    loadPiConfig: async () => {
      const runtime = useUiStore.getState().runtime;
      const result = await useSettingsStore.getState().load(runtime);
      return result;
    },
    savePiConfigFromForm: () => saveSettingsFormFromDom(),
    get piKeys() {
      const view = useSettingsStore.getState().views.pi;
      return view ? view.fields.map((field) => field.key) : [];
    },
    openConfirmDemo: (payload) => {
      useConfirmStore.getState().receiveShell({
        id: "demo-shell-confirm",
        policy: "project",
        command: "npm run build",
        summary: "构建项目（演示数据）",
        reasonPlain: "演示：不会执行任何命令。",
        cwd: "",
        argvLines: [],
        ...payload,
      });
    },
    sidebar: {
      collapsed: () => useUiStore.getState().sidebarCollapsed,
      toggle: () => useUiStore.getState().toggleSidebar(),
      set: (collapsed) =>
        flushSync(() => {
          useUiStore.getState().setSidebarCollapsed(collapsed === true);
        }),
      width: () => useUiStore.getState().sidebarWidth,
      setWidth: (width) => {
        let next = useUiStore.getState().sidebarWidth;
        flushSync(() => {
          next = useUiStore.getState().setSidebarWidth(width);
        });
        return next;
      },
    },
    drawer: {
      open: () => {
        useDrawerStore.setState((state) => ({
          tab: state.tab || "card",
          nonce: state.nonce + 1,
        }));
        useUiStore.getState().setDrawerOpen(true);
      },
      close: () => useDrawerStore.getState().close(),
      toggle: () =>
        useUiStore.getState().drawerOpen
          ? useDrawerStore.getState().close()
          : driver.drawer.open(),
      isOpen: () => useUiStore.getState().drawerOpen,
    },
    confirmDemo: {
      open: (payload) => {
        useConfirmStore.getState().receiveShell({
          id: "demo-shell-confirm",
          policy: "project",
          command: "npm run build",
          summary: "构建项目（演示数据）",
          reasonPlain: "演示：不会执行任何命令。",
          cwd: "",
          argvLines: [],
          ...payload,
        });
      },
      close: (decision = "deny") => {
        lastDemoDecision = decision;
        useConfirmStore.getState().dismissShell();
      },
      state: () => {
        const card = useConfirmStore.getState().shellConfirm;
        return {
          open: !!card,
          payload: card ? card.payload : null,
          lastDecision: lastDemoDecision,
        };
      },
    },
    onShellConfirm: (payload) => {
      useConfirmStore.getState().receiveShell(payload);
    },
    shellConfirmRespond: async (input) => {
      const record = asRecord(input);
      const current = useConfirmStore.getState().shellConfirm;
      if (current && record.id === current.id) {
        await useConfirmStore.getState().respondShell(record.allow === true);
      }
    },
    onRecoveryConfirm: (payload) => {
      useConfirmStore.getState().receiveRecovery(payload);
    },
    recoveryConfirmRespond: async (input) => {
      const record = asRecord(input);
      const current = useConfirmStore.getState().recoveryConfirm;
      if (current && record.id === current.id) {
        await useConfirmStore.getState().respondRecovery(record.allow === true);
      }
    },
    shellJudge: {
      state: () => judgeView("approval"),
      onResult: (payload) => {
        useChatStore.getState().appendShellJudgeResult(payload);
      },
    },
    decisionJudge: {
      state: () => judgeView("decision"),
      onResult: (payload) => {
        useChatStore.getState().appendGovernanceJudgeResult(payload);
      },
    },
    rowModelDebug: (roleId) => useChatStore.getState().rowModelDebug(roleId),
    paneDebug: (roleId) => useChatStore.getState().paneDebug(roleId),
    onRoleState: (payload) => useChatStore.getState().applyRoleState(payload),
    onOperatorExpired: (payload) => {
      const record = asRecord(payload);
      const id = typeof record.id === "string" ? record.id : "";
      if (!id) return;
      useChatStore
        .getState()
        .expireOperator(id, typeof record.reason === "string" ? record.reason : undefined);
      useConfirmStore.getState().expireShell(id, record.reason);
    },
    onOperatorQueued: (payload) => useChatStore.getState().queueOperator(payload),
    appendOperatorRequest: (payload) =>
      useChatStore.getState().appendOperatorRequest(payload),
    queuedDebug: () => Object.keys(useChatStore.getState().queuedOperator),
    send: {
      disabled: sendDisabled,
    },
    composer: {
      state: () => {
        const el = document.getElementById("inp-message");
        return {
          text: el instanceof HTMLTextAreaElement ? el.value : "",
          sendDisabled: sendDisabled(),
        };
      },
    },
    unimplemented: UNIMPLEMENTED,
  };

  for (const module of Object.values(driverExtensionModules)) {
    const extension = module.extend || module.default;
    if (extension && typeof extension === "object") {
      Object.assign(driver, extension);
    }
  }
  return driver;
}

export function installTestDriver(): void {
  if (typeof window === "undefined") return;
  window.__ansRenderer = createDriver();
}
