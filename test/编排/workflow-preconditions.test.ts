// test/编排/workflow-preconditions.test.ts
// 2026-10-29（方案 v2.1 §5）：五步工作流链的机械前置——
//   · project-roster/v1 名单解析/校验（schema/flowId/version/角色 id/目录/重叠）；
//   · 最新名单发现与版本/hash（文件名版本 = frontmatter version）；
//   · 派发矩阵 M1–M8（幕僚按序、运营作用域、拒绝 code 与下一步）；
//   · 任务绑定报告按 task.created.from 路由（M9）。
// 纯逻辑 + 临时文件；不启动应用、不触网、不写仓库。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateDispatchPreflight,
  loadLatestRoster,
  parseProjectRoster,
  reportTargetForTaskCreator,
  rosterDirectoriesFor,
  rosterRoleIds,
  selectLatestRosterFile,
  validateAppointmentCardAgainstRoster,
  type DispatchPreflightInput,
  type ProjectRoster,
} from "../../src/common/编排/workflow-preconditions.ts";

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v2",
  "flowId: focus",
  "version: 1",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现前端与服务",
  "    capability: TypeScript / Node",
  "    modules:",
  "      - impl-core",
  "      - impl-tests",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 质量核对",
  "    capability: 测试",
  "    modules:",
  "      - qa-suite",
  "modules:",
  "  - id: impl-core",
  "    name: 核心实现",
  "    purpose: 实现前端与存储",
  "    directory: src/",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: impl-tests",
  "    name: 实现测试",
  "    purpose: 实现测试与夹具",
  "    directory: tests/",
  "    publicContract: tests/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 质量核对",
  "    purpose: 独立质量核对",
  "    directory: test/",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 人员名单（人读）",
  "",
  "## 人员+模块拓扑图",
  "",
  "```topology",
  "modules:",
  "  - id: impl-core",
  "    directory: src/",
  "    roleId: implementer",
  "  - id: impl-tests",
  "    directory: tests/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    directory: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core, impl-tests]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
  "",
  "说明文字。",
].join("\n");

const VALID_ROSTER: ProjectRoster = parseProjectRoster(ROSTER_TEXT).ok
  ? (parseProjectRoster(ROSTER_TEXT) as { roster: ProjectRoster }).roster
  : (() => {
      throw new Error("fixture roster invalid");
    })();

test("名单解析：合法 frontmatter/角色/模块/拓扑；flowId 可按期望校验", () => {
  const parsed = parseProjectRoster(ROSTER_TEXT, "focus");
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.equal(parsed.roster.schema, "project-roster/v2");
    assert.equal(parsed.roster.flowId, "focus");
    assert.equal(parsed.roster.version, 1);
    assert.deepEqual(rosterRoleIds(parsed.roster), ["implementer", "qa"]);
    assert.deepEqual(parsed.roster.roles[0]!.modules, ["impl-core", "impl-tests"]);
    assert.equal(parsed.roster.modules.length, 3);
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "implementer"), ["src/", "tests/"], "一人多模块：授权目录=模块并集");
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "qa"), ["test/"]);
  }
  const mismatch = parseProjectRoster(ROSTER_TEXT, "other");
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "roster-flow-mismatch");
});

test("模块清单：同父兄弟目录可作为不同模块；同一角色多模块合法（授权目录=并集）", () => {
  const siblingText = [
    "---",
    "schema: project-roster/v2",
    "flowId: bills",
    "version: 1",
    "intent: docs/product/bills-intent-v1.md",
    "proposal: docs/proposals/bills-proposal-v1.md",
    "architecture: docs/contracts/bills-architecture-v1.md",
    "roles:",
    "  - id: impl",
    "    displayName: 实现者",
    "    purpose: 实现计费",
    "    capability: Node",
    "    modules: [bill-a, bill-b]",
    "  - id: qa",
    "    displayName: 测试",
    "    purpose: 质量核对",
    "    capability: node:test",
    "    modules: [bill-qa]",
    "modules:",
    "  - id: bill-a",
    "    name: 计费 A",
    "    purpose: 实现 A",
    "    directory: src/bill/a",
    "    publicContract: src/bill/a/index.js",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "  - id: bill-b",
    "    name: 计费 B",
    "    purpose: 实现 B",
    "    directory: src/bill/b",
    "    publicContract: src/bill/b/index.js",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "  - id: bill-qa",
    "    name: 质量",
    "    purpose: 测试",
    "    directory: test/",
    "    publicContract: test/",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "---",
    "## 人员+模块拓扑图",
    "```topology",
    "modules:",
    "  - id: bill-a",
    "    directory: src/bill/a/",
    "    roleId: impl",
    "  - id: bill-b",
    "    directory: src/bill/b/",
    "    roleId: impl",
    "  - id: bill-qa",
    "    directory: test/",
    "    roleId: qa",
    "roles:",
    "  - id: impl",
    "    modules: [bill-a, bill-b]",
    "  - id: qa",
    "    modules: [bill-qa]",
    "management: [convener, impl, qa]",
    "```",
  ].join("\n");
  const parsed = parseProjectRoster(siblingText);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "impl"), ["src/bill/a/", "src/bill/b/"]);
  }
});

