import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import {
  HAND_OFF_INTENT_TOOL_NAME,
  REQUEST_CLARIFICATION_TOOL_NAME,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";
import type {
  HandOffIntentFn,
  HandOffIntentPayload,
  ReportHandbackMetadata,
  RequestClarificationFn,
  RequestClarificationPayload,
  SessionEvent,
} from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

const tools = (options?: Parameters<typeof buildGovernedTools>[1]) =>
  new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
const toolArgs = (toolName: string, args: Record<string, unknown>) => ({ name: toolName, args });

const validHandOff = {
  intentId: "intent-alpha",
  handoffKind: "initial",
  goal: "把导出功能做出来",
  scope: "仅 CSV 导出，不含 PDF",
  acceptance: "客户可导出当前列表并可复读导出的文件",
  summary: "客户要 CSV 导出",
};
const validClarification = { flowId: "flow-alpha", question: "导出的列范围是什么？" };

test("schema：hand_off_intent 严格（必填四要素/枚举/slug/additionalProperties:false）", () => {
  const tool = describeTool(HAND_OFF_INTENT_TOOL_NAME);
  const parameters = tool.parameters as { required?: string[]; properties: Record<string, { pattern?: string; enum?: string[]; minLength?: number; maxLength?: number }>; additionalProperties?: boolean };
  assert.deepEqual(parameters.required, ["intentId", "handoffKind", "goal", "scope", "acceptance", "summary"]);
  assert.equal(parameters.properties.intentId.pattern, GOVERNANCE_SLUG_PATTERN);
  assert.equal(parameters.properties.flowId.pattern, GOVERNANCE_SLUG_PATTERN);
  assert.deepEqual(parameters.properties.handoffKind.enum, ["initial", "clarification", "revision"]);
  assert.equal(parameters.properties.summary.maxLength, 200);
  assert.equal(parameters.additionalProperties, false);
  for (const field of ["flowId"]) assert.equal(parameters.required!.includes(field), false, `${field} 必须可选`);
  const text = [tool.description, ...(tool.promptGuidelines ?? [])].join("\n");
  assert.match(text, /交接 ≠ 客户批准/, "必须写明交接不是客户批准");
  assert.match(text, /docs\/intents\/<intentId>\.md/, "必须给出意图文件位置");
  assert.match(text, /initial/, "必须说明 initial 一次性");
  assert.match(text, /不要重复派发/, "必须禁止重复派发");
});

test("schema：request_clarification 严格（question 必填/flowId·intentId 可选至少一个由 handler 保证/摘要上限）", () => {
  const tool = describeTool(REQUEST_CLARIFICATION_TOOL_NAME);
  const parameters = tool.parameters as { required?: string[]; properties: Record<string, { pattern?: string; maxLength?: number }>; additionalProperties?: boolean };
  assert.deepEqual(parameters.required, ["question"]);
  assert.equal(parameters.properties.flowId.pattern, GOVERNANCE_SLUG_PATTERN);
  assert.equal(parameters.properties.intentId.pattern, GOVERNANCE_SLUG_PATTERN);
  assert.equal(parameters.properties.summary.maxLength, 200);
  assert.equal(parameters.additionalProperties, false);
  for (const field of ["flowId", "intentId", "summary"]) assert.equal(parameters.required!.includes(field), false, `${field} 必须可选`);
  const text = [tool.description, ...(tool.promptGuidelines ?? [])].join("\n");
  assert.match(text, /不弹客户决定卡/, "必须写明不弹决定卡");
  assert.match(text, /最多 \*\*2 轮\*\*/, "必须写明同一 flow 最多 2 轮");
  assert.match(text, /不改变任何权力或写权/, "必须写明不改变任何权力/写权");
  assert.match(text, /至少给一个/, "必须写明 flowId/intentId 至少一个");
});

test("hand_off_intent：四要素与 flowId 原样透传，metadata 带 turnId/roleId/runtime；成功回执如实", async () => {
  const payloads: HandOffIntentPayload[] = [];
  const metadata: (ReportHandbackMetadata | undefined)[] = [];
  const byName = tools({
    roleId: "liaison",
    runtime: "claude",
    currentTurnId: () => "turn-1",
    handOffIntent: (payload, meta) => {
      payloads.push(payload);
      metadata.push(meta);
      return { ok: true, message: "已投递（queued）" };
    },
  });
  const result = await byName.get(HAND_OFF_INTENT_TOOL_NAME)!.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff, flowId: "flow-alpha" }));
  assert.equal(result.ok, true);
  assert.match(result.message, /已交接/);
  assert.match(result.message, /交接 ≠ 客户批准/);
  assert.match(result.message, /已投递（queued）/);
  assert.deepEqual(payloads, [{ ...validHandOff, flowId: "flow-alpha" }]);
  assert.deepEqual(metadata[0], { turnId: "turn-1", roleId: "liaison", runtime: "claude" });

  await byName.get(HAND_OFF_INTENT_TOOL_NAME)!.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff }));
  const legacy = payloads.at(-1)!;
  assert.equal(Object.hasOwn(legacy, "flowId"), false, "缺席 flowId 不得凭空出现键");
});

