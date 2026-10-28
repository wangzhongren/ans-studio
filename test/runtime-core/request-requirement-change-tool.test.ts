import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type RequestRequirementChangeFn,
  type RequestRequirementChangeInput,
  type RequestRequirementChangeResult,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import {
  REQUEST_REQUIREMENT_CHANGE_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const call = (args: Record<string, unknown>) => ({ name: REQUEST_REQUIREMENT_CHANGE_TOOL_NAME, args });
const validArgs = { intentId: "intent-a", changeKind: "scope", summary: "范围需扩大", rationale: "提案发现需要新增模块" };
const dispatched: RequestRequirementChangeResult = {
  ok: true,
  code: "dispatched",
  message: "申请已登记，等待需求变更审批",
  flowId: "flow-a",
  intentId: "intent-a",
  requestId: "req-1",
};

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("未注入 requestRequirementChange ⇒ request_requirement_change 不注册（能力缺席 = fail-closed）", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME), false);
  // 不因新增契约改动既有能力注册：request_clarification 同样只在注入后出现。
});

test("注入后注册 request_requirement_change；changeKind/summary/rationale 必填，flowId/intentId 至少一个由 handler 保证", () => {
  const fn: RequestRequirementChangeFn = async () => dispatched;
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { requestRequirementChange: fn });

  // 只新增这一只工具；既有工具的 schema/描述/显示规则/执行模式逐个保持不变。
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REQUEST_REQUIREMENT_CHANGE_TOOL_NAME], "注入 requestRequirementChange 只新增 request_requirement_change");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }

  const desc = describeTool(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["changeKind", "summary", "rationale"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<
    string,
    { type?: string; enum?: unknown[]; pattern?: string; minLength?: number; maxLength?: number }
  >;
  assert.deepEqual(Object.keys(props).sort(), [
    "changeKind",
    "flowId",
    "impact",
    "intentId",
    "proposedIntentPatch",
    "rationale",
    "summary",
    "taskId",
  ]);
  assert.equal(props.flowId.type, "string");
  assert.equal(typeof props.flowId.pattern, "string");
  assert.equal(props.intentId.type, "string");
  assert.equal(typeof props.intentId.pattern, "string");
  assert.deepEqual(props.changeKind.enum, ["scope", "authorization", "constraint", "cost", "other"]);
  assert.equal(props.summary.minLength, 1);
  assert.equal(props.summary.maxLength, 500);
  assert.equal(props.rationale.minLength, 1);
  assert.equal(props.rationale.maxLength, 4000);
  assert.equal(props.impact.maxLength, 2000);
  assert.equal(props.proposedIntentPatch.maxLength, 4000);
  // 文案钉点：用途（新授权/范围）、不塞进提案卡、审批卡由提案角色或统筹发起/持有（decision 卡）、
  // 判断 agent（替我决策）或客户手选、发起方不得自批、申请≠批准、主理不审批只在批准后执行意图变更、
  // 至少一个归属、枚举、有界、建议不替客户改意图、dispatched 只表示已提交、回执如实、失败不伪装。
  for (const need of [
    /报告员/,
    /提案卡/,
    /策划角色（Rapporteur）或运营/,
    /decision 卡/,
    /替我决策/,
    /判断 agent/,
    /客户手选/,
    /发起方不得自批/,
    /申请≠批准/,
    /产品不审批/,
    /只在批准后执行意图变更/,
    /不要把新授权写进提案卡/,
    /至少给一个/,
    /scope/,
    /authorization/,
    /constraint/,
    /cost/,
    /500/,
    /4000/,
    /2000/,
    /建议/,
    /不替客户修改意图/,
    /不代表意图已变更/,
    /不写盘/,
    /`ok`/,
    /`code`/,
    /`message`/,
    /绝不伪装成功/,
  ]) {
    assert.match(desc.description, need);
  }
  // 客户纠正：审批不由主理——描述不得再写主理走 intent-confirm 或主理审批。
  assert.doesNotMatch(desc.description, /intent-confirm/, "审批路径不得再写成产品走 intent-confirm");
  assert.doesNotMatch(desc.description, /产品审批/, "不得写成产品审批");
  const guidelines = (desc.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /提案卡/);
  assert.match(guidelines, /策划角色（Rapporteur）或运营/);
  assert.match(guidelines, /decision 卡/);
  assert.match(guidelines, /发起方不得自批/);
  assert.match(guidelines, /申请≠批准/);
  assert.match(guidelines, /产品不审批/);
  assert.match(guidelines, /建议/);
  assert.doesNotMatch(guidelines, /intent-confirm/, "指引不得再写产品走 intent-confirm");
});

