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
import { fileURLToPath } from "node:url";

import {
  contractSchemaText,
  evaluateDispatchAuthorization,
  evaluateDispatchPreflight,
  loadLatestRoster,
  parseProjectModules,
  parseProjectRoster,
  parseTeamPlan,
  PROJECT_MODULES_SCHEMA,
  PROJECT_MODULES_SCHEMA_EXAMPLE,
  PROJECT_ROSTER_SCHEMA,
  PROJECT_ROSTER_SCHEMA_EXAMPLE,
  PROJECT_TOPOLOGY_SCHEMA,
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  reportTargetForTaskCreator,
  rosterDirectoriesFor,
  rosterRoleIds,
  selectLatestRosterFile,
  validateAppointmentCardAgainstRoster,
  type DispatchPreflightInput,
  type ProjectRoster,
} from "../../src/common/编排/workflow-preconditions.ts";

test("team plan: real roster owns modules; explicit writesets and dependencies form a strict DAG without granting execution", () => {
  const loaded = parseProjectRoster(ROSTER_TEXT, "focus"); assert.ok(loaded.ok); if (!loaded.ok) return;
  const context = { flowId: "focus", version: 2, modules: { path: "docs/proposals/focus-modules-v1.md", sha256: "a".repeat(64) },
    roster: { path: "docs/proposals/focus-roster-v1.md", sha256: "b".repeat(64) }, rosterFacts: loaded.roster };
  const input = { schema: "teamPlanSchema:3", flowId: "focus", version: 2, modules: context.modules, roster: context.roster,
    roleRows: loaded.roster.roles.map(role => ({ roleId: role.id, modules: role.modules,
      writesets: loaded.roster.modules.filter(module => role.modules.includes(module.id)).flatMap(module => module.paths),
      dependsOn: role.id === "qa" ? ["implementer"] : [] as string[] })) };
  const text = (value: unknown) => `---\n${JSON.stringify(value)}\n---\n# Actual team plan\n`;
  const parsed = parseTeamPlan(text(input), context); assert.ok(parsed.ok, JSON.stringify(parsed));
  assert.equal(parsed.ok && "d3" in parsed.plan, false);
  assert.equal(parseTeamPlan("---\nschema: teamPlanSchema:3\n---\n# legacy plan", context).ok, false);
  for (const mutate of [
    (value: typeof input) => { value.roster.sha256 = "c".repeat(64); },
    (value: typeof input) => { value.roleRows[0]!.modules = value.roleRows[1]!.modules; },
    (value: typeof input) => { value.roleRows[0]!.writesets = ["src/../escape/"]; },
    (value: typeof input) => { value.roleRows[1]!.writesets = value.roleRows[0]!.writesets; },
    (value: typeof input) => { value.roleRows[0]!.dependsOn = ["missing-role"]; },
    (value: typeof input) => { value.roleRows[0]!.dependsOn = ["qa"]; },
  ]) { const invalid = structuredClone(input); mutate(invalid); assert.equal(parseTeamPlan(text(invalid), context).ok, false, JSON.stringify(invalid)); }
  const missing = structuredClone(input) as unknown as Record<string, unknown>;
  const rows = missing.roleRows as Array<Record<string, unknown>>; delete rows[0]!.dependsOn;
  assert.equal(parseTeamPlan(text(missing), context).ok, false);
});

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "modulesDoc: docs/proposals/focus-modules-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具省略装配/入口角色",
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
  "    path: src/",
    "    category: core",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: impl-tests",
  "    name: 实现测试",
  "    purpose: 实现测试与夹具",
  "    path: tests/",
    "    category: core",
  "    publicContract: tests/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 质量核对",
  "    purpose: 独立质量核对",
  "    path: test/",
    "    category: core",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 人员名单（人读）",
  "",
  "## 人员+模块拓扑图",
  "",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: impl-tests",
  "    path: tests/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: test/",
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

const parsedRosterFixture = parseProjectRoster(ROSTER_TEXT);
const VALID_ROSTER: ProjectRoster = parsedRosterFixture.ok
  ? parsedRosterFixture.roster
  : (() => {
      throw new Error(`fixture roster invalid: ${parsedRosterFixture.reason}`);
    })();

const PREFLIGHT_ROSTER: ProjectRoster = {
  ...VALID_ROSTER,
  envBootstrap: { omitted: false },
  roles: [
    ...VALID_ROSTER.roles,
    { id: "env-bootstrap", displayName: "环境装配", purpose: "环境与入口", capability: "build", modules: ["env-resources", "entry-index"] },
  ],
  modules: [
    ...VALID_ROSTER.modules,
    { id: "env-resources", name: "环境装配", purpose: "零依赖与构建配置", paths: ["package.json"], path: "package.json", category: "env", publicContract: "package.json", architectureSource: "docs/contracts/focus-architecture-v1.md" },
    { id: "entry-index", name: "项目入口", purpose: "入口文件", paths: ["index.html"], path: "index.html", category: "entry", publicContract: "index.html", architectureSource: "docs/contracts/focus-architecture-v1.md" },
  ],
};

