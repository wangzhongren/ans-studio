// test/测试/governance-judge-cards-verify/e-queue-once.test.ts
// 独立验收（测试角色，2026-10-18）：一项目一卡、judging 占卡、同一 id 只答一次、
// replay 不重新判断、代批后 onNextStep 恰一次。
//
// 依据：PM 评审 §4.2/§4.3、§十三 AC18/AC21。全部离线。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { CustomerInputRequest, GovernanceJudgeOutcome, GovernanceJudgeRequest } from "../../../src/model/runtime.ts";
import { autoJudge, makeChannel, makeRoot, seedProject, tick, waitFor, FLOW } from "./fixture.ts";

const card = (title: string): CustomerInputRequest => ({
  kind: "choice",
  title,
  cardKind: "proposal",
  flowId: FLOW,
  options: [
    { id: "accept", label: "接受" },
    { id: "reject", label: "拒绝" },
  ],
});

const approve = (request: GovernanceJudgeRequest): GovernanceJudgeOutcome => ({
  verdict: "approve",
  group: request.group,
  cardKind: request.cardKind,
  engine: request.runtime,
  reasonCode: "sufficient",
  reason: "夹具：可接受。",
  evidence: ["fixture"],
  value: { selected: ["accept"] },
});

test("一项目一卡：第二张排队不呈现；第一张结算后按到达序呈现；同一 id 只答一次", async () => {
  const { root, cleanup } = makeRoot("queue-order");
  try {
    seedProject(root);
    const h = makeChannel({ root }); // 两开关都关：走原卡队列语义
    const first = h.ask(card("提案一"));
    await Promise.resolve();
    const second = h.ask(card("提案二"));
    await Promise.resolve();
    assert.equal(h.presented.length, 1, "同项目同一时刻只呈现一张");
    assert.equal(h.presented[0]!.request.title, "提案一");
    assert.equal(h.channel.pendingCount(), 2, "挂起数=已呈现+排队");
    assert.equal(h.channel.queuedCount(), 1);

    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    await first;
    await Promise.resolve();
    assert.equal(h.presented.length, 2, "第一张结算后按序呈现第二张");
    assert.equal(h.presented[1]!.request.title, "提案二");

    const id = h.presented[1]!.id;
    h.answer(id, { kind: "choice", selected: ["accept"] });
    await second;
    const again = h.channel.respond({ id, decision: { kind: "choice", selected: ["accept"] } });
    assert.equal(again.ok, false, "同一 id 不得二次作答");
    assert.equal(again.expired, true);
    assert.equal(h.nextSteps.length, 2, "每张卡各一次 next-step");
  } finally {
    cleanup();
  }
});

test("judging 占卡：不呈现、不计 pending/pendingRoles；跨项目可并行判断", async () => {
  const { root, cleanup } = makeRoot("judging-occupy");
  try {
    seedProject(root);
    const resolvers: Array<() => void> = [];
    const h = makeChannel({
      root,
      decision: true,
      fn: (request) => new Promise<GovernanceJudgeOutcome>((resolve) => { resolvers.push(() => resolve(approve(request))); }),
    });

    const first = h.ask(card("提案一"));
    await waitFor(() => h.channel.judgingCount() === 1);
    assert.equal(h.channel.pendingCount(), 0, "judging 不计 pending");
    assert.equal(h.channel.queuedCount(), 0);
    assert.equal(h.channel.pendingRoles().size, 0, "judging 不点亮等待客户");
    assert.equal(h.presented.length, 0);

    const second = h.ask(card("提案二"));
    await tick(5);
    assert.equal(h.channel.queuedCount(), 1, "同项目第二张排队");
    assert.equal(h.presented.length, 0);

    // 跨项目：另一个 projectRoot 可并行判断（一项目一卡，不跨项目串行）。
    const h2root = `${root}-other`;
    const other = h.ask(card("提案三"), { projectRoot: h2root });
    await waitFor(() => h.channel.judgingCount() === 2);
    assert.equal(h.channel.judgingCount(), 2, "跨项目可并行判断");

    resolvers[0]!();
    await first;
    // 第一张结算后，同项目第二张进入 judging；跨项目那张仍在 judging。
    await waitFor(() => resolvers.length === 3, 500);
    assert.equal(h.presented.length, 0);
    // 依次放行剩余两次判断。
    resolvers[1]!();
    resolvers[2]!();
    await tick(10);
    const [secondOut, otherOut] = await Promise.all([second, other]);
    assert.equal(secondOut.outcome, "answered");
    assert.equal(otherOut.outcome, "answered");
    assert.equal(h.rows.length, 3, "三张代批卡各一行");
    assert.equal(h.nextSteps.length, 3);
  } finally {
    cleanup();
  }
});

