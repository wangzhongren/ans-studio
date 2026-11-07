// test/roles/nominator/nominator-differential.test.ts
// nominator 模块差分测试：新旧输出逐字段对照（E1；旧引擎在 E2 切换前是权威 oracle）。
//
// 差分来源：
//  - 规格数据：`src/common/门禁引擎/governance-roles.ts::governanceRoleOf("nominator")`；
//  - 卡种：`src/pipeline/orchestration/run-role.ts::TRIO_CARD_KINDS.nominator`（测试侧冻结副本，
//    因为该常量是 Pipeline 私有；E2 切换时以模块 `cards` 为准）；
//  - 工具装配：`run-role.ts::activateRoleDocuments` 注入条件（trio 且 nominator）；
//  - 派发硬授权：`src/common/编排/workflow-preconditions.ts::evaluateDispatchAuthorization`；
//  - D3 卡形状：`workflow-preconditions.ts::validateAppointmentCardAgainstRoster`；
//  - 三文档结构：`src/common/门禁引擎/boundary-core.ts::validateRoleDocumentsSnapshot`。
//  - 意图入口事实（E2 D-1）：`validateAppointmentCardAgainstRoster`、`prepareRoleActivation`
//    与 `run-role.ts:1519`（仅 judge 上下文）均不把 `intentEntryConsistent` 作为拒绝条件；
//    模块同样将其降为可选诊断事实，缺失/false 不得拒绝。
//
// 测试文件 import 旧引擎/私有 common 仅用于 oracle；生产模块零此类 import。

import { test } from "node:test";
import assert from "node:assert/strict";

import { nominatorRoleModule } from "../../../src/common/roles/nominator/index.ts";
import {
  governanceCapabilitiesOf,
  governanceRoleOf,
} from "../../../src/common/门禁引擎/governance-roles.ts";
import { validateRoleDocumentsSnapshot } from "../../../src/common/门禁引擎/boundary-core.ts";
import {
  PROJECT_ROSTER_SCHEMA,
  evaluateDispatchAuthorization,
  validateAppointmentCardAgainstRoster,
  type ProjectRoster,
} from "../../../src/common/编排/workflow-preconditions.ts";
import {
  ROSTER_ROLE_IDS,
  WORKER_ROLE_ID,
  boundaryMarkdown,
  boundaryYaml,
  d3CardFacts,
  documentHashes,
  makeSnapshot,
  roleDocumentFiles,
  roleDocumentsFacts,
  snapshotRole,
  VALID_CARD_TEXT,
} from "./fixtures/nominator-fixtures.ts";

const preflight = nominatorRoleModule.preflight;
assert.ok(preflight !== undefined);

function checkAppointment(facts: Record<string, unknown>) {
  return preflight!.checkAction({ action: "appointment", facts });
}

function decisionCode(decision: { allow: true } | { allow: false; code: string }): string {
  return decision.allow ? "allow" : decision.code;
}

// —————————————————————— 规格数据差分 ——————————————————————

test("差分：id/displayName/function/card/capabilities 与旧注册表逐字段一致", () => {
  const spec = governanceRoleOf("nominator");
  assert.ok(spec !== undefined);

  assert.equal(nominatorRoleModule.id, spec.id);
  assert.equal(nominatorRoleModule.displayName, spec.displayName);
  assert.equal(nominatorRoleModule.function, spec.function);
  assert.equal(nominatorRoleModule.card.text, spec.cardText);
  assert.deepEqual(nominatorRoleModule.card.entries, spec.entries);
  assert.deepEqual(nominatorRoleModule.card.preauthorizedDirs, spec.preauthorizedDirs);
  assert.deepEqual(nominatorRoleModule.card.forbiddenWritePaths, spec.forbiddenWritePaths);
  assert.deepEqual({ ...nominatorRoleModule.capabilities }, { ...spec.capabilities });
  assert.deepEqual(
    { ...nominatorRoleModule.capabilities },
    { ...governanceCapabilitiesOf("nominator")! },
  );
});

test("差分：cards 与 run-role.ts::TRIO_CARD_KINDS.nominator 冻结副本一致", () => {
  // 测试侧冻结副本（run-role.ts 私有常量；来源行 2872：nominator: ["appointment", "appointment-write"]）。
  const oldNominatorCardKinds = ["appointment", "appointment-write"];
  assert.deepEqual([...nominatorRoleModule.cards], oldNominatorCardKinds);
  // D8：不出现 legacy `"write"` 等 token。
  assert.equal((nominatorRoleModule.cards as readonly string[]).includes("write"), false);
});

