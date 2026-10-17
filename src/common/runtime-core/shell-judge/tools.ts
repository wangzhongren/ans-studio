// 判断 agent（「替我审」）只读工具集。Owner: 运行时核心。
//
// `buildShellJudgeTools` **只**返回三个工具：`judge_read_file`、`judge_list_dir`、
// `report_shell_judgement`。它**不接收** `WriteGate`/`ShellGate`/`CustomerInputFn`/
// `ReportHandbackFn`/`DispatchTaskFn`——类型层面就接不上写/执行/交互/回交/派发能力；
// 也结构性不构造 write/edit/run_shell/客户交互/回交/派发/MCP 工具（PM 评审 §6.2/§7.1）。
//
// `report_shell_judgement` 只把模型**原始参数**交给注入的回调；裁决规范化/客户说明合成/脱敏在编排侧
// （`src/common/编排/shell-judge-verdict.ts`），运行时核心**不做第二份裁决语义**。

import type { ShellJudgeToolOptions, ToolDefinition, ToolResult } from "../../../model/runtime.ts";
import { describeTool } from "../../../provider/runtime/schema.ts";
import type { JudgeReadCode } from "./policy.ts";
import { resolveJudgeList, resolveJudgeRead } from "./policy.ts";

/** 结构化结论工具名（PM 评审 §6.2 冻结）。 */
export const SHELL_JUDGE_REPORT_TOOL = "report_shell_judgement";
/** 只读文件工具名（PM 评审 §6.2 冻结）。 */
export const SHELL_JUDGE_READ_TOOL = "judge_read_file";
/** 只读目录工具名（PM 评审 §6.2 冻结）。 */
export const SHELL_JUDGE_LIST_TOOL = "judge_list_dir";

/** 工具名冻结集合（测试与装配的单一来源）。 */
export const SHELL_JUDGE_TOOL_NAMES = [SHELL_JUDGE_READ_TOOL, SHELL_JUDGE_LIST_TOOL, SHELL_JUDGE_REPORT_TOOL] as const;

const REASON_TEXT: Record<JudgeReadCode, string> = {
  empty: "缺少 path 参数",
  "invalid-path": "路径非法（已拒绝）",
  "outside-root": "路径在项目根之外（已拒绝）",
  sensitive: "该路径属于敏感文件/目录（已拒绝）",
  "not-found": "路径不存在或不可访问",
  "not-a-file": "目标不是常规文件（目录请用 judge_list_dir）",
  "not-a-directory": "目标不是目录",
  binary: "目标疑似二进制文件（已拒绝）",
  budget: "读取预算已耗尽（调用次数/总读取上限）",
  "read-failed": "读取失败",
};

function failure(name: string, code: JudgeReadCode, pathClass: string): ToolResult {
  // 不回显绝对路径；最多给类别（PM 评审 §7.2 硬要求）。
  return { ok: false, message: `${name}：${REASON_TEXT[code]}（类别：${pathClass}）。不要据此假设文件内容。` };
}

function aborted(name: string): ToolResult {
  return { ok: false, message: `${name}：本轮已中止，未执行` };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** JSON-Schema/说明来自 `schema.ts`（与 `describeTool` 同源）。 */
function definition(name: string, handler: ToolDefinition["handler"]): ToolDefinition {
  const { parameters, description, promptGuidelines, executionMode } = describeTool(name);
  return {
    name,
    description,
    inputSchema: parameters,
    ...(promptGuidelines !== undefined ? { promptGuidelines } : {}),
    ...(executionMode !== undefined ? { executionMode } : {}),
    handler,
  };
}

/**
 * 构造判断会话的只读工具集（恰三项）。调用方（Service）在 `shellJudge` 注入时走本函数，
 * **不得**再走 `buildGovernedTools`。
 */
export function buildShellJudgeTools(options: ShellJudgeToolOptions): ToolDefinition[] {
  const read: ToolDefinition = definition(SHELL_JUDGE_READ_TOOL, async (call) => {
    if (call.signal?.aborted) return aborted(SHELL_JUDGE_READ_TOOL);
    const input = stringArg(call.args?.path);
    const result = await resolveJudgeRead({ projectRoot: options.projectRoot, path: input ?? "", stats: options.stats, budget: options.budget });
    if (!result.ok) return failure(SHELL_JUDGE_READ_TOOL, result.code, result.pathClass);
    return {
      ok: true,
      message: `${SHELL_JUDGE_READ_TOOL}: ${result.rel}\n\n${result.text}${result.truncated ? "\n\n[已截断：文件超过单文件/总读取预算]" : ""}`,
    };
  });

  const list: ToolDefinition = definition(SHELL_JUDGE_LIST_TOOL, async (call) => {
    if (call.signal?.aborted) return aborted(SHELL_JUDGE_LIST_TOOL);
    const input = stringArg(call.args?.path);
    const result = await resolveJudgeList({ projectRoot: options.projectRoot, ...(input !== undefined ? { path: input } : {}), stats: options.stats, budget: options.budget });
    if (!result.ok) return failure(SHELL_JUDGE_LIST_TOOL, result.code, result.pathClass);
    const body = result.entries.length > 0 ? result.entries.join("\n") : "（空目录或无可列条目）";
    return {
      ok: true,
      message: `${SHELL_JUDGE_LIST_TOOL}: ${result.rel}\n\n${body}${result.truncated ? "\n\n[已截断：条目超过上限]" : ""}`,
    };
  });

  const report: ToolDefinition = definition(SHELL_JUDGE_REPORT_TOOL, async (call) => {
    if (call.signal?.aborted) return aborted(SHELL_JUDGE_REPORT_TOOL);
    // **原样回调**：不做取值域/长度/歧义规范化（那属于编排侧唯一裁决语义）。
    try {
      options.report(call.args);
    } catch {
      return { ok: false, message: `${SHELL_JUDGE_REPORT_TOOL}：结论未能交回，请重试一次` };
    }
    return { ok: true, message: `${SHELL_JUDGE_REPORT_TOOL}：结论已交回。` };
  });

  return [read, list, report];
}
