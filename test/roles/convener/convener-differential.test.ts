// test/roles/convener/convener-differential.test.ts
//
// convener 角色模块差分测试（E1.7 / 契约 §7.3；E2 X-R4 fixture 金样化 / E2 检查单 G9）。
//
// E2 X-R4 门面切换后，本测试不再读取旧引擎文件、也不再 import 旧 oracle 模块：期望值全部来自
// `./oracle-fixture.ts` 的冻结金样（规格/cards/tools/dispatch/preflight/git-action）。旧实现
// 删除后差分仍可运行；`KNOWN_DELTAS` 登记所有已知更严格差异（非放宽）。
//
// 保留的差分矩阵（不弱化）：
//  - 规格：8 字段（id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/
//    capabilities/cards）+ 卡文本 sha256/长度/行数；
//  - tools：trio 5 项 / single 2 项（D1 装配表 + 旧 run-role 角色门控）；
//  - dispatch：9 目标 × 2 类别 × 3 存在性 = 54 组合（allow 位、稳定码、reportToRoleId）；
//  - preflight：team-plan 12 + stable-write 5 + requirement-change 10 = 27 例；
//  - git-action：9 例模块行为（旧实现无纯函数 oracle；历史锚点随金样冻结）；
//  - 已知差异：dispatch-existence（2）/ dispatch-empty-target（1）/ team-plan-fact-schema（2）
//    / stable-write-empty-content（1），以及 code-map / git-action-no-pure-oracle 说明项。
//
// 本文件只读取当前角色模块源码做模块纪律自检；不读取旧引擎文件字节。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { convenerRoleModule } from "../../../src/common/roles/convener/index.ts";
import type { RoleDispatchPolicyInput, RolePolicyDecision } from "../../../src/model/role.ts";
import {
  KNOWN_DELTAS,
  ORACLE_CONVENER_SINGLE_TOOLS,
  ORACLE_CONVENER_SPEC,
  ORACLE_CONVENER_TRIO_TOOLS,
  ORACLE_DISPATCH_CASES,
  ORACLE_GIT_ACTION_CASES,
  ORACLE_GOLDEN_META,
  ORACLE_GOLDEN_PAYLOAD,
  ORACLE_PREFLIGHT_CASES,
} from "./oracle-fixture.ts";

const TEST_DIR = import.meta.dirname;
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..", "..");
const MODULE = convenerRoleModule;

/** 旧 oracle 模块路径片段：差分测试与 fixture 均不得 import（旧实现删除后须仍可运行）。 */
const LEGACY_ORACLE_IMPORT_FRAGMENTS = [
  "门禁引擎/governance-roles",
  "门禁引擎/role-tool-registry",
  "编排/workflow-preconditions",
  "pipeline/orchestration/run-role",
  "service/trunk/impl/apply-journal",
  "provider/runtime/tools",
  "model/runtime",
  "service/trunk/impl/git-capabilities",
] as const;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

function denyCode(decision: RolePolicyDecision): string | null {
  return decision.allow === false ? decision.code : null;
}

// —————————————————————— 1. 规格数据逐字段差分 ——————————————————————

