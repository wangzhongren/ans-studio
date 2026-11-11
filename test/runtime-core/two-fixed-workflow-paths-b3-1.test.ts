// 运行时核心 T3 B3.1 契约测试：`complete_team_plan` v4 可选 workflowId（fixed 形状放行 / legacy 不要求）
// 与 `request.resolved.source:"stage-a10"` 冻结字面戳（桌面 B3 记录 §6 写集外需求 3/4 的运行时核心侧闭环）。
// 依据：B1（`b607f100…`）AC-13/AC-15/AC-24；G-IR（`08e01726…`）；实现级方案 v1.3（`ae737dcf…`）§5.1/§8.3；
// 桌面 B3 记录（`8daebf1a…`）§6 第 3/4 条。
// 只验证 Model 类型 / 共享 schema / 工具层形状校验与透传：不触真实账本/trunk、不启动模型/Electron。
// `runId`/`baseDigest` 的 fixed 拒绝面（`baseline-legacy-field-forbidden`）属应用服务/编排（编排
// `baseline-service.test.ts` 覆盖）；本套件钉住工具层「不代做业务判定、原样透传，使服务拒绝可达」。
import test from "node:test";
import assert from "node:assert/strict";
import {
  type CompleteTeamPlanFn,
  type CompleteTeamPlanInput,
  type GovernedToolsOptions,
  type RequestResolvedEvent,
  requestResolvedD3DecisionId,
} from "../../src/model/runtime.ts";
import type { DirectActionReceipt } from "../../src/model/trunk.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import {
  COMPLETE_TEAM_PLAN_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const WF = "wf-0123456789abcdef01234567";
const D = "a".repeat(64);
const D2 = "b".repeat(64);

