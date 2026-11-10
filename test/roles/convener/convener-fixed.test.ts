// convener 角色模块 fixed 矩阵测试（T3「两条固定工作流路径」B2；MF-IR-4 / v1.3 §3.4）。
//
// 覆盖：
//  - `fixedCards` / `fixedAllowedBuiltInRoleIds` 冻结值（与 legacy 数据独立）；
//  - `isConvenerFixedBuiltInDispatchTarget` 正/负例、与目标表同源、纯函数；
//  - fixed context 段（仅显式 `matrix:"two-fixed-paths/v1"` 返回；legacy 三段/返回值逐字不变）；
//  - legacy 数据/派发/tools 不受 fixed 字段影响（与既有单测/差分测试互补，不重复弱化）；
//  - G-IR 拒绝项：无 `requestReleaseMerge`、工具闭集不变、无新增 skip/force-exit。
//
// legacy 差分逐字不变由 `convener-differential.test.ts`（冻结金样）继续保证；本文件不修改
// legacy 数据，也不断言 fixed 之外的新行为。

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CONVENER_WORKER_DISPATCH_TARGETS,
  convenerRoleModule,
} from "../../../src/common/roles/convener/index.ts";

const MODULE = convenerRoleModule;
const FIXED = "two-fixed-paths/v1" as const;
const MODULE_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "src/common/roles/convener");

// —————————————————————— fixed 数据值（MF-IR-4 冻结值）——————————————————————

test("fixedCards：冻结值恰 [\"decision\"]；独立于 legacy cards，legacy 逐字不变", () => {
  const fixedCards = MODULE.fixedCards;
  assert.ok(fixedCards !== undefined, "convener 必须提供 fixedCards（B2 六角色均提供）");
  assert.deepEqual([...fixedCards], ["decision"]);
  assert.equal(Object.isFrozen(fixedCards), true);
  // legacy 卡种逐字不变；fixed 是新数组（不从 legacy cards 过滤/复用同一引用）。
  assert.deepEqual([...MODULE.cards], ["decision"]);
  assert.equal(Object.isFrozen(MODULE.cards), true);
  assert.notEqual(fixedCards, MODULE.cards, "fixedCards 必须是独立冻结数据（不从 legacy cards 派生）");
});

test("fixedAllowedBuiltInRoleIds：冻结值恰 [product, rapporteur, nominator]；legacy allowedBuiltInRoleIds 仍 [verifier]", () => {
  const fixedAllowed = MODULE.fixedAllowedBuiltInRoleIds;
  assert.ok(fixedAllowed !== undefined, "convener 必须提供 fixedAllowedBuiltInRoleIds（MF-IR-4）");
  assert.deepEqual([...fixedAllowed], ["product", "rapporteur", "nominator"]);
  assert.equal(Object.isFrozen(fixedAllowed), true);
  assert.equal((fixedAllowed as readonly string[]).includes("verifier"), false, "fixed 下 convener 不得派 verifier");
  // legacy 目标常量逐字冻结（legacy 消费点 apply-journal/trunk-runtime 不改读取源）。
  assert.deepEqual([...CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds], ["verifier"]);
  assert.equal(CONVENER_WORKER_DISPATCH_TARGETS.workerTargetKind, "project");
  assert.equal(CONVENER_WORKER_DISPATCH_TARGETS.reportToRoleId, "convener");
});

// —————————————————————— fixed 谓词（与目标表同源）——————————————————————

test("isConvenerFixedBuiltInDispatchTarget：生产线目标正例；verifier/自身/未知/大小写变体负例", () => {
  const predicate = MODULE.isConvenerFixedBuiltInDispatchTarget;
  assert.ok(predicate !== undefined, "convener 必须提供 fixed 谓词（MF-IR-4）");
  assert.equal(typeof predicate, "function");
  for (const target of ["product", "rapporteur", "nominator"]) {
    assert.equal(predicate(target), true, `fixed 谓词须允许 ${target}`);
  }
  for (const denied of ["verifier", "chief", "convener", "su", "", "  ", "worker-x", "Product", "product "]) {
    assert.equal(predicate(denied), false, `fixed 谓词须拒绝 ${JSON.stringify(denied)}`);
  }
  // 同源：成员判定恰与 fixedAllowedBuiltInRoleIds 一致（不复制第二张表）。
  const fixedAllowed = MODULE.fixedAllowedBuiltInRoleIds ?? [];
  for (const target of ["product", "rapporteur", "nominator", "verifier", "chief", "worker-x"]) {
    assert.equal(predicate(target), fixedAllowed.includes(target), target);
  }
  // 纯函数：重复调用同值；不修改目标表（无副作用）。
  const before = JSON.stringify(MODULE.fixedAllowedBuiltInRoleIds ?? null);
  assert.equal(predicate("product"), predicate("product"));
  assert.equal(predicate("verifier"), predicate("verifier"));
  assert.equal(JSON.stringify(MODULE.fixedAllowedBuiltInRoleIds ?? null), before);
});

// —————————————————————— fixed context 段（仅显式 fixed 矩阵）——————————————————————