test("差分：tools() 与旧 run-role 注入条件逐模型一致（trio 才有 activateRoleDocuments）", () => {
  // 旧注入条件：directGovernance = governanceModel === "trio" && builtInGovernance && isTrio
  // && chiefDecisionContext === undefined；再 && role.id === "nominator"。
  // nominator 会话恒为 builtIn/isTrio、非 chief 决策上下文 ⇒ 仅治理模型决定。
  for (const governanceModel of ["trio", "single"] as const) {
    const oldInjected = governanceModel === "trio" ? ["activateRoleDocuments"] : [];
    const policy = nominatorRoleModule.tools({ governanceModel });
    assert.deepEqual([...policy.tools], oldInjected);
    // D10：能力位派生自模块 spec（同一引用），与旧注册表逐字段一致。
    assert.equal(policy.capabilities, nominatorRoleModule.capabilities);
    assert.deepEqual({ ...policy.capabilities }, { ...governanceCapabilitiesOf("nominator")! });
  }
});

// —————————————————————— 派发硬授权差分 ——————————————————————

function oldDispatch(
  fromRoleId: string,
  targetRoleId: string,
  targetBuiltIn: boolean,
  targetExists: boolean,
) {
  return evaluateDispatchAuthorization({
    fromRoleId,
    targetRoleId,
    targetBuiltIn,
    targetExists,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
  });
}

function newDispatch(
  sourceRoleId: string | undefined,
  targetRoleId: string,
  targetKind: "project" | "built-in-governance",
  targetExists: boolean,
) {
  return nominatorRoleModule.dispatch({
    ...(sourceRoleId !== undefined ? { sourceRoleId } : {}),
    targetRoleId,
    targetKind,
    targetExists,
  });
}

test("差分：派发硬身份/存在性——in-scope 用例与旧 evaluateDispatchAuthorization 同码", () => {
  const cases = [
    {
      name: "chief→nominator（built-in, exists）",
      old: oldDispatch("chief", "nominator", true, true),
      next: newDispatch("chief", "nominator", "built-in-governance", true),
    },
    {
      name: "nominator→nominator（self）",
      old: oldDispatch("nominator", "nominator", true, true),
      next: newDispatch("nominator", "nominator", "built-in-governance", true),
    },
    {
      name: "product→nominator（unknown source）",
      old: oldDispatch("product", "nominator", true, true),
      next: newDispatch("product", "nominator", "built-in-governance", true),
    },
    {
      name: "convener→nominator（built-in）",
      old: oldDispatch("convener", "nominator", true, true),
      next: newDispatch("convener", "nominator", "built-in-governance", true),
    },
    {
      name: "chief→nominator（targetBuiltIn=false）",
      old: oldDispatch("chief", "nominator", false, true),
      next: newDispatch("chief", "nominator", "project", true),
    },
  ] as const;

  for (const row of cases) {
    const oldCode = row.old.ok ? "allow" : row.old.code;
    const nextCode = decisionCode(row.next.decision);
    assert.equal(nextCode, oldCode, row.name);
  }

  // 允许时报告期望真实创建者 chief；拒绝时不返回报告期望。
  assert.equal(cases[0]!.next.reportToRoleId, "chief");
  for (const row of cases.slice(1)) {
    assert.equal(row.next.reportToRoleId, undefined, row.name);
  }
});

test("差分（列明）：旧 oracle 不查内置目标存在性；本模块按 E0 §3.5 要求 targetExists=true", () => {
  const old = oldDispatch("chief", "nominator", true, false);
  assert.equal(old.ok, true, "旧 oracle：chief→builtin 不读 targetExists");
  const next = newDispatch("chief", "nominator", "built-in-governance", false);
  assert.equal(decisionCode(next.decision), "target-card-missing");
  assert.equal(next.reportToRoleId, undefined);
});

test("差分（列明）：非 nominator 目标不属于本模块范围；旧 oracle 可能允许（由目标模块回答）", () => {
  const old = oldDispatch("chief", "product", true, true);
  assert.equal(old.ok, true);
  const next = newDispatch("chief", "product", "built-in-governance", true);
  assert.equal(decisionCode(next.decision), "dispatch-not-in-module-scope");
});

// —————————————————————— D3 决定卡差分 ——————————————————————