test("名单解析负例：schema/版本/角色/模块/目录/绑定/拓扑", () => {
  const cases: Array<[string, string, string]> = [
    ["missing-frontmatter", "# no frontmatter\n", "roster-frontmatter-missing"],
    ["bad-schema", ROSTER_TEXT.replace("schema: project-roster/v2", "schema: project-roster/v1"), "roster-schema-invalid"],
    ["bad-version", ROSTER_TEXT.replace("version: 1", "version: 0"), "roster-version-invalid"],
    ["builtin-id", ROSTER_TEXT.replace("id: implementer", "id: convener"), "roster-role-builtin"],
    ["bad-id", ROSTER_TEXT.replace("id: implementer", "id: Bad_ID"), "roster-role-id-invalid"],
    ["duplicate-id", ROSTER_TEXT.replace("id: qa", "id: implementer"), "roster-role-duplicate"],
    ["missing-fields", ROSTER_TEXT.replace("    capability: TypeScript / Node\n", ""), "roster-role-fields-missing"],
    [
      "role-modules-missing",
      ROSTER_TEXT.replace("    modules:\n      - impl-core\n      - impl-tests\n", ""),
      "roster-role-modules-invalid",
    ],
    ["module-id-invalid", ROSTER_TEXT.replace("  - id: impl-core\n", "  - id: X\n"), "roster-module-id-invalid"],
    ["module-dir-array", ROSTER_TEXT.replace("    directory: src/\n", "    directory: [src/, lib/]\n"), "roster-module-directory-invalid"],
    ["module-dir-file", ROSTER_TEXT.replace("    directory: src/\n", "    directory: src/cli.js\n"), "roster-module-directory-invalid"],
    ["module-dir-governance", ROSTER_TEXT.replace("    directory: test/\n", "    directory: src/docs/proposals/\n"), "roster-module-directory-governance"],
    ["module-dir-overlap", ROSTER_TEXT.replace("    directory: tests/\n", "    directory: src/sub/\n"), "roster-module-directory-overlap"],
    ["module-fields-missing", ROSTER_TEXT.replace("    publicContract: test/\n", ""), "roster-module-fields-missing"],
    [
      "module-multi-owner",
      ROSTER_TEXT.replace("    modules:\n      - qa-suite\n", "    modules:\n      - qa-suite\n      - impl-core\n"),
      "roster-module-multi-owner",
    ],
    ["topology-missing", ROSTER_TEXT.replace(/## 人员\+模块拓扑图[\s\S]*?```\n/, ""), "roster-topology-missing"],
    [
      "topology-management-missing-convener",
      ROSTER_TEXT.replace("management: [convener, implementer, qa]", "management: [implementer, qa]"),
      "roster-topology-mismatch",
    ],
    [
      "topology-role-binding-mismatch",
      ROSTER_TEXT.replace("    modules: [impl-core, impl-tests]", "    modules: [impl-core]"),
      "roster-topology-mismatch",
    ],
  ];
  for (const [name, text, code] of cases) {
    const parsed = parseProjectRoster(text);
    assert.equal(parsed.ok, false, name);
    if (!parsed.ok) assert.equal(parsed.code, code, `${name}: ${parsed.reason}`);
  }
  // 未被任何角色绑定的模块 ⇒ unbound。
  const orphanText = ROSTER_TEXT.replace(
    "  - id: qa-suite\n    name: 质量核对\n",
    "  - id: orphan\n    name: 孤儿模块\n    purpose: 未绑定\n    directory: lib/\n    publicContract: lib/\n    architectureSource: docs/contracts/focus-architecture-v1.md\n  - id: qa-suite\n    name: 质量核对\n",
  );
  const orphan = parseProjectRoster(orphanText);
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.equal(orphan.code, "roster-module-unbound", orphan.reason);
});

test("最新名单：选 N 最大并校验文件名版本=frontmatter version；缺失/不一致如实报错", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-roster-"));
  try {
    await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    await fs.mkdir(path.join(root, "docs", "product"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "product", "focus-intent-v1.md"), "# 意图\n", "utf8");
    await fs.writeFile(path.join(root, "docs", "proposals", "focus-proposal-v1.md"), "# 提案\n\nintent: docs/product/focus-intent-v1.md\n", "utf8");
    await fs.mkdir(path.join(root, "docs", "contracts"), { recursive: true });
    await fs.writeFile(
      path.join(root, "docs", "contracts", "focus-architecture-v1.md"),
      "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(root, "docs", "proposals", "focus-modules-v1.md"),
      [
        "---",
        "schema: project-modules/v1",
        "flowId: focus",
        "version: 1",
        `modules: ${JSON.stringify(VALID_ROSTER.modules)}`,
        "---",
      ].join("\n"),
      "utf8",
    );
    assert.deepEqual(selectLatestRosterFile("focus", ["focus-roster-v1.md", "focus-roster-v2.md", "other-roster-v9.md"]), {
      version: 2,
      file: "focus-roster-v2.md",
      candidates: ["focus-roster-v1.md", "focus-roster-v2.md"],
    });
    const missing = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "roster-missing");

    await fs.writeFile(path.join(root, "docs", "proposals", "focus-roster-v1.md"), ROSTER_TEXT, "utf8");
    const loaded = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.version, 1);
      assert.equal(loaded.path, "docs/proposals/focus-roster-v1.md");
      assert.match(loaded.sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(rosterRoleIds(loaded.roster), ["implementer", "qa"]);
    }

    // 文件名 v2 但 frontmatter version=1 ⇒ 拒绝（防「同版本改内容」）。
    await fs.writeFile(
      path.join(root, "docs", "proposals", "focus-roster-v2.md"),
      ROSTER_TEXT.replace("version: 1", "version: 1"),
      "utf8",
    );
    const mismatch = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.code, "roster-version-invalid");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("版本化引用：最新名单引用最新文档；旧版只读；缺文件/旧引用/链断裂如实报错", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-roster-version-"));
  try {
    const dirs = ["docs/product", "docs/proposals", "docs/contracts"];
    for (const dir of dirs) await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, "docs/product/focus-intent-v1.md"), "# 意图 v1\n", "utf8");
    await fs.writeFile(path.join(root, "docs/product/focus-intent-v2.md"), "# 意图 v2\n", "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), "# 提案 v1\n\nintent: docs/product/focus-intent-v1.md\n", "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v2.md"), "# 提案 v2\n\nintent: docs/product/focus-intent-v2.md\n", "utf8");
    await fs.writeFile(
      path.join(root, "docs/contracts/focus-architecture-v1.md"),
      "# 架构 v1\n\nproposal: docs/proposals/focus-proposal-v1.md\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(root, "docs/contracts/focus-architecture-v2.md"),
      "# 架构 v2\n\nproposal: docs/proposals/focus-proposal-v2.md\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(root, "docs/proposals/focus-modules-v1.md"),
      [
        "---",
        "schema: project-modules/v1",
        "flowId: focus",
        "version: 1",
        `modules: ${JSON.stringify(VALID_ROSTER.modules)}`,
        "---",
      ].join("\n"),
      "utf8",
    );
    const rosterV1 = ROSTER_TEXT;
    const rosterV2 = ROSTER_TEXT.replace("version: 1", "version: 2")
      .replace("focus-intent-v1", "focus-intent-v2")
      .replace("focus-proposal-v1.md", "focus-proposal-v2.md")
      .replace("focus-architecture-v1", "focus-architecture-v2");
    await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v1.md"), rosterV1, "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v2.md"), rosterV2, "utf8");
    const loaded = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(loaded.ok, true, loaded.ok ? "" : loaded.reason);
    if (loaded.ok) {
      assert.equal(loaded.version, 2);
      assert.equal(loaded.roster.intent, "docs/product/focus-intent-v2.md");
      assert.equal(loaded.roster.proposal, "docs/proposals/focus-proposal-v2.md");
      assert.equal(loaded.roster.architecture, "docs/contracts/focus-architecture-v2.md");
    }
    // 旧版只读：加载新版不修改 v1 名单字节。
    assert.equal((await fs.readFile(path.join(root, "docs/proposals/focus-roster-v1.md"), "utf8")), rosterV1);

    // R7：roster modules[] 是派生快照；与权威 modules 文档漂移 ⇒ drift（以模块文档为准重出）。
    const modulesPath = path.join(root, "docs/proposals/focus-modules-v1.md");
    const modulesText = await fs.readFile(modulesPath, "utf8");
    const drifted = VALID_ROSTER.modules.map((module) =>
      module.id === "impl-core" ? { ...module, directory: "src2/" } : module,
    );
    await fs.writeFile(
      modulesPath,
      [
        "---",
        "schema: project-modules/v1",
        "flowId: focus",
        "version: 1",
        `modules: ${JSON.stringify(drifted)}`,
        "---",
      ].join("\n"),
      "utf8",
    );
    const drift = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "roster-modules-drift", drift.reason);
    await fs.writeFile(modulesPath, modulesText, "utf8");

    // 引用旧版（proposal v1 而最新 v2）⇒ stale。
    const stale = rosterV2.replace("version: 2", "version: 3").replace("focus-proposal-v2.md", "focus-proposal-v1.md");
    await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v3.md"), stale, "utf8");
    const staleLoaded = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(staleLoaded.ok, false);
    if (!staleLoaded.ok) assert.equal(staleLoaded.code, "roster-reference-stale", staleLoaded.reason);

    // 引用不存在 ⇒ missing。
    await fs.rm(path.join(root, "docs/proposals/focus-roster-v3.md"));
    const missing = rosterV2
      .replace("version: 2", "version: 3")
      .replace("focus-intent-v2.md", "focus-intent-v9.md");
    await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v3.md"), missing, "utf8");
    const missingLoaded = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(missingLoaded.ok, false);
    if (!missingLoaded.ok) assert.equal(missingLoaded.code, "roster-reference-missing", missingLoaded.reason);

    // proposal 未引用 intent ⇒ inconsistent（先把 roster 引用改回存在的 v2）。
    await fs.rm(path.join(root, "docs/proposals/focus-roster-v3.md"));
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v2.md"), "# 提案 v2（漏引用）\n", "utf8");
    const inconsistent = await loadLatestRoster({ projectRoot: root, flowId: "focus" });
    assert.equal(inconsistent.ok, false);
    if (!inconsistent.ok) assert.equal(inconsistent.code, "roster-reference-inconsistent", inconsistent.reason);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("版本格式：引用必须带 -vN.md；非版本化路径拒绝", () => {
  const bad = parseProjectRoster(ROSTER_TEXT.replace("intent: docs/product/focus-intent-v1.md", "intent: docs/product/focus-intent.md"));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "roster-reference-invalid");
});

