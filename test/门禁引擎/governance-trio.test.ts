// 门禁引擎测试：治理三权分立 V1（W0 契约 + W1 门禁）；2026-10-18 起四角色
//
// 依据：客户 2026-10-17 拍板（V1 + V1b 分期；新项目 trio、旧项目默认 single 兼容；迁移后 su
// 隐藏/不可开启/历史只读；三人基本只读 shell；账本在 `.ans/governance/ledger.jsonl`；
// `rapporteur` 提案权 / `nominator` 提名权 / `convener` 编排权，无任何角色自动拥有最终批准权）。
// 2026-10-18 客户拍板「三权不变、角色四名」：新增 `liaison` 沟通权（客户沟通），作为 trio
// 默认主入口；旧 trio 项目自动获得 Liaison，`governanceModel` 仍为 `"trio"`，single/su 不变。
// 实施口径：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.1–§5.6、§九-1/3/4/12/15；`2026-10-18_design_governance-liaison-review.md` §4.1–§4.7。
//
// 本文件钉住本角色（门禁引擎）的 W0+W1 交付（四角色）：
//  1. `GovernanceModel` / `GovernanceFunction` 类型与 `ProjectConfig/ResolvedRole/ProjectListing` 字段；
//  2. 内置注册表：四人顺序/职能/卡文本/Section 1/预授权/禁写/能力矩阵；旧 su 常量仍单点；
//  3. `listProject`：新空项目 trio（已由 list-project.test.ts 覆盖细节）、显式模型、旧项目 single；
//  4. `resolveBoundarySection`：trio 四人边界来自注册表（不读治理边界文档条目）、接受证据规则、
//     su 归档、single 下 trio 角色不可用；single/su 既有四分支不变；
//  5. `resolveRole` / `resolveGovernanceRole`：卡文本、governanceFunction、保留 id、归档拒绝；
//  6. 写权矩阵：四人可写范围与越界拒绝；应用专用治理边界只放行三项应用写路径；
//  7. 四人 `forbiddenWritePaths` 覆盖应用独占路径与其他治理角色资料（按段比较，不实现 glob）。
//
// 全部临时目录，用完清理；不读 `.env`、不跑真实模型/凭据/网络。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  BUILT_IN_ROLE_CARD_TEXT,
  builtInBoundarySection,
  resolveBoundarySection,
} from "../../src/common/门禁引擎/boundary-core.ts";
import {
  APP_GOVERNANCE_SOURCE,
  BUILT_IN_GOVERNANCE_ROLES,
  LEGACY_GOVERNANCE_ROLE_ID,
  LEGACY_SU_CAPABILITIES,
  LEGACY_SU_CARD_TEXT,
  LEGACY_SU_PREAUTHORIZED_DIRS,
  appGovernanceBoundary,
  governanceCapabilitiesOf,
  governanceFunctionOf,
  governanceRoleOf,
  isBuiltInGovernanceRoleId,
  isTrioGovernanceRoleId,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { isUnderOrEqual, normalizeLexical } from "../../src/common/门禁引擎/paths.ts";
import { listProject, resolveGovernanceRole, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { BoundaryEntry } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "trio-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(join(PROJ, "角色卡"), { recursive: true });
mkdirSync(SKILL, { recursive: true });
const CTX = { skillRoot: SKILL, projectRoot: PROJ };

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 项目治理边界文档（故意只写 src/）——trio 三人**不得**把它当写权来源。 */
const GOV_REL = "角色卡/governance-boundary.yaml";
writeFileSync(
  join(PROJ, GOV_REL),
  "role: 治理边界\nentries:\n  - kind: directory\n    path: src/\n    purpose: 绝不能成为 trio 三人的写权\n",
);

const ACCEPTED_GOV = {
  path: GOV_REL,
  acceptance: { accepted: true, source: "test:customer-accepted" },
} as const;

function trioProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: {},
    governanceModel: "trio",
    governanceBoundary: { ...ACCEPTED_GOV, acceptance: { ...ACCEPTED_GOV.acceptance } },
    ...overrides,
  };
}

function singleProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { projectRoot: PROJ, skillRoot: SKILL, roles: {}, ...overrides };
}

function write(path: string, text = "x"): void {
  const abs = join(PROJ, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
}

function allows(boundary: Awaited<ReturnType<typeof resolveBoundarySection>>, rel: string): boolean {
  return resolveWrite(rel, boundary, undefined, CTX).allowed;
}

function forbiddenCovers(roleId: string, rel: string): boolean {
  const spec = governanceRoleOf(roleId);
  assert.ok(spec, `缺少注册表条目 ${roleId}`);
  return spec!.forbiddenWritePaths.some((p) => isUnderOrEqual(normalizeLexical(rel), p));
}

// —————————————————————— 1) 注册表形状与能力矩阵 ——————————————————————

test("注册表：四内置顺序 liaison→rapporteur→nominator→convener，职能 liaison/proposal/nomination/schedule", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener"],
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.function),
    ["liaison", "proposal", "nomination", "schedule"],
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.displayName),
    ["联络官 Liaison", "报告员 Rapporteur", "提名官 Nominator", "召集人 Convener"],
  );
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(governanceRoleOf(spec.id)?.id, spec.id);
    assert.equal(governanceFunctionOf(spec.id), spec.function);
    assert.equal(isBuiltInGovernanceRoleId(spec.id), true);
    assert.equal(isTrioGovernanceRoleId(spec.id), true);
    assert.ok(spec.cardText.length > 0);
  }
  assert.equal(governanceRoleOf("su"), undefined);
  assert.equal(governanceFunctionOf("su"), undefined);
  assert.equal(isBuiltInGovernanceRoleId("su"), true, "su 也是内置治理角色 id（single 兼容）");
  assert.equal(isTrioGovernanceRoleId("su"), false);
  assert.equal(isBuiltInGovernanceRoleId("实现者"), false);
  assert.equal(governanceCapabilitiesOf("实现者"), undefined);
});

test("注册表：Section 1 与评审 §5.2/§4.2 表逐项一致（root 恒 project）", () => {
  const expected: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["角色卡/", "docs/nominations/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.entries.map((e) => e.path), expected[spec.id], `${spec.id} 条目`);
    assert.ok(spec.entries.every((e: BoundaryEntry) => e.root === "project"), `${spec.id} 条目 root`);
    const kinds = spec.entries.map((e) => `${e.path}:${e.kind}`);
    assert.ok(kinds.every((k) => k.endsWith(":file") || k.endsWith(":directory")), "不用条件目录/glob");
  }
});

test("注册表：预授权目录与评审一致（Liaison 仅 docs/intents/；nominator 不含 角色卡/；convener 不含 docs/workflow.md）", () => {
  assert.deepEqual(governanceRoleOf("liaison")?.preauthorizedDirs, ["docs/intents/"]);
  assert.deepEqual(governanceRoleOf("rapporteur")?.preauthorizedDirs, [
    "docs/proposals/",
    "docs/contracts/",
    "docs/governance/rapporteur/",
  ]);
  assert.deepEqual(governanceRoleOf("nominator")?.preauthorizedDirs, [
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/nominator/",
  ]);
  assert.deepEqual(governanceRoleOf("convener")?.preauthorizedDirs, [
    "docs/flows/",
    "docs/governance/convener/",
  ]);
  assert.equal(governanceRoleOf("nominator")?.preauthorizedDirs.includes("角色卡/"), false);
  assert.equal(governanceRoleOf("convener")?.preauthorizedDirs.includes("docs/workflow.md"), false);
});

