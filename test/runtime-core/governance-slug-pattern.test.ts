import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";
import type {
  CustomerInputRequest,
  DispatchTaskPayload,
  HandOffIntentPayload,
  RequestClarificationPayload,
} from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

// 2026-10-22 客户确认收紧（设计 2026-10-22_design_governance-slug-no-trailing-hyphen.md S1）：
// 共享 slug 契约改为 2–64 位、首尾小写字母/数字、内部可含连字符、禁止首/尾连字符；连续连字符仍允许。
const PATTERN = new RegExp(GOVERNANCE_SLUG_PATTERN);
const tools = (options?: Parameters<typeof buildGovernedTools>[1]) =>
  new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
const toolArgs = (toolName: string, args: Record<string, unknown>) => ({ name: toolName, args });
const legalHandOff = {
  intentId: "intent-alpha",
  handoffKind: "initial",
  goal: "把导出功能做出来",
  scope: "仅 CSV 导出",
  acceptance: "客户可导出并复读文件",
  summary: "客户要 CSV 导出",
};

test("T1/T2 GOVERNANCE_SLUG_PATTERN：新值逐字相等，正反例与 2/64 长度边界符合设计 §2", () => {
  assert.equal(GOVERNANCE_SLUG_PATTERN, "^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$");

  const accepted = ["flow-a", "a-b", "ab", "todo-list-v1", "a--b", "1-a", "a-1", "a".repeat(64)];
  const rejected = ["a", "a".repeat(65), "flow-", "a-", "flow--", "-flow", "Flow", "a_b", "", "flow-\n"];
  for (const value of accepted) assert.equal(PATTERN.test(value), true, `应接受 ${JSON.stringify(value)}`);
  for (const value of rejected) assert.equal(PATTERN.test(value), false, `应拒绝 ${JSON.stringify(value)}`);
});

test("T3 schema：五个工具的 slug pattern 全部等于 Model 常量，治理元数据字段仍可选", () => {
  // [工具, [字段, 是否必须可选]]；hand_off_intent.intentId 是既有必填业务字段，不随本变更改动。
  const expected: [string, [string, boolean][]][] = [
    ["request_confirmation", [["flowId", true], ["stepId", true]]],
    ["request_choice", [["flowId", true], ["stepId", true]]],
    ["dispatch_task", [["flowId", true], ["stepId", true]]],
    ["hand_off_intent", [["intentId", false], ["flowId", true]]],
    ["request_clarification", [["flowId", true], ["intentId", true]]],
  ];
  for (const [toolName, fields] of expected) {
    const parameters = describeTool(toolName).parameters as {
      properties: Record<string, { pattern?: string }>;
      required?: string[];
    };
    for (const [field, optional] of fields) {
      assert.equal(parameters.properties[field].pattern, GOVERNANCE_SLUG_PATTERN, `${toolName}.${field} pattern 必须与常量同源`);
      assert.equal((parameters.required ?? []).includes(field), !optional, `${toolName}.${field} 的可选性与既有契约不一致`);
    }
  }
});

test("T4 handler：flow-/a-/impl-/intent- 在五个工具触达能力前被拒绝，点名字段并展示新正则", async () => {
  let customerCalls = 0;
  let dispatchCalls = 0;
  let handOffCalls = 0;
  let clarifyCalls = 0;
  const byName = tools({
    customerInput: () => { customerCalls++; return { outcome: "declined" }; },
    dispatchTask: () => { dispatchCalls++; return { ok: true }; },
    handOffIntent: () => { handOffCalls++; return { ok: true }; },
    requestClarification: () => { clarifyCalls++; return { ok: true }; },
  });
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["request_confirmation", { title: "x", flowId: "flow-" }, /flowId/],
    ["request_confirmation", { title: "x", flowId: "a-" }, /flowId/],
    ["request_confirmation", { title: "x", stepId: "impl-" }, /stepId/],
    ["request_choice", { title: "x", options: [{ id: "a", label: "A" }], flowId: "flow-" }, /flowId/],
    ["request_choice", { title: "x", options: [{ id: "a", label: "A" }], stepId: "impl-" }, /stepId/],
    ["dispatch_task", { roleId: "role-a", task: "t", flowId: "flow-" }, /flowId/],
    ["dispatch_task", { roleId: "role-a", task: "t", stepId: "impl-" }, /stepId/],
    ["hand_off_intent", { ...legalHandOff, intentId: "intent-" }, /intentId/],
    ["hand_off_intent", { ...legalHandOff, flowId: "flow-" }, /flowId/],
    ["request_clarification", { flowId: "a-", question: "?" }, /flowId/],
    ["request_clarification", { intentId: "intent-", question: "?" }, /intentId/],
  ];
  for (const [toolName, args, fieldPattern] of cases) {
    const result = await byName.get(toolName)!.handler(toolArgs(toolName, args));
    assert.equal(result.ok, false, `${toolName} ${JSON.stringify(args)} 必须拒绝`);
    assert.match(result.message, fieldPattern, `${toolName} 拒绝文案须点名非法字段`);
    assert.ok(result.message.includes(GOVERNANCE_SLUG_PATTERN), `${toolName} 拒绝文案须展示新正则`);
  }
  assert.deepEqual([customerCalls, dispatchCalls, handOffCalls, clarifyCalls], [0, 0, 0, 0], "非法 slug 不得触达客户通道/派发/交接/澄清能力");
});

test("T4b handler：合法 slug（ab/a-b/a--b/64 位等）原样透传，既有合法值零回归", async () => {
  const accepted = ["flow-a", "a-b", "ab", "a--b", "todo-list-v1", "1-a", "a-1", "a".repeat(64)];
  let request!: CustomerInputRequest;
  const dispatched: DispatchTaskPayload[] = [];
  const handedOff: HandOffIntentPayload[] = [];
  const clarified: RequestClarificationPayload[] = [];
  const byName = tools({
    customerInput: (req) => { request = req; return { outcome: "answered", value: { confirmed: true } }; },
    dispatchTask: (payload) => { dispatched.push(payload); return { ok: true }; },
    handOffIntent: (payload) => { handedOff.push(payload); return { ok: true }; },
    requestClarification: (payload) => { clarified.push(payload); return { ok: true }; },
  });

  for (const flowId of accepted) {
    assert.equal((await byName.get("request_confirmation")!.handler(toolArgs("request_confirmation", { title: "x", flowId }))).ok, true, `flowId=${flowId} 应接受`);
    assert.equal(request.flowId, flowId, "合法 flowId 必须原样透传");

    assert.equal((await byName.get("dispatch_task")!.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "t", stepId: flowId }))).ok, true, `stepId=${flowId} 应接受`);
    assert.equal(dispatched.at(-1)?.stepId, flowId, "合法 stepId 必须原样透传");

    assert.equal((await byName.get("hand_off_intent")!.handler(toolArgs("hand_off_intent", { ...legalHandOff, intentId: flowId }))).ok, true, `intentId=${flowId} 应接受`);
    assert.equal(handedOff.at(-1)?.intentId, flowId, "合法 intentId 必须原样透传");

    assert.equal((await byName.get("request_clarification")!.handler(toolArgs("request_clarification", { flowId, question: "?" }))).ok, true, `flowId=${flowId} 应接受`);
    assert.equal(clarified.at(-1)?.flowId, flowId, "合法澄清 flowId 必须原样透传");
  }
});
