// test/测试/governance-judge-cards-verify/b-card-kinds.test.ts
// 独立验收（测试角色，2026-10-18）：六卡种 + accept-quick——真实 `createGovernanceJudge` 驱动、
// 真实只读工具、假模型适配器。
//
// 依据：PM 评审 §七（driver/verdict/rubric）、§十三 AC5–AC13/AC15/AC22/AC23。
// 全部离线：模型动作用假适配器脚本表达（读取 → report_governance_judgement），不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  approveOutcome,
  clearLedger,
  makeJudge,
  makeRoot,
  intentLedgerEntries,
  nominationDoc,
  requestFor,
  seedProject,
  write,
  writeLedger,
  FLOW_REL,
  INTENT_REL,
  NOMINATION_REL,
  PROPOSAL_REL,
  type JudgeScript,
} from "./fixture.ts";
import { governanceJudgeAuditOf } from "../../../src/common/编排/governance-judge.ts";
import { GOVERNANCE_JUDGE_TOOL_NAMES } from "../../../src/common/runtime-core/governance-judge/tools.ts";

const report = (over: Record<string, unknown>) => ({
  verdict: "approve",
  reason: "应用事实与物证一致，可代批。",
  evidence: ["应用事实：flowId/路径/账本均一致"],
  ...over,
});

async function run(root: string, request: ReturnType<typeof requestFor>, script: JudgeScript) {
  const { judge, fake } = makeJudge(root, script);
  const outcome = await judge(request);
  return { outcome, fake };
}

test("proposal：读规范提案后仅 accept 可代批；审计含 group/cardKind/engine/model/evidence/selected", async () => {
  const { root, cleanup } = makeRoot("proposal");
  try {
    seedProject(root);
    const request = requestFor("proposal");
    const { outcome, fake } = await run(root, request, {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(outcome.verdict, "approve", outcome.reason ?? "");
    assert.equal(outcome.reasonCode, "sufficient");
    assert.equal(outcome.group, "decision");
    assert.equal(outcome.cardKind, "proposal");
    assert.equal(outcome.engine, "claude");
    assert.equal(outcome.model, "fixture-model");
    assert.deepEqual(outcome.value?.selected, ["accept"]);
    assert.ok((outcome.evidence ?? []).length > 0);
    assert.deepEqual(fake.seen.toolNames[0], [...GOVERNANCE_JUDGE_TOOL_NAMES], "judge 工具恰三只");
    assert.equal(fake.seen.stats?.readPaths?.includes(PROPOSAL_REL), true, "必须记录已读规范物证");
    assert.equal(fake.seen.gate?.(PROPOSAL_REL).allowed, false, "判断会话注入 deny-all 写门禁");
    assert.equal(fake.seen.capabilities?.persistSession, false, "判断会话不持久化");
    assert.ok(fake.seen.capabilities?.governanceJudge !== undefined, "判断会话只拿到治理 judge 只读能力");

    const audit = governanceJudgeAuditOf(outcome)!;
    assert.equal(audit.group, "decision");
    assert.equal(audit.cardKind, "proposal");
    assert.equal(audit.engine, "claude");
    assert.equal(audit.model, "fixture-model");
    assert.equal(audit.reasonCode, "sufficient");
    assert.ok((audit.reason ?? "").length > 0);
    assert.deepEqual(audit.selected, ["accept"]);
    assert.ok(Array.isArray(audit.evidence) && audit.evidence.length > 0);
  } finally {
    cleanup();
  }
});

test("accept-quick 不代批：只选 accept-quick / 多选含快捷路径 / 卡片无 accept 均回落", async () => {
  const { root, cleanup } = makeRoot("accept-quick");
  try {
    seedProject(root);
    const quickOnly = await run(root, requestFor("proposal", {
      card: {
        kind: "choice", title: "快捷提案", cardKind: "proposal", flowId: "flow-a",
        options: [{ id: "accept-quick", label: "快捷接受" }],
      },
    }), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept-quick"] }),
    });
    assert.equal(quickOnly.outcome.verdict, "manual", "只有 accept-quick 的卡不得代批");
    assert.equal(quickOnly.outcome.reasonCode, "not-recommended");

    const choseQuick = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept-quick"] }),
    });
    assert.equal(choseQuick.outcome.verdict, "manual");
    assert.equal(choseQuick.outcome.reasonCode, "not-recommended");

    const both = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept", "accept-quick"] }),
    });
    assert.equal(both.outcome.verdict, "manual");

    // 同一张卡只选 accept 仍可代批（不扩大为快捷路径）。
    const acceptOnly = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(acceptOnly.outcome.verdict, "approve");
    assert.deepEqual(acceptOnly.outcome.value?.selected, ["accept"]);
  } finally {
    cleanup();
  }
});

