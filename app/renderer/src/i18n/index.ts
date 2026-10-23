/**
 * 渲染层 i18n facade（桌面UI，B0）。
 *
 * 唯一职责：把 shared 的单一实现再导出给渲染层组件，并提供渲染层私有的
 * locale 绑定（store / `useT` / 语言选项映射）。**不复制**消息目录、插值、复数或
 * 回退实现（验收 P1）；组件一律 `import { ... } from "@/i18n"`。
 *
 * shared 模块是纯 ECMAScript/Intl，经相对路径直接打包，不需要 Vite alias 或
 * tsconfig 改动（方案 §4.2 推荐 A）。
 */

import { useMemo } from "react";
import { useStore } from "zustand";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  enUS,
  isLocale,
  resolveLocale,
  translate,
  zhCN,
  type Locale,
  type MessageKey,
  type MessageParams,
  type MessageTemplate,
  type TranslateDiagnostic,
  type TranslateOptions,
} from "../../../../src/common/shared/i18n/index.ts";
import {
  LOCALE_STORAGE_KEY,
  createLocaleStore,
  useLocaleStore,
  type LocaleStoreApi,
  type LocaleStoreDeps,
  type LocaleStoreDiagnosticCode,
  type LocaleStoreState,
  type Translator,
} from "./locale-store.ts";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  enUS,
  isLocale,
  resolveLocale,
  translate,
  zhCN,
};
export type {
  Locale,
  MessageKey,
  MessageParams,
  MessageTemplate,
  TranslateDiagnostic,
  TranslateOptions,
};

export {
  LOCALE_STORAGE_KEY,
  createLocaleStore,
  useLocaleStore,
};
export type {
  LocaleStoreApi,
  LocaleStoreDeps,
  LocaleStoreDiagnosticCode,
  LocaleStoreState,
  Translator,
};

/**
 * 语言选项 → 文案 key 的**显式静态映射**（方案 §4.3：禁止运行时拼接 key）。
 * 语言区 UI 与测试共用此表；文案本身只在 shared `zh-CN`/`en-US` 目录中。
 */
export const LANGUAGE_OPTION_KEYS: Readonly<Record<Locale, MessageKey>> =
  Object.freeze({
    "zh-CN": "ui.settings.language.zhCN",
    "en-US": "ui.settings.language.enUS",
  });

/** 语言区的纯视图模型：一个选项 = locale + 已翻译标签 + 是否选中。 */
export interface LanguageOptionView {
  id: Locale;
  label: string;
  selected: boolean;
}

/**
 * 由当前 locale 与 translator 生成语言选项列表（纯函数，便于无 DOM 测试；
 * 组件只负责按此渲染并把选择交给 store `setLocale`）。
 */
export function languageOptions(
  locale: Locale,
  t: Translator,
): LanguageOptionView[] {
  return SUPPORTED_LOCALES.map((id) => ({
    id,
    label: t(LANGUAGE_OPTION_KEYS[id]),
    selected: locale === id,
  }));
}

/**
 * 订阅 locale store 的选择器 hook（vanilla store 的 React 绑定）。
 * `useLocaleStore` 本身是 StoreApi（App 启动用 `getState().init()`）。
 */
export function useLocaleState<T>(selector: (state: LocaleStoreState) => T): T {
  return useStore(useLocaleStore, selector);
}

/**
 * 随 locale 变化的 translator。locale 改变时返回新的绑定函数，
 * 订阅该 hook 的组件随之重渲染。
 */
export function useT(): Translator {
  const locale = useLocaleState((state) => state.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}