test("注册表：能力矩阵按 §5.6/§4.3——Liaison 只沟通+交接；Convener 独享派发/看护/恢复；Nominator 独享技能/MCP", () => {
  const l = governanceRoleOf("liaison")!.capabilities;
  const r = governanceRoleOf("rapporteur")!.capabilities;
  const n = governanceRoleOf("nominator")!.capabilities;
  const c = governanceRoleOf("convener")!.capabilities;
  // Liaison：不发确认/选择卡（只用聊天与交接工具），其余能力全关。
  assert.equal(l.customerInput, false, "Liaison 不注入 customerInput");
  assert.equal(l.handOffIntent, true, "Liaison 独享 hand_off_intent");
  assert.equal(l.requestClarification, false);
  assert.deepEqual(
    [l.dispatchTask, l.roleStatus, l.sessionTail, l.proposeRecovery, l.installSkill, l.installMcp],
    [false, false, false, false, false, false],
  );
  assert.equal(l.shell, "none");
  // 其余三人保留客户确认通道；仅 Rapporteur 有澄清工具。
  for (const cap of [r, n, c]) assert.equal(cap.customerInput, true, "三人都有客户确认通道");
  assert.deepEqual([l.handOffIntent, r.handOffIntent, n.handOffIntent, c.handOffIntent], [true, false, false, false]);
  assert.deepEqual(
    [l.requestClarification, r.requestClarification, n.requestClarification, c.requestClarification],
    [false, true, false, false],
  );
  assert.deepEqual(
    [r.dispatchTask, n.dispatchTask, c.dispatchTask],
    [false, false, true],
  );
  assert.deepEqual([r.roleStatus, n.roleStatus, c.roleStatus], [false, false, true]);
  assert.deepEqual([r.sessionTail, n.sessionTail, c.sessionTail], [false, false, true]);
  assert.deepEqual([r.proposeRecovery, n.proposeRecovery, c.proposeRecovery], [false, false, true]);
  assert.deepEqual([r.installSkill, n.installSkill, c.installSkill], [false, true, false]);
  assert.deepEqual([r.installMcp, n.installMcp, c.installMcp], [false, true, false]);
  assert.deepEqual([r.shell, n.shell, c.shell], ["none", "none", "readonly"]);
  // su 单点：能力集来自注册表，不在调用方另写一份。
  assert.equal(governanceCapabilitiesOf("su"), LEGACY_SU_CAPABILITIES);
  // 旧 su 的卡文本/id 仍以 boundary-core 为单一来源（注册表只做 live binding 再导出）。
  assert.equal(LEGACY_GOVERNANCE_ROLE_ID, BUILT_IN_GOVERNANCE_ROLE_ID);
  assert.equal(LEGACY_SU_CARD_TEXT, BUILT_IN_ROLE_CARD_TEXT);
  assert.match(LEGACY_SU_CARD_TEXT, /ANS Governance/);
  assert.deepEqual(LEGACY_SU_CAPABILITIES, {
    customerInput: true,
    handOffIntent: false,
    requestClarification: false,
    dispatchTask: true,
    roleStatus: true,
    sessionTail: true,
    proposeRecovery: true,
    installSkill: true,
    installMcp: true,
    shell: "operator-approve",
  });
  assert.deepEqual(LEGACY_SU_PREAUTHORIZED_DIRS, ["docs/su", "docs/contracts", "docs/skills", "docs/mcp"]);
});

test("卡文本：四人均写明职能/不拥有最终批准权/可写与禁写/应用独占路径/不得建第五个治理角色", () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    assert.match(t, /不拥有最终批准权/, `${spec.id} 须写明无最终批准权`);
    assert.match(t, /可写目录（Section 1）/, `${spec.id} 须列可写目录`);
    assert.match(t, /禁写路径/, `${spec.id} 须列禁写路径`);
    assert.match(t, /只能由应用写/, `${spec.id} 须写明应用独占写路径`);
    assert.match(t, /\.ans\/\*\*/, `${spec.id} 须点名 .ans 禁写`);
    assert.match(t, /不得创建第五个治理角色/, `${spec.id} 须禁止治理角色增殖`);
  }
  // Liaison：沟通权 + 交接约定；没有 customerInput，故不写 cardKind。
  const l = governanceRoleOf("liaison")!.cardText;
  assert.match(l, /客户沟通/);
  assert.match(l, /客户沟通 · 不拥有最终批准权/);
  assert.match(l, /hand_off_intent/);
  assert.match(l, /docs\/intents\//);
  assert.doesNotMatch(l, /cardKind/, "Liaison 不发确认/选择卡");
  // Rapporteur：不再自称客户沟通主入口；改读意图 + 澄清工具。
  const r = governanceRoleOf("rapporteur")!.cardText;
  assert.match(r, /提案权/);
  assert.match(r, /docs\/intents\//);
  assert.match(r, /request_clarification/);
  assert.doesNotMatch(r, /理解客户意图、沟通/, "客户沟通已拆给 Liaison");
  assert.match(governanceRoleOf("rapporteur")!.cardText, /cardKind/);
  assert.match(governanceRoleOf("nominator")!.cardText, /提名权/);
  assert.match(governanceRoleOf("nominator")!.cardText, /appointment/);
  assert.match(governanceRoleOf("nominator")!.cardText, /cardKind/);
  assert.match(governanceRoleOf("convener")!.cardText, /编排权/);
  assert.match(governanceRoleOf("convener")!.cardText, /只读档/);
  assert.match(governanceRoleOf("convener")!.cardText, /schedule-write/);
  assert.match(governanceRoleOf("convener")!.cardText, /应用后台派发/, "提名步骤由应用后台派发");
  assert.doesNotMatch(
    governanceRoleOf("convener")!.cardText,
    /客户点击入口打开 Nominator/,
    "2026-10-18 客户修正：提名步骤由应用后台派发",
  );
});

