import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type RequestBoundaryChangeFn,
  type RequestBoundaryChangeInput,
  type RequestBoundaryChangeResult,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import { REQUEST_BOUNDARY_CHANGE_TOOL_NAME, buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const call = (args: Record<string, unknown>) => ({ name: REQUEST_BOUNDARY_CHANGE_TOOL_NAME, args });
const dispatched: RequestBoundaryChangeResult = {
  ok: true,
  code: "dispatched",
  message: "已派发给人事 Crew",
  roleId: "worker-a",
  ticketId: "ticket-1",
};

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("未注入 requestBoundaryChange ⇒ request_boundary_change 不注册（结构性 fail-closed）", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(REQUEST_BOUNDARY_CHANGE_TOOL_NAME), false);
});

test("注入后注册 request_boundary_change；参数 roleId/rationale 必填，路径数组与 flowId 可选", () => {
  const fn: RequestBoundaryChangeFn = async () => dispatched;
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { requestBoundaryChange: fn });

  // 只新增这一只工具；既有工具的 schema/描述/显示规则/执行模式逐个保持不变。
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REQUEST_BOUNDARY_CHANGE_TOOL_NAME], "注入 requestBoundaryChange 只新增 request_boundary_change");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }

  const desc = describeTool(REQUEST_BOUNDARY_CHANGE_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["roleId", "rationale"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string; items?: { type?: string } }>;
  assert.deepEqual(Object.keys(props).sort(), ["addPaths", "flowId", "rationale", "removePaths", "roleId"]);
  assert.equal(props.roleId.type, "string");
  assert.equal(props.rationale.type, "string");
  assert.equal(props.flowId.type, "string");
  assert.equal(props.addPaths.type, "array");
  assert.equal(props.addPaths.items?.type, "string");
  assert.equal(props.removePaths.type, "array");
  assert.equal(props.removePaths.items?.type, "string");
  // 文案钉点：用途（写集/边界不足）、只提交精确增删路径与理由、不重写整个边界、组队派发、
  // appointment-write/客户确认、不代表客户批准、回执如实转达 ok/code/message、失败不伪装成功。
  for (const need of [
    /边界/,
    /精确/,
    /至少一个非空/,
    /不要重写整个边界/,
    /人事/,
    /appointment-write/,
    /AI 门禁/,
    /rejected/,
    /不自动放行/,
    /不代表客户拒绝/,
    /不代表客户批准/,
    /ok/,
    /code/,
    /message/,
    /绝不伪装成功/,
  ]) {
    assert.match(desc.description, need);
  }
  assert.match((desc.promptGuidelines ?? []).join("\n"), /客户批准/);
  assert.match((desc.promptGuidelines ?? []).join("\n"), /精确/);
});

test("载荷原样交给注入能力：增删数组去重、缺省键不造键", async () => {
  const received: RequestBoundaryChangeInput[] = [];
  const fn: RequestBoundaryChangeFn = async (input) => { received.push(input); return dispatched; };
  const tool = toolMap({ requestBoundaryChange: fn }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;

  const onlyAdd = await tool.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "缺少写权" }));
  assert.equal(onlyAdd.ok, true);
  const onlyRemove = await tool.handler(call({ roleId: "worker-a", removePaths: ["src/old.ts"], rationale: "不再需要" }));
  assert.equal(onlyRemove.ok, true);
  const both = await tool.handler(call({
    roleId: "worker-b",
    addPaths: ["src/a.ts", "src/a.ts", "src/b.ts"],
    removePaths: ["src/c.ts", "src/c.ts"],
    rationale: "边界不足",
    flowId: "flow-a",
  }));
  assert.equal(both.ok, true);
  // 空数组等价于未提供（不造键、不触达能力前拒绝：另一侧非空即可）。
  const emptyAdd = await tool.handler(call({ roleId: "worker-a", addPaths: [], removePaths: ["src/c.ts"], rationale: "仅移除" }));
  assert.equal(emptyAdd.ok, true);

  assert.deepEqual(received, [
    { roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "缺少写权" },
    { roleId: "worker-a", removePaths: ["src/old.ts"], rationale: "不再需要" },
    { roleId: "worker-b", addPaths: ["src/a.ts", "src/b.ts"], removePaths: ["src/c.ts"], rationale: "边界不足", flowId: "flow-a" },
    { roleId: "worker-a", removePaths: ["src/c.ts"], rationale: "仅移除" },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(received[0], "removePaths"), false, "缺省 removePaths 不得凭空造键");
  assert.equal(Object.prototype.hasOwnProperty.call(received[0], "flowId"), false, "缺省 flowId 不得凭空造键");
  assert.equal(Object.prototype.hasOwnProperty.call(received[1], "addPaths"), false, "缺省 addPaths 不得凭空造键");
  assert.equal(Object.prototype.hasOwnProperty.call(received[1], "flowId"), false, "缺省 flowId 不得凭空造键");
  assert.equal(Object.prototype.hasOwnProperty.call(received[3], "addPaths"), false, "空 addPaths 数组等价未提供，不造键");
});

