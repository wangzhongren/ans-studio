// test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts
// 独立验收（测试角色，2026-10-18）：账本审计端到端——`decisionEvidence.kind:"judge"` 与
// `customer-input` 可区分；judge 不得伪装成客户；聊天行标「judge 代批 · 代决策/代审批」。
//
// 依据：PM 评审 §7.4/§7.5/§十、§十三 AC5/AC8/AC10/AC16/AC25。
// 链路全部离线：真实编排 `openRoleSession` + 真实受治理工具 + 真实桌面客户通道；
// 假模型脚本 = `request_choice` 工具调用；判断函数为假（不跑真实模型）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputOutcome, GovernanceJudgeRequest } from "../../../src/model/runtime.ts";
import {
  autoJudge,
  makeChannel,
  makeRoot,
  seedProject,
  toolAdapterFactory,
  trioProject,
  waitFor,
  waitForLedger,
  type ChannelHarness,
  type SessionCapture,
} from "./fixture.ts";
import { judgeResultSummary } from "../../../app/desktop/customer-input.ts";

const FLOW = "flow-a";
const PROPOSAL_SCRIPT = [{
  name: "request_choice",
  args: {
    title: "提案 flow-a",
    question: "是否接受提案？",
    flowId: FLOW,
    cardKind: "proposal",
    options: [
      { id: "accept", label: "接受" },
      { id: "reject", label: "拒绝" },
    ],
  },
}];

function bridge(h: ChannelHarness, root: string): CustomerInputFn {
  return (req, metadata) =>
    h.channel.customerInput(
      req,
      {
        roleId: "rapporteur",
        runtime: "claude",
        projectRoot: root,
        governanceModel: "trio",
        turnText: "请形成提案并请客户决定。",
      },
      metadata,
    ) as Promise<CustomerInputOutcome>;
}

async function openRapporteur(root: string, h: ChannelHarness, script: Array<{ name: string; args: Record<string, unknown> }>) {
  const capture: SessionCapture = { results: [] };
  const handle = await openRoleSession(
    {
      roleId: "rapporteur",
      runtime: "claude",
      project: trioProject(root),
      taskId: "T-judge-audit",
      customerInput: bridge(h, root),
    },
    { createAdapter: toolAdapterFactory(capture, { root, script }) },
  );
  return { handle, capture };
}

async function drive(handle: { send(text: string): Promise<void>; events(): AsyncIterable<{ kind?: string }> }, text: string): Promise<void> {
  await handle.send(text);
  for await (const event of handle.events()) {
    if (event.kind === "settled") break;
  }
}

