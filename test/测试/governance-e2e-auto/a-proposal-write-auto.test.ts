// test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts
// 场景 1（离线端到端）：**首次新建提案 write 卡**——Rapporteur 写尚不存在的
// `docs/proposals/<flow>-v1.md`；双开关全开 + 判断桩 allow ⇒ 0 张手动卡、账本
// `decisionEvidence.kind:"judge"`；空 preview ⇒ 真实 driver 回落手动卡。
//
// 走真实桌面 Interface + 真实项目目录 + 真实 run-role/gate/issuer/客户通道/判断 driver；
// 只有模型会话是脚本化桩。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  PROPOSAL_REL,
  exists,
  makeHarness,
  proposalDoc,
  type ScriptContext,
} from "./fixture.ts";

test("场景1a：首次新建提案 write 卡——双开关开 + 判断 allow ⇒ 0 卡、judge 证据、文件落盘", async () => {
  const h = await makeHarness({
    tag: "proposal-write-auto",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId === "rapporteur" && ctx.turn === 1) {
        const content = proposalDoc(FLOW);
        return [
          {
            name: "request_confirmation",
            toolCallId: "tc-proposal-write",
            args: {
              title: `写提案 ${FLOW} v1`,
              preview: `将写入 ${PROPOSAL_REL}\n\n${content}`,
              flowId: FLOW,
              cardKind: "write",
            },
          },
          { name: "write_file", args: { path: PROPOSAL_REL, content } },
        ];
      }
      return [];
    },
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请把提案写入 docs/proposals；先确认写盘。");
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger((entries) => entries.some((entry) => entry.decisionEvidence?.kind === "judge"));
    assert.deepEqual(ledger.errors, [], "账本可读、无坏行");

    // 0 张手动卡：卡片进入 judging 后被代批，不调用 presenter。
    assert.equal(h.presented.length, 0, "判断 allow ⇒ 0 张手动卡");
    assert.equal(h.judgeRows.length, 1, "恰一条 judge 结果行（可见性条件）");
    assert.equal(h.judgeRows[0]!.cardKind, "write");
    assert.equal(h.judgeRows[0]!.group, "approval");

    // 首次新建：文件尚不存在时也必须允许判断（新文件不要求读取，preview 核对正文）。
    assert.equal(exists(h.root, PROPOSAL_REL), true, "确认后 write_file 真正落盘");

    const decision = ledger.entries.find((entry) => entry.kind === "customer.decision");
    assert.ok(decision, "应有客户决定账本条目");
    assert.equal(decision!.actorRoleId, "rapporteur", "决定仍记在来源角色（judge 不伪装客户）");
    assert.equal(decision!.power, "proposal");
    assert.equal(decision!.customerDecision, "accepted");
    assert.equal(decision!.decisionEvidence?.kind, "judge", "decisionEvidence.kind 必须是 judge");
    assert.equal(decision!.decisionEvidence?.judge?.engine, "claude");
    assert.deepEqual(decision!.paths, [PROPOSAL_REL], "写盘确认逐路径入账");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

test("场景1b：空 preview 的新建文件写盘卡——判断桩仍交回 approve，但真实 driver 机械门槛回落手动卡", async () => {
  const h = await makeHarness({
    tag: "proposal-write-empty-preview",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId === "rapporteur" && ctx.turn === 1) {
        return [
          {
            name: "request_confirmation",
            toolCallId: "tc-proposal-write-empty",
            args: {
              // 标题/详情都不含路径 ⇒ judgeContext.paths = []；preview 为空。
              title: "写提案",
              flowId: FLOW,
              cardKind: "write",
            },
          },
          { name: "write_file", args: { path: PROPOSAL_REL, content: proposalDoc(FLOW) } },
        ];
      }
      return [];
    },
  });
  try {
    await h.open("rapporteur");
    const sending = h.send("rapporteur", "写提案（空 preview 对照）");
    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.ok(card.judgeNotice, "回落卡必须带 judgeNotice（如实说明未代批）");
    assert.match(card.judgeNotice!, /未代批|手动/);

    // 客户手动拒绝，让本轮收尾。注意：Rapporteur 的 Section 1（docs/proposals/）是**预授权目录**，
    // 因此 write_file 本身不依赖这张卡——本用例只钉「判断回落手动」这一事实，不把预授权当门禁。
    h.answer(card.id, { kind: "confirm", confirmed: false });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger((entries) => entries.some((entry) => entry.kind === "customer.decision"));
    assert.equal(
      ledger.entries.some((entry) => entry.decisionEvidence?.kind === "judge" && entry.customerDecision === "accepted"),
      false,
      "空 preview 不得产生 judge 代批的 accepted 决定",
    );
  } finally {
    await h.stop();
    h.cleanup();
  }
});
