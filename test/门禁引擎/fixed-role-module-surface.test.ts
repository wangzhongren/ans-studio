// 门禁引擎测试：T3「两条固定工作流路径」B2——MF-IR-4 角色模块 fixed 接口面/值表/legacy 冻结。
//
// 依据：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（AC-24、T-13、EV-05）、
// `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` §5.7/MF-IR-4 与
// `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.4。
//
// 口径：接口字段是**纯策略/纯数据**、无 I/O，只在 `matrix:"two-fixed-paths/v1"` 下消费；
// legacy `card.text`/`cards`/capabilities/`CHIEF_HUB_DISPATCH.targetRoleIds`（五内置）/
// `CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds`（`["verifier"]`）逐字冻结。
// fixed 字段缺失（六角色 B2 并行实现尚未落地）⇒ fail-closed 空集/undefined，**不回退 legacy**；
// 本文件以「提供则逐字断言冻结值、缺失则断言 fail-closed」两种状态同时成立的方式编码契约，
// 六角色实现落地后自动强化为全量值断言，不产生 skip。
//
// 本文件只读断言；不改产品代码/legacy 数据；不新增依赖。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BuiltInRoleId,
  BuiltInRoleModule,
  GovernanceCardKind,
} from "../../src/model/role.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  builtInRoleModuleOf,
  builtInRoleModules,
  builtInRoleMatrixSummaryOf,
  cardKindsOf,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { ROLE_TOOL_CATALOG } from "../../src/common/门禁引擎/role-tool-registry.ts";
import { GOVERNANCE_CARD_KINDS } from "../../src/model/runtime.ts";
import { CHIEF_HUB_DISPATCH } from "../../src/common/roles/chief/index.ts";
import { CONVENER_WORKER_DISPATCH_TARGETS } from "../../src/common/roles/convener/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXED: "two-fixed-paths/v1" = "two-fixed-paths/v1";

// —————————————————————— 编译期断言（npm run typecheck 执行）——————————————————————

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// MF-IR-4：四个 fixed 接口字段均为**可选**新增（六模块 B2 落地；缺失 ⇒ 消费方 fail-closed）。
type _FixedCardsOptional = Assert<
  Equal<BuiltInRoleModule["fixedCards"], readonly GovernanceCardKind[] | undefined>
>;
type _FixedTargetsOptional = Assert<
  Equal<BuiltInRoleModule["fixedTargetRoleIds"], readonly string[] | undefined>
>;
type _FixedAllowedOptional = Assert<
  Equal<BuiltInRoleModule["fixedAllowedBuiltInRoleIds"], readonly string[] | undefined>
>;
type _ConvenerFixedPredicateOptional = Assert<
  Equal<BuiltInRoleModule["isConvenerFixedBuiltInDispatchTarget"], ((roleId: string) => boolean) | undefined>
>;

// —————————————————————— 冻结值表（oracle，仅测试）——————————————————————

/** legacy 卡种（六模块逐字冻结；既有 role-module-contract/oracle 同值）。 */
const LEGACY_CARDS: Readonly<Record<BuiltInRoleId, readonly GovernanceCardKind[]>> = Object.freeze({
  chief: ["intent-confirm"],
  product: [],
  rapporteur: ["proposal", "decision"],
  nominator: ["appointment", "appointment-write"],
  convener: ["decision"],
  verifier: ["acceptance"],
});

/** fixed 卡种（v1.3 §3.4 / G-IR §5.7 冻结值；fixed 矩阵只读此字段）。 */
const FIXED_CARDS: Readonly<Record<BuiltInRoleId, readonly GovernanceCardKind[]>> = Object.freeze({
  chief: ["intent-confirm", "proposal", "appointment"],
  product: [],
  rapporteur: ["decision"],
  nominator: [],
  convener: ["decision"],
  verifier: [],
});

const ROLE_IDS: readonly BuiltInRoleId[] = [
  "chief",
  "product",
  "rapporteur",
  "nominator",
  "convener",
  "verifier",
];

const NO_CARDS: readonly GovernanceCardKind[] = Object.freeze([]);

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTsFiles(abs));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(abs);
  }
  return files;
}

// —————————————————————— legacy 卡种冻结 ——————————————————————

