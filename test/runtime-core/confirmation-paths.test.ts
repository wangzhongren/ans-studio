import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildGovernedTools, REQUEST_CONFIRMATION_TOOL_NAME, REQUEST_CHOICE_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { CustomerInputFn, CustomerInputMetadata, CustomerInputRequest, CustomerInputOutcome } from "../../src/model/runtime.ts";
import type { DirectActionSource } from "../../src/model/trunk.ts";
import { allow } from "./fixtures.ts";

function harness() {
  const calls: Array<{ req: CustomerInputRequest; metadata?: CustomerInputMetadata }> = [];
  const fn: CustomerInputFn = (req, metadata) => {
    calls.push({ req, ...(metadata !== undefined ? { metadata } : {}) });
    return { outcome: "answered", value: { confirmed: true }, operatorId: "customer" };
  };
  const tools = buildGovernedTools(allow, { customerInput: fn });
  return { calls, tool: tools.find((tool) => tool.name === REQUEST_CONFIRMATION_TOOL_NAME)! };
}

const call = (args: Record<string, unknown>) => ({ name: REQUEST_CONFIRMATION_TOOL_NAME, args });

test("schema：request_confirmation 增可选 paths（项目相对、逐文件、≤64、不得含仅引用文件）", () => {
  const schema = describeTool(REQUEST_CONFIRMATION_TOOL_NAME);
  assert.deepEqual(schema.parameters.required, ["title"], "paths 可选，不改变既有必填");
  const props = schema.parameters.properties as Record<string, { type?: string; maxItems?: number; description?: string; items?: { type?: string } }>;
  assert.equal(props.paths?.type, "array");
  assert.equal(props.paths?.maxItems, 64);
  assert.equal(props.paths?.items?.type, "string");
  assert.match(String(props.paths?.description), /exact write targets|referenced/i);
  assert.match(String(props.paths?.description), /max 64/i);
  const guidelines = (schema.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /paths/);
  assert.match(guidelines, /不得包含仅在 preview 中引用\/展示的文件/);
  // 2026-10-19 编排侧「呈现前 preview 完整性闸」（真机 op-2）配套：description/指引须写明
  // 写盘卡逐路径正文要求与「呈现前拒绝、不给客户看半张卡」的后果。
  const text = [schema.description, guidelines].join("\n");
  assert.match(text, /为\*\*每一条\*\*声明路径给出可核对正文/, "写盘卡 preview 须逐路径给出可核对正文/结构");
  assert.match(text, /呈现前拒绝该卡并要求补全/, "缺失逐路径正文时系统在呈现前拒绝该卡");
  assert.match(text, /不会先给客户看半张卡/, "不得把半张卡先给客户看");
});

test("合法 paths：posix 化后原样透传到卡片请求与 metadata", async () => {
  const { calls, tool } = harness();
  const result = await tool.handler(call({
    title: "写两个文件",
    preview: "参考 A、B、C；实际写 X、Y",
    paths: ["src/a.ts", "docs\\nested\\b.md", "./角色卡/示例/boundary.yaml"],
  }));
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const req = calls[0]!.req;
  assert.equal(req.kind, "confirm");
  assert.deepEqual(req.kind === "confirm" ? req.paths : undefined, ["src/a.ts", "docs/nested/b.md", "./角色卡/示例/boundary.yaml"]);
  assert.deepEqual(calls[0]!.metadata?.paths, ["src/a.ts", "docs/nested/b.md", "./角色卡/示例/boundary.yaml"]);
});

test("非法 paths：工具错误且不向客户发卡（零卡片副作用）", async () => {
  const tooMany = Array.from({ length: 65 }, (_, index) => `src/f-${index}.ts`);
  const cases: Array<[string, unknown]> = [
    ["非数组", "src/a.ts"],
    ["空数组", []],
    ["超过 64 项", tooMany],
    ["非字符串项", [42]],
    ["空字符串", [""]],
    ["纯空白", ["   "]],
    ["NUL", ["src/a\u0000.ts"]],
    ["绝对路径", [path.resolve("src/a.ts")]],
    ["盘符路径", ["C:\\temp\\a.ts"]],
    [".. 段", ["src/../secret.ts"]],
    ["目录（尾斜杠）", ["src/"]],
  ];
  for (const [label, paths] of cases) {
    const { calls, tool } = harness();
    const result = await tool.handler(call({ title: "写盘", paths }));
    assert.equal(result.ok, false, `${label} 必须被拒绝`);
    assert.match(result.message, /paths/, `${label} 的错误必须点名字段`);
    assert.match(result.message, /未向客户发卡/, `${label} 必须在触达客户通道之前失败`);
    assert.equal(calls.length, 0, `${label} 不得向客户发卡`);
  }
});

test("缺省 paths：旧卡逐字兼容（请求/metadata 不出现该键）", async () => {
  const { calls, tool } = harness();
  const result = await tool.handler(call({ title: "仅确认", preview: "无写入" }));
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const req = calls[0]!.req as CustomerInputRequest & Record<string, unknown>;
  assert.equal("paths" in req, false, "未给 paths ⇒ 请求不凭空出现该键");
  assert.equal("paths" in (calls[0]!.metadata ?? {}), false, "未给 paths ⇒ metadata 不凭空出现该键");
});

test("64 项边界合法（上限含 64）", async () => {
  const paths = Array.from({ length: 64 }, (_, index) => `src/f-${index}.ts`);
  const { calls, tool } = harness();
  const result = await tool.handler(call({ title: "批量写", paths }));
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.metadata?.paths?.length, 64);
});