test("hand_off_intent：非法参数在触达能力前拒绝（slug/枚举/空要素/summary 超长/未知参数）", async () => {
  let calls = 0;
  const handOffIntent: HandOffIntentFn = () => {
    calls++;
    return { ok: true };
  };
  const tool = tools({ handOffIntent }).get(HAND_OFF_INTENT_TOOL_NAME)!;
  const invalid: [string, Record<string, unknown>, RegExp][] = [
    ["missing-intentId", { handoffKind: "initial", goal: "g", scope: "s", acceptance: "a", summary: "x" }, /intentId/],
    ["bad-slug", { ...validHandOff, intentId: "Bad Slug" }, /intentId/],
    ["bad-intentId-trailing-hyphen", { ...validHandOff, intentId: "intent-" }, /intentId/],
    ["bad-flowId-trailing-hyphen", { ...validHandOff, flowId: "flow-" }, /flowId/],
    ["nonstring-intentId", { ...validHandOff, intentId: 7 }, /intentId/],
    ["bad-kind", { ...validHandOff, handoffKind: "update" }, /handoffKind/],
    ["nonstring-kind", { ...validHandOff, handoffKind: 1 }, /handoffKind/],
    ["missing-goal", { ...validHandOff, goal: undefined }, /goal/],
    ["blank-goal", { ...validHandOff, goal: "   " }, /goal/],
    ["missing-scope", { ...validHandOff, scope: undefined }, /scope/],
    ["blank-acceptance", { ...validHandOff, acceptance: "" }, /acceptance/],
    ["missing-summary", { ...validHandOff, summary: undefined }, /summary/],
    ["blank-summary", { ...validHandOff, summary: "  " }, /summary/],
    ["long-summary", { ...validHandOff, summary: "字".repeat(201) }, /200/],
    ["nonstring-summary", { ...validHandOff, summary: 7 }, /summary/],
    ["bad-flowId", { ...validHandOff, flowId: "flow_alpha" }, /flowId/],
    ["unknown-arg", { ...validHandOff, extra: "x" }, /未知参数 extra/],
  ];
  for (const [label, args, pattern] of invalid) {
    const result = await tool.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, args));
    assert.equal(result.ok, false, `${label} 必须拒绝`);
    assert.match(result.message, pattern, `${label} 拒绝文案须点名非法字段`);
  }
  assert.equal(calls, 0, "非法参数不得触达交接能力");
});

test("hand_off_intent：能力拒绝/抛错/契约外回执 fail-closed；中止不触达能力", async () => {
  const rejected = tools({ handOffIntent: () => ({ ok: false, message: "意图文件缺少 acceptance；未交接" }) }).get(HAND_OFF_INTENT_TOOL_NAME)!;
  const rejectedResult = await rejected.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff }));
  assert.equal(rejectedResult.ok, false);
  assert.match(rejectedResult.message, /未能交接/);
  assert.match(rejectedResult.message, /意图文件缺少 acceptance/);

  const throwing = tools({ handOffIntent: () => { throw new Error("delivery unavailable"); } }).get(HAND_OFF_INTENT_TOOL_NAME)!;
  const thrown = await throwing.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff }));
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /未能交接/);
  assert.match(thrown.message, /delivery unavailable/);

  const external = tools({ handOffIntent: (() => undefined) as unknown as HandOffIntentFn }).get(HAND_OFF_INTENT_TOOL_NAME)!;
  const externalResult = await external.handler(toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff }));
  assert.equal(externalResult.ok, false);
  assert.match(externalResult.message, /未交接/);
  assert.match(externalResult.message, /明确回执/);

  let called = false;
  const controller = new AbortController();
  controller.abort();
  const aborted = tools({ handOffIntent: () => { called = true; return { ok: true }; } }).get(HAND_OFF_INTENT_TOOL_NAME)!;
  const abortedResult = await aborted.handler({ ...toolArgs(HAND_OFF_INTENT_TOOL_NAME, { ...validHandOff }), signal: controller.signal });
  assert.equal(abortedResult.ok, false);
  assert.match(abortedResult.message, /未能交接/);
  assert.equal(called, false, "中止后不得触达交接能力");
});