test("名单解析：合法 frontmatter/角色/模块/拓扑；flowId 可按期望校验", () => {
  const parsed = parseProjectRoster(ROSTER_TEXT, "focus");
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.equal(parsed.roster.schema, "project-roster/v3");
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
    "schema: project-roster/v3",
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
    "    path: src/bill/a/",
    "    category: core",
    "    publicContract: src/bill/a/index.js",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "  - id: bill-b",
    "    name: 计费 B",
    "    purpose: 实现 B",
    "    path: src/bill/b/",
    "    category: core",
    "    publicContract: src/bill/b/index.js",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "  - id: bill-qa",
    "    name: 质量",
    "    purpose: 测试",
    "    path: test/",
    "    category: core",
    "    publicContract: test/",
    "    architectureSource: docs/contracts/bills-architecture-v1.md",
    "---",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "modules:",
    "  - id: bill-a",
    "    path: src/bill/a/",
    "    roleId: impl",
    "  - id: bill-b",
    "    path: src/bill/b/",
    "    roleId: impl",
    "  - id: bill-qa",
    "    path: test/",
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
    ["bad-schema", ROSTER_TEXT.replace("schema: project-roster/v3", "schema: project-roster/v1"), "roster-schema-invalid"],
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
    ["module-dir-array", ROSTER_TEXT.replace("    path: src/\n", "    path: [src/, lib/]\n"), "roster-module-directory-invalid"],
    ["module-dir-governance", ROSTER_TEXT.replace("    path: test/\n", "    path: src/docs/proposals/\n"), "roster-module-directory-governance"],
    ["module-dir-overlap", ROSTER_TEXT.replace("    path: tests/\n", "    path: src/sub/\n"), "roster-module-directory-overlap"],
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
    "  - id: orphan\n    name: 孤儿模块\n    purpose: 未绑定\n    path: lib/\n    category: core\n    publicContract: lib/\n    architectureSource: docs/contracts/focus-architecture-v1.md\n  - id: qa-suite\n    name: 质量核对\n",
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
    await fs.writeFile(path.join(root, "docs", "proposals", "focus-proposal-v1.md"), "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n", "utf8");
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
        "schema: project-modules/v2",
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
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案 v1\n", "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v2.md"), "---\nschema: project-proposal/v2\nflowId: focus\nversion: 2\nintent: docs/product/focus-intent-v2.md\n---\n# 提案 v2\n", "utf8");
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
        "schema: project-modules/v2",
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
      module.id === "impl-core" ? { ...module, path: "src2/", paths: ["src2/"] } : module,
    );
    await fs.writeFile(
      modulesPath,
      [
        "---",
        "schema: project-modules/v2",
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
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v2.md"), "---\nschema: project-proposal/v2\nflowId: focus\nversion: 2\n---\n# 提案 v2（漏引用）\n", "utf8");
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
  // v2.20 D3：未省略 env-bootstrap 时必须选中它；取消须先出新名单版本。
  const envCancel = validateAppointmentCardAgainstRoster({
    roster: PREFLIGHT_ROSTER,
    optionIds: PREFLIGHT_ROSTER.roles.map((role) => role.id),
    multiple: true,
    selectedRoleIds: ["implementer", "qa"],
  });
  assert.equal(envCancel.ok, false);
  if (!envCancel.ok) assert.match(envCancel.reason, /env-bootstrap/);
  const envSelected = validateAppointmentCardAgainstRoster({
    roster: PREFLIGHT_ROSTER,
    optionIds: PREFLIGHT_ROSTER.roles.map((role) => role.id),
    multiple: true,
    selectedRoleIds: PREFLIGHT_ROSTER.roles.map((role) => role.id),
  });
  assert.equal(envSelected.ok, true);
  // 未省略但名单本身缺 env-bootstrap：D3 阶段即拒绝，不等 appointment-write 才兜。
  const missingEnv = validateAppointmentCardAgainstRoster({
    roster: { ...VALID_ROSTER, envBootstrap: { omitted: false } },
    optionIds: VALID_ROSTER.roles.map((role) => role.id),
    multiple: true,
  });
  assert.equal(missingEnv.ok, false);
  if (!missingEnv.ok) assert.match(missingEnv.reason, /env-bootstrap/);
});

function preflight(overrides: Partial<DispatchPreflightInput>): DispatchPreflightInput {
  return {
    fromRoleId: "chief",
    targetRoleId: "product",
    targetBuiltIn: true,
    targetExists: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
    flowId: "focus",
    intent: { found: true, candidates: 1 },
    proposalFound: true,
    architectureFound: true,
    roster: { ok: true, roster: PREFLIGHT_ROSTER, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "a".repeat(64) },
    d3Selected: [],
    run: { state: "pinned", runId: "run-20261030-focus-test", roles: ["implementer", "qa"] },
    moduleId: "impl-core",
    handoffFound: false,
    targetCardFound: true,
    ...overrides,
  };
}

test("派发矩阵 M1–M8：状态缺失降级 advisory；硬授权仍拒绝", () => {
  // M1 幕僚→策划：缺意图 → 受理 + intent-missing。
  const noIntent = evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur", intent: { found: false, candidates: 0 } }));
  assert.equal(noIntent.ok, true);
  if (noIntent.ok) assert.ok(noIntent.advisories.some((a) => a.code === "intent-missing"));
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "rapporteur" })).ok, true);

  // M2 幕僚→人事：缺方案/名单/模块 → 受理 + advisory。
  const noProposal = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", proposalFound: false }));
  assert.equal(noProposal.ok, true);
  if (noProposal.ok) assert.ok(noProposal.advisories.some((a) => a.code === "proposal-missing"));
  const noRoster = evaluateDispatchPreflight(preflight({ targetRoleId: "nominator", roster: { ok: false, code: "roster-missing", reason: "无" } }));
  assert.equal(noRoster.ok, true);
  if (noRoster.ok) assert.ok(noRoster.advisories.some((a) => a.code === "roster-missing"));
  const noModulesRoster: ProjectRoster = { ...VALID_ROSTER, modules: [] };
  const noModules = evaluateDispatchPreflight(
    preflight({
      targetRoleId: "nominator",
      roster: { ok: true, roster: noModulesRoster, path: "docs/proposals/focus-roster-v1.md", version: 1, sha256: "b".repeat(64) },
    }),
  );
  assert.equal(noModules.ok, true);
  if (noModules.ok) assert.ok(noModules.advisories.some((a) => a.code === "roster-modules-missing"));
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "nominator" })).ok, true);

  // M5 幕僚→运营：无 D3 / D3 缺卡 → 受理 + advisory。
  const noD3 = evaluateDispatchPreflight(preflight({ targetRoleId: "convener" }));
  assert.equal(noD3.ok, true);
  if (noD3.ok) assert.ok(noD3.advisories.some((a) => a.code === "d3-missing"));
  const noCards = evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"], targetCardFound: false, missingSelectedCardIds: ["implementer"] }));
  assert.equal(noCards.ok, true);
  if (noCards.ok) {
    const cards = noCards.advisories.find((a) => a.code === "d3-selected-cards-incomplete");
    assert.ok(cards);
    assert.match(cards.message, /implementer/);
    assert.match(cards.message, /内置角色/);
  }
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"] })).ok, true);

  // M8 幕僚→项目 worker：硬拒。
  const chiefToWorker = evaluateDispatchPreflight(preflight({ targetRoleId: "implementer", targetBuiltIn: false }));
  assert.equal(chiefToWorker.ok, false);
  if (!chiefToWorker.ok) assert.equal(chiefToWorker.code, "chief-to-project-forbidden");

  // 运营作用域：未接交付/名单外 → 受理 + advisory；目标不存在 → 硬拒。
  const convener = (overrides: Partial<DispatchPreflightInput>) =>
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, ...overrides }));
  const noHandoff = convener({ handoffFound: false });
  assert.equal(noHandoff.ok, true);
  if (noHandoff.ok) assert.ok(noHandoff.advisories.some((a) => a.code === "handoff-missing"));
  const notNominated = convener({ handoffFound: true, d3Selected: [] });
  assert.equal(notNominated.ok, true);
  if (notNominated.ok) assert.ok(notNominated.advisories.some((a) => a.code === "target-not-nominated"));
  const cardMissing = convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: false, targetExists: false });
  assert.equal(cardMissing.ok, false);
  if (!cardMissing.ok) assert.equal(cardMissing.code, "target-card-missing");
  const accepted = convener({ handoffFound: true, d3Selected: ["implementer"], targetCardFound: true });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.deepEqual(accepted.advisories, []);
  assert.equal(
    evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "verifier", handoffFound: true })).ok,
    true,
    "运营可在接交付后派质检做验收核对",
  );
  const forbiddenBuiltIn = evaluateDispatchPreflight(preflight({ fromRoleId: "convener", targetRoleId: "product", handoffFound: true }));
  assert.equal(forbiddenBuiltIn.ok, false);
  if (!forbiddenBuiltIn.ok) assert.equal(forbiddenBuiltIn.code, "convener-target-forbidden");
});

