// test/测试/governance-e2e-auto/p-team-plan-guard.test.ts
// 2026-10-22 第 1 项（客户确认方案，P2）：**任命卡卡前守卫**负例矩阵。
//
// Convener 发 `request_choice(cardKind=appointment)` 前，应用必须确定性校验：
//   1. 团队计划存在且可读；2. 计划 frontmatter flowId 与卡片一致；3. 推荐集非空/无重复/不含内置治理角色；
//   4. 卡选项覆盖推荐集且不含内置角色；5. 每个推荐角色有职责/能力/写集/依赖行。
//   2026-10-22 角色粒度/MapReduce（v2）：计划声明 `teamPlanSchema: 2` 时追加 V1–V10：
//   模块清单/模块覆盖/写集语法与不相交/依赖 DAG/并行组/粒度理由/五维章节。
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
  seedConfirmedIntent,
  seedTrioProject,
  teamPlanDoc,
  teamPlanV2Doc,
  write,
  type TeamPlanV2RoleInput,
} from "./fixture.ts";

interface GuardCase {
  name: string;
  /** 写入团队计划的内容；undefined = 不写计划（缺失）。 */
  plan?: string;
  options?: Array<{ id: string; label: string }>;
  expected: RegExp;
}

const DEFAULT_OPTIONS = [{ id: "executor", label: "Executor" }];

/** v2 角色行基线（单个 Map 模块 + Reduce 角色；具体负例按需覆盖）。 */
function v2Rows(overrides: {
  executor?: Partial<TeamPlanV2RoleInput>;
  reviewer?: Partial<TeamPlanV2RoleInput>;
  tester?: Partial<TeamPlanV2RoleInput>;
} = {}): TeamPlanV2RoleInput[] {
  const rows: TeamPlanV2RoleInput[] = [
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
      ...overrides.executor,
    },
  ];
  if (overrides.reviewer !== undefined) {
    rows.push({
      roleId: "reviewer",
      type: "new",
      module: "checkout-api",
      writes: "src/owned-reviewer/; test/owned-reviewer/",
      contract: "docs/contracts/checkout-v1.md",
      testSurface: "test/owned-reviewer/",
      dependsOn: "无",
      parallelGroup: "map-b",
      group: "交付",
      ...overrides.reviewer,
    });
  }
  const mapRoleIds = rows.map((row) => row.roleId);
  rows.push({
    roleId: "tester",
    type: "existing",
    module: "reduce",
    writes: "test/测试/",
    contract: "docs/contracts/storefront-v1.md（消费）",
    testSurface: "test/测试/（集成/e2e）",
    deps: "依赖全部 Map 角色",
    dependsOn: mapRoleIds.join(", "),
    parallelGroup: "reduce",
    group: "测试",
    apiSpec: "not-applicable（Reduce 角色不导出产品接口）",
    ...overrides.tester,
  });
  return rows;
}

