// 门禁引擎测试：T3「两条固定工作流路径」B2——`governance-matrix` Service 的 fixed 视图（legacy 原样）。
//
// 依据：B1 `AC-24`/`T-13`/`EV-05`、G-IR §5.7/MF-IR-4 与方案 v1.3 §3.4/§3.6/§7.4/§9.2：
//  - `governance-matrix` 工具在 fixed 模式展示 fixed 矩阵（fixed 文案 + fixedCards 路由 + 派发分裂视图）；
//  - legacy 模式原样（`buildGovernanceMatrix(input)` ≡ 显式 `legacy-v1`；legacy 文案/数据不变）；
//  - fixed 矩阵只读模块 `fixedCards`/fixed targets（缺失 ⇒ fail-closed 空集，不回退 legacy）；
//  - 不新增客户门/权限（矩阵只读展示，不是批准/授权）。
//
// 本文件只读断言；不新增依赖；不改 legacy 数据。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
  buildGovernanceMatrix,
  renderGovernanceMatrix,
} from "../../src/service/governance-matrix/public.ts";
import { buildGovernanceMatrixWith } from "../../src/service/governance-matrix/impl/builder.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  builtInRoleMatrixSummaryOf,
  builtInRoleModules,
  cardKindsOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import type {
  GovernanceMatrix,
  GovernanceMatrixInput,
  MatrixAcceptance,
} from "../../src/model/governance-matrix.ts";

const FIXED: "two-fixed-paths/v1" = "two-fixed-paths/v1";

function builtinAcceptance(): Record<string, MatrixAcceptance> {
  const result: Record<string, MatrixAcceptance> = {};
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    result[spec.id] = { state: "known", accepted: true, evidence: "客户 pin（测试夹具）", basis: "runtime" };
  }
  return result;
}

function makeInput(overrides: Partial<GovernanceMatrixInput> = {}): GovernanceMatrixInput {
  return {
    projectRoot: "/tmp/matrix-fixed-view-project",
    governanceModel: "trio",
    workerRoles: [],
    issues: [],
    warnings: [],
    roleDirectories: { found: false, totalDirs: 0, archivedSkips: 0 },
    acceptanceByRole: builtinAcceptance(),
    // Pipeline 快照按 legacy 口径传入；fixed 视图不得改读/依赖它来生成卡种视图。
    cardKindsByRole: {
      chief: { choice: ["intent-confirm"], confirm: [] },
      product: { choice: [], confirm: [] },
      rapporteur: { choice: ["proposal", "decision"], confirm: [] },
      nominator: { choice: ["appointment"], confirm: ["appointment-write"] },
      convener: { choice: ["decision"], confirm: [] },
      verifier: { choice: ["acceptance"], confirm: [] },
    },
    initiationByRole: {
      chief: { requirementChange: false, versionDecision: true, stableWrite: false },
      product: { requirementChange: false, versionDecision: false, stableWrite: false },
      rapporteur: { requirementChange: true, versionDecision: false, stableWrite: false },
      nominator: { requirementChange: false, versionDecision: false, stableWrite: false },
      convener: { requirementChange: true, versionDecision: false, stableWrite: true },
      verifier: { requirementChange: false, versionDecision: false, stableWrite: false },
    },
    session: { customerInput: true, download: true, shell: true, shellEscalation: false },
    generatedAt: "2026-11-10T10:00:00+08:00",
    ...overrides,
  };
}

function findRole(matrix: GovernanceMatrix, roleId: string): GovernanceMatrix["roles"][number] {
  const role = matrix.roles.find((candidate) => candidate.roleId === roleId);
  assert.ok(role !== undefined, `缺少角色 ${roleId}`);
  return role;
}

function ruleWorks(matrix: GovernanceMatrix): string[] {
  return matrix.routing.map((rule) => rule.work);
}