test("派发矩阵：幕僚可派产品/质检；自派/未知来源/内置 allowlist 拒绝", () => {
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "product" })).ok, true);
  assert.equal(evaluateDispatchPreflight(preflight({ targetRoleId: "verifier" })).ok, true);
  const self = evaluateDispatchPreflight(preflight({ fromRoleId: "chief", targetRoleId: "chief" }));
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");
  const unknown = evaluateDispatchPreflight(preflight({ fromRoleId: "rapporteur", targetRoleId: "product" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "unknown-source");
  const su = evaluateDispatchPreflight(preflight({ targetRoleId: "su", targetBuiltIn: true }));
  assert.equal(su.ok, false);
  if (!su.ok) assert.equal(su.code, "target-card-missing");
  const liaison = evaluateDispatchPreflight(preflight({ targetRoleId: "liaison", targetBuiltIn: false }));
  assert.equal(liaison.ok, false);
  if (!liaison.ok) assert.equal(liaison.code, "chief-to-project-forbidden");
  const syntheticUnknownBuiltIn = evaluateDispatchAuthorization({
    fromRoleId: "chief",
    targetRoleId: "future-built-in",
    targetBuiltIn: true,
    targetExists: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
  });
  assert.equal(syntheticUnknownBuiltIn.ok, false);
  if (!syntheticUnknownBuiltIn.ok) assert.equal(syntheticUnknownBuiltIn.code, "target-card-missing");
});

test("报告路由（M9）：任务绑定报告按 task.created.from 回创建者；无创建者不猜", () => {
  assert.equal(reportTargetForTaskCreator({ creator: "chief", chiefRoleId: "chief", convenerRoleId: "convener" }), "chief");
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: "convener" }), "convener");
  assert.equal(reportTargetForTaskCreator({ creator: undefined, chiefRoleId: "chief", convenerRoleId: "convener" }), null);
  assert.equal(reportTargetForTaskCreator({ creator: "convener", chiefRoleId: "chief", convenerRoleId: null }), null);
});

test("链式派发必须带 flowId（Q9）：交付运营/运营派实现或验收缺 flowId ⇒ 受理 + flow-required", () => {
  const chiefNoFlow = evaluateDispatchPreflight(
    preflight({ targetRoleId: "convener", d3Selected: ["implementer"], flowId: undefined }),
  );
  assert.equal(chiefNoFlow.ok, true);
  if (chiefNoFlow.ok) assert.ok(chiefNoFlow.advisories.some((a) => a.code === "flow-required"));
  const convenerNoFlow = evaluateDispatchPreflight(
    preflight({
      fromRoleId: "convener",
      targetRoleId: "implementer",
      targetBuiltIn: false,
      handoffFound: true,
      d3Selected: ["implementer"],
      flowId: undefined,
    }),
  );
  assert.equal(convenerNoFlow.ok, true);
  if (convenerNoFlow.ok) assert.ok(convenerNoFlow.advisories.some((a) => a.code === "flow-required"));
});

