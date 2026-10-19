// test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts
// 场景 1（离线端到端）：**首次新建提案 write 卡**——Rapporteur 写尚不存在的
// `docs/proposals/<flow>-v1.md`；双开关全开 + 判断桩 allow ⇒ 0 张手动卡、账本
// `decisionEvidence.kind:"judge"`；空 preview ⇒ 真实 driver 机械门槛 manual ⇒ **自动退回发起角色**
//（declined + 可操作原因，不呈现客户卡；2026-10-19 客户总原则）。
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

test("场景1b：空 preview 的写盘卡 manual ⇒ 自动退回发起角色（declined + 原因），不呈现客户卡", async () => {
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
    const sent = await h.send("rapporteur", "写提案（空 preview 对照）");
    assert.equal(sent.ok, true, sent.error ?? "");

    // 2026-10-19 客户总原则：开关开启且判断实际运行后，manual/deny 不再呈现客户卡，
    // 直接 declined + 可操作原因回投发起角色（operatorId=judge:<engine>）；角色同轮可修正重发。
    assert.equal(h.presented.length, 0, "manual 自动退回，不呈现客户卡");
    assert.equal(h.judgeRows.length, 0, "manual 不产生 approve 结果行");
    const receipt = h.results.find((result) => result.name === "request_confirmation");
    assert.ok(receipt, "发起角色应收到 request_confirmation 的 declined 回执");
    assert.equal(receipt!.ok, false, "回执必须是拒绝，不得伪造同意");
    assert.match(receipt!.message, /自动审批未通过|自动审批拒绝/, "回执须说明自动审批未通过/拒绝");
    assert.match(receipt!.message, /重新提交/, "回执须给出可操作的修正后重试指引");
    assert.doesNotMatch(receipt!.message, /客户已选择|客户已确认/, "不得伪装客户同意");

    // judge declined 不是客户决定：不写 customer.decision 账本（避免 unclassified/none 挡收尾门）。
    const ledger = await h.waitForLedger(() => true);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "customer.decision"),
      false,
      "judge declined 不得写客户决定账本",
    );
  } finally {
    await h.stop();
    h.cleanup();
  }
});
