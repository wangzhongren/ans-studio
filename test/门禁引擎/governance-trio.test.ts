// 门禁引擎测试：治理三权分立 V1（W0 契约 + W1 门禁）；2026-10-18 起五个内置治理角色
//
// 依据：客户 2026-10-17 拍板（V1 + V1b 分期；新项目 trio、旧项目默认 single 兼容；迁移后 su
// 隐藏/不可开启/历史只读；三人基本只读 shell；账本在 `.ans/governance/ledger.jsonl`；
// `rapporteur` 提案权 / `nominator` 提名权 / `convener` 编排权，无任何角色自动拥有最终批准权）。
// 2026-10-18 客户拍板「三权不变、角色四名」：新增 `liaison` 沟通权（客户沟通），作为 trio
// 默认主入口；旧 trio 项目自动获得 Liaison，`governanceModel` 仍为 `"trio"`，single/su 不变。
// 2026-10-18 客户拍板「都按推荐的来」：新增第五个内置治理角色 `verifier`（Proof / 验收，
// 验收权不是批准权），并统一显示名（Lead 主理 / Draft 提案 / Crew 组队 / Steward 统筹 / Proof 验收）。
// 2026-10-19 客户新规则：所有角色都有 shell 权限（含读写与任意命令），但一律提交审批、按原有流程
// 审批 ⇒ 五个内置治理角色统一 `shell: "operator-approve"`（只读白名单直接执行、其余逐条审批）。
// 2026-10-19 客户批准工程质量基线（原话「可以，按你说的改」）：五张卡逐字复用
// `ENGINEERING_QUALITY_BASELINE`，各带角色专属质量职责；验收前必须真实启动应用并演示，未演示不得
// 建议验收通过。
// 2026-10-19 客户架构批评（原话「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个
// 架构方案啊。」）：基线新增「架构与可扩展性」，五卡各带架构职责——Draft 缺「架构方案」/「架构影响
// 分析」不得建议 accept、不得进入实现；Lead 把演进诉求写进 acceptance 但不替客户决定架构；Crew 写区
// 与架构模块一一对应且禁止重叠；Steward 流程/派发引用架构模块并含 contract-freeze 与集成/端到端
// 步骤；Proof 核对实现与架构声明一致、缺章节或偏离声明不得建议 accept。
// 2026-10-23 客户闸门 2 确认并授权实施目录级授权（directory-ownership；T3）：只改 Convener/Crew/Verifier
// 卡文本——团队计划 v3（`teamPlanSchema: 3`/`directories`/模块清单 `实现目录` 必填/角色表 `授权目录`+
// `精确写集`/目录规范表/唯一 owner/不重叠/共享策略/治理关键路径精确授权/readiness 目录列）、Crew 按计划
// 目录写边界且不得跨目录/改规范/new 更宽、Verifier 核对布局报告与原始证据且不把结构通过当语义正确；
// 注册表 entries/forbidden/preauthorized、能力位、id/显示名与工程基线零变化。
// 实施口径：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.1–§5.6、§九-1/3/4/12/15；`2026-10-18_design_governance-liaison-review.md` §4.1–§4.7。
//
// 本文件钉住本角色（门禁引擎）的 W0+W1 交付（五角色）：
//  1. `GovernanceModel` / `GovernanceFunction` 类型与 `ProjectConfig/ResolvedRole/ProjectListing` 字段；
//  2. 内置注册表：五人顺序/职能/卡文本/Section 1/预授权/禁写/能力矩阵；旧 su 常量仍单点；
//  3. `listProject`：新空项目 trio（已由 list-project.test.ts 覆盖细节）、显式模型、旧项目 single；
//  4. `resolveBoundarySection`：trio 五人边界来自注册表（不读治理边界文档条目）、接受证据规则、
//     su 归档、single 下 trio 角色不可用；single/su 既有四分支不变；
//  5. `resolveRole` / `resolveGovernanceRole`：卡文本、governanceFunction、保留 id、归档拒绝；
//  6. 写权矩阵：五人可写范围与越界拒绝；应用专用治理边界只放行三项应用写路径；
//  7. 五人 `forbiddenWritePaths` 覆盖应用独占路径与其他治理角色资料（按段比较，不实现 glob）。
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
  BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE,
  BUILT_IN_GOVERNANCE_ROLES,
  ENGINEERING_QUALITY_BASELINE,
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

test("注册表：五内置顺序 liaison→rapporteur→nominator→convener→verifier，职能含 liaison/proposal/nomination/schedule/verification", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.function),
    ["liaison", "proposal", "nomination", "schedule", "verification"],
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.displayName),
    ["主理", "提案", "组队", "统筹", "验收"],
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
    nominator: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.entries.map((e) => e.path), expected[spec.id], `${spec.id} 条目`);
    assert.ok(spec.entries.every((e: BoundaryEntry) => e.root === "project"), `${spec.id} 条目 root`);
    const kinds = spec.entries.map((e) => `${e.path}:${e.kind}`);
    assert.ok(kinds.every((k) => k.endsWith(":file") || k.endsWith(":directory")), "不用条件目录/glob");
  }
});