test("fixed/legacy 视图入口：缺省 ≡ 显式 legacy-v1（legacy 原样）；fixed 由显式模式选择", () => {
  const input = makeInput();
  const defaultMatrix = buildGovernanceMatrix(input);
  const explicitLegacy = buildGovernanceMatrix(input, "legacy-v1");
  assert.deepEqual(defaultMatrix, explicitLegacy, "缺省 matrix 必须逐字等价 legacy-v1（legacy 矩阵不变）");

  const fixed = buildGovernanceMatrix(input, FIXED);
  assert.equal(fixed.status, "complete");
  assert.equal(fixed.schema, "governance-matrix/v1");
  assert.deepEqual(
    fixed.roles.map((role) => role.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    "角色行/顺序不变（只换视图数据）",
  );
  assert.equal(fixed.roles.filter((role) => role.kind === "built-in-governance").length, 6);
  // 同一矩阵 inputs 下 fixed 与 legacy 必须不同（视图确实切换）。
  assert.notDeepEqual(fixed.routing, defaultMatrix.routing);
  // seam：显式矩阵模式经 `buildGovernanceMatrixWith` 亦可用（不新增 public 导出）。
  const seam = buildGovernanceMatrixWith(input, BUILT_IN_GOVERNANCE_ROLES, FIXED);
  assert.deepEqual(seam, fixed);
});

test("fixed 文案：角色 duty/mainChain/约定来自 fixed 视图（不是 legacy `spec.matrix` 回退）", () => {
  const fixed = buildGovernanceMatrix(makeInput(), FIXED);
  const legacy = buildGovernanceMatrix(makeInput());
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const fixedSummary = builtInRoleMatrixSummaryOf(spec.id, FIXED);
    assert.ok(fixedSummary !== undefined);
    const fixedRole = findRole(fixed, spec.id);
    assert.equal(fixedRole.duty.state, "known");
    if (fixedRole.duty.state === "known") {
      assert.equal(fixedRole.duty.value, fixedSummary.duty.trim(), `${spec.id} fixed duty`);
      assert.equal(fixedRole.duty.source, "builtin-registry");
    }
    assert.equal(fixedRole.mainChain.state, "known");
    if (fixedRole.mainChain.state === "known") {
      assert.deepEqual([...fixedRole.mainChain.value], [...fixedSummary.mainChain], `${spec.id} fixed mainChain`);
    }
    // legacy 视图仍用 legacy 摘要（逐字）。
    const legacyRole = findRole(legacy, spec.id);
    assert.equal(legacyRole.duty.state, "known");
    if (legacyRole.duty.state === "known") {
      assert.equal(legacyRole.duty.value, spec.matrix.duty.trim(), `${spec.id} legacy duty 逐字不变`);
    }
  }
  // 渲染文本：fixed 会话展示 fixed 文案，不出现 legacy chief 主链文案。
  const fixedText = renderGovernanceMatrix(fixed, { maxChars: GOVERNANCE_MATRIX_PROMPT_MAX_CHARS });
  const legacyText = renderGovernanceMatrix(legacy, { maxChars: GOVERNANCE_MATRIX_PROMPT_MAX_CHARS });
  const fixedChief = builtInRoleMatrixSummaryOf("chief", FIXED);
  assert.ok(fixedChief !== undefined);
  assert.ok(fixedText.includes(fixedChief.duty.trim()), "fixed 渲染须包含 fixed chief duty");
  assert.ok(fixedText.includes(fixedChief.mainChain[0]!.trim()), "fixed 渲染须包含 fixed chief mainChain");
  const legacyChief = builtInRoleMatrixSummaryOf("chief");
  assert.ok(legacyChief !== undefined);
  assert.ok(!fixedText.includes(legacyChief.duty.trim()), "fixed 渲染不得混入 legacy chief duty");
  assert.ok(legacyText.includes(legacyChief.duty.trim()), "legacy 渲染逐字保留 legacy chief duty");
  // 渲染固定句/纪律不变（矩阵不是批准）。
  assert.ok(fixedText.includes("矩阵未列出≠无权限；宿主未注入≠角色无权。"));
  assert.ok(fixedText.includes("矩阵不是批准"));
});

