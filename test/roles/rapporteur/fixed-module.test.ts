// test/roles/rapporteur/fixed-module.test.ts
// T3「两条固定工作流路径」B2（rapporteur-code 批次）：fixed 数据与 fixed context 段。
//
// 依据：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（AC-24 / T-13 / EV-05）、
// `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` §5.7/MF-IR-4、
// `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.4 rapporteur 行。
//
// 口径：
//  - fixed 只在**显式** `matrix:"two-fixed-paths/v1"` 生效；legacy 数据（`card.text`/`cards`/
//    capabilities）与 legacy `context()` 返回值逐字冻结（差分测试 differential.test.ts 保持不动）；
//  - fixedCards 恰 `["decision"]`（不从 legacy `cards` 过滤；不新增工具/卡）；
//  - 群组无 `requestReleaseMerge`；不新增 skip/force-exit。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { RoleContextInput, RoleDispatchPolicyInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import { ORACLE_RAPPORTEUR_SPEC } from "./oracle-fixture.ts";

const FIXED: "two-fixed-paths/v1" = "two-fixed-paths/v1";
const TRIO_FIXED: RoleContextInput = { governanceModel: "trio", matrix: FIXED };
const MODULE_ROOT = path.resolve(import.meta.dirname, "../../../src/common/roles/rapporteur");
const TEST_ROOT = import.meta.dirname;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(abs));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

test("fixed：fixedCards 恰为 ['decision']（冻结、去重、无新卡种）", () => {
  const fixed = rapporteurRoleModule.fixedCards;
  assert.ok(fixed !== undefined, "MF-IR-4：六模块均须提供 fixedCards");
  assert.deepEqual([...fixed], ["decision"], "v1.3 §3.4 冻结值：rapporteur fixedCards = [decision]");
  assert.ok(Object.isFrozen(fixed), "fixedCards 必须是冻结数据");
  assert.equal(new Set(fixed).size, fixed.length, "fixedCards 不得重复");
  for (const forbidden of [
    "proposal",
    "intent-confirm",
    "appointment",
    "appointment-write",
    "acceptance",
    "merge-main",
    "stable-write",
    "download",
  ] as const) {
    assert.equal(fixed.includes(forbidden), false, `fixedCards 不得包含 ${forbidden}`);
  }
});

test("fixed：legacy cards / card.text / capabilities 逐字冻结（fixed 字段不改变 legacy 数据）", () => {
  assert.deepEqual([...rapporteurRoleModule.cards], [...ORACLE_RAPPORTEUR_SPEC.cards], "legacy cards 逐字不变");
  assert.deepEqual([...rapporteurRoleModule.cards], ["proposal", "decision"]);
  const text = rapporteurRoleModule.card.text;
  const digest = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  assert.equal(digest, ORACLE_RAPPORTEUR_SPEC.cardText.sha256, "卡文本 SHA-256 逐字不变");
  assert.equal(text.length, ORACLE_RAPPORTEUR_SPEC.cardText.length, "卡文本长度不变");
  assert.equal(text.split("\n").length, ORACLE_RAPPORTEUR_SPEC.cardText.lineCount, "卡文本行数不变");
  assert.deepEqual(rapporteurRoleModule.capabilities, ORACLE_RAPPORTEUR_SPEC.capabilities, "capabilities 逐字不变");
  assert.equal(rapporteurRoleModule.capabilities.dispatchTask, false, "rapporteur 不派发（legacy/fixed 同）");
});

test("fixed context：显式矩阵返回 fixed 段（职责/decision 卡/报告），覆盖固定路径职责", () => {
  const sections = rapporteurRoleModule.context(TRIO_FIXED);
  assert.deepEqual(sections.map((section) => section.id), [
    "rapporteur-fixed-role",
    "rapporteur-fixed-decision-card",
    "rapporteur-fixed-report-expectation",
  ]);
  const all = sections.map((section) => section.text).join("\n");
  for (const required of [
    "运营（convener）",
    "docs/proposals/",
    "docs/contracts/",
    "人员名单",
    "项目模块",
    "项目架构",
    "契约",
    "方案确认卡由幕僚",
    "不发起 proposal 卡",
    "不派发任务",
    "不实现代码",
    "docs/planning/",
    "不自行增删角色",
    "-vN",
    "固定路径不适用",
    "`decision`",
  ]) {
    assert.ok(all.includes(required), `fixed context 必须覆盖：${required}`);
  }
  // fixed 段删除 legacy 专属内容（run 择时 / 结构化 Git 工具的默认适用）。
  for (const legacyOnly of ["continue-frozen", "stop-and-restart", "`proposal`、`decision`", "绑定 runId/pinDigest"]) {
    assert.equal(all.includes(legacyOnly), false, `fixed 段不得保留 legacy 专属内容：${legacyOnly}`);
  }
});

