// test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts
// 场景 2（离线端到端）：**接受提案后的时序**（2026-10-22 第 1 项，客户确认方案）。
//
// 新契约：`proposal accept` ⇒ 应用派 **Convener 一条任务**——写 `docs/flows/<flow>.yaml` +
// `docs/scheduling/<flow>-team-v1.md`，并在同一轮**直接发 appointment 卡**。客户任命决定后，
// 应用派 **Crew 写卡**（不是 Convener、也不是旧的两段式提名）。团队计划缺失时，Convener 的
// appointment 卡在**触达客户之前**被卡前守卫拒绝（不生成客户卡、不调判断、不写账本、不派 Crew）。
//
// 旧用例（2026-10-18）断言「先派 Convener 写流程单、YAML 落盘后再派 Nominator 提名」——
// 该分工与客户确认的治理分工第 1 项冲突，故按新方案更新；仍保留「落盘时序」「不循环」「0 张手卡」等
// 原有强度，并新增团队计划存在性与 appointment 账本绑定断言。判断/客户通道/桌面推进均为真实产品代码，
// 模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import type { ToolCall } from "../../../src/model/runtime.ts";
import {
  FLOW,
  FLOW_REL,
  NOMINATION_REL,
  PROPOSAL_REL,
  TEAM_PLAN_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  proposalDoc,
  seedConfirmedIntent,
  seedTrioProject,
  teamPlanDoc,
  teamPlanV2Doc,
  type ScriptContext,
} from "./fixture.ts";

