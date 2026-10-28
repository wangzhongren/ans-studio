// test/门禁引擎/liaison-role.test.ts
// 批次 A（2026-10-28 方案 v9.2「幕僚 + 最小系统」）：旧 liaison 角色**退休**——本文件由
// `liaison-role` 退役为 **chief（幕僚）/ product（产品）** 六角色身份层覆盖：
//   · listProject 六角色（chief→product→rapporteur→nominator→convener→verifier）、primaryRoleId=chief；
//   · chief 承接旧主入口的写区（docs/intents/）与能力（沟通/意图交接/旧 coordinate 派发），
//     product 在 A 批承接旧 liaison 现行写区（docs/intents/）；目标 docs/product/ 在 D 生效；
//   · 保留 id：角色卡/chief|product|liaison 项目目录被跳过并警告、roles 映射不得遮蔽内置角色；
//   · 旧 liaison 仅保留**只读别名**（可解析、不列表；D 批删除）；
//   · single 模型逐字不变（只有 su），三权角色在 single 下结构性不可用。
// 现行（旧）写区与能力位保持到 D 批（团队计划 amendment-1）；目标写区在 D 生效。
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
  isBuiltInGovernanceRoleId,
  isTrioGovernanceRoleId,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { listProject, resolveGovernanceRole, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "chief-"));
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

function acceptedProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return project({
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:accepted" },
    },
    ...overrides,
  });
}

function allows(
  boundary: Awaited<ReturnType<typeof resolveBoundarySection>>,
  rel: string,
): boolean {
  return resolveWrite(rel, boundary, undefined, { projectRoot: ROOT, skillRoot: SKILL }).allowed;
}

// —————————————————————— 1) 六角色列表与主入口 ——————————————————————

test("新空项目：listProject 恰 6 个 builtIn（chief 首位）、primaryRoleId=chief、liaison 不枚举", async () => {
  const proj = join(ROOT, "empty-six");
  mkdirSync(proj, { recursive: true });
  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "trio");
  assert.equal(listing.primaryRoleId, "chief", "主入口 = 幕僚");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    "六角色顺序固定",
  );
  assert.deepEqual(
    listing.roles.map((r) => r.displayName),
    ["幕僚", "产品", "策划", "人事", "运营", "质检"],
  );
  assert.equal(listing.roles.some((r) => r.roleId === "liaison"), false, "liaison 不再枚举");
  assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下不枚举 su");
  assert.deepEqual(listing.warnings, [], "空项目是正常态：不报警");
  for (const r of listing.roles) {
    assert.equal(r.builtIn, true);
    assert.equal(r.cardPath, "", "内置角色没有角色目录");
    assert.equal(r.boundaryPath, "", "内置角色没有边界文件");
    assert.ok(r.cardText.length > 0, "内置卡文本由注册表合成");
    assert.equal(r.boundary.boundarySource, `<built-in:trio/${r.roleId}>`);
  }
});

test("旧 trio 项目：列表/主入口变化但 `.ans` 逐字节不变（零迁移；liaison 只读别名可解析）", async () => {
  const proj = join(ROOT, "old-trio");
  const ansDir = join(proj, ".ans");
  mkdirSync(ansDir, { recursive: true });
  const ansPath = join(ansDir, "project.json");
  const ansText = JSON.stringify({ projectRoot: proj, roles: {}, governanceModel: "trio" });
  writeFileSync(ansPath, ansText);
  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "trio");
  assert.equal(listing.primaryRoleId, "chief");
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
  assert.equal(readFileSync(ansPath, "utf8"), ansText, "listProject 不得重写 `.ans`");
  // 旧 liaison 仍是保留 id / 只读别名：可解析，但不进入列表。
  assert.equal(isBuiltInGovernanceRoleId("liaison"), true);
  assert.equal(isTrioGovernanceRoleId("liaison"), false);
  assert.equal(governanceRoleOf("liaison")?.function, "liaison");
});

// —————————————————————— 2) single：逐字不变 ——————————————————————

