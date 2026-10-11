// 门禁引擎测试：YAML 边界固定格式（严格校验，fail-closed）与 Markdown 回退
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBoundaryYaml } from "../../src/common/门禁引擎/boundary-yaml.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";

const ROOT = mkdtempSync(join(tmpdir(), "yaml-"));
const PROJ = join(ROOT, "proj");
mkdirSync(PROJ, { recursive: true });
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const VALID = [
  "role: 编排",
  "entries:",
  "  - kind: file",
  "    path: src/interface/cli/run.ts",
  "    purpose: ans role run 命令",
  "  - kind: directory",
  "    path: src/common/编排",
  "    purpose: 本角色私有辅助代码",
  "  - kind: conditional-directory",
  "    path: 角色卡/编排/docs/design",
  "    condition: role-restructuring",
  "    purpose: 设计记录",
].join("\n");

test("YAML 合法：解析出三条，root 缺省 project，condition 保留", () => {
  const es = parseBoundaryYaml(VALID);
  assert.equal(es.length, 3);
  assert.deepEqual(
    es.map((e) => e.kind),
    ["file", "directory", "conditional-directory"],
  );
  assert.equal(es[0].root, "project");
  assert.equal(es[0].path, "src/interface/cli/run.ts");
  assert.equal(es[2].condition, "role-restructuring");
});

test("YAML：root 可显式指定 skill", () => {
  const es = parseBoundaryYaml("entries:\n  - kind: file\n    path: SKILL.md\n    purpose: x\n    root: skill\n");
  assert.equal(es[0].root, "skill");
});

// ---- 非法 YAML：各自导致整体解析失败（抛错） ----
test("YAML 非法：语法错误 → 抛错", () => {
  assert.throws(() => parseBoundaryYaml("entries:\n  - kind: file\n  bad: [1, 2"));
});

test("YAML 非法：未知顶层键 → 抛错", () => {
  assert.throws(() => parseBoundaryYaml("entries: []\nfoo: bar\n"));
});

test("YAML 非法：未知 kind → 抛错", () => {
  assert.throws(() => parseBoundaryYaml("entries:\n  - kind: banana\n    path: x\n    purpose: y\n"));
});

test("YAML 非法：缺 path → 抛错", () => {
  assert.throws(() => parseBoundaryYaml("entries:\n  - kind: file\n    purpose: y\n"));
});

test("YAML 非法：缺 purpose → 抛错", () => {
  assert.throws(() => parseBoundaryYaml("entries:\n  - kind: file\n    path: x\n"));
});

test("YAML 非法：conditional-directory 缺 condition → 抛错", () => {
  assert.throws(() =>
    parseBoundaryYaml("entries:\n  - kind: conditional-directory\n    path: x\n    purpose: y\n"),
  );
});

test("YAML 非法：condition slug 非法 → 抛错", () => {
  assert.throws(() =>
    parseBoundaryYaml(
      "entries:\n  - kind: conditional-directory\n    path: x\n    purpose: y\n    condition: Bad Slug\n",
    ),
  );
});

test("YAML 非法：条目含未知键 → 抛错", () => {
  assert.throws(() =>
    parseBoundaryYaml("entries:\n  - kind: file\n    path: x\n    purpose: y\n    extra: z\n"),
  );
});

// ---- 端到端：非法 YAML → 视为未接受 + parseError；resolveWrite 全拒 ----
test("resolveBoundary：非法 YAML → 未接受且带 parseError；resolveWrite 理由含边界解析失败", async () => {
  writeFileSync(join(PROJ, "bad.yaml"), "entries:\n  - kind: nope\n    path: x\n    purpose: y\n");
  const project = {
    projectRoot: PROJ,
    skillRoot: ROOT,
    roles: { r: { card: "x", boundary: "bad.yaml" } },
    governanceBoundary: { path: "bad.yaml", acceptance: { accepted: true, source: "demo" } },
  };
  const b = await resolveBoundary("r", project);
  assert.equal(b.acceptance.accepted, false);
  assert.ok(typeof b.parseError === "string" && b.parseError.length > 0);
  const d = resolveWrite("src/a.ts", b, { writeSet: ["src/a.ts"], conditions: [] }, { skillRoot: ROOT, projectRoot: PROJ });
  assert.equal(d.allowed, false);
  assert.match(d.reason, /边界解析失败/);
});

// ---- 端到端：合法 YAML 的 file/directory/条件目录判定 ----
test("resolveBoundary+resolveWrite：合法 YAML 三条路径判定正确", async () => {
  const yaml = [
    "entries:",
    "  - kind: file",
    "    path: src/a.ts",
    "    purpose: t",
    "  - kind: directory",
    "    path: src/common",
    "    purpose: t",
    "  - kind: conditional-directory",
    "    path: docs/design",
    "    condition: role-restructuring",
    "    purpose: t",
  ].join("\n");
  writeFileSync(join(PROJ, "good.yaml"), yaml);
  const project = {
    projectRoot: PROJ,
    skillRoot: ROOT,
    roles: { r: { card: "x", boundary: "good.yaml" } },
    governanceBoundary: { path: "good.yaml", acceptance: { accepted: true, source: "demo" } },
  };
  const b = await resolveBoundary("r", project);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.parseError, undefined);
  const ctx = { skillRoot: ROOT, projectRoot: PROJ };

  // file 精确
  assert.equal(resolveWrite("src/a.ts", b, { writeSet: ["src/a.ts"], conditions: [] }, ctx).allowed, true);
  assert.equal(resolveWrite("src/other.ts", b, { writeSet: ["src/other.ts"], conditions: [] }, ctx).allowed, false);
  // directory
  assert.equal(resolveWrite("src/common/x.ts", b, { writeSet: ["src/common/x.ts"], conditions: [] }, ctx).allowed, true);
  // 条件目录：未声明条件 → 拒绝
  const d1 = resolveWrite("docs/design/x.md", b, { writeSet: ["docs/design/x.md"], conditions: [] }, ctx);
  assert.equal(d1.allowed, false);
  assert.match(d1.reason, /role-restructuring/);
  // 声明条件 → 放行
  assert.equal(
    resolveWrite("docs/design/x.md", b, { writeSet: ["docs/design/x.md"], conditions: ["role-restructuring"] }, ctx).allowed,
    true,
  );
  // 声明条件但不在 writeSet → 仍被 F4 拒绝
  assert.equal(
    resolveWrite("docs/design/x.md", b, { writeSet: ["other.md"], conditions: ["role-restructuring"] }, ctx).allowed,
    false,
  );
});

// ---- Markdown 回退 ----
test("Markdown 回退：.md 走 legacy 表格解析", async () => {
  writeFileSync(
    join(PROJ, "legacy.md"),
    [
      "## Section 1: 可修改文件与目录",
      "| 类型 | 可操作路径 | 用途 |",
      "| --- | --- | --- |",
      "| 单文件 | `src/legacy.ts` | t |",
    ].join("\n"),
  );
  const project = {
    projectRoot: PROJ,
    skillRoot: ROOT,
    roles: {},
    governanceBoundary: { path: "legacy.md", acceptance: { accepted: true, source: "demo" } },
  };
  const b = await resolveBoundary("r", project);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.parseError, undefined);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].path, "src/legacy.ts");
  assert.equal(b.entries[0].root, "project");
});
