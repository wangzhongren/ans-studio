import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type RequestAcceptanceFn,
  type RequestAcceptanceInput,
  type RequestAcceptanceResult,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type RoleSession,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import { REQUEST_ACCEPTANCE_TOOL_NAME, buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const call = (args: Record<string, unknown>) => ({ name: REQUEST_ACCEPTANCE_TOOL_NAME, args });
const dispatched: RequestAcceptanceResult = { ok: true, code: "dispatched", message: "已派发 Proof" };

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("未注入 requestAcceptance ⇒ request_acceptance 不注册（结构性 fail-closed）", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(REQUEST_ACCEPTANCE_TOOL_NAME), false);
});

test("注入后注册 request_acceptance；参数 flowId/note 均可选、无必填、不接受未知参数", () => {
  const fn: RequestAcceptanceFn = async () => dispatched;
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { requestAcceptance: fn });

  // 只新增这一只工具；既有工具的 schema/描述/显示规则/执行模式逐个保持不变。
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REQUEST_ACCEPTANCE_TOOL_NAME], "注入 requestAcceptance 只新增 request_acceptance");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }

  const desc = describeTool(REQUEST_ACCEPTANCE_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, []);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string }>;
  assert.deepEqual(Object.keys(props).sort(), ["flowId", "note"]);
  assert.equal(props.flowId.type, "string");
  assert.equal(props.note.type, "string");
  // 文案钉点：用途（交付/证据/变更包就绪后派独立复核）、不改客户决定/不代表客户批准/不写 flow/账本、
  // 回执如实转达 ok/code/message、失败不伪装成功。
  for (const need of [/独立复核/, /交付/, /变更包/, /不代表客户批准/, /不写 flow\/账本/, /ok/, /code/, /message/, /绝不伪装成功/]) {
    assert.match(desc.description, need);
  }
  assert.match((desc.promptGuidelines ?? []).join("\n"), /客户批准/);
});

