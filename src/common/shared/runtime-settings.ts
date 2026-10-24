// SDK settings metadata, maintained once by 项目管理. Never returns secret values.
//
// i18n（2026-10-23 B4）：展示文案不再以中文字面量保存在本模块，而是目录 key
// （`src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 的 `shared.runtimeSettings.*`）。
// 主进程在构造设置视图时按当前 locale 解析 key → `label`/`help`/`choiceLabels` 再推给渲染层；
// 渲染层视图契约不变（见 `角色卡/项目管理/api-spec.md`）。key 的类型是 `MessageKey`，
// 拼写错误/目录缺 key 在编译期失败；本模块只描述设置，不描述控件实现。
import { RUNTIME_LABELS, type RuntimeKind } from "./runtime-shared.ts";
import type { MessageKey } from "./i18n/keys.ts";

export interface RuntimeSettingField {
  key: string;
  /** 展示标签的目录 key（`shared.runtimeSettings.*`）；主进程按当前 locale 解析为 `label`。 */
  labelKey: MessageKey;
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
  /** Friendly label **directory keys** aligned 1:1 with `choices` (same length). Absent means the
   *  UI falls back to raw values; save errors may use the resolved labels. */
  choiceLabelKeys?: readonly MessageKey[];
  /**
   * Integer constraint metadata: present means the value must be an integer within these
   * inclusive bounds (each bound optional; `min: 1` expresses "positive integer"). This
   * describes the setting, not a control implementation; consumers validate before saving.
   * For fields with `choices`, the choices branch takes precedence; the bounds apply to
   * non-empty values (the empty string is the explicit default/clear option).
   */
  integer?: { min?: number; max?: number };
  /** 帮助文本的目录 key；主进程按当前 locale 解析为 `help`。 */
  helpKey?: MessageKey;
}

export interface RuntimeSettingsDefinition {
  runtime: Exclude<RuntimeKind, "demo">;
  /** 品牌显示名（Pi/Codex/Claude），不翻译、不进目录；demo 无设置定义。 */
  label: string;
  fields: readonly RuntimeSettingField[];
}

/** Reasoning-effort help: one verbatim wording shared by the three platforms. */
const REASONING_EFFORT_HELP_KEY: MessageKey = "shared.runtimeSettings.reasoning.help";

