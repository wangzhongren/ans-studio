// test/桌面应用/project.test.ts
// 桌面窗口：项目/角色装配辅助的单测（纯逻辑；node --test 直接跑 .ts）。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildProjectConfig, readRoleDocsIndex, resolveSkillRoot, posixDirname } from "../../app/desktop/project.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

test("resolveSkillRoot：优先 ANS_SKILL_ROOT", () => {
  assert.equal(resolveSkillRoot({ ANS_SKILL_ROOT: "/x/skill" }), "/x/skill");
  assert.match(resolveSkillRoot({}), /ans-governed-construction$/);
});

test("posixDirname：取目录名", () => {
  assert.equal(posixDirname("角色卡/桌面应用/role-card.md"), "角色卡/桌面应用");
  assert.equal(posixDirname("a.txt"), "");
});

test("buildProjectConfig：由枚举结果构造角色表，acceptance 透传", async () => {
  const listing = await listProject(REPO_ROOT);
  // 归档事实（2026-10-14，同日演进——上午过渡做法「boundary.yaml 改名 .frozen ⇒ 跳过并提示」已按
  // 客户决定改为**归档键约定**：boundary.yaml 恢复原名、顶层 `archived: true`）：枚举**静默跳过**归档
  // 目录——零警告、不可开启（resolveRole 拒绝）、边界不予采用；活角色为「桌面UI」与「桌面窗口」两个。
  assert.deepEqual(listing.warnings, [], "枚举不应有任何警告（归档目录按归档键约定静默跳过、零提示）");
  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(cfg.projectRoot, listing.projectRoot);
  assert.equal(cfg.skillRoot, "/x/skill");
  const roleIds = Object.keys(cfg.roles);
  assert.ok(!roleIds.includes("桌面应用"), "归档的「桌面应用」不得再被登记进角色表");
  assert.ok(roleIds.includes("桌面窗口"), "应含 桌面窗口 角色");
  assert.ok(cfg.roles["桌面窗口"].card.endsWith("role-card.md"));
  assert.ok(cfg.roles["桌面窗口"].boundary.endsWith("boundary.yaml"));
  assert.ok(roleIds.includes("桌面UI"), "应含 桌面UI 角色（拆分的另一半）");
  assert.equal(cfg.governanceBoundary?.acceptance.accepted, true);
});

test("readRoleDocsIndex：列出 docs 目录并读到设计稿；读到 changelog.md", async () => {
  const idx = await readRoleDocsIndex(REPO_ROOT, "角色卡/桌面应用/role-card.md");
  assert.ok(idx.changelog, "应读到 changelog.md");
  assert.equal(idx.changelog!.path, "角色卡/桌面应用/changelog.md");
  assert.ok(idx.changelog!.text.includes("桌面应用"), "changelog 正文应含角色名");
  const designDir = idx.docs.find((d) => d.path === "docs/design" && d.kind === "directory");
  assert.ok(designDir, "应含 docs/design 目录项");
  const designFile = idx.docs.find((d) => d.path.startsWith("docs/design/") && d.kind === "file");
  assert.ok(designFile, "应含 docs/design 下的文件");
});

// —— 内置治理角色 su 贯穿「枚举 → ProjectConfig → 解析」全链 ——

test("su：枚举结果里排第一且标为内置，且不进 ProjectConfig 的 roles 映射", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.roles[0].roleId, "su");
  assert.equal(listing.roles[0].builtIn, true);

  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(cfg.roles["su"], undefined, "su 无角色目录，不得登记进 roles（否则会去读空路径）");
  assert.ok(cfg.roles["桌面窗口"], "项目角色照常登记");
  // 但 su 要登记进 builtInRoles：会话式入口（openRoleSession / 桌面聊天）据此允许开启它。
  assert.ok(cfg.builtInRoles?.includes("su"), "内置角色 su 应出现在 builtInRoles");
  // 项目角色不得混入 builtInRoles。
  assert.ok(!cfg.builtInRoles?.includes("桌面窗口"), "项目角色不得出现在 builtInRoles");
});

test("su：resolveRole 下沉为 built-in-governance，走内置边界、不抛错", async () => {
  const listing = await listProject(REPO_ROOT);
  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  const role = await resolveRole("su", cfg);
  assert.equal(role.kind, "built-in-governance");
  assert.match(role.cardText, /ANS Governance/);
  assert.match(role.boundarySource, /built-in/);
  // fail-closed：内置边界未接受，治理会话的一切写入都会被拒（契约 §0）。
  assert.equal(role.boundary.acceptance.accepted, false);
  assert.ok(role.boundary.entries.length > 0);
});
