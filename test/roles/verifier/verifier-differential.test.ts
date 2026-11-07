// verifier 角色模块差分测试（E1.7 / 契约 §7.3；E2 X-R5 fixture 金样化 / E2 检查单 G9）。
//
// E2 X-R5 门面切换后，本测试不再 import/读取旧引擎：期望值全部来自 `./oracle-fixture.ts` 的
// 冻结金样（规格/cards/tools/dispatch/preflight）。旧实现删除后差分仍可运行；`KNOWN_DELTAS`
// 登记所有已知差异（契约明文项，模块更严，非放宽）。
//
// 保留的差分矩阵（不弱化）：
//  - 规格：8 字段（id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/
//    capabilities/cards）+ 卡文本 sha256/长度/行数；
//  - tools：D1 14 项 `ROLE_TOOL_CATALOG`（无一允许 verifier）+ 空声明 trio/single 与捕获校验；
//  - dispatch：15 例 = zero 9 + documented 4 + module-only 2（allow 位、稳定码、reportToRoleId）；
//  - preflight：24 例 = zero 17 + documented 7（E2 P5 未登记键负例，含旧 oracle 会放行的 4 例）；
//  - 已知差异：dispatch-scope / dispatch-existence（2）/ dispatch-kind-mismatch（2）/
//    preflight-facts-unknown-key（7），以及 tools-declaration / cards-source-oracle 说明项。
//
// 本文件只读取 E0.3 冻结契约字节做哈希断言（非旧引擎）；状态/矩阵均在金样元数据中记录。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { RoleDispatchPolicyInput, RolePreflightInput } from "../../../src/model/role.ts";
import { verifierRoleModule } from "../../../src/common/roles/verifier/index.ts";
import {
  KNOWN_DELTAS,
  ORACLE_DISPATCH_CASES,
  ORACLE_GOLDEN_META,
  ORACLE_GOLDEN_PAYLOAD,
  ORACLE_PREFLIGHT_CASES,
  ORACLE_ROLE_TOOL_CATALOG,
  ORACLE_TOOLS_DECLARATION,
  ORACLE_VERIFIER_SPEC,
  validReviewFacts,
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
  "pipeline/orchestration/run-role",
  "model/runtime",
  "service/trunk/impl/apply-journal",
  "provider/runtime/tools",
] as const;

const MODULE = verifierRoleModule;

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

