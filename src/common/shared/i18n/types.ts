// 共享 i18n 目录的基础类型（**单一来源**）。
//
// 属主：项目管理。纯类型模块（运行时无导出），只使用 ECMAScript 的 `Intl` 类型。
//
// 目录契约（方案 §5.4）：
//  · `zh-CN` 是 key 全集参考（`satisfies Catalog`）；
//  · `en-US` 必须 `satisfies Record<MessageKey, MessageTemplate>`，缺 key/多 key 编译失败；
//  · 字符串模板用 `{param}` 插值，参数名 `[A-Za-z][A-Za-z0-9_]*`；
//  · 复数模板是 `Partial<Record<Intl.LDMLPluralRule, string>>`，必须包含 `other`。

import type { Locale } from "./locales.ts";

/** `Intl.PluralRules` 的复数分类（zero/one/two/few/many/other）。 */
export type PluralCategory = Intl.LDMLPluralRule;

/**
 * 消息模板：普通字符串，或按复数分类拆分的变体对象。
 * 变体对象必须包含 `other`（`translate` 在缺 `other` 时按目录缺陷处理）。
 */
export type MessageTemplate = string | Partial<Record<PluralCategory, string>>;

/** 插值参数：值为字符串或数字；`count` 为复数键时必须是数字。 */
export type MessageParams = Record<string, string | number>;

/** 消息目录：key（稳定 ASCII 标识）→ 模板。 */
export type Catalog = Record<string, MessageTemplate>;

/**
 * 测试/嵌入用的目录覆盖：按 locale 整体替换生产目录。
 * 未提供的 locale 继续使用生产目录。生产调用方不应传入此字段。
 */
export type CatalogOverrides = Partial<Record<Locale, Catalog>>;
