// test/runtime-core/doc-format-specs-pin.test.ts
// 2026-11-09（document-format-specifications B2 批，运行时核心；B1 TM-11 / TM-7 / AC-8 / AC-9）：
// `doc_format` 只读工具契约 pin——
//   · `describeTool("doc_format")` 扁平 schema（顶层 object + 非空 properties + required；
//     **无顶层 oneOf/anyOf**，避免 `tools/list` 呈空重演）；
//   · 注入才注册（未注入 `docFormat` ⇒ 工具不存在、既有工具 schema/描述逐字不变；注入 ⇒ 恰多一只）；
//   · 未知 format / 非字符串 format|part / 数据源 null/空/抛错 ⇒ `{ok:false,message}`；正常 ⇒ `{ok:true,message}`；
//   · MCP `tools/list` 形状（codex 本地 MCP 按 `{name,description,inputSchema}` 原样呈现，
//     见 `src/provider/codex/session.ts:693`）`inputSchema.properties` 非空；
//   · `toPiTool`（Pi 逐工具透传）description/promptGuidelines 非空；
//   · MCP 声明（A21）七键/保留名/环境名/状态与运行时核心私有常量交叉钉住
//     （`src/common/runtime-core/mcp-declarations.ts` 的常量未导出：以源码文本 + 公开读取器行为
//     双向断言——text-shape，残余风险见本批变更记录）；
//   · 预算：注册表索引/详情正常路径 ≤8192 B（B1 实测 5,223 / 4,089 B）；数据源超限时工具层截断并标注。
//
// 纪律：不改既有断言；不新增 skip/force-exit；数据源用真实注册表（`doc-format-specs.ts`）或最小替身，
// 不复制第二份格式文本。

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DOC_FORMAT_SPEC_VERSION,
  docFormatIndexText,
  docFormatKnownIds,
  docFormatSpecText,
  DOC_FORMAT_SPECS,
} from "../../src/common/编排/doc-format-specs.ts";
import { toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import { readMcpDeclaration } from "../../src/common/runtime-core/mcp-declarations.ts";
import type { DocFormatFn, DocFormatInput, GovernedToolsOptions } from "../../src/model/runtime.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { DOC_FORMAT_TOOL_NAME, buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const HEADER = `doc_format（只读；不构成放行/授权；${DOC_FORMAT_SPEC_VERSION}）`;

const toolMap = (options?: GovernedToolsOptions) =>
  new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
const call = (args: Record<string, unknown>) => ({ name: DOC_FORMAT_TOOL_NAME, args });
/** 真实注册表数据源（桌面实现同型的最简形态；纯静态、零 I/O）。 */
const registrySource: DocFormatFn = (input) =>
  input.format === undefined ? docFormatIndexText() : docFormatSpecText(input.format, input.part);
/** 计数替身：断言非字符串/未知 id 在工具层即拒绝、不触数据源。 */
function spySource(inner: DocFormatFn): { fn: DocFormatFn; calls: DocFormatInput[] } {
  const calls: DocFormatInput[] = [];
  return { fn: (input, metadata) => { calls.push(input); return inner(input, metadata); }, calls };
}

// ———————————————— 1. describeTool：扁平 schema / 无顶层 union / 描述与准则非空 ————————————————

test("TM-11 describeTool(\"doc_format\")：顶层 object + 非空 properties + required；无顶层 oneOf/anyOf", () => {
  const description = describeTool(DOC_FORMAT_TOOL_NAME);
  const parameters = description.parameters;
  assert.equal(parameters["type"], "object");
  const properties = parameters["properties"];
  assert.ok(properties !== null && typeof properties === "object" && !Array.isArray(properties), "properties 必须是对象");
  assert.ok(Object.keys(properties as Record<string, unknown>).length > 0, "properties 必须非空");
  assert.deepEqual(Object.keys(properties as Record<string, unknown>).sort(), ["format", "part"]);
  assert.ok(Array.isArray(parameters["required"]), "required 必须是数组（可为空）");
  assert.equal(parameters["oneOf"], undefined, "禁止顶层 oneOf");
  assert.equal(parameters["anyOf"], undefined, "禁止顶层 anyOf");
  const format = (properties as Record<string, Record<string, unknown>>)["format"];
  assert.equal(format["type"], "string");
  const part = (properties as Record<string, Record<string, unknown>>)["part"];
  assert.equal(part["type"], "string");
  assert.deepEqual(part["enum"], ["fields", "example", "errors"]);
  // 描述/准则即全员可发现入口：写前先查、无参数列全部、只读不构成放行。
  assert.ok(description.description.trim() !== "", "description 不得为空");
  assert.ok(description.description.includes("先查"), "description 必须明示写前先查");
  assert.ok(description.description.includes("无参数调用返回全部格式索引"), "description 必须明示无参数列全部");
  assert.ok(description.description.includes("只读"), "description 必须明示只读");
  assert.ok(description.description.includes("不构成放行/授权"), "description 必须明示不构成放行");
  assert.ok(Array.isArray(description.promptGuidelines) && description.promptGuidelines.length > 0, "promptGuidelines 必须非空");
  for (const guideline of description.promptGuidelines) assert.ok(guideline.trim() !== "", "promptGuidelines 条目不得为空");
});

// ———————————————— 2. 注入才注册：未注入 ⇒ 无工具；注入 ⇒ 恰多一只，既有工具零变化 ————————————————

test("TM-11 注入才注册：无 docFormat ⇒ doc_format 不存在；有 docFormat ⇒ 恰多一只、既有工具 schema/描述不变", () => {
  const base = buildGovernedTools(allow);
  assert.equal(base.some((tool) => tool.name === DOC_FORMAT_TOOL_NAME), false, "未注入 ⇒ 工具不存在");
  const withTool = buildGovernedTools(allow, { docFormat: registrySource });
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [DOC_FORMAT_TOOL_NAME], "注入 docFormat 只新增 doc_format");
  assert.equal(withTool.length, base.length + 1);
  assert.equal(withTool.filter((tool) => tool.name === DOC_FORMAT_TOOL_NAME).length, 1, "只能注册一只");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.deepEqual(after.promptGuidelines, before.promptGuidelines, `${before.name} 的准则不得变化`);
    assert.equal(after.executionMode, before.executionMode);
  }
});

