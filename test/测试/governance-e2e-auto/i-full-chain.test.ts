// test/测试/governance-e2e-auto/i-full-chain.test.ts
// 五角色**全自动闭环**（离线端到端）：Lead 交接意图 → Draft 写提案并请客户接受 →
// 应用派 Steward 写流程单 → 应用派 Crew 提名 → 客户任命 executor → 应用派 Crew 写卡 →
// listing 刷新后应用派 Steward 排程 → Steward dispatch_task 派发给 executor。
//
// 唯一非产品件是模型会话（脚本化桩）与判断会话（假模型交回 approve）；其余走真实桌面 Interface、
// 真实 run-role/gate/issuer/账本/客户通道/判断 driver/listing 刷新。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  FLOW_REL,
  NOMINATION_REL,
  PROPOSAL_REL,
  exists,
  flowDoc,
  intentDoc,
  intentHandoffArgs,
  makeHarness,
  makeRoot,
  nominationDoc,
  proposalDoc,
  seedTrioProject,
  write,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";
const INTENT_REL = "docs/intents/intent-a.md";

test("五角色全自动链路：意图→提案→接受→流程→提名→任命→写卡→排程→派发 executor", async () => {
  const temp = makeRoot("full-chain");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "full-chain",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (
        ctx.roleId === "liaison" &&
        !ctx.prompt.includes("[系统·治理反馈]") &&
        !/已交给报告员|客户意图已交接/.test(ctx.prompt)
      ) {
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
      if (ctx.roleId === "rapporteur" && /客户意图已交接|请形成提案/.test(ctx.prompt)) {
        return [
          { name: "write_file", args: { path: PROPOSAL_REL, content: proposalDoc(FLOW) } },
          {
            name: "request_choice",
            toolCallId: "tc-proposal",
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
      if (ctx.roleId === "convener") {
        if (/客户已完成任命 executor/.test(ctx.prompt)) {
          // 第二段：排程 + 派发已批准步骤。
          return [
            { name: "write_file", args: { path: FLOW_REL, content: flowDoc(FLOW, [{ id: "impl", status: "done" }]) } },
            {
              name: "dispatch_task",
              toolCallId: "tc-dispatch",
              args: { roleId: "executor", task: "执行 impl 步骤", flowId: FLOW, stepId: "impl" },
            },
          ];
        }
        if (/请先写流程单/.test(ctx.prompt)) {
          return [{ name: "write_file", args: { path: FLOW_REL, content: flowDoc(FLOW, [{ id: "impl", status: "pending" }]) } }];
        }
        return [];
      }
      if (ctx.roleId === "nominator") {
        if (/appointment-write|尚未写出|写卡/.test(ctx.prompt)) {
          return [
            {
              name: "request_confirmation",
              toolCallId: "tc-appointment-write",
              args: {
                title: `写盘确认 ${FLOW}`,
                // 2026-10-19 呈现前完整性闸：每条声明路径后都给出可核对正文。
                preview: `将写入：\n- ${ROLE_CARD_REL}\n\n角色卡正文：角色名 executor、职责与工作立场。\n\n- ${ROLE_BOUNDARY_REL}\n\n边界正文：可写目录与目的条目。\n`,
                flowId: FLOW,
                cardKind: "appointment-write",
              },
            },
            { name: "write_file", args: { path: ROLE_CARD_REL, content: "# 角色：executor\n\n由 Nominator 写出。\n" } },
            {
              name: "write_file",
              args: {
                path: ROLE_BOUNDARY_REL,
                content: "role: executor\nentries:\n  - kind: directory\n    path: src/owned-executor/\n    purpose: 角色代码\n",
              },
            },
          ];
        }
        if (/请执行提名/.test(ctx.prompt)) {
          return [
            { name: "write_file", args: { path: NOMINATION_REL, content: nominationDoc(FLOW, ["executor"]) } },
            {
              name: "request_choice",
              toolCallId: "tc-appointment",
              args: {
                title: `任命 ${FLOW}`,
                question: "选择要任命的角色",
                flowId: FLOW,
                cardKind: "appointment",
                multiple: true,
                options: [{ id: "executor", label: "Executor" }],
              },
            },
          ];
        }
        return [];
      }
      if (ctx.roleId === "executor") {
        return [
          { name: "submit_report", toolCallId: "tc-report", args: { status: "completed", summary: "impl 步骤已完成（离线夹具）。" } },
        ];
      }
      return [];
    },
  });
  try {
    await h.open("liaison");
    // 卡片作答发生在 send 的等待期内 ⇒ 不 await send，先等卡、手答，再等本轮结束。
    const sending = h.send("liaison", "请把客户意图交给报告员。");

    // 2026-10-18 客户拍板：Lead 先发 intent-confirm 卡，客户手答（判断 agent 不介入）；
    // 确认后 hand_off_intent 才被放行。
    await h.waitFor(() => h.presented.length === 1, 5000);
    const confirmCard = h.presented[0]!;
    assert.equal(confirmCard.request.cardKind, "intent-confirm", "Lead 先发需求确认卡");
    assert.equal(h.judgeRows.length, 0, "需求确认卡由客户手答，判断 agent 不得代批");
    h.answer(confirmCard.id, { kind: "choice", selected: ["confirm"] });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    // 等整条链路收口：executor 角色卡落盘 + Convener 派发入账。
    await h.waitFor(
      () =>
        exists(temp.root, ROLE_CARD_REL) &&
        (h.prompts.get("executor")?.length ?? 0) > 0,
      8000,
    );
    await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener" && entry.stepId === "impl"),
      10000,
    );

    // —— 角色顺序：Liaison 客户打开 → Rapporteur → Convener → Nominator → executor ——
    const first = (roleId: string): number => h.openRoles.indexOf(roleId);
    assert.ok(first("liaison") >= 0, "Liaison 由客户打开");
    assert.ok(first("rapporteur") > first("liaison"), "交接后后台开 Rapporteur");
    assert.ok(first("convener") > first("rapporteur"), "接受提案后先开 Convener");
    assert.ok(first("nominator") > first("convener"), "流程单落盘后才开 Nominator");
    assert.ok(first("executor") > first("nominator"), "派发后开 executor");

    // —— 四个治理角色各收到正确的任务模板 ——
    assert.match(h.prompts.get("rapporteur")![0]!, /客户意图已交接/);
    assert.match(h.prompts.get("convener")![0]!, /请先写流程单 docs\/flows\/flow-a\.md/);
    assert.match(h.prompts.get("nominator")![0]!, /请执行提名/);
    assert.match(h.prompts.get("nominator")!.at(-1)!, /appointment-write/);
    assert.ok(
      h.prompts.get("convener")!.some((prompt) => /客户已完成任命 executor/.test(prompt)),
      `Convener 应收到任命后的排程任务；实际：${JSON.stringify(h.prompts.get("convener"))}`,
    );
    assert.match(h.prompts.get("executor")!.at(-1)!, /执行 impl 步骤/);

    // —— 产物：提案/流程/提名/角色卡/边界全部落盘 ——
    for (const rel of [PROPOSAL_REL, FLOW_REL, NOMINATION_REL, ROLE_CARD_REL, ROLE_BOUNDARY_REL]) {
      assert.equal(exists(temp.root, rel), true, `应落盘：${rel}`);
    }
    const flowText = (await import("node:fs")).readFileSync(`${temp.root}/${FLOW_REL}`, "utf8");
    assert.match(flowText, /\| impl \|.*\| done \|/, "Convener 第二段把步骤更新为 done");

    // —— 账本可还原：交接、三个 judge 决定、三段 app 派发、Convener 派发 ——
    const ledger = await h.waitForLedger(() => true);
    assert.deepEqual(ledger.errors, [], "账本无坏行");
    assert.ok(ledger.entries.some((entry) => entry.kind === "intent.handed-off" && entry.intentId === "intent-a"));
    const decisions = ledger.entries.filter((entry) => entry.kind === "customer.decision");
    for (const kind of ["proposal-accept", "appointment", "appointment-write"]) {
      const decision = decisions.find((entry) => entry.decisionKind === kind);
      assert.ok(decision, `应有 ${kind} 决定`);
      assert.equal(decision!.decisionEvidence?.kind, "judge", `${kind} 应由判断代批并留 judge 证据`);
    }
    const appDispatches = ledger.entries.filter(
      (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "app",
    );
    // 意图交接的 app 投递在 Rapporteur 整轮（含其后嵌套的应用推进）结束后才入账，
    // 故按事件发生顺序：接受→Convener、流程→Nominator、任命→Convener，最后才是交接→Rapporteur。
    assert.deepEqual(
      appDispatches
        .filter((entry) => entry.trigger === "customer-decision")
        .map((entry) => entry.targetRoleId),
      ["convener", "nominator", "nominator", "convener"],
      "应用推进：接受→Convener、流程→Nominator、任命→写卡 Nominator、写卡后→Convener",
    );
    assert.deepEqual(
      appDispatches
        .filter((entry) => entry.trigger === "intent-handoff")
        .map((entry) => entry.targetRoleId),
      ["rapporteur"],
      "意图交接 → Rapporteur",
    );
    const convenerDispatch = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener",
    );
    assert.ok(convenerDispatch, "Convener 的 dispatch_task 应受理入账");
    assert.equal(convenerDispatch!.targetRoleId, "executor");
    assert.equal(convenerDispatch!.flowId, FLOW);
    assert.equal(convenerDispatch!.stepId, "impl");
    assert.equal(convenerDispatch!.power, "schedule");

    // —— 界面：仅需求确认卡 1 张（客户手答）；其余治理卡由判断代批（0 手动卡）、listing 刷新、当前 pane 不切换 ——
    assert.equal(h.presented.length, 1, "仅 intent-confirm 由客户手答；其余治理卡 0 张手动卡");
    assert.equal(h.presented[0]!.request.cardKind, "intent-confirm");
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === "executor"), true);
    assert.ok(h.projectChanged > 0, "listing 刷新触发 project:changed");
    assert.deepEqual(h.userOpened, ["liaison"], "全程只有 Liaison 由客户打开（后台派发不抢活动角色）");

    // LRU/边界重建可能已回收或清空 Liaison 的 active 焦点；客户点回 Liaison 后，消息仍落它。
    await h.open("liaison");
    const liaisonPrompts = (h.prompts.get("liaison") ?? []).filter((prompt) => prompt.endsWith("客户继续说话")).length;
    h.iface.sendSession({ text: "客户继续说话" }).catch(() => {});
    await h.waitFor(
      () => (h.prompts.get("liaison") ?? []).filter((prompt) => prompt.endsWith("客户继续说话")).length > liaisonPrompts,
      6000,
    );
    assert.ok(
      (h.prompts.get("liaison") ?? []).some((prompt) => prompt.endsWith("客户继续说话")),
      "当前 pane 仍是 Lead（后台派发/治理反馈不抢活动角色）",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
