// Model / Service 公开契约：协作组信息来自角色卡，仅供展示。
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectConfig, RoleGroupMetadata, RoleLocation } from "../../src/model/role.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = mkdtempSync(join(tmpdir(), "ans-role-group-"));
after(() => rmSync(ROOT, { recursive: true, force: true }));

let sequence = 0;
function project(): ProjectConfig {
  const projectRoot = join(ROOT, `project-${sequence++}`);
  mkdirSync(projectRoot);
  return { projectRoot, skillRoot: projectRoot, roles: {} };
}

const BOUNDARY = "entries:\n  - kind: directory\n    path: src/owned/\n    purpose: 'group: 边界用途不是角色组别'\n";
function role(config: ProjectConfig, roleId: string, cardText: string, boundary = BOUNDARY): RoleLocation {
  const relDir = `角色卡/${roleId}`;
  const directory = join(config.projectRoot, relDir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "role-card.md"), cardText);
  writeFileSync(join(directory, "boundary.yaml"), boundary);
  const location = { card: `${relDir}/role-card.md`, boundary: `${relDir}/boundary.yaml` };
  config.roles[roleId] = location;
  return location;
}

function assertAbsent(metadata: RoleGroupMetadata): void {
  assert.equal(Object.hasOwn(metadata, "group"), false);
  assert.equal(Object.hasOwn(metadata, "groupDuty"), false);
}

const EXPECTED_RUNTIME_GROUP = new Map([
  ["运行时核心", "组长"],
  ["Pi适配器", "组员"],
  ["Codex适配器", "组员"],
  ["Claude适配器", "组员"],
]);

test("listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.roles.filter((item) => item.builtIn !== true).length, 15);
  assert.equal(listing.roles[0].roleId, listing.primaryRoleId);
  assert.equal(listing.hasRoles, true);
  assert.deepEqual(listing.warnings, []);
  assert.equal(listing.roles.some((item) => item.roleId === "桌面应用"), false);
  for (const [roleId, groupDuty] of EXPECTED_RUNTIME_GROUP) {
    const summary = listing.roles.find((item) => item.roleId === roleId);
    assert.ok(summary, `未枚举 ${roleId}`);
    assert.equal(summary.group, "运行时接入组");
    assert.equal(summary.groupDuty, groupDuty);
    assert.equal(summary.boundary.acceptance.accepted, false);
  }
  const management = listing.roles.find((item) => item.roleId === "项目管理");
  assert.ok(management);
  assert.equal(management.group, "项目协调组");
  assert.equal(management.groupDuty, "组长");
  assertAbsent(listing.roles[0]);
  const legacy = listing.roles.find((item) => item.roleId === "门禁引擎");
  assert.ok(legacy);
  assertAbsent(legacy);
});

test("listProject：新增独立验收角色仅声明自身工作文档，不获得产品或同伴写权", async () => {
  const listing = await listProject(REPO_ROOT);
  const acceptance = listing.roles.find((item) => item.roleId === "独立验收");
  assert.ok(acceptance, "独立验收必须实际被枚举");
  assert.notEqual(acceptance.builtIn, true);
  assert.equal(acceptance.boundary.acceptance.accepted, false);
  assert.deepEqual(acceptance.boundary.entries.map(({ root, kind, path }) => ({ root, kind, path })), [
    { root: "project", kind: "file", path: "角色卡/独立验收/feature-map.md" },
    { root: "project", kind: "file", path: "角色卡/独立验收/memo.md" },
    { root: "project", kind: "file", path: "角色卡/独立验收/functional-description.md" },
    { root: "project", kind: "directory", path: "角色卡/独立验收/docs/design" },
    { root: "project", kind: "directory", path: "角色卡/独立验收/docs/change" },
    { root: "project", kind: "directory", path: "角色卡/独立验收/docs/fix" },
  ]);
});