test("appointment：按推荐集多选代批；选多/选少/重复/内置 id/无推荐集/单选多推荐均回落", async () => {
  const { root, cleanup } = makeRoot("appointment");
  try {
    seedProject(root);
    const base = requestFor("appointment", { recommendedRoleIds: ["role-x", "role-y"] });
    const ok = await run(root, base, {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-y", "role-x"] }),
    });
    assert.equal(ok.outcome.verdict, "approve", ok.outcome.reason ?? "");
    assert.deepEqual([...(ok.outcome.value?.selected ?? [])].sort(), ["role-x", "role-y"]);

    const fewer = await run(root, base, {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-x"] }),
    });
    assert.equal(fewer.outcome.verdict, "manual");
    assert.equal(fewer.outcome.reasonCode, "not-recommended");

    const more = await run(root, base, {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-x", "role-y", "role-z"] }),
    });
    assert.equal(more.outcome.verdict, "manual");

    const duplicate = await run(root, base, {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-x", "role-x"] }),
    });
    assert.equal(duplicate.outcome.verdict, "manual");

    // 证据包对账口径（2026-10-19）：提名文件的机器可读推荐集必须与 request/recommendedRoleIds 一致；
    // 下面的负向子场景各自把提名文件改成与 request 一致的内容，确保测的是目标规则本身。
    write(root, NOMINATION_REL, nominationDoc(["liaison"]));
    const builtIn = await run(root, requestFor("appointment", {
      recommendedRoleIds: ["liaison"],
      card: {
        kind: "choice", title: "任命", cardKind: "appointment", flowId: "flow-a",
        multiple: true,
        options: [{ id: "liaison", label: "联络官" }, { id: "role-x", label: "X" }],
      },
    }), {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["liaison"] }),
    });
    assert.equal(builtIn.outcome.verdict, "manual", "内置治理角色不得被代批任命");
    assert.equal(builtIn.outcome.reasonCode, "not-recommended");

    // 提名文件没有机器可读推荐集 ⇒ 证据包直接 insufficient-evidence（不启动模型）。
    write(root, NOMINATION_REL, nominationDoc([]));
    const missingRecommendation = await run(root, requestFor("appointment", { recommendedRoleIds: [] }), {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-x"] }),
    });
    assert.equal(missingRecommendation.outcome.verdict, "manual");
    assert.equal(missingRecommendation.outcome.reasonCode, "insufficient-evidence");

    write(root, NOMINATION_REL, nominationDoc(["role-zzz"]));
    const notInOptions = await run(root, requestFor("appointment", { recommendedRoleIds: ["role-zzz"] }), {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-zzz"] }),
    });
    assert.equal(notInOptions.outcome.verdict, "manual");
    assert.equal(notInOptions.outcome.reasonCode, "insufficient-evidence");

    write(root, NOMINATION_REL, nominationDoc());
    const singleSelect = await run(root, requestFor("appointment", {
      recommendedRoleIds: ["role-x", "role-y"],
      card: {
        kind: "choice", title: "任命", cardKind: "appointment", flowId: "flow-a",
        multiple: false,
        options: [{ id: "role-x", label: "X" }, { id: "role-y", label: "Y" }],
      },
    }), {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({ group: "decision", cardKind: "appointment", selected: ["role-x", "role-y"] }),
    });
    assert.equal(singleSelect.outcome.verdict, "manual");
    assert.equal(singleSelect.outcome.reasonCode, "not-recommended");
  } finally {
    cleanup();
  }
});

