/// <reference lib="dom" />
/**
 * 渲染层应用级 locale 状态（i18n B0，桌面UI）。
 *
 * 契约（方案 §4.6/§4.7、验收 P2/P3）：
 *  · locale 是**应用级**偏好（`zh-CN` 默认 / `en-US`），不随项目、角色、引擎变化；
 *  · `<userData>/ans/preferences.json` 是权威（主进程），`localStorage["ans.locale"]`
 *    只是首屏镜像；启动顺序：同步读镜像 → 更新 `<html lang>` → `getPreferences()` 校正
 *    （文件权威，不一致回写镜像）→ 订阅 `onLocaleChanged` 广播；
 *  · `setLocale` 乐观更新 store/lang/镜像后调用 IPC；`ok:false`/异常时整体回滚并给出
 *    本地化错误（`ui.settings.language.saveFailed`，按回滚后的当前语言渲染）；
 *  · IPC/preload 不可用（旧 preload、测试替身）时**降级**：只用本地镜像，不崩溃、
 *    不阻塞 UI；
 *  · 翻译一律调用 shared `translate`（全仓唯一实现）；本模块不复制目录/resolver。
 *
 * 可测试性：`createLocaleStore(deps)` 接受注入的存储/DOM/桥依赖；生产单例
 * `useLocaleStore` 只经 `lib/platform` 访问 `window.desktop`（源码守卫）。
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { getDesktopBridge, type DesktopBridge } from "../lib/platform.ts";
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from "../../../../src/common/shared/i18n/index.ts";

/** localStorage 镜像键（只放语言偏好；治理/报告事实不写入 localStorage）。 */
export const LOCALE_STORAGE_KEY = "ans.locale";

/** 本地化错误文案 key（保存失败时按当前语言渲染）。 */
const SAVE_FAILED_KEY: MessageKey = "ui.settings.language.saveFailed";

/** 渲染层 locale 诊断码（机器标识，不翻译）。 */
export type LocaleStoreDiagnosticCode =
  | "locale.mirror.invalid"
  | "locale.preferences.readFailed"
  | "locale.preferences.saveFailed"
  | "locale.subscribe.failed";

/** 可注入依赖：测试不触碰真实 window/localStorage/document。 */
export interface LocaleStoreDeps {
  /** 读取 localStorage 镜像；不可用/不存在返回 null。 */
  readStoredLocale: () => string | null;
  /** 写 localStorage 镜像；不可用时静默。 */
  writeStoredLocale: (locale: Locale) => void;
  /** 更新 `<html lang>`；无 DOM 时静默。 */
  applyDocumentLang: (locale: Locale) => void;
  /** 读取 preload 桥；不可用返回 null。 */
  getBridge: () => DesktopBridge | null;
  /** 诊断回调（可选；抛错不影响 locale 流程）。 */
  onDiagnostic?: (code: LocaleStoreDiagnosticCode) => void;
}

/** translator 签名（与 shared `createTranslator` 返回值一致）。 */
export type Translator = (key: MessageKey, params?: MessageParams) => string;

export interface LocaleStoreState {
  /** 当前界面语言；默认 `zh-CN`。 */
  locale: Locale;
  /** 最近的本地化保存错误；成功后清空。 */
  error: string | null;
  /** `init()` 启动序列完成后为 true（IPC 不可用/失败也算完成）。 */
  initialized: boolean;
  /** 启动接线：镜像已同步读入；应用 lang；文件校正；订阅广播。重复调用不重复订阅。 */
  init: () => Promise<void>;
  /**
   * 切换语言。非法值返回 false 且不改任何状态。
   * 合法值：乐观更新 store/lang/镜像 → IPC；失败（`ok:false`/异常）回滚并返回 false；
   * IPC 不可用时保留本地镜像（降级）并返回 true。
   */
  setLocale: (next: string) => Promise<boolean>;
  /** 用当前 locale 翻译（组件应使用 `useT()` 以随 locale 重渲染）。 */
  t: Translator;
}

export type LocaleStoreApi = StoreApi<LocaleStoreState>;

function report(deps: LocaleStoreDeps, code: LocaleStoreDiagnosticCode): void {
  try {
    deps.onDiagnostic?.(code);
  } catch {
    /* 诊断是观测，不影响 locale 流程。 */
  }
}

function safeBridge(deps: LocaleStoreDeps): DesktopBridge | null {
  try {
    return deps.getBridge();
  } catch {
    return null;
  }
}

/** 首屏 locale：同步读镜像，合法值才采用；非法值回退默认并记诊断。 */
function readInitialLocale(deps: LocaleStoreDeps): Locale {
  let stored: string | null = null;
  try {
    stored = deps.readStoredLocale();
  } catch {
    stored = null;
  }
  if (stored === null) return DEFAULT_LOCALE;
  if (isLocale(stored)) return stored;
  report(deps, "locale.mirror.invalid");
  return DEFAULT_LOCALE;
}

function toLocale(value: unknown): Locale | null {
  return isLocale(value) ? value : null;
}

/**
 * 创建 locale store。生产环境用模块底部 `useLocaleStore`；测试用本工厂注入依赖。
 */