const chiefSource = (disposition: "select" | "reject" | "revise", selected?: string[]): DirectActionSource => ({
  kind: "chief-delegated", actorRoleId: "chief", originRoleId: "convener", requestId: "real-request",
  baseDigest: "a".repeat(64), delegationRevision: 4, disposition, ...(selected ? { selected } : {}),
  reason: "按证据应采用替代方案", at: "2026-11-05T00:00:00Z",
});
const choiceArgs = { title: "阻塞处理", options: [{ id: "recommended", label: "推荐方案" }, { id: "alternative", label: "替代方案" }] };
async function interactionResult(name: string, outcome: CustomerInputOutcome) {
  let calls = 0;
  const tool = buildGovernedTools(allow, { customerInput: () => { calls++; return outcome; } }).find(tool => tool.name === name)!;
  const result = await tool.handler({ name, args: name === REQUEST_CONFIRMATION_TOOL_NAME ? { title: "确认业务选择" } : choiceArgs });
  assert.equal(calls, 1);
  return result;
}

test("R4 choice/confirmation show chief rejection or revision, retaining typed reason/source without task cancellation", async () => {
  for (const name of [REQUEST_CHOICE_TOOL_NAME, REQUEST_CONFIRMATION_TOOL_NAME]) {
    for (const disposition of ["reject", "revise"] as const) {
      const outcome: CustomerInputOutcome = { outcome: "declined", operatorId: "chief",
        actionSource: chiefSource(disposition), reason: "请原运营补全环境证据后重提" };
      const original = JSON.stringify(outcome);
      const result = await interactionResult(name, outcome);
      assert.equal(result.ok, false);
      assert.match(result.message, disposition === "revise" ? /幕僚要求修订/ : /幕僚拒绝/);
      assert.match(result.message, /请原运营补全环境证据后重提/);
      assert.doesNotMatch(result.message, /客户拒绝|客户已选择|客户明确未同意|未获客户同意/);
      assert.equal("cancelTask" in result, false);
      assert.deepEqual(JSON.parse(result.message.split("\n原始回执：")[1]!), outcome);
      assert.equal(JSON.stringify(outcome), original);
    }
  }
});

test("R4 chief answered receipts show the actual non-recommended selection/confirmation and original provenance", async () => {
  const choice: CustomerInputOutcome = { outcome: "answered", operatorId: "chief", actionSource: chiefSource("select", ["alternative"]), value: { selected: ["alternative"] } };
  const selected = await interactionResult(REQUEST_CHOICE_TOOL_NAME, choice);
  assert.equal(selected.ok, true); assert.match(selected.message, /幕僚已选择.*替代方案/);
  assert.match(selected.message, /按证据应采用替代方案/); assert.doesNotMatch(selected.message, /客户已选择|判断 agent/);
  assert.deepEqual(JSON.parse(selected.message.split("\n原始回执：")[1]!), choice);
  const confirmation: CustomerInputOutcome = { outcome: "answered", operatorId: "chief", actionSource: chiefSource("select", ["confirm"]), value: { confirmed: true } };
  const confirmed = await interactionResult(REQUEST_CONFIRMATION_TOOL_NAME, confirmation);
  assert.equal(confirmed.ok, true); assert.match(confirmed.message, /幕僚已确认.*confirmed:true/);
  assert.doesNotMatch(confirmed.message, /客户已确认|判断 agent/);
  assert.deepEqual(JSON.parse(confirmed.message.split("\n原始回执：")[1]!), confirmation);
});

test("R4 malformed source or contradictory chief outcome cannot fall through to customer approval", async () => {
  const outcomes: CustomerInputOutcome[] = [
    { outcome: "answered", value: { selected: ["alternative"] }, actionSource: chiefSource("revise") },
    { outcome: "answered", value: { selected: ["recommended"] }, actionSource: chiefSource("select", ["alternative"]) },
    { outcome: "answered", value: { selected: ["unknown"] }, actionSource: chiefSource("select", ["unknown"]) },
    { outcome: "answered", value: { confirmed: true }, actionSource: { ...chiefSource("select", ["confirm"]), actorRoleId: "judge" } as DirectActionSource },
  ];
  for (const outcome of outcomes) {
    for (const name of [REQUEST_CHOICE_TOOL_NAME, REQUEST_CONFIRMATION_TOOL_NAME]) {
      const result = await interactionResult(name, outcome);
      assert.equal(result.ok, false); assert.match(result.message, /不能视为批准/);
      assert.doesNotMatch(result.message, /客户已选择|客户已确认/);
    }
  }
});

test("R4 historical customer, judge and directive outcomes keep their existing receipt wording", async () => {
  const customer = await interactionResult(REQUEST_CONFIRMATION_TOOL_NAME, { outcome: "answered", value: { confirmed: true }, operatorId: "customer" });
  assert.match(customer.message, /客户已确认/); assert.doesNotMatch(customer.message, /幕僚|原始回执/);
  const declined = await interactionResult(REQUEST_CHOICE_TOOL_NAME, { outcome: "declined", operatorId: "customer", reason: "保留" });
  assert.match(declined.message, /客户拒绝（保留）/);
  const judge = await interactionResult(REQUEST_CHOICE_TOOL_NAME, { outcome: "declined", operatorId: "judge:demo", reason: "证据不足" });
  assert.match(judge.message, /自动决策未通过\/未完成.*证据不足/); assert.doesNotMatch(judge.message, /幕僚/);
  const directive = await interactionResult(REQUEST_CHOICE_TOOL_NAME, { outcome: "answered", value: { selected: ["alternative"] }, operatorId: "directive:d-1", directive: { id: "d-1", action: "select-option" } });
  assert.match(directive.message, /客户已选择（操作者：directive:d-1）/); assert.doesNotMatch(directive.message, /幕僚|原始回执/);
});
