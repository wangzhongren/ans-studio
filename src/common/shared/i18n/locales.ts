// 共享 i18n 的 locale 契约（**单一来源**）。
//
// 属主：项目管理（`src/common/shared/` 唯一写入者）。消费方只读导入。
// 约束：纯 ECMAScript 模块，不依赖 Node/DOM/Electron；由 `test/项目管理/shared/i18n.test.ts`
// 的源码扫描守卫钉住。
//
// 语义（方案 §4.4/§5.1）：
//  · `SUPPORTED_LOCALES` 是只读白名单，当前仅 `zh-CN`（默认）与 `en-US`；
//  · `resolveLocale` 只做**精确匹配**：`en`、`zh`、大小写变体、前后空白、非字符串一律回退
//    `DEFAULT_LOCALE`。非法值的诊断码 `preferences.locale.invalid` 由调用方（主进程偏好读取）
//    另行记录——本模块不产生该诊断，保持纯函数。

/** 支持的语言白名单（运行时冻结；类型为只读元组）。 */
export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"] as const);

/** 受支持的 locale。从白名单推导，新增语言时同时扩展目录。 */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 默认语言：`zh-CN`。不跟随 OS 语言。 */
export const DEFAULT_LOCALE: Locale = "zh-CN";

/** 类型守卫：`value` 是否为受支持的 locale（精确匹配）。 */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * 解析不可信 locale（如偏好文件/argv 的值）：白名单精确匹配，其他一律返回 `DEFAULT_LOCALE`。
 * 本函数不抛错、不产生诊断；调用方负责在需要时记录 `preferences.locale.invalid`。
 */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
