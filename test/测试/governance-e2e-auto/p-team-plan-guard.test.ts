// test/测试/governance-e2e-auto/p-team-plan-guard.test.ts
// 2026-10-22 第 1 项（客户确认方案，P2）：**任命卡卡前守卫**负例矩阵。
//
// Convener 发 `request_choice(cardKind=appointment)` 前，应用必须确定性校验：
//   1. 团队计划存在且可读；2. 计划 frontmatter flowId 与卡片一致；3. 推荐集非空/无重复/不含内置治理角色；
//   4. 卡选项覆盖推荐集且不含内置角色；5. 每个推荐角色有职责/能力/写集/依赖行。
// 失败 ⇒ **不生成客户卡、不镜像、不调判断、不写账本**，把具体原因退回 Convener。
//
// 全部走真实 run-role 守卫 + 真实客户通道/判断入口；模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import type { ToolCall } from "../../../src/model/runtime.ts";
import {
  FLOW,
  TEAM_PLAN_REL,
  exists,
  makeHarness,
  makeRoot,
  seedTrioProject,
  teamPlanDoc,
  write,
} from "./fixture.ts";

interface GuardCase {
  name: string;
  /** 写入团队计划的内容；undefined = 不写计划（缺失）。 */
  plan?: string;
  options?: Array<{ id: string; label: string }>;
  expected: RegExp;
}

const DEFAULT_OPTIONS = [{ id: "executor", label: "Executor" }];

const CASES: GuardCase[] = [
  {
    name: "团队计划缺失",
    plan: undefined,
    expected: /团队计划缺失/,
  },
  {
    name: "计划 flowId 与卡片不一致",
    plan: teamPlanDoc(FLOW, ["executor"], { frontmatterFlowId: "flow-b" }),
    expected: /flowId="flow-b" 与卡片 flowId="flow-a" 不一致/,
  },
  {
    name: "推荐集为空",
    plan: teamPlanDoc(FLOW, [], { omitRecommended: true }),
    expected: /缺少唯一的机器可读推荐集/,
  },
  {
    name: "推荐集含内置治理角色",
    plan: teamPlanDoc(FLOW, ["liaison"]),
    options: [{ id: "liaison", label: "Liaison" }],
    expected: /推荐集含内置治理角色（liaison）/,
  },
  {
    name: "卡选项未覆盖推荐集",
    plan: teamPlanDoc(FLOW, ["executor"]),
    options: [{ id: "reviewer", label: "Reviewer" }],
    expected: /选项未覆盖团队计划推荐集（缺：executor）/,
  },
  {
    name: "卡选项含内置治理角色",
    plan: teamPlanDoc(FLOW, ["executor"]),
    options: [{ id: "executor", label: "Executor" }, { id: "convener", label: "Convener" }],
    expected: /任命卡选项含内置治理角色（convener）/,
  },
  {
    name: "推荐角色缺职责目标行",
    plan: teamPlanDoc(FLOW, ["executor"], { rowOverrides: { executor: { duty: "" } } }),
    expected: /团队计划角色 executor 的「职责目标」为空/,
  },
];

for (const testCase of CASES) {
  test(`任命卡卡前守卫（${testCase.name}）⇒ 不发卡/不判断/不写账本/不派 Crew`, async () => {
    const temp = makeRoot(`team-plan-guard-${CASES.indexOf(testCase)}`);
    seedTrioProject(temp.root);
    if (testCase.plan !== undefined) write(temp.root, TEAM_PLAN_REL, testCase.plan);

    const options = testCase.options ?? DEFAULT_OPTIONS;
    const appointmentCard: ToolCall = {
      name: "request_choice",
      args: {
        title: `任命 ${FLOW}`,
        question: "选择要任命的角色",
        flowId: FLOW,
        cardKind: "appointment",
        multiple: true,
        options,
      },
    };
    const h = await makeHarness({
      tag: `team-plan-guard-${CASES.indexOf(testCase)}`,
      root: temp.root,
      approval: true,
      decision: true,
      scriptForRole: (ctx) => (ctx.roleId === "convener" ? [appointmentCard] : []),
    });
    try {
      await h.open("convener");
      const sent = await h.send("convener", "请依团队计划请客户任命。");
      assert.equal(sent.ok, true, sent.error ?? "");
      await h.waitFor(() => h.results.some((result) => result.name === "request_choice"), 5000);
      const receipt = h.results.find((result) => result.name === "request_choice")!;
      assert.equal(receipt.ok, false, "守卫失败时 appointment 卡不得发出");
      assert.match(receipt.message, testCase.expected);
      assert.match(receipt.message, /未向客户发卡、未写账本/);

      assert.equal(h.presented.length, 0, "不得生成客户卡");
      // 本用例只发 appointment 卡（没有提案卡），原始客户通道调用必须为 0。
      assert.equal(h.rawCustomerInputs.length, 0, "守卫拒绝发生在触达原始客户通道之前");
      assert.equal(h.judgeInvocations, 0, "守卫拒绝不得调用判断 agent");
      const ledger = await h.waitForLedger(() => true);
      assert.equal(
        ledger.entries.some((entry) => entry.decisionKind === "appointment"),
        false,
        "守卫拒绝不得写 appointment 决定",
      );
      assert.equal(h.prompts.get("nominator")?.length ?? 0, 0, "不得派 Crew 写卡");
      assert.equal(h.openRoles.includes("nominator"), false, "不得为 Crew 开会话");
      if (testCase.plan === undefined) {
        assert.equal(exists(temp.root, TEAM_PLAN_REL), false);
      }
    } finally {
      await h.stop();
      h.cleanup();
      temp.cleanup();
    }
  });
}
