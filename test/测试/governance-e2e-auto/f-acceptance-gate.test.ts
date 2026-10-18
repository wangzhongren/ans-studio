// test/测试/governance-e2e-auto/f-acceptance-gate.test.ts
// 场景 6（离线端到端）：**验收门槛**——步骤未全 done / 缺 dispatch.accepted / 有阻塞步骤 /
// 有未结算决定 ⇒ 验收不代批（原卡 + judgeNotice）；全部满足 ⇒ 代批。
//
// 走真实 Proof / 验收（verifier）会话 + 真实判断 driver：机械门槛读流程单与账本，假判断会话只是交回 approve。
// 「负向仍 manual」由产品门槛产生，不是桩函数伪造。Draft / 提案 不再发 acceptance（结构性拒绝）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  FLOW_REL,
  PROPOSAL_REL,
  flowDoc,
  makeHarness,
  makeRoot,
  proposalDoc,
  seedLedger,
  seedTrioProject,
  write,
  type Harness,
} from "./fixture.ts";
import type { GovernanceLedgerEntry } from "../../../src/common/编排/governance-ledger.ts";

const ACCEPTANCE_CARD = {
  name: "request_choice",
  toolCallId: "tc-acceptance",
  args: {
    title: `验收 ${FLOW}`,
    question: "是否验收通过？",
    flowId: FLOW,
    cardKind: "acceptance",
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "不通过" },
    ],
  },
};

interface CaseLedger {
  entries: Array<Partial<GovernanceLedgerEntry>>;
}

async function runCase(opts: {
  tag: string;
  steps: Array<{ id: string; status?: string }>;
  ledger: CaseLedger;
}): Promise<{ harness: Harness; cleanup(): Promise<void>; cleanupRoot(): void }> {
  const temp = makeRoot(opts.tag);
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW));
  write(temp.root, FLOW_REL, flowDoc(FLOW, opts.steps));
  await seedLedger(temp.root, opts.ledger.entries);
  const h = await makeHarness({
    tag: opts.tag,
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => (ctx.roleId === "verifier" ? [ACCEPTANCE_CARD] : []),
  });
  await h.open("verifier");
  return {
    harness: h,
    async cleanup() {
      await h.stop();
      h.cleanup();
    },
    cleanupRoot: () => temp.cleanup(),
  };
}

const ACCEPTED: Partial<GovernanceLedgerEntry> = {
  decisionKind: "proposal-accept",
  customerDecision: "accepted",
  actorRoleId: "rapporteur",
  power: "proposal",
};
const DISPATCHED: Partial<GovernanceLedgerEntry> = {
  kind: "dispatch.accepted",
  actorRoleId: "convener",
  power: "schedule",
  stepId: "impl",
  targetRoleId: "executor",
};

test("场景6a：步骤未全 done ⇒ 验收不代批（manual + 原卡）", async () => {
  const c = await runCase({
    tag: "acceptance-pending",
    steps: [
      { id: "impl", status: "done" },
      { id: "verify", status: "pending" },
    ],
    ledger: { entries: [ACCEPTED, DISPATCHED] },
  });
  try {
    const sending = c.harness.send("verifier", "请请客户验收。");
    await c.harness.waitFor(() => c.harness.presented.length === 1, 5000);
    const card = c.harness.presented[0]!;
    assert.match(card.judgeNotice ?? "", /未代批/);
    assert.match(card.judgeNotice ?? "", /证据不足|未完成|待派发|阻塞/);
    c.harness.answer(card.id, { kind: "choice", selected: ["reject"] });
    await sending;
    assert.equal(c.harness.judgeRows.length, 0, "manual 不产生 judge 结果行");
  } finally {
    await c.cleanup();
    c.cleanupRoot();
  }
});

test("场景6b：步骤全 done 但缺 dispatch.accepted ⇒ 验收不代批", async () => {
  const c = await runCase({
    tag: "acceptance-missing-dispatch",
    steps: [{ id: "impl", status: "done" }],
    ledger: { entries: [ACCEPTED] },
  });
  try {
    const sending = c.harness.send("verifier", "请请客户验收。");
    await c.harness.waitFor(() => c.harness.presented.length === 1, 5000);
    const card = c.harness.presented[0]!;
    assert.match(card.judgeNotice ?? "", /dispatch\.accepted|未代批/);
    c.harness.answer(card.id, { kind: "choice", selected: ["reject"] });
    await sending;
    assert.equal(c.harness.judgeRows.length, 0);
  } finally {
    await c.cleanup();
    c.cleanupRoot();
  }
});

