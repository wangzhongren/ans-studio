// SDK settings metadata, maintained once by 项目管理. Never returns secret values.
import { RUNTIME_LABELS, type RuntimeKind } from "./runtime-shared.ts";

export interface RuntimeSettingField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  /** Explicit adapter-supported credential alternatives; these are not separate login modes. */
  fallbackKeys?: readonly string[];
  /**
   * Allowed values of this setting when it is a closed set: present (non-empty) means the field
   * accepts exactly these choices and should be presented as a choice control; absent or empty
   * means free text. This describes the setting, not a control implementation.
   */
  choices?: readonly string[];
  help?: string;
}

export interface RuntimeSettingsDefinition {
  runtime: Exclude<RuntimeKind, "demo">;
  label: string;
  fields: readonly RuntimeSettingField[];
}

/** Reasoning-effort help: one verbatim wording shared by the three platforms. */
const REASONING_EFFORT_HELP = "留空＝维持平台默认（现状零变化）；档位依次为 关/低/中/高/极高（缺省档语义见平台）；思考计入输出 tokens。";

/** This describes settings, not account or endpoint availability. Adapters validate actual requests. */
export const RUNTIME_SETTINGS: Readonly<Record<Exclude<RuntimeKind, "demo">, RuntimeSettingsDefinition>> = {
  pi: {
    runtime: "pi", label: RUNTIME_LABELS.pi,
    fields: [
      { key: "ANTHROPIC_AUTH_TOKEN", label: "访问令牌", required: true, secret: true },
      { key: "ANS_PI_BASE_URL", label: "API 地址", required: true, secret: false },
      { key: "ANS_PI_MODEL", label: "模型", required: true, secret: false },
      { key: "ANS_PI_CONTEXT_WINDOW", label: "上下文窗口", required: false, secret: false, help: "留空使用保守默认值。" },
      { key: "ANS_PI_REASONING_EFFORT", label: "推理强度", required: false, secret: false, choices: ["off", "low", "medium", "high", "xhigh"], help: REASONING_EFFORT_HELP },
    ],
  },
  codex: {
    runtime: "codex", label: RUNTIME_LABELS.codex,
    fields: [
      { key: "CODEX_API_KEY", label: "API 密钥", required: true, secret: true, fallbackKeys: ["OPENAI_API_KEY"], help: "已有 OPENAI_API_KEY 时可使用其作为凭据。" },
      { key: "ANS_CODEX_MODEL", label: "模型", required: true, secret: false },
      { key: "ANS_CODEX_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 OpenAI API；自定义地址须兼容 Responses API。" },
      // Codex has no "off" level; the choices list states the platform's real ladder.
      { key: "ANS_CODEX_REASONING_EFFORT", label: "推理强度", required: false, secret: false, choices: ["low", "medium", "high", "xhigh"], help: REASONING_EFFORT_HELP },
    ],
  },
  claude: {
    runtime: "claude", label: RUNTIME_LABELS.claude,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "API 密钥", required: true, secret: true },
      { key: "ANS_CLAUDE_MODEL", label: "模型", required: false, secret: false, help: "留空使用 SDK 默认模型。" },
      { key: "ANTHROPIC_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 SDK 默认服务。" },
      { key: "ANS_CLAUDE_REASONING_EFFORT", label: "推理强度", required: false, secret: false, choices: ["off", "low", "medium", "high", "xhigh"], help: REASONING_EFFORT_HELP },
    ],
  },
};

export function getRuntimeSettingsDefinition(runtime: RuntimeKind): RuntimeSettingsDefinition | undefined {
  return runtime === "demo" ? undefined : RUNTIME_SETTINGS[runtime];
}
