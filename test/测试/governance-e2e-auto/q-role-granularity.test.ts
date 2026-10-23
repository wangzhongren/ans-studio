// test/测试/governance-e2e-auto/q-role-granularity.test.ts
// 2026-10-22 角色粒度/MapReduce（Reduce 终验；验收标准 P1/P2/P3/P4/P5/P9 的 v2 正/负矩阵）。
//
// 覆盖：
//   · 团队计划 v2 正向：frontmatter/modules/模块清单/14 列角色表/MapReduce/写集原语；
//   · 模块覆盖负例：缺 module、模块重复/孤儿/未声明/重复覆盖；
//   · 写集负例：通配符/散文/绝对路径/治理路径/跨角色重叠；
//   · 依赖/并行组负例：dependsOn 成环、同 map 组依赖、Map 依赖 Reduce、Reduce 未覆盖全部 Map；
//   · 粒度负例：整层名/多模块无理由硬拒、有理由 exception-review、单文件 warning；
//   · V11 flow-plan 一致性（含真实卡前守卫的正/负路径）；
//   · legacy v1：不强制 v2 字段，旧表格检查保持。
//
// 解析/校验调用产品单一实现（`src/common/编排/team-plan.ts` / `flow-state.ts`）；卡前守卫走真实
// run-role + 客户通道/判断入口；模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import {
  legacyTeamPlanRoleRowIssues,
  parseTeamPlan,
  parseWritesetCell,
  teamPlanIssueMessages,
  validateTeamPlanFlowConsistency,
  writesetsOverlap,
  type TeamPlanParseResult,
} from "../../../src/common/编排/team-plan.ts";
import { parseFlowStateYaml } from "../../../src/common/编排/flow-state.ts";
import type { ToolCall } from "../../../src/model/runtime.ts";
import {
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  flowDoc,
  makeHarness,
  makeRoot,
  seedConfirmedIntent,
  seedTrioProject,
  teamPlanDoc,
  teamPlanV2Doc,
  write,
  type TeamPlanV2RoleInput,
} from "./fixture.ts";

const MODULES = ["storefront", "checkout-api"];

function v2Rows(overrides: {
  executor?: Partial<TeamPlanV2RoleInput>;
  reviewer?: Partial<TeamPlanV2RoleInput>;
  tester?: Partial<TeamPlanV2RoleInput>;
} = {}): TeamPlanV2RoleInput[] {
  return [
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
    {
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
    },
    {
      roleId: "tester",
      type: "existing",
      module: "reduce",
      writes: "test/测试/",
      contract: "docs/contracts/storefront-v1.md（消费）；docs/contracts/checkout-v1.md（消费）",
      testSurface: "test/测试/（集成/e2e）",
      deps: "依赖全部 Map 角色",
      dependsOn: "executor, reviewer",
      parallelGroup: "reduce",
      group: "测试",
      apiSpec: "not-applicable（Reduce 角色不导出产品接口）",
      ...overrides.tester,
    },
  ];
}

function v2Plan(overrides: Parameters<typeof v2Rows>[0] = {}, options: Partial<Parameters<typeof teamPlanV2Doc>[1]> = {}): string {
  return teamPlanV2Doc(FLOW, {
    modules: MODULES,
    rows: v2Rows(overrides),
    recommended: ["executor", "reviewer"],
    ...options,
  });
}

function errorsOf(text: string): string[] {
  return teamPlanIssueMessages(parseTeamPlan(text), "error");
}

function parsedOf(text: string): TeamPlanParseResult {
  return parseTeamPlan(text, { flowId: FLOW });
}

