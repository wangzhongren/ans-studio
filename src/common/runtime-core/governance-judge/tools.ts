// 治理卡判断 agent（「替我审批」/「替我决策」）只读工具集。Owner: 运行时核心。
//
// `buildGovernanceJudgeTools` **只**返回三个工具：`judge_read_file`、`judge_list_dir`、
// `report_governance_judgement`（2026-10-18 PM 评审《「替我审批」/「替我决策」双开关》§6.2）。
// 它**不接收** `WriteGate`/`ShellGate`/`CustomerInputFn`/`ReportHandbackFn`/`DispatchTaskFn`——
// 类型层面就接不上写/执行/交互/回交/派发能力；也结构性不构造 write/edit/run_shell/客户交互/
// 回交/派发/MCP 工具。
//
// 读/列复用 `shell-judge/policy.ts`（realpath＋项目根＋敏感排除＋二进制＋预算），并按评审 §6.3
// 收紧：**整棵 `.ans/**` 硬排除**（账本/会话/应用文件；`JudgePathClass` 的 `app-private`）。
// `report_governance_judgement` 只把模型**原始参数**交给注入的回调；规范化/required-read/
// 逐路径复核在编排侧（`src/common/编排/governance-judge-verdict.ts`），运行时核心**不做第二份裁决语义**。
//
// 并集常量 `ALL_JUDGE_TOOL_NAMES` 只用于三适配器的 judge allowlist（shell 与治理会话都能注册各自的
// report 工具）；**不用于装配**——`buildShellJudgeTools` 仍恰三只 shell 工具、
// `buildGovernanceJudgeTools` 仍恰三只治理工具。

import type { GovernanceJudgeToolOptions, ToolDefinition, ToolResult } from "../../../model/runtime.ts";
import { describeTool } from "../../../provider/runtime/schema.ts";
import { resolveJudgeList, resolveJudgeRead } from "../shell-judge/policy.ts";
import {
  judgeToolAborted,
  judgeToolFailure,
  SHELL_JUDGE_LIST_TOOL,
  SHELL_JUDGE_READ_TOOL,
  SHELL_JUDGE_TOOL_NAMES,
} from "../shell-judge/tools.ts";

/** 结构化治理判断结论工具名（评审 §6.2 冻结）。 */
export const GOVERNANCE_JUDGE_REPORT_TOOL = "report_governance_judgement";

/** 治理 judge 会话的工具名冻结集合：读/列复用 shell judge 名，report 为治理专用。 */
export const GOVERNANCE_JUDGE_TOOL_NAMES = [SHELL_JUDGE_READ_TOOL, SHELL_JUDGE_LIST_TOOL, GOVERNANCE_JUDGE_REPORT_TOOL] as const;

const ALL_JUDGE_TOOL_NAME_LIST = [...SHELL_JUDGE_TOOL_NAMES, ...GOVERNANCE_JUDGE_TOOL_NAMES];
type JudgeToolName = (typeof ALL_JUDGE_TOOL_NAME_LIST)[number];

/**
 * 三适配器 judge allowlist 的**单一来源**（评审 §6.2）：shell 与治理判断会话的工具名并集。
 * 只用于「允许注册哪些工具」，不用于装配——装配仍分别走 `buildShellJudgeTools`/
 * `buildGovernanceJudgeTools`（各恰三只）。去重后恰四只。
 */
export const ALL_JUDGE_TOOL_NAMES: readonly JudgeToolName[] = Object.freeze([...new Set(ALL_JUDGE_TOOL_NAME_LIST)]);

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
 * 构造治理判断会话的只读工具集（恰三项）。调用方（Service）在 `governanceJudge` 注入时走本函数，
 * **不得**再走 `buildGovernedTools`；与 `shellJudge` 恰一。
 */
export function buildGovernanceJudgeTools(options: GovernanceJudgeToolOptions): ToolDefinition[] {
  const read: ToolDefinition = definition(SHELL_JUDGE_READ_TOOL, async (call) => {
    if (call.signal?.aborted) return judgeToolAborted(SHELL_JUDGE_READ_TOOL);
    const input = stringArg(call.args?.path);
    const result = await resolveJudgeRead({ projectRoot: options.projectRoot, path: input ?? "", stats: options.stats, budget: options.budget });
    if (!result.ok) return judgeToolFailure(SHELL_JUDGE_READ_TOOL, result.code, result.pathClass);
    return {
      ok: true,
      message: `${SHELL_JUDGE_READ_TOOL}: ${result.rel}\n\n${result.text}${result.truncated ? "\n\n[已截断：文件超过单文件/总读取预算]" : ""}`,
    };
  });

  const list: ToolDefinition = definition(SHELL_JUDGE_LIST_TOOL, async (call) => {
    if (call.signal?.aborted) return judgeToolAborted(SHELL_JUDGE_LIST_TOOL);
    const input = stringArg(call.args?.path);
    const result = await resolveJudgeList({ projectRoot: options.projectRoot, ...(input !== undefined ? { path: input } : {}), stats: options.stats, budget: options.budget });
    if (!result.ok) return judgeToolFailure(SHELL_JUDGE_LIST_TOOL, result.code, result.pathClass);
    const body = result.entries.length > 0 ? result.entries.join("\n") : "（空目录或无可列条目）";
    return {
      ok: true,
      message: `${SHELL_JUDGE_LIST_TOOL}: ${result.rel}\n\n${body}${result.truncated ? "\n\n[已截断：条目超过上限]" : ""}`,
    };
  });

  const report: ToolDefinition = definition(GOVERNANCE_JUDGE_REPORT_TOOL, async (call): Promise<ToolResult> => {
    if (call.signal?.aborted) return judgeToolAborted(GOVERNANCE_JUDGE_REPORT_TOOL);
    // **原样回调**：不做取值域/长度/歧义规范化（规范化与 required-read 在编排侧唯一裁决点）。
    try {
      options.report(call.args);
    } catch {
      return { ok: false, message: `${GOVERNANCE_JUDGE_REPORT_TOOL}：结论未能交回，请重试一次` };
    }
    return { ok: true, message: `${GOVERNANCE_JUDGE_REPORT_TOOL}：结论已交回。` };
  });

  return [read, list, report];
}
