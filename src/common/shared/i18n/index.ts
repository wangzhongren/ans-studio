// 共享国际化（i18n）公共出口。
//
// 属主：项目管理（`src/common/shared/` 唯一写入者）。**消费方只读导入，不得复制第二份
// 目录或插值/复数/回退实现**（工程法案 §一.5；`角色卡/项目管理/docs/architecture/shared-components.md`）。
//
// 消费方式（B0 公开契约，详见 `角色卡/项目管理/api-spec.md`）：
//  · 主进程 / CLI：`import { translate, resolveLocale } from ".../shared/i18n/index.ts";`
//  · 渲染层：桌面UI 的 facade `app/renderer/src/i18n/index.ts` 只再导出本模块；
//  · 测试/嵌入：`TranslateOptions.catalogs` 可整体替换某 locale 目录。
//
// 纯模块：只使用 ECMAScript/Intl，不依赖 Node/DOM/Electron。

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  resolveLocale,
  type Locale,
} from "./locales.ts";

export type {
  Catalog,
  CatalogOverrides,
  MessageParams,
  MessageTemplate,
  PluralCategory,
} from "./types.ts";

export type { MessageKey } from "./keys.ts";

export {
  createTranslator,
  translate,
  type TranslateDiagnostic,
  type TranslateDiagnosticCode,
  type TranslateOptions,
} from "./translate.ts";

export { formatDateTime, formatNumber, selectPluralCategory } from "./format.ts";

export { zhCN } from "./messages/zh-CN.ts";
export { enUS } from "./messages/en-US.ts";