test("fixed 卡种路由：只读模块 `fixedCards`（缺失 ⇒ 空集 fail-closed；不读 Pipeline legacy 快照）", () => {
  const fixed = buildGovernanceMatrix(makeInput(), FIXED);
  const cardRoutes = fixed.routing.filter((rule) => rule.basis === "card-kind");
  const expectedFixedTotal = BUILT_IN_GOVERNANCE_ROLES
    .map((spec) => cardKindsOf(spec.id, FIXED).length)
    .reduce((sum, count) => sum + count, 0);
  assert.equal(cardRoutes.length, expectedFixedTotal, "fixed 卡种路由条目数 = 各模块 fixedCards 总数");
  for (const rule of cardRoutes) {
    assert.equal(rule.source, "app-rule");
    assert.match(rule.note ?? "", /fixedCards/, "fixed 卡种路由来源注明模块 fixedCards（单一来源）");
  }
  // 六模块固定值表（v1.3 §3.4）中无 acceptance/appointment-write；fixed 视图不得出现对应卡种路由。
  for (const absentWork of ["验收（acceptance）", "写卡确认（appointment-write）"]) {
    assert.equal(ruleWorks(fixed).includes(absentWork), false, `fixed 视图不得出现 legacy 卡种路由：${absentWork}`);
  }
  // legacy 视图仍保留 legacy 卡种路由（逐字）。
  const legacy = buildGovernanceMatrix(makeInput());
  assert.ok(ruleWorks(legacy).includes("验收（acceptance）"));
  assert.ok(ruleWorks(legacy).includes("写卡确认（appointment-write）"));
  // 条件断言：当六角色模块已提供 fixedCards，其卡种路由按角色出现（固定值表见 v1.3 §3.4）。
  const CARD_KIND_WORK: Readonly<Record<string, string>> = {
    "intent-confirm": "需求意图确认（intent-confirm）",
    proposal: "提案",
    appointment: "招人决定（appointment）",
    decision: "材料性选择/需求变更审批（decision）",
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    for (const kind of cardKindsOf(spec.id, FIXED)) {
      const work = CARD_KIND_WORK[kind];
      assert.ok(work !== undefined, `测试夹具缺卡种文案：${kind}`);
      assert.ok(
        fixed.routing.some((rule) => rule.basis === "card-kind" && rule.target === spec.id && rule.work === work),
        `fixed ${spec.id}/${kind} 路由须出现（work=${work}）`,
      );
    }
  }
});

test("fixed 派发视图：幕僚/运营分裂（stage-request + verifier；convener 生产线）不出现 legacy 派发/模型/发起路由", () => {
  const fixed = buildGovernanceMatrix(makeInput(), FIXED);
  const works = ruleWorks(fixed);
  const chief = builtInRoleModules.chief;
  const convener = builtInRoleModules.convener;

  // 固定矩阵语义（v1.3 §3.1/§7.4）：不存在 legacy 模型常量路由与 legacy 发起快照路由。
  assert.equal(fixed.routing.some((rule) => rule.basis === "model"), false, "fixed 视图不得含版本变更/重构 Model 常量路由");
  for (const legacyOnly of ["需求变更申请", "版本决定（request_version_decision）", "stable 写入（request_stable_write）"]) {
    assert.equal(works.includes(legacyOnly), false, `fixed 视图不得含 legacy 发起路由：${legacyOnly}`);
  }
  assert.equal(works.includes("轻量重构"), false, "fixed 视图不得含 legacy 重构路由");
  // legacy 专属派发文案（chief 五内置 / convener 派 worker）不得出现在 fixed 视图。
  assert.equal(fixed.routing.some((rule) => rule.target === "chief" && rule.work === "派发任务（dispatch_task）"), false);
  assert.equal(works.includes("实现任务派发（dispatch_task）"), false, "fixed 视图不使用 legacy convener 派发文案");
  // legacy 视图保留这些行（逐字）。
  const legacy = buildGovernanceMatrix(makeInput());
  assert.ok(ruleWorks(legacy).includes("实现任务派发（dispatch_task）"));
  assert.ok(ruleWorks(legacy).includes("派发任务（dispatch_task）"));
  assert.ok(legacy.routing.some((rule) => rule.basis === "model"));

  // convener 生产线派发行：仅当模块提供 fixedAllowedBuiltInRoleIds（缺失 ⇒ fail-closed 无行）。
  const convenerTargets = convener.fixedAllowedBuiltInRoleIds ?? [];
  const convenerRow = fixed.routing.find((rule) => rule.work === "生产线派发（dispatch_task）");
  if (convenerTargets.length === 0) {
    assert.equal(convenerRow, undefined, "convener fixed 目标缺失 ⇒ 无生产线派发视图（fail-closed）");
  } else {
    assert.ok(convenerRow !== undefined, "convener fixed 目标存在 ⇒ 生产线派发视图");
    assert.equal(convenerRow.target, "convener");
    assert.equal(convenerRow.basis, "capability");
    assert.equal(convenerRow.source, "builtin-registry");
    for (const target of convenerTargets) assert.ok((convenerRow.note ?? "").includes(target), `派发视图注明 ${target}`);
    assert.match(convenerRow.note ?? "", /verifier/, "派发视图注明不得派 verifier");
  }

  // chief→convener stage-request / chief→verifier 验收：仅当模块提供 fixedTargetRoleIds。
  const chiefTargets = chief.fixedTargetRoleIds ?? [];
  const stageRequestRow = fixed.routing.find((rule) => rule.work === "产线调度请求（stage-request）");
  const reviewRow = fixed.routing.find((rule) => rule.work === "独立验收派发（review/preparation）");
  if (chiefTargets.includes("convener")) {
    assert.ok(stageRequestRow !== undefined, "chief fixedTargetRoleIds 含 convener ⇒ stage-request 视图");
    assert.equal(stageRequestRow.target, "chief");
    assert.match(stageRequestRow.note ?? "", /read-only/);
  } else {
    assert.equal(stageRequestRow, undefined);
  }
  if (chiefTargets.includes("verifier")) {
    assert.ok(reviewRow !== undefined, "chief fixedTargetRoleIds 含 verifier ⇒ 独立验收视图");
    assert.equal(reviewRow.target, "chief");
    assert.match(reviewRow.note ?? "", /reviewRoleId/, "验收视图注明项目验收角色仅 reviewRoleId");
  } else {
    assert.equal(reviewRow, undefined);
  }
});