function makeRoster(overrides: Partial<ProjectRoster> = {}): ProjectRoster {
  return {
    schema: PROJECT_ROSTER_SCHEMA,
    flowId: "focus",
    version: 3,
    intent: "docs/product/focus-intent-v1.md",
    proposal: "docs/proposals/focus-proposal-v1.md",
    architecture: "docs/contracts/focus-architecture-v1.md",
    modules: [
      {
        id: "env-resources",
        name: "环境",
        purpose: "环境",
        paths: ["assets/"],
        path: "assets/",
        category: "env",
        publicContract: "n/a",
        architectureSource: "docs/contracts/focus-architecture-v1.md",
      },
      {
        id: "entry-index",
        name: "入口",
        purpose: "入口",
        paths: ["index.md"],
        path: "index.md",
        category: "entry",
        publicContract: "n/a",
        architectureSource: "docs/contracts/focus-architecture-v1.md",
      },
      {
        id: "core",
        name: "核心",
        purpose: "核心",
        paths: ["src/"],
        path: "src/",
        category: "core",
        publicContract: "n/a",
        architectureSource: "docs/contracts/focus-architecture-v1.md",
      },
      {
        id: "qa",
        name: "质检",
        purpose: "质检",
        paths: ["test/"],
        path: "test/",
        category: "qa",
        publicContract: "n/a",
        architectureSource: "docs/contracts/focus-architecture-v1.md",
      },
    ],
    roles: [
      {
        id: "env-bootstrap",
        displayName: "装配",
        purpose: "装配",
        capability: "env",
        modules: ["env-resources", "entry-index"],
      },
      {
        id: WORKER_ROLE_ID,
        displayName: "实现",
        purpose: "实现",
        capability: "core",
        modules: ["core"],
      },
      {
        id: "qa",
        displayName: "质检",
        purpose: "质检",
        capability: "qa",
        modules: ["qa"],
      },
    ],
    envBootstrap: { omitted: false },
    ...overrides,
  };
}

test("差分：D3 卡形状——与旧 validateAppointmentCardAgainstRoster 同 allow 结论", () => {
  const roster = makeRoster();
  const cases: readonly {
    name: string;
    options: readonly string[];
    multiple: boolean;
    facts: Record<string, unknown>;
  }[] = [
    {
      name: "合法：选项=名单",
      options: [...ROSTER_ROLE_IDS],
      multiple: true,
      facts: d3CardFacts(),
    },
    {
      name: "非多选",
      options: [...ROSTER_ROLE_IDS],
      multiple: false,
      facts: d3CardFacts({ d3CardMultiple: false }),
    },
    {
      name: "缺一个名单角色",
      options: ["env-bootstrap", WORKER_ROLE_ID],
      multiple: true,
      facts: d3CardFacts({
        d3CardOptionRoleIds: ["env-bootstrap", WORKER_ROLE_ID],
      }),
    },
    {
      name: "多一个名单外角色",
      options: [...ROSTER_ROLE_IDS, "outsider"],
      multiple: true,
      facts: d3CardFacts({
        d3CardOptionRoleIds: [...ROSTER_ROLE_IDS, "outsider"],
      }),
    },
    {
      name: "含内置治理角色",
      options: [...ROSTER_ROLE_IDS, "chief"],
      multiple: true,
      facts: d3CardFacts({
        d3CardOptionRoleIds: [...ROSTER_ROLE_IDS, "chief"],
      }),
    },
  ];

  for (const row of cases) {
    const old = validateAppointmentCardAgainstRoster({
      roster,
      optionIds: row.options,
      multiple: row.multiple,
    });
    const next = checkAppointment(row.facts);
    assert.equal(next.allow, old.ok, row.name);
    if (!old.ok) assert.equal(next.allow, false, row.name);
  }
});

test("差分（E2 D-1）：D3 卡阶段意图入口事实缺失/false 不拒绝——与旧 validateAppointmentCardAgainstRoster 同 allow", () => {
  const roster = makeRoster();
  const old = validateAppointmentCardAgainstRoster({
    roster,
    optionIds: [...ROSTER_ROLE_IDS],
    multiple: true,
  });
  assert.equal(old.ok, true, "旧卡校验不读取意图入口事实");

  const missing = d3CardFacts();
  delete missing["intentEntryConsistent"];
  for (const facts of [
    missing,
    d3CardFacts({ intentEntryConsistent: false }),
    d3CardFacts({ intentEntryConsistent: true }),
  ]) {
    assert.equal(checkAppointment(facts).allow, old.ok);
  }
});