test("proposal 代批：0 卡、1 行、账本 kind=judge（group/cardKind/engine/model/selected/evidence），actor/power 不伪装", async () => {
  const { root, cleanup } = makeRoot("audit-approve");
  try {
    seedProject(root);
    const judgeRequests: GovernanceJudgeRequest[] = [];
    const h = makeChannel({ root, decision: true, fn: autoJudge((request) => ({
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      model: "fixture-model",
      reasonCode: "sufficient",
      reason: "提案与流程事实一致。",
      evidence: ["docs/proposals/flow-a-v1.md", "facts.proposalDecision=accepted"],
      value: { selected: ["accept"] },
      durationMs: 12,
      readCalls: 1,
      readBytes: 512,
    }), judgeRequests) });
    const { handle, capture } = await openRapporteur(root, h, PROPOSAL_SCRIPT);
    await drive(handle, "请形成提案并请客户决定");
    await handle.dispose();

    const ledger = await waitForLedger(root, (entries) => entries.some((entry) => entry.decisionKind === "proposal-accept"));
    assert.deepEqual(ledger.errors, [], "账本不得有坏行");
    const entry = ledger.entries.find((candidate) => candidate.decisionKind === "proposal-accept");
    assert.ok(entry !== undefined, "必须写入客户决定");
    assert.equal(entry.customerDecision, "accepted");
    assert.equal(entry.actorRoleId, "rapporteur", "actorRoleId 仍是发起治理角色");
    assert.equal(entry.power, "proposal", "power 不写成 judge");
    assert.equal(entry.decisionEvidence?.kind, "judge", "判断代批必须标 judge");
    assert.equal(entry.decisionEvidence?.judge?.group, "decision");
    assert.equal(entry.decisionEvidence?.judge?.cardKind, "proposal");
    assert.equal(entry.decisionEvidence?.judge?.engine, "claude");
    assert.equal(entry.decisionEvidence?.judge?.model, "fixture-model");
    assert.equal(entry.decisionEvidence?.judge?.reasonCode, "sufficient");
    assert.ok((entry.decisionEvidence?.judge?.reason ?? "").length > 0);
    assert.deepEqual(entry.decisionEvidence?.judge?.selected, ["accept"]);
    assert.ok(Array.isArray(entry.decisionEvidence?.judge?.evidence) && entry.decisionEvidence!.judge!.evidence!.length > 0);
    assert.equal(entry.decisionEvidence?.judge?.durationMs, 12);
    assert.equal(entry.decisionEvidence?.judge?.readCalls, 1);
    assert.equal(entry.decisionEvidence?.judge?.readBytes, 512);

    assert.equal(h.presented.length, 0, "代批成功必须 0 卡");
    assert.equal(h.rows.length, 1, "代批成功必须恰 1 行结果");
    assert.equal(h.nextSteps.length, 1, "onNextStep 恰一次（先派 Convener 写流程单）");
    assert.equal((h.nextSteps[0]!.payload as { roleId?: string }).roleId, "convener");
    assert.equal((h.nextSteps[0]!.payload as { followUp?: string }).followUp, "nomination-after-flow");

    // 工具回执口径（AC25）：不得说成客户本人点击。
    const receipt = capture.results.find((result) => result.name === "request_choice");
    assert.ok(receipt !== undefined && receipt.ok, receipt?.message ?? "工具回执缺失");
    assert.match(receipt!.message, /判断 agent/);
    assert.match(receipt!.message, /已代批/);
    assert.match(receipt!.message, /这不是客户本人点击/);
    assert.doesNotMatch(receipt!.message, /客户已选择/);

    // 聊天行（AC16）：含「judge 代批 · 代决策」，不含「客户本人已批准」。
    const summary = judgeResultSummary(h.rows[0]!);
    assert.match(summary, /judge 代批 · 代决策/);
    assert.match(summary, /接受提案/);
    assert.doesNotMatch(summary, /客户本人/);

    // 判断请求携带应用事实（judgeContext 由 run-role 计算，桌面只消费）。
    assert.equal(judgeRequests.length, 1);
    assert.equal(judgeRequests[0]!.facts.flowId, FLOW);
    assert.equal(judgeRequests[0]!.facts.ledgerErrors, 0);
    assert.equal(judgeRequests[0]!.artifacts?.proposalPath, "docs/proposals/flow-a-v1.md");
    assert.equal(judgeRequests[0]!.roleId, "rapporteur");
  } finally {
    cleanup();
  }
});

test("回落 → 客户手答：原卡 + judgeNotice，账本仍是 customer-input，不写 judge 子字段", async () => {
  const { root, cleanup } = makeRoot("audit-customer");
  try {
    seedProject(root);
    const h = makeChannel({
      root,
      decision: true,
      fn: autoJudge((request) => ({
        verdict: "manual",
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
        reasonCode: "insufficient-evidence",
        reason: "提案验收口径缺少证据。",
      })),
    });
    const { handle, capture } = await openRapporteur(root, h, PROPOSAL_SCRIPT);
    const running = drive(handle, "请形成提案并请客户决定");
    await waitFor(() => h.presented.length === 1);
    assert.match(h.presented[0]!.judgeNotice ?? "", /判断 agent 未代批（代决策）/, "回落卡必须带人话提示");
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    await running;
    await handle.dispose();

    const ledger = await waitForLedger(root, (entries) => entries.some((entry) => entry.decisionKind === "proposal-accept"));
    const entry = ledger.entries.find((candidate) => candidate.decisionKind === "proposal-accept");
    assert.ok(entry !== undefined);
    assert.equal(entry.decisionEvidence?.kind, "customer-input", "客户手批必须保持 customer-input");
    assert.equal(entry.decisionEvidence?.judge, undefined, "客户手批不得带 judge 子字段");
    assert.equal(entry.actorRoleId, "rapporteur");
    assert.equal(entry.power, "proposal");
    assert.equal(h.rows.length, 0, "manual 不产生结果行");
    assert.equal(h.nextSteps.length, 1, "客户手答后下一步仍恰一次");

    const receipt = capture.results.find((result) => result.name === "request_choice");
    assert.match(receipt!.message, /客户已选择/, "客户手答保持原文案");
    assert.doesNotMatch(receipt!.message, /判断 agent/);
  } finally {
    cleanup();
  }
});

