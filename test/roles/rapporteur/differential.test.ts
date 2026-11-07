// test/roles/rapporteur/differential.test.ts
// rapporteur 模块差分测试（E1.7 / 契约 §7.3）：
//   · 规格/卡文本/工具集合 vs 旧 oracle 静态 fixture：差异 = 0；
//   · 派发 allow 位 vs 旧硬授权：差异 = 0；稳定码差异逐项登记（KNOWN_DELTAS）；
//   · 动作前置 vs 旧 schema/Service/卡文本锚点：allow 位一致；事实键/稳定码按 Q13 登记；
//   · fixture provenance：E2 X-R2 后改为**冻结金样**（E2 检查单 G9 / B1 M4）——
//     来源候选/捕获期与切换后哈希/覆盖映射冻结在 fixture 元数据；本测试不再读取旧引擎文件
//     （旧实现删除后差分仍可运行），以载荷 SHA-256 防期望值静默漂移。
//
// 本测试不 import 旧引擎（fixture 为纯数据）；不读取旧文件字节。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { RoleDispatchPolicyInput, RolePreflightInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import {
  KNOWN_DELTAS,
  ORACLE_DISPATCH_CASES,
  ORACLE_GOLDEN_META,
  ORACLE_GOLDEN_PAYLOAD,
  ORACLE_PREFLIGHT_CASES,
  ORACLE_RAPPORTEUR_INJECTED_TOOLS,
  ORACLE_RAPPORTEUR_SPEC,
} from "./oracle-fixture.ts";

const TEST_DIR = import.meta.dirname;

/** 旧 oracle 模块路径片段：差分测试与 fixture 均不得 import（E2 删除旧实现后须仍可运行）。 */
const LEGACY_ORACLE_IMPORT_FRAGMENTS = [
  "门禁引擎/governance-roles",
  "门禁引擎/role-tool-registry",
  "pipeline/orchestration/run-role",
  "service/trunk/impl/apply-journal",
  "provider/runtime/schema",
  "编排/decision-card",
  "编排/workflow-preconditions",
] as const;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

