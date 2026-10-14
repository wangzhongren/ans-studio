// 跨角色共享运行时原语（**单一来源**）：运行时种类/显示名、各引擎凭据环境变量名单、
// 技能根解析 `resolveSkillRoot`。
//
// **属主：项目管理**。消费方：编排、装配、运行时核心、各适配器、桌面窗口。
// ——只读导入，**不得复制第二份实现**（工程法案 §一.5、`docs/architecture/shared-components.md`）。
//
// **来历（T23）**：设计 §3.11 全仓盘点——同一物散在多处各自维护：
//   · `RuntimeKind`（"demo" | "pi"）散在 **3 处**：编排 `src/common/编排/args.ts`、
//     装配 `src/common/装配/runtime.ts`、桌面 `app/desktop/session.ts`；
//   · `PI_CREDENTIAL_ENV_VARS` 两处：装配 `src/common/装配/runtime.ts` ↔ Pi适配器 `src/provider/pi/tools.ts`；
//   · `resolveSkillRoot` 两处：装配 `src/index.ts` ↔ 桌面 `app/desktop/project.ts`。
// 收敛为**单一来源**，各消费方改为只读导入（编排 T21、装配 T24、桌面 T22、Pi适配器 T20）。

import os from "node:os";
import path from "node:path";

/** 运行时种类取值（单一来源，与编排/装配/桌面三处对齐）。 */
export const RUNTIME_KINDS = ["demo", "pi", "codex", "claude"] as const;
/** demo 为装配演示替身；其余值为真实执行引擎，缺配置时由对应适配器明确报错。 */
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

/** 界面与 CLI 共用的引擎显示名。此目录仅描述选择，不判断授权或 SDK 可用性。 */
export const RUNTIME_LABELS: Readonly<Record<RuntimeKind, string>> = {
  demo: "演示",
  pi: "Pi",
  codex: "Codex",
  claude: "Claude",
};

/** 默认运行时（命令行、环境变量都缺省时）。 */
export const DEFAULT_RUNTIME: RuntimeKind = "demo";

/**
 * Pi 真实适配器所需的凭据环境变量（任一存在即视为有凭据）。
 * 依据 Pi 包产物中读取的凭据变量名（附录 A）：ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
 * OPENAI_API_KEY / GEMINI_API_KEY；另含约定俗成的 PI_API_KEY。
 *
 * **安全相关**：Pi适配器 `run_shell` spawn 子进程时**必须**从 env 中剥离这些变量（设计 §7.9）。
 * 单一来源后，装配的「有没有凭据」判定与 Pi适配器的「剥离集合」**引同一常量**，不会分叉。
 */
export const PI_CREDENTIAL_ENV_VARS: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PI_API_KEY",
];

/** 所有执行引擎的秘密键。公共 shell spawn 剥离这一集合，Pi 旧常量保留兼容。 */
export const RUNTIME_CREDENTIAL_ENV_VARS: readonly string[] = [
  ...PI_CREDENTIAL_ENV_VARS,
  // @openai/codex-sdk 0.162.1 将 apiKey 传给 CLI 子进程的 CODEX_API_KEY。
  "CODEX_API_KEY",
  // Codex 官方 CLI/app-server automation 的既有环境秘密；产品不把它作为 API-key fallback。
  "CODEX_ACCESS_TOKEN",
  // Claude Code 的既有 OAuth 环境秘密也须从 ANS shell 子进程剥离；设置面板不提供订阅登录。
  "CLAUDE_CODE_OAUTH_TOKEN",
];

/**
 * 技能根解析：优先 `ANS_SKILL_ROOT`，否则默认技能目录 `~/.claude/skills/ans-governed-construction`。
 * 是**配置取值**（不是判定逻辑）；env 可注入以便单测。
 */
export function resolveSkillRoot(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.ANS_SKILL_ROOT;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return path.join(os.homedir(), ".claude", "skills", "ans-governed-construction");
}
