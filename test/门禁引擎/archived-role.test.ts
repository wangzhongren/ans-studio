// 门禁引擎测试：归档角色约定（客户 2026-10-14）——边界 YAML 顶层 `archived: true`
// 语义（PM 转达的约定）：
//  ① listProject：不枚举该角色、不产生任何警告（静默跳过；替代「缺少 boundary.yaml」告警路径）；
//  ② resolveRole（CLI `ans role run` 与桌面开启所经入口）：fail-closed 拒绝开启，
//     错误信息明确——「角色 X 已归档，不可开启」；
//  ③ 不带该键的目录行为完全不变（缺文件仍逐条告警，见 list-project.test.ts 夹具用例）。
// 背景：冻结归档目录（如 `角色卡/桌面应用/`——2026-10-14 拆分为 桌面UI/桌面窗口）保留**原名**
// `boundary.yaml` 原位留档，靠本约定把它挡在枚举与开启之外（不再用改名 `boundary.yaml.frozen` 方案）。
// 另有防御深度：resolveBoundarySection 对归档角色的边界 fail-closed（parseError ⇒ resolveWrite 全拒），
// 覆盖「绕过 resolveRole 直接按 id 解析边界」的调用方。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBoundaryYaml, parseBoundaryYamlDoc } from "../../src/common/门禁引擎/boundary-yaml.ts";
import { loadBoundaryFile } from "../../src/common/门禁引擎/boundary-core.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";

const ROOT = mkdtempSync(join(tmpdir(), "archived-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

let seq = 0;
function makeProject(): string {
  const p = join(ROOT, `proj-${seq++}`);
  mkdirSync(p, { recursive: true });
  return p;
}

/** 写一个角色目录：默认含 role-card.md；给 boundary 时写 boundary.yaml。 */
function writeRole(proj: string, roleId: string, opts: { card?: boolean; boundary?: string }): void {
  const dir = join(proj, "角色卡", roleId);
  mkdirSync(dir, { recursive: true });
  if (opts.card !== false) writeFileSync(join(dir, "role-card.md"), `# ${roleId}`);
  if (opts.boundary !== undefined) writeFileSync(join(dir, "boundary.yaml"), opts.boundary);
}

// 归档角色边界：保留原有 role/entries（原位留档），另加顶层 archived: true。
const ARCHIVED_BOUNDARY = [
  "role: 桌面应用",
  "entries:",
  "  - kind: directory",
  "    path: src/",
  "    purpose: 归档前留档的旧授权（不生效——归档角色不可开启）",
  "archived: true",
].join("\n");

const LIVE_BOUNDARY = ["role: 在活", "entries:", "  - kind: directory", "    path: src/在活/", "    purpose: t"].join("\n");

test("解析：archived: true 为合法顶层键；条目照常解析、标记经 loadBoundaryFile 回传", async () => {
  const proj = makeProject();
  writeRole(proj, "桌面应用", { boundary: ARCHIVED_BOUNDARY });

  const doc = parseBoundaryYamlDoc(ARCHIVED_BOUNDARY);
  assert.equal(doc.archived, true);
  assert.equal(doc.entries.length, 1);
  assert.equal(doc.entries[0].path, "src");
  // 旧入口向后兼容：parseBoundaryYaml 仍只回条目
  assert.deepEqual(parseBoundaryYaml(ARCHIVED_BOUNDARY), doc.entries);

  const section = await loadBoundaryFile(
    "角色卡/桌面应用/boundary.yaml",
    join(proj, "角色卡/桌面应用/boundary.yaml"),
    proj,
    proj,
    { accepted: false, source: "" },
  );
  assert.equal(section.archived, true);
  assert.equal(section.parseError, undefined);
  assert.equal(section.entries.length, 1);
});

test("解析：archived 仅接受布尔；false / 缺省不产生归档标记", () => {
  const withFalse = parseBoundaryYamlDoc("entries: []\narchived: false\n");
  assert.equal(withFalse.archived, undefined);
  assert.equal(withFalse.entries.length, 0);
  const without = parseBoundaryYamlDoc("entries: []\n");
  assert.equal(without.archived, undefined);
  // 非布尔（字符串 / 数字）→ 严格解析失败，不给模糊地带（fail-closed 家族：坏配置整条拒绝）
  assert.throws(() => parseBoundaryYamlDoc('entries: []\narchived: "true"\n'), /archived 必须是布尔值/);
  assert.throws(() => parseBoundaryYamlDoc("entries: []\narchived: 1\n"), /archived 必须是布尔值/);
});

test("listProject：archived: true 的目录静默跳过——不枚举、不产生任何警告（与活角色共存）", async () => {
  const proj = makeProject();
  writeRole(proj, "桌面应用", { boundary: ARCHIVED_BOUNDARY });
  writeRole(proj, "在活", { boundary: LIVE_BOUNDARY });

  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "在活"]);
  assert.equal(listing.hasRoles, true);
  assert.deepEqual(listing.warnings, []);
});

