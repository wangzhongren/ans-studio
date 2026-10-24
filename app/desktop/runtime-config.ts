// Desktop settings consume the shared registry and the single atomic env-file writer.
import { readFile } from "node:fs/promises";
import { readEnvFile, saveEnvFile, isSecretKey, type EnvMap, type EnvTarget } from "../../src/common/shared/env-file.ts";
import { getRuntimeSettingsDefinition, type RuntimeSettingField } from "../../src/common/shared/runtime-settings.ts";
import { RUNTIME_KINDS, RUNTIME_LABELS, RUNTIME_LABEL_KEYS, type RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { resolveRepoEnvPath } from "./pi-config.ts";
import { mainT } from "./i18n.ts";

export type ProfileApplication = "current" | "next-session" | "after-active-turn";

/**
 * 设置视图字段（**渲染层 IPC 契约不变**，2026-10-23 i18n B4）。
 *
 * 共享元数据（`RuntimeSettingField`）只带目录 key（`labelKey`/`helpKey`/`choiceLabelKeys`）；
 * 主进程在构造视图时用当前 locale 的 `mainT` 解析回 `label`/`help`/`choiceLabels` 再推给渲染层。
 * 机器字段（`key/required/secret/fallbackKeys/choices/control/integer`）原样透传；key 字段不进 IPC 视图。
 */
export type RuntimeConfigField = Omit<RuntimeSettingField, "labelKey" | "helpKey" | "choiceLabelKeys"> & {
  /** 展示标签（`labelKey` 按当前 locale 解析；无第二份文案）。 */
  label: string;
  /** 帮助文本（`helpKey` 按当前 locale 解析；无 key 时不出现该字段）。 */
  help?: string;
  /** 档位友好标签（`choiceLabelKeys` 逐项按当前 locale 解析；与 `choices` 等长；无 key 时不出现该字段）。 */
  choiceLabels?: readonly string[];
  value: string;
  isSet: boolean;
  source: "file" | "environment" | "fallback" | "default" | "unset";
  fallbackKey?: string;
};

/**
 * key → 展示文案的**唯一解析点**（消费方语义）：只调用 shared 的 `mainT`，不复制目录/插值/回退。
 * 返回除运行态字段（`value/isSet/source/fallbackKey`）外的视图字段。
 */
function resolveFieldDisplay(field: RuntimeSettingField): Pick<RuntimeConfigField, "key" | "label" | "required" | "secret" | "fallbackKeys" | "choices" | "control" | "integer" | "help" | "choiceLabels"> {
  const { labelKey, helpKey, choiceLabelKeys, ...machine } = field;
  const resolved: Pick<RuntimeConfigField, "key" | "label" | "required" | "secret" | "fallbackKeys" | "choices" | "control" | "integer" | "help" | "choiceLabels"> = {
    ...machine,
    label: mainT(labelKey),
  };
  if (helpKey !== undefined) resolved.help = mainT(helpKey);
  if (choiceLabelKeys !== undefined) resolved.choiceLabels = choiceLabelKeys.map((key) => mainT(key));
  return resolved;
}
export interface RuntimeConfigView {
  runtime: RuntimeKind;
  label: string;
  path: string;
  fields: RuntimeConfigField[];
  missingKeys: string[];
  revision: number;
  application: ProfileApplication;
}
export interface RuntimeConfigSaveResult {
  ok: boolean;
  runtime: RuntimeKind;
  appliedKeys: string[];
  revision: number;
  application: ProfileApplication;
  error?: string;
}
export function isRuntimeKind(value: unknown): value is RuntimeKind {
  return typeof value === "string" && (RUNTIME_KINDS as readonly string[]).includes(value);
}
async function readOptionalEnv(envPath: string): Promise<EnvMap> {
  try {
    await readFile(envPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(mainT("main.runtimeConfig.readFileFailed"));
  }
  return readEnvFile(envPath);
}
function safeDisplayValue(key: string, raw: string): string {
  if (isSecretKey(key)) return "";
  if (key.includes("URL") && raw !== "") {
    try {
      const url = new URL(raw);
      if (url.username === "" && url.password === "") return raw;
      url.username = "";
      url.password = "";
      return url.toString();
    } catch (error) {
      return mainT("main.runtimeConfig.invalidUrl");
    }
  }
  return raw;
}
export async function getRuntimeConfig(runtime: RuntimeKind, options: {
  envPath?: string; env?: EnvTarget; revision?: number; application?: ProfileApplication;
} = {}): Promise<RuntimeConfigView> {
  if (!isRuntimeKind(runtime)) throw new Error(mainT("main.common.unknownRuntime"));
  const definition = getRuntimeSettingsDefinition(runtime);
  const envPath = options.envPath ?? resolveRepoEnvPath();
  const file = await readOptionalEnv(envPath);
  const env = options.env ?? process.env;
  const fields: RuntimeConfigField[] = [];
  for (const field of definition?.fields ?? []) {
    let raw = file[field.key] ?? env[field.key] ?? "";
    let source: RuntimeConfigField["source"] = "unset";
    if (raw.trim() !== "") {
      source = "environment";
      if (file[field.key] !== undefined) source = "file";
    }
    let fallbackKey: string | undefined;
    if (raw.trim() === "") {
      for (const key of field.fallbackKeys ?? []) {
        const fallback = file[key] ?? env[key] ?? "";
        if (fallback.trim() === "") continue;
        raw = fallback;
        fallbackKey = key;
        source = "fallback";
        break;
      }
    }
    if (raw.trim() === "" && !field.required) source = "default";
    const viewField: RuntimeConfigField = {
      ...resolveFieldDisplay(field),
      secret: isSecretKey(field.key),
      value: safeDisplayValue(field.key, raw),
      isSet: raw.trim() !== "",
      source,
    };
    if (fallbackKey !== undefined) viewField.fallbackKey = fallbackKey;
    fields.push(viewField);
  }
  // demo 无设置定义：显示名走共享 key（`RUNTIME_LABEL_KEYS.demo`），不硬编码中文；
  // Pi/Codex/Claude 品牌名来自注册表 `label`（不翻译）。
  const demoLabelKey = RUNTIME_LABEL_KEYS.demo;
  const label = definition?.label ?? (demoLabelKey !== null ? mainT(demoLabelKey) : RUNTIME_LABELS.demo);
  return { runtime, label, path: envPath, fields,
    missingKeys: fields.filter((field) => field.required && !field.isSet).map((field) => field.key),
    revision: options.revision ?? 0, application: options.application ?? "current" };
}
// Saving does not mutate ambient credentials. The session manager chooses the safe application point.
export async function saveRuntimeConfig(input: { runtime: RuntimeKind; updates: unknown }, options: {
  envPath?: string; revision?: number;
} = {}): Promise<RuntimeConfigSaveResult> {
  const base = { runtime: input.runtime, appliedKeys: [] as string[], revision: options.revision ?? 0, application: "current" as ProfileApplication };
  if (!isRuntimeKind(input.runtime)) return { ...base, ok: false, error: mainT("main.common.unknownRuntime") };
  const definition = getRuntimeSettingsDefinition(input.runtime);
  if (!definition) return { ...base, ok: false, error: mainT("main.runtimeConfig.demoNoConfig") };
  if (!input.updates || typeof input.updates !== "object" || Array.isArray(input.updates)) return { ...base, ok: false, error: mainT("main.runtimeConfig.settingsMustBeObject") };
  const filtered: EnvMap = {};
  for (const [key, value] of Object.entries(input.updates)) {
    const field = definition.fields.find((candidate) => candidate.key === key);
    if (field === undefined) continue;
    if (typeof value !== "string") return { ...base, ok: false, error: mainT("main.runtimeConfig.valueMustBeString") };
    if (key.includes("URL") && value.trim() !== "") {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") return { ...base, ok: false, error: mainT("main.runtimeConfig.urlCredentials") };
      } catch (error) {
        return { ...base, ok: false, error: mainT("main.runtimeConfig.invalidApiUrl") };
      }
    }
    // G-5 wave 2：**封闭值域字段按 `choices` 校验**（注册表元数据；值域按运行时——如 Codex 无 off 档）。
    // 非法值 ⇒ 如实拒绝、不落盘（错误**不回显提交值原文**，沿凭据不回显纪律）；空串/纯空白＝清除该键
    // （合法：留空维持平台默认）。合法值按 trim 后的**规范形**写盘（写侧只收规范值；读侧的大小写宽松
    // 归一属读取态，不借道写盘）。
    // 2026-10-17：错误里的可接受值改用 `choiceLabelKeys` 解析后的 `choiceLabels`（与 `choices`
    // **等长**时；如 Pi 档位的「32k / 64k / …」「1 分钟 / 2 分钟 / …」）——只换展示标签，校验仍以
    // raw `choices` 值为准；无标签 key 或长度不匹配时回退 raw `choices`（行为不变）。
    // 2026-10-23 i18n B4：字段名/可接受值均按**当前 locale** 经 `mainT` 从共享目录解析（zh 逐字同旧）。
    const canonical = value.trim();
    if (field.choices !== undefined && field.choices.length > 0) {
      if (canonical !== "" && !field.choices.includes(canonical)) {
        const resolvedChoiceLabels = field.choiceLabelKeys?.map((choiceKey) => mainT(choiceKey));
        const accepted =
          resolvedChoiceLabels !== undefined && resolvedChoiceLabels.length === field.choices.length
            ? resolvedChoiceLabels
            : field.choices;
        return { ...base, ok: false, error: mainT("main.runtimeConfig.choiceInvalid", { label: mainT(field.labelKey), accepted: accepted.join(" / ") }) };
      }
      filtered[key] = canonical;
      continue;
    }
    // 整数约束（共享元数据 `RuntimeSettingField.integer`）：用于**无 choices** 的整数自由输入字段
    // （带 choices 的字段由上方的封闭值域分支处理，值域已内含整数语义）。空串/纯空白＝清除该键
    // （合法：留空维持平台默认）；否则必须是 `/^\d+$/` 的**安全整数**且落在 [min,max] 内。
    // 非法值如实拒绝、不落盘（错误**不回显提交值原文**，沿凭据不回显纪律）；合法值按 trim 规范形写盘。
    if (field.integer !== undefined) {
      if (canonical === "") {
        filtered[key] = "";
        continue;
      }
      const parsed = /^\d+$/.test(canonical) ? Number(canonical) : Number.NaN;
      const min = field.integer.min;
      const max = field.integer.max;
      const inRange =
        Number.isSafeInteger(parsed) &&
        (min === undefined || parsed >= min) &&
        (max === undefined || parsed <= max);
      if (!inRange) {
        const bound = min !== undefined ? mainT("main.runtimeConfig.integerBound", { min }) : "";
        return { ...base, ok: false, error: mainT("main.runtimeConfig.integerInvalid", { label: mainT(field.labelKey), bound }) };
      }
      filtered[key] = canonical;
      continue;
    }
    filtered[key] = value;
  }
  if (Object.keys(filtered).length === 0) return { ...base, ok: true };
  try {
    await saveEnvFile(options.envPath ?? resolveRepoEnvPath(), filtered);
    return { ...base, ok: true, appliedKeys: Object.keys(filtered) };
  } catch (error) {
    return { ...base, ok: false, error: mainT("main.runtimeConfig.notSaved") };
  }
}
export async function applyRuntimeConfig(runtime: RuntimeKind, envPath: string, env: EnvTarget): Promise<void> {
  const file = await readOptionalEnv(envPath);
  const definition = getRuntimeSettingsDefinition(runtime);
  for (const field of definition?.fields ?? []) {
    if (file[field.key] !== undefined) env[field.key] = file[field.key];
    for (const key of field.fallbackKeys ?? []) {
      if (file[key] !== undefined) env[key] = file[key];
    }
  }
}
