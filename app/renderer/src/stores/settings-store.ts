/**
 * 引擎设置视图状态（Phase 4A）：按引擎缓存只读配置摘要、面板加载/保存状态、
 * 缺配提示（当前会话引擎）、读取/保存版本守卫（晚到响应只丢弃）。
 *
 * 数据唯一来源：主进程 `runtime-config:get/save`（`getPiConfig` 兼容旧桥）。
 * 渲染侧不复制字段/校验表、不碰 fs、不回显秘密值。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import { useUiStore, type RuntimeId } from "@/stores/ui-store";
import {
  applicationLabel,
  buildConfigUpdates,
  configCompleteText,
  configWarningText,
  engineSettingsTitle,
  initialFieldValues,
  loadTokenCurrent,
  missingKeysOf,
  missingNoticeText,
  nextLoadToken,
  nextSaveToken,
  readFailureNoticeText,
  readFailureStatusText,
  readingNoticeText,
  runtimeLabel,
  saveExceptionStatusText,
  saveFailureStatusText,
  saveTokenCurrent,
  savedStatusText,
  savedStatusTitle,
  savingStatusText,
  validateRuntimeConfigView,
  type ConfigLoadToken,
  type ConfigSaveToken,
  type RuntimeConfigView,
} from "@/chat/runtime-config";

export type SettingsStatusKind = "ok" | "warn" | "err" | "";

export interface SettingsStatus {
  text: string;
  kind: SettingsStatusKind;
  /** 完整状态（逐键/完整 application），用于 title/追溯。 */
  title: string;
}

export interface ConfigNotice {
  visible: boolean;
  kind: "warn" | "err" | "";
  message: string;
  actionable: boolean;
}

export type MenuConfigStatus = "checking" | "configured" | "missing" | "unknown";

export interface MenuConfigSummary {
  status: MenuConfigStatus;
  missing: string[];
  projectRoot: string | null;
}

const EMPTY_VIEWS: Record<RuntimeId, RuntimeConfigView | null> = {
  pi: null,
  codex: null,
  claude: null,
};

const EMPTY_MENU: Record<RuntimeId, MenuConfigSummary> = {
  pi: { status: "unknown", missing: [], projectRoot: null },
  codex: { status: "unknown", missing: [], projectRoot: null },
  claude: { status: "unknown", missing: [], projectRoot: null },
};

// 菜单摘要的在途请求（每引擎一次；项目切换后旧回包只丢弃）。
const menuPending = new Set<RuntimeId>();
let menuProjectRoot: string | null = null;

interface SettingsState {
  /** 面板当前配置视图（仅切换配置视图，不切换会话引擎）。 */
  engine: RuntimeId;
  views: Record<RuntimeId, RuntimeConfigView | null>;
  /** 引擎菜单的配置摘要（按需读取/缓存；不导入预取三引擎）。 */
  menu: Record<RuntimeId, MenuConfigSummary>;
  loading: boolean;
  saving: boolean;
  readError: string;
  status: SettingsStatus;
  notice: ConfigNotice;
  viewsProjectRoot: string | null;
  setEngine: (runtime: RuntimeId) => void;
  load: (runtime?: RuntimeId) => Promise<{ view: RuntimeConfigView; missing: string[] } | undefined>;
  ensureMenuSummaries: (runtimes: RuntimeId[]) => Promise<void>;
  saveValues: (
    runtime: RuntimeId,
    fields: RuntimeConfigView["fields"],
    values: Record<string, string>,
  ) => Promise<boolean>;
  /** 会话引擎切换：面板跟随当前引擎并刷新（一次读取）。 */
  followRuntime: (runtime: RuntimeId) => Promise<void>;
  /** 项目切换：清空跨项目视图与状态。 */
  projectChanged: (projectRoot: string | null) => void;
  dismissNotice: () => void;
  initialValues: () => Record<string, string>;
}