test("写盘代批：账本 kind=judge、group=approval、judge.paths 逐路径；聊天行「代审批」", async () => {
  const { root, cleanup } = makeRoot("audit-write");
  try {
    seedProject(root);
    const judgeRequests: GovernanceJudgeRequest[] = [];
    const h = makeChannel({
      root,
      approval: true,
      fn: autoJudge((request) => ({
        verdict: "approve",
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
        model: "fixture-model",
        reasonCode: "sufficient",
        reason: "预览与提案一致，路径均在写区内。",
        evidence: ["docs/proposals/flow-a-v1.md"],
        value: { confirmed: true },
        paths: request.paths,
        pathDecisions: (request.paths ?? []).map((path) => ({ path, ok: true })),
      }), judgeRequests),
    });
    const { handle } = await openRapporteur(root, h, [{
      name: "request_confirmation",
      args: {
        title: "写盘确认 flow-a",
        // 2026-10-19 呈现前完整性闸：声明路径后须有可核对正文。
        preview: "将写入 docs/proposals/flow-a-v1.md\n\n提案正文：目标、范围与验收标准。\n",
        flowId: FLOW,
        cardKind: "write",
      },
    }]);
    await drive(handle, "请写入提案文件");
    await handle.dispose();

    const ledger = await waitForLedger(root, (entries) =>
      entries.some((entry) => entry.kind === "customer.decision" && entry.decisionEvidence?.kind === "judge" && entry.decisionEvidence?.judge?.group === "approval"),
    );
    const entry = ledger.entries.find((candidate) => candidate.decisionEvidence?.judge?.group === "approval");
    assert.ok(entry !== undefined);
    assert.equal(entry.customerDecision, "accepted");
    assert.equal(entry.actorRoleId, "rapporteur");
    assert.equal(entry.power, "proposal");
    assert.equal(entry.decisionEvidence?.kind, "judge");
    assert.equal(entry.decisionEvidence?.judge?.cardKind, "write");
    assert.equal(entry.decisionEvidence?.judge?.confirmed, true);
    assert.deepEqual(entry.decisionEvidence?.judge?.paths, ["docs/proposals/flow-a-v1.md"]);
    assert.deepEqual(entry.decisionEvidence?.judge?.pathDecisions?.map((decision) => ({ path: decision.path, ok: decision.ok })), [
      { path: "docs/proposals/flow-a-v1.md", ok: true },
    ]);
    assert.ok(Array.isArray(entry.paths) && entry.paths.includes("docs/proposals/flow-a-v1.md"), "发行路径仍照旧入账");

    assert.equal(h.presented.length, 0, "写盘代批成功 0 卡");
    assert.equal(h.rows.length, 1);
    assert.match(judgeResultSummary(h.rows[0]!), /judge 代批 · 代审批/);
    assert.equal(judgeRequests.length, 1);
    assert.deepEqual(judgeRequests[0]!.paths, ["docs/proposals/flow-a-v1.md"]);
    assert.equal(judgeRequests[0]!.pathProbes?.[0]?.allowed, true, "pathProbes 由 run-role 用 resolveWrite 计算");
  } finally {
    cleanup();
  }
});

test("group 交叉校验：judge.group 与 cardKind 映射不一致只记诊断，不翻转决定、不改归因", async () => {
  const { root, cleanup } = makeRoot("audit-mismatch");
  try {
    seedProject(root);
    const h = makeChannel({
      root,
      decision: true,
      fn: autoJudge((request) => ({
        verdict: "approve",
        group: "approval", // 防御性错组（通道已按 cardKind 派生 decision）
        cardKind: request.cardKind,
        engine: request.runtime,
        reasonCode: "sufficient",
        reason: "故意错组。",
        evidence: ["fixture"],
        value: { selected: ["accept"] },
      })),
    });
    // 通道本身会先按 group-mismatch 回落（§4.3-2 防御），因此这里只证明不会变成 customer-input。
    const { handle } = await openRapporteur(root, h, PROPOSAL_SCRIPT);
    const running = drive(handle, "请形成提案并请客户决定");
    await waitFor(() => h.presented.length === 1);
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    await running;
    await handle.dispose();
    const ledger = await waitForLedger(root, (entries) => entries.some((entry) => entry.decisionKind === "proposal-accept"));
    const entry = ledger.entries.find((candidate) => candidate.decisionKind === "proposal-accept");
    assert.ok(entry !== undefined);
    assert.equal(entry.decisionEvidence?.kind, "customer-input", "错组判断不得按 judge 结算");
  } finally {
    cleanup();
  }
});
