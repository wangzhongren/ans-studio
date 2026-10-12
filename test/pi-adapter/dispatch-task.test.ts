// dispatch_task（su 派发任务工具，设计 H-1）单测。不导入任何 Pi 包。
// 归属：Pi适配器角色测试目录。
//
// 覆盖：
//   1. 结构性：**未注入派发能力 → 不注册**（只给 su）；注入 → 出现；
//   2. handler 把载荷（roleId/task/reason）**逐字**交给注入的 fn；void 回执 = 已受理；
//   3. 参数校验：roleId / task 缺失或空白 → ok:false 且 fn **未被调用**；
//   4. 失败如实：回执 ok:false（如「不是本项目角色」）/ 抛错 → 「**未能派发**」，**绝不**说成「已派发」；
//   5. 文案（describeTool）：写死三条——**派发 ≠ 授权**（且反向断言：不得出现「已获授权 / 已放行写盘」字样）、
//      任务自足、返工带证据；
//   6. 中止：AbortSignal 已中止 → 立即 fail-closed 返回（防悬挂）；
//   7. 不写盘：writeRoot/gate 就绪、派发成功，盘上零变化；
//   8. 冻结类型（§4 契约家）可从 session.ts 导入使用。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, DISPATCH_TASK_TOOL_NAME, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import { describeTool } from "../../src/common/pi-adapter/real-adapter.ts";
import type { DispatchReceipt, DispatchTaskFn, DispatchTaskPayload } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 记录调用载荷的替身 fn；**不写任何盘**。 */
function spy(returns: DispatchReceipt | null | undefined): {
  fn: DispatchTaskFn;
  calls: number;
  last: DispatchTaskPayload | undefined;
} {
  const box = {
    calls: 0,
    last: undefined as DispatchTaskPayload | undefined,
    fn: undefined as unknown as DispatchTaskFn,
  };
  box.fn = async (dispatch: DispatchTaskPayload) => {
    box.calls += 1;
    box.last = dispatch;
    return returns;
  };
  return box as unknown as { fn: DispatchTaskFn; calls: number; last: DispatchTaskPayload | undefined };
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

function names(tools: ToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

/** 失败措辞纪律：**绝不**出现宣称已派发的话术。 */
function assertNeverClaimsDispatched(message: string): void {
  assert.equal(/已派发/.test(message), false, `失败措辞绝不能含「已派发」：${message}`);
}

const GOOD_ARGS = {
  roleId: "桌面应用",
  task: "修 renderer.js 的卡片高度；依据 docs/design/x.md §3；完成标准：node --test 全绿并回交报告",
  reason: "返工：首次未含测试结论",
};

// —————————————————————— 1. 注册判据 ——————————————————————

test("未注入派发能力：dispatch_task 不在工具集里（只给 su；能力缺席 = 最强 fail-closed，H-1）", () => {
  const list = names(buildGovernedTools(allowGate()));
  assert.equal(list.includes(DISPATCH_TASK_TOOL_NAME), false, "未注入派发能力时绝不应有 dispatch_task");
  assert.ok(list.includes("write_file"));
  assert.ok(list.includes("read_file"));
});

test("注入派发能力：dispatch_task 出现在工具集里（同 run_shell / customerInput 的注入先例）", () => {
  const s = spy(undefined);
  const list = names(buildGovernedTools(allowGate(), { dispatchTask: s.fn }));
  assert.ok(list.includes(DISPATCH_TASK_TOOL_NAME));
});

// —————————————————————— 2. 载荷逐字 + 受理回执 ——————————————————————

test("handler 把载荷逐字交给 fn；回执 ok:true → 「任务已派发」并重申「派发 ≠ 授权」", async () => {
  const s = spy({ ok: true, message: "已路由（排队第 1 位）" });
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: s.fn }), DISPATCH_TASK_TOOL_NAME);

  const r = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(s.calls, 1, "handler 必须真的调用注入的 fn");
  assert.deepEqual(s.last, {
    roleId: "桌面应用",
    task: "修 renderer.js 的卡片高度；依据 docs/design/x.md §3；完成标准：node --test 全绿并回交报告",
    reason: "返工：首次未含测试结论",
  });
  assert.equal(r.ok, true);
  assert.match(r.message, /任务已派发给「桌面应用」/);
  assert.match(r.message, /派发 ≠ 授权/, "成功文案应重申「派发 ≠ 授权」");
  assert.match(r.message, /confirmed:true/, "应指明对方写权仍来自其 confirmed:true");
  assert.match(r.message, /已路由（排队第 1 位）/);
});

test("handler：reason 省略时载荷不含 reason；void 回执（fire-and-forget）视为已受理", async () => {
  const seen: DispatchTaskPayload[] = [];
  const voidFn: DispatchTaskFn = (dispatch) => {
    seen.push(dispatch); // 返回 void
  };
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: voidFn }), DISPATCH_TASK_TOOL_NAME);

  const r = await dispatch.handler({
    name: DISPATCH_TASK_TOOL_NAME,
    args: { roleId: "编排", task: "把 X 接线到 Y" },
  });

  assert.deepEqual(seen, [{ roleId: "编排", task: "把 X 接线到 Y" }]);
  assert.equal(r.ok, true);
  assert.match(r.message, /任务已派发/);
});

// —————————————————————— 3. 参数校验（fn 不该被调用） ——————————————————————

