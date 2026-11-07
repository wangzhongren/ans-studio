// 2026-11-05：方案升级报告（report_plan_escalation）工具层契约。
// 只验证工具层：注入才注册、仅 convener 可提交、形状校验、恰好一次调用、结构化回执复核、
// 身份由工具填入、中止不调用、schema 单一来源。应用侧发卡/通知/去重不在本文件范围。
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernedTools,
  REPORT_PLAN_ESCALATION_TOOL_NAME,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type {
  GovernedToolsOptions,
  PlanEscalationFn,
  PlanEscalationInput,
} from "../../src/model/runtime.ts";
import {
  GOVERNANCE_SLUG_PATTERN,
  PLAN_ESCALATION_CATEGORIES,
  PLAN_ESCALATION_SUMMARY_MAX,
} from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const TOOL_NAME = REPORT_PLAN_ESCALATION_TOOL_NAME;

function toolsFor(options: GovernedToolsOptions = {}) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

const run = (options: GovernedToolsOptions, name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  toolsFor(options).get(name)!.handler({ name, args, signal });

const validArgs = () => ({
  flowId: "flow-demo",
  category: "scheme",
  summary: "E0 要求应用无法创建的 OS 级隔离身份，方案不可执行",
});

test("PLAN-ESC/未注入能力：report_plan_escalation 不注册（能力缺席 = 最强 fail-closed）", () => {
  const names = [...toolsFor({ roleId: "convener" }).keys()];
  assert.equal(names.includes(TOOL_NAME), false, "未注入 reportPlanEscalation 时工具不得存在");
});

test("PLAN-ESC/convener 成功：能力恰调用一次、身份由工具填入、回执 presented 且文案含「申请≠批准」", async () => {
  const calls: PlanEscalationInput[] = [];
  const fn: PlanEscalationFn = async (input) => {
    calls.push(input);
    return { ok: true, requestId: "plan-escalation-flow-demo", status: "presented" };
  };
  const args = validArgs();
  const result = await run({ roleId: "convener", reportPlanEscalation: fn }, TOOL_NAME, args);
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /requestId=plan-escalation-flow-demo/);
  assert.match(result.message, /status=presented/);
  assert.match(result.message, /申请≠批准/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    roleId: "convener",
    flowId: "flow-demo",
    category: "scheme",
    summary: args.summary,
  });
});

test("PLAN-ESC/summary 边界：恰为上限的码点长度接受；超 1 个码点拒绝且不调用", async () => {
  const calls: PlanEscalationInput[] = [];
  const fn: PlanEscalationFn = async (input) => {
    calls.push(input);
    return { ok: true, requestId: "plan-escalation-flow-demo", status: "presented" };
  };
  const atLimit = "报".repeat(PLAN_ESCALATION_SUMMARY_MAX);
  const accepted = await run({ roleId: "convener", reportPlanEscalation: fn }, TOOL_NAME, {
    flowId: "flow-demo",
    category: "evidence",
    summary: atLimit,
  });
  assert.equal(accepted.ok, true, accepted.message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.summary, atLimit);

  const overLimit = await run({ roleId: "convener", reportPlanEscalation: fn }, TOOL_NAME, {
    flowId: "flow-demo",
    category: "evidence",
    summary: `${atLimit}报`,
  });
  assert.equal(overLimit.ok, false);
  assert.match(overLimit.message, /plan-escalation-invalid/);
  assert.equal(calls.length, 1, "超限必须在触达能力前拒绝");
});

test("PLAN-ESC/角色门控：非 convener 或身份缺失 ⇒ plan-escalation-role-not-allowed 且能力不被调用", async () => {
  const scenarios: Array<{ roleId: string | undefined; detail: string }> = [
    { roleId: "product", detail: "项目角色拒绝" },
    { roleId: "rapporteur", detail: "其他治理角色拒绝" },
    { roleId: "", detail: "空身份拒绝" },
    { roleId: undefined, detail: "身份未注入即拒绝" },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const fn: PlanEscalationFn = async () => {
      calls += 1;
      return { ok: true, requestId: "plan-escalation-flow-demo", status: "presented" };
    };
    const options: GovernedToolsOptions = {
      ...(scenario.roleId !== undefined ? { roleId: scenario.roleId } : {}),
      reportPlanEscalation: fn,
    };
    const result = await run(options, TOOL_NAME, validArgs());
    assert.equal(result.ok, false, scenario.detail);
    assert.match(result.message, /plan-escalation-role-not-allowed/, scenario.detail);
    assert.equal(calls, 0, scenario.detail);
  }
});

