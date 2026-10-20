// test/测试/governance-e2e-auto/j-intent-confirm.test.ts
// 五角色收口（2026-10-18；2026-10-20 客户「勾了替我决策就不用我管」更新）：Lead / 主理 的需求确认卡
// （intent-confirm）——
//   · **decision 开关开** ⇒ 卡进入判断、判断代批 confirm（0 客户卡），hand_off_intent 直接放行；
//   · **decision 开关关** ⇒ 不进判断、客户本人回答（confirm 放行 / revise 拒绝交接）；
//   · 缺 confirm 选项 ⇒ 判断 manual 自动退回（0 客户卡、可操作原因），hand_off 被拒；
//   · 客户确认后 hand_off_intent 才放行、Rapporteur 收到任务；revise ⇒ hand_off 被拒、不投递、无交接账本。
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
  type Harness,
} from "./fixture.ts";

const INTENT_REL = "docs/intents/intent-a.md";
const CONFIRM_OPTIONS = [
  { id: "confirm", label: "确认" },
  { id: "revise", label: "修改" },
];

function liaisonScript(options: Array<{ id: string; label: string }> = CONFIRM_OPTIONS) {
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
        options,
      },
    },
    { name: "hand_off_intent", toolCallId: "tc-handoff", args: intentHandoffArgs("intent-a") },
  ];
}

async function harnessAt(
  root: string,
  tag: string,
  opts: { decision?: boolean; options?: Array<{ id: string; label: string }> } = {},
): Promise<Harness> {
  seedTrioProject(root);
  return makeHarness({
    tag,
    root,
    approval: true,
    // 缺省 decision 开（2026-10-20 新语义）；关时验证客户手答路径。
    decision: opts.decision !== false,
    scriptForRole: (ctx) =>
      ctx.roleId === "liaison" && !ctx.prompt.includes("[系统·治理反馈]")
        ? liaisonScript(opts.options)
        : [],
  });
}

test("Lead 需求确认：decision 开 ⇒ intent-confirm 进判断并代批 confirm（0 客户卡）、hand_off 成功", async () => {
  const temp = makeRoot("intent-confirm-auto");
  const h = await harnessAt(temp.root, "intent-confirm-auto", { decision: true });
  try {
    await h.open("liaison");
    const sent = await h.send("liaison", "请确认需求后交给报告员。");
    assert.equal(sent.ok, true, sent.error ?? "");

    assert.equal(h.presented.length, 0, "decision 开 ⇒ 判断代批 confirm，0 张客户卡");
    const row = h.judgeRows.find((entry) => entry.cardKind === "intent-confirm");
    assert.ok(row, "应有 intent-confirm 判断结果行");
    assert.equal(row!.group, "decision", "需求确认卡属 decision 组");
    assert.deepEqual(row!.selected, ["confirm"], "判断只代批 confirm（revise 交回客户）");

    const { entries } = await h.waitForLedger(
      (list) => list.some((entry) => entry.kind === "intent.handed-off"),
      5000,
    );
    const confirm = entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    );
    assert.ok(confirm, "判断代批应写 intent-confirm 决定");
    assert.equal(confirm!.customerDecision, "accepted");
    assert.equal(confirm!.decisionEvidence?.kind, "judge", "代批留 judge 证据（不是客户手答）");
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

test("Lead 需求确认：decision 关 ⇒ 不进判断、客户卡手答 confirm、customer-input 证据", async () => {
  const temp = makeRoot("intent-confirm-hand");
  const h = await harnessAt(temp.root, "intent-confirm-hand", { decision: false });
  try {
    await h.open("liaison");
    // 卡片作答发生在 send 的等待期内 ⇒ 不 await send，先等卡、手答，再等本轮结束。
    const sending = h.send("liaison", "请确认需求后交给报告员。");

    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.equal(card.request.cardKind, "intent-confirm", "decision 关 ⇒ 客户卡原样呈现");
    assert.equal(h.judgeRows.length, 0, "decision 关 ⇒ 判断 agent 零介入");
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

test("Lead 需求确认：decision 关 + 客户选 revise ⇒ hand_off 被拒、不投递、无交接账本", async () => {
  const temp = makeRoot("intent-confirm-revise");
  const h = await harnessAt(temp.root, "intent-confirm-revise", { decision: false });
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

test("Lead 需求确认：decision 开 + 卡缺 confirm 选项 ⇒ 判断 manual 自动退回（0 客户卡）、hand_off 被拒", async () => {
  const temp = makeRoot("intent-confirm-missing-option");
  const h = await harnessAt(temp.root, "intent-confirm-missing-option", {
    decision: true,
    options: [{ id: "revise", label: "修改" }],
  });
  try {
    await h.open("liaison");
    const sent = await h.send("liaison", "请确认需求后交给报告员。");
    assert.equal(sent.ok, true, sent.error ?? "");

    assert.equal(h.presented.length, 0, "缺 confirm 选项 ⇒ 判断 manual 自动退回，0 张客户卡");
    assert.equal(h.judgeRows.length, 0, "manual 不产生 approve 结果行");
    const requestReceipt = h.results.find((entry) => entry.name === "request_choice");
    assert.ok(requestReceipt, "应有 request_choice 回执");
    assert.equal(requestReceipt!.ok, false, "缺 confirm 选项不得代批");
    assert.match(requestReceipt!.message, /没有 confirm 选项|重新提交/);

    const handoff = h.results.find((entry) => entry.name === "hand_off_intent");
    assert.ok(handoff, "应有 hand_off_intent 回执");
    assert.equal(handoff!.ok, false, "未获客户确认 ⇒ hand_off 必须被拒");
    assert.match(handoff!.message, /尚未经客户确认/);

    const { entries } = await h.waitForLedger(() => true, 2000);
    assert.equal(entries.some((entry) => entry.kind === "intent.handed-off"), false, "未确认不得写交接账本");
    assert.equal((h.prompts.get("rapporteur")?.length ?? 0), 0, "未确认不得投递给 Rapporteur");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
