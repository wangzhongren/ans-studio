// Desktop settings consume the shared registry and the single atomic env-file writer.
import { readFile } from "node:fs/promises";
import { readEnvFile, saveEnvFile, isSecretKey, type EnvMap, type EnvTarget } from "../../src/common/shared/env-file.ts";
import { getRuntimeSettingsDefinition, type RuntimeSettingField } from "../../src/common/shared/runtime-settings.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { resolveRepoEnvPath } from "./pi-config.ts";

export type ProfileApplication = "current" | "next-session" | "after-active-turn";
export interface RuntimeConfigField extends RuntimeSettingField {
  value: string;
  isSet: boolean;
  source: "file" | "environment" | "fallback" | "default" | "unset";
  fallbackKey?: string;
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
    throw new Error("无法读取运行时配置文件。");
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
      return "地址格式无效";
    }
  }
  return raw;
}
export async function getRuntimeConfig(runtime: RuntimeKind, options: {
  envPath?: string; env?: EnvTarget; revision?: number; application?: ProfileApplication;
} = {}): Promise<RuntimeConfigView> {
  if (!isRuntimeKind(runtime)) throw new Error("未知运行时。");
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
    const viewField: RuntimeConfigField = { ...field, secret: isSecretKey(field.key), value: safeDisplayValue(field.key, raw), isSet: raw.trim() !== "", source };
    if (fallbackKey !== undefined) viewField.fallbackKey = fallbackKey;
    fields.push(viewField);
  }
  return { runtime, label: definition?.label ?? "演示", path: envPath, fields,
    missingKeys: fields.filter((field) => field.required && !field.isSet).map((field) => field.key),
    revision: options.revision ?? 0, application: options.application ?? "current" };
}
// Saving does not mutate ambient credentials. The session manager chooses the safe application point.
export async function saveRuntimeConfig(input: { runtime: RuntimeKind; updates: unknown }, options: {
  envPath?: string; revision?: number;
} = {}): Promise<RuntimeConfigSaveResult> {
  const base = { runtime: input.runtime, appliedKeys: [] as string[], revision: options.revision ?? 0, application: "current" as ProfileApplication };
  if (!isRuntimeKind(input.runtime)) return { ...base, ok: false, error: "未知运行时。" };
  const definition = getRuntimeSettingsDefinition(input.runtime);
  if (!definition) return { ...base, ok: false, error: "演示运行时无需配置。" };
  if (!input.updates || typeof input.updates !== "object" || Array.isArray(input.updates)) return { ...base, ok: false, error: "设置必须是键值对象。" };
  const filtered: EnvMap = {};
  for (const [key, value] of Object.entries(input.updates)) {
    const field = definition.fields.find((candidate) => candidate.key === key);
    if (field === undefined) continue;
    if (typeof value !== "string") return { ...base, ok: false, error: "设置值必须是字符串。" };
    if (key.includes("URL") && value.trim() !== "") {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") return { ...base, ok: false, error: "API 地址须为不含用户名或密码的 http/https 地址。" };
      } catch (error) {
        return { ...base, ok: false, error: "API 地址格式无效。" };
      }
    }
    // G-5 wave 2：**封闭值域字段按 `choices` 校验**（注册表元数据；值域按运行时——如 Codex 无 off 档）。
    // 非法值 ⇒ 如实拒绝、不落盘（错误**不回显提交值原文**，沿凭据不回显纪律）；空串/纯空白＝清除该键
    // （合法：留空维持平台默认）。合法值按 trim 后的**规范形**写盘（写侧只收规范值；读侧的大小写宽松
    // 归一属读取态，不借道写盘）。
    // 2026-10-17：错误里的可接受值改用 `choiceLabels`（与 `choices` **等长**时；如 Pi 档位的
    // 「32k / 64k / …」「1 分钟 / 2 分钟 / …」）——只换展示标签，校验仍以 raw `choices` 值为准；
    // 无标签或长度不匹配时回退 raw `choices`（行为不变）。
    const canonical = value.trim();
    if (field.choices !== undefined && field.choices.length > 0) {
      if (canonical !== "" && !field.choices.includes(canonical)) {
        const accepted =
          field.choiceLabels !== undefined && field.choiceLabels.length === field.choices.length
            ? field.choiceLabels
            : field.choices;
        return { ...base, ok: false, error: `${field.label}取值无效：仅接受 ${accepted.join(" / ")}（或留空维持平台默认）。` };
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
        const bound = min !== undefined ? ` ≥ ${min} 的` : "";
        return { ...base, ok: false, error: `${field.label}必须是${bound}正整数。` };
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
    return { ...base, ok: false, error: "运行时配置未保存，无法写入配置文件。" };
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