const V2_MODULES = ["storefront", "checkout-api"];

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
  // —————— 2026-10-22 v2（V1–V10）负例 ——————
  {
    name: "v2 缺 module",
    plan: teamPlanV2Doc(FLOW, { modules: ["storefront"], rows: v2Rows({ executor: { module: "" } }) }),
    expected: /角色 executor 的「module」为空/,
  },
  {
    name: "v2 缺模块清单",
    plan: teamPlanV2Doc(FLOW, { modules: ["storefront"], rows: v2Rows(), omitModuleSection: true }),
    expected: /缺少「模块清单」表/,
  },
  {
    name: "v2 模块重复",
    plan: teamPlanV2Doc(FLOW, { modules: ["storefront", "storefront"], rows: v2Rows() }),
    expected: /modules 重复列出模块「storefront」/,
  },
  {
    name: "v2 孤儿模块",
    plan: teamPlanV2Doc(FLOW, {
      modules: ["storefront", "checkout-api"],
      rows: v2Rows(),
      moduleRows: [
        "| storefront | 交付 | `docs/contracts/storefront-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
        "| checkout-api | 交付 | `docs/contracts/checkout-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
      ],
    }),
    expected: /模块「checkout-api」没有 Map 角色覆盖（孤儿模块）/,
  },
  {
    name: "v2 未声明模块",
    plan: teamPlanV2Doc(FLOW, { modules: V2_MODULES, rows: v2Rows({ executor: { module: "payment" } }) }),
    expected: /声明了未声明的模块「payment」/,
  },
  {
    name: "v2 写集重叠",
    plan: teamPlanV2Doc(FLOW, {
      modules: V2_MODULES,
      recommended: ["executor"],
      rows: v2Rows({ reviewer: { writes: "src/owned-executor/shared.ts; test/owned-reviewer/" } }),
    }),
    expected: /写集重叠/,
  },
  {
    name: "v2 dependsOn 成环",
    plan: teamPlanV2Doc(FLOW, {
      modules: V2_MODULES,
      recommended: ["executor"],
      rows: v2Rows({
        executor: { dependsOn: "reviewer" },
        reviewer: { dependsOn: "executor" },
      }),
    }),
    expected: /dependsOn 形成环/,
  },
  {
    name: "v2 同 Map 组依赖",
    plan: teamPlanV2Doc(FLOW, {
      modules: V2_MODULES,
      recommended: ["executor"],
      rows: v2Rows({
        executor: { parallelGroup: "map-a" },
        reviewer: { parallelGroup: "map-a", dependsOn: "executor" },
      }),
    }),
    expected: /同一 map-a 组内的角色 .* 之间存在依赖路径/,
  },
  {
    name: "v2 整层名无粒度理由",
    plan: teamPlanV2Doc(FLOW, {
      modules: ["web"],
      rows: v2Rows({ executor: { module: "web" } }),
      moduleRows: ["| web | 通用层 | `docs/contracts/web-v1.md` | `docs/planning/flow-a-v1.md` §4 |"],
    }),
    expected: /模块「web」是通用层名且未写「粒度理由」/,
  },
  {
    name: "v2 多模块无粒度理由",
    plan: teamPlanV2Doc(FLOW, {
      modules: V2_MODULES,
      rows: v2Rows({ executor: { module: "storefront+checkout-api" } }),
    }),
    expected: /覆盖多个模块.*未写「粒度理由」/,
  },
  {
    name: "v2 Reduce 未覆盖全部 Map",
    plan: teamPlanV2Doc(FLOW, {
      modules: V2_MODULES,
      recommended: ["executor"],
      rows: v2Rows({ reviewer: {}, tester: { dependsOn: "executor" } }),
    }),
    expected: /Reduce 角色 tester 的 dependsOn 未直接或传递覆盖全部 Map 角色（缺：reviewer）/,
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

test("legacy v1 团队计划：卡前守卫不强制 v2 字段，appointment 卡正常发出并代批", async () => {
  const temp = makeRoot("team-plan-guard-legacy-pass");
  seedTrioProject(temp.root);
  write(temp.root, TEAM_PLAN_REL, teamPlanDoc(FLOW, ["executor"]));
  await seedConfirmedIntent(temp.root);
  const appointmentCard: ToolCall = {
    name: "request_choice",
    args: {
      title: `任命 ${FLOW}`,
      question: "选择要任命的角色",
      flowId: FLOW,
      cardKind: "appointment",
      multiple: true,
      options: DEFAULT_OPTIONS,
    },
  };
  const h = await makeHarness({
    tag: "team-plan-guard-legacy-pass",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => (ctx.roleId === "convener" ? [appointmentCard] : []),
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请依团队计划请客户任命。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionKind === "appointment"),
      8000,
    );
    const receipt = h.results.find((result) => result.name === "request_choice")!;
    assert.equal(receipt.ok, true, `legacy 计划应通过卡前守卫：${receipt.message}`);
    assert.doesNotMatch(receipt.message, /teamPlanSchema|模块清单|粒度/);
    const ledger = await h.waitForLedger(() => true);
    assert.ok(
      ledger.entries.some((entry) => entry.decisionKind === "appointment" && entry.artifactPath === TEAM_PLAN_REL),
      "legacy v1 任命决定绑定团队计划",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