test("模块路径可为文件或目录：文件模块正例；文件+目录同父合法；相等/包含负例", () => {
  const base = [
    "---",
    "schema: project-roster/v3",
    "flowId: notes",
    "version: 1",
    "intent: docs/product/notes-intent-v1.md",
    "proposal: docs/proposals/notes-proposal-v1.md",
    "architecture: docs/contracts/notes-architecture-v1.md",
    "roles:",
    "  - id: dev",
    "    displayName: 开发",
    "    purpose: 实现",
    "    capability: Node",
    "    modules: [core]",
    "  - id: doc",
    "    displayName: 文档",
    "    purpose: 文档",
    "    capability: Markdown",
    "    modules: [readme]",
    "  - id: env-bootstrap",
    "    displayName: 环境装配",
    "    purpose: 环境与入口",
    "    capability: build",
    "    modules: [env-resources, entry-index]",
    "modules:",
    "  - id: core",
    "    name: 核心",
    "    purpose: 核心实现",
    "    path: src/",
    "    category: core",
    "    publicContract: src/index.js",
    "    architectureSource: docs/contracts/notes-architecture-v1.md",
    "  - id: env-resources",
    "    name: 包声明",
    "    purpose: 零依赖声明",
    "    paths: [package.json, scripts/, vite.config.js]",
    "    category: env",
    "    publicContract: package.json",
    "    architectureSource: docs/contracts/notes-architecture-v1.md",
    "  - id: readme",
    "    name: 文档",
    "    purpose: 用法文档",
    "    paths: [README.md]",
    "    category: core",
    "    publicContract: README.md",
    "    architectureSource: docs/contracts/notes-architecture-v1.md",
    "  - id: entry-index",
    "    name: 项目入口",
    "    purpose: 入口文件",
    "    path: index.html",
    "    category: entry",
    "    publicContract: index.html",
    "    architectureSource: docs/contracts/notes-architecture-v1.md",
    "---",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "modules:",
    "  - id: core",
    "    path: src/",
    "    roleId: dev",
    "  - id: env-resources",
    "    paths: [package.json, scripts/, vite.config.js]",
    "    roleId: env-bootstrap",
    "  - id: readme",
    "    paths: [README.md]",
    "    roleId: doc",
    "  - id: entry-index",
    "    path: index.html",
    "    roleId: env-bootstrap",
    "roles:",
    "  - id: dev",
    "    modules: [core]",
    "  - id: doc",
    "    modules: [readme]",
    "  - id: env-bootstrap",
    "    modules: [env-resources, entry-index]",
    "management: [convener, dev, doc, env-bootstrap]",
    "```",
  ];
  const parsed = parseProjectRoster(base.join("\n"));
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "dev"), ["src/"]);
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "env-bootstrap"), ["package.json", "scripts/", "vite.config.js", "index.html"]);
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "doc"), ["README.md"]);
  }
  const contained = base.join("\n").replace("    paths: [package.json, scripts/, vite.config.js]", "    paths: [src/package.json]");
  const c = parseProjectRoster(contained);
  assert.equal(c.ok, false);
  if (!c.ok) assert.equal(c.code, "roster-module-directory-overlap");
  const equal = base.join("\n").replace("    paths: [package.json, scripts/, vite.config.js]", "    paths: [README.md]");
  const e = parseProjectRoster(equal);
  assert.equal(e.ok, false);
  if (!e.ok) assert.equal(e.code, "roster-module-directory-overlap");
});

test("env-bootstrap 领域中立：非代码写作项目（assets/ 资源 + index.md 索引）", () => {
  const text = [
    "---",
    "schema: project-roster/v3",
    "flowId: essay",
    "version: 1",
    "intent: docs/product/essay-intent-v1.md",
    "proposal: docs/proposals/essay-proposal-v1.md",
    "architecture: docs/contracts/essay-architecture-v1.md",
    "roles:",
    "  - id: writer",
    "    displayName: 撰写",
    "    purpose: 写作",
    "    capability: writing",
    "    modules: [content]",
    "  - id: env-bootstrap",
    "    displayName: 装配/入口",
    "    purpose: 资源与索引",
    "    capability: assembly",
    "    modules: [env-resources, entry-index]",
    "modules:",
    "  - id: content",
    "    name: 正文",
    "    purpose: 撰写正文",
    "    path: content/",
    "    category: core",
    "    publicContract: content/",
    "    architectureSource: docs/contracts/essay-architecture-v1.md",
    "  - id: env-resources",
    "    name: 资源",
    "    purpose: 图片与素材",
    "    path: assets/",
    "    category: env",
    "    publicContract: assets/",
    "    architectureSource: docs/contracts/essay-architecture-v1.md",
    "  - id: entry-index",
    "    name: 索引",
    "    purpose: 入口索引",
    "    path: index.md",
    "    category: entry",
    "    publicContract: index.md",
    "    architectureSource: docs/contracts/essay-architecture-v1.md",
    "---",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "modules:",
    "  - id: content",
    "    path: content/",
    "    roleId: writer",
    "  - id: env-resources",
    "    path: assets/",
    "    roleId: env-bootstrap",
    "  - id: entry-index",
    "    path: index.md",
    "    roleId: env-bootstrap",
    "roles:",
    "  - id: writer",
    "    modules: [content]",
    "  - id: env-bootstrap",
    "    modules: [env-resources, entry-index]",
    "management: [convener, writer, env-bootstrap]",
    "```",
  ].join("\n");
  const parsed = parseProjectRoster(text);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "env-bootstrap"), ["assets/", "index.md"]);
  }
  // category=env 的模块不能归其他角色。
  const misowned = text.replace("    modules: [content]", "    modules: [content, env-resources]").replace("    modules: [env-resources, entry-index]", "    modules: [entry-index]");
  const bad = parseProjectRoster(misowned);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(["roster-module-owner-invalid", "roster-env-bootstrap-invalid"].includes(bad.code));
});

test("设计 v2.22 §5.2 示例 roster 可直接被 parser 接受（完整路径正例）", async () => {
  const designPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/planning/2026-10-29_design-workflow-maintainers-hiring.md");
  const design = await fs.readFile(designPath, "utf8");
  const start = design.indexOf("````markdown");
  const end = design.indexOf("````", start + "````markdown".length);
  assert.ok(start >= 0 && end > start, "设计文档应含四个反引号的 markdown 示例块");
  const example = design.slice(start + "````markdown".length, end).trimStart();
  const parsed = parseProjectRoster(example);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
  if (parsed.ok) {
    assert.deepEqual(rosterDirectoriesFor(parsed.roster, "env-bootstrap"), ["templates/", "assets/", "references/", "index.md", "catalog/"]);
  }
  // 固定模块 id 不可替换：env-resources 改名后必须拒绝。
  const renamed = parseProjectRoster(example.replaceAll("env-resources", "env-setup"));
  assert.equal(renamed.ok, false);
  if (!renamed.ok) assert.equal(renamed.code, "roster-env-bootstrap-invalid");
  // 固定模块 category 必须为 env/entry。
  const wrongCategory = parseProjectRoster(example.replace("category: env", "category: core"));
  assert.equal(wrongCategory.ok, false);
  if (!wrongCategory.ok) assert.equal(wrongCategory.code, "roster-env-bootstrap-invalid");
});