test("listProject：新增宣传角色仅声明官网与自身文档，不获得产品或同伴写权", async () => {
  const listing = await listProject(REPO_ROOT);
  const publicity = listing.roles.find((item) => item.roleId === "宣传");
  assert.ok(publicity, "宣传必须实际被枚举");
  assert.notEqual(publicity.builtIn, true);
  assert.equal(publicity.boundary.acceptance.accepted, false);
  assert.deepEqual(publicity.boundary.entries.map(({ root, kind, path }) => ({ root, kind, path })), [
    { root: "project", kind: "directory", path: "site" },
    { root: "project", kind: "file", path: ".github/workflows/pages.yml" },
    { root: "project", kind: "file", path: "角色卡/宣传/feature-map.md" },
    { root: "project", kind: "file", path: "角色卡/宣传/memo.md" },
    { root: "project", kind: "file", path: "角色卡/宣传/changelog.md" },
    { root: "project", kind: "file", path: "角色卡/宣传/functional-description.md" },
    { root: "project", kind: "file", path: "角色卡/宣传/api-spec.md" },
    { root: "project", kind: "directory", path: "角色卡/宣传/docs/design" },
    { root: "project", kind: "directory", path: "角色卡/宣传/docs/feature" },
    { root: "project", kind: "directory", path: "角色卡/宣传/docs/change" },
    { root: "project", kind: "directory", path: "角色卡/宣传/docs/fix" },
    { root: "project", kind: "directory", path: "temp/宣传" },
  ]);
});

test("resolveRole：实际四份角色卡与枚举字段同源，既有 kind / location / boundarySource 保留", async () => {
  const listing = await listProject(REPO_ROOT);
  const config: ProjectConfig = { projectRoot: REPO_ROOT, skillRoot: REPO_ROOT, roles: {} };
  for (const summary of listing.roles) {
    if (summary.builtIn !== true) config.roles[summary.roleId] = { card: summary.cardPath, boundary: summary.boundaryPath };
  }
  for (const [roleId, groupDuty] of EXPECTED_RUNTIME_GROUP) {
    const resolved = await resolveRole(roleId, config);
    assert.equal(resolved.group, "运行时接入组");
    assert.equal(resolved.groupDuty, groupDuty);
    assert.equal(resolved.kind, "project");
    assert.deepEqual(resolved.location, config.roles[roleId]);
    assert.equal(resolved.boundarySource, resolved.boundary.boundarySource);
  }
});

test("公开入口：中文/英文独立字段与英文技能粗体模板使用同一摘要契约", async () => {
  const config = project();
  const cards = [
    "# 中文\n组别： 中文协作组\n组内职责：组员\n",
    "# English\n**group:** English group\n**groupDuty:** member\n",
    "# Template\r\n**Group (`group` / 组别):** Template group\r\n**Group duty (`groupDuty` / 组内职责):** lead\r\n",
  ];
  const expected = [
    { group: "中文协作组", groupDuty: "组员" },
    { group: "English group", groupDuty: "member" },
    { group: "Template group", groupDuty: "lead" },
  ];
  for (let i = 0; i < cards.length; i++) role(config, `case-${i}`, cards[i]);
  const listing = await listProject(config.projectRoot);
  for (let i = 0; i < cards.length; i++) {
    const resolved = await resolveRole(`case-${i}`, config);
    const summary = listing.roles.find((item) => item.roleId === `case-${i}`);
    assert.ok(summary);
    assert.equal(resolved.group, expected[i].group);
    assert.equal(resolved.groupDuty, expected[i].groupDuty);
    assert.equal(summary.group, resolved.group);
    assert.equal(summary.groupDuty, resolved.groupDuty);
  }
  assert.deepEqual(listing.warnings, []);
});

test("公开入口：第一条非空字段生效，重复别名不覆盖，空字段与单字段不制造默认值", async () => {
  const config = project();
  role(config, "duplicate", [
    "# 重复声明", "**组别（group）：**   ", "group:  首个组  ", "**group:** 第二个组",
    "**组内职责（groupDuty）：** 组员", "groupDuty: 组长",
  ].join("\n"));
  role(config, "group-only", "# 只有组\n**组别：** 独立组\n**groupDuty:** \t ");
  role(config, "duty-only", "# 只有职责\n**group:** \t\n**组内职责：**轮值");
  role(config, "empty", "# 空字段\n**group:** \t\n**groupDuty:**  ");
  const listing = await listProject(config.projectRoot);
  const duplicate = await resolveRole("duplicate", config);
  assert.equal(duplicate.group, "首个组");
  assert.equal(duplicate.groupDuty, "组员");
  for (const item of [await resolveRole("group-only", config), listing.roles.find((r) => r.roleId === "group-only")]) {
    assert.ok(item);
    assert.equal(item.group, "独立组");
    assert.equal(Object.hasOwn(item, "groupDuty"), false);
  }
  for (const item of [await resolveRole("duty-only", config), listing.roles.find((r) => r.roleId === "duty-only")]) {
    assert.ok(item);
    assert.equal(Object.hasOwn(item, "group"), false);
    assert.equal(item.groupDuty, "轮值");
  }
  assertAbsent(await resolveRole("empty", config));
  const emptySummary = listing.roles.find((r) => r.roleId === "empty");
  assert.ok(emptySummary);
  assertAbsent(emptySummary);
  assert.deepEqual(listing.warnings, []);
});

