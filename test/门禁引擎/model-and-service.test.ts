// 门禁引擎测试：Model 结构、边界文档解析、Service 公开入口（resolveBoundary / resolveRole）
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBoundarySection1 } from "../../src/common/门禁引擎/boundary-parse.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import {
  builtInRoleModuleOf,
  builtInRoleModules,
  resolveRole,
  validateRoleToolDeclaration,
} from "../../src/service/role/resolve-role.ts";
import {
  builtInRoleModuleOf as privateBuiltInRoleModuleOf,
  builtInRoleModules as privateBuiltInRoleModules,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { validateRoleToolDeclaration as privateValidateRoleToolDeclaration } from "../../src/common/门禁引擎/role-tool-registry.ts";
import { chiefRoleModule } from "../../src/common/roles/chief/index.ts";
import { convenerRoleModule } from "../../src/common/roles/convener/index.ts";
import { nominatorRoleModule } from "../../src/common/roles/nominator/index.ts";
import { productRoleModule } from "../../src/common/roles/product/index.ts";
import { rapporteurRoleModule } from "../../src/common/roles/rapporteur/index.ts";
import { verifierRoleModule } from "../../src/common/roles/verifier/index.ts";

const ROOT = mkdtempSync(join(tmpdir(), "svc-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(PROJ, { recursive: true });
mkdirSync(SKILL, { recursive: true });

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

test("Model：BoundarySection1 结构可构造且字段正确", () => {
  const section = {
    entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
    boundarySource: "角色卡/x/boundary.md",
    acceptance: { accepted: true, source: "demo" },
  };
  assert.equal(section.entries[0].kind, "file");
  assert.equal(section.acceptance.accepted, true);
});

test("parse：抽取 Section 1 表格，遇后续标题停止；条件目录带合法 slug", () => {
  const md = [
    "# 标题",
    "## Section 1: 可修改文件与目录",
    "| 类型 | 可操作路径 | 用途 |",
    "| --- | --- | --- |",
    "| 单文件 | `src/model/boundary.ts` | 边界类型 |",
    "| 目录（私有） | `src/common/门禁引擎/` | 私有辅助 |",
    "| 条件目录 `docs-bootstrap` | `docs/` | 脚手架 |",
    "## Section 2: 职责",
    "| 单文件 | `nope.ts` | 不应被抽取 |",
  ].join("\n");
  const es = parseBoundarySection1(md, "project");
  assert.equal(es.length, 3);
  assert.equal(es[0].kind, "file");
  assert.equal(es[0].path, "src/model/boundary.ts");
  assert.equal(es[1].kind, "directory");
  assert.equal(es[1].path, "src/common/门禁引擎");
  assert.equal(es[2].kind, "conditional-directory");
  assert.equal(es[2].condition, "docs-bootstrap");
  assert.equal(es[2].root, "project");
});

test("parse：条件目录缺合法 slug（仅散文）→ 解析失败，条目被丢弃", () => {
  const md = [
    "## Section 1: 可修改文件与目录",
    "| 类型 | 可操作路径 | 用途 |",
    "| --- | --- | --- |",
    "| 条件目录 | `docs/` | 仅当任务明确要求创建文档脚手架时适用 |",
    "| 单文件 | `src/a.ts` | t |",
  ].join("\n");
  const es = parseBoundarySection1(md, "project");
  assert.equal(es.length, 1);
  assert.equal(es[0].kind, "file");
});

test("parse：条件目录 slug 格式非法 → 解析失败，条目被丢弃", () => {
  const md = [
    "## Section 1: 可修改文件与目录",
    "| 类型 | 可操作路径 | 用途 |",
    "| --- | --- | --- |",
    "| 条件目录 `Docs Bootstrap` | `docs/` | x |",
    "| 单文件 | `src/a.ts` | t |",
  ].join("\n");
  const es = parseBoundarySection1(md, "project");
  assert.equal(es.length, 1);
  assert.equal(es[0].kind, "file");
});

test("resolveBoundary：项目覆盖（已接受）优先，用角色边界文件并标 project 根", async () => {
  writeFileSync(
    join(PROJ, "b.md"),
    ["# x", "## Section 1", "| 类型 | 可操作路径 | 用途 |", "| --- | --- | --- |", "| 单文件 | `src/a.ts` | t |"].join("\n"),
  );
  writeFileSync(join(PROJ, "role-card.md"), "# role card body");
  const project = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: { "编排": { card: "role-card.md", boundary: "b.md" } },
    governanceBoundary: { path: "gov.md", acceptance: { accepted: true, source: "demo:embedded-config" } },
  };
  const b = await resolveBoundary("编排", project);
  assert.equal(b.boundarySource, "b.md");
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, "demo:embedded-config");
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].root, "project");
});