test("写盘三卡：逐路径机械复核 + 来源匹配；模型自报 ok 不能绕过应用探测", async () => {
  const { root, cleanup } = makeRoot("writes");
  try {
    seedProject(root);

    const write = await run(root, requestFor("write"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({
        group: "approval", cardKind: "write", confirmed: true,
        pathDecisions: [{ path: PROPOSAL_REL, ok: true, reason: "预览与提案一致" }],
      }),
    });
    assert.equal(write.outcome.verdict, "approve", write.outcome.reason ?? "");
    assert.equal(write.outcome.value?.confirmed, true);
    assert.deepEqual(write.outcome.paths, [PROPOSAL_REL]);

    // appointment-write 的 facts.appointmentTargetRoleIds 必须与账本里的任命决定一致
    // （证据包会重读账本对账；夹具补齐真实账本事实）。
    const appointmentLedger = {
      kind: "customer.decision",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["project-a"],
    };
    writeLedger(root, [appointmentLedger]);
    const appointmentWrite = await run(root, requestFor("appointment-write"), {
      reads: [INTENT_REL, NOMINATION_REL, FLOW_REL, "角色卡/project-a/boundary.yaml"],
      report: report({
        group: "approval", cardKind: "appointment-write", confirmed: true,
        pathDecisions: [{ path: "角色卡/project-a/boundary.yaml", ok: true }],
      }),
    });
    assert.equal(appointmentWrite.outcome.verdict, "approve", appointmentWrite.outcome.reason ?? "");
    assert.deepEqual(appointmentWrite.outcome.paths, ["角色卡/project-a/boundary.yaml"]);
    clearLedger(root);

    const scheduleWrite = await run(root, requestFor("schedule-write"), {
      reads: [FLOW_REL],
      report: report({
        group: "approval", cardKind: "schedule-write", confirmed: true,
        pathDecisions: [{ path: FLOW_REL, ok: true }],
      }),
    });
    assert.equal(scheduleWrite.outcome.verdict, "approve", scheduleWrite.outcome.reason ?? "");
    assert.deepEqual(scheduleWrite.outcome.paths, [FLOW_REL]);

    // AC23：模型对越界路径报 ok:true，driver 仍按应用探测回落。
    const claimedOk = await run(root, requestFor("write", {
      pathProbes: [{ path: PROPOSAL_REL, allowed: false, reason: "越界" }],
    }), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({
        group: "approval", cardKind: "write", confirmed: true,
        pathDecisions: [{ path: PROPOSAL_REL, ok: true }],
      }),
    });
    assert.equal(claimedOk.outcome.verdict, "manual");
    assert.equal(claimedOk.outcome.reasonCode, "path-outside-boundary");

    const missingDecision = await run(root, requestFor("write"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "approval", cardKind: "write", confirmed: true, pathDecisions: [] }),
    });
    assert.equal(missingDecision.outcome.verdict, "manual");
    assert.equal(missingDecision.outcome.reasonCode, "path-unverified");

    const emptyPaths = await run(root, requestFor("write", { paths: [], pathProbes: [] }), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "approval", cardKind: "write", confirmed: true, pathDecisions: [] }),
    });
    assert.equal(emptyPaths.outcome.verdict, "manual");
    assert.equal(emptyPaths.outcome.reasonCode, "path-unverified");

    const wrongSource = await run(root, requestFor("write", {
      paths: [FLOW_REL],
      pathProbes: [{ path: FLOW_REL, allowed: true }],
      allowedPathRoots: ["docs/flows/"],
    }), {
      reads: [INTENT_REL, PROPOSAL_REL, FLOW_REL],
      report: report({
        group: "approval", cardKind: "write", confirmed: true,
        pathDecisions: [{ path: FLOW_REL, ok: true }],
      }),
    });
    assert.equal(wrongSource.outcome.verdict, "manual", "Rapporteur 的 write 不得越过来源写区");
    assert.equal(wrongSource.outcome.reasonCode, "path-outside-boundary");

    writeLedger(root, [appointmentLedger]);
    const wrongAppointee = await run(root, requestFor("appointment-write", {
      paths: ["角色卡/role-z/boundary.yaml"],
      pathProbes: [{ path: "角色卡/role-z/boundary.yaml", allowed: true }],
      allowedPathRoots: ["角色卡/"],
      facts: { appointmentTargetRoleIds: ["project-a"] },
    }), {
      reads: [INTENT_REL, NOMINATION_REL],
      report: report({
        group: "approval", cardKind: "appointment-write", confirmed: true,
        pathDecisions: [{ path: "角色卡/role-z/boundary.yaml", ok: true }],
      }),
    });
    assert.equal(wrongAppointee.outcome.verdict, "manual", "未任命的目标角色不得写角色卡");
    assert.equal(wrongAppointee.outcome.reasonCode, "path-outside-boundary");
    clearLedger(root);

    const wrongFlow = await run(root, requestFor("schedule-write", {
      paths: ["docs/flows/flow-b.md"],
      pathProbes: [{ path: "docs/flows/flow-b.md", allowed: true }],
      allowedPathRoots: ["docs/flows/"],
    }), {
      reads: [FLOW_REL],
      report: report({
        group: "approval", cardKind: "schedule-write", confirmed: true,
        pathDecisions: [{ path: "docs/flows/flow-b.md", ok: true }],
      }),
    });
    assert.equal(wrongFlow.outcome.verdict, "manual", "flowId 不一致不得代批");
    assert.equal(wrongFlow.outcome.reasonCode, "path-outside-boundary");
  } finally {
    cleanup();
  }
});

