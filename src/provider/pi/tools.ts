// Approved legacy public facade. The core is the sole production tool/schema owner.
// No effectful initialization and no duplicated handler implementation.
export {
  buildGovernedTools, buildShellEnv, PI_CREDENTIAL_ENV_VARS, shellKillSwitch,
  SHELL_TOOL_NAME, REQUEST_CONFIRMATION_TOOL_NAME, REQUEST_CHOICE_TOOL_NAME,
  SUBMIT_REPORT_TOOL_NAME, DISPATCH_TASK_TOOL_NAME, SHELL_VERDICT_TOOL_NAME,
} from "../runtime/tools.ts";
export { describeTool } from "../runtime/schema.ts";
export type { ShellKillSwitchDecision } from "../runtime/tools.ts";
export type { ToolDefinition, ToolResult, GovernedToolsOptions } from "../../model/runtime.ts";