test("差分：名单未省略 env-bootstrap 但缺失——旧卡校验拒绝，本模块同样拒绝", () => {
  const roster = makeRoster({
    roles: [
      {
        id: WORKER_ROLE_ID,
        displayName: "实现",
        purpose: "实现",
        capability: "core",
        modules: ["core"],
      },
    ],
    envBootstrap: { omitted: false },
  });
  const old = validateAppointmentCardAgainstRoster({
    roster,
    optionIds: [WORKER_ROLE_ID],
    multiple: true,
  });
  assert.equal(old.ok, false);
  const next = checkAppointment(
    d3CardFacts({
      rosterRoleIds: [WORKER_ROLE_ID],
      d3CardOptionRoleIds: [WORKER_ROLE_ID],
      d3CardRecommendedRoleIds: [WORKER_ROLE_ID],
    }),
  );
  assert.equal(next.allow, false);
  assert.equal(
    next.allow === false ? next.code : "",
    "appointment-roster-env-bootstrap-missing",
  );
});

// —————————————————————— 三文档结构差分 ——————————————————————

function oldValidate(
  files: Record<string, string>,
  roleOverrides: Partial<ReturnType<typeof snapshotRole>> = {},
) {
  const snapshot = makeSnapshot(files);
  const role = snapshotRole(roleOverrides);
  return {
    snapshot,
    role,
    result: validateRoleDocumentsSnapshot({ snapshot, roles: [role] }),
  };
}

test("差分：三文档结构——与旧 validateRoleDocumentsSnapshot 同 allow 结论", () => {
  // 基线：三文档结构合法。
  const baseline = oldValidate(roleDocumentFiles());
  assert.equal(baseline.result.ok, true);
  const baselineHashes = documentHashes(baseline.snapshot, baseline.role);
  assert.deepEqual(
    checkAppointment(roleDocumentsFacts(baselineHashes)),
    { allow: true },
  );

  // boundary 条目越过角色模块授权目录 ⇒ 旧 boundary-outside-role-modules；模块 scope=false。
  const outside = oldValidate(
    roleDocumentFiles({
      boundaryMdText: boundaryMarkdown("other/"),
      boundaryYamlText: boundaryYaml("other/"),
    }),
  );
  assert.equal(outside.result.ok, false);
  assert.match(
    outside.result.ok ? "" : outside.result.message,
    /boundary-outside-role-modules/,
  );
  const outsideHashes = documentHashes(outside.snapshot, outside.role);
  assert.equal(
    checkAppointment(
      roleDocumentsFacts({ ...outsideHashes, boundaryWithinRoleModules: false }),
    ).allow,
    outside.result.ok,
  );

  // boundary.md / boundary.yaml 不同步 ⇒ 旧 boundary-md-yaml-mismatch；模块 sync=false。
  const mismatch = oldValidate(
    roleDocumentFiles({ boundaryYamlText: boundaryYaml("lib/") }),
  );
  assert.equal(mismatch.result.ok, false);
  assert.match(
    mismatch.result.ok ? "" : mismatch.result.message,
    /boundary-md-yaml-mismatch/,
  );
  const mismatchHashes = documentHashes(mismatch.snapshot, mismatch.role);
  assert.equal(
    checkAppointment(
      roleDocumentsFacts({
        ...mismatchHashes,
        boundaryMdYamlSynchronized: false,
      }),
    ).allow,
    mismatch.result.ok,
  );

  // role-card 缺必填章节 ⇒ 旧 role-card-section-missing；模块 sections=false。
  const missingSection = oldValidate(
    roleDocumentFiles({
      cardText: VALID_CARD_TEXT.replace("## 质量职责", "## 其他"),
    }),
  );
  assert.equal(missingSection.result.ok, false);
  assert.match(
    missingSection.result.ok ? "" : missingSection.result.message,
    /role-card-section-missing/,
  );
  const missingHashes = documentHashes(missingSection.snapshot, missingSection.role);
  assert.equal(
    checkAppointment(
      roleDocumentsFacts({
        ...missingHashes,
        roleCardRequiredSections: false,
      }),
    ).allow,
    missingSection.result.ok,
  );

  // 非 canonical 路径 ⇒ 旧 role-document-path-mismatch；模块 document-invalid。
  const altCardPath = `角色卡/${WORKER_ROLE_ID}/card-alt.md`;
  const wrongPath = oldValidate(roleDocumentFiles({ cardPath: altCardPath }), {
    cardPath: altCardPath,
  });
  assert.equal(wrongPath.result.ok, false);
  assert.match(
    wrongPath.result.ok ? "" : wrongPath.result.message,
    /role-document-path-mismatch/,
  );
  const wrongHashes = documentHashes(wrongPath.snapshot, wrongPath.role);
  const wrongDecision = checkAppointment(
    roleDocumentsFacts({ ...wrongHashes, cardPath: altCardPath }),
  );
  assert.equal(wrongDecision.allow, false);
  assert.equal(
    wrongDecision.allow === false ? wrongDecision.code : "",
    "appointment-document-invalid",
  );
});