test("acceptance：最高门槛——提案已接受、无账本错误、无未闭环澄清；缺一回落", async () => {
  const { root, cleanup } = makeRoot("acceptance");
  try {
    seedProject(root);
    // 证据包会重读账本对账（2026-10-19）：facts 声称的 proposalDecision/dispatchedStepIds
    // 必须在账本里有对应记录；每个子场景按声称的事实种账本。
    const proposalAccept = {
      kind: "customer.decision",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
    };
    const dispatchImpl = { kind: "dispatch.accepted", actorRoleId: "app", power: "app", stepId: "impl" };
    writeLedger(root, [proposalAccept, dispatchImpl]);
    const script: JudgeScript = {
      reads: [INTENT_REL, PROPOSAL_REL, FLOW_REL],
      report: report({ group: "decision", cardKind: "acceptance", selected: ["accept"] }),
    };
    const ok = await run(root, requestFor("acceptance"), script);
    assert.equal(ok.outcome.verdict, "approve", ok.outcome.reason ?? "");
    assert.deepEqual(ok.outcome.value?.selected, ["accept"]);

    writeLedger(root, [
      { kind: "customer.decision", decisionKind: "proposal-revise", customerDecision: "changes-requested" },
      dispatchImpl,
    ]);
    const notAccepted = await run(root, requestFor("acceptance", {
      facts: { proposalDecision: "revise" },
    }), script);
    assert.equal(notAccepted.outcome.verdict, "manual");
    assert.equal(notAccepted.outcome.reasonCode, "insufficient-evidence");

    writeLedger(root, [dispatchImpl]);
    const noProposalDecision = await run(root, requestFor("acceptance", {
      facts: { proposalDecision: undefined },
    }), script);
    assert.equal(noProposalDecision.outcome.verdict, "manual");

    writeLedger(root, [
      proposalAccept,
      dispatchImpl,
      { kind: "clarification.requested", actorRoleId: "liaison", power: "liaison" },
    ]);
    const clarification = await run(root, requestFor("acceptance", {
      facts: { unresolvedClarificationCount: 1 },
    }), script);
    assert.equal(clarification.outcome.verdict, "manual");
    assert.equal(clarification.outcome.reasonCode, "insufficient-evidence");

    // 账本坏行：facts.ledgerErrors 必须与真实账本一致（证据包对账），验收机械门槛随即回落。
    // 意图基准两行保持合法：坏行场景测的是 ledger-unavailable，不是意图缺失（否则会先命中 intent-* 优先级）。
    write(root, ".ans/governance/ledger.jsonl", [
      ...intentLedgerEntries().map((entry) => JSON.stringify(entry)),
      "{\"kind\":\"customer.decision\"}",
    ].join("\n") + "\n");
    const ledgerBroken = await run(root, requestFor("acceptance", {
      facts: { ledgerErrors: 1, proposalDecision: undefined, dispatchedStepIds: [] },
    }), script);
    assert.equal(ledgerBroken.outcome.verdict, "manual");
    assert.equal(ledgerBroken.outcome.reasonCode, "ledger-unavailable");

    writeLedger(root, [proposalAccept, dispatchImpl]);
    const rejectChoice = await run(root, requestFor("acceptance"), {
      reads: [INTENT_REL, PROPOSAL_REL, FLOW_REL],
      report: report({ group: "decision", cardKind: "acceptance", selected: ["reject"] }),
    });
    assert.equal(rejectChoice.outcome.verdict, "manual", "judge 不得代拒绝");
    assert.equal(rejectChoice.outcome.reasonCode, "not-recommended");
  } finally {
    cleanup();
  }
});