test("envBootstrap 对象语义：旧扁平字段读时归一化；omitted=true 必须有非空理由", () => {
  const legacy = parseProjectRoster(ROSTER_TEXT.replace(
    "envBootstrap:\n  omitted: true\n  omissionReason: 测试夹具省略装配/入口角色\n",
    "envBootstrapOmittedReason: 旧扁平理由\n",
  ));
  assert.equal(legacy.ok, true, legacy.ok ? "" : legacy.reason);
  if (legacy.ok) assert.deepEqual(legacy.roster.envBootstrap, { omitted: true, omissionReason: "旧扁平理由" });
  const noReason = parseProjectRoster(ROSTER_TEXT.replace("  omissionReason: 测试夹具省略装配/入口角色\n", ""));
  assert.equal(noReason.ok, false);
  if (!noReason.ok) assert.equal(noReason.code, "roster-env-bootstrap-invalid");
});

test("固定模块 paths[] 上限 1–20：20 条接受，21 条拒绝并提示重出", () => {
  const build = (paths: string[]): string => [
    "---",
    "schema: project-modules/v2",
    "flowId: limits",
    "version: 1",
    "modules:",
    "  - id: env-resources",
    "    name: 环境资源",
    "    purpose: 资源与配置",
    `    paths: [${paths.join(", ")}]`,
    "    category: env",
    "    publicContract: assets/",
    "    architectureSource: docs/contracts/limits-architecture-v1.md",
    "---",
  ].join("\n");
  const paths20 = Array.from({ length: 20 }, (_, index) => `assets/p${index + 1}/`);
  const ok = parseProjectModules(build(paths20), "limits");
  assert.equal(ok.ok, true, ok.ok ? "" : ok.reason);
  if (ok.ok) assert.equal(ok.doc.modules[0]!.paths.length, 20);
  const tooMany = parseProjectModules(build([...paths20, "assets/p21/"]), "limits");
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) {
    assert.equal(tooMany.code, "modules-doc-directory");
    assert.match(tooMany.reason, /1–20/);
  }
});

test("2026-10-30（3.1）：run 不阻断——缺 run/草案/roles 降级 advisory", () => {
  const noRun = evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"], run: undefined, runFacts: { ledgerUnavailable: true } }));
  assert.equal(noRun.ok, true);
  if (noRun.ok) assert.ok(noRun.advisories.some((a) => a.code === "run-ledger-unavailable"));
  const draftHandoff = evaluateDispatchPreflight(preflight({ targetRoleId: "convener", d3Selected: ["implementer"], run: { state: "draft", runId: "run-20261030-focus-draft" } }));
  assert.equal(draftHandoff.ok, true, "交付前 preflight 允许 draft；会话层在 task.created 前 pin");
  if (draftHandoff.ok) assert.ok(draftHandoff.advisories.some((a) => a.code === "run-pin-required"));
  const implDraft = evaluateDispatchPreflight(preflight({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, handoffFound: true,
    d3Selected: ["implementer"],
    run: { state: "draft", runId: "run-20261030-focus-draft", roles: ["implementer"] },
  }));
  assert.equal(implDraft.ok, true);
  if (implDraft.ok) assert.ok(implDraft.advisories.some((a) => a.code === "run-pin-required"));
  const roleMissing = evaluateDispatchPreflight(preflight({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, handoffFound: true,
    d3Selected: ["implementer"],
    run: { state: "pinned", runId: "run-20261030-focus-pinned", roles: ["qa"] },
  }));
  assert.equal(roleMissing.ok, true);
  if (roleMissing.ok) assert.ok(roleMissing.advisories.some((a) => a.code === "run-role-missing"));
  // R2 组合：pin 失败且 run 仍 draft → 两个 code 同时存在，顺序固定。
  const pinFailed = evaluateDispatchPreflight(preflight({
    targetRoleId: "convener", d3Selected: ["implementer"],
    run: { state: "draft", runId: "run-20261030-focus-draft" },
    runFacts: { pinFailed: true },
  }));
  assert.equal(pinFailed.ok, true);
  if (pinFailed.ok) {
    const codes = pinFailed.advisories.map((a) => a.code);
    assert.ok(codes.includes("run-pin-failed"));
    assert.ok(codes.includes("run-pin-required"));
    assert.ok(codes.indexOf("run-pin-failed") < codes.indexOf("run-pin-required"));
  }
});

test("R2（P1.3）：legacy run 只读——受理 + run-legacy-readonly advisory", () => {
  const legacy = evaluateDispatchPreflight(preflight({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, handoffFound: true,
    d3Selected: ["implementer"], run: { state: "legacy" },
  }));
  assert.equal(legacy.ok, true);
  if (legacy.ok) {
    assert.ok(legacy.advisories.some((a) => a.code === "run-legacy-readonly"));
    assert.equal(legacy.advisories.some((a) => a.code === "run-pin-required"), false);
  }
});

