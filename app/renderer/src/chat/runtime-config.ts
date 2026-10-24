/**
 * 引擎设置纯逻辑（Phase 4A）：控件选择、档位映射、updates 构造、状态/缺配文案、
 * 读取/保存版本自洽。无 DOM、无 store、无 IPC。
 *
 * 字段列表/必填/秘密/closed 值域/整数约束全部来自主进程 `getRuntimeConfig` 元数据；
 * 本模块**不复制**第二份字段表或校验表（只做控件选择与展示映射）。
 *
 * i18n B1：展示文案来自 shared `ui.settings.*`/`ui.runtimeConfig.*`，纯函数接受
 * 可选 `locale`（默认 zh-CN）。`field.label/help/choiceLabels` 是主进程数据（B4 迁移），
 * 本模块不翻译其内容。
 *
 * i18n B4：引擎显示名中的 `demo` 不再以中文字面量保存在本地，改用共享 key
 * `shared.runtimeSettings.runtime.demo`（经 facade `translate` 取词）；Pi/Codex/Claude
 * 是品牌名，原样展示。渲染层**不导入** `runtime-shared.ts`（顶层 node:os/node:path），
 * 只在此以显式静态映射引用同一 key。
 */

import {
  DEFAULT_LOCALE,
  translate,
  type Locale,
  type MessageKey,
} from "../i18n/index.ts";

/** 与 ui-store 的 RuntimeId 同值域；此处本地声明避免纯逻辑模块依赖 UI 别名。 */
export type ConfigRuntime = "pi" | "codex" | "claude";

export type ConfigApplication =
  | "current"
  | "next-session"
  | "after-active-turn"
  | string;

export interface ConfigField {
  key: string;
  label?: string;
  required?: boolean;
  secret?: boolean;
  fallbackKeys?: string[];
  fallbackKey?: string;
  choices?: string[];
  choiceLabels?: string[];
  control?: string;
  integer?: { min?: number; max?: number };
  help?: string;
  value?: string;
  isSet?: boolean;
  source?: string;
}

export interface RuntimeConfigView {
  runtime: string;
  label?: string;
  path?: string;
  revision?: number;
  application?: ConfigApplication;
  missingKeys: string[];
  fields: ConfigField[];
}

export type ConfigControl = "range" | "select" | "text" | "password";

/**
 * 引擎显示名的**语言中性**值：Pi/Codex/Claude 是品牌名（原样展示）；`demo` 是中性标识，
 * 用户可见文案由 `RUNTIME_LABEL_KEYS` 指向共享 i18n key（zh-CN / en-US 均取共享目录）。
 * 与共享 `runtime-shared.ts` 的 `RUNTIME_LABELS` 同口径，但本模块不导入该文件。
 */
export const RUNTIME_LABELS: Record<string, string> = {
  demo: "demo",
  pi: "Pi",
  codex: "Codex",
  claude: "Claude",
};

/**
 * 需要本地化的引擎显示名 key（B4）。key 单一来源是共享 `runtime-shared.ts` 的
 * `RUNTIME_LABEL_KEYS`；渲染层不得导入该模块（顶层 node:os/node:path），因此在此用
 * 显式静态映射引用同一 key（不是第二份目录/翻译实现）。`null` = 品牌名原样。
 */
export const RUNTIME_LABEL_KEYS: Readonly<Record<string, MessageKey | null>> = {
  demo: "shared.runtimeSettings.runtime.demo",
  pi: null,
  codex: null,
  claude: null,
};

export function runtimeLabel(
  runtime: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = RUNTIME_LABEL_KEYS[runtime];
  if (key) return translate(locale, key);
  return RUNTIME_LABELS[runtime] || String(runtime || translate(locale, "ui.runtimeConfig.unknownEngine"));
}