test("场景6c：有阻塞步骤 ⇒ 验收不代批", async () => {
  const c = await runCase({
    tag: "acceptance-blocked",
    steps: [{ id: "impl", status: "blocked" }],
    ledger: { entries: [ACCEPTED, DISPATCHED] },
  });
  try {
    const sending = c.harness.send("verifier", "请请客户验收。");
    await c.harness.waitFor(() => c.harness.presented.length === 1, 5000);
    const card = c.harness.presented[0]!;
    assert.match(card.judgeNotice ?? "", /未代批/);
    c.harness.answer(card.id, { kind: "choice", selected: ["reject"] });
    await sending;
    assert.equal(c.harness.judgeRows.length, 0);
  } finally {
    await c.cleanup();
    c.cleanupRoot();
  }
});

test("场景6d：有未结算决定 ⇒ 验收不代批", async () => {
  const c = await runCase({
    tag: "acceptance-unresolved",
    steps: [{ id: "impl", status: "done" }],
    ledger: {
      entries: [
        ACCEPTED,
        DISPATCHED,
        // 2026-10-18 新口径：旧账本无 cardKind 的 unclassified/none 不算未结算；这里用真实的
        // 治理决定但缺最终决定（none）来制造「未结算」。
        { decisionKind: "appointment", customerDecision: "none", actorRoleId: "nominator", power: "nomination" },
      ],
    },
  });
  try {
    const sending = c.harness.send("verifier", "请请客户验收。");
    await c.harness.waitFor(() => c.harness.presented.length === 1, 5000);
    const card = c.harness.presented[0]!;
    assert.match(card.judgeNotice ?? "", /未结算|未代批/);
    c.harness.answer(card.id, { kind: "choice", selected: ["reject"] });
    await sending;
    assert.equal(c.harness.judgeRows.length, 0);
  } finally {
    await c.cleanup();
    c.cleanupRoot();
  }
});

test("场景6e：全部满足（全 done + 每步 dispatch.accepted + 未结算为 0）⇒ 验收代批（0 卡）", async () => {
  const c = await runCase({
    tag: "acceptance-ok",
    steps: [{ id: "impl", status: "done" }],
    ledger: { entries: [ACCEPTED, DISPATCHED] },
  });
  try {
    const sent = await c.harness.send("verifier", "请请客户验收。");
    assert.equal(sent.ok, true, sent.error ?? "");
    assert.equal(c.harness.presented.length, 0, "满足门槛 ⇒ 0 张手动卡");
    assert.equal(c.harness.judgeRows.length, 1);
    assert.equal(c.harness.judgeRows[0]!.cardKind, "acceptance");
    const ledger = await c.harness.waitForLedger((entries) =>
      entries.some((entry) => entry.decisionKind === "acceptance"),
    );
    const acceptance = ledger.entries.find((entry) => entry.decisionKind === "acceptance");
    assert.ok(acceptance, "应写验收决定");
    assert.equal(acceptance!.decisionEvidence?.kind, "judge", "验收代批也带 judge 证据");
    assert.equal(acceptance!.customerDecision, "accepted");
  } finally {
    await c.cleanup();
    c.cleanupRoot();
  }
});

test("Draft 不能发 acceptance：rapporteur 的 request_choice(acceptance) 被结构性拒绝", async () => {
  const temp = makeRoot("acceptance-wrong-role");
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW));
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "done" }]));
  await seedLedger(temp.root, [ACCEPTED, DISPATCHED]);
  const h = await makeHarness({
    tag: "acceptance-wrong-role",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => (ctx.roleId === "rapporteur" ? [ACCEPTANCE_CARD] : []),
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请发起验收。");
    assert.equal(sent.ok, true, sent.error ?? "");
    const receipt = h.results.find((entry) => entry.name === "request_choice");
    assert.ok(receipt, "应有 request_choice 工具回执");
    assert.equal(receipt!.ok, false, "Draft 不得发 acceptance（角色卡种白名单结构性拒绝）");
    assert.match(receipt!.message, /acceptance|不允许|拒绝/);
    assert.equal(h.presented.length, 0, "不得弹验收卡");
    assert.equal(h.judgeRows.length, 0, "判断 agent 不得介入");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
