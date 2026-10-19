// 门禁引擎测试：四角色（2026-10-18 客户拍板「三权不变、角色四名」）
//
// 契约：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
// §4.1–§4.7（Liaison 注册表/能力/写权/listProject/resolveGovernanceRole/旧项目兼容）。
// 本文件只钉住门禁引擎的交付面；交接工具、镜像卡、账本、UI 属各自属主。
//
// 覆盖：
//  1. 旧 trio 项目自动获得 Liaison 主入口，`.ans` 逐字节不变（零迁移）；
//  2. single 项目逐字不变（仍 su、无 Liaison、无交接/镜像能力）；
//  3. Liaison 写权：`docs/intents/**` 放行；`角色卡/**`/`.ans/**`/`docs/proposals/**` 等拒；
//  4. Liaison 能力：只有沟通（handOffIntent）；无 dispatch/install/roleStatus/recovery/shell；
//  5. 保留 id：`角色卡/liaison/` 被跳过并警告、项目 roles 映射不得遮蔽。
//
// 全部临时目录，用完清理；不读 `.env`、不跑真实模型/凭据/网络。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveBoundarySection } from "../../src/common/门禁引擎/boundary-core.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceCapabilitiesOf,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { listProject, resolveGovernanceRole, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "liaison-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const SKILL = join(ROOT, "skill");
mkdirSync(SKILL, { recursive: true });

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { projectRoot: ROOT, skillRoot: SKILL, roles: {}, governanceModel: "trio", ...overrides };
}

function allows(
  boundary: Awaited<ReturnType<typeof resolveBoundarySection>>,
  rel: string,
): boolean {
  return resolveWrite(rel, boundary, undefined, { projectRoot: ROOT, skillRoot: SKILL }).allowed;
}

// —————————————————————— 1) 旧 trio 项目：自动获得 Liaison、零迁移 ——————————————————————

test("旧 trio 项目：listProject 自动返回五内置（liaison 首位）、primaryRoleId=liaison、`.ans` 逐字节不变", async () => {
  const proj = join(ROOT, "old-trio");
  const ansDir = join(proj, ".ans");
  mkdirSync(ansDir, { recursive: true });
  const ansPath = join(ansDir, "project.json");
  const ansText = JSON.stringify({ projectRoot: proj, roles: {}, governanceModel: "trio" });
  writeFileSync(ansPath, ansText);
  const roleDir = join(proj, "角色卡", "实现者");
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(join(roleDir, "role-card.md"), "# 实现者\n");
  writeFileSync(
    join(roleDir, "boundary.yaml"),
    "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n",
  );

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "trio", "governanceModel 仍为 trio（不新增 quad）");
  assert.equal(listing.primaryRoleId, "liaison", "旧 trio 项目升级后默认入口为 Liaison");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["liaison", "rapporteur", "nominator", "convener", "verifier", "实现者"],
    "旧项目自动获得 Liaison，无需迁移目录或角色卡",
  );
  assert.deepEqual(listing.warnings, []);
  assert.equal(readFileSync(ansPath, "utf8"), ansText, "listProject 不得重写 `.ans`");
});