export function isRuntimeId(value: unknown): value is ConfigRuntime {
  return value === "pi" || value === "codex" || value === "claude";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * 短档位判定（旧 `shortTierRange` 同口径，2026-10-18 客户要求）：
 * ≤5 档、标签与值等长、每档标签非空且 ≤4 字 ⇒ 下拉；否则长档位（range）。
 * 判定只依赖元数据 choices/choiceLabels，不按字段 key 分叉。
 */
export function isShortTier(
  choices: readonly string[] | undefined,
  labels: readonly string[] | undefined,
): boolean {
  if (!Array.isArray(choices) || choices.length === 0 || choices.length > 5) {
    return false;
  }
  if (!Array.isArray(labels) || labels.length !== choices.length) return false;
  for (const label of labels) {
    if (typeof label !== "string" || label === "" || Array.from(label).length > 4) {
      return false;
    }
  }
  return true;
}

export function fieldControl(field: ConfigField): ConfigControl {
  const choices = asStringArray(field.choices);
  if (field.secret === true) return "password";
  if (field.control === "range" && choices.length > 0) {
    return isShortTier(choices, field.choiceLabels) ? "select" : "range";
  }
  if (choices.length > 0) return "select";
  return "text";
}

/** range 字段的预设档位下标；不在值域 ⇒ -1（回退文本输入，不静默改写）。 */
export function rangeIndex(choices: readonly string[] | undefined, value: unknown): number {
  const list = asStringArray(choices);
  const index = list.indexOf(asString(value));
  return index;
}

/** 预设档位下标 → 规范值（越界 ⇒ 空串＝平台默认）。 */
export function rangeValue(choices: readonly string[] | undefined, index: number): string {
  const list = asStringArray(choices);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return "";
  return list[index];
}

/** 预设档位下标 → 展示标签（缺标签回退 raw 值，不美化）。 */
export function rangeLabel(
  choices: readonly string[] | undefined,
  labels: readonly string[] | undefined,
  index: number,
): string {
  const list = asStringArray(choices);
  const labelList = asStringArray(labels);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return "";
  const label = labelList[index];
  return typeof label === "string" && label !== "" ? label : list[index];
}

/** 当前保存值不在预设档位（range 回退文本 + amber 提示的唯一判据）。 */
export function rangeFallsBack(field: ConfigField): boolean {
  if (fieldControl(field) !== "range") return false;
  return rangeIndex(field.choices, field.value) < 0;
}

export interface PartitionedFields {
  main: ConfigField[];
  advanced: ConfigField[];
}

/** 唯一分组规则：`control:"range"` 字段进高级；其余必填在前、可选在后。 */
export function partitionFields(fields: readonly ConfigField[]): PartitionedFields {
  const main: ConfigField[] = [];
  const advanced: ConfigField[] = [];
  for (const field of fields) {
    if (field.control === "range") advanced.push(field);
    else main.push(field);
  }
  const rank = (field: ConfigField) => (field.required === true ? 0 : 1);
  return {
    main: main.slice().sort((a, b) => rank(a) - rank(b)),
    advanced,
  };
}

/** 字段初值：非机密预填 value；机密恒空（值绝不进入渲染进程/表单初值）。 */
export function initialFieldValues(
  fields: readonly ConfigField[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] = field.secret === true ? "" : asString(field.value);
  }
  return values;
}

/**
 * 保存 updates（旧 `savePiConfigFromForm` 同口径）：
 * - 机密：非空才提交（空＝保留原值，永不回显/清除）；
 * - 非机密：非空提交；空且 isSet 提交空串（显式清除）；空且未设置不下发。
 */
export function buildConfigUpdates(
  fields: readonly ConfigField[],
  values: Record<string, string>,
): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.key)) continue;
    const value = asString(values[field.key]);
    if (field.secret === true) {
      if (value !== "") updates[field.key] = value;
      continue;
    }
    if (value !== "" || field.isSet === true) updates[field.key] = value;
  }
  return updates;
}

export interface ConfigValidation {
  ok: boolean;
  view: RuntimeConfigView | null;
  error: string;
}

/**
 * 读取结果校验（旧 `loadPiConfig` 同口径）：runtime 精确匹配、fields 数组、
 * missingKeys 必须是字符串数组（缺省/畸形一律按读取失败——不把未知说成已齐备）。
 */