// ———————————————— 3. handler 契约：正常 / 未知 / 非字符串 / 数据源失败 ————————————————

test("TM-11 正常路径：索引/详情 ⇒ {ok:true}，消息为数据源纯文本（含固定头部与 specRevision）", async () => {
  const tool = toolMap({ docFormat: registrySource }).get(DOC_FORMAT_TOOL_NAME)!;
  const index = await tool.handler(call({}));
  assert.equal(index.ok, true);
  assert.equal(index.message, docFormatIndexText(), "索引消息与注册表同源");
  assert.equal(index.message.split("\n")[0], HEADER, "索引首行固定头部（含规范版本）");
  assert.ok(index.message.includes("part=fields|example|errors"));
  for (const id of docFormatKnownIds()) assert.ok(index.message.includes(id), `索引必须可发现 ${id}`);
  // 仅空白 format 同缺省（索引模式）。
  const blank = await tool.handler(call({ format: "   " }));
  assert.equal(blank.ok, true);
  assert.equal(blank.message, docFormatIndexText());
  // 详情 + part 裁剪。
  const detail = await tool.handler(call({ format: "project-intent/v1", part: "example" }));
  assert.equal(detail.ok, true);
  assert.equal(detail.message, docFormatSpecText("project-intent/v1", "example"));
  assert.equal(detail.message.split("\n")[0], HEADER);
  assert.ok(detail.message.includes("specRevision："));
});

