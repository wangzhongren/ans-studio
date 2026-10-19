// test/测试/governance-e2e-auto/f-acceptance-gate.test.ts
// 场景 6（离线端到端）：**验收门槛**——步骤未全 done / 缺 dispatch.accepted / 有阻塞步骤 /
// 有未结算决定 ⇒ 验收不代批（原卡 + judgeNotice）；全部满足 ⇒ 代批。
//
// 走真实 Proof / 验收（verifier）会话 + 真实判断 driver：机械门槛读流程状态 YAML 与账本，假判断会话只是交回 approve。
// 「负向仍 manual」由产品门槛产生，不是桩函数伪造。Draft / 提案 不再发 acceptance（结构性拒绝）。
//
// 2026-10-19 Flow YAML 契约：本文件走 **YAML-only**（`docs/flows/flow-a.yaml`，**不写同名 .md**）。
// 历史：证据包曾只按 Markdown 解析 flow 物证，YAML 流程的验收卡恒回落 manual（「流程单缺少可解析的步骤表」）；
// 编排已修复为 `.yaml|.yml` 用 `parseFlowStateYaml` 提取 steps、非法给 `flow-state-invalid`（具体 path+message）。
// 本文件同时守住该修复：正向必须自动代批（证据包完整）；非法 YAML 必须手动并给出具体路径错误，
// 而不是旧的笼统「缺少可解析的步骤表」。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  FLOW_REL,
  PROPOSAL_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  proposalDoc,
  seedConfirmedIntent,
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
  // 前置：客户已确认意图（decision 组判断的意图基准）；否则验收卡在意图定位处 fail-closed。
  await seedConfirmedIntent(temp.root);
  const h = await makeHarness({
    tag: opts.tag,
    root: temp.root,
    approval: true,
    decision: true,
    // 只应答本用例的验收请求：YAML-only 流程在导入时会触发应用自动派一条验收复核任务；
    // 该后台任务不是本用例测点，返回空脚本避免它先消耗/占用验收决定（产品判定不受影响）。
    scriptForRole: (ctx) =>
      ctx.roleId === "verifier" && ctx.prompt.includes("请请客户验收") ? [ACCEPTANCE_CARD] : [],
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
      { id: "verification", status: "pending" },
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
    steps: [{ id: "impl", status: "done" }, { id: "verification", status: "pending" }],
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
    steps: [{ id: "impl", status: "blocked" }, { id: "verification", status: "pending" }],
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
    steps: [{ id: "impl", status: "done" }, { id: "verification", status: "pending" }],
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
    steps: [{ id: "impl", status: "done" }, { id: "verification", status: "pending" }],
    ledger: { entries: [ACCEPTED, DISPATCHED] },
  });
  try {
    const sent = await c.harness.send("verifier", "请请客户验收。");
    assert.equal(sent.ok, true, sent.error ?? "");
    assert.equal(c.harness.presented.length, 0, "满足门槛 ⇒ 0 张手动卡");
    assert.equal(c.harness.judgeRows.length, 1);
    assert.equal(c.harness.judgeRows[0]!.cardKind, "acceptance");
    // 2026-10-19 证据包 YAML 修复守卫：正向代批必须来自完整证据包；旧「缺少可解析的步骤表」
    // （证据包把 YAML 当 Markdown 解析）若复发，会在这里以 manual / insufficient-evidence 暴露。
    assert.equal(c.harness.judgeRows[0]!.reasonCode, "sufficient", "正向代批须为 sufficient（证据包完整）");
    assert.equal(
      (c.harness.judgeRows[0]!.reason ?? "").includes("缺少可解析的步骤表"),
      false,
      "证据包已按 Flow YAML 解析 steps，不再报旧 Markdown 缺口",
    );
    assert.equal(exists(c.harness.root, "docs/flows/flow-a.md"), false, "YAML-only：不得写同名 .md 人读视图");
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

test("场景6f：Flow YAML 非法 ⇒ 验收不代批，证据包给具体 path（flow-state-invalid），不再报旧 Markdown 缺口", async () => {
  const temp = makeRoot("acceptance-invalid-flow");
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW));
  // YAML-only 且非法：done 步骤缺 evidence ⇒ `parseFlowStateYaml` 报 steps[0].evidence 具体路径。
  write(
    temp.root,
    FLOW_REL,
    [
      "flowId: flow-a",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: impl",
      "    title: impl",
      "    owner: executor",
      "    kind: dispatch",
      "    status: done",
      "",
    ].join("\n"),
  );
  await seedLedger(temp.root, [ACCEPTED, DISPATCHED]);
  await seedConfirmedIntent(temp.root);
  const h = await makeHarness({
    tag: "acceptance-invalid-flow",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) =>
      ctx.roleId === "verifier" && ctx.prompt.includes("请请客户验收") ? [ACCEPTANCE_CARD] : [],
  });
  try {
    await h.open("verifier");
    const sending = h.send("verifier", "请请客户验收。");
    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.match(card.judgeNotice ?? "", /flow-a\.yaml/, "错误须点名具体流程 YAML 路径");
    assert.match(card.judgeNotice ?? "", /steps\[0\]\.evidence/, "错误须含具体 YAML 文档路径");
    assert.match(card.judgeNotice ?? "", /必须提供 evidence/, "错误须说明具体原因");
    assert.doesNotMatch(card.judgeNotice ?? "", /缺少可解析的步骤表/, "不得再出现旧 Markdown 证据缺口文案");
    assert.equal(h.judgeRows.length, 0, "manual 不产生 judge 结果行");
    h.answer(card.id, { kind: "choice", selected: ["reject"] });
    await sending;
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("Draft 不能发 acceptance：rapporteur 的 request_choice(acceptance) 被结构性拒绝", async () => {
  const temp = makeRoot("acceptance-wrong-role");
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW));
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "done" }, { id: "verification", status: "pending" }]));
  await seedLedger(temp.root, [ACCEPTED, DISPATCHED]);
  await seedConfirmedIntent(temp.root);
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
