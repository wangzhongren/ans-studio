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
  /** Explicitly use a range/slider control. Only present when the UI should not use the default
   *  control for this field (e.g. a select for `choices`). Describes the setting, not an implementation. */
  control?: "range";
  /** Friendly labels aligned 1:1 with `choices` (same length). Absent means the UI falls back to
   *  raw values; save errors may use these labels. */
  choiceLabels?: readonly string[];
  /**
   * Integer constraint metadata: present means the value must be an integer within these
   * inclusive bounds (each bound optional; `min: 1` expresses "positive integer"). This
   * describes the setting, not a control implementation; consumers validate before saving.
   * For fields with `choices`, the choices branch takes precedence; the bounds apply to
   * non-empty values (the empty string is the explicit default/clear option).
   */
  integer?: { min?: number; max?: number };
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
      {
        key: "ANS_PI_CONTEXT_WINDOW", label: "上下文窗口", required: false, secret: false,
        choices: ["", "32768", "65536", "131072", "262144", "500000", "1048576"],
        choiceLabels: ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"],
        control: "range", integer: { min: 1 },
        help: "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。",
      },
      {
        // 看护到点检查专用：适配器不再用该值中止整轮（最后兜底固定 1 小时，见 runtime-core/timeout.ts）。
        key: "ANS_PI_PROMPT_TIMEOUT_MS", label: "看护检查时限", required: false, secret: false,
        choices: ["", "60000", "120000", "300000", "600000", "900000", "1800000"],
        choiceLabels: ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"],
        control: "range", integer: { min: 1000 },
        help: "到点只通知治理角色检查是否卡死，不中止本轮；仍在推进则不动作；1 小时为最后兜底；留空＝系统默认（5 分钟）；单位 ms；下一次开启会话时应用。",
      },
      {
        key: "ANS_PI_REASONING_EFFORT", label: "推理强度", required: false, secret: false,
        choices: ["off", "low", "medium", "high", "xhigh"],
        choiceLabels: ["关", "低", "中", "高", "极高"],
        help: REASONING_EFFORT_HELP,
      },
    ],
  },
  codex: {
    runtime: "codex", label: RUNTIME_LABELS.codex,
    fields: [
      { key: "CODEX_API_KEY", label: "API 密钥", required: true, secret: true, fallbackKeys: ["OPENAI_API_KEY"], help: "已有 OPENAI_API_KEY 时可使用其作为凭据。" },
      { key: "ANS_CODEX_MODEL", label: "模型", required: true, secret: false },
      { key: "ANS_CODEX_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 OpenAI API；自定义地址须兼容 Responses API。" },
      // Codex has no "off" level; the choices list states the platform's real ladder.
      {
        key: "ANS_CODEX_REASONING_EFFORT", label: "推理强度", required: false, secret: false,
        choices: ["low", "medium", "high", "xhigh"],
        choiceLabels: ["低", "中", "高", "极高"],
        help: REASONING_EFFORT_HELP,
      },
    ],
  },
  claude: {
    runtime: "claude", label: RUNTIME_LABELS.claude,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "API 密钥", required: true, secret: true },
      { key: "ANS_CLAUDE_MODEL", label: "模型", required: false, secret: false, help: "留空使用 SDK 默认模型。" },
      { key: "ANTHROPIC_BASE_URL", label: "API 地址", required: false, secret: false, help: "留空使用 SDK 默认服务。" },
      {
        key: "ANS_CLAUDE_REASONING_EFFORT", label: "推理强度", required: false, secret: false,
        choices: ["off", "low", "medium", "high", "xhigh"],
        choiceLabels: ["关", "低", "中", "高", "极高"],
        help: REASONING_EFFORT_HELP,
      },
    ],
  },
};

export function getRuntimeSettingsDefinition(runtime: RuntimeKind): RuntimeSettingsDefinition | undefined {
  return runtime === "demo" ? undefined : RUNTIME_SETTINGS[runtime];
}