test("request_clarification：flowId/intentId 至少一个、字段原样透传、缺席键不出现；成功回执如实", async () => {
  const payloads: RequestClarificationPayload[] = [];
  const metadata: (ReportHandbackMetadata | undefined)[] = [];
  const requestClarification: RequestClarificationFn = (payload, meta) => {
    payloads.push(payload);
    metadata.push(meta);
    return { ok: true };
  };
  const tool = tools({ roleId: "rapporteur", runtime: "codex", currentTurnId: () => "turn-2", requestClarification }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;

  const byFlow = await tool.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { flowId: "flow-alpha", question: "导出哪些列？", summary: "列范围" }));
  assert.equal(byFlow.ok, true);
  assert.match(byFlow.message, /已提交/);
  assert.match(byFlow.message, /不弹客户决定卡/);
  assert.match(byFlow.message, /最多 2 轮/);
  assert.deepEqual(payloads.at(-1), { flowId: "flow-alpha", question: "导出哪些列？", summary: "列范围" });
  assert.deepEqual(metadata.at(-1), { turnId: "turn-2", roleId: "rapporteur", runtime: "codex" });

  await tool.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { intentId: "intent-alpha", question: "客户原话是什么？" }));
  const byIntent = payloads.at(-1)!;
  assert.deepEqual(byIntent, { intentId: "intent-alpha", question: "客户原话是什么？" });
  for (const key of ["flowId", "summary"]) assert.equal(Object.hasOwn(byIntent, key), false, `缺席 ${key} 不得凭空出现键`);
});

test("request_clarification：非法参数在触达能力前拒绝（无归属/空问题/slug/摘要超长/未知参数）", async () => {
  let calls = 0;
  const requestClarification: RequestClarificationFn = () => {
    calls++;
    return { ok: true };
  };
  const tool = tools({ requestClarification }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;
  const invalid: [string, Record<string, unknown>, RegExp][] = [
    ["no-owner", { question: "问什么？" }, /flowId\/intentId/],
    ["bad-flowId", { ...validClarification, flowId: "FLOW" }, /flowId/],
    ["bad-flowId-trailing-hyphen", { ...validClarification, flowId: "a-" }, /flowId/],
    ["bad-intentId", { ...validClarification, intentId: "a_b" }, /intentId/],
    ["bad-intentId-trailing-hyphen", { ...validClarification, intentId: "intent-" }, /intentId/],
    ["missing-question", { flowId: "flow-alpha" }, /question/],
    ["blank-question", { flowId: "flow-alpha", question: "  " }, /question/],
    ["nonstring-question", { flowId: "flow-alpha", question: 3 }, /question/],
    ["nonstring-summary", { ...validClarification, summary: 9 }, /summary/],
    ["long-summary", { ...validClarification, summary: "字".repeat(201) }, /200/],
    ["unknown-arg", { ...validClarification, extra: "x" }, /未知参数 extra/],
  ];
  for (const [label, args, pattern] of invalid) {
    const result = await tool.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, args));
    assert.equal(result.ok, false, `${label} 必须拒绝`);
    assert.match(result.message, pattern, `${label} 拒绝文案须点名非法字段`);
  }
  assert.equal(calls, 0, "非法参数不得触达澄清能力");
});

