import assert from "node:assert/strict";
import { test } from "node:test";
import * as z from "zod";
import { toClaudeSchema } from "../../src/common/claude-adapter/schema.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";

const compile = (schema: Record<string, unknown>): z.ZodType => toClaudeSchema(schema, z);

function expects(schema: z.ZodType, value: unknown, accepted: boolean, label: string) {
  const result = schema.safeParse(value);
  assert.equal(result.success, accepted, `${label}: ${result.success ? "unexpectedly accepted" : JSON.stringify(result.error.issues)}`);
  return result;
}

function rejectedPaths(schema: z.ZodType, value: unknown, label: string): Array<Array<string | number>> {
  const result = schema.safeParse(value);
  assert.equal(result.success, false, `${label}: unexpectedly accepted`);
  return result.error!.issues.map((issue) => issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))));
}

test("直接 if/then/else：命中执行 then，未命中执行 else，两侧反例都拒绝", () => {
  const schema = compile({
    type: "object",
    properties: {
      mode: { type: "string", enum: ["a", "b"] },
      value: { type: "string" },
    },
    required: ["mode"],
    additionalProperties: true,
    allOf: [{
      if: { properties: { mode: { const: "a" } } },
      then: { required: ["value"] },
      else: { properties: { value: { maxLength: 2 } } },
    }],
  });
  expects(schema, { mode: "a", value: "long" }, true, "then 命中且满足");
  expects(schema, { mode: "a" }, false, "then 命中但缺 value");
  expects(schema, { mode: "b" }, true, "else 未触发（value 缺席）");
  expects(schema, { mode: "b", value: "ok" }, true, "else 满足 maxLength");
  expects(schema, { mode: "b", value: "long" }, false, "else 违反 maxLength");
  // 条件只追加约束，不放宽基础 schema。
  expects(schema, { value: "x" }, false, "基础 required 仍然生效");
  expects(schema, { mode: "a", value: 5 }, false, "基础类型约束仍然生效");
});

test("if 无 else：未命中保持原行为；then 仅追加约束", () => {
  const schema = compile({
    type: "object",
    properties: { a: { type: "string" }, b: { type: "string" } },
    additionalProperties: true,
    allOf: [{ if: { required: ["a"] }, then: { required: ["b"] } }],
  });
  expects(schema, {}, true, "if 未命中，无 then 约束");
  expects(schema, { a: "x", b: "y" }, true, "if 命中且满足 then");
  expects(schema, { a: "x" }, false, "if 命中但缺 then 必填");
});

test("not 反向语义：单条 required 与 anyOf 组合都强制执行（含嵌套路径）", () => {
  const direct = compile({ type: "object", properties: {}, additionalProperties: true, not: { required: ["forbidden"] } });
  expects(direct, { forbidden: 1 }, false, "not 命中即拒绝");
  expects(direct, { other: 1 }, true, "not 未命中即通过");

  const composed = compile({
    type: "object",
    properties: {},
    additionalProperties: true,
    not: { anyOf: [{ required: ["a"] }, { required: ["b"] }] },
  });
  expects(composed, {}, true, "两个被禁键都不存在");
  expects(composed, { a: 1 }, false, "第一个被禁键存在");
  expects(composed, { b: 1 }, false, "第二个被禁键存在");
  expects(composed, { a: 1, b: 1 }, false, "两个被禁键同时存在");

  const nested = compile({
    type: "object",
    properties: {
      inner: {
        type: "object",
        properties: {},
        additionalProperties: true,
        not: { required: ["forbidden"] },
      },
    },
    additionalProperties: true,
  });
  expects(nested, { inner: { forbidden: true } }, false, "嵌套 not 拒绝");
  expects(nested, { inner: {} }, true, "嵌套 not 通过");
});

test("条件约束覆盖嵌套 properties、数组 items 与 additionalProperties", () => {
  const condition = {
    if: { properties: { mode: { const: "a" } } },
    then: { required: ["detail"] },
  };
  const schema = compile({
    type: "object",
    properties: {
      inner: {
        type: "object",
        properties: { mode: { type: "string" }, detail: { type: "string" } },
        required: ["mode"],
        additionalProperties: true,
        allOf: [condition],
      },
      list: {
        type: "array",
        items: {
          type: "object",
          properties: { mode: { type: "string" }, detail: { type: "string" } },
          required: ["mode"],
          additionalProperties: true,
          allOf: [condition],
        },
      },
    },
    additionalProperties: {
      type: "object",
      properties: { mode: { type: "string" }, detail: { type: "string" } },
      required: ["mode"],
      additionalProperties: true,
      allOf: [condition],
    },
  });
  expects(schema, { inner: { mode: "a", detail: "d" } }, true, "嵌套属性命中 then 且满足");
  expects(schema, { inner: { mode: "a" } }, false, "嵌套属性命中 then 但缺 detail");
  assert.deepEqual(rejectedPaths(schema, { inner: { mode: "a" } }, "嵌套路径"), [["inner"]]);
  expects(schema, { list: [{ mode: "b" }, { mode: "a", detail: "d" }] }, true, "数组各项均满足");
  expects(schema, { list: [{ mode: "b" }, { mode: "a" }] }, false, "数组第二项违反 then");
  assert.deepEqual(rejectedPaths(schema, { list: [{ mode: "b" }, { mode: "a" }] }, "数组路径"), [["list", 1]]);
  expects(schema, { extra: { mode: "a" } }, false, "additionalProperties 命中 then 但缺 detail");
  expects(schema, { extra: { mode: "b" } }, true, "additionalProperties 未命中条件");
  assert.deepEqual(rejectedPaths(schema, { extra: { mode: "a" } }, "额外属性路径"), [["extra"]]);
});

