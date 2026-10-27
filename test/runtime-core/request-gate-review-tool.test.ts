import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type RequestAcceptanceFn,
  type RequestAcceptanceResult,
  type RequestGateReviewFn,
  type RequestGateReviewInput,
  type RequestGateReviewResult,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import {
  REQUEST_ACCEPTANCE_TOOL_NAME,
  REQUEST_GATE_REVIEW_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const call = (args: Record<string, unknown>) => ({ name: REQUEST_GATE_REVIEW_TOOL_NAME, args });
const dispatched: RequestGateReviewResult = { ok: true, code: "dispatched", message: "已派 Proof 复核 gate" };

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("未注入 requestGateReview ⇒ request_gate_review 不注册（能力缺席 = fail-closed）", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(REQUEST_GATE_REVIEW_TOOL_NAME), false);
  // 不因新增契约改动既有能力注册：request_acceptance 同样只在注入后出现。
  assert.equal(names.includes(REQUEST_ACCEPTANCE_TOOL_NAME), false);
});

test("注入后注册 request_gate_review；参数 gateId 必填 slug，flowId/note 可选，schema 不接受未知参数", () => {
  const fn: RequestGateReviewFn = async () => dispatched;
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { requestGateReview: fn });

  // 只新增这一只工具；既有工具的 schema/描述/显示规则/执行模式逐个保持不变。
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REQUEST_GATE_REVIEW_TOOL_NAME], "注入 requestGateReview 只新增 request_gate_review");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }

  const desc = describeTool(REQUEST_GATE_REVIEW_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["gateId"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string; description?: string }>;
  assert.deepEqual(Object.keys(props).sort(), ["flowId", "gateId", "note"]);
  assert.equal(props.flowId.type, "string");
  assert.equal(props.gateId.type, "string");
  assert.equal(props.note.type, "string");
  assert.match(props.gateId.description ?? "", /slug/);
  assert.match(props.note.description ?? "", /2000/);
  // 文案钉点：独立于最终验收的通道、仅统筹可用、gate 复核 ≠ 验收通过 ≠ 客户批准、
  // gate fail 只按 blocker/major、minor/nit 不返工、回执如实转达、不写 flow/账本、失败不伪装。
  const description = desc.description;
  for (const need of [
    /独立于最终验收/,
    /request_acceptance/,
    /仅运营/,
    /gate 复核 ≠ 验收通过 ≠ 客户批准/,
    /dispatched.*只表示已派 Proof/,
    /blocker\/major/,
    /minor\/nit/,
    /不构成返工依据/,
    /原样如实转达/,
    /不写 flow\/账本/,
    /绝不伪装成功/,
    /flow-busy/,
    /可稍后重试/,
  ]) {
    assert.match(description, need);
  }
  const guidelines = (desc.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /只给运营/);
  assert.match(guidelines, /不要.*自行判断 gate 是否达标/);
  assert.match(guidelines, /minor\/nit/);
  assert.match(guidelines, /客户批准/);
});

