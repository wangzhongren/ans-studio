import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type FlowGetFn,
  type FlowStepSupersedeFn,
  type FlowStepUpdateFn,
  type ReportArtifactFn,
  type ReportArtifactInput,
  type ReportArtifactReceipt,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import { REPORT_ARTIFACT_READY_TOOL_NAME, buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const call = (args: Record<string, unknown>) => ({ name: REPORT_ARTIFACT_READY_TOOL_NAME, args });
const accepted: ReportArtifactReceipt = { ok: true, accepted: true, message: "已校验并接受验收标准" };
const baseInput = { flowId: "flow-a", stepId: "criteria", path: "docs/acceptance/flow-a-criteria-v1.md" };

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("未注入 reportArtifact ⇒ report_artifact_ready 不注册（结构性 fail-closed）", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(REPORT_ARTIFACT_READY_TOOL_NAME), false);
  // 注入其它治理能力不会顺带注册它（各自独立「注入才注册」）。
  const other = buildGovernedTools(allow, { requestAcceptance: async () => ({ ok: true, code: "dispatched", message: "x" }) });
  assert.equal(other.map((tool) => tool.name).includes(REPORT_ARTIFACT_READY_TOOL_NAME), false);
});

test("注入后注册 report_artifact_ready；只新增这一只工具、既有工具零变化", () => {
  const fn: ReportArtifactFn = async () => accepted;
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { reportArtifact: fn });

  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REPORT_ARTIFACT_READY_TOOL_NAME], "注入 reportArtifact 只新增 report_artifact_ready");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }
});