test("非法参数在触达能力前拒绝（空 roleId/rationale、无增删、绝对路径/`..`、非数组元素）", async () => {
  let calls = 0;
  const fn: RequestBoundaryChangeFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestBoundaryChange: fn }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;

  const invalid: Record<string, unknown>[] = [
    {},
    { rationale: "理由" },
    { roleId: "", rationale: "理由" },
    { roleId: "   ", rationale: "理由" },
    { roleId: "worker-a" },
    { roleId: "worker-a", rationale: "" },
    { roleId: "worker-a", rationale: "   " },
    { roleId: "worker-a", rationale: "理由" },
    { roleId: "worker-a", rationale: "理由", addPaths: [], removePaths: [] },
    { roleId: "worker-a", rationale: "理由", addPaths: "/etc/passwd" },
    { roleId: "worker-a", rationale: "理由", addPaths: "src/a.ts" },
    { roleId: "worker-a", rationale: "理由", addPaths: ["C:\\abs\\a.ts"] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["C:/abs/a.ts"] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["\\\\server\\share\\a.ts"] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["../outside.ts"] },
    { roleId: "worker-a", rationale: "理由", removePaths: ["src/../../outside.ts"] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["src/.."] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["src\\..\\a.ts"] },
    { roleId: "worker-a", rationale: "理由", addPaths: "src/a.ts", flowId: 42 },
    { roleId: "worker-a", rationale: "理由", addPaths: "src/a.ts", removePaths: 42 },
    { roleId: "worker-a", rationale: "理由", addPaths: [42] },
    { roleId: "worker-a", rationale: "理由", addPaths: [""] },
    { roleId: "worker-a", rationale: "理由", addPaths: ["   "] },
  ];
  for (const args of invalid) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");

  const absolute = await tool.handler(call({ roleId: "worker-a", rationale: "理由", addPaths: ["C:/abs/a.ts"] }));
  assert.match(absolute.message, /绝对路径|盘符/);
  const traversal = await tool.handler(call({ roleId: "worker-a", rationale: "理由", addPaths: ["src/../a.ts"] }));
  assert.match(traversal.message, /\.\./);
});

test("回执原样转达 ok/code/message（成功不夸大、失败不伪装）", async () => {
  const success = toolMap({ requestBoundaryChange: async () => dispatched }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
  const ok = await success.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "缺少写权" }));
  assert.equal(ok.ok, true);
  assert.match(ok.message, /ok=true/);
  assert.match(ok.message, /code=dispatched/);
  assert.match(ok.message, /已派发给人事 Crew/);
  assert.match(ok.message, /roleId=worker-a/);
  assert.match(ok.message, /ticketId=ticket-1/);
  assert.match(ok.message, /≠ 客户批准/, "成功文案必须重申请求变更 ≠ 客户批准");
  assert.match(ok.message, /appointment-write/);
  assert.match(ok.message, /不代表边界已修改/);

  const failures: RequestBoundaryChangeResult[] = [
    { ok: false, code: "already-dispatched", message: "此前已派发（ticket-1）" },
    { ok: false, code: "rejected", message: "AI 门禁审核拒绝（deny）：未派发给人事，不自动放行" },
    { ok: false, code: "invalid-role", message: "未知项目角色 worker-x" },
    { ok: false, code: "invalid-path", message: "路径不在项目内：../outside.ts" },
    { ok: false, code: "no-change", message: "边界已包含这些路径" },
    { ok: false, code: "unavailable", message: "人事派发通道不可用" },
  ];
  for (const receipt of failures) {
    const tool = toolMap({ requestBoundaryChange: async () => receipt }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
    const result = await tool.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "理由" }));
    assert.equal(result.ok, false, `ok:false 必须原样转达：${receipt.code}`);
    assert.match(result.message, /ok=false/);
    assert.match(result.message, new RegExp(`code=${receipt.code}`));
    assert.ok(result.message.includes(receipt.message), `回执 message 必须原样出现：${receipt.code}`);
    assert.match(result.message, /不要当已派发/);
  }

  // already-dispatched 若应用回 ok:true，同样如实转达（是否成功只看 ok，不替应用改判）。
  const already = toolMap({
    requestBoundaryChange: async () => ({ ok: true, code: "already-dispatched", message: "此前已派发（ticket-1）", ticketId: "ticket-1" }),
  }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
  const alreadyResult = await already.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "理由" }));
  assert.equal(alreadyResult.ok, true);
  assert.match(alreadyResult.message, /code=already-dispatched/);
  assert.match(alreadyResult.message, /此前已派发/);
  assert.match(alreadyResult.message, /未重复派发/);
});

