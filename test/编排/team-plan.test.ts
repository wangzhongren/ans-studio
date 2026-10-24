// test/编排/team-plan.test.ts
// 2026-10-22 角色粒度/MapReduce（方案 §5，Q9 A）：**单一团队计划解析器** `team-plan.ts` 的
// V1–V10 正/负矩阵 + V11 flow-plan 一致性 + 写集解析/重叠（V12 复用）。
//
// 纯离线：只解析文本；不读 .env、不跑真实模型、不写盘。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isGovernanceWritesetPath,
  legacyTeamPlanRoleRowIssues,
  parseTeamPlan,
  parseTeamPlanModuleIds,
  parseWritesetCell,
  teamPlanIssueMessages,
  TEAM_PLAN_SCHEMA_V3,
  validateTeamPlanFlowConsistency,
  writesetsOverlap,
} from "../../src/common/编排/team-plan.ts";
import { parseFlowStateYaml, type FlowStateStep } from "../../src/common/编排/flow-state.ts";

interface RoleSpec {
  roleId: string;
  type: string;
  module: string;
  duty: string;
  ability: string;
  writes: string;
  contract: string;
  testSurface: string;
  deps: string;
  dependsOn: string;
  parallelGroup: string;
  group: string;
  apiSpec: string;
  rationale: string;
}

const BASE_ROLES: RoleSpec[] = [
  {
    roleId: "api",
    type: "new",
    module: "api",
    duty: "结算 API 与订单状态",
    ability: "TypeScript/契约/测试",
    writes: "`src/api/`; `test/api/`",
    contract: "`docs/contracts/api-v1.md`",
    testSurface: "`test/api/`",
    deps: "无",
    dependsOn: "无",
    parallelGroup: "map-a",
    group: "结算",
    apiSpec: "required",
    rationale: "—",
  },
  {
    roleId: "storefront",
    type: "new",
    module: "storefront",
    duty: "结算页面与交互",
    ability: "TypeScript/UI/测试",
    writes: "`src/storefront/`; `test/storefront/`",
    contract: "`docs/contracts/api-v1.md`（消费）",
    testSurface: "`test/storefront/`",
    deps: "依赖 api 契约",
    dependsOn: "api",
    parallelGroup: "map-b",
    group: "结算",
    apiSpec: "required",
    rationale: "—",
  },
  {
    roleId: "integration",
    type: "existing",
    module: "reduce",
    duty: "契约/集成/e2e/证据合并",
    ability: "测试/环境/证据",
    writes: "`test/integration/`",
    contract: "`docs/contracts/api-v1.md`（消费）",
    testSurface: "`test/integration/`（集成/e2e）",
    deps: "依赖全部 Map 角色",
    dependsOn: "api, storefront",
    parallelGroup: "reduce",
    group: "测试",
    apiSpec: "not-applicable（测试角色不导出产品接口）",
    rationale: "—",
  },
];

interface PlanOptions {
  flowId?: string;
  version?: number | string;
  riskTier?: string;
  schema?: string | null;
  recommended?: string[];
  modules?: string[];
  moduleRows?: string[];
  roles?: RoleSpec[];
  omitModuleSection?: boolean;
  omitCoordinationSection?: boolean;
  coordinationBody?: string;
  blockModules?: boolean;
}

function roleRow(role: RoleSpec): string {
  return `| ${role.roleId} | ${role.type} | ${role.module} | ${role.duty} | ${role.ability} | ${role.writes} | ${role.contract} | ${role.testSurface} | ${role.deps} | ${role.dependsOn} | ${role.parallelGroup} | ${role.group} | ${role.apiSpec} | ${role.rationale} |`;
}

function planDoc(options: PlanOptions = {}): string {
  const flowId = options.flowId ?? "flow-a";
  const modules = options.modules ?? ["api", "storefront"];
  const roles = options.roles ?? BASE_ROLES;
  const recommended = options.recommended ?? roles.map((role) => role.roleId);
  const moduleRows = options.moduleRows ?? [
    "| api | 结算 API、订单状态、价格计算 | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.1 |",
    "| storefront | 结算页面、表单、错误展示 | `docs/contracts/api-v1.md`（消费） | `docs/planning/design.md` §4.2 |",
  ];
  const lines = [
    "---",
    `flowId: ${flowId}`,
    `version: ${options.version ?? 1}`,
    ...(options.schema === null ? [] : [`teamPlanSchema: ${options.schema ?? 2}`]),
    `riskTier: ${options.riskTier ?? "T2"}`,
    `recommended: [${recommended.join(", ")}]`,
    ...(options.blockModules === true
      ? ["modules:", ...modules.map((module) => `  - ${module}`)]
      : [`modules: [${modules.join(", ")}]`]),
    "---",
    "",
    `# 团队计划 ${flowId}`,
    "",
    ...(options.omitModuleSection === true
      ? []
      : [
          "## 模块清单",
          "",
          `| module | 职责 | 公开契约 | 架构来源 |`,
          "| --- | --- | --- | --- |",
          ...moduleRows,
          "",
        ]),
    "## 参与角色与职责",
    "",
    `| roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |`,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...roles.map(roleRow),
    "",
    ...(options.omitCoordinationSection === true
      ? []
      : [
          "## 五维判断与协调成本",
          "",
          options.coordinationBody ??
            "- 责任独立性：api/storefront/integration 各有独立变化原因与契约。\n- 范围归属：写集不相交。\n- 契约影响：api 唯一主属。\n- 证据独立性：每个 Map 角色有独立测试面。\n- 协调成本：两个 Map 组可并行，未拆到函数级。",
          "",
        ]),
  ];
  return lines.join("\n") + "\n";
}

function messages(text: string): string[] {
  return teamPlanIssueMessages(parseTeamPlan(text), "error");
}

function role(over: Partial<RoleSpec> & Pick<RoleSpec, "roleId">): RoleSpec {
  const base = BASE_ROLES.find((item) => item.roleId === over.roleId) ?? BASE_ROLES[0]!;
  return { ...base, ...over };
}

// —————————————————————— V1 / 正向 ——————————————————————