test("载荷原样交给注入能力：flowId/note 均可省略，给出原样透传，缺省键不造", async () => {
  const received: RequestAcceptanceInput[] = [];
  const fn: RequestAcceptanceFn = async (input) => { received.push(input); return dispatched; };
  const tool = toolMap({ requestAcceptance: fn }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;

  assert.equal((await tool.handler(call({}))).ok, true);
  assert.equal((await tool.handler(call({ flowId: "flow-a" }))).ok, true);
  assert.equal((await tool.handler(call({ note: "证据已就绪" }))).ok, true);
  assert.equal((await tool.handler(call({ flowId: "flow-b", note: "交付完成" }))).ok, true);
  // 空白 flowId 视作缺省＝当前流程（沿 flow_get 先例），不触达能力前拒绝。
  assert.equal((await tool.handler(call({ flowId: "  " }))).ok, true);

  assert.deepEqual(received, [
    {},
    { flowId: "flow-a" },
    { note: "证据已就绪" },
    { flowId: "flow-b", note: "交付完成" },
    {},
  ]);
  for (const omitted of ["flowId", "note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[0], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
});

test("非法参数在触达能力前拒绝（flowId 非字符串 / note 非字符串或空白）", async () => {
  let calls = 0;
  const fn: RequestAcceptanceFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestAcceptance: fn }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  for (const args of [{ flowId: 42 }, { flowId: { id: "flow-a" } }, { note: 42 }, { note: true }, { note: "" }, { note: "   " }]) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `非法参数必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "非法参数不得触达注入能力");
});

test("回执原样转达 ok/code/message（成功不夸大、失败不伪装）", async () => {
  const success = toolMap({
    requestAcceptance: async () => ({ ok: true, code: "dispatched", message: "已派发 Proof（runtime: claude）", flowId: "flow-a", runtime: "claude" }),
  }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const ok = await success.handler(call({ flowId: "flow-a" }));
  assert.equal(ok.ok, true);
  assert.match(ok.message, /ok=true/);
  assert.match(ok.message, /code=dispatched/);
  assert.match(ok.message, /已派发 Proof（runtime: claude）/);
  assert.match(ok.message, /flowId=flow-a/);
  assert.match(ok.message, /runtime=claude/);
  assert.match(ok.message, /≠ 客户批准/, "成功文案必须重申请求复核 ≠ 客户批准");

  const failures: RequestAcceptanceResult[] = [
    { ok: false, code: "flow-not-found", message: "未找到流程 flow-x" },
    { ok: false, code: "criteria-missing", message: "缺少验收标准" },
    { ok: false, code: "change-package-missing", message: "缺少变更包" },
    { ok: false, code: "change-package-no-risk", message: "变更包未声明风险档" },
    { ok: false, code: "flow-incomplete", message: "流程步骤未完成" },
    { ok: false, code: "runtime-unresolved", message: "无法确定运行时" },
    { ok: false, code: "already-dispatched", message: "此前已派发" },
    { ok: false, code: "unavailable", message: "应用 handler 不可用" },
  ];
  for (const receipt of failures) {
    const tool = toolMap({ requestAcceptance: async () => receipt }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
    const result = await tool.handler(call({}));
    assert.equal(result.ok, false, `ok:false 必须原样转达：${receipt.code}`);
    assert.match(result.message, /ok=false/);
    assert.match(result.message, new RegExp(`code=${receipt.code}`));
    assert.ok(result.message.includes(receipt.message), `回执 message 必须原样出现：${receipt.code}`);
    assert.match(result.message, /不要当已派发/);
  }

  // already-dispatched 若应用回 ok:true，同样如实转达（是否成功只看 ok，不替应用改判）。
  const already = toolMap({ requestAcceptance: async () => ({ ok: true, code: "already-dispatched", message: "此前已派发" }) }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const alreadyResult = await already.handler(call({}));
  assert.equal(alreadyResult.ok, true);
  assert.match(alreadyResult.message, /code=already-dispatched/);
});

test("有界超时回执（2026-10-25 真机缺陷）：ok:false + unavailable 不伪装成功；提示 flow_get 核对", async () => {
  const timeoutReceipt: RequestAcceptanceResult = {
    ok: false,
    code: "unavailable",
    flowId: "flow-timeout",
    message: "已受理独立复核请求，但验收复核派发确认回执超时（约 60s 未返回）；**可能已派发/正在处理**，请用 flow_get 核对流程与治理账本，不要重复请求；本次不声称已派发。",
  };
  const tool = toolMap({ requestAcceptance: async () => timeoutReceipt }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const result = await tool.handler(call({ flowId: "flow-timeout" }));
  assert.equal(result.ok, false, "超时不得回执成功");
  assert.match(result.message, /code=unavailable/);
  assert.match(result.message, /超时/);
  assert.match(result.message, /可能已派发/);
  assert.match(result.message, /flow_get/);
  assert.match(result.message, /不要当已派发/);
});

test("能力抛错 / 契约外回执 ⇒ fail-closed，绝不说成已派发", async () => {
  const thrown = toolMap({ requestAcceptance: async () => { throw new Error("请求验收 handler 不可用"); } }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const failed = await thrown.handler(call({}));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /未完成/);
  assert.match(failed.message, /请求验收 handler 不可用/);
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
    const tool = toolMap({ requestAcceptance: async () => receipt as never }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
    const result = await tool.handler(call({}));
    assert.equal(result.ok, false, `契约外回执 ${JSON.stringify(receipt)} 必须 fail-closed`);
    assert.match(result.message, /未返回明确结果/);
    assert.match(result.message, /不要当已派发/);
  }
});

test("会话中止：不假设已派发（能力不触达，文案如实）", async () => {
  let calls = 0;
  const fn: RequestAcceptanceFn = async () => { calls += 1; return dispatched; };
  const tool = toolMap({ requestAcceptance: fn }).get(REQUEST_ACCEPTANCE_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler({ name: REQUEST_ACCEPTANCE_TOOL_NAME, args: {}, signal: controller.signal });
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

test("Service 透传：注入 requestAcceptance 后 provider 工具面包含 request_acceptance；未注入则不出现", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-request-acceptance-"));
  const captured: RuntimeProviderOptions[] = [];
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestAcceptance: async () => dispatched,
      providerFactories: { claude: adapterFactory((options) => { captured.push(options); }) },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(captured.length, 1);
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REQUEST_ACCEPTANCE_TOOL_NAME),
      true,
      "Service 必须透传 request_acceptance",
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
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REQUEST_ACCEPTANCE_TOOL_NAME),
      false,
      "未注入时不得出现 request_acceptance",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
