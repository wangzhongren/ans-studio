// test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts
// 2026-10-20 客户要求：Lead 的内部工程/协调 `request_choice`（不含 confirm）**不许呈现客户**——
// 应用直接 declined 并把「自行决定或派 Steward/项目角色」的指导回给 Lead；只有 intent-confirm 可发客户。
//
// 覆盖：
//   1. 通用 choice（keep-v1/do-v2/lead-decide，无 confirm、无 cardKind）⇒ 0 客户卡、declined + 指导、
//      无 customer.decision 账本；Lead 随后用 flow_get / dispatch_task 推进（真实受治理工具与门禁）。
//   2. 显式 intent-confirm 缺 confirm 选项 ⇒ 0 客户卡、declined、无判断/无账本。
//   3. 含 confirm 的 intent-confirm ⇒ 旧路径：decision 开 ⇒ 判断代批 confirm（0 卡、judge 证据）；
//      decision 关 ⇒ 客户卡手答（customer-input 证据）。
//
// 全部离线：真实桌面 Interface / run-role 包装 / 受治理工具 / 账本；模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  FLOW_REL,
  flowDoc,
  intentDoc,
  intentHandoffArgs,
  makeHarness,
  makeRoot,
  seedLedger,
  seedTrioProject,
  write,
} from "./fixture.ts";

const INTENT_REL = "docs/intents/intent-a.md";

function internalChoiceScript() {
  return [
    {
      name: "request_choice",
      toolCallId: "tc-internal-choice",
      args: {
        title: "内部工程决策",
        question: "选哪个方案？",
        flowId: FLOW,
        // 无 cardKind、无 confirm：Lead 的内部协调/工程选择。
        options: [
          { id: "keep-v1", label: "保留 v1" },
          { id: "do-v2", label: "做 v2" },
          { id: "lead-decide", label: "Lead 决定" },
        ],
      },
    },
    { name: "flow_get", toolCallId: "tc-flow-get", args: { flowId: FLOW } },
    {
      name: "dispatch_task",
      toolCallId: "tc-coordinate",
      args: { roleId: "convener", task: "请按流程协调推进 impl 步骤", flowId: FLOW },
    },
  ];
}