test("参数校验：roleId / task 缺失或空白 → ok:false 且 fn 未被调用", async () => {
  const s = spy({ ok: true });
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: s.fn }), DISPATCH_TASK_TOOL_NAME);

  const noRole = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: { task: "x" } });
  assert.equal(noRole.ok, false);
  assert.match(noRole.message, /roleId/);

  const blankRole = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: { roleId: "   ", task: "x" } });
  assert.equal(blankRole.ok, false);
  assert.match(blankRole.message, /roleId/);

  const noTask = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: { roleId: "桌面应用" } });
  assert.equal(noTask.ok, false);
  assert.match(noTask.message, /task/);

  assert.equal(s.calls, 0, "参数非法时绝不调用注入的 fn");
});

// —————————————————————— 4. 失败如实（含反向断言） ——————————————————————

test("回执 ok:false（如「不是本项目角色 / 指向 su 自身」）→ ok:false「未能派发」+ 原因，绝不谎报", async () => {
  const s = spy({ ok: false, message: "roleId 不是本项目角色：foo" });
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: s.fn }), DISPATCH_TASK_TOOL_NAME);

  const r = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能派发/);
  assert.match(r.message, /不是本项目角色/);
  assertNeverClaimsDispatched(r.message);
});

test("fn 抛错 → fail-closed「未能派发」+ 原因，绝不谎报", async () => {
  const fn: DispatchTaskFn = async () => {
    throw new Error("路由内部异常");
  };
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: fn }), DISPATCH_TASK_TOOL_NAME);

  const r = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: GOOD_ARGS });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能派发/);
  assert.match(r.message, /路由内部异常/);
  assertNeverClaimsDispatched(r.message);
});

// —————————————————————— 5. 文案（H-1 三条 + 反向断言） ——————————————————————

test("describeTool 文案：写死「派发≠授权 / 任务自足 / 返工带证据」；反向断言不得暗示授权", () => {
  const d = describeTool(DISPATCH_TASK_TOOL_NAME);
  const text = [d.description, ...(d.promptGuidelines ?? [])].join("\n");

  assert.match(text, /派发 ≠ 授权|派发≠授权/, "必须写死「派发 ≠ 授权」");
  assert.match(text, /confirmed:true/, "应指明写权唯一凭据仍是对方的 confirmed:true");
  assert.match(text, /自足/, "应要求任务文本自足");
  assert.match(text, /看不到你的上下文/, "应说明对方看不到上下文（自足的原因）");
  assert.match(text, /返工/, "应写返工语义");
  assert.match(text, /证据/, "返工应带证据");
  assert.match(text, /不改变任何角色的写权|不能.*授予|不得.*代授/, "应明示不转移写权");

  // 反向断言：不得出现任何「已获授权 / 已放行写盘 / 授予写权」式字样。
  assert.equal(
    /已获授权|已放行写盘|授予写权|授权写盘|代为授权成功/.test(text),
    false,
    `不得暗示派发携带授权：${text}`,
  );

  // schema：roleId/task 必填 + reason 可选。
  assert.deepEqual(d.parameters.required, ["roleId", "task"]);
  const props = d.parameters.properties as Record<string, unknown>;
  assert.ok(props["reason"], "应有可选 reason");
  assert.equal(d.executionMode, undefined, "派发不是交互等待，不并 sequential 档");
});

// —————————————————————— 6. 中止（防悬挂） ——————————————————————

test("中止：signal 已中止 → 立即 fail-closed 返回（不等注入 fn）", async () => {
  const s = spy({ ok: true });
  const dispatch = tool(buildGovernedTools(allowGate(), { dispatchTask: s.fn }), DISPATCH_TASK_TOOL_NAME);
  const controller = new AbortController();
  controller.abort();

  const r = await dispatch.handler({ name: DISPATCH_TASK_TOOL_NAME, args: GOOD_ARGS, signal: controller.signal });

  assert.equal(r.ok, false);
  assert.match(r.message, /未能派发/);
  assertNeverClaimsDispatched(r.message);
});

// —————————————————————— 7. 不写盘 ——————————————————————

test("不写盘：即便 writeRoot 就绪、gate 放行、派发成功，工具层零文件系统副作用", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-dispatch-"));
  try {
    assert.deepEqual(readdirSync(dir), [], "起始：临时目录为空");

    const s = spy({ ok: true });
    const tools = buildGovernedTools(allowGate(), { writeRoot: dir, dispatchTask: s.fn });
    const r = await tool(tools, DISPATCH_TASK_TOOL_NAME).handler({ name: DISPATCH_TASK_TOOL_NAME, args: GOOD_ARGS });

    assert.equal(r.ok, true);
    assert.equal(s.calls, 1);
    assert.deepEqual(readdirSync(dir), [], "派发调用后盘上应无任何新文件/目录");
    assert.equal(existsSync(join(dir, ".ans")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// —————————————————————— 8. 冻结契约家（§4） ——————————————————————

test("DispatchTaskPayload / DispatchReceipt / DispatchTaskFn 可从冻结契约家 session.ts 导入并使用", async () => {
  const payload: DispatchTaskPayload = { roleId: "r", task: "t" };
  const receipt: DispatchReceipt = { ok: true };
  const fn: DispatchTaskFn = async () => receipt;

  const got = await fn(payload);
  assert.equal(got?.ok, true);
  assert.equal(payload.roleId, "r");
});
