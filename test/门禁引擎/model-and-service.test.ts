// 门禁引擎测试：Model 结构、边界文档解析、Service 公开入口（resolveBoundary / resolveRole）
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBoundarySection1 } from "../../src/common/门禁引擎/boundary-parse.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";

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