test("acceptance 机械门槛（P6 补强）：流程未完成/缺 dispatch/阻塞/无步骤表/未结算决定 ⇒ 必须 manual", async () => {
  const { root, cleanup } = makeRoot("acceptance-mechanics");
  try {
    seedProject(root);
    const script: JudgeScript = {
      reads: [INTENT_REL, PROPOSAL_REL, FLOW_REL],
      report: report({ group: "decision", cardKind: "acceptance", selected: ["accept"] }),
    };
    const flow = (steps: string[]) => [
      `# 流程 flow-a`,
      "",
      "| 步骤 | 角色 | 状态 |",
      "| --- | --- | --- |",
      ...steps,
      "",
    ].join("\n");
    // 证据包对账口径（2026-10-19）：每个子场景按 request.facts 声称的事实种账本。
    const proposalAccept = {
      kind: "customer.decision",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
    };
    const dispatch = (stepId: string) => ({
      kind: "dispatch.accepted",
      actorRoleId: "app",
      power: "app",
      stepId,
    });

    // 流程仍有 pending 步骤。
    write(root, FLOW_REL, flow(["| impl | A | done |", "| verify | A | pending |"]));
    writeLedger(root, [proposalAccept, dispatch("impl"), dispatch("verify")]);
    const pending = await run(root, requestFor("acceptance", {
      facts: { dispatchedStepIds: ["impl", "verify"] },
    }), script);
    assert.equal(pending.outcome.verdict, "manual", "流程未完成不得代批验收");
    assert.equal(pending.outcome.reasonCode, "insufficient-evidence");
    assert.match(pending.outcome.reason ?? "", /未完成/);

    // 步骤都 done，但缺 dispatch.accepted。
    write(root, FLOW_REL, flow(["| impl | A | done |"]));
    writeLedger(root, [proposalAccept]);
    const missingDispatch = await run(root, requestFor("acceptance", {
      facts: { dispatchedStepIds: [] },
    }), script);
    assert.equal(missingDispatch.outcome.verdict, "manual");
    assert.equal(missingDispatch.outcome.reasonCode, "insufficient-evidence");
    assert.match(missingDispatch.outcome.reason ?? "", /dispatch\.accepted/);

    // blocked/escalated 均不是 done（fail-closed）。
    write(root, FLOW_REL, flow(["| impl | A | blocked |"]));
    writeLedger(root, [proposalAccept, dispatch("impl")]);
    const blocked = await run(root, requestFor("acceptance", {
      facts: { dispatchedStepIds: ["impl"] },
    }), script);
    assert.equal(blocked.outcome.verdict, "manual");
    assert.equal(blocked.outcome.reasonCode, "insufficient-evidence");

    // 流程单无可解析步骤表。
    write(root, FLOW_REL, "# 流程 flow-a\n\n没有步骤表。\n");
    writeLedger(root, [proposalAccept, dispatch("impl")]);
    const malformed = await run(root, requestFor("acceptance"), {
      reads: [INTENT_REL, PROPOSAL_REL, FLOW_REL],
      report: report({ group: "decision", cardKind: "acceptance", selected: ["accept"] }),
    });
    assert.equal(malformed.outcome.verdict, "manual");
    assert.equal(malformed.outcome.reasonCode, "insufficient-evidence");

    // 该流程仍有未结算决定（unclassified）。
    write(root, FLOW_REL, flow(["| impl | A | done |"]));
    writeLedger(root, [
      proposalAccept,
      dispatch("impl"),
      {
        kind: "customer.decision",
        actorRoleId: "nominator",
        power: "nomination",
        // 2026-10-18 新口径：旧账本无 cardKind 的 unclassified/none 不算未结算；用真实的
        // 治理决定但缺最终决定（none）制造「未结算」。
        decisionKind: "appointment",
        customerDecision: "none",
      },
    ]);
    const unsettled = await run(root, requestFor("acceptance"), script);
    assert.equal(unsettled.outcome.verdict, "manual");
    assert.equal(unsettled.outcome.reasonCode, "insufficient-evidence");
    assert.match(unsettled.outcome.reason ?? "", /未结算/);
  } finally {
    cleanup();
  }
});