test("注册表：forbiddenWritePaths 按段展开（无 glob），覆盖应用独占路径与其他治理角色目录", () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(
      spec.forbiddenWritePaths.some((p) => p.includes("*") || p.includes("?")),
      false,
      `${spec.id} 禁写路径不得使用 glob`,
    );
    for (const p of [".ans/project.json", ".ans/governance/ledger.jsonl", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"]) {
      assert.equal(forbiddenCovers(spec.id, p), true, `${spec.id} 须禁写 ${p}`);
    }
  }
  for (const id of ["liaison", "rapporteur", "nominator", "convener", "su"]) {
    for (const writer of ["liaison", "rapporteur", "nominator"]) {
      assert.equal(forbiddenCovers(writer, `角色卡/${id}/role-card.md`), true, `${writer} 须禁写 角色卡/${id}/`);
    }
  }
  assert.equal(forbiddenCovers("convener", "角色卡/实现者/role-card.md"), true);
  // Liaison：唯一写区是 docs/intents/；治理产物全部禁写。
  for (const p of [
    "docs/proposals/f-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/governance/liaison/notes.md",
    "docs/workflow.md",
  ]) {
    assert.equal(forbiddenCovers("liaison", p), true, `liaison 须禁写 ${p}`);
  }
  assert.equal(forbiddenCovers("liaison", "docs/intents/i.md"), false, "docs/intents/ 是 Liaison 的唯一写区");
  assert.equal(forbiddenCovers("rapporteur", "docs/nominations/f-v1.md"), true);
  assert.equal(forbiddenCovers("rapporteur", "docs/flows/f.md"), true);
  assert.equal(forbiddenCovers("nominator", "docs/proposals/f-v1.md"), true);
  assert.equal(forbiddenCovers("nominator", "docs/flows/f.md"), true);
  assert.equal(forbiddenCovers("convener", "docs/skills/s/SKILL.md"), true);
  assert.equal(forbiddenCovers("convener", "docs/mcp/m.md"), true);
});

// —————————————————————— 2) resolveBoundarySection：trio 三人 ——————————————————————

test("trio：四人边界 = 注册表条目；boundarySource=<built-in:trio/id>；接受证据沿用项目记录", async () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const b = await resolveBoundarySection(spec.id, trioProject());
    assert.deepEqual(b.entries, spec.entries, `${spec.id} 条目须与注册表逐字一致`);
    assert.equal(b.boundarySource, `<built-in:trio/${spec.id}>`);
    assert.equal(b.acceptance.accepted, true);
    assert.equal(b.acceptance.source, "test:customer-accepted");
    assert.equal(b.parseError, undefined);
  }
});

test("trio：绝不读取治理边界文档的条目——该文档只写 src/，src/** 仍被拒", async () => {
  const b = await resolveBoundarySection("rapporteur", trioProject());
  assert.equal(b.entries.some((e) => e.path === "src/"), false, "治理边界文档的条目不得进入三人边界");
  assert.equal(allows(b, "src/x.ts"), false);
  assert.equal(allows(b, "docs/proposals/f-v1.md"), true);
});