function toolsFor(options: GovernedToolsOptions = {}) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}
const run = (options: GovernedToolsOptions, name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  toolsFor(options).get(name)!.handler({ name, args, signal });

const appliedReceipt = { ok: true as const, status: "applied" as const, operationId: "op-plan-1", baseDigest: null, targetDigest: D2 };
const plan = { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: D };
// fixed v4 形状（v1.3 §5.1）：workflowId 由应用按当前真实受派任务绑定；模型自报仅为断言。
const fixedPlanArgs = { operationId: "op-plan-1", flowId: "snake", workflowId: WF, plan };
// legacy 旧形状（逐字）：无 workflowId；runId/baseDigest 可选断言。
const legacyPlanArgs = { operationId: "op-plan-1", flowId: "snake", plan };
const legacyWithDigestArgs = { ...legacyPlanArgs, baseDigest: D, runId: "run-1" };

// —————————————————————— 1. complete_team_plan 共享 schema v4（AC-15） ——————————————————————

test("complete_team_plan schema v4：新增可选 workflowId（1–200、无控制字符）；required/旧属性/plan 形状逐字不变", () => {
  const parameters = describeTool(COMPLETE_TEAM_PLAN_TOOL_NAME).parameters;
  assert.equal(parameters["additionalProperties"], false);
  assert.deepEqual(parameters["required"], ["operationId", "flowId", "plan"], "legacy required 逐字不变（fixed 必填由应用绑定核验）");
  assert.equal(parameters["oneOf"], undefined, "不新增顶层 oneOf");
  assert.equal(parameters["anyOf"], undefined, "不新增顶层 anyOf");

  const properties = parameters["properties"] as Record<string, Record<string, unknown>>;
  for (const key of ["operationId", "flowId", "runId", "baseDigest", "workflowId", "plan"]) {
    assert.ok(properties[key], `属性 ${key} 必须存在`);
  }
  const workflowId = properties["workflowId"]!;
  assert.equal(workflowId["type"], "string");
  assert.equal(workflowId["minLength"], 1);
  assert.equal(workflowId["maxLength"], 200, "workflowId 采用 1–200 字符（与 dispatch_task 同口径）");
  assert.equal(typeof workflowId["pattern"], "string", "拒绝控制字符");
  assert.equal(properties["baseDigest"]!["pattern"], "^[a-fA-F0-9]{64}$", "legacy 断言字段形状不变");
  assert.equal(properties["runId"]!["type"], "string", "legacy runId 形状不变");

  const planShape = properties["plan"]!;
  assert.equal(planShape["additionalProperties"], false);
  assert.deepEqual(planShape["required"], ["path", "version"]);
  const planProperties = planShape["properties"] as Record<string, Record<string, unknown>>;
  assert.equal(planProperties["sha256"]!["pattern"], "^[a-fA-F0-9]{64}$");

  const description = describeTool(COMPLETE_TEAM_PLAN_TOOL_NAME).description ?? "";
  assert.match(description, /workflowId/, "描述如实说明 fixed 形状字段");
  assert.match(description, /baseline-legacy-field-forbidden/, "描述如实说明固定路径拒绝 legacy 字段");
  assert.match(description, /runId\/baseDigest 为 legacy 兼容字段/, "描述保留 legacy 语义");
  assert.equal(description.includes("two-fixed-paths"), false, "schema 文案保持模式中立");
});

test("complete_team_plan handler：fixed 形状（含 workflowId）原样透传；工具层不派生/不改写 workflowId；signal 透传；B25 fixed 回执被接受", async () => {
  const calls: { input: unknown; signal?: AbortSignal }[] = [];
  const controller = new AbortController();
  // B25（RR22）：fixed 服务成功回执形状（非 legacy DirectActionReceipt）。
  const receipt = {
    ok: true as const, operationId: "op-plan-1", flowId: "snake", workflowId: WF,
    basisId: "bas-0123456789abcdef01234567",
    plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: D },
    documents: [{ kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1, sha256: D2 }],
    replay: false, stageCompleted: true,
  };
  const result = await run({ roleId: "convener", completeTeamPlan: async (input, signal) => {
    calls.push({ input, signal }); return receipt as unknown as DirectActionReceipt;
  } }, COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(fixedPlanArgs), controller.signal);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls, [{ input: fixedPlanArgs, signal: controller.signal }], "工具层只做形状校验并原样透传（权威绑定在应用）");
  assert.deepEqual(JSON.parse(result.message.slice(COMPLETE_TEAM_PLAN_TOOL_NAME.length + 2)), receipt);
});

test("B25 fixed complete_team_plan：失败回执透出 code/message（不按 unknown 处理）", async () => {
  const failure = { ok: false as const, code: "baseline-team-plan-invalid", message: "团队计划校验失败" };
  const result = await run({ roleId: "convener", completeTeamPlan: async () => failure as unknown as DirectActionReceipt },
    COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(fixedPlanArgs));
  assert.equal(result.ok, false);
  assert.match(result.message, /baseline-team-plan-invalid/);
  assert.match(result.message, /团队计划校验失败/);
  assert.equal(result.message.includes("结果未知或回执不完整"), false, "真实失败不得被降级为 unknown");
});

test("B25 fixed complete_team_plan：成功回执形状不符/身份不一致 ⇒ unknown（fail-closed，不伪造成功）", async () => {
  const base = {
    ok: true as const, operationId: "op-plan-1", flowId: "snake", workflowId: WF,
    basisId: "bas-0123456789abcdef01234567",
    plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: D },
    documents: [] as unknown[], replay: false, stageCompleted: true,
  };
  const cases: Array<[string, Record<string, unknown>]> = [
    ["缺 basisId", { ...base, basisId: "" }],
    ["workflowId 不一致", { ...base, workflowId: "wf-other" }],
    ["flowId 不一致", { ...base, flowId: "other" }],
    ["plan sha256 非法", { ...base, plan: { ...base.plan, sha256: "x" } }],
    ["documents 非数组", { ...base, documents: "nope" }],
    ["stageCompleted 非布尔", { ...base, stageCompleted: "yes" }],
    ["legacy 形状回执", { ...appliedReceipt, workflowId: WF }],
  ];
  for (const [label, receipt] of cases) {
    const result = await run({ roleId: "convener", completeTeamPlan: async () => receipt as unknown as DirectActionReceipt },
      COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(fixedPlanArgs));
    assert.equal(result.ok, false, label);
    assert.match(result.message, /结果未知或回执不完整/, label);
  }
});