test("TM-11 未知 format ⇒ {ok:false,message}（未知格式 + 可用 id 列表、回显 ≤40 字符），不触数据源", async () => {
  const spy = spySource(registrySource);
  const tool = toolMap({ docFormat: spy.fn }).get(DOC_FORMAT_TOOL_NAME)!;
  const unknown = await tool.handler(call({ format: "no-such/v1" }));
  assert.equal(unknown.ok, false);
  // 消息与注册表未知-id 纯文本同口径（B1 AC-8-3）：以「未知格式 」开头、含可用 id 列表。
  assert.ok(unknown.message.startsWith("未知格式 "), `实际：${unknown.message.slice(0, 80)}`);
  assert.equal(unknown.message, docFormatSpecText("no-such/v1"), "工具层未知提示与注册表未知文本逐字一致");
  assert.ok(unknown.message.includes("；可用："));
  for (const id of docFormatKnownIds()) assert.ok(unknown.message.includes(id), "未知提示必须列出可用 id");
  assert.equal(spy.calls.length, 0, "未知 id 在工具层拒绝，不调用数据源");
  // 超长回显裁剪（≤40 字符 + 省略号）。
  const longId = "x".repeat(200);
  const clipped = await tool.handler(call({ format: longId }));
  assert.equal(clipped.ok, false);
  const echoed = clipped.message.slice("未知格式 ".length, clipped.message.indexOf("；可用："));
  assert.ok(Array.from(echoed).length <= 41, `回显过长：${Array.from(echoed).length}`);
  assert.equal(spy.calls.length, 0);
});

test("TM-11 非字符串 format/part、未知 part ⇒ {ok:false,message}，不触数据源", async () => {
  const spy = spySource(registrySource);
  const tool = toolMap({ docFormat: spy.fn }).get(DOC_FORMAT_TOOL_NAME)!;
  for (const bad of [123, true, ["project-intent/v1"], { id: "project-intent/v1" }]) {
    const result = await tool.handler(call({ format: bad }));
    assert.equal(result.ok, false, `format=${JSON.stringify(bad)} 必须拒绝`);
    assert.ok(result.message.includes("format 参数非法"));
  }
  const badPart = await tool.handler(call({ format: "project-intent/v1", part: "bogus" }));
  assert.equal(badPart.ok, false);
  assert.ok(badPart.message.includes("未知 part"));
  const nonStringPart = await tool.handler(call({ part: 5 }));
  assert.equal(nonStringPart.ok, false);
  assert.ok(nonStringPart.message.includes("part 参数非法"));
  assert.equal(spy.calls.length, 0, "非法参数在工具层拒绝，不调用数据源");
});

test("TM-11 数据源 null/空/抛错 ⇒ {ok:false,message}（不抛、不猜）；正常 ⇒ {ok:true}", async () => {
  const nullTool = toolMap({ docFormat: () => null }).get(DOC_FORMAT_TOOL_NAME)!;
  const nullResult = await nullTool.handler(call({}));
  assert.equal(nullResult.ok, false);
  assert.ok(nullResult.message.includes("数据源未返回格式说明"));
  const voidTool = toolMap({ docFormat: () => undefined }).get(DOC_FORMAT_TOOL_NAME)!;
  assert.equal((await voidTool.handler(call({}))).ok, false);
  const emptyTool = toolMap({ docFormat: () => "   " }).get(DOC_FORMAT_TOOL_NAME)!;
  assert.equal((await emptyTool.handler(call({}))).ok, false);
  const throwTool = toolMap({ docFormat: () => { throw new Error("boom"); } }).get(DOC_FORMAT_TOOL_NAME)!;
  const thrown = await throwTool.handler(call({}));
  assert.equal(thrown.ok, false);
  assert.ok(thrown.message.includes("读取未完成"));
  assert.ok(thrown.message.includes("boom"));
  const okTool = toolMap({ docFormat: () => "doc_format（只读；不构成放行/授权；doc-format-specs/v1）\nok" }).get(DOC_FORMAT_TOOL_NAME)!;
  assert.equal((await okTool.handler(call({}))).ok, true);
});

