import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FLOW_TOOL_STATUSES,
  FLOW_TOOL_STEP_KINDS,
  type FlowGetFn,
  type FlowStepSupersedeFn,
  type FlowStepUpdateFn,
  type FlowToolResult,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
  type ShellJudgeReadStats,
} from "../../src/model/runtime.ts";
import {
  FLOW_GET_TOOL_NAME,
  FLOW_STEP_SUPERSEDE_TOOL_NAME,
  FLOW_STEP_UPDATE_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-flow-tools-"));
const call = (name: string, args: Record<string, unknown>) => ({ name, args });

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

function toolMap(options: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

const okFlow: FlowToolResult = {
  ok: true,
  revision: "r2",
  flow: {
    flowId: "flow-a",
    revision: "r2",
    qualityTier: "standard",
    steps: [
      { id: "s1", title: "提案", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/proposals/flow-a.md" } },
      { id: "s2", title: "派发", owner: "steward", kind: "dispatch", status: "dispatched", supersedes: ["s1-old"] },
    ],
    canUpdate: ["s2"],
  },
};

test("未注入三能力 ⇒ flow_get/flow_step_update/flow_step_supersede 均不注册（结构性 fail-closed）", () => {
  const names = new Set(buildGovernedTools(allow).map((tool) => tool.name));
  for (const name of [FLOW_GET_TOOL_NAME, FLOW_STEP_UPDATE_TOOL_NAME, FLOW_STEP_SUPERSEDE_TOOL_NAME]) {
    assert.equal(names.has(name), false, `未注入时不得注册 ${name}`);
  }
  // 部分注入：各能力独立「注入才注册」，互不隐含。
  const onlyGet = new Set(buildGovernedTools(allow, { flowGet: async () => okFlow }).map((tool) => tool.name));
  assert.equal(onlyGet.has(FLOW_GET_TOOL_NAME), true);
  assert.equal(onlyGet.has(FLOW_STEP_UPDATE_TOOL_NAME), false);
  assert.equal(onlyGet.has(FLOW_STEP_SUPERSEDE_TOOL_NAME), false);
});

test("注入后出现三工具；schema 必填/枚举/附加属性正确（裁决在服务端）", () => {
  const getFn: FlowGetFn = async () => okFlow;
  const updateFn: FlowStepUpdateFn = async () => okFlow;
  const supersedeFn: FlowStepSupersedeFn = async () => okFlow;
  const tools = toolMap({ flowGet: getFn, flowStepUpdate: updateFn, flowStepSupersede: supersedeFn });
  for (const name of [FLOW_GET_TOOL_NAME, FLOW_STEP_UPDATE_TOOL_NAME, FLOW_STEP_SUPERSEDE_TOOL_NAME]) {
    assert.equal(tools.has(name), true, `注入后必须注册 ${name}`);
    assert.equal(tools.get(name)!.inputSchema.type, "object");
  }

  const get = describeTool("flow_get");
  assert.deepEqual(get.parameters.required, []);
  assert.equal(get.parameters.additionalProperties, false);
  assert.match(get.description, /只读/);
  assert.match(get.description, /structur|结构化视图|flowId/);

  const update = describeTool("flow_step_update");
  assert.deepEqual(update.parameters.required, ["flowId", "stepId", "status", "expectedRevision"]);
  assert.equal(update.parameters.additionalProperties, false);
  const updateProps = update.parameters.properties as Record<string, { enum?: string[]; required?: string[] }>;
  assert.deepEqual(updateProps.status.enum, [...FLOW_TOOL_STATUSES]);
  assert.deepEqual(updateProps.evidence.required, ["kind", "ref"]);
  for (const need of [/revision-conflict/, /insufficient-evidence/, /步骤推进 ≠ 客户批准/, /不写 flow 文件/]) {
    assert.match(update.description, need);
  }
  assert.match((update.promptGuidelines ?? []).join("\n"), /revision-conflict/);
  assert.match((update.promptGuidelines ?? []).join("\n"), /不得伪造证据/);

  const supersede = describeTool("flow_step_supersede");
  assert.deepEqual(supersede.parameters.required, ["flowId", "oldStepId", "newStepId", "title", "owner", "kind", "expectedRevision"]);
  assert.equal(supersede.parameters.additionalProperties, false);
  const supersedeProps = supersede.parameters.properties as Record<string, { enum?: string[]; description?: string }>;
  assert.deepEqual(supersedeProps.kind.enum, [...FLOW_TOOL_STEP_KINDS]);
  // 2026-10-20 编排 flow-service 已允许 Steward（schedule）与 Lead（liaison）——schema 不得再写「仅 Steward」。
  assert.match(supersede.description, /仅 Steward（流程管理员）或 Lead（Liaison，工作流管理者）可用/);
  for (const need of [/不是删除/, /revision-conflict/]) assert.match(supersede.description, need);
  const supersedeGuidelines = (supersede.promptGuidelines ?? []).join("\n");
  assert.match(supersedeGuidelines, /仅 Steward 或 Lead（工作流管理者）使用/);
  assert.match(supersedeProps.oldStepId.description ?? "", /Steward \(Convener\) or Lead \(Liaison\)/, "字段说明同步 Steward/Lead 权限");
  assert.equal(
    /仅 Steward（流程管理员）可用|仅 Steward 使用|非 Steward 调用/.test([supersede.description, supersedeGuidelines].join("\n")),
    false,
    "不得残留「仅 Steward」独占口径",
  );
});

test("flow_get：flowId 可选（缺省传 {}、给出原样透传）并转达 ok/revision/flow 视图", async () => {
  const received: unknown[] = [];
  const fn: FlowGetFn = async (input) => { received.push(input); return okFlow; };
  const tool = toolMap({ flowGet: fn }).get(FLOW_GET_TOOL_NAME)!;

  const current = await tool.handler(call(FLOW_GET_TOOL_NAME, {}));
  assert.equal(current.ok, true);
  assert.match(current.message, /ok=true/);
  assert.match(current.message, /revision=r2/);
  assert.match(current.message, /s1/);
  assert.match(current.message, /docs\/proposals\/flow-a\.md/);
  assert.match(current.message, /≠ 客户批准/);
  const explicit = await tool.handler(call(FLOW_GET_TOOL_NAME, { flowId: "flow-a" }));
  assert.equal(explicit.ok, true);
  assert.deepEqual(received, [{}, { flowId: "flow-a" }]);

  const bad = await tool.handler(call(FLOW_GET_TOOL_NAME, { flowId: 42 }));
  assert.equal(bad.ok, false);
  assert.equal(received.length, 2, "非法 flowId 不得触达能力");
});

test("flow_step_update：完整载荷原样交给注入能力（含 evidence/idempotencyKey/note），缺省键不造", async () => {
  const received: Parameters<FlowStepUpdateFn>[0][] = [];
  const fn: FlowStepUpdateFn = async (input) => { received.push(input); return okFlow; };
  const tool = toolMap({ flowStepUpdate: fn }).get(FLOW_STEP_UPDATE_TOOL_NAME)!;

  const full = await tool.handler(call(FLOW_STEP_UPDATE_TOOL_NAME, {
    flowId: "flow-a", stepId: "s2", status: "done", expectedRevision: "r1",
    evidence: { kind: "artifact", ref: "docs/verification/flow-a.md" }, idempotencyKey: "k-1", note: "完成",
  }));
  assert.equal(full.ok, true);
  assert.match(full.message, /操作成功/);

  const minimal = await tool.handler(call(FLOW_STEP_UPDATE_TOOL_NAME, {
    flowId: "flow-a", stepId: "s2", status: "blocked", expectedRevision: "r2",
  }));
  assert.equal(minimal.ok, true);

  assert.deepEqual(received, [
    { flowId: "flow-a", stepId: "s2", status: "done", expectedRevision: "r1", evidence: { kind: "artifact", ref: "docs/verification/flow-a.md" }, idempotencyKey: "k-1", note: "完成" },
    { flowId: "flow-a", stepId: "s2", status: "blocked", expectedRevision: "r2" },
  ]);
  for (const omitted of ["evidence", "idempotencyKey", "note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[1], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
});

test("flow_step_supersede：完整载荷原样交给注入能力；Steward/Lead 权限由服务端裁决（工具层不拦）", async () => {
  const received: Parameters<FlowStepSupersedeFn>[0][] = [];
  const fn: FlowStepSupersedeFn = async (input) => { received.push(input); return { ok: false, code: "forbidden", error: "只有 Steward/Lead（工作流管理者）可以 supersede 步骤。", issues: ["请由 Steward 或 Lead 发起"] }; };
  const tool = toolMap({ flowStepSupersede: fn }).get(FLOW_STEP_SUPERSEDE_TOOL_NAME)!;

  const result = await tool.handler(call(FLOW_STEP_SUPERSEDE_TOOL_NAME, {
    flowId: "flow-a", oldStepId: "s2", newStepId: "s2b", title: "重新派发", owner: "steward", kind: "dispatch",
    expectedRevision: "r2", reason: "负责人变更", idempotencyKey: "k-2",
  }));
  assert.equal(result.ok, false, "服务端拒绝必须如实转达为 ok:false");
  assert.match(result.message, /ok=false/);
  assert.match(result.message, /code=forbidden/);
  assert.match(result.message, /error=只有 Steward\/Lead（工作流管理者）可以 supersede 步骤。/);
  assert.match(result.message, /issues=请由 Steward 或 Lead 发起/);
  assert.deepEqual(received, [{
    flowId: "flow-a", oldStepId: "s2", newStepId: "s2b", title: "重新派发", owner: "steward", kind: "dispatch",
    expectedRevision: "r2", reason: "负责人变更", idempotencyKey: "k-2",
  }]);
});

test("回执如实转达：revision 冲突含 code/error/issues；idempotent 重放如实标注", async () => {
  const conflict: FlowToolResult = { ok: false, code: "revision-conflict", error: "revision 已过期", issues: ["先 flow_get", "再用新 revision 重试"] };
  const conflictTool = toolMap({ flowStepUpdate: async () => conflict }).get(FLOW_STEP_UPDATE_TOOL_NAME)!;
  const denied = await conflictTool.handler(call(FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "done", expectedRevision: "r-old" }));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /code=revision-conflict/);
  assert.match(denied.message, /error=revision 已过期/);
  assert.match(denied.message, /issues=先 flow_get；再用新 revision 重试/);

  const replay = toolMap({ flowStepUpdate: async () => ({ ok: true, revision: "r2", idempotent: true }) }).get(FLOW_STEP_UPDATE_TOOL_NAME)!;
  const replayed = await replay.handler(call(FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "done", expectedRevision: "r2", idempotencyKey: "k" }));
  assert.equal(replayed.ok, true);
  assert.match(replayed.message, /idempotent=true/);
  assert.match(replayed.message, /revision=r2/);
});

test("能力抛错 / 契约外回执 ⇒ fail-closed，绝不说成成功", async () => {
  const thrown = toolMap({ flowGet: async () => { throw new Error("flow-service 不可用"); } }).get(FLOW_GET_TOOL_NAME)!;
  const failed = await thrown.handler(call(FLOW_GET_TOOL_NAME, {}));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /flow-service 不可用/);
  assert.match(failed.message, /不要推断流程状态/);

  for (const receipt of [undefined, null, 42, [], { ok: "yes" }]) {
    const tool = toolMap({ flowGet: async () => receipt as never }).get(FLOW_GET_TOOL_NAME)!;
    const result = await tool.handler(call(FLOW_GET_TOOL_NAME, {}));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
  }
});

test("非法参数在触达能力前拒绝（缺必填 / 非法 status / 非法 evidence / 非法 kind）", async () => {
  let calls = 0;
  const update: FlowStepUpdateFn = async () => { calls += 1; return okFlow; };
  const supersede: FlowStepSupersedeFn = async () => { calls += 1; return okFlow; };
  const tools = toolMap({ flowStepUpdate: update, flowStepSupersede: supersede });
  const updateTool = tools.get(FLOW_STEP_UPDATE_TOOL_NAME)!;
  const supersedeTool = tools.get(FLOW_STEP_SUPERSEDE_TOOL_NAME)!;

  const cases: Array<[string, Record<string, unknown>]> = [
    [FLOW_STEP_UPDATE_TOOL_NAME, { stepId: "s", status: "done", expectedRevision: "r" }],
    [FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "finished", expectedRevision: "r" }],
    [FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "done" }],
    [FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "done", expectedRevision: "r", evidence: { kind: "artifact" } }],
    [FLOW_STEP_UPDATE_TOOL_NAME, { flowId: "f", stepId: "s", status: "done", expectedRevision: "r", evidence: { kind: "chat", ref: "x" } }],
    [FLOW_STEP_SUPERSEDE_TOOL_NAME, { flowId: "f", oldStepId: "a", newStepId: "b", title: "t", owner: "o", kind: "unknown", expectedRevision: "r" }],
    [FLOW_STEP_SUPERSEDE_TOOL_NAME, { flowId: "f", oldStepId: "a", newStepId: "b", title: "t", owner: "o", kind: "dispatch" }],
  ];
  for (const [name, args] of cases) {
    const tool = name === FLOW_STEP_UPDATE_TOOL_NAME ? updateTool : supersedeTool;
    const result = await tool.handler(call(name, args));
    assert.equal(result.ok, false, `${name} 非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");
});

test("会话中止：flow 工具不假设已读/已变更（aborted 文案如实）", async () => {
  let calls = 0;
  const tools = toolMap({ flowGet: async () => { calls += 1; return okFlow; }, flowStepUpdate: async () => { calls += 1; return okFlow; } });
  const controller = new AbortController();
  controller.abort();
  const read = await tools.get(FLOW_GET_TOOL_NAME)!.handler({ name: FLOW_GET_TOOL_NAME, args: {}, signal: controller.signal });
  assert.equal(read.ok, false);
  assert.match(read.message, /未完成/);
  const update = await tools.get(FLOW_STEP_UPDATE_TOOL_NAME)!.handler({ name: FLOW_STEP_UPDATE_TOOL_NAME, args: { flowId: "f", stepId: "s", status: "done", expectedRevision: "r" }, signal: controller.signal });
  assert.equal(update.ok, false);
  assert.match(update.message, /不要当它已生效/);
  assert.equal(calls, 0);
});

test("judge 会话工具集仍恰三只：注入 flow 能力也不得进入判断/治理判断会话", () => {
  const judgeTools = buildGovernanceJudgeTools({ projectRoot: process.cwd(), report: () => {}, stats: freshStats() });
  assert.deepEqual(judgeTools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_governance_judgement"]);
  const names = new Set(judgeTools.map((tool) => tool.name));
  for (const name of [FLOW_GET_TOOL_NAME, FLOW_STEP_UPDATE_TOOL_NAME, FLOW_STEP_SUPERSEDE_TOOL_NAME]) {
    assert.equal(names.has(name), false);
  }
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

test("Service 透传：注入 flow 能力后 provider 工具面包含三工具；未注入则不出现", async () => {
  const root = await temp();
  const captured: RuntimeProviderOptions[] = [];
  try {
    const session = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      flowGet: async () => okFlow,
      flowStepUpdate: async () => okFlow,
      flowStepSupersede: async () => okFlow,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await session.dispose();
    assert.equal(captured.length, 1);
    const names = new Set(captured[0]!.tools.map((tool) => tool.name));
    for (const name of [FLOW_GET_TOOL_NAME, FLOW_STEP_UPDATE_TOOL_NAME, FLOW_STEP_SUPERSEDE_TOOL_NAME]) {
      assert.equal(names.has(name), true, `Service 必须透传 ${name}`);
    }

    const without = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await without.dispose();
    const plain = new Set(captured[1]!.tools.map((tool) => tool.name));
    for (const name of [FLOW_GET_TOOL_NAME, FLOW_STEP_UPDATE_TOOL_NAME, FLOW_STEP_SUPERSEDE_TOOL_NAME]) {
      assert.equal(plain.has(name), false, `未注入时不得出现 ${name}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
