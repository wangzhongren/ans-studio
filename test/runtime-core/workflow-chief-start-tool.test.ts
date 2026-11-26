import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools, createDemoRuntimeAdapter, REQUEST_WORKFLOW_START_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { isChiefDecisionExecutionContext } from "../../src/model/runtime.ts";
import type {
  ChiefDecisionExecutionContext, CustomerInputRequest, GovernanceChoiceCardKind, GovernanceConfirmCardKind, ProjectStateFn,
} from "../../src/model/runtime.ts";
import type { DurableRequestWorkflowStartInput, DurableRequestWorkflowStartFn } from "../../src/model/durable-workflow.ts";
import { allow, neutralProjectRoot, role } from "./fixtures.ts";

const name = REQUEST_WORKFLOW_START_TOOL_NAME;
const args = {
  definitionId: "path-a",
  source: "preset",
  expectedDigest: "a".repeat(64),
  reason: "此需求与预设流程匹配",
} as const;
const pending = {
  ok: true,
  value: { state: "pending", activationId: "activate-1", definitionDigest: args.expectedDigest },
} as const;

test("工作流提议工具仅在已注入能力的幕僚会话中出现", () => {
  const requestWorkflowStart: DurableRequestWorkflowStartFn = async () => pending;
  for (const options of [{}, { roleId: "chief" }, { roleId: "convener", requestWorkflowStart }, { requestWorkflowStart }]) {
    assert.equal(buildGovernedTools(allow, options).some(tool => tool.name === name), false);
  }
  const tool = buildGovernedTools(allow, { roleId: "chief", requestWorkflowStart }).find(tool => tool.name === name)!;
  assert.deepEqual(tool.inputSchema, describeTool(name).parameters);
  assert.deepEqual(tool.inputSchema.required, Object.keys(args));
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test("普通幕僚运行时调用真实注入的提议能力，透传完整选择一次", async (t) => {
  const fixture = await neutralProjectRoot();
  t.after(fixture.cleanup);
  const received: DurableRequestWorkflowStartInput[] = [];
  const adapter = createRuntimeAdapter({
    runtime: "demo", gate: allow, projectRoot: fixture.root, skillRoot: fixture.root,
    async requestWorkflowStart(input) {
      received.push(input);
      return pending;
    },
    providerFactories: { demo: provider => createDemoRuntimeAdapter(provider, [{ name, args }]) },
  });
  const session = await adapter.bindRole(role("chief"));
  try {
    await session.prompt("请幕僚按需求选择工作流");
    assert.deepEqual(received, [args]);
  } finally {
    await session.dispose();
  }
});

test("工作流提议拒绝越权参数、错误字段及中止调用，核验 pending 回执", async () => {
  let calls = 0;
  let receipt: unknown = pending;
  const requestWorkflowStart = (async () => { calls += 1; return receipt; }) as DurableRequestWorkflowStartFn;
  const tool = buildGovernedTools(allow, { roleId: "chief", requestWorkflowStart }).find(tool => tool.name === name)!;
  for (const changes of [
    { projectRoot: "elsewhere" }, { customerApproved: true }, { definitionId: "../path-a" },
    { source: "app" }, { expectedDigest: "A".repeat(64) }, { reason: " \n " },
  ]) {
    assert.equal((await tool.handler({ name, args: { ...args, ...changes } })).ok, false);
  }
  assert.equal((await tool.handler({ name, args, signal: AbortSignal.abort() })).ok, false);
  assert.equal(calls, 0);
  const result = await tool.handler({ name, args });
  assert.equal(result.ok, true);
  assert.match(result.message, /"state":"pending"/);
  assert.match(result.message, /"activationId":"activate-1"/);
  assert.match(result.message, /等待客户本人确认启用/);
  for (const value of [
    { ...pending.value, state: "approved" }, { ...pending.value, definitionDigest: "b".repeat(64) },
  ]) {
    receipt = { ok: true, value };
    assert.equal((await tool.handler({ name, args })).ok, false);
  }
  receipt = { ok: false, code: "definition-changed", message: "所选定义已修改" };
  const rejected = await tool.handler({ name, args });
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /definition-changed · 所选定义已修改/);
  assert.equal(calls, 4);
});

test("project_state 精确透传 definitionId，拒绝非法标识", async () => {
  const queries: Parameters<ProjectStateFn>[0][] = [];
  const tool = buildGovernedTools(allow, { roleId: "chief", projectState: input => {
    queries.push(input);
    return { ok: true, text: "项目工作流目录" };
  } }).find(item => item.name === "project_state")!;
  const valid = { definitionId: "an-imported-workflow" };
  assert.equal((await tool.handler({ name: tool.name, args: valid })).ok, true);
  assert.equal((await tool.handler({ name: tool.name, args: { definitionId: "../invalid" } })).ok, false);
  assert.deepEqual(queries, [valid]);
});

test("workflow-start 卡只供应用呈现，通用工具及旧决定上下文均拒绝", async () => {
  const appRequest: CustomerInputRequest = {
    kind: "choice", cardKind: "workflow-start", title: "确认启用",
    options: [{ id: "approve-workflow-start", label: "启用" }],
  };
  // @ts-expect-error 模型的通用 choice 卡种不包括 workflow-start
  const choice: GovernanceChoiceCardKind = appRequest.cardKind;
  // @ts-expect-error 模型的通用 confirmation 卡种不包括 workflow-start
  const confirm: GovernanceConfirmCardKind = appRequest.cardKind;
  assert.equal(choice as string, confirm as string);
  let channelCalls = 0;
  const tools = buildGovernedTools(allow, { roleId: "chief", customerInput: async () => {
    channelCalls += 1;
    return { outcome: "declined" };
  } });
  for (const name of ["request_choice", "request_confirmation"]) {
    const tool = tools.find(item => item.name === name)!;
    const schema = tool.inputSchema.properties as Record<string, { enum: string[] }>;
    assert.equal(schema.cardKind!.enum.includes("workflow-start"), false);
    const result = await tool.handler({ name, args: {
      title: appRequest.title, question: appRequest.title, options: appRequest.options, cardKind: appRequest.cardKind,
    } });
    assert.equal(result.ok, false);
    assert.match(result.message, /cardKind 非法/);
  }
  assert.equal(channelCalls, 0);
  const decision: ChiefDecisionExecutionContext = {
    roleId: "chief", executionId: "decision-1", mode: "bounded-decision",
    productionWriteAuthority: false, tools: ["decide_pending_request"],
    limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 },
    request: {
      requestId: "card-1", baseDigest: args.expectedDigest, delegationRevision: 1, originRoleId: "convener",
      cardKind: "proposal", question: "是否采用", options: [{ id: "accept", label: "采用" }], evidenceRefs: [],
    },
  };
  assert.equal(isChiefDecisionExecutionContext(decision), true);
  assert.equal(isChiefDecisionExecutionContext({ ...decision, request: { ...decision.request, cardKind: "workflow-start" } }), false);
});
