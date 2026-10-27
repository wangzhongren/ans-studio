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

test("Liaison 写权：docs/intents/** 放行；角色卡//.ans//proposals/契约/提名/团队计划/验收/流程 拒", async () => {
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
    "docs/scheduling/f-team-v1.md",
    "docs/acceptance/criteria-v1.md",
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

test("Liaison 越界拒绝文案（AC3）：指回正确归属——提案找 Draft、角色卡找 Crew、团队计划找 Steward、验收找 Proof、应用路径点名应用", async () => {
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
  // 2026-10-22：旧提名文件是 legacy（只读历史/过渡），不再归属 Crew 写区，拒绝文案不再指引 Crew。
  const legacy = resolveWrite("docs/nominations/n-v1.md", b, undefined, ctx);
  assert.equal(legacy.allowed, false);
  if (!legacy.allowed) {
    assert.match(legacy.reason, /目标路径未匹配任何边界条目/);
    assert.doesNotMatch(legacy.reason, /人事 \/ Crew/, "legacy nominations 不再指引 Crew 写区");
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

test("Liaison 能力：customerInput=true（仅 intent-confirm）、handOffIntent=true、dispatchTask=true（工作流管理者）；无 install/roleStatus/recovery；shell=审批档", () => {
  const spec = governanceRoleOf("liaison");
  assert.ok(spec);
  assert.equal(governanceCapabilitiesOf("liaison"), spec!.capabilities, "能力矩阵单点来自注册表");
  assert.deepEqual(spec!.capabilities, {
    customerInput: true,
    handOffIntent: true,
    requestClarification: false,
    // 客户 2026-10-20：Lead / 主理 兼任工作流管理者，可向 Steward / 统筹 派协调任务；项目 worker 由 Steward 派。
    dispatchTask: true,
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

test("Lead 卡文本：治理协调（2026-10-24）——接报内置状态/回交、闸门 0/1 后才交接/coordinate、不直派 Crew/Proof/项目 worker、Proof 只收状态+指针、协调≠批准", () => {
  const t = governanceRoleOf("liaison")!.cardText;
  assert.match(t, /## 治理协调（产品 \/ Lead）/);
  assert.match(
    t,
    /策划 \/ Draft、运营 \/ Steward、人事 \/ Crew、质检 \/ Proof 的状态与回交向\*\*你\*\*汇总/,
    "Lead 接报 Draft/Steward/Crew/Proof 的状态与回交",
  );
  assert.match(t, /维护「阶段 \/ 阻塞 \/ 下一步」视图/, "Lead 维护阶段/阻塞/下一步视图");
  assert.match(
    t,
    /代批 `confirm`（闸门 0 已结算）后，才用 `hand_off_intent`/,
    "闸门 0 结算后才 hand_off_intent 给 Draft",
  );
  assert.match(
    t,
    /客户已接受提案（闸门 1 已结算）后，才用 `dispatch_task` 的 coordinate 向 运营 \/ Steward 派/,
    "闸门 1 结算后才 coordinate 给 Steward",
  );
  assert.match(t, /不直接派 Crew \/ Proof \/ 项目 worker/, "Lead 不直接派 Crew/Proof/项目 worker");
  assert.match(t, /项目 worker（Map \/ Reduce）由 运营 \/ Steward 派/, "项目 worker 由 Steward 派");
  assert.match(t, /只收 Proof 的状态与报告指针/, "Proof 只给 Lead 状态+报告指针");
  assert.match(t, /不批准提案、任命、验收/, "Lead 不批准提案/任命/验收");
  assert.match(t, /协调 ≠ 客户批准/, "协调 ≠ 客户批准");
  assert.match(t, /应用仍执行闸门 0\/1\/2/, "应用门禁仍执行");
  assert.match(t, /你的协调不替代任何门禁/, "协调不替代门禁");
  // 2026-10-26 客户追加规则：系统消息（[系统·治理协调]、gate pass/fail 系统行、交付/阻塞通知）
  // 只向客户汇报，不得据此 dispatch_task 派 Steward；客户消息 / 客户明确要求触发的协调不回归。
  assert.match(t, /\*\*系统消息只汇报、不派任务（必须）\*\*/, "Lead 卡须写死系统消息只汇报、不派任务");
  assert.match(
    t,
    /`\[系统·治理协调\]`、gate pass \/ fail 系统行、交付 \/ 阻塞通知等系统消息/,
    "系统消息种类须列明（[系统·治理协调]、gate 系统行、交付/阻塞通知）",
  );
  assert.match(t, /只向客户如实汇报/, "Lead 收到系统消息只向客户如实汇报");
  assert.match(
    t,
    /不得给 运营 \/ Steward 发任务、不得调用 `dispatch_task`/,
    "Lead 收到系统消息不得派 Steward / 不得 dispatch_task",
  );
  assert.match(t, /不得把系统消息当成客户指令/, "系统消息不得当客户指令");
  assert.match(t, /客户明确要求或客户消息触发的协调仍按原规则/, "客户消息路径不回归");
  assert.match(t, /客户消息不是系统消息/, "客户消息与系统消息须区分");
  // 工作流管理章节同样写死；闸门 1 后的客户消息 coordinate 路径仍保留，dispatchTask 能力不变。
  assert.match(
    t,
    /系统消息（`\[系统·治理协调\]`、gate pass \/ fail 系统行、交付 \/ 阻塞通知等）只向客户汇报/,
    "工作流管理章节须同步系统消息纪律",
  );
  assert.match(t, /只有客户明确要求或客户消息触发的协调才可派发/, "只有客户触发才可派发");
  assert.equal(
    governanceRoleOf("liaison")!.capabilities.dispatchTask,
    true,
    "dispatch_task 仍保留（客户消息触发才可派）",
  );
  // 2026-10-24 P1-7：Lead 作为 manager（与 Steward 同权限）不得代标 delivered；
  // 只能在 owner 交付 delivered 后核证 done，或标 failed/blocked；worker 不能 done。
  assert.match(t, /与 运营 \/ Steward 同权限/, "Lead 管理工作流的管理权限描述保留");
  assert.match(
    t,
    /`dispatched → delivered` 只能由该步骤的 owner（项目角色 \/ worker）标记/,
    "Lead 不得代标 delivered",
  );
  assert.match(t, /不得代标 `delivered`/, "Lead 卡须写明不得代标 delivered");
  assert.match(
    t,
    /只能在 owner 交付 `delivered` 后核证并标 `done`（`delivered → done`）/,
    "Lead 只能核证 delivered→done",
  );
  assert.match(t, /或标 `failed` \/ `blocked`/, "Lead 仍可标 failed/blocked");
  assert.match(t, /worker 不能标 `done`/, "worker 不能 done");
  // 旧「向项目角色派发协调任务」必须消失（Q1：项目 worker 由 Steward 派）。
  assert.doesNotMatch(t, /向 运营 \/ Steward 与项目角色派发协调任务/);
  assert.doesNotMatch(t, /向 运营 \/ Steward与项目角色派发协调任务/);
  assert.doesNotMatch(t, /派给 Steward \/ 项目角色/);
  assert.doesNotMatch(t, /向项目角色派发协调任务/);
  // 能力位不变：治理协调不新增工具/能力位。
  const cap = governanceRoleOf("liaison")!.capabilities;
  assert.equal(cap.handOffIntent, true, "hand_off_intent 仍保留");
  assert.equal(cap.dispatchTask, true, "dispatch_task 仍保留（仅向 Steward 协调）");
  assert.deepEqual(
    [cap.roleStatus, cap.sessionTail, cap.proposeRecovery, cap.installSkill, cap.installMcp],
    [false, false, false, false, false],
    "治理协调不新增看护/恢复/技能/MCP 能力",
  );
});

test("Lead 卡文本：需求确认——先发 intent-confirm 复述目标/范围/验收，confirm（客户或判断代批）后才交接；revise 永不由判断代选", () => {
  const t = governanceRoleOf("liaison")!.cardText;
  assert.match(t, /`cardKind=intent-confirm`/);
  assert.match(t, /`flowId=<intentId>`/);
  assert.match(t, /选项固定为 `confirm` \/ `revise`/);
  assert.match(t, /客户或判断 agent 代批 `confirm` 后才能调用 `hand_off_intent`/);
  assert.match(t, /客户开启「替我决策」时，判断 agent 可代批 `confirm`/);
  assert.match(t, /`revise` 永远不由判断代选/);
  assert.match(t, /代批不是客户逐项批准、不改写客户意图/);
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