test("schema：flowId/stepId/path 必填；summary/sha256 可选；无 flow 变更面；文案钉纪律", () => {
  const desc = describeTool(REPORT_ARTIFACT_READY_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["flowId", "stepId", "path"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string }>;
  assert.deepEqual(Object.keys(props).sort(), ["flowId", "path", "sha256", "stepId", "summary"]);
  for (const key of ["flowId", "stepId", "path", "summary", "sha256"]) {
    assert.equal(props[key]?.type, "string", `${key} 必须是字符串`);
  }
  // 本工具不存在 flow 变更面（没有 status/evidence/expectedRevision 等）。
  for (const forbidden of ["status", "evidence", "expectedRevision", "idempotencyKey", "owner", "kind"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(props, forbidden), false, `不得暴露 flow 变更参数 ${forbidden}`);
  }
  // 文案钉点：应用中介、应用校验后决定收口、不写 flow/不写盘、成功不等于自动完成、回执原样、fail-closed。
  for (const need of [/应用校验后决定/, /收口/, /不写盘/, /不.*修改 flow/, /汇报成功不等于自动完成/, /accepted/, /ok/, /message/, /未注入/]) {
    assert.match(desc.description, need);
  }
  const guidelines = (desc.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /不要自行修改 flow 状态/);
  assert.match(guidelines, /不等于自动完成/);
});

test("载荷原样交给注入能力：必填原样透传、可选缺省不造键；非 slug 但非空也由能力侧决定", async () => {
  const received: ReportArtifactInput[] = [];
  const fn: ReportArtifactFn = async (input) => { received.push(input); return accepted; };
  const tool = toolMap({ reportArtifact: fn }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;

  assert.equal((await tool.handler(call({ ...baseInput }))).ok, true);
  assert.equal((await tool.handler(call({ ...baseInput, summary: "验收标准 v1 已就绪" }))).ok, true);
  assert.equal((await tool.handler(call({ ...baseInput, sha256: "a".repeat(64) }))).ok, true);
  assert.equal((await tool.handler(call({ ...baseInput, summary: "摘要", sha256: "b".repeat(64) }))).ok, true);
  // 工具层只做基本非空字符串校验：slug/归属/存在性/路径语义由能力侧校验（合法非空值原样透传，不改写）。
  assert.equal((await tool.handler(call({ flowId: "Flow A/1", stepId: "Step B", path: "docs/acceptance/标准 v1.md" }))).ok, true);

  assert.deepEqual(received, [
    { ...baseInput },
    { ...baseInput, summary: "验收标准 v1 已就绪" },
    { ...baseInput, sha256: "a".repeat(64) },
    { ...baseInput, summary: "摘要", sha256: "b".repeat(64) },
    { flowId: "Flow A/1", stepId: "Step B", path: "docs/acceptance/标准 v1.md" },
  ]);
  for (const omitted of ["summary", "sha256"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[0], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
});

test("非法参数在触达能力前拒绝（缺失/空白/非字符串/未知参数）；能力零调用", async () => {
  let calls = 0;
  const fn: ReportArtifactFn = async () => { calls += 1; return accepted; };
  const tool = toolMap({ reportArtifact: fn }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const invalidArgs: Record<string, unknown>[] = [
    {},
    { stepId: "criteria", path: "docs/a.md" },
    { flowId: "flow-a", path: "docs/a.md" },
    { flowId: "flow-a", stepId: "criteria" },
    { ...baseInput, flowId: "" },
    { ...baseInput, flowId: "   " },
    { ...baseInput, flowId: 42 },
    { ...baseInput, stepId: null },
    { ...baseInput, stepId: ["criteria"] },
    { ...baseInput, path: undefined },
    { ...baseInput, path: 42 },
    { ...baseInput, summary: 42 },
    { ...baseInput, summary: true },
    { ...baseInput, summary: "" },
    { ...baseInput, summary: "   " },
    { ...baseInput, sha256: 42 },
    { ...baseInput, sha256: "" },
    // 未知参数（尤其 flow 变更面）不得被顺带接受：质检不得借此改 flow。
    { ...baseInput, status: "done" },
    { ...baseInput, expectedRevision: "rev-1" },
    { ...baseInput, evidence: { kind: "artifact", ref: "docs/a.md" } },
  ];
  for (const args of invalidArgs) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");
});

test("回执原样转达：accepted=true 成功但重申不等于自动完成；rejected/failure/未声明按未接受 fail-closed", async () => {
  const success = toolMap({
    reportArtifact: async () => ({ ok: true, accepted: true, message: "已校验并接受验收标准（sha256 一致）" }),
  }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const ok = await success.handler(call({ ...baseInput }));
  assert.equal(ok.ok, true);
  assert.match(ok.message, /ok=true/);
  assert.match(ok.message, /accepted=true/);
  assert.match(ok.message, /已校验并接受验收标准（sha256 一致）/, "应用 message 必须原样出现");
  assert.match(ok.message, /flowId=flow-a/);
  assert.match(ok.message, /stepId=criteria/);
  assert.match(ok.message, new RegExp(`path=${baseInput.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(ok.message, /不等于自动完成/);
  assert.match(ok.message, /不要自行修改 flow 状态/);

  const rejected = toolMap({
    reportArtifact: async () => ({ ok: true, accepted: false, message: "路径与约定位置不一致" }),
  }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const rejectedResult = await rejected.handler(call({ ...baseInput }));
  assert.equal(rejectedResult.ok, false, "accepted=false 不得回执成功");
  assert.match(rejectedResult.message, /accepted=false/);
  assert.match(rejectedResult.message, /路径与约定位置不一致/);
  assert.match(rejectedResult.message, /未接受/);
  assert.match(rejectedResult.message, /不要当已收口/);

  const failure = toolMap({
    reportArtifact: async () => ({ ok: false, message: "应用校验失败：步骤不属于该 flow" }),
  }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const failureResult = await failure.handler(call({ ...baseInput }));
  assert.equal(failureResult.ok, false);
  assert.match(failureResult.message, /ok=false/);
  assert.match(failureResult.message, /应用校验失败：步骤不属于该 flow/);
  assert.match(failureResult.message, /不要当应用已接受/);

  // ok:true 但未声明 accepted：无法确认已接受 ⇒ fail-closed（不得宣称已接受/已收口）。
  const undeclared = toolMap({ reportArtifact: async () => ({ ok: true }) }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const undeclaredResult = await undeclared.handler(call({ ...baseInput }));
  assert.equal(undeclaredResult.ok, false, "accepted 缺席不得回执成功");
  assert.match(undeclaredResult.message, /accepted=未声明/);
  assert.match(undeclaredResult.message, /不要当已收口/);
});

test("能力抛错 / 契约外回执 ⇒ fail-closed，绝不说成已接受或已收口", async () => {
  const thrown = toolMap({ reportArtifact: async () => { throw new Error("汇报 handler 不可用"); } }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const failed = await thrown.handler(call({ ...baseInput }));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未获结果/);
  assert.match(failed.message, /汇报 handler 不可用/);
  assert.match(failed.message, /不要当应用已收到\/已接受/);

  const invalidReceipts: unknown[] = [
    undefined,
    null,
    42,
    [],
    {},
    { ok: "yes", accepted: true },
    { ok: true, accepted: "yes" },
    { ok: true, accepted: 1 },
    { ok: false, accepted: "no" },
  ];
  for (const receipt of invalidReceipts) {
    const tool = toolMap({ reportArtifact: async () => receipt as never }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
    const result = await tool.handler(call({ ...baseInput }));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
    assert.match(result.message, /不要当应用已接受/);
  }
});

test("会话中止：不触达能力，不假设应用已收到/已接受", async () => {
  let calls = 0;
  const fn: ReportArtifactFn = async () => { calls += 1; return accepted; };
  const tool = toolMap({ reportArtifact: fn }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler({ name: REPORT_ARTIFACT_READY_TOOL_NAME, args: { ...baseInput }, signal: controller.signal });
  assert.equal(result.ok, false);
  assert.match(result.message, /未获结果/);
  assert.match(result.message, /不要当应用已收到\/已接受/);
  assert.equal(calls, 0, "中止后不得触达能力");
});

test("不改 flow：汇报不会调用 flow 读取/更新/替代能力（工具面只有转交）", async () => {
  let flowReads = 0;
  let flowUpdates = 0;
  let flowSupersedes = 0;
  const flowGet: FlowGetFn = async () => { flowReads += 1; return { ok: true }; };
  const flowStepUpdate: FlowStepUpdateFn = async () => { flowUpdates += 1; return { ok: true }; };
  const flowStepSupersede: FlowStepSupersedeFn = async () => { flowSupersedes += 1; return { ok: true }; };
  const reportArtifact: ReportArtifactFn = async () => accepted;
  const tool = toolMap({ flowGet, flowStepUpdate, flowStepSupersede, reportArtifact }).get(REPORT_ARTIFACT_READY_TOOL_NAME)!;

  const result = await tool.handler(call({ ...baseInput }));
  assert.equal(result.ok, true);
  assert.equal(flowReads, 0, "report_artifact_ready 不得读取 flow");
  assert.equal(flowUpdates, 0, "report_artifact_ready 不得修改 flow 状态");
  assert.equal(flowSupersedes, 0, "report_artifact_ready 不得替代 flow 步骤");
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

test("Service 透传：注入 reportArtifact 后 provider 工具面包含 report_artifact_ready；未注入则不出现", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-report-artifact-"));
  const captured: RuntimeProviderOptions[] = [];
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      reportArtifact: async () => accepted,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(captured.length, 1);
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REPORT_ARTIFACT_READY_TOOL_NAME),
      true,
      "Service 必须透传 report_artifact_ready",
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
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REPORT_ARTIFACT_READY_TOOL_NAME),
      false,
      "未注入时不得出现 report_artifact_ready",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
