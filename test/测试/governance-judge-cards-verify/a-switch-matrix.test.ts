// test/测试/governance-judge-cards-verify/a-switch-matrix.test.ts
// 独立验收（测试角色，2026-10-18）：双开关矩阵——「替我审批」与「替我决策」互不影响。
//
// 依据：PM 评审 §三（启用矩阵/开关状态）、§四（判定发生点）、§十三 AC1–AC4/AC20/AC21。
// 全部离线：真实桌面客户交互通道 + 真开关状态机 + 假判断函数；不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { CustomerInputRequest } from "../../../src/model/runtime.ts";
import { makeChannel, makeRoot, seedProject, FLOW, PROPOSAL_REL } from "./fixture.ts";

const writeCard = (): CustomerInputRequest => ({
  kind: "confirm",
  title: "写盘确认 flow-a",
  cardKind: "write",
  flowId: FLOW,
  preview: `将写入 ${PROPOSAL_REL}`,
});

const proposalCard = (): CustomerInputRequest => ({
  kind: "choice",
  title: "提案 flow-a",
  cardKind: "proposal",
  flowId: FLOW,
  options: [
    { id: "accept", label: "接受" },
    { id: "reject", label: "拒绝" },
  ],
});

test("两个开关都关：写盘/提案都走原卡，judge 0 次调用、无结果行、无回落提示", async () => {
  const { root, cleanup } = makeRoot("both-off");
  try {
    seedProject(root);
    const h = makeChannel({ root });
    assert.equal(h.approvalSwitch.isEnabled(), false);
    assert.equal(h.decisionSwitch.isEnabled(), false);

    const first = h.ask(writeCard());
    await Promise.resolve();
    assert.equal(h.presented.length, 1, "写盘卡必须原样呈现");
    assert.equal(h.presented[0]!.request.cardKind, "write");
    assert.equal(h.presented[0]!.judgeNotice, undefined, "开关关不得出现回落提示");
    h.answer(h.presented[0]!.id, { kind: "confirm", confirmed: true });
    const firstOut = await first;
    assert.equal(firstOut.outcome, "answered");
    assert.equal(firstOut.judge, undefined, "客户手批不得带 judge 审计");

    const second = h.ask(proposalCard());
    await Promise.resolve();
    assert.equal(h.presented.length, 2, "提案卡必须原样呈现");
    h.answer(h.presented[1]!.id, { kind: "choice", selected: ["accept"] });
    const secondOut = await second;
    assert.equal(secondOut.outcome, "answered");
    assert.equal(secondOut.judge, undefined);

    assert.equal(h.requests.length, 0, "开关都关时判断 agent 必须 0 次调用");
    assert.equal(h.rows.length, 0, "开关都关不得产生判断结果行");
  } finally {
    cleanup();
  }
});

test("仅开 approval：写盘族代批；提案卡仍原卡且 judge 不参与", async () => {
  const { root, cleanup } = makeRoot("approval-only");
  try {
    seedProject(root);
    const h = makeChannel({ root, approval: true, decision: false });

    const writeOut = await h.ask(writeCard());
    assert.equal(writeOut.outcome, "answered");
    assert.equal(writeOut.outcome === "answered" ? writeOut.value.confirmed : undefined, true);
    assert.equal(writeOut.outcome === "answered" ? writeOut.operatorId : undefined, "judge:claude");
    assert.equal(writeOut.outcome === "answered" ? writeOut.judge?.group : undefined, "approval");
    assert.equal(writeOut.outcome === "answered" ? writeOut.judge?.cardKind : undefined, "write");
    assert.equal(h.presented.length, 0, "写盘卡代批成功必须 0 卡");
    assert.equal(h.rows.length, 1, "写盘卡代批成功必须恰 1 行结果");
    assert.equal(h.rows[0]!.group, "approval");
    assert.equal(h.requests.length, 1, "写盘卡恰判断一次");

    const proposal = h.ask(proposalCard());
    await Promise.resolve();
    assert.equal(h.presented.length, 1, "仅开 approval 时提案卡仍逐张呈现");
    assert.equal(h.presented[0]!.judgeNotice, undefined, "未开启的组无判断发生，不得提示回落");
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    const proposalOut = await proposal;
    assert.equal(proposalOut.outcome, "answered");
    assert.equal(proposalOut.judge, undefined);
    assert.equal(h.requests.length, 1, "提案卡不得触发判断");
    assert.equal(h.rows.length, 1, "结果行仍只有写盘卡那一行");
  } finally {
    cleanup();
  }
});

