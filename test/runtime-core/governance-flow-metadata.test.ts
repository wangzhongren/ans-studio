import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { GOVERNANCE_SLUG_PATTERN, governanceCardGroup } from "../../src/model/runtime.ts";
import type {
  CustomerInputMetadata,
  CustomerInputRequest,
  DispatchTaskPayload,
  GovernanceAppointmentStepPayload,
  GovernanceFlowStep,
  GovernanceProposalStepPayload,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

const tools = (options?: Parameters<typeof buildGovernedTools>[1]) => new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
const toolArgs = (toolName: string, args: Record<string, unknown>) => ({ name: toolName, args });

test("中立形状：流程步骤状态与提案/任命载荷可构造且字段冻结（仅类型，不实现判定）", () => {
  const step = { stepId: "write-proposal", kind: "proposal", ownerRoleId: "rapporteur", status: "in-progress" } satisfies GovernanceFlowStep;
  const proposal = {
    flowId: "flow-alpha",
    stepId: "proposal-v1",
    cardKind: "proposal",
    proposalPath: "docs/proposals/flow-alpha-v1.md",
    version: 1,
  } satisfies GovernanceProposalStepPayload;
  const appointment = {
    flowId: "flow-alpha",
    stepId: "nomination-v1",
    cardKind: "appointment",
    targetRoleIds: ["role-a"],
    version: 1,
  } satisfies GovernanceAppointmentStepPayload;
  assert.deepEqual([step.status, proposal.version, appointment.targetRoleIds], ["in-progress", 1, ["role-a"]]);
});

test("request_choice：flowId/stepId/cardKind 原样进入卡片请求与回调 metadata；缺席时保持旧形状", async () => {
  let request!: CustomerInputRequest;
  let metadata!: CustomerInputMetadata;
  const byName = tools({
    roleId: "rapporteur",
    runtime: "claude",
    currentTurnId: () => "turn-1",
    customerInput: (req, meta) => {
      request = req;
      metadata = meta!;
      return { outcome: "answered", value: { selected: ["accept"] } };
    },
  });
  const result = await byName.get("request_choice")!.handler(toolArgs("request_choice", {
    title: "接受提案？",
    options: [{ id: "accept", label: "接受" }],
    flowId: "flow-alpha",
    stepId: "proposal-v1",
    cardKind: "proposal",
  }));
  assert.equal(result.ok, true);
  assert.deepEqual({ flowId: request.flowId, stepId: request.stepId, cardKind: request.cardKind }, { flowId: "flow-alpha", stepId: "proposal-v1", cardKind: "proposal" });
  assert.deepEqual(
    { flowId: metadata.flowId, stepId: metadata.stepId, cardKind: metadata.cardKind, turnId: metadata.turnId, roleId: metadata.roleId, runtime: metadata.runtime },
    { flowId: "flow-alpha", stepId: "proposal-v1", cardKind: "proposal", turnId: "turn-1", roleId: "rapporteur", runtime: "claude" },
  );

  await byName.get("request_choice")!.handler(toolArgs("request_choice", { title: "旧调用", options: [{ id: "a", label: "A" }] }));
  for (const key of ["flowId", "stepId", "cardKind"]) {
    assert.equal(Object.hasOwn(request, key), false, `旧调用请求不得凭空出现 ${key}`);
    assert.equal(Object.hasOwn(metadata, key), false, `旧调用 metadata 不得凭空出现 ${key}`);
  }
});

test("request_choice：intent-confirm（客户需求确认）合法透传（confirm/revise）；判断分组为 decision", async () => {
  let request!: CustomerInputRequest;
  let metadata!: CustomerInputMetadata;
  const byName = tools({
    roleId: "liaison",
    runtime: "claude",
    currentTurnId: () => "turn-intent",
    customerInput: (req, meta) => {
      request = req;
      metadata = meta!;
      return { outcome: "answered", value: { selected: ["confirm"] } };
    },
  });
  const result = await byName.get("request_choice")!.handler(toolArgs("request_choice", {
    title: "确认需求？",
    options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }],
    flowId: "flow-alpha",
    cardKind: "intent-confirm",
  }));
  assert.equal(result.ok, true);
  assert.equal(request.cardKind, "intent-confirm");
  assert.equal(metadata.cardKind, "intent-confirm");
  assert.equal(metadata.roleId, "liaison");
  // 2026-10-20 客户拍板「勾了替我决策就不用我管」：intent-confirm 由 decision 开关代批 confirm；
  // revise 仍交回客户/发起角色（归一化在编排，运行时核心只提供映射）。
  assert.equal(governanceCardGroup("intent-confirm"), "decision");
});