test("trio：path 为空 + 显式 genesis → 接受证据 = 本次 genesis.source", async () => {
  const b = await resolveBoundarySection(
    "convener",
    trioProject({
      governanceBoundary: { path: "", acceptance: { accepted: true, source: "desktop-runtime-consent" } },
      genesisBootstrap: { source: "test:operator-bootstrap" },
    }),
  );
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, "test:operator-bootstrap");
});

test("trio：path 为空时运行期同意不得当项目接受证据 → fail-closed（F6 拒一切写）", async () => {
  const b = await resolveBoundarySection(
    "rapporteur",
    trioProject({
      governanceBoundary: { path: "", acceptance: { accepted: true, source: "desktop-runtime-consent" } },
    }),
  );
  assert.equal(b.acceptance.accepted, false);
  assert.equal(b.acceptance.source, "");
  assert.equal(allows(b, "docs/proposals/f-v1.md"), false);
  const d = resolveWrite("docs/proposals/f-v1.md", b, undefined, CTX);
  assert.equal(d.allowed, false);
  if (!d.allowed) assert.match(d.reason, /未被接受|F6/);
});

test("trio：path 非空但 acceptance 未接受 → fail-closed（不降级为 genesis）", async () => {
  const b = await resolveBoundarySection(
    "nominator",
    trioProject({
      governanceBoundary: { path: GOV_REL, acceptance: { accepted: false, source: "" } },
      genesisBootstrap: { source: "test:operator-bootstrap" },
    }),
  );
  assert.equal(b.acceptance.accepted, false);
  assert.equal(allows(b, "角色卡/A/role-card.md"), false);
});

// —————————————————————— 3) su 迁移后归档 / single 兼容 ——————————————————————

test("trio：su 已归档——边界未接受 + parseError，resolveWrite 拒一切写", async () => {
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, trioProject());
  assert.equal(b.acceptance.accepted, false);
  assert.equal(b.entries.length, 0);
  assert.equal(typeof b.parseError, "string");
  assert.match(b.parseError!, /已归档/);
  assert.match(b.parseError!, /三权治理模型/);
  for (const p of ["角色卡/X/role-card.md", ".ans/project.json", "docs/proposals/f.md", "src/x.ts"]) {
    assert.equal(allows(b, p), false, `su 归档后不得写 ${p}`);
  }
});

test("trio：resolveRole('su') 明确拒绝开启；历史只读不要求开会话", async () => {
  await assert.rejects(
    () => resolveRole(BUILT_IN_GOVERNANCE_ROLE_ID, trioProject()),
    /已归档（当前为三权治理模型），不可开启/,
  );
});

test("trio：listProject 不返回 su；resolveRole 四人返回内置卡文本与 governanceFunction", async () => {
  const root = join(ROOT, "trio-listing");
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const listing = await listProject(root);
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["liaison", "rapporteur", "nominator", "convener"],
  );
  assert.equal(listing.primaryRoleId, "liaison");
  assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下 su 隐藏");

  const project = trioProject();
  for (const [id, fn] of [
    ["liaison", "liaison"],
    ["rapporteur", "proposal"],
    ["nominator", "nomination"],
    ["convener", "schedule"],
  ] as const) {
    const role = await resolveRole(id, project);
    assert.equal(role.kind, "built-in-governance");
    assert.equal(role.governanceFunction, fn);
    assert.ok(role.cardText.length > 0);
    assert.equal(role.location.card, "");
    assert.equal(role.boundarySource, `<built-in:trio/${id}>`);
  }
  assert.match((await resolveRole("liaison", project)).cardText, /客户沟通/);
  assert.match((await resolveRole("rapporteur", project)).cardText, /提案权/);
});

test("single：su 行为逐字不变——卡文本/内置未接受边界/无 governanceFunction", async () => {
  const project = singleProject();
  const su = await resolveRole(BUILT_IN_GOVERNANCE_ROLE_ID, project);
  assert.equal(su.kind, "built-in-governance");
  assert.equal(su.cardText, BUILT_IN_ROLE_CARD_TEXT);
  assert.equal(su.governanceFunction, undefined);
  assert.deepEqual(su.boundary, builtInBoundarySection());
  assert.equal(su.location.card, "");
  assert.equal(su.location.boundary, "");
});