test("v2 正向：modules/模块清单/14 列角色表/MapReduce/写集解析通过", () => {
  const result = parseTeamPlan(planDoc());
  assert.equal(result.ok, true, teamPlanIssueMessages(result).join("；"));
  assert.equal(result.legacy, false);
  assert.equal(result.teamPlanSchema, 2);
  assert.equal(result.flowId, "flow-a");
  assert.equal(result.version, 1);
  assert.equal(result.riskTier, "T2");
  assert.deepEqual(result.recommended, ["api", "storefront", "integration"]);
  assert.deepEqual(result.modules, ["api", "storefront"]);
  assert.deepEqual(result.moduleList.map((row) => row.module), ["api", "storefront"]);
  assert.equal(result.roleRows.length, 3);
  const api = result.roleRows.find((row) => row.roleId === "api")!;
  assert.deepEqual(api.modules, ["api"]);
  assert.deepEqual(api.writesets.map((entry) => entry.path), ["src/api/", "test/api/"]);
  assert.equal(api.writesets.some((entry) => entry.path.includes("docs/contracts/")), false, "只读契约不算写集");
  assert.equal(api.isMap, true);
  assert.equal(api.isReduce, false);
  assert.deepEqual(api.dependsOn, []);
  assert.equal(api.apiSpecStatus, "required");
  const integration = result.roleRows.find((row) => row.roleId === "integration")!;
  assert.equal(integration.isReduce, true);
  assert.deepEqual(integration.dependsOn, ["api", "storefront"]);
  assert.equal(integration.apiSpecStatus, "not-applicable");
  assert.equal(integration.apiSpecReason, "测试角色不导出产品接口");
  assert.deepEqual(teamPlanIssueMessages(result, "warning"), []);
  assert.deepEqual(teamPlanIssueMessages(result, "exception-review"), []);
});

test("v1 legacy：缺 teamPlanSchema 只跑旧表格检查，不强制 v2 字段；缺职责仍拒绝", () => {
  const legacy = [
    "---",
    "flowId: flow-a",
    "version: 1",
    "riskTier: T1",
    "recommended: [executor]",
    "---",
    "",
    "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| executor | new | 实现 | 能写代码 | `src/executor/` | 无 | 开发 | required |",
    "",
  ].join("\n");
  const parsed = parseTeamPlan(legacy);
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.teamPlanSchema, 1);
  assert.equal(parsed.ok, true, teamPlanIssueMessages(parsed).join("；"));
  assert.deepEqual(parsed.recommended, ["executor"]);
  assert.deepEqual(parsed.modules, []);

  const explicitV1 = parseTeamPlan(legacy.replace("riskTier: T1", "teamPlanSchema: 1\nriskTier: T1"));
  assert.equal(explicitV1.legacy, true);
  assert.equal(explicitV1.ok, true, teamPlanIssueMessages(explicitV1).join("；"));

  const missingDuty = legacy.replace("| executor | new | 实现 |", "| executor | new |  |");
  assert.deepEqual(legacyTeamPlanRoleRowIssues(missingDuty, ["executor"]), [
    "团队计划角色 executor 的「职责目标」为空",
  ]);
  assert.equal(parseTeamPlan(missingDuty).ok, false);
});

test("V1：flowId 不一致 / version 非正整数 / riskTier 非法 / modules 块数组 / 重复或保留 reduce", () => {
  const mismatched = parseTeamPlan(planDoc({ flowId: "flow-b" }), { flowId: "flow-a" });
  assert.ok(teamPlanIssueMessages(mismatched).some((message) => /flowId="flow-b" 与卡片 flowId="flow-a" 不一致/.test(message)));
  assert.ok(messages(planDoc({ version: "x" })).some((message) => /version 必须是正整数/.test(message)));
  assert.ok(messages(planDoc({ riskTier: "T9" })).some((message) => /riskTier 必须是 T0–T3/.test(message)));
  const block = parseTeamPlan(planDoc({ blockModules: true }));
  assert.ok(teamPlanIssueMessages(block).some((message) => /modules 必须写成同一行内联数组/.test(message)));
  const duplicateModules = parseTeamPlan(planDoc({ modules: ["api", "api"] }));
  assert.ok(teamPlanIssueMessages(duplicateModules).some((message) => /modules 重复列出模块「api」/.test(message)));
  const reserved = parseTeamPlan(planDoc({ modules: ["api", "reduce"], roles: BASE_ROLES }));
  assert.ok(teamPlanIssueMessages(reserved).some((message) => /reduce.*保留模块值/.test(message)));
  const badSlug = parseTeamPlan(planDoc({ modules: ["Api"] }));
  assert.ok(teamPlanIssueMessages(badSlug).some((message) => /模块 id「Api」非法/.test(message)));
});

test("V1：推荐集为空 / 含内置治理角色 / 推荐角色缺行", () => {
  assert.ok(messages(planDoc({ recommended: [] })).some((message) => /推荐集|缺少唯一的机器可读推荐集/.test(message)));
  assert.ok(
    messages(planDoc({ recommended: ["api", "storefront", "integration", "convener"] })).some((message) =>
      /推荐集含内置治理角色（convener）/.test(message),
    ),
  );
  assert.ok(
    messages(
      planDoc({
        roles: [role({ roleId: "api" }), role({ roleId: "integration", dependsOn: "api" })],
        recommended: ["api", "storefront", "integration"],
      }),
    ).some((message) => /缺少推荐角色 storefront 的角色行/.test(message)),
  );
});