test("request_confirmation：合法 appointment-write 透传；非法 slug/种类在触达客户通道前拒绝", async () => {
  let request!: CustomerInputRequest;
  let metadata!: CustomerInputMetadata;
  let calls = 0;
  const byName = tools({
    customerInput: (req, meta) => {
      calls++;
      request = req;
      metadata = meta!;
      return { outcome: "answered", value: { confirmed: true } };
    },
  });
  const confirm = byName.get("request_confirmation")!;
  const ok = await confirm.handler(toolArgs("request_confirmation", {
    title: "写入角色卡？",
    flowId: "flow-alpha",
    stepId: "appointment-write-1",
    cardKind: "appointment-write",
  }));
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  assert.deepEqual({ flowId: request.flowId, stepId: request.stepId, cardKind: request.cardKind }, { flowId: "flow-alpha", stepId: "appointment-write-1", cardKind: "appointment-write" });
  assert.deepEqual({ flowId: metadata.flowId, stepId: metadata.stepId, cardKind: metadata.cardKind }, { flowId: "flow-alpha", stepId: "appointment-write-1", cardKind: "appointment-write" });

  const invalid: [string, Record<string, unknown>, RegExp][] = [
    ["flowId", { title: "x", flowId: "Bad Slug" }, /flowId/],
    ["stepId", { title: "x", stepId: "a_b" }, /stepId/],
    ["flowId-nonstring", { title: "x", flowId: 7 }, /flowId/],
    ["cardKind-choice", { title: "x", cardKind: "proposal" }, /cardKind/],
    ["cardKind-unknown", { title: "x", cardKind: "approve" }, /cardKind/],
  ];
  for (const [label, args, pattern] of invalid) {
    const result = await confirm.handler(toolArgs("request_confirmation", args));
    assert.equal(result.ok, false, `${label} 必须拒绝`);
    assert.match(result.message, pattern, `${label} 拒绝文案须点名非法字段`);
  }
  assert.equal(calls, 1, "非法治理元数据必须在调用客户通道之前拒绝");

  const choice = byName.get("request_choice")!;
  const wrongKind = await choice.handler(toolArgs("request_choice", { title: "x", options: [{ id: "a", label: "A" }], cardKind: "write" }));
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.message, /cardKind/);
  assert.equal(calls, 1);
});

test("dispatch_task：flowId/stepId 进入派发载荷；非法值拒发；缺席保持旧载荷形状", async () => {
  const payloads: DispatchTaskPayload[] = [];
  const dispatch = tools({ dispatchTask: (payload) => { payloads.push(payload); return { ok: true }; } }).get("dispatch_task")!;
  const ok = await dispatch.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "执行", flowId: "flow-alpha", stepId: "dispatch-1" }));
  assert.equal(ok.ok, true);
  assert.deepEqual(payloads.at(-1), { roleId: "role-a", task: "执行", flowId: "flow-alpha", stepId: "dispatch-1" });

  const invalid = await dispatch.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "执行", flowId: "FLOW" }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /flowId/);
  assert.equal(payloads.length, 1, "非法 flowId 不得触达派发能力");

  await dispatch.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "旧调用" }));
  const legacy = payloads.at(-1)!;
  assert.deepEqual(legacy, { roleId: "role-a", task: "旧调用" });
  assert.equal(Object.hasOwn(legacy, "flowId"), false);
  assert.equal(Object.hasOwn(legacy, "stepId"), false);
});

test("schema：三个治理元数据字段可选、slug pattern 单点、cardKind 按工具白名单", () => {
  const propertiesOf = (name: string) => (describeTool(name).parameters as { properties: Record<string, { pattern?: string; enum?: string[] }> }).properties;
  const confirm = propertiesOf("request_confirmation");
  const choice = propertiesOf("request_choice");
  const dispatch = propertiesOf("dispatch_task");
  for (const properties of [confirm, choice, dispatch]) {
    assert.equal(properties.flowId.pattern, GOVERNANCE_SLUG_PATTERN);
    assert.equal(properties.stepId.pattern, GOVERNANCE_SLUG_PATTERN);
  }
  assert.deepEqual(confirm.cardKind.enum, ["write", "appointment-write", "schedule-write"]);
  assert.deepEqual(choice.cardKind.enum, ["proposal", "appointment", "acceptance", "intent-confirm"]);
  for (const name of ["request_confirmation", "request_choice", "dispatch_task"]) {
    const required = (describeTool(name).parameters as { required?: string[] }).required ?? [];
    for (const field of ["flowId", "stepId", "cardKind"]) assert.equal(required.includes(field), false, `${name}.${field} 必须可选`);
  }
});

test("Service 会话装配不丢治理 flow 元数据（demo 脚本经 request_choice）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-governance-flow-"));
  try {
    let request!: CustomerInputRequest;
    let metadata!: CustomerInputMetadata;
    const session = await createRuntimeAdapter({
      runtime: "demo",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      customerInput: (req, meta) => {
        request = req;
        metadata = meta!;
        return { outcome: "answered", value: { selected: ["accept"] } };
      },
      script: [{
        name: "request_choice",
        args: {
          title: "接受提案？",
          options: [{ id: "accept", label: "接受" }],
          flowId: "flow-alpha",
          stepId: "proposal-v1",
          cardKind: "proposal",
        },
      }],
    }).bindRole(role("rapporteur"));
    const events: SessionEvent[] = [];
    const done = (async () => { for await (const event of session.events()) events.push(event); })();
    await session.prompt("开始工作");
    await session.dispose();
    await done;
    assert.deepEqual({ flowId: request.flowId, stepId: request.stepId, cardKind: request.cardKind }, { flowId: "flow-alpha", stepId: "proposal-v1", cardKind: "proposal" });
    assert.deepEqual({ flowId: metadata.flowId, stepId: metadata.stepId, cardKind: metadata.cardKind }, { flowId: "flow-alpha", stepId: "proposal-v1", cardKind: "proposal" });
    assert.ok(metadata.turnId, "Service 轮次 ID 仍在 metadata 中");
  } finally { await rm(root, { recursive: true, force: true }); }
});