test("注册表：预授权目录按治理分工调整（Crew 移除 nominations；Convener +scheduling；Verifier +acceptance；其余不变）", () => {
  assert.deepEqual(governanceRoleOf("liaison")?.preauthorizedDirs, ["docs/intents/"]);
  assert.deepEqual(governanceRoleOf("rapporteur")?.preauthorizedDirs, [
    "docs/proposals/",
    "docs/contracts/",
    "docs/governance/rapporteur/",
  ]);
  assert.deepEqual(governanceRoleOf("nominator")?.preauthorizedDirs, [
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/nominator/",
  ]);
  assert.deepEqual(governanceRoleOf("convener")?.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.equal(governanceRoleOf("nominator")?.preauthorizedDirs.includes("docs/nominations/"), false);
  assert.equal(governanceRoleOf("nominator")?.preauthorizedDirs.includes("角色卡/"), false);
  assert.equal(governanceRoleOf("convener")?.preauthorizedDirs.includes("角色卡/"), false);
  assert.equal(governanceRoleOf("convener")?.preauthorizedDirs.includes("docs/workflow.md"), false);
  assert.equal(governanceRoleOf("convener")?.preauthorizedDirs.includes("docs/scheduling/"), true);
  assert.deepEqual(governanceRoleOf("verifier")?.preauthorizedDirs, [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
});

test("注册表：能力矩阵——Lead 沟通+交接+intent-confirm+派发协调；Steward 派发/看护/恢复；Crew 独享技能/MCP；Proof 只验收", () => {
  const l = governanceRoleOf("liaison")!.capabilities;
  const r = governanceRoleOf("rapporteur")!.capabilities;
  const n = governanceRoleOf("nominator")!.capabilities;
  const c = governanceRoleOf("convener")!.capabilities;
  const v = governanceRoleOf("verifier")!.capabilities;
  // Lead：客户卡通道只用于 intent-confirm（白名单由编排限制）；2026-10-20 客户拍板兼任工作流管理者，
  // 获得 dispatch_task（协调任务）能力；其余能力仍关。
  assert.equal(l.customerInput, true, "Lead 仅用于 intent-confirm 卡");
  assert.equal(l.handOffIntent, true, "Lead 独享 hand_off_intent");
  assert.equal(l.requestClarification, false);
  assert.equal(l.dispatchTask, true, "Lead 作为工作流管理者可派发协调任务（客户 2026-10-20）");
  assert.deepEqual(
    [l.roleStatus, l.sessionTail, l.proposeRecovery, l.installSkill, l.installMcp],
    [false, false, false, false, false],
  );
  assert.equal(l.shell, "operator-approve", "Lead 也接审批档（客户 2026-10-19：所有角色 shell 均经审批）");
  // 其余四人保留客户确认通道；仅 Draft 有澄清工具；Proof 只验收。
  for (const cap of [r, n, c, v]) assert.equal(cap.customerInput, true, "四人都保留客户确认通道");
  assert.deepEqual(
    [l.handOffIntent, r.handOffIntent, n.handOffIntent, c.handOffIntent, v.handOffIntent],
    [true, false, false, false, false],
  );
  assert.deepEqual(
    [l.requestClarification, r.requestClarification, n.requestClarification, c.requestClarification, v.requestClarification],
    [false, true, false, false, false],
  );
  assert.deepEqual(
    [r.dispatchTask, n.dispatchTask, c.dispatchTask, v.dispatchTask],
    [false, false, true, false],
  );
  assert.deepEqual([r.roleStatus, n.roleStatus, c.roleStatus, v.roleStatus], [false, false, true, false]);
  assert.deepEqual([r.sessionTail, n.sessionTail, c.sessionTail, v.sessionTail], [false, false, true, false]);
  assert.deepEqual(
    [r.proposeRecovery, n.proposeRecovery, c.proposeRecovery, v.proposeRecovery],
    [false, false, true, false],
  );
  assert.deepEqual([r.installSkill, n.installSkill, c.installSkill, v.installSkill], [false, true, false, false]);
  assert.deepEqual([r.installMcp, n.installMcp, c.installMcp, v.installMcp], [false, true, false, false]);
  assert.deepEqual(
    [r.shell, n.shell, c.shell, v.shell],
    ["operator-approve", "operator-approve", "operator-approve", "operator-approve"],
    "客户 2026-10-19：五个内置治理角色统一审批档（Convener 不再只读档）",
  );
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

test("客户 2026-10-19：五内置角色统一 shell 审批档（operator-approve），卡文本含审批与读写语义", () => {
  // 客户原文：「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，
  // 只不过都要提交审批，按照原有的流程审批。」⇒ 不再有 `none`/`readonly`，su 保持审批档。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} 须为审批档`);
    assert.match(spec.cardText, /shell 审批档——只读白名单直接执行/, `${spec.id} 卡文本须写明只读白名单直接执行`);
    assert.match(spec.cardText, /逐条提交客户\/判断 agent 审批/, `${spec.id} 卡文本须写明逐条审批`);
    assert.match(spec.cardText, /含读写与任意命令/, `${spec.id} 卡文本须含读写语义`);
    assert.match(spec.cardText, /审批不改变你的职责与写边界/, `${spec.id} 卡文本须写明审批不改变职责与写边界`);
    assert.match(spec.cardText, /Section 1 边界内的写入是预授权/, `${spec.id} 卡文本须写明边界内写入预授权`);
    assert.match(spec.cardText, /不需要逐次发 `request_confirmation` 写卡/, `${spec.id} 卡文本须写明不逐次确认`);
    assert.match(spec.cardText, /拒绝、超时、通道不可用一律不放行/, `${spec.id} 卡文本须写明 fail-closed`);
    // 旧表述不得残留（特别防 Convener 的「只读档」与其余角色的「不接 shell」）。
    assert.doesNotMatch(spec.cardText, /shell 面 `none`/, `${spec.id} 不得残留无 shell 表述`);
    assert.doesNotMatch(spec.cardText, /执行类 shell 留给项目角色/, `${spec.id} 不得残留「执行类 shell 留给项目角色」`);
    assert.doesNotMatch(spec.cardText, /shell 面：\*\*只读档\*\*/, `${spec.id} 不得残留只读档表述`);
  }
  assert.equal(LEGACY_SU_CAPABILITIES.shell, "operator-approve", "su 保持审批档（既有行为不变）");
});

test("客户 2026-10-19：五张卡逐字复用工程质量基线，并各带角色专属质量职责（含真实启动演示硬要求）", () => {
  // 客户批准原话：「可以，按你说的改」。基线是单一来源常量 `ENGINEERING_QUALITY_BASELINE`，五卡逐字
  // 复用；「验收前必须真实启动应用并演示」是硬要求：没有真实启动/演示证据不得建议验收通过。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    assert.ok(t.includes(ENGINEERING_QUALITY_BASELINE), `${spec.id} 卡须逐字包含工程质量基线`);
    for (const keyword of [
      "正确性",
      "健壮性",
      "安全",
      "可维护性",
      "测试",
      "演示",
      // 客户 2026-10-19 架构批评：基线新增条目的关键字也必须在每张卡上可见。
      "架构与可扩展性",
      "模块分解",
      "依赖方向",
      "扩展点",
      "版本/迁移/兼容/弃用策略",
      "架构影响分析",
    ]) {
      assert.ok(t.includes(keyword), `${spec.id} 卡须含质量基线关键字「${keyword}」`);
    }
    assert.match(t, /你的质量职责/, `${spec.id} 卡须写明角色专属质量职责`);
    assert.match(t, /验收前必须真实启动应用并演示/, `${spec.id} 卡须含真实启动并演示的硬要求`);
    assert.match(t, /客户明确选原型档才可放宽/, `${spec.id} 卡须写明默认生产档、仅客户可放宽`);
    assert.match(t, /不得为保绿弱化断言/, `${spec.id} 卡须禁止为保绿弱化测试断言`);
  }
  // Lead / 主理：意图阶段确认质量档位（未指定默认生产），并把基线写进意图 acceptance。
  const l = governanceRoleOf("liaison")!.cardText;
  assert.match(l, /意图阶段必须与客户确认质量档位/, "Lead 须在意图阶段确认质量档位");
  assert.match(l, /客户未指定时默认生产档/, "Lead 未指定时默认生产档");
  assert.match(l, /写入意图文件的 acceptance/, "Lead 须把质量基线写入意图 acceptance");
  // Draft / 提案：提案必须有「质量基线与证据计划」一节，验收标准覆盖基线，不得只写功能验收。
  const r = governanceRoleOf("rapporteur")!.cardText;
  assert.match(r, /「质量基线与证据计划」一节/, "Draft 提案须含「质量基线与证据计划」一节");
  assert.match(r, /逐项对应上面的基线/, "Draft 证据计划须逐项对应基线");
  assert.match(r, /不得只写功能验收/, "Draft 验收标准不得只写功能验收");
  // Crew / 组队：项目角色卡继承基线并逐角色写明质量职责；测试角色卡须负例/边界/重启/权限用例。
  const n = governanceRoleOf("nominator")!.cardText;
  assert.match(n, /项目角色卡必须继承工程质量基线/, "Crew 角色卡须继承质量基线");
  assert.match(n, /为每个角色写明其质量职责/, "Crew 须为每个角色写明质量职责");
  assert.match(n, /负例、边界、重启恢复与权限用例/, "测试角色卡须要求负例/边界/重启/权限用例");
  // Steward / 统筹：流程与派发带基线与真实演示；执行/证据步骤必须含「真实启动应用并演示」。
  const c = governanceRoleOf("convener")!.cardText;
  assert.match(c, /`dispatch_task` 的任务描述必须带工程质量基线/, "Steward 派发任务须带质量基线");
  assert.match(
    c,
    /执行与证据步骤（如 `verification-evidence`）必须包含「真实启动应用并演示」/,
    "Steward 须把真实演示写进执行/证据步骤",
  );
  assert.match(c, /未演示不得进入验收/, "Steward 未演示不得进入验收");
  // Proof / 验收：逐项核对基线；无真实启动/演示证据不得建议 accept；不得以「工具无 shell」跳过核对。
  const v = governanceRoleOf("verifier")!.cardText;
  assert.match(v, /验收必须逐项核对工程质量基线/, "Proof 须逐项核对质量基线");
  assert.match(v, /没有真实启动\/演示证据/, "Proof 须要求真实启动/演示证据");
  assert.match(v, /不得建议 accept/, "Proof 无证据不得建议 accept");
  assert.match(v, /明确退回或要求补做/, "Proof 无证据须退回或要求补做");
  assert.match(v, /不得以「工具无 shell」为由跳过可执行的核对/, "Proof 不得以「工具无 shell」为由跳过核对");
});

test("客户 2026-10-19 架构批评：基线新增「架构与可扩展性」，五卡各带架构职责（Draft 缺章节不得 accept/进入实现）", () => {
  // 客户原话：「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个架构方案啊。」
  // 真机证据：R1 提案只有意图/交付物/数据模型/API/权限/状态机/分页/前端/测试/README/验收/分工/风险；
  // R3 提案只有状态机/权限/统计/契约/测试/分工/风险——两者都没有模块分解、依赖方向、扩展点、
  // 数据/契约版本与迁移策略。基线为单一来源常量，五卡逐字复用；角色专属职责按卡逐条钉死。
  const baseline = ENGINEERING_QUALITY_BASELINE;
  assert.ok(baseline.includes("- 架构与可扩展性："), "基线须含「架构与可扩展性」条");
  for (const keyword of [
    "模块分解",
    "依赖方向（无环）",
    "扩展点明确",
    "版本/迁移/兼容/弃用策略",
    "横切关注点",
    "架构影响分析",
  ]) {
    assert.ok(baseline.includes(keyword), `基线「架构与可扩展性」须含关键字「${keyword}」`);
  }

  // Draft / 提案：必须含「架构方案」（新项目）或「架构影响分析」（变更），覆盖五项；缺失不得建议
  // accept、不得进入实现；给客户看的提案卡内容必须包含该章节。
  const r = governanceRoleOf("rapporteur")!.cardText;
  assert.ok(
    r.includes("「架构方案」（新项目）或「架构影响分析」（变更）一节"),
    "Draft 提案须含「架构方案」/「架构影响分析」一节",
  );
  assert.ok(
    r.includes("模块分解与职责、依赖方向（无环）、扩展点（改哪里/不改哪里）"),
    "Draft 架构章节须覆盖模块分解/依赖方向/扩展点",
  );
  assert.ok(
    r.includes("数据 schema 与 API 契约的版本/迁移/兼容/弃用策略"),
    "Draft 架构章节须覆盖 schema 与契约的版本/迁移/兼容/弃用策略",
  );
  assert.ok(r.includes("横切关注点归属"), "Draft 架构章节须覆盖横切关注点归属");
  assert.ok(
    r.includes("缺少「架构方案」/「架构影响分析」或未覆盖上述各项时，不得建议 accept，也不得进入实现"),
    "Draft 缺架构章节不得建议 accept、不得进入实现",
  );
  assert.ok(r.includes("客户在提案卡上看到的内容必须包含它"), "Draft 提案卡给客户看的内容须含架构章节");

  // Lead / 主理：客户提到演进/规模/未来需求时写入 acceptance；不得替客户决定架构。
  const l = governanceRoleOf("liaison")!.cardText;
  assert.ok(l.includes("客户提到演进/规模/未来需求"), "Lead 须识别演进/规模/未来需求");
  assert.ok(l.includes("必须把可扩展性诉求写入 acceptance"), "Lead 须把可扩展性诉求写入意图 acceptance");
  assert.ok(l.includes("不自行替客户决定架构"), "Lead 不得自行替客户决定架构");

  // Crew / 组队：写区与角色卡同架构模块一一对应，禁止重叠；每个模块有明确属主。
  const n = governanceRoleOf("nominator")!.cardText;
  assert.ok(
    n.includes("写区（boundary.yaml）与角色卡必须与团队计划的 `授权目录`/`精确写集` 一一对应"),
    "Crew 写区与角色卡须与团队计划授权目录/精确写集一一对应",
  );
  assert.ok(n.includes("并与提案中的架构模块/`实现目录` 对应"), "Crew 写区仍须对应提案架构模块/实现目录");
  assert.ok(n.includes("禁止写区重叠"), "Crew 禁止写区重叠");
  assert.ok(n.includes("每个目录/模块必须有明确属主"), "Crew 每个目录/模块须有明确属主");

  // Steward / 统筹：流程与派发引用架构模块/边界；contract-freeze 与集成/端到端步骤必须存在。
  const c = governanceRoleOf("convener")!.cardText;
  assert.ok(c.includes("必须引用提案中的架构模块/边界"), "Steward 流程与派发须引用架构模块/边界");
  assert.ok(c.includes("contract-freeze 步骤"), "Steward 流程须含 contract-freeze 步骤");
  assert.ok(c.includes("集成/端到端步骤"), "Steward 流程须含集成/端到端步骤");
  assert.ok(c.includes("两者缺一不得进入验收"), "Steward 缺 contract-freeze 或集成/端到端不得进入验收");

  // Proof / 验收：核对实现与架构声明一致；缺章节或实现偏离声明不得建议 accept。
  const v = governanceRoleOf("verifier")!.cardText;
  assert.ok(v.includes("验收必须核对实现与提案的架构声明一致"), "Proof 须核对实现与架构声明一致");
  assert.ok(
    v.includes("模块边界、依赖方向（无环）、扩展点位置、数据/契约版本与迁移策略"),
    "Proof 核对范围须含模块边界/依赖方向/扩展点/版本迁移策略",
  );
  assert.ok(v.includes("偏离声明须在核对报告中列为不通过"), "Proof 须把偏离声明列为不通过");
  assert.ok(
    v.includes("缺少「架构方案」或「架构影响分析」章节，或实现偏离架构声明时，不得建议 accept"),
    "Proof 缺架构章节或实现偏离声明时不得建议 accept",
  );
});

test("卡文本：五人均写明职能/不拥有最终批准权/可写与禁写/应用独占路径/不得建额外治理角色", () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    assert.match(t, /不拥有最终批准权/, `${spec.id} 须写明无最终批准权`);
    assert.match(t, /可写目录（Section 1）/, `${spec.id} 须列可写目录`);
    assert.match(t, /禁写路径/, `${spec.id} 须列禁写路径`);
    assert.match(t, /只能由应用写/, `${spec.id} 须写明应用独占写路径`);
    assert.match(t, /\.ans\/\*\*/, `${spec.id} 须点名 .ans 禁写`);
    assert.match(t, /不得创建额外的治理角色/, `${spec.id} 须禁止治理角色增殖`);
    // P2b（2026-10-18 judge 治理卡评审 §15.2）：四张卡都须有 judge 代批纪律。
    assert.match(t, /替我审批/, `${spec.id} 须写明客户可能开启替我审批`);
    assert.match(t, /替我决策/, `${spec.id} 须写明客户可能开启替我决策`);
    assert.match(t, /judge 代批/, `${spec.id} 须写明回执标 judge 代批`);
    assert.match(t, /不得声称是客户本人点击或亲自批准/, `${spec.id} 须禁止声称客户本人点击/批准`);
    assert.match(t, /不得把代批当作扩权/, `${spec.id} 须禁止把代批当作扩权`);
    // 2026-10-22 客户确认严格口径（设计 invalid-governance-card-guard §4.5/§4.6/§6.1 N5）：
    // 治理卡缺 flowId/cardKind 不再被当旧卡回落手动——应用拒绝本次发卡、不生成客户卡、不向客户呈现，
    // 直接退回发起角色并提示补齐重发。各卡的 cardKind 白名单按真实权限逐卡收窄（下方 role 专属断言），
    // 此处只钉共同口令。
    assert.match(t, /必须带 `flowId` \+ `cardKind`/, `${spec.id} 须写死确认/选择卡参数`);
    assert.match(t, /无效治理调用/, `${spec.id} 须点名无效治理调用`);
    assert.match(t, /本次不发卡/, `${spec.id} 须说明缺项本次不发卡`);
    assert.match(t, /不生成客户卡/, `${spec.id} 须说明缺项不生成客户卡`);
    assert.match(t, /未向客户呈现/, `${spec.id} 须说明缺项未向客户呈现`);
    assert.match(t, /直接退回并提示补齐重发/, `${spec.id} 须说明缺项直接退回并提示补齐重发`);
    assert.match(t, /补齐两项重发/, `${spec.id} 须要求补齐两项重发`);
    // 旧「缺项被当旧卡、判断 agent 不介入并回落手动」口径必须消失。注意 nominator 卡另有一处
    // 「物证缺失回落手动」（任命卡物证门槛，见下方顺序用例），属不同语义，不能被本反向断言误伤。
    assert.doesNotMatch(t, /会被当作旧卡/, `${spec.id} 不得再称缺项被当旧卡`);
    assert.doesNotMatch(t, /判断 agent 不介入并回落手动/, `${spec.id} 不得再称缺项回落手动`);
    // 真机 2026-10-18：文件名去 `-v1` 推导 flowId；多写 `-nomination` 会被当独立流程拒绝。
    assert.match(t, /`docs\/proposals\/<flowId>-v1\.md`/, `${spec.id} 须写死提案命名`);
    assert.match(t, /`docs\/scheduling\/<flowId>-team-v1\.md`/, `${spec.id} 须写死团队计划命名`);
    assert.match(t, /`docs\/nominations\/<flowId>-v1\.md`/, `${spec.id} 须写死旧提名命名`);
    assert.match(t, /legacy（只读历史\/过渡/, `${spec.id} 须把旧提名标为 legacy`);
    assert.match(t, /不得在文件名里加 `-nomination` 等额外后缀/, `${spec.id} 须禁止提名额外后缀`);
    assert.match(t, /`docs\/flows\/<flowId>\.yaml`/, `${spec.id} 须写死流程 YAML 机器状态命名`);
    assert.match(t, /唯一机器状态/, `${spec.id} 须写明 YAML 是唯一机器状态`);
    assert.match(t, /`docs\/flows\/<flowId>\.md`/, `${spec.id} 须写死流程 Markdown 人读视图命名`);
    assert.match(t, /仅人读视图/, `${spec.id} 须写明 Markdown 仅人读视图`);
    assert.match(t, /`docs\/intents\/<flowId>\.md`/, `${spec.id} 须写死意图命名`);
    assert.match(t, /按文件名推导 flowId/, `${spec.id} 须说明 flowId 推导规则`);
    assert.match(t, /当作独立流程/, `${spec.id} 须说明命名不符的后果`);
  }
  // Lead：沟通权 + 交接约定 + intent-confirm 需求确认；卡参数纪律按五卡统一写死。
  const l = governanceRoleOf("liaison")!.cardText;
  assert.match(l, /客户沟通/);
  assert.match(l, /客户沟通 · 不拥有最终批准权/);
  assert.match(l, /hand_off_intent/);
  assert.match(l, /docs\/intents\//);
  // cardKind 白名单按真实权限收窄：Lead 只出 intent-confirm；不做治理写盘确认。
  assert.match(l, /只用 `intent-confirm`/);
  assert.match(l, /不使用 `request_confirmation` 做治理写盘/);
  // 客户 2026-10-18：意图确认卡——写完意图文件先复述目标/范围/验收，confirm 后才交接。
  assert.match(l, /`cardKind=intent-confirm`/, "Lead 须写死 intent-confirm 卡");
  assert.match(l, /选项固定为 `confirm` \/ `revise`/, "intent-confirm 选项固定 confirm/revise");
  assert.match(l, /客户或判断 agent 代批 `confirm` 后才能调用 `hand_off_intent`/, "confirm 后才可交接");
  assert.match(l, /客户开启「替我决策」时，判断 agent 可代批 `confirm`/, "替我决策时 intent-confirm 可代批 confirm");
  assert.match(l, /`revise` 永远不由判断代选/, "revise 永不由判断代选");
  assert.match(l, /代批不是客户逐项批准、不改写客户意图/, "代批不是客户逐项批准");
  assert.match(l, /选 `revise` 时先按反馈修改意图文件/, "revise 先改意图、不得交接");
  // 客户 2026-10-18：`[系统·治理反馈]` 由 Lead 汇总后告知客户，不得逐字转述内部报告。
  assert.match(l, /收到 `\[系统·治理反馈\]` 时：用 1-3 句话向客户汇总/, "Lead 须汇总治理反馈");
  assert.match(l, /不要逐字转述内部报告/, "Lead 不得逐字转述内部报告");
  assert.match(l, /不要声称客户已批准或已验收/, "Lead 不得声称客户已批准/验收");
  // Draft：不再自称客户沟通主入口；改读意图 + 澄清工具。
  const r = governanceRoleOf("rapporteur")!.cardText;
  assert.match(r, /提案权/);
  assert.match(r, /docs\/intents\//);
  assert.match(r, /request_clarification/);
  assert.doesNotMatch(r, /理解客户意图、沟通/, "客户沟通已拆给 Lead");
  assert.match(governanceRoleOf("rapporteur")!.cardText, /cardKind/);
  // cardKind 白名单收窄：Draft 只出 proposal 选择卡与 write 写盘卡；验收卡已归 Proof。
  assert.match(r, /只用 `proposal`/);
  assert.match(r, /只用 `write`/);
  assert.doesNotMatch(r, /cardKind=acceptance/, "验收卡归 Proof / 验收，Draft 不得发起");
  const n = governanceRoleOf("nominator")!.cardText;
  assert.match(n, /写卡权（客户任命后）/);
  assert.match(n, /appointment/);
  assert.match(n, /cardKind/);
  // 2026-10-22 治理分工：Crew 不再提名、不再发 appointment 选择卡；只按团队计划与任命名单写卡。
  assert.doesNotMatch(n, /提名权/);
  assert.doesNotMatch(n, /只用 `appointment`/);
  assert.match(n, /不再发 appointment 卡/);
  assert.match(n, /`appointment-write` \/ `write`/);
  // 真机 2026-10-18（hello-cli-minimal）：五个内置治理角色不可候选/推荐/任命；verifier 是内置 Proof。
  assert.match(n, /`liaison` \/ `rapporteur` \/ `nominator` \/ `convener` \/ `verifier`/);
  assert.match(n, /\*\*不可作为候选、不可推荐、不可任命\*\*/);
  assert.match(n, /不得写 `角色卡\/<内置 id>\/`/);
  assert.match(n, /不要创建\/推荐名为 verifier 的项目角色/);
  assert.match(n, /实现交付通常只需任命项目角色/);
  assert.match(n, /只列\*\*项目角色\*\* id/);
  assert.match(governanceRoleOf("convener")!.cardText, /编排权/);
  assert.match(governanceRoleOf("convener")!.cardText, /shell 审批档——只读白名单直接执行/);
  assert.match(governanceRoleOf("convener")!.cardText, /schedule-write/);
  assert.match(governanceRoleOf("convener")!.cardText, /应用后台派发/, "客户 appointment 决定后由应用后台派发写卡任务给 Crew");
  // Steward：可发 appointment 选择卡（仅此一种治理选择卡）；确认卡 schedule-write / write。
  assert.match(governanceRoleOf("convener")!.cardText, /`schedule-write` \/ `write`/);
  assert.match(
    governanceRoleOf("convener")!.cardText,
    /每次 `request_choice` 必须带 `flowId` \+ `cardKind`（只用 `appointment`）/,
    "Steward 仅 appointment 一种治理选择卡",
  );
  assert.doesNotMatch(governanceRoleOf("convener")!.cardText, /不用 `request_choice` 出治理卡/);
  // 派发拒绝清单统一为五个内置 id（含 verifier）。
  assert.match(
    governanceRoleOf("convener")!.cardText,
    /`liaison` \/ `rapporteur` \/ `nominator` \/ `convener` \/ `verifier`/,
  );
  // Proof：验收权（不是批准权），写验收标准/报告、证据附件与自身治理记录，不派发/不任命/不交接/不装技能。
  const v = governanceRoleOf("verifier")!.cardText;
  assert.match(v, /验收权（不是批准权）/);
  assert.match(v, /`cardKind=acceptance`/, "Proof 出验收卡");
  assert.match(v, /选项 id 固定为\s*`accept` \/ `reject`/, "验收选项 accept/reject");
  assert.match(v, /docs\/acceptance\//);
  assert.match(v, /docs\/verification\//);
  assert.match(v, /docs\/governance\/verifier\//);
  assert.match(v, /不派发、不任命、不交接、不安装技能\/MCP/);
  assert.match(v, /shell 审批档——只读白名单直接执行/);
  // Proof：只出 acceptance 选择卡与 write 写盘卡。
  assert.match(v, /只用 `acceptance`/);
  assert.match(v, /只用 `write`/);
  // 客户 2026-10-19 决定（原文「这些全部改成yaml。」）：流程状态唯一机器来源改为 YAML；
  // Convener 卡写死 YAML 模板，Markdown 表格不再承载状态（旧模板必须消失）。
  const convenerCard = governanceRoleOf("convener")!.cardText;
  const flowYaml = [
    "```yaml",
    "flowId: <flowId>",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: contract-freeze",
    "    title: 冻结跨角色契约",
    "    owner: <项目角色 id>",
    "    kind: artifact",
    "    status: done",
    "    evidence:",
    "      kind: artifact",
    "      ref: docs/contracts/<name>-v1.md",
    "  - id: build-scaffold",
    "    title: 工程脚手架（包/TS/构建/测试配置与入口骨架，typecheck 与最小测试可跑）",
    "    owner: <工程角色 id>",
    "    kind: dispatch",
    "    status: pending",
    "    dependsOn: [contract-freeze]",
    "  - id: delivery-checkout-api",
    "    title: Map A｜checkout-api 交付",
    "    owner: <项目角色 id>",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: map-a",
    "    dependsOn: [contract-freeze, build-scaffold]",
    "  - id: delivery-checkout-web",
    "    title: Map A｜checkout-web 交付",
    "    owner: <项目角色 id>",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: map-a",
    "    dependsOn: [contract-freeze, build-scaffold]",
    "  - id: test-map-shards",
    "    title: Map 测试分片（按模块并行）",
    "    owner: <测试角色 id>",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: reduce",
    "    dependsOn: [delivery-checkout-api, delivery-checkout-web]",
    "  - id: integration-e2e",
    "    title: Reduce｜契约/集成/端到端",
    "    owner: <测试角色 id>",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: reduce",
    "    dependsOn: [test-map-shards]",
    "  - id: verification-evidence",
    "    title: 真实启动应用并演示",
    "    owner: <项目角色 id>",
    "    kind: artifact",
    "    status: pending",
    "    parallelGroup: reduce",
    "    dependsOn: [integration-e2e]",
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "```",
  ].join("\n");
  assert.ok(convenerCard.includes(flowYaml), "Convener 卡须含逐字 YAML 流程模板");
  assert.match(convenerCard, /`docs\/flows\/<flowId>\.yaml`/, "Convener 卡须点明 YAML 机器状态路径");
  assert.match(convenerCard, /唯一机器状态/, "Convener 卡须写明 YAML 是唯一机器状态");
  assert.match(convenerCard, /仅人读视图/, "Convener 卡须写明 Markdown 仅人读视图");
  assert.match(
    convenerCard,
    /stepId 必须与 YAML 中该步骤的 `id` 完全一致/,
    "dispatch_task 的 stepId 须与 YAML 步骤 id 一致",
  );
  assert.match(convenerCard, /派发会被拒/);
  assert.doesNotMatch(convenerCard, /\| stepId \|/, "客户 2026-10-19：不得再用 Markdown 步骤表");
  assert.doesNotMatch(convenerCard, /stepId 必须在表格第一列/, "旧表格约束必须删除");
  assert.doesNotMatch(convenerCard, /每行以 stepId 开头/, "旧表格约束必须删除");
  for (const id of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
    assert.doesNotMatch(governanceRoleOf(id)!.cardText, /\| stepId \|/, `${id} 不写流程单步骤表`);
  }
  assert.doesNotMatch(
    governanceRoleOf("convener")!.cardText,
    /客户点击入口打开 Nominator/,
    "2026-10-18 客户修正：提名步骤由应用后台派发",
  );
});

test("治理卡参数纪律（2026-10-22 客户严格口径，N5/T14）：五卡统一新文案，缺项不发卡、未向客户呈现", () => {
  // 设计 `角色卡/项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md`
  // §4.5/§4.6/§6.1 N5/§7.3 T14（客户 2026-10-22 确认 N1–N5 严格口径，O1–O7 未授权）：
  // 应用侧守卫（N1，编排实施）对治理角色缺 flowId/cardKind 的 request_confirmation 直接拒绝；
  // 卡文本必须与错误回执同口径——应用拒绝、不生成客户卡，不再把缺项当旧卡交给客户手动审批。
  const NEW_DISCIPLINE =
    "缺任何一项＝无效治理调用：本次不发卡、不生成客户卡、未向客户呈现，应用直接退回并提示补齐重发。必须补齐两项重发。";
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    assert.ok(t.includes(NEW_DISCIPLINE), `${spec.id} 卡须逐字包含新参数纪律文案`);
    assert.equal(t.split(NEW_DISCIPLINE).length - 1, 1, `${spec.id} 新参数纪律文案须恰出现一次`);
    assert.doesNotMatch(t, /会被当作旧卡/, `${spec.id} 卡不得再出现「当作旧卡」`);
    assert.doesNotMatch(t, /判断 agent 不介入并回落手动/, `${spec.id} 卡不得再出现旧「回落手动」口径`);
    // flowId + cardKind 必须同时携带的纪律保留（N5 只改后果表述，不改要求本身）。
    assert.match(t, /必须带 `flowId` \+ `cardKind`/, `${spec.id} 须保留 flowId + cardKind 同时携带纪律`);
  }
});

test("卡文本：Steward / 统筹 团队计划机器可读推荐集（appointment 卡选项来源，P1/P2）", () => {
  const t = governanceRoleOf("convener")!.cardText;
  assert.match(t, /`recommended:`/, "团队计划须给机器可读推荐集");
  assert.match(t, /`recommended: \[role-a, role-b\]`/, "推荐集必须写成同一行内联数组");
  assert.match(t, /推荐：role-a、role-b/, "固定行格式也可");
  assert.match(t, /不要用 YAML 块数组/, "YAML 块数组会解析为空推荐集");
  assert.match(t, /推荐集与卡选项一致/);
  assert.match(t, /推荐集只列项目角色，不得含五个内置治理角色 id/);
  assert.match(t, /每个推荐角色必须有 roleId、职责目标、能力要求、授权目录、精确写集、依赖行/);
  // 推荐集约定只属 Steward / 统筹（团队计划作者）；其余四张卡不得定义（避免第二份口径）。
  for (const id of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
    assert.doesNotMatch(governanceRoleOf(id)!.cardText, /recommended:/, `${id} 不定义推荐集`);
  }
});

test("卡文本：角色卡写入归属——Crew 按团队计划 appointment-write；Convener 不写卡/不建角色/无卡不派发", () => {
  const n = governanceRoleOf("nominator")!.cardText;
  assert.match(n, /读团队计划（客户确认后）/);
  assert.match(n, /只对任命名单内的角色发 `request_confirmation`/);
  assert.match(n, /计划缺能力细节、目录规范、`实现目录`[\s\S]{0,120}\*\*停止写卡并报告 Steward \/ 统筹 补充\*\*/);
  assert.match(n, /不自行扩大职责/);
  assert.match(n, /写卡全部完成且应用结构校验通过后/);
  // 2026-10-22：Crew 不再先写提名文件再弹 appointment 卡，也不再以提名文件为物证。
  assert.doesNotMatch(n, /先写提名文件/);
  assert.doesNotMatch(n, /判断 agent 以提名文件为物证/);
  assert.doesNotMatch(n, /只写提名文件/);

  const c = governanceRoleOf("convener")!.cardText;
  assert.match(c, /你不写角色卡、不创建角色/, "Steward 不写角色卡、不创建角色");
  assert.match(c, /角色由 Crew \/ 组队 在任命决定后经 `appointment-write`/, "写卡归属 Crew / 组队");
  assert.match(c, /角色不存在时不得派发/, "角色不存在时不得派发");
  assert.match(c, /不得代写角色卡/, "Steward 不得代写角色卡");
  assert.match(c, /你是 `docs\/scheduling\/<flowId>-team-v1\.md`（后续版本 `-team-v2\.md`…）的唯一作者/, "Steward 是团队计划唯一作者");
  assert.match(c, /`cardKind=appointment`/, "Steward 发 appointment 卡");
  assert.match(c, /role-readiness/, "Steward 做角色就绪复核");
  assert.match(c, /变更包/, "Steward 组变更包");

  // 五角色口径：不得残留「su 负责 appointment-write / 写角色卡」的 single 旧模型表述。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.doesNotMatch(spec.cardText, /su[^。\n]*appointment-write/, `${spec.id} 不得把写卡归给 su`);
    assert.doesNotMatch(spec.cardText, /su[^。\n]*写角色卡/, `${spec.id} 不得让 su 写角色卡`);
  }
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
  for (const id of ["liaison", "rapporteur", "nominator", "convener", "verifier", "su"]) {
    for (const writer of ["liaison", "rapporteur", "nominator", "verifier"]) {
      assert.equal(forbiddenCovers(writer, `角色卡/${id}/role-card.md`), true, `${writer} 须禁写 角色卡/${id}/`);
    }
  }
  assert.equal(forbiddenCovers("convener", "角色卡/实现者/role-card.md"), true);
  // Proof / 验收：写 docs/acceptance/、docs/verification/ 与自身治理记录；其余治理产物与应用路径全部禁写。
  for (const p of [
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "docs/intents/i.md",
    "docs/proposals/f-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/flows/f.md",
    "docs/workflow.md",
  ]) {
    assert.equal(forbiddenCovers("verifier", p), true, `verifier 须禁写 ${p}`);
  }
  assert.equal(forbiddenCovers("verifier", "docs/acceptance/criteria-v1.md"), false);
  assert.equal(forbiddenCovers("verifier", "docs/verification/r-v1.md"), false);
  assert.equal(forbiddenCovers("verifier", "docs/governance/verifier/notes.md"), false);
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
  // 2026-10-22 治理分工：Crew 移除 docs/nominations/ 写权并禁写 docs/scheduling/。
  assert.equal(forbiddenCovers("nominator", "docs/nominations/n-v1.md"), false, "nominations 不再是 Crew 禁写清单项");
  assert.equal(forbiddenCovers("nominator", "docs/scheduling/f-team-v1.md"), true, "Crew 须禁写团队计划目录");
  assert.equal(forbiddenCovers("convener", "docs/skills/s/SKILL.md"), true);
  assert.equal(forbiddenCovers("convener", "docs/mcp/m.md"), true);
  assert.equal(forbiddenCovers("convener", "docs/scheduling/f-team-v1.md"), false, "团队计划目录可写（Section 1）");
  assert.equal(forbiddenCovers("convener", "docs/acceptance/criteria-v1.md"), false, "验收目录不授予 Convener（由 Section 1 拒绝）");
});

// —————————————————————— 2) resolveBoundarySection：trio 五人 ——————————————————————

test("trio：五人边界 = 注册表条目；boundarySource=<built-in:trio/id>；接受证据沿用项目记录", async () => {
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
  assert.equal(b.entries.some((e) => e.path === "src/"), false, "治理边界文档的条目不得进入五人边界");
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

test("trio：listProject 不返回 su；resolveRole 五人返回内置卡文本与 governanceFunction", async () => {
  const root = join(ROOT, "trio-listing");
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  const listing = await listProject(root);
  assert.deepEqual(
    listing.roles.map((r) => r.roleId),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
  );
  // ProjectRoleSummary.displayName：内置角色由注册表填入统一显示名；项目角色不填。
  assert.deepEqual(
    listing.roles.map((r) => r.displayName),
    ["主理", "提案", "组队", "统筹", "验收"],
  );
  assert.equal(listing.primaryRoleId, "liaison");
  assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下 su 隐藏");

  const project = trioProject();
  for (const [id, fn] of [
    ["liaison", "liaison"],
    ["rapporteur", "proposal"],
    ["nominator", "nomination"],
    ["convener", "schedule"],
    ["verifier", "verification"],
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
  assert.match((await resolveRole("verifier", project)).cardText, /验收权（不是批准权）/);
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
  for (const id of ["liaison", "rapporteur", "nominator", "convener", "verifier"]) {
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

// —————————————————————— 4) 写权矩阵（五人越界写入被拒） ——————————————————————

test("写权：liaison 仅可写 docs/intents/**；提案/契约/提名/团队计划/验收/流程/技能/MCP/治理记录/角色卡/.ans 等一律拒", async () => {
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
    "docs/scheduling/f-team-v1.md",
    "docs/acceptance/criteria-v1.md",
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
    "docs/scheduling/f-team-v1.md",
    "docs/acceptance/criteria-v1.md",
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

test("写权：nominator 可写角色卡/技能/MCP/自身记录；nominations、团队计划、proposals、flows 等越界拒", async () => {
  const b = await resolveBoundarySection("nominator", trioProject());
  for (const p of [
    "角色卡/A/role-card.md",
    "角色卡/A/boundary.yaml",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/governance/nominator/notes.md",
  ]) {
    assert.equal(allows(b, p), true, `nominator 应可写 ${p}`);
  }
  for (const p of [
    "docs/nominations/n-v1.md",
    "docs/scheduling/f-team-v1.md",
    "docs/acceptance/criteria-v1.md",
    "docs/proposals/f-v1.md",
    "docs/flows/f.md",
    ".ans/project.json",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `nominator 越界写入应拒：${p}`);
  }
});

test("写权：convener 可写 flows/workflow/团队计划/自身记录；角色卡、提案、验收、技能、MCP、.ans 等越界拒", async () => {
  const b = await resolveBoundarySection("convener", trioProject());
  for (const p of [
    "docs/flows/f.md",
    "docs/workflow.md",
    "docs/scheduling/f-team-v1.md",
    "docs/scheduling/f-readiness-v1.md",
    "docs/scheduling/f-change-v1.md",
    "docs/governance/convener/notes.md",
  ]) {
    assert.equal(allows(b, p), true, `convener 应可写 ${p}`);
  }
  for (const p of [
    "角色卡/A/role-card.md",
    "角色卡/governance-boundary.yaml",
    "docs/proposals/f-v1.md",
    "docs/nominations/n-v1.md",
    "docs/acceptance/criteria-v1.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    ".ans/project.json",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `convener 越界写入应拒：${p}`);
  }
});

test("写权：verifier 可写 docs/acceptance/、docs/verification/ 与自身治理记录；其余越界（含角色卡/.ans/团队计划/其他 docs）一律拒", async () => {
  const b = await resolveBoundarySection("verifier", trioProject());
  for (const p of [
    "docs/acceptance/criteria-v1.md",
    "docs/acceptance/report-v1.md",
    "docs/verification/verify-v1.md",
    "docs/verification/2026-10-18/report.md",
    "docs/governance/verifier/notes.md",
  ]) {
    assert.equal(allows(b, p), true, `verifier 应可写 ${p}`);
  }
  for (const p of [
    "docs/intents/i.md",
    "docs/proposals/f-v1.md",
    "docs/contracts/c-v1.md",
    "docs/nominations/n-v1.md",
    "docs/scheduling/f-team-v1.md",
    "docs/flows/f.md",
    "docs/skills/s/SKILL.md",
    "docs/mcp/m.md",
    "docs/workflow.md",
    "角色卡/A/role-card.md",
    "角色卡/verifier/role-card.md",
    "角色卡/governance-boundary.yaml",
    ".ans/project.json",
    ".ans/governance/ledger.jsonl",
    "docs/bootstrap-manifest.md",
    "src/x.ts",
  ]) {
    assert.equal(allows(b, p), false, `verifier 越界写入应拒：${p}`);
  }
});

test("写权矩阵（2026-10-22 治理分工 P6）：只调整 Convener/Crew/Verifier，其他角色与关键禁区不变", async () => {
  const crew = await resolveBoundarySection("nominator", trioProject());
  const steward = await resolveBoundarySection("convener", trioProject());
  const proof = await resolveBoundarySection("verifier", trioProject());
  const lead = await resolveBoundarySection("liaison", trioProject());
  const draft = await resolveBoundarySection("rapporteur", trioProject());

  // Convener +docs/scheduling/，但仍不得写角色卡。
  assert.equal(allows(steward, "docs/scheduling/flow-a-team-v1.md"), true);
  assert.equal(allows(steward, "docs/scheduling/flow-a-readiness-v1.md"), true);
  assert.equal(allows(steward, "docs/scheduling/flow-a-change-v1.md"), true);
  assert.equal(allows(steward, "角色卡/实现者/role-card.md"), false, "Convener 不得获得角色卡写权");
  assert.equal(allows(steward, "docs/acceptance/criteria-v1.md"), false, "Convener 不得写验收目录");

  // Crew −docs/nominations/、禁写 docs/scheduling/；仍保留角色卡写权。
  assert.equal(allows(crew, "docs/nominations/flow-a-v1.md"), false, "Crew 不再写 nominations");
  assert.equal(allows(crew, "docs/scheduling/flow-a-team-v1.md"), false, "Crew 不得写团队计划");
  assert.equal(allows(crew, "角色卡/实现者/role-card.md"), true, "Crew 仍写角色卡");

  // Verifier +docs/acceptance/；不得写团队计划/角色卡。
  assert.equal(allows(proof, "docs/acceptance/flow-a-criteria-v1.md"), true);
  assert.equal(allows(proof, "docs/acceptance/flow-a-report-v1.md"), true);
  assert.equal(allows(proof, "docs/scheduling/flow-a-team-v1.md"), false);
  assert.equal(allows(proof, "角色卡/实现者/role-card.md"), false);

  // 其他角色不获得新目录写权。
  for (const [name, boundary] of [["liaison", lead], ["rapporteur", draft]] as const) {
    assert.equal(allows(boundary, "docs/scheduling/flow-a-team-v1.md"), false, `${name} 不得写团队计划`);
    assert.equal(allows(boundary, "docs/acceptance/criteria-v1.md"), false, `${name} 不得写验收目录`);
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

test("appGovernanceBoundary：docs/audit/ 只给应用——五角色与 su 写 shell 审计仍被拒", async () => {
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
  assert.deepEqual(resolveGovernanceRole(trio, { roleId: "verifier" }), {
    roleId: "verifier",
    function: "verification",
    model: "trio",
  });
  assert.deepEqual(resolveGovernanceRole(trio, { function: "verification" }), {
    roleId: "verifier",
    function: "verification",
    model: "trio",
  });
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "su" }), /已归档/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "su" }),
    /liaison\/rapporteur\/nominator\/convener\/verifier/,
    "su 归档文案列五人",
  );
  assert.throws(() => resolveGovernanceRole(trio, { roleId: "rapporteur", function: "schedule" }), /不一致/);
  assert.throws(
    () => resolveGovernanceRole(trio, { roleId: "实现者" }),
    /liaison\/rapporteur\/nominator\/convener\/verifier/,
    "未知角色文案列五人",
  );
});

// —————————————————————— 7) 2026-10-22 角色粒度/MapReduce（P1/P4/P5/P6/P10/P13） ——————————————————————

test("2026-10-22 角色粒度/MapReduce：注册表 entries/预授权/禁写/能力位零变化（不扩张写权、不改 id）", () => {
  // 本批只改 Convener/Crew/Verifier 卡文本（产品数据）；注册表写权、能力位、内部 id 必须逐字不变；
  // 显示名按 2026-10-24 客户要求改为纯中文（见下方断言）。
  const appOnly = [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"];
  const builtInDirs = [
    "角色卡/liaison/",
    "角色卡/rapporteur/",
    "角色卡/nominator/",
    "角色卡/convener/",
    "角色卡/verifier/",
    "角色卡/su/",
  ];
  const expectedEntries: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  const expectedPreauthorized: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  const expectedForbidden: Record<string, string[]> = {
    liaison: [
      ...appOnly,
      "角色卡/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/flows/",
      "docs/governance/",
      "docs/workflow.md",
    ],
    rapporteur: [...appOnly, ...builtInDirs, "docs/nominations/", "docs/flows/"],
    nominator: [...appOnly, ...builtInDirs, "docs/proposals/", "docs/flows/", "docs/scheduling/"],
    convener: [...appOnly, "角色卡/", "docs/proposals/", "docs/nominations/", "docs/skills/", "docs/mcp/"],
    verifier: [
      ...appOnly,
      ...builtInDirs,
      "docs/intents/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/flows/",
      "docs/workflow.md",
    ],
  };
  const caps = (over: Partial<Record<string, boolean>> = {}): Record<string, boolean | string> => ({
    customerInput: true,
    handOffIntent: false,
    requestClarification: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
    ...over,
  });
  const expectedCapabilities: Record<string, Record<string, boolean | string>> = {
    liaison: caps({ handOffIntent: true, dispatchTask: true }),
    rapporteur: caps({ requestClarification: true }),
    nominator: caps({ installSkill: true, installMcp: true }),
    convener: caps({
      dispatchTask: true,
      roleStatus: true,
      sessionTail: true,
      proposeRecovery: true,
    }),
    verifier: caps(),
  };

  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
    "内置角色 id/顺序不得变化",
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.displayName),
    ["主理", "提案", "组队", "统筹", "验收"],
    "显示名按 2026-10-24 客户要求改为纯中文（去掉英文别名）",
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.function),
    ["liaison", "proposal", "nomination", "schedule", "verification"],
    "GovernanceFunction 值不得变化",
  );
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.entries.map((e) => e.path), expectedEntries[spec.id], `${spec.id} Section 1 不得变化`);
    assert.deepEqual(spec.preauthorizedDirs, expectedPreauthorized[spec.id], `${spec.id} 预授权不得变化`);
    assert.deepEqual(spec.forbiddenWritePaths, expectedForbidden[spec.id], `${spec.id} 禁写路径不得变化`);
    assert.deepEqual(spec.capabilities, expectedCapabilities[spec.id], `${spec.id} 能力位不得变化`);
  }
});

test("2026-10-22 角色粒度/MapReduce：ENGINEERING_QUALITY_BASELINE 文本逐字不变（P10/P12）", () => {
  // 工程基线是客户 2026-10-19 批准的单一来源文本；本批不得改动（真实启动/演示要求不降）。
  const expected = [
    "工程质量基线（默认生产级；客户明确选原型档才可放宽）：",
    "- 正确性：验收标准逐条可演示；无 TODO/占位/假数据；边界与非法输入有明确行为。",
    "- 健壮性：输入校验与上限、错误码一致、失败不破坏已有数据；持久化原子写与重启恢复；并发/重入有明确策略。",
    "- 安全：认证/授权即使简化也要写清边界；防注入/XSS/路径穿越/CSRF；不记录密钥与敏感数据；零第三方依赖时说明理由。",
    "- 可维护性：模块边界清晰、命名一致、只在约束处注释；README 含启动、架构、API、权限、状态机、已知限制与权衡。",
    "- 架构与可扩展性：模块分解与职责、依赖方向（无环）、数据流清晰；扩展点明确（新增状态/角色/导出格式/统计维度时改哪里、不改哪里）；数据 schema 与 API 契约有版本/迁移/兼容/弃用策略；横切关注点（配置/错误/日志/鉴权/测试缝）有归属；变更类提案必须附架构影响分析（模块/边界/兼容/回滚）。",
    "- 可观测性：关键失败可诊断（结构化日志/错误信息），不静默吞错。",
    "- 性能与容量：分页/上限/超时明确；不无限增长；给出已知容量边界。",
    "- 前端：加载/空/错误态齐备；键盘可用、标签与对比度等基本可访问性；窄屏可用。",
    "- 测试：单元+集成+端到端矩阵；权限与非法路径必须有负例；测试独立于实现；不得为保绿弱化断言。",
    "- 交付：验收前必须真实启动应用并演示（启动命令、访问地址或截图/录屏）；未真实运行不得建议验收通过。",
  ].join("\n");
  assert.equal(ENGINEERING_QUALITY_BASELINE, expected, "工程质量基线文本必须逐字不变");
});

test("2026-10-22/2026-10-23 角色粒度、MapReduce 与目录授权卡文本（P1/P3/P4/P5/P10/P11/P13）：Convener/Crew 要求 v3 计划/目录规范/实现目录/readiness/flow 字段", () => {
  const c = governanceRoleOf("convener")!.cardText;
  for (const needle of [
    "teamPlanSchema: 3",
    "modules: [<module-a>, <module-b>]",
    "`module` / 职责 / 公开契约 / 架构来源 / 实现目录五列",
    "恰好覆盖 `modules` 集合",
    "**每个 module 必须有非空 `实现目录`（Q9 A）**",
    "不得写 `—`/空",
    "roleId | 类型 | module | 职责目标 | 能力要求 | 授权目录 | 精确写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由",
    "`唯一写集` 仅作 v3 兼容别名",
    "`边界` 列名在 v3 不再接受",
    "目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 | 共享",
    "一个模块一个 Map 角色、一个角色一个模块",
    "`module: reduce`",
    "无重复/孤儿/未声明模块",
    "每个目录恰好一个 owner",
    "不同角色的目录不得相同、不得互为祖先/子目录",
    "`shared: split` 的父目录除外",
    "治理关键路径不得作为普通 `授权目录`",
    "跨角色两两不相交",
    "同一 `map-*` 组内角色之间不得有依赖路径",
    "Map 角色不得依赖 Reduce",
    "每个 Reduce 角色的 dependsOn 必须直接或传递覆盖全部 Map 角色",
    "`exception-review`",
    "不得把「字段齐全」当成「粒度正确」",
    "`docs/scheduling/<flowId>-readiness-v1.md`",
    "`directories`/`spec`/`shared`/`layout`",
    "`module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity`",
    "`status: pass|gaps`",
    "delivery-<module>",
    "`parallelGroup`",
    "`dependsOn`",
    "contract-freeze",
    "Map 测试分片",
    "Reduce 前置未全部 `done` 必须硬拦",
    "旧 flow 不填这两个字段，解析/派发行为逐字不变",
    "旧步骤无 `dependsOn` 不新增检查",
    "不新增 `FlowStepKind`",
  ]) {
    assert.ok(c.includes(needle), `Convener 卡须含 v3 要求「${needle}」`);
  }
  assert.doesNotMatch(c, /cardKind=(map|reduce|parallel)/, "不得用 cardKind 表达 Map/Reduce");

  const n = governanceRoleOf("nominator")!.cardText;
  for (const needle of [
    "读目录规范与每个 module 的 `实现目录`",
    "并按 v2 读 `module` / 公开契约 / 测试面 / `dependsOn` / 并行组 / `粒度理由`",
    "bounded context（module）",
    "bounded context（module）** 与模块 **`实现目录`",
    "公开契约",
    "测试面",
    "**上下游依赖**（`dependsOn` 与交接输入输出）",
    "粒度理由",
    "`授权目录` 落目录条目（directory）、`精确写集` 落精确文件条目（file），不多不少",
    "`new` 角色边界目录与计划 `授权目录` 一致（角色根工作文档除外，不得更宽）",
    "不得改目录规范、不得跨目录、不得把他人目录并进自己边界",
    "v3 目录落卡纪律（必须）",
    "不得写整层角色",
    "纳米角色",
    "不自行补计划、不自行增删目录/模块/角色/写集",
    "计划缺 module/公开契约/测试面/`dependsOn`/粒度理由/`授权目录`/`精确写集`/目录规范/`实现目录`",
  ]) {
    assert.ok(n.includes(needle), `Crew 卡须含 v3 要求「${needle}」`);
  }
  // 沿用上轮已落地边界：Crew 不选角色、不发 appointment、不写 nominations。
  assert.doesNotMatch(n, /提名权/);
  assert.doesNotMatch(n, /只用 `appointment`/);
  assert.doesNotMatch(n, /只写 `docs\/nominations/);
  assert.match(n, /不再写 `docs\/nominations\/\*\*`、不再发 appointment 卡/);
});

// —————————————————————— 8) 2026-10-23 目录级授权（directory-ownership）卡文本负例 ——————————————————————

function assertCardIncludes(text: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label}须含「${needle}」`);
  }
}

test("2026-10-23 目录授权负例（P10/P11）：Convener 漏 `实现目录`/目录规范/readiness 目录列不得发卡或放行", () => {
  // 验收标准 v1.1（Q9 A）：v3 模块清单每个 module 的 `实现目录` 必填非空；目录规范表与 readiness
  // 的 `directories`/`spec`/`shared`/`layout` 是 v3 计划的硬要求，漏项不得被当成「计划完整」。
  const c = governanceRoleOf("convener")!.cardText;
  assertCardIncludes(
    c,
    [
      "**每个 module 必须有非空 `实现目录`（Q9 A）**",
      "不得写 `—`/空",
      "恰好覆盖 `directories`（不多、不少、不重复）",
      "缺任一项视为计划不完整，不得发 appointment 卡",
      "**逐角色/逐目录**记录 `directories`/`spec`/`shared`/`layout`",
      "结构校验通过不等于粒度/规范正确",
      "不得把「字段齐全」当成「粒度正确」",
      "不得把「字段齐全/结构通过」当成「粒度正确/规范合理」",
    ],
    "Convener 漏项负例",
  );
  // 反向：旧 v2-only 口径（只按精确写集/唯一写集发卡）不得残留。
  assert.doesNotMatch(c, /## 团队判断与团队计划（v2，必须）/, "不得残留 v2 计划章节标题");
  assert.doesNotMatch(c, /写团队计划（v2）/, "不得残留 v2 写计划口径");
  assert.doesNotMatch(c, /v2 计划 frontmatter 必须含 `teamPlanSchema: 2`/, "不得残留 v2 frontmatter 口径");
  assert.doesNotMatch(c, /唯一写集是分号分隔的精确路径\/目录/, "不得残留 v2 唯一写集语义");
});

test("2026-10-23 目录授权负例（P10）：Crew 跨目录/改规范/new 更宽/自行扩权均被禁止；不确定交回 Convener", () => {
  const n = governanceRoleOf("nominator")!.cardText;
  assertCardIncludes(
    n,
    [
      "不得改目录规范、不得跨目录、不得把他人目录并进自己边界",
      "`new` 角色边界目录与计划 `授权目录` 一致（角色根工作文档除外，不得更宽）",
      "`changed`/`existing` 计划 ⊆ 边界、更宽部分限于该角色模块实现目录/既有职责",
      "不确定性交回 Convener，不自行扩大范围",
      "不自行补计划、不自行增删目录/模块/角色/写集",
    ],
    "Crew 目录负例",
  );
  // 反向：旧 v2 口径（只按唯一写集写边界）不足以覆盖 v3 目录授权。
  assert.doesNotMatch(n, /boundary 按计划的唯一写集逐条写/, "不得残留只按唯一写集写边界的旧口径");
  assert.doesNotMatch(n, /v2 粒度落卡纪律/, "不得残留 v2 粒度落卡纪律标题");
});

test("2026-10-23 目录授权负例（P10/P12）：Proof 核对布局报告+原始证据、不把结构通过当语义正确、未真实启动/演示不得 accept", () => {
  const v = governanceRoleOf("verifier")!.cardText;
  assertCardIncludes(
    v,
    [
      "核对目录布局核对报告（改动路径 → 目录规范）与原始 `git status`/diff/候选哈希",
      "布局 fail 不得标 pass",
      "不把「字段齐全/结构通过」当成「语义正确」",
      "目录内聚、规范合理、共享必要、契约与测试面真实性以 readiness 记录与验收判断为准",
      "缺失或无法对应候选判 insufficient evidence",
      "未真实运行、未演示时不得建议 accept",
    ],
    "Proof 目录负例",
  );
  // 反向：不得把布局报告摘要当原始证据，也不得用结构通过代替语义核对。
  assert.doesNotMatch(v, /布局报告摘要即可/, "布局报告摘要不能替代原始证据");
  assert.doesNotMatch(v, /结构通过即语义正确/, "结构通过不得等同语义正确");
});

// —————————————————————— 9) 2026-10-24 治理协调（S2a）+ 独立验收（所有变更） ——————————————————————

test("2026-10-24 治理协调（S2a）：Lead 卡接报内置状态/回交、闸门 0/1 后才交接/coordinate、不直派 Crew/Proof/项目 worker、Proof 只收状态+指针、协调≠批准", () => {
  const l = governanceRoleOf("liaison")!.cardText;
  for (const needle of [
    "## 治理协调（Lead / 主理）",
    "Draft / 提案、Steward / 统筹、Crew / 组队、Proof / 验收 的状态与回交向**你**汇总",
    "维护「阶段 / 阻塞 / 下一步」视图",
    "代批 `confirm`（闸门 0 已结算）后，才用 `hand_off_intent`",
    "客户已接受提案（闸门 1 已结算）后，才用 `dispatch_task` 的 coordinate 向 Steward / 统筹 派",
    "不直接派 Crew / Proof / 项目 worker",
    "项目 worker（Map / Reduce）由 Steward / 统筹 派",
    "只收 Proof 的状态与报告指针",
    "不批准提案、任命、验收",
    "协调 ≠ 客户批准",
    "应用仍执行闸门 0/1/2",
    "你的协调不替代任何门禁",
  ]) {
    assert.ok(l.includes(needle), `Lead 治理协调卡文本须含「${needle}」`);
  }
  // Q1 口径：旧「向项目角色派发协调任务」必须消失；项目 worker 仍由 Steward 派。
  assert.doesNotMatch(l, /向 Steward \/ 统筹 与项目角色派发协调任务/);
  assert.doesNotMatch(l, /向 Steward \/ 统筹与项目角色派发协调任务/);
  assert.doesNotMatch(l, /派给 Steward \/ 项目角色/);
  assert.doesNotMatch(l, /向项目角色派发协调任务/);
  // 能力矩阵不变：dispatchTask / handOffIntent 仍只给既有角色，不新增能力位或工具。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.filter((s) => s.capabilities.dispatchTask).map((s) => s.id),
    ["liaison", "convener"],
    "dispatch_task 仍只给 Lead（协调）与 Steward（项目派发）",
  );
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.filter((s) => s.capabilities.handOffIntent).map((s) => s.id),
    ["liaison"],
    "hand_off_intent 仍只给 Lead",
  );
  assert.deepEqual(
    Object.keys(governanceRoleOf("liaison")!.capabilities).sort(),
    [
      "customerInput",
      "dispatchTask",
      "handOffIntent",
      "installMcp",
      "installSkill",
      "proposeRecovery",
      "requestClarification",
      "roleStatus",
      "sessionTail",
      "shell",
    ].sort(),
    "治理协调不得新增能力位",
  );
});

test("2026-10-24 独立验收（所有变更，客户同日修订）：Steward 卡内置回交向 Lead 汇总、所有变更流程齐备后应用派 Proof、release 仅可选元数据、返工由 Lead 协调、不派治理角色", () => {
  const c = governanceRoleOf("convener")!.cardText;
  for (const needle of [
    "内置治理角色的状态 / 回交向 Lead / 主理 汇总",
    "返工由 Lead / 主理 协调",
    // 客户同日修订：撤销 release-only，独立验收覆盖所有变更（含非发布）。
    "所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收",
    "`release` 只是可选发布元数据",
    "`cardKind=schedule-write`",
    "flow 顶层 `release`",
    "缺省 / `false` 改为 `true`",
    "其余步骤与字段逐字不变",
    "其他字段或步骤变化仍按原校验拒绝",
    "Steward 不派发治理角色、不代替验收、不催办",
  ]) {
    assert.ok(c.includes(needle), `Steward 独立验收卡文本须含「${needle}」`);
  }
  // 旧「仅发布版本才派 Proof / 非发布不派 / 停在等待发布验收」口径必须消失。
  assert.doesNotMatch(c, /非发布不派/, "Steward 卡不得再写非发布不派");
  assert.doesNotMatch(c, /只有发布版本才由应用派/, "Steward 卡不得再写只有发布版本才派 Proof");
  assert.doesNotMatch(c, /停在等待发布验收/, "Steward 卡不得再写停在等待发布验收");
  // 五卡总则（单一来源）逐字包含内置汇报、主理只协调、应用门禁与所有变更独立验收。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    for (const needle of [
      "内置角色（Draft / 提案、Crew / 组队、Steward / 统筹、Proof / 验收）的状态与回交向主理（Lead / 主理）汇总",
      "主理只做治理协调，不批准提案、任命或验收",
      "应用仍负责门禁（闸门 0/1/2、验收门）与阶段流转",
      "**所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收**",
      "`release` 只是可选发布元数据，不是独立验收的启动条件",
    ]) {
      assert.ok(spec.cardText.includes(needle), `${spec.id} 卡标准工作流总则须含「${needle}」`);
    }
    // 旧发布独占口径不得残留（注释不算卡文本）。
    for (const legacy of ["非发布不派", "只有发布版本才由应用派", "发布验收门", "停在等待发布验收"]) {
      assert.ok(!spec.cardText.includes(legacy), `${spec.id} 卡不得再出现旧发布独占口径「${legacy}」`);
    }
  }
});

test("2026-10-24 P1-7：Steward/Lead 卡写明 dispatched→delivered 仅步骤 owner；manager 只核 delivered→done、worker 不能 done", () => {
  // 计划 P1-7：`dispatched → delivered` 收紧为仅步骤 owner（项目角色）标记；Steward/Lead 是 manager，
  // 不得代标 delivered，只能在 worker delivered 后核证 done 或标 failed/blocked；worker 不能 done。
  for (const id of ["convener", "liaison"] as const) {
    const t = governanceRoleOf(id)!.cardText;
    for (const needle of [
      "`dispatched → delivered` 只能由该步骤的 owner（项目角色",
      "不得代标 `delivered`",
      "只能在 owner 交付 `delivered` 后核证并标 `done`",
      "或标 `failed` / `blocked`",
      "worker 不能标 `done`",
    ]) {
      assert.ok(t.includes(needle), `${id} 卡须含 P1-7 步骤状态权限「${needle}」`);
    }
  }
  // 原有「Steward 可更新全部步骤」权限描述必须保留——例外只收紧 dispatched→delivered，
  // 不删除 done/failed/blocked 能力，也不缩小其他治理能力。
  const steward = governanceRoleOf("convener")!.cardText;
  assert.ok(
    steward.includes("Steward 可更新全部步骤，其他角色只能更新自己的步骤"),
    "Steward 卡须保留可更新全部步骤的原权限描述",
  );
  assert.ok(
    steward.includes("**例外：`dispatched → delivered` 只能由该步骤的 owner（项目角色）标记"),
    "Steward 卡须在权限描述处写明 delivered 例外",
  );
  assert.ok(steward.includes("`delivered → done`"), "Steward 仍可核证 delivered→done");
  assert.ok(steward.includes("或标 `failed` / `blocked`"), "Steward 仍可标 failed/blocked");
  // 五卡共享总则同步该规则（单一来源）；worker 卡既有的「不要自己标 done」不被放松。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.ok(spec.cardText.includes("worker 不能标 `done`"), `${spec.id} 卡总则须含 worker 不能 done`);
    assert.ok(spec.cardText.includes("不得代标 `delivered`"), `${spec.id} 卡总则须含 manager 不代标 delivered`);
  }
  for (const id of ["rapporteur", "nominator", "verifier"] as const) {
    assert.ok(governanceRoleOf(id)!.cardText.includes("不要自己标 `done`"), `${id} 仍不得自己标 done`);
  }
  // 能力矩阵零变化：P1-7 只改卡文本，不新增能力位。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.filter((s) => s.capabilities.dispatchTask).map((s) => s.id),
    ["liaison", "convener"],
    "dispatch_task 仍只给 Lead 与 Steward",
  );
});

// —————————————————————— 10) 2026-10-25 验收分诊：Proof 卡要求 acceptance-triage/v1 ——————————————————————

test("2026-10-25 验收分诊：Proof 卡要求验收报告含恰好一个 acceptance-triage/v1 段（三档结论 + 四档 severity + fail/conditional 必有 items + reason/action 必填）", () => {
  // 依据：`角色卡/项目管理/docs/design/2026-10-25_design_acceptance-triage.md` §4.2（schema）、
  // §4.3（严重度定义）、§4.4（缺结构退回 Proof、不猜）、§12.1（门禁引擎只改 verifier 卡文本）。
  // 分诊只在报告结构可解析时进行；卡文本必须让 Proof 知道缺段/坏段会被退回补报告。
  const v = governanceRoleOf("verifier")!.cardText;

  // 新段落与 schema：恰好一个 fenced YAML 段，逐字写 schema。
  assertCardIncludes(
    v,
    [
      "## 验收报告分诊结构（`acceptance-triage/v1`，必须）",
      "**恰好一个** fenced YAML 代码块",
      "多个候选段 ⇒ 整段 invalid",
      "schema: acceptance-triage/v1",
    ],
    "Proof 分诊段/schema",
  );

  // §4.2 字段：conclusion 三选一 + items 字段与可选指针。
  assertCardIncludes(
    v,
    [
      "`conclusion` 只能是 `pass` / `fail` / `conditional`",
      "`items` 每项必填 `id`（唯一）、`severity`、`owner`",
      "`targets` / `criteria` / `evidence` 是可选指针",
      "`pass` 允许空 items",
    ],
    "Proof 分诊字段",
  );

  // §4.3 严重度四档：四档齐全且定义逐条写死，不得自造档位。
  assertCardIncludes(
    v,
    [
      "严重度四档（照 §4.3 定义写，不得自造档位）",
      "- `blocker`：交付不可用 / 安全 / 数据损坏 / 验收标准的关键项未满足",
      "- `major`：关键功能或契约不满足，但可通过返工修复；不修复不能视为达标",
      "- `minor`：非关键缺陷 / 一致性问题，可后续修复",
      "- `nit`：风格 / 措辞 / 个人偏好，不影响验收结论",
    ],
    "Proof 四档 severity",
  );

  // fail / conditional 必须有 items；reason（为什么不通过）与 action（改进方案）必填，
  // action 需带 targets 或 criteria 指针（只有 evidence 不算改进方案指针）。
  assertCardIncludes(
    v,
    [
      "`fail` / `conditional` 必须至少有一个 item",
      "`reason`（为什么不通过，非空）",
      "`action`（改进方案，非空，并给出 `targets` 文件 / 模块指针或 `criteria` 验收标准指针）",
      "`targets` / `criteria` / `evidence` 是可选指针，不能替代 `action`",
    ],
    "Proof fail/conditional 与 reason/action",
  );

  // 报告写得漂亮不能掩盖 blocker；pass 不得残留 blocker/major（R5 矛盾 ⇒ invalid）。
  assertCardIncludes(
    v,
    [
      "报告写得漂亮不能掩盖 blocker",
      "`pass` 不得残留 `blocker` / `major` 项",
      "不读文风",
    ],
    "Proof 结论纪律",
  );

  // §4.4 缺结构 / 坏结构 / 旧 rework 段：应用退回 Proof 补报告，不进入分诊。
  assertCardIncludes(
    v,
    [
      "或只有旧 `acceptance-rework/v1` 段时",
      "退回 Proof 补报告",
      "**不进入分诊、不弹客户卡、不写返工路由**",
      "补齐 `acceptance-triage/v1` 段后重新发卡",
    ],
    "Proof 缺结构退回",
  );

  // 分诊段不改变验收权与既有验收卡：选项仍 accept/reject，首行五项要求不变。
  assertCardIncludes(
    v,
    [
      "验收卡选项仍固定为 `accept` / `reject`",
      "分诊段不改变验收权、客户决定权与既有首行五项要求",
    ],
    "Proof 验收卡不变",
  );

  // 质量职责段同步该要求（不只藏在工作流步骤里）。
  assert.match(
    v,
    /你的质量职责（Proof \/ 验收）：[\s\S]*acceptance-triage\/v1[\s\S]*报告写得漂亮不能掩盖 blocker/,
    "Proof 质量职责须同步分诊结构要求",
  );

  // 能力位零变化：分诊要求只改卡文本，不新增工具/能力。
  const spec = governanceRoleOf("verifier")!;
  assert.deepEqual(spec.preauthorizedDirs, [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  assert.equal(spec.capabilities.dispatchTask, false, "Proof 仍不可派发");
  assert.equal(spec.capabilities.shell, "operator-approve", "Proof 仍为 shell 审批档");
});

// —————————————————————— 11) 2026-10-25 写入预授权：边界内直接写、确认仅限治理敏感 ——————————————————————

test("2026-10-25 写入预授权：五卡写明 Section 1 边界内直接写、不逐次 request_confirmation；确认只保留给治理敏感写入与客户决定", () => {
  // 客户新规则原文：「写自己角色权限内的路径，直接放行。」——边界内写入预授权、直接写；
  // 写权上界仍由 WriteGate 判定（边界外照旧拒绝）；request_confirmation 只保留给治理敏感写入
  // （角色卡/边界、共享目录或他人写集、流程 YAML/账本、发布/变更包等按既有规则）与客户决定。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    // 单一来源常量逐字复用（恰出现一次），不各卡手写分叉。
    assert.ok(t.includes(BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE), `${spec.id} 卡须逐字包含写入预授权总则`);
    assert.equal(
      t.split(BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE).length - 1,
      1,
      `${spec.id} 写入预授权总则须恰出现一次`,
    );
    assertCardIncludes(
      t,
      [
        "Section 1 边界内的写入是预授权的",
        "直接用 `write_file` / `edit_file` 写入",
        "不需要逐次发 `request_confirmation` 写卡",
        "写权上界仍由 WriteGate 的边界判定保证（边界外照旧拒绝）",
        "`request_confirmation` 只保留给治理敏感写入与需要客户决定的动作",
        "角色卡 / 边界变更",
        "共享 i18n 等共享目录或他人写集",
        "`docs/flows/**` 流程 YAML / 治理账本",
        "发布 / 变更包等按既有禁止与审批规则处理",
        "不得把边界内预授权扩展到边界外或他人写集",
        "不得削弱边界外拒绝、禁写路径与治理写入审批等既有规则",
      ],
      `${spec.id} 写入预授权总则`,
    );
    // 旧「一切写盘都要先确认」总口径必须消失（不得让预授权与逐次确认并存互相矛盾）。
    assert.doesNotMatch(
      t,
      /写文件仍优先用 write_file 并经写盘确认|写盘（write_file \/ edit_file 等）一律先经/,
      `${spec.id} 不得残留「一切写盘逐次确认」旧口径`,
    );
    // 既有安全纪律不因新规则削弱：禁写路径、应用独占写路径与确认卡参数纪律仍在。
    assertCardIncludes(
      t,
      ["禁写路径", ".ans/**", "只能由应用写", "必须带 `flowId` + `cardKind`"],
      `${spec.id} 既有禁写/参数纪律保留`,
    );
  }

  // 各卡按真实治理敏感场景保留确认（不把预授权扩到治理写入）：
  const liaison = governanceRoleOf("liaison")!.cardText;
  assert.match(liaison, /不使用 `request_confirmation` 做治理写盘/, "Lead 仍不做治理写盘确认");
  assert.match(liaison, /意图文件属 Section 1 内预授权/, "Lead 意图文件直接写");

  const rapporteur = governanceRoleOf("rapporteur")!.cardText;
  assert.match(rapporteur, /提案 \/ 契约 \/ 治理记录直接写、不逐次确认/, "Draft 提案区直接写");
  assert.match(rapporteur, /提案卡是客户对方案的决定，不是写盘确认/, "提案卡是客户决定，不是写盘确认");
  assert.match(rapporteur, /只用 `proposal`/, "Draft 仍只出 proposal 选择卡");

  const nominator = governanceRoleOf("nominator")!.cardText;
  assert.match(nominator, /角色卡 \/ 边界属治理敏感写入，按既有规则仍逐路径确认/, "Crew 角色卡/边界仍确认");
  assert.match(
    nominator,
    /写任何项目角色卡 \/ 边界（治理敏感写入）都必须按 `appointment-write` 逐路径取得客户确认/,
    "Crew appointment-write 保留",
  );
  assert.match(
    nominator,
    /写入预授权落卡纪律（必须，客户 2026-10-25 新规则）/,
    "Crew 卡须给生成角色卡的预授权落卡纪律",
  );
  assertCardIncludes(
    nominator,
    [
      "今后生成的项目角色卡，「执行原则」必须写明",
      "该角色 Section 1 边界内的写入是**预授权**",
      "不逐次** `request_confirmation`",
      "不得把生成的卡写成「每次写盘前都要请求确认」",
      "不得把预授权写成边界外或他人写集",
    ],
    "Crew 生成角色卡的写入预授权指引",
  );
  // 预授权不绕过 appointment-write：declined 与校验失败纪律逐字保留。
  assert.match(nominator, /不得绕过确认或直接写盘/, "Crew 仍不得绕过 appointment-write 确认");
  assert.match(nominator, /不得绕过校验、不得直接 `write_file`/, "Crew 仍不得绕过校验直接写");

  const convener = governanceRoleOf("convener")!.cardText;
  assert.match(
    convener,
    /流程 YAML \*\*初始创建\*\*仍按 `schedule-write` 确认（治理敏感写入）/,
    "Steward 流程 YAML 初始创建仍 schedule-write",
  );
  assert.match(
    convener,
    /团队计划 \/ readiness 与治理记录属 Section 1 内预授权，直接写、不逐次确认/,
    "Steward 排程内容直接写",
  );
  assert.match(convener, /不得绕过确认、不得直接 `write_file` 流程 YAML/, "Steward declined 后仍须重发确认卡");

  const verifier = governanceRoleOf("verifier")!.cardText;
  assert.match(
    verifier,
    /验收标准 \/ 报告与证据附件在你的 Section 1 内，属预授权——直接写、不逐次确认/,
    "Proof 验收产物直接写",
  );
  assert.match(
    verifier,
    /`request_confirmation` 仅用于治理敏感写入或需要客户决定的动作/,
    "Proof 确认仅限治理敏感/客户决定",
  );
  assert.match(
    verifier,
    /每次 `request_confirmation` 必须带 `flowId` \+ `cardKind`（只用 `write`）/,
    "Proof 确认卡参数纪律保留",
  );

  // 注册表数据面（预授权目录 / 能力位）零变化：本批只改卡文本。
  const expectedPreauthorized: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.preauthorizedDirs, expectedPreauthorized[spec.id], `${spec.id} 预授权目录零变化`);
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} shell 档零变化`);
  }
});

// —————————————————————— 12) 2026-10-26 独立验收主动提交（request_acceptance） ——————————————————————

test("2026-10-26 完成即主动 request_acceptance：Steward 卡在交付/证据齐备后主动提交独立复核，回执如实处理、不等于验收通过", () => {
  // 应用已提供 `request_acceptance`（交付就绪后由统筹直接提交；应用校验验收标准/变更包/风险档并把
  // acceptance-criteria 收口后派 Proof，60s 有界超时）。本批只改 Convener 卡文本：把「完成即主动提交」
  // 固化为标准流程，防止仍等应用事件 / 客户催办 / 主理转达。
  const c = governanceRoleOf("convener")!.cardText;

  // 1) 完成即主动提交：前置条件（交付 done / verification-evidence / change-package 含 riskTier / 验收标准）
  //    与调用形状必须写死。
  assertCardIncludes(
    c,
    [
      "## 完成即主动 request_acceptance（独立复核提交，必须）",
      "全部实现/交付步骤都已核证 `done`",
      "`verification-evidence`（真实启动/演示证据）",
      "change-package（`docs/scheduling/<flowId>-change-vN.md`，含 `riskTier`）",
      "验收标准（`docs/acceptance/<flowId>-criteria-vN.md`）存在",
      "**主动调用 `request_acceptance({flowId})`**",
      "不得等待应用事件（settle / 回交 / 账本）、客户催办或主理转达",
      "不得以「应用会自动派」为由省略主动提交",
      "request_acceptance 是统筹的主动通道",
      // 标准工作流第 9 步与专属章节同口径（不只藏在一处）。
      "9. 独立验收（所有变更）",
      "**完成即主动提交**",
    ],
    "Steward 完成即主动 request_acceptance",
  );

  // 2) 时机与边界：不提前、不替 Proof 判定、不写客户决定；分诊由应用执行。
  assertCardIncludes(
    c,
    [
      "只在交付与证据齐备后提交——不得提前提交",
      "不得用提交代替缺步骤/缺证据",
      "提交 ≠ 验收通过",
      "不得替 Proof / 验收判定",
      "不得写客户决定",
      "不得把 flow / 账本状态当客户批准",
      "`acceptance-triage/v1`",
      "`blocker` / `major` 由应用按返工路由退回",
      "`minor` / `nit` 仅汇报",
      "你不改判验收结论、不自行宣告通过",
    ],
    "Steward request_acceptance 时机与边界",
  );

  // 3) 回执处理：dispatched 只是「已提交」不等于通过；already-dispatched 不重复提交；
  //    各类缺口按回执如实报告并修正，不得伪造/绕过/当成功；不可用/超时可能已派发，用 flow_get 核对。
  assertCardIncludes(
    c,
    [
      "回执处理（必须如实，不得伪造 / 绕过 / 当成功）",
      "`dispatched`：如实记录 / 汇报「已提交独立复核」——**不等于验收通过**",
      "也不代表客户批准",
      "`already-dispatched`：不重复提交",
      "已有在途复核",
      "`criteria-missing` / `change-package-missing` / `change-package-no-risk` / `flow-incomplete` / `flow-not-found` / `runtime-unresolved`",
      "按回执 `code` / `message` 如实报告并修正对应缺口",
      "验收标准缺失交 Proof / 验收 按标准流程补写",
      "变更包或 `riskTier` 缺失按变更包规则补齐",
      "流程 / 证据缺口按 `flow_step_update` 与返工规则修正",
      "`flowId` 错误用正确 `flowId` 重交",
      "引擎无法解析如实报告并按应用提示处理",
      "不得把失败当成功",
      "不得伪造验收标准 / 变更包 / 流程状态",
      "不得绕过应用校验",
      "工具不可用 / 超时（`unavailable` 或回执称可能已派发）",
      "**可能已派发、以应用核对为准**",
      "用 `flow_get` 核对流程与派发记录",
      "不谎报已派发，不盲目重复请求",
    ],
    "Steward request_acceptance 回执处理",
  );

  // 4) 与自动验收门的关系：主动通道 + 应用自动门并存且幂等，already-dispatched 不重复派发。
  assertCardIncludes(
    c,
    [
      "request_acceptance 是统筹的主动通道",
      "应用自动验收门（settle / 回交 / 账本等事件）仍可触发",
      "二者**幂等**",
      "已有在途 / 已派发记录时应用返回 `already-dispatched`、不重复派发",
      "不要为「确保验收」反复重试",
      "也不要因自动门存在而省略主动提交",
    ],
    "Steward request_acceptance 与自动验收门",
  );

  // 5) 不弱化既有验收口径：应用自动门（所有变更，含非发布）逐字保留。
  assertCardIncludes(
    c,
    [
      "所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收",
      "Steward 不派发治理角色、不代替验收、不催办",
      "`release` 只是可选发布元数据，不是独立验收的启动条件",
    ],
    "Steward request_acceptance 不弱化自动验收门",
  );

  // 6) 提交通道只归 Steward / 统筹（其余四卡不得另行定义，避免第二份口径）。
  for (const id of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
    assert.equal(
      governanceRoleOf(id)!.cardText.includes("request_acceptance"),
      false,
      `${id} 卡不得定义 request_acceptance 提交通道`,
    );
  }

  // 7) 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.forbiddenWritePaths, [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
  ]);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");
});

// —————————————————————— 13) 2026-10-26 边界变更请求（request_boundary_change） ——————————————————————

test("2026-10-26 边界变更请求：Steward 卡在写集/边界不足时调用 request_boundary_change，提交精确增删路径与理由，不得 dispatch_task 派组队、不得自改卡", () => {
  // 运行时核心新增统筹专用工具 `request_boundary_change({roleId, addPaths?, removePaths?, rationale,
  // flowId?})`，由应用负责把任务派给 Crew / 组队。真机缺口（castle `tsconfig.node.json`）：项目角色
  // 写集/边界不足时，治理角色之间禁止 dispatch，统筹必须走专用通道而不是直接派 Crew。
  const c = governanceRoleOf("convener")!.cardText;

  // 1) 使用时机与调用形状：项目角色报告或统筹核证发现缺口；精确增删路径、理由与 flowId 必须写死。
  assertCardIncludes(
    c,
    [
      "## 边界变更请求（request_boundary_change，必须）",
      "项目角色报告写集 / 边界不足",
      "核证 / readiness / 派发前检查",
      "边界覆盖不了任务所需路径",
      "request_boundary_change({ roleId, addPaths?, removePaths?, rationale, flowId? })",
      "**精确的项目相对路径 / 目录条目**",
      "目录以 `/` 结尾",
      "不得通配、`..`、绝对路径或散文",
      "只列这次缺口真正需要的增删",
      "不顺手扩大其它路径",
      "`rationale`：为什么现有写集不够",
      "`flowId`：关联到产生缺口的流程",
      // 标准工作流第 5 步与「角色卡归属」段同口径（不只藏在一处）。
      "5. 派发项目角色",
      "按「边界变更请求（request_boundary_change，必须）」一节处理",
      "角色卡归属",
    ],
    "Steward request_boundary_change 使用时机与调用形状",
  );

  // 2) 明确禁止：不得用 dispatch_task 派 Crew（治理角色不可被派发，必然被拒），不得自己改角色卡/边界。
  assertCardIncludes(
    c,
    [
      "不得用 `dispatch_task` 直接派 Crew / 组队",
      "内置治理角色不可被派发，必然被拒",
      "不得自己改角色卡 / 边界",
      "`角色卡/**` 是你的禁写路径",
    ],
    "Steward 不得 dispatch_task 派组队 / 不得自改卡",
  );

  // 3) 回执处理：dispatched 等待不重提；already-dispatched 有在途；rejected 是应用门禁退回
  //    （未派发、不自动放行、不是客户拒绝，按 message 区分内容被拒与门禁不可用/超时）；
  //    invalid-* / no-change 修正后重交；unavailable 如实报告不绕过。
  assertCardIncludes(
    c,
    [
      "回执处理（必须如实，不得绕过）",
      "`dispatched`：请求已由应用派给组队",
      "等待 Crew 完成边界变更并回执",
      "不重复提交",
      "`already-dispatched`：已有在途变更",
      "`rejected`：中间 AI 门禁或确定性校验拒绝 / 不确定",
      "**未派发组队、不自动放行、不代表客户拒绝**",
      "按 `message` 区分「内容被拒」（终态：修正请求内容后重新提交）",
      "「门禁不可用 / 超时」（可修复后重试）",
      "不得对同一 ticket / 同一请求原样重复提交、反复试探",
      "`invalid-role` / `invalid-path` / `no-change`",
      "按回执 `code` / `message` 修正**具体的角色或路径**后重交",
      "不得原样死循环重试",
      "`unavailable`：如实报告",
      "不绕过",
      "不得改用 `dispatch_task` 派 Crew",
      "不得让实现角色先写边界外路径",
    ],
    "Steward request_boundary_change 回执处理",
  );

  // 4) 确认与门禁：只有 Crew 经 appointment-write 与客户/判断确认落地；请求不等于批准；
  //    变更未完成前不得派实现写入该路径。
  assertCardIncludes(
    c,
    [
      "边界变更只能由 Crew / 组队经 `appointment-write` 与客户 / 判断 agent 的确认卡落地",
      "**你的请求不等于客户批准**",
      "也不解锁任何写权",
      "变更完成（Crew 回执 + 应用校验通过）前，**不得派任何实现写入该路径**",
    ],
    "Steward request_boundary_change 确认与门禁",
  );

  // 5) 通道只归 Steward / 统筹：其余卡不得另行定义 request_boundary_change（Crew 只接收应用派发的任务）。
  for (const id of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
    assert.equal(
      governanceRoleOf(id)!.cardText.includes("request_boundary_change"),
      false,
      `${id} 卡不得定义 request_boundary_change 通道`,
    );
  }

  // 6) 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.forbiddenWritePaths, [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
  ]);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");
});

// —————————————————————— 14) 2026-10-26 证据完整性与 gate 协调（不做实质性复核） ——————————————————————

test("2026-10-26 证据完整性与 gate 协调：Steward 只查 gate 步骤/证据/路径齐备，质量只由 Proof gate 复核判，不自审、不代替验收", () => {
  // 客户口径更新：既然关键节点都有 Proof 门禁独立验收，统筹不再做实质性独立复核（重复且越权）。
  // 本批把「独立复核时机」改写为「证据完整性与 gate 协调」：只查齐备性，不对画面/实现质量下结论。
  const c = governanceRoleOf("convener")!.cardText;

  // 1) 新章节与总口径：不再做实质性独立复核；只做证据完整性检查与 gate 协调；不判断质量；
  //    不能只看状态/账本；证据缺失不得当 done。
  assertCardIncludes(
    c,
    [
      "## 证据完整性与 gate 协调（必须）",
      "统筹**不再做实质性独立复核**（重复且越权）",
      "只做**证据完整性检查与 gate 协调**",
      "不对画面 / 实现质量下结论",
      "质量判断只由 Proof 的 gate 复核做",
      "不能只看步骤状态 / 账本",
      "证据缺失不得当 `done`",
      "退回补证",
    ],
    "Steward 证据完整性与 gate 协调总口径",
  );

  // 2) 脚手架后：只查证据是否齐（日志/启动记录），不判断质量；缺失退回补证，不派实现。
  assertCardIncludes(
    c,
    [
      "1. **脚手架后**",
      "检查证据是否齐",
      "安装 / `npm run typecheck` / 最小测试日志",
      "应用能启动的记录",
      "**不判断质量**",
      "证据缺失退回补证，不派实现",
    ],
    "Steward 脚手架证据完整性检查",
  );

  // 3) 首个垂直切片 / 每个 delivery / 派下游前：只查 gate 步骤存在/done、证据清单与路径有效；
  //    不对画面/实现质量下结论。
  assertCardIncludes(
    c,
    [
      "2. **首个垂直切片 / 每个 delivery / 派下游前**",
      "gate 步骤是否存在、是否 `done`",
      "证据清单（关 DEBUG 截图 / 运行输出 / 测试报告 / 性能数据）",
      "路径是否有效",
      "不对画面 / 实现质量下结论",
      "gate 未 `done` 不派下游",
    ],
    "Steward gate 证据完整性检查",
  );

  // 4) 最终验收仍由 Proof/客户；UI/游戏派发只核对证据齐备与 gate done，质量由 Proof 判；
  //    记录不伪造 done、不自查代替 Proof。
  assertCardIncludes(
    c,
    [
      "3. **最终验收**",
      "仍由 Proof / 客户决定",
      "最终验收用 `request_acceptance`",
      "不代替 Proof、不写客户决定",
      "**UI / 游戏 / 视觉类派发（必须）**",
      "`dispatch_task` 任务文本必须要求交付附「真实运行截图 / 录屏（关 DEBUG）+ 验收标准指针 + 关 DEBUG 说明」",
      "派发下游前只核对证据是否齐备与 gate 是否 `done`",
      "画面 / 实现质量由 Proof 的 gate 复核判定",
      "不得自查代替 Proof",
      "不得伪造 `done` 证据",
      "不得把检查写成客户批准或验收通过",
      "6. 收齐回交",
      "核对按「证据完整性与 gate 协调（必须）」执行",
      "标 `done` 前必须完成「证据完整性与 gate 协调（必须）」的证据清单核对",
    ],
    "Steward 最终验收、派发与记录",
  );

  // 5) 反向断言：实质性复核口径必须消失（不再由统筹亲自判断质量/立即退回/不等 Proof）。
  for (const legacy of [
    "## 独立复核时机（必须）",
    "亲自看产物与证据",
    "亲自核对画面 / 输出是否符合验收标准",
    "不符合立即退回返工",
    "不合格立即退回返工",
    "复核只做判断与退回",
    "不等 Proof",
    "复核太晚",
    "统筹本来就有独立复核职责",
    "视为复核失职",
    "DOM / CLI 输出与验收标准逐条对照",
    "确认真实可玩 / 可用",
  ]) {
    assert.equal(c.includes(legacy), false, `Steward 卡不得保留实质性复核措辞「${legacy}」`);
  }

  // 6) 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");
});

// —————————————————————— 15) 2026-10-26 Gate 规划（只给规则，不实现新工具） ——————————————————————

test("2026-10-26 Gate 规划：Steward 卡含适用矩阵/必填模板/game 示例/失败返工，Proof 独判、统筹不自审，不新增工具/schema", () => {
  // 客户口径：只给规则，不实现 request_gate_review / gateKind / 账本 / 新工具；客户可能做其他业务，
  // 统筹只需在规划时知道哪些地方要设 gate。本批只改 Convener 卡文本 + 测试。
  const c = governanceRoleOf("convener")!.cardText;

  // 1) 四个固定 gate 节点 + 适用矩阵（原型档 / 生产档 × 产品类型 / T0 纯文档），不得默默省略。
  assertCardIncludes(
    c,
    [
      "## Gate 规划（规则，必须）",
      "四个固定 gate 节点：**垂直切片、视觉基线、集成 / 性能、最终客户验收**",
      "**适用矩阵（按风险档 × 产品类型启用；不得默默省略）**",
      "| 风险档 / 产品类型 | 垂直切片 | 视觉基线 | 集成 / 性能 | 最终客户验收 |",
      "| 原型档（任意产品） | 必设 | 仅 UI / 游戏设 | 仅多模块 / 多端设 | 必设 |",
      "| 生产档 · UI / 游戏 | 必设 | 必设 | 必设 | 必设 |",
      "| 生产档 · CLI / 后端 | 必设 | 不设（写明理由） | 必设 | 必设 |",
      "| 生产档 · 纯库 | 不设（写明理由） | 不设（写明理由） | 必设 | 必设 |",
      "| T0 / 纯文档 | 可不设 | 可不设 | 可不设 | 只保留最终验收，或**显式说明不设额外 gate 并写理由** |",
      "不得默默省略",
    ],
    "Steward Gate 适用矩阵",
  );

  // 2) 四类 gate 的证据口径。
  assertCardIncludes(
    c,
    [
      "**垂直切片 gate**＝脚手架后的首个可玩 / 可用切片",
      "真实素材、真实运行、关 DEBUG 截图 / 输出",
      "**视觉基线 gate**＝UI / 游戏每个关卡 / 关键页面（含每关 / Boss）的 golden 截图与像素规格 / 比例 / 图层基线",
      "**集成与性能 gate**＝全量测试、e2e、性能采样与阈值",
      "**最终客户验收**＝沿用现有 `verification` / `acceptance`",
      "语义不变",
    ],
    "Steward Gate 类型与证据口径",
  );

  // 3) 每个 gate 的必填模板字段：gate id / 验收标准指针 / 证据清单 / 负责人 / 独立判定 = Proof / dependsOn。
  assertCardIncludes(
    c,
    [
      "**每个 gate 的模板（必须字段）**",
      "`gate id`：固定语义 id，如 `gate-vertical-slice`、`gate-visual-level-01`、`gate-integration`、`gate-final-acceptance`",
      "`验收标准指针`：指向验收标准 / 提案 / 计划中的可核对条目",
      "`证据清单`：截图 / 运行输出 / 测试报告 / 性能数据（UI / 游戏注明关 DEBUG）",
      "`负责人`：证据产出的 owner（项目角色），不是 Proof",
      "`独立判定`：Proof / 验收",
      "`下游 dependsOn`：依赖该 gate 的步骤 id 列表",
      "gate 未 `done` 下游不得派发（沿用现有 `dependsOn` 门禁，不新增检查）",
    ],
    "Steward Gate 模板字段",
  );

  // 4) game 项目示例：垂直切片在脚手架后、每关/Boss 视觉基线、集成/性能、最终验收。
  assertCardIncludes(
    c,
    [
      "**game 项目示例（计划里照此落 gate）**",
      "`gate-vertical-slice`（脚手架后首个可玩切片",
      "每关 / Boss 各一个 `gate-visual-level-01`",
      "`gate-integration`（集成 / e2e / 性能采样",
      "`gate-final-acceptance`（最终客户验收",
      "dependsOn=[gate-integration]",
    ],
    "Steward Gate game 示例",
  );

  // 5) 失败与返工：走现有返工路由、返工后重新复核、未 done 不派下游、不得用后续验收补跳。
  assertCardIncludes(
    c,
    [
      "**失败与返工**",
      "gate `fail` 必须走现有返工路由",
      "`flow_step_supersede` / 退回 owner 返工",
      "返工完成后**重新复核该 gate**",
      "不得直接标记通过",
      "gate 未 `done` 下游不得派发",
      "不允许用「后续验收再补」跳过 gate",
    ],
    "Steward Gate 失败与返工",
  );

  // 6) 独立判断只由 Proof/验收做；统筹只查证据齐备、走现有通道；提前 gate 无通道时如实上报，不自审。
  assertCardIncludes(
    c,
    [
      "**独立判断只由 Proof / 验收做**",
      "只检查证据是否齐备",
      "按现有应用通道提交复核",
      "最终验收用 `request_acceptance`",
      "提前 gate 若当前没有通道",
      "**如实上报 Lead / 主理 与客户**",
      "不得自查代替",
      "不得自己标 gate 通过",
      "不得把自查写成 Proof 结论",
      "按「Gate 规划（规则，必须）」用现有步骤表达所需 gate",
      "按「Gate 规划（规则，必须）」识别并按产品类型 / 风险写清每个 gate",
    ],
    "Steward Gate 独立判断与工作流指针",
  );

  // 7) 不实现新工具/schema：无新 FlowStepKind、无 request_gate_review/gateKind、无账本 kind、不引入图 schema。
  assertCardIncludes(
    c,
    [
      "**不新增 `FlowStepKind` / 工具 / 账本 kind**",
      "不引入 `request_gate_review`、`gateKind`",
      "gate 用现有步骤表达（如 `artifact` / `acceptance`）",
      "不改变现有验收语义",
      "不为 gate 引入图 schema",
    ],
    "Steward Gate 无新工具/schema",
  );

  // 8) 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");
});