test("fixed context：缺省/legacy/未知矩阵返回 legacy 4 段（同引用，逐字不变）", () => {
  const legacy = rapporteurRoleModule.context({ governanceModel: "trio" });
  assert.deepEqual(legacy.map((section) => section.id), [
    "rapporteur-role",
    "rapporteur-decision-context",
    "rapporteur-report-expectation",
    "rapporteur-decision-card",
  ]);
  assert.equal(rapporteurRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" }), legacy, "显式 legacy-v1 同引用");
  for (const matrix of ["weird", "", undefined, null, 42] as const) {
    assert.equal(
      rapporteurRoleModule.context({ governanceModel: "trio", matrix } as never),
      legacy,
      `矩阵 ${String(matrix)} 不得返回 fixed 段（仅显式 two-fixed-paths/v1）`,
    );
  }
  const legacyText = legacy.map((section) => section.text).join("\n");
  assert.ok(legacyText.includes("continue-frozen"), "legacy 决策上下文保留 run 择时");
  assert.ok(legacyText.includes("`proposal`、`decision`"), "legacy decision 卡数据保留 proposal");
});

test("fixed context：非 trio 与未登记 facts 仍 fail-closed（先于 fixed 段）", () => {
  const singleFixed = rapporteurRoleModule.context({ governanceModel: "single", matrix: FIXED });
  assert.deepEqual(singleFixed.map((section) => section.id), ["rapporteur-governance-model"]);

  const factsFixed = rapporteurRoleModule.context({
    governanceModel: "trio",
    matrix: FIXED,
    facts: { anything: true, secret: "must-not-be-read" },
  });
  assert.equal(factsFixed.length, 1);
  assert.equal(factsFixed[0]!.id, "rapporteur-context-facts-rejected");
  assert.equal(JSON.stringify(factsFixed).includes("must-not-be-read"), false, "facts 内容不得被读取/回显");
});

test("fixed context：纯函数——重复调用同引用且 section 冻结、无资源引用", () => {
  const first = rapporteurRoleModule.context(TRIO_FIXED);
  const second = rapporteurRoleModule.context(TRIO_FIXED);
  assert.equal(first, second);
  assert.ok(Object.isFrozen(first));
  for (const section of first) {
    assert.ok(Object.isFrozen(section));
    assert.equal("resources" in section, false, "rapporteur 无专属资源文件（fixed 同）");
    assert.ok(section.text.length > 0);
  }
});

test("fixed：本批不新增 fixed dispatch 分支——模块 dispatch/tools/preflight 返回与 legacy 相同", () => {
  // fixed 派发权威在编排 `src/common/编排/workflow-dispatch.ts`（B1 单一实现；
  // FIXED_CONVENER_BUILT_IN_TARGETS 含 rapporteur）。本角色模块的 `dispatch()` 是**来源=rapporteur**
  // 的纯策略（rapporteur 不派发）；本批不新增 fixed 分支，legacy 数据/行为逐字冻结。
  const inputs: RoleDispatchPolicyInput[] = [
    { sourceRoleId: "rapporteur", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "project", targetExists: true },
    { sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: undefined, targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
  ];
  for (const input of inputs) {
    const legacyPolicy = rapporteurRoleModule.dispatch(input);
    const fixedPolicy = rapporteurRoleModule.dispatch({ ...input, matrix: FIXED });
    assert.deepEqual(fixedPolicy, legacyPolicy, `dispatch 不因矩阵改变：${JSON.stringify(input)}`);
    assert.equal(fixedPolicy.decision.allow, false, "rapporteur 不是可派发来源（fixed 同）");
  }
  assert.deepEqual(
    [...rapporteurRoleModule.tools({ governanceModel: "trio" }).tools],
    ["requestRequirementChange", "submitVersionChange", "selectRunChange"],
    "fixed 不新增工具（tools 输出仍为 legacy 3 项）",
  );
  const preflight = rapporteurRoleModule.preflight;
  assert.ok(preflight !== undefined);
  assert.deepEqual(
    preflight.checkAction({
      action: "detail-amendment",
      facts: { initiatorRoleId: "rapporteur", kind: "detail-amendment", wholeOrder: true, legacyCardPath: "none" },
    }),
    { allow: true },
    "preflight 行为不因 fixed 数据改变",
  );
});

test("fixed：不新增 requestReleaseMerge；模块/本角色测试无 skip/force-exit", () => {
  // 模块源码：不得出现 requestReleaseMerge（G-IR §六拒绝新增）或测试控制手段。
  for (const abs of listTsFiles(MODULE_ROOT)) {
    const source = readFileSync(abs, "utf8");
    const rel = path.relative(path.join(TEST_ROOT, "../../.."), abs).split(path.sep).join("/");
    assert.equal(source.includes("requestReleaseMerge"), false, `${rel} 不得引入 requestReleaseMerge（G-IR §六拒绝）`);
    assert.equal(/\bforceExit\b|--test-force-exit/.test(source), false, `${rel} 不得引入 force-exit`);
    assert.equal(/\btest\.skip\b|\.todo\s*\(/.test(source), false, `${rel} 不得新增 skip/todo`);
  }
  // 本角色测试（除本文件自身）：不新增 skip/force-exit（保持既有 0 skip）。
  for (const abs of listTsFiles(TEST_ROOT).filter((file) => path.basename(file) !== "fixed-module.test.ts")) {
    const source = readFileSync(abs, "utf8");
    const rel = path.relative(path.join(TEST_ROOT, "../../.."), abs).split(path.sep).join("/");
    assert.equal(/\bforceExit\b|--test-force-exit/.test(source), false, `${rel} 不得引入 force-exit`);
    assert.equal(/\btest\.skip\b|it\.skip\b|describe\.skip\b/.test(source), false, `${rel} 不得新增 skip`);
  }
  assert.equal(JSON.stringify(rapporteurRoleModule).includes("requestReleaseMerge"), false);
});