test("single 项目：仍只返回 su、primaryRoleId=su；六角色与旧 liaison 均不可写", async () => {
  const proj = join(ROOT, "single");
  const d = join(proj, "角色卡", "旧角色");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "role-card.md"), "# 旧角色\n");
  writeFileSync(join(d, "boundary.yaml"), "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");

  const listing = await listProject(proj);
  assert.equal(listing.governanceModel, "single");
  assert.equal(listing.primaryRoleId, "su");
  assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "旧角色"]);
  assert.deepEqual(resolveGovernanceRole(listing), { roleId: "su", function: null, model: "single" });
  assert.throws(() => resolveGovernanceRole(listing, { roleId: "chief" }), /旧治理模型/);

  for (const id of ["chief", "product", "liaison", "rapporteur", "nominator", "convener", "verifier"]) {
    const b = await resolveBoundarySection(id, project({ projectRoot: proj, governanceModel: "single" }));
    assert.equal(b.acceptance.accepted, false);
    assert.match(b.parseError ?? "", /三权角色在 single 治理模型下不可用/);
    assert.equal(allows(b, "docs/proposals/i.md"), false, `${id} 在 single 下不得写入`);
  }
});

// —————————————————————— 3) chief 写权（旧主入口写区保持到 D） ——————————————————————