test("rejected 回执原样转达：AI 门禁退回运营、不自动放行、不代表客户拒绝", async () => {
  const receipt: RequestBoundaryChangeResult = {
    ok: false,
    code: "rejected",
    message: "AI 门禁审核拒绝（deny）：新增路径与申请理由不匹配，未派发给人事；不自动放行。",
    roleId: "worker-a",
  };
  const tool = toolMap({ requestBoundaryChange: async () => receipt }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
  const result = await tool.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "缺少写权" }));
  assert.equal(result.ok, false, "rejected 不得回执成功");
  assert.match(result.message, /ok=false/);
  assert.match(result.message, /code=rejected/);
  assert.match(result.message, /roleId=worker-a/);
  assert.ok(result.message.includes(receipt.message), "回执 message 必须原样出现");
  assert.match(result.message, /不自动放行/);
  assert.match(result.message, /不代表客户拒绝/);
  assert.match(result.message, /不要当已派发/);
});

test("能力抛错 / 契约外回执 ⇒ fail-closed，绝不说成已派发", async () => {
  const thrown = toolMap({
    requestBoundaryChange: async () => { throw new Error("人事派发 handler 不可用"); },
  }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
  const failed = await thrown.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "理由" }));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /人事派发 handler 不可用/);
  assert.match(failed.message, /不要当已派发/);

  const invalidReceipts: unknown[] = [
    undefined,
    null,
    42,
    [],
    {},
    { ok: "yes", code: "dispatched", message: "x" },
    { ok: false, code: "unknown-code", message: "x" },
    { ok: true, code: "dispatched", message: "" },
    { ok: true, code: "dispatched" },
  ];
  for (const receipt of invalidReceipts) {
    const tool = toolMap({ requestBoundaryChange: async () => receipt as never }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
    const result = await tool.handler(call({ roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "理由" }));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
    assert.match(result.message, /不要当已派发/);
  }
});

test("会话中止：不假设已派发（能力不触达，文案如实）", async () => {
  let calls = 0;
  const fn: RequestBoundaryChangeFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestBoundaryChange: fn }).get(REQUEST_BOUNDARY_CHANGE_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler({ name: REQUEST_BOUNDARY_CHANGE_TOOL_NAME, args: { roleId: "worker-a", addPaths: ["src/a.ts"], rationale: "理由" }, signal: controller.signal });
  assert.equal(result.ok, false);
  assert.match(result.message, /未完成|未获结果/);
  assert.match(result.message, /不要当已派发/);
  assert.equal(calls, 0, "中止后不得触达能力");
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

test("Service 透传：注入 requestBoundaryChange 后 provider 工具面包含 request_boundary_change；未注入则不出现", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-request-boundary-change-"));
  const captured: RuntimeProviderOptions[] = [];
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestBoundaryChange: async () => dispatched,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(captured.length, 1);
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REQUEST_BOUNDARY_CHANGE_TOOL_NAME),
      true,
      "Service 必须透传 request_boundary_change",
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
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REQUEST_BOUNDARY_CHANGE_TOOL_NAME),
      false,
      "未注入时不得出现 request_boundary_change",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