test("载荷原样交给注入能力：flowId/intentId 至少一个、changeKind 五值、可选字段缺省不造键", async () => {
  const received: RequestRequirementChangeInput[] = [];
  const fn: RequestRequirementChangeFn = async (input) => { received.push(input); return dispatched; };
  const tool = toolMap({ requestRequirementChange: fn }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;

  assert.equal((await tool.handler(call({ flowId: "flow-a", changeKind: "scope", summary: "s", rationale: "r" }))).ok, true);
  assert.equal((await tool.handler(call({ intentId: "intent-b", changeKind: "authorization", summary: "s", rationale: "r" }))).ok, true);
  assert.equal((await tool.handler(call({ taskId: "t-1", changeKind: "scope", summary: "s", rationale: "r" }))).ok, true, "taskId-only attribution");
  for (const changeKind of ["scope", "authorization", "constraint", "cost", "other"]) {
    assert.equal(
      (await tool.handler(call({ flowId: "flow-a", intentId: "intent-a", changeKind, summary: "s", rationale: "r" }))).ok,
      true,
      `changeKind=${changeKind} 应接受`,
    );
  }
  assert.equal((await tool.handler(call({
    intentId: "intent-a",
    changeKind: "cost",
    summary: "成本上升",
    rationale: "需要额外引擎适配",
    impact: "工期 +3 天",
    proposedIntentPatch: "建议把成本约束写入意图文件",
  }))).ok, true);
  // impact:null 视作未提供（沿 request_gate_review 的 note 先例）。
  assert.equal((await tool.handler(call({ ...validArgs, impact: null }))).ok, true);

  assert.deepEqual(received, [
    { flowId: "flow-a", changeKind: "scope", summary: "s", rationale: "r" },
    { intentId: "intent-b", changeKind: "authorization", summary: "s", rationale: "r" },
    { taskId: "t-1", changeKind: "scope", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "authorization", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "constraint", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "cost", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "other", summary: "s", rationale: "r" },
    {
      intentId: "intent-a",
      changeKind: "cost",
      summary: "成本上升",
      rationale: "需要额外引擎适配",
      impact: "工期 +3 天",
      proposedIntentPatch: "建议把成本约束写入意图文件",
    },
    { intentId: "intent-a", changeKind: "scope", summary: "范围需扩大", rationale: "提案发现需要新增模块" },
  ]);
  for (const omitted of ["flowId", "impact", "proposedIntentPatch"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[1], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(received[1], "summary"), true);
});

test("非法参数在触达能力前拒绝（归属缺失、changeKind 非法、summary/rationale 空或超界、未知参数、slug 非法）", async () => {
  let calls = 0;
  const fn: RequestRequirementChangeFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestRequirementChange: fn }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;

  const invalid: Record<string, unknown>[] = [
    {},
    // flowId/intentId 至少一个
    { changeKind: "scope", summary: "s", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "scope", rationale: "r" },
    { flowId: "flow-a", intentId: "intent-a", changeKind: "scope", summary: "s" },
    // changeKind 必填且恰五值
    { intentId: "intent-a", summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: 42, summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: "budget", summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: "", summary: "s", rationale: "r" },
    // summary/rationale 非空
    { intentId: "intent-a", changeKind: "scope", summary: "", rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "   ", rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: 42, rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "" },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "   " },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: 42 },
    // 有界文本超长拒绝（不截断）
    { intentId: "intent-a", changeKind: "scope", summary: "说".repeat(501), rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "说".repeat(4001) },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", impact: "说".repeat(2001) },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", proposedIntentPatch: "说".repeat(4001) },
    // 可选字段类型
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", impact: "" },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", impact: 42 },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", proposedIntentPatch: ["patch"] },
    // slug 形状
    { flowId: "flow-", changeKind: "scope", summary: "s", rationale: "r" },
    { intentId: "intent-", changeKind: "scope", summary: "s", rationale: "r" },
    { flowId: 42, changeKind: "scope", summary: "s", rationale: "r" },
    { intentId: {}, changeKind: "scope", summary: "s", rationale: "r" },
    { flowId: null, intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r" },
    // 未知参数一律拒绝
    { ...validArgs, approved: true },
    { ...validArgs, intentConfirm: true },
  ];
  for (const args of invalid) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");

  // 边界：恰达上限仍合法（按 Unicode 码点计，超长才拒绝）。
  assert.equal((await tool.handler(call({
    intentId: "intent-a",
    changeKind: "scope",
    summary: "说".repeat(500),
    rationale: "说".repeat(4000),
    impact: "说".repeat(2000),
    proposedIntentPatch: "说".repeat(4000),
  }))).ok, true);
  assert.equal(calls, 1);
});