test("MF-IR-4：legacy `cardKindsOf` 只读模块 `cards`（六角色逐字冻结、同引用、缺省 matrix＝legacy）", () => {
  for (const id of ROLE_IDS) {
    const module = builtInRoleModules[id];
    assert.equal(builtInRoleModuleOf(id), module, `${id} 模块 lookup 返回同一绑定`);
    // 唯一真源 = 模块 cards（零复制同引用；不复制第二张表）。
    assert.equal(cardKindsOf(id), module.cards, `${id} 缺省 matrix 必须读 legacy cards`);
    assert.equal(cardKindsOf(id, "legacy-v1"), module.cards, `${id} 显式 legacy-v1 读 cards`);
    // 冻结值逐字（含顺序）。
    assert.deepEqual([...module.cards], [...LEGACY_CARDS[id]], `${id} legacy cards 逐字冻结`);
  }
  // 非内置/未知 id：fail-closed 空集（undefined ≠ 允许，不得兜底成 su 或某内置角色）。
  for (const unknownId of ["su", "liaison", "worker-x", "", "Chief"]) {
    assert.deepEqual([...cardKindsOf(unknownId)], [], `${unknownId} legacy 未知角色 fail-closed`);
    assert.deepEqual([...cardKindsOf(unknownId, FIXED)], [], `${unknownId} fixed 未知角色 fail-closed`);
  }
});

// —————————————————————— fixed 卡种：只读 fixedCards / 缺失 fail-closed ——————————————————————

test("MF-IR-4：`cardKindsOf(fixed)` 只读模块 `fixedCards`；缺失 ⇒ fail-closed 空集（不回退 legacy `cards`）", () => {
  for (const id of ROLE_IDS) {
    const module = builtInRoleModules[id];
    const fixed = cardKindsOf(id, FIXED);
    if (module.fixedCards === undefined) {
      // 六角色 B2 尚未提供字段：fixed 矩阵必须 fail-closed 空集，**不得**静默回退 legacy cards。
      assert.deepEqual([...fixed], [], `${id} 缺 fixedCards ⇒ fixed 空集`);
      assert.notEqual(fixed, module.cards, `${id} fixed 结果不得是 legacy cards 引用`);
      if (module.cards.length > 0) {
        assert.equal(fixed.length, 0, `${id} 有 legacy 卡种但 fixed 缺失时仍为空集（不回退）`);
      }
      continue;
    }
    // 已提供：逐字冻结值 + 卡种闭集 + 无重复 + 不含应用自有卡种（fixed 无 acceptance/appointment-write/merge-main/stable-write）。
    assert.deepEqual([...fixed], [...FIXED_CARDS[id]], `${id} fixedCards 逐字冻结`);
    assert.equal(fixed, module.fixedCards, `${id} fixed 直接读模块字段（零复制）`);
    assert.equal(new Set(fixed).size, fixed.length, `${id} fixedCards 不得重复`);
    for (const kind of fixed) {
      assert.ok(
        GOVERNANCE_CARD_KINDS.includes(kind),
        `${id} fixedCards 卡种必须在 GovernanceCardKind 闭集内：${kind}`,
      );
    }
    for (const forbidden of ["merge-main", "stable-write", "acceptance", "appointment-write", "download"] as const) {
      assert.equal(
        fixed.includes(forbidden),
        false,
        `${id} fixedCards 不得包含 ${forbidden}（应用自有/legacy 卡种不在 fixed 角色白名单）`,
      );
    }
    const legacyOnly = LEGACY_CARDS[id].filter((kind) => !FIXED_CARDS[id].includes(kind));
    for (const legacyKind of legacyOnly) {
      assert.equal(fixed.includes(legacyKind), false, `${id} fixed 不继承 legacy 专属卡种 ${legacyKind}`);
    }
  }
  // 冻结值表本身的闭集/互斥自检（防止 oracle 被误改出闭集）。
  for (const id of ROLE_IDS) {
    for (const kind of FIXED_CARDS[id]) {
      assert.ok(GOVERNANCE_CARD_KINDS.includes(kind), `固定值表 ${id}/${kind} 必须在闭集内`);
    }
    assert.ok(LEGACY_CARDS[id].includes("merge-main") === false, "legacy oracle 不含 merge-main");
  }
  // fixed 集合不得是 legacy 的事后过滤（rapporteur legacy 含 proposal，fixed 不含 proposal 但含 decision）。
  assert.equal(FIXED_CARDS.rapporteur.includes("proposal"), false);
  assert.equal(FIXED_CARDS.rapporteur.includes("decision"), true);
});