test("listProject：目录全部为归档 → 与「无有效角色」同等静默（无逐条警告、无汇总提示）", async () => {
  const proj = makeProject();
  writeRole(proj, "旧角色", { boundary: ARCHIVED_BOUNDARY });

  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
  assert.equal(listing.hasRoles, false);
  assert.deepEqual(listing.warnings, []);
});

test("listProject：归档目录缺 role-card.md 也静默（归档探测先于缺卡检查）", async () => {
  const proj = makeProject();
  writeRole(proj, "裸归档", { card: false, boundary: ARCHIVED_BOUNDARY });

  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
  assert.deepEqual(listing.warnings, []);
});

test("listProject：不带 archived 键的目录行为不变——缺 boundary 仍逐条告警（归档不吞旁告警）", async () => {
  const proj = makeProject();
  writeRole(proj, "旧角色", { boundary: ARCHIVED_BOUNDARY });
  writeRole(proj, "半成品", { card: true }); // 只有 role-card.md，缺 boundary.yaml → 走既有告警路径

  const listing = await listProject(proj);
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su"]);
  assert.equal(listing.hasRoles, false);
  assert.deepEqual(listing.warnings, [
    "角色卡/半成品：缺少 boundary.yaml，已跳过",
    "项目根下未枚举到有效角色；仅内置治理角色 su 可用（可发起 bootstrap）",
  ]);
});

test("resolveRole：归档角色 fail-closed 拒绝开启（「角色 X 已归档，不可开启」）；活角色照常解析", async () => {
  const proj = makeProject();
  writeRole(proj, "桌面应用", { boundary: ARCHIVED_BOUNDARY });
  writeRole(proj, "在活", { boundary: LIVE_BOUNDARY });
  const base = {
    projectRoot: proj,
    skillRoot: proj,
    roles: {
      桌面应用: { card: "角色卡/桌面应用/role-card.md", boundary: "角色卡/桌面应用/boundary.yaml" },
      在活: { card: "角色卡/在活/role-card.md", boundary: "角色卡/在活/boundary.yaml" },
    },
  };
  // 无治理接受证据 → 仍拒绝（归档探测为中性读取）
  await assert.rejects(() => resolveRole("桌面应用", base), /角色 桌面应用 已归档，不可开启/);
  // 有治理接受证据（含 pin 缺省情形）→ 归档判定不依赖接受/pin 状态，照常拒绝
  const accepted = {
    ...base,
    governanceBoundary: { path: "gov.md", acceptance: { accepted: true, source: "demo" } },
  };
  await assert.rejects(() => resolveRole("桌面应用", accepted), /已归档，不可开启/);
  // 活角色不受影响：正常解析（kind=project、卡片正文可得）
  const live = await resolveRole("在活", base);
  assert.equal(live.kind, "project");
  assert.match(live.cardText, /在活/);
});

test("防御深度：绕过开启入口按 id 解析归档角色的边界 → 未接受 + parseError；resolveWrite 拒绝一切写入", async () => {
  const proj = makeProject();
  writeRole(proj, "桌面应用", { boundary: ARCHIVED_BOUNDARY });
  const project = {
    projectRoot: proj,
    skillRoot: proj,
    roles: { 桌面应用: { card: "角色卡/桌面应用/role-card.md", boundary: "角色卡/桌面应用/boundary.yaml" } },
    governanceBoundary: { path: "gov.md", acceptance: { accepted: true, source: "demo" } },
  };
  const b = await resolveBoundary("桌面应用", project);
  assert.equal(b.acceptance.accepted, false);
  assert.ok(typeof b.parseError === "string");
  assert.match(b.parseError, /已归档/);
  const d = resolveWrite("src/x.ts", b, { writeSet: ["src/x.ts"], conditions: [] }, { skillRoot: proj, projectRoot: proj });
  assert.equal(d.allowed, false, "归档角色的边界不得作为任何写权来源");
  assert.match(d.reason, /已归档/);
});
