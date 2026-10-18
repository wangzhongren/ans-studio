import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildGovernedTools, REQUEST_CONFIRMATION_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { CustomerInputFn, CustomerInputMetadata, CustomerInputRequest } from "../../src/model/runtime.ts";
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