test("差分/规格：模块规格与冻结金样逐字段一致", () => {
  const differences: string[] = [];
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      differences.push(`${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
  };
  compare("id", MODULE.id, ORACLE_CONVENER_SPEC.id);
  compare("displayName", MODULE.displayName, ORACLE_CONVENER_SPEC.displayName);
  compare("function", MODULE.function, ORACLE_CONVENER_SPEC.function);
  compare("card.entries", MODULE.card.entries, ORACLE_CONVENER_SPEC.entries);
  compare("card.preauthorizedDirs", [...MODULE.card.preauthorizedDirs], [...ORACLE_CONVENER_SPEC.preauthorizedDirs]);
  compare("card.forbiddenWritePaths", [...MODULE.card.forbiddenWritePaths], [...ORACLE_CONVENER_SPEC.forbiddenWritePaths]);
  compare("capabilities", MODULE.capabilities, ORACLE_CONVENER_SPEC.capabilities);
  compare("cards", [...MODULE.cards], [...ORACLE_CONVENER_SPEC.cards]);
  assert.deepEqual(differences, [], "规格差分必须为 0");
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
});

test("差分/卡文本：sha256 / 长度 / 行数零差异", () => {
  const text = MODULE.card.text;
  const sha256 = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  assert.equal(sha256, ORACLE_CONVENER_SPEC.cardText.sha256, "卡文本 sha256 必须与金样一致");
  assert.equal(text.length, ORACLE_CONVENER_SPEC.cardText.length, "卡文本长度必须与金样一致");
  assert.equal(text.split("\n").length, ORACLE_CONVENER_SPEC.cardText.lineCount, "卡文本行数必须与金样一致");
});

// —————————————————————— 2. cards（D8） ——————————————————————

test("差分/cards：模块 cards 与金样一致（D8 无 legacy token）", () => {
  assert.deepEqual([...MODULE.cards], [...ORACLE_CONVENER_SPEC.cards]);
  assert.deepEqual([...MODULE.cards], ["decision"]);
  assert.equal(/^(write|appointment|appointment-write)$/.test(MODULE.cards.join("\n")), false);
});

// —————————————————————— 3. tools（D1 + 旧角色门控） ——————————————————————

test("差分/tools：trio/single 集合与冻结金样逐项同序", () => {
  const trio = [...MODULE.tools({ governanceModel: "trio" }).tools];
  const single = [...MODULE.tools({ governanceModel: "single" }).tools];
  assert.deepEqual(trio, [...ORACLE_CONVENER_TRIO_TOOLS]);
  assert.deepEqual(single, [...ORACLE_CONVENER_SINGLE_TOOLS]);
  assert.equal(trio.length, ORACLE_GOLDEN_META.counts.toolsTrio);
  assert.equal(single.length, ORACLE_GOLDEN_META.counts.toolsSingle);
  assert.equal(new Set(trio).size, trio.length, "trio 不得含重复 id");
});

// —————————————————————— 4. dispatch 与旧硬授权金样 ——————————————————————

test("差分/dispatch：allow 位/稳定码/reportToRoleId 与金样逐组合一致", () => {
  const allowDifferences: string[] = [];
  const codeDifferences: string[] = [];
  const reportDifferences: string[] = [];
  const knownDeltaCounts = new Map<string, number>();
  let compared = 0;

  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
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

    if (fixtureCase.knownDelta !== null) {
      knownDeltaCounts.set(fixtureCase.knownDelta, (knownDeltaCounts.get(fixtureCase.knownDelta) ?? 0) + 1);
      assert.equal(fixtureCase.oldAllow, true, `${fixtureCase.name}: 已登记差异必须旧谓词 allow`);
      assert.equal(fixtureCase.expectedAllow, false, `${fixtureCase.name}: 已登记差异必须模块更严格（deny）`);
    } else {
      assert.equal(fixtureCase.oldAllow, fixtureCase.expectedAllow, `${fixtureCase.name}: allow 位必须与旧硬授权金样一致`);
      compared += 1;
    }

    if (fixtureCase.expectedAllow) {
      assert.equal(fixtureCase.expectedReportToRoleId, "convener", `${fixtureCase.name}: allow 时报告期望必须为 convener`);
    } else {
      assert.equal(fixtureCase.expectedReportToRoleId, null, `${fixtureCase.name}: deny 时不得给出报告期望`);
    }
  }

  assert.deepEqual(allowDifferences, [], "派发 allow 位差分必须为 0");
  assert.deepEqual(codeDifferences, [], "派发稳定码差分必须为 0");
  assert.deepEqual(reportDifferences, [], "派发 reportToRoleId 差分必须为 0");
  assert.equal(ORACLE_DISPATCH_CASES.length, ORACLE_GOLDEN_META.counts.dispatchCases);
  assert.equal(ORACLE_DISPATCH_CASES.length, 54);
  assert.equal(compared, ORACLE_DISPATCH_CASES.length - ORACLE_GOLDEN_META.counts.dispatchKnownDeltas);
  assert.equal(compared, 51);
  assert.equal([...knownDeltaCounts.values()].reduce((sum, count) => sum + count, 0), 3);
  assert.equal(knownDeltaCounts.get("dispatch-existence"), 2);
  assert.equal(knownDeltaCounts.get("dispatch-empty-target"), 1);
});

// —————————————————————— 5. preflight 与旧角色侧谓词金样 ——————————————————————

type GoldenPreflightAction = "team-plan" | "stable-write" | "requirement-change";

function checkPreflightGroup(action: GoldenPreflightAction): {
  readonly cases: number;
  readonly compared: number;
  readonly allowed: number;
  readonly knownCounts: ReadonlyMap<string, number>;
} {
  const hook = MODULE.preflight;
  assert.ok(hook !== undefined);
  const cases = ORACLE_PREFLIGHT_CASES.filter((fixtureCase) => fixtureCase.action === action);
  const differences: string[] = [];
  const knownCounts = new Map<string, number>();
  let compared = 0;
  let allowed = 0;

  for (const fixtureCase of cases) {
    assert.ok(fixtureCase.oldAnchor.length > 0, `${fixtureCase.name}: 旧行为锚点不得为空`);
    const decision = hook.checkAction({ action: fixtureCase.action, facts: fixtureCase.facts });
    if (decision.allow !== fixtureCase.expectedAllow) {
      differences.push(`${fixtureCase.name}: moduleAllow=${decision.allow} expected=${fixtureCase.expectedAllow}`);
    }
    const actualCode = denyCode(decision);
    if (actualCode !== fixtureCase.expectedCode) {
      differences.push(`${fixtureCase.name}: code=${actualCode} expected=${fixtureCase.expectedCode}`);
    }
    if (decision.allow) allowed += 1;

    if (fixtureCase.knownDelta !== null) {
      knownCounts.set(fixtureCase.knownDelta, (knownCounts.get(fixtureCase.knownDelta) ?? 0) + 1);
      assert.equal(fixtureCase.oldAllow, true, `${fixtureCase.name}: 已登记差异必须旧谓词 allow`);
      assert.equal(fixtureCase.expectedAllow, false, `${fixtureCase.name}: 已登记差异必须模块更严格（deny）`);
    } else {
      assert.equal(fixtureCase.oldAllow, fixtureCase.expectedAllow, `${fixtureCase.name}: allow 位必须与旧角色侧谓词金样一致`);
      compared += 1;
    }
  }

  assert.deepEqual(differences, [], `${action} 差分必须为 0`);
  return { cases: cases.length, compared, allowed, knownCounts };
}

test("差分/team-plan：allow 位与旧角色侧身份/依据/路径谓词金样一致", () => {
  const result = checkPreflightGroup("team-plan");
  assert.equal(result.cases, 12);
  assert.equal(result.allowed, 3);
  assert.equal(result.compared, 10);
  assert.equal(result.knownCounts.get("team-plan-fact-schema"), 2);
});

test("差分/stable-write：allow 位与旧 canRequestStableWrite/kind 门控金样一致", () => {
  const result = checkPreflightGroup("stable-write");
  assert.equal(result.cases, 5);
  assert.equal(result.allowed, 1);
  assert.equal(result.compared, 4);
  assert.equal(result.knownCounts.get("stable-write-empty-content"), 1);
});

test("差分/requirement-change：allow 位与旧工具侧事实/归属谓词金样一致", () => {
  const result = checkPreflightGroup("requirement-change");
  assert.equal(result.cases, 10);
  assert.equal(result.allowed, 4);
  assert.equal(result.compared, 10);
  assert.equal(result.knownCounts.size, 0);
});

// —————————————————————— 6. Git 动作行为金样（旧实现无纯函数 oracle）——————————————————————

test("差分/git-action：模块行为与冻结金样一致（旧实现无纯函数 oracle）", () => {
  const hook = MODULE.preflight;
  assert.ok(hook !== undefined);
  const differences: string[] = [];
  let allowed = 0;

  for (const fixtureCase of ORACLE_GIT_ACTION_CASES) {
    assert.ok(fixtureCase.oldAnchor.length > 0, `${fixtureCase.name}: 历史锚点不得为空`);
    const decision = hook.checkAction({ action: "git-action", facts: fixtureCase.facts });
    if (decision.allow !== fixtureCase.expectedAllow) {
      differences.push(`${fixtureCase.name}: moduleAllow=${decision.allow} expected=${fixtureCase.expectedAllow}`);
    }
    const actualCode = denyCode(decision);
    if (actualCode !== fixtureCase.expectedCode) {
      differences.push(`${fixtureCase.name}: code=${actualCode} expected=${fixtureCase.expectedCode}`);
    }
    if (decision.allow) allowed += 1;
  }

  assert.deepEqual(differences, [], "git-action 差分必须为 0");
  assert.equal(ORACLE_GIT_ACTION_CASES.length, ORACLE_GOLDEN_META.counts.gitActionCases);
  assert.equal(ORACLE_GIT_ACTION_CASES.length, 9);
  assert.equal(allowed, 2);
  assert.ok(KNOWN_DELTAS.some((delta) => delta.startsWith("git-action-no-pure-oracle：")), "无纯函数 oracle 须登记");
});

// —————————————————————— 7. 已知差异清单 ——————————————————————

test("差分/已知差异清单：分类齐备且与用例登记一致", () => {
  const prefixes = KNOWN_DELTAS.map((delta) => delta.slice(0, delta.indexOf("：")));
  assert.deepEqual([...prefixes].sort(), [
    "dispatch-code-map",
    "dispatch-empty-target",
    "dispatch-existence",
    "git-action-no-pure-oracle",
    "stable-write-empty-content",
    "team-plan-fact-schema",
  ]);
  for (const delta of KNOWN_DELTAS) {
    assert.ok(delta.length > 20, "差异登记须说明范围与理由");
  }
  assert.equal(KNOWN_DELTAS.length, ORACLE_GOLDEN_META.counts.knownDeltas);

  const caseDeltaPrefixes = [
    ...new Set(
      [...ORACLE_DISPATCH_CASES.map((fixtureCase) => fixtureCase.knownDelta),
        ...ORACLE_PREFLIGHT_CASES.map((fixtureCase) => fixtureCase.knownDelta)].filter(
        (delta): delta is string => delta !== null,
      ),
    ),
  ].sort();
  assert.deepEqual(caseDeltaPrefixes, [
    "dispatch-empty-target",
    "dispatch-existence",
    "stable-write-empty-content",
    "team-plan-fact-schema",
  ]);
  for (const prefix of caseDeltaPrefixes) {
    assert.ok(prefixes.includes(prefix), `用例差异类别未登记：${prefix}`);
  }
});

// —————————————————————— 8. 金样 provenance ——————————————————————

test("金样·provenance：冻结元数据/载荷哈希自洽，且差分不再读取旧引擎（E2 G9）", async () => {
  // 1) 元数据身份与模块身份。
  assert.equal(ORACLE_GOLDEN_META.schema, "convener-oracle-golden/v1");
  assert.equal(ORACLE_GOLDEN_META.capturedAt, "2026-11-07");
  assert.equal(ORACLE_GOLDEN_META.module.path, "src/common/roles/convener/index.ts");
  assert.match(ORACLE_GOLDEN_META.module.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(ORACLE_GOLDEN_META.module.lineCount) && ORACLE_GOLDEN_META.module.lineCount > 0);

  // 2) 捕获期来源身份（历史记录；不读取工作树旧文件）。
  const capture = ORACLE_GOLDEN_META.capture;
  assert.deepEqual(Object.keys(capture).sort(), [
    "applyJournal",
    "gitCapabilities",
    "governanceRoles",
    "roleToolRegistry",
    "runRole",
    "runtimeModel",
    "runtimeTools",
    "workflowPreconditions",
  ]);
  for (const [key, entry] of Object.entries(capture)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${key}: 捕获期来源哈希格式`);
    assert.ok(Number.isInteger(entry.lineCount) && entry.lineCount > 0, `${key}: 捕获期行数`);
    assert.ok(entry.path.startsWith("src/"), `${key}: 捕获期路径`);
    assert.ok(entry.anchors.length > 0, `${key}: 捕获期锚点`);
    assert.ok(entry.capturedAt.length > 0, `${key}: 捕获时点`);
    assert.ok(entry.e2Disposition.length > 0, `${key}: E2 处置说明`);
  }

  // 3) 切换后实测：X-R4 改门面、X-R1 起改 run-role；注册表逐字节未变。
  const changed = ORACLE_GOLDEN_META.switch.changed;
  const unchanged = ORACLE_GOLDEN_META.switch.unchanged;
  assert.deepEqual(Object.keys(changed).sort(), ["applyJournal", "governanceRoles", "runRole", "workflowPreconditions"]);
  assert.deepEqual(Object.keys(unchanged).sort(), ["roleToolRegistry"]);
  // 切换后实测值（X-R4 证据 §1/§5/§7.1）：防元数据被静默改写。
  assert.equal(changed.governanceRoles.sha256, "c31274f9497298676f2afdedadf2607c2c4d662c362bd76b6f55aaf9d299a1d1");
  assert.equal(changed.governanceRoles.lineCount, 649);
  assert.equal(changed.runRole.sha256, "655095b0bf0d63deef3611b8f9ab0397e696b7c401d9c76fa36b97be298eb417");
  assert.equal(changed.runRole.lineCount, 3483);
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

  // 4) 计数与覆盖映射自洽（E2 G9「记录覆盖映射」；不得删覆盖）。
  assert.equal(ORACLE_GOLDEN_META.counts.specFields, 8);
  assert.equal(ORACLE_GOLDEN_META.counts.cardText, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.cards, 1);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsTrio, ORACLE_CONVENER_TRIO_TOOLS.length);
  assert.equal(ORACLE_GOLDEN_META.counts.toolsSingle, ORACLE_CONVENER_SINGLE_TOOLS.length);
  assert.equal(ORACLE_GOLDEN_META.counts.dispatchCases, ORACLE_DISPATCH_CASES.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.dispatchKnownDeltas,
    ORACLE_DISPATCH_CASES.filter((fixtureCase) => fixtureCase.knownDelta !== null).length,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.preflightCases, ORACLE_PREFLIGHT_CASES.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.preflightKnownDeltas,
    ORACLE_PREFLIGHT_CASES.filter((fixtureCase) => fixtureCase.knownDelta !== null).length,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.gitActionCases, ORACLE_GIT_ACTION_CASES.length);
  assert.equal(ORACLE_GOLDEN_META.counts.knownDeltas, KNOWN_DELTAS.length);
  assert.equal(
    ORACLE_GOLDEN_META.counts.fixtureComparisons,
    ORACLE_GOLDEN_META.counts.specFields
      + ORACLE_GOLDEN_META.counts.cardText
      + ORACLE_GOLDEN_META.counts.cards
      + ORACLE_GOLDEN_META.counts.toolsTrio
      + ORACLE_GOLDEN_META.counts.toolsSingle
      + ORACLE_GOLDEN_META.counts.dispatchCases
      + ORACLE_GOLDEN_META.counts.preflightCases
      + ORACLE_GOLDEN_META.counts.gitActionCases,
  );
  assert.equal(ORACLE_GOLDEN_META.counts.fixtureComparisons, 107);
  assert.deepEqual(Object.keys(ORACLE_GOLDEN_META.coverage).sort(), [
    "cardText",
    "cards",
    "dispatch",
    "gitAction",
    "knownDeltas",
    "preflight",
    "provenance",
    "spec",
    "tools",
  ]);

  // 5) 冻结载荷哈希：期望值任一改动必须同步更新元数据并登记证据（防静默漂移）。
  const payloadSha256 = createHash("sha256").update(JSON.stringify(ORACLE_GOLDEN_PAYLOAD)).digest("hex");
  assert.equal(payloadSha256, ORACLE_GOLDEN_META.payloadSha256, "冻结载荷被改动时必须同步更新元数据哈希");

  // 6) 无旧引擎 live 依赖：fixture/差分测试不得 import 旧 oracle；fixture 不得读文件。
  for (const file of ["oracle-fixture.ts", "convener-differential.test.ts"]) {
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
  const differentialSource = await readFile(path.join(TEST_DIR, "convener-differential.test.ts"), "utf8");
  assert.ok(!/\breadFileSync\b/.test(differentialSource), "差分测试不得同步读取旧引擎文件");
});

