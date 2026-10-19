// 2026-10-19 客户定调回归：shell 判断只做**系统风险审查**（卡死/越界/破坏/资源/敏感外发），
// 不判断业务必要性；`report_shell_judgement` 的 schema 文案必须与编排 rubric 同口径，
// 不得让模型同时看到新旧两套描述。另钉住读取预算的跨角色只读契约可导入、单一实现。
import test from "node:test";
import assert from "node:assert/strict";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { buildShellJudgeTools, SHELL_JUDGE_REPORT_TOOL } from "../../src/common/runtime-core/shell-judge/tools.ts";
import {
  resolveShellJudgeBudget,
  SHELL_JUDGE_DEFAULT_BUDGET,
  type ShellJudgeBudget as PolicyShellJudgeBudget,
} from "../../src/common/runtime-core/shell-judge/policy.ts";
import type { ShellJudgeBudget as NeutralShellJudgeBudget, ShellJudgeReadStats } from "../../src/model/runtime.ts";

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

function reportTool() {
  return describeTool(SHELL_JUDGE_REPORT_TOOL);
}

test("report_shell_judgement 的 verdict 参数为系统风险口径，三值枚举/required 不变", () => {
  const tool = reportTool();
  const parameters = tool.parameters as unknown as {
    properties: { verdict: { enum: string[]; description: string } };
    required: string[];
  };
  const verdict = parameters.properties.verdict;

  // 行为面冻结：字段名/枚举/必填不变（只改文案）。
  assert.deepEqual(verdict.enum, ["allow", "deny", "manual"]);
  assert.deepEqual(parameters.required, ["verdict"]);

  // 风险口径：allow = 未发现系统风险；deny = 有风险或无法确认安全；manual = 缺关键证据。
  assert.match(verdict.description, /no system risk found/i);
  assert.match(verdict.description, /safety cannot be confirmed/i);
  assert.match(verdict.description, /key evidence/i);
  assert.match(verdict.description, /does NOT assess business necessity/i);
  assert.match(verdict.description, /non-destructive commands inside the project/i);

  // 旧口径不得残留。
  assert.doesNotMatch(verdict.description, /necessary and safe/i);
  assert.doesNotMatch(verdict.description, /not necessary|unnecessary/i);
});

test("report_shell_judgement 描述与 promptGuidelines 含完整风险口径，且不含「不必要」", () => {
  const tool = reportTool();
  const text = [tool.description, ...(tool.promptGuidelines ?? [])].join("\n");

  for (const phrase of [
    "系统风险审查",
    "卡死",
    "越界",
    "破坏",
    "资源",
    "敏感外发",
    "未发现系统风险",
    "存在系统风险或无法确认安全",
    "不判断业务必要性",
    "不要求你理解业务",
    "项目内非破坏性命令由发起角色决定",
    "缺关键证据",
    "写明缺哪项证据",
  ]) {
    assert.ok(text.includes(phrase), `schema 文案应包含风险口径：${phrase}`);
  }

  // 客户明确要求：不得再出现「不必要」旧口径，也不得保留「必要且可自动放行」。
  assert.doesNotMatch(text, /不必要/);
  assert.doesNotMatch(text, /业务不必要/);
  assert.doesNotMatch(text, /必要且可自动放行/);
});

test("判断会话装配的 report 工具与 describeTool 同源（模型不会同时看到新旧两套描述）", () => {
  const tools = buildShellJudgeTools({ projectRoot: process.cwd(), report: () => {}, stats: freshStats() });
  const report = tools.find((tool) => tool.name === SHELL_JUDGE_REPORT_TOOL);
  assert.ok(report, "判断工具集应包含 report_shell_judgement");
  const described = reportTool();

  assert.equal(report.description, described.description);
  assert.deepEqual(report.promptGuidelines, described.promptGuidelines);
  assert.deepEqual(report.inputSchema, described.parameters);

  const text = [report.description, ...(report.promptGuidelines ?? [])].join("\n");
  assert.match(text, /系统风险审查/);
  assert.doesNotMatch(text, /不必要/);
});

test("读取预算契约可从编排既有导入路径与中立契约家导入，且为同一符号/同一解析值", () => {
  // 类型同一性（编译期）：policy re-export 与 model/runtime.ts 的定义可互相赋值。
  const fromPolicy: PolicyShellJudgeBudget = resolveShellJudgeBudget(undefined, {});
  const fromNeutral: NeutralShellJudgeBudget = fromPolicy;
  const backToPolicy: PolicyShellJudgeBudget = fromNeutral;
  assert.deepEqual(backToPolicy, { ...SHELL_JUDGE_DEFAULT_BUDGET });
  assert.deepEqual(Object.keys(backToPolicy).sort(), ["maxBytes", "maxCalls", "maxFileBytes", "maxScanBytes"]);

  // 契约优先级可观测：显式字段 > env > 缺省（编排传入的显式预算不会被环境变量意外覆盖）。
  const explicit = resolveShellJudgeBudget({ maxCalls: 3 }, { ANS_SHELL_JUDGE_MAX_CALLS: "7" });
  assert.equal(explicit.maxCalls, 3);
  const envWins = resolveShellJudgeBudget(undefined, { ANS_SHELL_JUDGE_MAX_CALLS: "7" });
  assert.equal(envWins.maxCalls, 7);
  assert.equal(envWins.maxBytes, SHELL_JUDGE_DEFAULT_BUDGET.maxBytes);

  // 缺省表冻结（读取方不得改写共享默认值）。
  assert.ok(Object.isFrozen(SHELL_JUDGE_DEFAULT_BUDGET));
});