/** This describes settings, not account or endpoint availability. Adapters validate actual requests. */
export const RUNTIME_SETTINGS: Readonly<Record<Exclude<RuntimeKind, "demo">, RuntimeSettingsDefinition>> = {
  pi: {
    runtime: "pi", label: RUNTIME_LABELS.pi,
    fields: [
      { key: "ANTHROPIC_AUTH_TOKEN", labelKey: "shared.runtimeSettings.pi.token.label", required: true, secret: true },
      { key: "ANS_PI_BASE_URL", labelKey: "shared.runtimeSettings.field.apiBaseUrl.label", required: true, secret: false },
      { key: "ANS_PI_MODEL", labelKey: "shared.runtimeSettings.field.model.label", required: true, secret: false },
      {
        key: "ANS_PI_CONTEXT_WINDOW", labelKey: "shared.runtimeSettings.pi.contextWindow.label", required: false, secret: false,
        choices: ["", "32768", "65536", "131072", "262144", "500000", "1048576"],
        choiceLabelKeys: [
          "shared.runtimeSettings.pi.contextWindow.choice.default",
          "shared.runtimeSettings.pi.contextWindow.choice.k32",
          "shared.runtimeSettings.pi.contextWindow.choice.k64",
          "shared.runtimeSettings.pi.contextWindow.choice.k128",
          "shared.runtimeSettings.pi.contextWindow.choice.k256",
          "shared.runtimeSettings.pi.contextWindow.choice.k500",
          "shared.runtimeSettings.pi.contextWindow.choice.m1",
        ],
        control: "range", integer: { min: 1 },
        helpKey: "shared.runtimeSettings.pi.contextWindow.help",
      },
      {
        // 看护到点检查专用：适配器不再用该值中止整轮（最后兜底固定 1 小时，见 runtime-core/timeout.ts）。
        key: "ANS_PI_PROMPT_TIMEOUT_MS", labelKey: "shared.runtimeSettings.pi.promptTimeout.label", required: false, secret: false,
        choices: ["", "60000", "120000", "300000", "600000", "900000", "1800000"],
        choiceLabelKeys: [
          "shared.runtimeSettings.pi.promptTimeout.choice.default",
          "shared.runtimeSettings.pi.promptTimeout.choice.m1",
          "shared.runtimeSettings.pi.promptTimeout.choice.m2",
          "shared.runtimeSettings.pi.promptTimeout.choice.m5",
          "shared.runtimeSettings.pi.promptTimeout.choice.m10",
          "shared.runtimeSettings.pi.promptTimeout.choice.m15",
          "shared.runtimeSettings.pi.promptTimeout.choice.m30",
        ],
        control: "range", integer: { min: 1000 },
        helpKey: "shared.runtimeSettings.pi.promptTimeout.help",
      },
      {
        key: "ANS_PI_REASONING_EFFORT", labelKey: "shared.runtimeSettings.reasoning.label", required: false, secret: false,
        choices: ["off", "low", "medium", "high", "xhigh"],
        choiceLabelKeys: [
          "shared.runtimeSettings.reasoning.choice.off",
          "shared.runtimeSettings.reasoning.choice.low",
          "shared.runtimeSettings.reasoning.choice.medium",
          "shared.runtimeSettings.reasoning.choice.high",
          "shared.runtimeSettings.reasoning.choice.xhigh",
        ],
        helpKey: REASONING_EFFORT_HELP_KEY,
      },
    ],
  },
  codex: {
    runtime: "codex", label: RUNTIME_LABELS.codex,
    fields: [
      {
        key: "CODEX_API_KEY", labelKey: "shared.runtimeSettings.field.apiKey.label", required: true, secret: true,
        fallbackKeys: ["OPENAI_API_KEY"], helpKey: "shared.runtimeSettings.codex.apiKey.help",
      },
      { key: "ANS_CODEX_MODEL", labelKey: "shared.runtimeSettings.field.model.label", required: true, secret: false },
      {
        key: "ANS_CODEX_BASE_URL", labelKey: "shared.runtimeSettings.field.apiBaseUrl.label", required: false, secret: false,
        helpKey: "shared.runtimeSettings.codex.apiBaseUrl.help",
      },
      // Codex has no "off" level; the choices list states the platform's real ladder.
      {
        key: "ANS_CODEX_REASONING_EFFORT", labelKey: "shared.runtimeSettings.reasoning.label", required: false, secret: false,
        choices: ["low", "medium", "high", "xhigh"],
        choiceLabelKeys: [
          "shared.runtimeSettings.reasoning.choice.low",
          "shared.runtimeSettings.reasoning.choice.medium",
          "shared.runtimeSettings.reasoning.choice.high",
          "shared.runtimeSettings.reasoning.choice.xhigh",
        ],
        helpKey: REASONING_EFFORT_HELP_KEY,
      },
    ],
  },
  claude: {
    runtime: "claude", label: RUNTIME_LABELS.claude,
    fields: [
      { key: "ANTHROPIC_API_KEY", labelKey: "shared.runtimeSettings.field.apiKey.label", required: true, secret: true },
      {
        key: "ANS_CLAUDE_MODEL", labelKey: "shared.runtimeSettings.field.model.label", required: false, secret: false,
        helpKey: "shared.runtimeSettings.claude.model.help",
      },
      {
        key: "ANTHROPIC_BASE_URL", labelKey: "shared.runtimeSettings.field.apiBaseUrl.label", required: false, secret: false,
        helpKey: "shared.runtimeSettings.claude.apiBaseUrl.help",
      },
      {
        key: "ANS_CLAUDE_REASONING_EFFORT", labelKey: "shared.runtimeSettings.reasoning.label", required: false, secret: false,
        choices: ["off", "low", "medium", "high", "xhigh"],
        choiceLabelKeys: [
          "shared.runtimeSettings.reasoning.choice.off",
          "shared.runtimeSettings.reasoning.choice.low",
          "shared.runtimeSettings.reasoning.choice.medium",
          "shared.runtimeSettings.reasoning.choice.high",
          "shared.runtimeSettings.reasoning.choice.xhigh",
        ],
        helpKey: REASONING_EFFORT_HELP_KEY,
      },
    ],
  },
};

export function getRuntimeSettingsDefinition(runtime: RuntimeKind): RuntimeSettingsDefinition | undefined {
  return runtime === "demo" ? undefined : RUNTIME_SETTINGS[runtime];
}