test("差分（E2 D-1）：激活阶段意图入口事实缺失/false 不拒绝——旧三文档校验与 prepareRoleActivation 均不读取", () => {
  const baseline = oldValidate(roleDocumentFiles());
  assert.equal(baseline.result.ok, true);
  const hashes = documentHashes(baseline.snapshot, baseline.role);

  const missing = roleDocumentsFacts(hashes);
  delete missing["intentEntryConsistent"];
  for (const facts of [
    missing,
    roleDocumentsFacts({ ...hashes, intentEntryConsistent: false }),
    roleDocumentsFacts({ ...hashes, intentEntryConsistent: true }),
  ]) {
    assert.equal(checkAppointment(facts).allow, baseline.result.ok);
  }
  // 旧 Service `prepareRoleActivation`（apply-journal.ts）也没有意图入口一致性拒绝分支；
  // 其拒绝点仅限 D3/计划/名单/三文档字节（见下方 source-transcribed 分组）。
});

// —————————————————————— Service 前置的 source-transcribed 差分 ——————————————————————

test("差分（source-transcribed）：D3/计划前置与旧 apply-journal::prepareRoleActivation 拒绝点对齐", () => {
  // 旧实现是 Service 事务方法（非纯函数），无法直接调用；以下 expected 逐条转录自
  // `src/service/trunk/impl/apply-journal.ts::prepareRoleActivation` 的拒绝分支（行号见注释）。
  const cases: readonly {
    name: string;
    facts: Record<string, unknown>;
    expectedCode: string;
    serviceReject: string;
  }[] = [
    {
      name: "无实际 D3",
      facts: roleDocumentsFacts({ d3Present: false }),
      expectedCode: "appointment-d3-missing",
      serviceReject:
        "Latest actual D3 does not select this role against the applicable roster bytes（3138-3141）",
    },
    {
      name: "D3 未选中目标",
      facts: roleDocumentsFacts({ d3TargetRoleIds: ["env-bootstrap", "qa"] }),
      expectedCode: "appointment-d3-not-selected",
      serviceReject:
        "Latest actual D3 does not select this role against the applicable roster bytes（3138-3141）",
    },
    {
      name: "D3 名单版本/hash 漂移",
      facts: roleDocumentsFacts({ d3RosterSha256: "c".repeat(64) }),
      expectedCode: "appointment-d3-roster-mismatch",
      serviceReject:
        "Latest actual D3 does not select this role against the applicable roster bytes（3138-3141）",
    },
    {
      name: "团队计划未完整",
      facts: roleDocumentsFacts({ planCompleted: false }),
      expectedCode: "appointment-plan-incomplete",
      serviceReject: "No real convener plan-completion evidence（3118-3120）",
    },
    {
      name: "目标未被计划分配",
      facts: roleDocumentsFacts({ planRoleIds: ["env-bootstrap", "qa"] }),
      expectedCode: "appointment-plan-target-missing",
      serviceReject:
        "Activation target is not assigned by this actual plan and roster（3127-3128）",
    },
    {
      name: "目标不在名单",
      facts: roleDocumentsFacts({
        targetRoleId: "outsider",
        cardPath: "角色卡/outsider/role-card.md",
        boundaryMdPath: "角色卡/outsider/boundary.md",
        boundaryYamlPath: "角色卡/outsider/boundary.yaml",
      }),
      expectedCode: "appointment-target-not-in-roster",
      serviceReject:
        "Activation target is not assigned by this actual plan and roster（3127-3128）",
    },
  ];

  for (const row of cases) {
    const decision = checkAppointment(row.facts);
    assert.equal(decision.allow, false, row.name);
    assert.equal(decision.allow === false ? decision.code : "", row.expectedCode, row.name);
    // 记录旧 Service 拒绝点，便于 E2 切换时复核；不是执行断言。
    assert.equal(row.serviceReject.length > 0, true, row.name);
  }
});
