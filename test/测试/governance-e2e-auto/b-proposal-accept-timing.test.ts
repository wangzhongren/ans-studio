// test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts
// 场景 2（离线端到端）：**接受提案后的时序**——`proposal accept` ⇒ 先派 Convener 写
// `docs/flows/<flow>.md`；flow 落盘后才派 Nominator；flow 缺失时不得派 Nominator、如实报错。
//
// 客户决定由真实客户通道 + 判断 driver（假判断会话交回 accept）产生；`onNextStep` 与主进程同款接到
// `advanceGovernanceFlow`。断言打开顺序、任务文案、当前 pane 不切换、失败系统行。

import test from "node:test";
import assert from "node:assert/strict";

import type { ToolCall } from "../../../src/model/runtime.ts";
import {
  FLOW,
  FLOW_REL,
  PROPOSAL_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  proposalDoc,
  seedTrioProject,
  type ScriptContext,
} from "./fixture.ts";

function rapporteurProposalScript(): (ctx: ScriptContext) => ToolCall[] {
  return (ctx) => {
    if (ctx.roleId === "rapporteur" && ctx.turn === 1) {
      return [
        { name: "write_file", args: { path: PROPOSAL_REL, content: proposalDoc(FLOW) } },
        {
          name: "request_choice",
          toolCallId: "tc-proposal-accept",
          args: {
            title: `提案 ${FLOW}`,
            question: "是否接受该提案？",
            flowId: FLOW,
            cardKind: "proposal",
            options: [
              { id: "accept", label: "接受" },
              { id: "accept-quick", label: "快捷接受" },
              { id: "revise", label: "要求修改" },
              { id: "reject", label: "拒绝" },
            ],
          },
        },
      ];
    }
    return [];
  };
}

test("场景2a：接受提案 ⇒ 先 Convener 写流程单，落盘后才派 Nominator；当前 pane 不变", async () => {
  const convenerPromptedWhen: Array<{ flowExists: boolean }> = [];
  const nominatorPromptedWhen: Array<{ flowExists: boolean }> = [];
  const script = rapporteurProposalScript();
  const temp = makeRoot("proposal-accept-chain");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "proposal-accept-chain",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener") {
        return [{ name: "write_file", args: { path: FLOW_REL, content: flowDoc(FLOW, [{ id: "impl", status: "pending" }]) } }];
      }
      return script(ctx);
    },
    onPrompt: (ctx) => {
      if (ctx.roleId === "convener") convenerPromptedWhen.push({ flowExists: exists(temp.root, FLOW_REL) });
      if (ctx.roleId === "nominator") nominatorPromptedWhen.push({ flowExists: exists(temp.root, FLOW_REL) });
    },
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请形成提案并请客户决定。");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => (h.prompts.get("nominator")?.length ?? 0) > 0, 5000);
    assert.equal(h.prompts.get("convener")?.length, 1, "Convener 恰收到一条流程任务");
    assert.match(h.prompts.get("convener")![0]!, /请先写流程单 docs\/flows\/flow-a\.md/);
    assert.match(h.prompts.get("convener")![0]!, /不要把步骤说成已派发/);
    assert.equal(h.prompts.get("nominator")?.length, 1, "流程单落盘后恰派一条提名任务");
    assert.match(h.prompts.get("nominator")![0]!, /流程单已落盘于 docs\/flows\/flow-a\.md/);
    assert.deepEqual(nominatorPromptedWhen, [{ flowExists: true }], "派 Nominator 时流程单必须已在盘上");
    assert.deepEqual(convenerPromptedWhen, [{ flowExists: false }], "第一段派 Convener 时流程单尚不存在（由它写）");

    // 打开顺序：先 Convener，后 Nominator（Rapporteur 是客户打开的）。Lead 的打开来自
    // 2026-10-18 治理反馈镜像（内部角色 settle ⇒ 给主入口投 [系统·治理反馈]），不属于推进链。
    const order = h.openRoles.filter((roleId) => roleId !== "rapporteur" && roleId !== "liaison");
    assert.deepEqual(order, ["convener", "nominator"], `后台推进顺序：${order.join(" → ")}`);
    assert.ok(
      (h.prompts.get("liaison") ?? []).some((prompt) => prompt.startsWith("[系统·治理反馈]")),
      "内部角色 settle 后应向 Lead 投 [系统·治理反馈] 汇总任务",
    );

    const ledger = await h.waitForLedger((entries) => entries.filter((entry) => entry.kind === "dispatch.accepted").length >= 2);
    const accepted = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
    assert.deepEqual(
      accepted.map((entry) => [entry.actorRoleId, entry.trigger, entry.targetRoleId]),
      [
        ["app", "customer-decision", "convener"],
        ["app", "customer-decision", "nominator"],
      ],
      "两段后台派发都以 app 动作入账（不伪装客户批准）",
    );

    // 当前 pane 不变：不带 target 的客户消息仍落 Rapporteur。
    // （治理角色 settle 后 `repinIfBootstrapped` 会重写 `.ans/project.json`，下一次 send 可能先作废旧会话
    //   并重建——模型输入会带一行重建注记；这里只断言「消息确实落到 Rapporteur」，不断言零重建。）
    const rapporteurPromptCount = h.prompts.get("rapporteur")!.length;
    h.send("rapporteur", "客户继续说话").catch(() => {});
    await h.waitFor(() => (h.prompts.get("rapporteur")?.length ?? 0) > rapporteurPromptCount, 3000);
    assert.ok(
      h.prompts.get("rapporteur")!.at(-1)!.endsWith("客户继续说话"),
      `活动角色/当前 pane 仍是 Rapporteur；实际 prompt=${JSON.stringify(h.prompts.get("rapporteur")!.at(-1))}`,
    );

    assert.equal(h.presented.length, 0, "双开关开 + 判断 allow ⇒ 全程 0 张手动卡");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景2b：Convener 未写出流程单 ⇒ 不派 Nominator、如实报错、不循环", async () => {
  const script = rapporteurProposalScript();
  const temp = makeRoot("proposal-accept-missing-flow");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "proposal-accept-missing-flow",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener") return []; // 模拟写流程单失败/未写
      return script(ctx);
    },
  });
  try {
    await h.open("rapporteur");
    await h.send("rapporteur", "请形成提案并请客户决定。");

    await h.waitFor(() => h.advanceResults.length === 1, 5000);
    const result = await h.advanceResults[0]!;
    assert.equal(result.ok, false, "流程单缺失 ⇒ 整体如实失败");
    assert.equal(result.dispatched, true, "第一段 Convener 已投递");
    assert.equal(result.targetRoleId, "convener");
    assert.match(result.error ?? "", /未写出流程单 docs\/flows\/flow-a\.md/);
    assert.equal(h.prompts.get("nominator")?.length ?? 0, 0, "流程单缺失时绝不派 Nominator");
    assert.equal(h.openRoles.includes("nominator"), false, "绝不为 Nominator 开会话");
    assert.equal(exists(h.root, FLOW_REL), false);

    const notes = h.events
      .filter(
        (envelope) =>
          envelope.roleId === "rapporteur" &&
          envelope.event.kind === "message" &&
          (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
      )
      .map((envelope) => envelope.event.summary);
    assert.equal(notes.length, 2, "成功一段 + 停住一段各一条系统行");
    assert.match(notes[1] ?? "", /自动推进停住：Steward \/ 统筹 未写出流程单/);

    // 不循环：再等一拍，Convener 不再收到第二条任务。
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.prompts.get("convener")?.length, 1, "不重试、不循环派发");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