test("targetExists 兼容窗口：复合入口回退 targetCardFound；窄入口显式必填", () => {
  const missing = evaluateDispatchPreflight(preflight({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false,
    targetExists: undefined, targetCardFound: false, handoffFound: true, d3Selected: ["implementer"],
  }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "target-card-missing");
  const present = evaluateDispatchPreflight(preflight({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false,
    targetExists: undefined, targetCardFound: true, handoffFound: true, d3Selected: ["implementer"],
  }));
  assert.equal(present.ok, true);
  const explicitFalse = evaluateDispatchAuthorization({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false,
    targetExists: false, chiefRoleId: "chief", convenerRoleId: "convener",
  });
  assert.equal(explicitFalse.ok, false);
  if (!explicitFalse.ok) assert.equal(explicitFalse.code, "target-card-missing");
  const explicitTrue = evaluateDispatchAuthorization({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false,
    targetExists: true, chiefRoleId: "chief", convenerRoleId: "convener",
  });
  assert.equal(explicitTrue.ok, true);
  const convenerWithNullChief = evaluateDispatchAuthorization({
    fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false,
    targetExists: true, chiefRoleId: null, convenerRoleId: "convener",
  });
  assert.equal(convenerWithNullChief.ok, true);
});

test("evaluateDispatchAuthorization：硬矩阵（自派/来源/allowlist/运营类型与存在性）", () => {
  const base = {
    fromRoleId: "chief",
    targetRoleId: "product",
    targetBuiltIn: true,
    targetExists: true,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
  } as const;
  const self = evaluateDispatchAuthorization({ ...base, targetRoleId: "chief" });
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");
  const unknown = evaluateDispatchAuthorization({ ...base, fromRoleId: "rapporteur" });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "unknown-source");
  const chiefToWorker = evaluateDispatchAuthorization({ ...base, targetRoleId: "implementer", targetBuiltIn: false });
  assert.equal(chiefToWorker.ok, false);
  if (!chiefToWorker.ok) assert.equal(chiefToWorker.code, "chief-to-project-forbidden");
  const chiefToSu = evaluateDispatchAuthorization({ ...base, targetRoleId: "su" });
  assert.equal(chiefToSu.ok, false);
  if (!chiefToSu.ok) assert.equal(chiefToSu.code, "target-card-missing");
  const convenerToProduct = evaluateDispatchAuthorization({ ...base, fromRoleId: "convener", targetRoleId: "product" });
  assert.equal(convenerToProduct.ok, false);
  if (!convenerToProduct.ok) assert.equal(convenerToProduct.code, "convener-target-forbidden");
  const convenerToChief = evaluateDispatchAuthorization({ ...base, fromRoleId: "convener", targetRoleId: "chief" });
  assert.equal(convenerToChief.ok, false);
  if (!convenerToChief.ok) assert.equal(convenerToChief.code, "convener-target-forbidden");
  const convenerMissingWorker = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, targetExists: false,
  });
  assert.equal(convenerMissingWorker.ok, false);
  if (!convenerMissingWorker.ok) assert.equal(convenerMissingWorker.code, "target-card-missing");
  const convenerExistingWorker = evaluateDispatchAuthorization({
    ...base, fromRoleId: "convener", targetRoleId: "implementer", targetBuiltIn: false, targetExists: true,
  });
  assert.equal(convenerExistingWorker.ok, true);
  const convenerVerifier = evaluateDispatchAuthorization({ ...base, fromRoleId: "convener", targetRoleId: "verifier" });
  assert.equal(convenerVerifier.ok, true);
});

// —————————————————————— contractSchemaText / 示例 / 逐字段错误（2026-11-03） ——————————————————————

function replaceModuleField(text: string, field: string, line: string | undefined): string {
  const lines = text.split("\n");
  const index = lines.findIndex((candidate) => candidate.startsWith(`    ${field}: `));
  assert.ok(index >= 0, `模块字段行缺失：${field}`);
  if (line === undefined) lines.splice(index, 1);
  else lines[index] = `    ${line}`;
  return lines.join("\n");
}

const FIELD_VALUES: Array<{ label: string; line: string | undefined; received: string }> = [
  { label: "missing", line: undefined, received: "未提供" },
  { label: "null", line: "null", received: "null" },
  { label: "empty", line: '""', received: "string（空）" },
  { label: "boolean", line: "false", received: "boolean: false" },
  { label: "number", line: "42", received: "number: 42" },
  { label: "array", line: "[]", received: "array(0)" },
  { label: "object", line: "{}", received: "object（mapping）" },
];

test("AC-1/AC-2：三示例经真实 parser 通过、跨示例 modules[] 一致、topology 单一来源", () => {
  const modules = parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE, "demo");
  assert.equal(modules.ok, true, modules.ok ? "" : modules.reason);
  const roster = parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo");
  assert.equal(roster.ok, true, roster.ok ? "" : roster.reason);
  if (modules.ok && roster.ok) {
    assert.equal(modules.doc.schema, PROJECT_MODULES_SCHEMA);
    assert.equal(roster.roster.schema, PROJECT_ROSTER_SCHEMA);
    assert.deepEqual(modules.doc.modules, roster.roster.modules);
  }
  assert.equal(PROJECT_ROSTER_SCHEMA_EXAMPLE.includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE), true);
  assert.equal(contractSchemaText("modules").includes(PROJECT_MODULES_SCHEMA_EXAMPLE), true);
  assert.equal(contractSchemaText("roster").includes(PROJECT_ROSTER_SCHEMA_EXAMPLE), true);
  assert.equal(contractSchemaText("topology").includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE), true);
});

test("AC-3+P1-CSQ-03：三块文本字节预算、完整字段表/示例、无字面 taskKind 且第二行无 flowId/moduleId", () => {
  const texts = {
    modules: contractSchemaText("modules"),
    roster: contractSchemaText("roster"),
    topology: contractSchemaText("topology"),
  };
  for (const [topic, text] of Object.entries(texts)) {
    assert.ok(Buffer.byteLength(text, "utf8") <= 4096, `${topic} schema 文本必须 ≤4096 B`);
    const lines = text.split("\n");
    assert.equal(lines[0], `contract_check topic=${topic}（只读 schema；查询不构成放行/授权）`);
    assert.equal(lines[1], "（仅 schema 与示例；不含 run/写区；其余参数被忽略）");
    assert.equal(text.includes("taskKind"), false, `${topic} 全文不得含字面 taskKind`);
    assert.equal(lines[1]!.includes("flowId"), false);
    assert.equal(lines[1]!.includes("moduleId"), false);
  }
  assert.ok(Buffer.byteLength(texts.roster, "utf8") <= 3900, "roster schema 文本必须 ≤3900 B");
  assert.match(texts.modules, /modules\[\] 每项/);
  assert.match(texts.roster, /加载校验（硬拒绝；解析器之外）/);
  assert.match(texts.topology, /块顶层/);
  assert.ok(texts.modules.includes("<flowId>"));
  assert.ok(texts.roster.includes("<flowId>"));
});