test("真实 git_query/git_candidate/git_publish：oid 按 objectFormat 强制 sha1 40 位 / sha256 64 位", () => {
  const hex = (length: number) => "a".repeat(length);
  const oid = (objectFormat: string, length: number) => ({ objectFormat, hex: hex(length) });

  const query = toClaudeSchema(describeTool("git_query").parameters, z);
  const template = (describeTool("git_query").parameters.properties as Record<string, Record<string, unknown>>).template.enum as string[];
  const queryArgs = (objectFormat: string, length: number) => ({ operationId: "op", template: template[0], target: oid(objectFormat, length) });
  expects(query, queryArgs("sha1", 40), true, "git_query sha1/40");
  expects(query, queryArgs("sha256", 64), true, "git_query sha256/64");
  assert.deepEqual(rejectedPaths(query, queryArgs("sha1", 64), "git_query sha1/64"), [["target"]]);
  assert.deepEqual(rejectedPaths(query, queryArgs("sha256", 40), "git_query sha256/40"), [["target"]]);

  const candidate = toClaudeSchema(describeTool("git_candidate").parameters, z);
  const commit = (objectFormat: string, length: number, nullable: boolean) => ({
    operationId: "op",
    base: { ref: "main", oid: nullable ? null : oid(objectFormat, length) },
    message: "message",
    action: "commit",
    paths: ["src/a.ts"],
  });
  expects(candidate, commit("sha1", 40, false), true, "git_candidate commit sha1/40");
  expects(candidate, commit("sha1", 0, true), true, "git_candidate commit 允许 null oid");
  expects(candidate, commit("sha1", 64, false), false, "git_candidate commit sha1/64");
  expects(candidate, { operationId: "op", base: { ref: "main", oid: null }, message: "m", action: "integrate", candidates: [oid("sha256", 64)] }, true, "git_candidate integrate sha256/64");
  expects(candidate, { operationId: "op", base: { ref: "main", oid: null }, message: "m", action: "integrate", candidates: [oid("sha256", 40)] }, false, "git_candidate integrate sha256/40");

  const publish = toClaudeSchema(describeTool("git_publish").parameters, z);
  const publishArgs = (objectFormat: string, length: number) => ({
    operationId: "op",
    target: "documents",
    expected: { ref: "main", oid: null },
    candidate: oid(objectFormat, length),
    criteria: [],
    evidence: [],
  });
  expects(publish, publishArgs("sha1", 40), true, "git_publish candidate sha1/40");
  expects(publish, publishArgs("sha1", 64), false, "git_publish candidate sha1/64");
  expects(publish, publishArgs("sha256", 64), true, "git_publish candidate sha256/64");
  expects(publish, publishArgs("sha256", 40), false, "git_publish candidate sha256/40");
});

test("真实 dispatch_task：reviewOid 与 resumeController 条件均被强制执行", () => {
  const schema = toClaudeSchema(describeTool("dispatch_task").parameters, z);
  const hex = (length: number) => "a".repeat(length);
  const review = (objectFormat: string, length: number) => ({
    roleId: "verifier",
    task: "review",
    reviewTarget: { operationId: "op", candidate: { objectFormat, hex: hex(length) } },
  });
  expects(schema, { roleId: "worker", task: "ordinary" }, true, "普通派发");
  expects(schema, review("sha1", 40), true, "review sha1/40");
  expects(schema, review("sha256", 64), true, "review sha256/64");
  assert.deepEqual(rejectedPaths(schema, review("sha1", 64), "review sha1/64"), [["reviewTarget", "candidate"]]);
  assert.deepEqual(rejectedPaths(schema, review("sha256", 40), "review sha256/40"), [["reviewTarget", "candidate"]]);
  // 根级 not：历史 host 字段一律禁止（不得被条件转换吞掉）。
  assert.deepEqual(rejectedPaths(schema, { roleId: "worker", task: "x", workSourceRef: {} }, "root not"), [[]]);

  const resume = { taskId: "task", flowId: "flow", runId: "run", reviewTaskId: "review", reviewCloseOperationId: "close" };
  expects(schema, { roleId: "convener", task: "resume", resumeController: resume }, true, "resumeController ⇒ convener");
  expects(schema, { roleId: "worker", task: "resume", resumeController: resume }, false, "resumeController 强制 convener");
  expects(schema, { roleId: "convener", task: "resume", resumeController: resume, reviewTarget: review("sha1", 40).reviewTarget }, false, "resumeController 禁止 reviewTarget");
  expects(schema, { roleId: "convener", task: "resume", resumeController: resume, sourceTaskId: "legacy" }, false, "resumeController 禁止 sourceTaskId");
});