let loadVersion = 0;
let saveVersion = 0;
let lastLoad: ConfigLoadToken = { version: 0, runtime: "", projectRoot: null };
let lastSave: ConfigSaveToken = { version: 0, runtime: "", projectRoot: null };

function projectRoot(): string | null {
  return useChatStore.getState().projectRoot;
}

function currentRuntime(): RuntimeId {
  return useUiStore.getState().runtime;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function setStatus(
  text: string,
  kind: SettingsStatusKind = "",
  title?: string,
): void {
  useSettingsStore.setState({ status: { text, kind, title: title || text } });
}

function hiddenNotice(): ConfigNotice {
  return { visible: false, kind: "", message: "", actionable: false };
}

function summaryFromView(view: RuntimeConfigView | null, root: string | null): MenuConfigSummary {
  if (!view) return { status: "unknown", missing: [], projectRoot: root };
  const missing = missingKeysOf(view);
  return {
    status: missing.length > 0 ? "missing" : "configured",
    missing,
    projectRoot: root,
  };
}

function setMenuSummary(runtime: RuntimeId, summary: MenuConfigSummary): void {
  useSettingsStore.setState((state) => ({
    menu: { ...state.menu, [runtime]: summary },
  }));
}

/** 当前会话引擎的缺配条（只对当前 runtime + 当前项目生效）。 */
function applyNotice(
  runtime: RuntimeId,
  view: RuntimeConfigView | null,
  error?: string,
): void {
  if (runtime !== currentRuntime()) return;
  const root = projectRoot();
  if (!root) {
    useSettingsStore.setState({ notice: hiddenNotice() });
    return;
  }
  const label = runtimeLabel(runtime);
  if (error !== undefined) {
    useSettingsStore.setState({
      notice: {
        visible: true,
        kind: "err",
        message: readFailureNoticeText(label),
        actionable: true,
      },
    });
    return;
  }
  if (!view) {
    useSettingsStore.setState({ notice: hiddenNotice() });
    return;
  }
  const missing = missingKeysOf(view);
  useSettingsStore.setState({
    notice: missing.length
      ? {
          visible: true,
          kind: "warn",
          message: missingNoticeText(label, missing),
          actionable: true,
        }
      : hiddenNotice(),
  });
}

function applyPanelView(runtime: RuntimeId, view: RuntimeConfigView): void {
  const store = useSettingsStore.getState();
  if (runtime !== store.engine) return;
  const missing = missingKeysOf(view);
  const label = runtimeLabel(runtime);
  useSettingsStore.setState({
    views: { ...store.views, [runtime]: view },
    loading: false,
    readError: "",
  });
  if (missing.length > 0) {
    setStatus(configWarningText(label, missing), "warn");
  } else {
    setStatus(configCompleteText(label, view.application), "ok");
  }
}

function applyPanelError(runtime: RuntimeId, error: unknown): void {
  const store = useSettingsStore.getState();
  if (runtime !== store.engine) return;
  setStatus(readFailureStatusText(error), "err");
  useSettingsStore.setState({
    views: { ...store.views, [runtime]: null },
    loading: false,
    readError: error instanceof Error ? error.message : String(error ?? ""),
  });
}

async function readView(runtime: RuntimeId): Promise<RuntimeConfigView> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("当前环境未提供配置通道");
  let raw: unknown;
  if (bridge.getRuntimeConfig) {
    raw = await bridge.getRuntimeConfig(runtime);
  } else if (runtime === "pi" && bridge.getPiConfig) {
    raw = await bridge.getPiConfig();
  } else {
    throw new Error("当前版本未提供配置通道");
  }
  const validation = validateRuntimeConfigView(raw, runtime);
  if (!validation.ok || !validation.view) {
    throw new Error(validation.error || "配置摘要未就绪");
  }
  return validation.view;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  engine: DEFAULT_SETTINGS_ENGINE(),
  views: { ...EMPTY_VIEWS },
  menu: { ...EMPTY_MENU },
  loading: false,
  saving: false,
  readError: "",
  status: { text: "", kind: "", title: "" },
  notice: hiddenNotice(),
  viewsProjectRoot: null,

  setEngine: (runtime) => {
    set({ engine: runtime });
    void get().load(runtime);
  },

  load: async (runtime) => {
    const engine = runtime || get().engine;
    const root = projectRoot();
    const token = nextLoadToken(loadVersion, engine, root);
    loadVersion = token.version;
    lastLoad = token;
    if (root) {
      if (get().engine === engine) {
        set({ loading: true, readError: "" });
        setStatus(readingNoticeText(runtimeLabel(engine)), "");
        applyNotice(engine, null);
        if (engine === currentRuntime()) {
          set({
            notice: {
              visible: true,
              kind: "",
              message: readingNoticeText(runtimeLabel(engine)),
              actionable: false,
            },
          });
        }
      }
    }
    let view: RuntimeConfigView | null = null;
    try {
      view = await readView(engine);
      if (!loadTokenCurrent(token, lastLoad, engine, projectRoot())) {
        return undefined;
      }
      set((state) => ({
        views: { ...state.views, [engine]: view! },
        viewsProjectRoot: root,
      }));
      menuProjectRoot = root;
      setMenuSummary(engine, summaryFromView(view, root));
      applyPanelView(engine, view);
      applyNotice(engine, view);
      return { view, missing: missingKeysOf(view) };
    } catch (error) {
      if (!loadTokenCurrent(token, lastLoad, engine, projectRoot())) {
        return undefined;
      }
      menuProjectRoot = root;
      setMenuSummary(engine, { status: "unknown", missing: [], projectRoot: root });
      applyPanelError(engine, error);
      applyNotice(engine, null, error instanceof Error ? error.message : String(error ?? ""));
      return undefined;
    }
  },

  ensureMenuSummaries: async (runtimes) => {
    const root = projectRoot();
    if (!root) return;
    const tasks: Array<Promise<void>> = [];
    for (const runtime of runtimes) {
      const summary = get().menu[runtime];
      // 已缓存且属于当前项目 ⇒ 不重复读取；在途引擎只等待一次。
      if (summary.projectRoot === root && summary.status !== "unknown") continue;
      if (menuPending.has(runtime)) continue;
      menuPending.add(runtime);
      setMenuSummary(runtime, { ...summary, status: "checking", projectRoot: root });
      tasks.push(
        (async () => {
          let view: RuntimeConfigView | null = null;
          try {
            view = await readView(runtime);
          } catch {
            view = null;
          } finally {
            menuPending.delete(runtime);
          }
          if (projectRoot() !== root) return; // 项目切换：旧回包丢弃
          setMenuSummary(
            runtime,
            view
              ? summaryFromView(view, root)
              : { status: "unknown", missing: [], projectRoot: root },
          );
        })(),
      );
    }
    await Promise.all(tasks);
  },

  saveValues: async (runtime, fields, values) => {
    const root = projectRoot();
    const token = nextSaveToken(saveVersion, runtime, root);
    saveVersion = token.version;
    lastSave = token;
    // 保存期间到达的旧读取不得覆盖保存后的状态。
    loadVersion += 1;
    lastLoad = { version: loadVersion, runtime, projectRoot: root };
    set({ saving: true });
    setStatus(savingStatusText(), "");
    let res: Record<string, unknown> = {};
    try {
      const bridge = getDesktopBridge();
      const updates = buildConfigUpdates(fields, values);
      if (bridge?.saveRuntimeConfig) {
        res = asRecord(await bridge.saveRuntimeConfig({ runtime, updates }));
      } else if (runtime === "pi" && bridge?.savePiConfig) {
        res = asRecord(await bridge.savePiConfig(updates));
      } else {
        res = { ok: false, error: "当前版本未提供配置保存通道" };
      }
    } catch (error) {
      if (!saveTokenCurrent(token, lastSave, runtime, projectRoot())) {
        set({ saving: false });
        return false;
      }
      set({ saving: false });
      setStatus(saveExceptionStatusText(error), "err");
      return false;
    }
    if (!saveTokenCurrent(token, lastSave, runtime, projectRoot())) {
      set({ saving: false });
      return false;
    }
    if (res.ok !== true) {
      set({ saving: false });
      setStatus(saveFailureStatusText(res.error), "err");
      return false;
    }
    const appliedKeys = Array.isArray(res.appliedKeys)
      ? res.appliedKeys.filter((key): key is string => typeof key === "string")
      : [];
    const application = asString(res.application) || "next-session";
    // 保存成功后重读：读取失败时不把「已保存」写成「已齐备」。
    const refreshed = await get().load(runtime);
    set({ saving: false });
    if (!saveTokenCurrent(token, lastSave, runtime, projectRoot())) {
      return true;
    }
    if (refreshed && get().engine === runtime) {
      setStatus(
        savedStatusText(appliedKeys, refreshed.missing, application),
        refreshed.missing.length > 0 ? "warn" : "ok",
        savedStatusTitle(appliedKeys, refreshed.missing, application),
      );
      useSettingsStore.setState({
        views: { ...get().views, [runtime]: refreshed.view },
      });
    }
    return true;
  },

  followRuntime: async (runtime) => {
    set({ engine: runtime });
    await get().load(runtime);
  },

  projectChanged: (root) => {
    lastLoad = nextLoadToken(loadVersion, "", root);
    loadVersion = lastLoad.version;
    menuPending.clear();
    menuProjectRoot = root;
    set({
      views: { ...EMPTY_VIEWS },
      menu: { ...EMPTY_MENU },
      loading: false,
      saving: false,
      readError: "",
      status: { text: "", kind: "", title: "" },
      notice: hiddenNotice(),
      viewsProjectRoot: root,
      engine: currentRuntime(),
    });
  },

  dismissNotice: () => set({ notice: hiddenNotice() }),

  initialValues: () => {
    const view = get().views[get().engine];
    return initialFieldValues(view?.fields || []);
  },
}));

