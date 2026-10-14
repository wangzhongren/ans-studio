// SDK settings metadata, maintained once by 项目管理. Never returns secret values.
import { RUNTIME_LABELS, type RuntimeKind } from "./runtime-shared.ts";

export interface RuntimeSettingField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  /** Explicit adapter-supported credential alternatives; these are not separate login modes. */
  fallbackKeys?: readonly string[];
  help?: string;
}

export interface RuntimeSettingsDefinition {
  runtime: Exclude<RuntimeKind, "demo">;
  label: string;
  fields: readonly RuntimeSettingField[];
}

/** This describes settings, not account or endpoint availability. Adapters validate actual requests. */
export const RUNTIME_SETTINGS: Readonly<Record<Exclude<RuntimeKind, "demo">, RuntimeSettingsDefinition>> = {
  pi: {
    runtime: "pi", label: RUNTIME_LABELS.pi,
    fields: [
      { key: "ANTHROPIC_AUTH_TOKEN", label: "访问令牌", required: true, secret: true },
      { key: "ANS_PI_BASE_URL", label: "API 地址", required: true, secret: false },
      { key: "ANS_PI_MODEL", label: "模型", required: true, secret: false },
      { key: "ANS_PI_CONTEXT_WINDOW", label: "上下文窗口", required: false, secret: false, help: "留空使用保守默认值。" },
    ],
  },
  codex: {
    runtime: "codex", label: RUNTIME_LABELS.codex,
    fields: [
      { key: "CODEX_API_KEY", label: "API 密钥", required: true, secret: true, fallbackKeys: ["OPENAI_API_KEY"], help: "已有 OPENAI_API_KEY 时可使用其作为凭据。" },
      { key: "ANS_CODEX_MODEL", label: "模型", required: true, secret: false },
      { key: "ANS_CODEX_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 OpenAI API；自定义地址须兼容 Responses API。" },
    ],
  },
  claude: {
    runtime: "claude", label: RUNTIME_LABELS.claude,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "API 密钥", required: true, secret: true },
      { key: "ANS_CLAUDE_MODEL", label: "模型", required: false, secret: false, help: "留空使用 SDK 默认模型。" },
      { key: "ANTHROPIC_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 SDK 默认服务。" },
    ],
  },
};

export function getRuntimeSettingsDefinition(runtime: RuntimeKind): RuntimeSettingsDefinition | undefined {
  return runtime === "demo" ? undefined : RUNTIME_SETTINGS[runtime];
}
