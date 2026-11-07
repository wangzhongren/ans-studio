// chief 角色模块差分测试（E1.7 / 契约 §7.3；E2 X-R6 fixture 金样化 / E2 检查单 G9）。
//
// E2 X-R6 门面切换后，本测试不再 import/读取旧引擎：期望值全部来自 `./oracle-fixture.ts` 的
// 冻结金样（规格/cards/tools/dispatch/preflight/context 资源/hub 数据）。旧实现删除后差分仍可
// 运行；`KNOWN_DELTAS` 登记所有已知差异（契约明文项，模块更严或只回答本角色范围，非放宽）。
//
// 保留的差分矩阵（不弱化）：
//  - 规格：8 字段（id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/
//    capabilities/cards）+ 卡文本 sha256/长度/行数；
//  - tools：D1 14 项 `ROLE_TOOL_CATALOG` + chief 6-id 声明（含 E2 C-1 `closeCreatedTask`）的
//    映射名/顺序/旧装配校验冻结；`decidePendingRequest` 仅独立决策上下文、不由普通会话声明；
//  - dispatch：11 例 = zero 8 + documented 3（allow 位、稳定码、reportToRoleId）；
//  - preflight：14 例 = zero 12 + documented 2（runId/refs 路径形状仍由宿主最终校验）；
//  - context 资源：path/version/sha256/bytes 与捕获期宿主 loader 实测一致；
//  - hub 数据：routing/source/report/purpose/schema/五内置目标与 apply-journal 捕获值一致；
//  - 已知差异：dispatch-existence（2）/ dispatch-scope（1）/ preflight-final-validation（2），
//    以及 tools-declaration-vs-injection / cards-source-oracle 说明项。
//
// 本文件只读取 E0.3 冻结契约字节做哈希断言（非旧引擎）；状态/矩阵均在金样元数据中记录。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { RoleDispatchPolicyInput, RolePreflightInput } from "../../../src/model/role.ts";
import {
  CHIEF_HUB_DISPATCH,
  CHIEF_TOOL_IDS,
  CHIEF_WORKFLOW_RESOURCE,
  chiefRoleModule,
} from "../../../src/common/roles/chief/index.ts";
import {
  KNOWN_DELTAS,
  ORACLE_CHIEF_DECISION_CONTEXT,
  ORACLE_CHIEF_HUB_DISPATCH,
  ORACLE_CHIEF_SPEC,
  ORACLE_CHIEF_TOOL_DECLARATION,
  ORACLE_CHIEF_WORKFLOW_RESOURCE,
  ORACLE_DISPATCH_CASES,
  ORACLE_GOLDEN_META,
  ORACLE_GOLDEN_PAYLOAD,
  ORACLE_PREFLIGHT_CASES,
  ORACLE_ROLE_TOOL_CATALOG,
  ORACLE_RUN_ROLE_TOOL_GATES,
} from "./oracle-fixture.ts";

const TEST_DIR = import.meta.dirname;
const CONTRACT_SOURCE = new URL(
  "../../../docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md",
  import.meta.url,
);

/** 旧 oracle 模块路径片段：差分测试与 fixture 均不得 import（E2 删除旧实现后须仍可运行）。 */
const LEGACY_ORACLE_IMPORT_FRAGMENTS = [
  "门禁引擎/governance-roles",
  "门禁引擎/role-tool-registry",
  "编排/workflow-preconditions",
  "编排/version-decision",
  "pipeline/orchestration/run-role",
  "service/trunk/impl/apply-journal",
  "provider/runtime/tools",
] as const;

const MODULE = chiefRoleModule;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

function denyCode(decision: { readonly allow: boolean; readonly code?: string }): string | null {
  return decision.allow === false ? (decision.code ?? "") : null;
}

function knownDeltaPrefixes(): string[] {
  return KNOWN_DELTAS.map((delta) => delta.slice(0, delta.indexOf("：")));
}

// —————————————————————— 1. 契约冻结 ——————————————————————

test("差分：契约冻结文件哈希（E0.3 067e3d2e…，差分输入未漂移）", async () => {
  const bytes = await readFile(CONTRACT_SOURCE);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
  );
});

// —————————————————————— 2. 规格数据逐字段差分 ——————————————————————

