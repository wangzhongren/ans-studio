import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { governanceCardGroup } from "../../src/model/runtime.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const tools = (options?: Parameters<typeof buildGovernedTools>[1]) => new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
type ChoiceRequest = Extract<CustomerInputRequest, { kind: "choice" }>;

const toolArgs = (toolName: string, args: Record<string, unknown>) => ({ name: toolName, args });

function asChoice(request: CustomerInputRequest): ChoiceRequest {
  if (request.kind !== "choice") assert.fail("expected a choice card request");
  return request;
}

type SchemaProperty = { type?: string; enum?: string[]; description?: string; items?: { required?: string[]; properties: Record<string, SchemaProperty> } };
type SchemaProperties = Record<string, SchemaProperty>;

const propertiesOf = (name: string): SchemaProperties =>
  (describeTool(name).parameters as { properties: SchemaProperties }).properties;

test("schema（2026-10-26）：request_choice 仅新增 cardKind=decision 与 options.recommended；原有卡种/字段形状不变", () => {
  const choice = describeTool("request_choice");
  const properties = propertiesOf("request_choice");

  // cardKind：原有四种按原顺序保留，只在末尾新增 decision（不重排、不改值）。
  assert.deepEqual(properties["cardKind"]!.enum, ["proposal", "appointment", "acceptance", "intent-confirm", "decision"]);
  assert.deepEqual((choice.parameters as { required?: string[] }).required, ["title", "options"], "request_choice 必填字段不变");

  // options：原有 id/label/description 不变，新增可选 recommended: boolean（不新增必填）。
  const items = properties["options"]!.items!;
  assert.deepEqual(items.required, ["id", "label"], "options 每项必填仍只有 id/label");
  assert.equal(items.properties["id"]!.type, "string");
  assert.equal(items.properties["label"]!.type, "string");
  assert.equal(items.properties["description"]!.type, "string");
  assert.equal(items.properties["recommended"]!.type, "boolean");
  assert.equal(items.required!.includes("recommended"), false, "recommended 必须是可选字段");

  // 其他工具（request_confirmation / request_gate_review / request_acceptance）的 cardKind/参数不受影响。
  assert.deepEqual(propertiesOf("request_confirmation")["cardKind"]!.enum, ["write", "appointment-write", "schedule-write"]);
  assert.equal(propertiesOf("request_acceptance")["cardKind"], undefined);
  assert.equal(propertiesOf("request_gate_review")["cardKind"], undefined);
});

test("schema 文案：decision 卡写明仅运营、材料性选择范围、恰一个 recommended、替我决策默认推荐、不等于验收/批准、不触发 gate、无 pass", () => {
  const choice = describeTool("request_choice");
  const description = propertiesOf("request_choice")["cardKind"]!.description ?? "";
  const optionDescription = propertiesOf("request_choice")["options"]!.items!.properties["recommended"]!.description ?? "";
  const text = [choice.description, ...(choice.promptGuidelines ?? []), description, optionDescription].join("\n");

  assert.match(text, /仅运营（Steward）直接调用/, "必须写明仅运营可直接发 decision 卡");
  assert.match(text, /需求变更审批 decision 卡由应用在 `request_requirement_change` 成功后自动经发起方会话呈现/, "必须写明需求变更审批卡由应用自动呈现");
  assert.match(text, /不得再调用 `request_choice` 重复发卡/, "必须禁止发起方重复发卡");
  assert.match(text, /产品发现材料性选择/, "必须写明产品不自行决定、交运营发卡");
  for (const scene of ["演示\/验收证据方式", "范围", "标准\/契约偏离", "成本", "客户可见行为"]) {
    assert.match(text, new RegExp(scene), `材料性选择场景须点名：${scene}`);
  }
  assert.match(text, /恰一个.*`recommended: true`/, "decision 卡必须恰有一个推荐项");
  assert.match(text, /开启「替我决策」时判断 agent 默认选推荐项/, "替我决策语义须写明");
  assert.match(text, /不等于验收\/客户批准/, "decision 卡不等于验收/客户批准");
  assert.match(text, /不触发门禁\/验收/, "decision 卡不触发门禁/验收");
  assert.match(text, /`pass` 选项不适用/, "pass 选项不适用须写明");
  assert.match(text, /独立于提案\/任命\/验收/, "decision 卡独立于提案/任命/验收");
});

