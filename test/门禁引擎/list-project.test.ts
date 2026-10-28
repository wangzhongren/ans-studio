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

test("T14/六角色：导入空目录（新空项目）→ 不抛错、trio 六内置、chief 主入口、空 warnings", async () => {
  const empty = join(ROOT, "empty");
  mkdirSync(empty, { recursive: true });

  const listing = await listProject(empty); // §10.2：不再抛「未找到角色目录」
  assert.equal(listing.projectRoot, empty);
  assert.equal(listing.hasRoles, false);
  // 治理三权分立 V1（客户 2026-10-17 拍板）+ 2026-10-28 批次 A 六角色（幕僚 + 最小系统）。
  assert.equal(listing.governanceModel, "trio");
  assert.equal(listing.primaryRoleId, "chief");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    "trio 内置角色顺序必须是 chief → product → rapporteur → nominator → convener → verifier",
  );
  assert.deepEqual(
    listing.roles.map((r) => r.displayName),
    ["幕僚", "产品", "策划", "人事", "运营", "质检"],
    "内置角色须由注册表填入统一显示名",
  );
  for (const builtIn of listing.roles) {
    assert.equal(builtIn.builtIn, true);
    assert.equal(builtIn.cardPath, "");
    assert.equal(builtIn.boundaryPath, "");
    assert.ok(builtIn.cardText.length > 0);
    assert.equal(builtIn.boundary.acceptance.accepted, false); // 展示用，fail-closed 由 resolveBoundarySection 把关
    // D 批：写区已切换到目标态；内置角色 Section 1 非空（具体写区由 D 专项测试钉住）。
    assert.ok(builtIn.boundary.entries.length > 0);
  }
  assert.equal(listing.roles.find((r) => r.roleId === "chief")?.governanceFunction, "chief");
  assert.equal(listing.roles.find((r) => r.roleId === "product")?.governanceFunction, "product");
  assert.equal(listing.roles.find((r) => r.roleId === "rapporteur")?.governanceFunction, "proposal");
  assert.equal(listing.roles.find((r) => r.roleId === "nominator")?.governanceFunction, "nomination");
  assert.equal(listing.roles.find((r) => r.roleId === "convener")?.governanceFunction, "schedule");
  assert.equal(listing.roles.find((r) => r.roleId === "verifier")?.governanceFunction, "verification");
  assert.equal(listing.roles.some((r) => r.roleId === "liaison"), false, "旧 liaison 退休、不枚举");
  // 空项目是**正常状态**（尚未 bootstrap），不该报警：warnings 必须为空。
  assert.deepEqual(listing.warnings, []);
  // 反向守卫：那条「无角色目录」warning 不得再出现（客户 2026-10-11 裁定空项目正常、不报警）。
  assert.equal(
    listing.warnings.some((w) => /无角色目录/.test(w)),
    false,
    `空项目不应再报「无角色目录」warning，实得：${JSON.stringify(listing.warnings)}`,
  );
});

test("三权：无显式模型但已有角色目录（旧项目）→ single，su 行为逐字不变", async () => {
  const proj = join(ROOT, "old-project");
  const d = join(proj, "角色卡", "旧角色");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# 旧角色");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/x\n    purpose: t\n");
  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "旧角色"]);
  assert.equal(listing.roles[0].governanceFunction, undefined);
});