test("真实 decide_pending_request：disposition 条件（select⇒selected；reject/revise⇒无 selected）", () => {
  const schema = toClaudeSchema(describeTool("decide_pending_request").parameters, z);
  const base = { requestId: "req", baseDigest: "a".repeat(64), delegationRevision: 0, reason: "why" };
  expects(schema, { ...base, disposition: "select", selected: ["opt"] }, true, "select 携带 selected");
  expects(schema, { ...base, disposition: "select" }, false, "select 缺少 selected");
  expects(schema, { ...base, disposition: "reject" }, true, "reject 不携带 selected");
  expects(schema, { ...base, disposition: "revise" }, true, "revise 不携带 selected");
  expects(schema, { ...base, disposition: "reject", selected: ["opt"] }, false, "reject 携带 selected");
  expects(schema, { ...base, disposition: "revise", selected: ["opt"] }, false, "revise 携带 selected");
});

test("真实 submit_version_change：if 内 contains 与 then 全体目标 expectedFromSha256 条件", () => {
  const schema = toClaudeSchema(describeTool("submit_version_change").parameters, z);
  const digest = "a".repeat(64);
  const trunk = { version: 1, digest };
  const target = (extra: Record<string, unknown> = {}) => ({ kind: "contract", path: "docs/contracts/x-v1.md", action: "add", ...extra });
  const base = { kind: "version-upgrade", flowId: "flow", summary: "summary", targets: [target()] };
  expects(schema, base, true, "无任何直接提交迹象");
  expects(schema, { ...base, operationId: "op" }, false, "仅 operationId 触发 then");
  expects(schema, { ...base, operationId: "op", baseTrunk: trunk }, false, "then 还要求每个目标带 expectedFromSha256");
  expects(schema, {
    ...base,
    operationId: "op",
    baseTrunk: trunk,
    targets: [target({ expectedFromSha256: digest })],
  }, true, "直接提交完整满足");
  expects(schema, { ...base, targets: [target({ expectedFromSha256: digest })] }, false, "仅逐目标 hash 也触发 then");
  expects(schema, {
    ...base,
    operationId: "op",
    baseTrunk: trunk,
    targets: [target({ expectedFromSha256: digest }), target()],
  }, false, "then 要求全部目标都带 expectedFromSha256");
});

test("未知关键字与非法条件片段仍被拒绝（不静默丢弃约束）", () => {
  for (const keyword of ["patternProperties", "$ref", "dependencies", "propertyNames", "additionalItems"]) {
    assert.throws(() => compile({ type: "object", [keyword]: {} }), /unsupported JSON Schema keyword/, keyword);
  }
  // contains 只在条件片段内受支持；基础 schema 直接使用仍视为未知约束。
  assert.throws(() => compile({ type: "object", contains: { required: ["a"] } }), /unsupported JSON Schema keyword contains/);
  // 条件片段内的未知关键字同样拒绝。
  assert.throws(() => compile({ type: "object", allOf: [{ if: { required: ["a"], custom: 1 }, then: { required: ["b"] } }] }), /unsupported JSON Schema keyword custom/);
  assert.throws(() => compile({ type: "object", anyOf: [] }), /invalid anyOf/);
  assert.throws(() => compile({ type: "object", required: ["unknown"] }), /required must name declared properties/);
  assert.throws(() => compile({ type: "object", properties: { invalid: { type: "unsupported-type" } } }), /unsupported JSON Schema type/);
  assert.throws(() => compile({ type: "object", allOf: [{ if: [], then: {} }] }), /invalid JSON Schema/);
  assert.throws(() => compile({ type: "object", allOf: [{ if: {}, then: 5 }] }), /invalid JSON Schema/);
  assert.throws(() => compile({ type: "object", not: "nope" }), /invalid JSON Schema/);
});

test("无条件的旧 schema 行为与 z.fromJSONSchema 完全一致", () => {
  const plain = {
    type: "object",
    properties: {
      value: { anyOf: [{ type: "string" }, { type: "number" }] },
      maybe: { type: "boolean" },
      nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    },
    required: ["value"],
    additionalProperties: true,
  };
  const converted = compile(plain);
  const direct = z.fromJSONSchema(plain as unknown as Parameters<typeof z.fromJSONSchema>[0]);
  const values: unknown[] = [
    { value: 2, extension: "kept" },
    { value: "x", nested: { id: "y" } },
    { maybe: true },
    { value: true },
    { value: 1, nested: {} },
    { value: 1, maybe: "bad" },
    {},
  ];
  for (const value of values) {
    assert.equal(converted.safeParse(value).success, direct.safeParse(value).success, JSON.stringify(value));
  }
  assert.deepEqual(converted.parse({ value: 2, extension: "kept" }), direct.parse({ value: 2, extension: "kept" }));
});