test("PLAN-ESC/形状非法 ⇒ plan-escalation-invalid 且能力不被调用（未知参数/category/flowId/summary）", async () => {
  let calls = 0;
  const fn: PlanEscalationFn = async () => {
    calls += 1;
    return { ok: true, requestId: "plan-escalation-flow-demo", status: "presented" };
  };
  const base = validArgs();
  const badArgs: Array<Record<string, unknown>> = [
    { ...base, unexpected: true },
    { ...base, roleId: "convener" },
    { flowId: base.flowId, summary: base.summary },
    { ...base, category: "nonsense" },
    { ...base, category: 1 },
    { ...base, flowId: "Flow-Demo" },
    { ...base, flowId: "flow_demo" },
    { ...base, flowId: "a" },
    { ...base, flowId: "-flow" },
    { ...base, flowId: "flow-" },
    { ...base, flowId: 7 },
    { flowId: base.flowId, category: base.category },
    { ...base, summary: "" },
    { ...base, summary: "   " },
    { ...base, summary: 42 },
    { ...base, summary: "x".repeat(PLAN_ESCALATION_SUMMARY_MAX + 1) },
  ];
  for (const args of badArgs) {
    const result = await run({ roleId: "convener", reportPlanEscalation: fn }, TOOL_NAME, args);
    assert.equal(result.ok, false, JSON.stringify(args).slice(0, 120));
    assert.match(result.message, /plan-escalation-invalid/, JSON.stringify(args).slice(0, 120));
  }
  assert.equal(calls, 0);
});

test("PLAN-ESC/能力失败：ok:false 回执如实转达、恰一次调用；抛错按未提交处理", async () => {
  const failures: PlanEscalationFn[] = [
    async () => ({ ok: false, errorCode: "plan-escalation-conflict", message: "该 flow 已有在途升级卡" }),
    async () => ({ ok: false, errorCode: "plan-escalation-channel-unavailable", message: "客户通道不可用" }),
    async () => {
      throw new Error("应用异常");
    },
  ];
  for (const fn of failures) {
    let calls = 0;
    const counted: PlanEscalationFn = async (input, signal) => {
      calls += 1;
      return fn(input, signal);
    };
    const result = await run({ roleId: "convener", reportPlanEscalation: counted }, TOOL_NAME, validArgs());
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
  }
});

test("PLAN-ESC/越权或契约外回执（approved、坏/缺 requestId、坏 errorCode）⇒ ok:false 且恰一次调用", async () => {
  const outcomes: unknown[] = [
    { ok: true, requestId: "plan-escalation-flow-demo", status: "approved" },
    { ok: true, requestId: "plan-escalation-flow-demo", status: "revised" },
    { ok: true, requestId: "not-a-plan-escalation-id", status: "presented" },
    { ok: true, requestId: "plan-escalation-", status: "presented" },
    { ok: true, requestId: "plan-escalation-Flow", status: "presented" },
    { ok: true, status: "presented" },
    { ok: true, requestId: "plan-escalation-flow-demo", status: "presented", errorCode: "plan-escalation-invalid" },
    { ok: false, errorCode: "plan-escalation-not-a-code", message: "bad code" },
    { ok: "yes", requestId: "plan-escalation-flow-demo", status: "presented" },
    null,
    "presented",
  ];
  for (const outcome of outcomes) {
    let calls = 0;
    const fn: PlanEscalationFn = async () => {
      calls += 1;
      return outcome as Awaited<ReturnType<PlanEscalationFn>>;
    };
    const result = await run({ roleId: "convener", reportPlanEscalation: fn }, TOOL_NAME, validArgs());
    assert.equal(result.ok, false, JSON.stringify(outcome));
    assert.equal(calls, 1, JSON.stringify(outcome));
  }
});

test("PLAN-ESC/中止：发起轮次已中止 ⇒ 能力不被调用、如实未提交", async () => {
  let calls = 0;
  const fn: PlanEscalationFn = async () => {
    calls += 1;
    return { ok: true, requestId: "plan-escalation-flow-demo", status: "presented" };
  };
  const controller = new AbortController();
  controller.abort();
  const result = await run(
    { roleId: "convener", reportPlanEscalation: fn },
    TOOL_NAME,
    validArgs(),
    controller.signal,
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("PLAN-ESC/schema：required/enum/additionalProperties/maxLength/executionMode 与 Model 单一来源一致", () => {
  const description = describeTool(TOOL_NAME);
  assert.equal(description.parameters["additionalProperties"], false);
  assert.deepEqual(description.parameters["required"], ["flowId", "category", "summary"]);
  const props = description.parameters["properties"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(props["category"]!["enum"], [...PLAN_ESCALATION_CATEGORIES]);
  assert.equal(props["summary"]!["maxLength"], PLAN_ESCALATION_SUMMARY_MAX);
  assert.equal(props["summary"]!["minLength"], 1);
  assert.equal(props["flowId"]!["pattern"], GOVERNANCE_SLUG_PATTERN);
  assert.equal(description.executionMode, "sequential");
});