test("single：创世下 su 仍得到治理种子边界（既有行为逐字不变）", async () => {
  const source = "test:operator-bootstrap";
  const b = await resolveBoundarySection(
    BUILT_IN_GOVERNANCE_ROLE_ID,
    singleProject({ genesisBootstrap: { source } }),
  );
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, source);
  assert.deepEqual(b.entries.map((e) => e.path).sort(), [".ans/", "docs/", "角色卡/"].sort());
});

test("single：trio 角色不可用——边界 parseError 明确拒绝；resolveRole 不获得项目写权", async () => {
  for (const id of ["liaison", "rapporteur", "nominator", "convener"]) {
    const b = await resolveBoundarySection(id, singleProject());
    assert.equal(b.acceptance.accepted, false);
    assert.equal(typeof b.parseError, "string");
    assert.match(b.parseError!, /三权角色在 single 治理模型下不可用/);
    assert.equal(allows(b, "docs/proposals/f.md"), false);
    const role = await resolveRole(id, singleProject());
    assert.equal(role.kind, "built-in-governance");
    assert.equal(role.governanceFunction, governanceFunctionOf(id));
  }
});

test("保留 id：项目 roles 映射不得遮蔽内置治理角色（trio 与 single 皆然）", async () => {
  const shadow: ProjectConfig = {
    ...trioProject(),
    roles: {
      liaison: { card: "角色卡/liaison/role-card.md", boundary: "角色卡/liaison/boundary.yaml" },
      rapporteur: { card: "角色卡/rapporteur/role-card.md", boundary: "角色卡/rapporteur/boundary.yaml" },
      su: { card: "角色卡/su/role-card.md", boundary: "角色卡/su/boundary.yaml" },
    },
  };
  const liaison = await resolveRole("liaison", shadow);
  assert.equal(liaison.kind, "built-in-governance", "trio 下 Liaison 保留 id 不得被项目角色遮蔽");
  assert.equal(liaison.governanceFunction, "liaison");
  const r = await resolveRole("rapporteur", shadow);
  assert.equal(r.kind, "built-in-governance", "trio 下保留 id 不得被项目角色遮蔽");
  assert.equal(r.governanceFunction, "proposal");
  await assert.rejects(() => resolveRole("su", shadow), /已归档/);

  const singleShadow: ProjectConfig = {
    ...singleProject(),
    roles: {
      liaison: { card: "角色卡/liaison/role-card.md", boundary: "角色卡/liaison/boundary.yaml" },
      rapporteur: { card: "角色卡/rapporteur/role-card.md", boundary: "角色卡/rapporteur/boundary.yaml" },
    },
  };
  const singleLiaison = await resolveRole("liaison", singleShadow);
  assert.equal(singleLiaison.kind, "built-in-governance");
  const singleR = await resolveRole("rapporteur", singleShadow);
  assert.equal(singleR.kind, "built-in-governance");
});

test("trio：项目角色仍按各自角色卡/边界解析（不受三权注册表影响）", async () => {
  write("角色卡/实现者/role-card.md", "# 实现者\n");
  write(
    "角色卡/实现者/boundary.yaml",
    "entries:\n  - kind: directory\n    path: src/owned/\n    purpose: t\n",
  );
  const project: ProjectConfig = {
    ...trioProject(),
    roles: { 实现者: { card: "角色卡/实现者/role-card.md", boundary: "角色卡/实现者/boundary.yaml" } },
  };
  const role = await resolveRole("实现者", project);
  assert.equal(role.kind, "project");
  assert.equal(role.governanceFunction, undefined);
  assert.equal(role.boundarySource, "角色卡/实现者/boundary.yaml");
  assert.equal(allows(role.boundary, "src/owned/a.ts"), true);
});

// —————————————————————— 4) 写权矩阵（四人越界写入被拒） ——————————————————————