test("request_choice(decision)：options.recommended 原样透传（不补默认、不代选、不改其他选项）", async () => {
  let request!: CustomerInputRequest;
  let calls = 0;
  const byName = tools({
    roleId: "convener",
    runtime: "claude",
    customerInput: (req) => {
      calls++;
      request = req;
      return { outcome: "answered", value: { selected: ["demo-video"] } };
    },
  });
  const result = await byName.get("request_choice")!.handler(toolArgs("request_choice", {
    title: "验收演示证据采用哪种方式？",
    cardKind: "decision",
    flowId: "flow-alpha",
    options: [
      { id: "demo-video", label: "录屏演示", recommended: true },
      { id: "live-demo", label: "现场演示" },
      { id: "screenshots", label: "截图", recommended: false },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(request.kind, "choice");
  assert.equal(request.cardKind, "decision", "decision 卡种须原样进入卡片请求");
  assert.equal(governanceCardGroup("decision"), "decision", "decision 卡属于「替我决策」开关分组（开关分组，不表达权限）");
  assert.deepEqual(request.options, [
    { id: "demo-video", label: "录屏演示", recommended: true },
    { id: "live-demo", label: "现场演示" },
    { id: "screenshots", label: "截图", recommended: false },
  ], "recommended 原样保留；未给的选项不得凭空补 recommended:false");
  assert.equal(Object.hasOwn(request.options[1]!, "recommended"), false, "工具层不得自行代选/补默认推荐");
  assert.match(result.message, /客户已选择/, "客户手选回执语义不变");
});

test("request_choice(decision)：判断代批（替我决策）回执标注代决策；judge 退回用通用文案，不走验收返工", async () => {
  const decisionArgs = {
    title: "材料性选择",
    cardKind: "decision",
    options: [{ id: "a", label: "方案 A", recommended: true }, { id: "b", label: "方案 B" }],
  };
  const approved = await tools({
    customerInput: () => ({
      outcome: "answered" as const,
      value: { selected: ["a"] },
      operatorId: "judge:claude",
      judge: { group: "decision" as const, cardKind: "decision" as const, engine: "claude" as const, reasonCode: "ok" },
    }),
  }).get("request_choice")!.handler(toolArgs("request_choice", decisionArgs));
  assert.equal(approved.ok, true);
  assert.match(approved.message, /替我决策/);
  assert.match(approved.message, /代决策/);
  assert.match(approved.message, /这不是客户本人点击/);
  assert.doesNotMatch(approved.message, /客户已选择/, "判断代批不得说成客户本人选择");

  const declined = await tools({
    customerInput: () => ({ outcome: "declined" as const, operatorId: "judge:claude", reason: "材料性选择无法代判" }),
  }).get("request_choice")!.handler(toolArgs("request_choice", decisionArgs));
  assert.equal(declined.ok, false);
  assert.match(declined.message, /自动决策未通过\/未完成/);
  assert.match(declined.message, /这不是客户拒绝/);
  assert.match(declined.message, /应用会按治理规则处理本次退回/);
  assert.doesNotMatch(declined.message, /Convener|组织返工|重新提交验收/, "decision 卡不得套用验收返工路由");
});

test("request_choice：原有卡种/无推荐项选项零回归；非法 recommended 与未知卡种在触达客户前拒绝（工具层不猜）", async () => {
  let request!: CustomerInputRequest;
  let calls = 0;
  const choice = tools({
    customerInput: (req) => {
      calls++;
      request = req;
      const firstOptionId = req.kind === "choice" ? req.options[0]!.id : "a";
      return { outcome: "answered", value: { selected: [firstOptionId] } };
    },
  }).get("request_choice")!;

  for (const cardKind of ["proposal", "appointment", "acceptance", "intent-confirm"] as const) {
    const result = await choice.handler(toolArgs("request_choice", {
      title: "原有卡片",
      cardKind,
      options: [{ id: "a", label: "A" }],
    }));
    assert.equal(result.ok, true, `${cardKind}: 原有卡种仍被接受`);
    assert.equal(asChoice(request).cardKind, cardKind);
    assert.deepEqual(asChoice(request).options, [{ id: "a", label: "A" }], `${cardKind}: 未给 recommended 时选项形状逐字不变`);
  }

  // 无 recommended 的 decision 卡仍被工具接受：推荐项数量属于卡种语义，校验在应用/角色侧（工具层不代选）。
  const withoutRecommendation = await choice.handler(toolArgs("request_choice", {
    title: "无推荐项",
    cardKind: "decision",
    options: [{ id: "x", label: "X" }],
  }));
  assert.equal(withoutRecommendation.ok, true, "工具层不校验推荐项数量");
  assert.equal(asChoice(request).options[0]!.recommended, undefined, "工具层不得自行代选/补 recommended");

  // recommended 形状非法（非布尔）→ 触达客户通道前拒绝；不猜测、不静默丢弃。
  const before = calls;
  const malformed = await choice.handler(toolArgs("request_choice", {
    title: "坏推荐项",
    cardKind: "decision",
    options: [{ id: "x", label: "X", recommended: "yes" }],
  }));
  assert.equal(malformed.ok, false);
  assert.match(malformed.message, /options/);
  assert.equal(calls, before, "非法 options 不得触达客户通道");

  // 未知卡种仍由应用拒绝（工具层不猜成 decision，也不自作主张发卡）。
  for (const cardKind of ["decision-v2", "approve", "Decision"]) {
    const unknown = await choice.handler(toolArgs("request_choice", {
      title: "未知卡种",
      cardKind,
      options: [{ id: "a", label: "A" }],
    }));
    assert.equal(unknown.ok, false, `${cardKind}: 未知卡种必须拒绝`);
    assert.match(unknown.message, /cardKind/);
    assert.equal(calls, before, `${cardKind}: 不得触达客户通道`);
    assert.equal(governanceCardGroup(cardKind as never), undefined, `${cardKind}: 未知卡种不得落入任何开关分组`);
  }
});