test("required-read：未读必读物证 ⇒ artifact-not-read；读敏感文件 ⇒ read-denied；物证缺失 ⇒ 不启动会话", async () => {
  const { root, cleanup } = makeRoot("required-read");
  try {
    seedProject(root);
    const ENV_SENTINEL = "DO_NOT_LEAK";
    const SESSION_SENTINEL = "DO_NOT_LEAK_SESSION";
    // 有效账本行（at/kind/actorRoleId/power 齐全）：证据包会重读账本对账，坏行会被计为
    // ledgerErrors 并与 facts 漂移冲突（2026-10-19 证据包契约）。
    writeLedger(root, [
      { kind: "artifact.observed", actorRoleId: "rapporteur", power: "proposal", messageSummary: "ledger-readable" },
    ]);
    write(root, ".ans/sessions/private.jsonl", `{\"secret\":\"${SESSION_SENTINEL}\"}\n`);
    const notRead = await run(root, requestFor("proposal"), {
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(notRead.outcome.verdict, "manual");
    assert.equal(notRead.outcome.reasonCode, "artifact-not-read");

    // 2026-10-18 客户裁定：账本只读开放 ⇒ 读账本不再制造 read-denied。
    let ledgerReadable = false;
    const ledgerRead = await run(root, requestFor("proposal"), {
      beforeReport: async (tools) => {
        const result = await tools.get("judge_read_file")!.handler({ name: "judge_read_file", args: { path: ".ans/governance/ledger.jsonl" } });
        ledgerReadable = result.ok === true && result.message.includes("ledger-readable");
      },
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(ledgerReadable, true, "账本只读开放，判断可读");
    assert.equal(ledgerRead.outcome.verdict, "approve", "读账本不得让 approve 降级");

    // 契约：`.ans` 的 app-private 拒绝不计入 deniedReads（不触发 allow 降级）。
    let sessionDenied = false;
    const appPrivate = await run(root, requestFor("proposal"), {
      beforeReport: async (tools) => {
        const result = await tools.get("judge_read_file")!.handler({ name: "judge_read_file", args: { path: ".ans/sessions/private.jsonl" } });
        sessionDenied = result.ok === false
          && /应用私有数据/.test(result.message)
          && !result.message.includes(SESSION_SENTINEL);
      },
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(sessionDenied, true, "会话数据仍 app-private 拒绝且不泄露内容");
    assert.equal(appPrivate.outcome.verdict, "approve", "app-private 拒绝不构成读取损伤");

    // 真实敏感文件 `.env` 制造 read-denied；回落文案给出路径/类别且不泄露 sentinel。
    const denied = await run(root, requestFor("proposal"), {
      beforeReport: async (tools) => {
        const result = await tools.get("judge_read_file")!.handler({ name: "judge_read_file", args: { path: ".env" } });
        assert.equal(result.ok, false, ".env 必须被拒绝");
        assert.equal(result.message.includes(ENV_SENTINEL), false, "拒绝回执不得泄露 .env 内容");
      },
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(denied.outcome.verdict, "manual");
    assert.equal(denied.outcome.reasonCode, "read-denied", "读取被拒必须让 approve 降级");
    assert.match(denied.outcome.reason ?? "", /判断读取被拒：\.env（环境变量文件）/);
    assert.equal((denied.outcome.reason ?? "").includes(ENV_SENTINEL), false, "回落文案不得泄露 .env 内容");

    const missingArtifact = await run(root, requestFor("proposal", { artifacts: {} }), {
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(missingArtifact.outcome.verdict, "manual");
    assert.equal(missingArtifact.outcome.reasonCode, "artifact-missing");
    assert.equal(missingArtifact.fake.seen.binds, 0, "物证缺失必须在启动判断会话前回落");
  } finally {
    cleanup();
  }
});

test("负向与失败路径：revise/reject/空选择/未知 id 一律 manual；超时/解析失败/引擎不支持如实回落", async () => {
  const { root, cleanup } = makeRoot("negative");
  try {
    seedProject(root);
    for (const selected of [["revise"], ["reject"], [], ["accept", "unknown-id"]]) {
      const { outcome } = await run(root, requestFor("proposal"), {
        reads: [INTENT_REL, PROPOSAL_REL],
        report: report({ group: "decision", cardKind: "proposal", selected }),
      });
      assert.equal(outcome.verdict, "manual", `selected=${JSON.stringify(selected)} 不得代批`);
    }

    const { judge: shortJudge } = (() => {
      const made = makeJudge(root, { silent: true }, { timeoutMs: 40 });
      return { judge: made.judge };
    })();
    const timeoutOutcome = await shortJudge(requestFor("proposal"));
    assert.equal(timeoutOutcome.verdict, "manual");
    assert.equal(timeoutOutcome.reasonCode, "timeout");

    const parseFailed = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      message: "看起来可以接受。",
    });
    assert.equal(parseFailed.outcome.verdict, "manual");
    assert.equal(parseFailed.outcome.reasonCode, "parse-failed");

    const demo = await run(root, requestFor("proposal", { runtime: "demo" }), {
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(demo.outcome.verdict, "manual");
    assert.equal(demo.outcome.reasonCode, "unsupported-engine");
    assert.equal(demo.fake.seen.binds, 0, "不支持的引擎不得启动判断会话");

    const mismatch = await run(root, requestFor("proposal", { group: "approval" }), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: report({ group: "approval", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(mismatch.outcome.verdict, "manual");
    assert.equal(mismatch.outcome.reasonCode, "group-mismatch");
    assert.equal(mismatch.fake.seen.binds, 0);
  } finally {
    cleanup();
  }
});

test("纯 JSON message 降级路径可用；approve 缺 reason 视为解析失败", async () => {
  const { root, cleanup } = makeRoot("message-fallback");
  try {
    seedProject(root);
    const approveViaMessage = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      message: JSON.stringify({
        verdict: "approve",
        reason: "提案与物证一致",
        evidence: [PROPOSAL_REL],
        selected: ["accept"],
      }),
    });
    assert.equal(approveViaMessage.outcome.verdict, "approve");
    assert.deepEqual(approveViaMessage.outcome.value?.selected, ["accept"]);

    const noReason = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: { verdict: "approve", evidence: [PROPOSAL_REL], selected: ["accept"] },
    });
    assert.equal(noReason.outcome.verdict, "manual");
    assert.equal(noReason.outcome.reasonCode, "parse-failed", "approve 缺 reason 不得放行");

    const missingEvidence = await run(root, requestFor("proposal"), {
      reads: [INTENT_REL, PROPOSAL_REL],
      report: { verdict: "approve", reason: "看起来没问题", selected: ["accept"] },
    });
    assert.equal(missingEvidence.outcome.verdict, "manual");
    assert.equal(missingEvidence.outcome.reasonCode, "insufficient-evidence");
  } finally {
    cleanup();
  }
});

test("三引擎同期：claude/pi/codex 都能走同一 driver 与只读工具面；demo 不支持", async () => {
  const { root, cleanup } = makeRoot("engines");
  try {
    seedProject(root);
    for (const runtime of ["claude", "pi", "codex"] as const) {
      const { outcome } = await run(root, requestFor("proposal", { runtime }), {
        reads: [INTENT_REL, PROPOSAL_REL],
        report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
      });
      assert.equal(outcome.verdict, "approve", `${runtime}: ${outcome.reason}`);
      assert.equal(outcome.engine, runtime, "判断必须跟随请求会话引擎（不跨引擎）");
    }
    const demo = await run(root, requestFor("proposal", { runtime: "demo" }), {
      report: report({ group: "decision", cardKind: "proposal", selected: ["accept"] }),
    });
    assert.equal(demo.outcome.reasonCode, "unsupported-engine");
    assert.equal(demo.fake.seen.binds, 0);
  } finally {
    cleanup();
  }
});

test("适配器 allowlist 并集：治理工具恰三只、shell 工具仍恰三只、并集恰四只", async () => {
  const { ALL_JUDGE_TOOL_NAMES, GOVERNANCE_JUDGE_TOOL_NAMES, GOVERNANCE_JUDGE_REPORT_TOOL } = await import(
    "../../../src/common/runtime-core/governance-judge/tools.ts"
  );
  const { buildShellJudgeTools } = await import("../../../src/common/runtime-core/shell-judge/tools.ts");
  assert.deepEqual([...GOVERNANCE_JUDGE_TOOL_NAMES], ["judge_read_file", "judge_list_dir", "report_governance_judgement"]);
  assert.equal(GOVERNANCE_JUDGE_REPORT_TOOL, "report_governance_judgement");
  assert.equal(ALL_JUDGE_TOOL_NAMES.length, 4);
  assert.equal(new Set(ALL_JUDGE_TOOL_NAMES).size, 4);
  assert.ok(ALL_JUDGE_TOOL_NAMES.includes("report_governance_judgement"));
  assert.ok(ALL_JUDGE_TOOL_NAMES.includes("report_shell_judgement"));
  const shellTools = buildShellJudgeTools({
    projectRoot: "/tmp/never-read",
    report: () => {},
    stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false },
  });
  assert.deepEqual(shellTools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_shell_judgement"]);
});

test("approveOutcome 夹具自身与请求形状一致（防夹具漂移）", async () => {
  const { root, cleanup } = makeRoot("fixture-self-check");
  try {
    seedProject(root);
    const request = requestFor("write");
    const outcome = approveOutcome(request);
    assert.equal(outcome.group, "approval");
    assert.deepEqual(outcome.paths, request.paths);
    assert.deepEqual(outcome.pathDecisions?.map((entry) => entry.path), request.paths);
  } finally {
    cleanup();
  }
});