test("V2/V3：列重复/缺列、类型非法、必填为空、apiSpec 无理由", () => {
  const duplicateColumn = parseTeamPlan(planDoc().replace("| 粒度理由 |", "| 粒度理由 | contract |"));
  assert.ok(teamPlanIssueMessages(duplicateColumn).some((message) => /列「公开契约」重复\/歧义/.test(message)));

  const missingColumn = planDoc().replace(" | 粒度理由 |", " | 备注 |");
  assert.ok(teamPlanIssueMessages(parseTeamPlan(missingColumn)).some((message) => /缺少必需列（粒度理由）/.test(message)));

  const badType = parseTeamPlan(planDoc({ roles: [role({ roleId: "api", type: "legacy" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }));
  assert.ok(teamPlanIssueMessages(badType).some((message) => /类型必须是 new\/changed\/existing/.test(message)));

  const emptyDuty = parseTeamPlan(planDoc({ roles: [role({ roleId: "api", duty: "" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }));
  assert.ok(teamPlanIssueMessages(emptyDuty).some((message) => /角色 api 的「职责目标」为空/.test(message)));

  const duplicateRow = parseTeamPlan(
    planDoc({
      roles: [BASE_ROLES[0]!, BASE_ROLES[0]!, BASE_ROLES[1]!, BASE_ROLES[2]!],
      recommended: ["api", "storefront", "integration"],
    }),
  );
  assert.ok(teamPlanIssueMessages(duplicateRow).some((message) => /角色 api 出现 2 行/.test(message)));

  const badApiSpec = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", apiSpec: "not-applicable" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(badApiSpec).some((message) => /apiSpec=not-applicable 必须附非空理由/.test(message)));
});

test("V4：模块清单缺模块/孤儿/未声明/重复覆盖；Reduce 不计入模块覆盖", () => {
  const missingListRow = parseTeamPlan(
    planDoc({ moduleRows: ["| api | 结算 API | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.1 |"] }),
  );
  assert.ok(teamPlanIssueMessages(missingListRow).some((message) => /模块清单缺少模块「storefront」/.test(message)));

  const orphan = parseTeamPlan(
    planDoc({
      moduleRows: [
        "| api | 结算 API | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.1 |",
        "| storefront | 页面 | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.2 |",
        "| payment | 支付 | `docs/contracts/pay-v1.md` | `docs/planning/design.md` §4.3 |",
      ],
    }),
  );
  assert.ok(teamPlanIssueMessages(orphan).some((message) => /未声明模块「payment」/.test(message)));

  const undeclaredRoleModule = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", module: "payment" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(undeclaredRoleModule).some((message) => /未声明的模块「payment」/.test(message)));

  const duplicateCoverage = parseTeamPlan(
    planDoc({ roles: [BASE_ROLES[0]!, role({ roleId: "storefront", module: "api", writes: "`src/storefront2/`; `test/storefront2/`" }), BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(duplicateCoverage).some((message) => /模块「api」被多个 Map 角色覆盖/.test(message)));

  // Reduce 角色 module=reduce 不计入覆盖：把 storefront 行也改成 reduce 后，storefront 模块变孤儿。
  const reduceNotCounted = parseTeamPlan(
    planDoc({
      roles: [
        BASE_ROLES[0]!,
        role({ roleId: "storefront", module: "reduce", parallelGroup: "reduce", dependsOn: "api", writes: "`src/storefront/`; `test/storefront/`" }),
        BASE_ROLES[2]!,
      ],
    }),
  );
  assert.ok(teamPlanIssueMessages(reduceNotCounted).some((message) => /模块「storefront」没有 Map 角色覆盖/.test(message)));
});

test("V5：写集语法（通配符/散文/.. /绝对/治理路径）与跨角色重叠", () => {
  const wildcard = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`src/api/*.ts`; `test/api/`" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(wildcard).some((message) => /通配符\/省略号/.test(message)));

  const prose = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`src/api/` 与测试" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(prose).some((message) => /含空白\/散文/.test(message)));

  const traversal = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`../api/`" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(traversal).some((message) => /空段|\.\./.test(message)));

  const absolute = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`/src/api/`" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(absolute).some((message) => /绝对路径/.test(message)));

  for (const forbidden of ["`.ans/`", "`docs/scheduling/`", "`docs/acceptance/`", "`docs/communication/`", "`docs/flows/`", "`docs/nominations/`", "`角色卡/`"]) {
    const parsed = parseTeamPlan(
      planDoc({ roles: [role({ roleId: "api", writes: forbidden }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
    );
    assert.ok(
      teamPlanIssueMessages(parsed).some((message) => /治理\/他人角色路径/.test(message)),
      `治理路径 ${forbidden} 必须拒绝`,
    );
  }

  const overlap = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`src/shared/`; `test/api/`" }), role({ roleId: "storefront", writes: "`src/shared/db.ts`; `test/storefront/`" }), BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(overlap).some((message) => /写集重叠/.test(message)));
});

test("写集原语（V12 复用）：解析/目录前缀重叠/治理路径判定", () => {
  const parsed = parseWritesetCell("`src/api/`; `src/api/index.ts`");
  assert.equal(parsed.issues.length, 0);
  assert.deepEqual(parsed.entries, [
    { raw: "src/api/", path: "src/api/", directory: true },
    { raw: "src/api/index.ts", path: "src/api/index.ts", directory: false },
  ]);
  assert.equal(writesetsOverlap(parsed.entries[0]!, parsed.entries[1]!), true);
  assert.equal(
    writesetsOverlap(
      { raw: "src/a.ts", path: "src/a.ts", directory: false },
      { raw: "src/b.ts", path: "src/b.ts", directory: false },
    ),
    false,
  );
  assert.equal(isGovernanceWritesetPath(".ans/ledger.jsonl"), true);
  assert.equal(isGovernanceWritesetPath("docs/scheduling/x.md"), true);
  assert.equal(isGovernanceWritesetPath("src/api/"), false);
});

test("V6：Map 测试面必须是测试路径；Reduce 测试面须含集成/e2e/装配；internal 契约须理由", () => {
  const mapNoPath = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", testSurface: "跑单测" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(mapNoPath).some((message) => /Map 角色 api 的测试面至少需要一个测试路径/.test(message)));

  const reduceNoCheck = parseTeamPlan(
    planDoc({ roles: [BASE_ROLES[0]!, BASE_ROLES[1]!, role({ roleId: "integration", testSurface: "随便" })] }),
  );
  assert.ok(
    teamPlanIssueMessages(reduceNoCheck).some((message) => /Reduce 角色 integration 的测试面至少需要集成\/e2e\/装配检查之一/.test(message)),
  );

  const internalNoReason = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", contract: "`internal`" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(internalNoReason).some((message) => /公开契约 internal 必须附非空理由/.test(message)));
});

test("V7：dependsOn 目标不存在/自依赖/重复/环", () => {
  assert.ok(
    messages(planDoc({ roles: [role({ roleId: "api", dependsOn: "ghost" }), BASE_ROLES[1]!, BASE_ROLES[2]!] })).some((message) =>
      /指向不存在的角色「ghost」/.test(message),
    ),
  );
  assert.ok(
    messages(planDoc({ roles: [role({ roleId: "api", dependsOn: "api" }), BASE_ROLES[1]!, BASE_ROLES[2]!] })).some((message) =>
      /不能依赖自己/.test(message),
    ),
  );
  assert.ok(
    messages(planDoc({ roles: [role({ roleId: "api", dependsOn: "storefront, storefront" }), BASE_ROLES[1]!, BASE_ROLES[2]!] })).some((message) =>
      /dependsOn 重复列出角色「storefront」/.test(message),
    ),
  );
  const cycle = parseTeamPlan(
    planDoc({
      roles: [
        role({ roleId: "api", dependsOn: "storefront" }),
        role({ roleId: "storefront", dependsOn: "api" }),
        BASE_ROLES[2]!,
      ],
    }),
  );
  assert.ok(teamPlanIssueMessages(cycle).some((message) => /dependsOn 形成环/.test(message)));
});

test("V8：同 map 组依赖/Map 依赖 Reduce/Reduce 未覆盖全部 Map/组语法非法/缺 Reduce 角色", () => {
  const sameGroup = parseTeamPlan(
    planDoc({
      roles: [role({ roleId: "api", parallelGroup: "map-a" }), role({ roleId: "storefront", parallelGroup: "map-a", dependsOn: "api" }), BASE_ROLES[2]!],
    }),
  );
  assert.ok(teamPlanIssueMessages(sameGroup).some((message) => /同一 map-a 组内的角色 api 与 storefront 之间存在依赖路径/.test(message)));

  const mapDependsReduce = parseTeamPlan(
    planDoc({
      roles: [
        role({ roleId: "api", dependsOn: "integration" }),
        BASE_ROLES[1]!,
        BASE_ROLES[2]!,
      ],
    }),
  );
  assert.ok(teamPlanIssueMessages(mapDependsReduce).some((message) => /Map 角色 api 不得依赖 Reduce 角色 integration/.test(message)));

  const reduceMissing = parseTeamPlan(
    planDoc({ roles: [BASE_ROLES[0]!, BASE_ROLES[1]!, role({ roleId: "integration", dependsOn: "api" })] }),
  );
  assert.ok(teamPlanIssueMessages(reduceMissing).some((message) => /未直接或传递覆盖全部 Map 角色（缺：storefront）/.test(message)));

  const badGroup = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", parallelGroup: "wave-1" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.ok(teamPlanIssueMessages(badGroup).some((message) => /并行组「wave-1」非法/.test(message)));

  const noReduce = parseTeamPlan(planDoc({ roles: [BASE_ROLES[0]!, BASE_ROLES[1]!], recommended: ["api", "storefront"] }));
  assert.ok(teamPlanIssueMessages(noReduce).some((message) => /至少需要一个 Reduce 角色/.test(message)));
});

test("V9：整层名/多模块无理由硬拒；有理由 exception-review；单文件 warning", () => {
  const layerRows = [
    "| frontend | 前端壳 | `docs/contracts/ui-v1.md` | `docs/planning/design.md` §4.1 |",
    "| storefront | 页面 | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.2 |",
  ];
  const layer = parseTeamPlan(
    planDoc({
      modules: ["frontend", "storefront"],
      moduleRows: layerRows,
      roles: [role({ roleId: "api", module: "frontend" }), BASE_ROLES[1]!, BASE_ROLES[2]!],
    }),
  );
  assert.ok(teamPlanIssueMessages(layer).some((message) => /模块「frontend」是通用层名且未写「粒度理由」/.test(message)));

  const layerWithReason = parseTeamPlan(
    planDoc({
      modules: ["frontend", "storefront"],
      moduleRows: layerRows,
      roles: [
        role({ roleId: "api", module: "frontend", rationale: "既有前端壳复用，下一次实质变更拆分" }),
        BASE_ROLES[1]!,
        BASE_ROLES[2]!,
      ],
    }),
  );
  assert.equal(layerWithReason.ok, true, teamPlanIssueMessages(layerWithReason).join("；"));
  assert.ok(
    teamPlanIssueMessages(layerWithReason, "exception-review").some((message) => /命中通用层名黑名单/.test(message)),
  );

  const multiRoles = [
    role({ roleId: "api", module: "api+storefront", writes: "`src/api/`; `test/api/`" }),
    role({ roleId: "integration", dependsOn: "api" }),
  ];
  const multi = parseTeamPlan(planDoc({ roles: multiRoles, recommended: ["api", "integration"] }));
  assert.ok(teamPlanIssueMessages(multi).some((message) => /覆盖多个模块.*未写「粒度理由」/.test(message)));

  const multiWithReason = parseTeamPlan(
    planDoc({
      roles: [
        role({
          roleId: "api",
          module: "api+storefront",
          rationale: "主模块 api；storefront 复用同一契约，过渡期合并",
          writes: "`src/api/`; `test/api/`",
        }),
        role({ roleId: "integration", dependsOn: "api" }),
      ],
      recommended: ["api", "integration"],
    }),
  );
  assert.equal(multiWithReason.ok, true, teamPlanIssueMessages(multiWithReason).join("；"));
  assert.deepEqual(multiWithReason.roleRows.find((row) => row.roleId === "api")?.modules, ["api", "storefront"]);
  assert.equal(multiWithReason.roleRows.find((row) => row.roleId === "api")?.primaryModule, "api", "主模块为第一个");
  assert.ok(
    teamPlanIssueMessages(multiWithReason, "exception-review").some((message) => /覆盖多个模块/.test(message)),
  );

  const singleFile = parseTeamPlan(
    planDoc({ roles: [role({ roleId: "api", writes: "`src/api/index.ts`" }), BASE_ROLES[1]!, BASE_ROLES[2]!] }),
  );
  assert.equal(singleFile.ok, true, teamPlanIssueMessages(singleFile).join("；"));
  assert.ok(teamPlanIssueMessages(singleFile, "warning").some((message) => /写集只有单个文件/.test(message)));
});

test("V10：缺「五维判断/协调成本」章节或章节为空 ⇒ 拒绝", () => {
  assert.ok(messages(planDoc({ omitCoordinationSection: true })).some((message) => /缺少「五维判断\/协调成本」章节/.test(message)));
  assert.ok(
    messages(planDoc({ coordinationBody: "   " })).some((message) => /「五维判断\/协调成本」章节为空/.test(message)),
  );
});

test("V2 别名列：boundedContext/contract/testSurface/parallelGroup/granularityRationale", () => {
  const text = planDoc()
    .replace(
      "| roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |",
      "| roleId | 类型 | boundedContext | 职责目标 | 能力要求 | 唯一写集 | contract | testSurface | 依赖 | dependsOn | parallelGroup | 组别 | apiSpec | granularityRationale |",
    );
  const parsed = parseTeamPlan(text);
  assert.equal(parsed.ok, true, teamPlanIssueMessages(parsed).join("；"));
  assert.equal(parsed.roleRows.find((row) => row.roleId === "api")?.parallelGroup, "map-a");
});

// —————————————————————— V11 ——————————————————————

const CONSISTENT_FLOW = `flowId: flow-a
version: 1
qualityTier: production
steps:
  - id: contract-freeze
    title: 冻结契约
    owner: convener
    kind: artifact
    status: done
    evidence: { kind: artifact, ref: docs/contracts/api-v1.md }
  - id: delivery-api
    title: Map A｜api
    owner: api
    kind: dispatch
    status: pending
    parallelGroup: map-a
    dependsOn: [contract-freeze]
  - id: delivery-storefront
    title: Map B｜storefront
    owner: storefront
    kind: dispatch
    status: pending
    parallelGroup: map-b
    dependsOn: [contract-freeze, delivery-api]
  - id: test-map-shards
    title: Map 测试分片
    owner: integration
    kind: dispatch
    status: pending
    parallelGroup: reduce
    dependsOn: [delivery-api, delivery-storefront]
  - id: verification-evidence
    title: 证据合并
    owner: integration
    kind: artifact
    status: pending
    parallelGroup: reduce
    dependsOn: [test-map-shards]
  - id: acceptance
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;

function flowOf(text = CONSISTENT_FLOW) {
  const parsed = parseFlowStateYaml(text, "flow-a");
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  return parsed.ok ? parsed.flow : undefined!;
}

test("V11 正向：delivery-<module>/owner/parallelGroup/dependsOn 精确一致；Reduce 覆盖全部 Map", () => {
  const plan = parseTeamPlan(planDoc());
  assert.equal(plan.ok, true, teamPlanIssueMessages(plan).join("；"));
  assert.deepEqual(validateTeamPlanFlowConsistency(plan, flowOf()), []);
});

test("V11：缺 Map 交付步骤 / owner 不符 / parallelGroup 不符 / dependsOn 多或缺", () => {
  const plan = parseTeamPlan(planDoc());
  assert.equal(plan.ok, true);
  const baseFlow = flowOf();
  const withSteps = (steps: FlowStateStep[]) => ({ ...baseFlow, steps });

  const missing = withSteps(
    baseFlow.steps
      .filter((step) => step.id !== "delivery-storefront")
      .map((step) => (step.id === "test-map-shards" ? { ...step, dependsOn: ["delivery-api"] } : step)),
  );
  assert.ok(
    validateTeamPlanFlowConsistency(plan, missing).some((issue) => /缺少 Map 角色 storefront 的交付步骤 delivery-storefront/.test(issue.message)),
  );

  const wrongOwner = withSteps(
    baseFlow.steps.map((step) => (step.id === "delivery-storefront" ? { ...step, owner: "api" } : step)),
  );
  assert.ok(
    validateTeamPlanFlowConsistency(plan, wrongOwner).some((issue) => /步骤 delivery-storefront 的 owner=api，应为角色 storefront/.test(issue.message)),
  );

  // 计划把 storefront 放进另一个合法 map 组（flow 仍合法），V11 报组不一致。
  const wrongGroupPlan = parseTeamPlan(
    planDoc({ roles: [BASE_ROLES[0]!, role({ roleId: "storefront", parallelGroup: "map-c" }), BASE_ROLES[2]!] }),
  );
  assert.equal(wrongGroupPlan.ok, true, teamPlanIssueMessages(wrongGroupPlan).join("；"));
  assert.ok(
    validateTeamPlanFlowConsistency(wrongGroupPlan, baseFlow).some((issue) =>
      /步骤 delivery-storefront 的 parallelGroup=map-b，应为 map-c/.test(issue.message),
    ),
  );

  const wrongDeps = withSteps(
    baseFlow.steps.map((step) =>
      step.id === "delivery-storefront" ? { ...step, dependsOn: ["contract-freeze"] } : step,
    ),
  );
  assert.ok(
    validateTeamPlanFlowConsistency(plan, wrongDeps).some((issue) =>
      /dependsOn 必须精确等于 \{contract-freeze\} ∪ 依赖角色的 delivery-\*；缺：delivery-api/.test(issue.message),
    ),
  );

  const extraDeps = withSteps([
    ...baseFlow.steps.map((step) =>
      step.id === "delivery-storefront"
        ? { ...step, dependsOn: ["contract-freeze", "delivery-api", "peer-review"] }
        : step,
    ),
    { id: "peer-review", title: "同行复核", owner: "integration", kind: "artifact", status: "pending" },
  ]);
  assert.ok(
    validateTeamPlanFlowConsistency(plan, extraDeps).some((issue) => /多：peer-review/.test(issue.message)),
  );
});

test("V11：Reduce 未覆盖全部 Map / 缺 Reduce 步骤 / 缺 contract-freeze", () => {
  const plan = parseTeamPlan(planDoc());
  assert.equal(plan.ok, true);
  const baseFlow = flowOf();
  const withSteps = (steps: FlowStateStep[]) => ({ ...baseFlow, steps });

  const reduceMissingMap = withSteps(
    baseFlow.steps.map((step) =>
      step.id === "test-map-shards" ? { ...step, dependsOn: ["delivery-api"] } : step,
    ),
  );
  assert.ok(
    validateTeamPlanFlowConsistency(plan, reduceMissingMap).some((issue) =>
      /Reduce 步骤 test-map-shards 必须直接或传递依赖全部 Map 交付（缺：delivery-storefront）/.test(issue.message),
    ),
  );

  const noReduce = withSteps(
    baseFlow.steps.filter((step) => step.id !== "test-map-shards" && step.id !== "verification-evidence"),
  );
  assert.ok(
    validateTeamPlanFlowConsistency(plan, noReduce).some((issue) => /缺少 Reduce 步骤/.test(issue.message)),
  );

  // flow 静态校验本身会拒绝“Map dispatch 无 contract-freeze”，这里直接构造 FlowState 覆盖 V11 防御分支。
  const noContractFreeze = withSteps([
    { id: "delivery-api", title: "Map A", owner: "api", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: [] },
    {
      id: "delivery-storefront",
      title: "Map B",
      owner: "storefront",
      kind: "dispatch",
      status: "pending",
      parallelGroup: "map-b",
      dependsOn: ["delivery-api"],
    },
    {
      id: "reduce-all",
      title: "Reduce",
      owner: "integration",
      kind: "dispatch",
      status: "pending",
      parallelGroup: "reduce",
      dependsOn: ["delivery-api", "delivery-storefront"],
    },
  ]);
  assert.ok(
    validateTeamPlanFlowConsistency(plan, noContractFreeze).some((issue) => /缺少 contract-freeze 步骤/.test(issue.message)),
  );
});

// —————————————————————— v3：目录级授权（2026-10-23） ——————————————————————

interface V3RoleSpec extends RoleSpec {
  /** `授权目录` 原始单元格。 */
  dirs: string;
  /** `精确写集` 原始单元格（`无` 合法）。 */
  precise: string;
}

const V3_ROLES: V3RoleSpec[] = [
  {
    ...BASE_ROLES[0]!,
    dirs: "`src/api/`; `src/api/tests/`; `src/api/docs/`",
    precise: "`docs/contracts/api-v1.md`",
    testSurface: "`src/api/tests/`",
  },
  {
    ...BASE_ROLES[1]!,
    dirs: "`src/storefront/`; `src/storefront/tests/`",
    precise: "无",
    testSurface: "`src/storefront/tests/`",
  },
  {
    ...BASE_ROLES[2]!,
    dirs: "`test/integration/`",
    precise: "无",
    testSurface: "`test/integration/`（集成/e2e）",
  },
];

const V3_MODULE_ROWS = [
  "| api | 结算 API、订单状态、价格计算 | `docs/contracts/api-v1.md` | `docs/planning/design.md` §4.1 | `src/api/` |",
  "| storefront | 结算页面、表单、错误展示 | `docs/contracts/api-v1.md`（消费） | `docs/planning/design.md` §4.2 | `src/storefront/` |",
];

const V3_DIRECTORIES = [
  "src/api/",
  "src/api/tests/",
  "src/api/docs/",
  "src/storefront/",
  "src/storefront/tests/",
  "test/integration/",
];

const V3_DIRECTORY_ROWS = [
  "| `src/api/` | api | implementation | 结算 API 与订单状态 | kebab-case | `tests/`; `docs/`; `handlers/` | .ts | `docs/contracts/api-v1.md` | `src/api/tests/` | 无 | `.env`; `*.log`; `dist/` | none |",
  "| `src/api/tests/` | api | tests | API 单元/层测试 | `*.test.ts` | `fixtures/` | .ts | internal（消费 api 契约） | `src/api/tests/` | `src/api/` | `dist/` | none |",
  "| `src/api/docs/` | api | docs | 模块说明/变更记录 | kebab-case | `design/`; `change/` | .md | internal（模块文档） | — | `src/api/` | `.env` | none |",
  "| `src/storefront/` | storefront | implementation | 结算页面与交互 | kebab-case | `tests/` | .ts | `docs/contracts/api-v1.md`（消费） | `src/storefront/tests/` | 无 | `dist/` | none |",
  "| `src/storefront/tests/` | storefront | tests | 页面单元/层测试 | `*.test.ts` | — | .ts | internal（消费 api 契约） | `src/storefront/tests/` | `src/storefront/` | `dist/` | none |",
  "| `test/integration/` | integration | tests | 契约/集成/e2e | kebab-case | `fixtures/` | .ts | internal（集成测试） | `test/integration/` | `src/api/`; `src/storefront/` | `.env` | none |",
];

const V3_ROLE_HEADER =
  "| roleId | 类型 | module | 职责目标 | 能力要求 | 授权目录 | 精确写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |";

interface V3PlanOptions {
  flowId?: string;
  version?: number | string;
  riskTier?: string;
  schema?: string | null;
  recommended?: string[];
  modules?: string[];
  moduleHeader?: string;
  moduleRows?: string[];
  roleHeader?: string;
  roles?: V3RoleSpec[];
  directoryHeader?: string;
  directoryRows?: string[];
  directories?: string[];
  /** 直接覆盖 frontmatter `directories` 行（用于缺省/块数组等负例）。 */
  directoriesLine?: string | null;
  omitDirectorySection?: boolean;
  coordinationBody?: string;
}

function v3RoleRow(role: V3RoleSpec): string {
  return `| ${role.roleId} | ${role.type} | ${role.module} | ${role.duty} | ${role.ability} | ${role.dirs} | ${role.precise} | ${role.contract} | ${role.testSurface} | ${role.deps} | ${role.dependsOn} | ${role.parallelGroup} | ${role.group} | ${role.apiSpec} | ${role.rationale} |`;
}

function v3PlanDoc(options: V3PlanOptions = {}): string {
  const flowId = options.flowId ?? "flow-a";
  const modules = options.modules ?? ["api", "storefront"];
  const roles = options.roles ?? V3_ROLES;
  const recommended = options.recommended ?? roles.map((role) => role.roleId);
  const directories = options.directories ?? V3_DIRECTORIES;
  const directoriesLine =
    options.directoriesLine === undefined
      ? `directories: [${directories.join(", ")}]`
      : options.directoriesLine;
  const moduleHeader = options.moduleHeader ?? "| module | 职责 | 公开契约 | 架构来源 | 实现目录 |";
  const moduleSeparator =
    moduleHeader === "| module | 职责 | 公开契约 | 架构来源 |"
      ? "| --- | --- | --- | --- |"
      : "| --- | --- | --- | --- | --- |";
  const directoryHeader =
    options.directoryHeader ??
    "| 目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 | 共享 |";
  const directoryRows = options.directoryRows ?? V3_DIRECTORY_ROWS;
  const lines = [
    "---",
    `flowId: ${flowId}`,
    `version: ${options.version ?? 1}`,
    ...(options.schema === null ? [] : [`teamPlanSchema: ${options.schema ?? 3}`]),
    `riskTier: ${options.riskTier ?? "T3"}`,
    `recommended: [${recommended.join(", ")}]`,
    `modules: [${modules.join(", ")}]`,
    ...(directoriesLine === null ? [] : [directoriesLine]),
    "---",
    "",
    `# 团队计划 ${flowId}`,
    "",
    "## 模块清单",
    "",
    moduleHeader,
    moduleSeparator,
    ...(options.moduleRows ?? V3_MODULE_ROWS),
    "",
    "## 参与角色与职责",
    "",
    options.roleHeader ?? V3_ROLE_HEADER,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...roles.map(v3RoleRow),
    "",
    ...(options.omitDirectorySection === true
      ? []
      : [
          "## 目录规范",
          "",
          directoryHeader,
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
          ...directoryRows,
          "",
        ]),
    "## 五维判断与协调成本",
    "",
    options.coordinationBody ??
      "- 责任独立性：api/storefront/integration 各有独立变化原因与契约。\n- 范围归属：目录唯一 owner、互不重叠。\n- 契约影响：api 唯一主属。\n- 证据独立性：每个角色有独立测试面。\n- 协调成本：两个 Map 组可并行，未拆到函数级。",
    "",
  ];
  return lines.join("\n") + "\n";
}

function v3messages(text: string, severity: "error" | "warning" | "exception-review" = "error"): string[] {
  return teamPlanIssueMessages(parseTeamPlan(text), severity);
}

function v3role(over: Partial<V3RoleSpec> & Pick<V3RoleSpec, "roleId">): V3RoleSpec {
  const base = V3_ROLES.find((item) => item.roleId === over.roleId) ?? V3_ROLES[0]!;
  return { ...base, ...over };
}

test("v3 正向：directories/目录规范/授权目录+精确写集/模块实现目录/唯一 owner/依赖 DAG/V11 不变", () => {
  const result = parseTeamPlan(v3PlanDoc());
  assert.equal(result.ok, true, teamPlanIssueMessages(result).join("；"));
  assert.equal(result.teamPlanSchema, TEAM_PLAN_SCHEMA_V3);
  assert.equal(result.legacy, false);
  assert.deepEqual(result.directories, V3_DIRECTORIES);
  assert.equal(result.directorySpecs.length, 6);
  const apiSpec = result.directorySpecs.find((spec) => spec.dir === "src/api/")!;
  assert.equal(apiSpec.owner, "api");
  assert.equal(apiSpec.kind, "implementation");
  assert.deepEqual(apiSpec.subdirs, ["tests", "docs", "handlers"]);
  assert.deepEqual(apiSpec.extensions, [".ts"]);
  assert.equal(apiSpec.shared, "none");
  assert.deepEqual(result.directorySpecs.find((spec) => spec.dir === "src/api/tests/")?.dependencies, ["src/api/"]);
  assert.equal(result.moduleList.find((row) => row.module === "api")?.implementationDir, "src/api/");
  const api = result.roleRows.find((row) => row.roleId === "api")!;
  assert.deepEqual(api.authorizedDirs.map((entry) => entry.path), ["src/api/", "src/api/tests/", "src/api/docs/"]);
  assert.deepEqual(api.preciseWritesets.map((entry) => entry.path), ["docs/contracts/api-v1.md"]);
  // v3 不改 flow schema / V11：同一模块/角色/并行组时 V11 与 v2 完全一致。
  assert.deepEqual(validateTeamPlanFlowConsistency(result, flowOf()), []);
});

test("V-D1：缺/空/块数组/重复/非法语法/治理路径/大小写重复 ⇒ error", () => {
  assert.ok(v3messages(v3PlanDoc({ directoriesLine: null })).some((message) => /缺少 frontmatter `directories`/.test(message)));
  assert.ok(v3messages(v3PlanDoc({ directoriesLine: "directories: []" })).some((message) => /directories 不得为空/.test(message)));
  assert.ok(v3messages(v3PlanDoc({ directoriesLine: "directories:" })).some((message) => /内联数组/.test(message)));
  assert.ok(
    v3messages(v3PlanDoc({ directories: [...V3_DIRECTORIES, "src/api/"] })).some((message) =>
      /directories 重复列出目录「src\/api\/」/.test(message),
    ),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [../src/api/]" })).some((message) => /含空段|\.\./.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [C:/abs/]" })).some((message) => /绝对路径|盘符/.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [src/api./]" })).some((message) => /以空格或点结尾/.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [src/api/, SRC/API/]" })).some((message) =>
      /directories 重复列出目录/.test(message),
    ),
  );
  for (const governed of [".ans/", "角色卡/", "docs/scheduling/", "docs/acceptance/", "docs/communication/", "docs/flows/", "docs/nominations/", "docs/verification/", "src/common/shared/", "src/model/", ".github/workflows/", "src/common/装配/"]) {
    assert.ok(
      v3messages(v3PlanDoc({ directoriesLine: `directories: [${governed}]`, directories: [governed] })).some((message) =>
        /治理关键路径/.test(message),
      ),
      `治理关键路径 ${governed} 必须被 V-D1 拒绝`,
    );
  }
});

test("V-D2：规范表缺列/缺行/多行/重复行/owner 非推荐/必填空/枚举非法 ⇒ error", () => {
  assert.ok(
    v3messages(v3PlanDoc({ omitDirectorySection: true })).some((message) => /缺少「目录规范」表/.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoryHeader: "| 目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 |" })).some(
      (message) => /目录规范表缺少必需列（共享）/.test(message),
    ),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoryRows: V3_DIRECTORY_ROWS.slice(0, -1) })).some((message) =>
      /目录规范缺少目录「test\/integration\/」/.test(message),
    ),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [
          ...V3_DIRECTORY_ROWS,
          "| `src/extra/` | integration | tests | 额外 | kebab-case | — | .ts | internal（额外） | test/integration/ | 无 | — | none |",
        ],
      }),
    ).some((message) => /未声明的目录「src\/extra\/」/.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoryRows: [...V3_DIRECTORY_ROWS, V3_DIRECTORY_ROWS[0]!] })).some((message) =>
      /目录规范重复列出目录「src\/api\/」/.test(message),
    ),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| api |", "| ghost |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /owner「ghost」不是推荐角色/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| 结算 API 与订单状态 |", "| — |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /用途为空/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| implementation |", "| impl |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /类型「impl」非法/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| `src/api/tests/` | 无 |", "| — | 无 |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /测试面为空/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| none |", "| both |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /共享值「both」非法/.test(message)),
  );
});