test("三权：`.ans/project.json` 缺 governanceModel（旧记录）→ single；显式 trio → trio", async () => {
  const old = join(ROOT, "ans-old");
  mkdirSync(join(old, ".ans"), { recursive: true });
  writeFileSync(join(old, ".ans", "project.json"), JSON.stringify({ projectRoot: old, roles: {} }));
  const oldListing = await listProject(old);
  assert.equal(oldListing.governanceModel, "single", "旧记录无模型字段 → single（旧行为）");
  assert.deepEqual(oldListing.roles.map((r) => r.roleId), ["su"]);

  const trio = join(ROOT, "ans-trio");
  const roleDir = join(trio, "角色卡", "实现者");
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(join(roleDir, "role-card.md"), "# 实现者");
  writeFileSync(join(roleDir, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");
  mkdirSync(join(trio, ".ans"), { recursive: true });
  writeFileSync(join(trio, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const trioListing = await listProject(trio);
  assert.equal(trioListing.governanceModel, "trio");
  assert.equal(trioListing.primaryRoleId, "chief");
  assert.deepEqual(
    trioListing.roles.map((r) => r.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "实现者"],
  );
  assert.equal(trioListing.hasRoles, true);
});

test("三权：`.ans` 不可解析 → single（行为不变，不崩）", async () => {
  const proj = join(ROOT, "ans-broken");
  mkdirSync(join(proj, ".ans"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), "{not-json");
  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"], "无角色目录时旧行为仍只列 su");
});

// 真机缺陷 2026-10-18（live-ci）：新 trio 项目由 Liaison 建档后，Nominator 写出**首个项目角色**
// `builder`，而 `.ans/project.json` 尚未写出（`repinIfBootstrapped` 此时无可 pin 之物、零副作用）。
// 旧判定「无显式模型 + 有角色目录 ⇒ single」令模型翻转，Convener 的 dispatch_task 被
// `dispatcherRoleIdOf` 判成「来源角色不是派发主人 su」而拒绝。`trio` 任务状态是确定事实（single 不建
// 任务状态），据此封住该窗口；以下四个夹具钉死边界。

test("三权：首角色已落盘但 `.ans` 未写出、任务状态存在 → trio、chief 主入口、六内置角色", async () => {
  const proj = join(ROOT, "first-role-trio");
  const d = join(proj, "角色卡", "builder");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# builder");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");
  // 任务状态只 stat、不读内容：空文件也满足（真实状态一行一条 JSON）。
  mkdirSync(join(proj, ".ans", "state"), { recursive: true });
  writeFileSync(join(proj, ".ans", "state", "tasks.jsonl"), "");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "trio");
  assert.equal(listing.primaryRoleId, "chief");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "builder"],
    "六个内置角色在前（chief → product → rapporteur → nominator → convener → verifier），首项目角色照常枚举",
  );
  assert.equal(listing.hasRoles, true);
  assert.deepEqual(listing.warnings, []);
});

test("三权：同上但无任务状态 → single、su 主入口（旧项目行为逐字不变）", async () => {
  const proj = join(ROOT, "first-role-no-tasks");
  const d = join(proj, "角色卡", "builder");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# builder");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "builder"]);
});

test("三权：显式 `.ans/project.json` single 优先于任务状态 → 仍 single", async () => {
  const proj = join(ROOT, "explicit-single-tasks");
  mkdirSync(join(proj, ".ans", "state"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), JSON.stringify({ governanceModel: "single" }));
  writeFileSync(join(proj, ".ans", "state", "tasks.jsonl"), "");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single", "显式值优先，任务状态不得覆盖");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
});

test("三权：`.ans/project.json` 不可解析 + 任务状态存在 → 仍 single（unreadable fail-closed 不变）", async () => {
  const proj = join(ROOT, "unreadable-tasks");
  mkdirSync(join(proj, ".ans", "state"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), "{not-json");
  writeFileSync(join(proj, ".ans", "state", "tasks.jsonl"), "");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
});

test("六角色：保留 id 冲突——项目里的 su/chief/product/liaison/rapporteur/nominator/convener/verifier 目录跳过并警告", async () => {
  const proj = join(ROOT, "reserved");
  for (const id of ["su", "chief", "product", "liaison", "rapporteur", "nominator", "convener", "verifier", "正常"]) {
    const d = join(proj, "角色卡", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "role-card.md"), `# ${id}`);
    writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/x\n    purpose: t\n");
  }
  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single"); // 有角色目录 → 旧项目
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "正常"]);
  const w = listing.warnings.join("\n");
  for (const id of ["su", "chief", "product", "liaison", "rapporteur", "nominator", "convener", "verifier"]) {
    assert.match(w, new RegExp(`${id}：与内置治理角色 id 冲突，已跳过`), `保留 id ${id} 须跳过并警告`);
  }
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