test("complete_team_plan handler：legacy 形状（无 workflowId）仍放行且不追加任何键——legacy 不要求 workflowId", async () => {
  const calls: CompleteTeamPlanInput[] = [];
  const result = await run({ roleId: "convener", completeTeamPlan: async (input) => {
    calls.push(input); return appliedReceipt;
  } }, COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(legacyPlanArgs));
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls, [legacyPlanArgs], "旧调用载荷逐字进入注入实现");
  assert.equal("workflowId" in calls[0]!, false, "工具层不得补 workflowId");
});

test("complete_team_plan handler：legacy 必填 operationId/flowId/plan 逐字不变（缺失即拒绝且不调用实现）", async () => {
  let calls = 0;
  const options = { roleId: "convener", completeTeamPlan: async () => { calls++; return appliedReceipt; } } as GovernedToolsOptions;
  for (const missing of ["operationId", "flowId", "plan"]) {
    const args = structuredClone(legacyPlanArgs) as Record<string, unknown>;
    delete args[missing];
    const result = await run(options, COMPLETE_TEAM_PLAN_TOOL_NAME, args);
    assert.equal(result.ok, false, missing);
    assert.match(result.message, new RegExp(`invalid-arguments args\\.${missing}: required`), missing);
  }
  assert.equal(calls, 0, "非法输入不得调用注入实现");
});

test("complete_team_plan handler：坏 workflowId（空/空白/超长/非串）⇒ invalid-arguments 且不调用实现", async () => {
  let calls = 0;
  const options = { roleId: "convener", completeTeamPlan: async () => { calls++; return appliedReceipt; } } as GovernedToolsOptions;
  for (const bad of [
    { ...fixedPlanArgs, workflowId: "" },
    { ...fixedPlanArgs, workflowId: "   " },
    { ...fixedPlanArgs, workflowId: "w".repeat(201) },
    { ...fixedPlanArgs, workflowId: 42 },
    { ...fixedPlanArgs, workflowId: null },
    { ...fixedPlanArgs, workflowId: "wf-\u0001bad" },
    { ...fixedPlanArgs, futureField: true }, // 未知键仍拒绝（共享 schema 未声明）
  ]) {
    const result = await run(options, COMPLETE_TEAM_PLAN_TOOL_NAME, bad);
    assert.equal(result.ok, false, JSON.stringify(bad).slice(0, 120));
    assert.match(result.message, /invalid-arguments/, JSON.stringify(bad).slice(0, 120));
  }
  assert.equal(calls, 0);
});

test("complete_team_plan handler：runId/baseDigest 保持 legacy 断言面并原样透传（fixed 拒绝由服务/编排判定，本层不代做）", async () => {
  const calls: CompleteTeamPlanInput[] = [];
  const result = await run({ roleId: "convener", completeTeamPlan: async (input) => {
    calls.push(input); return appliedReceipt;
  } }, COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(legacyWithDigestArgs));
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls, [legacyWithDigestArgs], "legacy 断言字段原样透传（旧语义不变）");

  // fixed 形状同时夹带 legacy 字段：schema 容忍（服务必须能读到并以 `baseline-legacy-field-forbidden`
  // 拒绝），工具层不改写/不丢弃——应用服务/编排是业务判定的唯一属主；fixed 失败回执原样透出。
  const mixed = { ...fixedPlanArgs, runId: "run-1", baseDigest: D };
  const mixedCalls: CompleteTeamPlanInput[] = [];
  const mixedFailure = { ok: false as const, code: "baseline-legacy-field-forbidden", message: "fixed 路径不接受 legacy 字段 runId/baseDigest" };
  const mixedResult = await run({ roleId: "convener", completeTeamPlan: async (input) => {
    mixedCalls.push(input); return mixedFailure as unknown as DirectActionReceipt;
  } }, COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(mixed));
  assert.equal(mixedResult.ok, false, "服务层拒绝原样透出（不降级 unknown）");
  assert.match(mixedResult.message, /baseline-legacy-field-forbidden/, "真实拒绝码可达");
  assert.equal(mixedResult.message.includes("结果未知或回执不完整"), false, "服务拒绝不得被改写为 unknown");
  assert.deepEqual(mixedCalls, [mixed], "runId/baseDigest 原样透传，服务拒绝可达");
});