test("D3 卡形状：多选、选项恰为名单角色（无内置/重复/缺项/多项）", () => {
  const ok = validateAppointmentCardAgainstRoster({
    roster: VALID_ROSTER,
    optionIds: ["qa", "implementer"],
    multiple: true,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.recommendedRoleIds, ["implementer", "qa"], "推荐集由应用按名单生成（顺序=名单）");

  const single = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa"], multiple: false });
  assert.equal(single.ok, false);
  const missing = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer"], multiple: true });
  assert.equal(missing.ok, false);
  const extra = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa", "extra"], multiple: true });
  assert.equal(extra.ok, false);
  const builtin = validateAppointmentCardAgainstRoster({ roster: VALID_ROSTER, optionIds: ["implementer", "qa", "chief"], multiple: true });
  assert.equal(builtin.ok, false);
});

function preflight(overrides: Partial<DispatchPreflightInput>): DispatchPreflightInput {
  return {
    fromRoleId: "chief",
    targetRoleId: "product",
    targetBuiltIn: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
    flowId: "focus",
    intent: { found: true, candidates: 1 },
    proposalFound: true,
    architectureFound: true,
    roster: { ok: true, roster: VALID_ROSTER, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "a".repeat(64) },
    d3Selected: [],
    moduleId: "impl-core",
    handoffFound: false,
    targetCardFound: true,
    ...overrides,
  };
}

test("派发矩阵 M1–M8：幕僚按序（意图/名单/交付）、运营作用域、拒绝 code 明确", () => {
  // M1 幕僚→策划：缺意图 → 拒；有意图 → 放。
  const noIntent = evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur", intent: { found: false, candidates: 0 } }));
  assert.equal(noIntent.ok, false);
  if (!noIntent.ok) assert.equal(noIntent.code, "intent-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur" })).ok, true);

  // M2 幕僚→人事：缺方案 → 拒；缺/非法名单 → 拒；齐备 → 放。
  const noProposal = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", proposalFound: false }));
  assert.equal(noProposal.ok, false);
  if (!noProposal.ok) assert.equal(noProposal.code, "proposal-missing");
  const noRoster = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", roster: { ok: false, code: "roster-missing", reason: "无" } }));
  assert.equal(noRoster.ok, false);
  if (!noRoster.ok) assert.equal(noRoster.code, "roster-missing");
  const noModulesRoster: ProjectRoster = { ...VALID_ROSTER, modules: [] };
  const noModules = evaluateDispatchPreflight(
    preflight({
      targetRoleId: "nominator",
      roster: { ok: true, roster: noModulesRoster, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "b".repeat(64) },
    }),
  );
  assert.equal(noModules.ok, false);
  if (!noModules.ok) assert.equal(noModules.code, "roster-modules-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "nominator" })).ok, true);

  // M5 幕僚→运营：无 D3 → 拒；D3 选中缺卡 → 拒；齐备 → 放。
  const noD3 = evaluateDispatchPreflight(preflight({ targetRoleId: "convener" }));
  assert.equal(noD3.ok, false);
  if (!noD3.ok) assert.equal(noD3.code, "d3-missing");
  const noCards = evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"], targetCardFound: false }));
  assert.equal(noCards.ok, false);
  if (!noCards.ok) assert.equal(noCards.code, "target-card-missing");
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"] })).ok, true);

  // M8 幕僚→项目 worker：一律拒。
  const chiefToWorker = evaluateDispatchPreflight(preflight({ targetRoleId: "implementer", targetBuiltIn: false }));
  assert.equal(chiefToWorker.ok, false);
  if (!chiefToWorker.ok) assert.equal(chiefToWorker.code, "chief-to-project-forbidden");

  // 运营作用域：未接交付 → 拒；名单外 → 拒；名单内缺卡 → 拒；名单内 + 有卡 → 放；质检（有交付）→ 放。
  const convener = (overrides: Partial<DispatchPreflightInput>) =>
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, ...overrides }));
  const noHandoff = convener({ handoffFound: false });
  assert.equal(noHandoff.ok, false);
  if (!noHandoff.ok) assert.equal(noHandoff.code, "handoff-missing");
  const notNominated = convener({ handoffFound: true, d3Selected: [] });
  assert.equal(notNominated.ok, false);
  if (!notNominated.ok) assert.equal(notNominated.code, "target-not-nominated");
  const cardMissing = convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: false });
  assert.equal(cardMissing.ok, false);
  if (!cardMissing.ok) assert.equal(cardMissing.code, "target-card-missing");
  assert.equal(convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: true }).ok, true);
  assert.equal(
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "verifier", handoffFound: true })).ok,
    true,
    "运营可在接交付后派质检做验收核对",
  );
  const forbiddenBuiltIn = evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "product", handoffFound: true }));
  assert.equal(forbiddenBuiltIn.ok, false);
  if (!forbiddenBuiltIn.ok) assert.equal(forbiddenBuiltIn.code, "convener-target-forbidden");
});