test("replayPending 不重新判断；已代批卡不在重放集合；结果行不因 replay 重复", async () => {
  const { root, cleanup } = makeRoot("replay");
  try {
    seedProject(root);
    const judgeCalls: GovernanceJudgeRequest[] = [];
    const h = makeChannel({ root, decision: true, fn: autoJudge((request) => approve(request), judgeCalls) });
    const out = await h.ask(card("提案一"));
    assert.equal(out.outcome, "answered");
    assert.equal(judgeCalls.length, 1);
    assert.equal(h.rows.length, 1);

    const replayed = h.channel.replayPending();
    assert.equal(replayed, 0, "已结算卡不重放");
    assert.equal(judgeCalls.length, 1, "replay 不得再次判断");
    assert.equal(h.rows.length, 1, "结果行不得重复");
    assert.equal(h.nextSteps.length, 1, "next-step 不得重复");
  } finally {
    cleanup();
  }
});

test("manual 回落卡 replay：只重呈现、不重新判断、不重复提示", async () => {
  const { root, cleanup } = makeRoot("replay-manual");
  try {
    seedProject(root);
    const judgeCalls: GovernanceJudgeRequest[] = [];
    const h = makeChannel({
      root,
      decision: true,
      fn: autoJudge((request): GovernanceJudgeOutcome => {
        judgeCalls.push(request);
        return {
          verdict: "manual",
          group: request.group,
          cardKind: request.cardKind,
          engine: request.runtime,
          reasonCode: "insufficient-evidence",
          reason: "夹具：证据不足。",
        };
      }),
    });
    const pending = h.ask(card("提案一"));
    await tick(10);
    assert.equal(h.presented.length, 1);
    const firstNotice = h.presented[0]!.judgeNotice;
    assert.equal(typeof firstNotice, "string");
    const replayed = h.channel.replayPending();
    assert.equal(replayed, 1, "已呈现的回落卡可重呈现");
    assert.equal(h.presented.length, 2);
    assert.equal(h.presented[1]!.judgeNotice, firstNotice, "提示原样保留");
    assert.equal(judgeCalls.length, 1, "replay 不得再次判断");
    h.answer(h.presented[1]!.id, { kind: "choice", selected: ["accept"] });
    await pending;
    assert.equal(h.nextSteps.length, 1);
  } finally {
    cleanup();
  }
});

test("代批后 onNextStep 恰一次；结算后 respond/再次 replay 不产生第二次", async () => {
  const { root, cleanup } = makeRoot("next-step-once");
  try {
    seedProject(root);
    const h = makeChannel({ root, decision: true, fn: async (request) => approve(request) });
    const out = await h.ask(card("提案一"));
    assert.equal(out.outcome, "answered");
    assert.equal(h.nextSteps.length, 1);
    const payload = h.nextSteps[0]!.payload as { cardKind?: string; nextFunction?: string | null; roleId?: string | null; followUp?: string };
    assert.equal(payload.cardKind, "proposal");
    assert.equal(payload.nextFunction, "schedule", "接受提案先派 Convener 写流程单");
    assert.equal(payload.roleId, "convener");
    assert.equal(payload.followUp, "nomination-after-flow", "流程单落盘后才派 Nominator");
    h.channel.replayPending();
    assert.equal(h.nextSteps.length, 1, "replay 不得触发第二次 next-step");
    assert.equal(h.channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).expired, true);
    assert.equal(h.nextSteps.length, 1);
  } finally {
    cleanup();
  }
});
