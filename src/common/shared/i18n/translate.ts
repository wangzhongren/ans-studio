// 翻译/插值/复数/回退/诊断 —— **全仓唯一实现**。
//
// 属主：项目管理。纯 ECMAScript/Intl 模块，不依赖 Node/DOM/Electron。
//
// 语义（方案 §4.4/§5.5，验收 P4）：
//  · 回退顺序：当前 locale → `zh-CN` → key 本身；
//      - en-US 缺 key、zh-CN 有 → zh-CN 文案 + `i18n.missing-key`（warning）；
//      - 两目录都缺 → 返回 key + `i18n.missing-key`（error）；zh-CN 缺 key 时不回退 en-US。
//  · 插值：`{param}`，参数名 `[A-Za-z][A-Za-z0-9_]*`；缺参数保留占位符原文 +
//    `i18n.missing-param`（warning，同一参数每次翻译只报一次）；多余参数忽略；
//    不做 HTML 转义/注入（输出是纯文本，调用方不得拼 `dangerouslySetInnerHTML`）。
//  · 复数：模板对象必须含 `other`；用 `Intl.PluralRules(locale).select(count)` 选变体，
//    所选变体缺失时回退 `other`（无诊断）；缺 `other` 或两目录都缺 → key + error；
//    `count` 缺失/非数字 → 回退 `other` + `i18n.missing-param`。
//  · 非法 locale（运行时不可信值）→ 默认 `zh-CN`；`preferences.locale.invalid` 由调用方记录。
//  · 诊断码/字段是机器标识，**不翻译**；回调抛错不会中断翻译（诊断是观测，不是控制流）。

import { selectPluralCategory } from "./format.ts";
import type { MessageKey } from "./keys.ts";
import { DEFAULT_LOCALE, resolveLocale, type Locale } from "./locales.ts";
import { enUS } from "./messages/en-US.ts";
import { zhCN } from "./messages/zh-CN.ts";
import type {
  Catalog,
  CatalogOverrides,
  MessageParams,
  MessageTemplate,
} from "./types.ts";

/** 稳定诊断码（机器标识，不翻译）。 */
export type TranslateDiagnosticCode = "i18n.missing-key" | "i18n.missing-param";

/** 翻译诊断：缺失 key（warning=回退 zh-CN，error=两目录都缺）或缺失参数（warning）。 */
export interface TranslateDiagnostic {
  code: TranslateDiagnosticCode;
  locale: Locale;
  key: string;
  param?: string;
  severity: "warning" | "error";
}

/** 翻译选项。`catalogs` 供测试/嵌入整体替换某 locale 的目录，生产调用方不应传入。 */
export interface TranslateOptions {
  onDiagnostic?: (diagnostic: TranslateDiagnostic) => void;
  catalogs?: CatalogOverrides;
}

const PRODUCTION_CATALOGS: Record<Locale, Catalog> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function catalogFor(locale: Locale, overrides: CatalogOverrides | undefined): Catalog {
  return overrides?.[locale] ?? PRODUCTION_CATALOGS[locale];
}

function lookup(catalog: Catalog, key: string): MessageTemplate | undefined {
  return Object.prototype.hasOwnProperty.call(catalog, key) ? catalog[key] : undefined;
}

function emit(diagnostic: TranslateDiagnostic, options: TranslateOptions | undefined): void {
  const onDiagnostic = options?.onDiagnostic;
  if (onDiagnostic === undefined) return;
  try {
    onDiagnostic(diagnostic);
  } catch {
    // 观测失败不能中断用户可见文本的生成。
  }
}

function interpolate(
  text: string,
  locale: Locale,
  key: string,
  params: MessageParams | undefined,
  options: TranslateOptions | undefined,
  reported: Set<string> = new Set<string>(),
): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = params !== undefined && Object.prototype.hasOwnProperty.call(params, name)
      ? params[name]
      : undefined;
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (!reported.has(name)) {
      reported.add(name);
      emit(
        {
          code: "i18n.missing-param",
          locale,
          key,
          param: name,
          severity: "warning",
        },
        options,
      );
    }
    return match;
  });
}

function renderTemplate(
  template: MessageTemplate,
  templateLocale: Locale,
  diagnosticLocale: Locale,
  key: string,
  params: MessageParams | undefined,
  options: TranslateOptions | undefined,
): string {
  const reported = new Set<string>();
  let text: string;
  if (typeof template === "string") {
    text = template;
  } else {
    if (template.other === undefined) {
      // 目录契约要求复数模板必须含 other；缺 other 视为目录缺陷。
      emit(
        {
          code: "i18n.missing-key",
          locale: diagnosticLocale,
          key,
          severity: "error",
        },
        options,
      );
      return key;
    }
    const count = params?.count;
    if (typeof count !== "number" || !Number.isFinite(count)) {
      emit(
        {
          code: "i18n.missing-param",
          locale: diagnosticLocale,
          key,
          param: "count",
          severity: "warning",
        },
        options,
      );
      reported.add("count");
      text = template.other;
    } else {
      const category = selectPluralCategory(templateLocale, count);
      text = template[category] ?? template.other;
    }
  }
  return interpolate(text, diagnosticLocale, key, params, options, reported);
}

/**
 * 翻译一个 key。`locale` 在运行时不可信时回退 `zh-CN`（类型层面只允许 `Locale`）。
 * 返回**新字符串**；不修改 `params` 或任何目录。
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: MessageParams,
  options?: TranslateOptions,
): string {
  const requested = resolveLocale(locale);
  const overrides = options?.catalogs;

  let templateLocale: Locale = requested;
  let template = lookup(catalogFor(requested, overrides), key);

  if (template === undefined && requested !== DEFAULT_LOCALE) {
    const fallback = lookup(catalogFor(DEFAULT_LOCALE, overrides), key);
    if (fallback !== undefined) {
      template = fallback;
      templateLocale = DEFAULT_LOCALE;
      emit(
        {
          code: "i18n.missing-key",
          locale: requested,
          key,
          severity: "warning",
        },
        options,
      );
    }
  }

  if (template === undefined) {
    emit(
      {
        code: "i18n.missing-key",
        locale: requested,
        key,
        severity: "error",
      },
      options,
    );
    return key;
  }

  return renderTemplate(template, templateLocale, requested, key, params, options);
}

/**
 * 绑定 locale 与选项，返回 `(key, params?) => string`。
 * 渲染层/主进程可各持一个 translator，避免每次传 locale。非法 locale 在首次翻译时回退默认。
 */
export function createTranslator(
  locale: Locale,
  options?: TranslateOptions,
): (key: MessageKey, params?: MessageParams) => string {
  const effective = resolveLocale(locale);
  return (key, params) => translate(effective, key, params, options);
}
