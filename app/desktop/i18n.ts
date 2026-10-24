// app/desktop/i18n.ts
// 主进程侧 translator 绑定：当前 locale + `t`；**唯一翻译实现**是共享 `src/common/shared/i18n/`，
// 本角色只消费，不复制目录/插值/复数/回退（i18n 方案 §4.9/§8.1）。
//
// 语义（方案 §4.7/§8.2）：
//  · `t` 在**调用当刻**读当前 locale——切换后**新生成**文本用新语言；已生成/已持久化的历史文本
//    不追溯（字符串不会因切换而变）。
//  · locale 只接受 shared 白名单（非法值经 `resolveLocale` 回退 `zh-CN`）；默认不跟随 OS 语言。
//  · 纯逻辑（可注入 locale/诊断钩子），不依赖 Electron；窗口标题、导入项目/选择图片对话框标题、
//    启动错误框统一经 `desktopTexts` 取同一组 `main.*` key，供 main.ts 接线与单测断言。

import {
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type TranslateDiagnostic,
} from "../../src/common/shared/i18n/index.ts";

export interface MainI18n {
  /** 按**当前** locale 翻译（不缓存结果；调用即用当下 locale）。 */
  t(key: MessageKey, params?: MessageParams): string;
  getLocale(): Locale;
  /** 更新当前 locale（只接受白名单；非法值回退 zh-CN）。不写文件——持久化归 preferences.ts。 */
  setLocale(locale: Locale): void;
}

/**
 * 主进程翻译函数形状（B3）：各模块在**生成点**调用它取当前 locale 的文本。
 * 与 `MainI18n.t` 同形，不复制插值/复数/回退（唯一实现在 shared）。
 */
export type MainTranslate = (key: MessageKey, params?: MessageParams) => string;

/**
 * 进程级当前 translator（B3）。Electron 主进程是单窗口应用，locale 是**应用级**状态：
 * `createMainI18n` 创建/复用的实例成为 `mainT` 的读取目标，`setLocale` 后新生成的文本即用新语言
 * （已持久化历史不追溯）。`main.ts` 在启动早期自建实例并传入 Interface（同一实例）；由 `main.ts`
 * 直接构造的通道（customer-input / operator-channel / 确认卡）不持有该实例，但同进程读取 `mainT`
 * 即得到同一 locale——不新增第二份 translator 状态。
 */
let activeMainI18n: MainI18n | undefined;

/** 当前 locale 的翻译入口（模块级；未创建过实例时用 zh-CN 默认实例）。 */
export const mainT: MainTranslate = (key, params) =>
  (activeMainI18n ?? (activeMainI18n = createMainI18nImpl(DEFAULT_LOCALE, {}))).t(key, params);

/** 进程当前 locale（模块级；用于 `lang` 等非文案属性；未初始化时 zh-CN）。 */
export function mainLocale(): Locale {
  return (activeMainI18n ?? (activeMainI18n = createMainI18nImpl(DEFAULT_LOCALE, {}))).getLocale();
}

export interface MainI18nOptions {
  /** 共享翻译诊断钩子（缺 key/参数；机器码不翻译）。 */
  onDiagnostic?: (diagnostic: TranslateDiagnostic) => void;
}

function createMainI18nImpl(initialLocale: Locale, options: MainI18nOptions): MainI18n {
  let current: Locale = resolveLocale(initialLocale);
  const translateOptions =
    options.onDiagnostic !== undefined ? { onDiagnostic: options.onDiagnostic } : undefined;
  return {
    t: (key, params) => translate(current, key, params, translateOptions),
    getLocale: () => current,
    setLocale: (locale: Locale): void => {
      current = resolveLocale(locale);
    },
  };
}

/**
 * 创建（并登记为进程当前）主进程 translator。`main.ts` 的应用实例与 Interface 注入的 `deps.mainI18n`
 * 是**同一实例**；`setLocale` 成功后 `mainT` 同刻读到新 locale（B3 各模块在生成点取词）。
 */
export function createMainI18n(
  initialLocale: Locale = DEFAULT_LOCALE,
  options: MainI18nOptions = {},
): MainI18n {
  const instance = createMainI18nImpl(initialLocale, options);
  activeMainI18n = instance;
  return instance;
}

/** 主进程用户可见入口的文案快照（main.ts 的窗口/对话框/启动错误框唯一取词处）。 */
export interface DesktopTexts {
  readonly windowTitle: string;
  readonly importProjectDialogTitle: string;
  readonly pickImageDialogTitle: string;
  readonly startupErrorTitle: string;
  readonly startupErrorDetail: string;
}

/** 按当前 locale 生成主进程入口文案；每次调用都取当下 locale（切换后新生成文本用新语言）。 */
export function desktopTexts(i18n: MainI18n): DesktopTexts {
  return {
    windowTitle: i18n.t("main.window.title"),
    importProjectDialogTitle: i18n.t("main.dialog.importProject.title"),
    pickImageDialogTitle: i18n.t("main.dialog.pickImage.title"),
    startupErrorTitle: i18n.t("main.error.startup.title"),
    startupErrorDetail: i18n.t("main.error.startup.detail"),
  };
}