test("V-D3：角色引用未声明目录/owner 不符/孤儿目录/文件例外缺粒度理由 ⇒ error", () => {
  assert.ok(
    v3messages(v3PlanDoc({ roles: [V3_ROLES[0]!, V3_ROLES[1]!, v3role({ roleId: "integration", dirs: "`test/other/`" })] })).some(
      (message) => /不在 frontmatter `directories` 中/.test(message),
    ),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [V3_ROLES[0]!, v3role({ roleId: "storefront", dirs: "`src/storefront/`; `src/api/tests/`" }), V3_ROLES[2]!],
      }),
    ).some((message) => /owner 是「api」（owner 不一致）/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [v3role({ roleId: "api", dirs: "`src/api/`; `src/api/tests/`" }), V3_ROLES[1]!, V3_ROLES[2]!],
      }),
    ).some((message) => /孤儿目录/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [
          V3_ROLES[0]!,
          V3_ROLES[1]!,
          v3role({ roleId: "integration", dirs: "无", precise: "`test/integration/manifest.md`", rationale: "—" }),
        ],
      }),
    ).some((message) => /文件例外，必须写「粒度理由」/.test(message)),
  );
});

test("V-D4：跨角色目录重叠/嵌套/精确文件落入他人目录/精确文件相等 ⇒ error", () => {
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [V3_ROLES[0]!, v3role({ roleId: "storefront", dirs: "`src/api/`; `src/storefront/`; `src/storefront/tests/`" }), V3_ROLES[2]!],
      }),
    ).some((message) => /目录\/写集重叠/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directories: [...V3_DIRECTORIES, "src/api/nested/"],
        directoryRows: [
          ...V3_DIRECTORY_ROWS,
          "| `src/api/nested/` | storefront | implementation | 嵌套 | kebab-case | — | .ts | internal（嵌套） | `src/api/tests/` | `src/api/` | — | none |",
        ],
        roles: [V3_ROLES[0]!, v3role({ roleId: "storefront", dirs: "`src/storefront/`; `src/storefront/tests/`; `src/api/nested/`" }), V3_ROLES[2]!],
      }),
    ).some((message) => /目录\/写集重叠/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [
          v3role({ roleId: "api", precise: "`docs/contracts/api-v1.md`; `src/storefront/logo.ts`" }),
          V3_ROLES[1]!,
          V3_ROLES[2]!,
        ],
      }),
    ).some((message) => /目录\/写集重叠/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [
          v3role({ roleId: "api", precise: "`docs/contracts/shared.ts`" }),
          v3role({ roleId: "storefront", precise: "`docs/contracts/shared.ts`" }),
          V3_ROLES[2]!,
        ],
      }),
    ).some((message) => /目录\/写集重叠/.test(message)),
  );
});

