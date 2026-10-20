// flow 文件方法化工具注入面单测（2026-10-20 客户拍板，最小闭环）：
// `flow_get` / `flow_step_update` / `flow_step_supersede`。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 本角色只负责**能力透传**（权限/状态迁移/证据/revision 裁决在编排 flow-service，本层不实现）。
// 覆盖：
//   1. 未注入 ⇒ 三工具均不注册（假适配器脚本调用被判「未知工具」；既有工具面不变）；
//   2. 注入三能力 ⇒ 三工具注册，handler 把参数**逐字**交给注入 fn，回执如实转达为 accepted；
//   3. 各能力独立「注入才注册」，互不隐含（只注入 flowGet ⇒ 其余两工具仍不注册）；
//   4. PiRuntimeAdapterOptions（legacy 直调路径）类型接受三可选字段（编译期检查）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { createFakeRuntimeAdapter, type PiRuntimeAdapterOptions } from "../../src/provider/pi/session.ts";
import type {
  FlowGetFn, FlowStepSupersedeFn, FlowStepUpdateFn, FlowToolResult, SessionEvent, ToolCall,
} from "../../src/model/runtime.ts";
import { makeGate, makeRole } from "./fixtures.ts";

/** 服务端成功回执的替身（形状取自冻结契约；测试只验证原样转达）。 */
const okFlow: FlowToolResult = {
  ok: true,
  revision: "r2",
  flow: {
    flowId: "flow-a",
    revision: "r2",
    qualityTier: "standard",
    steps: [
      { id: "s1", title: "提案", owner: "rapporteur", kind: "artifact", status: "done" },
      { id: "s2", title: "派发", owner: "steward", kind: "dispatch", status: "dispatched" },
    ],
    canUpdate: ["s2"],
  },
};

/** 用假适配器跑一段 script，收集全部事件（与 fake-adapter.test.ts 同口径）。 */
async function runScript(opts: {
  script: ToolCall[];
  flowGet?: FlowGetFn;
  flowStepUpdate?: FlowStepUpdateFn;
  flowStepSupersede?: FlowStepSupersedeFn;
}): Promise<SessionEvent[]> {
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: [] }),
    script: opts.script,
    flowGet: opts.flowGet,
    flowStepUpdate: opts.flowStepUpdate,
    flowStepSupersede: opts.flowStepSupersede,
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("执行脚本");
  const events: SessionEvent[] = [];
  for await (const ev of session.events()) events.push(ev);
  return events;
}

const FLOW_CALLS: ToolCall[] = [
  { name: "flow_get", args: { flowId: "flow-a" } },
  {
    name: "flow_step_update",
    args: { flowId: "flow-a", stepId: "s2", status: "done", expectedRevision: "r2" },
  },
  {
    name: "flow_step_supersede",
    args: {
      flowId: "flow-a", oldStepId: "s1", newStepId: "s1b", title: "提案（修订）",
      owner: "rapporteur", kind: "artifact", expectedRevision: "r2",
    },
  },
];

function deniedOf(events: SessionEvent[]): SessionEvent[] {
  return events.filter((ev) => ev.kind === "denied");
}

// —————————————————————— 1. 未注入 ⇒ 不注册（结构性 fail-closed） ——————————————————————

test("未注入三能力：flow_get / flow_step_update / flow_step_supersede 均不注册（脚本调用=未知工具）", async () => {
  const events = await runScript({ script: FLOW_CALLS });

  const denied = deniedOf(events);
  assert.equal(denied.length, 3, "三次 flow 调用都应被拒（工具未注册）");
  for (const ev of denied) assert.match(ev.summary, /未知工具/);
  assert.equal(events.some((ev) => ev.kind === "accepted"), false, "未注入时不得有任何 accepted");

  // 既有工具面不放宽：同一脚本机制下 write_file 仍然注册（越界写被拒 ≠ 未知工具）。
  const baseline = await runScript({ script: [{ name: "write_file", args: { path: "src/x.ts", content: "x" } }] });
  const writeDenied = deniedOf(baseline).find((ev) => ev.summary.includes("write_file") || ev.summary.includes("写入被拒绝"));
  assert.ok(writeDenied, "write_file 应仍在工具集内（被写门禁拒绝，而不是未知工具）");
  assert.doesNotMatch(writeDenied!.summary, /未知工具/);
});

// —————————————————————— 2. 注入 ⇒ 三工具出现且 handler 透传 ——————————————————————

