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
    if (!definition.fields.some((field) => field.key === key)) continue;
    if (typeof value !== "string") return { ...base, ok: false, error: "设置值必须是字符串。" };
    if (key.includes("URL") && value.trim() !== "") {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") return { ...base, ok: false, error: "API 地址须为不含用户名或密码的 http/https 地址。" };
      } catch (error) {
        return { ...base, ok: false, error: "API 地址格式无效。" };
      }
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