test("差分：card/entries/preauthorized/forbidden/capabilities/displayName/function/cards 与冻结金样逐字段一致（差异 0）", () => {
  const differences: string[] = [];
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      differences.push(`${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
  };
  compare("id", MODULE.id, ORACLE_CHIEF_SPEC.id);
  compare("displayName", MODULE.displayName, ORACLE_CHIEF_SPEC.displayName);
  compare("function", MODULE.function, ORACLE_CHIEF_SPEC.function);
  compare("card.entries", MODULE.card.entries, ORACLE_CHIEF_SPEC.entries);
  compare("card.preauthorizedDirs", [...MODULE.card.preauthorizedDirs], [...ORACLE_CHIEF_SPEC.preauthorizedDirs]);
  compare(
    "card.forbiddenWritePaths",
    [...MODULE.card.forbiddenWritePaths],
    [...ORACLE_CHIEF_SPEC.forbiddenWritePaths],
  );
  compare("capabilities", MODULE.capabilities, ORACLE_CHIEF_SPEC.capabilities);
  compare("cards", [...MODULE.cards], [...ORACLE_CHIEF_SPEC.cards]);
  assert.deepEqual(differences, [], "规格差分必须为 0");
  assert.deepEqual(Object.keys(ORACLE_CHIEF_SPEC).sort(), [
    "capabilities",
    "cardText",
    "cards",
    "displayName",
    "entries",
    "forbiddenWritePaths",
    "function",
    "id",
    "preauthorizedDirs",
  ]);
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
});

test("差分：卡文本 sha256 / 长度 / 行数零差异", () => {
  const text = MODULE.card.text;
  const sha256 = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  assert.equal(sha256, ORACLE_CHIEF_SPEC.cardText.sha256, "卡文本 sha256 必须与金样一致");
  assert.equal(text.length, ORACLE_CHIEF_SPEC.cardText.length, "卡文本长度必须与金样一致");
  assert.equal(text.split("\n").length, ORACLE_CHIEF_SPEC.cardText.lineCount, "卡文本行数必须与金样一致");
});

test("差分：cards 与金样一致（D8；旧 run-role 源码 oracle 已冻结，不含 legacy write）", () => {
  assert.deepEqual([...MODULE.cards], [...ORACLE_CHIEF_SPEC.cards]);
  assert.deepEqual([...MODULE.cards], ["intent-confirm"]);
  assert.equal(MODULE.cards.includes("write" as never), false);
});

// —————————————————————— 3. tools（D1 + 6-id 声明 + C-1） ——————————————————————

test("差分：6 个工具 id 全部通过旧 D1 装配校验，映射名/顺序与冻结结果一致（含 closeCreatedTask）", () => {
  const policy = MODULE.tools({ governanceModel: "trio" });
  const declared = [...policy.tools];
  assert.deepEqual(declared, [...ORACLE_CHIEF_TOOL_DECLARATION.tools], "模块声明必须与金样一致");
  assert.deepEqual([...policy.reasons], [], "trio 不应有结构化原因");
  assert.deepEqual(declared, [...CHIEF_TOOL_IDS], "CHIEF_TOOL_IDS 必须与 tools() 声明同一来源");

  // 旧 D1 `validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)` 捕获结果（冻结）。
  const goldenValidation = ORACLE_CHIEF_TOOL_DECLARATION.validation;
  assert.equal(goldenValidation.allow, true, "捕获期整单校验必须合法");
  assert.deepEqual(goldenValidation.reasons, []);
  assert.deepEqual(
    goldenValidation.tools.map((binding) => binding.id),
    [...ORACLE_CHIEF_TOOL_DECLARATION.tools],
    "校验绑定顺序必须与声明顺序一致",
  );
  assert.deepEqual(goldenValidation.tools.map((binding) => binding.name), [
    "role_activity_log",
    "terminate_role_run",
    "redispatch_task",
    "project_note",
    "request_version_decision",
    "close_created_task",
  ]);

  // D1 catalog 冻结：声明项均允许 chief；未声明但允许 chief 的只有 decidePendingRequest。
  assert.equal(ORACLE_ROLE_TOOL_CATALOG.length, ORACLE_GOLDEN_META.counts.toolsCatalog);
  assert.equal(ORACLE_ROLE_TOOL_CATALOG.length, 14);
  for (const entry of ORACLE_ROLE_TOOL_CATALOG) {
    const isDeclared = ORACLE_CHIEF_TOOL_DECLARATION.tools.includes(entry.id);
    const allowsChief = entry.allowedRoleIds.includes("chief");
    if (isDeclared) assert.equal(allowsChief, true, `${entry.id}: 声明项必须允许 chief`);
    if (!isDeclared && allowsChief) {
      assert.equal(entry.id, "decidePendingRequest", `意外：${entry.id} 允许 chief 但未声明`);
    }
  }
  assert.equal(declared.includes("closeCreatedTask"), true, "E2 C-1：closeCreatedTask 必须声明");
});

test("差分（E2 C-1 处置）：closeCreatedTask 已纳入模块声明；decidePendingRequest 仍不由普通会话声明", () => {
  const closeEntry = ORACLE_ROLE_TOOL_CATALOG.find((entry) => entry.id === "closeCreatedTask");
  assert.ok(closeEntry);
  assert.equal(closeEntry!.allowedRoleIds.includes("chief"), true);
  assert.equal(closeEntry!.allowedRoleIds.includes("convener"), true, "closeCreatedTask 为 chief/convener 共享能力");
  assert.equal(closeEntry!.chiefIndependentDecisionOnly, undefined, "closeCreatedTask 非独立决策上下文专属");
  assert.equal(CHIEF_TOOL_IDS.includes("closeCreatedTask"), true);

  const decideEntry = ORACLE_ROLE_TOOL_CATALOG.find((entry) => entry.id === "decidePendingRequest");
  assert.ok(decideEntry);
  assert.equal(decideEntry!.chiefIndependentDecisionOnly, true);
  assert.equal(CHIEF_TOOL_IDS.includes("decidePendingRequest"), false, "独立决策上下文工具由调用点注入，不由普通会话声明");

  // 旧注入点证据（历史锚点，运行期不读取旧文件）：closeCreatedTask 受 directGovernance 与
  // chief/convener 双重门控；decidePendingRequest 只在独立 chief 决策会话装配。
  assert.equal(ORACLE_RUN_ROLE_TOOL_GATES.anchors.length, ORACLE_GOLDEN_META.counts.runRoleToolGates);
  const closeGate = ORACLE_RUN_ROLE_TOOL_GATES.anchors.find((anchor) => anchor.includes("closeCreatedTask"));
  assert.ok(closeGate, "closeCreatedTask 门控锚点必须冻结");
  assert.ok(closeGate!.includes("directGovernance"));
  assert.ok(closeGate!.includes('"chief" || setup.role.id === "convener"') || closeGate!.includes('setup.role.id === "chief"'));
  assert.equal(ORACLE_RUN_ROLE_TOOL_GATES.directGovernanceDefinition.includes("directGovernance"), true);
  assert.equal(ORACLE_CHIEF_DECISION_CONTEXT.builderFunction.length > 0, true);
  assert.equal(ORACLE_CHIEF_DECISION_CONTEXT.toolNameConstant.length > 0, true);
});

test("D10：tools().capabilities 与 spec capabilities 一致（单一真源）", () => {
  const policy = MODULE.tools({ governanceModel: "trio" });
  assert.equal(policy.capabilities, MODULE.capabilities);
  assert.deepEqual(policy.capabilities, MODULE.capabilities);
});

// —————————————————————— 4. dispatch 金样 ——————————————————————

test("差分（zero）：dispatch 与旧硬授权允许/拒绝 + 稳定 code + 报告期望逐字段一致", () => {
  const allowDifferences: string[] = [];
  const codeDifferences: string[] = [];
  const reportDifferences: string[] = [];
  let compared = 0;

  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    if (fixtureCase.differential !== "zero") continue;
    compared += 1;
    assert.equal(fixtureCase.knownDelta, null, fixtureCase.name);
    // 金样自洽：zero 口径下旧 oracle 观测值与模块期望必须逐字段相同。
    assert.equal(fixtureCase.oldAllow, fixtureCase.expectedAllow, `${fixtureCase.name}: 旧 allow 位`);
    assert.equal(fixtureCase.oldCode, fixtureCase.expectedCode, `${fixtureCase.name}: 旧拒绝码`);
    assert.equal(
      fixtureCase.oldReportToRoleId,
      fixtureCase.expectedReportToRoleId,
      `${fixtureCase.name}: 旧报告期望`,
    );

    const policy = MODULE.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    if (policy.decision.allow !== fixtureCase.expectedAllow) {
      allowDifferences.push(`${fixtureCase.name}: module=${policy.decision.allow} expected=${fixtureCase.expectedAllow}`);
    }
    const actualCode = denyCode(policy.decision);
    if (actualCode !== fixtureCase.expectedCode) {
      codeDifferences.push(`${fixtureCase.name}: code=${actualCode} expected=${fixtureCase.expectedCode}`);
    }
    const actualReport = policy.reportToRoleId ?? null;
    if (actualReport !== fixtureCase.expectedReportToRoleId) {
      reportDifferences.push(`${fixtureCase.name}: report=${actualReport} expected=${fixtureCase.expectedReportToRoleId}`);
    }
    if (fixtureCase.expectedAllow) {
      assert.equal(fixtureCase.expectedReportToRoleId, fixtureCase.input.sourceRoleId, fixtureCase.name);
      assert.deepEqual(policy.decision, { allow: true }, fixtureCase.name);
    } else {
      assert.equal(fixtureCase.expectedReportToRoleId, null, fixtureCase.name);
      assert.equal(
        policy.decision.allow === false ? policy.decision.messageKey.startsWith("role.chief.dispatch.") : false,
        true,
        fixtureCase.name,
      );
    }
  }

  assert.deepEqual(allowDifferences, [], "派发 allow 位差分必须为 0");
  assert.deepEqual(codeDifferences, [], "派发稳定码差分必须为 0");
  assert.deepEqual(reportDifferences, [], "派发 reportToRoleId 差分必须为 0");
  assert.equal(compared, ORACLE_GOLDEN_META.counts.dispatchZero);
  assert.equal(compared, 8, "zero 差分 fixture 数量");
});

test("差分（documented）：契约明文差异逐条单列（targetExists 收紧 / 只回答 chief 来源）", () => {
  let compared = 0;
  const deltaCounts = new Map<string, number>();
  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    if (fixtureCase.differential !== "documented") continue;
    compared += 1;
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);
    assert.equal(fixtureCase.expectedAllow, false, `${fixtureCase.name}: documented 必须模块拒绝`);
    const differs = fixtureCase.oldAllow !== fixtureCase.expectedAllow
      || fixtureCase.oldCode !== fixtureCase.expectedCode;
    assert.equal(differs, true, `${fixtureCase.name}：登记为 documented 差异必须真实存在`);
    assert.notEqual(fixtureCase.knownDelta, null, `${fixtureCase.name}: documented 必须登记差异类别`);
    assert.equal(knownDeltaPrefixes().includes(fixtureCase.knownDelta!), true, `${fixtureCase.name}: 差异类别未登记`);
    deltaCounts.set(fixtureCase.knownDelta!, (deltaCounts.get(fixtureCase.knownDelta!) ?? 0) + 1);

    const policy = MODULE.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    assert.equal(policy.decision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    assert.equal(denyCode(policy.decision), fixtureCase.expectedCode, fixtureCase.name);
    assert.equal(policy.reportToRoleId, undefined, fixtureCase.name);
    assert.equal(
      policy.decision.allow === false ? policy.decision.messageKey.startsWith("role.chief.dispatch.") : false,
      true,
      fixtureCase.name,
    );
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.dispatchDocumented);
  assert.equal(compared, 3, "documented 差异 fixture 数量");
  assert.equal(deltaCounts.get("dispatch-existence"), 2);
  assert.equal(deltaCounts.get("dispatch-scope"), 1);
});

// —————————————————————— 5. preflight 金样 ——————————————————————

test("差分（preflight，zero）：请求形状与旧 validateVersionDecisionRequest 判定一致（差异 0 子集）", () => {
  let compared = 0;
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    if (fixtureCase.differential !== "zero") continue;
    compared += 1;
    assert.equal(fixtureCase.knownDelta, null, fixtureCase.name);
    assert.equal(fixtureCase.oldAllow, fixtureCase.expectedAllow, `${fixtureCase.name}: 旧请求形状 oracle allow 位`);
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);

    const decision = MODULE.preflight!.checkAction({
      action: "version-decision",
      facts: fixtureCase.facts,
    } as RolePreflightInput);
    assert.equal(decision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    assert.equal(denyCode(decision), fixtureCase.expectedCode, fixtureCase.name);
    if (decision.allow === false) {
      assert.equal(decision.messageKey.startsWith("role.chief.preflight."), true, fixtureCase.name);
      if (decision.details !== undefined) {
        assert.equal(typeof decision.details, "object");
        assert.doesNotThrow(() => JSON.stringify(decision.details));
      }
    } else {
      assert.deepEqual(decision, { allow: true }, fixtureCase.name);
    }
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.preflightZero);
  assert.equal(compared, 12, "zero 差分 fixture 数量");
});

test("差分（列明方案差异）：runId/refs 的路径形状由宿主最终校验，preflight 只做存在/类型/上限", () => {
  let compared = 0;
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    if (fixtureCase.differential !== "documented") continue;
    compared += 1;
    assert.equal(fixtureCase.expectedAllow, true, fixtureCase.name);
    assert.equal(fixtureCase.oldAllow, false, `${fixtureCase.name}: 宿主最终校验仍拒绝`);
    assert.equal(fixtureCase.expectedCode, null, fixtureCase.name);
    assert.equal(fixtureCase.knownDelta, "preflight-final-validation", fixtureCase.name);
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);

    const decision = MODULE.preflight!.checkAction({
      action: "version-decision",
      facts: fixtureCase.facts,
    } as RolePreflightInput);
    assert.deepEqual(decision, { allow: true }, `${fixtureCase.name}: preflight 只做角色侧前置`);
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.preflightDocumented);
  assert.equal(compared, 2, "documented 差异 fixture 数量");
});

// —————————————————————— 6. context 资源 / hub 数据金样 ——————————————————————

test("差分：chief-workflow 资源 path/version/sha256/bytes 与宿主 loader 捕获值一致（按现状）", () => {
  assert.deepEqual(
    {
      path: CHIEF_WORKFLOW_RESOURCE.path,
      version: CHIEF_WORKFLOW_RESOURCE.version,
      sha256: CHIEF_WORKFLOW_RESOURCE.sha256,
      bytes: ORACLE_CHIEF_WORKFLOW_RESOURCE.bytes,
      loadedSourcePathSuffix: ORACLE_CHIEF_WORKFLOW_RESOURCE.loadedSourcePathSuffix,
    },
    {
      path: ORACLE_CHIEF_WORKFLOW_RESOURCE.path,
      version: ORACLE_CHIEF_WORKFLOW_RESOURCE.version,
      sha256: ORACLE_CHIEF_WORKFLOW_RESOURCE.sha256,
      bytes: 8724,
      loadedSourcePathSuffix: `/${CHIEF_WORKFLOW_RESOURCE.path}`,
    },
  );
  assert.equal(typeof CHIEF_WORKFLOW_RESOURCE.sha256, "string");
  assert.match(CHIEF_WORKFLOW_RESOURCE.sha256!, /^[0-9a-f]{64}$/);
  assert.equal(ORACLE_CHIEF_WORKFLOW_RESOURCE.bytes, 8724);
});

test("差分：hub 目标五内置与 apply-journal 新内置任务允许集一致（捕获期金样）", () => {
  assert.deepEqual(
    {
      routing: CHIEF_HUB_DISPATCH.routing,
      sourceRoleId: CHIEF_HUB_DISPATCH.sourceRoleId,
      reportToRoleId: CHIEF_HUB_DISPATCH.reportToRoleId,
      purpose: CHIEF_HUB_DISPATCH.purpose,
      workSourceSchema: CHIEF_HUB_DISPATCH.workSourceSchema,
      targetRoleIds: [...CHIEF_HUB_DISPATCH.targetRoleIds],
    },
    {
      routing: ORACLE_CHIEF_HUB_DISPATCH.routing,
      sourceRoleId: ORACLE_CHIEF_HUB_DISPATCH.sourceRoleId,
      reportToRoleId: ORACLE_CHIEF_HUB_DISPATCH.reportToRoleId,
      purpose: ORACLE_CHIEF_HUB_DISPATCH.purpose,
      workSourceSchema: ORACLE_CHIEF_HUB_DISPATCH.workSourceSchema,
      targetRoleIds: [...ORACLE_CHIEF_HUB_DISPATCH.targetRoleIds],
    },
  );
  assert.deepEqual([...CHIEF_HUB_DISPATCH.targetRoleIds], [
    "product",
    "rapporteur",
    "nominator",
    "convener",
    "verifier",
  ]);
  assert.deepEqual(
    [...ORACLE_CHIEF_HUB_DISPATCH.applyJournalTargetRoleIds],
    [...CHIEF_HUB_DISPATCH.targetRoleIds],
    "apply-journal 捕获的目标集必须与模块一致",
  );
  assert.equal(ORACLE_CHIEF_HUB_DISPATCH.applyJournalHubRoutingCheck.includes("chief-hub-v1"), true);
  assert.equal(ORACLE_CHIEF_HUB_DISPATCH.applyJournalSourceCheck.includes('"chief"'), true);
  assert.equal(ORACLE_CHIEF_HUB_DISPATCH.anchor.length > 0, true);
});

// —————————————————————— 7. 金样 provenance ——————————————————————

test("金样·provenance：冻结元数据/载荷哈希自洽，且差分不再读取旧引擎（E2 G9）", async () => {
  // 1) 元数据身份与模块身份。
  assert.equal(ORACLE_GOLDEN_META.schema, "chief-oracle-golden/v1");
  assert.equal(ORACLE_GOLDEN_META.capturedAt, "2026-11-07");
  assert.equal(ORACLE_GOLDEN_META.module.path, "src/common/roles/chief/index.ts");
  assert.match(ORACLE_GOLDEN_META.module.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(ORACLE_GOLDEN_META.module.lineCount) && ORACLE_GOLDEN_META.module.lineCount > 0);

  // 2) 捕获期来源身份（历史记录；不读取工作树旧文件）。
  const capture = ORACLE_GOLDEN_META.capture;
  assert.deepEqual(Object.keys(capture).sort(), [
    "applyJournal",
    "contract",
    "governanceRoles",
    "modelRole",
    "modelRuntime",
    "roleToolRegistry",
    "runRole",
    "runtimeTools",
    "versionDecision",
    "workflowPreconditions",
    "workflowResource",
  ]);
  for (const [key, entry] of Object.entries(capture)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 捕获期来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 捕获期行数`);
    assert.ok(entry.path.startsWith("src/") || entry.path.startsWith("docs/"), `${key}: 捕获期路径`);
    assert.ok(entry.anchors.length > 0, `${key}: 捕获期锚点`);
    assert.ok(entry.capturedAt.length > 0, `${key}: 捕获时点`);
    assert.ok(entry.e2Disposition.length > 0, `${key}: E2 处置说明`);
  }

  // 3) 捕获期复核记录（冻结前执行；自比较的独立物证见 E1 §3 / X-R6 §7）。
  assert.deepEqual(ORACLE_GOLDEN_META.captureChecks, {
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    workflowResourceLoaderMatch: true,
    hubApplyJournalChecks: true,
    independentEvidence: "E1 证据 §3（编辑前差分 0）与 E2-XR6 证据 §7（切换后 zeroCopyBinding / 差分 0）",
  });

  // 4) 切换后实测：X-R6 改门面、X-R1 起改 run-role；其余文件逐字节未变。
  const changed = ORACLE_GOLDEN_META.switch.changed;
  const unchanged = ORACLE_GOLDEN_META.switch.unchanged;
  assert.deepEqual(Object.keys(changed).sort(), ["governanceRoles", "runRole", "workflowPreconditions"]);
  assert.deepEqual(Object.keys(unchanged).sort(), [
    "applyJournal",
    "contract",
    "modelRole",
    "modelRuntime",
    "roleToolRegistry",
    "runtimeTools",
    "versionDecision",
    "workflowResource",
  ]);
  // 切换后实测值（X-R6 证据 §1/§3.1/§7.1）：防元数据被静默改写。
  assert.equal(changed.governanceRoles.sha256, "6eafcf3ab8877c41ecd0bd414ce257aa4ad52e019e62edc308091d398580188f");
  assert.equal(changed.governanceRoles.lineCount, 457);
  assert.equal(changed.runRole.sha256, "493fd4ed6ccc03fedbdba2fd7d1a9233d171bd8e594a229b98b1a322c7ef10a8");
  assert.equal(changed.runRole.lineCount, 3554);
  assert.equal(changed.workflowPreconditions.sha256, "480e0e7effa7b8120f44e478673dbe0b5ca4fbdbfcf026f4238c0b73724a7ffc");
  assert.equal(changed.workflowPreconditions.lineCount, 1687);
  for (const [key, entry] of Object.entries(changed)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 切换后来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 切换后行数`);
    assert.ok((entry.change ?? "").length > 0, `${key}: 变更说明`);
  }
  for (const [key, entry] of Object.entries(unchanged)) {
    const captured = capture[key as keyof typeof capture]!;
    assert.equal(entry.path, captured.path, `${key}: 切换后路径应与捕获期一致`);
    assert.equal(entry.sha256, captured.sha256, `${key}: 切换后应与捕获期逐字节一致`);
    assert.equal(entry.lineCount, captured.lineCount, `${key}: 切换后行数应与捕获期一致`);
  }

  // 5) 计数与覆盖映射自洽（E2 G9「记录覆盖映射」；不得删覆盖）。
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
  assert.equal(ORACLE_GOLDEN_META.counts.cardText, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.cards, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsCatalog, ORACLE_ROLE_TOOL_CATALOG.length);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsDeclaration, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.runRoleToolGates, ORACLE_RUN_ROLE_TOOL_GATES.anchors.length);
  assert.equal(ORACLE_GOLDEN_META.counts.dispatchCases, ORACLE_DISPATCH_CASES.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchZero,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.differential === "zero").length,
  );
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchDocumented,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.differential === "documented").length,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.preflightCases, ORACLE_PREFLIGHT_CASES.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.preflightZero,
    ORACLE_PREFLIGHT_CASES.filter((fixtureCase) => fixtureCase.differential === "zero").length,
  );
  assert.equal(
    ORACLE_GOLDEN_META.counts.preflightDocumented,
    ORACLE_PREFLIGHT_CASES.filter((fixtureCase) => fixtureCase.differential === "documented").length,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.workflowResource, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.hubDispatch, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.knownDeltas, KNOWN_DELTAS.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.fixtureComparisons,
    ORACLE_GOLDEN_META.counts.specFields
      + ORACLE_GOLDEN_META.counts.cardText
      + ORACLE_GOLDEN_META.counts.cards
      + ORACLE_GOLDEN_META.counts.toolsCatalog
      + ORACLE_GOLDEN_META.counts.toolsDeclaration
      + ORACLE_GOLDEN_META.counts.dispatchCases
      + ORACLE_GOLDEN_META.counts.preflightCases
      + ORACLE_GOLDEN_META.counts.workflowResource
      + ORACLE_GOLDEN_META.counts.hubDispatch,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.fixtureComparisons, 52);
  assert.deepEqual(Object.keys(ORACLE_GOLDEN_META.coverage).sort(), [
    "cardText",
    "cards",
    "dispatch",
    "hubDispatch",
    "knownDeltas",
    "preflight",
    "provenance",
    "spec",
    "tools",
    "workflowResource",
  ]);

  // 6) 已知差异清单：5 类前缀齐备，且与矩阵登记一致。
  assert.deepEqual([...knownDeltaPrefixes()].sort(), [
    "cards-source-oracle",
    "dispatch-existence",
    "dispatch-scope",
    "preflight-final-validation",
    "tools-declaration-vs-injection",
  ]);
  for (const delta of KNOWN_DELTAS) {
    assert.ok(delta.length > 20, "差异登记须说明范围与理由");
  }

  // 7) 冻结载荷哈希：期望值任一改动必须同步更新元数据并登记证据（防静默漂移）。
  const payloadSha256 = createHash("sha256").update(JSON.stringify(ORACLE_GOLDEN_PAYLOAD)).digest("hex");
  assert.equal(payloadSha256, ORACLE_GOLDEN_META.payloadSha256, "冻结载荷被改动时必须同步更新元数据哈希");

  // 8) 无旧引擎 live 依赖：fixture/差分测试不得 import 旧 oracle；fixture 必须是纯数据。
  for (const file of ["oracle-fixture.ts", "differential.test.ts"]) {
    const source = await readFile(path.join(TEST_DIR, file), "utf8");
    for (const specifier of importSpecifiers(source)) {
      assert.ok(
        !LEGACY_ORACLE_IMPORT_FRAGMENTS.some((fragment) => specifier.includes(fragment)),
        `${file} 不得 import 旧引擎：${specifier}`,
      );
    }
  }
  const fixtureSource = await readFile(path.join(TEST_DIR, "oracle-fixture.ts"), "utf8");
  assert.ok(!/\bnode:fs\b/.test(fixtureSource), "fixture 必须是纯数据（不得 import node:fs）");
  assert.ok(!/\breadFileSync\b/.test(fixtureSource), "fixture 不得同步读取文件");
  const differentialSource = await readFile(path.join(TEST_DIR, "differential.test.ts"), "utf8");
  assert.ok(!/\breadFileSync\b/.test(differentialSource), "差分测试不得同步读取旧引擎文件");
});