test("request_clarification：能力拒绝/抛错/契约外回执 fail-closed；中止不触达能力", async () => {
  const rejected = tools({ requestClarification: () => ({ ok: false, message: "同一 flow 已达 2 轮；请在提案卡上请客户决定" }) }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;
  const rejectedResult = await rejected.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { ...validClarification }));
  assert.equal(rejectedResult.ok, false);
  assert.match(rejectedResult.message, /未能提交/);
  assert.match(rejectedResult.message, /已达 2 轮/);

  const throwing = tools({ requestClarification: () => { throw new Error("ledger unreadable"); } }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;
  const thrown = await throwing.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { ...validClarification }));
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /未能提交/);
  assert.match(thrown.message, /ledger unreadable/);

  const external = tools({ requestClarification: (() => null) as unknown as RequestClarificationFn }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;
  const externalResult = await external.handler(toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { ...validClarification }));
  assert.equal(externalResult.ok, false);
  assert.match(externalResult.message, /未提交/);

  let called = false;
  const controller = new AbortController();
  controller.abort();
  const aborted = tools({ requestClarification: () => { called = true; return { ok: true }; } }).get(REQUEST_CLARIFICATION_TOOL_NAME)!;
  const abortedResult = await aborted.handler({ ...toolArgs(REQUEST_CLARIFICATION_TOOL_NAME, { ...validClarification }), signal: controller.signal });
  assert.equal(abortedResult.ok, false);
  assert.match(abortedResult.message, /未能提交/);
  assert.equal(called, false, "中止后不得触达澄清能力");
});

test("未注入时不注册；注入各自独立；既有工具面不回归", () => {
  const base = tools();
  assert.deepEqual([...base.keys()], ["write_file", "edit_file", "read_file", "list_dir"]);
  assert.equal(base.has(HAND_OFF_INTENT_TOOL_NAME), false);
  assert.equal(base.has(REQUEST_CLARIFICATION_TOOL_NAME), false);

  const handoffOnly = tools({ handOffIntent: () => ({ ok: true }) });
  assert.equal(handoffOnly.has(HAND_OFF_INTENT_TOOL_NAME), true);
  assert.equal(handoffOnly.has(REQUEST_CLARIFICATION_TOOL_NAME), false, "两能力各自独立、互不隐含");
  assert.equal(handoffOnly.size, 5);

  const clarifyOnly = tools({ requestClarification: () => ({ ok: true }) });
  assert.equal(clarifyOnly.has(REQUEST_CLARIFICATION_TOOL_NAME), true);
  assert.equal(clarifyOnly.has(HAND_OFF_INTENT_TOOL_NAME), false);

  const all = tools({
    shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }),
    customerInput: () => ({ outcome: "declined" }),
    reportHandback: () => {},
    dispatchTask: () => {},
    shellVerdict: () => {},
    roleStatus: () => ({ ok: true, text: "stub" }),
    sessionTail: () => ({ ok: true, text: "stub" }),
    proposeRecovery: () => ({ outcome: "declined" }),
    installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
    uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
    installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
    uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
  });
  assert.equal(all.size, 17, "既有全注入工具面必须保持 17 项（含 list_dir；不回归）");
  assert.equal(all.has(HAND_OFF_INTENT_TOOL_NAME), false, "未注入交接能力时不得注册");
  assert.equal(all.has(REQUEST_CLARIFICATION_TOOL_NAME), false, "未注入澄清能力时不得注册");
});

test("Service 会话装配透传两个能力（demo 脚本）：字段不丢、metadata 带轮次", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-liaison-handoff-"));
  try {
    let handoff: HandOffIntentPayload | undefined;
    let clarify: RequestClarificationPayload | undefined;
    const session = await createRuntimeAdapter({
      runtime: "demo",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      handOffIntent: (payload) => {
        handoff = payload;
        return { ok: true };
      },
      requestClarification: (payload) => {
        clarify = payload;
        return { ok: true };
      },
      script: [
        { name: HAND_OFF_INTENT_TOOL_NAME, args: { ...validHandOff, flowId: "flow-alpha" } },
        { name: REQUEST_CLARIFICATION_TOOL_NAME, args: { intentId: "intent-alpha", question: "客户原话是什么？", summary: "原话" } },
      ],
    }).bindRole(role("liaison"));
    const events: SessionEvent[] = [];
    const done = (async () => { for await (const event of session.events()) events.push(event); })();
    await session.prompt("开始工作");
    await session.dispose();
    await done;
    assert.deepEqual(handoff, { ...validHandOff, flowId: "flow-alpha" });
    assert.deepEqual(clarify, { intentId: "intent-alpha", question: "客户原话是什么？", summary: "原话" });
    const settled = events.filter((event) => event.kind === "settled");
    assert.equal(settled.length > 0, true, "会话正常收口");
  } finally { await rm(root, { recursive: true, force: true }); }
});