test("差分·规格：模块规格与旧注册表 fixture 零差异", () => {
  const differences: string[] = [];
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push(`${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };
  compare("id", rapporteurRoleModule.id, ORACLE_RAPPORTEUR_SPEC.id);
  compare("displayName", rapporteurRoleModule.displayName, ORACLE_RAPPORTEUR_SPEC.displayName);
  compare("function", rapporteurRoleModule.function, ORACLE_RAPPORTEUR_SPEC.function);
  compare("card.entries", rapporteurRoleModule.card.entries, ORACLE_RAPPORTEUR_SPEC.entries);
  compare("card.preauthorizedDirs", rapporteurRoleModule.card.preauthorizedDirs, ORACLE_RAPPORTEUR_SPEC.preauthorizedDirs);
  compare("card.forbiddenWritePaths", rapporteurRoleModule.card.forbiddenWritePaths, ORACLE_RAPPORTEUR_SPEC.forbiddenWritePaths);
  compare("capabilities", rapporteurRoleModule.capabilities, ORACLE_RAPPORTEUR_SPEC.capabilities);
  compare("cards", rapporteurRoleModule.cards, ORACLE_RAPPORTEUR_SPEC.cards);
  assert.deepEqual(differences, [], "规格差分必须为 0");
  console.log(`[differential] spec differences=0 fields=8`);
});

test("差分·卡文本：sha256 / 长度 / 行数零差异", () => {
  const text = rapporteurRoleModule.card.text;
  const sha256 = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  const differences: string[] = [];
  if (sha256 !== ORACLE_RAPPORTEUR_SPEC.cardText.sha256) differences.push(`sha256 ${sha256}`);
  if (text.length !== ORACLE_RAPPORTEUR_SPEC.cardText.length) differences.push(`length ${text.length}`);
  if (text.split("\n").length !== ORACLE_RAPPORTEUR_SPEC.cardText.lineCount) differences.push(`lineCount ${text.split("\n").length}`);
  assert.deepEqual(differences, [], "卡文本差分必须为 0");
  console.log(`[differential] card text sha256=${sha256} differences=0`);
});

test("差分·工具集合：模块声明 vs 旧 run-role 注入 probe 零差异", () => {
  const declared = [...rapporteurRoleModule.tools({ governanceModel: "trio" }).tools];
  const differences = declared.filter((id) => !ORACLE_RAPPORTEUR_INJECTED_TOOLS.includes(id))
    .concat(ORACLE_RAPPORTEUR_INJECTED_TOOLS.filter((id) => !declared.includes(id)));
  assert.deepEqual(differences, [], "工具集合差分必须为 0");
  assert.deepEqual(declared, [...ORACLE_RAPPORTEUR_INJECTED_TOOLS]);
  console.log(`[differential] tools declared=${declared.join(",")} differences=0`);
});

test("差分·派发：allow 位零差异；稳定码差异全部登记在 KNOWN_DELTAS", () => {
  const allowDifferences: string[] = [];
  const codeDeltas: string[] = [];
  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    const policy = rapporteurRoleModule.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    if (policy.decision.allow !== fixtureCase.oldAllow) {
      allowDifferences.push(`${fixtureCase.name}: module=${policy.decision.allow} old=${fixtureCase.oldAllow}`);
    }
    if (!policy.decision.allow && policy.decision.code !== fixtureCase.oldCode) {
      codeDeltas.push(`${fixtureCase.name}: ${fixtureCase.oldCode} -> ${policy.decision.code}`);
    }
  }
  assert.deepEqual(allowDifferences, [], "派发 allow 位差分必须为 0");
  assert.ok(KNOWN_DELTAS.some((delta) => delta.startsWith("dispatch-code-map：")), "稳定码差异须登记");
  assert.ok(codeDeltas.length > 0, "旧 unknown-source 与新条件化稳定码的差异应被观测到并登记");
  console.log(`[differential] dispatch allowDifferences=0 codeDeltas=${codeDeltas.length} (listed in KNOWN_DELTAS)`);
});

test("差分·动作前置：allow 位与旧 schema/Service/卡文本锚点一致", () => {
  const preflight = rapporteurRoleModule.preflight;
  assert.ok(preflight !== undefined);
  const differences: string[] = [];
  const allowed: string[] = [];
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    const decision = preflight.checkAction({ action: fixtureCase.action, facts: fixtureCase.facts } as RolePreflightInput);
    if (decision.allow !== fixtureCase.expectedAllow) {
      differences.push(`${fixtureCase.name}: moduleAllow=${decision.allow} expected=${fixtureCase.expectedAllow}`);
    }
    if (!decision.allow && decision.code !== fixtureCase.expectedCode) {
      differences.push(`${fixtureCase.name}: code=${decision.code} expected=${fixtureCase.expectedCode}`);
    }
    if (decision.allow) allowed.push(fixtureCase.name);
  }
  assert.deepEqual(differences, [], "动作前置差分必须为 0");
  assert.ok(KNOWN_DELTAS.some((delta) => delta.startsWith("preflight-fact-schema：")), "事实键差异须登记");
  console.log(`[differential] preflight cases=${ORACLE_PREFLIGHT_CASES.length} allowed=${allowed.length} differences=0`);
});

test("差分·已知差异清单：分类齐备且不含未登记类别", () => {
  const prefixes = KNOWN_DELTAS.map((delta) => delta.slice(0, delta.indexOf("：")));
  assert.deepEqual([...prefixes].sort(), [
    "dispatch-code-map",
    "dispatch-scope",
    "preflight-detail-amendment-legacy",
    "preflight-fact-schema",
    "preflight-run-change-stop",
    "tools-declaration-vs-injection",
  ]);
  for (const delta of KNOWN_DELTAS) {
    assert.ok(delta.length > 20, "差异登记须说明范围与理由");
  }
});

test("金样·provenance：冻结元数据/载荷哈希自洽，且差分不再读取旧引擎（E2 G9）", async () => {
  // 1) 元数据身份与历史来源候选（冻结记录；不读取工作树旧文件）。
  assert.equal(ORACLE_GOLDEN_META.schema, "rapporteur-oracle-golden/v1");
  assert.equal(ORACLE_GOLDEN_META.capturedAt, "2026-11-07");
  const capture = ORACLE_GOLDEN_META.capture;
  assert.deepEqual(Object.keys(capture).sort(), [
    "applyJournal",
    "decisionCard",
    "governanceRoles",
    "roleToolRegistry",
    "runRole",
    "runtimeSchema",
    "workflowPreconditions",
  ]);
  for (const [key, entry] of Object.entries(capture)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 捕获期来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 捕获期行数`);
    assert.ok(entry.path.startsWith("src/"), `${key}: 捕获期路径`);
    assert.ok(entry.anchors.length > 0 && entry.e2Disposition.length > 0, `${key}: 锚点/E2 处置说明`);
  }

  // 2) E2 切换记录：恰好两个文件切换、五个文件逐字节未变（与捕获期交叉核对）。
  const changed = ORACLE_GOLDEN_META.switch.changed;
  const unchanged = ORACLE_GOLDEN_META.switch.unchanged;
  assert.deepEqual(Object.keys(changed).sort(), ["governanceRoles", "runRole"]);
  assert.deepEqual(Object.keys(unchanged).sort(), [
    "applyJournal",
    "decisionCard",
    "roleToolRegistry",
    "runtimeSchema",
    "workflowPreconditions",
  ]);
  // 切换后实测值（X-R2 证据 §1/§7.1；run-role.ts 由 X-R1 改）：防元数据被静默改写。
  assert.equal(changed.governanceRoles.sha256, "45d331ed4835be3a2d43f960d35e90b9c02c98eba64ce23c0a3e0aa20b746493");
  assert.equal(changed.governanceRoles.lineCount, 755);
  assert.equal(changed.runRole.sha256, "fd65cc4a83734c01737c512250fac322f3a9c0fe98e3b8408d6260fea3e04f6d");
  assert.equal(changed.runRole.lineCount, 3415);
  for (const [key, entry] of Object.entries(unchanged)) {
    const captured = capture[key]!;
    assert.equal(entry.path, captured.path, `${key}: 切换后路径应与捕获期一致`);
    assert.equal(entry.sha256, captured.sha256, `${key}: 切换后应与捕获期逐字节一致`);
    assert.equal(entry.lineCount, captured.lineCount, `${key}: 切换后行数应与捕获期一致`);
  }

  // 3) 计数与覆盖映射自洽（E2 G9「记录覆盖映射」；不得删覆盖）。
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
  assert.equal(ORACLE_GOLDEN_META.counts.tools, ORACLE_RAPPORTEUR_INJECTED_TOOLS.length);
  assert.equal(ORACLE_GOLDEN_META.counts.dispatchCases, ORACLE_DISPATCH_CASES.length);
  assert.equal(ORACLE_GOLDEN_META.counts.preflightCases, ORACLE_PREFLIGHT_CASES.length);
  assert.equal(ORACLE_GOLDEN_META.counts.knownDeltas, KNOWN_DELTAS.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.fixtureComparisons,
    ORACLE_GOLDEN_META.counts.specFields
      + 1 // 卡文本
      + ORACLE_GOLDEN_META.counts.tools
      + ORACLE_GOLDEN_META.counts.dispatchCases
      + ORACLE_GOLDEN_META.counts.preflightCases,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.fixtureComparisons, 42);
  assert.deepEqual(Object.keys(ORACLE_GOLDEN_META.coverage).sort(), [
    "cardText",
    "dispatch",
    "knownDeltas",
    "preflight",
    "provenance",
    "spec",
    "tools",
  ]);

  // 4) 冻结载荷哈希：期望值任一改动必须同步更新元数据并登记证据（防静默漂移）。
  const payloadSha256 = createHash("sha256").update(JSON.stringify(ORACLE_GOLDEN_PAYLOAD)).digest("hex");
  assert.equal(payloadSha256, ORACLE_GOLDEN_META.payloadSha256, "冻结载荷被改动时必须同步更新元数据哈希");

  // 5) 无旧引擎 live 依赖：fixture/差分测试不得 import 旧 oracle；差分测试不得同步读文件。
  for (const file of ["oracle-fixture.ts", "differential.test.ts"]) {
    const source = await readFile(path.join(TEST_DIR, file), "utf8");
    for (const specifier of importSpecifiers(source)) {
      assert.ok(
        !LEGACY_ORACLE_IMPORT_FRAGMENTS.some((fragment) => specifier.includes(fragment)),
        `${file} 不得 import 旧引擎：${specifier}`,
      );
    }
  }
  const differentialSource = await readFile(path.join(TEST_DIR, "differential.test.ts"), "utf8");
  assert.ok(!/\breadFileSync\b/.test(differentialSource), "差分测试不得同步读取旧引擎文件");
  console.log(`[differential] golden: capture=${Object.keys(capture).length} switched=${Object.keys(changed).length} unchanged=${Object.keys(unchanged).length} payload=${payloadSha256.slice(0, 12)}…`);
});