test("写权：liaison 仅可写 docs/intents/**；提案/契约/提名/流程/技能/MCP/治理记录/角色卡/.ans 等一律拒", async () => {
  const b = await resolveBoundarySection("liaison", trioProject());
  for (const p of [
    "docs/intents/i.md",
    "docs/intents/2026-10-18/intent-a.md",
  ]) {
    assert.equal(allows(b, p), true, `liaison 应可写 ${p}`);
  }
  for (const p of [
    "docs/proposals/f-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/governance/liaison/notes.md",
    "docs/workflow.md",
    "角色卡/A/role-card.md",
    "角色卡/liaison/role-card.md",
    "角色卡/governance-boundary.yaml",
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
    "app/main.ts",
    "test/x.test.ts",
  ]) {
    assert.equal(allows(b, p), false, `liaison 越界写入应拒：${p}`);
  }
});

test("写权：rapporteur 可写 proposals/contracts/自身治理记录；其余越界一律拒", async () => {
  const b = await resolveBoundarySection("rapporteur", trioProject());
  for (const p of ["docs/proposals/f-v1.md", "docs/contracts/c-v1.md", "docs/governance/rapporteur/notes.md"]) {
    assert.equal(allows(b, p), true, `rapporteur 应可写 ${p}`);
  }
  for (const p of [
    "角色卡/A/role-card.md",
    "docs/nominations/n-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `rapporteur 越界写入应拒：${p}`);
  }
});

test("写权：nominator 可写角色卡/提名/技能/MCP/自身记录；proposals、flows 等越界拒", async () => {
  const b = await resolveBoundarySection("nominator", trioProject());
  for (const p of [
    "角色卡/A/role-card.md",
    "角色卡/A/boundary.yaml",
    "docs/nominations/n-v1.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/governance/nominator/notes.md",
  ]) {
    assert.equal(allows(b, p), true, `nominator 应可写 ${p}`);
  }
  for (const p of [
    "docs/proposals/f-v1.md",
    "docs/flows/f.md",
    ".ans/project.json",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `nominator 越界写入应拒：${p}`);
  }
});

test("写权：convener 可写 flows/workflow/自身记录；角色卡、提案、提名、技能、MCP、.ans 等越界拒", async () => {
  const b = await resolveBoundarySection("convener", trioProject());
  for (const p of ["docs/flows/f.md", "docs/workflow.md", "docs/governance/convener/notes.md"]) {
    assert.equal(allows(b, p), true, `convener 应可写 ${p}`);
  }
  for (const p of [
    "角色卡/A/role-card.md",
    "角色卡/governance-boundary.yaml",
    "docs/proposals/f-v1.md",
    "docs/nominations/n-v1.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    ".ans/project.json",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `convener 越界写入应拒：${p}`);
  }
});

// —————————————————————— 5) 应用专用治理边界 ——————————————————————

test("appGovernanceBoundary：固定四项应用写路径（含 shell 审计目录）、来源标签、acceptance 透传", () => {
  const acceptance = { accepted: true, source: "app:finalize" };
  const b = appGovernanceBoundary(acceptance);
  assert.equal(b.boundarySource, APP_GOVERNANCE_SOURCE);
  assert.equal(b.acceptance, acceptance);
  assert.deepEqual(
    b.entries.map((e) => `${e.path}:${e.kind}`).sort(),
    [
      ".ans/:directory",
      "docs/audit/:directory",
      "docs/bootstrap-manifest.md:file",
      "角色卡/governance-boundary.yaml:file",
    ].sort(),
  );
  for (const p of [
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    // 真机回归（2026-10-18）：四角色默认入口改为 Liaison 后，shell 审计落盘曾因应用边界缺
    // docs/audit/ 被拒；应用边界必须覆盖该目录（只给应用，不给任何角色）。
    "docs/audit/shell-gate.jsonl",
  ]) {
    assert.equal(allows(b, p), true, `应用边界应放行 ${p}`);
  }
  for (const p of ["角色卡/A/role-card.md", "docs/proposals/f.md", "src/x.ts"]) {
    assert.equal(allows(b, p), false, `应用边界不得放行 ${p}`);
  }
  // 未接受 ⇒ F6 拒一切（应用边界也 fail-closed）。
  assert.equal(allows(appGovernanceBoundary({ accepted: false, source: "" }), ".ans/project.json"), false);
});

test("appGovernanceBoundary：docs/audit/ 只给应用——四角色与 su 写 shell 审计仍被拒", async () => {
  // 注册表不把 docs/audit/ 给任何角色（Section 1 / 预授权均无）。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(spec.entries.some((e) => e.path === "docs/audit/"), false, `${spec.id} 不得获得 docs/audit/`);
    assert.equal(
      spec.preauthorizedDirs.includes("docs/audit/"),
      false,
      `${spec.id} 不得预授权 docs/audit/`,
    );
  }
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const b = await resolveBoundarySection(spec.id, trioProject());
    assert.equal(allows(b, "docs/audit/shell-gate.jsonl"), false, `${spec.id} 不得写 shell 审计`);
  }
  // su：trio 下已归档（结构性拒写）；single 的内置边界同样不含 docs/audit/。
  const suTrio = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, trioProject());
  assert.equal(allows(suTrio, "docs/audit/shell-gate.jsonl"), false, "su（trio 归档）不得写 shell 审计");
  const suSingle = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, singleProject());
  assert.equal(allows(suSingle, "docs/audit/shell-gate.jsonl"), false, "su（single 内置）不得写 shell 审计");
  // 应用边界（唯一合法写入者）可写。
  const app = appGovernanceBoundary({ accepted: true, source: "app:audit" });
  assert.equal(allows(app, "docs/audit/shell-gate.jsonl"), true);
});