function rapporteurProposalScript(): (ctx: ScriptContext) => ToolCall[] {
  return (ctx) => {
    if (ctx.roleId === "rapporteur" && ctx.turn === 1) {
      return [
        { name: "write_file", args: { path: PROPOSAL_REL, content: proposalDoc(FLOW) } },
        {
          name: "request_choice",
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

function convenerAcceptScript(options: { writeTeamPlan?: boolean } = {}): ToolCall[] {
  const writeTeamPlan = options.writeTeamPlan !== false;
  return [
    { name: "write_file", args: { path: FLOW_REL, content: flowDoc(FLOW, [{ id: "impl", status: "pending" }]) } },
    ...(writeTeamPlan
      ? [{ name: "write_file", args: { path: TEAM_PLAN_REL, content: teamPlanDoc(FLOW, ["executor"]) } }]
      : []),
    {
      name: "request_choice",
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

test("场景2a：接受提案 ⇒ Convener 一条任务写流程+团队计划并直接发任命卡；任命后应用派 Crew 写卡", async () => {
  const convenerPromptedWhen: Array<{ flowExists: boolean; planExists: boolean }> = [];
  const nominatorPromptedWhen: Array<{ flowExists: boolean; planExists: boolean }> = [];
  const script = rapporteurProposalScript();
  const temp = makeRoot("proposal-accept-chain");
  seedTrioProject(temp.root);
  // 前置：客户已确认意图并完成交接（decision 组判断的意图基准，见 fixture.seedConfirmedIntent）。
  await seedConfirmedIntent(temp.root);
  const h = await makeHarness({
    tag: "proposal-accept-chain",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener") return convenerAcceptScript();
      return script(ctx);
    },
    onPrompt: (ctx) => {
      if (ctx.roleId === "convener") {
        convenerPromptedWhen.push({ flowExists: exists(temp.root, FLOW_REL), planExists: exists(temp.root, TEAM_PLAN_REL) });
      }
      if (ctx.roleId === "nominator") {
        nominatorPromptedWhen.push({ flowExists: exists(temp.root, FLOW_REL), planExists: exists(temp.root, TEAM_PLAN_REL) });
      }
    },
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请形成提案并请客户决定。");
    assert.equal(sent.ok, true, sent.error ?? "");

    // 等 appointment 决定与 Crew 写卡任务（应用在客户任命后自动派 Crew）。
    await h.waitFor(() => (h.prompts.get("nominator")?.length ?? 0) > 0, 8000);

    // ① Convener 恰一条任务：写流程 YAML + 团队计划，并**直接发任命卡**（不是两段式提名）。
    assert.equal(h.prompts.get("convener")?.length, 1, "Convener 恰收到一条接受提案任务");
    const convenerTask = h.prompts.get("convener")![0]!;
    assert.match(convenerTask, /客户已接受提案/);
    assert.match(convenerTask, /团队计划/);
    assert.match(convenerTask, /直接发任命卡/);
    assert.match(convenerTask, /cardKind=appointment/);

    // ② 任命由 Convener 发起，账本绑定团队计划路径/版本/哈希。
    const ledger = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.decisionKind === "appointment") &&
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator"),
      8000,
    );
    const appointment = ledger.entries.find((entry) => entry.decisionKind === "appointment");
    assert.ok(appointment, "应有 appointment 客户决定");
    assert.equal(appointment!.actorRoleId, "convener", "appointment 由 Convener 发起（第 1 项）");
    assert.equal(appointment!.power, "schedule");
    assert.deepEqual(appointment!.targetRoleIds, ["executor"]);
    assert.equal(appointment!.artifactPath, TEAM_PLAN_REL, "appointment 绑定团队计划");
    assert.equal(appointment!.artifactVersion, 1);
    assert.equal(typeof appointment!.artifactSha256, "string");

    // ③ 任命决定后应用派 Crew 写卡（不是 Convener）；任务带团队计划与 role-cards。
    assert.equal(h.prompts.get("nominator")?.length, 1, "任命后恰好派一条 Crew 写卡任务");
    const crewTask = h.prompts.get("nominator")![0]!;
    assert.match(crewTask, /appointment-write/);
    assert.match(crewTask, /团队计划 docs\/scheduling\/flow-a-team-v1\.md/);
    assert.match(crewTask, /role-cards/);
    assert.deepEqual(
      nominatorPromptedWhen,
      [{ flowExists: true, planExists: true }],
      "派 Crew 写卡时流程 YAML 与团队计划必须都已落盘",
    );
    assert.deepEqual(
      convenerPromptedWhen,
      [{ flowExists: false, planExists: false }],
      "派 Convener 时流程/计划尚不存在（由它写）",
    );

    // ④ 旧两段式不再发生：不写提名文件、不再有第二个 Convener 任务（Crew 未写卡 ⇒ 不派 readiness）。
    assert.equal(exists(temp.root, NOMINATION_REL), false, "新流程不再产生 docs/nominations/ 提名文件");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(h.prompts.get("convener")?.length, 1, "Crew 未写卡前不派 Convener readiness（不循环）");

    // ⑤ 应用推进顺序：接受→Convener；任命→Crew。两段都是 app 动作（不伪装客户批准）。
    const accepted = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
    assert.deepEqual(
      accepted
        .filter((entry) => entry.trigger === "customer-decision")
        .map((entry) => [entry.actorRoleId, entry.targetRoleId]),
      [
        ["app", "convener"],
        ["app", "nominator"],
      ],
      "账本：接受→Convener、任命→Crew（write 卡）",
    );

    // ⑥ 当前 pane 不变：不带 target 的客户消息仍落 Rapporteur。
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

test("场景2b：Convener 未写团队计划却发任命卡 ⇒ 卡前守卫拒绝（无客户卡/无账本/不派 Crew/不循环）", async () => {
  const script = rapporteurProposalScript();
  const temp = makeRoot("proposal-accept-missing-plan");
  seedTrioProject(temp.root);
  await seedConfirmedIntent(temp.root);
  const h = await makeHarness({
    tag: "proposal-accept-missing-plan",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      // 故意只写流程 YAML、不写团队计划，然后发 appointment 卡。
      if (ctx.roleId === "convener") return convenerAcceptScript({ writeTeamPlan: false });
      return script(ctx);
    },
  });
  try {
    await h.open("rapporteur");
    await h.send("rapporteur", "请形成提案并请客户决定。");

    // 等 Convener 的 appointment 工具回执（被守卫拒绝）。
    await h.waitFor(
      () => h.results.some((result) => result.name === "request_choice" && /团队计划缺失/.test(result.message)),
      5000,
    );
    const receipt = h.results.find((result) => result.name === "request_choice" && /团队计划缺失/.test(result.message));
    assert.ok(receipt, "Convener 应收到卡前守卫的拒绝回执");
    assert.equal(receipt!.ok, false, "缺少团队计划时 appointment 卡不得发出");
    assert.match(receipt!.message, /未向客户发卡、未写账本/);

    assert.equal(h.presented.length, 0, "守卫拒绝不得生成客户卡");
    // 原始客户通道只收到过 1 张卡——提案卡（由判断代批）；appointment 卡没有到达通道。
    assert.equal(h.rawCustomerInputs.length, 1, "appointment 守卫拒绝发生在触达原始客户通道之前");
    assert.equal(h.judgeInvocations, 1, "只有提案卡进入判断；appointment 守卫拒绝不得调用判断 agent");
    assert.equal(h.judgeRows.filter((row) => row.cardKind === "appointment").length, 0, "不得产生 appointment 判断结果行");
    const ledger = await h.waitForLedger(() => true);
    assert.equal(
      ledger.entries.some((entry) => entry.decisionKind === "appointment"),
      false,
      "守卫拒绝不得写 appointment 决定",
    );
    assert.equal(h.prompts.get("nominator")?.length ?? 0, 0, "不得派 Crew 写卡");
    assert.equal(h.openRoles.includes("nominator"), false, "绝不为 Crew 开会话");

    // 不循环：再等一拍，Convener 不再收到第二条任务。
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.prompts.get("convener")?.length, 1, "不重试、不循环派发");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景2c（v2）：接受提案 ⇒ 同一轮写 v2 团队计划/MapReduce flow 并直接发任命卡；Crew 文案含模块清单", async () => {
  const script = rapporteurProposalScript();
  const temp = makeRoot("proposal-accept-v2");
  seedTrioProject(temp.root);
  await seedConfirmedIntent(temp.root);

  const v2Plan = teamPlanV2Doc(FLOW, {
    modules: ["storefront"],
    recommended: ["executor"],
    rows: [
      {
        roleId: "executor",
        type: "new",
        module: "storefront",
        writes: "src/owned-executor/; test/owned-executor/",
        contract: "docs/contracts/storefront-v1.md",
        testSurface: "test/owned-executor/",
        dependsOn: "无",
        parallelGroup: "map-a",
        group: "交付",
      },
      {
        roleId: "tester",
        type: "existing",
        module: "reduce",
        writes: "test/测试/",
        contract: "docs/contracts/storefront-v1.md（消费）",
        testSurface: "test/测试/（集成/e2e）",
        deps: "依赖全部 Map",
        dependsOn: "executor",
        parallelGroup: "reduce",
        group: "测试",
        apiSpec: "not-applicable（Reduce 角色不导出接口）",
      },
    ],
  });
  const v2Flow = flowDoc(FLOW, [
    { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
    { id: "appointment", kind: "customer-decision", status: "pending" },
    { id: "role-cards", kind: "dispatch", status: "pending" },
    { id: "role-readiness", kind: "dispatch", status: "pending" },
    { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
    { id: "test-map-shards", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront"] },
    { id: "verification", kind: "acceptance", status: "pending" },
  ]);

  const h = await makeHarness({
    tag: "proposal-accept-v2",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener" && /客户已接受提案/.test(ctx.prompt)) {
        return [
          { name: "write_file", args: { path: FLOW_REL, content: v2Flow } },
          { name: "write_file", args: { path: TEAM_PLAN_REL, content: v2Plan } },
          {
            name: "request_choice",
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
      return script(ctx);
    },
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请形成提案并请客户决定。");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => (h.prompts.get("nominator")?.length ?? 0) > 0, 10000);
    const ledger = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.decisionKind === "appointment") &&
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator"),
      10000,
    );
    const appointment = ledger.entries.find((entry) => entry.decisionKind === "appointment")!;
    assert.equal(appointment.artifactPath, TEAM_PLAN_REL);
    assert.deepEqual(appointment.targetRoleIds, ["executor"]);
    assert.equal(h.presented.length, 0, "v2 任命由判断代批 ⇒ 0 张手卡");

    const crewTask = h.prompts.get("nominator")![0]!;
    assert.match(crewTask, /团队计划 v2/);
    assert.match(crewTask, /模块清单：storefront/);
    assert.match(crewTask, /module\/公开契约\/测试面\/dependsOn\/并行组\/粒度理由/);
    const convenerTask = h.prompts.get("convener")![0]!;
    // 2026-10-23 目录级授权（D5 修复后口径）：提案接受时**新流程默认写 v3 计划**；本场景仍由 Convener
    // 脚本写 v2 计划（既有 v2 链路/legacy 覆盖保留），因此 Convener 任务给默认 v3 文案，而 Crew 任务按
    // **实际 v2 计划**给 v2 文案。显式 v2 文案在 `operator-wiring` 单测覆盖，此处不重复。
    assert.match(convenerTask, /团队计划 v3/);
    assert.match(convenerTask, /directories/);
    assert.match(convenerTask, /目录规范/);
    assert.match(convenerTask, /实现目录/);
    assert.match(convenerTask, /parallelGroup/);
    assert.match(convenerTask, /dependsOn/);
    assert.doesNotMatch(convenerTask, /团队计划 v2/, "新流程默认 v3，不得再给 Convener 默认 v2 文案");
    assert.equal(exists(temp.root, NOMINATION_REL), false);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