test("派发矩阵：幕僚可派产品/质检（无链式前置）；自派/未知来源拒绝", () => {
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "product" })).ok, true);
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "verifier" })).ok, true);
  const self = evaluateDispatchPreflight(preflight({ fromRoleId: "chief", targetRoleId: "chief" }));
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");
  const unknown = evaluateDispatchPreflight(preflight({ fromRoleId: "rapporteur", targetRoleId: "product" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "unknown-source");
});

test("报告路由（M9）：任务绑定报告按 task.created.from 回创建者；无创建者不猜", () => {
  assert.equal(reportTargetForTaskCreator({ creator: "chief", chiefRoleId: "chief", convenerRoleId: "convener" }), "chief");
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: "convener" }), "convener");
  assert.equal(reportTargetForTaskCreator({ creator: undefined, chiefRoleId: "chief", convenerRoleId: "convener" }), null);
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: null }), null);
});

test("链式派发必须带 flowId（Q9）：交付运营/运营派实现或验收缺 flowId ⇒ flow-required", () => {
  const chiefNoFlow = evaluateDispatchPreflight(
    preflight({ targetRoleId: "convener", d3Selected: ["implementer"], flowId: undefined as never }),
  );
  assert.equal(chiefNoFlow.ok, false);
  if (!chiefNoFlow.ok) assert.equal(chiefNoFlow.code, "flow-required");
  const convenerNoFlow = evaluateDispatchPreflight(
    preflight({
      fromRoleId: "convener",
      targetRoleId: "implementer",
      targetBuiltIn: false,
      handoffFound: true,
      d3Selected: ["implementer"],
      flowId: undefined as never,
    }),
  );
  assert.equal(convenerNoFlow.ok, false);
  if (!convenerNoFlow.ok) assert.equal(convenerNoFlow.code, "flow-required");
});