test("resolveBoundary：无治理接受证据 → 内置且未接受", async () => {
  const project = { projectRoot: PROJ, skillRoot: SKILL, roles: {} };
  const b = await resolveBoundary("x", project);
  assert.equal(b.acceptance.accepted, false);
  assert.equal(b.acceptance.source, "");
  assert.match(b.boundarySource, /built-in/);
});

test("resolveRole：路径取自 project.roles（F8），含 cardText 与 boundary", async () => {
  writeFileSync(join(PROJ, "b2.md"), ["# x", "## Section 1", "| 类型 | 可操作路径 | 用途 |", "| --- | --- | --- |", "| 单文件 | `src/a.ts` | t |"].join("\n"));
  writeFileSync(join(PROJ, "rc.md"), "ROLE CARD BODY");
  const project = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: { "编排": { card: "rc.md", boundary: "b2.md" } },
    governanceBoundary: { path: "gov.md", acceptance: { accepted: true, source: "demo" } },
  };
  const role = await resolveRole("编排", project);
  assert.equal(role.kind, "project");
  assert.equal(role.location.boundary, "b2.md");
  assert.equal(role.location.card, "rc.md");
  assert.match(role.cardText, /ROLE CARD BODY/);
  assert.equal(role.boundary.boundarySource, "b2.md");
});

test("resolveRole：未配置角色 → 内置治理角色", async () => {
  const project = { projectRoot: PROJ, skillRoot: SKILL, roles: {} };
  const role = await resolveRole("内置治理", project);
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.boundary.acceptance.accepted, false);
});

test("X-R1–X-R6 Service 公共出口：完整角色模块 map / lookup 与 D1 工具声明校验同一绑定再导出（消费方不直连私有 common）", () => {
  // 同一绑定再导出，不复制实现（E0 §4.4 接口评审；X-R1 证据 §4、X-R2 证据 §5、X-R3 证据 §3、X-R4 证据 §3、X-R5 证据 §3、X-R6 证据 §3）。
  assert.equal(builtInRoleModuleOf, privateBuiltInRoleModuleOf);
  assert.equal(builtInRoleModules, privateBuiltInRoleModules);
  assert.equal(validateRoleToolDeclaration, privateValidateRoleToolDeclaration);
  // X-R6：六角色全部装配（完整 map 值 = 模块本体）；lookup 与 map 同一引用。
  assert.equal(builtInRoleModules.chief, chiefRoleModule);
  assert.equal(builtInRoleModules.product, productRoleModule);
  assert.equal(builtInRoleModules.rapporteur, rapporteurRoleModule);
  assert.equal(builtInRoleModules.nominator, nominatorRoleModule);
  assert.equal(builtInRoleModules.convener, convenerRoleModule);
  assert.equal(builtInRoleModules.verifier, verifierRoleModule);
  for (const id of ["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const) {
    assert.equal(builtInRoleModuleOf(id), builtInRoleModules[id]);
  }
  // su 与项目角色恒 undefined（不得自造兜底）。
  for (const unknown of ["su", "implementer", ""]) {
    assert.equal(builtInRoleModuleOf(unknown), undefined);
  }
  // D1 校验经公共出口可用：product 合法声明整单放行；越权/未知整单拒绝、不注入。
  assert.deepEqual(validateRoleToolDeclaration("product", ["submitVersionChange"]), {
    allow: true,
    tools: [{ id: "submitVersionChange", name: "submit_version_change" }],
    reasons: [],
  });
  const denied = validateRoleToolDeclaration("product", ["roleActivityLog"]);
  assert.equal(denied.allow, false);
  assert.deepEqual(denied.tools, []);
  assert.equal(denied.reasons[0]?.code, "role-tool-not-allowed");
  const unknown = validateRoleToolDeclaration("product", ["dispatch_task"]);
  assert.equal(unknown.allow, false);
  assert.deepEqual(unknown.tools, []);
  assert.equal(unknown.reasons[0]?.code, "role-tool-id-unknown");
});