test("context(fixed)：返回 fixed 段（生产线/团队计划与基线/集成汇总与报告期望），冻结且无 resources", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  assert.deepEqual(
    sections.map((section) => section.id),
    ["convener-fixed-production-line", "convener-fixed-baseline", "convener-fixed-report"],
  );
  assert.equal(Object.isFrozen(sections), true);
  for (const section of sections) {
    assert.equal(section.text.trim().length > 0, true, section.id);
    assert.equal(section.resources, undefined, section.id);
    assert.equal(Object.isFrozen(section), true);
  }
  const text = sections.map((section) => section.text).join("\n");
  // 任务书固定主题：生产线唯一派发者（product/rapporteur/nominator/项目生产角色/实现）、
  // 团队计划、基线 3 件小事、集成汇总、不派 verifier。
  for (const token of [
    "生产线唯一派发者",
    "product",
    "rapporteur",
    "nominator",
    "项目生产角色",
    "实现",
    "团队计划",
    "基线 3 件小事",
    "git init -b main",
    ".gitignore",
    "ans/task/",
    "集成汇总",
    "报告期望",
    "verifier",
    "convener-to-verifier-forbidden",
  ]) {
    assert.equal(text.includes(token), true, `fixed 段缺主题：${token}`);
  }
  // 纯数据：不携带权限/批准字段。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    for (const section of sections) assert.equal(forbidden in section, false, section.id);
  }
});

test("context(legacy)：无 matrix / legacy-v1 / 畸形输入返回同一 legacy 三段（固定前逐字冻结）", () => {
  const legacy = MODULE.context({ governanceModel: "trio" });
  assert.equal(MODULE.context({ governanceModel: "single" }), legacy);
  assert.equal(MODULE.context({ governanceModel: "trio", matrix: "legacy-v1" }), legacy);
  assert.equal(MODULE.context({} as never), legacy, "context({}) 必须逐字返回 legacy 段");
  assert.equal(MODULE.context(null as never), legacy, "畸形输入保持 legacy 行为（不抛错）");
  assert.equal(MODULE.context({ matrix: "unknown" } as never), legacy, "未知矩阵值不升级为 fixed");
  assert.deepEqual(legacy.map((section) => section.id), ["decision-card", "project-workflow", "report-expectation"]);
  const text = legacy.map((section) => section.text).join("\n");
  assert.equal(text.includes("request_choice(cardKind=decision)"), true);
  assert.equal(text.includes("reportTargetForTaskCreator"), true);
  assert.equal(text.includes("convener-fixed"), false, "legacy 返回值不得混入 fixed 段");
  // 两矩阵隔离：fixed 返回值不含 legacy 段 id（run-role fixed 会话只追加 fixed 段）。
  assert.equal(
    MODULE.context({ governanceModel: "trio", matrix: FIXED }).some((section) => section.id === "decision-card"),
    false,
  );
});

// —————————————————————— legacy 行为不受 fixed 字段影响 ——————————————————————

test("legacy tools/dispatch/capabilities 与 fixed 字段无耦合（fixed 数据纯只读）", () => {
  const trio = MODULE.tools({ governanceModel: "trio" });
  assert.deepEqual([...trio.tools], [
    "requestRequirementChange",
    "completeTeamPlan",
    "closeCreatedTask",
    "submitRefactor",
    "requestStableWrite",
  ]);
  assert.equal(trio.capabilities, MODULE.capabilities);
  assert.deepEqual([...MODULE.tools({ governanceModel: "single" }).tools], ["submitRefactor", "requestStableWrite"]);

  // legacy dispatch 逐字保持：convener→verifier 允许；convener→product 拒绝（fixed 目标只经
  // fixed 谓词/矩阵视图消费，不改 legacy dispatch()）。
  const verifier = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(verifier.decision, { allow: true });
  assert.equal(verifier.reportToRoleId, "convener");
  const product = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(product.decision.allow, false);
  assert.equal(product.decision.allow === false ? product.decision.code : "", "convener-target-forbidden");
  // 传 fixed matrix 也不改变 dispatch() 的 legacy 判定（fixed 派发由编排 fixed 谓词负责）。
  const productFixedMatrix = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.deepEqual(productFixedMatrix, product);

  // 纯数据：模块不新增权限/批准字段。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    assert.equal(forbidden in MODULE, false);
  }
});

// —————————————————————— 模块纪律与 G-IR 拒绝项 ——————————————————————

test("模块纪律：唯一 public entry；只 import Model（type-only）；无 requestReleaseMerge / 无新工具", async () => {
  const entries = await readdir(MODULE_DIR, { withFileTypes: true });
  assert.deepEqual(entries.map((entry) => entry.name), ["index.ts"]);

  const source = await readFile(path.join(MODULE_DIR, "index.ts"), "utf8");
  assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/, "G-IR §六拒绝新增 requestReleaseMerge");
  for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
    assert.equal(match[1].startsWith("../../../model/"), true, `越界 import：${match[1]}`);
  }
  assert.deepEqual([...source.matchAll(/^import\s+(?!type\b)[^;]+;/gm)].map((match) => match[0]), [], "角色模块只允许 `import type`");
  for (const forbidden of ["node:", "require(", "import(", "Math.random", "new Date(", "process.env"]) {
    assert.equal(source.includes(forbidden), false, `角色模块不得包含：${forbidden}`);
  }
});

test("测试纪律：本目录测试不新增 skip / force-exit（token 动态拼接以避免自指误报）", async () => {
  const skipCall = new RegExp("\\b(?:test|t)\\.skip\\s*\\(");
  const forceExitToken = ["test", "force", "exit"].join("-");
  const files = (await readdir(import.meta.dirname)).filter((name) => name.endsWith(".test.ts"));
  assert.ok(files.length >= 3);
  for (const file of files) {
    const source = await readFile(path.join(import.meta.dirname, file), "utf8");
    assert.doesNotMatch(source, skipCall, `${file} 不得新增 skip`);
    assert.equal(source.includes(forceExitToken), false, `${file} 不得新增 force-exit`);
  }
});