test("公开入口：旧卡缺字段仍无属性、无 warning；正文提及与边界用途不会成为组声明", async () => {
  const config = project();
  role(config, "legacy", "# 旧卡\n负责解释 group: / 组别：和 groupDuty: 等普通正文。\n");
  const listing = await listProject(config.projectRoot);
  const resolved = await resolveRole("legacy", config);
  const summary = listing.roles.find((item) => item.roleId === "legacy");
  assert.ok(summary);
  assertAbsent(resolved);
  assertAbsent(summary);
  assert.deepEqual(listing.warnings, []);
  assert.equal(resolved.kind, "project");
  assert.equal(resolved.cardText, summary.cardText);
});

test("Model / 公开入口：未知组名和职责保持字符串，HTML 字符不转义，JSON 回传保持原值", async () => {
  const config = project();
  const group = '研发 & <script>alert("group")</script> / 未知组';
  const groupDuty = "轮值协调者 <b>未知职责</b> & '引号'";
  role(config, "raw", `# raw\n**group:**  ${group}  \n**groupDuty:** ${groupDuty}\n`);
  const listing = await listProject(config.projectRoot);
  const summary = listing.roles.find((item) => item.roleId === "raw");
  const resolved = await resolveRole("raw", config);
  assert.ok(summary);
  for (const metadata of [summary, resolved]) {
    assert.equal(typeof metadata.group, "string");
    assert.equal(typeof metadata.groupDuty, "string");
    assert.equal(metadata.group, group);
    assert.equal(metadata.groupDuty, groupDuty);
    const serialized: RoleGroupMetadata = JSON.parse(JSON.stringify(metadata));
    assert.equal(serialized.group, group);
    assert.equal(serialized.groupDuty, groupDuty);
  }
});

test("组长元数据不会改变边界、接受或写权结果，同组不获得额外路径权限", async () => {
  const config = project();
  const location = role(config, "same-role", "# 同一角色\n");
  // 使用既有接受契约加载项目边界；未接受配置会按原规则回落内置边界，而非该角色写集。
  config.governanceBoundary = { path: "", acceptance: { accepted: true, source: "test:role-group" } };
  const before = await resolveRole("same-role", config);
  writeFileSync(join(config.projectRoot, location.card), "# 同一角色\n**组别（group）：** 运行时接入组\n**组内职责（groupDuty）：** 组长\n");
  const after = await resolveRole("same-role", config);
  assert.equal(after.kind, before.kind);
  assert.deepEqual(after.location, before.location);
  assert.equal(after.boundarySource, before.boundarySource);
  assert.deepEqual(after.boundary, before.boundary);
  const context = { projectRoot: config.projectRoot, skillRoot: config.skillRoot };
  for (const resolved of [before, after]) {
    assert.equal(resolved.boundarySource, location.boundary);
    assert.equal(resolved.boundary.acceptance.accepted, true);
    assert.equal(resolveWrite("src/owned/a.ts", resolved.boundary, undefined, context).allowed, true);
    assert.equal(resolveWrite("src/member-only/a.ts", resolved.boundary, undefined, context).allowed, false);
    const unaccepted = { ...resolved.boundary, acceptance: { accepted: false, source: "" } };
    assert.equal(resolveWrite("src/owned/a.ts", unaccepted, undefined, context).allowed, false);
  }
});

test("带组字段的归档卡仍静默排除/拒绝开启，内置和未知角色不继承项目组", async () => {
  const config = project();
  const groupCard = "# 归档\n**组别（group）：** 运行时接入组\n**组内职责（groupDuty）：** 组长\n";
  role(config, "archived", groupCard, `${BOUNDARY}archived: true\n`);
  const listing = await listProject(config.projectRoot);
  assert.deepEqual(listing.roles.map((item) => item.roleId), [listing.primaryRoleId]);
  assert.deepEqual(listing.warnings, []);
  assert.equal(listing.hasRoles, false);
  assertAbsent(listing.roles[0]);
  await assert.rejects(() => resolveRole("archived", config), /角色 archived 已归档，不可开启/);
  role(config, "live", groupCard);
  assert.equal((await resolveRole("live", config)).group, "运行时接入组");
  for (const roleId of [listing.primaryRoleId, "unknown"]) {
    const builtin = await resolveRole(roleId, config);
    assert.equal(builtin.kind, "built-in-governance");
    assertAbsent(builtin);
  }
});