function intentConfirmScript(options: Array<{ id: string; label: string }>) {
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

test("Lead 通用 choice 不呈现客户：declined + 指导；随后 flow_get/dispatch_task 推进；无客户决定账本", async () => {
  const temp = makeRoot("lead-internal-choice");
  seedTrioProject(temp.root);
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }]));
  // 2026-10-24 闸门 1（设计 v1 §6.4）：coordinate（Lead→Steward）要求该 flow 的最新提案决定已接受；
  // 不能以空账本放行。这里补真实的 proposal-accept 种子，让下面的 dispatch_task 走真实门禁。
  await seedLedger(temp.root, [
    {
      kind: "customer.decision",
      flowId: FLOW,
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionEvidence: { kind: "customer-input" },
    },
  ]);
  const h = await makeHarness({
    tag: "lead-internal-choice",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) =>
      ctx.roleId === "chief" && !ctx.prompt.includes("[系统·治理反馈]") ? internalChoiceScript() : [],
  });
  try {
    await h.open("chief");
    const sent = await h.send("chief", "内部方案请自行决定，不要打扰客户。");
    assert.equal(sent.ok, true, sent.error ?? "");

    assert.equal(h.presented.length, 0, "通用 choice 不得呈现客户卡");
    assert.equal(h.judgeRows.length, 0, "通用 choice 不进入判断");
    const choice = h.results.find((result) => result.name === "request_choice");
    assert.ok(choice, "应有 request_choice 回执");
    assert.equal(choice!.ok, false, "通用 choice 必须 declined");
    assert.match(choice!.message, /内部协调\/工程决策/, "须说明这是内部协调/工程决策");
    assert.match(choice!.message, /自行决定/, "须指导 Lead 自行决定");
    assert.match(choice!.message, /dispatch_task/, "须指导可派 Steward/项目角色");
    assert.match(choice!.message, /flow_step_update/, "须指导用 flow 工具记录");
    assert.match(choice!.message, /客户只处理 intent-confirm/, "须说明客户只处理需求确认");

    const flowGet = h.results.find((result) => result.name === "flow_get");
    assert.ok(flowGet, "Lead 随后应能调用 flow_get");
    assert.equal(flowGet!.ok, true, `flow_get 应成功（流程 YAML 存在）：${flowGet!.message}`);
    const dispatch = h.results.find((result) => result.name === "dispatch_task");
    assert.ok(dispatch, "Lead 随后应能派协调任务");
    assert.equal(dispatch!.ok, true, "Lead→Convener 协调派发应被门禁允许");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener"),
      3000,
    );
    const decisions = ledger.entries.filter((entry) => entry.kind === "customer.decision");
    assert.deepEqual(
      decisions.map((entry) => entry.decisionKind),
      ["proposal-accept"],
      "通用 choice 不得写 customer.decision（仅保留夹具的 proposal-accept 种子）",
    );
    const coordinate = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener",
    );
    assert.ok(coordinate, "Lead 协调派发应入账");
    assert.equal(coordinate!.actorRoleId, "chief", "协调消息归因 Lead（不是客户）");
    await h.waitFor(() => (h.prompts.get("convener")?.length ?? 0) === 1, 3000);
    assert.equal(h.prompts.get("convener")!.length, 1, "Convener 收到 Lead 的协调任务");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("显式 intent-confirm 缺 confirm 选项 ⇒ 0 客户卡、declined、无判断/无客户决定账本", async () => {
  const temp = makeRoot("lead-intent-missing-confirm");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "lead-intent-missing-confirm",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) =>
      ctx.roleId === "chief" && !ctx.prompt.includes("[系统·治理反馈]")
        ? intentConfirmScript([{ id: "revise", label: "修改" }])
        : [],
  });
  try {
    await h.open("chief");
    const sent = await h.send("chief", "请确认需求。");
    assert.equal(sent.ok, true, sent.error ?? "");

    assert.equal(h.presented.length, 0, "缺 confirm 选项不得呈现客户卡");
    assert.equal(h.judgeRows.length, 0, "缺 confirm 选项不进入判断");
    const choice = h.results.find((result) => result.name === "request_choice");
    assert.ok(choice);
    assert.equal(choice!.ok, false);
    assert.match(choice!.message, /intent-confirm 必须有 confirm/);
    assert.match(choice!.message, /未向客户呈现/);

    const ledger = await h.waitForLedger(() => true, 2000);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "customer.decision"),
      false,
      "缺 confirm 选项不得写客户决定账本",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("含 confirm 的 intent-confirm 旧路径：decision 开 ⇒ 判断代批 confirm（0 卡、judge 证据）", async () => {
  const temp = makeRoot("lead-intent-auto");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "lead-intent-auto",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) =>
      ctx.roleId === "chief" && !ctx.prompt.includes("[系统·治理反馈]")
        ? intentConfirmScript([
            { id: "confirm", label: "确认" },
            { id: "revise", label: "修改" },
          ])
        : [],
  });
  try {
    await h.open("chief");
    const sent = await h.send("chief", "请确认需求后交给报告员。");
    assert.equal(sent.ok, true, sent.error ?? "");
    assert.equal(h.presented.length, 0, "decision 开 ⇒ 判断代批 confirm，0 客户卡");
    const row = h.judgeRows.find((entry) => entry.cardKind === "intent-confirm");
    assert.ok(row, "应有 intent-confirm 判断结果行");
    assert.deepEqual(row!.selected, ["confirm"]);

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "intent.handed-off"),
      3000,
    );
    const confirm = ledger.entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    );
    assert.ok(confirm, "应写 intent-confirm 决定");
    assert.equal(confirm!.decisionEvidence?.kind, "judge", "代批留 judge 证据");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "intent.handed-off").length, 1);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("含 confirm 的 intent-confirm 旧路径：decision 关 ⇒ 客户卡手答 confirm（customer-input 证据）", async () => {
  const temp = makeRoot("lead-intent-hand");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "lead-intent-hand",
    root: temp.root,
    approval: true,
    decision: false,
    scriptForRole: (ctx) =>
      ctx.roleId === "chief" && !ctx.prompt.includes("[系统·治理反馈]")
        ? intentConfirmScript([
            { id: "confirm", label: "确认" },
            { id: "revise", label: "修改" },
          ])
        : [],
  });
  try {
    await h.open("chief");
    const sending = h.send("chief", "请确认需求后交给报告员。");
    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.equal(card.request.cardKind, "intent-confirm");
    assert.equal(h.judgeRows.length, 0, "decision 关 ⇒ 判断零介入");
    h.answer(card.id, { kind: "choice", selected: ["confirm"] });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "intent.handed-off"),
      3000,
    );
    const confirm = ledger.entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    );
    assert.ok(confirm);
    assert.equal(confirm!.decisionEvidence?.kind, "customer-input", "客户手答保持 customer-input 证据");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "intent.handed-off").length, 1);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