test("TM-11 数据源收到扁平输入与既有 metadata（roleId/turnId/runtime；与 contract_check 同型）", async () => {
  const seen: Array<{ input: DocFormatInput; metadata?: { roleId?: string; turnId?: string; runtime?: string } }> = [];
  const tool = toolMap({
    roleId: "core", runtime: "claude", currentTurnId: () => "turn-42",
    docFormat: (input, metadata) => { seen.push({ input, metadata }); return "text"; },
  }).get(DOC_FORMAT_TOOL_NAME)!;
  const result = await tool.handler(call({ format: "project-intent/v1", part: "fields" }));
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [{ input: { format: "project-intent/v1", part: "fields" }, metadata: { roleId: "core", turnId: "turn-42", runtime: "claude" } }]);
});

// ———————————————— 4. MCP tools/list 形状（codex 本地 MCP） ————————————————

test("TM-11 MCP tools/list 形状：inputSchema.properties 非空、无顶层 oneOf/anyOf（codex 原样透传）", () => {
  const governed = buildGovernedTools(allow, { docFormat: registrySource });
  // 与 src/provider/codex/session.ts:693 相同的映射（name/description/inputSchema 原样呈现）。
  const listed = governed.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  const entry = listed.find((tool) => tool.name === DOC_FORMAT_TOOL_NAME);
  assert.ok(entry, "tools/list 必须包含 doc_format");
  assert.ok(entry.description.trim() !== "");
  assert.equal(entry.inputSchema["type"], "object");
  const properties = entry.inputSchema["properties"];
  assert.ok(properties !== null && typeof properties === "object" && Object.keys(properties as Record<string, unknown>).length > 0, "inputSchema.properties 必须非空");
  assert.equal(entry.inputSchema["oneOf"], undefined);
  assert.equal(entry.inputSchema["anyOf"], undefined);
});

// ———————————————— 5. toPiTool：description/promptGuidelines 非空（Pi 逐工具透传） ————————————————

test("TM-11 toPiTool(describeTool(\"doc_format\"))：description/promptGuidelines 非空且与 describeTool 同源", () => {
  const description = describeTool(DOC_FORMAT_TOOL_NAME);
  const pi = toPiTool({ name: DOC_FORMAT_TOOL_NAME, handler: async () => ({ ok: true, message: "" }) });
  assert.deepEqual(pi.parameters, description.parameters, "Pi 参数与 describeTool 同源");
  assert.equal(pi.description, description.description);
  assert.ok(pi.description.trim() !== "", "Pi description 不得为空");
  assert.ok(Array.isArray(pi.promptGuidelines) && pi.promptGuidelines.length > 0, "Pi promptGuidelines 必须非空");
  for (const guideline of pi.promptGuidelines) assert.ok(guideline.trim() !== "");
});

// ———————————————— 6. MCP 声明（A21）私有不变量交叉钉住 ————————————————