// —————————————————————— chief/convener fixed 目标 ——————————————————————

test("MF-IR-4：chief `fixedTargetRoleIds`/convener `fixedAllowedBuiltInRoleIds` 冻结值；legacy 常量逐字不变", () => {
  const chief = builtInRoleModules.chief;
  const convener = builtInRoleModules.convener;
  if (chief.fixedTargetRoleIds === undefined) {
    assert.equal(chief.fixedTargetRoleIds, undefined);
  } else {
    assert.deepEqual([...chief.fixedTargetRoleIds], ["convener", "verifier"], "chief fixed 目标冻结为 [convener, verifier]");
    for (const target of chief.fixedTargetRoleIds) {
      assert.ok(ROLE_IDS.includes(target as BuiltInRoleId), `chief fixed 目标必须是内置角色：${target}`);
    }
  }
  if (convener.fixedAllowedBuiltInRoleIds === undefined) {
    assert.equal(convener.fixedAllowedBuiltInRoleIds, undefined);
  } else {
    assert.deepEqual(
      [...convener.fixedAllowedBuiltInRoleIds],
      ["product", "rapporteur", "nominator"],
      "convener fixed 内置目标冻结为 [product, rapporteur, nominator]",
    );
    assert.equal(convener.fixedAllowedBuiltInRoleIds.includes("verifier"), false, "fixed 下 convener 不得派 verifier");
  }
  // legacy 常量逐字冻结（五内置 / ["verifier"]；legacy 消费点 apply-journal/trunk-runtime 不改读取源）。
  assert.deepEqual(
    [...CHIEF_HUB_DISPATCH.targetRoleIds],
    ["product", "rapporteur", "nominator", "convener", "verifier"],
    "legacy CHIEF_HUB_DISPATCH.targetRoleIds 必须保持五内置",
  );
  assert.deepEqual(
    [...CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds],
    ["verifier"],
    "legacy CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds 必须保持 [\"verifier\"]",
  );
});

test("MF-IR-4：convener `isConvenerFixedBuiltInDispatchTarget` 纯函数与 fixed 表同源（缺失 ⇒ undefined 由调用方 fail-closed）", () => {
  const convener = builtInRoleModules.convener;
  const predicate = convener.isConvenerFixedBuiltInDispatchTarget;
  if (predicate === undefined) {
    assert.equal(predicate, undefined);
    return;
  }
  const allowed = convener.fixedAllowedBuiltInRoleIds ?? [];
  for (const target of allowed) {
    assert.equal(predicate(target), true, `convener fixed 谓词须允许 ${target}`);
  }
  for (const denied of ["verifier", "chief", "convener", "su", "", "worker-x", "Product"]) {
    assert.equal(predicate(denied), false, `convener fixed 谓词须拒绝 ${denied}`);
  }
  // 纯函数：重复调用同值、不写表。
  const before = JSON.stringify(convener.fixedAllowedBuiltInRoleIds ?? null);
  assert.equal(predicate("product"), predicate("product"));
  assert.equal(JSON.stringify(convener.fixedAllowedBuiltInRoleIds ?? null), before);
});

// —————————————————————— fixed 矩阵视图/文案 ——————————————————————