test("旧 trio 项目：历史 `.ans` 无角色映射也能解析 Liaison（注册表数据，不写项目文件）", async () => {
  const proj = join(ROOT, "old-trio-min");
  mkdirSync(join(proj, ".ans"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const listing = await listProject(proj);
  const liaison = listing.roles.find((r) => r.roleId === "liaison");
  assert.ok(liaison, "旧 trio 项目必须枚举到 Liaison");
  assert.equal(liaison.builtIn, true);
  assert.equal(liaison.governanceFunction, "liaison");
  assert.equal(liaison.cardPath, "");
  assert.equal(liaison.boundaryPath, "");
  assert.match(liaison.cardText, /客户沟通 · 不拥有最终批准权/);
});

// —————————————————————— 2) single：逐字不变 ——————————————————————

test("single 项目：仍只返回 su、primaryRoleId=su；无 Liaison、无交接能力", async () => {
  const proj = join(ROOT, "single");
  const d = join(proj, "角色卡", "旧角色");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# 旧角色\n");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "旧角色"]);
  assert.equal(listing.roles.some((r) => r.roleId === "liaison"), false);

  assert.deepEqual(resolveGovernanceRole(listing), { roleId: "su", function: null, model: "single" });
  assert.throws(() => resolveGovernanceRole(listing, { roleId: "liaison" }), /旧治理模型/);

  const b = await resolveBoundarySection(
    "liaison",
    project({ projectRoot: proj, governanceModel: "single" }),
  );
  assert.equal(b.acceptance.accepted, false);
  assert.match(b.parseError ?? "", /三权角色在 single 治理模型下不可用/);
  assert.equal(allows(b, "docs/intents/i.md"), false, "single 下 Liaison 不得写入");
});

// —————————————————————— 3) Liaison 写权 ——————————————————————

test("Liaison 写权：docs/intents/** 放行；角色卡//.ans//proposals/契约/提名/流程 拒", async () => {
  const accepted: ProjectConfig = project({
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:accepted" },
    },
  });
  const b = await resolveBoundarySection("liaison", accepted);
  assert.equal(b.boundarySource, "<built-in:trio/liaison>");
  assert.equal(b.acceptance.accepted, true);
  assert.deepEqual(
    b.entries.map((e) => `${e.path}:${e.kind}`),
    ["docs/intents/:directory"],
    "Liaison 的 Section 1 只有 docs/intents/",
  );

  for (const p of ["docs/intents/i.md", "docs/intents/2026-10-18/sub/i.md"]) {
    assert.equal(allows(b, p), true, `Liaison 应可写 ${p}`);
  }
  for (const p of [
    "角色卡/liaison/role-card.md",
    "角色卡/实现者/boundary.yaml",
    "角色卡/governance-boundary.yaml",
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "docs/proposals/p-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/verification/r-v1.md",
    "docs/governance/liaison/notes.md",
    "docs/workflow.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `Liaison 越界写入应拒：${p}`);
  }
});

test("Liaison 越界拒绝文案（AC3）：指回正确归属——提案找 Draft、角色卡/提名找 Crew、流程找 Steward、验收找 Proof、应用路径点名应用", async () => {
  const b = await resolveBoundarySection(
    "liaison",
    project({
      governanceBoundary: {
        path: "角色卡/governance-boundary.yaml",
        acceptance: { accepted: true, source: "test:accepted" },
      },
    }),
  );
  const ctx = { projectRoot: ROOT, skillRoot: SKILL };
  const cases: Array<[string, RegExp]> = [
    ["docs/proposals/p-v1.md", /Draft \/ 提案/],
    ["docs/contracts/c-v1.md", /Draft \/ 提案/],
    ["角色卡/实现者/boundary.yaml", /Crew \/ 组队/],
    ["docs/nominations/n-v1.md", /Crew \/ 组队/],
    ["docs/skills/s/SKILL.md", /Crew \/ 组队/],
    ["docs/flows/f.md", /Steward \/ 统筹/],
    ["docs/workflow.md", /Steward \/ 统筹/],
    ["docs/verification/r-v1.md", /Proof \/ 验收/],
    ["docs/governance/verifier/notes.md", /Proof \/ 验收/],
    [".ans/project.json", /只能由应用写/],
    ["docs/bootstrap-manifest.md", /只能由应用写/],
    ["角色卡/governance-boundary.yaml", /只能由应用写/],
  ];
  for (const [p, owner] of cases) {
    const d = resolveWrite(p, b, undefined, ctx);
    assert.equal(d.allowed, false, `${p} 应被拒`);
    if (!d.allowed) {
      assert.match(d.reason, /目标路径未匹配任何边界条目/, `${p} 保留既有拒绝原头`);
      assert.match(d.reason, owner, `${p} 的拒绝文案须指回正确归属`);
      assert.deepEqual(d.allowedByRoot, { skill: [], project: ["docs/intents"] });
    }
  }
  // 非 Liaison 边界不追加该指引（既有角色拒绝文案不变）。
  const rapporteur = await resolveBoundarySection(
    "rapporteur",
    project({
      governanceBoundary: {
        path: "角色卡/governance-boundary.yaml",
        acceptance: { accepted: true, source: "test:accepted" },
      },
    }),
  );
  const r = resolveWrite("docs/flows/f.md", rapporteur, undefined, ctx);
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.doesNotMatch(r.reason, /召集人 Convener/);
});

// —————————————————————— 4) 能力矩阵：只有沟通/交接 ——————————————————————

test("Liaison 能力：customerInput=true（仅 intent-confirm）、handOffIntent=true；无 dispatch/install/roleStatus/recovery；shell=审批档", () => {
  const spec = governanceRoleOf("liaison");
  assert.ok(spec);
  assert.equal(governanceCapabilitiesOf("liaison"), spec!.capabilities, "能力矩阵单点来自注册表");
  assert.deepEqual(spec!.capabilities, {
    customerInput: true,
    handOffIntent: true,
    requestClarification: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    // 客户 2026-10-19：所有角色 shell 均接审批档（只读白名单直接执行、其余逐条审批）。
    shell: "operator-approve",
  });
  assert.equal(spec!.preauthorizedDirs.includes("docs/intents/"), true);
  assert.equal(spec!.preauthorizedDirs.some((d) => d.startsWith("docs/governance/")), false);
});

test("Lead 卡文本：需求确认——先发 intent-confirm 复述目标/范围/验收，confirm 后才交接", () => {
  const t = governanceRoleOf("liaison")!.cardText;
  assert.match(t, /`cardKind=intent-confirm`/);
  assert.match(t, /`flowId=<intentId>`/);
  assert.match(t, /选项固定为 `confirm` \/ `revise`/);
  assert.match(t, /客户选 `confirm` 后才能调用 `hand_off_intent`/);
  assert.match(t, /选 `revise` 时先按反馈修改意图文件/);
  assert.match(t, /确认前不得交接/);
  // 真机 2026-10-18：意图 frontmatter 只支持字符串值；YAML 列表会让 hand_off_intent 解析失败。
  assert.match(t, /goal \/ scope \/ acceptance 必须是\*\*字符串值\*\*/);
  assert.match(t, /不要用 YAML 列表（`-` 项）或嵌套映射/);
  assert.match(t, /列表项会让 `hand_off_intent` 解析失败/);
  // 其他角色的卡不得写 intent-confirm（卡片白名单不扩散）。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    if (spec.id === "liaison") continue;
    assert.doesNotMatch(spec.cardText, /intent-confirm/, `${spec.id} 不写 intent-confirm`);
  }
});

// —————————————————————— 5) 保留 id 守卫 ——————————————————————

test("保留 id：角色卡/liaison/ 被跳过并警告；resolveRole('liaison') 不被项目映射遮蔽", async () => {
  const proj = join(ROOT, "shadow");
  mkdirSync(join(proj, "角色卡", "liaison"), { recursive: true });
  writeFileSync(join(proj, "角色卡", "liaison", "role-card.md"), "# 假 Liaison\n");
  writeFileSync(
    join(proj, "角色卡", "liaison", "boundary.yaml"),
    "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n",
  );
  mkdirSync(join(proj, ".ans"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));

  const listing = await listProject(proj);
  assert.equal(listing.roles.some((r) => r.roleId === "liaison" && r.builtIn === true), true);
  assert.equal(
    listing.roles.filter((r) => r.roleId === "liaison").length,
    1,
    "项目里的 角色卡/liaison/ 不得再枚举为项目角色",
  );
  assert.match(listing.warnings.join("\n"), /角色卡\/liaison：与内置治理角色 id 冲突，已跳过/);

  const role = await resolveRole("liaison", {
    projectRoot: proj,
    skillRoot: SKILL,
    governanceModel: "trio",
    roles: { liaison: { card: "角色卡/liaison/role-card.md", boundary: "角色卡/liaison/boundary.yaml" } },
  });
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.governanceFunction, "liaison");
  assert.doesNotMatch(role.cardText, /假 Liaison/, "项目映射不得遮蔽内置 Liaison");
});