/** 默认面板引擎 = 当前会话引擎（打开设置时与之一致；不预取三引擎）。 */
function DEFAULT_SETTINGS_ENGINE(): RuntimeId {
  return typeof window === "undefined" ? "claude" : useUiStore.getState().runtime;
}

/** 切引擎/切项目：在途保存的迟到回包只丢弃（不覆盖新视图状态）。 */
export function invalidatePendingSaves(): void {
  saveVersion += 1;
  lastSave = { version: saveVersion, runtime: "", projectRoot: null };
}

export function settingsEngineTitle(): string {
  return engineSettingsTitle(runtimeLabel(useSettingsStore.getState().engine));
}

export function applicationText(application: unknown): string {
  return applicationLabel(application);
}

/** 菜单项状态文字（文字为主，不只靠颜色；失败显示「配置未知」而非「缺配置」）。 */
export function menuConfigStatusText(summary: MenuConfigSummary | undefined): string {
  if (!summary || summary.status === "checking") return "检查中…";
  if (summary.status === "configured") return "已配置";
  if (summary.status === "missing") return "缺配置";
  return "配置未知";
}

export function menuConfigStatusKind(summary: MenuConfigSummary | undefined): MenuConfigStatus {
  return summary ? summary.status : "unknown";
}

/** 当前会话引擎缺配条文案（组件只读快照，不另算）。 */
export function currentNotice(): ConfigNotice {
  return useSettingsStore.getState().notice;
}

/**
 * 打开设置/缺配条点击的统一入口：面板引擎跟随给定引擎（缺省＝当前会话引擎），
 * 并读取一次该引擎配置。
 */
export async function openSettingsPanel(runtime?: RuntimeId): Promise<void> {
  const engine = runtime || currentRuntime();
  useSettingsStore.setState({ engine });
  await useSettingsStore.getState().load(engine);
}