test("V-D5：依赖不存在/方向不一致/成环/禁写区冲突/子目录/扩展名/internal 契约 ⇒ error", () => {
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!, V3_DIRECTORY_ROWS[1]!.replace("| `src/api/` | `dist/` |", "| `src/ghost/` | `dist/` |"), ...V3_DIRECTORY_ROWS.slice(2)],
      }),
    ).some((message) => /依赖目标「src\/ghost\/」不存在/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| 无 | `.env`", "| `src/storefront/` | `.env`"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /方向不一致/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [
          V3_DIRECTORY_ROWS[0]!.replace("| 无 | `.env`", "| `src/storefront/` | `.env`"),
          ...V3_DIRECTORY_ROWS.slice(1, 3),
          V3_DIRECTORY_ROWS[3]!.replace("| 无 | `dist/`", "| `src/api/` | `dist/`"),
          ...V3_DIRECTORY_ROWS.slice(4),
        ],
      }),
    ).some((message) => /目录依赖形成环/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| `.env`; `*.log`; `dist/` |", "| `*.ts` |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /禁写区「\*\.ts」与允许文件类型「\.ts」冲突/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("`tests/`; `docs/`; `handlers/`", "`../handlers/`"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /允许子目录项.*非法/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!.replace("| .ts |", "| * |"), ...V3_DIRECTORY_ROWS.slice(1)],
      }),
    ).some((message) => /不能使用 `\*`（仅 docs\/evidence 可用）/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[2]!.replace("internal（模块文档）", "internal"), ...V3_DIRECTORY_ROWS.slice(0, 2), ...V3_DIRECTORY_ROWS.slice(3)],
      }),
    ).some((message) => /internal 必须附非空理由/.test(message)),
  );
});