// —————————————————————— 6) resolveGovernanceRole 公共出口 ——————————————————————

test("resolveGovernanceRole：single 只认 su；trio 缺省仍 rapporteur/proposal，按 roleId/function 解析（含 liaison）", async () => {
  const singleRoot = join(ROOT, "single-listing");
  mkdirSync(join(singleRoot, "角色卡", "旧角色"), { recursive: true });
  writeFileSync(join(singleRoot, "角色卡", "旧角色", "role-card.md"), "# 旧角色");
  writeFileSync(
    join(singleRoot, "角色卡", "旧角色", "boundary.yaml"),
    "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n",
  );
  const single = await listProject(singleRoot);
  assert.deepEqual(resolveGovernanceRole(single), { roleId: "su", function: null, model: "single" });
  assert.throws(() => resolveGovernanceRole(single, { function: "proposal" }), /旧治理模型/);
  assert.throws(() => resolveGovernanceRole(single, { roleId: "rapporteur" }), /旧治理模型/);

  const trioRoot = join(ROOT, "trio-listing-resolve");
  mkdirSync(join(trioRoot, ".ans"), { recursive: true });
  writeFileSync(join(trioRoot, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const trio = await listProject(trioRoot);
  // 缺省职能**仍是 proposal**（共享解析器语义不变；CLI 不提供 Liaison，见评审 §4.5/§4.6）。
  assert.deepEqual(resolveGovernanceRole(trio), { roleId: "rapporteur", function: "proposal", model: "trio" });
  assert.deepEqual(resolveGovernanceRole(trio, { function: "nomination" }), {
    roleId: "nominator",
    function: "nomination",
    model: "trio",
  });
  assert.deepEqual(resolveGovernanceRole(trio, { roleId: "convener" }), {
    roleId: "convener",
    function: "schedule",
    model: "trio",
  });
  assert.deepEqual(resolveGovernanceRole(trio, { roleId: "liaison" }), {
    roleId: "liaison",
    function: "liaison",
    model: "trio",
  });
  assert.deepEqual(resolveGovernanceRole(trio, { function: "liaison" }), {
    roleId: "liaison",
    function: "liaison",
    model: "trio",
  });
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "su" }), /已归档/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "su" }),
    /liaison\/rapporteur\/nominator\/convener/,
    "su 归档文案列四人",
  );
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "rapporteur", function: "schedule" }), /不一致/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "实现者" }),
    /liaison\/rapporteur\/nominator\/convener/,
    "未知角色文案列四人",
  );
});
