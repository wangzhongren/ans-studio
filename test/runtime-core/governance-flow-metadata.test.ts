import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { FLOW_TOOL_STEP_KINDS, GOVERNANCE_SLUG_PATTERN, governanceCardGroup } from "../../src/model/runtime.ts";
import type {
  CustomerInputMetadata,
  CustomerInputRequest,
  DispatchTaskPayload,
  FlowStepSupersedeFn,
  FlowToolStepKind,
  FlowToolStepView,
  FlowToolView,
  GovernanceAppointmentStepPayload,
  GovernanceFlowStep,
  GovernanceJudgeContext,
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  GovernanceProposalStepPayload,
  GovernanceStepKind,
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

test("2026-10-22 契约冻结：团队计划/验收物证与风险档位为可选新增字段；StepKind 保留原值", () => {
  // 第 1 项：任命载荷提供团队计划路径；nominationPath 保留为 legacy（可并存、可缺席）。
  const appointmentWithTeamPlan = {
    flowId: "flow-alpha",
    stepId: "appointment",
    cardKind: "appointment",
    teamPlanPath: "docs/scheduling/flow-alpha-team-v1.md",
    nominationPath: "docs/nominations/flow-alpha-v1.md",
    targetRoleIds: ["role-a"],
    version: 1,
  } satisfies GovernanceAppointmentStepPayload;
  // 第 1/3 项：判断请求与上下文 artifacts 新增物证路径；同名同形、全部可选。
  const artifacts = {
    proposalPath: "docs/proposals/flow-alpha-v1.md",
    nominationPath: "docs/nominations/flow-alpha-v1.md",
    teamPlanPath: "docs/scheduling/flow-alpha-team-v1.md",
    flowPath: "docs/flows/flow-alpha.md",
    acceptanceCriteriaPath: "docs/acceptance/flow-alpha-criteria-v1.md",
    acceptanceReportPath: "docs/acceptance/flow-alpha-report-v1.md",
    changePackagePath: "docs/scheduling/flow-alpha-change-v1.md",
  } satisfies NonNullable<GovernanceJudgeRequest["artifacts"]>;
  const contextArtifacts = { ...artifacts } satisfies NonNullable<GovernanceJudgeContext["artifacts"]>;
  // 第 3 项：风险档位与团队计划确认事实为可选新增；旧 facts 形状仍合法。
  const facts = {
    governanceModel: "trio",
    flowId: "flow-alpha",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    riskTier: "T3",
    teamPlanConfirmed: true,
  } satisfies GovernanceJudgeFacts;
  const legacyFacts = {
    governanceModel: "trio",
    flowId: "flow-alpha",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  } satisfies GovernanceJudgeFacts;
  // Q4 A：保留现有值、不新增 team-plan；编排的 FlowStepKind 不属本层契约、本用例不涉及、也不得改。
  const stepKinds = ["proposal", "nomination", "dispatch", "acceptance"] as const satisfies readonly GovernanceStepKind[];
  assert.deepEqual([...stepKinds], ["proposal", "nomination", "dispatch", "acceptance"], "StepKind 保留现有值，不新增 team-plan");
  assert.equal(appointmentWithTeamPlan.teamPlanPath, "docs/scheduling/flow-alpha-team-v1.md");
  assert.equal(appointmentWithTeamPlan.nominationPath, "docs/nominations/flow-alpha-v1.md");
  assert.deepEqual(artifacts, contextArtifacts, "Request/Context artifacts 同形");
  assert.equal(facts.riskTier, "T3");
  assert.equal(facts.teamPlanConfirmed, true);
  assert.equal(Object.hasOwn(legacyFacts, "riskTier"), false, "缺失＝未提供，不凭空造值");
  assert.equal(Object.hasOwn(legacyFacts, "teamPlanConfirmed"), false, "缺失＝未提供，不凭空造值");
});

test("2026-10-22 角色粒度/MapReduce 方案 A：flow step 视图与替代输入可携带可选 parallelGroup/dependsOn；旧形状与枚举不变", () => {
  // 视图：Map/Reduce 步骤可携带并行组与前置；旧步骤不填时字段缺席（不凭空造值）。
  const steps = [
    {
      id: "delivery-checkout-api",
      title: "Map A｜checkout-api 交付",
      owner: "checkout-api",
      kind: "dispatch",
      status: "pending",
      parallelGroup: "map-a",
      dependsOn: ["contract-freeze"],
    },
    {
      id: "test-map-shards",
      title: "Reduce｜测试分片",
      owner: "integration-test",
      kind: "dispatch",
      status: "pending",
      parallelGroup: "reduce",
      dependsOn: ["delivery-checkout-api"],
    },
    { id: "team-plan", title: "团队计划", owner: "convener", kind: "artifact", status: "done" },
  ] satisfies FlowToolStepView[];
  const view = {
    flowId: "flow-alpha",
    revision: "rev-1",
    qualityTier: "production",
    steps,
    canUpdate: [],
  } satisfies FlowToolView;
  assert.deepEqual(view.steps.map((step) => step.parallelGroup), ["map-a", "reduce", undefined]);
  assert.deepEqual(view.steps[0].dependsOn, ["contract-freeze"]);
  assert.equal(Object.hasOwn(view.steps[2], "parallelGroup"), false, "旧步骤不得凭空出现 parallelGroup");
  assert.equal(Object.hasOwn(view.steps[2], "dependsOn"), false, "旧步骤不得凭空出现 dependsOn");

  // 替代输入：新步骤可带字段；旧调用（不填）形状逐字不变。
  const supersedeInput = {
    flowId: "flow-alpha",
    oldStepId: "delivery-old",
    newStepId: "delivery-checkout-api",
    title: "Map A｜checkout-api 交付",
    owner: "checkout-api",
    kind: "dispatch",
    expectedRevision: "rev-1",
    parallelGroup: "map-a",
    dependsOn: ["contract-freeze"],
  } satisfies Parameters<FlowStepSupersedeFn>[0];
  const legacySupersedeInput = {
    flowId: "flow-alpha",
    oldStepId: "impl-old",
    newStepId: "impl-new",
    title: "旧替代",
    owner: "role-a",
    kind: "dispatch",
    expectedRevision: "rev-1",
  } satisfies Parameters<FlowStepSupersedeFn>[0];
  assert.equal(supersedeInput.parallelGroup, "map-a");
  assert.deepEqual(supersedeInput.dependsOn, ["contract-freeze"]);
  assert.equal(Object.hasOwn(legacySupersedeInput, "parallelGroup"), false);
  assert.equal(Object.hasOwn(legacySupersedeInput, "dependsOn"), false);

  // Q3 A：不新增 FlowStepKind——证据种类仍恰为四个现有值。
  const kinds = ["dispatch", "customer-decision", "artifact", "acceptance"] as const satisfies readonly FlowToolStepKind[];
  assert.deepEqual([...FLOW_TOOL_STEP_KINDS], [...kinds], "FlowStepKind 保留现有值，不新增 map/reduce");
});

test("2026-10-22：judge facts 可选团队计划 schema/模块摘要；物证沿用 teamPlanPath，不新增 artifact kind", () => {
  const factsV2 = {
    governanceModel: "trio",
    flowId: "flow-alpha",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    teamPlanConfirmed: true,
    teamPlanSchema: 2,
    teamPlanModules: ["checkout-api", "checkout-web"],
  } satisfies GovernanceJudgeFacts;
  const legacyFacts = {
    governanceModel: "trio",
    flowId: "flow-alpha",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  } satisfies GovernanceJudgeFacts;
  // 物证单一字段集：团队计划仍走 teamPlanPath；不新增模块/并行 evidence artifact kind。
  const artifacts = {
    teamPlanPath: "docs/scheduling/flow-alpha-team-v2.md",
  } satisfies NonNullable<GovernanceJudgeRequest["artifacts"]>;
  const contextArtifacts = { ...artifacts } satisfies NonNullable<GovernanceJudgeContext["artifacts"]>;
  assert.equal(factsV2.teamPlanSchema, 2);
  assert.deepEqual(factsV2.teamPlanModules, ["checkout-api", "checkout-web"]);
  assert.equal(Object.hasOwn(legacyFacts, "teamPlanSchema"), false, "缺失＝未提供，不凭空造值");
  assert.equal(Object.hasOwn(legacyFacts, "teamPlanModules"), false, "缺失＝未提供，不凭空造值");
  assert.deepEqual(artifacts, contextArtifacts, "Request/Context artifacts 同形");
  assert.deepEqual(Object.keys(artifacts), ["teamPlanPath"], "团队计划沿用 teamPlanPath，不新增 artifact kind");
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
    ["flowId-trailing-hyphen", { title: "x", flowId: "flow-" }, /flowId/],
    ["flowId-short-trailing-hyphen", { title: "x", flowId: "a-" }, /flowId/],
    ["stepId", { title: "x", stepId: "a_b" }, /stepId/],
    ["stepId-trailing-hyphen", { title: "x", stepId: "impl-" }, /stepId/],
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

test("T12 request_confirmation：declined + notPresented:true 返回「卡片未发出」回执；常规 declined 文案逐字不变", async () => {
  let mode: "not-presented" | "customer-declined" = "not-presented";
  const byName = tools({
    customerInput: () => mode === "not-presented"
      ? {
          outcome: "declined" as const,
          notPresented: true as const,
          reason: "缺少 cardKind。治理角色的 request_confirmation 必须同时携带 flowId 与 cardKind（本角色允许：write）；本次未发行任何写入路径、未写入账本。",
        }
      : { outcome: "declined" as const, operatorId: "customer-1", reason: "客户不同意" },
  });
  const confirm = byName.get("request_confirmation")!;

  const notPresented = await confirm.handler(toolArgs("request_confirmation", { title: "写工作记录" }));
  assert.equal(notPresented.ok, false, "未发卡仍是 ok:false（fail-closed）");
  assert.match(notPresented.message, /治理确认卡未发出/);
  assert.match(notPresented.message, /未向客户呈现/);
  assert.match(notPresented.message, /缺少 cardKind/, "回执须带编排给出的具体缺项");
  assert.match(notPresented.message, /请补齐后重新调用/);
  assert.match(notPresented.message, /不要写盘/);
  assert.match(notPresented.message, /不要向客户声称其拒绝或同意/);
  assert.doesNotMatch(notPresented.message, /^request_confirmation：未获客户同意/);
  assert.doesNotMatch(notPresented.message, /未获客户同意/, "不得把「卡片未发出」说成客户拒绝");

  // 其他工具不受影响：request_choice 的 declined 分支（即使带 notPresented）文案逐字不变（O1 未授权）。
  const choiceWithFlag = await byName.get("request_choice")!.handler(toolArgs("request_choice", { title: "选择", options: [{ id: "a", label: "A" }] }));
  assert.equal(choiceWithFlag.ok, false);
  assert.equal(
    choiceWithFlag.message,
    "request_choice：未获客户同意（原因：客户拒绝（缺少 cardKind。治理角色的 request_confirmation 必须同时携带 flowId 与 cardKind（本角色允许：write）；本次未发行任何写入路径、未写入账本。））→ 不要写盘；如实告知客户，不得假设同意。",
  );

  mode = "customer-declined";
  const declined = await confirm.handler(toolArgs("request_confirmation", { title: "写工作记录" }));
  assert.equal(declined.ok, false);
  assert.equal(
    declined.message,
    "request_confirmation：未获客户同意（原因：客户拒绝（客户不同意））→ 不要写盘；如实告知客户，不得假设同意。",
    "常规 declined（客户拒绝）文案必须逐字不变",
  );
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
  const trailing = await dispatch.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "执行", flowId: "flow-" }));
  assert.equal(trailing.ok, false);
  assert.match(trailing.message, /flowId/);
  assert.ok(trailing.message.includes(GOVERNANCE_SLUG_PATTERN), "尾连字符拒绝文案须展示收紧后的正则");
  const trailingStep = await dispatch.handler(toolArgs("dispatch_task", { roleId: "role-a", task: "执行", stepId: "impl-" }));
  assert.equal(trailingStep.ok, false);
  assert.match(trailingStep.message, /stepId/);
  assert.equal(payloads.length, 1, "非法 flowId/stepId 不得触达派发能力");

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

test("schema 文案（2026-10-22）：任命/提名语义与角色允许卡种写明；不新增 cardKind、形状不变", () => {
  const propertiesOf = (name: string) => (describeTool(name).parameters as { properties: Record<string, { enum?: string[]; description?: string }> }).properties;

  const choice = describeTool("request_choice");
  const choiceText = [choice.description, ...(choice.promptGuidelines ?? [])].join("\n");
  assert.match(choiceText, /`appointment` 为\*\*任命\*\*卡/, "request_choice 必须写任命语义");
  assert.match(choiceText, /由 Convener 依客户确认的团队计划发起/, "任命卡由 Convener 依团队计划发起");
  assert.match(choiceText, /旧流程的「提名」卡为 legacy/, "旧提名语义标注 legacy");
  assert.match(choiceText, /Crew 收到客户任命后才按名单写卡/, "Crew 任命后才写卡（不自行任命）");
  assert.deepEqual(propertiesOf("request_choice").cardKind.enum, ["proposal", "appointment", "acceptance", "intent-confirm"], "不新增 cardKind");
  assert.match(propertiesOf("request_choice").cardKind.description ?? "", /appointment.*appoint the recommended team/, "字段说明写明任命语义");

  const confirm = describeTool("request_confirmation");
  const confirmText = [confirm.description, ...(confirm.promptGuidelines ?? [])].join("\n");
  assert.match(confirmText, /`appointment-write` 指客户\*\*任命\*\*（appointment）后的角色卡\/边界写入确认/, "appointment-write 写任命后写卡语义");
  assert.deepEqual(propertiesOf("request_confirmation").cardKind.enum, ["write", "appointment-write", "schedule-write"], "不新增 cardKind");
  const confirmKindDescription = propertiesOf("request_confirmation").cardKind.description ?? "";
  assert.match(confirmKindDescription, /appointment-write.*after the customer's appointment/, "字段说明写明任命后写卡语义");
  assert.match(confirmKindDescription, /Which kinds a role may send is decided by the application/, "角色允许卡种由应用判定");
});

test("T13 schema：request_confirmation 描述明确内置治理角色必须同时携带 flowId + cardKind；缺失不发卡，旧调用仍被接受", async () => {
  const described = describeTool("request_confirmation");
  const properties = (described.parameters as { properties: Record<string, { description?: string }> }).properties;
  for (const field of ["flowId", "cardKind"] as const) {
    const description = properties[field].description ?? "";
    assert.match(description, /five built-in governance roles/, `${field} 描述须点名五个内置治理角色`);
    assert.match(description, /flowId \+ cardKind/, `${field} 描述须写明两者必须同时携带`);
    assert.match(description, /rejected by the application/, `${field} 描述须写明会被应用拒绝`);
    assert.match(description, /NO card is shown to the customer/, `${field} 描述须写明不会向客户发卡`);
    assert.match(description, /Optional for ordinary project roles and single\/su/, `${field} 对普通角色/single/su 仍为可选`);
  }
  assert.match(described.description, /五个内置治理角色（liaison \/ rapporteur \/ nominator \/ convener \/ verifier）必须始终同时携带 `flowId` \+ `cardKind`/);
  assert.match(described.description, /缺失任一项会被应用拒绝且\*\*不会向客户发卡\*\*/);
  assert.match(described.description, /普通项目角色与 single\/su 的 `flowId`\/`stepId`\/`cardKind` 仍为可选/);
  const guidelines = (described.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /每次调用 request_confirmation 都必须同时携带 `flowId` 与 `cardKind`/);
  assert.match(guidelines, /不会向客户发卡/);

  // 形状校验不变：Provider 仍接受不带任何治理字段的旧调用，请求与 metadata 不凭空出现字段。
  let request!: CustomerInputRequest;
  let metadata!: CustomerInputMetadata;
  let calls = 0;
  const confirm = tools({
    customerInput: (req, meta) => {
      calls++;
      request = req;
      metadata = meta!;
      return { outcome: "answered", value: { confirmed: true } };
    },
  }).get("request_confirmation")!;
  const legacy = await confirm.handler(toolArgs("request_confirmation", { title: "旧卡" }));
  assert.equal(legacy.ok, true, "无 flowId/cardKind 的旧调用仍被 Provider 接受（角色级守卫在编排）");
  assert.equal(calls, 1);
  for (const key of ["flowId", "stepId", "cardKind"]) {
    assert.equal(Object.hasOwn(request, key), false, `旧调用请求不得凭空出现 ${key}`);
    assert.equal(Object.hasOwn(metadata, key), false, `旧调用 metadata 不得凭空出现 ${key}`);
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