test("fixed 应用规则：客户决定三卡/产品意图/策划/下载可见；不新增客户门（只读展示）", () => {
  const fixed = buildGovernanceMatrix(makeInput(), FIXED);
  const find = (work: string): GovernanceMatrix["routing"][number] | undefined =>
    fixed.routing.find((rule) => rule.work === work && rule.source === "app-rule");
  const product = find("产品意图文档");
  assert.ok(product !== undefined && product.target === "product");
  const rapporteur = find("方案/名单/模块/架构/契约");
  assert.ok(rapporteur !== undefined && rapporteur.target === "rapporteur");
  const customer = find("客户决定（意图/方案/任命三卡）");
  assert.ok(customer !== undefined && customer.target === "customer");
  assert.match(customer.note ?? "", /merge-main/, "客户决定行提示 merge-main 应用呈卡");
  assert.match(customer.note ?? "", /客户本人/, "客户决定行提示高风险合并卡必须客户本人确认");
  assert.ok(find("下载") !== undefined);
  // 不新增客户门：矩阵不含 allowed/denied/approved 判定字段；fixed 视图无 "stable-write"/"appointment-write" 卡种路由。
  const serialized = JSON.stringify(fixed);
  assert.doesNotMatch(serialized, /"allowed"/);
  assert.doesNotMatch(serialized, /"denied"/);
  assert.doesNotMatch(serialized, /"approved"/);
  assert.equal(fixed.routing.some((rule) => rule.basis === "card-kind" && /stable-write|appointment-write|merge-main/.test(rule.work)), false);
});

test("fixed 视图只读：构建不改写注册表/模块；同一输入两次构建逐字一致（无缓存/时钟）", () => {
  const registryBefore = JSON.stringify(BUILT_IN_GOVERNANCE_ROLES);
  const modulesBefore = JSON.stringify(builtInRoleModules);
  const input = makeInput();
  const first = buildGovernanceMatrix(input, FIXED);
  const second = buildGovernanceMatrix(input, FIXED);
  assert.notEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.generatedAt, input.generatedAt);
  assert.equal(JSON.stringify(BUILT_IN_GOVERNANCE_ROLES), registryBefore, "fixed 构建不得改写注册表");
  assert.equal(JSON.stringify(builtInRoleModules), modulesBefore, "fixed 构建不得改写模块数据");
});