test("差分：卡/边界/capabilities/显示名与冻结金样逐字段一致", () => {
  const differences: string[] = [];
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      differences.push(`${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
  };
  compare("id", MODULE.id, ORACLE_VERIFIER_SPEC.id);
  compare("displayName", MODULE.displayName, ORACLE_VERIFIER_SPEC.displayName);
  compare("function", MODULE.function, ORACLE_VERIFIER_SPEC.function);
  compare("card.entries", MODULE.card.entries, ORACLE_VERIFIER_SPEC.entries);
  compare("card.preauthorizedDirs", [...MODULE.card.preauthorizedDirs], [...ORACLE_VERIFIER_SPEC.preauthorizedDirs]);
  compare(
    "card.forbiddenWritePaths",
    [...MODULE.card.forbiddenWritePaths],
    [...ORACLE_VERIFIER_SPEC.forbiddenWritePaths],
  );
  compare("capabilities", MODULE.capabilities, ORACLE_VERIFIER_SPEC.capabilities);
  compare("cards", [...MODULE.cards], [...ORACLE_VERIFIER_SPEC.cards]);
  assert.deepEqual(differences, [], "规格差分必须为 0");
  assert.deepEqual(Object.keys(ORACLE_VERIFIER_SPEC).sort(), [
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
  assert.equal(sha256, ORACLE_VERIFIER_SPEC.cardText.sha256, "卡文本 sha256 必须与金样一致");
  assert.equal(text.length, ORACLE_VERIFIER_SPEC.cardText.length, "卡文本长度必须与金样一致");
  assert.equal(text.split("\n").length, ORACLE_VERIFIER_SPEC.cardText.lineCount, "卡文本行数必须与金样一致");
});

test("差分：cards 与金样一致（D8；旧 run-role 源码 oracle 已冻结）", () => {
  assert.deepEqual([...MODULE.cards], [...ORACLE_VERIFIER_SPEC.cards]);
  assert.deepEqual([...MODULE.cards], ["acceptance"]);
  // D8：只列当前有效卡种（无 legacy `write`）。
  assert.equal(MODULE.cards.includes("write" as never), false);
  assert.equal(/^(write|appointment|appointment-write)$/.test(MODULE.cards.join("\n")), false);
});

// —————————————————————— 3. tools（D1 + 空声明） ——————————————————————

test("差分：tools 金样——D1 14 项均不含 verifier，空声明 trio/single 合法", () => {
  assert.equal(ORACLE_ROLE_TOOL_CATALOG.length, ORACLE_GOLDEN_META.counts.toolsCatalog);
  assert.equal(ORACLE_ROLE_TOOL_CATALOG.length, 14);
  for (const entry of ORACLE_ROLE_TOOL_CATALOG) {
    assert.equal(entry.allowedRoleIds.includes("verifier"), false, entry.id);
    assert.equal(entry.id.length > 0, true);
    assert.equal(entry.name.length > 0, true);
    assert.equal(new Set(entry.allowedRoleIds).size, entry.allowedRoleIds.length, entry.id);
  }
  for (const governanceModel of ["trio", "single"] as const) {
    const golden = ORACLE_TOOLS_DECLARATION[governanceModel];
    const policy = MODULE.tools({ governanceModel });
    const declared = { tools: [...policy.tools], reasons: [...policy.reasons] };
    assert.deepEqual(declared, { tools: [...golden.tools], reasons: [...golden.reasons] }, governanceModel);
    assert.deepEqual(
      golden.validation,
      { allow: true, tools: [], reasons: [] },
      `${governanceModel}: 捕获期空声明校验必须合法`,
    );
    assert.deepEqual(declared, { tools: [], reasons: [] }, `${governanceModel}: verifier 无额外 RoleToolId`);
    assert.equal(policy.capabilities, MODULE.capabilities, governanceModel);
    assert.equal(Object.isFrozen(policy.tools), true);
    assert.equal(Object.isFrozen(policy.reasons), true);
  }
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
    } else {
      assert.equal(fixtureCase.expectedReportToRoleId, null, fixtureCase.name);
      assert.equal(
        policy.decision.allow === false ? policy.decision.messageKey.length > 0 : false,
        true,
        fixtureCase.name,
      );
    }
  }

  assert.deepEqual(allowDifferences, [], "派发 allow 位差分必须为 0");
  assert.deepEqual(codeDifferences, [], "派发稳定码差分必须为 0");
  assert.deepEqual(reportDifferences, [], "派发 reportToRoleId 差分必须为 0");
  assert.equal(compared, ORACLE_GOLDEN_META.counts.dispatchZero);
  assert.equal(compared, 9, "zero 差分 fixture 数量");
});

test("差分（documented）：契约明文差异逐条单列（旧 oracle 行为不同且方向固定）", () => {
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
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.dispatchDocumented);
  assert.equal(compared, 4, "documented 差异 fixture 数量");
  assert.equal(deltaCounts.get("dispatch-existence"), 2);
  assert.equal(deltaCounts.get("dispatch-kind-mismatch"), 2);
});

test("差分（module-only）：旧函数无法表达的模块负例（只冻结模块行为与旧观测）", () => {
  let compared = 0;
  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    if (fixtureCase.differential !== "module-only") continue;
    compared += 1;
    assert.equal(fixtureCase.knownDelta, "dispatch-scope", fixtureCase.name);
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);
    assert.equal(typeof fixtureCase.oldAllow, "boolean", fixtureCase.name);
    const policy = MODULE.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    assert.equal(policy.decision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    assert.equal(denyCode(policy.decision), fixtureCase.expectedCode, fixtureCase.name);
    assert.equal(policy.reportToRoleId ?? null, fixtureCase.expectedReportToRoleId, fixtureCase.name);
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.dispatchModuleOnly);
  assert.equal(compared, 2, "module-only fixture 数量");
});

// —————————————————————— 5. review preflight 金样 ——————————————————————

test("差分（review preflight，zero）：只含登记事实键时与旧 Model 形状判定零差异", () => {
  let compared = 0;
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    if (fixtureCase.differential !== "zero") continue;
    compared += 1;
    assert.equal(fixtureCase.knownDelta, null, fixtureCase.name);
    assert.equal(fixtureCase.oldAllow, fixtureCase.expectedAllow, `${fixtureCase.name}: 旧形状 oracle allow 位`);
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);

    const moduleDecision = MODULE.preflight!.checkAction({
      action: "review",
      facts: fixtureCase.facts,
    } as RolePreflightInput);
    assert.equal(moduleDecision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    assert.equal(denyCode(moduleDecision), fixtureCase.expectedCode, fixtureCase.name);
    if (moduleDecision.allow === false) {
      assert.equal(moduleDecision.messageKey.length > 0, true, fixtureCase.name);
      assert.equal(moduleDecision.messageKey.startsWith("role.verifier.preflight."), true, fixtureCase.name);
      // details 只能是 JSON 可序列化普通数据；不回显原始输入/证据内容。
      if (moduleDecision.details !== undefined) {
        assert.equal(typeof moduleDecision.details, "object");
        assert.doesNotThrow(() => JSON.stringify(moduleDecision.details));
      }
    } else {
      assert.deepEqual(moduleDecision, { allow: true }, fixtureCase.name);
    }
  }
  assert.equal(compared, ORACLE_GOLDEN_META.counts.preflightZero);
  assert.equal(compared, 17, "zero 差分 fixture 数量");
});

test("差分（review preflight，documented）：E2 P5 未登记键拒绝（契约明文更严差异）", () => {
  let compared = 0;
  let stricter = 0;
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    if (fixtureCase.differential !== "documented") continue;
    compared += 1;
    assert.equal(fixtureCase.expectedAllow, false, fixtureCase.name);
    assert.equal(fixtureCase.expectedCode, "review-facts-unknown-key", fixtureCase.name);
    assert.equal(fixtureCase.knownDelta, "preflight-facts-unknown-key", fixtureCase.name);
    assert.equal(fixtureCase.oldAnchor.length > 0, true, `${fixtureCase.name}: 历史锚点不得为空`);

    const moduleDecision = MODULE.preflight!.checkAction({
      action: "review",
      facts: fixtureCase.facts,
    } as RolePreflightInput);
    assert.equal(moduleDecision.allow, false, fixtureCase.name);
    assert.equal(
      moduleDecision.allow === false ? moduleDecision.code : "",
      "review-facts-unknown-key",
      fixtureCase.name,
    );
    assert.equal(
      moduleDecision.allow === false ? moduleDecision.messageKey : "",
      "role.verifier.preflight.reviewFactsUnknownKey",
      fixtureCase.name,
    );
    // 旧形状 oracle 不实现事实包白名单：合法形状 + 额外键时放行（差异真实存在）；
    // 非法形状 + 额外键时旧 oracle 因形状拒绝，本模块先报未知键（同为拒绝，原因不同）。
    if (fixtureCase.oldAllow) stricter += 1;
  }
  assert.equal(stricter, 4, "旧 oracle 会放行的未登记键 fixture 数量");
  assert.equal(compared, ORACLE_GOLDEN_META.counts.preflightDocumented);
  assert.equal(compared, 7, "documented 差异 fixture 数量");
});

test("差分：模块不读取验收结论键值（事实包违规一律 deny，不做验收判定/证据核验）", () => {
  const base = validReviewFacts();
  const permitted = MODULE.preflight!.checkAction({ action: "review", facts: base });
  assert.deepEqual(permitted, { allow: true });

  // 同一合法形状，accepted/passed 无论 false 还是 true 都触发事实包白名单拒绝：
  // 拒绝原因是「未登记键」，不是模块读取其值做验收判定（值不同、结果相同）。
  const withFalse = MODULE.preflight!.checkAction({
    action: "review",
    facts: { ...base, accepted: false, passed: false },
  });
  const withTrue = MODULE.preflight!.checkAction({
    action: "review",
    facts: { ...base, accepted: true, passed: true, approved: true },
  });
  assert.equal(withFalse.allow === false ? withFalse.code : "", "review-facts-unknown-key");
  assert.equal(withTrue.allow === false ? withTrue.code : "", "review-facts-unknown-key");
  // details.unknownKeys 稳定排序；值不同只影响键清单，不影响「未登记键 ⇒ deny」。
  assert.deepEqual(withFalse.allow === false ? withFalse.details : undefined, {
    action: "review",
    unknownKeys: ["accepted", "passed"],
  });
  assert.deepEqual(withTrue.allow === false ? withTrue.details : undefined, {
    action: "review",
    unknownKeys: ["accepted", "approved", "passed"],
  });

  // 形状非法 + 验收自报仍拒绝（未登记键先行，验收事实不能替代/放宽形状判定）。
  const denied = MODULE.preflight!.checkAction({
    action: "review",
    facts: {
      reviewTarget: { operationId: "", candidate: { objectFormat: "sha1", hex: "0".repeat(40) } },
      criteria: [],
      accepted: true,
      passed: true,
      approved: true,
    },
  });
  assert.equal(denied.allow, false);
});

// —————————————————————— 6. 金样 provenance ——————————————————————

test("金样·provenance：冻结元数据/载荷哈希自洽，且差分不再读取旧引擎（E2 G9）", async () => {
  // 1) 元数据身份与模块身份。
  assert.equal(ORACLE_GOLDEN_META.schema, "verifier-oracle-golden/v1");
  assert.equal(ORACLE_GOLDEN_META.capturedAt, "2026-11-07");
  assert.equal(ORACLE_GOLDEN_META.module.path, "src/common/roles/verifier/index.ts");
  assert.match(ORACLE_GOLDEN_META.module.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(ORACLE_GOLDEN_META.module.lineCount) && ORACLE_GOLDEN_META.module.lineCount > 0);

  // 2) 捕获期来源身份（历史记录；不读取工作树旧文件）。
  const capture = ORACLE_GOLDEN_META.capture;
  assert.deepEqual(Object.keys(capture).sort(), [
    "contract",
    "governanceRoles",
    "modelRole",
    "modelRuntime",
    "roleToolRegistry",
    "runRole",
    "workflowPreconditions",
  ]);
  for (const [key, entry] of Object.entries(capture)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 捕获期来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 捕获期行数`);
    assert.ok(entry.path.startsWith("src/") || entry.path.startsWith("docs/"), `${key}: 捕获期路径`);
    assert.ok(entry.anchors.length > 0, `${key}: 捕获期锚点`);
    assert.ok(entry.capturedAt.length > 0, `${key}: 捕获时点`);
    assert.ok(entry.e2Disposition.length > 0, `${key}: E2 处置说明`);
  }

  // 3) 捕获期复核记录（冻结前执行；D2 投影自比较的独立物证见 E1 §四 / X-R5 §5）。
  assert.deepEqual(ORACLE_GOLDEN_META.captureChecks, {
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    d2ProjectionEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    zeroCopyBindingRecordedElsewhere: 'E2-XR5 证据 §5（governanceRoleOf("verifier") 与模块同一引用）',
  });

  // 4) 切换后实测：X-R5 改门面、X-R1 起改 run-role；其余文件逐字节未变。
  const changed = ORACLE_GOLDEN_META.switch.changed;
  const unchanged = ORACLE_GOLDEN_META.switch.unchanged;
  assert.deepEqual(Object.keys(changed).sort(), ["governanceRoles", "runRole", "workflowPreconditions"]);
  assert.deepEqual(Object.keys(unchanged).sort(), [
    "contract",
    "modelRole",
    "modelRuntime",
    "roleToolRegistry",
  ]);
  // 切换后实测值（X-R5 证据 §1/§5/§7.1）：防元数据被静默改写。
  assert.equal(changed.governanceRoles.sha256, "70315a80d47881308e6a7f7983bb0f133eceb53f4d971bb502f147d9b1ce7fa5");
  assert.equal(changed.governanceRoles.lineCount, 595);
  assert.equal(changed.runRole.sha256, "b63defa415283df23e82e8a77f7fef05f157a77b4bbe087948abb592a4c3b873");
  assert.equal(changed.runRole.lineCount, 3566);
  for (const [key, entry] of Object.entries(changed)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 切换后来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 切换后行数`);
    assert.ok((entry.change ?? "").length > 0, `${key}: 变更说明`);
  }
  for (const [key, entry] of Object.entries(unchanged)) {
    const captured = capture[key]!;
    assert.equal(entry.path, captured.path, `${key}: 切换后路径应与捕获期一致`);
    assert.equal(entry.sha256, captured.sha256, `${key}: 切换后应与捕获期逐字节一致`);
    assert.equal(entry.lineCount, captured.lineCount, `${key}: 切换后行数应与捕获期一致`);
  }

  // 5) 计数与覆盖映射自洽（E2 G9「记录覆盖映射」；不得删覆盖）。
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
  assert.equal(ORACLE_GOLDEN_META.counts.cardText, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.cards, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsCatalog, ORACLE_ROLE_TOOL_CATALOG.length);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsDeclaration, 2);
  assert.equal(ORACLE_GOLDEN_META.counts.dispatchCases, ORACLE_DISPATCH_CASES.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchZero,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.differential === "zero").length,
  );
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchDocumented,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.differential === "documented").length,
  );
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchModuleOnly,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.differential === "module-only").length,
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
  assert.equal(ORACLE_GOLDEN_META.counts.knownDeltas, KNOWN_DELTAS.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.fixtureComparisons,
    ORACLE_GOLDEN_META.counts.specFields
      + ORACLE_GOLDEN_META.counts.cardText
      + ORACLE_GOLDEN_META.counts.toolsCatalog
      + ORACLE_GOLDEN_META.counts.toolsDeclaration
      + ORACLE_GOLDEN_META.counts.dispatchCases
      + ORACLE_GOLDEN_META.counts.preflightCases,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.fixtureComparisons, 64);
  assert.deepEqual(Object.keys(ORACLE_GOLDEN_META.coverage).sort(), [
    "cardText",
    "cards",
    "dispatch",
    "knownDeltas",
    "preflight",
    "provenance",
    "spec",
    "tools",
  ]);

  // 6) 冻结载荷哈希：期望值任一改动必须同步更新元数据并登记证据（防静默漂移）。
  const payloadSha256 = createHash("sha256").update(JSON.stringify(ORACLE_GOLDEN_PAYLOAD)).digest("hex");
  assert.equal(payloadSha256, ORACLE_GOLDEN_META.payloadSha256, "冻结载荷被改动时必须同步更新元数据哈希");

  // 7) 无旧引擎 live 依赖：fixture/差分测试不得 import 旧 oracle；fixture 必须是纯数据。
  for (const file of ["oracle-fixture.ts", "verifier-differential.test.ts"]) {
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
  const differentialSource = await readFile(path.join(TEST_DIR, "verifier-differential.test.ts"), "utf8");
  assert.ok(!/\breadFileSync\b/.test(differentialSource), "差分测试不得同步读取旧引擎文件");
});