test("complete_team_plan：非 convener/未注入实现 ⇒ 工具不可用（角色门控与注入面不变）", async () => {
  const options = { roleId: "convener", completeTeamPlan: async () => appliedReceipt } as GovernedToolsOptions;
  for (const roleId of [undefined, "chief", "worker"]) {
    const denied = await run({ ...options, roleId }, COMPLETE_TEAM_PLAN_TOOL_NAME, structuredClone(fixedPlanArgs));
    assert.equal(denied.ok, false);
    assert.match(denied.message, /role-not-allowed/);
  }
  assert.equal(toolsFor({ roleId: "convener" }).has(COMPLETE_TEAM_PLAN_TOOL_NAME), false, "未注入实现 ⇒ 不注册（fail-closed）");
});

// —————————————————————— 2. request.resolved.source（AC-13 / v1.3 §8.3） ——————————————————————

const baseResolved = {
  v: 1 as const, at: "2026-11-10T10:00:00.000Z", kind: "request.resolved" as const,
  requestId: "req-a10", by: "customer" as const, choice: "worker-1",
};

test("RequestResolvedEvent：旧形状无 source 仍合法；source 可选且只收冻结字面 \"stage-a10\"", () => {
  const oldResolved: RequestResolvedEvent = { ...baseResolved };
  assert.equal("source" in oldResolved, false, "旧事件不得被强制携带 source");
  assert.equal(requestResolvedD3DecisionId(oldResolved), undefined, "旧读取路径照常（无 decisionId ⇒ undefined）");

  const fixedResolved: RequestResolvedEvent = {
    ...baseResolved,
    cardKind: "appointment",
    workflowId: WF,
    stage: "A10",
    targetRoleIds: ["worker-1"],
    documentRefs: [{ path: "docs/proposals/snake-roster-v1.md", sha256: D }],
    source: "stage-a10",
  };
  assert.equal(fixedResolved.source, "stage-a10");
  // @ts-expect-error source 只允许冻结字面 "stage-a10"（不放宽其它来源）
  const badSource: RequestResolvedEvent = { ...baseResolved, source: "stage-a11" };
  // @ts-expect-error legacy 无戳记录的来源字面不在冻结集合
  const badLegacySource: RequestResolvedEvent = { ...baseResolved, source: "legacy" };
  assert.equal(badSource.source, "stage-a11");
  assert.equal(badLegacySource.source, "legacy");
});

test("request.resolved source 透传：事件纯数据原样序列化/反序列化，旧无字段记录照常读取", () => {
  const fixedResolved: RequestResolvedEvent = { ...baseResolved, cardKind: "appointment", workflowId: WF, stage: "A10", source: "stage-a10" };
  assert.deepEqual(JSON.parse(JSON.stringify(fixedResolved)), fixedResolved, "source 随事件原样落账（账本为裸 JSON）");
  const oldRow = JSON.parse(JSON.stringify(baseResolved)) as RequestResolvedEvent;
  assert.equal("source" in oldRow, false, "旧行无字段照常");
  // 旧行 + 未知额外字段容忍（账本只增不改；source 缺失不猜来源）
  const tolerant = JSON.parse(JSON.stringify({ ...baseResolved, futureField: 1 })) as RequestResolvedEvent;
  assert.equal(tolerant.source, undefined);
});
