// `Intl` 薄封装 —— 数字/日期格式化与复数分类选择的**单一实现**。
//
// 属主：项目管理。纯 ECMAScript/Intl 模块，不依赖 Node/DOM/Electron。
// 文案里不要硬拼中文单位或千分位；新增数字/日期文案使用本封装（方案 §4.4）。
// 非法 locale（运行时不可信值）一律经 `resolveLocale` 回退默认语言。

import { resolveLocale, type Locale } from "./locales.ts";

const pluralRulesCache = new Map<Locale, Intl.PluralRules>();

/** 用 `Intl.PluralRules(locale).select(count)` 选择复数分类（zh 恒 `other`，en 按 one/other）。 */
export function selectPluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  const effective = resolveLocale(locale);
  let rules = pluralRulesCache.get(effective);
  if (rules === undefined) {
    rules = new Intl.PluralRules(effective);
    pluralRulesCache.set(effective, rules);
  }
  return rules.select(count);
}

/** `Intl.NumberFormat(locale)` 薄封装。 */
export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}

/** `Intl.DateTimeFormat(locale)` 薄封装。 */
export function formatDateTime(
  locale: Locale,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), options).format(value);
}