/** v2 计划与 flow 一致的 MapReduce flow（V11 正向）。 */
function consistentFlow(): string {
  return flowDoc(FLOW, [
    { id: "contract-freeze", title: "冻结契约", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
    { id: "delivery-storefront", title: "Map A｜storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
    { id: "delivery-checkout-api", title: "Map B｜checkout-api", owner: "reviewer", kind: "dispatch", status: "pending", parallelGroup: "map-b", dependsOn: ["contract-freeze"] },
    { id: "test-map-shards", title: "Map 测试分片", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
    { id: "integration-e2e", title: "Reduce｜契约/集成/端到端", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["test-map-shards"] },
    { id: "verification-evidence", title: "Reduce｜证据与真实启动", owner: "tester", kind: "artifact", status: "pending", parallelGroup: "reduce", dependsOn: ["integration-e2e"] },
    { id: "verification", title: "验收", kind: "acceptance", status: "pending" },
  ]);
}

// —————————————————————— v2 正向 ——————————————————————

test("q1 v2 正向：frontmatter/modules/模块清单/14 列角色表/MapReduce/写集原语全部解析", () => {
  const parsed = parsedOf(v2Plan());
  assert.equal(parsed.ok, true, errorsOf(v2Plan()).join("；"));
  assert.equal(parsed.legacy, false);
  assert.equal(parsed.teamPlanSchema, 2);
  assert.equal(parsed.flowId, FLOW);
  assert.deepEqual(parsed.recommended, ["executor", "reviewer"]);
  assert.deepEqual(parsed.modules, MODULES);
  assert.deepEqual(parsed.moduleList.map((row) => row.module), MODULES);
  assert.equal(parsed.roleRows.length, 3);
  const executor = parsed.roleRows.find((row) => row.roleId === "executor")!;
  assert.equal(executor.isMap, true);
  assert.deepEqual(executor.modules, ["storefront"]);
  assert.deepEqual(executor.writesets.map((entry) => entry.path), ["src/owned-executor/", "test/owned-executor/"]);
  assert.deepEqual(executor.contracts, ["docs/contracts/storefront-v1.md"]);
  assert.deepEqual(executor.testSurface, ["test/owned-executor/"]);
  assert.equal(executor.parallelGroup, "map-a");
  const tester = parsed.roleRows.find((row) => row.roleId === "tester")!;
  assert.equal(tester.isReduce, true);
  assert.deepEqual(tester.dependsOn, ["executor", "reviewer"]);
  assert.equal(tester.apiSpecStatus, "not-applicable");
  assert.deepEqual(teamPlanIssueMessages(parsed, "warning"), []);
  assert.deepEqual(teamPlanIssueMessages(parsed, "exception-review"), []);

  const writeset = parseWritesetCell("src/a/; src/a/file.ts");
  assert.deepEqual(writeset.issues, []);
  assert.equal(writesetsOverlap(writeset.entries[0]!, writeset.entries[1]!), true, "目录与目录内文件算重叠");
});

test("q2 模块覆盖负例：缺 module/重复/孤儿/未声明/重复覆盖", () => {
  assert.ok(errorsOf(v2Plan({ executor: { module: "" } }, { modules: ["storefront"] })).some((message) => /「module」为空/.test(message)));
  assert.ok(
    errorsOf(teamPlanV2Doc(FLOW, { modules: ["storefront", "storefront"], rows: v2Rows() })).some((message) =>
      /modules 重复列出模块「storefront」/.test(message),
    ),
  );
  assert.ok(
    errorsOf(
      teamPlanV2Doc(FLOW, {
        modules: MODULES,
        rows: v2Rows(),
        moduleRows: [
          "| storefront | 交付 | `docs/contracts/storefront-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
          "| checkout-api | 交付 | `docs/contracts/checkout-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
          "| payment | 交付 | `docs/contracts/pay-v1.md` | `docs/planning/flow-a-v1.md` §5 |",
        ],
      }),
    ).some((message) => /未声明模块「payment」/.test(message)),
  );
  assert.ok(errorsOf(v2Plan({ executor: { module: "payment" } })).some((message) => /声明了未声明的模块「payment」/.test(message)));
  assert.ok(
    errorsOf(v2Plan({ reviewer: { module: "storefront" } })).some((message) => /模块「storefront」被多个 Map 角色覆盖/.test(message)),
  );
  // Reduce 角色 module=reduce 不计入覆盖：把它改成产品模块后产生孤儿。
  const reduceAsMap = v2Rows();
  reduceAsMap[1] = { ...reduceAsMap[1]!, module: "reduce", parallelGroup: "reduce" };
  assert.ok(errorsOf(teamPlanV2Doc(FLOW, { modules: MODULES, rows: reduceAsMap })).some((message) => /孤儿模块/.test(message)));
});

test("q3 写集负例：通配符/散文/绝对路径/治理路径/跨角色重叠", () => {
  for (const [writes, pattern] of [
    ["src/api/*.ts; test/api/", /通配符\/省略号/],
    ["src/api/ 与测试", /含空白\/散文/],
    ["/src/api/", /绝对路径/],
    ["docs/scheduling/", /治理\/他人角色路径/],
    [".ans/", /治理\/他人角色路径/],
    ["角色卡/other/", /治理\/他人角色路径/],
  ] as const) {
    assert.ok(
      errorsOf(v2Plan({ executor: { writes } })).some((message) => pattern.test(message)),
      `写集 ${writes} 应被拒绝`,
    );
  }
  assert.ok(
    errorsOf(v2Plan({ reviewer: { writes: "src/owned-executor/shared.ts; test/owned-reviewer/" } })).some((message) =>
      /写集重叠/.test(message),
    ),
  );
});

test("q4 依赖/并行组负例：成环/同组依赖/Map 依赖 Reduce/Reduce 未覆盖 Map/组语法", () => {
  assert.ok(errorsOf(v2Plan({ executor: { dependsOn: "reviewer" }, reviewer: { dependsOn: "executor" } })).some((message) => /dependsOn 形成环/.test(message)));
  assert.ok(
    errorsOf(v2Plan({ reviewer: { parallelGroup: "map-a", dependsOn: "executor" } })).some((message) =>
      /同一 map-a 组内的角色 .* 之间存在依赖路径/.test(message),
    ),
  );
  assert.ok(errorsOf(v2Plan({ executor: { dependsOn: "tester" } })).some((message) => /Map 角色 executor 不得依赖 Reduce 角色 tester/.test(message)));
  assert.ok(errorsOf(v2Plan({ tester: { dependsOn: "executor" } })).some((message) => /未直接或传递覆盖全部 Map 角色（缺：reviewer）/.test(message)));
  assert.ok(errorsOf(v2Plan({ reviewer: { parallelGroup: "wave-1" } })).some((message) => /并行组「wave-1」非法/.test(message)));
  assert.ok(errorsOf(v2Plan({ executor: { module: "storefront", parallelGroup: "reduce" } })).some((message) => /拥有产品模块，必须使用 map-\* 并行组/.test(message)));
});

test("q5 粒度负例：整层名/多模块无理由硬拒；有理由 exception-review；单文件 warning", () => {
  assert.ok(
    errorsOf(
      teamPlanV2Doc(FLOW, {
        modules: ["web", "checkout-api"],
        rows: v2Rows({ executor: { module: "web" } }),
        recommended: ["executor", "reviewer"],
        moduleRows: [
          "| web | 通用层 | `docs/contracts/web-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
          "| checkout-api | 交付 | `docs/contracts/checkout-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
        ],
      }),
    ).some((message) => /模块「web」是通用层名且未写「粒度理由」/.test(message)),
  );

  const layerWithReason = parseTeamPlan(
    teamPlanV2Doc(FLOW, {
      modules: ["web", "checkout-api"],
      rows: v2Rows({ executor: { module: "web", rationale: "既有 web 壳复用，下一次实质变更拆分" } }),
      recommended: ["executor", "reviewer"],
      moduleRows: [
        "| web | 通用层 | `docs/contracts/web-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
        "| checkout-api | 交付 | `docs/contracts/checkout-v1.md` | `docs/planning/flow-a-v1.md` §4 |",
      ],
    }),
  );
  assert.equal(layerWithReason.ok, true, teamPlanIssueMessages(layerWithReason).join("；"));
  assert.ok(teamPlanIssueMessages(layerWithReason, "exception-review").some((message) => /命中通用层名黑名单/.test(message)));

  assert.ok(errorsOf(v2Plan({ executor: { module: "storefront+checkout-api" } })).some((message) => /覆盖多个模块.*未写「粒度理由」/.test(message)));

  const singleFile = parseTeamPlan(v2Plan({ executor: { writes: "src/owned-executor/index.ts" } }));
  assert.equal(singleFile.ok, true, teamPlanIssueMessages(singleFile).join("；"));
  assert.ok(teamPlanIssueMessages(singleFile, "warning").some((message) => /写集只有单个文件/.test(message)));
});

test("q6 legacy v1：仅旧表格检查，不强制模块/契约/测试面；缺职责仍拒绝", () => {
  const legacy = teamPlanDoc(FLOW, ["executor"]);
  const parsed = parseTeamPlan(legacy, { flowId: FLOW });
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.ok, true, teamPlanIssueMessages(parsed).join("；"));
  assert.deepEqual(parsed.modules, []);
  assert.deepEqual(parsed.roleRows, []);
  assert.deepEqual(legacyTeamPlanRoleRowIssues(legacy, ["executor"]), []);
  const missingDuty = teamPlanDoc(FLOW, ["executor"], { rowOverrides: { executor: { duty: "" } } });
  assert.deepEqual(legacyTeamPlanRoleRowIssues(missingDuty, ["executor"]), ["团队计划角色 executor 的「职责目标」为空"]);
});

// —————————————————————— V11 flow-plan 一致性 ——————————————————————

test("q7 V11 正向：v2 计划与含 parallelGroup/dependsOn 的 flow 一致", () => {
  const plan = parsedOf(v2Plan());
  assert.equal(plan.ok, true, errorsOf(v2Plan()).join("；"));
  const flow = parseFlowStateYaml(consistentFlow(), FLOW);
  assert.equal(flow.ok, true, flow.ok ? "" : flow.error);
  assert.deepEqual(validateTeamPlanFlowConsistency(plan, flow.ok ? flow.flow : (undefined as never)), []);
});

test("q8 V11 负例：缺 Map 交付 / Reduce 未覆盖全部 Map / 同组依赖被 flow 静态校验拒绝", () => {
  const plan = parsedOf(v2Plan());
  const base = parseFlowStateYaml(consistentFlow(), FLOW);
  assert.equal(base.ok, true);
  const flow = base.ok ? base.flow : (undefined as never);
  const missing = { ...flow, steps: flow.steps.filter((step) => step.id !== "delivery-checkout-api") };
  assert.ok(
    validateTeamPlanFlowConsistency(plan, missing).some((issue) => /缺少 Map 角色 reviewer 的交付步骤 delivery-checkout-api/.test(issue.message)),
  );

  const reduceMissing = {
    ...flow,
    steps: flow.steps.map((step) => (step.id === "test-map-shards" ? { ...step, dependsOn: ["delivery-storefront"] } : step)),
  };
  assert.ok(
    validateTeamPlanFlowConsistency(plan, reduceMissing).some((issue) => /Reduce 步骤 test-map-shards 必须直接或传递依赖全部 Map 交付/.test(issue.message)),
  );

  const sameGroupFlow = flowDoc(FLOW, [
    { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
    { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
    { id: "delivery-checkout-api", owner: "reviewer", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze", "delivery-storefront"] },
    { id: "integration-e2e", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
    { id: "verification", kind: "acceptance", status: "pending" },
  ]);
  const parsed = parseFlowStateYaml(sameGroupFlow, FLOW);
  assert.equal(parsed.ok, false, "同 map 组依赖必须被 flow 静态校验拒绝");
  assert.match(parsed.ok ? "" : parsed.error, /同一 map-a 组内的步骤 .* 之间存在依赖路径/);
});

// —————————————————————— 真实卡前守卫（V11） ——————————————————————

test("q9 真实卡前守卫：v2 计划 + 一致 flow ⇒ appointment 卡发出并代批", async () => {
  const temp = makeRoot("role-granularity-guard-pass");
  seedTrioProject(temp.root);
  await seedConfirmedIntent(temp.root);
  write(temp.root, TEAM_PLAN_REL, v2Plan());
  write(temp.root, FLOW_REL, consistentFlow());
  const appointmentCard: ToolCall = {
    name: "request_choice",
    args: {
      title: `任命 ${FLOW}`,
      question: "选择要任命的角色",
      flowId: FLOW,
      cardKind: "appointment",
      multiple: true,
      options: [
        { id: "executor", label: "Executor" },
        { id: "reviewer", label: "Reviewer" },
      ],
    },
  };
  const h = await makeHarness({
    tag: "role-granularity-guard-pass",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => (ctx.roleId === "convener" ? [appointmentCard] : []),
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请依团队计划请客户任命。");
    assert.equal(sent.ok, true, sent.error ?? "");
    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionKind === "appointment"),
      10000,
    );
    const receipt = h.results.find((result) => result.name === "request_choice")!;
    assert.equal(receipt.ok, true, `v2 正向应通过卡前守卫：${receipt.message}`);
    const appointment = ledger.entries.find((entry) => entry.decisionKind === "appointment")!;
    assert.deepEqual(appointment.targetRoleIds, ["executor", "reviewer"]);
    assert.equal(appointment.artifactPath, TEAM_PLAN_REL);
    assert.equal(appointment.decisionEvidence?.kind, "judge");
    assert.equal(h.presented.length, 0, "判断代批：0 张手动卡");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("q10 真实卡前守卫：v2 计划与 flow 不一致 ⇒ 不发卡/不写账本/退回 Convener", async () => {
  const temp = makeRoot("role-granularity-guard-v11-fail");
  seedTrioProject(temp.root);
  await seedConfirmedIntent(temp.root);
  write(temp.root, TEAM_PLAN_REL, v2Plan());
  write(
    temp.root,
    FLOW_REL,
    flowDoc(FLOW, [
      { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
      { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
      { id: "integration-e2e", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront"] },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
  );
  const appointmentCard: ToolCall = {
    name: "request_choice",
    args: {
      title: `任命 ${FLOW}`,
      question: "选择要任命的角色",
      flowId: FLOW,
      cardKind: "appointment",
      multiple: true,
      options: [
        { id: "executor", label: "Executor" },
        { id: "reviewer", label: "Reviewer" },
      ],
    },
  };
  const h = await makeHarness({
    tag: "role-granularity-guard-v11-fail",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => (ctx.roleId === "convener" ? [appointmentCard] : []),
  });
  try {
    await h.open("convener");
    await h.send("convener", "请依团队计划请客户任命。");
    await h.waitFor(() => h.results.some((result) => result.name === "request_choice"), 5000);
    const receipt = h.results.find((result) => result.name === "request_choice")!;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message, /与流程不一致/);
    assert.match(receipt.message, /delivery-checkout-api/);
    assert.match(receipt.message, /未向客户发卡、未写账本/);
    assert.equal(h.presented.length, 0);
    assert.equal(h.judgeInvocations, 0, "V11 拒绝发生在判断之前");
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.decisionKind === "appointment"), false);
    assert.equal(h.prompts.get("nominator")?.length ?? 0, 0, "不得派 Crew");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