export function validateRuntimeConfigView(
  raw: unknown,
  expectedRuntime: string,
  locale: Locale = DEFAULT_LOCALE,
): ConfigValidation {
  const notReady = translate(locale, "ui.runtimeConfig.summaryNotReady");
  if (!raw || typeof raw !== "object") {
    return { ok: false, view: null, error: notReady };
  }
  const record = raw as Record<string, unknown>;
  const runtime = asString(record.runtime);
  const fields = record.fields;
  const missingKeys = record.missingKeys;
  if (runtime !== expectedRuntime) {
    return { ok: false, view: null, error: notReady };
  }
  if (!Array.isArray(fields)) {
    return { ok: false, view: null, error: notReady };
  }
  if (
    !Array.isArray(missingKeys) ||
    !missingKeys.every((key) => typeof key === "string")
  ) {
    return { ok: false, view: null, error: notReady };
  }
  const cleanFields: ConfigField[] = fields
    .filter((field): field is Record<string, unknown> => !!field && typeof field === "object")
    .map((field) => ({
      ...(field as unknown as ConfigField),
      key: asString(field.key),
    }))
    .filter((field) => field.key !== "");
  return {
    ok: true,
    view: {
      runtime,
      label: asString(record.label) || runtimeLabel(runtime, locale),
      path: asString(record.path),
      revision: typeof record.revision === "number" ? record.revision : undefined,
      application: asString(record.application) || "next-session",
      missingKeys: missingKeys.slice() as string[],
      fields: cleanFields,
    },
    error: "",
  };
}

/** 缺项键（只用主进程给出的 missingKeys；不在渲染侧重算必填表）。 */
export function missingKeysOf(view: RuntimeConfigView | null): string[] {
  return view ? view.missingKeys.slice() : [];
}

export function applicationLabel(
  application: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key =
    asString(application) === "current"
      ? "ui.settings.applicationCurrent"
      : asString(application) === "next-session"
        ? "ui.settings.applicationNextSession"
        : asString(application) === "after-active-turn"
          ? "ui.settings.applicationAfterActiveTurn"
          : "ui.settings.applicationUnknown";
  return translate(locale, key);
}

/** 列表连接符（结构标点，不是文案；zh 与旧实现逐字一致）。 */
function listSeparator(locale: Locale): string {
  return locale === "zh-CN" ? "、" : ", ";
}

export function sourceLabel(
  field: ConfigField,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const source = asString(field.source);
  const keys = {
    file: "ui.runtimeConfig.source.file",
    environment: "ui.runtimeConfig.source.environment",
    fallback: "ui.runtimeConfig.source.fallback",
    default: "ui.runtimeConfig.source.default",
    unset: "shared.common.notSet",
  } as const;
  const base =
    source === "file" || source === "environment" || source === "fallback" ||
    source === "default" || source === "unset"
      ? translate(locale, keys[source])
      : translate(locale, "ui.runtimeConfig.sourceUnknown");
  const fallbackKey =
    asString(field.fallbackKey) || asStringArray(field.fallbackKeys)[0] || "";
  if (field.source === "fallback" && fallbackKey) {
    return locale === "zh-CN"
      ? base + "（" + fallbackKey + "）"
      : base + " (" + fallbackKey + ")";
  }
  return base;
}

export function fieldHelp(field: ConfigField, locale: Locale = DEFAULT_LOCALE): string {
  const key = field.key;
  const help = asString(field.help);
  const glue = locale === "zh-CN" ? "。" : ". ";
  return key + " · " + sourceLabel(field, locale) + (help ? glue + help : "");
}

/** 字段标签（旧面板逐字载体）：`<label> · 必填/可选`。 */
export function fieldLabelText(
  field: ConfigField,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const label = asString(field.label) || field.key;
  return translate(
    locale,
    field.required === true
      ? "ui.runtimeConfig.fieldRequired"
      : "ui.runtimeConfig.fieldOptional",
    { label },
  );
}

export function configWarningText(
  label: string,
  missing: readonly string[],
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.settings.incomplete", {
    label,
    missing: missing.join(listSeparator(locale)),
  });
}

export function configCompleteText(
  label: string,
  application: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.requiredReady", {
    label,
    application: applicationLabel(application, locale),
  });
}

export function readFailureStatusText(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.readFailedWithDetail", {
    detail: error instanceof Error ? error.message : String(error ?? ""),
  });
}

export function saveFailureStatusText(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.saveFailed", {
    detail:
      typeof error === "string" && error !== ""
        ? error
        : translate(locale, "ui.runtimeConfig.unknownError"),
  });
}

export function saveExceptionStatusText(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.saveException", {
    detail:
      error instanceof Error
        ? error.message
        : String(error ?? translate(locale, "ui.runtimeConfig.unknownError")),
  });
}

