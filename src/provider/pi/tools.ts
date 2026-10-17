// Approved legacy public facade. The core is the sole production tool/schema owner.
// No effectful initialization and no duplicated handler implementation.
export {
  buildGovernedTools, buildShellEnv, PI_CREDENTIAL_ENV_VARS, shellKillSwitch,
  SHELL_TOOL_NAME, REQUEST_CONFIRMATION_TOOL_NAME, REQUEST_CHOICE_TOOL_NAME,
  SUBMIT_REPORT_TOOL_NAME, DISPATCH_TASK_TOOL_NAME, SHELL_VERDICT_TOOL_NAME,
} from "../runtime/tools.ts";
export { describeTool } from "../runtime/schema.ts";
// 判断 agent（「替我审」）只读工具集的窄转出：实现与读取策略归运行时核心
// （`src/common/runtime-core/shell-judge/`），本 facade 不复制任何工具实现。
export {
  buildShellJudgeTools, SHELL_JUDGE_TOOL_NAMES,
  SHELL_JUDGE_READ_TOOL, SHELL_JUDGE_LIST_TOOL, SHELL_JUDGE_REPORT_TOOL,
} from "../../common/runtime-core/shell-judge/tools.ts";
export type { ShellKillSwitchDecision } from "../runtime/tools.ts";
export type { ToolDefinition, ToolResult, GovernedToolsOptions, ShellJudgeToolOptions } from "../../model/runtime.ts";