test("AC-17：每 topic 的 schema 常量恰好 3 行且等于常量拼出的期望行", () => {
  const cases = [
    {
      topic: "modules" as const,
      constant: PROJECT_MODULES_SCHEMA,
      expected: [
        `文档：docs/proposals/<flowId>-modules-vN.md（唯一权威源；schema 必须恰为 ${PROJECT_MODULES_SCHEMA}）`,
        `- schema: 字面量 ${PROJECT_MODULES_SCHEMA}`,
        `schema: ${PROJECT_MODULES_SCHEMA}`,
      ],
    },
    {
      topic: "roster" as const,
      constant: PROJECT_ROSTER_SCHEMA,
      expected: [
        `文档：docs/proposals/<flowId>-roster-vN.md（schema 须为 ${PROJECT_ROSTER_SCHEMA} 或 project-roster/v4；modules[] 是 modules 文档的派生快照，加载时逐项比对）`,
        `- schema: ${PROJECT_ROSTER_SCHEMA} 或 project-roster/v4（v4 仅增可选 roles[].review）`,
        `schema: ${PROJECT_ROSTER_SCHEMA}`,
      ],
    },
    {
      topic: "topology" as const,
      constant: PROJECT_TOPOLOGY_SCHEMA,
      expected: [
        `位置：roster 正文「人员+模块拓扑图」章节内的 \`\`\`topology YAML 块（唯一机器可读格式；schema 必须恰为 ${PROJECT_TOPOLOGY_SCHEMA}）。`,
        `- schema: 字面量 ${PROJECT_TOPOLOGY_SCHEMA}`,
        `schema: ${PROJECT_TOPOLOGY_SCHEMA}`,
      ],
    },
  ];
  for (const item of cases) {
    const lines = contractSchemaText(item.topic).split("\n").filter((line) => line.includes(item.constant));
    assert.deepEqual(lines, item.expected, item.topic);
  }
});

test("AC-18：roster schema 文本含三条警告与占位 omissionReason", () => {
  const roster = contractSchemaText("roster");
  assert.match(roster, /警告：示例只保证解析器通过/);
  assert.match(roster, /警告：默认项目不要照抄省略块/);
  assert.match(roster, /警告：占位 omissionReason 必须替换，不得原样提交/);
  assert.match(roster, /omissionReason: <小项目省略理由；默认项目不要照抄>/);
});

test("AC-9 roster 侧：四字段逐字段错误矩阵与 purpose/responsibility 语义", () => {
  const fields = ["name", "purpose", "publicContract", "architectureSource"] as const;
  for (const field of fields) {
    for (const value of FIELD_VALUES) {
      if (field === "purpose" && value.label === "null") continue;
      const text = replaceModuleField(
        PROJECT_ROSTER_SCHEMA_EXAMPLE,
        field,
        value.line === undefined ? undefined : `${field}: ${value.line}`,
      );
      const parsed = parseProjectRoster(text, "demo");
      assert.equal(parsed.ok, false, `${field}/${value.label} 必须被拒绝`);
      if (!parsed.ok) {
        assert.equal(parsed.code, "roster-module-fields-missing", `${field}/${value.label}`);
        assert.match(parsed.reason, new RegExp(`名单模块第 1 项（id=core）的 ${field} 必须是非空字符串`));
        assert.ok(parsed.reason.includes(value.received), `${field}/${value.label}: ${parsed.reason}`);
      }
    }
  }
  const purposeNull = parseProjectRoster(replaceModuleField(PROJECT_ROSTER_SCHEMA_EXAMPLE, "purpose", "purpose: null"), "demo");
  assert.equal(purposeNull.ok, false);
  if (!purposeNull.ok) {
    assert.equal(purposeNull.code, "roster-module-fields-missing");
    assert.ok(purposeNull.reason.includes("未提供"), purposeNull.reason);
  }
  const alias = parseProjectRoster(replaceModuleField(PROJECT_ROSTER_SCHEMA_EXAMPLE, "purpose", "responsibility: 兼容职责"), "demo");
  assert.equal(alias.ok, true, alias.ok ? "" : alias.reason);
  const purposeTrue = parseProjectRoster(replaceModuleField(PROJECT_ROSTER_SCHEMA_EXAMPLE, "purpose", "purpose: true"), "demo");
  assert.equal(purposeTrue.ok, false);
  if (!purposeTrue.ok) {
    assert.equal(purposeTrue.code, "roster-module-fields-missing");
    assert.match(purposeTrue.reason, /purpose 必须是非空字符串（收到 boolean: true）/);
  }
  const emptyWithAlias = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("    purpose: 核心逻辑与公开接口", '    purpose: ""\n    responsibility: 有效职责'),
    "demo",
  );
  assert.equal(emptyWithAlias.ok, false);
  if (!emptyWithAlias.ok) {
    assert.equal(emptyWithAlias.code, "roster-module-fields-missing");
    assert.match(emptyWithAlias.reason, /string（空）/);
  }
});

test("AC-9 modules 文档侧：四字段逐字段错误矩阵与 purpose/responsibility 语义", () => {
  const fields = ["name", "purpose", "publicContract", "architectureSource"] as const;
  for (const field of fields) {
    for (const value of FIELD_VALUES) {
      if (field === "purpose" && value.label === "null") continue;
      const text = replaceModuleField(
        PROJECT_MODULES_SCHEMA_EXAMPLE,
        field,
        value.line === undefined ? undefined : `${field}: ${value.line}`,
      );
      const parsed = parseProjectModules(text, "demo");
      assert.equal(parsed.ok, false, `${field}/${value.label} 必须被拒绝`);
      if (!parsed.ok) {
        assert.equal(parsed.code, "modules-doc-fields", `${field}/${value.label}`);
        assert.match(parsed.reason, new RegExp(`模块清单第 1 项（id=core）的 ${field} 必须是非空字符串`));
        assert.ok(parsed.reason.includes(value.received), `${field}/${value.label}: ${parsed.reason}`);
      }
    }
  }
  const purposeNull = parseProjectModules(replaceModuleField(PROJECT_MODULES_SCHEMA_EXAMPLE, "purpose", "purpose: null"), "demo");
  assert.equal(purposeNull.ok, false);
  if (!purposeNull.ok) {
    assert.equal(purposeNull.code, "modules-doc-fields");
    assert.ok(purposeNull.reason.includes("未提供"), purposeNull.reason);
  }
  const alias = parseProjectModules(replaceModuleField(PROJECT_MODULES_SCHEMA_EXAMPLE, "purpose", "responsibility: 兼容职责"), "demo");
  assert.equal(alias.ok, true, alias.ok ? "" : alias.reason);
  const purposeTrue = parseProjectModules(replaceModuleField(PROJECT_MODULES_SCHEMA_EXAMPLE, "purpose", "purpose: true"), "demo");
  assert.equal(purposeTrue.ok, false);
  if (!purposeTrue.ok) {
    assert.equal(purposeTrue.code, "modules-doc-fields");
    assert.match(purposeTrue.reason, /purpose 必须是非空字符串（收到 boolean: true）/);
  }
  const emptyWithAlias = parseProjectModules(
    PROJECT_MODULES_SCHEMA_EXAMPLE.replace("    purpose: 核心逻辑与公开接口", '    purpose: ""\n    responsibility: 有效职责'),
    "demo",
  );
  assert.equal(emptyWithAlias.ok, false);
  if (!emptyWithAlias.ok) {
    assert.equal(emptyWithAlias.code, "modules-doc-fields");
    assert.match(emptyWithAlias.reason, /string（空）/);
  }
});