export function savingStatusText(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.runtimeConfig.saving");
}

/**
 * 保存条可见状态：64px 内两行可读（键名/缺项明细放 title 与缺项 Alert）。
 * 零改动键使用独立 key（`saveNoteNoChanges`），避免「无 个」拼接。
 */
export function savedStatusText(
  appliedKeys: readonly string[],
  missing: readonly string[],
  application: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const tail = missing.length > 0
    ? translate(locale, "ui.settings.stillMissingCount", { count: missing.length })
    : translate(locale, "ui.settings.requiredReady");
  const applicationText = applicationShortLabel(application, locale);
  if (appliedKeys.length === 0) {
    return translate(locale, "ui.settings.saveNoteNoChanges", {
      tail,
      application: applicationText,
    });
  }
  return translate(locale, "ui.settings.saveNoteShort", {
    count: appliedKeys.length,
    tail,
    application: applicationText,
  });
}

/** 保存条完整状态（title/读屏/追溯）：逐键与完整 application 文案。 */
export function savedStatusTitle(
  appliedKeys: readonly string[],
  missing: readonly string[],
  application: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const keys = appliedKeys.length > 0
    ? appliedKeys.join(listSeparator(locale))
    : translate(locale, "shared.common.none");
  const tail = missing.length > 0
    ? translate(locale, "ui.settings.stillMissingList", {
        keys: missing.join(listSeparator(locale)),
      })
    : translate(locale, "ui.settings.requiredReady");
  return translate(locale, "ui.settings.saveNoteTitle", {
    keys,
    tail,
    application: applicationLabel(application, locale),
  });
}

/** 应用时点短句（视觉两行内完整；完整文案见 `applicationLabel` 与设置说明）。 */
export function applicationShortLabel(
  application: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const value = asString(application);
  const key =
    value === "current"
      ? "ui.settings.applicationCurrent"
      : value === "next-session"
        ? "ui.settings.applicationNextSession"
        : value === "after-active-turn"
          ? "ui.settings.applicationAfterActiveTurnShort"
          : "ui.settings.applicationUnknown";
  return translate(locale, key);
}

export function missingNoticeText(
  label: string,
  missing: readonly string[],
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.settings.incomplete", {
    label,
    missing: missing.join(listSeparator(locale)),
  });
}

export function readFailureNoticeText(
  label: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.readFailedForLabel", { label });
}

export function readingNoticeText(
  label: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.checkingLabel", { label });
}

export function engineSettingsTitle(
  label: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.engineSettingsTitle", { label });
}

export function engineSettingsTabTitle(
  label: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.engineSettingsTabTitle", { label });
}

export function openEngineSettingsLabel(
  label: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, "ui.runtimeConfig.openEngineSettings", { label });
}

/** 档位控件读屏标签：range 的 aria-valuetext 与 output 用同一标签（单一映射点）。 */
export function rangeAriaValueText(field: ConfigField, index: number): string {
  return rangeLabel(field.choices, field.choiceLabels, index);
}

// —————— 读取/保存版本自洽（晚到响应只丢弃，不写状态）——————

export interface ConfigLoadToken {
  version: number;
  runtime: string;
  projectRoot: string | null;
}

export function nextLoadToken(
  previousVersion: number,
  runtime: string,
  projectRoot: string | null,
): ConfigLoadToken {
  return { version: previousVersion + 1, runtime, projectRoot };
}

export function loadTokenCurrent(
  token: ConfigLoadToken,
  latest: ConfigLoadToken,
  runtime: string,
  projectRoot: string | null,
): boolean {
  return (
    token.version === latest.version &&
    token.runtime === runtime &&
    token.projectRoot === projectRoot
  );
}

export interface ConfigSaveToken {
  version: number;
  runtime: string;
  projectRoot: string | null;
}

export function nextSaveToken(
  previousVersion: number,
  runtime: string,
  projectRoot: string | null,
): ConfigSaveToken {
  return { version: previousVersion + 1, runtime, projectRoot };
}

export function saveTokenCurrent(
  token: ConfigSaveToken,
  latest: ConfigSaveToken,
  runtime: string,
  projectRoot: string | null,
): boolean {
  return (
    token.version === latest.version &&
    token.runtime === runtime &&
    token.projectRoot === projectRoot
  );
}