test("仅开 decision：提案代批；写盘卡仍原卡且 judge 不参与", async () => {
  const { root, cleanup } = makeRoot("decision-only");
  try {
    seedProject(root);
    const h = makeChannel({ root, approval: false, decision: true });

    const proposalOut = await h.ask(proposalCard());
    assert.equal(proposalOut.outcome, "answered");
    assert.deepEqual(proposalOut.outcome === "answered" ? proposalOut.value.selected : undefined, ["accept"]);
    assert.equal(proposalOut.outcome === "answered" ? proposalOut.operatorId : undefined, "judge:claude");
    assert.equal(proposalOut.outcome === "answered" ? proposalOut.judge?.group : undefined, "decision");
    assert.equal(h.presented.length, 0, "提案代批成功必须 0 卡");
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0]!.cardKind, "proposal");
    assert.equal(h.requests.length, 1);

    const write = h.ask(writeCard());
    await Promise.resolve();
    assert.equal(h.presented.length, 1, "仅开 decision 时写盘卡仍逐张呈现");
    assert.equal(h.presented[0]!.judgeNotice, undefined);
    h.answer(h.presented[0]!.id, { kind: "confirm", confirmed: true });
    const writeOut = await write;
    assert.equal(writeOut.outcome, "answered");
    assert.equal(writeOut.judge, undefined);
    assert.equal(h.requests.length, 1, "写盘卡不得触发判断");
    assert.equal(h.rows.length, 1);
  } finally {
    cleanup();
  }
});

test("两个都开：写盘与提案都代批；结果行各一、0 卡、下一步按卡各一次", async () => {
  const { root, cleanup } = makeRoot("both-on");
  try {
    seedProject(root);
    const h = makeChannel({ root, approval: true, decision: true });

    const writeOut = await h.ask(writeCard());
    const proposalOut = await h.ask(proposalCard());
    assert.equal(writeOut.outcome, "answered");
    assert.equal(proposalOut.outcome, "answered");
    assert.equal(h.presented.length, 0, "两个开关都开：两类卡都不得呈现");
    assert.equal(h.rows.length, 2, "每张代批卡各一行结果");
    assert.deepEqual(h.rows.map((row) => row.group).sort(), ["approval", "decision"]);
    assert.deepEqual(h.requests.map((request) => request.group).sort(), ["approval", "decision"]);
    assert.equal(h.nextSteps.length, 2, "两张卡各回调一次 next-step");
    const withNext = h.nextSteps.filter((step) => (step.payload as { nextFunction?: string | null }).nextFunction !== null);
    assert.equal(withNext.length, 1, "只有提案卡推导出治理下一步");
    assert.equal((withNext[0]!.payload as { cardKind?: string }).cardKind, "proposal");
    assert.equal(
      (h.nextSteps.find((step) => (step.payload as { cardKind?: string }).cardKind === "write")!.payload as { nextFunction?: string | null }).nextFunction,
      null,
      "写盘卡明确无下一步",
    );
  } finally {
    cleanup();
  }
});

test("开关独立性：toggle 一组不改变另一组；关闭后只恢复该类卡", async () => {
  const { root, cleanup } = makeRoot("switch-independent");
  try {
    seedProject(root);
    const h = makeChannel({ root, approval: true, decision: true });
    assert.equal(h.approvalSwitch.isEnabled(), true);
    assert.equal(h.decisionSwitch.isEnabled(), true);

    h.approvalSwitch.set({ enabled: false });
    assert.equal(h.decisionSwitch.isEnabled(), true, "关 approval 不得影响 decision");
    const proposalOut = await h.ask(proposalCard());
    assert.equal(proposalOut.outcome, "answered");
    assert.equal(proposalOut.outcome === "answered" ? proposalOut.judge?.group : undefined, "decision");

    const write = h.ask(writeCard());
    await Promise.resolve();
    assert.equal(h.presented.length, 1, "approval 关后写盘卡恢复逐张呈现");
    h.answer(h.presented[0]!.id, { kind: "confirm", confirmed: false });
    const writeOut = await write;
    assert.equal(writeOut.outcome, "declined");

    h.decisionSwitch.set({ enabled: false });
    assert.equal(h.approvalSwitch.isEnabled(), false);
    h.approvalSwitch.set({ enabled: true });
    assert.equal(h.decisionSwitch.isEnabled(), false, "开 approval 不得影响 decision");
    const writeOut2 = await h.ask(writeCard());
    assert.equal(writeOut2.outcome, "answered");
    assert.equal(writeOut2.outcome === "answered" ? writeOut2.judge?.group : undefined, "approval");
  } finally {
    cleanup();
  }
});