export function createLocaleStore(
  deps: LocaleStoreDeps = productionDeps(),
): LocaleStoreApi {
  let initPromise: Promise<void> | null = null;
  let unsubscribe: (() => void) | null = null;
  let requestSeq = 0;
  // 优先级版本号（方案 §4.6：本次运行用户切换 > 偏好文件快照）：用户切换与主进程
  // 广播都会递增；启动时读到的文件快照只在期间没有更高优先级变更时才应用。
  let revision = 0;

  return createStore<LocaleStoreState>()((set, get) => {
    const subscribeBroadcast = (): void => {
      if (unsubscribe !== null) return;
      const bridge = safeBridge(deps);
      const onLocaleChanged = bridge?.onLocaleChanged;
      if (typeof onLocaleChanged !== "function") return;
      try {
        const off = onLocaleChanged.call(bridge, (payload) => {
          const value = toLocale(
            payload && typeof payload === "object"
              ? (payload as { locale?: unknown }).locale
              : undefined,
          );
          if (value === null || value === get().locale) return;
          revision += 1;
          set({ locale: value, error: null });
          deps.applyDocumentLang(value);
          deps.writeStoredLocale(value);
        });
        unsubscribe = typeof off === "function" ? off : null;
      } catch {
        report(deps, "locale.subscribe.failed");
      }
    };

    const runInit = async (): Promise<void> => {
      // 1) 首屏镜像已在创建时同步读入；先让 <html lang> 与首屏一致。
      deps.applyDocumentLang(get().locale);

      // 2) 偏好文件权威校正（IPC 不可用/失败只降级，不阻塞 UI）。
      const bridge = safeBridge(deps);
      const readPreferences = bridge?.getPreferences;
      if (typeof readPreferences === "function") {
        const revisionAtRead = revision;
        try {
          const preferences = await readPreferences.call(bridge);
          const value = toLocale(
            preferences && typeof preferences === "object"
              ? (preferences as { locale?: unknown }).locale
              : undefined,
          );
          if (value === null) {
            report(deps, "locale.preferences.readFailed");
          } else if (revision === revisionAtRead && value !== get().locale) {
            revision += 1;
            set({ locale: value, error: null });
            deps.applyDocumentLang(value);
            deps.writeStoredLocale(value);
          }
        } catch {
          report(deps, "locale.preferences.readFailed");
        }
      }

      // 3) 订阅主进程广播：整个 store 生命周期只订阅一次。
      subscribeBroadcast();

      if (!get().initialized) set({ initialized: true });
    };

    return {
      locale: readInitialLocale(deps),
      error: null,
      initialized: false,

      init: () => {
        if (get().initialized) return Promise.resolve();
        if (initPromise !== null) return initPromise;
        initPromise = runInit();
        return initPromise;
      },

      setLocale: async (next) => {
        if (!isLocale(next)) return false;
        const previous = get().locale;
        if (next === previous) {
          if (get().error !== null) set({ error: null });
          return true;
        }

        const seq = ++requestSeq;
        revision += 1;
        set({ locale: next, error: null });
        deps.applyDocumentLang(next);
        deps.writeStoredLocale(next);

        const bridge = safeBridge(deps);
        const persist = bridge?.setLocale;
        if (typeof persist !== "function") {
          // IPC 不可用：保留本地镜像（降级），不当作失败、不阻塞 UI。
          return true;
        }

        let result: { ok?: unknown; locale?: unknown } | null = null;
        try {
          const raw = await persist.call(bridge, next);
          result =
            raw && typeof raw === "object"
              ? (raw as { ok?: unknown; locale?: unknown })
              : null;
        } catch {
          result = null;
        }
        const ok = result !== null && result.ok === true;
        if (seq !== requestSeq) return ok;

        if (ok) {
          // 以主进程返回的规范 locale 为准（白名单外的值忽略）。
          const confirmed = toLocale(result?.locale);
          if (confirmed !== null && confirmed !== get().locale) {
            set({ locale: confirmed });
            deps.applyDocumentLang(confirmed);
            deps.writeStoredLocale(confirmed);
          }
          return true;
        }

        // 失败：整体回滚（store/lang/镜像），错误按回滚后的语言渲染。
        set({ locale: previous, error: translate(previous, SAVE_FAILED_KEY) });
        deps.applyDocumentLang(previous);
        deps.writeStoredLocale(previous);
        report(deps, "locale.preferences.saveFailed");
        return false;
      },

      t: (key, params) => translate(get().locale, key, params),
    };
  });
}

/** 生产依赖：localStorage 镜像 + document.lang + window.desktop（只经 lib/platform）。 */
function productionDeps(): LocaleStoreDeps {
  return {
    readStoredLocale: () => {
      try {
        return typeof window === "undefined"
          ? null
          : window.localStorage.getItem(LOCALE_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    writeStoredLocale: (locale) => {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        }
      } catch {
        /* 存储不可用：本次会话仍可切换，只是不持久化镜像。 */
      }
    },
    applyDocumentLang: (locale) => {
      try {
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
      } catch {
        /* 无 DOM：忽略。 */
      }
    },
    getBridge: () => getDesktopBridge(),
  };
}

/** 生产单例：App 启动时调用 `init()`；组件用 `useT()` 消费。 */
export const useLocaleStore: LocaleStoreApi = createLocaleStore();