test("载荷原样交给注入能力：gateId 必填，flowId/note 可省略，缺省键不造", async () => {
  const received: RequestGateReviewInput[] = [];
  const fn: RequestGateReviewFn = async (input) => { received.push(input); return dispatched; };
  const tool = toolMap({ requestGateReview: fn }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;

  assert.equal((await tool.handler(call({ gateId: "gate-vertical-slice" }))).ok, true);
  assert.equal((await tool.handler(call({ gateId: "gate-visual-level-01", flowId: "flow-a" }))).ok, true);
  assert.equal((await tool.handler(call({ gateId: "gate-integration", note: "依赖与证据已齐" }))).ok, true);
  assert.equal((await tool.handler(call({ gateId: "gate-vertical-slice", flowId: "flow-b", note: "交付完成" }))).ok, true);
  // 空白 flowId 视作缺省＝当前流程（沿 request_acceptance 先例）；note:null 视作未提供。
  assert.equal((await tool.handler(call({ gateId: "gate-vertical-slice", flowId: "  ", note: null }))).ok, true);

  assert.deepEqual(received, [
    { gateId: "gate-vertical-slice" },
    { gateId: "gate-visual-level-01", flowId: "flow-a" },
    { gateId: "gate-integration", note: "依赖与证据已齐" },
    { gateId: "gate-vertical-slice", flowId: "flow-b", note: "交付完成" },
    { gateId: "gate-vertical-slice" },
  ]);
  for (const omitted of ["flowId", "note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[0], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
});

test("非法参数在触达能力前拒绝（gateId 缺失/非 slug、flowId 非字符串、note 非法或超界）", async () => {
  let calls = 0;
  const fn: RequestGateReviewFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestGateReview: fn }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const maxSlug = "g" + "a".repeat(62) + "1"; // 64 字符合法
  const overSlug = "g" + "a".repeat(63) + "1"; // 65 字符非法
  const tooLongNote = "说".repeat(2001);
  for (const args of [
    {},
    { gateId: 42 },
    { gateId: "" },
    { gateId: "   " },
    { gateId: "Gate-Vertical" },
    { gateId: "gate-vertical-" },
    { gateId: "-gate-vertical" },
    { gateId: "gate vertical" },
    { gateId: "a" },
    { gateId: overSlug },
    { gateId: "gate-vertical-slice", flowId: 42 },
    { gateId: "gate-vertical-slice", flowId: { id: "flow-a" } },
    { gateId: "gate-vertical-slice", note: 42 },
    { gateId: "gate-vertical-slice", note: true },
    { gateId: "gate-vertical-slice", note: "" },
    { gateId: "gate-vertical-slice", note: "   " },
    { gateId: "gate-vertical-slice", note: tooLongNote },
  ]) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");

  // 边界：64 字符 slug 与 2000 字 note 合法（按 Unicode 码点计，不截断）。
  assert.equal((await tool.handler(call({ gateId: maxSlug, note: "说".repeat(2000) }))).ok, true);
  assert.equal(calls, 1);
});

test("回执原样转达 ok/code/message（成功不夸大、失败不伪装、不把 dispatched 说成通过）", async () => {
  const success = toolMap({
    requestGateReview: async () => ({ ok: true, code: "dispatched", message: "已派 Proof 复核 gate-vertical-slice", flowId: "flow-a", gateId: "gate-vertical-slice", runtime: "claude" }),
  }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const ok = await success.handler(call({ gateId: "gate-vertical-slice", flowId: "flow-a" }));
  assert.equal(ok.ok, true);
  assert.match(ok.message, /ok=true/);
  assert.match(ok.message, /code=dispatched/);
  assert.match(ok.message, /已派 Proof 复核 gate-vertical-slice/);
  assert.match(ok.message, /flowId=flow-a/);
  assert.match(ok.message, /gateId=gate-vertical-slice/);
  assert.match(ok.message, /runtime=claude/);
  assert.match(ok.message, /gate 复核 ≠ 验收通过 ≠ 客户批准/, "成功文案必须重申 gate 复核 ≠ 验收通过 ≠ 客户批准");
  assert.match(ok.message, /不代表 gate 已通过/);
  assert.match(ok.message, /blocker\/major/);
  assert.match(ok.message, /minor\/nit/);

  const failures: RequestGateReviewResult[] = [
    { ok: false, code: "gate-not-found", message: "未找到 gate-vertical-slice 或缺少 gateKind", gateId: "gate-vertical-slice" },
    { ok: false, code: "criteria-missing", message: "验收标准缺少该 gate 的复核标准节" },
    { ok: false, code: "flow-incomplete", message: "前置步骤未 done：delivery-engine-core" },
    { ok: false, code: "unavailable", message: "无法解析运行时；可能已派发，请用 flow_get 核对" },
    { ok: false, code: "rejected", message: "gate 已 superseded；返工未完成" },
  ];
  for (const receipt of failures) {
    const tool = toolMap({ requestGateReview: async () => receipt }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
    const result = await tool.handler(call({ gateId: "gate-vertical-slice" }));
    assert.equal(result.ok, false, `ok:false 必须原样转达：${receipt.code}`);
    assert.match(result.message, /ok=false/);
    assert.match(result.message, new RegExp(`code=${receipt.code}`));
    assert.ok(result.message.includes(receipt.message), `回执 message 必须原样出现：${receipt.code}`);
    assert.match(result.message, /不要当已派发/);
    assert.match(result.message, /更不要当 gate 已通过/);
  }

  // already-dispatched 若应用回 ok:true，同样如实转达（是否成功只看 ok，不替应用改判）。
  const already = toolMap({ requestGateReview: async () => ({ ok: true, code: "already-dispatched", message: "同 flow revision 已派发" }) }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const alreadyResult = await already.handler(call({ gateId: "gate-vertical-slice" }));
  assert.equal(alreadyResult.ok, true);
  assert.match(alreadyResult.message, /code=already-dispatched/);
  assert.match(alreadyResult.message, /同 flow revision 已派发/);
});

test("flow-busy：可重试的独立返回码——暂不派发、不是故障/gate 失败、原因原样可见、不伪造 dispatched", async () => {
  const receipt: RequestGateReviewResult = {
    ok: false,
    code: "flow-busy",
    flowId: "flow-a",
    gateId: "gate-vertical-slice",
    message: "流程仍有在途交付：delivery-engine-core 轮次运行中",
  };
  const tool = toolMap({ requestGateReview: async () => receipt }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const result = await tool.handler(call({ gateId: "gate-vertical-slice", flowId: "flow-a" }));
  assert.equal(result.ok, false, "flow-busy 不得回执成功");
  assert.match(result.message, /code=flow-busy/);
  assert.match(result.message, /流程仍有在途工作（交付\/轮次\/回交）/);
  assert.match(result.message, /暂不派发/);
  assert.match(result.message, /可重试/);
  assert.match(result.message, /不是故障/);
  assert.match(result.message, /不是 gate 失败/);
  assert.match(result.message, /不要当已派发/);
  assert.ok(result.message.includes(receipt.message), "回执 message（原因）必须原样可见");
  assert.match(result.message, /flowId=flow-a/);
  assert.match(result.message, /gateId=gate-vertical-slice/);
  assert.doesNotMatch(result.message, /gate 复核已派发/, "flow-busy 不得说成已派发");
  assert.doesNotMatch(result.message, /请求已受理/, "flow-busy 不得说成已受理");

  // 矛盾回执（ok:true + flow-busy）不得伪造成功/已派发。
  const contradictory = toolMap({
    requestGateReview: async () => ({ ok: true, code: "flow-busy", message: "流程在途" }),
  }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const contradiction = await contradictory.handler(call({ gateId: "gate-vertical-slice" }));
  assert.equal(contradiction.ok, false, "ok:true + flow-busy 按未派发处理，不视为成功");
  assert.match(contradiction.message, /ok=true 与 flow-busy 矛盾/);
  assert.match(contradiction.message, /暂未派发/);
  assert.doesNotMatch(contradiction.message, /gate 复核已派发|请求已受理/);
});

test("有界超时回执：ok:false + unavailable 不伪装成功；提示 flow_get 核对", async () => {
  const timeoutReceipt: RequestGateReviewResult = {
    ok: false,
    code: "unavailable",
    gateId: "gate-vertical-slice",
    message: "已受理 gate 复核请求，但派发确认回执超时（约 60s 未返回）；**可能已派发/正在处理**，请用 flow_get 核对流程与治理账本，不要重复请求；本次不声称已派发。",
  };
  const tool = toolMap({ requestGateReview: async () => timeoutReceipt }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const result = await tool.handler(call({ gateId: "gate-vertical-slice" }));
  assert.equal(result.ok, false, "超时不得回执成功");
  assert.match(result.message, /code=unavailable/);
  assert.match(result.message, /超时/);
  assert.match(result.message, /可能已派发/);
  assert.match(result.message, /flow_get/);
  assert.match(result.message, /不要当已派发/);
});

test("能力抛错 / 契约外回执（含看似通过的未知 code）⇒ fail-closed，绝不说成已派发或已通过", async () => {
  const thrown = toolMap({ requestGateReview: async () => { throw new Error("gate handler 不可用"); } }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const failed = await thrown.handler(call({ gateId: "gate-vertical-slice" }));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /gate handler 不可用/);
  assert.match(failed.message, /不要当已派发/);
  assert.match(failed.message, /更不要当 gate 已通过/);

  const invalidReceipts: unknown[] = [
    undefined,
    null,
    42,
    [],
    {},
    { ok: "yes", code: "dispatched", message: "x" },
    // 契约外 code 一律 fail-closed：即使叫 passed/done/ok 也不得当成功，更不得当成 gate 通过。
    { ok: true, code: "passed", message: "x" },
    { ok: true, code: "done", message: "x" },
    { ok: true, code: "unknown-code", message: "x" },
    // 形近但非契约码（flow_busy / FLOW-BUSY）同样 fail-closed，不得被猜成 flow-busy。
    { ok: false, code: "flow_busy", message: "x" },
    { ok: false, code: "FLOW-BUSY", message: "x" },
    { ok: true, code: "dispatched", message: "" },
    { ok: true, code: "dispatched" },
  ];
  for (const receipt of invalidReceipts) {
    const tool = toolMap({ requestGateReview: async () => receipt as never }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
    const result = await tool.handler(call({ gateId: "gate-vertical-slice" }));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
    assert.match(result.message, /不要当已派发/);
    assert.match(result.message, /更不要当 gate 已通过/);
  }
});

test("会话中止：不假设已派发（能力不触达，文案如实）", async () => {
  let calls = 0;
  const fn: RequestGateReviewFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestGateReview: fn }).get(REQUEST_GATE_REVIEW_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler({ name: REQUEST_GATE_REVIEW_TOOL_NAME, args: { gateId: "gate-vertical-slice" }, signal: controller.signal });
  assert.equal(result.ok, false);
  assert.match(result.message, /未完成|未获结果/);
  assert.match(result.message, /不要当已派发/);
  assert.match(result.message, /更不要当 gate 已通过/);
  assert.equal(calls, 0, "中止后不得触达能力");
});

test("request_acceptance 零回归：新增 requestGateReview 不改变其 schema/描述/行为", async () => {
  const acceptance = async (): Promise<RequestAcceptanceResult> => ({ ok: true, code: "dispatched", message: "已派发 Proof" });
  const acceptanceFn: RequestAcceptanceFn = acceptance;
  const gateFn: RequestGateReviewFn = async () => dispatched;

  const onlyAcceptance = buildGovernedTools(allow, { requestAcceptance: acceptanceFn });
  const both = buildGovernedTools(allow, { requestAcceptance: acceptanceFn, requestGateReview: gateFn });
  const before = onlyAcceptance.find((tool) => tool.name === REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const after = both.find((tool) => tool.name === REQUEST_ACCEPTANCE_TOOL_NAME)!;
  assert.ok(before && after, "两种注入下 request_acceptance 都必须注册");
  assert.deepEqual(after.inputSchema, before.inputSchema, "request_acceptance schema 不得变化");
  assert.equal(after.description, before.description, "request_acceptance 描述不得变化");
  assert.equal(after.displayInputRule, before.displayInputRule);
  assert.equal(after.executionMode, before.executionMode);

  // 同一回执下两套工具面的 request_acceptance handler 输出逐字一致（行为零回归）。
  const args = { flowId: "flow-a", note: "证据已就绪" };
  const beforeResult = await before.handler({ name: REQUEST_ACCEPTANCE_TOOL_NAME, args });
  const afterResult = await after.handler({ name: REQUEST_ACCEPTANCE_TOOL_NAME, args });
  assert.deepEqual(afterResult, beforeResult);

  // 只注入 requestGateReview 时 request_acceptance 仍不出现（注册条件互不隐含）。
  const onlyGate = buildGovernedTools(allow, { requestGateReview: gateFn });
  assert.equal(onlyGate.some((tool) => tool.name === REQUEST_ACCEPTANCE_TOOL_NAME), false);
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

test("Service 透传：注入 requestGateReview 后 provider 工具面包含 request_gate_review；未注入则不出现", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-request-gate-review-"));
  const captured: RuntimeProviderOptions[] = [];
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestGateReview: async () => dispatched,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(captured.length, 1);
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REQUEST_GATE_REVIEW_TOOL_NAME),
      true,
      "Service 必须透传 request_gate_review",
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
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REQUEST_GATE_REVIEW_TOOL_NAME),
      false,
      "未注入时不得出现 request_gate_review",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