test("AC-10+P1-CSQ-05/06：topology management 文案、错误码、多余 id/非字符串宽容读取与空串显示", () => {
  const mapping = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", "management:\n  roles: [convener, implementer]"),
    "demo",
  );
  assert.equal(mapping.ok, false);
  if (!mapping.ok) {
    assert.equal(mapping.code, "roster-topology-mismatch");
    for (const token of ["写作格式", "扁平字符串数组", "management.roles", "object（mapping）"]) {
      assert.ok(mapping.reason.includes(token), `${token}: ${mapping.reason}`);
    }
  }
  const missingRole = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", "management: [convener]"),
    "demo",
  );
  assert.equal(missingRole.ok, false);
  if (!missingRole.ok) {
    assert.equal(missingRole.code, "roster-topology-mismatch");
    assert.match(missingRole.reason, /缺项目角色 implementer/);
    assert.ok(missingRole.reason.includes("扁平"));
  }
  const extraId = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", "management: [convener, implementer, extra]"),
    "demo",
  );
  assert.equal(extraId.ok, true, extraId.ok ? "" : extraId.reason);
  const nonString = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", "management: [convener, implementer, 5]"),
    "demo",
  );
  assert.equal(nonString.ok, true, nonString.ok ? "" : nonString.reason);
  const empty = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("management: [convener, implementer]", 'management: ""'),
    "demo",
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "roster-topology-mismatch");
    assert.match(empty.reason, /string（空）/);
  }
  const v1 = parseProjectRoster(
    PROJECT_ROSTER_SCHEMA_EXAMPLE.replace(`schema: ${PROJECT_TOPOLOGY_SCHEMA}`, "schema: project-topology/v1"),
    "demo",
  );
  assert.equal(v1.ok, false);
  if (!v1.ok) {
    assert.equal(v1.code, "roster-topology-mismatch");
    assert.ok(v1.reason.includes("扁平数组"));
    assert.ok(v1.reason.includes("roleId"));
    assert.equal(v1.reason.includes("management.roles 含 convener"), false);
  }
});

async function writeDemoProject(root: string): Promise<void> {
  for (const dir of ["docs/product", "docs/proposals", "docs/contracts"]) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
  }
  await fs.writeFile(path.join(root, "docs/product/demo-intent-v1.md"), "# 意图\n", "utf8");
  await fs.writeFile(
    path.join(root, "docs/proposals/demo-proposal-v1.md"),
    "---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\n---\n# 提案\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "docs/contracts/demo-architecture-v1.md"),
    "# 架构\n\nproposal: docs/proposals/demo-proposal-v1.md\n",
    "utf8",
  );
  await fs.writeFile(path.join(root, "docs/proposals/demo-modules-v1.md"), PROJECT_MODULES_SCHEMA_EXAMPLE, "utf8");
  await fs.writeFile(path.join(root, "docs/proposals/demo-roster-v1.md"), PROJECT_ROSTER_SCHEMA_EXAMPLE, "utf8");
}

test("AC-15+P1-CSQ-04：loadLatestRoster 正例用两示例常量；drift/stale/inconsistent/missing/modules-doc-missing 五负例", async () => {
  const roots: string[] = [];
  const makeRoot = async (mutate?: (root: string) => Promise<void>): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-schema-demo-"));
    roots.push(root);
    await writeDemoProject(root);
    if (mutate !== undefined) await mutate(root);
    return root;
  };
  try {
    const okRoot = await makeRoot();
    const ok = await loadLatestRoster({ projectRoot: okRoot, flowId: "demo" });
    assert.equal(ok.ok, true, ok.ok ? "" : ok.reason);

    const driftRoot = await makeRoot(async (root) => {
      await fs.writeFile(
        path.join(root, "docs/proposals/demo-roster-v1.md"),
        PROJECT_ROSTER_SCHEMA_EXAMPLE.replace("purpose: 核心逻辑与公开接口", "purpose: 漂移职责"),
        "utf8",
      );
    });
    const drift = await loadLatestRoster({ projectRoot: driftRoot, flowId: "demo" });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "roster-modules-drift", drift.reason);

    const staleRoot = await makeRoot(async (root) => {
      await fs.writeFile(path.join(root, "docs/product/demo-intent-v2.md"), "# 意图 v2\n", "utf8");
    });
    const stale = await loadLatestRoster({ projectRoot: staleRoot, flowId: "demo" });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "roster-reference-stale", stale.reason);

    const inconsistentRoot = await makeRoot(async (root) => {
      await fs.writeFile(
        path.join(root, "docs/proposals/demo-proposal-v1.md"),
        "---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\n---\n# 提案（漏引用）\n",
        "utf8",
      );
    });
    const inconsistent = await loadLatestRoster({ projectRoot: inconsistentRoot, flowId: "demo" });
    assert.equal(inconsistent.ok, false);
    if (!inconsistent.ok) assert.equal(inconsistent.code, "roster-reference-inconsistent", inconsistent.reason);

    const missingRoot = await makeRoot(async (root) => {
      await fs.rm(path.join(root, "docs/product/demo-intent-v1.md"));
    });
    const missing = await loadLatestRoster({ projectRoot: missingRoot, flowId: "demo" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "roster-reference-missing", missing.reason);

    const noModulesRoot = await makeRoot(async (root) => {
      await fs.rm(path.join(root, "docs/proposals/demo-modules-v1.md"));
    });
    const noModules = await loadLatestRoster({ projectRoot: noModulesRoot, flowId: "demo" });
    assert.equal(noModules.ok, false);
    if (!noModules.ok) assert.equal(noModules.code, "roster-modules-doc-missing", noModules.reason);
  } finally {
    for (const root of roots) await fs.rm(root, { recursive: true, force: true });
  }
});