test("TM-7/TM-11 MCP 声明：七键/保留名/环境名/状态与 mcp-declarations.ts 私有常量交叉钉住", () => {
  const spec = docFormatSpecText("mcp-declaration/v1");
  for (const key of ["用途", "启动", "参数", "环境", "适用角色", "状态", "安装日期"]) {
    assert.ok(spec.includes(key), `规范必须包含七键之一：${key}`);
  }
  assert.ok(spec.includes("installed") && spec.includes("uninstalled"), "状态枚举钉住");
  assert.ok(spec.includes("ans/ans_codex"), "保留名钉住");
  assert.ok(spec.includes("[A-Za-z0-9_-]+"), "name 字符集钉住");
  // 私有常量未导出：读源码文本钉住（text-shape；公开读取器行为在 mcp-declarations.test.ts 已逐项覆盖）。
  const source = readFileSync(path.join(REPO_ROOT, "src", "common", "runtime-core", "mcp-declarations.ts"), "utf8");
  assert.ok(source.includes('const RESERVED_NAMES: readonly string[] = ["ans", "ans_codex"];'), "RESERVED_NAMES 与规范一致");
  assert.ok(source.includes("const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;"), "NAME_PATTERN 与规范一致");
  assert.ok(source.includes("const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;"), "ENV_NAME_PATTERN（env 名）钉住");
  assert.ok(spec.includes("env:NAME"), "env 引用形态钉住");
  // 行为交叉：保留名/名非法/env 名非法 ⇒ undefined（与既有 mcp-declarations.test.ts 同口径）。
  const root = mkdtempSync(path.join(os.tmpdir(), "ans-doc-format-mcp-pin-"));
  try {
    mkdirSync(path.join(root, "docs", "mcp"), { recursive: true });
    const text = (name: string, env?: string): string => ["# MCP 声明：" + name, "- 用途：p", "- 启动：node", ...(env !== undefined ? ["- 环境：" + env] : []), "- 适用角色：X", "- 状态：installed", "- 安装日期：2026-11-09", ""].join("\n");
    writeFileSync(path.join(root, "docs", "mcp", "ans.md"), text("ans"));
    writeFileSync(path.join(root, "docs", "mcp", "bad.name.md"), text("bad.name"));
    writeFileSync(path.join(root, "docs", "mcp", "envbad.md"), text("envbad", "1TOKEN=value"));
    writeFileSync(path.join(root, "docs", "mcp", "ok.md"), text("ok", "TOKEN=env:REF"));
    assert.equal(readMcpDeclaration(root, "ans"), undefined, "保留名拒绝");
    assert.equal(readMcpDeclaration(root, "bad.name"), undefined, "name 字符集拒绝");
    assert.equal(readMcpDeclaration(root, "envbad"), undefined, "env 名非法拒绝");
    assert.equal(readMcpDeclaration(root, "ok")?.status, "installed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ———————————————— 7. 预算：正常路径 ≤8192 B；超限数据源 ⇒ 工具层截断并标注 ————————————————

test("TM-11 预算：索引/详情正常路径 ≤8192 B（实测固定值入消息）；数据源超限由工具层截断并标注", async (t) => {
  const indexBytes = Buffer.byteLength(docFormatIndexText(), "utf8");
  let maxDetailBytes = 0;
  let maxDetailId = "";
  for (const spec of DOC_FORMAT_SPECS) {
    const bytes = Buffer.byteLength(docFormatSpecText(spec.id), "utf8");
    if (bytes > maxDetailBytes) { maxDetailBytes = bytes; maxDetailId = spec.id; }
    assert.ok(bytes <= 8192, `${spec.id} 详情超 8192 B（实际 ${bytes}）`);
  }
  t.diagnostic(`预算实测：索引 ${indexBytes} B；最大详情 ${maxDetailBytes} B（${maxDetailId}）`);
  assert.ok(indexBytes <= 8192, `索引超 8192 B（实际 ${indexBytes}）`);
  assert.ok(maxDetailBytes <= 8192, `详情超 8192 B（实际 ${maxDetailBytes}）`);
  // 超限数据源：工具层防御性截断并附「已截断；用 part=fields|example|errors 缩小范围」，绝不静默返回半截。
  const oversized = "x".repeat(9000);
  const tool = toolMap({ docFormat: () => oversized }).get(DOC_FORMAT_TOOL_NAME)!;
  const result = await tool.handler(call({}));
  assert.equal(result.ok, true);
  const bytes = Buffer.byteLength(result.message, "utf8");
  assert.ok(bytes <= 8192, `工具输出超 8192 B（实际 ${bytes}）`);
  assert.ok(result.message.endsWith("\n…（已截断；用 part=fields|example|errors 缩小范围）"), "必须带截断标注");
  // 多字节边界：按 UTF-8 字节截断不得劈开码点（输出仍是合法字符串且重新编码字节数不变）。
  const multibyte = "文".repeat(3000); // 9000 B
  const multibyteTool = toolMap({ docFormat: () => multibyte }).get(DOC_FORMAT_TOOL_NAME)!;
  const multibyteResult = await multibyteTool.handler(call({}));
  assert.equal(multibyteResult.ok, true);
  assert.ok(Buffer.byteLength(multibyteResult.message, "utf8") <= 8192);
  assert.ok(!multibyteResult.message.includes("�"), "截断不得产生替换字符");
});
