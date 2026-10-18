// test/测试/governance-e2e-auto/j-intent-confirm.test.ts
// 五角色收口（2026-10-18 客户拍板）：Lead / 主理 的需求确认卡（intent-confirm）——
//   · 卡由客户**本人**回答，判断 agent 永不介入（即便两个开关都开）；
//   · 客户确认后 hand_off_intent 才放行、Rapporteur 收到任务；
//   · 客户选 revise（最后一条 changes-requested）⇒ hand_off 被拒，不投递、不写交接账本。
//
// 全部离线：真实桌面 Interface / 客户通道 / 编排 hand_off 门禁 / 账本；模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  intentDoc,
  intentHandoffArgs,
  makeHarness,
  makeRoot,
  seedTrioProject,
  write,
  type Harness,
} from "./fixture.ts";

const INTENT_REL = "docs/intents/intent-a.md";

function liaisonScript() {
  return [
    { name: "write_file", args: { path: INTENT_REL, content: intentDoc("intent-a") } },
    {
      name: "request_choice",
      toolCallId: "tc-intent-confirm",
      args: {
        title: "需求确认 intent-a",
        question: "请确认目标、范围与验收标准。",
        flowId: FLOW,
        cardKind: "intent-confirm",
        options: [
          { id: "confirm", label: "确认" },
          { id: "revise", label: "修改" },
        ],
      },
    },
    { name: "hand_off_intent", toolCallId: "tc-handoff", args: intentHandoffArgs("intent-a") },
  ];
}

async function harnessAt(root: string, tag: string): Promise<Harness> {
  seedTrioProject(root);
  return makeHarness({
    tag,
    root,
    // 两个判断开关都开：用于证明 intent-confirm 仍永不进入判断。
    approval: true,
    decision: true,
    scriptForRole: (ctx) =>
      ctx.roleId === "liaison" && !ctx.prompt.includes("[系统·治理反馈]") ? liaisonScript() : [],
  });
}

test("Lead 需求确认：客户手答 confirm ⇒ hand_off 成功；判断 agent 零介入", async () => {
  const temp = makeRoot("intent-confirm-ok");
  const h = await harnessAt(temp.root, "intent-confirm-ok");
  try {
    await h.open("liaison");
    // 卡片作答发生在 send 的等待期内 ⇒ 不 await send，先等卡、手答，再等本轮结束。
    const sending = h.send("liaison", "请确认需求后交给报告员。");

    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.equal(card.request.cardKind, "intent-confirm", "Lead 先发需求确认卡");
    assert.equal(h.judgeRows.length, 0, "需求确认卡不得被判断 agent 代批");
    h.answer(card.id, { kind: "choice", selected: ["confirm"] });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    const { entries } = await h.waitForLedger(
      (list) => list.some((entry) => entry.kind === "intent.handed-off"),
      5000,
    );
    const confirm = entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    );
    assert.ok(confirm, "客户确认应写 intent-confirm 决定");
    assert.equal(confirm!.customerDecision, "accepted");
    assert.equal(confirm!.decisionEvidence?.kind, "customer-input", "客户本人作答（不是 judge 代批）");
    assert.equal(confirm!.flowId, FLOW);
    assert.equal(entries.filter((entry) => entry.kind === "intent.handed-off").length, 1, "确认后恰一条交接");
    assert.ok(
      (h.prompts.get("rapporteur") ?? []).some((prompt) => /客户意图已交接/.test(prompt)),
      "交接成功后 Rapporteur 收到任务",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("Lead 需求确认：客户选 revise ⇒ hand_off 被拒、不投递、无交接账本", async () => {
  const temp = makeRoot("intent-confirm-revise");
  const h = await harnessAt(temp.root, "intent-confirm-revise");
  try {
    await h.open("liaison");
    // 同上：不 await send，先等卡、手答 revise，再等本轮（hand_off 被拒）结束。
    const sending = h.send("liaison", "请确认需求后交给报告员。");

    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.equal(card.request.cardKind, "intent-confirm");
    h.answer(card.id, { kind: "choice", selected: ["revise"] });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => h.results.some((entry) => entry.name === "hand_off_intent"), 5000);
    const receipt = h.results.find((entry) => entry.name === "hand_off_intent")!;
    assert.equal(receipt.ok, false, "最后一条 revise ⇒ hand_off 必须被拒");
    assert.match(receipt.message, /尚未经客户确认/);

    const { entries } = await h.waitForLedger(() => true, 2000);
    const confirm = entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    );
    assert.equal(confirm?.customerDecision, "changes-requested");
    assert.equal(entries.some((entry) => entry.kind === "intent.handed-off"), false, "未确认不得写交接账本");
    assert.equal((h.prompts.get("rapporteur")?.length ?? 0), 0, "未确认不得投递给 Rapporteur");
    assert.equal(h.judgeRows.length, 0, "判断 agent 全程零介入");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