test("注入三能力：三工具注册，参数逐字透传，回执如实转达（accepted）", async () => {
  const getCalls: Array<Parameters<FlowGetFn>[0]> = [];
  const updateCalls: Array<Parameters<FlowStepUpdateFn>[0]> = [];
  const supersedeCalls: Array<Parameters<FlowStepSupersedeFn>[0]> = [];

  const flowGet: FlowGetFn = async (input) => {
    getCalls.push(input);
    return okFlow;
  };
  const flowStepUpdate: FlowStepUpdateFn = async (input) => {
    updateCalls.push(input);
    return okFlow;
  };
  const flowStepSupersede: FlowStepSupersedeFn = async (input) => {
    supersedeCalls.push(input);
    return okFlow;
  };

  const events = await runScript({
    script: [
      { name: "flow_get", args: { flowId: "flow-a" } },
      { name: "flow_get", args: {} },
      {
        name: "flow_step_update",
        args: {
          flowId: "flow-a", stepId: "s2", status: "done", expectedRevision: "r2",
          evidence: { kind: "artifact", ref: "docs/proposals/flow-a.md" },
          idempotencyKey: "idem-1", note: "验收完成",
        },
      },
      {
        name: "flow_step_supersede",
        args: {
          flowId: "flow-a", oldStepId: "s1", newStepId: "s1b", title: "提案（修订）",
          owner: "rapporteur", kind: "artifact", expectedRevision: "r2",
          reason: "客户改稿", idempotencyKey: "idem-2",
        },
      },
    ],
    flowGet,
    flowStepUpdate,
    flowStepSupersede,
  });

  assert.equal(deniedOf(events).length, 0, "注入后不应再有未知工具拒绝");
  const accepted = events.filter((ev) => ev.kind === "accepted");
  assert.equal(accepted.length, 4, "四次调用都应经受治理工具执行成功");

  // handler 调用透传：注入的 fn 真的被调用，且参数逐字一致。
  assert.deepEqual(getCalls, [{ flowId: "flow-a" }, {}], "flowId 给出原样透传、缺省传 {}");
  assert.deepEqual(updateCalls, [
    {
      flowId: "flow-a",
      stepId: "s2",
      status: "done",
      expectedRevision: "r2",
      evidence: { kind: "artifact", ref: "docs/proposals/flow-a.md" },
      idempotencyKey: "idem-1",
      note: "验收完成",
    },
  ]);
  assert.deepEqual(supersedeCalls, [
    {
      flowId: "flow-a",
      oldStepId: "s1",
      newStepId: "s1b",
      title: "提案（修订）",
      owner: "rapporteur",
      kind: "artifact",
      expectedRevision: "r2",
      reason: "客户改稿",
      idempotencyKey: "idem-2",
    },
  ]);

  // 回执原样转达：ok/revision 与 flow 视图都出现在工具结果文案里。
  for (const ev of accepted) {
    assert.match(ev.summary, /操作成功/);
    assert.match(ev.summary, /ok=true/);
    assert.match(ev.summary, /revision=r2/);
  }
  assert.match(accepted[0].summary, /flowId=flow-a/);
  assert.match(accepted[0].summary, /flow_get/);
  assert.match(accepted[1].summary, /flow_get/);
  assert.match(accepted[2].summary, /flow_step_update/);
  assert.match(accepted[3].summary, /flow_step_supersede/);
});

// —————————————————————— 3. 各能力独立 ——————————————————————

test("只注入 flowGet：仅 flow_get 注册，其余两工具仍不注册（互不隐含）", async () => {
  const events = await runScript({
    script: [
      { name: "flow_get", args: {} },
      { name: "flow_step_update", args: { flowId: "f", stepId: "s", status: "done", expectedRevision: "r1" } },
      {
        name: "flow_step_supersede",
        args: { flowId: "f", oldStepId: "s", newStepId: "s2", title: "t", owner: "o", kind: "artifact", expectedRevision: "r1" },
      },
    ],
    flowGet: async () => okFlow,
  });

  assert.equal(events.filter((ev) => ev.kind === "accepted").length, 1, "只有 flow_get 应执行成功");
  const denied = deniedOf(events);
  assert.equal(denied.length, 2);
  for (const ev of denied) assert.match(ev.summary, /未知工具/);
});

// —————————————————————— 4. legacy 直调路径类型面 ——————————————————————

test("PiRuntimeAdapterOptions 类型接受三 flow 能力（编译期检查；未调用真实适配器）", () => {
  const flowGet: FlowGetFn = async () => okFlow;
  const flowStepUpdate: FlowStepUpdateFn = async () => okFlow;
  const flowStepSupersede: FlowStepSupersedeFn = async () => okFlow;

  const options: PiRuntimeAdapterOptions = {
    gate: makeGate({ skill: [], project: [] }),
    projectRoot: "/tmp/project",
    skillRoot: "/tmp/skills",
    flowGet,
    flowStepUpdate,
    flowStepSupersede,
  };

  assert.equal(options.flowGet, flowGet);
  assert.equal(options.flowStepUpdate, flowStepUpdate);
  assert.equal(options.flowStepSupersede, flowStepSupersede);
});