test("chief 写权：docs/intents/** 放行；角色卡/.ans/提案/契约/流程/团队计划/验收/技能/MCP 等拒", async () => {
  const b = await resolveBoundarySection("chief", acceptedProject());
  assert.equal(b.boundarySource, "<built-in:trio/chief>");
  assert.equal(b.acceptance.accepted, true);
  assert.deepEqual(
    b.entries.map((e) => `${e.path}:${e.kind}`),
    ["docs/intents/:directory"],
    "chief 的 Section 1 只有 docs/intents/",
  );
  for (const p of ["docs/intents/i.md", "docs/intents/2026-10-28/sub/i.md"]) {
    assert.equal(allows(b, p), true, `chief 应可写 ${p}`);
  }
  for (const p of [
    "角色卡/chief/role-card.md",
    "角色卡/实现者/boundary.yaml",
    "角色卡/governance-boundary.yaml",
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "docs/product/p.md",
    "docs/proposals/p-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/scheduling/f-team-v1.md",
    "docs/acceptance/criteria-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/verification/r-v1.md",
    "docs/governance/chief/notes.md",
    "docs/workflow.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `chief 越界写入应拒：${p}`);
  }
});

test("chief 越界拒绝文案（AC3）：指回正确归属——提案找策划、角色卡找人事、团队计划找运营、验收找质检、应用路径点名应用", async () => {
  const b = await resolveBoundarySection("chief", acceptedProject());
  const ctx = { projectRoot: ROOT, skillRoot: SKILL };
  const cases: Array<[string, RegExp]> = [
    ["docs/proposals/p-v1.md", /策划 \/ Draft/],
    ["docs/contracts/c-v1.md", /策划 \/ Draft/],
    ["角色卡/实现者/boundary.yaml", /人事 \/ Crew/],
    ["docs/skills/s/SKILL.md", /人事 \/ Crew/],
    ["docs/scheduling/f-team-v1.md", /运营 \/ Steward/],
    ["docs/flows/f.md", /运营 \/ Steward/],
    ["docs/workflow.md", /运营 \/ Steward/],
    ["docs/acceptance/criteria-v1.md", /质检 \/ Proof/],
    ["docs/verification/r-v1.md", /质检 \/ Proof/],
    ["docs/governance/verifier/notes.md", /质检 \/ Proof/],
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
  // 非主入口边界不追加该指引（其他角色拒绝文案不变）。
  const product = await resolveBoundarySection("product", acceptedProject());
  const r = resolveWrite("docs/flows/f.md", product, undefined, ctx);
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.doesNotMatch(r.reason, /运营 \/ Steward/);
});

test("product 写权（A 批承接旧 liaison 现行值）：docs/intents/** 放行；docs/product/** 目标写区 D 生效、本批拒", async () => {
  const b = await resolveBoundarySection("product", acceptedProject());
  assert.equal(b.boundarySource, "<built-in:trio/product>");
  assert.deepEqual(b.entries.map((e) => e.path), ["docs/intents/"], "A 批承接旧 liaison 现行 Section 1");
  assert.deepEqual(governanceRoleOf("product")!.preauthorizedDirs, ["docs/intents/"], "A 批预授权=旧 liaison 现行值");
  for (const p of ["docs/intents/i.md", "docs/intents/2026-10-28/sub/intent.md"]) {
    assert.equal(allows(b, p), true, `A 批 product 应可写旧 liaison 现行写区：${p}`);
  }
  for (const p of [
    "docs/product/nav.md",
    "docs/product/reviews/v1.md",
    "角色卡/实现者/role-card.md",
    ".ans/project.json",
    "docs/proposals/p-v1.md",
    "docs/contracts/c-v1.md",
    "docs/scheduling/f-team-v1.md",
    "docs/flows/f.md",
    "docs/acceptance/a.md",
    "docs/verification/v.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `A 批 product 不得写入（目标写区 docs/product/ 在 D 生效）：${p}`);
  }
});

// —————————————————————— 4) 能力矩阵 ——————————————————————

test("chief 能力：customerInput/handOffIntent/dispatchTask（旧主入口值）；无看护/恢复/安装；shell=审批档", () => {
  const spec = governanceRoleOf("chief");
  assert.ok(spec);
  assert.equal(governanceCapabilitiesOf("chief"), spec!.capabilities, "能力矩阵单点来自注册表");
  assert.deepEqual(spec!.capabilities, {
    customerInput: true,
    handOffIntent: true,
    requestClarification: false,
    // 批次 A：承接旧 liaison 的 coordinate 派发；新矩阵的星形派发/巡检能力在 B 批新增。
    dispatchTask: true,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  assert.equal(spec!.preauthorizedDirs.includes("docs/intents/"), true);
  assert.equal(spec!.preauthorizedDirs.some((d) => d.startsWith("docs/governance/")), false);
});

test("product 能力（A 批身份占位）：不启用客户通道/派发/看护/恢复/安装；shell=审批档", () => {
  const spec = governanceRoleOf("product");
  assert.ok(spec);
  assert.deepEqual(spec!.capabilities, {
    // A 批只注册身份：申请线 C、星形汇报 B、写区 D 生效；本批不新增任何特殊能力。
    customerInput: false,
    handOffIntent: false,
    requestClarification: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  assert.deepEqual(spec!.preauthorizedDirs, ["docs/intents/"], "A 批承接旧 liaison 现行值；docs/product/ 在 D 生效");
  assert.deepEqual(spec!.entries.map((e) => e.path), ["docs/intents/"], "A 批 Section 1=旧 liaison 现行值");
});

// —————————————————————— 5) 卡文本 ——————————————————————

test("chief 卡文本：工作流管理/客户沟通/通知接收，不转发/不审批/不代决，intent-confirm 旧流程保留", () => {
  const t = governanceRoleOf("chief")!.cardText;
  assert.match(t, /工作流管理/);
  assert.match(t, /客户主沟通入口/);
  assert.match(t, /不拥有最终批准权/);
  assert.match(t, /不转发、不审批、不代选、不代决、不改写/);
  assert.match(t, /`cardKind=intent-confirm`/);
  assert.match(t, /`hand_off_intent`/);
  assert.match(t, /不得创建额外的治理角色/);
  assert.match(t, /dispatch_task/);
  assert.match(t, /role_status/);
  assert.match(t, /session_tail/);
  assert.match(t, /docs\/intents\//);
});

test("product 卡文本：A 批只注册身份并明确目标能力 B/C/D 生效；不得宣称已启用 docs/product 或申请线", () => {
  const t = governanceRoleOf("product")!.cardText;
  assert.match(t, /批次 A 身份层说明/);
  assert.match(t, /只注册\*\*角色身份\*\*/);
  assert.match(t, /不启用目标写区与新增能力/);
  assert.match(t, /Section 1 \/ 预授权本批沿用旧 liaison 的现行值 `docs\/intents\/`/);
  assert.match(t, /目标写区 `docs\/product\/` 在 \*\*D 批\*\*生效/);
  assert.match(t, /直接申请线在 \*\*C 批\*\*生效/);
  assert.match(t, /星形任务\/短报在 \*\*B 批\*\*生效/);
  assert.match(t, /不拥有最终批准权/);
  assert.match(t, /不审批、不代选、不代决/);
  assert.match(t, /不得创建额外的治理角色/);
  // 反向守卫：不得把目标写区写成 A 批已生效的写盘指令。
  assert.doesNotMatch(t, /产物写入 `docs\/product\/`/);
});

// —————————————————————— 6) 保留 id 守卫 ——————————————————————

test("保留 id：角色卡/chief|product|liaison 被跳过并警告；resolveRole 不被项目映射遮蔽", async () => {
  const proj = join(ROOT, "shadow");
  for (const id of ["chief", "product", "liaison"]) {
    mkdirSync(join(proj, "角色卡", id), { recursive: true });
    writeFileSync(join(proj, "角色卡", id, "role-card.md"), `# 假 ${id}\n`);
    writeFileSync(
      join(proj, "角色卡", id, "boundary.yaml"),
      "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n",
    );
  }
  mkdirSync(join(proj, ".ans"), { recursive: true });
  writeFileSync(join(proj, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));

  const listing = await listProject(proj);
  for (const id of ["chief", "product"]) {
    assert.equal(
      listing.roles.filter((r) => r.roleId === id).length,
      1,
      `项目里的 角色卡/${id}/ 不得再枚举为项目角色`,
    );
    assert.equal(listing.roles.find((r) => r.roleId === id)?.builtIn, true);
  }
  const w = listing.warnings.join("\n");
  for (const id of ["chief", "product", "liaison"]) {
    assert.match(w, new RegExp(`角色卡/${id}：与内置治理角色 id 冲突，已跳过`));
  }

  for (const id of ["chief", "product"]) {
    const role = await resolveRole(id, {
      projectRoot: proj,
      skillRoot: SKILL,
      governanceModel: "trio",
      roles: { [id]: { card: `角色卡/${id}/role-card.md`, boundary: `角色卡/${id}/boundary.yaml` } },
    });
    assert.equal(role.kind, "built-in-governance");
    assert.equal(role.governanceFunction, id);
    assert.doesNotMatch(role.cardText, new RegExp(`假 ${id}`), `项目映射不得遮蔽内置 ${id}`);
  }
});

// —————————————————————— 7) 旧 liaison 只读别名 ——————————————————————

test("旧 liaison：不在注册表/列表，但按 id 仍解析出基线卡文本/边界/能力（D 批删除）", async () => {
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.some((s) => (s.id as string) === "liaison"), false);
  const role = await resolveRole("liaison", project());
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.governanceFunction, "liaison");
  assert.match(role.cardText, /客户沟通/);
  assert.match(role.cardText, /不拥有最终批准权/);
  assert.equal(role.boundarySource, "<built-in:trio/liaison>");
  assert.deepEqual(role.boundary.entries.map((e) => e.path), ["docs/intents/"]);
  assert.deepEqual(governanceCapabilitiesOf("liaison"), {
    customerInput: true,
    handOffIntent: true,
    requestClarification: false,
    dispatchTask: true,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
});

// —————————————————————— 8) resolveGovernanceRole 公共出口 ——————————————————————

test("resolveGovernanceRole：六角色按 roleId/function 解析；缺省 proposal→rapporteur；旧 liaison 显式别名可解析", async () => {
  const root = join(ROOT, "trio-listing-resolve");
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const trio = await listProject(root);

  assert.deepEqual(resolveGovernanceRole(trio), { roleId: "rapporteur", function: "proposal", model: "trio" });
  for (const [roleId, fn] of [
    ["chief", "chief"],
    ["product", "product"],
    ["rapporteur", "proposal"],
    ["nominator", "nomination"],
    ["convener", "schedule"],
    ["verifier", "verification"],
  ] as const) {
    assert.deepEqual(resolveGovernanceRole(trio, { roleId }), { roleId, function: fn, model: "trio" });
    assert.deepEqual(resolveGovernanceRole(trio, { function: fn }), { roleId, function: fn, model: "trio" });
  }
  // 旧 liaison 只读别名仍可显式解析（不进入列表/缺省路由）。
  assert.deepEqual(resolveGovernanceRole(trio, { roleId: "liaison" }), {
    roleId: "liaison",
    function: "liaison",
    model: "trio",
  });
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "su" }), /已归档/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "su" }),
    /chief\/product\/rapporteur\/nominator\/convener\/verifier/,
  );
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "rapporteur", function: "schedule" }), /不一致/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "实现者" }),
    /chief\/product\/rapporteur\/nominator\/convener\/verifier/,
  );
});