test("V-D6：缺实现目录列/空实现目录/角色目录不在模块实现目录/整层名无理由与有理由", () => {
  assert.ok(
    v3messages(
      v3PlanDoc({
        moduleHeader: "| module | 职责 | 公开契约 | 架构来源 |",
        moduleRows: V3_MODULE_ROWS.map((row) => row.replace(/ \| `src\/[^`]+` \|$/, " |")),
      }),
    ).some((message) => /缺少必需列「实现目录」/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        moduleRows: [V3_MODULE_ROWS[0]!.replace("| `src/api/` |", "| — |"), V3_MODULE_ROWS[1]!],
      }),
    ).some((message) => /模块清单「api」缺少非空的「实现目录」/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        moduleRows: [V3_MODULE_ROWS[0]!.replace("| `src/api/` |", "| `src/api-impl/` |"), V3_MODULE_ROWS[1]!],
      }),
    ).some((message) => /不在模块实现目录内/.test(message)),
  );
  const layerDirectories = V3_DIRECTORIES.map((dir) => (dir === "test/integration/" ? "test/" : dir));
  const layerRows = V3_DIRECTORY_ROWS.map((row) =>
    row.startsWith("| `test/integration/`") ? row.replace("| `test/integration/` |", "| `test/` |") : row,
  );
  const layerRoles = [V3_ROLES[0]!, V3_ROLES[1]!, v3role({ roleId: "integration", dirs: "`test/`", rationale: "—" })];
  const layerNoReason = parseTeamPlan(
    v3PlanDoc({ directories: layerDirectories, directoryRows: layerRows, roles: layerRoles }),
  );
  assert.ok(
    teamPlanIssueMessages(layerNoReason).some((message) => /整层\/整应用目录且未写「粒度理由」/.test(message)),
  );
  const layerWithReason = parseTeamPlan(
    v3PlanDoc({
      directories: layerDirectories,
      directoryRows: layerRows,
      roles: [V3_ROLES[0]!, V3_ROLES[1]!, v3role({ roleId: "integration", dirs: "`test/`", rationale: "跨模块测试树，属既有职责" })],
    }),
  );
  assert.equal(layerWithReason.ok, true, teamPlanIssueMessages(layerWithReason).join("；"));
  assert.ok(
    teamPlanIssueMessages(layerWithReason, "exception-review").some((message) => /整层名黑名单/.test(message)),
  );
});

test("V-D6：单文件目录 warning（不阻断）交 readiness", () => {
  const result = parseTeamPlan(
    v3PlanDoc({
      roles: [V3_ROLES[0]!, V3_ROLES[1]!, v3role({ roleId: "integration", dirs: "`test/integration/`" })],
      directoryRows: [
        ...V3_DIRECTORY_ROWS.slice(0, 5),
        V3_DIRECTORY_ROWS[5]!.replace("| `fixtures/` | .ts |", "| — | .ts |"),
      ],
    }),
  );
  assert.equal(result.ok, true, teamPlanIssueMessages(result).join("；"));
  assert.ok(teamPlanIssueMessages(result, "warning").some((message) => /疑似单文件目录/.test(message)));
});

test("V-D7/V-D8：治理路径精确写集目录被拒；shared: split 父目录不得直接分配", () => {
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [v3role({ roleId: "api", precise: "`src/common/shared/`" }), V3_ROLES[1]!, V3_ROLES[2]!],
      }),
    ).some((message) => /只能精确文件/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        directoryRows: [V3_DIRECTORY_ROWS[0]!, ...V3_DIRECTORY_ROWS.slice(1, 2), V3_DIRECTORY_ROWS[2]!.replace("| none |", "| split |"), ...V3_DIRECTORY_ROWS.slice(3)],
      }),
    ).some((message) => /shared: split，但父目录本身被角色 api 直接分配/.test(message)),
  );
});

test("V-D9：路径逃逸/UNC/尾随点；角色授权目录路径安全", () => {
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [../outside/]" })).some((message) => /空段|\.\./.test(message)),
  );
  assert.ok(
    v3messages(v3PlanDoc({ directoriesLine: "directories: [\\\\server\\share\\]" })).some((message) => /UNC|绝对路径|空段/.test(message)),
  );
  assert.ok(
    v3messages(
      v3PlanDoc({
        roles: [v3role({ roleId: "api", dirs: "`../src/api/`" }), V3_ROLES[1]!, V3_ROLES[2]!],
      }),
    ).some((message) => /授权目录项「\.\.\/src\/api\/」/.test(message)),
  );
});

test("v3 列名兼容：唯一写集别名 warning；边界列名 error；未知 schema 拒绝", () => {
  const alias = parseTeamPlan(v3PlanDoc({ roleHeader: V3_ROLE_HEADER.replace("精确写集", "唯一写集") }));
  assert.equal(alias.ok, true, teamPlanIssueMessages(alias).join("；"));
  assert.ok(teamPlanIssueMessages(alias, "warning").some((message) => /「唯一写集」别名/.test(message)));
  const boundary = parseTeamPlan(v3PlanDoc({ roleHeader: V3_ROLE_HEADER.replace("精确写集", "边界") }));
  assert.ok(teamPlanIssueMessages(boundary).some((message) => /不再接受「边界」列名/.test(message)));
  const unknown = parseTeamPlan(v3PlanDoc({ schema: "9" }));
  assert.ok(teamPlanIssueMessages(unknown).some((message) => /teamPlanSchema 只能是 1（legacy）、2 或 3/.test(message)));
});

test("v1/v2 legacy 不变：v2 计划仍按 2 解析且不要求 directories/实现目录", () => {
  const v2 = parseTeamPlan(planDoc());
  assert.equal(v2.ok, true, teamPlanIssueMessages(v2).join("；"));
  assert.equal(v2.teamPlanSchema, 2);
  assert.deepEqual(v2.directories, []);
  assert.deepEqual(v2.directorySpecs, []);
  assert.equal(v2.moduleList.every((row) => row.implementationDir === undefined), true);
  assert.equal(parseTeamPlan(planDoc({ schema: null })).teamPlanSchema, 1);
  assert.equal(parseTeamPlanModuleIds(planDoc()).modules?.length, 2);
});