test("fixed 视图：`builtInRoleMatrixSummaryOf` legacy 同引用、fixed 独立非空、缺失/未知 fail-closed", () => {
  for (const id of ROLE_IDS) {
    const legacy = builtInRoleMatrixSummaryOf(id);
    const spec = governanceRoleOf(id);
    assert.ok(spec !== undefined);
    assert.equal(legacy, spec.matrix, `${id} legacy 视图必须返回注册表同一引用（legacy 文案逐字不变）`);
    assert.equal(builtInRoleMatrixSummaryOf(id, "legacy-v1"), spec.matrix);

    const fixedSummary = builtInRoleMatrixSummaryOf(id, FIXED);
    assert.ok(fixedSummary !== undefined, `${id} fixed 视图必须提供`);
    assert.notEqual(fixedSummary, legacy, `${id} fixed 视图不得复用 legacy 摘要对象`);
    assert.ok(fixedSummary.duty.trim().length > 0, `${id} fixed duty 不得为空`);
    assert.notEqual(fixedSummary.duty, legacy?.duty, `${id} fixed duty 必须与 legacy 文案区分`);
    assert.ok(fixedSummary.mainChain.length > 0, `${id} fixed mainChain 不得为空`);
    for (const line of fixedSummary.mainChain) assert.ok(line.trim().length > 0);
    if (fixedSummary.cardDiscipline !== undefined) {
      assert.ok(fixedSummary.cardDiscipline.length > 0);
      for (const line of fixedSummary.cardDiscipline) assert.ok(line.trim().length > 0);
    }
    if (fixedSummary.dispatchScope !== undefined) assert.ok(fixedSummary.dispatchScope.trim().length > 0);
  }
  for (const unknownId of ["su", "liaison", "worker-x", ""]) {
    assert.equal(builtInRoleMatrixSummaryOf(unknownId), undefined, `${unknownId} legacy 无摘要`);
    assert.equal(builtInRoleMatrixSummaryOf(unknownId, FIXED), undefined, `${unknownId} fixed 无摘要`);
  }
  // fixed 只读视图的关键口径出现在文案中（两条路径/派发分裂/3 卡/merge-main 客户本人）。
  const chiefFixed = builtInRoleMatrixSummaryOf("chief", FIXED);
  assert.ok(chiefFixed !== undefined);
  assert.match(chiefFixed.duty, /固定路径/);
  assert.ok(chiefFixed.mainChain.some((line) => line.includes("stage-request")));
  const convenerFixed = builtInRoleMatrixSummaryOf("convener", FIXED);
  assert.ok(convenerFixed !== undefined);
  assert.match(`${convenerFixed.duty}${convenerFixed.mainChain.join("")}`, /verifier|质检/);
});

// —————————————————————— 接口评审拒绝项 / 工具闭集 ——————————————————————

test("G-IR 拒绝项：`requestReleaseMerge` 不新增（模型/注册表/装配表/角色模块零出现）；RoleToolId 仍 14 项", () => {
  const sources = [
    join(REPO_ROOT, "src", "model", "role.ts"),
    join(REPO_ROOT, "src", "common", "门禁引擎", "governance-roles.ts"),
    join(REPO_ROOT, "src", "common", "门禁引擎", "role-tool-registry.ts"),
    ...listTsFiles(join(REPO_ROOT, "src", "common", "roles")),
  ];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/, `${file} 不得出现 requestReleaseMerge`);
  }
  assert.equal(ROLE_TOOL_CATALOG.length, 14, "RoleToolId 装配表保持在冻结的 14 项");
  assert.equal(ROLE_TOOL_CATALOG.some((entry) => /release/i.test(entry.id) || /release/i.test(entry.name)), false);
});

// —————————————————————— 注册表只读视图不被 fixed 污染 ——————————————————————

test("MF-IR-4：fixed 视图读取不改写注册表/模块（纯策略只读；no I/O）", () => {
  const before = JSON.stringify(BUILT_IN_GOVERNANCE_ROLES);
  const modulesBefore = JSON.stringify(builtInRoleModules);
  for (const id of ROLE_IDS) {
    cardKindsOf(id, FIXED);
    builtInRoleMatrixSummaryOf(id, FIXED);
  }
  assert.equal(JSON.stringify(BUILT_IN_GOVERNANCE_ROLES), before, "fixed 读取不得改写注册表");
  assert.equal(JSON.stringify(builtInRoleModules), modulesBefore, "fixed 读取不得改写模块数据");
  // 模块 map 键集与顺序不变（listProject/resolve-role 枚举顺序）。
  assert.deepEqual(Object.keys(builtInRoleModules), ["chief", "product", "rapporteur", "nominator", "convener", "verifier"]);
  // legacy 值仍为冻结值（fixed 读取后）。
  for (const id of ROLE_IDS) {
    assert.deepEqual([...builtInRoleModules[id].cards], [...LEGACY_CARDS[id]]);
  }
  assert.deepEqual([...NO_CARDS], []);
});