test("回执原样转达 ok/code/message（成功不夸大、失败不伪装、不把申请说成批准、不把审批归给产品或发起方）", async () => {
  const success = toolMap({ requestRequirementChange: async () => dispatched }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
  const ok = await success.handler(call(validArgs));
  assert.equal(ok.ok, true);
  assert.match(ok.message, /ok=true/);
  assert.match(ok.message, /code=dispatched/);
  assert.match(ok.message, /申请已登记，等待需求变更审批/);
  assert.match(ok.message, /flowId=flow-a/);
  assert.match(ok.message, /intentId=intent-a/);
  assert.match(ok.message, /requestId=req-1/);
  // 客户纠正（2026-10-26）：成功回执固定为「已提交需求变更审批（提案/统筹 decision 卡；替我决策→
  // 判断 agent，未开启→客户手选）；申请≠批准；主理只在批准后执行意图变更，不审批；发起方不得自批」。
  assert.match(ok.message, /已提交需求变更审批/, "成功文案必须写清「已提交需求变更审批」");
  assert.match(ok.message, /应用自动呈现 decision 卡/);
  assert.match(ok.message, /不得.*重复发卡/);
  assert.match(ok.message, /替我决策→判断 agent/);
  assert.match(ok.message, /未开启→客户手选/);
  assert.match(ok.message, /申请≠批准/, "成功文案必须重申申请≠批准");
  assert.match(ok.message, /产品只在批准后执行意图变更，不审批/);
  assert.match(ok.message, /发起方不得自批/);
  assert.match(ok.message, /proposedIntentPatch/);
  assert.match(ok.message, /不要宣称意图已改/);
  // 审批不由主理：不得再出现 intent-confirm 审批路径或主理审批。
  assert.doesNotMatch(ok.message, /intent-confirm/, "成功文案不得再写产品走 intent-confirm");
  assert.doesNotMatch(ok.message, /产品审批/, "成功文案不得写成产品审批");

  const failures: RequestRequirementChangeResult[] = [
    { ok: false, code: "already-dispatched", message: "此 intentId 已提交过同一变更" },
    { ok: false, code: "invalid", message: "changeKind 与变更摘要不匹配" },
    { ok: false, code: "intent-not-found", message: "未找到意图记录 intent-a" },
    { ok: false, code: "flow-not-found", message: "未找到流程 flow-a" },
    { ok: false, code: "unavailable", message: "应用审批通道不可用" },
    { ok: false, code: "rejected", message: "应用去重/归属校验退回" },
  ];
  for (const receipt of failures) {
    const tool = toolMap({ requestRequirementChange: async () => receipt }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
    const result = await tool.handler(call(validArgs));
    assert.equal(result.ok, false, `ok:false 必须原样转达：${receipt.code}`);
    assert.match(result.message, /ok=false/);
    assert.match(result.message, new RegExp(`code=${receipt.code}`));
    assert.ok(result.message.includes(receipt.message), `回执 message 必须原样出现：${receipt.code}`);
    assert.match(result.message, /不要当已提交/);
  }

  // already-dispatched 若应用回 ok:true，同样如实转达（是否成功只看 ok，不替应用改判）。
  const already = toolMap({
    requestRequirementChange: async () => ({ ok: true, code: "already-dispatched", message: "此前已提交（req-1）", requestId: "req-1" }),
  }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
  const alreadyResult = await already.handler(call(validArgs));
  assert.equal(alreadyResult.ok, true);
  assert.match(alreadyResult.message, /code=already-dispatched/);
  assert.match(alreadyResult.message, /此前已提交需求变更审批/);
  assert.match(alreadyResult.message, /未重复提交/);
  assert.match(alreadyResult.message, /应用自动呈现 decision 卡/);
  assert.match(alreadyResult.message, /不得.*重复发卡/);
  assert.match(alreadyResult.message, /申请≠批准/);
  assert.match(alreadyResult.message, /发起方不得自批/);
});

test("rejected 回执原样转达：应用退回、不代表客户拒绝、不报成已提交", async () => {
  const receipt: RequestRequirementChangeResult = {
    ok: false,
    code: "rejected",
    message: "同一 intentId 的相同变更已提交，未重复派发。",
    intentId: "intent-a",
  };
  const tool = toolMap({ requestRequirementChange: async () => receipt }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
  const result = await tool.handler(call(validArgs));
  assert.equal(result.ok, false, "rejected 不得回执成功");
  assert.match(result.message, /ok=false/);
  assert.match(result.message, /code=rejected/);
  assert.match(result.message, /intentId=intent-a/);
  assert.ok(result.message.includes(receipt.message), "回执 message 必须原样出现");
  assert.match(result.message, /退回/);
  assert.match(result.message, /不代表客户拒绝/);
  assert.match(result.message, /不要当已提交/);
});

test("能力抛错 / 契约外回执（含看似成功的未知 code）⇒ fail-closed，绝不说成已提交", async () => {
  const thrown = toolMap({
    requestRequirementChange: async () => { throw new Error("产品通道 handler 不可用"); },
  }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
  const failed = await thrown.handler(call(validArgs));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /产品通道 handler 不可用/);
  assert.match(failed.message, /不要当已提交/);

  const invalidReceipts: unknown[] = [
    undefined,
    null,
    42,
    [],
    {},
    { ok: "yes", code: "dispatched", message: "x" },
    // 契约外 code 一律 fail-closed：即使叫 submitted/accepted/done 也不得当成功。
    { ok: true, code: "submitted", message: "x" },
    { ok: true, code: "accepted", message: "x" },
    { ok: true, code: "done", message: "x" },
    { ok: true, code: "unknown-code", message: "x" },
    { ok: true, code: "dispatched", message: "" },
    { ok: true, code: "dispatched" },
  ];
  for (const receipt of invalidReceipts) {
    const tool = toolMap({ requestRequirementChange: async () => receipt as never }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
    const result = await tool.handler(call(validArgs));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
    assert.match(result.message, /不要当已提交/);
  }
});

test("会话中止：不假设已提交（能力不触达，文案如实）", async () => {
  let calls = 0;
  const fn: RequestRequirementChangeFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestRequirementChange: fn }).get(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler({ name: REQUEST_REQUIREMENT_CHANGE_TOOL_NAME, args: validArgs, signal: controller.signal });
  assert.equal(result.ok, false);
  assert.match(result.message, /未完成|未获结果/);
  assert.match(result.message, /不要当已提交/);
  assert.equal(calls, 0, "中止后不得触达能力");
});

function adapterFactory(capture: (options: RuntimeProviderOptions) => void): RuntimeProviderFactory {
  return (options) => {
    registerControlledDisplayProfile(options);
    capture(options);
    return {
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        const session: RoleSession = { async prompt() {}, events: () => queue.stream, async dispose() { queue.close(); } };
        return session;
      },
    };
  };
}

test("Service 透传：注入 requestRequirementChange 后 provider 工具面包含 request_requirement_change；未注入则不出现", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-request-requirement-change-"));
  const captured: RuntimeProviderOptions[] = [];
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestRequirementChange: async () => dispatched,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(captured.length, 1);
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME),
      true,
      "Service 必须透传 request_requirement_change",
    );

    const plain = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await plain.dispose();
    assert.equal(
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REQUEST_REQUIREMENT_CHANGE_TOOL_NAME),
      false,
      "未注入时不得出现 request_requirement_change",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
