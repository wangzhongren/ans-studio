// 门禁引擎测试：项目角色枚举 listProject（Service 层）
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listProject } from "../../src/service/role/resolve-role.ts";

// 真实项目根：本测试文件位于 <root>/test/门禁引擎/ 下
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROOT = mkdtempSync(join(tmpdir(), "list-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

test("listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.projectRoot, REPO_ROOT);
  const ids = listing.roles.map((r) => r.roleId);
  for (const id of ["项目管理", "编排", "门禁引擎", "Pi适配器", "装配", "测试"]) {
    assert.ok(ids.includes(id), `缺少角色 ${id}（实际：${ids.join(",")}）`);
  }
  for (const r of listing.roles) {
    assert.ok(r.cardText.length > 0, `${r.roleId} cardText 为空`);
    assert.equal(r.boundary.parseError, undefined, `${r.roleId} 边界解析失败`);
    assert.ok(r.boundary.entries.length > 0, `${r.roleId} 边界无条目`);
    if (r.builtIn) continue; // 内置角色没有角色目录，故无 cardPath/boundaryPath
    assert.match(r.boundaryPath, /boundary\.(yaml|yml|md)$/);
    assert.match(r.cardPath, /role-card\.md$/);
  }
  // T14：有角色的项目 → hasRoles:true，且提供主入口 id（内置 su）供桌面侧设主位（渲染侧不硬编码 "su"）。
  assert.equal(listing.hasRoles, true);
  assert.equal(listing.primaryRoleId, "su");
  // 归档约定（客户 2026-10-14，PM 转达）：`角色卡/桌面应用/`（已拆分为 桌面UI/桌面窗口）原位冻结归档，
  // 其 boundary.yaml **恢复原名**并带顶层 `archived: true`——枚举**静默跳过**：不枚举该角色、不产生任何
  // 警告（见 test/门禁引擎/archived-role.test.ts 的夹具用例钉死该约定）。故本仓库 warnings 为空；
  // 除该归档目录外出现任何警告即回归。
  // 收尾（2026-10-14）：治理侧恢复 boundary.yaml 后本用例已复跑转绿——此前（恢复前，目录仅剩
  // boundary.yaml.frozen）走「缺少 boundary.yaml」告警路径的暂时红属预期等待态，已闭。
  assert.ok(
    !ids.includes("桌面应用"),
    `冻结归档角色不得复活为活角色（应静默跳过，实际：${ids.join(",")}）`,
  );
  assert.deepEqual(listing.warnings, []);
});

test("listProject：内置治理角色 su 永远排在第一位，无角色目录，边界为内置（未接受）", async () => {
  const listing = await listProject(REPO_ROOT);
  const first = listing.roles[0];
  assert.equal(first.roleId, "su");
  assert.equal(first.builtIn, true);
  assert.equal(first.cardPath, "");
  assert.equal(first.boundaryPath, "");
  assert.match(first.cardText, /ANS Governance/);
  assert.equal(first.boundary.acceptance.accepted, false);
  assert.ok(first.boundary.entries.length > 0);
});

test("listProject：英文 role-cards/，坏边界进 warnings，其余照常返回", async () => {
  const proj = join(ROOT, "en-project");
  const good = join(proj, "role-cards", "good");
  const bad = join(proj, "role-cards", "bad");
  const nob = join(proj, "role-cards", "noboundary");
  const noc = join(proj, "role-cards", "nocard");
  for (const d of [good, bad, nob, noc]) mkdirSync(d, { recursive: true });

  writeFileSync(join(good, "role-card.md"), "# good role");
  writeFileSync(join(good, "boundary.yaml"), "entries:\n  - kind: file\n    path: src/a.ts\n    purpose: t\n");

  writeFileSync(join(bad, "role-card.md"), "# bad role");
  writeFileSync(join(bad, "boundary.yaml"), "entries:\n  - kind: nope\n    path: src/b.ts\n    purpose: t\n");

  writeFileSync(join(nob, "role-card.md"), "# noboundary role");
  writeFileSync(join(noc, "boundary.yaml"), "entries: []\n");

  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "good"]);
  assert.equal(listing.hasRoles, true);
  assert.equal(listing.primaryRoleId, "su");
  const goodRole = listing.roles.find((r) => r.roleId === "good");
  assert.equal(goodRole?.boundary.entries.length, 1);

  const w = listing.warnings.join("\n");
  assert.match(w, /bad/);
  assert.match(w, /解析失败/);
  assert.match(w, /noboundary/);
  assert.match(w, /缺少 boundary/);
  assert.match(w, /nocard/);
  assert.match(w, /缺少 role-card/);
});

test("listProject：中文 角色卡/ 目录名可识别", async () => {
  const proj = join(ROOT, "zh-project");
  const d = join(proj, "角色卡", "某角色");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# 某角色");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/x\n    purpose: t\n");
  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "某角色"]);
  assert.deepEqual(listing.warnings, []);
});

test("listProject：真实项目级错误仍抛出（不存在 / 不是目录）", async () => {
  await assert.rejects(() => listProject(join(ROOT, "does-not-exist")), /不存在|不可访问/);

  const f = join(ROOT, "afile");
  writeFileSync(f, "x");
  await assert.rejects(() => listProject(f), /不是目录/);

  // 角色目录路径存在但不是目录 → 仍是真错误、抛出。
  const proj = join(ROOT, "roledir-is-file");
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "角色卡"), "not a dir");
  await assert.rejects(() => listProject(proj), /不是目录/);
});

test("T14：导入空目录 → 不抛错、返回内置 su + 空 warnings + hasRoles:false + primaryRoleId", async () => {
  const empty = join(ROOT, "empty");
  mkdirSync(empty, { recursive: true });

  const listing = await listProject(empty); // §10.2：不再抛「未找到角色目录」
  assert.equal(listing.projectRoot, empty);
  assert.equal(listing.hasRoles, false);
  assert.equal(listing.primaryRoleId, "su");
  // 只有内置 su 一条
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
  const su = listing.roles[0];
  assert.equal(su.builtIn, true);
  assert.equal(su.cardPath, "");
  assert.equal(su.boundaryPath, "");
  assert.match(su.cardText, /ANS Governance/);
  assert.equal(su.boundary.acceptance.accepted, false); // 展示用，fail-closed 由 resolveBoundarySection 把关
  assert.ok(su.boundary.entries.length > 0);
  // 空项目是**正常状态**（尚未 bootstrap），不该报警：warnings 必须为空。
  assert.deepEqual(listing.warnings, []);
  // 反向守卫：那条「无角色目录」warning 不得再出现（客户 2026-10-11 裁定空项目正常、不报警）。
  assert.equal(
    listing.warnings.some((w) => /无角色目录/.test(w)),
    false,
    `空项目不应再报「无角色目录」warning，实得：${JSON.stringify(listing.warnings)}`,
  );
});

test("T14：有角色目录但全无效角色 → hasRoles:false + 提示可用 su 发起 bootstrap（不抛错）", async () => {
  const proj = join(ROOT, "broken-roles");
  const onlyMissingBoundary = join(proj, "角色卡", "半成品");
  mkdirSync(onlyMissingBoundary, { recursive: true });
  writeFileSync(join(onlyMissingBoundary, "role-card.md"), "# 半成品"); // 缺 boundary.yaml → 跳过

  const listing = await listProject(proj);
  assert.equal(listing.hasRoles, false);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
  const w = listing.warnings.join("\n");
  assert.match(w, /缺少 boundary/);
  assert.match(w, /未枚举到有效角色|可发起 bootstrap/);
});