// —————————————————————— 9. E1 模块纪律（单入口/零越界 import/纯数据）——————————————————————

test("E1 模块纪律：模块根只有 index.ts（内部文件只在子目录），唯一 public entry", async () => {
  const moduleDir = path.resolve(REPO_ROOT, "src/common/roles/convener");
  const entries = await readdir(moduleDir, { withFileTypes: true });
  assert.deepEqual(entries.map((entry) => entry.name), ["index.ts"]);
  assert.equal(entries[0]!.isFile(), true);
});

test("E1 模块纪律：只 import Model 公开入口（type-only），无引擎/门控/其他角色/Node I/O", async () => {
  const source = await readFile(path.resolve(REPO_ROOT, "src/common/roles/convener/index.ts"), "utf8");
  const moduleImports = importSpecifiers(source);
  assert.ok(moduleImports.length > 0);
  for (const specifier of moduleImports) {
    assert.equal(specifier.startsWith("../../../model/"), true, `越界 import：${specifier}`);
  }
  const valueImports = [...source.matchAll(/^import\s+(?!type\b)[^;]+;/gm)];
  assert.deepEqual(valueImports.map((match) => match[0]), [], "角色模块只允许 `import type`");
  for (const forbidden of ["node:", "require(", "import(", "Math.random", "new Date(", "process.env"]) {
    assert.equal(source.includes(forbidden), false, `角色模块不得包含：${forbidden}`);
  }
});
